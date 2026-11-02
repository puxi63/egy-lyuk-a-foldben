/* ==== underground/mirkwood-fx.js — what moves or changes in the roots of Mirkwood (layer 6):
   - the WEBS: thick sheets of spider web between the roots (one merged mesh, alpha-tested, not blended: no sorting and
     no overdraw cost beyond the sheets' own pixels; drawn after the terrain so hidden parts are rejected early);
   - the CELL DOORS of the Elvenking's dungeon (one instanced mesh, their colliders) and the TRAPDOOR's hatch over the
     river: the barrel-escape / elves work opens and shuts them (setCellDoor, setTrapdoor); all open… the doors stand
     open and the hatch is shut in a new session (nothing of them is saved here);
   - the ELVES' FEAST LIGHTS (book ch. 8; TERV 0.11 #24): three glowing clearings in the root hall. Whoever rushes at one
     (faster than a sneak, within 10 m) puts its lights out for a while; whoever creeps up to its middle (sneaking:
     the crouch key, Shift / C / LB, or a gently pushed stick) finds what the feast left: a treasure, once per clearing
     and game (saved: save.js `mirkwood`).
   Wiring: decor.js builds it (after the Kit; its colliders join the prop field) and calls update(dt, players). ==== */
import * as THREE from 'three';
import { buildFlames } from './goblin-fx.js';
import { box, colorize } from './kit.js';
import { CELLS6, FEASTS, HF, TRAPDOOR, WEB_SHEETS } from './mirkwood-sites.js';
import { FIND_TYPES } from '../finds.js';

/** Rushing speed (m/s towards a clearing) that puts its lights out (walking is 3.6, sneaking 1.5), and the reach. */
const RUSH = { speed: 2.2, hold: 0.22, reach: 10, out: 45, find: 1.7 };
/** What each clearing's feast left behind (find ids of layer 6). */
const TREASURE = [['ezustlevel', 'tundebor'], ['feherko'], ['serleg', 'tundebor']];

/** A procedural web texture: radial threads, a spiral, and a tangle of strands (the sheets are thick). */
function webTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineCap = 'round';
  const cx = S * 0.45;
  const cy = S * 0.52;
  g.lineWidth = 1.6;
  const spokes = 18;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rnd() * 0.1;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * S, cy + Math.sin(a) * S);
    g.stroke();
  }
  g.lineWidth = 1.2;
  g.beginPath();
  for (let t = 0; t < 26 * Math.PI; t += 0.08) {
    const r = 6 + t * 1.55;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;
    if (t === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  // The tangle: long sagging strands every which way (Mirkwood's webs are thick, grey sheets, not neat orbs).
  g.lineWidth = 1.3;
  for (let i = 0; i < 70; i++) {
    const x0 = rnd() * S;
    const y0 = rnd() * S;
    const a = rnd() * Math.PI;
    const l = 40 + rnd() * 160;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(x0 + Math.cos(a) * l * 0.5, y0 + Math.sin(a) * l * 0.5 + 10, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l);
    g.stroke();
  }
  // Clumps where strands gather.
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, 1.5 + rnd() * 2.5, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The web sheets (WEB_SHEETS) as one mesh: per sheet a sagging 4 × 4 grid facing its normal. */
function buildWebs() {
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  const n = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (const w of WEB_SHEETS) {
    n.set(w.nx, w.ny, w.nz).normalize();
    right.set(0, 1, 0).cross(n);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    right.normalize();
    up.crossVectors(n, right).normalize();
    const base = pos.length / 3;
    const G = 4;
    for (let j = 0; j <= G; j++) {
      for (let i = 0; i <= G; i++) {
        const u = i / G - 0.5;
        const v = j / G - 0.5;
        // Sag: the middle hangs down and bellies out a little.
        const sag = (1 - 4 * u * u) * (1 - 4 * v * v);
        const px = w.x + right.x * u * w.w + up.x * v * w.h + n.x * sag * 0.18;
        const py = w.y + right.y * u * w.w + up.y * v * w.h - sag * 0.25;
        const pz = w.z + right.z * u * w.w + up.z * v * w.h + n.z * sag * 0.18;
        pos.push(px, py, pz);
        nor.push(n.x, n.y, n.z);
        uv.push((u + 0.5) * w.w * 0.4, (v + 0.5) * w.h * 0.4);
      }
    }
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const a = base + j * (G + 1) + i;
        idx.push(a, a + 1, a + G + 1, a + 1, a + G + 2, a + G + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: webTexture(), color: 0xc8cac4, emissive: 0x0c0e0c, alphaTest: 0.45, side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat);
  m.matrixAutoUpdate = false;
  m.renderOrder = 1;
  m.name = 'l6-webs';
  return m;
}

/** A cell door: vertical planks, two iron bands, a small barred window; hinge at the origin, the leaf along +z. */
function doorGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const p = box(0.07, 1.98, 0.185);
    p.translate(0, 0.99, 0.1 + i * 0.19);
    colorize(p, i % 2 ? [0.42, 0.29, 0.17] : [0.38, 0.26, 0.15], 0.1);
    parts.push(p);
  }
  for (const y of [0.4, 1.55]) {
    const b = box(0.09, 0.07, 0.94);
    b.translate(0, y, 0.48);
    colorize(b, [0.16, 0.16, 0.17], 0.04);
    parts.push(b);
  }
  for (let i = 0; i < 3; i++) {
    const b = box(0.1, 0.32, 0.025);
    b.translate(0, 1.6, 0.36 + i * 0.12);
    colorize(b, [0.13, 0.13, 0.14], 0.04);
    parts.push(b);
  }
  for (const p of parts) if (p.index) parts[parts.indexOf(p)] = p.toNonIndexed();
  const g = new THREE.BufferGeometry();
  const merged = { position: [], normal: [], uv: [], color: [] };
  for (const p of parts) for (const k of Object.keys(merged)) merged[k].push(...p.attributes[k].array);
  g.setAttribute('position', new THREE.Float32BufferAttribute(merged.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(merged.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(merged.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(merged.color, 3));
  return g;
}

/** The feast's flames with a fade (the goblin flame shader, its colour scaled by uFade). */
function feastFlames(list) {
  const m = buildFlames(list);
  m.name = 'l6-feast-flames';
  const mat = m.material;
  mat.uniforms.uFade = { value: 1 };
  mat.fragmentShader = mat.fragmentShader
    .replace('uniform float uTime;', 'uniform float uTime;\n  uniform float uFade;')
    .replace(/gl_FragColor = vec4\(([^;]*), 1\.0\);/g, 'gl_FragColor = vec4(($1) * uFade, 1.0);');
  return m;
}

/** A small chest with its lid thrown back and treasure glinting in it (shown once the clearing is found). */
function chest(mats) {
  const g = new THREE.Group();
  const body = box(0.55, 0.32, 0.36);
  body.translate(0, 0.16, 0);
  colorize(body, [0.36, 0.24, 0.14], 0.1);
  const lid = box(0.55, 0.06, 0.36);
  lid.translate(0, 0.03, 0.18);
  lid.rotateX(-1.9);
  lid.translate(0, 0.32, -0.18);
  colorize(lid, [0.34, 0.22, 0.13], 0.1);
  g.add(new THREE.Mesh(body, mats.wood), new THREE.Mesh(lid, mats.wood));
  const gold = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshLambertMaterial({ color: 0xd8d8e0, emissive: 0x3a3a44 }));
  gold.scale.set(1.5, 0.35, 0.9);
  gold.position.y = 0.3;
  g.add(gold);
  return g;
}

export class MirkwoodFx {
  /**
   * @param {THREE.Object3D} group the layer's decor group
   * @param {object} mats decor.js's shared materials
   * @param {object[]} colliders decor.js's collider list (the doors' and the hatch's join it)
   * @param {object[]} feast per clearing { poles, fire, chest } from mirkwood-pieces.js
   * @param {Float32Array} fires the layer's fire list (x, y, z, strength, phase); `feastFire[i]` indexes into it
   * @param {number[]} feastFire per clearing, the index of its first fire in `fires` (central fire, then poles)
   */
  constructor(group, mats, colliders, feast, fires, feastFire) {
    this.group = group;
    this.webs = buildWebs();
    group.add(this.webs);
    // ---- the cell doors ----
    this.doors = new THREE.InstancedMesh(doorGeometry(), mats.wood, CELLS6.length);
    this.doors.name = 'l6-cell-doors';
    this.doors.frustumCulled = false;
    this.doorOpen = CELLS6.map(() => true);
    this.doorAngle = CELLS6.map((c) => (c.side < 0 ? -Math.PI / 2 : Math.PI / 2));
    this.doorColliders = CELLS6.map((c) => {
      const col = { t: 'box', x: c.doorX, y: HF + 1.0, z: c.zc, hx: 0.06, hy: 1.0, hz: 0.48, c: 1, s: 0, br: Math.hypot(0.06, 1.0, 0.48), on: false };
      colliders.push(col);
      return col;
    });
    group.add(this.doors);
    // ---- the trapdoor's hatch ----
    const hatch = box(TRAPDOOR.half * 2, 0.06, TRAPDOOR.half * 2);
    hatch.translate(0, 0, TRAPDOOR.half);
    colorize(hatch, [0.36, 0.25, 0.15], 0.12);
    this.hatch = new THREE.Mesh(hatch, mats.wood);
    this.hatch.name = 'l6-trapdoor';
    this.hatch.position.set(TRAPDOOR.x, HF - 0.01, TRAPDOOR.z - TRAPDOOR.half);
    group.add(this.hatch);
    this.hatchCollider = { t: 'box', x: TRAPDOOR.x, y: HF - 0.04, z: TRAPDOOR.z, hx: TRAPDOOR.half, hy: 0.05, hz: TRAPDOOR.half, c: 1, s: 0, br: Math.hypot(TRAPDOOR.half, 0.05, TRAPDOOR.half), on: true };
    colliders.push(this.hatchCollider);
    this.trapOpen = false;
    this.hatchAngle = 0;
    // ---- the feast lights ----
    this.fires = fires;
    this.feasts = FEASTS.map((f, i) => {
      const d = feast[i];
      const flames = feastFlames([[...d.fire, 0.55, i * 2.1], ...d.poles.map((p, k) => [...p, 0.3, i + k])]);
      group.add(flames);
      const c = chest(mats);
      c.position.set(d.chest[0], d.chest[1], d.chest[2]);
      c.rotation.y = 0.4 + i;
      c.visible = false;
      group.add(c);
      const base = fires.slice(feastFire[i] * 5, (feastFire[i] + 1 + d.poles.length) * 5).filter((_, k) => k % 5 === 3);
      return { ...f, flames, chest: c, fade: 1, on: true, outT: 0, found: false, fire0: feastFire[i], nFires: 1 + d.poles.length, base, rush: new Map() };
    });
    this.dirty = true;
    this.time = 0;
  }

  /** Shows or hides web sheet i (WEB_SHEETS order): a sheet cut by the foes (mirkwood-foes/webs.js) is hidden. */
  setWeb(i, on) {
    const idx = this.webs.geometry.index;
    if (!this.webIdx) this.webIdx = idx.array.slice();
    const per = 96;
    if (i < 0 || (i + 1) * per > idx.count) return;
    for (let k = i * per; k < (i + 1) * per; k++) idx.array[k] = on ? this.webIdx[k] : this.webIdx[i * per];
    idx.needsUpdate = true;
  }

  /** Opens or shuts a cell's door (index into the provider's `cells`). A shut door blocks (collider). */
  setCellDoor(i, open) {
    if (i < 0 || i >= CELLS6.length) return;
    this.doorOpen[i] = !!open;
    this.dirty = true;
  }

  /** Opens or shuts the trapdoor's hatch over the river (open: the hole drops into the water 6 m below). */
  setTrapdoor(open) {
    this.trapOpen = !!open;
    this.dirty = true;
  }

  /** True while cell i's door is shut (or swinging shut). */
  cellDoorShut(i) {
    return !this.doorOpen[i];
  }

  /** Meshes for decor.js's per-view culling. */
  culledMeshes() {
    return [this.webs, ...this.feasts.map((f) => f.flames)];
  }

  /** The feast state for the save: which clearings' treasures were found. */
  state() {
    return { feasts: this.feasts.map((f) => (f.found ? 1 : 0)) };
  }

  restore(s) {
    if (!s || !Array.isArray(s.feasts)) return;
    this.feasts.forEach((f, i) => {
      f.found = !!s.feasts[i];
      f.chest.visible = f.found;
    });
  }

  /** Per frame: the doors and the hatch swing, the feast lights watch the players. */
  update(dt, players) {
    this.time += dt;
    // ---- doors and hatch ----
    const m4 = new THREE.Matrix4();
    let moved = this.dirty;
    CELLS6.forEach((c, i) => {
      const target = this.doorOpen[i] ? (c.side < 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
      const a = this.doorAngle[i];
      if (Math.abs(target - a) > 1e-3) {
        this.doorAngle[i] = a + Math.sign(target - a) * Math.min(Math.abs(target - a), dt * 2.2);
        moved = true;
      }
      // Solid as soon as it starts to shut; passable once fully open.
      this.doorColliders[i].on = !this.doorOpen[i] || Math.abs(this.doorAngle[i]) < 1.2;
    });
    if (moved) {
      CELLS6.forEach((c, i) => {
        m4.makeRotationY(this.doorAngle[i]).setPosition(c.doorX, HF, c.zc - 0.48);
        this.doors.setMatrixAt(i, m4);
      });
      this.doors.instanceMatrix.needsUpdate = true;
    }
    const ht = this.trapOpen ? -1.75 : 0;
    if (Math.abs(ht - this.hatchAngle) > 1e-3 || this.dirty) {
      this.hatchAngle += Math.sign(ht - this.hatchAngle) * Math.min(Math.abs(ht - this.hatchAngle), dt * 2.5);
      this.hatch.rotation.x = this.hatchAngle;
      this.hatch.updateMatrix();
    }
    this.hatchCollider.on = !this.trapOpen;
    this.dirty = false;
    // ---- the feast lights ----
    for (const f of this.feasts) {
      let nearest = Infinity;
      for (const p of players) {
        if (p.dead > 0 || p.riding || p.asleep || Math.abs(p.pos.y - f.y) > 3) continue;
        const d = Math.hypot(p.pos.x - f.x, p.pos.z - f.z);
        nearest = Math.min(nearest, d);
        const r = f.rush.get(p) || { d, t: 0 };
        const speed = dt > 0 ? (r.d - d) / dt : 0;
        r.d = d;
        f.rush.set(p, r);
        if (!f.on || d > RUSH.reach) {
          r.t = 0;
          continue;
        }
        if (!p.feastHint && d < RUSH.reach + 2 && !f.found) {
          p.feastHint = true;
          p.say('Fények a gyökerek között: a tündék lakomája! Lopakodva közelíts (Shift / C / LB), mert ha rohansz, kialszanak.', 6);
        }
        r.t = speed > RUSH.speed ? r.t + dt : Math.max(0, r.t - dt * 2);
        if (r.t > RUSH.hold && d > RUSH.find) {
          f.on = false;
          f.outT = RUSH.out;
          r.t = 0;
          p.say('A lakoma fényei egy szempillantás alatt kialudtak! Túl gyorsan rohantál feléjük.', 4);
          continue;
        }
        if (!f.found && d < RUSH.find && f.fade > 0.9) {
          f.found = true;
          f.chest.visible = true;
          this.reward(f, p);
        }
      }
      if (!f.on) {
        f.outT -= dt;
        // The lights come back after a while, when nobody stands close.
        if (f.outT <= 0 && nearest > 6) f.on = true;
      }
      const target = f.on ? 1 : 0;
      f.fade += Math.sign(target - f.fade) * Math.min(Math.abs(target - f.fade), dt * (f.on ? 0.6 : 2.5));
      f.flames.material.uniforms.uFade.value = f.fade;
      f.flames.material.uniforms.uTime.value = this.time;
      for (let k = 0; k < f.nFires; k++) this.fires[(f.fire0 + k) * 5 + 3] = f.base[k] * f.fade;
    }
  }

  /** The clearing's treasure: its finds fly into the finder's bag (into the shared purse when it is full). */
  reward(f, p) {
    const game = p.game;
    const i = this.feasts.indexOf(f);
    const ids = TREASURE[i % TREASURE.length];
    let gold = 0;
    for (const id of ids) {
      const type = FIND_TYPES.find((t) => t.id === id);
      if (!type) continue;
      const room = p.bagCap - p.bag.length - (p.incoming || 0);
      if (room <= 0 || !game?.finds) {
        gold += type.value;
        continue;
      }
      p.incoming = (p.incoming || 0) + 1;
      const find = { type, x: f.chest.position.x, y: f.chest.position.y + 0.35, z: f.chest.position.z, rot: new THREE.Euler() };
      game.finds.fly(find, p, () => {
        p.incoming--;
        if (p.dead > 0) return;
        p.bag.push(type);
        p.say(`${type.name} (${type.value} arany)`);
      });
    }
    if (gold && game) game.money += gold;
    p.say(`A tündék lakomájának helyén kincset találtál!${gold ? ` (+${gold} arany, a zsákod tele)` : ''}`, 5);
    game?.saveNow?.();
  }
}
