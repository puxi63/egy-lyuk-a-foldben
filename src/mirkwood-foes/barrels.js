/* ==== mirkwood-foes/barrels.js — the barrel escape (book ch. 9 "Barrels out of Bond", film-flavoured as The Desolation
   of Smaug: the barrels shoot down the river with elves on the banks): a short playable scene. From the cellar the
   players climb into barrels at the trapdoor, drop into the underground river and float along the provider's
   riverPath (30–60 s): steer left / right, push on or hold back, dodge the rocks; a few elf guards on the banks shoot
   arrows that bump the barrel (never deadly in normal mode). At the end of the river the confiscated finds are given
   back and the players climb out at the exit. Co-op: everybody near the trapdoor floats along, side by side.
   On to Lake-town (NOTES-18-levelfix; the book ch. 9–10: the barrels float down the Forest River to Lake-town): the
   river ends in the Elvenking's grotto pool, where the barrel is drawn under and carried down in the dark (a short fade,
   down the barrel way, laketown-sites.js CONNECTOR), and comes up at the head of layer 7's channel; it floats down the
   channel, one turn round the block, into the pile cavern under Lake-town, where the riders climb out on its shore.
   Cheap: one merged barrel mesh per rider, the rocks and the arrows one instanced mesh each. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { arrowGeometry } from '../enemies/combat.js';
import { floorBelow } from '../enemies/sites.js';
import { sdf } from '../world.js';
import { CURRENTS } from '../underground/laketown-sites.js';

export const BARREL = {
  join: 6, // players within this distance of the trapdoor ride along
  minDur: 30,
  maxDur: 60,
  width: 1.6, // half the river's usable width (lateral steering range)
  steer: 3.2, // lateral speed (m/s)
  arrowSpeed: 26,
  bump: 2.6, // lateral kick of an arrow or a rock
  rocks: [0.24, 0.47, 0.7, 0.86],
  archers: [0.3, 0.55, 0.8],
  fade: 0.45,
  minSpeed: 1.9, // m/s: the slowest the current carries a barrel
  drift: 1.8, // s in the dark between the grotto pool and layer 7's channel
};

/** Where the riders climb out in layer 7: the pile cavern's dry shore beside the channel's mouth (NOTES-18-levelfix). */
export const CHANNEL_EXIT = { x: -5.0, y: -407.4, z: 1.6 };

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);
const Z = new THREE.Vector3(0, 0, 1);

/** A vertex-coloured geometry part (merged into one mesh). */
function painted(geo, hex, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 + jitter * (((i / 3) | 0) % 7 / 7 - 0.5);
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

let barrelGeo = null;
/** A wine barrel (book: the empty barrels the elves send back down to Lake-town): bulging oak staves, iron hoops. */
function barrelGeometry() {
  if (barrelGeo) return barrelGeo;
  const parts = [];
  const H = 0.95;
  const staves = 16;
  for (let k = 0; k < staves; k++) {
    // Each stave a curved strip (slightly varied tone), the bulge in the middle.
    const a0 = (k / staves) * Math.PI * 2;
    const a1 = ((k + 0.94) / staves) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(0.4, 0.4, H, 2, 8, true, a0, a1 - a0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const bulge = 1 + 0.16 * (1 - (2 * y / H) ** 2);
      p.setX(i, p.getX(i) * bulge * 0.86);
      p.setZ(i, p.getZ(i) * bulge * 0.86);
    }
    g.computeVertexNormals();
    parts.push(painted(g, k % 3 === 0 ? 0x4a2e18 : k % 3 === 1 ? 0x56381e : 0x50331a, 0.15));
  }
  for (const y of [-0.4, -0.25, 0.25, 0.4]) {
    const r = 0.344 * (1 + 0.16 * (1 - (2 * y / H) ** 2)) + 0.012;
    const hoop = new THREE.CylinderGeometry(r, r, 0.04, 20, 1, true);
    hoop.translate(0, y, 0);
    parts.push(painted(hoop, 0x2e2c2a));
  }
  // The bottom (the top is open: the rider sits in it).
  const bottom = new THREE.CircleGeometry(0.345, 16);
  bottom.rotateX(-Math.PI / 2);
  bottom.translate(0, -H / 2 + 0.03, 0);
  parts.push(painted(bottom, 0x4a3018));
  barrelGeo = mergeGeometries(parts);
  barrelGeo.computeBoundingSphere();
  return barrelGeo;
}

export class Barrels {
  constructor(mgr) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.25, side: THREE.DoubleSide });
    this.riders = []; // { p, s, lat, latVel, bump, mesh, phase: 'in' | 'ride' | 'out', t, wob }
    this.path = null;
    // The rocks in the river (one instanced mesh) and the elves' arrows (one instanced mesh).
    const rg = new THREE.IcosahedronGeometry(0.55, 1);
    const rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i);
      const y = rp.getY(i);
      const z = rp.getZ(i);
      const k = 1 + 0.18 * Math.sin(x * 7 + y * 5) * Math.cos(z * 6);
      rp.setXYZ(i, x * k * 1.2, y * k * 0.7, z * k);
    }
    rg.computeVertexNormals();
    this.rockMesh = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: 0x5a564e }), BARREL.rocks.length);
    this.arrowMesh = new THREE.InstancedMesh(arrowGeometry(), new THREE.MeshLambertMaterial({ color: 0x6a5238, side: THREE.DoubleSide }), 12);
    for (const m of [this.rockMesh, this.arrowMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.visible = false;
      m.count = 0;
      this.game.scene.add(m);
    }
    this.rocks = [];
    this.arrows = Array.from({ length: 12 }, () => ({ live: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() }));
    this.archers = [];
  }

  /** The river's course with its cumulative lengths (from the provider's riverPath). */
  preparePath() {
    const pts = this.mgr.sites.riverPath.map((q) => new THREE.Vector3(q.x, q.y, q.z));
    // Layer 6's path ends on the dry bank (above the water): that point is the exit, not part of the float.
    const lvl = this.mgr.sites.src.riverLevel ?? pts[0]?.y;
    this.exit = pts.length > 2 && pts[pts.length - 1].y > lvl + 0.3 ? pts.pop() : null;
    if (pts.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = cum[cum.length - 1];
    // 30–60 s on a long river; a short one (layer 6's is about 25 m) is not dragged out below a lively pace.
    const speed = Math.max(BARREL.minSpeed, Math.min(L / BARREL.minDur, Math.max(L / BARREL.maxDur, 5)));
    return { pts, cum, L, speed };
  }

  /**
   * The second leg: layer 7's channel (its water surface, laketown-sites.js CURRENTS 'channel'), from its head to its
   * mouth in the pile cavern; null when the channel is not there (a test site).
   */
  prepareChannel() {
    const ch = CURRENTS.find((c) => c.id === 'channel');
    if (!ch || ch.points.length < 2) return null;
    const pts = ch.points.map((q) => new THREE.Vector3(q.x, q.y, q.z));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = cum[cum.length - 1];
    const speed = Math.max(BARREL.minSpeed, Math.min(L / BARREL.minDur, Math.max(L / BARREL.maxDur, 5)));
    return { pts, cum, L, speed };
  }

  /** The path of a rider's leg (0 the river, 1 layer 7's channel). */
  legPath(rd) {
    return rd && rd.leg === 1 ? this.path2 : this.path;
  }

  /** The point and the sideways direction at distance s along the path (the river, or `P`). */
  at(s, out, side, P = this.path) {
    let i = 1;
    while (i < P.cum.length - 1 && P.cum[i] < s) i++;
    const a = P.pts[i - 1];
    const b = P.pts[i];
    const t = Math.max(0, Math.min(1, (s - P.cum[i - 1]) / Math.max(1e-4, P.cum[i] - P.cum[i - 1])));
    out.lerpVectors(a, b, t);
    if (side) {
      side.subVectors(b, a).setY(0).normalize();
      side.set(-side.z, 0, side.x);
    }
    return out;
  }

  active() {
    return this.riders.length > 0;
  }

  isRiding(p) {
    return this.riders.some((r) => r.p === p);
  }

  /** A player at the trapdoor presses the use key: everybody near climbs into a barrel and the ride begins. */
  start(p) {
    if (this.riders.length) return false;
    this.path = this.preparePath();
    if (!this.path) return false;
    // Only layer 6's river (its last point a dry bank, the grotto) floats on to Lake-town; a test river ends as before.
    this.path2 = this.exit ? this.prepareChannel() : null;
    const trap = this.mgr.sites.trapdoor;
    const who = this.game.players.filter((q) => q === p || (this.mgr.free(q) && trap && q.pos.distanceTo(tmp.set(trap.x, trap.y, trap.z)) < BARREL.join));
    who.forEach((q, k) => {
      const mesh = new THREE.Mesh(barrelGeometry(), this.material);
      mesh.name = 'barrel';
      this.game.scene.add(mesh);
      const lat = who.length > 1 ? (k ? 0.75 : -0.75) : 0;
      this.riders.push({ p: q, s: 0.5 + k * 0.4, lat, latVel: 0, bump: 0, mesh, phase: 'in', t: 0, wob: Math.random() * 6, spin: 0, leg: 0 });
      q.barrel = true;
      q.held = null;
      this.mgr.onBarrelStart(q);
    });
    // The rocks (fixed for this ride) and the archers on the banks.
    this.rocks = BARREL.rocks.map((f, k) => ({ s: f * this.path.L, lat: (k % 2 ? 1 : -1) * (0.3 + 0.6 * Math.random()) }));
    this.archers = [];
    BARREL.archers.forEach((f, k) => {
      const c = this.at(f * this.path.L, tmp, tmp2);
      const sx = k % 2 ? 1 : -1;
      const x = c.x + tmp2.x * sx * 3.4;
      const z = c.z + tmp2.z * sx * 3.4;
      const fl = floorBelow(x, c.y + 3, z, 6);
      const e = this.mgr.addElf(fl ? fl.x : x, fl ? fl.y : c.y + 0.4, fl ? fl.z : z, true);
      if (e) this.archers.push(e);
    });
    this.mgr.fx()?.setTrapdoor?.(true);
    this.mgr.sound('splash', p.pos);
    return true;
  }

  /** The nearest rider's barrel within r of a point (for the archers), or null. */
  nearestRider(pos, r) {
    let best = null;
    let bd = r;
    for (const rd of this.riders) {
      if (rd.phase !== 'ride' || rd.leg) continue;
      const d = rd.mesh.position.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = rd.mesh.position;
      }
    }
    return best;
  }

  /** An archer looses an arrow at a barrel (aimed a little ahead of it, not always true). */
  elfShoots(elf, target) {
    const a = this.arrows.find((x) => !x.live);
    if (!a) return;
    a.pos.set(elf.pos.x, elf.pos.y + 1.55, elf.pos.z);
    const lead = this.path ? this.path.speed * 0.35 : 0;
    tmp.copy(target);
    const rd = this.riders.find((r) => r.mesh.position === target);
    if (rd) {
      this.at(rd.s + lead, tmp2);
      tmp.lerp(tmp2, 0.6);
    }
    tmp.x += (Math.random() - 0.5) * 1.6;
    tmp.z += (Math.random() - 0.5) * 1.6;
    tmp.y += 0.4;
    a.vel.subVectors(tmp, a.pos).normalize().multiplyScalar(BARREL.arrowSpeed);
    a.live = 2;
    this.mgr.sound('elf', elf.pos);
  }

  /** player.js hook: the rider's own update (no walking physics). `it` steers. Returns true while riding. */
  ride(p, dt, it) {
    const rd = this.riders.find((r) => r.p === p);
    if (!rd) return false;
    rd.t += dt;
    const P = this.legPath(rd);
    if (rd.phase === 'drift') {
      // Drawn under in the grotto pool and carried down in the dark; up again at the head of layer 7's channel.
      p.fade = Math.min(1, rd.t / BARREL.fade);
      if (rd.t > BARREL.fade && !rd.drifted) {
        rd.drifted = true;
        p.say('A hordót elnyeli a forrásmedence örvénye… a sötétben sodródsz lefelé, Tóváros felé.', 3.5);
      }
      if (rd.t > BARREL.fade + BARREL.drift) {
        rd.leg = 1;
        rd.s = 0.4 + Math.max(0, rd.lat) * 0.2;
        rd.lat *= 0.4;
        rd.phase = 'in';
        rd.t = 0;
        this.legDone();
      }
      p.vel.set(0, 0, 0);
      return true;
    }
    if (rd.phase === 'in') {
      p.fade = Math.max(0, 1 - rd.t / BARREL.fade);
      if (rd.t > BARREL.fade) rd.phase = 'ride';
    } else if (rd.phase === 'ride') {
      p.fade = 0;
      const push = 1 + 0.3 * (it.mz || 0);
      rd.s += P.speed * push * dt;
      rd.latVel += ((it.mx || 0) * BARREL.steer - rd.latVel) * Math.min(1, dt * 4);
      rd.lat += rd.latVel * dt + rd.bump * dt;
      rd.bump *= Math.max(0, 1 - dt * 3);
      if (Math.abs(rd.lat) > BARREL.width) {
        rd.lat = Math.sign(rd.lat) * BARREL.width;
        rd.latVel *= -0.3;
      }
      // Two riders bump into each other.
      for (const o of this.riders) {
        if (o === rd || o.leg !== rd.leg || Math.abs(o.s - rd.s) > 0.8 || Math.abs(o.lat - rd.lat) > 0.8) continue;
        const sgn = rd.lat > o.lat ? 1 : -1;
        rd.lat += sgn * 0.02;
        rd.bump += sgn * 0.5;
      }
      // Rocks (on the river only).
      for (const rk of rd.leg ? [] : this.rocks) {
        if (Math.abs(rk.s - rd.s) < 0.7 && Math.abs(rk.lat - rd.lat) < 0.9 && !rd.rockHit?.has(rk)) {
          (rd.rockHit ||= new Set()).add(rk);
          rd.bump = (rd.lat > rk.lat ? 1 : -1) * BARREL.bump * 1.6;
          rd.spin += 2.5;
          p.kick = 1;
          this.mgr.sound('thunk', p.pos);
          p.say('Bumm! Sziklának ütköztél.', 1.5);
        }
      }
      if (rd.s >= P.L) {
        rd.phase = !rd.leg && this.path2 ? 'drift' : 'out';
        rd.t = 0;
      }
    } else if (rd.phase === 'out') {
      p.fade = Math.min(1, rd.t / BARREL.fade);
      if (rd.t > BARREL.fade) {
        this.finish(rd);
        return true;
      }
    }
    // Place the barrel and the rider in it: bobbing and rolling on the water.
    const c = this.at(Math.min(rd.s, P.L), tmp, tmp2, P);
    rd.spin += dt * (0.4 + Math.abs(rd.latVel) * 0.3);
    const bob = 0.06 * Math.sin(rd.t * 2.6 + rd.wob);
    rd.mesh.position.set(c.x + tmp2.x * rd.lat, c.y + 0.12 + bob, c.z + tmp2.z * rd.lat);
    rd.mesh.rotation.set(0.08 * Math.sin(rd.t * 1.9 + rd.wob) + rd.bump * 0.03, rd.spin, 0.08 * Math.cos(rd.t * 1.6 + rd.wob));
    // Head and shoulders out of the barrel (the eye about 0.8 m above its centre, well over the rim).
    p.pos.set(rd.mesh.position.x, rd.mesh.position.y + 0.8 - p.eyeH, rd.mesh.position.z);
    p.vel.set(0, 0, 0);
    p.grounded = true;
    p.climbing = false;
    return true;
  }

  /** The end of the river: the confiscated finds back, out at the exit point, the barrel left behind. */
  finish(rd) {
    const p = rd.p;
    this.game.scene.remove(rd.mesh);
    this.riders = this.riders.filter((r) => r !== rd);
    p.barrel = false;
    const P = this.legPath(rd);
    const end = P.pts[P.pts.length - 1];
    const ex = rd.leg === 1 ? CHANNEL_EXIT : this.mgr.sites.src.exit || this.exit || null;
    const k = this.riders.length;
    const spot = ex || end;
    const fl = floorBelow(spot.x + k * 0.8, spot.y + 2.5, spot.z, 8) || { x: spot.x, y: spot.y + 0.3, z: spot.z };
    p.pos.set(fl.x, fl.y, fl.z);
    p.vel.set(0, 0, 0);
    p.fadeOut = BARREL.fade;
    this.mgr.recover(p, fl);
    if (!this.riders.length) {
      this.mgr.fx()?.setTrapdoor?.(false);
      this.legDone();
    }
  }

  /** Nobody left on the river: the archers go, the rocks are cleared. */
  legDone() {
    if (this.riders.some((r) => !r.leg && r.phase !== 'drift')) return;
    for (const e of this.archers) e.set('gone');
    this.archers = [];
    this.rocks = [];
  }

  /** Per frame: rocks and arrows (instanced), the fade-in after leaving the barrel. */
  update(dt) {
    for (const p of this.game.players) {
      if (p.fadeOut > 0) {
        p.fadeOut -= dt;
        p.fade = Math.max(0, p.fadeOut / BARREL.fade);
      }
    }
    // Rocks.
    let n = 0;
    if (this.riders.length && this.path) {
      for (const rk of this.rocks) {
        const c = this.at(rk.s, tmp, tmp2);
        tmpQ.setFromAxisAngle(Z, rk.s);
        tmpM.compose(tmp.set(c.x + tmp2.x * rk.lat, c.y + 0.05, c.z + tmp2.z * rk.lat), tmpQ, ONE);
        this.rockMesh.setMatrixAt(n++, tmpM);
      }
    }
    this.rockMesh.count = n;
    this.rockMesh.visible = n > 0;
    if (n) this.rockMesh.instanceMatrix.needsUpdate = true;
    // Arrows: they fly, hit a barrel (a bump, never harm) or splash / stick.
    let m = 0;
    for (const a of this.arrows) {
      if (!a.live) continue;
      a.live -= dt;
      if (a.live <= 0) {
        a.live = 0;
        continue;
      }
      a.vel.y -= 4 * dt;
      a.pos.addScaledVector(a.vel, dt);
      let hit = null;
      for (const rd of this.riders) if (rd.phase === 'ride' && !rd.leg && a.pos.distanceTo(rd.mesh.position) < 0.65) hit = rd;
      if (hit) {
        a.live = 0;
        const side = Math.sign((a.vel.x * (hit.mesh.position.z - a.pos.z)) - (a.vel.z * (hit.mesh.position.x - a.pos.x))) || 1;
        hit.bump += side * BARREL.bump;
        hit.p.kick = 0.8;
        this.mgr.sound('thunk', hit.p.pos);
        hit.p.say('Egy tünde nyílvessző a hordódba csapódott!', 1.6);
        continue;
      }
      if (sdf(a.pos.x, a.pos.y, a.pos.z) > 0 || (this.path && a.pos.y < this.path.pts[0].y - 3)) {
        a.live = 0;
        continue;
      }
      tmp.copy(a.vel).normalize();
      tmpQ.setFromUnitVectors(Z, tmp);
      tmpM.compose(a.pos, tmpQ, ONE);
      this.arrowMesh.setMatrixAt(m++, tmpM);
    }
    this.arrowMesh.count = m;
    this.arrowMesh.visible = m > 0;
    if (m) this.arrowMesh.instanceMatrix.needsUpdate = true;
  }

  /** A barrel for the shader warm-up (game.warmPrograms at start). */
  warmMeshes() {
    return [new THREE.Mesh(barrelGeometry(), this.material)];
  }

  /** A save mid-ride: nobody is put back into a barrel (the riders wake up at the trapdoor). */
  abort() {
    for (const rd of [...this.riders]) {
      this.game.scene.remove(rd.mesh);
      rd.p.barrel = false;
      rd.p.fade = 0;
    }
    this.riders = [];
  }
}
