/* ==== party/index.js — Bilbo's eleventy-first birthday party on the Party Field (TODO item 32, NOTES-39-party; The Lord
   of the Rings book 1 ch. 1 "A Long-expected Party", an allowed LotR exception like the Red Book trophy).
   - The field: round the existing Party Tree south-west of the pit (surface/ground.js PARTY_TREE, its bunting posts in
     surface/shire.js); the lane from the signpost leads to it. A signboard by the lane (props.js SIGN): the use key
     within PARTY.reach opens this module's own parchment menu (own DOM and CSS, inside each player's HUD).
   - Five stages, each dearer, bought in order from the shared purse (STAGES): the pavilion, tables and the kitchen,
     Bilbo's presents, Gandalf's fireworks, the party itself. Each shows on the surface at once (props.js, rebuilt into one
     merged mesh + one lantern mesh) and gives a permanent benefit: reputation through the Shire's public API
     (shire.mathoms.addRep), the Green Dragon's prices / buying (read by shire.priceMult / sellMult), more new buyers
     (shire/mathoms.js rollBuyer reads buyerBonus). The fifth stage's benefit comes with the party.
   - The fifth stage sets the party for dusk (PARTY.dusk): a held scene for the players at the field (captions, confirm
     = next, back = skip; the rewards also on skip): the guests at the tables, Gandalf's fireworks and his dragon (the
     exits.js show, launched south towards Bywater), supper, Bilbo's speech on his chair (short paraphrases), a flash and
     he is gone. Then a memento in Bag End's mathom room (bagEnd.addTrophy: Gandalf's old firework, `tukkacat`).
   - Prices: STAGES[].price × the buyer's character price perk × COOP.price with two players (as Bag End's furnishing).
     Kihívás: modes econ only has `sell` and `food`, so no extra factor (the purse grows slower there anyway).
   Owned by the Shire (shire/index.js: constructed, input / update / state / restore), so game.js and save.js need no
   save change: the stages ride in the Shire's save as the optional `p`. game.js: one line in musicSituation().
   Off on bench pages (`force` for QA); `?party=N` on a bench page only shows N stages (the GPU bench). ==== */
import * as THREE from 'three';
import { COOP } from '../config.js';
import { FIND_TYPES } from '../finds.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { SURFACE_COLLIDERS } from '../props.js';
import { bilboGeometry, buildStages, CHAIR, crowdGeometry, LAUNCH, SIGN, TREE, world } from './props.js';

/** The rules. Hours are the day clock's game hours. */
export const PARTY = {
  reach: 2.2, // m from the signboard for the use key
  near: 34, // m from the Party Tree: the players who watch the party
  dusk: [19, 23], // the party may start in [from, to)
  waitTo: 19.25, // "wait for dusk" moves the clock here (all players at the field)
  settle: 1.5, // s a player must be at the field (and free) before the party starts by itself
  step: 7, // s a caption stays
  stepMin: 0.35, // s before a press moves on
  flash: 1.1, // s of the white flash when Bilbo vanishes
  trophy: 'tukkacat', // Gandalf's old firework (finds.js): the memento in the mathom room
};

/**
 * The stages (book ch. 1), in order. price: base gold. Benefits: rep (reputation points, at once), priceK / sellK (added to
 * the Green Dragon's price and buying factors), buyerK (added to the daily chance of a new buyer). The last one's benefit
 * is given when the party is held.
 */
export const STAGES = [
  {
    id: 'sator', name: 'A Mulatórét és a nagy sátor', price: 1000, rep: 5, priceK: 0, sellK: 0, buyerK: 0,
    desc: 'Rendbe teszik a rétet, és felhúzzák a nagy sátrat: akkorát, hogy a Mulatófa is belefér. Az ágakra lámpások kerülnek, a dűlőútra nagy fehér kapu.',
    gain: '+5 hírnév (az egész Megye erről beszél)',
  },
  {
    id: 'asztalok', name: 'Asztalok, padok és a konyha', price: 2000, rep: 0, priceK: -0.05, sellK: 0, buyerK: 0,
    desc: 'Hosszú asztalok és padok a sátor alatt, a rét szélén konyha: tűzhely, üstök, kenyér, hordók.',
    gain: 'a Zöld Sárkány árai 5 %-kal olcsóbbak (a fogadó szakácsai is besegítenek)',
  },
  {
    id: 'ajandek', name: 'Bilbó ajándékai', price: 3500, rep: 5, priceK: 0, sellK: 0, buyerK: 0.25,
    desc: 'Hobbitszokás szerint az ünnepelt ad ajándékot: minden csomagon címke, kinek szól. A kapunál asztal, a fa alatt halom.',
    gain: '+5 hírnév, és naponta 25 %-kal nagyobb eséllyel jön új vevő (hírnév nélkül is)',
  },
  {
    id: 'tuzijatek', name: 'Gandalf tűzijátéka', price: 5500, rep: 0, priceK: 0, sellK: 0.05, buyerK: 0,
    desc: 'Megérkezik Gandalf szekere: a ládákon az ő piros jele, mellettük hosszú rakéták és állványok.',
    gain: 'a Zöld Sárkány 5 %-kal többet fizet a leletekért (messziről is jönnek vásárolni)',
  },
  {
    id: 'unnep', name: 'Az ünnepség', price: 8000, rep: 10, priceK: -0.05, sellK: 0.05, buyerK: 0,
    desc: 'Megterítik az asztalokat, Bilbó széke a Mulatófa alá kerül. Alkonyatkor kezdődik az ünnepség.',
    gain: 'az ünnepség után: +10 hírnév, a Zöld Sárkány árai további 5 %-kal olcsóbbak, felvásárlása további 5 %-kal jobb, és egy emlék a mathom-szobába',
  },
];

/** Small ink drawings for the menu rows (one per stage). */
const ICONS = [
  '<path d="M4 26 L16 6 L28 26 Z M16 6 V26 M10 26 L16 16 L22 26" />', // the pavilion
  '<path d="M3 13 H29 M6 13 L4 25 M26 13 L28 25 M10 19 H22 M8 19 L7 25 M24 19 L25 25" />', // a table and bench
  '<path d="M6 13 H26 V27 H6 Z M4 9 H28 V13 H4 Z M16 9 V27 M16 9 C12 3 8 6 16 9 C24 6 20 3 16 9" />', // a parcel
  '<path d="M16 3 L19 9 V22 H13 V9 Z M13 22 L10 27 M19 22 L22 27 M16 22 V29 M8 6 L10 8 M24 6 L22 8 M6 13 H9 M23 13 H26" />', // a rocket
  '<path d="M16 3 V7 M11 7 H21 L19 10 H13 Z M12 10 H20 V22 H12 Z M11 22 H21 L19 25 H13 Z M16 13 C14 16 14 18 16 19 C18 18 18 16 16 13" />', // a lantern
];

const CSS = `
.party-prompt{position:absolute;left:50%;top:62%;transform:translateX(-50%);font-size:16px;color:var(--gold,#e8c070);text-shadow:0 1px 3px #000;pointer-events:none;z-index:6;white-space:nowrap}
.party-menu{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94%,31em);max-height:92%;overflow:hidden;padding:.85em 1.25em .75em;background:var(--tx-parch,#ead8b0) center/cover,#ead8b0;color:var(--ink-dark,#3a2410);border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.65),inset 0 0 28px rgba(90,58,18,.4);font-family:var(--f-text,Georgia,serif);font-size:15px;line-height:1.32;z-index:7;display:none}
.party-menu h3{margin:0;text-align:center;font-family:var(--f-title,Georgia,serif);font-weight:normal;font-size:1.32em;color:#5a2a0a}
.party-menu .party-sub{text-align:center;font-style:italic;font-size:.8em;opacity:.85;margin:.1em 0 .5em}
.party-menu .party-purse{text-align:center;font-size:.85em;margin-bottom:.35em;color:#7a4a10}
.party-row{display:flex;align-items:center;gap:.5em;padding:.14em .4em;border-radius:4px}
.party-row.sel{background:rgba(90,58,18,.2);font-weight:bold}
.party-row.done{opacity:.62}
.party-row.locked{opacity:.4}
.party-row svg{width:1.6em;height:1.6em;flex:none;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
.party-row .party-price{margin-left:auto;white-space:nowrap;color:#7a4a10;font-weight:normal}
.party-row.done .party-price{color:#3a6a2a}
.party-desc{margin-top:.45em;padding-top:.4em;border-top:1px solid rgba(90,58,18,.35);font-size:.85em;min-height:4.2em}
.party-desc b{color:#5a2a0a;font-weight:normal;font-style:italic}
.party-keys{margin-top:.45em;font-size:.78em;display:flex;gap:.35em;align-items:center;justify-content:center;flex-wrap:wrap}
.party-cap{position:absolute;left:50%;bottom:11%;transform:translateX(-50%);width:min(90%,34em);padding:.55em 1.2em .5em;text-align:center;font-size:1.02em;line-height:1.35;color:var(--ink-dark,#3a2614);font-family:var(--f-text,Georgia,serif);background:var(--tx-parch) center/cover,#e8d6ac;border-radius:.25em;box-shadow:0 .3em 1.2em #000d,inset 0 0 2.5em #7a5a2a55;pointer-events:none;z-index:8;display:none}
.party-cap .party-cap-t{font-family:var(--f-title,Georgia,serif);font-size:1.25em;color:#5a2a0a;margin-bottom:.15em}
.party-cap .party-cap-k{margin-top:.35em;font-size:.78em;opacity:.75}
`;

const v1 = new THREE.Vector3();
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GOLD = 'color:#7a4a10';

export class Party {
  constructor(shire) {
    this.shire = shire;
    this.game = shire.game;
    /** Stages bought (0 … 5), the party held. */
    this.stages = 0;
    this.done = false;
    this.menu = new Map(); // player → { sel }
    this.ui = new Map();
    this.scene = null;
    this.since = new Map(); // player → s at the field and free (the party starts by itself)
    this.slowT = 0;
    this.noticeDay = 0; // the game day the "come to the field" message went out
    this.rockets = []; // the scene's small fireworks: { x, z, t, top, c }
    this.colliders = [];
    this.built = -1;
    const q = this.game.params?.get?.('party');
    /** Bench pages: `?party=N` shows N stages (visual only, for the GPU bench). */
    this.benchStages = this.game.bench && q != null && q !== '' ? clamp(Math.round(+q) || 0, 0, STAGES.length) : null;
    this.root = this.game.surface?.root || null;
    if (this.root) {
      // Double-sided vertex-coloured Lambert (the same program as the surface's `cloth`: no new shader); the lanterns
      // use the surface's night-glow material when there is one (lit windows, NOTES-28-night).
      this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const glow = Object.values(this.game.surface.meshes || {}).find((m) => m.name === 'surface-glow')?.material;
      this.glowMat = glow || new THREE.MeshBasicMaterial({ vertexColors: true });
      this.figMat = shire.mat; // the neighbour's (FrontSide vertex-coloured Lambert)
      this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      this.mesh.name = 'party-field';
      this.glowMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.glowMat);
      this.glowMesh.name = 'party-lanterns';
      for (const m of [this.mesh, this.glowMesh]) {
        m.matrixAutoUpdate = false;
        this.root.add(m);
      }
      this.crowd = null; // built at the first scene
      this.bilbo = null;
    }
    this.sync();
  }

  get enabled() {
    return this.shire.enabled;
  }

  /* ---------------- benefits (read by the Shire) ---------------- */

  /** The stages whose benefit applies: every one bought, the last only after the party. */
  active() {
    return STAGES.filter((s, k) => k < this.stages && (s.id !== 'unnep' || this.done));
  }

  /** Factor of the Green Dragon's prices (shire.priceMult). */
  priceMult() {
    return 1 + this.active().reduce((a, s) => a + s.priceK, 0);
  }

  /** Factor of the Green Dragon's buying (shire.sellMult). */
  sellMult() {
    return 1 + this.active().reduce((a, s) => a + s.sellK, 0);
  }

  /** Added to the daily chance of a new buyer (shire/mathoms.js rollBuyer). */
  buyerBonus() {
    return this.active().reduce((a, s) => a + s.buyerK, 0);
  }

  /** game.js musicSituation: the feast music during the party. */
  musicSituation() {
    return this.scene ? 'unnep' : null;
  }

  /* ---------------- the stages ---------------- */

  /** What a stage costs for player p (his character's price perk, ×COOP.price with two players). */
  price(k, p) {
    const s = STAGES[k];
    if (!s) return 0;
    const coop = this.game.players.length > 1;
    return Math.round(s.price * (p?.perk?.price || 1) * (coop ? COOP.price : 1));
  }

  /** Rebuilds the field's meshes for the stages shown (only when that number changed). */
  sync() {
    const n = this.benchStages != null && !this.shire.force ? this.benchStages : this.stages;
    if (!this.mesh || n === this.built) return;
    this.built = n;
    const b = buildStages(n);
    this.mesh.geometry.dispose();
    this.mesh.geometry = b.main || new THREE.BufferGeometry();
    this.glowMesh.geometry.dispose();
    this.glowMesh.geometry = b.glow || new THREE.BufferGeometry();
    this.glowMesh.visible = !!b.glow;
    // Colliders: ours replace the last set in the surface's list (props.js pushOutOfSurface reads it).
    for (const c of this.colliders) {
      const i = SURFACE_COLLIDERS.indexOf(c);
      if (i >= 0) SURFACE_COLLIDERS.splice(i, 1);
    }
    this.colliders = b.colliders;
    SURFACE_COLLIDERS.push(...this.colliders);
  }

  /** Buys the next stage for player p from the shared purse. Returns true when bought. */
  buy(p) {
    const k = this.stages;
    const s = STAGES[k];
    if (!s) return false;
    const cost = this.price(k, p);
    const g = this.game;
    if (g.money < cost) {
      p.say(`Ehhez ${cost} arany kell, a közös erszényben ${g.money} van.`, 3.5);
      return false;
    }
    g.money -= cost;
    this.stages = k + 1;
    this.sync();
    if (s.id !== 'unnep') {
      if (s.rep) this.shire.mathoms.addRep(s.rep, 'a Mulatórét');
      for (const q of g.players) if (!q.choosing) q.say(`A Mulatóréten elkészült: ${s.name}. ${s.gain[0].toUpperCase()}${s.gain.slice(1)}.`, 5);
    } else {
      for (const q of g.players) if (!q.choosing) q.say('Minden készen áll: Bilbó ünnepsége alkonyatkor kezdődik a Mulatóréten (19 óra után). Legyetek ott!', 6);
    }
    g.saveNow?.();
    return true;
  }

  /* ---------------- who is where ---------------- */

  nearSign(p) {
    if (p.choosing || p.dead > 0 || p.depth > 0.5 || this.game.bagEnd?.isInside?.(p)) return false;
    return Math.hypot(p.pos.x - SIGN.x, p.pos.z - SIGN.z) < PARTY.reach;
  }

  atField(p) {
    return !p.choosing && p.depth < 0.5 && !this.game.bagEnd?.isInside?.(p) && Math.hypot(p.pos.x - TREE.x, p.pos.z - TREE.z) < PARTY.near;
  }

  /** A player who can watch the party: at the field, alive, not riding, no other menu or page open. */
  free(p) {
    const g = this.game;
    if (p.dead > 0 || p.riding || p.asleep || !this.atField(p)) return false;
    if (g.minigames?.busy?.(p) || g.journal?.isOpen?.(p) || this.shire.menu.has(p)) return false;
    return true;
  }

  inDusk() {
    const h = this.game.dayClock?.hour?.() ?? 12;
    return h >= PARTY.dusk[0] && h < PARTY.dusk[1];
  }

  /** The party is set and waits for dusk. */
  pending() {
    return this.stages >= STAGES.length && !this.done;
  }

  finaleBusy() {
    const st = this.game.finale?.stage;
    return !!st && st !== 'idle' && st !== 'done';
  }

  /* ---------------- the menu ---------------- */

  /** The menu rows for player p: the five stages, then (with the party set) wait / start, then close. */
  rows(p) {
    const rows = STAGES.map((s, k) => {
      const state = k < this.stages ? 'done' : k === this.stages ? 'next' : 'locked';
      return { k, state, label: s.name, price: state === 'done' ? '✓ kész' : `${this.price(k, p)} arany`, ok: state === 'next', desc: s.desc, gain: s.gain, act: () => this.buy(p) };
    });
    if (this.pending()) {
      if (this.inDusk()) rows.push({ label: 'Kezdődjön az ünnepség!', ok: true, desc: 'Alkonyodik: a vendégek gyülekeznek a sátor alatt.', act: () => this.start() });
      else rows.push({ label: 'Várakozás alkonyatig', ok: true, desc: 'Az idő alkonyatig (19 óra) ugrik, ha mindannyian itt vagytok a Mulatóréten.', act: () => this.waitForDusk(p) });
    } else if (this.done) rows.push({ label: 'Az ünnepség emléke', ok: false, desc: 'Bilbó ünnepségét megtartották: a hírneve bejárta a Megyét, és Gandalf egyik régi tűzijátéka a mathom-szoba vitrinjében van.' });
    rows.push({ label: 'Bezárás', ok: true, close: true, desc: '', act: () => {} });
    return rows;
  }

  waitForDusk(p) {
    const g = this.game;
    const away = g.players.some((q) => !q.choosing && !this.atField(q));
    if (away) {
      p.say('Csak együtt várhattok: a társad is jöjjön ide a Mulatórétre.', 3.5);
      return;
    }
    g.dayClock?.advanceTo?.(PARTY.waitTo);
    this.menu.clear();
    for (const q of g.players) if (!q.choosing) q.say('Leszáll az alkony a Mulatóréten…', 3);
  }

  /** Per player in the Shire's chain: the scene (held), the menu (held), the use key at the signboard. */
  input(p, i, it) {
    if (this.scene) return this.sceneInput(p, i, it);
    if (!this.enabled) return false;
    const m = this.menu.get(p);
    if (m) {
      const rows = this.rows(p);
      if (it.backPressed || it.interactPressed || !this.nearSign(p)) {
        this.menu.delete(p);
        return true;
      }
      if (it.upPressed) m.sel = (m.sel + rows.length - 1) % rows.length;
      if (it.downPressed) m.sel = (m.sel + 1) % rows.length;
      m.sel = clamp(m.sel, 0, rows.length - 1);
      if (it.confirmPressed || it.digPressed) {
        const r = rows[m.sel];
        if (r.close) this.menu.delete(p);
        else if (r.ok) {
          r.act();
          // After a purchase the selection follows to the next stage (or the wait / start row).
          const nr = this.rows(p);
          const j = nr.findIndex((x) => x.state === 'next' || (x.k == null && x.ok && !x.close));
          if (this.menu.has(p)) this.menu.get(p).sel = j >= 0 ? j : nr.length - 1;
        } else if (r.state === 'done') p.say('Ez már elkészült.', 2);
        else if (r.state === 'locked') p.say('Előbb az előző részt kell elkészíteni.', 2.5);
      }
      return true;
    }
    if (p.choosing || p.dead > 0 || !it.interactPressed || !this.nearSign(p)) return false;
    const rows = this.rows(p);
    this.menu.set(p, { sel: Math.max(0, rows.findIndex((r) => r.state === 'next' || (r.k == null && r.ok && !r.close))) });
    return true;
  }

  promptFor(p, i) {
    if (this.menu.has(p) || this.scene || !this.nearSign(p)) return '';
    const k = this.keysFor(i);
    return this.done ? `A Mulatórét: Bilbó ünnepségének emléke: ${k.interact}` : `A Mulatórét: Bilbó ünnepségének előkészületei: ${k.interact}`;
  }

  /* ---------------- the party scene ---------------- */

  /** Starts the party for every free player at the field (QA may call it directly). */
  start() {
    const g = this.game;
    if (this.scene || !this.pending()) return false;
    const viewers = g.players.filter((p) => this.free(p) || this.menu.has(p));
    if (!viewers.length) return false;
    this.menu.clear();
    if (!this.crowd && this.root) {
      this.crowd = new THREE.Mesh(crowdGeometry(), this.figMat);
      this.crowd.name = 'party-guests';
      this.bilbo = new THREE.Mesh(bilboGeometry(), this.figMat);
      this.bilbo.name = 'party-bilbo';
      for (const m of [this.crowd, this.bilbo]) {
        m.visible = false;
        this.root.add(m);
      }
    }
    if (this.crowd) this.crowd.visible = true;
    if (this.bilbo) {
      world(CHAIR.x, CHAIR.seat + 0.03, CHAIR.z, this.bilbo.position);
      this.bilbo.rotation.y = -Math.PI / 2;
      this.bilbo.visible = false;
    }
    this.scene = { steps: this.steps(), k: -1, t: 0, viewers: new Set(viewers), flash: 0, log: [] };
    for (const p of g.players) if (!this.scene.viewers.has(p) && !p.choosing) p.say('A Mulatóréten elkezdődött Bilbó ünnepsége!', 4);
    this.forceMusic('unnep');
    this.next();
    return true;
  }

  /** Holds the viewers side by side at a local spot, looking at a local point. `across` = the side-by-side axis. */
  stage(lx, lz, look, across = [0, 1]) {
    const S = this.scene;
    S.hold = [...S.viewers].map((p, k, all) => {
      const o = (k - (all.length - 1) / 2) * 0.9;
      return world(lx + across[0] * o, 0.05, lz + across[1] * o);
    });
    S.look = look;
    [...S.viewers].forEach((p, k) => {
      p.pos.copy(S.hold[k]);
      p.vel.set(0, 0, 0);
    });
  }

  steps() {
    const bilboHead = () => world(CHAIR.x, CHAIR.seat + 1.0, CHAIR.z);
    const burst = new THREE.Vector3(LAUNCH.x, 30, LAUNCH.z);
    const sky = () => this.stage(0, -11.6, burst.clone(), [1, 0]);
    const tent = () => this.stage(-11.2, 0, bilboHead().setY(1.9));
    const near = () => this.stage(-7.7, 0, bilboHead());
    return [
      {
        title: 'Alkonyat a Mulatóréten',
        text: 'Leszáll az alkony. A Mulatófa ágain lámpások égnek, a nagy sátor alatt a hosszú asztaloknál gyűlnek a vendégek: Zsákosok és Tukok, Borbakok és még sokan mások az egész Megyéből.',
        enter: tent,
      },
      {
        title: 'Gandalf tűzijátéka',
        text: 'Gandalf rakétái szállnak fel: mint a szikrázó madárrajok, zöld, piros, arany és ezüst csillagok hullanak a sötétedő égből.',
        dur: 7.5,
        enter: () => {
          sky();
          this.volley();
        },
      },
      {
        title: 'A sárkány',
        text: 'Végül egy hatalmas vörös-arany sárkány tűnik fel az égen, zúgva elhúz a fejük fölött, és messze a domb mögött szétrobban. Ez a jel a vacsorára.',
        dur: 7.5,
        enter: () => {
          sky();
          this.scene.log.push('dragon');
          const look = world(0, 1.6, -11.6);
          this.game.exits?.startShow?.({ x: LAUNCH.x, z: LAUNCH.z, toward: look });
        },
      },
      {
        title: 'Vacsora',
        text: 'A vendégek nekilátnak a lakomának; a konyhából egymás után hordják a tálakat. Aztán Bilbó feláll.',
        dur: 5.5,
        enter: near,
      },
      {
        title: 'Bilbó beszéde',
        text: 'Bilbó felállt a székére a Mulatófa alatt. „Kedves Zsákosok és Boffinok, kedves Tukok és Borbakok, és mindnyájan!” Ma tölti be a száztizenegyedik évét, és azt mondja, ez túl rövid idő ilyen derék hobbitok között.',
        enter: () => {
          near();
          if (this.bilbo) this.bilbo.visible = true;
          this.scene.log.push('speech');
        },
      },
      {
        title: 'Bilbó beszéde',
        text: 'Aztán valami olyasmit mond, hogy a felüket sem ismeri olyan jól, mint szeretné, és a felüknél kevesebbet kedvel annyira, amennyire megérdemelnék. A vendégek még azon törik a fejüket, dicséret volt-e ez.',
      },
      {
        title: 'Bilbó búcsúja',
        text: '„Ennyi volt. Elmegyek. Most rögtön. Isten veletek!”',
        dur: 4.5,
      },
      {
        title: 'Bilbó eltűnt!',
        text: 'Vakító villanás — és Bilbó nincs sehol. Az üres szék ott áll a Mulatófa alatt; a vendégek szóhoz sem jutnak.',
        dur: 6,
        enter: () => this.vanish(),
      },
      {
        title: 'Az ünnepség emléke',
        text: 'Az ünnepség híre bejárja az egész Megyét. Gandalf egyik régi tűzijátéka megmaradt: emlékül a zsáklaki mathom-szoba vitrinjébe kerül.',
        dur: 6,
      },
    ];
  }

  /** A volley of Gandalf's rockets south of the field (the shared spark cloud of exits.js, no new draw call). */
  volley() {
    const C = [[1, 0.25, 0.15], [0.35, 1, 0.3], [1, 0.82, 0.3], [0.9, 0.92, 1], [0.4, 0.55, 1]];
    for (let k = 0; k < 7; k++) {
      this.rockets.push({ x: LAUNCH.x + (k - 3) * 6 + (Math.random() - 0.5) * 3, z: LAUNCH.z + (Math.random() - 0.5) * 8, t: -k * 0.75, top: 20 + Math.random() * 9, c: C[k % C.length], burst: false });
    }
  }

  updateRockets(dt) {
    const ex = this.game.exits;
    if (!ex?.spark || !this.rockets.length) return;
    for (const r of this.rockets) {
      r.t += dt;
      if (r.t < 0) continue;
      const climb = 0.9;
      if (r.t < climb) {
        const y = 1 + (r.top - 1) * (r.t / climb) ** 0.8;
        for (let k = 0; k < 3; k++) ex.spark(r.x, y, r.z, (Math.random() - 0.5), -1 - Math.random(), (Math.random() - 0.5), 0.45, [1, 0.8, 0.45], 0.96);
      } else if (!r.burst) {
        r.burst = true;
        if (Math.random() < 0.5) ex.sound?.('bang');
        for (let k = 0; k < 150; k++) {
          const a = Math.random() * Math.PI * 2;
          const b = Math.acos(Math.random() * 2 - 1);
          const v = 7 + Math.random() * 4;
          ex.spark(r.x, r.top, r.z, Math.sin(b) * Math.cos(a) * v, Math.cos(b) * v, Math.sin(b) * Math.sin(a) * v, 1.4 + Math.random() * 0.9, r.c, 0.95);
        }
      }
    }
    this.rockets = this.rockets.filter((r) => !r.burst);
  }

  /** The flash: every viewer's view goes white and clears; Bilbo is gone, the chair empty. */
  vanish() {
    const S = this.scene;
    S.flash = PARTY.flash;
    S.log.push('vanish');
    if (this.bilbo) this.bilbo.visible = false;
    const ex = this.game.exits;
    if (ex?.spark) {
      const at = world(CHAIR.x, CHAIR.seat + 0.6, CHAIR.z);
      for (let k = 0; k < 60; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = 1 + Math.random() * 2.5;
        ex.spark(at.x, at.y, at.z, Math.cos(a) * v, 0.5 + Math.random() * 2, Math.sin(a) * v, 0.5 + Math.random() * 0.5, [1, 1, 0.92], 0.9);
      }
    }
    ex?.sound?.('bang');
  }

  next() {
    const S = this.scene;
    S.k++;
    S.t = 0;
    const st = S.steps[S.k];
    if (!st) {
      this.finish(false);
      return;
    }
    st.enter?.();
  }

  sceneInput(p, i, it) {
    const S = this.scene;
    if (!S.viewers.has(p)) return false;
    const st = S.steps[S.k];
    if (S.t > PARTY.stepMin && st) {
      if (it.backPressed) {
        this.finish(true);
        return true;
      }
      if (it.confirmPressed || it.interactPressed || it.digPressed) this.next();
    }
    const T = this.scene;
    if (!T) return true;
    const k = [...T.viewers].indexOf(p);
    if (T.hold && k >= 0) p.pos.copy(T.hold[k % T.hold.length]);
    p.vel.set(0, 0, 0);
    if (T.look) {
      const e = p.eye(v1);
      const yaw = Math.atan2(-(T.look.x - e.x), -(T.look.z - e.z));
      const pitch = Math.atan2(T.look.y - e.y, Math.hypot(T.look.x - e.x, T.look.z - e.z));
      const kk = Math.min(1, (this.lastDt || 1 / 60) * 4 + 0.05);
      p.yaw += wrapA(yaw - p.yaw) * kk;
      p.pitch += (clamp(pitch, -1.2, 1.2) - p.pitch) * kk;
    }
    return true;
  }

  runScene(dt) {
    const S = this.scene;
    S.t += dt;
    for (const p of [...S.viewers]) if (!this.game.players.includes(p) || p.dead > 0) S.viewers.delete(p);
    if (!S.viewers.size) {
      this.finish(true);
      return;
    }
    if (S.flash > 0) {
      S.flash = Math.max(0, S.flash - dt);
      const hold = 0.22; // s of full white, then it clears
      const f = S.flash > PARTY.flash - hold ? 1 : (S.flash / (PARTY.flash - hold)) ** 1.5;
      for (const p of S.viewers) {
        p.fadeColor = '#fff';
        p.fade = f;
      }
      if (S.flash <= 0) for (const p of S.viewers) { p.fade = 0; p.fadeColor = null; }
    }
    const st = S.steps[S.k];
    if (S.t >= (st?.dur || PARTY.step)) this.next();
  }

  /** Ends the party (also skipped): Bilbo gone, the guests leave, the last stage's benefit, the memento, a save. */
  finish(skipped) {
    const S = this.scene;
    if (!S) return;
    this.scene = null;
    for (const p of S.viewers) {
      if (S.flash > 0 || p.fadeColor === '#fff') {
        p.fade = 0;
        p.fadeColor = null;
      }
    }
    if (this.crowd) this.crowd.visible = false;
    if (this.bilbo) this.bilbo.visible = false;
    this.rockets.length = 0;
    this.done = true;
    this.lastSkipped = skipped;
    const last = STAGES[STAGES.length - 1];
    this.shire.mathoms.addRep(last.rep, 'Bilbó ünnepsége');
    const t = FIND_TYPES.find((f) => f.id === PARTY.trophy);
    const added = this.game.bagEnd?.addTrophy?.(t || { id: PARTY.trophy, color: 0xc83a3a });
    for (const p of this.game.players) {
      if (p.choosing) continue;
      p.say(`Bilbó ünnepsége véget ért. A Zöld Sárkány árai olcsóbbak, felvásárlása jobb lett${added ? ', és Gandalf régi tűzijátéka a mathom-szobába került' : ''}.`, 6);
      this.since.set(p, 0);
    }
    this.forceMusic(null);
    this.drawUi(true);
    this.game.saveNow?.();
  }

  /** Switches the music at once (as finale/index.js forceMusic; Music.update would wait 10 s). */
  forceMusic(name) {
    const m = this.game.music;
    if (!m || !m.started) return;
    const sit = name || this.game.musicSituation?.();
    if (!sit) return;
    m.wanted = sit;
    m.wantedT = 0;
    m.switchTo?.(sit);
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.lastDt = dt;
    this.sync();
    // Bench pages draw the field only with `?party=N` (or `force`), so their draw counts stay comparable to before.
    if (this.mesh) {
      const show = this.enabled || this.benchStages != null;
      if (this.mesh.visible !== show) this.mesh.visible = show;
      const glow = show && this.built > 0;
      if (this.glowMesh.visible !== glow) this.glowMesh.visible = glow;
    }
    if (this.scene) {
      this.runScene(dt);
      this.updateRockets(dt);
      this.drawUi();
      return;
    }
    if (!this.enabled) {
      if (this.ui.size) this.drawUi(true);
      return;
    }
    this.slowT += dt;
    if (this.slowT >= 0.25) {
      const step = this.slowT;
      this.slowT = 0;
      this.slow(step);
      if (!this.menu.size) this.drawUi(); // the prompt: 4 times a second is enough
    }
    if (this.menu.size) this.drawUi(); // an open menu follows every press
  }

  /** Every 0.25 s: the first hint, the party's start at dusk, the call to the field. */
  slow(step) {
    const g = this.game;
    if (this.stages === 0 && g.money >= this.price(0, g.players[0])) {
      for (const p of g.players) {
        if (p.choosing) continue;
        this.shire.hint(p, 'party', `<b style="${GOLD}">Bilbó ünnepségre készül.</b> A Mulatóréten, a Mulatófánál (a dűlőút végén, a gödörtől délnyugatra) a tábla előtt a használat gombbal rendezheted be: a nagy sátor, asztalok és konyha, ajándékok, Gandalf tűzijátéka, végül az ünnepség. Minden rész drágább, és tartós előnyt ad: hírnevet, jobb árakat, több vevőt.`);
      }
    }
    if (!this.pending() || this.finaleBusy() || g.homeEvents?.scene) return;
    let ready = false;
    for (const p of g.players) {
      const t = this.free(p) ? (this.since.get(p) || 0) + step : 0;
      this.since.set(p, t);
      if (t >= PARTY.settle) ready = true;
    }
    if (!this.inDusk()) return;
    if (ready) {
      this.start();
      return;
    }
    const day = g.dayClock?.day?.() ?? 1;
    if (this.noticeDay !== day) {
      this.noticeDay = day;
      for (const p of g.players) if (!p.choosing) p.say('Alkonyodik: a Mulatóréten kezdődik Bilbó ünnepsége. Gyertek a Mulatófához!', 5);
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
    if (!document.getElementById('party-style')) {
      const st = document.createElement('style');
      st.id = 'party-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    if (u) for (const e of [u.prompt, u.menu, u.cap]) e.remove();
    const mk = (cls) => {
      const d = document.createElement('div');
      d.className = cls;
      el.appendChild(d);
      return d;
    };
    u = { root: el, prompt: mk('party-prompt'), menu: mk('party-menu'), cap: mk('party-cap'), pText: null, mSig: null, cHtml: null };
    this.ui.set(p, u);
    return u;
  }

  /** Writes each player's prompt, menu and scene caption when they changed (`clear`: hide all). */
  drawUi(clear = false) {
    const g = this.game;
    g.players.forEach((p, i) => {
      const prompt = clear || !this.enabled ? '' : this.promptFor(p, i);
      const m = clear ? null : this.menu.get(p);
      const S = clear ? null : this.scene;
      const st = S && S.viewers.has(p) ? S.steps[S.k] : null;
      if (!prompt && !m && !st && !this.ui.has(p)) return;
      const u = this.uiFor(i, p);
      if (!u) return;
      if (!prompt && !m && !st && !u.pText && !u.mSig && !u.cHtml) return; // nothing shown, nothing to show
      const k = m || st ? this.keysFor(i) : null;
      if (prompt !== u.pText) {
        u.pText = prompt;
        u.prompt.innerHTML = prompt;
        u.prompt.style.display = prompt ? 'block' : 'none';
      }
      const rows = m ? this.rows(p) : null;
      const sig = m ? `${m.sel}|${this.stages}|${this.done}|${g.money}|${this.inDusk()}|${k.nav}|${g.players.length}` : '';
      if (sig !== u.mSig) {
        u.mSig = sig;
        u.menu.style.display = m ? 'block' : 'none';
        if (m) u.menu.innerHTML = this.menuHtml(p, m, rows, k);
      }
      const html = st ? `<div class="party-cap-t">${st.title}</div>${st.text}<div class="party-cap-k">${k.confirm} tovább · ${k.back} kihagyás</div>` : '';
      if (html !== u.cHtml) {
        u.cHtml = html;
        u.cap.innerHTML = html;
        u.cap.style.display = html ? 'block' : 'none';
      }
    });
  }

  menuHtml(p, m, rows, k) {
    const sel = rows[m.sel] || rows[0];
    const list = rows.map((r, j) => {
      const cls = ['party-row', j === m.sel ? 'sel' : '', r.state === 'done' ? 'done' : '', r.state === 'locked' || (r.k == null && !r.ok && !r.close) ? 'locked' : ''].filter(Boolean).join(' ');
      const icon = r.k != null ? `<svg viewBox="0 0 32 32">${ICONS[r.k]}</svg>` : '<svg viewBox="0 0 32 32"></svg>';
      return `<div class="${cls}">${icon}<span>${r.label}</span>${r.price ? `<span class="party-price">${r.price}</span>` : ''}</div>`;
    }).join('');
    const desc = sel.k != null ? `${sel.desc}<br><b>Előny:</b> ${sel.gain}.` : sel.desc;
    const coop = this.game.players.length > 1 ? ` · ketten: az árak ×${COOP.price}` : '';
    return `<h3>A Mulatórét</h3><div class="party-sub">Zsákos Bilbó száztizenegyedik születésnapja${this.done ? ' · megtartották' : ''}</div>`
      + `<div class="party-purse">Közös erszény: ${this.game.money} arany${coop}</div>${list}<div class="party-desc">${desc}</div>`
      + `<div class="party-keys">${k.nav}<span>választás</span><i>·</i>${k.confirm}<span>${sel.k != null ? 'megrendelés' : 'tovább'}</span><i>·</i>${k.back}<span>bezárás</span></div>`;
  }

  /* ---------------- save (inside the Shire's save as `p`) ---------------- */

  /** { s: stages bought, d?: 1 when the party was held }, or undefined with nothing bought. */
  state() {
    if (!this.stages) return undefined;
    return this.done ? { s: this.stages, d: 1 } : { s: this.stages };
  }

  restore(s) {
    this.stages = clamp(Math.round(+s?.s) || 0, 0, STAGES.length);
    this.done = !!s?.d && this.stages >= STAGES.length;
    this.menu.clear();
    if (this.scene) {
      this.scene = null;
      if (this.crowd) this.crowd.visible = false;
      if (this.bilbo) this.bilbo.visible = false;
    }
    this.sync();
  }
}
