/* ==== input.js — keyboard + mouse and the gamepads, turned into one intent per player per frame ==== */

const DEAD = 0.18;
const LOOK_PAD = 2.8; // rad/s at full stick
const LOOK_MOUSE = 0.0022; // rad per pixel

/** Standard gamepad mapping indices. */
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const dz = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * ((Math.abs(v) - DEAD) / (1 - DEAD)));

export function emptyIntent() {
  return {
    mx: 0, mz: 0, lookX: 0, lookY: 0,
    dig: false, digPressed: false, ladderPressed: false, jumpPressed: false, jumpHeld: false, climbDown: false,
    interactPressed: false, backPressed: false, upPressed: false, downPressed: false, leftPressed: false, rightPressed: false, confirmPressed: false,
    startPressed: false, leaveHeld: false, exitPressed: false,
    // Combat (enemies/combat.js): throw a stone, the character's ability (Kíli's bow, Bombur's charge).
    throwPressed: false, abilityPressed: false,
    // The Ring (gollum/ring.js): Bilbo's ability slot puts it on / takes it off (TERV 0.4: "Gyűrű (Bilbó) vagy a karakter
    // saját képessége" share one D-pad slot), so it is the same key as the ability.
    ringPressed: false,
    // Bilbo's taunt of the spiders (mirkwood-foes/: the book's "Attercop" songs draw them to him).
    tauntPressed: false,
    // The use key held down (erebor-puzzles/: a tap turns a standing mirror, a hold takes it out).
    interactHeld: false,
    // Bilbo's journal (ui/journal.js, NOTES-9-journal): J or Tab / N / the pad's View (Back) button.
    journalPressed: false,
    // The belay rope (safety/, NOTES-11-safety; TERV 0.4 D-pad "Kötél/Lift"): V, the F2 player's comma, the D-pad down.
    ropePressed: false,
    // The shared pause (ui/screens.js, NOTES-21-screens): Esc on the keyboard, Start (Menu) on a pad.
    pausePressed: false,
    // coop-actions (NOTES-23-coop-actions): the lamp held high (H, the F2 player's '-' key, a pad's right-stick click).
    lampPressed: false,
    // NOTES-25-map-contract: the map screen (ui/map.js): B, the F2 player's Ú, a pad's left-stick click.
    mapPressed: false,
  };
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = [false, false, false];
    this.mousePressed = [false, false, false];
    this.kbmUsed = false;
    this.padPrev = new Map();
    // Settings (ui/settings.js, NOTES-21-screens): look speed multiplier and inverted vertical look, for every device.
    this.lookScale = 1;
    this.invertY = false;
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.kbmUsed = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
      this.kbmUsed = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseDown[e.button] = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  lockPointer() {
    // The request is refused without a real user gesture or in an embedded/hidden view; that is harmless.
    if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.()?.catch?.(() => {});
  }

  pads() {
    return navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
  }

  /** Buttons pressed this frame on a pad (edge detection against the previous poll). */
  padEdges(pad) {
    const prev = this.padPrev.get(pad.index) || [];
    const now = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    this.padPrev.set(pad.index, now);
    return now.map((v, i) => v && !prev[i]);
  }

  /** Polls every source once; returns { kbm, pads: Map(index → {pad, edges}) }. Call once per frame. */
  poll() {
    const pads = new Map();
    for (const pad of this.pads()) pads.set(pad.index, { pad, edges: this.padEdges(pad) });
    this.frame = { pads };
    return this.frame;
  }

  /**
   * The intent of a player bound to an input source: `kbm` is 'mouse' (WASD + mouse, the left of the keyboard),
   * 'keys2' (arrows + IJKL, the right of the keyboard: a second player without a controller) or null; plus one pad.
   * `shared` is true while a 'keys2' player exists, so the mouse player leaves the arrows and Enter alone.
   */
  intent(kbm, padIndex, shared = false) {
    const it = emptyIntent();
    const k = this.keys;
    const p = this.pressed;
    if (kbm === 'mouse') {
      it.mz += (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      it.mx += (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      it.lookX += this.mouseDX * LOOK_MOUSE;
      it.lookY += this.mouseDY * LOOK_MOUSE;
      it.dig ||= this.mouseDown[0] || k.has('KeyF');
      it.digPressed ||= this.mousePressed[0] || p.has('KeyF');
      it.ladderPressed ||= this.mousePressed[2] || p.has('KeyQ');
      it.jumpPressed ||= p.has('Space');
      it.jumpHeld ||= k.has('Space');
      it.climbDown ||= k.has('ShiftLeft') || k.has('KeyC');
      it.interactPressed ||= p.has('KeyE');
      it.interactHeld ||= k.has('KeyE'); // erebor-puzzles/
      it.backPressed ||= p.has('Escape') || (!shared && p.has('Backspace'));
      it.upPressed ||= p.has('KeyW') || (!shared && p.has('ArrowUp'));
      it.downPressed ||= p.has('KeyS') || (!shared && p.has('ArrowDown'));
      it.leftPressed ||= p.has('KeyA') || (!shared && p.has('ArrowLeft'));
      it.rightPressed ||= p.has('KeyD') || (!shared && p.has('ArrowRight'));
      it.confirmPressed ||= p.has('Space') || (!shared && p.has('Enter'));
      it.exitPressed ||= p.has('KeyR');
      it.throwPressed ||= p.has('KeyG') || this.mousePressed[1];
      it.abilityPressed ||= p.has('KeyX');
      it.ringPressed ||= p.has('KeyX');
      it.tauntPressed ||= p.has('KeyT');
      // journal (NOTES-9-journal): J, or Tab (always; J belongs to the F2 player's IJKL while he plays).
      it.journalPressed ||= p.has('Tab') || (!shared && p.has('KeyJ'));
      it.ropePressed ||= p.has('KeyV'); // safety/
      it.pausePressed ||= p.has('Escape'); // screens (NOTES-21-screens); Esc still closes menus as backPressed
      it.lampPressed ||= p.has('KeyH'); // coop-actions (NOTES-23-coop-actions)
      it.mapPressed ||= p.has('KeyB'); // NOTES-25-map-contract: the map
    } else if (kbm === 'keys2') {
      it.mz += (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
      it.mx += (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
      // IJKL turn like a stick (the caller multiplies by dt).
      it.padLookX = ((k.has('KeyL') ? 1 : 0) - (k.has('KeyJ') ? 1 : 0)) * 2.2;
      it.padLookY = ((k.has('KeyK') ? 1 : 0) - (k.has('KeyI') ? 1 : 0)) * 1.6;
      it.dig ||= k.has('KeyU');
      it.digPressed ||= p.has('KeyU');
      it.ladderPressed ||= p.has('KeyO');
      it.jumpPressed ||= p.has('ShiftRight') || p.has('Numpad0');
      it.jumpHeld ||= k.has('ShiftRight') || k.has('Numpad0');
      it.climbDown ||= k.has('ControlRight') || k.has('Period');
      it.interactPressed ||= p.has('KeyP');
      it.interactHeld ||= k.has('KeyP'); // erebor-puzzles/
      it.backPressed ||= p.has('Backspace');
      it.upPressed ||= p.has('ArrowUp');
      it.downPressed ||= p.has('ArrowDown');
      it.leftPressed ||= p.has('ArrowLeft');
      it.rightPressed ||= p.has('ArrowRight');
      it.confirmPressed ||= p.has('Enter');
      // The key right of L (É on a Hungarian keyboard).
      it.exitPressed ||= p.has('Semicolon');
      // Right of P and right of É on a Hungarian keyboard: Ő throws, Á is the ability.
      it.throwPressed ||= p.has('BracketLeft');
      it.abilityPressed ||= p.has('Quote');
      it.ringPressed ||= p.has('Quote');
      // Right of Á on a Hungarian keyboard: Ű.
      it.tauntPressed ||= p.has('Backslash');
      // journal (NOTES-9-journal): N, below J on the right half of the keyboard.
      it.journalPressed ||= p.has('KeyN');
      it.ropePressed ||= p.has('Comma'); // safety/: right of M on the right half of the keyboard
      it.pausePressed ||= p.has('Escape'); // screens (NOTES-21-screens): one shared keyboard, one Esc
      it.lampPressed ||= p.has('Slash'); // coop-actions (NOTES-23-coop-actions): the '-' key right of '.' on a Hungarian keyboard
      it.mapPressed ||= p.has('BracketRight'); // NOTES-25-map-contract: the map; Ú, right of Ő on a Hungarian keyboard
    }
    const entry = padIndex != null ? this.frame?.pads.get(padIndex) : null;
    if (entry) {
      const { pad, edges } = entry;
      const ax = pad.axes;
      const btn = (i) => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
      it.mx += dz(ax[0] || 0);
      it.mz -= dz(ax[1] || 0);
      const lx = dz(ax[2] || 0);
      const ly = dz(ax[3] || 0);
      // Squared response for fine aiming; the caller multiplies by dt.
      it.padLookX = Math.sign(lx) * lx * lx * LOOK_PAD;
      it.padLookY = Math.sign(ly) * ly * ly * LOOK_PAD;
      it.dig ||= btn(B.RT) || btn(B.RB);
      it.digPressed ||= edges[B.RT] || edges[B.RB];
      it.ladderPressed ||= edges[B.LT] || edges[B.Y];
      it.jumpPressed ||= edges[B.A];
      it.jumpHeld ||= btn(B.A);
      it.climbDown ||= btn(B.LB);
      it.interactPressed ||= edges[B.X];
      it.interactHeld ||= btn(B.X); // erebor-puzzles/
      it.backPressed ||= edges[B.B];
      it.upPressed ||= edges[B.UP];
      it.downPressed ||= edges[B.DOWN];
      it.leftPressed ||= edges[B.LEFT];
      it.rightPressed ||= edges[B.RIGHT];
      it.confirmPressed ||= edges[B.A];
      it.startPressed ||= edges[B.START];
      it.leaveHeld ||= btn(B.BACK);
      it.exitPressed ||= edges[B.UP];
      // B is free while walking (it only closes menus); the character ability sits on the d-pad (TERV 0.4).
      it.throwPressed ||= edges[B.B];
      it.abilityPressed ||= edges[B.LEFT];
      it.ringPressed ||= edges[B.LEFT];
      it.tauntPressed ||= edges[B.RIGHT];
      // journal (NOTES-9-journal): a press of View / Back (holding it 2 s still makes player 2 leave, game.js).
      it.journalPressed ||= edges[B.BACK];
      // safety/: the D-pad's free slot (down) is the rope (TERV 0.4 "Kötél/Lift"); in menus it still navigates.
      it.ropePressed ||= edges[B.DOWN];
      // screens (NOTES-21-screens): Start (Menu) pauses; it only joins for a pad that is not bound yet (game.js).
      it.pausePressed ||= edges[B.START];
      it.lampPressed ||= edges[B.RS]; // coop-actions (NOTES-23-coop-actions): the right-stick click
      it.mapPressed ||= edges[B.LS]; // NOTES-25-map-contract: the map, the left-stick click
    }
    // Settings (NOTES-21-screens): look speed and inverted vertical look (mouse, the F2 player's IJKL, the right stick).
    if (this.lookScale !== 1) {
      it.lookX *= this.lookScale;
      it.lookY *= this.lookScale;
      if (it.padLookX) it.padLookX *= this.lookScale;
      if (it.padLookY) it.padLookY *= this.lookScale;
    }
    if (this.invertY) {
      it.lookY = -it.lookY;
      if (it.padLookY) it.padLookY = -it.padLookY;
    }
    return it;
  }

  /** Clears the per-frame accumulators; call at the end of the frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mousePressed = [false, false, false];
  }
}

export const PAD_BUTTONS = B;
