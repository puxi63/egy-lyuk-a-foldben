/* ==== underground/kit.js — the geometry kit of the buried set pieces: primitive builders with metre-scaled UVs,
   per-vertex colour with a little variation, and a collector that merges everything by group and material (one draw
   call each) and records simple colliders (oriented boxes, capsules) for the player's collision ==== */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise3 } from '../noise.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/** Box-projected UVs in metres from the local positions and normals (v runs along y on side faces: grain, courses). */
export function boxUV(geo, scale = 1) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Scales a geometry's existing UVs (for lathes and cylinders: u around × circumference, v along × length). */
export function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

/** Swaps u and v (wood grain along a geometry's u direction). */
export function swapUV(geo) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  return geo;
}

export const box = (w, h, d) => boxUV(new THREE.BoxGeometry(w, h, d));
export const sphere = (r, ws = 10, hs = 7) => boxUV(new THREE.SphereGeometry(r, ws, hs));

export function cyl(rt, rb, h, seg = 12, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  return scaleUV(g, Math.PI * (rt + rb), h);
}

/** Lathe from [[radius, y], ...] (bottom to top). */
export function lathe(profile, seg = 14) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
  let len = 0;
  for (let i = 1; i < profile.length; i++) len += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
  const rmax = Math.max(...profile.map((p) => p[0]));
  return swapUV(scaleUV(g, Math.PI * 2 * rmax, len));
}

export function torus(r, tube, rs = 5, ts = 16, arc = Math.PI * 2) {
  return scaleUV(new THREE.TorusGeometry(r, tube, rs, ts, arc), 1, 1);
}

/** A lumpy rock (an icosahedron displaced by noise), roughly radius r. */
export function rock(r, seed = 0, detail = 1, squash = 0.75) {
  const ico = new THREE.IcosahedronGeometry(r, detail);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  // Shared vertices: smooth normals instead of facets.
  const g = mergeVertices(ico);
  ico.dispose();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.75 + 0.5 * noise3(x / r * 1.6 + seed, y / r * 1.6, z / r * 1.6 - seed);
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return boxUV(g);
}

/**
 * A tapered tube along a polyline `pts` ([x, y, z]...) with radii from r0 to r1, `radial` sides; UV u around, v along
 * the length in metres (wood grain follows the root).
 */
export function tube(pts, r0, r1, radial = 6) {
  const n = pts.length;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  let len = 0;
  const T = new THREE.Vector3();
  let N = new THREE.Vector3(1, 0, 0);
  const B = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    a.fromArray(pts[Math.max(0, i - 1)]);
    b.fromArray(pts[Math.min(n - 1, i + 1)]);
    T.subVectors(b, a).normalize();
    // Parallel transport of the normal (no twisting).
    N.sub(T.clone().multiplyScalar(N.dot(T)));
    if (N.lengthSq() < 1e-6) N = Math.abs(T.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(T) : new THREE.Vector3(1, 0, 0).cross(T);
    N.normalize();
    B.crossVectors(T, N);
    if (i > 0) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const r = r0 + (r1 - r0) * (i / (n - 1));
    for (let k = 0; k <= radial; k++) {
      const ang = (k / radial) * Math.PI * 2;
      const cx = Math.cos(ang);
      const sx = Math.sin(ang);
      const nx = N.x * cx + B.x * sx;
      const ny = N.y * cx + B.y * sx;
      const nz = N.z * cx + B.z * sx;
      pos.push(pts[i][0] + nx * r, pts[i][1] + ny * r, pts[i][2] + nz * r);
      nor.push(nx, ny, nz);
      uv.push((k / radial) * Math.PI * 2 * Math.max(r, 0.03), len);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const p0 = i * (radial + 1) + k;
      const p1 = p0 + radial + 1;
      idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Adds a colour attribute: `rgb` with a little positional variation (`jitter`). */
export function colorize(geo, rgb, jitter = 0.08) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (noise3(p.getX(i) * 3.1 + 7, p.getY(i) * 3.1, p.getZ(i) * 3.1) - 0.5) * 2 * jitter;
    c[i * 3] = rgb[0] * k;
    c[i * 3 + 1] = rgb[1] * k;
    c[i * 3 + 2] = rgb[2] * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

/** Hex colour → linear-ish [r, g, b] in 0..1 (the values are used directly as vertex colours). */
export function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/**
 * Collects parts per group and material, and colliders. `at(x, y, z, yaw)` sets the placement frame for the parts and
 * colliders that follow (local coordinates inside it).
 */
export class Kit {
  constructor() {
    /** group → material → [geometry] */
    this.groups = new Map();
    /** World colliders: { t: 'box', x, y, z, hx, hy, hz, c, s, br } or { t: 'cap', a, b, r, br } (br: bound radius). */
    this.colliders = [];
    this.group = 'l1';
    this.frame = new THREE.Matrix4();
    this.yaw = 0;
    this.origin = new THREE.Vector3();
    this.tris = 0;
  }

  at(x, y, z, yaw = 0) {
    this.origin.set(x, y, z);
    this.yaw = yaw;
    this.frame.makeRotationY(yaw).setPosition(x, y, z);
    return this;
  }

  /** Local point → world [x, y, z]. */
  world(lx, ly, lz) {
    tmpP.set(lx, ly, lz).applyMatrix4(this.frame);
    return [tmpP.x, tmpP.y, tmpP.z];
  }

  /**
   * Adds a geometry with colour `color` (hex or [r, g, b]) to material `mat`, placed at local (x, y, z) with rotations
   * (rx, ry, rz, order YXZ) and scale `s` (number or [sx, sy, sz]).
   */
  part(mat, geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, jitter = 0.08) {
    if (!geo.attributes.color) colorize(geo, Array.isArray(color) ? color : rgb(color), jitter);
    tmpE.set(rx, ry, rz, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    if (Array.isArray(s)) tmpS.set(s[0], s[1], s[2]);
    else tmpS.set(s, s, s);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS);
    geo.applyMatrix4(tmpM);
    geo.applyMatrix4(this.frame);
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    let mats = this.groups.get(this.group);
    if (!mats) {
      mats = new Map();
      this.groups.set(this.group, mats);
    }
    if (!mats.has(mat)) mats.set(mat, []);
    mats.get(mat).push(g);
    this.tris += g.attributes.position.count / 3;
    return g;
  }

  /** An oriented box collider (local centre and half sizes, turned with the frame's yaw plus `yaw`). */
  boxCollider(x, y, z, hx, hy, hz, yaw = 0) {
    const [wx, wy, wz] = this.world(x, y, z);
    const a = this.yaw + yaw;
    const c = { t: 'box', x: wx, y: wy, z: wz, hx, hy, hz, c: Math.cos(a), s: Math.sin(a), br: Math.hypot(hx, hy, hz), on: true };
    this.colliders.push(c);
    return c;
  }

  /** A capsule collider between two local points. */
  capCollider(a, b, r) {
    const wa = this.world(a[0], a[1], a[2]);
    const wb = this.world(b[0], b[1], b[2]);
    const c = { t: 'cap', a: wa, b: wb, r, x: (wa[0] + wb[0]) / 2, y: (wa[1] + wb[1]) / 2, z: (wa[2] + wb[2]) / 2, on: true };
    c.br = Math.hypot(wa[0] - wb[0], wa[1] - wb[1], wa[2] - wb[2]) / 2 + r;
    this.colliders.push(c);
    return c;
  }

  /** Merged geometry per group and material: Map(group → Map(mat → BufferGeometry)). */
  merge() {
    const out = new Map();
    for (const [group, mats] of this.groups) {
      const m = new Map();
      for (const [mat, list] of mats) {
        for (const g of list) {
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        }
        const merged = mergeGeometries(list);
        for (const g of list) g.dispose();
        merged.computeBoundingSphere();
        m.set(mat, merged);
      }
      out.set(group, m);
    }
    return out;
  }
}

/** Signed distance (m, positive inside) of a collider at a world point. */
export function colliderSdf(c, x, y, z) {
  if (c.t === 'box') {
    const dx = x - c.x;
    const dz = z - c.z;
    const lx = Math.abs(dx * c.c - dz * c.s) - c.hx;
    const lz = Math.abs(dx * c.s + dz * c.c) - c.hz;
    const ly = Math.abs(y - c.y) - c.hy;
    const ox = Math.max(lx, 0);
    const oy = Math.max(ly, 0);
    const oz = Math.max(lz, 0);
    return -(Math.hypot(ox, oy, oz) + Math.min(Math.max(lx, ly, lz), 0));
  }
  const a = c.a;
  const b = c.b;
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const vz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy + (z - a[2]) * vz) / (vx * vx + vy * vy + vz * vz || 1)));
  return c.r - Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t, z - a[2] - vz * t);
}
