/* ==== wheel/art.js — the action wheel's slice drawings (NOTES-43-wheel), in the style of ui/art.js (100 × 100 viewBox,
   a soft ground shadow, ink outlines). The ladder, the belay rope, the provisions and the lamp come from ui/art.js; the
   charge is a copy of exits.js's private counter drawing (not exported there); the Eagle, the stone and the knock are
   new. ==== */
import { basketSVG, belayRopeSVG, ladderSVG, shimmerLampSVG } from '../ui/art.js';

/** Gandalf's charge: a bundle of his fireworks with a gold band and a fuse (the same drawing as the counter's row). */
function chargeSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="90" rx="28" ry="5" fill="#0006"/>
    <g stroke="#4a1418" stroke-width="2"><rect x="30" y="40" width="14" height="48" rx="3" fill="#b8323a"/>
    <rect x="56" y="40" width="14" height="48" rx="3" fill="#b8323a"/><rect x="43" y="34" width="14" height="54" rx="3" fill="#c8424a"/></g>
    <path d="M28 62h44" stroke="#e8c050" stroke-width="6"/>
    <text x="50" y="80" font-size="11" text-anchor="middle" fill="#f4e6c0" font-family="serif">G</text>
    <path d="M50 34q2-10 10-14t8-10" stroke="#2a2018" stroke-width="2.5" fill="none"/>
    <g fill="#ffd27a"><circle cx="68" cy="10" r="4"/><circle cx="78" cy="6" r="2"/><circle cx="74" cy="18" r="1.8"/><circle cx="60" cy="6" r="1.6"/></g></svg>`;
}

/** One of the Eagles, wings spread, seen from below. */
function eagleSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="92" rx="30" ry="4.5" fill="#0005"/>
    <path d="M50 30c-6-2-10 2-12 6-10-6-24-8-34-4 6 2 10 6 12 10-4 0-7 2-8 5 8-1 16 1 22 5l8 2-4 16 8-6 4 10 4-10 8 6-4-16 8-2c6-4 14-6 22-5-1-3-4-5-8-5 2-4 6-8 12-10-10-4-24-2-34 4-2-4-6-8-12-6z"
      fill="#7a5630" stroke="#2a1a0c" stroke-width="2" stroke-linejoin="round"/>
    <path d="M20 38c8 0 16 3 22 8M80 38c-8 0-16 3-22 8M26 46c6 0 12 2 16 5M74 46c-6 0-12 2-16 5" fill="none" stroke="#c8a062" stroke-width="1.6" opacity=".8"/>
    <path d="M46 28c1-5 7-5 8 0l-1 5h-6z" fill="#efe2c4" stroke="#2a1a0c" stroke-width="1.6"/>
    <path d="M48 33l2 4 2-4z" fill="#e8b030" stroke="#2a1a0c" stroke-width="1"/></svg>`;
}

/** A throwing stone (Bilbo's stones from the book's chapter of the spiders). */
function stoneSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="86" rx="30" ry="6" fill="#0006"/>
    <path d="M24 66c-4-14 6-30 22-34 16-4 32 2 34 18 2 14-8 28-26 30-16 2-26-2-30-14z" fill="#8a847a" stroke="#2e2a24" stroke-width="2.5"/>
    <path d="M32 52c6-10 18-14 28-12" fill="none" stroke="#c8c2b6" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    <path d="M44 70c8 2 18 0 24-6" fill="none" stroke="#5a554c" stroke-width="2" opacity=".7"/>
    <path d="M12 30l10 6M8 44l11 2M20 18l7 9" stroke="#e8c070" stroke-width="3" stroke-linecap="round"/></svg>`;
}

/** Knocking on the wall: a fist on the stone, the echo's rings going into it. */
function knockSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="92" rx="30" ry="4.5" fill="#0005"/>
    <path d="M62 8h30v84H62z" fill="#7a6a54" stroke="#2e2418" stroke-width="2.5"/>
    <path d="M62 30h30M62 54h30M62 76h30M76 8v22M70 30v24M84 54v22" stroke="#4a3e2e" stroke-width="2"/>
    <path d="M18 40c0-6 6-8 10-6 2-5 9-5 11 0 3-4 10-3 11 2 4-2 9 1 9 6v18c0 8-6 12-14 12H30c-8 0-12-6-12-12z" fill="#e2b48a" stroke="#4a2a14" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M28 34v12M39 34v12M50 36v10" stroke="#4a2a14" stroke-width="2"/>
    <path d="M10 56h10" stroke="#4a2a14" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M70 38q8 12 0 24M78 32q12 18 0 36" fill="none" stroke="#f0d070" stroke-width="3" stroke-linecap="round"/></svg>`;
}

/** The drawing of each slice by id (src/wheel/slices.js). */
export const SLICE_ART = {
  ladder: () => ladderSVG(),
  eagles: () => eagleSVG(),
  charge: () => chargeSVG(),
  tap: () => knockSVG(),
  eat: () => basketSVG(),
  lamp: () => shimmerLampSVG(0),
  stone: () => stoneSVG(),
  rope: () => belayRopeSVG(),
};
