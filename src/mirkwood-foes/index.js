/* ==== mirkwood-foes/index.js — the foes of layer 6, Mirkwood's roots (TERV 0.2 / 0.3 / 0.4 / 0.7, Decisions 2, 5, 18,
   21): the giant spiders and their silk (spiders.js, spider-body.js, webs.js), the Elvenking's guards and dungeon
   (elves.js, elf-body.js) and the barrel escape (barrels.js). Normal mode never kills: a spider binds a player in a
   cocoon and hangs him up (one find lost; struggle out, or a partner frees him with a hit), a guard captures him (the
   bag confiscated, a cell; pick the lock, a partner opens the door, Bilbo steals the keys with the Ring, or wait), the
   barrel ride gives the confiscated finds back.
   Wiring (game.js, small commented lines): `new MirkwoodFoes(game)`, `sites.use(MIRKWOOD_SITE_PROVIDER)`,
   `restore(save.mirkwood)`, `input(p, i, it)` per player with no menu open, `update(dt)` after the enemies,
   `cullFor(seen, i)` per view; save.js `mirkwood: game.mirkwood?.state()`; player.js asks `ride(p, dt, it)` (cocoon,
   barrel), `strike(p, o, d)` (webs, cell lock) and reads `p.slow` (web sheets). Combat reaches the spiders and guards
   through enemies/index.js addFoes(). Spiders and guards are never saved: they respawn on load. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { raycast, sdf } from '../world.js';
import { chunkKey, floorBelow } from '../enemies/sites.js';
import { FIND_TYPES } from '../finds.js';
import { Barrels, BARREL } from './barrels.js';
import { ELF_LOOKS } from './elf-body.js';
import { Elf, ELF } from './elves.js';
import { MirkwoodSites } from './sites.js';
import { SpiderBody, SPIDER_LOOKS } from './spider-body.js';
import { Spider, SPIDER } from './spiders.js';
import { Webs, WEB } from './webs.js';

/** Escapes and timings (seconds, presses). */
export const MIRK = {
  struggleWrap: 5, // dig presses that break free while being wrapped
  struggleCocoon: 10, // dig presses that tear the cocoon open
  hang: 1.1, // metres a cocoon is hoisted
  lockPicks: 12, // dig presses at the cell door to pick the lock (Bilbo, the burglar: 7)
  lockPicksBilbo: 7,
  waitOut: 120, // seconds until a guard leaves the cell door unbolted
  ringSlip: 6, // seconds an invisible prisoner waits at the door before he slips out
  captureFade: 0.6,
  doorOpen: 20, // seconds an opened door stays open
  grace: 3,
};

/** Key names per control scheme (as enemies/index.js and tutorial.js). */
const KEYS = {
  mouse: { dig: 'bal egérgomb', throw: 'G', use: 'E', taunt: 'T', move: 'A / D', push: 'W / S', ring: 'X' },
  keys2: { dig: 'U', throw: 'Ő', use: 'P', taunt: 'Ű', move: '← / →', push: '↑ / ↓', ring: 'Á' },
  pad: { dig: 'RT', throw: 'B', use: 'X', taunt: 'd-pad jobb', move: 'a bal kar', push: 'a bal kar', ring: 'd-pad bal' },
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** A wooden cell door with iron bars and bands (vertex colours; the barrel material's program). Hinge at x = 0. */
function doorGeometry() {
  const parts = [];
  const put = (geo, hex, x, y, z) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g.attributes.uv) g.deleteAttribute('uv');
    g.translate(x, y, z);
    const c = new THREE.Color(hex);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) {
      col[i] = c.r;
      col[i + 1] = c.g;
      col[i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  };
  // Elven work: a heavy oak frame with a pointed top rail, a grille of iron bars in the upper half.
  put(new THREE.BoxGeometry(0.08, 1.95, 0.08), 0x4a3420, 0.04, 0.975, 0);
  put(new THREE.BoxGeometry(0.08, 1.95, 0.08), 0x4a3420, 0.9, 0.975, 0);
  put(new THREE.BoxGeometry(0.94, 0.09, 0.08), 0x4a3420, 0.47, 1.93, 0);
  put(new THREE.BoxGeometry(0.94, 0.09, 0.08), 0x4a3420, 0.47, 0.06, 0);
  put(new THREE.BoxGeometry(0.82, 0.95, 0.05), 0x5a3e24, 0.47, 0.55, 0);
  put(new THREE.BoxGeometry(0.94, 0.07, 0.08), 0x4a3420, 0.47, 1.05, 0);
  for (let k = 0; k < 6; k++) put(new THREE.CylinderGeometry(0.014, 0.014, 0.86, 6), 0x2a2a2c, 0.12 + k * 0.14, 1.5, 0);
  for (const y of [0.3, 0.8]) put(new THREE.BoxGeometry(0.9, 0.05, 0.065), 0x2e2c2a, 0.47, y, 0.0);
  put(new THREE.BoxGeometry(0.1, 0.16, 0.09), 0x3a3836, 0.8, 0.95, 0.02);
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** The chief guard's ring of keys (book ch. 9: Bilbo takes them while the guards sleep off the wine). */
function keysGeometry() {
  const parts = [];
  const ring = new THREE.TorusGeometry(0.06, 0.008, 6, 16);
  ring.rotateX(Math.PI / 2);
  parts.push(ring);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const key = new THREE.BoxGeometry(0.012, 0.012, 0.11);
    key.translate(0, 0, 0.11);
    key.rotateY(a);
    parts.push(key);
    const bit = new THREE.BoxGeometry(0.03, 0.01, 0.02);
    bit.translate(0.012, 0, 0.16);
    bit.rotateY(a);
    parts.push(bit);
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
    if (p.attributes.uv) p.deleteAttribute('uv');
    const col = new Float32Array(p.attributes.position.count * 3).fill(0.55);
    for (let i = 0; i < col.length; i += 3) {
      col[i] = 0.62;
      col[i + 1] = 0.5;
      col[i + 2] = 0.3;
    }
    p.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return p;
  }));
  g.computeVertexNormals();
  return g;
}

export class MirkwoodFoes {
  constructor(game) {
    this.game = game;
    this.sites = new MirkwoodSites();
    this.spiders = [];
    this.elves = [];
    this.webs = new Webs(game);
    this.barrels = new Barrels(this);
    this.spawnT = 1;
    this.elfSpawnT = 1;
    this.visibleKeys = [null, null];
    this.ui = new Map();
    this.pending = null; // the save's per-slot state, applied once that slot's player is in the game
    this.slotState = []; // per slot: { conf: [find ids] }
    this.doors = []; // per cell: { open, openT, mesh, t }
    this.doorsFor = -1;
    this.keysTaken = null; // the player holding the keys
    this.keysMesh = null;
    this.matDoor = this.barrels.material;
    // Combat (enemies/combat.js) reaches the spiders, the guards and the cocoons (a hit frees the bound player).
    this.cocoonFoes = [];
    game.enemies?.addFoes(() => this.spiders);
    game.enemies?.addFoes(() => this.elves);
    game.enemies?.addFoes(() => this.cocoonFoes);
    // Shader warm-up: game.js compiles every visible material once at start; the web sheet, the cocoon, the barrel and
    // a spider (skinned, the character program) are shown for that one compile, then removed on the first update.
    this.warm = new THREE.Group();
    for (const m of [...this.webs.warmMeshes(), ...this.barrels.warmMeshes()]) this.warm.add(m);
    this.warmSpider = new SpiderBody(SPIDER_LOOKS[0]);
    this.warmSpider.floorY = () => -1000;
    this.warmSpider.animate({ dt: 0.016, speed: 0, grounded: false });
    this.warm.add(this.warmSpider.group);
    this.warm.scale.setScalar(1e-4);
    this.warm.position.set(0, -1000, 0);
    game.scene.add(this.warm);
  }

  /* ---------------- queries ---------------- */

  /** True when a player is not bound, captured, jailed or riding (may be chased, wrapped or captured). */
  free(p) {
    return p && !p.choosing && p.dead <= 0 && !p.wrap && !p.cocoon && !p.captured && !p.barrel;
  }

  /** A player the spiders and guards may go after (the Ring's wearer is invisible: enemies.canTarget asks gollum). */
  canTarget(p) {
    return this.free(p) && !p.jailed && (p.mirkGrace || 0) <= 0 && !!this.game.enemies?.canTarget(p);
  }

  canWrap(p) {
    return this.canTarget(p) && !p.held;
  }

  canCapture(p) {
    return this.canTarget(p);
  }

  lightPower(p) {
    return p.lightPower ?? 1;
  }

  farFromPlayers(pos, d) {
    return this.game.players.every((p) => p.choosing || p.pos.distanceTo(pos) > d);
  }

  /** Whether a point's chunk was seen by some view last frame. */
  seenAt(pos, dy = 0.5) {
    const k = chunkKey(pos.x, pos.y + dy, pos.z);
    return this.visibleKeys.some((v) => v && (k < 0 || v[k]));
  }

  seen(a) {
    return this.seenAt(a.pos);
  }

  sound(kind, pos) {
    this.game.enemies?.sound(kind, pos);
  }

  /** The next patrol point of a spider (near its home), or a random spot. */
  spiderWaypoint(s) {
    const pts = this.sites.spiderPatrol.filter((q) => Math.hypot(q.x - s.home.x, q.y - s.home.y, q.z - s.home.z) < 16);
    if (pts.length) {
      const q = pts[Math.floor(Math.random() * pts.length)];
      return new THREE.Vector3(q.x, q.y, q.z);
    }
    const a = Math.random() * Math.PI * 2;
    const r = 1.5 + Math.random() * 4;
    return new THREE.Vector3(s.home.x + Math.cos(a) * r, s.home.y, s.home.z + Math.sin(a) * r);
  }

  elfWaypoint(e) {
    const pts = this.sites.elfPatrol.filter((q) => Math.hypot(q.x - e.home.x, q.y - e.home.y, q.z - e.home.z) < 22);
    if (pts.length) {
      const q = pts[Math.floor(Math.random() * pts.length)];
      return new THREE.Vector3(q.x, q.y, q.z);
    }
    const a = Math.random() * Math.PI * 2;
    return new THREE.Vector3(e.home.x + Math.cos(a) * 3, e.home.y, e.home.z + Math.sin(a) * 3);
  }

  keysFor(i) {
    const b = this.game.bindings[i];
    return b?.pad != null && !b.kbm ? KEYS.pad : KEYS[b?.kbm] || KEYS.pad;
  }

  /* ---------------- spawning ---------------- */

  addSpider(pos, lurk = false, ceiling = null) {
    const look = SPIDER_LOOKS[Math.floor(Math.random() * SPIDER_LOOKS.length)];
    const s = new Spider(this, look, pos, lurk, ceiling);
    this.spiders.push(s);
    return s;
  }

  addElf(x, y, z, archer = false) {
    const look = ELF_LOOKS[Math.floor(Math.random() * ELF_LOOKS.length)];
    const e = new Elf(this, look, x, y, z, archer);
    this.elves.push(e);
    return e;
  }

  /** The ceiling above a point (up to 9 m), or null. */
  ceilingAbove(x, y, z) {
    const t = raycast(tmp.set(x, y, z), UP, 9);
    return t < 0 ? null : new THREE.Vector3(x, y + t, z);
  }

  /** Keeps spiders around the players inside the spiders' part of layer 6: lurkers over the nests, crawlers. */
  spawnSpiders(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 1;
    // Not in the Elvenking's halls (they are inside layer 6 too): the spiders keep to the roots.
    const inside = this.game.players.filter((p) => this.free(p) && p.depth > 1 && this.sites.inside(p.pos.x, p.pos.y, p.pos.z) && !this.sites.inHalls(p.pos.x, p.pos.y, p.pos.z));
    if (!inside.length || this.spiders.length >= SPIDER.maxActive) return;
    const testing = !!this.sites.test;
    const dist = (q) => Math.min(...inside.map((p) => Math.hypot(q.x - p.pos.x, q.y - p.pos.y, q.z - p.pos.z)));
    // A lurker over a nest that has none, out of sight (or in the test site).
    for (const n of this.sites.spiderNests) {
      const d = dist(n);
      if (d < 6 || d > 34) continue;
      if (this.spiders.some((s) => s.nest === n)) continue;
      const ceil = this.ceilingAbove(n.x, n.y + 0.5, n.z);
      const hang = new THREE.Vector3(n.x, ceil ? Math.max(n.y + 1.5, ceil.y - 1.6) : n.y + 2.5, n.z);
      if (!testing && this.seenAt(hang)) continue;
      const s = this.addSpider(hang, true, ceil || new THREE.Vector3(n.x, hang.y + 3, n.z));
      s.nest = n;
      this.spawnT = 2 + Math.random() * 3;
      return;
    }
    const pts = this.sites.spiderPatrol.filter((q) => {
      const d = dist(q);
      return d > 8 && d < 30 && (testing || !this.seenAt(q));
    });
    if (!pts.length) return;
    const q = pts[Math.floor(Math.random() * pts.length)];
    this.addSpider(new THREE.Vector3(q.x, q.y, q.z));
    this.spawnT = 4 + Math.random() * 5;
  }

  /** Keeps up to ELF.maxActive guards walking the halls around the players inside them. */
  spawnElves(dt) {
    this.elfSpawnT -= dt;
    if (this.elfSpawnT > 0) return;
    this.elfSpawnT = 1.5;
    const inHalls = this.game.players.filter((p) => !p.choosing && p.dead <= 0 && p.depth > 1 && this.sites.inHalls(p.pos.x, p.pos.y, p.pos.z));
    const guards = this.elves.filter((e) => !e.archer).length;
    if (!inHalls.length || guards >= ELF.maxActive) return;
    const testing = !!this.sites.test;
    const pts = this.sites.elfPatrol.filter((q) => {
      const d = Math.min(...inHalls.map((p) => Math.hypot(q.x - p.pos.x, q.y - p.pos.y, q.z - p.pos.z)));
      return d > 6 && d < 32 && (testing || !this.seenAt(q, 1));
    });
    if (!pts.length) return;
    const q = pts[Math.floor(Math.random() * pts.length)];
    this.addElf(q.x, q.y, q.z);
    this.elfSpawnT = 5 + Math.random() * 6;
  }

  /* ---------------- the spiders' silk: wrap, cocoon, release ---------------- */

  startWrap(spider, p) {
    spider.wrapping = p;
    p.wrap = { spider, t: 0, presses: 0 };
    p.held = null;
    this.sound('wrap', p.pos);
    p.say('Egy pók gúzsba köt! Szabadulj: nyomd többször az ásás gombot!', 3);
    for (const q of this.game.players) if (q !== p && !q.choosing) q.say(`${p.ch.name}t gúzsba köti egy pók! Üsd meg a pókot!`, 3);
  }

  /** The wrap ends: freed (a hit or struggling) or, when `freed` is false, the spider went away. */
  releaseWrap(p, freed) {
    if (!p.wrap) return;
    const s = p.wrap.spider;
    if (s) s.wrapping = null;
    p.wrap = null;
    p.mirkGrace = MIRK.grace;
    if (freed) p.say('Kiszabadultál a pók szorításából!', 2);
  }

  /** The wrap is complete: the cocoon closes, hoisted up on a line; one find is lost. */
  closeCocoon(p) {
    const s = p.wrap?.spider;
    p.wrap = null;
    if (s) {
      s.wrapping = null;
      // The spider leaves its catch hanging and goes back to its lurking (book: the dwarves hung up for later).
      s.flee(p.pos, 3);
      s.scared = false;
    }
    const ceil = this.ceilingAbove(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
    const lift = ceil ? Math.max(0, Math.min(MIRK.hang, ceil.y - (p.pos.y + p.eyeH + 0.5))) : MIRK.hang;
    p.pos.y += lift;
    p.vel.set(0, 0, 0);
    const top = new THREE.Vector3(p.pos.x, p.pos.y + p.eyeH + 0.3, p.pos.z);
    p.cocoon = { top, ceil: ceil || top.clone().add(new THREE.Vector3(0, 4, 0)), t: 0, presses: 0, pos: p.pos.clone() };
    let lost = null;
    if (p.bag.length) lost = p.bag.splice(Math.floor(Math.random() * p.bag.length), 1)[0];
    p.say(lost ? `Gubóba szőttek, és felakasztottak! Odaveszett: ${lost.name}. Szakítsd szét: nyomd többször az ásás gombot!` : 'Gubóba szőttek, és felakasztottak! Szakítsd szét: nyomd többször az ásás gombot!', 4.5);
    for (const q of this.game.players) if (q !== p && !q.choosing) q.say(`${p.ch.name} gubóban lóg! Üsd meg a gubót (csákány, kő, nyíl), és kiszabadul.`, 4);
    this.sound('wrap', p.pos);
    this.hint(p, 'pok');
  }

  /** The cocoon tears open (struggling or a partner's blow): the player drops to the floor. */
  freeCocoon(p, by) {
    if (!p.cocoon) return;
    p.cocoon = null;
    this.webs.hideCocoon(p);
    p.vel.set(0, -1, 0);
    p.mirkGrace = MIRK.grace;
    p.kick = 0.8;
    this.sound('tear', p.pos);
    p.say(by ? `${by.ch.name} kiszabadított a gubóból!` : 'Széttépted a gubót!', 2.5);
  }

  /* ---------------- the Elvenking's guards: capture, cells, doors, keys ---------------- */

  elfCall(elf, p, text) {
    this.sound('elf', elf.pos);
    if (p) p.say(`Tünde-őr: „${text}”`, 2.5);
  }

  /** A guard seizes a player: fade out, the bag confiscated, into a free cell, fade in. */
  capture(elf, p) {
    const cells = this.sites.cells;
    if (!cells.length) {
      // No dungeon here (should not happen in layer 6): just a shove.
      tmp.set(p.pos.x - elf.pos.x, 0, p.pos.z - elf.pos.z).normalize();
      p.knock?.(tmp.x, tmp.z, 6);
      p.mirkGrace = MIRK.grace;
      return;
    }
    p.captured = { t: 0, by: elf, moved: false };
    p.held = null;
    this.sound('elf', p.pos);
    p.say('A tündék elfogtak!', 2);
    for (const q of this.game.players) if (q !== p && !q.choosing) q.say(`${p.ch.name}t elfogták a tündék, és a király börtönébe vitték!`, 4);
  }

  /** Index of a free cell (nobody in it, the door shut), nearest to the cells' first one when all are taken. */
  freeCell() {
    const cells = this.sites.cells;
    for (let i = 0; i < cells.length; i++) if (!this.game.players.some((q) => q.jailed === i)) return i;
    return 0;
  }

  /** Puts a player into cell i (door shut). */
  jail(p, i) {
    const c = this.sites.cells[i];
    if (!c) return;
    this.ensureDoors();
    p.jailed = i;
    p.jailT = 0;
    p.lockPicks = 0;
    p.ringT = 0;
    const fl = floorBelow(c.x, c.y + 1.5, c.z, 4) || { x: c.x, y: c.y, z: c.z };
    p.pos.set(fl.x, fl.y, fl.z);
    p.vel.set(0, 0, 0);
    // Facing the door.
    p.yaw = Math.atan2(-(c.door.x - c.x), -(c.door.z - c.z));
    const d = this.doors[i];
    if (d) {
      d.open = false;
      d.openT = 0;
    }
    this.fx()?.setCellDoor?.(i, false);
  }

  /** Layer 6's own effects module (underground/mirkwood-fx.js: the webs, the cell doors, the trapdoor's hatch), if any. */
  fx() {
    return this.sites.src.fx || null;
  }

  /** The bag goes into the confiscated store (per slot; the barrel ride gives it back). */
  confiscate(p) {
    const st = (this.slotState[p.slot] ||= { conf: [] });
    st.conf.push(...p.bag.map((f) => f.id));
    const n = p.bag.length;
    p.bag = [];
    return n;
  }

  /** The end of the barrel ride: this player's confiscated finds back into the bag (the rest left in a sack). */
  recover(p, at) {
    this.game.journal?.mark?.('hordo'); // journal (NOTES-9-journal): the barrel escape (the ride's end)
    const st = this.slotState[p.slot];
    if (!st || !st.conf.length) {
      p.say('Kijutottál a folyón! Szabad vagy.', 3);
      return;
    }
    const byId = new Map(FIND_TYPES.map((f) => [f.id, f]));
    const items = st.conf.map((id) => byId.get(id)).filter(Boolean);
    st.conf = [];
    const room = Math.max(0, p.bagCap - p.bag.length);
    p.bag.push(...items.slice(0, room));
    const rest = items.slice(room);
    if (rest.length) this.game.sacks.drop(at.x + 0.6, at.y, at.z, rest);
    p.say(rest.length ? `Kijutottál! Visszaszerezted az elkobzott leleteidet; ${rest.length} nem fért a zsákba, ott a zsák melletted.` : `Kijutottál! Visszaszerezted az elkobzott leleteidet (${items.length}).`, 5);
    this.game.saveNow?.();
  }

  /** The door states, and door meshes unless layer 6 draws its own (mirkwood-fx.js setCellDoor; they start open). */
  ensureDoors() {
    if (this.doorsFor === this.sites.version) return;
    for (const d of this.doors) if (d.mesh) this.game.scene.remove(d.mesh);
    this.doorsFor = this.sites.version;
    const own = !this.fx()?.setCellDoor;
    const geo = own ? (this.doorGeo ||= doorGeometry()) : null;
    this.doors = this.sites.cells.map((c) => {
      const d = { open: !own, openT: 0, ang: own ? 0 : -1.6, mesh: null };
      if (own) {
        // The door's plane: across the line from the cell's centre to the door; the hinge at its left edge.
        const nx = c.door.x - c.x;
        const nz = c.door.z - c.z;
        const l = Math.hypot(nx, nz) || 1;
        const yaw = Math.atan2(nx / l, nz / l);
        const pivot = new THREE.Group();
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const fl = floorBelow(c.door.x, c.door.y + 1, c.door.z, 3);
        pivot.position.set(c.door.x - right.x * 0.47, fl ? fl.y - 0.12 : c.door.y - 0.9, c.door.z - right.z * 0.47);
        pivot.rotation.y = yaw;
        const m = new THREE.Mesh(geo, this.matDoor);
        m.name = 'cell-door';
        pivot.add(m);
        this.game.scene.add(pivot);
        d.mesh = pivot;
        d.yaw = yaw;
      }
      return d;
    });
  }

  /** Opens cell door i (and frees whoever is in it). */
  openDoor(i, how, by) {
    const d = this.doors[i];
    if (!d || d.open) return;
    d.open = true;
    d.openT = MIRK.doorOpen;
    this.fx()?.setCellDoor?.(i, true);
    this.sound('door', this.sites.cells[i].door);
    for (const p of this.game.players) {
      if (p.jailed !== i) continue;
      p.jailed = null;
      this.game.journal?.mark?.('cella'); // journal (NOTES-9-journal): the cell escape
      p.mirkGrace = MIRK.grace + 2;
      const msg = {
        pick: 'Kifeszítetted a zárat! Az ajtó nyitva. A leleteidet a pincében, hordóban menekülve szerezheted vissza.',
        partner: `${by?.ch.name || 'A társad'} kinyitotta a cellád ajtaját!`,
        keys: `${by?.ch.name || 'Bilbó'} kinyitotta az ajtót a kulcsokkal!`,
        ring: 'Láthatatlanul kisurransz, amikor az őr benéz az üresnek hitt cellába.',
        wait: 'Egy tünde-őr nyitva hagyta az ajtót… Szökj!',
      }[how];
      p.say(msg, 4);
    }
  }

  /** The key spot: the provider's `keys`, or beside the cellar. */
  keySpot() {
    const s = this.sites.src;
    if (s.keys) return s.keys;
    const c = this.sites.cellar;
    return c ? { x: c.x + 1.2, y: c.y, z: c.z + 0.6 } : null;
  }

  /* ---------------- input ---------------- */

  /** Per player, no menu open: struggling, lock picking, the use key (barrels, doors, keys) and Bilbo's taunt. */
  input(p, i, it) {
    if (p.choosing || p.dead > 0) return;
    if (p.wrap) {
      if (it.digPressed) {
        p.wrap.presses++;
        p.kick = 0.6;
        if (p.wrap.presses >= MIRK.struggleWrap) {
          const s = p.wrap.spider;
          this.releaseWrap(p, true);
          s?.hit(p.pos.x, p.pos.z, 0.8, 'struggle');
        }
      }
      return;
    }
    if (p.cocoon) {
      if (it.digPressed) {
        p.cocoon.presses++;
        p.kick = 0.5;
        this.sound('tear', p.pos);
        if (p.cocoon.presses >= MIRK.struggleCocoon) this.freeCocoon(p, null);
      }
      return;
    }
    if (p.captured || p.barrel) return;
    if (it.tauntPressed && p.ch.id === 'bilbo') this.taunt(p);
    if (!it.interactPressed) return;
    // The trapdoor: into the barrels.
    const trap = this.sites.trapdoor;
    if (trap && !p.jailed && p.pos.distanceTo(tmp.set(trap.x, trap.y, trap.z)) < 2.2) {
      if (this.barrels.start(p)) return;
    }
    this.ensureDoors();
    // The keys: only an invisible Bilbo can take them from the sleeping guard.
    const ks = this.keySpot();
    if (ks && !this.keysTaken && Math.hypot(p.pos.x - ks.x, p.pos.z - ks.z) < 1.4 && Math.abs(p.pos.y - ks.y) < 2) {
      if (this.game.gollum?.isInvisible(p)) {
        this.keysTaken = p;
        p.say('Elcsented a kulcsokat a szunyókáló őr mellől! Ezekkel bármelyik cellát kinyithatod.', 4);
        this.sound('lock', p.pos);
      } else p.say('Az őr kulcsai… Ha meglátnak, nem viheted el őket.', 2.5);
      return;
    }
    // A cell door from outside: open it (the bolt), or with the keys.
    this.sites.cells.forEach((c, k) => {
      if (p.jailed != null) return;
      const d = this.doors[k];
      if (!d || d.open || p.pos.distanceTo(tmp.set(c.door.x, c.door.y, c.door.z)) > 1.8) return;
      this.openDoor(k, this.keysTaken === p ? 'keys' : 'partner', p);
    });
  }

  /** Bilbo's taunt (the book's "Attercop" songs): spiders within reach come to where he shouted. */
  taunt(p) {
    if ((p.tauntCd || 0) > 0) return;
    p.tauntCd = 4;
    let n = 0;
    for (const s of this.spiders) {
      if (s.pos.distanceTo(p.pos) < SPIDER.taunt) {
        s.taunt(p.pos);
        n++;
      }
    }
    // The book's "Attercop" song: its Hungarian wording is [ellenőrizendő] (NOTES-4b), so it is paraphrased, not quoted.
    p.say(n ? 'Gúnydalt kiáltasz a pókoknak, csúfolod őket — dühösen feléd tartanak!' : 'Csúfolódsz… de nincs itt pók, aki hallaná.', 2.5);
    p.taunting = 1.2;
    this.sound('hiss', p.pos);
  }

  /**
   * player.tryDig: a web sheet in front is cut (pick: a few swings, Sting: one); a jailed player's swing at the door
   * picks the lock. Returns true when the swing was used here (no digging).
   */
  strike(p, o, d) {
    if (p.jailed != null) {
      const c = this.sites.cells[p.jailed];
      if (c && p.pos.distanceTo(tmp.set(c.door.x, c.door.y, c.door.z)) < 1.9) this.pickLock(p);
      else p.say('A cella falát nem áshatod ki: a tündék varázslattal védik. Az ajtónál feszítsd fel a zárat!', 2.5);
      return true;
    }
    const hit = this.webs.sheetOnRay(o, d, 2.6);
    if (hit) {
      const sting = !!p.sting;
      const cut = this.webs.hit(hit.s, sting);
      this.sound('tear', tmp.copy(o).addScaledVector(d, hit.t));
      if (sting) this.game.enemies?.sting.stab(p);
      p.say(cut ? 'Átvágtad a pókhálót!' : 'A háló enged… üsd még!', 1.2);
      return true;
    }
    return false;
  }

  pickLock(p) {
    p.lockPicks = (p.lockPicks || 0) + 1;
    p.kick = 0.4;
    this.sound('lock', p.pos);
    const need = p.ch.id === 'bilbo' ? MIRK.lockPicksBilbo : MIRK.lockPicks;
    if (p.lockPicks >= need) this.openDoor(p.jailed, 'pick', p);
  }

  /** player.js: the own update of a bound or riding player (no walking). Returns true when it took over. */
  ride(p, dt, it) {
    if (p.barrel) return this.barrels.ride(p, dt, it);
    if (p.wrap) {
      p.vel.x = 0;
      p.vel.z = 0;
      return false; // gravity and collision still apply (player.update continues with no steering: see `bound`)
    }
    if (p.cocoon) {
      p.pos.copy(p.cocoon.pos);
      p.vel.set(0, 0, 0);
      p.grounded = false;
      p.climbing = false;
      return true;
    }
    return false;
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    const game = this.game;
    if (this.warm) {
      game.scene.remove(this.warm);
      this.warmSpider.dispose();
      this.warm = null;
      this.warmSpider = null;
    }
    this.applyPending();
    this.webs.build(this.sites);
    if (game.bench) this.benchFoes();
    if (this.sites.cells.length) this.ensureDoors();
    for (const p of game.players) {
      p.mirkGrace = Math.max(0, (p.mirkGrace || 0) - dt);
      p.tauntCd = Math.max(0, (p.tauntCd || 0) - dt);
      p.taunting = Math.max(0, (p.taunting || 0) - dt);
      // Web sheets slow the walk (player.js reads p.slow).
      p.slow = !p.choosing && p.dead <= 0 && this.webs.sheets.length && this.webs.sheetAt(tmp.set(p.pos.x, p.pos.y + 0.8, p.pos.z)) ? WEB.slow : 1;
      if (p.slow < 1 && !p.webSaid) {
        p.webSaid = true;
        p.say('Beleragadtál egy pókhálóba! Vágd át csákánnyal vagy Fullánkkal.', 2.5);
      } else if (p.slow === 1) p.webSaid = false;
      if (p.dead > 0) {
        // A death (hunger, a fall) ends every Mirkwood state.
        if (p.wrap) this.releaseWrap(p, false);
        if (p.cocoon) this.freeCocoon(p, null);
        p.captured = null;
        p.jailed = null;
      }
      this.updateWrap(p, dt);
      this.updateCapture(p, dt);
      this.updateJail(p, dt);
    }
    this.spawnSpiders(dt);
    this.spawnElves(dt);
    for (const s of this.spiders) s.update(dt);
    for (const e of this.elves) e.update(dt);
    // Gone: far from everybody and unseen (never mid-wrap; never the barrel archers while the ride lasts).
    for (const s of this.spiders) {
      if (s.state !== 'gone' && s.state !== 'wrap' && this.farFromPlayers(s.pos, SPIDER.despawn) && !this.seen(s)) s.set('gone');
      if (s.pos.y < -2000) s.set('gone');
    }
    for (const e of this.elves) {
      if (e.state !== 'gone' && !e.archer && this.farFromPlayers(e.pos, ELF.despawn) && !this.seen(e)) e.set('gone');
    }
    if (this.spiders.some((s) => s.state === 'gone')) {
      for (const s of this.spiders) if (s.state === 'gone') s.dispose();
      this.spiders = this.spiders.filter((s) => s.state !== 'gone');
    }
    if (this.elves.some((e) => e.state === 'gone')) {
      for (const e of this.elves) if (e.state === 'gone') e.dispose();
      this.elves = this.elves.filter((e) => e.state !== 'gone');
    }
    this.barrels.update(dt);
    this.webs.update(dt, (c) => this.seenAt(c, 0));
    this.updateDoors(dt);
    this.updateCocoonFoes();
    this.updateLines();
    this.updateHints(dt);
  }

  /** Wrapping in progress: the cocoon closes after SPIDER.wrapTime unless the player broke free or was freed. */
  updateWrap(p, dt) {
    if (p.wrap) {
      p.wrap.t += dt;
      p.vel.x = 0;
      p.vel.z = 0;
      if (Math.floor(p.wrap.t * 5) !== Math.floor((p.wrap.t - dt) * 5)) p.kick = Math.max(p.kick || 0, 0.35);
      const s = p.wrap.spider;
      if (!s || s.state !== 'wrap' || s.wrapping !== p || this.game.gollum?.isInvisible(p)) this.releaseWrap(p, false);
      else if (p.wrap.t >= SPIDER.wrapTime) this.closeCocoon(p);
    }
    if (p.cocoon) p.cocoon.t += dt;
  }

  /** The capture's fade: out, the bag confiscated, into a cell, in. */
  updateCapture(p, dt) {
    const c = p.captured;
    if (!c) return;
    c.t += dt;
    const F = MIRK.captureFade;
    p.vel.set(0, Math.min(0, p.vel.y), 0);
    if (c.t < F) p.fade = c.t / F;
    else if (!c.moved) {
      c.moved = true;
      const n = this.confiscate(p);
      this.jail(p, this.freeCell());
      p.fade = 1;
      p.say(n ? `A Tünde-király börtönébe vetettek, és elkobozták a leleteidet (${n}).` : 'A Tünde-király börtönébe vetettek.', 4.5);
      this.hint(p, 'fogsag');
      this.game.saveNow?.();
    } else if (c.t < F * 2.5) p.fade = Math.max(0, 1 - (c.t - F * 1.5) / F);
    else {
      p.fade = 0;
      p.captured = null;
    }
  }

  /** In a cell: kept inside while the door is shut; the Ring slips him out; waiting long enough opens it. */
  updateJail(p, dt) {
    if (p.jailed == null) return;
    const i = p.jailed;
    const c = this.sites.cells[i];
    if (!c) {
      p.jailed = null;
      return;
    }
    p.jailT = (p.jailT || 0) + dt;
    // Confinement: layer 6's shut door is a collider and the cell's shell is undiggable (mirkwood-fx.js, sites.js
    // LOCKS); without them (a test site) the player is kept within the cell, short of the door's plane.
    if (!this.fx()?.setCellDoor) {
      const r = Math.max(0.6, Math.hypot(c.door.x - c.x, c.door.z - c.z) - 0.4);
      const dx = p.pos.x - c.x;
      const dz = p.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > r) {
        p.pos.x = c.x + (dx / d) * r;
        p.pos.z = c.z + (dz / d) * r;
      }
    }
    if (this.game.gollum?.isInvisible(p)) {
      p.ringT = (p.ringT || 0) + dt;
      if (p.ringT > MIRK.ringSlip) this.openDoor(i, 'ring', p);
    } else p.ringT = 0;
    if (p.jailT > MIRK.waitOut) this.openDoor(i, 'wait', p);
  }

  updateDoors(dt) {
    for (let i = 0; i < this.doors.length; i++) {
      const d = this.doors[i];
      if (d.open) {
        d.openT -= dt;
        // An opened door simply stays open (layer 6's doors stand open in a new session too); only jail() shuts one.
        if (d.openT <= 0) d.openT = 0;
      }
      const want = d.open ? -1.6 : 0;
      d.ang += (want - d.ang) * Math.min(1, dt * 3);
      if (d.mesh) d.mesh.children[0].rotation.y = d.ang;
    }
    // The keys lie by the sleeping guard until taken.
    const ks = this.keySpot();
    if (ks && !this.keysTaken) {
      if (!this.keysMesh) {
        this.keysMesh = new THREE.Mesh(keysGeometry(), this.matDoor);
        this.keysMesh.name = 'guard-keys';
        const fl = floorBelow(ks.x, ks.y + 0.3, ks.z, 3) || ks;
        this.keysMesh.position.set(fl.x, fl.y + 0.02, fl.z);
        this.game.scene.add(this.keysMesh);
      }
    } else if (this.keysMesh) {
      this.game.scene.remove(this.keysMesh);
      this.keysMesh = null;
    }
  }

  /** The cocoons as foes for the combat: any hit (pick, Sting, stone, arrow, charge) tears one open. */
  updateCocoonFoes() {
    this.cocoonFoes.length = 0;
    for (const p of this.game.players) {
      if (!p.cocoon) continue;
      const mgr = this;
      const victim = p;
      this.cocoonFoes.push({
        pos: tmp2.set(p.pos.x, p.pos.y, p.pos.z).clone(), scale: 1, state: 'cocoon', hitY0: 0.2, hitY1: p.eyeH + 0.2, hitR: 0.15,
        hit(fromX, fromZ, power, kind) {
          // The victim cannot hit his own cocoon (he is inside); somebody else's blow frees him.
          const by = mgr.game.players.find((q) => q !== victim && Math.hypot(q.pos.x - fromX, q.pos.z - fromZ) < 3) || null;
          if (kind === 'struggle') return;
          mgr.freeCocoon(victim, by);
        },
      });
    }
  }

  /** The draglines: lurking / dropping spiders and the hanging cocoons. */
  updateLines() {
    this.webs.beginLines();
    for (const s of this.spiders) {
      const top = s.threadTop();
      if (top) this.webs.line(top, tmp.set(s.pos.x, s.pos.y + 0.75 * s.scale, s.pos.z));
    }
    for (const p of this.game.players) {
      if (!p.cocoon) continue;
      const sway = Math.sin(p.cocoon.t * 1.3) * 0.5 + (p.cocoon.presses ? Math.sin(p.cocoon.t * 14) * 0.3 : 0);
      this.webs.cocoon(p, p.cocoon.top, sway);
      this.webs.line(p.cocoon.ceil, p.cocoon.top);
    }
    this.webs.endLines();
  }

  /* ---------------- per view ---------------- */

  cullFor(visible, viewIndex = 0) {
    this.visibleKeys[viewIndex] = visible;
    const vis = (x, y, z) => {
      const k = chunkKey(x, y, z);
      return k < 0 || !!visible[k];
    };
    for (const s of this.spiders) s.group.visible = vis(s.pos.x, s.pos.y + 0.3, s.pos.z) || vis(s.pos.x, s.pos.y + 1.2, s.pos.z);
    for (const e of this.elves) e.group.visible = vis(e.pos.x, e.pos.y + 0.3, e.pos.z) || vis(e.pos.x, e.pos.y + 1.6, e.pos.z);
    for (const d of this.doors) if (d.mesh) d.mesh.visible = vis(d.mesh.position.x, d.mesh.position.y + 1, d.mesh.position.z);
    if (this.keysMesh) this.keysMesh.visible = vis(this.keysMesh.position.x, this.keysMesh.position.y + 0.2, this.keysMesh.position.z);
    // A cocooned player's body is hidden: the cocoon stands for him.
    for (const p of this.game.players) if (p.cocoon) p.body.visible = false;
  }

  /* ---------------- hints and the per-player overlay ---------------- */

  /** One parchment hint per game with this player's keys (saved in the tutorial's done list). */
  hint(p, id) {
    const i = this.game.players.indexOf(p);
    if (i < 0) return;
    const k = this.keysFor(i);
    const bilbo = p.ch.id === 'bilbo';
    const text = {
      pok: `<b style="color:var(--gold,#e8c070)">Óriáspókok!</b> Gubóba szőnek és felakasztanak, közben elvesztesz egy leletet. Üsd őket csákánnyal (${k.dig}), dobálj rájuk követ (${k.throw}); az erős fény távol tartja őket. A pókhálót csákánnyal vagy Fullánkkal vághatod át. Gubóban: nyomd többször (${k.dig}); a társad egy ütéssel kiszabadít.${bilbo ? ` A Gyűrűvel (${k.ring}) nem látnak; csúfolódással (${k.taunt}) magadhoz csalod őket.` : ''}`,
      fogsag: `<b style="color:var(--gold,#e8c070)">A Tünde-király börtönében vagy.</b> A leleteidet elkobozták. Feszítsd fel a zárat: üss az ajtónál (${k.dig}); a társad kívülről kinyitja (${k.use}); vagy várj. Az elkobzott leleteket a pincéből, hordóban menekülve kapod vissza.${bilbo ? ' A Gyűrűvel láthatatlanul kisurranhatsz, és ellophatod az őr kulcsait.' : ''}`,
      hordo: `<b style="color:var(--gold,#e8c070)">Hordós szökés!</b> Kormányozz (${k.move}), gyorsíts vagy lassíts (${k.push}), kerüld ki a sziklákat. A tündék nyilai csak meglökik a hordót. A folyó végén visszakapod az elkobzott leleteidet.`,
    }[id];
    this.game.tutorial?.hint?.(i, p, id, text);
  }

  onBarrelStart(p) {
    this.hint(p, 'hordo');
  }

  updateHints(dt) {
    const game = this.game;
    game.players.forEach((p, i) => {
      if (p.choosing) return;
      // The first spider near a player.
      if (!game.tutorial?.done?.has('pok') && this.canTarget(p) && this.spiders.some((s) => s.pos.distanceTo(p.pos) < 14)) this.hint(p, 'pok');
      const el = game.huds[i]?.el;
      if (!el) return;
      let ui = this.ui.get(p);
      if (!ui || ui.root !== el) {
        ui = { root: el, prompt: document.createElement('div'), silk: document.createElement('div'), text: '', silkOn: false };
        Object.assign(ui.prompt.style, {
          position: 'absolute', left: '50%', top: '58%', transform: 'translateX(-50%)', fontSize: '17px', color: 'var(--gold, #e8c070)',
          textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '6', whiteSpace: 'nowrap',
        });
        // The cocoon from inside: silk strands closing in at the edges of the view (CSS only, no full-screen pass).
        Object.assign(ui.silk.style, {
          position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '4', display: 'none',
          background: 'radial-gradient(ellipse at 50% 45%, transparent 38%, rgba(226,222,212,0.45) 62%, rgba(236,232,222,0.88) 86%)',
          // Silk strands across the view, thin and broken (masked to the edges by the same falloff).
          WebkitMaskImage: 'none',
        });
        ui.strands = document.createElement('div');
        Object.assign(ui.strands.style, {
          position: 'absolute', inset: '0', pointerEvents: 'none',
          background: 'repeating-linear-gradient(62deg, transparent 0 34px, rgba(240,236,228,0.28) 35px 36px), repeating-linear-gradient(-58deg, transparent 0 46px, rgba(240,236,228,0.22) 47px 48px)',
          maskImage: 'radial-gradient(ellipse at 50% 45%, transparent 30%, #000 75%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, transparent 30%, #000 75%)',
        });
        ui.silk.appendChild(ui.strands);
        el.append(ui.silk, ui.prompt);
        this.ui.set(p, ui);
      }
      const silk = !!(p.cocoon || p.wrap);
      if (silk !== ui.silkOn) {
        ui.silkOn = silk;
        ui.silk.style.display = silk ? 'block' : 'none';
      }
      ui.silk.style.opacity = p.wrap ? Math.min(1, p.wrap.t / SPIDER.wrapTime) * 0.8 : '1';
      const k = this.keysFor(i);
      let text = '';
      if (p.wrap) text = `Szabadulj! ${k.dig} (${p.wrap.presses}/${MIRK.struggleWrap})`;
      else if (p.cocoon) text = `Szakítsd szét a gubót: ${k.dig} (${p.cocoon.presses}/${MIRK.struggleCocoon})`;
      else if (p.jailed != null) {
        const c = this.sites.cells[p.jailed];
        const need = p.ch.id === 'bilbo' ? MIRK.lockPicksBilbo : MIRK.lockPicks;
        const near = c && p.pos.distanceTo(tmp.set(c.door.x, c.door.y, c.door.z)) < 1.9;
        text = near ? `Feszítsd fel a zárat: ${k.dig} (${p.lockPicks || 0}/${need})` : 'Börtönben vagy. Menj az ajtóhoz.';
      } else if (!p.barrel && !p.captured && p.dead <= 0) {
        const trap = this.sites.trapdoor;
        if (trap && p.pos.distanceTo(tmp.set(trap.x, trap.y, trap.z)) < 2.2 && !this.barrels.active()) text = `Hordóba, és le a folyóra: ${k.use}`;
        else {
          this.sites.cells.forEach((c, j) => {
            const d = this.doors[j];
            if (!text && d && !d.open && this.game.players.some((q) => q.jailed === j) && p.pos.distanceTo(tmp.set(c.door.x, c.door.y, c.door.z)) < 1.8) text = `Nyisd ki a cellát: ${k.use}`;
          });
          const ks = this.keySpot();
          if (!text && ks && !this.keysTaken && Math.hypot(p.pos.x - ks.x, p.pos.z - ks.z) < 1.4 && Math.abs(p.pos.y - ks.y) < 2) text = `Az őr kulcsai: ${k.use}`;
        }
      }
      if (text !== ui.text) {
        ui.text = text;
        ui.prompt.textContent = text;
      }
    });
  }

  /**
   * Bench only (`?mfoes=` with tools/bench.mjs --q): `off` no spiders or guards; `spiders` 4 spiders kept in front of
   * player 1 (the worst case in view) on 2p-mirkwood; `halls` both players moved into the king's hall with 3 guards
   * walking in view. Once the players are placed (game.js botIntent) and the terrain is loaded.
   */
  benchFoes() {
    const mode = this.game.params.get('mfoes');
    if (!mode || this.benchDone || !this.game.terrain.loaded || !this.game.players[0]?.botInit) return;
    this.benchDone = true;
    this.spawnT = 1e9;
    this.elfSpawnT = 1e9;
    if (mode === 'off') return;
    const [p, q] = this.game.players;
    if (mode === 'halls') {
      p.pos.set(3.4, -345.95, -6.7);
      p.yaw = Math.PI / 2;
      if (q) {
        q.pos.set(-2.6, -345.95, -5.0);
        q.yaw = -Math.PI / 2;
      }
      for (const [x, z] of [[0.5, -6.0], [-1.5, -7.4], [-0.5, -5.0]]) this.addElf(x, -345.95, z);
      return;
    }
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    for (let k = 0; k < 4; k++) {
      const d = 4 + k * 1.6;
      const x = p.pos.x + fx * d + (k % 2 ? 1.2 : -1.2);
      const z = p.pos.z + fz * d;
      const f = floorBelow(x, p.pos.y + 2.5, z, 6);
      if (f) this.addSpider(new THREE.Vector3(f.x, f.y, f.z)).state = 'patrol';
    }
  }

  /* ---------------- save ---------------- */

  /** Per slot: in a cell (its index) and the confiscated finds; a missing field means none. */
  state() {
    const slots = [...(this.save?.slots || [])];
    this.game.players.forEach((p, i) => {
      if (p.choosing) return;
      const st = this.slotState[p.slot];
      const jailed = p.captured ? this.freeCell() : p.jailed;
      const out = {};
      if (jailed != null) out.jailed = jailed;
      if (st?.conf?.length) out.conf = [...st.conf];
      slots[i] = Object.keys(out).length ? out : null;
    });
    return slots.some(Boolean) ? { slots } : undefined;
  }

  restore(s) {
    this.save = s || null;
    this.pending = (s?.slots || []).map((x) => x || null);
  }

  /** The save's per-slot state, once that slot's player is in the game (a continued game: right after start). */
  applyPending() {
    if (!this.pending) return;
    let left = false;
    this.game.players.forEach((p, i) => {
      const st = this.pending[i];
      if (!st) return;
      // A prisoner waits for layer 6's cells (the provider) before he is put back.
      if (p.choosing || (st.jailed != null && !this.sites.cells.length)) {
        left = true;
        return;
      }
      this.pending[i] = null;
      this.slotState[p.slot] = { conf: Array.isArray(st.conf) ? st.conf.filter((id) => typeof id === 'string') : [] };
      if (st.jailed != null && this.sites.cells[st.jailed]) this.jail(p, st.jailed);
    });
    if (!left && this.pending.every((x) => !x)) this.pending = null;
  }
}

export { BARREL, MIRK as MIRKWOOD };
