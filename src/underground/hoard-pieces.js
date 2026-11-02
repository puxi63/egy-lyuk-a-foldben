/* ==== underground/hoard-pieces.js — the static dressing of Smaug's treasury (layer 9), built into the Kit (kit.js) from
   the layout in hoard-sites.js:
   - the hall: three great pillars of the green-and-gold carved stone with gold bands, stepped bases (buried in the
     gold) and capitals under the roof; gold bands and gold-capped pilasters round the walls; the roof's stepped rings;
   - the ledge: stone steps on the ramp and a thin gold edge along its open side (the films' stairs on the walls, no
     railing), an arched doorway where it leaves the landing;
   - the spiral stair: a gold-rimmed arch at its top in the entry chamber, iron wall lanterns (cold) every half turn;
   - big pieces of the hoard that stand on the stone floor and rise out of the gold (generic: great urns, spears and
     a standard pole stuck upright, a heap of shields against a pillar's foot).
   The loose small things on the gold (coins, cups, gems, shields) are hoard-fx.js's (they slide down when the gold
   under them is dug); the Arkenstone and Smaug are there and in src/smaug/.
   Nothing named is invented (TERV Decision 18). Kit group 'l9' (decor.js draws each material as one mesh, culled per
   view). Materials: 'stone8' (the carved hall stone: below 470 m the soil shader's hall-stone layer), 'gold9' (clean
   polished gold: the grainy 'gold' of layer 8 read as wooden beams at the treasury's size), 'metal', 'wood'. ==== */
import { rng } from '../noise.js';
import * as H from './hoard-sites.js';
import { box, cyl, lathe, torus } from './kit.js';

const R = rng(9090);
const F = H.HALL9.floor;
const GOLD = 0xd8a434;
const GOLD_D = 0xa87a26;
const IRON = 0x3a3a3e;
const IRON_D = 0x26262a;
const WOOD_D = 0x3e2e20;
/** The carved stone's vertex colour (the soil shader's hall-stone layer multiplies it). */
const STONE = 0x3e5a4c;

/** The great pillars: a stepped base, the shaft's gold bands and corner strips, a stepped capital under the roof. */
function buildPillars(K) {
  for (const p of H.PILLARS9) {
    const top = H.hall9Roof(p.x, p.z);
    const h = p.h;
    K.at(p.x, F, p.z);
    // Stepped base (mostly buried in the gold; the top step shows on the low dunes).
    K.part('stone8', box(h * 2 + 0.7, 2.8, h * 2 + 0.7), STONE, 0, 1.4, 0, 0, 0, 0, 1, 0.05);
    K.part('stone8', box(h * 2 + 0.36, 4.2, h * 2 + 0.36), STONE, 0, 2.1, 0, 0, 0, 0, 1, 0.05);
    // Gold bands round the shaft.
    for (const y of [5.6, 10.5, 15.4]) {
      K.part('gold9', box(h * 2 + 0.14, 0.32, h * 2 + 0.14), GOLD, 0, y, 0, 0, 0, 0, 1, 0.06);
      K.part('gold9', box(h * 2 + 0.08, 0.08, h * 2 + 0.08), GOLD_D, 0, y + 0.42, 0);
      K.part('gold9', box(h * 2 + 0.08, 0.08, h * 2 + 0.08), GOLD_D, 0, y - 0.42, 0);
    }
    // Stepped capital under the roof.
    const ch = top - F;
    K.part('stone8', box(h * 2 + 0.4, 0.5, h * 2 + 0.4), STONE, 0, ch - 1.35, 0, 0, 0, 0, 1, 0.05);
    K.part('gold9', box(h * 2 + 0.46, 0.14, h * 2 + 0.46), GOLD, 0, ch - 1.62, 0);
    K.part('stone8', box(h * 2 + 0.8, 0.6, h * 2 + 0.8), STONE, 0, ch - 0.8, 0, 0, 0, 0, 1, 0.05);
    K.part('stone8', box(h * 2 + 1.3, 0.55, h * 2 + 1.3), STONE, 0, ch - 0.25, 0, 0, 0, 0, 1, 0.05);
  }
  K.at(0, 0, 0);
}

/** Gold bands round the walls, gold-capped pilasters between them, the roof's stepped rings. */
function buildWalls(K) {
  const a = H.HALL9.a;
  const wallTop = F + H.HALL9.wall;
  // The wall runs (skipping the tower's corner): [x0, z0, x1, z1, inward normal x, z].
  const runs = [
    [-a, -a, a, -a, 0, 1],
    [a, -a, a, a, -1, 0],
    [H.TOWER.x1, a, a, a, 0, -1],
    [-a, -a, -a, H.TOWER.z0, 1, 0],
    [-a, H.TOWER.z0, H.TOWER.x1, H.TOWER.z0, 0, -1],
    [H.TOWER.x1, H.TOWER.z0, H.TOWER.x1, a, 1, 0],
  ];
  for (const [x0, z0, x1, z1, nx, nz] of runs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2 + nx * 0.04;
    const mz = (z0 + z1) / 2 + nz * 0.04;
    K.at(mx, F, mz, yaw);
    for (const y of [9.4, 15.6]) {
      K.part('gold9', box(0.08, 0.36, len), GOLD, 0, y, 0, 0, 0, 0, 1, 0.06);
      K.part('gold9', box(0.06, 0.06, len), GOLD_D, 0, y + 0.3, 0);
    }
    K.part('stone8', box(0.36, 0.5, len), STONE, 0, wallTop - F - 0.25, 0, 0, 0, 0, 1, 0.05);
    K.part('gold9', box(0.4, 0.1, len), GOLD_D, 0, wallTop - F - 0.55, 0);
  }
  // The roof's stepped rings (a gold line at each step's edge).
  for (let k = 1; k <= 5; k++) {
    const inset = k * 1.7;
    const s = a - inset;
    const y = H.hall9Roof(s, 0) - 0.08;
    for (const [x, z, w, d] of [[0, -s, 2 * s, 0.07], [0, s, 2 * s, 0.07], [-s, 0, 0.07, 2 * s], [s, 0, 0.07, 2 * s]]) {
      K.at(x, y, z);
      K.part('gold9', box(w, 0.07, d), GOLD_D, 0, 0, 0);
    }
  }
  K.at(0, 0, 0);
}

/** The ledge: stone steps on the ramp, a thin gold edge along its open side, the doorway from the landing. */
function buildLedge(K) {
  const L = H.LEDGE;
  const step = 0.5;
  // South run: x from the tower to the corner.
  for (let x = L.x0 + 0.05; x < L.east - step * 0.5; x += step) {
    const top = H.ledgeTop(x, 9);
    K.at(x + step / 2, top, (L.south + H.HALL9.a) / 2);
    K.part('stone8', box(step - 0.02, 0.36, H.HALL9.a - L.south - 0.05), STONE, 0, -0.17, 0, 0, 0, 0, 1, 0.07);
  }
  // East run: z from the corner down to the foot.
  for (let z = L.east - 0.05; z > H.LEDGE_END_Z + step; z -= step) {
    const top = H.ledgeTop(9.2, z);
    K.at((L.east + H.HALL9.a) / 2, top, z - step / 2);
    K.part('stone8', box(H.HALL9.a - L.east - 0.05, 0.36, step - 0.02), STONE, 0, -0.17, 0, 0, 0, 0, 1, 0.07);
  }
  // The gold edge along the open side (south run, then east run), following the slope.
  const edge = (ax, az, bx, bz) => {
    const ya = H.ledgeTop(ax + (bx > ax ? 0 : 0.01), az);
    const yb = H.ledgeTop(bx, bz);
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    K.at((ax + bx) / 2, (ya + yb) / 2, (az + bz) / 2, yaw);
    K.part('gold9', box(0.08, 0.08, len), GOLD, 0, 0.01, 0, Math.atan2(ya - yb, len), 0, 0);
  };
  edge(L.x0, L.south + 0.04, L.east - 0.04, L.south + 0.04);
  edge(L.east + 0.04, L.south, L.east + 0.04, H.LEDGE_END_Z + 0.3);
  // The arched doorway from the landing onto the ledge (in the tower's east face).
  const D = H.LANDING;
  K.at(D.x1 + 0.05, D.y, (D.z0 + D.z1) / 2, Math.PI / 2);
  const hw = (D.z1 - D.z0) / 2;
  for (const s of [-1, 1]) K.part('stone8', box(0.34, D.h - 0.6, 0.4), STONE, s * (hw + 0.05), (D.h - 0.6) / 2, 0, 0, 0, 0, 1, 0.05);
  K.part('stone8', torus(hw + 0.05, 0.18, 4, 14, Math.PI), STONE, 0, D.h - 0.6 - 0.2, 0, 0, 0, 0, [1, 0.75, 1], 0.05);
  K.part('gold9', torus(hw + 0.05, 0.05, 4, 14, Math.PI), GOLD, 0, D.h - 0.6 - 0.2, 0.18, 0, 0, 0, [1, 0.75, 1]);
  K.at(0, 0, 0);
}

/** The spiral stair: an arch at its top in the entry chamber, cold iron lanterns every half turn. */
function buildStair(K) {
  const S = H.SPIRAL;
  const [tx, ty, tz] = H.spiralPoint(0.012);
  const yaw = Math.atan2(tx - S.x, tz - S.z);
  K.at(tx, ty, tz, yaw + Math.PI / 2);
  for (const s of [-1, 1]) K.part('stone8', box(0.28, 2.1, 0.3), STONE, s * (S.hw + 0.12), 1.05, 0);
  K.part('stone8', box(S.hw * 2 + 0.6, 0.3, 0.34), STONE, 0, 2.2, 0);
  K.part('gold9', box(S.hw * 2 + 0.64, 0.07, 0.38), GOLD, 0, 2.05, 0);
  const turns = (S.top - S.bottom) / (2 * Math.PI * S.R * S.slope);
  const n = Math.floor(turns * 2);
  for (let i = 1; i < n; i++) {
    const f = i / (turns * 2);
    const [x, y, z] = H.spiralPoint(f);
    const dx = x - S.x;
    const dz = z - S.z;
    const r = Math.hypot(dx, dz);
    // On the outer wall, facing in.
    const wx = S.x + (dx / r) * (S.R + S.hw - 0.02);
    const wz = S.z + (dz / r) * (S.R + S.hw - 0.02);
    K.at(wx, y + 1.85, wz, Math.atan2(-dx, -dz));
    K.part('metal', box(0.04, 0.04, 0.26), IRON_D, 0, 0.08, 0.11);
    K.part('metal', box(0.15, 0.2, 0.15), IRON, 0, -0.05, 0.25, 0, 0, 0, 1, 0.1);
    K.part('metal', cyl(0.0, 0.11, 0.09, 4), IRON_D, 0, 0.1, 0.25, 0, Math.PI / 4, 0);
  }
  K.at(0, 0, 0);
}

/** Big pieces of the hoard standing on the stone floor and rising out of the gold: great urns, spears, a standard. */
function buildHoardPieces(K) {
  // Great gold urns (lathe), their feet on the floor, half buried.
  for (const [x, z, s] of [[-8.6, -2.4, 1.15], [3.4, -9.0, 1.0], [-1.6, -8.9, 1.25], [8.9, -8.6, 1.1], [-8.8, -8.6, 0.95]]) {
    const top = H.goldTop(x, z);
    const h = Math.max(2.2, top - F + 1.1) * s * 0.85;
    K.at(x, F, z, R() * 6);
    K.part('gold9', lathe([[0.3 * s, 0], [0.55 * s, h * 0.25], [0.62 * s, h * 0.55], [0.4 * s, h * 0.82], [0.28 * s, h * 0.92], [0.36 * s, h]], 16), GOLD, 0, 0, 0, 0, 0, 0, 1, 0.1);
    K.part('gold9', torus(0.33 * s, 0.035 * s, 4, 16), GOLD_D, 0, h, 0, Math.PI / 2, 0, 0);
  }
  // Spears and a standard pole stuck upright into the gold (their butts on the floor).
  for (const [x, z, lean] of [[-2.6, -5.0, 0.12], [6.8, 1.2, -0.18], [-7.4, 0.8, 0.22], [2.2, -9.2, -0.1], [-4.6, -9.4, 0.15]]) {
    const top = H.goldTop(x, z);
    const len = top - F + 2.4 + R() * 1.2;
    K.at(x, F, z, R() * 6);
    K.part('wood', cyl(0.035, 0.04, len, 6), WOOD_D, 0, len / 2, 0, lean, 0, 0, 1, 0.1);
    // The head at the shaft's top (the shaft turns about its middle).
    const c = Math.cos(lean);
    const sn = Math.sin(lean);
    K.part('metal', cyl(0.0, 0.06, 0.36, 4), IRON, 0, (len / 2) * (1 + c) + 0.17 * c, (len / 2 + 0.17) * sn, lean, 0, 0);
  }
  // A heap of round shields against the south-east pillar's foot.
  const p = H.PILLARS9[0];
  for (let i = 0; i < 5; i++) {
    const a = -0.6 + i * 0.32;
    const x = p.x - 1.25 + i * 0.35;
    const z = p.z - 1.45 - (i % 2) * 0.12;
    const y = H.goldTop(x, z) + 0.05;
    K.at(x, y, z, a);
    K.part('gold9', cyl(0.36, 0.36, 0.05, 14), i % 2 ? GOLD : GOLD_D, 0, 0.3, 0, Math.PI / 2 - 0.35, 0, 0, 1, 0.08);
    K.part('gold9', cyl(0.0, 0.1, 0.07, 10), GOLD, 0, 0.32, 0.06, Math.PI / 2 - 0.35, 0, 0);
  }
  K.at(0, 0, 0);
}

/**
 * Thrór's throne room (NOTES-22-secret; hoard-sites.js THRONE_ROOM): the carved door frame on the tower's north face
 * (seen from the hall: the plug between the jambs is the tower's rock until src/secret/ opens it), and inside the sealed
 * room a low dais with Thrór's stone throne, the empty gold setting above it where the Arkenstone shone (the films), a
 * carved standing stone (its runes are src/secret/'s plane, shown once the door is open), gold bands round the walls.
 * All merged into the treasury's existing materials (no draw call of its own).
 */
function buildThroneRoom(K) {
  const R = H.THRONE_ROOM;
  const D = H.THRONE_DOOR;
  const T = H.THRONE;
  const zf = D.z0; // the tower's face
  // ---- the door frame, on the hall side ----
  K.at(D.x, D.y0, zf);
  for (const s of [-1, 1]) {
    K.part('stone8', box(0.34, 3.0, 0.36), STONE, s * (D.hw + 0.17), 1.1, -0.12, 0, 0, 0, 1, 0.05);
    K.part('gold9', box(0.06, 2.4, 0.38), GOLD_D, s * (D.hw + 0.02), 1.2, -0.12);
  }
  K.part('stone8', box(D.hw * 2 + 0.8, 0.44, 0.4), STONE, 0, D.h + 0.22, -0.14, 0, 0, 0, 1, 0.05);
  K.part('gold9', box(D.hw * 2 + 0.84, 0.07, 0.42), GOLD, 0, D.h + 0.05, -0.14);
  K.part('stone8', box(D.hw * 2 + 0.3, 0.32, 0.3), STONE, 0, D.h + 0.6, -0.1, 0, 0, 0, 1, 0.05);
  K.part('gold9', box(0.2, 0.2, 0.06), GOLD, 0, D.h + 0.6, -0.27, 0, 0, Math.PI / 4);
  K.part('stone8', box(D.hw * 2 + 0.6, 0.14, 0.5), STONE, 0, -0.08, -0.2, 0, 0, 0, 1, 0.05);
  // ---- inside: gold bands round the walls at 2.2 m ----
  const by = R.floor + 2.2;
  for (const [x, z, w, d] of [
    [R.x0 + 0.03, (R.z0 + R.z1) / 2, 0.06, R.z1 - R.z0],
    [R.x1 - 0.03, (R.z0 + R.z1) / 2, 0.06, R.z1 - R.z0],
    [(R.x0 + R.x1) / 2, R.z1 - 0.03, R.x1 - R.x0, 0.06],
    [(R.x0 + D.x - D.hw) / 2, R.z0 + 0.03, D.x - D.hw - R.x0, 0.06],
    [(D.x + D.hw + R.x1) / 2, R.z0 + 0.03, R.x1 - D.x - D.hw, 0.06],
  ]) {
    K.at(x, by, z);
    K.part('gold9', box(w, 0.22, d), GOLD_D, 0, 0, 0);
  }
  // ---- the dais and Thrór's throne, against the back wall, facing the door ----
  K.at(T.x, T.y, R.z1 - 1.0);
  K.part('stone8', box(2.8, 0.18, 2.0), STONE, 0, 0.09, 0, 0, 0, 0, 1, 0.05);
  K.part('gold9', box(2.84, 0.04, 2.04), GOLD_D, 0, 0.17, 0);
  K.at(T.x, T.y + 0.18, T.z);
  K.part('stone8', box(1.0, 0.46, 0.78), STONE, 0, 0.23, 0.05, 0, 0, 0, 1, 0.05);
  K.part('stone8', box(1.12, 1.8, 0.3), STONE, 0, 0.46 + 0.9, 0.46, 0, 0, 0, 1, 0.05);
  for (const s of [-1, 1]) {
    K.part('stone8', box(0.18, 0.36, 0.78), STONE, s * 0.56, 0.46 + 0.18, 0.05, 0, 0, 0, 1, 0.05);
    K.part('gold9', box(0.2, 0.05, 0.8), GOLD, s * 0.56, 0.46 + 0.38, 0.05);
  }
  for (const y of [1.0, 1.75]) K.part('gold9', box(1.16, 0.06, 0.32), GOLD, 0, 0.46 + y, 0.46);
  K.part('stone8', box(1.34, 0.24, 0.36), STONE, 0, 0.46 + 1.92, 0.46, 0, 0, 0, 1, 0.05);
  K.part('stone8', box(0.86, 0.22, 0.32), STONE, 0, 0.46 + 2.15, 0.46, 0, 0, 0, 1, 0.05);
  K.part('gold9', box(0.9, 0.05, 0.34), GOLD, 0, 0.46 + 2.04, 0.46);
  K.boxCollider(0, 0.6, 0.25, 0.62, 0.6, 0.55);
  // ---- the empty setting of the Arkenstone on the wall above the throne ----
  K.at(T.x, T.setY, R.z1);
  K.part('stone8', box(0.8, 0.8, 0.1), STONE, 0, 0, -0.04, 0, 0, Math.PI / 4, 1, 0.05);
  K.part('gold9', torus(0.2, 0.035, 5, 18), GOLD, 0, 0, -0.1);
  K.part('metal', cyl(0.16, 0.12, 0.06, 14), 0x16140f, 0, 0, -0.09, Math.PI / 2, 0, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    K.part('gold9', cyl(0.0, 0.025, 0.09, 4), GOLD, Math.cos(a) * 0.205, Math.sin(a) * 0.205, -0.13, 0, 0, a + Math.PI / 2);
  }
  // ---- the carved standing stone (the last secret: src/secret/ draws its runes) ----
  const S = H.THRONE_STONE;
  K.at(S.x, R.floor, S.z, S.yaw);
  K.part('stone8', box(1.25, 0.2, 0.55), STONE, 0, 0.1, 0, 0, 0, 0, 1, 0.05);
  K.part('stone8', box(1.0, 1.55, 0.26), STONE, 0, 0.2 + 0.775, 0, 0, 0, 0, 1, 0.04);
  K.part('gold9', box(1.04, 0.05, 0.28), GOLD_D, 0, 0.2 + 1.57, 0);
  K.boxCollider(0, 0.9, 0, 0.55, 0.9, 0.2);
  K.at(0, 0, 0);
}

/** Builds all of layer 9's static dressing into the Kit (group 'l9'). */
export function buildHoard(K, info) {
  K.group = 'l9';
  buildPillars(K);
  buildWalls(K);
  buildLedge(K);
  buildStair(K);
  buildHoardPieces(K);
  buildThroneRoom(K); // NOTES-22-secret
  info.built = true;
  K.at(0, 0, 0);
}
