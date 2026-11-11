/* ==== smith/index.js — the travelling dwarf smith: endless, level-based upgrades (TODO item 30, NOTES-40-smith).
   - The forge stands on the meadow east of the Green Dragon's counter (props.js FORGE). The use key within SMITH.reach of
     the anvil opens this module's own parchment menu (own DOM and CSS `#smith-style`, inside each player's HUD).
   - Five upgrades, each with endless levels (UPGRADES): sharpening (dig power), a new handle (swing time), the lamp
     (light reach and brightness), bag patching (capacity), training (climb speed and less hunger). The gain of a level
     tapers: effect = cap × L / (L + H), so it nears the cap and never passes it, while the price grows by SMITH.growth
     per level (base × growth^L, rounded to 10 gold, × the buyer's character price perk, × COOP.price with two players —
     the same rule as Bag End's furnishing and the party; the Green Dragon's reputation discount does not apply).
   - Per player, as the counter's tools and bags: each player's levels belong to his save slot and character (a new
     character in that slot starts at level 0, as his tools do); the money is the shared purse (game.money).
   - How the effects reach the game without touching player.js: the character perk multipliers player.js already reads
     at use time (`p.perk.power` bite, `p.perk.bag` capacity, `p.perk.climb` climb speed, `p.perk.hunger` hunger costs)
     get a layer on top (applyPerks: `p.perk` is replaced by a copy × the smith's factors; the character's own object is
     kept as `p.smithBase` and comes back with no levels); the swing time through `shire.digMult` (player.js tryDig);
     the lamp through `p.smithLamp`, read by coop-actions/lamp.js where it sets `lampBoost` / `lampReach`.
   Owned by the Shire (shire/index.js: constructed, input / update / state / restore; its levels ride in the Shire's save
   as the optional `k`), so game.js and save.js need no change. Off on bench pages (`force` for QA); `?smith=1` on a bench
   page only shows the forge (the GPU bench). ==== */
import * as THREE from 'three';
import { COOP } from '../config.js';
import { SURFACE_COLLIDERS } from '../props.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { ANVIL, buildForge } from './props.js';

/** The rules. */
export const SMITH = {
  reach: 2.6, // m from the anvil for the use key
  growth: 1.3, // price × this per level
  slots: 2, // save slots (MAX_PLAYERS)
};

/**
 * The upgrades. `base`: the first level's price (gold); `H`: the level where half the cap is reached; `fx`: the effects,
 * each { key, cap } with a factor 1 + cap × g (cap < 0 lowers: the swing time, the hunger costs).
 */
export const UPGRADES = [
  {
    id: 'elezes', name: 'Élezés', base: 200, H: 6, fx: [{ key: 'power', cap: 0.4 }],
    desc: 'A kovács megélezi és megedzi a szerszámod élét: minden ütés többet hasít ki a földből és a kőből.',
    show: (f) => `ásóerő +${pct(f.power - 1)} %`,
  },
  {
    id: 'nyel', name: 'Új nyél', base: 220, H: 6, fx: [{ key: 'swing', cap: -0.2 }],
    desc: 'Szívós, jól kiegyensúlyozott nyelet farag és vasal a szerszámodra: gyorsabban lendíted.',
    show: (f) => `ütésidő −${pct(1 - f.swing)} %`,
  },
  {
    id: 'lampa', name: 'Lámpa', base: 150, H: 5, fx: [{ key: 'lampReach', cap: 0.5 }, { key: 'lampBoost', cap: 0.6 }],
    desc: 'Vastagabb üveg, jobb kanóc, fényes rézlemez a láng mögé: a lámpád messzebbre és erősebben világít.',
    show: (f) => `fény: hatótáv +${pct(f.lampReach - 1)} %, erősség +${pct(f.lampBoost - 1)} %`,
  },
  {
    id: 'zsak', name: 'Zsákfoltozás', base: 180, H: 6, fx: [{ key: 'bag', cap: 0.3 }],
    desc: 'Bőrrel foltozza és toldja meg a zsákodat, erős törpe varrással: több lelet fér bele.',
    show: (f, p) => `zsák +${pct(f.bag - 1)} %${p ? ` (${p.bagCap} hely)` : ''}`,
  },
  {
    id: 'edzes', name: 'Edzés', base: 160, H: 6, fx: [{ key: 'climb', cap: 0.3 }, { key: 'hunger', cap: -0.25 }],
    desc: 'A törpe megtanítja a bányászok fogásait: hogyan mássz és dolgozz kifulladás nélkül. Gyorsabban mászol, lassabban éhezel.',
    show: (f) => `mászás +${pct(f.climb - 1)} %, éhség −${pct(1 - f.hunger)} %`,
  },
];

const FACTOR_KEYS = ['power', 'swing', 'lampReach', 'lampBoost', 'bag', 'climb', 'hunger'];
const ZERO = Object.freeze(UPGRADES.map(() => 0));

function pct(x) {
  return Math.round(x * 1000) / 10;
}

/** 0 … 1: how much of an upgrade's cap level L gives (L / (L + H)). */
export function gain(L, H) {
  return L > 0 ? L / (L + H) : 0;
}

/** The factors of a set of levels: { power, swing, lampReach, lampBoost, bag, climb, hunger } (1 = no change). */
export function factorsOf(levels) {
  const f = Object.fromEntries(FACTOR_KEYS.map((k) => [k, 1]));
  UPGRADES.forEach((u, i) => {
    const g = gain(levels[i] || 0, u.H);
    for (const e of u.fx) f[e.key] *= 1 + e.cap * g;
  });
  return f;
}

/** One upgrade's factors at level L (for the menu's "now / next" lines). */
function upgradeFactors(i, L) {
  const lv = UPGRADES.map(() => 0);
  lv[i] = L;
  return factorsOf(lv);
}

/** Base price of level L + 1 of upgrade i (before the buyer's perk and the co-op factor). */
export function basePrice(i, L) {
  return Math.round((UPGRADES[i].base * SMITH.growth ** L) / 10) * 10;
}

/** Small ink drawings for the menu rows. */
const ICONS = [
  '<path d="M6 26 L22 10 M20 6 L26 12 L22 16 L16 10 Z M9 20 L12 23" />', // a whetted blade
  '<path d="M8 27 L22 7 M18 5 L26 11 M20 9 L24 12 M9 24 L12 26" />', // a handle with a head
  '<path d="M16 3 V7 M11 7 H21 L19 10 H13 Z M12 10 H20 V22 H12 Z M11 22 H21 L19 25 H13 Z M16 13 C14 16 14 18 16 19 C18 18 18 16 16 13" />', // a lamp
  '<path d="M10 9 C10 5 22 5 22 9 L25 26 C25 29 7 29 7 26 Z M12 15 H18 V21 H12 Z M12 15 L14 17 M18 15 L16 17" />', // a patched bag
  '<path d="M10 4 V28 M22 4 V28 M10 9 H22 M10 15 H22 M10 21 H22 M10 27 H22" />', // a ladder
];

const CSS = `
.smith-prompt{position:absolute;left:50%;top:62%;transform:translateX(-50%);font-size:16px;color:var(--gold,#e8c070);text-shadow:0 1px 3px #000;pointer-events:none;z-index:6;white-space:nowrap}
.smith-menu{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94%,32em);max-height:92%;overflow:hidden;padding:.85em 1.25em .75em;background:var(--tx-parch,#ead8b0) center/cover,#ead8b0;color:var(--ink-dark,#3a2410);border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.65),inset 0 0 28px rgba(90,58,18,.4);font-family:var(--f-text,Georgia,serif);font-size:15px;line-height:1.32;z-index:7;display:none}
.smith-menu h3{margin:0;text-align:center;font-family:var(--f-title,Georgia,serif);font-weight:normal;font-size:1.32em;color:#5a2a0a}
.smith-menu .smith-sub{text-align:center;font-style:italic;font-size:.8em;opacity:.85;margin:.1em 0 .5em}
.smith-menu .smith-purse{text-align:center;font-size:.85em;margin-bottom:.35em;color:#7a4a10}
.smith-row{display:flex;align-items:center;gap:.5em;padding:.14em .4em;border-radius:4px}
.smith-row.sel{background:rgba(90,58,18,.2);font-weight:bold}
.smith-row.poor .smith-price{opacity:.55}
.smith-row svg{width:1.6em;height:1.6em;flex:none;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
.smith-row .smith-lv{font-size:.82em;font-weight:normal;opacity:.8;white-space:nowrap}
.smith-row .smith-price{margin-left:auto;white-space:nowrap;color:#7a4a10;font-weight:normal}
.smith-desc{margin-top:.45em;padding-top:.4em;border-top:1px solid rgba(90,58,18,.35);font-size:.85em;min-height:4.6em}
.smith-desc b{color:#5a2a0a;font-weight:normal;font-style:italic}
.smith-keys{margin-top:.45em;font-size:.78em;display:flex;gap:.35em;align-items:center;justify-content:center;flex-wrap:wrap}
`;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GOLD = 'color:#7a4a10';

export class Smith {
  constructor(shire) {
    this.shire = shire;
    this.game = shire.game;
    /** Per save slot: { c: character id, l: [level per upgrade] } or null. */
    this.slots = Array.from({ length: SMITH.slots }, () => null);
    this.menu = new Map(); // player → { sel }
    this.ui = new Map();
    this.slowT = 0;
    const q = this.game.params?.get?.('smith');
    /** Bench pages: `?smith=1` shows the forge (visual only, for the GPU bench). */
    this.benchShow = !!this.game.bench && q != null && q !== '' && q !== '0';
    this.root = this.game.surface?.root || null;
    this.colliders = [];
    if (this.root) {
      const b = buildForge();
      this.mat = shire.mat; // the Shire's vertex-coloured Lambert (the neighbour's, the beds'): no new shader program
      const glow = Object.values(this.game.surface.meshes || {}).find((m) => m.name === 'surface-glow')?.material;
      this.glowMat = glow || new THREE.MeshBasicMaterial({ vertexColors: true });
      this.mesh = new THREE.Mesh(b.main, this.mat);
      this.mesh.name = 'smith-forge';
      this.glowMesh = new THREE.Mesh(b.glow, this.glowMat);
      this.glowMesh.name = 'smith-fire';
      for (const m of [this.mesh, this.glowMesh]) {
        m.matrixAutoUpdate = false;
        m.visible = false;
        this.root.add(m);
      }
      this.colliders = b.colliders;
      this.collidersIn = false;
    }
    this.syncShown();
  }

  get enabled() {
    return this.shire.enabled;
  }

  /** Shows / hides the forge (and its colliders) with the Shire (or `?smith=1` on a bench page). */
  syncShown() {
    if (!this.mesh) return;
    const show = this.enabled || this.benchShow;
    if (this.mesh.visible !== show) {
      this.mesh.visible = show;
      this.glowMesh.visible = show;
    }
    if (show !== this.collidersIn) {
      this.collidersIn = show;
      if (show) SURFACE_COLLIDERS.push(...this.colliders);
      else {
        for (const c of this.colliders) {
          const i = SURFACE_COLLIDERS.indexOf(c);
          if (i >= 0) SURFACE_COLLIDERS.splice(i, 1);
        }
      }
    }
  }

  /* ---------------- levels and prices ---------------- */

  /** Player p's levels (his slot's, when the slot's character is his; else all 0). */
  levels(p) {
    const s = this.slots[p?.slot];
    return s && s.c === p.ch?.id ? s.l : ZERO;
  }

  /** What the next level of upgrade i costs player p. */
  price(i, p) {
    const L = this.levels(p)[i] || 0;
    const coop = this.game.players.length > 1;
    return Math.round(basePrice(i, L) * (p?.perk?.price || 1) * (coop ? COOP.price : 1));
  }

  /** Buys the next level of upgrade i for player p from the shared purse. Returns true when bought. */
  buy(p, i) {
    const u = UPGRADES[i];
    if (!u) return false;
    const g = this.game;
    const cost = this.price(i, p);
    if (g.money < cost) {
      p.say(`Ehhez ${cost} arany kell, a közös erszényben ${g.money} van.`, 3.5);
      return false;
    }
    g.money -= cost;
    let s = this.slots[p.slot];
    if (!s || s.c !== p.ch?.id) {
      s = { c: p.ch?.id, l: UPGRADES.map(() => 0) };
      this.slots[p.slot] = s;
    }
    s.l[i] += 1;
    this.apply(p);
    p.say(`${u.name}: ${s.l[i]}. szint. Most: ${u.show(factorsOf(s.l), p)}.`, 4);
    this.hammer();
    g.saveNow?.();
    return true;
  }

  /** A few hammer blows on the anvil: sparks (exits.js's shared spark cloud) and the pick's clink on stone (digfx). */
  hammer() {
    const ex = this.game.exits;
    const fx = this.game.digfx;
    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        if (ex?.spark) {
          for (let n = 0; n < 14; n++) {
            const a = Math.random() * Math.PI * 2;
            const v = 0.8 + Math.random() * 1.8;
            ex.spark(ANVIL.x, ANVIL.y + 0.05, ANVIL.z, Math.cos(a) * v, 1 + Math.random() * 1.6, Math.sin(a) * v, 0.35 + Math.random() * 0.3, [1, 0.72, 0.3], 0.9);
          }
        }
        fx?.sound?.(3, true);
      }, k * 260);
    }
  }

  /* ---------------- effects ---------------- */

  /** The factors that apply to player p now (all 1 when off). */
  factors(p) {
    return factorsOf(this.enabled ? this.levels(p) : ZERO);
  }

  /** The swing time factor (shire.digMult → player.js tryDig). */
  swingMult(p) {
    return this.enabled && p.smithF ? p.smithF.swing : 1;
  }

  /**
   * Puts player p's factors in place: the perk layer (power, bag, climb, hunger), `p.smithLamp` (coop-actions/lamp.js),
   * `p.smithF` (swingMult). Cheap when nothing changed (a signature compare); safe after a character change (the new
   * character's perk object becomes the base).
   */
  apply(p) {
    if (!p?.perk) return;
    const f = this.factors(p);
    const layered = !!p.smithPerk && p.perk === p.smithPerk;
    const base = layered ? p.smithBase : p.perk;
    const sig = FACTOR_KEYS.map((k) => f[k].toFixed(5)).join('|');
    if (sig === p.smithSig && (layered || !p.smithPerk)) return;
    p.smithSig = sig;
    const none = FACTOR_KEYS.every((k) => f[k] === 1);
    if (none) {
      if (layered) p.perk = base;
      p.smithPerk = null;
      p.smithBase = null;
      p.smithF = null;
      p.smithLamp = null;
      return;
    }
    p.smithBase = base;
    p.smithPerk = { ...base, power: base.power * f.power, bag: base.bag * f.bag, climb: base.climb * f.climb, hunger: base.hunger * f.hunger };
    p.perk = p.smithPerk;
    p.smithF = f;
    p.smithLamp = f.lampBoost !== 1 || f.lampReach !== 1 ? { boost: f.lampBoost, reach: f.lampReach } : null;
  }

  /* ---------------- the menu ---------------- */

  nearAnvil(p) {
    if (p.choosing || p.dead > 0 || p.depth > 0.5 || this.game.bagEnd?.isInside?.(p)) return false;
    return Math.hypot(p.pos.x - ANVIL.x, p.pos.z - ANVIL.z) < SMITH.reach;
  }

  rows(p) {
    const lv = this.levels(p);
    const rows = UPGRADES.map((u, i) => ({ i, label: u.name, level: lv[i], price: this.price(i, p), ok: true }));
    rows.push({ label: 'Bezárás', ok: true, close: true });
    return rows;
  }

  /** Per player in the Shire's chain: the menu (held), the use key at the anvil. True = this player is held. */
  input(p, i, it) {
    if (!this.enabled) return false;
    const m = this.menu.get(p);
    if (m) {
      const rows = this.rows(p);
      if (it.backPressed || it.interactPressed || !this.nearAnvil(p)) {
        this.menu.delete(p);
        return true;
      }
      if (it.upPressed) m.sel = (m.sel + rows.length - 1) % rows.length;
      if (it.downPressed) m.sel = (m.sel + 1) % rows.length;
      m.sel = clamp(m.sel, 0, rows.length - 1);
      if (it.confirmPressed || it.digPressed) {
        const r = rows[m.sel];
        if (r.close) this.menu.delete(p);
        else this.buy(p, r.i); // the selection stays: the same upgrade can be bought again at once
      }
      return true;
    }
    if (p.choosing || p.dead > 0 || !it.interactPressed || !this.nearAnvil(p)) return false;
    this.menu.set(p, { sel: 0 });
    return true;
  }

  promptFor(p, i) {
    if (this.menu.has(p) || !this.nearAnvil(p)) return '';
    return `A törpe kovács: élezés, nyél, lámpa, zsák, edzés: ${this.keysFor(i).interact}`;
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.syncShown();
    if (!this.enabled) {
      if (this.ui.size) this.drawUi(true);
      for (const p of this.game.players) if (p.smithPerk || p.smithLamp) this.apply(p);
      return;
    }
    this.slowT += dt;
    if (this.slowT >= 0.25) {
      this.slowT = 0;
      this.slow();
      if (!this.menu.size) this.drawUi(); // the prompt: 4 times a second is enough
    }
    if (this.menu.size) this.drawUi(); // an open menu follows every press
  }

  /** Every 0.25 s: each player's factors (a signature compare), the first hint. */
  slow() {
    const g = this.game;
    for (const p of g.players) {
      if (p.choosing) continue;
      this.apply(p);
      if (!this.hinted?.has(p) && g.money >= Math.min(...UPGRADES.map((u, i) => this.price(i, p)))) {
        (this.hinted ||= new Set()).add(p);
        this.shire.hint(p, 'smith', `<b style="${GOLD}">A törpe kovács.</b> A Zöld Sárkány pultjától keletre, a dűlőút túloldalán egy vándorló törpe kovácsműhelyt nyitott (az üllőnél a használat gomb). Élezés, új nyél, jobb lámpa, foltozott zsák, edzés: mindegyik szintenként fejleszthető, végtelenségig — minden szint drágább, és egyre kisebbet ad hozzá.`);
      }
    }
  }

  /* ---------------- the DOM (own elements and CSS inside each HUD) ---------------- */

  keysFor(i) {
    const shared = this.game.bindings?.some((b) => b.kbm === 'keys2');
    return glyphs(deviceOf(this.game.bindings?.[i]), shared);
  }

  uiFor(i, p) {
    const el = this.game.huds?.[i]?.el;
    if (!el) return null;
    let u = this.ui.get(p);
    if (u && u.root === el) return u;
    if (!document.getElementById('smith-style')) {
      const st = document.createElement('style');
      st.id = 'smith-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    if (u) for (const e of [u.prompt, u.menu]) e.remove();
    const mk = (cls) => {
      const d = document.createElement('div');
      d.className = cls;
      el.appendChild(d);
      return d;
    };
    u = { root: el, prompt: mk('smith-prompt'), menu: mk('smith-menu'), pText: null, mSig: null };
    this.ui.set(p, u);
    return u;
  }

  /** Writes each player's prompt and menu when they changed (`clear`: hide all). */
  drawUi(clear = false) {
    const g = this.game;
    g.players.forEach((p, i) => {
      const prompt = clear || !this.enabled ? '' : this.promptFor(p, i);
      const m = clear ? null : this.menu.get(p);
      if (!prompt && !m && !this.ui.has(p)) return;
      const u = this.uiFor(i, p);
      if (!u) return;
      if (!prompt && !m && !u.pText && !u.mSig) return; // nothing shown, nothing to show
      if (prompt !== u.pText) {
        u.pText = prompt;
        u.prompt.innerHTML = prompt;
        u.prompt.style.display = prompt ? 'block' : 'none';
      }
      const k = m ? this.keysFor(i) : null;
      const sig = m ? `${m.sel}|${this.levels(p).join(',')}|${g.money}|${k.nav}|${g.players.length}|${p.bagTier}|${p.ch?.id}` : '';
      if (sig !== u.mSig) {
        u.mSig = sig;
        u.menu.style.display = m ? 'block' : 'none';
        if (m) u.menu.innerHTML = this.menuHtml(p, m, this.rows(p), k);
      }
    });
  }

  menuHtml(p, m, rows, k) {
    const g = this.game;
    const sel = rows[m.sel] || rows[0];
    const list = rows.map((r, j) => {
      const cls = ['smith-row', j === m.sel ? 'sel' : '', !r.close && g.money < r.price ? 'poor' : ''].filter(Boolean).join(' ');
      const icon = r.i != null ? `<svg viewBox="0 0 32 32">${ICONS[r.i]}</svg>` : '<svg viewBox="0 0 32 32"></svg>';
      const lv = r.i != null ? `<span class="smith-lv">${r.level ? `${r.level}. szint` : 'még nincs'}</span>` : '';
      return `<div class="${cls}">${icon}<span>${r.label}</span>${lv}${r.i != null ? `<span class="smith-price">${r.price} arany</span>` : ''}</div>`;
    }).join('');
    let desc = '';
    if (sel.i != null) {
      const u = UPGRADES[sel.i];
      const L = sel.level;
      const now = L ? u.show(upgradeFactors(sel.i, L)) : 'még nincs fejlesztve';
      const next = u.show(upgradeFactors(sel.i, L + 1));
      desc = `${u.desc}<br><b>Most:</b> ${now}<br><b>${L + 1}. szint:</b> ${next}`;
    }
    const coop = g.players.length > 1 ? ` · ketten: az árak ×${COOP.price}` : '';
    return `<h3>A törpe kovács</h3><div class="smith-sub">„Amióta elhagytuk a Hegyet, népünk sokszor kovácsmunkából élt.” · ${p.ch?.name || ''} fejlesztései</div>`
      + `<div class="smith-purse">Közös erszény: ${g.money} arany${coop}</div>${list}<div class="smith-desc">${desc}</div>`
      + `<div class="smith-keys">${k.nav}<span>választás</span><i>·</i>${k.confirm}<span>${sel.i != null ? 'megrendelés' : 'bezárás'}</span><i>·</i>${k.back}<span>bezárás</span></div>`;
  }

  /* ---------------- save (inside the Shire's save as `k`) ---------------- */

  /** Per slot [character id, level …] or 0; undefined when no level was ever bought. */
  state() {
    if (!this.slots.some((s) => s && s.l.some((v) => v > 0))) return undefined;
    return this.slots.map((s) => (s && s.l.some((v) => v > 0) ? [s.c, ...s.l] : 0));
  }

  restore(k) {
    this.slots = Array.from({ length: SMITH.slots }, (x, i) => {
      const a = Array.isArray(k) ? k[i] : null;
      if (!Array.isArray(a) || typeof a[0] !== 'string') return null;
      return { c: a[0], l: UPGRADES.map((u, j) => clamp(Math.round(+a[j + 1]) || 0, 0, 999)) };
    });
    this.menu.clear();
    this.hinted = null;
    for (const p of this.game.players || []) this.apply(p); // (none yet at game start: the Shire restores before they join)
  }
}
