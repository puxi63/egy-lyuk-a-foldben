/* ==== underground/gen-worker.js — the generator worker: the procedural texture pixels and the stone trolls' meshes,
   made off the main thread at start-up (module worker; no three.js, no import map in workers) ==== */
import { genBrickData, genSoilData, genWoodData } from './soil-gen.js';
import { meshTroll, TROLLS } from './trolls.js';

self.onmessage = (ev) => {
  const { id, job } = ev.data;
  const t0 = performance.now();
  if (job === 'soil') {
    const data = genSoilData();
    self.postMessage({ id, data, ms: performance.now() - t0 }, [data.buffer]);
  } else if (job === 'maps') {
    const brick = genBrickData();
    const wood = genWoodData();
    self.postMessage({ id, brick, wood, ms: performance.now() - t0 }, [brick.col.buffer, brick.hgt.buffer, wood.col.buffer, wood.hgt.buffer]);
  } else if (job === 'trolls') {
    const meshes = TROLLS.map((d) => meshTroll(d));
    const buffers = [];
    for (const m of meshes) buffers.push(m.position.buffer, m.normal.buffer, m.uv.buffer, m.color.buffer);
    self.postMessage({ id, meshes, ms: performance.now() - t0 }, buffers);
  }
};
