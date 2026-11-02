/* ==== underground/atmosphere.js — the air of the pit: dust motes drifting in the lamp light (one Points per player,
   moved entirely in the vertex shader), drips of water and falling crumbs from the ceilings (one pooled InstancedMesh,
   ceilings found by raycasting up), and the fire pit's embers glowing and sparking in the troll cave. No per-frame
   allocation. ==== */
import * as THREE from 'three';
import { layerAtDepth } from '../materials.js';
import { raycast, sampleDensity } from '../world.js';
import { WATER_Y } from './lake-sites.js';

const MOTES = 420;
const MOTE_BOX = 7;
const DROPS = 40;
const SPARKS = 24;

const moteVert = `
  uniform vec3 uCenter;
  uniform vec3 uLamp0;
  uniform vec3 uLamp1;
  uniform float uTime;
  uniform float uSize;
  attribute vec4 seed;
  varying float vB;
  void main() {
    // World-fixed motes in a box that follows the player (wrapped), drifting slowly.
    vec3 drift = vec3(sin(uTime * 0.13 + seed.w * 6.3), -0.35 + 0.2 * sin(uTime * 0.21 + seed.w * 3.1), cos(uTime * 0.11 + seed.w * 5.7)) * 0.12 * uTime;
    vec3 p = seed.xyz * ${MOTE_BOX.toFixed(1)} + drift;
    p = mod(p - uCenter + ${(MOTE_BOX / 2).toFixed(1)}, ${MOTE_BOX.toFixed(1)}) - ${(MOTE_BOX / 2).toFixed(1)} + uCenter;
    p += 0.05 * vec3(sin(uTime * 0.9 + seed.w * 40.0), sin(uTime * 0.7 + seed.w * 23.0), cos(uTime * 0.8 + seed.w * 31.0));
    float d0 = length(p - uLamp0);
    float d1 = length(p - uLamp1);
    vB = 1.0 / (1.0 + d0 * d0 * 1.2) + 1.0 / (1.0 + d1 * d1 * 1.2);
    // Fade at the box's edge so the wrap is never seen.
    vec3 q = abs(p - uCenter) / ${(MOTE_BOX / 2).toFixed(1)};
    vB *= 1.0 - smoothstep(0.7, 1.0, max(q.x, max(q.y, q.z)));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Never a huge blob right in front of the eye.
    vB *= smoothstep(0.25, 0.6, -mv.z);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + seed.w) / max(0.2, -mv.z);
  }`;

const moteFrag = `
  uniform float uStrength;
  varying float vB;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.1, length(c));
    gl_FragColor = vec4(vec3(1.0, 0.88, 0.7) * vB * a * uStrength, 1.0);
  }`;

const sparkVert = `
  uniform float uTime;
  attribute vec4 seed;
  varying float vA;
  varying float vHot;
  void main() {
    // Each spark rises from the embers on its own loop, swaying, and fades out; some just glow on the bed.
    float glow = step(0.6, seed.w);
    float t = fract(uTime * (0.25 + seed.w * 0.3) + seed.w * 7.0);
    vec3 p = position;
    p.y += (1.0 - glow) * t * (1.2 + seed.x);
    p.x += (1.0 - glow) * sin(t * 6.0 + seed.y * 10.0) * 0.12 * t;
    p.z += (1.0 - glow) * cos(t * 5.0 + seed.z * 10.0) * 0.12 * t;
    vA = mix(1.0 - t, 0.5 + 0.5 * sin(uTime * (3.0 + seed.x * 4.0) + seed.y * 20.0), glow);
    vHot = glow;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = mix(26.0, 120.0, glow) / max(0.3, -mv.z);
  }`;

const sparkFrag = `
  varying float vA;
  varying float vHot;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c));
    a *= a;
    vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.32, 0.06), vHot);
    gl_FragColor = vec4(col * a * vA * mix(1.0, 0.45, vHot), 1.0);
  }`;

export class Atmosphere {
  /**
   * @param {THREE.Scene} scene
   * @param {number[][]} embers world points of the fire pit's embers (glow and sparks there)
   * @param {THREE.Object3D} caveGroup the troll cave's decor group (the sparks are shown with it)
   */
  constructor(scene, embers, caveGroup) {
    this.scene = scene;
    this.time = 0;
    // ---- dust motes: one system per player slot ----
    const seeds = new Float32Array(MOTES * 4);
    let s = 12345;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < MOTES * 4; i++) seeds[i] = rnd();
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    mg.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    this.motes = [0, 1].map(() => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uCenter: { value: new THREE.Vector3() },
          uLamp0: { value: new THREE.Vector3(0, 999, 0) },
          uLamp1: { value: new THREE.Vector3(0, 999, 0) },
          uTime: { value: 0 },
          uSize: { value: 9 },
          uStrength: { value: 0 },
        },
        vertexShader: moteVert,
        fragmentShader: moteFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(mg, mat);
      pts.frustumCulled = false;
      pts.visible = false;
      pts.renderOrder = 2;
      scene.add(pts);
      return pts;
    });
    // ---- drips and crumbs: a pooled instanced mesh ----
    const dg = new THREE.IcosahedronGeometry(1, 0);
    const dm = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x999999, shininess: 90 });
    this.drops = new THREE.InstancedMesh(dg, dm, DROPS);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    this.drops.count = DROPS;
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < DROPS; i++) this.drops.setColorAt(i, black);
    this.pool = [];
    for (let i = 0; i < DROPS; i++) this.pool.push({ on: false, x: 0, y: 0, z: 0, vy: 0, t: 0, phase: 0, kind: 0, size: 0.02 });
    this.hide();
    scene.add(this.drops);
    this.spawnT = [0, 0];
    this.water = new THREE.Color(0.75, 0.82, 0.9);
    this.crumb = new THREE.Color(0.32, 0.22, 0.13);
    this.tmpO = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    // ---- embers and sparks over the fire pit ----
    const n = Math.min(embers.length, SPARKS);
    const sp = new Float32Array((n + 6) * 3);
    const ss = new Float32Array((n + 6) * 4);
    for (let i = 0; i < n + 6; i++) {
      const e = embers[i % embers.length];
      sp[i * 3] = e[0];
      sp[i * 3 + 1] = e[1] + 0.03;
      sp[i * 3 + 2] = e[2];
      ss[i * 4] = rnd();
      ss[i * 4 + 1] = rnd();
      ss[i * 4 + 2] = rnd();
      // The last six are big soft glows over the bed (seed.w ≥ 0.6), the rest rising sparks.
      ss[i * 4 + 3] = i >= n ? 0.6 + rnd() * 0.4 : rnd() * 0.55;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('seed', new THREE.BufferAttribute(ss, 4));
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: sparkVert,
      fragmentShader: sparkFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparks = new THREE.Points(sg, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 2;
    caveGroup.add(this.sparks);
  }

  /**
   * Another bed of embers with rising sparks (Goblin-town's braziers and forge), sharing the fire pit's material and
   * clock. `points` are world points; returns the Points (added to `group`).
   */
  addSparks(points, group) {
    let s = 777;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const n = points.length;
    const sp = new Float32Array(n * 3);
    const ss = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const e = points[i];
      sp[i * 3] = e[0];
      sp[i * 3 + 1] = e[1] + 0.03;
      sp[i * 3 + 2] = e[2];
      ss[i * 4] = rnd();
      ss[i * 4 + 1] = rnd();
      ss[i * 4 + 2] = rnd();
      // One in five is a soft glow over the coals, the rest rising sparks.
      ss[i * 4 + 3] = i % 5 === 0 ? 0.6 + rnd() * 0.4 : rnd() * 0.55;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(ss, 4));
    const pts = new THREE.Points(g, this.sparkMat);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    group.add(pts);
    return pts;
  }

  hide() {
    const m = this.drops.instanceMatrix.array;
    for (let i = 0; i < DROPS; i++) {
      m.fill(0, i * 16, i * 16 + 16);
      this.pool[i].on = false;
    }
    this.drops.instanceMatrix.needsUpdate = true;
  }

  /** Tries to start a drip or a crumb above a player: a ceiling within 4 m, straight up from a nearby point. */
  spawn(p, depth) {
    const free = this.pool.find((d) => !d.on);
    if (!free) return;
    const o = this.tmpO.set(p.pos.x + (Math.random() - 0.5) * 5, p.pos.y + 1.2, p.pos.z + (Math.random() - 0.5) * 5);
    if (sampleDensity(o.x, o.y, o.z) > 0) return;
    const t = raycast(o, this.up, 4.5);
    if (t < 0) return;
    const layer = layerAtDepth(depth);
    // Garden soil sheds crumbs; the cellars and the troll stone mostly drip.
    const wet = layer === 0 ? 0.2 : layer === 1 ? 0.65 : 0.85;
    free.on = true;
    free.kind = Math.random() < wet ? 0 : 1;
    free.x = o.x;
    free.y = o.y + t - 0.02;
    free.z = o.z;
    free.vy = 0;
    free.t = 0;
    // A drop swells on the ceiling first; a crumb just lets go.
    free.phase = free.kind === 0 ? 0 : 1;
    free.size = free.kind === 0 ? 0.012 + Math.random() * 0.006 : 0.012 + Math.random() * 0.02;
    this.drops.setColorAt(this.pool.indexOf(free), free.kind === 0 ? this.water : this.crumb);
    this.drops.instanceColor.needsUpdate = true;
  }

  /** Per frame: lamps and motes per player, drips and crumbs, the sparks' clock. */
  update(dt, players) {
    this.time += dt;
    const t = this.time;
    // Dust motes: player i's system follows its head; both lamps light every mote.
    const l0 = players[0]?.lamp?.position;
    const l1 = players[1]?.lamp?.position;
    this.motes.forEach((pts, i) => {
      const p = players[i];
      const u = pts.material.uniforms;
      if (!p || p.depth < 1.5) {
        pts.visible = false;
        return;
      }
      pts.visible = true;
      u.uCenter.value.set(p.pos.x, p.pos.y + 1.0, p.pos.z);
      if (l0) u.uLamp0.value.copy(l0);
      if (l1) u.uLamp1.value.copy(l1);
      else u.uLamp1.value.set(0, 999, 0);
      u.uTime.value = t;
      u.uStrength.value = Math.min(1, (p.depth - 1.5) / 4) * 0.55;
    });
    this.sparkMat.uniforms.uTime.value = t;
    // Drips and crumbs.
    players.forEach((p, i) => {
      if (p.depth < 2) return;
      this.spawnT[i] = (this.spawnT[i] || 0) - dt;
      if (this.spawnT[i] <= 0) {
        this.spawnT[i] = 0.25 + Math.random() * 0.5;
        this.spawn(p, p.depth);
      }
    });
    const m = this.drops.instanceMatrix.array;
    let any = false;
    for (let i = 0; i < DROPS; i++) {
      const d = this.pool[i];
      if (!d.on) continue;
      any = true;
      d.t += dt;
      let sx = d.size;
      let sy = d.size;
      if (d.phase === 0) {
        // Swelling on the ceiling, then letting go.
        const k = Math.min(1, d.t / 1.2);
        sy = d.size * (0.6 + 0.9 * k);
        sx = d.size * (0.6 + 0.4 * k);
        if (d.t > 1.2) {
          d.phase = 1;
          d.t = 0;
        }
      } else if (d.phase === 1) {
        d.vy -= 9.8 * dt;
        d.y += d.vy * dt;
        if (d.kind === 0) sy = d.size * 2.2;
        // Gollum's lake: a drop reaching the water rings on it (lake-water.js; decor.js sets `this.lake`).
        if (this.lake && this.lake.hits(d.x, d.y, d.z)) {
          d.phase = 2;
          d.t = 0;
          d.y = WATER_Y + 0.01;
          this.lake.dropHit(d.x, d.z, 0.7);
        } else if (sampleDensity(d.x, d.y, d.z) > 0 || d.t > 3) {
          d.phase = 2;
          d.t = 0;
          d.y += 0.02;
        }
      } else {
        // A small splash (or a puff of crumbs) flattening out.
        const k = d.t / 0.18;
        sx = d.size * (1 + k * 3);
        sy = d.size * (1 - k) * 0.4;
        if (d.t > 0.18) {
          d.on = false;
          m.fill(0, i * 16, i * 16 + 16);
          continue;
        }
      }
      const o = i * 16;
      m[o] = sx;
      m[o + 1] = 0;
      m[o + 2] = 0;
      m[o + 3] = 0;
      m[o + 4] = 0;
      m[o + 5] = sy;
      m[o + 6] = 0;
      m[o + 7] = 0;
      m[o + 8] = 0;
      m[o + 9] = 0;
      m[o + 10] = sx;
      m[o + 11] = 0;
      m[o + 12] = d.x;
      m[o + 13] = d.y - sy;
      m[o + 14] = d.z;
      m[o + 15] = 1;
    }
    if (any || this.wasAny) this.drops.instanceMatrix.needsUpdate = true;
    this.wasAny = any;
    this.drops.visible = any;
  }
}
