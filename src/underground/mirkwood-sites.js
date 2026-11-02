/* ==== underground/mirkwood-sites.js — the roots of Mirkwood (layer 6, 300–390 m; TERV 0.2 "Bakacsinerdő gyökerei",
   0.12 "Bakacsinerdő zöldes, pókhálós homálya"): where everything is, the air it stamps into the density field, the
   giant roots (solid, part of the diggable field), the water (the enchanted stream, the river under the Elvenking's
   halls), and the hooks for the spiders / elves / barrel work (src/enemies/). Pure data and maths (no three.js):
   world.js (through sites.js) uses mirkCavity() for generate(), materials.js asks rootSurfaceDist() and carvedDist()
   per vertex for the bark and the carved stone, mirkwood-pieces.js and mirkwood-water.js dress it from the same data.

   The layout (world y; the films first, the book where the films show nothing):
   - THE ROOT TUNNEL: the way in. A dead end just below the layer's top (under Gollum's lake: players break into it by
     digging down), an earthy tube that spirals down along the block's walls once (roots cross it); its last quarter
     runs along the root hall's wall as an open gallery and it ends in the hall's north side.
   - THE ROOT HALL: a tall domed cavern of dark loam, its roof a tangle of Mirkwood's giant roots that come down to the
     floor and crawl along it; roots also cross the hall high up. Webs hang between the roots (the spiders' place).
     THE ENCHANTED STREAM (book ch. 8: the black, enchanted river; whoever falls in falls asleep) crosses the floor
     from the west wall to the east wall; a fallen root lies across it. Three glowing clearings: the elves' feast
     lights (book ch. 8), which go out when somebody rushes in.
   - THE ELVENKING'S HALLS (book ch. 8–9: the great cave of the Elvenking with carved stone, the dungeons, the cellars
     over the river; the film: pale carved stone, the gates): from the hall's south-east corner the carved GATE and a
     spiral stair go down 18 m to the KING'S HALL (pillars, a throne at the west end, a small armoury alcove), the
     DUNGEON corridor with six cells with wooden doors, and the WINE CELLAR with the barrels and the TRAPDOOR over the
     river.
   - THE RIVER: under the trapdoor a short underground river flows west to a grotto pool with a dry bank (the barrels'
     way out; the lift stop "Bakacsinerdő · 351 m" lands on that bank). ==== */
import { fbm3, noise2 } from '../noise.js';

/* ---------------------------------------------------------------- shared helpers ---- */

/** Below this world height materials.js and the soil shader read the bark / carved-stone channels (all other
 * weights are 0 there). */
export const MIRK_SHADE_Y = -296;

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const smoothstep = (a, b, x) => smooth01((x - a) / (b - a));

/** Catmull-Rom subdivision of a polyline of [x, y, z, (r)] points into steps of about `step` metres. */
function spline(pts, step) {
  const out = [];
  const dim = pts[0].length;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    let len = 0;
    for (let c = 0; c < Math.min(3, dim); c++) len += (p2[c] - p1[c]) ** 2;
    const n = Math.max(1, Math.ceil(Math.sqrt(len) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const q = [];
      for (let c = 0; c < dim; c++) {
        q.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
      }
      out.push(q);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/** Distance in the plan from (x, z) to a 2D polyline [[x, z]…]; `out.t` = the arc length of the nearest point. */
function planPolyDist(x, z, pts, out) {
  let best = Infinity;
  let arc = 0;
  let bestArc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const vx = b[0] - a[0];
    const vz = b[1] - a[1];
    const l2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2));
    const ex = x - a[0] - vx * t;
    const ez = z - a[1] - vz * t;
    const d = ex * ex + ez * ez;
    if (d < best) {
      best = d;
      bestArc = arc + Math.sqrt(l2) * t;
    }
    arc += Math.sqrt(l2);
  }
  if (out) out.t = bestArc;
  return Math.sqrt(best);
}

/* ---------------------------------------------------------------- the root hall ---- */

/** The root hall's plan (centre, half size of its rounded-square outline, superellipse exponent) and heights. */
export const CAV = { x: 0, z: 0, a: 8.3, p: 3.0, floor: -328, roofMid: 14.5, roofEdge: 2.6 };

/** The hall outline's radius (m) in the plan direction `th`. */
export function caveRadius(th) {
  const c = Math.abs(Math.cos(th));
  const s = Math.abs(Math.sin(th));
  const sq = CAV.a / Math.pow(c ** CAV.p + s ** CAV.p, 1 / CAV.p);
  return sq * (1 + 0.03 * Math.sin(3 * th + 0.7) + 0.025 * Math.sin(5 * th + 1.9));
}

const PR = [0, 0];
/** Plan position → [angle, normalised radius (0 centre, 1 the wall at the floor)]. */
export function planCoords(x, z, out = PR) {
  const dx = x - CAV.x;
  const dz = z - CAV.z;
  const th = Math.atan2(dz, dx);
  out[0] = th;
  out[1] = Math.sqrt(dx * dx + dz * dz) / caveRadius(th);
  return out;
}

/* ---- the enchanted stream ---- */

/** The stream's water level (world y), its half width and its bed below the water. */
export const STREAM_Y = CAV.floor - 0.3;
export const STREAM_HW = 0.85;
const STREAM_DEPTH = 0.9;
/** The stream's course in the plan, west wall to east wall (smoothed). */
export const STREAM = spline([[-10.0, -0.6], [-7.0, -1.9], [-4.2, -1.2], [-1.6, 0.6], [1.2, 0.4], [3.8, -1.3], [6.4, -0.9], [10.0, 0.8]], 0.5);
const STREAM_BOX = { x0: -10.5, x1: 10.5, z0: -3.2, z1: 2.6 };

/** Plan distance to the stream's centre line (Infinity far from it). */
export function streamDist(x, z) {
  if (x < STREAM_BOX.x0 || x > STREAM_BOX.x1 || z < STREAM_BOX.z0 || z > STREAM_BOX.z1) return Infinity;
  return planPolyDist(x, z, STREAM);
}

/**
 * The root hall's floor without noise (world y): gently uneven dark loam, rising to meet the roof beyond the wall, with
 * the stream's channel cut into it.
 */
export function floorBase(x, z) {
  planCoords(x, z);
  const t = PR[1];
  let f = CAV.floor + (noise2(x * 0.23 + 3.1, z * 0.23 - 1.7) - 0.5) * 0.5 + 1.6 * smoothstep(0.93, 1.07, t);
  const q = streamDist(x, z);
  if (q < 2) {
    const chan = STREAM_Y - STREAM_DEPTH + (STREAM_DEPTH + 0.05) * (q / STREAM_HW) ** 2;
    if (chan < f) f = chan;
  }
  return f;
}

/** The root hall's roof without noise (world y): a tall dome, down to the floor at the wall. */
export function roofBase(x, z) {
  planCoords(x, z);
  const t = PR[1];
  const k = 1 - t * t * t * t;
  return CAV.floor + CAV.roofEdge + (CAV.roofMid - CAV.roofEdge) * (k > 0 ? Math.sqrt(k) : 0) - (t > 1 ? (t - 1) * 9 : 0);
}

const CAV_Y0 = CAV.floor - 2.5;
const CAV_Y1 = CAV.floor + CAV.roofMid + 1.5;
const COL = { x: NaN, z: NaN, f: 0, r: 0 };
/** Floor and roof of the last plan position asked for (generate() walks each column bottom to top). */
function column(x, z) {
  if (x !== COL.x || z !== COL.z) {
    COL.x = x;
    COL.z = z;
    COL.f = floorBase(x, z);
    COL.r = roofBase(x, z);
  }
  return COL;
}

/** Signed distance of the root hall's air without noise and without the roots (negative inside). */
function caveBase(x, y, z) {
  if (y < CAV_Y0 || y > CAV_Y1 || x < -11 || x > 11 || z < -11 || z > 11) return Infinity;
  const col = column(x, z);
  return Math.max(col.f - y, y - col.r, (col.f + 0.3 - col.r) * 0.5);
}

/* ---------------------------------------------------------------- the root tunnel ---- */

const TUBE_R = 1.1;
const PATH_H = 9.0;
const PATH_CR = 2.8;
const SLOPE = 0.3;
/** The dead end's floor (kept low enough that the tunnel's air and its noise stay below 301.9 m). */
const TOP_FLOOR = -304.6;
/** The tunnel's floor where it leaves the spiral (the middle of the north side) for the last ramp into the hall. */
const END_Y = -324.6;

/** A point on the rounded-square loop at arc length `a` (the lake tunnel's loop, lake-sites.js). */
function loopPoint(a) {
  const H = PATH_H;
  const cr = PATH_CR;
  const L = 2 * (H - cr);
  const Q = (Math.PI / 2) * cr;
  const per = 4 * (L + Q);
  let s = ((a % per) + per) % per;
  const side = Math.floor(s / (L + Q));
  s -= side * (L + Q);
  let lx;
  let lz;
  if (s < L) {
    lx = H;
    lz = H - cr - s;
  } else {
    const ang = (s - L) / cr;
    lx = H - cr + Math.cos(ang) * cr;
    lz = -(H - cr) - Math.sin(ang) * cr;
  }
  const rot = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]][side];
  return [rot[0] * lx + rot[1] * lz, rot[2] * lx + rot[3] * lz];
}

/** Tunnel floor points [x, y, z] from the dead end down to the root hall's floor (about 2 m apart). */
export const TUNNEL6 = (() => {
  const Ls = 2 * (PATH_H - PATH_CR);
  const Q = (Math.PI / 2) * PATH_CR;
  // The middle of the north side (x 0, z +H), heading east.
  const aEnd = -Q - Ls / 2;
  const L = (END_Y - TOP_FLOOR) / -SLOPE;
  const pts = [];
  const n = Math.ceil(L / 2);
  for (let i = 0; i <= n; i++) {
    const a = aEnd - L + (L * i) / n;
    const [x, z] = loopPoint(a);
    pts.push([x, TOP_FLOOR - (SLOPE * (L * i)) / n, z]);
  }
  for (const p of [[1.1, -325.2, 8.4], [1.5, -326.3, 7.2], [1.4, -327.4, 5.8]]) pts.push(p);
  return pts;
})();

const SEGS = [];
const SEG_M = TUBE_R + 2.4;
for (let i = 0; i + 1 < TUNNEL6.length; i++) {
  const a = TUNNEL6[i];
  const b = TUNNEL6[i + 1];
  SEGS.push({
    a, b, y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]),
    x0: Math.min(a[0], b[0]) - SEG_M, x1: Math.max(a[0], b[0]) + SEG_M, z0: Math.min(a[2], b[2]) - SEG_M, z1: Math.max(a[2], b[2]) + SEG_M,
  });
}
const T_BUCKET_Y0 = -332;
const T_BUCKETS = Array.from({ length: 32 }, () => []);
SEGS.forEach((s, i) => {
  const lo = Math.max(0, Math.floor(s.y0 - 1.5 - T_BUCKET_Y0));
  const hi = Math.min(T_BUCKETS.length - 1, Math.floor(s.y1 + 2 * TUBE_R + 1.5 - T_BUCKET_Y0));
  for (let k = lo; k <= hi; k++) T_BUCKETS[k].push(i);
});

const segOut = { t: 0 };
function segDist(px, py, pz, a, b, out) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const vz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy + (pz - a[2]) * vz) / (vx * vx + vy * vy + vz * vz)));
  out.t = t;
  const ex = px - a[0] - vx * t;
  const ey = py - a[1] - vy * t;
  const ez = pz - a[2] - vz * t;
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

/** Signed distance of the tunnel's air (a tube with a flat floor); Infinity when far. */
function tunnelBase(x, y, z) {
  const k = Math.floor(y - T_BUCKET_Y0);
  if (k < 0 || k >= T_BUCKETS.length) return Infinity;
  const list = T_BUCKETS[k];
  let best = Infinity;
  for (let n = 0; n < list.length; n++) {
    const s = SEGS[list[n]];
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const dist = segDist(x, y - 0.6 * TUBE_R, z, s.a, s.b, segOut);
    const fy = s.a[1] + (s.b[1] - s.a[1]) * segOut.t;
    const d = Math.max(dist - TUBE_R, fy - y);
    if (d < best) best = d;
  }
  return best;
}

/* ---------------------------------------------------------------- the giant roots ---- */

/**
 * A root coming down from the roof at (x0, z0) to its foot at (x1, z1), crawling on along the floor in direction
 * (dx, dz) and sinking into it. r0: radius at the roof, r1 at the foot. `sway` bends the middle sideways.
 */
function descRoot(x0, z0, x1, z1, dx, dz, r0, r1, sway) {
  const roof = roofBase(x0, z0);
  const fl = CAV.floor;
  const h = roof - fl;
  const px = -(z1 - z0);
  const pz = x1 - x0;
  const pl = Math.hypot(px, pz) || 1;
  const sx = (px / pl) * sway;
  const sz = (pz / pl) * sway;
  const lerp = (a, b, t) => a + (b - a) * t;
  return [
    [x0, roof + 1.6, z0, r0 * 1.15],
    [lerp(x0, x1, 0.2) + sx, roof - h * 0.2, lerp(z0, z1, 0.2) + sz, r0],
    [lerp(x0, x1, 0.6) - sx * 0.7, fl + h * 0.38, lerp(z0, z1, 0.6) - sz * 0.7, r0 * 0.82],
    [x1, fl + 1.0, z1, r1 * 1.2],
    [x1 + dx * 1.5, fl + 0.12, z1 + dz * 1.5, r1 * 0.85],
    [x1 + dx * 3.2, fl - 0.6, z1 + dz * 3.2, r1 * 0.55],
  ];
}

/** Every root as a smoothed polyline of [x, y, z, r] (r ≥ 0.3: thinner ones are decor, see mirkwood-pieces.js). */
export const ROOTS = (() => {
  const raw = [
    // Roots coming down from the roof to the floor (positions kept off the stream, the clearings, the gate and the
    // tunnel's mouth).
    descRoot(0.4, -1.4, -0.6, -3.4, -0.8, -0.6, 1.25, 0.8, 0.8),
    descRoot(-2.2, -3.0, -2.8, -4.9, 0.8, -0.5, 0.95, 0.62, -0.7),
    descRoot(2.0, 2.6, 3.6, 4.2, 0.5, 0.8, 0.9, 0.6, 0.6),
    descRoot(-1.0, 3.2, -2.6, 5.4, -0.6, 0.8, 0.85, 0.58, -0.6),
    descRoot(3.4, -2.6, 3.0, -4.8, 0.25, -1.0, 0.8, 0.55, 0.7),
    descRoot(-4.6, 1.8, -6.4, 3.0, -0.8, 0.3, 0.8, 0.55, 0.5),
    descRoot(5.4, 1.2, 6.6, 3.0, 0.6, 0.6, 0.75, 0.5, -0.5),
    descRoot(-3.8, -5.6, -3.4, -7.4, 0.3, -1.0, 0.75, 0.5, 0.5),
    descRoot(2.6, 5.4, 2.4, 7.4, 0.1, 1.0, 0.7, 0.48, 0.4),
    // Roots crossing the hall high up, wall to wall (the tangle overhead).
    [[-9.6, -317.4, 2.8, 0.75], [-5.0, -319.6, 2.2, 0.7], [-1.0, -320.6, 1.0, 0.62], [3.5, -319.8, -0.4, 0.6], [8.8, -317.2, -1.6, 0.6]],
    [[1.8, -316.6, 9.4, 0.7], [0.6, -319.4, 4.6, 0.62], [-0.8, -321.0, -1.0, 0.55], [-1.6, -319.6, -5.2, 0.55], [-2.2, -316.8, -9.4, 0.62]],
    [[-9.4, -323.0, -4.2, 0.6], [-6.4, -324.4, -6.0, 0.52], [-3.4, -324.2, -7.6, 0.5], [-1.4, -322.6, -9.4, 0.55]],
    [[9.4, -321.4, 4.6, 0.6], [6.2, -323.6, 5.6, 0.5], [4.4, -323.0, 7.6, 0.5], [3.4, -321.6, 9.4, 0.55]],
    // The fallen root over the stream (a bridge: its top about 0.35 m above the floor on both banks).
    [[0.7, -328.9, -3.6, 0.45], [1.0, -328.08, -1.6, 0.45], [1.25, -328.02, 0.4, 0.44], [1.5, -328.08, 2.4, 0.42], [1.8, -328.9, 4.0, 0.38]],
    // Roots crossing the tunnel near its ceiling (bulging down into it a little).
    ...[0.12, 0.27, 0.43, 0.58, 0.7].map((f) => {
      const i = Math.floor(f * (TUNNEL6.length - 5));
      const a = TUNNEL6[i];
      const b = TUNNEL6[i + 1];
      const tx = b[0] - a[0];
      const tz = b[2] - a[2];
      const l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l;
      const nz = tx / l;
      const y = a[1] + 2.05;
      return [[a[0] - nx * 2.4, y + 0.5, a[2] - nz * 2.4, 0.38], [a[0], y, a[2], 0.34], [a[0] + nx * 2.4, y + 0.6, a[2] + nz * 2.4, 0.38]];
    }),
  ];
  return raw.map((r) => spline(r, 0.7));
})();

const RSEGS = [];
for (const root of ROOTS) {
  for (let i = 0; i + 1 < root.length; i++) {
    const a = root[i];
    const b = root[i + 1];
    const m = Math.max(a[3], b[3]) + 0.6;
    RSEGS.push({
      a, b, ra: a[3], rb: b[3],
      x0: Math.min(a[0], b[0]) - m, x1: Math.max(a[0], b[0]) + m, y0: Math.min(a[1], b[1]) - m, y1: Math.max(a[1], b[1]) + m, z0: Math.min(a[2], b[2]) - m, z1: Math.max(a[2], b[2]) + m,
    });
  }
}
const R_BUCKET_Y0 = -332;
const R_BUCKETS = Array.from({ length: 34 }, () => []);
RSEGS.forEach((s, i) => {
  const lo = Math.max(0, Math.floor(s.y0 - R_BUCKET_Y0));
  const hi = Math.min(R_BUCKETS.length - 1, Math.floor(s.y1 - R_BUCKET_Y0));
  for (let k = lo; k <= hi; k++) R_BUCKETS[k].push(i);
});

/** Distance (m) from a point to the nearest root's surface (negative inside a root); Infinity when none is near. */
export function rootSurfaceDist(x, y, z) {
  const k = Math.floor(y - R_BUCKET_Y0);
  if (k < 0 || k >= R_BUCKETS.length) return Infinity;
  const list = R_BUCKETS[k];
  let best = Infinity;
  for (let n = 0; n < list.length; n++) {
    const s = RSEGS[list[n]];
    if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1 || z < s.z0 || z > s.z1) continue;
    const d = segDist(x, y, z, s.a, s.b, segOut) - (s.ra + (s.rb - s.ra) * segOut.t);
    if (d < best) best = d;
  }
  return best;
}

/* ---------------------------------------------------------------- the Elvenking's halls ---- */

/** The floor of the halls (world y). */
export const HF = -346;

/**
 * Carved rooms: a box in the plan with walls `wall` high and a vault of `rise` across its narrow side (`axis` 'x':
 * the vault runs along x), or a flat ceiling (rise 0). `rot` (optional) turns a room about its centre. Rooms that
 * join overlap by a metre or more: the union of two boxes' distances underrates the distance in a short overlap, and
 * the player's head check (player.js "squeezed") would then stop him in the opening.
 */
export const ROOMS6 = [
  { id: 'hall', x0: -8.6, x1: 5.0, z0: -10.0, z1: -3.4, y: HF, wall: 3.2, rise: 2.4, axis: 'x' },
  { id: 'armoury', x0: -10.2, x1: -7.4, z0: -8.3, z1: -5.1, y: HF, wall: 2.1, rise: 0.8, axis: 'x' },
  { id: 'corridor', x0: -4.0, x1: -2.0, z0: -5.0, z1: 6.0, y: HF, wall: 2.2, rise: 0.6, axis: 'z' },
  { id: 'cellar', x0: -4.2, x1: 8.6, z0: 4.6, z1: 10.0, y: HF, wall: 2.6, rise: 1.4, axis: 'x' },
  { id: 'stair-exit', x0: 4.4, x1: 6.4, z0: -8.7, z1: -6.9, y: HF, wall: 2.2, rise: 0.5, axis: 'x' },
];
/** The gate passage from the root hall's south-east corner to the stair's top: centre, length along `rot`, width. */
export const GATE_PASSAGE = { id: 'gate', cx: 6.0, cz: -6.0, len: 3.4, w: 2.4, y: CAV.floor, wall: 2.6, rise: 0.8, rot: Math.PI / 4 };
/** Where the gate's portal stands (facing the root hall, yaw: three.js, 0 looks along −z). */
export const GATE = { x: 5.2, y: CAV.floor, z: -5.2, yaw: (3 * Math.PI) / 4 };

/** The cells (book ch. 9: the dwarves were shut in separate cells with stout wooden doors): plan box, door side. */
export const CELLS6 = [];
for (const [side, zc] of [[-1, -1.9], [-1, 0.5], [-1, 2.9], [1, -1.9], [1, 0.5], [1, 2.9]]) {
  const x0 = side < 0 ? -6.6 : -1.6;
  const x1 = side < 0 ? -4.4 : 0.6;
  const doorX = side < 0 ? -4.2 : -1.8;
  CELLS6.push({ x0, x1, z0: zc - 1.0, z1: zc + 1.0, y: HF, h: 2.3, side, zc, doorX });
}
/** The cells' undiggable shells (sites.js LOCKS): a captured player can leave only by the door. */
export const CELL_LOCKS = CELLS6.map((c) => ({ x0: c.x0 - 0.45, x1: c.x1 + 0.45, y0: c.y - 0.45, y1: c.y + c.h + 0.45, z0: c.z0 - 0.45, z1: c.z1 + 0.45 }));

/** The trapdoor in the cellar floor over the river (book ch. 9: the barrels were rolled through it into the water). */
export const TRAPDOOR = { x: 5.6, y: HF, z: 7.4, half: 0.65 };

/** The spiral stair (carved, round a central newel) from the gate's passage down to the king's hall. */
export const STAIR = { x: 7.8, z: -7.8, rIn: 0.85, rOut: 2.3, top: CAV.floor, bottom: HF, head: 2.25 };
const STAIR_TH0 = Math.atan2(1, -1);
const STAIR_PHI = Math.PI - STAIR_TH0 + 2 * Math.PI * 5;
const STAIR_PITCH = ((STAIR.top - STAIR.bottom) * 2 * Math.PI) / STAIR_PHI;

/** Signed distance of the stair's air (negative inside); Infinity when far. */
function stairBase(x, y, z) {
  if (y < STAIR.bottom - 1 || y > STAIR.top + 3.5) return Infinity;
  const dx = x - STAIR.x;
  const dz = z - STAIR.z;
  const r = Math.sqrt(dx * dx + dz * dz);
  if (r > STAIR.rOut + 2) return Infinity;
  let th = Math.atan2(dz, dx) - STAIR_TH0;
  th = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // The turn whose floor is the nearest one below y.
  const k = Math.ceil(((STAIR.top - y) / STAIR_PITCH) - th / (2 * Math.PI));
  let phi = th + 2 * Math.PI * k;
  if (phi < 0) phi += 2 * Math.PI;
  if (phi < 0 || phi > STAIR_PHI) return Math.max(r - STAIR.rOut, STAIR.rIn - r, 0.5);
  const fl = STAIR.top - (phi * STAIR_PITCH) / (2 * Math.PI);
  return Math.max(r - STAIR.rOut, STAIR.rIn - r, fl - y, y - (fl + STAIR.head));
}

/** Floor height of the stair at a plan point (for the dressing and QA): the nearest turn below y0. */
export function stairFloorAt(x, z, y0) {
  const dx = x - STAIR.x;
  const dz = z - STAIR.z;
  let th = Math.atan2(dz, dx) - STAIR_TH0;
  th = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const k = Math.ceil(((STAIR.top - y0) / STAIR_PITCH) - th / (2 * Math.PI));
  const phi = Math.min(STAIR_PHI, th + 2 * Math.PI * Math.max(0, k));
  return STAIR.top - (phi * STAIR_PITCH) / (2 * Math.PI);
}

/** One carved room's signed distance (negative inside). */
function roomSdf(r, x, y, z) {
  let lx;
  let lz;
  let hl;
  let hw;
  if (r.rot !== undefined) {
    const c = Math.cos(r.rot);
    const s = Math.sin(r.rot);
    const dx = x - r.cx;
    const dz = z - r.cz;
    lx = dx * c - dz * s;
    lz = dx * s + dz * c;
    hl = r.len / 2;
    hw = r.w / 2;
  } else if (r.axis === 'x') {
    lx = x - (r.x0 + r.x1) / 2;
    lz = z - (r.z0 + r.z1) / 2;
    hl = (r.x1 - r.x0) / 2;
    hw = (r.z1 - r.z0) / 2;
  } else {
    lx = z - (r.z0 + r.z1) / 2;
    lz = x - (r.x0 + r.x1) / 2;
    hl = (r.z1 - r.z0) / 2;
    hw = (r.x1 - r.x0) / 2;
  }
  const ly = y - r.y;
  let d2;
  if (ly > r.wall && r.rise > 0) d2 = (Math.hypot(lz / hw, (ly - r.wall) / r.rise) - 1) * Math.min(hw, r.rise);
  else d2 = Math.max(Math.abs(lz) - hw, ly - r.wall);
  return Math.max(d2, Math.abs(lx) - hl, -ly);
}

function boxSdf(x0, x1, y0, y1, z0, z1, x, y, z) {
  return Math.max(x0 - x, x - x1, y0 - y, y - y1, z0 - z, z - z1);
}

/** Signed distance of every carved space (halls, stair, gate passage, cells, trapdoor shaft); Infinity when far. */
export function carvedBase(x, y, z) {
  let d = stairBase(x, y, z);
  if (y > CAV.floor - 1 && y < CAV.floor + 5) {
    const g = roomSdf(GATE_PASSAGE, x, y, z);
    if (g < d) d = g;
  }
  if (y > RW - 0.5 && y < HF + 7) {
    for (let i = 0; i < ROOMS6.length; i++) {
      const r = ROOMS6[i];
      if (x < r.x0 - 2.5 || x > r.x1 + 2.5 || z < r.z0 - 2.5 || z > r.z1 + 2.5) continue;
      const v = roomSdf(r, x, y, z);
      if (v < d) d = v;
    }
    if (x > -9 && x < 3 && z > -5.5 && z < 6.5) {
      for (const c of CELLS6) {
        const v = boxSdf(c.x0, c.x1, c.y, c.y + c.h, c.z0, c.z1, x, y, z);
        if (v < d) d = v;
        const dv = boxSdf(c.doorX - 0.9, c.doorX + 0.9, c.y, c.y + 2.05, c.zc - 0.48, c.zc + 0.48, x, y, z);
        if (dv < d) d = dv;
      }
    }
    const t = TRAPDOOR;
    const tv = boxSdf(t.x - t.half, t.x + t.half, RW + 0.8, HF + 0.05, t.z - t.half, t.z + t.half, x, y, z);
    if (tv < d) d = tv;
  }
  return d;
}

/** Distance into the rock from the nearest carved surface (≤ 0 in the carved air): for the carved-stone shading. */
export function carvedDist(x, y, z) {
  return carvedBase(x, y, z);
}

/* ---------------------------------------------------------------- the river and the grotto ---- */

/** The river's water level (world y). The cellar floor is 6.4 m above it (a drop through the trapdoor is safe). */
export const RW = -352.4;
const RIVER_HW = 1.1;
/**
 * The river's course in the plan (smoothed): in from under the cellar's north-east corner, under the trapdoor, then
 * round the block under the halls (east side south, along the south side under the king's hall, up the west side) to
 * the grotto: about 50 m, a ride of half a minute (NOTES-4b-spiders-elves asked for a longer one than the first 25 m).
 */
export const RIVER = spline([[7.6, 9.3], [5.6, 7.4], [7.6, 5.6], [8.8, 2.0], [8.8, -3.0], [8.3, -7.6], [5.0, -8.9], [0.0, -8.6], [-4.5, -8.9], [-8.2, -7.8], [-8.9, -3.5], [-8.6, 0.5], [-7.6, 3.6], [-6.4, 5.6]], 0.5);
/** The grotto: plan centre and radii, its pool (centre and radius) and the dry bank's level. */
export const GROTTO = { x: -6.2, z: 7.0, rx: 3.2, rz: 2.9, pool: { x: -6.6, z: 6.3, r: 1.9 }, bank: RW + 0.8 };

function riverBase(x, y, z) {
  if (y < RW - 1.5 || y > RW + 3.2) return Infinity;
  const q = planPolyDist(x, z, RIVER);
  if (q > RIVER_HW + 2.5) return Infinity;
  const top = y - (RW + 0.6);
  const side = top > 0 ? (Math.hypot(q / RIVER_HW, top / 1.1) - 1) * Math.min(RIVER_HW, 1.1) : q - RIVER_HW;
  return Math.max(side, RW - 0.6 - y);
}

function grottoFloor(x, z) {
  const dp = Math.hypot(x - GROTTO.pool.x, z - GROTTO.pool.z);
  return RW - 0.55 + (GROTTO.bank - (RW - 0.55)) * smoothstep(GROTTO.pool.r - 0.3, GROTTO.pool.r + 0.5, dp);
}

function grottoBase(x, y, z) {
  if (y < RW - 1.5 || y > RW + 5) return Infinity;
  const ex = (x - GROTTO.x) / GROTTO.rx;
  const ez = (z - GROTTO.z) / GROTTO.rz;
  const e = Math.sqrt(ex * ex + ez * ez);
  if (e > 1.8) return Infinity;
  const roof = RW + 1.2 + 2.4 * Math.sqrt(Math.max(0, 1 - e * e * e * e));
  return Math.max(grottoFloor(x, z) - y, y - roof, (e - 1) * Math.min(GROTTO.rx, GROTTO.rz));
}

/** True for a plan point over the river's or the pool's water (the fixed water outline). */
export function inRiverPlan(x, z) {
  if (Math.hypot(x - GROTTO.pool.x, z - GROTTO.pool.z) < GROTTO.pool.r + 0.25) return true;
  return planPolyDist(x, z, RIVER) < RIVER_HW + 0.05;
}

/* ---------------------------------------------------------------- the cavity field ---- */

/** The bounds of the whole site's air (kept below 301.9 m: with nearSite's 1.6 m margin layer 5 is untouched). */
export const MIRK_BOUNDS = { x0: -12, x1: 12, y0: -358, y1: -301.9, z0: -12, z1: 12 };

/** Natural air (root hall, tunnel, river, grotto) without noise and roots; Infinity when far. */
function naturalBase(x, y, z) {
  let d = caveBase(x, y, z);
  const t = tunnelBase(x, y, z);
  if (t < d) d = t;
  if (y < RW + 5) {
    const r = riverBase(x, y, z);
    if (r < d) d = r;
    const g = grottoBase(x, y, z);
    if (g < d) d = g;
  }
  if (d === Infinity) return d;
  // Everything closes before the block's side walls (a smooth union with a wall plane 1.8 m in).
  const edge = Math.min(x + 12, 12 - x, z + 12, 12 - z);
  if (edge < 3.2) {
    const w = 1.8 - edge;
    const kk = 0.9;
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (w - d)) / kk));
    d = d + (w - d) * h + kk * h * (1 - h);
  }
  return d;
}

/**
 * Signed distance (m, negative in the air) of the whole site without noise, roots included (solid); Infinity outside
 * its bounds. Cheap enough for per-frame tests (inMirkwood) and the dressing's placement.
 */
export function mirkBase(x, y, z) {
  if (y < MIRK_BOUNDS.y0 || y > MIRK_BOUNDS.y1) return Infinity;
  let d = naturalBase(x, y, z);
  if (d < 2.5) {
    const rd = rootSurfaceDist(x, y, z);
    if (-rd > d) d = -rd;
  }
  const c = carvedBase(x, y, z);
  return c < d ? c : d;
}

/**
 * The cavity at a world point as generate() stamps it: the natural air with craggy noise (strong on the roof and the
 * walls, faint on the floors), the roots with a knobbly bark noise (solid), and the carved spaces crisp. Negative in the
 * air, Infinity outside the bounds. Deterministic (the save stores the terrain as differences from generate()).
 */
export function mirkCavity(x, y, z) {
  if (y < MIRK_BOUNDS.y0 || y > MIRK_BOUNDS.y1) return Infinity;
  let d = naturalBase(x, y, z);
  if (d !== Infinity && d < 2.2 && d > -2.2) {
    let amp = 0.5;
    if (y < CAV_Y1 && x > -11 && x < 11 && z > -11 && z < 11 && y > CAV_Y0) {
      const f = column(x, z).f;
      const above = y - f;
      amp = 0.5 - 0.4 * (1 - smoothstep(0.1, 0.9, above));
    } else if (y < RW + 1) amp = 0.18;
    const rough = (fbm3(x * 0.42, y * 0.42, z * 0.42) - 0.5) * 1.5 + (fbm3(x * 1.35, y * 1.35, z * 1.35) - 0.5) * 0.42;
    d += rough * amp;
  }
  if (d < 2.5) {
    const rd = rootSurfaceDist(x, y, z);
    if (rd < 1.2) {
      // Gnarled bark: low ridges along the root and knots.
      const knot = (fbm3(x * 1.7 + 11, y * 0.9, z * 1.7 - 5) - 0.5) * 0.22;
      if (-(rd + knot) > d) d = -(rd + knot);
    } else if (-rd > d) d = -rd;
  }
  const c = carvedBase(x, y, z);
  return c < d ? c : d;
}

/** Marches down from y0 to the first solid point of mirkCavity (a deterministic floor height for the dressing). */
export function mirkFloorAt(x, z, y0, range = 4) {
  for (let y = y0; y > y0 - range; y -= 0.03) if (mirkCavity(x, y, z) > 0) return y + 0.02;
  return y0 - range;
}

/** Marches up from y0 to the first solid point (the roof above a point). */
export function mirkRoofAt(x, z, y0, range = 18) {
  for (let y = y0; y < y0 + range; y += 0.05) if (mirkCavity(x, y, z) > 0) return y - 0.02;
  return y0 + range;
}

/* ---------------------------------------------------------------- tests ---- */

/** True for a point in the enchanted stream's water (inside its channel, below the surface). */
export function inStream(x, y, z) {
  return y < STREAM_Y && y > STREAM_Y - STREAM_DEPTH - 1 && streamDist(x, z) < STREAM_HW + 0.05;
}

/** True for a point in the river's or the grotto pool's water. */
export function inRiver(x, y, z) {
  return y < RW && y > RW - 1.6 && x > -10.5 && x < 10.5 && z > -10.5 && z < 10.5 && inRiverPlan(x, z);
}

/**
 * True when a world position is in the site: in its air (root hall, tunnel, halls, stair, river, grotto) or within
 * `margin` metres of it in the rock (default 1.5 m).
 */
export function inMirkwood(x, y, z, margin = 1.5) {
  if (y < MIRK_BOUNDS.y0 - margin || y > MIRK_BOUNDS.y1 + margin) return false;
  const n = naturalBase(x, y, z);
  if (n < margin) return true;
  return carvedBase(x, y, z) < margin;
}

/** 0..1: how deep inside the site's air a point is (1 more than ~2 m inside, 0 outside): for fog and sound. */
export function mirkwoodFactor(x, y, z) {
  if (y < MIRK_BOUNDS.y0 - 3 || y > MIRK_BOUNDS.y1 + 3) return 0;
  let d = naturalBase(x, y, z);
  const c = carvedBase(x, y, z);
  if (c < d) d = c;
  if (d === Infinity) return 0;
  return smooth01((0.5 - d) / 2.5);
}

/** 0..1: how far inside the carved halls (stair, halls, cells, cellar) a point is: their own, warmer air. */
export function hallsFactor(x, y, z) {
  if (y > CAV.floor + 4 || y < RW - 2) return 0;
  const c = carvedBase(x, y, z);
  if (c === Infinity) return 0;
  return smooth01((0.5 - c) / 2.5);
}

/* ---------------------------------------------------------------- hooks for the spiders / elves / barrels ---- */

const fix = (v, n = 2) => +v.toFixed(n);
const pt = (x, z, y0, range = 4) => ({ x: fix(x), y: fix(mirkFloorAt(x, z, y0, range)), z: fix(z) });

/** The elves' feast clearings in the root hall (book ch. 8): plan points, their floor found below. */
export const FEASTS = [[-5.6, -5.0], [-5.4, 5.2], [1.2, -6.1]].map(([x, z]) => pt(x, z, CAV.floor + 2));

/** The spiders' nests: thick webs round each (two on the floor by the walls, one high up among the roots). */
export const SPIDER_NESTS = [
  { ...pt(5.9, 5.6, CAV.floor + 2), r: 2.6 },
  { ...pt(-7.4, 1.6, CAV.floor + 2), r: 2.4 },
  { x: -1.8, y: -318.5, z: -1.6, r: 2.2 },
];

/**
 * The web sheets (centre, unit normal, width and height in metres), hung between roots and in the nests' corners. Built
 * by mirkwood-pieces.js from the same list.
 */
export const WEB_SHEETS = (() => {
  const out = [];
  const add = (x, y, z, yaw, w, h, tilt = 0) => {
    const nx = Math.sin(yaw) * Math.cos(tilt);
    const nz = Math.cos(yaw) * Math.cos(tilt);
    out.push({ x: fix(x), y: fix(y), z: fix(z), nx: fix(nx, 3), ny: fix(Math.sin(tilt), 3), nz: fix(nz, 3), w, h });
  };
  // Between the roots that come down from the roof (where two are 2.5–5.5 m apart), high above the floor.
  const feet = ROOTS.slice(0, 9).map((r) => r[Math.floor(r.length * 0.45)]);
  for (let i = 0; i < feet.length; i++) {
    for (let j = i + 1; j < feet.length; j++) {
      const a = feet[i];
      const b = feet[j];
      const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
      if (d < 2.5 || d > 5.5) continue;
      const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
      add((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.6, (a[2] + b[2]) / 2, yaw, +(d - a[3] - b[3]).toFixed(2), 3.2, 0.08);
    }
  }
  // The nests: sheets fanned round them, low (the floor nests) or among the crossing roots.
  for (const [k, n] of SPIDER_NESTS.entries()) {
    for (let s = 0; s < 4; s++) {
      const yaw = k * 1.3 + s * 0.8;
      const ox = Math.cos(yaw + 1.57) * n.r * 0.6;
      const oz = Math.sin(yaw + 1.57) * n.r * 0.6;
      add(n.x + ox, n.y + 1.4 + (s % 2) * 0.6, n.z + oz, yaw, 2.4, 2.6, 0.15);
    }
  }
  return out;
})();

/** The spiders' patrol: points on the root hall's floor (dry, off the stream) and along the tunnel's lower part. */
export const SPIDER_PATROL = (() => {
  const out = [];
  for (let k = 0; k < 16; k++) {
    const th = -Math.PI + (k + 0.5) * ((2 * Math.PI) / 16);
    for (const t of [0.42, 0.78]) {
      const r = caveRadius(th) * t;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      if (streamDist(x, z) < 1.6) continue;
      if (Math.hypot(x - GATE.x, z - GATE.z) < 1.8) continue;
      const p = pt(x, z, CAV.floor + 2.5, 5);
      if (mirkCavity(p.x, p.y + 1.0, p.z) > -0.3) continue;
      out.push(p);
    }
  }
  for (let i = Math.floor(TUNNEL6.length * 0.55); i < TUNNEL6.length - 3; i += 3) {
    const a = TUNNEL6[i];
    out.push(pt(a[0], a[2], a[1] + 1.2, 3));
  }
  return out;
})();

/** The elves' patrol: points along the king's hall, the dungeon corridor and the cellar, and on the stair's foot. */
export const ELF_PATROL = [
  [3.8, -6.7], [0.5, -6.7], [-3.0, -6.7], [-6.8, -6.7], [-3.0, -4.6], [-3.0, -1.9], [-3.0, 0.5], [-3.0, 2.9], [-3.0, 5.6],
  [-1.0, 7.3], [2.2, 7.3], [4.0, 8.9], [7.6, 6.2], [5.6, -7.8],
].map(([x, z]) => ({ x, y: HF, z }));

/** Where captured players are put: in each cell, facing its door; `door` is the door's centre (mirkwood-pieces.js). */
export const CELL_SPOTS = CELLS6.map((c) => ({
  x: fix((c.x0 + c.x1) / 2 - c.side * 0.2), y: HF, z: fix(c.zc), yaw: fix(c.side < 0 ? -Math.PI / 2 : Math.PI / 2, 4),
  door: { x: c.doorX, y: fix(HF + 1.0), z: c.zc },
}));

/** The barrel room: the cellar's open floor west of the trapdoor (the barrels stand round the walls). */
export const CELLAR = { x: 2.6, y: HF, z: 7.3 };

/** The dry bank in the grotto where a barrel rider climbs out (the lift stop's landing is next to it). */
export const RIVER_EXIT = { x: -4.7, y: fix(GROTTO.bank), z: 8.3 };

/**
 * The barrels' way out: points on the water from under the trapdoor down the river to the grotto pool's edge, then the
 * dry bank (the last point, RIVER_EXIT).
 */
export const RIVER_PATH = (() => {
  const out = [];
  const start = RIVER.findIndex((p) => Math.hypot(p[0] - TRAPDOOR.x, p[1] - TRAPDOOR.z) < 0.4);
  for (let i = Math.max(0, start); i < RIVER.length; i += 3) out.push({ x: fix(RIVER[i][0]), y: RW, z: fix(RIVER[i][1]) });
  out.push({ x: -5.8, y: RW, z: 7.4 });
  out.push({ ...RIVER_EXIT });
  return out;
})();

/** The famous find's spot: Orkrist hanging on two pegs on the armoury alcove's back wall (a swing at it takes it). */
export const ORKRIST_POS = { x: -10.08, y: HF + 1.36, z: -6.7 };

/**
 * The roots of Mirkwood as a site provider for the spiders, the elves and the barrel escape (src/enemies/). All points
 * are world positions on a floor (y the floor height) unless said otherwise.
 */
export const MIRKWOOD_SITE_PROVIDER = {
  inside: (x, y, z) => inMirkwood(x, y, z),
  spiderNests: SPIDER_NESTS,
  webSheets: WEB_SHEETS,
  spiderPatrol: SPIDER_PATROL,
  elfPatrol: ELF_PATROL,
  cells: CELL_SPOTS,
  cellar: CELLAR,
  trapdoor: { x: TRAPDOOR.x, y: TRAPDOOR.y, z: TRAPDOOR.z },
  riverPath: RIVER_PATH,
  // Where the guards' keys lie: on the butler's table in the cellar (book ch. 9).
  keys: { x: -0.3, y: -345.2, z: 7.4 },
  // Also useful: the water level of the river, the stream test, the halls test.
  riverLevel: RW,
  inStream: (x, y, z) => inStream(x, y, z),
  inHalls: (x, y, z) => hallsFactor(x, y, z) > 0.2,
};
