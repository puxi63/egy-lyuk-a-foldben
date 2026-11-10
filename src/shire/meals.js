/* ==== shire/meals.js — the seven meals' rhythm (TERV 0.11/15): "ha az étkezések idején eszel, „jóllakott” állapot
   erősít; ha kihagysz egyet, morcos leszel (kicsit lassabb)". Per player (co-op: each for himself), on the shared day
   clock (daynight.js). ====
 * - Seven meal windows by the clock (MEAL_WINDOWS, the names are ui/art.js MEALS); 22:30–06:30 is the night, no meal.
 * - Eating = the plate rises by EAT_MIN or more in one frame, from any source (the counter's food, the pantry, the
 *   kitchen, the plate game, the feasts, a snack from the bag), so no food source needs a hook. A respawn does not count.
 * - On time (eaten inside a window) → "jóllakott" until the end of the NEXT window: digging is a little faster
 *   (digMult). It also clears "morcos".
 * - A window that ends with no meal eaten in it (and the plate under FULL) → "morcos" until the next meal eaten on time:
 *   walking and digging are a little slower. Windows jumped over by the bed (the clock moves on more than a few minutes
 *   in one frame) are not judged, and nor is a player still choosing his character.
 * - Snacks: from the middle of a window with no meal yet (plate under FULL), the hobbit eats one snack from his bag
 *   (SNACKS: a garden tomato, the neighbour's apple pie, a raw mushroom) and that counts as on time — so a deep trip
 *   can keep the rhythm. Potatoes are not snacks (the Bag End kitchen cooks them).
 * - NOTES-35-lift-doors-bag: any BAG_FOOD (the snacks and a raw potato) can be eaten by hand from the bag screen
 *   (eatFromBag); inside a meal window that is the meal.
 * - The HUD reads `p.mealClock` ({ idx, now, turn, mood }) and `p.mealK` (player.js walk multiplier). */
import { MEALS } from '../ui/art.js';

/** [from, to) game hours of each meal (Reggeli … Késői vacsora). Contiguous from 06:30 to 22:30. */
export const MEAL_WINDOWS = [[6.5, 8.5], [8.5, 10.5], [10.5, 12.5], [12.5, 15], [15, 17.5], [17.5, 20], [20, 22.5]];

export const MEAL = {
  eatMin: 4, // a rise of the plate this big in one frame is a meal
  full: 0.85, // plate fraction: a window ending with the plate this full is not "skipped" (there was no room to eat)
  fedDig: 0.92, // jóllakott: dig cooldown ×
  grumpyDig: 1.1, // morcos: dig cooldown ×
  grumpyWalk: 0.92, // morcos: walk speed ×
  jump: 120, // clock seconds in one frame that count as a jump (the bed): the skipped windows are not judged
};

/** Snacks eaten from the bag at meal time: find id → plate. */
export const SNACKS = { paradicsom: 8, almaspite: 15, gomba: 5 };

/**
 * NOTES-35-lift-doors-bag: food a player can eat from the bag by hand (the bag screen's "Megeszem"): find id → plate.
 * The snacks as they are, plus the raw potato, a small fill (the kitchen's cooked potato gives 9 or more, bagend/effects.js
 * COOKABLE, so cooking stays the better use).
 */
export const BAG_FOOD = { ...SNACKS, krumpli: 4 };

/** The window index at game hour h, or −1 at night. */
export function windowAt(h) {
  for (let i = 0; i < MEAL_WINDOWS.length; i++) if (h >= MEAL_WINDOWS[i][0] && h < MEAL_WINDOWS[i][1]) return i;
  return -1;
}

const N = MEAL_WINDOWS.length;

export class Meals {
  constructor(shire) {
    this.shire = shire;
    this.game = shire.game;
    /** Per slot: { ate: window key last eaten in, fed: jóllakott through this key, grumpy, snack: key a snack was tried } */
    this.st = [this.blank(), this.blank()];
    this.lastKey = null;
    this.lastClock = null;
    this.prev = new Map(); // player → { h: hunger last frame, dead }
  }

  blank() {
    return { ate: -1, fed: -1, grumpy: false, snack: -1 };
  }

  /** A sequential window key: day × 7 + index (the last window of a day + 1 = the next day's breakfast). */
  static key(day, idx) {
    return day * N + idx;
  }

  /** The window now: { idx (−1 at night), key (−1 at night), ref (the current or, at night, the last window's key), t (0..1 through it) }. */
  now() {
    const dc = this.game.dayClock;
    const h = dc ? dc.hour() : 12;
    const d = dc ? dc.day() : 1;
    const idx = windowAt(h);
    if (idx >= 0) {
      const [a, b] = MEAL_WINDOWS[idx];
      return { idx, key: Meals.key(d, idx), ref: Meals.key(d, idx), t: (h - a) / (b - a), h };
    }
    // Night: after late supper (same day) or before breakfast (the day turned at 05:00: yesterday's late supper).
    const ref = h >= MEAL_WINDOWS[N - 1][1] ? Meals.key(d, N - 1) : Meals.key(d, 0) - 1;
    return { idx: -1, key: -1, ref, t: 0, h };
  }

  stOf(p) {
    const i = this.game.players.indexOf(p);
    return i >= 0 ? this.st[i] : null;
  }

  fed(p, w = this.now()) {
    const s = this.stOf(p);
    if (!s) return false;
    if (s.fed >= w.ref && s.fed >= 0) return true;
    // Bag End's cooked meal ("jóllaktál", bagend/effects.js fed) shows as jóllakott too.
    return (this.game.bagEnd?.effects?.fed?.get(p) || 0) > 0;
  }

  grumpy(p) {
    return !!this.stOf(p)?.grumpy;
  }

  /** player.js tryDig: cooldown multiplier. */
  digMult(p) {
    const s = this.stOf(p);
    if (!s || !this.shire.enabled) return 1;
    if (s.grumpy) return MEAL.grumpyDig;
    return s.fed >= this.now().ref && s.fed >= 0 ? MEAL.fedDig : 1;
  }

  plateFrac(p) {
    const max = this.game.bagEnd?.effects?.hungerMax ?? 100;
    return Math.max(0, Math.min(1, p.hunger / max));
  }

  /** A meal was eaten (the plate rose). */
  ate(p, w) {
    const s = this.stOf(p);
    if (!s || w.key < 0) return;
    const first = s.ate !== w.key;
    s.ate = w.key;
    s.fed = w.key + 1;
    if (s.grumpy) {
      s.grumpy = false;
      p.say(`${MEALS[w.idx]} idején ettél: elmúlt a morcosság, jóllakott vagy.`, 3.5);
    } else if (first) p.say(`${MEALS[w.idx]} idején ettél: jóllakott vagy.`, 2.5);
  }

  /** Eats one snack from the bag; returns true if there was one. */
  snack(p, w) {
    for (const id of Object.keys(SNACKS)) {
      const k = p.bag.findIndex((f) => f && f.id === id);
      if (k < 0) continue;
      const f = p.bag[k];
      p.bag.splice(k, 1);
      const max = this.game.bagEnd?.effects?.hungerMax ?? 100;
      p.hunger = Math.min(max, p.hunger + SNACKS[id]);
      this.prev.set(p, { h: p.hunger, dead: p.dead > 0 });
      p.say(`${MEALS[w.idx]}: elővetted a zsákodból (${f.name}).`, 3);
      this.ate(p, w);
      return true;
    }
    return false;
  }

  /**
   * NOTES-35-lift-doors-bag: p eats one `id` from his bag by hand (the bag screen). The plate rises by BAG_FOOD[id];
   * inside a meal window it counts as that meal (as an on-time snack does). Returns { ok, text }: the line to show.
   */
  eatFromBag(p, id) {
    const fill = BAG_FOOD[id];
    const k = fill ? p.bag.findIndex((f) => f && f.id === id) : -1;
    if (k < 0) return { ok: false, text: 'Ez nem ehető.' };
    if (p.dead > 0 || p.choosing) return { ok: false, text: 'Most nem tudsz enni.' };
    const max = this.game.bagEnd?.effects?.hungerMax ?? 100;
    if (p.hunger >= max - 0.5) return { ok: false, text: 'Tele a tányér: most egy falat sem fér beléd.' };
    const f = p.bag[k];
    p.bag.splice(k, 1);
    p.hunger = Math.min(max, p.hunger + fill);
    // The frame's rise is this meal: the plate watcher must not count it a second time.
    this.prev.set(p, { h: p.hunger, dead: false });
    p.say(`Megetted: ${f.name} (+${fill} a tányérra).`, 3);
    // Inside a meal window: that meal is eaten (ate() adds its own "jóllakott" line).
    const w = this.now();
    if (w.key >= 0) this.ate(p, w);
    return { ok: true, text: `Megetted: ${f.name} (+${fill} a tányérra).` };
  }

  /** Judges the window `key` that just ended, for every player. */
  judge(key) {
    const idx = ((key % N) + N) % N;
    this.game.players.forEach((p, i) => {
      if (p.choosing) return;
      const s = this.st[i];
      if (s.ate === key || this.plateFrac(p) >= MEAL.full) return;
      if (!s.grumpy) {
        s.grumpy = true;
        p.say(`Kihagytad: ${MEALS[idx]}. Morcos vagy (kicsit lassabb), amíg időben nem eszel.`, 4);
        this.shire.hint(p, 'morcos', 'Morcos vagy, mert kihagytál egy étkezést. A tányér melletti kis óra mutatja, melyik étkezés ideje van. Ha idejében eszel (a Zöld Sárkány elemózsiája, a kamra, a konyha, vagy egy paradicsom, gomba, almás pite a zsákodból), elmúlik, és jóllakott leszel: gyorsabban ásol.');
      }
    });
  }

  update() {
    const g = this.game;
    const clock = g.bagEnd?.clock ?? 0;
    const w = this.now();
    const jumped = this.lastClock != null && clock - this.lastClock > MEAL.jump;
    this.lastClock = clock;
    if (this.lastKey == null) this.lastKey = w.key;
    if (w.key !== this.lastKey) {
      if (this.lastKey >= 0 && !jumped) this.judge(this.lastKey);
      this.lastKey = w.key;
    }
    g.players.forEach((p, i) => {
      const s = this.st[i];
      const pr = this.prev.get(p);
      const dead = p.dead > 0;
      if (pr && !pr.dead && !dead && !p.choosing && p.hunger - pr.h >= MEAL.eatMin) this.ate(p, w);
      this.prev.set(p, { h: p.hunger, dead });
      if (!p.choosing && !dead && w.key >= 0 && s.ate !== w.key && s.snack !== w.key && w.t >= 0.5 && this.plateFrac(p) < MEAL.full) {
        s.snack = w.key;
        this.snack(p, w);
      }
      // HUD: the clock's hand by the hour (a mark per meal: it passes mark i as window i opens), the meal shown, the mood.
      const mc = p.mealClock || (p.mealClock = { idx: 0, now: false, turn: 0, mood: '' });
      if (w.idx >= 0) {
        const eaten = s.ate === w.key;
        mc.idx = eaten ? (w.idx + 1) % N : w.idx;
        mc.now = !eaten;
        mc.turn = (w.idx + w.t) / N;
      } else {
        mc.idx = 0;
        mc.now = false;
        mc.turn = 0;
      }
      mc.mood = s.grumpy ? 'morcos' : this.fed(p, w) ? 'jóllakott' : '';
      p.mealK = s.grumpy ? MEAL.grumpyWalk : 1;
    });
  }

  /** Off (bench page): the HUD falls back to the hunger clock, no multipliers. */
  off() {
    for (const p of this.game.players) {
      p.mealClock = null;
      p.mealK = 1;
    }
  }

  state() {
    return this.st.map((s) => [s.ate, s.fed, s.grumpy ? 1 : 0]);
  }

  restore(list) {
    this.st = [this.blank(), this.blank()];
    (list || []).forEach((a, i) => {
      if (!Array.isArray(a) || i > 1) return;
      this.st[i] = { ate: a[0] ?? -1, fed: a[1] ?? -1, grumpy: !!a[2], snack: -1 };
    });
    this.lastKey = null;
    this.lastClock = null;
    this.prev.clear();
  }
}
