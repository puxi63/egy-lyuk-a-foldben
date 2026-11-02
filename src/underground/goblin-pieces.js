/* ==== underground/goblin-pieces.js — the dressing of Goblin-town (layer 4), built into the Kit (kit.js) from the
   layout in goblin-sites.js. The films show Goblin-town as a sprawl of rickety timber walkways, ladders and rope and
   chain bridges over chasms, built from stolen junk (carts, crates), lit by torches and braziers, with the Great
   Goblin's platform in the middle, chains, cages and pulleys; the book adds the "flat stone" the Great Goblin sat on,
   the goblins' tools (hammers, axes, pickaxes, tongs; ch. 4), the front porch with its crack, and the back gate where
   Bilbo lost his buttons (ch. 5). Nothing named is invented (TERV Decision 18); see NOTES-2a-goblintown.

   Kit groups (decor.js draws each group × material as one mesh, culled per view): 'l4u' the upper caves and tunnels
   (porch, chute, lift tunnel, upper side tunnel), 'l4h' the hall (galleries, bridges, the platform, ledges, the
   workshop, cages, cranes), 'l4l' the chasm floor, the deep tunnels and the back gate.
   `out` receives: flames ([x, y, z, size, phase] per flame), fires (light sources, firelight.js), sparks (ember
   points), ladders (climbable segments for props.js Ladders.addFixed), glow (the daylight crack). ==== */
import { rng } from '../noise.js';
import * as G from './goblin-sites.js';
import { box, cyl, lathe, rock, sphere, torus, tube } from './kit.js';
import { barrel, bone, crate, sack, skull } from './pieces.js';

const P2 = Math.PI * 2;
const R = rng(4004);
const W = (s, u, y) => {
  const [x, z] = G.fromRift(s, u);
  return [x, y, z];
};
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);

const WOOD = [0x4a3a2e, 0x3c3028, 0x52402f, 0x34291f, 0x5a4a3a, 0x463c32];
const wood = () => WOOD[Math.floor(R() * WOOD.length)];
const IRON = 0x3a3634;
const RUST = 0x5a3a26;
const ROPE = 0x8a7450;

/* ---------------------------------------------------------------- small pieces ---- */

/** A flame (billboard, goblin-fx.js) and its light. */
function flame(K, out, lx, ly, lz, size, light) {
  const [x, y, z] = K.world(lx, ly, lz);
  const ph = R() * 50;
  out.flames.push([x, y, z, size, ph]);
  if (light > 0) out.fires.push([x, y + size * 0.3, z, light, ph]);
}

/** A torch: a stick with a pitch-soaked head, its flame (local frame; the stick leans by `lean` towards local −z). */
function torch(K, out, x, y, z, lean = 0, light = 1.0) {
  light *= 1.1;
  const L = 0.55;
  const g = cyl(0.022, 0.03, L, 6);
  g.translate(0, L / 2, 0);
  K.part('wood', g, 0x3a2818, x, y, z, -lean, 0, 0);
  const hy = y + Math.cos(lean) * L;
  const hz = z - Math.sin(lean) * L;
  K.part('matte', cyl(0.045, 0.038, 0.12, 7), 0x2a1c12, x, hy, hz, -lean, 0, 0, 1, 0.2);
  K.part('ember', sphere(0.035, 6, 4), [0.9, 0.35, 0.06], x, hy + 0.05, hz);
  flame(K, out, x, hy + 0.06, hz, 0.3, light);
}

/** A wall torch: an iron bracket out of the rock, the torch leaning out (local −z is "out of the wall"). */
function wallTorch(K, out, x, y, z) {
  K.part('metal', box(0.04, 0.04, 0.26), IRON, x, y, z - 0.1);
  K.part('metal', torus(0.05, 0.012, 3, 8), IRON, x, y + 0.02, z - 0.22, Math.PI / 2);
  torch(K, out, x, y - 0.2, z - 0.22, 0.25, 1.05);
}

/** A brazier: an iron basket on three legs, heaped with glowing coals, a big flame and sparks. */
function brazier(K, out, x, y, z, s = 1) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * P2;
    K.part('metal', cyl(0.025 * s, 0.03 * s, 0.85 * s, 5), IRON, x + Math.cos(a) * 0.22 * s, y + 0.38 * s, z + Math.sin(a) * 0.22 * s, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
  }
  K.part('metal', lathe([[0.1 * s, 0], [0.3 * s, 0.12 * s], [0.4 * s, 0.32 * s], [0.38 * s, 0.33 * s], [0.28 * s, 0.13 * s], [0.08 * s, 0.02 * s]], 10), IRON, x, y + 0.72 * s, z, 0, 0, 0, 1, 0.2);
  for (let i = 0; i < 9; i++) {
    const a = R() * P2;
    const r = R() * 0.24 * s;
    const e = [x + Math.cos(a) * r, y + (0.95 + R() * 0.07) * s, z + Math.sin(a) * r];
    K.part('ember', rock(0.06 * s, i, 0), [1, 0.28 + R() * 0.25, 0.04], e[0], e[1], e[2]);
    out.sparks.push(e);
  }
  K.capCollider([x, y, z], [x, y + 1.0 * s, z], 0.38 * s);
  flame(K, out, x, y + 1.0 * s, z, 0.62 * s, 1.9 * s);
}

/** A cart wheel (stolen junk on the walkways): rim, hub and spokes, in the local x–y plane. */
function wheel(K, x, y, z, r, ry = 0, rx = 0) {
  K.part('wood', torus(r, 0.045, 4, 16), 0x5a3e28, x, y, z, rx, ry, 0);
  K.part('metal', torus(r + 0.02, 0.018, 3, 16), IRON, x, y, z, rx, ry, 0);
  K.part('wood', cyl(0.07, 0.07, 0.16, 8), 0x4a3424, x, y, z, rx + Math.PI / 2, ry, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * P2;
    const g = cyl(0.02, 0.025, r, 5);
    g.translate(0, r / 2, 0);
    g.rotateZ(a);
    K.part('wood', g, 0x5a3e28, x, y, z, rx, ry, 0);
  }
}

/** A chain of iron links from a to b (world, through the frame at the origin), sagging `sag` metres. */
function chain(K, a, b, sag = 0, link = 0.07) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(2, Math.round(len / (link * 1.55)));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const dy = b[1] - a[1] - sag * 4 * (1 - 2 * t);
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const g = torus(link * 0.5, link * 0.13, 3, 6);
    g.scale(0.62, 1, 1);
    // Link plane alternates by 90° about the chain's direction.
    g.rotateY(i % 2 ? Math.PI / 2 : 0);
    g.rotateX(Math.PI / 2);
    K.part('metal', g, i % 7 === 0 ? RUST : IRON, p[0], p[1], p[2], -pitch, yaw, 0, 1, 0.25);
  }
}

/** A rope (tube) along a sagging line from a to b (world, frame at the origin). */
function rope(K, a, b, sag = 0, r = 0.018, seg = 8) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  K.part('matte', tube(pts, r, r, 5), ROPE, 0, 0, 0, 0, 0, 0, 1, 0.12);
}

/** A rough timber (squared beam) from a to b in world space (frame at the origin). */
function beam(K, a, b, t = 0.12, color = null) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const g = box(t, len, t * 0.85);
  // Box along y → along (dx, dy, dz).
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
  K.part('wood', g, color ?? wood(), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, pitch, yaw, 0, 1, 0.12);
}

/** A goblin cage (iron bars, a ring top and bottom, a floor), hanging from its top at (x, y, z) world. */
function cage(K, x, y, z, h = 1.6, r = 0.55, broken = false) {
  const bars = 11;
  for (let i = 0; i < bars; i++) {
    if (broken && (i === 3 || i === 4)) continue;
    const a = (i / bars) * P2;
    K.part('metal', cyl(0.014, 0.014, h, 4), i % 4 ? IRON : RUST, x + Math.cos(a) * r, y - h / 2 - 0.2, z + Math.sin(a) * r, broken && i === 5 ? 0.3 : 0, 0, 0);
  }
  for (const yy of [y - 0.2, y - 0.2 - h * 0.5, y - 0.2 - h]) K.part('metal', torus(r, 0.022, 3, 18), IRON, x, yy, z, Math.PI / 2);
  K.part('wood', cyl(r, r, 0.05, 14), 0x3a2a1c, x, y - 0.2 - h, z);
  K.part('metal', lathe([[r, 0], [r * 0.4, 0.14], [0.04, 0.2], [0, 0.2]], 10), IRON, x, y - 0.2, z);
}

/** A heap of goblin rubbish (broken crates, a barrel, sacks, bones, a wheel, scraps of iron) around a floor point. */
function junkHeap(K, x, z, yf, n = 9, rad = 1.2) {
  for (let i = 0; i < n; i++) {
    const a = R() * P2;
    const r = R() * rad;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const py = G.goblinFloorAt(px, pz, yf + 0.8, 2.5);
    const k = R();
    if (k < 0.22) crate(K, px, py - 0.04, pz, 0.45 + R() * 0.3, 0.35 + R() * 0.25, 0.4 + R() * 0.25, R() * 3, 0x8a6a48);
    else if (k < 0.32) barrel(K, px, py - 0.03, pz, 0.8, 0.28, R() < 0.5, R() * 3, 0x6a4a30);
    else if (k < 0.47) sack(K, px, py - 0.04, pz, 0.8 + R() * 0.3, R() * 3, 0x5a4a32, true);
    else if (k < 0.62) bone(K, px, py + 0.03, pz, 0.25 + R() * 0.3, R() * 3, (R() - 0.5) * 0.4);
    else if (k < 0.68) skull(K, px, py, pz, R() * 3);
    else if (k < 0.76) wheel(K, px, py + 0.12, pz, 0.38, R() * 3, Math.PI / 2 - 0.15);
    else if (k < 0.88) K.part('wood', box(0.9 + R() * 0.8, 0.05, 0.18), wood(), px, py + 0.05, pz, (R() - 0.5) * 0.4, R() * 3, (R() - 0.5) * 0.5);
    else K.part('metal', box(0.25 + R() * 0.4, 0.03, 0.12 + R() * 0.2), RUST, px, py + 0.03, pz, (R() - 0.5) * 0.5, R() * 3, (R() - 0.5) * 0.5, 1, 0.3);
  }
}

/** Rift u of the rock wall at (s, y) on one side (+1 / −1), marched from the middle through the cavity field. */
function wallU(s, side, y, from = 0) {
  for (let u = from; u < 9; u += 0.05) {
    const [x, z] = G.fromRift(s, side * u);
    if (G.goblinCavity(x, y, z) > 0) return side * u;
  }
  return side * 9;
}

/* ---------------------------------------------------------------- walkways ---- */

/** True when a ladder top or a bridge end lies at rift (s, u) near a deck's rail (the rail gets a gap there). */
function openingNear(s, u) {
  for (const l of G.LADDERS4) if (!l.rope && Math.abs(l.s - s) < 0.75 && Math.abs(l.u - u) < 1.5) return true;
  for (const b of G.BRIDGES) if (Math.abs(b.s - s) < 0.85 && (Math.abs(b.u0 - u) < 1.5 || Math.abs(b.u1 - u) < 1.5)) return true;
  return false;
}

/** A gallery deck along the wall (DECKS entry): planks across, stringers, braces into the wall, posts, a rail, torches. */
function gallery(K, out, d) {
  const STEP = 1.6;
  const n = Math.max(1, Math.round((d.s1 - d.s0) / STEP));
  const side = Math.sign(d.u) || 1;
  for (let i = 0; i < n; i++) {
    const sa = d.s0 + ((d.s1 - d.s0) * i) / n;
    const sb = d.s0 + ((d.s1 - d.s0) * (i + 1)) / n;
    const a = W(sa, d.u, d.y);
    const b = W(sb, d.u, d.y);
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const yaw = yawOf(b[0] - a[0], b[2] - a[2]);
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[2] + b[2]) / 2;
    // Frame: local −z along the run, local +x towards +u when the run goes along +s.
    K.at(mx, d.y, mz, yaw);
    for (let p = -len / 2 + 0.11; p < len / 2; p += 0.25 + R() * 0.05) {
      if (R() < 0.06) continue; // a missing plank
      const w = d.w * (0.92 + R() * 0.12);
      K.part('wood', box(w, 0.05, 0.2 + R() * 0.04), wood(), (R() - 0.5) * 0.06, -0.025 - R() * 0.02, p, 0, (R() - 0.5) * 0.06, (R() - 0.5) * 0.04);
    }
    for (const sx of [-0.42, 0.42]) K.part('wood', box(0.12, 0.16, len + 0.1), 0x4a3424, sx * d.w, -0.13, 0);
    // Top at the deck; 0.4 m deep so a fast landing cannot pass through between two frames.
    K.boxCollider(0, -0.2, 0, d.w / 2, 0.2, len / 2);
    // Brace from under the deck's wall side down into the rock; a stilt down to the ledge from the inner edge.
    const wallX = side * (d.w / 2 + 0.25);
    const inX = -side * (d.w / 2 - 0.08);
    const pw = K.world(wallX * 0.6, -0.2, -len / 2);
    const pb = K.world(wallX + side * 0.4, -1.7, -len / 2);
    K.at(0, 0, 0);
    beam(K, pw, pb, 0.11);
    K.at(mx, d.y, mz, yaw);
    if (i % 2 === 0) {
      const top = K.world(inX, -0.2, -len / 2);
      const mid = K.world(inX * 0.3, -0.22, 0);
      const fy = G.goblinFloorAt(top[0], top[2], G.LEDGE_Y + 1, 2);
      K.at(0, 0, 0);
      beam(K, top, [top[0], fy, top[2]], 0.13);
      beam(K, [top[0], d.y - 1.6, top[2]], mid, 0.08);
      K.at(mx, d.y, mz, yaw);
      K.capCollider([inX, fy - d.y, -len / 2], [inX, -0.25, -len / 2], 0.08);
    }
    // The rail on the chasm side: posts, a timber rail (gaps at ladders and bridges), now and then a torch.
    if (d.rail) {
      const rx = d.rail * (d.w / 2 - 0.06);
      const sMid = (sa + sb) / 2;
      const open = openingNear(sMid, d.u);
      K.part('wood', box(0.08, 1.05, 0.08), wood(), rx, 0.5, -len / 2);
      if (!open) {
        K.part('wood', box(0.06, 0.07, len), wood(), rx, 0.95, 0, 0, 0, (R() - 0.5) * 0.05);
        K.part('wood', box(0.05, 0.05, len), wood(), rx, 0.48, 0, 0, 0, (R() - 0.5) * 0.08);
        if (R() < 0.18) wheel(K, rx, 0.55, (R() - 0.5) * len * 0.5, 0.36, Math.PI / 2);
        K.boxCollider(rx, 0.5, 0, 0.05, 0.5, len / 2);
      }
      if (i % 2 === 1) torch(K, out, rx, 1.0, -len / 2, 0, 1.0);
    }
    if (R() < 0.35) crate(K, -side * 0.0 + side * 0.25, 0, (R() - 0.5) * len * 0.6, 0.42, 0.38, 0.4, R() * 2, 0x8a6a48);
  }
  K.at(0, 0, 0);
}

/** The Great Goblin's platform over the chasm: a big plank deck on beams over the two stone pillars, his throne on
 * the flat stone (book), braziers at the corners, chains hanging from the roof, a barrel and a chest of plunder. */
function throneDeck(K, out, d) {
  const sMid = (d.s0 + d.s1) / 2;
  const c = W(sMid, 0, d.y);
  const L = d.s1 - d.s0;
  K.at(c[0], d.y, c[2], G.RIFT_YAW_S);
  // Local: −z along +s, +x along +u.
  for (let p = -d.w / 2 + 0.13; p < d.w / 2; p += 0.27 + R() * 0.03) K.part('wood', box(0.24 + R() * 0.03, 0.07, L * (0.97 + R() * 0.05)), wood(), p, -0.035 - R() * 0.015, (R() - 0.5) * 0.1);
  for (const z of [-L / 2 + 0.3, 0, L / 2 - 0.3]) K.part('wood', box(d.w + 0.2, 0.22, 0.22), 0x3e2c1e, 0, -0.18, z);
  for (const x of [-d.w / 2 + 0.2, -1.2, 1.2, d.w / 2 - 0.2]) K.part('wood', box(0.22, 0.2, L + 0.3), 0x3e2c1e, x, -0.38, 0);
  K.boxCollider(0, -0.2, 0, d.w / 2, 0.2, L / 2);
  // Posts and diagonal struts down to the pillars' tops and the chasm walls.
  K.at(0, 0, 0);
  for (const pl of G.PILLARS) {
    const top = W(pl.s, pl.u, pl.top);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * P2 + 0.4;
      beam(K, [top[0] + Math.cos(a) * 0.5, top[1] + 0.02, top[2] + Math.sin(a) * 0.5], [top[0] + Math.cos(a) * 1.6, d.y - 0.45, top[2] + Math.sin(a) * 1.6], 0.14, 0x3e2c1e);
    }
  }
  for (const s of [d.s0 + 0.4, d.s1 - 0.4]) {
    for (const u of [-1, 1]) {
      const deck = W(s, u * 2.0, d.y - 0.4);
      const wall = W(s, u * (G.CHASM_HALF + 0.4), d.y - 3.2);
      beam(K, deck, wall, 0.15, 0x3e2c1e);
    }
  }
  // The flat stone (book) and the throne on it (film): a crude high seat of timbers, iron and junk.
  K.at(G.THRONE.x, d.y, G.THRONE.z, G.THRONE.yaw);
  K.part('stone4', rock(1.05, 21, 1, 0.3), 0x3a3a40, 0, 0.12, 0.25);
  const sy = 0.32;
  K.part('wood', box(1.7, 0.18, 1.1), 0x4a3020, 0, sy + 0.55, 0.3);
  for (const sx of [-0.75, 0.75]) {
    K.part('wood', box(0.22, 1.1, 1.1), 0x3e2a1a, sx, sy + 0.42, 0.3);
    K.part('wood', box(0.26, 0.12, 1.15), 0x5a3e28, sx, sy + 1.0, 0.25);
  }
  // The high back: uneven planks with a cart wheel at the top and iron bands.
  for (let i = 0; i < 6; i++) {
    const x = -0.7 + i * 0.28;
    const h = 2.3 + R() * 0.6 - Math.abs(x) * 0.5;
    K.part('wood', box(0.25, h, 0.12), wood(), x, sy + 0.6 + h / 2, 0.82, -0.08, 0, (R() - 0.5) * 0.05);
  }
  for (const yb of [1.2, 2.0]) K.part('metal', box(1.75, 0.07, 0.04), RUST, 0, sy + yb, 0.75, -0.08);
  wheel(K, 0, sy + 3.1, 0.92, 0.62, 0, -0.08);
  K.part('matte', box(1.5, 0.08, 0.9), 0x5a1e14, 0, sy + 0.66, 0.28, 0, 0, 0, 1, 0.15);
  K.boxCollider(0, sy + 0.6, 0.3, 0.9, 0.9, 0.62);
  K.boxCollider(0, sy + 1.6, 0.82, 0.85, 1.6, 0.12);
  K.capCollider([0, 0.1, 0.25], [0, 0.25, 0.25], 1.0);
  // Braziers at the platform's corners, chains hanging from the roof above it.
  K.at(0, 0, 0);
  for (const [s, u] of [[d.s0 + 0.5, -2.6], [d.s0 + 0.5, 2.6], [d.s1 - 0.5, -2.6], [d.s1 - 0.5, 2.6]]) {
    const p = W(s, u, d.y);
    brazier(K, out, p[0], d.y, p[2], 1.05);
  }
  for (const [s, u, low] of [[-1.8, -1.2, -171.5], [1.9, 1.6, -172.2], [0.3, -2.1, -170.4]]) {
    const top = W(s, u, -166.2);
    const end = [top[0], low, top[2]];
    chain(K, top, end, 0, 0.09);
    K.part('metal', torus(0.08, 0.018, 3, 8, Math.PI * 1.4), IRON, end[0], end[1] - 0.08, end[2], 0, R() * 3, Math.PI);
  }
  // A few things on the deck: a barrel, a heap of plunder (a chest, coins), bones.
  const pb = W(-1.6, 1.6, d.y);
  barrel(K, pb[0], d.y, pb[2], 0.9, 0.3, false, 0, 0x6a4a30);
  K.capCollider([pb[0], d.y, pb[2]], [pb[0], d.y + 0.9, pb[2]], 0.33);
  const ch = W(1.9, -1.4, d.y);
  K.at(ch[0], d.y, ch[2], G.RIFT_YAW_S + 0.4);
  K.part('wood', box(0.8, 0.45, 0.5), 0x4a3424, 0, 0.225, 0);
  K.part('metal', box(0.82, 0.05, 0.52), RUST, 0, 0.44, 0);
  for (let i = 0; i < 14; i++) K.part('metal', cyl(0.02, 0.02, 0.006, 8), R() < 0.6 ? 0xd8b040 : 0xc8ccd4, (R() - 0.5) * 1.4, 0.01, (R() - 0.5) * 1.2, R() * 0.4, 0, R() * 0.4);
  K.boxCollider(0, 0.24, 0, 0.42, 0.24, 0.27);
  K.at(0, 0, 0);
  for (let i = 0; i < 6; i++) {
    const p = W(d.s0 + R() * L, (R() - 0.5) * 5, d.y);
    bone(K, p[0], d.y + 0.03, p[2], 0.25 + R() * 0.3, R() * 3);
  }
}

/** A bridge across the chasm (BRIDGES entry): planks on ropes or chains, hand ropes, anchor posts with torches. */
function bridge(K, out, b) {
  const a0 = W(b.s, b.u0, b.y);
  const a1 = W(b.s, b.u1, b.y);
  const span = Math.hypot(a1[0] - a0[0], a1[2] - a0[2]);
  const yaw = yawOf(a1[0] - a0[0], a1[2] - a0[2]);
  const dirx = (a1[0] - a0[0]) / span;
  const dirz = (a1[2] - a0[2]) / span;
  // Across the bridge (horizontal, perpendicular to its run).
  const px = -dirz;
  const pz = dirx;
  const at = (t, off, up = 0) => [a0[0] + dirx * span * t + px * off, G.bridgeY(b, t) + up, a0[2] + dirz * span * t + pz * off];
  const hw = b.w / 2;
  // Planks (the plank bridge has thicker, uneven boards and no sag to speak of).
  const step = b.kind === 'plank' ? 0.3 : 0.27;
  const nP = Math.floor(span / step);
  for (let i = 0; i < nP; i++) {
    const t = (i + 0.5) / nP;
    if (b.kind !== 'plank' && R() < 0.05) continue;
    const p = at(t, (R() - 0.5) * 0.05, -0.03);
    const slope = Math.atan2(G.bridgeY(b, Math.min(1, t + 0.01)) - G.bridgeY(b, Math.max(0, t - 0.01)), span * 0.02);
    K.at(p[0], p[1], p[2], yaw);
    K.part('wood', box(b.w * (0.9 + R() * 0.15), b.kind === 'plank' ? 0.07 : 0.045, step * 0.82), wood(), 0, 0, 0, slope, (R() - 0.5) * 0.08, (R() - 0.5) * 0.05);
  }
  // Walk colliders: short level steps following the sag, and low side walls (the hand ropes).
  const nC = Math.max(4, Math.round(span / 0.45));
  for (let i = 0; i < nC; i++) {
    const t = (i + 0.5) / nC;
    const p = at(t, 0, 0);
    K.at(p[0], p[1], p[2], yaw);
    K.boxCollider(0, -0.2, 0, hw, 0.2, span / nC / 2 + 0.02);
    K.boxCollider(hw + 0.04, 0.5, 0, 0.04, 0.5, span / nC / 2 + 0.02);
    K.boxCollider(-hw - 0.04, 0.5, 0, 0.04, 0.5, span / nC / 2 + 0.02);
  }
  K.at(0, 0, 0);
  // Under-ropes / chains carrying the planks, hand ropes / chains, suspenders.
  const handSag = b.sag * 0.55;
  for (const sd of [-1, 1]) {
    const lo0 = at(0, sd * (hw + 0.02), -0.06);
    const lo1 = at(1, sd * (hw + 0.02), -0.06);
    const hi0 = at(0, sd * (hw + 0.05), 1.0);
    const hi1 = at(1, sd * (hw + 0.05), 1.0);
    if (b.kind === 'chain') {
      chain(K, lo0, lo1, b.sag, 0.075);
      chain(K, hi0, hi1, handSag, 0.075);
    } else {
      rope(K, lo0, lo1, b.sag, 0.022, 12);
      rope(K, hi0, hi1, handSag, 0.02, 12);
    }
    const nS = Math.round(span / 0.6);
    for (let i = 1; i < nS; i++) {
      const t = i / nS;
      const lo = at(t, sd * (hw + 0.03), -0.04);
      const hy = b.y + 1.0 - handSag * 4 * t * (1 - t);
      if (b.kind === 'chain') K.part('metal', cyl(0.008, 0.008, hy - lo[1], 4), IRON, lo[0], (lo[1] + hy) / 2, lo[2]);
      else K.part('matte', cyl(0.009, 0.009, hy - lo[1], 4), ROPE, lo[0], (lo[1] + hy) / 2, lo[2]);
    }
  }
  // Anchor posts at both ends (into the rock), a torch on one post at each end.
  for (const [t, flip] of [[0, 1], [1, -1]]) {
    for (const sd of [-1, 1]) {
      const p = at(t, sd * (hw + 0.12), 0);
      const fy = G.goblinFloorAt(p[0] - dirx * flip * 0.3, p[2] - dirz * flip * 0.3, b.y + 1, 3);
      const base = [p[0] - dirx * flip * 0.3, Math.min(fy, b.y - 0.1), p[2] - dirz * flip * 0.3];
      K.part('wood', cyl(0.09, 0.11, b.y + 1.35 - base[1], 7), 0x3a2a1c, base[0], (base[1] + b.y + 1.35) / 2, base[2]);
      K.capCollider(base, [base[0], b.y + 1.3, base[2]], 0.12);
      if (sd > 0) {
        K.at(base[0], 0, base[2], yaw);
        torch(K, out, 0, b.y + 1.3, 0, 0, 1.0);
        K.at(0, 0, 0);
      }
    }
  }
}

/** A goblin ladder (rough rails, lashed rungs) from y0 to y1 at world (x, z), facing yaw; its climbable segments. */
function ladder(K, out, l) {
  const [x, z] = G.fromRift(l.s, l.u);
  // The climber faces the wall (rope ladder) or the gallery (ledge ladders): towards the side of the rift it stands on.
  const face = l.u > 0 ? G.RIFT_YAW_U : G.RIFT_YAW_U + Math.PI;
  const h = l.y1 - l.y0;
  K.at(x, l.y0, z, face);
  if (l.rope) {
    // A rope ladder: two ropes and wooden rungs, hanging from pegs at the ledge lip.
    for (const sx of [-0.22, 0.22]) {
      const g = tube([[sx, 0, 0], [sx, h * 0.5, 0.04], [sx, h + 0.3, -0.05]], 0.016, 0.016, 5);
      K.part('matte', g, ROPE, 0, 0, 0, 0, 0, 0, 1, 0.12);
    }
    for (let y = 0.3; y < h; y += 0.36) {
      const g = cyl(0.016, 0.016, 0.5, 5);
      g.rotateZ(Math.PI / 2);
      K.part('wood', g, wood(), 0, y, 0.03 * Math.sin(y), 0, (R() - 0.5) * 0.1, (R() - 0.5) * 0.06);
    }
    K.part('wood', cyl(0.05, 0.05, 0.5, 6), 0x3a2a1c, 0, h + 0.3, -0.25, Math.PI / 2, 0, 0);
  } else {
    for (const sx of [-0.25, 0.25]) K.part('wood', cyl(0.035, 0.045, h + 0.6, 6), 0x5a3e28, sx + (R() - 0.5) * 0.04, (h + 0.6) / 2, 0, (R() - 0.5) * 0.03, 0, 0);
    for (let y = 0.28; y < h + 0.4; y += 0.34) {
      const g = cyl(0.022, 0.022, 0.58, 5);
      g.rotateZ(Math.PI / 2 + (R() - 0.5) * 0.08);
      K.part('wood', g, wood(), 0, y, 0);
      for (const sx of [-0.25, 0.25]) K.part('matte', torus(0.045, 0.01, 3, 6), ROPE, sx, y, 0, 0, 0, Math.PI / 2);
    }
  }
  if (!l.rope) {
    // A board behind the rungs stops the climber drifting under the gallery; a landing plank bridges the gap from the
    // ladder's top to the deck (local −z is towards the gallery).
    K.boxCollider(0, (h - 0.42) / 2, -0.07, 0.32, (h - 0.42) / 2, 0.02);
    const gap = Math.abs(4.45 - 0.625) - Math.abs(l.u) + 0.05;
    K.part('wood', box(0.75, 0.06, gap + 0.1), wood(), 0, h - 0.03 - 0.35, -0.07 - gap / 2);
    K.boxCollider(0, h - 0.35 - 0.2, -0.07 - gap / 2, 0.38, 0.2, gap / 2 + 0.05);
  }
  K.at(0, 0, 0);
  // Climbable 4 m segments (props.js LADDER_LEN), top first so the upper one wins where they overlap.
  const segs = [];
  for (let y = l.y0; y < l.y1 - 0.3; y += 3.6) segs.push(Math.min(y, l.y1 - 4));
  segs.reverse();
  for (const y of segs) out.ladders.push({ x, y, z, yaw: face + Math.PI });
}

/** Timber frames along a tunnel (props for the goblins' passages) and torches. */
function tunnelFrames(K, out, t, every = 2.4) {
  const pts = t.pts;
  let acc = every * 0.5;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const yaw = yawOf(b[0] - a[0], b[2] - a[2]);
    for (; acc < len; acc += every) {
      const k = acc / len;
      const x = a[0] + (b[0] - a[0]) * k;
      const z = a[2] + (b[2] - a[2]) * k;
      const fy = G.goblinFloorAt(x, z, a[1] + (b[1] - a[1]) * k + 1.2, 2.5);
      const hw = t.r * 0.82;
      const hh = t.r * 1.45;
      K.at(x, fy, z, yaw);
      for (const sx of [-hw, hw]) K.part('wood', box(0.14, hh, 0.14), wood(), sx, hh / 2, 0, 0, 0, sx * -0.03);
      K.part('wood', box(hw * 2 + 0.3, 0.16, 0.16), wood(), 0, hh + 0.04, 0, 0, 0, (R() - 0.5) * 0.06);
      for (const sx of [-hw, hw]) K.capCollider([sx, 0, 0], [sx, hh, 0], 0.08);
      if (R() < 0.55) torch(K, out, (R() < 0.5 ? -1 : 1) * (hw - 0.1), 1.25, 0.12, 0.2, 0.9);
    }
    acc -= len;
  }
  K.at(0, 0, 0);
}

/* ---------------------------------------------------------------- set pieces ---- */

/** The workshop off the −u ledge: a forge with embers, an anvil, a quench barrel, racks of goblin tools, chains. */
function workshop(K, out, r) {
  const [cx, cz] = G.fromRift(r.s, r.u);
  const fy = G.goblinFloorAt(cx, cz, r.y + 1, 2);
  K.at(cx, fy, cz, r.yaw);
  // Local: x across the room (along the rift), −z away from the hall (the room's far wall at −d/2).
  const back = -r.d / 2 + 0.75;
  // The forge: a stone hearth with a hood, coals and a flame.
  K.part('stone4', box(1.4, 0.8, 0.9), 0x2e2e33, -0.9, 0.4, back);
  K.part('stone4', box(1.5, 0.12, 1.0), 0x26262a, -0.9, 0.84, back);
  K.part('stone4', lathe([[0.75, 0], [0.5, 0.5], [0.22, 1.1], [0.22, 1.9]], 8), 0x26262a, -0.9, 1.5, back - 0.05, 0, 0, 0, [1, 1, 0.7]);
  for (let i = 0; i < 14; i++) {
    const e = [-0.9 + (R() - 0.5) * 0.9, 0.95 + R() * 0.05, back + (R() - 0.5) * 0.55];
    K.part('ember', rock(0.06, i, 0), [1, 0.25 + R() * 0.25, 0.04], e[0], e[1], e[2]);
    out.sparks.push(K.world(e[0], e[1], e[2]));
  }
  flame(K, out, -0.9, 1.0, back, 0.45, 1.9);
  K.boxCollider(-0.9, 0.45, back, 0.75, 0.45, 0.5);
  // Bellows beside the forge.
  K.part('wood', box(0.5, 0.12, 0.9), 0x4a3424, 0.15, 0.55, back + 0.1, 0.1, 0, 0);
  K.part('matte', box(0.46, 0.22, 0.8), 0x3a2418, 0.15, 0.42, back + 0.1, 0, 0, 0, 1, 0.15);
  // The anvil on a stump, a hammer and tongs on it.
  K.part('wood', cyl(0.28, 0.32, 0.55, 9), 0x4a3424, 0.9, 0.275, 0.2);
  K.part('metal', box(0.6, 0.2, 0.26), IRON, 0.9, 0.66, 0.2);
  K.part('metal', box(0.32, 0.12, 0.2), IRON, 0.9, 0.5, 0.2);
  K.part('metal', lathe([[0, 0], [0.12, 0], [0.02, 0.24], [0, 0.24]], 6), IRON, 1.2, 0.66, 0.2, 0, 0, -Math.PI / 2);
  K.part('wood', cyl(0.015, 0.015, 0.38, 5), 0x3a2a1a, 0.85, 0.79, 0.3, 0, 0.6, Math.PI / 2);
  K.part('metal', box(0.09, 0.07, 0.07), IRON, 0.7, 0.79, 0.4);
  for (const sx of [-0.02, 0.02]) K.part('metal', box(0.012, 0.012, 0.42), IRON, 0.95 + sx, 0.77, 0.05, 0, 0.3 + sx * 8, 0);
  K.capCollider([0.9, 0, 0.2], [0.9, 0.7, 0.2], 0.34);
  // The quench barrel.
  barrel(K, -0.1, 0, 0.75, 0.75, 0.3, false, 0, 0x5a4030);
  K.part('water', cyl(0.27, 0.27, 0.01, 12), 0x1a1a1e, -0.1, 0.7, 0.75);
  K.capCollider([-0.1, 0, 0.75], [-0.1, 0.75, 0.75], 0.32);
  // A rack on the far wall: hammers, axes, pickaxes, tongs (book ch. 4), hanging chains.
  const rx = -(r.w / 2 - 0.45);
  K.part('wood', box(0.1, 0.1, 1.8), 0x4a3424, rx, 1.6, -0.2);
  K.part('wood', box(0.1, 0.1, 1.8), 0x4a3424, rx, 0.9, -0.2);
  for (const z of [-1.0, 0.6]) K.part('wood', box(0.1, 1.9, 0.1), 0x4a3424, rx + 0.02, 0.95, z);
  for (let i = 0; i < 6; i++) {
    const z = -0.95 + i * 0.3;
    const kind = i % 4;
    K.part('wood', cyl(0.015, 0.018, 0.65, 5), 0x3a2818, rx + 0.08, 1.25, z);
    if (kind === 0) K.part('metal', box(0.06, 0.06, 0.18), IRON, rx + 0.08, 1.55, z); // hammer
    else if (kind === 1) K.part('metal', box(0.03, 0.16, 0.14), IRON, rx + 0.08, 1.52, z + 0.06); // axe
    else if (kind === 2) K.part('metal', lathe([[0, 0], [0.025, 0.01], [0.012, 0.36], [0, 0.37]], 5), IRON, rx + 0.08, 1.55, z, Math.PI / 2, 0, 0); // pick
    else for (const sx of [-0.015, 0.015]) K.part('metal', box(0.012, 0.42, 0.012), IRON, rx + 0.08, 1.3, z + sx, sx * 6, 0, 0); // tongs
  }
  K.boxCollider(rx, 0.95, -0.2, 0.12, 0.95, 0.95);
  K.at(0, 0, 0);
  const wallTop = W(r.s + 0.6, r.u - 1.0, r.y + r.h - 0.3);
  chain(K, wallTop, [wallTop[0], r.y + 0.9, wallTop[2]], 0, 0.07);
  const wallTop2 = W(r.s - 0.6, r.u - 0.4, r.y + r.h - 0.25);
  chain(K, wallTop2, [wallTop2[0], r.y + 1.3, wallTop2[2]], 0, 0.07);
  // A pile of raw ore (the slaves' mines, book ch. 4) and scraps.
  const op = W(r.s - 1.4, r.u + 0.7, r.y);
  for (let i = 0; i < 9; i++) {
    const a = R() * P2;
    const rr = R() * 0.5;
    K.part('stone4', rock(0.13 + R() * 0.1, i + 40, 1, 0.7), 0x2c2a2c, op[0] + Math.cos(a) * rr, G.goblinFloorAt(op[0], op[2], r.y + 1, 2) + 0.08 + R() * 0.1, op[2] + Math.sin(a) * rr);
  }
  const wt = W(r.s, r.u + 1.2, r.y + 1.7);
  K.at(wt[0], 0, wt[2], r.yaw + Math.PI);
  torch(K, out, 0, r.y + 1.4, 0, 0.2, 1.0);
  K.at(0, 0, 0);
}

/** A timber crane at a ledge lip with a pulley wheel; its rope hangs into the chasm with a basket. */
function crane(K, out, s, u, drop) {
  const side = Math.sign(u);
  const base = W(s, u, G.LEDGE_Y);
  const fy = G.goblinFloorAt(base[0], base[2], G.LEDGE_Y + 1, 2);
  const tip = W(s, u - side * 2.0, G.LEDGE_Y + 3.0);
  K.part('wood', box(0.22, 3.4, 0.22), 0x4a3424, base[0], fy + 1.7, base[2]);
  K.capCollider([base[0], fy, base[2]], [base[0], fy + 3.3, base[2]], 0.16);
  beam(K, [base[0], fy + 3.2, base[2]], tip, 0.18, 0x4a3424);
  beam(K, [base[0], fy + 1.6, base[2]], [(base[0] + tip[0]) / 2, (fy + 3.2 + tip[1]) / 2, (base[2] + tip[2]) / 2], 0.12, 0x4a3424);
  const yaw = Math.atan2(tip[0] - base[0], tip[2] - base[2]);
  K.part('wood', torus(0.26, 0.05, 4, 14), 0x5a3e28, tip[0], tip[1] - 0.25, tip[2], 0, yaw + Math.PI / 2, 0);
  K.part('metal', cyl(0.03, 0.03, 0.2, 6), IRON, tip[0], tip[1] - 0.25, tip[2], Math.PI / 2, yaw, 0);
  const lowY = G.LEDGE_Y - drop;
  rope(K, [tip[0] + Math.sin(yaw) * 0.26, tip[1] - 0.25, tip[2] + Math.cos(yaw) * 0.26], [tip[0] + Math.sin(yaw) * 0.26, lowY + 0.9, tip[2] + Math.cos(yaw) * 0.26], 0, 0.02, 2);
  rope(K, [tip[0] - Math.sin(yaw) * 0.26, tip[1] - 0.25, tip[2] - Math.cos(yaw) * 0.26], [base[0], fy + 1.0, base[2]], 0.05, 0.02, 4);
  // The basket (or a cage) on the rope's end.
  const bx = tip[0] + Math.sin(yaw) * 0.26;
  const bz = tip[2] + Math.cos(yaw) * 0.26;
  if (drop > 8) cage(K, bx, lowY + 1.0, bz, 1.3, 0.48);
  else {
    K.part('wood', lathe([[0.25, 0], [0.42, 0.5], [0.4, 0.52], [0.23, 0.04], [0, 0.04], [0, 0]], 12), 0x6a5030, bx, lowY, bz);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * P2;
      rope(K, [bx + Math.cos(a) * 0.4, lowY + 0.5, bz + Math.sin(a) * 0.4], [bx, lowY + 0.9, bz], 0, 0.012, 1);
    }
  }
  K.at(base[0], 0, base[2], yaw);
  torch(K, out, 0.15, fy + 2.2, 0, 0.25, 1.0);
  K.at(0, 0, 0);
}

/** The back gate (book ch. 5; film): a door in a timber frame across the gate room's end, left ajar; cold daylight
 * through the gap; a guard's stool and a torch. Bilbo's buttons are a find on the threshold (finds.js). */
function backGate(K, out) {
  const g = G.BACK_GATE;
  const fy = G.goblinFloorAt(g.x, g.z, g.y + 1, 2);
  K.at(g.x, fy, g.z, g.yaw);
  // Local: −z out through the gate, x along the door.
  const H = 2.2;
  for (const sx of [-0.85, 0.85]) K.part('wood', box(0.24, H + 0.2, 0.26), 0x3a2a1c, sx, (H + 0.2) / 2, 0);
  K.part('wood', box(2.0, 0.26, 0.3), 0x3a2a1c, 0, H + 0.2, 0);
  K.part('stone4', box(1.9, 0.12, 0.6), 0x2e2e33, 0, 0.0, -0.05);
  // The door, swung in (towards the room) on its left hinge: planks with iron bands; the gap is at the right jamb.
  const doorW = 1.45;
  const hinge = -0.73;
  K.at(...K.world(hinge, 0, 0.0), g.yaw - 0.785);
  for (let i = 0; i < 6; i++) K.part('wood', box(doorW / 6 - 0.01, H, 0.07), wood(), 0.12 + (i + 0.5) * (doorW / 6), H / 2, 0.0);
  for (const yb of [0.35, 1.1, 1.85]) K.part('metal', box(doorW, 0.06, 0.02), IRON, 0.12 + doorW / 2, yb, 0.045);
  K.part('metal', torus(0.06, 0.012, 3, 8), IRON, 0.12 + doorW - 0.15, 1.05, 0.06);
  K.boxCollider(0.12 + doorW / 2, H / 2, 0, doorW / 2, H / 2, 0.06);
  K.at(g.x, fy, g.z, g.yaw);
  K.boxCollider(-0.85, (H + 0.2) / 2, 0, 0.13, (H + 0.2) / 2, 0.14);
  K.boxCollider(0.85, (H + 0.2) / 2, 0, 0.13, (H + 0.2) / 2, 0.14);
  K.boxCollider(0, H / 2, -0.95, 0.85, H / 2, 0.12);
  // Daylight beyond the gap (book ch. 5: outside the back door the sun was shining): a pale panel at the end of the
  // short passage outside, a strip of light falling through the gap onto the threshold and the floor.
  const day = [0.8, 0.88, 0.98];
  K.part('ember', box(1.5, H, 0.02), day, 0, H / 2, -1.12);
  K.part('ember', box(0.32, 0.004, 0.9), [0.36, 0.4, 0.44], 0.56, 0.006, 0.35, 0, 0.1, 0);
  out.glow = K.world(0.56, 0.05, 0.1);
  out.buttons = K.world(0.56, -0.02, 0.02);
  // The guard's stool, a torch on the wall, bones by the wall.
  const stool = K.world(-1.1, 0, 1.3);
  K.at(0, 0, 0);
  K.part('wood', cyl(0.22, 0.22, 0.06, 8), 0x4a3424, stool[0], fy + 0.48, stool[2]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * P2;
    K.part('wood', cyl(0.025, 0.03, 0.5, 5), 0x4a3424, stool[0] + Math.cos(a) * 0.14, fy + 0.24, stool[2] + Math.sin(a) * 0.14);
  }
  K.at(g.x, fy, g.z, g.yaw);
  wallTorch(K, out, -1.25, 1.65, 0.6);
  K.at(0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const p = [g.x + (R() - 0.5) * 2, 0, g.z + (R() - 0.5) * 2];
    bone(K, p[0], G.goblinFloorAt(p[0], p[2], fy + 1, 2) + 0.03, p[2], 0.2 + R() * 0.3, R() * 3);
  }
}

/** The front porch: a low cave with a sandy floor, the company's dropped packs, the hole of the chute in the floor and
 * the narrow crack at the back (where the goblins came out, book ch. 4). */
function porch(K, out) {
  const [cx, cz] = G.fromRift(G.PORCH.s, G.PORCH.u);
  for (const [dx, dz, s] of [[-1.2, 0.8, 1], [-0.6, 1.3, 0.85], [1.3, 1.1, 0.95]]) {
    const x = cx + dx;
    const z = cz + dz;
    sack(K, x, G.goblinFloorAt(x, z, G.PORCH.floor + 1, 2) - 0.03, z, 0.75 * s, R() * 3, 0x6a5a3a, true);
  }
  // A bedroll and a walking staff, left behind.
  const bx = cx - 1.6;
  const bz = cz - 0.2;
  const by = G.goblinFloorAt(bx, bz, G.PORCH.floor + 1, 2);
  const roll = cyl(0.14, 0.14, 0.8, 10);
  roll.rotateZ(Math.PI / 2);
  K.part('matte', roll, 0x5a3a2a, bx, by + 0.13, bz, 0, 0.8, 0);
  K.part('wood', cyl(0.025, 0.03, 1.5, 6), 0x4a3424, bx + 0.4, by + 0.05, bz + 0.6, 0, 0.3, Math.PI / 2 - 0.05);
  // Rubble around the hole in the floor.
  const ch = G.TUNNELS.find((t) => t.id === 'csuszda').pts[0];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * P2;
    const x = ch[0] + Math.cos(a) * 1.15;
    const z = ch[2] + Math.sin(a) * 1.15;
    K.part('stone4', rock(0.14 + R() * 0.12, i + 60, 1, 0.6), 0x34343a, x, G.goblinFloorAt(x, z, G.PORCH.floor + 1, 2) + 0.05, z);
  }
}

/* ---------------------------------------------------------------- the whole town ---- */

export function buildGoblinTown(K, out) {
  out.flames = [];
  out.fires = [];
  out.sparks = [];
  out.ladders = [];
  // ---- upper: porch, chute, lift tunnel, the upper side tunnel ----
  K.group = 'l4u';
  K.at(0, 0, 0);
  porch(K, out);
  for (const id of ['lift', 'galeria-del']) tunnelFrames(K, out, G.TUNNELS.find((t) => t.id === id));
  // ---- the hall ----
  K.group = 'l4h';
  for (const d of G.DECKS) {
    if (d.platform) throneDeck(K, out, d);
    else gallery(K, out, d);
  }
  for (const b of G.BRIDGES) bridge(K, out, b);
  for (const l of G.LADDERS4) {
    K.group = l.rope ? 'l4l' : 'l4h';
    ladder(K, out, l);
  }
  K.group = 'l4h';
  for (const id of ['parkany-kelet', 'parkany-nyugat']) tunnelFrames(K, out, G.TUNNELS.find((t) => t.id === id));
  workshop(K, out, G.ROOMS4[0]);
  crane(K, out, -3.4, 2.75, 6);
  crane(K, out, 9.2, -2.7, 16);
  // Cages hanging from the roof over the chasm on long chains.
  for (const [s, u, y, broken] of [[-9.6, 0.3, -170.5, false], [1.6, 0.9, -169.4, false], [9.8, -0.4, -171, true], [-2.9, -0.6, -168.6, false]]) {
    const top = W(s, u, -165.6 - Math.abs(s) * 0.12);
    chain(K, top, [top[0], y, top[2]], 0, 0.09);
    cage(K, top[0], y, top[2], 1.5, 0.52, broken);
  }
  // Ledge dressing: torches on poles, junk heaps, braziers, stacked crates and barrels.
  for (const side of [-1, 1]) {
    for (let s = -9; s <= 9.5; s += 3.1) {
      if (Math.abs(s) < 3) continue;
      const u = side * (G.hallHalf(G.LEDGE_Y + 1) - 0.55);
      const p = W(s + side * 0.7, u, G.LEDGE_Y);
      const fy = G.goblinFloorAt(p[0], p[2], G.LEDGE_Y + 1, 2);
      if (fy < G.LEDGE_Y - 1) continue;
      K.at(p[0], fy, p[2], side > 0 ? G.RIFT_YAW_U : G.RIFT_YAW_U + Math.PI);
      K.part('wood', cyl(0.05, 0.07, 1.7, 6), 0x3a2a1c, 0, 0.85, 0);
      K.capCollider([0, 0, 0], [0, 1.6, 0], 0.09);
      torch(K, out, 0, 1.65, -0.05, 0.12, 1.1);
      K.at(0, 0, 0);
    }
    for (const s of [-7.8, -4.9, 5.8, 8.6]) {
      const u = side * (G.hallHalf(G.LEDGE_Y + 0.5) - 1.1);
      const p = W(s + side * 0.4, u, G.LEDGE_Y);
      junkHeap(K, p[0], p[2], G.LEDGE_Y, 8, 0.9);
    }
  }
  for (const [s, u] of [[-5.5, 4.4], [6.3, -4.6], [-9.6, -3.8], [10.2, 3.6]]) {
    const p = W(s, u, G.LEDGE_Y);
    const fy = G.goblinFloorAt(p[0], p[2], G.LEDGE_Y + 1, 2);
    if (fy > G.LEDGE_Y - 1) brazier(K, out, p[0], fy, p[2], 1);
  }
  // A broken cart on the east ledge (the films' walkways are built from carts and crates).
  {
    const p = W(-1.2, 4.6, G.LEDGE_Y);
    const fy = G.goblinFloorAt(p[0], p[2], G.LEDGE_Y + 1, 2);
    K.at(p[0], fy, p[2], G.RIFT_YAW_S + 0.3);
    K.part('wood', box(1.1, 0.08, 2.0), 0x5a4028, 0, 0.55, 0, 0.12, 0, 0.06);
    for (const sx of [-0.55, 0.55]) K.part('wood', box(0.06, 0.4, 2.0), 0x4a3424, sx, 0.78, 0, 0.12, 0, 0);
    wheel(K, -0.62, 0.42, -0.6, 0.42, Math.PI / 2);
    wheel(K, 0.75, 0.3, 0.5, 0.42, Math.PI / 2, 0.9);
    K.part('wood', box(0.08, 0.08, 1.6), 0x4a3424, 0, 0.3, -1.6, -0.3, 0, 0);
    K.boxCollider(0, 0.55, 0, 0.62, 0.45, 1.05);
    K.at(0, 0, 0);
  }
  // Wall torches in the upper hall (between the galleries and the roof).
  for (const [s, side] of [[-6.5, -1], [-0.8, -1], [5.4, -1], [-3.4, 1], [2.2, 1], [7.6, 1]]) {
    const y = G.GALLERY_Y + 2.1;
    const u = side * (G.hallHalf(y) - 0.05);
    const p = W(s, u, y);
    K.at(p[0], y, p[2], side > 0 ? G.RIFT_YAW_U + Math.PI : G.RIFT_YAW_U);
    wallTorch(K, out, 0, 0, 0.25);
    K.at(0, 0, 0);
  }
  // Rubble on the ledges along the walls.
  for (let i = 0; i < 24; i++) {
    const side = i % 2 ? 1 : -1;
    const s = -10 + R() * 20;
    const p = W(s, side * (G.hallHalf(G.LEDGE_Y) - 0.4 - R() * 0.5), G.LEDGE_Y);
    const fy = G.goblinFloorAt(p[0], p[2], G.LEDGE_Y + 1.5, 2.5);
    if (fy < G.LEDGE_Y - 1.5) continue;
    K.part('stone4', rock(0.2 + R() * 0.3, i * 3 + 100, 1, 0.6), 0x2e2e33, p[0], fy + 0.06, p[2], 0, R() * 3, 0);
  }
  // ---- the chasm floor, the deep tunnels, the back gate ----
  K.group = 'l4l';
  for (const id of ['szakadek-kelet', 'hatso-kapu']) tunnelFrames(K, out, G.TUNNELS.find((t) => t.id === id), 2.8);
  for (const [s, u, n] of [[-8.2, 0.4, 12], [-3.6, 0.9, 9], [3.6, -0.7, 10], [7.8, 0.6, 12], [0.2, 1.6, 6]]) {
    const p = W(s, u, G.CHASM_FLOOR);
    junkHeap(K, p[0], p[2], G.CHASM_FLOOR, n, 1.3);
  }
  {
    // A cage that fell from above, smashed on the floor.
    const p = W(5.2, 1.0, G.CHASM_FLOOR);
    const fy = G.goblinFloorAt(p[0], p[2], G.CHASM_FLOOR + 1, 2);
    K.at(p[0], fy, p[2], 0.7);
    K.at(0, 0, 0);
    cage(K, p[0], fy + 1.5, p[2], 1.3, 0.5, true);
    chain(K, [p[0] + 0.1, fy + 1.3, p[2]], [p[0] + 1.6, fy + 0.05, p[2] + 0.4], 0.15, 0.09);
  }
  // Wall torches along both sides of the chasm floor, in brackets on the real (noisy) rock face.
  for (let s = -10.5; s <= 11; s += 3.6) {
    for (const side of [-1, 1]) {
      const ss = s + side * 0.9;
      const y = G.CHASM_FLOOR + 1.9;
      const u = wallU(ss, side, y);
      if (Math.abs(u) > 4) continue;
      const p = W(ss, u - side * 0.02, y);
      K.at(p[0], y, p[2], side > 0 ? G.RIFT_YAW_U + Math.PI : G.RIFT_YAW_U);
      wallTorch(K, out, 0, 0, 0.05);
      K.at(0, 0, 0);
    }
  }
  for (const [s, u] of [[-6.4, -0.5], [2.4, 1.2], [9.4, -0.3]]) {
    const p = W(s, u, G.CHASM_FLOOR);
    const fy = G.goblinFloorAt(p[0], p[2], G.CHASM_FLOOR + 1, 2);
    brazier(K, out, p[0], fy, p[2], 0.95);
  }
  for (let i = 0; i < 40; i++) {
    const p = W(-11 + R() * 22, (R() - 0.5) * 3.6, G.CHASM_FLOOR);
    const fy = G.goblinFloorAt(p[0], p[2], G.CHASM_FLOOR + 1.5, 2.5);
    if (fy < G.CHASM_FLOOR - 1.5) continue;
    if (i % 3 === 0) K.part('stone4', rock(0.25 + R() * 0.4, i + 200, 1, 0.55), 0x2e2e33, p[0], fy + 0.08, p[2], 0, R() * 3, 0);
    else if (i % 7 === 1) skull(K, p[0], fy, p[2], R() * 3);
    else bone(K, p[0], fy + 0.03, p[2], 0.25 + R() * 0.35, R() * 3, (R() - 0.5) * 0.3);
  }
  backGate(K, out);
}
