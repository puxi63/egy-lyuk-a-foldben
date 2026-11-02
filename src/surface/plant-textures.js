/* ==== surface/plant-textures.js — painted textures for the living Shire: the leaf-cluster card of the trees, the bark,
   and the flora atlas (16 alpha-cut plant cards: cottage flowers, vegetables, verge grasses and weeds) ==== */
import { rng } from './kit.js';
import { canvas, finish, wrapDraw } from './textures.js';

/**
 * The flora atlas cells (4 × 4 cards of 256 px). Cards marked `tint` paint their blooms near-white: the flora
 * material colours white texels by the vertex colour (so one hollyhock card gives pink, crimson and cream spikes).
 * `h` is the plant's natural height in metres and `aspect` the card's width / height.
 */
export const FLORA = {
  daisy: { cell: 0, h: 0.32, aspect: 1.1, tint: true },
  hollyhock: { cell: 1, h: 1.5, aspect: 0.55, tint: true },
  lavender: { cell: 2, h: 0.5, aspect: 1.1 },
  cottage: { cell: 3, h: 0.45, aspect: 1.1, tint: true },
  foxglove: { cell: 4, h: 0.95, aspect: 0.6, tint: true },
  lupin: { cell: 5, h: 0.75, aspect: 0.8, tint: true },
  leafy: { cell: 6, h: 0.42, aspect: 1.2 },
  rose: { cell: 7, h: 0.9, aspect: 1.0, tint: true },
  carrot: { cell: 8, h: 0.32, aspect: 1.0 },
  bean: { cell: 9, h: 1.9, aspect: 0.42 },
  potato: { cell: 10, h: 0.48, aspect: 1.2, tint: true },
  grass: { cell: 11, h: 0.6, aspect: 1.1 },
  poppy: { cell: 12, h: 0.55, aspect: 1.0 },
  meadow: { cell: 13, h: 0.28, aspect: 1.2, tint: true },
  dock: { cell: 14, h: 0.45, aspect: 1.2 },
  fern: { cell: 15, h: 0.6, aspect: 1.2 },
};

/** UV rectangle [u, v, w, h] of a flora cell (v from the bottom), inset 2 px so the mipmaps do not bleed. */
export function floraRect(cell) {
  const col = cell % 4;
  const row = 3 - Math.floor(cell / 4);
  const e = 2 / 1024;
  return [col / 4 + e, row / 4 + e, 1 / 4 - 2 * e, 1 / 4 - 2 * e];
}

/* ---- small painting helpers (canvas y grows downwards) ---- */

function hsl(h, s, l, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/** A curved stem from (x0, y0) to (x1, y1) bowed by `bow` pixels. */
function stem(g, x0, y0, x1, y1, w, color, bow = 0) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) / 2 + bow, (y0 + y1) / 2, x1, y1);
  g.stroke();
}

/** A pointed leaf from its base along angle `a` (radians, 0 = right, −π/2 = up), with a lighter midrib. */
function leaf(g, x, y, len, wid, a, color, rib = true) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.35, -wid, len, 0);
  g.quadraticCurveTo(len * 0.35, wid, 0, 0);
  g.fill();
  if (rib) {
    g.strokeStyle = 'rgba(230,240,190,0.35)';
    g.lineWidth = Math.max(0.6, wid * 0.12);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.85, 0);
    g.stroke();
  }
  g.restore();
}

/** A round or heart-shaped leaf (hollyhock, bean, dock). */
function roundLeaf(g, x, y, r, a, color) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(r * 0.2, -r * 1.1, r * 1.6, -r * 0.9, r * 1.7, 0);
  g.bezierCurveTo(r * 1.6, r * 0.9, r * 0.2, r * 1.1, 0, 0);
  g.fill();
  g.strokeStyle = 'rgba(20,40,10,0.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(r * 1.5, 0);
  g.stroke();
  g.restore();
}

/** A bloom: `n` petals round a centre; `cup` > 0 squashes it vertically (seen from the side). */
function bloom(g, x, y, r, n, petal, centre, cup = 1, rot = 0) {
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * Math.PI * 2;
    g.fillStyle = petal[k % petal.length];
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55 * cup, r * 0.5, r * 0.3 * (0.6 + 0.4 * cup), a, 0, Math.PI * 2);
    g.fill();
  }
  if (centre) {
    g.fillStyle = centre;
    g.beginPath();
    g.arc(x, y, r * 0.28, 0, Math.PI * 2);
    g.fill();
  }
}

/** Greens of the flora (light, mid, dark) with a small random spread. */
function green(rand, l0 = 26, l1 = 46, h0 = 82, h1 = 112) {
  return hsl(h0 + rand() * (h1 - h0), 34 + rand() * 26, l0 + rand() * (l1 - l0));
}

/** White-ish bloom shades (tinted by the vertex colour in the flora material). */
const WHITE = ['#f6f6f2', '#ecece6', '#dcdcd4', '#fafaf6'];

/* ---- the 16 cards ---- */

const PAINT = [
  // 0 daisy: a low clump of leaves with white daisies and yellow eyes.
  (g, S, rand) => {
    for (let i = 0; i < 26; i++) leaf(g, S * (0.2 + rand() * 0.6), S, S * (0.18 + rand() * 0.16), 6 + rand() * 4, -Math.PI / 2 + (rand() - 0.5) * 2.4, green(rand));
    for (let i = 0; i < 13; i++) {
      const x = S * (0.12 + rand() * 0.76);
      const y = S * (0.25 + rand() * 0.45);
      stem(g, S * (0.35 + rand() * 0.3), S, x, y, 2, green(rand, 30, 40), (rand() - 0.5) * 30);
      bloom(g, x, y, 15 + rand() * 7, 12, WHITE, '#e8b020', 0.7 + rand() * 0.3, rand());
    }
  },
  // 1 hollyhock: big round leaves low down, two tall spikes of cup blooms.
  (g, S, rand) => {
    for (let i = 0; i < 9; i++) roundLeaf(g, S * (0.3 + rand() * 0.4), S * (0.78 + rand() * 0.2), 16 + rand() * 10, -Math.PI / 2 + (rand() - 0.5) * 2.6, green(rand, 22, 38));
    for (const x0 of [0.38, 0.62]) {
      const x = S * (x0 + (rand() - 0.5) * 0.08);
      const top = S * (0.04 + rand() * 0.08);
      stem(g, x, S, x + (rand() - 0.5) * 10, top, 4, green(rand, 28, 36));
      for (let y = S * 0.82; y > top + 6; y -= 15 + rand() * 6) {
        const t = (y - top) / (S * 0.8);
        if (rand() < 0.3) leaf(g, x, y, 22 * t + 8, 7, rand() < 0.5 ? -0.5 : Math.PI + 0.5, green(rand, 26, 40));
        const r = 7 + 17 * Math.min(1, t * 1.3);
        if (t < 0.12) {
          g.fillStyle = green(rand, 34, 44);
          g.beginPath();
          g.ellipse(x, y, r * 0.5, r * 0.6, 0, 0, Math.PI * 2);
          g.fill();
        } else bloom(g, x + (rand() - 0.5) * 8, y, r, 6, WHITE, '#c8c070', 0.85, rand());
      }
    }
  },
  // 2 lavender: a grey-green cushion with many thin purple spikes.
  (g, S, rand) => {
    for (let i = 0; i < 40; i++) leaf(g, S * (0.25 + rand() * 0.5), S, S * (0.12 + rand() * 0.12), 2.5, -Math.PI / 2 + (rand() - 0.5) * 2.2, hsl(95 + rand() * 20, 14 + rand() * 12, 40 + rand() * 14), false);
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI / 2 + (rand() - 0.5) * 1.5;
      const len = S * (0.5 + rand() * 0.38);
      const x0 = S * (0.42 + rand() * 0.16);
      const x1 = x0 + Math.cos(a) * len;
      const y1 = S + Math.sin(a) * len;
      stem(g, x0, S, x1, y1, 1.6, hsl(90, 14, 46));
      for (let k = 0; k < 8; k++) {
        const t = 1 - k * 0.035;
        g.fillStyle = hsl(262 + rand() * 18, 38 + rand() * 20, 42 + rand() * 18);
        g.beginPath();
        g.ellipse(x0 + (x1 - x0) * t, S + (y1 - S) * t, 3.4, 5, a + Math.PI / 2, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
  // 3 cottage: a mounded plant covered in five-petal blooms (marigolds, geraniums, pinks: tinted).
  (g, S, rand) => {
    for (let i = 0; i < 46; i++) leaf(g, S * (0.15 + rand() * 0.7), S * (0.75 + rand() * 0.25), S * (0.12 + rand() * 0.14), 7 + rand() * 4, -Math.PI / 2 + (rand() - 0.5) * 2.8, green(rand));
    for (let i = 0; i < 24; i++) {
      const a = rand() * Math.PI;
      const rr = S * (0.15 + rand() * 0.3);
      const x = S * 0.5 + Math.cos(a) * rr * 1.2;
      const y = S * 0.88 - Math.sin(a) * rr * 1.3;
      stem(g, S * 0.5, S, x, y + 6, 1.6, green(rand, 30, 38));
      bloom(g, x, y, 12 + rand() * 8, 5 + Math.floor(rand() * 3), WHITE, rand() < 0.5 ? '#c09030' : '#a07040', 0.8, rand() * 6);
    }
  },
  // 4 foxglove: a rosette and one tall spike of hanging bells on one side.
  (g, S, rand) => {
    for (let i = 0; i < 12; i++) leaf(g, S * 0.5, S, S * (0.22 + rand() * 0.12), 12, -Math.PI / 2 + (rand() - 0.5) * 2.6, green(rand, 24, 38));
    for (const x0 of [0.45, 0.6]) {
      const x = S * x0;
      const top = S * (0.04 + rand() * 0.1);
      stem(g, x, S * 0.9, x, top, 3, green(rand, 30, 36));
      for (let y = S * 0.7; y > top; y -= 11) {
        const t = (y - top) / (S * 0.66);
        const r = 5 + 9 * t;
        g.fillStyle = WHITE[Math.floor(rand() * 4)];
        g.beginPath();
        g.ellipse(x + r * 0.7, y, r * 0.9, r * 0.55, 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(120,90,110,0.45)';
        g.beginPath();
        g.arc(x + r * 1.2, y + r * 0.2, r * 0.25, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
  // 5 lupin: palmate leaves and three dense conical spikes.
  (g, S, rand) => {
    for (let i = 0; i < 9; i++) {
      const x = S * (0.25 + rand() * 0.5);
      const y = S * (0.7 + rand() * 0.25);
      for (let k = 0; k < 7; k++) leaf(g, x, y, 22, 4, -Math.PI + (k / 6) * Math.PI, green(rand, 26, 40), false);
    }
    for (const x0 of [0.32, 0.5, 0.68]) {
      const x = S * (x0 + (rand() - 0.5) * 0.06);
      const top = S * (0.06 + rand() * 0.14);
      const bot = S * 0.62;
      stem(g, x, S * 0.85, x, top, 3, green(rand, 30, 36));
      for (let y = bot; y > top; y -= 6) {
        const t = (y - top) / (bot - top);
        const w = 4 + 13 * t;
        for (const s of [-1, 1]) {
          g.fillStyle = WHITE[Math.floor(rand() * 4)];
          g.beginPath();
          g.ellipse(x + s * w * 0.55, y, w * 0.45, 3.6, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  },
  // 6 leafy: a bushy clump of mixed leaves (fills the beds between the flowers).
  (g, S, rand) => {
    for (let i = 0; i < 70; i++) {
      const a = -Math.PI / 2 + (rand() - 0.5) * 2.9;
      const len = S * (0.18 + rand() * 0.3);
      const x = S * (0.3 + rand() * 0.4);
      const ex = x + Math.cos(a) * len * 0.6;
      const ey = S + Math.sin(a) * len * 0.6;
      stem(g, x, S, ex, ey, 1.5, green(rand, 26, 34));
      leaf(g, ex, ey, 18 + rand() * 18, 7 + rand() * 5, a + (rand() - 0.5) * 0.8, green(rand, 22, 50));
    }
  },
  // 7 rose: a rambling rose bush with layered blooms (tinted).
  (g, S, rand) => {
    for (let i = 0; i < 18; i++) stem(g, S * 0.5, S, S * (0.08 + rand() * 0.84), S * (0.1 + rand() * 0.6), 2.4, hsl(60, 25, 28), (rand() - 0.5) * 60);
    for (let i = 0; i < 90; i++) {
      const x = S * (0.08 + rand() * 0.84);
      const y = S * (0.12 + rand() * 0.8);
      if (Math.hypot((x - S / 2) / S, (y - S * 0.6) / S) > 0.48) continue;
      for (let k = 0; k < 3; k++) leaf(g, x, y, 10 + rand() * 4, 5, rand() * 6.28, green(rand, 20, 36));
    }
    for (let i = 0; i < 16; i++) {
      const x = S * (0.15 + rand() * 0.7);
      const y = S * (0.15 + rand() * 0.6);
      const r = 10 + rand() * 6;
      bloom(g, x, y, r * 1.2, 7, ['#d8d8d2', '#e8e8e2'], null, 0.9, rand());
      bloom(g, x, y, r * 0.8, 5, ['#f2f2ee', '#fafaf8'], null, 0.9, rand());
      g.fillStyle = '#c4c4bc';
      g.beginPath();
      g.arc(x, y, r * 0.25, 0, Math.PI * 2);
      g.fill();
    }
  },
  // 8 carrot: feathery, finely cut tops.
  (g, S, rand) => {
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (rand() - 0.5) * 1.8;
      const len = S * (0.55 + rand() * 0.4);
      const x0 = S * (0.45 + rand() * 0.1);
      const x1 = x0 + Math.cos(a) * len;
      const y1 = S + Math.sin(a) * len;
      const col = green(rand, 30, 44, 88, 110);
      stem(g, x0, S, x1, y1, 2, col);
      for (let k = 1; k < 9; k++) {
        const t = k / 9;
        const x = x0 + (x1 - x0) * t;
        const y = S + (y1 - S) * t;
        for (const s of [-1, 1]) {
          const b = a + s * (0.9 + rand() * 0.3);
          const l = 12 * (1.1 - t);
          stem(g, x, y, x + Math.cos(b) * l, y + Math.sin(b) * l, 1.2, col);
          for (let q = 0; q < 3; q++) leaf(g, x + Math.cos(b) * l * (0.4 + q * 0.3), y + Math.sin(b) * l * (0.4 + q * 0.3), 5, 1.6, b + s * 0.7, col, false);
        }
      }
    }
  },
  // 9 bean: a climbing vine (tall card wrapped round a pole): heart leaves, scarlet flowers, green pods.
  (g, S, rand) => {
    stem(g, S * 0.5, S, S * 0.5, 0, 2, hsl(90, 30, 30), 0);
    for (let y = S; y > 4; y -= 9) {
      const x = S * 0.5 + Math.sin(y * 0.09) * 18;
      if (rand() < 0.8) roundLeaf(g, x, y, 13 + rand() * 7, rand() < 0.5 ? -0.3 - rand() : Math.PI + 0.3 + rand(), green(rand, 24, 42));
      if (rand() < 0.22) for (let k = 0; k < 4; k++) bloom(g, x + (rand() - 0.5) * 30, y + k * 5, 6, 4, ['#d83018', '#e84a28'], null, 0.8);
      if (rand() < 0.14) stem(g, x, y, x + (rand() - 0.5) * 16, y + 30 + rand() * 16, 4, hsl(95, 40, 38), 4);
    }
  },
  // 10 potato: a bushy haulm with small white flowers (tinted lilac in places).
  (g, S, rand) => {
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (rand() - 0.5) * 2.6;
      const len = S * (0.3 + rand() * 0.4);
      const x0 = S * (0.4 + rand() * 0.2);
      const x1 = x0 + Math.cos(a) * len;
      const y1 = S + Math.sin(a) * len;
      stem(g, x0, S, x1, y1, 2.4, green(rand, 28, 36));
      for (let k = 1; k <= 4; k++) {
        const t = k / 4.5;
        for (const s of [-1, 1]) leaf(g, x0 + (x1 - x0) * t, S + (y1 - S) * t, 15, 7, a + s * 0.9, green(rand, 22, 40));
      }
      if (rand() < 0.4) bloom(g, x1, y1, 9, 5, WHITE, '#e0c020', 0.9, rand());
    }
  },
  // 11 grass: tall verge grass with seed heads and a few sorrel spikes.
  (g, S, rand) => {
    for (let i = 0; i < 80; i++) {
      const x = S * (0.08 + rand() * 0.84);
      const h = S * (0.35 + rand() * 0.6);
      const lean = (rand() - 0.5) * 70;
      g.fillStyle = hsl(70 + rand() * 30, 30 + rand() * 25, 30 + rand() * 28);
      g.beginPath();
      g.moveTo(x - 3, S);
      g.quadraticCurveTo(x + lean * 0.4, S - h * 0.6, x + lean, S - h);
      g.quadraticCurveTo(x + lean * 0.4 + 2, S - h * 0.6, x + 3, S);
      g.fill();
    }
    for (let i = 0; i < 12; i++) {
      const x = S * (0.15 + rand() * 0.7);
      const top = S * (0.02 + rand() * 0.25);
      const lean = (rand() - 0.5) * 40;
      stem(g, x, S, x + lean, top, 1.4, hsl(55, 30, 50), lean * 0.3);
      for (let k = 0; k < 10; k++) {
        g.fillStyle = rand() < 0.3 ? hsl(15, 50, 40) : hsl(50, 40, 62);
        g.beginPath();
        g.ellipse(x + lean + (rand() - 0.5) * 6, top + k * 3.4, 2, 3.4, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
  // 12 poppy: grey-green cut leaves, scarlet poppies with black eyes, a few buds.
  (g, S, rand) => {
    for (let i = 0; i < 22; i++) leaf(g, S * (0.3 + rand() * 0.4), S, S * (0.14 + rand() * 0.12), 6, -Math.PI / 2 + (rand() - 0.5) * 2.4, hsl(100, 18, 40 + rand() * 10));
    for (let i = 0; i < 9; i++) {
      const x = S * (0.15 + rand() * 0.7);
      const y = S * (0.08 + rand() * 0.45);
      stem(g, S * (0.4 + rand() * 0.2), S, x, y, 2, hsl(95, 22, 44), (rand() - 0.5) * 40);
      if (rand() < 0.25) {
        g.fillStyle = hsl(100, 25, 42);
        g.beginPath();
        g.ellipse(x, y, 5, 8, 0.3, 0, Math.PI * 2);
        g.fill();
      } else bloom(g, x, y, 22 + rand() * 8, 4, ['#d42a18', '#e8361e', '#c02010'], '#1a1410', 0.75, rand());
    }
  },
  // 13 meadow: a low tangle of clover, buttercups and small white flowers (tinted).
  (g, S, rand) => {
    for (let i = 0; i < 50; i++) {
      const x = S * (0.05 + rand() * 0.9);
      const y = S * (0.7 + rand() * 0.3);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + rand();
        g.fillStyle = green(rand, 26, 42);
        g.beginPath();
        g.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let i = 0; i < 22; i++) {
      const x = S * (0.08 + rand() * 0.84);
      const y = S * (0.3 + rand() * 0.45);
      stem(g, x + (rand() - 0.5) * 20, S, x, y, 1.4, green(rand, 30, 40));
      bloom(g, x, y, 9 + rand() * 5, 5, WHITE, rand() < 0.5 ? '#e0b020' : '#f0e0a0', 0.8, rand());
    }
  },
  // 14 dock: broad weed leaves and nettles at the foot of walls and fences.
  (g, S, rand) => {
    for (let i = 0; i < 10; i++) leaf(g, S * (0.35 + rand() * 0.3), S, S * (0.4 + rand() * 0.3), 22 + rand() * 10, -Math.PI / 2 + (rand() - 0.5) * 2.2, green(rand, 22, 38, 75, 100));
    for (let i = 0; i < 6; i++) {
      const x = S * (0.15 + rand() * 0.7);
      const top = S * (0.15 + rand() * 0.3);
      stem(g, x, S, x, top, 2.4, green(rand, 22, 30));
      for (let y = S * 0.9; y > top; y -= 18) for (const s of [-1, 1]) leaf(g, x, y, 22, 9, s < 0 ? Math.PI + 0.6 : -0.6, green(rand, 18, 32));
    }
  },
  // 15 fern: arching fronds with paired pinnae.
  (g, S, rand) => {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i / 8 - 0.5) * 2.4;
      const len = S * (0.55 + rand() * 0.35);
      const x0 = S * 0.5;
      const col = green(rand, 24, 40, 85, 115);
      let px = x0;
      let py = S;
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        const b = a + t * (a < -Math.PI / 2 ? -0.6 : 0.6);
        const x = px + Math.cos(b) * (len / 16);
        const y = py + Math.sin(b) * (len / 16);
        stem(g, px, py, x, y, 2, col);
        const pl = 22 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 3;
        for (const s of [-1, 1]) leaf(g, x, y, pl, 3.4, b + s * 1.25, col, false);
        px = x;
        py = y;
      }
    }
  },
];

/** The flora atlas: 16 plant cards on one 1024² alpha texture (see FLORA). */
export function floraAtlas() {
  const S = 256;
  const [c, g] = canvas(S * 4);
  g.clearRect(0, 0, S * 4, S * 4);
  PAINT.forEach((paint, cell) => {
    const col = cell % 4;
    const row = Math.floor(cell / 4);
    g.save();
    g.beginPath();
    g.rect(col * S + 2, row * S + 2, S - 4, S - 4);
    g.clip();
    g.translate(col * S, row * S);
    paint(g, S, rng(500 + cell * 17));
    g.restore();
  });
  return finish(c, { repeat: false, aniso: 4 });
}

/**
 * The leaf-cluster card of the Shire trees: a spray of oak-like lobed leaves on thin twigs, dense in the middle and
 * ragged at the rim, on a transparent background (alpha-tested; the vertex colours give each cluster its green).
 */
export function leafCardTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(61);
  g.clearRect(0, 0, S, S);
  const cx = S / 2;
  const cy = S / 2;
  const lobed = (x, y, len, wid, a, col, hi) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    // Oak leaf: four rounded lobes each side.
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const w = wid * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
      g.quadraticCurveTo(len * (t - 0.06), -w * 1.15, len * (t + 0.06), -w * (k % 2 ? 0.55 : 0.75));
    }
    g.lineTo(len, 0);
    for (let k = 4; k >= 0; k--) {
      const t = k / 4;
      const w = wid * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
      g.quadraticCurveTo(len * (t + 0.06), w * 1.15, len * (t - 0.06), w * (k % 2 ? 0.55 : 0.75));
    }
    g.closePath();
    g.fill();
    g.fillStyle = hi;
    g.beginPath();
    g.ellipse(len * 0.45, -wid * 0.25, len * 0.35, wid * 0.35, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,50,20,0.45)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.9, 0);
    g.stroke();
    g.restore();
  };
  // Seven sprays radiating from the middle with gaps between them: a ragged, see-through silhouette (not a disc).
  // The back sprays are drawn first and darker, the front ones lighter on top.
  const sprays = [];
  for (let i = 0; i < 7; i++) sprays.push({ a: (i / 7) * Math.PI * 2 + (rand() - 0.5) * 0.5, len: S * (0.3 + rand() * 0.16), back: i % 2 === 0 });
  sprays.push({ a: rand() * 6.28, len: S * 0.14, back: false });
  sprays.sort((p, q) => (q.back ? 1 : 0) - (p.back ? 1 : 0));
  for (const sp of sprays) {
    const bow = (rand() - 0.5) * 0.5;
    const tip = [cx + Math.cos(sp.a) * sp.len, cy + Math.sin(sp.a) * sp.len];
    stem(g, cx, cy, tip[0], tip[1], 3, '#5a4a32', bow * 40);
    const n = Math.round(sp.len / 9);
    for (let k = 0; k < n; k++) {
      const t = 0.15 + (k / n) * 0.9;
      const a = sp.a + bow * t;
      const x = cx + Math.cos(a) * sp.len * t;
      const y = cy + Math.sin(a) * sp.len * t;
      const side = k % 2 ? 1 : -1;
      const l = (sp.back ? 22 : 30) + rand() * 16 + t * 6;
      const col = hsl(80 + rand() * 30, 34 + rand() * 24, l);
      const hi = hsl(80 + rand() * 25, 40, l + 9, 0.5);
      lobed(x, y, 24 + rand() * 14, 8 + rand() * 4, a + side * (0.5 + rand() * 0.6), col, hi);
      if (rand() < 0.45) lobed(x, y, 20 + rand() * 12, 7 + rand() * 3, a + (rand() - 0.5) * 0.4, col, hi);
    }
    // A rosette of leaves at the tip.
    for (let k = 0; k < 4; k++) {
      const l = (sp.back ? 24 : 32) + rand() * 14;
      lobed(tip[0], tip[1], 22 + rand() * 12, 8 + rand() * 3, sp.a + (k - 1.5) * 0.7, hsl(80 + rand() * 30, 38, l), hsl(85, 40, l + 9, 0.5));
    }
  }
  return finish(c, { repeat: false, aniso: 4 });
}

/** Oak bark: deep vertical fissures between grey-brown ridges, with lichen and moss patches (tiles both ways). */
export function barkTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(67);
  g.fillStyle = '#6a5a48';
  g.fillRect(0, 0, S, S);
  // Ridges: long lighter plates.
  for (let i = 0; i < 160; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const w = 8 + rand() * 18;
    const h = 40 + rand() * 120;
    g.fillStyle = hsl(28 + rand() * 12, 10 + rand() * 12, 34 + rand() * 18, 0.7);
    wrapDraw(S, (dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, w / 2, h / 2, (rand() - 0.5) * 0.15, 0, Math.PI * 2);
      g.fill();
    });
  }
  // Fissures: dark wavy vertical cracks that fork.
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    let x = rand() * S;
    let y = rand() * S;
    const len = 60 + rand() * 200;
    g.strokeStyle = hsl(25, 20, 10 + rand() * 8, 0.85);
    g.lineWidth = 2 + rand() * 4;
    const pts = [[x, y]];
    for (let k = 0; k < len / 12; k++) {
      x += (rand() - 0.5) * 7;
      y += 12;
      pts.push([x, y]);
    }
    wrapDraw(S, (dx, dy) => {
      g.beginPath();
      pts.forEach(([px, py], q) => (q ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy)));
      g.stroke();
    });
  }
  // Lichen (grey-green) and moss (green) patches.
  for (let i = 0; i < 70; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 3 + rand() * 12;
    g.fillStyle = rand() < 0.5 ? hsl(80, 15, 62, 0.45) : hsl(95, 40, 30, 0.5);
    wrapDraw(S, (dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, r, r * (0.6 + rand() * 0.8), rand() * 3, 0, Math.PI * 2);
      g.fill();
    });
  }
  return finish(c, { aniso: 4 });
}
