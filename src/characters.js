/* ==== characters.js — the six playable characters' life-size bodies: baked SDF sculpts (tools/figbake, film look)
   decoded from assets/characters/<id>.json into one skinned mesh each, the shared painted material, the joint rig and
   its animation (walk, dig, climb, fall, look), the bag on the hip and the first-person forearm. ==== */
import * as THREE from 'three';

/** Where the baked characters live (relative to this module, so the page URL does not matter). */
const BASE_URL = new URL('../assets/characters/', import.meta.url);
/** Bone indices of the baked rig (tools/figbake/lib/rig.mjs). */
export const BONE = { hips: 0, spine: 1, head: 2, upperArmL: 3, foreArmL: 4, upperArmR: 5, foreArmR: 6, thighL: 7, shinL: 8, thighR: 9, shinR: 10, handL: 11, handR: 12 };

/** Load and decode statistics per character id: { ms (decode), fetchMs, tris, verts }. */
export const characterStats = {};

/* ---- the shared material ------------------------------------------------------------------------------------------ */

let sharedMaterial = null;

/**
 * The one painted material of every character (skinned bodies and the first-person forearm): per-vertex sRGB paint
 * with the baked front AO in aCol, roughness / metalness / back-face AO in aPbr; double-sided for the open coats.
 * Cloth gets a matte term (less specular), like the HP game's figurines.
 */
export function characterMaterial() {
  if (sharedMaterial) return sharedMaterial;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aCol;\nattribute vec4 aPbr;\nvarying vec4 vChCol;\nvarying vec4 vChPbr;\nvarying vec3 vChPos;\nvarying vec3 vChNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvChCol = aCol;\nvChPbr = aPbr;\nvChPos = position;\nvChNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vChCol;\nvarying vec4 vChPbr;\nvarying vec3 vChPos;\nvarying vec3 vChNrm;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'vec3 chSrgb = clamp(vChCol.rgb, 0.0, 1.0);',
        'diffuseColor.rgb *= mix(chSrgb / 12.92, pow((chSrgb + 0.055) / 1.055, vec3(2.4)), step(0.04045, chSrgb));',
        // Armour mail (aPbr.w = 0: the `mail` paint key of tools/figbake/lib/armour.mjs): interlocking rings of about
        // 1.1 cm projected on the bind-pose surface along its main axis, faded to their average where a ring is
        // smaller than a pixel (no shimmer at a distance, the same look). The mithril shirt (aPbr.w = 0.5, the
        // `mithril` key) uses the same rings, finer (about 0.75 cm, close-knit) and brighter.
        'float chMail = 1.0;',
        'float chMith = 0.0;',
        'if (vChPbr.w < 0.75) {',
        '  chMith = step(0.25, vChPbr.w);',
        '  vec3 an = abs(vChNrm);',
        '  vec2 mp = (an.x > an.z ? vChPos.zy : vChPos.xy) * mix(90.0, 135.0, chMith);',
        '  float row = floor(mp.y);',
        '  mp.x += 0.5 * mod(row, 2.0);',
        '  vec2 f = fract(mp) - 0.5;',
        '  float d = length(f * vec2(1.0, 1.3));',
        '  float ring = smoothstep(0.46, 0.38, d) * smoothstep(0.14, 0.24, d);',
        '  float fw = clamp(length(fwidth(mp)) * 1.5, 0.0, 1.0);',
        '  chMail = mix(mix(mix(0.3, 0.6, chMith), mix(1.25, 1.2, chMith), ring), mix(0.8, 0.98, chMith), fw);',
        '  diffuseColor.rgb *= chMail;',
        '}',
      ].join('\n'))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(vChPbr.x, 0.06) * (vChPbr.w < 0.75 ? 2.0 - chMail : 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vChPbr.y;')
      .replace('#include <aomap_fragment>', [
        '#include <aomap_fragment>',
        '{',
        '  float chAo = clamp(gl_FrontFacing ? vChCol.a : vChPbr.z, 0.0, 1.0);',
        '  reflectedLight.indirectDiffuse *= chAo;',
        '  float chDirect = mix(1.0, chAo, 0.45);',
        '  reflectedLight.directDiffuse *= chDirect;',
        '  reflectedLight.directSpecular *= chDirect;',
        '  float chMatt = smoothstep(0.62, 0.9, vChPbr.x);',
        '  reflectedLight.indirectSpecular *= mix(chAo, 0.15 * chAo, chMatt);',
        '  reflectedLight.directSpecular *= mix(1.0, 0.35, chMatt);',
        // The mithril's soft silver sheen: a rim-weighted glint from the ambient light (scales with the scene's light,
        // so it never glows in the dark).
        '  float chRim = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);',
        '  reflectedLight.indirectSpecular += chMith * (0.35 + 1.2 * chRim * chRim) * chMail * reflectedLight.indirectDiffuse;',
        '}',
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'lyuk-character-v3';
  sharedMaterial = m;
  return m;
}

/* ---- decoding ------------------------------------------------------------------------------------------------------ */

function b64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function octDecode(a, b, out, o) {
  let x = a / 32767;
  let y = b / 32767;
  const z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0) {
    const ox = x;
    x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1);
    y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1);
  }
  const l = Math.hypot(x, y, z) || 1;
  out[o] = x / l;
  out[o + 1] = y / l;
  out[o + 2] = z / l;
}

/**
 * Bake space (figure cm, +z front, +x the figure's left) → game body space (metres, facing −z like a player at yaw 0):
 * scale, then a half turn about y.
 */
function toGame(p, s) {
  return new THREE.Vector3(-p[0] * s, p[1] * s, -p[2] * s);
}

/**
 * Decodes one baked character into { geometry, bones (pivots in body space), grip (Matrix4, body space), eye, height,
 * skin arrays for the forearm extraction, tris, verts }.
 */
function decodeCharacter(json) {
  const s = json.rig.scale;
  const nV = json.counts.vertices;
  const { min, max } = json.bounds;
  const A = json.attributes;
  const q = new Uint16Array(b64(A.position.data).buffer);
  const oct = new Int16Array(b64(A.normal.data).buffer);
  const col = b64(A.color.data);
  const mat = b64(A.material.data);
  const back = A.aoBack ? b64(A.aoBack.data) : new Uint8Array(nV);
  const sIdx = b64(A.skinIndex.data);
  const sWt = b64(A.skinWeight.data);
  const idxBytes = b64(json.index.data);
  const index = json.index.type === 'u16' ? new Uint16Array(idxBytes.buffer) : new Uint32Array(idxBytes.buffer);
  const pos = new Float32Array(nV * 3);
  const nrm = new Float32Array(nV * 3);
  const pbr = new Uint8Array(nV * 4);
  for (let v = 0; v < nV; v++) {
    const x = min[0] + (q[v * 3] / 65535) * (max[0] - min[0]);
    const y = min[1] + (q[v * 3 + 1] / 65535) * (max[1] - min[1]);
    const z = min[2] + (q[v * 3 + 2] / 65535) * (max[2] - min[2]);
    pos[v * 3] = -x * s;
    pos[v * 3 + 1] = y * s;
    pos[v * 3 + 2] = -z * s;
    octDecode(oct[v * 2], oct[v * 2 + 1], nrm, v * 3);
    nrm[v * 3] = -nrm[v * 3];
    nrm[v * 3 + 2] = -nrm[v * 3 + 2];
    const m = json.materials[mat[v]] || json.materials[0];
    pbr[v * 4] = Math.round(m.rough * 255);
    pbr[v * 4 + 1] = Math.round((m.metal || 0) * 255);
    pbr[v * 4 + 2] = back[v];
    // w: 0 marks the armour mail, 128 the mithril shirt (the shader draws their rings), 255 everything else.
    pbr[v * 4 + 3] = m.key === 'mail' ? 0 : m.key === 'mithril' ? 128 : 255;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4, true));
  g.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 4, true));
  g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(sIdx, 4));
  g.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(sWt, 4, true));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (max[1] * s) / 2, 0), max[1] * s * 0.75);
  const bones = json.rig.bones.map((b) => ({ name: b.name, parent: b.parent, pivot: toGame(b.pivot, s) }));
  // The grip frame: origin at the grip centre, −z along the handle (the tool model points along −z), +y as close to up
  // as the handle allows.
  // A body without a tool grip (Gollum's open hands): the frame sits at the right wrist, pointing forward.
  const gr = json.rig.grip || { c: json.rig.bones[BONE.handR].pivot, axis: [0, 0, 1] };
  const c = toGame(gr.c, s);
  const ax = new THREE.Vector3(-gr.axis[0], gr.axis[1], -gr.axis[2]).normalize();
  const zAxis = ax.clone().negate();
  const yAxis = new THREE.Vector3(0, 1, 0).addScaledVector(ax, -ax.y).normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
  const grip = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis).setPosition(c);
  return {
    geometry: g, bones, grip, eye: json.rig.eye * s, height: json.rig.height * s, tris: index.length / 3, verts: nV,
    raw: { pos, nrm, col, pbr, sIdx, sWt, index },
  };
}

const cache = new Map();

/** Fetches and decodes a character once (Promise of the decoded data). */
export function loadCharacter(id) {
  if (!cache.has(id)) {
    const p = (async () => {
      const t0 = performance.now();
      const res = await fetch(new URL(`${id}.json`, BASE_URL));
      if (!res.ok) throw new Error(`character ${id}: HTTP ${res.status}`);
      const json = await res.json();
      const t1 = performance.now();
      const data = decodeCharacter(json);
      data.id = id;
      const ms = performance.now() - t1;
      characterStats[id] = { ms: +ms.toFixed(1), fetchMs: +(t1 - t0).toFixed(1), tris: data.tris, verts: data.verts };
      return data;
    })();
    p.catch((e) => console.warn('[characters]', e.message));
    cache.set(id, p);
  }
  return cache.get(id);
}

/** Loads `asset`, or `fallback` when the asset cannot be loaded (an armour variant that was not baked). */
export function loadAsset(asset, fallback) {
  if (!asset || asset === fallback) return loadCharacter(fallback);
  return loadCharacter(asset).catch(() => loadCharacter(fallback));
}

/** Starts loading the given characters (all six by default). */
export function preloadCharacters(ids = ['bilbo', 'thorin', 'balin', 'bofur', 'bombur', 'kili']) {
  return Promise.allSettled(ids.map(loadCharacter));
}

/* ---- the bag -------------------------------------------------------------------------------------------------------- */

let bagMaterials = null;

/** A canvas sack hanging from a strap on the left hip (its scale shows how full the bag is). */
function buildBag() {
  if (!bagMaterials) {
    bagMaterials = {
      sack: new THREE.MeshLambertMaterial({ color: 0x8a6a42 }),
      cord: new THREE.MeshLambertMaterial({ color: 0x4a3420 }),
    };
  }
  const g = new THREE.Group();
  const prof = [[0, -0.1], [0.055, -0.097], [0.088, -0.074], [0.1, -0.027], [0.094, 0.02], [0.067, 0.054], [0.034, 0.067], [0.037, 0.087], [0.047, 0.107], [0, 0.107]];
  const sack = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 12), bagMaterials.sack);
  sack.scale.z = 0.75;
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 5, 12), bagMaterials.cord);
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 0.07;
  g.add(sack, tie);
  return g;
}

/* ---- the animated body ---------------------------------------------------------------------------------------------- */

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/**
 * One player's body as seen by the others: a Group (feet at its origin, facing −z) that fills with the skinned mesh
 * when the character is decoded. `pick` (a Group in the right hand's grip frame: the tool model goes in, pointing
 * along −z) and `bag` exist from the start.
 */
export class CharacterBody {
  /**
   * @param {object} ch entry of CHARACTERS (or any { id })
   * @param {string} [asset] the baked file to load (an armour variant such as "thorin-a2", enemies/armour.js); falls
   *   back to ch.id when that file is missing
   */
  constructor(ch, asset = ch.id) {
    this.ch = ch;
    this.asset = asset;
    this.group = new THREE.Group();
    this.group.name = `body-${ch.id}`;
    this.pick = new THREE.Group();
    this.bag = buildBag();
    this.mesh = null;
    this.bones = null;
    this.walkPhase = 0;
    this.walkAmt = 0;
    this.climbPhase = 0;
    this.climbAmt = 0;
    this.airAmt = 0;
    this.t = Math.random() * 10;
    /** Smoothed joint angles (radians) keyed by name. */
    this.ang = {};
    this.ready = loadAsset(asset, ch.id).then((d) => this.attach(d)).catch(() => this.placeholder());
  }

  /** Builds the skinned mesh and its skeleton from the decoded data. */
  attach(d) {
    this.data = d;
    const bones = d.bones.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      return bone;
    });
    d.bones.forEach((b, i) => {
      if (b.parent >= 0) {
        bones[i].position.copy(b.pivot).sub(d.bones[b.parent].pivot);
        bones[b.parent].add(bones[i]);
      } else bones[i].position.copy(b.pivot);
    });
    const mesh = new THREE.SkinnedMesh(d.geometry, characterMaterial());
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.boundingSphere = d.geometry.boundingSphere.clone();
    mesh.boundingSphere.radius *= 1.25;
    mesh.name = `character-${this.ch.id}`;
    this.mesh = mesh;
    this.bones = bones;
    this.rest = bones.map((b) => b.position.clone());
    // The tool sits in the right hand's grip frame (relative to the hand bone's pivot).
    const hand = bones[BONE.handR];
    const local = d.grip.clone();
    local.elements[12] -= d.bones[BONE.handR].pivot.x;
    local.elements[13] -= d.bones[BONE.handR].pivot.y;
    local.elements[14] -= d.bones[BONE.handR].pivot.z;
    local.decompose(this.pick.position, this.pick.quaternion, this.pick.scale);
    hand.add(this.pick);
    // The bag hangs on the left hip (−x here: the body faces −z), just outside the coat, a little behind.
    const hips = bones[BONE.hips];
    const pelvis = d.bones[BONE.hips].pivot;
    let side = 0;
    const P = d.raw.pos;
    const S = d.raw.sIdx;
    const trunk = (b) => b === BONE.hips || b === BONE.spine || b === BONE.thighL || b === BONE.thighR;
    for (let v = 0; v < P.length / 3; v++) if (trunk(S[v * 4]) && Math.abs(P[v * 3 + 1] - pelvis.y) < 0.06 && P[v * 3] < side) side = P[v * 3];
    this.bag.position.set(side - 0.06, -0.06, 0.05);
    hips.add(this.bag);
    this.copyLayers(mesh);
    this.group.add(mesh);
    return this;
  }

  /** Without the baked file (a load error) the body stays a simple capsule, so the game still runs. */
  placeholder() {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 10), new THREE.MeshLambertMaterial({ color: this.ch.coat || 0x6a5a3a }));
    m.position.y = 0.55;
    this.group.add(m);
    m.add(this.pick, this.bag);
    this.pick.position.set(-0.25, -0.1, -0.15);
    this.bag.position.set(0.25, -0.05, 0.1);
    this.copyLayers(m);
  }

  /** New children take the group's render layers (each player sees only the others' bodies). */
  copyLayers(obj) {
    obj.traverse((o) => {
      o.layers.mask = this.group.layers.mask;
    });
  }

  /** Sets the render layer of the whole body (call after the async attach too: it is remembered). */
  setLayer(layer) {
    this.group.layers.set(layer);
    this.group.traverse((o) => o.layers.set(layer));
  }

  /** Sets a bone's rotation (x, y, z Euler, radians) — smoothed towards the target unless `snap`. */
  turn(i, x, y, z, k) {
    const key = i;
    const a = this.ang[key] || (this.ang[key] = [0, 0, 0]);
    a[0] += (x - a[0]) * k;
    a[1] += (y - a[1]) * k;
    a[2] += (z - a[2]) * k;
    tmpE.set(a[0], a[1], a[2], 'XYZ');
    this.bones[i].quaternion.setFromEuler(tmpE);
  }

  /**
   * Poses the body for this frame. st: { dt, speed (horizontal m/s), vy, grounded, climbing, swing (1 → 0 dig),
   * pitch (look), walk (full walking speed), fill (bag 0..1) }.
   * Bone frame: the body faces −z; for bones hanging down (arms, legs) +x rotation swings them forward, for bones
   * pointing up (spine, head) −x leans forward.
   */
  animate(st) {
    this.bag.scale.setScalar(0.7 + (st.fill || 0) * 0.8);
    if (!this.bones) return;
    const dt = Math.min(0.05, st.dt);
    this.t += dt;
    const B = BONE;
    const k = 1 - Math.exp(-dt * 14);
    const walking = st.grounded && !st.climbing;
    const legLen = Math.max(0.3, this.data.bones[B.thighL].pivot.y);
    const wTarget = walking ? clamp01(st.speed / (st.walk || 3.6)) : 0;
    this.walkAmt += (wTarget - this.walkAmt) * (1 - Math.exp(-dt * 8));
    this.walkPhase += dt * (st.speed / (legLen * 2.6)) * Math.PI * 2 * (walking ? 1 : 0);
    this.climbAmt += ((st.climbing ? 1 : 0) - this.climbAmt) * (1 - Math.exp(-dt * 8));
    this.climbPhase += dt * Math.abs(st.vy || 0) * 3.2;
    this.airAmt += ((!st.grounded && !st.climbing ? 1 : 0) - this.airAmt) * (1 - Math.exp(-dt * 6));
    const w = this.walkAmt;
    const ph = this.walkPhase;
    const c = this.climbAmt;
    const cp = this.climbPhase;
    const air = this.airAmt * (1 - c);
    const breathe = Math.sin(this.t * 2.1) * 0.015;

    // Legs: walk swing, knee bend in the swing phase; climbing steps; tucked in the air.
    const swingL = Math.sin(ph) * 0.55 * w;
    const kneeL = -(0.08 + 0.75 * Math.max(0, Math.cos(ph))) * w;
    const kneeR = -(0.08 + 0.75 * Math.max(0, -Math.cos(ph))) * w;
    const climbL = 0.75 + 0.45 * Math.sin(cp);
    const climbR = 0.75 - 0.45 * Math.sin(cp);
    this.turn(B.thighL, swingL * (1 - c) + climbL * c + 0.45 * air, 0, 0, k);
    this.turn(B.thighR, -swingL * (1 - c) + climbR * c + 0.2 * air, 0, 0, k);
    this.turn(B.shinL, kneeL * (1 - c) - (0.4 + 0.5 * Math.max(0, Math.sin(cp))) * c - 0.7 * air, 0, 0, k);
    this.turn(B.shinR, kneeR * (1 - c) - (0.4 + 0.5 * Math.max(0, -Math.sin(cp))) * c - 0.35 * air, 0, 0, k);

    // Trunk: bob and twist when walking, lean in to the ladder, breathe.
    const root = this.bones[B.hips];
    root.position.copy(this.rest[B.hips]);
    root.position.y += -Math.abs(Math.cos(ph)) * 0.025 * w + 0.012 * w;
    root.position.z += -0.06 * c;
    let spineX = -0.06 * w - 0.12 * c + breathe;
    let spineY = Math.sin(ph) * 0.1 * w;

    // Arms: opposite to the legs when walking (the tool arm less), reaching up the ladder rungs.
    let armLX = -swingL * 0.9 * (1 - c) + (2.45 + 0.35 * Math.sin(cp)) * c + 0.3 * air;
    let armRX = swingL * 0.45 * (1 - c) + (2.45 - 0.35 * Math.sin(cp)) * c + 0.25 * air;
    let foreLX = 0.22 + 0.25 * w + 0.5 * c;
    let foreRX = 0.3 + 0.1 * w + 0.5 * c;
    let armLZ = 0.06 * air;
    let armRZ = -0.06 * air;
    // At rest the wrist lets the tool head tip down a little.
    let handRX = -0.4 * (1 - c);
    let kArm = k;
    // Dig: wind up over the head, strike forward and down (the wrist flicks the pick head down), recover.
    if (st.swing > 0) {
      const u = 1 - st.swing;
      let a;
      let fore;
      let wrist;
      let lean;
      if (u < 0.32) {
        const t = ease(u / 0.32);
        a = 0.2 + (2.75 - 0.2) * t;
        fore = 0.3 + 0.8 * t;
        wrist = 0.5 * t;
        lean = 0.12 * t;
      } else if (u < 0.62) {
        const t = (u - 0.32) / 0.3;
        const e = t * t;
        a = 2.75 + (0.95 - 2.75) * e;
        fore = 1.1 - 1.0 * e;
        wrist = 0.5 - 1.7 * e;
        lean = 0.12 - 0.42 * e;
      } else {
        const t = ease((u - 0.62) / 0.38);
        a = 0.95 + (0.2 - 0.95) * t;
        fore = 0.1 + 0.2 * t;
        wrist = -1.2 * (1 - t);
        lean = -0.3 * (1 - t);
      }
      armRX = a;
      foreRX = fore;
      handRX = wrist;
      armLX = a * 0.85;
      foreLX = fore + 0.3;
      armLZ = -0.25 * Math.sin(Math.min(1, u / 0.62) * Math.PI);
      armRZ = 0.12 * Math.sin(Math.min(1, u / 0.62) * Math.PI);
      spineX = lean - 0.05;
      spineY = -0.12 * Math.sin(u * Math.PI);
      kArm = 1;
    }
    this.turn(B.spine, spineX, spineY, 0, k);
    this.turn(B.upperArmL, armLX, 0, armLZ, kArm);
    this.turn(B.upperArmR, armRX, 0, armRZ, kArm);
    this.turn(B.foreArmL, foreLX, 0, 0, kArm);
    this.turn(B.foreArmR, foreRX, 0, 0, kArm);
    this.turn(B.handR, handRX, 0, 0, kArm);
    this.turn(B.handL, 0, 0, 0, k);
    // The head follows the look (up and down) a little.
    const pitch = Math.max(-0.9, Math.min(0.9, st.pitch || 0));
    this.turn(B.head, pitch * 0.55 - spineX * 0.5, -spineY * 0.5, 0, k);
    void tmpQ;
  }
}

/* ---- the first-person forearm --------------------------------------------------------------------------------------- */

const forearmCache = new Map();

/**
 * Geometry of the character's right forearm, sleeve and hand (every vertex mostly skinned to the forearm or the hand),
 * in the grip frame: the hand holds a tool model built along −z at the origin, exactly as on the body.
 */
function forearmGeometry(id, d) {
  if (forearmCache.has(id)) return forearmCache.get(id);
  const { pos, nrm, col, pbr, sIdx, sWt, index } = d.raw;
  const nV = pos.length / 3;
  const keep = new Uint8Array(nV);
  for (let v = 0; v < nV; v++) {
    let w = 0;
    for (let k = 0; k < 4; k++) {
      const b = sIdx[v * 4 + k];
      if (b === BONE.foreArmR || b === BONE.handR) w += sWt[v * 4 + k];
    }
    keep[v] = w >= 160 ? 1 : 0;
  }
  const remap = new Int32Array(nV).fill(-1);
  const P = [];
  const N = [];
  const C = [];
  const R = [];
  const I = [];
  const inv = d.grip.clone().invert();
  const nm = new THREE.Matrix3().setFromMatrix4(inv);
  const v3 = new THREE.Vector3();
  for (let f = 0; f < index.length; f += 3) {
    const a = index[f];
    const b = index[f + 1];
    const c = index[f + 2];
    if (!keep[a] || !keep[b] || !keep[c]) continue;
    for (const v of [a, b, c]) {
      if (remap[v] < 0) {
        remap[v] = P.length / 3;
        v3.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]).applyMatrix4(inv);
        P.push(v3.x, v3.y, v3.z);
        v3.set(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]).applyMatrix3(nm).normalize();
        N.push(v3.x, v3.y, v3.z);
        for (let k = 0; k < 4; k++) {
          C.push(col[v * 4 + k]);
          R.push(pbr[v * 4 + k]);
        }
      }
      I.push(remap[v]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aCol', new THREE.Uint8BufferAttribute(C, 4, true));
  g.setAttribute('aPbr', new THREE.Uint8BufferAttribute(R, 4, true));
  g.setIndex(I);
  g.computeBoundingSphere();
  forearmCache.set(id, g);
  return g;
}

/**
 * The first-person hand: a Group in the grip frame (put the tool model in it too) that receives the character's own
 * sleeve and hand once decoded. Children added later copy the group's layer mask.
 */
export function viewForearm(ch, asset = ch.id) {
  const g = new THREE.Group();
  g.name = `forearm-${asset}`;
  loadAsset(asset, ch.id).then((d) => {
    const m = new THREE.Mesh(forearmGeometry(d.id, d), characterMaterial());
    m.layers.mask = g.layers.mask;
    m.renderOrder = 2;
    g.add(m);
  }).catch(() => {});
  return g;
}

/** Eye height in metres of a character (its baked head), or null before it is decoded. */
export async function characterEye(id) {
  const d = await loadCharacter(id);
  return d.eye;
}
