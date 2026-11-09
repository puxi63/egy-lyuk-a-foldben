/* ==== world-gen.js — the density field's generator kernel (NOTES-20-startup): fills a slab of z-rows of the field.
   Shared by world.js generate() (main thread, Node QA) and field-worker.js (the start-up workers), so both build the
   very same bytes. Pure maths, no three.js and no field of its own (a worker must not allocate the 24 MB block). ==== */
import { CELL, DSCALE, NX, NY, NZ, ORIGIN } from './config.js';
import { fbm3, noise2 } from './noise.js';
import { LAYER_TOPS } from './materials.js';
import { cavityAt, nearSite } from './underground/sites.js';

const clamp8 = (v) => (v > 127 ? 127 : v < -127 ? -127 : Math.round(v));

/** Surface height of the garden inside the block: gentle bumps that fade to 0 at the block's edge (0 outside it). Also
 * read by props.js (the ladders' height cap, NOTES-32-ladder-coop). */
export function surfaceHeight(x, z) {
  const edge = Math.min(x - ORIGIN.x, -ORIGIN.x - x, z - ORIGIN.z, -ORIGIN.z - z);
  const fadeIn = Math.max(0, Math.min(1, (edge - 1) / 3));
  return (noise2(x * 0.15, z * 0.15) - 0.5) * 0.7 * fadeIn;
}

/**
 * The random cave pockets stop here (world y): the old block's bottom margin (ORIGIN.y + 3 when the block ended at
 * 476 m), kept when the block grew, so layers 1–7 generate as before; the mines of Erebor below are solid mountain rock
 * with only their own air (NOTES-6a-erebor).
 */
const POCKET_BOTTOM = -473;

/**
 * Fills the z-rows k0 ≤ k < k1 of the field into `out`, indexed i + NX · (j + NY · (k − k0)): the garden surface, cave
 * pockets from the second layer down (kept away from the set pieces), and the set-piece cavities of underground/sites.js.
 * The whole field (k0 = 0, k1 = NZ) is the block's own indexing. Deterministic: the save stores the terrain as
 * differences from this output.
 */
export function fillSlab(out, k0 = 0, k1 = NZ) {
  for (let k = k0; k < k1; k++) {
    const z = ORIGIN.z + k * CELL;
    const base = NX * NY * (k - k0);
    for (let i = 0; i < NX; i++) {
      const x = ORIGIN.x + i * CELL;
      const h = surfaceHeight(x, z);
      const edge = Math.min(x - ORIGIN.x, -ORIGIN.x - x, z - ORIGIN.z, -ORIGIN.z - z);
      for (let j = 0; j < NY; j++) {
        const y = ORIGIN.y + j * CELL;
        let d = h - y;
        if (y < -(LAYER_TOPS[1] + 3) && y > POCKET_BOTTOM && edge > 1.5 && !nearSite(x, y, z)) {
          // Cave pockets: carve where the noise is high; closed off near the block's walls.
          const n = fbm3(x * 0.11, y * 0.16, z * 0.11);
          d = Math.min(d, (0.66 - n) * 9 + Math.max(0, 3 - edge));
        }
        if (edge > 0.6) {
          const c = cavityAt(x, y, z);
          if (c < d) d = c;
        }
        out[base + i + NX * j] = clamp8((d / CELL) * DSCALE);
      }
    }
  }
  return out;
}
