/* ==== props.js — the Shire around the pit (built by surface/*.js: Bag End, the garden, the Zöld Sárkány, the wider
   Shire, sky), ladders and dropped bags ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LADDER_LEN, MAX_LADDERS } from './config.js';
import { buildBagEnd } from './surface/bagend.js';
import { flushPlants } from './surface/flora.js';
import { buildGarden, buildSpoilHeap } from './surface/garden.js';
import { groundGeometry, LAKE, laneGeometry, scatterTufts, scatterWildflowers, waterDist } from './surface/ground.js';
import { buildInn } from './surface/inn.js';
import { Batch, model } from './surface/kit.js';
import { buildLife } from './surface/life.js';
import { SURFACE_TIME, surfaceMats } from './surface/mats.js';
import { buildShire } from './surface/shire.js';
import { buildSky, buildSmoke } from './surface/sky.js';

/** Where the counter of the Zöld Sárkány stands (the shop opens within 3.2 m), and where players respawn. */
export const SHOP_POS = new THREE.Vector3(5.5, 0, 16.5);
export const SPAWN_POS = new THREE.Vector3(0, 0.05, 15);

/**
 * Solid parts of the surface as circles in world xz ({ x, z, r }): Bag End's hill, the inn, trees, posts, the spoil
 * heap. Filled by buildSurface; the player code may push bodies out of them (see pushOutOfSurface).
 */
export const SURFACE_COLLIDERS = [];

/** The surface API (spoil heap, colliders) once buildSurface has run. */
export let SURFACE = null;

/** Footprints where no grass tufts or wild flowers grow (rectangles x0, z0, x1, z1). */
const NO_GROW = [
  [-17, 17.2, 1.2, 40], // Bag End's hill and front garden
  [2.6, 15.0, 14.2, 26.5], // the inn and its counter
  [-22.8, -10.4, -13.8, 9.0], // vegetable beds
  [-22.2, 10.8, -18.8, 14.4], // potting shed
  [-21.8, -14.2, -19.2, -12.2], // beehives
];

function noGrow(x, z) {
  for (const [x0, z0, x1, z1] of NO_GROW) if (x > x0 && x < x1 && z > z0 && z < z1) return true;
  for (const c of SURFACE_COLLIDERS) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.2) ** 2) return true;
  return waterDist(x, z) < 1.5;
}

/** Washing on the line: a gentle sway in the vertex shader (the pegged top edge stays put). */
function washingMaterial(base) {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SURFACE_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hang = 1.0 - uv.y;
        transformed.z += sin(uTime * 1.6 + position.x * 2.0 + modelMatrix[3].x) * 0.07 * hang * hang;`);
  };
  m.customProgramCacheKey = () => 'surface-washing';
  return m;
}

/**
 * Builds the whole surface around the 24 × 24 m block: the ground (whose inner edge matches the terrain's outer vertices
 * exactly: no gap, no overlap), Bag End, the garden, the Zöld Sárkány with its counter at SHOP_POS, the wider Shire,
 * the sky. Static parts are merged per material (about 20 draw calls in all). Returns the surface API:
 * { spoil: { setVolume(m3) }, colliders }. Everything except the sky lives in the group 'surface-root'.
 */
export function buildSurface(scene, detail) {
  const t0 = performance.now();
  SURFACE_COLLIDERS.length = 0;
  // Everything but the sky goes into one group, so lighting.js can skip the whole surface for views deep underground.
  const root = new THREE.Group();
  root.name = 'surface-root';
  scene.add(root);
  const { geos: ground, lo, hi } = groundGeometry();
  const mats = surfaceMats(detail, lo, hi);
  mats.washing = washingMaterial(mats.cloth);
  const batch = new Batch(5);
  for (const g of ground) batch.add('turf', g, 0xffffff, null, { ao: 0, jitter: 0 });
  for (const g of laneGeometry()) batch.add('lane', g, 0xffffff, null, { ao: 0, jitter: 0 });

  const bag = buildBagEnd(batch);
  const inn = buildInn(batch, SHOP_POS);
  const garden = buildGarden(batch);
  const shire = buildShire(batch);
  SURFACE_COLLIDERS.push(...bag.colliders, ...inn.colliders, ...garden.colliders, ...shire.colliders);
  for (const c of garden.cloth) batch.add('washing', c.g, c.c, c.m, { ao: 0 });
  scatterTufts(batch, noGrow);
  scatterWildflowers(batch, noGrow);
  const plantTris = flushPlants(batch);
  const meshes = batch.build(root, mats);

  // The mill's water wheel turns (its own mesh, rotated before each render).
  const wheelGeo = model(shire.wheel.parts);
  const wheel = new THREE.Mesh(wheelGeo, mats.darkwood);
  wheel.name = 'surface-wheel';
  wheel.position.copy(shire.wheel.pos);
  wheel.rotation.y = shire.wheel.yaw;
  wheel.onBeforeRender = () => {
    wheel.rotation.z = -SURFACE_TIME.value * 0.6;
    wheel.updateMatrix();
    wheel.matrixWorld.copy(wheel.matrix);
  };
  root.add(wheel);

  const spoil = buildSpoilHeap(root, mats.soil);
  buildSky(scene);
  buildSmoke(root, [...bag.smoke, ...inn.smoke, ...shire.smoke]);
  const flowers = [[-10, 19.5], [-6, 19.5], [-8, 20.5], [7, 16], [-18, 2], [-17, -6], [3, -20], [-24, -30], [20, -6], [-14, 14], [16, 14], [-9, -15]];
  buildLife(root, { flowers, hives: garden.hives, lake: { x: LAKE.x - 4, z: LAKE.z + 2, y: LAKE.y } });

  SURFACE = {
    spoil,
    colliders: SURFACE_COLLIDERS,
    meshes,
    root,
    plantTris,
    buildMs: performance.now() - t0,
  };
  return SURFACE;
}

/**
 * Pushes a body at `pos` (THREE.Vector3, feet) with radius `r` out of the surface's solid parts (only near the
 * surface: y > −0.5). Returns true when it moved the body. Optional: wire it into the player's collision step.
 */
export function pushOutOfSurface(pos, r = 0.25) {
  if (pos.y < -0.5 || pos.y > 8) return false;
  let moved = false;
  const list = SURFACE ? [...SURFACE_COLLIDERS, SURFACE.spoil.collider()] : SURFACE_COLLIDERS;
  for (const c of list) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const min = c.r + r;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
      moved = true;
    }
  }
  return moved;
}

/** Ladders: shared by all players, instanced (two rails and rungs, 4 m each). */
export class Ladders {
  constructor(scene) {
    const parts = [];
    for (const x of [-0.22, 0.22]) {
      const rail = new THREE.BoxGeometry(0.05, LADDER_LEN, 0.05);
      rail.translate(x, LADDER_LEN / 2, 0);
      parts.push(rail);
    }
    for (let y = 0.25; y < LADDER_LEN; y += 0.35) {
      const rung = new THREE.BoxGeometry(0.44, 0.035, 0.035);
      rung.translate(0, y, 0);
      parts.push(rung);
    }
    this.mesh = new THREE.InstancedMesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: 0x8a6438 }), MAX_LADDERS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = [];
    /** Fixed ladders of the set pieces (Goblin-town's): climbable, drawn by the decor, not saved. */
    this.fixed = [];
  }

  /** Adds a fixed, climbable ladder segment { x, y, z, yaw } (foot at y, LADDER_LEN tall; drawn elsewhere). */
  addFixed(l) {
    this.fixed.push({ x: l.x, y: l.y, z: l.z, yaw: l.yaw, fixed: true });
  }

  /** Places a ladder with its foot at `p`, leaning on a wall with outward normal `n` (horizontal). */
  add(p, n) {
    if (this.list.length >= MAX_LADDERS) return false;
    const yaw = Math.atan2(n.x, n.z);
    this.list.push({ x: p.x, y: p.y, z: p.z, yaw });
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    this.mesh.setMatrixAt(this.list.length - 1, m);
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  /** Removes the placed ladders whose span comes within `r` of (x, y, z) (modes/: a Kihívás cave-in buries them). */
  removeNear(x, y, z, r) {
    const keep = this.list.filter((l) => Math.hypot(l.x - x, l.z - z) > r || y < l.y - r || y > l.y + LADDER_LEN + r);
    const removed = this.list.length - keep.length;
    if (!removed) return 0;
    this.list = [];
    this.mesh.count = 0;
    for (const l of keep) this.add(l, { x: Math.sin(l.yaw), z: Math.cos(l.yaw) });
    return removed;
  }

  /** The ladder a body at (x, y, z) can hold on to, or null. */
  near(x, y, z) {
    for (const l of this.list) {
      const dx = x - l.x;
      const dz = z - l.z;
      if (dx * dx + dz * dz < 0.55 * 0.55 && y > l.y - 0.6 && y < l.y + LADDER_LEN + 0.2) return l;
    }
    for (const l of this.fixed) {
      const dx = x - l.x;
      const dz = z - l.z;
      if (dx * dx + dz * dz < 0.55 * 0.55 && y > l.y - 0.6 && y < l.y + LADDER_LEN + 0.2) return l;
    }
    return null;
  }
}

/** Bags dropped on death: they stay where the player died and can be picked up once. */
export class Sacks {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.SphereGeometry(0.28, 12, 8);
    this.geo.scale(1, 0.8, 1);
    this.mat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a, emissive: 0x2a1a08 });
  }

  drop(x, y, z, items) {
    if (!items.length) return;
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.set(x, y + 0.25, z);
    this.scene.add(mesh);
    this.list.push({ mesh, items });
  }

  /** Returns the items of a sack touched at (x, y, z) and removes it, or null. */
  take(x, y, z) {
    const i = this.list.findIndex((s) => s.mesh.position.distanceToSquared(new THREE.Vector3(x, y + 0.4, z)) < 0.9);
    if (i < 0) return null;
    const s = this.list.splice(i, 1)[0];
    this.scene.remove(s.mesh);
    return s.items;
  }
}
