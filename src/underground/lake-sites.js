/* ==== underground/lake-sites.js — Gollum's lake (layer 5, 230–300 m; TERV 0.2, 0.12 "Gollam tavának hideg, kék
   sötétje"): where everything is, the air it stamps into the density field, the fixed water body, and the hooks for
   the Gollum / riddle work (src/gollum/). Pure data and maths (no three.js): world.js (through sites.js) uses
   lakeCavity() for generate(), lake-pieces.js and lake-water.js build the dressing and the water from the same data.

   The layout (world y; the films' cave with the still, dark lake, the book where the films show nothing):
   - THE LAKE CAVE: a wide, low cave filling most of the 24 × 24 m block at the bottom of the layer. Its floor is a
     shallow bowl: a stony shore ring (a broad flat beach on the west side), then the dark water at WATER_Y over a lake
     bed some 5 m deep, and in the middle Gollum's small rocky island ("a slimy island of rock", book ch. 5). The roof
     is a low dome (about 5 m above the water in the middle) that comes down to the shore at the walls.
   - THE TUNNEL: the long passage down to it (book ch. 5: Bilbo crawls through the dark tunnels, finds the Ring lying on
     the tunnel floor, then goes on down until he reaches the cold water). It starts as a dead end just below the
     layer's top (under Goblin-town; players break into it by digging down), spirals down along the block's walls about
     two times, and the last stretch slopes down along the east wall into the cave's shore.
   - THE WATER: a fixed level and a fixed outline (the lake basin). It never flows: digging below the water line outside
     the basin leaves a dry hole; inside the basin the dug hole is lake (NOTES-3a-lake). ==== */
import { fbm3 } from '../noise.js';

/* ---------------------------------------------------------------- the main dimensions ---- */

/** The lake's water surface (world y). */
export const WATER_Y = -285.0;
/** The cave's plan centre (world x, z) and the half size of its rounded-square outline. */
const CC = { x: 0.2, z: 0.4 };
const CAVE_A = 9.5;
/** Superellipse exponent of the outline (2 = circle, larger = squarer: the cave uses the square block). */
const CAVE_P = 3.2;
/** Roof height above the water in the middle, and where it meets the shore at the wall. */
const ROOF_MID = 5.1;
const ROOF_EDGE = 0.7;
/** The deepest lake bed below the water. */
const BED_DEPTH = 5.25;
/** Gollum's island: centre (world x, z), flat-top radius, top height above the water. */
export const ISLAND_C = { x: 1.0, z: -0.6, r: 1.55, top: 0.62 };
/** Direction (plan angle, atan2(dz, dx)) of the broad flat beach where the riddle game is played. */
const BEACH_ANGLE = Math.PI;

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const smoothstep = (a, b, x) => smooth01((x - a) / (b - a));

/** Wrapped angle difference in −π..π. */
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** The cave outline's radius (m) in the plan direction `th`: a rounded square with a slow wobble. */
export function caveRadius(th) {
  const c = Math.abs(Math.cos(th));
  const s = Math.abs(Math.sin(th));
  const sq = CAVE_A / Math.pow(c ** CAVE_P + s ** CAVE_P, 1 / CAVE_P);
  return sq * (1 + 0.035 * Math.sin(3 * th + 1.0) + 0.025 * Math.sin(5 * th + 2.1));
}

/**
 * The shoreline as a fraction of the cave radius in direction `th` (the water reaches out to this): about 0.7, much
 * less towards the broad western beach.
 */
export function shoreFrac(th) {
  const d = angDiff(th, BEACH_ANGLE);
  return 0.78 + 0.045 * Math.sin(2 * th + 0.5) + 0.03 * Math.sin(4 * th + 1.3) - 0.25 * Math.exp(-((d / 0.5) ** 2));
}

/** 0..1: the flat terrace of the western beach (the riddle game's place) in direction `th`. */
function beachW(th) {
  const d = angDiff(th, BEACH_ANGLE);
  return Math.exp(-((d / 0.42) ** 2));
}

/** Plan position → [angle, normalised radius (0 centre, 1 the cave wall at the shore)]. */
const PR = [0, 0];
export function planCoords(x, z, out = PR) {
  const dx = x - CC.x;
  const dz = z - CC.z;
  const th = Math.atan2(dz, dx);
  out[0] = th;
  out[1] = Math.sqrt(dx * dx + dz * dz) / caveRadius(th);
  return out;
}

/** World point at plan angle `th` and normalised radius `t`. */
export function planPoint(th, t) {
  const r = caveRadius(th) * t;
  return [CC.x + Math.cos(th) * r, CC.z + Math.sin(th) * r];
}

/**
 * The cave floor without noise (world y): the lake bed bowl, the shore rising out of the water, Gollum's island. The
 * shore rises on to meet the roof just beyond the wall.
 */
export function floorBase(x, z) {
  planCoords(x, z);
  const th = PR[0];
  const t = PR[1];
  const S = shoreFrac(th);
  let f;
  if (t >= S) {
    // The shore rises out of the water at once (so the waterline sits right at the shoreline, inside the basin's
    // margin), then flattens towards the wall, and climbs to meet the roof beyond it.
    const u = Math.min(1, (t - S) / (0.93 - S));
    f = WATER_Y - 0.06 + 0.92 * (0.6 * u + 0.4 * (1 - (1 - u) * (1 - u))) + 1.4 * smoothstep(0.93, 1.06, t);
    // The western beach: a flat terrace 0.3 m above the water from just past the water's edge to the wall.
    const bw = beachW(th);
    if (bw > 0.01) {
      const w = bw * smoothstep(S + 0.02, S + 0.09, t) * (1 - smoothstep(0.9, 0.97, t));
      f += (WATER_Y + 0.3 - f) * w;
    }
  } else f = WATER_Y - 0.06 - (BED_DEPTH - 0.06) * smooth01((S - t) / 0.3);
  // The island: a low flat-topped rock, steep sides into the deep water.
  const di = Math.hypot(x - ISLAND_C.x, z - ISLAND_C.z);
  const fi = di < ISLAND_C.r ? WATER_Y + ISLAND_C.top - 0.14 * (di / ISLAND_C.r) ** 2 : WATER_Y + ISLAND_C.top - 0.14 - 2.6 * (di - ISLAND_C.r);
  return fi > f ? fi : f;
}

/** The cave roof without noise (world y): a low dome, down to the shore at the wall. */
export function roofBase(x, z) {
  planCoords(x, z);
  const t = PR[1];
  const k = 1 - t * t * t * t;
  return WATER_Y + ROOF_EDGE + (ROOF_MID - ROOF_EDGE) * (k > 0 ? Math.sqrt(k) : 0) - (t > 1 ? (t - 1) * 8 : 0);
}

/* ---------------------------------------------------------------- the tunnel ---- */

/** Tube radius of the tunnel (its flat floor is 0.6 r below the axis: about 1.8 m of headroom, a hobbit's tunnel). */
const TUBE_R = 1.15;
/** Rounded-square path of the spiral: half size, corner radius, centre (the block's centre). */
const PATH_H = 8.95;
const PATH_CR = 2.8;
/** The spiral's slope (floor drop per metre of path) and the dead end at its top (below the layer's top at 230 m). */
const SPIRAL_SLOPE = 0.3;
const TOP_FLOOR = -237.6;
/** Where the spiral ends (world y at the north-east corner), before the last ramp down into the cave. */
const SPIRAL_END_Y = -279.8;

/**
 * A point on the rounded-square loop at arc length `a` (wrapped): a = 0 is the start of the east straight edge at its
 * north end (x = H, z = H − cr), increasing southwards along the east edge, then west, north and east again.
 */
function loopPoint(a) {
  const H = PATH_H;
  const cr = PATH_CR;
  const L = 2 * (H - cr);
  const Q = (Math.PI / 2) * cr;
  const per = 4 * (L + Q);
  let s = ((a % per) + per) % per;
  // Four sides, each a straight edge then a quarter corner. Side k turns the frame by k × 90°.
  const side = Math.floor(s / (L + Q));
  s -= side * (L + Q);
  let lx;
  let lz;
  if (s < L) {
    lx = H;
    lz = H - cr - s;
  } else {
    const ang = ((s - L) / cr);
    lx = H - cr + Math.cos(ang) * cr;
    lz = -(H - cr) - Math.sin(ang) * cr;
  }
  // Rotate the local frame (east edge going south) by side × 90° clockwise in the plan (x → −z → −x → z).
  const rot = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]][side];
  return [rot[0] * lx + rot[1] * lz, rot[2] * lx + rot[3] * lz];
}

/** Tunnel floor points [x, y, z] from the dead end at the top down to the cave's shore (about 2 m apart). */
export const TUNNEL5 = (() => {
  const L = (SPIRAL_END_Y - TOP_FLOOR) / -SPIRAL_SLOPE;
  const pts = [];
  const step = 2;
  const n = Math.ceil(L / step);
  for (let i = 0; i <= n; i++) {
    const a = -L + (L * i) / n;
    const [x, z] = loopPoint(a);
    pts.push([x, TOP_FLOOR - SPIRAL_SLOPE * (L * i) / n, z]);
  }
  // The last ramp: south along the east wall, then in onto the shore (it opens into the cave's low edge on the way).
  const [ex, ez] = loopPoint(0);
  const ramp = [[ex, -281.2, ez - 3.4], [ex - 0.1, -282.6, ez - 6.6], [ex - 0.45, -283.75, ez - 9.4], [ex - 1.6, -284.25, ez - 11.4]];
  for (const p of ramp) pts.push(p);
  return pts;
})();

/** Per segment: the floor's y range (for the quick height bucket below). */
const SEGS = [];
/** Plan margin round a segment beyond which its tube cannot matter (the density saturates 1 m from the surface). */
const SEG_M = TUBE_R + 2.4;
for (let i = 0; i + 1 < TUNNEL5.length; i++) {
  const a = TUNNEL5[i];
  const b = TUNNEL5[i + 1];
  SEGS.push({
    a, b, y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]),
    x0: Math.min(a[0], b[0]) - SEG_M, x1: Math.max(a[0], b[0]) + SEG_M, z0: Math.min(a[2], b[2]) - SEG_M, z1: Math.max(a[2], b[2]) + SEG_M,
  });
}
/** Height buckets (1 m) → the segments whose tube may reach that height. */
const BUCKET_Y0 = -300;
const BUCKETS = Array.from({ length: 80 }, () => []);
SEGS.forEach((s, i) => {
  const lo = Math.max(0, Math.floor(s.y0 - 1.5 - BUCKET_Y0));
  const hi = Math.min(BUCKETS.length - 1, Math.floor(s.y1 + 2 * TUBE_R + 1.5 - BUCKET_Y0));
  for (let k = lo; k <= hi; k++) BUCKETS[k].push(i);
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

/** Signed distance of the tunnel's air (negative inside): a tube with a flat floor; Infinity when far. */
function tunnelBase(x, y, z) {
  const k = Math.floor(y - BUCKET_Y0);
  if (k < 0 || k >= BUCKETS.length) return Infinity;
  const list = BUCKETS[k];
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

/* ---------------------------------------------------------------- the cavity field ---- */

/** The cave's vertical extent (world y), with room for the noise. */
const CAVE_Y0 = WATER_Y - BED_DEPTH - 1.6;
const CAVE_Y1 = WATER_Y + ROOF_MID + 1.2;

/**
 * Floor and roof of the last plan position asked for (generate() walks each column bottom to top, so the plan maths
 * runs once per column instead of once per sample).
 */
const COL = { x: NaN, z: NaN, f: 0, r: 0 };
function column(x, z) {
  if (x !== COL.x || z !== COL.z) {
    COL.x = x;
    COL.z = z;
    COL.f = floorBase(x, z);
    COL.r = roofBase(x, z);
  }
  return COL;
}

/** Signed distance of the cave's air without noise (negative inside): between the floor and the roof. */
function caveBase(x, y, z) {
  if (y < CAVE_Y0 || y > CAVE_Y1) return Infinity;
  const col = column(x, z);
  const f = col.f;
  const r = col.r;
  // A sliver of air where the roof meets the shore is closed off (the noise would leave thin holes there).
  return Math.max(f - y, y - r, (f + 0.25 - r) * 0.5);
}

/** The bounds of the whole lake site's air (world box), for quick rejects (kept below 234.5 m: layer 4 is untouched). */
export const LAKE_BOUNDS = { x0: -12, x1: 12, y0: CAVE_Y0 - 0.5, y1: -234.6, z0: -12, z1: 12 };

/**
 * Signed distance (m, negative in the air) of the lake site (cave and tunnel) without the rock noise; Infinity outside
 * its bounds. Cheap enough for per-frame tests (inLakeCave) and the dressing's placement.
 */
export function lakeBase(x, y, z) {
  if (y < LAKE_BOUNDS.y0 || y > LAKE_BOUNDS.y1) return Infinity;
  let d = caveBase(x, y, z);
  const t = tunnelBase(x, y, z);
  if (t < d) d = t;
  if (d === Infinity) return d;
  // Everything closes before the block's side walls (a smooth union with a wall plane 1.8 m in: rounded ends).
  const edge = Math.min(x + 12, 12 - x, z + 12, 12 - z);
  if (edge < 3.2) {
    const w = 1.8 - edge;
    const k = 0.9;
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (w - d)) / k));
    d = d + (w - d) * h + k * h * (1 - h);
  }
  return d;
}

/**
 * The cavity at a world point as generate() stamps it: lakeBase plus craggy rock noise (strong on the roof and the
 * walls, faint on the shore and the island top, medium on the lake bed). Negative in the air, Infinity outside the
 * bounds. Deterministic (the save stores the terrain as differences from generate()).
 */
export function lakeCavity(x, y, z) {
  const d = lakeBase(x, y, z);
  if (d === Infinity || d > 2.2 || d < -2.2) return d;
  let amp = 0.3;
  if (y > CAVE_Y0 && y < CAVE_Y1 && x > -11 && x < 11 && z > -11 && z < 11) {
    // Inside the cave's footprint: by how far above the local floor the point is.
    const f = column(x, z).f;
    const above = y - f;
    const shore = above < 0.6 && f > WATER_Y - 0.3 ? 1 - smoothstep(0.1, 0.6, above) : 0;
    amp = 0.55 - 0.44 * shore - (f < WATER_Y - 0.3 && above < 1 ? 0.25 : 0);
  }
  const rough = (fbm3(x * 0.42, y * 0.42, z * 0.42) - 0.5) * 1.5 + (fbm3(x * 1.35, y * 1.35, z * 1.35) - 0.5) * 0.42;
  return d + rough * amp;
}

/** Marches down from y0 to the first solid point of lakeCavity (deterministic floor height for the dressing). */
export function lakeFloorAt(x, z, y0, range = 4) {
  for (let y = y0; y > y0 - range; y -= 0.03) if (lakeCavity(x, y, z) > 0) return y + 0.02;
  return y0 - range;
}

/** Marches up from y0 to the first solid point (the roof above a point, for stalactites). */
export function lakeRoofAt(x, z, y0, range = 8) {
  for (let y = y0; y < y0 + range; y += 0.04) if (lakeCavity(x, y, z) > 0) return y - 0.02;
  return y0 + range;
}

/* ---------------------------------------------------------------- the water ---- */

/** Margin (normalised radius) by which the water outline reaches past the shoreline into the shore (hidden there). */
export const BASIN_MARGIN = 0.05;

/**
 * True when a plan position lies inside the lake basin (the fixed water outline). The water body is the basin below
 * WATER_Y; it never flows anywhere else (NOTES-3a-lake: dug cavities beside it stay dry).
 */
export function inBasin(x, z) {
  if (x < -11 || x > 11 || z < -11 || z > 11) return false;
  planCoords(x, z);
  return PR[1] < shoreFrac(PR[0]) + BASIN_MARGIN;
}

/** True for a point in the lake's water (inside the basin, below the surface, above the deepest possible bed). */
export function inWater(x, y, z) {
  return y < WATER_Y && y > WATER_Y - BED_DEPTH - 3 && inBasin(x, z);
}

/* ---------------------------------------------------------------- hooks for the Gollum work ---- */

/**
 * True when a world position is in the lake site: in its air (the cave, the water, the tunnel down to it) or within
 * `margin` metres of it in the rock (default 1.5 m: a player digging in its walls counts too).
 */
export function inLakeCave(x, y, z, margin = 1.5) {
  if (y < LAKE_BOUNDS.y0 - margin || y > LAKE_BOUNDS.y1 + margin) return false;
  return lakeBase(x, y, z) < margin;
}

/** 0..1: how deep inside the lake site's air a point is (1 more than ~2 m inside, 0 outside): for fog and sound. */
export function lakeFactor(x, y, z) {
  const d = lakeBase(x, y, z);
  if (d === Infinity) return 0;
  return smooth01((0.5 - d) / 2.5);
}

/** A standing point on Gollum's island (its flat top). */
export const ISLAND = { x: ISLAND_C.x, y: lakeFloorAt(ISLAND_C.x, ISLAND_C.z, WATER_Y + 2), z: ISLAND_C.z };

/**
 * The riddle spot: where Gollum crouches for the riddle game, on the dry, flat terrace of the broad western beach just
 * above the water's edge (he comes ashore there from the island); `yaw` (three.js: 0 looks along −z) is the way he
 * faces, inland towards the player. The terrace is flat (0.3 m above the water) from here about 2.6 m inland and
 * ±2.5 m to the sides, so the player stands facing him about 1.5–2 m away along yaw (RIDDLE_PLAYER).
 */
export const RIDDLE_SPOT = (() => {
  const t = shoreFrac(BEACH_ANGLE) + 0.115;
  const [x, z] = planPoint(BEACH_ANGLE, t);
  const [px, pz] = planPoint(BEACH_ANGLE, t + 0.19);
  return { x: +x.toFixed(3), y: +lakeFloorAt(x, z, WATER_Y + 2).toFixed(3), z: +z.toFixed(3), yaw: +Math.atan2(-(px - x), -(pz - z)).toFixed(4) };
})();

/** Where the player naturally stands for the riddle game: on the terrace, facing Gollum (QA, bench). */
export const RIDDLE_PLAYER = (() => {
  const t = shoreFrac(BEACH_ANGLE) + 0.115 + 0.19;
  const [x, z] = planPoint(BEACH_ANGLE, t);
  return { x: +x.toFixed(3), y: +lakeFloorAt(x, z, WATER_Y + 2).toFixed(3), z: +z.toFixed(3), yaw: +Math.atan2(-(RIDDLE_SPOT.x - x), -(RIDDLE_SPOT.z - z)).toFixed(4) };
})();

/** Where the lift's landing is (lift.js COLUMN): kept clear of lurk points and dressing. */
export const LIFT_SPOT = { x: -4, z: 9 };

/**
 * Lurk points: dark spots on the shore at the water's edge, under the low roof by the walls, where Gollum can appear
 * (12 points round the lake; none at the lift landing or on the riddle beach's middle).
 */
export const LURK_POINTS = (() => {
  const out = [];
  for (let k = 0; k < 14; k++) {
    const th = -Math.PI + (k + 0.5) * ((2 * Math.PI) / 14);
    const t = shoreFrac(th) + 0.06;
    const [x, z] = planPoint(th, t);
    if (Math.hypot(x - LIFT_SPOT.x, z - LIFT_SPOT.z) < 3.5) continue;
    if (Math.abs(angDiff(th, BEACH_ANGLE)) < 0.25) continue;
    out.push({ x: +x.toFixed(2), y: +lakeFloorAt(x, z, WATER_Y + 2).toFixed(2), z: +z.toFixed(2) });
  }
  return out;
})();

/**
 * Gollum's paddling route on the water surface (book ch. 5: he paddles his little boat with his feet): from the
 * island's edge (first point) in a curve round the island's north side and across to the water's edge below the riddle
 * spot (last point). Every point has at least 0.8 m of water under it.
 */
export const SWIM_PATH = (() => {
  const out = [];
  const [ex, ez] = planPoint(BEACH_ANGLE, shoreFrac(BEACH_ANGLE) - 0.09);
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    // From the island's east-north edge, out round its north side (+z), then west to the riddle beach.
    const a = 0.35 + t * 2.5;
    const rr = ISLAND_C.r + 0.8 + 1.4 * Math.sin(t * Math.PI);
    let x = ISLAND_C.x + Math.cos(a) * rr;
    let z = ISLAND_C.z + Math.sin(a) * rr;
    // The last third bends over to the beach's water edge.
    const w = smoothstep(0.55, 1, t);
    x += (ex - x) * w;
    z += (ez - z) * w;
    out.push({ x: +x.toFixed(2), y: WATER_Y, z: +z.toFixed(2) });
  }
  return out;
})();

/**
 * Where the Ring lies (book ch. 5: Bilbo's hand met it on the floor of the tunnel in the dark, before he reached the
 * lake): on the tunnel floor, about two thirds of the way down.
 */
export const RING_SPOT = (() => {
  const i = Math.round(TUNNEL5.length * 0.68);
  const a = TUNNEL5[i];
  const b = TUNNEL5[i + 1];
  const x = (a[0] + b[0]) / 2;
  const z = (a[2] + b[2]) / 2;
  return { x: +x.toFixed(3), y: +lakeFloorAt(x, z, (a[1] + b[1]) / 2 + 1.2, 3).toFixed(3), z: +z.toFixed(3) };
})();

/**
 * Gollum's lake as a site provider for the Gollum / riddle work (src/gollum/): the fixed water level and tests, the
 * island, the riddle spot, lurk points, the paddling route and the Ring's spot on the tunnel floor.
 */
export const LAKE_SITE_PROVIDER = {
  waterLevel: WATER_Y,
  inWater: (x, y, z) => inWater(x, y, z),
  inside: (x, y, z) => inLakeCave(x, y, z),
  island: ISLAND,
  riddleSpot: RIDDLE_SPOT,
  lurkPoints: LURK_POINTS,
  swimPath: SWIM_PATH,
  ringSpot: RING_SPOT,
};
