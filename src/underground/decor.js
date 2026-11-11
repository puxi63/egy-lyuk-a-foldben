/* ==== underground/decor.js — the dressing of the underground layers: builds every buried set piece (pieces.js,
   coop.js) into a few merged meshes per layer and material (drawn after the terrain, so whatever is still buried
   costs little: early depth rejection), registers the big pieces' colliders with world.sdf(), runs the atmosphere
   and the co-op doors. Goblin-town (layer 4: goblin-pieces.js, goblin-fx.js, firelight.js, stone-giants.js) and
   Gollum's lake (layer 5: lake-pieces.js, lake-water.js) and the roots of Mirkwood (layer 6: mirkwood-pieces.js,
   mirkwood-fx.js, mirkwood-water.js) are built here too.
   Wiring (game.js): `this.decor = new Decor(this.scene, this.terrain)` after the terrain, and once per frame
   `this.decor.update(dt, this.players, intents)` (intents[i] = player i's intent, for `interactPressed`). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, CHUNK, CX, CY, CZ, ORIGIN } from '../config.js';
import { setPropField } from '../world.js';
import { addSoilShader } from '../terrain.js';
import { Atmosphere } from './atmosphere.js';
import { buildCoopStatic, Coop } from './coop.js';
import { colliderSdf, Kit, rgb } from './kit.js';
import { buildCellars, buildGardenThings, buildRoots, buildTrollCave, buildWell } from './pieces.js';
import { requestGen } from './gen.js';
import { makeDecorTextures } from './soil-textures.js';
import { buildGoblinTown } from './goblin-pieces.js';
import { buildFlames, GoblinDrums } from './goblin-fx.js';
import { goblinFactor } from './goblin-sites.js';
import { addFireLight, setFires } from './firelight.js';
import { buildLake } from './lake-pieces.js';
import { LakeWater } from './lake-water.js';
import { StoneGiants } from './stone-giants.js';
import { buildMirkwood } from './mirkwood-pieces.js';
import { MirkwoodFx } from './mirkwood-fx.js';
import { MirkwoodWater, rootSlide } from './mirkwood-water.js';
import { MIRK_SHADE_Y } from './mirkwood-sites.js';
// Beneath Lake-town (layer 7, NOTES-5a-laketown).
import { buildLaketown } from './laketown-pieces.js';
import { LaketownFx } from './laketown-fx.js';
import { LaketownWater } from './laketown-water.js';
import { LT_SHADE_Y } from './laketown-sites.js';
// The mines of Erebor (layer 8, NOTES-6a-erebor).
import { buildErebor } from './erebor-pieces.js';
import { EreborFx } from './erebor-fx.js';
// Smaug's treasury (layer 9, NOTES-7a-hoard).
import { buildHoard } from './hoard-pieces.js';
import { HoardFx } from './hoard-fx.js';
// trolls (NOTES-24-trolls): the waking trolls move in the stone and plant materials' vertex shaders.
import { patchTrollMaterial, trollUv } from '../trolls/pose.js';

/**
 * NOTES-42-hirelings: per-view hooks, called at the end of cullFor as hook(visible chunk mask, camera) — the hired
 * dwarves' lanterns, Fíli's planks and the standing figures are drawn only when one of their chunks may be seen.
 */
export const CULL_HOOKS = [];

/** Depth bands (world y) in which a layer group is drawn: shown while any player is inside the band. */
const BANDS = { l1: [-17, 99], l2: [-76, -39], l3: [-127, -95], l4u: [-250, -146], l4h: [-250, -146], l4l: [-250, -146], l5: [-312, -228], l6: [-400, -296], l7: [-480, -347], l8: [-590, -462], l9: [-640, -576] };

/** A fern frond on a canvas (for the ferns that grow on the stone trolls). */
function makeFernTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  const stem = (x0, y0, len, bend, w) => {
    g.strokeStyle = '#3e5a1e';
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = x0 + Math.sin(t * 1.4) * bend;
      const y = y0 - t * len;
      pts.push([x, y, t]);
      g.lineTo(x, y);
    }
    g.stroke();
    // Leaflets, shorter towards the tip.
    for (const [x, y, t] of pts) {
      if (t < 0.08) continue;
      const l = (1 - t) * 34 + 4;
      for (const s of [-1, 1]) {
        g.fillStyle = t > 0.5 ? '#6a9a32' : '#557f28';
        g.beginPath();
        g.ellipse(x + s * l * 0.5, y - l * 0.18, l * 0.5, 3.2, s * -0.35, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  stem(64, 252, 236, 10, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A clump of crossed fern fronds rising from a point, leaning out. */
function fernClump(K, p, seed, scale = 1) {
  K.at(p[0], p[1], p[2], 0);
  for (let i = 0; i < 6; i++) {
    const a = seed * 1.7 + (i / 6) * Math.PI * 2;
    const h = (0.45 + ((seed * 13 + i * 7) % 5) * 0.06) * scale;
    const g = new THREE.PlaneGeometry(h * 0.5, h);
    g.translate(0, h / 2, 0);
    g.rotateX(-0.55 - (i % 2) * 0.25);
    K.part('plant', g, rgb(0xb0c890), 0, -0.04, 0, 0, a, 0, 1, 0.15);
  }
}

export class Decor {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../terrain.js').Terrain} terrain its soil texture array is shared with the carved stone
   */
  constructor(scene, terrain) {
    const t0 = performance.now();
    this.scene = scene;
    const { brick, wood } = makeDecorTextures();
    const stone = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x2a2826, shininess: 24 });
    addSoilShader(stone, terrain.soilTex, { fixed: new THREE.Vector4(0, 1, 0.68, 0), bump: 0.006 });
    patchTrollMaterial(stone, 'uv', 'soil-fixed-0.006-trollpose'); // trolls (NOTES-24-trolls): a waking troll's pose
    /** Shared materials (one draw call per layer group and material). */
    this.mats = {
      wood: new THREE.MeshPhongMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 1.2, vertexColors: true, specular: 0x141210, shininess: 14 }),
      brick: new THREE.MeshPhongMaterial({ map: brick.map, bumpMap: brick.bump, bumpScale: 2, vertexColors: true, specular: 0x181614, shininess: 10 }),
      metal: new THREE.MeshPhongMaterial({ map: terrain.detail, vertexColors: true, specular: 0x5a5650, shininess: 48 }),
      glazed: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x6a6a6a, shininess: 70 }),
      water: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0xb0b8c0, shininess: 140 }),
      matte: new THREE.MeshLambertMaterial({ map: terrain.detail, vertexColors: true }),
      stone,
      // Carved Misty Mountains rock (Goblin-town): the soil shader's fourth layer.
      stone4: (() => {
        const m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x222428, shininess: 20 });
        addSoilShader(m, terrain.soilTex, { fixed: new THREE.Vector4(0, 0, 0.5, 1), bump: 0.006 });
        return m;
      })(),
      // Carved wet rock of Gollum's lake (layer 5): the soil shader's lake layer, very wet (NOTES-3a-lake).
      stone5: (() => {
        const m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x2c3036, shininess: 34 });
        addSoilShader(m, terrain.soilTex, { fixed: new THREE.Vector4(0, 1, 0.85, 0), bump: 0.006 });
        return m;
      })(),
      // Layer 6 (NOTES-4a-mirkwood): the thin roots' bark and the Elvenking's carved stone (the soil shader's own
      // layers below 296 m: the first fixed weight is the bark, the fourth the carved stone).
      bark6: (() => {
        const m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x1c1a16, shininess: 16 });
        addSoilShader(m, terrain.soilTex, { fixed: new THREE.Vector4(1, 0, 0.45, 0), bump: 0.006 });
        return m;
      })(),
      stone6: (() => {
        const m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x2a2826, shininess: 22 });
        addSoilShader(m, terrain.soilTex, { fixed: new THREE.Vector4(0, 0, 0.1, 1), bump: 0.006 });
        return m;
      })(),
      // Layer 8 (NOTES-6a-erebor): the carved, polished green hall stone and the raw dwarf stone (the soil shader's own
      // layers below 470 m: the first fixed weight is the hall stone, the second the dwarf stone), and gold.
      stone8: (() => {
        const m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x3a4a40, shininess: 40 });
        addSoilShader(m, terrain.soilTex, { fixed: new THREE.Vector4(1, 0, 0.42, 0), bump: 0.006 });
        return m;
      })(),
      stone8d: (() => {
        const m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x2a302c, shininess: 24 });
        addSoilShader(m, terrain.soilTex, { fixed: new THREE.Vector4(0, 1, 0.18, 0), bump: 0.006 });
        return m;
      })(),
      gold: new THREE.MeshPhongMaterial({ map: terrain.detail, vertexColors: true, specular: 0xffd890, shininess: 70, emissive: 0x1a1204 }),
      // Layer 9 (NOTES-7a-hoard): clean polished gold for the treasury's bands and urns (no grain texture).
      gold9: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0xffe0a0, shininess: 80, emissive: 0x2e2006 }),
      ember: new THREE.MeshBasicMaterial({ vertexColors: true }),
      plant: new THREE.MeshLambertMaterial({ map: makeFernTexture(), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }),
    };
    // Goblin-town's torches light the timber, the iron and the cloth too (nothing changes where no fire is near).
    // trolls (NOTES-24-trolls): the ferns on the stone trolls move with a waking troll (only they use this material).
    patchTrollMaterial(this.mats.plant, 'pos', 'troll-ferns-v1');
    addFireLight(this.mats.wood, 0.75);
    addFireLight(this.mats.metal, 0.8);
    addFireLight(this.mats.matte);
    addFireLight(this.mats.water, 0.5);
    // ---- build every set piece ----
    const K = new Kit();
    const info = {};
    const tm = {};
    let tt = performance.now();
    const lap = (name) => {
      const n = performance.now();
      tm[name] = Math.round(n - tt);
      tt = n;
    };
    lap('textures');
    buildRoots(K);
    buildWell(K);
    buildGardenThings(K);
    lap('layer1');
    buildCellars(K);
    lap('layer2');
    buildTrollCave(K, info);
    lap('layer3');
    buildCoopStatic(K);
    K.group = 'l3';
    info.ferns.forEach((p, i) => fernClump(K, p, i, 0.9 + (i % 3) * 0.15));
    lap('l3ferns');
    const gob = {};
    buildGoblinTown(K, gob);
    this.goblin = gob;
    lap('layer4');
    // Gollum's lake (layer 5, lake-pieces.js).
    const lake = {};
    buildLake(K, lake);
    this.lake = lake;
    lap('layer5');
    // The roots of Mirkwood (layer 6, mirkwood-pieces.js).
    const mirk = {};
    buildMirkwood(K, mirk);
    this.mirk = mirk;
    lap('layer6');
    // Beneath Lake-town (layer 7, laketown-pieces.js).
    const lt = {};
    buildLaketown(K, lt);
    this.laketown = lt;
    lap('layer7');
    // The mines of Erebor (layer 8, erebor-pieces.js).
    const er = {};
    buildErebor(K, er);
    this.erebor = er;
    lap('layer8');
    // Smaug's treasury (layer 9, hoard-pieces.js).
    const hd = {};
    buildHoard(K, hd);
    this.hoard = hd;
    lap('layer9');
    this.info = info;
    this.builtTris = K.tris;
    // ---- merged meshes per group and material ----
    this.groups = {};
    for (const name of Object.keys(BANDS)) {
      const g = new THREE.Group();
      g.name = `decor-${name}`;
      scene.add(g);
      this.groups[name] = g;
    }
    for (const [group, mats] of K.merge()) {
      for (const [mat, geo] of mats) {
        const m = new THREE.Mesh(geo, this.mats[mat]);
        m.matrixAutoUpdate = false;
        // After the terrain: the soil in front rejects the hidden parts early.
        m.renderOrder = 1;
        m.name = `${group}-${mat}`;
        this.groups[group].add(m);
        this.addCulled(m);
      }
    }
    // ---- colliders (sorted by height for a quick band reject) and the moving co-op parts ----
    this.colliders = K.colliders;
    // The stone giants in Goblin-town (stone-giants.js): their slabs' colliders join before the sort below.
    this.giants = new StoneGiants(this.groups.l4h, this.mats, this.colliders);
    this.coop = new Coop(this.mats, this.groups, this.colliders);
    // Mirkwood's fire list: the halls' wall torches, then per feast clearing its fire and its four torch poles (whose
    // strength the feast lights fade). The webs, the cell doors, the trapdoor and the feast lights: mirkwood-fx.js.
    const feastFire = [];
    const mirkFires = [...mirk.fires];
    for (const f of mirk.feast) {
      feastFire.push(mirkFires.length);
      mirkFires.push([...f.fire, 1.6, Math.random() * 6], ...f.poles.map((q) => [q[0], q[1] + 0.1, q[2], 0.8, Math.random() * 6]));
    }
    this.mirkFires = Float32Array.from(mirkFires.flat());
    this.mirkFx = new MirkwoodFx(this.groups.l6, this.mats, this.colliders, mirk.feast, this.mirkFires, feastFire);
    // Layer 7: the flood surfaces (the laketown-events work raises them), the nets, the Master's chest.
    this.laketownFx = new LaketownFx(this.groups.l7, this.mats, this.colliders);
    // Layer 8: Durin's Day door, the beam, the rune chests, the mithril shirt, the cave-ins.
    this.ereborFx = new EreborFx(this.groups.l8, this.mats, this.colliders);
    // Layer 9: Smaug (game.smaug) and his colliders, the loose hoard, the Arkenstone, the scorches (NOTES-7a-hoard).
    this.hoardFx = new HoardFx(this.groups.l9, scene, this.mats, this.colliders);
    this.colliders.sort((a, b) => a.y - b.y);
    this.colliderY = Float32Array.from(this.colliders, (c) => c.y);
    this.maxBr = Math.max(...this.colliders.map((c) => c.br));
    this.field = (x, y, z) => this.sdf(x, y, z);
    setPropField(this.field);
    this.atmosphere = new Atmosphere(scene, info.embers, this.groups.l3);
    // ---- Goblin-town: flames, sparks, the fire lights, the climbable ladders, the drums ----
    this.flames = buildFlames(gob.flames);
    this.groups.l4h.add(this.flames);
    this.addCulled(this.flames);
    // The sparks are culled per view like the meshes (the chunks their points are in).
    this.addCulled(this.atmosphere.addSparks(gob.sparks, this.groups.l4h));
    /** Fire lights: x, y, z, strength, phase per fire (firelight.js picks the nearest per view). */
    this.fires = Float32Array.from(gob.fires.flat());
    /** Climbable goblin ladders (game.js hands them to props.js Ladders.addFixed). */
    this.fixedLadders = gob.ladders;
    this.drums = new GoblinDrums();
    // ---- Gollum's lake: the water surface (lake-water.js), culled per view like the meshes; drips ring on it ----
    this.lakeWater = new LakeWater(this.groups.l5);
    this.addCulled(this.lakeWater.mesh);
    this.atmosphere.lake = this.lakeWater;
    // ---- the roots of Mirkwood: the torches' flames, the water (stream, river), the webs and the feast lights ----
    this.mirkFlames = buildFlames(mirk.flames);
    this.mirkFlames.name = 'l6-flames';
    this.groups.l6.add(this.mirkFlames);
    this.addCulled(this.mirkFlames);
    this.mirkWater = new MirkwoodWater(this.groups.l6);
    this.addCulled(this.mirkWater.stream);
    this.addCulled(this.mirkWater.river);
    for (const m of this.mirkFx.culledMeshes()) this.addCulled(m);
    // ---- beneath Lake-town: the pools, the channel and the stream ----
    this.laketownWater = new LaketownWater(this.groups.l7);
    this.addCulled(this.laketownWater.pools);
    this.addCulled(this.laketownWater.flow);
    for (const m of this.laketownFx.culledMeshes()) this.addCulled(m);
    for (const m of this.ereborFx.culledMeshes()) this.addCulled(m);
    this.time = 0;
    // The stone trolls arrive from the generator worker (about a second of meshing off the main thread).
    this.trollsReady = requestGen('trolls').then((r) => this.addTrolls(r.meshes, r.ms));
    lap('merge');
    this.buildMs = performance.now() - t0;
    /** Build time per stage (ms), for the notes and the bench. */
    this.timing = tm;
  }

  /** Places the three trolls' meshes (raw arrays from the worker), merged into one mesh with the carved-stone material. */
  addTrolls(meshes, ms) {
    const m4 = new THREE.Matrix4();
    const parts = this.info.trolls.map((t) => {
      const raw = meshes[t.index];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(raw.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(raw.normal, 3));
      // trolls (NOTES-24-trolls): the uv (unused by the carved stone) tags the troll for its pose in the shader.
      g.setAttribute('uv', new THREE.BufferAttribute(raw.uv.fill(trollUv(t.index)), 2));
      g.setAttribute('color', new THREE.BufferAttribute(raw.color, 3));
      g.applyMatrix4(m4.makeRotationY(t.yaw).setPosition(t.x, t.y, t.z));
      return g;
    });
    const merged = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, this.mats.stone);
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 1;
    mesh.name = 'l3-trolls';
    this.groups.l3.add(mesh);
    this.addCulled(mesh);
    this.trollTris = merged.attributes.position.count / 3;
    this.timing.trollsWorker = Math.round(ms);
  }

  /**
   * Registers a static merged mesh for the per-view culling (cullFor): the chunks its triangles reach into. A mesh
   * that reaches outside the diggable block (the garden things on the surface) is always drawn.
   */
  addCulled(m) {
    if (!this.culled) this.culled = [];
    const pos = m.geometry.attributes.position;
    const idx = m.geometry.index;
    const S = CHUNK * CELL;
    const n = idx ? idx.count : pos.count;
    const seen = new Uint8Array(CX * CY * CZ);
    const keys = [];
    const v = (k) => (idx ? idx.getX(k) : k);
    for (let t = 0; t + 2 < n; t += 3) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let c = 0; c < 3; c++) {
        const i = v(t + c);
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      const span = (a, b, o, cnt) => [Math.floor((a - 0.05 - o) / S), Math.floor((b + 0.05 - o) / S), cnt];
      const [i0, i1] = span(x0, x1, ORIGIN.x);
      const [j0, j1] = span(y0, y1, ORIGIN.y);
      const [k0, k1] = span(z0, z1, ORIGIN.z);
      if (i0 < 0 || j0 < 0 || k0 < 0 || i1 >= CX || j1 >= CY || k1 >= CZ) return; // reaches outside the block
      for (let k = k0; k <= k1; k++) {
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const key = i + CX * (j + CY * k);
            if (!seen[key]) {
              seen[key] = 1;
              keys.push(key);
            }
          }
        }
      }
    }
    this.culled.push({ mesh: m, keys: Int32Array.from(keys) });
  }

  /**
   * Per view, after Terrain.cullFor: a static mesh is drawn only when one of its chunks may be seen (a piece in
   * chunks no line of sight reaches cannot show a pixel). The layer bands of update() still apply on top.
   * @param {Uint8Array} visible per chunk key, 1 when the chunk may be seen in this view
   * @param {THREE.Camera} [camera] the view's camera: Goblin-town's nearest fires light this view
   */
  cullFor(visible, camera) {
    for (const c of this.culled || []) {
      let on = false;
      for (let i = 0; i < c.keys.length && !on; i++) on = visible[c.keys[i]] === 1;
      c.mesh.visible = on;
    }
    // Layer 8's door, chest lids, mithril shirt, sun disc (erebor-fx.js): by their chunks too.
    this.ereborFx?.cullFor(visible);
    // Layer 9's loot, stone and Smaug: by the hall's chunks (hoard-fx.js).
    this.hoardFx?.cullFor(visible);
    if (camera) {
      // The fires around a point 4 m ahead of the eye (the ones the player looks at, not the ones behind).
      const f = (this.fireFocus ||= new THREE.Vector3());
      camera.getWorldDirection(f).multiplyScalar(4).add(camera.position);
      // Goblin-town's fires, or in layer 6 the Elvenking's torches and the feast lights (none in layer 5: the loop ends
      // at once there).
      // Beneath Lake-town (layer 7) nothing burns.
      if (camera.position.y < LT_SHADE_Y) setFires(this.mirkFires, f, this.time, false);
      else if (camera.position.y < MIRK_SHADE_Y) setFires(this.mirkFires, f, this.time, true);
      else setFires(this.fires, f, this.time, camera.position.y < -146 && camera.position.y > -232);
    }
    for (const h of CULL_HOOKS) h(visible, camera); // NOTES-42-hirelings: the hired dwarves' lanterns, stair, figures
  }

  /** Signed distance (m, positive inside) to the nearest solid set piece; −1 when none is near. */
  sdf(x, y, z) {
    const list = this.colliders;
    // Height bands (NOTES-29-final): per 1 m band the colliders whose box reaches into it. The old search scanned every
    // collider within ±maxBr (8 m since Erebor's big pieces): ~290 per call in Goblin-town, 2–3 ms a frame.
    if (this.bandsFor !== this.colliderY) this.buildBands();
    const b = Math.floor(y - this.bandY0);
    if (b < 0 || b >= this.bands.length) return -1;
    const idx = this.bands[b];
    let best = -1;
    for (let k = 0; k < idx.length; k++) {
      const c = list[idx[k]];
      if (!c.on) continue;
      const r = c.br + 0.05;
      if (Math.abs(x - c.x) > r || Math.abs(y - c.y) > r || Math.abs(z - c.z) > r) continue;
      const d = colliderSdf(c, x, y, z);
      if (d > best) best = d;
    }
    return best;
  }

  /**
   * Builds the height bands of `sdf()` from the collider list (again whenever `colliderY` is replaced, as hoard/neck.js
   * does after adding its colliders). A collider's `y` is fixed; its `br` too, except Smaug's live neck capsules, whose
   * `br` changes every frame up to `maxBr` (they are switched off above it), so they are filed with `maxBr`.
   */
  buildBands() {
    const list = this.colliders;
    const reach = (c) => (c.smaugNeck ? this.maxBr : c.br) + 0.05;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const c of list) {
      y0 = Math.min(y0, c.y - reach(c));
      y1 = Math.max(y1, c.y + reach(c));
    }
    this.bandY0 = Math.floor(y0);
    const n = Math.max(0, Math.ceil(y1) - this.bandY0 + 1);
    const tmp = Array.from({ length: n }, () => []);
    list.forEach((c, i) => {
      const r = reach(c);
      const b0 = Math.max(0, Math.floor(c.y - r - this.bandY0));
      const b1 = Math.min(n - 1, Math.floor(c.y + r - this.bandY0));
      for (let b = b0; b <= b1; b++) tmp[b].push(i);
    });
    this.bands = tmp.map((a) => Int32Array.from(a));
    this.bandsFor = this.colliderY;
  }

  /**
   * Per frame: which layer groups are drawn (by the players' depths), the atmosphere and the co-op doors.
   * `intents[i]` is player i's intent (its `interactPressed` pulls levers and presses runes), or null.
   */
  update(dt, players, intents = null) {
    for (const [name, [ylo, yhi]] of Object.entries(BANDS)) {
      let on = false;
      for (const p of players) if (p.pos.y > ylo && p.pos.y < yhi) on = true;
      this.groups[name].visible = on;
    }
    this.atmosphere.update(dt, players);
    this.coop.update(dt, players, intents);
    // Goblin-town: the flames' clock, the drums (by how far inside the deepest-in player is), a first warning.
    this.time += dt;
    this.flames.material.uniforms.uTime.value = this.time;
    let level = 0;
    for (const p of players) {
      // Only in and just above layer 4 (150–230 m): not at Gollum's lake and deeper.
      if (p.pos.y > -140 || p.pos.y < -232) continue;
      level = Math.max(level, 0.35 + 0.65 * goblinFactor(p.pos.x, p.pos.y + 1, p.pos.z));
      if (!p.warnedGoblin && p.pos.y < -147 && p.dead <= 0) {
        p.warnedGoblin = true;
        p.say('Goblinváros fölött jársz: alattad mély szakadékok vannak. Óvatosan áss!', 6);
      }
    }
    if (!this.mute) this.drums.update(dt, level);
    // The stone giants' quakes (Goblin-town) and Gollum's lake (the water's clock, rings and drips).
    this.giants.mute = this.lakeWater.mute = !!this.mute;
    this.giants.update(dt, players);
    this.lakeWater.update(dt, players);
    // The roots of Mirkwood (layer 6): a first warning over the root hall, the flames, the doors and feast lights,
    // the water and the enchanted stream's sleep.
    for (const p of players) {
      if (!p.warnedMirk && p.pos.y < -301 && p.pos.y > -312 && p.dead <= 0) {
        p.warnedMirk = true;
        p.say('Bakacsinerdő gyökerei fölött jársz: alattad a gyökerek között hatalmas üreg tátong. Óvatosan áss!', 6);
      }
      // A fall in the root hall is caught on a giant root (NOTES-18-levelfix).
      if (p.pos.y < -312 && p.pos.y > -330) rootSlide(p, dt);
    }
    if (this.groups.l6.visible) {
      this.mirkFlames.material.uniforms.uTime.value = this.time;
      this.mirkFx.update(dt, players);
      this.mirkWater.mute = !!this.mute;
      this.mirkWater.update(dt, players);
    }
    // Beneath Lake-town (layer 7): a first warning over the pile cavern, the water, the flood surfaces, the chest.
    for (const p of players) {
      if (!p.warnedLake7 && p.pos.y < -391.5 && p.pos.y > -396 && p.dead <= 0) {
        p.warnedLake7 = true;
        p.say('Tóváros alatt jársz: alattad a régi cölöpök között magas üreg nyílik, és víz szivárog a falakból. Óvatosan áss!', 6);
      }
    }
    if (this.groups.l7.visible) {
      this.laketownWater.update(dt, players);
      this.laketownFx.update(dt, players);
    }
    // The mines of Erebor (layer 8): a first warning over the mine level, the shirt, the cave-ins, the silver flashes.
    for (const p of players) {
      if (!p.warnedErebor && p.pos.y < -471 && p.pos.y > -476 && p.dead <= 0) {
        p.warnedErebor = true;
        p.say('Erebor tárnái fölött jársz: alattad a törpék régi bányajáratai. Óvatosan áss, a kő itt-ott beomlik!', 6);
      }
    }
    this.ereborFx.mute = !!this.mute;
    this.ereborFx.update(dt, players);
    // Smaug's treasury (layer 9): the loot settling, the Arkenstone's glow, Smaug's colliders (src/hoard/ runs Smaug).
    if (this.groups.l9.visible || this.hoardFx.smaug.busy) this.hoardFx.update(dt);
  }

  /** Draw calls and triangles the decor can add per view (all groups visible). */
  stats() {
    let calls = 0;
    let tris = 0;
    for (const g of Object.values(this.groups)) {
      g.traverse((o) => {
        if (!o.isMesh && !o.isPoints) return;
        calls++;
        if (o.geometry.index) tris += o.geometry.index.count / 3;
        else if (o.isMesh) tris += o.geometry.attributes.position.count / 3;
      });
    }
    return { calls, tris: Math.round(tris), colliders: this.colliders.length, buildMs: Math.round(this.buildMs), timing: this.timing };
  }
}
