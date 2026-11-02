/* ==== hoard/index.js — Smaug's treasury's play (layer 9, NOTES-7a-hoard): the noise meter and Smaug's idle and waking
   behaviour, the dragon-sickness, the Arkenstone's pickup, the snoring's loudness, the music.
   - THE NOISE METER (TERV 0.2 row 9 "zajmérő, lopakodó ásás"): one meter for Smaug. Digging (loudest in the gold: the
     coins clink), walking at full pace and landing from a fall add to it, by how near Smaug's head the player is; a
     dwarf makes more noise than Bilbo (TERV 0.3: Bilbo "halkabban ás"). Sneaking (the crouch key) is nearly silent.
     The Ring (TERV 0.4): Bilbo is invisible, so his steps count for half, but Smaug smells him: while the Ring's wearer
     is in the treasury the meter rises a little and does not fall below a "smell" floor (higher the longer the Ring has
     been worn in the game). Quiet, it falls back slowly.
   - SMAUG (src/smaug/): asleep and snoring; past STIR the snoring stops (TERV 0.11/2: the warning) and his eye opens a
     slit; past WAKE he wakes for a short scare: rears up, looks at the noisiest player and breathes a burst of fire at
     him. In normal mode nobody dies (TERV 0.6): whoever the fire catches is thrown back, one find in his bag burns, and
     the gold is scorched there. Then he settles and falls asleep again. He cannot be fought (TERV 0.4).
     `game.smaug.busy` (the finale drives him) or `gone` (slain) stands all of this down.
   - THE DRAGON-SICKNESS (TERV 0.11/1 "Sárkánykór" [ellenőrizendő]): above SICK.value of Smaug's gold in the bag the
     view goes gold, the player slows and will not part with the gold (the counter refuses to buy it: hud.js asks
     refuseSell). The partner brings him to his senses with the use key close by; a meal on the surface cures it.
   - THE ARKENSTONE: the use key next to it takes it (it flies to the finder and goes into Bag End's case as a trophy,
     never sold); `game.events.emit('arkenstone', player)` (the finale starts the escape: not done here); saved.
   Wiring (game.js, small marked lines): `new Hoard(this)` + `restore(save.hoard)`, `input(p, i, it)` in the menu
   chain, `update(dt)`, `cullFor(seen, i)`, `musicSituation()`; save.js `hoard: game.hoard?.state()`; hud.js's sell row
   asks `refuseSell(p)`. ==== */
import * as THREE from 'three';
import { FIND_TYPES } from '../finds.js';
import { MATS, materialAt } from '../materials.js';
import { raycast } from '../world.js';
import { inHoard, inHoardLayer } from '../underground/hoard-sites.js';
import { HoardHud } from './meter.js';
// The conversation with Smaug (TERV 0.11/21, NOTES-16-smaug-talk).
import { SmaugTalk, TALK, canSpeak } from './talk.js';
// The secret ending: Thrór's throne room behind the treasury, the credits, the closing scene (NOTES-22-secret).
import { Secret } from '../secret/index.js';
// NOTES-27-loose: the raised neck's colliders.
import { NeckColliders } from './neck.js';
import { lifeOf } from '../modes/rules.js'; // NOTES-27-loose: the tier-3 "életerő" for the wake fire

/** Noise amounts (meter units; the meter is 0..1) and the thresholds. */
export const NOISE = {
  dig: 0.04,
  digGold: 0.06,
  walk: 0.11, // per second at full pace
  sneak: 0.012, // per second sneaking (less than the decay: it never adds up)
  land: 0.13,
  quiet: 0.45, // Bilbo's share (TERV 0.3)
  ringSteps: 0.5, // the invisible wearer's steps and strokes count for this much
  smellFloor: 0.14, // the Ring's smell keeps the meter at least here (+ up to smellExtra by the Ring's worn time)
  smellExtra: 0.1,
  smellRise: 0.025, // per second towards the floor
  decay: 0.035, // per second when quiet
  settleDecay: 0.09,
  stir: 0.4,
  wake: 0.82,
  calm: 0.24,
};
/** The waking scare's timing (s): rearing up, the fire's start and end, then settling down. */
export const WAKE = { rear: 1.1, fire: 1.5, settle: 7 };
/** The dragon-sickness: the value of Smaug's gold in the bag that brings it on; the walking speed factor. */
export const SICK = { value: 1500, slow: 0.6, partnerR: 2.2 };
const ARK_REACH = 1.45;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpH = new THREE.Vector3();

export class Hoard {
  constructor(game) {
    this.game = game;
    this.fx = game.decor?.hoardFx || null;
    this.smaug = this.fx?.smaug || null;
    // (game.js also sets game.smaug right after the decor; kept in step here.)
    if (this.smaug && !game.smaug) game.smaug = this.smaug;
    this.noise = 0;
    this.mode = 'sleep';
    this.t = 0;
    this.calmT = 0;
    this.target = null;
    this.fireHits = null;
    this.burnt = new Set();
    this.arkTaken = false;
    this.arkBy = null;
    this.huds = new Map();
    this.time = 0;
    this.headPos = new THREE.Vector3();
    if (this.smaug) this.smaug.headPos(this.headPos);
    // NOTES-16-smaug-talk: the running conversation (or null), the pause before he talks again, the lull it bought.
    this.talk = null;
    this.talkCd = 0;
    this.lull = 0;
    // NOTES-22-secret: the hidden chamber and the secret ending (saved inside this module's save field).
    this.secret = new Secret(game);
    // NOTES-27-loose: colliders for the neck and head when he lifts them (the sleeping body's are hoard-fx's).
    this.neck = this.fx && this.smaug && game.decor?.colliders ? new NeckColliders(game.decor, this.fx) : null;
  }

  /* ---------------- save ---------------- */

  state() {
    return {
      ark: this.arkTaken ? 1 : 0,
      by: this.arkBy,
      sick: this.game.players.map((p) => (p.sick ? 1 : 0)),
      sickBase: this.game.players.map((p) => Math.round(p.sickBase || 0)),
      secret: this.secret?.state(), // NOTES-22-secret
    };
  }

  restore(s) {
    if (!s) return;
    this.arkTaken = !!s.ark;
    this.arkBy = s.by || null;
    if (this.arkTaken) this.fx?.takeArkenstone();
    this.secret?.restore(s.secret); // NOTES-22-secret
    this.savedSick = s;
  }

  /* ---------------- helpers ---------------- */

  /** Smaug lies on the hoard and listens (not driven by the finale, not slain). */
  get listening() {
    const s = this.smaug;
    return !!s && !s.busy && !s.gone;
  }

  /** The value of Smaug's gold in a player's bag (the dragon-sickness). */
  goldValue(p) {
    let v = 0;
    for (const f of p.bag) if (f.hoard) v += f.value;
    return v;
  }

  /** How loud a player's noise reaches Smaug: 1 close to his head, 0.4 at the hall's far side, less on the stair. */
  reach(p) {
    if (!inHoardLayer(p.pos)) return 0;
    if (!inHoard(p.pos)) return 0.25;
    const d = p.pos.distanceTo(this.headPos);
    return clamp(1.25 - d / 20, 0.4, 1);
  }

  /** Adds noise made by a player (meter units before the player's and the distance's factors). */
  addNoise(p, amount) {
    if (!this.listening) return 0;
    const r = this.reach(p);
    if (r <= 0) return 0;
    let k = amount * r;
    if (p.ch?.id === 'bilbo') k *= NOISE.quiet;
    if (this.game.gollum?.isInvisible?.(p)) k *= NOISE.ringSteps;
    if (this.lull > 0) k *= TALK.lullFactor; // NOTES-16-smaug-talk: the time the conversation bought
    this.noise = Math.min(1, this.noise + k);
    p.hoardNoise = (p.hoardNoise || 0) + k;
    return k;
  }

  /* ---------------- input: the Arkenstone, bringing a partner to his senses ---------------- */

  /** The use key: takes the Arkenstone or snaps a dragon-sick partner out of it. Returns true when it was used. */
  input(p, i, it) {
    if (this.secret?.held() && this.secret.input(p, i, it)) return true; // NOTES-22-secret: its scenes hold the player
    if (this.talk && this.talk.input(p, i, it)) return true; // NOTES-16-smaug-talk: the speaker's parchment, a whisper
    if (!it.interactPressed || p.choosing || p.dead > 0 || p.riding) return false;
    const partner = this.sickPartnerNear(p);
    if (partner) {
      this.cure(partner, `${p.ch.name} észhez térített. Az arany csak arany.`);
      p.say(`Észhez térítetted: ${partner.ch.name}.`, 3);
      return true;
    }
    if (this.arkenstoneNear(p)) {
      this.takeArkenstone(p);
      return true;
    }
    // NOTES-22-secret: the sealed door, Thrór's throne (after the talk, the partner and the Arkenstone).
    if (this.secret?.input(p, i, it)) return true;
    return false;
  }

  sickPartnerNear(p) {
    for (const q of this.game.players) {
      if (q === p || !q.sick || q.dead > 0 || q.choosing) continue;
      if (q.pos.distanceTo(p.pos) < SICK.partnerR) return q;
    }
    return null;
  }

  arkenstoneNear(p) {
    if (this.arkTaken || !this.fx || p.dead > 0) return false;
    const a = this.fx.arkenstonePos(tmpV);
    return Math.hypot(p.pos.x - a.x, p.pos.z - a.z) < ARK_REACH && p.pos.y - a.y < 1.8 && a.y - p.pos.y < 1.2;
  }

  /** The Arkenstone is taken: it flies to the finder, then Bag End's case; the finale hears of it. */
  takeArkenstone(p) {
    if (this.arkTaken) return;
    this.arkTaken = true;
    this.arkBy = p.ch?.id || null;
    const a = this.fx.arkenstonePos(new THREE.Vector3());
    this.fx.takeArkenstone();
    const game = this.game;
    const type = FIND_TYPES.find((t) => t.id === 'arkenko');
    const done = () => {
      p.incoming = Math.max(0, (p.incoming || 0) - 1);
      game.bagEnd?.addTrophy(type);
      p.say('Az Arkenkő, a Hegy Szíve! A saját fényével ragyog a kezedben.', 6);
      p.say('Zsáklak vitrinjébe kerül: el nem adnád semmi kincsért.', 6);
      for (const q of game.players) if (q !== p && !q.choosing) q.say(`${p.ch.name} megtalálta az Arkenkövet!`, 5);
      game.saveNow?.();
    };
    if (game.finds && type) {
      p.incoming = (p.incoming || 0) + 1;
      game.finds.fly({ type, x: a.x, y: a.y + 0.1, z: a.z, rot: new THREE.Euler(0.3, 0.7, 0) }, p, done);
    } else done();
    // The finale starts the escape (finale/, NOTES-7b-finale); nothing more here.
    game.events?.emit?.('arkenstone', p);
  }

  /* ---------------- the dragon-sickness ---------------- */

  /** Refuses the counter's purchase of a dragon-sick player's bag (hud.js asks). */
  refuseSell(p) {
    if (!p.sick) return false;
    p.say('Nem! Ez az arany az enyém… senkinek sem adom oda. (Sárkánykór: egy jó vacsora vagy a társad segít.)', 4);
    return true;
  }

  cure(p, text) {
    p.sick = false;
    p.sickBase = this.goldValue(p);
    p.say(text, 4);
  }

  updateSickness(dt) {
    const players = this.game.players;
    if (this.savedSick) {
      players.forEach((p, i) => {
        if (this.savedSick.sick?.[i]) p.sick = true;
        p.sickBase = this.savedSick.sickBase?.[i] || 0;
      });
      if (players.length >= (this.savedSick.sick?.length || 1)) this.savedSick = null;
    }
    for (const p of players) {
      if (p.choosing) continue;
      const gold = this.goldValue(p);
      // Selling empties the bag: the threshold starts again from nothing.
      if (gold < (p.sickBase || 0)) p.sickBase = gold;
      if (!p.sick && gold >= Math.max(SICK.value, (p.sickBase || 0) + SICK.value * 0.5) && p.dead <= 0) {
        p.sick = true;
        p.say('Elhatalmasodott rajtad a sárkánykór: az arany a tiéd, senki másé! Minden aranyfényben úszik…', 5);
        for (const q of players) if (q !== p && !q.choosing) q.say(`${p.ch.name} rabja lett az aranynak! Menj oda hozzá, és térítsd észhez.`, 5);
      }
      // A meal on the surface (the counter's food, Bag End's pantry) cures it.
      const fed = p.hunger > (p.hoardHunger ?? p.hunger) + 4 && (p.depth < 1 || this.game.bagEnd?.isInside?.(p));
      p.hoardHunger = p.hunger;
      if (p.sick && fed) this.cure(p, 'Egy jó vacsora után kitisztult a fejed: az arany csak arany.');
      p.sickT = clamp((p.sickT || 0) + (p.sick ? dt : -dt) * 0.8, 0, 1);
      if (p.sick) {
        p.slow = Math.min(p.slow ?? 1, SICK.slow);
        p.hoardSlowed = true;
      } else if (p.hoardSlowed) {
        p.hoardSlowed = false;
        if (p.slow === SICK.slow) p.slow = 1;
      }
    }
  }

  /* ---------------- the noise sources ---------------- */

  updateNoise(dt) {
    const players = this.game.players;
    let smell = 0;
    for (const p of players) {
      if (p.choosing || p.dead > 0 || p.riding) {
        p.hoardSwing = p.swing;
        continue;
      }
      // A swing of the pick (tryDig sets swing to 1): in the gold it is louder.
      if (p.swing > (p.hoardSwing ?? 0) + 0.2) {
        const o = p.eye(tmpV);
        const d = p.forward(tmpD);
        const t = raycast(o, d, 2.7);
        let amount = NOISE.dig;
        if (t >= 0) {
          const m = materialAt(o.x + d.x * (t + 0.05), o.y + d.y * (t + 0.05), o.z + d.z * (t + 0.05));
          if (MATS[m]?.name === 'Szmaug aranya') amount = NOISE.digGold;
        }
        this.addNoise(p, amount);
      }
      p.hoardSwing = p.swing;
      // Steps: full pace is heard, sneaking hardly.
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (p.grounded && sp > 2.4) this.addNoise(p, NOISE.walk * dt);
      else if (p.grounded && sp > 0.4) this.addNoise(p, NOISE.sneak * dt);
      // Landing from a fall or a jump.
      if (p.grounded && (p.hoardVy ?? 0) < -6.5) this.addNoise(p, NOISE.land * clamp(-p.hoardVy / 9, 0.6, 1.6));
      p.hoardVy = p.grounded ? 0 : p.vel.y;
      // The Ring's smell (TERV 0.4: "Szmaug viszont megérzi a szagodat").
      if (this.game.gollum?.isInvisible?.(p) && inHoard(p.pos)) {
        const worn = this.game.gollum?.ring?.smell || 0;
        smell = Math.max(smell, NOISE.smellFloor + NOISE.smellExtra * Math.min(1, worn / 600));
        if (!p.smellSaid) {
          p.smellSaid = true;
          p.say('Láthatatlan vagy, de Szmaug megérzi a szagodat… Szimatol.', 4);
        }
      }
      p.hoardNoise = Math.max(0, (p.hoardNoise || 0) - dt * 0.15);
    }
    // Quiet: the meter falls back, but not below the Ring's smell (and rises a little towards it).
    const decay = this.mode === 'settle' ? NOISE.settleDecay : NOISE.decay;
    if (this.noise > smell) this.noise = Math.max(smell, this.noise - decay * dt);
    else this.noise = Math.min(smell, this.noise + NOISE.smellRise * dt);
  }

  /* ---------------- Smaug's behaviour ---------------- */

  setState(st) {
    this.mode = st;
    this.t = 0;
    this.calmT = 0;
    const s = this.smaug;
    if (!s) return;
    if (st === 'sleep') {
      s.setPose('sleep');
      s.setEye(0);
      s.snore(true);
      s.look = null;
    } else if (st === 'stir') {
      s.setPose('stir');
      s.setEye(0.3);
      s.snore(false);
    } else if (st === 'wake') {
      s.setPose('awake');
      s.setEye(1);
      s.snore(false);
    } else if (st === 'settle') {
      s.setPose('stir');
      s.setEye(0.55);
      s.snore(false);
    } else if (st === 'talk') {
      // NOTES-16-smaug-talk: he raises his head and talks (no fire), looking for the voice.
      s.setPose('awake');
      s.setEye(1);
      s.snore(false);
    }
  }

  /* ---------------- the conversation (TERV 0.11/21, NOTES-16-smaug-talk; hoard/talk.js) ---------------- */

  get wakeMark() {
    return NOISE.wake;
  }

  inLayer(p) {
    return inHoardLayer(p.pos);
  }

  inHall(p) {
    return inHoard(p.pos);
  }

  /** Starts the conversation if Bilbo wears the Ring in the hall (and he has not talked lately). */
  startTalk() {
    if (this.talk || this.talkCd > 0) return false;
    const sp = this.game.players.find((p) => canSpeak(this.game, p, inHoard));
    if (!sp) return false;
    this.talk = new SmaugTalk(this, sp);
    this.noise = Math.min(this.noise, NOISE.wake - 0.12);
    this.setState('talk');
    for (const p of this.game.players) if (p !== sp && !p.choosing && inHoardLayer(p.pos)) p.say('Szmaug felemeli a fejét… és megszólal. Csendben!', 3);
    return true;
  }

  /** The conversation ended (talk.js): good → he settles and the lull runs; fire → the wake; skip / abort → stirred. */
  talkEnded(talk, result) {
    if (this.talk !== talk) return;
    this.talk = null;
    talk.dispose();
    if (!this.listening) return; // the finale took him over meanwhile: leave him alone
    if (result === 'good') {
      this.noise = Math.min(this.noise, NOISE.calm * 0.6);
      this.lull = Math.min(TALK.lullMax, talk.goods * TALK.lullPer);
      this.talkCd = TALK.cooldown;
      this.setState('settle');
    } else if (result === 'fire') {
      this.talkCd = TALK.cooldownFire;
      this.noise = Math.max(this.noise, NOISE.wake);
      this.wake(talk.speaker);
    } else {
      this.talkCd = TALK.cooldown;
      this.setState('stir');
    }
  }

  /** The noisiest player in the treasury right now (whom he wakes towards), or the nearest. */
  noisiest() {
    let best = null;
    let bv = -1;
    for (const p of this.game.players) {
      if (p.choosing || p.dead > 0 || !inHoardLayer(p.pos)) continue;
      const v = (p.hoardNoise || 0) - p.pos.distanceTo(this.headPos) * 0.001;
      if (v > bv) {
        bv = v;
        best = p;
      }
    }
    return best;
  }

  /** Wakes him now (QA calls it too): the scare at `target` (default the noisiest player). */
  wake(target = null) {
    this.target = target || this.noisiest();
    this.burnt.clear();
    this.fireHits = null;
    this.setState('wake');
    if (this.smaug) this.smaug.look = this.target ? this.target.pos.clone().add(tmpH.set(0, 0.8, 0)) : null;
    for (const p of this.game.players) if (!p.choosing && inHoardLayer(p.pos)) p.say('Szmaug felébredt! Tűz!', 2.5);
  }

  updateSmaug(dt) {
    const s = this.smaug;
    this.t += dt;
    // NOTES-16-smaug-talk: stirred with Bilbo invisible in the hall, he talks instead (and while talking, nothing else).
    if ((this.mode === 'sleep' || this.mode === 'stir') && this.noise >= NOISE.stir && this.startTalk()) return;
    if (this.mode === 'talk') {
      if (this.talk) this.talk.update(dt);
      return;
    }
    if (this.mode === 'sleep') {
      if (this.noise >= NOISE.wake) this.wake();
      else if (this.noise >= NOISE.stir) {
        this.setState('stir');
        for (const p of this.game.players) if (!p.choosing && inHoardLayer(p.pos)) p.say('A horkolás elakadt… Szmaug mocorog. Csendben!', 3);
      }
    } else if (this.mode === 'stir') {
      if (this.noise >= NOISE.wake) this.wake();
      else if (this.noise < NOISE.calm) {
        this.calmT += dt;
        if (this.calmT > 3) this.setState('sleep');
      } else this.calmT = 0;
    } else if (this.mode === 'wake') {
      const tp = this.target;
      if (tp && s && this.t < WAKE.rear) s.look = tp.pos.clone().add(tmpH.set(0, 0.8, 0));
      if (this.t >= WAKE.rear && !this.fireHits && s) {
        // The burst: from his mouth towards where the player stands now (it can be dodged).
        const from = s.mouth(new THREE.Vector3());
        const aim = tp ? tp.pos.clone().add(tmpH.set(0, 0.7, 0)) : from.clone().add(tmpD.set(0, -1, 2));
        const dir = aim.sub(from).normalize();
        this.fireHits = s.breath(true, from, dir);
        this.sound('fire');
      }
      if (this.fireHits) {
        for (const p of this.game.players) {
          if (this.burnt.has(p) || p.dead > 0 || p.choosing) continue;
          if (this.fireHits.hits(tmpV.copy(p.pos).add(tmpH.set(0, 0.7, 0)))) {
            this.burnt.add(p);
            this.burn(p);
          }
        }
      }
      if (this.t >= WAKE.rear + WAKE.fire) {
        s?.breath(false);
        this.fireHits = null;
        this.noise = Math.min(this.noise, NOISE.wake - 0.05);
        this.setState('settle');
      }
    } else if (this.mode === 'settle') {
      if (this.t > WAKE.settle && this.noise < NOISE.calm) {
        this.setState('sleep');
        for (const p of this.game.players) if (!p.choosing && inHoardLayer(p.pos)) p.say('Szmaug lassan visszaalszik…', 3);
      } else if (this.t > 2.5 && this.noise >= NOISE.wake) this.wake();
    }
  }

  /** The fire caught a player (normal mode: no death): thrown back, one find burnt, a scorch on the gold. */
  burn(p) {
    const s = this.smaug;
    const from = s ? s.mouth(tmpD) : this.headPos;
    let dx = p.pos.x - from.x;
    let dz = p.pos.z - from.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    p.knock(dx, dz, 7.5);
    p.kick = 1;
    p.hoardFire = 1;
    const life = lifeOf(p); // NOTES-27-loose: Kihívás armour tier 3 "több életerő" (modes/rules.js)
    const can = p.bag.map((f, i) => [f, i]).filter(([f]) => !f.keep && !f.famous);
    if (can.length) {
      const [f, i] = can[Math.floor(Math.random() * can.length)];
      p.bag.splice(i, 1);
      p.say(`Szmaug tüze megperzselt és hátravetett! Elégett: ${f.name}.`, 4);
    } else {
      p.addHunger(-8 / life);
      p.say('Szmaug tüze megperzselt és hátravetett!', 4);
    }
    this.fx?.addScorch(p.pos.x, p.pos.z, p.pos.y);
    return true;
  }

  /* ---------------- sound: a short whoosh and roar for the burst (synthesised) ---------------- */

  sound(kind) {
    if (this.game.bench || this.game.decor?.mute) return;
    const ctx = this.smaug?.audio?.ctx || (this.smaug?.ensureAudio?.() && this.smaug.audio?.ctx);
    if (!ctx || kind !== 'fire') return;
    const t = ctx.currentTime;
    const len = ctx.sampleRate * 1.8;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / 2000) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(2200, t + 0.3);
    lp.frequency.linearRampToValueAtTime(600, t + 1.7);
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(lp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    const game = this.game;
    this.time += dt;
    const s = this.smaug;
    // NOTES-16-smaug-talk: the timers; the finale (busy) or a slain Smaug ends a conversation at once.
    if (this.talkCd > 0) this.talkCd -= dt;
    if (this.lull > 0) this.lull -= dt;
    if (this.talk && !this.listening) {
      const tk = this.talk;
      this.talk = null;
      tk.dispose();
      this.mode = 'settle';
    }
    if (s) s.mute = !!game.bench || !!game.decor?.mute;
    this.updateSickness(dt);
    let anyNear = false;
    let snore = 0;
    let duck = 1;
    for (const p of game.players) {
      if (p.choosing) continue;
      const y = p.pos.y;
      if (y < -495) anyNear = true;
      // The first warning over the treasury.
      if (!p.warnedHoard && y < -578.5 && y > -581.5 && p.dead <= 0) {
        p.warnedHoard = true;
        p.say('Szmaug kincstára fölött jársz: alattad horkol a sárkány. Halkan áss, és lopakodj (guggolva)!', 7);
      }
      // The snoring's loudness: faint from the deep mines on, loud in the treasury (TERV 0.11/2).
      let lv = y < -500 ? 0.14 * Math.min(1, (-500 - y) / 81) : 0;
      if (inHoardLayer(p.pos)) lv += 0.22;
      const r = s ? p.pos.distanceTo(this.headPos) : 99;
      if (inHoard(p.pos)) lv += 0.64 * clamp(1.25 - r / 22, 0, 1);
      snore = Math.max(snore, lv);
      if (inHoard(p.pos)) duck = Math.min(duck, 1 - 0.55 * clamp(1.35 - r / 16, 0, 1));
    }
    if (s && !s.gone) {
      if (this.listening) {
        s.headPos(this.headPos);
        this.updateNoise(dt);
        this.updateSmaug(dt);
        if (this.mode === 'wake') duck = Math.min(duck, 0.3);
      }
      s.snoreLevel = snore;
      // Smaug is posed and animated only while somebody is deep enough to see or hear him (or the finale drives him).
      if (anyNear || s.busy) s.update(dt);
      else if (s.audio) s.updateSound(dt, 0);
    }
    this.neck?.update(!!s && this.listening && anyNear); // NOTES-27-loose
    if (game.music) game.music.near = duck;
    this.secret?.update(dt); // NOTES-22-secret
    // The HUD overlays.
    game.players.forEach((p, i) => this.updateHud(p, i));
    for (const p of game.players) p.hoardFire = Math.max(0, (p.hoardFire || 0) - dt * 1.6);
  }

  updateHud(p, i) {
    const hud = this.game.huds?.[i];
    if (!hud) return;
    let h = this.huds.get(hud);
    if (!h) {
      if (!inHoardLayer(p.pos) && !p.sick && !(p.sickT > 0)) return;
      h = new HoardHud(hud);
      this.huds.set(hud, h);
    }
    const show = this.listening && !p.choosing && inHoardLayer(p.pos);
    const labels = { sleep: 'Szmaug alszik', stir: 'Szmaug mocorog…', wake: 'Szmaug felébredt!', settle: 'Szmaug elcsendesedik…', talk: 'Szmaug beszél…' };
    let prompt = '';
    const g = hud.g || {};
    if (!p.choosing && p.dead <= 0) {
      const partner = this.sickPartnerNear(p);
      if (partner) prompt = `<span class="pr-in"><span>Térítsd észhez: ${partner.ch.name}</span>${g.interact || ''}</span>`;
      else if (this.arkenstoneNear(p)) prompt = `<span class="pr-in"><span>Az Arkenkő</span>${g.interact || ''}</span>`;
      else if (this.secret) prompt = this.secret.prompt(p, g); // NOTES-22-secret: the sealed door, Thrór's throne
    }
    // NOTES-16-smaug-talk: the time the conversation bought shows under the eye.
    const label = this.lull > 0 && this.mode !== 'wake' ? `${labels[this.mode]} · ${Math.ceil(this.lull)} mp` : labels[this.mode];
    h.update({ show, noise: this.noise, state: this.mode, label, sick: p.sickT || 0, fire: p.hoardFire || 0, prompt });
  }

  /** Per view: nothing of its own (hoard-fx.js culls the loot, the stone and Smaug by the hall's chunks). */
  cullFor() {}

  /** The music in the treasury: 'szmaug' (TERV 0.10) while a player is in layer 9 and Smaug lies on the hoard. */
  musicSituation() {
    if (!this.listening) return null;
    return this.game.players.some((p) => !p.choosing && inHoardLayer(p.pos)) ? 'szmaug' : null;
  }
}
