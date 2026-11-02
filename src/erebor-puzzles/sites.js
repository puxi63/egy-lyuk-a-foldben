/* ==== erebor-puzzles/sites.js — where Durin's Day door, its mirror sockets and the rune-locked chests are: the
   interface to layer 8 ("Erebor tárnái", 470–580 m), built by the world work in underground/erebor-sites.js
   EREBOR_SITE_PROVIDER and drawn by underground/erebor-fx.js. Until that provider exists the puzzles stay idle in
   normal play; QA scripts register a carved test site (addTest), as laketown-events/sites.js does. ==== */

/**
 * The provider (what layer 8 hands over; every field optional):
 *   inErebor(x, y, z)     true inside layer 8's site (air or close to it)
 *   ereborFactor(y)       0..1 how deep into layer 8
 *   door {x, y, z, nx, nz, w, h}   Durin's door: the middle of its foot, the outward normal (towards the players), size
 *   lightSource {x, y, z, [dx, dz] | [dir] | [yaw]}   where the setting sun's light comes in, and its direction in xz
 *   lightSource without a direction and right above a socket: the light comes straight down onto that socket
 *   mirrorSockets [{id, x, y, z}]  the sockets a mirror can stand in (floor points), a 2D grid in xz
 *   beamY                          the beam's height over the sockets' y (the mirrors' centre; default 0)
 *   keyholeCone                    radians off the door's normal within which the keyhole takes the light
 *   mirrorSpots [{x, y, z}]        optional: where the loose mirrors stand at first (else beside the sockets)
 *   keyhole {x, y, z}              the keyhole in the door
 *   behindDoor {x, y, z} | {x0, x1, y0, y1, z0, z1}   the treasure room (its middle at floor height, or its box)
 *   runeChests [{id, x, y, z, yaw}] the rune-locked chests (foot of the chest; yaw as three.js: 0 faces −z)
 *   fx  the effects module (erebor-fx.js): setDoorOpen(t), setBeam(points | null), setChestOpen(id, t)
 */
export const NO_EREBOR = {
  inErebor: () => false, ereborFactor: () => 0, door: null, lightSource: null, mirrorSockets: [], mirrorSpots: null,
  keyhole: null, behindDoor: null, runeChests: [], fx: null,
};

/** Accepts {x,y,z} or [x,y,z]. */
export function pt(q) {
  if (!q) return null;
  return Array.isArray(q) ? { x: q[0], y: q[1], z: q[2] } : q;
}

export class EreborSites {
  constructor() {
    this.provider = NO_EREBOR;
    this.test = null;
    this.version = 0; // bumped when the provider or the test site changes
  }

  /** Sets layer 8's provider (with its effects module as `fx`). */
  use(provider) {
    this.provider = { ...NO_EREBOR, ...(provider || {}) };
    this.version++;
  }

  /** A QA test site (carved rooms with the same fields as a provider); null removes it. */
  addTest(site) {
    this.test = site ? { ...NO_EREBOR, ...site } : null;
    this.version++;
  }

  get src() {
    return this.test || this.provider;
  }

  get live() {
    return this.src !== NO_EREBOR && (!!this.src.door || this.chests.length > 0);
  }

  inErebor(x, y, z) {
    const s = this.src;
    if (s.inErebor) return !!s.inErebor(x, y, z);
    return (s.ereborFactor?.(y) || 0) > 0.5;
  }

  get door() { return this.src.door || null; }
  get keyhole() { return pt(this.src.keyhole); }
  get beamY() { return this.src.beamY || 0; }
  get cone() { return this.src.keyholeCone ?? undefined; }

  /** The treasure room's middle at floor height (a box gives its centre). */
  get behindDoor() {
    const b = this.src.behindDoor;
    if (b && b.x0 != null) return { x: (b.x0 + b.x1) / 2, y: b.y0, z: (b.z0 + b.z1) / 2 };
    return pt(b);
  }

  /** The sockets with y at the beam's height (the mirror's centre) and floorY. */
  get sockets() {
    const by = this.beamY;
    return (this.src.mirrorSockets || []).map((s, k) => {
      const q = pt(s);
      return { id: s.id ?? k, x: q.x, y: q.y + by, z: q.z, floorY: by ? q.y : q.y - 1 };
    });
  }
  get spots() { return (this.src.mirrorSpots || []).map(pt); }
  get chests() { return (this.src.runeChests || []).map((c, k) => ({ id: c.id ?? k, yaw: c.yaw || 0, ...pt(c) })); }
  get fx() { return this.src.fx || null; }

  /** A chest's front direction in xz (yaw as three.js: 0 faces −z). */
  static front(c) {
    return { x: -Math.sin(c.yaw || 0), z: -Math.cos(c.yaw || 0) };
  }

  /**
   * The light's entry point and its unit direction in xz: the provider's dx/dz, dir or yaw. Without one: straight
   * down (`down`) when a socket lies right below it (beam.js socketUnder), else towards the nearest socket.
   */
  get light() {
    const L = this.src.lightSource;
    if (!L) return null;
    const p = pt(L);
    let dx = L.dx ?? L.dir?.x ?? L.dir?.[0];
    let dz = L.dz ?? L.dir?.z ?? L.dir?.[2];
    if (dx == null && L.yaw != null) {
      dx = -Math.sin(L.yaw);
      dz = -Math.cos(L.yaw);
    }
    if (dx == null) {
      let best = null;
      for (const s of this.sockets) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (!best || d < best.d) best = { d, s };
      }
      if (best && best.d < 0.6) return { x: p.x, y: p.y, z: p.z, dx: 0, dz: 0, down: true };
      dx = best ? best.s.x - p.x : 1;
      dz = best ? best.s.z - p.z : 0;
    }
    const l = Math.hypot(dx, dz) || 1;
    return { x: p.x, y: p.y, z: p.z, dx: dx / l, dz: dz / l, down: false };
  }
}
