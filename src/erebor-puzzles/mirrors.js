/* ==== erebor-puzzles/mirrors.js — the loose mirrors of Durin's Day door's light puzzle: lying on the floor at first,
   carried (one per player), standing in a socket and turned in 45° steps. The use key picks one up, puts it into the
   nearest empty socket (or sets it down on the floor), turns a standing one 45° (a tap; eight steps make a full turn)
   or takes it out (held 0.55 s). Drawn as one instanced mesh (a polished bronze disc in a rim on a stand whose foot is
   on the floor with the disc's centre at the beam's height; vertex colours, the floaters' material settings: no new
   shader program). The mirror under a light that comes straight down leans back 45°. Generic objects (Decision 18:
   no named artefact). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { floorBelow } from '../enemies/sites.js';
import { sdf } from '../world.js';

export const MIRROR = {
  max: 10, // instances
  reach: 1.9, // m: the use key reaches a mirror or a socket this far (in front of the player)
  hold: 0.55, // s: holding the use key this long takes a standing mirror out
  r: 0.3, // the disc's radius
  stand: 1.0, // m from the floor to the disc's centre (the world's beam height, erebor-sites.js BEAM_Y)
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

function painted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A round mirror in mirror space: the face in the local xy plane looking along +z (both sides polished), the stand below. */
function mirrorGeometry() {
  const R = MIRROR.r;
  const parts = [];
  for (const s of [1, -1]) {
    const face = new THREE.CircleGeometry(R, 24);
    if (s < 0) face.rotateY(Math.PI);
    face.translate(0, 0, s * 0.012);
    parts.push(painted(face, 0xe8dcc0));
  }
  const rim = new THREE.TorusGeometry(R + 0.012, 0.024, 6, 28);
  parts.push(painted(rim, 0x7a5426));
  // The stand: a post from the rim down to a round foot on the floor, and a small fork holding the disc.
  const H = MIRROR.stand;
  const post = new THREE.CylinderGeometry(0.022, 0.032, H - R, 8);
  post.translate(0, -R - (H - R) / 2, 0);
  parts.push(painted(post, 0x5a3e1e));
  const foot = new THREE.CylinderGeometry(0.13, 0.16, 0.05, 12);
  foot.translate(0, -H + 0.025, 0);
  parts.push(painted(foot, 0x4a3218));
  for (const s of [-1, 1]) {
    const fork = new THREE.BoxGeometry(0.03, 0.12, 0.04);
    fork.translate(s * (R + 0.02), -R * 0.55, 0);
    fork.rotateZ(s * 0.5);
    parts.push(painted(fork, 0x5a3e1e));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** True when a point lies within r m (in xz) of the polyline `path`. */
function nearPath(q, path, r) {
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz;
    const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.z - a.z) * vz) / l2)) : 0;
    if (Math.hypot(q.x - a.x - vx * t, q.z - a.z - vz * t) < r) return true;
  }
  return false;
}

/** Height of the mirror's centre over the floor when it stands by itself. */
const STAND_H = MIRROR.stand;

export class Mirrors {
  constructor(owner) {
    this.owner = owner;
    this.game = owner.game;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25 });
    this.mesh = new THREE.InstancedMesh(mirrorGeometry(), this.mat, MIRROR.max);
    this.mesh.name = 'erebor-mirrors';
    this.mesh.frustumCulled = false;
    // Kept in the scene from the start (one instance far below), so game.preuploadScene() uploads it after the load.
    tmpM.makeTranslation(0, -2000, 0);
    this.mesh.setMatrixAt(0, tmpM);
    this.mesh.count = 1;
    this.game.scene.add(this.mesh);
    /** [{ k, where: 'floor' | 'hand' | 'socket', x, y, z, yaw, holder (player), socket (id), home {x, y, z} }] */
    this.list = [];
    /** socket id → the mirror standing in it */
    this.inSocket = new Map();
    this.sockets = [];
  }

  /** Places the mirrors for a provider: `n` loose ones, `rots` (saved socket id → rot) standing where they were. */
  build(sockets, spots, n, saved, avoid, path = []) {
    this.sockets = sockets;
    this.list = [];
    this.inSocket.clear();
    const homes = this.homes(sockets, spots, n, avoid, path);
    for (let k = 0; k < n; k++) {
      const h = homes[k];
      this.list.push({ k, where: 'floor', x: h.x, y: h.y, z: h.z, yaw: k * 1.3, holder: null, socket: null, rot: 0, home: h });
    }
    // Saved standing mirrors go back into their sockets (as many as there are mirrors).
    let k = 0;
    for (const [id, rot] of Object.entries(saved || {})) {
      const s = sockets.find((q) => String(q.id) === id);
      if (!s || k >= this.list.length) continue;
      this.mount(this.list[k++], s, rot);
    }
    this.dirty = true;
  }

  /** Where the loose mirrors lie at first: the provider's spots, else on the floor beside the sockets that the
   *  solution does not use (`avoid`), so their places give nothing away. */
  homes(sockets, spots, n, avoid, path = []) {
    const out = [];
    for (const s of spots || []) if (out.length < n) out.push(this.onFloor(s.x, s.y + 0.6, s.z) || s);
    // (The sockets' y is the beam's height; their floor is floorY.)
    const order = [...sockets.filter((s) => !avoid?.has(s.id)), ...sockets.filter((s) => avoid?.has(s.id))];
    const offs = [[0.75, 0], [-0.75, 0], [0, 0.75], [0, -0.75], [0.55, 0.55], [-0.55, -0.55], [0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]];
    for (let i = 0; out.length < n && i < order.length * 2 + n; i++) {
      const s = order[i % Math.max(1, order.length)];
      if (!s) break;
      for (const [ox, oz] of offs) {
        const f = this.onFloor(s.x + ox, (s.floorY ?? s.y) + 0.8, s.z + oz);
        if (f && !out.some((q) => Math.hypot(q.x - f.x, q.z - f.z) < 0.5) && !nearPath(f, path, 0.7)) {
          out.push(f);
          break;
        }
      }
    }
    while (out.length < n) out.push(sockets[0] ? { x: sockets[0].x, y: sockets[0].y, z: sockets[0].z } : { x: 0, y: -2000, z: 0 });
    return out;
  }

  onFloor(x, y, z) {
    if (sdf(x, y, z) > -0.1) return null;
    const f = floorBelow(x, y, z, 4);
    return f ? { x: f.x, y: f.y, z: f.z } : null;
  }

  mount(m, s, rot = 0) {
    if (m.holder) m.holder.erMirror = null;
    m.where = 'socket';
    m.socket = s.id;
    m.holder = null;
    m.rot = ((rot | 0) % 8 + 8) % 8;
    m.x = s.x;
    m.y = s.y;
    m.z = s.z;
    this.inSocket.set(s.id, m);
    this.dirty = true;
  }

  unmount(m) {
    if (m.socket != null) this.inSocket.delete(m.socket);
    m.socket = null;
  }

  /** socket id → rot of every standing mirror (the tracer's input and the save). */
  rotations() {
    const out = new Map();
    for (const [id, m] of this.inSocket) out.set(id, m.rot);
    return out;
  }

  /* ---------------- the use key ---------------- */

  /** A point `d` m in front of the player at his chest. */
  front(p, d) {
    return { x: p.pos.x - Math.sin(p.yaw) * d, y: p.pos.y + 0.9, z: p.pos.z - Math.cos(p.yaw) * d };
  }

  /** The nearest thing within reach in front of the player matching `ok` among `items` ({x, y, z}). */
  pick(p, items, ok) {
    let best = null;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    for (const q of items) {
      if (!ok(q)) continue;
      const dx = q.x - p.pos.x;
      const dz = q.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > MIRROR.reach || Math.abs(q.y - (p.pos.y + 0.8)) > 1.8) continue;
      const facing = d < 0.5 ? 1 : (dx * fx + dz * fz) / d;
      if (facing < 0.35) continue;
      const score = d - facing;
      if (!best || score < best.score) best = { q, score };
    }
    return best?.q || null;
  }

  /** What the use key would do now: { kind, m?, s? } or null. */
  target(p) {
    const held = p.erMirror;
    if (held) {
      const s = this.pick(p, this.sockets, (q) => !this.inSocket.has(q.id));
      if (s) return { kind: 'place', s, m: held };
      return { kind: 'drop', m: held };
    }
    const s = this.pick(p, this.sockets, (q) => this.inSocket.has(q.id));
    if (s) return { kind: 'turn', s, m: this.inSocket.get(s.id) };
    const m = this.pick(p, this.list, (q) => q.where === 'floor');
    if (m) return { kind: 'take', m };
    return null;
  }

  /** A use press (tap, or the start of a hold on a standing mirror). Returns true when it did something here. */
  press(p) {
    const t = this.target(p);
    if (!t) return false;
    switch (t.kind) {
      case 'place':
        p.erMirror = null;
        this.mount(t.m, t.s, 0);
        this.owner.sound('clink', t.s);
        p.say('Beállítottad a tükröt. Fordítsd a fény felé!', 2.5);
        this.owner.mirrorMoved();
        return true;
      case 'drop': {
        const f = this.onFloor(p.pos.x - Math.sin(p.yaw) * 0.7, p.pos.y + 0.6, p.pos.z - Math.cos(p.yaw) * 0.7) || { x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z };
        Object.assign(t.m, { where: 'floor', holder: null, x: f.x, y: f.y, z: f.z, yaw: p.yaw });
        p.erMirror = null;
        this.owner.sound('clink', f);
        this.dirty = true;
        return true;
      }
      case 'turn':
        // A tap turns it (on release), a hold takes it out (update()).
        p.erHold = { m: t.m, t: 0 };
        return true;
      case 'take':
        this.takeUp(p, t.m);
        return true;
      default:
        return false;
    }
  }

  takeUp(p, m) {
    const wasStanding = m.where === 'socket';
    this.unmount(m);
    m.where = 'hand';
    m.holder = p;
    p.erMirror = m;
    this.owner.sound('clink', p.pos);
    p.say(wasStanding ? 'Kivetted a tükröt a foglalatából.' : 'Felvettél egy tükröt. Vidd egy üres foglalathoz!', 2.5);
    this.dirty = true;
    if (wasStanding) this.owner.mirrorMoved();
  }

  turn(p, m) {
    m.rot = (m.rot + 1) % 8;
    this.owner.sound('scrape', m);
    p.say(`Elfordítottad a tükröt (${m.rot * 45}°).`, 1.5);
    this.dirty = true;
    this.owner.mirrorMoved();
  }

  /** Per player per frame: the tap / hold on a standing mirror (it.interactHeld from input.js). */
  holdStep(p, it, dt) {
    const h = p.erHold;
    if (!h) return;
    if (h.m.where !== 'socket') {
      p.erHold = null;
      return;
    }
    if (it.interactHeld) {
      h.t += dt;
      if (h.t >= MIRROR.hold) {
        p.erHold = null;
        this.takeUp(p, h.m);
      }
      return;
    }
    p.erHold = null;
    this.turn(p, h.m);
  }

  /** A player who leaves, dies or loads: what he carried goes back home. */
  dropAll(p) {
    const m = p.erMirror;
    if (!m) return;
    Object.assign(m, { where: 'floor', holder: null, x: m.home.x, y: m.home.y, z: m.home.z });
    p.erMirror = null;
    this.dirty = true;
  }

  /* ---------------- drawing ---------------- */

  /** Writes the instance matrices (only when something moved; carried mirrors move every frame). */
  update() {
    const carried = this.list.some((m) => m.where === 'hand');
    if (!this.dirty && !carried) return;
    this.dirty = false;
    let n = 0;
    for (const m of this.list) {
      if (m.where === 'socket') {
        // The face's normal is the mirror's facing (beam.js facing): yaw = −rot·45°; leaning back 45° under the shaft.
        tmpE.set(m.socket === this.underId ? -Math.PI / 4 : 0, (-m.rot * Math.PI) / 4, 0, 'YXZ');
        tmpP.set(m.x, m.y, m.z);
      } else if (m.where === 'hand') {
        const p = m.holder;
        const f = this.front(p, 0.42);
        tmpE.set(-0.25, p.yaw, 0, 'YXZ');
        tmpP.set(f.x + Math.cos(p.yaw) * 0.18, p.pos.y + p.eyeH * 0.62, f.z - Math.sin(p.yaw) * 0.18);
      } else {
        // Set down: standing on its foot.
        tmpE.set(0, m.yaw, 0, 'YXZ');
        tmpP.set(m.x, m.y + STAND_H, m.z);
      }
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP, tmpQ, ONE);
      this.mesh.setMatrixAt(n++, tmpM);
    }
    if (!n) {
      tmpM.makeTranslation(0, -2000, 0);
      this.mesh.setMatrixAt(n++, tmpM);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  cullFor(vis) {
    this.mesh.visible = this.list.some((m) => vis(m.x, m.y, m.z) || m.where === 'hand');
  }
}

export { STAND_H };
