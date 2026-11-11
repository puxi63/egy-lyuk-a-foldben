/* ==== hirelings/lanterns.js — Óin and Glóin's lanterns along the players' tunnels (NOTES-42-hirelings) ====
 * - A lantern hangs on an iron bracket on the wall of a dug tunnel, LANTERN.height over the floor, at a spot of the
 *   survey (survey.js `cand`: nearest the surface first), at least LANTERN.spacing from every other lantern, clear of the
 *   players' ladders, of the players themselves and of the lift column.
 * - Drawn as ONE InstancedMesh (an unlit vertex-coloured frame and a glowing glass: a MeshBasicMaterial, one program):
 *   one draw call per view, and none in a view whose visible chunks hold no lantern (cullFor, the chunk mask of
 *   Terrain.cullFor through decor.js CULL_HOOKS).
 * - The light: no three.js light. Each lantern is an entry in underground/firelight.js's extra fire list
 *   (`FIRE_EXTRA.list`): the soil shader and the set pieces' materials already add the nearest FIRE_MAX fires per view
 *   (the Goblin-town torches' light pooling); setFires picks the lanterns near the camera with the torches.
 * - A lantern whose wall was dug away or whose spot was filled (a Kihívás cave-in) is taken down (check(): a few
 *   lanterns every LANTERN.checkEvery s). Saved as [x, y, z, yaw] (shire.h.l). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, CHUNK, CX, CY, CZ, ORIGIN } from '../config.js';
import { box, colorize, rgb, torus } from '../underground/kit.js';
import { FIRE_EXTRA } from '../underground/firelight.js';
import { raycast, sampleDensity } from '../world.js';
import { LANTERN } from './rules.js';

const IRON = 0x0a0908;
// (Linear values, as kit.js rgb: an amber glass and a pale flame after the sRGB output.)
const GLASS = 0xff7314;
const FLAME = 0xffcc66;
const LIFT_COLUMN = { x: -4, z: 9 };

/** The lantern: local origin at the glass's centre, the wall behind it (local −z), the bracket from the wall. */
function lanternGeometry() {
  const parts = [];
  const add = (g, hex, x, y, z) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.translate(x, y, z);
    colorize(n, rgb(hex), 0.05);
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(k)) n.deleteAttribute(k);
    parts.push(n);
  };
  add(box(0.14, 0.025, 0.14), IRON, 0, -0.11, 0);
  add(box(0.15, 0.03, 0.15), IRON, 0, 0.11, 0);
  add(box(0.08, 0.04, 0.08), IRON, 0, 0.145, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.018, 0.22, 0.018), IRON, sx * 0.064, 0, sz * 0.064);
  add(box(0.11, 0.19, 0.11), GLASS, 0, 0, 0);
  add(box(0.035, 0.08, 0.035), FLAME, 0, -0.02, 0);
  // The ring and the bracket: an arm from the wall plate to the ring over the lantern.
  const ring = torus(0.035, 0.008, 4, 10);
  add(ring, IRON, 0, 0.2, 0);
  add(box(0.02, 0.02, LANTERN.wallOff + 0.02), IRON, 0, 0.235, -(LANTERN.wallOff + 0.02) / 2);
  add(box(0.06, 0.12, 0.015), IRON, 0, 0.2, -LANTERN.wallOff);
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

const S = CHUNK * CELL;
const chunkOf = (x, y, z) => {
  const cx = Math.floor((x - ORIGIN.x) / S);
  const cy = Math.floor((y - ORIGIN.y) / S);
  const cz = Math.floor((z - ORIGIN.z) / S);
  if (cx < 0 || cy < 0 || cz < 0 || cx >= CX || cy >= CY || cz >= CZ) return -1;
  return cx + CX * (cy + CY * cz);
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const tmpO = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const tmpD = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };

export class Lanterns {
  constructor(game) {
    this.game = game;
    /** { x, y, z, yaw, key (chunk) } */
    this.list = [];
    this.mesh = null;
    if (game.scene) {
      this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.mesh = new THREE.InstancedMesh(lanternGeometry(), this.mat, LANTERN.max);
      this.mesh.name = 'hire-lanterns';
      this.mesh.count = 0;
      this.mesh.frustumCulled = false;
      this.mesh.visible = false;
      game.scene.add(this.mesh);
    }
    this.fires = new Float32Array(LANTERN.max * 5);
    this.checkT = 0;
    this.checkI = 0;
    this.on = true; // false: the lanterns are not drawn and give no light (the Shire off on a bench page)
    this.sync();
  }

  /** Writes the instance matrices, the fire list and the chunk keys after a change. */
  sync() {
    const n = this.list.length;
    if (this.mesh) {
      this.list.forEach((l, i) => {
        tmpQ.setFromAxisAngle(UP, l.yaw);
        tmpM.compose(tmpP.set(l.x, l.y, l.z), tmpQ, ONE);
        this.mesh.setMatrixAt(i, tmpM);
      });
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    this.list.forEach((l, i) => {
      l.key = chunkOf(l.x, l.y, l.z);
      this.fires.set([l.x, l.y + 0.02, l.z, LANTERN.light, (i * 2.399) % 6.283], i * 5);
    });
    this.keys = new Set(this.list.map((l) => l.key));
    FIRE_EXTRA.list = n && this.on ? this.fires.subarray(0, n * 5) : null;
  }

  setOn(on) {
    if (this.on === on) return;
    this.on = on;
    if (!on && this.mesh) this.mesh.visible = false;
    this.sync();
  }

  /** Per view (decor.js CULL_HOOKS): drawn only when a chunk holding a lantern may be seen. */
  cullFor(visible) {
    if (!this.mesh) return;
    let on = false;
    if (this.on && this.list.length) for (const k of this.keys) if (k >= 0 && visible[k] === 1) { on = true; break; }
    this.mesh.visible = on;
  }

  /** True when (x, y, z) is clear of every lantern by `d`. */
  clear(x, y, z, d = LANTERN.spacing) {
    const d2 = d * d;
    return this.list.every((l) => (l.x - x) ** 2 + (l.y - y) ** 2 + (l.z - z) ** 2 >= d2);
  }

  /**
   * Hangs up to `n` lanterns at the survey's spots (nearest the surface first) whose layer passes `layerOk`. Returns
   * the lanterns hung (each also gets `l` = its layer).
   */
  place(cands, n, layerOk) {
    const g = this.game;
    const out = [];
    const ladders = g.ladders?.list || [];
    for (const c of cands) {
      if (out.length >= n || this.list.length >= LANTERN.max) break;
      if (!layerOk(c.l)) continue;
      const cy = c.y + LANTERN.height;
      if (!this.clear(c.x, cy, c.z)) continue;
      if (Math.hypot(c.x - LIFT_COLUMN.x, c.z - LIFT_COLUMN.z) < 2.5) continue;
      if (ladders.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < LANTERN.ladderClear + 0.3 && cy > q.y - 1 && cy < q.top + 1)) continue;
      if (g.players.some((p) => Math.hypot(p.pos.x - c.x, p.pos.y + 0.8 - cy, p.pos.z - c.z) < LANTERN.playerClear)) continue;
      // The wall: a ray from the spot's centre towards it; the lantern hangs LANTERN.wallOff from the hit.
      tmpO.set(c.x, cy, c.z);
      tmpD.set(c.nx, 0, c.nz);
      const t = raycast(tmpO, tmpD, 1.6);
      if (t < 0) continue;
      const x = c.x + c.nx * (t - LANTERN.wallOff);
      const z = c.z + c.nz * (t - LANTERN.wallOff);
      if (sampleDensity(x, cy, z) > -4 || sampleDensity(x, cy - 0.25, z) > 0) continue; // the lantern must hang in the open
      // Facing away from the wall (local +z towards the tunnel).
      const yaw = Math.atan2(-c.nx, -c.nz);
      const l = { x: +x.toFixed(2), y: +cy.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(2), l: c.l };
      this.list.push(l);
      out.push(l);
    }
    if (out.length) this.sync();
    return out;
  }

  /** Takes down lanterns whose wall is gone or whose spot was filled; a few per call. Returns how many were removed. */
  check(dt) {
    if (!this.list.length) return 0;
    this.checkT -= dt;
    if (this.checkT > 0) return 0;
    this.checkT = LANTERN.checkEvery;
    let removed = 0;
    for (let k = 0; k < LANTERN.checkN && this.list.length; k++) {
      this.checkI = (this.checkI + 1) % this.list.length;
      const l = this.list[this.checkI];
      const back = 0.05 + LANTERN.wallOff + 0.12; // just behind the wall surface
      const wx = l.x - Math.sin(l.yaw) * back;
      const wz = l.z - Math.cos(l.yaw) * back;
      const wall = sampleDensity(wx, l.y + 0.2, wz) > 0;
      const open = sampleDensity(l.x, l.y, l.z) < 0;
      if (!wall || !open) {
        this.list.splice(this.checkI, 1);
        removed++;
      }
    }
    if (removed) this.sync();
    return removed;
  }

  state() {
    return this.list.map((l) => [l.x, l.y, l.z, l.yaw]);
  }

  restore(arr) {
    this.list = [];
    for (const a of Array.isArray(arr) ? arr : []) {
      if (!Array.isArray(a) || a.length < 4 || a.slice(0, 4).some((v) => typeof v !== 'number' || !Number.isFinite(v))) continue;
      if (this.list.length >= LANTERN.max) break;
      this.list.push({ x: a[0], y: a[1], z: a[2], yaw: a[3] });
    }
    this.sync();
  }
}
