/* ==== surface/edge-fence.js — the edge of the walkable Shire (NOTES-44-pickup-edge, TODO item 36) ====
 * The players are kept inside a ±60 m square (player.js, edge.js EDGE.surface); before, nothing showed where. A rough
 * split-timber field fence (the same build as the Shire's lane fences, parts.js fence: posts every ~2.2 m, two rails,
 * weathered grey-brown) now runs round the square just outside the bound, over the lanes too, following the ground.
 * One accumulated geometry added to the batch's 'wood' material, whose bounding sphere puts it in the near sector that
 * exists anyway: no new draw call. Its own random numbers (it is added last), so nothing else in the Shire changes. */
import * as THREE from 'three';
import { EDGE } from '../edge.js';
import { groundHeight } from './ground.js';
import { box, rng } from './kit.js';
import { Accum } from './trees.js';

/** Metres outside the bound (the player's body stops 0.25 m inside it, so the rails stay just out of reach). */
const OUT = 0.6;
/** Polyline step along each side (the fence follows the ground between its points). */
const STEP = 4.4;

/** Adds the fence round the walkable square to `batch`. */
export function edgeFence(batch) {
  const rand = rng(4460);
  const acc = new Accum();
  const B = EDGE.surface + OUT;
  const corners = [[-B, -B], [B, -B], [B, B], [-B, B], [-B, -B]];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  const post = box(0.13, 1.1, 0.13, 1);
  post.translate(0, 0.45, 0);
  const postCol = new THREE.Color(0xc0b0a0);
  const railCol = new THREE.Color(0xb8a890);
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s];
    const [bx, bz] = corners[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / STEP);
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n;
      const z0 = az + ((bz - az) * k) / n;
      const x1 = ax + ((bx - ax) * (k + 1)) / n;
      const z1 = az + ((bz - az) * (k + 1)) / n;
      const y0 = groundHeight(x0, z0);
      const y1 = groundHeight(x1, z1);
      // Posts every 2.2 m (a piece's first post is the previous piece's last).
      for (const t of k === 0 ? [0, 0.5, 1] : [0.5, 1]) {
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        e.set((rand() - 0.5) * 0.08, yaw + rand(), (rand() - 0.5) * 0.08, 'YXZ');
        m.compose(v.set(x, y0 + (y1 - y0) * t, z), q.setFromEuler(e), one);
        acc.add(post, m, postCol.clone().multiplyScalar(0.94 + rand() * 0.12));
      }
      const plen = Math.hypot(x1 - x0, z1 - z0);
      const tilt = Math.atan2(y1 - y0, plen);
      for (const ry of [0.43, 0.81]) {
        const rail = box(plen, 0.07, 0.05, 0.8);
        rail.rotateZ(tilt);
        e.set(0, yaw - Math.PI / 2, (rand() - 0.5) * 0.02, 'YXZ');
        m.compose(v.set((x0 + x1) / 2, (y0 + y1) / 2 + ry + (rand() - 0.5) * 0.04, (z0 + z1) / 2), q.setFromEuler(e), one);
        acc.add(rail, m, railCol.clone().multiplyScalar(0.92 + rand() * 0.12));
      }
    }
  }
  batch.add('wood', acc.geometry(), 0xffffff, null, { ao: 0, jitter: 0 });
}
