/* ==== surface/beds.js — the vegetable patch made from the spoil heap (TERV 0.11/16: "a földkupacból veteményes lesz
   (krumpli, gomba, paradicsom), ebből lesz az étel"): BED_SLOTS fixed beds south of the heap, each with its crop.
   Built once (vertex-coloured, one Lambert material shared with the neighbour), hidden until needed; src/shire sets
   what shows (pegs and string while locked, the raised bed once unlocked, the crop growing, the ripe crop). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SPOIL_POS } from './garden.js';

/**
 * The bed slots: world centre, the crop, the dug volume (m³, the spoil heap) that turns the soil into this bed.
 * South of the heap (it grows to r ≈ 2.7 m round SPOIL_POS), clear of the pit's rim beds and the bushes.
 */
export const BED_SLOTS = [
  { x: SPOIL_POS.x - 3.2, z: SPOIL_POS.z + 5.8, crop: 'krumpli', need: 4 },
  { x: SPOIL_POS.x - 0.4, z: SPOIL_POS.z + 5.8, crop: 'gomba', need: 15 },
  { x: SPOIL_POS.x + 2.4, z: SPOIL_POS.z + 5.8, crop: 'paradicsom', need: 35 },
];
export const BED_W = 2.2;
export const BED_D = 1.3;

const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const M = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tq.setFromEuler(te.set(0, ry, 0)), Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s));

/** Merges [geometry, hex, matrix] parts into one non-indexed vertex-coloured geometry. */
function merged(parts) {
  const out = parts.map(([g0, hex, m]) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (g.attributes.uv) g.deleteAttribute('uv');
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (m) g.applyMatrix4(m);
    return g;
  });
  const g = mergeGeometries(out);
  g.computeBoundingSphere();
  return g;
}

function rnd(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Pegs at the corners and a string round them: a bed marked out, not dug yet. */
function pegsGeo() {
  const parts = [];
  const hw = BED_W / 2;
  const hd = BED_D / 2;
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) parts.push([new THREE.BoxGeometry(0.04, 0.34, 0.04), 0xb89a70, M(x, 0.17, z)]);
  for (const [x, z, w, d] of [[0, -hd, BED_W, 0.008], [0, hd, BED_W, 0.008], [-hw, 0, 0.008, BED_D], [hw, 0, 0.008, BED_D]]) parts.push([new THREE.BoxGeometry(w, 0.008, d), 0xe8dcc0, M(x, 0.28, z)]);
  return merged(parts);
}

/** The raised bed: plank edging and dark turned soil with furrows (the heap's soil). */
function bedGeo() {
  const parts = [];
  parts.push([new THREE.BoxGeometry(BED_W, 0.18, BED_D), 0x4a3422, M(0, 0.09, 0)]);
  for (let k = -1; k <= 1; k++) parts.push([new THREE.CylinderGeometry(0.07, 0.07, BED_W - 0.2, 6, 1), 0x5a4030, new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(M(0, 0.18, k * 0.36, 0, [1, 1, 0.8]))]);
  for (const s of [-1, 1]) parts.push([new THREE.BoxGeometry(BED_W + 0.08, 0.24, 0.05), 0x8a6a42, M(0, 0.12, (s * BED_D) / 2)]);
  for (const s of [-1, 1]) parts.push([new THREE.BoxGeometry(0.05, 0.24, BED_D), 0x8a6a42, M((s * BED_W) / 2, 0.12, 0)]);
  return merged(parts);
}

/** The growing crop at full size (src/shire scales it up from the soil). Three rows along the furrows. */
function cropGeo(crop) {
  const r = rnd(crop.length * 977);
  const parts = [];
  for (let k = -1; k <= 1; k++) {
    for (let x = -BED_W / 2 + 0.3; x < BED_W / 2 - 0.15; x += 0.45) {
      const px = x + (r() - 0.5) * 0.08;
      const pz = k * 0.36 + (r() - 0.5) * 0.06;
      if (crop === 'krumpli') {
        // Potato haulm: a bushy clump of dark leaves.
        for (let j = 0; j < 4; j++) parts.push([new THREE.IcosahedronGeometry(0.075 + r() * 0.035, 1), j % 2 ? 0x3e6a22 : 0x4e7a2a, M(px + (r() - 0.5) * 0.14, 0.24 + r() * 0.12, pz + (r() - 0.5) * 0.14, r() * 3, [1, 0.7, 1])]);
      } else if (crop === 'gomba') {
        // Mushrooms in the soil: pale stems and brown caps.
        for (let j = 0; j < 2; j++) {
          const mx = px + (r() - 0.5) * 0.16;
          const mz = pz + (r() - 0.5) * 0.12;
          parts.push([new THREE.CylinderGeometry(0.02, 0.026, 0.1, 6), 0xf0e8d8, M(mx, 0.23, mz)]);
          parts.push([new THREE.SphereGeometry(0.065, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), j ? 0xb89a72 : 0xd8c8a8, M(mx, 0.27, mz, 0, [1, 0.7, 1])]);
        }
      } else {
        // Tomato plants on canes: a cane, leaves up its length.
        parts.push([new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4), 0xb89a70, M(px, 0.6, pz)]);
        for (let j = 0; j < 4; j++) parts.push([new THREE.IcosahedronGeometry(0.08 + r() * 0.03, 0), j % 2 ? 0x3e6a22 : 0x4a7a2a, M(px + (r() - 0.5) * 0.12, 0.3 + j * 0.17, pz + (r() - 0.5) * 0.12, r() * 3, [1, 0.8, 1])]);
      }
    }
  }
  return merged(parts);
}

/** What shows when the crop is ripe: red tomatoes, potatoes turned up at the haulms' feet, big mushroom caps. */
function ripeGeo(crop) {
  const r = rnd(crop.length * 331);
  const parts = [];
  for (let k = -1; k <= 1; k++) {
    for (let x = -BED_W / 2 + 0.3; x < BED_W / 2 - 0.15; x += 0.45) {
      const pz = k * 0.36;
      if (crop === 'paradicsom') {
        for (let j = 0; j < 3; j++) parts.push([new THREE.SphereGeometry(0.045, 7, 5), 0xd8302a, M(x + (r() - 0.5) * 0.16, 0.35 + r() * 0.45, pz + (r() - 0.5) * 0.14)]);
      } else if (crop === 'krumpli') {
        parts.push([new THREE.IcosahedronGeometry(0.05, 1), 0xb08a4a, M(x + 0.12, 0.19, pz + 0.1, r() * 3, [1.3, 0.8, 1])]);
        parts.push([new THREE.IcosahedronGeometry(0.1, 0), 0xb8a040, M(x, 0.36, pz, r() * 3, [1.1, 0.4, 1.1])]);
      } else {
        parts.push([new THREE.SphereGeometry(0.09, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xc8aa80, M(x + 0.1, 0.28, pz - 0.08, 0, [1, 0.6, 1])]);
      }
    }
  }
  return merged(parts);
}

/**
 * Builds the bed slots into `parent` (the surface root). Returns per slot { pegs, bed, crop, ripe } meshes (all hidden).
 * @param {THREE.Object3D} parent
 * @param {THREE.Material} mat a vertex-coloured Lambert material
 */
export function buildBeds(parent, mat) {
  const pegs = pegsGeo();
  const bed = bedGeo();
  const crops = {};
  for (const s of BED_SLOTS) if (!crops[s.crop]) crops[s.crop] = { grow: cropGeo(s.crop), ripe: ripeGeo(s.crop) };
  const group = new THREE.Group();
  group.name = 'shire-beds';
  parent.add(group);
  const out = BED_SLOTS.map((s, i) => {
    const mk = (g, name) => {
      const m = new THREE.Mesh(g, mat);
      m.name = `shire-bed${i}-${name}`;
      m.position.set(s.x, 0, s.z);
      m.visible = false;
      group.add(m);
      return m;
    };
    return { pegs: mk(pegs, 'pegs'), bed: mk(bed, 'bed'), crop: mk(crops[s.crop].grow, 'crop'), ripe: mk(crops[s.crop].ripe, 'ripe') };
  });
  return { group, slots: out };
}
