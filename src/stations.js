/* ==== stations.js — the main-station guide (TODO item 37, NOTES-46-stations) ====
 * The user (2026-11-11): the wall tap points at the nearest hollow (often a meaningless small pocket) and Balin's map is
 * too faint; he wants a separate, clearly visible sign that shows the MAIN stations of a layer.
 *  - STATIONS: per layer (index 0–8) the hand-placed set pieces that already exist in the code (underground/*-sites.js),
 *    each with a Hungarian name (the UI's / journal's own words, or a plain description where the code has none), a
 *    target point (its floor, near its middle) and an `inside` test on a player's feet position. The secret ending's
 *    places (Thrór's throne room) and the hidden treasures (the Master's hoard, the sealed armoury, the Ring's spot) are
 *    deliberately not stations.
 *  - Visited: a station counts as visited once any player has stood inside it (game-wide, like the shared purse). The
 *    ids are saved inside the journal's save object as the optional `stations` list (ui/journal.js state / restore);
 *    a save without it (every VERSION-8 save before this item) starts with nothing visited.
 *  - The guide: per player, the nearest not yet visited station of the layer he is on (with a 2 m hysteresis, so two
 *    nearly equidistant stations do not flicker). Drawn by StationBadge in each player's HUD (hud.js updateStation): an
 *    arrow turning with the player's facing, the name, the horizontal distance and the height difference.
 *  - Per-device switch: the settings key `egy-lyuk-settings-v1` field `stationGuide` (absent = on), Beállítások.
 *  - Cost: hud.js calls step() at most 10 times a second per player (a handful of comparisons per station of one
 *    layer); the DOM is written only when a rounded value changes. No scene object, no draw call. ==== */
import { readSettings, writeSettings } from './audio.js';
import { layerAtDepth } from './materials.js';
import { ROOMS, RUNE_ALCOVE, toRoom, TROLL_CAVE, TROLL_FLOOR, WELL } from './underground/sites.js';
import { CHASM_FLOOR, fromRift, LEDGE_Y, PORCH, ROOMS4, THRONE, THRONE_DECK_Y, toRift } from './underground/goblin-sites.js';
import { RIDDLE_PLAYER, WATER_Y } from './underground/lake-sites.js';
import { CAV, HF, ROOMS6 } from './underground/mirkwood-sites.js';
import { BARD_STALL, OLD_TOWN, PILE_CAVE, WHARF } from './underground/laketown-sites.js';
import { DEEP_FACE, DEEP_FLOOR, DOOR, FORGE, HALL, MINE } from './underground/erebor-sites.js';
import { ENTRY, HALL9, LANDING, SMAUG_LAIR, TOWER } from './underground/hoard-sites.js';

/** Tuning: updates per second, the target hysteresis (m), "on one level" (m), the arrow turns to ↓ / ↑ within (m). */
export const GUIDE = { hz: 10, keep: 2, level: 1.5, overhead: 2.5 };

const RLOC = [0, 0, 0];
const RIFT = [0, 0];
const between = (v, a, b) => v >= a && v <= b;

/** A cellar room of layer II (sites.js ROOMS): inside its vaulted box, feet between the floor and the vault. */
function roomStation(id, name) {
  const r = ROOMS.find((q) => q.id === id);
  return {
    id, name, x: r.x, y: r.y, z: r.z,
    inside: (x, y, z) => {
      toRoom(r, x, y, z, RLOC);
      return Math.abs(RLOC[0]) < r.w / 2 + 0.2 && Math.abs(RLOC[2]) < r.d / 2 + 0.2 && between(RLOC[1], -0.6, r.h - 0.5);
    },
  };
}

/** A round place: horizontally within `r` of (x, z), feet between y0 and y1. Target (x, floor, z). */
function roundStation(id, name, x, z, floor, r, y0, y1) {
  return { id, name, x, y: floor, z, inside: (px, py, pz) => (px - x) ** 2 + (pz - z) ** 2 < r * r && between(py, y0, y1) };
}

/** A box place (plan box, feet between y0 and y1). Target: the box's middle at `floor`. */
function boxStation(id, name, b, floor, y0, y1) {
  return {
    id, name, x: (b.x0 + b.x1) / 2, y: floor, z: (b.z0 + b.z1) / 2,
    inside: (x, y, z) => between(x, b.x0, b.x1) && between(z, b.z0, b.z1) && between(y, y0, y1),
  };
}

const porch = fromRift(PORCH.s, PORCH.u);
const shop4 = ROOMS4.find((r) => r.id === 'muhely');
const shop4c = fromRift(shop4.s, shop4.u);
const gate4 = ROOMS4.find((r) => r.id === 'kapu');
const gate4c = fromRift(gate4.s, gate4.u);
const room6 = (id) => ROOMS6.find((r) => r.id === id);
const hall6 = room6('hall');
const cellar6 = room6('cellar');

/**
 * The main stations per layer index (0 Zsáklak kertje … 8 Szmaug kincstára). `x, y, z`: the target (the floor near the
 * middle); `inside(x, y, z)`: a player's feet position counts as being there.
 */
export const STATIONS = [
  // I. Zsáklak kertje: the old well (a stone-lined shaft, long buried; sites.js WELL).
  [roundStation('kut', 'A régi kút', WELL.x, WELL.z, WELL.bottom, WELL.r + 0.6, WELL.bottom - 0.6, WELL.top)],
  // II. Hobbitüregek és pincék: the cellar rooms and the two-lever dwarf door's corridor (sites.js ROOMS).
  [
    roomStation('kamra', 'Kamra'),
    roomStation('borospince', 'Borospince'),
    roomStation('omlott', 'Omlott járat'),
    roomStation('torpeajto', 'A kétkaros törpeajtó'),
  ],
  // III. A trollok barlangja: the cave (an ellipse) and the rune door's alcove in its −z wall.
  [
    {
      id: 'trollbarlang', name: 'A trollok barlangja', x: TROLL_CAVE.x, y: TROLL_FLOOR, z: TROLL_CAVE.z,
      inside: (x, y, z) => ((x - TROLL_CAVE.x) / TROLL_CAVE.rx) ** 2 + ((z - TROLL_CAVE.z) / TROLL_CAVE.rz) ** 2 < 1 && between(y, TROLL_FLOOR - 0.6, TROLL_FLOOR + 6),
    },
    boxStation('runaajto', 'A rúnás kőajtó', { x0: RUNE_ALCOVE.x0, x1: RUNE_ALCOVE.x1, z0: RUNE_ALCOVE.z0 - 0.2, z1: RUNE_ALCOVE.z1 }, TROLL_FLOOR, TROLL_FLOOR - 0.6, TROLL_FLOOR + 2.5),
  ],
  // IV. Goblinváros: the cave at the chute's top (the company's shelter, book ch. 4), the Great Goblin's platform, the
  // goblins' workshop off the ledge, the back gate at the chasm's floor (goblin-sites.js).
  [
    roundStation('tornac', 'A barlang a csúszda fölött', porch[0], porch[1], PORCH.floor, 3.0, PORCH.floor - 0.8, PORCH.floor + 2.4),
    {
      id: 'tron', name: 'A Nagy Goblin trónja', x: THRONE.x, y: THRONE_DECK_Y, z: THRONE.z,
      inside: (x, y, z) => {
        toRift(x, z, RIFT);
        return Math.abs(RIFT[0]) < 2.7 && Math.abs(RIFT[1]) < 3.5 && between(y, THRONE_DECK_Y - 0.5, THRONE_DECK_Y + 3);
      },
    },
    roundStation('muhely', 'A goblinok műhelye', shop4c[0], shop4c[1], LEDGE_Y, 2.4, LEDGE_Y - 0.6, LEDGE_Y + 2.4),
    roundStation('hatsokapu', 'A goblinok hátsó kapuja', gate4c[0], gate4c[1], gate4.y, 2.0, CHASM_FLOOR - 0.5, gate4.y + 2.4),
  ],
  // V. Gollam tava: the lake cave and the shore in front of the island (the riddle game's beach).
  [
    {
      id: 'to', name: 'Gollam tava', x: 0.2, y: WATER_Y, z: 0.4,
      inside: (x, y, z) => Math.abs(x - 0.2) < 9 && Math.abs(z - 0.4) < 9 && between(y, WATER_Y - 2, WATER_Y + 4.5),
    },
    roundStation('part', 'A sziget előtti part', RIDDLE_PLAYER.x, RIDDLE_PLAYER.z, RIDDLE_PLAYER.y, 2.5, RIDDLE_PLAYER.y - 1.5, RIDDLE_PLAYER.y + 2),
  ],
  // VI. Bakacsinerdő gyökerei: the root hall, the Elvenking's hall, his dungeon (the corridor and its cells) and his
  // cellar over the river (mirkwood-sites.js).
  [
    roundStation('gyokercsarnok', 'A gyökércsarnok', CAV.x, CAV.z, CAV.floor, 7.8, CAV.floor - 1, CAV.floor + 10),
    boxStation('kiralycsarnok', 'A Tünde-király csarnoka', hall6, HF, HF - 0.6, HF + 4),
    boxStation('borton', 'A Tünde-király börtöne', { x0: -6.6, x1: 0.6, z0: -3.0, z1: 4.4 }, HF, HF - 0.6, HF + 2.6),
    boxStation('pince', 'A Tünde-király pincéje', cellar6, HF, HF - 0.6, HF + 3.6),
  ],
  // VII. Tóváros alatt: the pile cavern, Bárd's stall at the wharf, the sunken old town (laketown-sites.js).
  [
    roundStation('colopok', 'A régi cölöpök barlangja', PILE_CAVE.x, PILE_CAVE.z, PILE_CAVE.floor, PILE_CAVE.a, PILE_CAVE.floor - 1, PILE_CAVE.floor + 8),
    {
      id: 'bard', name: 'Bárd standja', x: BARD_STALL.x, y: WHARF.floor, z: BARD_STALL.z,
      inside: (x, y, z) => ((x - WHARF.x) / WHARF.rx) ** 2 + ((z - WHARF.z) / WHARF.rz) ** 2 < 1.1 && between(y, WHARF.floor - 1, WHARF.floor + 4.5),
    },
    roundStation('ovaros', 'Az elsüllyedt óváros', OLD_TOWN.x, OLD_TOWN.z, OLD_TOWN.floor, OLD_TOWN.a, OLD_TOWN.floor - 1, OLD_TOWN.floor + 8),
  ],
  // VIII. Erebor tárnái: the mine level, the great hall, Durin's door in its west wall, the forges, the deepest gallery.
  [
    {
      id: 'banya', name: 'A régi bányajáratok', x: MINE.chamber.x, y: MINE.floor, z: MINE.chamber.z,
      inside: (x, y, z) => {
        if (!between(y, MINE.floor - 0.6, MINE.floor + 2.6)) return false;
        const ax = Math.abs(x);
        const az = Math.abs(z);
        const ring = Math.max(ax, az);
        return (ax < 1.4 && az < 9) || (az < 1.4 && ax < 9) || between(ring, 7.6, 10.4);
      },
    },
    boxStation('nagycsarnok', 'A nagycsarnok', { x0: HALL.x - HALL.a, x1: HALL.x + HALL.a, z0: HALL.z - HALL.a, z1: HALL.z + HALL.a }, HALL.floor, HALL.floor - 0.6, HALL.floor + 12),
    roundStation('durin', 'Durin ajtaja', DOOR.x + 0.7, DOOR.z, DOOR.y, 1.8, DOOR.y - 0.6, DOOR.y + 2.5),
    boxStation('kohok', 'A kohók', FORGE, FORGE.floor, FORGE.floor - 0.6, FORGE.floor + FORGE.wall),
    roundStation('melytarna', 'A legmélyebb tárna', DEEP_FACE.x, DEEP_FACE.z, DEEP_FLOOR, DEEP_FACE.r + 0.4, DEEP_FLOOR - 0.6, DEEP_FLOOR + DEEP_FACE.h),
  ],
  // IX. Szmaug kincstára: the entry chamber, the foot of the spiral stair (the lift's landing), the hall of gold. Thrór's
  // throne room (the secret ending, NOTES-22-secret) is NOT a station: the hall's test leaves the corner tower out.
  [
    roundStation('bejarat', 'A kincstár bejárata', ENTRY.x, ENTRY.z, ENTRY.floor, ENTRY.r + 0.2, ENTRY.floor - 0.6, ENTRY.top),
    boxStation('lepcsoalja', 'A csigalépcső alja', LANDING, LANDING.y, LANDING.y - 0.6, LANDING.y + LANDING.h),
    {
      id: 'kincstar', name: 'Szmaug kincstára', x: SMAUG_LAIR.x, y: SMAUG_LAIR.y, z: SMAUG_LAIR.z,
      inside: (x, y, z) => Math.abs(x) < HALL9.a && Math.abs(z) < HALL9.a && !(x < TOWER.x1 && z > TOWER.z0) && between(y, HALL9.floor - 0.5, LANDING.y - 1),
    },
  ],
];

/** Every station id (the save keeps only known ids). */
const IDS = new Set(STATIONS.flat().map((s) => s.id));

/** The badge's styles, injected once. */
const CSS = `
.sg { position: absolute; left: 1em; top: max(10.2em, 31%); z-index: 3; pointer-events: none; max-width: calc(100% - 9em); }
.sg.off { display: none; }
.sg-in { display: flex; align-items: center; gap: 0.5em; font-size: clamp(15px, 3cqmin, 24px); padding: 0.28em 0.9em 0.3em 0.3em;
  background: var(--tx-parch) center / cover, #e8d6ac; color: #2a1406; border-left: 0.32em solid #8a5418; border-radius: 0.3em 1.4em 1.4em 0.3em;
  box-shadow: 0 0.15em 0.55em #000d, 0 0 0 0.09em #2a1608, inset 0 0 0.6em #8a6a3a55; transform-origin: 0 50%; }
.sg-dial { position: relative; flex: none; width: 2.9em; height: 2.9em; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #6a4424, #2a1608 70%);
  box-shadow: inset 0 0 0 0.13em #e8c070, inset 0 0 0 0.2em #2a1608, 0 0.06em 0.2em #000a; }
.sg-rot { position: absolute; inset: 0.18em; transition: transform 0.12s linear; will-change: transform; }
.sg-rot svg { width: 100%; height: 100%; display: block; overflow: visible; }
.sg-v { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; font-family: var(--f-head); font-size: 1.8em; line-height: 1;
  color: #ffd77a; text-shadow: 0 0.05em 0.1em #000; }
.sg.vert .sg-rot { display: none; }
.sg.vert .sg-v { display: flex; }
.sg-tx { display: flex; flex-direction: column; min-width: 0; line-height: 1.08; }
.sg-k { font-family: var(--f-head); font-size: 0.56em; letter-spacing: 0.1em; text-transform: uppercase; color: #7a3a10; }
.sg-nm { font-family: var(--f-head); font-weight: normal; font-size: 1.04em; color: #1e0e02; overflow-wrap: anywhere; }
.sg-row { display: flex; gap: 0.55em; font-family: var(--f-head); font-weight: bold; font-size: 0.92em; color: #1e0e02; white-space: nowrap; }
.sg-z { color: #8a2a0e; }
body:has(#screens .scr.on) .sg { visibility: hidden; }
`;
let cssIn = false;

/** The badge in one player's HUD: built once, written only when a rounded value changes (hud.js updateStation). */
export class StationBadge {
  constructor(host) {
    if (!cssIn) {
      cssIn = true;
      const st = document.createElement('style');
      st.id = 'stations-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'sg off';
    el.innerHTML = `<div class="sg-in"><div class="sg-dial"><div class="sg-rot"><svg viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -9.2L7 6L0 2.4L-7 6Z" fill="#f2c45a" stroke="#1a1008" stroke-width="1.5" stroke-linejoin="round"/><path d="M0 -9.2L0 2.4L-7 6Z" fill="#c8902e"/></svg></div><div class="sg-v"></div></div>
      <div class="sg-tx"><small class="sg-k">Következő fő állomás</small><b class="sg-nm"></b><span class="sg-row"><span class="sg-d"></span><span class="sg-z"></span></span></div></div>`;
    host.appendChild(el);
    this.el = el;
    this.inner = el.firstElementChild;
    this.rot = el.querySelector('.sg-rot');
    this.v = el.querySelector('.sg-v');
    this.nm = el.querySelector('.sg-nm');
    this.d = el.querySelector('.sg-d');
    this.z = el.querySelector('.sg-z');
    this.c = {}; // last written values
    this.deg = 0; // the arrow's continuous angle (unwrapped, so the CSS transition turns the short way)
  }

  set(key, v, fn) {
    if (this.c[key] === v) return;
    this.c[key] = v;
    fn(v);
  }

  hide() {
    this.set('cls', 'sg off', (v) => (this.el.className = v));
  }

  /** Shows `g` (Stations.guide's reused object). */
  show(g) {
    this.set('cls', g.vert ? 'sg vert' : 'sg', (v) => (this.el.className = v));
    if (this.c.id !== g.id) {
      const first = this.c.id === undefined;
      this.c.id = g.id;
      this.nm.textContent = g.name;
      // A new target: a short swell of the badge (compositor-only, no layout read).
      if (!first) this.inner.animate?.([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 650, easing: 'ease-out' });
    }
    if (g.vert) this.set('v', g.dy < 0 ? '↓' : '↑', (v) => (this.v.textContent = v));
    else {
      let d = g.deg - (((this.deg % 360) + 360) % 360);
      d = ((d + 540) % 360) - 180;
      const next = this.deg + d;
      this.set('deg', next, (v) => {
        this.deg = v;
        this.rot.style.transform = `rotate(${v}deg)`;
      });
    }
    this.set('d', g.vert ? (g.dy < 0 ? -1 : -2) : g.dist, (v) => (this.d.textContent = v === -1 ? 'alattad' : v === -2 ? 'fölötted' : `${v} m`));
    this.set('z', g.dz, (v) => (this.z.textContent = v > 0 ? `↑ ${v} m` : v < 0 ? `↓ ${-v} m` : 'egy szinten'));
  }
}

export class Stations {
  constructor(game, saved) {
    this.game = game;
    /** Visited station ids (game-wide). */
    this.visited = new Set();
    this.restore(saved);
    /** The per-device switch (Beállítások), read once; the settings row writes it through setOn(). */
    const s = readSettings();
    this.on = s.stationGuide !== false;
    /** The one-time hint: already shown on this device / shown in this session / per slot this session. */
    this.hintKnown = !!s.stationGuideHint;
    this.hintSession = false;
    this.hinted = new Set();
    /** Per slot: the current target id (the hysteresis) and the reused guide object. */
    this.cur = [null, null];
    this.out = [0, 1].map(() => ({ id: '', name: '', deg: 0, dist: 0, dz: 0, dy: 0, vert: false }));
    this.visits = 0; // QA
  }

  /* ---------------- save (journal.stations) ---------------- */

  state() {
    return this.visited.size ? [...this.visited].sort() : undefined;
  }

  restore(list) {
    if (!Array.isArray(list)) return;
    for (const id of list) if (typeof id === 'string' && IDS.has(id)) this.visited.add(id);
  }

  /** The settings candle. */
  setOn(v) {
    this.on = !!v;
    writeSettings({ stationGuide: this.on });
  }

  /* ---------------- per player, at most GUIDE.hz times a second ---------------- */

  /** Marks the stations of the player's layer he stands in as visited. */
  noteVisits(p) {
    if (p.depth < 1 || this.game.bagEnd?.isInside?.(p)) return;
    const list = STATIONS[layerAtDepth(p.depth)];
    const { x, y, z } = p.pos;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!this.visited.has(s.id) && s.inside(x, y, z)) {
        this.visited.add(s.id);
        this.visits++;
      }
    }
  }

  /**
   * The guide for player `p` in `slot`: the nearest not yet visited station of his layer (kept unless another is more
   * than GUIDE.keep m nearer), or null (on the surface, in Bag End, every station of the layer visited). Fills and
   * returns a reused object: id, name, deg (the arrow, 0 ahead, + to the right), dist (horizontal m, rounded), dz
   * (height difference, rounded, 0 within GUIDE.level), dy (raw), vert (the target is almost straight below / above).
   */
  guide(p, slot) {
    if (p.depth < 1 || this.game.bagEnd?.isInside?.(p)) {
      this.cur[slot] = null;
      return null;
    }
    const list = STATIONS[layerAtDepth(p.depth)];
    const { x, y, z } = p.pos;
    let best = null;
    let bestD = Infinity;
    let keep = null;
    let keepD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (this.visited.has(s.id)) continue;
      const d = (s.x - x) ** 2 + (s.y - y) ** 2 + (s.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
      if (s.id === this.cur[slot]) {
        keep = s;
        keepD = d;
      }
    }
    if (keep && Math.sqrt(keepD) - Math.sqrt(bestD) < GUIDE.keep) best = keep;
    this.cur[slot] = best ? best.id : null;
    if (!best) return null;
    const o = this.out[slot];
    const ex = best.x - x;
    const ez = best.z - z;
    const dy = best.y - y;
    const horiz = Math.hypot(ex, ez);
    // The facing is (−sin yaw, −cos yaw); the angle to the target, positive to the right (as finders.js relAngle).
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    o.id = best.id;
    o.name = best.name;
    o.deg = Math.round((Math.atan2(fx * ez - fz * ex, fx * ex + fz * ez) * 180) / Math.PI);
    o.dist = Math.max(1, Math.round(horiz));
    o.dy = dy;
    o.dz = Math.abs(dy) < GUIDE.level ? 0 : Math.round(dy);
    o.vert = horiz < GUIDE.overhead && Math.abs(dy) >= GUIDE.level;
    return o;
  }

  /** True once per player and session when the one-time hint should go out (and remembers it on the device). */
  wantsHint(slot) {
    const g = this.game;
    if (g.bench || g.modes?.versus || this.hinted.has(slot)) return false;
    return !this.hintKnown || this.hintSession;
  }

  /** The one-time hint's text for a player's controls (the tutorial's hint box). */
  static hintHtml() {
    return '<b>Fő állomások:</b> a bal oldali tábla nyila a réteg legközelebbi fő helyszínére mutat, ahol még nem jártatok (pince, barlang, csarnok…), alatta a távolság és hogy mennyivel lejjebb (↓) vagy feljebb (↑) van. Ha odaértetek, a következőre mutat. A Beállításokban kikapcsolhatod.';
  }

  /** The hint was shown to `slot`. */
  hintShown(slot) {
    this.hinted.add(slot);
    this.hintSession = true;
    if (!this.hintKnown) {
      this.hintKnown = true;
      writeSettings({ stationGuideHint: true });
    }
  }
}

/** The game's stations guide (created on the first call; the journal's saved `stations` list restores the visits). */
export function stationsOf(game) {
  if (!game.stations) game.stations = new Stations(game, game.journal?.stationsSave);
  return game.stations;
}

/** The settings row reads the switch without creating the guide (Screens is built before the journal's restore). */
export function guideSetting(game) {
  return game.stations ? game.stations.on : readSettings().stationGuide !== false;
}

/** The settings row's candle: stores the switch per device (and tells a running guide). */
export function setGuideSetting(game, v) {
  if (game.stations) game.stations.setOn(v);
  else writeSettings({ stationGuide: !!v });
}
