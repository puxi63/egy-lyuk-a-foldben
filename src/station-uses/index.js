/* ==== station-uses/index.js — a reason to be at every main station (TODO item 39, NOTES-47-station-uses).
   The user (2026-11-11): "igen mindehol legyen értelme hogy ott vagy. mehet." The cellar rooms of layer II were only
   scenery; every main station of src/stations.js that had no use of its own now gets ONE small, book-true one: the use
   key (E / P / pad X) at a spot inside the station, a prompt line in the player's own HUD, a once-per-game-day limit
   (the day clock, daynight.js day()) and a Hungarian line. Stations that already give something (Sting and the purse in
   the troll cave, the co-op doors, the riddle game, the Elvenking's cells and barrels, Bárd's stall, Durin's door, the
   chests, the lift landings…) are listed in EXISTING and left alone (the handbook and NOTES-47 use both tables).
   - Rewards reuse what the game has: the plate (a full meal, as the counter's; it counts for the Shire's meal windows),
     Gandalf's firework charge (`p.rockets`, ROCKET_MAX), an ordinary find of the layer (finds.js) into the bag (the bag's
     room and the player's pickup filter respected: a refused take keeps the day's item).
   - Limits: `per: 'player'` once a game day for each player (the pantry, the fireworks crates); `per: 'game'` once a
     game day for the company (every find).
   - Save: the optional `journal.stationUses` ({ key: day }, key = use id, or `id.slot` per player), inside the
     journal's save object like `finders` / `stations` (ui/journal.js), only entries of today, written only when
     non-empty. A save without it = nothing used today. No VERSION change.
   - Wiring (game.js, two lines marked NOTES-47-station-uses): `stationUsesOf(game).input(p, i, it)` in the no-menu
     branch (before the exits), `stationUsesOf(game).update(dt)` with the other modules.
   - Cost: per frame one comparison; 10 times a second per player the spots of his own layer (0–3 small tests); the
     prompt DOM is written only when its text changes; no scene object, no draw call. ==== */
import { HUNGER } from '../config.js';
import { ROCKET_MAX } from '../exits.js';
import { FIND_TYPES } from '../finds.js';
import { layerAtDepth } from '../materials.js';
import { STATIONS } from '../stations.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { fromRift, PORCH, ROOMS4, THRONE } from '../underground/goblin-sites.js';
import { inBasin, LIFT_SPOT, WATER_Y } from '../underground/lake-sites.js';
import { PILE_CAVE } from '../underground/laketown-sites.js';
import { fromRoom, ROOMS, WELL } from '../underground/sites.js';

/** Tuning: prompt / proximity checks per second, the save key per player. */
export const SU = { hz: 10 };

const STATION = Object.fromEntries(STATIONS.flat().map((s) => [s.id, s]));
const FIND = Object.fromEntries(FIND_TYPES.map((t) => [t.id, t]));
const TMP = [0, 0, 0];

/** A spot inside a layer-II room, from room-local (x, z) (sites.js ROOMS, furnished in pieces.js). */
function roomSpot(id, lx, lz) {
  const r = ROOMS.find((q) => q.id === id);
  fromRoom(r, lx, 0, lz, TMP);
  return { x: TMP[0], z: TMP[2] };
}

/** Inside station `sid` and horizontally within `r` of (x, z). */
function nearSpot(sid, x, z, r) {
  const st = STATION[sid];
  const fn = (px, py, pz) => (px - x) ** 2 + (pz - z) ** 2 < r * r && st.inside(px, py, pz);
  fn.at = { x, y: st.y, z }; // the spot (QA, NOTES-47)
  return fn;
}

const porchC = fromRift(PORCH.s, PORCH.u);
const shop4 = ROOMS4.find((r) => r.id === 'muhely');
const shop4C = fromRift(shop4.s, shop4.u);
const pantry = roomSpot('kamra', 0, -0.9); // the shelves of jars and cheese along the back wall
const wine = roomSpot('borospince', -0.4, 0); // the racks along both side walls
const crates = roomSpot('omlott', -0.6, -0.5); // the crates of Gandalf's fireworks
const pileBarrel = { x: PILE_CAVE.pools[1].x + 0.3, z: PILE_CAVE.pools[1].z - 0.2 }; // the barrel stranded in the pool

/**
 * The new uses, one per station that had none. `kind`: 'meal' (the plate), 'rocket' (one firework charge), 'find' (one
 * find of the layer into the bag). `near(x, y, z)`: a player's feet count as at the spot. `label`: the prompt's text;
 * `msg`: the line after a use (finds: the find's name and value are appended). `src`: the book chapter (A hobbit).
 * `short`: the handbook's line; `{f}` stands for the find (its name once found, else "egy lelet": no spoiler).
 */
export const USES = [
  // I. The old well (sites.js WELL): a lost silver spoon in the silt at its bottom. Bag End's silver spoons are the
  // book's (A hobbit, 19. fejezet: Bilbo missed his spoons after the auction; the game's Lobelia event).
  {
    id: 'kut', station: 'kut', layer: 0, per: 'game', kind: 'find', find: 'kanal', src: 'A hobbit, 19. fejezet (Zsáklak ezüstkanalai)',
    near: (x, y, z) => (x - WELL.x) ** 2 + (z - WELL.z) ** 2 < 1.25 ** 2 && y > WELL.bottom - 0.6 && y < WELL.bottom + 1.8,
    label: 'Kotorássz a kút iszapjában', msg: 'A kút fenekén, az iszapban lapult valami', short: 'a kút iszapjából naponta {f}',
  },
  // II. The pantry: a meal from the shelves (A hobbit, 1. fejezet: Bag End's pantries and larder, raided by the dwarves).
  {
    id: 'kamra', station: 'kamra', layer: 1, per: 'player', kind: 'meal', src: 'A hobbit, 1. fejezet (Zsáklak éléskamrái)',
    near: nearSpot('kamra', pantry.x, pantry.z, 1.8),
    label: 'Falatozz a kamra polcairól', msg: 'Falatoztál a kamra polcairól: sajt, savanyúság, lekvár.', short: 'naponta egy ingyen étkezés mindenkinek (tele tányér, étkezésnek számít)',
  },
  // II. The wine cellar: one old bottle a day (A hobbit, 1. fejezet: Bilbo's cellar, the dwarves call for red wine).
  {
    id: 'borospince', station: 'borospince', layer: 1, per: 'game', kind: 'find', find: 'borosuveg', src: 'A hobbit, 1. fejezet (Bilbó borospincéje)',
    near: nearSpot('borospince', wine.x, wine.z, 2.1),
    label: 'Vegyél le egy poros üveget', msg: 'Leemeltél egy poros üveget az állványról', short: 'naponta {f} a társaságnak',
  },
  // II. The collapsed tunnel: Gandalf's fireworks from the Old Took's parties (A hobbit, 1. fejezet).
  {
    id: 'omlott', station: 'omlott', layer: 1, per: 'player', kind: 'rocket', src: 'A hobbit, 1. fejezet (Gandalf tűzijátékai az Öreg Tuk ünnepein)',
    near: nearSpot('omlott', crates.x, crates.z, 1.7),
    label: 'Keress ép töltetet Gandalf ládáiban', msg: 'Az Öreg Tuk ünnepeiről maradt ládákban még akadt egy ép töltet', short: 'naponta egy Gandalf-töltet mindenkinek, ha van hely a zsebében',
  },
  // IV. The cave above the chute (the "front porch"): the company's packs left behind (A hobbit, 4. fejezet: the goblins
  // came out of the crack and carried off the ponies and the luggage).
  {
    id: 'tornac', station: 'tornac', layer: 3, per: 'game', kind: 'find', find: 'malha', src: 'A hobbit, 4. fejezet (a barlang, a poggyász)',
    near: nearSpot('tornac', porchC[0] - 0.2, porchC[1] + 1.0, 1.9),
    label: 'Kutass a hátrahagyott csomagok közt', msg: 'A csomagok közt még akadt egy batyu', short: 'naponta {f} a hátrahagyott csomagokból',
  },
  // IV. The Great Goblin's throne: the goblins' plunder at its foot (A hobbit, 4. fejezet; the find's own lore). The
  // platform is the goblins' busiest spot: the take is noisy (enemies.noiseT, as a dig).
  {
    id: 'tron', station: 'tron', layer: 3, per: 'game', kind: 'find', find: 'ezustkupa', noisy: true, src: 'A hobbit, 4. fejezet (a Nagy Goblin csarnoka)',
    near: nearSpot('tron', THRONE.x, THRONE.z, 1.9),
    label: 'Csenj a trón tövében halmozott zsákmányból', msg: 'Elcsentél egyet a trón tövében halmozott zsákmányból', short: 'naponta {f} a trón tövéből (zajos!)',
  },
  // IV. The goblins' workshop: a pickaxe from their rack (A hobbit, 4. fejezet: hammers, axes, pickaxes, tongs).
  {
    id: 'muhely', station: 'muhely', layer: 3, per: 'game', kind: 'find', find: 'goblincsakany', src: 'A hobbit, 4. fejezet (a goblinok szerszámai)',
    near: nearSpot('muhely', shop4C[0], shop4C[1], 2.1),
    label: 'Akassz le egy csákányt az állványról', msg: 'Leakasztottál egy csákányt a goblinok állványáról', short: 'naponta {f} az állványról',
  },
  // V. Gollum's lake: a blind fish groped from the water's edge (A hobbit, 5. fejezet: Gollum caught the blind fish
  // with his long fingers). Anywhere on the shore (not at the lift's landing), the water within a step ahead.
  {
    id: 'to', station: 'to', layer: 4, per: 'game', kind: 'find', find: 'barlangihal', src: 'A hobbit, 5. fejezet (Gollam vak halai)',
    near: (x, y, z, p) => {
      if (Math.abs(y - WATER_Y) > 1.4 || inBasin(x, z) || (x - LIFT_SPOT.x) ** 2 + (z - LIFT_SPOT.z) ** 2 < 2.8 ** 2) return false;
      if (!STATION.to.inside(x, y, z)) return false;
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      return inBasin(x + fx * 0.9, z + fz * 0.9) || inBasin(x + fx * 1.6, z + fz * 1.6);
    },
    label: 'Tapogass vak halat a víz szélén', msg: 'Hosszú ujjakkal, ahogy Gollam szokta, kikaptál egyet a vízből', short: 'naponta {f} a víz széléről (a vízre nézve)',
  },
  // VII. The pile cavern: an iron hoop from an elven barrel stranded in a pool (A hobbit, 9–10. fejezet: the empty
  // barrels floated down from the Elvenking's halls to Lake-town).
  {
    id: 'colopok', station: 'colopok', layer: 6, per: 'game', kind: 'find', find: 'abroncs', src: 'A hobbit, 9–10. fejezet (a tündehordók útja Tóvárosba)',
    near: nearSpot('colopok', pileBarrel.x, pileBarrel.z, 2.2),
    label: 'Feszítsd le a hordó vasabroncsát', msg: 'Lefeszítettél egy vasabroncsot a korhadt tündehordóról', short: 'naponta {f} a pocsolyába vetett hordóról',
  },
];

/**
 * The stations that already give something (left alone), with a spoiler-free line for the handbook; `none`: no use and
 * no book-true one to add (said in NOTES-47).
 */
export const EXISTING = {
  torpeajto: 'ketten kinyitható ajtó, mögötte egy láda érme',
  trollbarlang: 'Vilmos erszénye (naponta), a trollok zsákmánya',
  runaajto: 'ketten kinyitható rúnás ajtó, mögötte a trollok aranya',
  hatsokapu: 'egy híres lelet a küszöbön',
  part: 'találós játék Gollammal',
  gyokercsarnok: 'a tündék lakomáinak kincse',
  kiralycsarnok: 'egy híres lelet a fegyveres fülkében',
  borton: 'a cellák (szökés, a kulcsok)',
  pince: 'a csapóajtó és a hordós szökés',
  bard: 'Bárd vesz a leletekből; hordólift-megálló',
  ovaros: 'egy rejtett kincs a romok alatt',
  banya: 'egy rúnazáras törpeláda',
  nagycsarnok: 'egy híres lelet, törpeládák; hordólift-megálló',
  durin: 'Durin napja: tükrök és a kincseskamra',
  kohok: 'törpeládák, a törpe csigasor teteje',
  melytarna: 'törpeládák, a törpe csigasor alja',
  lepcsoalja: 'hordólift-megálló, innen indul a lépcső a kincstárba',
  kincstar: 'Szmaug kincse',
  bejarat: null, // the stair's head: nothing added (no book-true use; Smaug's meter already listens there)
};

for (const u of USES) u.at = u.near.at || (u.id === 'kut' ? { x: WELL.x, y: WELL.bottom, z: WELL.z } : null);

const BY_LAYER = STATIONS.map((_, l) => USES.filter((u) => u.layer === l));
const IDS = new Set(USES.map((u) => u.id));

const CSS = '.su-prompt{top:66%;z-index:5;pointer-events:none}.su-prompt.off{display:none}.su-prompt .su-used{opacity:.75}';

export class StationUses {
  constructor(game, saved) {
    this.game = game;
    /** key (use id, or `id.slot` per player) → the game day it was used. */
    this.used = new Map();
    this.restore(saved);
    this.t = 0;
    this.at = [null, null]; // per slot: the use the player stands at (the 10 Hz check)
    this.ui = new Map(); // HUD element → { el, text }
    this.uses = 0; // QA
  }

  today() {
    return this.game.dayClock?.day?.() ?? 1;
  }

  key(u, p) {
    return u.per === 'player' ? `${u.id}.${p.slot ?? this.game.players.indexOf(p)}` : u.id;
  }

  usedToday(u, p) {
    return this.used.get(this.key(u, p)) === this.today();
  }

  /** Whether a player can act at all (not held, not riding, not fainted…). */
  free(p) {
    return !p.choosing && p.dead <= 0 && !p.riding && !p.held && !p.wrap && !p.cocoon && !p.captured && !p.barrel && p.jailed == null && !p.washed && p.depth >= 1;
  }

  /** The use player p stands at (his layer's spots only), or null. */
  find(p) {
    if (!this.free(p) || this.game.bagEnd?.isInside?.(p)) return null;
    const list = BY_LAYER[layerAtDepth(p.depth)];
    if (!list?.length) return null;
    const { x, y, z } = p.pos;
    for (let k = 0; k < list.length; k++) if (list[k].near(x, y, z, p)) return list[k];
    return null;
  }

  /* ---------------- the use key (game.js, the no-menu branch) ---------------- */

  input(p, i, it) {
    if (!it.interactPressed) return false;
    const u = this.find(p);
    if (!u) return false;
    it.interactPressed = false;
    this.use(p, u);
    return true;
  }

  /** Uses `u` for player p (or says why not). Returns true when something was given. */
  use(p, u) {
    if (this.usedToday(u, p)) {
      p.say(u.per === 'player' ? 'Ma már jártál itt ezért. Holnap újra.' : 'Ma már elvittétek, ami itt akadt. Holnap újra.', 3);
      return false;
    }
    const g = this.game;
    if (u.kind === 'meal') {
      const max = g.bagEnd?.effects?.hungerMax ?? HUNGER.max;
      if (p.hunger >= max - 0.5) {
        p.say('Tele a tányér: most egy falat sem fér beléd.', 3);
        return false;
      }
      // Kihívás keeps its dearer food (econ.food 1.5): the free meal fills two thirds of the plate there.
      const food = g.modes?.econ?.food || 1;
      p.hunger = food > 1 ? Math.min(max, p.hunger + max / food) : max;
      // The Shire's meal windows: this is the meal (as meals.js eatFromBag does; the plate watcher must not count it twice).
      const meals = g.shire?.meals;
      if (meals && g.shire.enabled) {
        meals.prev.set(p, { h: p.hunger, dead: false });
        const w = meals.now();
        if (w.key >= 0) meals.ate(p, w);
      }
      p.say(food > 1 ? `${u.msg} (Kihívás: kétharmad tányér.)` : `${u.msg} Tele a tányér.`, 3.5);
    } else if (u.kind === 'rocket') {
      if ((p.rockets || 0) >= ROCKET_MAX) {
        p.say(`Tele a zsebed töltettel (${ROCKET_MAX}/${ROCKET_MAX}): a ládák érintetlenek maradnak.`, 3);
        return false;
      }
      p.rockets = (p.rockets || 0) + 1;
      p.say(`${u.msg}: Gandalf tűzijáték-töltete (${p.rockets}/${ROCKET_MAX}).`, 4);
    } else {
      const type = FIND[u.find];
      if (p.accepts && !p.accepts(type)) {
        p.say(`${type.name}: a felvételi szűrőd nem engedi (Szünet › Zsák: Felvétel). Itt marad.`, 4);
        return false;
      }
      if (p.bagCap - p.bag.length - (p.incoming || 0) <= 0) {
        p.say(`Tele a zsák: ${type.name} itt marad. Vidd fel a pulthoz, amit találtál.`, 3.5);
        return false;
      }
      p.bag.push(type);
      p.say(`${u.msg}: ${type.name} (${type.value} arany).`, 4);
      if (u.noisy) {
        const en = g.enemies;
        const s = g.players.indexOf(p);
        if (en?.noiseT && s >= 0) en.noiseT[s] = Math.max(en.noiseT[s] || 0, 1.5);
      }
    }
    this.used.set(this.key(u, p), this.today());
    this.uses++;
    if (u.kind !== 'meal') g.digfx?.sound?.(1, false); // a soft knock: the item taken
    g.saveNow?.();
    return true;
  }

  /* ---------------- per frame: the prompts (10 Hz) ---------------- */

  update(dt) {
    this.t += dt;
    if (this.t < 1 / SU.hz) return;
    this.t = 0;
    const g = this.game;
    g.players.forEach((p, i) => {
      const held = !!g.screens?.menuWas?.[i];
      const u = held ? null : this.find(p);
      this.at[i] = u;
      const done = u ? this.usedToday(u, p) : false;
      this.draw(i, u, done);
      if (u && !done) this.hintFor(p, i);
    });
  }

  keysFor(i) {
    const shared = this.game.bindings?.some((b) => b.kbm === 'keys2');
    return glyphs(deviceOf(this.game.bindings?.[i]), shared);
  }

  draw(i, u, done) {
    const el = this.game.huds?.[i]?.el;
    if (!el) return;
    let ui = this.ui.get(el);
    const sig = u ? `${u.id}|${done ? 1 : 0}` : '';
    if (!ui) {
      if (!sig) return;
      if (!document.getElementById('station-uses-css')) {
        const st = document.createElement('style');
        st.id = 'station-uses-css';
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      const d = document.createElement('div');
      d.className = 'prompt su-prompt off';
      el.appendChild(d);
      ui = { el: d, sig: '' };
      this.ui.set(el, ui);
    }
    if (ui.sig === sig) return;
    ui.sig = sig;
    if (!u) {
      ui.el.className = 'prompt su-prompt off';
      return;
    }
    ui.el.className = 'prompt su-prompt';
    ui.el.innerHTML = done
      ? `<span class="pr-in su-used"><span>${u.label}: ma már megvolt (holnap újra)</span></span>`
      : `<span class="pr-in"><span>${u.label}</span>${this.keysFor(i).interact}</span>`;
  }

  /** The one-time hint (per player and game, the tutorial's saved list), the first time a use is offered. */
  hintFor(p, i) {
    const g = this.game;
    const t = g.tutorial;
    if (!t || g.bench || g.modes?.versus || t.hints?.has(p)) return;
    t.hint(i, p, `station-uses-${i}`, StationUses.hintHtml(this.keysFor(i).interact));
  }

  static hintHtml(key = '') {
    return `<b>Itt van mit tenni!</b> A fő állomásokon, ahol a használat gomb${key ? ` (${key})` : ''} sora feltűnik, naponta egyszer kapsz valamit: ételt, egy töltetet vagy egy leletet. Mit adnak az egyes helyek: Kézikönyv › Hősök › A gödörben, „Mit adnak a fő állomások?”.`;
  }

  /* ---------------- save (journal.stationUses) ---------------- */

  /** Today's uses as { key: day }, or undefined when nothing was used today. */
  state() {
    const d = this.today();
    let out;
    for (const [k, v] of this.used) if (v >= d) (out ||= {})[k] = v;
    return out;
  }

  restore(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return;
    for (const [k, v] of Object.entries(s)) {
      if (IDS.has(k.split('.')[0]) && Number.isFinite(v)) this.used.set(k, Math.round(v));
    }
  }
}

/** The game's station uses (created on the first call; the journal's saved `stationUses` restores today's uses). */
export function stationUsesOf(game) {
  if (!game.stationUses) game.stationUses = new StationUses(game, game.journal?.stationUsesSave);
  return game.stationUses;
}
