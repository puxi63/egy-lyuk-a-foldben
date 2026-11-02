/* ==== bagend/index.js — Zsáklak belseje (TERV 0.13): the interior as its own scene far from the world (x = 400),
   entering and leaving through the round green door with a fade, per-player inside / outside (split screen renders
   per view), the furnishing slots with tiers bought from the shared purse, the per-player slot menu, the room
   effects, save state and the interior's own collision ====
 * The integrator wires it into game.js / player.js / save.js as described in NOTES-1c-bagend.md:
 *   this.bagEnd = new BagEnd(this)                       (constructor, after the players' scene exists)
 *   menuOpen = this.bagEnd.input(p, i, it) || …          (per player, before p.update)
 *   this.bagEnd.update(dt)                               (once per frame)
 *   if (!this.bagEnd.renderView(p, r)) r.render(…)       (per view)
 *   player.collide(): if (game.bagEnd?.isInside(this)) return game.bagEnd.collide(this)
 *   snapshot(): bagEnd: game.bagEnd.state()  /  restore: game.bagEnd.restore(save.bagEnd) */
import * as THREE from 'three';
import { COOP } from '../config.js';
import { FIND_TYPES } from '../finds.js';
import { BAG_END } from '../surface/bagend.js';
import { buildAtlas } from './atlas.js';
import { Builder, mergeChunks } from './kit.js';
import { interiorMaterial, LIGHTS_PER_ROOM, UNI } from './material.js';
import { ENTRY, ROOMS, ceilingAt, floorAt, wallSegments } from './plan.js';
import { buildShell } from './shell.js';
import { SLOTS } from './furniture.js';
import { Effects } from './effects.js';
import { BagEndMenu } from './menu.js';

/** World position of the interior's local origin (the inside of the front door). */
export const INTERIOR_ORIGIN = new THREE.Vector3(400, 0, 0);
/** Outside: in front of Bag End's round door (world), where a leaving player appears, facing the garden. */
const DOOR_OUT = { x: BAG_END.x, z: BAG_END.z - 0.12 };
const OUT_POS = new THREE.Vector3(BAG_END.x, 0.05, BAG_END.z - 1.5);
const FADE = 0.32;

/** Splits a chunk into per-room chunks by the room index of each triangle's first vertex. */
function splitByRoom(chunk, rooms) {
  const out = Array.from({ length: rooms }, () => null);
  if (!chunk) return out;
  const tris = Array.from({ length: rooms }, () => []);
  for (let i = 0; i < chunk.idx.length; i += 3) tris[Math.round(chunk.info[chunk.idx[i] * 2])].push(i);
  for (let r = 0; r < rooms; r++) {
    if (!tris[r].length) continue;
    const map = new Map();
    const pos = [];
    const nor = [];
    const uv = [];
    const col = [];
    const tile = [];
    const info = [];
    const idx = [];
    for (const t of tris[r]) {
      for (let k = 0; k < 3; k++) {
        const v = chunk.idx[t + k];
        let n = map.get(v);
        if (n === undefined) {
          n = map.size;
          map.set(v, n);
          pos.push(chunk.pos[v * 3], chunk.pos[v * 3 + 1], chunk.pos[v * 3 + 2]);
          nor.push(chunk.nor[v * 3], chunk.nor[v * 3 + 1], chunk.nor[v * 3 + 2]);
          uv.push(chunk.uv[v * 2], chunk.uv[v * 2 + 1]);
          col.push(chunk.col[v * 3], chunk.col[v * 3 + 1], chunk.col[v * 3 + 2]);
          tile.push(chunk.tile[v * 4], chunk.tile[v * 4 + 1], chunk.tile[v * 4 + 2], chunk.tile[v * 4 + 3]);
          info.push(chunk.info[v * 2], chunk.info[v * 2 + 1]);
        }
        idx.push(n);
      }
    }
    out[r] = {
      pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), col: new Float32Array(col),
      tile: new Float32Array(tile), info: new Float32Array(info), idx: new Uint32Array(idx),
    };
  }
  return out;
}

export class BagEnd {
  /** @param {object} game the Game (scene, players, huds, bindings, money, saveNow) */
  constructor(game) {
    const t0 = performance.now();
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.name = 'bagend-interior';
    UNI.map.value = buildAtlas();
    const tAtlas = performance.now();
    this.mat = interiorMaterial(false);
    this.glassMat = interiorMaterial(true);
    // Lights only for the characters' bodies and the held tool (the house itself uses its own per-room lights).
    this.hemi = new THREE.HemisphereLight(0xffe2b8, 0x5a4030, 1.5);
    this.key = new THREE.DirectionalLight(0xffd6a0, 0.9);
    this.key.position.set(INTERIOR_ORIGIN.x + 3, 6, 2);
    this.key.target.position.copy(INTERIOR_ORIGIN);
    this.scene.add(this.hemi, this.key, this.key.target);

    const b = new Builder(INTERIOR_ORIGIN);
    const shell = buildShell(b);
    const tShell = performance.now();
    const nR = ROOMS.length;
    this.baseLights = shell.lights;
    this.staticColliders = shell.colliders;
    this.segments = wallSegments();
    const shellO = splitByRoom(shell.shell.opaque, nR);
    this.shellGlass = splitByRoom(shell.shell.glass, nR);
    this.dustGlass = splitByRoom(shell.dust.glass, nR);
    this.shellMeshes = shellO.map((c, i) => {
      const g = mergeChunks([c]);
      const m = new THREE.Mesh(g, this.mat);
      m.name = `bagend-shell-${ROOMS[i].id}`;
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      return m;
    });
    // Every tier of every slot is built once; buying only swaps which chunks a room's merged mesh holds.
    this.slots = SLOTS;
    for (const s of this.slots) {
      s.roomIndex = ROOMS.findIndex((r) => r.id === s.room);
      s.chunks = [];
      s.extra = [];
      const depN = s.dep ? SLOTS.find((x) => x.id === s.dep).tiers.length : 0;
      for (let k = 0; k <= s.tiers.length; k++) {
        const cs = [];
        const es = [];
        for (let d = 0; d <= depN; d++) {
          b.room = s.roomIndex;
          const extra = s.build(b, k, d) || {};
          cs.push(b.take());
          es.push({ colliders: extra.colliders || [], lights: extra.lights || [] });
        }
        s.chunks.push(cs);
        s.extra.push(es);
      }
    }
    this.trophyBuilder = b;
    const tSlots = performance.now();
    this.furnMeshes = ROOMS.map((r) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      m.name = `bagend-furniture-${r.id}`;
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      return m;
    });
    this.glassMeshes = ROOMS.map((r) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.glassMat);
      m.name = `bagend-glass-${r.id}`;
      m.matrixAutoUpdate = false;
      m.renderOrder = 2;
      this.scene.add(m);
      return m;
    });
    this.buildMotes();
    /** Bought tier per slot id (0 = bare). */
    this.tiers = Object.fromEntries(this.slots.map((s) => [s.id, 0]));
    /** Wine bottles laid down in the cellar: { v: base value, t: clock when stored }. */
    this.wine = [];
    /** Famous / co-op finds in the mathom room's cases (find type ids). */
    this.trophies = [];
    /** Interior play clock (s), advanced by update(); wine ages with it. */
    this.clock = 0;
    this.effects = new Effects(this);
    this.view = []; // per player slot: { fade, fadeDir, pending, menu }
    /** Hook: called by the bed's "Alvás" row (skip the night). The integrator sets it. */
    this.onSleep = null;
    // ---- auction hooks (timed/auction.js, NOTES-12-events) ----
    /** Hook: (slot, tierIndex) → { mult, note } for a tier the Sackville-Bagginses auctioned (buy-back price), or null. */
    this.tierMark = null;
    /** Hook: called after a tier was bought: (slot, newTier). */
    this.onBought = null;
    // ---- end auction hooks ----
    this.dirty = new Set(ROOMS.map((_, i) => i));
    this.refresh();
    const t1 = performance.now();
    this.stats = { buildMs: Math.round(t1 - t0), atlasMs: Math.round(tAtlas - t0), shellMs: Math.round(tShell - tAtlas), slotsMs: Math.round(tSlots - tShell), mergeMs: Math.round(t1 - tSlots) };
  }

  /* ---------------- state ---------------- */

  /** The furnishing for the save: { v, tiers: {slotId: n}, wine, trophies, clock }. */
  state() {
    const tiers = {};
    for (const [k, v] of Object.entries(this.tiers)) if (v) tiers[k] = v;
    return { v: 1, tiers, wine: this.wine.map((w) => [w.v, Math.round(w.t)]), trophies: [...this.trophies], clock: Math.round(this.clock) };
  }

  /** Restores state() output (unknown slots are ignored, tiers are clamped). */
  restore(s) {
    if (!s) return;
    for (const sl of this.slots) this.tiers[sl.id] = Math.max(0, Math.min(sl.tiers.length, s.tiers?.[sl.id] | 0));
    this.wine = (s.wine || []).map(([v, t]) => ({ v, t }));
    this.trophies = (s.trophies || []).slice();
    this.clock = s.clock || 0;
    ROOMS.forEach((_, i) => this.dirty.add(i));
    this.refresh();
  }

  /** Sets a slot's tier directly (debug / QA; buying goes through buy()). */
  setTier(id, n) {
    const s = this.slots.find((x) => x.id === id);
    if (!s) return;
    this.tiers[id] = Math.max(0, Math.min(s.tiers.length, n));
    this.dirty.add(s.roomIndex);
    this.refresh();
  }

  /** Every slot at its top tier (QA) or bare (n = 0). */
  setAll(n = Infinity) {
    for (const s of this.slots) this.tiers[s.id] = Math.max(0, Math.min(s.tiers.length, n));
    ROOMS.forEach((_, i) => this.dirty.add(i));
    this.refresh();
  }

  /** How furnished a room is: bought tiers / all tiers (0..1). */
  roomFill(index) {
    let have = 0;
    let all = 0;
    for (const s of this.slots) {
      if (s.roomIndex !== index) continue;
      have += this.tiers[s.id];
      all += s.tiers.length;
    }
    return all ? have / all : 1;
  }

  /** The chunk (or extra) of a slot's current tier, by the tier of the slot it depends on. */
  pick(s, arr) {
    const k = this.tiers[s.id];
    const d = s.dep ? this.tiers[s.dep] : 0;
    return arr[k][d];
  }

  /** The comfort score (shortcut for effects.comfort). */
  get comfort() {
    return this.effects.comfort;
  }

  /** The Hungarian name of a slot's room. */
  roomName(s) {
    return ROOMS[s.roomIndex].name;
  }

  /**
   * Puts a famous / co-op find into the mathom room's cases (TERV 0.13: "A mathom-szoba vitrinjeibe a híres
   * leletek maguktól kerülnek"). Shown on the cases' glass shelves (a case needs at least its first tier).
   * @param {{id: string, color?: number}} find a find type (finds.js FIND_TYPES entry) or { id, color }
   */
  addTrophy(find) {
    if (!find || this.trophies.includes(find.id)) return false;
    this.trophies.push(find.id);
    this.dirty.add(ROOMS.findIndex((r) => r.id === 'mathom'));
    this.refresh();
    return true;
  }

  /** The trophies' small display pieces: a velvet cushion and a glinting piece in the find's colour per trophy. */
  buildTrophies() {
    const b = this.trophyBuilder;
    const cases = this.slots.filter((s) => s.vitrin != null && this.tiers[s.id] > 0);
    const places = [];
    for (const s of cases) {
      const [wx, wz, ry] = [[0.3, 8.9, Math.PI / 2], [3.15, 11, Math.PI], [6, 8.9, -Math.PI / 2]][s.vitrin];
      const nx = Math.round(Math.sin(ry));
      const nz = Math.round(Math.cos(ry));
      for (let i = 0; i < 4; i++) {
        const t = -0.5 + i * 0.33;
        places.push([wx + nx * 0.3 - nz * t, 1.512 - (i % 2) * 0.34, wz + nz * 0.3 + nx * t, -nz, nx]);
      }
    }
    b.room = ROOMS.findIndex((r) => r.id === 'mathom');
    this.trophies.slice(0, places.length).forEach((id, i) => {
      const [x, y, z, tx, tz] = places[i];
      const col = FIND_TYPES.find((f) => f.id === id)?.color ?? 0xe8c070;
      if (id === 'glamdring' || id === 'orkrist') {
        // NOTES-22-secret: the two swords lie on a longer cushion along the shelf, a small blade each (Glamdring's
        // straight with a disc pommel, Orkrist's narrower), not a glinting ball.
        const ry = Math.atan2(-tz, tx);
        const at = (l) => ({ x: x + tx * l, z: z + tz * l });
        b.box(0.3, 0.025, 0.1, { x, y, z, ry, tile: 'velvet', tint: 0x6a1a2a });
        const glam = id === 'glamdring';
        b.box(0.22, 0.006, glam ? 0.02 : 0.015, { ...at(0.035), y: y + 0.035, ry, center: true, tile: 'brass', tint: col });
        b.box(0.012, 0.01, 0.07, { ...at(-0.08), y: y + 0.036, ry, center: true, tile: 'brass', tint: col });
        b.box(0.05, 0.012, 0.014, { ...at(-0.112), y: y + 0.036, ry, center: true, tile: 'brass', tint: 0x6a5a48 });
        if (glam) b.cyl(0.016, 0.016, 0.008, 10, { ...at(-0.142), y: y + 0.036, rz: Math.PI / 2, ry, center: true, tile: 'brass', tint: col });
        else b.sphere(0.01, { ...at(-0.142), y: y + 0.036, tile: 'brass', tint: col }, 8, 6);
        return;
      }
      b.box(0.12, 0.025, 0.12, { x, y, z, tile: 'velvet', tint: 0x6a1a2a });
      b.sphere(0.035, { x, y: y + 0.06, z, tile: 'brass', tint: col }, 10, 8);
    });
    this.trophyChunk = b.take().opaque;
  }

  /** Rebuilds the merged meshes of changed rooms and refreshes lights, dust and colliders. Not per frame. */
  refresh() {
    if (this.dirty.has(ROOMS.findIndex((r) => r.id === 'mathom'))) this.buildTrophies();
    for (const ri of this.dirty) {
      const fill = this.roomFill(ri);
      const opaque = [];
      const glass = [this.shellGlass[ri]];
      for (const s of this.slots) {
        if (s.roomIndex !== ri) continue;
        const c = this.pick(s, s.chunks);
        opaque.push(c.opaque);
        glass.push(c.glass);
      }
      if (fill < 0.5) glass.push(this.dustGlass[ri]);
      if (this.trophyChunk && ROOMS[ri].id === 'mathom') opaque.push(this.trophyChunk);
      const go = mergeChunks(opaque) || new THREE.BufferGeometry();
      const gg = mergeChunks(glass) || new THREE.BufferGeometry();
      this.furnMeshes[ri].geometry.dispose();
      this.furnMeshes[ri].geometry = go;
      this.furnMeshes[ri].visible = !!go.attributes.position;
      this.glassMeshes[ri].geometry.dispose();
      this.glassMeshes[ri].geometry = gg;
      this.glassMeshes[ri].visible = !!gg.attributes.position;
    }
    this.dirty.clear();
    // Colliders of the bought tiers.
    this.colliders = [...this.staticColliders];
    for (const s of this.slots) this.colliders.push(...this.pick(s, s.extra).colliders);
    this.applyLights();
  }

  /** Writes every room's light list (base + bought tiers, the strongest LIGHTS_PER_ROOM), ambient and dust. */
  applyLights() {
    const O = INTERIOR_ORIGIN;
    ROOMS.forEach((r, ri) => {
      const list = this.baseLights.filter((l) => l.room === ri).map((l) => ({ ...l, w: (l.c[0] + l.c[1] + l.c[2]) * l.range }));
      for (const s of this.slots) {
        if (s.roomIndex !== ri) continue;
        for (const l of this.pick(s, s.extra).lights) list.push({ ...l, w: (l.c[0] + l.c[1] + l.c[2]) * l.range * 1.5 });
      }
      list.sort((a, c) => c.w - a.w);
      for (let k = 0; k < LIGHTS_PER_ROOM; k++) {
        const l = list[k];
        const lp = UNI.uLP.value[ri * LIGHTS_PER_ROOM + k];
        const lc = UNI.uLC.value[ri * LIGHTS_PER_ROOM + k];
        if (!l) {
          lp.set(O.x, -100, O.z, 1);
          lc.set(0, 0, 0, 0);
          continue;
        }
        lp.set(l.p[0] + O.x, l.p[1] + O.y, l.p[2] + O.z, l.range);
        lc.set(l.c[0], l.c[1], l.c[2], l.flicker ? 1 : 0);
      }
      const fill = this.roomFill(ri);
      const win = this.baseLights.some((l) => l.room === ri && l.range > 6);
      const a = win ? 0.105 : 0.08;
      UNI.uAmb.value[ri].set(a + fill * 0.05, a * 0.93 + fill * 0.035, a * 0.86 + fill * 0.02);
      UNI.uRoomF.value[ri].set(r.floor + O.y, 1 - fill);
    });
  }

  /* ---------------- dust motes ---------------- */

  /** Floating dust in the window light of the empty rooms (one Points draw; fades out as a room is furnished). */
  buildMotes() {
    const n = 420;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 2);
    const wins = this.baseLights.filter((l) => l.range > 6);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const w = wins[i % wins.length];
      const s = (i * 0.618) % 1;
      const t = (i * 0.414) % 1;
      pos[k++] = INTERIOR_ORIGIN.x + w.p[0] + (s - 0.5) * 1.6;
      pos[k++] = 0.4 + t * 1.6;
      pos[k++] = 0.3 + ((i * 0.27) % 1) * 2.6;
      seed[i * 2] = w.room;
      seed[i * 2 + 1] = (i * 0.737) % 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: UNI.uTime, uRoomF: UNI.uRoomF },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec2 aSeed;
        uniform float uTime;
        uniform vec2 uRoomF[${ROOMS.length}];
        varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * 0.05 + aSeed.y * 30.0;
          p += vec3(sin(t * 1.3) * 0.25, sin(t * 0.7 + 1.0) * 0.18, cos(t * 1.1) * 0.25);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = uRoomF[int(aSeed.x + 0.5)].y * (0.5 + 0.5 * sin(t * 3.0));
          gl_PointSize = clamp(5.0 / -mv.z, 1.0, 4.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.75) * vA * 0.5 * smoothstep(0.5, 0.0, d), 1.0);
        }`,
    });
    this.motes = new THREE.Points(g, m);
    this.motes.name = 'bagend-motes';
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  /* ---------------- per frame ---------------- */

  /** Is this player inside Bag End? (By position, so saves and respawns need no extra state.) */
  isInside(p) {
    return p.pos.x > INTERIOR_ORIGIN.x - 60;
  }

  /** Once per frame: time, fire flicker, fades. */
  update(dt) {
    this.lastDt = Math.min(0.05, dt);
    this.clock += dt;
    UNI.uTime.value += dt;
    const t = UNI.uTime.value;
    UNI.uFlick.value = 0.5 + 0.25 * Math.sin(t * 9.1) + 0.15 * Math.sin(t * 23.7 + 1.3) + 0.1 * Math.sin(t * 3.3);
    this.effects.update(dt);
  }

  /**
   * Renders one player's view when that player is inside (returns true), else returns false and the game renders
   * the outdoor scene as usual. The player's camera (with the held tool) and the bodies of the other players who are
   * inside are lent to the interior scene for this render only.
   */
  renderView(p, renderer) {
    if (!this.isInside(p)) return false;
    const game = this.game;
    const cam = p.camera;
    const camParent = cam.parent;
    this.scene.add(cam);
    const lent = [];
    for (const q of game.players) {
      if (q === p || !this.isInside(q) || !q.body) continue;
      lent.push([q.body, q.body.parent]);
      this.scene.add(q.body);
    }
    renderer.setClearColor(0x0c0906);
    renderer.render(this.scene, cam);
    if (camParent) camParent.add(cam);
    for (const [body, parent] of lent) if (parent) parent.add(body);
    return true;
  }

  /* ---------------- collision ---------------- */

  /**
   * The interior's collision for a player inside (replaces the density-field collision): walls and furniture push
   * the body out (circle of PLAYER.radius against segments and boxes), the floor holds it (steps up to 0.35 m are
   * climbed, higher ones block), the vault keeps the head down. Sets player.grounded; returns it.
   * @param {object} p the Player
   * @param {number} [radius]
   */
  collide(p, radius = 0.25) {
    const O = INTERIOR_ORIGIN;
    const pos = p.pos;
    let x = pos.x - O.x;
    let z = pos.z - O.z;
    // Too high a step (the cellar stair's sides): stay where we were horizontally.
    const prev = this.prevPos?.get(p) || { x, z };
    const fNew = floorAt(x, z);
    if (fNew - (pos.y - O.y) > 0.36) {
      x = prev.x;
      z = prev.z;
      p.vel.x = 0;
      p.vel.z = 0;
    }
    for (let it = 0; it < 3; it++) {
      for (const s of this.segments) {
        const dx = s.bx - s.ax;
        const dz = s.bz - s.az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((x - s.ax) * dx + (z - s.az) * dz) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = s.ax + dx * t;
        const cz = s.az + dz * t;
        const ex = x - cx;
        const ez = z - cz;
        const d2 = ex * ex + ez * ez;
        if (d2 < radius * radius && d2 > 1e-10) {
          const d = Math.sqrt(d2);
          x = cx + (ex / d) * radius;
          z = cz + (ez / d) * radius;
        }
      }
      for (const c of this.colliders) {
        // Axis-aligned or turned box (hw, hd half sizes, ry yaw).
        const cs = Math.cos(-(c.ry || 0));
        const sn = Math.sin(-(c.ry || 0));
        const lx = (x - c.x) * cs - (z - c.z) * sn;
        const lz = (x - c.x) * sn + (z - c.z) * cs;
        const qx = Math.max(-c.hw, Math.min(c.hw, lx));
        const qz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ex = lx - qx;
        let ez = lz - qz;
        let d2 = ex * ex + ez * ez;
        let nx = lx;
        let nz = lz;
        if (d2 < 1e-10) {
          // Inside the box: out along the shallowest side.
          const px = c.hw - Math.abs(lx);
          const pz = c.hd - Math.abs(lz);
          if (px < pz) nx = Math.sign(lx || 1) * (c.hw + radius);
          else nz = Math.sign(lz || 1) * (c.hd + radius);
          if (px < pz) nz = lz;
          else nx = lx;
        } else if (d2 < radius * radius) {
          const d = Math.sqrt(d2);
          ex /= d;
          ez /= d;
          nx = qx + ex * radius;
          nz = qz + ez * radius;
        } else continue;
        d2 = 0;
        x = c.x + nx * Math.cos(c.ry || 0) - nz * Math.sin(c.ry || 0);
        z = c.z + nx * Math.sin(c.ry || 0) + nz * Math.cos(c.ry || 0);
      }
    }
    const fl = floorAt(x, z) + O.y;
    pos.x = x + O.x;
    pos.z = z + O.z;
    p.grounded = false;
    if (pos.y <= fl) {
      pos.y = fl;
      if (p.vel.y < 0) p.vel.y = 0;
      p.grounded = true;
    } else if (pos.y - fl < 0.03 && p.vel.y <= 0) p.grounded = true;
    // Keep the head under the vault.
    const top = ceilingAt(x, z) + O.y - (p.eyeH || 1.05) - 0.12;
    if (pos.y > top) {
      pos.y = top;
      if (p.vel.y > 0) p.vel.y = 0;
    }
    if (!this.prevPos) this.prevPos = new Map();
    this.prevPos.set(p, { x, z });
    return p.grounded;
  }

  /** The floor height under a world position inside (world y). */
  floorHeight(x, z) {
    return floorAt(x - INTERIOR_ORIGIN.x, z - INTERIOR_ORIGIN.z) + INTERIOR_ORIGIN.y;
  }

  /* ---------------- doors, slots and the menu ---------------- */

  /** Price of a tier for a player (the buyer's perk and the co-op factor, like the Green Dragon counter). */
  price(p, base) {
    const coop = this.game.players.length > 1;
    return Math.round(base * (p.perk?.price || 1) * (coop ? COOP.price : 1));
  }

  /** Price of tier index i of slot s for player p (an auctioned tier carries the buy-back premium: tierMark). */
  tierPrice(p, s, i) {
    const m = this.tierMark?.(s, i);
    return this.price(p, s.tiers[i].price * (m?.mult || 1));
  }

  /** The nearest slot in reach and roughly in front of the player (local coordinates), or null. */
  slotNear(p) {
    const x = p.pos.x - INTERIOR_ORIGIN.x;
    const z = p.pos.z - INTERIOR_ORIGIN.z;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    let best = null;
    let bs = Infinity;
    for (const s of this.slots) {
      const dx = s.at[0] - x;
      const dz = s.at[1] - z;
      const d = Math.hypot(dx, dz);
      if (d > (s.reach || 1.45)) continue;
      const facing = d < 0.35 ? 1 : (dx * fx + dz * fz) / d;
      if (facing < 0.2) continue;
      const score = d - facing * 0.6;
      if (score < bs) {
        bs = score;
        best = s;
      }
    }
    return best;
  }

  /** Near the round door outside (world) and facing it. */
  nearOuterDoor(p) {
    if (this.isInside(p) || p.pos.y > 1.5 || p.pos.y < -0.5) return false;
    const dx = DOOR_OUT.x - p.pos.x;
    const dz = DOOR_OUT.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.9) return false;
    return d < 0.6 || (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d > 0.3;
  }

  /** Near the inside of the front door. */
  nearInnerDoor(p) {
    if (!this.isInside(p)) return false;
    const x = p.pos.x - INTERIOR_ORIGIN.x;
    const z = p.pos.z - INTERIOR_ORIGIN.z;
    return Math.hypot(x - ENTRY.x, z) < ENTRY.exitR && z < 1.6;
  }

  /** Moves a player through the door (called at the dark middle of the fade). */
  pass(p, inside) {
    p.vel.set(0, 0, 0);
    if (inside) {
      p.pos.set(INTERIOR_ORIGIN.x + ENTRY.x, INTERIOR_ORIGIN.y, INTERIOR_ORIGIN.z + ENTRY.z);
      p.yaw = Math.PI; // facing into the hall (+z)
      p.pitch = -0.05;
      p.say('Zsáklak. Otthon, édes otthon.', 3);
      this.effects.cameHome(p);
    } else {
      p.pos.copy(OUT_POS);
      p.yaw = 0; // facing the garden and the pit (−z)
      p.pitch = -0.05;
      this.effects.leftHome(p);
    }
    this.prevPos?.delete(p);
    p.syncVisuals?.(0);
  }

  /** The per-player menu / prompt / fade overlay (lives in the player's HUD element). */
  menuFor(i) {
    if (!this.view[i]) this.view[i] = { fade: 0, dir: 0, pending: null, menu: null };
    const v = this.view[i];
    const hud = this.game.huds[i];
    if (!v.menu || v.menu.host !== hud?.el) v.menu = new BagEndMenu(hud?.el, this);
    return v;
  }

  /**
   * Per player and frame, before Player.update: the door prompts, the fade, the slot menu. Returns true while the
   * player's movement must be frozen (fading or a menu open), like Hud.shopInput.
   * @param {object} p the Player
   * @param {number} i the player's index in game.players
   * @param {object} it the player's intent this frame
   */
  input(p, i, it) {
    const v = this.menuFor(i);
    const menu = v.menu;
    const dt = this.lastDt || 1 / 60;
    // Fading through the door.
    if (v.dir) {
      v.fade += (v.dir * dt) / FADE;
      if (v.dir > 0 && v.fade >= 1) {
        v.fade = 1;
        this.pass(p, v.pending);
        v.dir = -1;
      } else if (v.dir < 0 && v.fade <= 0) {
        v.fade = 0;
        v.dir = 0;
      }
      menu.fade(v.fade);
      menu.prompt(null);
      return true;
    }
    menu.fade(0);
    if (p.dead > 0 || p.choosing) {
      menu.close();
      menu.prompt(null);
      return false;
    }
    const binding = this.game.bindings?.[i];
    if (menu.open) {
      // Closing (back / interact) still swallows this frame's press, so it does not reopen the slot at once.
      menu.input(it, p, binding);
      return true;
    }
    if (this.nearOuterDoor(p)) {
      menu.prompt('Zsáklak — belépés', binding);
      if (it.interactPressed) {
        v.dir = 1;
        v.pending = true;
        return true;
      }
      return false;
    }
    if (!this.isInside(p)) {
      menu.prompt(null);
      return false;
    }
    if (this.nearInnerDoor(p)) {
      menu.prompt('Kimész a kertbe', binding);
      if (it.interactPressed) {
        v.dir = 1;
        v.pending = false;
        return true;
      }
      return false;
    }
    const s = this.slotNear(p);
    if (s) {
      const k = this.tiers[s.id];
      menu.prompt(`${s.name}${k ? ` — ${s.tiers[k - 1].name}` : ' (üres)'}`, binding);
      if (it.interactPressed) {
        menu.openSlot(s, p, binding);
        return true;
      }
    } else menu.prompt(null);
    return false;
  }

  /** Buys the next tier of a slot for a player from the shared purse. Returns a message. */
  buy(p, s) {
    const k = this.tiers[s.id];
    const next = s.tiers[k];
    if (!next) return 'Ez már a legszebb, ami ide kerülhet.';
    const cost = this.tierPrice(p, s, k);
    if (this.game.money < cost) return 'Nincs elég aranyad.';
    this.game.money -= cost;
    this.tiers[s.id] = k + 1;
    this.dirty.add(s.roomIndex);
    this.refresh();
    this.onBought?.(s, k + 1); // auction (NOTES-12-events): a bought-back tier is no longer marked
    this.game.saveNow?.();
    return `${next.name}: a helyére került.`;
  }
}
