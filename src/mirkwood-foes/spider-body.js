/* ==== mirkwood-foes/spider-body.js — a giant spider of Mirkwood (book ch. 8 "Flies and Spiders"; the film's look in
   The Desolation of Smaug): a big black-grey hairy spider with a cluster of glossy eyes, heavy fanged chelicerae, a
   ridged carapace, a huge mottled abdomen with spinnerets, and eight long jointed, banded, spiny legs.
   Built in code (no humanoid rig): one skinned mesh per spider on its own 30-bone skeleton, drawn with the shared
   character material (characters.js characterMaterial: per-vertex sRGB paint + AO in aCol, roughness / metalness /
   back AO in aPbr), so a spider is one draw call and adds no shader program. Hair is geometry: thousands of thin
   tapered bristles (dark roots, grey tips that catch the lamp) on the body and the legs.
   Animation: its own 8-leg gait. Every foot is planted on the floor (found in the density field) and steps when the
   body has moved on, in two alternating sets of four (L1 R2 L3 R4 / R1 L2 R3 L4); each leg is solved by a 2-bone IK
   (femur up to a high knee, tibia down) plus the metatarsus down to the foot; the body rides on the feet (height,
   pitch and roll follow them). Extra poses: legs curled for hanging on a thread or the tumble after a hit, the fangs
   working, the front legs raised to strike, the abdomen swaying. No per-frame allocation. ==== */
import * as THREE from 'three';
import { characterMaterial } from '../characters.js';
import { sdf } from '../world.js';

/** Bone indices of the spider skeleton (all bones are children of the root: the IK places each one directly). */
export const SB = { root: 0, body: 1, abdomen: 2, head: 3, palpL: 4, palpR: 5, leg0: 6 };
const LEG_BONES = 3; // femur, tibia, metatarsus (+ tarsus)

/** Proportions in metres at scale 1 (a body about 1.7 m long, a leg span of about 3.4 m). */
const P = {
  bodyY: 0.62,
  ceph: [0.34, 0.2, 0.42], // cephalothorax radii (x, y, z); its centre is the body bone
  abdo: [0.5, 0.44, 0.66], // abdomen radii
  abdoAt: [0, 0.16, 0.86], // abdomen centre relative to the body bone (behind and above)
  pedicel: [0, 0.02, 0.4],
  /* legs front to back: the hip's angle from straight out (+ = forward), the foot's reach from the hip, segment lengths */
  legs: [
    { ang: 0.95, reach: 1.42, femur: 0.86, tibia: 0.84, meta: 0.74 },
    { ang: 0.32, reach: 1.25, femur: 0.78, tibia: 0.76, meta: 0.66 },
    { ang: -0.28, reach: 1.2, femur: 0.76, tibia: 0.74, meta: 0.64 },
    { ang: -0.92, reach: 1.38, femur: 0.84, tibia: 0.82, meta: 0.72 },
  ],
};

/** The two looks: a black-grey one and a dark brown-grey one (anonymous spiders; the film shows both tones). */
export const SPIDER_LOOKS = [
  { id: 'grey', base: [0.04, 0.038, 0.036], hair: [0.26, 0.25, 0.24], band: [0.16, 0.15, 0.14], mark: [0.36, 0.33, 0.29], seed: 11 },
  { id: 'brown', base: [0.05, 0.036, 0.026], hair: [0.3, 0.24, 0.18], band: [0.2, 0.14, 0.09], mark: [0.4, 0.31, 0.21], seed: 23 },
];

/* ---------------- geometry building ---------------- */

/** A small deterministic random generator. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Cheap smooth 3-D value noise in [-1, 1] (for the mottling and the carapace's bumps). */
function vnoise(x, y, z) {
  const h = (i, j, k) => {
    let n = (i * 374761393 + j * 668265263 + k * 1440662683) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) & 0xffff) / 32767.5 - 1;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

/** Collects triangles with their paint, PBR and skin into flat arrays (then one BufferGeometry). */
class Builder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = []; // sRGB 0..1 + AO
    this.pbr = []; // rough, metal, back AO
    this.bone = [];
    this.index = [];
  }

  /** Adds a vertex; returns its index. */
  v(p, n, c, ao, rough, metal, bone) {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2], ao);
    this.pbr.push(rough, metal, Math.min(1, ao * 0.7));
    this.bone.push(bone);
    return i;
  }

  tri(a, b, c) {
    this.index.push(a, b, c);
  }

  /** The finished geometry with the character material's attributes (aCol, aPbr) and rigid skin weights. */
  geometry() {
    const n = this.pos.length / 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    const col = new Uint8Array(n * 4);
    const pbr = new Uint8Array(n * 4);
    const sIdx = new Uint8Array(n * 4);
    const sWt = new Uint8Array(n * 4);
    // The character shader decodes aCol.rgb from sRGB; the builder works in linear colour, so encode here.
    const enc = (c) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
    for (let i = 0; i < n; i++) {
      col[i * 4] = enc(this.col[i * 4]);
      col[i * 4 + 1] = enc(this.col[i * 4 + 1]);
      col[i * 4 + 2] = enc(this.col[i * 4 + 2]);
      col[i * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, this.col[i * 4 + 3])));
      pbr[i * 4] = Math.round(255 * this.pbr[i * 3]);
      pbr[i * 4 + 1] = Math.round(255 * this.pbr[i * 3 + 1]);
      pbr[i * 4 + 2] = Math.round(255 * this.pbr[i * 3 + 2]);
      pbr[i * 4 + 3] = 255;
      sIdx[i * 4] = this.bone[i];
      sWt[i * 4] = 255;
    }
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 4, true));
    g.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 4, true));
    g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(sIdx, 4));
    g.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(sWt, 4, true));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0.2), 2.6);
    return g;
  }
}

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * A deformed ellipsoid surface (lat-long grid). `shape(dir, p)` may move the point (returns a new radius factor);
 * `paint(p, n, dir)` returns { c, ao, rough, metal }. Returns the list of [point, normal, dir] samples for bristles.
 */
function ellipsoid(B, centre, radii, seg, rings, bone, shape, paint) {
  const grid = [];
  const pts = [];
  for (let j = 0; j <= rings; j++) {
    const th = (j / rings) * Math.PI;
    const row = [];
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * Math.PI * 2;
      const dir = V3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
      const f = shape ? shape(dir) : 1;
      const p = V3(centre.x + dir.x * radii[0] * f, centre.y + dir.y * radii[1] * f, centre.z + dir.z * radii[2] * f);
      row.push({ p, dir });
    }
    grid.push(row);
  }
  // Normals from the grid (central differences), then the vertices.
  const idx = [];
  for (let j = 0; j <= rings; j++) {
    const r = [];
    for (let i = 0; i <= seg; i++) {
      const a = grid[j][(i + 1) % (seg + 1)].p;
      const b = grid[j][(i - 1 + seg + 1) % (seg + 1)].p;
      const c = grid[Math.min(rings, j + 1)][i].p;
      const d = grid[Math.max(0, j - 1)][i].p;
      const n = V3().subVectors(a, b).cross(V3().subVectors(c, d)).normalize();
      if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) n.copy(grid[j][i].dir);
      // Outward: the grid's winding may flip it at the poles.
      if (n.dot(grid[j][i].dir) < 0) n.negate();
      const s = grid[j][i];
      const pt = paint(s.p, n, s.dir);
      r.push(B.v([s.p.x, s.p.y, s.p.z], [n.x, n.y, n.z], pt.c, pt.ao, pt.rough, pt.metal ?? 0, bone));
      pts.push([s.p, n, s.dir]);
    }
    idx.push(r);
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = idx[j][i];
      const b = idx[j][i + 1];
      const c = idx[j + 1][i];
      const d = idx[j + 1][i + 1];
      B.tri(a, c, b);
      B.tri(b, c, d);
    }
  }
  return pts;
}

/**
 * A tapered tube along a polyline (a leg segment, a fang), closed with rounded caps. radius(t) gives the radius;
 * paint(t, n) the colour. The tube's frame uses `side` as the reference for the first ring (no twisting).
 */
function tube(B, pts, radius, seg, bone, paint, side = V3(0, 1, 0)) {
  const rings = [];
  const n = pts.length;
  let ref = side.clone();
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(n - 1, k + 1)];
    const dir = V3().subVectors(b, a).normalize();
    const u = V3().crossVectors(dir, ref).normalize();
    if (u.lengthSq() < 0.5) u.set(1, 0, 0);
    const w = V3().crossVectors(u, dir).normalize();
    ref = w.clone();
    const r = radius(t);
    const ring = [];
    for (let i = 0; i <= seg; i++) {
      const ang = (i / seg) * Math.PI * 2;
      const nn = V3().addScaledVector(u, Math.cos(ang)).addScaledVector(w, Math.sin(ang)).normalize();
      const p = V3().copy(pts[k]).addScaledVector(nn, r);
      const pt = paint(t, nn, p);
      ring.push(B.v([p.x, p.y, p.z], [nn.x, nn.y, nn.z], pt.c, pt.ao, pt.rough, pt.metal ?? 0, bone));
    }
    rings.push({ ring, dir, u, w });
  }
  for (let k = 0; k < n - 1; k++) {
    for (let i = 0; i < seg; i++) {
      const a = rings[k].ring[i];
      const b = rings[k].ring[i + 1];
      const c = rings[k + 1].ring[i];
      const d = rings[k + 1].ring[i + 1];
      B.tri(a, c, b);
      B.tri(b, c, d);
    }
  }
  // End caps: a fan to a point slightly beyond each end.
  for (const [k, sgn] of [[0, -1], [n - 1, 1]]) {
    const end = rings[k];
    const tip = V3().copy(pts[k]).addScaledVector(end.dir, sgn * radius(k ? 1 : 0) * 0.6);
    const pt = paint(k ? 1 : 0, V3().copy(end.dir).multiplyScalar(sgn), tip);
    const c = B.v([tip.x, tip.y, tip.z], [end.dir.x * sgn, end.dir.y * sgn, end.dir.z * sgn], pt.c, pt.ao, pt.rough, pt.metal ?? 0, bone);
    for (let i = 0; i < seg; i++) {
      if (sgn < 0) B.tri(c, end.ring[i], end.ring[i + 1]);
      else B.tri(c, end.ring[i + 1], end.ring[i]);
    }
  }
  return rings;
}

/**
 * One bristle: a thin tapered spike (one triangle, double-sided through the material) from `p` along `d`, dark at the
 * root and greyer at the tip. `width` is the root width.
 */
function bristle(B, p, d, len, width, root, tip, bone, side, out) {
  if (globalThis.__spiderNoHair) return;
  const s = V3().crossVectors(d, side).normalize();
  if (s.lengthSq() < 0.5) s.set(1, 0, 0);
  // The front face (and its normal) faces away from the surface it grows on, so it is lit from outside.
  if (out && V3().crossVectors(s, d).dot(out) < 0) s.negate();
  const a = V3().copy(p).addScaledVector(s, width * 0.5);
  const b = V3().copy(p).addScaledVector(s, -width * 0.5);
  const t = V3().copy(p).addScaledVector(d, len);
  const n = V3().crossVectors(s, d).normalize();
  // The normal leans along the hair (so the lamp light rakes along it like fur).
  n.addScaledVector(d, 0.4).normalize();
  const i0 = B.v([a.x, a.y, a.z], [n.x, n.y, n.z], root, 0.55, 0.85, 0, bone);
  const i1 = B.v([b.x, b.y, b.z], [n.x, n.y, n.z], root, 0.55, 0.85, 0, bone);
  const i2 = B.v([t.x, t.y, t.z], [n.x, n.y, n.z], tip, 0.95, 0.6, 0, bone);
  B.tri(i1, i0, i2);
}

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** The rest pose of the legs (body space, scale 1): hips, knees, ankles, feet per leg (8 legs: 4 per side). */
export function restLegs() {
  const out = [];
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? -1 : 1; // 0: the spider's left (−x, it faces −z), 1: its right
    for (let k = 0; k < 4; k++) {
      const L = P.legs[k];
      // Direction out from the body: straight out ±x turned forward (−z) by ang.
      const out2 = V3(sx * Math.cos(L.ang), 0, -Math.sin(L.ang));
      const hip = V3(out2.x * P.ceph[0] * 0.82, P.bodyY - 0.04, out2.z * P.ceph[2] * 0.72 - 0.02);
      const foot = V3(hip.x + out2.x * L.reach, 0, hip.z + out2.z * L.reach);
      out.push({ side, k, sx, out: out2, hip, foot, femur: L.femur, tibia: L.tibia, meta: L.meta });
    }
  }
  return out;
}

/**
 * Solves one leg: hip H → foot F (body space). Writes knee, ankle into the given vectors. The metatarsus hangs from
 * the ankle steeply down to the foot; the femur and tibia form a 2-bone chain with the knee high above.
 */
const ikD = new THREE.Vector3();
const ikE2 = new THREE.Vector3();
const ikH = new THREE.Vector3();
export function solveLeg(H, F, leg, knee, ankle, curl = 0) {
  ikH.set(F.x - H.x, 0, F.z - H.z);
  if (ikH.lengthSq() < 1e-6) ikH.set(leg.out.x, 0, leg.out.z);
  ikH.normalize();
  // The ankle: above the foot and a bit inwards (the metatarsus leans out to the foot); curled legs fold it in.
  const mo = leg.meta * (0.34 + curl * 0.5);
  const mu = leg.meta * (0.94 - curl * 0.3);
  ankle.set(F.x - ikH.x * mo, F.y + mu, F.z - ikH.z * mo);
  ikD.subVectors(ankle, H);
  let dist = ikD.length();
  const L1 = leg.femur;
  const L2 = leg.tibia;
  const maxD = (L1 + L2) * 0.985;
  const minD = Math.abs(L1 - L2) + 0.08;
  if (dist > maxD) {
    ikD.multiplyScalar(maxD / dist);
    ankle.copy(H).add(ikD);
    dist = maxD;
  } else if (dist < minD) {
    ikD.multiplyScalar(minD / Math.max(dist, 1e-4));
    ankle.copy(H).add(ikD);
    dist = minD;
  }
  ikD.multiplyScalar(1 / dist);
  const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))));
  // The bend plane: the leg's vertical plane; the knee goes up (away from the floor).
  ikE2.set(0, 1, 0).addScaledVector(ikD, -ikD.y);
  if (ikE2.lengthSq() < 1e-5) ikE2.set(ikH.x, 0, ikH.z);
  ikE2.normalize();
  knee.copy(H).addScaledVector(ikD, L1 * Math.cos(a)).addScaledVector(ikE2, L1 * Math.sin(a));
}

/**
 * Builds the spider geometry for a look. Returns { geometry, bones: [{ pos }] (rest pivots), segs: per leg bone the
 * rest direction and plane normal }.
 */
function buildSpider(look) {
  const B = new Builder();
  const r = rng(look.seed);
  const base = look.base;
  const hairC = look.hair;
  const body = V3(0, P.bodyY, 0);
  const rest = restLegs();
  const knees = rest.map(() => V3());
  const ankles = rest.map(() => V3());
  rest.forEach((l, i) => solveLeg(l.hip, l.foot, l, knees[i], ankles[i]));

  // ---- the cephalothorax: a domed carapace with radial grooves, a central fovea and a raised eye mound in front.
  const cephC = body.clone();
  const cephPts = ellipsoid(B, cephC, P.ceph, 28, 18, SB.body,
    (d) => {
      const ang = Math.atan2(d.x, d.z);
      const groove = d.y > 0.2 ? 0.035 * Math.pow(Math.abs(Math.cos(ang * 4)), 6) * d.y : 0;
      const fovea = d.y > 0.85 ? 0.08 * (d.y - 0.85) / 0.15 : 0;
      const flat = d.y < -0.2 ? 0.12 * (-d.y - 0.2) : 0;
      // The head end rises (the eye mound) and narrows.
      const front = d.z < -0.4 ? 0.1 * (-d.z - 0.4) * Math.max(0, d.y + 0.3) : 0;
      return 1 - groove - fovea - flat + front + 0.02 * vnoise(d.x * 6, d.y * 6, d.z * 6);
    },
    (p, n) => {
      const m = 0.5 + 0.5 * vnoise(p.x * 9, p.y * 9, p.z * 9);
      const c = mulc(base, 0.8 + 0.6 * m);
      // A paler edge band round the carapace (the film spiders' grey rims).
      const rim = Math.exp(-((n.y - 0.15) ** 2) / 0.02);
      return { c: lerp3(c, look.mark, rim * 0.35), ao: 0.45 + 0.55 * Math.max(0, n.y * 0.5 + 0.5), rough: 0.42, metal: 0.05 };
    });

  // ---- the eyes: 8 glossy black domes on the eye mound (2 large front medians, laterals, posterior row).
  // [radius, x, y above the body centre, z]: front medians (largest), anterior laterals, posterior medians and laterals.
  const eyes = [[0.056, 0.06, 0.15, -0.4], [0.038, 0.13, 0.11, -0.36], [0.034, 0.06, 0.19, -0.3], [0.032, 0.16, 0.16, -0.25]];
  const eyeSet = [];
  for (const [er, ex, ey, ez] of eyes) for (const sx of [-1, 1]) eyeSet.push({ r: er, c: V3(sx * ex, P.bodyY + ey, ez) });
  for (const e of eyeSet) {
    ellipsoid(B, e.c, [e.r, e.r * 0.9, e.r], 10, 6, SB.head, null, (p, n) => ({
      c: [0.012, 0.008, 0.008], ao: 1, rough: 0.04, metal: 0.25,
    }));
    // A dark socket ring round each eye.
    ellipsoid(B, V3(e.c.x, e.c.y, e.c.z + 0.008), [e.r * 1.25, e.r * 1.1, e.r * 0.8], 10, 5, SB.head, null, () => ({ c: mulc(base, 0.5), ao: 0.4, rough: 0.6 }));
  }

  // ---- the chelicerae: two thick hairy bulbs hanging below the eyes, each with a curved black fang.
  const chel = [];
  for (const sx of [-1, 1]) {
    const top = V3(sx * 0.085, P.bodyY - 0.02, -0.4);
    const bot = V3(sx * 0.075, P.bodyY - 0.26, -0.5);
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(V3().lerpVectors(top, bot, t).add(V3(0, 0, -0.05 * Math.sin(t * Math.PI))));
    }
    const rings = tube(B, pts, (t) => 0.085 * (1 - 0.35 * t) * (0.85 + 0.25 * Math.sin(t * Math.PI)), 10, SB.head,
      (t, n) => ({ c: mulc(base, 0.9 + 0.3 * vnoise(n.x * 5, t * 6, n.z * 5)), ao: 0.5 + 0.4 * Math.max(0, -n.z), rough: 0.5 }));
    chel.push({ pts, rings, sx });
    // The fang: curving inwards and back from the bulb's tip.
    const f0 = bot.clone().add(V3(-sx * 0.01, -0.02, -0.02));
    const fang = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      fang.push(V3(f0.x - sx * 0.07 * t, f0.y - 0.13 * Math.sin(t * 1.4), f0.z + 0.08 * t * t));
    }
    tube(B, fang, (t) => 0.022 * (1 - t) + 0.002, 6, SB.head, (t) => ({ c: lerp3([0.02, 0.018, 0.016], [0.16, 0.12, 0.08], t * t), ao: 0.8, rough: 0.12, metal: 0.2 }));
  }

  // ---- the pedipalps: two short leg-like feelers either side of the chelicerae.
  const palps = [];
  for (const sx of [-1, 1]) {
    const a = V3(sx * 0.16, P.bodyY - 0.06, -0.34);
    const b = V3(sx * 0.26, P.bodyY + 0.02, -0.62);
    const c = V3(sx * 0.22, P.bodyY - 0.18, -0.78);
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(t < 0.5 ? V3().lerpVectors(a, b, t * 2) : V3().lerpVectors(b, c, (t - 0.5) * 2));
    }
    const bone = sx < 0 ? SB.palpL : SB.palpR;
    tube(B, pts, (t) => 0.034 * (1 - 0.3 * t) + 0.008 * Math.exp(-((t - 0.5) ** 2) / 0.004), 8, bone,
      (t) => ({ c: t > 0.46 && t < 0.56 ? look.band : mulc(base, 1.1), ao: 0.7, rough: 0.55 }));
    palps.push({ pts, bone, a });
  }

  // ---- the pedicel (waist) and the abdomen: big, egg-shaped, mottled, with pale chevrons on top and spinnerets.
  const ped = [V3(0, P.bodyY + 0.02, 0.34), V3(0, P.bodyY + 0.06, 0.46), V3(0, P.bodyY + 0.1, 0.58)];
  tube(B, ped, () => 0.09, 8, SB.abdomen, () => ({ c: mulc(base, 0.7), ao: 0.4, rough: 0.6 }));
  const abC = V3(P.abdoAt[0], P.bodyY + P.abdoAt[1], P.abdoAt[2]);
  const abPts = ellipsoid(B, abC, P.abdo, 32, 22, SB.abdomen,
    (d) => {
      // Fuller behind, narrower at the waist; a faint dorsal ridge.
      const back = d.z > 0 ? 1 + 0.08 * d.z : 1 - 0.12 * Math.max(0, -d.z - 0.5);
      return back + 0.025 * vnoise(d.x * 5, d.y * 5, d.z * 5) + (d.y > 0.6 ? 0.02 * Math.exp(-(d.x * d.x) / 0.01) : 0);
    },
    (p, n, d) => {
      const m = vnoise(p.x * 6, p.y * 6, p.z * 6);
      let c = mulc(base, 0.85 + 0.35 * (m * 0.5 + 0.5));
      // Chevrons along the top: pale V marks in a row from front to back, broken by mottling.
      if (d.y > 0.25) {
        const along = (p.z - abC.z) / P.abdo[2]; // −1 front … 1 back
        const across = Math.abs(p.x - abC.x) / P.abdo[0];
        const v = (along * 3.2 + across * 1.6) % 1;
        const chev = Math.max(0, 1 - Math.abs(v - 0.5) * 9) * Math.max(0, 1 - across * 1.4) * (along > -0.7 ? 1 : 0);
        c = lerp3(c, look.mark, Math.min(1, chev * (0.55 + 0.4 * m)));
      }
      // Grey mottled flanks.
      if (Math.abs(d.y) < 0.4) c = lerp3(c, mulc(look.mark, 0.7), Math.max(0, m - 0.35) * 0.5);
      return { c, ao: 0.42 + 0.58 * Math.max(0, n.y * 0.5 + 0.5), rough: 0.5, metal: 0.02 };
    });
  // Spinnerets at the rear tip.
  for (const sx of [-1, 1]) {
    const s0 = V3(sx * 0.05, abC.y - 0.12, abC.z + P.abdo[2] * 1.02);
    const s1 = V3(sx * 0.08, abC.y - 0.2, abC.z + P.abdo[2] * 1.1);
    tube(B, [s0, V3().lerpVectors(s0, s1, 0.5), s1], (t) => 0.035 * (1 - 0.5 * t), 6, SB.abdomen, () => ({ c: mulc(base, 1.4), ao: 0.6, rough: 0.5 }));
  }

  // ---- the legs: femur, tibia (with the patella knob), metatarsus + tarsus; spines and banding at the joints.
  const legSegs = [];
  rest.forEach((l, i) => {
    const b0 = SB.leg0 + i * LEG_BONES;
    const H = l.hip;
    const K = knees[i];
    const A = ankles[i];
    const F = l.foot;
    const segs = [
      { a: H, b: K, bone: b0, r0: 0.088, r1: 0.07 },
      { a: K, b: A, bone: b0 + 1, r0: 0.068, r1: 0.052 },
      { a: A, b: F, bone: b0 + 2, r0: 0.048, r1: 0.02 },
    ];
    for (const s of segs) {
      const pts = [];
      const n = 9;
      // A gentle outward bow of every segment (spider legs are not straight sticks).
      const bow = V3(l.out.x, 0.6, l.out.z).normalize();
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        pts.push(V3().lerpVectors(s.a, s.b, t).addScaledVector(bow, 0.025 * Math.sin(t * Math.PI)));
      }
      const segLen = s.a.distanceTo(s.b);
      tube(B, pts, (t) => (s.r0 + (s.r1 - s.r0) * t) * (1 + 0.18 * Math.exp(-((t - 0.04) ** 2) / 0.003) + 0.1 * Math.exp(-((t - 0.96) ** 2) / 0.003)), 9, s.bone,
        (t, nn) => {
          // Pale bands near the joints, a dark shaft between; the underside a little darker.
          const band = Math.max(Math.exp(-((t - 0.06) ** 2) / 0.004), Math.exp(-((t - 0.92) ** 2) / 0.003));
          const c = lerp3(mulc(base, 0.7 + 0.25 * vnoise(t * 8, i, nn.x * 3)), look.band, band * 0.6);
          return { c, ao: 0.45 + 0.4 * Math.max(0, nn.y * 0.5 + 0.5), rough: 0.6, metal: 0.02 };
        }, V3(0, 1, 0));
      legSegs.push({ seg: s, pts, segLen, leg: l });
      // The joint knob (patella and the other joints) hides the seam between two rigid segments.
      ellipsoid(B, s.a, [s.r0 * 1.15, s.r0 * 1.15, s.r0 * 1.15], 9, 6, s.bone, null, (p, nn) => ({ c: lerp3(mulc(base, 1.2), look.band, 0.45), ao: 0.45 + 0.3 * Math.max(0, nn.y), rough: 0.55 }));
    }
    // A tiny dark claw tuft at the foot.
    ellipsoid(B, F.clone().add(V3(0, 0.012, 0)), [0.022, 0.016, 0.022], 6, 4, b0 + 2, null, () => ({ c: [0.02, 0.02, 0.02], ao: 0.5, rough: 0.3 }));
  });

  // ---- bristles: dense on the abdomen and the carapace edge, rows of long spines on the legs, short fuzz elsewhere.
  const root = mulc(base, 0.7);
  const tipC = hairC;
  const sideUp = V3(0, 1, 0);
  const sideX = V3(1, 0, 0);
  // Abdomen: about 2200 bristles, lying back along the body (the hair points to the rear and down).
  for (let k = 0; k < 2200; k++) {
    const s = abPts[Math.floor(r() * abPts.length)];
    const [p, n] = s;
    const flow = V3(0, -0.25, 1).normalize();
    const d = V3().copy(n).multiplyScalar(0.55).addScaledVector(flow, 0.6).addScaledVector(V3(r() - 0.5, r() - 0.5, r() - 0.5), 0.35).normalize();
    const len = 0.07 + 0.1 * r() * r() + (n.y > 0.5 ? 0.02 : 0);
    bristle(B, V3().copy(p).addScaledVector(n, -0.004), d, len, 0.017, root, lerp3(tipC, mulc(tipC, 0.6), r()), SB.abdomen, r() < 0.5 ? sideUp : sideX, n);
  }
  // Carapace: about 500, shorter, lying back.
  for (let k = 0; k < 650; k++) {
    const s = cephPts[Math.floor(r() * cephPts.length)];
    const [p, n] = s;
    if (n.y < -0.5) continue;
    const d = V3().copy(n).multiplyScalar(0.5).addScaledVector(V3(0, 0, 1), 0.6).addScaledVector(V3(r() - 0.5, r() - 0.5, r() - 0.5), 0.4).normalize();
    bristle(B, V3().copy(p).addScaledVector(n, -0.003), d, 0.04 + 0.05 * r(), 0.013, root, mulc(tipC, 0.85), SB.body, sideUp, n);
  }
  // Chelicerae: bristly fronts.
  for (const c of chel) {
    for (let k = 0; k < 90; k++) {
      const ri = c.rings[1 + Math.floor(r() * (c.rings.length - 2))];
      const ang = r() * Math.PI * 2;
      const nn = V3().addScaledVector(ri.u, Math.cos(ang)).addScaledVector(ri.w, Math.sin(ang)).normalize();
      if (nn.z > 0.4) continue;
      const centre = c.pts[Math.min(c.pts.length - 1, Math.floor(r() * c.pts.length))];
      const p = V3().copy(centre).addScaledVector(nn, 0.06);
      const d = V3().copy(nn).addScaledVector(V3(0, -1, 0), 0.5).normalize();
      bristle(B, p, d, 0.04 + 0.03 * r(), 0.01, root, tipC, SB.head, sideX, nn);
    }
  }
  // Legs: fuzz along every segment and long spines on the tibiae and metatarsi.
  for (const ls of legSegs) {
    const { seg, pts, segLen, leg } = ls;
    const dir = V3().subVectors(seg.b, seg.a).normalize();
    const u = V3().crossVectors(dir, V3(0, 1, 0)).normalize();
    const w = V3().crossVectors(u, dir).normalize();
    const fuzz = Math.round(segLen * 460);
    for (let k = 0; k < fuzz; k++) {
      const t = 0.06 + 0.88 * r();
      const ang = r() * Math.PI * 2;
      const nn = V3().addScaledVector(u, Math.cos(ang)).addScaledVector(w, Math.sin(ang));
      const rad = seg.r0 + (seg.r1 - seg.r0) * t;
      const c = pts[Math.round(t * (pts.length - 1))];
      const p = V3().copy(c).addScaledVector(nn, rad * 0.85);
      const d = V3().copy(nn).multiplyScalar(0.7).addScaledVector(dir, 0.6).normalize();
      bristle(B, p, d, 0.05 + 0.06 * r() * (1.2 - 0.6 * t), 0.014, root, tipC, seg.bone, dir, nn);
    }
    if (seg.bone % LEG_BONES !== SB.leg0 % LEG_BONES) {
      // Spines: two rows on the underside and the front of the tibia and metatarsus.
      const spines = seg.bone === SB.leg0 + Math.floor((seg.bone - SB.leg0) / LEG_BONES) * LEG_BONES + 1 ? 8 : 6;
      for (let k = 0; k < spines * 2; k++) {
        const t = 0.15 + 0.75 * ((k >> 1) / spines);
        const ang = (k % 2 ? -1.9 : -1.2) + (r() - 0.5) * 0.3;
        const nn = V3().addScaledVector(u, Math.cos(ang) * (leg.sx)).addScaledVector(w, Math.sin(ang));
        const rad = seg.r0 + (seg.r1 - seg.r0) * t;
        const c = pts[Math.round(t * (pts.length - 1))];
        const p = V3().copy(c).addScaledVector(nn, rad * 0.8);
        const d = V3().copy(nn).multiplyScalar(0.8).addScaledVector(dir, 0.5).normalize();
        bristle(B, p, d, 0.08 + 0.04 * r(), 0.014, mulc(base, 0.5), mulc(tipC, 0.7), seg.bone, dir, nn);
      }
    }
  }

  // ---- bones (rest pivots) and the leg segments' rest frames.
  const bones = [];
  bones[SB.root] = V3(0, 0, 0);
  bones[SB.body] = body.clone();
  bones[SB.abdomen] = V3(0, P.bodyY + 0.04, 0.42);
  bones[SB.head] = V3(0, P.bodyY + 0.02, -0.3);
  bones[SB.palpL] = palps[0].a.clone();
  bones[SB.palpR] = palps[1].a.clone();
  const segFrames = [];
  rest.forEach((l, i) => {
    const b0 = SB.leg0 + i * LEG_BONES;
    const H = l.hip;
    const K = knees[i];
    const A = ankles[i];
    const F = l.foot;
    bones[b0] = H.clone();
    bones[b0 + 1] = K.clone();
    bones[b0 + 2] = A.clone();
    segFrames[b0] = frameOf(H, K, l);
    segFrames[b0 + 1] = frameOf(K, A, l);
    segFrames[b0 + 2] = frameOf(A, F, l);
  });
  const geometry = B.geometry();
  return { geometry, bones, segFrames, rest, tris: B.index.length / 3 };
}

/** A segment's orientation basis (x = along the segment, y = in the leg plane, z = the plane normal) as a quaternion. */
const fM = new THREE.Matrix4();
const fX = new THREE.Vector3();
const fY = new THREE.Vector3();
const fZ = new THREE.Vector3();
function frameOf(a, b, leg, out = new THREE.Quaternion()) {
  fX.subVectors(b, a).normalize();
  // The plane normal: horizontal, across the leg's outward direction.
  fZ.set(-leg.out.z, 0, leg.out.x);
  fY.crossVectors(fZ, fX).normalize();
  fZ.crossVectors(fX, fY).normalize();
  fM.makeBasis(fX, fY, fZ);
  return out.setFromRotationMatrix(fM);
}

const built = new Map();
/** The geometry of a look, built once (about 13 k triangles). */
function spiderData(look) {
  if (!built.has(look.id)) built.set(look.id, buildSpider(look));
  return built.get(look.id);
}

/* ---------------- the body ---------------- */

const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const tw = new THREE.Vector3();
const bodyQ = new THREE.Quaternion();
const invQ = new THREE.Quaternion();
const knee = new THREE.Vector3();
const ankle = new THREE.Vector3();
const hip = new THREE.Vector3();
const foot = new THREE.Vector3();

/**
 * A spider's body. The agent sets `pose` each frame: curl 0..1 (legs folded: hanging on a thread, falling, tumbling),
 * strike 0..1 (front legs raised, fangs open), fangs 0..1 (chewing), tumble (radians: rolled over after a hit), and
 * calls `animate({ dt, speed, grounded })` after placing `group` (position = the floor point under the body, rotation.y
 * = yaw, scale = size).
 */
export class SpiderBody {
  constructor(look, scale = 1) {
    const d = spiderData(look);
    this.data = d;
    this.look = look;
    this.scale = scale;
    this.group = new THREE.Group();
    this.group.name = `spider-${look.id}`;
    this.group.scale.setScalar(scale);
    const bones = d.bones.map((p, i) => {
      const b = new THREE.Bone();
      b.name = `sp${i}`;
      b.position.copy(p);
      return b;
    });
    // Every bone hangs directly from the root bone (the IK sets each one's position and orientation).
    for (let i = 1; i < bones.length; i++) bones[0].add(bones[i]);
    const mesh = new THREE.SkinnedMesh(d.geometry, characterMaterial());
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.frustumCulled = true;
    mesh.boundingSphere = d.geometry.boundingSphere.clone();
    mesh.name = `spider-${look.id}`;
    this.mesh = mesh;
    this.bones = bones;
    this.group.add(mesh);
    this.pose = { curl: 0, strike: 0, fangs: 0, tumble: 0 };
    this.t = Math.random() * 10;
    this.legs = d.rest.map((l) => ({
      rest: l,
      foot: new THREE.Vector3(), // world position of the planted foot
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      stepT: -1, // < 0: planted
      planted: false,
    }));
    this.bodyY = P.bodyY;
    this.pitch = 0;
    this.roll = 0;
    this.lastSet = 0;
    this.placed = false;
  }

  /** The spider's ground point in world space → body space of this spider (unscaled), into out. */
  toLocal(w, out) {
    const g = this.group;
    out.set(w.x - g.position.x, w.y - g.position.y, w.z - g.position.z);
    const c = Math.cos(-g.rotation.y);
    const s = Math.sin(-g.rotation.y);
    const x = out.x * c + out.z * s;
    const z = -out.x * s + out.z * c;
    out.set(x / this.scale, out.y / this.scale, z / this.scale);
    return out;
  }

  /** Body space (unscaled) → world. */
  toWorld(l, out) {
    const g = this.group;
    const c = Math.cos(g.rotation.y);
    const s = Math.sin(g.rotation.y);
    const x = l.x * this.scale;
    const z = l.z * this.scale;
    out.set(g.position.x + x * c + z * s, g.position.y + l.y * this.scale, g.position.z - x * s + z * c);
    return out;
  }

  /** Puts all feet at their rest spots on the floor (after a spawn or a teleport). */
  plant() {
    for (const L of this.legs) {
      this.home(L, 0, 0, L.foot);
      L.stepT = -1;
      L.planted = true;
    }
    this.placed = true;
  }

  /** Where a leg's foot wants to be: its rest spot (led ahead by the velocity) dropped to the floor. */
  home(L, vx, vz, out) {
    this.toWorld(L.rest.foot, out);
    out.x += vx * 0.22;
    out.z += vz * 0.22;
    // The floor below (or above, on a slope): walk the density field from the hip's height downwards.
    const top = this.group.position.y + 0.9 * this.scale;
    let y = null;
    // A viewer (qa) may give its own flat floor instead of the world's density field.
    if (this.floorY) y = this.floorY(out.x, out.z);
    else if (sdf(out.x, top, out.z) <= 0) {
      for (let d = 0; d < 2.4 * this.scale; d += 0.08) {
        if (sdf(out.x, top - d, out.z) > 0) {
          y = top - d + 0.02;
          break;
        }
      }
    }
    out.y = y ?? this.group.position.y;
    return out;
  }

  /**
   * Per frame. st: { dt, speed (m/s), vx, vz (world velocity), grounded }. The gait: a leg whose foot is too far from
   * its home steps there in an arc; the two sets of four alternate.
   */
  animate(st) {
    const dt = Math.min(0.05, st.dt);
    this.t += dt;
    const p = this.pose;
    const B = this.bones;
    if (!this.placed) this.plant();
    const curl = p.curl;
    const speed = st.speed || 0;
    const stepDur = Math.max(0.11, 0.24 - speed * 0.03);
    const thresh = (0.32 + speed * 0.06) * this.scale;
    // Which set may step: the one not mid-step (sets alternate).
    let busy0 = false;
    let busy1 = false;
    this.legs.forEach((L, i) => {
      if (L.stepT >= 0) {
        if (setOf(i) === 0) busy0 = true;
        else busy1 = true;
      }
    });
    let feetY = 0;
    let frontY = 0;
    let backY = 0;
    let leftY = 0;
    let rightY = 0;
    this.legs.forEach((L, i) => {
      if (curl > 0.5 || !st.grounded) {
        // In the air or curled: the feet follow the body (tucked below it).
        this.toWorld(L.rest.foot, L.foot);
        L.foot.y = this.group.position.y;
        L.stepT = -1;
      } else {
        const want = this.home(L, st.vx || 0, st.vz || 0, tv);
        if (L.stepT >= 0) {
          L.stepT += dt / stepDur;
          L.to.copy(want);
          const t = Math.min(1, L.stepT);
          L.foot.lerpVectors(L.from, L.to, t);
          L.foot.y += Math.sin(t * Math.PI) * (0.22 + speed * 0.03) * this.scale;
          if (L.stepT >= 1) L.stepT = -1;
        } else {
          const far = L.foot.distanceTo(want);
          const set = setOf(i);
          const mayStep = set === 0 ? !busy1 : !busy0;
          if ((far > thresh && mayStep) || far > thresh * 2.6) {
            L.from.copy(L.foot);
            L.to.copy(want);
            L.stepT = 0;
            if (set === 0) busy0 = true;
            else busy1 = true;
          }
        }
      }
      const ly = (L.foot.y - this.group.position.y) / this.scale;
      feetY += ly;
      if (L.rest.k < 2) frontY += ly;
      else backY += ly;
      if (L.rest.side === 0) leftY += ly;
      else rightY += ly;
    });
    // The body rides on the feet: its height above their mean, pitch and roll from front / back and left / right.
    const k = 1 - Math.exp(-dt * 10);
    const bob = Math.sin(this.t * 2.3) * 0.012 + (speed > 0.2 ? Math.sin(this.t * 22) * 0.01 : 0);
    this.bodyY += (P.bodyY + feetY / 8 - curl * 0.12 + bob - this.bodyY) * k;
    const wantPitch = Math.atan2((frontY - backY) / 4, 1.2) - p.strike * 0.35;
    const wantRoll = Math.atan2((rightY - leftY) / 4, 1.6);
    this.pitch += (wantPitch - this.pitch) * k;
    this.roll += (wantRoll - this.roll) * k;
    // Body bone: height, pitch (nose up = positive about x, the spider faces −z), roll.
    bodyQ.setFromEuler(te.set(-this.pitch, 0, this.roll, 'YXZ'));
    const bodyPos = tw.set(0, this.bodyY, 0);
    B[SB.body].position.copy(bodyPos);
    B[SB.body].quaternion.copy(bodyQ);
    const rest = this.data.bones;
    // Abdomen: hangs from the waist, swaying, lifted a little when striking.
    tv2.copy(rest[SB.abdomen]).sub(rest[SB.body]).applyQuaternion(bodyQ).add(bodyPos);
    // The bone's position is where its rest pivot moved to; its rotation turns the abdomen about that pivot.
    B[SB.abdomen].position.copy(tv2);
    tq.setFromEuler(te.set(0.05 * Math.sin(this.t * 1.3) + p.strike * 0.25 - curl * 0.3, 0.06 * Math.sin(this.t * 0.9), 0.03 * Math.sin(this.t * 1.7), 'XYZ'));
    B[SB.abdomen].quaternion.copy(bodyQ).multiply(tq);
    // Head: the fangs work (a small nod of the whole head piece), more when striking.
    tv2.copy(rest[SB.head]).sub(rest[SB.body]).applyQuaternion(bodyQ).add(bodyPos);
    B[SB.head].position.copy(tv2);
    const chew = (0.06 + 0.12 * p.fangs) * Math.max(0, Math.sin(this.t * (6 + 8 * p.fangs)));
    tq.setFromEuler(te.set(chew + p.strike * 0.1, 0, 0, 'XYZ'));
    B[SB.head].quaternion.copy(bodyQ).multiply(tq);
    // Palps: feeling about.
    for (const [bi, sx] of [[SB.palpL, -1], [SB.palpR, 1]]) {
      tv2.copy(rest[bi]).sub(rest[SB.body]).applyQuaternion(bodyQ).add(bodyPos);
      B[bi].position.copy(tv2);
      tq.setFromEuler(te.set(0.15 * Math.sin(this.t * 3.1 + sx) + p.strike * 0.5, sx * 0.1 * Math.sin(this.t * 2.3), 0, 'XYZ'));
      B[bi].quaternion.copy(bodyQ).multiply(tq);
    }
    // Legs: hip moves with the body; foot from the planted world point (or the curled / striking pose); IK.
    this.legs.forEach((L, i) => {
      const l = L.rest;
      const b0 = SB.leg0 + i * LEG_BONES;
      hip.copy(l.hip).sub(rest[SB.body]).applyQuaternion(bodyQ).add(bodyPos);
      this.toLocal(L.foot, foot);
      if (curl > 0) {
        // Curled: the feet drawn in under the body.
        tv.set(l.hip.x + l.out.x * 0.35, this.bodyY - 0.45, l.hip.z + l.out.z * 0.35);
        foot.lerp(tv, Math.min(1, curl));
      }
      if (p.strike > 0 && l.k === 0) {
        // Striking: the front pair raised high and forward.
        tv.set(l.hip.x + l.out.x * 0.5, this.bodyY + 0.75, l.hip.z - 0.9);
        foot.lerp(tv, p.strike);
      } else if (p.strike > 0 && l.k === 1) {
        tv.set(l.hip.x + l.out.x * 0.9, this.bodyY + 0.2, l.hip.z - 0.6);
        foot.lerp(tv, p.strike * 0.5);
      }
      solveLeg(hip, foot, l, knee, ankle, curl);
      this.setSeg(b0, hip, knee, l);
      this.setSeg(b0 + 1, knee, ankle, l);
      this.setSeg(b0 + 2, ankle, foot, l);
    });
    this.group.rotation.x = p.tumble;
  }

  /** Places a leg bone: its pivot at `a`, turned so that its rest segment now runs from a to b. */
  setSeg(bi, a, b, leg) {
    const bone = this.bones[bi];
    bone.position.copy(a);
    frameOf(a, b, leg, tq);
    invQ.copy(this.data.segFrames[bi]).invert();
    bone.quaternion.copy(tq).multiply(invQ);
  }

  /** The render layers of the whole body. */
  setLayers(mask) {
    this.group.traverse((o) => {
      o.layers.mask = mask;
    });
  }

  dispose() {
    this.mesh.skeleton.dispose();
  }
}

/** The two alternating leg sets: L1 R2 L3 R4 (set 0) and R1 L2 R3 L4 (set 1). Index = side * 4 + k. */
function setOf(i) {
  const side = i >= 4 ? 1 : 0;
  const k = i % 4;
  return (k + side) % 2;
}

/** Triangle count of a look (for the notes). */
export function spiderTris(look = SPIDER_LOOKS[0]) {
  return spiderData(look).tris;
}

export { P as SPIDER_PROPORTIONS };
