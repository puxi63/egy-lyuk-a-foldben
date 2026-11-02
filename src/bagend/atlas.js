/* ==== bagend/atlas.js — the one texture atlas of Bag End's interior (2048², painted procedurally) ====
 * Every surface of the interior samples this single sRGB canvas texture, so the whole house draws with one material.
 * The tile layout (TILES) is known at once; the painting (atlas-paint.js, ~1–1.5 s of CPU) runs in a module worker
 * with an OffscreenCanvas and arrives as an ImageBitmap that is drawn into the texture's canvas (fallback: painted on
 * the main thread). The interior is not visible at start (the players begin in the garden), so nobody sees it grey.
 * `TILES[name]` = { rect: [u0, v0, du, dv], m: [metres per repeat u, v] } (m is used by planar UV mapping). */
import * as THREE from 'three';
import { layout, N, paintAtlas } from './atlas-paint.js';

/** Tile registry (filled by buildAtlas()). */
export const TILES = {};

let atlasTexture = null;
/** Resolves when the atlas is painted. */
export let atlasReady = null;

/**
 * Creates the atlas texture (once) and starts painting it; returns the THREE texture at once.
 * @returns {THREE.CanvasTexture}
 */
export function buildAtlas() {
  if (atlasTexture) return atlasTexture;
  Object.assign(TILES, layout());
  const canvas = document.createElement('canvas');
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6a5a48';
  ctx.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  atlasTexture = t;
  const t0 = performance.now();
  const paintHere = () => {
    ctx.clearRect(0, 0, N, N);
    paintAtlas(ctx, (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    });
  };
  atlasReady = new Promise((resolve) => {
    const done = (how) => {
      t.needsUpdate = true;
      t.userData.paintMs = Math.round(performance.now() - t0);
      t.userData.paintedIn = how;
      resolve(t);
    };
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      paintHere();
      done('main');
      return;
    }
    try {
      const w = new Worker(new URL('./atlas-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        ctx.clearRect(0, 0, N, N);
        ctx.drawImage(e.data.bitmap, 0, 0);
        e.data.bitmap.close?.();
        w.terminate();
        done('worker');
      };
      w.onerror = () => {
        w.terminate();
        paintHere();
        done('main');
      };
      w.postMessage('paint');
    } catch {
      paintHere();
      done('main');
    }
  });
  return t;
}

/** The atlas canvas for debugging (null before buildAtlas()). */
export function atlasCanvas() {
  return atlasTexture ? atlasTexture.image : null;
}
