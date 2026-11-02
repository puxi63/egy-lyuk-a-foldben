/* ==== coop-actions/hoist.js — the dwarves' hoist in the mines of Erebor (TERV 0.11/18 "a csigasor, amit ketten
   húztok"; 0.5 "a csigasort … ketten … húzzátok"; NOTES-23-coop-actions).
   - A plank platform on two ropes over a wheel in a timber gantry, in a shaft from the deepest gallery (574 m) up through
     the forges' floor (552 m): the dwarves' "Törpe csigasor" (lift.js gives the dwarf pulley that name). The shaft is
     cut once (world.js digSphere) the first time a player comes below HOIST.carveBelow; the dug terrain is saved.
   - It rises only when two pull at the same moment: two use presses within HOIST.window s, by players standing on the
     platform or at the two handles beside the top hole. Each pull together lifts it HOIST.step m; a pawl holds it
     between pulls. In single play Dori takes the other rope and calls the rhythm ("Hó… rukk!", every HOIST.beat s): the
     player pulls on his "rukk!".
   - Holding the use key releases the brake (one player is enough): it sinks back to the bottom. At the bottom, the use
     key under a raised platform calls it down the same way.
   - Players and a chest standing on it ride with it; a rail keeps walkers out of the top hole while it is down, and it
     never sinks onto a head. ==== */
import * as THREE from 'three';
import { digSphere, sdf } from '../world.js';
import { erFloorAt } from '../underground/erebor-sites.js';
import { buildHoist } from './models.js';
import { HOIST } from './rules.js';

const tmpV = new THREE.Vector3();

export class Hoist {
  constructor(ca) {
    this.ca = ca;
    this.game = ca.game;
    const H = HOIST;
    // The floors from the generated field (the gallery's floor under the axis, the forges' floor beside the hole).
    this.bottom = erFloorAt(H.x, H.z, H.bottom + 1.5, 3);
    this.top = erFloorAt(H.x + H.handle, H.z, H.top + 1.5, 3);
    this.def = { ...H, bottom: this.bottom, top: this.top };
    const m = buildHoist(ca.mat, this.def);
    this.model = m;
    for (const o of [m.platform, m.gantry, ...m.ropes]) {
      o.visible = false;
      this.game.scene.add(o);
    }
    this.y = this.bottom;
    this.target = this.bottom;
    this.sinking = false;
    this.carved = false;
    this.pulls = new Map(); // player → time (s) of the last pull
    this.holds = new Map(); // player → time the use key went down
    /** Single play: Dori's rhythm { t0, used, last } while he pulls. */
    this.beat = null;
    this.steps = 0; // QA: pulls that lifted it
  }

  get now() {
    return performance.now() / 1000;
  }

  get atTop() {
    return this.y >= this.top - 0.02;
  }

  get atBottom() {
    return this.y <= this.bottom + 0.02;
  }

  /** Horizontal distance from the shaft's axis. */
  axisDist(x, z) {
    return Math.hypot(x - HOIST.x, z - HOIST.z);
  }

  /** Is a point within the shaft column (for the Kihívás cave-in: never fill it)? */
  nearShaft(x, y, z) {
    return this.axisDist(x, z) < HOIST.r + 2.6 && y < this.top + 3 && y > this.bottom - 3;
  }

  onPlatform(p) {
    return this.axisDist(p.pos.x, p.pos.z) < HOIST.plat + 0.05 && Math.abs(p.pos.y - this.y) < 0.5;
  }

  /** At one of the two handles beside the top hole (on the forges' floor). */
  atHandle(p) {
    const d = this.axisDist(p.pos.x, p.pos.z);
    return d > HOIST.plat + 0.05 && d < HOIST.handle + 0.95 && Math.abs(p.pos.y - this.top) < 1.0;
  }

  /** A player who can pull now. */
  puller(p) {
    return this.carved && this.ca.free(p) && !p.carrying && (this.onPlatform(p) || this.atHandle(p));
  }

  /** Under the raised platform at the bottom (the use key calls it down). */
  below(p) {
    return this.carved && !this.atBottom && this.axisDist(p.pos.x, p.pos.z) < 2.2 && Math.abs(p.pos.y - this.bottom) < 1.3;
  }

  /** The use key pressed by a puller: one pull on the rope. */
  pull(p) {
    const t = this.now;
    this.pulls.set(p, t);
    this.sinking = false;
    if (this.atTop) {
      this.ca.say(p, 'hoist-top', 'A csigasor fent van: a kilincs tartja. (Tartsd lenyomva a gombot: kiold a fék, és leereszkedik.)', 4);
      return;
    }
    const others = this.ca.humans().filter((q) => q !== p);
    if (others.length) {
      const q = others.find((o) => this.puller(o) && t - (this.pulls.get(o) ?? -9) <= HOIST.window);
      if (q) {
        this.pulls.delete(q);
        this.pulls.delete(p);
        this.step([p, q]);
      } else if (!others.some((o) => this.puller(o))) this.ca.say(p, 'hoist-alone', `A csigasort ketten kell húzni: ${others[0].ch.name} álljon a pallóra vagy a másik kötélhez!`, 4);
      else this.ca.say(p, 'hoist-sync', 'Egyszerre! Mondjátok: „Hó… rukk!”, és a „rukk”-ra húzzatok mindketten.', 3);
      return;
    }
    // Single play: Dori's rope, on his rhythm.
    const H = this.ca.dori;
    if (!H || !H.placed) {
      this.ca.say(p, 'hoist-solo', 'Egyedül meg se moccan: a csigasort ketten kell húzni. (A Zöld Sárkány pultjánál felfogadhatod Dorit.)', 4);
      return;
    }
    if (!this.beat) {
      this.beat = { t0: t + 0.9, used: -1, last: t };
      p.say('Dori megragadja a másik kötelet: „Az én ütememre, betörő úr! Hó… rukk!”', 4);
      return;
    }
    this.beat.last = t;
    const b = this.beat;
    const k = Math.round((t - b.t0) / HOIST.beat);
    const tb = b.t0 + k * HOIST.beat;
    if (k >= 0 && k !== b.used && Math.abs(t - tb) <= HOIST.beatWin) {
      b.used = k;
      this.step([p]);
    } else this.ca.say(p, 'hoist-beat', 'Dori ütemére húzd: akkor, amikor rákiált, hogy „rukk!”', 2.5);
  }

  step(who) {
    this.target = Math.min(this.top, this.target + HOIST.step);
    this.steps++;
    for (const q of who) q.say(this.target >= this.top ? 'Hó-rukk! Felért a csigasor: a kilincs bekattant.' : 'Hó-rukk!', 1.2);
    if (this.steps === 1) for (const q of who) this.ca.hint('hoist', q);
  }

  /** The use key held: after HOIST.brakeHold s the brake comes off. */
  hold(p, it) {
    if (!it.interactHeld) {
      this.holds.delete(p);
      return;
    }
    if (!this.carved || this.atBottom || this.sinking) return;
    if (!this.puller(p) && !this.below(p)) return;
    const t = this.now;
    if (!this.holds.has(p)) this.holds.set(p, t);
    if (t - this.holds.get(p) >= HOIST.brakeHold) {
      this.holds.delete(p);
      this.release(p);
    }
  }

  release(p) {
    this.sinking = true;
    this.beat = null;
    p.say('Kioldod a féket: a csigasor lassan leereszkedik.', 3);
  }

  /** The use key under the raised platform: it comes down. */
  callDown(p) {
    if (!this.below(p) || this.sinking) return false;
    this.release(p);
    return true;
  }

  /** Cuts the shaft once (the dwarves' old shaft), the first time a player comes below HOIST.carveBelow. */
  carve() {
    const H = HOIST;
    let n = 0;
    for (let y = this.bottom + 1.0; y <= this.top - 0.1; y += 0.5) {
      if (sdf(H.x, y, H.z) < -H.r * 0.8 && sdf(H.x + H.r * 0.7, y, H.z) < -0.1 && sdf(H.x - H.r * 0.7, y, H.z) < -0.1) continue;
      digSphere(H.x, y, H.z, H.r);
      n++;
    }
    this.carved = true;
    this.cut = n;
  }

  /** A resting chest on the platform rides with it (chests.js). */
  ride(c) {
    if (!this.carved) return;
    if (this.axisDist(c.pos.x, c.pos.z) < HOIST.plat - 0.1 && c.pos.y > this.y - 0.75 && c.pos.y < this.y + 0.75) c.pos.y = this.y;
  }

  /** The lowest the platform may sink to: never onto a head (or a chest) in the shaft below it. */
  lowest() {
    let lo = this.bottom;
    for (const q of this.game.players) {
      if (q.dead > 0 || this.axisDist(q.pos.x, q.pos.z) > HOIST.plat + 0.35 || q.pos.y > this.y - 0.4) continue;
      lo = Math.max(lo, q.pos.y + (q.eyeH || 1.2) + 0.3);
    }
    return Math.min(lo, this.y);
  }

  update(dt) {
    const players = this.game.players;
    if (!this.carved) {
      if (players.some((q) => q.pos.y < HOIST.carveBelow && q.dead <= 0 && !q.choosing)) this.carve();
      return;
    }
    // Moving: up towards the target after a pull, or down with the brake off.
    const y0 = this.y;
    if (this.sinking) {
      this.target = Math.max(this.lowest(), this.target - HOIST.sink * dt);
      this.y = this.target;
      if (this.atBottom || this.y <= this.lowest() + 1e-3) this.sinking = false;
    } else if (this.y < this.target) this.y = Math.min(this.target, this.y + (HOIST.step / HOIST.stepT) * dt);
    else this.target = this.y;
    // Riders: the players standing on it move with it (no fall, no fall damage).
    for (const q of players) {
      if (q.dead > 0 || q.choosing || q.riding || q.climbing) continue;
      const d = this.axisDist(q.pos.x, q.pos.z);
      if (d < HOIST.plat + 0.05 && q.pos.y > y0 - 0.45 && q.pos.y < this.y + 0.5 && q.vel.y <= 0.5) {
        q.pos.y = this.y;
        q.vel.y = 0;
        q.grounded = true;
      } else if (!this.atTop && d < HOIST.rail && Math.abs(q.pos.y - this.top) < 1.0 && q.pos.y > this.top - 0.3) {
        // The rail round the top hole: pushed back out while the platform is down.
        const k = HOIST.rail / Math.max(0.01, d);
        q.pos.x = HOIST.x + (q.pos.x - HOIST.x) * k;
        q.pos.z = HOIST.z + (q.pos.z - HOIST.z) * k;
      }
    }
    // Single play: Dori's rhythm stops when the player leaves the ropes or stops pulling.
    const p0 = players[0];
    if (this.beat && (!this.ca.dori || players.length > 1 || this.now - this.beat.last > 7 || !this.puller(p0))) this.beat = null;
    this.draw(players);
  }

  /** Where Dori stands while he pulls: on the platform beside the player, else at the handle across from him. */
  doriSpot() {
    const p = this.game.players[0];
    if (!p) return null;
    if (this.onPlatform(p)) {
      const a = Math.atan2(p.pos.x - HOIST.x, p.pos.z - HOIST.z) + Math.PI;
      return tmpV.set(HOIST.x + Math.sin(a) * 0.42, this.y, HOIST.z + Math.cos(a) * 0.42);
    }
    const s = p.pos.x > HOIST.x ? -1 : 1;
    return tmpV.set(HOIST.x + s * HOIST.handle, this.top, HOIST.z);
  }

  /** Dori's call for the HUD in single play: 'ho' before the beat, 'rukk' around it, or ''. */
  call() {
    const b = this.beat;
    if (!b) return '';
    const t = this.now;
    if (t < b.t0 - HOIST.beat * 0.55) return 'ho';
    const ph = ((t - b.t0) % HOIST.beat + HOIST.beat) % HOIST.beat;
    return ph < HOIST.beatWin || ph > HOIST.beat - HOIST.beatWin ? 'rukk' : 'ho';
  }

  draw(players) {
    const m = this.model;
    const shown = players.some((q) => q.pos.y < -500 && Math.hypot(q.pos.x - HOIST.x, q.pos.y - (this.top + this.bottom) / 2, q.pos.z - HOIST.z) < 44);
    m.platform.visible = shown;
    m.gantry.visible = shown;
    for (const r of m.ropes) r.visible = shown;
    if (!shown) return;
    m.platform.position.y = this.y;
    const top = m.wheelY;
    const len = Math.max(0.05, top - (this.y + 1.14));
    m.ropes.forEach((r, k) => {
      r.position.set(HOIST.x + (k ? 0.07 : -0.07), top, m.ropeZ);
      r.scale.set(1, len, 1);
    });
  }

  /** The prompt line for p, or ''. */
  prompt(p) {
    if (!this.carved) return '';
    const key = this.ca.useKey(p);
    if (this.puller(p)) {
      if (this.atTop) return `Törpe csigasor: fent · ${key} nyomva tartva: kiold a fék`;
      if (this.sinking) return 'A csigasor ereszkedik…';
      if (this.beat) return this.call() === 'rukk' ? `Dori: „…rukk!” · ${key} MOST húzd!` : `Dori: „Hó…” · ${key} a „rukk”-ra húzd`;
      return `Törpe csigasor: ${key} húzzátok egyszerre · nyomva tartva: fék`;
    }
    if (this.below(p)) return `${key} lehívod a csigasort`;
    return '';
  }

  state() {
    return this.carved ? +this.y.toFixed(2) : null;
  }

  restore(y) {
    if (typeof y !== 'number') return;
    this.y = this.target = Math.max(this.bottom, Math.min(this.top, y));
  }
}
