/* ==== gollum/body.js — Gollum's body: the baked film-look Gollum (tools/figbake/designs/gollum.mjs, the players' SDF
   pipeline, 13-bone rig and shared material), his own animation on top of the baked crouch (crawling on all fours,
   squatting, the twitchy talking pose with the "gollam" swallow, paddling his boat with his feet), the feet planted on
   the floor by a small forward-kinematics pass, the pale glints of his eyes, and the little boat.
   Book, ch. 5 "Riddles in the Dark": "He had a little boat, and he rowed about quite quietly on the lake ... He paddled
   it with large flat feet dangling over the side"; "looking out of his pale lamp-like eyes". The film has him swim;
   the book's boat is used (one mesh, no water effects needed while he sits in it). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BONE, CharacterBody } from '../characters.js';

const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/* ---- the eyes' glints: two soft points on the head bone (one draw call) ------------------------------------------- */

let glintTex = null;
let glintMat = null;

/** The glint material (shared): pale, additive, not fogged, so the eyes show in the dark like "pale lamps". */
export function glintMaterial() {
  if (glintMat) return glintMat;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(230,242,250,0.9)');
  g.addColorStop(0.45, 'rgba(180,205,220,0.25)');
  g.addColorStop(1, 'rgba(150,180,200,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  glintTex = new THREE.CanvasTexture(c);
  glintTex.colorSpace = THREE.SRGBColorSpace;
  glintMat = new THREE.PointsMaterial({ map: glintTex, color: 0xdfeaf2, size: 0.09, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.9 });
  return glintMat;
}

/* ---- the little boat ------------------------------------------------------------------------------------------------ */

let boatGeo = null;
let boatMat = null;

function painted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // A little grain: darker and lighter strakes along the hull.
    const k = 0.85 + 0.15 * Math.sin(g.attributes.position.getY(i) * 60 + g.attributes.position.getX(i) * 7);
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Gollum's little boat (book ch. 5): a small, crude, dark wet-wood hull about 1.25 m long, with a gunwale and a thwart,
 * built along −z (bow forward, like the bodies) with its floor at y = 0. One merged vertex-coloured mesh.
 */
export function boatMesh() {
  if (!boatMat) boatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  if (!boatGeo) {
    const L = 1.25;
    const W = 0.36;
    const D = 0.26;
    const NU = 14;
    const NV = 9;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = (i / NU) * 2 - 1; // −1 stern … 1 bow
      const w = W * Math.pow(Math.max(0, 1 - u * u), 0.55) * (u > 0 ? 1 - 0.25 * u : 1);
      const d = D * (0.75 + 0.25 * Math.sqrt(Math.max(0, 1 - u * u)));
      const sheer = 0.06 * u * u; // the ends rise
      for (let j = 0; j <= NV; j++) {
        const v = (j / NV) * Math.PI - Math.PI / 2;
        pos.push(Math.sin(v) * w, D - Math.cos(v) * d + sheer, -u * L * 0.5);
      }
    }
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j;
        const b = a + NV + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const hull = new THREE.BufferGeometry();
    hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hull.setIndex(idx);
    hull.computeVertexNormals();
    const parts = [painted(hull, 0x3a2c1e)];
    // The gunwale: a round rail along both sheer lines.
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= NU; i++) {
        const k = i * (NV + 1) + (s < 0 ? 0 : NV);
        pts.push(new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
      }
      parts.push(painted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.018, 5), 0x2a1e14));
    }
    // A thwart (Gollum's seat) and a stern board.
    const thwart = new THREE.BoxGeometry(W * 1.7, 0.03, 0.12);
    thwart.translate(0, D * 0.85, 0.12);
    parts.push(painted(thwart, 0x4a3826));
    boatGeo = mergeGeometries(parts);
    boatGeo.computeBoundingSphere();
  }
  const m = new THREE.Mesh(boatGeo, boatMat);
  m.name = 'gollum-boat';
  return m;
}

/* ---- the body ------------------------------------------------------------------------------------------------------- */

/**
 * Gollum's body. `pose` (set by the agent every frame): crawl 0..1 (on all fours; `speed` drives the gait), squat 0..1
 * (on his haunches, hands on the floor), talk 0..1 (the twitchy riddling pose; `gulp()` makes the swallow), paddle 0..1
 * (sitting in the boat, feet paddling), look (radians: the head turns towards the player), lean (extra lean forward,
 * bolder when following the Ring).
 */
export class GollumBody extends CharacterBody {
  constructor() {
    super({ id: 'gollum', name: 'Gollam' });
    this.pose = { crawl: 0, squat: 1, talk: 0, paddle: 0, speed: 0, look: 0, lean: 0 };
    this.bag.visible = false;
    this.gait = 0;
    this.gulpT = 0;
    this.glints = null;
    this.footRest = null;
    this.ready.then(() => this.rigExtras());
  }

  /** Eye glints (found from the baked eyes: the glossiest vertices) and the foot reference points for planting. */
  rigExtras() {
    if (!this.bones || !this.data) return;
    const { pos, pbr, sIdx } = this.data.raw;
    const n = pos.length / 3;
    const eye = [[0, 0, 0, 0], [0, 0, 0, 0]];
    const foot = [null, null];
    const votes = new Map();
    for (let v = 0; v < n; v++) {
      // The eyeballs are the only glossy parts (rough 0.1–0.15 → < 50 of 255).
      if (pbr[v * 4] < 50) {
        votes.set(sIdx[v * 4], (votes.get(sIdx[v * 4]) || 0) + 1);
        const e = eye[pos[v * 3] < 0 ? 0 : 1];
        e[0] += pos[v * 3];
        e[1] += pos[v * 3 + 1];
        e[2] += pos[v * 3 + 2];
        e[3]++;
      }
      const b = sIdx[v * 4];
      if (b === BONE.shinL || b === BONE.shinR) {
        const k = b === BONE.shinL ? 0 : 1;
        // The heel: the lowest vertex towards the back of the foot.
        const score = pos[v * 3 + 1] - 0.15 * pos[v * 3 + 2];
        if (!foot[k] || score < foot[k].s) foot[k] = { s: score, p: new THREE.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) };
      }
    }
    this.footRest = foot.map((f) => (f ? f.p : null));
    // The bone the eyes follow (their main skin weight).
    let eyeBone = BONE.head;
    let most = 0;
    for (const [bn, c] of votes) if (c > most) [eyeBone, most] = [bn, c];
    const headPivot = this.data.bones[eyeBone].pivot;
    const pts = [];
    for (const e of eye) {
      if (!e[3]) continue;
      // A little in front of the eyeball's centre (the body faces −z).
      pts.push(e[0] / e[3] - headPivot.x, e[1] / e[3] - headPivot.y, e[2] / e[3] - headPivot.z - 0.012);
    }
    if (pts.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.5);
      this.glints = new THREE.Points(g, glintMaterial());
      this.glints.name = 'gollum-eyes';
      this.glints.frustumCulled = false;
      this.glints.renderOrder = 3;
      this.bones[eyeBone].add(this.glints);
      this.copyLayers(this.glints);
    }
  }

  /** The swallowing noise that gave him his name ("gollum"): a jerk of the head and the shoulders. */
  gulp() {
    this.gulpT = 0.55;
  }

  /** Adds a rotation on a bone (on top of what was set this frame). */
  add(i, x, y, z) {
    tq.setFromEuler(te.set(x, y, z, 'XYZ'));
    this.bones[i].quaternion.multiply(tq);
  }

  /**
   * Poses the bones for this frame (absolute each frame: every bone is reset, then the modes add their offsets).
   * st: { dt }. Bone frame: the body faces −z; +x swings hanging bones (arms, legs) forward, −x leans the spine and
   * the head forward.
   */
  animate(st) {
    if (!this.bones) return;
    const dt = Math.min(0.05, st.dt || 0.016);
    this.t += dt;
    const t = this.t;
    const B = BONE;
    const p = this.pose;
    const b = this.bones;
    for (let i = 0; i < b.length; i++) b[i].quaternion.identity();
    b[B.hips].position.copy(this.rest[B.hips]);
    this.gulpT = Math.max(0, this.gulpT - dt);
    const crawl = clamp01(p.crawl);
    const squat = clamp01(p.squat) * (1 - crawl);
    const talk = clamp01(p.talk) * (1 - crawl);
    const paddle = clamp01(p.paddle);
    this.gait += dt * (0.6 + p.speed * 2.4) * crawl;
    const g = this.gait * Math.PI * 2;
    const s1 = Math.sin(g);
    const c1 = Math.cos(g);
    const breathe = Math.sin(t * 2.6) * 0.025;

    // ---- legs: crawl (diagonal gait with the arms), squat (knees right up), paddle (legs over the sides)
    let thL = 0.7 * squat + crawl * (0.55 + 0.35 * s1);
    let thR = 0.7 * squat + crawl * (0.55 - 0.35 * s1);
    let shL = -0.95 * squat - crawl * (0.65 + 0.3 * Math.max(0, -c1));
    let shR = -0.95 * squat - crawl * (0.65 + 0.3 * Math.max(0, c1));
    let thLz = 0;
    let thRz = 0;
    if (paddle > 0) {
      // Sitting on the thwart, each leg out over a gunwale, the big feet paddling in turn.
      const pp = t * 3.2;
      thL = thL * (1 - paddle) + paddle * (0.9 + 0.25 * Math.sin(pp));
      thR = thR * (1 - paddle) + paddle * (0.9 + 0.25 * Math.sin(pp + Math.PI));
      shL = shL * (1 - paddle) + paddle * (-0.5 - 0.45 * Math.max(0, Math.cos(pp)));
      shR = shR * (1 - paddle) + paddle * (-0.5 - 0.45 * Math.max(0, Math.cos(pp + Math.PI)));
      thLz = -0.85 * paddle;
      thRz = 0.85 * paddle;
    }
    // On all fours the whole trunk pitches forward about the hips (the thighs keep their angle to the floor).
    const hipPitch = -0.4 * crawl;
    this.add(B.hips, hipPitch, 0, 0);
    thL -= hipPitch;
    thR -= hipPitch;
    this.add(B.thighL, thL, 0, thLz - 0.1 * squat);
    this.add(B.thighR, thR, 0, thRz + 0.1 * squat);
    this.add(B.shinL, shL, 0, 0);
    this.add(B.shinR, shR, 0, 0);

    // ---- trunk: lean down on all fours, rise a little when talking, twitch
    let spine = -0.42 * crawl - 0.12 * squat + 0.22 * talk - 0.12 * paddle + breathe - (p.lean || 0);
    let spineY = crawl * 0.1 * s1;
    let spineZ = 0;
    if (talk > 0) {
      spineY += talk * 0.12 * Math.sin(t * 1.7);
      spineZ += talk * 0.05 * Math.sin(t * 2.3);
    }
    const gu = this.gulpT > 0 ? Math.sin((1 - this.gulpT / 0.55) * Math.PI) : 0;
    spine -= gu * 0.12;
    this.add(B.spine, spine, spineY, spineZ);

    // ---- arms: front legs when crawling; hands down on the floor when squatting; wringing when talking; gunwales
    const armBase = 0.62 * crawl + 0.2 * squat;
    let aL = armBase + crawl * -0.38 * s1;
    let aR = armBase + crawl * 0.38 * s1;
    let fL = -0.15 * crawl + 0.1 * squat + crawl * 0.25 * Math.max(0, s1);
    let fR = -0.15 * crawl + 0.1 * squat + crawl * 0.25 * Math.max(0, -s1);
    let aLz = 0.12 * squat;
    let aRz = -0.12 * squat;
    if (talk > 0) {
      // The long hands up at the chest, the fingers working (the "wringing" of the riddling Gollum).
      const w = Math.sin(t * 5.1) * 0.12;
      aL = aL * (1 - talk) + talk * (0.75 + w);
      aR = aR * (1 - talk) + talk * (0.72 - w);
      fL = fL * (1 - talk) + talk * (1.0 + w * 0.5);
      fR = fR * (1 - talk) + talk * (1.05 - w * 0.5);
      aLz = aLz * (1 - talk) + talk * 0.6;
      aRz = aRz * (1 - talk) - talk * 0.6;
    }
    if (paddle > 0) {
      aL = aL * (1 - paddle) + paddle * 0.35;
      aR = aR * (1 - paddle) + paddle * 0.35;
      aLz = aLz * (1 - paddle) + paddle * 0.55;
      aRz = aRz * (1 - paddle) - paddle * 0.55;
    }
    // The swallow hunches the shoulders forward.
    aL += gu * 0.15;
    aR += gu * 0.15;
    this.add(B.upperArmL, aL, 0, aLz);
    this.add(B.upperArmR, aR, 0, aRz);
    this.add(B.foreArmL, fL, 0, 0);
    this.add(B.foreArmR, fR, 0, 0);
    this.add(B.handL, 0.35 * crawl - 0.25 * talk * Math.sin(t * 7), 0, 0);
    this.add(B.handR, 0.35 * crawl + 0.25 * talk * Math.sin(t * 6.3), 0, 0);

    // ---- head: keeps the face up and forward whatever the spine does; looks at the player; twitches; swallows
    const twitch = (talk * 0.6 + 0.25) * (0.09 * Math.sin(t * 7.3) * Math.sin(t * 2.9) + 0.06 * Math.sin(t * 13.1) * (Math.sin(t * 0.9) > 0.6 ? 1 : 0));
    const look = Math.max(-1, Math.min(1, p.look || 0));
    this.add(B.head, -(spine + hipPitch) * 0.9 + 0.05 * crawl + gu * 0.35 + twitch, look * 0.8 - spineY * 0.5, twitch * 0.6 - spineZ);

    // ---- feet on the floor: lower (or raise) the hips so the lower heel touches y = 0
    this.plantFeet(paddle);
  }

  /** Forward kinematics of hips → thigh → shin for the two heels; the root moves so the lower one sits on the floor. */
  plantFeet(paddle) {
    if (!this.footRest) return;
    const d = this.data.bones;
    const b = this.bones;
    const hips = b[BONE.hips];
    let low = Infinity;
    for (const [th, sh, k] of [[BONE.thighL, BONE.shinL, 0], [BONE.thighR, BONE.shinR, 1]]) {
      const r = this.footRest[k];
      if (!r) continue;
      tv.copy(r).sub(d[sh].pivot).applyQuaternion(b[sh].quaternion);
      tv.add(tv2.copy(d[sh].pivot).sub(d[th].pivot)).applyQuaternion(b[th].quaternion);
      tv.add(tv2.copy(d[th].pivot).sub(d[BONE.hips].pivot)).applyQuaternion(hips.quaternion);
      low = Math.min(low, tv.y + d[BONE.hips].pivot.y);
    }
    if (low === Infinity) return;
    // In the boat he sits on the thwart: the hips go down to its height instead.
    const target = paddle > 0 ? -low * (1 - paddle) + (0.27 - d[BONE.hips].pivot.y + 0.06) * paddle : -low;
    hips.position.y = this.rest[BONE.hips].y + target;
  }
}
