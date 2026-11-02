/* ==== laketown-events/bard.js — Bárd, the bargeman and bowman of Lake-town (book ch. 10, 14; film The Desolation of
   Smaug), as a trader at his stall by layer 7's lift: he buys the players' finds (a second selling point deep down, a
   little below the Green Dragon's price; the co-op rate of Decision 16 still applies). His body is the baked film-look
   figure assets/characters/bard.json (tools/figbake/designs/bard.mjs: the shared 13-bone rig and character material);
   he idles, turns to face the nearest player and gestures when he pays. ==== */
import * as THREE from 'three';
import { COOP } from '../config.js';
import { BONE, CharacterBody } from '../characters.js';

/** Trading and the idle behaviour. */
export const BARD = {
  rate: 0.85, // of the Green Dragon's price (hud.js rows: value × perk.sell × co-op × mathom bonus)
  reach: 2.3, // m from the stall a player can trade
  notice: 9, // m: he turns to a player this close
  confirm: 6, // s an offer stands (a second press of the use key sells)
  turnRate: 2.2, // rad/s
  maxTurn: 1.9, // rad he turns away from his stall's facing at most
};

/**
 * His lines: short, grim, honest — the Lake-town bargeman of the book and the film, paraphrased (no quotes). The facts
 * behind them are canon: a bargeman and bowman of Lake-town (book ch. 10, 14; film), grim-voiced and grim-faced (book
 * ch. 14), a descendant of Girion, lord of Dale (book ch. 14), the black arrow from his forefathers (book ch. 14), the
 * hard life of Lake-town's poor under its Master (film). Hungarian names "Bárd", "Völgy" (Dale, as NOTES-5a), "Tóváros", "a Főnök" are [ellenőrizendő].
 */
export const BARD_LINES = {
  greet: [
    'Bárd vagyok, tóvárosi bárkás. Mutasd, mit hoztál — tisztességes árat adok.',
    'Megint te? Lássuk, mit hozott fel a sár.',
    'Nem szép szó, ami ide lehoz, hanem a munka. Mutasd a zsákod.',
  ],
  offer: (v) => `„Ennyit adok érte: ${v} arany. Kevesebb, mint a fogadóban, de nem kell felmásznod.”`,
  sold: [
    'Megegyeztünk. A pénz a tiéd, becsülettel.',
    'Jó áru. A városban sokan ennél kevesebből élnek egy telet.',
    'Rendben. Vigyázz odalent: a tó vize nem tréfál.',
  ],
  empty: 'Üres a zsákod. Gyere vissza, ha találtál valamit.',
  flood: 'Betört a víz! Fel, a magasabb járatokba — ne a kincsen járjon az eszed!',
  idle: [
    'Girion, Völgy ura volt az ősöm. Ma bárkát hajtok, és hordókat úsztatok.',
    'Tóvárosban a szegények nehezen élnek, a Főnök pedig csak a maga zsebére gondol.',
    'Az utolsó fekete nyilam az apámtól maradt rám, ő is az ősöktől kapta.',
  ],
};

const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Bárd's body: the baked figure, its own idle stance (weight on one leg, a hand on the belt), the head following. */
export class BardBody extends CharacterBody {
  constructor() {
    super({ id: 'bard', name: 'Bárd', coat: 0x2a2420 });
    this.bag.visible = false;
    this.pose = { look: 0, gesture: 0 };
  }

  animate(st) {
    super.animate(st);
    if (!this.bones) return;
    const B = BONE;
    const b = this.bones;
    const p = this.pose;
    const add = (i, x, y, z) => {
      tq.setFromEuler(te.set(x, y, z, 'XYZ'));
      b[i].quaternion.multiply(tq);
    };
    const s = Math.sin(this.t * 0.6);
    // Weight on the right leg, the left knee a little bent; the left hand resting at the belt.
    add(B.thighL, 0.05, 0, 0.04);
    add(B.shinL, -0.12, 0, 0);
    add(B.spine, 0, 0.04 * s, -0.02);
    add(B.upperArmL, 0.1, 0, -0.35);
    add(B.foreArmL, 1.15, 0, 0);
    add(B.upperArmR, 0.05, 0, 0.12);
    // The head turns to the player he talks to.
    add(B.head, 0, Math.max(-0.7, Math.min(0.7, p.look)), 0);
    // Paying: the right hand comes forward, palm up.
    if (p.gesture > 0) {
      const g = Math.sin(Math.min(1, p.gesture) * Math.PI);
      add(B.upperArmR, 0.9 * g, 0, 0.1 * g);
      add(B.foreArmR, 0.7 * g, 0, 0);
    }
  }
}

/** Bárd at his stall: the body, facing, and the trade. */
export class Bard {
  constructor(events) {
    this.ev = events;
    this.game = events.game;
    this.body = new BardBody();
    this.body.group.visible = false;
    this.stall = null;
    this.yaw = 0;
    this.offers = new Map(); // player → { value, t }
    this.lineT = 0;
    this.warmed = false;
    this.game.scene.add(this.body.group);
    // His first draw would upload the skinned buffers and compile the character program (a stall in 1p, where no
    // other character is drawn): once the body has loaded, game.warmPrograms() compiles it and a 1-pixel draw of his
    // body uploads the buffers (as the goblin probe in enemies/index.js, plus the upload).
    this.body.ready.then(() => {
      this.loaded = true;
    });
  }

  /** The stall moved (the provider changed). */
  place(stall) {
    this.stall = stall;
    if (!stall) {
      this.body.group.visible = false;
      return;
    }
    this.yaw = stall.yaw || 0;
    this.body.group.position.set(stall.x, stall.y, stall.z);
    this.body.group.rotation.y = this.yaw;
  }

  /** Compiles his program and uploads his buffers with a 1×1 draw (no visible change; once). */
  warm() {
    if (this.warmed || !this.loaded || !this.stall || !this.game.players.length) return;
    this.warmed = true;
    const g = this.game;
    const r = g.renderer;
    const grp = this.body.group;
    const was = grp.visible;
    grp.visible = true;
    g.warmPrograms();
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 4);
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    cam.position.set(this.stall.x + fx * 2.6, this.stall.y + 1.2, this.stall.z + fz * 2.6);
    cam.lookAt(this.stall.x, this.stall.y + 1.0, this.stall.z);
    cam.updateMatrixWorld();
    // Only Bárd and the lights: the other objects are hidden for this one draw.
    const hidden = [];
    for (const o of g.scene.children) {
      if (o === grp || o.isLight || !o.visible) continue;
      o.visible = false;
      hidden.push(o);
    }
    r.setViewport(0, 0, 1, 1);
    r.setScissor(0, 0, 1, 1);
    r.render(g.scene, cam);
    for (const o of hidden) o.visible = true;
    grp.visible = was;
  }

  /** The nearest player to face (within notice), or null. */
  nearest() {
    let best = null;
    let bd = BARD.notice;
    for (const p of this.game.players) {
      if (p.choosing || p.dead > 0 || !this.stall) continue;
      const d = Math.hypot(p.pos.x - this.stall.x, p.pos.y - this.stall.y, p.pos.z - this.stall.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  near(p) {
    const s = this.stall;
    return !!s && !p.choosing && p.dead <= 0 && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < BARD.reach && Math.abs(p.pos.y - s.y) < 2;
  }

  /** What Bárd pays for this player's bag (the Green Dragon's formula × his rate). */
  value(p) {
    const g = this.game;
    const coop = g.players.length > 1;
    return Math.round(p.bag.reduce((s, f) => s + f.value, 0) * p.perk.sell * (coop ? COOP.sell : 1) * (g.bagEnd?.effects?.mathomSellBonus ?? 1) * BARD.rate);
  }

  /** The use key at the stall: the first press is his offer, a second one within a few seconds sells. */
  use(p) {
    if (!p.bag.length) {
      p.say(`Bárd: „${BARD_LINES.empty}”`, 3);
      this.offers.delete(p);
      return;
    }
    const o = this.offers.get(p);
    const value = this.value(p);
    if (!o || o.t <= 0 || o.n !== p.bag.length) {
      this.offers.set(p, { value, t: BARD.confirm, n: p.bag.length });
      p.say(`Bárd: ${BARD_LINES.offer(value)}`, BARD.confirm);
      return;
    }
    this.offers.delete(p);
    const g = this.game;
    g.money += value;
    g.sold += value;
    const n = p.bag.length;
    p.bag = [];
    this.body.pose.gesture = 0.01;
    p.say(`Eladtad Bárdnak (${n} lelet): ${value} arany. — „${pick(BARD_LINES.sold)}”`, 4);
    this.ev.sound('coins', this.stall);
    g.saveNow?.();
  }

  /** The prompt for a player at the stall ('' elsewhere). */
  prompt(p, k) {
    if (!this.near(p)) return '';
    const o = this.offers.get(p);
    if (o && o.t > 0) return `Eladod Bárdnak ${o.value} aranyért: ${k.use}`;
    return p.bag.length ? `Bárd megveszi a leleteidet: ${k.use}` : 'Bárd, a bárkás';
  }

  update(dt) {
    if (!this.stall) return;
    this.warm();
    for (const [p, o] of this.offers) {
      o.t -= dt;
      if (o.t <= 0 || !this.near(p)) this.offers.delete(p);
    }
    const p = this.nearest();
    let want = this.stall.yaw || 0;
    let look = 0;
    if (p) {
      const a = Math.atan2(-(p.pos.x - this.stall.x), -(p.pos.z - this.stall.z));
      let d = a - want;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // He turns his body up to maxTurn, the head does the rest.
      const turn = Math.max(-BARD.maxTurn, Math.min(BARD.maxTurn, d));
      want += turn;
      look = d - turn;
    }
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), BARD.turnRate * dt);
    const pose = this.body.pose;
    pose.look += ((look + (want - this.yaw)) - pose.look) * Math.min(1, dt * 5);
    if (pose.gesture > 0) pose.gesture = pose.gesture >= 1 ? 0 : pose.gesture + dt / 1.4;
    const grp = this.body.group;
    grp.rotation.y = this.yaw;
    // He shuffles on the spot while turning (the shared walk cycle at a slow step).
    this.body.animate({ dt, speed: Math.abs(d) > 0.05 ? 0.5 : 0, vy: 0, grounded: true, climbing: false, swing: 0, pitch: 0, walk: 3.6, fill: 0 });
    // Now and then a line to a player standing at the stall.
    this.lineT -= dt;
    if (p && this.near(p) && this.lineT <= 0) {
      this.lineT = 40;
      const flood = this.ev.anyFlood();
      p.say(`Bárd: „${flood ? BARD_LINES.flood : pick(this.metOnce ? BARD_LINES.idle : BARD_LINES.greet)}”`, 4);
      this.metOnce = true;
    }
  }
}
