/* ==== mirkwood-foes/elf-body.js — an Elvenking's guard's body: the baked wood-elf (tools/figbake/designs/elfguard*.mjs,
   the same SDF pipeline, 13-bone rig and shared character material as the players), a long elven knife in the right
   hand (code-built, one merged vertex-coloured mesh: a slim curved leaf blade, a gilt guard, a wrapped grip), and its
   own poses on the shared walk animation: the upright guard's stance, the knife raised when alert, reaching out to
   seize a prisoner, drawing the bow (the barrel scene's archers), the stagger after a hit. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BONE, CharacterBody } from '../characters.js';

/** The guards' baked bodies (assets/characters/<id>.json). */
export const ELF_LOOKS = [{ id: 'elfguard' }, { id: 'elfguard2' }];

let knifeMat = null;
let knifeGeo = null;
const tq = new THREE.Quaternion();
const te = new THREE.Euler();

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
 * The long elven knife (film: the wood-elves' curved long knives): along −z from the grip like the tools. Uses the
 * same material settings as the goblins' weapons (vertex colours, MeshStandard), so it shares their shader program.
 */
export function knifeMesh() {
  if (!knifeMat) knifeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.25 });
  if (!knifeGeo) {
    const parts = [];
    const put = (geo, hex, x, y, z, rx = 0, ry = 0, rz = 0) => {
      geo.rotateX(rx);
      geo.rotateY(ry);
      geo.rotateZ(rz);
      geo.translate(x, y, z);
      parts.push(painted(geo, hex));
    };
    // Grip wrapped in green-dyed leather, a gilt pommel and a leaf-shaped gilt guard.
    put(new THREE.CylinderGeometry(0.016, 0.018, 0.15, 8), 0x2e4a2a, 0, 0, 0.0, Math.PI / 2);
    for (let k = 0; k < 4; k++) put(new THREE.TorusGeometry(0.018, 0.004, 4, 10), 0x1e3018, 0, 0, -0.05 + k * 0.034);
    put(new THREE.SphereGeometry(0.022, 8, 6), 0xc49a3c, 0, 0, 0.085);
    put(new THREE.ConeGeometry(0.03, 0.05, 4), 0xc49a3c, 0.035, 0, -0.08, 0, 0, -Math.PI / 2);
    put(new THREE.ConeGeometry(0.03, 0.05, 4), 0xc49a3c, -0.035, 0, -0.08, 0, 0, Math.PI / 2);
    put(new THREE.BoxGeometry(0.05, 0.022, 0.02), 0xb08a34, 0, 0, -0.08);
    // The blade: a slim, slightly curved leaf, extruded thin with a bevelled edge, bright steel.
    const shape = new THREE.Shape();
    shape.moveTo(-0.014, 0);
    shape.quadraticCurveTo(-0.026, 0.22, -0.01, 0.46);
    shape.lineTo(0.0, 0.5);
    shape.quadraticCurveTo(0.03, 0.3, 0.016, 0);
    shape.lineTo(-0.014, 0);
    const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10 });
    blade.translate(0, 0, -0.002);
    put(blade, 0xd8dce0, 0, 0, -0.09, -Math.PI / 2, 0, Math.PI / 2);
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    knifeGeo = g;
  }
  const m = new THREE.Mesh(knifeGeo, knifeMat);
  m.name = 'elf-knife';
  return m;
}

/**
 * A guard's body. `pose` (set by the agent each frame): alert 0..1 (knife up, a wary crouch), reach 0..1 (the free
 * hand seizes), draw 0..1 (drawing the bow at the target), stagger (radians of the reel after a hit).
 */
export class ElfBody extends CharacterBody {
  constructor(look) {
    super({ id: look.id, name: 'Tünde-őr' });
    this.pose = { alert: 0, reach: 0, draw: 0, stagger: 0 };
    this.bag.visible = false;
    this.knife = knifeMesh();
    this.pick.add(this.knife);
  }

  animate(st) {
    super.animate(st);
    if (!this.bones) return;
    const B = BONE;
    const p = this.pose;
    const b = this.bones;
    const add = (i, x, y, z) => {
      tq.setFromEuler(te.set(x, y, z, 'XYZ'));
      b[i].quaternion.multiply(tq);
    };
    // Alert: the knife comes up in front, a slight forward lean, knees bent.
    if (p.alert > 0) {
      const a = p.alert;
      add(B.upperArmR, 0.7 * a, 0, 0.15 * a);
      add(B.foreArmR, 0.9 * a, 0, 0);
      add(B.spine, -0.08 * a, 0, 0);
      add(B.thighL, 0.15 * a, 0, 0);
      add(B.thighR, 0.15 * a, 0, 0);
      add(B.shinL, -0.25 * a, 0, 0);
      add(B.shinR, -0.25 * a, 0, 0);
    }
    // Seizing: the left arm out to grab a shoulder.
    if (p.reach > 0) {
      add(B.upperArmL, 1.3 * p.reach, 0, -0.15 * p.reach);
      add(B.foreArmL, 0.2 * p.reach, 0, 0);
    }
    // Drawing a bow (the archers on the river banks): the left arm straight out at the target, the right at the cheek.
    if (p.draw > 0) {
      const d = p.draw;
      add(B.upperArmL, 1.55 * d, 0, -0.1 * d);
      add(B.upperArmR, 1.4 * d, 0, 0.55 * d);
      add(B.foreArmR, 1.9 * d, 0, 0);
      add(B.head, 0, 0.25 * d, 0);
    }
    this.group.rotation.x = p.stagger;
  }
}
