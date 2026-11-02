/* ==== ui/art.js — the HUD and menu drawings as inline SVG: plate, meal clock, sack, coins, tools, goods, portraits (TERV 0.12) ==== */

let uidN = 0;
/** A unique id prefix per drawing instance (masks and clip paths of two HUDs must not collide). */
export const uid = () => `u${++uidN}`;

/** '#rrggbb' from a 0xRRGGBB number (the character colours in player.js are numbers). */
export const hex = (n, fallback = '#6a5a3a') => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : n || fallback);

/** Circumference of the plate's food mask circle (r = 17). */
export const PLATE_C = 2 * Math.PI * 17;

/* ------------------------------------------------------------------------------------------------
   Hunger: a hobbit plate whose food is masked by a pie, and the meal clock
   ------------------------------------------------------------------------------------------------ */

/** The plate (West Farthing style crockery: cream glaze, blue rim). The `.pie` circle's dash array shows the food left. */
export function plateSVG(id) {
  return `<svg class="plate-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="${id}g" cx="42%" cy="38%" r="65%"><stop offset="0" stop-color="#fffaf0"/><stop offset=".65" stop-color="#ece2ca"/><stop offset="1" stop-color="#bfae88"/></radialGradient>
    <radialGradient id="${id}b" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e9b86a"/><stop offset="1" stop-color="#a86a2a"/></radialGradient>
    <mask id="${id}m"><circle class="pie" cx="50" cy="50" r="17" fill="none" stroke="#fff" stroke-width="34" stroke-dasharray="${PLATE_C} 200" transform="rotate(-90 50 50)"/></mask>
  </defs>
  <ellipse cx="51" cy="54" rx="47" ry="45" fill="#0007"/>
  <circle cx="50" cy="50" r="46" fill="url(#${id}g)" stroke="#7a6a4a" stroke-width="1.4"/>
  <circle cx="50" cy="50" r="41" fill="none" stroke="#3b62a0" stroke-width="1.6" stroke-dasharray="3 2.2" opacity=".8"/>
  <circle cx="50" cy="50" r="38.5" fill="none" stroke="#3b62a0" stroke-width=".8" opacity=".7"/>
  <circle cx="50" cy="50" r="35" fill="#f3ead6" stroke="#d6c8a6" stroke-width="1"/>
  <g mask="url(#${id}m)">
    <path d="M30 34c2-9 16-11 21-4 4 6-1 12-3 18l-14 2c-5-4-6-10-4-16z" fill="url(#${id}b)" stroke="#7a4a1a" stroke-width="1"/>
    <path d="M33 37c3-5 11-6 14-2" fill="none" stroke="#f6dca0" stroke-width="2"/>
    <ellipse cx="66" cy="38" rx="9" ry="7" fill="#c9a060" stroke="#7a5a2a" stroke-width="1"/>
    <ellipse cx="63" cy="36" rx="2" ry="1.4" fill="#8a6a36"/>
    <ellipse cx="70" cy="55" rx="8.5" ry="6.5" fill="#d0a868" stroke="#7a5a2a" stroke-width="1"/>
    <path d="M38 64c6 6 18 7 25 2" stroke="#8a3a22" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M40 63c6 5 16 6 22 2" stroke="#c86a44" stroke-width="2" stroke-linecap="round" fill="none" opacity=".7"/>
    <path d="M55 22c-6 0-8 5-8 5h16s-2-5-8-5z" fill="#d8c8a8" stroke="#6a5a3a" stroke-width=".8"/><rect x="53.5" y="26" width="3" height="5" fill="#efe6d0"/>
    <circle cx="30" cy="57" r="2.6" fill="#6aa040"/><circle cx="34" cy="60" r="2.6" fill="#5a9036"/><circle cx="29" cy="62" r="2.6" fill="#72a846"/>
  </g>
  <circle class="plate-warn" cx="50" cy="50" r="45" fill="none" stroke="#e04a2a" stroke-width="3"/>
</svg>`;
}

/** The seven hobbit meals (the films): the clock dial has one mark per meal. */
export const MEALS = ['Reggeli', 'Második reggeli', 'Tizenegyórai', 'Ebéd', 'Uzsonna', 'Vacsora', 'Késői vacsora'];

/** A small brass meal clock: seven marks (cup / plate icons), the `.hand` group rotates (CSS transform). */
export function mealClockSVG() {
  const marks = MEALS.map((_, i) => {
    const a = (i / MEALS.length) * Math.PI * 2 - Math.PI / 2;
    const x = 50 + Math.cos(a) * 33;
    const y = 50 + Math.sin(a) * 33;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 3 || i === 5 ? 5.2 : 3.6}" fill="#3a2410" stroke="#f3dc9a" stroke-width="1"/>`;
  }).join('');
  return `<svg class="clock-svg" viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="52" r="47" fill="#0006"/>
  <circle cx="50" cy="50" r="46" fill="#b48a3a" stroke="#5a3a12" stroke-width="2"/>
  <circle cx="50" cy="50" r="41" fill="#efe0b4" stroke="#8a6224" stroke-width="1.5"/>
  ${marks}
  <g class="hand"><path d="M50 50L47 20l3-6 3 6z" fill="#3a2410"/><circle cx="50" cy="50" r="5" fill="#8a6224" stroke="#3a2410" stroke-width="1.2"/></g>
</svg>`;
}

/**
 * daynight (NOTES-10-daynight): the time-of-day dial beside the plate, like the moon dial in a hobbit's mantel clock:
 * a brass rim, a sky disc that turns (`.tod-disc`: the day half with the sun, the night half with the moon and a few
 * stars) behind a fixed Shire hill line, so the sun rises on the left and sets on the right. `.tod-moon` takes the
 * phase path from moonPhasePath().
 */
export function todDialSVG(id) {
  return `<svg class="tod-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs><clipPath id="${id}t"><circle cx="50" cy="50" r="40"/></clipPath></defs>
  <circle cx="50" cy="52" r="47" fill="#0006"/>
  <circle cx="50" cy="50" r="46" fill="#b48a3a" stroke="#5a3a12" stroke-width="2"/>
  <g clip-path="url(#${id}t)">
    <g class="tod-disc">
      <path d="M10 50a40 40 0 0 1 80 0z" fill="#8fbde6"/>
      <path d="M10 50a40 40 0 0 0 80 0z" fill="#1a2748"/>
      <circle cx="50" cy="24" r="9" fill="#ffd25a" stroke="#c88a20" stroke-width="1.5"/>
      <g fill="#e8ecff"><circle cx="30" cy="66" r="1.2"/><circle cx="68" cy="70" r="1"/><circle cx="40" cy="84" r="1.1"/><circle cx="62" cy="86" r="0.9"/><circle cx="74" cy="60" r="0.8"/></g>
      <g transform="translate(50 76) rotate(180)"><circle r="8" fill="#2e3a5a" stroke="#8090b0" stroke-width="0.8"/><path class="tod-moon" d="" fill="#f2efd8"/></g>
    </g>
    <path d="M8 62c10-6 18-9 28-7s14 6 24 4 18-8 32-3v40H8z" fill="#5a7a32" stroke="#2e4618" stroke-width="1.5"/>
    <circle cx="44" cy="66" r="2.6" fill="#2f6a3a" stroke="#1e2a10" stroke-width="0.8"/>
  </g>
  <circle cx="50" cy="50" r="40" fill="none" stroke="#5a3a12" stroke-width="2"/>
</svg>`;
}

/**
 * The lit part of the moon (radius r, centred on 0,0) for phase index 0..7 (0 new, 4 full; waxing lit on the right).
 * Empty for the new moon.
 */
export function moonPhasePath(i, r = 8) {
  const f = (((i % 8) + 8) % 8) / 8;
  if (f === 0) return '';
  if (f === 0.5) return `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}z`;
  const rx = Math.abs(Math.cos(f * Math.PI * 2)) * r;
  const waxing = f < 0.5;
  const limb = waxing ? 1 : 0; // the lit limb: right side (waxing) or left side (waning), top to bottom
  // The terminator back from the bottom to the top: bulging towards the lit side for a crescent, away from it for a gibbous moon.
  const crescent = f < 0.25 || f > 0.75;
  const term = waxing === crescent ? 0 : 1;
  return `M0 ${-r}A${r} ${r} 0 0 ${limb} 0 ${r}A${rx.toFixed(2)} ${r} 0 0 ${term} 0 ${-r}z`;
}

/* ------------------------------------------------------------------------------------------------
   Bag and money
   ------------------------------------------------------------------------------------------------ */

const SACK = 'M38 24c-4 6-17 18-21 38-4 22 3 40 33 40s37-18 33-40c-4-20-17-32-21-38z';

/** The sack: `.sack-body` bulges (transform attribute), `.sack-fill` rises with the fill (y attribute). */
export function sackSVG(id) {
  return `<svg class="sack-svg" viewBox="0 0 100 110" aria-hidden="true">
  <defs>
    <clipPath id="${id}c"><path d="${SACK}"/></clipPath>
    <linearGradient id="${id}s" x1="0" x2="1"><stop offset="0" stop-color="#8a6a3c"/><stop offset=".45" stop-color="#cdb07a"/><stop offset="1" stop-color="#7a5a30"/></linearGradient>
  </defs>
  <ellipse cx="50" cy="104" rx="34" ry="5" fill="#0006"/>
  <g class="sack-body">
    <path d="${SACK}" fill="url(#${id}s)" stroke="#4a3216" stroke-width="2"/>
    <g clip-path="url(#${id}c)">
      <g class="sack-fill" transform="translate(0 80)">
        <rect x="0" y="22" width="100" height="90" fill="#5a3a1a" opacity=".45"/>
        <ellipse cx="34" cy="26" rx="9" ry="6" fill="#4a2e14" opacity=".55"/><ellipse cx="58" cy="24" rx="11" ry="7" fill="#4a2e14" opacity=".5"/><ellipse cx="72" cy="30" rx="7" ry="5" fill="#4a2e14" opacity=".5"/>
      </g>
      <path d="M30 50c10 4 30 4 40 0M24 76c14 5 38 5 52 0" fill="none" stroke="#5a4020" stroke-width="1.2" stroke-dasharray="3 3" opacity=".7"/>
    </g>
  </g>
  <path d="M36 25c4-3 24-3 28 0" fill="none" stroke="#3a2410" stroke-width="2"/>
  <path class="sack-tie" d="M36 22c5 4 23 4 28 0M50 24c-6 4-10 9-14 10M50 24c5 3 8 7 12 8" fill="none" stroke="#6a4a22" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M40 22c-2-6 2-10 10-10s12 4 10 10" fill="#b89a64" stroke="#4a3216" stroke-width="1.6"/>
</svg>`;
}

/** Up to eight coins, gold and silver, in a little heap; `.coin` elements are shown one by one as the money grows. */
export function coinsSVG(id) {
  const coin = (x, y, gold, i) => `<g class="coin" data-i="${i}"><ellipse cx="${x}" cy="${y + 2}" rx="15" ry="6" fill="${gold ? '#7a5410' : '#5a5a5e'}"/><ellipse cx="${x}" cy="${y}" rx="15" ry="6" fill="url(#${id}${gold ? 'g' : 's'})" stroke="${gold ? '#6a4808' : '#4a4a50'}" stroke-width="1"/><ellipse cx="${x}" cy="${y}" rx="9" ry="3.4" fill="none" stroke="${gold ? '#fff2b0' : '#f4f4f8'}" stroke-width=".8" opacity=".6"/></g>`;
  const spots = [[50, 82, 1], [32, 86, 0], [68, 86, 1], [50, 74, 1], [38, 78, 0], [62, 77, 1], [50, 66, 0], [56, 58, 1]];
  return `<svg class="coins-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset=".5" stop-color="#e2b23a"/><stop offset="1" stop-color="#9a6a14"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bfc2ca"/><stop offset="1" stop-color="#7a7e88"/></linearGradient>
  </defs>
  <ellipse cx="50" cy="92" rx="36" ry="6" fill="#0006"/>
  ${spots.map(([x, y, g], i) => coin(x, y, g, i)).join('')}
</svg>`;
}

/* ------------------------------------------------------------------------------------------------
   Items: tools per tier, ladder, tankard, rope, food, bags per tier, the full sack for selling
   ------------------------------------------------------------------------------------------------ */

/**
 * The tool of a tier, drawn diagonally (TERV Decision 13: every tier looks finer). 0 spade, 1 dwarf pick, 2 Bofur's
 * mattock, 3 the Erebor miner's pick (dark steel, gold bands with green enamel), 4 mithril pick.
 */
export function toolSVG(tier) {
  const t = Math.max(0, Math.min(4, tier | 0));
  const handle = t >= 2 ? '#4a2a14' : '#8a5a2c';
  const shaft = `<path d="M22 86L74 22" stroke="#0005" stroke-width="9" stroke-linecap="round" transform="translate(2 3)"/><path d="M22 86L74 22" stroke="${handle}" stroke-width="7" stroke-linecap="round"/><path d="M23 82L71 24" stroke="#fff3" stroke-width="2" stroke-linecap="round"/>`;
  if (t === 0) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${shaft.replace(/M22 86L74 22/g, 'M30 76L76 22')}
      <path d="M70 16h14" stroke="#6a4020" stroke-width="6" stroke-linecap="round"/>
      <path d="M14 70c4-10 14-14 22-8l4 4c4 8 0 18-10 22-8 2-18-6-16-18z" fill="#9aa0a6" stroke="#3a3c40" stroke-width="2"/>
      <path d="M20 72c3-6 9-8 13-5" fill="none" stroke="#e6eaee" stroke-width="2" opacity=".7"/></svg>`;
  }
  if (t === 1) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${shaft}
      <path d="M44 6c16 2 34 14 44 34-12-12-28-20-44-22z" fill="#6a6e74" stroke="#2a2c30" stroke-width="2"/>
      <path d="M44 6C34 14 28 26 30 40c6-10 12-16 20-20z" fill="#6a6e74" stroke="#2a2c30" stroke-width="2"/>
      <rect x="62" y="16" width="16" height="12" rx="2" transform="rotate(40 70 22)" fill="#3a3c40"/>
      <path d="M50 10c12 3 24 11 32 22" fill="none" stroke="#c8ccd2" stroke-width="1.5" opacity=".7"/></svg>`;
  }
  if (t === 2) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${shaft}
      <path d="M46 4c18 0 38 12 48 32-14-10-30-16-46-16z" fill="#7a7e84" stroke="#2a2c30" stroke-width="2"/>
      <path d="M48 20l-20 22 10 6 18-20z" fill="#7a7e84" stroke="#2a2c30" stroke-width="2"/>
      <rect x="61" y="13" width="18" height="16" rx="2" transform="rotate(40 70 21)" fill="#b8862a" stroke="#5a3a0a" stroke-width="1.5"/>
      <path d="M36 66l6 5M44 56l6 5" stroke="#c8962e" stroke-width="4"/>
      <path d="M54 8c14 2 26 10 34 20" fill="none" stroke="#dfe3e8" stroke-width="1.5" opacity=".7"/></svg>`;
  }
  if (t === 3) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${shaft.replace(/#4a2a14/g, '#3a2210')}
      <path d="M44 3c20 0 40 10 52 34-6-3-12-6-19-8-10-4-22-8-33-9z" fill="#3c424c" stroke="#15181c" stroke-width="2"/>
      <path d="M46 20l-16 20 12 8 14-18z" fill="#3c424c" stroke="#15181c" stroke-width="2"/>
      <rect x="60" y="13" width="20" height="17" rx="2" transform="rotate(40 70 21)" fill="#a8742e" stroke="#4a2a08" stroke-width="1.5"/>
      <path d="M36 66l6 5M44 56l6 5M28 76l6 5" stroke="#d8b04a" stroke-width="4.5"/>
      <path d="M36 66l6 5M44 56l6 5M28 76l6 5" stroke="#1e6a46" stroke-width="1.6"/>
      <path d="M52 8c16 1 30 9 39 22" fill="none" stroke="#8a96a6" stroke-width="1.5" opacity=".8"/></svg>`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${shaft}
    <defs><linearGradient id="mith" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#cfe0ee"/><stop offset="1" stop-color="#8aa0b8"/></linearGradient></defs>
    <path d="M42 4c18 2 38 14 50 36-14-12-30-20-48-22z" fill="url(#mith)" stroke="#4a5a6e" stroke-width="2"/>
    <path d="M42 4C32 12 26 24 28 40c6-10 12-16 22-20z" fill="url(#mith)" stroke="#4a5a6e" stroke-width="2"/>
    <rect x="62" y="15" width="16" height="13" rx="2" transform="rotate(40 70 21)" fill="#d8b04a" stroke="#6a4a0a" stroke-width="1.5"/>
    <path d="M56 12l4 4M64 16l2 5M74 22l2 4M36 22l3 4" stroke="#8fd8ff" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M56 12l4 4M64 16l2 5M74 22l2 4M36 22l3 4" stroke="#8fd8ff" stroke-width="6" stroke-linecap="round" opacity=".25"/>
    <path d="M30 76l6 5M38 66l6 5" stroke="#d8b04a" stroke-width="3.5"/></svg>`;
}

/** A wooden ladder. */
export function ladderSVG() {
  const rungs = [24, 40, 56, 72, 88].map((y) => `<path d="M34 ${y}h32" stroke="#7a4e24" stroke-width="5" stroke-linecap="round"/>`).join('');
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(-12 50 50)">
    <path d="M32 6v92M68 6v92" stroke="#0005" stroke-width="8" transform="translate(2 2)"/>
    ${rungs}<path d="M32 6v92M68 6v92" stroke="#a0703a" stroke-width="6.5" stroke-linecap="round"/><path d="M30.5 8v88M66.5 8v88" stroke="#e0b070" stroke-width="1.5" opacity=".6"/></g></svg>`;
}

/** An ale tankard (the counter at the Green Dragon). */
export function mugSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="46" cy="92" rx="28" ry="5" fill="#0006"/>
    <path d="M66 38c18 0 18 30 0 30" fill="none" stroke="#5a3a1a" stroke-width="7"/>
    <path d="M22 30h48v56c0 4-4 6-8 6H30c-4 0-8-2-8-6z" fill="#8a5a2a" stroke="#3a2410" stroke-width="2"/>
    <path d="M22 44h48M22 74h48" stroke="#c8a04a" stroke-width="4"/>
    <path d="M30 34v54M44 34v56M58 34v54" stroke="#5a3616" stroke-width="1.2" opacity=".7"/>
    <path d="M18 30c0-10 10-12 14-9 4-6 14-6 18-1 6-4 16-2 18 4 4 2 4 8 0 9H20c-3-1-3-2-2-3z" fill="#fff8e8" stroke="#c8b890" stroke-width="1.2"/></svg>`;
}

/** A coil of rope (climbing up and down). */
export function ropeSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="50" cy="88" rx="32" ry="7" fill="#0006"/>
    <ellipse cx="50" cy="70" rx="30" ry="14" fill="none" stroke="#8a6a3a" stroke-width="8"/>
    <ellipse cx="50" cy="58" rx="27" ry="12" fill="none" stroke="#a8844a" stroke-width="8"/>
    <ellipse cx="50" cy="47" rx="24" ry="10" fill="none" stroke="#c09a5a" stroke-width="8"/>
    <ellipse cx="50" cy="47" rx="24" ry="10" fill="none" stroke="#5a4020" stroke-width="8" stroke-dasharray="2 5" opacity=".5"/>
    <path d="M70 46c10-10 6-26 2-38" fill="none" stroke="#c09a5a" stroke-width="7" stroke-linecap="round"/>
    <path d="M70 46c10-10 6-26 2-38" fill="none" stroke="#5a4020" stroke-width="7" stroke-dasharray="2 5" opacity=".5"/></svg>`;
}

/**
 * The belay rope of the D-pad's down slot (NOTES-11-safety, NOTES-19-ui): a coil of dwarf rope with its free end
 * tied to an iron hook (book ch. 8: the dwarves' rope with a hook at the enchanted stream). A rope, not a ladder.
 */
export function belayRopeSVG() {
  const twist = 'stroke="#4a3418" stroke-dasharray="2.2 4.2" opacity=".55"';
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="44" cy="90" rx="30" ry="6" fill="#0006"/>
    <ellipse cx="42" cy="72" rx="28" ry="13" fill="none" stroke="#7e6034" stroke-width="7.5"/>
    <ellipse cx="42" cy="61" rx="26" ry="11.5" fill="none" stroke="#9c7a44" stroke-width="7.5"/>
    <ellipse cx="42" cy="51" rx="23" ry="10" fill="none" stroke="#b89254" stroke-width="7.5"/>
    <ellipse cx="42" cy="51" rx="23" ry="10" fill="none" stroke-width="7.5" ${twist}/>
    <ellipse cx="42" cy="61" rx="26" ry="11.5" fill="none" stroke-width="7.5" ${twist}/>
    <path d="M62 46c12-6 14-18 10-28" fill="none" stroke="#b89254" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M62 46c12-6 14-18 10-28" fill="none" stroke-width="6.5" ${twist}/>
    <path d="M66 20l12-4" stroke="#7e6034" stroke-width="5" stroke-linecap="round"/>
    <g transform="translate(78 14) rotate(18)" fill="none" stroke-linecap="round">
      <path d="M0 0v-8" stroke="#2a2a2c" stroke-width="6"/>
      <path d="M0 -8c-10 0-12-12-6-16M0 -8c10 0 12-12 6-16" stroke="#2a2a2c" stroke-width="5.5"/>
      <path d="M0 -8c-10 0-12-12-6-16M0 -8c10 0 12-12 6-16" stroke="#9a9a9e" stroke-width="1.8"/>
      <circle cx="0" cy="1.5" r="3.2" stroke="#2a2a2c" stroke-width="2.4"/>
    </g></svg>`;
}

/** A basket of provisions: bread, cheese, apples. */
export function basketSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="50" cy="92" rx="38" ry="6" fill="#0006"/>
    <path d="M22 50c0-30 56-30 56 0" fill="none" stroke="#7a5228" stroke-width="5"/>
    <path d="M28 46c4-12 18-14 24-6l-6 12z" fill="#d89848" stroke="#7a4a1a" stroke-width="1.5"/>
    <path d="M48 52l20-14 10 10-8 8z" fill="#f2d070" stroke="#a88020" stroke-width="1.5"/><circle cx="66" cy="47" r="2" fill="#c8a040"/>
    <circle cx="40" cy="52" r="7" fill="#b8302a" stroke="#6a1a14" stroke-width="1.2"/><circle cx="58" cy="56" r="6" fill="#8ab040" stroke="#4a6a1a" stroke-width="1.2"/>
    <path d="M14 54h72l-8 34H22z" fill="#a8783a" stroke="#4a3010" stroke-width="2"/>
    <path d="M18 64h64M20 74h60M22 84h56" stroke="#6a4a1a" stroke-width="1.6"/>
    <path d="M30 56v32M42 56v32M54 56v32M66 56v32" stroke="#6a4a1a" stroke-width="1.2" opacity=".7"/></svg>`;
}

/** The bag of a tier (Decision 13): 0 canvas sack, 1 leather bag, 2 dwarf backpack, 3 Bilbo's travelling pack. */
export function bagSVG(tier) {
  const t = Math.max(0, Math.min(3, tier | 0));
  if (t === 0) return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="92" rx="30" ry="5" fill="#0006"/><path d="${SACK}" transform="translate(0 -12)" fill="#cdb07a" stroke="#4a3216" stroke-width="2"/><path d="M38 12c5 4 19 4 24 0" stroke="#6a4a22" stroke-width="3" fill="none"/></svg>`;
  if (t === 1) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="92" rx="32" ry="5" fill="#0006"/>
      <path d="M30 26c0-14 40-14 40 0" fill="none" stroke="#4a2a12" stroke-width="5"/>
      <path d="M18 40c0-8 6-14 14-14h36c8 0 14 6 14 14v40c0 6-4 10-10 10H28c-6 0-10-4-10-10z" fill="#8a5428" stroke="#3a2010" stroke-width="2"/>
      <path d="M18 44c10 10 54 10 64 0v-4c0-8-6-14-14-14H32c-8 0-14 6-14 14z" fill="#a0683a" stroke="#3a2010" stroke-width="2"/>
      <rect x="44" y="48" width="12" height="10" rx="2" fill="#c8a04a" stroke="#5a3a0a" stroke-width="1.5"/>
      <path d="M24 80h52" stroke="#5a3418" stroke-width="1.5" stroke-dasharray="3 3"/></svg>`;
  }
  if (t === 2) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="94" rx="32" ry="5" fill="#0006"/>
      <rect x="20" y="8" width="60" height="16" rx="8" fill="#7a3a2a" stroke="#3a1a10" stroke-width="2"/><path d="M34 8v16M66 8v16" stroke="#3a2410" stroke-width="3"/>
      <path d="M22 30c0-6 4-8 10-8h36c6 0 10 2 10 8v54c0 6-4 8-10 8H32c-6 0-10-2-10-8z" fill="#5a4a32" stroke="#2a2014" stroke-width="2"/>
      <path d="M22 34h56v18c-18 6-38 6-56 0z" fill="#6e5a3c" stroke="#2a2014" stroke-width="2"/>
      <path d="M36 52v20M64 52v20" stroke="#3a2a18" stroke-width="4"/><rect x="31" y="66" width="10" height="8" fill="#9a9ca2" stroke="#3a3c40"/><rect x="59" y="66" width="10" height="8" fill="#9a9ca2" stroke="#3a3c40"/>
      <rect x="28" y="76" width="44" height="10" rx="3" fill="#4a3c28"/></svg>`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="94" rx="32" ry="5" fill="#0006"/>
    <path d="M32 24c0-16 36-16 36 0" fill="none" stroke="#5a3a1a" stroke-width="5"/>
    <path d="M16 36c0-8 6-12 14-12h40c8 0 14 4 14 12v46c0 6-4 10-10 10H26c-6 0-10-4-10-10z" fill="#3e5a2e" stroke="#1e2a14" stroke-width="2"/>
    <path d="M16 40c10 12 58 12 68 0v-4c0-8-6-12-14-12H30c-8 0-14 4-14 12z" fill="#4e6e38" stroke="#1e2a14" stroke-width="2"/>
    <path d="M26 46c8 5 40 5 48 0" fill="none" stroke="#d8b04a" stroke-width="1.6" stroke-dasharray="4 2"/>
    <circle cx="50" cy="52" r="5" fill="#d8b04a" stroke="#6a4a0a" stroke-width="1.5"/>
    <path d="M28 66c6 4 10 4 14 0s10-4 16 0 10 4 14 0" fill="none" stroke="#c8a04a" stroke-width="1.5"/></svg>`;
}

/** The full sack with finds peeking out (selling). */
export function sellSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="94" rx="34" ry="5" fill="#0006"/>
    <path d="M30 30c-8 8-18 20-18 36 0 18 12 28 38 28s38-10 38-28c0-16-10-28-18-36z" fill="#c4a670" stroke="#4a3216" stroke-width="2"/>
    <ellipse cx="50" cy="30" rx="21" ry="7" fill="#3a2410"/>
    <circle cx="40" cy="26" r="7" fill="#c9a060" stroke="#6a4a20"/><ellipse cx="56" cy="24" rx="7" ry="3" transform="rotate(-25 56 24)" fill="#e2b23a" stroke="#7a5410"/>
    <path d="M46 16l10 14" stroke="#cfd3da" stroke-width="3" stroke-linecap="round"/><ellipse cx="45" cy="15" rx="3" ry="4" fill="#cfd3da"/>
    <path d="M60 22l4-6 4 6-4 4z" fill="#3ec070" stroke="#1a6a3a"/>
    <path d="M28 60c14 6 30 6 44 0" fill="none" stroke="#5a4020" stroke-dasharray="3 3"/></svg>`;
}

/** The goods drawing of a shop row kind. */
export function goodsSVG(kind, tier = 0) {
  switch (kind) {
    case 'sell': return sellSVG();
    case 'food': return basketSVG();
    case 'ladder': return ladderSVG();
    case 'tool': return toolSVG(tier);
    case 'bag': return bagSVG(tier);
    default: return mugSVG();
  }
}

/* ------------------------------------------------------------------------------------------------
   Portraits for the character select (drawings in the characters' film colours)
   ------------------------------------------------------------------------------------------------ */

/** Per character: hair / beard style keys for the portrait. Unknown ids get a plain dwarf. */
const LOOKS = {
  bilbo: { hair: 'curls', beard: null, ears: true },
  thorin: { hair: 'long', beard: 'short', fur: true },
  balin: { hair: 'bald', beard: 'long-white' },
  bofur: { hair: 'hat', beard: 'moustache' },
  bombur: { hair: 'braid', beard: 'huge', wide: true },
  kili: { hair: 'long', beard: 'stubble' },
};

/**
 * A bust portrait of a character: coat, waistcoat, face, hair and beard from the character's colours.
 * @param {object} ch entry of CHARACTERS (id, coat, vest, hair, beard, color)
 */
export function portraitSVG(ch) {
  const L = LOOKS[ch.id] || { hair: 'long', beard: 'short' };
  const coat = hex(ch.coat);
  const vest = hex(ch.vest, '#8a6a3a');
  const hair = hex(ch.hair, '#4a3020');
  const beard = hex(ch.beard ?? ch.hair, hair);
  const w = L.wide ? 1.28 : 1;
  const skin = '#e8b894';
  const parts = [];
  // Shoulders and coat.
  parts.push(`<path d="M${50 - 40 * w} 140c0-30 ${12 * w} -46 ${40 * w} -46s${40 * w} 16 ${40 * w} 46z" fill="${coat}" stroke="#0008" stroke-width="1.5"/>`);
  parts.push(`<path d="M${50 - 14 * w} 96l${14 * w} 30l${14 * w} -30c-6-3-22-3-${28 * w} 0z" fill="${vest}"/>`);
  parts.push('<path d="M44 94l6 14 6-14z" fill="#efe6d4"/>');
  if (L.fur) parts.push(`<path d="M${50 - 34 * w} 104c10-14 58-14 68 0-8 6-60 6-68 0z" fill="#6a6058" stroke="#0006"/>`);
  // Hair behind the head.
  if (L.hair === 'long') parts.push(`<path d="M28 52c0-26 44-26 44 0v44c-6 4-10 0-12-6l-20 0c-2 6-6 10-12 6z" fill="${hair}"/>`);
  if (L.hair === 'braid') parts.push(`<path d="M30 50c0-22 40-22 40 0v14H30z" fill="${hair}"/>`);
  // Face.
  const fr = L.wide ? 25 : 21;
  parts.push(`<ellipse cx="50" cy="60" rx="${fr}" ry="25" fill="${skin}" stroke="#7a4a30" stroke-width="1"/>`);
  if (L.ears) parts.push(`<path d="M29 58c-7-6-9-16-6-20 5 2 8 10 8 16zM71 58c7-6 9-16 6-20-5 2-8 10-8 16z" fill="${skin}" stroke="#7a4a30" stroke-width="1"/>`);
  else parts.push(`<ellipse cx="${50 - fr}" cy="60" rx="4" ry="6" fill="${skin}" stroke="#7a4a30"/><ellipse cx="${50 + fr}" cy="60" rx="4" ry="6" fill="${skin}" stroke="#7a4a30"/>`);
  // Eyes, brows, nose.
  parts.push('<ellipse cx="42" cy="58" rx="2.4" ry="2.8" fill="#2a2018"/><ellipse cx="58" cy="58" rx="2.4" ry="2.8" fill="#2a2018"/>');
  parts.push(`<path d="M36 52q6-4 11 0M53 52q6-4 11 0" stroke="${L.beard === 'long-white' ? '#d8d4cc' : hair}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="M50 60c-2 6-4 9-1 11 2 1 4 0 5-1" fill="none" stroke="#9a6044" stroke-width="1.6"/>`);
  if (!L.beard || L.beard === 'stubble') parts.push('<path d="M43 75q7 5 14 0" stroke="#8a4a3a" stroke-width="1.8" fill="none"/>');
  // Beards.
  if (L.beard === 'stubble') parts.push(`<path d="M31 66c2 18 12 22 19 22s17-4 19-22c-4 8-10 12-19 12s-15-4-19-12z" fill="${beard}" opacity=".55"/>`);
  if (L.beard === 'short') parts.push(`<path d="M30 64c0 24 10 32 20 32s20-8 20-32c-4 10-10 12-20 12s-16-2-20-12z" fill="${beard}"/><path d="M42 74q8 4 16 0" stroke="#e8b894" stroke-width="1.5" fill="none" opacity=".5"/>`);
  if (L.beard === 'moustache') parts.push(`<path d="M50 70c-6-2-12 0-16 6l-4 20 6-2 2-16c4-4 8-4 12-4s8 0 12 4l2 16 6 2-4-20c-4-6-10-8-16-6z" fill="${beard}"/>`);
  if (L.beard === 'long-white') parts.push(`<path d="M28 62c-2 30 8 50 16 64l6-8 6 8c8-14 18-34 16-64-4 12-12 16-22 16s-18-4-22-16z" fill="${beard}" stroke="#a8a49c" stroke-width="1"/><path d="M42 76q8 4 16 0" stroke="#c8c4bc" stroke-width="1.6" fill="none"/>`);
  if (L.beard === 'huge') parts.push(`<path d="M22 60c-4 26 8 44 28 44s32-18 28-44c-6 14-14 18-28 18s-22-4-28-18z" fill="${beard}" stroke="#0004"/><path d="M30 96c-10 8-14 20-6 26 6 4 12-2 10-10M70 96c10 8 14 20 6 26-6 4-12-2-10-10" fill="none" stroke="${beard}" stroke-width="7" stroke-linecap="round"/>`);
  // Hair on top.
  if (L.hair === 'curls') parts.push(`<g fill="${hair}">${[[32, 44], [38, 37], [46, 34], [54, 34], [62, 37], [68, 44], [30, 52], [70, 52]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7"/>`).join('')}</g>`);
  if (L.hair === 'long') parts.push(`<path d="M28 56c0-26 44-26 44 0-6-12-14-16-22-16s-16 4-22 16z" fill="${hair}"/>`);
  if (L.hair === 'bald') parts.push(`<path d="M27 62c-2-10 2-16 6-18M73 62c2-10-2-16-6-18" stroke="#e8e6e0" stroke-width="6" fill="none" stroke-linecap="round"/><ellipse cx="46" cy="42" rx="6" ry="3" fill="#fff" opacity=".35"/>`);
  if (L.hair === 'braid') parts.push(`<path d="M26 54c0-24 48-24 48 0-8-10-16-14-24-14s-16 4-24 14z" fill="${hair}"/><path d="M50 30c0-6 2-10 6-12" stroke="${hair}" stroke-width="6" stroke-linecap="round"/>`);
  if (L.hair === 'hat') parts.push(`<path d="M24 52c-2-24 54-24 52 0-4-4-14-6-26-6s-22 2-26 6z" fill="#6a5a3a" stroke="#2a2010" stroke-width="1.5"/><path d="M26 50l-6 20 8 2 4-18zM74 50l6 20-8 2-4-18z" fill="#7a6a48" stroke="#2a2010" stroke-width="1.2"/><path d="M30 36c8-10 32-10 40 0" stroke="#4a3e28" stroke-width="2" fill="none"/>`);
  return `<svg viewBox="0 0 100 140" aria-hidden="true" preserveAspectRatio="xMidYMax meet">${parts.join('')}</svg>`;
}

/* ------------------------------------------------------------------------------------------------
   Death (Normal mode, TERV 0.12; NOTES-21-screens): the sack tears open and the finds spill out
   ------------------------------------------------------------------------------------------------ */

/**
 * The full sack that tears: the body stays, a jagged rip runs down its right side (`.ts-rip`, drawn in), the flap
 * (`.ts-flap`) swings open on its top corner and the finds (`.spill`) fall out. ui.css runs it (.dead.on), ≈ 1.2 s.
 */
export function tornSackSVG() {
  const rip = 'M150 52l6 6-4 10 8 8-6 12 10 10-4 14 12 10-2 14 8 6';
  return `<svg class="torn-svg" viewBox="0 0 240 170" aria-hidden="true">
  <defs>
    <linearGradient id="torn-g" x1="0" x2="1"><stop offset="0" stop-color="#6a4a26"/><stop offset=".4" stop-color="#c4a670"/><stop offset="1" stop-color="#7a5a30"/></linearGradient>
    <linearGradient id="torn-f" x1="0" x2="1"><stop offset="0" stop-color="#b8965c"/><stop offset="1" stop-color="#6a4a24"/></linearGradient>
  </defs>
  <ellipse class="ts-shadow" cx="122" cy="160" rx="92" ry="9" fill="#0009"/>
  <g class="ts-sack">
    <path d="M150 52C162 62 192 84 192 106c0 18-4 28-10 34L174 132l2-14-12-10 4-14-10-10 6-12-8-8 4-10z" fill="#1a0e06"/>
    <path d="M84 40C70 52 48 74 48 106c0 34 26 50 72 50 30 0 52-6 62-16l-8-6 2-14-12-10 4-14-10-10 6-12-8-8 4-10-6-6C138 44 100 40 84 40z" fill="url(#torn-g)" stroke="#3a2410" stroke-width="2.5"/>
    <path d="M62 92c18 6 46 6 70 0M58 124c20 7 50 7 76 2" fill="none" stroke="#5a4020" stroke-width="1.4" stroke-dasharray="4 3" opacity=".75"/>
    <path d="M84 40c8-6 64-6 72 0" fill="none" stroke="#3a2410" stroke-width="3"/>
    <path d="M92 36c-4-12 8-18 28-18s32 6 28 18" fill="#a88a5a" stroke="#3a2410" stroke-width="2"/>
    <path d="M100 30c6 4 34 4 40 0" fill="none" stroke="#8a2a1a" stroke-width="3"/>
    <path class="ts-rip" d="${rip}" pathLength="1" fill="none" stroke="#1a0c04" stroke-width="3" stroke-linejoin="round"/>
    <g class="ts-flap"><path d="M150 52C162 62 192 84 192 106c0 18-4 28-10 34L174 132l2-14-12-10 4-14-10-10 6-12-8-8 4-10z" fill="url(#torn-f)" stroke="#3a2410" stroke-width="2.5"/>
      <path d="M176 92c6 8 8 20 6 30" fill="none" stroke="#5a4020" stroke-width="1.4" stroke-dasharray="4 3" opacity=".7"/></g>
  </g>
  <g class="spill s1"><ellipse cx="168" cy="104" rx="10" ry="8" fill="#c9a060" stroke="#6a4a20"/></g>
  <g class="spill s2"><ellipse cx="172" cy="96" rx="8" ry="3" fill="#e2b23a" stroke="#7a5410"/></g>
  <g class="spill s3"><path d="M160 92l14 6" stroke="#cfd3da" stroke-width="3" stroke-linecap="round"/><ellipse cx="158" cy="91" rx="3" ry="4" fill="#cfd3da"/></g>
  <g class="spill s4"><circle cx="166" cy="112" r="4.5" fill="#b88a3a" stroke="#5a3a10"/></g>
  <g class="spill s5"><path d="M164 100l4-6 4 6-4 4z" fill="#3ec070" stroke="#1a6a3a"/></g>
  <g class="spill s6"><circle cx="170" cy="118" r="3.5" fill="#e2b23a" stroke="#7a5410"/></g>
  <g class="ts-dust"><circle cx="200" cy="150" r="10" fill="#8a7a60" opacity=".35"/><circle cx="214" cy="146" r="7" fill="#8a7a60" opacity=".3"/><circle cx="188" cy="154" r="6" fill="#8a7a60" opacity=".3"/></g>
</svg>`;
}

/**
 * NOTES-27-loose: armour tier 4, the mithril shirt (enemies/armour.js armourSVG(4) draws it; viewBox 100 × 100). The
 * book (ch. 13): "a small coat of mail … of silvered steel … with it went a belt of pearls and crystals"; the look of
 * NOTES-8-mithril-look: a close-knit bright silver mail shirt, long sleeves, a round neck, the hem at the upper hip, the
 * belt of pearls with a crystal every fourth place. No plate, no helmet, nothing added.
 */
export function mithrilShirtSVG() {
  const id = uid();
  const body = 'M36 14c4 4 24 4 28 0l14 6 12 30-8 4-8-22v42c0 4-3 6-6 6H32c-3 0-6-2-6-6V32l-8 22-8-4 12-30z';
  const rings = [];
  for (let y = 18; y < 86; y += 4.2) for (let x = 12 + ((Math.round(y / 4.2)) % 2) * 2.1; x < 90; x += 4.2) rings.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.7"/>`);
  const belt = [];
  for (let k = 0; k < 11; k++) {
    const x = 29 + k * 4.2;
    belt.push(k % 4 === 2
      ? `<path d="M${x.toFixed(1)} 69.5l2.2 2.5-2.2 2.5-2.2-2.5z" fill="#bfeaff" stroke="#3a6a8a" stroke-width=".7"/>`
      : `<circle cx="${x.toFixed(1)}" cy="72" r="1.9" fill="#f6f2ea" stroke="#9a948a" stroke-width=".6"/>`);
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="93" rx="30" ry="5" fill="#0006"/>
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#d4e2ee"/><stop offset="1" stop-color="#8ea2b8"/></linearGradient>
      <clipPath id="${id}c"><path d="${body}"/></clipPath></defs>
    <path d="${body}" fill="url(#${id}g)" stroke="#4a5a6e" stroke-width="2" stroke-linejoin="round"/>
    <g clip-path="url(#${id}c)" fill="none" stroke="#7d90a6" stroke-width=".8" opacity=".85">${rings.join('')}</g>
    <path d="M36 14c4 7 24 7 28 0" fill="none" stroke="#4a5a6e" stroke-width="2"/>
    <path d="M30 22c-2 10-2 30 0 44" stroke="#fff" stroke-width="2.5" opacity=".55" fill="none"/>
    ${belt.join('')}</svg>`;
}
