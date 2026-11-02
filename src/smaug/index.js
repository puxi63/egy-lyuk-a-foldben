/* ==== smaug/index.js — Smaug (NOTES-7a-hoard): the dragon's body, poses, eye, breath, smoke and snoring.
   One instance, owned by the game (`game.smaug`, built by underground/hoard-fx.js so his colliders join the decor's).
   Draw calls: the skinned body (1), the eyes (1, children of the head bone), the nostril smoke (1 Points), the fire (1,
   only while he breathes it). No LOD.

   Interface (the finale agent codes against it; src/hoard/ drives the idle and noise behaviour):
   - `root` (THREE.Group): his place and heading (the finale moves it while he flies; set back with `toLair()`);
   - `update(dt)`: the pose blend, breathing, the eye, smoke, fire, the snoring sound;
   - `setPose(name)`: 'sleep' | 'stir' | 'awake' | 'fly' | 'fall' ('fly' beats the wings, so it looks right when
     someone else moves `root` along a path; 'fall' is limp, rolled, wings trailing);
   - `setEye(0..1)`: how far the eye is open (0 shut, 0.3 a slit, 1 wide);
   - `breath(on, from?, dir?)`: the fire cone from his mouth (or `from`) along `dir` (or where the head points); returns
     { hits(pos) } (true when a world point is in the flame now);
   - `snore(on)`: the snoring (its loudness: `snoreLevel` 0..1, set by the noise logic by distance);
   - `look` (THREE.Vector3 | null): where the raised head aims in 'awake' (world);
   - `busy`: true while the finale drives him (the noise logic stands down);
   - `capsules()`: his sleeping body as capsules (world) for the colliders; `mouth(out)`, `headPos(out)`;
   - NOTES-27-loose: `neckCapsules(out)` the neck and head in the current pose (the raised neck's colliders, src/hoard/
     neck.js); `followTrack(points | null)`: in 'fly', the spine laid along 16 world points (tail first, the snout
     last) with the wings folded (the escape's narrow shafts, src/finale/).
   Canon: Smaug, a great red-gold dragon, asleep on the hoard with his wings folded, smoke from his nostrils, the eye
   that opens a slit (the book ch. 12; the films' look). He cannot be fought (TERV): stealth and escape only. ==== */
import * as THREE from 'three';
import { sharedAudio } from '../audio.js';
import { AT, BODY_LEN, buildSmaugBody, HEAD_BONE, HIP_BONE, makeScaleTexture, sectionAt, SHOULDER_BONE, SPINE_J } from './body.js';

export const SMAUG_POSES = ['sleep', 'stir', 'awake', 'fly', 'fall'];
const BREATH_PERIOD = 5.2; // seconds per breath while asleep
const FIRE = { len: 10.5, radius: 2.3, rise: 0.35, fall: 0.6 };
const SMOKE_N = 36;

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const ss = (a, b, x) => smooth01((x - a) / (b - a));

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpM4 = new THREE.Matrix4();

/** The eyes' material: unlit, the lid (scales) covering the eyeball except an almond opening, a hot gold iris with a slit pupil. */
function eyeMaterial(uOpen) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOpen = uOpen;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aEye;\nvarying vec4 vEye;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEye = aEye;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uOpen;\nvarying vec4 vEye;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vEye.xyz);
          float out_ = n.x * vEye.w;
          // The almond opening facing out from the head; its height follows uOpen.
          float open = uOpen * 0.78 * smoothstep(0.1, 0.55, out_);
          float lid = smoothstep(open - 0.04, open + 0.02, abs(n.y + n.z * 0.15));
          vec3 iris = mix(vec3(1.0, 0.82, 0.25), vec3(1.0, 0.42, 0.05), smoothstep(0.0, 0.7, length(n.yz)));
          // The slit pupil (vertical), wider when the eye is wide open.
          float pupil = 1.0 - smoothstep(0.06 + 0.08 * uOpen, 0.1 + 0.08 * uOpen, abs(n.z));
          iris = mix(iris, vec3(0.02, 0.01, 0.0), pupil * smoothstep(0.4, 0.8, out_));
          vec3 lidC = vec3(0.16, 0.035, 0.02);
          diffuseColor.rgb = mix(iris * 1.6, lidC, lid);
        }`);
  };
  return m;
}

/** The fire's material: additive, white-gold at the core to orange and red at the edge, flickering noise along it. */
function fireMaterial(uTime, uAmt) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uAmt },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform float uAmt; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float along = 1.0 - vUv.y;
        float rim = abs(dot(vN, vV));
        float fl = n2(vec2(vUv.x * 9.0, along * 6.0 - uTime * 9.0)) * 0.6 + n2(vec2(vUv.x * 21.0, along * 14.0 - uTime * 17.0)) * 0.4;
        float reach = smoothstep(uAmt * 1.05, uAmt * 1.05 - 0.25, along);
        float a = rim * (0.55 + 0.6 * fl) * reach * (1.0 - smoothstep(0.75, 1.0, along) * 0.6);
        vec3 core = vec3(1.0, 0.92, 0.6);
        vec3 mid = vec3(1.0, 0.45, 0.08);
        vec3 edge = vec3(0.7, 0.08, 0.02);
        vec3 c = mix(core, mid, smoothstep(0.05, 0.45, along + (1.0 - rim) * 0.4));
        c = mix(c, edge, smoothstep(0.5, 1.0, along + (1.0 - rim) * 0.3));
        gl_FragColor = vec4(c * a * 1.6, 1.0);
      }`,
  });
}

/** The nostril smoke: soft dark puffs (Points), each with its own age. */
function smokeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float aAge; attribute float aHot; varying float vAge; varying float vHot;
      uniform float uScale;
      void main() { vAge = aAge; vHot = aHot; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAge < 0.0 ? 0.0 : (0.25 + aAge * 1.1) * uScale / max(1.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vAge; varying float vHot;
      void main() { if (vAge < 0.0) discard; vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.1, r) * (1.0 - vAge) * 0.3;
        vec3 c = mix(vec3(0.16, 0.14, 0.13), vec3(1.0, 0.5, 0.15), vHot * (1.0 - vAge));
        gl_FragColor = vec4(c, a); }`,
  });
}

export class Smaug {
  /**
   * @param {object} lair { x, y, z, yaw } where he sleeps (underground/hoard-sites.js SMAUG_LAIR)
   * @param {(x: number, z: number) => number} groundAt the gold's height under a world plan point (he lies on it)
   */
  constructor(lair, groundAt) {
    this.lair = { ...lair };
    this.groundAt = groundAt;
    this.root = new THREE.Group();
    this.root.name = 'smaug';
    this.busy = false;
    this.time = 0;
    this.pose = 'sleep';
    this.eye = 0;
    this.eyeTarget = 0;
    this.look = null;
    this.snoreOn = true;
    this.snoreLevel = 0;
    this.mute = false;
    this.heat = 0;
    // NOTES-27-loose: world points for the spine's joints while he squeezes through a shaft (followTrack), or null.
    this.track = null;
    this.trackUps = null;
    this.trackHeading = new THREE.Vector3(0, 0, 1);
    // ---- the body ----
    const body = buildSmaugBody();
    this.body = body;
    this.uniforms = { uHeat: { value: 0 }, uBreath: { value: 0 } };
    // The scale texture is also the bump map (NOTES-17-polish): each scale's dome and dark edge give the close-up relief
    // through the normals, the same texture, still one program.
    const scaleTex = makeScaleTexture();
    const mat = new THREE.MeshPhongMaterial({ map: scaleTex, bumpMap: scaleTex, bumpScale: 2.2, vertexColors: true, specular: 0x7a5a30, shininess: 34, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHeat = this.uniforms.uHeat;
      sh.uniforms.uBreath = this.uniforms.uBreath;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aFx;\nuniform float uBreath;\nvarying float vHeat;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += objectNormal * (uBreath * aFx.y);\nvHeat = aFx.x;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHeat;\nvarying float vHeat;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.36, 0.05) * uHeat * vHeat * 0.9;');
    };
    mat.customProgramCacheKey = () => 'smaug-body';
    this.material = mat;
    const mesh = new THREE.SkinnedMesh(body.geometry, mat);
    mesh.name = 'smaug-body';
    mesh.add(body.root);
    mesh.bind(new THREE.Skeleton(body.bones));
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.root.add(mesh);
    // Rest local transforms of the limb bones (posed by directions in their spine bone's frame).
    this.spine = body.spine;
    this.limbs = [];
    for (const [b, info] of body.restInfo) this.limbs.push({ b, info });
    // ---- the eyes (children of the head bone) ----
    this.uOpen = { value: 0 };
    const eyeGeo = [];
    for (const sx of [1, -1]) {
      const g = new THREE.SphereGeometry(0.13, 14, 10);
      const p = g.attributes.position;
      const a = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        a[i * 4] = p.getX(i);
        a[i * 4 + 1] = p.getY(i);
        a[i * 4 + 2] = p.getZ(i);
        a[i * 4 + 3] = sx;
      }
      g.setAttribute('aEye', new THREE.BufferAttribute(a, 4));
      g.translate(sx * 0.7, 0.27, 0.45);
      eyeGeo.push(g);
    }
    const eg = new THREE.BufferGeometry();
    const merge = (name, size) => {
      const arrs = eyeGeo.map((g) => g.attributes[name].array);
      const out = new Float32Array(arrs.reduce((s, a) => s + a.length, 0));
      let o = 0;
      for (const a of arrs) {
        out.set(a, o);
        o += a.length;
      }
      eg.setAttribute(name, new THREE.BufferAttribute(out, size));
    };
    merge('position', 3);
    merge('normal', 3);
    merge('aEye', 4);
    const idx = [];
    let base = 0;
    for (const g of eyeGeo) {
      for (const i of g.index.array) idx.push(i + base);
      base += g.attributes.position.count;
    }
    eg.setIndex(idx);
    this.eyes = new THREE.Mesh(eg, eyeMaterial(this.uOpen));
    this.eyes.name = 'smaug-eyes';
    this.eyes.frustumCulled = false;
    this.spine[HEAD_BONE].add(this.eyes);
    // ---- the fire (one cone, hidden unless breathing) ----
    this.fireU = { uTime: { value: 0 }, uAmt: { value: 0 } };
    const cone = new THREE.ConeGeometry(FIRE.radius, FIRE.len, 18, 6, true);
    cone.translate(0, -FIRE.len / 2, 0);
    cone.rotateX(-Math.PI / 2);
    this.fire = new THREE.Mesh(cone, fireMaterial(this.fireU.uTime, this.fireU.uAmt));
    this.fire.name = 'smaug-fire';
    this.fire.visible = false;
    this.fire.frustumCulled = false;
    this.fire.renderOrder = 4;
    this.fireOn = false;
    this.fireAmt = 0;
    this.fireFrom = new THREE.Vector3();
    this.fireDir = new THREE.Vector3(0, 0, 1);
    this.fireAuto = true;
    // ---- the smoke (Points in world space: a child of the root's parent once added; kept in root coordinates) ----
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE_N * 3), 3));
    sg.setAttribute('aAge', new THREE.BufferAttribute(new Float32Array(SMOKE_N).fill(-1), 1));
    sg.setAttribute('aHot', new THREE.BufferAttribute(new Float32Array(SMOKE_N), 1));
    this.smoke = new THREE.Points(sg, smokeMaterial());
    this.smoke.name = 'smaug-smoke';
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 3;
    this.puffs = Array.from({ length: SMOKE_N }, () => ({ age: -1, v: new THREE.Vector3(), p: new THREE.Vector3(), hot: 0 }));
    this.puffT = 0;
    // The fire and the smoke live in world space (siblings of the root), so the finale can move him freely.
    this.fx = new THREE.Group();
    this.fx.name = 'smaug-fx';
    this.fx.add(this.fire, this.smoke);
    // ---- the pose state: current local transforms (blended towards the target every frame) ----
    this.toLair();
    this.cur = null;
    this.breathT = 0;
    this.flap = 0;
    this.stirT = 0;
    this.jawOpen = 0;
    this.applyPose(1);
    this.root.updateMatrixWorld(true);
    this.audio = null;
  }

  /** Puts him back on his lair (position and heading). */
  toLair() {
    this.root.position.set(this.lair.x, this.lair.y, this.lair.z);
    this.root.rotation.set(0, this.lair.yaw || 0, 0);
  }

  /** Adds his meshes to a parent (the decor's layer group). */
  addTo(parent) {
    parent.add(this.root);
    parent.add(this.fx);
  }

  setPose(name) {
    if (!SMAUG_POSES.includes(name)) return;
    this.pose = name;
  }

  setEye(v) {
    this.eyeTarget = Math.max(0, Math.min(1, +v || 0));
  }

  snore(on) {
    this.snoreOn = !!on;
  }

  /** The head's world position (the skull behind the eyes). */
  headPos(out = new THREE.Vector3()) {
    this.spine[HEAD_BONE].updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.spine[HEAD_BONE].matrixWorld);
  }

  /** The mouth's world position and the head's forward direction (into `dir` when given). */
  mouth(out = new THREE.Vector3(), dir = null) {
    const hb = this.spine[HEAD_BONE];
    hb.updateWorldMatrix(true, false);
    out.set(0, -0.1, AT.snout - AT.head + 0.1).applyMatrix4(hb.matrixWorld);
    if (dir) dir.set(0, 0, 1).transformDirection(hb.matrixWorld);
    return out;
  }

  /**
   * The fire: on/off; `from` and `dir` (world) default to his mouth and the head's direction (followed every frame).
   * Returns { hits(pos) }: true when a world point is inside the flame now.
   */
  breath(on, from = null, dir = null) {
    this.fireOn = !!on;
    this.fireAuto = !from;
    if (from) this.fireFrom.copy(from);
    if (dir) this.fireDir.copy(dir).normalize();
    return { hits: (pos) => this.fireHits(pos) };
  }

  /** True when a world point is in the flame (the cone as far as it reaches now, plus a 0.35 m margin). */
  fireHits(pos) {
    if (this.fireAmt < 0.3) return false;
    tmpV.copy(pos).sub(this.fireFrom);
    const t = tmpV.dot(this.fireDir);
    const reach = FIRE.len * this.fireAmt;
    if (t < 0 || t > reach) return false;
    const radial = tmpV.addScaledVector(this.fireDir, -t).length();
    return radial < (t / FIRE.len) * FIRE.radius + 0.35;
  }

  /** His sleeping body as capsules (world): [{ a: [x, y, z], b: [x, y, z], r }] (the decor's colliders). */
  capsules() {
    this.root.updateMatrixWorld(true);
    const out = [];
    const pts = this.spine.map((b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
    pts.push(this.mouth(new THREE.Vector3()));
    for (let i = 0; i + 1 < pts.length; i++) {
      const s = (SPINE_J[i] + SPINE_J[Math.min(SPINE_J.length - 1, i + 1)]) / 2;
      const [w, h] = sectionAt(Math.min(BODY_LEN - 0.1, s));
      out.push({ a: pts[i].toArray(), b: pts[i + 1].toArray(), r: Math.max(0.15, Math.min(w, h) * 0.95) });
    }
    return out;
  }

  /**
   * NOTES-27-loose: the neck and the head in the current pose as capsules (world), from the shoulders (SHOULDER_BONE)
   * to the mouth: the same segments and radii as `capsules()` from there on. Fills `out[k]` = { a: [3], b: [3], r }
   * in place (the bones' world matrices are this frame's: call after `update`). Returns the count.
   */
  neckCapsules(out) {
    const n = this.spine.length;
    let k = 0;
    for (let i = SHOULDER_BONE; i < n; i++, k++) {
      const c = out[k];
      if (!c) break;
      tmpV.setFromMatrixPosition(this.spine[i].matrixWorld);
      if (i + 1 < n) tmpV2.setFromMatrixPosition(this.spine[i + 1].matrixWorld);
      else this.mouth(tmpV2);
      tmpV.toArray(c.a);
      tmpV2.toArray(c.b);
      const s = (SPINE_J[i] + SPINE_J[Math.min(SPINE_J.length - 1, i + 1)]) / 2;
      const [w, h] = sectionAt(Math.min(BODY_LEN - 0.1, s));
      c.r = Math.max(0.15, Math.min(w, h) * 0.95);
    }
    return k;
  }

  /**
   * NOTES-27-loose: lays the spine along world points in 'fly' (16 points, one per joint, tail first, the snout last),
   * the wings folded along the back; null (or a wrong count) gives the free flight back. The points are read each
   * `update` against the root's world matrix, so the root may sit anywhere (the finale puts it at the snout).
   */
  followTrack(points, heading = null) {
    this.track = points && points.length === SPINE_J.length ? points : null;
    if (heading) this.trackHeading.set(heading.x, 0, heading.z).normalize();
  }

  /**
   * NOTES-27-loose: moves the root (world position and rotation) without moving the posed body: the first spine bone
   * takes the difference, so a pose blend under way goes on from where the body is (the shaft's squeeze in and out).
   */
  moveRoot(pos, quat) {
    const b = this.spine[0];
    this.root.updateMatrixWorld(true);
    const old = tmpM4.copy(this.root.matrixWorld);
    const local = new THREE.Matrix4().compose(b.position, b.quaternion, b.scale);
    this.root.position.copy(pos);
    this.root.quaternion.copy(quat);
    this.root.updateMatrixWorld(true);
    const m = new THREE.Matrix4().copy(this.root.matrixWorld).invert().multiply(old).multiply(local);
    m.decompose(b.position, b.quaternion, tmpV2);
    b.scale.set(1, 1, 1);
    this.root.updateMatrixWorld(true);
  }

  /**
   * The joints from `track` in root-local coordinates (a joint closer than 5 cm to the next is pushed back), and each
   * bone's "up" (`trackUps`, root-local): world up, turning to the horizontal heading where a bone dives steeply (to
   * its reverse where it climbs), so a vertical shaft never leaves the bone's roll undefined.
   */
  trackSpine() {
    this.root.updateMatrixWorld(true);
    tmpM4.copy(this.root.matrixWorld).invert();
    const T = this.track;
    const P = T.map((q) => q.clone().applyMatrix4(tmpM4));
    for (let k = P.length - 2; k >= 0; k--) {
      if (P[k].distanceToSquared(P[k + 1]) >= 0.0025) continue;
      const d = k + 2 < P.length ? tmpV.subVectors(P[k + 1], P[k + 2]) : tmpV.set(0, 0, -1);
      if (d.lengthSq() < 1e-8) d.set(0, 0, -1);
      P[k].copy(P[k + 1]).addScaledVector(d.normalize(), 0.05);
    }
    const inv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const H = this.trackHeading;
    this.trackUps = [];
    for (let i = 0; i + 1 < T.length; i++) {
      const d = tmpV.subVectors(T[i + 1], T[i]);
      const l = d.length();
      const dy = l > 1e-6 ? d.y / l : 0;
      const w = ss(0.6, 0.95, Math.abs(dy));
      const sg = dy < 0 ? 1 : -1;
      const up = V(H.x * sg * w, 1 - w, H.z * sg * w);
      if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
      this.trackUps.push(up.normalize().applyQuaternion(inv));
    }
    return P;
  }

  /* ---------------- poses ---------------- */

  /**
   * The spine's joints for a pose (root-local points), integrated from the tail's tip along headings (plan angle,
   * 0 = +z, + towards +x) and pitches; the lying poses then rest each joint on the gold.
   */
  spineFor(pose) {
    const J = SPINE_J;
    const n = J.length;
    const P = new Array(n);
    this.trackUps = null;
    if (pose === 'fly' && this.track) return this.trackSpine(); // NOTES-27-loose: squeezing through a shaft
    if (pose === 'fly' || pose === 'fall') {
      // Straight along +z, a slow S-wave; the tail a little lower, the neck a little raised (fall: drooping).
      const wave = Math.sin(this.time * 1.3);
      let x = 0;
      let y = 0;
      let z = -BODY_LEN * 0.55;
      let head = 0;
      let pitch = 0;
      const ds = 0.1;
      let k = 0;
      for (let s = 0; k < n; s += ds) {
        if (s >= J[k] - 1e-6) P[k++] = V(x, y, z);
        head = wave * 0.08 * Math.sin(s * 0.45);
        if (pose === 'fly') pitch = s < AT.hip ? -0.08 * (1 - s / AT.hip) : s > AT.shoulder ? 0.12 * ss(AT.shoulder, AT.head, s) - 0.25 * ss(AT.head - 0.4, AT.snout, s) : 0;
        else pitch = s > AT.shoulder ? -0.5 * ss(AT.shoulder, AT.snout, s) : 0.1 * Math.sin(s * 0.4);
        x += Math.sin(head) * Math.cos(pitch) * ds;
        y += Math.sin(pitch) * ds;
        z += Math.cos(head) * Math.cos(pitch) * ds;
      }
      return P;
    }
    // Lying: the coil round the heap (the curvature along the spine), the neck curving out, the head on the gold.
    if (!this.coil) {
      // A tight curl: the tail and the body round the heap, the neck turning out and back so the head lies by the tail.
      const kappa = (s) => 0.2 + 0.11 * ss(0.5, 3.0, s) - 0.62 * ss(13.4, 14.8, s) * (1 - ss(16.4, 17.4, s));
      const pts = [];
      let x = 0;
      let z = 0;
      let th = 0;
      const ds = 0.05;
      let k = 0;
      let centre = null;
      for (let s = 0; k < n; s += ds) {
        if (s >= J[k] - 1e-6) pts[k++] = [x, z, th];
        if (!centre && s >= 9.5) centre = [x + Math.cos(th) / kappa(s), z - Math.sin(th) / kappa(s)];
        th += kappa(s) * ds;
        x += Math.sin(th) * ds;
        z += Math.cos(th) * ds;
      }
      // Centre the coil on the heap, then turn it so the head lies towards the south-west (the ledge).
      const hx = pts[n - 1][0] - centre[0];
      const hz = pts[n - 1][1] - centre[1];
      const want = Math.atan2(-0.42, 1); // plan angle of the head from the heap's centre (−x, +z)
      const rot = want - Math.atan2(hx, hz);
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      this.coil = pts.map(([px, pz]) => {
        const dx = px - centre[0];
        const dz = pz - centre[1];
        return [dx * c + dz * sn, -dx * sn + dz * c];
      });
    }
    const yaw = this.root.rotation.y;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    for (let k = 0; k < n; k++) {
      const [lx, lz] = this.coil[k];
      const wx = this.root.position.x + lx * cy + lz * sy;
      const wz = this.root.position.z - lx * sy + lz * cy;
      const s = J[k];
      const [, h] = sectionAt(Math.min(BODY_LEN - 0.01, s));
      const g = this.groundAt(wx, wz) - this.root.position.y;
      P[k] = V(lx, g + h * 0.62 + (s >= AT.head ? 0.1 : 0), lz);
    }
    if (pose === 'stir') {
      // The head lifted off the gold, the neck rising; the tail's tip twitching.
      const lift = 0.7 + 0.15 * Math.sin(this.time * 1.7);
      for (let k = 10; k < n; k++) P[k].y += lift * ss(10, 15, k);
      P[0].x += Math.sin(this.time * 3.1) * 0.25;
      P[1].x += Math.sin(this.time * 3.1 - 0.6) * 0.12;
    } else if (pose === 'awake') {
      // The neck rears up from the shoulders; the head aims at `look` (or straight ahead, high).
      const s0 = 10;
      const base = P[s0].clone();
      base.y += 0.3;
      const fwd = P[s0].clone().sub(P[s0 - 1]).setY(0).normalize();
      let aimYaw = Math.atan2(fwd.x, fwd.z);
      let aimPitch = -0.2;
      if (this.look) {
        const lp = this.root.worldToLocal(tmpV.copy(this.look));
        const headGuess = base.clone().add(V(0, 4.2, 0)).addScaledVector(fwd, 1.5);
        const d = lp.sub(headGuess);
        aimYaw = Math.atan2(d.x, d.z);
        aimPitch = Math.max(-1.1, Math.min(0.4, Math.atan2(d.y, Math.hypot(d.x, d.z))));
      }
      const yaw0 = Math.atan2(fwd.x, fwd.z);
      let dyaw = aimYaw - yaw0;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      let x = base.x;
      let y = base.y;
      let z = base.z;
      const ds = 0.05;
      let k = s0;
      P[k] = V(x, y, z);
      k++;
      for (let s = J[s0]; k < n; s += ds) {
        const t = (s - J[s0]) / (BODY_LEN - J[s0]);
        const hd = yaw0 + dyaw * ss(0.1, 0.7, t);
        // Up from the shoulders, then over towards the aim before the head (the head itself straight along it).
        const pt = t < 0.38 ? 1.15 * ss(0.0, 0.22, t) : 1.15 + (aimPitch - 1.15) * ss(0.38, 0.62, t);
        x += Math.sin(hd) * Math.cos(pt) * ds;
        y += Math.sin(pt) * ds;
        z += Math.cos(hd) * Math.cos(pt) * ds;
        if (s + ds >= J[k] - 1e-6) P[k++] = V(x, y, z);
      }
    }
    return P;
  }

  /** Limb directions for a pose in their spine bone's frame: Map(bone → [dir, up]). */
  limbsFor(pose) {
    const out = new Map();
    const W = this.body.wing;
    const L = this.body.leg;
    const f = this.flap;
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const w = W[side];
      const l = L[side];
      const set = (b, d, up) => out.set(b, [V(d[0] * sx, d[1], d[2]).normalize(), V(up[0] * sx, up[1], up[2])]);
      if (pose === 'fly' && !this.track) {
        const a = Math.sin(f);
        const a2 = Math.sin(f - 0.7);
        set(w.humerus, [1, a * 0.75 + 0.1, 0.12], [0, 1, 0]);
        set(w.forearm, [1, a2 * 0.6, -0.32], [0, 1, 0]);
        set(w.finger1, [1, a2 * 0.35 - 0.02, -0.72], [0, 1, 0]);
        set(w.finger2, [0.42, a2 * 0.25 - 0.03, -1], [0, 1, 0]);
        set(w.finger3, [-0.12, a2 * 0.15 - 0.05, -1], [0, 1, 0]);
        set(l.thigh, [0.1, -0.35, -1], [0, 1, 0]);
        set(l.shin, [0.05, -0.1, -1], [0, 1, 0]);
        set(l.foot, [0, 0.05, -1], [0, 1, 0]);
      } else if (pose === 'fall') {
        set(w.humerus, [1, -0.5, 0.2], [0, 1, 0]);
        set(w.forearm, [0.7, -0.9, -0.2], [0, 1, 0]);
        set(w.finger1, [0.5, -1, -0.5], [0, 1, 0]);
        set(w.finger2, [0.2, -1, -0.7], [0, 1, 0]);
        set(w.finger3, [-0.1, -0.8, -1], [0, 1, 0]);
        set(l.thigh, [0.2, -1, 0.2], [0, 0, 1]);
        set(l.shin, [0, -1, -0.3], [0, 0, 1]);
        set(l.foot, [0, -0.5, 1], [0, 0, 1]);
      } else {
        // Folded along the back (sleep, stir); in 'awake' half raised (a threat).
        const up = pose === 'awake' ? 1 : 0;
        set(w.humerus, [0.55, 0.62 + 0.5 * up, -0.55 + 0.4 * up], [0, 1, 0]);
        set(w.forearm, [0.12 + 0.6 * up, -0.3 + 0.5 * up, 1.0 - 0.8 * up], [0, 1, 0]);
        set(w.finger1, [0.22 + 0.4 * up, -0.2, -1], [1, 0.3, 0]);
        set(w.finger2, [0.3 + 0.4 * up, -0.35, -1], [1, 0.2, 0]);
        set(w.finger3, [0.36 + 0.3 * up, -0.55, -1], [1, 0.1, 0]);
        if (pose === 'fly') {
          // NOTES-27-loose: the shaft's squeeze (followTrack): the wings folded as above, the legs tucked back as in flight.
          set(l.thigh, [0.1, -0.35, -1], [0, 1, 0]);
          set(l.shin, [0.05, -0.1, -1], [0, 1, 0]);
          set(l.foot, [0, 0.05, -1], [0, 1, 0]);
        } else {
          set(l.thigh, [0.25, -0.55, 0.85], [0, 0, 1]);
          set(l.shin, [0.05, -0.35, -1], [0, 0, 1]);
          set(l.foot, [0, -0.25, 1], [0, 0, 1]);
        }
      }
    }
    return out;
  }

  /** Target local transforms of every bone for the current pose: [{ q, p }] in skeleton order (the body's bones). */
  targetPose() {
    const quatFromDir = this.body.quatFromDir;
    const P = this.spineFor(this.pose);
    const n = this.spine.length;
    const worldQ = [];
    const T = new Map();
    for (let i = 0; i < n; i++) {
      const dir = P[i + 1].clone().sub(P[i]);
      // 'fall': rolled over onto the side.
      // NOTES-27-loose: in a shaft (followTrack) each bone has its own up (trackSpine).
      const up = this.pose === 'fall' ? V(0.85, 0.5, 0) : this.trackUps ? this.trackUps[i] : V(0, 1, 0);
      worldQ.push(quatFromDir(dir, up));
    }
    for (let i = 0; i < n; i++) {
      const parentQ = i === 0 ? new THREE.Quaternion() : worldQ[i - 1];
      const inv = parentQ.clone().invert();
      const q = inv.clone().multiply(worldQ[i]);
      const p = i === 0 ? P[0].clone() : P[i].clone().sub(P[i - 1]).applyQuaternion(inv);
      T.set(this.spine[i], { q, p });
    }
    // The jaw: open when awake and while breathing fire.
    const jq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.08 + this.jawOpen * 0.55);
    T.set(this.body.jaw, { q: jq, p: this.body.jaw.position.clone() });
    // The limbs, from directions in their spine bone's frame (the spine bone's world rotation is worldQ[i]).
    const parentOf = (b) => b.parent;
    const limbWorld = new Map();
    const dirs = this.limbsFor(this.pose);
    for (const { b, info } of this.limbs) {
      const [d, up] = dirs.get(b) || [info.dir, info.up];
      // The limb's frame root: the hips or the shoulders.
      const isLeg = b.name.startsWith('leg');
      const frameQ = worldQ[isLeg ? HIP_BONE : SHOULDER_BONE];
      const wq = frameQ.clone().multiply(quatFromDir(d, up));
      limbWorld.set(b, wq);
      const par = parentOf(b);
      const pq = limbWorld.get(par) || worldQ[this.spine.indexOf(par)];
      const q = pq.clone().invert().multiply(wq);
      T.set(b, { q, p: b.userData.restP || (b.userData.restP = b.position.clone()) });
    }
    return T;
  }

  /** Blends the bones towards the pose (k = 1 snaps). */
  applyPose(k) {
    const T = this.targetPose();
    for (const [b, t] of T) {
      if (k >= 1) {
        b.quaternion.copy(t.q);
        b.position.copy(t.p);
      } else {
        b.quaternion.slerp(t.q, k);
        b.position.lerp(t.p, k);
      }
    }
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.time += dt;
    const pose = this.pose;
    // Breathing: slow and deep asleep, quicker when stirring or awake.
    const rate = pose === 'sleep' ? 1 : pose === 'stir' ? 1.5 : 2.4;
    this.breathT += (dt * rate) / BREATH_PERIOD;
    const ph = this.breathT % 1;
    // The chest heaves: in for 45 % of the breath, out for the rest.
    const swell = ph < 0.45 ? ss(0, 0.45, ph) : 1 - ss(0.45, 1, ph);
    this.uniforms.uBreath.value = (pose === 'fly' ? 0.04 : 0.11) * swell;
    if (pose === 'fly' || pose === 'fall') this.flap += dt * (pose === 'fly' ? 2.6 : 0);
    // The jaw and the inner fire's glow.
    const jawGoal = this.fireOn ? 1 : pose === 'awake' ? 0.35 : 0;
    this.jawOpen += (jawGoal - this.jawOpen) * Math.min(1, dt * 6);
    const heatGoal = this.fireOn ? 0.85 : pose === 'awake' ? 0.22 : pose === 'stir' ? 0.06 : 0.02 * swell;
    this.heat += (heatGoal - this.heat) * Math.min(1, dt * 3);
    this.uniforms.uHeat.value = this.heat;
    // The pose blend (fast for the beating wings).
    const speed = pose === 'fly' ? 12 : pose === 'awake' ? 3.2 : 2.2;
    this.applyPose(1 - Math.exp(-dt * speed));
    this.root.updateMatrixWorld(true);
    // The eye.
    this.eye += (this.eyeTarget - this.eye) * Math.min(1, dt * 4);
    this.uOpen.value = this.eye;
    this.updateFire(dt);
    this.updateSmoke(dt, ph);
    this.updateSound(dt, ph);
  }

  updateFire(dt) {
    const goal = this.fireOn ? 1 : 0;
    this.fireAmt += (goal - this.fireAmt) * Math.min(1, dt / (this.fireOn ? FIRE.rise : FIRE.fall) * 2.2);
    if (this.fireAmt < 0.03 && !this.fireOn) {
      this.fireAmt = 0;
      this.fire.visible = false;
      return;
    }
    if (this.fireAuto) this.mouth(this.fireFrom, this.fireDir);
    this.fire.visible = true;
    this.fire.position.copy(this.fireFrom);
    this.fire.lookAt(tmpV2.copy(this.fireFrom).add(this.fireDir));
    this.fireU.uAmt.value = this.fireAmt;
    this.fireU.uTime.value = this.time;
  }

  updateSmoke(dt, ph) {
    // Puffs from the nostrils as he breathes out (more and hotter when awake).
    const exhale = ph > 0.5 && ph < 0.85;
    const awake = this.pose === 'awake' || this.fireOn;
    this.puffT -= dt;
    if ((exhale || awake) && this.puffT <= 0 && this.pose !== 'fall') {
      this.puffT = awake ? 0.06 : 0.16;
      const p = this.puffs.find((q) => q.age < 0);
      if (p) {
        const dir = tmpV2;
        this.mouth(p.p, dir);
        p.p.addScaledVector(dir, -0.15).add(V(0, 0.22, 0));
        p.v.copy(dir).multiplyScalar(awake ? 1.2 : 0.45).add(V((Math.random() - 0.5) * 0.2, 0.35 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2));
        p.age = 0;
        p.hot = awake ? 0.8 : 0;
      }
    }
    const pos = this.smoke.geometry.attributes.position;
    const age = this.smoke.geometry.attributes.aAge;
    const hot = this.smoke.geometry.attributes.aHot;
    let any = false;
    this.puffs.forEach((p, i) => {
      if (p.age >= 0) {
        p.age += dt / 2.6;
        p.v.y += dt * 0.25;
        p.v.multiplyScalar(1 - dt * 0.6);
        p.p.addScaledVector(p.v, dt);
        if (p.age >= 1) p.age = -1;
      }
      if (p.age >= 0) any = true;
      pos.setXYZ(i, p.p.x, p.p.y, p.p.z);
      age.setX(i, p.age);
      hot.setX(i, p.hot);
    });
    pos.needsUpdate = age.needsUpdate = hot.needsUpdate = true;
    this.smoke.visible = any;
  }

  /* ---------------- the snoring (synthesised; TERV 0.11/2: heard from far above, louder with depth) ---------------- */

  /** Builds the snoring's audio graph on first use: a raspy noise for the in-breath, a low rumble for the out-breath. */
  ensureAudio() {
    if (this.audio !== null) return this.audio;
    const ctx = sharedAudio();
    if (!ctx) {
      this.audio = false;
      return false;
    }
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);
      d[i] = b * 6 + (Math.random() * 2 - 1) * 0.15;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = 1.4;
    const rasp = ctx.createGain();
    rasp.gain.value = 0;
    src.connect(bp).connect(rasp);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 48;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    const rumble = ctx.createGain();
    rumble.gain.value = 0;
    osc.connect(lp).connect(rumble);
    const master = ctx.createGain();
    master.gain.value = 0;
    rasp.connect(master);
    rumble.connect(master);
    master.connect(ctx.destination);
    src.start();
    osc.start();
    this.audio = { ctx, rasp, rumble, master, osc };
    return this.audio;
  }

  updateSound(dt, ph) {
    const want = !this.mute && this.snoreOn && this.snoreLevel > 0.002 && (this.pose === 'sleep' || this.pose === 'stir');
    if (!want && !this.audio) return;
    const a = this.ensureAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const lvl = want ? this.snoreLevel : 0;
    a.master.gain.setTargetAtTime(lvl * 0.55, t, 0.25);
    // In-breath: a rasp rising; out-breath: the rumble, the pitch sinking.
    const inhale = ph < 0.45 ? Math.sin((ph / 0.45) * Math.PI) : 0;
    const exhale = ph >= 0.5 ? Math.sin(((ph - 0.5) / 0.5) * Math.PI) : 0;
    a.rasp.gain.setTargetAtTime(inhale * 0.5, t, 0.08);
    a.rumble.gain.setTargetAtTime(exhale * 0.9, t, 0.1);
    a.osc.frequency.setTargetAtTime(44 + 10 * exhale, t, 0.1);
  }

  /** Silences and releases the sound (the page or the finale ends him). */
  dispose() {
    if (this.audio) {
      try {
        this.audio.master.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.audio = false;
  }
}

