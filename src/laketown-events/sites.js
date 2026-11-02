/* ==== laketown-events/sites.js — where the rising water, the currents and Bárd live: the interface to layer 7
   ("Tóváros alatt", 390–470 m), built by the world work in underground/laketown-sites.js LAKETOWN_SITE_PROVIDER and
   drawn by underground/laketown-fx.js. Until that provider is wired in game.js nothing happens in normal play; QA
   scripts register a carved test site (addTest), as mirkwood-foes/sites.js does. ==== */

/**
 * The provider (what layer 7 hands over; every field optional):
 *   inLaketown(x, y, z)   true inside layer 7's site (air or close to it)
 *   laketownFactor(y)     0..1 how deep into layer 7 (as lakeFactor / mirkwoodFactor)
 *   cavities  [{ id, min: {x,y,z}, max: {x,y,z}, floorY, topY, exits: [{x,y,z}], breach: {x,y,z} }]
 *             the cavities that can flood: their box, the floor and roof heights, the ways out (dry points above the
 *             highest water) and the weak spot in the wall where a bad pick stroke lets the lake in
 *   currents  [{ points: [{x,y,z}], width, speed }]   flowing channels (water surface points along the flow)
 *   inCurrent(pos)        the flow velocity {x, z} (m/s) at a point, or null outside the channels
 *   waterLevel(x, z)      the standing water's surface height at a column (−Infinity where there is none)
 *   bardStall {x, y, z, yaw}  where Bárd stands (by the layer-7 lift)
 *   famous    {x, y, z}       the layer's famous find (the world work's)
 *   fx        the effects module (laketown-fx.js): setFloodLevel(cavityId, y), floodLevel(cavityId)
 */
export const NO_LAKETOWN = {
  inLaketown: () => false, laketownFactor: () => 0, cavities: [], currents: [], inCurrent: null, waterLevel: () => -Infinity,
  bardStall: null, famous: null, fx: null,
};

/** Accepts {x,y,z} or [x,y,z]. */
export function pt(q) {
  if (!q) return null;
  return Array.isArray(q) ? { x: q[0], y: q[1], z: q[2] } : q;
}

/** Distance of a point to the segment a–b in the xz plane, with the segment parameter. */
function segDist(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
  return { d: Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)), t, dx, dz, l: Math.sqrt(l2) };
}

/**
 * A current's flow at a point from its polyline alone (used when the provider gives `currents` but no inCurrent): the
 * flow along the nearest segment within the channel's half width (full in the middle, half at the edge), within 1.6 m
 * of the water surface.
 */
export function flowFromCurrents(currents, pos, out = { x: 0, z: 0 }) {
  let best = null;
  for (const c of currents) {
    const P = c.points;
    if (!P || P.length < 2) continue;
    const hw = (c.width || 2) / 2;
    for (let i = 0; i < P.length - 1; i++) {
      const a = pt(P[i]);
      const b = pt(P[i + 1]);
      const s = segDist(pos.x, pos.z, a, b);
      if (s.d > hw) continue;
      const y = a.y + (b.y - a.y) * s.t;
      if (pos.y > y + 0.3 || pos.y < y - 1.6) continue;
      if (!best || s.d < best.d) best = { d: s.d, hw, s, speed: c.speed || 1.5 };
    }
  }
  if (!best) return null;
  const k = best.speed * (1 - 0.5 * (best.d / best.hw));
  out.x = (best.s.dx / best.s.l) * k;
  out.z = (best.s.dz / best.s.l) * k;
  return out;
}

export class LaketownSites {
  constructor() {
    this.provider = NO_LAKETOWN;
    this.test = null;
    this.version = 0; // bumped when the provider or the test site changes
    this.flowOut = { x: 0, z: 0 };
  }

  /** Sets layer 7's provider (with its effects module as `fx`). */
  use(provider) {
    this.provider = { ...NO_LAKETOWN, ...(provider || {}) };
    this.version++;
  }

  /** A QA test site (a carved cavity with the same fields as a provider). */
  addTest(site) {
    this.test = site ? { ...NO_LAKETOWN, ...site } : null;
    this.version++;
  }

  get src() {
    return this.test || this.provider;
  }

  get live() {
    return this.src !== NO_LAKETOWN && (this.cavities.length > 0 || this.currents.length > 0 || !!this.bardStall);
  }

  inLaketown(x, y, z) {
    return !!this.src.inLaketown?.(x, y, z);
  }

  get cavities() { return this.src.cavities || []; }
  get currents() { return this.src.currents || []; }
  get bardStall() { return pt(this.src.bardStall); }
  get fx() { return this.src.fx || null; }

  /** The flow velocity {x, z} at a point, or null (the provider's inCurrent, else from the currents' polylines). */
  inCurrent(pos) {
    const s = this.src;
    if (s.inCurrent) {
      const f = s.inCurrent(pos);
      if (!f) return null;
      this.flowOut.x = f.x || 0;
      this.flowOut.z = f.z || 0;
      return this.flowOut;
    }
    return this.currents.length ? flowFromCurrents(this.currents, pos, this.flowOut) : null;
  }

  waterLevel(x, z) {
    const v = this.src.waterLevel?.(x, z);
    return Number.isFinite(v) ? v : -Infinity;
  }
}
