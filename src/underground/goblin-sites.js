/* ==== underground/goblin-sites.js — Goblin-town (layer 4, 150–230 m; TERV 0.2, 0.12, kutatas-latvany.md "Later
   layers"): where everything is, the air it stamps into the density field, the walkways the players (and later the
   goblins) walk on, and the hooks for the enemies module. Pure data and maths (no three.js): world.js (through
   sites.js) uses goblinCavity() for generate(), goblin-pieces.js builds the dressing from the same data.

   The layout (world y; the films' "great rift inside the mountain" fitted into the 24 × 24 m pit block):
   - THE RIFT: a tall cleft along the block's diagonal (rift frame: s along it, u across it). Its upper hall is an
     arched slot ~12 m wide with flat rock ledges at y −180 on both sides; between the ledges THE CHASM drops to y −214
     (a real hole: a fall from a ledge is far beyond the landing-speed death rule). The roof is at about −165.
   - Timber GALLERIES along both walls at y −173, bridges across the chasm at both levels, ladders between them, a
     rope ladder down the chasm wall, and in the middle the Great Goblin's platform on stone pillars.
   - Goblin TUNNELS lead off the hall to dead ends near the block walls (the "mouths" the goblins come out of), a
     workshop off the east ledge, the lift tunnel, the back gate at the chasm floor, and high up the "front porch"
     cave with the chute the company slid down. ==== */
import { fbm3 } from '../noise.js';

/* ---------------------------------------------------------------- the rift frame ---- */

/** Unit vector along the rift (in x, z) and across it. */
const AX = { x: 0.7809, z: 0.6247 };
const NX = { x: -0.6247, z: 0.7809 };
/** The rift's centre line wanders a little (u offset by s). */
const wob = (s) => 0.7 * Math.sin(s * 0.22 + 0.6);

/** World (x, z) → rift (s, u). */
export function toRift(x, z, out = [0, 0]) {
  const s = x * AX.x + z * AX.z;
  out[0] = s;
  out[1] = x * NX.x + z * NX.z - wob(s);
  return out;
}

/** Rift (s, u) → world [x, z]. */
export function fromRift(s, u) {
  const v = u + wob(s);
  return [s * AX.x + v * NX.x, s * AX.z + v * NX.z];
}

/** Heading (yaw about y, three.js convention: 0 looks along −z) of the rift's +s direction and +u direction. */
export const RIFT_YAW_S = Math.atan2(-AX.x, -AX.z);
export const RIFT_YAW_U = Math.atan2(-NX.x, -NX.z);

/* ---------------------------------------------------------------- the main dimensions ---- */

/** Rock ledge floor of the hall (both sides of the chasm). */
export const LEDGE_Y = -180;
/** Top of the timber galleries' decks along both walls. */
export const GALLERY_Y = -173;
/** The chasm's floor. */
export const CHASM_FLOOR = -214;
/** Half width of the chasm (nominal; the rough walls wander ±0.6 m). */
export const CHASM_HALF = 2.4;
/** The hall's cross-section: an ellipse of half width HALL_W and half height HALL_H centred HALL_DROP below the ledge. */
const HALL_W = 6.2;
const HALL_H = 18;
const HALL_C = LEDGE_Y - 3;
/** Top of the Great Goblin's platform (a little above the ledges). */
export const THRONE_DECK_Y = LEDGE_Y + 0.25;

/** Half width of the hall at height y (0 above the roof). */
export function hallHalf(y) {
  const t = (y - HALL_C) / HALL_H;
  return t >= 1 ? 0 : HALL_W * Math.sqrt(1 - t * t);
}

/** The stone pillars under the Great Goblin's platform (rift coordinates), standing on the chasm floor. */
export const PILLARS = [
  { s: -1.15, u: -0.35, r: 0.95, top: THRONE_DECK_Y - 0.32 },
  { s: 1.25, u: 0.4, r: 0.85, top: THRONE_DECK_Y - 0.32 },
];

/* ---------------------------------------------------------------- tunnels and caves ---- */

const W = (s, u, y) => {
  const [x, z] = fromRift(s, u);
  return [x, y, z];
};

/**
 * Goblin tunnels: polylines of floor points [x, y_floor, z], tube radius r (the floor is flat, 0.6 r below the tube's
 * axis: about 2 m of headroom). `mouth`: the last point is a dead end near the block wall where goblins come out.
 */
export const TUNNELS = [
  // The lift tunnel: from the east gallery (+u wall) to the barrel lift's column (lift.js COLUMN −4, 9).
  { id: 'lift', r: 1.25, mouth: false, pts: [W(2.5, 4.2, GALLERY_Y - 0.15), W(2.5, 6.6, GALLERY_Y - 0.15), [-4.0, GALLERY_Y - 0.15, 9.3]] },
  // Upper side tunnel off the west gallery (−u wall).
  { id: 'galeria-del', r: 1.2, mouth: true, pts: [W(-3, -4.2, GALLERY_Y - 0.15), W(-3, -7.2, GALLERY_Y - 0.1), W(-2.4, -9.9, GALLERY_Y + 0.2)] },
  // Ledge-level side tunnels, one off each ledge.
  { id: 'parkany-kelet', r: 1.3, mouth: true, pts: [W(6, -5.4, LEDGE_Y - 0.05), W(6.2, -7.2, LEDGE_Y), W(5.6, -8.6, LEDGE_Y + 0.15)] },
  { id: 'parkany-nyugat', r: 1.3, mouth: true, pts: [W(-6, 5.4, LEDGE_Y - 0.05), W(-6.3, 7.2, LEDGE_Y), W(-5.8, 8.6, LEDGE_Y + 0.15)] },
  // Deep tunnel off the chasm floor's +s end.
  { id: 'szakadek-kelet', r: 1.3, mouth: true, pts: [W(10.6, 0.4, CHASM_FLOOR + 0.1), W(11.2, 2.4, CHASM_FLOOR + 0.2), W(10.9, 3.9, CHASM_FLOOR + 0.35)] },
  // The way to the back gate: from the chasm floor towards the +u corner.
  { id: 'hatso-kapu', r: 1.15, mouth: false, pts: [W(-1.6, 1.4, CHASM_FLOOR + 0.05), W(-1.8, 4.5, CHASM_FLOOR + 0.15), W(-1.5, 7.6, CHASM_FLOOR + 0.3), W(-1.7, 10.0, CHASM_FLOOR + 0.35)] },
  // The chute from the front porch down to the west gallery (the company slid down it, film).
  { id: 'csuszda', r: 0.95, mouth: false, chute: true, pts: [W(1.2, -10.6, -159.2), W(4.0, -10.8, -161.6), W(4.6, -8.4, -164.8), W(2.2, -7.6, -167.8), W(-0.4, -7.9, -170.6), W(-1.0, -5.3, GALLERY_Y + 0.05)] },
];

/** Rooms (rough boxes with rounded edges): the goblin workshop off the −u ledge, the back gate's hall. */
export const ROOMS4 = [
  { id: 'muhely', kind: 'workshop', s: 2.8, u: -8.1, y: LEDGE_Y, w: 4.4, d: 3.4, h: 2.8, yaw: RIFT_YAW_S },
  { id: 'kapu', kind: 'gate', s: -1.7, u: 9.9, y: CHASM_FLOOR + 0.35, w: 2.8, d: 2.0, h: 2.6, yaw: RIFT_YAW_S },
  // The short passage outside the back gate (its far end shows the daylight).
  { id: 'kapu-kint', kind: 'gate-out', s: -1.7, u: 11.8, y: CHASM_FLOOR + 0.35, w: 1.3, d: 1.7, h: 2.35, yaw: RIFT_YAW_S },
];

/** The "front porch" (book ch. 4; the film's cave with the trapdoor floor): a low cave near the layer's top. */
export const PORCH = { s: 1.2, u: -10.9, floor: -159.2, rx: 2.8, ry: 1.55, rz: 2.2 };

/** Doorway of the back gate (world): the door stands across the room's far end, the gap faces the room. */
export const BACK_GATE = (() => {
  const r = ROOMS4[1];
  const [x, z] = fromRift(r.s, r.u + r.w / 2 - 0.15);
  return { x, y: r.y, z, yaw: RIFT_YAW_U };
})();

/* ---------------------------------------------------------------- walkways ---- */

/**
 * Timber decks (top surface at y): a straight run from rift (s0, u0) to (s1, u1), `w` wide across the run. `rail`:
 * which long side gets a hand rail (+1 the +u side of the run's centre line, −1 the −u side, 0 none).
 */
export const DECKS = [
  // The galleries along the two walls (gaps where the ladders come up and the bridges land are left in the rails).
  { id: 'galeria-nyugat-1', s0: -8.5, s1: -1.6, u: -4.45, w: 1.25, y: GALLERY_Y, rail: 1 },
  { id: 'galeria-nyugat-2', s0: -1.6, s1: 8.6, u: -4.45, w: 1.25, y: GALLERY_Y, rail: 1 },
  { id: 'galeria-kelet-1', s0: -8.8, s1: 1.2, u: 4.45, w: 1.25, y: GALLERY_Y, rail: -1 },
  { id: 'galeria-kelet-2', s0: 1.2, s1: 9.2, u: 4.45, w: 1.25, y: GALLERY_Y, rail: -1 },
  // The Great Goblin's platform over the chasm (on the stone pillars), between the two ledges.
  { id: 'tronemelvény', s0: -2.4, s1: 2.4, u: 0, w: 6.4, y: THRONE_DECK_Y, rail: 0, platform: true },
];

/** Bridges across the chasm: rift s, from u0 to u1 at height y, `sag` metres at mid-span, kind 'rope' | 'chain' | 'plank'. */
export const BRIDGES = [
  { id: 'kotelhid', s: -7.2, u0: -3.3, u1: 3.3, y: LEDGE_Y + 0.02, sag: 0.4, w: 1.0, kind: 'rope' },
  { id: 'lanchid', s: 7.4, u0: -3.3, u1: 3.3, y: LEDGE_Y + 0.02, sag: 0.35, w: 1.05, kind: 'chain' },
  { id: 'felso-lanchid', s: -4.4, u0: -3.85, u1: 3.85, y: GALLERY_Y, sag: 0.6, w: 0.95, kind: 'chain' },
  { id: 'felso-palló', s: 4.9, u0: -3.85, u1: 3.85, y: GALLERY_Y, sag: 0.25, w: 1.0, kind: 'plank' },
];

/** Height of a bridge's walking surface at fraction t (0..1) of its span. */
export function bridgeY(b, t) {
  return b.y - b.sag * 4 * t * (1 - t);
}

/**
 * Climbable ladders (fixed; props.js Ladders.addFixed): foot at rift (s, u) at y0, top y1, `face` the rift heading the
 * climber faces. Ledge → gallery ladders stand 0.55 m off the gallery deck's inner edge (no deck above the head).
 */
export const LADDERS4 = [
  { id: 'letra-ny-1', s: -8.0, u: -3.3, y0: LEDGE_Y, y1: GALLERY_Y + 0.35 },
  { id: 'letra-ny-2', s: 6.6, u: -3.3, y0: LEDGE_Y, y1: GALLERY_Y + 0.35 },
  { id: 'letra-k-1', s: -6.1, u: 3.3, y0: LEDGE_Y, y1: GALLERY_Y + 0.35 },
  { id: 'letra-k-2', s: 3.1, u: 3.3, y0: LEDGE_Y, y1: GALLERY_Y + 0.35 },
  // The long rope ladder down the chasm's −u wall to the chasm floor.
  { id: 'kotelletra', s: -5.2, u: -1.95, y0: CHASM_FLOOR, y1: LEDGE_Y + 0.4, rope: true },
];

/* ---------------------------------------------------------------- the cavity field ---- */

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

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

const segOut = { t: 0 };
const rf = [0, 0];

/** The rift's air without noise (negative inside): hall, ledge floors, chasm, minus the pillars. */
function riftBase(x, y, z, s, u) {
  // Upper hall: elliptic arch, flat ledge floor.
  const ex = u / HALL_W;
  const ey = (y - HALL_C) / HALL_H;
  let d = Math.max((Math.sqrt(ex * ex + ey * ey) - 1) * HALL_W, LEDGE_Y - y);
  // The chasm between the ledges, open into the hall above.
  const dc = Math.max(Math.abs(u) - CHASM_HALF, CHASM_FLOOR - y, y - (LEDGE_Y + 2));
  if (dc < d) d = dc;
  // The platform's pillars stay as rock (slightly wider at the foot).
  for (let i = 0; i < PILLARS.length; i++) {
    const p = PILLARS[i];
    if (y > p.top + 0.5) continue;
    const r = p.r + Math.max(0, (p.top - y) * 0.018) + (y < CHASM_FLOOR + 1.5 ? (CHASM_FLOOR + 1.5 - y) * 0.35 : 0);
    const ds = s - p.s;
    const du = u - p.u;
    const pd = Math.max(Math.sqrt(ds * ds + du * du) - r, y - p.top);
    if (-pd > d) d = -pd;
  }
  return d;
}

function tunnelBase(x, y, z, t) {
  const pts = t.pts;
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const r = t.r;
    // Axis 0.6 r above the floor points.
    const dist = segDist(x, y - 0.6 * r, z, a, b, segOut);
    const fy = a[1] + (b[1] - a[1]) * segOut.t;
    // The chute is a round tube (no flat floor): the company slid down it.
    const d = t.chute ? dist - r : Math.max(dist - r, fy - y);
    if (d < best) best = d;
  }
  return best;
}

/** Rough box room (rift frame, yaw = the room's local x direction): rounded edges. */
function roomBase(x, y, z, r) {
  if (r.cx === undefined) {
    [r.cx, r.cz] = fromRift(r.s, r.u);
    r.c = Math.cos(r.yaw);
    r.sn = Math.sin(r.yaw);
  }
  const c = r.c;
  const sn = r.sn;
  const dx = x - r.cx;
  const dz = z - r.cz;
  // Local frame: lx along the yaw heading's right, lz along the heading.
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  const qx = Math.abs(lx) - r.w / 2 + 0.6;
  const qz = Math.abs(lz) - r.d / 2 + 0.6;
  const qy = Math.abs(y - (r.y + r.h / 2)) - r.h / 2 + 0.6;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  const o = Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - 0.6;
  return Math.max(o, r.y - y);
}

const PORCH_C = fromRift(PORCH.s, PORCH.u);

function porchBase(x, y, z) {
  const ex = (x - PORCH_C[0]) / PORCH.rx;
  const ey = (y - PORCH.floor - PORCH.ry * 0.55) / PORCH.ry;
  const ez = (z - PORCH_C[1]) / PORCH.rz;
  const e = Math.sqrt(ex * ex + ey * ey + ez * ez);
  return Math.max((e - 1) * Math.min(PORCH.rx, PORCH.ry, PORCH.rz), PORCH.floor - y);
}

/** World boxes (with a margin for the noise) of every tunnel, room and the porch: goblinBase skips the far ones. */
const PART_BOXES = [];
{
  const M = 2.6;
  for (const t of TUNNELS) {
    const xs = t.pts.map((p) => p[0]);
    const ys = t.pts.map((p) => p[1]);
    const zs = t.pts.map((p) => p[2]);
    PART_BOXES.push({ kind: 0, part: t, x0: Math.min(...xs) - t.r - M, x1: Math.max(...xs) + t.r + M, y0: Math.min(...ys) - M, y1: Math.max(...ys) + 2 * t.r + M, z0: Math.min(...zs) - t.r - M, z1: Math.max(...zs) + t.r + M });
  }
  for (const r of ROOMS4) {
    const [cx, cz] = fromRift(r.s, r.u);
    const e = Math.hypot(r.w, r.d) / 2 + M;
    PART_BOXES.push({ kind: 1, part: r, x0: cx - e, x1: cx + e, y0: r.y - M, y1: r.y + r.h + M, z0: cz - e, z1: cz + e });
  }
  const [px, pz] = fromRift(PORCH.s, PORCH.u);
  PART_BOXES.push({ kind: 2, part: PORCH, x0: px - PORCH.rx - M, x1: px + PORCH.rx + M, y0: PORCH.floor - M, y1: PORCH.floor + 2 * PORCH.ry + M, z0: pz - PORCH.rz - M, z1: pz + PORCH.rz + M });
}

/** The bounds of the whole of Goblin-town's air (world box), for quick rejects. */
export const GOBLIN_BOUNDS = { x0: -12, x1: 12, y0: CHASM_FLOOR - 1.5, y1: -155.6, z0: -12, z1: 12 };

/**
 * Signed distance (m, negative in the air) of Goblin-town without the rock noise; Infinity outside its bounds.
 * Cheap enough for per-frame tests (inGoblinTown) and the dressing's placement.
 */
export function goblinBase(x, y, z) {
  if (y < GOBLIN_BOUNDS.y0 || y > GOBLIN_BOUNDS.y1) return Infinity;
  toRift(x, z, rf);
  const s = rf[0];
  const u = rf[1];
  let d = Infinity;
  if (y < -163 && Math.abs(u) < HALL_W + 2.6) d = riftBase(x, y, z, s, u);
  for (let i = 0; i < PART_BOXES.length; i++) {
    const b = PART_BOXES[i];
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1 || z < b.z0 || z > b.z1) continue;
    const v = b.kind === 0 ? tunnelBase(x, y, z, b.part) : b.kind === 1 ? roomBase(x, y, z, b.part) : porchBase(x, y, z);
    if (v < d) d = v;
  }
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
 * The cavity at a world point as generate() stamps it: goblinBase plus craggy rock noise (strong on the walls and the
 * roof, faint on the ledge and chasm floors and in the tunnels). Negative in the air, Infinity outside the bounds.
 * Deterministic (the save stores the terrain as differences from generate()).
 */
export function goblinCavity(x, y, z) {
  const d = goblinBase(x, y, z);
  if (d === Infinity || d > 2.2 || d < -2.2) return d;
  toRift(x, z, rf);
  const u = Math.abs(rf[1]);
  const inHall = y < -163 && u < HALL_W + 1.2;
  // Floors stay walkable: the noise fades towards the ledges (outside the chasm) and the chasm floor.
  const ledge = 1 - (1 - smooth01((y - LEDGE_Y - 0.15) / 1.3)) * smooth01((u - CHASM_HALF - 0.25) / 1.0);
  const chasm = smooth01((y - CHASM_FLOOR - 0.2) / 1.6);
  const amp = inHall ? 0.22 + 0.78 * ledge * chasm : 0.3;
  const rough = (fbm3(x * 0.42, y * 0.42, z * 0.42) - 0.5) * 1.5 + (fbm3(x * 1.35, y * 1.35, z * 1.35) - 0.5) * 0.42;
  return d + rough * amp;
}

/** Marches down from y0 to the first solid point of goblinCavity (deterministic floor height for the dressing). */
export function goblinFloorAt(x, z, y0, range = 3) {
  for (let y = y0; y > y0 - range; y -= 0.04) if (goblinCavity(x, y, z) > 0) return y + 0.02;
  return y0 - range;
}

/* ---------------------------------------------------------------- hooks for the enemies module ---- */

/**
 * True when a world position is inside Goblin-town: in its air (rift, galleries, chasm, tunnels, rooms, porch) or
 * within `margin` metres of it in the rock (default 1.5 m: a player digging in its walls counts too).
 */
export function inGoblinTown(x, y, z, margin = 1.5) {
  if (y < GOBLIN_BOUNDS.y0 - margin || y > GOBLIN_BOUNDS.y1 + margin) return false;
  return goblinBase(x, y, z) < margin;
}

/** 0..1: how deep inside Goblin-town's air a point is (1 more than ~2 m inside, 0 outside): for fog and sound. */
export function goblinFactor(x, y, z) {
  const d = goblinBase(x, y, z);
  if (d === Infinity) return 0;
  return smooth01((0.5 - d) / 2.5);
}

/**
 * Side-tunnel mouths: where goblins come out of the mountain (world points on the tunnel floor at the dead end, `dir`
 * a unit [dx, dz] pointing back into Goblin-town). The porch's back crack is the book's "crack at the back of the cave".
 */
export const GOBLIN_MOUTHS = [
  ...TUNNELS.filter((t) => t.mouth).map((t) => {
    const a = t.pts[t.pts.length - 1];
    const b = t.pts[t.pts.length - 2];
    const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const k = 0.9 / l;
    return { id: t.id, x: a[0] + (b[0] - a[0]) * k, y: a[1], z: a[2] + (b[2] - a[2]) * k, dir: [(b[0] - a[0]) / l, (b[2] - a[2]) / l] };
  }),
  (() => {
    const [x, z] = fromRift(PORCH.s - 1.4, PORCH.u - 1.2);
    const [x2, z2] = fromRift(PORCH.s, PORCH.u);
    const l = Math.hypot(x2 - x, z2 - z);
    return { id: 'tornac-repedes', x, y: PORCH.floor, z, dir: [(x2 - x) / l, (z2 - z) / l] };
  })(),
];

/** Where the Great Goblin sits (world: the seat of the throne on the platform) and the direction he faces. */
export const THRONE = (() => {
  const [x, z] = fromRift(0.9, 0);
  return { x, y: THRONE_DECK_Y, z, yaw: RIFT_YAW_S + Math.PI };
})();

const gal = (side, s) => W(s, side * 4.45, GALLERY_Y);
const ledge = (side, s) => W(s, side * 4.2, LEDGE_Y);
const bridgePts = (b, n = 5) => Array.from({ length: n }, (_, i) => {
  const t = i / (n - 1);
  return W(b.s, b.u0 + (b.u1 - b.u0) * t, bridgeY(b, t));
});

/**
 * Patrol routes: polylines of walkable world points [x, y, z] (feet height), each with its level. Consecutive points
 * are joined by open floor (ledge rock, a deck, a bridge or a tunnel floor); `links` name the routes that meet at a
 * route's ends (a ladder or a shared point). A goblin following a route never walks off an edge.
 */
export const GOBLIN_PATROL = [
  { id: 'galeria-nyugat', level: 'galeria', pts: [-8.3, -6, -4.4, -2, 0, 2, 4.9, 6.6, 8.2].map((s) => gal(-1, s)) },
  { id: 'galeria-kelet', level: 'galeria', pts: [-8.4, -6.1, -4.4, -2, 0, 2.5, 3.1, 4.9, 8.8].map((s) => gal(1, s)) },
  { id: 'parkany-nyugat', level: 'parkany', pts: [-9, -7.2, -5, -2.4, 0, 2.4, 5, 7.4, 9].map((s) => ledge(-1, s)) },
  { id: 'parkany-kelet', level: 'parkany', pts: [-9, -7.2, -5, -2.4, 0, 2.4, 5, 7.4, 9].map((s) => ledge(1, s)) },
  { id: 'tronemelvény', level: 'parkany', pts: [W(-2, -3.2, THRONE_DECK_Y), W(-1.5, 0, THRONE_DECK_Y), W(-2, 3.2, THRONE_DECK_Y), W(1.8, 2.4, THRONE_DECK_Y), W(1.8, -2.4, THRONE_DECK_Y), W(-2, -3.2, THRONE_DECK_Y)] },
  ...BRIDGES.map((b) => ({ id: b.id, level: b.y > LEDGE_Y + 3 ? 'galeria' : 'parkany', pts: bridgePts(b) })),
  { id: 'szakadek-alja', level: 'szakadek', pts: [W(-9, 0, CHASM_FLOOR), W(-6, 0.3, CHASM_FLOOR), W(-3.5, -0.4, CHASM_FLOOR), W(0, -1.95, CHASM_FLOOR), W(2.6, -1.6, CHASM_FLOOR), W(6, 0, CHASM_FLOOR), W(9, 0.3, CHASM_FLOOR), W(10.6, 0.4, CHASM_FLOOR)] },
  ...TUNNELS.filter((t) => !t.chute).map((t) => ({ id: `alagut-${t.id}`, level: 'alagut', pts: t.pts.map((p) => [p[0], p[1], p[2]]) })),
];

/** Standing points for spawning in view of the players (every patrol route's points, flattened, with the level). */
export const GOBLIN_POINTS = GOBLIN_PATROL.flatMap((r) => r.pts.map((p) => ({ x: p[0], y: p[1], z: p[2], level: r.level, route: r.id })));

/**
 * Where Bilbo's brass buttons lie (the famous find of layer 4; book ch. 5, film: they popped off as he squeezed
 * through the back gate): on the threshold in the gap of the door left ajar, half sunk into the floor.
 */
export const BUTTONS_POS = (() => {
  const g = BACK_GATE;
  const c = Math.cos(g.yaw);
  const sn = Math.sin(g.yaw);
  const lx = 0.56;
  const lz = 0.05;
  const x = g.x + lx * c + lz * sn;
  const z = g.z - lx * sn + lz * c;
  return { x, y: goblinFloorAt(x, z, g.y + 1, 2) - 0.02, z };
})();

/**
 * Goblin-town as a site provider for the enemies module (enemies/sites.js GoblinSites.use): spawn and patrol points
 * (walkable floors, decks and bridges), the side-tunnel mouths (n: unit direction out of the tunnel into the open),
 * and the inside test. game.js hands it over: `this.enemies.sites.use(GOBLIN_SITE_PROVIDER)`.
 */
export const GOBLIN_SITE_PROVIDER = {
  spawnPoints: () => GOBLIN_POINTS,
  patrolPoints: () => GOBLIN_POINTS,
  tunnelMouths: () => GOBLIN_MOUTHS.map((m) => ({ x: m.x, y: m.y, z: m.z, nx: m.dir[0], nz: m.dir[1], id: m.id })),
  inside: (x, y, z) => inGoblinTown(x, y, z),
};
