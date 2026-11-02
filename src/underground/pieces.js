/* ==== underground/pieces.js — what the digging uncovers, layer by layer (kutatas-latvany.md section 2; nothing named
   is invented, TERV Decision 18):
   1. Zsáklak kertje: the roots of the great oak above Bag End, an old stone-lined well with a bucket, a clay drain
      pipe, lost garden things (a broken teapot, a rusty spade, a rake head, flowerpot shards).
   2. Hobbitüregek és pincék: old Bag End cellars under brick vaults — a pantry with jars, cheese wheels, barrels,
      sacks of potatoes and a round door leading nowhere; a wine cellar with racks of dusty bottles and casks; a
      collapsed smial tunnel with timber frames and crates of Gandalf's fireworks (the Old Took's parties).
   3. A trollok barlangja: Bert, Tom and Vilmos turned to stone mid-quarrel (moss and ferns), the fire pit with the
      roasting spit, the huge pot, the dwarves' sacks, bones, a barrel of ale, food, swords on a rack, a rusty chest
      and a litter of plunder (brass buttons, pots and pans).
   Every builder adds parts to a Kit (kit.js) in world space. ==== */
import { rng } from '../noise.js';
import { sdf } from '../world.js';
import { box, cyl, lathe, rock, rgb, sphere, torus, tube } from './kit.js';
import { ROOMS, TROLL_CAVE, TROLL_FLOOR, WELL } from './sites.js';
import { trollPose, TROLLS } from './trolls.js';

const P2 = Math.PI * 2;

/* ---------------------------------------------------------------- shared small pieces ---- */

/** A barrel (oak staves, iron hoops), standing at the local origin; `lying` turns it on its side along x. */
export function barrel(K, x, y, z, h = 0.9, r = 0.32, lying = false, ry = 0, tint = 0x9a7a58) {
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push([r * (0.84 + 0.16 * Math.sin(t * Math.PI)), t * h]);
  }
  prof.unshift([0, 0.02]);
  prof.push([r * 0.8, h - 0.015], [0, h - 0.015]);
  const rz = lying ? Math.PI / 2 : 0;
  const oy = lying ? r * 0.98 : 0;
  const ox = lying ? h / 2 : 0;
  K.part('wood', lathe(prof, 14), tint, x + ox, y + oy, z, 0, ry, rz);
  for (const t of [0.1, 0.27, 0.73, 0.9]) {
    const rr = r * (0.84 + 0.16 * Math.sin(t * Math.PI)) + 0.006;
    const g = torus(rr, 0.014, 4, 18);
    g.rotateX(Math.PI / 2);
    g.translate(0, t * h, 0);
    K.part('metal', g, 0x3a3430, x + ox, y + oy, z, 0, ry, rz);
  }
}

/** A plank crate with darker edge battens. */
export function crate(K, x, y, z, w, h, d, ry = 0, tint = 0xb09070) {
  K.part('wood', box(w, h, d), tint, x, y + h / 2, z, 0, ry, 0);
  const b = 0.045;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const off = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (const sy of [b / 2, h - b / 2]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = off(0, sz * (d / 2 + 0.006));
      K.part('wood', box(w + 0.01, b, 0.02), 0x6a5038, px, y + sy, pz, 0, ry, 0);
    }
    for (const sx of [-1, 1]) {
      const [px, pz] = off(sx * (w / 2 + 0.006), 0);
      K.part('wood', box(0.02, b, d + 0.01), 0x6a5038, px, y + sy, pz, 0, ry, 0);
    }
  }
}

/** A jar (glazed), with a cloth cover tied on top. */
function jar(K, x, y, z, h, r, color, cloth) {
  K.part('glazed', lathe([[0, 0], [r * 0.85, 0], [r, h * 0.25], [r, h * 0.7], [r * 0.7, h * 0.88], [r * 0.72, h], [0, h]], 10), color, x, y, z);
  if (cloth) K.part('matte', cyl(r * 0.8, r * 0.95, 0.035, 10), cloth, x, y + h + 0.005, z);
}

/** A wine bottle (dark glass, dusty), standing or lying (pointing along +x of the frame). */
function bottle(K, x, y, z, lying, color, ry = 0) {
  const g = lathe([[0, 0], [0.036, 0], [0.037, 0.19], [0.03, 0.22], [0.013, 0.25], [0.013, 0.31], [0.016, 0.315], [0, 0.315]], 9);
  if (lying) K.part('glazed', g, color, x, y + 0.037, z, 0, ry, -Math.PI / 2, 1, 0.12);
  else K.part('glazed', g, color, x, y, z, 0, ry, 0, 1, 0.12);
}

/** A cheese wheel. */
function cheese(K, x, y, z, r = 0.2, h = 0.12) {
  K.part('matte', cyl(r, r, h, 16), 0xd8b050, x, y + h / 2, z);
}

/** A lumpy sack (potatoes, or a tied-up dwarf), tied at the neck. */
export function sack(K, x, y, z, s = 1, ry = 0, tint = 0x7a6440, lying = false) {
  const g = rock(0.32 * s, x * 3 + z, 2, 1);
  g.scale(1, lying ? 0.7 : 1.35, lying ? 1.6 : 1);
  K.part('matte', g, tint, x, y + (lying ? 0.22 : 0.4) * s, z, 0, ry, 0, 1, 0.12);
  if (!lying) {
    K.part('matte', cyl(0.06 * s, 0.11 * s, 0.16 * s, 8), tint, x, y + 0.88 * s, z);
    K.part('matte', torus(0.075 * s, 0.018 * s, 4, 10), 0x5a4a30, x, y + 0.84 * s, z, Math.PI / 2);
  }
}

/** A bone (long bone with knobbly ends). */
export function bone(K, x, y, z, len, ry, rz = 0, tint = 0xd8cdb0) {
  const g = cyl(0.025, 0.03, len, 7);
  g.rotateZ(Math.PI / 2);
  K.part('matte', g, tint, x, y, z, 0, ry, rz);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const e of [-1, 1]) {
    for (const k of [-1, 1]) {
      const lx = (e * len) / 2;
      const lz = k * 0.025;
      K.part('matte', sphere(0.035, 7, 5), tint, x + lx * c + lz * s, y, z - lx * s + lz * c);
    }
  }
}

/** A skull of a beast (pony or sheep): a long head with a jaw. */
export function skull(K, x, y, z, ry) {
  const g = sphere(0.13, 10, 8);
  g.scale(1, 0.8, 1.6);
  K.part('matte', g, 0xd4c8a8, x, y + 0.09, z, 0, ry, 0);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const k of [-1, 1]) K.part('matte', sphere(0.035, 6, 5), 0x2a2218, x + k * 0.07 * c + 0.06 * s, y + 0.14, z - k * 0.07 * s + 0.06 * c);
}

/** A sword: blade, crossguard, grip and pommel (generic; laid flat or hung by its crossguard). */
export function sword(K, x, y, z, ry, rx, len = 0.85, rust = 0x7a6a5a) {
  K.part('metal', box(0.045, len, 0.008), rust, x, y + len / 2, z, rx, ry, 0, 1, 0.2);
  K.part('metal', box(0.18, 0.025, 0.03), 0x5a4a3a, x, y - 0.01, z, rx, ry, 0);
  K.part('wood', cyl(0.015, 0.015, 0.12, 6), 0x3a2a1a, x, y - 0.08, z, rx, ry, 0);
  K.part('metal', sphere(0.025, 6, 5), 0x5a4a3a, x, y - 0.15, z, rx, ry, 0);
}

/* ---------------------------------------------------------------- layer 1 ---- */

/**
 * The roots of the great oak above Bag End (north-west of the pit, beyond the block's +z side): a few thick roots
 * enter from that side and twist down and across the garden soil, branching into thinner roots and rootlets.
 */
export function buildRoots(K) {
  K.group = 'l1';
  K.at(0, 0, 0);
  const R = rng(1937);
  const inside = (p) => Math.abs(p[0]) < 11.2 && Math.abs(p[2]) < 11.2 && p[1] < -0.45 && p[1] > -13;
  const grow = (start, dir, len, r0, depth) => {
    const pts = [start.slice()];
    const d = dir.slice();
    let p = start.slice();
    const step = 0.35;
    for (let i = 0; i < len / step; i++) {
      d[0] += (R() - 0.5) * 0.5;
      d[1] += (R() - 0.5) * 0.3 - 0.06;
      d[2] += (R() - 0.5) * 0.5;
      const l = Math.hypot(d[0], d[1], d[2]);
      d[0] /= l;
      d[1] /= l;
      d[2] /= l;
      const q = [p[0] + d[0] * step, p[1] + d[1] * step, p[2] + d[2] * step];
      if (!inside(q)) break;
      // Keep out of the old well's shaft.
      if (Math.hypot(q[0] - WELL.x, q[2] - WELL.z) < WELL.r + 0.3 && q[1] < WELL.top + 0.5) break;
      p = q;
      pts.push(p.slice());
      if (depth < 2 && i > 2 && R() < (depth === 0 ? 0.16 : 0.1)) {
        const side = R() < 0.5 ? -1 : 1;
        const bd = [d[0] + side * d[2] * 0.9, d[1] - 0.25, d[2] - side * d[0] * 0.9];
        const rr = r0 * (1 - i / (len / step)) * 0.55;
        if (rr > 0.012) grow(p, bd, len * 0.45, rr, depth + 1);
      }
    }
    if (pts.length < 3) return;
    const radial = r0 > 0.12 ? 8 : r0 > 0.05 ? 6 : 4;
    K.part('matte', tube(pts, r0, Math.max(0.008, r0 * 0.15), radial), depth === 0 ? 0x5a3e28 : 0x6a4c32, 0, 0, 0, 0, 0, 0, 1, 0.2);
  };
  const starts = [[-10.8, -0.7, 11.2], [-7.5, -1.1, 11.2], [-4.2, -0.8, 11.2], [-1.2, -1.6, 11.2], [-11.2, -1.4, 7.5], [-11.2, -2.4, 3.2], [2.4, -1.2, 11.2]];
  for (const s of starts) {
    const dir = [0.25 + R() * 0.3, -0.25, -1];
    if (s[0] < -11) {
      dir[0] = 1;
      dir[2] = -0.3;
    }
    grow(s, dir, 11 + R() * 7, 0.16 + R() * 0.1, 0);
  }
  // Loose fine rootlets everywhere in the top metres (from the garden plants).
  for (let i = 0; i < 40; i++) {
    const s = [(R() - 0.5) * 21, -0.5 - R() * 1.6, (R() - 0.5) * 21];
    grow(s, [R() - 0.5, -1, R() - 0.5], 1.2 + R() * 1.8, 0.012 + R() * 0.012, 2);
  }
}

/** The old well: a buried, stone-lined shaft with rotten boards over it, a rope and a bucket floating on black water. */
export function buildWell(K) {
  K.group = 'l1';
  K.at(WELL.x, 0, WELL.z);
  const R = rng(77);
  // Dry-stone lining: rough rectangular blocks in courses, a few missing.
  const ring = 12;
  let row = 0;
  for (let y = WELL.bottom; y < WELL.top + 0.3; y += 0.2, row++) {
    for (let k = 0; k < ring; k++) {
      if (R() < 0.06) continue;
      const a = ((k + (row % 2) * 0.5) / ring) * P2 + (R() - 0.5) * 0.05;
      const rr = WELL.r + 0.07;
      // Tapered towards the back (into the soil), so the faces stay closed.
      const g = box(0.3 + R() * 0.06, 0.15 + R() * 0.04, 0.18);
      const p = g.attributes.position;
      const taper = 0.75 + R() * 0.15;
      for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0) p.setXYZ(i, p.getX(i) * taper, p.getY(i) * taper, p.getZ(i));
      g.computeVertexNormals();
      const tone = 0.7 + R() * 0.45;
      K.part('matte', g, rgb(0x6a6458).map((v) => v * tone), Math.sin(a) * rr, y + 0.1, Math.cos(a) * rr, (R() - 0.5) * 0.08, a, (R() - 0.5) * 0.08, 1, 0.12);
    }
  }
  // Rotten boards across the top, one broken and hanging in.
  for (let i = -2; i <= 2; i++) {
    if (i === 1) {
      K.part('wood', box(0.16, 0.04, 1.1), 0x4a3a28, i * 0.19, WELL.top - 0.25, 0.1, 0.9, 0, 0.1);
      continue;
    }
    K.part('wood', box(0.16, 0.045, 1.7 - Math.abs(i) * 0.2), 0x5a4630, i * 0.19, WELL.top + 0.02, 0, 0, 0.04 * i, 0);
  }
  // Black water, a bucket and its rope.
  K.part('glazed', cyl(WELL.r + 0.05, WELL.r + 0.05, 0.02, 20), 0x05080a, 0, WELL.bottom + 0.4, 0);
  const bx = 0.15;
  const bz = -0.1;
  K.part('wood', lathe([[0, 0], [0.14, 0], [0.17, 0.26], [0.16, 0.27], [0.15, 0.03], [0, 0.03]], 12), 0x6a5038, bx, WELL.bottom + 0.33, bz, 0.25, 0, 0.15);
  K.part('metal', torus(0.17, 0.008, 3, 14, Math.PI), 0x3a3a38, bx, WELL.bottom + 0.6, bz, 0, 0.4, 0);
  K.part('wood', cyl(0.012, 0.012, WELL.top - WELL.bottom - 0.6, 5), 0x8a7a58, bx + 0.05, (WELL.top + WELL.bottom) / 2 + 0.3, bz, 0.02, 0, 0.02);
}

/** A clay drain pipe crossing the garden soil (sections with collars, one broken), and lost garden things. */
export function buildGardenThings(K) {
  K.group = 'l1';
  K.at(0, 0, 0);
  const R = rng(5);
  for (let x = -11.2; x < 5; x += 0.62) {
    if (x > -2.2 && x < -1.4) continue;
    const pipe = lathe([[0.075, 0], [0.075, 0.56], [0.095, 0.56], [0.095, 0.62], [0.06, 0.62], [0.06, 0], [0.075, 0]], 12);
    K.part('glazed', pipe, 0x9a5a38, x, -1.75 - (x + 11) * 0.02, -5.6, 0, 0, -Math.PI / 2 + 0.02);
  }
  // A broken teapot (white with a blue band), its lid beside it.
  K.at(2.6, -3.4, 2.1, 0.7);
  K.part('glazed', lathe([[0, 0], [0.07, 0], [0.11, 0.06], [0.1, 0.13], [0.05, 0.16], [0, 0.16]], 14), 0xe8e4d8, 0, 0, 0, 0.3, 0, 0.2);
  K.part('glazed', cyl(0.012, 0.022, 0.12, 6), 0xe8e4d8, 0.12, 0.08, 0, 0, 0, -0.9);
  K.part('glazed', torus(0.045, 0.01, 4, 10, Math.PI * 1.2), 0x3a5a9a, -0.1, 0.09, 0, 0, Math.PI / 2, 0);
  K.part('glazed', cyl(0.05, 0.05, 0.02, 12), 0xe8e4d8, 0.2, -0.05, 0.12, 0.6, 0, 0.3);
  // A rusty spade blade with a broken handle stub, and a rake head.
  K.at(-3.4, -5.2, -1.6, 1.9);
  K.part('metal', box(0.2, 0.26, 0.012), 0x6a3a22, 0, 0, 0, 0.2, 0, 0.5, 1, 0.25);
  K.part('wood', cyl(0.02, 0.02, 0.32, 6), 0x3a2a18, 0.11, 0.22, 0, 0.2, 0, 0.5);
  K.at(5.6, -2.6, -3.2, 0.4);
  K.part('metal', box(0.42, 0.03, 0.03), 0x5a3a26, 0, 0, 0, 0, 0, 0.3, 1, 0.3);
  for (let i = 0; i < 8; i++) K.part('metal', box(0.012, 0.09, 0.012), 0x5a3a26, -0.18 + i * 0.05, -0.05 + i * 0.015, 0, 0, 0, 0.3, 1, 0.3);
  // Flowerpot shards.
  for (let i = 0; i < 6; i++) {
    K.at((R() - 0.5) * 14, -1.2 - R() * 5, (R() - 0.5) * 14, R() * P2);
    const g = lathe([[0.06, 0], [0.09, 0.12]], 8);
    K.part('glazed', g, 0xa85a38, 0, 0, 0, R() * 3, 0, R() * 3, 1, 0.1);
  }
}

/* ---------------------------------------------------------------- layer 2: the cellars ---- */

/** Brick ribs of a barrel vault every ~1.3 m along the room (pilasters plus a ring of wedge bricks). */
function vaultRibs(K, room, skipEnds = true) {
  const R = room.d / 2;
  const hs = room.h - R;
  const n = Math.max(2, Math.round(room.w / 1.3));
  for (let i = 0; i <= n; i++) {
    const lx = -room.w / 2 + (i / n) * room.w;
    if (skipEnds && (i === 0 || i === n)) continue;
    if (room.slump && lx > room.w / 2 - room.slump) continue;
    for (const sz of [-1, 1]) K.part('brick', box(0.34, hs, 0.24), 0xffffff, lx, hs / 2, sz * (R - 0.04));
    const seg = 11;
    for (let k = 0; k < seg; k++) {
      const a = ((k + 0.5) / seg) * Math.PI;
      const rr = R - 0.06;
      K.part('brick', box(0.34, 0.24, (Math.PI * R) / seg - 0.012), 0xffffff, lx, hs + Math.sin(a) * rr, Math.cos(a) * rr, Math.PI / 2 - a, 0, 0);
    }
  }
}

/** A brick end wall at local x = ±w/2 (sign `sx`), filling the vault's cross-section; `broken` knocks the top in. */
function endWall(K, room, sx, broken = 0, hole = null) {
  const R = room.d / 2;
  const hs = room.h - R;
  const x = sx * (room.w / 2 - 0.12);
  const R2 = rng(Math.round(room.x * 100 + sx));
  const col = 0.25;
  for (let z = -R; z < R - 0.01; z += col) {
    const zc = z + col / 2;
    let top = hs + Math.sqrt(Math.max(0, R * R - zc * zc)) - 0.04;
    if (broken) top -= R2() * broken;
    let y0 = 0;
    if (hole && Math.abs(zc - hole.z) < hole.r) {
      // Leave the round opening for a door: the brick stops at the circle.
      const dz = zc - hole.z;
      const hh = Math.sqrt(hole.r * hole.r - dz * dz);
      const lo = hole.y - hh;
      const hi = hole.y + hh;
      if (lo > 0.02) K.part('brick', box(0.26, lo, col), 0xffffff, x, lo / 2, zc);
      y0 = hi;
    }
    if (top > y0 + 0.02) K.part('brick', box(0.26, top - y0, col + 0.002), 0xffffff, x, (top + y0) / 2, zc);
  }
  K.boxCollider(x, hs / 2, 0, 0.13, hs / 2, R);
}

/** A round hobbit door in an end wall (a door leading nowhere): planks, frame ring, brass knob in the middle. */
function roundDoor(K, x, y, z, r, sx, paint) {
  const ry = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
  const g = cyl(r, r, 0.08, 28);
  g.rotateX(Math.PI / 2);
  K.part('wood', g, paint, x, y, z, 0, ry, 0, 1, 0.12);
  const fr = torus(r + 0.04, 0.07, 6, 28);
  K.part('wood', fr, 0x5a4028, x, y, z, 0, ry, 0);
  const kx = x - sx * 0.06;
  K.part('metal', sphere(0.05, 8, 6), 0xc8a048, kx, y, z);
  for (const hy of [-0.45, 0.45]) K.part('metal', box(0.02, 0.05, r * 0.9), 0x2a2420, x - sx * 0.045, y + hy, z - r * 0.4);
}

/** A shelf unit against a wall (local frame: back to −z): uprights, planks, and its load. */
function shelf(K, x, z, w, h, d, levels) {
  for (const sx of [-1, 1]) K.part('wood', box(0.06, h, d), 0x6a5038, x + sx * (w / 2 - 0.03), h / 2, z);
  const ys = [];
  for (let i = 0; i < levels; i++) {
    const y = 0.15 + (i / (levels - 1)) * (h - 0.25);
    ys.push(y);
    const g = box(w, 0.035, d);
    K.part('wood', g, 0x8a6a48, x, y, z);
  }
  K.boxCollider(x, h / 2, z, w / 2, h / 2, d / 2);
  return ys;
}

function pantry(K, room) {
  const R = room.d / 2;
  const hs = room.h - R;
  vaultRibs(K, room);
  // The −x end: a round green door (faded), leading nowhere.
  const doorR = 0.82;
  endWall(K, room, -1, 0, { z: 0, y: doorR + 0.02, r: doorR + 0.1 });
  roundDoor(K, -room.w / 2 + 0.14, doorR + 0.02, 0, doorR, -1, 0x4a7a50);
  endWall(K, room, 1, 0.9);
  // Shelves of jars (jam, pickles) and cheese wheels along the back wall.
  const R2 = rng(11);
  for (const sx of [-0.95, 0.95]) {
    const ys = shelf(K, sx, -R + 0.28, 1.5, 1.85, 0.36, 4);
    ys.forEach((y, li) => {
      for (let i = 0; i < 6; i++) {
        const jx = sx - 0.6 + i * 0.24 + (R2() - 0.5) * 0.04;
        if (li === 0 && i % 3 === 0) {
          cheese(K, jx + 0.06, y + 0.02, -R + 0.28, 0.13, 0.1);
          continue;
        }
        if (R2() < 0.15) continue;
        const kind = R2();
        const color = kind < 0.4 ? 0x8a2a2a : kind < 0.7 ? 0x6a7a3a : kind < 0.85 ? 0xc89a40 : 0xb0a890;
        jar(K, jx, y + 0.02, -R + 0.28 + (R2() - 0.5) * 0.06, 0.16 + R2() * 0.08, 0.055 + R2() * 0.02, color, R2() < 0.6 ? 0xd8ccb0 : 0xa04030);
      }
    });
  }
  // Barrels, one lying on its side, and sacks of potatoes along the front wall.
  barrel(K, -1.6, 0, R - 0.45, 0.9, 0.32);
  barrel(K, -0.9, 0, R - 0.42, 0.85, 0.3, false, 0.4, 0x8a6a48);
  barrel(K, 0.2, 0, R - 0.45, 0.85, 0.3, true, 0.1, 0x8a6a48);
  K.boxCollider(-1.25, 0.45, R - 0.45, 0.72, 0.45, 0.36);
  K.boxCollider(0.62, 0.32, R - 0.45, 0.5, 0.32, 0.34);
  sack(K, 1.4, 0, R - 0.45, 0.9, 0.3);
  sack(K, 1.85, 0, R - 0.55, 0.8, -0.5);
  K.capCollider([1.6, 0.3, R - 0.5], [1.6, 0.9, R - 0.5], 0.42);
  // A couple of broken jars on the floor.
  for (let i = 0; i < 3; i++) K.part('glazed', lathe([[0.05, 0], [0.065, 0.06]], 7), 0x8a2a2a, -0.2 + i * 0.3, 0.03, 0.2 + R2() * 0.4, 1.4, R2() * 3, 0.3);
  // Rubble below the broken wall.
  for (let i = 0; i < 9; i++) K.part('brick', box(0.22, 0.07, 0.11), 0xffffff, room.w / 2 - 0.5 - R2() * 0.6, 0.035 + (i % 3) * 0.07, (R2() - 0.5) * (room.d - 0.4), 0, R2() * 3, 0);
  void hs;
}

function wineCellar(K, room) {
  const R = room.d / 2;
  vaultRibs(K, room);
  endWall(K, room, -1, 0);
  endWall(K, room, 1, 0.5);
  // Wine racks along both side walls: rows of dusty bottles lying with their necks out.
  const R2 = rng(23);
  for (const sz of [-1, 1]) {
    for (const rx of [-1.15, 0.35]) {
      const w = 1.3;
      const z = sz * (R - 0.3);
      for (const sx of [-1, 0, 1]) K.part('wood', box(0.05, 1.5, 0.42), 0x5a4030, rx + sx * (w / 2 - 0.03), 0.75, z);
      for (let row = 0; row < 5; row++) {
        const y = 0.12 + row * 0.28;
        K.part('wood', box(w, 0.03, 0.42), 0x6a4c34, rx, y - 0.02, z);
        for (let i = 0; i < 8; i++) {
          if (R2() < 0.12) continue;
          const bx = rx - w / 2 + 0.1 + i * 0.155;
          const dusty = R2() < 0.5 ? 0x2a3a2a : 0x3a3428;
          // Bottles point their necks out of the rack (towards the room's middle).
          bottle(K, bx, y, z + sz * 0.16, true, dusty, sz > 0 ? Math.PI / 2 : -Math.PI / 2);
        }
      }
      K.boxCollider(rx, 0.75, z, w / 2, 0.75, 0.21);
    }
  }
  // Two big casks on cradles at the +x end, and a few bottles standing on one.
  for (const z of [-0.65, 0.65]) {
    K.part('wood', box(0.12, 0.25, 0.9), 0x4a3424, room.w / 2 - 1.15, 0.12, z);
    K.part('wood', box(0.12, 0.25, 0.9), 0x4a3424, room.w / 2 - 0.45, 0.12, z);
    barrel(K, room.w / 2 - 1.35, 0.12, z, 1.1, 0.42, true, 0, 0x7a5a3a);
    K.boxCollider(room.w / 2 - 0.8, 0.55, z, 0.6, 0.55, 0.45);
  }
  for (let i = 0; i < 3; i++) bottle(K, room.w / 2 - 1.0 + i * 0.12, 0.98, 0.6, false, 0x2a3a2a);
}

/** Crates of Gandalf's fireworks (the Old Took's Midsummer parties): one broken open with the rockets showing. */
function fireworksCrates(K, x, z, ry) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let p = at(0, 0);
  crate(K, p[0], 0, p[1], 0.8, 0.5, 0.55, ry, 0xa08868);
  p = at(0.1, 0);
  crate(K, p[0], 0.5, p[1], 0.7, 0.42, 0.5, ry + 0.15, 0x9a8060);
  // The open one, lid off, rockets inside (paper tubes with cones and sticks).
  p = at(1.0, 0.1);
  K.part('wood', box(0.75, 0.04, 0.5), 0x8a7050, p[0], 0.02, p[1], 0, ry, 0);
  for (const sz of [-1, 1]) {
    const q = at(1.0, 0.1 + sz * 0.24);
    K.part('wood', box(0.75, 0.38, 0.03), 0x8a7050, q[0], 0.19, q[1], 0, ry, 0);
  }
  const R2 = rng(41);
  const colors = [0x9a2a2a, 0x2a4a8a, 0xc8a030, 0x3a7a3a, 0xd8d0c0];
  for (let i = 0; i < 12; i++) {
    const q = at(0.72 + (i % 6) * 0.1, -0.05 + Math.floor(i / 6) * 0.2);
    const tilt = (R2() - 0.5) * 0.3;
    K.part('matte', cyl(0.03, 0.03, 0.34, 8), colors[i % colors.length], q[0], 0.25, q[1], tilt, 0, tilt);
    K.part('matte', cyl(0.0, 0.032, 0.08, 8), colors[(i + 2) % colors.length], q[0], 0.46, q[1], tilt, 0, tilt);
    K.part('wood', cyl(0.006, 0.006, 0.5, 4), 0xc8b090, q[0] + 0.035, 0.3, q[1], tilt, 0, tilt);
  }
  // The broken lid on the floor.
  p = at(1.1, 0.8);
  K.part('wood', box(0.75, 0.025, 0.5), 0x8a7050, p[0], 0.05, p[1], 0.15, ry + 0.6, 0.05);
}

function smialTunnel(K, room) {
  const R = room.d / 2;
  const hs = room.h - R;
  // Timber frames instead of brick (two posts and a lintel), some sagging, and boards on the ceiling.
  const n = Math.round(room.w / 1.2);
  const R2 = rng(31);
  for (let i = 0; i <= n; i++) {
    const lx = -room.w / 2 + 0.25 + (i / n) * (room.w - 0.5);
    if (lx > room.w / 2 - room.slump - 0.2) continue;
    const sag = i === 2 ? 0.35 : 0;
    for (const sz of [-1, 1]) K.part('wood', box(0.16, room.h - 0.15, 0.16), 0x5a4430, lx, (room.h - 0.15) / 2, sz * (R - 0.14), 0, 0, sz * 0.03);
    K.part('wood', box(0.18, 0.18, room.d - 0.12), 0x5a4430, lx, room.h - 0.25 - sag * 0.5, 0, sag, 0, 0);
  }
  for (let i = 0; i < 6; i++) K.part('wood', box(room.w - room.slump - 0.6, 0.03, 0.2), 0x4a3828, -room.slump / 2, room.h - 0.12, -0.8 + i * 0.32, 0, 0, (R2() - 0.5) * 0.04);
  endWall(K, room, -1, 0.3);
  fireworksCrates(K, -1.2, -R + 0.45, 0.05);
  K.boxCollider(-0.7, 0.45, -R + 0.45, 0.95, 0.45, 0.32);
  // A fallen frame and stones in the slump.
  K.part('wood', box(0.16, 1.8, 0.16), 0x4a3828, room.w / 2 - room.slump - 0.3, 0.3, 0.2, 0.2, 0, 1.25);
  for (let i = 0; i < 6; i++) K.part('stone', rock(0.18 + R2() * 0.12, i), 0x8a7a68, room.w / 2 - room.slump + R2() * 0.6, 0.15, (R2() - 0.5) * 1.4);
  void hs;
}

/** The co-op corridor's static dressing (ribs, end walls); the dwarf door and the levers are in coop.js. */
function leverCorridor(K, room) {
  vaultRibs(K, room);
  endWall(K, room, -1, 0);
  endWall(K, room, 1, 0);
}

/** All cellar rooms (layer 2). */
export function buildCellars(K) {
  K.group = 'l2';
  for (const room of ROOMS) {
    K.at(room.x, room.y, room.z, room.rot);
    if (room.kind === 'pantry') pantry(K, room);
    else if (room.kind === 'wine') wineCellar(K, room);
    else if (room.kind === 'tunnel') smialTunnel(K, room);
    else leverCorridor(K, room);
  }
}

/* ---------------------------------------------------------------- layer 3: the troll cave ---- */

/** Marches from (x, y0, z) downwards to the first solid ground; returns its height (or y0 − 3). */
export function floorAt(x, z, y0) {
  for (let y = y0; y > y0 - 3; y -= 0.05) if (sdf(x, y, z) > 0) return y + 0.03;
  return y0 - 3;
}

/** Marches from a point along a horizontal direction to the first solid wall; returns the distance. */
export function wallDist(x, y, z, dx, dz, max = 9) {
  for (let t = 0; t < max; t += 0.05) if (sdf(x + dx * t, y, z + dz * t) > 0) return t;
  return max;
}

/** Positions of the troll set (shared with coop.js and decor.js). */
export const CAVE = {
  fire: [3.0, -1.0],
  pot: [5.3, 0.9],
  trolls: [
    { def: 'Bert', x: 0.35, z: -2.6 },
    { def: 'Tom', x: 5.85, z: -3.2 },
    { def: 'Vilmos', x: 2.5, z: 2.1 },
  ],
  chest: [8.0, 0.6],
  sacks: [0.4, 1.0],
  ale: [7.4, -1.2],
  rack: { y: 1.45, dir: [-1, 0.25] },
};

export function buildTrollCave(K, out) {
  K.group = 'l3';
  const F = TROLL_FLOOR;
  const R = rng(1938);
  const [fx, fz] = CAVE.fire;
  // The three trolls, facing the fire and each other.
  out.trolls = [];
  out.ferns = [];
  for (const t of CAVE.trolls) {
    const def = TROLLS.find((d) => d.name === t.def);
    const built = trollPose(def);
    // Bert and Tom glare at each other across the fire; Vilmos turns to the fire.
    const tx = t.def === 'Bert' ? (fx + 5.85) / 2 : t.def === 'Tom' ? (fx + 0.35) / 2 : fx;
    const tz = t.def === 'Bert' ? (fz - 3.2) / 2 : t.def === 'Tom' ? (fz - 2.6) / 2 : fz;
    const yaw = Math.atan2(tx - t.x, tz - t.z);
    const y = floorAt(t.x, t.z, F + 1) - 0.08;
    K.at(t.x, y, t.z, yaw);
    // The meshes come from the generator worker (decor.js adds them); colliders and fern spots are known now.
    // trolls (NOTES-24-trolls): the capsules are kept per troll, so a waking troll carries them along.
    const colliders = built.colliders.map((c) => K.capCollider(c.a, c.b, c.r));
    for (const p of built.tops) out.ferns.push(K.world(p[0], p[1], p[2]));
    out.trolls.push({ name: def.name, index: TROLLS.indexOf(def), x: t.x, y, z: t.z, yaw, height: built.height, colliders });
  }
  // The fire pit: a ring of stones, ash, charred logs and embers (the glow is in atmosphere.js).
  const fy = floorAt(fx, fz, F + 1);
  K.at(fx, fy, fz);
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * P2;
    K.part('stone', rock(0.2 + R() * 0.08, i + 3), 0x6a645c, Math.cos(a) * 0.95, 0.08, Math.sin(a) * 0.95);
  }
  K.part('matte', cyl(0.85, 0.9, 0.05, 18), 0x262220, 0, 0.02, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * P2 + 0.3;
    K.part('wood', cyl(0.06, 0.08, 0.9, 7), 0x1a1410, Math.cos(a) * 0.25, 0.1, Math.sin(a) * 0.25, 0, -a, Math.PI / 2 - 0.15, 1, 0.3);
  }
  out.embers = [];
  for (let i = 0; i < 26; i++) {
    const a = R() * P2;
    const r = R() * 0.55;
    const e = [Math.cos(a) * r, 0.06 + R() * 0.06, Math.sin(a) * r];
    K.part('ember', rock(0.035 + R() * 0.03, i, 0), [1, 0.3 + R() * 0.25, 0.05], e[0], e[1], e[2]);
    out.embers.push(K.world(e[0], e[1], e[2]));
  }
  K.boxCollider(0, 0.12, 0, 1.0, 0.12, 1.0);
  // The roasting spit: forked posts and a pole with a tied sack (a dwarf) and a joint of mutton.
  for (const sx of [-1, 1]) {
    K.part('wood', cyl(0.05, 0.06, 1.25, 7), 0x3a2a1c, sx * 1.35, 0.62, 0, 0, 0, sx * 0.05);
    K.part('wood', cyl(0.035, 0.04, 0.3, 6), 0x3a2a1c, sx * 1.37, 1.32, 0.08, 0.5, 0, 0);
    K.part('wood', cyl(0.035, 0.04, 0.3, 6), 0x3a2a1c, sx * 1.37, 1.32, -0.08, -0.5, 0, 0);
    K.capCollider([sx * 1.35, 0, 0], [sx * 1.35, 1.25, 0], 0.08);
  }
  const pole = cyl(0.035, 0.035, 3.0, 7);
  pole.rotateZ(Math.PI / 2);
  K.part('wood', pole, 0x4a3828, 0, 1.24, 0);
  sack(K, 0.25, 0.75, 0, 0.85, 0, 0x7a6848, true);
  for (const lx of [-0.2, 0.25, 0.7]) K.part('matte', torus(0.24, 0.02, 4, 12), 0x5a4a30, lx, 1.0, 0, 0, Math.PI / 2, 0);
  K.part('matte', sphere(0.2, 10, 7), 0x6a2a18, -0.75, 1.15, 0, 0, 0, 0, [1.4, 0.9, 0.9]);
  // The huge pot (where the dwarves were to be cooked), black iron on a tripod of logs, embers under it.
  const [px, pz] = CAVE.pot;
  const py = floorAt(px, pz, F + 1);
  K.at(px, py, pz, 0.3);
  const pot = lathe([[0, 0.25], [0.45, 0.27], [0.72, 0.55], [0.78, 0.85], [0.7, 1.12], [0.74, 1.16], [0.66, 1.16], [0.62, 1.1], [0.68, 0.85], [0.62, 0.58], [0.4, 0.35], [0, 0.33]], 22);
  K.part('metal', pot, 0x2a2624, 0, 0, 0, 0, 0, 0, 1, 0.15);
  for (const a of [0, 2.1, 4.2]) K.part('metal', cyl(0.05, 0.04, 0.3, 6), 0x2a2624, Math.cos(a) * 0.4, 0.14, Math.sin(a) * 0.4);
  K.part('metal', torus(0.12, 0.025, 4, 10), 0x2a2624, 0.76, 1.0, 0, 0, Math.PI / 2, 0);
  K.part('metal', torus(0.12, 0.025, 4, 10), 0x2a2624, -0.76, 1.0, 0, 0, Math.PI / 2, 0);
  K.part('matte', cyl(0.64, 0.64, 0.01, 20), 0x1e1a12, 0, 1.0, 0);
  K.capCollider([0, 0.2, 0], [0, 1.0, 0], 0.8);
  // The dwarves' sacks, piled.
  const [sx0, sz0] = CAVE.sacks;
  const sy = floorAt(sx0, sz0, F + 1);
  K.at(sx0, sy, sz0, 0.4);
  const spots = [[0, 0, 0, 1], [0.6, 0, 0.2, 1.05], [-0.5, 0, 0.35, 0.95], [0.25, 0, 0.75, 1], [0.1, 0.55, 0.3, 0.9], [-0.7, 0, -0.5, 1]];
  for (const [x, y, z, s] of spots) sack(K, x, y, z, s, R() * 3, 0x7a6848, y > 0 || R() < 0.4);
  K.capCollider([-0.3, 0.3, 0.2], [0.5, 0.3, 0.3], 0.6);
  // A barrel of ale with a tap, and a tankard on it.
  const [ax, az] = CAVE.ale;
  const ay = floorAt(ax, az, F + 1);
  K.at(ax, ay, az, -0.5);
  barrel(K, 0, 0, 0, 1.2, 0.42, false, 0, 0x7a5a3a);
  K.part('wood', cyl(0.03, 0.03, 0.12, 6), 0x3a2a1a, 0, 0.25, 0.44, Math.PI / 2, 0, 0);
  K.part('metal', lathe([[0, 0], [0.07, 0], [0.075, 0.16], [0.065, 0.17], [0, 0.17]], 10), 0x6a6a68, 0.1, 1.19, 0.05);
  K.capCollider([0, 0, 0], [0, 1.2, 0], 0.45);
  // The rusty chest and a litter of plunder around it: brass buttons, pots and pans, a goblet, a few coins.
  const [cx, cz] = CAVE.chest;
  const cy = floorAt(cx, cz, F + 1);
  K.at(cx, cy, cz, -1.2);
  K.part('wood', box(0.95, 0.5, 0.6), 0x4a3424, 0, 0.25, 0);
  const lid = cyl(0.3, 0.3, 0.95, 12, false);
  lid.rotateZ(Math.PI / 2);
  K.part('wood', lid, 0x4a3424, 0, 0.5, 0, 0, 0, 0, [1, 0.7, 1]);
  for (const bx of [-0.35, 0, 0.35]) {
    K.part('metal', box(0.06, 0.52, 0.62), 0x6a3a1e, bx, 0.25, 0, 0, 0, 0, 1, 0.3);
    K.part('metal', torus(0.305, 0.02, 3, 12, Math.PI), 0x6a3a1e, bx, 0.5, 0, 0, Math.PI / 2, 0, [1, 0.72, 1]);
  }
  K.part('metal', box(0.12, 0.14, 0.03), 0x7a4a22, 0, 0.42, 0.31);
  K.boxCollider(0, 0.4, 0, 0.5, 0.4, 0.32);
  for (let i = 0; i < 18; i++) {
    const a = R() * P2;
    const r = 0.6 + R() * 0.9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const k = R();
    if (k < 0.35) K.part('metal', cyl(0.018, 0.018, 0.006, 10), 0xc89a40, x, 0.03, z, R() * 0.5, 0, R() * 0.5);
    else if (k < 0.5) K.part('metal', cyl(0.022, 0.022, 0.005, 10), 0xe0b840, x, 0.03, z, 0.2, 0, 0.1);
    else if (k < 0.7) K.part('metal', lathe([[0, 0], [0.13, 0], [0.15, 0.1], [0.14, 0.1], [0.12, 0.012], [0, 0.012]], 12), 0x4a4440, x, 0.02, z, R() * 0.4, R() * 3, R() * 0.4);
    else if (k < 0.8) K.part('metal', lathe([[0, 0], [0.04, 0], [0.012, 0.03], [0.012, 0.09], [0.04, 0.11], [0.045, 0.17], [0, 0.17]], 10), 0xb08a40, x, 0.03, z, 1.4, R() * 3, 0);
    else bone(K, x, 0.04, z, 0.3 + R() * 0.2, R() * 3);
  }
  // Swords on a wooden rack against the west wall (generic blades; the named ones are finds).
  {
    const [dx, dz] = CAVE.rack.dir;
    const l = Math.hypot(dx, dz);
    const ox = 2.0;
    const oz = -0.4;
    const ry = F + CAVE.rack.y;
    const t = wallDist(ox, ry, oz, dx / l, dz / l);
    const rx = ox + (dx / l) * (t - 0.18);
    const rz = oz + (dz / l) * (t - 0.18);
    K.at(rx, F, rz, Math.atan2(-dx, -dz));
    K.part('wood', box(1.7, 0.1, 0.08), 0x4a3424, 0, CAVE.rack.y + 0.55, 0);
    K.part('wood', box(1.7, 0.1, 0.08), 0x4a3424, 0, CAVE.rack.y - 0.2, 0);
    for (const sx of [-0.8, 0.8]) K.part('wood', box(0.1, CAVE.rack.y + 0.7, 0.1), 0x4a3424, sx, (CAVE.rack.y + 0.7) / 2, 0.02);
    for (let i = 0; i < 4; i++) sword(K, -0.55 + i * 0.37, CAVE.rack.y - 0.15, 0.07, 0, 0.06 * (i % 2 ? 1 : -1), 0.75 + (i % 3) * 0.08);
    K.boxCollider(0, (CAVE.rack.y + 0.7) / 2, 0, 0.85, (CAVE.rack.y + 0.7) / 2, 0.1);
  }
  // Food on a flat rock: a mutton joint, loaves and a cheese (the trolls' larder).
  {
    const x = 6.8;
    const z = 2.4;
    const y = floorAt(x, z, F + 1);
    K.at(x, y, z, 0.8);
    K.part('stone', rock(0.55, 9, 1, 0.45), 0x6a645c, 0, 0.15, 0);
    K.part('matte', sphere(0.17, 9, 7), 0x7a3a22, 0.1, 0.42, 0, 0, 0, 0.4, [1.5, 0.9, 0.9]);
    bone(K, -0.18, 0.44, 0.03, 0.22, 0.1, 0.4);
    for (let i = 0; i < 3; i++) K.part('matte', sphere(0.1, 8, 6), 0xa8783a, -0.25 + i * 0.14, 0.38, 0.25, 0, i, 0, [1.3, 0.75, 1]);
    cheese(K, 0.3, 0.32, -0.22, 0.14, 0.1);
    K.capCollider([0, 0.15, 0], [0, 0.3, 0], 0.5);
  }
  // Bones everywhere: on the floor and stuck in the walls around the cave.
  K.at(0, 0, 0);
  for (let i = 0; i < 46; i++) {
    const a = R() * P2;
    const e = 0.25 + R() * 0.7;
    const x = TROLL_CAVE.x + Math.cos(a) * TROLL_CAVE.rx * e;
    const z = TROLL_CAVE.z + Math.sin(a) * TROLL_CAVE.rz * e;
    if (Math.hypot(x - fx, z - fz) < 1.3) continue;
    const y = floorAt(x, z, F + 1.2);
    if (i % 9 === 0) skull(K, x, y, z, R() * P2);
    else bone(K, x, y + 0.03, z, 0.25 + R() * 0.35, R() * P2, (R() - 0.5) * 0.3);
  }
  for (let i = 0; i < 22; i++) {
    // In the rock just outside the cave: the digging finds them before the cave itself.
    const a = R() * P2;
    const e = 1.06 + R() * 0.2;
    const x = TROLL_CAVE.x + Math.cos(a) * TROLL_CAVE.rx * e;
    const z = TROLL_CAVE.z + Math.sin(a) * TROLL_CAVE.rz * e;
    const y = F + R() * 3.5;
    if (sdf(x, y, z) < 0.15) continue;
    bone(K, x, y, z, 0.3 + R() * 0.3, R() * P2, (R() - 0.5) * 1.2);
  }
  // Rubble along the walls.
  for (let i = 0; i < 16; i++) {
    const a = R() * P2;
    const x = TROLL_CAVE.x + Math.cos(a) * TROLL_CAVE.rx * 0.88;
    const z = TROLL_CAVE.z + Math.sin(a) * TROLL_CAVE.rz * 0.88;
    const y = floorAt(x, z, F + 1.5);
    K.part('stone', rock(0.25 + R() * 0.35, i * 7, 1, 0.6), 0x4a4644, x, y + 0.08, z, 0, R() * 3, 0);
  }
}
