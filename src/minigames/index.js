/* ==== minigames/index.js — the side minigames (TERV 0.11 "Hobbitos hangulat és minijátékok" and 0.11/9; technical note
   h.: separate, self-contained modules with their own state and input mapping, single player and split screen; 0.12
   themed UI). NOTES-13-minigames.
   - purse.js  William's talking purse in the troll cave (0.11/9)
   - golf.js   Bullroarer Took's golf in the garden, into the players' own dug holes (0.11/11)
   - plates.js the dwarves' plate throwing in Bag End (0.11/12)
   - smoke.js  the smoke-ring contest with Gandalf on the bench at evening (0.11/14)
   Wiring (small marked lines): game.js `this.minigames = new Minigames(this)` + `restore(save.minigames)` after the timed
   events, `bagEnd.slotRows`; the per-player chain `else if (this.minigames.input(p, i, it)) menuOpen = true;` before
   Bag End's input; `this.minigames.update(dt)` after the timed events; save.js `minigames: game.minigames?.state()`;
   player.js `tryDig` multiplies the cooldown by `minigames.digMult(p)`; bagend/effects.js `actions()` appends
   `be.slotRows(s, p, t)`.
   Idle cost: one prompt pass per player every 0.15 s (a few distance checks), nothing else. ==== */
import { glyphsOf, Overlay } from './common.js';
import { Golf } from './golf.js';
import { Plates } from './plates.js';
import { Purse } from './purse.js';
import { Smoke } from './smoke.js';

export class Minigames {
  constructor(game) {
    this.game = game;
    this.overlay = new Overlay(game);
    this.purse = new Purse(this);
    this.golf = new Golf(this);
    this.plates = new Plates(this);
    this.smoke = new Smoke(this);
    this.list = [this.purse, this.golf, this.plates, this.smoke];
    this.promptT = 0;
    this.lastDt = 1 / 60;
  }

  /** True while any minigame holds the player. */
  busy(p) {
    return this.list.some((m) => m.holds(p));
  }

  /**
   * Per player, before Bag End's input (game.js chain): a running minigame takes the player's intent (true = held,
   * like a menu); otherwise the use key near a start spot starts one (the press is used up).
   */
  input(p, i, it) {
    if (p.choosing) return false;
    for (const m of this.list) if (m.holds(p)) return m.input(p, i, it, this.lastDt) !== false;
    if (!it.interactPressed || p.dead > 0 || p.riding) return false;
    for (const m of this.list) {
      if (m.tryStart && m.tryStart(p, i)) {
        it.interactPressed = false;
        return this.busy(p);
      }
    }
    return false;
  }

  /** Bag End's slot menus: the plate game's start row at the crockery (bagend/effects.js hook). */
  slotRows(s, p, t) {
    return this.plates.slotRows(s, p, t);
  }

  /** player.js tryDig: the smoke-ring winner digs faster the next day. */
  digMult(p) {
    return this.smoke.digMult(p);
  }

  /** One parchment hint per player and game (tutorial.js hint; the id carries the slot). */
  hint(p, i, id, html, seconds = 12) {
    return !!this.game.tutorial?.hint?.(i, p, `mg-${id}-${p.slot ?? i}`, html, seconds);
  }

  update(dt) {
    this.lastDt = dt;
    let any = false;
    for (const m of this.list) {
      if (m.running) {
        m.update(dt);
        any = true;
      }
    }
    // The parchments of running games (every frame), the start prompts (every 0.15 s).
    this.promptT -= dt;
    const prompts = this.promptT <= 0;
    if (prompts) this.promptT = 0.15;
    if (!any && !prompts) return;
    this.game.players.forEach((p, i) => {
      const m = this.list.find((x) => x.holds(p));
      if (m) {
        this.overlay.box(p, i, m.html(p, i, glyphsOf(this.game, i)), m === this.golf || m === this.smoke ? 'low' : 'mid');
        m.draw?.(p);
        this.overlay.prompt(p, i, '');
      } else {
        if (any || prompts) this.overlay.box(p, i, '');
        if (prompts) {
          let text = '';
          if (!p.choosing && p.dead <= 0 && !p.riding) for (const x of this.list) if (!text && x.prompt) text = x.prompt(p, i);
          this.overlay.prompt(p, i, text);
        }
      }
    });
  }

  /** { purse: { d }, golf: { d: { slot: day } }, plates: { d: { slot: day } }, smoke: { d, b: { slot: day } } }, parts left out. */
  state() {
    const out = {};
    for (const [k, m] of [['purse', this.purse], ['golf', this.golf], ['plates', this.plates], ['smoke', this.smoke]]) {
      const s = m.state();
      if (s) out[k] = s;
    }
    return Object.keys(out).length ? out : undefined;
  }

  restore(s) {
    const o = s && typeof s === 'object' ? s : {};
    this.purse.restore(o.purse);
    this.golf.restore(o.golf);
    this.plates.restore(o.plates);
    this.smoke.restore(o.smoke);
  }
}
