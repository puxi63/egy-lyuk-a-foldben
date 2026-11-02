/* ==== surface/flora.js — cottage-garden planting from painted cards: crossed alpha-cut quads from the flora atlas
   (flowers, vegetables, verge grasses, weeds, ferns), swaying in the wind. Plants are collected in 24 m buckets and
   flushed into the static batch once (flushPlants), so the batch's sectors keep culling them. ==== */
import * as THREE from 'three';
import { inPit, rng } from './kit.js';
import { FLORA, floraRect } from './plant-textures.js';
import { Accum } from './trees.js';

const BUCKET = 24;
/** batch → Map(bucket key → Accum) */
const pending = new WeakMap();
const rand = rng(4242);
const WHITE = new THREE.Color(1, 1, 1);

/** One card quad with its root at y = 0, UVs on the atlas cell, normals up (lit like the lawn around it). */
function card(w, h, rect) {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * rect[2], rect[1] + uv.getY(i) * rect[3]);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/**
 * Plants one card plant at world (x, y, z): two crossed quads (three with `o.cards`), its natural height × `o.scale`
 * (or `o.h` metres), turned `o.yaw`. `o.tint` colours the blooms of tintable cards; `o.shade` darkens the whole plant
 * (shade under a hedge). Nothing is planted inside the pit block.
 */
export function plant(batch, x, y, z, kind, o = {}) {
  const f = FLORA[kind];
  if (!f || inPit(x, z, 0.15)) return;
  const h = o.h ?? f.h * (o.scale ?? 1) * (0.8 + rand() * 0.4);
  const w = h * f.aspect;
  const rect = floraRect(f.cell);
  const n = o.cards ?? 2;
  const yaw = o.yaw ?? rand() * Math.PI;
  const tint = f.tint && o.tint != null ? new THREE.Color(o.tint) : WHITE.clone();
  if (o.shade) tint.multiplyScalar(o.shade);
  if (!pending.has(batch)) pending.set(batch, new Map());
  const map = pending.get(batch);
  const key = `${Math.floor(x / BUCKET)},${Math.floor(z / BUCKET)}`;
  if (!map.has(key)) map.set(key, new Accum());
  const acc = map.get(key);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Matrix4().makeRotationY(yaw + (k * Math.PI) / n);
    // A slight outward lean, so a clump does not look like a paper cross.
    if (o.lean !== false) m.multiply(new THREE.Matrix4().makeRotationX((rand() - 0.5) * 0.25));
    m.setPosition(x, y - 0.02, z);
    acc.add(card(w, h, rect), m, tint);
  }
}

/** Plants a cluster of `count` plants of `kinds` (random pick) round (x, z) within `r` metres, on ground `y`. */
export function clump(batch, x, y, z, kinds, count, r, o = {}) {
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r;
    plant(batch, x + Math.cos(a) * d, y, z + Math.sin(a) * d, kinds[Math.floor(rand() * kinds.length)], o);
  }
}

/**
 * Verge planting along a polyline of [x, z] points: tall grass, weeds, docks and a few flowers at the foot of walls,
 * fences and hedges. `side` offsets the strip sideways (metres, signed), `every` is the spacing.
 */
export function verge(batch, pts, o = {}) {
  const every = o.every ?? 0.55;
  const side = o.side ?? 0;
  const yAt = o.groundY ?? (() => 0);
  const kinds = o.kinds ?? ['grass', 'grass', 'grass', 'dock', 'meadow', 'daisy', 'fern'];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    for (let t = rand() * every; t < len; t += every * (0.6 + rand() * 0.8)) {
      const off = side + (rand() - 0.5) * (o.width ?? 0.4);
      const x = ax + ((bx - ax) * t) / len + nx * off;
      const z = az + ((bz - az) * t) / len + nz * off;
      if (o.avoid && o.avoid(x, z)) continue;
      plant(batch, x, yAt(x, z), z, kinds[Math.floor(rand() * kinds.length)], { scale: o.scale ?? 1, tint: o.tint });
    }
  }
}

/** Flushes the collected plants into the batch ('flora' material), one geometry per 24 m bucket. */
export function flushPlants(batch) {
  const map = pending.get(batch);
  if (!map) return 0;
  let n = 0;
  for (const acc of map.values()) {
    if (acc.empty) continue;
    n += acc.idx.length / 3;
    batch.add('flora', acc.geometry(), 0xffffff, null, { ao: 0, jitter: 0.04 });
  }
  pending.delete(batch);
  return n;
}
