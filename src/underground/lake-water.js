/* ==== underground/lake-water.js — the water of Gollum's lake (layer 5): its surface (one flat mesh over the lake's
   fixed basin: dark, slightly reflective, faint ripples, rings where drops fall and where someone wades), the drips
   and their sound, and how a player moves in it (wading, slow paddling, climbing out; no drowning).

   The water is a fixed body (lake-sites.js WATER_Y and the basin outline): it never flows, and digging below the water
   line outside the basin leaves a dry hole (NOTES-3a-lake).

   Fragment budget (the water can fill a whole view): the surface is opaque and drawn before the terrain (renderOrder
   −1), so the lake bed under it is rejected by the depth test instead of being shaded and then covered; the shader is
   a few sines, at most RING_MAX ring terms (the loop stops at the live count) and two lamp terms. No reflection pass,
   no transparency, no screen-space work. ==== */
import * as THREE from 'three';
import { HUNGER, PLAYER } from '../config.js';
import { sharedAudio } from '../audio.js';
import { raycast, sdf } from '../world.js';
import { BASIN_MARGIN, inBasin, planPoint, shoreFrac, WATER_Y } from './lake-sites.js';

/** Rings on the surface at once (drips, waders, Gollum's paddling). */
export const RING_MAX = 10;
/** Seconds a ring lives. */
const RING_LIFE = 3.6;

export const waterVert = `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

export const waterFrag = `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec4 uRings[${RING_MAX}];
  uniform int uRingN;
  uniform vec4 uLamp[2];
  uniform vec3 uLampCol;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  varying vec3 vW;
  void main() {
    vec2 p = vW.xz;
    // A still lake: only a faint, slow swell (the gradient of three small waves).
    vec2 g = vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.7 + uTime * 0.55) * 0.0035;
    g += vec2(-0.5, 0.866) * cos(dot(p, vec2(-0.5, 0.866)) * 2.9 - uTime * 0.75) * 0.0025;
    g += vec2(0.97, -0.243) * cos(dot(p, vec2(0.97, -0.243)) * 5.3 + uTime * 1.25) * 0.0013;
    // Rings: a short wave train running outwards from each drop, fading with age and distance.
    for (int i = 0; i < ${RING_MAX}; i++) {
      if (i >= uRingN) break;
      vec4 r = uRings[i];
      float age = uTime - r.z;
      vec2 d = p - r.xy;
      float dist = length(d) + 1e-4;
      float x = dist - age * 0.42;
      if (abs(x) > 0.5) continue;
      float env = exp(-x * x * 16.0) * r.w * exp(-age * 0.95) / (1.0 + dist * 1.6);
      g += d / dist * cos(x * 28.0) * env * 0.16;
    }
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vW);
    float nv = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    // Black-green depth, the dim cold cave mirrored more at grazing angles.
    vec3 col = mix(uDeep, uSky, F);
    // The players' lamps: a faint glow into the water and their reflections (a sharp glint and a soft sheen).
    for (int i = 0; i < 2; i++) {
      vec4 L = uLamp[i];
      if (L.w <= 0.0) continue;
      vec3 ld = L.xyz - vW;
      float dd = dot(ld, ld);
      float att = L.w / (1.0 + dd * 0.3);
      vec3 Ln = ld * inversesqrt(dd);
      float nh = max(dot(N, normalize(Ln + V)), 0.0);
      col += uLampCol * att * (0.01 * max(Ln.y, 0.0) + (pow(nh, 260.0) * 2.4 + pow(nh, 36.0) * 0.1) * (0.35 + F));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/**
 * The lake surface: a fan over the basin outline (the outline reaches BASIN_MARGIN past the shoreline, under the
 * shore's rock where it is hidden). Island rock pokes up through it (the plane runs on under the island, so a dug-down
 * island fills with water too).
 */
function buildSurface() {
  const N = 120;
  const RINGS = [0.35, 0.65, 0.85, 1.0];
  const [cx, cz] = planPoint(0, 0);
  const pos = [cx, WATER_Y, cz];
  for (const k of RINGS) {
    for (let i = 0; i < N; i++) {
      const th = -Math.PI + (i / N) * Math.PI * 2;
      const [x, z] = planPoint(th, (shoreFrac(th) + BASIN_MARGIN) * k);
      pos.push(x, WATER_Y, z);
    }
  }
  const idx = [];
  for (let i = 0; i < N; i++) idx.push(0, 1 + ((i + 1) % N), 1 + i);
  for (let r = 0; r + 1 < RINGS.length; r++) {
    const a = 1 + r * N;
    const b = 1 + (r + 1) * N;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      idx.push(a + i, a + j, b + i, a + j, b + j, b + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** A short "plink" of a drop falling into still water, with the cave's echo. */
class DripSound {
  constructor() {
    this.ctx = null;
  }

  init() {
    this.ctx = sharedAudio();
    if (!this.ctx) return false;
    const c = this.ctx;
    this.out = c.createGain();
    this.out.gain.value = 0.5;
    // The cave: a few hundred milliseconds of feedback echo, darkened.
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.23;
    const fb = c.createGain();
    fb.gain.value = 0.42;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.out.connect(c.destination);
    this.out.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    fb.connect(c.destination);
    return true;
  }

  /** One drop; `level` 0..1 by distance. */
  play(level, pitch = 1) {
    if (level < 0.02) return;
    if (!this.ctx && !this.init()) return;
    const c = this.ctx;
    if (c.state === 'suspended') return;
    const t = c.currentTime + 0.01;
    const o = c.createOscillator();
    const g = c.createGain();
    const f0 = (1100 + Math.random() * 900) * pitch;
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.1, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** A splash (a player going into the water fast): filtered noise. */
  splash(level) {
    if (level < 0.02) return;
    if (!this.ctx && !this.init()) return;
    const c = this.ctx;
    if (c.state === 'suspended') return;
    const len = Math.floor(c.sampleRate * 0.5);
    if (!this.noise) {
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.value = 0.6 * level;
    n.connect(bp).connect(g).connect(this.out);
    n.start();
  }
}

export class LakeWater {
  /** @param {THREE.Object3D} group the lake's decor group (the surface is shown with it) */
  constructor(group) {
    this.rings = [];
    this.time = 0;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uRings: { value: Array.from({ length: RING_MAX }, () => new THREE.Vector4()) },
      uRingN: { value: 0 },
      uLamp: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uLampCol: { value: new THREE.Color(1.0, 0.86, 0.66) },
      // Linear colours: the water's black-green depth, and the cold blue dark it mirrors.
      uDeep: { value: new THREE.Color(0.0035, 0.0065, 0.0085) },
      uSky: { value: new THREE.Color(0.012, 0.021, 0.036) },
    }]);
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: waterVert, fragmentShader: waterFrag, fog: true });
    this.mesh = new THREE.Mesh(buildSurface(), mat);
    this.mesh.matrixAutoUpdate = false;
    // Before the terrain: the lake bed under the water is then rejected by the depth test (see the header).
    this.mesh.renderOrder = -1;
    this.mesh.name = 'l5-water';
    group.add(this.mesh);
    this.sound = new DripSound();
    this.dripT = 0.5;
    this.mute = false;
  }

  /** A ring on the surface at (x, z); `strength` about 0.3 (a drip) to 1.5 (a splash). */
  addRing(x, z, strength = 0.5) {
    if (!inBasin(x, z)) return;
    if (this.rings.length >= RING_MAX) this.rings.shift();
    this.rings.push({ x, z, t: this.time, s: strength });
  }

  /** A drop from the atmosphere (atmosphere.js) reaching the water: a ring and a plink near the listener. */
  dropHit(x, z, near) {
    this.addRing(x, z, 0.32 + Math.random() * 0.12);
    if (!this.mute) this.sound.play(near * 0.6);
  }

  /** True when a falling point (x, y, z) has reached the water. */
  hits(x, y, z) {
    return y <= WATER_Y && y > WATER_Y - 1.5 && inBasin(x, z);
  }

  /**
   * Per frame: the clock, the lamps (both players'), ambient drips from the roof while a player is down at the lake,
   * the waders' rings, and the ring uniforms.
   */
  update(dt, players) {
    this.time += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    let near = Infinity;
    for (let i = 0; i < 2; i++) {
      const p = players[i];
      const L = u.uLamp.value[i];
      if (!p || p.dead > 0 || !p.lamp) {
        L.set(0, 0, 0, 0);
        continue;
      }
      L.set(p.lamp.position.x, p.lamp.position.y, p.lamp.position.z, p.lamp.intensity > 0 ? p.lamp.intensity / 6 : 0);
      near = Math.min(near, Math.abs(p.pos.y - WATER_Y));
      // A wader or swimmer leaves rings as they move (and a splash when they come in fast).
      const w = p.water;
      if (w && w.depth > 0.05) {
        const sp = Math.hypot(p.vel.x, p.vel.z);
        p.waterRingT = (p.waterRingT || 0) - dt;
        if (sp > 0.3 && p.waterRingT <= 0) {
          p.waterRingT = 0.32;
          this.addRing(p.pos.x, p.pos.z, Math.min(1.2, 0.35 + sp * 0.3));
        }
        if (w.entered && !this.mute) this.sound.splash(Math.min(1, w.entered / 8));
        if (w.entered) this.addRing(p.pos.x, p.pos.z, 1.5);
        w.entered = 0;
      }
    }
    // Ambient drips from the roof over the lake (only while somebody is down at the lake: within 12 m of the water).
    if (near < 12) {
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = 0.35 + Math.random() * 1.1;
        const th = Math.random() * Math.PI * 2;
        const t = Math.sqrt(Math.random()) * shoreFrac(th);
        const [x, z] = planPoint(th, t);
        this.addRing(x, z, 0.28 + Math.random() * 0.2);
        // The sound by the distance to the nearest player.
        let dmin = Infinity;
        for (const p of players) dmin = Math.min(dmin, Math.hypot(p.pos.x - x, p.pos.y - WATER_Y, p.pos.z - z));
        if (!this.mute) this.sound.play(Math.max(0, 1 - dmin / 16) * 0.8, 0.8 + Math.random() * 0.5);
      }
    }
    // Retire old rings, upload the live ones.
    while (this.rings.length && this.time - this.rings[0].t > RING_LIFE) this.rings.shift();
    const arr = u.uRings.value;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      arr[i].set(r.x, r.z, r.t, r.s);
    }
    u.uRingN.value = this.rings.length;
  }
}

/* ---------------------------------------------------------------- moving in the water ---- */

const DOWN = new THREE.Vector3(0, -1, 0);
const tmpO = new THREE.Vector3();
/** Gollum's lake as a body of water for waterStep. */
export const LAKE_BODY = { level: WATER_Y, inside: (x, z) => inBasin(x, z) };

/**
 * How a player moves in the lake (player.js calls this after its own walking step, before the position update). The
 * water is the basin below WATER_Y. Wading: the deeper, the slower. Swimming (water deeper than the player's float
 * depth, i.e. the eye would go under): no gravity, the body floats with the eye just above the water and paddles slowly;
 * pushing against a bank (or jumping) near it heaves the player out. Never drowns. A fall into deep water is caught by
 * the water (the landing speed rule does not apply in it); a fall into a hand's depth of water still counts.
 * Sets `p.water` = { depth (m of water at the feet), swimming, entered (impact speed when just come in) } or null.
 * `water` is the body of water: { level (world y of the surface), inside(x, z) (its fixed outline) }; Gollum's lake by
 * default, the river under the Elvenking's halls passes its own (mirkwood-water.js).
 * @returns {boolean} true while swimming (player.js then skips the landing check)
 */
export function waterStep(p, it, dt, wx, wz, menuOpen, water = LAKE_BODY) {
  const WATER_Y = water.level;
  const x = p.pos.x;
  const z = p.pos.z;
  if (p.pos.y >= WATER_Y + 0.05 || p.pos.y < WATER_Y - 12 || !water.inside(x, z)) {
    // Out of the water (or above it): remember how fast we came down, for the splash.
    if (p.water) p.water = null;
    return false;
  }
  const w = p.water || (p.water = { depth: 0, swimming: false, entered: 0, bed: 0, bedT: 0 });
  const wasIn = w.depth > 0.05;
  w.depth = WATER_Y - p.pos.y;
  if (!wasIn && w.depth > 0.05 && p.vel.y < -2.5) w.entered = -p.vel.y;
  // The lake bed under the player (a raycast down from the surface, a few times a second).
  w.bedT -= dt;
  if (w.bedT <= 0) {
    w.bedT = 0.15;
    const t = raycast(tmpO.set(x, WATER_Y, z), DOWN, 9);
    w.bed = t < 0 ? 9 : t;
  }
  // Floating: the eye 0.3 m above the water, so the feet hang this far below it.
  const floatDepth = p.eyeH - 0.3;
  const deep = w.bed > floatDepth + 0.05;
  // A fall into deep water is caught (no landing death in it); into shallow water it still hurts.
  if (w.bed > 1.1 && p.vel.y < -3.5) p.vel.y += (-3.5 - p.vel.y) * Math.min(1, dt * 14);
  if (deep && w.depth > floatDepth - 0.12 && !(p.climbOutT > 0)) {
    // Swimming: undo the walking step's gravity, float to the surface (a spring with damping), paddle slowly.
    w.swimming = true;
    p.vel.y += PLAYER.gravity * dt;
    const bob = Math.sin(performance.now() * 0.0021 + p.slot) * 0.025;
    const target = WATER_Y - floatDepth + bob;
    p.vel.y += ((target - p.pos.y) * 9 - p.vel.y * 4.5) * dt;
    // The water's own horizontal velocity replaces the walking step's (which would pull towards walking speed).
    if (!w.wasSwimming) {
      w.vx = p.vel.x;
      w.vz = p.vel.z;
    }
    const speed = 1.35;
    const a = Math.min(1, 3.2 * dt);
    w.vx += (wx * speed - w.vx) * a;
    w.vz += (wz * speed - w.vz) * a;
    p.vel.x = w.vx;
    p.vel.z = w.vz;
    if (Math.hypot(wx, wz) > 0.1) p.addHunger(-HUNGER.perClimbSecond * 0.35 * dt);
    // Never let the eye go under (the surface is drawn from above only).
    const low = WATER_Y - floatDepth - 0.12;
    if (p.pos.y < low) {
      p.pos.y = low;
      if (p.vel.y < 0) p.vel.y = 0;
    }
    // Climbing out: a bank in front (rock at the waterline within 0.6 m) with room on top heaves the player up.
    const wl = Math.hypot(wx, wz);
    if (!menuOpen && (it.jumpPressed || wl > 0.5)) {
      const dx = wl > 0.1 ? wx / wl : -Math.sin(p.yaw);
      const dz = wl > 0.1 ? wz / wl : -Math.cos(p.yaw);
      const bank = sdf(x + dx * 0.55, WATER_Y + 0.05, z + dz * 0.55) > 0;
      if (bank) {
        // How high the bank is: the first air above it, up to 0.9 m over the water.
        let top = -1;
        for (let h = 0.1; h <= 0.95; h += 0.1) {
          if (sdf(x + dx * 0.7, WATER_Y + h, z + dz * 0.7) <= 0) {
            top = h;
            break;
          }
        }
        const room = top >= 0 && sdf(x + dx * 0.7, WATER_Y + top + p.eyeH * 0.8, z + dz * 0.7) <= 0;
        p.bankPush = (p.bankPush || 0) + dt;
        if (room && (it.jumpPressed || p.bankPush > 0.35)) {
          p.bankPush = 0;
          const rise = floatDepth + top + 0.35;
          p.vel.y = Math.sqrt(2 * PLAYER.gravity * rise);
          p.vel.x = dx * 1.8;
          p.vel.z = dz * 1.8;
          p.climbOutT = 0.5;
        }
      } else p.bankPush = 0;
    }
  } else {
    // Wading: up to the float depth the bed carries the player; the water slows the steps (and the jumps).
    w.swimming = false;
    if (w.depth > 0.05 && p.grounded) {
      // The walking step aimed at full speed: cap the horizontal speed at the slowed pace instead.
      const f = 1 - 0.55 * Math.min(1, w.depth / floatDepth);
      const sp = Math.hypot(p.vel.x, p.vel.z);
      const cap = PLAYER.walk * f;
      if (sp > cap) {
        p.vel.x *= cap / sp;
        p.vel.z *= cap / sp;
      }
    }
  }
  p.climbOutT = Math.max(0, (p.climbOutT || 0) - dt);
  w.wasSwimming = w.swimming;
  return w.swimming;
}
