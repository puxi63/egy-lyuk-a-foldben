/* ==== mirkwood-foes/sites.js — where the spiders, the Elvenking's guards and the barrels live: the interface to layer 6
   (Mirkwood's roots, built by the world work in underground/mirkwood-sites.js MIRKWOOD_SITE_PROVIDER). Until that
   provider is wired in game.js, nothing appears in normal play; QA scripts register a carved test site (addTest),
   as enemies/sites.js does for the goblins. ==== */
import { floorBelow } from '../enemies/sites.js';

/**
 * The provider (what layer 6 hands over; every field optional):
 *   inside(x, y, z)  true inside the spiders' part of Mirkwood's roots (spiders are kept around a player inside)
 *   spiderNests  [{ x, y, z, r }]        nests: spiders lurk on threads above them
 *   webSheets    [{ x, y, z, nx, ny, nz, w, h }]  sticky web sheets (centre, normal, width, height in metres)
 *   spiderPatrol [{ x, y, z }]            floor points the spiders crawl between
 *   elfPatrol    [{ x, y, z }]            floor points of the Elvenking's halls the guards walk between
 *   cells        [{ x, y, z, yaw, door: { x, y, z } }]  dungeon cells (floor centre, facing, the door's centre)
 *   cellar       { x, y, z }              the wine cellar (the barrels stand here)
 *   trapdoor     { x, y, z }              the trapdoor over the underground river
 *   riverPath    [{ x, y, z }]            the river's course (water surface points); the last one is the exit
 */
export const NO_MIRKWOOD = {
  inside: () => false, spiderNests: [], webSheets: [], spiderPatrol: [], elfPatrol: [], cells: [], cellar: null, trapdoor: null, riverPath: [],
};

export class MirkwoodSites {
  constructor() {
    this.provider = NO_MIRKWOOD;
    this.test = null;
    this.version = 0; // bumped when the provider or the test site changes (the webs are rebuilt)
  }

  /** Sets layer 6's provider. */
  use(provider) {
    this.provider = { ...NO_MIRKWOOD, ...(provider || {}) };
    this.version++;
  }

  /** A QA test site (a carved cavity with the same fields as a provider). */
  addTest(site) {
    this.test = { ...NO_MIRKWOOD, ...site };
    this.version++;
  }

  get src() {
    return this.test || this.provider;
  }

  inside(x, y, z) {
    return !!this.src.inside(x, y, z);
  }

  /** True inside the Elvenking's halls (near an elf patrol point, a cell or the cellar). */
  inHalls(x, y, z) {
    const s = this.src;
    if (s.inHalls) return !!s.inHalls(x, y, z);
    const near = (q, r) => q && (q.x - x) ** 2 + (q.y - y) ** 2 + (q.z - z) ** 2 < r * r;
    return s.elfPatrol.some((q) => near(q, 16)) || s.cells.some((q) => near(q, 8)) || near(s.cellar, 10);
  }

  get spiderNests() { return this.src.spiderNests || []; }
  get webSheets() { return this.src.webSheets || []; }
  get spiderPatrol() { return this.src.spiderPatrol || []; }
  get elfPatrol() { return this.src.elfPatrol || []; }
  get cells() { return this.src.cells || []; }
  get cellar() { return this.src.cellar || null; }
  get trapdoor() { return this.src.trapdoor || null; }
  get riverPath() { return this.src.riverPath || []; }
}

export { floorBelow };
