/* ==== underground/coop.js — the paired treasure chambers that only two players together can open (TERV 0.5 "Csak
   co-opban", Decision 17). With one player they stay shut.
   - Layer 2, the two-lever dwarf door: a stone door in the cellar corridor, a lever at each end of the corridor (about
     9 m apart); both levers pulled within PULL_WINDOW (1.5 s) of each other slide the door into the wall.
   - Layer 3, the rune door with two keys: two rune stones far apart in the troll cave. With a player at each stone,
     stone A shows the order of four runes; stone B lights its runes one after another, and its player presses the
     interact action when the next rune of the order is lit (the players have to talk). Four right → the door opens.
   Behind each door a small treasure niche: a chest of coins and silver in the cellar, the trolls' pots of gold in the
   troll cave (The Hobbit: the company buried the trolls' gold and dug it up on the way home).
   NOTES-35-lift-doors-bag: the levers and stones are active only round their own floors (NEAR2 / NEAR3, from the set
   pieces' real heights; the old prototype band, y −30…−42, never reached the corridor at −66.5 m after the layers moved
   down, so the levers did nothing). promptFor(p) gives the HUD (hud.js) a prompt line at each lever and stone. ==== */
import * as THREE from 'three';
import { box, colorize, cyl, lathe, rgb, sphere } from './kit.js';
import { floorAt } from './pieces.js';
import { NICHES, ROOMS, TROLL_FLOOR } from './sites.js';

const CORRIDOR = ROOMS.find((r) => r.id === 'torpeajto');
const N2 = NICHES.find((n) => n.id === 'torpeajto');
const N3 = NICHES.find((n) => n.id === 'runaajto');

/** The two rune stones (world x, z; `face` is the direction their rune face looks, so the two readers stand apart). */
export const RUNE_STONES = [
  { id: 'A', x: -0.9, z: -4.1, face: [-1, 0] },
  { id: 'B', x: 7.1, z: -4.1, face: [1, 0] },
];

/** The levers: corridor-local x of each lever, on the end walls, 1.05 m up. */
const LEVER_X = [-(CORRIDOR.w / 2 - 0.3), CORRIDOR.w / 2 - 0.3];
/** Seconds within which both levers must be pulled (NOTES-35: was 0.8 s, too tight for two people). */
const PULL_WINDOW = 1.5;
/** A lever can be pulled again this soon (a re-pull refreshes its time in the window). */
const LEVER_REPULL = 0.5;
/** World y bands in which the layer-2 levers and the layer-3 rune stones are live (feet height of a player). */
const NEAR2 = [CORRIDOR.y - 4, CORRIDOR.y + 4];
const NEAR3 = [TROLL_FLOOR - 4, TROLL_FLOOR + 6];
const inBand = (y, b) => y > b[0] && y < b[1];

/** Generic angular runes (stroke lists on a 0..1 cell; decoration, no inscription). */
const GLYPHS = [
  [[0.5, 0.05, 0.5, 0.95], [0.5, 0.25, 0.8, 0.05], [0.5, 0.45, 0.8, 0.25]],
  [[0.3, 0.05, 0.3, 0.95], [0.7, 0.05, 0.7, 0.95], [0.3, 0.5, 0.7, 0.3]],
  [[0.5, 0.05, 0.5, 0.95], [0.2, 0.3, 0.5, 0.5], [0.8, 0.3, 0.5, 0.5]],
  [[0.5, 0.05, 0.5, 0.95], [0.5, 0.3, 0.2, 0.05], [0.5, 0.3, 0.8, 0.05], [0.5, 0.7, 0.8, 0.95]],
  [[0.3, 0.05, 0.3, 0.95], [0.3, 0.05, 0.75, 0.3], [0.75, 0.3, 0.3, 0.55]],
  [[0.5, 0.05, 0.5, 0.95], [0.2, 0.6, 0.8, 0.4]],
];

/** The static parts (door frames, lever plates, rune stones, the niches' treasure) into the decor kit. */
export function buildCoopStatic(K) {
  // ---- layer 2: the dwarf door's frame and the lever plates ----
  K.group = 'l2';
  K.at(CORRIDOR.x, CORRIDOR.y, CORRIDOR.z, CORRIDOR.rot);
  const R = CORRIDOR.d / 2;
  const dz = -R + 0.08;
  const stoneC = rgb(0x8a8a88);
  // Big squared jambs and a stepped lintel (angular dwarf work).
  for (const sx of [-1, 1]) {
    K.part('stone', box(0.42, 2.25, 0.4), stoneC, sx * 1.2, 1.12, dz);
    K.boxCollider(sx * 1.2, 1.12, dz, 0.21, 1.12, 0.2);
  }
  K.part('stone', box(2.85, 0.36, 0.44), stoneC, 0, 2.2, dz);
  K.part('stone', box(2.2, 0.22, 0.46), stoneC, 0, 2.48, dz);
  K.part('stone', box(1.2, 0.18, 0.48), stoneC, 0, 2.68, dz);
  for (const sx of LEVER_X) {
    const s = Math.sign(sx);
    K.part('metal', box(0.04, 0.5, 0.3), 0x3a3634, sx + s * 0.04, 1.05, 0);
    K.part('metal', cyl(0.05, 0.05, 0.12, 10), 0x2a2624, sx, 1.05, 0, Math.PI / 2, 0, 0);
  }
  // The niche: a chest with coins and silver spoons, goblets.
  K.at((N2.x0 + N2.x1) / 2, N2.y0, (N2.z0 + N2.z1) / 2 - 0.3, 0);
  K.part('wood', box(0.8, 0.45, 0.5), 0x5a3a24, 0, 0.225, -0.2);
  K.part('wood', box(0.82, 0.06, 0.52), 0x5a3a24, 0, 0.62, -0.42, -1.1, 0, 0);
  for (const bx of [-0.3, 0.3]) K.part('metal', box(0.05, 0.47, 0.52), 0xb08a40, bx, 0.225, -0.2);
  K.part('metal', box(0.74, 0.08, 0.44), 0xe0b840, 0, 0.44, -0.2, 0, 0, 0, 1, 0.3);
  for (let i = 0; i < 14; i++) K.part('metal', cyl(0.025, 0.025, 0.006, 10), 0xe0b840, -0.35 + (i % 7) * 0.11, 0.02, 0.18 + Math.floor(i / 7) * 0.1, 0.1 * i, 0, 0.2);
  for (let i = 0; i < 3; i++) K.part('metal', lathe([[0, 0], [0.04, 0], [0.012, 0.03], [0.012, 0.09], [0.04, 0.11], [0.045, 0.17], [0, 0.17]], 10), 0xd8dde4, 0.5, 0, -0.3 + i * 0.22);
  // ---- layer 3: the rune door's frame, the two rune stones, the trolls' gold ----
  K.group = 'l3';
  K.at(N3.doorX, TROLL_FLOOR, N3.doorZ, 0);
  for (const sx of [-1, 1]) {
    K.part('stone', box(0.45, 2.3, 0.5), stoneC, sx * 1.22, 1.15, 0.05);
    K.boxCollider(sx * 1.22, 1.15, 0.05, 0.22, 1.15, 0.25);
  }
  K.part('stone', box(2.9, 0.4, 0.55), stoneC, 0, 2.3, 0.05);
  for (const st of RUNE_STONES) {
    const y = floorAt(st.x, st.z, TROLL_FLOOR + 1);
    const yaw = Math.atan2(st.face[0], st.face[1]);
    K.at(st.x, y, st.z, yaw);
    const g = box(0.75, 1.55, 0.45);
    // Taper the top (a standing stone).
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * 0.75, p.getY(i), p.getZ(i) * 0.8);
    g.computeVertexNormals();
    K.part('stone', g, rgb(0x7a7874), 0, 0.72, 0);
    K.boxCollider(0, 0.75, 0, 0.38, 0.75, 0.24);
    st.y = y;
    st.yaw = yaw;
  }
  // Behind the rune door: the trolls' pots of gold.
  K.at((N3.x0 + N3.x1) / 2, TROLL_FLOOR, (N3.z0 + N3.z1) / 2 - 0.2, 0);
  for (const [x, z, s] of [[-0.4, 0, 1], [0.35, -0.15, 1.15], [0.0, 0.5, 0.9]]) {
    K.part('metal', lathe([[0, 0], [0.18, 0], [0.26, 0.15], [0.25, 0.32], [0.2, 0.4], [0.22, 0.42], [0.19, 0.42], [0.17, 0.36], [0, 0.36]].map(([r, y]) => [r * s, y * s]), 16), 0x2a2420, x, 0, z);
    K.part('metal', sphere(0.19 * s, 12, 6), 0xe8b830, x, 0.33 * s, z, 0, 0, 0, [1, 0.4, 1], 0.3);
  }
  for (let i = 0; i < 20; i++) K.part('metal', cyl(0.022, 0.022, 0.006, 10), 0xe8b830, -0.6 + (i % 10) * 0.13, 0.01, 0.6 + Math.floor(i / 10) * 0.12, i, 0, 0.3);
}

/** A stone door slab with raised dwarf-style bands (local: centred, face towards +z). */
function doorGeometry(w, h, t) {
  const parts = [];
  const add = (g, x, y, z) => {
    g.translate(x, y, z);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  add(box(w, h, t), 0, h / 2, 0);
  const b = 0.08;
  add(box(w - 0.1, b, 0.07), 0, h - 0.12, t / 2);
  add(box(w - 0.1, b, 0.07), 0, 0.12, t / 2);
  add(box(b, h - 0.2, 0.07), -w / 2 + 0.1, h / 2, t / 2);
  add(box(b, h - 0.2, 0.07), w / 2 - 0.1, h / 2, t / 2);
  // A chevron of bands in the middle (angular, like dwarf stonework).
  for (const sx of [-1, 1]) {
    const g = box(0.1, w * 0.55, 0.07);
    g.rotateZ(sx * 0.75);
    add(g, sx * w * 0.18, h * 0.55, t / 2);
    const g2 = box(0.1, w * 0.4, 0.07);
    g2.rotateZ(sx * 0.75);
    add(g2, sx * w * 0.14, h * 0.32, t / 2);
  }
  for (const g of parts) colorize(g, rgb(0x8e8c88), 0.06);
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  for (const g of parts) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    col.push(...g.attributes.color.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/** The lever handle: an iron bar with a wooden grip (local: pivot at the origin, pointing up). */
function leverGeometry() {
  const parts = [];
  const add = (g, color, y) => {
    g.translate(0, y, 0);
    const n = g.index ? g.toNonIndexed() : g;
    colorize(n, rgb(color), 0.1);
    parts.push(n);
  };
  add(cyl(0.025, 0.03, 0.55, 8), 0x3a3634, 0.27);
  add(cyl(0.045, 0.045, 0.18, 8), 0x5a3a22, 0.6);
  add(sphere(0.05, 8, 6), 0x3a3634, 0.7);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'color']) {
    const arr = [];
    for (const g of parts) arr.push(...g.attributes[k].array);
    out.setAttribute(k, new THREE.Float32BufferAttribute(arr, k === 'uv' ? 2 : 3));
  }
  return out;
}

/** Draws a rune panel: `glyphs` (indices), `lit` per glyph 0..1, `marks` progress dots, `tint`. */
function drawPanel(ctx, glyphs, lit, marks, tint) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  const cw = W / glyphs.length;
  ctx.lineCap = 'round';
  glyphs.forEach((gi, i) => {
    const a = lit[i];
    if (a <= 0.01) return;
    ctx.strokeStyle = tint;
    ctx.globalAlpha = a;
    ctx.shadowColor = tint;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 5;
    for (const [x0, y0, x1, y1] of GLYPHS[gi]) {
      ctx.beginPath();
      ctx.moveTo(i * cw + cw * (0.2 + x0 * 0.6), H * (0.12 + y0 * 0.66));
      ctx.lineTo(i * cw + cw * (0.2 + x1 * 0.6), H * (0.12 + y1 * 0.66));
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  for (let i = 0; i < marks; i++) {
    ctx.fillStyle = '#ffd890';
    ctx.beginPath();
    ctx.arc(i * cw + cw / 2, H * 0.9, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The paired doors' state and animation. `mats` are the decor materials (stone, metal); `groups` the decor layer
 * groups (l2, l3) the moving parts go into; `colliders` the decor collider list (the closed doors are added to it).
 */
export class Coop {
  constructor(mats, groups, colliders) {
    /** Called once per door when it opens: onOpen(id, players). */
    this.onOpen = null;
    this.doors = {};
    this.msgT = new Map();
    // ---- dwarf door ----
    const doorW = N2.x1 - N2.x0;
    const d2 = new THREE.Mesh(doorGeometry(doorW + 0.1, 1.98, 0.24), mats.stone);
    d2.position.set(N2.doorX, N2.y0, N2.doorZ);
    d2.renderOrder = 1;
    groups.l2.add(d2);
    const c2 = { t: 'box', x: N2.doorX, y: N2.y0 + 1, z: N2.doorZ, hx: doorW / 2, hy: 1, hz: 0.14, c: 1, s: 0, br: 1.5, on: true };
    colliders.push(c2);
    this.doors.torpeajto = { mesh: d2, collider: c2, open: 0, opening: false, slide: [1, 0], base: d2.position.clone(), dist: doorW + 0.15 };
    this.levers = LEVER_X.map((lx) => {
      const m = new THREE.Mesh(leverGeometry(), mats.metal);
      const s = Math.sign(lx);
      const wx = CORRIDOR.x + lx * Math.cos(CORRIDOR.rot);
      const wz = CORRIDOR.z - lx * Math.sin(CORRIDOR.rot);
      m.position.set(wx - s * 0.07, CORRIDOR.y + 1.05, wz);
      m.renderOrder = 1;
      groups.l2.add(m);
      return { mesh: m, side: s, t: 99, x: wx, y: CORRIDOR.y + 1.05, z: wz };
    });
    // ---- rune door ----
    const runeW = N3.x1 - N3.x0;
    const d3 = new THREE.Mesh(doorGeometry(runeW + 0.1, 2.05, 0.3), mats.stone);
    d3.position.set(N3.doorX, TROLL_FLOOR, N3.doorZ + 0.08);
    d3.renderOrder = 1;
    groups.l3.add(d3);
    const c3 = { t: 'box', x: N3.doorX, y: TROLL_FLOOR + 1, z: N3.doorZ + 0.08, hx: runeW / 2, hy: 1.05, hz: 0.16, c: 1, s: 0, br: 1.6, on: true };
    colliders.push(c3);
    this.doors.runaajto = { mesh: d3, collider: c3, open: 0, opening: false, slide: [0, -1], base: d3.position.clone(), dist: 2.1 };
    // Rune panels: a canvas per stone on a glowing plane in front of its face.
    this.panels = RUNE_STONES.map((st) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.2), mat);
      const y = (st.y ?? TROLL_FLOOR) + 1.05;
      m.position.set(st.x + st.face[0] * 0.25, y, st.z + st.face[1] * 0.25);
      m.rotation.y = Math.atan2(st.face[0], st.face[1]);
      groups.l3.add(m);
      return { st, ctx, tex, mesh: m, front: [st.x + st.face[0] * 0.9, st.z + st.face[1] * 0.9], y: st.y ?? TROLL_FLOOR, drawn: '' };
    });
    this.rune = { code: [], order: [0, 1, 2, 3], progress: 0, cursor: 0, cursorT: 0, flash: 0, flashGood: true, active: false };
    this.newCode();
  }

  newCode() {
    const pool = [0, 1, 2, 3, 4, 5];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // Stone B shows the same four runes in another order; stone A shows the order to press them in.
    this.rune.code = pool.slice(0, 4);
    this.rune.order = [this.rune.code[2], this.rune.code[0], this.rune.code[3], this.rune.code[1]];
    this.rune.progress = 0;
  }

  /** What the save should keep: { torpeajto: bool, runaajto: bool }. */
  state() {
    return { torpeajto: this.doors.torpeajto.open >= 1 || this.doors.torpeajto.opening, runaajto: this.doors.runaajto.open >= 1 || this.doors.runaajto.opening };
  }

  /** Restores opened doors (from state()). */
  restore(s) {
    for (const id of Object.keys(this.doors)) {
      if (!s?.[id]) continue;
      const d = this.doors[id];
      d.open = 1;
      d.opening = true;
      this.placeDoor(d);
    }
  }

  placeDoor(d) {
    const e = d.open * d.open * (3 - 2 * d.open);
    d.mesh.position.set(d.base.x + d.slide[0] * d.dist * e, d.base.y + (d.slide[1] < 0 ? -d.dist * e : 0), d.base.z);
    d.collider.on = e < 0.6;
  }

  say(p, key, text, every = 6) {
    const t = this.msgT.get(key + p.slot) || 0;
    if (performance.now() - t < every * 1000) return;
    this.msgT.set(key + p.slot, performance.now());
    if (typeof p.say === 'function') p.say(text);
  }

  open(id, players) {
    const d = this.doors[id];
    if (d.opening) return;
    d.opening = true;
    for (const p of players) this.say(p, 'open', id === 'torpeajto' ? 'A kőajtó megmozdul, és csikorogva félrecsúszik!' : 'A rúnák felizzanak, és a kőajtó lesüllyed!', 0);
    if (this.onOpen) this.onOpen(id, players);
  }

  /** Per frame. `intents[i]` is player i's intent (uses `interactPressed`), or null (no input for that player). */
  update(dt, players, intents) {
    const now = performance.now() / 1000;
    // ---- doors ----
    for (const d of Object.values(this.doors)) {
      if (d.opening && d.open < 1) {
        d.open = Math.min(1, d.open + dt / 3);
        this.placeDoor(d);
      }
    }
    const near2 = players.some((p) => inBand(p.pos.y, NEAR2));
    const near3 = players.some((p) => inBand(p.pos.y, NEAR3));
    // ---- levers ----
    if (near2) {
      players.forEach((p, i) => {
        if (!intents?.[i]?.interactPressed || p.dead > 0) return;
        const lv = this.leverAt(p);
        if (!lv || lv.t < LEVER_REPULL) return;
        lv.t = 0;
        lv.at = now;
        const other = this.levers.find((o) => o !== lv);
        if (this.doors.torpeajto.opening) return;
        if (other.at && now - other.at < PULL_WINDOW) this.open('torpeajto', players);
        else if (players.length < 2) this.say(p, 'lever1', 'Kattan, de visszaugrik. Ehhez az ajtóhoz két játékos kell (csak co-opban nyílik): a társad húzza meg a másik kart veled egyszerre. Második játékos: F2, vagy egy kontroller Start gombja.', 5);
        else this.say(p, 'lever2', `Lehúztad a kart! A társad most húzza meg a másikat, ${PULL_WINDOW.toLocaleString('hu-HU')} másodpercen belül.`, 2);
      });
      for (const lv of this.levers) {
        lv.t += dt;
        // Down in 0.25 s, held while the door opens (or for the pull window), back up in 0.6 s.
        const held = this.doors.torpeajto.opening ? 1 : lv.t < 0.25 ? lv.t / 0.25 : lv.t < PULL_WINDOW ? 1 : Math.max(0, 1 - (lv.t - PULL_WINDOW) / 0.6);
        lv.mesh.rotation.z = lv.side * held * 1.6;
      }
    }
    // ---- rune stones ----
    if (near3) this.updateRunes(dt, players, intents);
  }

  /** The lever p stands at (within reach of its handle), or null. */
  leverAt(p) {
    for (const lv of this.levers) {
      if (Math.hypot(p.pos.x - lv.x, p.pos.z - lv.z) > 1.6 || Math.abs(p.pos.y + 1 - lv.y) > 1.4) continue;
      return lv;
    }
    return null;
  }

  /** The rune stone index (0 = A, 1 = B) p stands in front of, or −1. */
  stoneAt(p) {
    return this.panels.findIndex((pn) => Math.hypot(p.pos.x - pn.front[0], p.pos.z - pn.front[1]) < 1.3 && Math.abs(p.pos.y - pn.y) < 1.5);
  }

  /**
   * NOTES-35-lift-doors-bag: the HUD prompt at a lever or a rune stone for p: { text, key } (key: show the use key's
   * glyph after the text), or null. A few comparisons; only round the two floors.
   */
  promptFor(p, players) {
    if (p.dead > 0 || p.choosing) return null;
    const solo = (players?.length || 1) < 2;
    if (inBand(p.pos.y, NEAR2) && !this.doors.torpeajto.opening) {
      const lv = this.leverAt(p);
      if (!lv) return null;
      if (solo) return { text: 'Törpeajtó karja · két játékos kell hozzá', key: true };
      const other = this.levers.find((o) => o !== lv);
      const now = performance.now() / 1000;
      if (lv.at && now - lv.at < PULL_WINDOW) return { text: 'Lehúzva! Most a társad húzza meg a másik kart', key: false };
      if (other.at && now - other.at < PULL_WINDOW) return { text: 'A társad lehúzta a karját: húzd meg most!', key: true };
      return { text: 'Kar: húzzátok meg egyszerre a két kart', key: true };
    }
    if (inBand(p.pos.y, NEAR3) && !this.doors.runaajto.opening) {
      const k = this.stoneAt(p);
      if (k < 0) return null;
      if (solo) return { text: 'Rúnakő · két játékos kell hozzá, egy-egy mindkét kőnél', key: false };
      if (!this.rune.active) return { text: 'Rúnakő: a társad álljon a másik kő elé', key: false };
      if (k === 0) return { text: 'Rúnakő: mondd el a társadnak, milyen sorrendben gyúltak ki itt a rúnák', key: false };
      return { text: `Rúnakő: nyomd meg, amikor a sorrend következő rúnája világít (${this.rune.progress} / 4)`, key: true };
    }
    return null;
  }

  updateRunes(dt, players, intents) {
    const r = this.rune;
    const door = this.doors.runaajto;
    const at = [0, 1].map((k) => players.findIndex((p) => this.stoneAt(p) === k));
    const both = at[0] >= 0 && at[1] >= 0 && at[0] !== at[1];
    if (!door.opening) {
      if (!both) {
        for (let k = 0; k < 2; k++) {
          if (at[k] >= 0) this.say(players[at[k]], 'rune1', players.length < 2 ? 'A rúnakő halványan dereng. Ehhez az ajtóhoz két játékos kell (csak co-opban nyílik): egyikőtök az egyik, másikotok a másik kő elé álljon. Második játékos: F2, vagy egy kontroller Start gombja.' : 'A rúnakő halványan dereng. A társadnak a másik kő elé kell állnia!');
        }
        if (r.active) {
          r.active = false;
          r.progress = 0;
        }
      } else {
        if (!r.active) {
          r.active = true;
          r.cursor = 0;
          r.cursorT = 0;
          for (const k of [0, 1]) this.say(players[at[k]], 'rune2', k === 0 ? 'A kövön négy rúna gyúlt ki: mondd el a társadnak balról jobbra a sorrendjüket!' : 'A kövön a rúnák egyenként felvillannak: a társad megmondja a sorrendet, és te akkor nyomd meg a használat gombot, amikor a soron következő rúna világít!', 4);
        }
        r.cursorT += dt;
        if (r.cursorT > 1.1) {
          r.cursorT = 0;
          r.cursor = (r.cursor + 1) % 4;
        }
        const ib = intents?.[at[1]];
        if (ib?.interactPressed) {
          if (r.order[r.cursor] === r.code[r.progress]) {
            r.progress++;
            r.flash = 0.5;
            r.flashGood = true;
            if (r.progress >= 4) this.open('runaajto', players);
          } else {
            r.progress = 0;
            r.flash = 0.6;
            r.flashGood = false;
          }
        }
      }
    }
    r.flash = Math.max(0, r.flash - dt);
    // Panels: redraw only when what they show changes.
    const glowA = door.opening ? 1 : r.active ? 1 : at[0] >= 0 ? 0.15 : 0;
    const keyA = `${glowA}|${r.code}|${door.opening}`;
    const pa = this.panels[0];
    if (pa.drawn !== keyA) {
      pa.drawn = keyA;
      drawPanel(pa.ctx, r.code, r.code.map(() => glowA), 0, '#9fd8ff');
      pa.tex.needsUpdate = true;
    }
    const pb = this.panels[1];
    const lit = r.order.map((_, i) => (door.opening ? 1 : r.active ? (i === r.cursor ? 1 : 0.18) : at[1] >= 0 ? 0.12 : 0));
    const tint = r.flash > 0 ? (r.flashGood ? '#ffe090' : '#ff6040') : '#9fd8ff';
    const keyB = `${lit}|${r.order}|${r.progress}|${tint}`;
    if (pb.drawn !== keyB) {
      pb.drawn = keyB;
      drawPanel(pb.ctx, r.order, lit, r.progress, tint);
      pb.tex.needsUpdate = true;
    }
  }
}
