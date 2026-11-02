/* ==== ui/textures.js — parchment, wood and slate baked once into small canvases (TERV i), exposed as CSS variables ==== */

let baked = false;

/** Deterministic pseudo-random numbers (the textures look the same on every start). */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Overlays smooth value noise on `ctx`: random cells of `cell` px drawn scaled up over `size` px, at `alpha`. */
function noiseLayer(ctx, size, cell, alpha, rand) {
  const n = Math.max(2, Math.round(size / cell));
  const small = document.createElement('canvas');
  small.width = n;
  small.height = n;
  const sx = small.getContext('2d');
  const img = sx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = rand() * 255;
    img.data.set([v, v, v, 255], i * 4);
  }
  sx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(small, 0, 0, size, size);
  ctx.restore();
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Aged paper: warm base, cloudy stains, fine fibres, darker burnt edges. */
function parchment() {
  const [c, x] = canvas(384, 256);
  const r = rng(11);
  x.fillStyle = '#e8d6ac';
  x.fillRect(0, 0, 384, 256);
  noiseLayer(x, 384, 48, 0.55, r);
  noiseLayer(x, 384, 12, 0.35, r);
  noiseLayer(x, 384, 3, 0.18, r);
  for (let i = 0; i < 14; i++) {
    const g = x.createRadialGradient(r() * 384, r() * 256, 0, r() * 384, r() * 256, 20 + r() * 60);
    g.addColorStop(0, 'rgba(150,100,40,0.10)');
    g.addColorStop(1, 'rgba(150,100,40,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 384, 256);
  }
  const e = x.createRadialGradient(192, 128, 90, 192, 128, 230);
  e.addColorStop(0, 'rgba(90,50,10,0)');
  e.addColorStop(1, 'rgba(90,50,10,0.45)');
  x.fillStyle = e;
  x.fillRect(0, 0, 384, 256);
  return c.toDataURL('image/jpeg', 0.82);
}

/** Oak planks: horizontal grain lines with knots, three boards. */
function wood(base = '#6b4426', seed = 23) {
  const [c, x] = canvas(256);
  const r = rng(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const y0 = r() * 256;
    x.strokeStyle = r() < 0.5 ? 'rgba(30,15,5,0.22)' : 'rgba(210,160,100,0.10)';
    x.lineWidth = 0.6 + r() * 1.6;
    x.beginPath();
    const ph = r() * 6;
    for (let px = 0; px <= 256; px += 8) x.lineTo(px, y0 + Math.sin(px * 0.02 + ph) * 3 + Math.sin(px * 0.11 + ph) * 0.8);
    x.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const kx = r() * 256;
    const ky = r() * 256;
    const g = x.createRadialGradient(kx, ky, 0, kx, ky, 7 + r() * 5);
    g.addColorStop(0, 'rgba(25,12,4,0.65)');
    g.addColorStop(1, 'rgba(25,12,4,0)');
    x.fillStyle = g;
    x.fillRect(kx - 14, ky - 14, 28, 28);
  }
  noiseLayer(x, 256, 4, 0.18, r);
  x.fillStyle = 'rgba(15,8,2,0.55)';
  for (const y of [0, 85, 171]) x.fillRect(0, y, 256, 1.5);
  return c.toDataURL('image/jpeg', 0.82);
}

/** School slate: blue-grey stone with old chalk smudges. */
function slate() {
  const [c, x] = canvas(256);
  const r = rng(37);
  x.fillStyle = '#2b3033';
  x.fillRect(0, 0, 256, 256);
  noiseLayer(x, 256, 32, 0.4, r);
  noiseLayer(x, 256, 2, 0.22, r);
  for (let i = 0; i < 9; i++) {
    x.save();
    x.translate(r() * 256, r() * 256);
    x.rotate(r() * Math.PI);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 40);
    g.addColorStop(0, 'rgba(230,230,220,0.07)');
    g.addColorStop(1, 'rgba(230,230,220,0)');
    x.fillStyle = g;
    x.scale(2.2, 0.6);
    x.fillRect(-40, -40, 80, 80);
    x.restore();
  }
  return c.toDataURL('image/jpeg', 0.85);
}

/** Bakes every texture once and sets `--tx-parch`, `--tx-wood`, `--tx-wood-dark`, `--tx-slate` on :root. */
export function bakeTextures() {
  if (baked || typeof document === 'undefined') return;
  baked = true;
  const s = document.documentElement.style;
  s.setProperty('--tx-parch', `url(${parchment()})`);
  s.setProperty('--tx-wood', `url(${wood()})`);
  s.setProperty('--tx-wood-dark', `url(${wood('#3e2615', 29)})`);
  s.setProperty('--tx-slate', `url(${slate()})`);
}
