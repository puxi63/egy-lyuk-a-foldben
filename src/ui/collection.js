/* ==== ui/collection.js — the bag and the collection screens (TERV 0.12's screen table; NOTES-25-map-contract) ====
 *   - Zsák: "a nyitott zsák belseje felülről: a leletek benne fekszenek, nem rácsos ikonok" — the open sack seen from
 *     above, its rolled mouth around a dark inside where the finds lie scattered (each drawn in its own colour: a metal
 *     disc, a cut stone or a lump), and beside it the list (kind, count, value) and the sack's fill.
 *   - Gyűjtemény: Bilbo's book listing the trophies of Bag End's mathom room (bagEnd.trophies: the famous finds and the
 *     pieces bagEnd.addTrophy receives), found ones written in ink with their layer, missing ones as an empty line.
 * Both are shown by ui/screens.js from the pause (shared screen, the game frozen), for the player who paused; left /
 * right switches to the other player's bag. Built on show (one innerHTML), emptied on hide: no cost while closed.
 * NOTES-35-lift-doors-bag: the bag lists its food first (shire/meals.js BAG_FOOD); up / down selects a row and
 * confirm (A / Enter / Space) or the "Megeszem" button eats the selected food (Meals.eatFromBag: the plate rises, and
 * inside a meal window it is that meal). Confirm on a row that is not food goes back, as before. ==== */
import { BAG_TIERS, HUNGER } from '../config.js';
import { FIND_TYPES } from '../finds.js';
import { LAYER_NAMES } from '../materials.js';
import { BAG_FOOD } from '../shire/meals.js';
import { hex } from './art.js';

/** The trophies the mathom room can receive (bagEnd.addTrophy callers), in the order of the layers. */
const TROPHIES = [
  { id: 'glamdring', note: 'Gandalf kardja, a trollok barlangjából' },
  { id: 'gombok', note: 'a goblinok hátsó kapujánál pattantak le' },
  { id: 'orkrist', note: 'Thorin kardja, a Tünde-király fegyvertárából' },
  { id: 'girion', note: 'Girion, Dale urának smaragdjai' },
  { id: 'harfak', note: 'aranyhárfák ezüsthúrokkal' },
  { id: 'mithril', note: 'Thorin ajándéka Bilbónak' },
  { id: 'thror-kulcs', name: 'Thrór kulcsa', layer: 7, note: 'Durin ajtajának kulcsa' },
  { id: 'arkenko', note: 'a Hegy Szíve' },
  // NOTES-45-final-docs: the two trophies that come from no layer. `place` replaces the layer name; `only` hides the row
  // until it may be known (the Red Book is Kihívás's end trophy: listed in Kihívás or once it is in the case).
  { id: 'tukkacat', place: 'A Megye', note: 'Bilbó ünnepségének emléke a Mulatórétről' }, // NOTES-39-party
  { id: 'piros-konyv', name: 'Bilbó Piros Könyve', color: 0xa02a24, place: 'Kihívás', note: 'a Kihívás teljesítéséért', only: (g) => !!g.enemies?.challenge }, // finale/index.js finish()
];

/** Deterministic 0..1 noise from an integer (positions in the sack stay put between openings). */
const rnd = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const GEM = /smaragd|zafír|rubin|gyémánt|kristály|drágakő|gyöngy|csiszolt|nyers ?kő|ékkő|opál|topáz|ametiszt|gránát/i;

/** One find lying in the sack at (x, y), drawn by its kind: a metal disc, a cut gem or a lump. */
function findShape(f, x, y, k) {
  const c = hex(f.color, '#8a7a5a');
  const rot = Math.round(rnd(k + 7) * 360);
  if (f.metal) {
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})"><ellipse rx="13" ry="10" fill="${c}" stroke="#2a1806" stroke-width="1.6"/><ellipse rx="8" ry="5.5" fill="none" stroke="#fff6" stroke-width="1.4"/><ellipse cx="-4" cy="-3" rx="3" ry="2" fill="#fffa"/></g>`;
  }
  if (GEM.test(f.name)) {
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})"><path d="M0-12l10 6v12L0 12l-10-6v-12z" fill="${c}" stroke="#1a1008" stroke-width="1.5"/><path d="M0-12v24M-10-6l20 12M10-6l-20 12" stroke="#fff5" stroke-width="1"/><path d="M-3-8l5 3-5 3z" fill="#fffc"/></g>`;
  }
  const a = 9 + rnd(k + 3) * 5;
  const b = 7 + rnd(k + 5) * 4;
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})"><path d="M${-a} 0C${-a} ${-b} ${-a * 0.2} ${-b * 1.1} ${a * 0.4} ${-b}S${a} ${-b * 0.3} ${a} ${b * 0.2} ${a * 0.2} ${b} ${-a * 0.4} ${b}S${-a} ${b * 0.6} ${-a} 0z" fill="${c}" stroke="#2a1806" stroke-width="1.5"/><path d="M${-a * 0.4} ${-b * 0.5}q${a * 0.3} ${-b * 0.3} ${a * 0.6} 0" stroke="#fff5" stroke-width="1.3" fill="none"/></g>`;
}

/** The open sack from above with the finds inside (positions on a sunflower spiral, jittered). */
function sackTop(bag) {
  const shapes = bag.map((f, k) => {
    const r = 128 * Math.sqrt((k + 0.6) / Math.max(12, bag.length + 1));
    const a = k * 2.39996 + rnd(k) * 0.5;
    return findShape(f, 300 + Math.cos(a) * r * 1.12 + (rnd(k + 11) - 0.5) * 10, 300 + Math.sin(a) * r * 0.92 + (rnd(k + 13) - 0.5) * 10, k);
  }).join('');
  return `<svg class="bg-svg" viewBox="0 0 600 600" aria-hidden="true">
    <defs>
      <radialGradient id="bg-in" cx="50%" cy="46%" r="55%"><stop offset="0" stop-color="#3a2410"/><stop offset=".75" stop-color="#1a0e04"/><stop offset="1" stop-color="#0a0502"/></radialGradient>
      <pattern id="bg-weave" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 2h8M0 6h8" stroke="#6a4a22" stroke-width="1.6"/><path d="M2 0v8M6 0v8" stroke="#8a6a3a" stroke-width="1.1" opacity=".7"/></pattern>
      <radialGradient id="bg-light" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#ffd890" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
    </defs>
    <ellipse cx="300" cy="306" rx="276" ry="252" fill="#00000066"/>
    <ellipse cx="300" cy="300" rx="270" ry="246" fill="#a8844e"/><ellipse cx="300" cy="300" rx="270" ry="246" fill="url(#bg-weave)" opacity=".75"/>
    <ellipse cx="300" cy="300" rx="208" ry="186" fill="url(#bg-in)"/>
    <g>${shapes}</g>
    <ellipse cx="300" cy="300" rx="208" ry="186" fill="url(#bg-light)"/>
    <ellipse cx="300" cy="300" rx="212" ry="190" fill="none" stroke="#5a3a16" stroke-width="12"/><ellipse cx="300" cy="300" rx="232" ry="210" fill="none" stroke="#c8a46a" stroke-width="22" opacity=".85"/>
    <ellipse cx="300" cy="300" rx="232" ry="210" fill="none" stroke="#6a4a22" stroke-width="2" stroke-dasharray="7 9"/>
    <path d="M70 230c-20 40-30 120 10 170M530 230c20 40 30 120-10 170" stroke="#5a3a16" stroke-width="5" fill="none" opacity=".6"/>
    <path d="M300 54c-30-26-80-30-96-10s30 34 96 14c66 20 112 6 96-14s-66-16-96 10z" fill="#c8a46a" stroke="#5a3a16" stroke-width="4"/>
  </svg>`;
}

export class BagView {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    el.className = 'scr scr-bag';
    this.who = 0;
    this.sel = 0;
    this.note = '';
  }

  show(who, onBack) {
    this.who = who;
    this.onBack = onBack;
    this.sel = 0;
    this.note = '';
    this.render();
    this.el.classList.add('on');
  }

  hide() {
    this.el.classList.remove('on');
    this.el.innerHTML = '';
  }

  /** The shown bag's rows: [{ f, n, food }] (food first, the most filling first; then by value). */
  groups() {
    const p = this.game.players[this.who];
    const groups = new Map();
    for (const f of p?.bag || []) {
      const e = groups.get(f.id) || { f, n: 0, food: BAG_FOOD[f.id] || 0 };
      e.n++;
      groups.set(f.id, e);
    }
    return [...groups.values()].sort((a, b) => (b.food ? 1 : 0) - (a.food ? 1 : 0) || b.food - a.food || b.f.value - a.f.value);
  }

  input(it) {
    if (it.backPressed || it.pausePressed) return this.onBack?.();
    const rows = this.groups();
    if (it.confirmPressed) {
      if (rows[this.sel]?.food) return this.eat();
      return this.onBack?.();
    }
    const n = this.game.players.length;
    const side = (it.rightPressed ? 1 : 0) - (it.leftPressed ? 1 : 0);
    const vert = (it.downPressed ? 1 : 0) - (it.upPressed ? 1 : 0);
    // Up / down select a row; with an empty bag they switch bags, as left / right always do.
    const step = side || (rows.length ? 0 : vert);
    if (step && n > 1) {
      this.who = (this.who + step + n) % n;
      this.sel = 0;
      this.note = '';
      this.render();
    } else if (vert && rows.length) {
      this.sel = (this.sel + vert + rows.length) % rows.length;
      this.render();
    }
  }

  /** Eats the selected food from the shown bag (shire/meals.js eatFromBag); the result goes to the card's note line. */
  eat() {
    const g = this.game;
    const p = g.players[this.who];
    const row = this.groups()[this.sel];
    if (!p || !row?.food) return;
    const meals = g.shire?.meals;
    let res;
    if (meals) res = meals.eatFromBag(p, row.f.id);
    else {
      // No Shire module (a test page): the plate alone.
      const max = g.bagEnd?.effects?.hungerMax ?? HUNGER.max;
      const k = p.bag.findIndex((f) => f && f.id === row.f.id);
      if (k >= 0 && p.hunger < max - 0.5) {
        p.bag.splice(k, 1);
        p.hunger = Math.min(max, p.hunger + row.food);
        res = { ok: true, text: `Megetted: ${row.f.name} (+${row.food} a tányérra).` };
      } else res = { ok: false, text: 'Tele a tányér: most egy falat sem fér beléd.' };
    }
    this.note = res.text;
    if (res.ok) g.saveNow?.();
    const rows = this.groups();
    this.sel = Math.max(0, Math.min(this.sel, rows.length - 1));
    this.render();
  }

  render() {
    const g = this.game;
    const p = g.players[this.who];
    const bag = p?.bag || [];
    const cap = p?.bagCap ?? BAG_TIERS[0].cap;
    const tier = BAG_TIERS[p?.bagTier || 0]?.name || '';
    const rows = this.groups();
    this.sel = Math.max(0, Math.min(this.sel, rows.length - 1));
    const SEL = 'background:#e8c87066;box-shadow:inset 0 0 0 1px #8a5a2099;border-radius:3px';
    const list = rows.map(({ f, n, food }, k) =>
      `<li data-k="${k}" style="${k === this.sel ? SEL : ''}"><i style="background:${hex(f.color, '#8a7a5a')}"></i><span>${f.name}</span><b>×${n}</b><em>${f.value * n} arany${food ? ` <small style="color:#3a5a14">· étel +${food}</small>` : ''}</em></li>`).join('');
    const sum = bag.reduce((s, f) => s + (f.value || 0), 0);
    const other = g.players.length > 1 ? '<span>balra / jobbra: a másik zsák</span><span class="or">·</span>' : '';
    const cur = rows[this.sel];
    const hasFood = rows.some((r) => r.food);
    const max = g.bagEnd?.effects?.hungerMax ?? HUNGER.max;
    const plate = p ? Math.round((Math.max(0, p.hunger) / max) * 100) : 0;
    const eatLine = !hasFood ? '' : `<p class="bg-eatline" style="margin:0.4rem 0 0;display:flex;gap:0.5em;align-items:center;flex-wrap:wrap;font-size:0.9em">
        ${cur?.food ? `<button class="bg-eat" type="button" style="font:inherit;padding:0.15em 0.7em;border:1px solid #5a3a1a;border-radius:4px;background:#e8d4a0;color:#3a2410;cursor:pointer">Megeszem</button><span>${cur.f.name}: +${cur.food} a tányérra (most ${plate} %)</span>`
          : '<span>Fel / le: válassz egy ételt a zsákból.</span>'}
      </p>`;
    const note = this.note ? `<p class="bg-note" style="margin:0.3rem 0 0;font-style:italic;color:#4a2a0a">${this.note}</p>` : '';
    this.el.innerHTML = `<div class="bg-room">
      <div class="bg-sack">${sackTop(bag)}</div>
      <div class="bg-card">
        <h2>Zsák</h2>
        <p class="bg-who"><b style="color:${hex(p?.ch?.color, '#7a3a10')}">${p?.ch?.name || 'Játékos'}</b> · ${tier}</p>
        <p class="bg-fill"><b>${bag.length} / ${cap}</b> hely${bag.length >= cap ? ' · <span class="full">tele a zsák!</span>' : ''}</p>
        ${bag.length ? `<ul class="bg-list">${list}</ul>${eatLine}<p class="bg-sum">Összesen <b>${sum} arany</b> értékű (a Zöld Sárkány pultjánál vagy Bárdnál adhatod el).</p>` : '<p class="bg-empty">A zsák üres: egy zsebkendő sincs benne.</p>'}
        ${note}
        <p class="bg-keys">${hasFood ? '<span>fel / le: választás</span><span class="or">·</span><span>A / Enter / Szóköz: megeszem</span><span class="or">·</span>' : ''}${other}<span>B / Esc: vissza</span></p>
        <button class="bg-back" type="button">Vissza</button>
      </div>
    </div>`;
    this.el.querySelector('.bg-back').addEventListener('click', () => this.onBack?.());
    this.el.querySelector('.bg-eat')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.eat();
    });
    this.el.querySelectorAll('.bg-list li').forEach((li) => li.addEventListener('click', () => {
      this.sel = +li.dataset.k;
      this.render();
    }));
  }
}

export class CollectionView {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    el.className = 'scr scr-coll';
  }

  show(onBack) {
    this.onBack = onBack;
    this.render();
    this.el.classList.add('on');
  }

  hide() {
    this.el.classList.remove('on');
    this.el.innerHTML = '';
  }

  input(it) {
    if (it.backPressed || it.pausePressed || it.confirmPressed) this.onBack?.();
  }

  /** The rows: [{ id, name, layer, note, has }]. */
  rows() {
    const have = new Set(this.game.bagEnd?.trophies || []);
    return TROPHIES.filter((t) => !t.only || have.has(t.id) || t.only(this.game)).map((t) => {
      const f = FIND_TYPES.find((x) => x.id === t.id);
      return { id: t.id, name: t.name || f?.name || t.id, layer: t.layer ?? f?.layer ?? 0, place: t.place, note: t.note, color: f?.color ?? t.color, has: have.has(t.id) };
    });
  }

  render() {
    const g = this.game;
    const rows = this.rows();
    const n = rows.filter((r) => r.has).length;
    const li = rows.map((r) => {
      const where = r.place || LAYER_NAMES[r.layer] || '';
      return `<li class="${r.has ? 'has' : ''}" data-id="${r.id}">
      <i style="${r.has ? `background:${hex(r.color, '#c8a04a')}` : ''}"></i>
      <span><b>${r.has ? r.name : '……………'}</b><small>${r.has ? `${r.note} · ${where}` : `${where} · még nincs a vitrinben`}</small></span></li>`;
    }).join('');
    const bonus = g.bagEnd?.effects?.mathomSellBonus ?? 1;
    this.el.innerHTML = `<div class="cl-room">
      <div class="pbook cl-book">
        <div class="ppage left">
          <h2>Gyűjtemény</h2>
          <p class="pp-lead">Bilbó könyve, „Oda és vissza”: amit a mélyből hazahoztatok, a mathom-szoba vitrinjeibe kerül.</p>
          <p class="cl-n"><b>${n} / ${rows.length}</b> trófea a vitrinekben</p>
          <p class="cl-bonus">A vitrinek miatt a mathomok most <b>×${bonus.toLocaleString('hu-HU', { maximumFractionDigits: 2 })}</b> áron kelnek el.</p>
          <p class="pp-keys">B / Esc: vissza</p>
        </div>
        <div class="ppage right"><ol class="cl-list">${li}</ol><button class="cl-back" type="button">Vissza</button></div>
      </div>
    </div>`;
    this.el.querySelector('.cl-back').addEventListener('click', () => this.onBack?.());
  }
}
