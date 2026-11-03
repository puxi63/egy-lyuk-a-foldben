/* ==== game.js — renderer, players, split screen, the frame loop and the bench mode ==== */
import * as THREE from 'three';
import { MAX_PLAYERS, SHOP } from './config.js';
import { Finds } from './finds.js';
import { Hud } from './hud.js';
import { emptyIntent, Input, SKIP_KEY } from './input.js';
import { FIND_TYPES } from './finds.js';
import { preloadCharacters } from './characters.js';
import { CHARACTERS, Player } from './player.js';
import { buildSurface, Ladders, Sacks, SHOP_POS } from './props.js';
import { SurfaceLighting } from './lighting.js';
import { Terrain } from './terrain.js';
import { Decor } from './underground/decor.js';
import { GOBLIN_POINTS, GOBLIN_SITE_PROVIDER } from './underground/goblin-sites.js';
import { ISLAND, LAKE_SITE_PROVIDER, RIDDLE_PLAYER } from './underground/lake-sites.js';
import { mirkFloorAt } from './underground/mirkwood-sites.js';
import { Lift } from './lift.js';
import { Tutorial } from './tutorial.js';
import { BagEnd } from './bagend/index.js';
import { DigFx } from './digfx.js';
import { Exits } from './exits.js';
import { Enemies } from './enemies/index.js';
import { Gollum } from './gollum/index.js';
// The spiders, the Elvenking's guards and the barrel escape of layer 6 (mirkwood-foes/, NOTES-4b-spiders-elves).
import { MirkwoodFoes } from './mirkwood-foes/index.js';
import { MIRKWOOD_SITE_PROVIDER } from './underground/mirkwood-sites.js';
// Beneath Lake-town (layer 7): the rising water, the currents and Bárd the trader (laketown-events/, NOTES-5b-flood-bard).
import { LaketownEvents } from './laketown-events/index.js';
import { LAKETOWN_SITE_PROVIDER, ltFloorAt } from './underground/laketown-sites.js';
// The mines of Erebor (layer 8, NOTES-6a-erebor): the site provider for the puzzles, the hall's floor for the bench.
import { EREBOR_SITE_PROVIDER, HALL as EREBOR_HALL } from './underground/erebor-sites.js';
// Layer 8's puzzles: Durin's Day door (mirrors and the setting sun) and the rune-locked chests (erebor-puzzles/, NOTES-6b).
import { EreborPuzzles } from './erebor-puzzles/index.js';
// The finale: the escape from Smaug, the black arrow, the Eagles, the feast and the epilogue (finale/, NOTES-7b-finale).
import { Finale } from './finale/index.js';
// Smaug's treasury (layer 9, NOTES-7a-hoard): the noise meter, Smaug's behaviour, the dragon-sickness, the Arkenstone.
import { Hoard } from './hoard/index.js';
import { HOARD_SITE_PROVIDER } from './underground/hoard-sites.js';
// journal (NOTES-9-journal): Bilbo's journal, the per-layer collection and objective log.
import { Journal } from './ui/journal.js';
// daynight (NOTES-10-daynight): the shared day clock (on Bag End's play clock), the moon phase, the surface's look by hour.
import { DayClock } from './daynight.js';
// safety (NOTES-11-safety): fall damage, the belay rope, Balin's estimate of the way home.
import { Safety } from './safety/index.js';
// timed-events (NOTES-12-events): goblin night on the day clock, the Sackville-Bagginses' auction during play.
import { TimedEvents } from './timed-events/index.js';
// minigames (NOTES-13-minigames): William's purse, Bullroarer's golf, the plate throwing, the smoke-ring contest.
import { Minigames } from './minigames/index.js';
// home-events (NOTES-14-bagend-events): Gandalf drops in, the Unexpected Party, Bilbo's birthday, Lobelia.
import { HomeEvents } from './home-events/index.js';
// modes (NOTES-15-modes): Kihívás, Versengés, the hired dwarf of single play.
import { Modes } from './modes/index.js';
// shire (NOTES-26-shire): mathoms and the neighbour, the seven meals, the vegetable patch, Bilbo's acorn.
import { Shire } from './shire/index.js';
// screens (NOTES-21-screens): the shared pause, the settings desk, the credits.
import { Screens } from './ui/screens.js';
import { layerAtDepth } from './materials.js';
import { Music } from './audio.js';
import { applyTerrain, changedNear, clearSave, dugVolume, encodeTerrain, rememberBase, snapshot, useSaveSlot, writeSave } from './save.js';
import { START_KEY } from './modes/rules.js';
import { chunkVersion, digSphere, generate } from './world.js';


export class Game {
  /** @param {object|null} save a loaded save (save.js loadSave) to continue, or null for a new game */
  constructor(params, save = null, opts = {}) {
    this.params = params;
    this.bench = params.get('bench');
    this.save = this.bench ? null : save;
    // modes (NOTES-15-modes): the title's choice, else the save's mode; `?mode=` on a bench page (QA). Versengés never
    // loads or writes a save; Kihívás writes to its own slot.
    this.mode = opts.mode || this.save?.mode?.m || (this.bench && params.get('mode')) || 'normal';
    if (this.mode === 'versus') {
      this.save = null;
      this.noSave = true;
    }
    useSaveSlot(this.mode);
    this.split = params.get('split') === 'h' ? 'h' : 'v';
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: params.get('aa') !== '0', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setScissorTest(true);
    this.renderer.info.autoReset = false;
    // Opaque objects front to back (three r160 sorts them by material first, then depth): the near ones fill the depth
    // buffer first, so the hidden fragments behind them are rejected before the (heavy) soil and lawn shading. Only
    // the order changes; every opaque material writes and tests depth (the sky dome is drawn last, on the far plane). Where two
    // surfaces z-fight, the other one may win (about 100 of 1.17 M pixels per frame, NOTES-1f-perf); `?sort=material`
    // keeps three's own order.
    if (params.get('sort') !== 'material') {
      // Kept on the renderer for QA (qa/perf/shots.mjs switches it off and on).
      this.renderer.__sorter = (a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || a.z - b.z || a.material.id - b.material.id || a.id - b.id;
      this.renderer.setOpaqueSort(this.renderer.__sorter);
    }
    this.scene = new THREE.Scene();
    // Sky, sun, hemisphere and fog; per view they follow that player's depth (lighting.js).
    this.lighting = new SurfaceLighting(this.scene);

    // Load flow (NOTES-20-startup): main.js has usually filled the field in workers already (opts.genMs); else here.
    this.stats = { genMs: opts.genMs ?? generate(), genWorkers: opts.genWorkers || 0, digMs: 0, digMax: 0 };
    rememberBase();
    // Goblin-town pass (NOTES-2a): the embedded finds are placed against the generated field, before the save's dug
    // terrain is applied, so their list (and the saved indices into it) no longer shifts with the digging.
    this.finds = new Finds(this.scene);
    if (this.save?.terrainBytes) applyTerrain(this.save.terrainBytes);
    // The one full count of the dug volume (later counts follow the digging, see save.js).
    dugVolume();
    this.terrain = new Terrain(this.scene);
    // The layers' buried pieces, the troll cave, the atmosphere and the co-op doors (underground/).
    // A minimal event bus ({ on, emit }); layer 9 emits 'arkenstone' at the pickup, the finale listens (NOTES-7a-hoard).
    this.events = this.events || (() => { const m = new Map(); return { on: (n, f) => (m.get(n) || m.set(n, []).get(n)).push(f), emit: (n, ...a) => (m.get(n) || []).forEach((f) => f(...a)) }; })();
    this.decor = new Decor(this.scene, this.terrain);
    // Smaug (layer 9): one instance, built with the treasury's decor (underground/hoard-fx.js, src/smaug/; NOTES-7a-hoard).
    this.smaug = this.decor.hoardFx?.smaug || null;
    if (this.save?.coop) this.decor.coop.restore(this.save.coop);
    // The stone giants' slabs in Goblin-town, open or shut (underground/stone-giants.js, NOTES-3a-lake).
    this.decor.giants?.restore(this.save?.giants);
    // The roots of Mirkwood: the feast clearings' found treasures (underground/mirkwood-fx.js, NOTES-4a-mirkwood).
    this.decor.mirkFx?.restore(this.save?.mirkwood);
    // Beneath Lake-town: the Master's hoard chest opened or not (underground/laketown-fx.js, NOTES-5a-laketown).
    this.decor.laketownFx?.restore(this.save?.laketown);
    // The mines of Erebor: the mithril shirt taken or not (underground/erebor-fx.js, NOTES-6a-erebor).
    this.decor.ereborFx?.restore(this.save?.erebor);
    this.decor.coop.onOpen = (id, players) => this.coopReward(id, players);
    this.intents = [];
    // The barrel lift between the layers (TERV 0.4 "Gyorsutazás").
    this.lift = new Lift(this.scene);
    this.lift.restore(this.save?.lift);
    // Clods, sparks and sounds of every swing.
    this.digfx = new DigFx(this.scene);
    // The opening tutorial (one goal at a time, per player).
    this.tutorial = new Tutorial(this);
    this.tutorial.restore(this.save?.tutorial);
    this.surface = buildSurface(this.scene, this.terrain.detail);
    this.ladders = new Ladders(this.scene);
    // Goblin-town's own ladders are climbable (not saved; NOTES-2a).
    for (const l of this.decor.fixedLadders || []) this.ladders.addFixed(l);
    this.decor.mute = !!this.bench;
    this.sacks = new Sacks(this.scene);
    this.exits = new Exits(this);
    // Goblins, drive-off combat, Sting and the armour rows (enemies/, NOTES-2b-goblins). Goblins are not saved.
    this.enemies = new Enemies(this);
    // Goblin-town's walkable points, tunnel mouths and inside test (underground/goblin-sites.js, NOTES-2a).
    this.enemies.sites?.use?.(GOBLIN_SITE_PROVIDER);
    // Gollum, the riddle game and the Ring (gollum/, NOTES-3b-gollum) at Gollum's lake (underground/lake-sites.js).
    this.gollum = new Gollum(this);
    this.gollum.sites.use(LAKE_SITE_PROVIDER);
    this.gollum.restore(this.save?.gollum);
    // Spiders, elf guards, cells and barrels (mirkwood-foes/, NOTES-4b) on layer 6's points; its webs, cell doors and
    // trapdoor hatch are drawn by underground/mirkwood-fx.js, which the foes open and cut (`fx`).
    this.mirkFoes = new MirkwoodFoes(this);
    // The guard's keys lie on the butler's table in the cellar (book ch. 9; the table is in mirkwood-pieces.js).
    this.mirkFoes.sites.use({ ...MIRKWOOD_SITE_PROVIDER, fx: this.decor.mirkFx, keys: MIRKWOOD_SITE_PROVIDER.keys || { x: -0.3, y: -345.2, z: 7.4 } });
    this.mirkFoes.restore(this.save?.mirkFoes);
    // Layer 7's events on the world work's LAKETOWN_SITE_PROVIDER (underground/laketown-sites.js) and its effects module
    // (underground/laketown-fx.js draws the flood surfaces: setFloodLevel).
    this.laketownEvents = new LaketownEvents(this);
    this.laketownEvents.sites.use({ ...LAKETOWN_SITE_PROVIDER, fx: this.decor.laketownFx || null });
    this.laketownEvents.restore(this.save?.laketownEvents);
    // Erebor's puzzles on the world work's EREBOR_SITE_PROVIDER (underground/erebor-sites.js; erebor-fx.js draws the door,
    // the ray and the chests). NOTES-6b-erebor-puzzles.
    this.ereborPuzzles = new EreborPuzzles(this);
    // (NOTES-6a-erebor) The world work's provider and effects, as for Lake-town's events.
    this.ereborPuzzles.sites?.use?.({ ...EREBOR_SITE_PROVIDER, fx: this.decor.ereborFx || null });
    this.ereborPuzzles.restore(this.save?.ereborPuzzles);
    // ---- finale (NOTES-7b-finale) ----
    this.finale = new Finale(this);
    this.finale.restore(this.save?.finale);
    // ---- end of finale ----
    // Layer 9's play: the noise meter, Smaug's idle and waking, the dragon-sickness, the Arkenstone (hoard/, NOTES-7a-hoard).
    this.hoard = new Hoard(this);
    this.hoard.restore(this.save?.hoard);
    this.bagEnd = new BagEnd(this);
    this.bagEnd.restore(this.save?.bagEnd);
    // daynight (NOTES-10-daynight): after Bag End (its clock is the time source); the bed's "Alvás" skips the night.
    this.dayClock = new DayClock(this);
    this.bagEnd.onSleep = (p) => this.dayClock.sleep(p);
    // journal (NOTES-9-journal): after the finds and every module it reads; its own marks (the cell, the barrels).
    this.journal = new Journal(this);
    // safety (NOTES-11-safety)
    this.safety = new Safety(this);
    this.safety.restore(this.save?.safety);
    // timed-events (NOTES-12-events): after the day clock, Bag End and the enemies (it hooks Bag End's prices).
    this.timedEvents = new TimedEvents(this);
    this.timedEvents.restore(this.save?.events);
    // minigames (NOTES-13-minigames): after the day clock, Bag End, the decor and the surface (it adds its props there).
    this.minigames = new Minigames(this);
    this.minigames.restore(this.save?.minigames);
    this.bagEnd.slotRows = (s, p, t) => this.minigames.slotRows(s, p, t);
    // home-events (NOTES-14-bagend-events): after the minigames (the party starts the plate throwing).
    this.homeEvents = new HomeEvents(this);
    this.homeEvents.restore(this.save?.home);
    // shire (NOTES-26-shire): after the surface, the finale and Bag End; before the players join.
    this.shire = new Shire(this);
    this.shire.restore(this.save?.shire);
    // modes (NOTES-15-modes): after the enemies (it sets enemies.challenge) and every module whose state it watches.
    this.modes = new Modes(this, this.mode);
    this.modes.restore(this.save?.mode);
    this.journal.restore(this.save?.journal);
    this.money = SHOP.startMoney;
    this.sold = 0;
    this.restoreWorld();
    this.music = this.bench ? null : new Music();
    this.saveT = 0;
    this.terrainCode = this.save?.terrain || null;
    this.terrainSum = this.versionSum();
    this.saving = false;
    window.addEventListener('pagehide', () => this.saveSync());
    // Character bodies and hands decode in the background, so the first body does not pop in late.
    const preloaded = preloadCharacters();
    this.input = new Input(this.canvas);
    this.hudRoot = document.getElementById('huds');
    this.players = [];
    this.huds = [];
    this.bindings = []; // per player: { kbm, pad }
    this.leaveT = 0;
    this.addPlayer({ kbm: 'mouse', pad: null });
    this.frameTimes = [];
    this.last = performance.now();
    window.addEventListener('resize', () => this.layout());
    this.layout();
    // screens (NOTES-21-screens): after the first player and the layout (the stored settings may change the split).
    this.screens = new Screens(this);
    // Compile every material in the scene now: the per-view culling keeps the buried finds and the decor hidden until
    // a view can see them, and their first draw would otherwise stall a frame on the shader compile.
    this.warmPrograms();
    // The characters' bodies arrive later.
    preloaded.then(() => this.warmPrograms());
    // Likewise upload every texture now (a first upload with mipmaps mid-game stalls the frame that first shows it).
    const seenTex = new Set();
    this.scene.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        for (const v of Object.values(m)) if (v && v.isTexture && !seenTex.has(v)) seenTex.add(v);
        for (const u of Object.values(m.uniforms || {})) if (u && u.value && u.value.isTexture) seenTex.add(u.value);
      }
    });
    for (const t of seenTex) this.renderer.initTexture(t);
    window.__game = this;
  }

  /** Money, taken finds, ladders and dropped bags from the save. */
  restoreWorld() {
    const s = this.save;
    if (!s) return;
    this.money = s.money ?? this.money;
    this.sold = s.sold ?? 0;
    // A save from before Goblin-town (v2) stored indices into a list that shifted with the digging: rebuilt from
    // the find positions and the dug terrain (save.js migration, finds.js migrateTakenV2; NOTES-2a).
    if (s.takenV2) this.finds.hideTaken(this.finds.migrateTakenV2(s.takenV2, changedNear));
    else this.finds.hideTaken(s.taken || []);
    for (const [x, y, z, yaw] of s.ladders || []) this.ladders.add({ x, y, z }, { x: Math.sin(yaw), z: Math.cos(yaw) });
    const byId = new Map(FIND_TYPES.map((f) => [f.id, f]));
    for (const sack of s.sacks || []) this.sacks.drop(sack.p[0], sack.p[1] - 0.25, sack.p[2], sack.items.map((id) => byId.get(id)).filter(Boolean));
  }

  /** Per slot: what the save keeps of a player (slot 2 is kept even while that player is not in the game). */
  slotData() {
    const out = [...(this.save?.slots || [])];
    this.players.forEach((p, i) => {
      if (p.choosing) return;
      out[i] = {
        ch: p.ch.id, toolTier: p.toolTier, bagTier: p.bagTier, ladders: p.ladders, hunger: Math.round(p.hunger),
        bag: p.bag.map((f) => f.id), maxDepth: Math.round(p.maxDepth || 0), rockets: p.rockets || 0, eagles: !!p.eagles, eagleCd: Math.round(p.eagleCd || 0), armour: p.armour || 0, sting: !!p.sting, pos: p.dead > 0 ? null : p.pos.toArray().map((v) => +v.toFixed(2)), yaw: +p.yaw.toFixed(3),
      };
    });
    return out;
  }

  addPlayer(binding) {
    const slot = this.players.length;
    const p = new Player(slot, this, CHARACTERS[slot]);
    p.ladders = SHOP.startLadders;
    this.players.push(p);
    this.bindings.push(binding);
    this.huds.push(new Hud(this.hudRoot, p, binding.kbm === 'keys2' ? 'P' : 'X / E'));
    this.modes?.decorateHud(this.huds[slot]); // modes (NOTES-15-modes): the Kihívás seal
    for (const q of this.players) q.seeOthers(this.players);
    const saved = this.save?.slots?.[slot];
    const ch = saved && CHARACTERS.find((c) => c.id === saved.ch);
    if (ch && !this.players.some((q) => q !== p && q.ch === ch)) {
      // Continuing: the saved character, tools, bag and position.
      const byId = new Map(FIND_TYPES.map((f) => [f.id, f]));
      p.toolTier = saved.toolTier || 0;
      // Armour tier and Sting (enemies/); a missing field means none. Before setCharacter: the body shows the armour.
      p.armour = saved.armour || 0;
      p.sting = !!saved.sting;
      p.bagTier = saved.bagTier || 0;
      p.setCharacter(ch);
      p.ladders = saved.ladders ?? p.ladders;
      p.hunger = saved.hunger ?? p.hunger;
      p.bag = (saved.bag || []).map((id) => byId.get(id)).filter(Boolean);
      if (saved.pos) p.pos.fromArray(saved.pos);
      if (saved.yaw != null) p.yaw = saved.yaw;
      p.maxDepth = saved.maxDepth || 0;
      p.rockets = saved.rockets || 0;
      p.eagles = !!saved.eagles;
      p.eagleCd = saved.eagleCd || 0;
      this.tutorial?.skipFinished(p);
    } else if (!this.bench) this.huds[slot].openSelect(this);
    p.say(slot === 0 ? Tutorial.joinHint() : 'Csatlakozott a második játékos!', slot === 0 ? 8 : 4);
    this.layout();
    return p;
  }

  removePlayer(slot) {
    const p = this.players[slot];
    if (!p || slot === 0) return;
    this.scene.remove(p.body, p.camera, p.lamp);
    this.huds[slot].remove();
    this.players.splice(slot, 1);
    this.huds.splice(slot, 1);
    this.bindings.splice(slot, 1);
    this.players[0].say(`${p.ch.name} kiszállt.`);
    this.layout();
  }

  /** Viewport rectangles (CSS pixels, origin top-left) for the current player count and split direction. */
  viewports() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.players.length < 2) return [{ x: 0, y: 0, w, h }];
    if (this.split === 'h') return [{ x: 0, y: 0, w, h: Math.floor(h / 2) }, { x: 0, y: Math.floor(h / 2), w, h: h - Math.floor(h / 2) }];
    return [{ x: 0, y: 0, w: Math.floor(w / 2), h }, { x: Math.floor(w / 2), y: 0, w: w - Math.floor(w / 2), h }];
  }

  layout() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    const vps = this.viewports();
    this.players.forEach((p, i) => {
      const v = vps[i];
      p.camera.aspect = v.w / v.h;
      p.camera.updateProjectionMatrix();
      this.huds[i].place(v.x, v.y, v.w, v.h);
    });
    document.body.classList.toggle('split', this.players.length > 1);
    document.body.classList.toggle('split-h', this.split === 'h');
  }

  /** Drop-in: an unbound pad pressing Start (or A) joins; player 1 takes the first pad if no keyboard was used. */
  handleJoin(frame) {
    for (const [index, { edges }] of frame.pads) {
      if (this.bindings.some((b) => b.pad === index)) continue;
      const pressed = edges[9] || edges[0];
      if (!pressed) continue;
      if (this.bindings[0].pad == null && !this.input.kbmUsed) {
        this.bindings[0].pad = index;
        this.players[0].say('Kontroller csatlakoztatva.');
      } else if (this.players.length < MAX_PLAYERS && edges[9]) {
        this.addPlayer({ kbm: null, pad: index });
      }
    }
    // Keyboard player with a pad: the first pad pressing Start joins as player 2 (handled above).
    // F2: a second player on the right half of the keyboard (no controller needed); F2 again: that player leaves.
    if (this.input.pressed.has('F2')) {
      const k2 = this.bindings.findIndex((b) => b.kbm === 'keys2');
      if (k2 > 0) this.removePlayer(k2);
      else if (this.players.length < MAX_PLAYERS) this.addPlayer({ kbm: 'keys2', pad: null });
    }
    if (this.input.pressed.has('F3')) {
      this.split = this.split === 'v' ? 'h' : 'v';
      this.layout();
    }
  }

  /** The lift's prompt and the ride's fade to black, drawn inside the player's HUD (its own small elements). */
  liftOverlay(i, p) {
    const el = this.huds[i].el;
    if (!el.liftFade) {
      el.liftFade = document.createElement('div');
      el.liftFade.className = 'lift-fade';
      el.liftPrompt = document.createElement('div');
      el.liftPrompt.className = 'lift-prompt';
      // Inline styles: index.html's stylesheet belongs to the UI work.
      Object.assign(el.liftFade.style, { position: 'absolute', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', zIndex: '5' });
      Object.assign(el.liftPrompt.style, { position: 'absolute', left: '0', right: '0', top: '64%', textAlign: 'center', fontSize: '18px', color: 'var(--gold, #e8c070)', textShadow: '0 1px 3px #000' });
      el.append(el.liftFade, el.liftPrompt);
    }
    const fade = p.fade || 0;
    const fadeColor = p.fadeColor || '#000';
    if (el.liftFade.lastColor !== fadeColor) {
      el.liftFade.style.background = fadeColor;
      el.liftFade.lastColor = fadeColor;
    }
    if (el.liftFade.lastFade !== fade) {
      el.liftFade.style.opacity = fade;
      el.liftFade.lastFade = fade;
    }
    const text = this.lift.prompt(p);
    if (el.liftPrompt.textContent !== text) el.liftPrompt.textContent = text;
  }

  /** A co-op door opened (TERV 0.5 "Csak co-opban"): the treasure behind it goes into the shared purse. */
  coopReward(id, players) {
    const gold = id === 'runaajto' ? 400 : 150;
    this.money += gold;
    const what = id === 'runaajto' ? 'a trollok aranyfazekai' : 'egy ládányi érme';
    for (const p of players) p.say(`Kinyílt! Mögötte: ${what} (+${gold} arany).`, 5);
    this.saveNow();
  }

  versionSum() {
    let n = 0;
    for (let i = 0; i < chunkVersion.length; i++) n += chunkVersion[i];
    return n;
  }

  /** Writes the save; the terrain is re-encoded (asynchronously) only when something was dug since the last save. */
  async saveNow() {
    if (this.bench || this.noSave || this.saving || this.players.every((p) => p.choosing)) return;
    this.saving = true;
    try {
      const sum = this.versionSum();
      if (sum !== this.terrainSum || !this.terrainCode) {
        this.terrainCode = await encodeTerrain();
        this.terrainSum = sum;
      }
      writeSave({ ...snapshot(this), shire: this.shire?.state() }, this.terrainCode); // shire (NOTES-26-shire)
    } finally {
      this.saving = false;
    }
  }

  /** Closing the page: no time for compression, so the last encoded terrain goes with the current state. */
  saveSync() {
    if (this.bench || this.noSave || this.players.every((p) => p.choosing)) return;
    writeSave({ ...snapshot(this), shire: this.shire?.state() }, this.terrainCode); // shire (NOTES-26-shire)
  }

  /** A new game in `mode` (modes/, NOTES-15-modes): that slot's save is deleted, the page reloads into the mode. */
  newGame(mode = 'normal') {
    // No more saving from this page: the page-close save would write the old game back.
    this.noSave = true;
    if (mode !== 'versus') clearSave(mode);
    this.save = null;
    try {
      sessionStorage.setItem(START_KEY, JSON.stringify({ mode, fresh: true }));
    } catch {
      /* storage blocked: a normal new game */
    }
    location.reload();
  }

  /**
   * NOTES-30-music: the next music track (the skip key, a pad's LB + View, the pause and settings rows). A short line
   * names the new file; ignored while a single situation track or the death sting plays. Returns the file name or null.
   */
  skipTrack() {
    const name = this.music?.skip() ?? null;
    if (name && !this.screens.busy) for (const p of this.players) p.say(`Következő zene: ${name}`);
    return name;
  }

  /** The music situation: the title, the surface, or the layer of the deepest player (TERV 0.10). */
  musicSituation() {
    if (this.players.every((p) => p.choosing)) return 'cim';
    // The finale's music: 'menekules' during the escape, 'unnep' at the end (finale/, NOTES-7b-finale).
    const fin = this.finale?.musicSituation();
    if (fin) return fin;
    // 'szmaug' in Smaug's treasury while he sleeps there (hoard/, NOTES-7a-hoard).
    const hs = this.hoard?.musicSituation();
    if (hs) return hs;
    const deepest = Math.max(...this.players.map((p) => p.depth));
    if (deepest < 1) return 'felszin';
    return `reteg-${layerAtDepth(deepest) + 1}`;
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.frame();
    };
    requestAnimationFrame(loop);
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.frameTimes.push(now - this.last);
    if (this.frameTimes.length > 600) this.frameTimes.shift();
    this.last = now;
    const frame = this.input.poll();
    // screens (NOTES-21-screens): the pause, the settings or the credits freeze the game; only the terrain load and the
    // music carry on, nothing is drawn (the canvas keeps the last picture).
    if (this.screens.frame(frame, dt)) {
      if (!this.terrain.loaded) this.terrain.update(this.players.map((p) => p.pos));
      this.music?.update(dt, this.screens.musicSituation() || this.musicSituation());
      this.input.endFrame();
      return;
    }
    if (!this.bench) this.handleJoin(frame);

    this.players.forEach((p, i) => {
      const b = this.bindings[i];
      const shared = this.bindings.some((x) => x.kbm === 'keys2');
      const it = this.bench ? this.botIntent(p, i, dt) : this.input.intent(b.kbm, b.pad, shared);
      this.intents[i] = it;
      if (this.screens.watch(p, i, it)) return; // screens (NOTES-21-screens): Esc / Start in free play pauses
      const nearShop = p.pos.distanceTo(SHOP_POS) < 3.2 && p.dead <= 0;
      let menuOpen = true;
      if (p.choosing) this.huds[i].selectInput(it, this);
      // modes (NOTES-15-modes): Versengés holds the players before the start and on the winner page.
      else if (this.modes.input(p, i, it)) menuOpen = true;
      // The finale's held scenes take the player (and read the skip button) (finale/, NOTES-7b-finale).
      else if (this.finale.input(p, i, it)) menuOpen = true;
      // journal (NOTES-9-journal): an open page holds the player (back / its key closes it, the arrows page).
      else if (this.journal.held(p, i, it)) menuOpen = true;
      // (`p.asleep`: the enchanted stream's sleep in Mirkwood holds the player like a ride; mirkwood-water.js.)
      else if (p.riding || p.asleep || this.lift.input(this, i, it)) menuOpen = true;
      // minigames (NOTES-13-minigames): a running minigame holds the player; the use key at a start spot.
      // home-events (NOTES-14-bagend-events): a visit's held scene in Bag End (confirm = next, back = skip).
      else if (this.homeEvents.input(p, i, it)) menuOpen = true;
      else if (this.minigames.input(p, i, it)) menuOpen = true;
      else if (this.bagEnd.input(p, i, it)) menuOpen = true;
      // The riddle game's parchment takes the player's input while it is open; the Ring's key (gollum/).
      else if (this.gollum.input(p, i, it)) menuOpen = true;
      // A rune chest's lock holds the player; the use key at Erebor's mirrors and chests (erebor-puzzles/).
      else if (this.ereborPuzzles.input(p, i, it)) menuOpen = true;
      // The Arkenstone, a dragon-sick partner (hoard/, NOTES-7a-hoard).
      else if (this.hoard.input(p, i, it)) menuOpen = true;
      // shire (NOTES-26-shire): the neighbour's trades (held), planting and harvesting at the beds.
      else if (this.shire.input(p, i, it)) menuOpen = true;
      else {
        menuOpen = this.huds[i].shopInput(it, this, nearShop);
        // journal (NOTES-9-journal): its key opens it only here, with no other menu open.
        if (!menuOpen && this.journal.tryOpen(p, i, it)) menuOpen = true;
        if (!menuOpen) this.exits.input(p, i, it);
        if (!menuOpen) this.safety.input(p, i, it); // safety (NOTES-11-safety): the rope key
        if (!menuOpen) this.enemies.input(p, i, it);
        // Struggling out of silk, the cell's lock, the trapdoor, Bilbo's taunt (mirkwood-foes/).
        if (!menuOpen) this.mirkFoes.input(p, i, it);
        // Bárd's stall (selling), pulling a partner out of the flood (laketown-events/).
        if (!menuOpen) this.laketownEvents.input(p, i, it);
      }
      p.update(dt, it, menuOpen);
      this.screens.after(i, menuOpen); // screens (NOTES-21-screens): a held player's Esc belongs to his menu
      const th = performance.now();
      this.huds[i].update(this, nearShop);
      this.liftOverlay(i, p);
      this.safety.overlay(i, p); // safety (NOTES-11-safety): the plate's estimate mark, the rope's line
      if (this.bench) this.profH = (i ? this.profH : 0) + performance.now() - th;
      if (!this.bench && !this.modes.versus) this.tutorial.update(dt, i, p); // (modes: no tutorial in Versengés)
      if (i > 0 && it.leaveHeld) {
        this.leaveT += dt;
        if (this.leaveT > 2) {
          this.leaveT = 0;
          this.removePlayer(i);
        }
      } else if (i > 0) this.leaveT = 0;
    });
    const tPlayers = performance.now();
    this.finds.update(dt);
    this.lift.update(dt, this);
    this.bagEnd.update(dt);
    this.dayClock.update(dt); // daynight (NOTES-10-daynight): events, wake fades, the surface's look
    this.exits.update(dt);
    this.enemies.update(dt);
    this.gollum.update(dt);
    this.mirkFoes.update(dt);
    this.laketownEvents.update(dt);
    this.ereborPuzzles.update(dt);
    this.finale.update(dt); // finale/ (NOTES-7b-finale)
    this.hoard.update(dt); // hoard/ (NOTES-7a-hoard)
    this.journal.update(dt); // journal (NOTES-9-journal): a timer; polls the state at most 1–2.5 times a second
    this.safety.update(dt); // safety (NOTES-11-safety): the belay rope, timers
    this.timedEvents.update(dt); // timed-events (NOTES-12-events): goblin night, the auction
    this.minigames.update(dt); // minigames (NOTES-13-minigames)
    this.homeEvents.update(dt); // home-events (NOTES-14-bagend-events)
    this.shire.update(dt); // shire (NOTES-26-shire): meals, trades, the garden, the acorn
    this.modes.update(dt); // modes (NOTES-15-modes): Kihívás harms and death, Versengés, the hired dwarf
    this.digfx.update(dt);
    this.intents.length = this.players.length;
    this.decor.update(dt, this.players, this.intents);
    if (this.music) {
      this.music.update(dt, this.musicSituation());
      if (this.input.pressed.has('KeyM')) {
        const lv = this.music.cycleLevel();
        this.players[0].say(lv ? `Zene hangereje: ${Math.round(lv * 100)} %` : 'Zene kikapcsolva');
      }
      // NOTES-30-music: the skip key (shared keyboard) or a player's pad chord; a plain loop, nothing allocated per frame.
      let skip = this.input.pressed.has(SKIP_KEY);
      for (let i = 0; !skip && i < this.intents.length; i++) skip = !!this.intents[i]?.skipTrackPressed;
      if (skip) this.skipTrack();
    }
    // The spoil heap in the garden grows with the dug volume (recounted at most every 2 s, only after digging).
    this.spoilT = (this.spoilT || 0) + dt;
    if (this.spoilT > 2) {
      this.spoilT = 0;
      const sum = this.versionSum();
      if (sum !== this.spoilSum) {
        this.spoilSum = sum;
        this.surface?.spoil?.setVolume(dugVolume());
      }
    }
    this.saveT += dt;
    if (this.saveT > 20) {
      this.saveT = 0;
      this.saveNow();
    }
    const tTerrain = performance.now();
    this.terrain.stats.rebuiltVerts = 0;
    this.terrain.update(this.players.map((p) => p.pos));
    if (this.terrain.justLoaded && this.players.length) {
      this.terrain.justLoaded = false;
      if (!this.params.has('nopreupload')) this.preuploadScene();
    }
    const tRender = performance.now();
    // While the title screen (opaque, full window) covers the canvas, nothing drawn would be seen: skip the views. Most
    // of the mesh load happens behind it, and its frames were bound by the main thread (NOTES-20, NOTES-29-final).
    // (`?titledraw=1`: draw anyway, the A/B switch of qa/perf/loadtime.mjs --title.)
    const st = this.bench || this.params.has('titledraw') ? null : (this.startEl ||= document.getElementById('start'));
    if (!(this.screens.titleUp && st?.isConnected && !st.classList.contains('gone'))) this.render();
    // Bench: where the main-thread time of the slowest frame went (render includes the per-view culling).
    if (this.bench) {
      this.lastProf = {
        players: tPlayers - now, hud: this.profH, misc: tTerrain - tPlayers, terrain: tRender - tTerrain, render: performance.now() - tRender,
        cull: this.cullMs, rebuiltVerts: this.terrain.stats.rebuiltVerts, calls: this.stats.calls, triangles: this.stats.triangles,
      };
    }
    this.input.endFrame();
    if (this.bench) {
      this.cpuMs = performance.now() - now;
      this.benchTick(now);
    }
  }

  render() {
    const r = this.renderer;
    r.info.reset();
    const vps = this.viewports();
    const H = window.innerHeight;
    this.players.forEach((p, i) => {
      const v = vps[i];
      // Light and fog follow this player's depth: daylight above, the lamp alone deep down.
      this.lighting.applyView(p.depth, r, p.pos);
      const tc = performance.now();
      const seen = this.terrain.cullFor(p.camera, this.scene.fog ? this.scene.fog.far : 200);
      this.finds.cullFor(seen);
      this.decor.cullFor(seen, p.camera);
      this.enemies.cullFor(seen, i);
      // Gollum per view; the Ring's shadow world for its wearer's own view (after applyView: it greys the fog).
      this.gollum.cullFor(seen, i);
      this.mirkFoes.cullFor(seen, i);
      this.laketownEvents.cullFor(seen, i);
      this.ereborPuzzles.cullFor(seen, i);
      // Smaug's fire on the walls (after decor.cullFor set the fire uniforms) (finale/, NOTES-7b-finale).
      this.finale.cullFor(seen, i);
      this.hoard.cullFor(seen, i); // hoard/ (NOTES-7a-hoard)
      this.gollum.viewFor(p, i, r, this.scene);
      this.cullMs = (i ? this.cullMs : 0) + performance.now() - tc;
      // WebGL viewports start at the bottom-left.
      r.setViewport(v.x, H - v.y - v.h, v.w, v.h);
      r.setScissor(v.x, H - v.y - v.h, v.w, v.h);
      if (!this.bagEnd.renderView(p, r)) r.render(this.scene, p.camera);
    });
    this.stats.calls = r.info.render.calls;
    this.stats.triangles = r.info.render.triangles;
  }

  /**
   * Compiles the programs of every material in the scene for both light sets (with the sun, and without it as
   * lighting.js has it underground), so neither a newly shown object nor going underground stalls a frame. The terrain
   * material is added on a stand-in mesh (its batches come later). Cheap for programs that already exist.
   */
  /**
   * Right after the terrain load: hands every buffer in the scene to the GPU once (three.js uploads a geometry on its
   * first draw, so a region or set piece seen for the first time stalled that frame, 200–280 ms in layer 7). Everything
   * is shown, unculled, to a camera that sees all layers and drawn into a 1 × 1 pixel viewport; then put back.
   */
  preuploadScene() {
    this.terrain.flush();
    const cam = (this.uploadCam ||= new THREE.PerspectiveCamera());
    cam.copy(this.players[0].camera);
    cam.layers.enableAll();
    const restore = [];
    this.scene.traverse((o) => {
      restore.push([o, o.visible, o.frustumCulled]);
      o.visible = true;
      o.frustumCulled = false;
    });
    const r = this.renderer;
    const vp = r.getViewport(new THREE.Vector4());
    const sc = r.getScissor(new THREE.Vector4());
    r.setViewport(0, 0, 1, 1);
    r.setScissor(0, 0, 1, 1);
    r.render(this.scene, cam);
    r.setViewport(vp);
    r.setScissor(sc);
    for (const [o, v, f] of restore) {
      o.visible = v;
      o.frustumCulled = f;
    }
  }

  warmPrograms() {
    if (!this.players.length) return;
    const stand = (this.warmStand ||= new THREE.Mesh(new THREE.BufferGeometry(), this.terrain.material));
    stand.frustumCulled = false;
    this.scene.add(stand);
    const sun = this.lighting.sun;
    const was = sun.visible;
    for (const v of [true, false]) {
      sun.visible = v;
      this.renderer.compile(this.scene, this.players[0].camera);
    }
    sun.visible = was;
    this.scene.remove(stand);
  }

  /* ---- bench mode: scripted players dig down in a spiral, frame times are recorded ---- */

  botIntent(p, i, dt) {
    // `?fin=escape|arrow|epilogue`: the finale's bench scenes place and steer the players (finale/, NOTES-7b-finale).
    const fin = this.finale?.benchIntent(p, i);
    if (fin) return fin;
    const it = emptyIntent();
    const t = (performance.now() - this.benchT0) / 1000;
    // 2p-bag: player 1 strolls through the furnished Bag End (inside: pos.x > 340) while player 2 digs outside.
    const inBag = i === 0 && this.bench.includes('bag');
    // 2p-goblin: both players stand in Goblin-town and look around (standing still, the chasm is near) while goblins spawn.
    const inTown = this.bench.includes('goblin');
    // 2p-lake (NOTES-3a-lake): player 1 on the riddle beach, player 2 on Gollum's island; both stand and look around.
    const atLake = this.bench.includes('lake') && !this.bench.includes('laketown');
    // 2p-mirkwood (NOTES-4a-mirkwood): both players in the root hall of Mirkwood (the roots, the webs, the stream, the
    // feast lights), on either side of the stream, standing and looking around.
    const inMirk = this.bench.includes('mirkwood');
    // 2p-laketown (NOTES-5a-laketown): both players in the pile cavern beneath Lake-town (the piles, the nets, the stream,
    // the pools), either side of the stream, standing and looking around.
    const inLake7 = this.bench.includes('laketown');
    // 2p-erebor (NOTES-6a-erebor): both players in the great hall of Erebor's mines (the pillars, the statue, the
    // harps' alcove, Durin's door), on either side of the hall, standing and looking around.
    const inErebor = this.bench.includes('erebor');
    // 2p-hoard (NOTES-7a-hoard): player 1 high on the ledge over Smaug's treasury, player 2 on the gold by the
    // Arkenstone's dune; both stand and look around (the gold, the pillars, Smaug asleep).
    const inHoard9 = this.bench.includes('hoard');
    if (!p.botInit) {
      p.botInit = true;
      if (inHoard9) {
        const [x, z, y0] = i === 0 ? [1.5, 9.0, -620] : [-4.4, -4.6, -624];
        p.pos.set(x, HOARD_SITE_PROVIDER.floorAt(x, z, y0, 14) + 0.1, z);
        p.vel.set(0, 0, 0);
        p.yaw = i === 0 ? 0.35 : 0.35 + Math.PI;
      } else if (inErebor) {
        const [x, z] = i === 0 ? [-4.6, 3.2] : [4.4, -0.8];
        p.pos.set(x, EREBOR_HALL.floor + 0.1, z);
        p.vel.set(0, 0, 0);
        p.yaw = i === 0 ? 0.9 : 0.9 + Math.PI;
      } else if (inLake7) {
        const [x, z] = i === 0 ? [-3.4, -2.6] : [2.2, 3.6];
        p.pos.set(x, ltFloorAt(x, z, -406.5, 4) + 0.1, z);
        p.vel.set(0, 0, 0);
        p.yaw = i === 0 ? -2.4 : -2.4 + Math.PI;
      } else if (inMirk) {
        const [x, z] = i === 0 ? [3.0, -3.0] : [-4.6, 3.4];
        p.pos.set(x, mirkFloorAt(x, z, -326, 4) + 0.1, z);
        p.vel.set(0, 0, 0);
        p.yaw = i === 0 ? 0.6 : 0.6 + Math.PI;
      } else if (atLake) {
        const q = i === 0 ? RIDDLE_PLAYER : ISLAND;
        p.pos.set(q.x, q.y + 0.1, q.z);
        p.vel.set(0, 0, 0);
        p.yaw = i === 0 ? RIDDLE_PLAYER.yaw : RIDDLE_PLAYER.yaw + Math.PI;
      } else if (inTown) {
        // Player 1 on the stone ledge, player 2 on the wooden gallery above the hall.
        const pts = GOBLIN_POINTS.filter((q) => q.level === (i ? 'galeria' : 'parkany'));
        const q = pts[Math.floor(pts.length / 2)] || GOBLIN_POINTS[0];
        p.pos.set(q.x, q.y + 0.1, q.z);
        p.vel.set(0, 0, 0);
        p.yaw = i * Math.PI;
      } else if (inBag) {
        this.bagEnd.setAll();
        this.bagEnd.pass(p, true);
      } else {
        p.pos.set(i === 0 ? -4 : 4, 0.05, i === 0 ? -2 : 2);
        p.yaw = i * Math.PI;
      }
    }
    if (inTown || atLake || inMirk || inLake7 || inErebor || inHoard9) {
      it.padLookX = 0.3 * (i === 0 ? 1 : -1);
      it.padLookY = (p.pitch - -0.1) * 3;
      return it;
    }
    if (inBag) {
      it.padLookX = 0.35;
      it.padLookY = (p.pitch - -0.08) * 3;
      it.mz = Math.floor(t / 3) % 2 ? 0.45 : 0;
      return it;
    }
    // Look down-forward and dig continuously, turning slowly and walking into the hole.
    it.padLookX = 0.55 * (i === 0 ? 1 : -1);
    it.padLookY = (p.pitch - -0.95) * 3;
    it.mz = 0.55;
    it.dig = true;
    if (Math.floor(t * 2) % 7 === 0) it.jumpPressed = true;
    return it;
  }

  /** Pre-digs tunnels and caverns, so the stress bench sees a late-game amount of surface. */
  preDig() {
    for (let n = 0; n < 900; n++) {
      const a = n * 0.37;
      const y = -2 - (n / 900) * 54;
      digSphere(Math.sin(a) * 8, y, Math.cos(a * 1.3) * 8, 1.4);
      if (n % 3 === 0) digSphere(Math.cos(a * 0.7) * 6, y - 1, Math.sin(a * 0.9) * 6, 1.1);
    }
  }

  benchSetup() {
    const mode = this.bench;
    this.benchDur = +(this.params.get('dur') || 30) * 1000;
    if (mode.includes('stress')) this.preDig();
    if (mode.startsWith('2p')) this.addPlayer({ kbm: null, pad: null });
    this.benchState = 'load';
    this.benchT0 = performance.now();
    window.__bench = { done: false };
  }

  benchTick(now) {
    if (this.benchState === 'load') {
      if (this.terrain.loaded) {
        this.benchState = 'warm';
        this.benchLoadMs = now - this.benchT0;
        this.benchT0 = now;
      }
      return;
    }
    if (this.benchState === 'warm' && now - this.benchT0 > 3000) {
      this.benchState = 'run';
      this.benchT0 = now;
      this.benchFrames = [];
      this.benchCalls = 0;
      this.benchTris = 0;
      this.benchN = 0;
      this.terrain.stats.meshMaxMs = 0;
      this.terrain.stats.jobs = 0;
      this.terrain.stats.meshMs = 0;
      this.stats.digMax = 0;
      return;
    }
    if (this.benchState !== 'run') return;
    this.benchFrames.push(this.frameTimes[this.frameTimes.length - 1]);
    this.benchCpu = (this.benchCpu || 0) + this.cpuMs;
    if (this.cpuMs > (this.benchCpuMax || 0)) this.benchWorst = { at: +((now - this.benchT0) / 1000).toFixed(2), ...Object.fromEntries(Object.entries(this.lastProf).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])) };
    this.benchCpuMax = Math.max(this.benchCpuMax || 0, this.cpuMs);
    this.benchCalls += this.stats.calls;
    this.benchTris += this.stats.triangles;
    this.benchN++;
    if (now - this.benchT0 < this.benchDur) return;
    this.benchState = 'done';
    const f = [...this.benchFrames].sort((a, b) => a - b);
    const q = (x) => f[Math.min(f.length - 1, Math.floor(f.length * x))];
    const avg = f.reduce((s, v) => s + v, 0) / f.length;
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    window.__bench = {
      done: true,
      result: {
        mode: this.bench,
        size: `${window.innerWidth}x${window.innerHeight}`,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
        frames: f.length,
        fps: Math.round(1000 / avg * 10) / 10,
        avgMs: +avg.toFixed(2),
        p50Ms: +q(0.5).toFixed(2),
        p95Ms: +q(0.95).toFixed(2),
        p99Ms: +q(0.99).toFixed(2),
        maxMs: +f[f.length - 1].toFixed(2),
        over33: +(f.filter((v) => v > 33.4).length / f.length * 100).toFixed(2),
        // Main-thread time of frame() (simulation, culling and issuing the draws; the GPU's own work is not in it).
        cpuAvgMs: +(this.benchCpu / this.benchN).toFixed(2),
        cpuMaxMs: +this.benchCpuMax.toFixed(2),
        cpuWorst: this.benchWorst,
        drawCalls: Math.round(this.benchCalls / this.benchN),
        triangles: Math.round(this.benchTris / this.benchN),
        terrainTriangles: Math.round(this.terrain.stats.triangles),
        chunkMeshes: this.terrain.meshes.size,
        remeshJobs: this.terrain.stats.jobs,
        remeshAvgMs: this.terrain.stats.jobs ? +(this.terrain.stats.meshMs / this.terrain.stats.jobs).toFixed(2) : 0,
        remeshMaxMs: +this.terrain.stats.meshMaxMs.toFixed(2),
        digMaxMs: +this.stats.digMax.toFixed(2),
        genMs: Math.round(this.stats.genMs),
        loadMs: Math.round(this.benchLoadMs),
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        depths: this.players.map((p) => +p.depth.toFixed(1)),
      },
    };
  }
}
