/* ==== shire/mathoms.js — the mathom economy (TERV 0.11/13): "a haszontalan leletek mathomok. A szomszéd hobbitok
   cserélnek veled; szülinapodon te adsz ajándékot (hobbit szokás), és ezzel hírnevet szerzel, ami olcsóbb árakat és
   új vásárlókat hoz". ====
 * - MATHOM_IDS: the finds that count as mathoms. A mathom (LotR prologue) is anything a hobbit has no immediate use for
 *   but will not throw away: Bilbo's brass button, a silver spoon, the buried mathom itself, the broken jug, an old
 *   pipe, one of Gandalf's old fireworks — layers 1–2, all of Hobbiton's own. Wine (the cellar ages it), food, gold,
 *   gems, weapons and the far layers' finds are not mathoms.
 * - The neighbour (surface/neighbour.js, a plain "szomszéd hobbit", no invented name) swaps one mathom for an apple pie
 *   (food), a pouch of Longbottom leaf (small goods) or a different mathom; TRADE.perDay trades a game day.
 * - Reputation ("hírnév"): +TRADE.rep per trade, +REP.birthday (+REP.gift per mathom given) on Bilbo's birthday
 *   (home-events/index.js birthdayDone → shire.onBirthday). Levels (REP.levels): the Green Dragon's prices −2.5 % and
 *   its buying +2.5 % per level; from level 1 "new buyers": once a game day, by chance (REP.buyerChance), a buyer at
 *   the counter pays REP.buyerMult for one find kind until the day ends. ==== */
import { DAY } from '../daynight.js';
import { FIND_TYPES } from '../finds.js';
import { layerAtDepth } from '../materials.js';

export const MATHOM_IDS = ['gomb', 'kanal', 'mathom', 'kancso', 'pipa', 'tukkacat'];

/** True when a find type is a mathom. */
export const isMathom = (t) => !!t && MATHOM_IDS.includes(t.id);

/**
 * Find kinds the Shire life adds (food for the bag; layer −1 and weight 0: never dug, never in the journal's layer
 * lists). Registered once into FIND_TYPES at import, so the bag's save (find ids) and the counter (value) know them.
 */
const EXTRA_TYPES = [
  // TERV 0.11/16: "krumpli, gomba, paradicsom" from the garden (potatoes and mushrooms are the existing layer-1 finds).
  { id: 'paradicsom', name: 'Paradicsom a kertből', value: 3, layer: -1, weight: 0, color: 0xd8402a },
  // Apple-tart: one of the dishes the dwarves ask Bilbo for (A hobbit, 1. fejezet).
  { id: 'almaspite', name: 'Almás pite a szomszédtól', value: 6, layer: -1, weight: 0, color: 0xc8904a },
];
for (const t of EXTRA_TYPES) if (!FIND_TYPES.some((f) => f.id === t.id)) FIND_TYPES.push(t);

export const REP = {
  levels: [0, 4, 10, 18, 30], // reputation points for level 0..4
  names: ['ismeretlen', 'jó szomszéd', 'megbecsült hobbit', 'közkedvelt', 'híres az egész Megyében'],
  price: 0.025, // per level: the Green Dragon's prices ×(1 − price·L)
  sell: 0.025, // per level: its buying ×(1 + sell·L)
  birthday: 2, // the birthday feast
  gift: 2, // each mathom given on the birthday
  buyerChance: [0, 0.35, 0.55, 0.75, 0.95], // per level, once a game day
  buyerMult: 1.5,
};

export const TRADE = { perDay: 3, rep: 1 };

/** Generic buyers (no invented names): who comes to the Green Dragon for one kind of find. */
const BUYERS = ['egy átutazó törpe', 'egy bakföldi hobbit', 'egy vándorló kereskedő'];

const byId = (id) => FIND_TYPES.find((f) => f.id === id);

export class Mathoms {
  constructor(shire) {
    this.shire = shire;
    this.game = shire.game;
    this.rep = 0;
    this.trades = { day: 0, n: 0 };
    /** The new buyer today: { id, mult, until (clock s), who } or null; `rolled` = the game day last rolled. */
    this.buyer = null;
    this.rolled = 0;
  }

  level(rep = this.rep) {
    let l = 0;
    for (let k = 0; k < REP.levels.length; k++) if (rep >= REP.levels[k]) l = k;
    return l;
  }

  levelName() {
    return REP.names[this.level()];
  }

  /** hud.js: multiplier of the Green Dragon's prices. */
  priceMult() {
    return 1 - REP.price * this.level();
  }

  /** hud.js: multiplier of the counter's buying (the whole bag). */
  sellMult() {
    return 1 + REP.sell * this.level();
  }

  clock() {
    return this.game.bagEnd?.clock ?? 0;
  }

  /** hud.js: multiplier for one find at the counter (the new buyer's kind). */
  buyerMult(f) {
    const b = this.buyer;
    return b && f && f.id === b.id && this.clock() < b.until ? b.mult : 1;
  }

  addRep(n, why) {
    const before = this.level();
    this.rep += n;
    const after = this.level();
    if (after > before) {
      for (const p of this.game.players) if (!p.choosing) p.say(`Hírneved nőtt${why ? ` (${why})` : ''}: ${REP.names[after]}. Jobb árak a Zöld Sárkányban.`, 4.5);
    }
  }

  /** Bilbo's birthday (home-events): the feast and every mathom given. */
  onBirthday(gifts) {
    this.addRep(REP.birthday + REP.gift * (gifts || 0), 'születésnap');
  }

  /** The deepest layer any player has reached (the buyer wants something from there). */
  deepestLayer() {
    let d = 0;
    for (const p of this.game.players) d = Math.max(d, p.maxDepth || 0, p.depth || 0);
    return Math.max(0, layerAtDepth(d));
  }

  /** Once a game day (from level 1): maybe a new buyer. `force` = QA (always). Returns the buyer or null. */
  rollBuyer(force = false) {
    const day = this.game.dayClock?.day?.() ?? 1;
    if (!force && this.rolled === day) return null;
    this.rolled = day;
    const L = this.level();
    if (!force && (L < 1 || Math.random() > REP.buyerChance[L])) return null;
    const top = this.deepestLayer();
    const kinds = FIND_TYPES.filter((f) => f.layer >= 0 && f.layer <= top && f.weight > 0 && f.value > 0 && !f.famous && !f.keep);
    if (!kinds.length) return null;
    const f = kinds[Math.floor(Math.random() * kinds.length)];
    const who = BUYERS[Math.floor(Math.random() * BUYERS.length)];
    this.buyer = { id: f.id, mult: REP.buyerMult, until: this.clock() + DAY.length, who };
    for (const p of this.game.players) if (!p.choosing) p.say(`Új vevő a Zöld Sárkányban: ${who} ma másfélszeres árat ad ezért: ${f.name}.`, 5);
    return this.buyer;
  }

  /** The counter's note on the sell row (the buyer, while he is there). */
  buyerNote() {
    const b = this.buyer;
    if (!b || this.clock() >= b.until) return '';
    return ` · új vevő: ${byId(b.id)?.name || b.id} ×${b.mult}`;
  }

  /* ---------------- the neighbour's trades ---------------- */

  /** The cheapest mathom in a bag (the one a trade gives), or null. */
  cheapestMathom(p) {
    let best = null;
    for (const f of p.bag) if (isMathom(f) && (!best || f.value < best.value)) best = f;
    return best;
  }

  tradesLeft() {
    const day = this.game.dayClock?.day?.() ?? 1;
    if (this.trades.day !== day) return TRADE.perDay;
    return Math.max(0, TRADE.perDay - this.trades.n);
  }

  /** The neighbour's offers for a player: [{ label, ok, act }] (the last row closes). */
  offers(p) {
    const m = this.cheapestMathom(p);
    const left = this.tradesLeft();
    const ok = !!m && left > 0;
    const give = m ? m.name : 'egy mathom';
    const rows = [
      { label: `${give} → almás pite (étel)`, ok, act: () => this.trade(p, m, byId('almaspite')) },
      { label: `${give} → Hosszúvölgyi levél`, ok, act: () => this.trade(p, m, byId('dohany')) },
      { label: `${give} → egy másik mathom`, ok, act: () => this.trade(p, m, this.otherMathom(m)) },
      { label: 'Köszönöm, viszlát!', ok: true, close: true, act: () => {} },
    ];
    return rows;
  }

  /** A different mathom kind; with more reputation the neighbour parts with a better one more often. */
  otherMathom(m) {
    const kinds = MATHOM_IDS.filter((id) => id !== m?.id).map(byId).filter(Boolean);
    const L = this.level();
    if (Math.random() < 0.15 + 0.12 * L) {
      const better = kinds.filter((k) => k.value > (m?.value || 0));
      if (better.length) return better[Math.floor(Math.random() * better.length)];
    }
    return kinds[Math.floor(Math.random() * kinds.length)];
  }

  /** Swaps mathom `m` from the player's bag for `get`. Returns true when done. */
  trade(p, m, get) {
    if (!m || !get) return false;
    if (this.tradesLeft() <= 0) {
      p.say('A szomszéd mára eleget cserélt. Holnap gyere vissza!', 3);
      return false;
    }
    const k = p.bag.indexOf(m);
    if (k < 0) return false;
    p.bag[k] = get;
    const day = this.game.dayClock?.day?.() ?? 1;
    if (this.trades.day !== day) this.trades = { day, n: 0 };
    this.trades.n++;
    p.say(`Elcserélted: ${m.name} → ${get.name}. A szomszéd mosolyogva teszi el.`, 3.5);
    this.addRep(TRADE.rep, 'csere');
    return true;
  }

  update() {
    // A new buyer is rolled once each game day, during the day (the first check after 07:00).
    const dc = this.game.dayClock;
    if (dc && dc.hour() >= 7 && dc.hour() < 21) this.rollBuyer();
    if (this.buyer && this.clock() >= this.buyer.until) this.buyer = null;
  }

  state() {
    const out = { r: this.rep, t: [this.trades.day, this.trades.n], d: this.rolled };
    if (this.buyer) out.b = [this.buyer.id, this.buyer.mult, Math.round(this.buyer.until), this.buyer.who];
    return out;
  }

  restore(s) {
    this.rep = s?.r || 0;
    this.trades = { day: s?.t?.[0] || 0, n: s?.t?.[1] || 0 };
    this.rolled = s?.d || 0;
    this.buyer = s?.b ? { id: s.b[0], mult: s.b[1], until: s.b[2], who: s.b[3] } : null;
  }
}
