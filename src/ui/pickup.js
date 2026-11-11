/* ==== ui/pickup.js — the pickup filter's toggles on the Zsák screen (NOTES-44-pickup-edge, TODO item 35) ====
 * A parchment strip along the bottom of the pause's Zsák screen (ui/screens.js shows it with the bag): one row per
 * player, four toggles (Étel, Apró holmi, Értékes leletek, Drágakövek: finds.js PICKUP_CATS) saying whether that kind of
 * dug find goes into his bag. Every player switches only his own row, with his own device:
 *   - the mouse player: 1 2 3 4 (the top row's digits; free on every screen),
 *   - the F2 player: 7 8 9 Ö (Digit7 … Digit0),
 *   - a pad: Y moves the mark along the row, X switches the marked toggle (A / B / the D-pad stay the bag's);
 *   - the mouse: a click on a toggle.
 * Built once per opening (one innerHTML), a toggle changes two classes and one text; nothing runs while it is closed. The
 * save is written once when the screen closes, if something changed (as the skills screen does). ==== */
import { PICKUP_CATS } from '../finds.js';
import { deviceOf, glyphs } from './glyphs.js';

/** The raw keys of the two keyboard halves, one per category (in PICKUP_CATS order). */
export const PICKUP_KEYS = { mouse: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], keys2: ['Digit7', 'Digit8', 'Digit9', 'Digit0'] };
/** Standard-mapping pad buttons: X switches, Y moves the mark. */
const PAD_X = 2;
const PAD_Y = 3;

export class PickupPanel {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    el.className = 'pk-panel';
    this.focus = [0, 0];
    this.changed = false;
    this.open = false;
  }

  /** Shows the strip (with the bag). */
  show() {
    this.open = true;
    this.changed = false;
    this.render();
    this.el.classList.add('on');
  }

  /** Hides it; saves once if a toggle changed. */
  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('on');
    this.el.innerHTML = '';
    if (this.changed) {
      this.changed = false;
      Promise.resolve(this.game.saveNow?.()).catch((e) => console.warn('[pickup]', e));
    }
  }

  /** Rows shown: the players who have a character (index, player). */
  rows() {
    return this.game.players.map((p, i) => [i, p]).filter(([, p]) => p && !p.choosing && p.pickup);
  }

  /** Each player's own presses (raw keys and pad buttons of his binding). Called every frame while the bag is up. */
  input() {
    if (!this.open) return;
    const g = this.game;
    const keys = g.input.pressed;
    for (const [i] of this.rows()) {
      const b = g.bindings[i];
      if (!b) continue;
      const own = PICKUP_KEYS[b.kbm];
      if (own) own.forEach((code, k) => keys.has(code) && this.toggle(i, k));
      const pad = b.pad != null ? g.input.frame?.pads.get(b.pad) : null;
      if (pad) {
        if (pad.edges[PAD_Y]) {
          this.focus[i] = (this.focus[i] + 1) % PICKUP_CATS.length;
          this.mark(i);
        }
        if (pad.edges[PAD_X]) this.toggle(i, this.focus[i]);
      }
    }
  }

  /** Switches category k of player i and updates his row. */
  toggle(i, k) {
    const p = this.game.players[i];
    const c = PICKUP_CATS[k];
    if (!p?.togglePickup || !c) return;
    const on = p.togglePickup(c.id);
    this.changed = true;
    this.focus[i] = k;
    const row = this.el.querySelector(`.pk-row[data-i="${i}"]`);
    if (!row) return;
    const chip = row.querySelector(`.pk-chip[data-k="${k}"]`);
    chip?.classList.toggle('off', !on);
    if (chip) chip.querySelector('.pk-st').textContent = on ? 'felveszed' : 'otthagyod';
    row.querySelector('.pk-note').textContent = on ? `${c.label}: újra felveszed.` : `${c.label}: ásáskor otthagyod.`;
    this.mark(i);
  }

  /** Moves the pad's mark on row i. */
  mark(i) {
    const row = this.el.querySelector(`.pk-row[data-i="${i}"]`);
    if (!row?.classList.contains('pad')) return;
    row.querySelectorAll('.pk-chip').forEach((ch, k) => ch.classList.toggle('mk', k === this.focus[i]));
  }

  render() {
    const g = this.game;
    const shared = g.bindings.some((b) => b.kbm === 'keys2');
    const rows = this.rows().map(([i, p]) => {
      const b = g.bindings[i];
      const dev = deviceOf(b);
      const gl = glyphs(dev === 'pad' ? 'pad' : dev, shared);
      const keyOf = (k) => (b?.kbm && PICKUP_KEYS[b.kbm] ? glyphs(b.kbm, shared).pickup[k] : '');
      this.focus[i] = Math.min(this.focus[i] || 0, PICKUP_CATS.length - 1);
      const chips = PICKUP_CATS.map((c, k) => {
        const on = p.pickup[c.id] !== false;
        return `<button type="button" class="pk-chip${on ? '' : ' off'}${b?.pad != null && k === this.focus[i] ? ' mk' : ''}" data-k="${k}" title="${c.note}">
          ${keyOf(k)}<span class="pk-lb">${c.label}</span><span class="pk-st">${on ? 'felveszed' : 'otthagyod'}</span></button>`;
      }).join('');
      const padHint = b?.pad != null ? `<span class="pk-pad">${gl.pickNext || ''}<span class="or">másik</span>${gl.pickToggle || ''}<span class="or">be / ki</span></span>` : '';
      return `<div class="pk-row${b?.pad != null ? ' pad' : ''}" data-i="${i}" style="--pc:${p.ch?.color || '#7a3a10'}">
        <span class="pk-who"><b>${p.ch?.name || 'Játékos'}</b><small>ásáskor a zsákba:</small></span>
        <span class="pk-chips">${chips}</span>${padHint}<span class="pk-note"></span></div>`;
    }).join('');
    this.el.innerHTML = `<div class="pk-card"><h3>Felvétel</h3>${rows}
      <p class="pk-always">Mindig felveszed: a híres leleteket, Fullánkot, a Gyűrűt, a Mithrilpáncélt és az Arkenkövet. Az otthagyott lelet a falban marad.</p></div>`;
    this.el.querySelectorAll('.pk-row').forEach((row) => {
      const i = +row.dataset.i;
      row.querySelectorAll('.pk-chip').forEach((ch) => ch.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle(i, +ch.dataset.k);
      }));
    });
  }
}
