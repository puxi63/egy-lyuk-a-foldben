/* ==== field-worker.js — a start-up worker of the density field (NOTES-20-startup): builds the z-row slabs it is
   given with world-gen.js fillSlab (the same modules as the main thread, so a change to the sites flows in) and
   transfers each slab back without a copy. Module worker; no three.js, no import map in workers. ==== */
import { NX, NY } from './config.js';
import { fillSlab } from './world-gen.js';

self.onmessage = (ev) => {
  const { id, k0, k1 } = ev.data;
  const t0 = performance.now();
  const slab = fillSlab(new Int8Array(NX * NY * (k1 - k0)), k0, k1);
  self.postMessage({ id, k0, k1, slab, ms: performance.now() - t0 }, [slab.buffer]);
};
