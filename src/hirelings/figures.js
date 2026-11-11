/* ==== hirelings/figures.js — the hired dwarves standing at their work sites (NOTES-42-hirelings) ====
 * No walking, no AI: after each shift a working dwarf stands still where he last worked (beside Óin's or Glóin's newest
 * lantern, on the explored floor of the layer Ori maps or the gleaners search, at the bottom of Fíli's stair). All of
 * them are ONE merged mesh (home-events/figures.js dwarfGeometry: the Unexpected Party's colours) on the Shire's
 * vertex-coloured Lambert, rebuilt only when a spot changes (once per shift), drawn only when one of their chunks may be
 * seen (decor.js CULL_HOOKS). No collider: a player walks through them. Not saved (placed again on the next shift). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, CHUNK, CX, CY, CZ, ORIGIN } from '../config.js';
import { dwarfGeometry } from '../home-events/figures.js';
import { BY_ID } from './rules.js';

const S = CHUNK * CELL;
const chunkOf = (x, y, z) => {
  const cx = Math.floor((x - ORIGIN.x) / S);
  const cy = Math.floor((y - ORIGIN.y) / S);
  const cz = Math.floor((z - ORIGIN.z) / S);
  if (cx < 0 || cy < 0 || cz < 0 || cx >= CX || cy >= CY || cz >= CZ) return -1;
  return cx + CX * (cy + CY * cz);
};

export class Figures {
  constructor(game, mat) {
    this.game = game;
    this.mat = mat || new THREE.MeshLambertMaterial({ vertexColors: true });
    this.spots = new Map(); // id → { x, y, z, yaw }
    this.geos = new Map(); // id → geometry (built once)
    this.mesh = null;
    this.keys = new Set();
    this.dirty = false;
    this.on = true;
  }

  set(id, spot) {
    if (!spot) return this.drop(id);
    const o = this.spots.get(id);
    if (o && o.x === spot.x && o.y === spot.y && o.z === spot.z && o.yaw === spot.yaw) return;
    this.spots.set(id, spot);
    this.dirty = true;
  }

  drop(id) {
    if (this.spots.delete(id)) this.dirty = true;
  }

  clear() {
    if (this.spots.size) this.dirty = true;
    this.spots.clear();
  }

  /** Rebuilds the merged mesh when a spot changed (call once per frame at most; cheap when clean). */
  sync() {
    if (!this.dirty) return;
    this.dirty = false;
    const list = [];
    const keys = new Set();
    for (const [id, s] of this.spots) {
      let g = this.geos.get(id);
      if (!g) {
        const d = BY_ID[id];
        g = dwarfGeometry({ hood: d.hood, beard: d.beard });
        this.geos.set(id, g);
      }
      const m = new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.x, s.y, s.z);
      list.push(g.clone().applyMatrix4(m));
      keys.add(chunkOf(s.x, s.y + 0.6, s.z));
    }
    keys.delete(-1);
    this.keys = keys;
    if (!list.length) {
      if (this.mesh) this.mesh.visible = false;
      this.count = 0;
      return;
    }
    const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
    geo.computeBoundingSphere();
    if (!this.mesh) {
      this.mesh = new THREE.Mesh(geo, this.mat);
      this.mesh.name = 'hire-figures';
      this.mesh.frustumCulled = false;
      this.mesh.matrixAutoUpdate = false;
      this.mesh.visible = false;
      this.game.scene?.add(this.mesh);
    } else {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
    }
    this.count = list.length;
  }

  setOn(on) {
    this.on = on;
    if (!on && this.mesh) this.mesh.visible = false;
  }

  cullFor(visible) {
    if (!this.mesh) return;
    let on = false;
    if (this.on && this.spots.size) for (const k of this.keys) if (visible[k] === 1) { on = true; break; }
    this.mesh.visible = on;
  }
}
