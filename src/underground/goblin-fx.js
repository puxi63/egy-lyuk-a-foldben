/* ==== underground/goblin-fx.js — what moves in Goblin-town: the torch and brazier flames (one merged mesh of
   camera-facing quads, shaped and animated in the shader, additive), and the distant goblin drums (synthesised with
   WebAudio, louder the deeper a player is inside Goblin-town; no audio files). ==== */
import * as THREE from 'three';
import { sharedAudio } from '../audio.js';

const flameVert = `
  uniform float uTime;
  attribute vec2 corner;
  attribute vec3 fseed;
  varying vec2 vUv;
  varying float vPh;
  varying float vHalo;
  varying float vFogDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float s = fseed.x;
    float halo = fseed.z;
    float flick = 1.0 + 0.13 * sin(uTime * 9.1 + fseed.y * 7.0) + 0.08 * sin(uTime * 15.7 + fseed.y * 3.0);
    // Flame quads stand on their base (corner.y 0..1); halo quads are centred and larger.
    vec2 off = halo > 0.5 ? vec2(corner.x, corner.y * 2.0 - 1.0) * s * 1.3 + vec2(0.0, 0.35 * s) : vec2(corner.x * 0.45 * s, corner.y * s * flick);
    mv.xy += off;
    vUv = vec2(corner.x * 0.5 + 0.5, corner.y);
    vPh = fseed.y;
    vHalo = halo;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const flameFrag = `
  uniform float uTime;
  uniform float fogNear;
  uniform float fogFar;
  varying vec2 vUv;
  varying float vPh;
  varying float vHalo;
  varying float vFogDepth;
  void main() {
    float fogF = smoothstep(fogNear, fogFar, vFogDepth);
    if (vHalo > 0.5) {
      vec2 c = vec2(vUv.x - 0.5, vUv.y - 0.5) * 2.0;
      float r = length(c);
      float a = pow(max(0.0, 1.0 - r), 2.2) * (0.13 + 0.03 * sin(uTime * 7.0 + vPh));
      gl_FragColor = vec4(vec3(1.0, 0.45, 0.12) * a * (1.0 - fogF), 1.0);
      return;
    }
    float y = vUv.y;
    float x = (vUv.x - 0.5) * 2.0;
    // Licking tongues: the centre line sways more towards the tip; two waves rising through the flame.
    float sway = (0.16 * sin(y * 6.0 - uTime * 7.0 + vPh) + 0.07 * sin(y * 13.0 - uTime * 11.0 + vPh * 2.0)) * y;
    float width = (1.0 - y) * (0.55 + 0.45 * sqrt(clamp(y * 3.0, 0.0, 1.0)));
    float d = abs(x - sway) / max(width, 0.001);
    float tongues = 0.5 + 0.5 * sin(y * 9.0 - uTime * 9.5 + vPh * 3.0 + x * 3.0);
    float a = (1.0 - smoothstep(0.35, 1.0, d)) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.55 + 0.25 * tongues, 1.0, y));
    float hot = (1.0 - d) * (1.0 - y);
    vec3 col = mix(vec3(0.9, 0.22, 0.03), vec3(1.0, 0.62, 0.18), smoothstep(0.0, 0.5, hot));
    col = mix(col, vec3(1.0, 0.92, 0.7), smoothstep(0.45, 0.85, hot));
    gl_FragColor = vec4(col * a * 1.5 * (1.0 - fogF), 1.0);
  }`;

/**
 * One mesh for all flames: per flame a flame quad and a soft halo quad (4 vertices each, the flame's base point
 * repeated, corners and seeds as attributes).
 * @param {number[][]} flames [x, y, z, size, phase] per flame
 */
export function buildFlames(flames) {
  const n = flames.length * 2;
  const pos = new Float32Array(n * 4 * 3);
  const corner = new Float32Array(n * 4 * 2);
  const seed = new Float32Array(n * 4 * 3);
  const idx = new Uint32Array(n * 6);
  const C = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  let q = 0;
  for (const f of flames) {
    for (const halo of [0, 1]) {
      for (let k = 0; k < 4; k++) {
        const v = q * 4 + k;
        pos.set([f[0], f[1], f[2]], v * 3);
        corner.set(C[k], v * 2);
        seed.set([f[3], f[4], halo], v * 3);
      }
      idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
      q++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('fseed', new THREE.BufferAttribute(seed, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  // The quads grow in the vertex shader: pad the bounds.
  g.boundingSphere.radius += 2;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: flameVert,
    fragmentShader: flameFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 2;
  mesh.name = 'l4-flames';
  return mesh;
}

/**
 * The goblin drums: a slow, heavy pattern of low thumps (a pitched-down sine with a noise thud) heard through rock
 * (low-passed), louder the more a player is inside Goblin-town. `update(dt, level)` with level 0..1.
 */
export class GoblinDrums {
  constructor() {
    this.ctx = null;
    this.t = 0;
    this.beat = 0;
    this.level = 0;
  }

  /** The audio context is made on the first audible update (after the start screen's click). */
  init() {
    this.ctx = sharedAudio();
    if (!this.ctx) return false;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.out.connect(lp).connect(this.ctx.destination);
    // A short noise buffer for the skin's slap.
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    return true;
  }

  hit(when, strength) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(86, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.35);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.9 * strength, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.6);
    o.connect(g).connect(this.out);
    o.start(when);
    o.stop(when + 0.65);
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const ng = c.createGain();
    ng.gain.value = 0.35 * strength;
    n.connect(ng).connect(this.out);
    n.start(when);
  }

  /** Per frame: `level` 0..1 (0 = silent). */
  update(dt, level) {
    this.level += (level - this.level) * Math.min(1, dt * 0.8);
    if (this.level < 0.01) {
      if (this.out) this.out.gain.value = 0;
      return;
    }
    if (!this.ctx && !this.init()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.out.gain.value = this.level * 0.32;
    // Pattern of 8 steps at ~92 bpm: BOOM . . boom BOOM . boom .
    const PATTERN = [1, 0, 0, 0.55, 0.9, 0, 0.5, 0];
    const step = 60 / 92 / 2;
    this.t += dt;
    while (this.t >= step) {
      this.t -= step;
      const s = PATTERN[this.beat % PATTERN.length];
      // Every few bars the drummers pause.
      const bar = Math.floor(this.beat / PATTERN.length);
      if (s > 0 && bar % 6 !== 5) this.hit(this.ctx.currentTime + 0.02, s);
      this.beat++;
    }
  }
}
