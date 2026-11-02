/* ==== home-events/marks.js — Gandalf's visit drawn, not only told (NOTES-19-ui):
   - his sign on Bag End's round green door (book ch. 1: "a queer sign on the hobbit's beautiful green front-door",
     scratched with the point of his staff), drawn as the "G" rune of the Old English futhorc that Tolkien used on
     Thrór's map (ᚷ, ui/runes.js) [ellenőrizendő: the exact shape; the film's glowing mark is drawn differently]. It
     glows faintly blue, as in the film. Built once into the surface scene, shown while the sign is there.
   - his smoke rings in the hall during the visit (book ch. 1; the caption: a small ring slips through a big one, then
     they drift off towards the door) and the pipe they come from. Built once into Bag End's interior scene, hidden;
     animated only while the "Füstkarikák" caption is up (no idle per-frame work).
   No textures but one 64 px glow made at start-up; MeshBasicMaterial throughout (no lights, no shader variants). ==== */
import * as THREE from 'three';
import { BAG_END } from '../surface/bagend.js';

/** The door (surface/bagend.js roundDoor: R 0.9, its centre 0.94 m up, the face 0.09 m out of the hill). */
const DOOR = { R: 0.9, cy: 0.94, face: 0.096 };
/** The rune on the door, local to the door's centre (x to the right as seen from the garden, y up): centre, size. */
const RUNE = { x: -0.36, y: 0.3, s: 0.3 };
/** The futhorc G (ᚷ): two scratched strokes crossing, a little uneven, as if cut with a staff's point. */
const STROKES = [
  [[-0.46, -0.5], [0.44, 0.52]],
  [[-0.42, 0.48], [0.5, -0.46]],
];

/** Smoke rings: [launch time s, size, speed] — big, small (through the big one), big, small. Lifetime in s. */
const RINGS = [[0.2, 1, 0.3], [1.25, 0.5, 0.62], [3.1, 1, 0.3], [4.1, 0.5, 0.62]];
const RING_LIFE = 4.6;

/** A soft round glow (radial gradient), baked once. */
function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(170,215,255,0.9)');
  gr.addColorStop(0.35, 'rgba(120,180,255,0.35)');
  gr.addColorStop(1, 'rgba(90,150,255,0)');
  cx.fillStyle = gr;
  cx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One merged geometry of the rune's strokes (thin boxes), `w` wide and `d` deep, in the door's local frame. */
function runeGeometry(w, d, z) {
  const parts = STROKES.map(([a, b]) => {
    const ax = a[0] * RUNE.s;
    const ay = a[1] * RUNE.s;
    const bx = b[0] * RUNE.s;
    const by = b[1] * RUNE.s;
    const len = Math.hypot(bx - ax, by - ay);
    const g = new THREE.BoxGeometry(len, w, d);
    g.rotateZ(Math.atan2(by - ay, bx - ax));
    g.translate(RUNE.x + (ax + bx) / 2, DOOR.cy + RUNE.y + (ay + by) / 2, z);
    return g;
  });
  const out = new THREE.BufferGeometry();
  const pos = [];
  const idx = [];
  for (const g of parts) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    for (const i of g.index.array) idx.push(base + i);
    g.dispose();
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

/** Gandalf's sign on the door: a group in the surface scene at Bag End's door, hidden until the sign is scratched. */
export function buildDoorMark(scene) {
  const g = new THREE.Group();
  g.name = 'gandalf-door-mark';
  g.position.set(BAG_END.x, 0, BAG_END.z);
  g.rotation.y = BAG_END.yaw;
  // The scratch itself: a darker groove in the green paint.
  const groove = new THREE.Mesh(runeGeometry(0.03, 0.004, DOOR.face), new THREE.MeshBasicMaterial({ color: 0x18301a, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  // The faint blue light in it (additive, so it reads by day and glows at night).
  const lineMat = new THREE.MeshBasicMaterial({
    color: 0x8ccfff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const line = new THREE.Mesh(runeGeometry(0.012, 0.004, DOOR.face + 0.002), lineMat);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Sprite(glowMat);
  glow.position.set(RUNE.x, DOOR.cy + RUNE.y, DOOR.face + 0.03);
  glow.scale.setScalar(RUNE.s * 1.7);
  g.add(groove, line, glow);
  g.visible = false;
  scene.add(g);
  return g;
}

/**
 * Gandalf's smoke rings and his pipe, in the interior's local frame (root at the interior origin). `start(at, yaw)`
 * places them at his mouth and begins; `update(dt)` animates (only while running); `stop()` hides them.
 */
export class SmokeRings {
  constructor(scene, origin) {
    this.root = new THREE.Group();
    this.root.name = 'gandalf-smoke-rings';
    this.root.position.copy(origin);
    this.root.visible = false;
    // The pipe: a long clay-brown stem and a bowl, held at the mouth.
    const pipeMat = new THREE.MeshBasicMaterial({ color: 0x5a3a20 });
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.26, 5);
    stem.rotateX(Math.PI / 2 - 0.25);
    stem.translate(0, -0.03, 0.12);
    const bowl = new THREE.CylinderGeometry(0.028, 0.02, 0.06, 7);
    bowl.translate(0, 0.0, 0.25);
    this.pipe = new THREE.Group();
    this.pipe.add(new THREE.Mesh(stem, pipeMat), new THREE.Mesh(bowl, pipeMat));
    this.root.add(this.pipe);
    // The rings: one shared torus, one material each (its own fade).
    const geo = new THREE.TorusGeometry(0.13, 0.022, 6, 18);
    this.rings = RINGS.map(([t0, size, speed]) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xd8d8d4, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      this.root.add(m);
      return { m, t0, size, speed };
    });
    this.mouth = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.t = 0;
    this.running = false;
    scene.add(this.root);
  }

  /** Begins at local `mouth` (Vector3), facing yaw (radians, 0 = +z). */
  start(mouth, yaw) {
    this.mouth.copy(mouth);
    this.dir.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.pipe.position.copy(mouth);
    this.pipe.rotation.set(0, yaw, 0);
    this.t = 0;
    this.running = true;
    this.root.visible = true;
    this.update(0);
  }

  stop() {
    this.running = false;
    this.root.visible = false;
    for (const r of this.rings) r.m.visible = false;
  }

  /** Per frame while running: each ring leaves the mouth, drifts forward and up, grows and fades. */
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    for (const r of this.rings) {
      const a = this.t - r.t0;
      if (a < 0 || a > RING_LIFE) {
        r.m.visible = false;
        continue;
      }
      const k = a / RING_LIFE;
      // Forward from the mouth, rising and slowing, then turning back over his head towards the door (−dir).
      const fwd = r.speed * a - 0.07 * a * a;
      r.m.position.set(this.mouth.x + this.dir.x * fwd, this.mouth.y + 0.06 + 0.16 * a, this.mouth.z + this.dir.z * fwd);
      r.m.rotation.set(0.25 * Math.sin(a * 1.3), Math.atan2(this.dir.x, this.dir.z), 0);
      r.m.scale.setScalar(r.size * (1 + 0.55 * a));
      r.m.material.opacity = 0.62 * Math.min(1, a / 0.3) * (1 - k * k);
      r.m.visible = true;
    }
  }
}
