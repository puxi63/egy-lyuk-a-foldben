/* ==== trolls/index.js — the stone trolls of the troll cave wake (TERV layer 3: "ha sötétben ásol, a három troll
   (Bert, Tom, Vilmos) „felébred”") and turn back to stone at dawn (TERV 0.7 "Trollok hajnalban": Gandalf's voice
   calls the dawn). NOTES-24-trolls.

   Canon: The Hobbit ch. 2 — Bert, Tom and William (Vilmos) catch the burglar, quarrel until the dawn comes and turn to
   stone; Gandalf's voice keeps them arguing. In the game they stand as statues in the cave (underground/trolls.js).

   THE WAKING (the noise meter of the cave):
   - every swing that bites the soil inside the cave (or its walls, 3 m around) adds noise, but only when the digger
     has no strong light: `lightPower < TROLL.light` (1 = the hobbit lamp; 2 = the dwarf miner's lamp, or a lamp a
     partner holds up, coop-actions/lamp.js; 3 = Gandalf's staff). Bilbo digs quietly (less noise). The noise ebbs.
   - First a warning (`stirAt`): grinding stone, a troll grumbles, the three statues shake for `stirTime` seconds.
     Stop digging (or bring light) and they settle. Dig on during the warning (`wakeAt`) and the troll nearest to the
     digger shakes loose (`rise`), turns and lumbers at the digger (slower than a walking player). Digging on while
     one is awake wakes the next nearest.
   - A grab (within `reach`): the player is held for `hold` seconds (struggle free with the dig button, as from a
     goblin), then in normal mode the troll takes one find (armour as against goblins) and lumbers home with it; in
     Kihívás (`enemies.challenge`) it hurts instead (plate points, an empty plate kills). Then a shove.
   - Back to stone: in strong light (a player with `lightPower ≥ light` within `freezeNear` m), after `awake` seconds
     (it walks home and settles), at the real dawn of the day clock (game.events 'dawn'), or at Gandalf's "Hajnal!".
     A troll that turns to stone drops a find it took at its feet (enemies' drops: touch it to pick it up). Statues
     left away from their place go back unseen, when nobody is near the cave.
   THE UPGRADE: "Gandalf hangja" at the Green Dragon (one for the party, TROLL.price before perks / co-op): the use key
   in the cave while the trolls stir or are awake calls "Hajnal!": all turn to stone at once and stay stone for
   `dawnCalm` seconds. Saved in the purse's minigame state (minigames/purse.js `tr`).
   THE PURSE: William's purse (minigames/purse.js) crying out wakes Vilmos at once (book: William grabs the burglar),
   and the other two stir.
   Moving the trolls costs no draw call: trolls/pose.js. Wiring: enemies/index.js constructs it (`enemies.trolls`),
   updates it, passes the use key and the bites, adds the counter row. Bench pages are `quiet` (digging does not wake
   them) unless a QA script clears it. ==== */
import * as THREE from 'three';
import { sharedAudio } from '../audio.js';
import { armourOf } from '../enemies/armour.js';
import { keysOf } from '../minigames/common.js';
import { lifeOf } from '../modes/rules.js';
import { TROLL_CAVE } from '../underground/sites.js';
import { TROLL_LINES as L } from './lines.js';
import { TROLL_U } from './pose.js';

/** The numbers of the waking (seconds, metres, plate points). */
export const TROLL = {
  light: 2, // lightPower at or above which a digger does not wake them and an awake troll freezes
  freezeNear: 8, // m: a strong light this close to an awake troll turns it to stone
  zone: 3, // m around the cave's ellipse where digging is heard
  noiseBite: 0.35, // a bite (the picks swing about 3 times a second)
  noiseBilbo: 0.2, // Bilbo digs quietly (TERV 0.3)
  decay: 0.25, // noise per second
  stirAt: 4, // the warning (about 5 s of steady digging; Bilbo about 11 s)
  wakeAt: 6, // a troll wakes (about 2.5 s more digging; only after the warning has run for stirMin)
  stirTime: 6, // s the warning lasts (stop digging and they settle)
  stirMin: 1.2,
  rise: 1.4, // s a woken troll shakes loose before it moves
  speed: 1.4, // m/s (a player walks 3.6)
  turn: 1.8, // rad/s
  reach: 2.1, // m from the troll's feet: its long arms
  hold: 2.0,
  shove: 7,
  harm: 30, // Kihívás: plate points a grab takes (× the armour's `hurt`, ÷ lifeOf)
  awake: 22, // s before it lumbers home
  calm: 20, // s of quiet after they settle
  dawnCalm: 120, // s "Hajnal!" keeps them stone
  sunCalm: 90, // s after the real dawn
  price: 150, // gold, before the perks and the co-op price
  fernR: 2.6, // m: the ferns belonging to a troll (pose.js)
};

const tmpM = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpV = new THREE.Vector3();

/** One stone troll that may wake. */
class Troll {
  constructor(mgr, info) {
    this.mgr = mgr;
    this.isTroll = true;
    this.name = info.name;
    this.i = info.index;
    this.rest = { x: info.x, y: info.y, z: info.z, yaw: info.yaw };
    this.pos = new THREE.Vector3(info.x, info.y, info.z);
    this.yaw = info.yaw;
    this.lean = 0;
    this.roll = 0;
    this.shake = 0;
    this.state = 'stone';
    this.t = 0;
    this.life = 0;
    this.pauseT = 0;
    this.phase = Math.random() * 6;
    this.target = null;
    this.held = null;
    this.loot = null;
    this.displaced = false;
    this.matrix = new THREE.Matrix4();
    this.colliders = (info.colliders || []).map((c) => ({ c, a: [...c.a], b: [...c.b] }));
  }

  get awake() {
    return this.state !== 'stone';
  }

  /** The middle of the body (enemies' dropLoot puts a dropped find here). */
  centre(out) {
    return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
  }

  setLoot(type) {
    this.loot = type;
  }

  /** Lets go of the held player. */
  release() {
    const p = this.held;
    if (p && p.held === this) p.held = null;
    this.held = null;
  }

  /** The held player struggled free (enemies/index.js input calls hit() on whatever holds him). */
  hit() {
    if (!this.held) return;
    const p = this.held;
    this.release();
    p.say(L.struggled(this.name), 2.5);
    this.mgr.sound('grumble', this.pos);
    this.pauseT = 2.5;
    this.state = 'walk';
  }

  /** Composes the pose matrix (rest → now) and the colliders' placement. */
  compose(shakeX, shakeZ) {
    const r = this.rest;
    const m = this.matrix.makeTranslation(-r.x, -r.y, -r.z);
    m.premultiply(tmpR.makeRotationY(-r.yaw));
    m.premultiply(tmpR.makeRotationZ(this.roll));
    m.premultiply(tmpR.makeRotationX(this.lean));
    m.premultiply(tmpR.makeRotationY(this.yaw));
    m.premultiply(tmpR.makeTranslation(this.pos.x + shakeX, this.pos.y, this.pos.z + shakeZ));
    // The colliders follow the walk and the turn only (their height band must not change: decor.js sorts by y).
    tmpM.makeTranslation(-r.x, -r.y, -r.z).premultiply(tmpR.makeRotationY(this.yaw - r.yaw)).premultiply(tmpR.makeTranslation(this.pos.x, this.pos.y, this.pos.z));
    for (const k of this.colliders) {
      tmpV.fromArray(k.a).applyMatrix4(tmpM);
      k.c.a[0] = tmpV.x;
      k.c.a[2] = tmpV.z;
      tmpV.fromArray(k.b).applyMatrix4(tmpM);
      k.c.b[0] = tmpV.x;
      k.c.b[2] = tmpV.z;
      k.c.x = (k.c.a[0] + k.c.b[0]) / 2;
      k.c.z = (k.c.a[2] + k.c.b[2]) / 2;
    }
  }

  /** Back to the old place and pose (unseen). */
  reset() {
    this.pos.set(this.rest.x, this.rest.y, this.rest.z);
    this.yaw = this.rest.yaw;
    this.lean = 0;
    this.roll = 0;
    this.displaced = false;
  }
}

export class Trolls {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.noise = 0;
    this.stage = null; // 'stir' while the warning runs
    this.stirT = 0;
    this.stirE = 0;
    this.calmT = 0;
    this.owned = false; // the "Gandalf hangja" upgrade
    this.quiet = !!game.bench; // bench pages: digging does not wake them (QA clears it)
    this.uniformOn = false;
    this.time = 0;
    this.build();
    game.events?.on?.('dawn', () => this.sunrise());
  }

  build() {
    const info = this.game.decor?.info?.trolls;
    if (!info?.length) return;
    this.list = info.map((t) => new Troll(this, t));
    for (const t of this.list) TROLL_U.uTrollRest.value[t.i].set(t.rest.x, t.rest.y, t.rest.z, TROLL.fernR);
  }

  /* ---------------- queries ---------------- */

  /** Inside the troll cave or its walls (where digging is heard). */
  inCave(pos, margin = TROLL.zone) {
    const c = TROLL_CAVE;
    if (pos.y < c.floor - 3 || pos.y > c.floor + c.domeH + 4) return false;
    const ex = (pos.x - c.x) / (c.rx + margin);
    const ez = (pos.z - c.z) / (c.rz + margin);
    return ex * ex + ez * ez <= 1;
  }

  lightOf(p) {
    return this.game.enemies?.lightPower?.(p) ?? p.lightPower ?? 1;
  }

  /** Players in and around the cave (for the messages). */
  near() {
    return this.game.players.filter((p) => !p.choosing && p.dead <= 0 && this.inCave(p.pos, TROLL.zone + 4));
  }

  get anyAwake() {
    return this.list.some((t) => t.awake);
  }

  /** Whether "Hajnal!" would do something now. */
  get callable() {
    return this.anyAwake || this.stage === 'stir' || this.noise >= 1;
  }

  /* ---------------- events ---------------- */

  /** A swing that bit the soil (enemies.dug from player.tryDig). */
  dug(p) {
    if (this.quiet || !this.list.length || this.calmT > 0 || !this.inCave(p.pos)) return;
    if (this.lightOf(p) >= TROLL.light) return;
    this.noise += p.ch?.id === 'bilbo' ? TROLL.noiseBilbo : TROLL.noiseBite;
    p.trollNoiseT = 1.5;
    const awake = this.anyAwake;
    if (!awake && this.stage !== 'stir' && this.noise >= TROLL.stirAt) this.startStir(p);
    else if (this.noise >= TROLL.wakeAt && ((this.stage === 'stir' && this.stirE >= TROLL.stirMin) || awake)) {
      const t = this.nearestStone(p.pos);
      if (t) this.wake(t, p);
      this.noise = TROLL.stirAt;
    }
  }

  /** The warning: grinding stone, a grumble, the statues shake. */
  startStir(digger) {
    this.stage = 'stir';
    this.stirT = TROLL.stirTime;
    this.stirE = 0;
    const t = this.nearestStone(digger.pos) || this.list[0];
    this.sound('grind', t.pos);
    this.sound('grumble', t.pos);
    this.game.players.forEach((q, i) => {
      if (!this.near().includes(q)) return;
      const hint = this.owned ? ` ${L.callHint(keysOf(this.game, i).use)}` : '';
      q.say(q === digger ? `${L.stirDigger(t.name)}${hint}` : `${L.stirOther(t.name)}${hint}`, 5);
    });
  }

  /** A troll wakes and goes for player p. */
  wake(t, p, why = 'dig') {
    if (t.awake) return;
    t.state = 'rise';
    t.t = 0;
    t.life = TROLL.awake;
    t.target = p;
    t.displaced = true;
    t.pauseT = 0;
    this.calmT = 0;
    this.sound('grind', t.pos);
    this.sound('grumble', t.pos);
    this.game.players.forEach((q, i) => {
      if (!this.near().includes(q)) return;
      const hint = this.owned ? ` ${L.callHint(keysOf(this.game, i).use)}` : ` ${L.lightHint}`;
      if (why === 'purse') q.say(q === p ? L.purseWake(t.name) : L.wakeOther(t.name), 4.5);
      else q.say(`${q === p ? L.wakeDigger(t.name) : L.wakeOther(t.name)}${hint}`, 5);
    });
  }

  /** William's purse cried out (minigames/purse.js): Vilmos wakes at once, the other two stir. */
  wakeByPurse(thief) {
    if (!this.list.length) return;
    const v = this.list.find((t) => t.name === 'Vilmos') || this.list[0];
    if (!v.awake) this.wake(v, thief, 'purse');
    this.stage = 'stir';
    this.stirT = TROLL.stirTime;
    this.stirE = TROLL.stirMin;
  }

  /** A troll turns (back) to stone where it stands; a find it took falls at its feet. */
  toStone(t) {
    t.release();
    t.state = 'stone';
    t.target = null;
    t.shake = 0;
    if (t.loot) this.game.enemies?.dropLoot?.(t);
    this.sound('stone', t.pos);
  }

  /** Gandalf's voice: "Hajnal!" (the upgrade, the use key in the cave). */
  callDawn(p) {
    const any = this.anyAwake || this.stage === 'stir';
    for (const t of this.list) if (t.awake) this.toStone(t);
    this.stage = null;
    this.noise = 0;
    this.calmT = TROLL.dawnCalm;
    this.sound('dawn', p.pos);
    for (const q of this.near()) q.say(q === p ? L.callSelf : L.callOther(p.ch.name), 4.5);
    return any;
  }

  /** The real dawn of the day clock (game.events 'dawn'). */
  sunrise() {
    if (!this.anyAwake && this.stage !== 'stir') return;
    for (const t of this.list) if (t.awake) this.toStone(t);
    this.stage = null;
    this.noise = 0;
    this.calmT = TROLL.sunCalm;
    for (const q of this.near()) q.say(L.sunrise, 4.5);
  }

  /* ---------------- input and the counter ---------------- */

  /** The use key in the cave with the upgrade: "Hajnal!" (true = the press was used). enemies.input calls it first. */
  input(p, i, it) {
    if (!this.owned || !it.interactPressed || p.dead > 0 || p.choosing || p.riding) return false;
    if (!this.inCave(p.pos) || !this.callable) return false;
    it.interactPressed = false;
    this.callDawn(p);
    return true;
  }

  /** The prompt line (shown through the purse's prompt, minigames/purse.js) while "Hajnal!" would help. */
  prompt(p, i) {
    if (!this.owned || !this.list.length || !this.inCave(p.pos) || !(this.anyAwake || this.stage === 'stir')) return '';
    return L.prompt(keysOf(this.game, i).use);
  }

  /** The Green Dragon's row (enemies.shopRows): one "Gandalf hangja" for the party. */
  shopRows(p, cost) {
    if (this.owned || !this.list.length) return [];
    return [{
      kind: 'gandalf-voice', art: voiceSVG(), label: L.shopLabel, price: cost(TROLL.price), ok: true, act: () => {
        this.owned = true;
        for (const q of this.game.players) if (!q.choosing) q.say(L.bought, 6);
        this.game.saveNow?.();
      },
    }];
  }

  state() {
    return this.owned ? { g: 1 } : undefined;
  }

  restore(s) {
    this.owned = !!(s && s.g);
  }

  /* ---------------- per frame ---------------- */

  nearestStone(pos) {
    let best = null;
    let bd = Infinity;
    for (const t of this.list) {
      if (t.awake) continue;
      const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** A player an awake troll may go after. */
  canTarget(p) {
    const en = this.game.enemies;
    return p && p.dead <= 0 && !p.choosing && (en ? en.canTarget(p) : true) && this.inCave(p.pos, TROLL.zone + 1);
  }

  update(dt) {
    if (!this.list.length) {
      if (this.game.decor?.info?.trolls) this.build();
      return;
    }
    this.time += dt;
    for (const p of this.game.players) if (p.trollNoiseT > 0) p.trollNoiseT = Math.max(0, p.trollNoiseT - dt);
    this.noise = Math.max(0, this.noise - TROLL.decay * dt);
    this.calmT = Math.max(0, this.calmT - dt);
    if (this.stage === 'stir') {
      this.stirT -= dt;
      this.stirE += dt;
      if (this.stirT <= 0) {
        this.stage = null;
        this.noise *= 0.5;
      }
    }
    const caveSeen = this.game.decor?.groups?.l3?.visible !== false;
    let moving = false;
    for (const t of this.list) {
      if (t.awake) this.step(t, dt);
      else if (t.displaced && !caveSeen) t.reset();
      moving ||= t.awake || t.displaced || this.stage === 'stir';
    }
    if (!moving && !this.uniformOn) return;
    for (const t of this.list) {
      let sx = 0;
      let sz = 0;
      const k = t.awake ? t.shake : this.stage === 'stir' ? 0.6 * Math.min(1, this.stirT / 1.5) : 0;
      if (k > 0) {
        const s = this.time;
        sx = Math.sin(s * 37 + t.i) * 0.035 * k;
        sz = Math.cos(s * 41 + t.i * 2) * 0.035 * k;
      }
      const roll0 = t.roll;
      if (!t.awake && k > 0) t.roll = roll0 + Math.sin(this.time * 29 + t.i) * 0.012 * k;
      t.compose(sx, sz);
      t.roll = roll0;
      TROLL_U.uTrollPose.value[t.i].copy(t.matrix);
      if (t.name === 'Vilmos') this.game.minigames?.purse?.follow?.(t.displaced || k > 0 ? t.matrix : null);
    }
    TROLL_U.uTrollOn.value = moving ? 1 : 0;
    this.uniformOn = moving;
  }

  /** One awake troll: shake loose, lumber at the target, grab, walk home; light freezes it. */
  step(t, dt) {
    t.t += dt;
    // Strong light near it: back to stone at once.
    for (const p of this.game.players) {
      if (p.choosing || p.dead > 0 || this.lightOf(p) < TROLL.light || !this.inCave(p.pos, TROLL.zone + 2)) continue;
      if (Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) < TROLL.freezeNear) {
        this.toStone(t);
        for (const q of this.near()) q.say(L.lightFreeze(t.name), 3.5);
        return;
      }
    }
    t.phase += dt * 3.2;
    t.pauseT = Math.max(0, t.pauseT - dt);
    if (t.state !== 'home') t.life -= dt;
    if (t.state === 'rise') {
      t.shake = 1 - Math.min(1, t.t / TROLL.rise) * 0.7;
      if (t.target) this.turnTo(t, t.target.pos.x, t.target.pos.z, dt * 0.6);
      if (t.t >= TROLL.rise) {
        t.state = 'walk';
        t.shake = 0;
      }
      return;
    }
    if (t.state === 'grab') {
      const p = t.held;
      t.lean += (0.34 - t.lean) * Math.min(1, dt * 6);
      t.roll *= 0.9;
      if (!p || p.held !== t || p.dead > 0) {
        t.release();
        t.state = 'walk';
        return;
      }
      p.kick = Math.max(p.kick || 0, 0.25);
      if (t.t >= TROLL.hold) this.finishGrab(t, p);
      return;
    }
    if (t.state === 'walk' && t.life <= 0) t.state = 'home';
    let gx;
    let gz;
    if (t.state === 'walk') {
      if (!this.canTarget(t.target)) t.target = this.pickTarget(t);
      if (!t.target) {
        t.state = 'home';
        return;
      }
      gx = t.target.pos.x;
      gz = t.target.pos.z;
      const d = Math.hypot(gx - t.pos.x, gz - t.pos.z);
      const en = this.game.enemies;
      if (d < TROLL.reach && t.pauseT <= 0 && Math.abs(t.target.pos.y - t.pos.y) < 2.6 && (en ? en.canGrab(t.target) : !t.target.held)) {
        this.grab(t, t.target);
        return;
      }
      if (d < TROLL.reach * 0.75 || t.pauseT > 0) gx = gz = null; // close enough: reach out, do not tread on him
    } else {
      gx = t.rest.x;
      gz = t.rest.z;
      if (Math.hypot(gx - t.pos.x, gz - t.pos.z) < 0.12) {
        this.turnTo(t, t.pos.x + Math.sin(t.rest.yaw), t.pos.z + Math.cos(t.rest.yaw), dt);
        t.lean *= 1 - Math.min(1, dt * 4);
        t.roll *= 1 - Math.min(1, dt * 4);
        if (Math.abs(angleDiff(t.yaw, t.rest.yaw)) < 0.05) {
          t.reset();
          this.toStone(t);
          if (!this.anyAwake) this.calmT = Math.max(this.calmT, TROLL.calm);
        }
        return;
      }
    }
    if (gx == null) {
      if (t.target) this.turnTo(t, t.target.pos.x, t.target.pos.z, dt);
      t.lean += (0.12 - t.lean) * Math.min(1, dt * 3);
      t.roll *= 1 - Math.min(1, dt * 3);
      return;
    }
    this.turnTo(t, gx, gz, dt);
    // Lumber forward when roughly facing the goal: a side-to-side sway and a forward lean (a group transform only).
    const face = Math.cos(angleDiff(Math.atan2(gx - t.pos.x, gz - t.pos.z), t.yaw));
    const v = TROLL.speed * Math.max(0, face);
    let nx = t.pos.x + Math.sin(t.yaw) * v * dt;
    let nz = t.pos.z + Math.cos(t.yaw) * v * dt;
    // Keep off the other trolls and inside the cave.
    for (const o of this.list) {
      if (o === t) continue;
      const dx = nx - o.pos.x;
      const dz = nz - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && d > 1e-3) {
        nx = o.pos.x + (dx / d) * 2.4;
        nz = o.pos.z + (dz / d) * 2.4;
      }
    }
    const c = TROLL_CAVE;
    const ex = (nx - c.x) / (c.rx - 1.3);
    const ez = (nz - c.z) / (c.rz - 1.3);
    const e = Math.hypot(ex, ez);
    if (e > 1) {
      nx = c.x + (nx - c.x) / e;
      nz = c.z + (nz - c.z) / e;
    }
    t.pos.x = nx;
    t.pos.z = nz;
    t.roll = Math.sin(t.phase) * 0.07 * (v / TROLL.speed);
    t.lean += (0.1 + 0.06 * Math.abs(Math.cos(t.phase)) - t.lean) * Math.min(1, dt * 4);
    t.displaced = true;
  }

  turnTo(t, x, z, dt) {
    const want = Math.atan2(x - t.pos.x, z - t.pos.z);
    const d = angleDiff(want, t.yaw);
    const s = TROLL.turn * dt;
    t.yaw += Math.max(-s, Math.min(s, d));
  }

  pickTarget(t) {
    let best = null;
    let bd = Infinity;
    for (const p of this.game.players) {
      if (!this.canTarget(p)) continue;
      // The noisy digger first, then the nearest.
      const d = Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) - (p.trollNoiseT > 0 ? 4 : 0);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  grab(t, p) {
    t.state = 'grab';
    t.t = 0;
    t.held = p;
    p.held = t;
    p.struggle = 0;
    this.sound('grab', t.pos);
    p.say(L.grabbed(t.name), 3);
    for (const q of this.game.players) if (q !== p && !q.choosing) q.say(L.grabbedOther(t.name, p.ch.name), 3);
  }

  /** The end of a hold: a find taken (normal) or the plate hurt (Kihívás); a shove. */
  finishGrab(t, p) {
    const arm = armourOf(p);
    t.release();
    t.pauseT = 2.5;
    t.state = 'walk';
    p.graceT = 3;
    if (this.game.enemies?.challenge) {
      p.hunger = Math.max(0, p.hunger - (TROLL.harm * (arm.hurt ?? 1)) / lifeOf(p));
      p.kick = 1;
      if (p.hunger <= 0) {
        p.die(L.killed(t.name));
        return;
      }
      p.say(L.hurt(t.name), 3);
    } else if (p.bag.length > 0 && Math.random() < (arm.steal ?? 1)) {
      const took = p.bag.splice(Math.floor(Math.random() * p.bag.length), 1)[0];
      t.setLoot(took);
      t.state = 'home';
      p.say(L.stole(t.name, took.name), 5);
    } else p.say(p.bag.length ? L.armourSaved(t.name) : L.emptyBag(t.name), 3.5);
    tmpV.set(p.pos.x - t.pos.x, 0, p.pos.z - t.pos.z);
    if (tmpV.lengthSq() < 1e-4) tmpV.set(Math.sin(t.yaw), 0, Math.cos(t.yaw));
    tmpV.normalize();
    p.knock?.(tmpV.x, tmpV.z, TROLL.shove);
  }

  /* ---------------- sounds (synthesised, only near a player) ---------------- */

  sound(kind, pos) {
    try {
      if (this.game.decor?.mute || this.game.bench) return;
      if (!this.game.players.some((p) => p.pos.distanceTo(pos) < 30)) return;
      const a = sharedAudio();
      if (!a) return;
      if (a.state === 'suspended') a.resume();
      if (!this.noiseBuf) {
        this.noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      }
      const t0 = a.currentTime;
      const burst = (start, dur, type, f0, f1, vol, q = 1) => {
        const src = a.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = a.createBiquadFilter();
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(f0, t0 + start);
        f.frequency.exponentialRampToValueAtTime(f1, t0 + start + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(vol, t0 + start + Math.min(0.08, dur / 4));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        src.connect(f).connect(g).connect(a.destination);
        src.start(t0 + start);
        src.stop(t0 + start + dur + 0.05);
      };
      const tone = (start, dur, type, f0, f1, vol) => {
        const o = a.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t0 + start);
        o.frequency.exponentialRampToValueAtTime(f1, t0 + start + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(vol, t0 + start + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        o.connect(g).connect(a.destination);
        o.start(t0 + start);
        o.stop(t0 + start + dur + 0.05);
      };
      switch (kind) {
        // Grinding stone: gritty band noise over a low scrape.
        case 'grind': burst(0, 1.8, 'bandpass', 700, 300, 0.2, 2.5); burst(0.05, 2.2, 'lowpass', 180, 70, 0.45); break;
        // A troll's grumble: two low growls.
        case 'grumble': tone(0.1, 0.7, 'sawtooth', 75, 58, 0.07); tone(0.85, 0.9, 'sawtooth', 68, 50, 0.08); burst(0.1, 1.5, 'lowpass', 220, 120, 0.12); break;
        case 'grab': burst(0, 0.25, 'lowpass', 400, 120, 0.5); tone(0, 0.5, 'sawtooth', 90, 60, 0.07); break;
        // Turning to stone: a dry crackle settling.
        case 'stone': for (let k = 0; k < 5; k++) burst(k * 0.07, 0.12, 'bandpass', 2200 - k * 250, 1400, 0.18, 3); burst(0.1, 0.9, 'lowpass', 160, 60, 0.35); break;
        // "Hajnal!": a bright rising call, then the stone settles.
        case 'dawn': tone(0, 0.6, 'triangle', 330, 494, 0.06); tone(0.15, 0.7, 'triangle', 440, 659, 0.05); burst(0.5, 1.2, 'lowpass', 200, 70, 0.35); break;
        default: break;
      }
    } catch (e) {
      // Sound is optional.
    }
  }
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Counter drawing of "Gandalf hangja" (viewBox 100 × 100, the style of ui/art.js): a pointed grey hat, a staff and a
 * rising sun. */
function voiceSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="93" rx="30" ry="5" fill="#0006"/>
    <path d="M14 78a36 36 0 0 1 72 0z" fill="#f0c860" opacity="0.85"/>
    <path d="M50 30v-12M26 40l-8-8M74 40l8-8M18 60H6M82 60h12" stroke="#f0c860" stroke-width="4" stroke-linecap="round"/>
    <path d="M30 80l18-60 6 4 4 14 14 42z" fill="#8a8e96" stroke="#3a3c40" stroke-width="2"/>
    <path d="M22 80h60" stroke="#3a3c40" stroke-width="5" stroke-linecap="round"/>
    <path d="M78 18c-4 0-6 4-4 8l-6 62" fill="none" stroke="#6a4a2a" stroke-width="4" stroke-linecap="round"/></svg>`;
}
