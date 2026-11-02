/* ==== ui/sketches.js — "pencil drawings from Bilbo's book" (TERV 0.12 Betöltés, Stáblista; NOTES-21-screens) ====
 * Plain line drawings as inline SVG, one per location (Bag End, the nine layers) and a few characters for the credits.
 * Every path carries pathLength="1" and a staggered `--d` delay, so ui/screens.css can draw it in stroke by stroke
 * (stroke-dashoffset) like a pencil sketch being made. No textures, no filters: cheap to paint, nothing runs while
 * the drawing is hidden. Only things the book or the films show; no invented places or objects. */

/** Builds one drawing: `strokes` is a list of [d, width?, cls?]; the delays run over `span` seconds. */
function drawing(strokes, { span = 5.5, view = '0 0 400 260', extra = '' } = {}) {
  const n = strokes.length;
  // Each stroke twice: the line, and a faint second pass a hair off it (a pencil going over its own line).
  const paths = strokes.map(([d, w = 1.6, cls = ''], i) => {
    const t = (i / n) * span;
    return `<path d="${d}" pathLength="1" stroke-width="${w}"${cls ? ` class="${cls}"` : ''} style="--d:${t.toFixed(2)}s"/>`
      + `<path d="${d}" pathLength="1" stroke-width="${(w * 0.7).toFixed(2)}" class="gh" transform="translate(0.9 0.7)" style="--d:${(t + 0.25).toFixed(2)}s"/>`;
  }).join('');
  return `<svg class="sk" viewBox="${view}" aria-hidden="true">${extra}<g class="sk-g">${paths}</g></svg>`;
}

/** Short hatching strokes along a line from (x0, y0) to (x1, y1): `n` strokes of length `len` at angle `a` (rad). */
function hatch(x0, y0, x1, y1, n, len = 9, a = -1.0) {
  const out = [];
  const dx = Math.cos(a) * len;
  const dy = Math.sin(a) * len;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    out.push(`M${x.toFixed(1)} ${y.toFixed(1)}l${dx.toFixed(1)} ${dy.toFixed(1)}`);
  }
  return [out.join(''), 0.8, 'hx'];
}

/** A circle as a path (so it can be drawn in like the other strokes). */
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Many small coin ellipses on a heap's outline (Smaug's gold). */
function coins(x0, x1, yOf, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n + ((i * 37) % 7) - 3;
    const y = yOf(x) + ((i * 53) % 11);
    out.push(`M${(x - 5).toFixed(1)} ${y.toFixed(1)}a5 2 0 1 0 10 0a5 2 0 1 0 -10 0`);
  }
  return [out.join(''), 0.9, 'hx'];
}

/** The drawings by location key: 'bagend' (the surface) and 'layer-1' … 'layer-9' (materials.js LAYER_NAMES order). */
export const SKETCHES = {
  // Bag End: the round door in the hill, the round window, the chimney's smoke, the fence and the path (book ch. 1, the films).
  bagend: () => drawing([
    ['M0 150C80 92 170 72 250 86S370 120 400 140', 2],
    [circle(170, 178, 58), 1.8],
    [circle(170, 178, 50), 1.4],
    ['M140 138v80M155 131v94M170 128v100M185 131v94M200 138v80', 1],
    [circle(170, 178, 4), 1.6],
    [circle(292, 160, 22), 1.5],
    ['M292 138v44M270 160h44', 1.1],
    ['M302 96v-22h12v24', 1.4],
    ['M308 70c-7-8 7-12 0-20s7-12 0-18', 1, 'soft'],
    ['M150 260C158 244 168 238 166 236M196 260C190 246 182 240 180 236', 1.3],
    ['M236 232h160M248 222v20M272 222v20M296 222v20M320 222v20M344 222v20M368 222v20', 1.2],
    hatch(10, 150, 110, 108, 14),
    hatch(240, 92, 390, 140, 16),
    ['M40 230c6-10 10-10 14 0M70 236c6-10 10-10 14 0M100 232c6-10 10-10 14 0', 1, 'soft'],
    ['M30 200c-10-30 10-60 30-60s40 30 30 60z', 1.3],
    ['M60 200v40', 1.6],
  ]),
  // Layer 1, the garden: the lawn cut open, potatoes and roots in the loam, a spade left in the soil (TERV 0.2 layer 1).
  'layer-1': () => drawing([
    ['M0 70C60 66 120 74 200 70S330 66 400 72', 2],
    ['M10 70l4-12M24 70l2-10M60 70l5-13M90 70l1-9M150 70l4-12M230 70l3-11M300 70l4-13M360 70l2-10', 0.9, 'soft'],
    ['M120 40l26 60', 2.2],
    ['M114 36h14M138 92l-8 28 20 6 6-28', 1.6],
    ['M60 120c-14 0-22 8-20 16s14 10 24 6 14-12 8-18c-3-3-7-4-12-4z', 1.4],
    ['M250 150c-16-2-26 8-22 18s18 12 28 6 10-16 4-21c-3-2-6-3-10-3z', 1.4],
    ['M320 110c-10 0-16 6-14 12s12 7 18 3 6-10 2-13z', 1.3],
    ['M200 70c-4 30 6 50-6 80s4 50-4 80', 1.1],
    ['M200 110c18 6 30 2 44 14M196 160c-20 4-34 0-52 12', 0.9],
    ['M340 70c2 20-8 34 0 52', 0.9],
    [circle(90, 200, 12), 1.2],
    [circle(310, 220, 16), 1.2],
    ['M40 236c10-4 20 4 30 0s20-6 30 0', 1, 'soft'],
    hatch(10, 100, 390, 104, 30, 6, -0.6),
    hatch(10, 180, 390, 176, 26, 6, -0.6),
  ]),
  // Layer 2, the hobbit holes and cellars: a round tunnel with barrels and a shelf of jars (Bag End's cellars, book ch. 1).
  'layer-2': () => drawing([
    ['M40 250V130C40 50 360 50 360 130V250', 2],
    ['M60 250V134C60 72 340 72 340 134V250', 1.2, 'soft'],
    ['M0 250h400', 1.8],
    ['M90 250v-64c0-8 50-8 50 0v64M90 186c0 8 50 8 50 0M90 218h50', 1.4],
    ['M150 250v-64c0-8 50-8 50 0v64M150 186c0 8 50 8 50 0M150 218h50', 1.4],
    ['M120 186v-56c0-8 50-8 50 0v56M120 130c0 8 50 8 50 0M120 158h50', 1.4],
    ['M240 150h80M240 200h80M244 150v100M316 150v100', 1.5],
    ['M252 150v-14h12v14M272 150v-18h10v18M292 150v-12h14v12', 1.1],
    ['M252 200v-16h14v16M276 200v-12h10v12M296 200v-18h12v18', 1.1],
    [circle(200, 96, 10), 1.1],
    ['M200 106v10', 1],
    hatch(46, 140, 46, 245, 12, 8, -0.5),
    hatch(354, 140, 354, 245, 12, 8, -2.6),
  ]),
  // Layer 3, the trolls' cave: three trolls turned to stone at dawn (book ch. 2), their pot and the cave mouth.
  'layer-3': () => drawing([
    ['M0 60C60 40 110 70 150 50S260 30 300 56 380 40 400 50', 1.8],
    ['M0 250h400', 1.8],
    ['M60 250c-10-40-6-70 6-90 4-20 26-30 40-20 10-14 34-8 36 12 14 18 16 60 6 98', 1.8],
    ['M84 150c-4-16 6-26 18-24s18 14 12 24', 1.4],
    ['M168 250c-6-50 0-90 18-110 6-22 36-24 44-4 18 20 20 70 12 114', 1.8],
    ['M190 136c-2-18 10-28 22-24s16 16 8 26', 1.4],
    ['M268 250c-8-36-2-62 12-80 8-18 30-20 38-6 14 16 14 56 8 86', 1.8],
    ['M290 166c-2-14 8-22 18-18s12 12 6 20', 1.4],
    ['M120 250c0-16 30-22 40-12s0 16-4 12', 1.2],
    ['M126 230c4-10 26-10 30 0', 1],
    ['M232 250l14-12 10 12M240 250l6-20 6 20', 1],
    hatch(64, 170, 70, 240, 8, 8, -0.4),
    hatch(176, 160, 180, 240, 9, 8, -0.4),
    hatch(274, 180, 278, 240, 7, 8, -0.4),
  ]),
  // Layer 4, Goblin-town: wooden bridges and ladders over the chasm, torches (book ch. 4, the films' Goblin-town).
  'layer-4': () => drawing([
    ['M0 40C40 60 70 30 120 50S220 20 280 46 360 30 400 44', 1.6],
    ['M20 260V120M80 260V100M330 260V110M390 260V130', 1.6],
    ['M20 130h60M18 150h64', 1.3],
    ['M330 120h60M328 142h64', 1.3],
    ['M80 120C150 150 260 150 330 124', 1.6],
    ['M80 132C150 162 260 162 330 136', 1.1],
    ['M110 140v14M140 148v14M170 152v14M200 154v14M230 152v14M260 148v14M290 140v14', 0.9],
    ['M150 260l20-80M180 260l20-80M156 236h28M162 212h28M168 188h28', 1.2],
    ['M50 120v-24M46 96c-4-8 4-14 4-20 6 6 10 12 4 20', 1.2],
    ['M360 110v-24M356 86c-4-8 4-14 4-20 6 6 10 12 4 20', 1.2],
    ['M240 230c-10 0-12-12-4-16 2-8 14-8 16 0 8 4 6 16-4 16z', 1.1],
    hatch(30, 200, 70, 200, 6, 10, -1.2),
    hatch(338, 200, 380, 200, 6, 10, -1.2),
  ]),
  // Layer 5, Gollum's lake: still black water under the roots of the mountain, his rock island, his boat and two pale eyes (book ch. 5).
  'layer-5': () => drawing([
    ['M0 30C80 50 150 20 220 40S340 20 400 36', 1.6],
    ['M60 40l6 30 6-28M140 34l4 22 5-22M260 38l6 34 6-32M330 30l4 20 4-20', 1.1],
    ['M0 170C100 166 300 166 400 170', 1.6],
    ['M40 190h70M150 186h90M280 192h80M80 210h110M220 214h120M30 232h90M160 236h140', 0.9, 'soft'],
    ['M210 170c-4-30 14-46 40-44s40 20 36 44', 1.6],
    ['M236 140c4-6 12-6 16 0', 1],
    ['M110 168c10 8 50 8 60 0M114 168l6-8h44l6 8', 1.3],
    ['M138 160l-10-30', 1.1],
    [circle(242, 152, 3), 1.6],
    [circle(256, 152, 3), 1.6],
    hatch(214, 150, 286, 150, 10, 8, -1.3),
  ]),
  // Layer 6, the roots of Mirkwood: great tangled roots, cobwebs between them (book ch. 8, the films).
  'layer-6': () => drawing([
    ['M0 20C100 30 300 10 400 24', 1.6],
    ['M60 20C70 80 40 120 60 180S40 240 30 260', 2.4],
    ['M60 90C100 110 120 160 160 170S200 230 220 260', 1.8],
    ['M330 20C320 80 350 130 320 190S340 240 350 260', 2.4],
    ['M326 100C290 130 270 150 250 200', 1.6],
    ['M150 20c10 40-20 60 0 100', 1.4],
    ['M200 120m-40 0a40 40 0 1 0 80 0a40 40 0 1 0-80 0', 0.8, 'soft'],
    ['M200 120m-24 0a24 24 0 1 0 48 0a24 24 0 1 0-48 0', 0.8, 'soft'],
    ['M200 120m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 0.8, 'soft'],
    ['M150 80l100 80M250 80l-100 80M200 70v100M144 120h112', 0.7, 'soft'],
    ['M110 250c10-10 20-10 30 0s20 10 30 0', 1],
    hatch(62, 40, 56, 170, 10, 8, -0.4),
    hatch(326, 40, 330, 170, 10, 8, -2.7),
  ]),
  // Layer 7, beneath Lake-town: the town's wooden piles going down into the water, cross beams, a floating barrel (book ch. 10).
  'layer-7': () => drawing([
    ['M0 40h400M0 52h400', 1.6],
    ['M40 52V250M100 52V250M160 52V250M220 52V250M280 52V250M340 52V250', 1.6],
    ['M40 100L100 160M100 100L40 160M220 100L280 160M280 100L220 160', 1],
    ['M0 150C100 146 300 146 400 150', 1.4],
    ['M10 170h60M120 168h80M240 172h70M330 168h60M60 196h120M220 200h140', 0.9, 'soft'],
    ['M160 150c0-14 40-14 40 0v22c0 14-40 14-40 0z', 1.3],
    ['M160 160c10 4 30 4 40 0', 0.9],
    hatch(44, 60, 44, 140, 8, 6, -0.5),
    hatch(284, 60, 284, 140, 8, 6, -0.5),
  ]),
  // Layer 8, the mines of Erebor: tall carved pillars of the dwarves' hall, a squared door with runes, an anvil (book ch. 12, the films).
  'layer-8': () => drawing([
    ['M0 250h400', 1.8],
    ['M30 250V30M60 250V30M30 30h30M26 40h38M26 240h38', 1.5],
    ['M340 250V30M370 250V30M340 30h30M336 40h38M336 240h38', 1.5],
    ['M150 250V120L200 80L250 120V250', 1.8],
    ['M164 250V128L200 98L236 128V250', 1.1],
    ['M190 140l10-14 10 14M196 160v14M206 160v14M186 190l14 10 14-10', 1],
    ['M90 250v-30h50v30M80 220h70c4-12-4-18-14-18H96c-10 0-18 6-16 18z', 1.3],
    ['M280 250l10-40h30l10 40M290 210c4-10 26-10 30 0', 1.2],
    ['M300 200c-4-10 4-16 4-24 6 6 10 14 4 24', 1],
    hatch(34, 60, 34, 230, 12, 7, -0.5),
    hatch(344, 60, 344, 230, 12, 7, -0.5),
  ]),
  // Layer 9, Smaug's treasury: hills of gold, a cup and a crown in it, and the dragon's tail curled over the heap (book ch. 12).
  'layer-9': () => drawing([
    ['M0 250C40 200 90 170 140 190S220 150 270 170 360 190 400 210', 1.8],
    coins(10, 390, (x) => 230 - 40 * Math.sin((x / 400) * Math.PI), 34),
    ['M110 196l-6-26h24l-6 26zM104 170c0-6 24-6 24 0M112 196h12', 1.2],
    ['M290 176l4-16 8 10 6-14 6 14 8-10 4 16z', 1.2],
    ['M400 120C340 110 300 140 280 120S230 80 200 100 170 140 190 150', 2.2],
    ['M400 136C344 128 306 156 284 136S236 98 208 114 186 142 196 148', 1.4],
    ['M330 114l6-14 6 12M290 118l4-14 8 10M250 94l2-14 9 9M222 96l-2-13 10 7', 1.2],
    hatch(220, 104, 380, 124, 14, 7, -1.2),
  ]),
};

/** Character drawings for the credits (people of the book; the six player characters use ui/art.js portraitSVG). */
export const FIGURES = {
  // Gandalf: the tall pointed hat, the long beard, the staff (book ch. 1).
  gandalf: () => drawing([
    ['M50 10L30 62h40z', 1.6],
    ['M18 64c10-6 54-6 64 0', 1.6],
    ['M36 64c0 14 6 22 14 22s14-8 14-22', 1.3],
    ['M40 76c-2 30 4 48 10 58 6-10 12-28 10-58', 1.3],
    ['M44 70h4M54 70h4', 1.4],
    ['M30 90c-8 20-10 36-10 50M70 90c8 20 10 36 10 50', 1.3],
    ['M86 20v120', 1.8],
    ['M84 20c-4-6 0-12 4-10', 1.2],
  ], { view: '0 0 100 140', span: 1.6 }),
  // Gollum: thin, crouched, with large pale eyes (book ch. 5: "two big round pale eyes").
  gollam: () => drawing([
    [circle(50, 50, 20), 1.5],
    [circle(42, 48, 6), 1.4],
    [circle(58, 48, 6), 1.4],
    ['M42 62c4 3 12 3 16 0', 1.1],
    ['M30 46c-10-4-14 0-16 6M70 46c10-4 14 0 16 6', 1.2],
    ['M42 70c-6 16-6 30 2 40M58 70c6 16 6 30-2 40', 1.3],
    ['M44 82c-14 4-22 12-26 24M56 82c14 4 22 12 26 24', 1.2],
    ['M44 110c-10 6-14 14-16 24M56 110c10 6 14 14 16 24', 1.3],
  ], { view: '0 0 100 140', span: 1.6 }),
  // Smaug: the dragon's head in profile, horns and teeth (book ch. 12).
  szmaug: () => drawing([
    ['M10 90C20 60 50 50 70 56S92 70 96 80 80 92 64 92 40 100 30 120', 1.6],
    ['M60 92c8 6 22 8 34 2', 1.2],
    ['M66 92l3 6 3-6 3 6 3-6 3 6', 1],
    [circle(66, 70, 4), 1.4],
    ['M50 58L44 30 58 52M38 64L24 40 44 60', 1.4],
    ['M86 74c2-2 5-2 6 0', 1],
    ['M30 120c-4 6-6 12-6 18M16 100c-6 10-8 24-6 38', 1.2],
  ], { view: '0 0 100 140', span: 1.6 }),
  // Bard: the bowman of Lake-town with his great yew bow (book ch. 14).
  bard: () => drawing([
    [circle(46, 34, 13), 1.5],
    ['M34 30c2-14 22-16 26-2', 1.2],
    ['M46 47v50M46 60l-18 20M46 60l20 10', 1.4],
    ['M46 97l-12 36M46 97l12 36', 1.4],
    ['M70 18C92 50 92 100 70 132', 1.6],
    ['M70 18v114', 0.7],
    ['M66 72h-34', 1.2],
  ], { view: '0 0 100 140', span: 1.6 }),
};
