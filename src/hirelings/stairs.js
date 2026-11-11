/* ==== hirelings/stairs.js — Fíli's stairwell beside the pit (NOTES-42-hirelings) ====
 * A spiral stair carved down from the lawn (a helix of radius STAIR.R round one of AXES, 35° steep): each shift Fíli
 * carves STAIR.perShift metres more of it with world.js digSphere (two spheres per spot: a 2.2 m high tunnel) and lays
 * wooden treads on its floor. Walking on it is faster (STAIR.walk, through shire/meals.js p.mealK) and needs no ladder.
 * - Only ever removes soil (digSphere; the locked set pieces stay untouched), so it can never shut anyone in. It never
 *   carves within STAIR.playerClear of a player (he waits for the next shift) and never next to a placed ladder (the
 *   work stops there and says so); the axis is chosen once, on the first shift, as the one of AXES whose whole path has
 *   no ladder near it and crosses the least of the players' tunnels; all of them are 15 m or more from the lift column
 *   (and its stops' doors and floor slabs) and miss every locked set piece (qa/hirelings/probe-axis.mjs).
 * - Embedded finds in the carved rock are taken out (a famous or kept find is left in place, so the stair never takes
 *   one of the story's finds) and handed over: their value goes to the purse.
 * - Only down to the deepest point reached (journal.deepest()) and never below LIMIT_DEPTH.
 * - The treads: one merged mesh on the Shire's vertex-coloured Lambert (no new program), rebuilt once per shift, drawn
 *   only when one of its chunks may be seen (decor.js CULL_HOOKS). Saved: the length carved and the axis (shire.h.f). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, CHUNK, CX, CY, CZ, ORIGIN } from '../config.js';
import { box, colorize, rgb } from '../underground/kit.js';
import { digSphere, raycast, sampleDensity } from '../world.js';
import { LIMIT_DEPTH, STAIR } from './rules.js';

/** Candidate axes (world x, z), best first (qa/hirelings/probe-axis.mjs). */
export const AXES = [[STAIR.ax, STAIR.az], [0.5, -8], [4.5, -4]];

const WOOD = 0x5a3a1e;
const WOOD_D = 0x3a2412;
const SIN = Math.sin((STAIR.slope * Math.PI) / 180);
const COS = Math.cos((STAIR.slope * Math.PI) / 180);
const S = CHUNK * CELL;
const DOWN = { x: 0, y: -1, z: 0 };

const chunkOf = (x, y, z) => {
  const cx = Math.floor((x - ORIGIN.x) / S);
  const cy = Math.floor((y - ORIGIN.y) / S);
  const cz = Math.floor((z - ORIGIN.z) / S);
  if (cx < 0 || cy < 0 || cz < 0 || cx >= CX || cy >= CY || cz >= CZ) return -1;
  return cx + CX * (cy + CY * cz);
};

export class Stairs {
  constructor(game, mat) {
    this.game = game;
    this.mat = mat || new THREE.MeshLambertMaterial({ vertexColors: true });
    this.built = 0; // m carved along the helix
    this.axis = -1; // index into AXES, chosen on the first shift
    this.mesh = null;
    this.keys = new Set();
    this.on = true;
    this.treadSig = -1;
  }

  get ax() {
    return AXES[Math.max(0, this.axis)][0];
  }

  get az() {
    return AXES[Math.max(0, this.axis)][1];
  }

  /** The walking line's point at length s: { x, y, z, a (angle round the axis) }. */
  at(s, out = {}) {
    const a = (s * COS) / STAIR.R;
    out.a = a;
    out.x = this.ax + Math.cos(a) * STAIR.R;
    out.z = this.az + Math.sin(a) * STAIR.R;
    out.y = STAIR.top - s * SIN;
    return out;
  }

  /** The length along the helix down to depth d. */
  static lengthTo(d) {
    return Math.max(0, (STAIR.top + d) / SIN);
  }

  /** Depth (m) reached by the stair. */
  get depth() {
    return Math.max(0, this.built * SIN - STAIR.top);
  }

  /** Placed ladders near the tunnel at spot c. */
  ladderAt(c, ladders) {
    const r = STAIR.r1 + STAIR.ladderClear;
    return ladders.find((q) => Math.hypot(q.x - c.x, q.z - c.z) < r && c.y + 2.3 > q.y && c.y - 0.2 < q.top);
  }

  /** Chooses the axis (once): no ladder along the whole path, then the fewest dug samples crossed. */
  chooseAxis() {
    if (this.axis >= 0) return;
    const ladders = this.game.ladders?.list || [];
    const sMax = Stairs.lengthTo(LIMIT_DEPTH);
    let best = 0;
    let bestScore = Infinity;
    const c = {};
    AXES.forEach((_, i) => {
      this.axis = i;
      let lad = 0;
      let open = 0;
      for (let s = 0; s < sMax; s += 1) {
        this.at(s, c);
        if (this.ladderAt(c, ladders)) lad++;
        if (c.y < -1.5 && sampleDensity(c.x, c.y + STAIR.r1y, c.z) < 0) open++;
      }
      const score = lad * 1000 + open;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    this.axis = best;
  }

  /**
   * One shift's work: carves up to STAIR.perShift metres more, down to `maxDepth`. Returns { m (metres of stair carved),
   * finds: [items], blocked: '' | 'player' | 'ladder' | 'deep' }.
   */
  build(maxDepth) {
    const g = this.game;
    this.chooseAxis();
    const out = { m: 0, finds: [], blocked: '' };
    const sMax = Stairs.lengthTo(Math.min(LIMIT_DEPTH, maxDepth));
    const end = Math.min(sMax, this.built + STAIR.perShift);
    if (this.built >= sMax - 0.01) {
      out.blocked = 'deep';
      return out;
    }
    const ladders = g.ladders?.list || [];
    const c = {};
    const start = this.built;
    const steps = Math.floor((end - this.built) / STAIR.step + 1e-6);
    for (let k = 1; k <= steps; k++) {
      const s = start + k * STAIR.step;
      this.at(s, c);
      if (g.players.some((p) => !p.choosing && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < STAIR.playerClear && Math.abs(p.pos.y - c.y) < STAIR.playerClear + 1)) {
        out.blocked = 'player';
        break;
      }
      if (this.ladderAt(c, ladders)) {
        out.blocked = 'ladder';
        break;
      }
      this.carve(c, out.finds);
      this.built = s;
    }
    out.m = this.built - start;
    if (out.m > 0) this.syncTreads();
    return out;
  }

  /** Carves one spot (two spheres) and takes the ordinary finds inside. */
  carve(c, finds) {
    digSphere(c.x, c.y + STAIR.r1y, c.z, STAIR.r1);
    digSphere(c.x, c.y + STAIR.r2y, c.z, STAIR.r2);
    const fd = this.game.finds;
    if (!fd?.byChunk) return;
    for (const [oy, r] of [[STAIR.r1y, STAIR.r1], [STAIR.r2y, STAIR.r2]]) {
      const cy = c.y + oy;
      const key = chunkOf(c.x, cy, c.z);
      const near = new Set();
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = chunkOf(c.x + dx * r, cy + dy * r, c.z + dz * r);
        if (k >= 0) near.add(k);
      }
      if (key >= 0) near.add(key);
      for (const k of near) {
        for (const it of fd.byChunk[k] || []) {
          if (it.taken || it.type.famous || it.type.keep) continue;
          if ((it.x - c.x) ** 2 + (it.y - cy) ** 2 + (it.z - c.z) ** 2 > (r + 0.05) ** 2) continue;
          it.taken = true;
          finds.push(it);
        }
      }
    }
  }

  /** On the stair (walking-speed bonus): near the walking line of a built part. */
  onStair(p) {
    if (this.built <= 0 || this.axis < 0) return false;
    const dx = p.pos.x - this.ax;
    const dz = p.pos.z - this.az;
    const r = Math.hypot(dx, dz);
    if (r < STAIR.R - 0.95 || r > STAIR.R + 0.95) return false;
    const sEst = (STAIR.top - p.pos.y) / SIN;
    if (sEst < -1 || sEst > this.built + 1) return false;
    const aP = Math.atan2(dz, dx);
    const aEst = (sEst * COS) / STAIR.R;
    let da = (aP - aEst) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    const s = sEst + (da * STAIR.R) / COS;
    if (s < 0 || s > this.built) return false;
    return Math.abs(p.pos.y - (STAIR.top - s * SIN)) < 0.6;
  }

  /** Rebuilds the treads (and the entrance frame) up to `built`. */
  syncTreads() {
    const n = Math.floor(this.built / STAIR.tread);
    if (n === this.treadSig && this.mesh) return;
    this.treadSig = n;
    const parts = [];
    const keys = new Set();
    const add = (g, hex, x, y, z, yaw) => {
      const q = g.index ? g.toNonIndexed() : g;
      q.rotateY(yaw);
      q.translate(x, y, z);
      colorize(q, rgb(hex), 0.12);
      for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'color'].includes(k)) q.deleteAttribute(k);
      parts.push(q);
      keys.add(chunkOf(x, y, z));
    };
    const c = {};
    for (let i = 1; i <= n; i++) {
      this.at(i * STAIR.tread, c);
      const t = raycast({ x: c.x, y: c.y + 1.0, z: c.z }, DOWN, 1.8);
      if (t < 0) continue;
      const y = c.y + 1.0 - t + 0.03;
      // A tread across the stair (local x along the radius), a darker cleat under its outer end.
      add(box(0.78, 0.05, 0.26), i % 2 ? WOOD : 0x62401f, c.x, y, c.z, -c.a);
      add(box(0.08, 0.06, 0.24), WOOD_D, c.x + Math.cos(c.a) * 0.36, y - 0.04, c.z + Math.sin(c.a) * 0.36, -c.a);
    }
    // The entrance on the lawn: two posts and a lintel over the stair's first metres.
    this.at(0.4, c);
    const ex = c.x;
    const ez = c.z;
    const yaw = -c.a;
    const ox = Math.cos(c.a) * 0.55;
    const oz = Math.sin(c.a) * 0.55;
    add(box(0.12, 1.9, 0.12), WOOD_D, ex + ox, 0.75, ez + oz, yaw);
    add(box(0.12, 1.9, 0.12), WOOD_D, ex - ox, 0.75, ez - oz, yaw);
    add(box(1.35, 0.14, 0.16), WOOD, ex, 1.72, ez, yaw);
    const geo = mergeGeometries(parts, false);
    geo.computeBoundingSphere();
    if (!this.mesh) {
      this.mesh = new THREE.Mesh(geo, this.mat);
      this.mesh.name = 'hire-stair';
      this.mesh.frustumCulled = false;
      this.mesh.matrixAutoUpdate = false;
      this.mesh.visible = false;
      this.game.scene?.add(this.mesh);
    } else {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
    }
    keys.delete(-1);
    this.keys = keys;
  }

  setOn(on) {
    this.on = on;
    if (!on && this.mesh) this.mesh.visible = false;
  }

  cullFor(visible) {
    if (!this.mesh) return;
    let on = false;
    if (this.on) for (const k of this.keys) if (visible[k] === 1) { on = true; break; }
    this.mesh.visible = on;
  }

  state() {
    return this.built > 0 ? [+this.built.toFixed(2), this.axis] : undefined;
  }

  restore(f) {
    this.built = 0;
    this.axis = -1;
    this.treadSig = -1;
    if (Array.isArray(f) && Number.isFinite(f[0]) && f[0] > 0) {
      this.built = Math.min(Stairs.lengthTo(LIMIT_DEPTH), f[0]);
      this.axis = Number.isInteger(f[1]) && f[1] >= 0 && f[1] < AXES.length ? f[1] : 0;
    }
    if (this.mesh) this.mesh.visible = false;
    this.keys = new Set();
  }
}
