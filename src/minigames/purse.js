/* ==== minigames/purse.js — William's talking purse (TERV 0.11/9: "Vilmos beszélő erszénye a trollbarlangban:
   zsebmetsző minijáték. Ha ügyetlen vagy, az erszény felkiált, és a trollok felriadnak."). Book ch. 2: Bilbo tries
   to pick William's pocket; the purse is a trolls' purse and squeaks "'Ere, 'oo are you?" — in the game the line is
   "Ki vagy te?" [ellenőrizendő: the Hungarian translation's exact wording]. The layer table (TERV 0.1) has the three
   trolls turned to stone that may "wake": a failure wakes Vilmos for real (trolls/, NOTES-24-trolls; book: William
   grabs the burglar) and the other two stir. The purse hangs on Vilmos and moves with him.
   - A leather purse hangs at Vilmos's belt (one small mesh in the troll cave's decor group, built at start).
   - The use key within reach opens a parchment in that player's own viewport: three steps (reach in, take hold, draw
     it out), each a needle sweeping over a bar with a quiet zone; press the dig / confirm / use key while the needle
     is in the zone. The zone narrows and the needle quickens step by step. One miss = the purse cries out.
   - Success: troll gold (2 "Trollarany" finds into the bag, 3 when every press was in the zone's middle; what does
     not fit goes to the shared purse as gold). Failure: the purse cries, the trolls stir (all players in the cave are
     told), the clumsy thief falls back startled (knocked down 1.6 s, pushed away, −10 plate).
   - Once per game day (day clock), success or failure; leaving before the end (back key) costs nothing. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIND_TYPES } from '../finds.js';
import { sdf } from '../world.js';
import { GOLD, head, keysOf, meter, painted, rng, sound } from './common.js';

export const PURSE = {
  reach: 2.3, // m (horizontal) from the purse: the prompt and the start
  steps: [
    { v: 0.8, w: 0.26, text: 'Óvatosan Vilmos zsebéhez nyúlsz…' },
    { v: 1.1, w: 0.2, text: 'Megfogod az erszényt…' },
    { v: 1.45, w: 0.15, text: 'Lassan kihúzod…' },
  ],
  gold: 2, // Trollarany finds; +1 when every press was in the zone's middle half
  scare: 10, // plate points
  down: 1.6, // s knocked down
  close: 1.7, // s the parchment stays after the end
};

/** A small leather purse on a strap (local: the strap goes up +y from the purse's neck). */
function purseGeometry() {
  const P = [];
  const bag = new THREE.SphereGeometry(0.085, 12, 9);
  bag.scale(1, 1.15, 0.78);
  P.push(painted(bag, 0x6a4422));
  const neck = new THREE.CylinderGeometry(0.03, 0.05, 0.05, 10);
  neck.translate(0, 0.105, 0);
  P.push(painted(neck, 0x5a381c));
  const tie = new THREE.TorusGeometry(0.034, 0.008, 5, 12);
  tie.rotateX(Math.PI / 2);
  tie.translate(0, 0.1, 0);
  P.push(painted(tie, 0xb89a60));
  const strap = new THREE.CylinderGeometry(0.008, 0.008, 0.75, 4);
  strap.translate(0, 0.5, 0);
  P.push(painted(strap, 0x4a3018));
  // A troll's coin peeking out of the neck.
  const coin = new THREE.CylinderGeometry(0.022, 0.022, 0.005, 10);
  coin.rotateZ(1.2);
  coin.translate(0.012, 0.135, 0.01);
  P.push(painted(coin, 0xe0b040));
  const g = mergeGeometries(P);
  g.computeVertexNormals();
  return g;
}

export class Purse {
  constructor(mg) {
    this.mg = mg;
    this.game = mg.game;
    this.runs = new Map(); // player → run
    this.lastDay = null;
    // Where it hangs: at Vilmos's side, towards the fire (the troll set of underground/pieces.js).
    const v = this.game.decor?.info?.trolls?.find((t) => t.name === 'Vilmos');
    this.pos = new THREE.Vector3(2.5, -119, 2.1);
    if (v) {
      const fx = Math.sin(v.yaw);
      const fz = Math.cos(v.yaw);
      this.pos.set(v.x + fx * 0.85 + fz * 0.55, v.y + 0.08 + 1.2, v.z + fz * 0.85 - fx * 0.55);
    }
    this.mesh = new THREE.Mesh(purseGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.name = 'minigame-purse';
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = v ? v.yaw : 0;
    this.mesh.updateMatrix();
    this.mesh.matrixAutoUpdate = false;
    // trolls (NOTES-24-trolls): the rest placement; follow() moves the purse with a waking Vilmos.
    this.restMatrix = this.mesh.matrix.clone();
    this.restPos = this.pos.clone();
    // In the troll cave's group: drawn only with the cave (decor.js depth bands).
    (this.game.decor?.groups?.l3 || this.game.scene).add(this.mesh);
  }

  today() {
    return this.game.dayClock?.day?.() ?? 1;
  }

  near(p) {
    if (p.pos.y > -100 || p.pos.y < -140) return false;
    return Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < PURSE.reach && Math.abs(p.pos.y + 1 - this.pos.y) < 2.5;
  }

  holds(p) {
    return this.runs.has(p);
  }

  get running() {
    return this.runs.size > 0;
  }

  /** trolls (NOTES-24-trolls): Vilmos's pose matrix (rest → now) while he moves, or null at rest. */
  follow(m) {
    if (m) this.mesh.matrix.multiplyMatrices(m, this.restMatrix);
    else this.mesh.matrix.copy(this.restMatrix);
    this.pos.copy(this.restPos);
    if (m) this.pos.applyMatrix4(m);
  }

  /** trolls (NOTES-24-trolls): a troll is awake (no pickpocketing now). */
  trollsAwake() {
    return !!this.game.enemies?.trolls?.anyAwake;
  }

  prompt(p, i) {
    // trolls (NOTES-24-trolls): while they stir or are awake, the "Hajnal!" key (with the upgrade) is the prompt.
    const tp = this.game.enemies?.trolls?.prompt?.(p, i);
    if (tp) return tp;
    if (!this.near(p) || this.trollsAwake()) return '';
    if (this.runs.size) return 'Valaki már Vilmos zsebénél matat…';
    if (this.lastDay === this.today()) return 'Vilmos erszénye: ma már próbálkoztál (holnap újra)';
    return `Vilmos erszénye — zsebmetszés: ${keysOf(this.game, i).use}`;
  }

  /** The use key near the purse: starts a try (true = the press was used). */
  tryStart(p, i) {
    if (!this.near(p)) return false;
    // trolls (NOTES-24-trolls): not while a troll is awake; the press goes on to "Hajnal!" (enemies.input).
    if (this.trollsAwake()) return false;
    if (this.runs.size) {
      p.say('Valaki már Vilmos zsebénél matat.', 2);
      return true;
    }
    if (this.lastDay === this.today()) {
      p.say('Ma már próbálkoztál Vilmos erszényével. Holnap újra.', 2.5);
      return true;
    }
    this.start(p, i);
    return true;
  }

  start(p, i) {
    const r = rng((this.today() * 7919 + i * 31 + 17) >>> 0);
    const zones = PURSE.steps.map((s) => 0.25 + r() * (0.75 - 0.25));
    this.runs.set(p, { i, step: 0, x: 0, dir: 1, zones, inner: true, phase: 'play', t: 0, msg: '' });
    this.mg.hint(p, i, 'purse', `<b style="${GOLD}">Vilmos erszénye.</b> A mutató ide-oda jár: amikor a zöld sávban van, nyomd meg (${keysOf(this.game, i).act}). Három lépés; egy hiba, és az erszény felkiált! Kilépés: ${keysOf(this.game, i).back}.`);
  }

  /** The player's intent while the parchment is open; always holds the player. */
  input(p, i, it) {
    const r = this.runs.get(p);
    if (!r || r.phase !== 'play') return true;
    if (it.backPressed) {
      this.runs.delete(p);
      p.say('Csendben otthagytad az erszényt.', 2);
      return true;
    }
    if (it.digPressed || it.confirmPressed || it.interactPressed) this.press(p, r);
    return true;
  }

  press(p, r) {
    const s = PURSE.steps[r.step];
    const c = r.zones[r.step];
    const off = Math.abs(r.x - c);
    if (off <= s.w / 2) {
      if (off > s.w / 4) r.inner = false;
      sound(this.game, 'tick');
      r.step++;
      r.x = 0;
      r.dir = 1;
      if (r.step >= PURSE.steps.length) this.win(p, r);
      return;
    }
    this.lose(p, r);
  }

  win(p, r) {
    r.phase = 'won';
    r.t = 0;
    this.lastDay = this.today();
    const type = FIND_TYPES.find((f) => f.id === 'trollarany');
    const n = PURSE.gold + (r.inner ? 1 : 0);
    let bag = 0;
    let gold = 0;
    for (let k = 0; k < n; k++) {
      if (type && p.bagCap - p.bag.length - (p.incoming || 0) > 0) {
        p.bag.push(type);
        bag++;
      } else gold += type ? type.value : 45;
    }
    this.game.money += gold;
    r.msg = `Megvan az erszény! ${bag ? `${bag} trollarany a zsákodba` : ''}${bag && gold ? ', ' : ''}${gold ? `${gold} arany a közös erszénybe` : ''}.`;
    r.reward = { bag, gold };
    sound(this.game, 'coins');
    p.say(r.msg, 4);
    this.game.saveNow?.();
  }

  lose(p, r) {
    r.phase = 'lost';
    r.t = 0;
    this.lastDay = this.today();
    // Book ch. 2 ("'Ere, 'oo are you?"); the Hungarian wording is to be checked [ellenőrizendő].
    r.msg = '„Ki vagy te?” — kiáltja Vilmos erszénye!';
    sound(this.game, 'cry');
    this.stir(p);
    this.game.saveNow?.();
  }

  /** The purse cried out: the stone trolls stir, the thief falls back startled. */
  stir(thief) {
    sound(this.game, 'rumble');
    for (const q of this.game.players) {
      if (q.choosing || q.pos.y > -100 || q.pos.y < -140 || Math.hypot(q.pos.x - this.pos.x, q.pos.z - this.pos.z) > 25) continue;
      if (q === thief) q.say('„Ki vagy te?” — kiáltja az erszény! A trollok felriadnak! Ijedtedben hanyatt esel.', 4.5);
      else q.say('Az erszény felkiáltott! A kőtrollok felriadnak a barlangban!', 3.5);
    }
    // Thrown back about a metre (only into open air), knocked down, and the fright costs plate points (flat, as a fall).
    const dx = thief.pos.x - this.pos.x;
    const dz = thief.pos.z - this.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    for (const k of [1.0, 0.6, 0.3]) {
      const x = thief.pos.x + (dx / l) * k;
      const z = thief.pos.z + (dz / l) * k;
      if (sdf(x, thief.pos.y + 0.6, z) < -0.25 && sdf(x, thief.pos.y + 1.0, z) < -0.25) {
        thief.pos.x = x;
        thief.pos.z = z;
        break;
      }
    }
    thief.vel.set(0, 0, 0);
    thief.downT = Math.max(thief.downT || 0, PURSE.down);
    thief.kick = 1;
    thief.hunger = Math.max(0, thief.hunger - PURSE.scare);
    this.lastStir = { plate: PURSE.scare, down: PURSE.down };
    // trolls (NOTES-24-trolls): the real waking — Vilmos wakes and reaches for the thief, the other two stir.
    this.game.enemies?.trolls?.wakeByPurse?.(thief);
  }

  update(dt) {
    for (const [p, r] of this.runs) {
      r.t += dt;
      if (r.phase === 'play') {
        const s = PURSE.steps[r.step];
        r.x += r.dir * s.v * dt;
        if (r.x > 1) {
          r.x = 2 - r.x;
          r.dir = -1;
        } else if (r.x < 0) {
          r.x = -r.x;
          r.dir = 1;
        }
        if (p.dead > 0 || p.choosing) this.runs.delete(p);
      } else if (r.t > PURSE.close) this.runs.delete(p);
    }
  }

  html(p, i, g) {
    const r = this.runs.get(p);
    if (!r) return '';
    const steps = PURSE.steps.map((_, k) => `<span style="display:inline-block;width:0.8em;height:0.8em;margin:0 0.2em;border-radius:50%;border:2px solid #6a4a2a;background:${k < r.step ? '#4a7a2a' : 'transparent'}"></span>`).join('');
    let body = '';
    if (r.phase === 'play') {
      const s = PURSE.steps[r.step];
      const c = r.zones[r.step];
      body = `<div style="margin:0.25em 0">${s.text}</div>${meter(r.x, c - s.w / 2, c + s.w / 2)}
        <div style="font-size:0.85em;color:#5a4a34">Amikor a mutató a zöld sávban van: ${g.dig} vagy ${g.confirm} · ${g.back} kilépés</div>`;
    } else {
      body = `<div style="margin-top:0.4em;font-style:italic;font-weight:bold;color:${r.phase === 'won' ? '#2a5a1a' : '#7a2a10'}">${r.msg}</div>`;
    }
    return head('Vilmos erszénye') + `<div>${steps}</div>` + body;
  }

  state() {
    // trolls (NOTES-24-trolls): the "Gandalf hangja" upgrade rides here (`tr`), the troll cave's other saved state.
    const tr = this.game.enemies?.trolls?.state?.();
    if (this.lastDay == null && !tr) return undefined;
    const out = {};
    if (this.lastDay != null) out.d = this.lastDay;
    if (tr) out.tr = tr;
    return out;
  }

  restore(s) {
    this.lastDay = s && Number.isFinite(s.d) ? s.d : null;
    this.game.enemies?.trolls?.restore?.(s?.tr); // trolls (NOTES-24-trolls)
  }
}
