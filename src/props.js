/* ==== props.js — the Shire around the pit (built by surface/*.js: Bag End, the garden, the Zöld Sárkány, the wider
   Shire, sky), ladders and dropped bags ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LADDER_LEN, MAX_LADDERS } from './config.js';
import { buildBagEnd } from './surface/bagend.js';
import { edgeFence } from './surface/edge-fence.js'; // NOTES-44-pickup-edge
import { flushPlants } from './surface/flora.js';
import { buildGarden, buildSpoilHeap } from './surface/garden.js';
import { groundGeometry, groundHeight, LAKE, laneGeometry, scatterTufts, scatterWildflowers, waterDist } from './surface/ground.js';
import { buildInn } from './surface/inn.js';
import { Batch, model } from './surface/kit.js';
import { buildLife } from './surface/life.js';
import { SURFACE_TIME, surfaceMats } from './surface/mats.js';
import { buildShire } from './surface/shire.js';
import { buildSky, buildSmoke } from './surface/sky.js';
import { surfaceHeight } from './world-gen.js';
import { sdf } from './world.js';

/**
 * NOTES-48-ladder-down: stepping down onto a ladder from its top and staying on it. `reach`: how far (horizontally) from
 * the ladder a body at its top may grab it with the climb-down key; the top may be `above` m over the feet or `below`
 * (negative) under them. While climbing the body is kept within `hold` m of a point `side` m in front of the ladder
 * (on the climber's side, away from what it leans on; it slid off over open drops before), pulled back in at `pull`
 * per s; near the top (`free` m) climbing up towards what the ladder leans on, it may step off.
 */
export const LADDER_TOP = { reach: 1.05, above: 0.9, below: -0.35, hold: 0.12, side: 0.42, pull: 5, free: 0.5 };

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
  [19.0, 13.1, 22.4, 17.9], // the dwarf smith's forge (smith/props.js FORGE, NOTES-40-smith)
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
  edgeFence(batch); // NOTES-44-pickup-edge: the fence round the walkable square (added last: nothing else changes)
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

/**
 * The ladders' height cap (TODO item 19, NOTES-32-ladder-coop): a placed ladder's top may stand at most `cap` m above the
 * outdoor ground surface at its spot (the generated garden surface plus the meadow's height; never a cave ceiling), so
 * stacking ladders no longer climbs into the sky. A full 4 m ladder that would stick out further is placed cut down to
 * the cap (drawn shorter), when at least `min` m of it is left; else the player's placement is refused. Underground
 * (top more than `cap` below the surface) nothing changes. `short`: below this length a ladder is not made at all
 * (a restored old ladder that lies wholly above the cap is dropped).
 */
export const LADDER_CAP = { cap: 1.0, min: 1.5, short: 0.3 };

/** The highest a placed ladder's top may reach at (x, z) (world y). */
export function ladderTopCap(x, z) {
  return surfaceHeight(x, z) + groundHeight(x, z) + LADDER_CAP.cap;
}

/**
 * A new ladder clear of the soil (TODO item 23, NOTES-34-stuck-ladder). From the spot in front of the wall the ladder
 * is moved out along the wall's normal in `step` m steps (at most `maxOut` m) and its foot set onto the floor there
 * (the first soil under the spot, from `floorUp` m above the player's feet to `floorDown` m below them). At each try
 * the ladder is clear up to the height where its axis, its rails (±`rail` m, a graze of `graze` m allowed) and the
 * climbing body in front of it (`front` m out from the axis) are all out of the soil; it stops at the first soil above
 * (a ceiling ends a ladder anyway). The nearest try that is clear (nearly) as high as the best one wins; less than
 * `minClear` m everywhere: no spot (the placement is refused and the ladder kept).
 */
export const LADDER_CLEAR = { step: 0.05, maxOut: 0.6, floorUp: 0.6, floorDown: 0.8, rail: 0.2, graze: 0.05, front: 0.3, minClear: 1.8, slack: 0.2 };

/**
 * Finds the clear spot for a new ladder whose foot would be at `foot` (x, z in front of the wall, y the player's feet),
 * leaning on a wall with the horizontal outward unit normal `n`. Moves `foot` there and returns the clear height
 * (m, at most `len`), or −1 when no spot is clear (foot unchanged then).
 */
export function clearLadderSpot(foot, n, len) {
  const C = LADDER_CLEAR;
  const lx = -n.z;
  const lz = n.x;
  let best = -1;
  let bestOff = 0;
  let bestY = 0;
  const tries = Math.round(C.maxOut / C.step);
  const res = clearTry;
  for (let i = 0; i <= tries; i++) {
    const x = foot.x + n.x * C.step * i;
    const z = foot.z + n.z * C.step * i;
    res[i * 2] = -1;
    // The floor: the first soil under the spot (the start must be air: else this try is still inside the wall).
    let fy = null;
    if (sdf(x, foot.y + C.floorUp, z) > 0) continue;
    for (let d = 0; d <= C.floorUp + C.floorDown; d += 0.04) {
      if (sdf(x, foot.y + C.floorUp - d, z) > 0) {
        fy = foot.y + C.floorUp - d + 0.02;
        break;
      }
    }
    if (fy === null) fy = foot.y;
    let h = 0.15;
    for (; h <= len; h += 0.2) {
      const y = fy + h;
      if (sdf(x, y, z) > 0) break;
      if (sdf(x + lx * C.rail, y, z + lz * C.rail) > C.graze || sdf(x - lx * C.rail, y, z - lz * C.rail) > C.graze) break;
      if (h >= 0.3 && sdf(x + n.x * C.front, y, z + n.z * C.front) > 0) break;
    }
    const clear = Math.min(len, h - 0.15);
    res[i * 2] = clear;
    res[i * 2 + 1] = fy;
    if (clear > best + 1e-6) best = clear;
  }
  if (best < Math.min(C.minClear, len)) return -1;
  for (let i = 0; i <= tries; i++) {
    if (res[i * 2] >= best - C.slack) {
      bestOff = C.step * i;
      bestY = res[i * 2 + 1];
      break;
    }
  }
  foot.x += n.x * bestOff;
  foot.z += n.z * bestOff;
  foot.y = bestY;
  return best;
}
/** Per-try results of clearLadderSpot (clear height, floor y), reused. */
const clearTry = new Float64Array(64);

const ladderM = new THREE.Matrix4();
const ladderQ = new THREE.Quaternion();
const ladderP = new THREE.Vector3();
const ladderS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Ladders: shared by all players, instanced (two rails and rungs, 4 m each; a capped one is drawn shorter). */
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

  /** Adds a fixed, climbable ladder segment { x, y, z, yaw } (foot at y, LADDER_LEN tall; drawn elsewhere; no cap). */
  addFixed(l) {
    // (bx, bz): the horizontal unit direction from the ladder to what it leans on (NOTES-48-ladder-down); a fixed
    // ladder's yaw (goblin-pieces.js: the climber's facing + π as a model yaw) points there.
    this.fixed.push({ x: l.x, y: l.y, z: l.z, yaw: l.yaw, len: LADDER_LEN, top: l.y + LADDER_LEN, fixed: true, bx: Math.sin(l.yaw), bz: Math.cos(l.yaw) });
  }

  /** How long a ladder with its foot at (x, y, z) may be under the height cap (LADDER_LEN at most; ≤ 0: none). */
  lenAt(x, y, z) {
    return Math.min(LADDER_LEN, ladderTopCap(x, z) - y);
  }

  /**
   * Places a ladder with its foot at `p`, leaning on a wall with outward normal `n` (horizontal). A new ladder (`len`
   * omitted) is cut down to the height cap; false when the list is full or less than LADDER_CAP.short of it would be
   * left under the cap. A restored one passes its saved `len` (a save from before the cap has none: LADDER_LEN), so
   * ladders placed before the cap keep their full height (the cap applies to new placements only).
   */
  add(p, n, len = null) {
    if (this.list.length >= MAX_LADDERS) return false;
    if (len == null) {
      len = this.lenAt(p.x, p.y, p.z);
      if (len < LADDER_CAP.short) return false;
    } else len = Math.max(LADDER_CAP.short, Math.min(LADDER_LEN, len));
    const yaw = Math.atan2(n.x, n.z);
    // (bx, bz): towards the wall it leans on (the outward normal reversed; NOTES-48-ladder-down).
    this.list.push({ x: p.x, y: p.y, z: p.z, yaw, len, top: p.y + len, bx: -Math.sin(yaw), bz: -Math.cos(yaw) });
    ladderM.compose(ladderP.set(p.x, p.y, p.z), ladderQ.setFromAxisAngle(UP, yaw), ladderS.set(1, len / LADDER_LEN, 1));
    this.mesh.setMatrixAt(this.list.length - 1, ladderM);
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  /** Removes the placed ladders whose span comes within `r` of (x, y, z) (modes/: a Kihívás cave-in buries them). */
  removeNear(x, y, z, r) {
    const keep = this.list.filter((l) => Math.hypot(l.x - x, l.z - z) > r || y < l.y - r || y > l.top + r);
    const removed = this.list.length - keep.length;
    if (!removed) return 0;
    this.list = [];
    this.mesh.count = 0;
    for (const l of keep) this.add(l, { x: Math.sin(l.yaw), z: Math.cos(l.yaw) }, l.len);
    return removed;
  }

  /**
   * NOTES-48-ladder-down: the ladder whose top a body standing at (x, y, z) can step down onto (the climb-down key at a
   * ladder's top: within LADDER_TOP.reach horizontally, the top a little above or below the feet), the nearest, or null.
   * Goblin-town's ladders stand clear of the deck / ledge they lead to, out of near()'s reach from there.
   */
  nearTop(x, y, z) {
    let best = null;
    let bestD = LADDER_TOP.reach;
    for (const arr of [this.list, this.fixed]) {
      for (const l of arr) {
        const dy = l.top - y;
        if (dy < LADDER_TOP.below || dy > LADDER_TOP.above) continue;
        const d = Math.hypot(x - l.x, z - l.z);
        if (d < bestD) {
          bestD = d;
          best = l;
        }
      }
    }
    return best;
  }

  /** NOTES-48-ladder-down: may a climber at (x, y, z) keep holding ladder `l` (a wider band than near(), while pulled in)? */
  holds(l, x, y, z) {
    return Math.hypot(x - l.x, z - l.z) < LADDER_TOP.reach + 0.1 && y > l.y - 0.6 && y < l.top + 0.6;
  }

  /** The ladder a body at (x, y, z) can hold on to, or null (up to 0.2 m over its top: no climbing past the cap). */
  near(x, y, z) {
    for (const l of this.list) {
      const dx = x - l.x;
      const dz = z - l.z;
      if (dx * dx + dz * dz < 0.55 * 0.55 && y > l.y - 0.6 && y < l.top + 0.2) return l;
    }
    for (const l of this.fixed) {
      const dx = x - l.x;
      const dz = z - l.z;
      if (dx * dx + dz * dz < 0.55 * 0.55 && y > l.y - 0.6 && y < l.top + 0.2) return l;
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
