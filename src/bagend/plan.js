/* ==== bagend/plan.js — the floor plan of Bag End's interior: rooms, doorways, windows, floor heights, wall collision ====
 * The film's Bag End (and the book: "panelled walls, and floors tiled and carpeted", a hall with a wall clock and a
 * barometer, the best rooms on the left going in "for these were the only ones to have windows, deep-set round
 * windows looking over his garden", pantries, cellars, wardrobes). Local metres: the inside of the round front door
 * at the origin, the front wall (with the round windows) at z = 0, the hill behind it towards +z, y up, floor y = 0
 * (the cellar −1). Rooms are separated by 0.3 m walls; doorways are round-topped passages through them.
 *
 *            z=0  front wall: windows ───────────────────────────────────────────────
 *   bedroom |  dining  | hall |  parlour (fireplace)  | study
 *   ──────────────────────corridor (x −12 … 12) ───────────────────────────────────
 *     pantry  |  kitchen  | mathom room | cellar (steps down)                   z=11 */

export const WALL = 0.3;

/**
 * Rooms. axis: the barrel vault's axis ('x' or 'z'); H: wall height to the springing; rise: the vault's rise; floor:
 * floor height; walls: plaster | earth; wains: panel | tilewhite | null (the lower wall finish).
 */
export const ROOMS = [
  { id: 'eloszoba', name: 'Előszoba', x0: -1.8, x1: 1.8, z0: 0, z1: 4.2, axis: 'z', H: 2.05, rise: 0.75, floor: 0, floorTile: 'boards', walls: 'plaster', wains: 'panel' },
  { id: 'folyoso', name: 'Folyosó', x0: -12, x1: 12, z0: 4.5, z1: 6.5, axis: 'x', H: 2.05, rise: 0.5, floor: 0, floorTile: 'boards', walls: 'plaster', wains: 'panel' },
  { id: 'nappali', name: 'Nappali', x0: 2.1, x1: 8.1, z0: 0, z1: 4.2, axis: 'x', H: 2.05, rise: 0.8, floor: 0, floorTile: 'boards', walls: 'plaster', wains: 'panel' },
  { id: 'dolgozo', name: 'Dolgozószoba', x0: 8.4, x1: 12, z0: 0, z1: 4.2, axis: 'z', H: 2.05, rise: 0.75, floor: 0, floorTile: 'boards', walls: 'plaster', wains: 'panel' },
  { id: 'ebedlo', name: 'Ebédlő', x0: -8.1, x1: -2.1, z0: 0, z1: 4.2, axis: 'x', H: 2.05, rise: 0.8, floor: 0, floorTile: 'boards', walls: 'plaster', wains: 'panel' },
  { id: 'haloszoba', name: 'Hálószoba', x0: -12, x1: -8.4, z0: 0, z1: 4.2, axis: 'z', H: 2.05, rise: 0.75, floor: 0, floorTile: 'boards', walls: 'plaster', wains: 'panel' },
  { id: 'konyha', name: 'Konyha', x0: -6, x1: 0, z0: 6.8, z1: 11, axis: 'x', H: 2.05, rise: 0.75, floor: 0, floorTile: 'quarry', walls: 'plaster', wains: 'tilewhite' },
  { id: 'kamra', name: 'Kamra', x0: -11, x1: -6.3, z0: 6.8, z1: 11, axis: 'x', H: 2.05, rise: 0.65, floor: 0, floorTile: 'flags', walls: 'plaster', wains: null },
  { id: 'mathom', name: 'Mathom-szoba', x0: 0.3, x1: 6, z0: 6.8, z1: 11, axis: 'x', H: 2.05, rise: 0.75, floor: 0, floorTile: 'boards', walls: 'plaster', wains: 'panel' },
  { id: 'pince', name: 'Pince', x0: 6.3, x1: 12, z0: 6.8, z1: 11, axis: 'z', H: 2.2, rise: 1.0, floor: -1, floorTile: 'flags', walls: 'earth', wains: null },
];
ROOMS.forEach((r, i) => (r.index = i));
export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

/**
 * Doorways. line 'z': a wall along x at z0…z1 (the passage runs along z), `at` is its x; line 'x': a wall along z at
 * x0…x1, `at` is its z. w: width; h: height of the arch's top above y = 0; round: the front door (a closed disc, no
 * passage).
 */
export const DOORS = [
  { id: 'front', line: 'z', c0: -WALL, c1: 0, at: 0, w: 1.7, h: 1.77, round: true, rooms: ['eloszoba'] },
  { id: 'hall-corr', line: 'z', c0: 4.2, c1: 4.5, at: 0, w: 1.8, h: 1.95, rooms: ['eloszoba', 'folyoso'] },
  { id: 'hall-parlour', line: 'x', c0: 1.8, c1: 2.1, at: 2.7, w: 0.95, h: 1.95, rooms: ['eloszoba', 'nappali'] },
  { id: 'hall-dining', line: 'x', c0: -2.1, c1: -1.8, at: 2.7, w: 0.95, h: 1.95, rooms: ['eloszoba', 'ebedlo'] },
  { id: 'corr-parlour', line: 'z', c0: 4.2, c1: 4.5, at: 6.6, w: 0.95, h: 1.95, rooms: ['nappali', 'folyoso'] },
  { id: 'corr-dining', line: 'z', c0: 4.2, c1: 4.5, at: -6.6, w: 0.95, h: 1.95, rooms: ['ebedlo', 'folyoso'] },
  { id: 'corr-study', line: 'z', c0: 4.2, c1: 4.5, at: 10.2, w: 0.95, h: 1.95, rooms: ['dolgozo', 'folyoso'] },
  { id: 'corr-bed', line: 'z', c0: 4.2, c1: 4.5, at: -10.2, w: 0.95, h: 1.95, rooms: ['haloszoba', 'folyoso'] },
  { id: 'corr-kitchen', line: 'z', c0: 6.5, c1: 6.8, at: -3, w: 0.95, h: 1.95, rooms: ['folyoso', 'konyha'] },
  { id: 'corr-pantry', line: 'z', c0: 6.5, c1: 6.8, at: -8.65, w: 0.95, h: 1.95, rooms: ['folyoso', 'kamra'] },
  { id: 'corr-mathom', line: 'z', c0: 6.5, c1: 6.8, at: 3.15, w: 1.2, h: 1.95, rooms: ['folyoso', 'mathom'] },
  { id: 'corr-cellar', line: 'z', c0: 6.5, c1: 6.8, at: 9.15, w: 1.0, h: 1.95, rooms: ['folyoso', 'pince'] },
  { id: 'kitchen-pantry', line: 'x', c0: -6.3, c1: -6, at: 9.4, w: 0.95, h: 1.95, rooms: ['kamra', 'konyha'] },
];

/** Round windows in the front wall (z = 0): x, centre height, radius. */
export const WINDOWS = [
  { room: 'nappali', at: 3.6, y: 1.42, r: 0.42 },
  { room: 'nappali', at: 6.6, y: 1.42, r: 0.42 },
  { room: 'ebedlo', at: -5.1, y: 1.42, r: 0.43 },
  { room: 'dolgozo', at: 10.2, y: 1.42, r: 0.42 },
  { room: 'haloszoba', at: -10.2, y: 1.42, r: 0.42 },
];

/** The cellar stair: landing at y = 0 from the doorway, then steps down along +z to the cellar floor. */
export const STAIR = { x0: 8.4, x1: 9.9, landing: 7.5, z1: 8.7, steps: 5, top: 0, bottom: -1 };

/** Inside the inner face of the front door: where the player stands to leave, and where an entering player appears. */
export const ENTRY = { x: 0, z: 1.8, exitR: 1.35 };

/** The room containing a local point (or null). Doorway passages belong to no room. */
export function roomAt(x, z) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return null;
}

/** The nearest room to a local point (for lighting things that sit in a doorway). */
export function nearestRoom(x, z) {
  let best = ROOMS[0];
  let bd = Infinity;
  for (const r of ROOMS) {
    const dx = Math.max(r.x0 - x, 0, x - r.x1);
    const dz = Math.max(r.z0 - z, 0, z - r.z1);
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

/** Floor height at a local point: 0 everywhere, the cellar −1, the cellar stair in steps. */
export function floorAt(x, z) {
  const c = ROOM.pince;
  if (x > c.x0 - 0.01 && z > c.z0 - 0.01 && x < c.x1 && z < c.z1) {
    if (x >= STAIR.x0 && x <= STAIR.x1 && z < STAIR.z1) {
      if (z < STAIR.landing) return STAIR.top;
      const k = Math.min(STAIR.steps - 1, Math.floor(((z - STAIR.landing) / (STAIR.z1 - STAIR.landing)) * STAIR.steps));
      return STAIR.top + ((STAIR.bottom - STAIR.top) * (k + 1)) / (STAIR.steps + 0);
    }
    return c.floor;
  }
  return 0;
}

/**
 * Wall segments for collision, derived from the rooms and doorways: every room edge minus its doorway gaps, plus
 * the jambs of each passage. Each segment: { ax, az, bx, bz }.
 */
export function wallSegments() {
  const segs = [];
  const gapsOn = (r, side) => {
    const out = [];
    for (const d of DOORS) {
      if (d.round || !d.rooms.includes(r.id)) continue;
      if (d.line === 'z' && (side === 'z0' || side === 'z1')) {
        const z = side === 'z0' ? r.z0 : r.z1;
        if (Math.abs(z - d.c0) < 0.01 || Math.abs(z - d.c1) < 0.01) out.push([d.at - d.w / 2, d.at + d.w / 2]);
      }
      if (d.line === 'x' && (side === 'x0' || side === 'x1')) {
        const x = side === 'x0' ? r.x0 : r.x1;
        if (Math.abs(x - d.c0) < 0.01 || Math.abs(x - d.c1) < 0.01) out.push([d.at - d.w / 2, d.at + d.w / 2]);
      }
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  const addLine = (fixed, a, b, alongX, gaps) => {
    let s = a;
    for (const [g0, g1] of gaps) {
      if (g0 > s) segs.push(alongX ? { ax: s, az: fixed, bx: g0, bz: fixed } : { ax: fixed, az: s, bx: fixed, bz: g0 });
      s = Math.max(s, g1);
    }
    if (b > s) segs.push(alongX ? { ax: s, az: fixed, bx: b, bz: fixed } : { ax: fixed, az: s, bx: fixed, bz: b });
  };
  for (const r of ROOMS) {
    addLine(r.z0, r.x0, r.x1, true, gapsOn(r, 'z0'));
    addLine(r.z1, r.x0, r.x1, true, gapsOn(r, 'z1'));
    addLine(r.x0, r.z0, r.z1, false, gapsOn(r, 'x0'));
    addLine(r.x1, r.z0, r.z1, false, gapsOn(r, 'x1'));
  }
  for (const d of DOORS) {
    if (d.round) continue;
    const a = d.at - d.w / 2;
    const b = d.at + d.w / 2;
    if (d.line === 'z') {
      segs.push({ ax: a, az: d.c0, bx: a, bz: d.c1 }, { ax: b, az: d.c0, bx: b, bz: d.c1 });
    } else {
      segs.push({ ax: d.c0, az: a, bx: d.c1, bz: a }, { ax: d.c0, az: b, bx: d.c1, bz: b });
    }
  }
  // The cellar stair's open sides are not walls (the floor height blocks climbing back up the side).
  return segs;
}

/** Ceiling height above a local point inside a room (vault profile), for keeping heads below it. */
export function ceilingAt(x, z) {
  const r = roomAt(x, z);
  if (!r) return 1.95;
  const span0 = r.axis === 'x' ? r.z0 : r.x0;
  const span1 = r.axis === 'x' ? r.z1 : r.x1;
  const s = r.axis === 'x' ? z : x;
  const t = ((s - span0) / (span1 - span0)) * 2 - 1;
  return r.floor + r.H + r.rise * Math.sqrt(Math.max(0, 1 - t * t));
}
