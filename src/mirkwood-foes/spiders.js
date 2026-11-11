/* ==== mirkwood-foes/spiders.js — the giant spiders' behaviour (book ch. 8 "Flies and Spiders"; the film): they lurk on
   draglines above their nests and drop on a player passing below, crawl between the patrol points, notice a player by
   sight in the dark (and the noise of digging), rear up hissing, run at him and bind him in silk (normal mode: the
   cocoon, see index.js — never death). Drive-off as the goblins (enemies/combat.js hits every registered foe): the pick,
   Sting, thrown stones (Bilbo's stones, as in the book), Kíli's arrows, Thorin's harder blow, Bombur's charge; a
   strong light keeps them back. The Ring's wearer is not seen (book: that is how Bilbo fights them). Bilbo's taunt
   (the book's "Attercop" songs) draws them to the spot he shouted from. ==== */
import * as THREE from 'three';
import { raycast, sdf } from '../world.js';
import { SpiderBody } from './spider-body.js';

export const SPIDER = {
  maxActive: 5,
  radius: 0.45,
  bodyH: 0.55, // the collision sphere's height above the floor point
  gravity: 18,
  climb: 2.6,
  speed: { patrol: 1.1, chase: 3.1, flee: 4.2, taunt: 2.6 },
  sight: 11, // they see in the dark (a lamp is seen from further)
  sightLamp: 15,
  noise: 13,
  noiseBilbo: 7,
  scare: 4.2, // a strong light (lightPower ≥ 2): no closer than this
  drop: 5, // a lurking spider drops on a player within this horizontal distance below it
  wrapReach: 1.35,
  wrapTime: 1.4, // seconds of wrapping before the cocoon closes
  despawn: 45,
  taunt: 26, // Bilbo's taunt reaches spiders within this distance
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DIRS = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if ((x || y || z) && Math.abs(x) + Math.abs(y) + Math.abs(z) !== 2) DIRS.push(new THREE.Vector3(x, y, z).normalize());

let nextId = 1;

export class Spider {
  /**
   * @param mgr the MirkwoodFoes manager
   * @param look a SPIDER_LOOKS entry
   * @param pos the floor point (patrol) or the hanging point (lurk)
   * @param lurk true: hangs on a dragline from `ceiling`
   */
  constructor(mgr, look, pos, lurk = false, ceiling = null) {
    this.id = nextId++;
    this.mgr = mgr;
    this.game = mgr.game;
    this.scale = 0.85 + Math.random() * 0.3;
    this.body = new SpiderBody(look, this.scale);
    this.group = this.body.group;
    this.pos = new THREE.Vector3().copy(pos);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.home = this.pos.clone();
    this.state = lurk ? 'lurk' : 'patrol';
    this.t = 0;
    this.target = null;
    this.way = null;
    this.ceiling = ceiling ? ceiling.clone() : null;
    this.grounded = !lurk;
    this.fleeFrom = new THREE.Vector3();
    this.fleeT = 0;
    this.scanT = Math.random() * 0.3;
    this.lastSeen = 0;
    this.stuckT = 0;
    this.sideT = 0;
    this.side = 1;
    this.lastPos = this.pos.clone();
    this.tauntAt = null;
    this.tauntT = 0;
    this.hissT = 0;
    // The combat's hit capsule (enemies/index.js foeTouches): low and wide.
    this.hitY0 = 0.2 * this.scale;
    this.hitY1 = 0.9 * this.scale;
    this.hitR = 0.45 * this.scale;
    this.stingGlow = true; // Sting glows near spiders too
    this.game.scene.add(this.group);
    this.sync(0);
  }

  dispose() {
    this.game.scene.remove(this.group);
    if (this.wrapping) this.mgr.releaseWrap(this.wrapping, false);
    this.body.dispose();
  }

  set(state, t = 0) {
    this.state = state;
    this.t = t;
  }

  centre(out) {
    return out.set(this.pos.x, this.pos.y + SPIDER.bodyH * this.scale, this.pos.z);
  }

  /* ---------------- perception ---------------- */

  notices(p) {
    if (!this.mgr.canTarget(p)) return false;
    const d = this.pos.distanceTo(p.pos);
    const noisy = this.game.enemies?.noiseT?.[p.slot] > 0;
    if (noisy && d < (p.ch.id === 'bilbo' ? SPIDER.noiseBilbo : SPIDER.noise) * (p.xpK?.hear ?? 1)) return true; // NOTES-41-xp: Lopakodás
    const sight = p.depth > 1 ? SPIDER.sightLamp : SPIDER.sight;
    if (d > sight) return false;
    this.centre(tmp).y += 0.25;
    p.eye(tmp2);
    const dir = tmp2.sub(tmp);
    const len = dir.length();
    dir.multiplyScalar(1 / len);
    return raycast(tmp, dir, len - 0.3) < 0;
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.t += dt;
    this.hissT = Math.max(0, this.hissT - dt);
    const mgr = this.mgr;
    const pose = this.body.pose;
    let want = null;
    let speed = 0;
    pose.strike = Math.max(0, pose.strike - dt * 2);
    pose.fangs = Math.max(0, pose.fangs - dt);
    pose.tumble *= Math.max(0, 1 - dt * 3);
    let curl = 0;
    this.scanT -= dt;
    const scan = this.scanT <= 0;
    if (scan) this.scanT = 0.25;
    this.tauntT = Math.max(0, this.tauntT - dt);

    switch (this.state) {
      case 'lurk': {
        // Hanging on its dragline above the nest, legs drawn in, slowly turning.
        curl = 0.85;
        this.vel.set(0, 0, 0);
        this.yaw += dt * 0.2 * Math.sin(this.t * 0.3 + this.id);
        if (scan) {
          for (const p of this.game.players) {
            if (!mgr.canTarget(p) || p.pos.y > this.pos.y) continue;
            if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < SPIDER.drop && this.notices(p)) {
              this.target = p;
              this.set('drop');
              mgr.sound('hiss', this.pos);
              break;
            }
          }
          if (this.tauntT > 0) this.set('drop');
        }
        this.sync(dt, curl);
        return;
      }
      case 'drop': {
        // Down the dragline: falling, legs unfolding before it lands.
        curl = Math.max(0, 0.85 - this.t * 1.5);
        this.vel.x = 0;
        this.vel.z = 0;
        this.vel.y -= SPIDER.gravity * dt;
        this.pos.addScaledVector(this.vel, dt);
        this.collide();
        if (this.target) this.face(this.target.pos, dt * 6);
        if (this.grounded) {
          this.body.plant();
          if (this.tauntT > 0 && !this.target) this.set('taunted');
          else this.set(this.target ? 'alert' : 'patrol');
          mgr.sound('skitter', this.pos);
        }
        this.sync(dt, curl);
        return;
      }
      case 'patrol': {
        if (!this.way || this.pos.distanceTo(this.way) < 0.9 || this.t > 10) {
          this.way = mgr.spiderWaypoint(this);
          this.t = 0;
        }
        want = this.way;
        speed = SPIDER.speed.patrol;
        if (this.tauntT > 0) {
          this.set('taunted');
          break;
        }
        if (scan) {
          for (const p of this.game.players) {
            if (this.notices(p)) {
              this.target = p;
              this.set('alert');
              mgr.sound('hiss', this.pos);
              break;
            }
          }
        }
        break;
      }
      case 'taunted': {
        // Drawn to where Bilbo shouted his taunts from (they cannot see him if he wears the Ring).
        want = this.tauntAt;
        speed = SPIDER.speed.taunt;
        if (scan) {
          const p = this.game.players.find((q) => this.notices(q));
          if (p) {
            this.target = p;
            this.set('alert');
            break;
          }
        }
        if (!this.tauntAt || this.pos.distanceTo(this.tauntAt) < 1.4 || this.t > 14) {
          // Nothing there: it casts about, then patrols again.
          this.tauntAt = null;
          this.set('patrol');
          this.home.copy(this.pos);
        }
        break;
      }
      case 'alert': {
        // Rears up hissing, front legs raised.
        pose.strike = Math.min(1, pose.strike + dt * 6);
        pose.fangs = 1;
        if (this.target) this.face(this.target.pos, dt * 8);
        if (this.t > 0.7) this.set('chase');
        break;
      }
      case 'chase': {
        const p = this.target;
        if (!p || !mgr.canTarget(p)) {
          this.target = null;
          this.set('patrol');
          break;
        }
        if (scan) {
          if (this.notices(p)) this.lastSeen = 0;
          else this.lastSeen += 0.25;
        }
        const d = this.pos.distanceTo(p.pos);
        if (mgr.lightPower(p) >= 2 && d < SPIDER.scare) {
          this.flee(p.pos, 2.5);
          break;
        }
        if (this.lastSeen > 5 || d > 32) {
          this.target = null;
          this.set('patrol');
          break;
        }
        want = p.pos;
        speed = SPIDER.speed.chase;
        pose.fangs = Math.max(pose.fangs, 0.5);
        if (d < 2.4) pose.strike = Math.max(pose.strike, 1 - (d - 1.2) / 1.2);
        if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < SPIDER.wrapReach * this.scale && Math.abs(p.pos.y - this.pos.y) < 1.4 && mgr.canWrap(p)) {
          mgr.startWrap(this, p);
          this.set('wrap');
        }
        if (this.hissT <= 0 && Math.random() < dt * 0.4) {
          this.hissT = 3;
          mgr.sound('hiss', this.pos);
        }
        break;
      }
      case 'wrap': {
        // Over the caught player, spinning silk round him (index.js closes the cocoon or lets go).
        const p = this.wrapping;
        pose.strike = 0.6 + 0.2 * Math.sin(this.t * 12);
        pose.fangs = 1;
        if (!p) {
          this.set('patrol');
          break;
        }
        this.face(p.pos, dt * 10);
        tmp.set(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z);
        if (tmp.lengthSq() > 1e-4) {
          tmp.normalize();
          this.pos.x += (p.pos.x + tmp.x * 1.05 * this.scale - this.pos.x) * Math.min(1, dt * 6);
          this.pos.z += (p.pos.z + tmp.z * 1.05 * this.scale - this.pos.z) * Math.min(1, dt * 6);
        }
        this.vel.set(0, Math.min(0, this.vel.y), 0);
        break;
      }
      case 'stunned': {
        curl = Math.max(0, 0.7 - this.t);
        pose.tumble = Math.min(0.9, pose.tumble + dt * 5) * (this.t < 0.35 ? 1 : 0.7);
        if (this.t > 0.7) this.set('flee');
        break;
      }
      case 'flee': {
        this.fleeT -= dt;
        tmp.copy(this.pos).sub(this.fleeFrom);
        tmp.y = 0;
        if (tmp.lengthSq() < 0.01) tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        tmp.normalize().multiplyScalar(6).add(this.pos);
        want = tmp;
        speed = SPIDER.speed.flee;
        if (this.fleeT <= 0) {
          this.target = null;
          if (this.scared && !mgr.seen(this)) this.set('gone');
          else this.set('patrol');
        }
        break;
      }
      default:
        break;
    }
    if (this.state !== 'wrap') this.move(want, speed, dt);
    else {
      this.vel.y -= SPIDER.gravity * dt;
      this.pos.y += this.vel.y * dt;
      this.collide();
    }
    this.sync(dt, curl);
  }

  face(p, k) {
    const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, k);
  }

  /** Steering (as the goblins): walk to `want`, sidestep when stuck, climb walls towards a higher goal. */
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
      if (wx || wz) this.face({ x: this.pos.x + wx, z: this.pos.z + wz }, dt * 6);
    }
    // Spiders move where they face (a slight lag on turns looks heavy and leggy).
    const a = this.grounded ? 8 : 2;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, a * dt);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, a * dt);
    this.vel.y -= SPIDER.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
    const push = this.collide();
    if (want && push.lengthSq() > 1e-6 && want.y > this.pos.y + 0.6 && push.x * wx + push.z * wz < -0.002) {
      this.vel.y = Math.max(this.vel.y, SPIDER.climb);
    }
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = this.pos.distanceTo(this.lastPos);
      if (want && speed > 0 && moved < 0.35) {
        this.sideT = 1.1;
        this.side = Math.random() < 0.5 ? -1 : 1;
        if (this.state === 'patrol') this.way = null;
        if (this.grounded) this.vel.y = 4;
      }
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
    }
    // Keep off the players' bodies (only the wrap touches).
    for (const p of this.game.players) {
      if (p.dead > 0 || p.choosing) continue;
      const dx = this.pos.x - p.pos.x;
      const dz = this.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const min = 0.9 * this.scale;
      if (d < min && d > 1e-4 && Math.abs(p.pos.y - this.pos.y) < 1.4) {
        this.pos.x += (dx / d) * (min - d);
        this.pos.z += (dz / d) * (min - d);
      }
    }
  }

  /** One body sphere against the density field (solid side only); returns the push. */
  collide() {
    this.grounded = false;
    const r = SPIDER.radius * this.scale;
    const h = SPIDER.bodyH * this.scale;
    const total = tmp2.set(0, 0, 0);
    for (let iter = 0; iter < 3; iter++) {
      tmp.set(0, 0, 0);
      let hits = 0;
      for (const d of DIRS) {
        const depth = sdf(this.pos.x + d.x * r, this.pos.y + h + d.y * r, this.pos.z + d.z * r);
        if (depth <= 0) continue;
        tmp.addScaledVector(d, -(depth + 0.004));
        hits++;
      }
      // The legs hold the body up: the floor point is under the feet, not under the sphere.
      const below = sdf(this.pos.x, this.pos.y - 0.02, this.pos.z);
      if (below > 0) {
        tmp.y += below + 0.004;
        hits++;
        this.grounded = true;
      }
      if (!hits) break;
      tmp.multiplyScalar(1 / Math.sqrt(hits));
      this.pos.add(tmp);
      total.add(tmp);
      const n = tmp.normalize();
      const vn = this.vel.dot(n);
      if (vn < 0) this.vel.addScaledVector(n, -vn);
    }
    if (!this.grounded && this.vel.y <= 0.01 && sdf(this.pos.x, this.pos.y - 0.08, this.pos.z) > 0) this.grounded = true;
    return total;
  }

  /* ---------------- actions ---------------- */

  flee(from, t) {
    this.fleeFrom.copy(from);
    this.fleeT = t;
    this.set('flee');
  }

  /** Hit by a player (enemies/combat.js): knocked back, rolls over, lets go of a player it is wrapping, runs. */
  hit(fromX, fromZ, power, kind) {
    const mgr = this.mgr;
    if (this.state === 'lurk' || this.state === 'drop') {
      // Knocked off its line.
      this.state = 'drop';
    }
    tmp.set(this.pos.x - fromX, 0, this.pos.z - fromZ);
    if (tmp.lengthSq() < 1e-4) tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    tmp.normalize();
    // Heavier than a goblin: a smaller shove.
    this.vel.x = tmp.x * 3.4 * power;
    this.vel.z = tmp.z * 3.4 * power;
    this.vel.y = 1.8 + power * 0.8;
    if (this.wrapping) mgr.releaseWrap(this.wrapping, true);
    this.scared = power >= 1.5 || kind === 'arrow';
    this.body.pose.tumble = 0.35;
    this.fleeFrom.set(fromX, this.pos.y, fromZ);
    this.fleeT = 3.5 + 3.5 * power + (kind === 'arrow' ? 5 : 0);
    this.target = null;
    this.set('stunned');
    mgr.sound('hiss', this.pos);
    this.game.journal?.mark?.('pok'); // NOTES-16-smaug-talk: a spider fought (Smaug's talk: "the stinging fly")
  }

  /** Bilbo's taunt: come to that spot. */
  taunt(at) {
    if (this.state === 'wrap' || this.state === 'stunned' || this.state === 'flee') return;
    this.tauntAt = at.clone();
    this.tauntT = 1.5;
    if (this.state !== 'lurk' && this.state !== 'drop') this.set('taunted');
  }

  /** Body placement and the gait. */
  sync(dt, curl = 0) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const pose = this.body.pose;
    pose.curl += (curl - pose.curl) * Math.min(1, dt * 6);
    this.body.animate({ dt, speed: Math.hypot(this.vel.x, this.vel.z), vx: this.vel.x, vz: this.vel.z, grounded: this.grounded && this.state !== 'lurk' });
  }

  /** The dragline's top while lurking or dropping (or null). */
  threadTop() {
    return this.state === 'lurk' || this.state === 'drop' ? this.ceiling : null;
  }
}

export { UP };
