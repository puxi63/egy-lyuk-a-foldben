/* ==== surface/textures.js — procedural canvas textures of the Shire (grass, painted wood, plaster, shingles, leaves,
   gravel, flagstones, grass blades, clouds, contact shadows, the sign atlas) and the CC0 Poly Haven maps ==== */
import * as THREE from 'three';
import { rng } from './kit.js';

const loader = new THREE.TextureLoader();

/** A 2D canvas and its context. */
export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Wraps a painted canvas as a mipmapped texture (sRGB colour, repeat wrapping, anisotropic filtering). */
export function finish(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Draws `fn(dx, dy)` nine times, offset by the canvas size, so strokes wrap and the texture tiles seamlessly. */
export function wrapDraw(S, fn) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy);
}

/** Speckle noise: many small translucent dots (mottling of plaster, stone and dirt). */
function speckle(g, S, n, r0, r1, colors, rand, alpha = 0.25) {
  for (let i = 0; i < n; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = r0 + rand() * (r1 - r0);
    g.globalAlpha = alpha * (0.4 + rand() * 0.6);
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    wrapDraw(S, (dx, dy) => {
      g.beginPath();
      g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.globalAlpha = 1;
}

/**
 * Lawn seen from above: short blade dabs in every direction (a top-down lawn has no "up"; blades all pointing along v
 * read as streaks running away from the camera), small clover clumps and darker gaps between the tufts, on a light
 * base. The hue comes mostly from vertex colours; filtered with the GPU's maximum anisotropy (the lawn is mostly seen
 * at grazing angles).
 */
export function grassTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(11);
  g.fillStyle = '#c3d4a0';
  g.fillRect(0, 0, S, S);
  speckle(g, S, 220, 12, 46, ['#b0c488', '#d4e2b2', '#a4ba7a'], rand, 0.3);
  // Darker soil-shadow gaps between tufts.
  speckle(g, S, 1400, 1.5, 4, ['#7e9258', '#8a9c62'], rand, 0.45);
  g.lineCap = 'round';
  for (let i = 0; i < 11000; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const len = 3 + rand() * 7;
    const a = rand() * Math.PI * 2;
    const l = 36 + rand() * 50;
    g.strokeStyle = `hsl(${68 + rand() * 42}, ${28 + rand() * 36}%, ${l}%)`;
    g.lineWidth = 0.9 + rand() * 1.3;
    g.globalAlpha = 0.5 + rand() * 0.5;
    const ex = Math.cos(a) * len;
    const ey = Math.sin(a) * len;
    // A slight curl: blades bend as they lie.
    const bx = -ey * 0.25 * (rand() - 0.5);
    const by = ex * 0.25 * (rand() - 0.5);
    wrapDraw(S, (dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + ex * 0.5 + bx, y + dy + ey * 0.5 + by, x + dx + ex, y + dy + ey);
      g.stroke();
    });
  }
  // Clover clumps: three round leaflets.
  for (let i = 0; i < 140; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 1.6 + rand() * 1.4;
    g.fillStyle = `hsl(${95 + rand() * 20}, ${30 + rand() * 20}%, ${34 + rand() * 18}%)`;
    g.globalAlpha = 0.8;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rand();
      wrapDraw(S, (dx, dy) => {
        g.beginPath();
        g.arc(x + dx + Math.cos(a) * r, y + dy + Math.sin(a) * r, r, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  g.globalAlpha = 1;
  return finish(c, { aniso: 16 });
}

/** Light wood with grain along u (planks, fence rails, frames); tinted by vertex colours (paint or stain). */
export function woodTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(23);
  g.fillStyle = '#e2d2b8';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const y = rand() * S;
    const amp = 2 + rand() * 6;
    const f = 1 + Math.floor(rand() * 3);
    const ph = rand() * 6.28;
    g.strokeStyle = rand() < 0.5 ? '#b89f7c' : '#cdb894';
    g.globalAlpha = 0.25 + rand() * 0.5;
    g.lineWidth = 0.6 + rand() * 2.4;
    for (const dy of [-S, 0, S]) {
      g.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const yy = y + dy + Math.sin((x / S) * Math.PI * 2 * f + ph) * amp;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
  }
  // Plank seams and a few knots.
  g.globalAlpha = 0.6;
  g.fillStyle = '#7a634a';
  for (let k = 0; k < 4; k++) g.fillRect(0, (k * S) / 4, S, 2);
  for (let i = 0; i < 7; i++) {
    const x = rand() * S;
    const y = rand() * S;
    g.globalAlpha = 0.5;
    g.fillStyle = '#8a6e50';
    g.beginPath();
    g.ellipse(x, y, 7 + rand() * 6, 3 + rand() * 2, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return finish(c);
}

/** Lime plaster: warm cream, mottled, faint cracks (the Green Dragon's walls, chimney render). */
export function plasterTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(31);
  g.fillStyle = '#efe6d2';
  g.fillRect(0, 0, S, S);
  speckle(g, S, 900, 6, 30, ['#e2d6bc', '#f7f0e0', '#d9cdb2'], rand, 0.3);
  speckle(g, S, 3000, 0.6, 2, ['#bfb092', '#fffaf0'], rand, 0.5);
  g.strokeStyle = '#a89878';
  for (let i = 0; i < 9; i++) {
    let x = rand() * S;
    let y = rand() * S;
    g.globalAlpha = 0.35;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rand() - 0.5) * 22;
      y += rand() * 14;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return finish(c);
}

/** Wooden shingles in staggered rows with moss (the inn roof, the mill roof, the gate's little roof). */
export function shingleTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(41);
  g.fillStyle = '#5a4634';
  g.fillRect(0, 0, S, S);
  const rows = 8;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.4 : 0;
    while (x < S) {
      const w = rh * (0.55 + rand() * 0.5);
      const l = 30 + rand() * 18;
      g.fillStyle = `hsl(${25 + rand() * 12}, ${18 + rand() * 14}%, ${l}%)`;
      g.fillRect(x + 1, r * rh + 1, w - 2, rh - 2);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 1, (r + 1) * rh - 6, w - 2, 5);
      if (rand() < 0.25) {
        g.fillStyle = `rgba(${90 + rand() * 30}, ${120 + rand() * 30}, 50, 0.45)`;
        g.beginPath();
        g.ellipse(x + w / 2, r * rh + rh * 0.7, w * 0.4, rh * 0.25, 0, 0, Math.PI * 2);
        g.fill();
      }
      x += w;
    }
  }
  return finish(c);
}

/** Rush thatch: long straw strokes in layered courses (the mill, the Green Dragon). */
export function thatchTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(43);
  g.fillStyle = '#8a7448';
  g.fillRect(0, 0, S, S);
  const courses = 6;
  for (let r = 0; r < courses; r++) {
    const y0 = (r * S) / courses;
    for (let i = 0; i < 900; i++) {
      const x = rand() * S;
      const len = S / courses * (0.9 + rand() * 0.5);
      const l = 38 + rand() * 30;
      g.strokeStyle = `hsl(${36 + rand() * 12}, ${30 + rand() * 25}%, ${l}%)`;
      g.lineWidth = 1 + rand() * 2;
      g.globalAlpha = 0.7;
      wrapDraw(S, (dx, dy) => {
        g.beginPath();
        g.moveTo(x + dx, y0 + dy);
        g.lineTo(x + dx + (rand() - 0.5) * 6, y0 + dy + len);
        g.stroke();
      });
    }
    g.globalAlpha = 0.45;
    g.fillStyle = '#3a2c18';
    g.fillRect(0, y0 + S / courses - 5, S, 5);
  }
  g.globalAlpha = 1;
  return finish(c);
}

/** Leaf masses: many small leaf dabs in light greens (hedges, canopies); hue and shade come from vertex colours. */
export function leafTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  const rand = rng(53);
  g.fillStyle = '#b8c890';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const l = 48 + rand() * 42;
    g.fillStyle = `hsl(${75 + rand() * 35}, ${35 + rand() * 25}%, ${l}%)`;
    const a = rand() * Math.PI;
    wrapDraw(S, (dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, 2 + rand() * 3, 1 + rand() * 1.5, a, 0, Math.PI * 2);
      g.fill();
    });
  }
  return finish(c);
}

/** Lane gravel and packed earth with pebbles (the winding paths). */
export function gravelTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(61);
  g.fillStyle = '#b29a76';
  g.fillRect(0, 0, S, S);
  speckle(g, S, 500, 8, 34, ['#a08562', '#c4ad88', '#9a8a6a'], rand, 0.35);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 1 + rand() * 3.5;
    const l = 45 + rand() * 35;
    g.fillStyle = `hsl(${30 + rand() * 20}, ${8 + rand() * 18}%, ${l}%)`;
    wrapDraw(S, (dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, r, r * (0.6 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
      g.fill();
    });
  }
  return finish(c, { aniso: 16 });
}

/** Dug garden earth: dark crumbly soil with clods (lit tops, shadowed undersides), small stones and bits of straw. */
export function soilTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(65);
  g.fillStyle = '#5a4230';
  g.fillRect(0, 0, S, S);
  speckle(g, S, 600, 4, 22, ['#4a3424', '#6a503a', '#3e2c1e'], rand, 0.4);
  for (let i = 0; i < 1500; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 2 + rand() * 6;
    const l = 18 + rand() * 16;
    wrapDraw(S, (dx, dy) => {
      g.fillStyle = `hsla(25, 30%, ${l - 8}%, 0.8)`;
      g.beginPath();
      g.ellipse(x + dx + 1, y + dy + 1.5, r, r * 0.75, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `hsla(${24 + rand() * 8}, ${26 + rand() * 12}%, ${l + 6}%, 0.9)`;
      g.beginPath();
      g.ellipse(x + dx, y + dy, r * 0.85, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  speckle(g, S, 260, 1, 3, ['#9a8a74', '#b0a290', '#7a6a58'], rand, 0.8);
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const a = rand() * Math.PI;
    g.strokeStyle = 'rgba(190,160,100,0.55)';
    g.lineWidth = 1.2;
    wrapDraw(S, (dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.lineTo(x + dx + Math.cos(a) * 9, y + dy + Math.sin(a) * 9);
      g.stroke();
    });
  }
  return finish(c, { aniso: 8 });
}

/** Irregular flagstones with mossy joints (the stone path and steps to the door, the inn terrace). */
export function flagTexture() {
  const S = 512;
  const [c, g] = canvas(S);
  const rand = rng(71);
  g.fillStyle = '#5f6a48';
  g.fillRect(0, 0, S, S);
  // Jittered grid of stones, each a rounded polygon.
  const n = 5;
  const cell = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = (i + 0.5) * cell + (rand() - 0.5) * cell * 0.15;
      const cy = (j + 0.5) * cell + (rand() - 0.5) * cell * 0.15;
      const l = 55 + rand() * 18;
      const fill = `hsl(${30 + rand() * 25}, ${6 + rand() * 10}%, ${l}%)`;
      const pts = [];
      const k = 6 + Math.floor(rand() * 3);
      for (let a = 0; a < k; a++) {
        const ang = (a / k) * Math.PI * 2 + rand() * 0.3;
        const rr = cell * (0.4 + rand() * 0.08);
        pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]);
      }
      wrapDraw(S, (dx, dy) => {
        g.fillStyle = fill;
        g.beginPath();
        pts.forEach(([x, y], q) => (q ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy)));
        g.closePath();
        g.fill();
      });
    }
  }
  speckle(g, S, 1800, 0.8, 3, ['#4a4a40', '#d8d0c0', '#7a8a50'], rand, 0.3);
  return finish(c);
}

/** Grass blades with alpha (crossed-quad tufts on the lawns and verges). */
export function bladeTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  const rand = rng(83);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = 10 + rand() * (S - 20);
    const h = S * (0.45 + rand() * 0.55);
    const lean = (rand() - 0.5) * 60;
    const w = 3 + rand() * 4;
    const l = 45 + rand() * 30;
    g.fillStyle = `hsl(${80 + rand() * 25}, ${35 + rand() * 25}%, ${l}%)`;
    g.beginPath();
    g.moveTo(x - w, S);
    g.quadraticCurveTo(x - w * 0.3 + lean * 0.4, S - h * 0.6, x + lean, S - h);
    g.quadraticCurveTo(x + w * 0.3 + lean * 0.4, S - h * 0.6, x + w, S);
    g.closePath();
    g.fill();
  }
  return finish(c, { repeat: false, aniso: 1 });
}

/** One soft cumulus puff with alpha. */
export function cloudTexture() {
  const S = 256;
  const [c, g] = canvas(S, S / 2);
  const rand = rng(97);
  for (let i = 0; i < 40; i++) {
    const x = S * (0.18 + rand() * 0.64);
    const y = (S / 2) * (0.45 + rand() * 0.3) - (1 - Math.abs(x / S - 0.5) * 2) * 26;
    const r = 14 + rand() * 26 * (1 - Math.abs(x / S - 0.5) * 1.4);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const shade = 236 + Math.floor(rand() * 19);
    grd.addColorStop(0, `rgba(${shade},${shade},${shade - 4},0.55)`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Slightly grey, flat underside.
  const under = g.createLinearGradient(0, S * 0.25, 0, S * 0.5);
  under.addColorStop(0, 'rgba(0,0,0,0)');
  under.addColorStop(1, 'rgba(150,150,170,0.25)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = under;
  g.fillRect(0, 0, S, S / 2);
  g.globalCompositeOperation = 'source-over';
  return finish(c, { repeat: false, aniso: 1 });
}

/** Radial contact shadow (a soft dark blob under props; no shadow maps on the surface). */
export function blobTexture() {
  const S = 128;
  const [c, g] = canvas(S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(20,16,8,0.62)');
  grd.addColorStop(0.55, 'rgba(20,16,8,0.32)');
  grd.addColorStop(1, 'rgba(20,16,8,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return finish(c, { repeat: false, srgb: false, aniso: 1 });
}

/** A CC0 Poly Haven map from assets/tex (colour maps in sRGB, normal maps linear). */
export function fileTexture(name, srgb = true, repeat = 1) {
  const t = loader.load(new URL(`../../assets/tex/${name}`, import.meta.url).href);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/* ---- the sign atlas: every painted board of the surface in one 1024² texture (one material, one draw call) ---- */

/** Atlas rectangles in UV space (x, y from the bottom-left, w, h). */
export const SIGN_UV = {
  gate: [0, 0.75, 0.5, 0.25],
  dragon: [0.5, 0.5, 0.5, 0.5],
  innName: [0, 0.625, 0.5, 0.125],
  chalk: [0, 0.25, 0.5, 0.375],
  mailbox: [0.5, 0.375, 0.25, 0.125],
  path: [0.5, 0.25, 0.5, 0.125],
  board: [0.5, 0, 0.5, 0.25],
};

function boardBack(g, x, y, w, h, color = '#6e5232', rand) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 30; i++) {
    const yy = y + rand() * h;
    g.globalAlpha = 0.3;
    g.lineWidth = 0.6 + rand() * 1.5;
    g.beginPath();
    g.moveTo(x, yy);
    g.bezierCurveTo(x + w * 0.3, yy + (rand() - 0.5) * 6, x + w * 0.7, yy + (rand() - 0.5) * 6, x + w, yy);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function centredText(g, text, x, y, size, color, font = 'Georgia, "Times New Roman", serif', weight = 'bold') {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/** The green dragon of the inn sign, painted with curves into the box (x, y, w, h). */
function paintDragon(g, x, y, w, h) {
  g.save();
  g.translate(x, y);
  g.scale(w / 400, h / 300);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const body = '#2f7a34';
  const dark = '#173f1a';
  // Wing (behind the body).
  g.fillStyle = '#3d8f42';
  g.strokeStyle = dark;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(190, 150);
  g.lineTo(150, 40);
  g.quadraticCurveTo(175, 70, 200, 60);
  g.quadraticCurveTo(215, 85, 240, 78);
  g.quadraticCurveTo(250, 108, 275, 108);
  g.quadraticCurveTo(250, 140, 230, 165);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  for (const [ex, ey] of [[200, 60], [240, 78], [275, 108]]) {
    g.moveTo(195, 150);
    g.lineTo(ex, ey);
  }
  g.stroke();
  // Tail curling to the left, ending in a spade.
  g.strokeStyle = dark;
  g.lineWidth = 22;
  g.beginPath();
  g.moveTo(170, 190);
  g.bezierCurveTo(110, 230, 60, 200, 70, 150);
  g.bezierCurveTo(78, 118, 110, 120, 105, 140);
  g.stroke();
  g.strokeStyle = body;
  g.lineWidth = 15;
  g.stroke();
  g.fillStyle = '#c23a28';
  g.beginPath();
  g.moveTo(105, 140);
  g.lineTo(92, 128);
  g.lineTo(112, 122);
  g.lineTo(120, 136);
  g.closePath();
  g.fill();
  // Body: an S-curve from the haunch to the neck and head.
  g.fillStyle = body;
  g.strokeStyle = dark;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(150, 205);
  g.bezierCurveTo(150, 160, 200, 140, 245, 150);
  g.bezierCurveTo(270, 140, 275, 100, 290, 80);
  g.bezierCurveTo(300, 66, 330, 60, 350, 72);
  g.lineTo(372, 80);
  g.lineTo(366, 92);
  g.lineTo(340, 92);
  g.bezierCurveTo(320, 100, 300, 130, 292, 160);
  g.bezierCurveTo(285, 200, 250, 222, 205, 222);
  g.closePath();
  g.fill();
  g.stroke();
  // Belly scales.
  g.strokeStyle = '#c8b860';
  g.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(200 + i * 14, 214 - i * 9, 10, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  }
  // Legs and claws.
  g.strokeStyle = dark;
  g.lineWidth = 12;
  for (const [ax, ay, bx, by] of [[175, 210, 160, 255], [255, 205, 270, 250], [290, 150, 318, 175]]) {
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }
  g.strokeStyle = body;
  g.lineWidth = 7;
  for (const [ax, ay, bx, by] of [[175, 210, 160, 255], [255, 205, 270, 250], [290, 150, 318, 175]]) {
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }
  // Spines along the back.
  g.fillStyle = '#c8a040';
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const sx = 160 + t * 120;
    const sy = 172 - t * 70 - Math.sin(t * 3) * 10;
    g.beginPath();
    g.moveTo(sx - 7, sy + 4);
    g.lineTo(sx, sy - 14);
    g.lineTo(sx + 7, sy + 4);
    g.closePath();
    g.fill();
  }
  // Horn, eye and a little flame.
  g.fillStyle = '#e8d8a0';
  g.beginPath();
  g.moveTo(318, 66);
  g.lineTo(305, 40);
  g.lineTo(330, 62);
  g.fill();
  g.fillStyle = '#f2e060';
  g.beginPath();
  g.arc(336, 74, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(337, 74, 2, 0, Math.PI * 2);
  g.fill();
  const fl = g.createLinearGradient(372, 86, 398, 100);
  fl.addColorStop(0, '#f8d040');
  fl.addColorStop(1, '#d83a20');
  g.fillStyle = fl;
  g.beginPath();
  g.moveTo(370, 86);
  g.quadraticCurveTo(390, 76, 398, 92);
  g.quadraticCurveTo(388, 92, 396, 104);
  g.quadraticCurveTo(380, 98, 370, 90);
  g.fill();
  g.restore();
}

/** Builds the sign atlas (Hungarian texts; the gate sign is a placeholder translation, see below). */
export function signAtlas() {
  const S = 1024;
  const [c, g] = canvas(S);
  const rand = rng(101);
  const px = (r) => [r[0] * S, (1 - r[1] - r[3]) * S, r[2] * S, r[3] * S];

  // Gate sign: the film's "No admittance except on party business".
  // PLACEHOLDER TRANSLATION — check against the Hungarian dubbing of the film before release.
  {
    const [x, y, w, h] = px(SIGN_UV.gate);
    boardBack(g, x, y, w, h, '#5a4026', rand);
    g.strokeStyle = '#3a2814';
    g.lineWidth = 8;
    g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    centredText(g, 'Belépés csak', x + w / 2, y + h * 0.3, 52, '#efe2c0', 'Georgia, serif', 'italic bold');
    centredText(g, 'ünnepi ügyben', x + w / 2, y + h * 0.55, 52, '#efe2c0', 'Georgia, serif', 'italic bold');
  }
  // The inn's hanging sign: a green dragon on a cream field with a gold frame and the name.
  {
    const [x, y, w, h] = px(SIGN_UV.dragon);
    g.fillStyle = '#2a1c10';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#c9a048';
    g.fillRect(x + 10, y + 10, w - 20, h - 20);
    const field = g.createRadialGradient(x + w / 2, y + h * 0.45, 30, x + w / 2, y + h / 2, w * 0.6);
    field.addColorStop(0, '#f2e6c4');
    field.addColorStop(1, '#d4c090');
    g.fillStyle = field;
    g.fillRect(x + 24, y + 24, w - 48, h - 48);
    paintDragon(g, x + 40, y + 60, w - 80, h * 0.62);
    g.fillStyle = '#3a2410';
    g.fillRect(x + 24, y + h - 120, w - 48, 96);
    centredText(g, 'A Zöld Sárkány', x + w / 2, y + h - 72, 50, '#e8c870', 'Georgia, serif', 'bold');
    // Age: a few scratches over the paint.
    g.strokeStyle = 'rgba(60,40,20,0.25)';
    for (let i = 0; i < 40; i++) {
      const sx = x + 24 + rand() * (w - 48);
      const sy = y + 24 + rand() * (h - 48);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + (rand() - 0.5) * 30, sy + (rand() - 0.5) * 8);
      g.stroke();
    }
  }
  // Name board over the serving hatch.
  {
    const [x, y, w, h] = px(SIGN_UV.innName);
    boardBack(g, x, y, w, h, '#1f4a26', rand);
    g.strokeStyle = '#c9a048';
    g.lineWidth = 6;
    g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    centredText(g, 'A ZÖLD SÁRKÁNY', x + w / 2, y + h / 2 + 2, 58, '#ecd080', 'Georgia, serif', 'bold');
  }
  // Chalkboard by the counter: chalk drawings only (TERV Decision 18: no invented inscriptions).
  {
    const [x, y, w, h] = px(SIGN_UV.chalk);
    g.fillStyle = '#5a3c20';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#26302a';
    g.fillRect(x + 16, y + 16, w - 32, h - 32);
    g.strokeStyle = '#ece8dc';
    g.fillStyle = '#ece8dc';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // A tankard with foam.
    const tx = x + 70;
    const ty = y + 60;
    g.strokeRect(tx, ty + 20, 70, 100);
    g.beginPath();
    g.arc(tx + 70, ty + 70, 26, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(tx + 10 + i * 17, ty + 18, 13, Math.PI, 0);
      g.stroke();
    }
    // A loaf.
    g.beginPath();
    g.ellipse(x + 330, y + 120, 90, 45, 0, Math.PI, 0);
    g.lineTo(x + 420, y + 135);
    g.lineTo(x + 240, y + 135);
    g.closePath();
    g.stroke();
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(x + 290 + i * 35, y + 90);
      g.lineTo(x + 305 + i * 35, y + 112);
      g.stroke();
    }
    // A mushroom and a ladder.
    g.beginPath();
    g.arc(x + 130, y + 290, 55, Math.PI, 0);
    g.closePath();
    g.stroke();
    g.strokeRect(x + 112, y + 290, 36, 60);
    for (const lx of [300, 370]) {
      g.beginPath();
      g.moveTo(x + lx, y + 200);
      g.lineTo(x + lx, y + 350);
      g.stroke();
    }
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.moveTo(x + 300, y + 215 + k * 30);
      g.lineTo(x + 370, y + 215 + k * 30);
      g.stroke();
    }
    // Coins.
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(x + 440, y + 330 - k * 14, 22, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // Blank weathered boards (letterbox lid, signpost arms): no inscriptions.
  for (const r of [SIGN_UV.mailbox, SIGN_UV.path, SIGN_UV.board]) {
    const [x, y, w, h] = px(r);
    boardBack(g, x, y, w, h, '#8a6a42', rand);
  }
  const t = finish(c, { repeat: false, aniso: 8 });
  return t;
}
