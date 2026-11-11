/* ==== ui/counter.js — a goods menu: hanging sign, chalk prices on a slate, the goods on shelves, purse and key hints ====
 * Used by the Green Dragon counter (TERV 0.12 Bolt). Generic on purpose: the later Bag End furnishing menu (TERV 0.13,
 * fixed slots with tiers) can reuse it with other `theme` values and item kinds; `items[i].art` overrides the drawing. */
import { coinsSVG, goodsSVG, uid } from './art.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The Green Dragon's sign: a green dragon on a hanging board (the inn sign of the films). */
export const DRAGON_SVG = `<svg class="dragon" viewBox="0 0 120 70" aria-hidden="true">
  <path d="M14 52c10 4 22 2 30-6 6-6 14-8 22-4 6 3 10 10 18 10 6 0 10-4 12-9-6 3-10 2-12-2l10-4-10-2c-4-6-12-8-18-4-6-8-2-18 6-22-12 0-22 8-22 20-8-2-16 2-22 10-4 6-10 9-14 13z" fill="#3e8a3a" stroke="#173a14" stroke-width="2" stroke-linejoin="round"/>
  <path d="M50 30c-4-12 2-24 14-28-4 8-2 14 2 18 4-6 12-8 18-6-6 4-8 10-6 16" fill="#5aa84a" stroke="#173a14" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="92" cy="34" r="1.8" fill="#f0d040"/>
  <path d="M14 52c-6 2-10 0-12-4 4 1 7 0 9-3" fill="none" stroke="#173a14" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/** Default texts of the Green Dragon theme. */
const GREEN_DRAGON = { sign: 'A Zöld Sárkány', board: 'Ma kínáljuk', purse: 'Közös arany', unit: 'arany' };

export class CounterMenu {
  /**
   * @param {HTMLElement} el the (initially empty) container, filled on the first render
   * @param {object} [theme] texts: sign, board, purse, unit (Green Dragon by default)
   */
  constructor(el, theme = GREEN_DRAGON) {
    this.el = el;
    this.theme = theme;
    this.sig = '';
    this.state = { sel: -1, money: -1, hint: '', flags: [] };
    this.coinsId = uid();
  }

  /** Builds the DOM for a new set of items (labels, prices or kinds changed). */
  build(items) {
    const t = this.theme;
    const priceText = (p) => (p < 0 ? `+${-p}` : `${p}`);
    // NOTES-42-hirelings: a row may show its own price text (`priceLabel`, e.g. the hired dwarves' wages per day).
    const priceOf = (r) => (r.priceLabel != null ? esc(r.priceLabel) : priceText(r.price));
    // Three goods on the top shelf, then four per shelf (NOTES-38-finders: one long second shelf overflowed the counter).
    const per = 4;
    const shelves = [items.slice(0, 3)];
    for (let i = 3; i < items.length; i += per) shelves.push(items.slice(i, i + per));
    const startOf = (si) => (si === 0 ? 0 : 3 + (si - 1) * per);
    this.el.innerHTML = `<div class="shop-room">
      <div class="sign"><div class="sign-chains"></div><div class="sign-board">${DRAGON_SVG}<span>${esc(t.sign)}</span></div></div>
      <div class="shop-body">
        <div class="slate"><div class="slate-title">${esc(t.board)}</div>
          <ol class="slate-rows">${items.map((r) => `<li class="row"><span class="nm">${esc(r.label)}</span><span class="dots"></span><span class="pr">${priceOf(r)}<small> ${r.priceLabel != null ? '' : esc(t.unit)}</small></span></li>`).join('')}</ol>
        </div>
        <div class="shelves">${shelves.map((s, si) => `<div class="shelf">${s.map((r, i) => `<div class="good" data-i="${startOf(si) + i}">${r.art || goodsSVG(r.kind, r.tier)}<span class="tag">${priceOf(r)}</span></div>`).join('')}</div>`).join('')}</div>
      </div>
      <div class="counter-top"><div class="purse">${coinsSVG(this.coinsId)}<span class="purse-l">${esc(t.purse)}</span><b class="purse-n"></b></div><div class="hint"></div></div>
    </div>`;
    this.rowEls = [...this.el.querySelectorAll('.row')];
    this.goodEls = items.map((_, i) => this.el.querySelector(`.good[data-i="${i}"]`));
    this.moneyEl = this.el.querySelector('.purse-n');
    this.hintEl = this.el.querySelector('.hint');
    this.coinEls = [...this.el.querySelectorAll('.coin')];
    this.state = { sel: -1, money: -1, hint: '', flags: [] };
    // NOTES-38-finders: a long list (the counter now has a dozen rows and more) scrolls inside the slate, which follows
    // the selection (inline styles: the stylesheet stays untouched); many rows are written a little smaller.
    this.slateEl = this.el.querySelector('.slate');
    const body = this.el.querySelector('.shop-body');
    Object.assign(body.style, { flex: '1 1 auto', minHeight: '0', overflow: 'hidden', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)' });
    Object.assign(this.slateEl.style, { position: 'relative', overflowY: 'auto', minHeight: '0', scrollbarWidth: 'none' });
    this.shelvesEl = this.el.querySelector('.shelves');
    Object.assign(this.shelvesEl.style, { position: 'relative', overflowY: 'auto', minHeight: '0', scrollbarWidth: 'none' });
    if (items.length > 10) for (const r of this.rowEls) r.style.fontSize = '1.06em';
  }

  /** NOTES-38-finders: scrolls the slate so the selected row (and a little of its neighbours) is in view. */
  follow(sel) {
    const keep = (s, r) => {
      if (!s || !r || s.scrollHeight <= s.clientHeight) return;
      const top = r.offsetTop - r.offsetHeight * 0.6;
      const bottom = r.offsetTop + r.offsetHeight * 1.6;
      if (top < s.scrollTop) s.scrollTop = Math.max(0, top);
      else if (bottom > s.scrollTop + s.clientHeight) s.scrollTop = bottom - s.clientHeight;
    };
    keep(this.slateEl, this.rowEls[sel]);
    // The goods: the selected one's shelf (offsetTop of the shelf inside the positioned shelves box).
    keep(this.shelvesEl, this.goodEls[sel]?.parentElement);
  }

  /**
   * Updates the menu; rebuilds only when the items' signature changes, otherwise toggles classes and texts.
   * @param {Array<{label: string, price: number, ok: boolean, kind?: string, tier?: number, art?: string}>} items
   * @param {number} sel selected index
   * @param {number} money the purse (shared money)
   * @param {string} hint key hint HTML
   */
  render(items, sel, money, hint) {
    const sig = items.map((r) => `${r.kind}|${r.tier}|${r.label}|${r.price}|${r.priceLabel ?? ''}`).join('¦');
    if (sig !== this.sig) {
      this.sig = sig;
      this.build(items);
    }
    const s = this.state;
    items.forEach((r, i) => {
      const flag = (r.ok ? 1 : 0) | (r.price > 0 && r.price > money ? 2 : 0);
      if (s.flags[i] === flag) return;
      s.flags[i] = flag;
      for (const e of [this.rowEls[i], this.goodEls[i]]) {
        if (!e) continue;
        e.classList.toggle('off', !(flag & 1));
        e.classList.toggle('poor', !!(flag & 2));
      }
    });
    if (s.sel !== sel) {
      this.rowEls[s.sel]?.classList.remove('sel');
      this.goodEls[s.sel]?.classList.remove('sel');
      this.rowEls[sel]?.classList.add('sel');
      this.goodEls[sel]?.classList.add('sel');
      s.sel = sel;
      this.follow(sel);
    }
    if (s.money !== money) {
      s.money = money;
      this.moneyEl.textContent = money;
      const n = money <= 0 ? 0 : Math.min(this.coinEls.length, 1 + Math.floor(Math.log2(1 + money / 8)));
      this.coinEls.forEach((c, i) => c.setAttribute('display', i < n ? 'inline' : 'none'));
    }
    if (s.hint !== hint) {
      s.hint = hint;
      this.hintEl.innerHTML = hint;
    }
  }

  /** Forgets the built DOM (next render rebuilds). */
  reset() {
    this.sig = '';
    this.el.innerHTML = '';
  }
}
