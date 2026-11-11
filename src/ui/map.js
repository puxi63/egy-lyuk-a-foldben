/* ==== ui/map.js — the map screen in the style of Thrór's map, and the moon letters (TERV 0.7, 0.12; NOTES-25) ====
 * A parchment sheet on Bilbo's desk with an ink drawing of the pit as a cross-section: Bag End's hill and the garden on
 * top, the nine layers below as bands with their names in the runes of Thrór's map and in Hungarian, the depth ranges,
 * the shaft down to the deepest point reached, the barrel lift's stops, the players, a mark for every famous find
 * already found, Durin's side door with the pointing hand (as on Thrór's map) and the red dragon over the treasury (the
 * map in the book has "a dragon in red" on the Mountain). Unexplored layers are dimmed.
 *
 * The moon letters (A hobbit, ch. 3): Elrond holds the map to the moonlight and finds letters that show only under a
 * moon "of the same shape and season" as the night they were written: a crescent moon on a midsummer's eve. The game
 * has no seasons (daynight.js: one moon phase per day, an 8-day cycle), so the rule here is the shape and the moon being
 * up: `dayClock.moonIndex() === 1` (növekvő sarló, the waxing crescent; the book does not say waxing or waning: one
 * shape had to be picked) [ellenőrizendő], from the evening (17:30) to midnight, when a young crescent stands in the
 * sky. Then the letters glow silver beside the door; otherwise nothing of them is drawn. The first reading writes the
 * mark 'holdbetuk' into the contract (ui/journal.js, saved) and gives every player the Durin's door hint once.
 *
 * Shown by ui/screens.js (shared, the game frozen) from the pause's "Térkép", the map key (input.js `mapPressed`:
 * B, the F2 player's Ú, a pad's left-stick click) or Bag End's Thrór's map in the study (bagend/effects.js).
 * Built only when opened (one innerHTML); display:none while hidden, so no cost then.
 * NOTES-42-hirelings: Ori's maps (the explored part of layers I–III, hirelings/survey.js) share Balin's plan helpers. ==== */
import { ORIGIN } from '../config.js';
import { findersOf } from '../finders.js';
import { FIND_TYPES } from '../finds.js';
import { LIFT_STOPS } from '../lift.js';
import { LAYER_BOTTOM, LAYER_NAMES, LAYER_TOPS } from '../materials.js';
import { BAG_END } from '../surface/bagend.js';
import { hex, moonPhasePath } from './art.js';
import { deviceOf } from './glyphs.js';
import { toRunes } from './runes.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
/** The moon phase index (daynight.js moonIndex) under which the moon letters can be read: the waxing crescent. */
export const MOON_LETTER_PHASE = 1;
/** Game hours of the night half in which the young crescent is up (from the evening to midnight). */
const MOON_FROM = 17.5;
const MOON_TO = 24;
/**
 * The moon letters' message, a free paraphrase of the book's (ch. 3: the grey stone, the thrush knocking, the setting
 * sun's last light of Durin's Day on the keyhole) [ellenőrizendő: the published Hungarian wording was not checked].
 * The same wording as erebor-puzzles' `durin` hint.
 */
export const MOON_TEXT = 'Ha a szürke kőnél kopog a rigó, Durin napján a lenyugvó nap utolsó fénye a kulcslyukra esik.';

/** Whether the moon letters can be read now (the rule in the header). */
export function moonLettersVisible(game) {
  const dc = game.dayClock;
  if (!dc) return false;
  const h = dc.hour();
  return dc.moonIndex() === MOON_LETTER_PHASE && h >= MOON_FROM && h < MOON_TO;
}

/** The famous finds per layer and how the game knows each was found (the same sources as the contract). */
const FAMOUS = [
  { layer: 2, label: 'Glamdring', found: (g, t) => t.has('glamdring') },
  { layer: 3, label: 'Bilbó réz gombjai', found: (g, t) => t.has('gombok') },
  { layer: 4, label: 'A Gyűrű', found: (g) => !!g.gollum?.ring?.found },
  { layer: 5, label: 'Orkrist', found: (g, t) => t.has('orkrist') },
  { layer: 6, label: 'Girion smaragdjai', found: (g, t) => t.has('girion') },
  { layer: 7, label: 'A törpék hárfái', found: (g, t) => t.has('harfak') },
  { layer: 7, label: 'Mithrilpáncél', found: (g, t) => t.has('mithril') || !!g.decor?.ereborFx?.mithrilTaken },
  { layer: 7, label: 'Thrór kulcsa', found: (g, t) => t.has('thror-kulcs') || !!g.ereborPuzzles?.state?.()?.key },
  { layer: 8, label: 'Az Arkenkő', found: (g, t) => t.has('arkenko') || !!g.hoard?.arkTaken },
];
// Every famous find type must have its mark (a new one added to finds.js shows up as a warning in the console).
for (const f of FIND_TYPES) if (f.famous && !FAMOUS.some((m) => m.label === f.name)) console.warn('map: no mark for famous find', f.id);

/* ---------------- the drawing's geometry (SVG user units) ---------------- */
const W = 1200;
const H = 780;
const SURF = 116; // the garden's line
const BAND0 = 132; // the first layer's top
const BAND = 70; // one layer's height on the map (equal bands: the deep layers would be slivers to scale)
const SHAFT = 372; // the shaft's x
const MARK_X = 470; // the first find mark's x
const MARK_DX = 196;

/** A layer's depth range. */
const range = (l) => [LAYER_TOPS[l], LAYER_TOPS[l + 1] ?? LAYER_BOTTOM];
/** Depth (m) → y on the map, band by band. */
export function depthY(d) {
  if (d <= 0) return SURF;
  for (let l = 0; l < LAYER_TOPS.length; l++) {
    const [a, b] = range(l);
    if (d < b || l === LAYER_TOPS.length - 1) return BAND0 + l * BAND + Math.min(1, (d - a) / (b - a)) * BAND;
  }
  return BAND0 + LAYER_TOPS.length * BAND;
}

/** A hand-drawn, slightly wavy line across the sheet at height y (fixed per seed, so the map does not shimmer). */
function wave(y, seed) {
  let d = `M36 ${y.toFixed(1)}`;
  for (let x = 96, k = 0; x <= W - 36; x += 60, k++) {
    const dy = Math.sin(seed * 2.3 + k * 1.7) * 2.6;
    d += ` Q${x - 30} ${(y + dy).toFixed(1)} ${x} ${(y + dy * 0.4).toFixed(1)}`;
  }
  return d;
}

/** A small star mark in red ink (a find found). */
const star = (x, y) => {
  let d = '';
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 4 : 10;
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    d += `${k ? 'L' : 'M'}${(x + Math.cos(a) * r).toFixed(1)} ${(y + Math.sin(a) * r).toFixed(1)}`;
  }
  return `<path class="m-star" d="${d}Z"/>`;
};

/** A barrel of the lift (on its side by the shaft). */
const barrel = (x, y, built) => `<g class="m-barrel${built ? ' b' : ''}" transform="translate(${x} ${y})"><rect x="-9" y="-6" width="18" height="12" rx="5"/><path d="M-4 -6v12M4 -6v12"/></g>`;

/** The red dragon of Thrór's map, in a few ink strokes. */
const DRAGON = `<g class="m-dragon" transform="translate(800 724) scale(0.95)">
  <path d="M-92 8C-62-12-32 18 0 0S52-22 72-8l18-6-6 10 10 4-14 2C60 6 40 12 20 15S-42 24-92 8z"/>
  <path d="M-22 4l-22-46 30 18 10-26 14 32 18-20-6 38z"/>
  <path class="ln" d="M-92 8c-18-4-26-14-20-24m0 0l-9 3 7 6M-30 18l-6 13M12 14l-2 14M78-12l4-8"/>
</g>`;

/** Bag End's hill with the round door, the garden line, a tree: the top of the sheet. */
const HILL = `<g class="m-hill">
  <path class="ln" d="M40 ${SURF}C90 ${SURF - 2} 110 60 200 56S300 ${SURF - 4} 330 ${SURF}"/>
  <circle class="m-door" cx="196" cy="${SURF - 18}" r="15"/><circle class="m-knob" cx="196" cy="${SURF - 18}" r="2.2"/>
  <path class="ln" d="M150 ${SURF - 6}h-26M240 ${SURF - 6}h26"/>
  <path class="ln" d="M980 ${SURF}v-30m0 10c-14-2-22-12-18-22 4-12 22-14 30-4 10-6 24 2 20 14 6 8-4 18-14 14"/>
</g>`;

/** The short name of a character ("Zsákos Bilbó" → "Bilbó"). */
const shortName = (name) => (name || '').split(' ').pop();

/**
 * NOTES-36-partner: the players on the shaft. Each one a dot in his colour at his depth with a little parchment flag
 * (the short name and the depth): player 1's flag left of the shaft, player 2's right of it; two dots at nearly the
 * same depth step aside a little. With two players a dashed line joins the dots.
 */
function whoSvg(players) {
  const list = players.map((p, slot) => ({ p, slot })).filter(({ p }) => !p.choosing);
  const ys = list.map(({ p }) => depthY(Math.max(0, p.depth || 0)));
  const close = list.length === 2 && Math.abs(ys[0] - ys[1]) < 10;
  const join = list.length === 2 ? `<path class="m-wholine" d="M${SHAFT} ${ys[0].toFixed(1)}V${ys[1].toFixed(1)}" stroke="#2a1406" stroke-width="1.6" stroke-dasharray="3 4" fill="none"/>` : '';
  return join + list.map(({ p, slot }, k) => {
    const y = ys[k];
    const col = hex(p.ch?.color, '#7a3a10');
    const cx = SHAFT + (close ? (slot ? 6 : -6) : 0);
    const name = shortName(p.ch?.name);
    const label = `${name} · ${Math.round(p.depth || 0)} m`;
    const wd = Math.round(label.length * 7.6 + 18);
    const left = list.length > 1 ? slot === 0 : false;
    const fx = left ? cx - 14 - wd : cx + 14;
    return `<g class="m-pl" data-slot="${slot}">
      <path d="M${cx} ${y.toFixed(1)}L${left ? fx + wd : fx} ${y.toFixed(1)}" stroke="${col}" stroke-width="2.4"/>
      <rect x="${fx}" y="${(y - 11).toFixed(1)}" width="${wd}" height="22" rx="4" fill="#efdfb6" stroke="${col}" stroke-width="2.4"/>
      <text class="m-pltx" x="${fx + wd / 2}" y="${(y + 5).toFixed(1)}" text-anchor="middle" style="font-size:15px">${label}</text>
      <circle class="m-who" cx="${cx}" cy="${y.toFixed(1)}" r="7" style="fill:${col}"><title>${p.ch?.name || ''}</title></circle>
    </g>`;
  }).join('');
}

/** NOTES-36-partner: the line under the map with both players' depths and their distance (empty in single play). */
function whoLine(game) {
  const list = game.players.filter((p) => !p.choosing);
  if (list.length < 2) return '';
  const [a, b] = list;
  // A player inside Bag End (its interior lies far off in the world, bagend/) counts as at the round door.
  const at = (p) => (game.bagEnd?.isInside?.(p) ? { x: BAG_END.x, y: 0, z: BAG_END.z } : p.pos);
  const pa = at(a);
  const pb = at(b);
  const d = Math.round(Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z));
  const dz = Math.round(Math.abs((a.depth || 0) - (b.depth || 0)));
  const dot = (p) => `<i style="display:inline-block;width:0.7em;height:0.7em;border-radius:50%;margin-right:0.3em;vertical-align:-0.05em;border:1px solid #2a1406;background:${hex(p.ch?.color, '#7a3a10')}"></i>`;
  const one = (p) => `${dot(p)}<b>${shortName(p.ch?.name)}</b> ${Math.round(p.depth || 0)} m mélyen`;
  return `${one(a)} · ${one(b)} · egymástól ${d} m${dz >= 1 ? ` (${dz} m szintkülönbség)` : ''}`;
}

/* ---------------- Balin's layer maps (NOTES-38-finders) ---------------- */
/** Where a bought layer's plans go: right of the shaft's stop labels, small squares in the band. */
const PX0 = 452;
const PLAN = 56; // a plan's side (the block's 24 × 24 m)
const PGAP = 14;
const PCELL = 0.5; // m per plan cell (the survey's grid)

/**
 * A bought layer's hollows (finders.js hollows: the generated caves, rooms and set pieces, not the dug tunnels) drawn as
 * Balin would: a row of small plans (seen from above, north up) of the layer cut into depth slices, each with its depth
 * range, the hollows in ink as merged runs of 0.5 m cells. Plus a note with the count.
 */
function hollowsSvg(finders, l, y, a, b) {
  const list = finders.hollows(l);
  const n = sliceCount(a, b);
  const grids = planGrids(n, (put) => {
    for (const h of list) {
      const p = h.pts;
      for (let i = 0; i < p.length; i += 3) put(p[i], p[i + 1], p[i + 2], a, b);
    }
  });
  const cols = planCols();
  const cw = PLAN / cols;
  const top = y + 9;
  let svg = '';
  grids.forEach((grid, k) => {
    const x0 = PX0 + k * (PLAN + PGAP);
    const d = planPath(grid, cols, x0, top, cols);
    const d0 = Math.round(a + ((b - a) * k) / n);
    const d1 = Math.round(a + ((b - a) * (k + 1)) / n);
    svg += `<g class="m-plan"><rect x="${x0}" y="${top}" width="${PLAN}" height="${PLAN}" fill="#e9d6a6" fill-opacity="0.55" stroke="#5a3a1a" stroke-width="0.9" stroke-dasharray="2 1.6"/>
      <path d="${d}" fill="none" stroke="#3a1e08" stroke-opacity="0.75" stroke-width="${(cw + 0.5).toFixed(2)}" stroke-linecap="round"/>
      <text x="${x0 + PLAN / 2}" y="${top - 1.6}" text-anchor="middle" style="font-size:8.5px;fill:#5a2a0a">${d0}–${d1} m</text></g>`;
  });
  const nx = PX0 + n * (PLAN + PGAP) - 4;
  const note = `<text class="m-bal" x="${nx}" y="${top + PLAN / 2 - 2}" style="font-size:12px;font-style:italic;fill:#5a2a0a">Balin térképe</text>
    <text x="${nx}" y="${top + PLAN / 2 + 12}" style="font-size:11px;font-style:italic;fill:#5a2a0a">${list.length} üreg és terem · É ↑</text>`;
  return `<g class="m-hollows" data-l="${l}">${svg}${note}</g>`;
}

/* NOTES-42-hirelings: the plan helpers Balin's maps and Ori's share. */
/** How many depth slices a layer's plans have. */
function sliceCount(a, b) {
  return Math.max(3, Math.min(7, Math.round((b - a) / 12)));
}

/** Cells per plan side (the block's 24 m at PCELL). */
function planCols() {
  return Math.round((-2 * ORIGIN.x) / PCELL);
}

/** n slice grids filled by `fill(put)`, where put(x, y, z, a, b) marks the world point's cell in its slice. */
function planGrids(n, fill) {
  const cols = planCols();
  const grids = Array.from({ length: n }, () => new Uint8Array(cols * cols));
  fill((x, y, z, a, b) => {
    const k = Math.floor(((-y - a) / (b - a)) * n);
    const cx = Math.floor((x - ORIGIN.x) / PCELL);
    const cz = Math.floor((z - ORIGIN.z) / PCELL);
    if (k >= 0 && k < n && cx >= 0 && cx < cols && cz >= 0 && cz < cols) grids[k][cz * cols + cx] = 1;
  });
  return grids;
}

/** A grid's ink as merged horizontal runs (rows 0 … rows − 1 only: a plan still being drawn). */
function planPath(grid, cols, x0, top, rows) {
  const cw = PLAN / cols;
  let d = '';
  for (let r = 0; r < rows; r++) {
    const ry = (top + (r + 0.5) * cw).toFixed(1);
    for (let c = 0; c < cols; c++) {
      if (!grid[r * cols + c]) continue;
      let e = c;
      while (e + 1 < cols && grid[r * cols + e + 1]) e++;
      d += `M${(x0 + c * cw + 0.25).toFixed(1)} ${ry}H${(x0 + (e + 1) * cw - 0.25).toFixed(1)}`;
      c = e;
    }
  }
  return d;
}

/**
 * NOTES-42-hirelings: Ori's map of a layer — the explored part (hirelings/survey.js: the air the players' tunnels reach)
 * in the same depth-slice plans as Balin's, in a reddish ink, drawn slice by slice as his work goes on (`H.ori[l]`, the
 * slice being drawn row by row from the north). Over Balin's plans when that layer's map was bought too.
 */
function oriSvg(H, l, y, a, b, withBalin) {
  const prog = H.ori[l] || 0;
  if (prog <= 0) return '';
  const sv = H.survey;
  if (!sv.ready) sv.runNow();
  const cells = sv.cells[l] || [];
  const n = sliceCount(a, b);
  const pt = {};
  const grids = planGrids(n, (put) => {
    for (let i = 0; i < cells.length; i++) {
      sv.pos(cells[i], pt);
      put(pt.x, pt.y, pt.z, a, b);
    }
  });
  const cols = planCols();
  const cw = PLAN / cols;
  const top = y + 9;
  const done = prog * n;
  let svg = '';
  grids.forEach((grid, k) => {
    if (k >= Math.ceil(done - 1e-9)) return;
    const rows = k < Math.floor(done + 1e-9) ? cols : Math.round((done - k) * cols);
    const x0 = PX0 + k * (PLAN + PGAP);
    const d = planPath(grid, cols, x0, top, rows);
    const frame = withBalin ? '' : `<rect x="${x0}" y="${top}" width="${PLAN}" height="${PLAN}" fill="#ecdcae" fill-opacity="0.5" stroke="#7a3a18" stroke-width="0.8"/>
      <text x="${x0 + PLAN / 2}" y="${top - 1.6}" text-anchor="middle" style="font-size:8.5px;fill:#5a2a0a">${Math.round(a + ((b - a) * k) / n)}–${Math.round(a + ((b - a) * (k + 1)) / n)} m</text>`;
    svg += `<g class="m-oplan">${frame}<path d="${d}" fill="none" stroke="#9a2a10" stroke-opacity="0.85" stroke-width="${(cw * 0.8).toFixed(2)}" stroke-linecap="round"/></g>`;
  });
  const nx = PX0 + n * (PLAN + PGAP) - 4;
  const ny = withBalin ? top + PLAN / 2 + 26 : top + PLAN / 2 - 2;
  const note = `<text class="m-ori" x="${nx}" y="${ny}" style="font-size:12px;font-style:italic;fill:#8a2a10">Ori térképe${prog < 1 ? ` · ${Math.round(prog * 100)} %` : ''}</text>
    ${withBalin ? '' : `<text x="${nx}" y="${ny + 14}" style="font-size:11px;font-style:italic;fill:#8a2a10">amerre jártatok · É ↑</text>`}`;
  return `<g class="m-orimap" data-l="${l}">${svg}${note}</g>`;
}

/** The pointing hand of Thrór's map (a cuff and a finger) aimed at the side door. */
/**
 * NOTES-44-pickup-edge: the edge of the world on the cross-section: hatched bedrock along both sides of the bands (from
 * the garden's line down) and under the last layer, with "a világ széle" in the map's runes and in Hungarian, and a
 * note in the bottom strip that no one digs past it.
 */
function edgeSvg() {
  const top = SURF + 6;
  const bot = BAND0 + 9 * BAND;
  const x0 = 20;
  const x1 = W - 20;
  const ew = 12;
  const hatch = (xa, xb) => {
    let d = '';
    for (let y = top; y < bot; y += 9) d += `M${xa} ${y + 9}L${xb} ${y}`;
    return d;
  };
  let bottom = '';
  for (let x = x0; x < x1; x += 9) bottom += `M${x} ${H - 12}L${x + 9} ${bot}`;
  const midY = top + (bot - top) * 0.4; // above the moon letters and Durin's door
  return `<g class="m-edge">
    <path class="m-ebed" d="M${x0} ${top}h${ew}V${bot}H${x0}zM${x1 - ew} ${top}h${ew}V${bot}h${-ew}zM${x0} ${bot}H${x1}V${H - 12}H${x0}z"/>
    <path class="m-ehat" d="${hatch(x0, x0 + ew)}${hatch(x1 - ew, x1)}${bottom}"/>
    <path class="m-eln" d="M${x0 + ew} ${top}V${bot}H${x1 - ew}V${top}"/>
    <text class="m-ru m-etx" transform="translate(${x1 - ew - 34} ${midY}) rotate(90)" text-anchor="middle">${toRunes('a világ széle')}</text>
    <text class="m-etx" transform="translate(${x1 - ew - 18} ${midY}) rotate(90)" text-anchor="middle">a világ széle · tovább nem lehet ásni</text>
  </g>`;
}

const hand = (x, y) => `<g class="m-hand" transform="translate(${x} ${y})"><path d="M-46-6h18l6-5h20c5 0 5 7 0 7h-10v2h12c4 0 4 6 0 6h-12v2h9c4 0 4 6 0 6h-24c-4 0-6-3-10-4h-9z"/><path class="ln" d="M-46-7v19"/></g>`;

export class MapView {
  /** @param {object} game  @param {HTMLElement} el the screen's element (filled on show) */
  constructor(game, el) {
    this.game = game;
    this.el = el;
    el.className = 'scr scr-map';
    this.readNow = false; // the moon letters were readable at the last show (QA)
    this.firstRead = false; // the last show was the first reading
  }

  /**
   * Shows the map. `opts.opener` the player index whose keys are shown; `opts.from` 'bagend' when opened at Bag End's
   * Thrór's map in the study. `onBack` closes it (ui/screens.js).
   */
  show(opts = {}, onBack = null) {
    this.onBack = onBack;
    this.opts = opts;
    const g = this.game;
    const visible = moonLettersVisible(g);
    this.readNow = visible;
    this.firstRead = false;
    if (visible) this.firstRead = this.read();
    this.el.innerHTML = this.html(visible);
    this.el.querySelector('.mp-back')?.addEventListener('click', () => this.onBack?.());
    this.el.classList.add('on');
  }

  hide() {
    this.el.classList.remove('on');
    this.el.innerHTML = ''; // nothing stays in the DOM while closed
  }

  /** Back, the pause key or the map key closes it. */
  input(it) {
    if (it.backPressed || it.pausePressed || it.mapPressed || it.confirmPressed) this.onBack?.();
  }

  /**
   * The moon letters read: the first time it marks the contract ('holdbetuk', saved with the journal) and gives every
   * player the Durin's door hint (tutorial.js hint: once per game). Returns true on the first reading.
   */
  read() {
    const g = this.game;
    const J = g.journal;
    if (!J || J.marks.has('holdbetuk')) return false;
    J.mark('holdbetuk');
    g.players.forEach((p, i) => {
      if (p.choosing) return;
      g.tutorial?.hint?.(i, p, `holdbetuk-${i}`, `<b style="color:var(--gold,#e8c070)">Holdbetűk!</b> A sarlós hold fényénél ezüstös írás tűnt elő Thrór térképén, Durin ajtaja mellett: „${MOON_TEXT}” Erebor tárnáiban (VIII. réteg) Durin ajtaja egy este nyílik meg: tükrökkel vezessétek a lenyugvó nap fényét a kulcslyukra, és keressétek Thrór kulcsát az ajtó előtt, a földben.`, 18);
    });
    return true;
  }

  /** The whole screen's HTML. */
  html(visible) {
    const g = this.game;
    const deepest = Math.round(g.journal?.deepest?.() ?? Math.max(0, ...g.players.map((p) => p.maxDepth || 0)));
    const trophies = new Set(g.bagEnd?.trophies || []);
    const built = g.lift?.built || new Set();
    const finders = findersOf(g); // NOTES-38-finders: Balin's layer maps bought
    const hire = g.hirelings?.ori?.some((v) => v > 0) ? g.hirelings : null; // NOTES-42-hirelings: Ori's maps
    const bands = LAYER_TOPS.map((top, l) => {
      const [a, b] = range(l);
      const y = BAND0 + l * BAND;
      const reached = l === 0 || deepest >= top;
      const name = LAYER_NAMES[l];
      const marks = FAMOUS.filter((f) => f.layer === l && f.found(g, trophies)).map((f, k) => {
        const x = MARK_X + k * MARK_DX;
        return `<g class="m-find">${star(x, y + 35)}<text x="${x + 16}" y="${y + 40}">${f.label}</text></g>`;
      }).join('');
      const stops = LIFT_STOPS.filter((s) => s.depth > 0 && s.depth >= a && (s.depth < b || l === LAYER_TOPS.length - 1)).map((s) => {
        const sy = depthY(s.depth);
        const has = built.has(s.id);
        return `${barrel(SHAFT + 26, sy, has)}<text class="m-stop${has ? ' b' : ''}" x="${SHAFT + 40}" y="${(sy + 4).toFixed(1)}">${s.depth} m</text>`;
      }).join('');
      // Durin's side door with the hand (Erebor's band), as on Thrór's map.
      const door = l === 7 ? `<g class="m-durin">${hand(1068, y + 40)}<path class="m-sdoor" d="M1086 ${y + 54}v-20c0-9 16-9 16 0v20z"/>
        <text class="m-ru" x="1094" y="${y + 14}" text-anchor="middle">${toRunes('Durin ajtaja')}</text><text class="m-lbl" x="1094" y="${y + 66}" text-anchor="middle">Durin ajtaja</text></g>` : '';
      return `<g class="m-band${reached ? '' : ' far'}" data-l="${l}">
        ${l ? `<path class="m-sep" d="${wave(y, l)}"/>` : ''}
        <text class="m-rom" x="48" y="${y + 30}">${ROMAN[l]}.</text>
        <text class="m-nm" x="96" y="${y + 30}">${name}</text>
        <text class="m-ru" x="96" y="${y + 50}">${toRunes(name)}</text>
        <text class="m-dep" x="${SHAFT - 26}" y="${y + 62}" text-anchor="end">${a}–${b} m${reached ? '' : ' · feltáratlan'}</text>
        ${finders.maps.has(l) ? hollowsSvg(finders, l, y, a, b) : ''}${hire ? oriSvg(hire, l, y, a, b, finders.maps.has(l)) : ''}${stops}${marks}${door}${l === 8 ? DRAGON : ''}
      </g>`;
    }).join('');
    const yDeep = depthY(deepest);
    const shaft = `<g class="m-shaft"><path class="m-hole" d="M${SHAFT - 7} ${SURF}V${yDeep.toFixed(1)}h14V${SURF}z"/><path class="ln" d="M${SHAFT - 7} ${SURF}V${yDeep.toFixed(1)}M${SHAFT + 7} ${SURF}V${yDeep.toFixed(1)}M${SHAFT - 9} ${yDeep.toFixed(1)}h18"/>
      <path class="m-dash" d="M${SHAFT} ${(yDeep + 4).toFixed(1)}V${BAND0 + 9 * BAND - 6}"/>${deepest >= 1 ? `<text class="m-deep" x="${SHAFT - 14}" y="${(yDeep + 4).toFixed(1)}" text-anchor="end">${deepest} m</text>` : ""}</g>`;
    const who = whoSvg(g.players);
    const pair = whoLine(g);
    // The moon letters (only when readable): silver runes beside Durin's door.
    const moon = visible ? this.moonSvg() : '';
    const dc = g.dayClock;
    const idx = dc ? dc.moonIndex() : 0;
    const moonName = dc ? dc.moonName() : '';
    const when = dc ? dc.phaseName() : '';
    const dev = deviceOf(g.bindings[this.opts?.opener ?? 0]);
    const mapKey = dev === 'pad' ? '<span class="pb pt">LS</span>' : dev === 'keys2' ? '<span class="k">Ú</span>' : '<span class="k">B</span>';
    const backKey = dev === 'pad' ? '<span class="pb pt">B</span>' : dev === 'keys2' ? '<span class="k kw">Backspace</span>' : '<span class="k">Esc</span>';
    const status = visible
      ? `<b>Ezüstös betűk derengenek a lapon!</b> Elrond olvasata: „${MOON_TEXT}”${this.firstRead ? ' <em>(Bekerült a szerződésbe.)</em>' : ''}`
      : 'Holdbetűk csak olyan alakú hold fényénél látszanak, amilyennél írták őket.';
    const where = this.opts?.from === 'bagend' ? 'Thrór térképe · Zsáklak dolgozószobájának falán' : 'Thrór térképének módjára';
    return `<div class="mp-desk">
      <div class="mp-sheet">
        <svg class="mp-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="A gödör térképe">
          <defs><filter id="mp-glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g class="m-title"><text class="m-ru big" x="${W / 2}" y="40" text-anchor="middle">${toRunes('a gödör rétegei')}</text>
            <text class="m-tt" x="${W / 2}" y="72" text-anchor="middle">A gödör rétegei</text><text class="m-sub" x="${W / 2}" y="92" text-anchor="middle">${where}</text></g>
          <path class="m-surf" d="${wave(SURF, 0)}"/>
          ${HILL}
          <text class="m-lbl" x="196" y="40" text-anchor="middle">Zsáklak</text>
          ${bands}
          ${edgeSvg()}
          <path class="m-frame" d="M18 18H${W - 18}V${H - 10}H18z"/>
          ${shaft}${who}${moon}
        </svg>
      </div>
      <div class="mp-bar">
        <div class="mp-moon"><svg viewBox="-11 -11 22 22" aria-hidden="true"><circle r="9.5" class="mm-dark"/><path class="mm-lit" d="${moonPhasePath(idx, 9.5)}"/></svg>
          <span><b>${moonName}</b><small>${when}</small></span></div>
        <div class="mp-mid"><p class="mp-status${visible ? ' lit' : ''}">${status}</p>${pair ? `<p class="mp-pair" style="margin:0.3rem 0 0;text-align:center;font-size:clamp(0.75rem, 1.1vw, 0.95rem);color:#f3e6c4">${pair}</p>` : ''}</div>
        <div class="mp-keys">${mapKey}<span class="or">/</span>${backKey}<span>vissza</span><button class="mp-back" type="button">Vissza</button></div>
      </div>
    </div>`;
  }

  /** The silver moon letters (runes of the message, a few lines) beside Durin's door. */
  moonSvg() {
    const words = toRunes(MOON_TEXT).split('᛫');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (cur && (cur.length + w.length + 1) > 30) {
        lines.push(cur);
        cur = w;
      } else cur = cur ? `${cur}᛫${w}` : w;
    }
    if (cur) lines.push(cur);
    const y0 = BAND0 + 6 * BAND + 12;
    return `<g class="m-moon" filter="url(#mp-glow)">${lines.map((t, k) => `<text x="1166" y="${y0 + k * 17}" text-anchor="end">${t}</text>`).join('')}</g>`;
  }
}
