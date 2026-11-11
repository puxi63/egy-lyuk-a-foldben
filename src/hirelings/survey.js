/* ==== hirelings/survey.js — what the players have explored in the upper layers (NOTES-42-hirelings) ====
 * A flood fill of the open air on a 0.5 m grid (every 2nd density sample), from the open air above the pit down to
 * LIMIT_DEPTH: every air cell connected to the surface through air is explored (the players' tunnels and shafts and
 * the generated rooms they broke into). Time-sliced: `step(ms)` runs the fill as a generator for at most `ms` per call
 * (game.update gives it ~1 ms a frame while it runs, a full run is some 10–40 ms of work in all), so no frame hitches.
 * Run once per work shift (about every 2.7 minutes) and when Thrór's map opens. A finished run leaves:
 *  - `cand`: lantern spots in the players' own (dug) tunnels, in fill order (nearest the surface first): a floor cell
 *    with 1.5 m of headroom and a solid wall beside it at lantern height ({ x, y, z, nx, nz }: y = the floor, n = towards
 *    the wall);
 *  - `cells[l]`: the explored cells of layer l (Int32Array of grid indices; `pos(v)` gives the world point) for Ori's map;
 *  - `floors[l]`: up to FLOOR_MAX dug floor spots per layer for the standing figures.
 * The working arrays are allocated once (≈ 3.7 MB) and reused. ==== */
import { CELL, DSCALE, NX, NY, NZ, ORIGIN } from '../config.js';
import { LAYER_TOPS } from '../materials.js';
import { baseField } from '../save.js';
import { density } from '../world.js';
import { LIMIT_DEPTH, MAX_LAYER } from './rules.js';

const STEP = 2; // samples per grid cell (0.5 m)
const AIR = Math.round((0.2 / CELL) * DSCALE); // a sample this close to the surface (0.2 m) counts as open
const FLOOR_MAX = 256;
const GX = Math.floor((NX - 1) / STEP) + 1;
const GZ = Math.floor((NZ - 1) / STEP) + 1;
const J_TOP = NY - 1; // y = +4 m: open air over the whole block
const J_BOT = Math.max(0, Math.floor((-(LIMIT_DEPTH + 2) - ORIGIN.y) / CELL / STEP) * STEP);
const GY = Math.floor((J_TOP - J_BOT) / STEP) + 1;
const TOTAL = GX * GY * GZ;

/** The density sample index of grid cell (a, b, c). */
const sIdx = (a, b, c) => a * STEP + NX * (J_BOT + b * STEP + NY * (c * STEP));

export class Survey {
  constructor() {
    this.mark = null; // Uint8Array: 1 = explored air
    this.order = null; // Int32Array: the cells in fill order
    this.job = null;
    this.ready = false; // a run has finished
    this.runs = 0;
    this.stamp = 0; // performance.now() at the last finish
    this.cand = [];
    this.cells = [];
    this.floors = [];
    this.lastMs = 0; // the last run's total work time (QA / cost note)
    this.lastN = 0;
  }

  get running() {
    return !!this.job;
  }

  /** World point of grid cell v. */
  pos(v, out = {}) {
    const a = v % GX;
    const b = Math.floor(v / GX) % GY;
    const c = Math.floor(v / (GX * GY));
    out.x = ORIGIN.x + a * STEP * CELL;
    out.y = ORIGIN.y + (J_BOT + b * STEP) * CELL;
    out.z = ORIGIN.z + c * STEP * CELL;
    return out;
  }

  /** Starts a new run (a running one goes on). */
  start() {
    if (this.job || !baseField()) return false;
    this.job = this.run();
    this.workMs = 0;
    return true;
  }

  /** Works on the running fill for about `ms`; true when a run finished in this call. */
  step(ms = 1) {
    if (!this.job) return false;
    const t0 = performance.now();
    for (;;) {
      const r = this.job.next();
      if (r.done) {
        this.job = null;
        this.workMs += performance.now() - t0;
        this.lastMs = this.workMs;
        return true;
      }
      if (performance.now() - t0 >= ms) break;
    }
    this.workMs += performance.now() - t0;
    return false;
  }

  /** A whole run at once (Thrór's map opened before any run finished, the QA). */
  runNow() {
    if (!this.job) this.start();
    while (this.job) this.step(1000);
    return this.ready;
  }

  *run() {
    const base = baseField();
    if (!this.mark) {
      this.mark = new Uint8Array(TOTAL);
      this.order = new Int32Array(TOTAL);
    }
    const mark = this.mark;
    const order = this.order;
    mark.fill(0);
    let n = 0;
    const top = GY - 1;
    for (let c = 0; c < GZ; c++) {
      for (let a = 0; a < GX; a++) {
        const v = a + GX * (top + GY * c);
        if (density[sIdx(a, top, c)] < AIR) {
          mark[v] = 1;
          order[n++] = v;
        }
      }
    }
    const open = (a, b, c) => density[sIdx(a, b, c)] < AIR;
    let head = 0;
    const plane = GX * GY;
    while (head < n) {
      const v = order[head++];
      const a = v % GX;
      const b = Math.floor(v / GX) % GY;
      const c = Math.floor(v / plane);
      if (a > 0 && !mark[v - 1] && open(a - 1, b, c)) { mark[v - 1] = 1; order[n++] = v - 1; }
      if (a < GX - 1 && !mark[v + 1] && open(a + 1, b, c)) { mark[v + 1] = 1; order[n++] = v + 1; }
      if (b > 0 && !mark[v - GX] && open(a, b - 1, c)) { mark[v - GX] = 1; order[n++] = v - GX; }
      if (b < GY - 1 && !mark[v + GX] && open(a, b + 1, c)) { mark[v + GX] = 1; order[n++] = v + GX; }
      if (c > 0 && !mark[v - plane] && open(a, b, c - 1)) { mark[v - plane] = 1; order[n++] = v - plane; }
      if (c < GZ - 1 && !mark[v + plane] && open(a, b, c + 1)) { mark[v + plane] = 1; order[n++] = v + plane; }
      if ((head & 1023) === 0) yield;
    }
    // Derive what the jobs read: the explored cells per layer, the lantern spots, the floor spots.
    // Typed buffers (no growing JS arrays: the run allocates almost nothing while it is spread over frames).
    const L = MAX_LAYER + 1;
    if (!this.cellBuf || this.cellBuf.length < n) this.cellBuf = new Int32Array(Math.max(n, 1 << 16));
    const cellBuf = this.cellBuf;
    const cellL = new Uint8Array(n);
    const nCell = new Int32Array(L);
    const floors = Array.from({ length: L }, () => new Float32Array(FLOOR_MAX * 3));
    const nFloor = new Int32Array(L);
    const seen = new Array(MAX_LAYER + 1).fill(0);
    const cand = [];
    const p = {};
    const solid = (a, b, c) => b >= 0 && b < GY && a >= 0 && a < GX && c >= 0 && c < GZ && !mark[a + GX * (b + GY * c)] && density[sIdx(a, b, c)] >= AIR;
    const air = (a, b, c) => b >= 0 && b < GY && mark[a + GX * (b + GY * c)] === 1;
    for (let q = 0; q < n; q++) {
      if (q && (q & 1023) === 0) yield; // (at the top: the `continue`s below must not skip it)
      const v = order[q];
      this.pos(v, p);
      if (p.y > -1 || p.y < -LIMIT_DEPTH) continue;
      const d = -p.y;
      let l = 0;
      while (l < MAX_LAYER && d >= LAYER_TOPS[l + 1]) l++;
      cellBuf[q] = v;
      cellL[q] = l + 1;
      nCell[l]++;
      const a = v % GX;
      const b = Math.floor(v / GX) % GY;
      const c = Math.floor(v / plane);
      const s = sIdx(a, b, c);
      // A floor cell of the players' own tunnels (dug: solid in the generated field) with headroom.
      if (base[s] > 0 && solid(a, b - 1, c) && air(a, b + 1, c) && air(a, b + 2, c) && air(a, b + 3, c)) {
        seen[l]++;
        const k = nFloor[l] < FLOOR_MAX ? nFloor[l]++ : Math.floor(Math.random() * seen[l]);
        if (k < FLOOR_MAX) {
          const f = floors[l];
          f[k * 3] = p.x;
          f[k * 3 + 1] = p.y - CELL;
          f[k * 3 + 2] = p.z;
        }
        // A wall beside it at lantern height (+1.5 m, the cell three above).
        const bw = b + 3;
        let nx = 0;
        let nz = 0;
        if (solid(a + 1, bw, c)) nx = 1;
        else if (solid(a - 1, bw, c)) nx = -1;
        else if (solid(a, bw, c + 1)) nz = 1;
        else if (solid(a, bw, c - 1)) nz = -1;
        if (nx || nz) cand.push({ x: p.x, y: p.y - CELL, z: p.z, nx, nz, l });
      }
    }
    const cells = Array.from({ length: L }, (x, l) => new Int32Array(nCell[l]));
    const fill = new Int32Array(L);
    for (let q = 0; q < n; q++) if (cellL[q]) { const l = cellL[q] - 1; cells[l][fill[l]++] = cellBuf[q]; }
    this.cells = cells;
    this.floors = floors.map((f, l) => f.slice(0, nFloor[l] * 3));
    this.cand = cand;
    this.lastN = n;
    this.ready = true;
    this.runs++;
    this.stamp = performance.now();
  }
}
