/* ==== underground/sites.js — the hand-placed set pieces of the three layers: where they are, the air cavities they
   stamp into the density field, and the locked (undiggable) shells around the co-op treasure niches.
   Pure data and maths (no three.js): world.js imports it for generate(), decor.js and coop.js for placement.
   Goblin-town (layer 4) has its own module, goblin-sites.js; its cavity joins in here (kind 'goblin'). Gollum's lake
   (layer 5, lake-sites.js) likewise (kind 'lake'), and the roots of Mirkwood (layer 6, mirkwood-sites.js; kind 'mirk'). ==== */
import { fbm3 } from '../noise.js';
import { GOBLIN_BOUNDS, goblinCavity } from './goblin-sites.js';
import { LAKE_BOUNDS, lakeCavity } from './lake-sites.js';
import { CELL_LOCKS, MIRK_BOUNDS, mirkCavity } from './mirkwood-sites.js';
import { CONN_BOUNDS, connCavity, LT_BOUNDS, ltCavity, STAIR78_BOUNDS, stair78Cavity } from './laketown-sites.js';
import { ER_BOUNDS, EREBOR_LOCKS, ereborCavity } from './erebor-sites.js';
import { HOARD_BOUNDS, hoardCavity, THRONE_LOCKS } from './hoard-sites.js';

/**
 * Vertical offsets of the layer-2 and layer-3 set pieces: they were laid out for the first 60 m prototype; the layers
 * are now at full-game scale (materials.js LAYER_TOPS: 35 m and 90 m), so the pieces move down with their layers.
 */
const L2 = -30;
const L3 = -65;

/** Floor height of the troll cave (world y). */
export const TROLL_FLOOR = -55.3 + L3;

/**
 * The troll cave (layer 3): an elliptic hall with steep walls and a dome, flat floor. Centre (3, −2), radii rx × rz,
 * walls `wallH` high, then a dome `domeH` high.
 */
export const TROLL_CAVE = { x: 3, z: -1.8, rx: 6.8, rz: 5.8, floor: TROLL_FLOOR, wallH: 2.2, domeH: 4.4 };

/**
 * Cellar rooms (layer 2) and the co-op corridor: local frame x along the width `w`, z across the depth `d`, y up from
 * the floor; a barrel vault along x springs at h − d/2. `rot` turns the frame about y. `slump` piles fallen soil into
 * the +x end (metres of the room it fills). `kind` selects the furnishing in decor.js.
 */
export const ROOMS = [
  { id: 'kamra', kind: 'pantry', x: -0.5, y: -19.6 + L2, z: 0.5, rot: 0, w: 4.6, d: 3.2, h: 2.6 },
  { id: 'borospince', kind: 'wine', x: 6.4, y: -26.5 + L2, z: -5.2, rot: Math.PI / 2, w: 4.2, d: 3.0, h: 2.5 },
  { id: 'omlott', kind: 'tunnel', x: -5.6, y: -31.5 + L2, z: 5.2, rot: 0.5, w: 6.4, d: 2.3, h: 2.35, slump: 2.2 },
  { id: 'torpeajto', kind: 'coop-levers', x: 2.4, y: -36.5 + L2, z: 4.6, rot: 0, w: 10.2, d: 2.4, h: 3.0 },
];

/** Treasure niches behind the co-op doors (world boxes, floor at y0) and their door planes. */
export const NICHES = [
  // Behind the two-lever dwarf door: the door stands in the corridor's −z wall.
  { id: 'torpeajto', x0: 1.4, x1: 3.4, y0: -36.5 + L2, y1: -34.5 + L2, z0: 1.3, z1: 3.45, doorZ: 3.4, doorX: 2.4, facing: 1 },
  // Behind the rune door in the troll cave's −z alcove.
  { id: 'runaajto', x0: 2.0, x1: 4.0, y0: TROLL_FLOOR, y1: TROLL_FLOOR + 2.3, z0: -10.7, z1: -8.35, doorZ: -8.4, doorX: 3.0, facing: 1 },
];

/** The alcove in front of the rune door (air, merges into the cave; flat wall for the door). */
export const RUNE_ALCOVE = { x0: 1.5, x1: 4.5, y0: TROLL_FLOOR, y1: TROLL_FLOOR + 3.0, z0: -8.4, z1: -6.6 };

/** Undiggable shells (world boxes): digSphere leaves these samples alone, so the niches can only be entered by the doors. */
export const LOCKS = [
  { x0: 0.2, x1: 4.6, y0: -37.6 + L2, y1: -33.2 + L2, z0: 0.0, z1: 3.32 },
  { x0: 0.8, x1: 5.2, y0: TROLL_FLOOR - 1.1, y1: TROLL_FLOOR + 3.5, z0: -11.45, z1: -8.48 },
  // The Elvenking's cells (layer 6): a captured player leaves only by the door (NOTES-4a-mirkwood).
  ...CELL_LOCKS,
  // The treasure room behind Durin's Day door (layer 8): only the door leads in (NOTES-6a-erebor).
  ...EREBOR_LOCKS,
  // Thrór's throne room in the treasury's corner tower (layer 9): sealed; its door's plug opens with every famous find
  // in Bag End's cases (NOTES-22-secret, src/secret/).
  ...THRONE_LOCKS,
];

/** Layer 1: the old well (a stone-lined shaft, long buried), centre and depth range. */
export const WELL = { x: -6.6, z: 6.4, r: 0.62, top: -1.3, bottom: -11.5 };

/** Layer 1: mole runs and a rabbit burrow, as polylines of [x, y, z] with a tunnel radius. */
export const BURROWS = [
  { r: 0.3, pts: [[-10.5, -1.0, -3], [-7, -1.4, -2.2], [-4, -1.2, -3.6], [-1.5, -1.7, -2.4], [1.5, -1.5, -3.2], [3.5, -2.0, -1.8]] },
  { r: 0.3, pts: [[9.5, -0.9, 4], [7, -1.6, 2.5], [5.5, -2.4, 3.8], [3.2, -2.2, 6], [1, -2.9, 5.2]] },
  { r: 0.36, pts: [[-3, -0.8, 9.5], [-2.2, -1.6, 7.6], [-0.6, -2.4, 6.8], [0.8, -3.1, 7.9], [2.2, -3.4, 9.5]] },
];

const ROOM_CACHE = ROOMS.map((r) => ({ ...r, c: Math.cos(r.rot), s: Math.sin(r.rot), R: r.d / 2, hs: r.h - r.d / 2 }));

/** World → room-local coordinates (x along w, z across d, y from the floor). */
export function toRoom(room, x, y, z, out) {
  const r = room.c === undefined ? ROOM_CACHE.find((q) => q.id === room.id) : room;
  const dx = x - r.x;
  const dz = z - r.z;
  out[0] = dx * r.c - dz * r.s;
  out[1] = y - r.y;
  out[2] = dx * r.s + dz * r.c;
  return out;
}

/** Room-local → world (inverse of toRoom). */
export function fromRoom(room, lx, ly, lz, out) {
  const c = Math.cos(room.rot);
  const s = Math.sin(room.rot);
  out[0] = room.x + lx * c + lz * s;
  out[1] = room.y + ly;
  out[2] = room.z - lx * s + lz * c;
  return out;
}

const loc = [0, 0, 0];

/** Signed distance (m, negative inside the air) of a vaulted room. */
function roomSdf(r, x, y, z) {
  toRoom(r, x, y, z, loc);
  const lx = loc[0];
  const ly = loc[1];
  const lz = loc[2];
  // Cross-section in (y, z): a rectangle up to the spring line, a half-disc above it.
  let d2;
  if (ly > r.hs) d2 = Math.hypot(ly - r.hs, lz) - r.R;
  else d2 = Math.max(Math.abs(lz) - r.R, -ly);
  let d = Math.max(d2, Math.abs(lx) - r.w / 2);
  if (r.slump) {
    // Fallen soil at the +x end: a slope down towards the middle.
    const start = r.w / 2 - r.slump;
    if (lx > start) d = Math.max(d, ((lx - start) * 0.95 - ly) * 0.7);
  }
  return d;
}

function boxSdf(b, x, y, z) {
  const dx = Math.max(b.x0 - x, x - b.x1);
  const dy = Math.max(b.y0 - y, y - b.y1);
  const dz = Math.max(b.z0 - z, z - b.z1);
  return Math.max(dx, dy, dz);
}

/** Signed distance of the troll cave's air (negative inside). */
function caveSdf(x, y, z) {
  const c = TROLL_CAVE;
  const dx = (x - c.x) / c.rx;
  const dz = (z - c.z) / c.rz;
  const e = Math.sqrt(dx * dx + dz * dz);
  const m = Math.min(c.rx, c.rz);
  const top = c.floor + c.wallH;
  let d;
  if (y < top) d = (e - 1) * m;
  else {
    const ty = (y - top) / c.domeH;
    d = (Math.sqrt(e * e + ty * ty) - 1) * m;
  }
  return Math.max(d, c.floor - y);
}

function segDist(px, py, pz, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const vz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy + (pz - a[2]) * vz) / (vx * vx + vy * vy + vz * vz)));
  return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t, pz - a[2] - vz * t);
}

/** Bounding boxes (with a margin) of every cavity, for a quick reject in the generation loop. */
const BOUNDS = [];
for (const r of ROOM_CACHE) {
  const e = Math.hypot(r.w / 2, r.R) + 0.6;
  BOUNDS.push({ kind: 'room', r, x0: r.x - e, x1: r.x + e, y0: r.y - 0.6, y1: r.y + r.h + 0.6, z0: r.z - e, z1: r.z + e });
}
for (const n of NICHES) BOUNDS.push({ kind: 'box', r: n, x0: n.x0 - 0.6, x1: n.x1 + 0.6, y0: n.y0 - 0.6, y1: n.y1 + 0.6, z0: n.z0 - 0.6, z1: n.z1 + 0.6 });
BOUNDS.push({ kind: 'box', r: RUNE_ALCOVE, x0: RUNE_ALCOVE.x0 - 0.6, x1: RUNE_ALCOVE.x1 + 0.6, y0: RUNE_ALCOVE.y0 - 0.6, y1: RUNE_ALCOVE.y1 + 0.6, z0: RUNE_ALCOVE.z0 - 0.6, z1: RUNE_ALCOVE.z1 + 0.6 });
{
  const c = TROLL_CAVE;
  BOUNDS.push({ kind: 'cave', x0: c.x - c.rx - 1, x1: c.x + c.rx + 1, y0: c.floor - 1, y1: c.floor + c.wallH + c.domeH + 1, z0: c.z - c.rz - 1, z1: c.z + c.rz + 1 });
}
// Goblin-town (layer 4): everything below 155.6 m down to the chasm floor (goblin-sites.js culls inside).
BOUNDS.push({ kind: 'goblin', ...GOBLIN_BOUNDS, y1: GOBLIN_BOUNDS.y1 + 0.6 });
// Gollum's lake (layer 5): the cave and the tunnel, everything below 234.6 m (lake-sites.js culls inside). Its box plus
// nearSite's margin stays below 232.9 m, so the generation of layers 1–4 is untouched (NOTES-3a-lake).
BOUNDS.push({ kind: 'lake', ...LAKE_BOUNDS });
// The roots of Mirkwood (layer 6): everything below 301.9 m (mirkwood-sites.js culls inside); with nearSite's margin the
// generation of layers 1–5 is untouched (NOTES-4a-mirkwood).
BOUNDS.push({ kind: 'mirk', ...MIRK_BOUNDS });
// Beneath Lake-town (layer 7): everything below 392 m (laketown-sites.js culls inside); with nearSite's margin the
// generation of layers 1–6 is untouched (NOTES-5a-laketown).
BOUNDS.push({ kind: 'lake7', ...LT_BOUNDS });
// The barrel way from layer 6's grotto down to layer 7 (laketown-sites.js connCavity): not a nearSite box (see
// nearSite), so layer 6's cave pockets stay as they were; it changes only the rock within ~2 m of its own tunnel.
BOUNDS.push({ kind: 'conn', ...CONN_BOUNDS });
// The dwarf stair from layer 7's old town down to Erebor's mine level (laketown-sites.js stair78Cavity, NOTES-18-levelfix):
// crisp carved air within its own course only; nearSite keeps the cave pockets off the stair itself (not off its box).
BOUNDS.push({ kind: 'stair78', ...STAIR78_BOUNDS });
// The mines of Erebor (layer 8): everything below 473.5 m (erebor-sites.js culls inside with its own grid); with
// nearSite's margin the generation of layers 1–7 is untouched (NOTES-6a-erebor).
BOUNDS.push({ kind: 'erebor', ...ER_BOUNDS });
// Smaug's treasury (layer 9): everything below 580.3 m (hoard-sites.js culls inside); layer 8 is untouched
// (NOTES-7a-hoard). No cave pockets reach this deep (world.js POCKET_BOTTOM), so nearSite's margin does not matter.
BOUNDS.push({ kind: 'hoard', ...HOARD_BOUNDS });
BOUNDS.push({ kind: 'well', x0: WELL.x - 1.2, x1: WELL.x + 1.2, y0: WELL.bottom - 0.8, y1: WELL.top + 0.8, z0: WELL.z - 1.2, z1: WELL.z + 1.2 });
for (const b of BURROWS) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of b.pts) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
    z0 = Math.min(z0, p[2]);
    z1 = Math.max(z1, p[2]);
  }
  const m = b.r + 0.6;
  BOUNDS.push({ kind: 'burrow', r: b, x0: x0 - m, x1: x1 + m, y0: y0 - m, y1: y1 + m, z0: z0 - m, z1: z1 + m });
}

/**
 * Signed distance (m) of the set-piece air at a world point: negative inside a cavity, Infinity when no cavity is
 * near. Deterministic (the save stores the terrain as differences from generate()).
 */
export function cavityAt(x, y, z) {
  let d = Infinity;
  for (let n = 0; n < BOUNDS.length; n++) {
    const b = BOUNDS[n];
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1 || z < b.z0 || z > b.z1) continue;
    let v;
    switch (b.kind) {
      case 'room':
        // Old brick and plaster: slightly uneven walls.
        v = roomSdf(b.r, x, y, z) + (fbm3(x * 1.3, y * 1.3, z * 1.3) - 0.5) * 0.08;
        break;
      case 'box':
        v = boxSdf(b.r, x, y, z);
        break;
      case 'cave': {
        // Craggy rock: strong noise on the walls and the dome, a nearly flat floor.
        const rough = (fbm3(x * 0.45, y * 0.45, z * 0.45) - 0.5) * 1.3 + (fbm3(x * 1.4, y * 1.4, z * 1.4) - 0.5) * 0.35;
        const floorFade = Math.min(1, Math.max(0, (y - TROLL_FLOOR - 0.25) / 1.2));
        v = caveSdf(x, y, z) + rough * (0.25 + 0.75 * floorFade);
        break;
      }
      case 'goblin':
        v = goblinCavity(x, y, z);
        break;
      case 'lake':
        v = lakeCavity(x, y, z);
        break;
      case 'mirk':
        v = mirkCavity(x, y, z);
        break;
      case 'lake7':
        v = ltCavity(x, y, z);
        break;
      case 'conn':
        v = connCavity(x, y, z);
        break;
      case 'stair78':
        v = stair78Cavity(x, y, z);
        break;
      case 'erebor':
        v = ereborCavity(x, y, z);
        break;
      case 'hoard':
        v = hoardCavity(x, y, z);
        break;
      case 'well': {
        const r = Math.hypot(x - WELL.x, z - WELL.z) - WELL.r;
        v = Math.max(r, y - WELL.top, WELL.bottom - y);
        break;
      }
      default: {
        const pts = b.r.pts;
        let best = Infinity;
        for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, segDist(x, y, z, pts[i], pts[i + 1]));
        v = best - b.r.r;
      }
    }
    if (v < d) d = v;
  }
  return d;
}

/** True near a set piece (the random cave pockets stay away from it, so rooms and the troll cave are clean). */
export function nearSite(x, y, z, margin = 1.6) {
  for (let n = 0; n < BOUNDS.length; n++) {
    const b = BOUNDS[n];
    if (b.kind === 'burrow' || b.kind === 'well' || b.kind === 'conn') continue;
    if (b.kind === 'stair78') {
      // The stair's box spans the whole block: only the stair's own course keeps the pockets away.
      if (x > b.x0 - margin && x < b.x1 + margin && y > b.y0 - margin && y < b.y1 + margin && z > b.z0 - margin && z < b.z1 + margin && stair78Cavity(x, y, z) < margin) return true;
      continue;
    }
    if (x > b.x0 - margin && x < b.x1 + margin && y > b.y0 - margin && y < b.y1 + margin && z > b.z0 - margin && z < b.z1 + margin) return true;
  }
  return false;
}

/**
 * Adds undiggable boxes at run time (NOTES-18-levelfix: the gold under Smaug's sleeping body and under the static shield
 * heap, underground/hoard-fx.js). A box with `off: true` is ignored (Smaug gone or flying: his gold can be dug again).
 * Returns the boxes as added (the caller keeps them to switch `off`).
 */
export function addLocks(boxes) {
  for (const b of boxes) LOCKS.push(b);
  return boxes;
}

/** True inside a locked shell (digging leaves it alone). */
export function isLocked(x, y, z) {
  for (let n = 0; n < LOCKS.length; n++) {
    const b = LOCKS[n];
    if (b.off) continue;
    if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1) return true;
  }
  return false;
}

/** True when a sphere may touch a locked shell (the quick test before the per-sample check in digSphere). */
export function lockTouches(x, y, z, r) {
  for (let n = 0; n < LOCKS.length; n++) {
    const b = LOCKS[n];
    if (b.off) continue;
    const dx = Math.max(b.x0 - x, 0, x - b.x1);
    const dy = Math.max(b.y0 - y, 0, y - b.y1);
    const dz = Math.max(b.z0 - z, 0, z - b.z1);
    if (dx * dx + dy * dy + dz * dz < r * r) return true;
  }
  return false;
}
