/* ==== shire/index.js — Shire life (TERV 0.11/13, 15, 16; NOTES-26-shire): the mathom economy and the neighbour,
   the seven meals' rhythm, the vegetable patch from the spoil heap, Bilbo's acorn growing after the finale. ====
 * game.js: `this.shire = new Shire(this)` + `restore(save.shire)` (after homeEvents, before the players join), the
 * per-player chain `else if (this.shire.input(p, i, it)) menuOpen = true;` before the counter, `update(dt)` per frame,
 * `state()` in the save (game.js merges it into the snapshot as `shire`).
 * Read by: hud.js (priceMult, sellMult, buyerMult, buyerNote; p.mealClock), player.js (digMult, p.mealK),
 * home-events/index.js (onBirthday, isMathom for the gift choice).
 * party/ (NOTES-39-party): Bilbo's birthday party on the Party Field is owned here (`this.party`, also `game.party`): its
 * input comes first in input(), its update first in update(), its stages ride in the save as the optional `p`, and its
 * stages' price / buying factors multiply into priceMult / sellMult.
 * smith/ (NOTES-40-smith): the travelling dwarf smith's endless upgrades are owned here too (`this.smith`, also
 * `game.smith`): its input after the party's, its update after the party's, its levels ride in the save as the optional
 * `k`, and its swing-time factor multiplies into digMult.
 * hirelings/ (NOTES-42-hirelings): the hired dwarves of Thorin's company are owned here too (`this.hirelings`, also
 * `game.hirelings`): their menu's input after the smith's, their update after the smith's (it also runs on a bench page
 * for `?hire=1`), their state rides in the save as the optional `h`; Fíli's stair speeds walking through meals.js mealK.
 * Cost: meals every frame (a few comparisons per player); the garden, the acorn, the prompts every 0.25 s; meshes are
 * built once and only shown / scaled. Off on bench pages unless `force` (QA). */
import * as THREE from 'three';
import { DAY } from '../daynight.js';
import { FIND_TYPES } from '../finds.js';
import { BED_D, BED_SLOTS, BED_W, buildBeds } from '../surface/beds.js';
import { buildNeighbour } from '../surface/neighbour.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { Party } from '../party/index.js';
import { Smith } from '../smith/index.js';
import { Hirelings } from '../hirelings/index.js';
import { isMathom, Mathoms } from './mathoms.js';
import { Meals } from './meals.js';

export { isMathom };

export const GARDEN = {
  /** Game days from planting to ripe, and the yield (finds into the bag). */
  crops: {
    krumpli: { days: 1.0, yield: 4, name: 'krumpli', plant: 'krumplit' },
    gomba: { days: 0.75, yield: 3, name: 'gomba', plant: 'gombát' },
    paradicsom: { days: 1.25, yield: 3, name: 'paradicsom', plant: 'paradicsomot' },
  },
  reach: 1.7, // m from a bed's edge for the use key
  acornDays: 4, // game days from the acorn to the grown oak
  acornMin: 0.08, // the oak's scale as a sprout (finale/props.js builds it at this scale)
};
export const NEIGHBOUR = { reach: 2.2 };

const byId = (id) => FIND_TYPES.find((f) => f.id === id);
const GOLD = 'color:#7a4a10';

export class Shire {
  constructor(game) {
    this.game = game;
    /** QA: on on a bench page too. */
    this.force = false;
    this.meals = new Meals(this);
    this.mathoms = new Mathoms(this);
    /** Per bed slot: { crop: null | id, at: clock s planted, left: crops still to pick (ripe) }. */
    this.beds = BED_SLOTS.map(() => ({ crop: null, at: 0, left: 0 }));
    this.unlocked = 0; // beds unlocked so far (for the message once)
    this.acornAt = null; // clock second the acorn was planted (finale.done), null = not yet
    this.menu = new Map(); // player → { sel } while the neighbour's menu is open
    this.ui = new Map();
    this.slowT = 0;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const root = game.surface?.root || game.scene;
    this.beds3d = root ? buildBeds(root, this.mat) : null;
    this.neighbour = root ? buildNeighbour(root, this.mat) : null;
    this.syncBeds(true);
    // party (NOTES-39-party): after the material (its figures share it).
    this.party = new Party(this);
    game.party = this.party;
    // smith (NOTES-40-smith): after the material (the forge shares it).
    this.smith = new Smith(this);
    game.smith = this.smith;
    // hirelings (NOTES-42-hirelings): after the material (the stair's treads and the figures share it).
    this.hirelings = new Hirelings(this);
    game.hirelings = this.hirelings;
  }

  get enabled() {
    return this.force || !this.game.bench;
  }

  clock() {
    return this.game.bagEnd?.clock ?? 0;
  }

  /* ---------------- read by other modules ---------------- */

  priceMult() {
    return this.enabled ? this.mathoms.priceMult() * this.party.priceMult() : 1;
  }

  sellMult() {
    return this.enabled ? this.mathoms.sellMult() * this.party.sellMult() : 1;
  }

  buyerMult(f) {
    return this.enabled ? this.mathoms.buyerMult(f) : 1;
  }

  buyerNote() {
    return this.enabled ? this.mathoms.buyerNote() : '';
  }

  digMult(p) {
    return this.meals.digMult(p) * this.smith.swingMult(p); // smith (NOTES-40-smith): the new handle's swing time
  }

  onBirthday(gifts) {
    this.mathoms.onBirthday(gifts);
  }

  /** A one-time parchment hint (tutorial.js) per player. */
  hint(p, id, text) {
    const i = this.game.players.indexOf(p);
    if (i < 0 || this.game.bench) return;
    this.game.tutorial?.hint?.(i, p, `shire-${id}-${i}`, text);
  }

  /* ---------------- the garden ---------------- */

  dug() {
    return this.game.surface?.spoil?.volume ?? 0;
  }

  /** How many bed slots the dug soil has turned into beds. */
  bedsOpen() {
    const v = this.dug();
    return BED_SLOTS.filter((s) => v >= s.need).length;
  }

  /** 0..1 growth of a planted bed. */
  growth(i) {
    const b = this.beds[i];
    if (!b.crop) return 0;
    if (b.left > 0) return 1;
    return Math.min(1, (this.clock() - b.at) / (GARDEN.crops[b.crop].days * DAY.length));
  }

  ripe(i) {
    return !!this.beds[i].crop && this.growth(i) >= 1;
  }

  /** The bed slot a player stands at (within reach of its edge, on the surface), or −1. */
  bedAt(p) {
    if (p.depth > 0.5 || p.pos.y < -1 || this.game.bagEnd?.isInside?.(p)) return -1;
    let best = -1;
    let bd = Infinity;
    BED_SLOTS.forEach((s, i) => {
      const dx = Math.max(0, Math.abs(p.pos.x - s.x) - BED_W / 2);
      const dz = Math.max(0, Math.abs(p.pos.z - s.z) - BED_D / 2);
      const d = Math.hypot(dx, dz);
      if (d < GARDEN.reach && d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  plant(p, i) {
    const s = BED_SLOTS[i];
    const b = this.beds[i];
    if (this.dug() < s.need || b.crop) return false;
    b.crop = s.crop;
    b.at = this.clock();
    b.left = 0;
    const c = GARDEN.crops[s.crop];
    p.say(`Elültetted a ${c.plant}. Kb. ${c.days < 1 ? 'háromnegyed' : c.days === 1 ? 'egy' : 'másfél'} nap múlva szedheted (a nap–hold korong mutatja a napokat).`, 4);
    this.syncBeds(true);
    return true;
  }

  harvest(p, i) {
    const b = this.beds[i];
    if (!this.ripe(i)) return false;
    const c = GARDEN.crops[b.crop];
    if (b.left <= 0) b.left = c.yield;
    const type = byId(b.crop);
    const room = Math.max(0, p.bagCap - p.bag.length);
    const n = Math.min(room, b.left);
    if (n <= 0) {
      p.say('Tele a zsákod: nem fér bele a termés.', 2.5);
      return false;
    }
    for (let k = 0; k < n; k++) p.bag.push(type);
    b.left -= n;
    if (b.left <= 0) b.crop = null;
    const what = b.crop === null ? '' : ` (${b.left} még az ágyásban)`;
    p.say(`Leszedtél ${n} ${c.plant}${what}.${type.id === 'krumpli' ? ' A konyhában megfőzheted.' : ' Étkezéskor megeheted a zsákodból.'}`, 4);
    this.syncBeds(true);
    return true;
  }

  /** Shows the beds' state: pegs (locked), bed (open), crop (scaled by growth), ripe crop. */
  syncBeds(force = false) {
    if (!this.beds3d) return;
    const open = this.bedsOpen();
    BED_SLOTS.forEach((s, i) => {
      const m = this.beds3d.slots[i];
      const isOpen = i < open && this.dug() >= s.need;
      const b = this.beds[i];
      const gr = this.growth(i);
      const key = `${isOpen}|${b.crop}|${Math.round(gr * 20)}`;
      if (!force && m.key === key) return;
      m.key = key;
      m.pegs.visible = !isOpen;
      m.bed.visible = isOpen;
      m.crop.visible = isOpen && !!b.crop;
      const sy = 0.12 + 0.88 * gr;
      m.crop.scale.set(1, sy, 1);
      m.crop.position.y = 0.18 * (1 - sy);
      m.ripe.visible = isOpen && !!b.crop && gr >= 1;
    });
  }

  /** The beds open as the dug soil grows: a message the first time each one opens. */
  checkUnlock() {
    const open = this.bedsOpen();
    if (open > this.unlocked) {
      for (let k = this.unlocked; k < open; k++) {
        const c = GARDEN.crops[BED_SLOTS[k].crop];
        for (const p of this.game.players) {
          if (p.choosing) continue;
          p.say(`A kiásott földből új veteményes ágyás lett a földkupac mellett (${c.name}).`, 4);
          this.hint(p, 'kert', `<b style="${GOLD}">Veteményes a kiásott földből.</b> A földkupac melletti ágyásba ültess (használat gomb az ágyásnál). Néhány játéknap alatt megnő (az alvás is sietteti), aztán szüreteld: a krumplit és a gombát a konyha megfőzi, a paradicsomot és a gombát étkezéskor a zsákodból is megeszed. Minél több földet ástok ki, annál több ágyás nyílik.`);
        }
      }
      this.unlocked = open;
    }
    if (open < this.unlocked) this.unlocked = open; // (a new game)
  }

  /* ---------------- Bilbo's acorn ---------------- */

  oak() {
    return this.game.finale?.garden?.userData?.oak || null;
  }

  /** 0..1 growth of the oak (0 = the acorn just planted). */
  acornGrowth() {
    if (this.acornAt == null) return 0;
    return Math.max(0, Math.min(1, (this.clock() - this.acornAt) / (GARDEN.acornDays * DAY.length)));
  }

  syncAcorn() {
    const fin = this.game.finale;
    if (fin?.done && this.acornAt == null) {
      this.acornAt = this.clock();
      for (const p of this.game.players) if (!p.choosing) p.say('Bilbó makkját elültették a kertben. Néhány nap alatt fa nő belőle.', 4);
    }
    const oak = this.oak();
    if (!oak) return;
    const g = this.acornGrowth();
    const s = GARDEN.acornMin + (1 - GARDEN.acornMin) * Math.pow(g, 0.85);
    if (Math.abs(oak.scale.x - s) > 0.002) oak.scale.setScalar(s);
  }

  /* ---------------- the neighbour ---------------- */

  nearNeighbour(p) {
    const n = this.neighbour;
    if (!n || p.choosing || p.dead > 0 || p.depth > 0.5 || this.game.bagEnd?.isInside?.(p)) return false;
    return Math.hypot(p.pos.x - n.pos.x, p.pos.z - n.pos.z) < NEIGHBOUR.reach;
  }

  /** Per player in the chain: the neighbour's menu (held), the use key at him or at a bed. True = this player is held. */
  input(p, i, it) {
    if (this.party.input(p, i, it)) return true; // party (NOTES-39-party): the scene, the signboard's menu
    if (this.smith.input(p, i, it)) return true; // smith (NOTES-40-smith): the forge's menu
    if (this.hirelings.input(p, i, it)) return true; // hirelings (NOTES-42-hirelings): the hiring menu
    if (!this.enabled) return false;
    const m = this.menu.get(p);
    if (m) {
      const rows = this.mathoms.offers(p);
      if (it.backPressed || it.interactPressed || !this.nearNeighbour(p)) {
        this.menu.delete(p);
        return true;
      }
      if (it.upPressed) m.sel = (m.sel + rows.length - 1) % rows.length;
      if (it.downPressed) m.sel = (m.sel + 1) % rows.length;
      if (it.confirmPressed || it.digPressed) {
        const r = rows[m.sel];
        if (r.close) this.menu.delete(p);
        else if (!r.ok) p.say(this.mathoms.tradesLeft() <= 0 ? 'A szomszéd mára eleget cserélt. Holnap gyere vissza!' : 'Nincs nálad mathom (gomb, kanál, kancsó, pipa, régi tűzijáték, elásott mathom).', 3);
        else r.act();
      }
      return true;
    }
    if (p.choosing || p.dead > 0 || !it.interactPressed) return false;
    if (this.nearNeighbour(p)) {
      this.menu.set(p, { sel: 0 });
      return true;
    }
    const b = this.bedAt(p);
    if (b >= 0 && this.dug() >= BED_SLOTS[b].need) {
      if (!this.beds[b].crop) this.plant(p, b);
      else if (this.ripe(b)) this.harvest(p, b);
      else p.say(`Még nő: ${Math.round(this.growth(b) * 100)} %.`, 2);
      return true;
    }
    return false;
  }

  /** The prompt line for a player (the neighbour, a bed), '' for none. */
  promptFor(p, k) {
    if (this.menu.has(p)) return '';
    if (this.nearNeighbour(p)) return `A szomszéd hobbit mathomot cserél: ${k.interact}`;
    const b = this.bedAt(p);
    if (b < 0) return '';
    const s = BED_SLOTS[b];
    const c = GARDEN.crops[s.crop];
    if (this.dug() < s.need) return `Ide ágyás kerül, ha több földet ástok ki (${Math.floor(this.dug())} / ${s.need} m³)`;
    const bed = this.beds[b];
    if (!bed.crop) return `Ültess ${c.plant}: ${k.interact}`;
    if (this.ripe(b)) return `Érett a ${c.name}, szüret: ${k.interact}`;
    return `A ${c.name} nő: ${Math.round(this.growth(b) * 100)} %`;
  }

  keysFor(i) {
    const shared = this.game.bindings?.some((b) => b.kbm === 'keys2');
    return glyphs(deviceOf(this.game.bindings?.[i]), shared);
  }

  /** Per player: the prompt and the neighbour's parchment, drawn inside that player's HUD (inline styles). */
  updateUi() {
    this.game.players.forEach((p, i) => {
      const el = this.game.huds?.[i]?.el;
      if (!el) return;
      let ui = this.ui.get(p);
      if (!ui || ui.root !== el) {
        ui = { root: el, prompt: document.createElement('div'), panel: document.createElement('div'), text: null, sig: null };
        Object.assign(ui.prompt.style, {
          position: 'absolute', left: '50%', top: '62%', transform: 'translateX(-50%)', fontSize: '16px', color: 'var(--gold, #e8c070)',
          textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '6', whiteSpace: 'nowrap',
        });
        Object.assign(ui.panel.style, {
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', minWidth: '19em', maxWidth: '92%',
          padding: '0.8em 1.2em 0.7em', background: 'var(--tx-parch, #ead8b0) center / cover, #ead8b0', color: 'var(--ink-dark, #3a2410)',
          borderRadius: '5px', boxShadow: '0 4px 18px rgba(0,0,0,0.65), inset 0 0 22px rgba(90,58,18,0.35)', fontSize: '15px', zIndex: '7',
          display: 'none', fontFamily: 'inherit', lineHeight: '1.35',
        });
        el.append(ui.prompt, ui.panel);
        this.ui.set(p, ui);
      }
      const k = this.keysFor(i);
      const text = this.enabled ? this.promptFor(p, k) : '';
      if (text !== ui.text) {
        ui.text = text;
        ui.prompt.innerHTML = text;
      }
      const m = this.menu.get(p);
      const sig = m ? `${m.sel}|${this.mathoms.rep}|${this.mathoms.tradesLeft()}|${p.bag.map((f) => f.id).join(',')}|${k.nav}` : '';
      if (sig !== ui.sig) {
        ui.sig = sig;
        ui.panel.style.display = m ? 'block' : 'none';
        if (m) {
          const rows = this.mathoms.offers(p);
          const left = this.mathoms.tradesLeft();
          ui.panel.innerHTML = `<div style="font-size:1.15em;${GOLD};margin-bottom:0.15em">A szomszéd hobbit a sövénynél</div>`
            + `<div style="font-size:0.8em;font-style:italic;opacity:0.85;margin-bottom:0.5em">„Mathomot hoztál? Adok érte valamit.” · Hírneved: ${this.mathoms.levelName()} · ma még ${left} csere</div>`
            + rows.map((r, j) => `<div style="padding:0.12em 0.4em;border-radius:3px;${j === m.sel ? 'background:rgba(90,58,18,0.18);font-weight:bold' : ''};${r.ok ? '' : 'opacity:0.45'}">${j === m.sel ? '▸ ' : '&nbsp;&nbsp;'}${r.label}</div>`).join('')
            + `<div style="margin-top:0.55em;font-size:0.8em;display:flex;gap:0.35em;align-items:center;flex-wrap:wrap">${k.nav}<span>választás</span><i>·</i>${k.confirm}<span>csere</span><i>·</i>${k.back}<span>bezárás</span></div>`;
        }
      }
    });
  }

  update(dt) {
    this.party.update(dt); // party (NOTES-39-party)
    this.smith.update(dt); // smith (NOTES-40-smith)
    this.hirelings.update(dt); // hirelings (NOTES-42-hirelings)
    if (!this.enabled) {
      if (!this.wasOff) {
        this.wasOff = true;
        this.meals.off();
      }
      return;
    }
    this.wasOff = false;
    this.meals.update();
    this.slowT += dt;
    if (this.slowT >= 0.25) {
      this.slowT = 0;
      this.mathoms.update();
      this.checkUnlock();
      this.syncBeds();
      this.syncAcorn();
      // The neighbour turns to the nearest player within a few metres (no per-frame work beyond this check).
      const n = this.neighbour;
      if (n) {
        let best = null;
        let bd = 6;
        for (const p of this.game.players) {
          if (p.choosing || p.depth > 0.5) continue;
          const d = Math.hypot(p.pos.x - n.pos.x, p.pos.z - n.pos.z);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        const yaw = best ? Math.atan2(best.pos.x - n.pos.x, best.pos.z - n.pos.z) : Math.PI;
        if (Math.abs(n.mesh.rotation.y - yaw) > 0.01) n.mesh.rotation.y = yaw;
        for (const p of this.game.players) if (best === p && bd < 4) this.hint(p, 'szomszed', `<b style="${GOLD}">A szomszéd hobbit.</b> A mathomjaidat (Bilbó réz gombja, ezüstkanál, törött kancsó, régi pipa, Gandalf régi tűzijátéka, elásott mathom) elcseréli ételre, pipafűre vagy egy másik mathomra. Minden csere és a születésnapi ajándék hírnevet hoz: jobb árak a Zöld Sárkányban, és néha új vevők.`);
      }
    }
    this.updateUi();
  }

  state() {
    const out = { m: this.mathoms.state(), e: this.meals.state(), u: this.unlocked };
    if (this.beds.some((b) => b.crop)) out.g = this.beds.map((b) => (b.crop ? [b.crop, Math.round(b.at), b.left] : 0));
    if (this.acornAt != null) out.a = Math.round(this.acornAt);
    const party = this.party.state(); // party (NOTES-39-party): optional
    if (party) out.p = party;
    const smith = this.smith.state(); // smith (NOTES-40-smith): optional
    if (smith) out.k = smith;
    const hire = this.hirelings.state(); // hirelings (NOTES-42-hirelings): optional
    if (hire) out.h = hire;
    return out;
  }

  restore(s) {
    this.mathoms.restore(s?.m);
    this.meals.restore(s?.e);
    this.unlocked = s?.u || 0;
    this.beds = BED_SLOTS.map((slot, i) => {
      const b = s?.g?.[i];
      return Array.isArray(b) && GARDEN.crops[b[0]] ? { crop: b[0], at: b[1] || 0, left: b[2] || 0 } : { crop: null, at: 0, left: 0 };
    });
    this.acornAt = s?.a ?? null;
    this.menu.clear();
    this.syncBeds(true);
    this.party.restore(s?.p); // party (NOTES-39-party)
    this.smith.restore(s?.k); // smith (NOTES-40-smith)
    this.hirelings.restore(s?.h); // hirelings (NOTES-42-hirelings)
  }
}
