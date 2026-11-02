/* ==== timed-events/auction.js — the Sackville-Bagginses' auction during play (TERV 0.7 "Kiskötő-Zsákosék árverése",
   0.13/6; NOTES-12-events) ====
   If the whole company stays underground too long, the Sackville-Bagginses (Lobelia and Otho) take Bilbo for dead
   and start auctioning Bag End's furnishing, as at the end of the book (ch. 19). Coming up stops it; what was sold can
   be bought back at its place in Bag End (the furnishing menu) at the tier's price plus a small premium — in the book
   Bilbo had to buy back a good deal of his own furniture.
   - Clock: the day clock's seconds (Bag End's play clock; Mirkwood's enchanted sleep counts too). AUCTION.startAfter
     of them with nobody up (on the surface or in Bag End) starts it; then one lot every AUCTION.every, at most
     AUCTION.maxLots per absence. A warning comes AUCTION.warnBefore earlier.
   - A lot: one slot drops one tier (bagEnd.setTier) and is marked "elárverezve" until bought back. The silver spoons
     go first when the sideboard has them (they "mysteriously disappeared", book ch. 19; Lobelia's spoon, TERV 0.13/2).
   - Never sold: the mathom room's cases (the famous finds' trophies live in them), Bilbo's bed (the save spot and the
     night skip) and the wine rack (it holds the laid-down bottles). Nothing outside Bag End is touched (exits, lift
     stops, picks, bags and armour are not furnishing).
   - After the finale (`finale.done`) it never happens again: the epilogue stopped it for good (finale/lines.js
     auctionOver); tiers still marked can then be bought back at the plain price.
   Off on the bench pages (QA sets `force`). ==== */

export const AUCTION = {
  startAfter: 1200, // clock seconds underground before the first lot: one game day (20 real minutes)
  warnBefore: 150, // the warning this much earlier
  every: 100, // one lot per 100 clock seconds after that (about 2 game hours by day)
  maxLots: 8, // at most this many lots per absence
  premium: 1.1, // buy-back price: the tier's price × 1.1 (then the buyer's perk and the co-op factor, as for any tier)
  never: ['agy', 'borospolc'], // + every mathom-room case (slot.vitrin)
  spoons: 'talalo', // the sideboard; its tier 2 holds the silver spoons
};

const HUD_CSS = {
  position: 'absolute', left: '50%', top: '55%', transform: 'translateX(-50%)', fontSize: '13px', color: '#f3dfa6',
  fontFamily: 'var(--f-head, serif)', padding: '2px 12px', borderRadius: '8px', background: 'linear-gradient(#5a3a1ecc, #3a2410cc)',
  border: '1px solid #c8a04a', textShadow: '0 1px 2px #000', pointerEvents: 'none', zIndex: '3', whiteSpace: 'nowrap', display: 'none',
};

export class Auction {
  constructor(game) {
    this.game = game;
    /** Clock seconds the company has been underground without a break (saved). */
    this.away = 0;
    /** Lots sold in this absence, their names (for the report on coming up), the warning given (saved). */
    this.lots = 0;
    this.sold = [];
    this.warned = false;
    /** Per slot id: the tier count before the auction took it (the tiers below it are marked until bought back). */
    this.lost = {};
    /** QA: allows the auction on a bench page. */
    this.force = false;
    this.lastSec = null;
    this.ui = new Map();
    const be = game.bagEnd;
    if (be) {
      be.tierMark = (s, i) => this.mark(s, i);
      be.onBought = (s, k) => this.bought(s, k);
    }
  }

  get enabled() {
    return this.force || !this.game.bench;
  }

  /** Bag End's buy-back mark of tier index i of slot s: { mult, note, desc } or null. */
  mark(s, i) {
    const L = this.lost[s.id];
    if (!L || i >= L) return null;
    const after = !!this.game.finale?.done;
    const pct = Math.round((AUCTION.premium - 1) * 100);
    return after
      ? { mult: 1, note: 'elárverezve', desc: 'Kiskötő-Zsákosék árverésén kelt el; most a régi áron visszaveheted.' }
      : { mult: AUCTION.premium, note: 'elárverezve', desc: `Kiskötő-Zsákosék árverésén kelt el: ${pct} % felárral veheted vissza.` };
  }

  bought(s, k) {
    if (this.lost[s.id] && k >= this.lost[s.id]) delete this.lost[s.id];
  }

  /** On the surface or in Bag End. */
  isUp(p) {
    return !p.choosing && p.dead <= 0 && (p.depth < 1 || !!this.game.bagEnd?.isInside(p));
  }

  /** The slots that can go under the hammer now (furnished, not protected). */
  eligible() {
    const be = this.game.bagEnd;
    if (!be) return [];
    return be.slots.filter((s) => s.vitrin == null && !AUCTION.never.includes(s.id) && be.tiers[s.id] > 0);
  }

  /** Sells one lot; returns false when nothing is left to sell. */
  sellOne() {
    const be = this.game.bagEnd;
    const list = this.eligible();
    if (!list.length) return false;
    let s = list.find((x) => x.id === AUCTION.spoons && be.tiers[x.id] >= 2);
    const spoons = !!s;
    if (!s) {
      // Weighted by the current tier's price: the finer things go first, more or less.
      let sum = 0;
      for (const x of list) sum += x.tiers[be.tiers[x.id] - 1].price;
      let r = Math.random() * sum;
      s = list[list.length - 1];
      for (const x of list) {
        r -= x.tiers[be.tiers[x.id] - 1].price;
        if (r <= 0) {
          s = x;
          break;
        }
      }
    }
    const k = be.tiers[s.id];
    const tier = s.tiers[k - 1];
    this.lost[s.id] = Math.max(this.lost[s.id] || 0, k);
    be.setTier(s.id, k - 1);
    this.lots++;
    this.sold.push(spoons ? 'az ezüstkanalak' : tier.name);
    const first = this.lots === 1;
    const lot = spoons ? 'az ezüstkanalak rejtélyes módon eltűntek a tálalóról… (Lobelia?)' : `elkelt: ${tier.name}.`;
    const text = first
      ? `Árverés Zsáklakban! Kiskötő-Zsákosék halottnak hisznek, és elárverezik a holmidat — ${lot} Gyere fel, és állítsd le!`
      : `Árverés Zsáklakban: ${lot}`;
    for (const q of this.game.players) if (!q.choosing) q.say(text, first ? 6 : 4);
    return true;
  }

  /** Came up: the auction stops; what was sold this time is told once. */
  report() {
    const names = this.sold.join(', ');
    const pct = Math.round((AUCTION.premium - 1) * 100);
    const text = `Feljöttél, az árverésnek vége. Míg lent voltatok, Kiskötő-Zsákosék elárverezték: ${names}. Zsáklakban, a helyükön visszaveheted őket (${pct} % felárral).`;
    for (const q of this.game.players) if (this.isUp(q)) q.say(text, 8);
  }

  reset() {
    this.away = 0;
    this.lots = 0;
    this.sold = [];
    this.warned = false;
  }

  update(dt) {
    const g = this.game;
    const sec = g.dayClock?.seconds ?? 0;
    const d = this.lastSec == null ? 0 : Math.max(0, sec - this.lastSec);
    this.lastSec = sec;
    this.hud();
    if (!this.enabled || !g.bagEnd) return;
    // The epilogue stopped it for good (book ch. 19); while the finale runs nothing happens either.
    if (g.finale?.done) {
      if (this.away || this.lots) this.reset();
      return;
    }
    const st = g.finale?.stage;
    if (st != null && st !== 'idle') return;
    const active = g.players.filter((p) => !p.choosing);
    if (!active.length) return;
    if (active.some((p) => this.isUp(p))) {
      if (this.sold.length) this.report();
      if (this.away || this.lots) this.reset();
      return;
    }
    this.away += d;
    if (!this.warned && this.away >= AUCTION.startAfter - AUCTION.warnBefore && this.eligible().length) {
      this.warned = true;
      for (const q of active) q.say('Hír jön a felszínről: Kiskötő-Zsákosék Zsáklak körül szimatolnak, és már halottnak hisznek. Jobb lenne hamarosan feljönni!', 6);
    }
    if (this.away < AUCTION.startAfter) return;
    const due = Math.min(AUCTION.maxLots, Math.floor((this.away - AUCTION.startAfter) / AUCTION.every) + 1);
    while (this.lots < due) {
      if (!this.sellOne()) {
        this.lots = due; // nothing (left) to sell: no more lots this absence
        break;
      }
    }
  }

  /** A small line in each HUD while the auction runs and nobody is up. */
  hud() {
    const g = this.game;
    const running = this.sold.length > 0 && !g.players.some((p) => this.isUp(p));
    g.players.forEach((p, i) => {
      const el = g.huds?.[i]?.el;
      if (!el) return;
      let ui = this.ui.get(p);
      if (!ui || ui.root !== el) {
        ui = { root: el, line: document.createElement('div'), text: null };
        ui.line.className = 'auction-line';
        Object.assign(ui.line.style, HUD_CSS);
        el.appendChild(ui.line);
        this.ui.set(p, ui);
      }
      const text = running && !p.choosing ? `Árverés Zsáklakban · ${this.sold.length} elkelt` : '';
      if (text !== ui.text) {
        ui.text = text;
        ui.line.textContent = text;
        ui.line.style.display = text ? 'block' : 'none';
      }
    });
  }

  /** { a: away seconds, n: lots, s: sold names, w: warned, l: lost tiers } (empty fields left out). */
  state() {
    const out = {};
    if (this.away) out.a = Math.round(this.away);
    if (this.lots) out.n = this.lots;
    if (this.sold.length) out.s = this.sold.slice();
    if (this.warned) out.w = 1;
    if (Object.keys(this.lost).length) out.l = { ...this.lost };
    return out;
  }

  restore(s) {
    this.away = s?.a || 0;
    this.lots = s?.n || 0;
    this.sold = (s?.s || []).slice();
    this.warned = !!s?.w;
    this.lost = { ...(s?.l || {}) };
    // Clock time that passed before the restore (e.g. a clock jump while this module was idle) must not count as
    // time away: the next update starts measuring afresh.
    this.lastSec = null;
  }
}
