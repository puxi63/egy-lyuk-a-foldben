/* ==== materials.js — the soil layers: which material is where, its colour and hardness (shared with the worker) ==== */
import { noise2, noise3 } from './noise.js';
import { carvedDist, MIRK_SHADE_Y, rootSurfaceDist } from './underground/mirkwood-sites.js';
import { LT_SHADE_Y, timberDist } from './underground/laketown-sites.js';
import { ER_SHADE_Y, ereborHallWeight, ereborOre } from './underground/erebor-sites.js';
import { HOARD_SHADE_Y, hoardGoldWeight, hoardHallWeight, inGold } from './underground/hoard-sites.js';

/** The nine layers (TERV.md 0.2: 1–9), plus the topsoil (and Smaug's gold, the soft sea of coins in layer 9). */
export const MATS = [
  { name: 'Termőföld', layer: 0, color: [0.3, 0.22, 0.13], hard: 1.0 },
  { name: 'Zsáklak kertje', layer: 0, color: [0.42, 0.3, 0.18], hard: 1.0 },
  { name: 'Hobbitpincék', layer: 1, color: [0.55, 0.45, 0.34], hard: 1.6 },
  { name: 'A trollok barlangja', layer: 2, color: [0.27, 0.26, 0.27], hard: 2.4 },
  // The Misty Mountains' dark grey rock around Goblin-town: harder than the troll stone (pacing: NOTES-2a-goblintown).
  { name: 'Goblinváros (Ködhegység)', layer: 3, color: [0.2, 0.205, 0.22], hard: 3.2 },
  // The wet, cold blue-black rock deep under the mountains round Gollum's lake: harder still (pacing: NOTES-3a-lake).
  { name: 'Gollam tava', layer: 4, color: [0.14, 0.16, 0.19], hard: 3.6 },
  // The dark, root-bound loam under Mirkwood (with the giant roots and the Elvenking's carved halls in it): harder to
  // dig than the lake rock, because the roots bind it (pacing: NOTES-4a-mirkwood).
  { name: 'Bakacsinerdő gyökerei', layer: 5, color: [0.12, 0.1, 0.075], hard: 4.0 },
  // The wet, packed lake silt and mud beneath Lake-town, with the old town's waterlogged piles in it: harder again (the
  // silt is packed tight under the lake's weight; pacing: NOTES-5a-laketown).
  { name: 'Tóváros alatt', layer: 6, color: [0.16, 0.15, 0.12], hard: 4.4 },
  // The mountain's own rock round the mines of Erebor: hard dark green-grey dwarf stone with iron and gem veins, the
  // hardest yet (pacing: NOTES-6a-erebor).
  { name: 'Erebor tárnái', layer: 7, color: [0.13, 0.15, 0.135], hard: 4.9 },
  // The Mountain's rock round Smaug's treasury (layer 9, NOTES-7a-hoard): the deepest and hardest dwarf stone.
  { name: 'Szmaug kincstára', layer: 8, color: [0.12, 0.14, 0.125], hard: 5.2 },
  // Smaug's gold: the sea of coins on the treasury's floor, loose and soft to dig (and loud: src/hoard/ noise meter).
  { name: 'Szmaug aranya', layer: 8, color: [0.62, 0.46, 0.16], hard: 2.0 },
];

/**
 * Where the layers start, in metres below the surface (TERV 0.2, full-game scale: in co-op the first layer takes
 * about 30–40 minutes). The single source for the soil, the HUD, the music, the lift and the set pieces.
 */
export const LAYER_TOPS = [0, 35, 90, 150, 230, 300, 390, 470, 580];
/** The bottom of the ninth layer, Smaug's treasury (its stone floor at 634 m; the block ends 2 m below). */
export const LAYER_BOTTOM = 634;

export const LAYER_NAMES = ['Zsáklak kertje', 'Hobbitüregek és pincék', 'A trollok barlangja', 'Goblinváros (Ködhegység)', 'Gollam tava', 'Bakacsinerdő gyökerei', 'Tóváros alatt', 'Erebor tárnái', 'Szmaug kincstára'];

/** Layer boundaries in metres below the surface, wobbled by noise so the bands are not flat. */
function wobble(x, z) {
  return (noise2(x * 0.18, z * 0.18) - 0.5) * 3;
}

/** Material id at a world position. */
export function materialAt(x, y, z) {
  const depth = -y + wobble(x, z);
  if (depth < 1.2) return 0;
  if (depth < LAYER_TOPS[1]) return 1;
  if (depth < LAYER_TOPS[2]) return 2;
  if (depth < LAYER_TOPS[3]) return 3;
  if (depth < LAYER_TOPS[4]) return 4;
  if (depth < LAYER_TOPS[5]) return 5;
  if (depth < LAYER_TOPS[6]) return 6;
  // Layer 8 begins only below 470 m (its boundary wobbles downwards only), so layer 7 is exactly as before.
  if (depth < LAYER_TOPS[7] || y >= -LAYER_TOPS[7]) return 7;
  // Layer 9 begins only below 580 m (its boundary wobbles downwards only), so layer 8 is exactly as before.
  if (depth < LAYER_TOPS[8] || y >= -LAYER_TOPS[8]) return 8;
  return inGold(x, y, z) ? 10 : 9;
}

/** Layer index (0–8) from a depth in metres (positive down), for the HUD and the music. */
export function layerAtDepth(depth) {
  if (depth < LAYER_TOPS[1]) return 0;
  if (depth < LAYER_TOPS[2]) return 1;
  if (depth < LAYER_TOPS[3]) return 2;
  if (depth < LAYER_TOPS[4]) return 3;
  if (depth < LAYER_TOPS[5]) return 4;
  if (depth < LAYER_TOPS[6]) return 5;
  if (depth < LAYER_TOPS[7]) return 6;
  if (depth < LAYER_TOPS[8]) return 7;
  return 8;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Low-frequency base tints of the surface layers (the textures in terrain.js add the detail on top). */
const TINT = {
  top: [0.22, 0.15, 0.09],
  garden: [0.34, 0.235, 0.14],
  cellar: [0.48, 0.34, 0.22],
  troll: [0.2, 0.195, 0.205],
  goblin: [0.13, 0.14, 0.165],
  lake: [0.1, 0.12, 0.15],
  // Layer 6 (NOTES-4a-mirkwood): the dark loam, the giant roots' bark, the Elvenking's pale carved stone.
  loam: [0.17, 0.13, 0.092],
  bark: [0.25, 0.19, 0.13],
  elf: [0.34, 0.32, 0.28],
  // Layer 7 (NOTES-5a-laketown): the grey-olive lake silt, the waterlogged timber of the old piles, the black mud.
  silt: [0.2, 0.19, 0.155],
  timber: [0.2, 0.15, 0.1],
  mud: [0.12, 0.105, 0.085],
  // Layer 8 (NOTES-6a-erebor): the green-grey dwarf stone, the polished green hall stone of the carved halls, the ore.
  dwarf: [0.135, 0.155, 0.14],
  hall: [0.12, 0.2, 0.165],
  ore: [0.2, 0.125, 0.085],
  // Layer 9 (NOTES-7a-hoard): the carved green-and-gold stone of the treasury, its raw dwarf stone, Smaug's gold.
  hall9: [0.14, 0.2, 0.15],
  gold: [0.55, 0.4, 0.13],
};

/**
 * Vertex colour and soil weights at a surface vertex (the mesher worker calls this once per vertex).
 * `rgb` gets the base tint (topsoil → garden → clay → troll stone → Misty Mountains rock, smooth across the layer
 * boundaries, grass on flat ground at the top); `soil` gets four weights in 0..1: cellar clay, troll stone (garden soil
 * is the rest), moisture (darker, glossier; more in the deep layers, on ceilings and in damp patches) and, in the
 * fourth channel, roots (the top few metres) or, deeper than 100 m, the Misty Mountains rock (the soil shader reads the
 * channel by world height, so no fifth attribute is needed). The second channel likewise is the troll stone above
 * 200 m and the wet rock of Gollum's lake below (the troll stone ends at 152 m). Below MIRK_SHADE_Y (296 m, where every
 * other weight is 0) the first channel is the giant roots' bark and the fourth the Elvenking's carved stone, and the rest
 * is Mirkwood's dark loam (NOTES-4a-mirkwood). `ny` is the normal's y component.
 */
export function shadeAt(x, y, z, ny, rgb, soil) {
  const depth = -y + wobble(x, z);
  const wc = smooth(LAYER_TOPS[1] - 1, LAYER_TOPS[1] + 1, depth) * (1 - smooth(LAYER_TOPS[2] - 1, LAYER_TOPS[2] + 1.5, depth));
  // Layer 6 takes over from layer 5 (wm is exactly 0 above 298.5 m, so layers 1–5 shade as before).
  // Layer 7 takes over from layer 6 (w7 is exactly 0 above 388.5 m, so layers 1–6 shade as before).
  const w7 = smooth(LAYER_TOPS[6] - 1, LAYER_TOPS[6] + 1.5, depth);
  // Layer 8 takes its share of w7 below 470 m only (w8 is exactly 0 at and above 470 m, so layers 1–7 shade as before);
  // w7o is layer 7's own share.
  const w8a = smooth(LAYER_TOPS[7], LAYER_TOPS[7] + 2.5, Math.min(depth, -y));
  // Layer 9 takes its share of w8 below 580 m only (w9 is exactly 0 at and above 580 m, so layers 1–8 shade as
  // before); w8 is layer 8's own share.
  const w9 = smooth(LAYER_TOPS[8], LAYER_TOPS[8] + 2.5, Math.min(depth, -y));
  const w8 = w8a - w9;
  const w7o = w7 - w8a;
  const wm6 = smooth(LAYER_TOPS[5] - 1, LAYER_TOPS[5] + 1.5, depth);
  const wm = wm6 * (1 - w7);
  // Layer 5 takes over from layer 4 (wl is exactly 0 above 228.5 m, so layers 1–4 shade as before).
  const wl5 = smooth(LAYER_TOPS[4] - 1, LAYER_TOPS[4] + 1.5, depth);
  const wl = wl5 * (1 - wm6);
  const wk = smooth(LAYER_TOPS[3] - 1, LAYER_TOPS[3] + 1.5, depth) * (1 - wl5);
  const wt = smooth(LAYER_TOPS[2] - 1, LAYER_TOPS[2] + 1.5, depth) * (1 - smooth(LAYER_TOPS[3] - 1, LAYER_TOPS[3] + 1.5, depth));
  // Layer 6: the giant roots' bark and the Elvenking's carved stone (by the distance to their surfaces); the rest is
  // the dark loam. Only below MIRK_SHADE_Y, where the soil shader reads the first and fourth channels as these two.
  let wb = 0;
  let we = 0;
  if (wm > 0 && y < MIRK_SHADE_Y) {
    wb = wm * (1 - smooth(0.06, 0.42, rootSurfaceDist(x, y, z)));
    we = wm * (1 - smooth(0.25, 0.7, carvedDist(x, y, z)));
    if (wb + we > wm) wb = wm - we;
  }
  // Layer 7: the old piles' waterlogged timber (by the distance to their surfaces) and black mud on the floors; the
  // rest is the lake silt. Only below LT_SHADE_Y, where the soil shader reads the first channel as the timber, the
  // second as layer 6's loam and the fourth as the mud.
  let wtim = 0;
  let wmud = 0;
  // (Below ER_SHADE_Y layer 7's share is only its silt: the soil shader reads the channels as layer 8's there.)
  if (w7o > 0 && y < LT_SHADE_Y && !(y < ER_SHADE_Y)) {
    wtim = w7o * (1 - smooth(0.05, 0.38, timberDist(x, y, z)));
    wmud = (w7o - wtim) * smooth(0.35, 0.8, ny) * (0.55 + 0.45 * noise3(x * 0.4 - 9, y * 0.4, z * 0.4));
  }
  const wsilt = w7o - wtim - wmud;
  // Layer 8: the carved hall stone (by the distance to the carved halls' surfaces), the ore veins in the raw rock; the
  // rest is the green-veined dwarf stone.
  let whall = 0;
  let wore = 0;
  if (w8 > 0) {
    whall = w8 * ereborHallWeight(x, y, z);
    wore = (w8 - whall) * ereborOre(x, y, z);
  }
  const wdw = w8 - whall - wore;
  // Layer 9: Smaug's gold (on and in the sea of coins), the carved stone of the treasury; the rest is the dwarf stone.
  let wgold = 0;
  let whall9 = 0;
  if (w9 > 0) {
    wgold = w9 * hoardGoldWeight(x, y, z);
    whall9 = (w9 - wgold) * hoardHallWeight(x, y, z);
  }
  const wdw9 = w9 - wgold - whall9;
  const wg = 1 - wc - wt - wk - wl - wm - w7;
  const top = 1 - smooth(0.8, 1.6, depth);
  const v = 0.86 + 0.28 * noise3(x * 1.7, y * 1.7, z * 1.7);
  const streak = 1 + (wc + wt + wk + wl) * 0.3 * (noise3(x * 0.6, y * 3.2, z * 0.6) - 0.5);
  for (let c = 0; c < 3; c++) {
    const g = TINT.garden[c] + (TINT.top[c] - TINT.garden[c]) * top;
    const mk = TINT.loam[c] * (wm - wb - we) + TINT.bark[c] * wb + TINT.elf[c] * we;
    const m7 = TINT.silt[c] * wsilt + TINT.timber[c] * wtim + TINT.mud[c] * wmud;
    const m8 = w8 > 0 ? TINT.dwarf[c] * wdw + TINT.hall[c] * whall + TINT.ore[c] * wore : 0;
    const m9 = w9 > 0 ? TINT.dwarf[c] * wdw9 + TINT.hall9[c] * whall9 + TINT.gold[c] * wgold : 0;
    rgb[c] = (g * wg + TINT.cellar[c] * wc + TINT.troll[c] * wt + TINT.goblin[c] * wk + TINT.lake[c] * wl + mk + m7 + m8 + m9) * v * streak;
  }
  if (y > -0.35 && ny > 0.65) {
    const t = Math.min(1, (ny - 0.65) / 0.25);
    rgb[0] += (0.22 - rgb[0]) * t;
    rgb[1] += (0.42 - rgb[1]) * t;
    rgb[2] += (0.12 - rgb[2]) * t;
  }
  // Moisture: patches from noise, more with depth and on ceilings (where the drips form).
  const damp = noise3(x * 0.23 + 17, y * 0.31, z * 0.23);
  // Gollum's lake: slimy, dripping rock, wet nearly everywhere.
  // Mirkwood's loam and roots: damp; the carved stone of the halls: dry.
  // Beneath Lake-town everything is soaked: the silt, the timber, the mud most of all (w7 and wmud are 0 above 388.5 m).
  let wet = 0.08 + 0.18 * wc + 0.3 * wt + 0.22 * wk + 0.42 * wl + 0.26 * (wm - we) - 0.3 * we + (damp - 0.45) * 0.9 + (ny < -0.3 ? 0.25 : 0);
  if (w7 > 0) wet += 0.4 * w7o + 0.25 * wmud;
  // Erebor: the raw rock dry, the polished hall stone glossy (the shader's wetness also drives the gloss).
  if (w8 > 0) wet += 0.38 * whall - 0.12 * wdw;
  // The treasury: the polished stone glossy, the gold glossiest (the shader's wetness drives the gloss).
  if (w9 > 0) wet += 0.38 * whall9 - 0.12 * wdw9 + 0.5 * wgold;
  if (y < HOARD_SHADE_Y) {
    // Layer 9's channels (terrain.js): the first is the carved stone (the hall-stone layer), the second the dwarf
    // stone, the fourth Smaug's gold; the rest is layer 8's dwarf stone too (only where the layers meet).
    soil[0] = whall9 + whall;
    soil[1] = wdw9 + wdw + wore;
    soil[2] = wet < 0 ? 0 : wet > 1 ? 1 : wet;
    soil[3] = wgold;
    return;
  }
  if (y < ER_SHADE_Y) {
    // Layer 8's channels (terrain.js): the first is the carved hall stone, the second the dwarf stone, the fourth the
    // ore; the rest is layer 7's silt (only where the layers meet).
    soil[0] = whall;
    soil[1] = wdw;
    soil[2] = wet < 0 ? 0 : wet > 1 ? 1 : wet;
    soil[3] = wore;
    return;
  }
  if (y < LT_SHADE_Y) {
    soil[0] = wtim;
    soil[1] = wm;
    soil[2] = wet < 0 ? 0 : wet > 1 ? 1 : wet;
    soil[3] = wmud;
    return;
  }
  soil[0] = y < MIRK_SHADE_Y ? wb : wc;
  soil[1] = depth > 200 ? wl : wt;
  soil[2] = wet < 0 ? 0 : wet > 1 ? 1 : wet;
  soil[3] = y < MIRK_SHADE_Y ? we : depth > 100 ? wk : smooth(0.15, 0.5, depth) * (1 - smooth(3.5, 7, depth));
}

const scratchSoil = [0, 0, 0, 0];

/** Vertex colour at a world position with its normal (kept for callers that need only the colour). */
export function colorAt(x, y, z, ny, out) {
  shadeAt(x, y, z, ny, out, scratchSoil);
}

