/* ==== underground/laketown-sites.js — beneath Lake-town (layer 7, 390–470 m; TERV 0.2 "Tóváros alatt": sunken trade
   goods, old harpoons; water and barrels; a current; 0.12 "Tóváros nedves, faszerkezetes mélye"): where everything is,
   the air it stamps into the density field, the old wooden piles (solid timber, part of the diggable field), the water
   (standing pools, the flowing channel) and the hooks for the rising water / current / Bárd work (src/laketown-events/).
   Pure data and maths (no three.js): world.js (through sites.js) uses ltCavity() and connCavity() for generate(),
   materials.js asks timberDist() per vertex for the waterlogged timber, laketown-pieces.js, laketown-water.js and
   laketown-fx.js dress it from the same data.

   Canon (TERV Decision 18; NOTES-5a-laketown has the table): Lake-town stood on "huge piles made of forest trees" in the
   Long Lake, and "the rotting piles of a greater town could still be seen along the shores when the waters sank in a
   drought" (the book, ch. 10); the elves' barrels floated down the Forest River to the town (ch. 9–10); the Master's
   gold (the films); Bard's black arrow and the black arrows of Dale's windlance (the book ch. 14, the films); Girion,
   lord of Dale, and his emeralds (the book ch. 12, 14). The pit "remembers" Bilbo's road (TERV 0.2), so all this lies
   under Mirkwood's roots.

   The layout (world y; the block's centre is x = z = 0):
   - THE BARREL WAY (connector, in layer 6's rock): from the dry bank of the Elvenking's grotto pool (where the barrels
     came out, mirkwood-sites.js RIVER_EXIT) a natural tunnel winds down a tight spiral (5¼ turns round x 0.5, z 0.5)
     to layer 7's top at 393.5 m and on to the channel's head.
   - THE CHANNEL: the lake's water seeping down gathers into a flowing channel (the current) that runs one full turn
     round the block along its walls, 14 m down, and pours into the pile cavern's west side.
   - THE PILE CAVERN (408 m): a tall domed cavern under the lake bed; the rotting piles of the old, greater town come
     down from its roof and go on into the floor (some broken off, a few braced); the stream crosses the mud floor to a
     sink pool by the east wall; two more standing pools. Nets, a sunken boat, barrels, harpoons.
   - THE TUNNEL down: from the cavern's east side round the block (1⅔ turns) to THE WHARF (435 m): a low cave with a
     pool and an old landing stage; the lift stop "Tóváros alatt · 435 m" and Bárd's stall are here.
   - On down one more turn to THE SUNKEN OLD TOWN (447 m): a wide cavern with the remains of four houses on their
     piles, fallen beams, a sunken boat, the market pool.
   - THE MASTER'S HOARD: a small planked store room sealed 2.4 m under the old town's floor (no way in: dig), under a
     ruined house with a rotten trapdoor in its floor. The Master's gold, a chest, and on the chest Girion's emeralds
     (the layer's famous find).
   Floodable cavities (the rising water, TERV 0.11 #4): the pile cavern, the wharf, the old town; each has a weak spot
   in its wall (`breach`). ==== */
import { fbm3, noise2, rng } from '../noise.js';

/* ---------------------------------------------------------------- shared helpers ---- */

/** Below this world height materials.js and the soil shader read layer 7's channels (timber, mud, layer 6's loam). */
export const LT_SHADE_Y = -386;
/** The layer's top and bottom (world y). */
export const LT_TOP = -390;
export const LT_BOTTOM = -470;

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const smoothstep = (a, b, x) => smooth01((x - a) / (b - a));
const fix = (v, n = 2) => +v.toFixed(n);

/** Catmull-Rom subdivision of a polyline of [x, y, z, ...] points into steps of about `step` metres. */
function spline(pts, step) {
  const out = [];
  const dim = pts[0].length;
  const spatial = Math.min(3, dim);
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    let len = 0;
    for (let c = 0; c < spatial; c++) len += (p2[c] - p1[c]) ** 2;
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

const segOut = { t: 0 };
function segDist(px, py, pz, a, b, out) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const vz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy + (pz - a[2]) * vz) / (vx * vx + vy * vy + vz * vz || 1)));
  out.t = t;
  const ex = px - a[0] - vx * t;
  const ey = py - a[1] - vy * t;
  const ez = pz - a[2] - vz * t;
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

/* ---------------------------------------------------------------- paths (tunnels and the channel) ---- */

/** The rounded-square loop round the block along its walls (as the lake and Mirkwood tunnels): half size, corner. */
const LOOP_H = 9.0;
const LOOP_CR = 2.8;
const LOOP_SIDE = 2 * (LOOP_H - LOOP_CR);
const LOOP_Q = (Math.PI / 2) * LOOP_CR;
/** The loop's length (one turn round the block). */
export const LOOP_PER = 4 * (LOOP_SIDE + LOOP_Q);
/** Arc positions on the loop (east side southwards, then south westwards, west northwards, north eastwards). */
const ARC = { eastMid: LOOP_SIDE / 2, westMid: 2 * (LOOP_SIDE + LOOP_Q) + LOOP_SIDE / 2, northStart: 3 * (LOOP_SIDE + LOOP_Q) };

/** A point [x, z] on the loop at arc length `a`. */
function loopPoint(a) {
  const H = LOOP_H;
  const cr = LOOP_CR;
  const per = LOOP_PER;
  let s = ((a % per) + per) % per;
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

/**
 * The point at loop arc `a` carried over to a smaller rounded square (half size h, corner radius cr): the same side and
 * the same fraction along its straight part or its corner (h = LOOP_H, cr = LOOP_CR gives loopPoint(a)).
 */
function innerLoopPoint(a, h, cr) {
  let s = ((a % LOOP_PER) + LOOP_PER) % LOOP_PER;
  const side = Math.floor(s / (LOOP_SIDE + LOOP_Q));
  s -= side * (LOOP_SIDE + LOOP_Q);
  let lx;
  let lz;
  if (s < LOOP_SIDE) {
    lx = h;
    lz = h - cr - (s / LOOP_SIDE) * 2 * (h - cr);
  } else {
    const ang = ((s - LOOP_SIDE) / LOOP_Q) * (Math.PI / 2);
    lx = h - cr + Math.cos(ang) * cr;
    lz = -(h - cr) - Math.sin(ang) * cr;
  }
  const rot = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]][side];
  return [rot[0] * lx + rot[1] * lz, rot[2] * lx + rot[3] * lz];
}

/** Points [x, y, z] along the loop from arc a0 to a1, y from y0 to y1 (linear), about `step` metres apart. */
function loopRun(a0, a1, y0, y1, step = 1.6) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, z] = loopPoint(a0 + (a1 - a0) * t);
    out.push([x, y0 + (y1 - y0) * t, z]);
  }
  return out;
}

/**
 * A tunnel along a polyline. kind 'dry': the points are its floor (a tube of radius R with a flat floor, as the
 * Mirkwood root tunnel); kind 'water': the points are the water surface of a channel (a tube centred 0.45 m above the
 * water, its bed a trough `depth` deep and `hw` half wide). Segments are bucketed by height for a quick reject.
 */
function makePath(pts, kind, R, opts = {}) {
  const segs = [];
  const M = R + 2.4;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    segs.push({
      a, b,
      x0: Math.min(a[0], b[0]) - M, x1: Math.max(a[0], b[0]) + M, z0: Math.min(a[2], b[2]) - M, z1: Math.max(a[2], b[2]) + M,
    });
    y0 = Math.min(y0, a[1], b[1]);
    y1 = Math.max(y1, a[1], b[1]);
  }
  const by0 = Math.floor(y0 - 3);
  const buckets = Array.from({ length: Math.ceil(y1 + 2 * R + 3) - by0 + 1 }, () => []);
  segs.forEach((s, i) => {
    const lo = Math.max(0, Math.floor(Math.min(s.a[1], s.b[1]) - 2 - by0));
    const hi = Math.min(buckets.length - 1, Math.floor(Math.max(s.a[1], s.b[1]) + 2 * R + 1.5 - by0));
    for (let k = lo; k <= hi; k++) buckets[k].push(i);
  });
  return { pts, kind, R, segs, buckets, by0, y0: by0, y1: by0 + buckets.length, hw: opts.hw || 0.95, depth: opts.depth || 0.7 };
}

/** Signed distance of a path's air (negative inside); Infinity when far. */
function pathBase(P, x, y, z) {
  const k = Math.floor(y - P.by0);
  if (k < 0 || k >= P.buckets.length) return Infinity;
  const list = P.buckets[k];
  let best = Infinity;
  const R = P.R;
  for (let n = 0; n < list.length; n++) {
    const s = P.segs[list[n]];
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    let d;
    if (P.kind === 'dry') {
      const dist = segDist(x, y - 0.6 * R, z, s.a, s.b, segOut);
      const fy = s.a[1] + (s.b[1] - s.a[1]) * segOut.t;
      d = Math.max(dist - R, fy - y);
    } else {
      const dist = segDist(x, y - 0.45, z, s.a, s.b, segOut);
      const t = segOut.t;
      const sy = s.a[1] + (s.b[1] - s.a[1]) * t;
      // The horizontal offset from the course (the course is nearly level, so this is close to the plan distance).
      const cx = s.a[0] + (s.b[0] - s.a[0]) * t;
      const cz = s.a[2] + (s.b[2] - s.a[2]) * t;
      const q = Math.hypot(x - cx, z - cz);
      const bed = q < P.hw ? sy - P.depth * (1 - (q / P.hw) ** 2) : sy + 0.04;
      d = Math.max(dist - R, bed - y);
    }
    if (d < best) best = d;
  }
  return best;
}

/** The water surface height of a 'water' path at a plan point within its half width (or NaN), and the flow there. */
function pathWater(P, x, y, z, flow) {
  const k = Math.floor(y - P.by0);
  if (k < 0 || k >= P.buckets.length) return NaN;
  const list = P.buckets[k];
  let best = Infinity;
  let level = NaN;
  for (let n = 0; n < list.length; n++) {
    const s = P.segs[list[n]];
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const vx = s.b[0] - s.a[0];
    const vz = s.b[2] - s.a[2];
    const l2 = vx * vx + vz * vz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * vx + (z - s.a[2]) * vz) / l2));
    const q = Math.hypot(x - s.a[0] - vx * t, z - s.a[2] - vz * t);
    if (q > P.hw + 0.1) continue;
    const sy = s.a[1] + (s.b[1] - s.a[1]) * t;
    if (y > sy + 1.0 || y < sy - 2.0) continue;
    if (q < best) {
      best = q;
      level = sy;
      if (flow) {
        const l = Math.sqrt(l2);
        flow.x = vx / l;
        flow.z = vz / l;
        flow.q = q;
      }
    }
  }
  return level;
}

/* ---------------------------------------------------------------- the barrel way (connector, layer 6's rock) ---- */

/** The spiral's axis and radius. */
export const HELIX = { x: 0.5, z: 0.5, r: 3.0, turns: 5.25, top: -352.6, bottom: -393.5 };
/** Floor points of the barrel way from the grotto's bank down to the channel's head. */
export const CONNECTOR = (() => {
  const pts = [[-4.3, -351.62, 6.5], [-3.1, -351.85, 5.6], [-2.2, -352.2, 4.4]];
  const th0 = (3 * Math.PI) / 4;
  const total = HELIX.turns * 2 * Math.PI;
  const n = Math.ceil((total * HELIX.r) / 1.4);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const th = th0 + total * t;
    pts.push([HELIX.x + Math.cos(th) * HELIX.r, HELIX.top + (HELIX.bottom - HELIX.top) * t, HELIX.z + Math.sin(th) * HELIX.r]);
  }
  for (const p of [[-3.4, -393.6, -1.4], [-5.2, -393.75, -0.8], [-7.0, -393.9, -0.35], [-8.3, -394.0, -0.1]]) pts.push(p);
  return pts;
})();
const CONN_PATH = makePath(CONNECTOR, 'dry', 1.1);
/** The connector's evaluation box (sites.js 'conn'; not a nearSite box, so layer 6's cave pockets stay as they were). */
export const CONN_BOUNDS = { x0: -10.6, x1: 5.2, y0: -396.5, y1: -347.5, z0: -4.5, z1: 8.8 };

/** Signed distance of the barrel way's air without noise (negative inside); Infinity when far. */
export function connBase(x, y, z) {
  if (y < CONN_BOUNDS.y0 || y > CONN_BOUNDS.y1 || x < CONN_BOUNDS.x0 || x > CONN_BOUNDS.x1 || z < CONN_BOUNDS.z0 || z > CONN_BOUNDS.z1) return Infinity;
  return pathBase(CONN_PATH, x, y, z);
}

/** The barrel way as generate() stamps it (craggy walls, a smoother floor); Infinity when more than 2.5 m away. */
export function connCavity(x, y, z) {
  let d = connBase(x, y, z);
  if (d > 2.5) return Infinity;
  if (d > -2.2) d += rough(x, y, z) * 0.42;
  return d;
}

/* ---------------------------------------------------------------- the channel (the current) ---- */

/** Water surface points of the channel: one turn round the block from the west side's middle, 14.3 m down. */
const CHANNEL_LOOP = loopRun(ARC.westMid, ARC.westMid + LOOP_PER, -394.0, -408.3, 1.4);
export const CHANNEL = [...CHANNEL_LOOP, [-7.7, -408.33, -0.15], [-6.3, -408.36, -0.3]];
const CHANNEL_PATH = makePath(CHANNEL, 'water', 1.3, { hw: 0.95, depth: 0.7 });
/** The channel's flow speed (m/s at the middle). */
export const CHANNEL_SPEED = 1.7;

/* ---------------------------------------------------------------- dome caves ---- */

/**
 * A domed cave: plan centre, half size of its rounded-square outline (superellipse exponent p), floor and roof
 * heights, its pools (basins in the floor: centre, radius, depth below the water level `w`) and optionally a stream.
 */
function domeCave(c) {
  return { ...c, col: { x: NaN, z: NaN, f: 0, r: 0, t: 0 } };
}

/** The pile cavern (408 m). */
export const PILE_CAVE = domeCave({
  id: 'piles', x: 0, z: 0, a: 6.3, p: 3, floor: -408, roofMid: 11.2, roofEdge: 2.4,
  pools: [{ x: -2.7, z: 3.3, r: 1.5, depth: 0.55, w: -408.14 }, { x: 2.5, z: -3.5, r: 1.7, depth: 0.6, w: -408.14 }, { x: 4.4, z: 2.4, r: 1.15, depth: 1.0, w: -408.52 }],
});
/** The sunken old town (447 m). */
export const OLD_TOWN = domeCave({
  id: 'oldtown', x: 0, z: 0, a: 6.4, p: 3.4, floor: -447, roofMid: 9.6, roofEdge: 2.3,
  pools: [{ x: -3.2, z: -1.0, r: 2.3, depth: 0.7, w: -447.14 }],
});

/** The stream across the pile cavern: from the channel's mouth (west) to the sink pool by the east wall. */
export const STREAM7 = spline([[-6.3, -0.3], [-4.6, -1.3], [-2.4, -0.6], [-0.4, 0.7], [1.6, 0.9], [3.2, 1.6], [4.4, 2.4]], 0.45);
const STREAM7_W0 = -408.36;
const STREAM7_W1 = -408.52;
const STREAM7_HW = 0.75;
const STREAM7_LEN = (() => {
  let l = 0;
  for (let i = 1; i < STREAM7.length; i++) l += Math.hypot(STREAM7[i][0] - STREAM7[i - 1][0], STREAM7[i][1] - STREAM7[i - 1][1]);
  return l;
})();
/** The stream's flow speed (m/s at the middle). */
export const STREAM7_SPEED = 0.9;
const sOut = { t: 0 };

/** The stream's water level at arc length t (from the channel's mouth). */
function streamLevel(t) {
  return STREAM7_W0 + (STREAM7_W1 - STREAM7_W0) * Math.min(1, t / STREAM7_LEN);
}

function caveRadius(c, th) {
  const co = Math.abs(Math.cos(th));
  const si = Math.abs(Math.sin(th));
  const sq = c.a / Math.pow(co ** c.p + si ** c.p, 1 / c.p);
  return sq * (1 + 0.03 * Math.sin(3 * th + 0.7) + 0.025 * Math.sin(5 * th + 1.9));
}

/** Normalised plan radius (0 centre, 1 the wall at the floor). */
function planT(c, x, z) {
  const dx = x - c.x;
  const dz = z - c.z;
  return Math.sqrt(dx * dx + dz * dz) / caveRadius(c, Math.atan2(dz, dx));
}

/** A dome cave's floor without noise (world y): its pools and (the pile cavern) the stream cut into it. */
export function caveFloor(c, x, z) {
  const t = planT(c, x, z);
  let f = c.floor + (noise2(x * 0.21 + 5.3, z * 0.21 - 2.9) - 0.5) * 0.45 + 1.6 * smoothstep(0.93, 1.07, t);
  for (const p of c.pools) {
    const q = Math.hypot(x - p.x, z - p.z);
    if (q < p.r) {
      const bed = p.w + 0.06 - (p.depth + 0.06) * (1 - (q / p.r) ** 2);
      if (bed < f) f = bed;
    }
  }
  if (c === PILE_CAVE && x > -7 && x < 5.8 && z > -2.4 && z < 3.6) {
    const q = planPolyDist(x, z, STREAM7, sOut);
    if (q < STREAM7_HW + 0.3) {
      const w = streamLevel(sOut.t);
      const bed = w + 0.05 - 0.6 * Math.max(0, 1 - (q / STREAM7_HW) ** 2);
      if (bed < f) f = bed;
    }
  }
  return f;
}

/** A dome cave's roof without noise (world y). */
export function caveRoof(c, x, z) {
  const t = planT(c, x, z);
  const k = 1 - t * t * t * t;
  return c.floor + c.roofEdge + (c.roofMid - c.roofEdge) * (k > 0 ? Math.sqrt(k) : 0) - (t > 1 ? (t - 1) * 9 : 0);
}

function column(c, x, z) {
  const col = c.col;
  if (x !== col.x || z !== col.z) {
    col.x = x;
    col.z = z;
    col.f = caveFloor(c, x, z);
    col.r = caveRoof(c, x, z);
  }
  return col;
}

/** Signed distance of a dome cave's air without noise and without the piles (negative inside). */
function domeBase(c, x, y, z) {
  if (y < c.floor - 2.5 || y > c.floor + c.roofMid + 1.5 || Math.abs(x - c.x) > c.a * 1.6 || Math.abs(z - c.z) > c.a * 1.6) return Infinity;
  const col = column(c, x, z);
  return Math.max(col.f - y, y - col.r, (col.f + 0.3 - col.r) * 0.5);
}

/* ---------------------------------------------------------------- the wharf (lift stop, Bárd) ---- */

/** The wharf cave: plan centre and radii, floor, its pool (the old landing stage stands over it). */
export const WHARF = { id: 'wharf', x: -2.4, z: 6.4, rx: 3.9, rz: 2.9, floor: -435, pool: { x: -2.3, z: 4.8, r: 1.6, depth: 0.9, w: -435.13 } };

function wharfFloor(x, z) {
  let f = WHARF.floor + (noise2(x * 0.3 - 1.1, z * 0.3 + 4.2) - 0.5) * 0.18;
  const p = WHARF.pool;
  const q = Math.hypot(x - p.x, z - p.z);
  if (q < p.r) {
    const bed = p.w + 0.06 - (p.depth + 0.06) * (1 - (q / p.r) ** 2);
    if (bed < f) f = bed;
  }
  return f;
}

function wharfBase(x, y, z) {
  if (y < WHARF.floor - 2 || y > WHARF.floor + 6) return Infinity;
  const ex = (x - WHARF.x) / WHARF.rx;
  const ez = (z - WHARF.z) / WHARF.rz;
  const e = Math.sqrt(ex * ex + ez * ez);
  if (e > 1.8) return Infinity;
  const roof = WHARF.floor + 1.5 + 2.9 * Math.sqrt(Math.max(0, 1 - e * e * e * e));
  return Math.max(wharfFloor(x, z) - y, y - roof, (e - 1) * Math.min(WHARF.rx, WHARF.rz));
}

/* ---------------------------------------------------------------- the tunnels down ---- */

/** The tunnel from the pile cavern's east side round the block (1⅔ turns) down to the wharf. */
const ARC_T7A0 = ARC.eastMid + 1.2;
const ARC_T7A1 = ARC.northStart + 2.2 + LOOP_PER;
export const TUNNEL7A = [[4.4, -407.95, -1.3], [6.2, -408.0, -1.1], ...loopRun(ARC_T7A0, ARC_T7A1, -408.1, WHARF.floor, 1.6)];
/** On from the wharf's east end, one more turn down to the old town's north side. */
const ARC_T7B0 = ARC.northStart + 6.8;
export const TUNNEL7B = [[-0.9, WHARF.floor, 7.7], ...loopRun(ARC_T7B0, ARC_T7B0 + LOOP_PER, WHARF.floor, OLD_TOWN.floor, 1.6), [0.6, -447.05, 7.6], [0.5, -447.1, 6.2]];
const T7A_PATH = makePath(TUNNEL7A, 'dry', 1.1);
const T7B_PATH = makePath(TUNNEL7B, 'dry', 1.1);

/* ---------------------------------------------------------------- the dwarf stair down to Erebor (layer 7 → 8) ---- */

/**
 * NOTES-18-levelfix item 4: a dwarf-cut stair from the sunken old town down to the mines of Erebor (erebor-sites.js
 * MINE). It branches off the tunnel from the wharf where that tunnel reaches the old town (TUNNEL7B's last loop point,
 * 447 m), goes on round the block along the same loop, 1¼ turns, and for its last stretch draws 2.8 m in from the loop
 * to meet the mine level's east–west cross-cut beside the ring gallery (477 m): the ring runs on the same loop, so a
 * stair coming down along it would open the ring's vault under its own floor; drawn in, it stays 0.85 m clear of the
 * ring. The draw-in starts on the north side before the lift column (passing it 0.85 m clear). A carved gallery
 * (vertical walls, a flat floor, a round vault; crisp, no noise: dwarf work, like Erebor's galleries); stone steps are
 * laid on its floor (laketown-pieces.js). The sealed hoard room (x 2.2–4.7, z −4.9…−2.4) is far inside the loop.
 */
export const STAIR78_HW = 0.75;
export const STAIR78_H = 2.4;
/** Inward offset from the loop at the stair's foot (m) and the floor's top / bottom. */
const STAIR78_IN = 2.8;
export const STAIR78_TOP = OLD_TOWN.floor;
export const STAIR78_BOTTOM = -477;
/** Floor points [x, y, z] from the old town's tunnel down to the cross-cut (the last 1.9 m level, into the cross-cut). */
export const STAIR78 = (() => {
  const a0 = ARC_T7B0 + LOOP_PER;
  // The slope ends 1.9 m before the middle of the loop's east side (the cross-cut along x, half width 1.1 m), 1¼ turns
  // on; a level piece leads into the cross-cut, so no ledge is left where the stair meets it.
  const a1 = LOOP_SIDE / 2 + 3 * LOOP_PER - 1.9;
  const inA = a0 + 55;
  const inB = a0 + 66;
  const plan = [];
  for (let a = a0; a <= a1 + 1e-6; a += 0.8) {
    // The same place on a smaller rounded square (half size 9 − o): its corners keep a radius of at least 1.2 m, so the
    // drawn-in stair turns its corner in a curve, not a kink (a kink's crossing segment would undercut the floor).
    const o = STAIR78_IN * smoothstep(inA, inB, a);
    const [px, pz] = innerLoopPoint(a, LOOP_H - o, Math.max(1.2, LOOP_CR - o));
    const last = plan[plan.length - 1];
    if (!last || Math.hypot(px - last[0], pz - last[1]) > 0.3) plan.push([px, pz]);
  }
  const end = plan[plan.length - 1];
  // The level piece into the cross-cut (its centre line at z = 0).
  plan.push([end[0], 0]);
  let total = 0;
  const len = [0];
  for (let i = 1; i < plan.length; i++) len.push((total += Math.hypot(plan[i][0] - plan[i - 1][0], plan[i][1] - plan[i - 1][1])));
  const run = len[len.length - 2];
  return plan.map(([x, z], i) => [x, STAIR78_TOP + (STAIR78_BOTTOM - STAIR78_TOP) * Math.min(1, len[i] / run), z]);
})();
/** The stair's slope (rise over run of its sloping part). */
export const STAIR78_SLOPE = (() => {
  let run = 0;
  for (let i = 1; i < STAIR78.length - 1; i++) run += Math.hypot(STAIR78[i][0] - STAIR78[i - 1][0], STAIR78[i][2] - STAIR78[i - 1][2]);
  return (STAIR78_TOP - STAIR78_BOTTOM) / run;
})();
/** The stair's evaluation box (sites.js 'stair78'). */
export const STAIR78_BOUNDS = { x0: -10.6, x1: 10.6, y0: STAIR78_BOTTOM - 1.5, y1: STAIR78_TOP + STAIR78_H + 1.5, z0: -10.6, z1: 10.6 };
const ST_CUT = 1.6;
const ST_SEGS = STAIR78.slice(0, -1).map((a, i) => {
  const b = STAIR78[i + 1];
  const vx = b[0] - a[0];
  const vz = b[2] - a[2];
  const M = STAIR78_HW + ST_CUT;
  return { a, b, vx, vz, l2: vx * vx + vz * vz || 1e-9, x0: Math.min(a[0], b[0]) - M, x1: Math.max(a[0], b[0]) + M, z0: Math.min(a[2], b[2]) - M, z1: Math.max(a[2], b[2]) + M };
});
const ST_BY0 = Math.floor(STAIR78_BOUNDS.y0);
const ST_BUCKETS = (() => {
  const out = Array.from({ length: Math.ceil(STAIR78_BOUNDS.y1) - ST_BY0 + 1 }, () => []);
  ST_SEGS.forEach((s, i) => {
    const lo = Math.max(0, Math.floor(Math.min(s.a[1], s.b[1]) - ST_CUT - ST_BY0));
    const hi = Math.min(out.length - 1, Math.floor(Math.max(s.a[1], s.b[1]) + STAIR78_H + ST_CUT - ST_BY0));
    for (let k = lo; k <= hi; k++) out[k].push(i);
  });
  return out;
})();
const stOut = { fy: 0 };

/**
 * Signed distance (m, negative in the air) of the stair's carved gallery; Infinity when farther than 1.6 m (beyond the
 * 1 m where the density saturates). `out.fy` gets the floor height under the nearest course point.
 */
export function stair78Cavity(x, y, z, out = stOut) {
  const k = Math.floor(y - ST_BY0);
  if (k < 0 || k >= ST_BUCKETS.length) return Infinity;
  const list = ST_BUCKETS[k];
  let best = Infinity;
  const hw = STAIR78_HW;
  for (let n = 0; n < list.length; n++) {
    const s = ST_SEGS[list[n]];
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const tr = ((x - s.a[0]) * s.vx + (z - s.a[2]) * s.vz) / s.l2;
    const t = Math.max(0, Math.min(1, tr));
    const ex = x - s.a[0] - s.vx * t;
    const ez = z - s.a[2] - s.vz * t;
    const q = Math.sqrt(ex * ex + ez * ez);
    // In the round end caps the floor rises 1 : 1 away from the endpoint (steeper than any segment), so a cap never
    // undercuts the neighbouring segment's floor: a flat cap at an endpoint's height would reach back over the previous
    // segment and cut a step into the ramp at every joint. The neighbour carries the floor there.
    const over = tr < 0 ? -tr : tr > 1 ? tr - 1 : 0;
    const fy = s.a[1] + (s.b[1] - s.a[1]) * t + over * Math.sqrt(s.l2);
    const spring = fy + STAIR78_H - hw;
    const d = y > spring ? Math.max(fy - y, Math.sqrt(q * q + (y - spring) ** 2) - hw) : Math.max(q - hw, fy - y);
    if (d < best) {
      best = d;
      out.fy = fy;
    }
  }
  return best > ST_CUT ? Infinity : best;
}

/* ---------------------------------------------------------------- the Master's hoard ---- */

/** The sealed store room under the old town (crisp planked walls; nothing leads in). */
export const HOARD = { x0: 2.2, x1: 4.7, y0: -451.8, y1: -449.5, z0: -4.9, z1: -2.4 };
/** The ruined house above it, with the rotten trapdoor in its floor (the clue). */
export const HOARD_HOUSE = { x: 3.45, z: -3.65 };

function hoardBase(x, y, z) {
  const h = HOARD;
  return Math.max(h.x0 - x, x - h.x1, h.y0 - y, y - h.y1, h.z0 - z, z - h.z1);
}

/* ---------------------------------------------------------------- the old town's houses ---- */

/**
 * The four sunken houses of the old town (generic pile houses of the Lake-men, the book ch. 10): plan centre, half
 * size of the square on its corner piles, the deck's height above the floor, its yaw, how ruined it is (0 whole … 1 a
 * few planks). House 2 stands over the Master's hoard (its floor has the rotten trapdoor).
 */
export const OLD_HOUSES = [
  { x: -3.9, z: 3.5, hw: 1.15, deck: 1.15, yaw: 0.2, ruin: 0.35 },
  { x: 2.7, z: 3.7, hw: 1.2, deck: 1.0, yaw: -0.15, ruin: 0.55 },
  { x: HOARD_HOUSE.x, z: HOARD_HOUSE.z, hw: 1.1, deck: 0.9, yaw: 0.0, ruin: 0.25 },
  { x: -0.6, z: -4.5, hw: 1.0, deck: 1.2, yaw: 0.35, ruin: 0.75 },
];

/* ---------------------------------------------------------------- the piles (solid timber) ---- */

/**
 * The old town's piles and beams as capsules [{ a: [x, y, z], b: [x, y, z], r, kind }] (kind 'full' from roof to
 * floor, 'stump' broken off above the floor, 'hang' rotted away below, 'brace', 'beam' lying on the floor). Solid
 * timber in the diggable field (dig through them; materials.js shades them as waterlogged timber). Thinner stakes are
 * decor (laketown-pieces.js).
 */
export const PILES = (() => {
  const R = rng(7007);
  const out = [];
  const pileCave = (c, avoid, nTarget) => {
    const full = [];
    for (let gx = -6; gx <= 6; gx += 1.5) {
      for (let gz = -6; gz <= 6; gz += 1.5) {
        const x = gx + (R() - 0.5) * 1.0;
        const z = gz + (R() - 0.5) * 1.0;
        const r0 = 0.32 + R() * 0.12;
        const kindR = R();
        const leanA = R() * Math.PI * 2;
        const lean = R() * 0.09;
        if (planT(c, x, z) > 0.86 || avoid(x, z) || full.length >= nTarget) continue;
        const fl = caveFloor(c, x, z);
        const rf = caveRoof(c, x, z);
        if (rf - fl < 3.2) continue;
        const top = [x + Math.cos(leanA) * lean * (rf - fl) * 0.5, rf + 1.6, z + Math.sin(leanA) * lean * (rf - fl) * 0.5];
        const bot = [x - Math.cos(leanA) * lean * 1.5, fl - 2.4, z - Math.sin(leanA) * lean * 1.5];
        const lerp = (t) => [bot[0] + (top[0] - bot[0]) * t, bot[1] + (top[1] - bot[1]) * t, bot[2] + (top[2] - bot[2]) * t];
        const tAt = (yy) => (yy - bot[1]) / (top[1] - bot[1]);
        if (kindR < 0.6) {
          out.push({ a: bot, b: top, r: r0, kind: 'full' });
          full.push(out[out.length - 1]);
        } else if (kindR < 0.8) {
          out.push({ a: bot, b: lerp(tAt(fl + 0.7 + R() * 2.0)), r: r0, kind: 'stump' });
        } else {
          out.push({ a: lerp(tAt(fl + 2.8 + R() * 2.2)), b: top, r: r0 * 0.92, kind: 'hang' });
        }
      }
    }
    return full;
  };
  // The pile cavern: off the stream, the pools, the channel's mouth and the tunnel's mouth.
  const fullA = pileCave(PILE_CAVE, (x, z) => {
    if (planPolyDist(x, z, STREAM7) < STREAM7_HW + 0.35) return true;
    if (PILE_CAVE.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.3)) return true;
    return Math.hypot(x + 6.0, z + 0.3) < 1.6 || Math.hypot(x - 5.0, z + 1.2) < 1.7;
  }, 40);
  // A few braces between neighbouring full piles (diagonal, high above the floor).
  let braces = 0;
  for (let i = 0; i < fullA.length && braces < 8; i++) {
    for (let j = i + 1; j < fullA.length && braces < 8; j++) {
      const A = fullA[i];
      const B = fullA[j];
      const d = Math.hypot(A.a[0] - B.a[0], A.a[2] - B.a[2]);
      if (d < 1.3 || d > 2.6 || R() < 0.4) continue;
      const fl = PILE_CAVE.floor;
      const at = (P, yy) => {
        const t = (yy - P.a[1]) / (P.b[1] - P.a[1]);
        return [P.a[0] + (P.b[0] - P.a[0]) * t, yy, P.a[2] + (P.b[2] - P.a[2]) * t];
      };
      const hi = fl + 5.4 + R() * 1.4;
      const lo = hi - 1.8;
      if (caveRoof(PILE_CAVE, (A.a[0] + B.a[0]) / 2, (A.a[2] + B.a[2]) / 2) < hi + 0.8) continue;
      out.push({ a: at(A, hi), b: at(B, lo), r: 0.3, kind: 'brace' });
      braces++;
    }
  }
  // The old town: four houses on their piles (four corners each), a few single piles, beams fallen on the floor.
  for (const h of OLD_HOUSES) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = h.x + sx * h.hw;
      const z = h.z + sz * h.hw;
      const fl = caveFloor(OLD_TOWN, x, z);
      const rf = caveRoof(OLD_TOWN, x, z);
      const r0 = 0.34 + R() * 0.08;
      const broken = R();
      const top = [x + (R() - 0.5) * 0.25, rf + 1.6, z + (R() - 0.5) * 0.25];
      const bot = [x, fl - 2.4, z];
      if (broken < 0.7) out.push({ a: bot, b: top, r: r0, kind: 'full' });
      else out.push({ a: bot, b: [x, fl + h.deck + 0.6 + R() * 0.8, z], r: r0, kind: 'stump' });
    }
  }
  for (let i = 0, n = 0; i < 80 && n < 9; i++) {
    const x = (R() - 0.5) * 11;
    const z = (R() - 0.5) * 11;
    if (planT(OLD_TOWN, x, z) > 0.82) continue;
    if (OLD_HOUSES.some((h) => Math.hypot(x - h.x, z - h.z) < h.hw * 1.6 + 0.8)) continue;
    if (OLD_TOWN.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.4) || Math.hypot(x - 0.5, z - 6.0) < 1.6) continue;
    const fl = caveFloor(OLD_TOWN, x, z);
    const rf = caveRoof(OLD_TOWN, x, z);
    const kind = R() < 0.6 ? 'full' : 'stump';
    out.push({ a: [x, fl - 2.4, z], b: kind === 'full' ? [x + (R() - 0.5) * 0.4, rf + 1.6, z + (R() - 0.5) * 0.4] : [x, fl + 0.9 + R() * 1.8, z], r: 0.33 + R() * 0.1, kind });
    n++;
  }
  for (const [x0, z0, x1, z1] of [[-1.4, 1.2, 1.8, 2.6], [0.6, -1.6, 2.4, 0.9], [-5.0, 2.6, -2.2, 5.0], [4.6, 0.6, 5.2, -1.8], [-0.4, 4.6, -3.0, 5.4]]) {
    const fy = (x, z) => caveFloor(OLD_TOWN, x, z) + 0.22;
    out.push({ a: [x0, fy(x0, z0), z0], b: [x1, fy(x1, z1), z1], r: 0.3, kind: 'beam' });
  }
  return out;
})();

const PSEGS = PILES.map((p) => {
  const m = p.r + 0.7;
  return { ...p, x0: Math.min(p.a[0], p.b[0]) - m, x1: Math.max(p.a[0], p.b[0]) + m, y0: Math.min(p.a[1], p.b[1]) - m, y1: Math.max(p.a[1], p.b[1]) + m, z0: Math.min(p.a[2], p.b[2]) - m, z1: Math.max(p.a[2], p.b[2]) + m };
});
const P_BUCKET_Y0 = -452;
const P_BUCKETS = Array.from({ length: 60 }, () => []);
PSEGS.forEach((s, i) => {
  const lo = Math.max(0, Math.floor(s.y0 - P_BUCKET_Y0));
  const hi = Math.min(P_BUCKETS.length - 1, Math.floor(s.y1 - P_BUCKET_Y0));
  for (let k = lo; k <= hi; k++) P_BUCKETS[k].push(i);
});

/** Distance (m) from a point to the nearest pile's or beam's surface (negative inside); Infinity when none is near. */
export function timberDist(x, y, z) {
  const k = Math.floor(y - P_BUCKET_Y0);
  if (k < 0 || k >= P_BUCKETS.length) return Infinity;
  const list = P_BUCKETS[k];
  let best = Infinity;
  for (let n = 0; n < list.length; n++) {
    const s = PSEGS[list[n]];
    if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1 || z < s.z0 || z > s.z1) continue;
    const d = segDist(x, y, z, s.a, s.b, segOut) - s.r;
    if (d < best) best = d;
  }
  return best;
}

/* ---------------------------------------------------------------- the cavity field ---- */

/** The bounds of layer 7's site air (its top kept below 392 m: with nearSite's 1.6 m margin layer 6 is untouched). */
export const LT_BOUNDS = { x0: -12, x1: 12, y0: -453, y1: -392.0, z0: -12, z1: 12 };

/** Craggy noise for the natural walls (the same two octaves as the other layers). */
function rough(x, y, z) {
  return (fbm3(x * 0.42, y * 0.42, z * 0.42) - 0.5) * 1.5 + (fbm3(x * 1.35, y * 1.35, z * 1.35) - 0.5) * 0.42;
}

/** Natural air (caves, tunnels, the channel) without noise and piles; Infinity when far. */
function naturalBase(x, y, z) {
  let d = Infinity;
  if (y > -412 && y < -395) {
    const v = domeBase(PILE_CAVE, x, y, z);
    if (v < d) d = v;
  }
  if (y > -450 && y < -436) {
    const v = domeBase(OLD_TOWN, x, y, z);
    if (v < d) d = v;
  }
  if (y > -438 && y < -428) {
    const v = wharfBase(x, y, z);
    if (v < d) d = v;
  }
  for (const P of [CHANNEL_PATH, T7A_PATH, T7B_PATH]) {
    if (y < P.y0 || y > P.y1) continue;
    const v = pathBase(P, x, y, z);
    if (v < d) d = v;
  }
  if (y > CONN_BOUNDS.y0 && y < CONN_BOUNDS.y1) {
    const v = connBase(x, y, z);
    if (v < d) d = v;
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

/** The carved space (the hoard room): crisp; Infinity when far. */
function carvedBase(x, y, z) {
  if (y < HOARD.y0 - 3 || y > HOARD.y1 + 3) return Infinity;
  return hoardBase(x, y, z);
}

/**
 * Signed distance (m, negative in the air) of the whole site without noise, piles included (solid); Infinity outside
 * its bounds. Cheap enough for per-frame tests and the dressing's placement.
 */
export function ltBase(x, y, z) {
  if (y < LT_BOUNDS.y0 || y > LT_BOUNDS.y1 + 1) return Infinity;
  let d = naturalBase(x, y, z);
  if (d < 2.5) {
    const td = timberDist(x, y, z);
    if (-td > d) d = -td;
  }
  const c = carvedBase(x, y, z);
  return c < d ? c : d;
}

/**
 * The cavity at a world point as generate() stamps it: the natural air with craggy noise (strong on the roofs and walls,
 * faint on the floors and at the water), the piles with a faint rot (solid), the hoard room crisp. Negative in the air,
 * Infinity outside the bounds. Deterministic (the save stores the terrain as differences from generate()).
 */
export function ltCavity(x, y, z) {
  if (y < LT_BOUNDS.y0 || y > LT_BOUNDS.y1) return Infinity;
  let d = naturalBase(x, y, z);
  if (d !== Infinity && d < 2.2 && d > -2.2) {
    let amp = 0.5;
    const c = y > -425 ? PILE_CAVE : OLD_TOWN;
    if (Math.abs(x) < 8 && Math.abs(z) < 8 && y > c.floor - 2 && y < c.floor + c.roofMid + 1) {
      const above = y - column(c, x, z).f;
      amp = 0.5 - 0.4 * (1 - smoothstep(0.1, 0.9, above));
    } else if (y < WHARF.floor + 1 && y > WHARF.floor - 2) amp = 0.18;
    d += rough(x, y, z) * amp;
  }
  if (d < 2.5) {
    const td = timberDist(x, y, z);
    if (td < 1.0) {
      // Rotting wood: shallow grooves along the grain and soft hollows.
      const rot = (fbm3(x * 2.2 + 3, y * 0.6, z * 2.2 - 7) - 0.5) * 0.12;
      if (-(td + rot) > d) d = -(td + rot);
    } else if (-td > d) d = -td;
  }
  const c = carvedBase(x, y, z);
  return c < d ? c : d;
}

/** Marches down from y0 to the first solid point of ltCavity (a deterministic floor height for the dressing). */
export function ltFloorAt(x, z, y0, range = 4) {
  for (let y = y0; y > y0 - range; y -= 0.03) if (ltCavity(x, y, z) > 0) return y + 0.02;
  return y0 - range;
}

/** Marches up from y0 to the first solid point (the roof above a point). */
export function ltRoofAt(x, z, y0, range = 14) {
  for (let y = y0; y < y0 + range; y += 0.05) if (ltCavity(x, y, z) > 0) return y - 0.02;
  return y0 + range;
}

/* ---------------------------------------------------------------- water ---- */

/** The standing pools (plan centre, radius, level): the pile cavern's three, the wharf's, the old town's. */
export const POOLS = [...PILE_CAVE.pools, WHARF.pool, ...OLD_TOWN.pools].map((p) => ({ x: p.x, z: p.z, r: p.r, w: p.w }));

const flowTmp = { x: 0, z: 0, q: 0 };

/**
 * The standing water's surface height at a plan point: a pool's level inside its outline, else −Infinity. With `y`
 * (optional) only water within 3 m above / 2 m below that height counts (the pools lie at different depths).
 */
export function waterLevel(x, z, y) {
  let best = -Infinity;
  for (const p of POOLS) {
    if (Math.hypot(x - p.x, z - p.z) > p.r + 0.05) continue;
    if (y !== undefined && (y > p.w + 3 || y < p.w - 2)) continue;
    if (p.w > best) best = p.w;
  }
  return best;
}

/** The flowing water's surface height at a point (channel or stream, NaN elsewhere); `flow` gets the unit direction. */
export function flowingLevel(x, y, z, flow = flowTmp) {
  if (y > -407 && y < -393 || (y <= -407 && y > -410 && (x < -6 || Math.abs(x) > 7.5 || Math.abs(z) > 7.5))) {
    const l = pathWater(CHANNEL_PATH, x, y, z, flow);
    if (!Number.isNaN(l)) {
      flow.speed = CHANNEL_SPEED;
      flow.hw = CHANNEL_PATH.hw;
      return l;
    }
  }
  if (y > -410 && y < -406 && x > -6.8 && x < 5.2 && z > -2.4 && z < 3.4) {
    const q = planPolyDist(x, z, STREAM7, sOut);
    if (q < STREAM7_HW + 0.05) {
      // The direction along the stream at the nearest point.
      let arc = 0;
      for (let i = 0; i + 1 < STREAM7.length; i++) {
        const a = STREAM7[i];
        const b = STREAM7[i + 1];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (arc + l >= sOut.t || i === STREAM7.length - 2) {
          flow.x = (b[0] - a[0]) / l;
          flow.z = (b[1] - a[1]) / l;
          break;
        }
        arc += l;
      }
      flow.q = q;
      flow.speed = STREAM7_SPEED;
      flow.hw = STREAM7_HW;
      return streamLevel(sOut.t);
    }
  }
  return NaN;
}

/**
 * The current at a position: the flow velocity {x, z} (m/s; full in the middle of the water, half at its edge) when the
 * point is in the channel's or the stream's water (or up to 0.3 m above it), else null.
 */
export function inCurrent(pos) {
  const l = flowingLevel(pos.x, pos.y, pos.z, flowTmp);
  if (Number.isNaN(l) || pos.y > l + 0.3 || pos.y < l - 1.6) return null;
  const k = flowTmp.speed * (1 - 0.5 * Math.min(1, flowTmp.q / flowTmp.hw));
  return { x: flowTmp.x * k, z: flowTmp.z * k };
}

/* ---------------------------------------------------------------- tests ---- */

/**
 * True when a world position is in the site: in its air (caves, tunnels, the channel, the hoard room, the barrel way)
 * or within `margin` metres of it in the rock (default 1.5 m).
 */
export function inLaketown(x, y, z, margin = 1.5) {
  if (y > CONN_BOUNDS.y1 + margin || y < LT_BOUNDS.y0 - margin) return false;
  if (naturalBase(x, y, z) < margin) return true;
  return carvedBase(x, y, z) < margin;
}

/** 0..1: how deep inside layer 7's site air a point is (1 more than ~2 m inside, 0 outside): for fog and sound. */
export function laketownSiteFactor(x, y, z) {
  if (y > LT_BOUNDS.y1 + 3 || y < LT_BOUNDS.y0 - 3) return 0;
  let d = naturalBase(x, y, z);
  const c = carvedBase(x, y, z);
  if (c < d) d = c;
  if (d === Infinity) return 0;
  return smooth01((0.5 - d) / 2.5);
}

/** 0..1: how far into layer 7 a height is (0 above 388 m, 1 below 393 m): its murky air everywhere in the layer. */
export function laketownFactor(y) {
  return smoothstep(-388, -393, y);
}

/* ---------------------------------------------------------------- hooks for the flood / current / Bárd work ---- */

/** The point `into` metres behind a cave wall, marching out from (cx, y, cz) at plan angle th (a breach spot). */
function wallSpot(cx, y, cz, th, into = 0.3) {
  for (let r = 0.5; r < 11; r += 0.05) {
    const x = cx + Math.cos(th) * r;
    const z = cz + Math.sin(th) * r;
    if (ltCavity(x, y, z) > 0) return { x: fix(x + Math.cos(th) * into), y: fix(y), z: fix(z + Math.sin(th) * into) };
  }
  return { x: fix(cx), y: fix(y), z: fix(cz) };
}

/** A floor point on a path (index i), the floor found below. */
const onPath = (pts, i) => {
  const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
  return { x: fix(p[0]), y: fix(ltFloorAt(p[0], p[2], p[1] + 1.2, 3)), z: fix(p[2]) };
};
/** The last point of a path above a given height (going back along it from its end). */
const pathIndexAbove = (pts, y) => {
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i][1] > y) return i;
  return 0;
};

/**
 * The floodable cavities: their box, floor, the highest the water may rise (`topY`), the ways out (dry points above
 * topY, along the tunnels), and the weak spot (`breach`): a point 0.3 m into the wall at about chest height where a
 * bad pick stroke lets the lake in (laketown-pieces.js marks it: a seeping crack behind old boards).
 */
export const CAVITIES = (() => {
  const piles = PILE_CAVE;
  const old = OLD_TOWN;
  const A = piles.a * 1.15;
  const O = old.a * 1.15;
  // The water rises to near each roof (NOTES-18-levelfix item 3): about 90 % of a cavity's air is flooded, only a
  // pocket under the crown stays (piles 2.1 m, old town 1.6 m, wharf 1.0 m of air at the highest point). The first
  // caps (3.8 / 1.5 / 3.4 m over the floors) flooded less than half of each cavity, so a full flood did not read as one.
  const PILES_TOP = piles.floor + 9.0;
  const WHARF_TOP = WHARF.floor + 3.4;
  const OLD_TOP = old.floor + 8.0;
  // The pile cavern's ways out (the channel and the tunnel to the wharf) are drowned at that level: its exits are on
  // the barrel way's dry floor above the channel's head (the last connector points, about 6 m over the water).
  const conn = (i) => {
    const p = CONNECTOR[CONNECTOR.length - 1 - i];
    return { x: fix(p[0]), y: fix(p[1]), z: fix(p[2]) };
  };
  return [
    {
      id: 'piles', name: 'Cölöperdő',
      min: { x: piles.x - A, y: piles.floor - 0.8, z: piles.z - A }, max: { x: piles.x + A, y: piles.floor + piles.roofMid + 0.6, z: piles.z + A },
      floorY: piles.floor, topY: PILES_TOP,
      exits: [conn(6), conn(7)],
      breach: wallSpot(piles.x, piles.floor + 1.5, piles.z, Math.PI / 2 + 0.25),
    },
    {
      id: 'wharf', name: 'Kikötő',
      min: { x: WHARF.x - WHARF.rx - 0.6, y: WHARF.floor - 1, z: WHARF.z - WHARF.rz - 0.6 }, max: { x: WHARF.x + WHARF.rx + 0.6, y: WHARF.floor + 4.6, z: WHARF.z + WHARF.rz + 0.6 },
      floorY: WHARF.floor, topY: WHARF_TOP,
      exits: [onPath(TUNNEL7A, pathIndexAbove(TUNNEL7A, WHARF_TOP + 1.0)), onPath(TUNNEL7A, pathIndexAbove(TUNNEL7A, WHARF_TOP + 2.0))],
      breach: wallSpot(WHARF.x, WHARF.floor + 1.3, WHARF.z, Math.PI + 0.35),
    },
    {
      id: 'oldtown', name: 'Az óváros',
      min: { x: old.x - O, y: old.floor - 0.8, z: old.z - O }, max: { x: old.x + O, y: old.floor + old.roofMid + 0.6, z: old.z + O },
      floorY: old.floor, topY: OLD_TOP,
      exits: [onPath(TUNNEL7B, pathIndexAbove(TUNNEL7B, OLD_TOP + 1.0)), onPath(TUNNEL7B, pathIndexAbove(TUNNEL7B, OLD_TOP + 2.0))],
      breach: wallSpot(old.x, old.floor + 1.5, old.z, -Math.PI / 2 + 0.3),
    },
  ];
})();

/** The flowing water: the channel (one turn round the block) and the stream across the pile cavern. */
export const CURRENTS = [
  { id: 'channel', points: CHANNEL.map((p) => ({ x: fix(p[0]), y: fix(p[1]), z: fix(p[2]) })), width: 2 * CHANNEL_PATH.hw, speed: CHANNEL_SPEED },
  { id: 'stream', points: STREAM7.map((p, i, a) => ({ x: fix(p[0]), y: fix(STREAM7_W0 + ((STREAM7_W1 - STREAM7_W0) * i) / (a.length - 1)), z: fix(p[1]) })), width: 2 * STREAM7_HW, speed: STREAM7_SPEED },
];

/** Where the layer-7 lift lands (the column is lift.js's, x −4, z 9) and Bárd's stall beside it (dry, room above). */
export const LIFT7 = { x: -4, y: WHARF.floor, z: 9 };
export const BARD_STALL = { x: -0.5, y: 0, z: 7.6, yaw: 0 };
{
  BARD_STALL.y = fix(ltFloorAt(BARD_STALL.x, BARD_STALL.z, WHARF.floor + 1.5, 3));
  // Facing the lift (three.js yaw: 0 looks along −z).
  BARD_STALL.yaw = fix(Math.atan2(-(LIFT7.x - BARD_STALL.x), -(LIFT7.z - BARD_STALL.z)), 3);
}

/**
 * The Master's chest against the hoard room's south wall, and the famous find's spot: Girion's emeralds hanging on a
 * peg on the wall above it (a swing at them takes them, as Orkrist on the Elvenking's armoury wall).
 */
export const CHEST7 = { x: 3.45, y: HOARD.y0, z: fix(HOARD.z0 + 0.36), yaw: 0 };
export const FAMOUS7 = { x: 3.45, y: fix(HOARD.y0 + 1.15), z: fix(HOARD.z0 + 0.05) };

/** The barrel way's points for floating barrels: from the grotto's bank down the spiral to the channel's head. */
export const CONNECTOR_PATH = CONNECTOR.filter((_, i) => i % 3 === 0 || i === CONNECTOR.length - 1).map((p) => ({ x: fix(p[0]), y: fix(p[1]), z: fix(p[2]) }));

/**
 * Beneath Lake-town as a site provider for the rising water, the current and Bárd (src/laketown-events/). All points are
 * world positions; floor points have y on the floor. The effects module (laketown-fx.js: setFloodLevel, floodLevel) is
 * game.decor.laketownFx.
 */
export const LAKETOWN_SITE_PROVIDER = {
  inLaketown: (x, y, z) => inLaketown(x, y, z),
  laketownFactor: (y) => laketownFactor(y),
  cavities: CAVITIES,
  currents: CURRENTS,
  inCurrent: (pos) => inCurrent(pos),
  // Standing water only (the pools); the flowing water's level: flowingLevel(x, y, z).
  waterLevel: (x, z, y) => waterLevel(x, z, y),
  bardStall: BARD_STALL,
  famous: FAMOUS7,
  // Also useful: the barrel way from layer 6's grotto, the lift landing, the hoard room, the flowing water's level.
  connector: CONNECTOR_PATH,
  lift: LIFT7,
  hoard: HOARD,
  flowingLevel: (x, y, z) => flowingLevel(x, y, z),
};
