/* ==== bagend/atlas-worker.js — paints the interior's texture atlas off the main thread (OffscreenCanvas) ==== */
import { N, paintAtlas } from './atlas-paint.js';

self.onmessage = () => {
  const oc = new OffscreenCanvas(N, N);
  paintAtlas(oc.getContext('2d'), (w, h) => new OffscreenCanvas(w, h));
  const bitmap = oc.transferToImageBitmap();
  self.postMessage({ bitmap }, [bitmap]);
};
