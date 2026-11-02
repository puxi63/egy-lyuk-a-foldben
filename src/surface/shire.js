/* ==== surface/shire.js — the wider Shire: hobbit holes with small colourful doors on the far hills (forced
   perspective), Bagshot Row, the Party Tree with bunting, the Mill with its water wheel, the double-arched bridge, the
   lake with reeds and lily pads, hedgerows, far trees, sheep and the signpost at the lane fork ==== */
import * as THREE from 'three';
import { box, cyl, lumpy, noise2, paint, quad, rng, trs } from './kit.js';
import { BRIDGE_POS, fieldType, groundHeight, LAKE, laneDist, MILL_POS, PARTY_TREE, waterDist } from './ground.js';
import { Accum, leafCards } from './trees.js';
import { at, blob, bush, chimney, fence, flowerClump, holeHill, roundDoor, roundWindow, tree } from './parts.js';
import { SIGN_UV } from './textures.js';

const DOOR_COLORS = [0xd8b030, 0xb83a2a, 0x2f5a9a, 0x2f7a3e, 0x8a3a7a, 0xd87a2a];

/** One hobbit hole on a far hill, facing the garden; `s` < 1 for the far ones (forced perspective). */
function farHole(batch, x, z, color, s, seed, smoke, opts = {}) {
  const yaw = opts.yaw ?? Math.atan2(-x, -z);
  const y = groundHeight(x, z) - 0.05;
  const hill = holeHill(batch, x, y, z, yaw, {
    w: 7 * s, d: 9 * s, faceH: 2.1 * s, topH: 4.2 * s, curve: 0.5 * s, seed, skirt: 2.5, nu: 14, nv: 8,
    faceColor: [0xd0bc94, 0xc8b08a, 0xd8c8a8][seed % 3], turfColor: 0x507c28,
  });
  const F = hill.F;
  roundDoor(F, 0, hill.faceZ(0), 0.72 * s, color, { simple: s < 0.8, seg: 16, frameColor: 0xa08868 });
  const wx = (seed % 2 ? 1.7 : -1.7) * s;
  roundWindow(F, wx, 1.05 * s, hill.faceZ(wx), 0.38 * s, { box: s >= 0.8, panes: 4 });
  if (opts.second !== false) roundWindow(F, -wx * 1.1, 1.0 * s, hill.faceZ(-wx * 1.1), 0.3 * s, { box: false, panes: 4 });
  if (seed % 2 === 0) smoke.push(chimney(F, 1.2 * s, hill.heightAt(1.2 * s, -3 * s), -3 * s, seed % 4 ? 'pipe' : 'stack'));
  // A little front garden: fence, flowers, a bush.
  if (s >= 0.75) {
    const fp = [[-2.6 * s, 2.2 * s], [-0.6 * s, 2.2 * s]].map(([lx, lz]) => {
      const w = F.toWorld(lx, 0, lz);
      return [w.x, w.z];
    });
    const fp2 = [[0.6 * s, 2.2 * s], [2.6 * s, 2.2 * s]].map(([lx, lz]) => {
      const w = F.toWorld(lx, 0, lz);
      return [w.x, w.z];
    });
    fence(batch, fp, 0.8, { groundY: groundHeight });
    fence(batch, fp2, 0.8, { groundY: groundHeight });
    for (let k = 0; k < 4; k++) flowerClump(F, (-2.2 + k * 1.4) * s, 1.0 * s, DOOR_COLORS[(seed + k) % 6], k % 2 === 0, 4);
    const bw = F.toWorld(3.2 * s, 0, 0.6);
    bush(batch, bw.x, groundHeight(bw.x, bw.z) - 0.1, bw.z, 0.6 * s, 0x4a7a2a, seed);
  }
  return F;
}

/**
 * Builds the wider Shire into the batch. Returns { smoke, colliders, wheel: { geo, pos, yaw } } (the water wheel is
 * its own mesh so it can turn).
 */
export function buildShire(batch) {
  const rand = rng(555);
  const smoke = [];
  const colliders = [];

  // ---- hobbit holes on the hills around the garden (just beyond the walkable meadow) ----
  const ring = [
    [-63, 8, 0, 1], [-61, -20, 1, 1], [-42, 62, 2, 0.9], [-8, 68, 3, 0.85], [24, 64, 1, 0.9], [61, 32, 4, 1], [64, -8, 2, 1],
    [61, -38, 0, 0.9], [-64, 38, 3, 0.9], [44, 61, 5, 0.85],
    // Far away and smaller: forced perspective makes the hills look bigger.
    [-96, -30, 2, 0.6], [-88, 52, 0, 0.6], [92, 18, 1, 0.6], [86, -58, 3, 0.6], [30, 98, 4, 0.55], [-40, 100, 5, 0.55],
    [-70, -92, 1, 0.55], [96, 60, 2, 0.5], [70, -110, 0, 0.5], [-110, 8, 3, 0.5],
    // More small doors dotted over the far hillsides (the set has 44 hobbit-hole facades).
    [118, -22, 5, 0.5], [-118, -62, 4, 0.5], [-20, 124, 0, 0.45], [64, 114, 3, 0.45], [-104, 86, 1, 0.5],
    [124, 42, 2, 0.45], [-128, 34, 5, 0.45], [-36, -122, 4, 0.5], [104, -84, 3, 0.5], [-58, 126, 2, 0.45],
  ];
  ring.forEach(([x, z, ci, s], i) => farHole(batch, x, z, DOOR_COLORS[ci], s, i + 2, smoke));
  // Bagshot Row: a terrace of three humbler holes lower down, south-west of the Party Field.
  for (let k = 0; k < 3; k++) farHole(batch, -38 + k * 8.5, -64, DOOR_COLORS[[0, 3, 2][k]], 0.95, 40 + k, smoke, { yaw: 0.1, second: k !== 1 });
  fence(batch, [[-44, -59], [-14, -58.5]], 0.85);

  // ---- the Party Tree with bunting from a past party ----
  const pt = tree(batch, PARTY_TREE.x, 0, PARTY_TREE.z, 1.45, 'party', 31);
  colliders.push({ x: PARTY_TREE.x, z: PARTY_TREE.z, r: pt.trunkR + 0.25 });
  {
    const G = at(batch, 0, 0, 0, 0);
    const n = 6;
    const posts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.3;
      const px = PARTY_TREE.x + Math.cos(a) * 9;
      const pz = PARTY_TREE.z + Math.sin(a) * 9;
      G.add('wood', box(0.1, 3.2, 0.1, 1).translate(0, 1.6, 0), 0xb8a088, trs(px, 0, pz), { ao: 0.4 });
      posts.push([px, pz]);
      colliders.push({ x: px, z: pz, r: 0.15 });
    }
    const flagCols = [0xd83a2a, 0xf0c030, 0x3a7ad8, 0x4ab04a, 0xf0f0e8, 0xd87ab0];
    for (const [px, pz] of posts) {
      // A sagging line from the tree's lower limbs to the post, with little triangular flags.
      const ax = PARTY_TREE.x + (px - PARTY_TREE.x) * 0.35;
      const az = PARTY_TREE.z + (pz - PARTY_TREE.z) * 0.35;
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = ax + (px - ax) * t;
        const z = az + (pz - az) * t;
        const y = 5.6 + (3.1 - 5.6) * t - Math.sin(t * Math.PI) * 0.6;
        if (i < N) {
          const nx = ax + (px - ax) * ((i + 1) / N);
          const nz = az + (pz - az) * ((i + 1) / N);
          const ny = 5.6 + (3.1 - 5.6) * ((i + 1) / N) - Math.sin(((i + 1) / N) * Math.PI) * 0.6;
          const seg = cyl(0.008, 0.008, Math.hypot(nx - x, ny - y, nz - z), 3);
          seg.rotateX(Math.PI / 2);
          const m = new THREE.Matrix4().lookAt(new THREE.Vector3(x, y, z), new THREE.Vector3(nx, ny, nz), new THREE.Vector3(0, 1, 0));
          m.setPosition((x + nx) / 2, (y + ny) / 2, (z + nz) / 2);
          G.add('plain', seg, 0xe8e0d0, m, { ao: 0 });
          const f = new THREE.BufferGeometry();
          f.setAttribute('position', new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, 0, -0.28, 0], 3));
          f.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
          f.setIndex([0, 1, 2, 0, 2, 1]);
          f.computeVertexNormals();
          G.add('cloth', f, flagCols[(i + posts.indexOf(posts.find((q) => q[0] === px))) % 6], trs((x + nx) / 2, (y + ny) / 2, (z + nz) / 2, 0, Math.atan2(nx - x, nz - z) + Math.PI / 2, 0), { ao: 0 });
        }
      }
    }
    // A long trestle table and benches left from the party.
    G.add('wood', box(3.2, 0.07, 0.8, 0.8), 0xb08a5a, trs(PARTY_TREE.x + 4.5, 0.75, PARTY_TREE.z + 2.5, 0, 0.4), { ao: 0 });
    for (const s of [-1, 1]) G.add('wood', box(0.08, 0.74, 0.6, 1).translate(0, 0.37, 0), 0x8a7058, trs(PARTY_TREE.x + 4.5 + Math.cos(0.4) * s * 1.4, 0, PARTY_TREE.z + 2.5 - Math.sin(0.4) * s * 1.4, 0, 0.4), { ao: 0.3 });
    blob(batch, PARTY_TREE.x + 4.5, PARTY_TREE.z + 2.5, 1.9, 0.7, 0.012, 0.4);
    blob(batch, PARTY_TREE.x, PARTY_TREE.z, 7.5, 7.5);
  }
  void pt;

  // ---- the signpost at the lane fork ----
  {
    const S = at(batch, 11.6, 0, -18.4, 0.6);
    S.add('wood', box(0.12, 2.3, 0.12, 1).translate(0, 1.15, 0), 0xa08868, null, { ao: 0.4 });
    S.add('sign', quad(1.1, 0.28, SIGN_UV.path), 0xffffff, trs(0.35, 1.95, 0.07), { ao: 0 });
    S.add('sign', quad(1.1, 0.28, SIGN_UV.path), 0xffffff, trs(0.35, 1.95, -0.07, 0, Math.PI), { ao: 0 });
    S.add('sign', quad(1.1, 0.55, SIGN_UV.board), 0xffffff, trs(-0.2, 1.45, 0.07, 0, 0.0), { ao: 0 });
    S.add('wood', box(1.15, 0.6, 0.06, 1), 0x6a5038, trs(-0.2, 1.45, 0.0), { ao: 0 });
    S.add('wood', box(1.15, 0.3, 0.06, 1), 0x6a5038, trs(0.35, 1.95, 0.0), { ao: 0 });
    colliders.push({ x: 11.6, z: -18.4, r: 0.15 });
  }
  // Fences along the lane down to Bywater (rough split timber, following the ground).
  fence(batch, [[10.2, -24], [7.6, -32], [9.6, -42], [12.8, -54], [16.8, -66]], 0.9, { groundY: groundHeight });
  fence(batch, [[3.8, -36], [6.2, -46], [9.2, -58], [12.6, -70], [18.2, -82]], 0.9, { groundY: groundHeight });

  // ---- Bywater: the lake water, reeds, lily pads ----
  {
    const pos = [];
    const col = [];
    const idx = [];
    const x0 = LAKE.armTo.x - 6;
    const x1 = LAKE.x + LAKE.r + 3;
    const z0 = LAKE.z - LAKE.r - 3;
    const z1 = LAKE.z + LAKE.r + 3;
    const step = 1.2;
    const nx = Math.ceil((x1 - x0) / step) + 1;
    const nz = Math.ceil((z1 - z0) / step) + 1;
    const wdA = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * step;
        const z = z0 + j * step;
        const wd = waterDist(x, z);
        wdA.push(wd);
        pos.push(x, LAKE.y, z);
        const deep = Math.min(1, Math.max(0, -wd / 6));
        col.push(0.85 - deep * 0.35, 0.95 - deep * 0.3, 0.95 - deep * 0.2);
      }
    }
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        if (Math.min(wdA[a], wdA[a + 1], wdA[a + nx], wdA[a + nx + 1]) > 0.8) continue;
        idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.setIndex(idx);
    batch.add('water', g, 0xffffff, null, { ao: 0, jitter: 0 });
    const G = at(batch, 0, 0, 0, 0);
    // Reeds along the shore, lily pads on the water.
    for (let i = 0; i < 900; i++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      const wd = waterDist(x, z);
      if (wd > -0.2 && wd < 1.2 && rand() < 0.7) {
        const h = 0.8 + rand() * 0.7;
        const y = Math.max(LAKE.y, groundHeight(x, z));
        for (let k = 0; k < 3; k++) {
          const r = new THREE.ConeGeometry(0.018, h, 3, 1, true);
          r.translate(0, h / 2, 0);
          G.add('plain', r, 0x6a8a3a, trs(x + (rand() - 0.5) * 0.3, y, z + (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3, rand() * 3, (rand() - 0.5) * 0.3), { ao: 0, jitter: 0.2 });
        }
        if (rand() < 0.3) G.add('wood', cyl(0.025, 0.025, 0.14, 5), 0x6a4a2a, trs(x, y + h * 0.85, z), { ao: 0 });
      } else if (wd < -0.8 && wd > -5 && rand() < 0.25) {
        const pad = new THREE.CircleGeometry(0.22 + rand() * 0.15, 8, 0.4, Math.PI * 2 - 0.4);
        pad.rotateX(-Math.PI / 2);
        G.add('plain', pad, 0x4a7a30, trs(x, LAKE.y + 0.012, z, 0, rand() * 6, 0), { ao: 0, jitter: 0.15 });
        if (rand() < 0.25) G.add('plain', new THREE.IcosahedronGeometry(0.06, 0), 0xf0b0c8, trs(x, LAKE.y + 0.05, z), { ao: 0 });
      }
    }
  }

  // ---- the double-arched stone bridge over the lake's arm ----
  {
    const by = LAKE.y;
    const half = 5.6;
    const shape = new THREE.Shape();
    const bankY = -1.05;
    shape.moveTo(-half - 0.6, bankY - 0.3);
    shape.lineTo(-half - 0.6, bankY + 0.25);
    shape.quadraticCurveTo(0, by + 4.0, half + 0.6, bankY + 0.25);
    shape.lineTo(half + 0.6, bankY - 0.3);
    shape.lineTo(-half - 0.6, bankY - 0.3);
    for (const cx of [-2.35, 2.35]) {
      const hole = new THREE.Path();
      const r = 1.5;
      hole.moveTo(cx - r, by - 0.6);
      hole.lineTo(cx - r, by);
      hole.absarc(cx, by, r, Math.PI, 0, true);
      hole.lineTo(cx + r, by - 0.6);
      hole.lineTo(cx - r, by - 0.6);
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 2.6, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -1.3);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
    // The bridge spans the arm along z: local x of the profile → world z.
    const yaw = Math.PI / 2 + 0.06;
    batch.add('stone', g, 0xc8c0b0, trs(BRIDGE_POS.x, 0, BRIDGE_POS.z - 0.5, 0, yaw, 0), { ao: 0 });
    // Parapets following the deck's curve.
    const deck = (t) => bankY + 0.25 + (by + 4.0 - bankY - 0.25) * 2 * t * (1 - t);
    for (const side of [-1.2, 1.2]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector3(-half - 0.6 + t * (2 * half + 1.2), deck(t) + 0.32, side));
      }
      const par = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.2, 4, false);
      par.scale(1, 1.6, 1);
      batch.add('stone', par, 0xb8b0a0, trs(BRIDGE_POS.x, 0, BRIDGE_POS.z - 0.5, 0, yaw, 0), { ao: 0 });
    }
    // The deck's gravel (a slim strip on top of the masonry).
    const dpts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      dpts.push(new THREE.Vector3(-half - 0.6 + t * (2 * half + 1.2), deck(t) + 0.02, 0));
    }
    const dg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dpts), 24, 1.0, 4, false);
    dg.scale(1, 0.05, 1);
    batch.add('flag', dg, 0xb8a888, trs(BRIDGE_POS.x, 0, BRIDGE_POS.z - 0.5, 0, yaw, 0), { ao: 0 });
  }

  // ---- the Mill: stone ground floor, plastered timber upper storey, thatched roof, the water wheel on the lake side ----
  let wheel;
  {
    const my = groundHeight(MILL_POS.x, MILL_POS.z);
    const M = at(batch, MILL_POS.x, my, MILL_POS.z, 0.15);
    const W = 7;
    const D = 5.5;
    M.add('stone', box(W, 3.2, D, 0.8), 0xc8bca8, trs(0, 1.4, 0), { ao: 0.8 });
    M.add('plaster', box(W - 0.2, 2.0, D - 0.2, 0.5), 0xf0e4c8, trs(0, 4.0, 0), { ao: 0 });
    for (let bx = -W / 2 + 0.2; bx <= W / 2; bx += W / 5) {
      M.add('wood', box(0.16, 2.0, 0.06, 1), 0x4a3a2a, trs(bx, 4.0, -D / 2 + 0.07), { ao: 0 });
      M.add('wood', box(0.16, 2.0, 0.06, 1), 0x4a3a2a, trs(bx, 4.0, D / 2 - 0.07), { ao: 0 });
    }
    const slope = 0.75;
    const rl = (D / 2 + 0.8) / Math.cos(slope);
    for (const sz of [-1, 1]) M.add('thatch', box(W + 1.2, 0.45, rl, 0.5), 0xd8c8a0, trs(0, 5.0 + Math.tan(slope) * (D / 4 + 0.2), (sz * (D / 2 + 0.6)) / 2, sz * slope, 0, 0), { ao: 0 });
    for (const sx of [-1, 1]) {
      const gable = new THREE.BufferGeometry();
      const gx = (sx * (W - 0.2)) / 2;
      gable.setAttribute('position', new THREE.Float32BufferAttribute([gx, 5.0, D / 2 - 0.1, gx, 5.0, -D / 2 + 0.1, gx, 5.0 + Math.tan(slope) * D / 2, 0], 3));
      gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 1, 1], 2));
      gable.setIndex(sx > 0 ? [0, 1, 2] : [0, 2, 1]);
      gable.computeVertexNormals();
      M.add('plaster', gable, 0xeadcc0, null, { ao: 0 });
    }
    // Windows, the door, a chimney.
    for (const [lx, ly, lz] of [[-1.8, 4.0, D / 2], [1.4, 4.0, D / 2], [-1.8, 4.0, -D / 2], [1.4, 4.0, -D / 2], [2.2, 1.8, D / 2]]) {
      M.add('glow', box(0.8, 0.7, 0.05, 1), 0x3a3830, trs(lx, ly, lz + Math.sign(lz) * 0.02), { ao: 0 });
      M.add('wood', box(0.9, 0.08, 0.1, 1), 0x4a3a2a, trs(lx, ly - 0.4, lz + Math.sign(lz) * 0.04), { ao: 0 });
    }
    M.add('wood', box(1.2, 2.0, 0.08, 1), 0x6a4a2a, trs(-1.0, 1.0, D / 2 + 0.03), { ao: 0.3 });
    smoke.push(chimney(M, 2.6, 6.2, -1.0, 'stack'));
    // Sacks of flour by the door.
    for (let k = 0; k < 3; k++) M.add('cloth', new THREE.SphereGeometry(0.3, 8, 6), 0xe8dcc0, trs(0.2 + k * 0.55, 0.28, D / 2 + 0.5, 0, 0, 0, [0.8, 1.1, 0.7]), { ao: 0.3 });
    // The water wheel on the lake side (−z), its own mesh: a hub, rims, spokes and paddles.
    const parts = [];
    const R = 2.4;
    for (const s of [-0.45, 0.45]) {
      const rim = new THREE.TorusGeometry(R, 0.08, 5, 28);
      rim.translate(0, 0, s);
      parts.push(rim);
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const pad = new THREE.BoxGeometry(0.06, 0.55, 1.0);
      pad.translate(0, R - 0.1, 0);
      pad.rotateZ(a);
      parts.push(pad);
      if (k % 2 === 0) {
        for (const s of [-0.45, 0.45]) {
          const sp = new THREE.BoxGeometry(0.07, R, 0.07);
          sp.translate(0, R / 2, s);
          sp.rotateZ(a);
          parts.push(sp);
        }
      }
    }
    const hub = new THREE.CylinderGeometry(0.25, 0.25, 1.3, 10);
    hub.rotateX(Math.PI / 2);
    parts.push(hub);
    const merged = parts.map((p) => paint(p.index ? p : p, 0x8a6a4a));
    const wpos = M.toWorld(-0.6, 1.6, -D / 2 - 0.8);
    wheel = { parts: merged, pos: wpos, yaw: 0.15 + Math.PI / 2 };
    // The mill race: a wooden trough bringing water to the top of the wheel.
    M.add('wood', box(0.9, 0.3, 3.2, 0.8), 0x6a5040, trs(-0.6, 4.3, -D / 2 - 0.8 - 1.4, 0.18, Math.PI / 2, 0), { ao: 0 });
    colliders.push({ x: MILL_POS.x, z: MILL_POS.z, r: 3.6 });
  }

  // ---- far trees, hedgerows dividing the fields, sheep ----
  for (let i = 0; i < 95; i++) {
    const a = rand() * Math.PI * 2;
    const r = 62 + rand() * 80;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (waterDist(x, z) < 3 || Math.hypot(x - MILL_POS.x, z - MILL_POS.z) < 8) continue;
    if (ring.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 9)) continue;
    const kind = rand() < 0.2 ? 'farPoplar' : 'far';
    tree(batch, x, groundHeight(x, z) - 0.2, z, 0.8 + rand() * 0.7, kind, 100 + i);
  }
  // A few trees in the meadow between the garden and the hills.
  for (const [x, z, s] of [[-44, -6, 1.1], [42, 22, 1.0], [-36, 30, 1.2], [38, -30, 1.0], [48, -12, 0.9], [-52, 18, 1.0], [14, 44, 1.1], [-20, 46, 1.0]]) {
    const t = tree(batch, x, 0, z, s, 'round', Math.round(x * z));
    colliders.push({ x, z, r: t.trunkR + 0.15 });
  }
  // Hedgerows along the field edges of the far hills (the same 22 × 18 m grid as the field colours in ground.js),
  // broken by gaps and gates, with a hedgerow tree now and then.
  const G = at(batch, 0, 0, 0, 0);
  const hedgeFuzz = new Accum();
  const hedgeCol = new THREE.Color(0x3f6a24);
  const fuzzCol = new THREE.Color(0x9ec060);
  const ringD = (x, z) => Math.pow(Math.abs(x) ** 6 + Math.abs(z) ** 6, 1 / 6);
  const clear = (x, z) => waterDist(x, z) > 3 && laneDist(x, z) > 2.2 && Math.hypot(x - MILL_POS.x, z - MILL_POS.z) > 9
    && !ring.some(([hx, hz, , hs]) => Math.hypot(x - hx, z - hz) < 7 * hs + 2) && !(x > -46 && x < -12 && z > -70 && z < -56);
  const edges = [];
  for (let gx = -6; gx <= 6; gx++) for (let gz = -8; gz <= 8; gz++) {
    edges.push([gx * 22, gz * 18, gx * 22 + 22, gz * 18]);
    edges.push([gx * 22, gz * 18, gx * 22, gz * 18 + 18]);
  }
  for (const [ax, az, bx, bz] of edges) {
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const d = ringD(mx, mz);
    if (d < 68 || d > 142) continue;
    // Only some field edges carry a hedge (fewer where two fields of the same kind meet).
    const keep = noise2(mx * 0.13 + 2.7, mz * 0.13 - 1.9) + (Math.abs(fieldType(ax + 1, az + 1) - fieldType(bx - 1, bz - 1)) > 0.2 ? 0.15 : 0);
    if (keep < 0.5) continue;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 2.4);
    const gate = Math.floor(rand() * n);
    for (let k = 0; k < n; k++) {
      if (k === gate) continue;
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t + (rand() - 0.5) * 0.6;
      const z = az + (bz - az) * t + (rand() - 0.5) * 0.6;
      if (!clear(x, z) || ringD(x, z) > 146) continue;
      const y = groundHeight(x, z);
      const r = 1.2 + rand() * 0.5;
      const g = new THREE.IcosahedronGeometry(r, 0);
      lumpy(g, 0.2, 1, k + Math.round(mx));
      G.add('foliage', g, hedgeCol.clone().offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.06), trs(x, y + 0.55, z, 0, rand() * 3, 0, [1, 0.72, 1]), { ao: 0, jitter: 0.15 });
      leafCards(hedgeFuzz, x, y + 0.9 + rand() * 0.4, z, 1.5, 1, rand, fuzzCol, new THREE.Vector3(x, y, z), 2);
    }
    // A hedgerow oak or ash on some edges.
    if (rand() < 0.28) {
      const t = 0.2 + rand() * 0.6;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (clear(x, z)) tree(batch, x, groundHeight(x, z) - 0.2, z, 0.9 + rand() * 0.5, 'far', 300 + edges.length + Math.round(x * 3 + z));
    }
  }
  batch.add('leaves', hedgeFuzz.geometry(), 0xffffff, null, { ao: 0, jitter: 0.08 });
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 66 + rand() * 50;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (waterDist(x, z) < 4) continue;
    const y = groundHeight(x, z);
    const yaw = rand() * 6.28;
    const S = at(batch, x, y, z, yaw);
    const wool = new THREE.IcosahedronGeometry(0.42, 1);
    lumpy(wool, 0.06, 6, i);
    S.add('plain', wool, 0xf0ece0, trs(0, 0.55, 0, 0, 0, 0, [0.8, 0.75, 1.25]), { ao: 0 });
    S.add('plain', new THREE.SphereGeometry(0.16, 6, 5), 0x2a2622, trs(0, 0.62, 0.52, 0, 0, 0, [0.8, 0.9, 1.2]), { ao: 0 });
    for (const [lx, lz] of [[-0.18, 0.3], [0.18, 0.3], [-0.18, -0.3], [0.18, -0.3]]) S.add('plain', box(0.06, 0.36, 0.06, 1).translate(0, 0.18, 0), 0x2a2622, trs(lx, 0, lz), { ao: 0 });
  }
  return { smoke, colliders, wheel };
}
