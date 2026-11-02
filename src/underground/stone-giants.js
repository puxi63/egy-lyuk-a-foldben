/* ==== underground/stone-giants.js — the stone giants (TERV 0.11 #23; the film An Unexpected Journey: the giants of
   stone fighting in the storm on the mountain pass, just before the company shelters in the cave that is Goblin-town's
   front porch) as an event in Goblin-town (layer 4):
   - an occasional EARTHQUAKE while a player is inside Goblin-town: a deep rumble with drum-like blows, the view shakes,
     pebbles and dust fall from the roof round the players;
   - a CRACK high in the hall's end wall that opens to the night outside: the storm, the lightning and, far off, the
     giants' silhouettes trading blows (drawn in the crack's own shader with a faked depth, no geometry is cut: layers 1–4
     generate exactly as before). The giants show most during a quake;
   - "a falak megmozdulnak, új járatok nyílnak és zárulnak": three rock SLABS at side-tunnel mouths slide open or shut
     during a quake. A slab never shuts on a player: it waits while anybody is in its sweep or in the tunnel behind it.
   Normal mode never kills: the pebbles are only seen and heard. The slabs' state is saved (save.js `giants`).
   Wiring: built by decor.js (its colliders join the prop field), updated from Decor.update, restored by game.js. ==== */
import * as THREE from 'three';
import { sharedAudio } from '../audio.js';
import { raycast, sampleDensity } from '../world.js';
import * as G from './goblin-sites.js';
import { boxUV, rock } from './kit.js';
import { noise3 } from '../noise.js';

/** Seconds inside Goblin-town before the first quake, and between quakes. */
export const QUAKE = { first: [45, 90], every: [150, 300], dur: 7.5, slabAt: 2.2, slabMove: 3.2 };
/** The slabs: the tunnel they close, metres in from its hall end, and whether it is shut in a new game. */
const SLAB_DEFS = [
  { id: 'galeria-del', at: 1.7, shut: false },
  { id: 'parkany-nyugat', at: 1.9, shut: true },
  { id: 'szakadek-kelet', at: 1.9, shut: false },
];
const PEBBLES = 36;
const DUST = 48;

const crackVert = `
  varying vec2 vL;
  varying vec3 vView;
  uniform vec3 uRight;
  uniform vec3 uUp;
  uniform vec3 uOut;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vL = position.xy;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 v = wp.xyz - cameraPosition;
    // The view ray in the crack's own frame (x right, y up, z out of the wall).
    vView = vec3(dot(v, uRight), dot(v, uUp), dot(v, uOut));
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const crackFrag = `
  uniform float uTime;
  uniform float uQuake;
  uniform float uFlash;
  varying vec2 vL;
  varying vec3 vView;
  #include <common>
  #include <fog_pars_fragment>
  // Half width of the jagged crack at height y (local, metres; the crack runs from y −1.6 to 1.6).
  float crackW(float y) {
    float taper = smoothstep(1.62, 1.1, abs(y));
    return (0.2 + 0.07 * sin(y * 4.1 + 1.0) + 0.05 * sin(y * 11.3) + 0.03 * sin(y * 27.0 + 2.0)) * taper;
  }
  // The crack's wandering centre line (it zigzags up the wall).
  float crackC(float y) {
    return 0.09 * sin(y * 2.3 + 0.4) + 0.05 * sin(y * 6.7 + 1.9) + 0.025 * sign(sin(y * 9.0)) * smoothstep(0.0, 0.5, abs(sin(y * 9.0)));
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  // A capsule's distance in the sky plane.
  float cap(vec2 p, vec2 a, vec2 b, float r) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }
  // A stone giant's silhouette (sky-plane units), facing +x when s = 1; the arm swings by a.
  float giant(vec2 p, float s, float a) {
    p.x *= s;
    float d = cap(p, vec2(0.0, 0.0), vec2(0.02, 0.55), 0.13);
    d = min(d, length(p - vec2(0.05, 0.72)) - 0.09);
    d = min(d, cap(p, vec2(0.0, 0.02), vec2(-0.08, -0.45), 0.07));
    d = min(d, cap(p, vec2(0.04, 0.02), vec2(0.12, -0.45), 0.07));
    vec2 sh = vec2(0.06, 0.5);
    d = min(d, cap(p, sh, sh + vec2(cos(a), sin(a)) * 0.42, 0.065));
    d = min(d, cap(p, vec2(-0.04, 0.5), vec2(-0.25, 0.25), 0.06));
    return d;
  }
  void main() {
    float w = crackW(vL.y);
    float lx = vL.x - crackC(vL.y);
    if (abs(lx) > w) discard;
    // The ray into the wall: through the crack's walls (a slot w wide) to the night beyond, 2.4 m in.
    vec3 d = normalize(vView);
    float din = max(-d.z, 1e-3);
    float tBack = 2.4 / din;
    float tSide = d.x > 0.0 ? (w - lx) / max(d.x, 1e-4) : (-w - lx) / min(d.x, -1e-4);
    vec3 col;
    if (tSide < tBack) {
      // The crack's inner walls: dark rock, darker deeper in, lit a moment by the lightning.
      float depth = tSide * din;
      float n = hash(floor(vec2(depth * 9.0, (vL.y + d.y * tSide) * 9.0)));
      col = vec3(0.02, 0.022, 0.026) * (0.7 + 0.6 * n) * (1.0 - 0.5 * smoothstep(0.0, 2.4, depth)) * (1.0 + uFlash * 6.0 * (1.0 - depth / 2.4));
    } else {
      // Outside: the storm's sky as seen along d (angles), far mountains, the giants, rain.
      vec2 s = vec2(atan(d.x, din), atan(d.y, din) + (vL.y + d.y * tBack) * 0.05);
      float cloud = 0.5 + 0.5 * sin(s.x * 9.0 + uTime * 0.2) * sin(s.y * 7.0 - uTime * 0.13) + 0.2 * hash(floor(s * 40.0));
      vec3 sky = mix(vec3(0.012, 0.016, 0.03), vec3(0.04, 0.05, 0.075), cloud * 0.6);
      sky += vec3(0.5, 0.55, 0.7) * uFlash * (0.6 + 0.4 * cloud);
      // The far ridge, and on it the two giants (one hurling a blow at the other while the mountain shakes).
      float ridge = -0.18 + 0.05 * sin(s.x * 13.0) + 0.03 * sin(s.x * 31.0 + 1.0);
      vec2 q = (s - vec2(0.0, ridge)) * 3.2;
      float sw = sin(uTime * (1.2 + 2.0 * uQuake)) * (0.4 + 0.9 * uQuake);
      float g1 = giant(q - vec2(-0.32, 0.0), 1.0, 0.3 + sw);
      float g2 = giant(q - vec2(0.3 + 0.04 * sin(uTime * 2.0) * uQuake, 0.0), -1.0, 1.0 - sw * 0.8);
      float body = min(g1, g2);
      float land = smoothstep(0.004, -0.004, s.y - ridge);
      float shape = max(land, smoothstep(0.02, -0.02, body));
      col = mix(sky, vec3(0.006, 0.007, 0.009), shape);
      // Rain streaks.
      float rain = step(0.985, hash(vec2(floor(s.x * 160.0), floor(s.y * 18.0 + uTime * 30.0))));
      col += vec3(0.05, 0.06, 0.08) * rain * (0.3 + uFlash * 2.0);
    }
    // The crack's rim catches the flash.
    col += vec3(0.25, 0.28, 0.35) * uFlash * smoothstep(w - 0.03, w, abs(lx));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

const dustVert = `
  attribute vec4 dseed;
  uniform float uSize;
  varying float vA;
  void main() {
    vA = dseed.w;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * dseed.x / max(0.3, -mv.z);
  }`;
const dustFrag = `
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c)) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(0.16, 0.15, 0.14), a * 0.55);
  }`;

/** Synthesised sounds: the rumble with the giants' blows, the grinding slab, falling pebbles. */
class QuakeSound {
  init() {
    this.ctx = sharedAudio();
    if (!this.ctx) return false;
    const c = this.ctx;
    this.out = c.createGain();
    this.out.gain.value = 0.9;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    this.out.connect(lp).connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = b * 0.97 + (Math.random() * 2 - 1) * 0.03;
      d[i] = b * 6;
    }
    return true;
  }

  ready() {
    if (!this.ctx && !this.init()) return false;
    return this.ctx.state !== 'suspended';
  }

  /** The rumble over `dur` seconds (a swelling, shaking roar of the rock). */
  rumble(dur, level) {
    if (!this.ready()) return;
    const c = this.ctx;
    const t = c.currentTime + 0.02;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * level, t + 1.2);
    g.gain.setValueAtTime(0.9 * level, t + dur - 2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(g).connect(this.out);
    n.start(t);
    n.stop(t + dur + 0.1);
  }

  /** A giant's blow far off: a deep drum-like thud. */
  blow(level) {
    if (!this.ready()) return;
    const c = this.ctx;
    const t = c.currentTime + 0.02;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(62, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.0 * level, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 1.2);
  }

  /** The grinding of a slab sliding over rock. */
  grind(dur, level) {
    if (!this.ready()) return;
    const c = this.ctx;
    const t = c.currentTime + 0.02;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    n.playbackRate.value = 3.5;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 180;
    bp.Q.value = 1.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7 * level, t + 0.3);
    g.gain.setValueAtTime(0.7 * level, t + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g).connect(this.ctx.destination);
    n.start(t);
    n.stop(t + dur + 0.1);
  }
}

/** Where a tunnel's floor is at `at` metres in from its hall end, its direction into the rock, and its radius. */
function tunnelAt(id, at) {
  const t = G.TUNNELS.find((q) => q.id === id);
  const a = t.pts[0];
  const b = t.pts[1];
  const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const dx = (b[0] - a[0]) / l;
  const dz = (b[2] - a[2]) / l;
  const f = at / l;
  return { x: a[0] + dx * at, y: a[1] + (b[1] - a[1]) * f, z: a[2] + dz * at, dx, dz, r: t.r, tunnel: t };
}

/** The crack's place: on the hall's +s end wall at gallery height (found by marching along the rift to the rock). */
function findCrackSpot() {
  const y = G.GALLERY_Y + 3.4;
  let s = 6;
  for (; s < 20; s += 0.05) {
    const [x, z] = G.fromRift(s, 0);
    if (G.goblinCavity(x, y, z) > 0) break;
  }
  const [x, z] = G.fromRift(s - 0.06, 0);
  // The wall's normal from the cavity field's gradient (pointing into the air).
  const e = 0.3;
  const nx = G.goblinCavity(x - e, y, z) - G.goblinCavity(x + e, y, z);
  const nz = G.goblinCavity(x, y, z - e) - G.goblinCavity(x, y, z + e);
  const l = Math.hypot(nx, nz) || 1;
  return { x, y, z, nx: nx / l, nz: nz / l };
}

export class StoneGiants {
  /**
   * @param {THREE.Object3D} group Goblin-town's hall group (the crack, the slabs, the pebbles and the dust are shown with it)
   * @param {object} mats decor.js materials (the slabs are carved Misty Mountains rock: 'stone4')
   * @param {object[]} colliders the prop colliders (the slabs' boxes are added; decor.js sorts them afterwards)
   */
  constructor(group, mats, colliders) {
    this.group = group;
    this.t = 0;
    this.inside = 0;
    this.next = QUAKE.first[0] + Math.random() * (QUAKE.first[1] - QUAKE.first[0]);
    this.quake = null;
    this.count = 0;
    this.sound = new QuakeSound();
    this.mute = false;
    this.shake = 0;
    // ---- the crack ----
    const c = (this.crack = findCrackSpot());
    // The mesh's local x after lookAt (up × out), so the shader's ray frame matches the quad's own coordinates.
    const right = new THREE.Vector3(c.nz, 0, -c.nx);
    const out = new THREE.Vector3(c.nx, 0, c.nz);
    this.crackUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uQuake: { value: 0 }, uFlash: { value: 0 },
      uRight: { value: right }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uOut: { value: out },
    }]);
    const cg = new THREE.PlaneGeometry(1.0, 3.3, 1, 1);
    const cm = new THREE.Mesh(cg, new THREE.ShaderMaterial({ uniforms: this.crackUniforms, vertexShader: crackVert, fragmentShader: crackFrag, fog: true }));
    cm.position.set(c.x + c.nx * 0.02, c.y, c.z + c.nz * 0.02);
    cm.lookAt(cm.position.x + c.nx, cm.position.y, cm.position.z + c.nz);
    cm.updateMatrixWorld();
    cm.matrixAutoUpdate = false;
    cm.name = 'l4-giants-crack';
    cm.renderOrder = 1;
    group.add(cm);
    this.crackMesh = cm;
    this.flash = 0;
    this.flashT = 2;
    // ---- the slabs ----
    this.slabs = SLAB_DEFS.map((def, i) => {
      const tp = tunnelAt(def.id, def.at);
      const yaw = Math.atan2(tp.dx, tp.dz);
      // Slide sideways into whichever side is solid rock (the side whose open place is deepest in the rock).
      const sx = Math.cos(yaw);
      const sz = -Math.sin(yaw);
      const cy = tp.y + 1.25;
      const solidity = (k) => Math.min(...[-1.3, 0, 1.3].map((o) => G.goblinBase(tp.x + sx * k * (3.0 + o), cy, tp.z + sz * k * (3.0 + o))));
      const side = solidity(1) >= solidity(-1) ? 1 : -1;
      // A rough slab of rock: a subdivided box, its faces and edges broken by noise (the same noise at shared corners,
      // so no cracks open between faces).
      const g = boxUV(new THREE.BoxGeometry(2.95, 2.75, 0.48, 10, 10, 2));
      const pa = g.attributes.position;
      for (let v = 0; v < pa.count; v++) {
        const x = pa.getX(v);
        const y = pa.getY(v);
        const z = pa.getZ(v);
        const n = noise3(x * 1.3 + i * 7, y * 1.3, z * 1.3) - 0.5;
        const edge = Math.max(Math.abs(x) / 1.475, Math.abs(y) / 1.375);
        const pull = 1 - 0.1 * Math.max(0, edge - 0.85) / 0.15;
        pa.setXYZ(v, x * pull + n * 0.12, y * pull + n * 0.1, z * (1 + n * 0.7) + n * 0.05);
      }
      g.computeVertexNormals();
      // The tint of the Misty Mountains rock round it (materials.js TINT.goblin), so the slab reads as part of the wall.
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < col.length; k += 3) col.set([0.15, 0.158, 0.18], k);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(g, mats.stone4);
      mesh.rotation.y = yaw;
      mesh.name = `l4-giants-slab-${def.id}`;
      mesh.renderOrder = 1;
      group.add(mesh);
      const box = { t: 'box', x: tp.x, y: cy, z: tp.z, hx: 1.45, hy: 1.32, hz: 0.24, c: Math.cos(yaw), s: Math.sin(yaw), br: Math.hypot(1.45, 1.32, 0.24), on: true };
      colliders.push(box);
      const slab = {
        id: def.id, shut: def.shut, k: def.shut ? 0 : 1, to: def.shut ? 0 : 1, mesh, box, tp, side, yaw,
        closed: { x: tp.x, z: tp.z }, open: { x: tp.x + sx * side * 3.0, z: tp.z + sz * side * 3.0 }, cy,
      };
      this.place(slab);
      return slab;
    });
    // ---- falling pebbles (pooled) and dust puffs ----
    const pg = rock(1, 3, 0, 0.7);
    this.pebbles = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0x4a4c52 }), PEBBLES);
    this.pebbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pebbles.frustumCulled = false;
    this.pebbles.visible = false;
    this.pebbles.name = 'l4-giants-pebbles';
    group.add(this.pebbles);
    this.pool = Array.from({ length: PEBBLES }, () => ({ on: false, x: 0, y: 0, z: 0, vy: 0, r: 0.03, rot: 0, bounce: 0 }));
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
    dg.setAttribute('dseed', new THREE.BufferAttribute(new Float32Array(DUST * 4), 4));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({ uniforms: { uSize: { value: 260 } }, vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.dust.visible = false;
    this.dust.renderOrder = 2;
    this.dust.name = 'l4-giants-dust';
    group.add(this.dust);
    this.puffs = Array.from({ length: DUST }, () => ({ on: false, x: 0, y: 0, z: 0, t: 0, life: 1, size: 1, vx: 0, vz: 0 }));
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.sv = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  /** Puts a slab's mesh and collider at its current slide fraction k (0 shut … 1 open). */
  place(s) {
    const e = s.k * s.k * (3 - 2 * s.k);
    const x = s.closed.x + (s.open.x - s.closed.x) * e;
    const z = s.closed.z + (s.open.z - s.closed.z) * e;
    s.mesh.position.set(x, s.cy, z);
    s.mesh.updateMatrixWorld();
    s.box.x = x;
    s.box.z = z;
    // Fully open it is buried in the rock: not drawn.
    s.mesh.visible = s.k < 0.999;
  }

  /**
   * True when shutting this slab could trap a player: somebody in its sweep (between its open and closed places) or
   * in the tunnel beyond it (on the far side, within the tunnel's tube plus a margin).
   */
  wouldTrap(s, players) {
    const t = s.tp.tunnel;
    for (const p of players) {
      if (p.dead > 0) continue;
      const px = p.pos.x;
      const pz = p.pos.z;
      const py = p.pos.y;
      if (Math.abs(py + 0.6 - s.cy) > 4) continue;
      // In the sweep.
      const ax = s.closed.x;
      const az = s.closed.z;
      const bx = s.open.x;
      const bz = s.open.z;
      const vx = bx - ax;
      const vz = bz - az;
      const h = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
      if (Math.hypot(px - ax - vx * h, pz - az - vz * h) < 1.5) return true;
      // Beyond it, in the tunnel.
      const ahead = (px - ax) * s.tp.dx + (pz - az) * s.tp.dz;
      if (ahead > -0.8) {
        for (let i = 0; i + 1 < t.pts.length; i++) {
          const a = t.pts[i];
          const b = t.pts[i + 1];
          const wx = b[0] - a[0];
          const wz = b[2] - a[2];
          const f = Math.max(0, Math.min(1, ((px - a[0]) * wx + (pz - a[2]) * wz) / (wx * wx + wz * wz)));
          if (Math.hypot(px - a[0] - wx * f, pz - a[2] - wz * f) < t.r + 2.5) return true;
        }
      }
    }
    return false;
  }

  /** Starts a slab sliding (shut ↔ open) if it can; returns true when it moves. */
  toggle(s, players) {
    if (s.k !== s.to) return false;
    if (!s.shut && this.wouldTrap(s, players)) return false;
    s.shut = !s.shut;
    s.to = s.shut ? 0 : 1;
    if (!this.mute) this.sound.grind(QUAKE.slabMove, this.level(s.mesh.position, players));
    return true;
  }
  /** 0..1 loudness of a point for the nearest player. */
  level(pos, players) {
    let d = Infinity;
    for (const p of players) d = Math.min(d, p.pos.distanceTo(pos));
    return Math.max(0, 1 - d / 40);
  }

  /** Starts a quake now (QA can call it). */
  startQuake(players) {
    this.quake = { t: 0, slabDone: false, blowT: 0.6 };
    this.count++;
    if (!this.mute) this.sound.rumble(QUAKE.dur, 0.8);
    for (const p of players) {
      if (!G.inGoblinTown(p.pos.x, p.pos.y + 1, p.pos.z, 3)) continue;
      if (!p.warnedGiants) {
        p.warnedGiants = true;
        p.say('Megremeg a hegy! Odakint a kőóriások harcolnak a viharban…', 6);
      } else p.say('Megint rengés: a kőóriások csatája…', 3);
    }
  }

  /** A pebble from the roof above a point near (x, y, z). */
  drop(x, y, z) {
    const free = this.pool.find((q) => !q.on);
    if (!free) return;
    const o = this.v.set(x + (Math.random() - 0.5) * 6, y + 1.5, z + (Math.random() - 0.5) * 6);
    if (sampleDensity(o.x, o.y, o.z) > 0) return;
    const t = raycast(o, this.up, 18);
    if (t < 0) return;
    Object.assign(free, { on: true, x: o.x, y: o.y + t - 0.05, z: o.z, vy: 0, r: 0.025 + Math.random() * 0.06, rot: Math.random() * 6, bounce: 0 });
    this.puff(free.x, free.y - 0.1, free.z, 0.6, 1.2);
  }

  puff(x, y, z, size, life) {
    const p = this.puffs.find((q) => !q.on);
    if (!p) return;
    Object.assign(p, { on: true, x, y, z, t: 0, life, size, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3 });
  }

  /**
   * Per frame, after the players moved: the quake clock (only while a player is inside Goblin-town), the shake of the
   * players' views inside, the pebbles and dust, the slabs, the crack's storm.
   */
  update(dt, players) {
    this.t += dt;
    const inTown = players.filter((p) => p.dead <= 0 && p.pos.y < -140 && p.pos.y > -232 && G.inGoblinTown(p.pos.x, p.pos.y + 1, p.pos.z, 3));
    const u = this.crackUniforms;
    u.uTime.value = this.t;
    // Lightning in the crack: now and then, often during a quake.
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flash = 0.7 + Math.random() * 0.3;
      this.flashT = this.quake ? 0.4 + Math.random() * 1.4 : 4 + Math.random() * 9;
    }
    this.flash *= Math.exp(-dt * 7);
    u.uFlash.value = this.flash > 0.01 ? this.flash * (0.6 + 0.4 * Math.sin(this.t * 60)) : 0;
    if (inTown.length && !this.quake) {
      this.inside += dt;
      if (this.inside >= this.next) {
        this.inside = 0;
        this.next = QUAKE.every[0] + Math.random() * (QUAKE.every[1] - QUAKE.every[0]);
        this.startQuake(players);
      }
    }
    let amp = 0;
    if (this.quake) {
      const q = this.quake;
      q.t += dt;
      const k = q.t / QUAKE.dur;
      amp = Math.sin(Math.min(1, k) * Math.PI) ** 0.6;
      u.uQuake.value = amp;
      // The giants' blows, heard through the mountain.
      q.blowT -= dt;
      if (q.blowT <= 0) {
        q.blowT = 0.7 + Math.random() * 1.3;
        if (!this.mute) this.sound.blow(0.5 + 0.5 * amp);
        this.shake = Math.max(this.shake, 0.8);
      }
      // Pebbles and dust round the players inside.
      for (const p of inTown) if (Math.random() < dt * 9 * amp) this.drop(p.pos.x, p.pos.y + 1, p.pos.z);
      // The walls move: one slab slides (a shut one opens, or an open one shuts if that traps nobody).
      if (!q.slabDone && q.t > QUAKE.slabAt) {
        q.slabDone = true;
        const order = [...this.slabs].sort(() => Math.random() - 0.5);
        for (const s of order) if (this.toggle(s, players)) break;
      }
      if (q.t >= QUAKE.dur) {
        this.quake = null;
        u.uQuake.value = 0;
      }
    }
    // The slabs slide towards their goal; a shutting slab that somebody steps into grinds back open (never on a player).
    for (const s of this.slabs) {
      if (s.k === s.to) continue;
      if (s.to === 0 && s.k < 0.65 && this.wouldTrap(s, players)) {
        s.shut = false;
        s.to = 1;
      }
      const step = dt / QUAKE.slabMove;
      s.k = s.to > s.k ? Math.min(s.to, s.k + step) : Math.max(s.to, s.k - step);
      this.place(s);
    }
    // Shake the views of the players inside (after their own camera update this frame).
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = Math.min(1, amp * 0.6 + this.shake * amp);
    if (sh > 0.001) {
      for (const p of inTown) {
        const cam = p.camera;
        const a = sh * 0.012;
        this.e.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.6);
        cam.quaternion.multiply(this.q.setFromEuler(this.e));
        cam.position.x += (Math.random() - 0.5) * sh * 0.03;
        cam.position.y += (Math.random() - 0.5) * sh * 0.03;
        cam.position.z += (Math.random() - 0.5) * sh * 0.03;
      }
    }
    this.updateParticles(dt);
  }

  updateParticles(dt) {
    const m = this.pebbles.instanceMatrix.array;
    let n = 0;
    for (const q of this.pool) {
      if (!q.on) continue;
      q.vy -= 9.8 * dt;
      q.y += q.vy * dt;
      q.rot += dt * 8;
      if (sampleDensity(q.x, q.y - q.r, q.z) > 0) {
        if (q.bounce < 1 && q.vy < -2) {
          q.vy = -q.vy * 0.25;
          q.bounce++;
          this.puff(q.x, q.y, q.z, 0.35, 0.9);
        } else q.on = false;
      }
      if (q.y < -260) q.on = false;
      if (!q.on) continue;
      this.e.set(q.rot, q.rot * 0.7, 0);
      this.m4.compose(this.sv.set(q.x, q.y, q.z), this.q.setFromEuler(this.e), this.v.setScalar(q.r));
      this.m4.toArray(m, n * 16);
      n++;
    }
    this.pebbles.count = n;
    this.pebbles.visible = n > 0;
    if (n) this.pebbles.instanceMatrix.needsUpdate = true;
    const pos = this.dust.geometry.attributes.position;
    const sd = this.dust.geometry.attributes.dseed;
    let k = 0;
    for (const p of this.puffs) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t > p.life) {
        p.on = false;
        continue;
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y -= dt * 0.15;
      const f = p.t / p.life;
      pos.setXYZ(k, p.x, p.y, p.z);
      sd.setXYZW(k, p.size * (0.5 + f), 0, 0, (1 - f) * Math.min(1, f * 6));
      k++;
    }
    this.dust.geometry.setDrawRange(0, k);
    this.dust.visible = k > 0;
    if (k) {
      pos.needsUpdate = true;
      sd.needsUpdate = true;
    }
  }

  state() {
    return { slabs: Object.fromEntries(this.slabs.map((s) => [s.id, s.shut ? 1 : 0])) };
  }

  restore(st) {
    if (!st?.slabs) return;
    for (const s of this.slabs) {
      if (!(s.id in st.slabs)) continue;
      s.shut = !!st.slabs[s.id];
      s.k = s.shut ? 0 : 1;
      s.to = s.k;
      this.place(s);
    }
  }
}
