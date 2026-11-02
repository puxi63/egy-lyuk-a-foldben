/* ==== field-gen.js — the main thread's side of the start-up field workers (NOTES-20-startup). generateInWorkers()
   splits the block's z-rows into slabs, hands them out to a few module workers (field-worker.js) one at a time, and
   copies each transferred slab into world.js's density as it arrives; the main thread stays free meanwhile (the title
   screen keeps animating). The bytes are the same as world.js generate() (qa/startup/ident.mjs). ==== */
import { NX, NY, NZ } from './config.js';
import { density } from './world.js';

/** Z-rows per job: small enough that the workers finish about together, large enough that a round trip is cheap. */
const ROWS_PER_JOB = 4;

/** Workers to start: half the logical cores (the mesher and texture workers come right after), 2 to 6. */
function defaultWorkers() {
  const c = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  return Math.max(2, Math.min(6, Math.floor(c / 2)));
}

/**
 * Fills world.js `density` in workers. Resolves with { ms, workers, jobs, workerMs } (wall time from the call to the
 * last slab copied; workerMs is the summed kernel time of every job). Rejects if a worker fails, so the caller can
 * fall back to generate() on the main thread. `onProgress(done, total)` (optional) is called after each slab is copied
 * (the loading screen's progress line, NOTES-21-screens).
 */
export function generateInWorkers(count = defaultWorkers(), onProgress = null) {
  const t0 = performance.now();
  const jobs = [];
  for (let k = 0; k < NZ; k += ROWS_PER_JOB) jobs.push([k, Math.min(NZ, k + ROWS_PER_JOB)]);
  const n = Math.max(1, Math.min(count, jobs.length));
  return new Promise((resolve, reject) => {
    const workers = [];
    let next = 0;
    let done = 0;
    let workerMs = 0;
    let failed = false;
    const stop = () => workers.forEach((w) => w.terminate());
    const give = (w) => {
      if (next >= jobs.length) return;
      const [k0, k1] = jobs[next];
      w.postMessage({ id: next++, k0, k1 });
    };
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./field-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => {
        if (failed) return;
        const { k0, slab, ms } = ev.data;
        density.set(slab, NX * NY * k0);
        workerMs += ms;
        done++;
        onProgress?.(done, jobs.length); // loading screen (NOTES-21-screens)
        give(w);
        if (done === jobs.length) {
          stop();
          resolve({ ms: performance.now() - t0, workers: n, jobs: jobs.length, workerMs });
        }
      };
      w.onerror = (e) => {
        if (failed) return;
        failed = true;
        stop();
        reject(new Error(`field worker failed: ${e.message || e}`));
      };
      workers.push(w);
    }
    // Two jobs in flight per worker, so a worker never idles through the round trip.
    for (let r = 0; r < 2; r++) for (const w of workers) give(w);
  });
}
