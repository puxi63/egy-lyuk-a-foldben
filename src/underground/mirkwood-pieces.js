/* ==== underground/mirkwood-pieces.js — the static dressing of the roots of Mirkwood (layer 6), built into the Kit
   (kit.js) from the layout in mirkwood-sites.js:
   - the root hall: thin roots and rootlets hanging from the roof and the tunnel (the giant roots themselves are part of
     the diggable field), pale fungi at the roots' feet, stones by the stream, cocooned bundles hanging from the crossing
     roots (the film: the spiders wrap their prey), the feast clearings' log seats, fire pits and torch poles;
   - the Elvenking's halls: the carved gate (pillars, lintel, the two great doors standing open), the king's hall's
     carved pillars, the carved wooden throne on its dais (book ch. 8: "on a chair of carved wood sat the Elvenking"),
     the armoury alcove's weapon racks (Orkrist hangs on its back wall: a famous find, finds.js), wall torches (book:
     red torchlight), the cellar's barrels on their cradles and the butler's table with flagons (book ch. 9).
   Nothing named is invented (TERV Decision 18): the furniture, barrels, fungi, stones and weapons are generic.
   Kit group 'l6' (decor.js draws each material as one mesh, culled per view). Materials: 'bark6' (carved-root bark in
   the soil shader's bark layer), 'stone6' (the Elvenking's carved stone), 'wood', 'metal', 'matte'.
   The webs, the cell doors, the trapdoor's hatch and the feast lights are built by mirkwood-fx.js. ==== */
import { rng } from '../noise.js';
import * as M from './mirkwood-sites.js';
import { box, cyl, lathe, rock, sphere, tube } from './kit.js';

const R = rng(6006);
const P2 = Math.PI * 2;
const F = M.CAV.floor;

const BARK = [0x4a3a2c, 0x3e3226, 0x54412f];
const barkTint = () => BARK[Math.floor(R() * BARK.length)];
const STONE = 0x86827a;
const WOOD = 0x8a6440;
const DARK_WOOD = 0x5a3c24;
const IRON = 0x3c3c40;

/** A torch on a wall bracket: the stick (wood), the bracket (iron), and its flame and light. */
function torch(K, out, x, y, z, nx, nz) {
  const yaw = Math.atan2(nx, nz);
  K.at(x, y, z, yaw);
  K.part('metal', box(0.06, 0.18, 0.05), IRON, 0, 0, 0.0);
  const stick = cyl(0.03, 0.022, 0.42, 6);
  K.part('wood', stick, DARK_WOOD, 0, 0.1, 0.16, -0.45, 0, 0);
  K.part('matte', cyl(0.045, 0.035, 0.08, 6), 0x2a1a10, 0, 0.27, 0.25, -0.45, 0, 0);
  const [fx, fy, fz] = K.world(0, 0.31, 0.27);
  out.flames.push([fx, fy, fz, 0.32, R() * 6]);
  out.fires.push([fx, fy + 0.1, fz, 1.0, R() * 6]);
  K.at(0, 0, 0);
}

/** A thin hanging root (decor, bark): from (x, top, z) down `len` metres, wiggling, tapering to a point. */
function hangingRoot(K, x, top, z, len, r) {
  const pts = [];
  const n = Math.max(3, Math.ceil(len / 0.35));
  const ph = R() * P2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x + Math.sin(ph + t * 4) * 0.12 * t, top + 0.25 - t * (len + 0.25), z + Math.cos(ph * 1.3 + t * 3) * 0.12 * t]);
  }
  K.part('bark6', tube(pts, r, 0.02, 5), barkTint(), 0, 0, 0, 0, 0, 0, 1, 0.1);
  // A side rootlet or two.
  for (let k = 0; k < 2; k++) {
    const i0 = 1 + Math.floor(R() * (n - 2));
    const a = R() * P2;
    const p = pts[i0];
    const l = 0.3 + R() * 0.5;
    K.part('bark6', tube([p, [p[0] + Math.cos(a) * l * 0.5, p[1] - l * 0.4, p[2] + Math.sin(a) * l * 0.5], [p[0] + Math.cos(a) * l * 0.7, p[1] - l, p[2] + Math.sin(a) * l * 0.7]], r * 0.4, 0.01, 4), barkTint());
  }
}

/** A pale cluster of small mushrooms on the floor (generic fungi). */
function fungi(K, x, z) {
  const fy = M.mirkFloorAt(x, z, F + 1.5, 3);
  for (let i = 0; i < 4 + Math.floor(R() * 4); i++) {
    const a = R() * P2;
    const r = R() * 0.22;
    const s = 0.5 + R() * 0.8;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    K.part('matte', cyl(0.012 * s, 0.016 * s, 0.07 * s, 5), 0xd8d0b8, px, fy + 0.035 * s, pz);
    K.part('matte', lathe([[0.0, 0], [0.045 * s, 0.004], [0.04 * s, 0.018 * s], [0.0, 0.03 * s]], 7), 0xc8bca0, px, fy + 0.065 * s, pz);
  }
}

/** A cocooned bundle hanging on a thread below a point (the film: the spiders wrap their prey in silk). */
function cocoon(K, x, y, z, drop, s) {
  K.part('matte', cyl(0.008, 0.008, drop, 3), 0xd8d8d0, x, y - drop / 2, z);
  const g = sphere(0.22 * s, 9, 9);
  g.scale(1, 2.4, 1);
  K.part('matte', g, 0xc6c4b8, x, y - drop - 0.5 * s, z, (R() - 0.5) * 0.3, R() * P2, (R() - 0.5) * 0.3, 1, 0.18);
  // Wrapping strands round it.
  for (let k = 0; k < 4; k++) {
    const t = cyl(0.235 * s, 0.235 * s, 0.03, 9, true);
    K.part('matte', t, 0xe0ded4, x, y - drop - 0.1 * s - k * 0.22 * s, z, (R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6);
  }
}

/** A barrel (wood, iron hoops): standing (`lying` false) or lying along local x. */
function barrel(K, x, y, z, yaw, lying, s = 1) {
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push([0.3 * s + Math.sin(t * Math.PI) * 0.06 * s, t * 0.86 * s]);
  }
  const body = lathe(prof, 12);
  body.translate(0, -0.43 * s, 0);
  const rz = lying ? Math.PI / 2 : 0;
  K.part('wood', body, WOOD, x, y, z, 0, yaw, rz, 1, 0.12);
  for (const hy of [-0.3, 0.3]) {
    const h = cyl(0.335 * s, 0.335 * s, 0.05 * s, 12, true);
    h.translate(0, hy * s, 0);
    K.part('metal', h, IRON, x, y, z, 0, yaw, rz, 1, 0.05);
  }
  const lid = cyl(0.31 * s, 0.31 * s, 0.02, 12);
  for (const e of [-1, 1]) {
    const l = lid.clone();
    l.translate(0, e * 0.425 * s, 0);
    K.part('wood', l, DARK_WOOD, x, y, z, 0, yaw, rz);
  }
}

/** A carved pillar (the film's halls: pale stone grown like a tree, flared at its foot and its top, root-like ribs). */
function pillar(K, x, z, h) {
  const prof = [[0.78, 0], [0.55, 0.18], [0.4, 0.5], [0.33, 1.0], [0.31, h * 0.5], [0.33, h - 1.1], [0.42, h - 0.55], [0.62, h - 0.2], [0.8, h]];
  K.part('stone6', lathe(prof, 14), STONE, x, M.HF, z, 0, R() * P2, 0, 1, 0.06);
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * P2 + R() * 0.3;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const yy = t * h;
      const rr = (t < 0.12 ? 0.75 - t * 3 : t > 0.88 ? 0.4 + (t - 0.88) * 3 : 0.36) + 0.02;
      const a = a0 + t * 1.6;
      pts.push([x + Math.cos(a) * rr, M.HF + yy, z + Math.sin(a) * rr]);
    }
    K.part('stone6', tube(pts, 0.12, 0.09, 6), STONE, 0, 0, 0, 0, 0, 0, 1, 0.05);
  }
  K.capCollider([x, M.HF + 0.4, z], [x, M.HF + h - 0.4, z], 0.4);
}

/**
 * Builds the dressing into the Kit. `out` receives: flames ([x, y, z, size, phase]: the wall torches), fires
 * ([x, y, z, strength, phase]: their light, firelight.js), feastPoles (per clearing: its torch-flame points and the
 * fire's), chests (per clearing: where its treasure appears).
 */
export function buildMirkwood(K, out) {
  out.flames = [];
  out.fires = [];
  out.feast = [];
  K.group = 'l6';
  K.at(0, 0, 0);
  const avoid = (x, z, r = 1.6) =>
    M.streamDist(x, z) < 1.3 || M.FEASTS.some((f) => Math.hypot(x - f.x, z - f.z) < 2.6) || Math.hypot(x - M.GATE.x, z - M.GATE.z) < r + 1 || Math.hypot(x - 1.2, z - 6.0) < r;

  // ---- thin roots hanging from the root hall's roof (above head height) ----
  for (let i = 0, n = 0; i < 400 && n < 46; i++) {
    const th = R() * P2;
    const t = Math.sqrt(R()) * 0.9;
    const r = M.caveRadius(th) * t;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const roof = M.mirkRoofAt(x, z, F + 1.5, 16);
    const room = roof - F;
    if (room < 4 || M.rootSurfaceDist(x, roof - 0.5, z) < 0.3) continue;
    const len = Math.min(room - 2.4, 1.2 + R() * 4.5);
    if (len < 0.8) continue;
    hangingRoot(K, x, roof, z, len, 0.05 + R() * 0.12);
    n++;
  }
  // ---- rootlets in the tunnel's roof ----
  for (let i = 2; i < M.TUNNEL6.length - 3; i += 2) {
    const a = M.TUNNEL6[i];
    if (R() < 0.35) continue;
    const x = a[0] + (R() - 0.5) * 0.8;
    const z = a[2] + (R() - 0.5) * 0.8;
    const roof = M.mirkRoofAt(x, z, a[1] + 1.0, 3);
    hangingRoot(K, x, roof, z, 0.3 + R() * 0.35, 0.03 + R() * 0.04);
  }
  // ---- pale fungi at the giant roots' feet, stones by the stream ----
  for (const root of M.ROOTS.slice(0, 9)) {
    const foot = root[Math.floor(root.length * 0.62)];
    for (let k = 0; k < 2; k++) {
      const x = foot[0] + (R() - 0.5) * 2.2;
      const z = foot[2] + (R() - 0.5) * 2.2;
      if (M.streamDist(x, z) < 1.2 || M.rootSurfaceDist(x, F + 0.1, z) < 0.05) continue;
      fungi(K, x, z);
    }
  }
  for (let i = 0; i < 40; i++) {
    const p = M.STREAM[Math.floor(R() * M.STREAM.length)];
    const a = R() * P2;
    const d = M.STREAM_HW + 0.15 + R() * 0.8;
    const x = p[0] + Math.cos(a) * d;
    const z = p[1] + Math.sin(a) * d;
    if (M.streamDist(x, z) < M.STREAM_HW + 0.1 || Math.abs(x) > 8.6) continue;
    const fy = M.mirkFloorAt(x, z, F + 1.2, 3);
    const r = 0.05 + Math.pow(R(), 2) * 0.16;
    K.part('matte', rock(r, R() * 40, 1, 0.55), 0x3a3832, x, fy + r * 0.25, z, 0, R() * P2, 0, 1, 0.12);
  }
  // ---- cocooned bundles hanging from the crossing roots ----
  for (const [ri, f] of [[9, 0.3], [9, 0.62], [10, 0.4], [10, 0.7], [11, 0.5], [12, 0.45], [10, 0.22]]) {
    const root = M.ROOTS[ri];
    const p = root[Math.floor(root.length * f)];
    const x = p[0];
    const z = p[2];
    if (M.streamDist(x, z) < 0.5) continue;
    const bottom = p[1] - p[3];
    const drop = Math.min(2.2, Math.max(0.4, bottom - F - 3.2));
    cocoon(K, x, bottom + 0.05, z, drop, 0.8 + R() * 0.4);
  }
  // ---- the feast clearings: a ring of log seats, a fire pit, four torch poles (their flames: mirkwood-fx.js) ----
  for (const f of M.FEASTS) {
    const poles = [];
    const ring = R() * P2;
    for (let k = 0; k < 5; k++) {
      const a = ring + (k / 5) * P2;
      const x = f.x + Math.cos(a) * 1.35;
      const z = f.z + Math.sin(a) * 1.35;
      const fy = M.mirkFloorAt(x, z, F + 1.5, 3);
      K.part('wood', cyl(0.16, 0.17, 0.85, 8), DARK_WOOD, x, fy + 0.12, z, 0, -a, Math.PI / 2, 1, 0.12);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * P2;
      K.part('matte', rock(0.11, R() * 30, 1, 0.6), 0x4a4640, f.x + Math.cos(a) * 0.38, f.y + 0.05, f.z + Math.sin(a) * 0.38, 0, R() * P2, 0);
    }
    for (let k = 0; k < 3; k++) K.part('wood', cyl(0.04, 0.05, 0.6, 5), 0x2a1c12, f.x, f.y + 0.08, f.z, Math.PI / 2 - 0.25, (k / 3) * P2, 0);
    for (let k = 0; k < 4; k++) {
      const a = ring + 0.6 + (k / 4) * P2;
      const x = f.x + Math.cos(a) * 2.1;
      const z = f.z + Math.sin(a) * 2.1;
      const fy = M.mirkFloorAt(x, z, F + 1.5, 3);
      K.part('wood', cyl(0.03, 0.04, 1.7, 6), DARK_WOOD, x, fy + 0.85, z, (R() - 0.5) * 0.08, 0, (R() - 0.5) * 0.08);
      K.part('matte', cyl(0.05, 0.04, 0.1, 6), 0x2a1a10, x, fy + 1.72, z);
      poles.push([x, fy + 1.76, z]);
    }
    out.feast.push({ poles, fire: [f.x, f.y + 0.1, f.z], chest: [f.x + 0.75, f.y, f.z - 0.2] });
  }

  // ---- the gate: two carved pillars, the lintel, the great doors standing open (book ch. 8, the film) ----
  {
    const g = M.GATE;
    K.at(g.x, F, g.z, g.yaw);
    for (const s of [-1, 1]) {
      const prof = [[0.42, -0.4], [0.36, 0.2], [0.27, 0.6], [0.24, 2.4], [0.3, 2.9], [0.36, 3.2]];
      K.part('stone6', lathe(prof, 12), STONE, s * 1.42, 0, 0);
      K.boxCollider(s * 1.42, 1.4, 0, 0.3, 1.8, 0.3);
      // Root-like carving winding up the pillar.
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([s * 1.42 + Math.cos(t * 7 + s) * 0.29, t * 3.1 - 0.2, Math.sin(t * 7 + s) * 0.29]);
      }
      K.part('stone6', tube(pts, 0.07, 0.05, 5), STONE);
    }
    K.part('stone6', box(3.6, 0.42, 0.62), STONE, 0, 3.35, 0);
    K.part('stone6', box(2.4, 0.18, 0.5), STONE, 0, 3.05, 0);
    // The doors: planked leaves with iron bands, swung inwards against the passage walls (hinged at the pillars).
    for (const s of [-1, 1]) {
      const leaf = box(0.1, 2.85, 1.15);
      leaf.translate(0, 1.42, 0.575);
      K.part('wood', leaf, DARK_WOOD, s * 1.1, 0, 0.3, 0, 0, 0, 1, 0.1);
      for (const by of [0.45, 1.42, 2.4]) {
        const band = box(0.12, 0.07, 1.12);
        band.translate(0, by, 0.575);
        K.part('metal', band, IRON, s * 1.1, 0, 0.3);
      }
      K.boxCollider(s * 1.1, 1.4, 0.88, 0.06, 1.4, 0.58);
    }
    K.at(0, 0, 0);
  }

  // ---- the king's hall: pillars, the throne on its dais, torches ----
  for (const z of [-8.1, -5.3]) for (const x of [-5.4, -1.8, 1.8]) pillar(K, x, z, 5.5);
  {
    const tx = -7.4;
    const tz = -6.7;
    K.part('stone6', box(1.9, 0.3, 2.4), STONE, tx, M.HF + 0.15, tz);
    K.part('stone6', box(0.5, 0.15, 2.0), STONE, tx + 1.15, M.HF + 0.075, tz);
    K.boxCollider(tx, M.HF + 0.15, tz, 0.95, 0.15, 1.2);
    // The carved wooden chair, facing east down the hall, its tall back branching like antlers (the film's throne).
    K.at(tx - 0.1, M.HF + 0.3, tz, -Math.PI / 2);
    K.part('wood', box(0.9, 0.12, 0.75), DARK_WOOD, 0, 0.5, 0);
    for (const sx of [-0.4, 0.4]) for (const sz of [-0.3, 0.3]) K.part('wood', cyl(0.045, 0.05, 0.5, 6), DARK_WOOD, sx, 0.25, sz);
    K.part('wood', box(0.9, 1.5, 0.1), DARK_WOOD, 0, 1.25, 0.34);
    for (const s of [-1, 1]) {
      K.part('wood', box(0.08, 0.35, 0.7), DARK_WOOD, s * 0.45, 0.72, 0);
      for (let b = 0; b < 3; b++) {
        const pts = [[s * 0.3, 1.9, 0.34], [s * (0.55 + b * 0.15), 2.3 + b * 0.25, 0.34 + b * 0.05], [s * (0.75 + b * 0.25), 2.6 + b * 0.35, 0.4]];
        K.part('wood', tube(pts, 0.05, 0.015, 5), 0x6a4a2c);
      }
    }
    K.boxCollider(0, 1.0, 0.05, 0.48, 1.0, 0.42);
    K.at(0, 0, 0);
  }
  // ---- the armoury alcove: spears on a rack, blades on pegs (Orkrist hangs on the back wall: finds.js) ----
  {
    K.part('wood', box(1.4, 0.08, 0.12), DARK_WOOD, -9.3, M.HF + 1.5, -8.18);
    K.part('wood', box(1.4, 0.08, 0.12), DARK_WOOD, -9.3, M.HF + 0.35, -8.18);
    for (let i = 0; i < 5; i++) {
      const x = -9.85 + i * 0.28;
      K.part('wood', cyl(0.018, 0.02, 2.0, 5), 0x7a5a38, x, M.HF + 1.0, -8.12, 0.06, 0, 0);
      K.part('metal', cyl(0.0, 0.028, 0.22, 5), 0xb8c0c8, x, M.HF + 2.1, -8.06, 0.06, 0, 0);
    }
    for (let i = 0; i < 3; i++) {
      const x = -9.8 + i * 0.5;
      K.part('metal', box(0.035, 0.75, 0.008), 0xc0c8d0, x, M.HF + 1.25, -5.17);
      K.part('metal', box(0.18, 0.025, 0.03), 0xa89060, x, M.HF + 0.85, -5.17);
      K.part('wood', cyl(0.014, 0.014, 0.14, 5), DARK_WOOD, x, M.HF + 0.76, -5.17);
    }
    // Two pegs under Orkrist.
    for (const z of [-7.1, -6.3]) K.part('wood', cyl(0.02, 0.02, 0.16, 5), DARK_WOOD, -10.12, M.HF + 1.28, z, 0, 0, Math.PI / 2);
  }
  // ---- torches: the hall, the stair's top and foot, the dungeon corridor, the cellar ----
  for (const x of [-4.0, 0.0, 3.6]) {
    torch(K, out, x, M.HF + 2.1, -9.94, 0, 1);
    torch(K, out, x, M.HF + 2.1, -3.46, 0, -1);
  }
  torch(K, out, 6.9, F + 1.9, -5.95, -0.707, -0.707);
  torch(K, out, 5.5, M.HF + 1.9, -8.64, 0, 1);
  for (const z of [-1.9, 2.9]) torch(K, out, -2.06, M.HF + 1.8, z + 1.2, -1, 0);
  torch(K, out, 1.0, M.HF + 2.0, 9.94, 0, -1);
  torch(K, out, 6.5, M.HF + 2.0, 4.66, 0, 1);

  // ---- the cellar: barrels on cradles along the walls, a few standing, the butler's table with flagons ----
  {
    const y0 = M.HF;
    for (let i = 0; i < 9; i++) {
      const x = -1.2 + i * 0.95;
      if (x > 8.0) break;
      barrel(K, x, y0 + 0.42, 9.45, Math.PI / 2, true);
      if (i % 3 !== 2) barrel(K, x + 0.47, y0 + 1.12, 9.45, Math.PI / 2, true);
      K.part('wood', box(0.12, 0.14, 0.8), DARK_WOOD, x, y0 + 0.07, 9.45);
    }
    K.boxCollider(2.6, y0 + 0.75, 9.45, 4.4, 0.75, 0.42);
    for (let i = 0; i < 4; i++) {
      const x = 0.0 + i * 0.95;
      barrel(K, x, y0 + 0.42, 5.15, Math.PI / 2, true);
      K.part('wood', box(0.12, 0.14, 0.8), DARK_WOOD, x, y0 + 0.07, 5.15);
    }
    K.boxCollider(1.43, y0 + 0.42, 5.15, 1.95, 0.42, 0.42);
    for (const [x, z] of [[8.05, 5.3], [8.05, 6.0], [7.4, 5.3], [8.05, 8.4]]) barrel(K, x, y0 + 0.43, z, R() * P2, false);
    K.boxCollider(7.75, y0 + 0.43, 5.65, 0.65, 0.43, 0.7);
    K.capCollider([8.05, y0 + 0.3, 8.4], [8.05, y0 + 0.6, 8.4], 0.34);
    // The butler's table, two stools, flagons and a jug.
    const tx = -0.6;
    const tz = 7.3;
    K.part('wood', box(1.3, 0.07, 0.75), WOOD, tx, y0 + 0.74, tz);
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.3, 0.3]) K.part('wood', box(0.07, 0.72, 0.07), DARK_WOOD, tx + sx, y0 + 0.36, tz + sz);
    K.boxCollider(tx, y0 + 0.4, tz, 0.68, 0.4, 0.4);
    for (const [sx, sz] of [[-0.95, 0.1], [0.9, -0.2]]) {
      K.part('wood', cyl(0.18, 0.18, 0.05, 10), WOOD, tx + sx, y0 + 0.45, tz + sz);
      for (let k = 0; k < 3; k++) K.part('wood', cyl(0.02, 0.025, 0.44, 5), DARK_WOOD, tx + sx + Math.cos(k * 2.1) * 0.12, y0 + 0.22, tz + sz + Math.sin(k * 2.1) * 0.12);
    }
    for (const [fx, fz] of [[-0.3, 0.1], [0.25, -0.15], [0.05, 0.2]]) K.part('metal', lathe([[0.0, 0], [0.035, 0.0], [0.04, 0.1], [0.035, 0.12]], 8), 0x9a8060, tx + fx, y0 + 0.78, tz + fz);
    K.part('glazed', lathe([[0.0, 0], [0.06, 0.0], [0.08, 0.1], [0.05, 0.2], [0.035, 0.24]], 10), 0x6a4a34, tx - 0.45, y0 + 0.78, tz - 0.2);
  }
  // ---- the grotto: stones on the bank ----
  for (let i = 0; i < 14; i++) {
    const a = R() * P2;
    const g = M.GROTTO;
    const x = g.x + Math.cos(a) * g.rx * (0.7 + R() * 0.2);
    const z = g.z + Math.sin(a) * g.rz * (0.7 + R() * 0.2);
    if (M.inRiverPlan(x, z) || Math.hypot(x + 4, z - 9) < 1.8) continue;
    const fy = M.mirkFloorAt(x, z, g.bank + 1.2, 3);
    const r = 0.08 + R() * 0.2;
    K.part('matte', rock(r, R() * 40, 1, 0.6), 0x34322c, x, fy + r * 0.25, z, 0, R() * P2, 0);
  }
  K.at(0, 0, 0);
}
