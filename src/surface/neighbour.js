/* ==== surface/neighbour.js — the neighbour hobbit at Bag End's front hedge (TERV 0.11/13: "a szomszéd hobbitok
   cserélnek veled"): a plain hobbit of the home-events figure kind (home-events/figures.js hobbitGeometry; no invented
   name, he is "a szomszéd hobbit"), standing outside the hedge just west of the gate, facing the pit, with a basket.
   One mesh, built once; a collider circle in SURFACE_COLLIDERS. src/shire turns him towards a player nearby. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hobbitGeometry } from '../home-events/figures.js';
import { SURFACE_COLLIDERS } from '../props.js';

/** Where he stands (world, feet on the lawn) and faces (yaw π faces −z, the pit). Bag End's gate is at about (−8, 17.5). */
export const NEIGHBOUR_POS = { x: -10.4, z: 16.7, yaw: Math.PI };

/** A wicker basket on the lawn by his feet (painted, local to the figure). */
function basketGeo() {
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  };
  const parts = [];
  const body = new THREE.CylinderGeometry(0.15, 0.12, 0.16, 10, 1, true);
  body.translate(0.32, 0.08, 0.12);
  parts.push(paint(body, 0xb08a50));
  const bottom = new THREE.CircleGeometry(0.12, 10);
  bottom.rotateX(-Math.PI / 2);
  bottom.translate(0.32, 0.01, 0.12);
  parts.push(paint(bottom, 0x8a6a3a));
  const handle = new THREE.TorusGeometry(0.13, 0.012, 4, 12, Math.PI);
  handle.translate(0.32, 0.16, 0.12);
  parts.push(paint(handle, 0x9a7a44));
  // Apples and a pie in it.
  for (const [x, z, hex] of [[0.27, 0.08, 0xc83a2a], [0.36, 0.15, 0xd8a030], [0.3, 0.17, 0xc83a2a]]) {
    const a = new THREE.SphereGeometry(0.04, 7, 5);
    a.translate(x, 0.15, z);
    parts.push(paint(a, hex));
  }
  const pie = new THREE.CylinderGeometry(0.07, 0.06, 0.03, 10);
  pie.translate(0.37, 0.16, 0.06);
  parts.push(paint(pie, 0xd09a50));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/**
 * Builds the neighbour into `parent`. Returns { mesh, pos } (pos: THREE.Vector3 of his feet).
 * @param {THREE.Object3D} parent the surface root
 * @param {THREE.Material} mat a vertex-coloured Lambert material
 */
export function buildNeighbour(parent, mat) {
  const fig = hobbitGeometry({ coat: 0x5a7a3a, waistcoat: 0xd8b040, breeches: 0x6a5030, hair: 0x6a4626, wide: 1.1 });
  const g = mergeGeometries([fig.index ? fig.toNonIndexed() : fig, basketGeo()]);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'shire-neighbour';
  mesh.position.set(NEIGHBOUR_POS.x, 0, NEIGHBOUR_POS.z);
  mesh.rotation.y = NEIGHBOUR_POS.yaw;
  parent.add(mesh);
  SURFACE_COLLIDERS.push({ x: NEIGHBOUR_POS.x, z: NEIGHBOUR_POS.z, r: 0.35 });
  return { mesh, pos: new THREE.Vector3(NEIGHBOUR_POS.x, 0, NEIGHBOUR_POS.z) };
}
