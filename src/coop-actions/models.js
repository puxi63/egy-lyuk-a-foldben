/* ==== coop-actions/models.js — the meshes of Beorn's rule (NOTES-23-coop-actions), built once and hidden until needed:
   the heavy dwarf chest (iron-bound, angular dwarf work with a gold band; a lid that opens), and the dwarves' hoist
   (a plank platform on iron straps, a timber gantry with the wheel over the shaft, two ropes, a rail round the hole).
   Every part is merged per mesh with vertex colours (one Lambert material shared by all: one program, few draw calls). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, colorize, cyl, rgb, torus } from '../underground/kit.js';

// Vertex colours are used as linear values (kit.js rgb): kept dark, as the set pieces' own.
const WOOD = 0x3a2414;
const WOOD_D = 0x24160a;
const IRON = 0x1e1d1c;
const IRON_L = 0x3c3a38;
const GOLD = 0x9a7020;
const ROPE = 0x6a5838;

/** Collects coloured parts and merges them into one geometry. */
class Parts {
  constructor() {
    this.list = [];
  }

  /** Adds `g` coloured `hex`, moved to (x, y, z) and turned (rx, ry, rz). */
  add(g, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, jitter = 0.07) {
    const n = g.index ? g.toNonIndexed() : g;
    if (rx || ry || rz) n.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    n.translate(x, y, z);
    colorize(n, rgb(hex), jitter);
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k);
    this.list.push(n);
    return this;
  }

  geometry() {
    const g = mergeGeometries(this.list, false);
    g.computeBoundingSphere();
    return g;
  }
}

/** The material every Beorn's-rule mesh shares (vertex colours, lit by the lamps like the set pieces). */
export function sharedMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/**
 * The heavy chest: local origin on the floor at its middle; the handles (iron rings) on the short ends, along local x,
 * where the two carriers hold it. Returns { group, lid, glint }: `lid` pivots at the back edge (rotation.x opens it),
 * `glint` is the gold heaped inside (shown when opened).
 */
export function buildChest(mat) {
  const W = 0.96;
  const H = 0.52;
  const D = 0.62;
  const body = new Parts();
  body.add(box(W, H, D), WOOD, 0, H / 2, 0);
  // Iron straps round the body, corner plates, a stepped plinth (angular dwarf work).
  for (const x of [-W * 0.3, W * 0.3]) body.add(box(0.07, H + 0.02, D + 0.03), IRON, x, H / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.add(box(0.1, H + 0.03, 0.1), IRON_L, sx * (W / 2 - 0.03), H / 2, sz * (D / 2 - 0.03));
  body.add(box(W + 0.06, 0.06, D + 0.06), IRON, 0, 0.03, 0);
  // A gold band with a chevron (a generic dwarf pattern, no inscription) along the front.
  body.add(box(W * 0.5, 0.05, 0.02), GOLD, 0, H * 0.62, D / 2 + 0.02, 0, 0, 0, 0.04);
  for (const s of [-1, 1]) body.add(box(0.14, 0.03, 0.02), GOLD, s * 0.06, H * 0.44, D / 2 + 0.02, 0, 0, s * 0.7, 0.04);
  // The lock plate.
  body.add(box(0.12, 0.14, 0.03), IRON_L, 0, H - 0.08, D / 2 + 0.025);
  // The handles: a bracket and a ring on each short end (where the carriers grip).
  for (const s of [-1, 1]) {
    body.add(box(0.03, 0.12, 0.16), IRON, s * (W / 2 + 0.02), H * 0.7, 0);
    body.add(torus(0.075, 0.016, 5, 12), IRON_L, s * (W / 2 + 0.05), H * 0.6, 0, 0, Math.PI / 2, 0);
  }
  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(body.geometry(), mat);
  group.add(bodyMesh);
  // The lid: chamfered (a flat top and two sloped faces), hinged at the back.
  const lidP = new Parts();
  lidP.add(box(W + 0.02, 0.09, D + 0.02), WOOD_D, 0, 0.045, D / 2);
  lidP.add(box(W - 0.1, 0.07, D * 0.55), WOOD, 0, 0.12, D / 2);
  for (const x of [-W * 0.3, W * 0.3]) lidP.add(box(0.075, 0.17, D + 0.04), IRON, x, 0.08, D / 2);
  lidP.add(box(W * 0.5, 0.03, 0.02), GOLD, 0, 0.06, D + 0.02, 0, 0, 0, 0.04);
  const lid = new THREE.Mesh(lidP.geometry(), mat);
  lid.position.set(0, H, -D / 2);
  group.add(lid);
  // The gold inside: a heap of coins and a cup (hidden until opened). Unlit, so it glows a little in the dark; the colours
  // are linear values, kept low so the output reads as gold, not white.
  const gl = new Parts();
  gl.add(box(W - 0.12, 0.06, D - 0.12), 0x7a5208, 0, H - 0.06, 0, 0, 0, 0, 0.12);
  for (let i = 0; i < 9; i++) gl.add(cyl(0.035, 0.035, 0.008, 8), 0xa87812, -0.32 + (i % 5) * 0.16, H + 0.0 + (i % 2) * 0.01, -0.12 + Math.floor(i / 5) * 0.2, 0.3 * i, 0, 0.2);
  gl.add(cyl(0.05, 0.03, 0.12, 10), 0x9a6c10, 0.22, H + 0.04, 0.05);
  const glint = new THREE.Mesh(gl.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  glint.visible = false;
  group.add(glint);
  group.visible = false;
  return { group, lid, glint, size: { W, H, D } };
}

/**
 * The hoist. `top` / `bottom` are the floors; returns { platform, gantry, ropes: [mesh, mesh], wheelY }. The platform's
 * origin is its walking surface (move it by y); the ropes are unit-length cylinders scaled per frame (from the wheel down
 * to the platform's pulley block). The rail stands round the top hole on three sides (the open side faces west, −x,
 * towards the forges' door).
 */
export function buildHoist(mat, H) {
  // ---- the platform: planks on two iron straps, a low frame, the pulley block in the middle ----
  const pl = new Parts();
  const R = H.plat;
  for (let i = -3; i <= 3; i++) {
    const w = 2 * Math.sqrt(Math.max(0.05, R * R - (i * 0.22) ** 2));
    pl.add(box(w, 0.06, 0.2), i % 2 ? WOOD : WOOD_D, 0, -0.03, i * 0.22);
  }
  for (const x of [-0.42, 0.42]) pl.add(box(0.06, 0.05, 2 * R * 0.95), IRON, x, -0.075, 0);
  pl.add(torus(R - 0.03, 0.03, 4, 18), IRON, 0, 0.01, 0, Math.PI / 2, 0, 0);
  // The block the ropes run to: a small iron frame with a hook, at chest height on a post.
  pl.add(box(0.07, 1.05, 0.07), WOOD_D, 0, 0.52, -R + 0.12);
  pl.add(box(0.26, 0.12, 0.1), IRON, 0, 1.08, -R + 0.12);
  const platform = new THREE.Group();
  platform.add(new THREE.Mesh(pl.geometry(), mat));
  platform.position.set(H.x, H.bottom, H.z);
  // ---- the gantry over the top: two posts, a beam, the wheel; the rail round the hole ----
  const gp = new Parts();
  const post = 2.9;
  for (const s of [-1, 1]) {
    gp.add(box(0.2, post, 0.2), WOOD, 0, post / 2, s * 1.25);
    // Braces against the floor.
    gp.add(box(0.1, 1.0, 0.1), WOOD_D, 0, 0.45, s * 1.55, s * -0.6, 0, 0);
  }
  gp.add(box(0.24, 0.24, 2.9), WOOD, 0, post + 0.12, 0);
  gp.add(torus(0.28, 0.05, 6, 16), IRON_L, 0, post - 0.25, -R + 0.12, 0, Math.PI / 2, 0);
  gp.add(cyl(0.05, 0.05, 0.3, 8), IRON, 0, post - 0.25, -R + 0.12, 0, 0, Math.PI / 2);
  gp.add(box(0.06, 0.25, 0.06), IRON, 0, post - 0.05, -R + 0.12);
  // The rail: posts at the rim and two bars on three sides (open towards −x).
  const rr = H.rail - 0.06;
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 + 0.35 + k * ((Math.PI * 2 - 0.7 - Math.PI / 2) / 6);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (x < -0.45) continue;
    gp.add(box(0.08, 0.95, 0.08), WOOD_D, x, 0.47, z);
  }
  const arc = Math.PI * 1.25;
  for (const y of [0.55, 0.92]) gp.add(torus(rr, 0.035, 4, 20, arc), WOOD, 0, y, 0, Math.PI / 2, 0, -arc / 2);
  // The two hand grips at the top handles (rope ends with wooden toggles).
  for (const s of [-1, 1]) gp.add(cyl(0.03, 0.03, 0.3, 6), WOOD_D, s * (H.handle - 0.25), 1.05, 0, 0, 0, Math.PI / 2);
  const gantry = new THREE.Mesh(gp.geometry(), mat);
  gantry.position.set(H.x, H.top, H.z);
  // ---- the ropes: unit cylinders scaled each frame ----
  const ropeGeo = cyl(0.022, 0.022, 1, 5);
  ropeGeo.translate(0, -0.5, 0);
  colorize(ropeGeo, rgb(ROPE), 0.05);
  const ropes = [-1, 1].map(() => {
    const m = new THREE.Mesh(ropeGeo, mat);
    m.frustumCulled = false;
    return m;
  });
  return { platform, gantry, ropes, wheelY: H.top + post - 0.25, ropeZ: H.z - R + 0.12 };
}

/** Dori's lantern (held up in his raised hand; a glowing glass, no light of its own: no new light in the scene). */
export function buildLantern(mat) {
  const p = new Parts();
  p.add(box(0.12, 0.02, 0.12), IRON, 0, 0, 0);
  p.add(box(0.12, 0.02, 0.12), IRON, 0, 0.2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add(box(0.015, 0.2, 0.015), IRON, sx * 0.055, 0.1, sz * 0.055);
  p.add(torus(0.04, 0.008, 4, 10), IRON, 0, 0.26, 0, 0, 0, 0);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(p.geometry(), mat));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.17, 0.09), new THREE.MeshBasicMaterial({ color: 0xffd890 }));
  glass.position.y = 0.1;
  g.add(glass);
  g.visible = false;
  return g;
}
