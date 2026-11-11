/* ==== modes/index.js — the game modes (NOTES-15-modes): Kihívás (TERV 0.6), Versengés (TERV 0.11/20) and the hired
   dwarf of single play (TERV 0.11/18).
   - The mode is chosen on the title (main.js) when a new game starts, saved with the game (`mode` in the save) and in
     its own slot (save.js SAVE_KEYS: Kihívás has "külön mentési hely"); Versengés never saves.
   - Kihívás: sets `enemies.challenge`, which every existing branch reads (falls: safety/; goblins and goblin night:
     enemies/goblins.js; Smaug's fire in the finale: finale/), and adds what TERV 0.6 lists on top: a death loses the
     bag for good (no sack is left) and a share of the purse, and the pit caves in where the player died; a closing
     spider cocoon and the cold water (a flood wash-up, swimming) hurt and can kill; the counter pays less and food costs
     more; armour tier 3 and up divides the harms ("több életerő", rules.js lifeOf). The HUD carries a small seal, and a
     death shows a yellowing book page with an unfinished sentence (TERV 0.12 "Halál … Kihívás módban").
   Wiring (game.js): `game.modes` built after the other modules; `input` per player before the normal controls,
   `update(dt)` once per frame (returns at once when nothing is on), `decorateHud(hud)` when a player joins; player.js
   die() asks `death(p, reason)`; hud.js multiplies the counter's prices by `econ`; save.js saves `state()`. ==== */
import { CHALLENGE, MODE, lifeOf } from './rules.js';
import { Helper } from './helper.js';
import { Versus } from './versus.js';
// coop-actions (NOTES-23-coop-actions): Beorn's rule (the heavy chest, the hoist, the held lamp); Dori covers single play.
import { CoopActions } from '../coop-actions/index.js';
import { armourOf } from '../enemies/armour.js';
import { baseField } from '../save.js';
import { fillSphere } from '../world.js';

/** The lift column runs the whole depth (lift.js COLUMN): no cave-in next to it. */
const LIFT_COLUMN = { x: -4, z: 9.0 };

export class Modes {
  /** @param {string} mode 'normal' | 'kihivas' | 'versus' */
  constructor(game, mode) {
    this.game = game;
    this.mode = Object.values(MODE).includes(mode) ? mode : MODE.normal;
    this.versus = this.mode === MODE.versus ? new Versus(game) : null;
    this.helper = new Helper(game);
    // coop-actions (NOTES-23-coop-actions): built here so game.js needs no extra wiring; saved in state().ca.
    this.coop = new CoopActions(game);
    game.coopActions = this.coop;
    /** Kihívás: cave-ins waiting for the dead player's respawn, death pages showing. */
    this.pending = [];
    this.pages = [];
    this.watch = new Map(); // per player: last cocoon / wash-up state (edge detection)
    if (game.enemies) game.enemies.challenge = this.mode === MODE.challenge;
  }

  /** Kihívás is on: `enemies.challenge` is the one switch every branch reads (QA may set it on a bench page). */
  get challenge() {
    return !!this.game.enemies?.challenge;
  }

  /** Counter multipliers (hud.js rows): Kihívás pays less and food costs more (TERV 0.6). */
  get econ() {
    return this.challenge ? { sell: CHALLENGE.sell, food: CHALLENGE.food } : { sell: 1, food: 1 };
  }

  state() {
    const s = { m: this.mode };
    if (this.helper.hired) s.h = 1;
    if (!this.versus) s.ca = this.coop.state(); // coop-actions (NOTES-23-coop-actions)
    return s;
  }

  restore(s) {
    if (s?.h) this.helper.hire();
    if (s?.ca && !this.versus) this.coop.restore(s.ca); // coop-actions (NOTES-23-coop-actions)
  }

  /** The small seal on a player's HUD in Kihívás mode (inline styles: ui.css belongs to the UI work). */
  decorateHud(hud) {
    if (!this.challenge || !hud?.el || hud.el.querySelector('.mode-seal')) return;
    const seal = document.createElement('div');
    seal.className = 'mode-seal';
    seal.textContent = 'Kihívás';
    seal.title = 'Kihívás mód: a halál végleges veszteséggel jár';
    Object.assign(seal.style, {
      position: 'absolute', top: '6px', left: '50%', transform: 'translateX(-50%)', zIndex: '6', pointerEvents: 'none',
      padding: '1px 10px 2px', fontSize: '12px', letterSpacing: '1.5px', color: '#f0d8b8', opacity: '0.82',
      fontFamily: 'Almendra, "EB Garamond", Georgia, serif', background: 'radial-gradient(#8a2418, #5a140c)',
      border: '1px solid #c0603a', borderRadius: '10px', boxShadow: '0 1px 3px #000a', textShadow: '0 1px 1px #000',
    });
    hud.el.append(seal);
  }

  /** Before the normal controls (game.js): the versus phases hold the players. True = held (menu open). */
  input(p, i, it) {
    if (!this.versus) this.coop.input(p, i, it); // coop-actions (NOTES-23-coop-actions): the use and lamp keys first
    return this.versus ? this.versus.input(p, i, it) : false;
  }

  /** Per frame; nothing to do in a normal game without the hired dwarf. */
  update(dt) {
    if (this.versus) this.versus.update(dt);
    if (this.helper.hired) this.helper.update(dt);
    this.coop.update(dt); // coop-actions (NOTES-23-coop-actions)
    if (!this.challenge) return;
    for (const p of this.game.players) this.watchHarms(p, dt);
    if (this.pending.length) this.pending = this.pending.filter((c) => !(c.p.dead <= 0 && this.caveIn(c)));
    if (this.pages.length) this.pages = this.pages.filter((pg) => this.pageStep(pg));
  }

  /* ---------------- Kihívás: the dangers that only hurt in this mode ---------------- */

  /** A Kihívás harm: plate points (÷ the armour's "életerő"); an empty plate kills. True when it killed. */
  harm(p, amount, reason) {
    if (p.dead > 0 || p.choosing) return false;
    p.hunger = Math.max(0, p.hunger - amount / lifeOf(p));
    if (p.hunger > 0) return false;
    p.die(reason);
    return true;
  }

  /** Spider cocoons and the cold water (TERV 0.6 "pókok … hideg víz"): edges and the swim, per player. */
  watchHarms(p, dt) {
    if (p.dead > 0 || p.choosing) return;
    let w = this.watch.get(p);
    if (!w) this.watch.set(p, (w = { cocoon: false, washed: false }));
    const cocoon = !!p.cocoon;
    if (cocoon && !w.cocoon) {
      const arm = armourOf(p);
      if (!this.harm(p, CHALLENGE.cocoon * (arm.hurt ?? 1), 'A pókok végeztek veled…')) p.say('A pókméreg megsebzett! (Kihívás mód)', 2.5);
    }
    w.cocoon = cocoon;
    const washed = !!p.washed;
    // The flood carried the player off (the breath ran out): the cold water's harm when he is washed up.
    if (!washed && w.washed && !this.harm(p, CHALLENGE.wash, 'Elvitt a hideg víz…')) p.say('Átfagytál a hideg vízben! (Kihívás mód)', 2.5);
    w.washed = washed;
    // Swimming in the cold underground water (Gollum's lake, the pools and floods beneath Lake-town).
    if (p.water?.swimming && !p.asleep && !p.riding && !washed) this.harm(p, CHALLENGE.chill * dt, 'A hideg víz elvette az erődet…');
  }

  /* ---------------- Kihívás: death ---------------- */

  /**
   * player.js die(): in Kihívás the bag is lost for good (no sack) and a share of the purse; the pit caves in there
   * after the respawn; the death page shows. Returns true when it handled the loss (die() then leaves no sack).
   */
  death(p, reason) {
    if (!this.challenge) return false;
    const g = this.game;
    const coins = Math.floor((g.money || 0) * CHALLENGE.moneyLoss);
    g.money -= coins;
    const items = p.bag.length;
    p.say(`${reason} ${items ? 'A zsákod tartalma végleg elveszett' : 'Odalett az utad'}${coins ? `, és ${coins} aranyad is` : ''}. (Kihívás mód)`, 6);
    this.lastDeath = { slot: p.slot, items, coins, reason };
    if (p.depth > CHALLENGE.caveDepth && !g.bagEnd?.isInside(p)) this.pending.push({ p, x: p.pos.x, y: p.pos.y, z: p.pos.z });
    this.showPage(p);
    return true;
  }

  /** "A gödör egy része beomlik": the dug tunnel refills round the death spot. True when done (or given up). */
  caveIn(c) {
    const g = this.game;
    const r = CHALLENGE.caveR;
    const cy = c.y + 0.6;
    if (Math.hypot(c.x - LIFT_COLUMN.x, c.z - LIFT_COLUMN.z) < CHALLENGE.caveClear) return true;
    if (g.coopActions?.nearShaft(c.x, c.y, c.z)) return true; // coop-actions (NOTES-23): never fill the dwarves' hoist shaft
    // Never bury a player: wait while anyone is close (the partner, or the respawned player still nearby).
    if (g.players.some((q) => q.dead <= 0 && Math.hypot(q.pos.x - c.x, q.pos.y - cy, q.pos.z - c.z) < r + 2)) {
      c.wait = (c.wait || 0) + 1;
      return c.wait > 600; // about 10 s of frames: give up rather than wait for ever
    }
    const filled = fillSphere(c.x, cy, c.z, r, baseField());
    const ladders = g.ladders?.removeNear?.(c.x, cy, c.z, r) || 0;
    this.lastCave = { x: +c.x.toFixed(2), y: +cy.toFixed(2), z: +c.z.toFixed(2), filled, ladders };
    if (filled) c.p.say(`A gödör egy része beomlott ott, ahol elestél${ladders ? ` (${ladders} létra odaveszett)` : ''}.`, 5);
    g.saveNow?.();
    return true;
  }

  /** The Kihívás death page (TERV 0.12): a book page with an unfinished sentence, yellowing, over the player's view. */
  showPage(p) {
    const hud = this.game.huds[this.game.players.indexOf(p)];
    if (!hud?.el) return;
    let el = hud.el.querySelector('.ch-page');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ch-page';
      Object.assign(el.style, {
        position: 'absolute', inset: '0', zIndex: '7', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000c', pointerEvents: 'none',
      });
      el.innerHTML = `<div class="ch-leaf" style="width:min(70%,460px);aspect-ratio:3/4;max-height:86%;padding:8% 9%;box-sizing:border-box;
          background:#f3ead2;border-radius:2px 6px 6px 2px;box-shadow:inset 18px 0 30px -18px #0007,0 6px 30px #000;
          font-family:'EB Garamond',Georgia,serif;color:#2a1c10;transition:background-color 2.2s ease-in,filter 2.2s ease-in">
        <div style="font-family:'Uncial Antiqua',Almendra,serif;font-size:13px;letter-spacing:2px;opacity:.6;text-align:center">· · ·</div>
        <p class="ch-ink" style="font-size:clamp(15px,2.4vw,22px);font-style:italic;line-height:1.5;margin-top:22%;opacity:0;transition:opacity 1.4s ease-out .3s"></p></div>`;
      hud.el.append(el);
    }
    const leaf = el.querySelector('.ch-leaf');
    const ink = el.querySelector('.ch-ink');
    // The unfinished sentence: the player's own name, no invented lore.
    ink.textContent = `${p.ch.name} lement a gödörbe, mélyebbre, mint addig bárki, és…`;
    leaf.style.transition = 'none';
    leaf.style.backgroundColor = '#f3ead2';
    leaf.style.filter = 'none';
    ink.style.transition = 'none';
    ink.style.opacity = '0';
    el.style.display = 'flex';
    void el.offsetWidth; // restart the transitions
    leaf.style.transition = '';
    ink.style.transition = '';
    leaf.style.backgroundColor = '#c9a862';
    leaf.style.filter = 'sepia(.35)';
    ink.style.opacity = '1';
    this.pages = this.pages.filter((pg) => pg.p !== p);
    this.pages.push({ p, el });
  }

  /** Keeps the page up while the player is dead; false when it is hidden. */
  pageStep(pg) {
    if (pg.p.dead > 0) return true;
    pg.el.style.display = 'none';
    return false;
  }

  /** The rope key with no partner (safety/): the hired dwarf. */
  ropeKey(p) {
    return this.helper.ropeKey(p);
  }

  /** Counter rows (hud.js): the hired dwarf (single play, not in versus); the hired company (NOTES-42-hirelings). */
  shopRows(p, cost) {
    return this.versus ? [] : [...this.helper.shopRows(p, cost), ...(this.game.hirelings?.shopRows(p) || [])];
  }
}
