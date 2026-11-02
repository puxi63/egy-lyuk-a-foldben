/* ==== surface/inn.js — A Zöld Sárkány (the Green Dragon): stone-and-timber front with a thatched roof, the outdoor
   serving counter at SHOP_POS under a little roof, the hanging painted dragon sign, barrels, chalkboard, lanterns ==== */
import * as THREE from 'three';
import { box, cyl, quad, rng, trs } from './kit.js';
import { at, barrel, bench, blob, bush, flowerClump, lantern } from './parts.js';
import { SIGN_UV } from './textures.js';

/** The inn's frame: front wall centre (world) and yaw (front faces the pit, −z). */
export const INN = { x: 8.6, z: 19.6, yaw: Math.PI };

/**
 * Builds the inn front and its counter. `shop` is SHOP_POS (the counter's centre, where the player sells).
 * Returns { smoke, lights, colliders, sign } (sign: the hanging sign's pivot, for a gentle swing).
 */
export function buildInn(batch, shop) {
  const rand = rng(77);
  const F = at(batch, INN.x, 0, INN.z, INN.yaw);
  const W = 8.4;
  const D = 6;
  const wallH = 3.0;
  // Counter position in the local frame (yaw π: local x = INN.x − world x, local z = INN.z − world z).
  const cx = INN.x - shop.x;
  const cz = INN.z - shop.z;

  // Walls: a stone plinth, plaster above, dark timber framing.
  F.add('stone', box(W, 1.1, 0.5, 0.9), 0xc8bca8, trs(0, 0.55, -0.25), { ao: 0.5 });
  F.add('plaster', box(W - 0.1, wallH - 1.1, 0.4, 0.5), 0xf0e4c8, trs(0, 1.1 + (wallH - 1.1) / 2, -0.25), { ao: 0 });
  for (const sx of [-1, 1]) {
    F.add('stone', box(0.5, 1.1, D, 0.9), 0xc0b4a0, trs((sx * W) / 2 - sx * 0.25, 0.55, -D / 2), { ao: 0.5 });
    F.add('plaster', box(0.4, wallH - 1.1, D, 0.5), 0xece0c4, trs((sx * W) / 2 - sx * 0.25, 1.1 + (wallH - 1.1) / 2, -D / 2), { ao: 0 });
    // Gable triangle.
    const gable = new THREE.BufferGeometry();
    const gx = (sx * W) / 2 - sx * 0.05;
    gable.setAttribute('position', new THREE.Float32BufferAttribute([gx, wallH, 0, gx, wallH, -D, gx, 5.4, -D / 2], 3));
    gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, D * 0.5, 0, D * 0.25, 1.2], 2));
    gable.setIndex(sx > 0 ? [0, 1, 2] : [0, 2, 1]);
    gable.computeVertexNormals();
    F.add('plaster', gable, 0xeadcc0, null, { ao: 0 });
  }
  const beam = 0x5a4634;
  for (let bx = -W / 2 + 0.1; bx <= W / 2; bx += W / 6) F.add('wood', box(0.16, wallH - 1.1, 0.06, 1), beam, trs(bx, 1.1 + (wallH - 1.1) / 2, 0.0), { ao: 0 });
  F.add('wood', box(W, 0.18, 0.08, 1), beam, trs(0, wallH - 0.05, 0.0), { ao: 0 });
  F.add('wood', box(W, 0.14, 0.08, 1), beam, trs(0, 1.15, 0.0), { ao: 0 });
  for (const bx of [-W / 2 + 0.8, W / 2 - 0.8]) F.add('wood', box(0.12, 2.1, 0.05, 1), beam, trs(bx, 2.05, 0.01, 0, 0, bx > 0 ? 0.6 : -0.6), { ao: 0 });

  // Thatched roof: two thick slopes with a rolled ridge; deep eaves.
  const slope = Math.atan2(5.4 - wallH, D / 2 + 0.7);
  const len = Math.hypot(D / 2 + 0.9, 5.4 - wallH + 0.25);
  for (const sz of [-1, 1]) {
    const r = box(W + 1.0, 0.38, len, 0.55);
    F.add('thatch', r, 0xd8c8a0, trs(0, (wallH + 5.4) / 2 + 0.05, -D / 2 + (sz * (D / 2 + 0.9)) / 2, sz * slope, 0, 0), { ao: 0 });
  }
  const ridge = cyl(0.3, 0.3, W + 1.0, 10, 0.6);
  ridge.rotateZ(Math.PI / 2);
  F.add('thatch', ridge, 0xc8b890, trs(0, 5.45, -D / 2), { ao: 0 });
  // Chimney stack on the left gable, with a pot.
  F.add('stone', box(0.8, 3.4, 0.8, 0.9), 0xb8ac98, trs(-W / 2 + 0.6, 4.6, -D / 2 + 0.6), { ao: 0 });
  F.add('plain', cyl(0.14, 0.16, 0.4, 8), 0x9a5a3a, trs(-W / 2 + 0.6, 6.5, -D / 2 + 0.6), { ao: 0 });
  const smoke = [F.toWorld(-W / 2 + 0.6, 6.75, -D / 2 + 0.6)];

  // The front door: round-topped, green, with a lantern beside it.
  const dx = -2.3;
  F.add('wood', box(1.1, 1.5, 0.08, 1), 0x2a6a3a, trs(dx, 0.75, 0.02), { ao: 0.3 });
  const top = cyl(0.55, 0.55, 0.08, 16, 1, false);
  top.rotateX(Math.PI / 2);
  F.add('wood', top, 0x2a6a3a, trs(dx, 1.5, 0.02), { ao: 0 });
  F.add('wood', new THREE.TorusGeometry(0.6, 0.07, 5, 16, Math.PI), beam, trs(dx, 1.5, 0.05), { ao: 0 });
  for (const sx of [-0.6, 0.6]) F.add('wood', box(0.14, 1.5, 0.1, 1), beam, trs(dx + sx, 0.75, 0.05), { ao: 0 });
  F.add('plain', new THREE.SphereGeometry(0.045, 8, 6), 0xe0b848, trs(dx + 0.35, 1.0, 0.1), { ao: 0 });
  F.add('stone', box(1.5, 0.14, 0.6, 1), 0xb0a898, trs(dx, 0.04, 0.35), { ao: 0 });
  const lights = [lantern(F, dx - 1.0, 1.8, 0.2, false)];
  F.add('wood', box(0.05, 0.05, 0.3, 1), beam, trs(dx - 1.0, 2.05, 0.1), { ao: 0 });

  // Leaded windows, lit warm from inside.
  for (const wx of [-0.3, 1.9]) {
    F.add('glow', box(1.2, 0.9, 0.04, 1), 0xe8b060, trs(wx, 1.9, 0.0), { ao: 0 });
    F.add('wood', box(1.36, 0.1, 0.1, 1), beam, trs(wx, 2.4, 0.04), { ao: 0 });
    F.add('wood', box(1.4, 0.12, 0.2, 1), beam, trs(wx, 1.4, 0.08), { ao: 0 });
    for (const k of [-0.6, -0.2, 0.2, 0.6]) F.add('wood', box(0.04, 0.9, 0.05, 1), 0x2a2420, trs(wx + k * 1.0, 1.9, 0.04), { ao: 0 });
    F.add('wood', box(1.2, 0.04, 0.05, 1), 0x2a2420, trs(wx, 1.9, 0.04), { ao: 0 });
    // Flower box.
    F.add('wood', box(1.2, 0.18, 0.22, 1), 0x6a4a2a, trs(wx, 1.3, 0.2), { ao: 0 });
    for (let i = 0; i < 6; i++) flowerClump(F, wx - 0.5 + i * 0.2, 0.2, [0xd83a2a, 0xf0e0c0, 0xf0b020][i % 3], false, 3);
  }
  // The name board on the wall.
  F.add('sign', quad(2.6, 0.65, SIGN_UV.innName), 0xffffff, trs(0.8, wallH + 0.0, 0.08), { ao: 0 });

  // ---- the outdoor serving counter (the shop) under a little shingled roof ----
  const cw = 2.6;
  F.add('wood', box(cw, 1.0, 0.6, 0.8), 0xa88058, trs(cx, 0.5, cz), { ao: 0.4 });
  F.add('wood', box(cw + 0.2, 0.08, 0.8, 0.8), 0xa07850, trs(cx, 1.04, cz), { ao: 0 });
  for (let k = -3; k <= 3; k++) F.add('wood', box(0.03, 0.9, 0.02, 1), 0x6a5040, trs(cx + k * 0.36, 0.5, cz + 0.31), { ao: 0 });
  // Posts and the roof over the counter, joined to the wall.
  for (const sx of [-1, 1]) {
    const p = box(0.14, 2.5, 0.14, 1);
    p.translate(0, 1.25, 0);
    F.add('wood', p, 0x9a8068, trs(cx + sx * (cw / 2 + 0.25), 0, cz + 0.45), { ao: 0.4 });
    F.add('wood', box(0.1, 0.1, cz + 0.6, 1), 0x8a7058, trs(cx + sx * (cw / 2 + 0.25), 2.5, (cz + 0.45) / 2), { ao: 0 });
  }
  const rl = Math.hypot(cz + 0.9, 0.4);
  F.add('roof', box(cw + 1.2, 0.08, rl, 0.7), 0xffffff, trs(cx, 2.68, (cz + 0.9) / 2 - 0.1, Math.atan2(0.4, cz + 0.9), 0, 0), { ao: 0 });
  // On the counter: a keg with a tap, tankards, a loaf and a basket of mushrooms.
  barrel(F, trs(cx - 0.85, 1.36, cz - 0.05, 0, 0, Math.PI / 2), 0.55, 0.22);
  F.add('plain', cyl(0.015, 0.015, 0.12, 5), 0xd8b048, trs(cx - 0.55, 1.3, cz - 0.05, 0, 0, Math.PI / 2), { ao: 0 });
  for (let i = 0; i < 3; i++) {
    F.add('wood', cyl(0.06, 0.055, 0.16, 10), 0xb08a60, trs(cx - 0.15 + i * 0.22, 1.16, cz + 0.12 + (i % 2) * 0.1), { ao: 0 });
    F.add('plain', cyl(0.055, 0.055, 0.02, 10), 0xf4ecd8, trs(cx - 0.15 + i * 0.22, 1.25, cz + 0.12 + (i % 2) * 0.1), { ao: 0 });
  }
  F.add('plain', new THREE.SphereGeometry(0.14, 10, 6), 0xc08a40, trs(cx + 0.65, 1.12, cz, 0, 0.4, 0, [1.4, 0.6, 0.8]), { ao: 0 });
  F.add('wood', cyl(0.18, 0.14, 0.14, 10, 1, true), 0xa88a50, trs(cx + 1.0, 1.15, cz - 0.05), { ao: 0 });
  for (let i = 0; i < 5; i++) F.add('plain', new THREE.SphereGeometry(0.05, 6, 4), 0xe8dcc0, trs(cx + 0.92 + (rand() - 0.5) * 0.18, 1.22, cz - 0.05 + (rand() - 0.5) * 0.18, 0, 0, 0, [1, 0.5, 1]), { ao: 0 });
  // Shelves on the wall behind the counter with jars and bottles.
  for (const sy of [1.4, 1.9]) {
    F.add('wood', box(cw, 0.05, 0.25, 1), 0x8a6a48, trs(cx, sy, 0.15), { ao: 0 });
    for (let i = 0; i < 7; i++) {
      const c = [0x3a6a3a, 0x8a4a2a, 0xd8c8a0, 0x4a5a7a][i % 4];
      F.add('plain', cyl(0.05, 0.05, 0.2 + (i % 3) * 0.05, 7), c, trs(cx - cw / 2 + 0.2 + i * 0.36, sy + 0.12, 0.15), { ao: 0 });
    }
  }
  // A lantern hanging under the counter roof.
  lights.push(lantern(F, cx + cw / 2 - 0.15, 2.05, cz + 0.4, false));
  blob(batch, shop.x, shop.z, 1.8, 0.7);

  // The hanging sign: a post with an arm towards the lane, the painted board on two chains.
  const sx = cx + cw / 2 + 1.3;
  const sz = cz + 0.3;
  const post = box(0.16, 3.4, 0.16, 1);
  post.translate(0, 1.7, 0);
  F.add('wood', post, 0x7a6450, trs(sx, 0, sz), { ao: 0.4 });
  F.add('wood', box(0.12, 0.12, 1.4, 1), 0x7a6450, trs(sx, 3.2, sz + 0.6), { ao: 0 });
  F.add('wood', box(0.08, 0.08, 0.8, 1), 0x7a6450, trs(sx, 2.95, sz + 0.25, 0.75), { ao: 0 });
  for (const cz2 of [sz + 0.18, sz + 1.12]) F.add('plain', cyl(0.008, 0.008, 0.32, 3), 0x2a2622, trs(sx, 3.0, cz2), { ao: 0 });
  // Both faces of the board carry the dragon (one double-sided quad would mirror the text on the back).
  for (const face of [Math.PI / 2, -Math.PI / 2]) F.add('sign', quad(1.05, 1.05, SIGN_UV.dragon), 0xffffff, trs(sx + (face > 0 ? 0.025 : -0.025), 2.32, sz + 0.65, 0, face), { ao: 0 });
  F.add('wood', box(0.035, 1.12, 1.12, 1), 0x3a2a1a, trs(sx, 2.32, sz + 0.65), { ao: 0 });
  blob(batch, ...w2(F, sx, sz), 0.35);

  // Barrels: a stack by the counter, a few by the door.
  const stack = [[cx - cw / 2 - 0.7, 0.33, cz - 0.2], [cx - cw / 2 - 0.7, 0.33, cz + 0.5], [cx - cw / 2 - 0.7, 0.88, cz + 0.15]];
  for (const [bx, by, bz] of stack) barrel(F, trs(bx, by, bz, Math.PI / 2, 0, 0), 0.9, 0.33);
  barrel(F, trs(dx + 1.0, 0.45, 0.5), 0.9, 0.33);
  barrel(F, trs(dx + 1.55, 0.35, 0.45), 0.7, 0.28);
  blob(batch, ...w2(F, cx - cw / 2 - 0.7, cz + 0.15), 0.9);
  blob(batch, ...w2(F, dx + 1.25, 0.5), 0.8, 0.5);

  // The chalkboard on an easel: today's offers.
  const ex = cx - cw / 2 - 1.5;
  const ez = cz + 0.7;
  F.add('sign', quad(0.8, 0.6, SIGN_UV.chalk), 0xffffff, trs(ex, 0.95, ez, -0.2, 0.25), { ao: 0 });
  for (const lx of [-0.35, 0.35]) F.add('wood', box(0.05, 1.4, 0.05, 1), 0x8a6a48, trs(ex + lx * Math.cos(0.25), 0.68, ez - 0.05 - lx * Math.sin(0.25), -0.2, 0.25), { ao: 0.3 });
  F.add('wood', box(0.05, 1.3, 0.05, 1), 0x8a6a48, trs(ex - 0.1, 0.62, ez - 0.4, 0.35, 0.25), { ao: 0.3 });

  // A table with benches for the drinkers, tankards left on it.
  const tx = -2.0;
  const tz = 3.2;
  F.add('wood', box(1.6, 0.07, 0.75, 0.8), 0xb08a5a, trs(tx, 0.74, tz), { ao: 0 });
  for (const lx of [-0.65, 0.65]) F.add('wood', box(0.08, 0.72, 0.6, 1), 0x8a7058, trs(tx + lx, 0.36, tz), { ao: 0.3 });
  for (const s of [-1, 1]) {
    F.add('wood', box(1.6, 0.06, 0.28, 0.8), 0xa88050, trs(tx, 0.44, tz + s * 0.65), { ao: 0 });
    for (const lx of [-0.6, 0.6]) F.add('wood', box(0.06, 0.42, 0.22, 1), 0x8a7058, trs(tx + lx, 0.21, tz + s * 0.65), { ao: 0.3 });
  }
  F.add('wood', cyl(0.06, 0.055, 0.16, 10), 0xb08a60, trs(tx + 0.3, 0.86, tz + 0.1), { ao: 0 });
  F.add('wood', cyl(0.06, 0.055, 0.16, 10), 0xb08a60, trs(tx - 0.4, 0.86, tz - 0.15), { ao: 0 });
  blob(batch, ...w2(F, tx, tz), 1.3, 1.1);
  // A bench against the wall and bushes at the corners.
  bench(F, trs(-0.3, 0, 0.45), 1.6, 0x9a7a50);
  for (const [lx, lz] of [[-W / 2 - 0.4, 0.4], [W / 2 + 0.4, 0.4], [W / 2 + 0.5, -2.5]]) {
    const w = F.toWorld(lx, 0, lz);
    bush(batch, w.x, 0, w.z, 0.7, 0x467626, lx * 3);
  }

  // Colliders (circles in world xz): the building and the counter.
  const colliders = [];
  for (let lx = -W / 2 + 1.4; lx <= W / 2 - 1.3; lx += 2.8) {
    const w = F.toWorld(lx, 0, -D / 2);
    colliders.push({ x: w.x, z: w.z, r: 3.1 });
  }
  const cwld = F.toWorld(cx, 0, cz - 0.05);
  colliders.push({ x: cwld.x - 0.8, z: cwld.z, r: 0.45 }, { x: cwld.x, z: cwld.z, r: 0.45 }, { x: cwld.x + 0.8, z: cwld.z, r: 0.45 });
  return { smoke, lights, colliders };
}

function w2(F, lx, lz) {
  const w = F.toWorld(lx, 0, lz);
  return [w.x, w.z];
}
