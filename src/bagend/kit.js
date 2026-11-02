/* ==== bagend/kit.js — geometry builder for the interior: primitives baked into flat arrays (one material, one atlas) ====
 * Every primitive is written with its atlas tile, a linear tint, the room index and a kind (material.js) into a
 * "part" (opaque or glass). A finished part is a chunk of typed arrays; chunks of the same room are concatenated into
 * one BufferGeometry (index.js), so a furnished room is a single draw call and buying a tier only re-concatenates.
 * UV modes: 'planar' (default: the object's own scaled coordinates projected along the dominant normal axis, divided
 * by the tile's metres per repeat), 'metric' (the geometry's uv taken as metres), 'native' (the geometry's uv × u, v
 * repeats) and 'face' (the geometry's uv once across the tile, for pictures). */
import * as THREE from 'three';
import { TILES } from './atlas.js';

const tmpM = new THREE.Matrix4();
const tmpN = new THREE.Matrix3();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

/** A growing set of vertex arrays for one material. */
class Part {
  constructor() {
    this.reset();
  }

  reset() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.tile = [];
    this.info = [];
    this.idx = [];
  }

  get count() {
    return this.pos.length / 3;
  }

  /** Returns the arrays as a typed chunk and empties the part. */
  take() {
    const c = {
      pos: new Float32Array(this.pos), nor: new Float32Array(this.nor), uv: new Float32Array(this.uv),
      col: new Float32Array(this.col), tile: new Float32Array(this.tile), info: new Float32Array(this.info),
      idx: new Uint32Array(this.idx),
    };
    this.reset();
    return c;
  }
}

/** Linear colour from a hex number, an [r, g, b] array (linear) or a THREE.Color. */
function toLinear(t) {
  if (t == null) return [1, 1, 1];
  if (Array.isArray(t)) return t;
  if (t.isColor) return [t.r, t.g, t.b];
  tmpC.set(t);
  return [tmpC.r, tmpC.g, tmpC.b];
}

export class Builder {
  /** @param {THREE.Vector3} origin world position of the interior's local origin */
  constructor(origin) {
    this.opaque = new Part();
    this.glass = new Part();
    this.room = 0;
    this.stack = [new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z)];
  }

  /** Pushes a local frame (position + yaw) onto the transform stack. */
  push(x = 0, y = 0, z = 0, ry = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m));
    return this;
  }

  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  /** Runs fn inside a local frame. */
  at(x, y, z, ry, fn) {
    this.push(x, y, z, ry);
    fn(this);
    this.pop();
    return this;
  }

  /**
   * Adds a THREE.BufferGeometry (consumed: it is disposed). Options:
   * x, y, z, rx, ry, rz (local placement), s or sx/sy/sz (scale, applied before the UV projection), tile, tint,
   * uv ('planar' | 'metric' | 'native' | 'face'), u, v (repeats for 'native'), kind (0 lit, 1 emissive, 2 flame,
   * 3 lit without dust), glass (goes into the transparent part), room (overrides the builder's current room).
   */
  add(geo, o = {}) {
    const g = geo;
    const sx = o.sx ?? o.s ?? 1;
    const sy = o.sy ?? o.s ?? 1;
    const sz = o.sz ?? o.s ?? 1;
    if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
    const tile = TILES[o.tile || 'plain'];
    if (!tile) throw new Error(`bagend: unknown tile ${o.tile}`);
    const P = g.attributes.position;
    if (!g.attributes.normal) g.computeVertexNormals();
    const Nn = g.attributes.normal;
    const U = g.attributes.uv;
    const mode = o.uv || 'planar';
    const m = tile.m || [1, 1];
    const n = P.count;
    const part = o.glass ? this.glass : this.opaque;
    const base = part.count;
    tmpM.compose(tmpV.set(o.x || 0, o.y || 0, o.z || 0), tmpQ.setFromEuler(tmpE.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'YXZ')), tmpS.set(1, 1, 1));
    tmpM.premultiply(this.stack[this.stack.length - 1]);
    tmpN.getNormalMatrix(tmpM);
    const col = toLinear(o.tint);
    const shade = o.shade ?? 1;
    const room = o.room ?? this.room;
    const kind = o.kind || 0;
    const r = tile.rect;
    const v = new THREE.Vector3();
    const nn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i);
      nn.fromBufferAttribute(Nn, i);
      let u0;
      let v0;
      if (mode === 'planar') {
        const ax = Math.abs(nn.x);
        const ay = Math.abs(nn.y);
        const az = Math.abs(nn.z);
        if (ay >= ax && ay >= az) {
          u0 = v.x;
          v0 = v.z;
        } else if (ax >= az) {
          u0 = v.z;
          v0 = v.y;
        } else {
          u0 = v.x;
          v0 = v.y;
        }
        u0 /= m[0];
        v0 /= m[1];
      } else if (mode === 'metric') {
        u0 = U.getX(i) / m[0];
        v0 = U.getY(i) / m[1];
      } else if (mode === 'native') {
        u0 = U.getX(i) * (o.u ?? 1);
        v0 = U.getY(i) * (o.v ?? 1);
      } else {
        u0 = 0.0008 + Math.min(1, Math.max(0, U.getX(i))) * 0.9984;
        v0 = 0.0008 + Math.min(1, Math.max(0, U.getY(i))) * 0.9984;
      }
      if (o.flipU) u0 = -u0;
      v.applyMatrix4(tmpM);
      nn.applyMatrix3(tmpN).normalize();
      part.pos.push(v.x, v.y, v.z);
      part.nor.push(nn.x, nn.y, nn.z);
      part.uv.push(u0 + (o.du || 0), v0 + (o.dv || 0));
      part.col.push(col[0] * shade, col[1] * shade, col[2] * shade);
      part.tile.push(r[0], r[1], r[2], r[3]);
      part.info.push(room, kind);
    }
    if (g.index) {
      const I = g.index.array;
      for (let i = 0; i < I.length; i++) part.idx.push(base + I[i]);
    } else {
      for (let i = 0; i < n; i++) part.idx.push(base + i);
    }
    g.dispose();
    return this;
  }

  /** Box of w × h × d with its base at y (o.y is the bottom, not the centre, unless o.center). */
  box(w, h, d, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (!o.center) g.translate(0, h / 2, 0);
    return this.add(g, o);
  }

  /** Cylinder standing on y (bottom at o.y unless o.center). */
  cyl(rt, rb, h, seg = 12, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open, o.t0 || 0, o.tl || Math.PI * 2);
    if (!o.center) g.translate(0, h / 2, 0);
    return this.add(g, { uv: 'native', u: o.u ?? Math.max(1, Math.round((Math.PI * 2 * Math.max(rt, rb)) / ((TILES[o.tile || 'plain'].m || [1])[0]))), v: o.v ?? h / ((TILES[o.tile || 'plain'].m || [1, 1])[1]), ...o });
  }

  sphere(r, o = {}, ws = 12, hs = 8) {
    return this.add(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, o.p0 || 0, o.pl || Math.PI), { uv: 'native', u: 2, v: 1, ...o });
  }

  /** Lathe from [radius, height] pairs. */
  lathe(pts, seg = 12, o = {}) {
    // Profiles must run bottom to top for outward normals.
    if (pts.length > 1 && pts[0][1] > pts[pts.length - 1][1]) pts = pts.slice().reverse();
    return this.add(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg), { uv: 'native', u: 1, v: 1, ...o });
  }

  /** Flat disc in the XZ plane facing up (rotate with rx for other orientations). */
  disc(r, seg = 20, o = {}) {
    const g = new THREE.CircleGeometry(r, seg);
    g.rotateX(-Math.PI / 2);
    return this.add(g, { uv: 'face', ...o });
  }

  /** Plane w × h in the XY plane facing +z (centre at the placement). */
  plane(w, h, o = {}) {
    return this.add(new THREE.PlaneGeometry(w, h), { uv: 'face', ...o });
  }

  torus(R, r, o = {}, rs = 8, ts = 16, arc = Math.PI * 2) {
    return this.add(new THREE.TorusGeometry(R, r, rs, ts, arc), { uv: 'native', u: 4, v: 1, ...o });
  }

  /** Returns { opaque, glass } chunks and empties the builder (the transform stack stays). */
  take() {
    return { opaque: this.opaque.count ? this.opaque.take() : null, glass: this.glass.count ? this.glass.take() : null };
  }
}

/** Concatenates chunks into one BufferGeometry (null when empty). */
export function mergeChunks(chunks) {
  const list = chunks.filter(Boolean);
  let nv = 0;
  let ni = 0;
  for (const c of list) {
    nv += c.pos.length / 3;
    ni += c.idx.length;
  }
  if (!nv) return null;
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const col = new Float32Array(nv * 3);
  const tile = new Float32Array(nv * 4);
  const info = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const c of list) {
    const n = c.pos.length / 3;
    pos.set(c.pos, ov * 3);
    nor.set(c.nor, ov * 3);
    uv.set(c.uv, ov * 2);
    col.set(c.col, ov * 3);
    tile.set(c.tile, ov * 4);
    info.set(c.info, ov * 2);
    for (let i = 0; i < c.idx.length; i++) idx[oi + i] = c.idx[i] + ov;
    ov += n;
    oi += c.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aTile', new THREE.BufferAttribute(tile, 4));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
