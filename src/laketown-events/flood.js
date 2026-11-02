/* ==== laketown-events/flood.js — rising water in layer 7's cavities (TERV 0.11/4 "Betörő víz"; technical note h.
   "Rising water"): a bad pick stroke at a cavity's breach lets the lake in; a horizontal water plane rises at a fixed
   rate, and a flood fill over a coarse 1 m grid of the density field decides where it can flow (it fills from the
   lowest open cells connected to the breach, never over a ridge higher than the water). After a while at the top the
   water drains slowly and the cavity can be dug again (the breach is silted up for good). The surface is drawn by the
   world work's laketown-fx.js (setFloodLevel); without it (a QA test site) by a fallback mesh here.
   Also the swimming step inside the flood: floating at the surface, slow paddling, the roof pressing the swimmer under
   (submerged: no digging, the breath runs out; index.js washes him up). ==== */
import * as THREE from 'three';
import { CELL, HUNGER, NX, NY, NZ, ORIGIN, PLAYER } from '../config.js';
import { raycast, sdf } from '../world.js';
import { pt } from './sites.js';

/** Tuning (metres, seconds). */
export const FLOOD = {
  rise: 0.16, // m/s the water rises
  hold: 40, // s the cavity stays full before it drains
  drain: 0.05, // m/s it drains
  margin: 4, // m the flood grid reaches beyond the cavity's box (dug side tunnels)
  breachR: 1.25, // m from the breach a dig sphere's centre must come to break it
  fillEvery: 0.35, // s between flood fills while the water moves
  resample: 360, // grid cells re-sampled per frame (digging changes where the water can go)
  swim: 1.35, // m/s paddling at the surface
  swimUnder: 1.0, // m/s under water
};

const tmpO = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** The world block's extent (the grid is clipped to it). */
const WMIN = { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z };
const WMAX = { x: ORIGIN.x + (NX - 1) * CELL, y: ORIGIN.y + (NY - 1) * CELL, z: ORIGIN.z + (NZ - 1) * CELL };

/** Sample offsets inside a 1 m cell: open when any of them is air (a 1 m dug tunnel through a cell counts). */
const PROBES = [[0, 0, 0], [0, 0.35, 0], [0, -0.35, 0], [0.35, 0, 0], [-0.35, 0, 0], [0, 0, 0.35], [0, 0, -0.35]];

/** One cavity's flood: its grid, its state and level. */
export class Flood {
  constructor(cav) {
    this.cav = cav;
    this.id = cav.id;
    const m = FLOOD.margin;
    const min = pt(cav.min);
    const max = pt(cav.max);
    this.floorY = Number.isFinite(cav.floorY) ? cav.floorY : min.y;
    this.cap = Number.isFinite(cav.maxLevel) ? cav.maxLevel : Number.isFinite(cav.topY) ? cav.topY : max.y;
    this.breach = pt(cav.breach);
    this.exits = (cav.exits || []).map(pt).filter(Boolean);
    this.x0 = Math.floor(Math.max(WMIN.x, min.x - m));
    this.y0 = Math.floor(Math.max(WMIN.y, Math.min(min.y, this.floorY) - 1));
    this.z0 = Math.floor(Math.max(WMIN.z, min.z - m));
    this.nx = Math.max(1, Math.ceil(Math.min(WMAX.x, max.x + m)) - this.x0);
    this.ny = Math.max(1, Math.ceil(Math.min(WMAX.y, Math.max(max.y, this.cap) + 2)) - this.y0);
    this.nz = Math.max(1, Math.ceil(Math.min(WMAX.z, max.z + m)) - this.z0);
    const n = this.nx * this.ny * this.nz;
    this.open = null; // Uint8Array, sampled when the flood starts
    this.wet = new Uint8Array(n);
    this.queue = new Int32Array(n);
    this.state = 'dry'; // dry → rising → full → draining → drained
    this.level = -Infinity;
    this.t = 0;
    this.fillT = 0;
    this.filledLevel = NaN;
    this.resampleAt = 0;
    this.wetCount = 0;
    this.seed = -1;
    this.surfaceRow = -1;
    this.surfaceDirty = true;
  }

  get active() {
    return this.state === 'rising' || this.state === 'full' || this.state === 'draining';
  }

  idx(i, j, k) {
    return (j * this.nz + k) * this.nx + i;
  }

  /** Grid cell index of a world point, or −1 outside the grid. */
  cellOf(x, y, z) {
    const i = Math.floor(x - this.x0);
    const j = Math.floor(y - this.y0);
    const k = Math.floor(z - this.z0);
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return -1;
    return this.idx(i, j, k);
  }

  sampleCell(c) {
    const i = c % this.nx;
    const k = Math.floor(c / this.nx) % this.nz;
    const j = Math.floor(c / (this.nx * this.nz));
    const cx = this.x0 + i + 0.5;
    const cy = this.y0 + j + 0.5;
    const cz = this.z0 + k + 0.5;
    let air = 0;
    for (const [dx, dy, dz] of PROBES) {
      if (sdf(cx + dx, cy + dy, cz + dz) < 0) {
        air = 1;
        break;
      }
    }
    this.open[c] = air;
  }

  /** Samples every cell (once, when the flood starts). */
  sampleAll() {
    const n = this.wet.length;
    if (!this.open) this.open = new Uint8Array(n);
    for (let c = 0; c < n; c++) this.sampleCell(c);
  }

  /** A few cells per frame: the players dig new ways for the water. */
  resample(count) {
    if (!this.open) return;
    const n = this.open.length;
    for (let q = 0; q < count; q++) {
      this.sampleCell(this.resampleAt);
      this.resampleAt = (this.resampleAt + 1) % n;
    }
  }

  /** The seed cell: the open cell nearest the breach, then straight down to the lowest open cell under it. */
  findSeed() {
    const b = this.breach || { x: (this.x0 + this.nx / 2), y: this.floorY + 0.5, z: (this.z0 + this.nz / 2) };
    let best = -1;
    let bd = Infinity;
    for (let dj = -2; dj <= 2; dj++) {
      for (let dk = -2; dk <= 2; dk++) {
        for (let di = -2; di <= 2; di++) {
          const c = this.cellOf(b.x + di, b.y + dj, b.z + dk);
          if (c < 0 || !this.open[c]) continue;
          const d = di * di + dj * dj + dk * dk;
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
      }
    }
    if (best < 0) return -1;
    // The water runs down to the lowest open cell connected to the breach (the floor under a breach is often a slope
    // higher than the cavity's lowest point): a fill through every open cell of the grid, lowest row wins.
    const plane = this.nx * this.nz;
    const nx = this.nx;
    const seen = this.wet;
    seen.fill(0);
    const Q = this.queue;
    let h = 0;
    let t = 0;
    Q[t++] = best;
    seen[best] = 1;
    let low = best;
    while (h < t) {
      const c = Q[h++];
      const i = c % nx;
      const k = Math.floor(c / nx) % this.nz;
      const j = Math.floor(c / plane);
      // Only cells of the cavity itself (its box, not below its floor) can be the low point: a tunnel leading on down
      // out of the cavity does not drain it (the grid's margin reaches into such tunnels).
      if (j < Math.floor(low / plane) && this.inBox(i, j, k)) low = c;
      const nb = [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, k > 0 ? c - nx : -1, k < this.nz - 1 ? c + nx : -1, j > 0 ? c - plane : -1, j < this.ny - 1 ? c + plane : -1];
      for (const n of nb) {
        if (n >= 0 && !seen[n] && this.open[n]) {
          seen[n] = 1;
          Q[t++] = n;
        }
      }
    }
    seen.fill(0);
    return low;
  }

  /** True when grid cell (i, j, k) lies in the cavity's own box, at or above one cell under its floor. */
  inBox(i, j, k) {
    const min = pt(this.cav.min);
    const max = pt(this.cav.max);
    const x = this.x0 + i + 0.5;
    const z = this.z0 + k + 0.5;
    return x >= min.x && x <= max.x && z >= min.z && z <= max.z && this.y0 + j >= Math.floor(this.floorY) - 1;
  }

  /** Starts the flood (the breach broken). */
  start() {
    this.sampleAll();
    this.seed = this.findSeed();
    this.state = 'rising';
    this.t = 0;
    const seedBottom = this.seed >= 0 ? this.y0 + Math.floor(this.seed / (this.nx * this.nz)) : this.floorY;
    // Just above the seed cell's bottom: the water is in from the first frame and rises from the lowest open cell.
    this.level = Math.min(this.floorY, seedBottom) + 0.1;
    this.fill();
  }

  /** Restores a saved state (index.js restore). */
  restore(st) {
    if (!st) return;
    if (st.s === 'drained') {
      this.state = 'drained';
      return;
    }
    if (!['rising', 'full', 'draining'].includes(st.s) || !Number.isFinite(st.l)) return;
    this.sampleAll();
    this.seed = this.findSeed();
    this.state = st.s;
    this.level = Math.min(this.cap, st.l);
    this.t = st.t || 0;
    this.fill();
  }

  state4save() {
    if (this.state === 'dry') return null;
    if (this.state === 'drained') return { s: 'drained' };
    return { s: this.state, l: +this.level.toFixed(2), t: Math.round(this.t) };
  }

  /**
   * The flood fill: every open cell connected to the seed through open cells whose bottom is below the water level.
   * The seed is re-found when digging closed it off (never happens for rock, kept for safety).
   */
  fill() {
    const W = this.wet;
    W.fill(0);
    this.wetCount = 0;
    this.filledLevel = this.level;
    this.surfaceDirty = true;
    if (this.seed < 0 || !this.open[this.seed]) this.seed = this.findSeed();
    if (this.seed < 0) return;
    const nx = this.nx;
    const plane = nx * this.nz;
    const top = Math.min(this.ny, Math.ceil(this.level - this.y0)); // rows j < top have their bottom below the level
    const sj = Math.floor(this.seed / plane);
    if (sj >= top) return;
    const Q = this.queue;
    let h = 0;
    let t = 0;
    Q[t++] = this.seed;
    W[this.seed] = 1;
    while (h < t) {
      const c = Q[h++];
      const i = c % nx;
      const k = Math.floor(c / nx) % this.nz;
      const j = Math.floor(c / plane);
      // Six neighbours (up only while that row is below the water).
      if (i > 0 && !W[c - 1] && this.open[c - 1]) { W[c - 1] = 1; Q[t++] = c - 1; }
      if (i < nx - 1 && !W[c + 1] && this.open[c + 1]) { W[c + 1] = 1; Q[t++] = c + 1; }
      if (k > 0 && !W[c - nx] && this.open[c - nx]) { W[c - nx] = 1; Q[t++] = c - nx; }
      if (k < this.nz - 1 && !W[c + nx] && this.open[c + nx]) { W[c + nx] = 1; Q[t++] = c + nx; }
      if (j > 0 && !W[c - plane] && this.open[c - plane]) { W[c - plane] = 1; Q[t++] = c - plane; }
      if (j + 1 < top && !W[c + plane] && this.open[c + plane]) { W[c + plane] = 1; Q[t++] = c + plane; }
    }
    this.wetCount = t;
  }

  /** True when the point is under this cavity's water. */
  wetAt(x, y, z) {
    if (!this.active || y >= this.level) return false;
    const c = this.cellOf(x, y, z);
    if (c < 0) return false;
    if (this.wet[c] === 1) return true;
    // A cell the coarse sampling took for rock (a pile, a beam, a ledge filling most of it) can still hold the air
    // pocket a player stands in: it is wet when a wet cell touches it from below or the side.
    if (this.open?.[c]) return false;
    const plane = this.nx * this.nz;
    const i = c % this.nx;
    const k = Math.floor(c / this.nx) % this.nz;
    return (c >= plane && this.wet[c - plane] === 1) || (i > 0 && this.wet[c - 1] === 1) || (i < this.nx - 1 && this.wet[c + 1] === 1)
      || (k > 0 && this.wet[c - this.nx] === 1) || (k < this.nz - 1 && this.wet[c + this.nx] === 1);
  }

  /** Per frame: the level rises, holds, drains; the fill follows. Returns an event name when the state changed. */
  update(dt) {
    if (!this.active) return null;
    let ev = null;
    this.t += dt;
    if (this.state === 'rising') {
      this.level = Math.min(this.cap, this.level + FLOOD.rise * dt);
      if (this.level >= this.cap) {
        this.state = 'full';
        this.t = 0;
        ev = 'full';
      }
    } else if (this.state === 'full') {
      if (this.t >= FLOOD.hold) {
        this.state = 'draining';
        this.t = 0;
        ev = 'draining';
      }
    } else if (this.state === 'draining') {
      this.level -= FLOOD.drain * dt;
      if (this.level < this.floorY - 0.4) {
        this.state = 'drained';
        this.level = -Infinity;
        this.wet.fill(0);
        this.wetCount = 0;
        this.open = null; // the grid is not needed any more
        return 'drained';
      }
    }
    this.resample(FLOOD.resample);
    this.fillT -= dt;
    if (this.fillT <= 0) {
      this.fillT = FLOOD.fillEvery;
      // Re-fill when the water crossed a cell row, and now and then for the re-sampled cells (digging).
      this.fill();
    }
    return ev;
  }

  /** True when a dig at (x, y, z) breaks this cavity's breach. */
  breaks(x, y, z) {
    const b = this.breach;
    return this.state === 'dry' && !!b && Math.hypot(x - b.x, y - b.y, z - b.z) < FLOOD.breachR;
  }

  /** The safe way out for a washed-up player: the nearest exit above the water (or the highest one). */
  safeExit(from) {
    let best = null;
    let bd = Infinity;
    for (const e of this.exits) {
      if (this.active && e.y < this.level + 0.4) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y, e.z - from.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) return best;
    return this.exits.reduce((a, e) => (!a || e.y > a.y ? e : a), null);
  }

  /** Columns whose cell at the water line is wet (the fallback surface mesh's quads). */
  surfaceCells() {
    const out = [];
    const j = Math.floor(this.level - this.y0);
    if (j < 0 || j >= this.ny) return out;
    for (let k = 0; k < this.nz; k++) {
      for (let i = 0; i < this.nx; i++) if (this.wet[this.idx(i, j, k)]) out.push(this.x0 + i, this.z0 + k);
    }
    return out;
  }
}

/** The fallback water surface (no laketown-fx.js: a QA test site): dark opaque quads over the wet columns. */
export class FloodSurface {
  constructor(scene) {
    this.scene = scene;
    this.mat = new THREE.MeshLambertMaterial({ color: 0x0c1a1c, emissive: 0x030a0c });
    this.meshes = new Map();
  }

  update(f) {
    let m = this.meshes.get(f.id);
    if (!f.active) {
      if (m) m.visible = false;
      return;
    }
    const row = Math.floor(f.level - f.y0);
    if (!m || f.surfaceDirty || row !== f.surfaceRow) {
      f.surfaceDirty = false;
      f.surfaceRow = row;
      const cells = f.surfaceCells();
      const pos = new Float32Array((cells.length / 2) * 12);
      const idx = [];
      const pad = 0.35; // into the rock: the coarse cells' edges are hidden in the walls
      for (let q = 0; q < cells.length; q += 2) {
        const x = cells[q];
        const z = cells[q + 1];
        const o = (q / 2) * 12;
        pos.set([x - pad, 0, z - pad, x + 1 + pad, 0, z - pad, x + 1 + pad, 0, z + 1 + pad, x - pad, 0, z + 1 + pad], o);
        const v = (q / 2) * 4;
        idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      if (!m) {
        m = new THREE.Mesh(g, this.mat);
        m.name = `flood-${f.id}`;
        m.renderOrder = -1;
        this.scene.add(m);
        this.meshes.set(f.id, m);
      } else {
        m.geometry.dispose();
        m.geometry = g;
      }
    }
    m.visible = true;
    m.position.y = f.level;
  }

  dispose() {
    for (const m of this.meshes.values()) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.meshes.clear();
  }
}

/**
 * The swimming step inside a flood (player.js water block, through index.js waterStep): like lake-water.js waterStep,
 * but the water can reach the roof. Floating keeps the eye 0.3 m above the water while there is room; where the roof is
 * lower, the swimmer is pressed under it (`submerged`: index.js runs the breath, refuses digging). Wading slows the
 * steps. Sets `p.water` { depth, swimming, submerged, flood }.
 */
export function floodSwim(p, it, dt, wx, wz, menuOpen, f) {
  const x = p.pos.x;
  const z = p.pos.z;
  const L = f.level;
  const w = p.water && p.water.flood ? p.water : (p.water = { depth: 0, swimming: false, submerged: false, flood: true, bed: 0, bedT: 0, ceil: Infinity, vx: p.vel.x, vz: p.vel.z, wasSwimming: false });
  w.depth = L - p.pos.y;
  // The bed under the player and the roof over him (a few raycasts a second).
  w.bedT -= dt;
  if (w.bedT <= 0) {
    w.bedT = 0.15;
    const t = raycast(tmpO.set(x, p.pos.y + 0.6, z), DOWN, 12);
    w.bed = t < 0 ? 12 : t - 0.6 + w.depth;
    const u = raycast(tmpO.set(x, p.pos.y + 0.6, z), UP, 14);
    w.ceil = u < 0 ? Infinity : p.pos.y + 0.6 + u;
  }
  const floatDepth = p.eyeH - 0.3;
  const deep = w.bed > floatDepth + 0.05;
  // A fall into deep water is caught.
  if (w.bed > 1.1 && p.vel.y < -3.5) p.vel.y += (-3.5 - p.vel.y) * Math.min(1, dt * 14);
  if (deep && w.depth > floatDepth - 0.12 - (w.submerged ? 1 : 0) && !(p.climbOutT > 0)) {
    w.swimming = true;
    p.vel.y += PLAYER.gravity * dt;
    // Float at the surface, or as high as the roof lets the head go.
    const roofTarget = w.ceil - p.eyeH - 0.14;
    const bob = Math.sin(performance.now() * 0.0021 + p.slot) * 0.025;
    const target = Math.min(L - floatDepth + bob, roofTarget);
    p.vel.y += ((target - p.pos.y) * 9 - p.vel.y * 4.5) * dt;
    if (!w.wasSwimming) {
      w.vx = p.vel.x;
      w.vz = p.vel.z;
    }
    w.submerged = p.pos.y + p.eyeH < L - 0.04;
    const speed = w.submerged ? FLOOD.swimUnder : FLOOD.swim;
    const a = Math.min(1, 3.2 * dt);
    w.vx += (wx * speed - w.vx) * a;
    w.vz += (wz * speed - w.vz) * a;
    p.vel.x = w.vx;
    p.vel.z = w.vz;
    if (Math.hypot(wx, wz) > 0.1) p.addHunger(-HUNGER.perClimbSecond * 0.35 * dt);
    // Climbing out onto a bank at the waterline (as lake-water.js): only with room above the water.
    const wl = Math.hypot(wx, wz);
    if (!menuOpen && !w.submerged && (it.jumpPressed || wl > 0.5)) {
      const dx = wl > 0.1 ? wx / wl : -Math.sin(p.yaw);
      const dz = wl > 0.1 ? wz / wl : -Math.cos(p.yaw);
      if (sdf(x + dx * 0.55, L + 0.05, z + dz * 0.55) > 0) {
        let top = -1;
        for (let h = 0.1; h <= 0.95; h += 0.1) {
          if (sdf(x + dx * 0.7, L + h, z + dz * 0.7) <= 0) {
            top = h;
            break;
          }
        }
        const room = top >= 0 && sdf(x + dx * 0.7, L + top + p.eyeH * 0.8, z + dz * 0.7) <= 0;
        p.bankPush = (p.bankPush || 0) + dt;
        if (room && (it.jumpPressed || p.bankPush > 0.35)) {
          p.bankPush = 0;
          p.vel.y = Math.sqrt(2 * PLAYER.gravity * (floatDepth + top + 0.35));
          p.vel.x = dx * 1.8;
          p.vel.z = dz * 1.8;
          p.climbOutT = 0.5;
        }
      } else p.bankPush = 0;
    }
  } else {
    w.swimming = false;
    w.submerged = p.pos.y + p.eyeH < L - 0.04;
    if (w.depth > 0.05 && p.grounded) {
      const fct = 1 - 0.55 * Math.min(1, w.depth / floatDepth);
      const sp = Math.hypot(p.vel.x, p.vel.z);
      const cap = PLAYER.walk * fct;
      if (sp > cap) {
        p.vel.x *= cap / sp;
        p.vel.z *= cap / sp;
      }
    }
  }
  p.climbOutT = Math.max(0, (p.climbOutT || 0) - dt);
  w.wasSwimming = w.swimming;
  return true;
}
