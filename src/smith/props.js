/* ==== smith/props.js — the travelling dwarf smith's open forge on the surface (TODO item 30, NOTES-40-smith).
   The Hobbit ch. 1: Thorin tells that after the dwarves lost the Mountain they earned their living up and down the lands,
   often by smith-work. A plain dwarf smith (no name, no invented inscription) has set up a lean-to forge on the meadow
   east of the Green Dragon's counter, between the main lane and the open grass (nothing else stands there: no collider,
   tree, bed or lane within 5 m; the Party Field is on the far side of the pit).
   - one geometry for the vertex-coloured Lambert mesh (the shed, the stone hearth with its hood and chimney, the
     bellows, the anvil on a stump, the quench tub, the tool rack, finished picks, the dwarf with apron and hammer);
   - one for the glowing parts (the fire bed, the hot iron on the anvil, the hearth's mouth) on the surface's night-glow
     material (unlit, so they glow by day and night);
   - collider circles for SURFACE_COLLIDERS; the spot where the customer stands (`FRONT`) and the anvil (`ANVIL`).
   Everything is built in a local frame (the customer side is +z) and turned once by FORGE.yaw. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dwarfGeometry } from '../home-events/figures.js';

/** World spot of the forge's centre and its turn: yaw −π/2 turns the local customer side (+z) to face west (−x), the lane. */
export const FORGE = { x: 20.5, z: 15.5, yaw: -Math.PI / 2 };

const COS = Math.cos(FORGE.yaw);
const SIN = Math.sin(FORGE.yaw);
/** Local (x, z) → world { x, z }. */
export function world(lx, lz) {
  return { x: FORGE.x + lx * COS + lz * SIN, z: FORGE.z - lx * SIN + lz * COS };
}

/** The anvil (local) — the menu opens within reach of it; the customer stands in front (FRONT, local). */
const ANVIL_L = { x: 0.35, z: 0.25, top: 0.86 };
export const ANVIL = { ...world(ANVIL_L.x, ANVIL_L.z), y: ANVIL_L.top };
export const FRONT = world(0.35, 2.1);
/** The dwarf (local): behind the anvil, facing the customer. */
const DWARF_L = { x: 0.35, z: -0.5 };

/** The smith's colours: a sooty brown hood, a black beard (no company member's colours). */
const SMITH = { hood: 0x4a3a2c, beard: 0x1e1a16, wide: 1.12 };

function painted(geo, hex) {
  const g = geo;
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

class Parts {
  constructor() {
    this.list = [];
  }

  /** Adds a geometry placed at local (x, y, z) with a yaw / pitch / roll. */
  add(geo, hex, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    if (rx || ry || rz) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
    geo.translate(x, y, z);
    this.list.push(painted(geo, hex));
    return geo;
  }

  /** Merges everything and turns it into the world frame. */
  merge() {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list);
    for (const p of this.list) p.dispose();
    this.list = [];
    g.rotateY(FORGE.yaw);
    g.translate(FORGE.x, 0, FORGE.z);
    g.computeBoundingSphere();
    return g;
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);

/** A stick from a to b (local [x, y, z]) of radius r. */
function stick(P, a, b, r, hex, n = 5) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = cyl(r, r, len, n);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  P.add(g, hex, A.x, A.y, A.z);
}

const WOOD = 0x6a4a2c;
const WOOD_DARK = 0x4a321e;
const STONE = 0x8a8478;
const STONE_DARK = 0x5e5850;
const IRON = 0x3c3c42;
const IRON_LIGHT = 0x6a6a72;
const SOOT = 0x2a2420;

/** A dwarf pick leaning on something (local base point, lean angle). */
function pick(P, x, z, ry, lean) {
  const h = 0.85;
  const g = cyl(0.02, 0.025, h, 6);
  g.translate(0, h / 2, 0);
  P.add(g, WOOD, x, 0, z, ry, 0, lean);
  const head = box(0.42, 0.05, 0.05);
  head.translate(0, h - 0.02, 0);
  P.add(head, IRON_LIGHT, x, 0, z, ry, 0, lean);
}

/**
 * Builds the forge. Returns { main, glow, colliders } (geometries in world space; colliders { x, z, r } in world xz).
 */
export function buildForge() {
  const P = new Parts();
  const G = new Parts();

  // The floor: packed earth with a few flagstones under the shed.
  P.add(box(4.6, 0.04, 3.2), 0x5a4a36, 0, 0.02, -0.2);
  for (const [x, z, s] of [[-1.1, 0.4, 0.5], [0.9, 0.9, 0.45], [1.6, -0.1, 0.4], [-0.2, 1.0, 0.42], [-1.8, 0.9, 0.38]]) P.add(box(s, 0.03, s * 0.8), 0x7a7266, x, 0.05, z, x * 1.3);

  // The lean-to: four posts (taller at the back), two beams, a plank roof sloping to the front.
  const posts = [[-2.05, -1.55, 2.55], [2.05, -1.55, 2.55], [-2.05, 1.05, 2.15], [2.05, 1.05, 2.15]];
  for (const [x, z, h] of posts) P.add(box(0.14, h, 0.14), WOOD_DARK, x, h / 2, z);
  P.add(box(4.3, 0.14, 0.16), WOOD_DARK, 0, 2.5, -1.55);
  P.add(box(4.3, 0.14, 0.16), WOOD_DARK, 0, 2.1, 1.05);
  const slope = Math.atan2(0.4, 2.6);
  for (let k = 0; k < 9; k++) {
    const x = -2.2 + k * 0.55;
    P.add(box(0.53, 0.05, 3.25), k % 2 ? 0x7a5634 : 0x6e4c2e, x + 0.27, 2.36, -0.25, 0, slope);
  }
  // The back wall: boards behind the anvil and the rack (the hearth stands against it).
  P.add(box(4.1, 1.7, 0.06), 0x5e4228, 0, 0.85, -1.62);

  // The stone hearth: a raised block with a dark mouth, the fire bed on top, a hood and a chimney through the roof.
  const H = { x: -1.15, z: -0.85 };
  P.add(box(1.35, 0.85, 1.05), STONE, H.x, 0.425, H.z);
  P.add(box(1.45, 0.08, 1.15), STONE_DARK, H.x, 0.88, H.z);
  for (const [dx, dz] of [[-0.55, 0.42], [0.55, 0.42], [-0.55, -0.42], [0.55, -0.42]]) P.add(box(0.2, 0.18, 0.2), STONE_DARK, H.x + dx, 1.0, H.z + dz);
  G.add(box(0.9, 0.07, 0.62), 0xf09030, H.x, 0.95, H.z); // the coals
  G.add(box(0.4, 0.05, 0.3), 0xffd060, H.x + 0.05, 0.99, H.z + 0.05); // the hottest heart
  G.add(box(0.5, 0.26, 0.02), 0xc85a1a, H.x, 0.38, H.z + 0.53); // the ash pit's glow
  const hood = new THREE.CylinderGeometry(0.28, 0.82, 0.75, 4, 1, true);
  hood.rotateY(Math.PI / 4);
  P.add(hood, SOOT, H.x, 1.62, H.z);
  P.add(box(0.46, 1.6, 0.46), STONE_DARK, H.x, 2.75, H.z - 0.05);
  P.add(box(0.56, 0.1, 0.56), STONE, H.x, 3.58, H.z - 0.05);

  // The bellows: two boards with a leather fold, a nozzle into the hearth, a pole to work them.
  const B = { x: -2.0, z: -0.25 };
  P.add(box(0.36, 0.05, 0.75), WOOD, B.x, 0.55, B.z, 0, 0.12);
  P.add(box(0.36, 0.05, 0.75), WOOD, B.x, 0.78, B.z, 0, -0.12);
  P.add(box(0.32, 0.2, 0.6), 0x5a3a22, B.x, 0.66, B.z);
  stick(P, [B.x, 0.66, B.z - 0.4], [H.x - 0.55, 0.8, H.z + 0.1], 0.035, IRON);
  P.add(box(0.12, 0.55, 0.12), WOOD_DARK, B.x, 0.27, B.z);
  stick(P, [B.x, 0.8, B.z + 0.35], [B.x, 1.35, B.z + 0.55], 0.025, WOOD);

  // The anvil on its stump.
  const A = ANVIL_L;
  P.add(cyl(0.27, 0.31, 0.5, 10), 0x7a5a3a, A.x, 0.25, A.z);
  P.add(cyl(0.25, 0.25, 0.02, 10), 0x9a7a50, A.x, 0.51, A.z);
  P.add(box(0.34, 0.1, 0.24), IRON, A.x, 0.57, A.z);
  P.add(box(0.18, 0.14, 0.15), IRON, A.x, 0.69, A.z);
  P.add(box(0.46, 0.1, 0.2), IRON_LIGHT, A.x - 0.03, 0.81, A.z);
  const horn = new THREE.ConeGeometry(0.075, 0.26, 8);
  horn.rotateZ(-Math.PI / 2);
  P.add(horn, IRON_LIGHT, A.x + 0.33, 0.81, A.z);
  G.add(box(0.2, 0.03, 0.05), 0xff8a28, A.x - 0.05, A.top + 0.015, A.z + 0.02); // the iron being worked
  // Tongs lying on the anvil, a second hammer by the stump.
  stick(P, [A.x - 0.3, 0.875, A.z + 0.05], [A.x + 0.05, 0.875, A.z + 0.03], 0.012, IRON);
  stick(P, [A.x - 0.3, 0.875, A.z + 0.0], [A.x + 0.05, 0.875, A.z + 0.01], 0.012, IRON);
  stick(P, [A.x + 0.3, 0.02, A.z + 0.3], [A.x + 0.62, 0.02, A.z + 0.42], 0.018, WOOD);
  P.add(box(0.12, 0.07, 0.07), IRON, A.x + 0.66, 0.04, A.z + 0.43, -0.35);

  // The quench tub (a half barrel with dark water).
  const T = { x: 1.45, z: -0.7 };
  P.add(cyl(0.32, 0.28, 0.52, 12), 0x6a4a2a, T.x, 0.26, T.z);
  for (const y of [0.1, 0.42]) P.add(cyl(0.33, 0.33, 0.04, 12), IRON, T.x, y, T.z);
  P.add(cyl(0.29, 0.29, 0.01, 12), 0x1e2a30, T.x, 0.47, T.z);

  // The tool rack on the back wall: a rail with hammers, tongs and a file.
  P.add(box(1.5, 0.08, 0.08), WOOD_DARK, 0.95, 1.45, -1.55);
  for (let k = 0; k < 6; k++) {
    const x = 0.35 + k * 0.24;
    if (k % 2 === 0) {
      stick(P, [x, 1.43, -1.52], [x, 0.98, -1.52], 0.014, WOOD);
      P.add(box(0.13, 0.06, 0.06), IRON, x, 0.98, -1.52);
    } else {
      stick(P, [x - 0.02, 1.43, -1.52], [x - 0.04, 0.95, -1.52], 0.009, IRON);
      stick(P, [x + 0.02, 1.43, -1.52], [x + 0.04, 0.95, -1.52], 0.009, IRON);
    }
  }
  // Finished picks leaning on the wall at the open side, a heap of charcoal by the hearth.
  pick(P, 1.95, -1.35, 0.2, 0.18);
  pick(P, 1.75, -1.4, -0.1, 0.22);
  for (let k = 0; k < 7; k++) P.add(new THREE.SphereGeometry(0.1 + (k % 3) * 0.02, 6, 4), 0x1a1614, -1.75 + (k % 4) * 0.12, 0.05 + Math.floor(k / 4) * 0.08, -1.3 + (k % 3) * 0.08);

  // The smith: a plain dwarf behind the anvil, facing the customer, in a leather apron with a hammer in his right hand.
  const fig = dwarfGeometry(SMITH); // (already painted: added as it is)
  fig.translate(DWARF_L.x, 0, DWARF_L.z);
  P.list.push(fig);
  P.add(box(0.34, 0.5, 0.03), 0x5a3a20, DWARF_L.x, 0.4, DWARF_L.z + 0.23, 0, -0.18);
  P.add(box(0.36, 0.035, 0.03), 0x3a2414, DWARF_L.x, 0.62, DWARF_L.z + 0.2);
  // The hammer in his right hand (his right is −x when facing +z), resting on his shoulder.
  stick(P, [DWARF_L.x - 0.26, 0.55, DWARF_L.z + 0.08], [DWARF_L.x - 0.3, 0.95, DWARF_L.z - 0.05], 0.016, WOOD);
  P.add(box(0.15, 0.08, 0.08), IRON, DWARF_L.x - 0.3, 0.97, DWARF_L.z - 0.06, 0, 0, 0.1);

  const colliders = [
    [H.x, H.z, 0.78], [B.x, B.z, 0.42], [A.x, A.z, 0.36], [DWARF_L.x, DWARF_L.z, 0.32], [T.x, T.z, 0.36],
    ...posts.map(([x, z]) => [x, z, 0.14]), [-0.3, -1.6, 0.2], [0.95, -1.6, 0.2], [1.75, -1.4, 0.25],
  ].map(([x, z, r]) => ({ ...world(x, z), r }));
  return { main: P.merge(), glow: G.merge(), colliders };
}
