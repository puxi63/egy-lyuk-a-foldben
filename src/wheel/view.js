/* ==== wheel/view.js — the action wheel's parchment disc on one player's half of the screen (NOTES-43-wheel) ====
 * Built once per HUD, the first time that player opens the wheel; afterwards only text, classes and a few transforms are
 * written, and only when they change. Closed it is `display: none` (no paint, no layer, no work: nothing calls it).
 * Opening and closing animate opacity and transform only; the highlight is a class (scale) and a rotated pointer.
 * Perf (UHD 630, qa/wheel/wheelperf.mjs): the disc, the pointer, the centre plate and each slice are their own
 * compositor layers while open (`will-change`), so a new pick re-rasters only the two slices and the plate it touches,
 * never the textured disc, and the scale / rotation run on the compositor. */
import { SLICE_ART } from './art.js';
import { BY_DIR } from './slices.js';

const CSS = `
.wh { position: absolute; left: 50%; top: 50%; width: 21em; height: 21em; margin: -10.5em 0 0 -10.5em; z-index: 5; pointer-events: none;
  display: none; opacity: 0; transform: scale(0.86); transition: opacity 0.12s ease-out, transform 0.12s ease-out; font-family: var(--f-text); }
.wh.on { opacity: 1; transform: none; will-change: transform, opacity; }
.wh-disc { position: absolute; inset: 0; border-radius: 50%; background: var(--tx-parch) center / cover, #e8d6ac; will-change: transform;
  box-shadow: 0 0 0 0.32em #5a3a1c, 0 0 0 0.45em #c8a050, 0 0.15em 0.3em #0009; }
.wh-disc::after { content: ''; position: absolute; inset: 0.6em; border-radius: 50%; border: 1px dashed #7a5a3088; }
.wh-ptr { position: absolute; left: 50%; top: 50%; width: 0; height: 0; will-change: transform; transition: transform 0.08s ease-out; }
.wh-ptr i { position: absolute; left: -0.5em; top: -4.95em; width: 0; height: 0; border-left: 0.5em solid transparent; border-right: 0.5em solid transparent;
  border-bottom: 1.1em solid #a0302a; visibility: hidden; }
.wh.has .wh-ptr i { visibility: visible; }
.wh-hub { position: absolute; left: 50%; top: 50%; width: 7.2em; height: 7.2em; margin: -3.6em 0 0 -3.6em; border-radius: 50%;
  background: var(--tx-wood-dark) center / cover, #3e2615; box-shadow: 0 0 0 0.18em #c8a050, inset 0 0 0.6em #000a;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 0.6em; box-sizing: border-box; color: #f6e8c4;
  will-change: transform; }
.wh-t { font-family: var(--f-head); font-weight: normal; font-size: 0.86em; line-height: 1.1; color: #f0d890; }
.wh-d { font-size: 0.64em; line-height: 1.2; margin-top: 0.25em; opacity: 0.92; }
.wh-d.bad { color: #ffb0a0; }
.wh-s { position: absolute; left: 50%; top: 50%; width: 5.4em; margin-left: -2.7em; display: flex; flex-direction: column; align-items: center;
  color: var(--ink-dark, #2a1a0c); text-align: center; line-height: 1.05; }
.wh-s.off { display: none; }
.wh-in { display: flex; flex-direction: column; align-items: center; will-change: transform; transition: transform 0.08s ease-out; }
.wh-s.sel .wh-in { transform: scale(1.16); }
.wh-ic { position: relative; width: 3em; height: 3em; border-radius: 50%; background: #f4e6c2; box-shadow: 0 0 0 0.12em #6a4a26, 0 0.1em 0.25em #0006; }
.wh-s.sel .wh-ic { background: #fff4d0; box-shadow: 0 0 0 0.16em #a0302a, 0 0 0 0.3em #e8c070, 0 0.1em 0.3em #0008; }
.wh-art { position: absolute; inset: 0.3em; }
.wh-art svg, .wh-cd svg { width: 100%; height: 100%; display: block; }
.wh-s.no .wh-art { opacity: 0.38; }
.wh-cd { position: absolute; inset: -0.2em; transform: rotate(-90deg); }
.wh-cd circle { fill: none; stroke: #2a4a8a; stroke-width: 3; stroke-linecap: round; }
.wh-cd.off { display: none; }
.wh-n { position: absolute; right: -0.5em; bottom: -0.25em; min-width: 1.2em; padding: 0.05em 0.3em; border-radius: 0.7em; background: #4a2e18; color: #f6e8c4;
  font: 700 0.6em/1.25 var(--f-text); white-space: nowrap; box-shadow: 0 0 0 1px #c8a050; }
.wh-n:empty { display: none; }
.wh-l { margin-top: 0.3em; font-family: var(--f-head); font-size: 0.74em; white-space: nowrap; }
.wh-w { font-size: 0.6em; color: #8a1e12; font-style: italic; white-space: nowrap; }
.wh-w:empty { display: none; }
.wh-k { margin-top: 0.15em; font-size: 0.62em; white-space: nowrap; opacity: 0.9; }
.wh-k .or { color: #5a3a1c; font-size: 0.95em; }
body:has(#screens .scr.on) .wh { visibility: hidden; }
`;
let cssDone = false;

/** Ring radius (em) of the slices' centres and the cooldown circle's circumference (viewBox units). */
const R = 7.25;
const CD_C = 2 * Math.PI * 21;

export class WheelView {
  /** @param {HTMLElement} parent the HUD's inner box (.hud-in) */
  constructor(parent) {
    if (!cssDone) {
      cssDone = true;
      const st = document.createElement('style');
      st.id = 'wheel-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'wh';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="wh-disc"></div><div class="wh-ptr"><i></i></div>${BY_DIR.map((s) => {
      const a = (s.dir * Math.PI) / 4;
      const x = Math.sin(a) * R;
      const y = -Math.cos(a) * R;
      return `<div class="wh-s off" data-id="${s.id}" style="transform: translate(${x.toFixed(2)}em, calc(${y.toFixed(2)}em - 50%))">
        <div class="wh-in"><div class="wh-ic"><div class="wh-art">${SLICE_ART[s.id]()}</div>
          <div class="wh-cd off"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="21" stroke-dasharray="${CD_C.toFixed(2)}" stroke-dashoffset="0"/></svg></div>
          <b class="wh-n"></b></div>
        <div class="wh-l"></div><div class="wh-w"></div><div class="wh-k"></div></div></div>`;
    }).join('')}<div class="wh-hub"><b class="wh-t"></b><span class="wh-d"></span></div>`;
    parent.appendChild(el);
    this.el = el;
    this.ptr = el.querySelector('.wh-ptr');
    this.t = el.querySelector('.wh-t');
    this.d = el.querySelector('.wh-d');
    this.s = BY_DIR.map((s) => {
      const root = el.querySelector(`.wh-s[data-id="${s.id}"]`);
      return { root, cd: root.querySelector('.wh-cd'), circle: root.querySelector('.wh-cd circle'), n: root.querySelector('.wh-n'),
        l: root.querySelector('.wh-l'), w: root.querySelector('.wh-w'), k: root.querySelector('.wh-k'), c: {} };
    });
    this.c = {};
    this.open = false;
    this.pending = false;
    this.hideTimer = 0;
  }

  /** Writes `v` through `fn` only when it changed (per element cache `c`). */
  static put(c, key, v, fn) {
    if (c[key] === v) return;
    c[key] = v;
    fn(v);
  }

  show() {
    if (this.open) return;
    this.open = true;
    clearTimeout(this.hideTimer);
    this.el.style.display = 'block';
    // The class goes on at the next update (the next frame), so the opening transition runs from the closed look.
    this.pending = true;
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.pending = false;
    this.el.classList.remove('on');
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (!this.open) this.el.style.display = 'none';
    }, 140);
  }

  /**
   * One frame while open. `rows[dir]` = null (slot not shown) or { label, count, ok, why, cd, glyph };
   * `sel` = the highlighted slot or −1; `hub` = { title, text, bad } for the centre.
   */
  update(rows, sel, hub) {
    if (this.pending) {
      this.pending = false;
      this.el.classList.add('on');
    }
    const P = WheelView.put;
    for (let k = 0; k < this.s.length; k++) {
      const e = this.s[k];
      const r = rows[k];
      P(e.c, 'on', !!r, (v) => e.root.classList.toggle('off', !v));
      if (!r) continue;
      P(e.c, 'no', !r.ok, (v) => e.root.classList.toggle('no', v));
      P(e.c, 'sel', sel === k, (v) => e.root.classList.toggle('sel', v));
      P(e.c, 'l', r.label, (v) => (e.l.textContent = v));
      P(e.c, 'n', r.count, (v) => (e.n.textContent = v));
      P(e.c, 'w', r.why, (v) => (e.w.textContent = v));
      P(e.c, 'k', r.glyph, (v) => (e.k.innerHTML = v));
      // The cooldown ring in 1/40 steps (a small SVG stroke: at most a few repaints a second, only while open).
      const q = Math.round(r.cd * 40);
      P(e.c, 'cd', q, (v) => {
        e.cd.classList.toggle('off', v <= 0);
        if (v > 0) e.circle.setAttribute('stroke-dashoffset', (CD_C * (1 - v / 40)).toFixed(2));
      });
    }
    P(this.c, 'has', sel >= 0, (v) => this.el.classList.toggle('has', v));
    if (sel >= 0) P(this.c, 'ptr', sel, (v) => (this.ptr.style.transform = `rotate(${v * 45}deg)`));
    P(this.c, 't', hub.title, (v) => (this.t.textContent = v));
    P(this.c, 'd', hub.text, (v) => (this.d.textContent = v));
    P(this.c, 'bad', !!hub.bad, (v) => this.d.classList.toggle('bad', v));
  }
}
