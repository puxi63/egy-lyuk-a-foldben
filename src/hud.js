/* ==== hud.js — one HUD and one shop menu per player, positioned over that player's viewport (themed: TERV 0.12) ====
 * Every element is built once; update() only writes what changed since the last frame (no per-frame innerHTML). */
import * as THREE from 'three';
import { BAG_TIERS, COOP, HUNGER, SHOP, TOOL_TIERS } from './config.js';
import { LAYER_BOTTOM, LAYER_NAMES, LAYER_TOPS } from './materials.js';
import { CHARACTERS } from './player.js';
import { Finders, findersOf } from './finders.js'; // NOTES-38-finders
import { BAG_END } from './surface/bagend.js';
import { belayRopeSVG, coinsSVG, ladderSVG, MEALS, mealClockSVG, moonPhasePath, mugSVG, PLATE_C, plateSVG, sackSVG, todDialSVG, toolSVG, tornSackSVG, uid } from './ui/art.js';
import { CounterMenu } from './ui/counter.js';
import { deviceOf, glyphs } from './ui/glyphs.js';
import { toRunes } from './ui/runes.js';
import { SelectView } from './ui/select.js';
import { bakeTextures } from './ui/textures.js';
import { XpHud } from './xp/hud.js'; // NOTES-41-xp
import { WheelView } from './wheel/view.js'; // NOTES-43-wheel

const fmt = (n) => n.toLocaleString('hu-HU', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** The layer bands of the depth rope from materials.js: [{ from, to, name }], the last one ending at LAYER_BOTTOM. */
const BANDS = LAYER_TOPS.map((from, i) => ({
  from, to: LAYER_TOPS[i + 1] ?? LAYER_BOTTOM, name: LAYER_NAMES[i] || `${i + 1}. réteg`,
}));

/** Depth → position on the rope (0 top … 1 bottom): the rope covers 0 … LAYER_BOTTOM linearly. */
const ropePos = (depth) => Math.min(1, Math.max(0, depth / LAYER_BOTTOM));

/**
 * The quick actions drawn as a D-pad cross (TERV 0.4 / 0.12). One table: when the real D-pad quick actions
 * (Fény, Gyűrű, Kötél, Étel) exist in input.js, repoint these slots. `action` names a glyph of ui/glyphs.js.
 * The down slot is the belay rope key (NOTES-11-safety; drawn in NOTES-19-ui): V / , / D-pad down.
 */
const QUICK = [
  { dir: 'up', action: 'dig', label: 'Ásás', art: (p) => toolSVG(p.toolTier), artKey: (p) => p.toolTier },
  { dir: 'left', action: 'ladder', label: 'Létra', art: () => ladderSVG(), count: (p) => p.ladders },
  { dir: 'right', action: 'interact', label: 'Pult', art: () => mugSVG() },
  { dir: 'down', action: 'rope', label: 'Kötél', art: () => belayRopeSVG() },
];

bakeTextures();

/* ---------------- the co-op partner indicator (NOTES-36-partner) ---------------- */

/** Tuning of the partner indicator: fade distances (m), the head clearance of the pin (m), screen margins (em). */
const PARTNER = { fadeNear: 2.5, fadeFar: 5.5, overHead: 0.3, edgeX: 4.4, edgeY: 3.9, pinTop: 3.6, ring: 2.9 };
// Reused per frame: the partner's point, the inverse camera rotation (no allocation in the frame loop).
const PT_V = new THREE.Vector3();
const PT_Q = new THREE.Quaternion();
/** The short name on the marker: the last word of the character's name ("Zsákos Bilbó" → "Bilbó"). */
const shortName = (name) => (name || '').split(' ').pop();

/** The indicator's styles, injected once (the HUD stylesheet stays untouched). */
const PARTNER_CSS = `
.pt { position: absolute; left: 0; top: 0; z-index: 3; pointer-events: none; will-change: transform, opacity; --ptc: #e8c070; }
.pt.off { display: none; }
.pt-lbl { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 0.05em; white-space: nowrap;
  padding: 0.18em 0.6em 0.22em; border-radius: 0.25em; background: var(--tx-wood) center / cover, #4a2e18; color: #f6e8c4;
  border-top: 0.22em solid var(--ptc); box-shadow: 0 0.12em 0.4em #000b, inset 0 0 0 1px #0008; text-shadow: 0 1px 2px #000;
  font-family: var(--f-head); line-height: 1.05; }
.pt-nm { font-weight: normal; font-size: 0.9em; color: var(--ptc); }
.pt-row { display: flex; gap: 0.45em; font-size: 0.78em; }
.pt-z:empty { display: none; }
.pt-z { color: #ffe0a0; }
.pt-pin { position: absolute; left: -0.55em; top: -1.1em; width: 1.1em; height: 1.1em; }
.pt-pin svg, .pt-arr svg { width: 100%; height: 100%; display: block; overflow: visible; }
.pt-arr { position: absolute; left: 0; top: 0; width: 1.3em; height: 1.3em; margin: -0.65em 0 0 -0.65em; display: none; }
.pt-arr-in { width: 100%; height: 100%; }
.pt.pin .pt-lbl { transform: translate(-50%, calc(-100% - 1.3em)); }
.pt.edge .pt-lbl { transform: translate(-50%, -50%); }
.pt.edge .pt-pin { display: none; }
.pt.edge .pt-arr { display: block; }
.pt.edge.noarr .pt-arr { display: none; }
body:has(#screens .scr.on) .pt { visibility: hidden; }
`;
let partnerCss = false;

/* ---------------- the wall tap's echo ring (NOTES-38-finders) ---------------- */

/** The ring round the crosshair after a tap: an arrow towards the hollow, the rough distance, up / down. */
const TAP_CSS = `
.tp { position: absolute; left: 50%; top: 50%; width: 7.2em; height: 7.2em; margin: -3.6em 0 0 -3.6em; z-index: 3; pointer-events: none; }
.tp.off { display: none; }
.tp-ring { position: absolute; inset: 0; border-radius: 50%; border: 0.14em dashed #f3e2b0cc; box-shadow: 0 0 0.6em #0008, inset 0 0 0.6em #0006; }
.tp-rot { position: absolute; inset: 0; }
.tp-arr { position: absolute; left: 50%; top: -0.75em; width: 1.5em; height: 1.5em; margin-left: -0.75em; }
.tp-arr svg { width: 100%; height: 100%; display: block; overflow: visible; }
.tp-tx { position: absolute; left: 50%; top: calc(100% + 0.3em); transform: translateX(-50%); white-space: nowrap; font-family: var(--f-head);
  font-size: 0.85em; color: #f6e8c4; text-shadow: 0 1px 2px #000, 0 0 0.4em #000; }
body:has(#screens .scr.on) .tp { visibility: hidden; }
`;
let tapCss = false;

export class Hud {
  constructor(root, player, interactKey = 'X / E') {
    this.interactKey = interactKey;
    this.player = player;
    const id = uid();
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `<div class="hud-in">
      <div class="pframe"><i></i><i></i><i></i><i></i></div>
      <div class="hud-tl">
        <div class="nameplate"><span class="nm"></span></div>
        <div class="meal">
          <div class="plate">${plateSVG(id)}</div>
          <div class="clock">${mealClockSVG()}</div>
          <div class="tod">${todDialSVG(id)}</div>
          <div class="meal-l"><small>Következő</small><b></b><small class="tod-w"></small></div>
        </div>
      </div>
      <div class="rope">
        <div class="rope-line"></div>
        <div class="knot top" style="top:0"></div>
        ${BANDS.map((b) => `<div class="knot" style="top:${(ropePos(b.to) * 100).toFixed(2)}%"></div>
          <div class="rl" style="top:${(ropePos((b.from + b.to) / 2) * 100).toFixed(2)}%"><span class="ru">${toRunes(b.name)}</span><span class="hu">${b.name}</span></div>`).join('')}
        <div class="bob-track"><div class="bob"><span class="bob-d"></span></div></div>
      </div>
      <div class="hud-bl">
        <div class="bagbox"><div class="sack">${sackSVG(id)}</div><div class="nums"><b class="bag-n"></b><small class="bag-t"></small></div></div>
        <div class="coinbox"><div class="coins">${coinsSVG(id)}</div><div class="nums"><b class="gold-n"></b><small>közös arany</small></div></div>
      </div>
      <div class="dpad">${QUICK.map((q) => `<div class="qa ${q.dir}"><div class="qa-art"></div><div class="qa-txt"><span class="qa-l">${q.label}</span><span class="qa-k"></span></div>${q.count ? '<b class="qa-n"></b>' : ''}</div>`).join('')}<div class="dpad-hub"></div></div>
      <div class="cross"><i></i></div>
      <div class="pt off"><div class="pt-arr"><div class="pt-arr-in"><svg viewBox="-10 -10 20 20" aria-hidden="true"><path d="M9 0L-6 -7.5L-2.5 0L-6 7.5Z" fill="var(--ptc)" stroke="#1a1008" stroke-width="1.6" stroke-linejoin="round"/></svg></div></div>
        <div class="pt-pin"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 19L2.5 7.5A7.5 7.5 0 1 1 17.5 7.5Z" fill="var(--ptc)" stroke="#1a1008" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="7.2" r="2.6" fill="#1a1008"/></svg></div>
        <div class="pt-lbl"><b class="pt-nm"></b><span class="pt-row"><span class="pt-d"></span><span class="pt-z"></span></span></div></div>
      <div class="tp off"><div class="tp-ring"></div><div class="tp-rot"><div class="tp-arr"><svg viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -9L7.5 6L0 2.5L-7.5 6Z" fill="#e8c070" stroke="#1a1008" stroke-width="1.6" stroke-linejoin="round"/></svg></div></div><div class="tp-tx"></div></div>
      <div class="prompt"></div>
      <div class="msgs"></div>
      <div class="banner"></div>
      <div class="dead"><div class="dead-dark"></div><div class="dead-vig"></div><div class="dead-flash"></div><div class="dead-in"><div class="dead-sack">${tornSackSVG()}</div><div class="dead-why"></div><div class="dead-up">„Kelj fel!”<small>Gandalf hangja</small></div><div class="dead-lost"></div></div></div>
      <div class="shop hidden"></div>
      <div class="select hidden"></div>
    </div>`;
    root.appendChild(this.el);
    this.q = (s) => this.el.querySelector(s);
    this.shopOpen = false;
    this.sel = 0;
    this.pick = 0;
    this.r = {
      nm: this.q('.nameplate .nm'), pie: this.q('.pie'), plate: this.q('.plate'), hand: this.q('.clock .hand'), mealL: this.q('.meal-l b'),
      todDisc: this.q('.tod-disc'), todMoon: this.q('.tod-moon'), todW: this.q('.tod-w'), // daynight (NOTES-10-daynight)
      meal: this.q('.meal'), bob: this.q('.bob-track'), bobD: this.q('.bob-d'), rls: [...this.el.querySelectorAll('.rl')],
      knots: [...this.el.querySelectorAll('.knot:not(.top)')], sackBody: this.q('.sack-body'), sackFill: this.q('.sack-fill'),
      bagbox: this.q('.bagbox'), bagN: this.q('.bag-n'), bagT: this.q('.bag-t'), goldN: this.q('.gold-n'), coins: [...this.el.querySelectorAll('.coinbox .coin')],
      qa: QUICK.map((q) => this.q(`.qa.${q.dir}`)), prompt: this.q('.prompt'), msgs: this.q('.msgs'), banner: this.q('.banner'),
      dead: this.q('.dead'), deadWhy: this.q('.dead-why'), deadLost: this.q('.dead-lost'), shop: this.q('.shop'), select: this.q('.select'),
    };
    // shire (NOTES-26-shire): "Most" / "Következő" over the meal, and a small mood line (jóllakott / morcos) under it.
    this.r.mealS = this.q('.meal-l small');
    this.r.mood = document.createElement('small');
    Object.assign(this.r.mood.style, { textTransform: 'none', letterSpacing: '0.02em', fontStyle: 'italic', display: 'none', alignItems: 'center', gap: '0.25em', opacity: '0.95' });
    this.r.mealL.after(this.r.mood);
    this.counter = new CounterMenu(this.r.shop);
    this.selectView = new SelectView(this.r.select);
    this.msgEls = new Map();
    this.c = {}; // last written values, per key
    // NOTES-36-partner: the co-op partner indicator's elements, the view size (from place(), never read from the DOM)
    // and the last computed state (QA reads it).
    if (!partnerCss) {
      partnerCss = true;
      const st = document.createElement('style');
      st.id = 'partner-css';
      st.textContent = PARTNER_CSS;
      document.head.appendChild(st);
    }
    // NOTES-38-finders: the tap's echo ring, and the counter's Balin's-map layer pick (left / right on that row).
    if (!tapCss) {
      tapCss = true;
      const st = document.createElement('style');
      st.id = 'finders-css';
      st.textContent = TAP_CSS;
      document.head.appendChild(st);
    }
    this.r.tp = this.q('.tp');
    this.r.tpRot = this.q('.tp-rot');
    this.r.tpTx = this.q('.tp-tx');
    this.mapPick = -1;
    const pt = this.q('.pt');
    this.r.pt = pt;
    this.r.ptArr = pt.querySelector('.pt-arr-in');
    this.r.ptNm = pt.querySelector('.pt-nm');
    this.r.ptD = pt.querySelector('.pt-d');
    this.r.ptZ = pt.querySelector('.pt-z');
    this.vw = 0;
    this.vh = 0;
    this.fs = 16;
    this.pt = { mode: 'off', x: 0, y: 0, ang: 0, dist: 0, dz: 0, opacity: 0 };
    // NOTES-41-xp: the level plaque under the name plate and the level-up notice.
    this.xpHud = new XpHud(this.q('.hud-in'), this.r.nm.parentElement);
    this.lastBag = 0;
    this.deepest = -1; // deepest layer index reached (for the layer banner)
  }

  place(x, y, w, h) {
    Object.assign(this.el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    // NOTES-36-partner: the view size for the partner marker, and .hud-in's font size (ui.css: clamp(12px, 2.35cqmin, 20px)).
    this.vw = w;
    this.vh = h;
    this.fs = Math.min(20, Math.max(12, 0.0235 * Math.min(w, h)));
  }

  remove() {
    this.el.remove();
  }

  /** Opens the character select (Zsáklak's dining room: TERV 0.12), starting at the first free character. */
  openSelect(game) {
    this.player.choosing = true;
    const taken = (i) => game.players.some((q) => q !== this.player && !q.choosing && q.ch === CHARACTERS[i]);
    this.pick = Math.max(0, CHARACTERS.findIndex((_, i) => !taken(i)));
  }

  /** Character select input: left/right browse (characters taken by the other player are skipped), A / Enter picks. */
  selectInput(it, game) {
    const taken = (i) => game.players.some((q) => q !== this.player && !q.choosing && q.ch === CHARACTERS[i]);
    const step = (d) => {
      for (let n = 0; n < CHARACTERS.length; n++) {
        this.pick = (this.pick + d + CHARACTERS.length) % CHARACTERS.length;
        if (!taken(this.pick)) break;
      }
    };
    if (it.leftPressed || it.upPressed) step(-1);
    if (it.rightPressed || it.downPressed) step(1);
    if ((it.confirmPressed || it.digPressed) && !taken(this.pick)) {
      this.player.setCharacter(CHARACTERS[this.pick]);
      this.player.choosing = false;
      this.player.say(`${this.player.ch.name} vagy. Jó ásást!`, 3);
    }
  }

  /** The shop rows: label, price, action, plus `kind` / `tier` for the drawings (prices and selling follow the perks and co-op). */
  rows(game) {
    const p = this.player;
    const coop = game.players.length > 1;
    const econ = game.modes?.econ || { sell: 1, food: 1 }; // modes (NOTES-15-modes): Kihívás pays less, food costs more
    // shire (NOTES-26-shire): the reputation's better prices and buying, the new buyer's find kind.
    const sh = game.shire;
    const value = Math.round(p.bag.reduce((s, f) => s + f.value * (sh?.buyerMult(f) ?? 1), 0) * p.perk.sell * (coop ? COOP.sell : 1) * (game.bagEnd?.effects.mathomSellBonus ?? 1) * econ.sell * (sh?.sellMult() ?? 1));
    const cost = (n) => this.cost(game, n);
    const hungerMax = game.bagEnd?.effects.hungerMax ?? HUNGER.max;
    const nextTool = TOOL_TIERS[p.toolTier + 1];
    const nextBag = BAG_TIERS[p.bagTier + 1];
    return [
      { kind: 'sell', label: `Eladod a zsák tartalmát (${p.bag.length} lelet)${sh?.buyerNote() || ''}`, price: -value, ok: p.bag.length > 0, act: () => {
        if (game.hoard?.refuseSell?.(p)) return; // the dragon-sickness keeps the gold (hoard/, NOTES-7a-hoard)
        game.money += value;
        game.sold += value;
        p.bag = [];
        p.say(`Eladtad: ${value} arany.`);
        game.saveNow();
      } },
      { kind: 'food', label: 'Elemózsia (tele tányér)', price: cost(SHOP.foodPrice * econ.food), ok: p.hunger < hungerMax, act: () => {
        p.hunger = hungerMax;
        p.say('Jóllaktál.');
      } },
      { kind: 'ladder', label: `${SHOP.ladderPack} létra`, price: cost(SHOP.ladderPrice), ok: true, act: () => {
        p.ladders += SHOP.ladderPack;
      } },
      nextTool && { kind: 'tool', tier: p.toolTier + 1, label: `Ásó: ${nextTool.name}`, price: cost(nextTool.price), ok: true, act: () => {
        p.toolTier++;
        p.refreshTool();
        p.say(`Új szerszám: ${nextTool.name}`);
      } },
      nextBag && { kind: 'bag', tier: p.bagTier + 1, label: `Zsák: ${nextBag.name} (${Math.round(nextBag.cap * p.perk.bag)} hely)`, price: cost(nextBag.price), ok: true, act: () => {
        p.bagTier++;
        p.say(`Új zsák: ${nextBag.name}`);
      } },
      ...(game.exits?.shopRows(p, cost) || []),
      ...(game.enemies?.shopRows(p, cost) || []),
      ...(game.safety?.shopRows(p, cost) || []), // safety (NOTES-11-safety): Balin's estimate
      ...findersOf(game).shopRows(p, cost, this), // NOTES-38-finders: Balin's layer map, the lamp shimmer
      ...(game.modes?.shopRows(p, cost) || []), // modes (NOTES-15-modes): the hired dwarf (single play)
    ].filter(Boolean);
  }

  /** A counter price for this player: his perk, co-op and the Shire's reputation (NOTES-43-wheel shows it too). */
  cost(game, n) {
    const p = this.player;
    const coop = game.players.length > 1;
    return Math.round(n * p.perk.price * (coop ? COOP.price : 1) * (game.shire?.priceMult() ?? 1));
  }

  /** NOTES-43-wheel: this player's action wheel, built the first time it opens (src/wheel/view.js). */
  wheelView() {
    return (this.wheel ||= new WheelView(this.q('.hud-in')));
  }

  /** Handles the shop menu input; returns true while the menu is open. */
  shopInput(it, game, nearShop) {
    if (!this.shopOpen) {
      if (nearShop && it.interactPressed) {
        this.shopOpen = true;
        this.sel = 0;
      }
      return this.shopOpen;
    }
    const rows = this.rows(game);
    if (it.backPressed || it.interactPressed || !nearShop) {
      this.shopOpen = false;
      return false;
    }
    if (it.upPressed) this.sel = (this.sel + rows.length - 1) % rows.length;
    if (it.downPressed) this.sel = (this.sel + 1) % rows.length;
    // NOTES-38-finders: a row with a choice (Balin's map: which layer) takes left / right.
    if ((it.leftPressed || it.rightPressed) && rows[this.sel]?.alt) rows[this.sel].alt(it.rightPressed ? 1 : -1);
    if (it.confirmPressed || it.digPressed) {
      const r = rows[this.sel];
      if (!r.ok) this.player.say('Most nincs rá szükség.');
      else if (r.price > 0 && game.money < r.price) this.player.say('Nincs elég aranyad.');
      else {
        if (r.price > 0) game.money -= r.price;
        r.act();
      }
    }
    return true;
  }

  /** Writes `v` through `fn` only when it differs from the last value written under `key`. */
  set(key, v, fn) {
    if (this.c[key] === v) return;
    this.c[key] = v;
    fn(v);
  }

  update(game, nearShop) {
    const p = this.player;
    const r = this.r;
    const slot = game.players.indexOf(p);
    const shared = game.bindings.some((b) => b.kbm === 'keys2');
    const device = deviceOf(game.bindings[slot]);
    this.set('dev', `${device}|${shared}`, () => {
      this.g = glyphs(device, shared);
      QUICK.forEach((q, i) => {
        r.qa[i].querySelector('.qa-k').innerHTML = this.g[q.action] + (q.extra ? `<span class="or">·</span>${this.g[q.extra]}` : '');
      });
      this.c.prompt = null;
    });
    const g = this.g;
    this.set('pc', p.ch.color, (v) => this.el.style.setProperty('--pc', v));
    this.set('nm', p.ch.name, (v) => (r.nm.textContent = v));

    // Character select.
    this.set('choosing', !!p.choosing, (v) => {
      r.select.classList.toggle('hidden', !v);
      this.el.classList.toggle('choosing', v);
      if (!v) this.selectView.reset();
    });
    if (p.choosing) {
      const taken = (i) => game.players.some((q) => q !== p && !q.choosing && q.ch === CHARACTERS[i]);
      this.selectView.render(CHARACTERS, this.pick, taken, slot, `${g.browse}<span>választás</span><i>·</i>${g.confirm}<span>ezt választom</span>`);
    }

    // Hunger: the plate and the meal clock.
    const hunger = Math.max(0, Math.min(1, p.hunger / (game.bagEnd?.effects.hungerMax ?? HUNGER.max)));
    this.set('hunger', Math.round(hunger * 200), () => {
      r.pie.setAttribute('stroke-dasharray', `${(hunger * PLATE_C).toFixed(2)} 200`);
    });
    // shire (NOTES-26-shire): the seven meals by the day clock ({ idx, now, turn, mood }); without it the hunger clock.
    const mc = p.mealClock;
    this.set('hand', Math.round((mc ? mc.turn : 1 - hunger) * 720), (v) => (r.hand.style.transform = `rotate(${(v / 2).toFixed(1)}deg)`));
    this.set('mealNow', !!mc?.now, (v) => (r.mealS.textContent = v ? 'Most' : 'Következő'));
    this.set('mood', mc?.mood || '', (v) => {
      r.mood.style.display = v ? 'flex' : 'none';
      r.mood.style.color = v === 'morcos' ? '#8a1e12' : '#3a5a14';
      // A small brass face: content (a smile) or grumpy (a frown and knitted brows).
      const face = v === 'morcos'
        ? '<path d="M7 15.5q5-4 10 0" /><path d="M6.5 8.5l3 1.2M17.5 8.5l-3 1.2" />'
        : '<path d="M7 13.5q5 4.5 10 0" />';
      r.mood.innerHTML = v ? `<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10" stroke-width="1.6"/><circle cx="8.6" cy="10.5" r="0.9" fill="currentColor" stroke="none"/><circle cx="15.4" cy="10.5" r="0.9" fill="currentColor" stroke="none"/>${face}</svg><span>${v}</span>` : '';
    });
    const mealIdx = mc ? mc.idx : Math.min(MEALS.length - 1, Math.floor((1 - hunger) * MEALS.length));
    const low = hunger < 0.25;
    this.set('meal', low ? -1 : mealIdx, (v) => (r.mealL.textContent = v < 0 ? 'Éhes vagy!' : MEALS[v]));
    this.set('low', low, (v) => r.meal.classList.toggle('low', v));
    // daynight (NOTES-10-daynight): the sun / moon dial beside the plate and the word for the time of day.
    const dc = game.dayClock;
    if (dc) {
      this.set('todA', Math.round(dc.dialAngle()), (v) => (r.todDisc.style.transform = `rotate(${v}deg)`));
      this.set('todM', dc.moonIndex(), (v) => r.todMoon.setAttribute('d', moonPhasePath(v)));
      this.set('todW', dc.phaseName(), (v) => (r.todW.textContent = v));
    }

    // Depth rope.
    const depth = p.depth;
    const pos = ropePos(depth);
    this.set('rope', Math.round(pos * 1000), () => (r.bob.style.transform = `translateY(${(pos * 100).toFixed(1)}%)`));
    this.set('depthT', depth > 0.5 ? Math.round(depth * 10) : -1, (v) => (r.bobD.textContent = v < 0 ? 'Felszín' : `${fmt(v / 10)} m`));
    const layer = depth > 0.5 ? BANDS.findIndex((b, i) => depth < b.to || i === BANDS.length - 1) : -1;
    if (this.c.layer !== layer) {
      const prev = this.c.layer;
      this.c.layer = layer;
      r.rls.forEach((e, i) => e.classList.toggle('cur', i === layer || (layer < 0 && i === 0)));
      // The banner greets each layer the first time it is reached in this session (not every dip into the pit).
      if (prev !== undefined && layer > this.deepest && !p.choosing && p.dead <= 0) this.layerBanner(layer);
      this.deepest = Math.max(this.deepest, layer);
    }

    // Bag and money.
    const cap = p.bagCap;
    const fill = Math.min(1, p.bag.length / Math.max(1, cap));
    this.set('bag', `${p.bag.length}/${cap}`, (v) => {
      r.bagN.textContent = v.replace('/', ' / ');
      r.sackFill.setAttribute('transform', `translate(0 ${(80 * (1 - fill)).toFixed(1)})`);
      const s = (0.8 + 0.22 * fill).toFixed(3);
      r.sackBody.setAttribute('transform', `translate(50 104) scale(${s} ${(0.94 + 0.06 * fill).toFixed(3)}) translate(-50 -104)`);
      r.bagbox.classList.toggle('full', p.bag.length >= cap);
    });
    this.set('bagT', p.bag.length >= cap ? 'Tele a zsák!' : BAG_TIERS[p.bagTier].name, (v) => (r.bagT.textContent = v));
    this.set('money', game.money, (m) => {
      r.goldN.textContent = m;
      const n = m <= 0 ? 0 : Math.min(r.coins.length, 1 + Math.floor(Math.log2(1 + m / 8)));
      r.coins.forEach((c, i) => c.setAttribute('display', i < n ? 'inline' : 'none'));
    });

    // Quick actions: drawn items, the ladder count.
    QUICK.forEach((q, i) => {
      const key = q.artKey ? q.artKey(p) : 0;
      this.set(`qa${i}`, key, () => (r.qa[i].querySelector('.qa-art').innerHTML = q.art(p)));
      if (q.count) this.set(`qn${i}`, q.count(p), (v) => (r.qa[i].querySelector('.qa-n').textContent = `×${v}`));
    });
    this.set('nearShop', !!nearShop, (v) => r.qa[2].classList.toggle('lit', v));
    // ui (NOTES-19-ui): the rope slot glows while this player belays or hangs on a rope.
    this.set('roped', !!(p.belay || game.safety?.belayerOf(p)), (v) => r.qa[3].classList.toggle('lit', v));

    // Prompt at the counter; NOTES-35-lift-doors-bag: else at a co-op door's lever or rune stone (underground/coop.js).
    const door = nearShop || p.choosing ? null : game.decor?.coop?.promptFor?.(p, game.players);
    const prompt = nearShop && !this.shopOpen && !p.choosing ? 1 : door ? `${door.key ? 1 : 0}|${door.text}` : 0;
    this.set('prompt', prompt, (v) => {
      if (v === 1) r.prompt.innerHTML = `<span class="pr-in"><span>A Zöld Sárkány pultja</span>${g.interact}</span>`;
      else if (v) r.prompt.innerHTML = `<span class="pr-in"><span>${door.text}</span>${door.key ? g.interact : ''}</span>`;
      else r.prompt.innerHTML = '';
    });

    this.updateMessages(p);
    this.updateDeath(p, game);
    this.updatePartner(game, slot);
    this.updateTap(game, slot);
    this.xpHud.update(p, !!game.screens?.menuWas?.[slot]); // NOTES-41-xp

    // Shop.
    this.set('shopOpen', this.shopOpen, (v) => {
      r.shop.classList.toggle('hidden', !v);
      if (!v) this.counter.reset();
    });
    if (this.shopOpen) {
      const rows = this.rows(game);
      this.sel = Math.min(this.sel, rows.length - 1);
      this.counter.render(rows, this.sel, game.money, `${g.nav}<span>választás</span><i>·</i>${g.confirm}<span>vásárlás</span><i>·</i>${g.back}<span>bezárás</span>`);
    }
    this.lastBag = p.bag.length;
  }

  /**
   * The co-op partner indicator (NOTES-36-partner): a pin over the partner's head with the short name, the distance
   * and the height difference ("↓ 12 m": the partner is 12 m lower), drawn over the 3D view, so the soil never hides
   * it. Off-screen or behind, an arrow on a ring round the label at the view's edge points the way. It fades out when
   * the partner is close and in view. Off in single play, in Versengés, while this player is held by a menu or a
   * scene (shop, contract, lift, minigames, the finale's scenes …; game.screens.menuWas, written just before this
   * update), while either player chooses a character, and while this player lies fainted. The full-window screens
   * (pause, map, settings …) freeze the game (no update): there a CSS rule hides it (any `#screens .scr.on`). Off
   * under the title too (only where the screens run: bench pages have no title and do measure it).
   * Per frame: one projection with reused objects (camera space by the inverse camera rotation, then the projection
   * matrix's two scale terms); the DOM is written only when the rounded values change, positions by transform.
   */
  updatePartner(game, slot) {
    const p = this.player;
    const r = this.r;
    const st = this.pt;
    const q = game.players.length > 1 ? game.players[slot === 0 ? 1 : 0] : null;
    const show = !!q && !game.modes?.versus && !p.choosing && !q.choosing && p.dead <= 0 && !game.screens?.menuWas?.[slot]
      && !game.screens?.busy && !(game.screens?.titleUp && game.screens.enabled) && game.finale?.stage !== 'scene' && this.vw > 0;
    if (!show) {
      st.mode = 'off';
      this.set('ptMode', 'off', () => (r.pt.className = 'pt off'));
      return;
    }
    // Bag End's interior lies far off in the world (bagend/ INTERIOR_ORIGIN): a player inside counts as at the door.
    const be = game.bagEnd;
    const pIn = !!be?.isInside?.(p);
    const qIn = !!be?.isInside?.(q);
    const cam = p.camera;
    const px = pIn ? BAG_END.x : p.pos.x;
    const pz = pIn ? BAG_END.z : p.pos.z;
    const py = pIn ? 0 : p.pos.y;
    const qx = qIn ? BAG_END.x : q.pos.x;
    const qz = qIn ? BAG_END.z : q.pos.z;
    const qy = qIn ? 0 : q.pos.y;
    const dist = pIn === qIn ? p.pos.distanceTo(q.pos) : Math.hypot(qx - px, qy - py, qz - pz);
    const dz = py - qy; // > 0: the partner is lower
    st.dist = dist;
    st.dz = dz;
    const away = qIn && !pIn;
    if (this.c.ptCh !== q.ch || this.c.ptAway !== away) {
      this.c.ptCh = q.ch;
      this.c.ptAway = away;
      r.ptNm.textContent = away ? `${shortName(q.ch?.name)} · Zsáklakban` : shortName(q.ch?.name);
    }
    this.set('ptC', q.ch?.color || '#e8c070', (v) => r.pt.style.setProperty('--ptc', v));
    this.set('ptD', Math.round(dist), (v) => (r.ptD.textContent = `${v} m`));
    const zr = Math.round(dz);
    this.set('ptZ', zr, (v) => (r.ptZ.textContent = v > 0 ? `↓ ${v} m` : v < 0 ? `↑ ${-v} m` : ''));

    const w = this.vw;
    const h = this.vh;
    const fs = this.fs;
    let mode = 'edge';
    let x;
    let y;
    let ang = 0;
    let opacity = 1;
    const noArr = pIn && !qIn;
    if (noArr) {
      // Inside Bag End the partner's world position has no place in this view: the label waits at the top edge.
      x = w / 2;
      y = PARTNER.edgeY * fs * 0.6;
    } else {
      if (away) PT_V.set(BAG_END.x, 1.2, BAG_END.z);
      else PT_V.set(q.pos.x, q.pos.y + (q.ch?.height || 1.3) + PARTNER.overHead, q.pos.z);
      // Camera space: x right, y up, -z forward.
      PT_V.sub(cam.position).applyQuaternion(PT_Q.copy(cam.quaternion).invert());
      const e = cam.projectionMatrix.elements;
      const ahead = -PT_V.z;
      let sx = 0;
      let sy = 0;
      let onScreen = false;
      if (ahead > cam.near) {
        sx = (0.5 + 0.5 * e[0] * (PT_V.x / ahead)) * w;
        sy = (0.5 - 0.5 * e[5] * (PT_V.y / ahead)) * h;
        onScreen = sx >= w * 0.04 && sx <= w * 0.96 && sy >= h * 0.06 && sy <= h * 0.97;
      }
      if (onScreen) {
        mode = 'pin';
        x = sx;
        y = Math.max(sy, PARTNER.pinTop * fs); // the label stays inside the view
        opacity = Math.min(1, Math.max(0, (dist - PARTNER.fadeNear) / (PARTNER.fadeFar - PARTNER.fadeNear)));
      } else {
        let dx;
        let dy;
        if (ahead > cam.near) {
          dx = sx - w / 2;
          dy = sy - h / 2;
        } else {
          // Behind: towards the side to turn to (at least as sideways as it is behind), up or down by the height.
          const side = PT_V.x === 0 ? 1 : PT_V.x;
          dx = Math.sign(side) * Math.max(Math.abs(side), PT_V.z, 0.01);
          dy = -PT_V.y;
        }
        const hx = Math.max(1, w / 2 - PARTNER.edgeX * fs);
        const hy = Math.max(1, h / 2 - PARTNER.edgeY * fs);
        const t = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
        x = w / 2 + dx * t;
        y = h / 2 + dy * t;
        ang = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      }
    }
    st.mode = mode;
    st.x = Math.round(x);
    st.y = Math.round(y);
    st.ang = ang;
    st.opacity = Math.round(opacity * 20) / 20;
    this.set('ptMode', noArr ? 'edge noarr' : mode, (v) => (r.pt.className = `pt ${v}`));
    this.set('ptXY', st.x * 16384 + st.y, () => (r.pt.style.transform = `translate3d(${st.x}px, ${st.y}px, 0)`));
    this.set('ptO', st.opacity, (v) => (r.pt.style.opacity = v));
    if (mode === 'edge' && !noArr) this.set('ptA', ang, (v) => (r.ptArr.style.transform = `rotate(${v}deg) translateX(${PARTNER.ring}em)`));
  }

  /** Messages: one parchment strip per message object; nodes are kept, only the fading opacity is written. */
  /**
   * NOTES-38-finders: the wall tap's echo ring round the crosshair while the player's cue lasts (finders.js tap): the
   * arrow turns with the player's facing (whole degrees), the text is the rough distance and up / down; fades out in
   * the last 1.5 s. Hidden while a menu or scene holds the player. Writes only on a change.
   */
  updateTap(game, slot) {
    const p = this.player;
    const cue = p.tapCue;
    const show = !!cue && !p.choosing && p.dead <= 0 && !game.screens?.menuWas?.[slot];
    this.set('tpOn', show, (v) => this.r.tp.classList.toggle('off', !v));
    if (!show) return;
    const deg = Math.round((Finders.relAngle(p, cue.x, cue.z) * 180) / Math.PI);
    this.set('tpDeg', deg, (v) => (this.r.tpRot.style.transform = `rotate(${v}deg)`));
    const vert = cue.dy < -2 ? ' ↓' : cue.dy > 2 ? ' ↑' : '';
    this.set('tpTx', `${cue.dist}${vert}`, () => (this.r.tpTx.textContent = `kb. ${cue.dist} m${vert}`));
    this.set('tpOp', Math.round(Math.min(1, cue.t / 1.5) * 20), (v) => (this.r.tp.style.opacity = (v / 20).toFixed(2)));
  }

  updateMessages(p) {
    const seen = new Set();
    for (const m of p.messages) {
      seen.add(m);
      let e = this.msgEls.get(m);
      if (!e) {
        e = document.createElement('div');
        e.className = 'msg';
        e.textContent = m.text;
        this.r.msgs.appendChild(e);
        this.msgEls.set(m, { el: e, o: 1 });
        continue;
      }
      const o = Math.round(Math.min(1, m.t) * 20) / 20;
      if (o !== e.o) {
        e.o = o;
        e.el.style.opacity = o;
      }
    }
    for (const [m, e] of this.msgEls) {
      if (seen.has(m)) continue;
      e.el.remove();
      this.msgEls.delete(m);
    }
  }

  /**
   * Death overlay (Normal mode, TERV 0.12; redone in NOTES-21-screens): the view darkens and closes in, the sack tears
   * open and the finds spill out, then Gandalf's voice: "Kelj fel!" (text only: audio.js has no voice synthesis).
   * The whole sequence fits the 2.5 s of `p.dead`. Kihívás shows its own yellowing page instead (modes/), so this one
   * stays off there.
   */
  updateDeath(p, game) {
    const dead = p.dead > 0 && !game?.modes?.challenge;
    this.set('dead', dead, (v) => {
      if (v) {
        const last = p.messages[p.messages.length - 1]?.text || '';
        this.r.deadWhy.textContent = last.split(' Elveszett')[0] || 'Elájultál…';
        const n = this.lastBag;
        this.r.deadLost.textContent = n > 0 ? `${n} lelet a földön maradt. Egyszer még visszaszerezheted.` : 'A zsákod üres volt, nem veszett el semmi.';
      }
      this.r.dead.classList.toggle('on', v);
      this.el.classList.toggle('is-dead', v);
    });
  }

  /** Layer change: the knot glows, the layer name appears in runes, then in Hungarian (TERV 0.12 Rétegváltás). */
  layerBanner(layer) {
    const name = BANDS[layer].name;
    this.r.banner.innerHTML = `<div class="bn"><span class="ru">${toRunes(name)}</span><span class="hu">${name}</span></div>`;
    const k = this.r.knots[Math.max(0, layer - 1)];
    if (layer > 0 && k) {
      // No synchronous layout (it was `void k.offsetWidth` between remove and add; NOTES-29-final): the class goes when
      // its animation ends, so the next glow starts by adding it; one still running is restarted.
      if (k.classList.contains('glow')) {
        for (const a of k.getAnimations()) {
          a.cancel();
          a.play();
        }
      } else {
        k.addEventListener('animationend', () => k.classList.remove('glow'), { once: true });
        k.classList.add('glow');
      }
    }
  }
}
