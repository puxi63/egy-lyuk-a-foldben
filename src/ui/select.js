/* ==== ui/select.js — the character select: Bag End's dining room, the characters as portrait cards (TERV 0.12) ==== */
import { portraitSVG } from './art.js';

/** What each one says on stepping forward (book, ch. 1: "… at your service!"; Bilbo's "Good morning!"). */
const GREETINGS = {
  bilbo: 'Jó reggelt!',
  thorin: 'Tölgypajzsos Thorin, szolgálatodra!',
  balin: 'Balin, szolgálatodra!',
  bofur: 'Bofur, szolgálatodra!',
  bombur: 'Bombur, szolgálatodra!',
  kili: 'Kíli, szolgálatodra!',
};

/** Two candles on the table edge. */
const CANDLE = '<svg class="candle" viewBox="0 0 30 80" aria-hidden="true"><ellipse cx="15" cy="12" rx="9" ry="14" fill="#ffd27a" opacity=".35"/><path d="M15 2c4 6 4 10 0 13-4-3-4-7 0-13z" fill="#ffe7a0"/><rect x="10" y="16" width="10" height="50" rx="2" fill="#f2e6c8"/><ellipse cx="15" cy="70" rx="13" ry="4" fill="#b48a3a" stroke="#5a3a12"/></svg>';

export class SelectView {
  /** @param {HTMLElement} el the select container of one HUD */
  constructor(el) {
    this.el = el;
    this.built = false;
    this.state = { pick: -1, taken: '', hint: '', slot: -1 };
  }

  build(chars) {
    this.el.innerHTML = `<div class="dining">
      <div class="dr-window"></div>
      <header class="dr-head"><h2>Ki ül az asztalhoz?</h2><div class="chair"></div></header>
      <div class="cards">${chars.map((c, i) => `<div class="card" data-i="${i}" style="--cc:${c.color}"><div class="por">${portraitSVG(c)}</div><div class="nm">${c.name}</div><div class="taken">foglalt</div></div>`).join('')}</div>
      <div class="dr-table">${CANDLE}${CANDLE}</div>
      <div class="dr-info"><div class="speech"></div><div class="perks"><b class="pn"></b><span class="plus"></span><span class="minus"></span></div></div>
      <div class="hint"></div>
    </div>`;
    this.cards = [...this.el.querySelectorAll('.card')];
    this.speech = this.el.querySelector('.speech');
    this.pn = this.el.querySelector('.pn');
    this.plus = this.el.querySelector('.plus');
    this.minus = this.el.querySelector('.minus');
    this.hintEl = this.el.querySelector('.hint');
    this.chairEl = this.el.querySelector('.chair');
    this.built = true;
    this.state = { pick: -1, taken: '', hint: '', slot: -1 };
  }

  /**
   * Updates the view; cheap when nothing changed.
   * @param {object[]} chars CHARACTERS
   * @param {number} pick the highlighted index
   * @param {(i: number) => boolean} taken whether the other player has that character
   * @param {number} slot player slot (0 / 1): which chair
   * @param {string} hint key hint HTML
   */
  render(chars, pick, taken, slot, hint) {
    if (!this.built) this.build(chars);
    const s = this.state;
    const tk = chars.map((_, i) => (taken(i) ? 1 : 0)).join('');
    if (tk !== s.taken) {
      s.taken = tk;
      this.cards.forEach((c, i) => c.classList.toggle('off', tk[i] === '1'));
    }
    if (pick !== s.pick) {
      this.cards[s.pick]?.classList.remove('sel');
      this.cards[pick]?.classList.add('sel');
      s.pick = pick;
      const c = chars[pick];
      this.el.style.setProperty('--cc', c.color);
      // Re-inserting the text restarts the greeting's fade-in.
      this.speech.innerHTML = `<span>„${GREETINGS[c.id] || `${c.name}, szolgálatodra!`}”</span>`;
      this.pn.textContent = c.name;
      this.plus.textContent = `+ ${c.plus}`;
      this.minus.textContent = `− ${c.minus}`;
    }
    if (slot !== s.slot) {
      s.slot = slot;
      this.chairEl.textContent = `${slot + 1}. játékos széke`;
    }
    if (hint !== s.hint) {
      s.hint = hint;
      this.hintEl.innerHTML = hint;
    }
  }

  /** Clears the view (it is rebuilt when the select opens again). */
  reset() {
    this.built = false;
    this.el.innerHTML = '';
  }
}
