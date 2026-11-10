/* ==== world.js — the density field: generation, sampling (collision, raycast) and digging edits ==== */
import { CELL, CHUNK, CX, CY, CZ, DSCALE, EDGE_LOCK, NX, NY, NZ, ORIGIN } from './config.js';
import { MATS, materialAt } from './materials.js';
import { isLocked, lockTouches } from './underground/sites.js';
import { fillSlab } from './world-gen.js';

/** One signed density per sample: > 0 solid, <= 0 air; |value| / DSCALE cells is the distance to the surface. */
export const density = new Int8Array(NX * NY * NZ);
/** Bumped on every edit of a chunk's padded sample range; the terrain remeshes chunks whose version changed. */
export const chunkVersion = new Uint32Array(CX * CY * CZ);
/**
 * Samples digSphere turned from solid to air since the page loaded. Digging only ever lowers the density, so this
 * counts each sample once (save.js dugVolume adds it to one full count of the loaded field).
 */
export const digStats = { removedSamples: 0 };

const sIdx = (i, j, k) => i + NX * (j + NY * k);
const clamp8 = (v) => (v > 127 ? 127 : v < -127 ? -127 : Math.round(v));

/** Density outside the diggable block: solid ground below y = 0, air above (the open Shire around the pit). */
function analytic(j) {
  const y = ORIGIN.y + j * CELL;
  if (j < 0) return 127;
  return clamp8((-y / CELL) * DSCALE);
}

/** Sample with out-of-range handling (the outside is the analytic ground). */
export function getSample(i, j, k) {
  if (j < 0) return 127;
  if (i < 0 || k < 0 || i >= NX || k >= NZ || j >= NY) return analytic(j);
  return density[sIdx(i, j, k)];
}

/**
 * Fills the field on the calling thread: the garden surface, cave pockets from the second layer down (kept away from
 * the set pieces), and the set-piece cavities of underground/sites.js (world-gen.js fillSlab). Deterministic: the save
 * stores the terrain as differences from this output. The page builds the same bytes in workers at start-up
 * (field-gen.js, NOTES-20-startup); this stays the fallback (`?gen=main`) and the path of the Node QA scripts.
 */
export function generate() {
  const t0 = performance.now();
  fillSlab(density, 0, NZ);
  return performance.now() - t0;
}

/** Trilinear density at a world position, in density units. */
export function sampleDensity(x, y, z) {
  const gx = (x - ORIGIN.x) / CELL;
  const gy = (y - ORIGIN.y) / CELL;
  const gz = (z - ORIGIN.z) / CELL;
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const k = Math.floor(gz);
  const fx = gx - i;
  const fy = gy - j;
  const fz = gz - k;
  const c000 = getSample(i, j, k);
  const c100 = getSample(i + 1, j, k);
  const c010 = getSample(i, j + 1, k);
  const c110 = getSample(i + 1, j + 1, k);
  const c001 = getSample(i, j, k + 1);
  const c101 = getSample(i + 1, j, k + 1);
  const c011 = getSample(i, j + 1, k + 1);
  const c111 = getSample(i + 1, j + 1, k + 1);
  const x00 = c000 + (c100 - c000) * fx;
  const x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx;
  const x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}

/** Solid set pieces that are not part of the density (the stone trolls, walls, barrels, closed doors); see setPropField. */
let propField = null;

/**
 * Registers the props' signed distance function (metres, positive inside a prop; underground/decor.js does this), so
 * every sdf() caller (the player's collision) also bumps into the set pieces. Pass null to remove it.
 */
export function setPropField(fn) {
  propField = fn;
}

/**
 * Approximate signed distance in metres (positive inside solid), reliable within about 1 m of the surface. Includes
 * the registered prop field (the larger of the two wins); digging and raycasts use the density alone.
 */
export function sdf(x, y, z) {
  const t = (sampleDensity(x, y, z) / DSCALE) * CELL;
  if (propField === null) return t;
  const p = propField(x, y, z);
  return p > t ? p : t;
}

/** Outward surface normal (towards the air) at a position, written into `out`. */
export function normalAt(x, y, z, out) {
  const e = CELL;
  const nx = sampleDensity(x - e, y, z) - sampleDensity(x + e, y, z);
  const ny = sampleDensity(x, y - e, z) - sampleDensity(x, y + e, z);
  const nz = sampleDensity(x, y, z - e) - sampleDensity(x, y, z + e);
  const l = Math.hypot(nx, ny, nz) || 1;
  out.x = nx / l;
  out.y = ny / l;
  out.z = nz / l;
  return out;
}

/**
 * Marches a ray from `o` along unit `d` up to `maxDist`; returns the distance to the first solid hit, or -1.
 * Coarse 4 cm steps, then a short bisection.
 */
export function raycast(o, d, maxDist) {
  const step = 0.04;
  let prev = 0;
  for (let t = step; t <= maxDist; t += step) {
    if (sampleDensity(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) > 0) {
      let a = prev;
      let b = t;
      for (let n = 0; n < 5; n++) {
        const m = (a + b) / 2;
        if (sampleDensity(o.x + d.x * m, o.y + d.y * m, o.z + d.z * m) > 0) b = m;
        else a = m;
      }
      return b;
    }
    prev = t;
  }
  return -1;
}

/** Marks every chunk whose padded sample range [c·16 − 1, c·16 + 16] contains samples i0..i1 etc. */
function touchChunks(i0, i1, j0, j1, k0, k1) {
  const lo = (s) => Math.max(0, Math.ceil((s - CHUNK) / CHUNK));
  const hi = (s, n) => Math.min(n - 1, Math.floor((s + 1) / CHUNK));
  for (let cz = lo(k0); cz <= hi(k1, CZ); cz++) {
    for (let cy = lo(j0); cy <= hi(j1, CY); cy++) {
      for (let cx = lo(i0); cx <= hi(i1, CX); cx++) chunkVersion[cx + CX * (cy + CY * cz)]++;
    }
  }
}

/**
 * Digs towards a sphere of radius `r` at (x, y, z): every sample moves at most `bite` density units towards the
 * sphere's value per call, so the soil gives way in scrapes (about bite / 128 m per swing), not all at once.
 * Returns { removed, byMat: Float32Array of cubic metres per material }, counting samples that turned solid → air.
 */
export function digSphere(x, y, z, r, bite = 255) {
  const byMat = new Float32Array(MATS.length);
  const i0 = Math.max(EDGE_LOCK, Math.floor((x - r - ORIGIN.x) / CELL) - 1);
  const i1 = Math.min(NX - 1 - EDGE_LOCK, Math.ceil((x + r - ORIGIN.x) / CELL) + 1);
  const j0 = Math.max(EDGE_LOCK, Math.floor((y - r - ORIGIN.y) / CELL) - 1);
  const j1 = Math.min(NY - 1, Math.ceil((y + r - ORIGIN.y) / CELL) + 1);
  const k0 = Math.max(EDGE_LOCK, Math.floor((z - r - ORIGIN.z) / CELL) - 1);
  const k1 = Math.min(NZ - 1 - EDGE_LOCK, Math.ceil((z + r - ORIGIN.z) / CELL) + 1);
  if (i0 > i1 || j0 > j1 || k0 > k1) return { removed: 0, byMat };
  const vol = CELL * CELL * CELL;
  let removed = 0;
  const locked = lockTouches(x, y, z, r + 2 * CELL);
  let hitLock = false;
  for (let k = k0; k <= k1; k++) {
    const pz = ORIGIN.z + k * CELL - z;
    for (let j = j0; j <= j1; j++) {
      const py = ORIGIN.y + j * CELL - y;
      for (let i = i0; i <= i1; i++) {
        const px = ORIGIN.x + i * CELL - x;
        const s = sIdx(i, j, k);
        const old = density[s];
        const v = Math.max(clamp8(((Math.sqrt(px * px + py * py + pz * pz) - r) / CELL) * DSCALE), old - bite);
        if (v >= old) continue;
        // The locked shells (the co-op treasure niches, the lift stops' floors, ...) cannot be dug.
        if (locked && isLocked(px + x, py + y, pz + z)) {
          hitLock = true;
          continue;
        }
        if (old > 0 && v <= 0) {
          removed += vol;
          digStats.removedSamples++;
          byMat[materialAt(px + x, py + y, pz + z)] += vol;
        }
        density[s] = v;
      }
    }
  }
  touchChunks(i0, i1, j0, j1, k0, k1);
  if (hitLock && lockHook !== null) lockHook(x, y, z);
  return { removed, byMat };
}

/** NOTES-35-lift-doors-bag: called as fn(x, y, z) (the sphere's centre) when a dig left locked samples alone. */
let lockHook = null;

/** Registers the locked-dig listener (lift.js: the "you cannot dig the stop's floor" line); null removes it. */
export function setLockHook(fn) {
  lockHook = fn;
}

/**
 * NOTES-35-lift-doors-bag: restores a slab of soil: every sample in the box [x0, x1] × [y0, y1] × [z0, z1] becomes
 * solid by its distance below the top face y1 (the samples just above it get the matching surface value), never more
 * than `limit` (the generated field, so air the world was made with stays air; null = no cap). Air turned back into
 * soil that was solid in the field is taken off digStats, as fillSphere does. Returns the samples turned solid.
 */
export function fillBox(x0, x1, y0, y1, z0, z1, limit) {
  const i0 = Math.max(EDGE_LOCK, Math.ceil((x0 - ORIGIN.x) / CELL));
  const i1 = Math.min(NX - 1 - EDGE_LOCK, Math.floor((x1 - ORIGIN.x) / CELL));
  const j0 = Math.max(EDGE_LOCK, Math.ceil((y0 - ORIGIN.y) / CELL));
  const j1 = Math.min(NY - 1, Math.floor((y1 - ORIGIN.y) / CELL) + 2);
  const k0 = Math.max(EDGE_LOCK, Math.ceil((z0 - ORIGIN.z) / CELL));
  const k1 = Math.min(NZ - 1 - EDGE_LOCK, Math.floor((z1 - ORIGIN.z) / CELL));
  if (i0 > i1 || j0 > j1 || k0 > k1) return 0;
  let filled = 0;
  let changed = false;
  for (let k = k0; k <= k1; k++) {
    for (let j = j0; j <= j1; j++) {
      const target = clamp8(((y1 - (ORIGIN.y + j * CELL)) / CELL) * DSCALE);
      for (let i = i0; i <= i1; i++) {
        const s = sIdx(i, j, k);
        const old = density[s];
        const cap = limit ? limit[s] : 127;
        const v = target < cap ? target : cap;
        if (v <= old) continue;
        if (old <= 0 && v > 0) {
          filled++;
          digStats.removedSamples--;
        }
        density[s] = v;
        changed = true;
      }
    }
  }
  if (changed) touchChunks(i0, i1, j0, j1, k0, k1);
  return filled;
}

/**
 * Kihívás cave-in (modes/, NOTES-15-modes): pushes the samples in a sphere back towards the generated field `limit`
 * (never above it), so dug tunnels fill in again while the set pieces' own air stays air. A sample that turns back
 * from air to solid where the generated field was solid is taken off digStats, so dugVolume stays exact.
 * Returns the number of samples refilled.
 */
export function fillSphere(x, y, z, r, limit) {
  const i0 = Math.max(EDGE_LOCK, Math.floor((x - r - ORIGIN.x) / CELL) - 1);
  const i1 = Math.min(NX - 1 - EDGE_LOCK, Math.ceil((x + r - ORIGIN.x) / CELL) + 1);
  const j0 = Math.max(EDGE_LOCK, Math.floor((y - r - ORIGIN.y) / CELL) - 1);
  const j1 = Math.min(NY - 1, Math.ceil((y + r - ORIGIN.y) / CELL) + 1);
  const k0 = Math.max(EDGE_LOCK, Math.floor((z - r - ORIGIN.z) / CELL) - 1);
  const k1 = Math.min(NZ - 1 - EDGE_LOCK, Math.ceil((z + r - ORIGIN.z) / CELL) + 1);
  if (i0 > i1 || j0 > j1 || k0 > k1 || !limit) return 0;
  let filled = 0;
  for (let k = k0; k <= k1; k++) {
    const pz = ORIGIN.z + k * CELL - z;
    for (let j = j0; j <= j1; j++) {
      const py = ORIGIN.y + j * CELL - y;
      for (let i = i0; i <= i1; i++) {
        const px = ORIGIN.x + i * CELL - x;
        const s = sIdx(i, j, k);
        const old = density[s];
        const cap = limit[s];
        if (old >= cap) continue;
        // Inside the sphere: solid by the distance to its surface (as digSphere, sign flipped), capped by the field.
        const v = Math.min(cap, Math.max(old, clamp8(((r - Math.sqrt(px * px + py * py + pz * pz)) / CELL) * DSCALE)));
        if (v > old) {
          if (old <= 0 && v > 0) {
            filled++;
            if (cap > 0) digStats.removedSamples--;
          }
          density[s] = v;
        }
      }
    }
  }
  touchChunks(i0, i1, j0, j1, k0, k1);
  return filled;
}

/**
 * Copies a chunk's padded samples (18³, starting one sample before the chunk origin) into `out`.
 * Returns 0 when every sample is solid, 1 when every sample is air, 2 when the chunk has a surface.
 */
export function extractChunk(cx, cy, cz, out) {
  const P = CHUNK + 2;
  const oi = cx * CHUNK - 1;
  const oj = cy * CHUNK - 1;
  const ok = cz * CHUNK - 1;
  let solid = 0;
  let n = 0;
  for (let z = 0; z < P; z++) {
    const k = ok + z;
    for (let y = 0; y < P; y++) {
      const j = oj + y;
      // Rows inside the block read the field directly (NOTES-20-startup: getSample per sample was the load's largest
      // main-thread cost); the samples outside it still come from getSample.
      const inside = j >= 0 && j < NY && k >= 0 && k < NZ;
      const row = NX * (j + NY * k);
      for (let x = 0; x < P; x++) {
        const i = oi + x;
        const v = inside && i >= 0 && i < NX ? density[row + i] : getSample(i, j, k);
        out[n++] = v;
        if (v > 0) solid++;
      }
    }
  }
  if (solid === n) return 0;
  if (solid === 0) return 1;
  return 2;
}
