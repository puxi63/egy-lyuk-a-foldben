/* ==== underground/erebor-sites.js — the mines of Erebor (layer 8, 470–580 m; TERV 0.2 "Erebor tárnái": iron, gems,
   dwarf rune stones, the mithril shirt; abandoned dwarf halls, forges; 0.12 "Erebor zöld-arany csarnokai és kohói"):
   where everything is, the air it stamps into the density field, the shading helpers (the carved hall stone, the ore
   veins) and the hooks for the Durin's Day door and the rune chests (src/erebor-puzzles/, the other agent).
   Pure data and maths (no three.js): world.js (through sites.js) uses ereborCavity() for generate(), materials.js asks
   ereborHallWeight() / ereborOre() per vertex, erebor-pieces.js and erebor-fx.js dress it from the same data.

   Canon (TERV Decision 18; NOTES-6a-erebor has the table): the dwarves' halls, mines and forges under the Lonely
   Mountain (the book ch. 1, 12–13; the films: the green-and-gold halls, the great forges with their bellows, the mines
   with carts on rails and the dwarf statues); the secret door on the west side that the last light of Durin's Day
   shows (the book ch. 3 and 11, Thrór's map); the mithril shirt and its belt of pearls and crystals, which Thorin gave
   Bilbo from the hoard (ch. 13); the harps of gold strung with silver (ch. 13); the runes (Thrór's map, the moon-letters).
   The pit "remembers" Bilbo's road (TERV 0.2), so all this lies under the sunken old town of layer 7.

   The layout (world y; the block's centre is x = z = 0; everything stays 1.75 m inside the block's walls):
   - THE MINE LEVEL (477 m): a ring gallery round the block, two cross-cuts through the middle and a small chamber
     where they meet; rails, carts, stone arches. Digging down from layer 7 meets it 4 m under the layer's top.
   - THE GREAT RAMP: from the ring at (−4, 9) a carved gallery with rails winds down round the block (4 turns, slope
     0.36) past every level: the great hall (525 m, 2 turns down), the forges (552 m), the deepest gallery (574 m).
   - THE GREAT HALL (525 m): 13 × 13 m and 19 m high, six pillars, a great dwarf statue against the north wall; in the
     west wall Durin's Day's secret door (closed) to a sealed treasure room; a light shaft in the roof (the "setting
     sun"); the harps in an alcove of the east wall; the lift stop "Erebor tárnái · 525 m" at the hall's south door.
   - THE FORGES (552 m): cold furnaces along the north wall, great bellows, anvils, quench troughs; in the east wall a
     walled-up doorway (the clue) and, 1.4 m behind it, THE SEALED ARMOURY with the mithril shirt (dig to find it).
   - THE DEEPEST GALLERY (574 m): an old working off the ramp's foot with the richest gem veins.
   ==== */
import { fbm3, noise3 } from '../noise.js';

/* ---------------------------------------------------------------- shared helpers ---- */

/** The layer's top and bottom (world y). Below ER_SHADE_Y materials.js and the soil shader read layer 8's channels. */
export const ER_TOP = -470;
export const ER_BOTTOM = -580;
export const ER_SHADE_Y = -470;

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const smoothstep = (a, b, x) => smooth01((x - a) / (b - a));
const fix = (v, n = 2) => +v.toFixed(n);
/** Math.hypot is slow in V8; these run per sample in generate(). */
const hyp = (a, b) => Math.sqrt(a * a + b * b);
const hyp3 = (a, b, c) => Math.sqrt(a * a + b * b + c * c);

/* ---------------------------------------------------------------- the loop round the block ---- */

/** The rounded-square loop along the block's walls (the same as the lake, Mirkwood and Lake-town tunnels). */
const LOOP_H = 9.0;
const LOOP_CR = 2.8;
const LOOP_SIDE = 2 * (LOOP_H - LOOP_CR);
const LOOP_Q = (Math.PI / 2) * LOOP_CR;
const LOOP_PER = 4 * (LOOP_SIDE + LOOP_Q);

/** A point [x, z] on the loop at arc length `a` (east side southwards… see laketown-sites.js). */
function loopPoint(a) {
  const H = LOOP_H;
  const cr = LOOP_CR;
  let s = ((a % LOOP_PER) + LOOP_PER) % LOOP_PER;
  const side = Math.floor(s / (LOOP_SIDE + LOOP_Q));
  s -= side * (LOOP_SIDE + LOOP_Q);
  let lx;
  let lz;
  if (s < LOOP_SIDE) {
    lx = H;
    lz = H - cr - s;
  } else {
    const ang = (s - LOOP_SIDE) / cr;
    lx = H - cr + Math.cos(ang) * cr;
    lz = -(H - cr) - Math.sin(ang) * cr;
  }
  const rot = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]][side];
  return [rot[0] * lx + rot[1] * lz, rot[2] * lx + rot[3] * lz];
}

/** The loop's arc at the lift column (−4, 9) on the south side: the great ramp starts and the hall door lies here. */
const ARC_LIFT = 3 * (LOOP_SIDE + LOOP_Q) + (LOOP_H - LOOP_CR - 4);

/**
 * Plan distance from a point to the loop's centre line (a rounded square), for a quick reject of the ring gallery and
 * the great ramp (both run along the loop; their chords cut the corners by at most 0.1 m).
 */
function loopDist(x, z) {
  const ax = Math.abs(x) - (LOOP_H - LOOP_CR);
  const az = Math.abs(z) - (LOOP_H - LOOP_CR);
  const ox = ax > 0 ? ax : 0;
  const oz = az > 0 ? az : 0;
  const d = Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(ax, az), 0) - LOOP_CR;
  return d < 0 ? -d : d;
}

/* ---------------------------------------------------------------- cut-offs ---- */

/**
 * Beyond these distances (m) a part of the site is not evaluated at all (Infinity): per sample CUT_N, more than the
 * 1 m where the density saturates (so leaving out a farther part never changes a sample); while the NEAR grid is
 * built (ereborCavity) CUT_W, so its cells see every part within their reach.
 */
const CUT_N = 1.3;
const CUT_W = 3.6;
let CUT = CUT_N;

/* ---------------------------------------------------------------- galleries (carved, vaulted) ---- */

/**
 * A carved gallery along a polyline of floor points [x, y, z]: vertical walls `hw` from the course, a flat floor, a
 * round vault on top (`h` from the floor to the crown). Segments are bucketed by height for a quick reject.
 */
function makeGallery(pts, hw, h) {
  const segs = [];
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const vx = b[0] - a[0];
    const vz = b[2] - a[2];
    const box = (M) => [Math.min(a[0], b[0]) - M, Math.max(a[0], b[0]) + M, Math.min(a[2], b[2]) - M, Math.max(a[2], b[2]) + M];
    segs.push({ a, b, vx, vz, l2: vx * vx + vz * vz || 1e-9, n: box(hw + CUT_N), w: box(hw + CUT_W) });
    y0 = Math.min(y0, a[1], b[1]);
    y1 = Math.max(y1, a[1], b[1]);
  }
  const by0 = Math.floor(y0 - CUT_W - 0.5);
  // Height buckets of the segments, for the narrow and the wide cut-off.
  const bucketsFor = (cut) => {
    const out = Array.from({ length: Math.ceil(y1 + h + CUT_W + 0.5) - by0 + 1 }, () => []);
    segs.forEach((s, i) => {
      const lo = Math.max(0, Math.floor(Math.min(s.a[1], s.b[1]) - cut - by0));
      const hi = Math.min(out.length - 1, Math.floor(Math.max(s.a[1], s.b[1]) + h + cut - by0));
      for (let k = lo; k <= hi; k++) out[k].push(i);
    });
    return out;
  };
  const bn = bucketsFor(CUT_N);
  return { pts, hw, h, segs, bn, bw: bucketsFor(CUT_W), by0, y0: by0, y1: by0 + bn.length };
}

const galOut = { fy: 0, t: 0, seg: 0 };

/** Signed distance of a gallery's air (negative inside); Infinity when farther than the cut-off. `out` gets the floor. */
function galleryBase(G, x, y, z, out = galOut) {
  const wide = CUT > CUT_N;
  const buckets = wide ? G.bw : G.bn;
  const k = Math.floor(y - G.by0);
  if (k < 0 || k >= buckets.length) return Infinity;
  const list = buckets[k];
  let best = Infinity;
  const hw = G.hw;
  for (let n = 0; n < list.length; n++) {
    const s = G.segs[list[n]];
    const b = wide ? s.w : s.n;
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * s.vx + (z - s.a[2]) * s.vz) / s.l2));
    const q = hyp(x - s.a[0] - s.vx * t, z - s.a[2] - s.vz * t);
    const fy = s.a[1] + (s.b[1] - s.a[1]) * t;
    const spring = fy + G.h - hw;
    let d;
    if (y > spring) d = Math.max(fy - y, hyp(q, y - spring) - hw);
    else d = Math.max(q - hw, fy - y);
    if (d < best) {
      best = d;
      out.fy = fy;
      out.t = t;
      out.seg = list[n];
    }
  }
  return best;
}

/** Points [x, y, z] along the loop from arc a0 to a1 (either direction), floor from y0 to y1, about `step` apart. */
function loopRun(a0, a1, y0, y1, step = 1.4) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, z] = loopPoint(a0 + (a1 - a0) * t);
    out.push([x, y0 + (y1 - y0) * t, z]);
  }
  return out;
}

/* ---------------------------------------------------------------- the levels ---- */

/** The mine level: floor height, the ring gallery round the block, the cross-cuts and the chamber where they meet. */
export const MINE = { floor: -477, hw: 1.2, h: 2.9, chamber: { x: 0, z: 0, r: 2.5, h: 3.4 } };
export const MINE_RING = loopRun(0, LOOP_PER, MINE.floor, MINE.floor, 1.4);
export const MINE_CROSS = [
  [[0, MINE.floor, -LOOP_H], [0, MINE.floor, LOOP_H]],
  [[-LOOP_H, MINE.floor, 0], [LOOP_H, MINE.floor, 0]],
];
const RING_G = makeGallery(MINE_RING, MINE.hw, MINE.h);
const CROSS_G = MINE_CROSS.map((p) => makeGallery(p, 1.1, 2.7));

/** The great hall (525 m): plan half size, floor, wall height, the stepped roof's rise to the middle. */
export const HALL = { x: 0, z: 0, a: 6.5, floor: -525, wall: 13, rise: 0.9 };
/** The hall's roof height over a plan point (walls up to `wall`, then rising towards the middle). */
export function hallRoof(x, z) {
  return HALL.floor + HALL.wall + HALL.rise * (HALL.a - Math.max(Math.abs(x - HALL.x), Math.abs(z - HALL.z)));
}
/** The forges (552 m): plan box, floor, wall height, a barrel vault along z on top. */
export const FORGE = { x0: -6.5, x1: 3.2, z0: -6.5, z1: 6.5, floor: -552, wall: 5.6, vault: 2.6 };
/** The sealed armoury with the mithril shirt, 1.4 m behind the forges' east wall (nothing leads in: dig). */
export const ARMOURY = { x0: 4.6, x1: 6.6, y0: FORGE.floor, y1: FORGE.floor + 2.5, z0: -1.4, z1: 1.4 };
/** The walled-up doorway in the forges' east wall that hides it (erebor-pieces.js carves the outline). */
export const WALLED_DOOR = { x: FORGE.x1, y: FORGE.floor, z: 0, w: 1.4, h: 2.2 };

/**
 * The great ramp: from the mine ring at the lift column (−4, 9) down round the block, westwards (the loop's arc
 * decreasing), at a steady slope, to the deepest gallery. Two turns bring it back to the lift column at the hall's
 * floor (525 m); 210 m along it the forges' door (552 m) on the west side; it ends at 574 m in the south-west corner.
 */
export const RAMP_SLOPE = (MINE.floor - HALL.floor) / (2 * LOOP_PER);
export const DEEP_FLOOR = -574;
const RAMP_LEN = (MINE.floor - DEEP_FLOOR) / RAMP_SLOPE;
export const RAMP = loopRun(ARC_LIFT, ARC_LIFT - RAMP_LEN, MINE.floor, DEEP_FLOOR, 1.5);
const RAMP_G = makeGallery(RAMP, 1.25, 2.9);
/** Arc length along the ramp (from the mine ring) where a floor height is reached. */
export const rampAt = (y) => (MINE.floor - y) / RAMP_SLOPE;
/** The ramp's point at a floor height: [x, y, z]. */
export function rampPoint(y) {
  const [x, z] = loopPoint(ARC_LIFT - rampAt(y));
  return [x, y, z];
}

/** The forges' door from the ramp: where the ramp passes at the forges' floor (west side). */
const FORGE_DOOR = rampPoint(FORGE.floor);
/** Passages (box rooms with a vaulted top): the hall's south door to the ramp, the forges' west door to the ramp. */
const PASSAGES = [
  { id: 'hall-south', x0: -5.1, x1: -2.9, z0: HALL.a - 0.3, z1: 8.3, y: HALL.floor, h: 3.3, axis: 'z' },
  { id: 'forge-west', x0: FORGE_DOOR[0] + 1.1, x1: FORGE.x0 + 0.3, z0: FORGE_DOOR[2] - 1.1, z1: FORGE_DOOR[2] + 1.1, y: FORGE.floor, h: 3.2, axis: 'x' },
];

/** Durin's Day door in the hall's west wall (closed), the treasure room behind it, its doorway in the rock. */
export const DOOR = { x: -HALL.a, y: HALL.floor, z: -2.0, nx: 1, nz: 0, w: 1.0, h: 1.6 };
export const BEHIND_DOOR = { x0: -9.4, x1: -7.0, y0: HALL.floor, y1: HALL.floor + 2.6, z0: DOOR.z - 1.6, z1: DOOR.z + 1.6 };
const DOORWAY = { x0: BEHIND_DOOR.x1 - 0.05, x1: -HALL.a + 0.05, y0: HALL.floor, y1: HALL.floor + DOOR.h, z0: DOOR.z - DOOR.w / 2, z1: DOOR.z + DOOR.w / 2 };
/** The keyhole on the door's hall face, 1 m above the floor (where the last light of Durin's Day must fall). */
export const KEYHOLE = { x: -HALL.a + 0.05, y: HALL.floor + 1.0, z: DOOR.z };
/** The undiggable shell round the treasure room (sites.js LOCKS): only the door leads in. */
export const EREBOR_LOCKS = [{ x0: BEHIND_DOOR.x0 - 0.6, x1: -HALL.a + 0.02, y0: BEHIND_DOOR.y0 - 0.6, y1: BEHIND_DOOR.y1 + 0.6, z0: BEHIND_DOOR.z0 - 0.6, z1: BEHIND_DOOR.z1 + 0.6 }];

/** The light shaft in the hall's roof (the "setting sun" comes down it): plan point, radius, its top in the rock. */
export const SUN_SHAFT = { x: 5.0, z: -5.0, r: 0.55, top: -503 };
/** The harps' alcove in the hall's east wall (the famous find hangs on its back wall). */
const ALCOVE = { x0: HALL.a - 0.05, x1: HALL.a + 0.95, z0: -1.1, z1: 1.1, y: HALL.floor, h: 2.7 };

/** The deepest gallery: from the ramp's foot (south-west corner) in towards the middle, a working chamber at its end. */
export const DEEP = (() => {
  const s = RAMP[RAMP.length - 1];
  return [[s[0], DEEP_FLOOR, s[2]], [-5.6, DEEP_FLOOR, 6.4], [-3.6, DEEP_FLOOR, 3.6], [-1.0, DEEP_FLOOR, 1.2], [1.8, DEEP_FLOOR, -1.0]];
})();
const DEEP_G = makeGallery(DEEP, 1.2, 2.7);
export const DEEP_FACE = { x: 2.7, y: DEEP_FLOOR, z: -1.8, r: 2.3, h: 3.1 };

/**
 * Three heaps of fallen stone on the hall's floor (solid, diggable): they block lines of the light puzzle. r1 lies
 * across the straight line to the door, r3 between the two sockets of the west aisle: every way to the keyhole needs
 * one of them dug away.
 */
export const RUBBLE = [
  { id: 'r1', x: -3.4, z: -2.0, r: 1.15, h: 1.7 },
  { id: 'r2', x: 0.0, z: 3.9, r: 1.05, h: 1.55 },
  { id: 'r3', x: -5.0, z: 1.9, r: 1.0, h: 1.5 },
];

/* ---------------------------------------------------------------- the cavity field ---- */

/** The bounds of layer 8's site air (its top 3.5 m under the layer's top: with nearSite's margin layer 7 is untouched). */
export const ER_BOUNDS = { x0: -12, x1: 12, y0: -578, y1: -473.5, z0: -12, z1: 12 };

/** A box room with a vaulted top along `axis` (x or z): signed distance (negative inside). */
function vaultBox(b, x, y, z) {
  const dx = Math.max(b.x0 - x, x - b.x1);
  const dz = Math.max(b.z0 - z, z - b.z1);
  const hw = b.axis === 'x' ? (b.z1 - b.z0) / 2 : (b.x1 - b.x0) / 2;
  const q = b.axis === 'x' ? Math.abs(z - (b.z0 + b.z1) / 2) : Math.abs(x - (b.x0 + b.x1) / 2);
  const spring = b.y + b.h - hw;
  const top = y > spring ? hyp(q, y - spring) - hw : y - (b.y + b.h);
  return Math.max(dx, dz, b.y - y, top);
}

function boxSdf(b, x, y, z) {
  return Math.max(b.x0 - x, x - b.x1, b.y0 - y, y - b.y1, b.z0 - z, z - b.z1);
}

/** The great hall's air: the box, the stepped roof, the light shaft, the alcove, the south door, the doorway. */
function hallBase(x, y, z) {
  if (y < HALL.floor - CUT || y > SUN_SHAFT.top + CUT) return Infinity;
  const ax = Math.abs(x - HALL.x);
  const az = Math.abs(z - HALL.z);
  const roof = hallRoof(x, z);
  let d = Math.max(ax - HALL.a, az - HALL.a, HALL.floor - y, (y - roof) * 0.75);
  // The light shaft: a round hole up from the roof.
  if (Math.abs(x - SUN_SHAFT.x) < SUN_SHAFT.r + CUT && Math.abs(z - SUN_SHAFT.z) < SUN_SHAFT.r + CUT) {
    const sh = Math.max(hyp(x - SUN_SHAFT.x, z - SUN_SHAFT.z) - SUN_SHAFT.r, hallRoof(SUN_SHAFT.x, SUN_SHAFT.z) - 0.6 - y, y - SUN_SHAFT.top);
    if (sh < d) d = sh;
  }
  if (y < HALL.floor + 3.3 + CUT) {
    if (x > ALCOVE.x0 - CUT) {
      const al = Math.max(ALCOVE.x0 - x, x - ALCOVE.x1, ALCOVE.z0 - z, z - ALCOVE.z1, ALCOVE.y - y, y > ALCOVE.y + ALCOVE.h - 1.1 ? hyp(z, y - (ALCOVE.y + ALCOVE.h - 1.1)) - 1.1 : -1);
      if (al < d) d = al;
    }
    if (x < DOORWAY.x1 + CUT) {
      const dw = boxSdf(DOORWAY, x, y, z);
      if (dw < d) d = dw;
      const room = boxSdf(BEHIND_DOOR, x, y, z);
      if (room < d) d = room;
    }
    if (z > HALL.a - 0.3 - CUT) {
      const v = vaultBox(PASSAGES[0], x, y, z);
      if (v < d) d = v;
    }
  }
  return d;
}

/** The forges' air: the box with a barrel vault along z, the west door to the ramp. */
function forgeBase(x, y, z) {
  if (y < FORGE.floor - CUT || y > FORGE.floor + FORGE.wall + FORGE.vault + CUT) return Infinity;
  const cx = (FORGE.x0 + FORGE.x1) / 2;
  const hw = (FORGE.x1 - FORGE.x0) / 2;
  const spring = FORGE.floor + FORGE.wall;
  let top;
  if (y > spring) {
    // A flattened barrel vault: the crown `vault` above the spring line.
    const u = (x - cx) / hw;
    top = y - (spring + FORGE.vault * Math.sqrt(Math.max(0, 1 - u * u)));
  } else top = y - spring;
  let d = Math.max(FORGE.x0 - x, x - FORGE.x1, FORGE.z0 - z, z - FORGE.z1, FORGE.floor - y, top * 0.8);
  if (x < PASSAGES[1].x1 + CUT) {
    const v = vaultBox(PASSAGES[1], x, y, z);
    if (v < d) d = v;
  }
  return d;
}

/** The mine level's air: the ring, the cross-cuts, the chamber. */
function mineBase(x, y, z) {
  if (y < MINE.floor - CUT || y > MINE.floor + MINE.chamber.h + CUT) return Infinity;
  let d = loopDist(x, z) - MINE.hw - 0.2 < CUT ? galleryBase(RING_G, x, y, z) : Infinity;
  if (Math.abs(x) < 1.1 + CUT) {
    const v = galleryBase(CROSS_G[0], x, y, z);
    if (v < d) d = v;
  }
  if (Math.abs(z) < 1.1 + CUT) {
    const v = galleryBase(CROSS_G[1], x, y, z);
    if (v < d) d = v;
  }
  const c = MINE.chamber;
  const r = hyp(x - c.x, z - c.z);
  if (r > c.r + CUT) return d;
  const spring = MINE.floor + c.h - c.r * 0.6;
  const ch = Math.max(r - c.r, MINE.floor - y, y > spring ? hyp(r, (y - spring) / 0.6) - c.r : -1);
  return ch < d ? ch : d;
}

/** The deepest gallery and its working chamber. */
function deepBase(x, y, z) {
  if (y < DEEP_FLOOR - CUT || y > DEEP_FLOOR + DEEP_FACE.h + CUT) return Infinity;
  let d = galleryBase(DEEP_G, x, y, z);
  const f = DEEP_FACE;
  const r = hyp(x - f.x, z - f.z);
  if (r > f.r + CUT) return d;
  const spring = f.y + f.h - f.r * 0.55;
  const ch = Math.max(r - f.r, f.y - y, y > spring ? hyp(r, (y - spring) / 0.55) - f.r : -1);
  return ch < d ? ch : d;
}

/** The carved rooms only (crisp, polished hall stone): the great hall with its rooms, the forges, the armoury. */
export function ereborCarvedBase(x, y, z) {
  if (y > ER_BOUNDS.y1 + 2 || y < ER_BOUNDS.y0) return Infinity;
  let d = Infinity;
  if (y > HALL.floor - CUT && y < SUN_SHAFT.top + CUT) d = hallBase(x, y, z);
  if (y > FORGE.floor - CUT && y < FORGE.floor + FORGE.wall + FORGE.vault + CUT) {
    const v = forgeBase(x, y, z);
    if (v < d) d = v;
    if (x > ARMOURY.x0 - CUT) {
      const a = boxSdf(ARMOURY, x, y, z);
      if (a < d) d = a;
    }
  }
  return d;
}

/** The hewn mine workings (rough walls): the mine level, the great ramp, the deepest gallery. */
export function ereborMineBase(x, y, z) {
  if (y > ER_BOUNDS.y1 + 2 || y < ER_BOUNDS.y0) return Infinity;
  let d = Infinity;
  if (y > MINE.floor - CUT && y < MINE.floor + MINE.chamber.h + CUT) d = mineBase(x, y, z);
  if (y >= RAMP_G.y0 && y <= RAMP_G.y1 && loopDist(x, z) - 1.25 - 0.2 < CUT) {
    const v = galleryBase(RAMP_G, x, y, z);
    if (v < d) d = v;
  }
  if (y < DEEP_FLOOR + DEEP_FACE.h + CUT) {
    const v = deepBase(x, y, z);
    if (v < d) d = v;
  }
  return d;
}

/** A rubble heap's signed distance (negative inside the stone), without noise. */
export function rubbleBase(x, y, z) {
  let d = Infinity;
  for (const r of RUBBLE) {
    const v = (hyp3((x - r.x) / r.r, (y - HALL.floor + 0.3) / r.h, (z - r.z) / r.r) - 1) * Math.min(r.r, r.h);
    if (v < d) d = v;
  }
  return d;
}

/** The site's air without noise (negative inside), the rubble heaps solid; Infinity outside its bounds. */
export function ereborBase(x, y, z) {
  if (y < ER_BOUNDS.y0 || y > ER_BOUNDS.y1 + 1) return Infinity;
  let d = ereborCarvedBase(x, y, z);
  const m = ereborMineBase(x, y, z);
  if (m < d) d = m;
  if (d < 2 && y < HALL.floor + 2.5 && y > HALL.floor - 1) {
    const r = rubbleBase(x, y, z);
    if (-r > d) d = -r;
  }
  return d;
}

/**
 * A coarse grid (1 m cells) over the bounds with, per cell, the parts of the site whose air may come within ~1 m of a
 * point of the cell (their noiseless distance at the cell's centre within 2.7 m: the steepest of the distance functions
 * changes by at most 1.85 per metre, the wall roughness by 0.1); bit 7 marks cells deep inside the air. A sample only
 * evaluates its cell's parts; a cell without parts is Infinity, a deep one −9 m (the density saturates 1 m from the
 * surface, so the field is exactly the same as with every part evaluated; qa/erebor/ident.mjs checks it). Built on the
 * first call (generate()).
 */
const NG = { s: 1, nx: 24, ny: Math.ceil(ER_BOUNDS.y1 - ER_BOUNDS.y0), nz: 24 };
const P_HALL = 1;
const P_FORGE = 2;
const P_MINE = 4;
const P_RAMP = 8;
const P_DEEP = 16;
const P_RUB = 32;
const P_AIR = 128;
let NEAR = null;
function buildNear() {
  NEAR = new Uint8Array(NG.nx * NG.ny * NG.nz);
  CUT = CUT_W;
  const near = (v) => v < 2.7;
  for (let k = 0; k < NG.nz; k++) {
    for (let j = 0; j < NG.ny; j++) {
      for (let i = 0; i < NG.nx; i++) {
        const x = ER_BOUNDS.x0 + (i + 0.5) * NG.s;
        const y = ER_BOUNDS.y0 + (j + 0.5) * NG.s;
        const z = ER_BOUNDS.z0 + (k + 0.5) * NG.s;
        let m = 0;
        if (near(hallBase(x, y, z))) m |= P_HALL;
        if (near(Math.min(forgeBase(x, y, z), boxSdf(ARMOURY, x, y, z)))) m |= P_FORGE;
        if (near(mineBase(x, y, z))) m |= P_MINE;
        if (y >= RAMP_G.y0 && y <= RAMP_G.y1 && near(galleryBase(RAMP_G, x, y, z))) m |= P_RAMP;
        if (near(deepBase(x, y, z))) m |= P_DEEP;
        if (y < HALL.floor + 2.5 + 2.7 && y > HALL.floor - 1 - 2.7 && near(-rubbleBase(x, y, z)) && near(rubbleBase(x, y, z))) m |= P_RUB;
        // Deep inside the air: the full union (rubble included) far below zero.
        if (m && ereborBase(x, y, z) < -2.7) m = P_AIR;
        NEAR[i + NG.nx * (j + NG.ny * k)] = m;
      }
    }
  }
  CUT = CUT_N;
}

/**
 * The cavity at a world point as generate() stamps it: the carved rooms crisp, the mine workings hewn (a faint
 * roughness on the walls, a smoother floor), the rubble heaps lumpy. Negative in the air, Infinity outside the bounds
 * or more than 2.5 m from the air. Deterministic (the save stores the terrain as differences from generate()).
 */
export function ereborCavity(x, y, z) {
  if (y < ER_BOUNDS.y0 || y > ER_BOUNDS.y1) return Infinity;
  // Quick reject: most of the layer is solid rock far from any air (the field saturates 1 m from the surface).
  if (!NEAR) buildNear();
  const gi = Math.min(NG.nx - 1, Math.max(0, Math.floor((x - ER_BOUNDS.x0) / NG.s)));
  const gj = Math.min(NG.ny - 1, Math.max(0, Math.floor((y - ER_BOUNDS.y0) / NG.s)));
  const gk = Math.min(NG.nz - 1, Math.max(0, Math.floor((z - ER_BOUNDS.z0) / NG.s)));
  const cell = NEAR[gi + NG.nx * (gj + NG.ny * gk)];
  if (cell === 0) return Infinity;
  if (cell === P_AIR) return -9;
  let d = Infinity;
  if (cell & P_HALL) d = hallBase(x, y, z);
  if (cell & P_FORGE) {
    const v = forgeBase(x, y, z);
    if (v < d) d = v;
    const a = boxSdf(ARMOURY, x, y, z);
    if (a < d) d = a;
  }
  let m = Infinity;
  let fy = 0;
  if (cell & P_MINE) {
    m = mineBase(x, y, z);
    fy = MINE.floor;
  }
  if (cell & P_RAMP) {
    const v = galleryBase(RAMP_G, x, y, z);
    if (v < m) {
      m = v;
      fy = galOut.fy;
    }
  }
  if (cell & P_DEEP) {
    const v = deepBase(x, y, z);
    if (v < m) {
      m = v;
      fy = DEEP_FLOOR;
    }
  }
  if (m < 0.9 && m > -0.9) {
    // Hewn walls: chisel-rough, the floor (of the nearest working) nearly smooth.
    m += (fbm3(x * 1.1, y * 1.1, z * 1.1) - 0.5) * (y - fy < 0.35 ? 0.06 : 0.2);
  }
  if (m < d) d = m;
  if (d === Infinity || d > 2.5) return Infinity;
  if (cell & P_RUB && d < 2 && y < HALL.floor + 2.5 && y > HALL.floor - 1) {
    let r = rubbleBase(x, y, z);
    if (r < 0.6) r += (fbm3(x * 1.7, y * 1.7, z * 1.7) - 0.5) * 0.5;
    if (-r > d) d = -r;
  }
  return d;
}

/** ereborCavity without the grid, every part evaluated (QA: qa/erebor/ident.mjs checks that both give the same field). */
export function ereborCavityFull(x, y, z) {
  if (y < ER_BOUNDS.y0 || y > ER_BOUNDS.y1) return Infinity;
  let d = ereborCarvedBase(x, y, z);
  let m = Infinity;
  let fy = 0;
  if (y > MINE.floor - CUT && y < MINE.floor + MINE.chamber.h + CUT) {
    m = mineBase(x, y, z);
    fy = MINE.floor;
  }
  if (y >= RAMP_G.y0 && y <= RAMP_G.y1) {
    const v = galleryBase(RAMP_G, x, y, z);
    if (v < m) {
      m = v;
      fy = galOut.fy;
    }
  }
  if (y < DEEP_FLOOR + DEEP_FACE.h + CUT) {
    const v = deepBase(x, y, z);
    if (v < m) {
      m = v;
      fy = DEEP_FLOOR;
    }
  }
  if (m < 0.9 && m > -0.9) m += (fbm3(x * 1.1, y * 1.1, z * 1.1) - 0.5) * (y - fy < 0.35 ? 0.06 : 0.2);
  if (m < d) d = m;
  if (d === Infinity || d > 2.5) return Infinity;
  if (d < 2 && y < HALL.floor + 2.5 && y > HALL.floor - 1) {
    let r = rubbleBase(x, y, z);
    if (r < 0.6) r += (fbm3(x * 1.7, y * 1.7, z * 1.7) - 0.5) * 0.5;
    if (-r > d) d = -r;
  }
  return d;
}

/** Marches down from y0 to the first solid point of ereborCavity (a deterministic floor height for the dressing). */
export function erFloorAt(x, z, y0, range = 4) {
  for (let y = y0; y > y0 - range; y -= 0.03) if (ereborCavity(x, y, z) > 0) return y + 0.02;
  return y0 - range;
}

/* ---------------------------------------------------------------- shading helpers (materials.js, per vertex) ---- */

/** 0..1: how much a surface point is the polished, carved hall stone (the great hall, the forges, the armoury). */
export function ereborHallWeight(x, y, z) {
  if (y > HALL.floor + 30 || y < FORGE.floor - 3) return 0;
  const d = ereborCarvedBase(x, y, z);
  if (d === Infinity) return 0;
  const k = 1 - smoothstep(0.1, 0.45, Math.abs(d));
  // The rubble heaps on the hall floor are raw rock, not carved stone.
  if (k > 0 && y < HALL.floor + 2.2 && rubbleBase(x, y, z) < 0.35) return 0;
  return k;
}

/**
 * 0..1: the ore at a point of the raw rock: thin veins of iron (rust-red) with gems in them (the shader's ore layer
 * draws both), richer deeper down.
 */
export function ereborOre(x, y, z) {
  const n = noise3(x * 0.23 + 3.1, y * 0.31, z * 0.23 - 7.7);
  const vein = 1 - smoothstep(0.006, 0.032, Math.abs(n - 0.5));
  if (vein <= 0) return 0;
  // Only in some stretches of the rock (the veins come and go).
  const mask = smoothstep(0.4, 0.62, noise3(x * 0.06 + 11, y * 0.08, z * 0.06 - 5));
  if (mask <= 0) return 0;
  const deep = smoothstep(-480, -575, y);
  return Math.min(1, vein * mask * (0.6 + 0.4 * deep) * (0.75 + 0.5 * noise3(x * 0.9, y * 0.9, z * 0.9)));
}

/* ---------------------------------------------------------------- tests ---- */

/** True when a world position is in the site's air or within `margin` metres of it in the rock (default 1.5 m). */
export function inErebor(x, y, z, margin = 1.5) {
  if (y > ER_BOUNDS.y1 + margin + 3 || y < ER_BOUNDS.y0 - margin) return false;
  CUT = Math.max(CUT_N, margin + 0.2);
  const d = ereborBase(x, y, z);
  CUT = CUT_N;
  return d < margin;
}

/** 0..1: how far into layer 8 a height is (0 above 471 m, 1 below 476 m): its air everywhere in the layer. */
export function ereborFactor(y) {
  return smoothstep(-471, -476, y);
}

/** True inside the carved halls (the great hall with its rooms, the forges): no cave-ins there (sound dwarf work). */
export function inCarvedHall(x, y, z) {
  return ereborCarvedBase(x, y, z) < 0.2;
}

/* ---------------------------------------------------------------- the light puzzle's geometry ---- */

/** The six pillars of the great hall (square, half size `h`; decor with colliders, erebor-pieces.js). */
export const PILLARS = [-4.2, 0, 4.2].flatMap((z) => [-3.4, 3.4].map((x) => ({ x, z, h: 0.6, base: 0.8, baseH: 0.55 })));
/** The great statue against the north wall: its pedestal box (plan) and the body's box above it. */
export const STATUE = { x: 0, z: -5.55, floor: HALL.floor, ped: { hx: 1.8, hz: 0.95, h: 1.9 }, body: { hx: 1.45, hz: 0.9, h: 9.4 } };

/** The light's way in: the mouth of the light shaft in the hall's roof. */
export const LIGHT_SOURCE = { x: SUN_SHAFT.x, y: fix(hallRoof(SUN_SHAFT.x, SUN_SHAFT.z) - 0.3), z: SUN_SHAFT.z };
/** Height of the light's path above the floor (the keyhole's height): mirrors turn the beam at this height. */
export const BEAM_Y = 1.0;
/** Radians off the door's normal (+x) within which a beam reaches the keyhole (outside it falls on the door's face). */
export const KEYHOLE_CONE = 0.2;

/**
 * The mirror sockets: walkable floor spots of the great hall (y on the floor), between the light's spot under the
 * shaft and the door. With the beam BEAM_Y above them, `LINES` says which pairs see each other.
 */
export const MIRROR_SOCKETS = [
  ['s1', 5.0, -5.0], ['s2', 5.0, -2.0], ['s3', 5.0, 2.2], ['s4', 1.6, 2.2], ['s5', 1.6, -2.0],
  ['s6', -1.6, -2.0], ['s7', -1.6, 5.6], ['s8', -5.0, 5.6], ['s9', -5.0, -2.0],
].map(([id, x, z]) => ({ id, x, y: HALL.floor, z }));

/** Plan boxes of the solid decor in the hall (pillars, the statue): they block the light for good. */
const HALL_SOLIDS = [
  ...PILLARS.map((p) => ({ x0: p.x - p.h, x1: p.x + p.h, z0: p.z - p.h, z1: p.z + p.h, y1: hallRoof(p.x, p.z) })),
  { x0: STATUE.x - STATUE.ped.hx, x1: STATUE.x + STATUE.ped.hx, z0: STATUE.z - STATUE.ped.hz, z1: STATUE.z + STATUE.ped.hz, y1: HALL.floor + 11 },
];

/**
 * What stands between two points (world): 'clear', 'pillar' (the hall's pillars or the statue: for good), 'rubble' (a
 * heap of fallen stone: dig it away) or 'rock' (the generated rock, e.g. a wall). Against the generated field and
 * the decor, not the dug terrain: at run time combine with world.js raycast (see NOTES-6a-erebor).
 */
export function lineBlock(a, b) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.05));
  let what = 'clear';
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    for (const s of HALL_SOLIDS) if (x > s.x0 - 0.04 && x < s.x1 + 0.04 && z > s.z0 - 0.04 && z < s.z1 + 0.04 && y < s.y1) return 'pillar';
    if (y < HALL.floor + 2.4 && y > HALL.floor - 0.5 && rubbleBase(x, y, z) < 0.04) what = 'rubble';
    else if (ereborBase(x, y, z) > 0.02 && what === 'clear') what = 'rock';
  }
  return what;
}

/**
 * The lines of sight between the light's spot, the sockets and the keyhole, at the beam's height: [{ a, b, block }]
 * (a, b: 'light', a socket id, 'keyhole'). The light comes straight down the shaft onto s1's spot.
 */
export const LINES = (() => {
  const P = new Map(MIRROR_SOCKETS.map((s) => [s.id, { x: s.x, y: s.y + BEAM_Y, z: s.z }]));
  P.set('keyhole', { x: KEYHOLE.x + 0.02, y: KEYHOLE.y, z: KEYHOLE.z });
  const out = [{ a: 'light', b: 's1', block: lineBlock(LIGHT_SOURCE, P.get('s1')) }];
  const ids = [...P.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = P.get(ids[i]);
      const b = P.get(ids[j]);
      let block = lineBlock(a, b);
      // The keyhole takes the light only nearly straight on (a beam at a slant falls on the door's face).
      if (ids[j] === 'keyhole' && block === 'clear' && Math.abs(Math.atan2(a.z - b.z, a.x - b.x)) > KEYHOLE_CONE) block = 'angle';
      out.push({ a: ids[i], b: ids[j], block });
    }
  }
  return out;
})();

/** The rune-locked chests' spots (floor points; yaw: three.js, 0 faces −z): the hall, the mine level, the forges, the deep. */
export const RUNE_CHESTS = [
  { id: 'hall', x: 5.65, y: HALL.floor, z: 5.4, yaw: Math.PI / 2 },
  { id: 'mine', x: 1.2, y: MINE.floor, z: -1.2, yaw: -Math.PI / 4 + Math.PI },
  { id: 'forge', x: -5.6, y: FORGE.floor, z: -1.6, yaw: -Math.PI / 2 },
  { id: 'deep', x: 3.75, y: DEEP_FLOOR, z: -2.7, yaw: 2.3 },
].map((c) => ({ ...c, yaw: fix(c.yaw, 3) }));

/* ---------------------------------------------------------------- finds, the mithril shirt, the lift ---- */

/** The famous find's spot: the harps hanging on the alcove's back wall (a swing at them takes them). */
export const FAMOUS8 = { x: fix(ALCOVE.x1 - 0.08), y: fix(HALL.floor + 1.45), z: 0 };
/** The mithril shirt on its stand against the armoury's east wall, facing the walled-up doorway (−x). */
export const MITHRIL = { x: fix(ARMOURY.x1 - 0.45), y: ARMOURY.y0, z: 0, yaw: Math.PI / 2 };
/** Where the layer-8 lift lands (the column is lift.js's, x −4, z 9): in the ramp at the hall's south door. */
export const LIFT8 = { x: -4, y: HALL.floor, z: 9 };

/* ---------------------------------------------------------------- the provider ---- */

/**
 * The mines of Erebor as a site provider for the Durin's Day door and the rune chests (src/erebor-puzzles/). All points
 * are world positions; floor points have y on the floor. The effects module (erebor-fx.js: setDoorOpen, setBeam,
 * setChestOpen) is game.decor.ereborFx.
 */
export const EREBOR_SITE_PROVIDER = {
  inErebor: (x, y, z) => inErebor(x, y, z),
  ereborFactor: (y) => ereborFactor(y),
  door: { x: DOOR.x, y: DOOR.y, z: DOOR.z, nx: DOOR.nx, nz: DOOR.nz, w: DOOR.w, h: DOOR.h },
  lightSource: LIGHT_SOURCE,
  mirrorSockets: MIRROR_SOCKETS,
  keyhole: KEYHOLE,
  behindDoor: BEHIND_DOOR,
  runeChests: RUNE_CHESTS,
  // Also useful: the beam's height over the sockets, the lines of sight (with what blocks them), a line test, the
  // rubble heaps, the pillars, the hall, the lift landing.
  beamY: BEAM_Y,
  keyholeCone: KEYHOLE_CONE,
  lines: LINES,
  lineBlock: (a, b) => lineBlock(a, b),
  rubble: RUBBLE.map((r) => ({ id: r.id, x: r.x, y: HALL.floor, z: r.z, r: r.r, h: r.h })),
  pillars: PILLARS.map((p) => ({ x: p.x, z: p.z, half: p.h })),
  hall: { x0: -HALL.a, x1: HALL.a, y0: HALL.floor, y1: HALL.floor + HALL.wall, z0: -HALL.a, z1: HALL.a },
  lift: LIFT8,
};
