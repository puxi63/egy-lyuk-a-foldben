/* ==== gollum/sites.js — where Gollum lives: the interface between Gollum, the riddle game, the Ring and the lake world
   of layer 5 (built in parallel by the world work in underground/lake-sites.js, LAKE_SITE_PROVIDER). Until the lake
   exports its points the provider is empty (Gollum does not appear in normal play, the Ring does not lie anywhere) and
   QA scripts register a carved test cavity, as enemies/sites.js does for the goblins. ==== */
import { sdf } from '../world.js';
import { floorBelow } from '../enemies/sites.js';

/**
 * A lake provider (what the lake world hands over; NOTES-3b-gollum):
 *   waterLevel            y of the lake's surface
 *   inWater(x, y, z)      true in the water
 *   inside(x, y, z)       true in the lake's cave (Gollum stays in it unless the Ring draws him out)
 *   island      {x,y,z}   Gollum's slimy rock island (his home)
 *   riddleSpot  {x,y,z,yaw}  where he crouches for the riddle game (yaw: the way he faces, towards the shore)
 *   lurkPoints  [{x,y,z}] dark floor points where he watches from
 *   swimPath    [{x,y,z}] his boat's way from the island to the shore (first point at the island)
 *   ringSpot    {x,y,z}   where the Ring lies on the tunnel floor, in the dark
 */
export const NO_LAKE = { waterLevel: -Infinity, inWater: () => false, inside: () => false, island: null, riddleSpot: null, lurkPoints: [], swimPath: [], ringSpot: null };

export class LakeSites {
  constructor() {
    this.provider = NO_LAKE;
    this.test = null;
  }

  /** Sets the lake's provider (see NO_LAKE for the fields). */
  use(provider) {
    this.provider = { ...NO_LAKE, ...(provider || {}) };
    this.test = null;
  }

  /**
   * A test cavity (carved with digSphere by a QA script, centre at the floor level y + 0.35): a stand-in lake without
   * water. The island is at the −x end, the riddle spot a little −x of the centre facing +x, the boat's path runs over
   * the floor from the island towards the riddle spot, the Ring lies near the +z wall, lurk points along the walls.
   */
  addTest(x, y, z, rx, rz = rx) {
    const at = (px, pz) => floorBelow(px, y + 2.2, pz, 6) || { x: px, y: y - 0.3, z: pz };
    const lurk = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      lurk.push(at(x + Math.cos(a) * rx * 0.82, z + Math.sin(a) * rz * 0.78));
    }
    const island = at(x - rx * 0.85, z);
    const rs = at(x - rx * 0.3, z);
    const path = [];
    for (let k = 0; k <= 6; k++) path.push(at(x - rx * 0.85 + (k / 6) * rx * 0.5, z - rz * 0.3 * Math.sin((k / 6) * Math.PI)));
    this.test = { x, y, z, rx, rz };
    this.provider = {
      ...NO_LAKE,
      inside: (px, py, pz) => ((px - x) / (rx + 4)) ** 2 + ((pz - z) / (rz + 4)) ** 2 < 1 && Math.abs(py - y) < 8,
      island,
      riddleSpot: { ...rs, yaw: -Math.PI / 2 },
      lurkPoints: lurk,
      swimPath: path,
      ringSpot: at(x + rx * 0.4, z + rz * 0.62),
    };
  }

  /** True once a lake (or a test cavity) exists: Gollum and the Ring only appear then. */
  get active() {
    return !!this.provider.riddleSpot;
  }

  inside(x, y, z) {
    return !!this.provider.inside(x, y, z);
  }

  inWater(x, y, z) {
    return !!this.provider.inWater(x, y, z);
  }

  get island() {
    return this.provider.island;
  }

  get riddleSpot() {
    return this.provider.riddleSpot;
  }

  get lurkPoints() {
    return this.provider.lurkPoints || [];
  }

  get swimPath() {
    return this.provider.swimPath || [];
  }

  get ringSpot() {
    return this.provider.ringSpot;
  }

  get waterLevel() {
    return this.provider.waterLevel ?? -Infinity;
  }
}

/** The floor under a point, snapped (used while crawling); falls back to the point itself in the open. */
export function snapFloor(x, y, z, out) {
  const f = floorBelow(x, y + 1.2, z, 3);
  if (f) out.set(f.x, f.y - 0.1, f.z);
  else out.set(x, y, z);
  return out;
}

/** True when a point is in the air (not inside the rock). */
export function inAir(x, y, z) {
  return sdf(x, y, z) <= 0;
}
