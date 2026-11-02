/* ==== laketown-events/floaters.js — loose barrels and crates drifting down layer 7's currents (book ch. 9–10: the
   empty barrels floated down from the Elvenking's halls to Lake-town; the raft-men's goods): props only, they bob and
   turn slowly with the flow and start again at the head of their channel. Cheap: one instanced mesh for the barrels and
   one for the crates (vertex colours, the goblin weapons' material settings). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pt } from './sites.js';

const MAX = 24; // instances per kind
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3(1, 1, 1);

function painted(geo, hex, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 + jitter * ((((i / 3) | 0) % 7) / 7 - 0.5);
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A closed wine barrel lying on its side (bulging staves, iron hoops, both heads). Axis along x. */
function barrelGeometry() {
  const parts = [];
  const H = 0.9;
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const y = -H / 2 + (i / 8) * H;
    prof.push(new THREE.Vector2(0.3 * (1 + 0.16 * (1 - (2 * y / H) ** 2)), y));
  }
  const body = new THREE.LatheGeometry(prof, 16);
  parts.push(painted(body, 0x4e321c, 0.25));
  for (const y of [-0.38, -0.24, 0.24, 0.38]) {
    const r = 0.3 * (1 + 0.16 * (1 - (2 * y / H) ** 2)) + 0.01;
    const hoop = new THREE.CylinderGeometry(r, r, 0.035, 16, 1, true);
    hoop.translate(0, y, 0);
    parts.push(painted(hoop, 0x2a2826));
  }
  for (const s of [-1, 1]) {
    const head = new THREE.CircleGeometry(0.3, 14);
    head.rotateX(s * Math.PI / 2 * -1);
    head.translate(0, (s * H) / 2, 0);
    parts.push(painted(head, 0x3e2814, 0.2));
  }
  const g = mergeGeometries(parts);
  g.rotateZ(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** A plank crate with corner battens. */
function crateGeometry() {
  const parts = [];
  parts.push(painted(new THREE.BoxGeometry(0.62, 0.48, 0.5), 0x6a5032, 0.3));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const b = new THREE.BoxGeometry(0.06, 0.5, 0.06);
    b.translate(x * 0.3, 0, z * 0.24);
    parts.push(painted(b, 0x3e2c1a));
  }
  for (const y of [-0.23, 0.23]) {
    const b = new THREE.BoxGeometry(0.64, 0.05, 0.52);
    b.translate(0, y, 0);
    parts.push(painted(b, 0x4a3420, 0.2));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** Arc-length table of a polyline. */
function arcTable(points) {
  const P = points.map(pt);
  const s = [0];
  for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y, P[i].z - P[i - 1].z));
  return { P, s, len: s[s.length - 1] };
}

function along(tab, d, out) {
  const { P, s } = tab;
  let i = 1;
  while (i < s.length - 1 && s[i] < d) i++;
  const a = P[i - 1];
  const b = P[i];
  const t = Math.max(0, Math.min(1, (d - s[i - 1]) / Math.max(1e-6, s[i] - s[i - 1])));
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.dx = (b.x - a.x) / Math.max(1e-6, s[i] - s[i - 1]);
  out.dz = (b.z - a.z) / Math.max(1e-6, s[i] - s[i - 1]);
  return out;
}

export class Floaters {
  constructor(events) {
    this.ev = events;
    this.game = events.game;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.25 });
    this.barrels = new THREE.InstancedMesh(barrelGeometry(), this.mat, MAX);
    this.crates = new THREE.InstancedMesh(crateGeometry(), this.mat, MAX);
    for (const m of [this.barrels, this.crates]) {
      m.name = m === this.barrels ? 'lt-floating-barrels' : 'lt-floating-crates';
      m.count = 0;
      m.frustumCulled = false;
      this.game.scene.add(m);
    }
    this.items = [];
    this.forVersion = -1;
    this.t = 0;
    this.where = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
  }

  /** A warm-up instance (game.js compiles the instanced program at start): shown far below for the first compile. */
  warmUp() {
    tmpM.makeTranslation(0, -1000, 0);
    this.barrels.setMatrixAt(0, tmpM);
    this.crates.setMatrixAt(0, tmpM);
    this.barrels.count = 1;
    this.crates.count = 1;
    this.barrels.instanceMatrix.needsUpdate = true;
    this.crates.instanceMatrix.needsUpdate = true;
  }

  /** Lays the floating props out along the currents (when the provider changes). */
  build(sites) {
    if (this.forVersion === sites.version) return;
    this.forVersion = sites.version;
    this.items = [];
    let nb = 0;
    let nc = 0;
    for (const c of sites.currents) {
      if (!c.points || c.points.length < 2) continue;
      const tab = arcTable(c.points);
      if (tab.len < 2) continue;
      // About one prop per 7 m of channel, alternately barrel and crate.
      const n = Math.max(1, Math.min(6, Math.round(tab.len / 7)));
      for (let k = 0; k < n; k++) {
        const barrel = (k + this.items.length) % 3 !== 2;
        if (barrel ? nb >= MAX : nc >= MAX) continue;
        this.items.push({
          tab, d: (tab.len * (k + Math.random() * 0.6)) / n, speed: (c.speed || 1.5) * (0.85 + Math.random() * 0.25),
          off: (Math.random() - 0.5) * Math.max(0, (c.width || 2) - 1.2), spin: Math.random() * 6, spinRate: (Math.random() - 0.5) * 0.5,
          phase: Math.random() * 10, barrel, slot: barrel ? nb++ : nc++, pos: new THREE.Vector3(),
        });
      }
    }
    this.barrels.count = nb;
    this.crates.count = nc;
  }

  update(dt, sites) {
    this.build(sites);
    // Bench only (`?lfloat=0`): no floating props, for an A/B of their cost.
    if (this.game.bench && this.game.params.get('lfloat') === '0') this.items.length = 0;
    if (!this.items.length) return;
    this.t += dt;
    const w = this.where;
    for (const it of this.items) {
      it.d += it.speed * dt;
      if (it.d > it.tab.len) it.d -= it.tab.len;
      along(it.tab, it.d, w);
      const l = Math.hypot(w.dx, w.dz) || 1;
      const nx = -w.dz / l;
      const nz = w.dx / l;
      // The flowing water's own surface (the provider's flowingLevel), else the standing water's, else the path's point.
      const fl = sites.src.flowingLevel ? sites.src.flowingLevel(w.x, w.y, w.z) : NaN;
      const lvl = Number.isFinite(fl) ? fl : sites.waterLevel(w.x, w.z);
      const y = Number.isFinite(lvl) && Math.abs(lvl - w.y) < 1.5 ? lvl : w.y;
      it.spin += it.spinRate * dt;
      const bob = Math.sin(this.t * 1.7 + it.phase) * 0.04;
      it.pos.set(w.x + nx * it.off, y - (it.barrel ? 0.12 : 0.1) + bob, w.z + nz * it.off);
      tmpE.set(Math.sin(this.t * 1.3 + it.phase) * 0.08, Math.atan2(w.dx, w.dz) + it.spin, Math.cos(this.t * 1.1 + it.phase) * 0.08);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(it.pos, tmpQ, tmpS);
      (it.barrel ? this.barrels : this.crates).setMatrixAt(it.slot, tmpM);
    }
    this.barrels.instanceMatrix.needsUpdate = true;
    this.crates.instanceMatrix.needsUpdate = true;
  }

  /** Per view: shown only when a view can see one of them (chunk visibility). */
  cullFor(vis) {
    if (!this.items.length) {
      this.barrels.visible = false;
      this.crates.visible = false;
      return;
    }
    let b = false;
    let c = false;
    for (const it of this.items) {
      if ((it.barrel ? b : c) || !vis(it.pos.x, it.pos.y, it.pos.z)) continue;
      if (it.barrel) b = true;
      else c = true;
    }
    this.barrels.visible = b;
    this.crates.visible = c;
  }
}
