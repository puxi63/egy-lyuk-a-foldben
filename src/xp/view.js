/* ==== xp/view.js — the skills screen (NOTES-41-xp): reached from the pause book ("Képességek"), the game frozen like
   the other screens. One parchment sheet per player on Bilbo's desk wood (both players side by side in co-op), each
   with the character's portrait, level, XP bar, free points and the character's own skills (rank pips, the effect
   now and at the next rank). Every player drives his own sheet with his own keys / pad (up / down choose, confirm or
   right gives a point, left takes back a point given during this visit); back (Esc / Backspace / B) returns to the
   pause. Built on show and on each change (one innerHTML per sheet), emptied on hide: no cost while closed. ==== */
import { portraitSVG } from '../ui/art.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { MAX_RANK } from './config.js';
import { levelStart, needFor, skillsOf } from './index.js';

const CSS = `
.scr-xp { background: radial-gradient(ellipse at 50% 45%, #00000000 40%, #000c 100%), var(--tx-wood) center / 60rem auto, #4a2c16; }
.xp-room { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 2.4vw; padding: 1.2rem 1.6rem 3.2rem; box-sizing: border-box; }
.xp-title { position: absolute; left: 0; right: 0; top: 0.6rem; text-align: center; font-family: var(--f-title); font-size: clamp(1.4rem, 2.6vw, 2.3rem); color: #f2dfb0;
  text-shadow: 0 2px 4px #000, 0 0 1rem #000; pointer-events: none; }
.xp-sheet { position: relative; flex: 0 1 34rem; max-height: calc(100% - 2.4rem); margin-top: 2.2rem; display: flex; flex-direction: column; padding: 1.1rem 1.4rem 0.9rem; box-sizing: border-box;
  color: #2e2014; background: radial-gradient(ellipse at 50% 45%, #0000 55%, #6a4a2240 100%), repeating-linear-gradient(180deg, transparent 0 1.9rem, #8a6a3a14 1.9rem calc(1.9rem + 1px)), linear-gradient(#ecdcb4, #d8c294);
  box-shadow: 0 1rem 2rem #000c, inset 0 0 2rem #7a5a2a66; border-radius: 0.2rem; overflow: hidden; font-size: clamp(0.78rem, 1.05vw, 1rem); }
.xp-sheet:nth-child(2) { transform: rotate(-0.8deg); }
.xp-sheet:nth-child(3) { transform: rotate(0.7deg); }
.xp-sheet::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 0.35rem; background: var(--pc, #7a3a10); opacity: 0.85; }
.xp-head { display: flex; gap: 0.9em; align-items: center; }
.xp-por { flex: none; width: 4.6em; height: 4.6em; border-radius: 50%; overflow: hidden; background: #c8b07a; box-shadow: 0 0 0 0.18em var(--pc, #7a3a10), 0 0.3em 0.6em #0007; }
.xp-por svg { width: 100%; height: 100%; display: block; }
.xp-id { flex: 1; min-width: 0; }
.xp-nm { display: inline-block; margin: 0; font-family: var(--f-head); font-weight: normal; font-size: 1.45em; color: #3a2410; line-height: 1.1; border-bottom: 0.12em solid var(--pc, #7a3a10); }
.xp-lv { display: block; margin-top: 0.15em; font-family: var(--f-title); font-size: 1.15em; color: #4a2410; }
.xp-bar { position: relative; height: 0.62em; margin: 0.25em 0 0.15em; border-radius: 0.35em; background: #8a6a3a55; box-shadow: inset 0 0.08em 0.2em #3a241088, inset 0 0 0 1px #5a3a1a99; overflow: hidden; }
.xp-bar i { position: absolute; inset: 0; transform-origin: 0 50%; background: linear-gradient(#ffe7a0, #d8a640 55%, #a8741e); }
.xp-num { font-size: 0.82em; color: #5a4430; }
.xp-free { margin: 0.55em 0 0.35em; font-family: var(--f-head); font-size: 1.05em; }
.xp-free b { display: inline-flex; align-items: center; justify-content: center; min-width: 1.6em; height: 1.6em; padding: 0 0.35em; margin-right: 0.3em; border-radius: 0.8em;
  color: #fff4d0; background: radial-gradient(circle at 35% 30%, #c8402a, #7a1a10 70%); box-shadow: 0 0.1em 0.3em #0008; font-weight: normal; }
.xp-free.none b { background: #8a7a5a; }
.xp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25em; overflow: hidden; }
.xp-list li { position: relative; padding: 0.35em 0.5em 0.4em 1.9em; border-radius: 0.25em; cursor: pointer; }
.xp-list li.sel { background: linear-gradient(176deg, transparent 0 4%, #b8904a40 8% 92%, transparent 96%); box-shadow: inset 0 0 0 1px #8a5a2066; }
.xp-list li.sel::before { content: '❧'; position: absolute; left: 0.35em; top: 0.25em; font-size: 1.25em; color: #7a1e10; }
.xp-row { display: flex; align-items: baseline; gap: 0.6em; }
.xp-sk { flex: 1; font-family: var(--f-head); font-size: 1.12em; color: #3a2410; }
.xp-list li.sel .xp-sk { color: #7a1e10; }
.xp-pips { display: inline-flex; gap: 0.18em; }
.xp-pips i { width: 0.72em; height: 0.72em; transform: rotate(45deg); border: 1px solid #5a3a1a; background: #e8d8b0; box-shadow: inset 0 0 0.15em #8a6a3a; }
.xp-pips i.on { background: linear-gradient(135deg, #ffe7a0, #c8902a); border-color: #6a3a0a; }
.xp-pips i.new { background: linear-gradient(135deg, #ffd0a0, #c84a2a); border-color: #6a1a0a; }
.xp-desc { margin: 0.1em 0 0; font-size: 0.86em; font-style: italic; color: #5a4430; line-height: 1.25; }
.xp-fx { margin: 0.12em 0 0; font-size: 0.84em; color: #3a2a14; }
.xp-fx em { color: #7a5a3a; }
.xp-note { min-height: 1.3em; margin: 0.45em 0 0; font-family: var(--f-chalk); font-size: 1.12em; color: #6a2a0a; }
.xp-keys { margin: 0.25em 0 0; font-size: 0.78em; color: #6a5236; display: flex; flex-wrap: wrap; align-items: center; gap: 0.3em; }
.xp-keys .or { opacity: 0.6; }
.xp-back { position: absolute; left: 50%; bottom: 0.7rem; transform: translateX(-50%); font-family: var(--f-head); font-size: 1rem; color: #3a2412; background: #e8d6ac;
  border: 1px solid #5a3a1a; border-radius: 0.25rem; padding: 0.15rem 1rem; cursor: pointer; box-shadow: 0 0.3rem 0.6rem #0008; }
.xp-empty { font-style: italic; color: #5a4430; }
@media (max-aspect-ratio: 1/1) { .xp-room { flex-direction: column; gap: 1rem; } .xp-sheet { flex: 0 1 auto; width: 92vw; margin-top: 2.6rem; } }
`;
let cssDone = false;

const fmt = (n) => Math.floor(n).toLocaleString('hu-HU');

export class SkillsView {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    el.className = 'scr scr-xp';
    if (!cssDone) {
      cssDone = true;
      const st = document.createElement('style');
      st.id = 'xp-view-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.sel = [];
    this.given = []; // per player: ranks given during this visit, per skill (left takes them back)
    this.note = [];
  }

  /** Shows the sheets of every player in the game (`opener` first in focus only for the mouse). */
  show(opener, onBack) {
    this.onBack = onBack;
    const n = this.game.players.length;
    this.sel = Array.from({ length: n }, () => 0);
    this.given = this.game.players.map((p) => new Array(skillsOf(p.ch?.id).length).fill(0));
    this.note = Array.from({ length: n }, () => '');
    this.opener = opener;
    this.changed = false;
    this.render();
    this.el.classList.add('on');
  }

  /** Hides the sheets; points given during the visit are saved once, on leaving (not on every press). */
  hide() {
    if (this.changed) {
      this.changed = false;
      Promise.resolve(this.game.saveNow?.()).catch((e) => console.warn('[xp]', e));
    }
    this.el.classList.remove('on');
    this.el.innerHTML = '';
  }

  /**
   * Input: back (merged) returns to the pause; every player moves through his own sheet with the intent of his own
   * binding (keyboard half or pad).
   */
  input(it) {
    if (it.backPressed || it.pausePressed) return this.onBack?.();
    const g = this.game;
    const shared = g.bindings.some((b) => b.kbm === 'keys2');
    let dirty = false;
    g.players.forEach((p, i) => {
      const b = g.bindings[i];
      if (!b) return;
      const own = g.input.intent(b.kbm, b.pad, shared);
      if (this.step(i, own)) dirty = true;
    });
    if (dirty) this.render();
  }

  /** One player's presses on his sheet; true when something changed. */
  step(i, it) {
    const p = this.game.players[i];
    const skills = skillsOf(p?.ch?.id);
    if (!p || p.choosing || !skills.length) return false;
    const n = skills.length;
    if (it.upPressed) {
      this.sel[i] = (this.sel[i] + n - 1) % n;
      this.note[i] = '';
      return true;
    }
    if (it.downPressed) {
      this.sel[i] = (this.sel[i] + 1) % n;
      this.note[i] = '';
      return true;
    }
    if (it.confirmPressed || it.rightPressed) return this.raise(i, this.sel[i]);
    if (it.leftPressed) return this.lower(i, this.sel[i]);
    return false;
  }

  /** Gives a point to skill k of player i (with a line why not when it cannot). */
  raise(i, k) {
    const p = this.game.players[i];
    const st = p.xp;
    const sk = skillsOf(p.ch.id)[k];
    if (!sk) return false;
    const r = st.myRanks()[k];
    if (r >= MAX_RANK) this.note[i] = `${sk.name}: már mesterfokon van.`;
    else if (st.free <= 0) this.note[i] = 'Nincs elkölthető pontod: a következő szinten kapsz újat.';
    else if (st.raise(k)) {
      this.given[i][k] = (this.given[i][k] || 0) + 1;
      this.note[i] = `${sk.name}: ${r + 1}. fok.`;
      this.changed = true;
    }
    return true;
  }

  /** Takes back a point given to skill k during this visit. */
  lower(i, k) {
    const p = this.game.players[i];
    const sk = skillsOf(p.ch.id)[k];
    if (!sk) return false;
    if (!(this.given[i][k] > 0)) {
      this.note[i] = 'Csak a most adott pontot veheted vissza.';
      return true;
    }
    if (p.xp.lower(k)) {
      this.given[i][k]--;
      this.note[i] = `${sk.name}: visszavéve.`;
      this.changed = true;
    }
    return true;
  }

  /** One player's sheet. */
  sheet(p, i) {
    const g = this.game;
    const st = p.xp;
    const skills = skillsOf(p.ch?.id);
    const ranks = st.myRanks();
    const into = Math.max(0, st.xp - levelStart(st.level));
    const need = needFor(st.level);
    const free = st.free;
    const maxed = skills.length && ranks.every((r) => r >= MAX_RANK);
    const shared = g.bindings.some((b) => b.kbm === 'keys2');
    const gl = glyphs(deviceOf(g.bindings[i]), shared);
    const list = skills.map((sk, k) => {
      const r = ranks[k] || 0;
      const fresh = this.given[i]?.[k] || 0;
      const pips = Array.from({ length: MAX_RANK }, (_, j) => `<i class="${j < r - fresh ? 'on' : j < r ? 'new' : ''}"></i>`).join('');
      const now = r ? sk.line(r) : 'még nincs pont rajta';
      const next = r < MAX_RANK ? ` <em>· következő fok: ${sk.line(r + 1)}</em>` : ' <em>· mesterfok</em>';
      return `<li data-k="${k}" class="${k === this.sel[i] ? 'sel' : ''}"><div class="xp-row"><span class="xp-sk">${sk.name}</span><span class="xp-pips">${pips}</span></div>
        <p class="xp-desc">${sk.desc}</p><p class="xp-fx">${now}${next}</p></li>`;
    }).join('');
    const freeLine = maxed ? 'Minden képességed mesterfokon van.'
      : free > 0 ? `<b>${free}</b>elkölthető képességpont` : '<b>0</b>elkölthető pont · a következő szint hoz újat';
    return `<section class="xp-sheet" data-i="${i}" style="--pc:${p.ch?.color || '#7a3a10'}">
      <div class="xp-head"><div class="xp-por">${p.ch ? portraitSVG(p.ch) : ''}</div>
        <div class="xp-id"><h3 class="xp-nm">${p.ch?.name || 'Játékos'}</h3><span class="xp-lv">${st.level}. szint</span>
          <div class="xp-bar"><i style="transform:scaleX(${Math.min(1, into / need).toFixed(3)})"></i></div>
          <span class="xp-num">${fmt(into)} / ${fmt(need)} tapasztalat a ${st.level + 1}. szintig · összesen ${fmt(st.xp)}</span></div></div>
      <p class="xp-free${free > 0 ? '' : ' none'}">${freeLine}</p>
      ${skills.length ? `<ol class="xp-list">${list}</ol>` : '<p class="xp-empty">Ennek a szereplőnek nincsenek képességei.</p>'}
      <p class="xp-note">${this.note[i] || ''}</p>
      <p class="xp-keys">${gl.nav}<span>választás</span><span class="or">·</span>${gl.confirm}<span>pont rá</span><span class="or">·</span>${gl.browse}<span>visszavesz / ad</span><span class="or">·</span>${gl.back}<span>vissza</span></p>
    </section>`;
  }

  render() {
    const g = this.game;
    const sheets = g.players.map((p, i) => (p.choosing ? '' : this.sheet(p, i))).join('');
    this.el.innerHTML = `<div class="xp-room"><div class="xp-title">Képességek</div>${sheets}</div><button class="xp-back" type="button">Vissza</button>`;
    this.el.querySelector('.xp-back').addEventListener('click', () => this.onBack?.());
    // The mouse: a click on a skill row selects it, a click on the selected row gives a point.
    this.el.querySelectorAll('.xp-sheet').forEach((sh) => {
      const i = +sh.dataset.i;
      sh.querySelectorAll('.xp-list li').forEach((li) => li.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = +li.dataset.k;
        if (this.sel[i] === k) this.raise(i, k);
        else {
          this.sel[i] = k;
          this.note[i] = '';
        }
        this.render();
      }));
    });
  }
}
