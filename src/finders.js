/* ==== finders.js — finding things on a layer (TODO item 29, NOTES-38-finders) ====
 * Three aids, all spoiler-free (they show only what was bought, what is in range, or a direction):
 *  1. Wall tapping, a free ability (input.js `tapPressed`): the echo gives the direction and rough distance of the
 *     nearest generated hollow (cave pocket, room, set piece) on the player's layer — never the players' own tunnels,
 *     because the survey reads the generated field (save.js baseField()), not the dug one. Noisy (enemies' noiseT,
 *     Smaug's meter), with a cooldown. The HUD shows a short-lived ring with an arrow (hud.js updateTap) and a line.
 *  2. Balin's layer map, bought per layer at the counter (hud.js rows): that layer's hollows are inked on Thrór's map
 *     (ui/map.js). Only layers someone has reached are sold.
 *  3. The lamp shimmer upgrade (3 tiers, 3 / 5 / 7 m): finds embedded within range sparkle faintly through the soil.
 *     One pooled THREE.Points (one draw call per view, none when empty), positions refreshed 4 times a second, the fade
 *     by the viewing camera's distance done in the shader, so each split view sees only the finds near its own lamp.
 * The purchases are game-wide (like the shared purse) and saved inside the journal's save object as the optional
 * `finders` field ({ maps: [layer…], lamp: tier }); a save without it starts with none (ui/journal.js).
 * Created lazily (`findersOf(game)`) by the first player, so game.js needs no change. ==== */
import * as THREE from 'three';
import { CELL, CHUNK, CX, CY, CZ, DSCALE, FINDERS, NX, NY, NZ, ORIGIN } from './config.js';
import { LAYER_BOTTOM, LAYER_NAMES, LAYER_TOPS, layerAtDepth } from './materials.js';
import { baseField } from './save.js';
import { sound } from './minigames/common.js';
import { raycast } from './world.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const LAYERS = LAYER_TOPS.length;

/** A layer's world-y range [bottom, top] for the survey (the garden's top stays a metre under the lawn). */
function layerY(l) {
  const top = l === 0 ? -1.0 : -LAYER_TOPS[l];
  const bottom = -(LAYER_TOPS[l + 1] ?? LAYER_BOTTOM);
  return [bottom, top];
}

/** The eight directions relative to the facing, from straight ahead clockwise (sectors of 45°). */
const DIRS = ['előtted', 'jobbra előre', 'jobbra', 'jobbra hátra', 'mögötted', 'balra hátra', 'balra', 'balra előre'];

/** Shimmer sparkle shader: fades by the viewing camera's distance (per view), twinkles by a per-find seed. */
const SHIMMER_VS = `
uniform float uRange;
uniform float uTime;
uniform float uPx;
attribute float aSeed;
attribute vec3 aColor;
varying float vA;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = length(mv.xyz);
  float f = clamp(1.0 - d / uRange, 0.0, 1.0);
  vA = sqrt(f) * (0.65 + 0.35 * sin(uTime * 2.6 + aSeed * 6.2831));
  vC = aColor;
  gl_PointSize = clamp(uPx / max(0.4, -mv.z), 2.0, 48.0);
  gl_Position = f > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`;
const SHIMMER_FS = `
varying float vA;
varying vec3 vC;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  float glow = exp(-r2 * 6.0);
  float star = max(0.0, 1.0 - abs(c.x) * 9.0) * max(0.0, 1.0 - abs(c.y)) + max(0.0, 1.0 - abs(c.y) * 9.0) * max(0.0, 1.0 - abs(c.x));
  float a = min(0.95, (glow * 0.75 + star * 0.9) * vA * 1.3);
  if (a < 0.01) discard;
  // Normal blending (an additive glow vanishes on the lamp-lit pale soil): the find's colour lifted towards warm white.
  vec3 col = min(vec3(1.0), mix(vC, vec3(1.0, 0.95, 0.78), 0.4) * 1.25);
  gl_FragColor = vec4(mix(col, vec3(1.0), exp(-r2 * 30.0)), a); // a white-hot centre
}`;

export class Finders {
  constructor(game, saved) {
    this.game = game;
    /** Balin's maps bought: layer indices. */
    this.maps = new Set();
    /** Lamp shimmer tier bought: 0 none, 1–3. */
    this.lamp = 0;
    this.restore(saved);
    // A bench page may switch the shimmer on at a tier (`&shimmer=3`, NOTES-38's A/B bench).
    if (game.bench) {
      const t = +(game.params?.get?.('shimmer') || 0) | 0;
      if (t > 0) this.lamp = Math.min(FINDERS.lamp.length, t);
      // The bench's 2p / 2p-stress players dig at the lawn's level: let the shimmer work there too, so it is measured.
      this.benchAny = t > 0;
    }
    /** Per layer: the surveyed hollows (lazily, on the first tap there or the first map drawn). */
    this.survey = new Array(LAYERS).fill(null);
    /** Per slot: the tap cooldown left (s). */
    this.tapCd = [0, 0];
    this.lastTap = null; // the last tap's result (QA)
    this.taps = 0;
    this.buildShimmer();
    this.shT = 0;
    this.time = 0;
  }

  /* ---------------- save ---------------- */

  state() {
    if (!this.maps.size && !this.lamp) return undefined;
    const out = {};
    if (this.maps.size) out.maps = [...this.maps].sort((a, b) => a - b);
    if (this.lamp) out.lamp = this.lamp;
    return out;
  }

  restore(s) {
    for (const l of s?.maps || []) if (Number.isInteger(l) && l >= 0 && l < LAYERS) this.maps.add(l);
    const t = s?.lamp | 0;
    if (t > 0) this.lamp = Math.min(FINDERS.lamp.length, t);
  }

  /* ---------------- the survey of the generated field ---------------- */

  /**
   * The hollows of a layer: connected groups of hollow cells (0.5 m grid) in the generated field, each
   * { n, pts: Float32Array [x, y, z, …], x0, x1, y0, y1, z0, z1 }. Cached per layer.
   */
  hollows(l) {
    if (this.survey[l]) return this.survey[l];
    const base = baseField();
    if (!base) return [];
    const t0 = performance.now();
    const { step, air, minCells } = FINDERS.grid;
    const thr = (air / CELL) * DSCALE;
    const [yb, yt] = layerY(l);
    const j0 = Math.max(0, Math.ceil((yb - ORIGIN.y) / CELL / step) * step);
    const j1 = Math.min(NY - 1, Math.floor((yt - ORIGIN.y) / CELL));
    const gx = Math.floor((NX - 1) / step) + 1;
    const gz = Math.floor((NZ - 1) / step) + 1;
    const gy = Math.max(0, Math.floor((j1 - j0) / step) + 1);
    const total = gx * gy * gz;
    const mark = new Int32Array(total); // 0 solid, -1 hollow not yet grouped, ≥ 1 group
    for (let c = 0; c < gz; c++) {
      for (let b = 0; b < gy; b++) {
        const row = NX * (j0 + b * step + NY * (c * step));
        const o = gx * (b + gy * c);
        for (let a = 0; a < gx; a++) if (base[row + a * step] < thr) mark[o + a] = -1;
      }
    }
    const queue = new Int32Array(total);
    const out = [];
    let id = 0;
    for (let s = 0; s < total; s++) {
      if (mark[s] !== -1) continue;
      id++;
      let qh = 0;
      let qt = 0;
      queue[qt++] = s;
      mark[s] = id;
      while (qh < qt) {
        const v = queue[qh++];
        const a = v % gx;
        const b = Math.floor(v / gx) % gy;
        const c = Math.floor(v / (gx * gy));
        if (a > 0 && mark[v - 1] === -1) { mark[v - 1] = id; queue[qt++] = v - 1; }
        if (a < gx - 1 && mark[v + 1] === -1) { mark[v + 1] = id; queue[qt++] = v + 1; }
        if (b > 0 && mark[v - gx] === -1) { mark[v - gx] = id; queue[qt++] = v - gx; }
        if (b < gy - 1 && mark[v + gx] === -1) { mark[v + gx] = id; queue[qt++] = v + gx; }
        if (c > 0 && mark[v - gx * gy] === -1) { mark[v - gx * gy] = id; queue[qt++] = v - gx * gy; }
        if (c < gz - 1 && mark[v + gx * gy] === -1) { mark[v + gx * gy] = id; queue[qt++] = v + gx * gy; }
      }
      if (qt < minCells) continue;
      const pts = new Float32Array(qt * 3);
      const h = { n: qt, pts, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
      for (let q = 0; q < qt; q++) {
        const v = queue[q];
        const x = ORIGIN.x + (v % gx) * step * CELL;
        const y = ORIGIN.y + (j0 + (Math.floor(v / gx) % gy) * step) * CELL;
        const z = ORIGIN.z + Math.floor(v / (gx * gy)) * step * CELL;
        pts[q * 3] = x;
        pts[q * 3 + 1] = y;
        pts[q * 3 + 2] = z;
        if (x < h.x0) h.x0 = x;
        if (x > h.x1) h.x1 = x;
        if (y < h.y0) h.y0 = y;
        if (y > h.y1) h.y1 = y;
        if (z < h.z0) h.z0 = z;
        if (z > h.z1) h.z1 = z;
      }
      out.push(h);
    }
    this.survey[l] = out;
    this.surveyMs = performance.now() - t0; // QA / cost note
    return out;
  }

  /**
   * The nearest hollow on the layer of world point (x, y, z), skipping the one the point stands in (any cell within
   * FINDERS.tap.here m). Returns { x, y, z, d, h } (the nearest cell of it) or null.
   */
  nearestHollow(x, y, z) {
    const l = layerAtDepth(Math.max(0, -y));
    const here2 = FINDERS.tap.here * FINDERS.tap.here;
    let best = null;
    let bestD = Infinity;
    for (const h of this.hollows(l)) {
      // Quick reject by the box.
      const bx = Math.max(h.x0 - x, 0, x - h.x1);
      const by = Math.max(h.y0 - y, 0, y - h.y1);
      const bz = Math.max(h.z0 - z, 0, z - h.z1);
      if (bx * bx + by * by + bz * bz >= bestD) continue;
      let m = Infinity;
      let mi = 0;
      const p = h.pts;
      for (let i = 0; i < p.length; i += 3) {
        const dx = p[i] - x;
        const dy = p[i + 1] - y;
        const dz = p[i + 2] - z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < m) {
          m = d;
          mi = i;
        }
      }
      if (m < here2) continue; // the hollow the player stands in
      if (m < bestD) {
        bestD = m;
        best = { x: p[mi], y: p[mi + 1], z: p[mi + 2], d: Math.sqrt(m), h };
      }
    }
    return best;
  }

  /* ---------------- 1. wall tapping ---------------- */

  /** The Hungarian direction of a world point seen from a player: "balra", "jobbra előre lent", "alattad" … */
  static direction(p, tx, ty, tz) {
    const ex = tx - p.pos.x;
    const ez = tz - p.pos.z;
    const ey = ty - (p.pos.y + 0.6);
    const horiz = Math.hypot(ex, ez);
    if (horiz < 1.5 && Math.abs(ey) > 1) return ey < 0 ? 'alattad' : 'fölötted';
    // The facing is (−sin yaw, −cos yaw); the angle to the target, positive to the right.
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const right = Math.atan2(fx * ez - fz * ex, fx * ex + fz * ez); // + is to the right (the right vector is (cos, −sin))
    const k = ((Math.round(right / (Math.PI / 4)) % 8) + 8) % 8;
    let dir = DIRS[k];
    if (ey < -Math.max(2, horiz * 0.6)) dir += ' lent';
    else if (ey > Math.max(2, horiz * 0.6)) dir += ' fent';
    return dir;
  }

  /** The angle (rad, 0 ahead, + to the right) of a world point from a player's facing (the HUD ring's arrow). */
  static relAngle(p, tx, tz) {
    const ex = tx - p.pos.x;
    const ez = tz - p.pos.z;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    return Math.atan2(fx * ez - fz * ex, fx * ex + fz * ez);
  }

  /** The tap key: knock on the wall in front, listen for the nearest hollow. */
  tap(p) {
    const g = this.game;
    const slot = p.slot;
    const cfg = FINDERS.tap;
    if (this.tapCd[slot] > 0) {
      p.say(`A fal még zúg a kopogástól… (${Math.ceil(this.tapCd[slot])} mp)`, 1.6);
      return false;
    }
    if (p.depth < 1 || g.bagEnd?.isInside?.(p)) {
      p.say('Itt nincs mit megkopogtatni: lent, a gödör falán kong az üreg.', 2.2);
      return false;
    }
    const eye = p.eye(new THREE.Vector3());
    const fwd = p.forward(new THREE.Vector3());
    const hit = raycast(eye, fwd, cfg.reach);
    if (!(hit >= 0)) {
      p.say('Nincs fal a kezed ügyében: fordulj a falnak, úgy kopogtass.', 2.2);
      return false;
    }
    this.tapCd[slot] = cfg.cooldown;
    this.taps++;
    // Noise: the goblins and spiders hear it like digging, only longer; Smaug's meter on layer 9.
    const en = g.enemies;
    if (en?.noiseT) en.noiseT[slot] = Math.max(en.noiseT[slot] || 0, cfg.noise);
    if (p.depth >= LAYER_TOPS[8]) g.hoard?.addNoise?.(p, cfg.smaug);
    // Two knocks (the minigames' synthesised click; silent without an audio context and on bench pages).
    sound(g, 'clack');
    setTimeout(() => sound(g, 'clack'), 170);
    const found = this.nearestHollow(p.pos.x, p.pos.y + 0.6, p.pos.z);
    if (!found) {
      p.tapCue = null;
      this.lastTap = { slot, found: null };
      p.say('Tömören szól a fal: ezen a rétegen nem kong üreg.', 3.5);
      return true;
    }
    const dist = Math.max(1, Math.round(found.d));
    const dir = Finders.direction(p, found.x, found.y, found.z);
    p.tapCue = { t: cfg.cue, x: found.x, y: found.y, z: found.z, dy: found.y - (p.pos.y + 0.6), dist };
    this.lastTap = { slot, found, dist, dir };
    p.say(`Üregesen kong… ${dir}, kb. ${dist} m`, 4);
    return true;
  }

  /* ---------------- 2. Balin's layer maps ---------------- */

  /** The layer indices someone has reached (the map's rule: the garden always, then by the deepest depth). */
  reachedLayers() {
    const g = this.game;
    const deepest = g.journal?.deepest?.() ?? Math.max(0, ...g.players.map((p) => p.maxDepth || 0));
    const out = [];
    for (let l = 0; l < LAYERS; l++) if (l === 0 || deepest >= LAYER_TOPS[l]) out.push(l);
    return out;
  }

  /** Buys layer l's map: refused (false) when bought already or not reached yet. The price is paid by the caller. */
  buyMap(l) {
    if (this.maps.has(l) || !this.reachedLayers().includes(l)) return false;
    this.maps.add(l);
    return true;
  }

  /* ---------------- the counter rows (hud.js rows) ---------------- */

  /** Counter rows: Balin's map of a reached layer (left / right picks the layer), the lamp's next shimmer tier. */
  shopRows(p, cost, hud) {
    const g = this.game;
    const rows = [];
    const open = this.reachedLayers().filter((l) => !this.maps.has(l));
    if (open.length) {
      // The layer offered: the hud's pick if still open, else the deepest open one.
      let l = hud.mapPick;
      if (!open.includes(l)) l = open[open.length - 1];
      hud.mapPick = l;
      const more = open.length > 1 ? ' ◂▸' : '';
      rows.push({
        kind: 'balinmap', tier: l, label: `Balin térképe: ${ROMAN[l]}. réteg, ${LAYER_NAMES[l]}${more}`, price: cost(FINDERS.maps[l]), ok: true,
        alt: (d) => {
          const i = open.indexOf(l);
          hud.mapPick = open[(i + d + open.length) % open.length];
        },
        act: () => {
          this.buyMap(l);
          for (const q of g.players) if (!q.choosing) q.say(`Balin felrajzolta Thrór térképére a ${ROMAN[l]}. réteg üregeit és termeit.`, 4.5);
          g.saveNow?.();
        },
      });
    }
    const next = FINDERS.lamp[this.lamp];
    if (next) {
      const t = this.lamp + 1;
      rows.push({
        kind: 'lamp', tier: t, label: `Lámpa csillámja ${ROMAN[t - 1]}: leletek derengése ${next.range} m-ről`, price: cost(next.price), ok: true,
        act: () => {
          this.lamp = t;
          for (const q of g.players) if (!q.choosing) q.say(`A lámpa fényében ${next.range} m-ről átderengenek a falba zárt leletek.`, 4.5);
          g.saveNow?.();
        },
      });
    }
    return rows;
  }

  /* ---------------- 3. the lamp shimmer ---------------- */

  buildShimmer() {
    const max = FINDERS.shimmer.max;
    const geo = new THREE.BufferGeometry();
    this.shPos = new Float32Array(max * 3);
    this.shCol = new Float32Array(max * 3);
    this.shSeed = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.shPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.shCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.shSeed, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.shUni = { uRange: { value: 3 }, uTime: { value: 0 }, uPx: { value: 90 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.shUni, vertexShader: SHIMMER_VS, fragmentShader: SHIMMER_FS,
      transparent: true, depthTest: false, depthWrite: false, fog: false,
    });
    this.shimmer = new THREE.Points(geo, mat);
    this.shimmer.frustumCulled = false;
    this.shimmer.renderOrder = 20;
    this.shimmer.visible = false;
    this.shimmer.name = 'finders-shimmer';
    this.shCount = 0;
    this.shColor = new THREE.Color();
    this.shStamp = new Uint32Array(this.game.finds?.items.length || 1);
    this.shRun = 0;
    this.game.scene?.add(this.shimmer);
  }

  /** Refills the sparkles: untaken finds within the lamp's range of any underground player (runs at FINDERS.shimmer.hz). */
  refreshShimmer() {
    const g = this.game;
    const finds = g.finds;
    const tier = FINDERS.lamp[this.lamp - 1];
    let n = 0;
    if (tier && finds?.byChunk) {
      const R = tier.range;
      const R2 = R * R;
      const S = CHUNK * CELL;
      const max = FINDERS.shimmer.max;
      const run = ++this.shRun;
      for (const p of g.players) {
        if (p.choosing || p.dead > 0 || (p.depth < 1 && !this.benchAny) || g.bagEnd?.isInside?.(p)) continue;
        const px = p.pos.x;
        const py = p.pos.y + 1.0;
        const pz = p.pos.z;
        const c0 = (v, o) => Math.max(0, Math.floor((v - R - o) / S));
        const c1 = (v, o, m) => Math.min(m - 1, Math.floor((v + R - o) / S));
        for (let cz = c0(pz, ORIGIN.z, CZ); cz <= c1(pz, ORIGIN.z, CZ); cz++) {
          for (let cy = c0(py, ORIGIN.y, CY); cy <= c1(py, ORIGIN.y, CY); cy++) {
            for (let cx = c0(px, ORIGIN.x, CX); cx <= c1(px, ORIGIN.x, CX); cx++) {
              const list = finds.byChunk[cx + CX * (cy + CY * cz)];
              if (!list) continue;
              for (const it of list) {
                if (it.taken || this.shStamp[it.index] === run || n >= max) continue;
                const dx = it.x - px;
                const dy = it.y - py;
                const dz = it.z - pz;
                if (dx * dx + dy * dy + dz * dz > R2) continue;
                this.shStamp[it.index] = run;
                this.shPos[n * 3] = it.x;
                this.shPos[n * 3 + 1] = it.y;
                this.shPos[n * 3 + 2] = it.z;
                this.shColor.set(it.type.color);
                this.shCol[n * 3] = this.shColor.r;
                this.shCol[n * 3 + 1] = this.shColor.g;
                this.shCol[n * 3 + 2] = this.shColor.b;
                this.shSeed[n] = (it.index * 0.618) % 1;
                n++;
              }
            }
          }
        }
      }
      this.shUni.uRange.value = R;
    }
    const geo = this.shimmer.geometry;
    if (n !== this.shCount || n) {
      for (const a of ['position', 'aColor', 'aSeed']) {
        const attr = geo.attributes[a];
        const size = attr.itemSize;
        if (attr.addUpdateRange) {
          attr.clearUpdateRanges();
          attr.addUpdateRange(0, Math.max(1, n) * size);
        }
        attr.needsUpdate = n > 0;
      }
    }
    this.shCount = n;
    geo.setDrawRange(0, n);
    this.shimmer.visible = n > 0;
  }

  /** Per frame, once (called by the first player's update): cooldowns, the cues, the shimmer at its low rate. */
  tick(dt) {
    this.time += dt;
    for (let i = 0; i < this.tapCd.length; i++) this.tapCd[i] = Math.max(0, this.tapCd[i] - dt);
    for (const p of this.game.players) {
      if (p.tapCue) {
        p.tapCue.t -= dt;
        if (p.tapCue.t <= 0) p.tapCue = null;
      }
    }
    if (!this.lamp) {
      if (this.shCount) this.refreshShimmer();
      return;
    }
    this.shUni.uTime.value = this.time;
    // The sparkle's size: about 0.25 m across at the canvas's pixel scale (one value for every view).
    const h = this.game.renderer?.domElement?.height || 900;
    this.shUni.uPx.value = h * 0.18;
    this.shT -= dt;
    if (this.shT <= 0) {
      this.shT = 1 / FINDERS.shimmer.hz;
      this.refreshShimmer();
    }
  }
}

/** The game's finders (created on the first call; the journal's saved `finders` field restores the purchases). */
export function findersOf(game) {
  if (!game.finders) game.finders = new Finders(game, game.journal?.findersSave);
  return game.finders;
}
