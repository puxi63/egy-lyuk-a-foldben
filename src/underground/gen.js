/* ==== underground/gen.js — the main thread's side of the generator worker: requestGen(job) → Promise of the result
   ('soil': the soil array pixels; 'maps': brick and wood pixels; 'trolls': the three trolls' raw meshes). Two
   workers, created on the first request: the soil on one, the rest on the other, so both finish about together. ==== */
const workers = [null, null];
let nextId = 1;
const pending = new Map();

function worker(n) {
  if (!workers[n]) {
    const w = new Worker(new URL('./gen-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => {
      const p = pending.get(ev.data.id);
      pending.delete(ev.data.id);
      if (p) p(ev.data);
      // Both done: the workers are not needed any more.
      if (!pending.size) {
        for (let i = 0; i < workers.length; i++) {
          workers[i]?.terminate();
          workers[i] = null;
        }
      }
    };
    workers[n] = w;
  }
  return workers[n];
}

export function requestGen(job) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker(job === 'soil' ? 0 : 1).postMessage({ id, job });
  });
}
