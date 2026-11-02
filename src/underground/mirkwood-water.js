/* ==== underground/mirkwood-water.js — the water of the roots of Mirkwood (layer 6): the ENCHANTED STREAM across the
   root hall (book ch. 8: the black, slow, enchanted river; Bombur falls in and sleeps) and the RIVER under the
   Elvenking's halls with its grotto pool (book ch. 9: the barrels float out on it).
   - The surfaces: one flat ribbon mesh per water (the stream; the river plus the pool), opaque, drawn before the
     terrain (renderOrder −1) so the bed under it is rejected by the depth test (the same budget rules as lake-water.js:
     a few sines and two lamp terms per pixel, no transparency, no reflection pass). The stream is near black with a
     dull, slowly drifting silvery sheen; the river is dark green-brown and flows faster.
   - The SLEEP (EnchantedStream): a player whose feet go into the stream falls asleep: the view fades to a dark green,
     the player is laid on the bank they came from, wakes hungry (hours have passed: the hunger of those hours, and the
     day clock moves on 4 hours — daynight.js watches p.sleptCount, NOTES-10-daynight) and the view fades back. Never deadly: the hunger never drops
     below the fainting level, and a fall into the stream is caught.
   - The river: wading (lake-water.js waterStep with the river as its body of water).
   - The ROOT SLIDE (NOTES-18-levelfix; called by decor.js every frame, not only while layer 6 is drawn): the root hall is 14 m tall under its crown, so a player who digs into it from
     above (or falls off the tunnel's gallery) grabs the nearest giant root and slides down it to the floor instead of
     falling: the fall speed is held at ROOT_SLIDE.speed, the player is drawn to the root's side, and the landing never
     counts as a fall (safety/, `safeFallT`). No geometry, no draw call.
   Wiring: decor.js builds MirkwoodWater and calls update(dt, players); player.js's water block calls
   mirkwoodWaterStep(); game.js treats `p.asleep` like an open menu (no movement, no digging). ==== */
import * as THREE from 'three';
import { floorBase, inRiverPlan, mirkCavity, mirkFloorAt, planCoords, RIVER, GROTTO, ROOTS, roofBase, RW, STREAM, STREAM_HW, STREAM_Y, streamDist } from './mirkwood-sites.js';
import { waterStep } from './lake-water.js';

const waterVert = `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec2 aFlow;
  varying vec3 vW;
  varying vec2 vF;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vF = aFlow;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const waterFrag = `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float uSpeed;
  uniform float uSheen;
  uniform vec4 uLamp[2];
  uniform vec3 uLampCol;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSheenCol;
  varying vec3 vW;
  varying vec2 vF;
  void main() {
    // Flow: slow ripples carried along the course (arc length vF.x), a little across it (vF.y −1..1).
    float a = vF.x - uTime * uSpeed;
    vec2 g = vec2(0.0);
    g += vec2(cos(a * 3.1 + vF.y * 1.7) * 0.012, sin(a * 2.3 - vF.y * 2.9) * 0.008);
    g += vec2(sin(a * 7.7 + vF.y * 4.1 + 1.3) * 0.005, cos(a * 6.1 - vF.y * 3.3) * 0.005);
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vW);
    float nv = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    vec3 col = mix(uDeep, uSky, F);
    // The enchanted stream's dull sheen: pale streaks drifting slowly downstream, brighter towards the middle.
    float st = smoothstep(0.55, 1.0, sin(a * 1.9 + sin(vF.y * 3.0 + a * 0.7) * 1.4) * 0.5 + 0.5) * (1.0 - vF.y * vF.y);
    col += uSheenCol * st * uSheen;
    for (int i = 0; i < 2; i++) {
      vec4 L = uLamp[i];
      if (L.w <= 0.0) continue;
      vec3 ld = L.xyz - vW;
      float dd = dot(ld, ld);
      float att = L.w / (1.0 + dd * 0.3);
      vec3 Ln = ld * inversesqrt(dd);
      float nh = max(dot(N, normalize(Ln + V)), 0.0);
      col += uLampCol * att * (0.01 * max(Ln.y, 0.0) + (pow(nh, 200.0) * 2.0 + pow(nh, 30.0) * 0.08) * (0.35 + F));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/** A ribbon over a 2D polyline at height y, half width hw (aFlow: arc length, side −1..1). */
export function ribbon(pts, y, hw, pos, flow, idx) {
  let arc = 0;
  const base = pos.length / 3;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (i > 0) arc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (const s of [-1, 1]) {
      pos.push(pts[i][0] - tz * hw * s, y, pts[i][1] + tx * hw * s);
      flow.push(arc, s);
    }
    if (i > 0) {
      const p = base + (i - 1) * 2;
      // Counter-clockwise seen from above (NOTES-5a-laketown: the old order faced down, so the stream and the river were
      // culled as back faces and never drawn).
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  return arc;
}

export function material(opts) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uSpeed: { value: opts.speed },
    uSheen: { value: opts.sheen },
    uLamp: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uLampCol: { value: new THREE.Color(1.0, 0.86, 0.66) },
    uDeep: { value: opts.deep },
    uSky: { value: opts.sky },
    uSheenCol: { value: opts.sheenCol },
  }]);
  return new THREE.ShaderMaterial({ uniforms, vertexShader: waterVert, fragmentShader: waterFrag, fog: true });
}

function mesh(pos, flow, idx, mat, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.matrixAutoUpdate = false;
  m.renderOrder = -1;
  m.name = name;
  return m;
}

/** The river as a body of water for lake-water.js waterStep. */
const RIVER_BODY = { level: RW, inside: (x, z) => inRiverPlan(x, z) };

/**
 * How a player moves in Mirkwood's water (player.js calls this in its water block, below 320 m): wading in the river
 * and the pool; a fall into the enchanted stream is caught (the sleep, not the landing, is what happens there).
 */
export function mirkwoodWaterStep(p, it, dt, wx, wz, menuOpen) {
  // The catch also keeps the landing in the stream harmless (safety/, NOTES-11-safety: `safeFallT`).
  if (p.pos.y < STREAM_Y + 3 && p.pos.y > STREAM_Y - 1.5 && p.vel.y < -6 && streamDist(p.pos.x, p.pos.z) < STREAM_HW + 0.4) {
    p.vel.y = Math.max(p.vel.y, -14);
    p.safeFallT = 0.5;
  }
  if (p.pos.y < RW + 6) return waterStep(p, it, dt, wx, wz, menuOpen, RIVER_BODY);
  p.water = null;
  return false;
}

/** The root slide (see the header): the slowest fall it catches, the speed it holds, the pull towards the root. */
export const ROOT_SLIDE = { from: 5.0, speed: 3.6, pull: 1.4, reach: 5.5, minAbove: 1.4 };
/** The giant roots that come down from the roof (ROOTS 0–8) as [x, y, z, r] points (about 0.7 m apart). */
const SLIDE_ROOTS = ROOTS.slice(0, 9).flat();
const PC = [0, 0];

/**
 * True while a point is in the root hall's own air (its dome over the floor, not the tunnel, the halls or the river)
 * at least `above` metres over the floor.
 */
export function inRootHallAir(x, y, z, above = ROOT_SLIDE.minAbove) {
  if (y < STREAM_Y - 1 || y > -312 || x < -10 || x > 10 || z < -10 || z > 10) return false;
  planCoords(x, z, PC);
  if (PC[1] > 0.98) return false;
  return y > floorBase(x, z) + above && y < roofBase(x, z);
}

/**
 * The root slide for one player (decor.js's per-frame update, after the players moved): a fall in the root hall's air
 * is caught on the nearest giant root and slid down at a gentle speed. Returns true while sliding.
 */
export function rootSlide(p, dt) {
  if (p.dead > 0 || p.riding || p.asleep || p.barrel || p.climbing || p.vel.y > -ROOT_SLIDE.from || !inRootHallAir(p.pos.x, p.pos.y, p.pos.z)) {
    if (p.rootSlid && p.grounded) p.rootSlid = false;
    return false;
  }
  // Held on the root: the fall speed eased to the slide's, the landing harmless.
  p.vel.y += (-ROOT_SLIDE.speed - p.vel.y) * Math.min(1, dt * 12);
  p.safeFallT = 0.6;
  // Drawn to the side of the nearest giant root at this height (within reach), sideways speed capped.
  let best = null;
  let bd = ROOT_SLIDE.reach * ROOT_SLIDE.reach;
  for (const q of SLIDE_ROOTS) {
    if (Math.abs(q[1] - p.pos.y) > 1.2) continue;
    const d = (q[0] - p.pos.x) ** 2 + (q[2] - p.pos.z) ** 2;
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  if (best) {
    const d = Math.sqrt(bd) || 1;
    const want = d - (best[3] + 0.45);
    const v = Math.max(-ROOT_SLIDE.pull, Math.min(ROOT_SLIDE.pull, want * 2));
    p.vel.x = ((best[0] - p.pos.x) / d) * v;
    p.vel.z = ((best[2] - p.pos.z) / d) * v;
  }
  if (!p.rootSlid) {
    p.rootSlid = true;
    p.say(best ? 'Elkaptál egy óriási gyökeret, és lecsúsztál rajta a terem aljára.' : 'A lelógó gyökerekbe kapaszkodva lecsúsztál a terem aljára.', 3);
  }
  return true;
}

/** Seconds of the sleep: falling asleep (fade out), asleep (dark), waking (fade in). */
const SLEEP = { fadeOut: 1.0, dark: 3.4, fadeIn: 1.3 };
/** Hunger lost while asleep (hours pass), and the floor it never goes below (the fainting level is 0). */
const SLEEP_HUNGER = 18;
const SLEEP_HUNGER_FLOOR = 20;

export class MirkwoodWater {
  /** @param {THREE.Object3D} group the layer's decor group (the surfaces are shown with it) */
  constructor(group) {
    this.time = 0;
    this.mute = false;
    // The enchanted stream: black, slow, a dull silvery sheen.
    {
      const pos = [];
      const flow = [];
      const idx = [];
      ribbon(STREAM, STREAM_Y, STREAM_HW + 0.12, pos, flow, idx);
      this.streamMat = material({ speed: 0.14, sheen: 1, deep: new THREE.Color(0.0015, 0.002, 0.0025), sky: new THREE.Color(0.008, 0.012, 0.01), sheenCol: new THREE.Color(0.012, 0.016, 0.015) });
      this.stream = mesh(pos, flow, idx, this.streamMat, 'l6-stream');
      group.add(this.stream);
    }
    // The river and the grotto pool: dark green-brown, flowing.
    {
      const pos = [];
      const flow = [];
      const idx = [];
      const arc = ribbon(RIVER, RW, 1.2, pos, flow, idx);
      const base = pos.length / 3;
      const N = 28;
      const P = GROTTO.pool;
      pos.push(P.x, RW, P.z);
      flow.push(arc + 1, 0);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        pos.push(P.x + Math.cos(a) * (P.r + 0.35), RW, P.z + Math.sin(a) * (P.r + 0.35));
        flow.push(arc + 1 + Math.sin(a) * 0.5, Math.cos(a));
        idx.push(base, base + 1 + ((i + 1) % N), base + 1 + i);
      }
      this.riverMat = material({ speed: 0.5, sheen: 0, deep: new THREE.Color(0.004, 0.006, 0.004), sky: new THREE.Color(0.012, 0.016, 0.012), sheenCol: new THREE.Color(0, 0, 0) });
      // Slightly lifted where the ribbon and the pool overlap would z-fight: the pool sits a hair lower.
      for (let i = base; i < pos.length / 3; i++) pos[i * 3 + 1] -= 0.004;
      this.river = mesh(pos, flow, idx, this.riverMat, 'l6-river');
      group.add(this.river);
    }
    // Bank points along the stream, both sides, on dry floor with room above (where a sleeper wakes).
    this.banks = [];
    for (let i = 2; i < STREAM.length - 2; i += 2) {
      const a = STREAM[i - 1];
      const b = STREAM[i + 1];
      const tx = b[0] - a[0];
      const tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      for (const s of [-1, 1]) {
        const x = STREAM[i][0] - (tz / l) * (STREAM_HW + 0.95) * s;
        const z = STREAM[i][1] + (tx / l) * (STREAM_HW + 0.95) * s;
        if (Math.abs(x) > 8.2 || Math.abs(z) > 8.2) continue;
        const fy = mirkFloorAt(x, z, STREAM_Y + 2.2, 3);
        if (fy < STREAM_Y + 0.15 || streamDist(x, z) < STREAM_HW + 0.5) continue;
        if (mirkCavity(x, fy + 0.6, z) > -0.35 || mirkCavity(x, fy + 1.4, z) > -0.35) continue;
        this.banks.push({ x, y: fy + 0.05, z });
      }
    }
  }

  /** The bank point nearest to (x, z) (the side a sleeper came from). */
  nearestBank(x, z) {
    let best = this.banks[0];
    let bd = Infinity;
    for (const b of this.banks) {
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  /** Per frame: the water's clock and lamps; the stream's sleep for every player. */
  update(dt, players) {
    this.time += dt;
    for (const mat of [this.streamMat, this.riverMat]) {
      const u = mat.uniforms;
      u.uTime.value = this.time;
      for (let i = 0; i < 2; i++) {
        const p = players[i];
        const L = u.uLamp.value[i];
        if (!p || p.dead > 0 || !p.lamp) L.set(0, 0, 0, 0);
        else L.set(p.lamp.position.x, p.lamp.position.y, p.lamp.position.z, p.lamp.intensity > 0 ? p.lamp.intensity / 6 : 0);
      }
    }
    for (const p of players) this.sleepStep(dt, p);
  }

  /** The enchanted stream's sleep for one player (see the header). */
  sleepStep(dt, p) {
    const s = p.asleep;
    if (!s) {
      if (p.dead > 0 || p.riding || p.pos.y > STREAM_Y + 1.5 || p.pos.y < STREAM_Y - 2) return;
      const near = streamDist(p.pos.x, p.pos.z);
      // The last dry spot near the stream: the sleeper is laid on that side's bank.
      if (near < 3.5 && near > STREAM_HW + 0.1 && p.grounded) (p.mirkDry ||= new THREE.Vector3()).copy(p.pos);
      p.sleepCd = Math.max(0, (p.sleepCd || 0) - dt);
      if (p.sleepCd > 0 || near > STREAM_HW + 0.05 || p.pos.y > STREAM_Y - 0.02) return;
      p.asleep = { t: 0, moved: false };
      p.say('Beleestél az elvarázsolt patakba… elnehezedik a szemed.', 4);
      return;
    }
    s.t += dt;
    p.vel.x = 0;
    p.vel.z = 0;
    const { fadeOut, dark, fadeIn } = SLEEP;
    p.fadeColor = '#06120a';
    if (s.t < fadeOut) p.fade = s.t / fadeOut;
    else if (s.t < fadeOut + dark) {
      p.fade = 1;
      if (!s.moved && s.t > fadeOut + 0.2) {
        s.moved = true;
        const from = p.mirkDry || p.pos;
        const b = this.nearestBank(from.x, from.z);
        if (b) p.pos.set(b.x, b.y, b.z);
        p.vel.set(0, 0, 0);
        // Hours pass in the enchanted sleep: hungry on waking, but never to fainting.
        if (p.hunger > SLEEP_HUNGER_FLOOR) p.hunger = Math.max(SLEEP_HUNGER_FLOOR, p.hunger - SLEEP_HUNGER);
        p.sleptCount = (p.sleptCount || 0) + 1;
      }
    } else if (s.t < fadeOut + dark + fadeIn) p.fade = 1 - (s.t - fadeOut - dark) / fadeIn;
    else {
      p.fade = 0;
      p.fadeColor = '#000';
      p.asleep = null;
      p.sleepCd = 3;
      p.say('Felébredtél a parton. Órák teltek el álmodban, és nagyon megéheztél.', 5);
    }
  }
}
