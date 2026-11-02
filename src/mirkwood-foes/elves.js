/* ==== mirkwood-foes/elves.js — the Elvenking's guards (book ch. 9 "Barrels out of Bond": the wood-elves seize the
   dwarves and shut them in the king's dungeon; the film's guards in green and gold). They walk the halls between the
   provider's patrol points, notice a player by his lamp in line of sight (the Ring's wearer is not seen), call out and
   come at him; one that reaches him seizes him (index.js: captured, put in a cell, the bag confiscated — normal mode
   never kills). A hit (pick, stone, arrow, charge, Sting) staggers a guard for a moment; it does not run away like a
   goblin, it comes back. In the barrel scene some stand on the river banks as archers (index.js / barrels.js). ==== */
import * as THREE from 'three';
import { raycast, sdf } from '../world.js';
import { ElfBody } from './elf-body.js';

export const ELF = {
  maxActive: 3,
  radius: 0.3,
  spheres: [0.35, 1.0, 1.55],
  gravity: 18,
  speed: { patrol: 1.25, chase: 3.25 }, // the player walks 3.6: a guard alone rarely catches a running player
  sight: 13,
  sightNear: 4, // even without a lamp, this close
  catchReach: 1.0,
  stagger: 2.2, // seconds a hit stops a guard
  despawn: 48,
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const DIRS = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if ((x || y || z) && Math.abs(x) + Math.abs(y) + Math.abs(z) !== 2) DIRS.push(new THREE.Vector3(x, y, z).normalize());

/** Lines the guards call out (paraphrased in Hungarian; nothing quoted from the book or the film). */
const CALLS = ['Megállj! Ki jár a király csarnokaiban?', 'Idegen! Fogjátok el!', 'Állj! A király elé viszünk!'];

export class Elf {
  constructor(mgr, look, x, y, z, archer = false) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.body = new ElfBody(look);
    this.group = this.body.group;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.home = this.pos.clone();
    this.state = archer ? 'archer' : 'patrol';
    this.archer = archer;
    this.t = 0;
    this.target = null;
    this.way = null;
    this.grounded = false;
    this.scanT = Math.random() * 0.3;
    this.lastSeen = 0;
    this.stuckT = 0;
    this.sideT = 0;
    this.side = 1;
    this.lastPos = this.pos.clone();
    this.scale = 1;
    this.shootT = 1 + Math.random() * 1.5;
    this.hitY1 = 1.8;
    this.game.scene.add(this.group);
    this.sync(0);
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.body.mesh?.skeleton?.dispose();
  }

  set(state, t = 0) {
    this.state = state;
    this.t = t;
  }

  /** Line of sight to a player whose lamp burns (or who is very close); not the Ring's wearer (canTarget). */
  notices(p) {
    if (!this.mgr.canTarget(p)) return false;
    const d = this.pos.distanceTo(p.pos);
    if (d > ELF.sight) return false;
    tmp.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
    p.eye(tmp2);
    const dir = tmp2.sub(tmp);
    const len = dir.length();
    dir.multiplyScalar(1 / len);
    if (raycast(tmp, dir, len - 0.3) >= 0) return false;
    // In front of it (a guard does not see behind), unless very close.
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return d < ELF.sightNear || (dir.x * fx + dir.z * fz) > -0.2;
  }

  update(dt) {
    this.t += dt;
    const mgr = this.mgr;
    const pose = this.body.pose;
    let want = null;
    let speed = 0;
    pose.reach = Math.max(0, pose.reach - dt * 3);
    pose.stagger *= Math.max(0, 1 - dt * 4);
    pose.draw = Math.max(0, pose.draw - dt * 2);
    let alert = 0;
    this.scanT -= dt;
    const scan = this.scanT <= 0;
    if (scan) this.scanT = 0.3;
    switch (this.state) {
      case 'patrol': {
        if (!this.way || this.pos.distanceTo(this.way) < 0.8 || this.t > 12) {
          this.way = mgr.elfWaypoint(this);
          this.t = 0;
        }
        want = this.way;
        speed = ELF.speed.patrol;
        if (scan) {
          for (const p of this.game.players) {
            if (this.notices(p)) {
              this.target = p;
              this.set('alert');
              mgr.elfCall(this, p, CALLS[Math.floor(Math.random() * CALLS.length)]);
              break;
            }
          }
        }
        break;
      }
      case 'alert': {
        alert = 1;
        if (this.target) this.face(this.target.pos, dt * 8);
        if (this.t > 0.6) this.set('chase');
        break;
      }
      case 'chase': {
        alert = 1;
        const p = this.target;
        if (!p || !mgr.canTarget(p)) {
          this.target = null;
          this.set('patrol');
          break;
        }
        if (scan) {
          if (this.notices(p)) this.lastSeen = 0;
          else this.lastSeen += 0.3;
        }
        const d = this.pos.distanceTo(p.pos);
        if (this.lastSeen > 4 || d > 30) {
          this.target = null;
          this.set('patrol');
          break;
        }
        want = p.pos;
        speed = ELF.speed.chase;
        pose.reach = Math.max(pose.reach, Math.max(0, 1 - (d - 1) / 1.5));
        if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < ELF.catchReach && Math.abs(p.pos.y - this.pos.y) < 1.5 && mgr.canCapture(p)) {
          mgr.capture(this, p);
          this.target = null;
          this.set('patrol', -6); // it takes the prisoner away: a long pause before it patrols again
        }
        break;
      }
      case 'stunned': {
        pose.stagger = Math.min(0.25, pose.stagger + dt * 2);
        if (this.t > ELF.stagger) this.set(this.archer ? 'archer' : this.target ? 'chase' : 'patrol');
        break;
      }
      case 'archer': {
        // On a river bank: watch the barrels and shoot at the riders (barrels.js asks shoot()).
        alert = 0.4;
        const tgt = mgr.barrels?.nearestRider(this.pos, 16);
        if (tgt) {
          this.face(tgt, dt * 6);
          pose.draw = Math.min(1, pose.draw + dt * 4);
          this.shootT -= dt;
          if (this.shootT <= 0) {
            this.shootT = 1.4 + Math.random() * 1.2;
            mgr.barrels.elfShoots(this, tgt);
          }
        }
        break;
      }
      default:
        break;
    }
    if (this.t < 0 && this.state === 'patrol') {
      // Taking a prisoner away: stand still a moment.
      want = null;
      speed = 0;
    }
    pose.alert += (alert - pose.alert) * Math.min(1, dt * 6);
    this.move(want, speed, dt);
    this.sync(dt);
  }

  face(p, k) {
    const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, k);
  }

  move(want, speed, dt) {
    let wx = 0;
    let wz = 0;
    if (want) {
      wx = want.x - this.pos.x;
      wz = want.z - this.pos.z;
      const l = Math.hypot(wx, wz);
      if (l > 0.05) {
        wx /= l;
        wz /= l;
      } else wx = wz = 0;
      if (this.sideT > 0) {
        this.sideT -= dt;
        const sx = -wz * this.side;
        const sz = wx * this.side;
        wx = wx * 0.3 + sx;
        wz = wz * 0.3 + sz;
      }
      if (wx || wz) this.face({ x: this.pos.x + wx, z: this.pos.z + wz }, dt * 8);
    }
    const a = this.grounded ? 10 : 3;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, a * dt);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, a * dt);
    this.vel.y -= ELF.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.collide();
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      if (want && speed > 0 && this.pos.distanceTo(this.lastPos) < 0.35) {
        this.sideT = 1.0;
        this.side = Math.random() < 0.5 ? -1 : 1;
        if (this.state === 'patrol') this.way = null;
        if (this.grounded) this.vel.y = 4.6; // elves leap lightly
      }
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
    }
    for (const p of this.game.players) {
      if (p.dead > 0 || p.choosing) continue;
      const dx = this.pos.x - p.pos.x;
      const dz = this.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.55 && d > 1e-4 && Math.abs(p.pos.y - this.pos.y) < 1.6) {
        this.pos.x += (dx / d) * (0.55 - d);
        this.pos.z += (dz / d) * (0.55 - d);
      }
    }
  }

  collide() {
    this.grounded = false;
    const r = ELF.radius;
    for (let iter = 0; iter < 3; iter++) {
      tmp.set(0, 0, 0);
      let hits = 0;
      for (const h of ELF.spheres) {
        const cy = this.pos.y + h;
        for (const d of DIRS) {
          const depth = sdf(this.pos.x + d.x * r, cy + d.y * r, this.pos.z + d.z * r);
          if (depth <= 0) continue;
          tmp.addScaledVector(d, -(depth + 0.004));
          hits++;
          if (h === ELF.spheres[0] && d.y < -0.6) this.grounded = true;
        }
      }
      if (!hits) break;
      tmp.multiplyScalar(1 / Math.sqrt(hits));
      this.pos.add(tmp);
      const n = tmp.normalize();
      const vn = this.vel.dot(n);
      if (vn < 0) this.vel.addScaledVector(n, -vn);
    }
    if (!this.grounded && this.vel.y <= 0.01 && sdf(this.pos.x, this.pos.y + ELF.spheres[0] - r - 0.05, this.pos.z) > 0) this.grounded = true;
  }

  /** Hit by a player: a stagger, then it comes on again (guards do not flee). */
  hit(fromX, fromZ, power) {
    tmp.set(this.pos.x - fromX, 0, this.pos.z - fromZ);
    if (tmp.lengthSq() < 1e-4) tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    tmp.normalize();
    this.vel.x = tmp.x * 3 * power;
    this.vel.z = tmp.z * 3 * power;
    this.vel.y = 2;
    this.body.pose.stagger = 0.15;
    this.set('stunned', -ELF.stagger * (power - 1) * 0.5);
    this.mgr.sound('thunk', this.pos);
  }

  sync(dt) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.body.animate({
      dt, speed: Math.hypot(this.vel.x, this.vel.z), vy: this.vel.y, grounded: this.grounded, climbing: false,
      swing: 0, pitch: 0, walk: 3.4, fill: 0,
    });
  }
}
