/* ==== save.js — the save (localStorage, versioned): money, players, finds, ladders, dropped bags and the dug terrain ==== */
import { CELL, LADDER_LEN, NX, NY, NZ, ORIGIN } from './config.js';
import { density, digStats } from './world.js';

export const SAVE_KEY = 'egy-lyuk-save-v1';
/**
 * modes (NOTES-15-modes): Kihívás has its own save slot (TERV 0.6 "külön mentési hely"); Versengés never saves (no slot).
 * `useSaveSlot(mode)` picks the slot the game writes to; loadSave / clearSave take the mode of the slot they read.
 */
export const SAVE_KEYS = { normal: SAVE_KEY, kihivas: 'egy-lyuk-save-kihivas-v1' };
let activeKey = SAVE_KEY;

export function useSaveSlot(mode) {
  activeKey = SAVE_KEYS[mode || 'normal'] || null;
}

/** The timestamp and mode of a slot's save without decoding it (the title's choices), or null. */
export function peekSave(mode) {
  try {
    const raw = localStorage.getItem(SAVE_KEYS[mode]);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v <= VERSION ? { t: s.t, mode } : null;
  } catch {
    return null;
  }
}
/**
 * 3: Goblin-town (NOTES-2a): the block reaches 240 m (the terrain indices moved), an Erebor pick tier was inserted
 * before the mithril pick, the finds are indexed in a fixed list.
 * 4: Gollum's lake (NOTES-3a-lake): the block reaches 312 m (the terrain indices moved again); layer-5 finds are
 * appended to the fixed list (the old indices stay valid); the stone giants' slabs in Goblin-town are saved.
 * 5: the roots of Mirkwood (NOTES-4a-mirkwood): the block reaches 400 m (the terrain indices moved again); layer-6
 * finds are appended; the feast clearings' found treasures are saved (`mirkwood`). The game is in development: older
 * saves are loaded best-effort (the terrain is moved into the new block, everything else kept as it is).
 * 6: beneath Lake-town (NOTES-5a-laketown): the block reaches 480 m; layer-7 finds are appended; the Master's hoard
 * chest found or not is saved (`laketown`). Per the user old saves need not survive (development): no migration, a v5
 * save's dug terrain is not moved into the taller block (start a new game).
 * 7: the mines of Erebor (NOTES-6a-erebor): the block reaches 592 m; layer-8 finds are appended; the mithril shirt
 * taken or not is saved (`erebor`). No migration (development): a v6 save's dug terrain lands 112 m off.
 * 8: Smaug's treasury (NOTES-7a-hoard): the block reaches 640 m; layer-9 finds are appended; the Arkenstone taken (and
 * by whom) and the dragon-sickness per slot are saved (`hoard`). No migration (development): a v7 save's dug terrain
 * lands 48 m off (start a new game).
 */
const VERSION = 8;

/** The generated field, kept to store only what the players changed. */
let base = null;

export function rememberBase() {
  base = density.slice();
}

/** The generated field (modes/: the Kihívás cave-in fills dug tunnels back towards it). */
export function baseField() {
  return base;
}

/** Dug samples at the one full count, minus the samples digSphere had removed by then (see dugVolume). */
let dugOffset = null;

/**
 * Cubic metres dug so far: samples that were solid in the generated field and are air now (for the spoil heap).
 * The field (6 M samples) is scanned once (Game calls this at start-up, after the save's terrain is applied); after
 * that the count follows world.js digStats, which is exact because digging only ever turns solid samples into air.
 */
export function dugVolume() {
  if (dugOffset === null) {
    let n = 0;
    for (let i = 0; i < density.length; i++) if (base[i] > 0 && density[i] <= 0) n++;
    dugOffset = n - digStats.removedSamples;
  }
  return (dugOffset + digStats.removedSamples) * CELL * CELL * CELL;
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * The changed samples as runs: varint(gap from the previous run's end), varint(length), then the bytes; deflated.
 * Typical late-game size: some 100 KB of base64.
 */
export async function encodeTerrain() {
  const out = [];
  const varint = (n) => {
    while (n > 127) {
      out.push((n & 127) | 128);
      n >>>= 7;
    }
    out.push(n);
  };
  let last = 0;
  for (let i = 0; i < density.length; i++) {
    if (density[i] === base[i]) continue;
    let j = i;
    while (j < density.length && density[j] !== base[j]) j++;
    varint(i - last);
    varint(j - i);
    for (let k = i; k < j; k++) out.push(density[k] & 255);
    last = j;
    i = j;
  }
  return b64(await pipe(new Uint8Array(out), new CompressionStream('deflate')));
}

/** Decodes a terrain string into runs; `applyTerrain` writes them into the (freshly generated) field. */
export async function decodeTerrain(str) {
  return pipe(unb64(str), new DecompressionStream('deflate'));
}

export function applyTerrain(bytes) {
  let p = 0;
  let pos = 0;
  const varint = () => {
    let n = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[p++];
      n |= (b & 127) << shift;
      if (b < 128) return n >>> 0;
      shift += 7;
    }
  };
  while (p < bytes.length) {
    pos += varint();
    const len = varint();
    for (let k = 0; k < len; k++) density[pos + k] = (bytes[p++] << 24) >> 24;
    pos += len;
  }
}

/**
 * True when any sample within r metres of a world point differs from the generated field (a dug spot). For the v2
 * find migration (finds.js migrateTakenV2), after the save's terrain is applied.
 */
export function changedNear(x, y, z, r) {
  const i0 = Math.max(0, Math.floor((x - r - ORIGIN.x) / CELL));
  const i1 = Math.min(NX - 1, Math.ceil((x + r - ORIGIN.x) / CELL));
  const j0 = Math.max(0, Math.floor((y - r - ORIGIN.y) / CELL));
  const j1 = Math.min(NY - 1, Math.ceil((y + r - ORIGIN.y) / CELL));
  const k0 = Math.max(0, Math.floor((z - r - ORIGIN.z) / CELL));
  const k1 = Math.min(NZ - 1, Math.ceil((z + r - ORIGIN.z) / CELL));
  for (let k = k0; k <= k1; k++) {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const n = i + NX * (j + NY * k);
        if (density[n] !== base[n]) return true;
      }
    }
  }
  return false;
}

/** The v2 block (24 × 160 × 24 m, ORIGIN.y −156) and the v3 block (24 × 240 × 24 m, ORIGIN.y −236): y samples, bottom. */
const V2 = { NY: 641, ORIGIN_Y: -156 };
const V3 = { NY: 961, ORIGIN_Y: -236 };
/** The v4 block (24 × 312 × 24 m, ORIGIN.y −308). */
const V4 = { NY: 1249, ORIGIN_Y: -308 };

/**
 * Moves terrain runs saved with an older, shorter block (`old`: { NY, ORIGIN_Y }) into the current block: the same x
 * and z samples, y shifted by the metres the block grew downwards. Same run format (varint gap, varint length,
 * bytes); the order is kept (the index map is monotonic).
 */
export function remapTerrain(bytes, old) {
  const shift = Math.round((old.ORIGIN_Y - ORIGIN.y) / CELL);
  const out = [];
  const varint = (n) => {
    while (n > 127) {
      out.push((n & 127) | 128);
      n >>>= 7;
    }
    out.push(n);
  };
  let p = 0;
  let pos = 0;
  const read = () => {
    let n = 0;
    let sh = 0;
    for (;;) {
      const b = bytes[p++];
      n += (b & 127) * 2 ** sh;
      if (b < 128) return n;
      sh += 7;
    }
  };
  // Collect the new runs: (start, values) with consecutive new indices merged.
  let runStart = -1;
  let runVals = [];
  let last = 0;
  const flush = () => {
    if (runStart < 0) return;
    varint(runStart - last);
    varint(runVals.length);
    for (const v of runVals) out.push(v);
    last = runStart + runVals.length;
    runStart = -1;
    runVals = [];
  };
  while (p < bytes.length) {
    pos += read();
    const len = read();
    for (let q = 0; q < len; q++) {
      const o = pos + q;
      const i = o % NX;
      const j = Math.floor(o / NX) % old.NY;
      const k = Math.floor(o / (NX * old.NY));
      const n = i + NX * (j + shift + NY * k);
      const v = bytes[p++];
      if (runStart >= 0 && n === runStart + runVals.length) runVals.push(v);
      else {
        flush();
        runStart = n;
        runVals = [v];
      }
    }
    pos += len;
  }
  flush();
  return new Uint8Array(out);
}

/** The v2 → current move (kept by name for the Goblin-town QA scripts). */
export function remapTerrainV2(bytes) {
  return remapTerrain(bytes, V2);
}

/** Reads the save; returns null when there is none (or it is unreadable). Decodes the terrain bytes too. */
export async function loadSave(mode = 'normal') {
  try {
    const raw = localStorage.getItem(SAVE_KEYS[mode] || SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v > VERSION) return null;
    if (s.v < 2) {
      // v1 was the 60 m block: its terrain, finds, ladders, bags and lift do not fit the 160 m block (v2). Money,
      // characters and upgrades carry over; everyone starts on the surface.
      for (const k of ['terrain', 'taken', 'ladders', 'sacks', 'lift', 'coop']) delete s[k];
      for (const slot of s.slots || []) if (slot) Object.assign(slot, { pos: null, maxDepth: 0 });
      s.migratedFrom = 1;
    }
    s.terrainBytes = s.terrain ? await decodeTerrain(s.terrain) : null;
    if (s.v < 3) {
      // v2 → v3 (Goblin-town, NOTES-2a): the dug terrain moves into the taller block (re-encoded at once, so a page
      // closed before the next save keeps it); the Erebor pick was inserted as tier 3, so the mithril pick is now 4;
      // the taken finds are rebuilt from their positions once the field is there (game.js restoreWorld).
      // (Straight into the current block: remapTerrainV2 maps the v2 indices to today's NY and ORIGIN.)
      if (s.terrainBytes) {
        s.terrainBytes = remapTerrainV2(s.terrainBytes);
        s.terrain = b64(await pipe(s.terrainBytes, new CompressionStream('deflate')));
      }
      for (const slot of s.slots || []) if (slot && slot.toolTier >= 3) slot.toolTier += 1;
      s.takenV2 = s.taken || [];
      delete s.taken;
      s.migratedFrom = s.migratedFrom || s.v;
    } else if (s.v < 4) {
      // v3 → v4 (Gollum's lake, NOTES-3a-lake): the dug terrain moves into the taller block again (re-encoded at once).
      // Nothing else changes: the taken finds' indices stay valid (layer 5 is appended to the fixed list), tool tiers,
      // lift stops, ladders, bags, Bag End, armour and Sting are kept as they are.
      if (s.terrainBytes) {
        s.terrainBytes = remapTerrain(s.terrainBytes, V3);
        s.terrain = b64(await pipe(s.terrainBytes, new CompressionStream('deflate')));
      }
      s.migratedFrom = s.migratedFrom || s.v;
    } else if (s.v < 5) {
      // v4 → v5 (the roots of Mirkwood, NOTES-4a-mirkwood): best-effort, the dug terrain moves into the taller block.
      if (s.terrainBytes) {
        s.terrainBytes = remapTerrain(s.terrainBytes, V4);
        s.terrain = b64(await pipe(s.terrainBytes, new CompressionStream('deflate')));
      }
      s.migratedFrom = s.migratedFrom || s.v;
    }
    return s;
  } catch (e) {
    console.warn('save unreadable', e);
    return null;
  }
}

export function clearSave(mode) {
  try {
    const key = mode ? SAVE_KEYS[mode] : activeKey;
    if (key) localStorage.removeItem(key);
  } catch {
    /* storage blocked */
  }
}

/** The save's JSON part (everything but the terrain, which is encoded separately and asynchronously). */
export function snapshot(game) {
  return {
    v: VERSION,
    t: Date.now(),
    money: game.money,
    sold: game.sold,
    slots: game.slotData(),
    taken: game.finds.items.map((it, i) => (it.taken ? i : -1)).filter((i) => i >= 0),
    // A capped ladder (NOTES-32-ladder-coop) adds its length as an optional 5th entry; a full one is saved as before.
    ladders: game.ladders.list.map((l) => { const a = [+l.x.toFixed(2), +l.y.toFixed(2), +l.z.toFixed(2), +l.yaw.toFixed(3)]; if (l.len < LADDER_LEN - 1e-3) a.push(+l.len.toFixed(3)); return a; }),
    coop: game.decor?.coop.state(),
    lift: game.lift?.state(),
    tutorial: game.tutorial?.state(),
    bagEnd: game.bagEnd?.state(),
    // The stone giants' rock slabs in Goblin-town (open or shut; NOTES-3a-lake).
    giants: game.decor?.giants?.state(),
    // Gollum: the Ring (found, by, won, seconds worn, Smaug's smell) and the riddles asked (gollum/, NOTES-3b-gollum).
    gollum: game.gollum?.state(),
    // The roots of Mirkwood: which feast clearings' treasures were found (underground/mirkwood-fx.js).
    mirkwood: game.decor?.mirkFx?.state(),
    // Layer 6's foes: per slot a prisoner's cell and the confiscated finds (mirkwood-foes/, NOTES-4b-spiders-elves).
    mirkFoes: game.mirkFoes?.state(),
    // Beneath Lake-town: the Master's hoard chest opened or not (underground/laketown-fx.js, NOTES-5a-laketown).
    laketown: game.decor?.laketownFx?.state(),
    // The mines of Erebor: the mithril shirt taken (and by whom) (underground/erebor-fx.js, NOTES-6a-erebor).
    erebor: game.decor?.ereborFx?.state(),
    // Layer 7's floods: per cavity rising / full / draining (its level) or drained (laketown-events/, NOTES-5b-flood-bard).
    laketownEvents: game.laketownEvents?.state(),
    // Erebor's puzzles: Durin's door open, its room's reward taken, the standing mirrors, the opened and read rune chests
    // (erebor-puzzles/, NOTES-6b-erebor-puzzles).
    ereborPuzzles: game.ereborPuzzles?.state(),
    // The finale: the bare patch learned, Smaug woken / slain, the finale done (finale/, NOTES-7b-finale).
    finale: game.finale?.state(),
    // Smaug's treasury: the Arkenstone taken (by whom), the dragon-sickness per slot (hoard/, NOTES-7a-hoard).
    hoard: game.hoard?.state(),
    // Bilbo's journal: the events no module saves itself (the cell escape, the barrel ride) (ui/journal.js, NOTES-9-journal).
    journal: game.journal?.state(),
    // safety (NOTES-11-safety): Balin's estimate bought.
    safety: game.safety?.state(),
    // timed-events (NOTES-12-events): goblin night's unlock / last day, the auction's absence and sold tiers.
    events: game.timedEvents?.state(),
    // minigames (NOTES-13-minigames): the purse's day, golf / plate rewards per slot and day, the smoke contest and buff.
    minigames: game.minigames?.state(),
    // home-events (NOTES-14-bagend-events): Gandalf's visits and sign, the party, the birthday, Lobelia.
    home: game.homeEvents?.state(),
    // modes (NOTES-15-modes): the game's mode (Kihívás or normal) and the hired dwarf; missing = normal, not hired.
    mode: game.modes?.state(),
    // NOTES-37-blast-eagles: the Eagle calls per slot (exits.js); missing = converted from the slot's old `eagles` flag.
    exits: game.exits?.state(),
    sacks: game.sacks.list.map((s) => ({ p: s.mesh.position.toArray().map((v) => +v.toFixed(2)), items: s.items.map((f) => f.id) })),
  };
}

export function writeSave(data, terrain) {
  if (!activeKey) return false; // modes (NOTES-15-modes): Versengés has no slot
  try {
    localStorage.setItem(activeKey, JSON.stringify({ ...data, terrain }));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}
