/* ==== erebor-puzzles/index.js — the puzzles of layer 8, "Erebor tárnái" (470–580 m; TERV 0.11/6 and 0.11/8, 0.7 "Ha a
   szürke kő mellett áll a rigó kopog…", technical note h., Decisions 17, 18, 22):
   - DURIN'S DAY DOOR: the setting sun's light enters at the provider's light source in the evening only. The game has
     no meal-clock stand-in any more: the evening is the day clock's evening window (daynight.js isEvening, NOTES-10-
     daynight; the HUD's sun dial shows it), the sun is setting. The players carry the
     loose mirrors (mirrors.js) into the sockets and turn them in 45° steps; the ray is traced over the sockets' grid
     (beam.js) and stops in rock, which digging opens. When it reaches the keyhole in the window, the thrush knocks
     (a sound and a small thrush on a ledge by the door), then the door opens (erebor-fx.js setDoorOpen) and the
     treasure room behind it gives its gold and gems once per game.
     Co-op (Decision 17): solvable alone, faster together: a player carries one mirror at a time, so two players set
     the mirrors in parallel, and one can watch the ray while the other turns.
   - RUNE-LOCKED DWARF CHESTS: at the provider's chest spots; the use key opens the rune lock's parchment in that
     player's own viewport (runelock.js); Balin's use key reads the inscription first; a rune stone in the bag gives a
     key; otherwise trial and error. Opening gives layer-8 finds, saved per chest.
   Wiring (small commented lines): game.js `new EreborPuzzles(game)`, `sites.use({ ...EREBOR_SITE_PROVIDER, fx:
   game.decor.ereborFx })`, `restore(save.ereborPuzzles)`, `input(p, i, it)`
   before the menus (true while a rune lock has the player), `update(dt)`, `cullFor(seen, i)` per view; save.js
   `ereborPuzzles: game.ereborPuzzles?.state()`; input.js `interactHeld`. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sharedAudio } from '../audio.js';
import { HUNGER } from '../config.js';
import { chunkKey } from '../enemies/sites.js';
import { FIND_TYPES } from '../finds.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { MEALS } from '../ui/art.js';
import { digSphere, sdf } from '../world.js';
import { BEAM, socketUnder, solve, trace } from './beam.js';
import { MIRROR, Mirrors } from './mirrors.js';
import { isRuneStone, LOCK, puzzleFor, RuneLock } from './runelock.js';
import { EreborSites } from './sites.js';

export const DURIN = {
  knock: 2.4, // s the thrush knocks before the door moves
  open: 4.5, // s the door takes to open
  digCheck: 0.3, // s between checks whether the ground was dug (the ray is traced again only after a change)
  lightHint: 30, // m from the door: the light's hint and the "come back at sunset" note
  roomReach: 2.6, // m from the treasure room's middle
  chestReach: 1.8, // m from a chest's foot
  chestOpen: 1.3, // s the lid takes
  keyOut: 1.4, // m out from the door's face: where Thrór's key lies buried in the doorstep
  keySide: 0.7, // m along the door's face (towards +tangent)
  keyDepth: 0.14, // m under the floor (its bow just shows)
  keyReach: 1.3, // m: a player this near the dug-out key picks it up
  mirrorHint: 6, // m from a mirror or socket: the first-mirror hint
  chestHint: 4.5,
};

/** Key names per control scheme (as tutorial.js and laketown-events). */
const KEYS = {
  mouse: { use: 'E' },
  keys2: { use: 'P' },
  pad: { use: 'X' },
};

const GOLD = 'color:var(--gold,#e8c070)';

/** Vertex-coloured geometry (the mirrors' material: one shader program). */
function painted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A song thrush (the book's "old thrush") on a small stone ledge: brown back, pale speckled breast. Faces +z. */
/**
 * Thrór's key (book ch. 1: "a key with a long barrel and intricate wards, made of silver"; the films: it lies on the
 * doorstep and Bilbo finds it): a ring bow, a long barrel and a bit with wards, lying flat (+z along the barrel).
 */
function keyGeometry() {
  const P = [];
  const bow = new THREE.TorusGeometry(0.035, 0.008, 6, 14);
  bow.rotateX(Math.PI / 2);
  bow.translate(0, 0, -0.07);
  P.push(painted(bow, 0xc8ccd4));
  const barrel = new THREE.CylinderGeometry(0.007, 0.007, 0.13, 6);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0, 0.03);
  P.push(painted(barrel, 0xc8ccd4));
  for (const [dx, dz, w] of [[0.022, 0.08, 0.03], [0.018, 0.06, 0.022]]) {
    const ward = new THREE.BoxGeometry(w, 0.008, 0.012);
    ward.translate(dx, 0, dz);
    P.push(painted(ward, 0xb8bcc6));
  }
  return mergeGeometries(P);
}

function thrushGeometry() {
  const P = [];
  const body = new THREE.SphereGeometry(0.06, 10, 8);
  body.scale(0.85, 0.8, 1.35);
  body.translate(0, 0.1, 0);
  P.push(painted(body, 0x6a5232));
  const breast = new THREE.SphereGeometry(0.052, 10, 8);
  breast.scale(0.8, 0.85, 1.1);
  breast.translate(0, 0.088, 0.03);
  P.push(painted(breast, 0xd8c8a0));
  for (let k = 0; k < 7; k++) {
    const dot = new THREE.SphereGeometry(0.007, 4, 3);
    dot.translate(Math.sin(k * 2.1) * 0.025, 0.07 + (k % 3) * 0.014, 0.075 + (k % 2) * 0.004);
    P.push(painted(dot, 0x3a2a1a));
  }
  const head = new THREE.SphereGeometry(0.038, 10, 8);
  head.translate(0, 0.165, 0.065);
  P.push(painted(head, 0x6a5232));
  const beak = new THREE.ConeGeometry(0.011, 0.035, 6);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.16, 0.115);
  P.push(painted(beak, 0x3a3026));
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.0065, 5, 4);
    eye.translate(s * 0.026, 0.172, 0.088);
    P.push(painted(eye, 0x0a0806));
  }
  const tail = new THREE.BoxGeometry(0.05, 0.012, 0.09);
  tail.rotateX(0.35);
  tail.translate(0, 0.09, -0.11);
  P.push(painted(tail, 0x5a4428));
  for (const s of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.004, 0.004, 0.05, 4);
    leg.translate(s * 0.02, 0.03, 0.01);
    P.push(painted(leg, 0x8a6a5a));
  }
  const ledge = new THREE.BoxGeometry(0.36, 0.07, 0.22);
  ledge.translate(0, -0.035, 0);
  P.push(painted(ledge, 0x6c6a66));
  const g = mergeGeometries(P);
  g.computeVertexNormals();
  return g;
}

/** A stand-in dwarf chest (only for a site without erebor-fx's chests): iron-bound dark wood, the front towards −z,
 *  the lid hinged at the back (+z). */
function chestGeometry(lid) {
  const P = [];
  if (!lid) {
    const b = new THREE.BoxGeometry(0.8, 0.42, 0.5);
    b.translate(0, 0.21, 0);
    P.push(painted(b, 0x4a3018));
    for (const x of [-0.3, 0.3]) {
      const band = new THREE.BoxGeometry(0.05, 0.43, 0.51);
      band.translate(x, 0.21, 0);
      P.push(painted(band, 0x3a3836));
    }
    const lock = new THREE.BoxGeometry(0.12, 0.14, 0.03);
    lock.translate(0, 0.3, -0.26);
    P.push(painted(lock, 0xb08a3a));
  } else {
    const l = new THREE.BoxGeometry(0.82, 0.12, 0.52);
    l.translate(0, 0.06, -0.26);
    P.push(painted(l, 0x52361c));
    for (const x of [-0.3, 0.3]) {
      const band = new THREE.BoxGeometry(0.05, 0.13, 0.53);
      band.translate(x, 0.06, -0.26);
      P.push(painted(band, 0x3a3836));
    }
  }
  const g = mergeGeometries(P);
  g.computeVertexNormals();
  return g;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const MAX_SEG = 16;

export class EreborPuzzles {
  constructor(game) {
    this.game = game;
    this.sites = new EreborSites();
    this.forVersion = -1;
    this.mirrors = new Mirrors(this);
    this.door = { phase: 'shut', t: 0, rewarded: false };
    this.chests = [];
    this.locks = new Map(); // player → RuneLock
    this.ui = new Map();
    this.saved = null;
    this.beam = null; // the last trace
    this.beamKey = '';
    this.traceT = 0;
    this.traceDirty = true;
    this.lastDt = 1 / 60;
    this.audio = null;
    this.forceEvening = null; // QA / bench: true / false overrides the day clock's evening
    this.makeMeshes();
  }

  /** Every mesh exists from the start and stays in the scene (hidden), so preuploadScene() uploads it after the load. */
  makeMeshes() {
    const scene = this.game.scene;
    const mat = this.mirrors.mat;
    this.thrush = new THREE.Mesh(thrushGeometry(), mat);
    this.thrush.name = 'erebor-thrush';
    this.thrush.visible = false;
    scene.add(this.thrush);
    this.keyMesh = new THREE.Mesh(keyGeometry(), mat);
    this.keyMesh.name = 'erebor-thror-key';
    this.keyMesh.visible = false;
    scene.add(this.keyMesh);
    // The stand-in ray (a site without erebor-fx's setBeam): two crossed quads per run, additive.
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SEG * 12 * 3), 3));
    g.setDrawRange(0, 0);
    this.beamMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beamMesh.name = 'erebor-beam-standin';
    this.beamMesh.frustumCulled = false;
    this.beamMesh.visible = false;
    scene.add(this.beamMesh);
    // Stand-in chests (a site without erebor-fx's chests): bodies and lids, instanced.
    this.chestBody = new THREE.InstancedMesh(chestGeometry(false), mat, 12);
    this.chestLid = new THREE.InstancedMesh(chestGeometry(true), mat, 12);
    for (const m of [this.chestBody, this.chestLid]) {
      m.name = m === this.chestBody ? 'erebor-chest-standin' : 'erebor-chest-lid-standin';
      m.frustumCulled = false;
      tmpM.makeTranslation(0, -2000, 0);
      m.setMatrixAt(0, tmpM);
      m.count = 1;
      m.visible = false;
      scene.add(m);
    }
  }

  /* ---------------- queries ---------------- */

  keysFor(i) {
    const b = this.game.bindings[i];
    return b?.pad != null && !b.kbm ? KEYS.pad : KEYS[b?.kbm] || KEYS.pad;
  }

  inErebor(p) {
    return this.sites.inErebor(p.pos.x, p.pos.y, p.pos.z);
  }

  /** The meal-clock index a player's HUD shows (hud.js: the hunger plate drives the hand unless a mealClock is set). */
  mealIndex(p) {
    if (p.mealClock) return p.mealClock.next;
    const max = this.game.bagEnd?.effects?.hungerMax ?? HUNGER.max;
    const h = Math.max(0, Math.min(1, p.hunger / max));
    return Math.min(MEALS.length - 1, Math.floor((1 - h) * MEALS.length));
  }

  /**
   * The sun is setting: the day clock's evening window (daynight.js isEvening, 17:30–21:00, every 20 real minutes;
   * NOTES-10-daynight). Without a day clock (a stripped test page) the old stand-in: a player in Erebor whose meal
   * clock shows supper or late supper.
   */
  evening() {
    if (this.forceEvening != null) return this.forceEvening;
    const dc = this.game.dayClock;
    if (dc) return dc.isEvening();
    return this.game.players.some((p) => !p.choosing && p.dead <= 0 && this.inErebor(p) && this.mealIndex(p) >= MEALS.length - 2);
  }

  /** The door's waiting text: how long until the sun sets (in real minutes, rounded up). */
  untilEvening() {
    const m = this.game.dayClock?.realMinutesUntil(17.5);
    return m > 0 ? ` A nap kb. ${Math.max(1, Math.ceil(m))} perc múlva kezd lenyugodni.` : '';
  }

  hasRuneStone(p) {
    return this.game.players.some((q) => !q.choosing && (q === p || Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 6) && q.bag.some(isRuneStone));
  }

  nearDoor(p, r) {
    const d = this.sites.door;
    return !!d && Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < r && Math.abs(p.pos.y - d.y) < 12;
  }

  /* ---------------- build ---------------- */

  build() {
    if (this.forVersion === this.sites.version) return;
    this.forVersion = this.sites.version;
    const S = this.sites;
    for (const p of this.game.players) {
      p.erMirror = null;
      p.erHold = null;
    }
    this.closeAllLocks();
    const sockets = S.sockets;
    this.solution = solve(S.light, sockets, S.keyhole, S.door, { cone: S.cone });
    this.mirrors.underId = socketUnder(S.light, sockets)?.id ?? null;
    const n = Math.min(MIRROR.max, this.solution ? this.solution.size + 1 : Math.min(4, sockets.length));
    // The solved ray's way (ignoring the ground): no loose mirror is set down on it.
    const path = this.solution ? trace(S.light, this.solution, sockets, S.keyhole, S.door, { cone: S.cone, solid: () => null }).points : [];
    this.mirrors.build(sockets, S.spots, sockets.length ? n : 0, this.saved?.sock, this.solution ? new Set(this.solution.keys()) : null, path);
    this.door = { phase: this.saved?.door ? 'open' : 'shut', t: this.saved?.door ? 1 : 0, rewarded: !!this.saved?.room };
    if (this.door.phase === 'open') this.applyDoor(1, true);
    this.placeKey(!!(this.saved?.key || this.saved?.door));
    const opened = new Set((this.saved?.chests || []).map(String));
    const read = new Set((this.saved?.read || []).map(String));
    this.chests = S.chests.map((c, k) => ({
      ...c, k, puzzle: puzzleFor(c.id, k), open: opened.has(String(c.id)), anim: opened.has(String(c.id)) ? 1 : 0,
      read: read.has(String(c.id)), crossed: {}, jam: 0, busy: null,
    }));
    for (const c of this.chests) this.applyChest(c);
    this.beamKey = '';
    this.drawnRes = undefined;
    this.traceDirty = true;
    this.placeThrush();
    this.drawStandInChests();
  }

  /** Thrór's key: buried in the doorstep in front of Durin's door, its bow just showing; `found` when already taken. */
  placeKey(found) {
    const d = this.sites.door;
    this.key = null;
    if (!d) return;
    const nx = d.nx ?? 0;
    const nz = d.nz ?? 1;
    const x = d.x + nx * DURIN.keyOut - nz * DURIN.keySide;
    const z = d.z + nz * DURIN.keyOut + nx * DURIN.keySide;
    this.key = { x, y: d.y - DURIN.keyDepth, z, found, dug: found, checkT: 0, noKeySaid: false };
    this.keyMesh.position.set(x, d.y - DURIN.keyDepth + 0.1, z);
    this.keyMesh.rotation.set(0.35, Math.atan2(nx, nz) + 0.9, 0);
  }

  /** The key: dug free (the ground round it is air) and a player near → taken, told to both, saved. */
  updateKey(dt) {
    const K = this.key;
    if (!K || K.found) return;
    K.checkT -= dt;
    if (!K.dug && K.checkT <= 0) {
      K.checkT = DURIN.digCheck;
      K.dug = sdf(K.x, K.y, K.z) < 0;
    }
    if (!K.dug) return;
    for (const p of this.game.players) {
      if (p.choosing || p.dead > 0) continue;
      if (Math.hypot(p.pos.x - K.x, p.pos.z - K.z) > DURIN.keyReach || Math.abs(p.pos.y - K.y) > 2.2) continue;
      K.found = true;
      this.sound('clink', K);
      for (const q of this.game.players) {
        if (!q.choosing) q.say(q === p ? 'Megtaláltad Thrór kulcsát! Ez nyitja Durin ajtaját.' : 'Megvan Thrór kulcsa! Ez nyitja Durin ajtaját.', 4);
      }
      this.game.saveNow?.();
      break;
    }
  }

  /** The thrush's ledge: beside the keyhole, a little above it, in front of the door. */
  placeThrush() {
    const d = this.sites.door;
    const k = this.sites.keyhole;
    if (!d || !k) return;
    const nx = d.nx ?? 0;
    const nz = d.nz ?? 1;
    const tx = -nz;
    const tz = nx;
    this.thrush.position.set(k.x + tx * 0.75 + nx * 0.2, k.y + 0.42, k.z + tz * 0.75 + nz * 0.2);
    this.thrush.rotation.set(0, Math.atan2(nx, nz) + 0.5, 0);
    this.thrushBase = this.thrush.rotation.y;
  }

  /* ---------------- player.js / game.js hooks ---------------- */

  /**
   * Per player with no other menu open (game.js, after the riddle game): a rune lock takes the player's input (true);
   * the use key at a chest opens its lock, at a mirror or socket takes / places / turns / drops a mirror.
   */
  input(p, i, it) {
    const lock = this.locks.get(p);
    if (lock) {
      if (!lock.input(it)) this.closeLock(p);
      return true;
    }
    if (!this.sites.live || p.choosing) return false;
    if (p.dead > 0 || p.riding) return false;
    this.mirrors.holdStep(p, it, this.lastDt);
    if (!it.interactPressed || p.erHold) return false;
    const c = this.chestTarget(p);
    if (c) {
      it.interactPressed = false;
      return this.useChest(p, i, c);
    }
    if (this.mirrors.press(p)) it.interactPressed = false;
    return false;
  }

  /* ---------------- the door ---------------- */

  mirrorMoved() {
    this.traceDirty = true;
  }

  /** The door's opening (0 shut … 1 open) through erebor-fx; without fx (a test site) the doorway is dug out. */
  applyDoor(t, instant = false) {
    const fx = this.sites.fx;
    if (fx?.setDoorOpen) fx.setDoorOpen(t);
    else if (t >= 0.5 && !this.doorDug) {
      this.doorDug = true;
      const d = this.sites.door;
      if (d && this.sites.test) this.sites.test.carveDoor?.(digSphere);
    }
    if (instant) this.doorDug = true;
  }

  updateDoor(dt) {
    const D = this.door;
    const S = this.sites;
    const ev = this.evening();
    // The ray (only while the sun sets and the door is shut).
    // Traced again only when a mirror moved or turned, the ground was dug (the chunk versions changed) or the sun
    // came: a trace samples the ground (density and colliders) all along the ray.
    this.traceT -= dt;
    if (D.phase === 'shut' && ev && S.light) {
      if (this.traceT <= 0) {
        this.traceT = DURIN.digCheck;
        const sum = this.game.versionSum?.() ?? 0;
        if (sum !== this.digSum) {
          this.digSum = sum;
          this.traceDirty = true;
        }
      }
      if (this.traceDirty || !this.beam) {
        this.traceDirty = false;
        this.beam = trace(S.light, this.mirrors.rotations(), S.sockets, S.keyhole, S.door, { cone: S.cone });
      }
    } else if (D.phase !== 'knock') this.beam = null;
    this.drawBeam(this.beam);
    // The light alone does not open it: Thrór's key must be found first.
    if (D.phase === 'shut' && this.beam?.lit && !this.holdDoor && this.key && !this.key.found && !this.key.noKeySaid) {
      this.key.noKeySaid = true;
      this.tellNear(DURIN.lightHint, 'A fény a kulcslyukra esik, de nincs nálatok a kulcs! Thrór kulcsa valahol itt lehet az ajtó előtt, a földben.', 5);
    }
    if (D.phase === 'shut' && this.beam?.lit && !this.holdDoor && (!this.key || this.key.found)) {
      D.phase = 'knock';
      D.t = 0;
      this.sound('thrush', this.sites.keyhole);
      this.tellNear(DURIN.lightHint, 'Kopog a rigó a kövön… a lenyugvó nap fénye a kulcslyukra esik!', 4);
    }
    if (D.phase === 'knock') {
      D.t += dt;
      if (D.t >= DURIN.knock) {
        D.phase = 'opening';
        D.t = 0;
        this.sound('grind', S.door);
        this.tellNear(DURIN.lightHint, 'Feltárul Durin ajtaja!', 4);
      }
    } else if (D.phase === 'opening') {
      D.t = Math.min(1, D.t + dt / DURIN.open);
      this.applyDoor(D.t);
      if (D.t >= 1) {
        D.phase = 'open';
        // The key has done its work: it goes into Bag End's mathom room (TERV 0.11/7, a famous find).
        this.game.bagEnd?.addTrophy?.({ id: 'thror-kulcs', color: 0xc8ccd4 });
        this.beam = null;
        this.drawBeam(null);
        this.game.saveNow?.();
      }
    }
    // The thrush: on its ledge while the sun sets (and after), knocking its head down during the knock.
    const th = this.thrush;
    this.thrushOn = !!S.keyhole && (ev || D.phase !== 'shut');
    if (this.thrushOn) {
      th.rotation.x = D.phase === 'knock' ? Math.max(0, Math.sin(D.t * 18)) * 0.5 : 0;
      th.rotation.y = (this.thrushBase || 0) + (D.phase === 'knock' ? 0 : Math.sin(performance.now() / 900) * 0.25);
    }
    // The treasure room: once per game, the first one in.
    if (D.phase === 'open' && !D.rewarded && S.behindDoor) {
      const b = S.behindDoor;
      const p = this.game.players.find((q) => !q.choosing && q.dead <= 0 && Math.hypot(q.pos.x - b.x, q.pos.z - b.z) < DURIN.roomReach && Math.abs(q.pos.y - b.y) < 2.5);
      if (p) {
        D.rewarded = true;
        this.roomReward(p);
      }
    }
  }

  /** The ray through erebor-fx (only when it changed), or the stand-in quads. */
  drawBeam(res) {
    if (res === this.drawnRes) return;
    this.drawnRes = res;
    const pts = res && res.points.length > 1 ? res.points : null;
    const key = pts ? pts.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}`).join(';') : '';
    if (key === this.beamKey) return;
    this.beamKey = key;
    const fx = this.sites.fx;
    if (fx?.setBeam) {
      fx.setBeam(pts ? pts.map((q) => ({ x: q.x, y: q.y, z: q.z })) : null);
      this.beamMesh.visible = false;
      return;
    }
    const g = this.beamMesh.geometry;
    const a = g.attributes.position.array;
    let n = 0;
    const W = 0.07;
    for (let s = 0; pts && s < pts.length - 1 && s < MAX_SEG; s++) {
      const A = pts[s];
      const B = pts[s + 1];
      const dx = B.x - A.x;
      const dz = B.z - A.z;
      const l = Math.hypot(dx, dz) || 1;
      const sx = (-dz / l) * W;
      const sz = (dx / l) * W;
      const quad = (ox, oy, oz) => {
        const v = [A.x - ox, A.y - oy, A.z - oz, B.x - ox, B.y - oy, B.z - oz, B.x + ox, B.y + oy, B.z + oz, A.x - ox, A.y - oy, A.z - oz, B.x + ox, B.y + oy, B.z + oz, A.x + ox, A.y + oy, A.z + oz];
        a.set(v, n * 3);
        n += 6;
      };
      quad(sx, 0, sz);
      quad(0, W, 0);
    }
    g.attributes.position.needsUpdate = true;
    g.setDrawRange(0, n);
    g.computeBoundingSphere();
    this.beamMesh.visible = n > 0;
  }

  /** The finds of layer 8 (the world work's types), the richest first; the deepest layer that has any otherwise. */
  layerFinds(filter = () => true) {
    const ok = (f) => !f.famous && !f.keep && f.value > 0 && filter(f);
    let L = FIND_TYPES.filter((f) => f.layer === 7 && ok(f));
    if (!L.length) {
      const top = Math.max(...FIND_TYPES.filter(ok).map((f) => f.layer));
      L = FIND_TYPES.filter((f) => f.layer === top && ok(f));
    }
    return L.sort((a, b) => b.value - a.value);
  }

  /** Finds fly from `at` into p's bag (what does not fit goes into the shared purse as gold). */
  give(p, types, at, what) {
    const game = this.game;
    let gold = 0;
    for (const type of types) {
      const room = p.bagCap - p.bag.length - (p.incoming || 0);
      if (room <= 0 || !game.finds) {
        gold += type.value;
        continue;
      }
      p.incoming = (p.incoming || 0) + 1;
      game.finds.fly({ type, x: at.x, y: at.y + 0.5, z: at.z, rot: new THREE.Euler() }, p, () => {
        p.incoming--;
        if (p.dead > 0) return;
        p.bag.push(type);
        p.say(`${type.name} (${type.value} arany)`);
      });
    }
    if (gold) game.money += gold;
    p.say(`${what}${gold ? ` (+${gold} arany, a zsákod tele)` : ''}`, 6);
    this.sound('coins', at);
    game.saveNow?.();
  }

  /** Behind Durin's door: gold and gems of Erebor (layer-8 finds: the metal and gem types, the richest), once per game. */
  roomReward(p) {
    const rich = this.layerFinds((f) => f.metal || (f.glow || 0) >= 0.6 || f.embedded);
    const pick = [];
    for (let k = 0; k < 6 && rich.length; k++) pick.push(rich[Math.floor(k / 2) % rich.length]);
    this.give(p, pick, this.sites.behindDoor, 'Durin ajtaja mögött: a törpék elrejtett kincse!');
    for (const q of this.game.players) if (q !== p && !q.choosing) q.say(`${p.ch.name} megtalálta a kincseskamrát!`, 4);
  }

  /* ---------------- the chests ---------------- */

  /** The closed chest within reach in front of the player (or null). */
  chestTarget(p) {
    let best = null;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    for (const c of this.chests) {
      if (c.open) continue;
      const dx = c.x - p.pos.x;
      const dz = c.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > DURIN.chestReach || Math.abs(c.y - p.pos.y) > 1.6) continue;
      if (d > 0.5 && (dx * fx + dz * fz) / d < 0.35) continue;
      if (!best || d < best.d) best = { c, d };
    }
    return best?.c || null;
  }

  /** The use key at a closed chest: Balin reads it; the lock's parchment opens (true) unless it is jammed or busy. */
  useChest(p, i, c) {
    if (c.jam > 0) {
      p.say(`A zár beragadt. Várj még ${Math.ceil(c.jam)} mp-et.`, 2);
      return false;
    }
    if (c.busy && c.busy !== p && this.locks.has(c.busy)) {
      p.say(`${c.busy.ch.name} már a záron dolgozik.`, 2);
      return false;
    }
    if (p.ch.id === 'balin' && !c.read) {
      c.read = true;
      p.say(`Elolvasod a feliratot: „${c.puzzle.word.toUpperCase()}” — ${c.puzzle.means}.`, 5);
      for (const q of this.game.players) if (q !== p && !q.choosing) q.say(`Balin elolvasta a láda feliratát: „${c.puzzle.word.toUpperCase()}”.`, 4);
    }
    this.hint(p, i, 'lada');
    c.busy = p;
    this.locks.set(p, new RuneLock(this, p, i, c));
    this.sound('tick', c);
    return true;
  }

  closeLock(p) {
    const l = this.locks.get(p);
    if (!l) return;
    if (l.chest.busy === p) l.chest.busy = null;
    this.locks.delete(p);
  }

  closeAllLocks() {
    for (const p of [...this.locks.keys()]) this.closeLock(p);
  }

  /** A lock solved: the lid opens, its finds fly into the bag; saved. */
  solved(c, p) {
    c.open = true;
    c.anim = 0;
    this.sound('creak', c);
    const L = this.layerFinds();
    const pick = L.length ? [L[(c.k * 2 + 1) % L.length], L[(c.k * 2 + 2) % L.length]] : [];
    this.give(p, pick, c, 'Kinyílt a törpeláda!');
  }

  applyChest(c) {
    const fx = this.sites.fx;
    if (fx?.setChestOpen) fx.setChestOpen(c.id, c.anim);
  }

  drawStandInChests() {
    const own = !this.sites.fx?.setChestOpen && this.chests.length > 0;
    this.chestBody.visible = own;
    this.chestLid.visible = own;
    if (!own) return;
    let n = 0;
    for (const c of this.chests) {
      tmpE.set(0, c.yaw, 0, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpP.set(c.x, c.y, c.z);
      tmpM.compose(tmpP, tmpQ, ONE);
      this.chestBody.setMatrixAt(n, tmpM);
      // The lid hinges at the back edge (local z +0.25, 0.42 up); opening lifts its front.
      const bx = c.x + Math.sin(c.yaw) * 0.25;
      const bz = c.z + Math.cos(c.yaw) * 0.25;
      tmpE.set(c.anim * 1.9, c.yaw, 0, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpP.set(bx, c.y + 0.42, bz);
      tmpM.compose(tmpP, tmpQ, ONE);
      this.chestLid.setMatrixAt(n, tmpM);
      n++;
    }
    this.chestBody.count = n;
    this.chestLid.count = n;
    this.chestBody.instanceMatrix.needsUpdate = true;
    this.chestLid.instanceMatrix.needsUpdate = true;
  }

  updateChests(dt) {
    let moved = false;
    for (const c of this.chests) {
      c.jam = Math.max(0, c.jam - dt);
      if (c.open && c.anim < 1) {
        c.anim = Math.min(1, c.anim + dt / DURIN.chestOpen);
        this.applyChest(c);
        moved = true;
      }
    }
    if (moved) this.drawStandInChests();
    for (const [p, l] of this.locks) {
      l.t += dt;
      const done = (l.phase === 'won' && l.t >= LOCK.won) || (l.phase === 'jam' && l.t >= LOCK.shut);
      if (done || p.dead > 0 || p.choosing || !this.game.players.includes(p)) this.closeLock(p);
    }
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    const game = this.game;
    this.lastDt = dt;
    this.build();
    if (game.bench) this.benchEvents();
    if (!this.sites.live) return;
    // A carrier who died, left or rides the lift: his mirror goes back to where it lay.
    for (const m of this.mirrors.list) {
      const h = m.holder;
      if (m.where === 'hand' && (!h || !game.players.includes(h) || h.dead > 0 || h.choosing || h.riding)) {
        if (h) this.mirrors.dropAll(h);
        else Object.assign(m, { where: 'floor', x: m.home.x, y: m.home.y, z: m.home.z });
        this.mirrors.dirty = true;
      }
    }
    this.updateKey(dt);
    this.updateDoor(dt);
    this.updateChests(dt);
    this.mirrors.update();
    const ev = this.evening();
    game.players.forEach((p, i) => {
      if (p.choosing || p.dead > 0 || !this.inErebor(p)) return;
      const near = (q, r) => Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < r && Math.abs(q.y - p.pos.y) < 4;
      if (this.mirrors.list.some((m) => near(m, DURIN.mirrorHint)) || this.mirrors.sockets.some((s) => near(s, DURIN.mirrorHint))) this.hint(p, i, 'tukor');
      if (this.chests.some((c) => !c.open && near(c, DURIN.chestHint))) this.hint(p, i, 'lada');
      if (this.door.phase === 'shut' && this.nearDoor(p, DURIN.lightHint)) {
        if (ev) {
          if (this.hint(p, i, 'durin') || !p.erLightSaid) p.say('Besüt a lenyugvó nap fénye! Vezessétek a kulcslyukra, amíg tart az este (amíg a nap le nem bukik).', 4);
          p.erLightSaid = true;
          p.erDarkSaid = false;
        } else {
          if (!p.erDarkSaid && this.nearDoor(p, 8)) p.say(`Durin ajtaja zárva. Csak a lenyugvó nap fénye nyitja: gyere vissza este, napnyugtakor (nézd a tányér melletti nap–hold korongot).${this.untilEvening()} Thrór kulcsa nélkül pedig nem nyílik.`, 6);
          p.erDarkSaid = this.nearDoor(p, 8) || p.erDarkSaid;
          p.erLightSaid = false;
        }
      }
    });
    this.updateUi();
  }

  tellNear(r, text, s) {
    for (const p of this.game.players) if (!p.choosing && this.nearDoor(p, r)) p.say(text, s);
  }

  cullFor(visible, viewIndex = 0) {
    const vis = (x, y, z) => {
      const k = chunkKey(x, y, z);
      return k < 0 || !!visible[k];
    };
    this.mirrors.cullFor(vis);
    const t = this.thrush.position;
    this.thrush.visible = !!this.thrushOn && vis(t.x, t.y, t.z);
    const K = this.key;
    this.keyMesh.visible = !!K && !K.found && vis(K.x, K.y + 0.2, K.z);
    if (this.chestBody.count && !this.sites.fx?.setChestOpen && this.chests.length) {
      const v = this.chests.some((c) => vis(c.x, c.y + 0.3, c.z));
      this.chestBody.visible = v;
      this.chestLid.visible = v;
    }
  }

  /* ---------------- hints, sounds and the per-player overlay ---------------- */

  /** One parchment hint per player with his own keys (tutorial.js hint; the id carries the slot, so both get it). */
  hint(p, i, id) {
    const k = this.keysFor(i);
    const text = {
      tukor: `<b style="${GOLD}">Tükrök Durin ajtajánál.</b> Vegyél fel egyet (${k.use}), vidd egy üres foglalathoz és tedd bele (${k.use}). Egy koppintás (${k.use}) 45°-kal fordítja, nyomva tartva kiveszed. A lenyugvó nap fényét kell a kulcslyukra vezetni; ahol szikla állja az útját, áss rést. Ketten gyorsabb: egyszerre két tükröt vihettek.`,
      lada: `<b style="${GOLD}">Rúnazáras törpeláda.</b> ${k.use}: a zár. Minden rúnához válaszd ki a hangját. Balin el tudja olvasni a feliratot; egy rúnakő a zsákban kulcsot ad. A téves hang kiesik, de három tévedés beragasztja a zárat egy időre.`,
      // The moon-letters (book ch. 3, read by Elrond on Thrór's map), paraphrased, not quoted. [ellenőrizendő]
      durin: `<b style="${GOLD}">Besüt a lenyugvó nap!</b> Thrór térképének holdbetűi szerint, amelyeket Elrond olvasott ki: ha a szürke kőnél kopog a rigó, a lenyugvó nap utolsó fénye a kulcslyukra esik. Tükrökkel vezessétek a fényt a kulcslyukhoz, amíg tart az este (a tányér melletti nap–hold korong szerint napnyugtáig; minden nap visszatér)! De kulcs is kell: Thrór kulcsa az ajtó előtt lapul a földben.`,
    }[id];
    return !!this.game.tutorial?.hint?.(i, p, `${id}-${i}`, text);
  }

  /** The use key's prompt for a player (his own key). */
  prompt(p, i) {
    const k = this.keysFor(i).use;
    if (p.erHold) return 'Tartsd nyomva a kivételhez…';
    const c = this.chestTarget(p);
    if (c) {
      if (c.jam > 0) return `A zár beragadt (${Math.ceil(c.jam)} mp)`;
      return p.ch.id === 'balin' && !c.read ? `Felirat elolvasása, rúnazár: ${k}` : `Rúnazár: ${k}`;
    }
    const t = this.mirrors.target(p);
    if (t) {
      return {
        take: `Tükör felvétele: ${k}`,
        place: `Tükör a foglalatba: ${k}`,
        drop: `Tükör letétele: ${k}`,
        turn: `Tükör fordítása: ${k} · kivétel: ${k} nyomva tartva`,
      }[t.kind];
    }
    const b = this.beam?.blocked;
    if (b && Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < 5 && Math.abs(b.y - p.pos.y) < 3) return 'A fény a sziklába ütközik: áss rést!';
    return '';
  }

  updateUi() {
    const game = this.game;
    game.players.forEach((p, i) => {
      const el = game.huds[i]?.el;
      if (!el) return;
      let ui = this.ui.get(p);
      if (!ui || ui.root !== el) {
        ui?.box.remove();
        ui?.prompt.remove();
        ui = { root: el, prompt: document.createElement('div'), box: document.createElement('div'), text: '', html: '' };
        Object.assign(ui.prompt.style, {
          position: 'absolute', left: '50%', top: '58%', transform: 'translateX(-50%)', fontSize: '17px', color: 'var(--gold, #e8c070)',
          textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '6', whiteSpace: 'nowrap',
        });
        // The rune lock's parchment (as the riddle game's).
        Object.assign(ui.box.style, {
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(88%, 30em)', maxHeight: '86%', overflow: 'hidden',
          padding: '0.8em 1.2em 0.9em', textAlign: 'center', fontSize: '0.98em', lineHeight: '1.3', color: 'var(--ink-dark, #3a2614)',
          background: 'var(--tx-parch) center / cover, #e8d6ac', borderRadius: '0.25em', boxShadow: '0 0.3em 1.2em #000d, inset 0 0 2.5em #7a5a2a55',
          fontFamily: 'var(--f-text, Georgia, serif)', pointerEvents: 'none', zIndex: '7', display: 'none',
        });
        ui.box.className = 'erebor-runelock';
        el.append(ui.prompt, ui.box);
        this.ui.set(p, ui);
      }
      const lock = this.locks.get(p);
      const g = glyphs(deviceOf(game.bindings[i]), game.bindings.some((b) => b.kbm === 'keys2'));
      const html = lock ? lock.html(g) : '';
      if (html !== ui.html) {
        ui.html = html;
        ui.box.innerHTML = html;
        ui.box.style.display = html ? 'block' : 'none';
      }
      const text = !lock && !p.choosing && p.dead <= 0 && this.sites.live && this.inErebor(p) ? this.prompt(p, i) : '';
      if (text !== ui.text) {
        ui.text = text;
        ui.prompt.textContent = text;
      }
    });
  }

  /** Synthesised sounds (within 30 m of a player): mirror clink and scrape, the thrush, the door, the lock, coins. */
  sound(kind, pos) {
    try {
      if (pos && this.game.players.every((p) => p.choosing || Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y, p.pos.z - pos.z) > 30)) return;
      if (this.game.decor?.mute) return;
      if (!this.audio) {
        this.audio = sharedAudio();
        if (!this.audio) return;
        const len = this.audio.sampleRate;
        this.noise = this.audio.createBuffer(1, len, this.audio.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const a = this.audio;
      if (a.state === 'suspended') a.resume();
      const t = a.currentTime;
      const burst = (start, dur, type, f0, f1, vol, q = 1) => {
        const src = a.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const f = a.createBiquadFilter();
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(f0, t + start);
        f.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(vol, t + start + Math.min(0.05, dur / 4));
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        src.connect(f).connect(g).connect(a.destination);
        src.start(t + start);
        src.stop(t + start + dur + 0.05);
      };
      const tone = (start, dur, type, f0, f1, vol) => {
        const o = a.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t + start);
        o.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(vol, t + start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(a.destination);
        o.start(t + start);
        o.stop(t + start + dur + 0.05);
      };
      switch (kind) {
        case 'clink': tone(0, 0.25, 'triangle', 2600, 2300, 0.05); tone(0.02, 0.4, 'sine', 1300, 1250, 0.04); break;
        case 'scrape': burst(0, 0.22, 'bandpass', 900, 1400, 0.12, 3); break;
        // The thrush: a snail shell knocked on the stone (sharp taps), then its song (repeated whistled phrases).
        case 'thrush':
          for (let k = 0; k < 5; k++) burst(k * 0.32, 0.04, 'bandpass', 2400, 2000, 0.4, 4);
          for (let k = 0; k < 3; k++) {
            tone(1.8 + k * 0.42, 0.11, 'sine', 3200, 4200, 0.05);
            tone(1.93 + k * 0.42, 0.11, 'sine', 3900, 3100, 0.05);
          }
          break;
        case 'grind': burst(0, 4.2, 'lowpass', 300, 120, 0.5); burst(0.2, 3.6, 'bandpass', 700, 400, 0.12, 1.5); break;
        case 'tick': burst(0, 0.05, 'bandpass', 3000, 2600, 0.25, 5); break;
        case 'clunk': burst(0, 0.18, 'lowpass', 600, 150, 0.45); tone(0, 0.2, 'square', 160, 90, 0.04); break;
        case 'creak': tone(0, 0.9, 'sawtooth', 180, 260, 0.03); burst(0, 0.8, 'bandpass', 500, 900, 0.08, 6); break;
        case 'coins': for (let k = 0; k < 6; k++) tone(k * 0.07, 0.18, 'triangle', 2400 + k * 180, 2100 + k * 120, 0.04); break;
        default: break;
      }
    } catch (e) {
      // Sound is optional (no audio context in tests).
    }
  }

  /**
   * Bench only (`?erpz=` with tools/bench.mjs --q, on 2p-erebor): `off` nothing of mine happens; `beam` the sun set,
   * the solution's mirrors in their sockets and the rubble on its way dug (the whole ray drawn, the door held shut), both players by the sockets looking at the door; `open`
   * Durin's door open, both players in front of it looking in; `chest` each player at a rune chest with its lock open
   * (split screen). Once the players are placed (game.js botIntent) and the terrain is loaded.
   */
  benchEvents() {
    const mode = this.game.params.get('erpz');
    if (!mode || this.benchDone || !this.sites.live || !this.game.terrain.loaded || !this.game.players[0]?.botInit) return;
    this.benchDone = true;
    const [p, q] = this.game.players;
    const put = (pl, x, y, z, look) => {
      if (!pl) return;
      pl.pos.set(x, y + 0.05, z);
      pl.vel.set(0, 0, 0);
      if (look) pl.yaw = Math.atan2(-(look.x - x), -(look.z - z));
      pl.botLookFixed = true;
    };
    const d = this.sites.door;
    const front = (k) => ({ x: d.x + d.nx * k, z: d.z + d.nz * k });
    if (mode === 'beam' && d) {
      // `&erray=0`: the same places and mirrors, but morning (no ray): the A/B for the ray's own cost.
      this.forceEvening = this.game.params.get('erray') !== '0';
      for (const [id, rot] of this.solution || []) {
        const s = this.mirrors.sockets.find((o) => o.id === id);
        const m = this.mirrors.list.find((o) => o.where === 'floor');
        if (s && m) this.mirrors.mount(m, s, rot);
      }
      // The rubble on the ray's way dug away: the whole ray to the keyhole, the door held shut for the measurement.
      this.holdDoor = true;
      for (let k = 0; k < 30; k++) {
        const r = trace(this.sites.light, this.mirrors.rotations(), this.sites.sockets, this.sites.keyhole, this.sites.door, { cone: this.sites.cone });
        if (!r.blocked) break;
        digSphere(r.blocked.x, r.blocked.y, r.blocked.z, 0.7, 255);
      }
      const a = front(4.5);
      put(p, a.x - d.nz * 1.2, d.y, a.z + d.nx * 1.2, d);
      put(q, a.x + d.nz * 1.2, d.y, a.z - d.nx * 1.2, this.sites.light);
    } else if (mode === 'open' && d) {
      this.door.phase = 'open';
      this.door.t = 1;
      this.door.rewarded = true;
      this.applyDoor(1);
      const a = front(2.5);
      put(p, a.x - d.nz * 0.6, d.y, a.z + d.nx * 0.6, this.sites.behindDoor || d);
      put(q, a.x + d.nz * 0.6, d.y, a.z - d.nx * 0.6, this.sites.behindDoor || d);
    } else if (mode === 'chest' && this.chests.length) {
      [p, q].forEach((pl, k) => {
        const c = this.chests[k % this.chests.length];
        if (!pl || !c) return;
        const f = EreborSites.front(c);
        put(pl, c.x + f.x * 1.1, c.y, c.z + f.z * 1.1, c);
        c.busy = null;
        this.useChest(pl, k, c);
      });
    }
  }

  /* ---------------- save ---------------- */

  /** { door: 1 (open), room: 1 (rewarded), sock: { socketId: rot }, chests: [opened ids], read: [read ids] }, or undefined. */
  state() {
    if (this.forVersion < 0 || !this.sites.live) return this.saved || undefined;
    const out = {};
    if (this.door.phase === 'open') out.door = 1;
    if (this.door.rewarded) out.room = 1;
    if (this.key?.found) out.key = 1;
    const sock = {};
    for (const [id, rot] of this.mirrors.rotations()) sock[id] = rot;
    if (Object.keys(sock).length) out.sock = sock;
    const chests = this.chests.filter((c) => c.open).map((c) => c.id);
    if (chests.length) out.chests = chests;
    const read = this.chests.filter((c) => c.read).map((c) => c.id);
    if (read.length) out.read = read;
    return Object.keys(out).length ? out : undefined;
  }

  restore(s) {
    this.saved = s && typeof s === 'object' ? s : null;
    this.forVersion = -1;
  }
}

export { BEAM, MIRROR };
