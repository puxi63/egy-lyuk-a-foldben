/* ==== underground/hoard-sites.js — Smaug's treasury (layer 9, 580 m and below; TERV 0.2 "Szmaug kincstára": gold,
   gems and once the Arkenstone; Smaug asleep; 0.12 "Szmaug kincstára aranytengerrel"): where everything is, the air
   it stamps into the density field, the sea of gold (a diggable heightfield of coins), the shading helpers and the
   hooks for the finale (the escape) and for the noise / Smaug logic (src/hoard/, src/smaug/).
   Pure data and maths (no three.js): world.js (through sites.js) uses hoardCavity() for generate(), materials.js asks
   inGold() / hoardHallWeight() per vertex, hoard-pieces.js and hoard-fx.js dress it from the same data.

   Canon (TERV Decision 18; NOTES-7a-hoard has the table): the great hall of the dwarves' treasury deep in the
   Mountain, Smaug asleep on the hoard with his wings folded, his belly crusted with gems (the book ch. 12: "a waistcoat
   of diamonds"), the great two-handled cup Bilbo carries off (ch. 12), the Arkenstone, the Heart of the Mountain (ch.
   13); the films' green-and-gold halls, the sea of gold coins in dunes, the long stairs without railings that cling to
   the walls (The Desolation of Smaug). Nothing named is invented: the pillars, the chests, the shields are generic.

   The layout (world y; the block's centre is x = z = 0; everything stays 1.75 m inside the block's walls):
   - THE ENTRY (584 m): a round domed chamber under layer 8's deepest gallery (its floor at 574 m, so 7.4 m of rock to
     dig: the same kind of short dig as into layer 8). Layer 8 is not touched (byte-identical, qa/hoard/ident.mjs).
   - THE SPIRAL STAIR: a carved dwarf stair winding down in the south-west corner tower (6.3 turns, slope 0.48) from
     the entry to the landing (620 m).
   - THE LANDING (620 m): the lift stop "Szmaug kincstára · 620 m" (the lift column at (−4, 9) is in it); it opens
     east onto the ledge.
   - THE LEDGE: a stone stair-ramp without a railing along the hall's south wall, round the corner and down the east
     wall to the gold (the films' stairs on the walls), 10 m above the gold at the top.
   - THE HALL: 20.5 × 20.5 m (less the corner tower) and 28 m high from its stone floor (634 m) to the stepped roof's
     crown; three great pillars; the sea of gold in dunes over the floor (1.5–6 m deep), a great heap in the middle where
     Smaug sleeps, a small dune by the west wall with the Arkenstone half buried in it.
   ==== */
import { fbm3, noise2 } from '../noise.js';

/* ---------------------------------------------------------------- shared helpers ---- */

/** The layer's top (world y). Below HOARD_SHADE_Y materials.js and the soil shader read layer 9's channels. */
export const HOARD_TOP = -580;
export const HOARD_SHADE_Y = -580;

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const smoothstep = (a, b, x) => smooth01((x - a) / (b - a));
const fix = (v, n = 2) => +v.toFixed(n);
const hyp = (a, b) => Math.sqrt(a * a + b * b);

/* ---------------------------------------------------------------- the hall ---- */

/** The treasury hall: plan half size, stone floor, wall height, the stepped roof's rise per metre towards the middle. */
export const HALL9 = { a: 10.25, floor: -634, wall: 22, rise: 0.6 };
/** The hall's roof height over a plan point (walls up to `wall`, then a stepped roof rising to the middle). */
export function hall9Roof(x, z) {
  return HALL9.floor + HALL9.wall + HALL9.rise * (HALL9.a - Math.max(Math.abs(x), Math.abs(z)));
}
/** The solid corner tower in the south-west (x < x1, z > z0) that holds the spiral stair. */
export const TOWER = { x1: -3.4, z0: 3.4 };
/** The three great pillars (square, half size `h`; the tower stands in the fourth corner). */
export const PILLARS9 = [[5.6, 5.6], [5.6, -5.6], [-5.6, -5.6]].map(([x, z]) => ({ x, z, h: 1.0 }));

/** Smaug's lair: the heap's centre (his coil lies round it) and the way his head points (three.js yaw, 0 = −z). */
export const LAIR = { x: 0.6, z: -0.6, heapR: 3.4, heapH: 2.7 };
/** The Arkenstone's dune by the west wall (clear of the pillars, across the hoard from the ledge's foot). */
const ARK_DUNE = { x: -7.4, z: -1.8, r: 1.5, h: 1.15 };

/**
 * The gold's surface height (world y) over a plan point: dunes, ridges, the great heap under Smaug, the Arkenstone's
 * dune, the gold heaped against the walls. Deterministic (generate() stamps it; the finds and the dressing sit on it).
 */
let lastGX = NaN;
let lastGZ = NaN;
let lastGY = 0;
export function goldTop(x, z) {
  if (x === lastGX && z === lastGZ) return lastGY;
  const dune = (fbm3(x * 0.15 + 3.7, 4.2, z * 0.15 - 1.9) - 0.5) * 2.4;
  const ripple = (noise2(x * 0.62 + 11.3, z * 0.38 - 7.1) - 0.5) * 0.32;
  const hr = (x - LAIR.x) * (x - LAIR.x) + (z - LAIR.z) * (z - LAIR.z);
  const heap = LAIR.heapH * Math.exp(-hr / (2 * LAIR.heapR * LAIR.heapR));
  const ar = (x - ARK_DUNE.x) * (x - ARK_DUNE.x) + (z - ARK_DUNE.z) * (z - ARK_DUNE.z);
  const ark = ARK_DUNE.h * Math.exp(-ar / (2 * ARK_DUNE.r * ARK_DUNE.r));
  const wd = HALL9.a - Math.max(Math.abs(x), Math.abs(z));
  const wall = 0.9 * smoothstep(2.6, 0, wd);
  let y = -631.0 + dune * 1.05 + ripple + heap + ark + wall;
  if (y < HALL9.floor + 0.6) y = HALL9.floor + 0.6;
  lastGX = x;
  lastGZ = z;
  lastGY = y;
  return y;
}

/* ---------------------------------------------------------------- the spiral stair, the entry, the landing ---- */

/** The spiral stair: centre, centre-line radius, half width, clear height, top and bottom floors, slope. */
export const SPIRAL = { x: -7.0, z: 7.0, R: 1.9, hw: 0.85, h: 2.6, top: -584.0, bottom: -620.0, slope: 0.48 };
const PITCH = 2 * Math.PI * SPIRAL.R * SPIRAL.slope;
const TURNS = (SPIRAL.top - SPIRAL.bottom) / PITCH;
/** The stair ends pointing into the landing (angle in the x–z plane from +x towards +z); it starts TURNS earlier. */
const PHI_END = Math.PI / 3;
const PHI0 = PHI_END - (TURNS - Math.floor(TURNS)) * 2 * Math.PI;
/** The entry chamber under layer 8's deepest gallery (round, domed) at the spiral's top. */
export const ENTRY = { x: SPIRAL.x, z: SPIRAL.z, r: 2.75, floor: SPIRAL.top, wall: 1.4, top: -581.4 };
/** The landing at the spiral's foot (a vaulted room along x; the lift column is in it); its east side opens on the ledge. */
export const LANDING = { x0: -6.2, x1: TOWER.x1, z0: 7.0, z1: 10.0, y: SPIRAL.bottom, h: 3.0 };

/** The spiral's floor point (world [x, y, z]) at arc fraction f (0 = top … 1 = bottom). */
export function spiralPoint(f) {
  const ang = PHI0 + f * TURNS * 2 * Math.PI;
  return [SPIRAL.x + Math.cos(ang) * SPIRAL.R, SPIRAL.top - f * (SPIRAL.top - SPIRAL.bottom), SPIRAL.z + Math.sin(ang) * SPIRAL.R];
}

/** The spiral stair's air (negative inside): the helical tunnel, flat floor and ceiling. */
function spiralBase(x, y, z) {
  const dx = x - SPIRAL.x;
  const dz = z - SPIRAL.z;
  const r = hyp(dx, dz);
  const radial = Math.abs(r - SPIRAL.R) - SPIRAL.hw;
  if (radial > 1.5) return Infinity;
  let base = Math.atan2(dz, dx) - PHI0;
  base -= Math.floor(base / (2 * Math.PI)) * 2 * Math.PI;
  const b = base / (2 * Math.PI);
  const t = (SPIRAL.top - y) / PITCH - b;
  const k0 = Math.floor(t);
  let vert = Infinity;
  for (let k = k0; k <= k0 + 1; k++) {
    const arc = b + k; // turns from the top
    if (arc < 0 || arc > TURNS) continue;
    const fy = SPIRAL.top - PITCH * arc;
    const v = Math.max(fy - y, y - (fy + SPIRAL.h)) * 0.9;
    if (v < vert) vert = v;
  }
  return Math.max(radial, vert);
}

/** The entry chamber's air: a round room with a low dome. */
function entryBase(x, y, z) {
  const r = hyp(x - ENTRY.x, z - ENTRY.z);
  const spring = ENTRY.floor + ENTRY.wall;
  const domeH = ENTRY.top - spring;
  const top = y > spring ? hyp(r / ENTRY.r, (y - spring) / domeH) * Math.min(ENTRY.r, domeH * 2) - Math.min(ENTRY.r, domeH * 2) : -1;
  return Math.max(r - ENTRY.r, ENTRY.floor - y, top);
}

/** The landing's air: a box with a barrel vault along x. */
function landingBase(x, y, z) {
  const L = LANDING;
  const hw = (L.z1 - L.z0) / 2;
  const q = Math.abs(z - (L.z0 + L.z1) / 2);
  const spring = L.y + L.h - hw * 0.6;
  const top = y > spring ? hyp(q, (y - spring) / 0.6) - hw : y - (L.y + L.h);
  return Math.max(L.x0 - x, x - (L.x1 + 0.3), L.z0 - z, z - L.z1, L.y - y, top);
}

/* ---------------------------------------------------------------- the ledge ---- */

/** The ledge (a stone stair-ramp along the south wall, round the corner, down the east wall): inner edges, slope, foot. */
export const LEDGE = { south: 7.6, east: 8.0, x0: TOWER.x1, top: SPIRAL.bottom, slope: 0.45, corner: 11.4 };
/** Arc length along the ledge where it meets the gold near the east wall (its foot). */
const LEDGE_FOOT_Z = (() => {
  for (let z = LEDGE.east; z > -9; z -= 0.05) {
    const s = LEDGE.corner + (LEDGE.east - z);
    if (LEDGE.top - LEDGE.slope * s < goldTop(9.1, z) + 0.15) return fix(z, 2);
  }
  return -9;
})();
export const LEDGE_END_Z = LEDGE_FOOT_Z;

/** The ledge's walking height over a plan point of its strip (south run, flat corner, east run). */
export function ledgeTop(x, z) {
  let s;
  if (x > LEDGE.east && z > LEDGE.south) s = LEDGE.corner;
  else if (z > LEDGE.south) s = Math.min(LEDGE.corner, x - LEDGE.x0);
  else s = LEDGE.corner + Math.max(0, LEDGE.east - z);
  return LEDGE.top - LEDGE.slope * Math.max(0, s);
}

/** The ledge's solid (negative inside the stone): the strips under their walking height. */
function ledgeSolid(x, y, z) {
  const south = Math.max(LEDGE.south - z, LEDGE.x0 - x, y - ledgeTop(x, Math.max(z, LEDGE.south + 0.01)));
  const east = Math.max(LEDGE.east - x, LEDGE_FOOT_Z - 0.6 - z, y - ledgeTop(Math.max(x, LEDGE.east + 0.01), z));
  return Math.min(south, east);
}

/* ---------------------------------------------------------------- Thrór's throne room (NOTES-22-secret) ---- */

/**
 * The secret ending's hidden chamber (TERV 0.11/10): Thrór's old throne room, sealed inside the solid corner tower under
 * the landing, behind the treasury's gold. A carved room with a barrel vault along z (generate() stamps its air); the
 * only way in is the door in the tower's north face (towards the Arkenstone's dune), a plug of rock that stays solid
 * and undiggable (THRONE_LOCKS) until src/secret/ carves it away when every famous find is in Bag End's cases.
 */
export const THRONE_ROOM = { x0: -9.5, x1: -4.6, z0: 5.0, z1: 9.7, floor: -630.8, wall: 2.8, top: -626.4 };
/** The door (the plug): centred on x, from the tower's face (z0) to the room (z1), floor to floor + h. */
export const THRONE_DOOR = { x: -6.85, hw: 0.75, z0: TOWER.z0, z1: THRONE_ROOM.z0, y0: THRONE_ROOM.floor, h: 2.5 };
/** Thrór's throne against the back wall, facing the door (−z); the empty setting of the Arkenstone above it. */
export const THRONE = { x: THRONE_DOOR.x, z: THRONE_ROOM.z1 - 0.95, y: THRONE_ROOM.floor, setY: THRONE_ROOM.floor + 3.5 };
/** The carved stone at the throne's right (from the door: the room's west side), turned to the room's middle. */
export const THRONE_STONE = { x: -8.75, z: 7.9, yaw: Math.PI / 2 - 0.35 };

/** The throne room's air (negative inside): a box with a barrel vault along z. */
function throneRoomBase(x, y, z) {
  const R = THRONE_ROOM;
  const hw = (R.x1 - R.x0) / 2;
  const q = Math.abs(x - (R.x0 + R.x1) / 2);
  const spring = R.floor + R.wall;
  const rise = R.top - spring;
  const top = y > spring ? hyp(q, ((y - spring) * hw) / rise) - hw : y - R.top;
  return Math.max(R.x0 - x, x - R.x1, R.z0 - z, z - R.z1, R.floor - y, top);
}

/**
 * The undiggable shells (sites.js LOCKS): the whole corner tower below the room's vault (the room, its walls, the rock
 * under it down to the block's floor, out to the block's walls), except the door's plug, which is its own box that
 * src/secret/ switches `off` when it opens the door. So the room can be entered by the door only.
 */
const TD = THRONE_DOOR;
const LOCK_TOP = THRONE_ROOM.top + 0.8;
export const THRONE_PLUG_LOCK = { x0: TD.x - TD.hw, x1: TD.x + TD.hw, y0: TD.y0, y1: TD.y0 + TD.h, z0: TD.z0 + 0.02, z1: TD.z1 };
export const THRONE_LOCKS = [
  // The room and everything south of its front wall.
  { x0: -12, x1: TOWER.x1 - 0.02, y0: -636, y1: LOCK_TOP, z0: TD.z1, z1: 12 },
  // The front wall beside the door (west, east), under the door, over the door.
  { x0: -12, x1: TD.x - TD.hw, y0: -636, y1: LOCK_TOP, z0: TD.z0 + 0.02, z1: TD.z1 },
  { x0: TD.x + TD.hw, x1: TOWER.x1 - 0.02, y0: -636, y1: LOCK_TOP, z0: TD.z0 + 0.02, z1: TD.z1 },
  { x0: TD.x - TD.hw, x1: TD.x + TD.hw, y0: -636, y1: TD.y0, z0: TD.z0 + 0.02, z1: TD.z1 },
  { x0: TD.x - TD.hw, x1: TD.x + TD.hw, y0: TD.y0 + TD.h, y1: LOCK_TOP, z0: TD.z0 + 0.02, z1: TD.z1 },
  THRONE_PLUG_LOCK,
];

/** True inside the throne room (a world point; the door's plug counts once it is open). */
export function inThroneRoom(p) {
  const R = THRONE_ROOM;
  return p.x > R.x0 - 0.1 && p.x < R.x1 + 0.1 && p.z > R.z0 - 0.3 && p.z < R.z1 + 0.1 && p.y > R.floor - 0.6 && p.y < R.top;
}

/* ---------------------------------------------------------------- the cavity field ---- */

/** The bounds of layer 9's site air (its top at 580.3 m: layer 8 is untouched). */
export const HOARD_BOUNDS = { x0: -12, x1: 12, y0: HALL9.floor - 1.5, y1: -580.3, z0: -12, z1: 12 };

/** The hall's air (negative inside): the box under the stepped roof, less the gold, the pillars, the tower, the ledge. */
function hallBase(x, y, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  let d = Math.max(ax - HALL9.a, az - HALL9.a, HALL9.floor - y, (y - hall9Roof(x, z)) * 0.75);
  if (d > 2.5) return d;
  // The gold (a heightfield over the floor).
  const g = (y - goldTop(x, z)) * 0.85;
  if (-g > d) d = -g;
  // The corner tower.
  const t = Math.max(x - TOWER.x1, TOWER.z0 - z);
  if (-t > d) d = -t;
  for (const p of PILLARS9) {
    const s = Math.max(Math.abs(x - p.x) - p.h, Math.abs(z - p.z) - p.h);
    if (-s > d) d = -s;
  }
  if (x > LEDGE.x0 - 1 && (z > LEDGE.south - 1.5 || x > LEDGE.east - 1.5)) {
    const l = ledgeSolid(x, y, z);
    if (-l > d) d = -l;
  }
  return d;
}

/** The carved rooms (crisp, polished hall stone): the hall, the landing, the entry chamber. */
export function hoardCarvedBase(x, y, z) {
  if (y > HOARD_BOUNDS.y1 + 2 || y < HOARD_BOUNDS.y0) return Infinity;
  let d = y < hall9Roof(0, 0) + 2 ? hallBase(x, y, z) : Infinity;
  if (x < TOWER.x1 + 2 && z > TOWER.z0 - 2) {
    if (y > LANDING.y - 2 && y < LANDING.y + LANDING.h + 2) {
      const v = landingBase(x, y, z);
      if (v < d) d = v;
    }
    if (y > ENTRY.floor - 2) {
      const v = entryBase(x, y, z);
      if (v < d) d = v;
    }
    if (y < ENTRY.floor + 3.5 && y > SPIRAL.bottom - 2) {
      const v = spiralBase(x, y, z);
      if (v < d) d = v;
    }
    // Thrór's throne room (NOTES-22-secret), sealed until its door's plug is carved away at run time.
    if (y < THRONE_ROOM.top + 2 && y > THRONE_ROOM.floor - 2) {
      const v = throneRoomBase(x, y, z);
      if (v < d) d = v;
    }
  }
  return d;
}

/**
 * The cavity at a world point as generate() stamps it (negative in the air, Infinity outside the bounds or more than
 * 2.5 m from the air). Everything here is carved dwarf work and the gold: no roughness noise on the walls.
 * Deterministic (the save stores the terrain as differences from generate()).
 */
export function hoardCavity(x, y, z) {
  if (y < HOARD_BOUNDS.y0 || y > HOARD_BOUNDS.y1) return Infinity;
  const d = hoardCarvedBase(x, y, z);
  return d > 2.5 ? Infinity : d;
}

/** Marches down from y0 to the first solid point of hoardCavity (a deterministic floor height for the dressing). */
export function hoardFloorAt(x, z, y0, range = 6) {
  for (let y = y0; y > y0 - range; y -= 0.03) if (hoardCavity(x, y, z) > 0) return y + 0.02;
  return y0 - range;
}

/* ---------------------------------------------------------------- materials and shading ---- */

/** True inside the sea of gold (materials.js: Smaug's gold, soft, its own finds). */
export function inGold(x, y, z) {
  if (y > -620 || y < HALL9.floor || Math.abs(x) > HALL9.a || Math.abs(z) > HALL9.a) return false;
  if (x < TOWER.x1 && z > TOWER.z0) return false;
  if (y > goldTop(x, z)) return false;
  for (const p of PILLARS9) if (Math.abs(x - p.x) < p.h && Math.abs(z - p.z) < p.h) return false;
  if (x > LEDGE.x0 && (z > LEDGE.south || (x > LEDGE.east && z > LEDGE_FOOT_Z - 0.6)) && y < ledgeTop(x, z)) return false;
  return true;
}

/** 0..1: how much a surface point is the polished, carved green-and-gold stone (the hall, the stair, the landing). */
export function hoardHallWeight(x, y, z) {
  if (y > -580 || y < HALL9.floor - 2) return 0;
  const d = hoardCarvedBase(x, y, z);
  if (d === Infinity) return 0;
  return 1 - smoothstep(0.12, 0.5, Math.abs(d));
}

/** 0..1: how much a surface point is gold (the gold's surface and anything dug into it). */
export function hoardGoldWeight(x, y, z) {
  if (y > -620 || y < HALL9.floor - 0.5) return 0;
  return inGold(x, y - 0.12, z) ? 1 : 0;
}

/* ---------------------------------------------------------------- tests ---- */

/** True inside the treasury (the hall over the gold, the ledge, the landing): where Smaug hears and smells. */
export function inHoard(p) {
  const x = p.x;
  const y = p.y;
  const z = p.z;
  if (y > hall9Roof(0, 0) || y < HALL9.floor - 1) return false;
  if (Math.abs(x) > HALL9.a + 0.5 || Math.abs(z) > HALL9.a + 0.5) return false;
  if (x < TOWER.x1 && z > TOWER.z0) return x > LANDING.x0 - 0.5 && z > LANDING.z0 - 0.5 && y > LANDING.y - 1 && y < LANDING.y + LANDING.h + 0.5;
  return true;
}

/** True anywhere in layer 9's own air (the treasury, the stair, the entry): the snoring is loud here. */
export function inHoardLayer(p) {
  return p.y < -580.5 && p.y > HALL9.floor - 1;
}

/** 0..1: how far into layer 9 a height is (0 above 581 m, 1 below 586 m). */
export function hoardFactor(y) {
  return smoothstep(-581, -586, y);
}

/* ---------------------------------------------------------------- set pieces, finds, the lift ---- */

/** Smaug's pose on the hoard: the coil round the heap, his head on the gold towards the south (the ledge). */
export const SMAUG_LAIR = { x: LAIR.x, y: fix(goldTop(LAIR.x, LAIR.z)), z: LAIR.z, yaw: 0, pose: 'sleep' };
/** The Arkenstone, half buried at the top of its dune (y: its centre, a little under the gold's surface). */
export const ARKENSTONE = { x: ARK_DUNE.x, y: fix(goldTop(ARK_DUNE.x, ARK_DUNE.z) - 0.05), z: ARK_DUNE.z };
/** Where the layer-9 lift lands (lift.js's column x −4, z 9): in the landing at the spiral's foot. */
export const LIFT9 = { x: -4, y: LANDING.y, z: 9 };

/* ---------------------------------------------------------------- the escape route ---- */

/**
 * The way out from the Arkenstone (the route the finale's Smaug chases along): floor points { x, y, z, tag } across the
 * gold to the ledge's foot, up the ledge to the landing (the lift), up the spiral stair to the entry, the 7.4 m dug link
 * up to layer 8's deepest gallery (`dig`: rock until the players dug it), and up layer 8's great ramp to the great hall's
 * south door at the lift column (525 m). Built lazily (layer 8's module is imported by the caller).
 */
export function buildExitPath(E) {
  const P = [];
  const add = (x, y, z, tag) => P.push({ x: fix(x), y: fix(y), z: fix(z), tag });
  add(ARKENSTONE.x, goldTop(ARKENSTONE.x, ARKENSTONE.z), ARKENSTONE.z, 'arkenstone');
  for (const [x, z] of [[-7.8, -4.6], [-7.8, -7.9], [-3.5, -8.4], [0.5, -8.2], [4.0, -8.0], [7.9, -7.8], [7.9, -4.4]]) add(x, goldTop(x, z), z, 'gold');
  const fz = LEDGE_FOOT_Z + 0.4;
  add(9.1, ledgeTop(9.1, fz), fz, 'ledge-foot');
  add(9.1, ledgeTop(9.1, 3.0), 3.0, 'ledge');
  add(9.1, ledgeTop(9.1, 9.1), 9.1, 'ledge-corner');
  add(3.0, ledgeTop(3.0, 9.0), 9.0, 'ledge');
  add(-3.0, ledgeTop(-3.0, 9.0), 9.0, 'ledge-top');
  add(LIFT9.x, LIFT9.y, LIFT9.z, 'landing');
  const n = Math.ceil(TURNS * 8);
  for (let i = n; i >= 0; i--) {
    const [x, y, z] = spiralPoint(i / n);
    add(x, y, z, i === n ? 'spiral-foot' : i === 0 ? 'spiral-top' : 'spiral');
  }
  add(ENTRY.x + 0.7, ENTRY.floor, ENTRY.z + 0.5, 'entry');
  const deep = E.DEEP[1];
  add(deep[0], ENTRY.top + 1.0, deep[2], 'dig');
  add(deep[0], (ENTRY.top + 1.0 + deep[1]) / 2, deep[2], 'dig');
  add(deep[0], deep[1], deep[2], 'deep');
  add(E.DEEP[0][0], E.DEEP[0][1], E.DEEP[0][2], 'ramp-foot');
  // Up the great ramp (its points run from the mine ring down; walked backwards) to the hall's floor.
  for (let i = E.RAMP.length - 1; i >= 0; i -= 2) {
    const q = E.RAMP[i];
    if (q[1] > E.HALL.floor + 0.05) break;
    add(q[0], q[1], q[2], 'ramp');
  }
  add(E.LIFT8.x, E.LIFT8.y, E.LIFT8.z, 'erebor-hall');
  // No step longer than 2.5 m on the gold and the ledge: points in between, on the gold's or the ledge's height.
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1];
    const b = P[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const kind = b.tag === 'gold' || b.tag === 'ledge-foot' ? 'gold' : b.tag.startsWith('ledge') ? 'ledge' : null;
    if (kind && d > 2.5) {
      const n = Math.ceil(d / 2.5);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = kind === 'gold' ? goldTop(x, z) : ledgeTop(x, z);
        out.push({ x: fix(x), y: fix(y), z: fix(z), tag: kind === 'gold' ? 'gold' : 'ledge' });
      }
    }
    out.push(b);
  }
  return out;
}

/* ---------------------------------------------------------------- the provider ---- */

/**
 * Smaug's treasury as a site provider (the finale agent and the noise logic code against it). All points are world
 * positions; floor points have y on the floor. `exitPath` is filled by game.js (it needs layer 8's layout) or on the
 * first `getExitPath(E)` call.
 */
export const HOARD_SITE_PROVIDER = {
  inHoard: (p) => inHoard(p),
  inHoardLayer: (p) => inHoardLayer(p),
  hoardFactor: (y) => hoardFactor(y),
  hoard: { x0: -HALL9.a, x1: HALL9.a, y0: HALL9.floor, y1: fix(hall9Roof(0, 0)), z0: -HALL9.a, z1: HALL9.a },
  arkenstone: ARKENSTONE,
  smaugLair: SMAUG_LAIR,
  goldTop: (x, z) => goldTop(x, z),
  floorAt: (x, z, y0, range) => hoardFloorAt(x, z, y0, range),
  entry: { x: ENTRY.x, y: ENTRY.floor, z: ENTRY.z, r: ENTRY.r },
  landing: { x: LIFT9.x, y: LIFT9.y, z: LIFT9.z },
  lift: LIFT9,
  pillars: PILLARS9.map((p) => ({ x: p.x, z: p.z, half: p.h })),
  ledgeFoot: { x: 9.1, y: fix(ledgeTop(9.1, LEDGE_FOOT_Z + 0.4)), z: fix(LEDGE_FOOT_Z + 0.4) },
  exitPath: null,
  getExitPath(E) {
    if (!this.exitPath) this.exitPath = buildExitPath(E);
    return this.exitPath;
  },
};
