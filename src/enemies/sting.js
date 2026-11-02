/* ==== enemies/sting.js — Fullánk (Sting, TERV 0.2 / 0.4 Érzékelés / 0.12): found in the trolls' cave among their
   plunder, as in the book; a special find that is kept, never sold. Once owned the hilt shows in the corner of the
   view and glows blue, with a blue screen edge, when goblins are near; the lamp's light turns blue on the walls; the
   other player sees it at the owner's hip. It is the stronger weapon (combat.js). Also Kíli's bow in the view. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BONE } from '../characters.js';
import { CAVE } from '../underground/pieces.js';
import { TROLL_FLOOR } from '../underground/sites.js';
import { raycast } from '../world.js';
import { chunkKey } from './sites.js';

/** Where Sting lies: in front of the trolls' rusty chest, among the plunder (pieces.js CAVE.chest, yaw −1.2). */
function stingSpot() {
  const [cx, cz] = CAVE.chest;
  const yaw = -1.2;
  const lx = 0.15;
  const lz = 0.75;
  const x = cx + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
  const z = cz - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
  const o = new THREE.Vector3(x, TROLL_FLOOR + 1.2, z);
  const t = raycast(o, new THREE.Vector3(0, -1, 0), 3);
  return new THREE.Vector3(x, t >= 0 ? o.y - t + 0.035 : TROLL_FLOOR + 0.05, z);
}

const BLUE = new THREE.Color(0x5a9cff);
const LAMP = new THREE.Color(0xffeedd);

/**
 * Sting as in the film: a leaf-shaped elven blade (about 50 cm, a short sword for a hobbit) with a raised midrib, a
 * crossguard whose arms curve up towards the blade, a grip bound with leather and a round pommel. Built with the blade
 * along +y from the guard at the origin. Returns { group, blade (the material that glows) }.
 */
export function buildSting(bladeMat) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const W = 0.026;
  const L = 0.5;
  // The leaf outline: narrow at the guard, widest a third up, a long point.
  shape.moveTo(-W * 0.55, 0);
  shape.bezierCurveTo(-W * 1.15, L * 0.18, -W * 1.1, L * 0.45, -W * 0.7, L * 0.72);
  shape.quadraticCurveTo(-W * 0.35, L * 0.9, 0, L);
  shape.quadraticCurveTo(W * 0.35, L * 0.9, W * 0.7, L * 0.72);
  shape.bezierCurveTo(W * 1.1, L * 0.45, W * 1.15, L * 0.18, W * 0.55, 0);
  shape.lineTo(-W * 0.55, 0);
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0035, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10 });
  blade.translate(0, 0, -0.002);
  g.add(new THREE.Mesh(blade, bladeMat));
  // The midrib.
  const rib = new THREE.BoxGeometry(0.004, L * 0.82, 0.009);
  rib.translate(0, L * 0.41, 0);
  g.add(new THREE.Mesh(rib, bladeMat));
  const silver = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.3 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 });
  // Crossguard: a bar with arms curving up towards the blade.
  const guardParts = [];
  const bar = new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8);
  bar.rotateZ(Math.PI / 2);
  guardParts.push(bar);
  for (const s of [-1, 1]) {
    const tip = new THREE.CylinderGeometry(0.006, 0.008, 0.04, 6);
    tip.rotateZ(-s * 0.7);
    tip.translate(s * 0.055, 0.014, 0);
    guardParts.push(tip);
    const knob = new THREE.SphereGeometry(0.008, 8, 6);
    knob.translate(s * 0.068, 0.03, 0);
    guardParts.push(knob);
  }
  for (const p of guardParts) p.deleteAttribute('uv');
  g.add(new THREE.Mesh(mergeGeometries(guardParts.map((p) => (p.index ? p.toNonIndexed() : p))), silver));
  const grip = new THREE.CylinderGeometry(0.012, 0.013, 0.1, 10, 5);
  grip.translate(0, -0.055, 0);
  // Leather binding: ridges along the grip.
  const gp = grip.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const y = gp.getY(i);
    const k = 1 + 0.08 * Math.abs(Math.sin(y * 160));
    gp.setX(i, gp.getX(i) * k);
    gp.setZ(i, gp.getZ(i) * k);
  }
  grip.computeVertexNormals();
  g.add(new THREE.Mesh(grip, leather));
  const pommel = new THREE.SphereGeometry(0.018, 12, 8);
  pommel.scale(1, 0.8, 0.7);
  pommel.translate(0, -0.115, 0);
  g.add(new THREE.Mesh(pommel, silver));
  return g;
}

/** A glowing-blade material (its emissive follows the goblins' nearness). */
function bladeMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xd8e0ea, metalness: 1, roughness: 0.18, emissive: 0x3a7cff, emissiveIntensity: 0 });
}

/** Kíli's recurve bow for the moment of the shot (first person, left of the view). */
function buildBow() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x4a2e1a });
  const pts = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16 - 0.5;
    pts.push(new THREE.Vector3(0.09 * (1 - 4 * t * t) - 0.03 * Math.pow(Math.abs(t * 2), 6), t * 1.1, 0));
  }
  const limb = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 6);
  g.add(new THREE.Mesh(limb, wood));
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1.1, 4), new THREE.MeshBasicMaterial({ color: 0xd8ccb0 }));
  string.position.x = -0.03;
  g.add(string);
  return g;
}

export class Sting {
  constructor(mgr) {
    this.mgr = mgr;
    this.game = mgr.game;
    // The sword lying in the troll cave (until somebody owns it).
    this.groundMat = bladeMaterial();
    this.ground = buildSting(this.groundMat);
    this.ground.name = 'sting-ground';
    this.spot = stingSpot();
    this.ground.position.copy(this.spot);
    // Lying flat among the plunder, a faint silver glint so it can be spotted in the lamplight.
    this.ground.rotation.order = 'YXZ';
    this.ground.rotation.set(-Math.PI / 2 + 0.05, 0.9, 0);
    this.groundMat.emissive.setHex(0x8aa0c0);
    this.groundMat.emissiveIntensity = 0.25;
    this.game.scene.add(this.ground);
    this.groundKey = chunkKey(this.spot.x, this.spot.y, this.spot.z);
    this.flying = null;
    this.views = new Map(); // player → { hilt, mat, edge, scabbard, body }
  }

  /** Somebody owns it (a slot of the save): the cave's copy is gone. */
  get owned() {
    return this.game.players.some((p) => p.sting) || (this.game.save?.slots || []).some((s) => s && s.sting);
  }

  /** Per view (terrain.cullFor's mask): the cave's copy shows only where its chunk can be seen. */
  cullFor(visible) {
    this.ground.visible = !this.owned && !this.flying && (this.groundKey < 0 || !!visible[this.groundKey]);
  }

  /** The owner's per-player pieces: the hilt in the view corner, the blue edge, the sword at the hip. */
  view(p, i) {
    let v = this.views.get(p);
    const hudEl = this.game.huds[i]?.el;
    if (!v) {
      const mat = bladeMaterial();
      const hilt = buildSting(mat);
      // Lower left corner: the hilt and the lower half of the blade, pointing up and in.
      const holder = new THREE.Group();
      holder.add(hilt);
      hilt.rotation.set(-1.15, 0.2, 0.35);
      holder.position.set(-0.3, -0.33, -0.46);
      holder.traverse((o) => o.layers.set(10 + p.slot));
      p.camera.add(holder);
      const bowG = buildBow();
      bowG.scale.setScalar(0.55);
      bowG.position.set(-0.24, -0.12, -0.5);
      bowG.rotation.set(0, 0.25, 0.35);
      bowG.visible = false;
      bowG.traverse((o) => o.layers.set(10 + p.slot));
      p.camera.add(bowG);
      v = { holder, hilt, mat, glow: 0, stab: 0, bow: 0, bowG, edge: null, hudEl: null, scabbard: null, body: null, ui: '' };
      this.views.set(p, v);
    }
    if (v.hudEl !== hudEl && hudEl) {
      v.edge = document.createElement('div');
      // The blue screen edge (TERV 0.12): an inset glow; only its opacity changes.
      Object.assign(v.edge.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3', opacity: '0', boxShadow: 'inset 0 0 90px 24px rgba(70,140,255,0.85)', transition: 'none' });
      hudEl.appendChild(v.edge);
      v.hudEl = hudEl;
      v.lastOp = -1;
    }
    return v;
  }

  /** Strike with Sting: the view's sword thrusts forward. */
  stab(p) {
    const v = this.views.get(p);
    if (v) v.stab = 1;
  }

  /** Kíli's shot: the bow shows for a moment. */
  bow(p) {
    const i = this.game.players.indexOf(p);
    const v = this.view(p, i);
    v.bow = 0.5;
  }

  /** Per frame: pickup in the cave, glow, view animation, edge, lamp colour, the sword at the owner's hip. */
  update(dt) {
    const game = this.game;
    // Pickup: walking up to it in the cave (it flies into the hand like every find).
    if (!this.owned && !this.flying) {
      for (const p of game.players) {
        if (p.dead > 0 || p.choosing || p.riding) continue;
        if (p.pos.distanceTo(this.spot) < 1.4) {
          this.flying = { p, t: 0, from: this.spot.clone() };
          break;
        }
      }
    }
    if (this.flying) {
      const f = this.flying;
      f.t += dt / 0.6;
      const k = Math.min(1, f.t);
      const e = k * k * (3 - 2 * k);
      this.ground.visible = true;
      this.ground.position.lerpVectors(f.from, f.p.camera.position, e);
      this.ground.position.y += Math.sin(k * Math.PI) * 0.5;
      this.ground.rotation.y += dt * 8;
      if (k >= 1) {
        this.flying = null;
        this.ground.visible = false;
        f.p.sting = true;
        f.p.say('Megtaláltad Fullánkot! Kéken izzik, ha goblinok vannak a közelben, és erősebb a csákánynál.', 6);
        f.p.say('Fullánkot nem adod el: a tiéd marad.', 4);
        this.mgr.sound('sting', f.p.pos);
        game.saveNow?.();
      }
    }
    game.players.forEach((p, i) => {
      if (!p.sting) {
        const v0 = this.views.get(p);
        if (v0) {
          v0.holder.visible = false;
          this.edge(v0, 0);
        }
        if (this.views.has(p)) this.updateBow(this.views.get(p), dt);
        return;
      }
      const v = this.view(p, i);
      // Glow: goblins within ~20 m (or a goblin night breaking out) — TERV 0.4 "Érzékelés".
      const near = this.mgr.nearestGoblin(p.pos);
      let target = near < 22 ? Math.min(1, (22 - near) / 14) : 0;
      if (this.mgr.raidWarning > 0) target = Math.max(target, 0.6);
      v.glow += (target - v.glow) * Math.min(1, dt * 3);
      const pulse = v.glow > 0.02 ? 0.85 + 0.15 * Math.sin(performance.now() / 160) : 0;
      v.mat.emissiveIntensity = v.glow * 1.3 * pulse;
      v.holder.visible = !p.riding && p.dead <= 0 && !game.bagEnd?.isInside(p);
      // The stab: thrust towards the middle of the view and back.
      v.stab = Math.max(0, v.stab - dt * 4);
      const s = Math.sin(v.stab * Math.PI);
      v.holder.position.set(-0.3 + s * 0.22, -0.33 + s * 0.16, -0.46 - s * 0.3);
      v.hilt.rotation.set(-1.15 - s * 0.35, 0.2, 0.35 - s * 0.3);
      this.edge(v, v.glow);
      // The lamp's light turns blue on the walls (TERV 0.12: blue light on the blade and the walls around).
      p.lamp.color.copy(LAMP).lerp(BLUE, v.glow * 0.65);
      this.updateBow(v, dt);
      // The sword at the owner's hip, for the other player (re-hung when the body is rebuilt: armour, character).
      if (v.body !== p.body && p.body.userData.rig?.bones) {
        v.body = p.body;
        if (v.scabbard) v.scabbard.removeFromParent();
        const smat = this.scabbardMat || (this.scabbardMat = new Map());
        if (!smat.has(p)) smat.set(p, bladeMaterial());
        v.scabbard = buildSting(smat.get(p));
        const rig = p.body.userData.rig;
        const hips = rig.bones[BONE.hips];
        // Right hip (+x here; the bag hangs on the left), hanging down and back.
        v.scabbard.position.set(0.2, -0.05, 0.06);
        v.scabbard.rotation.set(Math.PI - 0.35, 0, 0.12);
        v.scabbard.traverse((o) => o.layers.set(1 + p.slot));
        hips.add(v.scabbard);
      }
      if (this.scabbardMat?.has(p)) this.scabbardMat.get(p).emissiveIntensity = v.glow * 1.3 * pulse;
    });
  }

  updateBow(v, dt) {
    v.bow = Math.max(0, v.bow - dt);
    v.bowG.visible = v.bow > 0;
  }

  edge(v, glow) {
    if (!v.edge) return;
    const op = Math.round(glow * 20) / 20;
    if (op !== v.lastOp) {
      v.lastOp = op;
      v.edge.style.opacity = op;
    }
  }
}
