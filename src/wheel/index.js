/* ==== wheel/index.js — the action wheel (NOTES-43-wheel, TODO-QUEUE item 34) ====
 * Hold LB (pad), 2 (the mouse player) or 9 (the F2 player) for WHEEL.hold s and a parchment wheel opens on that player's
 * half: the left stick / the mouse / the arrows pick a slice, releasing the hold performs it, a release with nothing
 * picked does nothing. The game does not pause (co-op).
 *  - Called once per player per frame, right after the intent is read (ui/screens.js watch), so the release frame's intent
 *    carries the slice's own flag to every module that reads it (src/wheel/slices.js), exactly as the shortcut would.
 *  - The pad's LB is also the sneak / climb-down hold and the first key of three chords (LB + D-pad up = the charge,
 *    LB + RS = the wall tap, LB + View = the music skip): any other button pressed during the hold keeps the wheel shut
 *    for that hold, and closes an open wheel (the button does its usual thing). The wheel does not open while the left
 *    stick is pushed (sneaking along) nor on a ladder (LB climbs down), so a short tap, a sneak and every chord behave as
 *    before.
 *  - While open: the mouse player's view is frozen (the mouse picks) and his walk slowed to WHEEL.slow; the pad's stick
 *    and the F2 player's arrows pick, so they do not walk.
 *  - Unlocks and the one-time hint: a slice appears once its action is owned / met (slices.js `unlocked`); the slices
 *    seen and the hints shown are remembered per device in the settings ('egy-lyuk-settings-v1' `wheel`), never in the
 *    save. The first time on a device: one intro hint per kind of controls; later: "Új akció: …".
 *  - Cost while closed and not held: one counter step and a few boolean reads per player and frame. */
import { readSettings, writeSettings } from '../audio.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { BY_DIR, SLICES } from './slices.js';

export const WHEEL = {
  hold: 0.2, // s of hold before the wheel opens
  slow: 0.35, // the mouse player's walking speed while it is open
  pickOn: 0.5, // pick vector length that selects a slice
  pickOff: 0.3, // … and below which the selection is dropped (a centred stick: nothing)
  stick: 0.5, // left stick pushed this far during the hold: sneaking, the wheel stays shut
  mousePx: 110, // mouse movement (px) from the centre to the rim
  snap: 67.5, // degrees: the nearest shown slice within this angle of the pick is taken
  checkEvery: 30, // frames between unlock checks (about 2 a second)
  hintSeconds: 11,
};

/** Phases per player: idle, holding (waiting for WHEEL.hold), open, spent (held after a chord or a cancel). */
const IDLE = 0;
const HOLD = 1;
const OPEN = 2;
const SPENT = 3;

/** How each kind of controls is named in the hints. */
const HOW = {
  pad: { hold: 'az LB-t', pick: 'a bal karral' },
  mouse: { hold: 'a 2-es gombot', pick: 'az egérrel' },
  keys2: { hold: 'a 9-es gombot', pick: 'a nyilakkal' },
};

export class Wheel {
  constructor(game) {
    this.game = game;
    this.st = [];
    this.known = null; // Set of slice ids seen and intro hints shown on this device (lazy)
    /** QA / bench: force a hold (`force[i]`) and a pick vector (`forcePick[i]` = { x, y }) for player i. */
    this.force = [];
    this.forcePick = [];
    this.opens = 0;
    this.lastAct = null;
    this.introNow = new Set(); // control kinds whose intro hint went out this session (a second player with the same kind gets it too)
  }

  stateOf(i) {
    return (this.st[i] ||= { phase: IDLE, t0: 0, src: 'pad', vx: 0, vy: 0, sel: -1, frames: 0, rows: new Array(8).fill(null), chk: 0 });
  }

  /** Is player i's wheel open? */
  isOpen(i) {
    return this.st[i]?.phase === OPEN;
  }

  /**
   * Per player and frame, right after the intent is read. `blocked`: a menu or a screen held the player last frame.
   * May change `it` (the pick freezes the view, slows or stops the walk; the release frame gets the slice's flag).
   */
  step(p, i, it, blocked) {
    const s = this.stateOf(i);
    if (++s.frames >= WHEEL.checkEvery) {
      s.frames = 0;
      this.checkUnlocks(p, i);
    }
    const held = it.wheelPadHeld || it.wheelKeyHeld || !!this.force[i];
    if (!held && s.phase === IDLE) return;
    if (!held) {
      if (s.phase === OPEN && !it.wheelCancel) this.release(p, i, it, s);
      else if (s.phase === OPEN) this.close(i, s);
      s.phase = IDLE;
      return;
    }
    if (s.phase === IDLE) {
      s.phase = HOLD;
      s.t0 = performance.now();
      s.src = it.wheelKeyHeld || this.force[i] ? (this.game.bindings[i]?.kbm === 'keys2' ? 'keys2' : 'mouse') : 'pad';
    }
    if (s.phase === SPENT) return;
    const padSrc = s.src === 'pad';
    if (s.phase === HOLD) {
      const stick = Math.hypot(it.padPickX || 0, it.padPickY || 0);
      if ((padSrc && (it.wheelOther || stick > WHEEL.stick)) || blocked || it.pausePressed) {
        s.phase = SPENT;
        return;
      }
      if (performance.now() - s.t0 < WHEEL.hold * 1000) return;
      if (!this.canOpen(p, i, padSrc)) {
        // A pad's LB on a ladder / a held player: the hold stays what it was (no wheel this time).
        s.phase = SPENT;
        return;
      }
      this.openFor(p, i, s);
    }
    // Open.
    if ((padSrc && it.wheelOther) || blocked || it.pausePressed || !this.canStay(p)) {
      this.close(i, s);
      s.phase = SPENT;
      return;
    }
    this.pick(it, i, s);
    // The pick's input does not move the player; the mouse player's keys walk slowly.
    if (s.src === 'mouse') {
      it.lookX = 0;
      it.lookY = 0;
      it.mx *= WHEEL.slow;
      it.mz *= WHEEL.slow;
    } else {
      it.mx = 0;
      it.mz = 0;
      if (s.src === 'keys2') it.upPressed = it.downPressed = it.leftPressed = it.rightPressed = false;
    }
    this.draw(p, i, s);
  }

  /** May the wheel open for p now (free play, alive, not on a ladder with the pad's LB, something to show)? */
  canOpen(p, i, padSrc) {
    if (!this.canStay(p)) return false;
    if (padSrc && p.climbing) return false;
    return SLICES.some((sl) => this.shown(sl, p));
  }

  canStay(p) {
    const g = this.game;
    return !p.choosing && !(p.dead > 0) && !p.riding && !p.asleep && !p.held && !p.wrap && !g.screens?.view;
  }

  shown(sl, p) {
    return sl.unlocked(p, this.game) || !!this.known?.has(sl.id);
  }

  openFor(p, i, s) {
    s.phase = OPEN;
    s.vx = 0;
    s.vy = 0;
    s.sel = -1;
    s.chk = 0;
    s.heldMs = performance.now() - s.t0; // QA: how long the hold lasted before the wheel opened
    this.opens++;
    this.view(i)?.show();
    this.draw(p, i, s, true);
  }

  close(i, s) {
    s.sel = -1;
    this.view(i)?.hide();
  }

  /** The HUD's wheel (built on the first open). */
  view(i) {
    return this.game.huds[i]?.wheelView?.();
  }

  /** Moves the pick vector by this frame's input and updates the highlighted slot. */
  pick(it, i, s) {
    const f = this.forcePick[i];
    if (f) {
      s.vx = f.x;
      s.vy = f.y;
    } else if (s.src === 'pad') {
      s.vx = it.padPickX || 0;
      s.vy = it.padPickY || 0;
    } else if (s.src === 'mouse') {
      s.vx += (it.mousePickX || 0) / WHEEL.mousePx;
      s.vy += (it.mousePickY || 0) / WHEEL.mousePx;
      const l = Math.hypot(s.vx, s.vy);
      if (l > 1) {
        s.vx /= l;
        s.vy /= l;
      }
    } else if (it.keyPickEdge && (it.keyPickX || it.keyPickY)) {
      // The F2 player's arrows: the last direction pressed stays picked (releasing the arrows does not drop it).
      const l = Math.hypot(it.keyPickX, it.keyPickY);
      s.vx = it.keyPickX / l;
      s.vy = it.keyPickY / l;
    }
    const len = Math.hypot(s.vx, s.vy);
    if (len < WHEEL.pickOff) s.sel = -1;
    else if (len >= WHEEL.pickOn || s.sel < 0) {
      if (len < WHEEL.pickOn) return;
      const ang = ((Math.atan2(s.vx, -s.vy) * 180) / Math.PI + 360) % 360;
      let best = -1;
      let bestD = WHEEL.snap;
      for (let k = 0; k < 8; k++) {
        if (!s.rows[k]) continue;
        const d = Math.abs(((ang - k * 45 + 540) % 360) - 180);
        if (d <= bestD) {
          bestD = d;
          best = k;
        }
      }
      s.sel = best;
    }
  }

  /** Recomputes the slices' rows (every frame while open: a few property reads each) and draws them. */
  draw(p, i, s, first = false) {
    const g = this.game;
    const gl = glyphs(deviceOf(g.bindings[i]), g.bindings.some((b) => b.kbm === 'keys2'));
    for (let k = 0; k < 8; k++) {
      const sl = BY_DIR[k];
      if (!this.shown(sl, p)) {
        s.rows[k] = null;
        continue;
      }
      const r = sl.state(p, g);
      r.glyph = gl[sl.glyph] || '';
      s.rows[k] = r;
    }
    if (first) return this.draw(p, i, s); // the pick needs the rows; the first frame draws once more with them
    if (s.sel >= 0 && !s.rows[s.sel]) s.sel = -1;
    const r = s.sel >= 0 ? s.rows[s.sel] : null;
    const how = HOW[s.src] || HOW.pad;
    const hub = r
      ? { title: BY_DIR[s.sel].name, text: r.why || r.count || 'Engedd el: végrehajtod', bad: !!r.why }
      : { title: 'Akciókerék', text: `Válassz ${how.pick}, majd engedd el`, bad: false };
    this.view(i)?.update(s.rows, s.sel, hub);
  }

  /** The hold was released with the wheel open: the picked slice acts (a greyed one only says why). */
  release(p, i, it, s) {
    const k = s.sel;
    const r = k >= 0 ? s.rows[k] : null;
    this.close(i, s);
    if (!r) {
      this.lastAct = { slot: i, id: null, ok: false };
      return;
    }
    const sl = BY_DIR[k];
    const st = sl.state(p, this.game);
    if (!st.ok) {
      p.say(`${BY_DIR[k].name}: ${st.why}.`, 2.2);
      this.lastAct = { slot: i, id: sl.id, ok: false, why: st.why };
      return;
    }
    sl.act(p, this.game, it);
    this.lastAct = { slot: i, id: sl.id, ok: true };
  }

  /* ---------------- unlocks and the one-time hints ---------------- */

  loadKnown() {
    if (this.known) return;
    const list = readSettings().wheel;
    this.known = new Set(Array.isArray(list) ? list : []);
  }

  saveKnown() {
    writeSettings({ wheel: [...this.known] });
  }

  introHtml(all, how, gl) {
    const names = all.map((sl) => sl.name.toLowerCase()).join(', ');
    return `<b>Akciókerék:</b> tartsd nyomva ${how.hold} (${gl.wheel}), válassz ${how.pick}, és engedd el. Itt éred el: ${names}.`;
  }

  /** About twice a second per player: newly unlocked slices are remembered and announced once (per device). */
  checkUnlocks(p, i) {
    const g = this.game;
    if (g.bench || g.modes?.versus || p.choosing || p.dead > 0 || !g.tutorial?.note) return;
    if (g.tutorial.hints?.has(p)) return; // another hint is up: try again later
    this.loadKnown();
    const dev = deviceOf(g.bindings[i]);
    const how = HOW[dev] || HOW.pad;
    const gl = glyphs(dev, g.bindings.some((b) => b.kbm === 'keys2'));
    const fresh = SLICES.filter((sl) => !this.known.has(sl.id) && sl.unlocked(p, g));
    const intro = `intro-${dev}`;
    const st = this.stateOf(i);
    if (this.introNow.has(dev) && !st.intro) {
      // The intro went to the other player with the same kind of controls this session: this one sees it as well.
      const all = SLICES.filter((sl) => this.shown(sl, p));
      if (g.tutorial.note(p, this.introHtml(all, how, gl), WHEEL.hintSeconds)) st.intro = true;
      return;
    }
    if (!this.known.has(intro)) {
      // The first time on this device with these controls: one hint naming everything already unlocked (only once
      // there is a choice: two slices or more).
      const all = SLICES.filter((sl) => sl.unlocked(p, g) || this.known.has(sl.id));
      if (all.length < 2) return;
      if (!g.tutorial.note(p, this.introHtml(all, how, gl), WHEEL.hintSeconds)) return;
      st.intro = true;
      this.introNow.add(dev);
      this.known.add(intro);
      for (const sl of all) this.known.add(sl.id);
      this.saveKnown();
      return;
    }
    if (!fresh.length) return;
    const names = fresh.map((sl) => sl.name).join(', ');
    if (!g.tutorial.note(p, `<b>Új akció: ${names}</b> — tartsd nyomva ${how.hold} (${gl.wheel}), és válaszd ki ${how.pick}.`, WHEEL.hintSeconds)) return;
    for (const sl of fresh) this.known.add(sl.id);
    this.saveKnown();
  }
}
