/* ==== smaug/body.js — Smaug's procedural body (NOTES-7a-hoard): one skinned mesh (one draw call) with a skeleton of
   32 bones, built at start-up from code (no assets):
   - the body: a tube along the spine (20 m from the tail's tip to the snout), elliptic, flat-bellied, the head shaped
     from the same tube (a broad skull, a long snout, a hinged lower jaw), dorsal spikes, two great back-swept horns,
     teeth;
   - the films' wyvern build: two hind legs with claws, the wings as the forelimbs (arm, forearm, three long fingers, a
     thumb claw) with the membrane between the fingers and down the flank to the hip;
   - red-gold scales (a procedural scale texture over vertex colours: dark red back, red-gold flanks, a gold belly), and
     the book's "waistcoat of diamonds": gems stuck all over the underbelly (A hobbit, 12. fejezet), with the one bare
     patch in the hollow of the left breast (the book; TERV 0.11/22 is the finale's).
   Rest pose: the spine along +z (tail tip at z = 0, snout at z = 20), +y up, +x is Smaug's left; the wings spread
   sideways, the legs hanging down. The bones' local +z runs along each bone (index.js poses them by directions).
   Extra vertex data `aFx` (x: heat, the throat and chest glow before the fire; y: chest, the breathing swell). ==== */
import * as THREE from 'three';

/** Spine joints (arc length from the tail's tip, m): bone i runs from joint i to joint i + 1; the last is the head. */
export const SPINE_J = [0, 1.4, 2.8, 4.2, 5.6, 7.0, 8.5, 10.0, 11.5, 13.0, 14.0, 15.0, 16.0, 17.0, 17.6, 20.0];
export const BODY_LEN = 20;
/** Where the parts sit on the spine (arc length). */
export const AT = { hip: 8.6, shoulder: 13.0, neck: 14.0, head: 17.6, jaw: 17.95, snout: 20 };
/** The spine bone index for the hips and the shoulders (the legs' and wings' parent). */
export const HIP_BONE = 6;
export const SHOULDER_BONE = 9;
export const HEAD_BONE = SPINE_J.length - 2;

/** From this arc length forward (the breast, the neck, the head) the body's rings are 8 cm apart (NOTES-17-polish). */
const NECK_FINE = 12.2;

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const ss = (a, b, x) => smooth01((x - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

/** Half width, half height of the body's cross-section at arc length s (the head's own shape included). */
export function sectionAt(s) {
  let w;
  let h;
  if (s < AT.hip) {
    // The tail: thin at the tip, thick at the hips.
    const t = s / AT.hip;
    w = lerp(0.08, 1.22, Math.pow(t, 1.2));
    h = w * 0.92;
  } else if (s < AT.shoulder) {
    // The body: deep-chested, widest a little before the shoulders.
    const t = (s - AT.hip) / (AT.shoulder - AT.hip);
    w = 1.22 + Math.sin(t * Math.PI * 0.9) * 0.55;
    h = w * (0.95 + 0.1 * Math.sin(t * Math.PI));
  } else if (s < AT.head) {
    // The neck: thick at the shoulders, slender towards the head.
    const t = (s - AT.shoulder) / (AT.head - AT.shoulder);
    w = lerp(1.5, 0.62, Math.pow(t, 0.7));
    h = w * 1.02;
  } else {
    // The head: a broad skull behind the eyes, a long snout tapering to the nostrils.
    const t = (s - AT.head) / (AT.snout - AT.head);
    const skull = 1 - ss(0.0, 0.18, t) * 0;
    w = t < 0.2 ? lerp(0.62, 0.8, t / 0.2) * skull : lerp(0.8, 0.34, Math.pow((t - 0.2) / 0.8, 0.9));
    h = t < 0.2 ? lerp(0.64, 0.62, t / 0.2) : lerp(0.62, 0.26, Math.pow((t - 0.2) / 0.8, 0.8));
    if (t > 0.97) {
      const k = (t - 0.97) / 0.03;
      w *= 1 - 0.35 * k;
      h *= 1 - 0.35 * k;
    }
  }
  return [w, h];
}

/**
 * The throat's ridged plates (the films' Smaug: broad overlapping plates under the neck): 0..1 relief at arc length s
 * and ring angle cosine ca (-1 = the belly line). Each plate's rear edge (towards the tail) stands out over the next.
 */
function neckPlate(s, ca) {
  if (s < 13.1 || s > 17.45 || ca > -0.2) return 0;
  const f = (s - 13.1) / 0.32 - Math.floor((s - 13.1) / 0.32);
  const prof = ss(0, 0.3, f) * Math.pow(1 - f, 1.1) * 1.9;
  return Math.min(1, prof) * ss(-0.2, -0.6, ca) * ss(13.1, 13.5, s) * (1 - ss(17.0, 17.45, s));
}

/** The spine bone and blend for an arc length: smooth skinning between neighbours. Returns [[bone, w], …]. */
function spineWeights(s) {
  const n = SPINE_J.length - 1;
  let i = 0;
  while (i < n - 1 && s >= SPINE_J[i + 1]) i++;
  if (i === HEAD_BONE) return [[i, 1]];
  const t = (s - SPINE_J[i]) / (SPINE_J[i + 1] - SPINE_J[i]);
  if (t < 0.5 && i > 0) return [[i - 1, 0.5 - t], [i, 0.5 + t]];
  if (t >= 0.5 && i + 1 < HEAD_BONE) return [[i, 1.5 - t], [i + 1, t - 0.5]];
  if (t >= 0.5 && i + 1 === HEAD_BONE) return [[i, 1.5 - t], [i + 1, t - 0.5]];
  return [[i, 1]];
}

/** A growing geometry with skin weights (up to four bones per vertex) and the extra `aFx` data. */
class Builder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.fx = [];
    this.idx = [];
  }

  get count() {
    return this.pos.length / 3;
  }

  /** Adds a vertex; `weights` [[bone, w], …] (normalised here, the four largest kept). */
  vert(p, n, uv, c, weights, fx = [0, 0]) {
    const ws = weights.filter((w) => w[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = ws.reduce((s, w) => s + w[1], 0) || 1;
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    this.col.push(c[0], c[1], c[2]);
    for (let k = 0; k < 4; k++) {
      this.si.push(ws[k] ? ws[k][0] : 0);
      this.sw.push(ws[k] ? ws[k][1] / tot : 0);
    }
    this.fx.push(fx[0], fx[1]);
    return this.count - 1;
  }

  tri(a, b, c) {
    this.idx.push(a, b, c);
  }

  /** Adds a three.js geometry placed by matrix `m`, every vertex with the same weights, colour and fx. */
  addGeo(geo, m, c, weights, fx = [0, 0]) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(m);
    const p = g.attributes.position;
    const nn = g.attributes.normal;
    const base = this.count;
    for (let i = 0; i < p.count; i++) this.vert([p.getX(i), p.getY(i), p.getZ(i)], [nn.getX(i), nn.getY(i), nn.getZ(i)], [p.getX(i) * 2, p.getZ(i) * 2], c, weights, fx);
    for (let i = 0; i < p.count; i += 3) this.tri(base + i, base + i + 1, base + i + 2);
    if (g !== geo) g.dispose();
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.fx, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const C_BACK = new THREE.Color(0x8a1e0e);
const C_FLANK = new THREE.Color(0xc23c16);
const C_GOLD = new THREE.Color(0xc87428);
const C_BELLY = new THREE.Color(0xd0923c);
const C_MEMB = new THREE.Color(0x6a2414);
const C_HORN = new THREE.Color(0x3a2a1e);
const C_TOOTH = new THREE.Color(0xe8dcc0);
const C_CLAW = new THREE.Color(0x24201c);
const tmpC = new THREE.Color();

/** The body colour round a cross-section: angle 0 = the back, π = the belly. */
function bodyColour(ang, s) {
  const k = (1 - Math.cos(ang)) / 2; // 0 back … 1 belly
  tmpC.copy(C_BACK).lerp(C_FLANK, ss(0.08, 0.45, k)).lerp(C_GOLD, ss(0.5, 0.72, k)).lerp(C_BELLY, ss(0.72, 0.9, k));
  // The tail's tip and the snout a little darker.
  const dark = 1 - 0.25 * (1 - ss(0, 2.5, s)) - 0.15 * ss(19.3, 20, s);
  return [tmpC.r * dark, tmpC.g * dark, tmpC.b * dark];
}

/** True in the bare patch of the left breast (no gems there; the book). */
export function barePatch(s, ang) {
  // Left side (x > 0) low on the breast: the angle from the back runs 0 … π round the left side.
  return s > 12.2 && s < 12.95 && ang > 2.0 && ang < 2.55;
}

/**
 * Builds the body. Returns { geometry, bones, root, map } — `bones` named: spine[i], jaw, wing.L / wing.R (humerus,
 * forearm, finger1–3), leg.L / leg.R (thigh, shin, foot); `rest` holds each limb bone's rest direction and up hint in
 * its parent spine bone's frame (index.js poses the limbs by directions).
 */
export function buildSmaugBody() {
  const B = new Builder();
  // ---- bones: the spine (rest: along +z) ----
  const spine = [];
  for (let i = 0; i < SPINE_J.length - 1; i++) {
    const b = new THREE.Bone();
    b.name = `spine${i}`;
    if (i === 0) b.position.set(0, 0, SPINE_J[0]);
    else b.position.set(0, 0, SPINE_J[i] - SPINE_J[i - 1]);
    if (i > 0) spine[i - 1].add(b);
    spine.push(b);
  }
  const root = spine[0];
  const jaw = new THREE.Bone();
  jaw.name = 'jaw';
  jaw.position.set(0, -0.14, AT.jaw - AT.head);
  spine[HEAD_BONE].add(jaw);
  root.updateMatrixWorld(true);

  // Limb chains: bones with local +z along each segment, built from world rest points with an up hint.
  const bones = [...spine, jaw];
  const restInfo = new Map();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const m4 = new THREE.Matrix4();
  const quatFromDir = (dir, up) => {
    const z = dir.clone().normalize();
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    const y = new THREE.Vector3().crossVectors(z, x);
    m4.makeBasis(x, y, z);
    return new THREE.Quaternion().setFromRotationMatrix(m4);
  };
  /** A chain under `parent` through world rest points pts[0..n]: returns its bones. */
  const chain = (name, parent, pts, up) => {
    const out = [];
    let par = parent;
    for (let i = 0; i + 1 < pts.length; i++) {
      const b = new THREE.Bone();
      b.name = `${name}${i}`;
      const worldQ = quatFromDir(pts[i + 1].clone().sub(pts[i]), up);
      par.updateMatrixWorld(true);
      const pw = new THREE.Matrix4().copy(par.matrixWorld).invert();
      const wm = new THREE.Matrix4().compose(pts[i], worldQ, new THREE.Vector3(1, 1, 1));
      const lm = pw.multiply(wm);
      lm.decompose(b.position, b.quaternion, b.scale);
      par.add(b);
      b.updateMatrixWorld(true);
      bones.push(b);
      // The rest direction and up hint in the parent spine bone's frame (identity rotation in the rest pose).
      restInfo.set(b, { dir: pts[i + 1].clone().sub(pts[i]).normalize(), up: up.clone(), len: pts[i].distanceTo(pts[i + 1]) });
      out.push(b);
      par = b;
    }
    return out;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const wing = {};
  const leg = {};
  const wingPts = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const S = V(0.82 * sx, 0.55, AT.shoulder);
    const E = S.clone().add(V(2.5 * sx, 0.1, 0.5));
    const W = E.clone().add(V(3.0 * sx, 0.0, -0.9));
    const F1 = W.clone().add(V(3.6 * sx, -0.05, -2.6));
    const F2 = W.clone().add(V(1.7 * sx, -0.08, -4.0));
    const F3 = W.clone().add(V(-0.5 * sx, -0.1, -4.3));
    const arm = chain(`wing${side}a`, spine[SHOULDER_BONE], [S, E, W], V(0, 1, 0));
    const f1 = chain(`wing${side}f1`, arm[1], [W, F1], V(0, 1, 0));
    const f2 = chain(`wing${side}f2`, arm[1], [W, F2], V(0, 1, 0));
    const f3 = chain(`wing${side}f3`, arm[1], [W, F3], V(0, 1, 0));
    wing[side] = { humerus: arm[0], forearm: arm[1], finger1: f1[0], finger2: f2[0], finger3: f3[0] };
    wingPts[side] = { S, E, W, F1, F2, F3, sx };
    const Hp = V(0.82 * sx, -0.35, AT.hip);
    const K = Hp.clone().add(V(0.25 * sx, -1.45, 0.55));
    const A = K.clone().add(V(0.0, -1.2, -0.75));
    const T = A.clone().add(V(0.0, -0.3, 0.85));
    const lg = chain(`leg${side}`, spine[HIP_BONE], [Hp, K, A, T], V(0, 0, 1));
    leg[side] = { thigh: lg[0], shin: lg[1], foot: lg[2], pts: [Hp, K, A, T], sx };
  }
  root.updateMatrixWorld(true);
  const index = new Map(bones.map((b, i) => [b, i]));
  const bi = (b) => index.get(b);

  // ---- the body tube ----
  // (NOTES-17-polish: 26 points round each ring instead of 22, and rings every 8 cm from the breast forward instead of
  // 12 cm, for the neck plates and the head's shape; sectionAt() itself is unchanged, the colliders use it.)
  const RAD = 26;
  const ringS = [];
  for (let s = 0; s < NECK_FINE - 1e-6; s += 0.12) ringS.push(s);
  for (let s = NECK_FINE; s < BODY_LEN - 1e-6; s += 0.08) ringS.push(s);
  ringS.push(BODY_LEN);
  const rings = [];
  for (let r = 0; r < ringS.length; r++) {
    const s = ringS[r];
    const [w, h] = sectionAt(s);
    const ring = [];
    const inHead = s >= AT.head;
    const tHead = inHead ? (s - AT.head) / (AT.snout - AT.head) : 0;
    for (let k = 0; k <= RAD; k++) {
      const ang = (k / RAD) * Math.PI * 2; // 0 = top (back), π = bottom (belly); + towards +x (left)
      const sa = Math.sin(ang);
      const ca = Math.cos(ang);
      // A flat belly: the lower half is squashed.
      const hy = ca < 0 ? h * (inHead ? 0.9 : 0.78) : h;
      // The head is boxier (flat sides, a flat top over the snout); the body round.
      let x = inHead ? Math.sign(sa) * Math.abs(sa) ** 0.7 * w : sa * w;
      let y = inHead ? Math.sign(ca) * Math.abs(ca) ** 0.8 * hy : ca * hy;
      // Close-up relief (NOTES-17-polish): the throat's ridged plates, the jaw's line and cheeks, the nostrils.
      const plate = neckPlate(s, ca);
      if (plate > 0) {
        const k = 1 + (0.1 * Math.min(1, w) * plate) / Math.max(0.3, Math.hypot(x, y));
        x *= k;
        y *= k;
      }
      if (inHead) {
        const side = Math.abs(sa);
        // Cheeks: the jaw muscles bulge behind and below the eyes.
        x *= 1 + 0.13 * Math.exp(-((tHead - 0.13) ** 2) / 0.008) * Math.exp(-((ca + 0.3) ** 2) / 0.12);
        // The mouth's line: the lower jaw sits a little inside the upper one, so the teeth and the lip line show.
        if (s > AT.jaw) x *= 1 - 0.04 * ss(AT.jaw, AT.jaw + 0.4, s) * Math.exp(-((ca + 0.32) ** 2) / 0.012);
        // Nostrils: two raised rims on top of the snout near the tip.
        if (s > 19.35 && ca > 0) y += Math.exp(-((s - 19.72) ** 2) / 0.012) * Math.exp(-((side - 0.42) ** 2) / 0.012) * 0.045;
        // The chin: a firm lower edge under the jaw's tip.
        if (ca < -0.6) y -= Math.exp(-((tHead - 0.82) ** 2) / 0.01) * 0.03;
      }
      // A slight dorsal ridge.
      if (!inHead) y += Math.max(0, ca) ** 8 * 0.1 * w;
      // The head: a flatter top with brow ridges over the eyes, the mouth's line at the side.
      if (inHead) {
        const brow = Math.exp(-((tHead - 0.18) ** 2) / 0.006) * 0.1;
        if (ca > 0.3) y += brow * Math.abs(sa);
        if (ca > 0) y *= 0.92;
      }
      const nx = sa / Math.max(0.05, w);
      const ny = ca / Math.max(0.05, hy);
      const nl = Math.hypot(nx, ny) || 1;
      const n = [nx / nl, ny / nl, 0];
      // The jaw: the head's lower half in front of the hinge follows the jaw bone.
      let weights;
      const lower = ca < -0.05;
      if (inHead && lower && s > AT.jaw) weights = [[bi(jaw), 1]];
      else if (inHead && lower && s > AT.jaw - 0.3) weights = [[bi(jaw), (s - (AT.jaw - 0.3)) / 0.3], [HEAD_BONE, 1 - (s - (AT.jaw - 0.3)) / 0.3]];
      else weights = spineWeights(s);
      let c = bodyColour(ang, s);
      // The throat plates: gold, darker in the grooves between them.
      if (plate > 0) c = c.map((v, i) => v * (0.74 + 0.42 * plate) * (i === 0 ? 1.0 : 1.04));
      // Nostrils: two dark spots on the snout's top near the tip; the mouth's line along the head's side.
      if (s > 19.6 && ca > 0.2 && Math.abs(sa) > 0.25 && Math.abs(sa) < 0.6) c = c.map((v) => v * 0.35);
      if (inHead && s > AT.jaw + 0.1 && ca > -0.2 && ca < 0.02) c = c.map((v) => v * 0.3);
      // The heat (throat and chest glow) and the chest's breathing swell.
      const heat = (ss(10.5, 12.5, s) * (1 - ss(16.8, 17.6, s))) * ss(0.2, 0.75, (1 - ca) / 2);
      const chest = ss(9.0, 10.5, s) * (1 - ss(13.0, 14.2, s));
      // (Scales: a third finer than before, so they still read close up; the texture is also the bump map.)
      ring.push(B.vert([x, y, s], n, [(k / RAD) * 4, s * 0.6], c, weights, [heat, chest]));
    }
    rings.push(ring);
  }
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let k = 0; k < RAD; k++) {
      const a = rings[r][k];
      const b = rings[r + 1][k];
      const c = rings[r][k + 1];
      const d = rings[r + 1][k + 1];
      B.tri(a, b, c);
      B.tri(b, d, c);
    }
  }
  // Caps: the tail's tip and the snout (small fans).
  for (const [r, flip] of [[0, true], [rings.length - 1, false]]) {
    const s = r === 0 ? 0 : BODY_LEN;
    const cIdx = B.vert([0, 0, s + (flip ? -0.05 : 0.05)], [0, 0, flip ? -1 : 1], [0, s * 1.6], bodyColour(1.6, s), spineWeights(Math.max(0.01, Math.min(BODY_LEN - 0.01, s))));
    for (let k = 0; k < RAD; k++) {
      if (flip) B.tri(cIdx, rings[r][k + 1], rings[r][k]);
      else B.tri(cIdx, rings[r][k], rings[r][k + 1]);
    }
  }

  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const place = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => M.compose(new THREE.Vector3(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), new THREE.Vector3().setScalar(1).multiplyScalar(1).set(...(Array.isArray(s) ? s : [s, s, s])));

  // ---- the spine row: flat, back-swept blade spikes from the back of the skull to near the tail's tip
  //      (NOTES-17-polish: denser on the neck and shoulders, blades instead of four-sided cones), on the dorsal keel ----
  const blade = new THREE.ConeGeometry(1, 1, 6, 1, true);
  for (let s = 0.9; s < AT.head - 0.15; ) {
    const [w, h] = sectionAt(s);
    const big = s > AT.hip - 1.5 ? 1 : 0.55 + 0.45 * ss(0.9, AT.hip - 1.5, s);
    const len = (0.16 + 0.42 * Math.min(1, w)) * big;
    const r = 0.06 + 0.07 * Math.min(1.4, w);
    // Thin sideways, long along the spine; leaning back towards the tail.
    B.addGeo(blade, place(0, h + 0.1 * w + len * 0.34, s, -0.75, 0, 0, [r * 0.42, len, r * 1.7]), [C_HORN.r, C_HORN.g, C_HORN.b], spineWeights(s));
    s += s > AT.shoulder - 1.5 ? 0.3 : 0.42;
  }
  blade.dispose();
  // ---- the horns: two great back-swept horns, a row of smaller ones down the jaw's corner ----
  const headW = [[HEAD_BONE, 1]];
  /** A tapered, ridged horn along a curve through pts (the rings shrink to 12 % at the tip; growth ridges). */
  const horn = (pts, r0, segs, radial, ridges, col) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const hg = new THREE.TubeGeometry(curve, segs, r0, radial, false);
    const p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / (radial + 1)) / segs;
      const c = curve.getPoint(t);
      const k = (1 - 0.88 * t) * (1 + 0.07 * Math.sin(t * Math.PI * 2 * ridges) * (1 - t));
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
    }
    hg.computeVertexNormals();
    B.addGeo(hg, new THREE.Matrix4(), col, headW);
    hg.dispose();
  };
  const hornCol = [C_HORN.r * 1.3, C_HORN.g * 1.25, C_HORN.b * 1.2];
  for (const sx of [1, -1]) {
    // The two great horns: from behind the brows back and out, the tips curving up a little (the films).
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(new THREE.Vector3(sx * (0.4 + 0.34 * t - 0.06 * t * t), 0.44 + 0.5 * t - 0.32 * t * t + 0.3 * t * t * t, AT.head + 0.25 - 1.55 * t));
    }
    horn(pts, 0.13, 14, 8, 5, hornCol);
    // A smaller back-swept horn below each great one, over the jaw's hinge.
    const low = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      low.push(new THREE.Vector3(sx * (0.6 + 0.16 * t), 0.12 + 0.12 * t, AT.head + 0.05 - 0.75 * t));
    }
    horn(low, 0.07, 6, 6, 3, hornCol);
    // The frill of spikes down the jaw's corner and the cheek, flattened, pointing back.
    const cone = new THREE.ConeGeometry(1, 1, 5, 1, true);
    for (let i = 0; i < 5; i++) {
      B.addGeo(cone, place(sx * (0.56 - i * 0.03), -0.08 - i * 0.07, AT.head + 0.3 - i * 0.16, -1.25, 0, sx * 0.75, [0.05, 0.3 - i * 0.035, 0.03]), [C_HORN.r, C_HORN.g, C_HORN.b], headW);
    }
    cone.dispose();
  }
  // ---- teeth: down from the upper jaw, up from the lower ----
  for (let s = AT.jaw + 0.55; s < AT.snout - 0.08; s += 0.13) {
    const t = (s - AT.head) / (AT.snout - AT.head);
    const [w] = sectionAt(s);
    for (const sx of [1, -1]) {
      const len = 0.09 + 0.06 * Math.sin(t * 9);
      B.addGeo(new THREE.ConeGeometry(0.026, len, 4), place(sx * w * 0.97, -0.04 - len * 0.35, s, Math.PI, 0, 0), [C_TOOTH.r, C_TOOTH.g, C_TOOTH.b], headW);
      B.addGeo(new THREE.ConeGeometry(0.02, len * 0.8, 4), place(sx * w * 0.93, -0.1 + len * 0.25, s - 0.06, 0, 0, 0), [C_TOOTH.r, C_TOOTH.g, C_TOOTH.b], [[bi(jaw), 1]]);
    }
  }
  // ---- the gems of the underbelly (the book's waistcoat of diamonds), not on the bare patch ----
  let gseed = 17;
  const grnd = () => ((gseed = (gseed * 16807) % 2147483647) / 2147483647);
  const GEMS = [0xf4f8ff, 0xf4f8ff, 0xe8f0ff, 0xd82a3a, 0x30c870, 0x4a7ae8, 0xf0d060];
  for (let i = 0; i < 190; i++) {
    const s = 8.6 + grnd() * 7.0;
    const ang = Math.PI + (grnd() - 0.5) * 2.1;
    if (barePatch(s, ang)) continue;
    const [w, h] = sectionAt(s);
    const x = Math.sin(ang) * w * 0.98;
    const y = Math.cos(ang) * h * 0.78 * 0.98;
    const r = 0.045 + grnd() * 0.06;
    const c = new THREE.Color(GEMS[Math.floor(grnd() * GEMS.length)]);
    const o = new THREE.OctahedronGeometry(r, 0);
    B.addGeo(o, place(x, y, s, grnd() * 3, grnd() * 3, grnd() * 3, [1, 0.6, 1]), [c.r * 1.4, c.g * 1.4, c.b * 1.4], spineWeights(s));
  }

  // ---- limbs: tapered tubes skinned to their bones (blended at the joints) ----
  const limbTube = (a, b, r0, r1, bone, prevBone, nextBone, col, seg = 7, rings = 6) => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const xA = new THREE.Vector3().crossVectors(up, dir).normalize();
    const yA = new THREE.Vector3().crossVectors(dir, xA);
    const base = B.count;
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      const rad = lerp(r0, r1, t);
      const c = a.clone().addScaledVector(dir, len * t);
      let w = [[bi(bone), 1]];
      if (prevBone && t < 0.2) w = [[bi(bone), 0.5 + t * 2.5], [bi(prevBone), 0.5 - t * 2.5]];
      if (nextBone && t > 0.8) w = [[bi(bone), 0.5 + (1 - t) * 2.5], [bi(nextBone), 0.5 - (1 - t) * 2.5]];
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * Math.PI * 2;
        const n = xA.clone().multiplyScalar(Math.cos(ang)).addScaledVector(yA, Math.sin(ang));
        const p = c.clone().addScaledVector(n, rad);
        B.vert(p.toArray(), n.toArray(), [k / seg, t * len], col, w);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let k = 0; k < seg; k++) {
        const p0 = base + r * (seg + 1) + k;
        const p1 = p0 + seg + 1;
        B.tri(p0, p1, p0 + 1);
        B.tri(p1, p1 + 1, p0 + 1);
      }
    }
  };
  const fl = [C_FLANK.r, C_FLANK.g, C_FLANK.b];
  const bk = [C_BACK.r * 1.1, C_BACK.g, C_BACK.b];
  const claw = [C_CLAW.r, C_CLAW.g, C_CLAW.b];
  for (const side of ['L', 'R']) {
    const L = leg[side];
    const [Hp, K, A, T] = L.pts;
    limbTube(Hp.clone().add(new THREE.Vector3(0, 0.25, 0)), K, 0.5, 0.3, L.thigh, null, L.shin, fl);
    limbTube(K, A, 0.3, 0.19, L.shin, L.thigh, L.foot, fl);
    limbTube(A, T, 0.2, 0.12, L.foot, L.shin, null, bk);
    // Claws: three forward, one back.
    const fdir = T.clone().sub(A).normalize();
    for (const k of [-1, 0, 1]) {
      const tip = T.clone().add(new THREE.Vector3(k * 0.14, -0.1, 0.25));
      const cone = new THREE.ConeGeometry(0.05, 0.32, 5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fdir.clone().add(new THREE.Vector3(0, -0.6, 0)).normalize());
      B.addGeo(cone, new THREE.Matrix4().compose(tip, q, new THREE.Vector3(1, 1, 1)), claw, [[bi(L.foot), 1]]);
    }
    const W = wing[side];
    const P = wingPts[side];
    limbTube(P.S, P.E, 0.3, 0.2, W.humerus, null, W.forearm, fl, 7, 5);
    limbTube(P.E, P.W, 0.2, 0.12, W.forearm, W.humerus, null, fl, 7, 5);
    for (const [f, tip] of [[W.finger1, P.F1], [W.finger2, P.F2], [W.finger3, P.F3]]) limbTube(P.W, tip, 0.1, 0.025, f, null, null, bk, 5, 5);
    // The thumb claw at the wrist (the films' wing-walker's hand).
    const tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(P.sx * 0.3, -0.2, 1).normalize());
    B.addGeo(new THREE.ConeGeometry(0.07, 0.45, 5), new THREE.Matrix4().compose(P.W.clone().add(new THREE.Vector3(0, 0, 0.2)), tq, new THREE.Vector3(1, 1, 1)), claw, [[bi(W.forearm), 1]]);
    // The membrane: panels between finger 1 and 2, 2 and 3, and finger 3 and the flank (shoulder to hip).
    const ribs = [
      { pts: (u) => P.W.clone().lerp(P.F1, u), w: () => [[bi(W.finger1), 1]] },
      { pts: (u) => P.W.clone().lerp(P.F2, u), w: () => [[bi(W.finger2), 1]] },
      { pts: (u) => P.W.clone().lerp(P.F3, u), w: () => [[bi(W.finger3), 1]] },
      {
        pts: (u) => new THREE.Vector3(P.sx * lerp(0.95, 0.9, u), lerp(0.45, 0.2, u), lerp(AT.shoulder - 0.3, AT.hip + 0.3, u)),
        w: (u) => spineWeights(lerp(AT.shoulder - 0.3, AT.hip + 0.3, u)),
      },
    ];
    const NU = 7;
    const NV = 6;
    for (let r = 0; r + 1 < ribs.length; r++) {
      const A0 = ribs[r];
      const B0 = ribs[r + 1];
      const base = B.count;
      for (let iu = 0; iu <= NU; iu++) {
        const u = iu / NU;
        const pa = A0.pts(u);
        const pb = B0.pts(u);
        for (let iv = 0; iv <= NV; iv++) {
          const v = iv / NV;
          const p = pa.clone().lerp(pb, v);
          // The trailing edge scallops in between the tips.
          const sag = Math.sin(v * Math.PI) * u * u * (r === 2 ? 1.6 : 0.9);
          const towardW = P.W.clone().sub(p);
          if (towardW.lengthSq() > 1e-6) p.addScaledVector(towardW.normalize(), sag);
          const ws = [];
          for (const [b, w] of A0.w(u)) ws.push([b, w * (1 - v)]);
          for (const [b, w] of B0.w(u)) ws.push([b, w * v]);
          // Near the arm the membrane follows the forearm and the humerus.
          const f = ss(0.3, 0, u) * (r === 2 ? 1 : 0.6);
          const armW = r === 2 ? [[bi(W.forearm), 1 - v], [bi(W.humerus), v]] : [[bi(W.forearm), 1]];
          const merged = new Map();
          for (const [b, w] of ws) merged.set(b, (merged.get(b) || 0) + w * (1 - f));
          for (const [b, w] of armW) merged.set(b, (merged.get(b) || 0) + w * f);
          const c = [C_MEMB.r * (0.9 + 0.2 * v), C_MEMB.g, C_MEMB.b];
          B.vert(p.toArray(), [0, 1, 0], [u * 4, v * 4], c, [...merged.entries()]);
        }
      }
      for (let iu = 0; iu < NU; iu++) {
        for (let iv = 0; iv < NV; iv++) {
          const p0 = base + iu * (NV + 1) + iv;
          const p1 = p0 + NV + 1;
          B.tri(p0, p1, p0 + 1);
          B.tri(p1, p1 + 1, p0 + 1);
        }
      }
    }
  }
  const geometry = B.build();
  // The membrane's normals were placeholders: recompute every normal from the faces (smooth enough for scales).
  geometry.computeVertexNormals();
  return { geometry, bones, root, spine, jaw, wing, leg, restInfo, quatFromDir };
}

/**
 * The scale texture: overlapping rounded scales in rows (grey, multiplied by the vertex colours), a darker edge and a
 * light ridge on each; the alpha is unused.
 */
export function makeScaleTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#6a6a6a';
  g.fillRect(0, 0, S, S);
  const rows = 8;
  const cols = 8;
  const sw = S / cols;
  const sh = S / rows;
  for (let r = rows; r >= -1; r--) {
    for (let k = -1; k <= cols; k++) {
      const x = (k + (r % 2) * 0.5) * sw;
      const y = r * sh;
      const grad = g.createRadialGradient(x, y - sh * 0.2, sw * 0.08, x, y, sw * 0.7);
      grad.addColorStop(0, '#d8d8d8');
      grad.addColorStop(0.55, '#a8a8a8');
      grad.addColorStop(0.85, '#6a6a6a');
      grad.addColorStop(1, '#383838');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, sw * 0.58, sh * 0.78, 0, 0, Math.PI);
      g.fill();
      g.strokeStyle = 'rgba(30,30,30,0.6)';
      g.lineWidth = 1.5;
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Linear values (a multiplier on the vertex colours, 0.2–0.85), not decoded as sRGB.
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}
