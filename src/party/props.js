/* ==== party/props.js — what Bilbo's eleventy-first birthday party puts on the Party Field (NOTES-39-party; LotR book 1
   ch. 1 "A Long-expected Party"). Everything is built round the existing Party Tree (surface/ground.js PARTY_TREE) and
   its six bunting posts (surface/shire.js: radius 9 m, the first at 0.3 rad), which become the great pavilion's poles:
   the book's pavilion is so big that the tree stands inside it.
   - stage 0 (always): the signboard by the lane where the furnishing is bought (a pinned blank parchment: no invented
     inscription);
   - stage 1: the great pavilion (a canvas ring round the tree on the bunting posts and six inner poles, a scalloped
     valance), lanterns hung in the tree (book: "Lanterns were hung on all its branches"), the large white gate on the
     lane (book: "a large white gate");
   - stage 2: long trestle tables and benches under the canvas, the field kitchen west of it (a shed, a hearth with a
     fire, cauldrons, a work table with loaves, barrels, firewood);
   - stage 3: Bilbo's presents: wrapped parcels with white labels on a table inside the gate (the children got theirs at
     the gate) and a heap by the chief table;
   - stage 4: Gandalf's cart with the fireworks: crates marked with his red rune (the same futhorc G as the mark on Bag
     End's door, home-events/marks.js), long rockets in bundles, rocket racks south of the pavilion;
   - stage 5: the tables laid (plates, mugs, pies, loaves, hams), Bilbo's chair at the head of the chief table under the
     tree (he stood on a chair for his speech), a string of lanterns round the canvas edge.
   buildStages(stages) returns one geometry for the vertex-coloured (double-sided) Lambert mesh and one for the lantern
   glass / fire (the surface's night-glow material), plus the colliders. The figures for the party scene (guests from the
   feast crowd, Gandalf, Bilbo) come from home-events/figures.js. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FEAST_HOBBITS, gandalfGeometry, hobbitGeometry } from '../home-events/figures.js';
import { PARTY_TREE } from '../surface/ground.js';
import { rng } from '../surface/kit.js';

/** The Party Tree (world xz); everything below is placed in metres from it (no rotation). */
export const TREE = { x: PARTY_TREE.x, z: PARTY_TREE.z };
const POSTS_R = 9;
const POST_A0 = 0.3;
/** The canvas ring: outer edge on the posts, inner edge on six poles round the trunk. */
const CANVAS = { outerR: 9.3, outerY: 3.3, innerR: 3.1, innerY: 6.1 };
/** The lane into the field (surface/ground.js LANES[1]): the white gate stands across it. */
const LANE_DIR = new THREE.Vector2(-7, -5.5).normalize();
const GATE = { x: -18.2 - TREE.x, z: -23.8 - TREE.z, w: 2.6 };
const ACROSS = new THREE.Vector2(-LANE_DIR.y, LANE_DIR.x); // (0.618, −0.786)
/** The signboard: outside the gate, beside the lane (the side away from the garden tree at −15, −24), facing the way from Bag End. */
export const SIGN = {
  x: TREE.x + GATE.x - LANE_DIR.x * 1.4 - ACROSS.x * 2.0,
  z: TREE.z + GATE.z - LANE_DIR.y * 1.4 - ACROSS.y * 2.0,
  yaw: Math.atan2(-LANE_DIR.x, -LANE_DIR.y),
};
/** Tables (local centre x, z, length along x). The chief table runs west from the tree, the tree at its head. */
export const TABLES = [
  [-4.6, 0, 5.0],
  [-4.3, 3.0, 4.2],
  [-4.3, -3.0, 4.2],
  [4.6, -3.2, 4.2],
  [0.6, -5.7, 4.2],
  [0.4, 5.7, 4.0],
];
const TABLE_H = 0.72;
const BENCH_OFF = 0.72;
/** Bilbo's chair at the head of the chief table (local), facing the guests (−x). */
export const CHAIR = { x: -1.6, z: 0, seat: 0.46 };
const KITCHEN = { x: -14.5, z: -4.2 };
const CART = { x: 8.6, z: -13.2, yaw: 0.35 };
/** Where the rockets go up from for the party scene (world): south of the field, towards Bywater (book: the dragon "burst over Bywater"). */
export const LAUNCH = { x: -22, z: -86 };

const postAngle = (k) => POST_A0 + (k * Math.PI) / 3;

/** Paints a geometry one colour (sRGB hex) as a vertex colour attribute and drops the uv (all parts merge alike). */
function painted(geo, hex) {
  const g = geo; // (primitives are indexed; the hand-made ones below are built indexed too)
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
/** World matrix from a local (tree-relative) position, a yaw and optional pitch / roll / scale. */
function M(lx, y, lz, ry = 0, rx = 0, rz = 0, s = 1) {
  tmpE.set(rx, ry, rz, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  if (Array.isArray(s)) tmpS.set(s[0], s[1], s[2]);
  else tmpS.set(s, s, s);
  return new THREE.Matrix4().compose(tmpP.set(TREE.x + lx, y, TREE.z + lz), tmpQ, tmpS);
}

/** Collects painted parts and merges them. */
class Parts {
  constructor() {
    this.list = [];
  }

  add(geo, hex, m = null) {
    if (m) geo.applyMatrix4(m);
    this.list.push(painted(geo, hex));
    return geo;
  }

  merge() {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list);
    for (const p of this.list) p.dispose();
    this.list = [];
    g.computeBoundingSphere();
    return g;
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);
/** A stick from a to b (local [x, y, z]) of radius r. */
function stick(P, a, b, r, hex, n = 5) {
  const A = new THREE.Vector3(TREE.x + a[0], a[1], TREE.z + a[2]);
  const B = new THREE.Vector3(TREE.x + b[0], b[1], TREE.z + b[2]);
  const len = A.distanceTo(B);
  const g = cyl(r, r, len, n);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  P.add(g, hex);
}

/** A flat indexed quad strip geometry from rows of local points ([[x, y, z] …] per row, same length). */
function sheet(rows) {
  const pos = [];
  for (const r of rows) for (const [x, y, z] of r) pos.push(TREE.x + x, y, TREE.z + z);
  const n = rows[0].length;
  const idx = [];
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A small hanging lantern: dark cap and base (Lambert), the glass into `G` (glow). */
function lantern(P, G, lx, y, lz, cord = 0.5) {
  P.add(new THREE.ConeGeometry(0.12, 0.09, 6), 0x2a2018, M(lx, y + 0.155, lz));
  P.add(cyl(0.07, 0.08, 0.03, 6), 0x2a2018, M(lx, y - 0.125, lz));
  if (cord > 0) P.add(cyl(0.006, 0.006, cord, 3), 0x3a3026, M(lx, y + 0.2 + cord / 2, lz));
  G.add(cyl(0.075, 0.075, 0.22, 6), 0xffc860, M(lx, y, lz));
}

/** Height of the canvas's underside at radius r from the trunk. */
function canvasY(r) {
  const t = (r - CANVAS.innerR) / (CANVAS.outerR - CANVAS.innerR);
  return CANVAS.innerY + (CANVAS.outerY - CANVAS.innerY) * t - Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 0.25;
}

/* ---------------- stage 0: the signboard ---------------- */

function buildSign(P, col) {
  const lx = SIGN.x - TREE.x;
  const lz = SIGN.z - TREE.z;
  const yaw = SIGN.yaw;
  for (const s of [-1, 1]) {
    const ox = Math.cos(yaw) * s * 0.42;
    const oz = -Math.sin(yaw) * s * 0.42;
    P.add(box(0.09, 1.55, 0.09).translate(0, 0.775, 0), 0x8a6a48, M(lx + ox, 0, lz + oz, yaw));
  }
  P.add(box(1.0, 0.66, 0.05), 0x7a5a3a, M(lx, 1.2, lz, yaw));
  P.add(box(1.08, 0.08, 0.14), 0x5a4028, M(lx, 1.57, lz, yaw)); // a little roof board
  // The pinned parchment (blank: nothing invented is written on it) and four brass pins.
  const fx = Math.sin(yaw) * 0.03;
  const fz = Math.cos(yaw) * 0.03;
  P.add(box(0.62, 0.44, 0.01), 0xead8b0, M(lx + fx, 1.2, lz + fz, yaw, 0, 0.04));
  for (const [px, py] of [[-0.27, 0.18], [0.27, 0.18], [-0.27, -0.18], [0.27, -0.18]]) {
    P.add(new THREE.SphereGeometry(0.018, 5, 3), 0xc8a040, M(lx + fx * 1.4 + Math.cos(yaw) * px, 1.2 + py, lz + fz * 1.4 - Math.sin(yaw) * px, yaw));
  }
  col.push({ x: SIGN.x, z: SIGN.z, r: 0.5 });
}

/* ---------------- stage 1: the pavilion, the tree's lanterns, the white gate ---------------- */

function buildPavilion(P, G, col) {
  const C = CANVAS;
  const SEG = 6; // radial rows (a slight sag)
  for (let k = 0; k < 6; k++) {
    const a0 = postAngle(k);
    const a1 = postAngle(k + 1);
    const rows = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const r = C.innerR + (C.outerR - C.innerR) * t;
      // The outer edge runs straight from post to post (a hexagon); the inner edge is a smaller hexagon.
      const row = [];
      for (let j = 0; j <= 4; j++) {
        const u = j / 4;
        const x = (Math.cos(a0) * (1 - u) + Math.cos(a1) * u) * r;
        const z = (Math.sin(a0) * (1 - u) + Math.sin(a1) * u) * r;
        // Between the poles the cloth sags a little more.
        const y = canvasY(r) + 0.05 - Math.sin(u * Math.PI) * 0.18 * t;
        row.push([x, y, z]);
      }
      rows.push(row);
    }
    P.add(sheet(rows), k % 2 ? 0xf4eedf : 0xe8dfc8);
    // The scalloped valance hanging from the outer edge: green and yellow (hobbits' colours, book ch. 1).
    const ax = Math.cos(a0) * C.outerR;
    const az = Math.sin(a0) * C.outerR;
    const bx = Math.cos(a1) * C.outerR;
    const bz = Math.sin(a1) * C.outerR;
    const N = 7;
    for (let j = 0; j < N; j++) {
      const u0 = j / N;
      const u1 = (j + 1) / N;
      const um = (u0 + u1) / 2;
      const p0 = [ax + (bx - ax) * u0, C.outerY + 0.04 - Math.sin(u0 * Math.PI) * 0.18, az + (bz - az) * u0];
      const p1 = [ax + (bx - ax) * u1, C.outerY + 0.04 - Math.sin(u1 * Math.PI) * 0.18, az + (bz - az) * u1];
      const pm = [ax + (bx - ax) * um, C.outerY - 0.38 - Math.sin(um * Math.PI) * 0.18, az + (bz - az) * um];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([TREE.x + p0[0], p0[1], TREE.z + p0[2], TREE.x + p1[0], p1[1], TREE.z + p1[2], TREE.x + pm[0], pm[1], TREE.z + pm[2]], 3));
      g.setIndex([0, 1, 2]);
      g.computeVertexNormals();
      P.add(g, (j + k) % 2 ? 0x4a8a32 : 0xd8b030);
    }
    // The inner pole and a guy rope from the outer post out to a stake.
    stick(P, [Math.cos(a0) * C.innerR, 0, Math.sin(a0) * C.innerR], [Math.cos(a0) * C.innerR, C.innerY + 0.3, Math.sin(a0) * C.innerR], 0.07, 0xb8a088, 7);
    P.add(new THREE.SphereGeometry(0.1, 7, 5), 0xd8b030, M(Math.cos(a0) * C.innerR, C.innerY + 0.36, Math.sin(a0) * C.innerR));
    col.push({ x: TREE.x + Math.cos(a0) * C.innerR, z: TREE.z + Math.sin(a0) * C.innerR, r: 0.15 });
    const px = Math.cos(a0) * POSTS_R;
    const pz = Math.sin(a0) * POSTS_R;
    stick(P, [px, 3.1, pz], [Math.cos(a0) * 11.6, 0.02, Math.sin(a0) * 11.6], 0.012, 0xd8d0b8, 3);
    P.add(box(0.06, 0.25, 0.06).translate(0, 0.06, 0), 0x6a5038, M(Math.cos(a0) * 11.6, 0, Math.sin(a0) * 11.6));
    // A pennant on top of each post.
    stick(P, [px, 3.15, pz], [px, 3.9, pz], 0.025, 0xb8a088, 5);
    const f = new THREE.BufferGeometry();
    f.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.26, 0, 0.5, -0.13, 0], 3));
    f.setIndex([0, 1, 2]);
    f.computeVertexNormals();
    P.add(f, k % 2 ? 0xd83a2a : 0x3a7ad8, M(px, 3.9, pz, a0 + Math.PI / 2));
  }
  // Lanterns hung under the canvas and in the tree (book: "Lanterns were hung on all its branches").
  const rand = rng(3901);
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.6 + rand() * 6.2;
    const top = r < CANVAS.innerR ? 7.6 : canvasY(r) - 0.05;
    const y = top - 0.45 - rand() * (r < CANVAS.innerR ? 2.2 : 0.9);
    lantern(P, G, Math.cos(a) * r, y, Math.sin(a) * r, Math.max(0.1, top - y - 0.2));
  }
}

function buildGate(P, col) {
  const { x, z, w } = GATE;
  const yaw = Math.atan2(ACROSS.x, ACROSS.y); // local +z along the gate's line
  const white = 0xf2f0e8;
  const along = (d) => [x + ACROSS.x * d, z + ACROSS.y * d];
  for (const s of [-1, 1]) {
    const [px, pz] = along((s * w) / 2);
    P.add(box(0.2, 1.55, 0.2).translate(0, 0.775, 0), white, M(px, 0, pz, yaw));
    P.add(new THREE.SphereGeometry(0.13, 8, 6), white, M(px, 1.62, pz));
    col.push({ x: TREE.x + px, z: TREE.z + pz, r: 0.2 });
    // The gate leaf, opened inwards (into the field) against the fence line.
    const open = -s * 1.25;
    const lw = w / 2 - 0.12;
    for (const ry of [0.25, 0.65, 1.05]) {
      const rail = box(0.05, 0.07, lw);
      rail.translate(0, ry, -s * (lw / 2 + 0.1));
      P.add(rail, white, M(px, 0, pz, yaw + open));
    }
    for (const u of [0.15, 0.5, 0.85]) {
      const st = box(0.05, 0.9, 0.06);
      st.translate(0, 0.65, -s * (0.1 + u * lw));
      P.add(st, white, M(px, 0, pz, yaw + open));
    }
    const diag = box(0.04, Math.hypot(lw, 0.8), 0.05);
    diag.rotateX(s * Math.atan2(lw, 0.8));
    diag.translate(0.01, 0.65, -s * (0.1 + lw / 2));
    P.add(diag, white, M(px, 0, pz, yaw + open));
    // A short white fence going on from each post.
    for (let k = 0; k < 3; k++) {
      const d = s * (w / 2 + 0.75 + k * 1.1);
      const [fx, fz] = along(d);
      P.add(box(0.09, 1.0, 0.09).translate(0, 0.5, 0), white, M(fx, 0, fz, yaw));
      const [mx, mz] = along(d - s * 0.55);
      for (const ry of [0.4, 0.85]) P.add(box(0.04, 0.07, 1.1), white, M(mx, ry, mz, yaw));
      col.push({ x: TREE.x + fx, z: TREE.z + fz, r: 0.12 });
    }
  }
}

/* ---------------- stage 2: tables, benches, the kitchen ---------------- */

function trestle(P, lx, lz, len, col) {
  const wood = 0xb08a5a;
  P.add(box(len, 0.06, 0.8), wood, M(lx, TABLE_H, lz));
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const leg = box(0.06, TABLE_H, 0.06);
      leg.translate(0, TABLE_H / 2, 0);
      P.add(leg, 0x8a6a48, M(lx + s * (len / 2 - 0.3), 0, lz + t * 0.3, 0, t * 0.18));
    }
    P.add(box(0.05, 0.05, 0.62), 0x8a6a48, M(lx + s * (len / 2 - 0.3), 0.3, lz));
    // The benches either side.
    P.add(box(len - 0.2, 0.05, 0.28), 0xa8825a, M(lx, 0.42, lz + s * BENCH_OFF));
    for (const e of [-1, 1]) P.add(box(0.05, 0.42, 0.24).translate(0, 0.21, 0), 0x8a6a48, M(lx + e * (len / 2 - 0.4), 0, lz + s * BENCH_OFF));
  }
  for (let u = -len / 2 + 0.5; u <= len / 2 - 0.5 + 1e-6; u += Math.max(0.8, (len - 1) / Math.round((len - 1) / 0.9))) col.push({ x: TREE.x + lx + u, z: TREE.z + lz, r: 0.62 });
}

function buildKitchen(P, G, col) {
  const { x, z } = KITCHEN;
  const wood = 0x8a6a48;
  // An open shed: four posts, a sloping plank roof (higher towards the pavilion), open to the east.
  for (const [dx, dz, h] of [[-1.6, -2.1, 2.1], [-1.6, 2.1, 2.1], [1.6, -2.1, 2.6], [1.6, 2.1, 2.6]]) {
    P.add(box(0.14, h, 0.14).translate(0, h / 2, 0), wood, M(x + dx, 0, z + dz));
    col.push({ x: TREE.x + x + dx, z: TREE.z + z + dz, r: 0.15 });
  }
  P.add(box(3.8, 0.08, 4.8), 0x6a5040, M(x, 2.43, z, 0, 0, Math.atan2(0.5, 3.2)));
  // The hearth: a low stone block with a fire, two cauldrons and a kettle.
  P.add(box(1.6, 0.45, 1.0).translate(0, 0.225, 0), 0x8a8478, M(x - 0.6, 0, z - 0.8));
  for (let k = 0; k < 6; k++) P.add(cyl(0.05, 0.05, 0.5, 5), 0x3a2414, M(x - 0.95 + k * 0.13, 0.5, z - 0.8, 0, 0, Math.PI / 2 + (k % 2 ? 0.3 : -0.3)));
  G.add(new THREE.ConeGeometry(0.22, 0.5, 7), 0xff8a30, M(x - 1.0, 0.7, z - 0.8));
  G.add(new THREE.ConeGeometry(0.16, 0.36, 7), 0xffb040, M(x - 0.55, 0.64, z - 0.75));
  for (const [dx, r] of [[-1.0, 0.3], [-0.2, 0.24]]) {
    const pot = new THREE.SphereGeometry(r, 10, 7, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
    P.add(pot, 0x2a2622, M(x + dx, 0.45 + r * 0.9, z - 0.8));
    // The tripod over it.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      stick(P, [x + dx + Math.cos(a) * 0.55, 0, z - 0.8 + Math.sin(a) * 0.55], [x + dx, 1.45, z - 0.8], 0.025, 0x3a2a1a, 4);
    }
  }
  // A work table with loaves and a cheese, barrels and a firewood stack.
  P.add(box(1.8, 0.06, 0.7), 0xb08a5a, M(x + 0.3, 0.78, z + 1.2));
  for (const dx of [-0.7, 0.7]) P.add(box(0.06, 0.78, 0.6).translate(0, 0.39, 0), wood, M(x + 0.3 + dx, 0, z + 1.2));
  for (let k = 0; k < 5; k++) {
    const loaf = new THREE.SphereGeometry(0.11, 8, 5);
    loaf.scale(1.4, 0.7, 1);
    P.add(loaf, 0xc08a48, M(x - 0.3 + k * 0.26, 0.86, z + 1.1 + (k % 2) * 0.18));
  }
  P.add(cyl(0.16, 0.16, 0.12, 12), 0xe8c860, M(x + 0.95, 0.87, z + 1.25));
  for (const [dx, dz] of [[1.2, -1.5], [1.25, -0.85], [-1.3, 1.9]]) {
    const b = new THREE.CylinderGeometry(0.28, 0.25, 0.75, 12);
    b.translate(0, 0.375, 0);
    P.add(b, 0x7a5a3a, M(x + dx, 0, z + dz));
    for (const hy of [0.15, 0.6]) P.add(cyl(0.285, 0.285, 0.04, 12), 0x3a3a38, M(x + dx, hy, z + dz));
  }
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6 - r; k++) P.add(cyl(0.07, 0.07, 1.0, 6), 0x9a7048, M(x - 1.3, 0.08 + r * 0.13, z - 2.0 + 0.0 + k * 0.15 + r * 0.075, 0, Math.PI / 2, 0));
  col.push({ x: TREE.x + x - 0.6, z: TREE.z + z - 0.8, r: 0.9 }, { x: TREE.x + x + 0.3, z: TREE.z + z + 1.2, r: 0.9 });
}

/* ---------------- stage 3: Bilbo's presents ---------------- */

const WRAP = [0xc83a3a, 0x3a7a3a, 0xd8b030, 0x3a5ab0, 0x8a3a8a, 0xe8e0d0, 0xd87a2a];
const RIBBON = [0xf0d870, 0xc83a3a, 0xf0f0e8, 0xd8b030];

/** One wrapped parcel with a ribbon cross and a small white label (book: each present was labelled). */
function parcel(P, lx, y, lz, w, h, d, yaw, k) {
  P.add(box(w, h, d).translate(0, h / 2, 0), WRAP[k % WRAP.length], M(lx, y, lz, yaw));
  const rib = RIBBON[(k + 1) % RIBBON.length];
  P.add(box(w + 0.01, h + 0.01, 0.025).translate(0, h / 2, 0), rib, M(lx, y, lz, yaw));
  P.add(box(0.025, h + 0.01, d + 0.01).translate(0, h / 2, 0), rib, M(lx, y, lz, yaw));
  P.add(box(0.06, 0.004, 0.04), 0xf8f6ee, M(lx + Math.cos(yaw) * w * 0.28, y + h + 0.004, lz - Math.sin(yaw) * w * 0.28, yaw + 0.4));
}

function buildGifts(P, col) {
  const rand = rng(3903);
  // A long table just inside the gate, along the lane.
  const tx = GATE.x + LANE_DIR.x * 2.0 - ACROSS.x * 2.3;
  const tz = GATE.z + LANE_DIR.y * 2.0 - ACROSS.y * 2.3;
  const yaw = Math.atan2(-LANE_DIR.y, LANE_DIR.x); // the table's length (local x) along the lane
  const ux = Math.cos(yaw);
  const uz = -Math.sin(yaw);
  P.add(box(2.6, 0.06, 0.8), 0xb08a5a, M(tx, 0.72, tz, yaw));
  for (const s of [-1, 1]) P.add(box(0.06, 0.72, 0.62).translate(0, 0.36, 0), 0x8a6a48, M(tx + ux * s * 1.0, 0, tz + uz * s * 1.0, yaw));
  P.add(box(2.7, 0.3, 0.02), 0xe8e0d0, M(tx - Math.sin(yaw) * 0.41, 0.6, tz - Math.cos(yaw) * 0.41, yaw)); // a cloth hanging on the front
  let k = 0;
  for (let i = 0; i < 9; i++) {
    const u = -1.1 + i * 0.27 + (rand() - 0.5) * 0.05;
    const v = (rand() - 0.5) * 0.4;
    const w = 0.16 + rand() * 0.14;
    const h = 0.1 + rand() * 0.16;
    parcel(P, tx + ux * u - Math.sin(yaw) * v, 0.75, tz + uz * u - Math.cos(yaw) * v, w, h, 0.14 + rand() * 0.12, yaw + (rand() - 0.5) * 0.5, k++);
    if (i % 3 === 1) parcel(P, tx + ux * u - Math.sin(yaw) * v, 0.75 + h, tz + uz * u - Math.cos(yaw) * v, w * 0.7, 0.08 + rand() * 0.08, 0.12, yaw + rand(), k++);
  }
  // A few big ones in front of the table on the grass, and a heap by the chief table's head under the tree.
  for (let i = 0; i < 4; i++) parcel(P, tx + ux * (-1 + i * 0.66) - Math.sin(yaw) * 0.75, 0, tz + uz * (-1 + i * 0.66) - Math.cos(yaw) * 0.75, 0.3 + rand() * 0.15, 0.25 + rand() * 0.2, 0.3, rand() * 3, k++);
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const lx = -1.5 - rand() * 0.9;
    const lz = side * (1.3 + rand() * 0.7);
    parcel(P, lx, i > 7 ? 0.25 : 0, lz, 0.2 + rand() * 0.2, 0.15 + rand() * 0.15, 0.2 + rand() * 0.15, rand() * 3, k++);
  }
  col.push({ x: TREE.x + tx, z: TREE.z + tz, r: 0.9 }, { x: TREE.x + tx + ux * 1.0, z: TREE.z + tz + uz * 1.0, r: 0.6 }, { x: TREE.x + tx - ux * 1.0, z: TREE.z + tz - uz * 1.0, r: 0.6 });
}

/* ---------------- stage 4: Gandalf's fireworks ---------------- */

/** The red rune on a crate side (the futhorc G of Gandalf's mark: two crossing strokes). */
function rune(P, lx, y, lz, yaw, s) {
  for (const a of [0.8, -0.8]) {
    const st = box(0.035 * s, 0.32 * s, 0.006);
    st.rotateZ(a);
    P.add(st, 0xc8201a, M(lx, y, lz, yaw));
  }
}

function crate(P, lx, y, lz, yaw, s = 1) {
  P.add(box(0.5 * s, 0.38 * s, 0.4 * s).translate(0, 0.19 * s, 0), 0xa8865a, M(lx, y, lz, yaw));
  for (const dy of [0.04, 0.34]) P.add(box(0.51 * s, 0.04 * s, 0.41 * s), 0x7a5a3a, M(lx, y + dy * s, lz, yaw));
  // The rune on the long sides.
  for (const sd of [-1, 1]) rune(P, lx - Math.sin(yaw) * sd * 0.205 * s, y + 0.19 * s, lz - Math.cos(yaw) * sd * 0.205 * s, yaw, s);
}

function rocket(P, lx, y, lz, yaw, pitch, len, hex) {
  const g = cyl(0.035, 0.035, len, 6);
  g.translate(0, len / 2, 0);
  P.add(g, hex, M(lx, y, lz, yaw, pitch));
  const tip = new THREE.ConeGeometry(0.045, 0.14, 6);
  tip.translate(0, len + 0.07, 0);
  P.add(tip, 0xe8d8a0, M(lx, y, lz, yaw, pitch));
  const stickG = cyl(0.008, 0.008, 0.9, 3);
  stickG.translate(0.04, -0.45, 0);
  P.add(stickG, 0xc8b088, M(lx, y, lz, yaw, pitch));
}

function buildFireworks(P, col) {
  const { x, z, yaw } = CART;
  const ux = Math.cos(yaw);
  const uz = -Math.sin(yaw);
  const vx = Math.sin(yaw);
  const vz = Math.cos(yaw);
  const at = (u, v) => [x + ux * u + vx * v, z + uz * u + vz * v];
  // The cart: a plank bed on four spoked wheels, the shafts resting on the grass (no horse: the figures are static).
  {
    const [cx, cz] = at(0, 0);
    P.add(box(2.6, 0.1, 1.3), 0x8a6a48, M(cx, 0.78, cz, yaw));
    for (const s of [-1, 1]) P.add(box(2.6, 0.32, 0.06), 0x7a5a3a, M(cx + vx * s * 0.62, 0.98, cz + vz * s * 0.62, yaw));
    for (const e of [-1, 1]) P.add(box(0.06, 0.32, 1.3), 0x7a5a3a, M(cx + ux * e * 1.27, 0.98, cz + uz * e * 1.27, yaw));
    for (const [u, v] of [[-0.85, -0.72], [-0.85, 0.72], [0.85, -0.72], [0.85, 0.72]]) {
      const [wx, wz] = at(u, v);
      const rim = new THREE.TorusGeometry(0.42, 0.04, 5, 16);
      P.add(rim, 0x5a4028, M(wx, 0.46, wz, yaw));
      for (let k = 0; k < 6; k++) {
        const sp = box(0.03, 0.82, 0.03);
        sp.rotateZ((k / 6) * Math.PI);
        P.add(sp, 0x6a5038, M(wx, 0.46, wz, yaw));
      }
      const hub = cyl(0.07, 0.07, 0.12, 8);
      hub.rotateX(Math.PI / 2);
      P.add(hub, 0x3a2a1a, M(wx, 0.46, wz, yaw));
    }
    for (const s of [-1, 1]) {
      const [sx, sz] = at(1.3, s * 0.45);
      const [ex, ez] = at(3.0, s * 0.42);
      stick(P, [sx, 0.75, sz], [ex, 0.05, ez], 0.04, 0x7a5a3a, 5);
    }
    col.push({ x: TREE.x + cx, z: TREE.z + cz, r: 1.3 }, { x: TREE.x + at(1.1, 0)[0], z: TREE.z + at(1.1, 0)[1], r: 0.9 }, { x: TREE.x + at(-1.1, 0)[0], z: TREE.z + at(-1.1, 0)[1], r: 0.9 });
  }
  // Crates with the red rune, stacked on the bed; a bundle of long rockets beside them.
  for (const [u, v, l] of [[-0.8, -0.3, 0], [-0.8, 0.3, 0], [-0.25, -0.3, 0], [-0.25, 0.3, 0], [-0.55, 0, 1], [0.3, -0.3, 0]]) {
    const [px, pz] = at(u, v);
    crate(P, px, 0.83 + l * 0.39, pz, yaw);
  }
  const RC = [0xc83a3a, 0x3a8a3a, 0xd8b030, 0x3a5ab0];
  for (let k = 0; k < 8; k++) {
    const [px, pz] = at(0.55 + (k % 4) * 0.13, 0.2 + Math.floor(k / 4) * 0.13);
    rocket(P, px, 0.85, pz, yaw, -1.35, 1.0, RC[k % 4]);
  }
  // Two more crates on the grass, and three rocket racks to the south, aimed at the sky.
  for (const [u, v] of [[-1.8, 0.9], [-1.6, 1.45]]) {
    const [px, pz] = at(u, v);
    crate(P, px, 0, pz, yaw + 0.3);
  }
  for (let r = 0; r < 3; r++) {
    const lx = 2.5 + r * 3.0;
    const lz = -16.5 - (r % 2) * 0.8;
    for (const s of [-1, 1]) {
      stick(P, [lx + s * 0.6, 0, lz - 0.3], [lx + s * 0.6, 1.3, lz], 0.03, 0x8a6a48, 4);
      stick(P, [lx + s * 0.6, 0, lz + 0.3], [lx + s * 0.6, 1.3, lz], 0.03, 0x8a6a48, 4);
    }
    P.add(box(1.3, 0.05, 0.05), 0x8a6a48, M(lx, 1.28, lz));
    for (let k = 0; k < 4; k++) rocket(P, lx - 0.45 + k * 0.3, 0.2, lz + 0.25, 0, -0.25, 1.05, RC[(k + r) % 4]);
    col.push({ x: TREE.x + lx, z: TREE.z + lz, r: 0.8 });
  }
}

/* ---------------- stage 5: the tables laid, Bilbo's chair, more lanterns ---------------- */

function buildFeast(P, G, col) {
  const rand = rng(3905);
  for (const [lx, lz, len] of TABLES) {
    const n = Math.floor((len - 0.4) / 0.6);
    for (let k = 0; k < n; k++) {
      const u = lx - (len - 0.4) / 2 + 0.3 + k * 0.6;
      for (const s of [-1, 1]) {
        P.add(cyl(0.12, 0.1, 0.02, 10), 0xf0ece0, M(u, TABLE_H + 0.04, lz + s * 0.24));
        if ((k + (s > 0 ? 1 : 0)) % 2) P.add(cyl(0.04, 0.035, 0.1, 7), 0x9a8a6a, M(u + 0.13, TABLE_H + 0.08, lz + s * 0.18));
      }
    }
    // Dishes down the middle: pies, loaves, a ham, a round cheese, bowls of apples.
    for (let u = lx - len / 2 + 0.6; u < lx + len / 2 - 0.4; u += 0.7) {
      const kind = Math.floor(rand() * 5);
      P.add(cyl(0.17, 0.15, 0.02, 12), 0xd8d0c0, M(u, TABLE_H + 0.04, lz));
      if (kind === 0) P.add(cyl(0.13, 0.14, 0.07, 12), 0xc8904a, M(u, TABLE_H + 0.085, lz));
      else if (kind === 1) {
        const loaf = new THREE.SphereGeometry(0.1, 8, 5);
        loaf.scale(1.5, 0.75, 1);
        P.add(loaf, 0xc08a48, M(u, TABLE_H + 0.09, lz, rand()));
      } else if (kind === 2) {
        const ham = new THREE.SphereGeometry(0.11, 9, 6);
        ham.scale(1.3, 0.8, 0.9);
        P.add(ham, 0xb85a4a, M(u, TABLE_H + 0.1, lz, rand()));
      } else if (kind === 3) P.add(cyl(0.12, 0.12, 0.09, 12), 0xe8c860, M(u, TABLE_H + 0.095, lz));
      else for (let a = 0; a < 5; a++) P.add(new THREE.SphereGeometry(0.04, 6, 4), a % 2 ? 0xb83a2a : 0x8ab040, M(u + Math.cos(a * 1.3) * 0.07, TABLE_H + 0.09, lz + Math.sin(a * 1.3) * 0.07));
    }
  }
  // Bilbo's chair at the head of the chief table, its back to the tree.
  const { x, z, seat } = CHAIR;
  P.add(box(0.46, 0.05, 0.46), 0x8a5a34, M(x, seat, z));
  for (const [dx, dz] of [[-0.19, -0.19], [-0.19, 0.19], [0.19, -0.19], [0.19, 0.19]]) P.add(box(0.05, seat, 0.05).translate(0, seat / 2, 0), 0x6a4024, M(x + dx, 0, z + dz));
  P.add(box(0.05, 0.62, 0.46), 0x8a5a34, M(x + 0.21, seat + 0.33, z));
  P.add(box(0.06, 0.06, 0.5), 0x6a4024, M(x + 0.21, seat + 0.66, z));
  P.add(box(0.4, 0.04, 0.4), 0xb83a2a, M(x - 0.01, seat + 0.04, z)); // a red cushion
  col.push({ x: TREE.x + x, z: TREE.z + z, r: 0.35 });
  // A string of lanterns round the canvas edge.
  for (let k = 0; k < 6; k++) {
    const a0 = postAngle(k);
    const a1 = postAngle(k + 1);
    for (let j = 1; j <= 3; j++) {
      const u = j / 4;
      const lx = (Math.cos(a0) * (1 - u) + Math.cos(a1) * u) * (CANVAS.outerR - 0.2);
      const lz = (Math.sin(a0) * (1 - u) + Math.sin(a1) * u) * (CANVAS.outerR - 0.2);
      lantern(P, G, lx, CANVAS.outerY - 0.75 - Math.sin(u * Math.PI) * 0.18, lz, 0.45);
    }
  }
}

/**
 * The geometry for the first `stages` stages (0 … 5). Returns { main, glow, colliders }: `main` for the vertex-coloured
 * double-sided Lambert mesh, `glow` for the night-glow lantern material (null when empty), colliders as world circles.
 */
export function buildStages(stages) {
  const P = new Parts();
  const G = new Parts();
  const col = [];
  buildSign(P, col);
  if (stages >= 1) {
    buildPavilion(P, G, col);
    buildGate(P, col);
  }
  if (stages >= 2) {
    for (const [lx, lz, len] of TABLES) trestle(P, lx, lz, len, col);
    buildKitchen(P, G, col);
  }
  if (stages >= 3) buildGifts(P, col);
  if (stages >= 4) buildFireworks(P, col);
  if (stages >= 5) buildFeast(P, G, col);
  return { main: P.merge(), glow: G.merge(), colliders: col };
}

/* ---------------- the party scene's figures ---------------- */

/** Bilbo for his speech (The Lord of the Rings does not describe his clothes: a well-to-do hobbit's coat and a golden waistcoat). */
export function bilboGeometry() {
  return hobbitGeometry({ coat: 0x5a3a24, waistcoat: 0xd0a040, breeches: 0x4a3a28, hair: 0x6a4a2a, wide: 1.02 });
}

/** Where the guests stand (local x, z) along the three tables in front of the chief table's head, facing Bilbo. */
function guestSpots() {
  const out = [];
  for (const u of [-2.9, -4.1, -5.3, -6.5]) for (const s of [-1, 1]) out.push([u, s * 1.05]);
  for (const sz of [-1, 1]) for (const u of [-3.0, -4.3, -5.6]) for (const s of [-1, 1]) out.push([u, sz * 3.0 + s * 1.05]);
  return out;
}

/**
 * The guests (the feast crowd's hobbits, home-events/figures.js FEAST_HOBBITS, in turn) and Gandalf beside the tree, as
 * one world-space geometry (one draw call; shown only during the scene).
 */
export function crowdGeometry() {
  const rand = rng(3907);
  const geos = [];
  const bx = CHAIR.x;
  const bz = CHAIR.z;
  guestSpots().forEach(([lx, lz], k) => {
    const g = hobbitGeometry(FEAST_HOBBITS[k % FEAST_HOBBITS.length]);
    const yaw = Math.atan2(bx - lx, bz - lz) + (rand() - 0.5) * 0.3;
    const s = 0.94 + rand() * 0.12;
    g.applyMatrix4(M(lx + (rand() - 0.5) * 0.15, 0, lz, yaw, 0, 0, s));
    geos.push(g);
  });
  const gd = gandalfGeometry();
  gd.applyMatrix4(M(-1.2, 0, -2.4, -Math.PI / 2 - 0.5));
  geos.push(gd);
  const g = mergeGeometries(geos);
  for (const x of geos) x.dispose();
  g.computeBoundingSphere();
  return g;
}

/** World position of a local point (for the scene's holds and looks). */
export function world(lx, y, lz, out = new THREE.Vector3()) {
  return out.set(TREE.x + lx, y, TREE.z + lz);
}

