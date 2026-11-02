/* ==== surface/trees.js — the Shire's trees as on the film set: branching trunks (the great oak above Bag End, the
   Party Tree, garden fruit trees, meadow trees, poplars, the far trees on the hills), each limb ending in leaf
   clusters made of a dark inner mass and crossed alpha-cut leaf cards (canopy normals, colour varied by cluster and by
   depth in the crown, swaying in the wind in the vertex shader). Everything goes into the static batch: per tree one
   geometry per material (bark, leaves, foliage), so the batch's sectors still cull them. The far trees are built at a
   lower level of detail by construction (they always stand beyond the walkable meadow). ==== */
import * as THREE from 'three';
import { cyl, lumpy, rng, smoothstep } from './kit.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

/** Appends many small geometries (each with its own colour) into one geometry: one batch.add per tree and material. */
export class Accum {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }

  get empty() {
    return this.idx.length === 0;
  }

  /**
   * Adds `geo` (indexed or not) transformed by `m`, painted `color` (THREE.Color); `normalFn(p, n)` may rewrite the
   * normal and `colorFn(p, c)` the colour of each vertex (world position p).
   */
  add(geo, m, color, normalFn = null, colorFn = null) {
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const t = geo.attributes.uv;
    const base = this.pos.length / 3;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    const w = new THREE.Vector3();
    const c = color.clone();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      if (n) w.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      else w.set(0, 1, 0);
      if (normalFn) normalFn(v, w);
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(w.x, w.y, w.z);
      this.uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
      if (colorFn) {
        c.copy(color);
        colorFn(v, c);
      }
      this.col.push(c.r, c.g, c.b);
    }
    if (geo.index) for (const i of geo.index.array) this.idx.push(base + i);
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    geo.dispose();
  }

  /** The accumulated geometry (position, normal, uv, colour; indexed). */
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** A unit quad (1 × 1, centred) for the leaf and flora cards. */
function cardQuad(w, h) {
  return new THREE.PlaneGeometry(w, h);
}

/**
 * Leaf cards round a centre: `count` crossed quads of size `size` at random orientations, their normals bent out
 * from `normalC` (the crown's centre: the whole crown shades like one soft dome, not like flat cards).
 */
export function leafCards(acc, cx, cy, cz, size, count, rand, color, normalC, normalR) {
  for (let k = 0; k < count; k++) {
    const q = cardQuad(size, size);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((rand() - 0.5) * 2.2, rand() * Math.PI, (rand() - 0.5) * 2.2, 'YXZ'));
    m.setPosition(cx + (rand() - 0.5) * size * 0.25, cy + (rand() - 0.5) * size * 0.2, cz + (rand() - 0.5) * size * 0.25);
    acc.add(q, m, color, (p, n) => {
      n.set((p.x - normalC.x) / normalR, (p.y - normalC.y) / normalR + 0.35, (p.z - normalC.z) / normalR).normalize();
    }, (p, c) => {
      // Each card a little darker at its lower edge and towards the crown's core (depth inside the foliage).
      const k = 0.78 + 0.3 * smoothstep(-0.6, 0.8, (p.y - normalC.y) / normalR) * (0.6 + 0.4 * Math.min(1, p.distanceTo(normalC) / normalR));
      c.multiplyScalar(k);
    });
  }
}

/** Tree kinds: trunk to the first fork, its radius, limbs, how far they spread and rise, leaf cluster size. */
const KINDS = {
  // The great oak above Bag End: a huge, low, wide-spreading crown on a massive trunk.
  oak: { trunkH: 3.6, trunkR: 0.75, limbs: 6, tilt: [0.75, 1.15], len: 5.4, depth: 3, kids: 3, rise: 0.22, cluster: 1.7, cards: 4, seg: [10, 7, 5, 4], mass: true },
  // The Party Tree: like an oak, broader still.
  party: { trunkH: 3.2, trunkR: 0.75, limbs: 7, tilt: [0.85, 1.2], len: 5.8, depth: 3, kids: 3, rise: 0.18, cluster: 1.6, cards: 4, seg: [10, 7, 5, 4], mass: true },
  // Garden fruit trees and the meadow trees: a short trunk and a rounded crown.
  round: { trunkH: 1.6, trunkR: 0.22, limbs: 4, tilt: [0.45, 0.85], len: 2.3, depth: 2, kids: 3, rise: 0.3, cluster: 1.15, cards: 4, seg: [8, 5, 4], mass: true },
  // Lombardy-like poplars: a tall leader with short upswept branches.
  poplar: { trunkH: 1.0, trunkR: 0.2, limbs: 0, tilt: [0.25, 0.45], len: 1.4, depth: 1, kids: 0, rise: 0.6, cluster: 1.0, cards: 2, seg: [6, 4], mass: true, leader: 8.5 },
  // Far trees on the hills: fewer limbs, fewer cards (seen from 60–140 m).
  far: { trunkH: 1.9, trunkR: 0.24, limbs: 3, tilt: [0.5, 0.9], len: 2.3, depth: 1, kids: 0, rise: 0.25, cluster: 1.75, cards: 2, seg: [4, 3], mass: true, lod: true },
  farPoplar: { trunkH: 1.0, trunkR: 0.2, limbs: 0, tilt: [0.25, 0.4], len: 1.2, depth: 1, kids: 0, rise: 0.6, cluster: 1.2, cards: 1, seg: [4, 3], mass: true, leader: 7.5, lod: true },
};

/** A tapering limb segment from a to b (open cylinder, bark UVs in metres). */
function segment(acc, a, b, ra, rb, seg, color) {
  const d = tmpV.subVectors(b, a);
  const len = d.length();
  if (len < 1e-4) return;
  const g = cyl(rb, ra, len + ra * 0.6, seg, 0.8, true);
  g.translate(0, (len + ra * 0.6) / 2 - ra * 0.3, 0);
  tmpQ.setFromUnitVectors(UP, d.normalize());
  tmpM.makeRotationFromQuaternion(tmpQ).setPosition(a.x, a.y, a.z);
  acc.add(g, tmpM, color);
}

/**
 * One Shire tree into the batch at (x, y, z) (y = ground height there), scaled `s`.
 * kind: 'oak' (the great oak above Bag End), 'party' (the Party Tree), 'round' (garden and meadow trees), 'poplar',
 * 'far', 'farPoplar'. Returns { top, x, z, trunkR } (top: the crown's top height, trunkR: the trunk radius at the
 * ground, for the collider).
 */
export function shireTree(batch, x, y, z, s = 1, kind = 'round', seed = 1) {
  const K = KINDS[kind] || KINDS.round;
  const r = rng(seed * 97 + 13);
  const bark = new Accum();
  const leaves = new Accum();
  const mass = new Accum();
  const barkCol = new THREE.Color().setHSL(0.08 + r() * 0.02, 0.12 + r() * 0.06, 0.42 + r() * 0.08);
  const clusters = [];
  const yaw0 = r() * Math.PI * 2;

  /** Grows a limb from p along dir; records leaf clusters at the twig ends. */
  const grow = (p, dir, len, r0, depth) => {
    const n = depth === 0 ? 3 : 2;
    const r1 = r0 * (depth + 1 >= K.depth ? 0.35 : 0.55);
    let a = p.clone();
    const d = dir.clone();
    const pts = [a.clone()];
    for (let k = 0; k < n; k++) {
      const b = a.clone().addScaledVector(d, len / n);
      const ra = r0 + (r1 - r0) * (k / n);
      const rb = r0 + (r1 - r0) * ((k + 1) / n);
      segment(bark, a, b, ra, rb, K.seg[Math.min(depth + 1, K.seg.length - 1)], barkCol);
      a = b;
      pts.push(a.clone());
      // Bend: limbs droop a little and turn up towards the light at the tips (oaks: long, near-level limbs).
      d.x += (r() - 0.5) * 0.35;
      d.z += (r() - 0.5) * 0.35;
      d.y += K.rise * (k + 1) * 0.5 - 0.08;
      d.normalize();
    }
    if (depth + 1 >= K.depth || K.kids === 0) {
      // Twig end: a cluster at the tip and one or two along the last part.
      const cs = K.cluster * s * (0.85 + r() * 0.3);
      clusters.push({ p: a.clone().addScaledVector(d, cs * 0.3), s: cs });
      if (!K.lod || r() < 0.5) clusters.push({ p: pts[n - 1].clone().lerp(a, 0.4).add(new THREE.Vector3((r() - 0.5) * cs, cs * 0.3, (r() - 0.5) * cs)), s: cs * 0.85 });
      return;
    }
    // Leaves along the outer half of the branches too (the crown is full, not leaves only at the tips).
    if (depth >= 1 && !K.lod) {
      const cs = K.cluster * s * (0.75 + r() * 0.25);
      clusters.push({ p: pts[0].clone().lerp(a, 0.55 + r() * 0.2).add(new THREE.Vector3((r() - 0.5) * cs, cs * 0.35, (r() - 0.5) * cs)), s: cs });
    }
    for (let c = 0; c < K.kids; c++) {
      const t = c === K.kids - 1 ? 1 : 0.45 + r() * 0.4;
      const sp = pts[0].clone().lerp(a, t);
      const az = Math.atan2(d.z, d.x) + (c - (K.kids - 1) / 2) * 0.9 + (r() - 0.5) * 0.5;
      const cd = new THREE.Vector3(Math.cos(az), d.y + 0.25 + r() * 0.35, Math.sin(az)).normalize();
      grow(sp, cd, len * (0.5 + r() * 0.2), r1 * (0.7 + r() * 0.2), depth + 1);
    }
  };

  const trunkTop = new THREE.Vector3(x, y + K.trunkH * s, z);
  const tR = K.trunkR * s;
  // The trunk: slightly leaning, flared at the root (oaks), tapering to the fork.
  const lean = new THREE.Vector3((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize();
  const trunkTopL = new THREE.Vector3(x, y, z).addScaledVector(lean, K.trunkH * s);
  segment(bark, new THREE.Vector3(x, y - 0.3, z), trunkTopL, tR, tR * (K.leader ? 0.8 : 0.72), K.seg[0], barkCol);
  if (kind === 'oak' || kind === 'party') {
    // Root buttresses.
    for (let i = 0; i < 5; i++) {
      const a = yaw0 + (i / 5) * Math.PI * 2;
      const foot = new THREE.Vector3(x + Math.cos(a) * tR * 1.9, y - 0.15, z + Math.sin(a) * tR * 1.9);
      segment(bark, foot, new THREE.Vector3(x + Math.cos(a) * tR * 0.3, y + 1.1 * s, z + Math.sin(a) * tR * 0.3), tR * 0.45, tR * 0.3, 5, barkCol);
    }
  }
  trunkTop.copy(trunkTopL);
  if (K.leader) {
    // Poplar: a leader to the top with short upswept branches all the way.
    const top = trunkTop.clone().setY(y + K.leader * s);
    segment(bark, trunkTop, top, tR * 0.8, tR * 0.25, K.seg[0], barkCol);
    const n = K.lod ? 6 : 11;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = trunkTop.clone().lerp(top, t);
      const a = yaw0 + i * 2.4;
      const tilt = K.tilt[0] + r() * (K.tilt[1] - K.tilt[0]);
      const d = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      grow(p, d, K.len * s * (1.1 - t * 0.6), tR * 0.3, K.depth - 1);
    }
    clusters.push({ p: top.clone(), s: K.cluster * s });
  } else {
    for (let i = 0; i < K.limbs; i++) {
      const a = yaw0 + (i / K.limbs) * Math.PI * 2 + (r() - 0.5) * 0.6;
      const tilt = K.tilt[0] + r() * (K.tilt[1] - K.tilt[0]);
      const d = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      // Limbs leave the trunk at staggered heights (the lower ones longer and more level).
      const p = new THREE.Vector3(x, y, z).addScaledVector(lean, K.trunkH * s * (0.78 + 0.22 * (i % 3) / 2));
      grow(p, d, K.len * s * (0.85 + r() * 0.3), tR * 0.62, 0);
    }
    // A leader in the middle so the crown has no hole on top.
    const d = new THREE.Vector3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3).normalize();
    grow(trunkTop, d, K.len * s * 0.6, tR * 0.5, Math.max(0, K.depth - 2));
  }

  // The crown: centre and radius (for the leaf normals and the depth shading).
  const C = new THREE.Vector3();
  for (const c of clusters) C.add(c.p);
  C.multiplyScalar(1 / Math.max(1, clusters.length));
  let R = 0.1;
  let top = y;
  for (const c of clusters) {
    R = Math.max(R, c.p.distanceTo(C) + c.s * 0.5);
    top = Math.max(top, c.p.y + c.s * 0.6);
  }
  const hue = kind === 'poplar' || kind === 'farPoplar' ? 0.25 : 0.22 + r() * 0.03;
  for (const c of clusters) {
    // Darker deep inside and low in the crown, sunlit yellow-greens on the outer top.
    const out = smoothstep(0.15, 0.95, c.p.distanceTo(C) / R);
    const high = smoothstep(C.y - R * 0.7, C.y + R * 0.7, c.p.y);
    const k = 0.55 + 0.28 * out + 0.22 * high;
    const col = new THREE.Color().setHSL(hue + (r() - 0.5) * 0.04, 0.42 + r() * 0.15, 0.62 * k + (r() - 0.5) * 0.05);
    col.r = Math.min(1.2, col.r * 1.35);
    col.g = Math.min(1.2, col.g * 1.35);
    leafCards(leaves, c.p.x, c.p.y, c.p.z, c.s * (K.lod ? 1.6 : 1.5), K.cards, r, col, C, R);
    if (K.mass) {
      // The dark inner mass: no see-through crowns, and a shadowed core between the cards.
      // Small and pulled in towards the crown's core, so the cards hide its facets.
      const g = new THREE.IcosahedronGeometry(c.s * (K.lod ? 0.5 : 0.36), 0);
      lumpy(g, c.s * 0.08, 1.3 / c.s, seed + clusters.indexOf(c));
      const mc = new THREE.Color().setHSL(hue + 0.01, 0.45, 0.16 + 0.1 * k);
      const mp = c.p.clone().lerp(C, K.lod ? 0.05 : 0.18);
      mass.add(g, tmpM.makeTranslation(mp.x, mp.y - c.s * 0.1, mp.z), mc, (p, n) => {
        n.set((p.x - C.x) / R, (p.y - C.y) / R + 0.3, (p.z - C.z) / R).normalize();
      });
    }
  }
  if (!bark.empty) batch.add('bark', bark.geometry(), 0xffffff, null, { ao: K.lod ? 0 : 1.2 * s, aoMin: 0.55, groundY: y, jitter: 0.05 });
  if (!leaves.empty) batch.add('leaves', leaves.geometry(), 0xffffff, null, { ao: 0, jitter: 0.06 });
  if (!mass.empty) batch.add('foliage', mass.geometry(), 0xffffff, null, { ao: 0, jitter: 0.05 });
  return { top, x, z, trunkR: tR };
}
