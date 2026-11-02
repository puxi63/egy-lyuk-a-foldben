/* ==== bagend/effects.js — what the furnished rooms give (TERV 0.13 table), as plain values and functions ====
 * The integrator reads these from game.bagEnd.effects and connects them to the player and the shop:
 *   hungerMaxBonus     extra plate size from the pantry shelves (add to HUNGER.max in Player.addHunger / the HUD)
 *   freeFoodAtHome     true when a pantry shelf is stocked: eating in the pantry is free (menu row; eatAtHome(p))
 *   hungerMult(p)      multiplier for hunger costs (< 1 after resting by the fire, for the next trip, and after a
 *                      cooked meal); multiply negative hunger deltas in Player.addHunger by it
 *   cook(bag)          kitchen: turns dug potatoes and mushrooms into a meal → { keep, hunger, count, fed }
 *   wineValue(v, s)    value of a bottle of base value v kept s seconds in the cellar; storeWine / sellWine
 *   mathomSellBonus    selling multiplier from the mathom room's cases (multiply the counter's sell value)
 *   extraDwarves       hall pegs: how many dwarves stay for the "Váratlan vendégek" event (0, 4, 8, 13)
 *   comfort, comfortMax the comfort score (events such as Gandalf's visit wait for enough comfort)
 *   studyShop, moonLetters, journal, smokeRings, canSleep, guestBed — unlock flags for later features
 *   sleep(p)           the bed: calls bagEnd.onSleep(p) (skip the night: the integrator's hook) and saves
 *   sleepGuest(p)      the guest bed: the same sleep and save for the second player (NOTES-14-bagend-events)
 * Hooks read here (set by home-events/, NOTES-14-bagend-events): be.pantryEaten() (no free food after the Unexpected
 * Party's day), be.sellMult() (the birthday's fame on mathomSellBonus). */
import { HUNGER } from '../config.js';

/** How much a cooked find fills the plate (before the kitchen's multiplier). */
const COOKABLE = { krumpli: 9, gomba: 11 };
/** Find type id of the wine bottle (finds.js). */
export const WINE_ID = 'borosuveg';

export class Effects {
  /** @param {import('./index.js').BagEnd} be */
  constructor(be) {
    this.be = be;
    /** Per player: { pending: strength, active: strength, left: seconds } — resting by the fire. */
    this.rest = new Map();
    /** Per player: seconds of the "jóllakott" buff from a cooked meal. */
    this.fed = new Map();
  }

  t(id) {
    return this.be.tiers[id] || 0;
  }

  /** Extra plate size (hunger maximum) from the stocked pantry shelves: +5 per shelf tier (max +30). */
  get hungerMaxBonus() {
    return 5 * (this.t('polc1') + this.t('polc2') + this.t('polc3'));
  }

  /** The hunger maximum including the pantry bonus. */
  get hungerMax() {
    return HUNGER.max + this.hungerMaxBonus;
  }

  get freeFoodAtHome() {
    // home-events (NOTES-14-bagend-events): the dwarves of the Unexpected Party ate the pantry bare for the day.
    if (this.be.pantryEaten?.()) return false;
    return this.t('polc1') + this.t('polc2') + this.t('polc3') > 0;
  }

  /** Hall pegs: dwarves who stay (and dig for free) at the "Váratlan vendégek" event. */
  get extraDwarves() {
    return [0, 4, 8, 13][this.t('fogasok')] || 0;
  }

  /** Comfort score: the sum of the bought tiers' comfort points. */
  get comfort() {
    let c = 0;
    for (const s of this.be.slots) for (let k = 0; k < this.t(s.id); k++) c += s.tiers[k].comfort || 0;
    return c;
  }

  get comfortMax() {
    let c = 0;
    for (const s of this.be.slots) for (const tier of s.tiers) c += tier.comfort || 0;
    return c;
  }

  /* ---- kitchen ---- */

  get canCook() {
    return this.t('tuzhely') > 0;
  }

  /** Multiplier of a cooked meal: the range's tier, the kettle. */
  get cookFactor() {
    const k = this.t('tuzhely');
    if (!k) return 0;
    return 1 + 0.25 * (k - 1) + 0.1 * this.t('kanna');
  }

  /** Seconds the cooked meal's slower hunger lasts (the crockery makes it a proper meal). */
  get fedSeconds() {
    return 180 + 90 * this.t('porcelan');
  }

  /**
   * Turns the potatoes and mushrooms of a bag into a meal (pure: the caller applies it).
   * @param {Array<{id: string}>} bag the player's bag (find types)
   * @returns {{keep: Array, hunger: number, count: number, potatoes: number, mushrooms: number, fed: number}}
   */
  cook(bag) {
    const f = this.cookFactor;
    const keep = [];
    let hunger = 0;
    let potatoes = 0;
    let mushrooms = 0;
    for (const item of bag) {
      if (f && COOKABLE[item.id]) {
        hunger += COOKABLE[item.id] * f;
        if (item.id === 'krumpli') potatoes++;
        else mushrooms++;
      } else keep.push(item);
    }
    const count = potatoes + mushrooms;
    return { keep, hunger: Math.round(hunger), count, potatoes, mushrooms, fed: count ? this.fedSeconds : 0 };
  }

  /** Cooks a player's bag and eats the meal. Returns a message. */
  cookFor(p) {
    const r = this.cook(p.bag);
    if (!r.count) return 'Nincs nálad krumpli vagy gomba.';
    p.bag = r.keep;
    this.feed(p, r.hunger);
    this.fed.set(p, Math.max(this.fed.get(p) || 0, r.fed));
    return `Megfőzted: ${r.potatoes} krumpli, ${r.mushrooms} gomba. Jóllaktál (+${r.hunger}).`;
  }

  /** Adds food to a player's plate up to the (pantry-enlarged) maximum. */
  feed(p, amount) {
    p.hunger = Math.min(this.hungerMax, (p.hunger || 0) + amount);
  }

  /* ---- pantry ---- */

  /** Free food at home: a full (enlarged) plate. */
  eatAtHome(p) {
    if (this.be.pantryEaten?.()) return 'A törpék mindent megettek a kamrából. Holnapra újra megtelik.';
    if (!this.freeFoodAtHome) return 'A kamra üres.';
    p.hunger = this.hungerMax;
    return 'Falatoztál a kamrából. Tele a tányér.';
  }

  /* ---- parlour: resting by the fire ---- */

  /** Strength of the rest buff (fraction of hunger saved): the fire, the armchair, the pipe. */
  get restStrength() {
    if (!this.t('karosszek')) return 0;
    return Math.min(0.35, 0.05 * this.t('kandallo') + 0.04 * this.t('karosszek') + 0.02 * this.t('pipa'));
  }

  /** Seconds outside the rest buff lasts at most. */
  get restSeconds() {
    return 300 + 150 * this.t('karosszek');
  }

  /** Sitting in the armchair by the fire: the next trip starts rested. */
  sitByFire(p) {
    const s = this.restStrength;
    if (!s) return 'Előbb egy karosszék kell ide.';
    const r = this.rest.get(p) || {};
    r.pending = s;
    this.rest.set(p, r);
    return this.t('kandallo') ? 'Pihentél a tűz mellett. A következő úton lassabban éhezel.' : 'Pihentél egy kicsit. Tűzzel jobb volna.';
  }

  /** A player came home: the trip's rest is used up. */
  cameHome(p) {
    const r = this.rest.get(p);
    if (r) r.active = 0;
  }

  /** A player left home: a pending rest becomes active for this trip. */
  leftHome(p) {
    const r = this.rest.get(p);
    if (r?.pending) {
      r.active = r.pending;
      r.left = this.restSeconds;
      r.pending = 0;
    }
  }

  /** The rest buff a player carries now (fraction of hunger saved on this trip; 0 = none). */
  restBuff(p) {
    return this.rest.get(p)?.active || 0;
  }

  /** Multiplier for the hunger costs of a player (1 = normal). */
  hungerMult(p) {
    let m = 1;
    const r = this.rest.get(p);
    if (r?.active) m *= 1 - r.active;
    if ((this.fed.get(p) || 0) > 0) m *= 0.85;
    return m;
  }

  /* ---- cellar ---- */

  /** Bottles the wine rack holds. */
  get wineCapacity() {
    return [0, 6, 14, 24][this.t('borospolc')] || 0;
  }

  /** Value of a bottle of base value v kept s seconds: +50 % per hour of play (casks: faster), up to ×3. */
  wineValue(v, s) {
    const rate = 0.5 * (1 + 0.25 * this.t('hordok'));
    return Math.round(v * Math.min(3, 1 + (rate * s) / 3600));
  }

  /** What the cellar's bottles are worth now. */
  get wineWorth() {
    return this.be.wine.reduce((sum, w) => sum + this.wineValue(w.v, this.be.clock - w.t), 0);
  }

  /** Lays the wine bottles of a player's bag down in the cellar (up to the rack's capacity). */
  storeWine(p) {
    const room = this.wineCapacity - this.be.wine.length;
    if (room <= 0) return this.wineCapacity ? 'Tele a borospolc.' : 'Előbb egy borospolc kell ide.';
    let n = 0;
    const keep = [];
    for (const item of p.bag) {
      if (item.id === WINE_ID && n < room) {
        this.be.wine.push({ v: item.value, t: this.be.clock });
        n++;
      } else keep.push(item);
    }
    if (!n) return 'Nincs nálad borosüveg.';
    p.bag = keep;
    return `${n} palackot fektettél a polcra. Idővel többet ér.`;
  }

  /** Sells the cellar's wine (aged value) into the shared purse. Returns the gold. */
  sellWine() {
    const g = this.wineWorth;
    this.be.wine = [];
    this.be.game.money += g;
    if (this.be.game.sold != null) this.be.game.sold += g;
    return g;
  }

  /* ---- mathom room, study, bedroom, hall ---- */

  /** Selling multiplier from the display cases: +2 % per case tier, +4 % more for the full row at the top tier. */
  get mathomSellBonus() {
    const ids = ['vitrin1', 'vitrin2', 'vitrin3'];
    const sum = ids.reduce((s, id) => s + this.t(id), 0);
    const full = ids.every((id) => this.t(id) >= 2);
    // home-events (NOTES-14-bagend-events): Bilbo's birthday's fame (×1.05 for a game day).
    return (1 + 0.02 * sum + (full ? 0.04 : 0)) * (this.be.sellMult?.() ?? 1);
  }

  /** The study's desk: the map and depth upgrades are sold here (the integrator's rows: bagEnd.studyRows). */
  get studyShop() {
    return this.t('iroasztal') > 0;
  }

  /** Thrór's map on the study wall: the moon letters can be read. */
  get moonLetters() {
    return this.t('terkepek') >= 2;
  }

  /** Bilbo's book on the desk: the progress is written into it. */
  get journal() {
    return this.t('iroasztal') >= 3;
  }

  /** Bilbo's pipe in the parlour: the smoke-ring contest with Gandalf can happen. */
  get smokeRings() {
    return this.t('pipa') > 0;
  }

  get canSleep() {
    return this.t('agy') > 0;
  }

  /** The guest bed for the second player. */
  get guestBed() {
    return this.t('vendegagy') > 0;
  }

  /** The bed: skip the night (the integrator's onSleep hook) and save. */
  sleep(p) {
    if (!this.canSleep) return 'Előbb egy ágy kell ide.';
    // daynight (NOTES-10-daynight): the hook (game.dayClock.sleep) skips the night and returns the message.
    const msg = this.be.onSleep?.(p);
    this.be.game.saveNow?.();
    return msg || 'Kialudtad magad. Reggel van. (Mentve.)';
  }

  /**
   * The guest bed (NOTES-14-bagend-events): the second player's own bed. Sleeping in it works like Bilbo's bed (the
   * day clock's co-op rule: both players at home, one presses, both sleep) and saves; it needs no bought Bilbo's bed.
   */
  sleepGuest(p) {
    if (!this.guestBed) return 'Előbb egy vendégágy kell ide.';
    const msg = this.be.onSleep?.(p);
    this.be.game.saveNow?.();
    return msg || 'Kialudtad magad a vendégágyban. (Mentve.)';
  }

  /** Per frame: the buffs run down (rest only outside). */
  update(dt) {
    for (const [p, s] of this.fed) if (s > 0) this.fed.set(p, s - dt);
    for (const [p, r] of this.rest) {
      if (!r.active || this.be.isInside(p)) continue;
      r.left -= dt;
      if (r.left <= 0) r.active = 0;
    }
  }

  /**
   * Extra menu rows of a slot (actions besides buying tiers): eat, cook, rest, sleep, wine.
   * @returns {Array<{label: string, ok: boolean, act: () => string}>}
   */
  actions(s, p) {
    const t = this.t(s.id);
    const rows = [];
    if (s.id.startsWith('polc') && t > 0) {
      rows.push({ label: 'Falatozás a kamrából (ingyen)', ok: p.hunger < this.hungerMax - 0.5, act: () => this.eatAtHome(p) });
    }
    if (s.id === 'tuzhely' && t > 0) {
      const r = this.cook(p.bag);
      rows.push({ label: r.count ? `Főzés: ${r.potatoes} krumpli, ${r.mushrooms} gomba (+${r.hunger} tányér)` : 'Főzés (nincs nálad krumpli vagy gomba)', ok: r.count > 0, act: () => this.cookFor(p) });
    }
    if (s.id === 'karosszek' && t > 0) rows.push({ label: 'Leülsz pihenni a tűz mellé', ok: true, act: () => this.sitByFire(p) });
    if (s.id === 'agy' && t > 0) rows.push({ label: 'Alvás (átugrod az éjszakát, mentés)', ok: true, act: () => this.sleep(p) });
    // home-events (NOTES-14-bagend-events): the guest bed sleeps and saves too.
    if (s.id === 'vendegagy' && t > 0) rows.push({ label: 'Alvás a vendégágyban (átugrod az éjszakát, mentés)', ok: true, act: () => this.sleepGuest(p), desc: 'Este vagy éjjel átalszod az éjszakát; nappal csak mentesz. Co-opban mindketten otthon legyetek.' });
    if (s.id === 'borospolc' && t > 0) {
      const n = p.bag.filter((f) => f.id === WINE_ID).length;
      rows.push({ label: `Bor lerakása (${n} palack nálad, ${this.be.wine.length}/${this.wineCapacity} a polcon)`, ok: n > 0 && this.be.wine.length < this.wineCapacity, act: () => this.storeWine(p) });
      const w = this.wineWorth;
      rows.push({ label: `Érett bor eladása (+${w} arany)`, ok: this.be.wine.length > 0, act: () => `Eladtad a bort: ${this.sellWine()} arany.` });
    }
    if (s.id === 'iroasztal' && t > 0 && this.be.studyRows) rows.push(...this.be.studyRows(p));
    // NOTES-25-map-contract: Thrór's map on the study wall opens the map screen; its moon letters show only under the
    // right moon (ui/map.js moonLettersVisible).
    if (s.id === 'terkepek' && this.moonLetters) {
      rows.push({
        label: 'Thrór térképe a holdfényben (holdbetűk)', ok: true, desc: 'Holdbetűk csak olyan alakú hold fényénél látszanak, amilyennél írták őket.',
        act: () => (this.be.game.screens?.openMap?.(Math.max(0, this.be.game.players.indexOf(p)), { from: 'bagend' }) ? 'A holdfénybe tartod Thrór térképét…' : 'Thrór térképe a falon.'),
      });
    }
    // minigames (NOTES-13-minigames): extra rows of any slot (the plate game at the crockery).
    if (this.be.slotRows) rows.push(...this.be.slotRows(s, p, t));
    return rows;
  }
}
