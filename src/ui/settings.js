/* ==== ui/settings.js — the settings screen: Bilbo's writing desk (TERV 0.12 Beállítások; NOTES-21-screens) ====
 * The sliders are brass knobs (turned from -135° to +135°), the switches are candles (lit = on). Stored per device in
 * localStorage 'egy-lyuk-settings-v1' (audio.js readSettings / writeSettings), never in the game save.
 *   - Zene hangereje: the music (audio.js Music.level; the M key still steps it down).
 *   - Effektek hangereje: every synthesised sound (audio.js setEffectsLevel: a master gain on the shared context).
 *   - Nézelődés sebessége: mouse, the F2 player's IJKL and the right stick (input.js lookScale, ×0.5 … ×2).
 *   - Fordított függőleges nézés: input.js invertY.
 *   - Osztott képernyő egymás mellett: the split direction (the F3 key toggles it too; game.split 'v' / 'h').
 *   - Zene véletlen sorrendben: shuffle of the music lists (audio.js Music.setShuffle; NOTES-30-music).
 *   - Következő zeneszám: an action row (a page of a song book turned by a brass tab): skips to the next track.
 * Controls: up / down choose a row, left / right turn a knob (or flip a candle), A / Enter / Space flip a candle,
 * B / Esc / Backspace go back. With the mouse: click a knob's left or right half, scroll over it, click a candle. ==== */
import { effectsLevel, readSettings, setEffectsLevel, shuffleSetting, writeSettings } from '../audio.js';

/** Look speed: knob 0..1 → multiplier ×0.5 … ×2 (the default ×1 sits at one third). */
const lookOf = (v) => 0.5 + 1.5 * v;
const LOOK_DEFAULT = 1 / 3;
const pct = (v) => `${Math.round(v * 100)} %`;

/** Applies the stored settings at start-up (Screens' constructor): look speed, inverted look, the split direction. */
export function applySettings(game) {
  const s = readSettings();
  if (typeof s.look === 'number') game.input.lookScale = lookOf(s.look);
  game.input.invertY = !!s.invert;
  if ((s.split === 'v' || s.split === 'h') && !game.params.get('split') && game.split !== s.split) {
    game.split = s.split;
    game.layout();
  }
}

/** A brass knob: a ridged rim, a cap and a notch, turned by `--a` (deg). */
function knobSVG() {
  const ridges = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return `<path d="M${(50 + Math.cos(a) * 40).toFixed(1)} ${(50 + Math.sin(a) * 40).toFixed(1)}L${(50 + Math.cos(a) * 45).toFixed(1)} ${(50 + Math.sin(a) * 45).toFixed(1)}"/>`;
  }).join('');
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = ((-135 + i * 27) - 90) * (Math.PI / 180);
    return `<path d="M${(50 + Math.cos(a) * 49).toFixed(1)} ${(50 + Math.sin(a) * 49).toFixed(1)}L${(50 + Math.cos(a) * 54).toFixed(1)} ${(50 + Math.sin(a) * 54).toFixed(1)}"/>`;
  }).join('');
  return `<svg viewBox="-6 -6 112 112" aria-hidden="true">
    <g class="kn-ticks" stroke="#5a3a14" stroke-width="2.2" stroke-linecap="round">${ticks}</g>
    <g class="kn-turn">
      <circle cx="50" cy="50" r="45" fill="url(#kn-rim)" stroke="#4a3008" stroke-width="2"/>
      <g stroke="#7a5418" stroke-width="2.4">${ridges}</g>
      <circle cx="50" cy="50" r="34" fill="url(#kn-cap)" stroke="#6a4810" stroke-width="1.5"/>
      <circle cx="44" cy="42" r="12" fill="#fff6d0" opacity=".25"/>
      <path d="M50 22v18" stroke="#2a1806" stroke-width="5" stroke-linecap="round"/>
    </g>
  </svg>`;
}

/** A candle on a brass holder; `.lit` on the row shows the flame and its glow. */
function candleSVG() {
  return `<svg viewBox="0 0 60 120" aria-hidden="true">
    <ellipse class="cd-glow" cx="30" cy="30" rx="28" ry="30" fill="url(#cd-glow)"/>
    <g class="cd-flame"><path d="M30 12c-7 10-8 16-5 22 2 3 8 3 10 0 3-6 2-12-5-22z" fill="#ffcf5a"/><path d="M30 22c-3 5-3 9-1 12 1 1 3 1 4 0 1-3 1-7-3-12z" fill="#fff6d0"/></g>
    <path class="cd-smoke" d="M30 34c-4-6 4-10 0-16s4-10 0-14" fill="none" stroke="#9a948a" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M30 34v6" stroke="#2a1a0a" stroke-width="2"/>
    <rect x="21" y="40" width="18" height="56" rx="3" fill="#efe4c8" stroke="#a8946a" stroke-width="1.5"/>
    <path d="M24 44c0 10 2 14 0 22" stroke="#d8c8a0" stroke-width="2" fill="none"/>
    <path d="M8 98h44c0 6-8 10-22 10S8 104 8 98z" fill="url(#kn-rim)" stroke="#4a3008" stroke-width="1.5"/>
    <path d="M52 100c8 0 8 10 0 10" fill="none" stroke="#8a6420" stroke-width="3"/>
  </svg>`;
}

/** NOTES-30-music: a page of Bilbo's song book with a brass page-turn tab; `.turned` flips the page's corner once. */
function pageSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path d="M14 18h60l12 12v54H14z" fill="#efe4c8" stroke="#8a6a3a" stroke-width="2"/>
    <g stroke="#9a8460" stroke-width="1.4"><path d="M22 36h52M22 41h52M22 46h52M22 51h52M22 56h52"/></g>
    <g fill="#3a2410"><ellipse cx="34" cy="51" rx="4.2" ry="3.2"/><ellipse cx="52" cy="46" rx="4.2" ry="3.2"/><path d="M37.6 51V31M55.6 46V27" stroke="#3a2410" stroke-width="1.8"/><path d="M37.6 31l18-4v4l-18 4z"/></g>
    <g class="pg-corner"><path d="M74 18v12h12z" fill="#d8c8a0" stroke="#8a6a3a" stroke-width="2" stroke-linejoin="round"/></g>
    <g class="pg-tab"><path d="M58 66h22l8 8-8 8H58z" fill="url(#kn-rim)" stroke="#4a3008" stroke-width="2"/><path d="M64 69l6 5-6 5zM71 69l6 5-6 5z" fill="#2a1806"/></g>
  </svg>`;
}

/** Shared gradients for the knobs and candles (one copy in the screen). */
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="kn-rim" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#f4d88a"/><stop offset=".55" stop-color="#c0902e"/><stop offset="1" stop-color="#6a4410"/></radialGradient>
  <radialGradient id="kn-cap" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".6" stop-color="#d8a640"/><stop offset="1" stop-color="#8a5c16"/></radialGradient>
  <radialGradient id="cd-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/><stop offset="1" stop-color="#ffb040" stop-opacity="0"/></radialGradient>
</defs></svg>`;

export class SettingsView {
  /** @param {object} game  @param {HTMLElement} el the screen's element (built here) */
  constructor(game, el) {
    this.game = game;
    this.el = el;
    this.sel = 0;
    this.rows = [
      { id: 'music', kind: 'knob', label: 'Zene hangereje', get: () => game.music?.level ?? readSettings().music ?? 1, set: (v) => (game.music ? game.music.setLevel(v) : writeSettings({ music: v })), fmt: pct },
      { id: 'fx', kind: 'knob', label: 'Effektek hangereje', get: () => effectsLevel(), set: (v) => setEffectsLevel(v), fmt: pct },
      {
        id: 'look', kind: 'knob', label: 'Nézelődés sebessége', get: () => (typeof readSettings().look === 'number' ? readSettings().look : LOOK_DEFAULT),
        set: (v) => {
          writeSettings({ look: v });
          game.input.lookScale = lookOf(v);
        },
        fmt: (v) => `×${lookOf(v).toLocaleString('hu-HU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`,
      },
      {
        id: 'invert', kind: 'candle', label: 'Fordított függőleges nézés', get: () => !!game.input.invertY,
        set: (v) => {
          writeSettings({ invert: v });
          game.input.invertY = v;
        },
        fmt: (v) => (v ? 'ég: fel-le megfordítva' : 'nem ég: szokásos'),
      },
      {
        id: 'split', kind: 'candle', label: 'Osztott képernyő egymás mellett', get: () => game.split !== 'h',
        set: (v) => {
          game.split = v ? 'v' : 'h';
          writeSettings({ split: game.split });
          game.layout();
        },
        fmt: (v) => (v ? 'ég: bal és jobb fél (F3)' : 'nem ég: felső és alsó fél (F3)'),
      },
      // NOTES-30-music: shuffle (per device) and the skip row.
      {
        id: 'shuffle', kind: 'candle', label: 'Zene véletlen sorrendben', get: () => game.music?.shuffle ?? shuffleSetting(),
        set: (v) => (game.music ? game.music.setShuffle(v) : writeSettings({ shuffle: v })),
        fmt: (v) => (v ? 'ég: megkeverve, mindegyik egyszer, aztán újrakeverve' : 'nem ég: sorban, a végén elölről'),
      },
      {
        id: 'nexttrack', kind: 'action', label: 'Következő zeneszám', get: () => game.music?.trackName() || null,
        set: () => game.screens?.skipTrack(),
        fmt: (v) => (v ? `most szól: ${v} · Z / LB + View` : 'Z billentyű · kontrolleren LB + View'),
      },
    ];
    el.className = 'scr scr-settings';
    el.innerHTML = `${DEFS}
      <div class="desk">
        <div class="desk-ink" aria-hidden="true"><i></i></div>
        <div class="desk-quill" aria-hidden="true"></div>
        <div class="desk-sheet">
          <h2>Beállítások</h2>
          <p class="desk-sub">Bilbó íróasztalán · ez a gép jegyzi meg, a mentéstől külön</p>
          <div class="desk-rows">${this.rows.map((r, i) => `
            <div class="drow is-${r.kind}" data-i="${i}">
              <div class="dlab"><b>${r.label}</b><small class="dval"></small></div>
              <div class="dctl">${r.kind === 'knob' ? knobSVG() : r.kind === 'action' ? pageSVG() : candleSVG()}</div>
            </div>`).join('')}
          </div>
          <p class="desk-keys">Fel / le: sor · balra / jobbra: tekerés · A / Enter: gyertya, lapozás · B / Esc: vissza</p>
          <button class="desk-back" type="button">Vissza</button>
        </div>
      </div>`;
    this.rowEls = [...el.querySelectorAll('.drow')];
    this.rowEls.forEach((re, i) => {
      re.addEventListener('mouseenter', () => this.select(i));
      const ctl = re.querySelector('.dctl');
      ctl.addEventListener('click', (e) => {
        this.select(i);
        const r = this.rows[i];
        if (r.kind === 'candle') this.flip(i);
        else if (r.kind === 'action') this.act(i);
        else {
          const box = ctl.getBoundingClientRect();
          this.turn(i, e.clientX < box.left + box.width / 2 ? -1 : 1);
        }
      });
      ctl.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.select(i);
        if (this.rows[i].kind === 'knob') this.turn(i, e.deltaY > 0 ? -1 : 1);
      }, { passive: false });
    });
    el.querySelector('.desk-back').addEventListener('click', () => this.onBack?.());
  }

  /** Shows the desk; `onBack` returns to whoever opened it (the pause book or the title). */
  show(onBack) {
    this.onBack = onBack;
    this.el.classList.add('on');
    this.refresh();
  }

  hide() {
    this.el.classList.remove('on');
  }

  select(i) {
    this.sel = (i + this.rows.length) % this.rows.length;
    this.rowEls.forEach((re, j) => re.classList.toggle('sel', j === this.sel));
  }

  /** One knob step: 10 % (look: 1/15 of the range). */
  turn(i, d) {
    const r = this.rows[i];
    if (r.kind === 'action') return d > 0 ? this.act(i) : undefined;
    if (r.kind !== 'knob') return this.flip(i);
    const step = r.id === 'look' ? 1 / 15 : 0.1;
    const v = Math.round(Math.max(0, Math.min(1, r.get() + d * step)) * 1000) / 1000;
    r.set(v);
    this.refresh();
    return v;
  }

  flip(i) {
    const r = this.rows[i];
    if (r.kind !== 'candle') return;
    r.set(!r.get());
    this.refresh();
  }

  /** NOTES-30-music: an action row (the skip): Screens.skipTrack runs it and refreshes the row with the result. */
  act(i) {
    const r = this.rows[i];
    if (r.kind !== 'action') return;
    const re = this.rowEls[i];
    re.classList.remove('turned');
    void re.offsetWidth; // restart the page-turn animation
    re.classList.add('turned');
    r.set();
  }

  /** `note`: a line shown in the skip row instead of its value (why a skip changed nothing). */
  refresh(note = null) {
    this.rows.forEach((r, i) => {
      const v = r.get();
      const re = this.rowEls[i];
      re.querySelector('.dval').textContent = note && r.kind === 'action' ? note : r.fmt(v);
      if (r.kind === 'knob') re.style.setProperty('--a', `${(-135 + 270 * v).toFixed(1)}deg`);
      else re.classList.toggle('lit', !!v);
    });
    this.select(this.sel);
  }

  /** The merged intent of every player (Screens). */
  input(it) {
    if (it.backPressed || it.pausePressed) return this.onBack?.();
    if (it.upPressed) this.select(this.sel - 1);
    if (it.downPressed) this.select(this.sel + 1);
    if (it.leftPressed) this.turn(this.sel, -1);
    if (it.rightPressed) this.turn(this.sel, 1);
    if (it.confirmPressed && this.rows[this.sel].kind === 'candle') this.flip(this.sel);
    if (it.confirmPressed && this.rows[this.sel].kind === 'action') this.act(this.sel);
  }
}
