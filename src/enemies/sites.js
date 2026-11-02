/* ==== enemies/sites.js — where goblins live: the interface between the goblins and Goblin-town (layer 4, built by the
   world work in underground/). Until Goblin-town exports its own points, the provider is empty (no goblins appear in
   normal play) and tests register a carved test cavity. ==== */
import { CELL, CHUNK, CX, CY, CZ, ORIGIN } from '../config.js';
import { sdf } from '../world.js';

/**
 * A site provider (what Goblin-town hands over): every method is optional.
 *   spawnPoints()   [{ x, y, z }]  walkable floor points where goblins may appear (out of sight is chosen here)
 *   patrolPoints()  [{ x, y, z }]  walkable floor points the goblins wander between
 *   tunnelMouths()  [{ x, y, z, nx, nz }]  side-tunnel mouths (goblin night: the raiders come out of these; n points
 *                   out of the tunnel into the open)
 *   inside(x, y, z) true inside Goblin-town (goblins are kept up there while a player is inside)
 */
export const NO_SITES = { spawnPoints: () => [], patrolPoints: () => [], tunnelMouths: () => [], inside: () => false };

export class GoblinSites {
  constructor() {
    this.provider = NO_SITES;
    this.tests = [];
  }

  /** Sets Goblin-town's provider (see NO_SITES for the methods). */
  use(provider) {
    this.provider = { ...NO_SITES, ...(provider || {}) };
  }

  /** A test cavity (carved with digSphere by a QA script): goblins spawn and patrol in it. */
  addTest(x, y, z, r) {
    this.tests.push({ x, y, z, r });
  }

  spawnPoints() {
    const out = [...this.provider.spawnPoints()];
    for (const t of this.tests) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const p = floorBelow(t.x + Math.cos(a) * t.r * 0.7, t.y, t.z + Math.sin(a) * t.r * 0.7);
        if (p) out.push(p);
      }
    }
    return out;
  }

  patrolPoints() {
    const out = [...this.provider.patrolPoints()];
    for (const t of this.tests) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        const p = floorBelow(t.x + Math.cos(a) * t.r * 0.45, t.y, t.z + Math.sin(a) * t.r * 0.45);
        if (p) out.push(p);
      }
    }
    return out;
  }

  tunnelMouths() {
    return this.provider.tunnelMouths();
  }

  /** True where goblins are at home (Goblin-town, or a test cavity). */
  inside(x, y, z) {
    if (this.provider.inside(x, y, z)) return true;
    for (const t of this.tests) if ((x - t.x) ** 2 + (y - t.y) ** 2 + (z - t.z) ** 2 < (t.r + 4) ** 2) return true;
    return false;
  }
}

/** The floor under a point (air above solid), or null: a short walk down the density field. */
export function floorBelow(x, y, z, maxDrop = 12) {
  if (sdf(x, y, z) > 0) return null;
  for (let d = 0; d < maxDrop; d += 0.1) {
    if (sdf(x, y - d, z) > 0) return { x, y: y - d + 0.12, z };
  }
  return null;
}

const S = CHUNK * CELL;
/** The terrain chunk key of a point (terrain.cullFor's mask), or −1 outside the diggable block. */
export function chunkKey(x, y, z) {
  const cx = Math.floor((x - ORIGIN.x) / S);
  const cy = Math.floor((y - ORIGIN.y) / S);
  const cz = Math.floor((z - ORIGIN.z) / S);
  if (cx < 0 || cy < 0 || cz < 0 || cx >= CX || cy >= CY || cz >= CZ) return -1;
  return cx + CX * (cy + CY * cz);
}
