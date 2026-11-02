/* ==== underground/erebor-fx.js — what moves or changes in the mines of Erebor (layer 8):
   - DURIN'S DAY DOOR in the great hall's west wall: a slab of the hall stone on a hinge, closed (a collider in the
     doorway) until the puzzle work (src/erebor-puzzles/) calls setDoorOpen(t 0..1); it swings inwards into the
     treasure room, and from t 0.8 the way is open. The keyhole is a small dark slot on its hall face;
   - the LIGHT BEAM of the setting sun: setBeam(points[] | null) draws the polyline (a bright core and a soft glow);
   - the RUNE-LOCKED CHESTS at the provider's spots: iron-bound dwarf chests with a rune plate; setChestOpen(id, t)
     lifts the lid (the puzzle work opens them);
   - the light shaft's sunlit opening in the hall's roof (a golden disc), the beam's source;
   - THE MITHRIL SHIRT on its stand in the sealed armoury: whoever comes up to it takes it (once per game, saved:
     save.js `erebor`): it flies to the finder, who wears it from then on (armour tier 4, enemies/armour.js: the best
     protection), with a silver glint at the screen's edge (TERV 0.12); Bag End's case keeps its place (addTrophy);
   - CAVE-INS in the old workings (TERV 0.11/2: deep down the pit shakes now and then and stones fall: Smaug stirs
     below): while a player is in layer 8 outside the carved halls, every 1½–3 minutes the rock rumbles and stones fall
     round one player. A stone that lands on a player knocks him down and costs a bite of the plate; dwarf mail or plate
     (rockProof) keeps him on his feet; the mithril shirt takes it all: the screen's edge flashes silver, no harm.
   Wiring: decor.js builds it as `decor.ereborFx` and calls update(dt, players); game.js restores its state. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, colorize, cyl, lathe, rgb, rock, sphere, torus } from './kit.js';
import * as E from './erebor-sites.js';
import { FIND_TYPES } from '../finds.js';
import { raycast } from '../world.js';
import { armourOf } from '../enemies/armour.js';
import { sharedAudio } from '../audio.js';
import { CELL, CHUNK, CX, CY, CZ, ORIGIN } from '../config.js';

/** The chunk key of a world point (terrain.cullFor's mask), or -1 outside the block. */
function chunkKeyAt(x, y, z) {
  const S = CHUNK * CELL;
  const i = Math.floor((x - ORIGIN.x) / S);
  const j = Math.floor((y - ORIGIN.y) / S);
  const k = Math.floor((z - ORIGIN.z) / S);
  if (i < 0 || j < 0 || k < 0 || i >= CX || j >= CY || k >= CZ) return -1;
  return i + CX * (j + CY * k);
}

/** Cave-in timing (seconds) and its stones. */
export const CAVE_IN = { first: [60, 110], every: [90, 180], warn: 1.1, stones: 12, radius: 1.7, hitR: 0.7, stay: 6 };
const STONE_N = 16;
const DOOR_OPEN = 0.8;

/** An empty geometry that still has a position attribute (decor.js stats() counts every mesh's triangles). */
const emptyGeo = () => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3));

/** A geometry with a vertex colour (for the vertex-coloured decor materials). */
function painted(geo, hex, jitter = 0.06) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  return colorize(g, rgb(hex), jitter);
}

/** Merges parts placed with (geo, hex, x, y, z, rx, ry, rz) into one vertex-coloured geometry. */
function mergeParts(parts) {
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const list = parts.map(([geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0]) => {
    const g = painted(geo, hex);
    g.applyMatrix4(m.makeRotationFromEuler(e.set(rx, ry, rz, 'YXZ')).setPosition(x, y, z));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const out = mergeGeometries(list);
  for (const g of list) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** A dwarf chest: the body (iron-bound, a rune plate on the front) and its lid (hinged at the back, local origin). */
function chestGeometry() {
  const W = 0.9;
  const D = 0.55;
  const H = 0.5;
  const body = mergeParts([
    [box(W, H, D), 0x4a3828, 0, H / 2, 0],
    [box(W + 0.03, 0.06, D + 0.03), 0x34343a, 0, 0.04, 0],
    [box(W + 0.03, 0.06, D + 0.03), 0x34343a, 0, H - 0.04, 0],
    [box(0.06, H, D + 0.03), 0x34343a, -W / 2 + 0.12, H / 2, 0],
    [box(0.06, H, D + 0.03), 0x34343a, W / 2 - 0.12, H / 2, 0],
    // The front (the rune plate, the lock) faces −z: three.js yaw 0 faces −z, as the provider's chest spots.
    [box(0.42, 0.26, 0.03), 0x7a8a80, 0, H / 2, -D / 2 - 0.01],
    [box(0.025, 0.18, 0.02), 0xc8962e, -0.1, H / 2, -D / 2 - 0.03],
    [box(0.025, 0.12, 0.02), 0xc8962e, -0.06, H / 2 + 0.03, -D / 2 - 0.03, 0, 0, 0.7],
    [box(0.025, 0.18, 0.02), 0xc8962e, 0.05, H / 2, -D / 2 - 0.03],
    [box(0.025, 0.12, 0.02), 0xc8962e, 0.1, H / 2 - 0.03, -D / 2 - 0.03, 0, 0, -0.7],
    [box(0.1, 0.12, 0.04), 0xb08a3a, 0, H - 0.1, -D / 2 - 0.02],
  ]);
  // The lid in its hinge's frame (the hinge on the back edge, +z): it reaches forwards to z = −D.
  const lidCurve = cyl(D / 2, D / 2, W, 10, false);
  const lid = mergeParts([
    [lidCurve, 0x4a3828, 0, 0, -D / 2, 0, 0, Math.PI / 2],
    [box(W + 0.03, 0.05, D + 0.03), 0x34343a, 0, 0, -D / 2],
    [torus(D / 2 + 0.01, 0.02, 3, 10, Math.PI), 0x34343a, -W / 2 + 0.12, 0, -D / 2, 0, Math.PI / 2, 0],
    [torus(D / 2 + 0.01, 0.02, 3, 10, Math.PI), 0x34343a, W / 2 - 0.12, 0, -D / 2, 0, Math.PI / 2, 0],
  ]);
  // The half cylinder: keep the upper half only (y >= 0) by scaling the lower half flat.
  const p = lid.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, 0);
  lid.computeVertexNormals();
  return { body, lid, W, D, H };
}

/** A small mail-ring texture for the mithril shirt (silver rings, a little darker between them). */
function mailTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa4b0';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#f4f8ff';
  g.lineWidth = 2;
  for (let y = 0; y <= S; y += 8) {
    for (let x = (y / 8) % 2 ? 4 : 0; x <= S; x += 8) {
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The mithril shirt: a small mail coat with short sleeves and its belt of pearls and crystals (the book ch. 13). */
function buildShirt() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ map: mailTexture(), color: 0xe8eef8, specular: 0xffffff, shininess: 110, emissive: 0x141a22 });
  const torso = lathe([[0.2, 0], [0.19, 0.18], [0.17, 0.36], [0.19, 0.5], [0.12, 0.56], [0.06, 0.58]], 14);
  torso.scale(1, 1, 0.62);
  const sleeves = [-1, 1].map((s) => {
    const sl = cyl(0.06, 0.075, 0.2, 10, true);
    sl.rotateZ(s * 1.2);
    sl.translate(s * 0.23, 0.44, 0);
    return sl;
  });
  const geo = mergeGeometries([torso, ...sleeves].map((q) => (q.index ? q.toNonIndexed() : q)));
  const shirt = new THREE.Mesh(geo, mat);
  shirt.name = 'l8-mithril';
  g.add(shirt);
  const pearls = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const s = sphere(i % 3 ? 0.014 : 0.018, 6, 4);
    s.translate(Math.cos(a) * 0.195, 0.16, Math.sin(a) * 0.125);
    pearls.push(s);
  }
  const belt = new THREE.Mesh(mergeGeometries(pearls.map((q) => (q.index ? q.toNonIndexed() : q))), new THREE.MeshPhongMaterial({ color: 0xf6f2ea, specular: 0xffffff, shininess: 120, emissive: 0x262420 }));
  belt.name = 'l8-mithril-belt';
  g.add(belt);
  return { group: g, mat };
}

/** The rumble of a cave-in (filtered noise), once per cave-in. */
class Rumble {
  play(level) {
    const c = sharedAudio();
    if (!c || c.state === 'suspended' || level <= 0) return;
    if (!this.buf) {
      const len = c.sampleRate * 2;
      this.buf = c.createBuffer(1, len, c.sampleRate);
      const d = this.buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        b = b * 0.96 + (Math.random() * 2 - 1) * 0.04;
        d[i] = b * 5;
      }
    }
    const t = c.currentTime + 0.02;
    const n = c.createBufferSource();
    n.buffer = this.buf;
    n.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8 * level, t + 0.5);
    g.gain.setValueAtTime(0.8 * level, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    n.connect(lp).connect(g).connect(c.destination);
    n.start(t);
    n.stop(t + 3.3);
  }
}

export class EreborFx {
  /**
   * @param {THREE.Object3D} group the layer's decor group
   * @param {object} mats decor.js's shared materials
   * @param {object[]} colliders decor.js's collider list (the door's and the chests' join it)
   */
  constructor(group, mats, colliders) {
    this.group = group;
    this.time = 0;
    this.mute = false;
    // ---- Durin's Day door: a hinge at its north edge, the slab, the keyhole on the hall face ----
    const D = E.DOOR;
    this.hinge = new THREE.Group();
    this.hinge.position.set(D.x - 0.1, D.y, D.z - D.w / 2);
    this.hinge.name = 'l8-door';
    const slab = mergeParts([
      [box(0.16, D.h, D.w), 0x243c32, 0, D.h / 2, D.w / 2],
      // A faint outline of runes and the keyhole: a dark slot with a worn gold rim.
      [box(0.02, 0.16, 0.06), 0x0a0a0a, 0.08, E.KEYHOLE.y - D.y, E.KEYHOLE.z - (D.z - D.w / 2)],
      [box(0.012, 0.22, 0.12), 0x8a6a2a, 0.075, E.KEYHOLE.y - D.y, E.KEYHOLE.z - (D.z - D.w / 2)],
    ]);
    this.door = new THREE.Mesh(slab, mats.stone8);
    this.door.name = 'l8-door-slab';
    this.hinge.add(this.door);
    group.add(this.hinge);
    this.doorCollider = { t: 'box', x: D.x - 0.1, y: D.y + D.h / 2, z: D.z, hx: 0.12, hy: D.h / 2, hz: D.w / 2, c: 1, s: 0, br: Math.hypot(0.12, D.h / 2, D.w / 2), on: true };
    colliders.push(this.doorCollider);
    this.doorT = 0;
    // ---- the light beam (a core and a soft glow), rebuilt when its points change ----
    this.beamCore = new THREE.Mesh(emptyGeo(), new THREE.MeshBasicMaterial({ color: 0xfff0b8 }));
    this.beamGlow = new THREE.Mesh(emptyGeo(), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const m of [this.beamCore, this.beamGlow]) {
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 3;
      group.add(m);
    }
    this.beamCore.name = 'l8-beam';
    this.beamGlow.name = 'l8-beam-glow';
    this.beamKey = '';
    // ---- the sunlit opening at the top of the light shaft ----
    const sun = new THREE.Mesh(new THREE.CircleGeometry(E.SUN_SHAFT.r * 0.98, 16), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
    sun.rotation.x = Math.PI / 2;
    sun.position.set(E.SUN_SHAFT.x, E.SUN_SHAFT.top - 0.15, E.SUN_SHAFT.z);
    sun.name = 'l8-sun';
    group.add(sun);
    this.sun = sun;
    // ---- the rune-locked chests ----
    const cg = chestGeometry();
    this.chests = new Map();
    const bodies = [];
    const m4 = new THREE.Matrix4();
    for (const c of E.RUNE_CHESTS) {
      const b = cg.body.clone();
      b.applyMatrix4(m4.makeRotationY(c.yaw).setPosition(c.x, c.y, c.z));
      bodies.push(b);
      const lidPivot = new THREE.Group();
      lidPivot.position.set(c.x, c.y + cg.H, c.z);
      lidPivot.rotation.y = c.yaw;
      // The hinge is on the back edge (+z in the chest's frame; the front faces −z).
      const lid = new THREE.Mesh(cg.lid, mats.metal);
      const hinge = new THREE.Group();
      hinge.position.z = cg.D / 2;
      hinge.add(lid);
      lidPivot.add(hinge);
      lidPivot.name = `l8-chest-lid-${c.id}`;
      group.add(lidPivot);
      const s = Math.sin(c.yaw);
      const co = Math.cos(c.yaw);
      colliders.push({ t: 'box', x: c.x, y: c.y + cg.H / 2, z: c.z, hx: cg.W / 2, hy: cg.H / 2 + 0.1, hz: cg.D / 2, c: co, s, br: Math.hypot(cg.W / 2, cg.H, cg.D / 2), on: true });
      this.chests.set(c.id, { spot: c, hinge, t: 0 });
    }
    const bodyGeo = mergeGeometries(bodies);
    bodyGeo.computeBoundingSphere();
    this.chestBodies = new THREE.Mesh(bodyGeo, mats.metal);
    this.chestBodies.name = 'l8-chests';
    this.chestBodies.matrixAutoUpdate = false;
    group.add(this.chestBodies);
    // ---- the mithril shirt on its stand ----
    const sh = buildShirt();
    this.shirt = sh.group;
    this.shirtMat = sh.mat;
    const M = E.MITHRIL;
    this.shirt.position.set(M.x, M.y + 0.62, M.z);
    this.shirt.rotation.y = M.yaw;
    group.add(this.shirt);
    this.mithrilTaken = false;
    this.mithrilBy = null;
    // ---- cave-ins: the falling stones (one instanced mesh, hidden while none falls) ----
    this.stoneMesh = new THREE.InstancedMesh(rock(0.15, 3, 1), new THREE.MeshLambertMaterial({ color: 0x6a7a70 }), STONE_N);
    this.stoneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.stoneMesh.count = 0;
    this.stoneMesh.visible = false;
    this.stoneMesh.frustumCulled = false;
    this.stoneMesh.name = 'l8-cavein';
    group.add(this.stoneMesh);
    this.stones = [];
    this.caveIn = null;
    this.caveT = CAVE_IN.first[0] + Math.random() * (CAVE_IN.first[1] - CAVE_IN.first[0]);
    this.rumble = new Rumble();
    this.flashes = new Map();
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.sc = new THREE.Vector3();
  }

  /* ---------------- the puzzle work's hooks ---------------- */

  /** Opens Durin's Day door: t 0 closed … 1 wide open (swung into the treasure room); passable from t 0.8. */
  setDoorOpen(t) {
    this.doorT = Math.max(0, Math.min(1, +t || 0));
    const k = this.doorT * this.doorT * (3 - 2 * this.doorT);
    this.hinge.rotation.y = -k * 1.55;
    this.doorCollider.on = this.doorT < DOOR_OPEN;
  }

  /** Draws the light beam along world points [{x, y, z}…] (two or more), or hides it (null). */
  setBeam(points) {
    const pts = Array.isArray(points) && points.length >= 2 ? points : null;
    const key = pts ? pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`).join(';') : '';
    if (key === this.beamKey) return;
    this.beamKey = key;
    if (!pts) {
      this.beamCore.visible = this.beamGlow.visible = false;
      return;
    }
    const core = [];
    const glow = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    for (let i = 0; i + 1 < pts.length; i++) {
      a.set(pts[i].x, pts[i].y, pts[i].z);
      b.set(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      const len = a.distanceTo(b);
      if (len < 1e-3) continue;
      q.setFromUnitVectors(up, b.clone().sub(a).normalize());
      const mid = a.clone().add(b).multiplyScalar(0.5);
      for (const [list, r] of [[core, 0.022], [glow, 0.075]]) {
        const g = new THREE.CylinderGeometry(r, r, len, 8, 1, true);
        g.applyQuaternion(q);
        g.translate(mid.x, mid.y, mid.z);
        list.push(g);
      }
      // A soft round end where the light falls (on a mirror, the keyhole or a wall).
      const s = new THREE.SphereGeometry(0.09, 8, 6);
      s.translate(b.x, b.y, b.z);
      s.deleteAttribute('uv');
      glow.push(s);
    }
    for (const g of [...core, ...glow]) if (g.attributes.uv) g.deleteAttribute('uv');
    const set = (mesh, list) => {
      mesh.geometry.dispose();
      mesh.geometry = list.length ? mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))) : emptyGeo();
      for (const g of list) g.dispose();
      mesh.visible = list.length > 0;
    };
    set(this.beamCore, core);
    set(this.beamGlow, glow);
  }

  /** Lifts a rune chest's lid (provider runeChests id): t 0 shut … 1 open. */
  setChestOpen(id, t) {
    const c = this.chests.get(id);
    if (!c) return;
    c.t = Math.max(0, Math.min(1, +t || 0));
    c.hinge.rotation.x = c.t * 1.75;
  }

  /** Meshes for decor.js's per-view culling. */
  culledMeshes() {
    return [this.chestBodies];
  }

  /**
   * Per view (decor.js cullFor, after the terrain's): the door, the lids, the shirt, the sun disc are drawn only when a
   * chunk they stand in may be seen (each sits in one or two chunks: its keys are taken at a few of its points).
   */
  cullFor(visible) {
    if (!this.cullList) {
      const keysOf = (pts) => [...new Set(pts.map(([x, y, z]) => chunkKeyAt(x, y, z)).filter((k) => k >= 0))];
      const D = E.DOOR;
      this.cullList = [
        { objs: [this.hinge], keys: keysOf([[D.x, D.y + 0.2, D.z], [D.x, D.y + D.h, D.z], [D.x - 1.1, D.y + 0.8, D.z], [D.x + 0.2, D.y + 0.8, D.z - 0.5], [D.x + 0.2, D.y + 0.8, D.z + 0.5]]) },
        { objs: [this.sun], keys: keysOf([[E.SUN_SHAFT.x, E.SUN_SHAFT.top - 0.2, E.SUN_SHAFT.z]]) },
        { objs: [this.shirt], keys: keysOf([[E.MITHRIL.x, E.MITHRIL.y + 0.3, E.MITHRIL.z], [E.MITHRIL.x, E.MITHRIL.y + 1.2, E.MITHRIL.z]]) },
        ...[...this.chests.values()].map((c) => ({ objs: [c.hinge.parent], keys: keysOf([[c.spot.x - 0.6, c.spot.y + 0.5, c.spot.z - 0.6], [c.spot.x + 0.6, c.spot.y + 0.5, c.spot.z + 0.6], [c.spot.x - 0.6, c.spot.y + 1.4, c.spot.z + 0.6], [c.spot.x + 0.6, c.spot.y + 1.4, c.spot.z - 0.6]]) })),
      ];
    }
    for (const c of this.cullList) {
      let on = false;
      for (let i = 0; i < c.keys.length && !on; i++) on = visible[c.keys[i]] === 1;
      for (const o of c.objs) o.visible = on && (o !== this.shirt || !this.mithrilTaken);
    }
  }

  /* ---------------- save ---------------- */

  /** The state for the save: the mithril shirt taken (and by which character). */
  state() {
    return { mithril: this.mithrilTaken ? 1 : 0, by: this.mithrilBy };
  }

  restore(s) {
    if (!s) return;
    this.mithrilTaken = !!s.mithril;
    this.mithrilBy = s.by || null;
    this.shirt.visible = !this.mithrilTaken;
  }

  /* ---------------- per frame ---------------- */

  /** Per frame: the mithril shirt (its glint, the pickup), the cave-ins, the silver flashes. */
  update(dt, players) {
    this.time += dt;
    const game = players[0]?.game;
    // The shirt glints when somebody comes near; whoever comes up to it takes it.
    if (!this.mithrilTaken && this.shirt.visible) {
      const M = E.MITHRIL;
      let near = 0;
      for (const p of players) {
        if (p.dead > 0 || p.riding || p.choosing) continue;
        const d = Math.hypot(p.pos.x - M.x, p.pos.z - M.z);
        if (Math.abs(p.pos.y - M.y) > 1.6) continue;
        near = Math.max(near, 1 - Math.min(1, d / 4));
        if (d < 1.15) {
          this.takeMithril(p);
          break;
        }
      }
      const g = 0.08 + near * (0.18 + 0.12 * Math.sin(this.time * 3.1));
      this.shirtMat.emissive.setRGB(g * 0.85, g * 0.92, g);
      this.shirt.rotation.y = E.MITHRIL.yaw + Math.sin(this.time * 0.7) * 0.04;
    }
    this.updateCaveIn(dt, players);
    if (game) this.updateFlashes(dt, game);
  }

  /** The mithril shirt is found: it flies to the finder, who wears it (armour tier 4) and the case keeps its place. */
  takeMithril(p) {
    this.mithrilTaken = true;
    this.mithrilBy = p.ch?.id || null;
    this.shirt.visible = false;
    const game = p.game;
    const type = FIND_TYPES.find((t) => t.id === 'mithril');
    const done = () => {
      p.incoming = Math.max(0, (p.incoming || 0) - 1);
      p.setArmour(Math.max(p.armour | 0, 4));
      game?.bagEnd?.addTrophy(type);
      this.flash(p, 1, 1.6);
      p.say('A mithrilpáncél! Ezüstösen csillan, könnyű, mint a toll, és erősebb az acélnál.', 7);
      p.say('Mostantól a lehulló kövek nem ártanak neked. (Zsáklak vitrinjében is helye van.)', 7);
      for (const q of game?.players || []) if (q !== p && !q.choosing) q.say(`${p.ch.name} megtalálta a mithrilpáncélt!`, 5);
      game?.saveNow?.();
    };
    this.flash(p, 0.7, 0.9);
    if (game?.finds && type) {
      p.incoming = (p.incoming || 0) + 1;
      game.finds.fly({ type, x: E.MITHRIL.x, y: E.MITHRIL.y + 0.9, z: E.MITHRIL.z, rot: new THREE.Euler(0, E.MITHRIL.yaw, 0) }, p, done);
    } else done();
  }

  /* ---------------- cave-ins ---------------- */

  /** A player the rock may fall on: in layer 8, out of the carved halls, walking about. */
  exposed(p) {
    if (p.dead > 0 || p.riding || p.choosing || p.pos.y > -472 || p.pos.y < E.ER_BOTTOM - 6) return false;
    if (p.game?.bagEnd?.isInside(p)) return false;
    return !E.inCarvedHall(p.pos.x, p.pos.y + 0.5, p.pos.z);
  }

  /** Starts a cave-in round player `p` now (QA calls it too): the rumble, then the stones. */
  startCaveIn(p) {
    this.caveIn = { p, t: 0, dropped: false, hit: new Set() };
    for (const q of p.game?.players || [p]) if (q.dead <= 0 && Math.hypot(q.pos.x - p.pos.x, q.pos.y - p.pos.y, q.pos.z - p.pos.z) < 14) q.say('Megremeg a hegy… Kövek hullanak!', 3);
    if (!this.mute) this.rumble.play(0.9);
  }

  updateCaveIn(dt, players) {
    // The clock runs while somebody is exposed (in the old workings).
    const exposed = players.filter((p) => this.exposed(p));
    if (!this.caveIn && exposed.length && !players[0]?.game?.bench) {
      this.caveT -= dt;
      if (this.caveT <= 0) {
        this.caveT = CAVE_IN.every[0] + Math.random() * (CAVE_IN.every[1] - CAVE_IN.every[0]);
        this.startCaveIn(exposed[Math.floor(Math.random() * exposed.length)]);
      }
    }
    const c = this.caveIn;
    if (c) {
      c.t += dt;
      // The warning: the view shakes a little.
      for (const q of players) if (q.dead <= 0 && Math.hypot(q.pos.x - c.p.pos.x, q.pos.z - c.p.pos.z) < 8 && Math.abs(q.pos.y - c.p.pos.y) < 5) q.kick = Math.max(q.kick || 0, 0.35 + 0.25 * Math.sin(c.t * 40));
      if (!c.dropped && c.t >= CAVE_IN.warn) {
        c.dropped = true;
        this.dropStones(c.p);
      }
      if (c.dropped && !this.stones.some((s) => s.state === 'fall')) this.caveIn = null;
    }
    // The stones: fall, land (hitting whoever stands there), lie a while, sink away.
    if (!this.stones.length) {
      if (this.stoneMesh.visible) this.stoneMesh.visible = false;
      return;
    }
    let n = 0;
    for (const s of this.stones) {
      if (s.state === 'fall') {
        s.vy -= 18 * dt;
        s.y += s.vy * dt;
        s.rot += dt * 6;
        if (s.y <= s.floor) {
          s.y = s.floor;
          s.state = 'lie';
          s.t = 0;
          this.land(s, players);
        }
      } else {
        s.t += dt;
        if (s.t > CAVE_IN.stay) s.state = 'gone';
      }
      if (s.state === 'gone') continue;
      const k = s.state === 'lie' && s.t > CAVE_IN.stay - 1 ? Math.max(0.01, CAVE_IN.stay - s.t) : 1;
      this.q.setFromAxisAngle(this.v.set(0.6, 0.7, 0.3).normalize(), s.rot);
      this.m4.compose(this.v.set(s.x, s.y + s.size * 0.12 * k, s.z), this.q, this.sc.setScalar(s.size * k));
      this.stoneMesh.setMatrixAt(n++, this.m4);
    }
    this.stones = this.stones.filter((s) => s.state !== 'gone');
    this.stoneMesh.count = n;
    this.stoneMesh.visible = n > 0;
    this.stoneMesh.instanceMatrix.needsUpdate = true;
  }

  /** The stones of a cave-in: one right over the player (a still player is hit), the rest round him. */
  dropStones(p) {
    const up = new THREE.Vector3(0, 1, 0);
    const down = new THREE.Vector3(0, -1, 0);
    const o = new THREE.Vector3();
    for (let i = 0; i < CAVE_IN.stones && this.stones.length < STONE_N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = i === 0 ? 0.05 : 0.3 + Math.random() * CAVE_IN.radius;
      const x = p.pos.x + Math.cos(a) * r;
      const z = p.pos.z + Math.sin(a) * r;
      o.set(x, p.pos.y + 1.0, z);
      const tu = raycast(o, up, 4.5);
      const top = tu < 0 ? p.pos.y + 4.5 : p.pos.y + 1.0 + tu - 0.2;
      o.set(x, top, z);
      const td = raycast(o, down, 8);
      if (td < 0) continue;
      const floor = top - td;
      this.stones.push({ x, z, y: top + i * 0.18, vy: -0.5 - Math.random(), floor, size: i === 0 ? 1.15 : 0.6 + Math.random() * 0.7, rot: Math.random() * 6, state: 'fall', t: 0 });
    }
  }

  /** A stone landed: whoever stands under it is hit (once per cave-in). */
  land(s, players) {
    const c = this.caveIn;
    for (const p of players) {
      if (p.dead > 0 || p.riding || (c && c.hit.has(p))) continue;
      if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > CAVE_IN.hitR * Math.max(0.8, s.size) || Math.abs(p.pos.y - s.floor) > 1.2) continue;
      if (c) c.hit.add(p);
      this.hitBy(p, s);
    }
  }

  /** What a falling stone does to a player, by the armour (enemies/armour.js; TERV 0.4 and 0.12). */
  hitBy(p, s) {
    p.kick = 1;
    const arm = armourOf(p);
    if ((p.armour | 0) >= 4) {
      this.flash(p, 1, 1.0);
      p.say('A mithrilpáncél felfogta a köveket: meg sem érezted.', 4);
      return 'mithril';
    }
    if (arm.rockProof) {
      p.addHunger(-4);
      p.say('A páncélod felfogta a lehulló követ.', 3.5);
      return 'armour';
    }
    const a = Math.atan2(p.pos.z - s.z, p.pos.x - s.x) + (Math.random() - 0.5);
    p.knock(Math.cos(a), Math.sin(a), 3.2);
    p.addHunger(-10);
    p.say('Egy lehulló kő leütött! (A törpe láncing megvédene.)', 4);
    return 'hurt';
  }

  /* ---------------- the silver flash at the screen's edge (per player, in the player's HUD) ---------------- */

  /** Flashes player p's screen edge silver: strength 0..1 for `dur` seconds (TERV 0.12, the mithril shirt). */
  flash(p, strength = 1, dur = 1) {
    this.flashes.set(p, { k: strength, dur, t: 0, el: this.flashes.get(p)?.el || null, host: this.flashes.get(p)?.host || null });
  }

  /** The current flash strength of a player's screen edge (0 when none; QA reads it). */
  flashLevel(p) {
    const f = this.flashes.get(p);
    if (!f || f.t >= f.dur) return 0;
    return f.k * (1 - f.t / f.dur);
  }

  updateFlashes(dt, game) {
    for (const [p, f] of this.flashes) {
      f.t += dt;
      const i = game.players.indexOf(p);
      const host = i >= 0 ? game.huds?.[i]?.el : null;
      if (host && f.host !== host) {
        f.el?.remove();
        f.el = document.createElement('div');
        Object.assign(f.el.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3', opacity: '0', boxShadow: 'inset 0 0 110px 34px rgba(226,236,250,0.95), inset 0 0 26px 6px rgba(255,255,255,0.9)' });
        host.appendChild(f.el);
        f.host = host;
      }
      const op = this.flashLevel(p);
      if (f.el) {
        const s = op.toFixed(3);
        if (f.el.style.opacity !== s) f.el.style.opacity = s;
      }
      if (f.t >= f.dur && f.el) f.el.style.opacity = '0';
    }
  }
}
