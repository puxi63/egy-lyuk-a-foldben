/* ==== underground/hoard-fx.js — the moving and changing parts of Smaug's treasury (layer 9, NOTES-7a-hoard), built by
   decor.js:
   - Smaug himself (src/smaug/; `this.smaug`, which game.js hands on as `game.smaug`) and his sleeping body's colliders
     (capsules in the decor's list; off while the finale drives him or once he is gone);
   - the loose hoard on the gold (instanced: coins, two-handled cups, gems, round shields): each piece rests on the gold
     and slides down when the gold under it is dug (the chunks' versions say where to look again);
   - the Arkenstone, half buried on its dune, glowing white (the book ch. 13: "it shone... with a light of its own"),
     with a soft halo; `takeArkenstone()` hides it (src/hoard/ picks it up);
   - scorch marks on the gold where Smaug's fire struck (`addScorch(x, z)`);
   - the gold under Smaug's sleeping body and under the static shield heap is undiggable (sites.js addLocks,
     NOTES-18-levelfix): he lies on the gold's generated height and the merged shields cannot move, so digging there would
     leave them on air. Smaug's boxes are switched off while he is up or gone (his gold can be dug then).
   Draw calls: the four loot meshes, the stone and its halo, the scorches (only once there are some); Smaug's own.
   Culling: everything here is drawn only while a chunk of the hall may be seen in the view (cullFor). ==== */
import * as THREE from 'three';
import { CELL, CHUNK, CX, CY, CZ, ORIGIN } from '../config.js';
import { rng } from '../noise.js';
import { chunkVersion, sampleDensity } from '../world.js';
import { Smaug } from '../smaug/index.js';
import { addLocks } from './sites.js';
import * as H from './hoard-sites.js';

const SCORCH_N = 10;

function chunkKeyAt(x, y, z) {
  const S = CHUNK * CELL;
  const i = Math.floor((x - ORIGIN.x) / S);
  const j = Math.floor((y - ORIGIN.y) / S);
  const k = Math.floor((z - ORIGIN.z) / S);
  if (i < 0 || j < 0 || k < 0 || i >= CX || j >= CY || k >= CZ) return -1;
  return i + CX * (j + CY * k);
}

/** A single coin, a two-handled cup, a gem, a round shield (each centred on its resting point, y up). */
function lootGeometry(kind) {
  const parts = [];
  const add = (g, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    g.rotateX(rx);
    g.rotateZ(rz);
    g.translate(x, y, z);
    if (g.attributes.uv) g.deleteAttribute('uv');
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  if (kind === 'coin') add(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 9), 0, 0.004);
  else if (kind === 'cup') {
    add(new THREE.CylinderGeometry(0.13, 0.075, 0.2, 12, 1, true), 0, 0.27);
    add(new THREE.CylinderGeometry(0.075, 0.03, 0.05, 12), 0, 0.15);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 6), 0, 0.08);
    add(new THREE.CylinderGeometry(0.1, 0.11, 0.03, 12), 0, 0.015);
    for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.06, 0.013, 4, 10, Math.PI), s * 0.14, 0.27, 0, 0, s * -Math.PI / 2);
  } else if (kind === 'gem') {
    const o = new THREE.OctahedronGeometry(0.06, 0);
    o.scale(1, 0.75, 1);
    add(o, 0, 0.03);
  } else {
    add(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), 0, 0.02);
    add(new THREE.CylinderGeometry(0.0, 0.09, 0.07, 10), 0, 0.075);
    add(new THREE.TorusGeometry(0.33, 0.02, 4, 18), 0, 0.04, 0, Math.PI / 2, 0);
  }
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}

/** A soft round glow (a canvas radial gradient) for the Arkenstone's halo. */
function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(235,242,255,0.75)');
  grad.addColorStop(0.5, 'rgba(200,215,255,0.22)');
  grad.addColorStop(1, 'rgba(180,200,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Four faint rays.
  g.globalCompositeOperation = 'lighter';
  for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
    g.save();
    g.translate(64, 64);
    g.rotate(a);
    const rg = g.createLinearGradient(-64, 0, 64, 0);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.5, `rgba(255,255,255,${a % (Math.PI / 2) === 0 ? 0.35 : 0.15})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(-64, -1.5, 128, 3);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A scorch mark: a dark sooty blot, ragged at the edge. */
function scorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 34;
    const rad = 18 + r() * 26;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    const grad = g.createRadialGradient(x, y, 1, x, y, rad);
    grad.addColorStop(0, 'rgba(8,5,3,0.55)');
    grad.addColorStop(1, 'rgba(8,5,3,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class HoardFx {
  /**
   * @param {THREE.Object3D} group the layer's decor group (the loot, the stone, the scorches)
   * @param {THREE.Scene} scene Smaug is added to the scene itself (the finale flies him out of the layer's band)
   * @param {object} mats decor.js's shared materials
   * @param {object[]} colliders decor.js's collider list (Smaug's capsules join it)
   */
  constructor(group, scene, mats, colliders) {
    this.group = group;
    this.time = 0;
    this.mute = false;
    // ---- Smaug ----
    this.smaug = new Smaug(H.SMAUG_LAIR, (x, z) => H.goldTop(x, z));
    this.smaug.addTo(scene);
    this.colliders = this.smaug.capsules().map((c) => {
      const col = { t: 'cap', a: c.a, b: c.b, r: c.r, x: (c.a[0] + c.b[0]) / 2, y: (c.a[1] + c.b[1]) / 2, z: (c.a[2] + c.b[2]) / 2, on: true };
      col.br = Math.hypot(c.a[0] - c.b[0], c.a[1] - c.b[1], c.a[2] - c.b[2]) / 2 + c.r;
      colliders.push(col);
      return col;
    });
    // His bed of gold cannot be dug from under him (a box per body capsule, from the hall's floor up to the capsule).
    this.smaugLocks = addLocks(this.smaug.capsules().map((c) => {
      const r = c.r * 0.9;
      return {
        x0: Math.min(c.a[0], c.b[0]) - r, x1: Math.max(c.a[0], c.b[0]) + r,
        y0: H.HALL9.floor - 0.3, y1: Math.max(c.a[1], c.b[1]) + 0.2,
        z0: Math.min(c.a[2], c.b[2]) - r, z1: Math.max(c.a[2], c.b[2]) + r,
        off: false,
      };
    }));
    // The static shield heap at the pillar's foot (hoard-pieces.js buildHoardPieces: five shields laid on the gold).
    {
      const p = H.PILLARS9[0];
      const top = Math.max(H.goldTop(p.x - 1.25, p.z - 1.45), H.goldTop(p.x + 0.15, p.z - 1.45));
      addLocks([{ x0: p.x - 1.7, x1: p.x + 0.6, y0: H.HALL9.floor - 0.3, y1: top + 1.0, z0: p.z - 2.0, z1: p.z - 1.0 }]);
    }
    // ---- the loose hoard on the gold ----
    const R = rng(9191);
    const goldMat = new THREE.MeshPhongMaterial({ color: 0xe0a830, specular: 0xffe0a0, shininess: 90, emissive: 0x2a1a04 });
    const gemMat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 120, emissive: 0x1a1a1a });
    this.loot = [];
    const kinds = [
      { kind: 'coin', n: 420, mat: goldMat, tilt: 1.2, sink: 0.004 },
      { kind: 'cup', n: 42, mat: goldMat, tilt: 0.5, sink: 0.05 },
      { kind: 'gem', n: 130, mat: gemMat, tilt: 1.5, sink: 0.02 },
      { kind: 'shield', n: 18, mat: goldMat, tilt: 0.45, sink: 0.04 },
    ];
    const GEMS = [0xf4f8ff, 0xd8203a, 0x30c870, 0x4a7ae8, 0xf0e8ff];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const k of kinds) {
      const mesh = new THREE.InstancedMesh(lootGeometry(k.kind), k.mat, k.n);
      mesh.name = `l9-loot-${k.kind}`;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const items = [];
      for (let i = 0, tries = 0; i < k.n && tries < k.n * 40; tries++) {
        const x = -H.HALL9.a + 0.5 + R() * (2 * H.HALL9.a - 1);
        const z = -H.HALL9.a + 0.5 + R() * (2 * H.HALL9.a - 1);
        if (x < H.TOWER.x1 + 0.3 && z > H.TOWER.z0 - 0.3) continue;
        // Not under Smaug's coil (his body lies there) for the bigger pieces.
        const dl = Math.hypot(x - H.LAIR.x, z - H.LAIR.z);
        if (k.kind !== 'coin' && dl < 5.2) continue;
        if (k.kind === 'coin' && dl < 2.2) continue;
        // On the gold's surface, with air above it (not under the ledge or in a pillar).
        const y = H.goldTop(x, z);
        if (!H.inGold(x, y - 0.1, z) || !(H.hoardCavity(x, y + 0.35, z) < -0.1)) continue;
        const it = { x, y: y - k.sink, z, rx: (R() - 0.5) * k.tilt, ry: R() * 6.28, rz: (R() - 0.5) * k.tilt, s: 0.85 + R() * 0.3, vy: 0 };
        it.key = chunkKeyAt(x, it.y - 0.1, z);
        items.push(it);
        if (k.kind === 'gem') mesh.setColorAt(i, new THREE.Color(GEMS[Math.floor(R() * GEMS.length)]).multiplyScalar(1.2));
        i++;
      }
      mesh.count = items.length;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        m4.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromEuler(e.set(it.rx, it.ry, it.rz)), new THREE.Vector3().setScalar(it.s));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
      this.loot.push({ mesh, items, sink: k.sink });
    }
    // The chunks the loot lies in (their versions change when somebody digs there).
    this.lootKeys = new Map();
    for (const L of this.loot) for (const it of L.items) if (it.key >= 0 && !this.lootKeys.has(it.key)) this.lootKeys.set(it.key, chunkVersion[it.key]);
    this.falling = [];
    // ---- the Arkenstone ----
    const A = H.ARKENSTONE;
    const g = new THREE.IcosahedronGeometry(0.2, 1);
    g.scale(1, 0.85, 0.95);
    this.arkMat = new THREE.MeshPhongMaterial({ color: 0xf2f6ff, emissive: 0xc8d4ff, emissiveIntensity: 0.9, specular: 0xffffff, shininess: 140, flatShading: true });
    // A play of colours on the facets (the book: white light shot with rainbow glints), by the view direction.
    this.arkMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 nv = normalize(normal);
          float f = dot(nv, normalize(vViewPosition));
          vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (f * 2.3 + vec3(0.0, 0.33, 0.67)));
          totalEmissiveRadiance = mix(totalEmissiveRadiance, totalEmissiveRadiance * rainbow * 1.4, 0.35);
        }`);
    };
    this.ark = new THREE.Mesh(g, this.arkMat);
    this.ark.name = 'l9-arkenstone';
    this.ark.position.set(A.x, A.y, A.z);
    this.ark.rotation.set(0.3, 0.7, 0.15);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.name = 'l9-arkenstone-halo';
    this.halo.scale.setScalar(1.6);
    this.halo.position.set(A.x, A.y + 0.12, A.z);
    this.halo.renderOrder = 3;
    group.add(this.ark, this.halo);
    this.arkTaken = false;
    this.arkY = A.y;
    this.arkKey = chunkKeyAt(A.x, A.y - 0.2, A.z);
    this.arkVer = this.arkKey >= 0 ? chunkVersion[this.arkKey] : 0;
    // ---- scorch marks ----
    this.scorch = new THREE.InstancedMesh(new THREE.CircleGeometry(1.15, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), SCORCH_N);
    this.scorch.name = 'l9-scorch';
    this.scorch.count = 0;
    this.scorch.visible = false;
    this.scorch.frustumCulled = false;
    this.scorch.renderOrder = 2;
    group.add(this.scorch);
    this.scorches = [];
    // The chunks of the hall (for the per-view culling).
    const keys = new Set();
    for (let y = H.HALL9.floor; y < H.hall9Roof(0, 0); y += 4) for (let x = -11; x <= 11; x += 4) for (let z = -11; z <= 11; z += 4) keys.add(chunkKeyAt(x, y, z));
    keys.delete(-1);
    this.hallKeys = Int32Array.from(keys);
    this.hallSeen = false;
    this.m4 = m4;
    this.q = q;
    this.e = e;
  }

  /* ---------------- the Arkenstone ---------------- */

  /** Hides the Arkenstone (it was taken: src/hoard/ flies it to the finder). */
  takeArkenstone() {
    this.arkTaken = true;
    this.ark.visible = false;
    this.halo.visible = false;
  }

  /** The stone's current world position (it sinks with the gold dug under it). */
  arkenstonePos(out = new THREE.Vector3()) {
    return out.set(H.ARKENSTONE.x, this.arkY, H.ARKENSTONE.z);
  }

  /* ---------------- scorches ---------------- */

  /** A scorch mark on the gold (or the floor) under a world plan point. */
  addScorch(x, z, yHint) {
    const y = H.hoardFloorAt(x, z, (yHint ?? -619) + 0.8, 12) + 0.02;
    this.scorches.push({ x, y, z, r: Math.random() * 6.28 });
    if (this.scorches.length > SCORCH_N) this.scorches.shift();
    this.scorches.forEach((s, i) => {
      this.m4.compose(new THREE.Vector3(s.x, s.y, s.z), this.q.setFromEuler(this.e.set(0, s.r, 0)), new THREE.Vector3(1, 1, 1));
      this.scorch.setMatrixAt(i, this.m4);
    });
    this.scorch.count = this.scorches.length;
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- per frame ---------------- */

  /** Meshes for decor.js's per-view culling (none: the hall's own test in cullFor). */
  culledMeshes() {
    return [];
  }

  /**
   * Per view (decor.js cullFor): the loot, the stone and the scorches are drawn only while a chunk of the hall may be
   * seen; Smaug too, unless the finale drives him (then he is always drawn) or he is gone.
   */
  cullFor(visible) {
    let on = false;
    for (let i = 0; i < this.hallKeys.length && !on; i++) on = visible[this.hallKeys[i]] === 1;
    this.hallSeen = on;
    for (const L of this.loot) L.mesh.visible = on;
    this.ark.visible = this.halo.visible = on && !this.arkTaken;
    this.scorch.visible = on && this.scorches.length > 0;
    const s = this.smaug;
    if (s.gone) s.root.visible = false;
    else s.root.visible = s.busy || on;
  }

  /** Per frame: the loot and the stone settle into dug gold; the stone's glow; Smaug's colliders follow his state. */
  update(dt) {
    this.time += dt;
    // Somebody dug in a chunk with loot: look at its pieces again.
    for (const [key, ver] of this.lootKeys) {
      if (chunkVersion[key] === ver) continue;
      this.lootKeys.set(key, chunkVersion[key]);
      for (const L of this.loot) {
        L.items.forEach((it, i) => {
          if (it.key === key && !it.fall && sampleDensity(it.x, it.y + L.sink - 0.05, it.z) <= 0) {
            it.fall = true;
            it.vy = 0;
            this.falling.push({ L, it, i });
          }
        });
      }
    }
    if (this.falling.length) {
      for (const f of this.falling) {
        const { L, it, i } = f;
        it.vy -= 14 * dt;
        it.y += it.vy * dt;
        if (sampleDensity(it.x, it.y + L.sink - 0.03, it.z) > 0 || it.y < H.HALL9.floor - 1) {
          // Landed: lift to the surface.
          for (let n = 0; n < 40 && sampleDensity(it.x, it.y + L.sink, it.z) > 0; n++) it.y += 0.02;
          it.fall = false;
          const nk = chunkKeyAt(it.x, it.y - 0.1, it.z);
          it.key = nk;
          if (nk >= 0 && !this.lootKeys.has(nk)) this.lootKeys.set(nk, chunkVersion[nk]);
        }
        this.m4.compose(new THREE.Vector3(it.x, it.y, it.z), this.q.setFromEuler(this.e.set(it.rx, it.ry, it.rz)), new THREE.Vector3().setScalar(it.s));
        L.mesh.setMatrixAt(i, this.m4);
        L.mesh.instanceMatrix.needsUpdate = true;
      }
      this.falling = this.falling.filter((f) => f.it.fall);
    }
    // The Arkenstone sinks with the gold dug under it.
    if (!this.arkTaken && this.arkKey >= 0 && chunkVersion[this.arkKey] !== this.arkVer) {
      this.arkVer = chunkVersion[this.arkKey];
      const A = H.ARKENSTONE;
      let y = this.arkY;
      for (let n = 0; n < 400 && sampleDensity(A.x, y - 0.12, A.z) <= 0 && y > H.HALL9.floor; n++) y -= 0.05;
      this.arkY = y;
      this.ark.position.y = y;
      this.halo.position.y = y + 0.12;
      this.arkKey = chunkKeyAt(A.x, y - 0.2, A.z);
      this.arkVer = this.arkKey >= 0 ? chunkVersion[this.arkKey] : 0;
    }
    if (!this.arkTaken) {
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 1.9);
      this.arkMat.emissiveIntensity = 0.75 + 0.3 * pulse;
      this.halo.material.opacity = 0.75 * pulse;
      this.halo.scale.setScalar(1.45 + 0.2 * pulse);
    }
    // Smaug's colliders: his sleeping body blocks the way while he lies on the hoard.
    const s = this.smaug;
    const solid = !s.busy && !s.gone;
    for (const c of this.colliders) c.on = solid;
    for (const b of this.smaugLocks) b.off = !solid;
  }
}
