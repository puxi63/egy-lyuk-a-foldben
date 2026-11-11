/* ==== ui/screens.js — the full-screen themed screens over the game (TERV 0.12; NOTES-21-screens) ====
 *   - the pause: Bilbo's armchair before the fire, the pipe beside it, the menu on the pages of an open book;
 *   - the settings: Bilbo's writing desk (ui/settings.js);
 *   - the credits: Bilbo's drawings scrolling by (ui/credits.js);
 *   - NOTES-25-map-contract: the map in the style of Thrór's map with the moon letters (ui/map.js), the open sack and
 *     the mathom room's book (ui/collection.js). The map also opens with its own key in free play (input.js
 *     `mapPressed`: B, the F2 player's Ú, a pad's left-stick click) and from Bag End's Thrór's map (openMap).
 *
 * The pause is SHARED: both players look at one screen, and in co-op a pause that froze only one half would leave the
 * other player's world (goblins, falls, the Versengés clock) running while the first one is in the menu. So Esc or a
 * pad's Start (Menu) freezes the whole game for both; either player can move through the book (merged input), and the
 * one who opened it gets the contract scroll from "Szerződés" (and his bag from "Zsák").
 *
 * Opening: Esc / Start only in free play — not on the title, not on a frame after which the player had a menu open
 * (Esc keeps closing the shop, the journal, the minigames as before: it is their back key), not on the frame a pad got
 * bound (Start also joins / takes a pad). Losing the pointer lock in free play (the browser's own Esc, switching
 * windows) opens it too.
 *
 * While a screen is up `frame()` returns true and game.js skips the simulation and the drawing (the canvas keeps the
 * last picture; the terrain load alone carries on). Hidden, every screen is display:none: no per-frame cost. ==== */
import { LAYER_NAMES, layerAtDepth } from '../materials.js';
import { BagView, CollectionView } from './collection.js';
import { CreditsView } from './credits.js';
import { HandbookView } from './handbook.js';
import { SKIP_KEY } from '../input.js';
import { MapView } from './map.js';
import { applySettings, SettingsView } from './settings.js';
import { SkillsView } from '../xp/view.js'; // NOTES-41-xp
import { Wheel } from '../wheel/index.js'; // NOTES-43-wheel
import { PickupPanel } from './pickup.js'; // NOTES-44-pickup-edge

/** The fire, the armchair, the pipe: the pause's room as one inline SVG (built once). */
const ROOM = `<svg class="room" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="ps-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a170c"/><stop offset="1" stop-color="#4a2c16"/></linearGradient>
    <linearGradient id="ps-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2210"/><stop offset="1" stop-color="#140a04"/></linearGradient>
    <radialGradient id="ps-fireglow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb648" stop-opacity=".75"/><stop offset=".45" stop-color="#ff7a20" stop-opacity=".28"/><stop offset="1" stop-color="#ff5a10" stop-opacity="0"/></radialGradient>
    <linearGradient id="ps-chair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a2a1c"/><stop offset=".6" stop-color="#4e1810"/><stop offset="1" stop-color="#2a0c06"/></linearGradient>
    <linearGradient id="ps-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a5a48"/><stop offset="1" stop-color="#3a3026"/></linearGradient>
    <radialGradient id="ps-vig" cx="40%" cy="60%" r="80%"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#ps-wall)"/>
  <g stroke="#1e1008" stroke-width="4" opacity=".7"><path d="M0 120h1600M0 600h1600"/><path d="M120 120v480M330 120v480M1180 120v480M1400 120v480"/></g>
  <rect y="600" width="1600" height="300" fill="url(#ps-floor)"/>
  <g stroke="#1a0c04" stroke-width="3" opacity=".6"><path d="M0 660h1600M0 740h1600M0 840h1600"/></g>
  <!-- the room's left half: the book covers the right (x shifted so the fire and the chair stay in view) -->
  <g transform="translate(-250 0)">
  <circle cx="560" cy="560" r="520" fill="url(#ps-fireglow)" class="ps-glow"/>
  <!-- the fireplace: stone surround, round-topped opening, mantel with a clock and candlesticks -->
  <path d="M330 640V300h460v340z" fill="url(#ps-stone)" stroke="#221a12" stroke-width="5"/>
  <g stroke="#2a2018" stroke-width="3" opacity=".7" fill="none"><path d="M330 360h460M330 430h460M330 500h460M330 570h460"/><path d="M400 300v60M520 300v60M640 300v60M760 300v60M360 360v70M480 360v70M600 360v70M720 360v70M420 430v70M560 430v70M700 430v70"/></g>
  <path d="M410 640V470c0-80 300-80 300 0v170z" fill="#120804" stroke="#221a12" stroke-width="6"/>
  <path d="M300 300h520v-26H300z" fill="#5a3a1e" stroke="#1e1008" stroke-width="4"/>
  <path d="M520 274v-50h80v50M530 234c0-30 60-30 60 0" fill="#3a2410" stroke="#1e1008" stroke-width="3"/><circle cx="560" cy="246" r="14" fill="#e8d8b0" stroke="#1e1008" stroke-width="2"/><path d="M560 246v-9M560 246l6 4" stroke="#1e1008" stroke-width="2"/>
  <path d="M380 274v-40M740 274v-40M372 274h16M732 274h16" stroke="#c8a04a" stroke-width="5"/><path d="M380 234v-14M740 234v-14" stroke="#efe4c8" stroke-width="7"/>
  <!-- the fire -->
  <g class="ps-fire">
    <path d="M450 630c30-14 190-14 220 0" stroke="#3a1a08" stroke-width="16" stroke-linecap="round"/>
    <path d="M470 618l170-20M480 600l160 26" stroke="#4a2410" stroke-width="14" stroke-linecap="round"/>
    <path class="fl f1" d="M480 610c-10-60 30-80 20-140 40 40 50 80 40 140z" fill="#ff8a24"/>
    <path class="fl f2" d="M530 612c-14-80 40-110 30-180 50 60 60 120 40 180z" fill="#ffb03a"/>
    <path class="fl f3" d="M590 610c-6-50 26-70 20-120 34 34 40 76 30 120z" fill="#ff9a2a"/>
    <path class="fl f4" d="M545 612c-4-40 16-60 14-100 24 30 30 64 22 100z" fill="#ffe08a"/>
  </g>
  </g>
  <g transform="translate(-330 0)">
  <!-- the rug -->
  <ellipse cx="760" cy="780" rx="520" ry="80" fill="#5a2418" stroke="#2a0c06" stroke-width="5"/>
  <ellipse cx="760" cy="780" rx="460" ry="60" fill="none" stroke="#c8a04a" stroke-width="3" stroke-dasharray="18 10" opacity=".7"/>
  <!-- the armchair, seen from behind and to the side, facing the fire -->
  <path d="M780 820c-10-120 0-300 40-380 30-60 160-60 190 0 30 70 40 260 30 380z" fill="url(#ps-chair)" stroke="#1a0604" stroke-width="5"/>
  <path d="M760 830c-30-80-30-200 0-250 30-20 60-10 70 30 10 70 10 160 0 220z" fill="#5e1e14" stroke="#1a0604" stroke-width="5"/>
  <path d="M1000 830c20-60 30-170 10-230-20-30-50-20-60 20-10 70-10 150 0 210z" fill="#4a160e" stroke="#1a0604" stroke-width="5"/>
  <g fill="#c8a04a"><circle cx="830" cy="470" r="4"/><circle cx="880" cy="440" r="4"/><circle cx="930" cy="440" r="4"/><circle cx="980" cy="470" r="4"/></g>
  <path d="M790 830l-10 30M1010 830l10 30" stroke="#2a1006" stroke-width="12" stroke-linecap="round"/>
  <!-- the little table beside it (on the fire's side) with the pipe and a cup -->
  <g transform="translate(-440 30)">
  <path d="M1080 690h150l-10 16h-130z" fill="#6a4424" stroke="#1e1008" stroke-width="4"/>
  <path d="M1100 706l-12 130M1210 706l12 130" stroke="#3a2210" stroke-width="10" stroke-linecap="round"/>
  <path d="M1100 678c40-10 80-8 108-4" stroke="#7a5230" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M1200 660c-2 12 2 20 14 20s16-8 14-20z" fill="#4a2a14" stroke="#1e1008" stroke-width="3"/>
  <path class="ps-smoke" d="M1214 656c-10-16 10-24 0-40s10-24 0-40" fill="none" stroke="#bdb6aa" stroke-width="3" stroke-linecap="round" opacity=".5"/>
  <path d="M1124 690v-22c0-6 26-6 26 0v22" fill="#e8dcc0" stroke="#5a4a30" stroke-width="3"/><path d="M1150 672c10 0 10 12 0 12" fill="none" stroke="#5a4a30" stroke-width="3"/>
  </g>
  </g>
  <rect width="1600" height="900" fill="url(#ps-vig)"/>
</svg>`;

/** The intent fields every screen reads (merged over all players). */
const MERGED = ['upPressed', 'downPressed', 'leftPressed', 'rightPressed', 'confirmPressed', 'backPressed', 'pausePressed', 'mapPressed', 'skipTrackPressed'];

/** The pause menu's items (ids are stable for QA). */
const ITEMS = [
  { id: 'resume', label: 'Folytatás', note: 'vissza a gödörbe' },
  // NOTES-25-map-contract: the map, the contract scroll (the journal's id kept), the bag, the collection.
  { id: 'map', label: 'Térkép', note: 'Thrór térképének módjára' },
  { id: 'journal', label: 'Szerződés', note: 'Bilbó végtelen szerződéstekercse' },
  { id: 'bag', label: 'Zsák', note: 'mi lapul benne' },
  // NOTES-41-xp: the characters' experience and skills (both players' sheets).
  { id: 'skills', label: 'Képességek', note: 'tapasztalat és képességpontok' },
  { id: 'collection', label: 'Gyűjtemény', note: 'a mathom-szoba trófeái' },
  // NOTES-31-handbook: Bilbo's handbook, the searchable guide.
  { id: 'handbook', label: 'Kézikönyv', note: 'Bilbó jegyzetei: mi mire való' },
  { id: 'settings', label: 'Beállítások', note: 'Bilbó íróasztala' },
  // NOTES-30-music: the next music track (the note shows the key / button; the result goes to the page's message line).
  { id: 'nexttrack', label: 'Következő zeneszám', note: 'Z billentyű · kontrolleren LB + View' },
  { id: 'title', label: 'Kilépés a címhez', note: '' },
];

export class Screens {
  constructor(game) {
    this.game = game;
    this.enabled = !game.bench;
    this.view = null; // 'pause' | 'settings' | 'credits' | 'map' | 'bag' | 'collection' | 'handbook' | null
    this.subBack = null; // NOTES-25: where the map / bag / collection return ('pause', or null: back to the game)
    this.titleUp = true; // main.js clears it when the title's choice starts the game
    this.menuWas = []; // per player: was a menu holding him after the last frame
    this.padWas = []; // per player: the pad bound to him last frame
    this.skip = 0; // frames of input to ignore after a screen opens (the key that opened it)
    this.quietUntil = 0; // and the time until which it is ignored
    this.opener = 0; // the player who opened the pause
    this.sel = 0;
    this.reload = () => location.reload(); // QA replaces it
    // NOTES-43-wheel: the action wheel reads each player's intent first thing (watch() below).
    game.wheel = new Wheel(game);
    let root = document.getElementById('screens');
    if (!root) {
      root = document.createElement('div');
      root.id = 'screens';
      document.body.appendChild(root);
    }
    this.root = root;
    applySettings(game);
    if (!this.enabled) return;
    // The pause.
    this.pauseEl = document.createElement('div');
    this.pauseEl.className = 'scr scr-pause';
    this.pauseEl.innerHTML = `${ROOM}
      <div class="pbook">
        <div class="ppage left">
          <h2>Szünet</h2>
          <p class="pp-lead">Bilbó leül a karosszékbe, rágyújt a pipájára. Odakint minden megáll, amíg fel nem áll.</p>
          <div class="pp-who"></div>
          <p class="pp-keys"></p>
        </div>
        <div class="ppage right">
          <ol class="pitems">${ITEMS.map((it) => `<li data-id="${it.id}"><b>${it.label}</b><small>${it.note}</small></li>`).join('')}</ol>
          <p class="pp-msg"></p>
        </div>
      </div>`;
    root.appendChild(this.pauseEl);
    this.itemEls = [...this.pauseEl.querySelectorAll('.pitems li')];
    this.itemEls.forEach((li, i) => {
      li.addEventListener('mouseenter', () => this.select(i));
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(i);
        this.choose(ITEMS[i].id);
      });
    });
    // The settings and the credits.
    const sEl = document.createElement('div');
    root.appendChild(sEl);
    this.settings = new SettingsView(game, sEl);
    const cEl = document.createElement('div');
    root.appendChild(cEl);
    this.credits = new CreditsView(game, cEl);
    this.credits.onEnd = () => {
      if (this.view === 'credits') this.close(this.creditsBack);
    };
    // NOTES-25-map-contract: the map, the bag, the collection (filled only when shown).
    const mk = () => root.appendChild(document.createElement('div'));
    this.map = new MapView(game, mk());
    this.bag = new BagView(game, mk());
    this.collection = new CollectionView(game, mk());
    this.handbook = new HandbookView(game, mk()); // NOTES-31-handbook: empty until opened
    this.skills = new SkillsView(game, mk()); // NOTES-41-xp: empty until opened
    // NOTES-44-pickup-edge: the pickup filter's toggles, a strip over the bottom of the Zsák screen (each player his own).
    this.pickup = new PickupPanel(game, mk());
    this.bag.el.classList.add('has-pk');
    // Losing the pointer lock in free play (the browser's Esc, another window) pauses too.
    this.hadLock = false;
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === game.canvas) {
        this.hadLock = true;
        return;
      }
      if (!this.hadLock) return;
      this.hadLock = false;
      const i = game.bindings.findIndex((b) => b.kbm === 'mouse');
      if (i >= 0 && !this.titleUp && !this.view && !this.menuWas[i]) this.openPause(i);
    });
  }

  /** True while a screen holds the game. */
  get busy() {
    return !!this.view;
  }

  /** The credits' music while they play (game.js asks before its own situation). */
  musicSituation() {
    return this.view === 'credits' ? 'stablista' : null;
  }

  /**
   * game.frame(), right after the input poll: while a screen is up, every player's input drives it and the game is
   * frozen (returns true). Returns false when no screen is up.
   */
  frame() {
    if (!this.view) return false;
    const g = this.game;
    const shared = g.bindings.some((x) => x.kbm === 'keys2');
    const it = {};
    const merge = (one) => {
      for (const k of MERGED) it[k] ||= one[k];
    };
    // Every keyboard binding, and every connected pad (on the title a pad may not be bound to anyone yet).
    g.bindings.forEach((b) => b.kbm && merge(g.input.intent(b.kbm, null, shared)));
    for (const idx of g.input.frame?.pads.keys() || []) merge(g.input.intent(null, idx, shared));
    g.bindings.forEach((b, i) => (this.padWas[i] = b.pad));
    // The key that opened a screen is not read by it: one frame, and 0.25 s (the browser's own Esc that ends the pointer
    // lock may arrive as a key event after the lock change already opened the pause).
    if (this.skip > 0 || performance.now() < this.quietUntil) {
      this.skip = Math.max(0, this.skip - 1);
      return true;
    }
    // NOTES-30-music: the skip key / pad chord works on every screen too (the music carries on while frozen).
    if (it.skipTrackPressed || g.input.pressed.has(SKIP_KEY)) this.skipTrack();
    if (this.view === 'pause') this.pauseInput(it);
    else if (this.view === 'settings') this.settings.input(it);
    else if (this.view === 'credits') this.credits.input(it);
    else if (this.view === 'map') this.map.input(it);
    else if (this.view === 'bag') {
      this.pickup.input(); // NOTES-44-pickup-edge: every player's own toggle keys first (raw keys / pad X, Y)
      this.bag.input(it);
    }
    else if (this.view === 'collection') this.collection.input(it);
    else if (this.view === 'handbook') this.handbook.input(it);
    else if (this.view === 'skills') this.skills.input(it); // NOTES-41-xp
    return true;
  }

  /**
   * game.frame(), per player after his intent: Esc / Start in free play opens the shared pause. True when it opened
   * (the caller skips that player's frame).
   */
  watch(p, i, it) {
    // NOTES-43-wheel: the action wheel (hold LB / 2 / 9) may freeze the view, slow the walk and, on its release, set the
    // picked slice's own intent flag; a menu or screen held last frame keeps it shut.
    this.game.wheel.step(p, i, it, this.menuWas[i] || !!this.view || this.titleUp);
    const b = this.game.bindings[i];
    const padOk = b.pad == null || this.padWas[i] === b.pad;
    this.padWas[i] = b.pad;
    if (!this.enabled || this.titleUp || this.view || this.menuWas[i] || !padOk) return false;
    if (it.pausePressed) return this.openPause(i);
    // NOTES-25-map-contract: the map key in free play opens the map straight away (Esc / the key again: back to play).
    if (it.mapPressed && !this.game.players[i]?.choosing) return this.openMap(i);
    return false;
  }

  /** game.frame(), per player at the end of his frame: whether a menu held him (Esc then belongs to that menu). */
  after(i, menuOpen) {
    this.menuWas[i] = menuOpen;
  }

  /* ---------------- the pause ---------------- */

  openPause(i = 0) {
    if (!this.enabled || this.view) return false;
    const g = this.game;
    this.opener = Math.max(0, Math.min(i, g.players.length - 1));
    this.view = 'pause';
    this.skip = 1;
    this.quietUntil = performance.now() + 250;
    this.sel = 0;
    this.itemEls.find((li) => li.dataset.id === 'title').querySelector('small').textContent = g.noSave ? 'mentés nélkül' : 'a játék elmentődik';
    this.pauseEl.querySelector('.pp-msg').textContent = '';
    const who = g.players.map((p) => {
      const d = Math.max(0, p.depth || 0);
      const where = d < 1 ? 'a felszínen, Zsáklak körül' : `${d.toLocaleString('hu-HU', { maximumFractionDigits: 0 })} m mélyen · ${LAYER_NAMES[layerAtDepth(d)] || ''}`;
      const lv = p.xp ? ` · ${p.xp.level}. szint` : ''; // NOTES-41-xp
      return `<p><b style="color:${p.ch?.color || '#7a3a10'}">${p.ch?.name || 'Játékos'}</b>${lv}<br><small>${where}</small></p>`;
    }).join('');
    this.pauseEl.querySelector('.pp-who').innerHTML = who;
    const pad = g.bindings.some((b) => b.pad != null);
    this.pauseEl.querySelector('.pp-keys').textContent = `Fel / le: választás · ${pad ? 'A' : 'Enter / Szóköz'}: kiválasztás · ${pad ? 'B / Start' : 'Esc'}: folytatás`;
    this.select(0);
    this.pauseEl.classList.add('on');
    if (document.pointerLockElement) document.exitPointerLock?.();
    return true;
  }

  select(i) {
    this.sel = (i + ITEMS.length) % ITEMS.length;
    this.itemEls.forEach((li, j) => li.classList.toggle('sel', j === this.sel));
  }

  pauseInput(it) {
    if (it.backPressed || it.pausePressed) return this.choose('resume');
    if (it.upPressed) this.select(this.sel - 1);
    if (it.downPressed) this.select(this.sel + 1);
    if (it.confirmPressed) this.choose(ITEMS[this.sel].id);
  }

  /** A pause item. */
  async choose(id) {
    const g = this.game;
    if (this.view !== 'pause' || this.leaving) return;
    if (id === 'resume') this.close();
    else if (id === 'nexttrack') this.skipTrack();
    else if (id === 'settings') {
      this.pauseEl.classList.remove('on');
      this.view = 'settings';
      this.skip = 1;
      this.settings.show(() => {
        this.settings.hide();
        this.view = 'pause';
        this.skip = 1;
        this.pauseEl.classList.add('on');
      });
    } else if (id === 'journal') {
      const p = g.players[this.opener];
      this.close();
      if (p && !p.choosing) g.journal.open(p, p.depth > 0.5 ? layerAtDepth(p.depth) : 0);
    } else if (id === 'map' || id === 'bag' || id === 'collection' || id === 'handbook' || id === 'skills') {
      this.openSub(id, this.opener, 'pause'); // NOTES-25-map-contract
    } else if (id === 'title') {
      this.leaving = true;
      const msg = this.pauseEl.querySelector('.pp-msg');
      msg.textContent = g.noSave ? 'Vissza a címhez…' : 'Bilbó beírja a könyvébe, meddig jutottatok…';
      try {
        await g.saveNow();
      } catch (e) {
        console.warn(e);
      }
      this.leaving = false;
      if (g.modes?.versus) g.modes.versus.toTitle();
      else this.reload();
    }
  }

  /**
   * NOTES-30-music: the next music track from a screen. The pause book's message line and the settings' row say what
   * plays now, or why nothing changed.
   */
  skipTrack() {
    const g = this.game;
    const name = g.skipTrack();
    const m = g.music;
    const line = name ? `Most szól: ${name}`
      : !m?.started ? 'A zene a játék indulásakor szólal meg.'
        : !m.urls?.length ? 'Nincs saját zene az assets/music mappában.'
          : 'Most egyetlen zene szól, nincs mire léptetni.';
    if (this.view === 'pause') this.pauseEl.querySelector('.pp-msg').textContent = line;
    if (this.view === 'settings') this.settings.refresh(name ? null : line);
    return name;
  }

  /* ---------------- NOTES-25-map-contract: the map, the bag, the collection ---------------- */

  /**
   * Opens the map for player i (the map key in free play, or Bag End's Thrór's map: opts.from = 'bagend'); closing it
   * gives the game back. Returns false where screens are off (bench pages) or another screen is up.
   */
  openMap(i = 0, opts = {}) {
    if (!this.enabled || this.view) return false;
    this.opener = Math.max(0, Math.min(i, this.game.players.length - 1));
    this.openSub('map', this.opener, null, opts);
    if (document.pointerLockElement) document.exitPointerLock?.();
    return true;
  }

  /** Shows the map, the bag or the collection; `back` 'pause' returns to the pause book, null to the game. */
  openSub(id, who, back, opts = {}) {
    this.pauseEl.classList.remove('on');
    this.view = id;
    this.subBack = back;
    this.skip = 1;
    this.quietUntil = performance.now() + 250;
    const done = () => this.closeSub();
    if (id === 'map') this.map.show({ ...opts, opener: who }, done);
    else if (id === 'bag') {
      this.bag.show(who, done);
      this.pickup.show(); // NOTES-44-pickup-edge
      this.bag.el.dataset.pk = String(this.pickup.rows().length);
    }
    else if (id === 'handbook') this.handbook.show(who, done, !!this.game.bindings[who]?.kbm); // NOTES-31-handbook
    else if (id === 'skills') this.skills.show(who, done); // NOTES-41-xp
    else this.collection.show(done);
  }

  closeSub() {
    this.map.hide();
    this.bag.hide();
    this.pickup.hide(); // NOTES-44-pickup-edge
    this.collection.hide();
    this.handbook.hide();
    this.skills.hide(); // NOTES-41-xp
    if (this.subBack === 'pause') {
      this.view = 'pause';
      this.skip = 1;
      this.pauseEl.classList.add('on');
    } else this.close();
  }

  /** Closes whatever is up and gives the game back. `back`: where a title-opened screen returns (the title). */
  close(back = null) {
    this.pauseEl?.classList.remove('on');
    this.settings?.hide();
    this.map?.hide();
    this.bag?.hide();
    this.pickup?.hide(); // NOTES-44-pickup-edge
    this.collection?.hide();
    this.handbook?.hide();
    this.skills?.hide(); // NOTES-41-xp
    if (this.view === 'credits') {
      this.view = null;
      this.credits.finish();
    }
    this.view = null;
    if (back) back();
    else if (!this.titleUp) this.game.input.lockPointer();
  }

  /* ---------------- from the title (main.js) ---------------- */

  /** The settings over the title; `back` runs when the desk is left. */
  openSettings(back) {
    if (!this.enabled || this.view) return;
    this.view = 'settings';
    this.skip = 1;
    this.settings.show(() => {
      this.settings.hide();
      this.view = null;
      back?.();
    });
  }

  /**
   * Plays the credits over everything (the title's Stáblista; the finale can call it: queue item 9). The game is
   * frozen while they roll. Resolves when they end or are skipped. opts: see CreditsView.play.
   */
  playCredits(opts = {}, back = null) {
    if (!this.enabled) return Promise.resolve();
    if (this.view === 'pause') this.pauseEl.classList.remove('on');
    if (this.view === 'settings') this.settings.hide();
    this.view = 'credits';
    this.skip = 1;
    this.creditsBack = back;
    const m = this.game.music;
    if (m && !m.started) m.start('stablista');
    return this.credits.play(opts);
  }
}
