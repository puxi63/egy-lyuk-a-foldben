/* ==== xp/hud.js — the experience on a player's HUD (NOTES-41-xp): a small level plaque with its XP bar under the
   name plate (a seal shows when skill points wait), and the level-up notice — a parchment ribbon with a gold seal
   that drops in and fades (one transform / opacity animation on its own compositor layer, small shadows: little to
   raster when it appears; built once). Built once per HUD; update() writes only when the player's `xp.ver` changed or a
   notice is pending (nothing per frame otherwise). The styles are injected once (`#xp-css`). ==== */

const CSS = `
.xpb { position: relative; z-index: 1; display: flex; align-items: center; gap: 0.4em; margin: -0.25em 0 0.3em 0.35em; padding: 0.12em 0.5em 0.14em 0.45em;
  border-radius: 0.2em 0.7em 0.7em 0.2em; background: #1a1008b0; box-shadow: 0 0.1em 0.3em #0008, inset 0 0 0 1px #0006; font-family: var(--f-head); pointer-events: none; }
.xpb-lv { font-size: 0.78em; color: #f6e8c4; text-shadow: 0 1px 2px #000; white-space: nowrap; }
.xpb-bar { position: relative; width: 5.6em; height: 0.42em; border-radius: 0.25em; background: #3a2614; box-shadow: inset 0 0 0 1px #000a, 0 0.1em 0.25em #0008; overflow: hidden; }
.xpb-fill { position: absolute; inset: 0; transform-origin: 0 50%; transform: scaleX(0); background: linear-gradient(#ffe7a0, #d8a640 55%, #a8741e); will-change: transform; }
.xpb-pt { display: none; align-items: center; justify-content: center; min-width: 1.35em; height: 1.35em; padding: 0 0.3em; border-radius: 0.7em;
  font-size: 0.72em; color: #fff4d0; background: radial-gradient(circle at 35% 30%, #c8402a, #7a1a10 70%); box-shadow: 0 0.1em 0.3em #000a, inset 0 0 0 1px #3a0804;
  text-shadow: 0 1px 1px #000; }
.xpb.pts .xpb-pt { display: inline-flex; }
.xpn { position: absolute; left: 0; right: 0; top: 30%; display: flex; justify-content: center; pointer-events: none; z-index: 4; }
.xpn.off { display: none; }
.xpn-in { position: relative; display: flex; align-items: center; gap: 0.7em; padding: 0.55em 1.6em 0.6em 0.7em; color: #2e1c0c;
  background: radial-gradient(ellipse at 50% 40%, #0000 50%, #7a5a2a55 100%), var(--tx-parch) center / cover, #e8d6ac;
  border-radius: 0.3em; box-shadow: 0 0.25em 0.5em #000b, 0 0 0 0.12em #e8c07088, inset 0 0 0 1px #5a3a1a88;
  will-change: transform, opacity; animation: xpnin 0.7s cubic-bezier(.2, 1.4, .4, 1) both, xpnout 0.9s ease-in 4.6s forwards; }
.xpn-in::before, .xpn-in::after { content: ''; position: absolute; top: 18%; bottom: 18%; width: 1.1em; background: linear-gradient(#d0ac72, #a8844e); z-index: -1; }
.xpn-in::before { left: -0.8em; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 40% 50%); }
.xpn-in::after { right: -0.8em; clip-path: polygon(0 0, 100% 0, 60% 50%, 100% 100%, 0 100%); }
.xpn-seal { position: relative; flex: none; width: 3.3em; height: 3.3em; }
.xpn-seal svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
.xpn-rays { position: absolute; inset: 0; }
.xpn-seal b { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--f-title); font-weight: normal; font-size: 1.35em;
  color: #fff2c8; text-shadow: 0 1px 2px #3a1a00; }
.xpn-tx { display: flex; flex-direction: column; line-height: 1.12; }
.xpn-h { font-family: var(--f-title); font-size: 1.45em; color: #6a2a0a; text-shadow: 0 1px 0 #fff6; white-space: nowrap; }
.xpn-who { font-family: var(--f-head); font-size: 0.92em; white-space: nowrap; }
.xpn-pt { font-family: var(--f-text); font-style: italic; font-size: 0.8em; color: #5a3a14; white-space: nowrap; }
@keyframes xpnin { from { opacity: 0; transform: translateY(-1.2em) scale(0.7); } to { opacity: 1; transform: none; } }
@keyframes xpnout { to { opacity: 0; transform: translateY(-0.6em); } }
body:has(#screens .scr.on) .xpn { visibility: hidden; }
@media (prefers-reduced-motion: reduce) { .xpn-in { animation: xpnout 0.9s ease-in 4.6s forwards; } }
`;
let cssDone = false;

/** The gold seal of the notice: a sunburst of rays behind a round seal with a laurel ring (no symbol of its own). */
const SEAL = `<div class="xpn-rays"><svg viewBox="0 0 100 100" aria-hidden="true"><g opacity=".75">${Array.from({ length: 16 }, (_, i) => `<path d="M50 50L${(50 + 54 * Math.cos(((i + 0.5) * Math.PI) / 8 - 0.07)).toFixed(1)} ${(50 + 54 * Math.sin(((i + 0.5) * Math.PI) / 8 - 0.07)).toFixed(1)}L${(50 + 54 * Math.cos(((i + 0.5) * Math.PI) / 8 + 0.07)).toFixed(1)} ${(50 + 54 * Math.sin(((i + 0.5) * Math.PI) / 8 + 0.07)).toFixed(1)}Z" fill="#ffd870"/>`).join('')}</g></svg></div><svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="36" fill="#7a1a10" stroke="#3a0804" stroke-width="3"/>
  <circle cx="50" cy="50" r="31" fill="none" stroke="#e8c070" stroke-width="2.4"/>
  <g fill="#e8c070">${Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return `<ellipse cx="${(50 + 26 * Math.cos(a)).toFixed(1)}" cy="${(50 + 26 * Math.sin(a)).toFixed(1)}" rx="3.2" ry="1.6" transform="rotate(${((a * 180) / Math.PI + 60).toFixed(0)} ${(50 + 26 * Math.cos(a)).toFixed(1)} ${(50 + 26 * Math.sin(a)).toFixed(1)})"/>`;
  }).join('')}</g>
  <circle cx="42" cy="40" r="10" fill="#fff" opacity=".12"/>
</svg>`;

export class XpHud {
  /**
   * @param {HTMLElement} hudIn the HUD's `.hud-in` (the notice goes in it)
   * @param {HTMLElement} after the element the level plaque follows (the name plate)
   */
  constructor(hudIn, after) {
    if (!cssDone) {
      cssDone = true;
      const st = document.createElement('style');
      st.id = 'xp-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.bar = document.createElement('div');
    this.bar.className = 'xpb';
    this.bar.innerHTML = '<span class="xpb-lv"></span><span class="xpb-bar"><i class="xpb-fill"></i></span><span class="xpb-pt" title="Elkölthető képességpont"></span>';
    this.bar.title = 'Szint és tapasztalat (Szünet › Képességek)';
    after.after(this.bar);
    this.lv = this.bar.querySelector('.xpb-lv');
    this.fill = this.bar.querySelector('.xpb-fill');
    this.pt = this.bar.querySelector('.xpb-pt');
    // The notice is built once; a level-up writes three texts and (re)starts its animations (transform / opacity only,
    // on its own compositor layers: no repaint per frame while it plays, display: none when it is over).
    this.note = document.createElement('div');
    this.note.className = 'xpn off';
    this.note.innerHTML = `<div class="xpn-in"><div class="xpn-seal">${SEAL}<b></b></div>
      <div class="xpn-tx"><span class="xpn-h">Szintet léptél!</span><span class="xpn-who"></span><span class="xpn-pt"></span></div></div>`;
    hudIn.appendChild(this.note);
    this.nIn = this.note.firstElementChild;
    this.nLv = this.note.querySelector('.xpn-seal b');
    this.nWho = this.note.querySelector('.xpn-who');
    this.nPt = this.note.querySelector('.xpn-pt');
    this.nIn.addEventListener('animationend', (e) => {
      if (e.animationName === 'xpnout') this.note.classList.add('off');
    });
    this.ver = -1;
    this.chId = null;
    /** What QA reads: the last drawn plaque and notice. */
    this.shown = { level: 0, frac: -1, free: -1, notice: null };
  }

  /** Per HUD update: redraws the plaque on a change, shows a pending level-up notice. */
  update(p, held) {
    const st = p.xp;
    if (!st) return;
    if (st.ver !== this.ver || p.ch !== this.chId) {
      this.ver = st.ver;
      this.chId = p.ch;
      // Only what changed is written (a swing usually moves the bar by a fraction of a percent: often nothing).
      const pr = st.progress();
      const free = st.free;
      const frac = Math.round(pr.frac * 200) / 200;
      if (st.level !== this.shown.level) this.lv.textContent = `${st.level}. szint`;
      if (frac !== this.shown.frac) this.fill.style.transform = `scaleX(${frac})`;
      if (free !== this.shown.free) {
        this.bar.classList.toggle('pts', free > 0);
        this.pt.textContent = `+${free}`;
      }
      this.shown.level = st.level;
      this.shown.frac = frac;
      this.shown.free = free;
    }
    if (st.notice && !p.choosing && !held) this.showNotice(p, st.notice);
  }

  /** The level-up ribbon (restarted when another level comes while one is up). */
  showNotice(p, n) {
    p.xp.notice = null;
    const name = (p.ch?.name || '').split(' ').pop();
    const free = p.xp.free;
    const pts = n.gained > 1 ? `+${n.gained} képességpont` : '+1 képességpont';
    this.nLv.textContent = n.level;
    this.nWho.textContent = `${name} most ${n.level}. szintű`;
    this.nPt.textContent = `${pts}${free > n.gained ? ` (összesen ${free})` : ''} · Szünet › Képességek`;
    if (this.note.classList.contains('off')) this.note.classList.remove('off'); // display returns: the animations start anew
    else for (const a of this.nIn.getAnimations({ subtree: true })) { a.cancel(); a.play(); } // one still up: restarted
    this.shown.notice = { level: n.level, gained: n.gained, at: performance.now() };
  }
}
