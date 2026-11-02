/* ==== laketown-events/index.js — the events and the trader of layer 7, "Tóváros alatt" (beneath Lake-town, 390–470 m;
   TERV 0.2, 0.3, 0.11/4, Decisions 5, 16, 18, 22):
   - rising water (flood.js): a bad pick stroke at a cavity's breach lets the lake in, the water rises at a fixed rate
     where a coarse flood fill over the density field lets it flow; the players race up and out. Normal mode never
     kills: under water a breath meter runs, when it is out the water washes the player up at a safe exit and one find
     is lost (like the cocoon / the capture); a partner can pull him up (the use key). Later the water drains slowly
     and the cavity can be dug again;
   - the current (sites.inCurrent): players in a flowing channel are carried along, they fight it slowly; loose barrels
     and crates drift with it (floaters.js);
   - Bárd the bargeman (bard.js) at his stall by the lift buys the finds a little below the Green Dragon's price.
   Wiring (small commented lines): game.js `new LaketownEvents(game)`, `sites.use({ ...LAKETOWN_SITE_PROVIDER, fx })`,
   `restore(save.laketownEvents)`, `input(p, i, it)` with no menu open, `update(dt)`, `cullFor(seen, i)` per view;
   player.js asks `ride(p, dt, it)` (the wash-up takes over), `waterStep(…)` in the water block (the flood's swimming,
   the current's push), `strike(p, o, d)` (no digging under water) and `dug(p, x, y, z)` after a dig (the breach);
   save.js `laketownEvents: game.laketownEvents?.state()`. ==== */
import { sharedAudio } from '../audio.js';
import { chunkKey, floorBelow } from '../enemies/sites.js';
import { sdf } from '../world.js';
import { Bard, BARD } from './bard.js';
import { Floaters } from './floaters.js';
import { Flood, FLOOD, FloodSurface, floodSwim } from './flood.js';
import { LaketownSites, pt } from './sites.js';

/** Breath and the wash-up (seconds). */
export const LT = {
  breath: 12, // seconds of air under water
  refill: 4, // breath regained per second above water
  washOut: 0.7, // fade out
  washDark: 0.6,
  washIn: 0.9,
  grace: 3, // seconds after a wash-up or a rescue before the breath can run again
  helpReach: 2.6, // m between a partner and the one under water for the pull
  bardHint: 7, // m from the stall: the first-meeting hint
};

/** Key names per control scheme (as tutorial.js and mirkwood-foes). */
const KEYS = {
  mouse: { use: 'E', move: 'W A S D', jump: 'Szóköz', dig: 'bal egérgomb' },
  keys2: { use: 'P', move: 'a nyilak', jump: 'jobb Shift', dig: 'U' },
  pad: { use: 'X', move: 'a bal kar', jump: 'A', dig: 'RT' },
};

const GOLD = 'color:var(--gold,#e8c070)';

export class LaketownEvents {
  constructor(game) {
    this.game = game;
    this.sites = new LaketownSites();
    this.floods = [];
    this.forVersion = -1;
    this.surface = new FloodSurface(game.scene);
    this.floaters = new Floaters(this);
    // Shown far below for game.js's first program compile (the instanced material), emptied on the first build.
    this.floaters.warmUp();
    this.bard = new Bard(this);
    this.ui = new Map();
    this.visibleKeys = [null, null];
    this.saved = null;
    this.gurgleT = 0;
    this.audio = null;
  }

  /* ---------------- queries ---------------- */

  keysFor(i) {
    const b = this.game.bindings[i];
    return b?.pad != null && !b.kbm ? KEYS.pad : KEYS[b?.kbm] || KEYS.pad;
  }

  anyFlood() {
    return this.floods.some((f) => f.active);
  }

  /** The flood whose water this point is in, or null. */
  floodAt(x, y, z) {
    for (const f of this.floods) if (f.active && f.wetAt(x, y, z)) return f;
    return null;
  }

  /** True when the point lies inside a flood's grid box (the players a flood concerns). */
  nearFlood(f, p) {
    return p.pos.x >= f.x0 && p.pos.x <= f.x0 + f.nx && p.pos.z >= f.z0 && p.pos.z <= f.z0 + f.nz && p.pos.y >= f.y0 - 1 && p.pos.y <= f.y0 + f.ny + 2;
  }

  underWater(p) {
    return !!(p.water && p.water.flood && p.water.submerged);
  }

  /* ---------------- player.js hooks ---------------- */

  /**
   * The water block (player.js): the current's push, and the flood's swimming when the player is in a flood. Returns
   * true when the flood handled the water (the other water steps are skipped).
   */
  waterStep(p, it, dt, wx, wz, menuOpen) {
    if (!this.sites.live || p.washed || p.choosing) return false;
    // The current carries the player along (a push on the position: walking against it is slow).
    const flow = this.sites.inCurrent(p.pos);
    p.inCurrent = !!flow && !p.climbing;
    if (p.inCurrent) {
      p.pos.x += flow.x * dt;
      p.pos.z += flow.z * dt;
    }
    const f = this.floodAt(p.pos.x, p.pos.y + 0.05, p.pos.z);
    p.floodIn = f;
    if (!f) {
      if (p.water?.flood) p.water = null;
      return false;
    }
    return floodSwim(p, it, dt, wx, wz, menuOpen, f);
  }

  /** player.tryDig before the dig: no digging under water. Returns true when the swing was used here. */
  strike(p) {
    if (!this.underWater(p)) return false;
    p.say('Víz alatt nem tudsz ásni. Fel a felszínre!', 1.5);
    return true;
  }

  /** player.tryDig after a dig at (x, y, z): a stroke at a cavity's breach lets the water in. */
  dug(p, x, y, z) {
    for (const f of this.floods) if (f.breaks(x, y, z)) this.startFlood(f, p);
  }

  /** player.update: the wash-up takes the player over (fade out, moved to the exit, fade in). */
  ride(p, dt) {
    const w = p.washed;
    if (!w) return false;
    w.t += dt;
    p.vel.set(0, 0, 0);
    p.fadeColor = '#061a1e';
    if (w.t < LT.washOut) p.fade = w.t / LT.washOut;
    else if (!w.moved) {
      w.moved = true;
      p.fade = 1;
      this.washUp(p, w.flood);
    } else {
      const k = (w.t - LT.washOut - LT.washDark) / LT.washIn;
      p.fade = Math.max(0, Math.min(1, 1 - k));
      if (k >= 1) {
        p.washed = null;
        p.fade = 0;
      }
    }
    p.grounded = true;
    p.climbing = false;
    return true;
  }

  /* ---------------- the flood ---------------- */

  startFlood(f, by) {
    f.start();
    this.sound('crack', f.breach);
    this.sound('gush', f.breach);
    this.game.players.forEach((p, i) => {
      if (p.choosing || !this.nearFlood(f, p)) return;
      p.say(p === by ? 'Rossz helyre sújtottál: betört a tó vize! Fuss felfelé, a kijáratokhoz!' : 'Betört a víz! Fuss felfelé, a kijáratokhoz!', 4);
      p.kick = 1;
      this.hint(p, i, 'arviz');
    });
  }

  /** The breath ran out: the water carries the player off (the wash-up in ride()). */
  startWash(p, f) {
    p.washed = { t: 0, moved: false, flood: f };
    this.sound('wash', p.pos);
  }

  /** Moves a washed-up player to the safe exit; one find is lost. */
  washUp(p, f) {
    // The cavity's exit above the water; when every exit is under water too, the lift's landing or Bárd's stall.
    const dry = (q) => q && !this.floodAt(q.x, q.y + 0.3, q.z);
    const e = [f?.safeExit(p.pos), pt(this.sites.src.lift), this.bard.stall].find(dry) || f?.safeExit(p.pos) || this.bard.stall;
    if (e) {
      const fl = floorBelow(e.x, e.y + 1.2, e.z, 4) || e;
      p.pos.set(fl.x, fl.y + 0.05, fl.z);
    }
    p.vel.set(0, 0, 0);
    p.water = null;
    p.floodIn = null;
    p.breath = LT.breath;
    p.ltGrace = LT.grace;
    p.kick = 0.8;
    let lost = null;
    if (p.bag.length) lost = p.bag.splice(Math.floor(Math.random() * p.bag.length), 1)[0];
    p.say(lost ? `A víz kisodort a kijáratig. Odaveszett: ${lost.name}.` : 'A víz kisodort a kijáratig. Köhögve szeded a levegőt.', 4);
    for (const q of this.game.players) if (q !== p && !q.choosing) q.say(`${p.ch.name}t kisodorta a víz a kijárathoz.`, 3);
    this.sound('gasp', p.pos);
  }

  /** A partner pulls the one under water up beside him: breath back, no find lost. */
  pullUp(q, by) {
    const bx = by.pos.x + Math.sin(by.yaw) * 0.7;
    const bz = by.pos.z + Math.cos(by.yaw) * 0.7;
    const room = sdf(bx, by.pos.y + 0.5, bz) < 0 && sdf(bx, by.pos.y + q.eyeH, bz) < 0;
    q.pos.set(room ? bx : by.pos.x, by.pos.y + 0.05, room ? bz : by.pos.z);
    q.vel.set(0, 0, 0);
    q.water = null;
    q.breath = LT.breath;
    q.ltGrace = LT.grace;
    q.kick = 0.6;
    q.say(`${by.ch.name} kihúzott a vízből!`, 3);
    by.say(`Kihúztad ${q.ch.name}t a vízből!`, 2.5);
    this.sound('gasp', q.pos);
  }

  /** The partner a player could pull up now, or null. */
  helpable(p) {
    if (this.underWater(p) || p.washed || p.dead > 0 || p.choosing) return null;
    for (const q of this.game.players) {
      if (q === p || q.choosing || q.dead > 0 || q.washed || !q.floodIn) continue;
      if (!this.underWater(q) && !(q.water?.swimming && (q.breath ?? LT.breath) < LT.breath)) continue;
      if (Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < LT.helpReach && Math.abs(q.pos.y - p.pos.y) < 3) return q;
    }
    return null;
  }

  /* ---------------- input ---------------- */

  /** Per player with no menu open: the use key at Bárd's stall (trade) or beside a partner under water (the pull). */
  input(p, i, it) {
    if (p.choosing || p.dead > 0 || p.washed || !it.interactPressed || !this.sites.live) return;
    if (this.bard.near(p)) {
      this.bard.use(p);
      return;
    }
    const q = this.helpable(p);
    if (q) this.pullUp(q, p);
  }

  /* ---------------- per frame ---------------- */

  /** (Re)builds the floods and places Bárd when the provider changes. */
  build() {
    if (this.forVersion === this.sites.version) return;
    this.forVersion = this.sites.version;
    this.surface.dispose();
    this.floods = this.sites.cavities.filter((c) => c && c.id != null && c.min && c.max).map((c) => new Flood(c));
    for (const f of this.floods) f.restore(this.saved?.cav?.[f.id]);
    this.bard.place(this.sites.bardStall);
  }

  update(dt) {
    const game = this.game;
    this.build();
    if (game.bench) this.benchEvents();
    const fx = this.sites.fx;
    for (const f of this.floods) {
      const was = f.active;
      const ev = f.update(dt);
      if (ev === 'draining') this.tellNear(f, 'A víz apadni kezd…', 3);
      if (ev === 'drained') this.tellNear(f, 'Leapadt a víz. A barlang újra ásható.', 4);
      if (fx?.setFloodLevel) {
        if (f.active) fx.setFloodLevel(f.id, f.level);
        else if (was) fx.setFloodLevel(f.id, null);
      } else this.surface.update(f);
    }
    this.bardRetreat();
    // A gurgle now and then near a rising flood.
    this.gurgleT -= dt;
    if (this.gurgleT <= 0) {
      this.gurgleT = 1.3 + Math.random() * 0.8;
      for (const f of this.floods) {
        const p = f.state === 'rising' && game.players.find((q) => !q.choosing && this.nearFlood(f, q));
        if (p) this.sound('gurgle', p.pos);
      }
    }
    game.players.forEach((p, i) => {
      if (p.choosing) return;
      p.breath ??= LT.breath;
      p.ltGrace = Math.max(0, (p.ltGrace || 0) - dt);
      if (p.dead > 0) {
        p.washed = null;
        p.breath = LT.breath;
        return;
      }
      if (this.underWater(p) && !p.washed) {
        if (p.ltGrace <= 0) p.breath = Math.max(0, p.breath - dt);
        if (!p.underSaid) {
          p.underSaid = true;
          p.say('Elborított a víz! Fogy a levegőd — ki a vízből, vagy kérd a társad segítségét!', 3);
        }
        if (p.breath <= 0) this.startWash(p, p.floodIn);
      } else {
        p.breath = Math.min(LT.breath, p.breath + LT.refill * dt);
        if (p.breath >= LT.breath) p.underSaid = false;
      }
      if (p.inCurrent && !p.currentSaid) {
        p.currentSaid = true;
        p.say('Elkapott a sodrás!', 2);
        this.hint(p, i, 'aramlat');
      } else if (!p.inCurrent) p.currentSaid = false;
      const s = this.bard.stall;
      if (s && Math.hypot(p.pos.x - s.x, p.pos.y - s.y, p.pos.z - s.z) < LT.bardHint) this.hint(p, i, 'bard');
    });
    this.bard.update(dt);
    this.floaters.update(dt, this.sites);
    this.updateUi();
  }

  /**
   * The wharf floods to near its roof (NOTES-18-levelfix): while the water stands more than chest-high at Bárd's stall he
   * waits at that cavity's dry exit up the tunnel (and trades there); he goes back to his stall when it is shallow again.
   */
  bardRetreat() {
    const home = this.sites.bardStall;
    if (!home) return;
    const f = this.floods.find((q) => q.active && q.wetAt(home.x, home.y + 1.1, home.z));
    if (f) {
      if (this.bard.stall === home || this.bardAway?.flood !== f) {
        const e = f.safeExit(home);
        if (!e) return;
        const yaw = Math.atan2(-(home.x - e.x), -(home.z - e.z));
        this.bardAway = { flood: f, spot: { x: e.x, y: e.y, z: e.z, yaw } };
        this.bard.place(this.bardAway.spot);
        this.tellNear(f, 'Bárd a víz elől feljebb húzódott az alagútba.', 3);
      }
    } else if (this.bardAway) {
      this.bardAway = null;
      this.bard.place(home);
    }
  }

  tellNear(f, text, s) {
    for (const p of this.game.players) if (!p.choosing && this.nearFlood(f, p)) p.say(text, s);
  }

  cullFor(visible, viewIndex = 0) {
    this.visibleKeys[viewIndex] = visible;
    const vis = (x, y, z) => {
      const k = chunkKey(x, y, z);
      return k < 0 || !!visible[k];
    };
    this.floaters.cullFor(vis);
    const s = this.bard.stall;
    if (s) this.bard.body.group.visible = vis(s.x, s.y + 0.4, s.z) || vis(s.x, s.y + 1.6, s.z);
  }

  /* ---------------- hints, sounds and the per-player overlay ---------------- */

  /** One parchment hint per player with his own keys (tutorial.js hint; the id carries the slot, so both get it). */
  hint(p, i, id) {
    const k = this.keysFor(i);
    const text = {
      arviz: `<b style="${GOLD}">Betört a víz!</b> Fuss felfelé, a barlang kijárataihoz, mielőtt a víz eléri a mennyezetet. Úszni lassan lehet; víz alatt nem áshatsz, és fogy a levegőd. Ha elfogy, a víz kisodor a kijáratig, és elvesztesz egy leletet. Ha a társad kerül víz alá, állj mellé, és húzd ki: ${k.use}. Később a víz lassan leapad.`,
      aramlat: `<b style="${GOLD}">Sodrás!</b> A víz magával visz. Ellene csak lassan haladsz (${k.move}); a partra kapaszkodva (${k.jump}) kiléphetsz belőle. A sodrás hordókat és ládákat is hoz.`,
      bard: `<b style="${GOLD}">Bárd, a tóvárosi bárkás.</b> Itt lent is megveszi a leleteidet (${k.use} nála, és még egyszer az eladáshoz) — valamivel olcsóbban, mint a Zöld Sárkány, de nem kell felmásznod.`,
    }[id];
    this.game.tutorial?.hint?.(i, p, `${id}-${i}`, text);
  }

  updateUi() {
    const game = this.game;
    game.players.forEach((p, i) => {
      const el = game.huds[i]?.el;
      if (!el) return;
      let ui = this.ui.get(p);
      if (!ui || ui.root !== el) {
        ui = { root: el, prompt: document.createElement('div'), tint: document.createElement('div'), air: document.createElement('div'), text: '', airN: -1, tintOn: false };
        Object.assign(ui.prompt.style, {
          position: 'absolute', left: '50%', top: '58%', transform: 'translateX(-50%)', fontSize: '17px', color: 'var(--gold, #e8c070)',
          textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '6', whiteSpace: 'nowrap',
        });
        // Under water: a murky green-blue veil, darker at the edges (CSS only, no full-screen pass).
        Object.assign(ui.tint.style, {
          position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '0', display: 'none',
          background: 'radial-gradient(ellipse at 50% 40%, rgba(20,70,70,0.35) 20%, rgba(6,30,34,0.72) 75%, rgba(2,12,14,0.92) 100%)',
        });
        // The breath: a row of air bubbles under the crosshair, popping one by one.
        Object.assign(ui.air.style, {
          position: 'absolute', left: '50%', top: '64%', transform: 'translateX(-50%)', display: 'none', gap: '6px', pointerEvents: 'none', zIndex: '6',
        });
        for (let k = 0; k < 8; k++) {
          const b = document.createElement('div');
          Object.assign(b.style, {
            width: '16px', height: '16px', borderRadius: '50%', border: '1px solid rgba(220,240,240,0.7)',
            background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.9) 0 18%, rgba(170,220,225,0.35) 40%, rgba(60,120,130,0.15) 75%)',
            boxShadow: '0 0 4px rgba(0,0,0,0.6)', transition: 'opacity 0.25s, transform 0.25s',
          });
          ui.air.appendChild(b);
        }
        // The veil goes under the HUD's own widgets (first child, z-index 0), the bubbles and the prompt over them.
        el.prepend(ui.tint);
        el.append(ui.air, ui.prompt);
        this.ui.set(p, ui);
      }
      const under = this.underWater(p) && !p.washed;
      if (under !== ui.tintOn) {
        ui.tintOn = under;
        ui.tint.style.display = under ? 'block' : 'none';
      }
      const showAir = !p.washed && p.dead <= 0 && (under || (p.breath ?? LT.breath) < LT.breath - 0.05);
      const n = showAir ? Math.ceil(((p.breath ?? LT.breath) / LT.breath) * 8) : -1;
      if (n !== ui.airN) {
        ui.airN = n;
        ui.air.style.display = showAir ? 'flex' : 'none';
        [...ui.air.children].forEach((b, k) => {
          b.style.opacity = k < n ? '1' : '0.12';
          b.style.transform = k < n ? 'scale(1)' : 'scale(0.6)';
        });
      }
      const k = this.keysFor(i);
      let text = '';
      if (!p.washed && p.dead <= 0) {
        const q = this.helpable(p);
        if (q) text = `Húzd ki ${q.ch.name}t a vízből: ${k.use}`;
        else if (under) text = 'Fogy a levegőd! Ki a vízből!';
        else text = this.bard.prompt(p, k);
      }
      if (text !== ui.text) {
        ui.text = text;
        ui.prompt.textContent = text;
      }
    });
  }

  /** Synthesised sounds (within 30 m of a player): the breach cracking, the gush, gurgles, the wash, a gasp, coins. */
  sound(kind, pos) {
    try {
      if (pos && this.game.players.every((p) => p.choosing || Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y, p.pos.z - pos.z) > 30)) return;
      if (this.game.decor?.mute) return;
      if (!this.audio) {
        this.audio = sharedAudio();
        if (!this.audio) return;
        const len = this.audio.sampleRate;
        this.noise = this.audio.createBuffer(1, len, this.audio.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const a = this.audio;
      if (a.state === 'suspended') a.resume();
      const t = a.currentTime;
      const burst = (start, dur, type, f0, f1, vol, q = 1) => {
        const src = a.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const f = a.createBiquadFilter();
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(f0, t + start);
        f.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(vol, t + start + Math.min(0.05, dur / 4));
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        src.connect(f).connect(g).connect(a.destination);
        src.start(t + start);
        src.stop(t + start + dur + 0.05);
      };
      const tone = (start, dur, type, f0, f1, vol) => {
        const o = a.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t + start);
        o.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(vol, t + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(a.destination);
        o.start(t + start);
        o.stop(t + start + dur + 0.05);
      };
      switch (kind) {
        // The rock gives: a sharp crack, then the lake roaring in.
        case 'crack': burst(0, 0.12, 'bandpass', 1800, 600, 0.7, 2); burst(0.05, 0.5, 'lowpass', 500, 90, 0.6); break;
        case 'gush': burst(0.1, 3.2, 'lowpass', 900, 260, 0.5); burst(0.15, 2.6, 'bandpass', 1400, 700, 0.18, 0.8); break;
        case 'gurgle': for (let k = 0; k < 3; k++) tone(k * 0.13, 0.11, 'sine', 180 + Math.random() * 140, 380 + Math.random() * 200, 0.05); break;
        case 'wash': burst(0, 1.4, 'lowpass', 1200, 150, 0.45); break;
        case 'gasp': burst(0, 0.35, 'bandpass', 900, 1500, 0.12, 1.2); burst(0.45, 0.25, 'bandpass', 800, 1300, 0.08, 1.2); break;
        case 'coins': for (let k = 0; k < 5; k++) tone(k * 0.07, 0.18, 'triangle', 2400 + k * 180, 2100 + k * 120, 0.04); break;
        default: break;
      }
    } catch (e) {
      // Sound is optional (no audio context in tests).
    }
  }

  /**
   * Bench only (`?lflood=` with tools/bench.mjs --q, on 2p-laketown): `off` nothing happens; `flood` both players in the
   * first cavity, its water already 1.2 m up and rising; `bard` both players in front of Bárd's stall; `current` both by
   * the first current, the floaters passing. Once the players are placed (game.js botIntent) and the terrain is loaded.
   */
  benchEvents() {
    const mode = this.game.params.get('lflood');
    if (!mode || this.benchDone || !this.game.terrain.loaded || !this.game.players[0]?.botInit) return;
    this.benchDone = true;
    const [p, q] = this.game.players;
    const put = (pl, x, y, z, yaw) => {
      if (!pl) return;
      const fl = floorBelow(x, y + 1.5, z, 6) || { x, y, z };
      pl.pos.set(fl.x, fl.y + 0.05, fl.z);
      pl.vel.set(0, 0, 0);
      pl.yaw = yaw;
    };
    if (mode === 'flood' && this.floods[0]) {
      const f = this.floods[0];
      const c = f.cav;
      const cx = (c.min.x + c.max.x) / 2;
      const cz = (c.min.z + c.max.z) / 2;
      put(p, cx - 1.5, f.floorY + 0.5, cz, Math.PI / 2);
      put(q, cx + 1.5, f.floorY + 0.5, cz, -Math.PI / 2);
      f.start();
      f.level = f.floorY + 1.2;
      f.fill();
    } else if (mode === 'bard' && this.bard.stall) {
      const s = this.bard.stall;
      const fx = -Math.sin(s.yaw || 0);
      const fz = -Math.cos(s.yaw || 0);
      put(p, s.x + fx * 3 - fz * 0.8, s.y, s.z + fz * 3 + fx * 0.8, (s.yaw || 0) + Math.PI);
      put(q, s.x + fx * 3.4 + fz * 0.8, s.y, s.z + fz * 3.4 - fx * 0.8, (s.yaw || 0) + Math.PI);
    } else if (mode === 'current' && this.sites.currents[0]) {
      const P = this.sites.currents[0].points;
      const a = P[Math.floor(P.length / 2)];
      const A = Array.isArray(a) ? { x: a[0], y: a[1], z: a[2] } : a;
      put(p, A.x + 2.2, A.y + 0.5, A.z, Math.PI / 2);
      put(q, A.x - 2.2, A.y + 0.5, A.z, -Math.PI / 2);
    }
  }

  /* ---------------- save ---------------- */

  /** Per cavity: rising / full / draining (with the level) or drained; omitted when nothing happened. */
  state() {
    const cav = {};
    let any = false;
    for (const f of this.floods) {
      const s = f.state4save();
      if (s) {
        cav[f.id] = s;
        any = true;
      }
    }
    // Floods of a provider that is not wired (yet) are kept as they were saved.
    for (const [id, s] of Object.entries(this.saved?.cav || {})) {
      if (!this.floods.some((f) => String(f.id) === id)) {
        cav[id] = s;
        any = true;
      }
    }
    return any ? { cav } : undefined;
  }

  restore(s) {
    this.saved = s && typeof s === 'object' ? s : null;
    this.forVersion = -1;
  }
}

export { BARD, FLOOD };
