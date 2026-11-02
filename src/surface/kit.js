/* ==== surface/kit.js — building blocks for the Shire surface: seeded randomness, the static geometry batch (merged by
   material, one draw call each), instanced fields and small geometry helpers ==== */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2, rng } from '../noise.js';

export { noise2, rng };

/** Block of the diggable pit (x, z ∈ [−12, 12]): nothing of the surface may stand inside it. */
export const PIT_HALF = 12;

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Two-octave 2D value noise in [0, 1). */
export function fbm2(x, z) {
  return (noise2(x, z) * 0.6 + noise2(x * 2.07 + 13.1, z * 2.07 - 7.3) * 0.3 + noise2(x * 4.3 - 3.7, z * 4.3 + 9.1) * 0.1);
}

/** True when a point (with a margin) touches the pit block. */
export function inPit(x, z, margin = 0.3) {
  return Math.abs(x) < PIT_HALF + margin && Math.abs(z) < PIT_HALF + margin;
}

/** Heavy batch keys that are split into sectors (the light ones stay single meshes: fewer draw calls). */
const SECTORED = new Set(['foliage', 'plain', 'wood', 'darkwood', 'tuft', 'leaves', 'bark']);

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/** Matrix from a position, Euler rotation (radians, XYZ order unless given) and scale (number or [x, y, z]). */
export function trs(x, y, z, rx = 0, ry = 0, rz = 0, s = 1, order = 'YXZ') {
  tmpE.set(rx, ry, rz, order);
  tmpQ.setFromEuler(tmpE);
  if (Array.isArray(s)) tmpS.set(s[0], s[1], s[2]);
  else tmpS.set(s, s, s);
  return new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS);
}

/**
 * Collects static geometry per material and merges it into one mesh per material (one draw call each).
 * Every piece gets a vertex colour (base colour × a ground-contact darkening × a small random tint), so a handful of
 * textured materials can show many differently coloured parts.
 */
export class Batch {
  constructor(seed = 1) {
    this.parts = new Map();
    this.rand = rng(seed);
  }

  /**
   * @param {string} key material key (see SurfaceMats)
   * @param {THREE.BufferGeometry} geo indexed geometry with position / normal / uv (consumed)
   * @param {number|THREE.Color|number[]} color base colour
   * @param {THREE.Matrix4} [m] placement
   * @param {object} [o] { ao: metres of contact darkening above the ground (0 = none), aoMin, jitter, groundY, alpha }
   */
  add(key, geo, color = 0xffffff, m = null, o = {}) {
    let g = geo.index ? geo : geo;
    if (!g.index) {
      const idx = [];
      for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
      g.setIndex(idx);
    }
    if (m) g.applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = color instanceof THREE.Color ? color : Array.isArray(color) ? new THREE.Color(color[0], color[1], color[2]) : new THREE.Color(color);
    const jit = o.jitter ?? 0.06;
    const j = 1 - jit / 2 + this.rand() * jit;
    const n = g.attributes.position.count;
    const pos = g.attributes.position.array;
    const hasOwn = !!g.attributes.color;
    const own = hasOwn ? g.attributes.color : null;
    const cols = new Float32Array(n * 4);
    const ao = o.ao ?? 0.5;
    const aoMin = o.aoMin ?? 0.55;
    const gy = o.groundY ?? 0;
    const alpha = o.alpha ?? 1;
    for (let i = 0; i < n; i++) {
      const k = ao > 0 ? aoMin + (1 - aoMin) * smoothstep(0, ao, pos[i * 3 + 1] - gy) : 1;
      let r = c.r;
      let gg = c.g;
      let b = c.b;
      if (own) {
        r *= own.getX(i);
        gg *= own.getY(i);
        b *= own.getZ(i);
      }
      cols[i * 4] = r * k * j;
      cols[i * 4 + 1] = gg * k * j;
      cols[i * 4 + 2] = b * k * j;
      cols[i * 4 + 3] = own && own.itemSize === 4 ? own.getW(i) * alpha : alpha;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 4));
    // Spatial sectors (near the pit / four far quadrants) so frustum culling can skip what is behind the camera.
    let full = key;
    if (SECTORED.has(key)) {
      g.computeBoundingSphere();
      const c0 = g.boundingSphere.center;
      const d = Math.hypot(c0.x, c0.z);
      full = d < 40 ? `${key}|near` : `${key}|far${Math.floor(((Math.atan2(c0.z, c0.x) + Math.PI) / (Math.PI * 2)) * 4) % 4}`;
    }
    if (!this.parts.has(full)) this.parts.set(full, []);
    this.parts.get(full).push(g);
    return g;
  }

  /** Merges every material group into one mesh and adds it to the scene. Returns { key: mesh }. */
  build(scene, mats, name = 'surface') {
    const out = {};
    for (const [full, list] of this.parts) {
      const key = full.split('|')[0];
      const mat = mats[key];
      if (!mat) throw new Error(`surface: no material "${key}"`);
      const merged = mergeGeometries(list);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}-${full.replace('|', '-')}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      scene.add(mesh);
      out[full] = mesh;
      for (const g of list) g.dispose();
    }
    this.parts.clear();
    return out;
  }
}

/**
 * One instanced mesh for many copies of a small model (flowers, cabbages, posts, distant trees).
 * @param {Array<{m: THREE.Matrix4, c?: THREE.Color}>} items
 */
export function instanced(scene, geo, mat, items, name) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.name = name;
  mesh.count = items.length;
  const white = new THREE.Color(1, 1, 1);
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    mesh.setColorAt(i, it.c || white);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return mesh;
}

/** Paints a whole geometry with one colour (vec3 attribute), for models that are later merged or instanced. */
export function paint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** Merges small painted parts into one model geometry (all must carry position / normal / uv / color). */
export function model(parts) {
  for (const g of parts) {
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.index) {
      const idx = [];
      for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
      g.setIndex(idx);
    }
  }
  return mergeGeometries(parts);
}

/** A box whose UVs are scaled to metres (so a tiling texture keeps its size on long planks and walls). */
export function box(w, h, d, uvScale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // Face order: +x, −x, +y, −y, +z, −z; 4 vertices each.
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] * uvScale, uv.getY(i) * dims[f][1] * uvScale);
    }
  }
  return g;
}

/** A cylinder (or cone) with UVs in metres around and along. */
export function cyl(rTop, rBot, h, seg = 10, uvScale = 1, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = g.attributes.uv;
  const around = Math.PI * (rTop + rBot);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around * uvScale, uv.getY(i) * h * uvScale);
  return g;
}

/**
 * Displaces every vertex of a geometry along its normal by noise (lumpy hedges, canopies and rocks). Unindexed
 * geometries (icosahedra) are welded first, so the result is smooth-shaded; their UVs become planar (x + z, y).
 */
export function lumpy(geo, amount, freq, seed = 0) {
  if (!geo.index) {
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    const welded = mergeVertices(geo, 1e-4);
    geo.setIndex(welded.index);
    geo.setAttribute('position', welded.attributes.position);
    geo.computeVertexNormals();
    const wp = welded.attributes.position;
    const uv = new Float32Array(wp.count * 2);
    for (let i = 0; i < wp.count; i++) {
      uv[i * 2] = wp.getX(i) + wp.getZ(i);
      uv[i * 2 + 1] = wp.getY(i);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = (noise2(x * freq + seed, z * freq - y * 0.7 * freq) - 0.5) * 2 * amount;
    p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Darkens the lower part of a geometry's vertex colours (shade under canopies and at the foot of a hedge). */
export function shadeBelow(geo, y0, y1, min = 0.55) {
  const p = geo.attributes.position;
  const c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = min + (1 - min) * smoothstep(y0, y1, p.getY(i));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return geo;
}

/** A thin vertical quad (for washing on the line, signs and boards), UVs 0–1 or the given atlas rectangle. */
export function quad(w, h, rect = null) {
  const g = new THREE.PlaneGeometry(w, h);
  if (rect) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * rect[2], rect[1] + uv.getY(i) * rect[3]);
  }
  return g;
}

/** A tube along a list of points (ropes, the washing line, wheelbarrow handles). */
export function tube(points, r, seg = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))));
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 4), r, seg, false);
}

export { tmpM };
