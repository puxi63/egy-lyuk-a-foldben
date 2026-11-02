/* ==== underground/laketown-pieces.js — the static dressing beneath Lake-town (layer 7), built into the Kit (kit.js)
   from the layout in laketown-sites.js:
   - the pile cavern: thin rotten stakes between the great piles (the piles themselves are part of the diggable field),
     planks of the old platforms lying in the mud, a sunken boat, barrels (half sunk in the mud, one bobbing in a pool:
     the elves' barrels came down the Forest River to Lake-town, the book ch. 9–10), old harpoons and black arrows stuck
     in the piles, ropes, stones;
   - the wharf: the old landing stage on its posts over the pool, mooring posts, a small boat tied up, crates and
     barrels by Bárd's stall (the trader himself: src/laketown-events/);
   - the sunken old town: the four houses on their piles (decks with missing planks, broken walls, roof rafters), the
     rotten trapdoor in the floor of the house over the Master's hoard, a big boat lying on its side, crates;
   - the Master's hoard room: plank-lined walls, heaps of gold (his chest with Girion's emeralds: laketown-fx.js);
   - the breaches: old boards nailed over a seeping crack, a dark wet stain (where a bad stroke lets the lake in);
   - a few stranded barrels on the barrel way down from Mirkwood;
   - the dwarf stair down to Erebor (NOTES-18-levelfix): grey stone steps on its floor, a plain portal at each end.
   Nothing named is invented (TERV Decision 18): boats, nets, barrels, crates, harpoons are generic.
   Kit group 'l7' (decor.js draws each material as one mesh, culled per view). Materials: 'wood', 'metal', 'matte',
   'glazed'. The nets, the chest and the water: laketown-fx.js, laketown-water.js. ==== */
import * as THREE from 'three';
import { rng } from '../noise.js';
import * as L from './laketown-sites.js';
import { box, cyl, lathe, rock, tube } from './kit.js';

const R = rng(7070);
const P2 = Math.PI * 2;
const WET_WOOD = [0x3e3226, 0x4a3a2a, 0x342a20];
const wetWood = () => WET_WOOD[Math.floor(R() * WET_WOOD.length)];
const PLANK = 0x5a4632;
const IRON = 0x34322e;
const ROPE = 0x7a6a4a;

/** A barrel (wood, iron hoops), standing or lying (along local x), optionally tilted. */
function barrel(K, x, y, z, yaw, lying, tilt = 0, s = 1) {
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push([0.3 * s + Math.sin(t * Math.PI) * 0.06 * s, t * 0.86 * s]);
  }
  const body = lathe(prof, 12);
  body.translate(0, -0.43 * s, 0);
  const rz = (lying ? Math.PI / 2 : 0) + tilt;
  K.part('wood', body, wetWood(), x, y, z, 0, yaw, rz, 1, 0.14);
  for (const hy of [-0.3, 0.3]) {
    const h = cyl(0.335 * s, 0.335 * s, 0.05 * s, 12, true);
    h.translate(0, hy * s, 0);
    K.part('metal', h, IRON, x, y, z, 0, yaw, rz, 1, 0.05);
  }
  for (const e of [-1, 1]) {
    const l = cyl(0.31 * s, 0.31 * s, 0.02, 12);
    l.translate(0, e * 0.425 * s, 0);
    K.part('wood', l, 0x2e241a, x, y, z, 0, yaw, rz);
  }
}

/** A crate of planks (generic trade goods), with a collider. */
function crate(K, x, y, z, yaw, s = 0.55) {
  K.at(x, y, z, yaw);
  K.part('wood', box(s, s, s), wetWood(), 0, s / 2, 0, 0, 0, 0, 1, 0.15);
  for (const yy of [0.1, 0.9]) K.part('wood', box(s + 0.02, 0.06, s + 0.02), 0x2e241a, 0, s * yy, 0);
  K.boxCollider(0, s / 2, 0, s / 2, s / 2, s / 2);
  K.at(0, 0, 0);
}

/** A boat's hull: a pinched half-pipe shell (outside and inside), thwarts and ribs; length along local z. */
function boat(K, x, y, z, yaw, roll, len = 3.2, beam = 0.62, s = 1) {
  K.at(x, y, z, yaw);
  const mk = (r, inner) => {
    const g = new THREE.CylinderGeometry(r, r, len, 12, 6, true, Math.PI / 2, Math.PI);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i) / (len / 2);
      const pinch = 1 - 0.92 * Math.abs(yy) ** 3;
      p.setX(i, p.getX(i) * pinch);
      p.setZ(i, p.getZ(i) * (0.75 + 0.25 * pinch));
    }
    if (inner) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        const t = idx[i];
        idx[i] = idx[i + 2];
        idx[i + 2] = t;
      }
    }
    g.computeVertexNormals();
    g.rotateX(Math.PI / 2);
    g.rotateZ(Math.PI);
    return g;
  };
  // The cylinder's half lies below its axis after the turns: the hull's keel down, open on top.
  K.part('wood', mk(beam * s, false), wetWood(), 0, beam * 0.75 * s, 0, 0, 0, roll, 1, 0.16);
  K.part('wood', mk(beam * 0.93 * s, true), 0x2c2218, 0, beam * 0.75 * s, 0, 0, 0, roll, 1, 0.16);
  for (const zz of [-0.6, 0.5]) K.part('wood', box(beam * 1.7 * s, 0.05, 0.22), PLANK, 0, beam * 0.62 * s, zz * len * 0.4, 0, 0, roll);
  K.boxCollider(0, beam * 0.4 * s, 0, beam * 0.9 * s, beam * 0.4 * s, len * 0.45);
  K.at(0, 0, 0);
}

/** A rotten stake (thin, decor), from the floor up to a broken top. */
function stake(K, x, fy, z, h) {
  const r = 0.06 + R() * 0.05;
  // Rotted thin towards the broken top; dark, waterlogged.
  K.part('wood', cyl(r * 0.55, r, h, 7), 0x2a2018, x, fy + h / 2 - 0.2, z, (R() - 0.5) * 0.2, 0, (R() - 0.5) * 0.2, 1, 0.2);
}

/** An old harpoon stuck in a pile (shaft and barbed head). */
function harpoon(K, x, y, z, nx, nz, len = 1.4) {
  const yaw = Math.atan2(nx, nz);
  K.at(x, y, z, yaw);
  K.part('wood', cyl(0.018, 0.02, len, 6), 0x6a5236, 0, -0.08, len / 2 - 0.15, Math.PI / 2 - 0.15, 0, 0);
  K.part('metal', cyl(0.0, 0.03, 0.16, 4), IRON, 0, 0.02, -0.12, -Math.PI / 2 - 0.15, 0, 0);
  K.at(0, 0, 0);
}

/** A black arrow stuck in a pile (the films: the black arrows of Dale's windlance; a long black iron bolt). */
function blackArrow(K, x, y, z, nx, nz) {
  const yaw = Math.atan2(nx, nz);
  K.at(x, y, z, yaw);
  K.part('metal', cyl(0.014, 0.014, 0.9, 6), 0x1c1c20, 0, 0, 0.42, Math.PI / 2 + 0.08, 0, 0, 1, 0.04);
  for (const s of [-1, 1]) K.part('metal', box(0.004, 0.09, 0.2), 0x26262a, s * 0.02, 0.03, 0.8, 0, 0, s * 0.5);
  K.at(0, 0, 0);
}

/** A point on a pile's side at height y, facing (nx, nz) out of it. */
function onPile(P, y, ang) {
  const t = (y - P.a[1]) / (P.b[1] - P.a[1]);
  const cx = P.a[0] + (P.b[0] - P.a[0]) * t;
  const cz = P.a[2] + (P.b[2] - P.a[2]) * t;
  const nx = Math.cos(ang);
  const nz = Math.sin(ang);
  return [cx + nx * (P.r - 0.03), y, cz + nz * (P.r - 0.03), nx, nz];
}

/** Old boards nailed over a seeping crack in the wall, a dark wet stain round it: the breach's mark. */
function breachMark(K, b, cx, cz) {
  const th = Math.atan2(b.z - cz, b.x - cx);
  // Back out of the wall to its surface.
  let x = b.x;
  let z = b.z;
  for (let k = 0; k < 40 && L.ltCavity(x, b.y, z) > 0; k++) {
    x -= Math.cos(th) * 0.05;
    z -= Math.sin(th) * 0.05;
  }
  const yaw = Math.atan2(-Math.cos(th), -Math.sin(th));
  K.at(x - Math.cos(th) * 0.04, b.y, z - Math.sin(th) * 0.04, yaw);
  for (let i = 0; i < 3; i++) K.part('wood', box(0.22, 1.1 + R() * 0.3, 0.05), PLANK, -0.26 + i * 0.26, 0.05 + (R() - 0.5) * 0.1, 0, 0, 0, (R() - 0.5) * 0.15, 1, 0.18);
  K.part('wood', box(0.85, 0.12, 0.05), 0x3a2c20, 0, 0.35, 0.03, 0, 0, 0.12);
  // The wet stain: dark discs on the wall round the boards, and a slick down to the floor.
  for (let i = 0; i < 6; i++) {
    const d = cyl(0.25 + R() * 0.25, 0.25 + R() * 0.25, 0.01, 10);
    K.part('matte', d, 0x10140e, (R() - 0.5) * 1.1, (R() - 0.5) * 1.2 - 0.3, -0.02, Math.PI / 2, 0, 0, 1, 0.1);
  }
  K.at(0, 0, 0);
}

/**
 * A sunken house of the old town on its piles: the deck (planks, some missing by `ruin`), broken walls on some sides,
 * a few roof rafters leaning; `trapdoor` adds the rotten hatch in the deck (the house over the Master's hoard).
 */
function house(K, h, trapdoor) {
  const fl = L.caveFloor(L.OLD_TOWN, h.x, h.z);
  const dy = fl + h.deck;
  K.at(h.x, dy, h.z, h.yaw);
  const W = h.hw * 2 + 0.5;
  // Joists, then the planks across them.
  for (const s of [-1, 1]) K.part('wood', box(0.16, 0.16, W), 0x2c2218, s * h.hw, -0.1, 0);
  const n = Math.floor(W / 0.2);
  for (let i = 0; i < n; i++) {
    const zz = -W / 2 + 0.1 + i * 0.2;
    if (R() < h.ruin * 0.45) continue;
    if (trapdoor && Math.abs(zz) < 0.35) continue;
    K.part('wood', box(W - R() * h.ruin * 0.8, 0.05, 0.18), PLANK, (R() - 0.5) * 0.1, 0.0, zz, 0, (R() - 0.5) * 0.04, (R() - 0.5) * 0.05, 1, 0.2);
  }
  if (trapdoor) {
    // A rotten hatch lying a little skew over its opening, one board broken through.
    K.part('wood', box(0.62, 0.05, 0.6), 0x3a2c1e, 0.12, 0.04, 0.02, 0.06, 0.22, 0.04, 1, 0.2);
    K.part('metal', box(0.08, 0.02, 0.2), IRON, 0.36, 0.07, 0.02, 0, 0.22, 0);
    K.part('metal', cyl(0.05, 0.05, 0.015, 8, true), IRON, -0.1, 0.07, 0.05, 0, 0, 0);
  }
  K.boxCollider(0, -0.02, 0, W / 2, 0.06, W / 2);
  // Walls: plank walls on two or three sides, broken to different heights.
  for (let side = 0; side < 4; side++) {
    if (R() < 0.25 + h.ruin * 0.4) continue;
    const ang = (side * Math.PI) / 2;
    const top = 0.6 + R() * 1.5 * (1 - h.ruin * 0.5);
    for (let k = 0; k < 9; k++) {
      const off = -W / 2 + 0.14 + k * (W - 0.28) / 8;
      const hh = top * (0.4 + 0.6 * R());
      const lx = Math.cos(ang) * (W / 2) - Math.sin(ang) * off;
      const lz = Math.sin(ang) * (W / 2) + Math.cos(ang) * off;
      K.part('wood', box(0.05, hh, 0.26), wetWood(), lx, hh / 2 + 0.03, lz, 0, -ang, (R() - 0.5) * 0.08, 1, 0.2);
    }
    K.boxCollider(Math.cos(ang) * (W / 2), top / 2, Math.sin(ang) * (W / 2), 0.05, top / 2, W / 2, -ang);
  }
  // Leaning rafters of the fallen roof.
  for (let k = 0; k < 3; k++) {
    const a = R() * P2;
    const p0 = [Math.cos(a) * h.hw, 0.1, Math.sin(a) * h.hw];
    const p1 = [p0[0] * -0.3, 1.4 + R() * 0.6, p0[2] * -0.3];
    K.part('wood', tube([p0, p1], 0.07, 0.06, 6), 0x2e241a);
  }
  K.at(0, 0, 0);
}

/**
 * Builds the dressing into the Kit. `out` receives breaches (the marks' spots) for QA.
 */
export function buildLaketown(K, out) {
  K.group = 'l7';
  K.at(0, 0, 0);
  const C = L.PILE_CAVE;
  const O = L.OLD_TOWN;
  const offStream = (x, z) => Number.isNaN(L.flowingLevel(x, C.floor + 0.2, z)) && L.waterLevel(x, z, C.floor) === -Infinity;
  const clearOfPiles = (x, y, z, r) => L.timberDist(x, y, z) > r;

  // ---- the pile cavern: rotten stakes, platform planks in the mud, stones ----
  for (let i = 0, n = 0; i < 300 && n < 22; i++) {
    const x = (R() - 0.5) * 11;
    const z = (R() - 0.5) * 11;
    if (!offStream(x, z) || !clearOfPiles(x, C.floor + 0.5, z, 0.5)) continue;
    const fy = L.ltFloorAt(x, z, C.floor + 1.5, 3);
    if (L.ltCavity(x, fy + 1.2, z) > -0.3) continue;
    stake(K, x, fy, z, 0.5 + R() * 1.6);
    n++;
  }
  for (let i = 0, n = 0; i < 300 && n < 16; i++) {
    const x = (R() - 0.5) * 10;
    const z = (R() - 0.5) * 10;
    if (!offStream(x, z) || !clearOfPiles(x, C.floor + 0.3, z, 1.0)) continue;
    const fy = L.ltFloorAt(x, z, C.floor + 1.5, 3);
    const len = 1.2 + R() * 1.6;
    K.part('wood', box(0.24, 0.05, len), PLANK, x, fy + 0.01, z, (R() - 0.5) * 0.12, R() * P2, (R() - 0.5) * 0.12, 1, 0.22);
    n++;
  }
  for (let i = 0; i < 40; i++) {
    const x = (R() - 0.5) * 11;
    const z = (R() - 0.5) * 11;
    if (!offStream(x, z) || !clearOfPiles(x, C.floor + 0.3, z, 0.4)) continue;
    const fy = L.ltFloorAt(x, z, C.floor + 1.5, 3);
    if (fy < C.floor - 1) continue;
    const r = 0.05 + R() ** 2 * 0.16;
    K.part('matte', rock(r, R() * 40, 1, 0.55), 0x2e2c26, x, fy + r * 0.2, z, 0, R() * P2, 0, 1, 0.12);
  }
  // ---- the sunken boat, barrels in the mud and one in a pool ----
  {
    const p = C.pools[0];
    const x = p.x + 1.9;
    const z = p.z - 0.4;
    const fy = L.ltFloorAt(x, z, C.floor + 1.5, 3);
    boat(K, x, fy - 0.25, z, 0.5, 0.35, 3.0, 0.6);
  }
  for (const [x, z, lying, tilt] of [[-4.4, -3.2, true, 0.3], [-3.6, -3.9, false, 0.4], [3.4, -1.2, true, -0.2], [-1.2, 4.6, true, 0.1], [1.8, 4.2, false, -0.5]]) {
    if (!clearOfPiles(x, C.floor + 0.4, z, 0.5)) continue;
    const fy = L.ltFloorAt(x, z, C.floor + 1.5, 3);
    barrel(K, x, fy + (lying ? 0.18 : 0.25), z, R() * P2, lying, tilt);
    K.capCollider([x, fy + 0.2, z], [x, fy + 0.4, z], 0.34);
  }
  {
    // One barrel bobbing in the second pool (the water rises to its middle).
    const p = C.pools[1];
    barrel(K, p.x + 0.3, p.w + 0.05, p.z - 0.2, 0.7, true, 0.15);
  }
  // ---- harpoons and black arrows in the piles, ropes round them ----
  const cavePiles = L.PILES.filter((p) => p.kind === 'full' && p.a[1] > -420);
  cavePiles.forEach((P, i) => {
    if (i % 4 === 1) {
      const q = onPile(P, C.floor + 1.3 + R() * 1.2, R() * P2);
      harpoon(K, q[0], q[1], q[2], q[3], q[4], 1.0 + R() * 0.6);
    } else if (i % 7 === 3) {
      const a = R() * P2;
      for (let k = 0; k < 2; k++) {
        const q = onPile(P, C.floor + 2.0 + k * 0.35, a + k * 0.3);
        blackArrow(K, q[0], q[1], q[2], q[3], q[4]);
      }
    } else if (i % 5 === 2) {
      // A rope wound round the pile and hanging down.
      const y = C.floor + 1.6 + R();
      const t = (y - P.a[1]) / (P.b[1] - P.a[1]);
      const cx = P.a[0] + (P.b[0] - P.a[0]) * t;
      const cz = P.a[2] + (P.b[2] - P.a[2]) * t;
      for (let k = 0; k < 3; k++) {
        const tor = new THREE.TorusGeometry(P.r + 0.03, 0.025, 4, 14);
        K.part('matte', tor, ROPE, cx, y + k * 0.06, cz, Math.PI / 2 + (R() - 0.5) * 0.2, 0, 0);
      }
      const a = R() * P2;
      const p0 = [cx + Math.cos(a) * (P.r + 0.03), y, cz + Math.sin(a) * (P.r + 0.03)];
      K.part('matte', tube([p0, [p0[0] + Math.cos(a) * 0.15, y - 0.6, p0[2] + Math.sin(a) * 0.15], [p0[0] + Math.cos(a) * 0.2, y - 1.2, p0[2] + Math.sin(a) * 0.2]], 0.022, 0.02, 4), ROPE);
    }
  });

  // ---- the wharf: the landing stage over the pool, posts, a boat, crates and barrels by the stall ----
  {
    const W = L.WHARF;
    const p = W.pool;
    const dy = W.floor + 0.32;
    // The stage: from the dry floor north of the pool out over it (south), 1.4 m wide.
    const x0 = p.x;
    const zN = p.z + p.r + 0.6;
    const zS = p.z - p.r + 0.3;
    const len = zN - zS;
    K.at(x0, dy, (zN + zS) / 2, 0);
    for (let i = 0; i < Math.floor(len / 0.2); i++) {
      if (R() < 0.08) continue;
      K.part('wood', box(1.4, 0.05, 0.18), PLANK, (R() - 0.5) * 0.05, 0, -len / 2 + 0.1 + i * 0.2, 0, (R() - 0.5) * 0.03, 0, 1, 0.2);
    }
    for (const s of [-0.62, 0.62]) K.part('wood', box(0.14, 0.14, len), 0x2c2218, s, -0.1, 0);
    K.boxCollider(0, -0.02, 0, 0.72, 0.06, len / 2);
    for (let k = 0; k <= 3; k++) {
      for (const s of [-0.62, 0.62]) {
        const zz = -len / 2 + (k * len) / 3;
        K.part('wood', cyl(0.09, 0.1, 1.5, 7), wetWood(), s, -0.6, zz, 0, 0, 0, 1, 0.15);
      }
    }
    K.at(0, 0, 0);
    // Mooring posts and the small boat tied up beside the stage.
    for (const [mx, mz] of [[x0 + 1.0, zS + 0.2], [x0 - 1.0, zS + 0.5]]) K.part('wood', cyl(0.08, 0.1, 1.3, 7), wetWood(), mx, dy + 0.2, mz);
    boat(K, x0 + 1.45, p.w - 0.2, p.z - 0.1, 0.1, 0.05, 2.2, 0.45);
    K.part('matte', tube([[x0 + 1.0, dy + 0.6, zS + 0.2], [x0 + 1.25, dy + 0.2, zS + 0.5], [x0 + 1.4, p.w + 0.2, p.z + 0.6]], 0.02, 0.02, 4), ROPE);
    // By Bárd's stall (behind him, against the wall): crates and barrels of goods.
    const b = L.BARD_STALL;
    crate(K, b.x + 0.9, L.ltFloorAt(b.x + 0.9, b.z + 0.7, W.floor + 1.5, 3), b.z + 0.7, 0.3);
    crate(K, b.x + 0.9, L.ltFloorAt(b.x + 0.9, b.z + 0.7, W.floor + 1.5, 3) + 0.55, b.z + 0.7, 0.9, 0.42);
    {
      const bx = b.x + 1.3;
      const bz = b.z - 0.5;
      const fy = L.ltFloorAt(bx, bz, W.floor + 1.5, 3);
      barrel(K, bx, fy + 0.43, bz, 0.4, false);
      K.capCollider([bx, fy + 0.3, bz], [bx, fy + 0.6, bz], 0.34);
    }
    // A coil of rope on the floor.
    {
      const cx = W.x - 1.6;
      const cz = W.z + 1.6;
      const fy = L.ltFloorAt(cx, cz, W.floor + 1.5, 3);
      for (let k = 0; k < 4; k++) K.part('matte', new THREE.TorusGeometry(0.22 - k * 0.03, 0.025, 4, 14), ROPE, cx, fy + 0.03 + k * 0.04, cz, Math.PI / 2, 0, 0);
    }
  }

  // ---- the sunken old town: the houses, the big boat on its side, crates, barrels, stakes ----
  L.OLD_HOUSES.forEach((h, i) => house(K, h, i === 2));
  {
    const x = 1.9;
    const z = 0.2;
    const fy = L.ltFloorAt(x, z, O.floor + 1.5, 3);
    boat(K, x, fy - 0.15, z, 1.2, 1.25, 4.2, 0.75);
  }
  for (const [x, z] of [[-5.0, -0.9], [-1.4, 2.6], [4.8, 2.0], [0.9, -2.6]]) {
    if (!clearOfPiles(x, O.floor + 0.4, z, 0.6) || L.waterLevel(x, z, O.floor) > -Infinity) continue;
    const fy = L.ltFloorAt(x, z, O.floor + 1.5, 3);
    if (R() < 0.5) crate(K, x, fy - 0.08, z, R() * P2, 0.5 + R() * 0.15);
    else {
      barrel(K, x, fy + 0.2, z, R() * P2, true, (R() - 0.5) * 0.4);
      K.capCollider([x, fy + 0.2, z], [x, fy + 0.4, z], 0.34);
    }
  }
  for (let i = 0, n = 0; i < 200 && n < 12; i++) {
    const x = (R() - 0.5) * 11;
    const z = (R() - 0.5) * 11;
    if (L.waterLevel(x, z, O.floor) > -Infinity || !clearOfPiles(x, O.floor + 0.5, z, 0.6)) continue;
    if (L.OLD_HOUSES.some((h) => Math.hypot(x - h.x, z - h.z) < h.hw + 0.6)) continue;
    const fy = L.ltFloorAt(x, z, O.floor + 1.5, 3);
    if (L.ltCavity(x, fy + 1.2, z) > -0.3) continue;
    stake(K, x, fy, z, 0.4 + R() * 1.2);
    n++;
  }
  // Harpoons in the old town's piles too.
  L.PILES.filter((p) => p.kind === 'full' && p.a[1] < -440).forEach((P, i) => {
    if (i % 3 !== 0) return;
    const q = onPile(P, O.floor + 1.4 + R(), R() * P2);
    harpoon(K, q[0], q[1], q[2], q[3], q[4], 1.1);
  });

  // ---- the Master's hoard room: plank lining, heaps of gold ----
  {
    const h = L.HOARD;
    const cx = (h.x0 + h.x1) / 2;
    const cz = (h.z0 + h.z1) / 2;
    const w = h.x1 - h.x0;
    const d = h.z1 - h.z0;
    const H = h.y1 - h.y0;
    for (let k = 0; k < Math.floor(w / 0.24); k++) {
      const x = h.x0 + 0.12 + k * 0.24;
      for (const [z, s] of [[h.z0 + 0.03, 1], [h.z1 - 0.03, -1]]) K.part('wood', box(0.22, H, 0.04), wetWood(), x, h.y0 + H / 2, z, 0, 0, 0, 1, 0.15);
    }
    for (let k = 0; k < Math.floor(d / 0.24); k++) {
      const z = h.z0 + 0.12 + k * 0.24;
      for (const x of [h.x0 + 0.03, h.x1 - 0.03]) K.part('wood', box(0.04, H, 0.22), wetWood(), x, h.y0 + H / 2, z, 0, 0, 0, 1, 0.15);
    }
    for (let k = 0; k < Math.floor(w / 0.22); k++) K.part('wood', box(0.2, 0.04, d - 0.1), PLANK, h.x0 + 0.11 + k * 0.22, h.y0 + 0.02, cz, 0, 0, 0, 1, 0.15);
    // The gold: low heaps of coins along the walls (and a few cups).
    for (const [gx, gz, r] of [[h.x0 + 0.5, h.z1 - 0.5, 0.42], [h.x1 - 0.45, h.z1 - 0.45, 0.36], [h.x0 + 0.45, h.z0 + 0.55, 0.3], [cx + 0.2, h.z1 - 0.35, 0.28]]) {
      const heap = new THREE.SphereGeometry(r, 12, 6, 0, P2, 0, Math.PI / 2);
      heap.scale(1, 0.45, 1);
      K.part('metal', heap, 0xf8c030, gx, h.y0 + 0.04, gz, 0, 0, 0, 1, 0.25);
      for (let k = 0; k < 8; k++) {
        const a = R() * P2;
        const rr = r * (0.9 + R() * 0.5);
        K.part('metal', cyl(0.02, 0.02, 0.006, 8), 0xe8c050, gx + Math.cos(a) * rr, h.y0 + 0.045, gz + Math.sin(a) * rr, (R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.4);
      }
    }
    // The peg on the wall above the chest where Girion's emeralds hang (finds.js).
    K.part('wood', cyl(0.02, 0.02, 0.14, 5), 0x2e241a, L.FAMOUS7.x, L.FAMOUS7.y + 0.07, h.z0 + 0.1, Math.PI / 2, 0, 0);
    for (const [gx, gz] of [[h.x0 + 0.6, h.z1 - 0.45], [h.x1 - 0.5, h.z1 - 0.4]]) K.part('metal', lathe([[0, 0], [0.03, 0], [0.008, 0.02], [0.008, 0.06], [0.04, 0.08], [0.045, 0.14], [0.0, 0.1]], 10), 0xd8a838, gx, h.y0 + 0.17, gz);
  }

  // ---- the breaches' marks ----
  out.breaches = [];
  const centres = { piles: [C.x, C.z], wharf: [L.WHARF.x, L.WHARF.z], oldtown: [O.x, O.z] };
  for (const c of L.CAVITIES) {
    const [cx, cz] = centres[c.id];
    breachMark(K, c.breach, cx, cz);
    out.breaches.push(c.breach);
  }

  // ---- stranded barrels on the barrel way down from Mirkwood ----
  for (const f of [0.18, 0.47, 0.81]) {
    const p = L.CONNECTOR[Math.floor(f * (L.CONNECTOR.length - 1))];
    const x = p[0] + (L.HELIX.x - p[0]) * 0.25;
    const z = p[2] + (L.HELIX.z - p[2]) * 0.25;
    let fy = p[1] + 1.2;
    while (fy > p[1] - 1.5 && L.connCavity(x, fy, z) < 0) fy -= 0.03;
    barrel(K, x, fy + 0.2, z, R() * P2, true, 0.2);
    K.capCollider([x, fy + 0.2, z], [x, fy + 0.4, z], 0.34);
  }

  // ---- the dwarf stair down to Erebor (NOTES-18-levelfix): stone steps on its floor, a portal at each end ----
  out.stair78Steps = buildStair78(K);
  K.at(0, 0, 0);
}

/** Grey dwarf-cut stone (the 'matte' material: no draw call of its own in layer 7's group). */
const DWARF_STONE = 0x5c5850;

/**
 * The stone steps of the dwarf stair (laketown-sites.js STAIR78): a slab every 0.7 m of the sloping floor, its top at the
 * floor's height in its middle (the walkable floor is the carved ramp under them, as the treasury ledge's steps), and a
 * plain dwarf portal (two jambs set into the walls and a lintel) where the stair leaves the old town's tunnel and where
 * it meets the mine level. No random numbers are drawn (the layer's other dressing keeps its placement). Returns the
 * number of steps.
 */
function buildStair78(K) {
  const S = L.STAIR78;
  const hw = L.STAIR78_HW;
  const tread = 0.7;
  const seg = [];
  for (let i = 0; i + 2 < S.length; i++) seg.push({ a: S[i], b: S[i + 1], l: Math.hypot(S[i + 1][0] - S[i][0], S[i + 1][2] - S[i][2]) });
  const pointAt = (s) => {
    for (const q of seg) {
      if (s <= q.l) {
        const t = s / q.l;
        return { x: q.a[0] + (q.b[0] - q.a[0]) * t, y: q.a[1] + (q.b[1] - q.a[1]) * t, z: q.a[2] + (q.b[2] - q.a[2]) * t, yaw: Math.atan2(q.b[0] - q.a[0], q.b[2] - q.a[2]) };
      }
      s -= q.l;
    }
    return null;
  };
  const total = seg.reduce((a, q) => a + q.l, 0);
  let n = 0;
  for (let s = 1.2 + tread / 2; s < total - tread / 2; s += tread) {
    const p = pointAt(s);
    K.at(p.x, p.y, p.z, p.yaw);
    K.part('matte', box(2 * hw - 0.06, 0.34, tread - 0.03), DWARF_STONE, 0, -0.16, 0, 0, 0, 0, 1, 0.06);
    n++;
  }
  const portal = (p) => {
    K.at(p.x, p.y, p.z, p.yaw);
    const spring = L.STAIR78_H - hw;
    for (const sx of [-1, 1]) K.part('matte', box(0.3, spring + 0.1, 0.34), DWARF_STONE, sx * (hw + 0.07), (spring + 0.1) / 2 - 0.05, 0, 0, 0, 0, 1, 0.05);
    K.part('matte', box(2 * hw + 0.44, 0.26, 0.38), DWARF_STONE, 0, spring + 0.08, 0, 0, 0, 0, 1, 0.05);
  };
  portal(pointAt(2.2));
  portal(pointAt(total - 0.2));
  return n;
}
