/* ==== enemies/goblin-body.js — a goblin's body: the baked film-look goblin (tools/figbake/designs/goblin*.mjs, the same
   SDF pipeline, rig and shared material as the player characters), its crude weapon in the right hand, and the extra
   poses on top of the shared walk / swing animation: the bandy crouch, the grab, carrying a stolen find, the
   flailing flight and the tumble after a hit. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BONE, CharacterBody } from '../characters.js';

/** The goblin bodies (baked files assets/characters/<id>.json) with their crude weapons. */
export const GOBLIN_LOOKS = [{ id: 'goblin', weapon: 'club' }, { id: 'goblin2', weapon: 'cleaver' }];

let weaponMaterial = null;
const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const weaponGeo = new Map();

/** A geometry with a flat vertex colour (for merging the weapon parts into one draw call). */
function painted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * The crude weapons (one merged mesh each, built along −z from the grip like the tools): a knotted club studded with
 * iron nails, or a jagged rusty cleaver on a rag-wrapped stick.
 */
export function weaponMesh(kind) {
  if (!weaponMaterial) weaponMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.25 });
  if (!weaponGeo.has(kind)) {
    const parts = [];
    const put = (geo, hex, x, y, z, rx = 0, ry = 0, rz = 0) => {
      geo.rotateX(rx);
      geo.rotateY(ry);
      geo.rotateZ(rz);
      geo.translate(x, y, z);
      parts.push(painted(geo, hex));
    };
    if (kind === 'club') {
      const shaft = new THREE.CylinderGeometry(0.05, 0.022, 0.62, 8, 4);
      // A bent, knotted branch: wobble the shaft's rings.
      const p = shaft.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setX(i, p.getX(i) + 0.012 * Math.sin(y * 9));
        p.setZ(i, p.getZ(i) + 0.01 * Math.cos(y * 7));
      }
      put(shaft, 0x4a3420, 0, 0, -0.24, Math.PI / 2);
      put(new THREE.IcosahedronGeometry(0.035, 0), 0x3a2814, 0.04, 0.0, -0.34);
      put(new THREE.IcosahedronGeometry(0.03, 0), 0x3a2814, -0.035, 0.02, -0.46);
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4;
        const z = -0.4 - (k % 3) * 0.06;
        put(new THREE.ConeGeometry(0.008, 0.07, 4), 0x5a524a, Math.cos(a) * 0.05, Math.sin(a) * 0.05, z, 0, 0, a - Math.PI / 2);
      }
      put(new THREE.TorusGeometry(0.026, 0.008, 4, 8), 0x2a2018, 0, 0, -0.02);
    } else {
      put(new THREE.CylinderGeometry(0.02, 0.022, 0.3, 6), 0x3a2a1a, 0, 0, -0.1, Math.PI / 2);
      put(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 6), 0x5a4e3a, 0, 0, -0.04, Math.PI / 2);
      // The blade: a jagged, notched slab, wider at the tip.
      const shape = new THREE.Shape();
      shape.moveTo(-0.025, 0);
      shape.lineTo(-0.035, 0.12);
      shape.lineTo(-0.02, 0.15);
      shape.lineTo(-0.04, 0.24);
      shape.lineTo(-0.03, 0.34);
      shape.lineTo(0.06, 0.38);
      shape.lineTo(0.075, 0.3);
      shape.lineTo(0.06, 0.26);
      shape.lineTo(0.07, 0.14);
      shape.lineTo(0.035, 0.0);
      const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
      blade.translate(0, 0, -0.006);
      put(blade, 0x6a5040, 0, 0, -0.25, -Math.PI / 2, 0, Math.PI / 2);
      put(new THREE.BoxGeometry(0.11, 0.03, 0.03), 0x3a3430, 0, 0, -0.25);
    }
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    weaponGeo.set(kind, g);
  }
  const m = new THREE.Mesh(weaponGeo.get(kind), weaponMaterial);
  m.name = `goblin-${kind}`;
  return m;
}

/**
 * A goblin's body. `pose` (set by the agent each frame): crouch 0..1, reach 0..1 (arms out to grab), carry 0..1 (the
 * left hand holds a stolen find up), flail 0..1 (running away), tumble (radians of the fall after a hit).
 */
export class GoblinBody extends CharacterBody {
  constructor(look) {
    super({ id: look.id, name: 'Goblin' });
    this.pose = { crouch: 1, reach: 0, carry: 0, flail: 0, tumble: 0 };
    // Goblins carry no sack (the players' bag on the hip).
    this.bag.visible = false;
    this.weapon = weaponMesh(look.weapon);
    this.pick.add(this.weapon);
    // The stolen find rides in the left hand (filled by the agent).
    this.loot = new THREE.Group();
    this.loot.name = 'goblin-loot';
    this.ready.then(() => {
      if (!this.bones) return;
      const hand = this.bones[BONE.handL];
      hand.add(this.loot);
      this.loot.position.set(0, -0.12, 0.02);
    });
  }

  /** The shared animation, then the goblin's own pose offsets on the bones (absolute each frame, no drift). */
  animate(st) {
    super.animate(st);
    if (!this.bones) return;
    const B = BONE;
    const p = this.pose;
    const b = this.bones;
    const t = this.t;
    const add = (i, x, y, z) => {
      tq.setFromEuler(te.set(x, y, z, 'XYZ'));
      b[i].quaternion.multiply(tq);
    };
    // Bandy, bent-kneed crouch; the hips sink.
    const c = p.crouch;
    add(B.thighL, 0.32 * c, 0, -0.12 * c);
    add(B.thighR, 0.32 * c, 0, 0.12 * c);
    add(B.shinL, -0.55 * c, 0, 0);
    add(B.shinR, -0.55 * c, 0, 0);
    b[B.hips].position.y -= 0.025 * c; // the bent knees lower the hips by about this much
    add(B.spine, -0.12 * c, 0, 0);
    // Grab: both arms thrust forward, claws open.
    if (p.reach > 0) {
      const r = p.reach;
      add(B.upperArmL, 1.25 * r, 0, -0.25 * r);
      add(B.upperArmR, 1.1 * r, 0, 0.2 * r);
      add(B.foreArmL, 0.25 * r, 0, 0);
      add(B.foreArmR, 0.3 * r, 0, 0);
    }
    // Carrying the loot: the left hand clutches it up at the chest.
    if (p.carry > 0) {
      add(B.upperArmL, 0.6 * p.carry, 0, -0.2 * p.carry);
      add(B.foreArmL, 1.4 * p.carry, 0, 0);
    }
    // Flight: arms flail over the head.
    if (p.flail > 0) {
      const f = p.flail;
      add(B.upperArmR, (1.6 + 0.5 * Math.sin(t * 17)) * f, 0, 0.3 * f);
      if (p.carry <= 0) add(B.upperArmL, (1.4 + 0.5 * Math.sin(t * 15 + 1)) * f, 0, -0.3 * f);
      add(B.head, 0.25 * f, 0.3 * Math.sin(t * 9) * f, 0);
    }
    // Head bobbing and twitching (goblins never keep still).
    add(B.head, 0.06 * Math.sin(t * 5.3), 0.12 * Math.sin(t * 2.1) * (1 - p.flail), 0.05 * Math.sin(t * 3.7));
    this.group.rotation.x = p.tumble;
  }
}
