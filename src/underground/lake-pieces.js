/* ==== underground/lake-pieces.js — the dressing of Gollum's lake (layer 5), built into the Kit (kit.js) from the
   layout in lake-sites.js: the stony shore (pebbles and boulders round the water, a few half sunk in the shallows), the
   slimy rock of the roof with its dripping stalactites and a few stalagmites, Gollum's island with the bones of his
   meals (book ch. 5: blind fish, and goblin when he could get it; the film: the goblin he drags off), the goblin's
   remains on the shore, and rubble along the long tunnel down. Nothing named is invented (TERV Decision 18); the cave
   formations, stones and bones are generic. No fires: the lake is cold blue darkness (TERV 0.12).

   Kit group 'l5' (decor.js draws each material as one mesh, culled per view). Materials: 'stone5' (carved rock in the
   lake's own soil layer, wet), 'matte' (bones, rags), 'metal' (a goblin's broken blade). ==== */
import { rng } from '../noise.js';
import * as L from './lake-sites.js';
import { box, cyl, rock, sphere } from './kit.js';
import { bone } from './pieces.js';

const R = rng(5005);
const P2 = Math.PI * 2;
const WY = L.WATER_Y;

/** Rock tints: cold dark blue-greys, like the terrain's own vertex tint (the soil shader multiplies them with the lake\n * layer's texture). */
const STONE = [0x2a3038, 0x252b33, 0x30363e, 0x22282f, 0x343a42];
const stoneTint = () => STONE[Math.floor(R() * STONE.length)];
const BONE = 0xcfc6ae;
const OLD_BONE = 0xb4aa90;

/** True near the lift landing (kept clear: the barrel and the riders stand there). */
function nearLift(x, z, r = 2.4) {
  return Math.hypot(x - L.LIFT_SPOT.x, z - L.LIFT_SPOT.z) < r;
}

/** True on the riddle terrace's middle (kept clear for Gollum and the player). */
function onTerrace(x, z) {
  const a = L.RIDDLE_SPOT;
  const b = L.RIDDLE_PLAYER;
  return Math.hypot(x - (a.x + b.x) / 2, z - (a.z + b.z) / 2) < 2.2;
}

/** A pebble or a stone lying on the floor at (x, z), its bottom a little sunk in. */
function stone(K, x, z, r, y0 = WY + 1.5) {
  const fy = L.lakeFloorAt(x, z, y0, 3.5);
  const g = rock(r, R() * 50, 1, 0.55 + R() * 0.25);
  K.part('stone5', g, stoneTint(), x, fy + r * 0.28, z, (R() - 0.5) * 0.4, R() * P2, (R() - 0.5) * 0.4, 1, 0.12);
  return fy;
}

/** A stalactite hanging from the roof at (x, z): a tapering cone with a rounded drip tip; returns its tip height. */
function stalactite(K, x, z, len, r, roof) {
  // A lumpy spindle (a noise-displaced sphere stretched down), narrowing to its tip: no two alike.
  const g = rock(1, R() * 60, 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // y −1 (tip) … 1 (root): the radius tapers towards the tip.
    const k = 0.18 + 0.82 * Math.pow(Math.min(1, Math.max(0, (y + 1) / 2)), 0.8);
    p.setXYZ(i, p.getX(i) * r * k, (y - 1) * (len / 2), p.getZ(i) * r * k);
  }
  g.computeVertexNormals();
  K.part('stone5', g, stoneTint(), x, roof + 0.15, z, (R() - 0.5) * 0.1, R() * P2, (R() - 0.5) * 0.1, 1, 0.15);
  // A collar of flowstone where it meets the roof.
  const c = rock(r * 1.4, R() * 30, 1, 0.45);
  K.part('stone5', c, stoneTint(), x, roof + 0.05, z, 0, R() * P2, 0, 1, 0.1);
  return roof + 0.15 - len;
}

/** A stalagmite rising from the floor (short and stubby), with a collider when it is big enough to bump into. */
function stalagmite(K, x, z, h, r) {
  const fy = L.lakeFloorAt(x, z, WY + 2, 3);
  const g = cyl(r * 0.25, r, h, 8);
  g.translate(0, h / 2, 0);
  K.part('stone5', g, stoneTint(), x, fy - 0.05, z, (R() - 0.5) * 0.1, R() * P2, (R() - 0.5) * 0.1, 1, 0.15);
  K.part('stone5', rock(r * 1.4, R() * 30, 1, 0.4), stoneTint(), x, fy, z, 0, R() * P2, 0);
  if (h > 0.45) K.capCollider([x, fy + r * 0.6, z], [x, fy + h - r * 0.4, z], r * 0.75);
}

/** A fish skeleton (spine, ribs, skull) lying on the rock. */
function fishBones(K, x, y, z, ry, s = 1) {
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const at = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  const spine = cyl(0.008 * s, 0.006 * s, 0.3 * s, 5);
  spine.rotateZ(Math.PI / 2);
  K.part('matte', spine, BONE, x, y + 0.01, z, 0, ry, 0, 1, 0.05);
  for (let i = 0; i < 8; i++) {
    for (const k of [-1, 1]) {
      const rib = cyl(0.004 * s, 0.002 * s, 0.07 * s, 4);
      rib.rotateX(Math.PI / 2 - k * 0.5);
      const [px, pz] = at((-0.1 + i * 0.028) * s, k * 0.03 * s);
      K.part('matte', rib, BONE, px, y + 0.012, pz, 0, ry, 0, 1, 0.05);
    }
  }
  const head = sphere(0.035 * s, 7, 5);
  head.scale(1.5, 0.6, 0.8);
  const [hx, hz] = at(-0.17 * s, 0);
  K.part('matte', head, BONE, hx, y + 0.02, hz, 0, ry, 0, 1, 0.05);
  const tail = box(0.05 * s, 0.004, 0.06 * s);
  const [tx, tz] = at(0.17 * s, 0);
  K.part('matte', tail, BONE, tx, y + 0.008, tz, 0, ry, 0, 1, 0.05);
}

/** A skull (a goblin's: a round cranium, a jutting jaw, dark sockets). */
function goblinSkull(K, x, y, z, ry) {
  const g = sphere(0.1, 10, 8);
  g.scale(1, 0.92, 1.15);
  K.part('matte', g, OLD_BONE, x, y + 0.08, z, 0.3, ry, 0.2, 1, 0.08);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  K.part('matte', box(0.11, 0.04, 0.07), OLD_BONE, x - 0.09 * s, y + 0.02, z - 0.09 * c, 0, ry, 0);
  for (const k of [-1, 1]) K.part('matte', sphere(0.026, 6, 5), 0x1e1a14, x + k * 0.04 * c - 0.085 * s, y + 0.1, z - k * 0.04 * s - 0.085 * c);
}

/** Scattered bones (a few long bones, ribs, a skull) round (x, z) on the floor. */
function boneScatter(K, x, z, n, withSkull, y0 = WY + 1.5) {
  for (let i = 0; i < n; i++) {
    const a = R() * P2;
    const r = 0.15 + R() * 0.6;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const fy = L.lakeFloorAt(px, pz, y0, 3);
    if (fy < WY + 0.02) continue;
    bone(K, px, fy + 0.03, pz, 0.18 + R() * 0.22, R() * P2, (R() - 0.5) * 0.3, R() < 0.5 ? BONE : OLD_BONE);
  }
  if (withSkull) goblinSkull(K, x, L.lakeFloorAt(x, z, y0, 3), z, R() * P2);
}

/**
 * Builds the lake's dressing into the Kit. `out` receives: drips (roof points over the water where the drops form,
 * for the atmosphere's drip spawner and the ring effect).
 */
export function buildLake(K, out) {
  out.drips = [];
  K.group = 'l5';
  K.at(0, 0, 0);
  // ---- the stony shore: pebbles all round, denser at the water's edge, some sunk in the shallows ----
  for (let i = 0; i < 300; i++) {
    const th = R() * P2;
    const S = L.shoreFrac(th);
    // Mostly on the shore, a quarter in the shallows just off it.
    const t = R() < 0.25 ? S - R() * 0.05 : S + Math.pow(R(), 0.7) * (0.96 - S);
    const [x, z] = L.planPoint(th, t);
    if (nearLift(x, z) || (onTerrace(x, z) && R() < 0.8)) continue;
    const r = 0.05 + Math.pow(R(), 2.2) * 0.2;
    stone(K, x, z, r);
  }
  // ---- boulders along the walls (colliders: you walk round them) ----
  for (let i = 0; i < 16; i++) {
    const th = (i / 16) * P2 + R() * 0.25;
    const t = 0.94 + R() * 0.04;
    const [x, z] = L.planPoint(th, t);
    if (nearLift(x, z, 3.2) || onTerrace(x, z)) continue;
    const r = 0.35 + R() * 0.35;
    const fy = L.lakeFloorAt(x, z, WY + 2.5, 3);
    const g = rock(r, R() * 40, 2, 0.6 + R() * 0.2);
    K.part('stone5', g, stoneTint(), x, fy + r * 0.3, z, (R() - 0.5) * 0.3, R() * P2, (R() - 0.5) * 0.3, 1, 0.12);
    K.capCollider([x, fy + r * 0.35, z], [x, fy + r * 0.45, z], r * 0.85);
  }
  // A few boulders out in the shallows, their backs just out of the water.
  for (let i = 0; i < 5; i++) {
    const th = R() * P2;
    const [x, z] = L.planPoint(th, L.shoreFrac(th) - 0.04 - R() * 0.04);
    if (nearLift(x, z) || onTerrace(x, z)) continue;
    const r = 0.3 + R() * 0.25;
    const fy = L.lakeFloorAt(x, z, WY + 1, 4);
    K.part('stone5', rock(r, R() * 40, 2, 0.7), stoneTint(), x, Math.max(fy + r * 0.4, WY - r * 0.55), z, 0, R() * P2, 0, 1, 0.12);
  }
  // ---- stalactites from the low roof (over the water and the shore), dripping; stalagmites under some ----
  let placed = 0;
  for (let tries = 0; placed < 46 && tries < 400; tries++) {
    const th = R() * P2;
    const t = Math.sqrt(R()) * 0.95;
    const [x, z] = L.planPoint(th, t);
    if (nearLift(x, z, 2.8)) continue;
    const floor = L.lakeFloorAt(x, z, WY + 2, 7);
    const base = Math.max(floor, WY);
    const roof = L.lakeRoofAt(x, z, base + 0.5, 7);
    const room = roof - base;
    if (room < 1.4) continue;
    // Over dry shore, keep the head room a hobbit and a dwarf need (long ones only over the water).
    const overWater = floor < WY - 0.3;
    const maxLen = overWater ? Math.min(1.6, room - 0.9) : Math.min(0.7, room - 1.9);
    if (maxLen < 0.2) continue;
    const len = 0.2 + R() * (maxLen - 0.2);
    const tip = stalactite(K, x, z, len, 0.05 + len * 0.12 + R() * 0.04, roof);
    if (overWater) out.drips.push([x, tip, z]);
    // A stubby stalagmite under a few of the dry ones (the drip builds it up).
    if (!overWater && R() < 0.35 && !onTerrace(x, z) && room > 2.8) stalagmite(K, x, z, 0.25 + R() * 0.5, 0.1 + R() * 0.08);
    placed++;
  }
  // ---- Gollum's island: lumps of rock on its top, the bones of his meals ----
  const I = L.ISLAND_C;
  for (let i = 0; i < 9; i++) {
    const a = R() * P2;
    const r = I.r * (0.55 + R() * 0.5);
    const x = I.x + Math.cos(a) * r;
    const z = I.z + Math.sin(a) * r;
    stone(K, x, z, 0.12 + R() * 0.22, WY + 1.4);
  }
  for (let i = 0; i < 5; i++) {
    const a = R() * P2;
    const r = R() * I.r * 0.75;
    const x = I.x + Math.cos(a) * r;
    const z = I.z + Math.sin(a) * r;
    fishBones(K, x, L.lakeFloorAt(x, z, WY + 1.4, 2), z, R() * P2, 0.8 + R() * 0.5);
  }
  // A goblin's bones on the island (book: "Goblin he thought good, when he could get it").
  boneScatter(K, I.x + 0.45, I.z - 0.3, 6, true, WY + 1.4);
  // ---- the film's goblin dragged off along the shore: bones, a rag, a broken crude blade (near the tunnel's end) ----
  {
    const end = L.TUNNEL5[L.TUNNEL5.length - 1];
    const x = end[0] - 1.6;
    const z = end[2] + 0.9;
    boneScatter(K, x, z, 5, true);
    const fy = L.lakeFloorAt(x + 0.5, z - 0.3, WY + 2, 3);
    const rag = sphere(0.22, 8, 5);
    rag.scale(1.4, 0.12, 1);
    K.part('matte', rag, 0x3a3228, x + 0.5, fy + 0.02, z - 0.3, 0, R() * P2, 0, 1, 0.2);
    // The broken cleaver blade, rusty.
    const by = L.lakeFloorAt(x - 0.4, z + 0.5, WY + 2, 3);
    K.part('metal', box(0.16, 0.012, 0.26), 0x5a4232, x - 0.4, by + 0.02, z + 0.5, 0.05, 0.7, 0.04, 1, 0.25);
  }
  // Fish bones on the riddle terrace's edges (he eats where he sits).
  for (let i = 0; i < 3; i++) {
    const th = Math.PI + (R() - 0.5) * 0.9;
    const [x, z] = L.planPoint(th, L.shoreFrac(th) + 0.07 + R() * 0.05);
    if (onTerrace(x, z) && R() < 0.5) continue;
    fishBones(K, x, L.lakeFloorAt(x, z, WY + 1.5, 2), z, R() * P2, 0.9);
  }
  // ---- the tunnel: rubble along the floor's edges, a few stalactites in its lower, wetter half ----
  const T = L.TUNNEL5;
  for (let i = 1; i < T.length - 1; i++) {
    const a = T[i];
    const b = T[i + 1];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const l = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 2; k++) {
      if (R() < 0.45) continue;
      const side = R() < 0.5 ? -1 : 1;
      const f = R();
      const off = 0.6 + R() * 0.35;
      const x = a[0] + dx * f - (dz / l) * side * off;
      const z = a[2] + dz * f + (dx / l) * side * off;
      const y = a[1] + (b[1] - a[1]) * f;
      const fy = L.lakeFloorAt(x, z, y + 1.2, 2.5);
      if (fy < y - 1.5) continue;
      const g = rock(0.06 + Math.pow(R(), 2) * 0.16, R() * 50, 1, 0.6);
      K.part('stone5', g, stoneTint(), x, fy + 0.03, z, 0, R() * P2, 0, 1, 0.12);
    }
    if (i > T.length * 0.55 && R() < 0.25) {
      const f = R();
      const x = a[0] + dx * f;
      const z = a[2] + dz * f;
      const y = a[1] + (b[1] - a[1]) * f;
      const roof = L.lakeRoofAt(x, z, y + 0.8, 3);
      if (roof - y > 2.0) stalactite(K, x, z, 0.12 + R() * 0.18, 0.05 + R() * 0.03, roof);
    }
  }
}
