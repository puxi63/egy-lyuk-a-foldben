/* ==== underground/erebor-pieces.js — the static dressing of the mines of Erebor (layer 8), built into the Kit (kit.js)
   from the layout in erebor-sites.js:
   - the great hall: six pillars of green hall stone with gold bands, the great dwarf statue against the north wall
     (a dwarf king, generic: hands on the haft of a great hammer, a long braided beard, a crowned helm), gold inlay on
     the floor, a gold band and rune friezes round the walls, cold iron lanterns, the south door's frame, the harps'
     alcove (the harps themselves are a famous find, finds.js), the light shaft's stone collar, stones on the rubble
     heaps;
   - the mine workings (the ring gallery and its cross-cuts, the great ramp, the deepest gallery): rails on sleepers,
     carved stone ribs, mine carts (some with ore), a winch at the head of the ramp, lanterns, tools, gem crystals in
     the deepest working (the films: Erebor's mines with carts on rails);
   - the forges: three cold furnaces with stepped hoods, great bellows, anvils, a quench trough, tool racks, chains,
     ingots; the walled-up doorway in the east wall (the clue to the sealed armoury);
   - the sealed armoury: weapon racks, shields, the stand of the mithril shirt (the shirt itself: erebor-fx.js).
   Nothing named is invented (TERV Decision 18): the statue is a generic dwarf king, the tools and carts generic.
   Kit group 'l8' (decor.js draws each material as one mesh, culled per view). Materials: 'stone8' (the carved hall
   stone, the soil shader's own layer), 'stone8d' (the raw dwarf stone: the statue, loose stones), 'gold', 'metal',
   'wood', 'matte', 'glazed'. ==== */
import * as THREE from 'three';
import { rng } from '../noise.js';
import * as E from './erebor-sites.js';
import { box, cyl, lathe, rock, sphere, torus } from './kit.js';
import { STAIR78, STAIR78_HW } from './laketown-sites.js';

const R = rng(8080);
const F = E.HALL.floor;
const FF = E.FORGE.floor;
const GOLD = 0xc8962e;
const GOLD_D = 0x9a6e22;
const IRON = 0x3a3a3e;
const IRON_D = 0x26262a;
const WOOD = 0x5a4430;
const WOOD_D = 0x3e2e20;
/** The carved hall stone's vertex colour (the soil shader's hall-stone layer multiplies it): a mid green, paler than the walls. */
const STONE = 0x3a564a;

/** Walks a polyline [x, y, z] in steps of `step` metres: fn(point, yaw, pitch, arc) (yaw: three.js, along the course). */
function along(pts, step, fn, start = 0) {
  let arc = 0;
  let next = start;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const h = Math.hypot(dx, dz);
    const len = Math.hypot(h, dy);
    if (len < 1e-6) continue;
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(dy, h);
    while (next <= arc + len) {
      const t = (next - arc) / len;
      fn([a[0] + dx * t, a[1] + dy * t, a[2] + dz * t], yaw, pitch, next);
      next += step;
    }
    arc += len;
  }
}

/** A railway along a course of floor points: two iron rails on wooden sleepers (gauge 0.6 m). */
function rails(K, pts, lift = 0.03) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const h = Math.hypot(dx, dz);
    const len = Math.hypot(h, dy);
    if (len < 0.05) continue;
    K.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + lift, (a[2] + b[2]) / 2, Math.atan2(dx, dz));
    for (const s of [-0.3, 0.3]) K.part('metal', box(0.05, 0.06, len + 0.02), IRON, s, 0.09, 0, -Math.atan2(dy, h), 0, 0, 1, 0.05);
  }
  along(pts, 0.75, (p, yaw, pitch) => {
    K.at(p[0], p[1] + lift, p[2], yaw);
    K.part('wood', box(0.92, 0.06, 0.15), WOOD_D, 0, 0.03, 0, -pitch, 0, 0, 1, 0.2);
  }, 0.3);
  K.at(0, 0, 0);
}

/** A carved stone rib across a vaulted gallery (two posts and the arch), at a course point. */
function rib(K, p, yaw, hw, h) {
  K.at(p[0], p[1], p[2], yaw);
  const spring = h - hw;
  for (const s of [-1, 1]) K.part('stone8', box(0.26, spring + 0.05, 0.32), STONE, s * (hw - 0.1), spring / 2, 0);
  const arch = torus(hw - 0.1, 0.15, 4, 10, Math.PI);
  K.part('stone8', arch, STONE, 0, spring, 0, 0, 0, 0, 1, 0.06);
  K.at(0, 0, 0);
}

/** A cold iron lantern on a bracket (a wall point, facing into the room along yaw). */
function lantern(K, x, y, z, yaw) {
  K.at(x, y, z, yaw);
  K.part('metal', box(0.04, 0.04, 0.32), IRON_D, 0, 0.1, 0.14);
  K.part('metal', box(0.17, 0.24, 0.17), IRON, 0, -0.05, 0.3, 0, 0, 0, 1, 0.1);
  K.part('glazed', box(0.13, 0.18, 0.13), 0x6a5a38, 0, -0.05, 0.3);
  K.part('metal', cyl(0.0, 0.12, 0.1, 4), IRON_D, 0, 0.12, 0.3, 0, Math.PI / 4, 0);
  K.at(0, 0, 0);
}

/** A mine cart (wood body with iron corners on four wheels), optionally full of ore. Along local z. */
function cart(K, x, y, z, yaw, ore = true) {
  K.at(x, y, z, yaw);
  const W = 0.7;
  const L = 1.05;
  const H = 0.45;
  const by = 0.24;
  K.part('wood', box(W, 0.05, L), WOOD, 0, by, 0, 0, 0, 0, 1, 0.15);
  for (const s of [-1, 1]) {
    K.part('wood', box(0.05, H, L), WOOD, s * (W / 2), by + H / 2, 0, 0, 0, 0, 1, 0.15);
    K.part('wood', box(W, H, 0.05), WOOD, 0, by + H / 2, s * (L / 2), 0, 0, 0, 1, 0.15);
    for (const t of [-1, 1]) K.part('metal', box(0.07, H + 0.02, 0.07), IRON, s * (W / 2), by + H / 2, t * (L / 2));
    for (const t of [-0.32, 0.32]) {
      const wh = cyl(0.13, 0.13, 0.05, 10);
      K.part('metal', wh, IRON_D, s * 0.3, 0.13, t, 0, 0, Math.PI / 2);
    }
  }
  if (ore) {
    for (let i = 0; i < 7; i++) {
      const c = i % 3 === 0 ? 0x7a4430 : i % 3 === 1 ? 0x4a4e4a : 0x5a3a2a;
      K.part('matte', rock(0.12 + R() * 0.06, i * 3.1 + x, 1), c, (R() - 0.5) * 0.45, by + H - 0.05 + R() * 0.12, (R() - 0.5) * 0.75);
    }
  }
  K.boxCollider(0, by + H / 2, 0, W / 2 + 0.04, H / 2 + by / 2, L / 2 + 0.04);
  K.at(0, 0, 0);
}

/** A rune frieze: a sunk panel with gold strokes (generic dwarf runes: a stem and one to three branches each). */
function runeFrieze(K, x, y, z, yaw, w, n) {
  K.at(x, y, z, yaw);
  K.part('stone8', box(w, 0.5, 0.06), 0x7a8a80, 0, 0, 0.03);
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + (i + 0.5) * (w / n);
    K.part('gold', box(0.03, 0.34, 0.025), GOLD, cx, 0, 0.07);
    const k = 1 + Math.floor(R() * 3);
    for (let j = 0; j < k; j++) {
      const up = R() < 0.5 ? 1 : -1;
      const yy = (R() - 0.5) * 0.2;
      K.part('gold', box(0.025, 0.16, 0.025), GOLD, cx + 0.05 * (R() < 0.5 ? 1 : -1), yy, 0.07, 0, 0, up * 0.75);
    }
  }
  K.at(0, 0, 0);
}

/** A dwarf chest-high stone block with a gold band (the furnaces' bodies, the pedestal's steps). */
function goldBand(K, w, d, y, x = 0, z = 0) {
  K.part('gold', box(w + 0.04, 0.1, d + 0.04), GOLD, x, y, z, 0, 0, 0, 1, 0.05);
}

/* ---------------------------------------------------------------- the great hall ---- */

function buildPillars(K) {
  for (const p of E.PILLARS) {
    const top = E.hallRoof(p.x, p.z) + 0.3;
    K.at(p.x, F, p.z, 0);
    const shaftH = top - F - p.baseH;
    K.part('stone8', box(p.h * 2, shaftH, p.h * 2), STONE, 0, p.baseH + shaftH / 2, 0, 0, 0, 0, 1, 0.04);
    // Base: two steps; capital: two stepped blocks under the roof.
    K.part('stone8', box(p.base * 2, p.baseH * 0.55, p.base * 2), STONE, 0, p.baseH * 0.275, 0);
    K.part('stone8', box(p.base * 2 - 0.2, p.baseH * 0.45, p.base * 2 - 0.2), STONE, 0, p.baseH * 0.775, 0);
    for (const [hy, w] of [[top - F - 1.3, 1.45], [top - F - 0.85, 1.75]]) K.part('stone8', box(w, 0.4, w), STONE, 0, hy, 0);
    // Gold bands and gold corner strips low on the shaft (the green-and-gold halls).
    for (const hy of [2.3, 6.2, 10.1]) goldBand(K, p.h * 2, p.h * 2, hy);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.part('gold', box(0.06, 1.6, 0.06), GOLD_D, sx * p.h, p.baseH + 0.8, sz * p.h);
    K.boxCollider(0, (top - F) / 2, 0, p.h, (top - F) / 2, p.h);
    K.boxCollider(0, p.baseH / 2, 0, p.base, p.baseH / 2, p.base);
  }
  K.at(0, 0, 0);
}

/** The great dwarf statue: a dwarf king on a pedestal, both hands on the haft of a great hammer standing before him. */
function buildStatue(K) {
  const S = E.STATUE;
  K.at(S.x, F, S.z, 0);
  const ped = S.ped;
  // Pedestal: a wide step, the block, a cornice; gold bands, a rune frieze on its face.
  K.part('stone8', box(ped.hx * 2 + 0.5, 0.3, ped.hz * 2 + 0.4), STONE, 0, 0.15, 0.1);
  K.part('stone8', box(ped.hx * 2, ped.h - 0.5, ped.hz * 2), STONE, 0, 0.3 + (ped.h - 0.5) / 2, 0);
  K.part('stone8', box(ped.hx * 2 + 0.25, 0.2, ped.hz * 2 + 0.2), STONE, 0, ped.h - 0.1, 0.05);
  goldBand(K, ped.hx * 2, ped.hz * 2, 0.55);
  goldBand(K, ped.hx * 2 + 0.25, ped.hz * 2 + 0.2, ped.h - 0.24, 0, 0.05);
  K.boxCollider(0, ped.h / 2, 0.05, ped.hx + 0.25, ped.h / 2, ped.hz + 0.2);
  const y0 = ped.h;
  const M = 'stone8d';
  const C = 0x687068;
  // Boots under the robe's hem.
  for (const s of [-1, 1]) K.part(M, box(0.55, 0.32, 0.8), C, s * 0.42, y0 + 0.16, 0.18);
  // The robe: a flared skirt, flattened front to back.
  const robe = lathe([[1.28, 0], [1.22, 0.4], [1.08, 1.6], [0.98, 2.6], [0.95, 3.1]], 14);
  K.part(M, robe, C, 0, y0 + 0.25, 0, 0, 0, 0, [1, 1, 0.66], 0.05);
  // Folds: a few vertical ridges on the robe.
  for (let i = -2; i <= 2; i++) K.part(M, box(0.12, 2.9, 0.12), 0x5c665e, i * 0.42, y0 + 1.7, 0.66 - Math.abs(i) * 0.04, -0.06, 0, 0);
  // The torso and the mail-coat's skirt edge, the broad belt with a gold buckle.
  const ty = y0 + 3.35;
  K.part(M, box(2.1, 2.3, 1.25), C, 0, ty + 1.15, 0, 0, 0, 0, 1, 0.05);
  K.part('gold', box(2.24, 0.34, 1.36), GOLD, 0, ty + 0.1, 0);
  K.part('gold', box(0.5, 0.42, 0.1), 0xe0b048, 0, ty + 0.1, 0.7);
  // Shoulders and arms: the upper arms down the sides, the forearms forward to the haft before the chest.
  for (const s of [-1, 1]) {
    const sh = sphere(0.58, 10, 7);
    K.part(M, sh, C, s * 1.12, ty + 2.1, 0, 0, 0, 0, [1, 0.85, 1]);
    K.part(M, cyl(0.36, 0.4, 1.4, 9), C, s * 1.2, ty + 1.45, 0.05, 0.1, 0, s * 0.08);
    K.part(M, cyl(0.3, 0.36, 1.25, 9), C, s * 0.62, ty + 0.85, 0.62, 1.25, 0, -s * 0.55);
    // Gold-bound vambraces.
    K.part('gold', cyl(0.34, 0.34, 0.18, 9), GOLD_D, s * 0.8, ty + 0.75, 0.42, 1.25, 0, -s * 0.55);
  }
  // The great hammer: the head on the pedestal, the haft up to the hands before the chest.
  K.part('metal', box(0.9, 0.7, 0.6), 0x5a6260, 0, y0 + 0.35, 1.25);
  K.part('gold', box(0.94, 0.12, 0.64), GOLD, 0, y0 + 0.5, 1.25);
  K.part(M, cyl(0.12, 0.13, 3.6, 8), 0x8a7a60, 0, y0 + 2.4, 1.18, -0.08, 0, 0);
  K.part('gold', cyl(0.17, 0.17, 0.25, 8), GOLD, 0, y0 + 4.2, 1.06);
  // The hands, one over the other on the haft's top.
  K.part(M, sphere(0.3, 9, 7), C, 0, ty + 0.75, 1.05, 0, 0, 0, [1.3, 0.8, 1]);
  K.part(M, sphere(0.28, 9, 7), C, 0, ty + 1.0, 1.02, 0, 0, 0, [1.25, 0.75, 1]);
  // The head: a broad face, a strong nose, deep-set eyes under heavy brows.
  const hy = ty + 2.85;
  K.part(M, box(0.95, 1.0, 0.95), C, 0, hy, 0.05, 0, 0, 0, 1, 0.04);
  K.part(M, box(0.2, 0.42, 0.22), C, 0, hy - 0.05, 0.58);
  K.part(M, box(0.8, 0.14, 0.18), 0x5c665e, 0, hy + 0.2, 0.52);
  for (const s of [-1, 1]) K.part('matte', box(0.18, 0.08, 0.05), 0x1c201e, s * 0.22, hy + 0.08, 0.52);
  // The beard: long and broad from the cheeks to the belt, two braids bound with gold rings.
  const beard = lathe([[0.05, 0], [0.4, 0.3], [0.62, 1.0], [0.66, 1.6], [0.5, 1.95]], 12);
  K.part(M, beard, 0x707a72, 0, hy - 2.3, 0.6, 0, 0, 0, [1, 1, 0.45], 0.06);
  for (const s of [-1, 1]) {
    K.part(M, cyl(0.1, 0.13, 1.1, 7), 0x707a72, s * 0.38, hy - 1.9, 0.86);
    for (const yy of [-1.6, -2.2]) K.part('gold', cyl(0.13, 0.13, 0.08, 8), GOLD, s * 0.38, hy + yy + 0.25, 0.86);
  }
  // A crowned helm: the cap, a gold rim, the crown's points, a crest.
  K.part(M, sphere(0.56, 12, 6), C, 0, hy + 0.48, 0.02, 0, 0, 0, [1, 0.62, 1]);
  K.part('gold', cyl(0.6, 0.6, 0.16, 12, true), GOLD, 0, hy + 0.5, 0.02);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + ((i - 3) / 6) * Math.PI * 0.9;
    K.part('gold', cyl(0.0, 0.08, 0.32, 4), 0xe0b048, Math.cos(a + Math.PI / 2) * 0.58, hy + 0.72, 0.02 + Math.sin(a + Math.PI / 2) * 0.58);
  }
  K.part(M, box(0.12, 0.35, 0.8), C, 0, hy + 0.92, 0.0);
  K.capCollider([0, y0 + 0.3, 0.2], [0, ty + 2.6, 0.2], 1.2);
  K.at(0, 0, 0);
}

function buildHallDressing(K) {
  const A = E.HALL.a;
  // Gold inlay on the floor: a border, a diamond in the middle, lines between them.
  const strip = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    K.at((x0 + x1) / 2, F + 0.006, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0));
    K.part('gold', box(0.09, 0.012, len), GOLD, 0, 0, 0, 0, 0, 0, 1, 0.05);
  };
  const b = A - 0.7;
  strip(-b, -b, b, -b);
  strip(b, -b, b, b);
  strip(b, b, -b, b);
  strip(-b, b, -b, -b);
  const d = 2.2;
  strip(0, -d, d, 0);
  strip(d, 0, 0, d);
  strip(0, d, -d, 0);
  strip(-d, 0, 0, -d);
  strip(0, d, 0, b);
  strip(d, 0, b, 0);
  strip(-d, 0, -b, 0);
  K.at(0, 0, 0);
  // The gold band round the walls at 3 m and rune friezes above it (not over the door, the alcove and the south door).
  const band = (x0, z0, x1, z1, yaw) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    K.at((x0 + x1) / 2, F + 3.0, (z0 + z1) / 2, yaw);
    K.part('gold', box(len, 0.12, 0.04), GOLD, 0, 0, 0.0);
  };
  const w = A - 0.02;
  band(-A, -w, A, -w, 0);
  band(w, -A, w, -1.4, -Math.PI / 2);
  band(w, 1.4, w, A, -Math.PI / 2);
  band(-A, w, -5.4, w, Math.PI);
  band(-2.6, w, A, w, Math.PI);
  band(-w, -A, -w, A, Math.PI / 2);
  for (const x of [-4.6, 4.6]) runeFrieze(K, x, F + 3.55, -A + 0.01, 0, 2.6, 7);
  runeFrieze(K, A - 0.01, F + 3.55, -4.2, -Math.PI / 2, 2.6, 7);
  runeFrieze(K, A - 0.01, F + 3.55, 4.2, -Math.PI / 2, 2.6, 7);
  runeFrieze(K, 1.5, F + 3.55, A - 0.01, Math.PI, 3.4, 9);
  // Lanterns on the walls (cold).
  for (const [x, z, yaw] of [[-5.2, -A, 0], [5.2, -A, 0], [A, -5.0, -Math.PI / 2], [A, 3.0, -Math.PI / 2], [-A, 4.4, Math.PI / 2], [-A, -5.0, Math.PI / 2], [0.6, A, Math.PI], [5.0, A, Math.PI]]) {
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    lantern(K, x + nx * 0.02, F + 2.5, z + nz * 0.02, yaw);
  }
  // The south door's frame (to the great ramp) and the harps' alcove frame.
  K.at(-4.0, F, A, Math.PI);
  for (const s of [-1, 1]) K.part('stone8', box(0.4, 3.4, 0.35), STONE, s * 1.3, 1.7, -0.05);
  K.part('stone8', box(3.0, 0.45, 0.4), STONE, 0, 3.5, -0.05);
  K.part('gold', box(3.02, 0.08, 0.42), GOLD, 0, 3.3, -0.05);
  K.at(A, F, 0, -Math.PI / 2);
  for (const s of [-1, 1]) K.part('stone8', box(0.3, 2.8, 0.25), STONE, s * 1.25, 1.4, -0.04);
  K.part('stone8', box(2.8, 0.35, 0.3), STONE, 0, 2.85, -0.04);
  K.part('gold', box(2.82, 0.07, 0.32), GOLD, 0, 2.68, -0.04);
  // Pegs on the alcove's back wall for the harps.
  for (const z of [-0.17, 0.17]) {
    K.at(E.FAMOUS8.x + 0.05, E.FAMOUS8.y + 0.28, z, -Math.PI / 2);
    K.part('gold', cyl(0.015, 0.015, 0.12, 6), GOLD_D, 0, 0, 0.05, Math.PI / 2, 0, 0);
  }
  // The light shaft's stone collar in the roof.
  K.at(E.SUN_SHAFT.x, E.hallRoof(E.SUN_SHAFT.x, E.SUN_SHAFT.z) - 0.25, E.SUN_SHAFT.z, 0);
  K.part('stone8', torus(E.SUN_SHAFT.r + 0.12, 0.14, 5, 14), STONE, 0, 0, 0, Math.PI / 2, 0, 0);
  K.part('gold', torus(E.SUN_SHAFT.r + 0.12, 0.05, 4, 14), GOLD, 0, -0.12, 0, Math.PI / 2, 0, 0);
  // Stones fallen from the roof on the rubble heaps and round them.
  for (const r of E.RUBBLE) {
    for (let i = 0; i < 9; i++) {
      const a = R() * Math.PI * 2;
      const q = r.r * (0.5 + R() * 0.8);
      const x = r.x + Math.cos(a) * q;
      const z = r.z + Math.sin(a) * q;
      const y = E.erFloorAt(x, z, F + r.h + 0.5, r.h + 1.2);
      K.at(x, y, z, R() * 6);
      K.part('stone8d', rock(0.14 + R() * 0.16, i + r.x * 7, 1), 0x56605a, 0, 0.04, 0);
    }
  }
  K.at(0, 0, 0);
}

/* ---------------------------------------------------------------- the mine workings ---- */

function buildMines(K) {
  // Rails: the ring, the cross-cuts, the great ramp, the deepest gallery, into the forges.
  rails(K, E.MINE_RING);
  for (const c of E.MINE_CROSS) rails(K, [c[0], [c[0][0] * 0.82, c[0][1], c[0][2] * 0.82], [0, c[0][1], 0], [c[1][0] * 0.82, c[1][1], c[1][2] * 0.82], c[1]]);
  rails(K, E.RAMP);
  rails(K, E.DEEP);
  const fd = E.rampPoint(FF);
  rails(K, [[fd[0], FF, fd[2]], [E.FORGE.x0 + 0.3, FF, fd[2]], [-3.2, FF, 2.0]]);
  // Carved ribs along the galleries.
  along(E.MINE_RING, 4.5, (p, yaw) => rib(K, p, yaw, E.MINE.hw, E.MINE.h), 2);
  // No rib where the dwarf stair from layer 7 opens into the east–west cross-cut (NOTES-18-levelfix): its post would
  // stand in the stair's mouth.
  const foot = STAIR78[STAIR78.length - 1];
  const inStairMouth = (p) => Math.abs(p[0] - foot[0]) < STAIR78_HW + 0.5 && Math.abs(p[2] - foot[2]) < 1.5;
  for (const c of E.MINE_CROSS) along(c, 4.5, (p, yaw) => { if (Math.hypot(p[0], p[2]) > 3.2 && Math.hypot(p[0], p[2]) < 7.4 && !inStairMouth(p)) rib(K, p, yaw, 1.1, 2.7); }, 1);
  along(E.RAMP, 6, (p, yaw) => rib(K, p, yaw, 1.25, 2.9), 8);
  along(E.DEEP, 4.5, (p, yaw) => rib(K, p, yaw, 1.2, 2.7), 1.5);
  // Lanterns on the gallery walls (cold), every 12 m of the ramp and the ring.
  const wallLamp = (p, yaw, hw, side) => {
    const nx = Math.cos(yaw) * side;
    const nz = -Math.sin(yaw) * side;
    lantern(K, p[0] + nx * (hw - 0.04), p[1] + 1.85, p[2] + nz * (hw - 0.04), Math.atan2(-nx, -nz));
  };
  along(E.RAMP, 12, (p, yaw, pitch, arc) => wallLamp(p, yaw, 1.25, (Math.round(arc / 12) % 2) * 2 - 1), 4);
  along(E.MINE_RING, 11, (p, yaw) => wallLamp(p, yaw, E.MINE.hw, 1), 6);
  // Carts: three on the ring, one in the deepest gallery (and one in the forges).
  const onCourse = (pts, k, ore, dy = 0) => {
    const a = pts[k];
    const b = pts[k + 1];
    cart(K, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.03 + dy, (a[2] + b[2]) / 2, Math.atan2(b[0] - a[0], b[2] - a[2]), ore);
  };
  onCourse(E.MINE_RING, 9, true);
  onCourse(E.MINE_RING, 30, false);
  onCourse(E.MINE_RING, 45, true);
  onCourse(E.DEEP, 1, true);
  // The winch at the head of the ramp: a drum on two posts, rope wound on it.
  {
    const p = E.RAMP[2];
    const q = E.RAMP[3];
    const yaw = Math.atan2(q[0] - p[0], q[2] - p[2]);
    K.at(E.RAMP[0][0], E.MINE.floor, E.RAMP[0][2], yaw);
    for (const s of [-1, 1]) K.part('wood', box(0.14, 1.1, 0.14), WOOD, s * 0.8, 0.55, -0.9);
    K.part('wood', cyl(0.22, 0.22, 1.5, 12), WOOD, 0, 0.85, -0.9, 0, 0, Math.PI / 2);
    K.part('matte', cyl(0.26, 0.26, 1.2, 12), 0x8a7a52, 0, 0.85, -0.9, 0, 0, Math.PI / 2);
    for (const s of [-1, 1]) K.part('metal', box(0.04, 0.4, 0.04), IRON, s * 0.85, 0.85, -0.7, 0.8, 0, 0);
    K.boxCollider(0, 0.6, -0.9, 0.9, 0.6, 0.2);
  }
  // The middle chamber of the mine level: tools against the wall, ore heaped up, a bucket.
  const c = E.MINE.chamber;
  for (let i = 0; i < 4; i++) {
    const a = 0.6 + i * 0.35;
    const x = c.x + Math.cos(a) * (c.r - 0.3);
    const z = c.z + Math.sin(a) * (c.r - 0.3);
    K.at(x, E.MINE.floor, z, a + Math.PI / 2);
    K.part('wood', cyl(0.025, 0.03, 1.0, 6), WOOD, 0, 0.5, 0, 0.18, 0, 0);
    K.part('metal', box(0.5, 0.06, 0.06), IRON, 0, 0.98, 0.09, 0.18, 0, 0.1);
  }
  for (let i = 0; i < 14; i++) {
    const x = c.x - 1.4 + (R() - 0.5) * 0.9;
    const z = c.z + 0.9 + (R() - 0.5) * 0.9;
    K.at(x, E.MINE.floor + R() * 0.25, z, R() * 6);
    K.part('matte', rock(0.12 + R() * 0.1, i * 2.3, 1), i % 2 ? 0x7a4430 : 0x4a504c, 0, 0.08, 0);
  }
  K.at(c.x - 0.6, E.MINE.floor, c.z - 1.6, 0);
  K.part('wood', cyl(0.2, 0.17, 0.32, 10, true), WOOD, 0, 0.16, 0);
  K.part('metal', torus(0.2, 0.012, 3, 12), IRON, 0, 0.3, 0, Math.PI / 2, 0, 0);
  // The deepest working: gem crystals in the face, tools left behind, an ore heap.
  const f = E.DEEP_FACE;
  for (let i = 0; i < 22; i++) {
    const a = -0.6 + R() * 2.8;
    const yy = f.y + 0.4 + R() * 1.9;
    let x = f.x + Math.cos(a) * (f.r - 0.6);
    let z = f.z - Math.sin(a) * (f.r - 0.6);
    for (let k = 0; k < 30 && E.ereborCavity(x, yy, z) < 0; k++) {
      x += Math.cos(a) * 0.05;
      z -= Math.sin(a) * 0.05;
    }
    const col = [0x30d080, 0xd83048, 0x3060e0, 0xe8e8f0, 0x40c0b0][i % 5];
    K.at(x, yy, z, R() * 6);
    for (let k = 0; k < 3; k++) {
      const o = new THREE.OctahedronGeometry(0.05 + R() * 0.04, 0);
      K.part('glazed', o, col, (R() - 0.5) * 0.1, (R() - 0.5) * 0.1, (R() - 0.5) * 0.1, R(), R(), R(), [1, 1.8, 1], 0.1);
    }
  }
  for (let i = 0; i < 3; i++) {
    K.at(f.x - 1.2 + i * 0.5, f.y, f.z + 1.2, 0.4 + i);
    K.part('wood', cyl(0.025, 0.03, 0.95, 6), WOOD, 0, 0.12, 0, Math.PI / 2 - 0.1, 0, 0);
    K.part('metal', box(0.45, 0.05, 0.06), IRON, 0, 0.12, 0.47, 0, 0, 0.0);
  }
  for (let i = 0; i < 10; i++) {
    K.at(f.x + 0.6 + (R() - 0.5) * 0.9, f.y + R() * 0.2, f.z + 0.9 + (R() - 0.5) * 0.7, R() * 6);
    K.part('matte', rock(0.1 + R() * 0.08, i * 5.1, 1), i % 3 ? 0x6a3c2a : 0x405048, 0, 0.06, 0);
  }
  K.at(0, 0, 0);
}

/* ---------------------------------------------------------------- the forges ---- */

/** A cold furnace against the north wall: the stone body with its dark mouth, cold coals, a stepped hood. */
function furnace(K, x) {
  const z = E.FORGE.z0 + 0.75;
  K.at(x, FF, z, 0);
  K.part('stone8', box(2.1, 1.3, 1.4), STONE, 0, 0.65, 0);
  K.part('matte', box(1.1, 0.55, 0.3), 0x0e0c0a, 0, 0.75, 0.58);
  K.part('stone8', box(1.3, 0.12, 0.2), STONE, 0, 1.08, 0.66);
  for (let i = 0; i < 6; i++) K.part('matte', rock(0.1, x * 3 + i, 0), 0x1a1614, (R() - 0.5) * 0.8, 1.32, (R() - 0.5) * 0.6);
  goldBand(K, 2.1, 1.4, 1.2);
  // The hood: three stepped blocks narrowing up into the vault.
  for (const [hy, w, d] of [[2.0, 1.9, 1.3], [3.0, 1.45, 1.1], [4.3, 1.0, 0.9], [5.6, 0.75, 0.75]]) K.part('stone8', box(w, 1.3, d), STONE, 0, hy, -0.1);
  goldBand(K, 1.9, 1.3, 1.45, 0, -0.1);
  K.boxCollider(0, 0.65, 0, 1.05, 0.65, 0.7);
  K.at(0, 0, 0);
}

/** The great bellows beside a furnace: two boards, the leather between them, the nozzle into the furnace, the lever. */
function bellows(K, x, side) {
  const z = E.FORGE.z0 + 1.0;
  K.at(x + side * 1.75, FF, z + 0.2, -side * 0.5);
  K.part('wood', box(0.9, 0.45, 0.3), WOOD_D, 0, 0.22, 0);
  K.part('wood', box(0.85, 0.06, 1.7), WOOD, 0, 0.55, 0.1, 0.0, 0, 0);
  K.part('matte', box(0.8, 0.3, 1.5), 0x4a3424, 0, 0.72, 0.15, -0.08, 0, 0, [1, 1, 1], 0.2);
  K.part('wood', box(0.85, 0.06, 1.7), WOOD, 0, 0.92, 0.1, -0.16, 0, 0);
  K.part('metal', cyl(0.06, 0.1, 0.6, 8), IRON, 0, 0.6, -0.95, Math.PI / 2, 0, 0);
  // The lever: a post and a long pole over it.
  K.part('wood', box(0.14, 1.9, 0.14), WOOD, 0.55, 0.95, 0.9);
  K.part('wood', cyl(0.05, 0.05, 2.6, 6), WOOD, 0.4, 1.85, 0.4, Math.PI / 2 - 0.3, 0, 0);
  K.part('metal', cyl(0.012, 0.012, 1.0, 4), IRON_D, 0.2, 1.4, -0.3);
  K.boxCollider(0, 0.5, 0.1, 0.5, 0.5, 0.9);
  K.at(0, 0, 0);
}

/** An anvil on its stone block. */
function anvil(K, x, z, yaw) {
  K.at(x, FF, z, yaw);
  K.part('stone8', box(0.6, 0.5, 0.6), STONE, 0, 0.25, 0);
  K.part('metal', box(0.32, 0.18, 0.5), IRON, 0, 0.59, 0);
  K.part('metal', box(0.24, 0.12, 0.3), IRON, 0, 0.71, 0);
  K.part('metal', box(0.36, 0.1, 0.62), IRON, 0, 0.82, 0.02);
  K.part('metal', cyl(0.0, 0.07, 0.36, 8), IRON, 0, 0.82, 0.48, Math.PI / 2, 0, 0);
  // A hammer left on it.
  K.part('wood', cyl(0.018, 0.02, 0.42, 6), WOOD, 0.08, 0.89, -0.05, Math.PI / 2, 0.3, 0);
  K.part('metal', box(0.07, 0.07, 0.15), IRON_D, 0.14, 0.91, -0.24, 0, 0.3, 0);
  K.boxCollider(0, 0.45, 0, 0.32, 0.45, 0.4);
  K.at(0, 0, 0);
}

function buildForges(K) {
  for (const x of [-4.8, -1.65, 1.5]) furnace(K, x);
  bellows(K, -4.8, 1);
  bellows(K, -1.65, 1);
  bellows(K, 1.5, -1);
  anvil(K, -4.0, -1.8, 0.3);
  anvil(K, -1.6, -2.2, -0.2);
  anvil(K, 0.9, -1.6, 0.6);
  anvil(K, -2.4, 1.2, 1.4);
  // The quench trough with dark, still water.
  K.at(0.4, FF, 3.4, 0);
  K.part('stone8', box(2.6, 0.7, 0.8), STONE, 0, 0.35, 0);
  K.part('glazed', box(2.36, 0.02, 0.56), 0x0c1412, 0, 0.58, 0);
  goldBand(K, 2.6, 0.8, 0.62);
  K.boxCollider(0, 0.35, 0, 1.3, 0.35, 0.4);
  // Tool racks on the south wall: a beam with tongs and hammers hanging.
  for (const x0 of [-4.4, -0.8]) {
    K.at(x0, FF, E.FORGE.z1 - 0.12, Math.PI);
    K.part('wood', box(2.4, 0.14, 0.12), WOOD, 0, 1.9, 0);
    for (let i = 0; i < 7; i++) {
      const x = -1.0 + i * 0.33;
      if (i % 2) {
        K.part('metal', box(0.03, 0.62, 0.02), IRON_D, x - 0.02, 1.5, 0.08, 0, 0, 0.06);
        K.part('metal', box(0.03, 0.62, 0.02), IRON_D, x + 0.02, 1.5, 0.08, 0, 0, -0.06);
      } else {
        K.part('wood', cyl(0.018, 0.02, 0.6, 6), WOOD, x, 1.55, 0.09);
        K.part('metal', box(0.14, 0.08, 0.08), IRON, x, 1.24, 0.09);
      }
    }
  }
  // Chains hanging from the vault with hooks.
  for (const [x, z] of [[-3.2, 0.2], [-0.2, -0.3], [2.0, 1.0]]) {
    const top = FF + E.FORGE.wall + 1.6;
    K.at(x, top, z, 0);
    const len = 2.8 + R() * 1.2;
    K.part('metal', cyl(0.025, 0.025, len, 5), IRON_D, 0, -len / 2, 0);
    K.part('metal', torus(0.09, 0.02, 4, 8, Math.PI * 1.4), IRON, 0, -len - 0.08, 0, 0, 0, 2.4);
  }
  // Ingots stacked by the west wall, a stone mould.
  K.at(-5.6, FF, 2.6, 0.2);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) K.part('metal', box(0.14, 0.07, 0.34), r === 2 ? 0x8a6a40 : 0x50545a, -0.24 + i * 0.16 + r * 0.08, 0.035 + r * 0.07, 0, 0, r % 2 ? Math.PI / 2 : 0, 0);
  K.part('stone8', box(0.9, 0.18, 0.5), STONE, 0.6, 0.09, 0.6);
  K.part('matte', box(0.7, 0.03, 0.12), 0x1a1816, 0.6, 0.19, 0.6);
  // A cart of ore at the end of the rails.
  cart(K, -3.4, FF + 0.03, 2.4, 2.3, true);
  // The walled-up doorway in the east wall: an arch frame, the fill of rougher blocks, runes over it (the clue).
  const W = E.WALLED_DOOR;
  K.at(W.x - 0.02, FF, W.z, -Math.PI / 2);
  for (const s of [-1, 1]) K.part('stone8', box(0.3, W.h, 0.22), STONE, s * (W.w / 2 + 0.15), W.h / 2, 0.06);
  K.part('stone8', box(W.w + 0.6, 0.35, 0.24), STONE, 0, W.h + 0.17, 0.06);
  for (let r = 0; r < 7; r++) {
    for (let i = 0; i < 4; i++) {
      const bw = W.w / 4;
      const x = -W.w / 2 + (i + 0.5 + (r % 2 ? 0.25 : -0.25)) * bw;
      if (Math.abs(x) > W.w / 2 - bw * 0.3) continue;
      K.part('stone8d', box(bw - 0.03, W.h / 7 - 0.03, 0.08), 0x58625a, x, (r + 0.5) * (W.h / 7), 0.02, 0, 0, 0, 1, 0.12);
    }
  }
  K.at(0, 0, 0);
  runeFrieze(K, W.x - 0.02, FF + W.h + 0.7, W.z, -Math.PI / 2, 1.8, 5);
  // Lanterns.
  for (const [x, z, yaw] of [[-6.5, -3.0, Math.PI / 2], [3.2, -4.2, -Math.PI / 2], [3.2, 4.2, -Math.PI / 2], [-2.0, 6.5, Math.PI]]) lantern(K, x + Math.sin(yaw) * 0.02, FF + 2.4, z + Math.cos(yaw) * 0.02, yaw);
  K.at(0, 0, 0);
}

/* ---------------------------------------------------------------- the sealed armoury ---- */

function buildArmoury(K) {
  const A = E.ARMOURY;
  // Weapon racks along the north and south walls: axes and spears (generic dwarf arms).
  for (const s of [-1, 1]) {
    const z = s > 0 ? A.z1 - 0.15 : A.z0 + 0.15;
    K.at((A.x0 + A.x1) / 2, A.y0, z, s > 0 ? Math.PI : 0);
    K.part('wood', box(1.6, 0.1, 0.1), WOOD_D, 0, 1.5, 0.02);
    K.part('wood', box(1.6, 0.1, 0.1), WOOD_D, 0, 0.35, 0.02);
    for (let i = 0; i < 4; i++) {
      const x = -0.6 + i * 0.4;
      K.part('wood', cyl(0.02, 0.022, 1.7, 6), WOOD, x, 0.9, 0.08, 0.05, 0, 0);
      if (i % 2) K.part('metal', box(0.04, 0.32, 0.2), 0x8a9096, x, 1.62, 0.16);
      else K.part('metal', cyl(0.0, 0.035, 0.28, 4), 0x8a9096, x, 1.88, 0.08);
    }
  }
  // Round shields on the west wall (by the walled-up doorway's back), gold bosses.
  for (const z of [-0.85, 0.85]) {
    K.at(A.x0 + 0.04, A.y0 + 1.5, z, Math.PI / 2);
    K.part('metal', cyl(0.38, 0.38, 0.05, 14), 0x5a5e62, 0, 0, 0.02, Math.PI / 2, 0, 0);
    K.part('gold', sphere(0.08, 8, 6), GOLD, 0, 0, 0.06);
    K.part('gold', torus(0.36, 0.02, 3, 16), GOLD_D, 0, 0, 0.05);
  }
  // A chest in the corner, and the stand of the mithril shirt against the east wall (the shirt: erebor-fx.js).
  K.at(A.x1 - 0.45, A.y0, A.z0 + 0.4, 0);
  K.part('wood', box(0.7, 0.45, 0.45), WOOD, 0, 0.225, 0);
  K.part('metal', box(0.72, 0.05, 0.47), IRON, 0, 0.38, 0);
  const M = E.MITHRIL;
  K.at(M.x, M.y, M.z, M.yaw);
  K.part('wood', box(0.5, 0.06, 0.4), WOOD_D, 0, 0.03, 0);
  K.part('wood', cyl(0.035, 0.04, 1.2, 8), WOOD, 0, 0.62, 0);
  K.part('wood', box(0.55, 0.05, 0.06), WOOD, 0, 1.2, 0);
  K.boxCollider(0, 0.6, 0, 0.25, 0.6, 0.2);
  K.at(0, 0, 0);
}

/** Builds layer 8's dressing into the kit (group 'l8'); `info` gets nothing yet (kept for the decor.js pattern). */
export function buildErebor(K, info) {
  K.group = 'l8';
  buildPillars(K);
  buildStatue(K);
  buildHallDressing(K);
  buildMines(K);
  buildForges(K);
  buildArmoury(K);
  info.built = true;
  K.at(0, 0, 0);
}
