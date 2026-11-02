/* ==== underground/soil-gen.js — the pixels of the underground's procedural, tileable textures: the soil array
   (garden soil, cellar clay, troll stone, roots and worm tunnels, strata bands, the Misty Mountains rock of
   Goblin-town, the wet rock of Gollum's lake, the loam, bark and carved stone of Mirkwood's roots) and the brick and wood maps.
   Pure data (no three.js), so it runs in the generator worker (gen-worker.js); soil-textures.js wraps the results. ==== */

/** Edge length of every generated texture. */
export const S = 256;

/** Array layers of the soil texture (the shader in terrain.js uses the same numbers). */
export const SOIL_LAYER = { garden: 0, cellar: 1, troll: 2, roots: 3, strata: 4, misty: 5, lake: 6, loam: 7, bark: 8, elf: 9, silt: 10, timber: 11, mud: 12, dwarf: 13, hall: 14, ore: 15, gold: 16 };
/** Number of layers in the soil array. */
export const SOIL_LAYERS = 17;

/* ---- tileable noise on the unit square ---- */

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
const wrap = (a, n) => ((a % n) + n) % n;

/** Periodic value noise: `fu` × `fv` lattice cells across the tile. */
function vnoise(u, v, fu, fv, s) {
  const x = u * fu;
  const y = v * fv;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = fade(x - xi);
  const ty = fade(y - yi);
  const x0 = wrap(xi, fu);
  const x1 = wrap(xi + 1, fu);
  const y0 = wrap(yi, fv);
  const y1 = wrap(yi + 1, fv);
  const a = hash(x0, y0, s) + (hash(x1, y0, s) - hash(x0, y0, s)) * tx;
  const b = hash(x0, y1, s) + (hash(x1, y1, s) - hash(x0, y1, s)) * tx;
  return a + (b - a) * ty;
}

function fbm(u, v, f, oct, s) {
  let sum = 0;
  let amp = 1;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    sum += vnoise(u, v, f << o, f << o, s + o * 31) * amp;
    tot += amp;
    amp *= 0.5;
  }
  return sum / tot;
}

/**
 * Periodic Worley noise with `fu` × `fv` cells: fills `w` with F1, F2 (cell units), the nearest feature's id hash and
 * the offset (dx, dy) from that feature.
 */
function worley(u, v, fu, fv, s, w) {
  const x = u * fu;
  const y = v * fv;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const hx = wrap(cx, fu);
      const hy = wrap(cy, fv);
      const px = cx + 0.15 + 0.7 * hash(hx, hy, s);
      const py = cy + 0.15 + 0.7 * hash(hx, hy, s + 1);
      const dx = x - px;
      const dy = y - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        w.id = hash(hx, hy, s + 2);
        w.dx = dx;
        w.dy = dy;
      } else if (d < f2) f2 = d;
    }
  }
  w.f1 = f1;
  w.f2 = f2;
  return w;
}

const W = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0 };
const W2 = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0 };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => fade(clamp01((x - a) / (b - a)));

/**
 * Writes one layer. `fn(u, v, px)` returns [r, g, b, a] in 0..1 (colour layers store multipliers × 0.5, so 0.5 is
 * "unchanged" and the shader doubles them).
 */
function fillLayer(data, layer, fn) {
  const out = [0, 0, 0, 0];
  const base = layer * S * S * 4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      fn(x / S, y / S, x, y, out);
      const o = base + (y * S + x) * 4;
      data[o] = Math.round(clamp01(out[0]) * 255);
      data[o + 1] = Math.round(clamp01(out[1]) * 255);
      data[o + 2] = Math.round(clamp01(out[2]) * 255);
      data[o + 3] = Math.round(clamp01(out[3]) * 255);
    }
  }
}

/* ---- the soil layers ---- */

const mixc = (c, r, g, b, t) => {
  c[0] += (r - c[0]) * t;
  c[1] += (g - c[1]) * t;
  c[2] += (b - c[2]) * t;
};
const C = [0, 0, 0];

/**
 * Garden soil (the upper layers' loam, NOTES-17-polish): packed earth cut by the pick. A fine, even grain (two octaves
 * of crumbs), soft mottling, faint compaction bands along v (world height on the walls), and only a few small things
 * in it: sparse small pebbles (grey, ochre, dark flint) with a tight contact shadow kept well inside their Worley cell
 * (a wider halo was cut off by the cell edges into dark squares and, with the old density, read as cobbles), grit
 * specks, and here and there a thin dark rootlet running down.
 */
function garden(u, v, x, y, out) {
  const n = fbm(u, v, 8, 4, 11);
  const crumb = vnoise(u, v, 64, 64, 12);
  const grain = vnoise(u, v, 128, 128, 14);
  const band = vnoise(u, v, 2, 36, 17);
  const m = 0.8 + (n - 0.5) * 0.36 + (crumb - 0.5) * 0.16 + (grain - 0.5) * 0.12 + (band - 0.5) * 0.06;
  C[0] = m;
  C[1] = m * 0.97;
  C[2] = m * 0.92;
  let h = 0.34 + n * 0.18 + crumb * 0.1 + grain * 0.08;
  // Grit: single-texel specks (about 5 mm), a little darker or paler, no shadow.
  const gh = hash(x, y, 13);
  if (gh > 0.992) mixc(C, 0.5, 0.47, 0.43, 0.5);
  else if (gh < 0.006) mixc(C, 1.08, 1.04, 0.98, 0.6);
  // Sparse small pebbles: radius at most 0.3 of a cell, the contact shadow to 1.15× (inside the cell).
  for (const [f, s, p, rmin] of [[9, 15, 0.08, 0.14], [16, 16, 0.05, 0.12]]) {
    worley(u, v, f, f, s, W);
    if (W.id > p) continue;
    const rad = rmin + 0.14 * hash(Math.floor(W.id * 9973), 1, s);
    const wob = rad * (0.9 + 0.2 * vnoise(u, v, 32, 32, s + 5));
    const t = W.f1 / wob;
    // Soft edge over about two texels.
    const aa = (2.2 / S) * f / wob;
    // (The old halo used smooth(1 + aa, 1.35, t): for small pebbles 1 + aa > 1.35, the ramp turned round and darkened
    // the whole Worley cell: the dark squares.)
    const ao = smooth(1, 1.15 + aa, t);
    C[0] *= 0.8 + 0.2 * ao;
    C[1] *= 0.8 + 0.2 * ao;
    C[2] *= 0.8 + 0.2 * ao;
    const inside = smooth(1, 1 - aa, t);
    if (inside > 0) {
      const tt = Math.min(t, 1);
      const dome = Math.sqrt(1 - tt * tt);
      const kind = (W.id / p) * 3;
      const tint = kind < 1.4 ? [1.04, 1.02, 1.0] : kind < 2.3 ? [1.1, 0.99, 0.82] : [0.66, 0.66, 0.7];
      // Mostly buried: soil smeared over the pebble's top, so it reads as part of the wall.
      const smear = 0.55 + 0.45 * smooth(0.35, 0.75, vnoise(u, v, 48, 48, s + 7));
      const sh = (0.8 + 0.25 * dome) * (0.94 + 0.12 * vnoise(u, v, 96, 96, s + 6)) * (1 + 0.1 * (-W.dy / wob));
      mixc(C, tint[0] * sh, tint[1] * sh, tint[2] * sh, inside * smear);
      h += (Math.max(h, 0.48 + 0.3 * dome) - h) * inside * smear;
    }
  }
  // Rootlets: a few thin dark lines wandering down (along v), coming and going.
  for (let k = 0; k < 3; k++) {
    const c = 0.17 + 0.33 * k + 0.04 * Math.sin(Math.PI * 2 * (v * 2 + k * 0.37));
    let du = u - c - 0.025 * Math.sin(Math.PI * 2 * (v * 5 + k * 0.61));
    du -= Math.round(du);
    const w = (0.9 + 0.5 * vnoise(u, v, 4, 24, 41 + k)) / S;
    const on = smooth(0.62, 0.72, vnoise(u, v, 3, 5, 44 + k));
    const line = smooth(w * 1.6, w * 0.5, Math.abs(du)) * on;
    if (line > 0) {
      mixc(C, C[0] * 0.6, C[1] * 0.55, C[2] * 0.5, line * 0.6);
      h += (0.6 - h) * line * 0.5;
    }
  }
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = h;
}

/** Cellar clay: smeared clay, flat grey stones lying in beds (half buried), angular brick shards, lime flecks. */
function cellar(u, v, x, y, out) {
  const n = fbm(u, v, 4, 4, 21);
  const smear = vnoise(u, v, 4, 40, 22) * 0.6 + vnoise(u, v, 8, 64, 23) * 0.4;
  const m = 0.84 + (n - 0.5) * 0.45 + (smear - 0.5) * 0.24;
  C[0] = m;
  C[1] = m * 0.96;
  C[2] = m * 0.9;
  let h = 0.25 + n * 0.3 + smear * 0.1;
  // Flat stones: cells wider than tall, so the stones lie flat like bedded rubble.
  const cw = vnoise(u, v, 6, 6, 20) - 0.5;
  worley(u + cw * 0.05, v + cw * 0.03, 6, 11, 24, W);
  // (NOTES-17-polish: fewer stones and a lighter, tighter contact shadow, so the wall reads as clay, not cobbles.)
  if (W.id < 0.17) {
    const rad = (0.2 + 0.16 * hash(Math.floor(W.id * 7919), 2, 24)) * (0.75 + 0.4 * vnoise(u, v, 20, 20, 25));
    const t = W.f1 / rad;
    const aa = (2.5 / S) * 11 / rad;
    const ao = smooth(1, 1.15, t);
    C[0] *= 0.82 + 0.18 * ao;
    C[1] *= 0.82 + 0.18 * ao;
    C[2] *= 0.82 + 0.18 * ao;
    // Half-buried: soil smeared over the stone's edge.
    const inside = smooth(1, 1 - aa, t) * (1 - smooth(0.6, 0.95, t + (vnoise(u, v, 40, 40, 19) - 0.5) * 0.5) * 0.7);
    if (inside > 0) {
      const top = smooth(1, 0.55, t);
      const tone = 0.95 + 0.3 * hash(Math.floor(W.id * 7919), 3, 24);
      const sh = (0.78 + 0.25 * top) * tone * (0.92 + 0.16 * vnoise(u, v, 80, 80, 26));
      mixc(C, 0.86 * sh, 0.88 * sh, 0.92 * sh, inside);
      h += (0.5 + 0.35 * top - h) * inside;
    }
  }
  // Brick shards: rotated rectangles in a few cells, dirty.
  worley(u, v, 7, 7, 27, W2);
  if (W2.id < 0.08) {
    const a = W2.id * 40;
    const c = Math.cos(a);
    const s2 = Math.sin(a);
    const rx = (W2.dx * c - W2.dy * s2) / 0.34;
    const ry = (W2.dx * s2 + W2.dy * c) / 0.17;
    const q = Math.max(Math.abs(rx), Math.abs(ry));
    const inside = smooth(1, 0.9, q);
    if (q < 1.15) {
      const k = 0.7 + 0.3 * smooth(1, 1.15, q);
      C[0] *= k;
      C[1] *= k;
      C[2] *= k;
    }
    if (inside > 0) {
      const edge = smooth(1, 0.8, q);
      const tone = (0.85 + 0.25 * hash(Math.floor(W2.id * 6007), 4, 27)) * (0.8 + 0.2 * edge) * (vnoise(u, v, 128, 128, 28) > 0.78 ? 0.8 : 1);
      const dirt = 0.55 + 0.45 * vnoise(u, v, 48, 48, 18);
      mixc(C, (1.18 * dirt + C[0] * (1 - dirt)) * tone, (0.66 * dirt + C[1] * (1 - dirt)) * tone, (0.5 * dirt + C[2] * (1 - dirt)) * tone, inside);
      h += (0.55 + 0.3 * edge - h) * inside;
    }
  }
  if (hash(x, y, 29) > 0.997) mixc(C, 1.4, 1.36, 1.28, 0.7);
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = h;
}

/** Troll stone: dark, ridged rock, a broken net of deep cracks, quartz and rusty mineral veins. */
function troll(u, v, x, y, out) {
  const n = fbm(u, v, 6, 5, 31);
  const ridge = 1 - Math.abs(2 * vnoise(u, v, 12, 12, 32) - 1);
  const m = 0.78 + (n - 0.5) * 0.55 + ridge * 0.12;
  C[0] = m;
  C[1] = m;
  C[2] = m * 1.03;
  let h = 0.35 + n * 0.35 + ridge * 0.2;
  const tw = vnoise(u, v, 4, 4, 30) - 0.5;
  const tw2 = vnoise(u, v, 4, 4, 39) - 0.5;
  worley(u + tw * 0.16, v + tw2 * 0.16, 5, 5, 33, W);
  // Cracks only where a mask allows (no closed cells), with a wobbly width.
  const mask = smooth(0.56, 0.7, vnoise(u, v, 6, 6, 38));
  const cw = 0.03 + 0.03 * vnoise(u, v, 24, 24, 40);
  const crack = smooth(cw, cw * 0.25, W.f2 - W.f1) * mask;
  C[0] *= 1 - 0.55 * crack;
  C[1] *= 1 - 0.55 * crack;
  C[2] *= 1 - 0.55 * crack;
  h *= 1 - 0.6 * crack;
  worley(u + tw2 * 0.1, v + tw * 0.1, 13, 13, 34, W2);
  const fine = smooth(0.03, 0.008, W2.f2 - W2.f1) * smooth(0.62, 0.76, vnoise(u, v, 8, 8, 41));
  C[0] *= 1 - 0.3 * fine;
  C[1] *= 1 - 0.3 * fine;
  C[2] *= 1 - 0.3 * fine;
  h *= 1 - 0.25 * fine;
  // Veins: a few long, slightly wavy mineral bands across the rock (periodic diagonals), fading in and out.
  const warp = fbm(u, v, 3, 3, 35) - 0.5;
  const q1 = Math.abs(((u + 2 * v + warp * 0.12) % 1 + 1) % 1 - 0.5);
  const qv = smooth(0.012, 0.003, q1) * smooth(0.35, 0.6, vnoise(u, v, 3, 3, 36));
  mixc(C, 1.75, 1.7, 1.55, qv * 0.85);
  h = Math.max(h, 0.6 * qv);
  const q2 = Math.abs(((3 * u - v + warp * 0.1) % 1 + 1) % 1 - 0.5);
  mixc(C, 1.45, 0.9, 0.55, smooth(0.007, 0.002, q2) * smooth(0.45, 0.65, vnoise(u, v, 4, 4, 37)) * 0.8);
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = h;
}

/**
 * The Misty Mountains' rock around Goblin-town (layer 4): cold dark grey, foliated like slate (fine parallel bands
 * running diagonally), broken into angular blocks by straight joints (Manhattan-like Worley edges), pale feldspar
 * flecks, rusty iron stains and a few dull quartz seams. Drier and harder-looking than the troll stone.
 */
function misty(u, v, x, y, out) {
  const n = fbm(u, v, 5, 5, 61);
  const n2 = fbm(u, v, 13, 3, 72);
  // Foliation: thin bands along a tilted direction, wobbled.
  const fw = fbm(u, v, 4, 3, 62) - 0.5;
  const fol = 0.5 + 0.5 * Math.sin((u * 2 + v * 5 + fw * 0.5) * Math.PI * 2 * 7);
  const fol2 = 0.5 + 0.5 * Math.sin((u * 2 + v * 5 + fw * 0.3) * Math.PI * 2 * 23);
  const m = 0.66 + (n - 0.5) * 0.5 + (n2 - 0.5) * 0.18 + (fol - 0.5) * 0.1 + (fol2 - 0.5) * 0.05;
  C[0] = m * 0.92;
  C[1] = m;
  C[2] = m * 1.1;
  let h = 0.4 + n * 0.3 + n2 * 0.12 + fol * 0.1;
  // Angular blocks: a broken net of straight joints (only where a mask allows), each block a slightly different tone.
  const tw = vnoise(u, v, 3, 3, 63) - 0.5;
  const tw2 = vnoise(u, v, 3, 3, 73) - 0.5;
  worley(u + tw * 0.25, v + tw2 * 0.25, 7, 7, 64, W);
  const mask = smooth(0.55, 0.7, vnoise(u, v, 6, 6, 74));
  const cw = 0.02 + 0.025 * vnoise(u, v, 20, 20, 75);
  const joint = smooth(cw, cw * 0.3, W.f2 - W.f1) * mask;
  const tone = 0.95 + 0.1 * W.id;
  C[0] *= tone * (1 - 0.32 * joint);
  C[1] *= tone * (1 - 0.32 * joint);
  C[2] *= tone * (1 - 0.3 * joint);
  // Each block slopes a little inside (broken, faceted faces).
  h = h * 0.8 + 0.2 * clamp01(0.5 + W.dx * 0.5 - W.dy * 0.35) - 0.4 * joint;
  worley(u - tw2 * 0.1, v + tw * 0.1, 12, 12, 65, W2);
  const fine = smooth(0.03, 0.008, W2.f2 - W2.f1) * smooth(0.6, 0.75, vnoise(u, v, 7, 7, 66));
  C[0] *= 1 - 0.22 * fine;
  C[1] *= 1 - 0.22 * fine;
  C[2] *= 1 - 0.2 * fine;
  h -= 0.12 * fine;
  // Pale feldspar flecks and dark mica.
  const fl = hash(x, y, 67);
  if (fl > 0.99) mixc(C, 1.25, 1.22, 1.18, 0.5);
  else if (fl < 0.012) mixc(C, 0.3, 0.31, 0.35, 0.5);
  // Rust stains along some joints, soot-dark patches.
  const rust = smooth(0.64, 0.82, fbm(u, v, 6, 3, 68)) * (0.35 + 0.65 * joint);
  mixc(C, 1.05, 0.66, 0.42, rust * 0.4);
  const soot = smooth(0.55, 0.78, vnoise(u, v, 3, 3, 69));
  C[0] *= 1 - 0.25 * soot;
  C[1] *= 1 - 0.25 * soot;
  C[2] *= 1 - 0.23 * soot;
  // A few dull quartz seams.
  const warp = fbm(u, v, 3, 3, 70) - 0.5;
  const q = Math.abs(((2 * u - 3 * v + warp * 0.1) % 1 + 1) % 1 - 0.5);
  const qv = smooth(0.01, 0.003, q) * smooth(0.5, 0.7, vnoise(u, v, 3, 3, 71));
  mixc(C, 1.2, 1.2, 1.18, qv * 0.5);
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * The rock round Gollum's lake (layer 5): cold blue-black, water-worn and smooth (soft rounded hollows instead of
 * sharp joints), streaked by flowstone where the water runs down (pale vertical drip runs; v grows with world height on
 * the side faces), with a dark slimy film in patches, pale calcite crusts and small pits. Wetter and smoother-looking
 * than the Misty Mountains rock above it.
 */
function lake(u, v, x, y, out) {
  const n = fbm(u, v, 4, 5, 81);
  const n2 = fbm(u, v, 11, 3, 82);
  const m = 0.6 + (n - 0.5) * 0.45 + (n2 - 0.5) * 0.16;
  C[0] = m * 0.86;
  C[1] = m * 0.95;
  C[2] = m * 1.12;
  let h = 0.42 + n * 0.3 + n2 * 0.1;
  // Water-worn hollows: soft scallops (smooth Worley bowls), shaded on their upper rim.
  const tw = vnoise(u, v, 3, 3, 83) - 0.5;
  worley(u + tw * 0.2, v - tw * 0.15, 6, 6, 84, W);
  const bowl = smooth(0.0, 0.62, W.f1);
  h = h * 0.7 + 0.3 * bowl;
  const rim = smooth(0.35, 0.6, W.f1) * (1 - smooth(0.6, 0.8, W.f1));
  C[0] *= 0.9 + 0.12 * bowl + 0.05 * rim;
  C[1] *= 0.9 + 0.12 * bowl + 0.05 * rim;
  C[2] *= 0.9 + 0.12 * bowl + 0.05 * rim;
  // A few fine cracks (rare: the rock is smoothed by the water).
  worley(u - tw * 0.1, v + tw * 0.1, 10, 10, 85, W2);
  const fine = smooth(0.025, 0.006, W2.f2 - W2.f1) * smooth(0.66, 0.8, vnoise(u, v, 5, 5, 86));
  C[0] *= 1 - 0.3 * fine;
  C[1] *= 1 - 0.3 * fine;
  C[2] *= 1 - 0.28 * fine;
  h -= 0.15 * fine;
  // Flowstone: pale drip runs along v (down the walls), wavering, coming and going.
  const fx = u + (vnoise(u, v, 2, 6, 87) - 0.5) * 0.06;
  const run = Math.pow(0.5 + 0.5 * Math.sin(fx * Math.PI * 2 * 9 + vnoise(u, v, 4, 2, 88) * 4), 6);
  const runMask = smooth(0.48, 0.72, vnoise(u, v, 5, 2, 89));
  mixc(C, 1.05, 1.08, 1.1, run * runMask * 0.45);
  h += 0.12 * run * runMask;
  // Slime: a dark green-black film in patches (strongest in the hollows).
  const slime = smooth(0.5, 0.72, fbm(u, v, 5, 3, 90)) * (0.6 + 0.4 * (1 - bowl));
  mixc(C, 0.34, 0.42, 0.33, slime * 0.55);
  // Pale calcite crusts, rough.
  const crust = smooth(0.7, 0.84, fbm(u, v, 7, 3, 91));
  mixc(C, 1.3, 1.32, 1.3, crust * 0.45 * (0.7 + 0.3 * vnoise(u, v, 64, 64, 92)));
  h += 0.1 * crust;
  // Small pits, and a rare pale fleck.
  if (vnoise(u, v, 96, 96, 93) > 0.84) {
    C[0] *= 0.78;
    C[1] *= 0.78;
    C[2] *= 0.8;
    h -= 0.08;
  }
  if (hash(x, y, 94) > 0.993) mixc(C, 1.2, 1.24, 1.28, 0.45);
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * Mirkwood's loam (layer 6): very dark, crumbly forest soil under the roots: soft clods, fine pale rootlets and dark
 * fibres running mostly down (v grows with world height on the side faces), crumbs of leaf mould, a few small stones
 * and pale threads of fungus.
 */
function loam(u, v, x, y, out) {
  const n = fbm(u, v, 6, 5, 101);
  const n2 = fbm(u, v, 18, 3, 102);
  const m = 0.62 + (n - 0.5) * 0.5 + (n2 - 0.5) * 0.25;
  C[0] = m * 1.04;
  C[1] = m * 0.97;
  C[2] = m * 0.86;
  let h = 0.4 + n * 0.3 + n2 * 0.2;
  // Clods: soft Worley lumps, darker in the gaps.
  worley(u, v, 9, 9, 103, W);
  const gap = smooth(0.12, 0.0, W.f2 - W.f1);
  const tone = 0.9 + 0.2 * W.id;
  C[0] *= tone * (1 - 0.16 * gap);
  C[1] *= tone * (1 - 0.16 * gap);
  C[2] *= tone * (1 - 0.15 * gap);
  h = h * 0.7 + 0.3 * smooth(0.0, 0.5, W.f1) * (1 - gap);
  // Rootlets: thin wavering lines along v, pale ones and dark ones, coming and going.
  for (let k = 0; k < 2; k++) {
    const fx = u + (vnoise(u, v, 3, 8, 104 + k) - 0.5) * 0.08;
    const line = Math.pow(0.5 + 0.5 * Math.sin(fx * Math.PI * 2 * (11 + k * 6) + k * 2.1), 40);
    const mask = smooth(0.55, 0.75, vnoise(u, v, 4, 3, 106 + k));
    if (k === 0) mixc(C, 1.55, 1.3, 1.0, line * mask * 0.55);
    else mixc(C, 0.4, 0.3, 0.22, line * mask * 0.6);
    h += 0.1 * line * mask;
  }
  // Leaf mould crumbs (dark) and a few small stones (grey, raised).
  if (vnoise(u, v, 64, 64, 108) > 0.82) mixc(C, 0.45, 0.36, 0.28, 0.5);
  const st = vnoise(u, v, 24, 24, 109);
  if (st > 0.84) {
    const k = smooth(0.84, 0.9, st);
    mixc(C, 1.15, 1.12, 1.08, k * 0.7);
    h += 0.25 * k;
  }
  // Pale fungus threads in a few patches.
  const fu = smooth(0.7, 0.85, fbm(u, v, 5, 3, 110));
  const thread = Math.pow(0.5 + 0.5 * Math.sin((u * 7 + v * 3 + fbm(u, v, 8, 2, 111) * 0.6) * Math.PI * 2 * 5), 30);
  mixc(C, 1.7, 1.7, 1.55, fu * thread * 0.6);
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * The giant roots' bark (layer 6): deep furrows along v (the big roots mostly come down, so on their side faces v runs
 * along them), broken into long plates, grey-brown with darker cracks, lighter worn ridges and patches of moss green.
 */
function bark(u, v, x, y, out) {
  const n = fbm(u, v, 4, 4, 121);
  const wob = (fbm(u, v, 3, 6, 122) - 0.5) * 0.12;
  const f = 0.5 + 0.5 * Math.sin((u + wob) * Math.PI * 2 * 9);
  const f2 = 0.5 + 0.5 * Math.sin((u + wob * 1.6) * Math.PI * 2 * 23 + 1.3);
  const ridge = Math.pow(f, 0.6) * 0.7 + f2 * 0.3;
  // Long plates: Worley stretched along v.
  worley(u + wob * 0.5, v, 9, 3, 123, W);
  const crack = smooth(0.08, 0.0, W.f2 - W.f1);
  const m = 0.55 + (n - 0.5) * 0.4 + 0.35 * (ridge - 0.5);
  C[0] = m * 1.05;
  C[1] = m * 0.95;
  C[2] = m * 0.82;
  C[0] *= (0.92 + 0.16 * W.id) * (1 - 0.5 * crack);
  C[1] *= (0.92 + 0.16 * W.id) * (1 - 0.5 * crack);
  C[2] *= (0.92 + 0.16 * W.id) * (1 - 0.48 * crack);
  let h = 0.25 + 0.55 * ridge - 0.35 * crack + 0.1 * n;
  // Worn ridges a little paler, moss in the furrows here and there.
  mixc(C, 1.25, 1.2, 1.1, smooth(0.75, 1, ridge) * 0.3);
  const moss = smooth(0.58, 0.75, fbm(u, v, 5, 3, 124)) * (1 - ridge * 0.6);
  mixc(C, 0.55, 0.85, 0.35, moss * 0.55);
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * The Elvenking's carved stone (layer 6; the film's halls: pale, smoothly dressed stone): a fine even grain, large soft
 * tone patches, faint parallel chisel strokes, a few thin dark veins and worn darker patches low down.
 */
function elf(u, v, x, y, out) {
  const n = fbm(u, v, 3, 4, 131);
  const n2 = fbm(u, v, 32, 2, 132);
  const m = 0.86 + (n - 0.5) * 0.22 + (n2 - 0.5) * 0.08;
  C[0] = m * 1.02;
  C[1] = m;
  C[2] = m * 0.94;
  let h = 0.5 + (n2 - 0.5) * 0.15;
  // Chisel strokes: short parallel grooves in patches, tilted.
  const tw = vnoise(u, v, 4, 4, 133);
  const stroke = Math.pow(0.5 + 0.5 * Math.sin((u * 0.6 + v + tw * 0.2) * Math.PI * 2 * 48), 6) * smooth(0.45, 0.65, vnoise(u, v, 6, 6, 134));
  C[0] *= 1 - 0.07 * stroke;
  C[1] *= 1 - 0.07 * stroke;
  C[2] *= 1 - 0.07 * stroke;
  h -= 0.12 * stroke;
  // Thin dark veins, wandering.
  const warp = fbm(u, v, 3, 3, 135) - 0.5;
  const vein = Math.abs(((u * 1.5 + v * 0.8 + warp * 0.35) % 1 + 1) % 1 - 0.5);
  const vv = smooth(0.012, 0.003, vein) * smooth(0.5, 0.7, vnoise(u, v, 3, 3, 136));
  mixc(C, 0.55, 0.53, 0.5, vv * 0.7);
  // Worn, slightly darker patches.
  const wear = smooth(0.6, 0.8, fbm(u, v, 5, 3, 137));
  C[0] *= 1 - 0.1 * wear;
  C[1] *= 1 - 0.1 * wear;
  C[2] *= 1 - 0.08 * wear;
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * The lake silt beneath Lake-town (layer 7): fine laminated layers along v (on the side faces v grows with world height,
 * so the laminae lie flat), grey-olive with thin dark organic bands and paler sandy ones, very fine grain, a few
 * crumbs of shell and small pebbles; smooth and soft.
 */
function silt(u, v, x, y, out) {
  const n = fbm(u, v, 5, 4, 141);
  const wv = v + (fbm(u, v, 3, 3, 142) - 0.5) * 0.05;
  // Laminae: many thin bands of varying tone along v.
  const band = vnoise(0.31, wv, 1, 40, 143) * 0.6 + vnoise(0.77, wv, 1, 96, 144) * 0.4;
  const m = 0.7 + (n - 0.5) * 0.25 + (band - 0.5) * 0.35;
  C[0] = m * 1.0;
  C[1] = m * 0.99;
  C[2] = m * 0.86;
  let h = 0.45 + (band - 0.5) * 0.25 + (n - 0.5) * 0.15;
  // Dark organic laminae (thin, coming and going) and pale sandy ones.
  const dk = smooth(0.78, 0.9, vnoise(0.5, wv, 1, 22, 145)) * smooth(0.35, 0.6, vnoise(u, v, 4, 2, 146));
  mixc(C, 0.42, 0.38, 0.3, dk * 0.6);
  const pale = smooth(0.8, 0.92, vnoise(0.2, wv, 1, 30, 147));
  mixc(C, 1.25, 1.2, 1.02, pale * 0.4);
  h -= 0.08 * dk;
  // Fine grain, a few shell crumbs and pebbles.
  const g = vnoise(u, v, 128, 128, 148);
  C[0] *= 0.95 + 0.1 * g;
  C[1] *= 0.95 + 0.1 * g;
  C[2] *= 0.95 + 0.1 * g;
  if (hash(x, y, 149) > 0.994) mixc(C, 1.5, 1.48, 1.38, 0.55);
  const st = vnoise(u, v, 30, 30, 150);
  if (st > 0.86) {
    const k = smooth(0.86, 0.92, st);
    mixc(C, 0.75, 0.72, 0.66, k * 0.6);
    h += 0.2 * k;
  }
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * The old piles' waterlogged timber (layer 7): dark brown-black wood, the grain along v (the piles stand upright, so
 * on their side faces v runs along them), long splits, soft rotted hollows, black iron-like stains and a greenish film
 * of slime in patches.
 */
function timber(u, v, x, y, out) {
  const n = fbm(u, v, 4, 4, 161);
  const wob = (fbm(u, v, 2, 5, 162) - 0.5) * 0.1;
  const grain = 0.5 + 0.5 * Math.sin((u + wob) * Math.PI * 2 * 26 + fbm(u, v, 6, 2, 163) * 3);
  const ring = 0.5 + 0.5 * Math.sin((u + wob * 1.8) * Math.PI * 2 * 7);
  const m = 0.6 + (n - 0.5) * 0.3 + (grain - 0.5) * 0.14 + (ring - 0.5) * 0.1;
  C[0] = m * 1.06;
  C[1] = m * 0.92;
  C[2] = m * 0.74;
  let h = 0.45 + (grain - 0.5) * 0.2 + (n - 0.5) * 0.2;
  // Long splits along the grain.
  worley(u + wob, v, 7, 2, 164, W);
  const split = smooth(0.06, 0.0, W.f2 - W.f1) * smooth(0.4, 0.6, vnoise(u, v, 5, 2, 165));
  C[0] *= 1 - 0.55 * split;
  C[1] *= 1 - 0.55 * split;
  C[2] *= 1 - 0.5 * split;
  h -= 0.3 * split;
  // Rotted soft hollows (darker, lower).
  const rot = smooth(0.62, 0.8, fbm(u, v, 5, 3, 166));
  C[0] *= 1 - 0.3 * rot;
  C[1] *= 1 - 0.3 * rot;
  C[2] *= 1 - 0.28 * rot;
  h -= 0.2 * rot;
  // Black stains and a green-grey slime film.
  mixc(C, 0.3, 0.28, 0.26, smooth(0.7, 0.85, fbm(u, v, 3, 3, 167)) * 0.6);
  mixc(C, 0.62, 0.78, 0.5, smooth(0.6, 0.78, fbm(u, v, 4, 3, 168)) * 0.4);
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * The black mud of the cave floors beneath Lake-town (layer 7): smooth glossy ooze in soft blobs, darker in the
 * hollows, with bits of twig and leaf and a few small stones.
 */
function mud(u, v, x, y, out) {
  const n = fbm(u, v, 5, 4, 171);
  worley(u + (n - 0.5) * 0.1, v, 8, 8, 172, W);
  const blob = smooth(0.0, 0.55, W.f1);
  const m = 0.55 + (n - 0.5) * 0.3 + (1 - blob) * 0.12;
  C[0] = m * 1.03;
  C[1] = m * 0.97;
  C[2] = m * 0.86;
  let h = 0.35 + (1 - blob) * 0.3 + (n - 0.5) * 0.15;
  // Twigs: short thin dark streaks in random directions.
  worley(u, v, 14, 14, 173, W2);
  const ang = W2.id * Math.PI;
  const along = Math.abs(W2.dx * Math.cos(ang) + W2.dy * Math.sin(ang));
  const across = Math.abs(-W2.dx * Math.sin(ang) + W2.dy * Math.cos(ang));
  const twig = smooth(0.06, 0.02, across) * smooth(0.35, 0.2, along) * (W2.id > 0.55 ? 1 : 0);
  mixc(C, 0.55, 0.42, 0.28, twig * 0.7);
  h += 0.15 * twig;
  const st = vnoise(u, v, 26, 26, 174);
  if (st > 0.88) {
    const k = smooth(0.88, 0.93, st);
    mixc(C, 1.05, 1.02, 0.95, k * 0.55);
    h += 0.25 * k;
  }
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * The raw rock of Erebor (layer 8, NOTES-6a-erebor): dark grey-green dwarf stone, finely crystalline, with pale green
 * veins winding through it, finer threads between them and a few darker inclusions.
 */
function dwarfStone(u, v, x, y, out) {
  const n = fbm(u, v, 4, 4, 181);
  const g = vnoise(u, v, 96, 96, 182);
  const m = 0.66 + (n - 0.5) * 0.3 + (g - 0.5) * 0.1;
  C[0] = m * 0.92;
  C[1] = m * 1.03;
  C[2] = m * 0.96;
  let h = 0.5 + (n - 0.5) * 0.3 + (g - 0.5) * 0.14;
  // Veins: the edges between warped Worley cells, pale green, a little raised (harder than the rock round them).
  const wu = u + (fbm(u, v, 3, 3, 183) - 0.5) * 0.16;
  const wv = v + (fbm(u, v, 3, 3, 184) - 0.5) * 0.16;
  worley(wu, wv, 3, 3, 185, W);
  // Only some of the cell edges are veins (a cell grid of veins would read as cracked mud).
  const vein = smooth(0.05, 0.0, W.f2 - W.f1) * smooth(0.42, 0.68, vnoise(u, v, 3, 3, 189));
  mixc(C, 1.0, 1.45, 1.12, vein * 0.65);
  h += 0.1 * vein;
  worley(wu, wv, 10, 10, 186, W2);
  const thread = smooth(0.03, 0.0, W2.f2 - W2.f1) * smooth(0.55, 0.78, vnoise(u, v, 4, 4, 187));
  mixc(C, 0.95, 1.25, 1.05, thread * 0.35);
  // Dark inclusions, rough.
  const dk = smooth(0.66, 0.8, fbm(u, v, 5, 3, 188));
  mixc(C, 0.42, 0.46, 0.44, dk * 0.55);
  h -= 0.12 * dk;
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * The carved, polished hall stone of Erebor (the films' green-and-gold halls): deep green stone with lighter clouds,
 * thin gold veins, cut into great blocks (one tile: two courses in running bond; on the floors, slabs) with fine sunk
 * joints. High and smooth (polished) except in the joints.
 */
function hallStone(u, v, x, y, out) {
  const rv = v * 2;
  const row = Math.floor(rv);
  const fv = rv - row;
  const cu = u + (row % 2) * 0.5;
  const fu = cu - Math.floor(cu);
  const ju = Math.min(fu, 1 - fu) * 2;
  const jv = Math.min(fv, 1 - fv);
  const face = smooth(0.006, 0.02, Math.min(ju, jv));
  const n = fbm(u, v, 3, 4, 191);
  const sw = fbm(u + (n - 0.5) * 0.35, v + (n - 0.5) * 0.35, 5, 3, 192);
  const m = 0.86 + (sw - 0.5) * 0.5 + (n - 0.5) * 0.12;
  C[0] = m * 0.84;
  C[1] = m * 1.08;
  C[2] = m * 0.98;
  // A slightly different tone per block.
  const bt = hash(Math.floor(cu) & 3, row & 7, 193) - 0.5;
  C[0] *= 1 + bt * 0.12;
  C[1] *= 1 + bt * 0.1;
  C[2] *= 1 + bt * 0.12;
  // Thin gold veins winding through the green.
  worley(u + (n - 0.5) * 0.2, v + (sw - 0.5) * 0.2, 3, 3, 194, W);
  const gold = smooth(0.022, 0.0, W.f2 - W.f1) * smooth(0.3, 0.55, vnoise(u, v, 4, 4, 195));
  mixc(C, 2.3, 1.75, 0.7, gold * 0.85);
  // The joints: sunk and dark.
  mixc(C, 0.36, 0.4, 0.38, (1 - face) * 0.8);
  const h = 0.78 * face + 0.12 + 0.05 * (sw - 0.5);
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * The ore of Erebor's veins: rust-red and ochre iron, dark metallic grains, and gems in it: small crystals, now and
 * then a bright green, red, blue or white one.
 */
function ore(u, v, x, y, out) {
  const n = fbm(u, v, 5, 4, 201);
  const m = 0.75 + (n - 0.5) * 0.45;
  C[0] = m * 1.22;
  C[1] = m * 0.82;
  C[2] = m * 0.62;
  let h = 0.5 + (n - 0.5) * 0.35;
  mixc(C, 1.45, 1.15, 0.6, smooth(0.6, 0.75, fbm(u, v, 7, 3, 204)) * 0.45);
  const gr = fbm(u, v, 24, 2, 202);
  if (gr > 0.6) {
    const k = smooth(0.6, 0.8, gr);
    mixc(C, 0.42, 0.42, 0.46, k * 0.6);
    h += 0.1 * k;
  }
  worley(u, v, 16, 16, 203, W);
  if (W.id > 0.78) {
    const k = smooth(0.24, 0.1, W.f1);
    const t = (W.id - 0.78) / 0.22;
    if (t > 0.8) mixc(C, 2.0, 2.0, 2.05, k);
    else if (t > 0.55) mixc(C, 0.55, 0.85, 2.1, k);
    else if (t > 0.3) mixc(C, 2.1, 0.45, 0.5, k);
    else mixc(C, 0.5, 2.0, 0.85, k);
    h += 0.35 * k;
  }
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/**
 * Smaug's gold (layer 9, NOTES-7a-hoard): a sea of coins heaped every which way: overlapping discs with a raised rim and
 * a stamped boss, each tilted a little (a light and a dark side), bright where they face up, deep shadow between them;
 * now and then a gem among the coins (red, green, white). High on the coins, low in the gaps.
 */
function gold(u, v, x, y, out) {
  // Two staggered layers of coins: the upper one wins where its disc covers the point.
  let hit = false;
  let h = 0.12;
  let tone = 0.35;
  for (const [f, s] of [[11, 211], [7, 215]]) {
    worley(u, v, f, f, s, W);
    const rad = 0.38 + 0.08 * W.id;
    if (W.f1 > rad || hit) continue;
    hit = true;
    const r = W.f1 / rad;
    // A tilted disc: brighter on one side (the tilt direction from the coin's hash).
    const ang = W.id * 6.283;
    const tilt = ((W.dx * Math.cos(ang) + W.dy * Math.sin(ang)) / rad) * 0.35;
    const rim = smooth(0.78, 0.9, r) * smooth(1.0, 0.92, r);
    const boss = smooth(0.42, 0.3, r) * 0.5;
    tone = 0.78 + tilt + rim * 0.35 + boss * 0.25 + (W.id - 0.5) * 0.2;
    h = 0.62 + tilt * 0.5 + rim * 0.2 + boss * 0.12 + (s === 211 ? 0.12 : 0);
    // The edge of the disc: a thin dark line.
    tone *= 1 - smooth(0.9, 1.0, r) * 0.55;
  }
  const n = fbm(u, v, 6, 3, 219);
  tone *= 0.9 + (n - 0.5) * 0.3;
  C[0] = tone * 1.95;
  C[1] = tone * 1.42;
  C[2] = tone * 0.52;
  // Gems among the coins.
  worley(u, v, 5, 5, 223, W2);
  if (W2.id > 0.86) {
    const k = smooth(0.22, 0.12, W2.f1);
    const t = (W2.id - 0.86) / 0.14;
    if (t > 0.66) mixc(C, 2.1, 2.1, 2.15, k);
    else if (t > 0.33) mixc(C, 0.45, 1.9, 0.75, k);
    else mixc(C, 2.0, 0.35, 0.4, k);
    h = Math.max(h, 0.75 * k + h * (1 - k));
  }
  out[0] = C[0] * 0.5;
  out[1] = C[1] * 0.5;
  out[2] = C[2] * 0.5;
  out[3] = clamp01(h);
}

/** Strata: horizontal bands of different soil tints (rows = world height), alpha = smooth noise for masks. */
function makeStrata() {
  const rows = new Float32Array(S * 3);
  const palette = [
    [1.0, 1.0, 1.0], [1.22, 1.06, 0.8], [0.66, 0.62, 0.58], [1.12, 1.1, 1.04], [1.18, 0.9, 0.76], [0.84, 0.78, 0.7], [1.3, 1.18, 0.86],
  ];
  let y = 0;
  let k = 0;
  while (y < S) {
    const th = 4 + Math.floor(hash(k, 0, 41) * 26);
    const c = palette[Math.floor(hash(k, 1, 41) * palette.length)];
    for (let i = 0; i < th && y < S; i++, y++) {
      rows[y * 3] = c[0];
      rows[y * 3 + 1] = c[1];
      rows[y * 3 + 2] = c[2];
    }
    k++;
  }
  // Blend the band edges over a few rows.
  const soft = new Float32Array(S * 3);
  for (let yy = 0; yy < S; yy++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let d = -2; d <= 2; d++) sum += rows[wrap(yy + d, S) * 3 + c];
      soft[yy * 3 + c] = sum / 5;
    }
  }
  return (u, v, x, yy, out) => {
    const shift = Math.round((vnoise(u, 0.3, 4, 1, 42) - 0.5) * 10);
    const row = wrap(yy + shift, S);
    const grain = 0.94 + 0.12 * vnoise(u, v, 64, 16, 43);
    out[0] = soft[row * 3] * grain * 0.5;
    out[1] = soft[row * 3 + 1] * grain * 0.5;
    out[2] = soft[row * 3 + 2] * grain * 0.5;
    out[3] = fbm(u, v, 4, 4, 44);
  };
}

/** Roots and worm tunnels, drawn on a 2D canvas with wrap-around copies (tileable); alpha is the coverage. */
function makeRootsLayer() {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const strokes = [];
  const root = (x, y, ang, w, len, depth) => {
    const pts = [[x, y]];
    for (let i = 0; i < len; i++) {
      ang += (rnd() - 0.5) * 0.6;
      // Roots hang down (screen +y is world down in the triplanar side views: v grows with world y, so they go -y).
      ang += (Math.PI * 1.5 - ang) * 0.05;
      x += Math.cos(ang) * 4;
      y += Math.sin(ang) * 4;
      pts.push([x, y]);
      if (depth < 2 && rnd() < 0.08) root(x, y, ang + (rnd() < 0.5 ? -0.8 : 0.8), w * 0.6, Math.floor(len * 0.5), depth + 1);
    }
    strokes.push({ pts, w, kind: 'root' });
  };
  for (let i = 0; i < 5; i++) root(rnd() * S, rnd() * S, Math.PI * 1.5 + (rnd() - 0.5), 2.0 + rnd() * 2.0, 16 + Math.floor(rnd() * 20), 0);
  for (let i = 0; i < 8; i++) {
    let x = rnd() * S;
    let y = rnd() * S;
    let a = rnd() * Math.PI * 2;
    const pts = [[x, y]];
    for (let k = 0; k < 4 + rnd() * 5; k++) {
      a += (rnd() - 0.5) * 1.4;
      x += Math.cos(a) * 3.5;
      y += Math.sin(a) * 3.5;
      pts.push([x, y]);
    }
    strokes.push({ pts, w: 2.6 + rnd() * 1.4, kind: 'worm' });
  }
  const path = (pts, ox, oy) => {
    g.beginPath();
    g.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + ox, pts[i][1] + oy);
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let oy = -S; oy <= S; oy += S) {
    for (let ox = -S; ox <= S; ox += S) {
      for (const s of strokes) {
        if (s.kind === 'worm') {
          path(s.pts, ox, oy);
          g.strokeStyle = 'rgba(140,108,72,0.9)';
          g.lineWidth = s.w + 2.4;
          g.stroke();
          g.strokeStyle = 'rgba(22,15,10,1)';
          g.lineWidth = s.w;
          g.stroke();
        } else {
          path(s.pts, ox, oy);
          g.strokeStyle = 'rgba(40,26,15,0.95)';
          g.lineWidth = s.w + 1;
          g.stroke();
          g.strokeStyle = 'rgba(96,66,40,1)';
          g.lineWidth = s.w;
          g.stroke();
          path(s.pts, ox - s.w * 0.25, oy);
          g.strokeStyle = 'rgba(132,98,64,0.8)';
          g.lineWidth = Math.max(0.6, s.w * 0.3);
          g.stroke();
        }
      }
    }
  }
  return g.getImageData(0, 0, S, S).data;
}

/** The soil array's pixels: SOIL_LAYERS layers of 256² RGBA8. */
export function genSoilData() {
  const data = new Uint8Array(S * S * 4 * SOIL_LAYERS);
  fillLayer(data, SOIL_LAYER.garden, garden);
  fillLayer(data, SOIL_LAYER.cellar, cellar);
  fillLayer(data, SOIL_LAYER.troll, troll);
  data.set(makeRootsLayer(), SOIL_LAYER.roots * S * S * 4);
  fillLayer(data, SOIL_LAYER.strata, makeStrata());
  fillLayer(data, SOIL_LAYER.misty, misty);
  fillLayer(data, SOIL_LAYER.lake, lake);
  fillLayer(data, SOIL_LAYER.loam, loam);
  fillLayer(data, SOIL_LAYER.bark, bark);
  fillLayer(data, SOIL_LAYER.elf, elf);
  fillLayer(data, SOIL_LAYER.silt, silt);
  fillLayer(data, SOIL_LAYER.timber, timber);
  fillLayer(data, SOIL_LAYER.mud, mud);
  fillLayer(data, SOIL_LAYER.dwarf, dwarfStone);
  fillLayer(data, SOIL_LAYER.hall, hallStone);
  fillLayer(data, SOIL_LAYER.ore, ore);
  fillLayer(data, SOIL_LAYER.gold, gold);
  return data;
}

/**
 * Old brickwork, one tile = 1 m: 4 bricks × 8 courses in running bond, worn lime mortar, burnt and chipped bricks.
 * Returns { col, hgt } (RGBA8 pixels; the height is in the red channel).
 */
export function genBrickData() {
  const col = new Uint8Array(S * S * 4);
  const hgt = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / 32);
    const off = (row % 2) * 32;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const bx = Math.floor(((x + off) % S) / 64);
      const lx = (x + off) % 64;
      const ly = y % 32;
      const id = hash(bx, row, 51);
      const edge = Math.min(lx, 63 - lx, ly * 2, (31 - ly) * 2);
      const n = vnoise(u, v, 32, 32, 52);
      let r;
      let g;
      let b;
      let h;
      if (edge < 3) {
        const m = 0.5 + 0.12 * n + 0.1 * vnoise(u, v, 128, 128, 53);
        r = m;
        g = m * 0.94;
        b = m * 0.82;
        h = 0.2 + 0.1 * n;
      } else {
        const burnt = id < 0.18;
        const light = id > 0.85;
        const base = burnt ? [0.28, 0.13, 0.09] : light ? [0.6, 0.33, 0.21] : [0.46, 0.22, 0.14];
        const k = (0.85 + 0.3 * n) * (0.9 + 0.2 * hash(bx, row, 54)) * (vnoise(u, v, 160, 160, 55) > 0.82 ? 0.78 : 1);
        r = base[0] * k;
        g = base[1] * k;
        b = base[2] * k;
        // Chipped corners and a soft bevel.
        h = 0.62 + 0.35 * Math.min(1, (edge - 3) / 5) - (vnoise(u, v, 48, 48, 56) > 0.8 ? 0.2 : 0);
        // Soot and damp towards the bottom of each tile.
        const damp = 0.82 + 0.18 * (1 - v * 0.5);
        r *= damp;
        g *= damp;
        b *= damp;
      }
      const o = (y * S + x) * 4;
      col[o] = Math.round(clamp01(r) * 255);
      col[o + 1] = Math.round(clamp01(g) * 255);
      col[o + 2] = Math.round(clamp01(b) * 255);
      col[o + 3] = 255;
      hgt[o] = hgt[o + 1] = hgt[o + 2] = Math.round(clamp01(h) * 255);
      hgt[o + 3] = 255;
    }
  }
  return { col, hgt };
}

/**
 * Old oak planks, one tile = 0.8 m: grain along v, 4 boards across with dark seams, knots. Returns { col, hgt }.
 * The colour is light (tinted per object by vertex colours).
 */
export function genWoodData() {
  const col = new Uint8Array(S * S * 4);
  const hgt = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const board = Math.floor(x / 64);
      const lx = x % 64;
      const warp = vnoise(u, v, 4, 2, 61 + board) * 0.6;
      const grain = vnoise(u + warp * 0.05, v, 96, 3, 62 + board);
      const fine = vnoise(u, v, 256, 8, 63);
      worley(u, v, 4, 3, 64 + board, W);
      const knot = W.id < 0.25 ? smooth(0.22, 0.05, W.f1) : 0;
      let m = 0.78 + 0.26 * grain + 0.08 * fine - knot * 0.45 + (hash(board, 0, 65) - 0.5) * 0.2;
      const seam = Math.min(lx, 63 - lx);
      let h = 0.6 + 0.25 * grain;
      if (seam < 2) {
        m *= 0.35;
        h = 0.1;
      }
      const o = (y * S + x) * 4;
      col[o] = Math.round(clamp01(m * 0.62) * 255);
      col[o + 1] = Math.round(clamp01(m * 0.45) * 255);
      col[o + 2] = Math.round(clamp01(m * 0.3) * 255);
      col[o + 3] = 255;
      hgt[o] = hgt[o + 1] = hgt[o + 2] = Math.round(clamp01(h) * 255);
      hgt[o + 3] = 255;
    }
  }
  return { col, hgt };
}
