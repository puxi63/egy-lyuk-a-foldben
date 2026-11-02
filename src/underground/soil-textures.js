/* ==== underground/soil-textures.js — the underground's textures as three.js objects: the soil array (for the
   triplanar terrain shader) and the brick and wood maps of the set pieces. They start neutral (mid-grey, so the game
   can draw at once) and get their procedural pixels from the generator worker (gen.js) a moment later. ==== */
import * as THREE from 'three';
import { requestGen } from './gen.js';
import { S, SOIL_LAYERS } from './soil-gen.js';

export { SOIL_LAYER } from './soil-gen.js';

function settle(tex) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function neutral(n, r, g, b, a) {
  const d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = a;
  }
  return d;
}

/** The soil array texture (SOIL_LAYERS layers of 256², RGBA8, mipmapped, repeat); filled by the worker. */
export function makeSoilArray() {
  const t0 = performance.now();
  const tex = settle(new THREE.DataArrayTexture(neutral(S * S * SOIL_LAYERS, 128, 128, 128, 100), S, S, SOIL_LAYERS));
  // The roots layer's alpha is its coverage: none until the real pixels arrive.
  tex.image.data.fill(0, S * S * 4 * 3, S * S * 4 * 4);
  requestGen('soil').then((r) => {
    tex.image.data.set(r.data);
    tex.needsUpdate = true;
    tex.userData.buildMs = performance.now() - t0;
    tex.userData.workerMs = r.ms;
  });
  return tex;
}

/** Brick and wood maps (+ height maps for the bump): { brick: { map, bump }, wood: { map, bump } }; filled by the worker. */
export function makeDecorTextures() {
  const mk = (r, g, b) => settle(new THREE.DataTexture(neutral(S * S, r, g, b, 255), S, S));
  const out = {
    brick: { map: mk(120, 60, 40), bump: mk(128, 128, 128) },
    wood: { map: mk(150, 110, 75), bump: mk(128, 128, 128) },
  };
  requestGen('maps').then((r) => {
    for (const k of ['brick', 'wood']) {
      out[k].map.image.data.set(r[k].col);
      out[k].bump.image.data.set(r[k].hgt);
      out[k].map.needsUpdate = true;
      out[k].bump.needsUpdate = true;
    }
  });
  return out;
}
