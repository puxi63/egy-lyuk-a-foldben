/* ==== underground/laketown-fx.js — what moves or changes beneath Lake-town (layer 7):
   - the FLOOD SURFACES: per floodable cavity (laketown-sites.js CAVITIES) one flat water plane over its box with the
     lake-water look (laketown-water.js lakeLookMaterial: Gollum's lake's shader), hidden until the rising-water work
     (src/laketown-events/flood.js) raises it: setFloodLevel(cavityId, y) / setFloodLevel(cavityId, null), and
     floodLevel(cavityId). Opaque, drawn before the terrain (renderOrder −1), both faces (a player caught below the
     water sees its underside). The parts of the plane over rock are hidden by the rock in front of them;
   - the NETS: old fishing nets hanging between the piles (one merged mesh, alpha-tested like Mirkwood's webs, not
     blended);
   - the MASTER'S CHEST in the hoard room: whoever comes up to it (within 1.3 m) opens it and the gold inside flies into
     the bag (once per game, saved: save.js `laketown`). Girion's emeralds lie on its lid (a famous find, finds.js).
   Wiring: decor.js builds it as `decor.laketownFx` and calls update(dt, players); game.js restores its state. ==== */
import * as THREE from 'three';
import { box, colorize } from './kit.js';
import { CAVITIES, CHEST7, PILES } from './laketown-sites.js';
import { lakeLookMaterial, waterUniforms } from './laketown-water.js';
import { FIND_TYPES } from '../finds.js';
import { rng } from '../noise.js';

/** What the Master's chest holds (find ids of layer 7). */
const HOARD_LOOT = ['polgarany', 'polgarany', 'volgyijatek', 'kereskedolada'];

/** A procedural net texture: knotted diamond mesh, a few torn holes and sagging strands. */
function netTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  const step = 32;
  // Two families of diagonal cords (a diamond mesh), slightly wavy, tileable (the lines wrap across the edges).
  for (let k = -S; k < 2 * S; k += step) {
    for (const dir of [1, -1]) {
      g.beginPath();
      for (let t = 0; t <= S; t += 8) {
        const x = k + dir * t + Math.sin(t * 0.05 + k) * 2;
        const y = t;
        if (t === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // Knots where the cords cross.
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let y = 0; y <= S; y += step / 2) {
    for (let x = (y / (step / 2)) % 2 ? step / 2 : 0; x <= S; x += step) {
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Torn holes.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.ellipse(rnd() * S, rnd() * S, 14 + rnd() * 22, 10 + rnd() * 16, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The nets: sagging sheets between pairs of neighbouring full piles in the pile cavern and the old town, low enough to
 * see (each sheet a 6 × 4 grid curved down in the middle). Returns the merged mesh and the sheets' list.
 */
function buildNets() {
  const R = rng(7117);
  const full = PILES.filter((p) => p.kind === 'full');
  const sheets = [];
  const used = new Set();
  for (let i = 0; i < full.length && sheets.length < 9; i++) {
    for (let j = i + 1; j < full.length && sheets.length < 9; j++) {
      const A = full[i];
      const B = full[j];
      if (used.has(i) || used.has(j)) continue;
      // Same cave (their feet within 3 m in height), 1.6–2.8 m apart.
      if (Math.abs(A.a[1] - B.a[1]) > 3) continue;
      const d = Math.hypot(A.a[0] - B.a[0], A.a[2] - B.a[2]);
      if (d < 1.6 || d > 2.8 || R() < 0.45) continue;
      used.add(i);
      used.add(j);
      const fl = Math.max(A.a[1], B.a[1]) + 2.4;
      sheets.push({ a: A, b: B, y0: fl + 0.9 + R() * 0.6, h: 1.6 + R() * 0.9, sag: 0.25 + R() * 0.3 });
    }
  }
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  const at = (P, y) => {
    const t = (y - P.a[1]) / (P.b[1] - P.a[1]);
    return [P.a[0] + (P.b[0] - P.a[0]) * t, P.a[2] + (P.b[2] - P.a[2]) * t];
  };
  for (const s of sheets) {
    const NX = 6;
    const NY = 4;
    const base = pos.length / 3;
    const [ax, az] = at(s.a, s.y0);
    const [bx, bz] = at(s.b, s.y0);
    const len = Math.hypot(bx - ax, bz - az);
    // Hung from the piles' sides (their radius in from the centres).
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const x0 = ax + ux * s.a.r * 0.8;
    const z0 = az + uz * s.a.r * 0.8;
    const L = len - (s.a.r + s.b.r) * 0.8;
    for (let iy = 0; iy <= NY; iy++) {
      for (let ix = 0; ix <= NX; ix++) {
        const u = ix / NX;
        const v = iy / NY;
        const sag = Math.sin(u * Math.PI) * s.sag * (1 - v * 0.5);
        const bulge = Math.sin(u * Math.PI) * 0.12 * (1 - v);
        pos.push(x0 + ux * L * u - uz * bulge, s.y0 + s.h * (1 - v) * 0 - s.h * v - sag, z0 + uz * L * u + ux * bulge);
        uv.push(u * L * 0.9, v * s.h * 0.9);
        nor.push(-uz, 0, ux);
      }
    }
    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        const p = base + iy * (NX + 1) + ix;
        idx.push(p, p + NX + 1, p + 1, p + 1, p + NX + 1, p + NX + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: netTexture(), color: 0x6e6a52, alphaTest: 0.5, side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat);
  m.matrixAutoUpdate = false;
  m.renderOrder = 2;
  m.name = 'l7-nets';
  return { mesh: m, sheets };
}

/** The Master's chest: a body and a hinged lid (wood, iron bands), gold showing when open. */
function buildChest(mats) {
  const g = new THREE.Group();
  const bodyG = box(0.9, 0.5, 0.55);
  bodyG.translate(0, 0.25, 0);
  colorize(bodyG, [0.34, 0.22, 0.12], 0.12);
  const body = new THREE.Mesh(bodyG, mats.wood);
  g.add(body);
  for (const x of [-0.32, 0.32]) {
    const b = box(0.06, 0.52, 0.57);
    b.translate(x, 0.25, 0);
    colorize(b, [0.22, 0.22, 0.24], 0.05);
    g.add(new THREE.Mesh(b, mats.metal));
  }
  const goldG = box(0.82, 0.06, 0.47);
  goldG.translate(0, 0.46, 0);
  colorize(goldG, [0.85, 0.62, 0.18], 0.2);
  const gold = new THREE.Mesh(goldG, mats.metal);
  g.add(gold);
  const lid = new THREE.Group();
  const lidG = box(0.92, 0.14, 0.57);
  lidG.translate(0, 0.07, 0.285);
  colorize(lidG, [0.3, 0.2, 0.11], 0.12);
  lid.add(new THREE.Mesh(lidG, mats.wood));
  lid.position.set(0, 0.5, -0.285);
  g.add(lid);
  return { group: g, lid };
}

export class LaketownFx {
  /**
   * @param {THREE.Object3D} group the layer's decor group
   * @param {object} mats decor.js's shared materials
   * @param {object[]} colliders decor.js's collider list (the chest's joins it)
   */
  constructor(group, mats, colliders) {
    this.group = group;
    this.time = 0;
    // ---- flood surfaces ----
    this.floodMat = lakeLookMaterial(new THREE.Color(0.016, 0.02, 0.015), new THREE.Color(0.05, 0.062, 0.052));
    this.floodMat.side = THREE.DoubleSide;
    this.floods = new Map();
    for (const c of CAVITIES) {
      // Over the flood grid's whole plan (the cavity's box plus flood.js's 4 m margin, inside the block): the water also
      // stands in the tunnels and the channel it runs into (NOTES-18-levelfix: with the water near the roofs that is
      // tens of metres of tunnel). Where the plane passes through rock the terrain hides it.
      const x0 = Math.max(-11.75, c.min.x - 4);
      const x1 = Math.min(11.75, c.max.x + 4);
      const z0 = Math.max(-11.75, c.min.z - 4);
      const z1 = Math.min(11.75, c.max.z + 4);
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.floodMat);
      m.position.set((x0 + x1) / 2, c.floorY, (z0 + z1) / 2);
      m.renderOrder = -1;
      m.visible = false;
      m.frustumCulled = true;
      m.name = `l7-flood-${c.id}`;
      m.updateMatrix();
      m.matrixAutoUpdate = false;
      group.add(m);
      this.floods.set(c.id, { mesh: m, level: null, cav: c });
    }
    // ---- nets ----
    const nets = buildNets();
    this.nets = nets.mesh;
    this.netSheets = nets.sheets;
    group.add(this.nets);
    // ---- the Master's chest ----
    const ch = buildChest(mats);
    this.chest = ch.group;
    this.lid = ch.lid;
    this.chest.position.set(CHEST7.x, CHEST7.y, CHEST7.z);
    this.chest.rotation.y = CHEST7.yaw;
    group.add(this.chest);
    colliders.push({ t: 'box', x: CHEST7.x, y: CHEST7.y + 0.3, z: CHEST7.z, hx: 0.46, hy: 0.3, hz: 0.29, c: 1, s: 0, br: Math.hypot(0.46, 0.3, 0.29), on: true });
    this.hoardOpen = false;
    this.lidAngle = 0;
  }

  /**
   * Raises or lowers the flood surface in a cavity (laketown-sites.js CAVITIES id) to world height y; null (or a
   * level at or under the cavity's floor) hides it.
   */
  setFloodLevel(cavityId, y) {
    const f = this.floods.get(cavityId);
    if (!f) return;
    if (y === null || y === undefined || !Number.isFinite(y) || y <= f.cav.floorY - 0.6) {
      f.level = null;
      f.mesh.visible = false;
      return;
    }
    f.level = y;
    f.mesh.position.y = y;
    f.mesh.updateMatrix();
    f.mesh.visible = true;
  }

  /** The flood surface's height in a cavity, or null when it is dry. */
  floodLevel(cavityId) {
    const f = this.floods.get(cavityId);
    return f ? f.level : null;
  }

  /** Meshes for decor.js's per-view culling (the flood planes are culled by their own visibility and the frustum). */
  culledMeshes() {
    return [this.nets];
  }

  /** The state for the save: the Master's chest opened. */
  state() {
    return { hoard: this.hoardOpen ? 1 : 0 };
  }

  restore(s) {
    if (!s) return;
    this.hoardOpen = !!s.hoard;
    this.lidAngle = this.hoardOpen ? -1.9 : 0;
    this.lid.rotation.x = this.lidAngle;
  }

  /** Per frame: the flood surfaces' clock and lamps, the chest. */
  update(dt, players) {
    this.time += dt;
    waterUniforms(this.floodMat, this.time, players);
    this.floodMat.uniforms.uRingN.value = 0;
    if (!this.hoardOpen) {
      for (const p of players) {
        if (p.dead > 0 || p.riding) continue;
        if (Math.hypot(p.pos.x - CHEST7.x, p.pos.z - CHEST7.z) < 1.3 && Math.abs(p.pos.y - CHEST7.y) < 1.5) {
          this.hoardOpen = true;
          this.reward(p);
          break;
        }
      }
    }
    const target = this.hoardOpen ? -1.9 : 0;
    if (Math.abs(target - this.lidAngle) > 1e-3) {
      this.lidAngle += Math.sign(target - this.lidAngle) * Math.min(Math.abs(target - this.lidAngle), dt * 1.6);
      this.lid.rotation.x = this.lidAngle;
    }
  }

  /** The Master's gold: the chest's finds fly into the finder's bag (into the shared purse when it is full). */
  reward(p) {
    const game = p.game;
    let gold = 0;
    for (const id of HOARD_LOOT) {
      const type = FIND_TYPES.find((t) => t.id === id);
      if (!type) continue;
      const room = p.bagCap - p.bag.length - (p.incoming || 0);
      if (room <= 0 || !game?.finds) {
        gold += type.value;
        continue;
      }
      p.incoming = (p.incoming || 0) + 1;
      const find = { type, x: CHEST7.x, y: CHEST7.y + 0.6, z: CHEST7.z, rot: new THREE.Euler() };
      game.finds.fly(find, p, () => {
        p.incoming--;
        if (p.dead > 0) return;
        p.bag.push(type);
        p.say(`${type.name} (${type.value} arany)`);
      });
    }
    if (gold && game) game.money += gold;
    p.say(`A Polgármester rejtett kincse!${gold ? ` (+${gold} arany, a zsákod tele)` : ''}`, 6);
    game?.saveNow?.();
  }
}
