/* ==== surface/garden.js — Bag End's kitchen garden around the pit: vegetable beds, runner beans, the scarecrow,
   beehives, the potting shed, the washing line, wheelbarrow and tools, the compost bin and the growing spoil heap ==== */
import * as THREE from 'three';
import { box, cyl, lumpy, paint, rng, shadeBelow, trs, tube } from './kit.js';
import { plant, verge } from './flora.js';
import { FIREFLY_SPOTS } from './fireflies.js';
import { at, barrel, blob, bush, cabbage, carrot, fence, flowerClump, leek, tree } from './parts.js';

/** The spoil heap where the dug soil goes (beside the compost bin, east of the pit). */
export const SPOIL_POS = { x: 19.6, z: -10.2 };

/**
 * Builds the garden into the batch. Returns { colliders, cloth: [geometries for the washing], hives: [world points] }.
 */
export function buildGarden(batch) {
  const rand = rng(99);
  const colliders = [];
  const G = at(batch, 0, 0, 0, 0);

  // ---- vegetable beds west of the pit (raised soil with plank edging) ----
  const bx0 = -21.2;
  const bx1 = -14.2;
  const crops = ['cabbage', 'carrot', 'beans', 'lettuce', 'leek', 'cabbage', 'potato'];
  // night extras (NOTES-28-night): fireflies over the vegetable beds.
  FIREFLY_SPOTS.push({ x: (bx0 + bx1) / 2, y: 0, z: -8.6 + 3 * 2.5, rx: (bx1 - bx0) / 2 + 0.5, rz: 9 });
  crops.forEach((crop, i) => {
    const z = -8.6 + i * 2.5;
    const len = bx1 - bx0;
    const cxm = (bx0 + bx1) / 2;
    G.add('soil', box(len, 0.16, 1.3, 0.9), 0xc8b4a0, trs(cxm, 0.05, z), { ao: 0, jitter: 0.1 });
    for (const s of [-1, 1]) G.add('wood', box(len + 0.1, 0.22, 0.05, 0.8), 0x9a8468, trs(cxm, 0.08, z + s * 0.67), { ao: 0.2 });
    for (const s of [-1, 1]) G.add('wood', box(0.05, 0.22, 1.36, 0.8), 0x9a8468, trs(cxm + (s * len) / 2, 0.08, z), { ao: 0.2 });
    // Slightly overgrown: a few weeds along the edges.
    for (let k = 0; k < 5; k++) flowerClump(G, bx0 + rand() * len, z + (rand() < 0.5 ? -0.75 : 0.75), 0xf4f0e0, false, 2);
    if (crop === 'beans') {
      // Runner beans on pole tepees with red flowers.
      for (let x = bx0 + 0.7; x < bx1 - 0.3; x += 1.6) {
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          const pole = cyl(0.015, 0.02, 2.0, 4);
          pole.translate(0, 1.0, 0);
          G.add('wood', pole, 0xc8b8a0, trs(x + Math.cos(a) * 0.35, 0, z + Math.sin(a) * 0.35, Math.sin(a) * 0.17, 0, -Math.cos(a) * 0.17), { ao: 0 });
        }
        // The vines: a bean card up every pole (leaves, scarlet flowers, pods) and a leafy mass in the middle.
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          plant(batch, x + Math.cos(a) * 0.3, 0.1, z + Math.sin(a) * 0.3, 'bean', { h: 1.75 + rand() * 0.2, yaw: a + Math.PI / 2, lean: false });
        }
        for (let k = 0; k < 3; k++) {
          const lf = new THREE.IcosahedronGeometry(0.18, 0);
          G.add('foliage', lf, 0x2f5a1e, trs(x + (rand() - 0.5) * 0.2, 0.5 + k * 0.45, z + (rand() - 0.5) * 0.2, 0, 0, 0, [1, 1.4, 1]), { ao: 0, jitter: 0.15 });
        }
      }
      return;
    }
    for (let x = bx0 + 0.35; x < bx1 - 0.2; x += crop === 'carrot' || crop === 'leek' ? 0.28 : 0.55) {
      for (const dz of crop === 'carrot' || crop === 'leek' ? [-0.3, 0, 0.3] : [-0.28, 0.28]) {
        const px = x + (rand() - 0.5) * 0.08;
        const pz = z + dz + (rand() - 0.5) * 0.08;
        if (crop === 'cabbage') cabbage(G, px, pz, 0.9 + rand() * 0.35, i === 0 ? 0x88b060 : 0x6a9a70);
        else if (crop === 'lettuce') cabbage(G, px, pz, 0.9, 0x98c860, true);
        else if (crop === 'carrot') carrot(G, px, pz);
        else if (crop === 'leek') leek(G, px, pz);
        else if (crop === 'potato') {
          // Earthed-up rows with bushy haulms (a few in flower).
          const m = new THREE.IcosahedronGeometry(0.2, 1);
          lumpy(m, 0.04, 9, px);
          G.add('soil', m, 0xb8a490, trs(px, 0.08, pz, 0, 0, 0, [1.2, 0.45, 1]), { ao: 0, jitter: 0.1 });
          plant(batch, px, 0.12, pz, 'potato', { tint: rand() < 0.3 ? 0xc8b0e0 : 0xffffff, cards: 3 });
        }
      }
    }
  });
  fence(batch, [[-22.6, -10.2], [-22.6, 8.8], [-15.5, 8.8]]);
  fence(batch, [[-22.6, -10.2], [-17.5, -10.2]]);
  colliders.push({ x: -17.7, z: -1, r: 0.3 });

  // ---- the scarecrow between the beds: post and arms, sack head, straw hat, patched coat ----
  {
    const S = at(batch, -17.7, 0, -1.1, 0.4);
    S.add('wood', box(0.08, 1.9, 0.08, 1).translate(0, 0.95, 0), 0xb8a890, null, { ao: 0.4 });
    S.add('wood', box(1.3, 0.07, 0.07, 1), 0xb8a890, trs(0, 1.45, 0), { ao: 0 });
    S.add('cloth', box(0.55, 0.62, 0.26, 1), 0x6a5a3a, trs(0, 1.25, 0), { ao: 0 });
    for (const s of [-1, 1]) S.add('cloth', box(0.42, 0.16, 0.18, 1), 0x6a5a3a, trs(s * 0.45, 1.45, 0), { ao: 0 });
    S.add('cloth', box(0.16, 0.16, 0.02, 1), 0xa04a30, trs(0.12, 1.15, 0.135), { ao: 0 });
    S.add('cloth', box(0.12, 0.1, 0.02, 1), 0x3a5a8a, trs(-0.15, 1.4, 0.135), { ao: 0 });
    S.add('plain', new THREE.SphereGeometry(0.2, 10, 8), 0xd8c49a, trs(0, 1.78, 0), { ao: 0 });
    S.add('thatch', cyl(0.08, 0.2, 0.25, 10), 0xe8d8a0, trs(0, 2.02, 0), { ao: 0 });
    S.add('thatch', cyl(0.38, 0.38, 0.03, 14), 0xe8d8a0, trs(0, 1.92, 0), { ao: 0 });
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) S.add('thatch', cyl(0.004, 0.01, 0.18, 3), 0xe8d8a0, trs(s * (0.68 + rand() * 0.05), 1.42 - rand() * 0.06, (rand() - 0.5) * 0.1, 0, 0, s * (1.2 + rand() * 0.5)), { ao: 0 });
    }
    // A crow on one arm.
    S.add('plain', new THREE.SphereGeometry(0.07, 8, 6), 0x1a1a20, trs(0.55, 1.55, 0, 0, 0, 0, [1.5, 1, 1]), { ao: 0 });
    S.add('plain', new THREE.SphereGeometry(0.045, 8, 6), 0x1a1a20, trs(0.64, 1.62, 0), { ao: 0 });
    S.add('plain', new THREE.ConeGeometry(0.015, 0.06, 4), 0x3a3020, trs(0.69, 1.62, 0, 0, 0, -Math.PI / 2), { ao: 0 });
  }

  // ---- beehives: straw skeps on a little stand, south-west of the beds ----
  const hives = [];
  {
    const H = at(batch, -20.5, 0, -13.2, 0.3);
    H.add('wood', box(2.0, 0.06, 0.6, 1), 0xa08a68, trs(0, 0.55, 0), { ao: 0 });
    for (const sx of [-0.85, 0.85]) H.add('wood', box(0.08, 0.55, 0.5, 1).translate(0, 0.27, 0), 0x8a7058, trs(sx, 0, 0), { ao: 0.3 });
    for (const sx of [-0.55, 0.55]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const r = 0.32 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.01;
        pts.push(new THREE.Vector2(r * (1 + 0.04 * Math.sin(t * 40)), t * 0.55));
      }
      H.add('thatch', new THREE.LatheGeometry(pts, 14), 0xe0c890, trs(sx, 0.58, 0), { ao: 0 });
      H.add('plain', box(0.08, 0.05, 0.02, 1), 0x1a1208, trs(sx, 0.62, 0.32), { ao: 0 });
      hives.push(H.toWorld(sx, 0.85, 0));
    }
    blob(batch, -20.5, -13.2, 1.2, 0.5);
    colliders.push({ x: -20.5, z: -13.2, r: 0.9 });
  }

  // ---- the potting shed (west, near Bag End's side), with pots and a watering can ----
  {
    const P = at(batch, -20.6, 0, 12.4, Math.PI / 2);
    P.add('wood', box(2.4, 2.0, 1.9, 0.7), 0x9a8a70, trs(0, 1.0, 0), { ao: 0.5 });
    for (let k = -5; k <= 5; k++) P.add('wood', box(0.025, 2.0, 0.02, 1), 0x5a4a3a, trs(k * 0.22, 1.0, 0.96), { ao: 0 });
    for (const sz of [-1, 1]) P.add('roof', box(2.8, 0.06, 1.4, 0.8), 0xffffff, trs(0, 2.25, sz * 0.55, sz * 0.45, 0, 0), { ao: 0 });
    // Gable triangles.
    for (const sx of [-1, 1]) {
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute([sx * 1.2, 2.0, 0.95, sx * 1.2, 2.0, -0.95, sx * 1.2, 2.5, 0], 3));
      gg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 0.4], 2));
      gg.setIndex(sx > 0 ? [0, 1, 2] : [0, 2, 1]);
      gg.computeVertexNormals();
      P.add('wood', gg, 0x8a7a60, null, { ao: 0 });
    }
    P.add('wood', box(0.75, 1.6, 0.05, 1), 0x4a6a8a, trs(-0.5, 0.8, 0.97), { ao: 0.3 });
    P.add('plain', new THREE.SphereGeometry(0.03, 6, 4), 0xd8b048, trs(-0.25, 0.85, 1.01), { ao: 0 });
    P.add('glow', box(0.5, 0.4, 0.03, 1), 0x3a4044, trs(0.55, 1.35, 0.97), { ao: 0 });
    P.add('wood', box(0.6, 0.06, 0.06, 1), 0xe0d8c0, trs(0.55, 1.35, 0.99), { ao: 0 });
    P.add('wood', box(0.06, 0.46, 0.06, 1), 0xe0d8c0, trs(0.55, 1.35, 0.99), { ao: 0 });
    // Potting bench with clay pots, more pots stacked on the ground.
    P.add('wood', box(1.0, 0.05, 0.45, 1), 0xa08868, trs(0.6, 0.8, 1.25), { ao: 0 });
    for (const lx of [0.15, 1.05]) P.add('wood', box(0.05, 0.8, 0.4, 1).translate(0, 0.4, 0), 0x8a7058, trs(lx, 0, 1.25), { ao: 0.3 });
    for (let i = 0; i < 4; i++) {
      P.add('plain', cyl(0.09, 0.065, 0.14, 8), 0xb8653a, trs(0.25 + i * 0.24, 0.9, 1.25), { ao: 0 });
      if (i % 2 === 0) flowerClump(P, 0.25 + i * 0.24, 1.25, 0xe85a8a, false, 3, 0.96);
    }
    for (let i = 0; i < 4; i++) P.add('plain', cyl(0.11, 0.08, 0.16, 8), 0xb8653a, trs(1.5, 0.08 + i * 0.07, 1.0), { ao: 0.3 });
    // Watering can.
    P.add('plain', cyl(0.12, 0.12, 0.25, 10), 0x6a7a6a, trs(-1.3, 0.13, 1.2), { ao: 0 });
    P.add('plain', cyl(0.015, 0.025, 0.35, 5), 0x6a7a6a, trs(-1.12, 0.22, 1.2, 0, 0, -0.9), { ao: 0 });
    blob(batch, -20.6, 12.4, 1.6, 1.8);
    colliders.push({ x: -20.6, z: 11.8, r: 1.1 }, { x: -20.6, z: 13.0, r: 1.1 });
  }

  // ---- washing line east of the lane: T-posts, a sagging rope, Bilbo's waistcoat and the week's washing ----
  const cloth = [];
  {
    const a = [18.4, -2.6];
    const b = [25.2, -1.4];
    for (const [px, pz] of [a, b]) {
      G.add('wood', box(0.1, 2.0, 0.1, 1).translate(0, 1.0, 0), 0xb0a088, trs(px, 0, pz), { ao: 0.4 });
      G.add('wood', box(0.08, 0.08, 0.7, 1), 0xb0a088, trs(px, 1.9, pz, 0, Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2), { ao: 0 });
      colliders.push({ x: px, z: pz, r: 0.2 });
    }
    const sag = (t) => 1.88 - Math.sin(t * Math.PI) * 0.22;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push([a[0] + (b[0] - a[0]) * t, sag(t), a[1] + (b[1] - a[1]) * t]);
    }
    G.add('plain', tube(pts, 0.008, 3), 0xe8e0d0, null, { ao: 0 });
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]) - Math.PI / 2;
    const items = [
      [0.1, 0.5, 0.62, 0xb83a2a], // the waistcoat (red)
      [0.22, 0.75, 0.8, 0xf0ece0], // a shirt
      [0.38, 0.9, 1.1, 0x4a7a3a], // a green cloak
      [0.55, 0.25, 0.4, 0xd8c070], // socks
      [0.62, 0.25, 0.4, 0xd8c070],
      [0.74, 1.0, 0.8, 0xe8e0f0], // a tablecloth
      [0.88, 0.6, 0.55, 0x8a5a9a], // a scarf
    ];
    for (const [t, w, h, c] of items) {
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      const q = new THREE.PlaneGeometry(w, h, 3, 3);
      q.translate(0, -h / 2, 0);
      const g = paint(q, 0xffffff);
      const m = trs(x, sag(t), z, 0, yaw, 0);
      cloth.push({ g, c, m });
      // Pegs.
      for (const s of [-1, 1]) G.add('wood', box(0.02, 0.07, 0.025, 1), 0xd8c8a8, trs(x + Math.sin(yaw + Math.PI / 2) * s * w * 0.4, sag(t), z + Math.cos(yaw + Math.PI / 2) * s * w * 0.4), { ao: 0 });
    }
    // The waistcoat's yellow lining and brass buttons.
    const wx = a[0] + (b[0] - a[0]) * 0.1;
    const wz = a[1] + (b[1] - a[1]) * 0.1;
    for (let k = 0; k < 3; k++) G.add('plain', new THREE.SphereGeometry(0.018, 5, 4), 0xe0b848, trs(wx, sag(0.1) - 0.15 - k * 0.12, wz + 0.01), { ao: 0 });
    // A laundry basket underneath.
    G.add('wood', cyl(0.32, 0.26, 0.3, 12, 1, true), 0xc8a870, trs(21.5, 0.15, -2.6), { ao: 0.3 });
    G.add('cloth', new THREE.SphereGeometry(0.28, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xf0ece0, trs(21.5, 0.2, -2.6, 0, 0, 0, [1, 0.5, 1]), { ao: 0 });
    blob(batch, 21.5, -2.6, 0.5);
  }

  // ---- wheelbarrow at the pit edge (full of soil), spade and fork leaning on it ----
  {
    const Wb = at(batch, 13.5, 0, 5.2, -0.5);
    const tray = new THREE.CylinderGeometry(0.62, 0.42, 0.34, 4, 1, true);
    tray.rotateY(Math.PI / 4);
    tray.scale(1, 1, 1.35);
    Wb.add('wood', tray, 0x8a7a68, trs(0, 0.58, 0), { ao: 0 });
    Wb.add('wood', box(0.55, 0.04, 0.8, 1), 0x7a6a58, trs(0, 0.42, 0), { ao: 0 });
    const soil = new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    lumpy(soil, 0.04, 8, 2);
    Wb.add('plain', soil, 0x5a3e26, trs(0, 0.66, 0, 0, 0, 0, [1, 0.45, 1.3]), { ao: 0 });
    const wheel = new THREE.TorusGeometry(0.22, 0.045, 6, 16);
    wheel.rotateY(Math.PI / 2);
    Wb.add('wood', wheel, 0x6a5a48, trs(0, 0.24, 0.75), { ao: 0 });
    Wb.add('wood', cyl(0.03, 0.03, 0.2, 6).rotateZ(Math.PI / 2), 0x3a3430, trs(0, 0.24, 0.75), { ao: 0 });
    for (const s of [-1, 1]) {
      Wb.add('wood', box(0.05, 0.05, 1.7, 1), 0x9a8068, trs(s * 0.26, 0.48, -0.15, -0.12, 0, 0), { ao: 0 });
      Wb.add('wood', box(0.05, 0.38, 0.05, 1), 0x9a8068, trs(s * 0.24, 0.19, -0.5), { ao: 0.3 });
    }
    // Spade and fork leaning against the barrow.
    for (const [lx, fork] of [[0.48, false], [0.62, true]]) {
      const T = trs(lx, 0, -0.1, -0.35, 0, 0.06);
      Wb.add('wood', cyl(0.018, 0.018, 1.0, 5).translate(0, 0.62, 0), 0xb89a70, T, { ao: 0 });
      Wb.add('wood', box(0.12, 0.03, 0.03, 1), 0xb89a70, T.clone().multiply(trs(0, 1.12, 0)), { ao: 0 });
      if (fork) for (let k = -1.5; k <= 1.5; k++) Wb.add('plain', box(0.012, 0.24, 0.012, 1), 0x6a6a6a, T.clone().multiply(trs(k * 0.04, 0.0, 0)), { ao: 0 });
      else Wb.add('plain', box(0.17, 0.25, 0.015, 1), 0x7a7a78, T.clone().multiply(trs(0, 0.0, 0)), { ao: 0 });
    }
    blob(batch, 13.5, 5.2, 0.7, 1.1, 0.012, -0.5);
    colliders.push({ x: 13.5, z: 5.2, r: 0.55 });
  }
  // A spade left stuck in the lawn at the pit's north-west corner.
  {
    const T = trs(-13.0, 0, -12.9, 0.12, 0.6, 0.05);
    G.add('wood', cyl(0.018, 0.018, 0.9, 5).translate(0, 0.55, 0), 0xb89a70, T, { ao: 0 });
    G.add('wood', box(0.12, 0.03, 0.03, 1), 0xb89a70, T.clone().multiply(trs(0, 1.0, 0)), { ao: 0 });
    G.add('plain', box(0.17, 0.2, 0.015, 1), 0x7a7a78, T.clone().multiply(trs(0, 0.06, 0)), { ao: 0 });
    G.add('plain', new THREE.SphereGeometry(0.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x5a3e26, trs(-13.2, 0, -13.2, 0, 0, 0, [1, 0.35, 1]), { ao: 0 });
  }

  // ---- compost bin beside the spoil heap ----
  {
    const C = at(batch, SPOIL_POS.x + 2.4, 0, SPOIL_POS.z - 1.6, 0.3);
    for (let y = 0.1; y < 0.9; y += 0.16) {
      for (const [lx, lz, ry] of [[0, 0.6, 0], [0, -0.6, 0], [0.6, 0, Math.PI / 2], [-0.6, 0, Math.PI / 2]]) {
        C.add('wood', box(1.25, 0.11, 0.04, 0.8), 0x8a7a60, trs(lx, y, lz, 0, ry, 0), { ao: 0.5 });
      }
    }
    const heap = new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    lumpy(heap, 0.06, 6, 7);
    C.add('plain', heap, 0x5a4a2a, trs(0, 0.55, 0, 0, 0, 0, [1, 0.5, 1]), { ao: 0 });
    for (let i = 0; i < 6; i++) C.add('plain', box(0.12, 0.02, 0.06, 1), [0xd87a20, 0x8ab050, 0xc8b070][i % 3], trs((rand() - 0.5) * 0.6, 0.78, (rand() - 0.5) * 0.6, 0, rand() * 3), { ao: 0 });
    blob(batch, SPOIL_POS.x + 2.4, SPOIL_POS.z - 1.6, 1.0);
    colliders.push({ x: SPOIL_POS.x + 2.4, z: SPOIL_POS.z - 1.6, r: 0.8 });
  }

  // ---- garden trees, a low stone wall with a cat, a mushroom ring, a few bushes ----
  tree(batch, -25, 0, -5, 0.95, 'round', 2);
  tree(batch, 23.5, 0, 9.5, 1.0, 'round', 3);
  tree(batch, 26, 0, -17, 1.1, 'round', 4);
  tree(batch, -15, 0, -24, 0.9, 'round', 5);
  colliders.push({ x: -25, z: -5, r: 0.35 }, { x: 23.5, z: 9.5, r: 0.35 }, { x: 26, z: -17, r: 0.35 }, { x: -15, z: -24, r: 0.35 });
  for (let x = -23.5; x < -15.2; x += 0.42) {
    for (let row = 0; row < 3; row++) {
      const st = box(0.4 + rand() * 0.08, 0.2, 0.36, 1.6);
      G.add('stone', st, new THREE.Color().setHSL(0.09, 0.08, 0.6 + rand() * 0.12), trs(x + (row % 2) * 0.2, 0.1 + row * 0.2, -14.6 + (rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1), { ao: 0.6 });
    }
    // Moss on the top course.
    if (rand() < 0.4) G.add('foliage', new THREE.IcosahedronGeometry(0.12, 0), 0x5a7a2a, trs(x, 0.62, -14.6, 0, 0, 0, [1.4, 0.4, 1]), { ao: 0 });
  }
  // Ferns, docks and long grass along the foot of the wall; a fern in its top here and there.
  for (const side of [-0.32, 0.32]) verge(batch, [[-23.6, -14.6], [-15.2, -14.6]], { side, every: 0.45, width: 0.2, kinds: ['grass', 'grass', 'fern', 'dock', 'meadow'] });
  for (let x = -23; x < -15.5; x += 1.6 + rand()) plant(batch, x, 0.6, -14.6, rand() < 0.5 ? 'fern' : 'grass', { scale: 0.5 });
  colliders.push({ x: -21.5, z: -14.6, r: 0.4 }, { x: -19.5, z: -14.6, r: 0.4 }, { x: -17.5, z: -14.6, r: 0.4 });
  {
    // A ginger cat dozing on the wall.
    const K = at(batch, -18.6, 0.62, -14.6, 1.2);
    K.add('plain', new THREE.SphereGeometry(0.15, 10, 8), 0xd88a3a, trs(0, 0.1, 0, 0, 0, 0, [1.6, 0.8, 1]), { ao: 0 });
    K.add('plain', new THREE.SphereGeometry(0.09, 10, 8), 0xd88a3a, trs(0.25, 0.15, 0), { ao: 0 });
    for (const s of [-1, 1]) K.add('plain', new THREE.ConeGeometry(0.03, 0.06, 4), 0xc87a2a, trs(0.27, 0.25, s * 0.045), { ao: 0 });
    K.add('plain', tube([[-0.2, 0.06, 0], [-0.3, 0.02, 0.1], [-0.25, 0.0, 0.22]], 0.025, 4), 0xd88a3a, null, { ao: 0 });
  }
  // A ring of mushrooms near the Party Field lane.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x = -7 + Math.cos(a) * 1.4;
    const z = -25 + Math.sin(a) * 1.4;
    G.add('plain', cyl(0.02, 0.025, 0.08, 5).translate(0, 0.04, 0), 0xf0e8d8, trs(x, 0, z), { ao: 0 });
    G.add('plain', new THREE.SphereGeometry(0.06, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), i % 3 ? 0xd8c8a8 : 0xc03a2a, trs(x, 0.08, z), { ao: 0 });
  }
  for (const [x, z, r] of [[-23.5, 9.5, 0.6], [-13.4, 16.4, 0.5], [16.5, 12.8, 0.55], [24, -8, 0.7], [17.5, -15.5, 0.6]]) bush(batch, x, 0, z, r, 0x4a7a2a, x);
  // Barrels of rainwater by the shed and the hives.
  barrel(at(batch, -19.0, 0, 13.9, 0), trs(0, 0.45, 0), 0.9, 0.33);
  return { colliders, cloth, hives };
}

/**
 * The spoil heap: its own mesh (scaled as the dug soil grows; TERV 0.11/16). setVolume(m³) grows it with the cube
 * root of the volume, capped so it never swallows the garden.
 */
export function buildSpoilHeap(scene, mat) {
  const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  lumpy(g, 0.14, 1.6, 31);
  g.scale(1, 0.55, 1);
  paint(g, 0xd8c4b0);
  // Soil texture in metres, not stretched over the whole heap.
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 2);
  // Lighter crumbly crust on top, darker damp foot.
  shadeBelow(g, 0, 0.5, 0.65);
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'surface-spoil';
  mesh.position.set(SPOIL_POS.x, -0.05, SPOIL_POS.z);
  scene.add(mesh);
  const V0 = (2 / 3) * Math.PI * 0.55; // volume of the unit half-ellipsoid
  const api = {
    mesh,
    volume: 0,
    /** Sets the heap to hold `m3` cubic metres of dug soil (shown up to about 60 m³). */
    setVolume(m3) {
      api.volume = m3;
      const s = Math.min(3.2, Math.max(0.45, Math.cbrt(Math.max(0, m3) / V0)));
      mesh.scale.setScalar(s);
    },
    /** Collider circle of the heap at its current size (world xz). */
    collider() {
      return { x: SPOIL_POS.x, z: SPOIL_POS.z, r: mesh.scale.x * 0.85 };
    },
  };
  api.setVolume(0);
  return api;
}

