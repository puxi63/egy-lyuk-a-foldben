/* ==== lighting.js — sky, sun, hemisphere light and fog of the Shire (golden afternoon), and the per-view blend into
   the darkness of the pit by the viewing player's depth (replaces the lerp that used to live in Game.render) ==== */
import * as THREE from 'three';
import { SKY_UNIFORMS } from './surface/sky.js';
import { goblinFactor } from './underground/goblin-sites.js';
import { lakeFactor } from './underground/lake-sites.js';
import { hallsFactor, mirkwoodFactor } from './underground/mirkwood-sites.js';
import { laketownFactor } from './underground/laketown-sites.js';
import { ereborFactor } from './underground/erebor-sites.js';
import { hoardFactor } from './underground/hoard-sites.js';

/** Surface (golden afternoon) and deep (lamp only) settings; the deep values are the phase-0 ones. */
export const LIGHT = {
  surface: {
    fog: new THREE.Color(0xc4d2cc),
    fogNear: 45,
    fogFar: 210,
    hemiSky: new THREE.Color(0xd6e4f0),
    hemiGround: new THREE.Color(0x6a5a34),
    hemi: 1.35,
    sunColor: new THREE.Color(0xffd6a0),
    sun: 2.7,
  },
  deep: {
    fog: new THREE.Color(0x07060a),
    fogNear: 4,
    fogFar: 26,
    hemiSky: new THREE.Color(0xdfefff),
    hemiGround: new THREE.Color(0x4a3a20),
    hemi: 0.3,
    sunColor: new THREE.Color(0xfff0d8),
    sun: 0,
  },
  /** Depth (m) where the blend starts and how many metres it takes. */
  depthStart: 1,
  depthRange: 12,
  /**
   * Below this depth the surface (group 'surface-root', all but the sky) is not drawn for that view: everything on it
   * is then farther away than the deep fog's far plane (26 m), so it was invisible anyway (saves ~13 draw calls and
   * ~90 k triangles per view underground).
   */
  hideSurfaceBelow: 28,
  /**
   * Inside Goblin-town's caverns (goblin-sites.js goblinFactor): smoky, firelit air that lets the torches show the
   * size of the hall (the deep fog would end the view at 26 m).
   */
  goblin: { fog: new THREE.Color(0x150d09), fogNear: 7, fogFar: 36, hemi: 0.26, hemiSky: new THREE.Color(0xffc8a0), hemiGround: new THREE.Color(0x3a2418) },
  /**
   * Gollum's lake (underground/lake-sites.js lakeFactor; TERV 0.12 "Gollam tavának hideg, kék sötétje"): no fire, a
   * cold blue air; a cold ambient lets the cave's shape, the island and the water show well beyond the lamp (brightened
   * 2026-10-29 at the user's request: "jobban lehessen látni a környéket"), and the fog reaches further than the deep
   * fog so the lake reads as wide.
   */
  lake: { fog: new THREE.Color(0x0b1828), fogNear: 7, fogFar: 44, hemi: 2.1, hemiSky: new THREE.Color(0x92b4e6), hemiGround: new THREE.Color(0x2a4058) },
  /**
   * The roots of Mirkwood (layer 6; underground/mirkwood-sites.js mirkwoodFactor; TERV 0.12 "Bakacsinerdő zöldes,
   * pókhálós homálya"): a dim green, misty gloom among the roots (the fog closes in early and is green-grey), and in
   * the Elvenking's carved halls (hallsFactor) a warmer, torchlit air (NOTES-4a-mirkwood).
   */
  mirkwood: { fog: new THREE.Color(0x0f1e12), fogNear: 4.5, fogFar: 30, hemi: 1.6, hemiSky: new THREE.Color(0xb0d098), hemiGround: new THREE.Color(0x3a3424) },
  halls: { fog: new THREE.Color(0x120d08), fogNear: 7, fogFar: 34, hemi: 0.62, hemiSky: new THREE.Color(0xe0c8a0), hemiGround: new THREE.Color(0x3a2c1e) },
  /**
   * Beneath Lake-town (layer 7; underground/laketown-sites.js laketownFactor; TERV 0.12 "Tóváros nedves, faszerkezetes
   * mélye"): a cold, murky grey-green dampness everywhere in the layer, as if under the lake's water (NOTES-5a-laketown).
   */
  laketown: { fog: new THREE.Color(0x0e1a17), fogNear: 5, fogFar: 30, hemi: 1.7, hemiSky: new THREE.Color(0xa6c4b6), hemiGround: new THREE.Color(0x2e3a32) },
  /**
   * The mines of Erebor (layer 8; underground/erebor-sites.js ereborFactor; TERV 0.12 "Erebor zöld-arany csarnokai"):
   * dry, still air with a dim gold light from above and a green one from the stone, and a fog that reaches far enough
   * to show the great hall's height (nothing burns: the forges are cold; NOTES-6a-erebor).
   */
  erebor: { fog: new THREE.Color(0x0b130f), fogNear: 8, fogFar: 46, hemi: 1.75, hemiSky: new THREE.Color(0xe6cc8c), hemiGround: new THREE.Color(0x2a4a3a) },
  /**
   * Smaug's treasury (layer 9; underground/hoard-sites.js hoardFactor; TERV 0.12 "Szmaug kincstára aranytengerrel"):
   * warm, still air, the gold's own glow from below and a dim green-gold from the stone above, a far fog so the vast
   * hall shows (NOTES-7a-hoard).
   */
  hoard: { fog: new THREE.Color(0x150f06), fogNear: 10, fogFar: 54, hemi: 1.9, hemiSky: new THREE.Color(0xb8c49a), hemiGround: new THREE.Color(0x9a6a22) },
};

/** Direction towards the sun: low in the south-west behind the pit as seen from Bag End, lighting the green door. */
const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();

const tmpC = new THREE.Color();

/**
 * The surface lighting rig. Create it once with the scene; call applyView(depth, renderer) before rendering each
 * player's viewport.
 */
export class SurfaceLighting {
  constructor(scene) {
    this.scene = scene;
    const s = LIGHT.surface;
    scene.fog = new THREE.Fog(s.fog.clone(), s.fogNear, s.fogFar);
    this.hemi = new THREE.HemisphereLight(s.hemiSky.clone(), s.hemiGround.clone(), s.hemi);
    this.sun = new THREE.DirectionalLight(s.sunColor.clone(), s.sun);
    this.sun.position.copy(SUN_DIR).multiplyScalar(100);
    this.sun.target.position.set(0, 0, 0);
    scene.add(this.hemi, this.sun, this.sun.target);
    SKY_UNIFORMS.uSunDir.value.copy(SUN_DIR);
    /** The colour of the last applied view (the clear colour). */
    this.fogColor = s.fog.clone();
    this.skyParts = null;
    this.skyDome = null;
    this.surfaceRoot = null;
    // daynight (NOTES-10-daynight): the surface palette of the current hour (daynight.js DayLook) and the panorama's
    // tint; null / white = the fixed golden afternoon of LIGHT.surface.
    this.tod = null;
    this.skyTint = new THREE.Color(1, 1, 1);
  }

  /**
   * Sets lights, fog, sky darkness and the clear colour for one player's view: daylight above, the lamp alone deep
   * down (0 at `depthStart`, fully dark `depthRange` metres lower).
   * @param {number} depth the viewing player's depth in metres below the surface (positive down)
   * @param {THREE.WebGLRenderer} [renderer] when given, its clear colour is set to the fog colour
   * @param {THREE.Vector3} [pos] the viewing player's position (Goblin-town's own air when inside it)
   */
  applyView(depth, renderer, pos) {
    const t = Math.min(1, Math.max(0, (depth - LIGHT.depthStart) / LIGHT.depthRange));
    const a = this.tod || LIGHT.surface; // daynight: the hour's surface palette
    const b = LIGHT.deep;
    const lerp = (x, y) => x + (y - x) * t;
    this.hemi.intensity = lerp(a.hemi, b.hemi);
    this.hemi.color.copy(a.hemiSky).lerp(b.hemiSky, t);
    this.hemi.groundColor.copy(a.hemiGround).lerp(b.hemiGround, t);
    this.sun.intensity = lerp(a.sun, b.sun);
    this.sun.color.copy(a.sunColor).lerp(b.sunColor, t); // daynight: the sun's / moon's colour of the hour
    // At zero the sun is left out of the shaders altogether (one light less per pixel underground, same picture).
    // game.js compiles the materials for both light sets at start, so switching does not stall.
    this.sun.visible = this.sun.intensity > 0;
    this.fogColor.copy(a.fog).lerp(b.fog, t);
    this.scene.fog.color.copy(this.fogColor);
    this.scene.fog.near = lerp(a.fogNear, b.fogNear);
    this.scene.fog.far = lerp(a.fogFar, b.fogFar);
    // Goblin-town: blend towards its smoky firelit air by how far inside the caverns the player is.
    const k = pos && depth > 140 ? goblinFactor(pos.x, pos.y + 1, pos.z) : 0;
    if (k > 0) {
      const gb = LIGHT.goblin;
      this.fogColor.lerp(gb.fog, k);
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.near += (gb.fogNear - this.scene.fog.near) * k;
      this.scene.fog.far += (gb.fogFar - this.scene.fog.far) * k;
      this.hemi.intensity += (gb.hemi - this.hemi.intensity) * k;
      this.hemi.color.lerp(gb.hemiSky, k);
      this.hemi.groundColor.lerp(gb.hemiGround, k);
    }
    // Gollum's lake (layer 5): the same blend towards its cold blue dark.
    const kl = pos && depth > 228 ? lakeFactor(pos.x, pos.y + 1, pos.z) : 0;
    if (kl > 0) {
      const lk = LIGHT.lake;
      this.fogColor.lerp(lk.fog, kl);
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.near += (lk.fogNear - this.scene.fog.near) * kl;
      this.scene.fog.far += (lk.fogFar - this.scene.fog.far) * kl;
      this.hemi.intensity += (lk.hemi - this.hemi.intensity) * kl;
      this.hemi.color.lerp(lk.hemiSky, kl);
      this.hemi.groundColor.lerp(lk.hemiGround, kl);
    }
    // The roots of Mirkwood (layer 6): the green gloom, then the halls' warmer air on top where carved.
    const km = pos && depth > 298 ? mirkwoodFactor(pos.x, pos.y + 1, pos.z) : 0;
    if (km > 0) {
      const kh = hallsFactor(pos.x, pos.y + 1, pos.z);
      for (const [mk, k] of [[LIGHT.mirkwood, km], [LIGHT.halls, kh]]) {
        if (k <= 0) continue;
        this.fogColor.lerp(mk.fog, k);
        this.scene.fog.color.copy(this.fogColor);
        this.scene.fog.near += (mk.fogNear - this.scene.fog.near) * k;
        this.scene.fog.far += (mk.fogFar - this.scene.fog.far) * k;
        this.hemi.intensity += (mk.hemi - this.hemi.intensity) * k;
        this.hemi.color.lerp(mk.hemiSky, k);
        this.hemi.groundColor.lerp(mk.hemiGround, k);
      }
    }
    // Beneath Lake-town (layer 7): the murky air by height (the whole layer).
    const k7 = pos && depth > 387 ? laketownFactor(pos.y + 1) : 0;
    if (k7 > 0) {
      const lt = LIGHT.laketown;
      this.fogColor.lerp(lt.fog, k7);
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.near += (lt.fogNear - this.scene.fog.near) * k7;
      this.scene.fog.far += (lt.fogFar - this.scene.fog.far) * k7;
      this.hemi.intensity += (lt.hemi - this.hemi.intensity) * k7;
      this.hemi.color.lerp(lt.hemiSky, k7);
      this.hemi.groundColor.lerp(lt.hemiGround, k7);
    }
    // The mines of Erebor (layer 8): their air by height, over layer 7's.
    const k8 = pos && depth > 470 ? ereborFactor(pos.y + 1) : 0;
    if (k8 > 0) {
      const er = LIGHT.erebor;
      this.fogColor.lerp(er.fog, k8);
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.near += (er.fogNear - this.scene.fog.near) * k8;
      this.scene.fog.far += (er.fogFar - this.scene.fog.far) * k8;
      this.hemi.intensity += (er.hemi - this.hemi.intensity) * k8;
      this.hemi.color.lerp(er.hemiSky, k8);
      this.hemi.groundColor.lerp(er.hemiGround, k8);
    }
    // Smaug's treasury (layer 9): its warm air by height, over layer 8's.
    const k9 = pos && depth > 580 ? hoardFactor(pos.y + 1) : 0;
    if (k9 > 0) {
      const hd = LIGHT.hoard;
      this.fogColor.lerp(hd.fog, k9);
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.near += (hd.fogNear - this.scene.fog.near) * k9;
      this.scene.fog.far += (hd.fogFar - this.scene.fog.far) * k9;
      this.hemi.intensity += (hd.hemi - this.hemi.intensity) * k9;
      this.hemi.color.lerp(hd.hemiSky, k9);
      this.hemi.groundColor.lerp(hd.hemiGround, k9);
    }
    SKY_UNIFORMS.uDark.value = t;
    // Fully dark the dome is exactly the fog colour, which is also the clear colour: not drawn at all then (checked
    // pixel for pixel; it still cost a full-screen depth test per view).
    if (!this.skyDome) this.skyDome = this.scene.getObjectByName('surface-sky') || null;
    if (this.skyDome) this.skyDome.visible = t < 1;
    // The painted panorama and the clouds are unfogged: dim them with the depth, hide them when fully dark.
    if (!this.skyParts) this.skyParts = ['surface-panorama', 'surface-clouds'].map((n) => this.scene.getObjectByName(n)).filter(Boolean);
    for (const o of this.skyParts) {
      o.visible = t < 0.99;
      o.material.color.copy(this.skyTint).multiplyScalar(1 - t); // daynight: tinted by the hour
    }
    if (!this.surfaceRoot) this.surfaceRoot = this.scene.getObjectByName('surface-root') || null;
    if (this.surfaceRoot) this.surfaceRoot.visible = depth < LIGHT.hideSurfaceBelow;
    if (renderer) renderer.setClearColor(tmpC.copy(this.fogColor));
    return t;
  }
}
