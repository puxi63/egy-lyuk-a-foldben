/* ==== enemies/goblins.js — the goblins (TERV 0.3 / 0.4 Harc / 0.6 / d): simple steering agents that patrol, notice a
   player (the lamp's light and the noise of digging), screech, run at him and grab. Normal mode: a grab never kills;
   the goblin holds the player a moment, rips one find out of the bag and shoves him away, then runs off with it (hit
   it to make it drop the find). Hits make them tumble and flee. The bodies are the baked goblins (goblin-body.js),
   one skinned mesh each with a shared material, culled per view by the terrain's chunk visibility. ==== */
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { raycast, sdf } from '../world.js';
import { armourOf } from './armour.js';
import { GOBLIN_LOOKS, GoblinBody } from './goblin-body.js';
import { chunkKey } from './sites.js';
import { lifeOf } from '../modes/rules.js'; // modes (NOTES-15-modes): Kihívás armour tier 3 "több életerő"

/** Tuning (metres, seconds, metres per second). */
export const GOBLIN = {
  maxActive: 6,
  radius: 0.28,
  spheres: [0.32, 0.9],
  gravity: 18,
  climb: 2.4,
  speed: { patrol: 1.3, chase: 3.3, flee: 4.3, loot: 3.5 },
  sight: 8, // seen by the lamp's light (line of sight)
  sightBright: 11, // a strong light (lightPower ≥ 2) is seen from further…
  scare: 3.5, // …but goblins will not come closer to it than this
  noise: 15, // digging is heard through the rock
  noiseBilbo: 8, // Bilbo digs quietly (TERV 0.3)
  grabReach: 0.9,
  hold: 1.8, // seconds a goblin holds the player before it steals
  struggle: 5, // dig-button presses that shake a goblin off
  shove: 6.5, // knockback speed of the shove
  despawn: 42, // gone when this far from every player (and not seen)
  lootEscape: 28, // a looter this far from every player is gone with the find
  challengeHarm: 22, // Kihívás mode only: plate points a grab takes (× the armour's `hurt`)
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const DIRS = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if ((x || y || z) && Math.abs(x) + Math.abs(y) + Math.abs(z) !== 2) DIRS.push(new THREE.Vector3(x, y, z).normalize());

let nextId = 1;

/** One goblin agent. */
export class Goblin {
  constructor(mgr, look, x, y, z) {
    this.id = nextId++;
    this.mgr = mgr;
    this.game = mgr.game;
    this.body = new GoblinBody(look);
    this.group = this.body.group;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'patrol';
    this.t = 0; // time in the state
    this.target = null; // the player it is after
    this.home = this.pos.clone();
    this.way = null; // patrol waypoint
    this.loot = null; // a stolen find type
    this.held = null; // the player it holds
    this.fleeFrom = new THREE.Vector3();
    this.fleeT = 0;
    this.scanT = Math.random() * 0.25;
    this.lastSeen = 0;
    this.grounded = false;
    this.stuckT = 0;
    this.sideT = 0;
    this.side = 1;
    this.lastPos = this.pos.clone();
    this.scale = 0.9 + Math.random() * 0.2;
    this.group.scale.setScalar(this.scale);
    this.hearT = 0;
    this.raider = false;
    this.screech = 0;
    this.game.scene.add(this.group);
    this.sync(0);
  }

  dispose() {
    this.game.scene.remove(this.group);
    if (this.held) this.release();
    // The geometry and material are shared; the skeleton's bone texture is this goblin's own.
    this.body.mesh?.skeleton?.dispose();
  }

  set(state, t = 0) {
    this.state = state;
    this.t = t;
  }

  /** Centre of the body (for hits and distances). */
  centre(out) {
    return out.set(this.pos.x, this.pos.y + 0.7 * this.scale, this.pos.z);
  }

  /* ---------------- perception ---------------- */

  /** Whether this goblin notices player p now: the lamp seen in line of sight, or the digging heard. */
  notices(p) {
    if (!this.mgr.canTarget(p)) return false;
    const d = this.pos.distanceTo(p.pos);
    const light = this.mgr.lightPower(p);
    const noisy = this.mgr.noiseT[p.slot] > 0;
    const hear = (p.ch.id === 'bilbo' ? GOBLIN.noiseBilbo : GOBLIN.noise) * (p.xpK?.hear ?? 1); // NOTES-41-xp: Lopakodás
    if (noisy && d < hear) return true;
    const sight = light >= 2 ? GOBLIN.sightBright : GOBLIN.sight;
    if (d > sight) return false;
    // Line of sight from the goblin's eyes to the player's head.
    this.centre(tmp).y += 0.4;
    p.eye(tmp2);
    const dir = tmp2.sub(tmp);
    const len = dir.length();
    dir.multiplyScalar(1 / len);
    return raycast(tmp, dir, len - 0.3) < 0;
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.t += dt;
    this.screech = Math.max(0, this.screech - dt);
    const mgr = this.mgr;
    let want = null; // where to go
    let speed = 0;
    const pose = this.body.pose;
    pose.reach = 0;
    pose.flail = Math.max(0, pose.flail - dt * 2);
    pose.carry = this.loot ? 1 : 0;
    pose.tumble *= Math.max(0, 1 - dt * 3);
    this.scanT -= dt;
    const scan = this.scanT <= 0;
    if (scan) this.scanT = 0.25;

    switch (this.state) {
      case 'patrol': {
        if (!this.way || this.pos.distanceTo(this.way) < 0.8 || this.t > 9) {
          this.way = mgr.waypoint(this);
          this.t = 0;
        }
        want = this.way;
        speed = GOBLIN.speed.patrol;
        if (scan) {
          for (const p of this.game.players) {
            if (this.notices(p)) {
              this.target = p;
              this.set('alert');
              this.screech = 0.6;
              mgr.sound('screech', this.pos);
              break;
            }
          }
        }
        break;
      }
      case 'alert': {
        // A hop and a screech, facing the player, then the rush.
        const p = this.target;
        if (p) this.face(p.pos, dt * 10);
        if (this.t < 0.1 && this.grounded) this.vel.y = 3.2;
        if (this.t > 0.55) this.set('chase');
        break;
      }
      case 'chase': {
        const p = this.target;
        if (!p || !mgr.canTarget(p)) {
          this.set('patrol');
          break;
        }
        if (scan) {
          if (this.notices(p)) this.lastSeen = 0;
          else this.lastSeen += 0.25;
        }
        // Strong light: it will not come closer, it backs off.
        const d = this.pos.distanceTo(p.pos);
        if (mgr.lightPower(p) >= 2 && d < GOBLIN.scare) {
          this.flee(p.pos, 2.5);
          break;
        }
        if (this.lastSeen > 4 || d > 30) {
          this.set('patrol');
          this.target = null;
          break;
        }
        want = p.pos;
        speed = GOBLIN.speed.chase;
        const dy = p.pos.y - this.pos.y;
        if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < GOBLIN.grabReach && Math.abs(dy) < 1.3 && !p.held && mgr.canGrab(p)) this.grab(p);
        else pose.reach = Math.max(0, 1 - (d - 0.8) / 1.5);
        break;
      }
      case 'grab': {
        const p = this.held;
        pose.reach = 1;
        // Putting the Ring on slips out of its grip (it cannot see him any more).
        if (!p || p.dead > 0 || p.riding || this.game.gollum?.isInvisible(p)) {
          this.release();
          this.set('patrol');
          break;
        }
        this.face(p.pos, dt * 12);
        // Hold at arm's length in front of the player (not in his face); the view shakes.
        tmp.set(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z);
        if (tmp.lengthSq() > 1e-4) {
          tmp.normalize();
          this.pos.x = p.pos.x + tmp.x * 0.85;
          this.pos.z = p.pos.z + tmp.z * 0.85;
        }
        p.vel.set(0, Math.min(0, p.vel.y), 0);
        if (Math.floor(this.t * 6) !== Math.floor((this.t - dt) * 6)) p.kick = Math.max(p.kick || 0, 0.45);
        if (this.t >= GOBLIN.hold) this.steal(p);
        break;
      }
      case 'stunned': {
        pose.tumble = Math.min(1.2, pose.tumble + dt * 6) * (this.t < 0.35 ? 1 : 0.8);
        if (this.t > 0.6) this.set('flee');
        break;
      }
      case 'flee': {
        pose.flail = 1;
        this.fleeT -= dt;
        // Away from what scared it; a looter makes for the furthest point from the players.
        tmp.copy(this.pos).sub(this.fleeFrom);
        tmp.y = 0;
        if (tmp.lengthSq() < 0.01) tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        tmp.normalize().multiplyScalar(6).add(this.pos);
        want = tmp;
        speed = this.loot ? GOBLIN.speed.loot : GOBLIN.speed.flee;
        if (this.loot) {
          const far = mgr.farFromPlayers(this.pos, GOBLIN.lootEscape);
          if (far || this.t > 25) {
            mgr.lootLost(this);
            this.set('gone');
          }
        } else if (this.fleeT <= 0) {
          this.target = null;
          // Badly scared (Sting, an arrow, Bombur's charge): it slinks off for good once nobody sees it.
          if (this.scared && !mgr.seen(this)) this.set('gone');
          else this.set('patrol');
        }
        break;
      }
      default:
        break;
    }

    if (this.state !== 'grab') this.move(want, speed, dt);
    this.sync(dt);
  }

  /** Turns towards a point (smoothly). */
  face(p, k) {
    const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, k);
  }

  /** Steering: walk to `want` at `speed`, sidestep when stuck, scramble up walls towards a higher goal. */
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
        // Stuck: walk sideways along the obstacle for a moment.
        this.sideT -= dt;
        const sx = -wz * this.side;
        const sz = wx * this.side;
        wx = wx * 0.3 + sx;
        wz = wz * 0.3 + sz;
      }
      if (wx || wz) this.face({ x: this.pos.x + wx, z: this.pos.z + wz }, dt * 8);
    }
    const a = this.grounded ? 12 : 3;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, a * dt);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, a * dt);
    this.vel.y -= GOBLIN.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
    const push = this.collide();
    // Pressed against a wall on the way to a higher goal: climb (goblins scramble up rock like spiders).
    if (want && push.lengthSq() > 1e-6 && want.y > this.pos.y + 0.6 && (push.x * wx + push.z * wz) < -0.002) {
      this.vel.y = Math.max(this.vel.y, GOBLIN.climb);
    }
    // Stuck detection.
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = this.pos.distanceTo(this.lastPos);
      if (want && speed > 0 && moved < 0.35) {
        this.sideT = 1.0;
        this.side = Math.random() < 0.5 ? -1 : 1;
        if (this.state === 'patrol') this.way = null;
        if (this.grounded) this.vel.y = 4.2;
      }
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
    }
    // Keep away from the players' bodies (a grab is the only contact).
    for (const p of this.game.players) {
      if (p.dead > 0 || p.choosing) continue;
      const dx = this.pos.x - p.pos.x;
      const dz = this.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5 && d > 1e-4 && Math.abs(p.pos.y - this.pos.y) < 1.4) {
        this.pos.x += (dx / d) * (0.5 - d);
        this.pos.z += (dz / d) * (0.5 - d);
      }
    }
  }

  /** Pushes the two body spheres out of the soil (solid side only, like the player); returns the summed push. */
  collide() {
    this.grounded = false;
    const r = GOBLIN.radius;
    const total = tmp2.set(0, 0, 0);
    for (let iter = 0; iter < 3; iter++) {
      tmp.set(0, 0, 0);
      let hits = 0;
      for (const h of GOBLIN.spheres) {
        const cy = this.pos.y + h;
        for (const d of DIRS) {
          const depth = sdf(this.pos.x + d.x * r, cy + d.y * r, this.pos.z + d.z * r);
          if (depth <= 0) continue;
          tmp.addScaledVector(d, -(depth + 0.004));
          hits++;
          if (h === GOBLIN.spheres[0] && d.y < -0.6) this.grounded = true;
        }
      }
      if (!hits) break;
      tmp.multiplyScalar(1 / Math.sqrt(hits));
      this.pos.add(tmp);
      total.add(tmp);
      const n = tmp.normalize();
      const vn = this.vel.dot(n);
      if (vn < 0) this.vel.addScaledVector(n, -vn);
    }
    if (!this.grounded && this.vel.y <= 0.01 && sdf(this.pos.x, this.pos.y + GOBLIN.spheres[0] - r - 0.05, this.pos.z) > 0) this.grounded = true;
    return total;
  }

  /* ---------------- actions ---------------- */

  grab(p) {
    this.held = p;
    p.held = this;
    p.struggle = 0;
    this.set('grab');
    this.mgr.sound('grab', this.pos);
    this.mgr.onGrab(this, p);
  }

  /** Lets go of the held player (a hit, the player shook it off, or it stole). */
  release() {
    const p = this.held;
    if (p && p.held === this) p.held = null;
    this.held = null;
  }

  /** The end of a grab: one find out of the bag (unless the armour stops the hand), the shove, the flight. */
  steal(p) {
    const mgr = this.mgr;
    const arm = armourOf(p);
    let took = null;
    // Kihívás mód (TERV 0.6 / 0.11/5, NOTES-12-events): a grab also hurts — the plate is the health, as for the falls
    // (safety/, NOTES-11-safety); an empty plate kills (die() drops the bag in a sack, so nothing is stolen then).
    if (mgr.challenge) {
      p.hunger = Math.max(0, p.hunger - GOBLIN.challengeHarm * (arm.hurt ?? 1) / lifeOf(p)); // lifeOf: modes (NOTES-15-modes)
      p.kick = Math.max(p.kick || 0, 1);
      if (p.hunger <= 0) {
        this.release();
        p.die('Egy goblin végzett veled…');
        this.flee(p.pos, 6);
        mgr.sound('cackle', this.pos);
        return;
      }
      p.say('A goblin megsebzett! (Kihívás mód)', 2.5);
    }
    if (p.bag.length > 0 && Math.random() < arm.steal) {
      const i = Math.floor(Math.random() * p.bag.length);
      took = p.bag.splice(i, 1)[0];
    }
    this.release();
    tmp.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    if (tmp.lengthSq() < 1e-4) tmp.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    tmp.normalize();
    p.knock(tmp.x, tmp.z, GOBLIN.shove);
    if (took) {
      this.setLoot(took);
      p.say(`Egy goblin elvitte: ${took.name}! Üsd meg vagy dobd meg, és elejti.`, 4.5);
    } else if (p.bag.length === 0) p.say('Üres a zsákod: a goblin dühösen ellökött.', 3);
    else p.say('A goblin a zsákodba markolt, de a páncélod megvédett.', 3.5);
    // A moment's grace: the next goblin cannot grab the victim at once.
    p.graceT = 2.5;
    this.flee(p.pos, took ? 30 : 4);
    mgr.sound('cackle', this.pos);
  }

  setLoot(type) {
    this.loot = type;
    this.body.loot.clear();
    if (type) {
      const m = new THREE.Mesh(this.game.finds.geo.get(type.id), this.game.finds.mat.get(type.id));
      m.layers.mask = this.group.layers.mask;
      this.body.loot.add(m);
    }
  }

  /** Runs away from a point for `t` seconds. */
  flee(from, t) {
    this.fleeFrom.copy(from);
    this.fleeT = t;
    this.set('flee');
  }

  /**
   * Hit by a player (pick, Sting, stone, arrow, Bombur's charge): knocked back, tumbles, drops any loot, lets go of a
   * held player and flees. power 1 = the pick; flee seconds grow with it.
   */
  hit(fromX, fromZ, power, kind) {
    const mgr = this.mgr;
    tmp.set(this.pos.x - fromX, 0, this.pos.z - fromZ);
    if (tmp.lengthSq() < 1e-4) tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    tmp.normalize();
    this.vel.x = tmp.x * 4.5 * power;
    this.vel.z = tmp.z * 4.5 * power;
    this.vel.y = 2.5 + power;
    if (this.held) {
      const p = this.held;
      this.release();
      p.graceT = 1.5;
      p.say('Kiszabadultál!', 2);
    }
    this.scared = power >= 1.5 || kind === 'arrow';
    if (this.loot) {
      mgr.dropLoot(this);
    }
    this.body.pose.tumble = 0.4;
    this.fleeFrom.set(fromX, this.pos.y, fromZ);
    this.fleeT = 4 + 4 * power + (kind === 'arrow' ? 6 : 0);
    this.set('stunned');
    this.screech = 0.5;
    mgr.sound('yelp', this.pos);
  }

  /** Body placement and pose. */
  sync(dt) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const st = this.state;
    this.body.pose.crouch = st === 'flee' ? 0.6 : 1;
    this.body.animate({
      dt, speed: Math.hypot(this.vel.x, this.vel.z), vy: this.vel.y, grounded: this.grounded, climbing: !this.grounded && this.vel.y > 0.5,
      swing: 0, pitch: st === 'alert' ? 0.4 : 0, walk: 3.0, fill: 0,
    });
  }
}

/** Picks one of the goblin looks at random. */
export function randomLook() {
  return GOBLIN_LOOKS[Math.floor(Math.random() * GOBLIN_LOOKS.length)];
}

export { PLAYER };
