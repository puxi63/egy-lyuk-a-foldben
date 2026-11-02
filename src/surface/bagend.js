/* ==== surface/bagend.js — Zsáklak (Bag End): the hill with the round green door, the round windows, bell, bench with
   pipe and book, pine-cone stool, pumpkins, chimneys, the oak above, the front garden, gate with sign and letterbox ==== */
import * as THREE from 'three';
import { plant } from './flora.js';
import { box, cyl, quad, rng, trs } from './kit.js';
import {
  barrel, bench, blob, bush, chimney, fence, flowerClump, hedge, holeHill, lantern, pumpkin, roundDoor, roundWindow, tree,
} from './parts.js';
import { FIREFLY_SPOTS } from './fireflies.js';
import { SIGN_UV } from './textures.js';

/** Where Bag End's door is (world) and which way it faces (towards the pit, −z). */
export const BAG_END = { x: -8, z: 23, yaw: Math.PI };

/**
 * Builds Bag End into the batch. Returns { smoke: [world points], colliders: [{x, z, r}] }.
 * Local frame: x to the right as seen from the garden, +z out of the door (world −z), y up.
 */
export function buildBagEnd(batch) {
  const rand = rng(2024);
  FIREFLY_SPOTS.length = 0; // night extras: Bag End is built first; a rebuilt surface starts a fresh list
  const smoke = [];
  const colliders = [];
  const hill = holeHill(batch, BAG_END.x, 0, BAG_END.z, BAG_END.yaw, {
    w: 13, d: 17, faceH: 2.6, topH: 6.2, curve: 1.1, seed: 4, faceColor: 0xb8a07a, turfColor: 0x4c7a26,
  });
  const F = hill.F;
  const fz = hill.faceZ;

  // The door: the round green door with the brass knob in the exact centre, a ring of stones around it.
  roundDoor(F, 0, fz(0), 0.9, 0x2f7a3e, { stones: true, frameColor: 0xc0a078 });
  // The bell by the door: bracket, brass bell and its pull.
  F.add('wood', box(0.32, 0.05, 0.05, 1), 0x8a7058, trs(1.35, 2.0, fz(1.35) + 0.16), { ao: 0 });
  const bellPts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    bellPts.push(new THREE.Vector2(0.035 + 0.075 * t * t, -t * 0.16));
  }
  F.add('plain', new THREE.LatheGeometry(bellPts, 10), 0xd8b048, trs(1.48, 1.98, fz(1.35) + 0.16), { ao: 0 });
  F.add('plain', cyl(0.005, 0.005, 0.5, 3), 0x8a7a60, trs(1.48, 1.62, fz(1.35) + 0.17), { ao: 0 });

  // Round windows with small panes and flower boxes (deep-set: a darker plaster ring around each).
  for (const [lx, cy, R, fl] of [[-3.1, 1.35, 0.55, [0xf0c030, 0x9a60c0, 0xf08030]], [3.1, 1.35, 0.55, [0xe85a8a, 0xf0e0f0, 0xf0c030]], [5.4, 1.1, 0.36, [0x9a60c0, 0xf0c030]]]) {
    const z = fz(lx);
    const ring = new THREE.RingGeometry(R + 0.06, R + 0.2, 20);
    F.add('plaster', ring, 0xa89470, trs(lx, cy, z + 0.03), { ao: 0 });
    roundWindow(F, lx, cy, z, R, { flowers: fl, boxColor: 0x5a7a40, panes: lx > 5 ? 4 : 6 });
  }
  // A lantern on a bracket beside the door.
  F.add('wood', box(0.05, 0.05, 0.3, 1), 0x6a5a48, trs(-1.35, 1.95, fz(-1.35) + 0.15), { ao: 0 });
  lantern(F, -1.35, 1.7, fz(-1.35) + 0.32, false);

  // The bench in front, with Bilbo's pipe and an open book on it.
  const bm = trs(-3.0, 0, fz(-3.0) + 0.45);
  bench(F, bm, 1.5, 0xa8845a);
  blob(batch, ...wxz(F, -3.0, fz(-3.0) + 0.45), 1.0, 0.45);
  // The open book: two slightly tilted pages on a cover.
  F.add('plain', box(0.34, 0.02, 0.24, 1), 0x6a2a1a, trs(-3.35, 0.46, fz(-3.0) + 0.47, 0, 0.2), { ao: 0 });
  for (const s of [-1, 1]) F.add('plain', box(0.16, 0.012, 0.22, 1), 0xf2ead8, trs(-3.35 + s * 0.08, 0.48, fz(-3.0) + 0.47, 0, 0.2, s * -0.08), { ao: 0 });
  // The pipe: long stem and bowl.
  F.add('wood', cyl(0.008, 0.008, 0.3, 4), 0xa07a50, trs(-2.6, 0.465, fz(-3.0) + 0.5, 0, 0.6, Math.PI / 2), { ao: 0 });
  F.add('wood', cyl(0.03, 0.022, 0.06, 8), 0x7a5030, trs(-2.48, 0.49, fz(-3.0) + 0.42), { ao: 0 });

  // The stool with the giant pine cone, and pumpkins by the steps.
  F.add('wood', cyl(0.24, 0.26, 0.42, 12), 0xc0a080, trs(2.0, 0.21, fz(2.0) + 0.55), { ao: 0.3 });
  const cone = new THREE.SphereGeometry(0.22, 12, 10);
  {
    // Overlapping scales: a stepped profile.
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = 1 + 0.12 * Math.abs(Math.sin(y * 40)) - y * 0.6;
      p.setXYZ(i, p.getX(i) * k, y * 1.5, p.getZ(i) * k);
    }
    cone.computeVertexNormals();
  }
  F.add('plain', cone, 0x8a5a30, trs(2.0, 0.42 + 0.32, fz(2.0) + 0.55), { ao: 0 });
  pumpkin(F, 2.7, 1.3, 0.34);
  pumpkin(F, 3.2, 1.0, 0.24, 0xe89030);
  pumpkin(F, -1.6, 1.25, 0.22, 0xd86a18);
  blob(batch, ...wxz(F, 2.8, 1.2), 0.7, 0.5);

  // Firewood stack under a little lean-to roof, and the water butt.
  const fwX = 5.9;
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k < 6 - row; k++) {
      const log = cyl(0.09, 0.09, 0.7, 7);
      log.rotateX(Math.PI / 2);
      F.add('wood', log, 0xb89878, trs(fwX - 0.5 + k * 0.19 + row * 0.095, 0.09 + row * 0.16, fz(fwX) + 0.45), { ao: 0.4 });
    }
  }
  F.add('roof', box(1.5, 0.05, 0.9, 1), 0xffffff, trs(fwX, 0.95, fz(fwX) + 0.45, 0.25), { ao: 0 });
  barrel(F, trs(-5.4, 0.45, fz(-5.4) + 0.45), 0.9, 0.33);
  blob(batch, ...wxz(F, -5.4, fz(-5.4) + 0.45), 0.55);

  // Chimneys on the hill (several fireplaces), and the great oak above Bag End.
  smoke.push(chimney(F, 2.6, hill.heightAt(2.6, -5.5), -5.5, 'stack'));
  smoke.push(chimney(F, -4.2, hill.heightAt(-4.2, -8), -8, 'pipe'));
  const oakW = F.toWorld(1.2, 0, -12.5);
  tree(batch, oakW.x, hill.heightAt(1.2, -12.5) - 0.3, oakW.z, 1.25, 'oak', 9);
  // Shrubs along the face and on the slope.
  for (const [lx, lz, r, c] of [[-6.6, 0.4, 0.55, 0x4a7a2a], [6.9, 0.2, 0.5, 0x52822e], [-1.5, 0.35, 0.3, 0x3f6e26], [1.4, 0.3, 0.28, 0x3f6e26], [-6, -3, 0.7, 0x4a7a2a], [5.5, -3.5, 0.6, 0x4a7a2a]]) {
    const w = F.toWorld(lx, 0, lz);
    bush(batch, w.x, Math.max(0, hill.heightAt(lx, lz) - 0.2), w.z, r, c, lx * 7);
  }
  // A dry-stone base course along the face, and ivy creeping over the plaster at the ends.
  for (let lx = -6.1; lx < 6.1; lx += 0.42) {
    if (Math.abs(lx) < 1.25) continue;
    for (let row = 0; row < 2; row++) {
      const x = lx + (row % 2) * 0.2;
      F.add('stone', box(0.4 + rand() * 0.06, 0.22, 0.2, 1.6), new THREE.Color().setHSL(0.09, 0.08, 0.58 + rand() * 0.14), trs(x, 0.11 + row * 0.22, fz(x) + 0.1, 0, (rand() - 0.5) * 0.1), { ao: 0.5 });
    }
  }
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const lx = side * (4.3 + rand() * 1.9);
    const ly = 0.6 + rand() * 1.7;
    const ivy = new THREE.IcosahedronGeometry(0.3 + rand() * 0.2, 1);
    F.add('foliage', ivy, 0x3f6a24, trs(lx, ly, fz(lx) + 0.06, 0, 0, 0, [1.2, 1, 0.35]), { ao: 0, jitter: 0.15 });
  }
  // Climbing flowers at the foot of the face.
  for (let i = 0; i < 16; i++) {
    const lx = -6.5 + i * 0.85 + rand() * 0.3;
    if (Math.abs(lx) < 1.2) continue;
    flowerClump(F, lx, fz(lx) + 0.25, [0xf0c030, 0xe85a8a, 0x9a60c0, 0xf4f0e0][i % 4], i % 3 === 0, 5);
  }

  // The front garden: the stone path from the gate to the door, flower beds either side with stone edging.
  const gateZ = 5.5;
  for (let z = 0.55; z < gateZ - 0.1; z += 0.62) {
    for (const sx of [-0.33, 0.33]) {
      const w = 0.5 + rand() * 0.14;
      const st = box(w, 0.06, 0.52 + rand() * 0.1, 1.6);
      F.add('flag', st, new THREE.Color().setHSL(0.1, 0.06, 0.62 + rand() * 0.12), trs(sx + (rand() - 0.5) * 0.06, 0.02, z + (rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.15), { ao: 0 });
    }
  }
  for (const side of [-1, 1]) {
    const x0 = side * 0.85;
    const x1 = side * 5.2;
    const bed = box(Math.abs(x1 - x0), 0.12, 3.8, 1);
    F.add('soil', bed, 0xb8a490, trs((x0 + x1) / 2, 0.04, 2.95), { ao: 0 });
    // Stone edging.
    for (let z = 1.05; z < 4.9; z += 0.3) {
      F.add('stone', box(0.16, 0.12, 0.26, 2), 0xb8b0a0, trs(x0, 0.06, z, 0, rand() * 0.3), { ao: 0 });
    }
    // Planting: hollyhocks at the back, lavender and marigolds in front.
    for (let k = 0; k < 26; k++) {
      const lx = x0 + (x1 - x0) * (0.08 + rand() * 0.86);
      const lz = 1.25 + rand() * 3.4;
      const backRow = lz < 2.2;
      const c = backRow ? [0xe85a8a, 0xf4e0f0, 0xb03050][k % 3] : [0x9a60c0, 0xf0b020, 0xf07020, 0xf4f0e0, 0x8070d0][k % 5];
      flowerClump(F, lx, lz, c, backRow, backRow ? 3 : 6);
    }
    // Lush cottage-garden fill between them: leafy clumps, daisies and pinks spilling over the stone edging.
    for (let k = 0; k < 34; k++) {
      const lx = x0 + (x1 - x0) * (0.03 + rand() * 0.94);
      const lz = 1.1 + rand() * 3.7;
      const w = F.toWorld(lx, 0, lz);
      plant(batch, w.x, w.y + 0.08, w.z, ['leafy', 'leafy', 'daisy', 'cottage', 'meadow', 'lavender'][k % 6], { tint: [0xf4b0c8, 0xffffff, 0xf0a030][k % 3], scale: 0.9 });
    }
  }
  // Front hedge with the gate gap, split-rail fences at the sides back to the hill.
  const wp = (pts) => pts.map(([lx, lz]) => wxz(F, lx, lz));
  hedge(batch, wp([[-7.6, gateZ], [-0.75, gateZ]]), 1.0, 0.7, 0x3c6624, 21);
  hedge(batch, wp([[0.75, gateZ], [7.6, gateZ]]), 1.0, 0.7, 0x3c6624, 22);
  // night extras (NOTES-28-night): fireflies over the front hedge and the two flower beds (no rand() used here).
  for (const [lx, lz, rx, rz] of [[-4.2, gateZ, 3.4, 0.8], [4.2, gateZ, 3.4, 0.8], [-3.0, 2.95, 2.2, 1.9], [3.0, 2.95, 2.2, 1.9]]) {
    const w = F.toWorld(lx, 0, lz);
    FIREFLY_SPOTS.push({ x: w.x, y: w.y, z: w.z, rx, rz });
  }
  fence(batch, wp([[-7.6, gateZ], [-7.4, 0.2]]));
  fence(batch, wp([[7.6, gateZ], [7.4, 0.2]]));

  // The gate: two posts, a ledged gate leaf (ajar) and the sign hanging on it.
  for (const sx of [-0.72, 0.72]) {
    const post = box(0.14, 1.35, 0.14, 1);
    post.translate(0, 0.62, 0);
    F.add('wood', post, 0xb8a088, trs(sx, 0, gateZ), { ao: 0.4 });
    F.add('wood', new THREE.SphereGeometry(0.09, 8, 6), 0xa08870, trs(sx, 1.33, gateZ), { ao: 0 });
  }
  const gate = trs(-0.66, 0, gateZ, 0, -0.45);
  for (const yy of [0.25, 0.55, 0.85]) F.add('wood', box(1.28, 0.08, 0.04, 1), 0xd0c4a8, gate.clone().multiply(trs(0.64, yy, 0)), { ao: 0 });
  for (const xx of [0.05, 0.45, 0.85, 1.25]) F.add('wood', box(0.07, 0.8, 0.035, 1), 0xd0c4a8, gate.clone().multiply(trs(xx, 0.55, 0.03)), { ao: 0 });
  F.add('wood', box(1.4, 0.06, 0.035, 1), 0xd0c4a8, gate.clone().multiply(trs(0.64, 0.56, 0.035, 0, 0, 0.55)), { ao: 0 });
  // "Belépés csak ünnepi ügyben" (placeholder translation of "No admittance except on party business", see textures.js).
  F.add('sign', quad(0.62, 0.31, SIGN_UV.gate), 0xffffff, gate.clone().multiply(trs(0.66, 0.68, 0.07)), { ao: 0 });

  // The letterbox on a post outside the gate.
  {
    const mx = 1.35;
    const mz = gateZ + 0.35;
    const p = box(0.1, 1.0, 0.1, 1);
    p.translate(0, 0.5, 0);
    F.add('wood', p, 0xa89078, trs(mx, 0, mz), { ao: 0.4 });
    F.add('wood', box(0.34, 0.26, 0.42, 2), 0xb04a2a, trs(mx, 1.12, mz), { ao: 0 });
    F.add('roof', box(0.44, 0.04, 0.5, 2), 0xffffff, trs(mx, 1.28, mz, 0, 0, 0.12), { ao: 0 });
    F.add('plain', box(0.12, 0.03, 0.02, 1), 0x2a2420, trs(mx, 1.16, mz + 0.215), { ao: 0 });
  }

  // Colliders for the integrator (circles in world xz): the hill and the hedges are solid, the garden is not.
  for (let lx = -6; lx <= 6; lx += 2) {
    const w = F.toWorld(lx, 0, fz(lx) - 1.6);
    colliders.push({ x: w.x, z: w.z, r: 1.6 });
  }
  for (let lx = -4; lx <= 4; lx += 4) {
    const w = F.toWorld(lx, 0, -7);
    colliders.push({ x: w.x, z: w.z, r: 5 });
  }
  return { smoke, colliders };
}

/** World [x, z] of a local point of a frame. */
function wxz(F, lx, lz) {
  const w = F.toWorld(lx, 0, lz);
  return [w.x, w.z];
}

