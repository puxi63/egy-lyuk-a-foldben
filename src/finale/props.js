/* ==== finale/props.js — the finale's meshes: Bárd the archer with his bow and the black arrow, the Eagles' flight
   (exits.js eagle, instanced), the auction in front of Bag End, the garden round the pit's mouth with Bilbo's oak,
   the smoke and steam where Smaug fell. Everything is built once, vertex-coloured on one Lambert material where it can
   be (one program), added to the scene hidden at start (game.warmPrograms / preuploadScene see it) and only shown by
   the scenes. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BONE } from '../characters.js';
import { buildEagle } from '../exits.js';
import { FEAST_HOBBITS, hobbitGeometry, lobeliaGeometry, othoGeometry } from '../home-events/figures.js';
import { BardBody } from '../laketown-events/bard.js';
import { BAG_END } from '../surface/bagend.js';
import { INN } from '../surface/inn.js';

/** Where things stand on the surface (world, y = 0 is the lawn round the pit). */
export const PLACES = {
  /** Bárd in the front garden, between the pit and Bag End, facing the pit (−z). */
  bard: { x: -6.2, z: 15.4, yaw: 0.25 },
  /** The auction's table in front of Bag End's round door. */
  auction: { x: BAG_END.x + 2.2, z: BAG_END.z - 7.2 },
  /** Bilbo's acorn grown into a young oak (TERV 0.11/16), at the pit's south-west corner. */
  oak: { x: -13.6, z: -13.6 },
  /** Where Smaug comes down, beyond Bag End's hill (out of the garden's view; in the book he falls on Lake-town). */
  crash: { x: -14, z: 78 },
};

const tq = new THREE.Quaternion();
const te = new THREE.Euler();

/** Vertex colours on a non-indexed copy without uvs (all parts merge on one vertex-coloured material). */
export function painted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A merged, painted model; `parts` is [geometry, hex, matrix?][] (hex null: the geometry keeps its own colours). */
function merged(parts) {
  const out = parts.map(([g, hex, m]) => {
    let p;
    if (hex == null) {
      p = g.index ? g.toNonIndexed() : g;
      if (p.attributes.uv) p.deleteAttribute('uv');
    } else p = painted(g, hex);
    if (m) p.applyMatrix4(m);
    return p;
  });
  // Each part keeps its own (smooth) normals; recomputing them on the non-indexed merge would facet every leaf.
  const g = mergeGeometries(out);
  g.computeBoundingSphere();
  return g;
}

const M = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), tq.setFromEuler(te.set(rx, ry, rz, 'YXZ')), Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s),
);

/* ---------------- Bárd the archer ---------------- */

/**
 * Bárd with a drawn bow: the baked figure (assets/characters/bard.json, NOTES-5b) with an archer's pose on top of his
 * idle (the left arm holding the bow out towards the aim, the right hand drawing the string to the cheek), the body
 * and head turned to the aim. `pose.draw` 0..1 raises the bow; `pose.aimYaw` / `pose.aimPitch` the aim relative to
 * his facing.
 */
export class ArcherBody extends BardBody {
  constructor() {
    super();
    this.pose.draw = 0;
    this.pose.aimPitch = 0;
  }

  animate(st) {
    super.animate(st);
    if (!this.bones) return;
    const b = this.bones;
    const d = this.pose.draw;
    if (d <= 0) return;
    const add = (i, x, y, z) => {
      tq.setFromEuler(te.set(x * d, y * d, z * d, 'XYZ'));
      b[i].quaternion.multiply(tq);
    };
    const up = Math.max(-0.4, Math.min(1.0, this.pose.aimPitch));
    // Side-on to the aim: the chest turns a quarter right, the head back to the target.
    add(BONE.spine, -0.08, -0.55, 0);
    add(BONE.head, -up * 0.5, 0.5, 0);
    // The bow arm straight out to the left-front, raised with the aim; the draw arm bent back to the cheek.
    add(BONE.upperArmL, 1.45 + up * 0.6, 0.15, 0.55);
    add(BONE.foreArmL, -1.1, 0, 0);
    add(BONE.upperArmR, 1.3 + up * 0.6, 0, -0.55);
    add(BONE.foreArmR, 1.7, 0, 0);
  }
}

/** A long yew bow (book: a great yew bow) as a bent tube with its string; held vertical, the grip at the origin. */
function bowGeometry() {
  const pts = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12 - 0.5;
    pts.push(new THREE.Vector3(0, t * 1.55, -Math.cos(t * Math.PI) * 0.16 + 0.16 * 0.3));
  }
  const limb = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 5, false);
  const string = new THREE.CylinderGeometry(0.003, 0.003, 1.5, 3);
  string.translate(0, 0, 0.16 * 0.3 + 0.0);
  const grip = new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6);
  return merged([[limb, 0x5a3a1c], [string, 0xd8d0b8, M(0, 0, 0.002)], [grip, 0x2a1c10]]);
}

/** The black arrow (book ch. 14): a dark shaft, a black iron head, dark fletching. Points along −z, 0.9 m. */
function arrowGeometry(black = true) {
  const shaft = new THREE.CylinderGeometry(0.009, 0.009, 0.9, 5);
  shaft.rotateX(Math.PI / 2);
  const head = new THREE.ConeGeometry(0.022, 0.09, 5);
  head.rotateX(-Math.PI / 2);
  head.translate(0, 0, -0.49);
  const parts = [[shaft, black ? 0x161210 : 0x8a6a40], [head, black ? 0x0c0c0e : 0x6a6a70]];
  for (let k = 0; k < 3; k++) {
    const f = new THREE.BoxGeometry(0.002, 0.04, 0.12);
    f.translate(0, 0.022, 0.38);
    parts.push([f, black ? 0x221a14 : 0xb8b0a0, M(0, 0, 0, 0, 0, (k * Math.PI * 2) / 3)]);
  }
  return merged(parts);
}

/** Bárd, his bow and the arrow in flight. */
export class FinaleBard {
  constructor(scene, mat) {
    this.body = new ArcherBody();
    this.body.group.visible = false;
    this.body.group.name = 'finale-bard';
    scene.add(this.body.group);
    this.bow = new THREE.Mesh(bowGeometry(), mat);
    this.bow.name = 'finale-bow';
    this.bow.visible = false;
    scene.add(this.bow);
    this.arrow = new THREE.Mesh(arrowGeometry(true), mat);
    this.arrow.name = 'finale-black-arrow';
    this.arrow.visible = false;
    scene.add(this.arrow);
    this.plain = new THREE.Mesh(arrowGeometry(false), mat);
    this.plain.name = 'finale-arrow';
    this.plain.visible = false;
    scene.add(this.plain);
    this.yaw = PLACES.bard.yaw;
    this.loaded = false;
    this.body.ready.then(() => {
      this.loaded = true;
    });
    this.flights = []; // { mesh, from, to, t, dur, onHit }
    this.tmp = new THREE.Vector3();
  }

  show(on, y = 0) {
    const g = this.body.group;
    g.visible = on;
    g.position.set(PLACES.bard.x, y, PLACES.bard.z);
    this.bow.visible = on;
    if (!on) {
      this.arrow.visible = false;
      this.plain.visible = false;
      this.flights.length = 0;
    }
  }

  /** Turns to the aim point (body up to the facing, the rest by the pose) and sets the draw. */
  aim(target, draw, dt) {
    const g = this.body.group;
    const dx = target.x - g.position.x;
    const dz = target.z - g.position.z;
    // Bárd's body faces −z at yaw 0; drawn side-on, his chest turns a quarter to the right of the aim.
    const want = Math.atan2(-dx, -dz) - 0.55 * draw;
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), 3 * dt);
    g.rotation.y = this.yaw;
    const pose = this.body.pose;
    pose.draw += (draw - pose.draw) * Math.min(1, dt * 4);
    pose.aimPitch = Math.atan2(target.y - g.position.y - 1.5, Math.hypot(dx, dz));
    pose.look = 0;
  }

  /** The bow's grip follows the left hand (or a point beside the body before the figure has loaded). */
  placeBow() {
    const g = this.body.group;
    const hand = this.body.bones?.[BONE.handL];
    if (hand) {
      g.updateMatrixWorld(true);
      hand.getWorldPosition(this.bow.position);
    } else this.bow.position.set(g.position.x - 0.4, g.position.y + 1.2, g.position.z);
    this.bow.rotation.set(0, this.yaw + 0.55 * this.body.pose.draw, 0);
  }

  /** Looses an arrow from his hands at `to` (a Vector3, or a function returning one: a moving target). */
  shoot(to, black, onHit) {
    const mesh = black ? this.arrow : this.plain;
    const from = this.bow.position.clone().add(this.tmp.set(0, 0.05, 0));
    this.flights.push({ mesh, from, to, t: 0, dur: black ? 0.75 : 0.6, onHit });
    mesh.visible = true;
  }

  update(dt) {
    if (!this.body.group.visible) return;
    this.body.animate({ dt, speed: 0, vy: 0, grounded: true, climbing: false, swing: 0, pitch: 0, walk: 3.6, fill: 0 });
    this.placeBow();
    for (const f of this.flights) {
      f.t += dt;
      const to = typeof f.to === 'function' ? f.to() : f.to;
      const u = Math.min(1, f.t / f.dur);
      const p = this.tmp.lerpVectors(f.from, to, u);
      f.mesh.position.copy(p);
      f.mesh.lookAt(to);
      // lookAt points +z at the target; the arrow's head is at −z.
      f.mesh.rotateY(Math.PI);
      if (u >= 1 && !f.done) {
        f.done = true;
        f.mesh.visible = false;
        f.onHit?.();
      }
    }
    this.flights = this.flights.filter((f) => !f.done);
  }
}

/* ---------------- the Eagles (exits.js's eagle, instanced: two draws for the whole flight) ---------------- */

/** Bakes exits.js buildEagle() into a body geometry and one wing geometry (vertex colours from its materials). */
function eagleGeometries() {
  const g = buildEagle();
  g.updateMatrixWorld(true);
  const body = [];
  const wing = [];
  const wings = new Set(g.userData.wings);
  g.traverse((o) => {
    if (!o.isMesh) return;
    let p = o.parent;
    let inWing = null;
    while (p && p !== g) {
      if (wings.has(p)) inWing = p;
      p = p.parent;
    }
    const geo = painted(o.geometry.clone(), o.material.color.getHex());
    if (inWing) {
      // In the wing pivot's frame (the right wing only: the left is the mirrored instance).
      if (inWing !== g.userData.wings[1]) return;
      geo.applyMatrix4(o.matrix);
      wing.push(geo);
    } else {
      geo.applyMatrix4(o.matrixWorld);
      body.push(geo);
    }
  });
  const pivot = g.userData.wings[1].position.clone();
  const b = mergeGeometries(body);
  b.computeVertexNormals();
  const w = mergeGeometries(wing);
  w.computeVertexNormals();
  return { body: b, wing: w, pivot };
}

/** A flight of Great Eagles: `count` birds, instanced bodies and wings (the left wings mirrored). */
export class EagleFlight {
  constructor(scene, mat, count = 7) {
    const { body, wing, pivot } = eagleGeometries();
    this.count = count;
    this.pivot = pivot;
    // Double-sided: the wing is a flat shape and the mirrored instances flip its faces.
    this.wingMat = mat.clone();
    this.wingMat.side = THREE.DoubleSide;
    this.bodies = new THREE.InstancedMesh(body, mat, count);
    this.wings = new THREE.InstancedMesh(wing, this.wingMat, count * 2);
    for (const m of [this.bodies, this.wings]) {
      m.frustumCulled = false;
      m.visible = false;
      m.name = 'finale-eagles';
      scene.add(m);
    }
    this.t = 0;
    this.m = new THREE.Matrix4();
    this.w = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }

  show(on) {
    this.bodies.visible = on;
    this.wings.visible = on;
    this.t = 0;
  }

  /**
   * They come in from the west high over the Shire in a loose V, sweep over the pit in a wide circle, lower, and
   * leave towards the east. Scale 1.6: the Great Eagles dwarf the exits' carrying eagle.
   */
  update(dt) {
    if (!this.bodies.visible) return;
    this.t += dt;
    const t = this.t;
    for (let k = 0; k < this.count; k++) {
      const side = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
      const lag = Math.abs(side) * 0.55;
      const u = Math.max(0, t - lag);
      // Path: a straight run in from the west (x −120 → −20), a circle of radius 26 round the pit, out to the east.
      let x;
      let z;
      let y;
      let hx;
      let hz;
      const run = 3.2;
      if (u < run) {
        const s = u / run;
        x = -130 + s * 104;
        z = -8 + side * 5;
        y = 46 - s * 10;
        hx = 1;
        hz = 0;
      } else {
        const a = (u - run) * 0.5;
        const r = 26 + side * 3.2;
        x = -Math.cos(a) * r;
        z = -8 + Math.sin(a) * r * 0.85 + side * 2;
        y = 36 - Math.min(10, (u - run) * 1.6);
        hx = Math.sin(a);
        hz = Math.cos(a) * 0.85;
      }
      const bank = u < run ? 0 : -0.35;
      // buildEagle faces −z: the yaw that points its −z along the heading (as the characters' yaw).
      this.q.setFromEuler(this.e.set(0, Math.atan2(-hx, -hz), bank, 'YXZ'));
      this.p.set(x, y, z);
      if (k === 0) (this.lead ||= new THREE.Vector3()).copy(this.p);
      this.s.set(1.6, 1.6, 1.6);
      this.m.compose(this.p, this.q, this.s);
      this.bodies.setMatrixAt(k, this.m);
      const flap = Math.sin(t * 2.4 + k * 0.9) * 0.4;
      for (const sgn of [1, -1]) {
        // The wing: from its pivot, flapped about the body's z axis, mirrored for the left.
        this.w.makeRotationZ(sgn * flap);
        const pv = this.p.set(this.pivot.x * sgn, this.pivot.y, this.pivot.z);
        const local = new THREE.Matrix4().makeTranslation(pv.x, pv.y, pv.z).multiply(this.w).multiply(new THREE.Matrix4().makeScale(sgn, 1, 1));
        const world = this.m.clone().multiply(local);
        this.wings.setMatrixAt(k * 2 + (sgn > 0 ? 0 : 1), world);
      }
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------- the auction in front of Bag End ---------------- */

/** The auction's notice: "ÁRVERÉS" chalked on a board (book ch. 19: "Messrs. Grubb, Grubb, and Burrowes"). */
function noticeTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#d8c49a';
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#6a4a26';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 152);
  g.fillStyle = '#3a2412';
  g.textAlign = 'center';
  g.font = 'bold 44px Georgia, serif';
  g.fillText('ÁRVERÉS', 128, 62);
  g.font = 'italic 19px Georgia, serif';
  g.fillText('Zsákos Bilbó úr', 128, 96);
  g.fillText('néhai hagyatéka', 128, 120);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The auction (book ch. 19: Bilbo comes home in the middle of it; his things are being sold off, the Sackville-
 * Bagginses measuring the rooms): a trestle table with his things on it, a chair, a clock, crates, a rolled rug and
 * the notice on a post; Lobelia at the spoons and Otho with a measuring rod (NOTES-17-polish; figures as Bag End's
 * home events build them). The same mesh also holds the feast crowd in front of the Green Dragon (a few hobbits round
 * the inn's drinkers' table), drawn instead of the auction by `group.showPart('feast')` (a draw range on the same
 * mesh: no new mesh, material or program).
 * Returns the group (two draws: the props and the notice; `showPart('auction' | 'feast')`, the auction by default).
 */
export function buildAuction(scene, mat) {
  const parts = [];
  const wood = 0x8a6238;
  const dark = 0x4a3220;
  // Trestle table.
  parts.push([new THREE.BoxGeometry(2.2, 0.06, 0.8), wood, M(0, 0.78, 0)]);
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.3, 0.3]) parts.push([new THREE.BoxGeometry(0.06, 0.78, 0.06), dark, M(sx, 0.39, sz)]);
  // On the table: plates, a teapot, candlesticks, a stack of books, spoons in a box.
  for (let k = 0; k < 4; k++) parts.push([new THREE.CylinderGeometry(0.11, 0.1, 0.015, 12), 0xe8e4d8, M(-0.8 + k * 0.04, 0.82 + k * 0.016, -0.1)]);
  parts.push([new THREE.SphereGeometry(0.11, 10, 8), 0xd8d4c4, M(-0.35, 0.92, 0.12, 0, 0, 0, [1, 0.8, 1])]);
  parts.push([new THREE.CylinderGeometry(0.02, 0.03, 0.1, 6), 0xd8d4c4, M(-0.22, 0.94, 0.12, 0, 0, -1.0)]);
  for (const sx of [0.1, 0.32]) parts.push([new THREE.CylinderGeometry(0.018, 0.04, 0.26, 8), 0xc8a050, M(sx, 0.94, -0.18)]);
  for (let k = 0; k < 4; k++) parts.push([new THREE.BoxGeometry(0.26, 0.05, 0.19), [0x6a2a1a, 0x2a4a2a, 0x5a4a2a, 0x2a2a4a][k], M(0.65, 0.835 + k * 0.05, 0.1, 0, k * 0.2, 0)]);
  parts.push([new THREE.BoxGeometry(0.3, 0.08, 0.16), 0x5a3a20, M(0.2, 0.85, 0.2)]);
  for (let k = 0; k < 5; k++) parts.push([new THREE.BoxGeometry(0.02, 0.012, 0.13), 0xd8dce0, M(0.12 + k * 0.04, 0.9, 0.2)]);
  // Bilbo's armchair beside the table, a grandfather clock, crates, a rolled rug.
  const chair = [[new THREE.BoxGeometry(0.7, 0.14, 0.65), 0x7a2a22, M(0, 0.45, 0)], [new THREE.BoxGeometry(0.7, 0.75, 0.14), 0x7a2a22, M(0, 0.85, 0.28)]];
  for (const sx of [-0.33, 0.33]) chair.push([new THREE.BoxGeometry(0.1, 0.32, 0.6), 0x6a2018, M(sx, 0.65, 0.02)]);
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.24, 0.24]) chair.push([new THREE.CylinderGeometry(0.03, 0.025, 0.4, 6), dark, M(sx, 0.2, sz)]);
  for (const [g, c, m] of chair) parts.push([g, c, new THREE.Matrix4().multiplyMatrices(M(1.9, 0, 0.3, 0, -0.5, 0), m)]);
  parts.push([new THREE.BoxGeometry(0.46, 1.9, 0.3), 0x5a3418, M(-2.0, 0.95, 0.5)]);
  parts.push([new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16), 0xe8e0c8, M(-2.0, 1.6, 0.34, Math.PI / 2, 0, 0)]);
  parts.push([new THREE.BoxGeometry(0.6, 0.45, 0.45), 0x9a7448, M(1.3, 0.225, -0.65, 0, 0.3, 0)]);
  parts.push([new THREE.BoxGeometry(0.5, 0.4, 0.4), 0x8a6640, M(1.32, 0.65, -0.6, 0, -0.2, 0)]);
  parts.push([new THREE.CylinderGeometry(0.16, 0.16, 1.7, 10), 0x8a3a2a, M(-0.9, 0.16, -0.9, 0, 0.4, Math.PI / 2)]);
  // The notice post.
  parts.push([new THREE.BoxGeometry(0.08, 1.9, 0.08), dark, M(-3.0, 0.95, -0.9)]);
  // The Sackville-Bagginses (book ch. 19), behind the table on Bag End's side, turned towards the garden: Lobelia by the
  // box of spoons, Otho with his measuring rod.
  parts.push([lobeliaGeometry(), null, M(0.35, 0, -0.75, 0, 0.25, 0)]);
  parts.push([othoGeometry(), null, M(-0.75, 0, -0.85, 0, -0.35, 0)]);
  // The feast at the Green Dragon (world positions in front of the inn, brought into this group's frame).
  const toLocal = new THREE.Matrix4().makeRotationY(Math.PI).setPosition(PLACES.auction.x, 0, PLACES.auction.z).invert();
  const W = (x, z, yaw) => new THREE.Matrix4().multiplyMatrices(toLocal, M(x, 0, z, 0, yaw, 0));
  const feast = [];
  // Round the inn's own drinkers' table (surface/inn.js: local (-2, 3.2) in the inn's turned frame), which already has
  // its benches and tankards: three behind it facing the garden (the players stand there), one at each end, one in
  // front at the corner.
  const tx = INN.x + 2.0;
  const tz = INN.z - 3.2;
  const spots = [[-0.55, 1.1, Math.PI], [0.05, 1.15, Math.PI], [0.6, 1.1, Math.PI], [1.15, 0.05, -Math.PI / 2 - 0.35], [-1.15, -0.05, Math.PI / 2 + 0.35], [0.75, -1.15, Math.PI - 0.5]];
  FEAST_HOBBITS.forEach((o, k) => {
    const [x, z, yaw] = spots[k];
    // Yaw π turns a figure (facing +z) to face −z, the garden.
    feast.push([hobbitGeometry(o), null, W(tx + x, tz + z, yaw)]);
  });
  const nAuction = parts.length;
  const geo = merged([...parts, ...feast]);
  // Vertex counts of the two halves (merged() makes every part non-indexed).
  let vAuction = 0;
  for (let k = 0; k < nAuction; k++) {
    const g = parts[k][0];
    vAuction += g.index ? g.index.count : g.attributes.position.count;
  }
  const vAll = geo.attributes.position.count;
  const group = new THREE.Group();
  group.name = 'finale-auction';
  const props = new THREE.Mesh(geo, mat);
  // The draw range changes between the two places: keep the mesh out of the frustum test (the bounding sphere covers
  // both places, a few metres apart on the lawn).
  props.frustumCulled = false;
  group.add(props);
  const notice = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshLambertMaterial({ map: noticeTexture() }));
  notice.position.set(-3.0, 1.55, -0.95);
  notice.rotation.y = Math.PI;
  group.add(notice);
  // Facing the pit like the door (the table's front towards −z, the garden).
  group.position.set(PLACES.auction.x, 0, PLACES.auction.z);
  group.rotation.y = Math.PI;
  group.visible = false;
  /** Which half the mesh draws: the auction (and its notice) or the feast crowd in front of the inn. */
  group.showPart = (kind) => {
    const f = kind === 'feast';
    geo.setDrawRange(f ? vAuction : 0, f ? vAll - vAuction : vAuction);
    notice.visible = !f;
  };
  group.showPart('auction');
  scene.add(group);
  return group;
}

/* ---------------- the garden round the pit's mouth ---------------- */

/**
 * After the finale (TERV 0.8/5: "a gödör fölött kert lesz"): the pit stays open for free play, so the garden frames its
 * mouth: flower beds along the rim on four sides, a rose arch over the path into the pit by the spawn lawn, and Bilbo's
 * acorn grown into a young oak (TERV 0.11/16, the acorn from the film). One draw (vertex colours).
 */
export function buildGarden(scene, mat) {
  const parts = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const FLOWERS = [0xd83a3a, 0xe8c040, 0xe87ab0, 0xf4f0e8, 0x9a6ad8, 0xe86a20];
  /** A bed from (x0, z0) to (x1, z1): edging boards, dark soil, rows of flower clumps. */
  const bed = (x0, z0, x1, z1) => {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    parts.push([new THREE.BoxGeometry(w, 0.16, d), 0x4a3422, M(cx, 0.08, cz)]);
    parts.push([new THREE.BoxGeometry(w + 0.08, 0.2, 0.05), 0x8a6a42, M(cx, 0.1, cz - d / 2)]);
    parts.push([new THREE.BoxGeometry(w + 0.08, 0.2, 0.05), 0x8a6a42, M(cx, 0.1, cz + d / 2)]);
    parts.push([new THREE.BoxGeometry(0.05, 0.2, d), 0x8a6a42, M(cx - w / 2, 0.1, cz)]);
    parts.push([new THREE.BoxGeometry(0.05, 0.2, d), 0x8a6a42, M(cx + w / 2, 0.1, cz)]);
    const n = Math.max(2, Math.round((w * d) / 0.12));
    for (let k = 0; k < n; k++) {
      const x = cx + (rnd() - 0.5) * (w - 0.2);
      const z = cz + (rnd() - 0.5) * (d - 0.2);
      const h = 0.18 + rnd() * 0.3;
      parts.push([new THREE.CylinderGeometry(0.012, 0.012, h, 3), 0x3a6a24, M(x, 0.16 + h / 2, z)]);
      parts.push([new THREE.IcosahedronGeometry(0.05 + rnd() * 0.04, 0), 0x4a7a2a, M(x + 0.04, 0.2, z, 0, rnd() * 3, 0, [1.4, 0.5, 1])]);
      parts.push([new THREE.IcosahedronGeometry(0.045 + rnd() * 0.03, 0), FLOWERS[Math.floor(rnd() * FLOWERS.length)], M(x, 0.16 + h, z)]);
    }
  };
  // Along the rim (the block's edge is at ±12; the beds stand just outside it), leaving the paths, the lift crane
  // (−4, 13.4) and the inn's side free.
  bed(1.8, 12.5, 4.6, 13.3);
  bed(-2.6, 12.5, -1.8, 13.3);
  bed(12.5, -8, 13.3, -1);
  bed(12.5, 1, 13.3, 8);
  bed(-13.3, -8, -12.5, -1);
  bed(-13.3, 1, -12.5, 8);
  bed(-8, -13.3, -1, -12.5);
  bed(1, -13.3, 8, -12.5);
  // The rose arch over the path into the pit (x = 0 on the spawn side): two posts, a round top, climbing roses.
  for (const sx of [-1.15, 1.15]) parts.push([new THREE.BoxGeometry(0.1, 2.3, 0.1), 0x7a5a36, M(sx, 1.15, 12.5)]);
  const arc = [];
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI;
    arc.push(new THREE.Vector3(-Math.cos(a) * 1.15, 2.3 + Math.sin(a) * 0.55, 12.5));
  }
  parts.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 20, 0.05, 5, false), 0x7a5a36]);
  for (let k = 0; k < 46; k++) {
    const u = rnd();
    let x;
    let y;
    if (u < 0.6) {
      const a = rnd() * Math.PI;
      x = -Math.cos(a) * 1.15;
      y = 2.3 + Math.sin(a) * 0.55;
    } else {
      x = (rnd() < 0.5 ? -1 : 1) * 1.15;
      y = 0.3 + rnd() * 2;
    }
    parts.push([new THREE.IcosahedronGeometry(0.1 + rnd() * 0.06, 0), 0x3e6e26, M(x + (rnd() - 0.5) * 0.15, y, 12.5 + (rnd() - 0.5) * 0.2)]);
    if (rnd() < 0.55) parts.push([new THREE.IcosahedronGeometry(0.05, 0), rnd() < 0.7 ? 0xd8384a : 0xf0a0b0, M(x + (rnd() - 0.5) * 0.2, y + 0.05, 12.5 + (rnd() - 0.5) * 0.28)]);
  }
  // shire (NOTES-26-shire): the acorn's mound stays with the garden; the oak itself is its own mesh (a child of the
  // garden, built round its foot) so src/shire can grow it from the acorn over game days (scale 0.08 = a sprout).
  const o = PLACES.oak;
  parts.push([new THREE.SphereGeometry(0.42, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x5a3e26, M(o.x, 0.02, o.z, 0, 0, 0, [1, 0.28, 1])]);
  const oakParts = [];
  oakParts.push([new THREE.CylinderGeometry(0.12, 0.2, 2.6, 8), 0x5a4228, M(0, 1.3, 0)]);
  oakParts.push([new THREE.CylinderGeometry(0.05, 0.08, 1.0, 6), 0x5a4228, M(0.3, 2.3, 0, 0, 0, -0.7)]);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    oakParts.push([new THREE.IcosahedronGeometry(0.75 + rnd() * 0.3, 1), k % 2 ? 0x3e6a22 : 0x4a7a2a, M(Math.cos(a) * 0.7, 3.2 + (rnd() - 0.3) * 0.7, Math.sin(a) * 0.7)]);
  }
  oakParts.push([new THREE.IcosahedronGeometry(1.0, 1), 0x46742a, M(0, 3.9, 0)]);
  const mesh = new THREE.Mesh(merged(parts), mat);
  mesh.name = 'finale-garden';
  mesh.visible = false;
  const oak = new THREE.Mesh(merged(oakParts), mat);
  oak.name = 'finale-oak';
  oak.position.set(o.x, 0, o.z);
  oak.scale.setScalar(0.08);
  mesh.add(oak);
  mesh.userData.oak = oak;
  scene.add(mesh);
  return mesh;
}

/* ---------------- smoke and steam ---------------- */

/** A soft round puff sprite. */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.85)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Puffs of smoke / steam in one point cloud (one draw): the column where Smaug came down. */
export class Puffs {
  constructor(scene, n = 90) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.base = new Float32Array(n * 3);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 9, map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.name = 'finale-steam';
    scene.add(this.points);
    this.emit = 0; // seconds left of emission
    this.src = new THREE.Vector3();
  }

  /** Steam and smoke rise from `at` for `seconds`. */
  start(at, seconds) {
    this.src.copy(at);
    this.emit = seconds;
    this.points.visible = true;
  }

  update(dt) {
    if (!this.points.visible) return;
    if (this.emit > 0) {
      this.emit -= dt;
      for (let k = 0; k < 2; k++) {
        const i = this.next++ % this.n;
        const o = i * 3;
        this.pos[o] = this.src.x + (Math.random() - 0.5) * 6;
        this.pos[o + 1] = this.src.y + Math.random() * 2;
        this.pos[o + 2] = this.src.z + (Math.random() - 0.5) * 6;
        this.vel[o] = (Math.random() - 0.5) * 1.5 + 0.8;
        this.vel[o + 1] = 4 + Math.random() * 4;
        this.vel[o + 2] = (Math.random() - 0.5) * 1.5;
        this.life[i] = 5 + Math.random() * 3;
        const grey = Math.random() < 0.5 ? 0.92 : 0.55;
        this.base[o] = grey;
        this.base[o + 1] = grey;
        this.base[o + 2] = grey * 1.02;
      }
    }
    let any = this.emit > 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      any = true;
      this.life[i] -= dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.vel[o + 1] *= 1 - dt * 0.15;
      this.col[i * 4] = this.base[o];
      this.col[i * 4 + 1] = this.base[o + 1];
      this.col[i * 4 + 2] = this.base[o + 2];
      this.col[i * 4 + 3] = Math.min(1, this.life[i] / 3) * 0.6;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    if (!any) this.points.visible = false;
  }
}
