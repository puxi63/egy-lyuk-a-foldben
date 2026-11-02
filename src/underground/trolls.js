/* ==== underground/trolls.js — Bert, Tom and Vilmos (Bill), the three trolls turned to stone by the dawn (The Hobbit,
   ch. 2), frozen mid-quarrel: sculpted as smooth signed distance fields (pot belly, hunched shoulders, long knotted
   arms with thick fingers, short legs with splayed toes; a small head with a heavy brow, a huge warty nose, deep-set
   squinting eyes, big flapping ears, an underbite with tusks and heavy jowls) and meshed with surface nets in the
   generator worker (no three.js here). Weathering: pits, chips and warts in the field (they show in the SDF-gradient
   normals below the mesh resolution), crevice darkening from the SDF (ambient occlusion), rain streaks, ochre lichen
   and moss on the upward faces. The colliders and fern spots come from trollPose() on the main thread.
   Local frame: feet at y = 0, facing +z. ==== */
import { noise3 } from '../noise.js';
import { cone, ellipsoid, meshSdf, smin, ssub } from './sdf-mesh.js';

/**
 * The three poses. Offsets of the elbow (from the shoulder) and the wrist (from the elbow) in the troll's frame;
 * `lean` bends the upper body forward (radians), `twist` turns it, `crouch` lowers the hips (m), `head` turns the head.
 * Face: `nose` (size), `hook` (droop of the tip), `ears` (size), `jaw` (underbite), `jowl`, `mouth` (opening).
 */
export const TROLLS = [
  {
    // Bert: leaning in, shaking a fist over his head at the other two, the other hand grabbing forward. A long hooked
    // nose and big ears.
    name: 'Bert', scale: 1.12, lean: 0.32, twist: 0.15, crouch: 0.05, head: -0.2, mouth: 0.06,
    nose: 1.15, hook: 0.07, ears: 1.15, jaw: 0.05, jowl: 0.9,
    armL: { el: [0.38, 0.45, 0.15], wr: [-0.12, 0.55, 0.22], fist: true },
    armR: { el: [-0.25, -0.3, 0.45], wr: [0.05, -0.12, 0.55], fist: false },
  },
  {
    // Tom: crouched and hunched, both arms flung wide (arguing back), mouth open in a shout; a broad squashed nose.
    name: 'Tom', scale: 1.0, lean: 0.48, twist: -0.1, crouch: 0.32, head: 0.15, mouth: 0.085,
    nose: 1.05, hook: 0.0, ears: 1.0, jaw: 0.08, jowl: 1.0, broad: true,
    armL: { el: [0.5, -0.12, 0.3], wr: [0.38, 0.22, 0.4], fist: false },
    armR: { el: [-0.5, -0.12, 0.3], wr: [-0.38, 0.22, 0.4], fist: false },
  },
  {
    // Vilmos (William, the cook): upright, one hand on his belly, the other raised with a finger up; fat jowls, a
    // bulbous nose and smaller ears.
    name: 'Vilmos', scale: 1.2, lean: 0.12, twist: 0.0, crouch: 0.0, head: 0.25, mouth: 0.04,
    nose: 1.0, hook: 0.03, ears: 0.85, jaw: 0.03, jowl: 1.3,
    armL: { el: [0.22, -0.48, 0.32], wr: [-0.45, -0.05, 0.3], fist: true },
    armR: { el: [-0.42, 0.18, 0.2], wr: [-0.05, 0.55, 0.12], fist: false, finger: true },
  },
];

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** Builds the posed primitive lists of a troll (unscaled frame): P (union), subs (carved out), P2 (added after). */
function pose(def) {
  const cl = Math.cos(def.lean);
  const sl = Math.sin(def.lean);
  const ct = Math.cos(def.twist);
  const st = Math.sin(def.twist);
  const pivotY = 1.2 - def.crouch;
  // Upper-body template point → posed (twist about y, then lean forward about the hips).
  const up = (p) => {
    const x = p[0];
    const y = p[1] - 1.2;
    const z = p[2];
    const x1 = x * ct + z * st;
    const z1 = -x * st + z * ct;
    return [x1, y * cl - z1 * sl + pivotY, y * sl + z1 * cl];
  };
  const ch = Math.cos(def.head);
  const sh = Math.sin(def.head);
  const neckTop = [0, 2.68, 0.38];
  // Head template point → enlarged (a big face on a small cranium reads better at a distance), turned about the
  // neck, then posed with the upper body.
  const HS = 1.32;
  const hd = (p) => {
    const x = (p[0] - neckTop[0]) * HS;
    const y = (p[1] - neckTop[1]) * HS + neckTop[1] + 0.06;
    const z = (p[2] - neckTop[2]) * HS + 0.05;
    return up([x * ch + z * sh + neckTop[0], y, -x * sh + z * ch + neckTop[2]]);
  };
  const hr = (r) => r.map((v) => v * HS);
  const P = [];
  const subs = [];
  const P2 = [];
  const E = (c, r, k = 0.14, list = P) => list.push({ t: 'e', c, r, k });
  const Cn = (a, b, ra, rb, k = 0.14, list = P) => list.push({ t: 'c', a, b, ra, rb, k });
  // Head primitives: radii scaled with the head.
  const EH = (c, r, k = 0.1, list = P) => E(hd(c), hr(r), k * HS, list);
  const CH = (a, b, ra, rb, k = 0.1, list = P) => Cn(hd(a), hd(b), ra * HS, rb * HS, k * HS, list);
  const crouch = def.crouch;
  // Body: pot belly, barrel chest, a hump of shoulders and back.
  E(up([0, 1.45, 0.18]), [0.82, 0.74, 0.76], 0.2);
  E(up([0, 2.1, 0.04]), [0.86, 0.6, 0.6], 0.2);
  E(up([0, 2.42, -0.22]), [0.64, 0.44, 0.48], 0.2);
  for (const sx of [-1, 1]) {
    // Trapezius and shoulder knobs, a fold of fat over the hips, sagging pectorals.
    E(up([sx * 0.42, 2.55, -0.08]), [0.36, 0.24, 0.34], 0.16);
    E(up([sx * 0.55, 1.18, 0.18]), [0.3, 0.2, 0.4], 0.14);
    E(up([sx * 0.33, 2.02, 0.48]), [0.3, 0.22, 0.2], 0.12);
  }
  // The rags they wore (stone now): a heavy loincloth with a rope belt.
  E([0, 1.08 - crouch, 0.1], [0.76, 0.3, 0.66], 0.12);
  Cn([-0.7, 1.26 - crouch, 0.2], [0.7, 1.26 - crouch, 0.2], 0.07, 0.07, 0.1);
  E([0.25, 0.86 - crouch, 0.62], [0.2, 0.16, 0.06], 0.06);
  Cn(up([0, 2.45, 0.12]), up(neckTop), 0.32, 0.26, 0.14);
  // Head: a small sloping cranium, the brow ridge, cheeks and jowls, the jaw jutting in an underbite.
  const nz = def.nose;
  const jw = def.jaw;
  EH([0, 2.88, 0.44], [0.3, 0.3, 0.33], 0.1);
  EH([0, 2.98, 0.34], [0.24, 0.16, 0.26], 0.12);
  CH([-0.21, 2.95, 0.74], [0.21, 2.95, 0.74], 0.075, 0.075, 0.06);
  for (const sx of [-1, 1]) {
    EH([sx * 0.13, 2.96, 0.76], [0.13, 0.075, 0.09], 0.05);
    EH([sx * 0.2, 2.68, 0.7], [0.14 * def.jowl, 0.13, 0.12], 0.07);
    EH([sx * 0.22, 2.56, 0.62], [0.13 * def.jowl, 0.12 * def.jowl, 0.12], 0.08);
  }
  EH([0, 2.55, 0.74 + jw], [0.25, 0.11, 0.16], 0.07);
  EH([0, 2.49, 0.7 + jw], [0.18 * def.jowl, 0.08, 0.13], 0.07);
  EH([0, 2.62, 0.86], [0.2, 0.05, 0.07], 0.05);
  // The nose: a long bridge to a huge drooping bulb with flared wings.
  const bw = def.broad ? 1.3 : 1;
  CH([0, 2.92, 0.8], [0, 2.76 - def.hook, 0.97 + 0.04 * nz], 0.06 * nz * bw, 0.085 * nz * bw, 0.05);
  EH([0, 2.72 - def.hook, 1.0 + 0.04 * nz], [0.12 * nz * bw, 0.11 * nz, 0.11 * nz], 0.05);
  for (const sx of [-1, 1]) EH([sx * 0.085 * nz * bw, 2.69 - def.hook * 0.6, 0.93 + 0.03 * nz], [0.065 * nz, 0.06 * nz, 0.06 * nz], 0.04);
  // Ears: big flaps standing out sideways and back, hollow inside.
  const er = def.ears;
  for (const sx of [-1, 1]) {
    CH([sx * 0.27, 2.86, 0.5], [sx * (0.27 + 0.2 * er), 2.92 + 0.03 * er, 0.42], 0.08 * er, 0.05 * er, 0.05);
    EH([sx * (0.3 + 0.12 * er), 2.86, 0.47], [0.05, 0.15 * er, 0.12 * er], 0.05);
    EH([sx * (0.31 + 0.11 * er), 2.73, 0.5], [0.045, 0.06 * er, 0.05 * er], 0.04);
  }
  // Carved out: eye sockets under the brow, the nostrils, the mouth, the ear hollows, the navel.
  for (const sx of [-1, 1]) {
    subs.push({ t: 'e', hs: true, c: hd([sx * 0.12, 2.87, 0.83]), r: [0.06, 0.045, 0.06], k: 0.04 });
    subs.push({ t: 'e', hs: true, c: hd([sx * 0.055 * nz * bw, 2.65 - def.hook * 0.6, 1.0 + 0.03 * nz]), r: [0.03, 0.025, 0.03], k: 0.02 });
    subs.push({ t: 'e', hs: true, c: hd([sx * (0.33 + 0.12 * er), 2.86, 0.5]), r: [0.035, 0.1 * er, 0.07 * er], k: 0.03 });
  }
  subs.push({ t: 'c', hs: true, a: hd([-0.17, 2.585, 0.9 + jw * 0.6]), b: hd([0.17, 2.585, 0.9 + jw * 0.6]), ra: def.mouth, rb: def.mouth, k: 0.035 });
  subs.push({ t: 'e', c: up([0, 1.5, 0.95]), r: [0.05, 0.05, 0.05], k: 0.04 });
  // Added after carving: squinting eyeballs in the sockets, tusks and stubby teeth in the lower jaw, warts.
  for (const sx of [-1, 1]) {
    EH([sx * 0.12, 2.862, 0.8], [0.045, 0.026, 0.035], 0.02, P2);
    CH([sx * 0.12, 2.53, 0.86 + jw], [sx * 0.13, 2.65, 0.9 + jw], 0.026, 0.012, 0.015, P2);
    CH([sx * 0.045, 2.55, 0.9 + jw], [sx * 0.045, 2.6, 0.91 + jw], 0.02, 0.014, 0.012, P2);
  }
  const warts = [[0.05, 2.78, 1.07], [-0.07, 2.72, 1.08], [0.11, 2.7, 0.98], [-0.2, 2.72, 0.78], [0.24, 2.62, 0.72], [0.1, 3.02, 0.72],
    [-0.15, 2.48, 0.78], [0.0, 2.84, 0.94], [-0.26, 2.84, 0.62], [0.18, 2.92, 0.6]];
  warts.forEach(([x, y, z], i) => EH([x, y - (z > 0.95 ? def.hook : 0), z], [0.028 + (i % 3) * 0.008, 0.026, 0.028], 0.02, P2));
  // Arms: shoulder, a bulging upper arm, elbow knob, a knotted forearm, the hand.
  const colliders = [];
  for (const [sx, arm] of [[1, def.armL], [-1, def.armR]]) {
    const S = up([sx * 0.8, 2.28, 0]);
    const Eb = add(S, arm.el);
    const W = add(Eb, arm.wr);
    E(S, [0.34, 0.32, 0.34], 0.12);
    Cn(S, Eb, 0.27, 0.19, 0.12);
    E(add(S, mul(arm.el, 0.45)), [0.25, 0.25, 0.25], 0.14);
    E(Eb, [0.2, 0.2, 0.2], 0.08);
    Cn(Eb, W, 0.22, 0.14, 0.1);
    E(add(Eb, mul(arm.wr, 0.3)), [0.21, 0.21, 0.21], 0.12);
    const dx = arm.wr[0];
    const dy = arm.wr[1];
    const dz = arm.wr[2];
    const dl = Math.hypot(dx, dy, dz);
    const d = [dx / dl, dy / dl, dz / dl];
    const H = add(W, mul(d, 0.15));
    const side = [d[2], 0, -d[0]];
    const sl2 = Math.hypot(side[0], side[2]) || 1;
    side[0] /= sl2;
    side[2] /= sl2;
    if (arm.fist) {
      E(H, [0.19, 0.18, 0.19], 0.08);
      // Knuckles across the front of the fist.
      for (let f = -1.5; f <= 1.5; f++) E(add(add(H, mul(d, 0.13)), mul(side, f * 0.075)), [0.05, 0.05, 0.05], 0.035);
      E(add(H, mul(side, -0.16 * sx)), [0.07, 0.06, 0.07], 0.05);
    } else {
      E(H, [0.17, 0.14, 0.17], 0.08);
      // Four thick, knobbly fingers and a thumb, spread a little and curled.
      for (let f = -1.5; f <= 1.5; f++) {
        const base = add(add(H, mul(d, 0.06)), [side[0] * f * 0.065, f * 0.012, side[2] * f * 0.065]);
        const pointing = arm.finger && Math.abs(f - 0.5) < 0.1;
        const len = arm.finger && !pointing ? 0.09 : 0.2 + (Math.abs(f) < 1 ? 0.03 : 0);
        const mid = add(base, add(mul(d, len * 0.55), mul(side, f * 0.02)));
        const tip = add(mid, add(mul(d, len * 0.45), [0, pointing ? 0.05 : -0.05, 0]));
        Cn(base, mid, 0.05, 0.043, 0.035);
        Cn(mid, tip, 0.043, 0.034, 0.03);
        E(mid, [0.05, 0.05, 0.05], 0.03);
      }
      const tb = add(H, mul(side, -0.13 * sx));
      Cn(tb, add(tb, add(mul(d, 0.11), add(mul(side, -0.06 * sx), [0, 0.05, 0]))), 0.05, 0.035, 0.04);
    }
    colliders.push({ a: S, b: H, r: 0.26 });
  }
  // Legs: thick thighs, knobbly knees, big flat feet with splayed toes and heavy nails.
  for (const sx of [-1, 1]) {
    const H = [sx * 0.38, 1.15 - crouch, 0.05];
    const K = [sx * 0.46, 0.62 - crouch * 0.35, 0.2 + crouch * 0.7];
    const A = [sx * 0.42, 0.14, 0.02];
    Cn(H, K, 0.34, 0.25, 0.14);
    E(K, [0.24, 0.22, 0.24], 0.08);
    Cn(K, A, 0.25, 0.17, 0.1);
    E(add(K, [0, -0.18, -0.06]), [0.22, 0.2, 0.22], 0.12);
    E([sx * 0.44, 0.11, 0.24], [0.22, 0.12, 0.38], 0.1);
    for (let t = -1; t <= 1; t++) {
      E([sx * 0.44 + t * 0.11, 0.075, 0.57 - Math.abs(t) * 0.04], [0.065, 0.065, 0.08], 0.05);
      E([sx * 0.44 + t * 0.11, 0.1, 0.63 - Math.abs(t) * 0.04], [0.04, 0.025, 0.03], 0.02, P2);
    }
    colliders.push({ a: [sx * 0.42, 0.25, 0.1], b: H, r: 0.3 });
  }
  for (const q of subs) {
    if (!q.hs) continue;
    if (q.r) q.r = hr(q.r);
    else {
      q.ra *= HS;
      q.rb *= HS;
    }
    q.k *= HS;
  }
  colliders.push({ a: [0, 0.9 - crouch, 0.1], b: up([0, 2.2, 0]), r: 0.72 });
  colliders.push({ a: up([0, 2.6, 0.3]), b: hd([0, 2.8, 0.7]), r: 0.32 });
  // Where ferns grow on the stone: the crown, both shoulders and the hump.
  const tops = [hd([0, 3.12, 0.38]), up([0.72, 2.66, -0.05]), up([-0.72, 2.66, -0.05]), up([0.1, 2.82, -0.32])];
  return { P, subs, P2, colliders, tops };
}

function evalPrim(p, x, y, z) {
  return p.t === 'e' ? ellipsoid(x, y, z, p.c, p.r) : cone(x, y, z, p.a, p.b, p.ra, p.rb);
}

/** Colliders ({a, b, r} capsules) and fern spots of a troll, scaled, in its local frame (cheap: no meshing). */
export function trollPose(def) {
  const { colliders, tops } = pose(def);
  const s = def.scale;
  const sc = (p) => [p[0] * s, p[1] * s, p[2] * s];
  return { colliders: colliders.map((c) => ({ a: sc(c.a), b: sc(c.b), r: c.r * s })), tops: tops.map(sc), height: 3.0 * s };
}

/** Bounding sphere of a primitive (for skipping far primitives quickly). */
function bound(p) {
  if (p.t === 'e') return { c: p.c, r: Math.max(p.r[0], p.r[1], p.r[2]) + p.k };
  const c = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
  return { c, r: Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) / 2 + Math.max(p.ra, p.rb) + p.k };
}

/**
 * Meshes one troll: raw triangles { position, normal, uv, color } in its local frame (scaled). The cell size is
 * chosen so each troll stays under about 20 k triangles.
 */
export function meshTroll(def, cell = 0.06 * def.scale) {
  const { P, subs, P2 } = pose(def);
  const s = def.scale;
  const all = [P, subs, P2].map((list) => list.map((p) => ({ p, b: bound(p) })));
  /** Smooth union of a list, skipping primitives far from the point (their smin contribution is zero there). */
  const union = (list, x, y, z, d0) => {
    let d = d0;
    for (const { p, b } of list) {
      const far = Math.hypot(x - b.c[0], y - b.c[1], z - b.c[2]) - b.r;
      if (far > d + p.k) continue;
      d = d === Infinity ? evalPrim(p, x, y, z) : smin(d, evalPrim(p, x, y, z), p.k);
    }
    return d;
  };
  const shape = (x, y, z) => {
    let d = union(all[0], x, y, z, Infinity);
    if (d === Infinity) d = 1;
    for (const { p, b } of all[2]) {
      const far = Math.hypot(x - b.c[0], y - b.c[1], z - b.c[2]) - b.r;
      if (far > 0.05) continue;
      d = smin(d, evalPrim(p, x, y, z), p.k);
    }
    for (const { p, b } of all[1]) {
      if (Math.hypot(x - b.c[0], y - b.c[1], z - b.c[2]) - b.r > 0.05) continue;
      d = ssub(d, evalPrim(p, x, y, z), p.k);
    }
    return d;
  };
  const fn = (wx, wy, wz) => {
    const x = wx / s;
    const y = wy / s;
    const z = wz / s;
    let d = shape(x, y, z);
    if (d > 0.3) return d * s;
    // Weathered stone: broad lumps, chips and pits, and warty skin (isolated bumps from thresholded noise).
    d += (noise3(x * 2.6, y * 2.6, z * 2.6) - 0.5) * 0.07 + (noise3(x * 6.5, y * 6.5, z * 6.5) - 0.5) * 0.025;
    d += (noise3(x * 17, y * 17, z * 17) - 0.5) * 0.012;
    d -= Math.max(0, noise3(x * 12 + 7, y * 12, z * 12 - 3) - 0.72) * 0.13;
    return d * s;
  };
  const color = (x, y, z, nx, ny, nz, out) => {
    const lx = x / s;
    const ly = y / s;
    const lz = z / s;
    // Crevice darkening: how far the field rises along the normal compared with an open surface.
    let occ = 0;
    for (const [dist, w] of [[0.14, 0.45], [0.26, 0.35], [0.45, 0.2]]) {
      const dd = fn(x + nx * dist * s, y + ny * dist * s, z + nz * dist * s) / s;
      occ += w * Math.max(0, dist - dd) / dist;
    }
    const ao = Math.max(0.3, 1 - occ * 1.15);
    // Grey-brown troll stone, darker low down, with rain streaks running down the sides.
    const n = noise3(lx * 1.3 + 5, ly * 1.3, lz * 1.3);
    const streak = noise3(lx * 7, ly * 0.6, lz * 7);
    let base = (0.2 + 0.08 * n + Math.min(0.04, ly * 0.012)) * (0.88 + 0.24 * streak);
    base *= ao;
    out[0] = base * 1.02;
    out[1] = base * 0.97;
    out[2] = base * 0.9;
    // Ochre and pale grey lichen patches on the upper sides.
    const lichen = noise3(lx * 2.4, ly * 2.4 + 9, lz * 2.4);
    if (lichen > 0.64 && ny > -0.2) {
      const t = Math.min(1, (lichen - 0.64) * 6) * 0.85;
      const pale = noise3(lx * 5, ly * 5, lz * 5 + 4) > 0.5;
      const lc = pale ? [0.42, 0.42, 0.36] : [0.46, 0.38, 0.16];
      for (let i = 0; i < 3; i++) out[i] += (lc[i] * ao - out[i]) * t;
    }
    // Moss on the upward faces and in damp hollows (a little more on the lower body).
    const moss = noise3(lx * 1.8 - 3, ly * 1.8, lz * 1.8 + 6);
    const up = Math.max(0, ny - 0.25) / 0.75;
    const m = Math.min(1, Math.max(0, (moss - 0.45) * 3) * up * 1.4 + (ly < 0.6 ? (0.6 - ly) * 0.8 * Math.max(0, moss - 0.4) : 0));
    if (m > 0) {
      const mc = [0.12 * ao, 0.19 * ao, 0.06 * ao];
      for (let i = 0; i < 3; i++) out[i] += (mc[i] - out[i]) * m;
    }
  };
  return meshSdf(fn, [-2.2 * s, -0.05, -1.4 * s], [2.2 * s, 3.9 * s, 2.0 * s], cell, color);
}
