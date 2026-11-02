/* ==== digfx.js — the feel of a swing: clods of soil flying from the bite (pooled, instanced), sparks in hard stone,
   a synthesised thud / crunch / clink per soil, and a small camera kick (applied by the player) ==== */
import * as THREE from 'three';
import { sharedAudio } from './audio.js';
import { MATS } from './materials.js';

const CLODS = 220;
const SPARKS = 90;
const GRAVITY = 9.8;

export class DigFx {
  constructor(scene) {
    const clodGeo = new THREE.DodecahedronGeometry(0.026, 0);
    this.clods = new THREE.InstancedMesh(clodGeo, new THREE.MeshLambertMaterial(), CLODS);
    this.clods.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.clods.frustumCulled = false;
    this.clods.count = 0;
    // The colour buffer must exist before the first render, or the shader is compiled without instance colours.
    for (let i = 0; i < CLODS; i++) this.clods.setColorAt(i, new THREE.Color(0x6a4a2a));
    scene.add(this.clods);
    const sparkGeo = new THREE.OctahedronGeometry(0.012, 0);
    this.sparks = new THREE.InstancedMesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffd890, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), SPARKS);
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.frustumCulled = false;
    this.sparks.count = 0;
    scene.add(this.sparks);
    // Particle state in flat arrays (no allocation per frame): x, y, z, vx, vy, vz, life, size.
    this.cp = new Float32Array(CLODS * 8);
    this.sp = new Float32Array(SPARKS * 8);
    this.cn = 0;
    this.sn = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.c2 = new THREE.Color();
    this.audio = null;
    this.spinA = new THREE.Vector3(0.6, 0.7, 0.4).normalize();
    this.spinB = new THREE.Vector3(0, 1, 0);
  }

  /**
   * A swing hit the soil at `p` (world), the swing came along `dir`; `mat` is the material index, `amount` the
   * cubic metres removed (0 when the soil did not give way: only a knock).
   */
  burst(p, dir, mat, amount) {
    const m = MATS[mat];
    const hard = m.hard;
    const n = amount > 0 ? Math.min(14, 5 + Math.round(amount * 60)) : 3;
    // Darker than the wall: the clods fly close to the lamp, which would wash them out.
    const col = this.c.setRGB(m.color[0] * 0.55, m.color[1] * 0.55, m.color[2] * 0.55);
    for (let k = 0; k < n; k++) {
      const i = this.cn++ % CLODS;
      const o = i * 8;
      // Back towards the player and outwards, a little upwards.
      this.cp[o] = p.x;
      this.cp[o + 1] = p.y;
      this.cp[o + 2] = p.z;
      // Mostly sideways and up out of the bite, only a little back towards the face.
      this.cp[o + 3] = -dir.x * 0.6 + (Math.random() - 0.5) * 2.4;
      this.cp[o + 4] = -dir.y * 0.3 + 0.2 + Math.random() * 1.0;
      this.cp[o + 5] = -dir.z * 0.6 + (Math.random() - 0.5) * 2.4;
      this.cp[o + 6] = 0.5 + Math.random() * 0.4;
      this.cp[o + 7] = 0.5 + Math.random() * 0.6;
      const k2 = 0.75 + Math.random() * 0.4;
      this.clods.setColorAt(i, this.c2.setRGB(col.r * k2, col.g * k2, col.b * k2));
    }
    this.clods.instanceColor.needsUpdate = true;
    if (hard > 1.4) {
      const ns = Math.round(4 + hard * 4);
      for (let k = 0; k < ns; k++) {
        const o = (this.sn++ % SPARKS) * 8;
        this.sp[o] = p.x;
        this.sp[o + 1] = p.y;
        this.sp[o + 2] = p.z;
        this.sp[o + 3] = -dir.x * 3 + (Math.random() - 0.5) * 4;
        this.sp[o + 4] = Math.random() * 3;
        this.sp[o + 5] = -dir.z * 3 + (Math.random() - 0.5) * 4;
        this.sp[o + 6] = 0.18 + Math.random() * 0.22;
        this.sp[o + 7] = 0.7 + Math.random() * 0.8;
      }
    }
    this.sound(hard, amount > 0);
  }

  /** A short synthesised hit: low thud in soil, crunch in clay, a bright clink in stone. */
  sound(hard, bit) {
    try {
      if (!this.audio) {
        this.audio = sharedAudio();
        const len = this.audio.sampleRate * 0.4;
        this.noise = this.audio.createBuffer(1, len, this.audio.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const a = this.audio;
      if (a.state === 'suspended') a.resume();
      const t = a.currentTime;
      const src = a.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = a.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 180 + hard * 420 + Math.random() * 120;
      f.Q.value = 0.9 + hard * 0.8;
      const g = a.createGain();
      const vol = (bit ? 0.55 : 0.3) * 0.6;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12 + 0.1 / hard);
      src.connect(f).connect(g).connect(a.destination);
      src.start(t);
      src.stop(t + 0.3);
      if (hard > 1.4) {
        // The pick's metal on stone.
        const o = a.createOscillator();
        o.type = 'triangle';
        o.frequency.value = 1300 + Math.random() * 500;
        const og = a.createGain();
        og.gain.setValueAtTime(0.06 * (hard - 1), t);
        og.gain.exponentialRampToValueAtTime(0.0005, t + 0.18);
        o.connect(og).connect(a.destination);
        o.start(t);
        o.stop(t + 0.2);
      }
    } catch {
      /* audio unavailable */
    }
  }

  update(dt) {
    // Every slot keeps its index (the clod colours are per slot); dead particles are scaled to zero.
    const step = (arr, total, mesh, drag, spin) => {
      let any = false;
      for (let i = 0; i < total; i++) {
        const o = i * 8;
        let sc = 0;
        if (arr[o + 6] > 0) {
          arr[o + 6] -= dt;
          arr[o + 4] -= GRAVITY * dt;
          arr[o + 3] *= drag;
          arr[o + 5] *= drag;
          arr[o] += arr[o + 3] * dt;
          arr[o + 1] += arr[o + 4] * dt;
          arr[o + 2] += arr[o + 5] * dt;
          sc = arr[o + 7] * Math.min(1, Math.max(0, arr[o + 6]) * 4);
          any = true;
        }
        this.s.set(sc, sc, sc);
        this.v.set(arr[o], arr[o + 1], arr[o + 2]);
        this.q.setFromAxisAngle(spin, arr[o + 6] * 9);
        this.m.compose(this.v, this.q, this.s);
        mesh.setMatrixAt(i, this.m);
      }
      mesh.count = any ? total : 0;
      mesh.instanceMatrix.needsUpdate = any;
    };
    step(this.cp, CLODS, this.clods, 0.985, this.spinA);
    step(this.sp, SPARKS, this.sparks, 0.96, this.spinB);
  }
}
