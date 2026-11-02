/* ==== enemies/combat.js — drive-off combat (TERV 0.4 Harc): the pick (or Sting) on a goblin, thrown stones, Kíli's
   arrows and Bombur's charge. Nobody is killed: a hit knocks a goblin back, makes it tumble, drop what it stole, let
   go of a held friend and run. Stones and arrows are pooled instanced meshes (one draw call each, only while one
   flies). Stones: a pocket of 10, one back with every swing that bites the soil (so in practice unlimited, but tied to
   digging; no bag space). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER } from '../config.js';
import { sdf } from '../world.js';

export const COMBAT = {
  stonesMax: 10,
  stoneSpeed: 15,
  stoneCooldown: 0.45,
  arrowSpeed: 34,
  arrowCooldown: 0.8,
  chargeTime: 0.7,
  chargeCooldown: 4,
  chargeSpeed: 8,
  reach: PLAYER.reach,
  stingReach: PLAYER.reach + 0.3,
  /** Hit strength (1 = the pick). */
  power: { pick: 1, sting: 1.7, stone: 0.7, arrow: 1.2, charge: 2.2 },
};

const STONES = 24;
const ARROWS = 16;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const Z = new THREE.Vector3(0, 0, 1);

/** An arrow along +z (tip at +z): shaft, iron head, grey fletching; one merged geometry. */
export function arrowGeometry() {
  const parts = [];
  const shaft = new THREE.CylinderGeometry(0.006, 0.006, 0.7, 5);
  shaft.rotateX(Math.PI / 2);
  parts.push(shaft);
  const head = new THREE.ConeGeometry(0.016, 0.07, 4);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, 0.38);
  parts.push(head);
  for (let k = 0; k < 3; k++) {
    const f = new THREE.PlaneGeometry(0.03, 0.12);
    f.rotateY(Math.PI / 2);
    f.rotateZ((k * Math.PI * 2) / 3);
    f.translate(0, 0, -0.29);
    parts.push(f);
  }
  for (const p of parts) p.deleteAttribute('uv');
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

export class Combat {
  constructor(mgr) {
    this.mgr = mgr;
    this.game = mgr.game;
    const scene = this.game.scene;
    const stoneGeo = new THREE.IcosahedronGeometry(0.055, 0);
    stoneGeo.scale(1, 0.8, 1.15);
    this.stoneMesh = new THREE.InstancedMesh(stoneGeo, new THREE.MeshLambertMaterial({ color: 0x7a7468 }), STONES);
    this.arrowMesh = new THREE.InstancedMesh(arrowGeometry(), new THREE.MeshLambertMaterial({ color: 0x6a5238, side: THREE.DoubleSide }), ARROWS);
    for (const m of [this.stoneMesh, this.arrowMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false;
      scene.add(m);
    }
    this.stones = Array.from({ length: STONES }, () => ({ live: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), by: null, power: 1, rest: 0, spin: Math.random() * 6 }));
    this.arrows = Array.from({ length: ARROWS }, () => ({ live: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), by: null, stuck: 0 }));
  }

  /* ---------------- player actions ---------------- */

  /**
   * The dig button with a goblin in front (player.tryDig asks first): the pick, or Sting once owned. Returns true when
   * a goblin was struck (then no digging happens this swing).
   */
  strike(p, o, d) {
    const sting = !!p.sting;
    const reach = sting ? COMBAT.stingReach : COMBAT.reach;
    const g = this.mgr.goblinOnRay(o, d, reach, 0.42);
    if (!g) return false;
    let power = sting ? COMBAT.power.sting : COMBAT.power.pick;
    // Thorin strikes harder (TERV 0.4; Orcrist comes later).
    if (p.ch.id === 'thorin') power *= 1.4;
    g.hit(p.pos.x, p.pos.z, power, sting ? 'sting' : 'pick');
    if (sting) this.mgr.sting.stab(p);
    p.kick = 0.7;
    this.mgr.sound(sting ? 'sting' : 'thwack', g.pos);
    this.mgr.hinted(p, 'hit');
    return true;
  }

  /** Throws a stone from the pocket (Bilbo throws harder and straighter: the book's stone-throwing Bilbo). */
  throwStone(p) {
    if ((p.stoneCd || 0) > 0) return;
    if ((p.stones ?? COMBAT.stonesMax) <= 0) {
      p.say('Elfogytak a köveid. Áss egy kicsit: minden csákányütés ad egyet.', 3);
      return;
    }
    const s = this.stones.find((x) => !x.live);
    if (!s) return;
    p.stones = (p.stones ?? COMBAT.stonesMax) - 1;
    p.stoneCd = COMBAT.stoneCooldown;
    const bilbo = p.ch.id === 'bilbo';
    p.eye(s.pos);
    p.forward(tmpV);
    s.pos.addScaledVector(tmpV, 0.35);
    s.pos.y -= 0.12;
    s.vel.copy(tmpV).multiplyScalar(COMBAT.stoneSpeed * (bilbo ? 1.25 : 1)).add(tmpW.set(p.vel.x * 0.5, 1.2, p.vel.z * 0.5));
    s.by = p;
    s.power = COMBAT.power.stone * (bilbo ? 1.6 : 1);
    s.live = 4;
    s.rest = 0;
    p.swing = Math.max(p.swing, 0.6);
    this.mgr.sound('throw', s.pos);
    this.mgr.hinted(p, 'throw');
  }

  /** The character's own ability: Kíli's bow, Bombur's charge (Bilbo's Ring comes later; the others have none). */
  ability(p) {
    if ((p.abilityCd || 0) > 0) return;
    if (p.ch.id === 'kili') return this.shootArrow(p);
    if (p.ch.id === 'bombur') return this.charge(p);
    // Bilbo's slot is the Ring once it is found (gollum/ index.js input handles `ringPressed`, the same key).
    if (p.ch.id === 'bilbo' && this.game.gollum?.ringFound()) return;
    if (p.ch.id === 'bilbo') p.say('A Gyűrűt még nem találtad meg… Dobj követ: abban jó vagy.', 3);
    else if (p.ch.id === 'thorin') p.say('Thorin ereje az ütésében van: csákánnyal erősebben üt.', 3);
    else p.say('Nincs külön képességed: üss a csákánnyal, vagy dobj követ.', 3);
    p.abilityCd = 1;
  }

  shootArrow(p) {
    const a = this.arrows.find((x) => !x.live);
    if (!a) return;
    p.abilityCd = COMBAT.arrowCooldown;
    p.eye(a.pos);
    p.forward(tmpV);
    a.pos.addScaledVector(tmpV, 0.4);
    a.pos.y -= 0.06;
    a.vel.copy(tmpV).multiplyScalar(COMBAT.arrowSpeed);
    a.by = p;
    a.live = 3;
    a.stuck = 0;
    this.mgr.sting.bow(p);
    this.mgr.sound('bow', a.pos);
  }

  charge(p) {
    if (!p.grounded) return;
    p.abilityCd = COMBAT.chargeCooldown;
    p.dashT = COMBAT.chargeTime;
    p.dashSpeed = COMBAT.chargeSpeed;
    p.say('Bombur rohan!', 1.5);
    this.mgr.sound('charge', p.pos);
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    const mgr = this.mgr;
    for (const p of this.game.players) {
      p.stoneCd = Math.max(0, (p.stoneCd || 0) - dt);
      p.abilityCd = Math.max(0, (p.abilityCd || 0) - dt);
      // Bombur's charge bowls over every goblin in his path.
      if (p.dashT > 0) {
        tmpV.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        for (const g of mgr.allFoes()) {
          if (g.state === 'stunned' || g.state === 'gone' || g.unhittable) continue;
          const dx = g.pos.x - p.pos.x;
          const dz = g.pos.z - p.pos.z;
          const ahead = dx * tmpV.x + dz * tmpV.z;
          if (ahead > -0.2 && ahead < 1.2 && Math.hypot(dx, dz) < 1.25 && Math.abs(g.pos.y - p.pos.y) < 1.3) {
            g.hit(p.pos.x, p.pos.z, COMBAT.power.charge, 'charge');
            if (g.body?.pose) g.body.pose.tumble = 1.2;
            mgr.sound('thwack', g.pos);
          }
        }
      }
    }
    this.updateStones(dt);
    this.updateArrows(dt);
  }

  updateStones(dt) {
    const mgr = this.mgr;
    let n = 0;
    for (const s of this.stones) {
      if (!s.live) continue;
      s.live -= dt;
      if (s.live <= 0) {
        s.live = 0;
        continue;
      }
      if (!s.rest) {
        // Two substeps: a fast stone must not skip through a goblin or a thin wall.
        for (let k = 0; k < 2; k++) {
          s.vel.y -= 9.8 * dt * 0.5;
          s.pos.addScaledVector(s.vel, dt * 0.5);
          const g = mgr.goblinNear(s.pos, 0.42);
          if (g) {
            g.hit(s.pos.x - s.vel.x, s.pos.z - s.vel.z, s.power, 'stone');
            mgr.sound('clonk', s.pos);
            if (s.by) mgr.hinted(s.by, 'stone-hit');
            s.vel.multiplyScalar(-0.2);
            s.rest = 1;
            s.live = Math.min(s.live, 1.2);
            break;
          }
          if (sdf(s.pos.x, s.pos.y, s.pos.z) > 0) {
            s.pos.addScaledVector(s.vel, -dt * 0.5);
            s.vel.set(0, 0, 0);
            s.rest = 1;
            s.live = Math.min(s.live, 1.5);
            mgr.sound('tick', s.pos);
            break;
          }
        }
        s.spin += dt * 12;
      } else if (sdf(s.pos.x, s.pos.y - 0.06, s.pos.z) <= 0) {
        s.vel.y -= 9.8 * dt;
        s.pos.addScaledVector(s.vel, dt);
      }
      tmpQ.setFromAxisAngle(tmpW.set(0.3, 1, 0.2).normalize(), s.spin);
      tmpM.compose(s.pos, tmpQ, ONE);
      this.stoneMesh.setMatrixAt(n++, tmpM);
    }
    this.stoneMesh.count = n;
    this.stoneMesh.visible = n > 0;
    if (n) this.stoneMesh.instanceMatrix.needsUpdate = true;
  }

  updateArrows(dt) {
    const mgr = this.mgr;
    let n = 0;
    for (const a of this.arrows) {
      if (!a.live) continue;
      a.live -= dt;
      if (a.live <= 0) {
        a.live = 0;
        continue;
      }
      if (!a.stuck) {
        for (let k = 0; k < 4; k++) {
          a.vel.y -= 4 * dt * 0.25;
          a.pos.addScaledVector(a.vel, dt * 0.25);
          const g = mgr.goblinNear(a.pos, 0.4);
          if (g) {
            g.hit(a.pos.x - a.vel.x, a.pos.z - a.vel.z, COMBAT.power.arrow, 'arrow');
            mgr.sound('clonk', a.pos);
            a.live = 0;
            break;
          }
          if (sdf(a.pos.x, a.pos.y, a.pos.z) > 0) {
            a.stuck = 1;
            a.live = 6;
            mgr.sound('tick', a.pos);
            break;
          }
        }
        if (!a.live) continue;
      }
      tmpV.copy(a.vel).normalize();
      tmpQ.setFromUnitVectors(Z, tmpV);
      tmpM.compose(a.pos, tmpQ, ONE);
      this.arrowMesh.setMatrixAt(n++, tmpM);
    }
    this.arrowMesh.count = n;
    this.arrowMesh.visible = n > 0;
    if (n) this.arrowMesh.instanceMatrix.needsUpdate = true;
  }
}
