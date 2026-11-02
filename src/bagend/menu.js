/* ==== bagend/menu.js — the per-player furnishing menu, the door / slot prompt and the door fade, drawn into the
   player's HUD element (TERV 0.12: Bilbo's ledger on a carved board, no generic game UI) ====
 * The menu shows one slot: the room on a carved wooden plaque, the slot's name, its tiers on a parchment page (bought
 * ones ticked, the next one with its price, later ones greyed), the actions of the slot (eat, cook, rest, sleep,
 * wine), the selected row's effect, the comfort score and the shared purse, and the exact keys of the player's device.
 * Navigation like the Green Dragon counter: up / down, confirm buys or acts, back or interact closes. DOM is rebuilt
 * only when the content changes. */
import { deviceOf, glyphs } from '../ui/glyphs.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CSS = `
.be-ui { position: absolute; inset: 0; pointer-events: none; font-size: clamp(12px, 2.35cqmin, 20px); line-height: 1.2; font-family: var(--f-text); color: var(--ink, #f3e6c4); z-index: 6; }
.be-ui * { box-sizing: border-box; }
.be-fade { position: absolute; inset: 0; background: #070503; opacity: 0; }
.be-prompt { position: absolute; left: 0; right: 0; top: 60%; display: flex; justify-content: center; }
.be-prompt .pr-in { display: inline-flex; align-items: center; gap: 0.45em; padding: 0.3em 0.9em; font-family: var(--f-head); font-size: 1.05em; color: #f6e8c4;
  background: linear-gradient(#5a3a1ee8, #3a2410e8); border: 2px solid #c8a04a; border-radius: 0.5em; box-shadow: 0 0.2em 0.6em #000a; text-shadow: 0 1px 2px #000; }
.be-menu { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at 50% 55%, rgba(30, 18, 6, 0.3), rgba(0, 0, 0, 0.72)); }
.be-menu.hidden, .be-prompt.hidden { display: none; }
.be-board { position: relative; width: min(94%, 34em); max-height: 94%; display: flex; flex-direction: column; padding: 0.55em 0.7em 0.6em;
  background: var(--tx-wood, linear-gradient(#7a4e2c, #5e3c20)) center / cover, #6b4426; border-radius: 1.4em 1.4em 0.6em 0.6em;
  border: 0.22em solid #3a2210; box-shadow: inset 0 0 0 0.12em #a8784a, inset 0 0 1.2em #0008, 0 0.5em 1.4em #000c; }
.be-plaque { align-self: center; margin: -1.1em 0 0.35em; padding: 0.22em 1.4em 0.28em; font-family: var(--f-head); font-size: 1.05em; letter-spacing: 0.04em; color: #f3dfa6;
  background: var(--tx-wood-dark, linear-gradient(#4a2e18, #321e10)) center / cover, #3a2412; border: 0.15em solid #c8a04a; border-radius: 0.9em; box-shadow: 0 0.2em 0.4em #0009; text-shadow: 0 1px 2px #000; }
.be-page { position: relative; padding: 0.55em 0.95em 0.6em; color: var(--ink-dark, #3a2412); background: var(--tx-parch, linear-gradient(#e8d6ac, #d8c294)) center / cover, #e0cc9c;
  border-radius: 0.25em; box-shadow: inset 0 0 1.4em #8a5a2a66, 0 0.15em 0.4em #0008; min-height: 0; overflow: hidden; }
.be-page::before { content: ''; position: absolute; left: 0.5em; top: 0; bottom: 0; width: 1px; background: #a0302a55; }
.be-slot { font-family: var(--f-title); font-size: 1.45em; text-align: center; color: #4a2410; margin-bottom: 0.15em; }
.be-rule { height: 0.5em; margin: 0 1.5em 0.25em; background: radial-gradient(circle, #6a3a1a 0 0.12em, transparent 0.14em) center / 0.9em 0.5em repeat-x; opacity: 0.7; }
.be-rows { list-style: none; margin: 0; padding: 0; }
.be-row { position: relative; display: flex; align-items: baseline; gap: 0.4em; padding: 0.16em 0.45em; font-size: 1.08em; border-radius: 0.3em; }
.be-row .ck { flex: 0 0 1.1em; text-align: center; font-family: var(--f-head); color: #2e5a1e; }
.be-row .nm { flex: 0 1 auto; }
.be-row .dots { flex: 1 1 1em; border-bottom: 2px dotted #6a4a2a88; transform: translateY(-0.25em); min-width: 0.6em; }
.be-row .pr { white-space: nowrap; font-weight: 600; }
.be-row .pr small { font-weight: 400; font-size: 0.72em; }
.be-row.owned .nm { color: #2e4a1e; }
.be-row.owned .pr { color: #2e5a1e; font-family: var(--f-head); font-weight: 400; font-size: 0.85em; }
.be-row.locked { opacity: 0.45; }
.be-row.poor .pr { color: #a0302a; }
.be-row.act { font-style: italic; }
.be-row.act .ck { color: #8a5a1a; }
.be-row.off { opacity: 0.5; }
.be-row.sel { background: #5a3a1a22; box-shadow: inset 0 0 0 2px #7a4a1aaa; }
.be-row.sel::before { content: '➜'; position: absolute; left: -0.95em; color: #7a2a1a; }
.be-sep { height: 1px; margin: 0.3em 0.6em; background: #6a4a2a55; }
.be-desc { margin-top: 0.35em; padding: 0.3em 0.5em; min-height: 2.6em; font-size: 0.98em; font-style: italic; color: #4a3018; border-top: 1px solid #6a4a2a44; }
.be-foot { display: flex; justify-content: space-between; align-items: center; gap: 0.6em; margin-top: 0.45em; padding: 0 0.2em; font-family: var(--f-head); color: #f3dfa6; text-shadow: 0 1px 2px #000; }
.be-comfort { display: inline-flex; align-items: center; gap: 0.35em; }
.be-comfort .bar { display: inline-block; width: 5.5em; height: 0.5em; border-radius: 0.3em; background: #2a1a0c; box-shadow: inset 0 0 0 1px #c8a04a88; overflow: hidden; }
.be-comfort .bar i { display: block; height: 100%; background: linear-gradient(90deg, #c86a2a, #f0c060); }
.be-purse b { color: #ffe08a; font-size: 1.1em; }
.be-hint { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.3em; margin-top: 0.4em; font-size: 0.92em; color: #f6e8c4; text-shadow: 0 1px 2px #000; }
.be-hint i { font-style: normal; opacity: 0.6; margin: 0 0.2em; }
@container hud (max-height: 480px) { .be-board { width: min(96%, 30em); } .be-row { font-size: 1em; padding: 0.08em 0.4em; } .be-desc { min-height: 2em; } }
`;

function injectCss() {
  if (document.getElementById('be-style')) return;
  const st = document.createElement('style');
  st.id = 'be-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

export class BagEndMenu {
  /**
   * @param {HTMLElement|undefined} host the player's HUD element (game.huds[i].el)
   * @param {import('./index.js').BagEnd} be
   */
  constructor(host, be) {
    this.host = host;
    this.be = be;
    this.open = false;
    this.slot = null;
    this.sel = 0;
    this.sig = '';
    this.promptSig = '';
    this.fadeV = -1;
    if (!host) return;
    injectCss();
    this.el = document.createElement('div');
    this.el.className = 'be-ui';
    this.el.innerHTML = '<div class="be-prompt hidden"></div><div class="be-menu hidden"></div><div class="be-fade"></div>';
    host.appendChild(this.el);
    this.promptEl = this.el.querySelector('.be-prompt');
    this.menuEl = this.el.querySelector('.be-menu');
    this.fadeEl = this.el.querySelector('.be-fade');
  }

  glyphs(binding) {
    const shared = this.be.game.bindings?.some((b) => b.kbm === 'keys2');
    return glyphs(deviceOf(binding), shared);
  }

  fade(v) {
    if (!this.el || v === this.fadeV) return;
    this.fadeV = v;
    this.fadeEl.style.opacity = String(Math.min(1, Math.max(0, v)));
  }

  /** Shows a prompt ("<text> <interact key>") or hides it with null. */
  prompt(text, binding) {
    if (!this.el) return;
    const sig = text && !this.open ? `${text}|${deviceOf(binding)}` : '';
    if (sig === this.promptSig) return;
    this.promptSig = sig;
    this.promptEl.classList.toggle('hidden', !sig);
    if (sig) this.promptEl.innerHTML = `<span class="pr-in"><span>${esc(text)}</span>${this.glyphs(binding).interact}</span>`;
  }

  openSlot(s, p, binding) {
    this.open = true;
    this.slot = s;
    const k = this.be.tiers[s.id];
    this.sel = k < s.tiers.length ? k : s.tiers.length;
    this.sig = '';
    this.prompt(null);
    this.render(p, binding);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.slot = null;
    this.sig = '';
    if (this.menuEl) this.menuEl.classList.add('hidden');
  }

  /** The rows of the open slot: its tiers, then its actions. */
  rows(p) {
    const s = this.slot;
    const k = this.be.tiers[s.id];
    const rows = s.tiers.map((t, i) => {
      const state = i < k ? 'owned' : i === k ? 'next' : 'locked';
      // An auctioned tier (timed/auction.js, NOTES-12-events): marked, with the buy-back price.
      const mark = state !== 'owned' ? this.be.tierMark?.(s, i) : null;
      const price = this.be.tierPrice ? this.be.tierPrice(p, s, i) : this.be.price(p, t.price);
      const desc = tierDesc(t, state, s.tiers[i - 1]) + (mark?.desc ? ` ${mark.desc}` : '');
      return { kind: 'tier', state, label: mark?.note ? `${t.name} (${mark.note})` : t.name, price, ok: state === 'next', desc };
    });
    const acts = this.be.effects.actions(s, p).map((a) => ({ kind: 'act', label: a.label, price: a.price || 0, ok: a.ok, act: a.act, desc: a.desc || '' }));
    return [...rows, ...acts];
  }

  /** Handles input while open; returns false when it closed. */
  input(it, p, binding) {
    if (!this.open) return false;
    if (it.backPressed || it.interactPressed) {
      this.close();
      return false;
    }
    const rows = this.rows(p);
    if (it.upPressed) this.sel = (this.sel + rows.length - 1) % rows.length;
    if (it.downPressed) this.sel = (this.sel + 1) % rows.length;
    this.sel = Math.min(this.sel, rows.length - 1);
    if (it.confirmPressed || it.digPressed) {
      const r = rows[this.sel];
      if (r.kind === 'tier') {
        if (r.state === 'owned') p.say('Ez már megvan.');
        else if (r.state === 'locked') p.say('Előbb az előzőt kell visszavenned.');
        else {
          const msg = this.be.buy(p, this.slot);
          p.say(msg, 3);
          const k = this.be.tiers[this.slot.id];
          if (k < this.slot.tiers.length) this.sel = k;
        }
      } else if (!r.ok) p.say('Most nem lehet.');
      else if (r.price > 0 && this.be.game.money < r.price) p.say('Nincs elég aranyad.');
      else {
        if (r.price > 0) this.be.game.money -= r.price;
        const msg = r.act();
        if (msg) p.say(msg, 3.5);
      }
    }
    this.render(p, binding);
    return true;
  }

  render(p, binding) {
    if (!this.el || !this.open) return;
    const s = this.slot;
    const rows = this.rows(p);
    const money = this.be.game.money;
    const fx = this.be.effects;
    const sig = JSON.stringify([s.id, this.sel, money, rows.map((r) => [r.label, r.state, r.price, r.ok]), deviceOf(binding)]);
    if (sig === this.sig) return;
    this.sig = sig;
    const g = this.glyphs(binding);
    const room = this.be.roomName(s);
    const nT = s.tiers.length;
    const comfortPct = Math.round((fx.comfort / Math.max(1, fx.comfortMax)) * 100);
    const li = rows.map((r, i) => {
      const cls = ['be-row', r.kind === 'act' ? 'act' : r.state, i === this.sel ? 'sel' : '', r.kind === 'act' && !r.ok ? 'off' : '', r.state === 'next' && money < r.price ? 'poor' : ''].join(' ');
      const ck = r.kind === 'act' ? '❧' : r.state === 'owned' ? '✓' : `${i + 1}.`;
      const pr = r.kind === 'act' ? (r.price ? `${r.price}<small> arany</small>` : '') : r.state === 'owned' ? 'megvan' : `${r.price}<small> arany</small>`;
      const sep = r.kind === 'act' && i === nT ? '<li class="be-sep"></li>' : '';
      return `${sep}<li class="${cls}"><span class="ck">${ck}</span><span class="nm">${esc(r.label)}</span><span class="dots"></span><span class="pr">${pr}</span></li>`;
    }).join('');
    const cur = rows[this.sel];
    this.menuEl.innerHTML = `<div class="be-board">
      <div class="be-plaque">Zsáklak · ${esc(room)}</div>
      <div class="be-page">
        <div class="be-slot">${esc(s.name)}</div>
        <div class="be-rule"></div>
        <ol class="be-rows">${li}</ol>
        <div class="be-desc">${esc(cur?.desc || '')}</div>
      </div>
      <div class="be-foot"><span class="be-comfort">Kényelem <span class="bar"><i style="width:${comfortPct}%"></i></span> ${fx.comfort}/${fx.comfortMax}</span><span class="be-purse">Közös arany: <b>${money}</b></span></div>
      <div class="be-hint">${g.nav}<span>választás</span><i>·</i>${g.confirm}<span>${cur?.kind === 'act' ? 'megteszed' : 'visszaveszed'}</span><i>·</i>${g.back}<span>bezárás</span></div>
    </div>`;
    this.menuEl.classList.remove('hidden');
  }

  /** Keeps the menu's purse and rows current while open (call each frame from BagEnd.input). */
  refresh(p, binding) {
    if (this.open) this.render(p, binding);
  }
}

/** The description of a tier row: its effect, its comfort, or what must come first. */
function tierDesc(t, state, prev) {
  const fx = t.effect ? `${t.effect} ` : '';
  const c = t.comfort ? `Kényelem +${t.comfort}.` : '';
  if (state === 'locked') return `${fx}${c} Előbb: ${prev ? prev.name : ''}.`;
  return `${t.desc ? `${t.desc} ` : ''}${fx}${c}`.trim();
}
