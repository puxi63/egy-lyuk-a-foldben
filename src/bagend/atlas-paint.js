/* ==== bagend/atlas-paint.js — the painters of the interior's texture atlas (no three.js: runs in a worker too) ====
 * 2048² canvas, 8 × 8 cells of 256 px; a cell holds 224 px of content with a 16 px margin copied by wrap-around, so
 * the shader's fract() tiling and the mip levels down to 16 px stay free of seams. Tiling tiles are painted
 * seamlessly (periodic noise, wrapped strokes); "face" tiles (rugs, maps, the clock face …) are pictures mapped once
 * across a face. layout() gives every tile's atlas rectangle; paintAtlas() paints the whole atlas into a 2D context
 * (about 1–1.5 s of CPU, so atlas.js runs it in atlas-worker.js when OffscreenCanvas is available). */

export const N = 2048;
const CELL = 256;
const S = 224;
const PAD = (CELL - S) / 2;


/* ---------- periodic noise ---------- */

function hash(i, j, seed) {
  // Integer hash (fast; Math.sin based hashing made the atlas take seconds).
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Periodic value noise on the unit square: `per` lattice cells per repeat. */
function vnoise(x, y, per, seed) {
  const fx = x * per;
  const fy = y * per;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const w = (a) => ((a % per) + per) % per;
  const a = hash(w(i), w(j), seed);
  const b = hash(w(i + 1), w(j), seed);
  const c = hash(w(i), w(j + 1), seed);
  const d = hash(w(i + 1), w(j + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Periodic fractal noise in 0..1. */
function fbm(x, y, per, oct = 4, seed = 0) {
  let s = 0;
  let amp = 0.5;
  let tot = 0;
  for (let k = 0; k < oct; k++) {
    s += vnoise(x, y, per << k, seed + k * 13) * amp;
    tot += amp;
    amp *= 0.5;
  }
  return s / tot;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Fills the tile canvas pixel by pixel: fn(u, v) → [r, g, b, a?] in 0..255 (u, v in 0..1, v down). */
function pixels(ctx, fn) {
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = fn(x / S, y / S);
      const o = (y * S + x) * 4;
      d[o] = clamp255(c[0]);
      d[o + 1] = clamp255(c[1]);
      d[o + 2] = clamp255(c[2]);
      d[o + 3] = c.length > 3 ? clamp255(c[3]) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Runs a drawing function nine times shifted by ±S, so strokes crossing an edge reappear on the other side. */
function wrap(ctx, fn) {
  for (const ox of [-S, 0, S]) {
    for (const oy of [-S, 0, S]) {
      ctx.save();
      ctx.translate(ox, oy);
      fn(ctx);
      ctx.restore();
    }
  }
}

/** Small deterministic random generator. */
function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Wood grain along u: base colour, ring colour, ring frequency. */
function grain(ctx, base, dark, rings, seed, knots = 2) {
  pixels(ctx, (u, v) => {
    const warp = fbm(u, v, 2, 3, seed) * 3.2;
    const r = Math.sin((v * rings + warp) * Math.PI * 2) * 0.5 + 0.5;
    const fine = fbm(u, v * 6, 8, 3, seed + 5);
    const t = Math.pow(r, 3) * 0.55 + fine * 0.35;
    return mixc(base, dark, t);
  });
  const R = rnd(seed);
  wrap(ctx, (c) => {
    for (let k = 0; k < knots; k++) {
      const x = ((k * 97 + seed * 31) % S);
      const y = ((k * 53 + seed * 17) % S);
      c.fillStyle = `rgba(${dark[0] * 0.7},${dark[1] * 0.7},${dark[2] * 0.7},0.55)`;
      c.beginPath();
      c.ellipse(x, y, 5 + R() * 4, 2.5 + R() * 2, 0, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/* ---------- tile painters (each paints a 224² canvas) ---------- */

const P = {
  plaster(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 3, 5, 1);
      const s = fbm(u * 1, v, 12, 2, 4);
      const t = n * 0.75 + s * 0.25;
      return mixc([200, 184, 152], [236, 224, 196], t);
    });
  },
  earth(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 3, 5, 9);
      const st = Math.max(0, vnoise(u, v, 12, 3) - 0.72) * 0.6;
      return mixc([124, 106, 84], [164, 144, 114], n * 0.9 - st);
    });
  },
  panel(c) {
    grain(c, [146, 104, 70], [98, 66, 42], 14, 21, 0);
    // Two raised panels per tile: dark grooves around a lighter field, the stiles and rails between.
    c.lineWidth = 3;
    for (const x0 of [0, S / 2]) {
      const x = x0 + 18;
      const w = S / 2 - 36;
      c.fillStyle = 'rgba(255,220,170,0.10)';
      c.fillRect(x, 22, w, S - 44);
      c.strokeStyle = 'rgba(40,20,8,0.75)';
      c.strokeRect(x, 22, w, S - 44);
      c.strokeStyle = 'rgba(255,230,190,0.35)';
      c.strokeRect(x + 4, 26, w - 8, S - 52);
      c.strokeStyle = 'rgba(40,20,8,0.35)';
      c.strokeRect(x + 9, 31, w - 18, S - 62);
    }
    c.fillStyle = 'rgba(40,20,8,0.5)';
    c.fillRect(0, 0, S, 2);
    c.fillRect(0, S - 2, S, 2);
  },
  boards(c) {
    const R = rnd(7);
    const n = 5;
    const h = S / n;
    for (let i = 0; i < n; i++) {
      const tc = c.createImageData(S, Math.ceil(h));
      const tone = 0.8 + R() * 0.35;
      for (let y = 0; y < tc.height; y++) {
        for (let x = 0; x < S; x++) {
          const u = x / S;
          const v = (i * h + y) / S;
          const warp = fbm(u, v, 2, 3, 30 + i) * 2.5;
          const r = Math.sin((v * 22 + warp + u * 0.6) * Math.PI * 2) * 0.5 + 0.5;
          const fine = fbm(u, v * 4, 8, 2, 40 + i);
          const t = Math.pow(r, 3) * 0.5 + fine * 0.35;
          const col = mixc([170, 128, 88], [116, 82, 52], t);
          const o = (y * S + x) * 4;
          tc.data[o] = col[0] * tone;
          tc.data[o + 1] = col[1] * tone;
          tc.data[o + 2] = col[2] * tone;
          tc.data[o + 3] = 255;
        }
      }
      c.putImageData(tc, 0, Math.round(i * h));
      // Butt joints, staggered per board, and the gap between boards.
      c.fillStyle = 'rgba(30,16,6,0.8)';
      const jx = Math.floor(R() * S);
      c.fillRect(jx, Math.round(i * h), 2, Math.ceil(h));
      c.fillRect(0, Math.round(i * h), S, 2);
      c.fillStyle = 'rgba(20,10,4,0.6)';
      for (const dx of [-5, 5]) {
        c.beginPath();
        c.arc((jx + dx + S) % S, i * h + h * 0.3, 1.6, 0, 7);
        c.arc((jx + dx + S) % S, i * h + h * 0.72, 1.6, 0, 7);
        c.fill();
      }
    }
  },
  quarry(c) {
    pixels(c, (u, v) => {
      const gx = (u * 2) % 1;
      const gy = (v * 2) % 1;
      const g = Math.min(gx, 1 - gx, gy, 1 - gy);
      const cell = Math.floor(u * 2) + Math.floor(v * 2) * 2;
      const tone = 0.85 + hash(cell, 3, 5) * 0.25;
      const n = fbm(u, v, 4, 4, 11);
      if (g < 0.03) return [92, 84, 74];
      const edge = g < 0.07 ? 0.85 : 1;
      return mixc([150, 86, 60], [184, 118, 84], n).map((x) => x * tone * edge);
    });
  },
  flags(c) {
    // Irregular flagstones: a periodic Voronoi pattern with mortar between the cells.
    const R = rnd(5);
    const pts = [];
    for (let i = 0; i < 9; i++) pts.push([R(), R(), 0.75 + R() * 0.35]);
    pixels(c, (u, v) => {
      let d1 = 9;
      let d2 = 9;
      let tone = 1;
      for (const [px, py, t] of pts) {
        let dx = u - px;
        let dy = v - py;
        dx -= Math.round(dx);
        dy -= Math.round(dy);
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          tone = t;
        } else if (d < d2) d2 = d;
      }
      const n = fbm(u, v, 4, 4, 17);
      if (d2 - d1 < 0.018) return [70, 64, 56];
      const base = mixc([118, 110, 98], [160, 150, 132], n);
      return base.map((x) => x * tone);
    });
  },
  brick(c) {
    pixels(c, (u, v) => {
      const rows = 6;
      const row = Math.floor(v * rows);
      const fy = (v * rows) % 1;
      const off = row % 2 ? 0.25 : 0;
      const fx = ((u + off) * 2) % 1;
      const bid = Math.floor((u + off) * 2) + row * 7;
      const tone = 0.8 + hash(bid, 1, 9) * 0.35;
      if (fy < 0.1 || fx < 0.035) return [104, 92, 80];
      const n = fbm(u, v, 6, 3, 23);
      return mixc([126, 58, 38], [170, 88, 56], n).map((x) => x * tone);
    });
  },
  beam(c) {
    grain(c, [112, 82, 58], [66, 46, 30], 9, 31, 2);
  },
  oak(c) {
    grain(c, [168, 118, 70], [110, 72, 40], 11, 41, 1);
  },
  wood(c) {
    // Neutral, light grain to be tinted (furniture of different woods and paints).
    grain(c, [222, 210, 196], [168, 152, 136], 12, 51, 1);
  },
  iron(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 4, 5, 61);
      return mixc([40, 40, 42], [86, 82, 78], n);
    });
  },
  brass(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v * 0.2, 6, 3, 71);
      const s = Math.sin(v * Math.PI * 2 * 3 + n * 4) * 0.5 + 0.5;
      return mixc([150, 104, 38], [240, 200, 110], s * 0.7 + n * 0.3);
    });
  },
  velvet(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 3, 4, 81);
      const w = ((Math.floor(u * 112) + Math.floor(v * 112)) % 2) * 0.06;
      const t = n * 0.8 + w;
      return mixc([150, 140, 136], [236, 228, 224], t);
    });
  },
  quilt(c) {
    // Patchwork squares in warm, faded colours with stitched seams (a hobbit bed's quilt).
    const cols = [[164, 64, 50], [196, 150, 70], [90, 110, 62], [176, 120, 90], [110, 86, 120], [210, 190, 150], [70, 96, 120], [150, 90, 48]];
    pixels(c, (u, v) => {
      const i = Math.floor(u * 4);
      const j = Math.floor(v * 4);
      const col = cols[(i * 3 + j * 5 + (i * j) % 3) % cols.length];
      const fx = (u * 4) % 1;
      const fy = (v * 4) % 1;
      const n = fbm(u, v, 8, 3, 91);
      const pat = (i + j) % 3 === 0 ? (Math.sin((fx + fy) * 30) > 0.6 ? 0.82 : 1) : (Math.hypot(fx - 0.5, fy - 0.5) < 0.18 ? 1.12 : 1);
      const seam = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.03 ? 0.6 : 1;
      return col.map((x) => (x * 0.8 + 40) * (0.88 + n * 0.22) * pat * seam);
    });
  },
  linen(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 4, 3, 101);
      const w = (Math.sin(u * S * 1.6) * Math.sin(v * S * 1.6)) * 0.04;
      return mixc([214, 206, 188], [246, 242, 230], n + w);
    });
  },
  leather(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 6, 5, 111);
      const cr = vnoise(u, v, 28, 4);
      return mixc([86, 50, 28], [150, 96, 56], n * 0.8 + cr * 0.2);
    });
  },
  stone(c) {
    // Dressed sandstone blocks (fireplace surrounds, the cellar steps).
    pixels(c, (u, v) => {
      const row = Math.floor(v * 3);
      const off = row % 2 ? 0.5 : 0;
      const fx = ((u + off) * 1.5) % 1;
      const fy = (v * 3) % 1;
      const bid = Math.floor((u + off) * 1.5) + row * 5;
      const tone = 0.88 + hash(bid, 2, 4) * 0.2;
      if (fy < 0.04 || fx < 0.025) return [120, 108, 90];
      const n = fbm(u, v, 5, 4, 121);
      return mixc([176, 160, 128], [214, 200, 168], n).map((x) => x * tone);
    });
  },
  tilewhite(c) {
    // Glazed cream wall tiles with a thin green band (kitchen splashback).
    pixels(c, (u, v) => {
      const fx = (u * 3) % 1;
      const fy = (v * 3) % 1;
      if (Math.min(fx, fy) < 0.035) return [150, 140, 120];
      const n = fbm(u, v, 6, 2, 131);
      const sheen = Math.max(0, 1 - Math.hypot(fx - 0.3, fy - 0.3) * 2.2) * 25;
      return [226 + sheen + n * 12, 218 + sheen + n * 10, 196 + sheen];
    });
  },
  plain(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 4, 2, 141);
      return [240 + n * 15, 240 + n * 15, 240 + n * 15];
    });
  },
  wax(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 3, 3, 151);
      return mixc([226, 214, 180], [250, 244, 222], n);
    });
  },
  crust(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 5, 5, 161);
      const s = vnoise(u, v, 20, 2) > 0.8 ? 0.2 : 0;
      return mixc([150, 88, 34], [222, 160, 82], n + s);
    });
  },
  cheese(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 4, 3, 171);
      const hole = vnoise(u, v, 9, 7) > 0.82 ? 0.75 : 1;
      return mixc([230, 184, 80], [250, 214, 120], n).map((x) => x * hole);
    });
  },
  ember(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 5, 4, 181);
      const hot = Math.pow(n, 2.2);
      return mixc([40, 14, 8], [255, 150, 50], hot * 1.6);
    });
  },
  glassdark(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v * 0.3, 4, 2, 191);
      return mixc([30, 70, 40], [90, 150, 90], n * 0.6 + (Math.abs(u - 0.3) < 0.04 ? 0.5 : 0));
    });
  },
  // ---------- face tiles ----------
  rug_red(c) {
    pixels(c, (u, v) => {
      const bx = Math.min(u, 1 - u);
      const by = Math.min(v, 1 - v);
      const b = Math.min(bx, by);
      const n = fbm(u, v, 6, 3, 201) * 0.25 + 0.85;
      let col;
      if (b < 0.035) col = [120, 30, 26];
      else if (b < 0.1) col = Math.sin((u + v) * 60) > 0 ? [196, 150, 70] : [60, 70, 96];
      else if (b < 0.125) col = [120, 30, 26];
      else {
        const cx = u - 0.5;
        const cy = v - 0.5;
        const d = Math.abs(cx) * 1.3 + Math.abs(cy);
        col = d < 0.12 ? [210, 170, 90] : d < 0.16 ? [60, 70, 96] : Math.sin(d * 50) > 0.7 ? [180, 70, 50] : [150, 40, 34];
      }
      return col.map((x) => x * n);
    });
  },
  rug_round(c) {
    pixels(c, (u, v) => {
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      const a = Math.atan2(v - 0.5, u - 0.5);
      const n = fbm(u, v, 6, 3, 211) * 0.25 + 0.85;
      let col;
      if (d > 0.93) col = [70, 84, 54];
      else if (d > 0.82) col = Math.sin(a * 24) > 0 ? [200, 170, 96] : [70, 84, 54];
      else if (d > 0.76) col = [150, 60, 40];
      else if (d > 0.3) col = Math.sin(d * 30 + Math.sin(a * 8) * 1.5) > 0.5 ? [120, 140, 80] : [96, 116, 64];
      else col = d < 0.12 ? [210, 180, 110] : [150, 60, 40];
      return col.map((x) => x * n);
    });
  },
  runner(c) {
    pixels(c, (u, v) => {
      const by = Math.min(v, 1 - v);
      const n = fbm(u, v, 8, 3, 221) * 0.22 + 0.86;
      let col;
      if (by < 0.06) col = [96, 46, 30];
      else if (by < 0.16) col = Math.sin(u * Math.PI * 16) > 0 ? [200, 160, 84] : [96, 46, 30];
      else {
        const fx = (u * 4) % 1;
        const d = Math.abs(fx - 0.5) * 1.4 + Math.abs(v - 0.5);
        col = d < 0.18 ? [70, 90, 110] : d < 0.24 ? [200, 160, 84] : [140, 54, 36];
      }
      return col.map((x) => x * n);
    });
  },
  books(c) {
    // A shelf row of book spines (repeats along u), the shelf's dark back above them.
    c.fillStyle = '#1e140c';
    c.fillRect(0, 0, S, S);
    const R = rnd(231);
    const cols = ['#6a1e1a', '#2a4a2a', '#3a2a1a', '#7a5a2a', '#1e2a4a', '#5a3a5a', '#8a6a3a', '#4a1a12', '#2e3e3a', '#6a4a20'];
    let x = 0;
    while (x < S) {
      const w = 9 + Math.floor(R() * 12);
      const h = S * (0.62 + R() * 0.33);
      const lean = x + w > S ? S - x : w;
      c.fillStyle = cols[Math.floor(R() * cols.length)];
      c.fillRect(x, S - h, lean - 1, h);
      c.fillStyle = 'rgba(230,190,90,0.75)';
      c.fillRect(x + 1, S - h + h * 0.12, lean - 3, 2);
      c.fillRect(x + 1, S - h * 0.2, lean - 3, 2);
      if (R() > 0.5) c.fillRect(x + 2, S - h + h * 0.3, lean - 5, h * 0.12);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(x + lean - 3, S - h, 2, h);
      x += lean;
    }
  },
  map_shire(c) {
    // The Shire map in Bilbo's study (film): parchment, ink hills, the Water, roads, hobbit holes, a compass rose.
    P.parchment(c);
    c.strokeStyle = 'rgba(70,40,20,0.85)';
    c.lineWidth = 1.5;
    c.strokeRect(8, 8, S - 16, S - 16);
    c.strokeRect(12, 12, S - 24, S - 24);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(20, 150);
    c.bezierCurveTo(70, 120, 110, 170, 150, 130);
    c.bezierCurveTo(175, 110, 190, 120, 206, 96);
    c.strokeStyle = 'rgba(40,70,110,0.8)';
    c.stroke();
    c.strokeStyle = 'rgba(70,40,20,0.8)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      const x = 30 + (i % 3) * 60 + (i * 13) % 20;
      const y = 40 + Math.floor(i / 3) * 34;
      c.beginPath();
      c.arc(x, y, 9, Math.PI, 0);
      c.stroke();
      c.beginPath();
      c.arc(x + 12, y + 2, 7, Math.PI, 0);
      c.stroke();
    }
    c.setLineDash([4, 3]);
    c.beginPath();
    c.moveTo(16, 186);
    c.quadraticCurveTo(110, 160, 208, 190);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(60,30,14,0.9)';
    c.font = 'italic 17px Georgia, serif';
    c.fillText('A Megye', 76, 205);
    c.beginPath();
    c.moveTo(190, 26);
    c.lineTo(196, 44);
    c.lineTo(190, 40);
    c.lineTo(184, 44);
    c.closePath();
    c.fill();
  },
  map_thror(c) {
    // Thrór's map (film): the Lonely Mountain in the middle, Smaug drawn in red above it, rune lines round the edges.
    P.parchment(c);
    c.strokeStyle = 'rgba(60,34,16,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(50, 170);
    c.lineTo(90, 110);
    c.lineTo(112, 84);
    c.lineTo(134, 110);
    c.lineTo(176, 170);
    c.stroke();
    for (const [x, y, a] of [[70, 150, -0.6], [150, 150, 0.6], [112, 120, 0]]) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, 40);
      c.stroke();
      c.restore();
    }
    // Smaug in red.
    c.fillStyle = 'rgba(170,30,20,0.9)';
    c.beginPath();
    c.moveTo(70, 58);
    c.bezierCurveTo(95, 30, 125, 40, 140, 52);
    c.lineTo(165, 34);
    c.lineTo(150, 60);
    c.bezierCurveTo(130, 70, 110, 56, 92, 68);
    c.lineTo(110, 44);
    c.lineTo(84, 60);
    c.closePath();
    c.fill();
    // Rune-like strokes along the edges and the moon-letter corner (pale).
    c.strokeStyle = 'rgba(60,34,16,0.8)';
    c.lineWidth = 1.3;
    const R = rnd(241);
    for (let k = 0; k < 2; k++) {
      for (let x = 18; x < S - 18; x += 9) {
        const y = k ? S - 22 : 18;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 8);
        if (R() > 0.4) {
          c.moveTo(x, y + (R() > 0.5 ? 0 : 4));
          c.lineTo(x + 4, y + 2 + R() * 4);
        }
        c.stroke();
      }
    }
    c.strokeStyle = 'rgba(80,60,40,0.7)';
    c.beginPath();
    c.arc(186, 110, 12, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(186, 96);
    c.lineTo(186, 124);
    c.moveTo(172, 110);
    c.lineTo(200, 110);
    c.stroke();
  },
  parchment(c) {
    pixels(c, (u, v) => {
      const n = fbm(u, v, 3, 5, 251);
      const e = Math.min(u, 1 - u, v, 1 - v);
      const burn = e < 0.06 ? 0.75 + e * 4 : 1;
      return mixc([200, 170, 120], [238, 220, 176], n).map((x) => x * burn);
    });
  },
  clock(c) {
    // A wall clock face: cream dial, black ring, twelve hour marks, hands at a quarter past four.
    c.fillStyle = '#3a2412';
    c.fillRect(0, 0, S, S);
    const m = S / 2;
    c.fillStyle = '#efe4c6';
    c.beginPath();
    c.arc(m, m, m * 0.92, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#2a1a0c';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(m, m, m * 0.86, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath();
      c.moveTo(m + Math.sin(a) * m * 0.7, m - Math.cos(a) * m * 0.7);
      c.lineTo(m + Math.sin(a) * m * 0.8, m - Math.cos(a) * m * 0.8);
      c.stroke();
    }
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(m, m);
    c.lineTo(m + Math.sin(2.2) * m * 0.42, m - Math.cos(2.2) * m * 0.42);
    c.stroke();
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(m, m);
    c.lineTo(m + Math.sin(1.57) * m * 0.62, m - Math.cos(1.57) * m * 0.62);
    c.stroke();
  },
  baro(c) {
    // The barometer dial: a brass ring, a cream dial with an arc scale and a needle.
    c.fillStyle = '#8a6420';
    c.fillRect(0, 0, S, S);
    const m = S / 2;
    c.fillStyle = '#f0e6cc';
    c.beginPath();
    c.arc(m, m, m * 0.88, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#2a1a0c';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(m, m, m * 0.62, Math.PI * 0.75, Math.PI * 2.25);
    c.stroke();
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * 0.75 + (i / 20) * Math.PI * 1.5;
      const l = i % 5 === 0 ? 0.5 : 0.56;
      c.beginPath();
      c.moveTo(m + Math.cos(a) * m * l, m + Math.sin(a) * m * l);
      c.lineTo(m + Math.cos(a) * m * 0.62, m + Math.sin(a) * m * 0.62);
      c.stroke();
    }
    c.lineWidth = 4;
    c.strokeStyle = '#1a1208';
    c.beginPath();
    c.moveTo(m, m);
    c.lineTo(m + Math.cos(Math.PI * 1.7) * m * 0.66, m + Math.sin(Math.PI * 1.7) * m * 0.66);
    c.stroke();
    c.fillStyle = '#c8a04a';
    c.beginPath();
    c.arc(m, m, 7, 0, Math.PI * 2);
    c.fill();
  },
  plate(c) {
    // The West Farthing crockery: a white plate with a green-and-blue painted rim of leaves (face tile, disc UVs).
    const m = S / 2;
    c.fillStyle = '#f2eee2';
    c.fillRect(0, 0, S, S);
    c.strokeStyle = '#3a6a5a';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(m, m, m * 0.92, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.arc(m, m, m * 0.62, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      c.save();
      c.translate(m + Math.cos(a) * m * 0.77, m + Math.sin(a) * m * 0.77);
      c.rotate(a + Math.PI / 2);
      c.fillStyle = i % 2 ? '#4a7a5a' : '#3a5a8a';
      c.beginPath();
      c.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.fillStyle = '#c84a3a';
    c.beginPath();
    c.arc(m, m, 6, 0, Math.PI * 2);
    c.fill();
  },
  window(c) {
    // The view through a round window, painted bright (an emissive face): sky, the far green hills, warm haze.
    pixels(c, (u, v) => {
      const hill = 0.62 + Math.sin(u * 9) * 0.04 + Math.sin(u * 23 + 1) * 0.02;
      if (v < hill) {
        const t = v / hill;
        return mixc([250, 238, 210], [255, 226, 170], t);
      }
      const n = fbm(u, v, 6, 3, 261);
      return mixc([150, 186, 96], [196, 216, 120], n);
    });
  },
  fire(c) {
    // Flames: white-yellow core, orange, deep red at the edges, transparent outside (u across, v up = flame height).
    pixels(c, (u, v) => {
      const h = 1 - v;
      const w = Math.abs(u - 0.5) * 2;
      const n = fbm(u, v, 4, 3, 271);
      const shape = 1 - w / Math.max(0.05, 1 - h * 0.9) + (n - 0.5) * 0.6;
      if (shape <= 0) return [0, 0, 0, 0];
      const t = Math.min(1, shape * 1.4) * (1 - h * 0.6);
      return [...mixc([200, 40, 10], [255, 236, 170], t), 255];
    });
  },
  door(c) {
    // The inside of the round green door: vertical planks.
    pixels(c, (u, v) => {
      const pl = (u * 7) % 1;
      const n = fbm(u, v, 3, 4, 281);
      const g = fbm(u * 3, v, 10, 2, 282);
      const seam = pl < 0.04 ? 0.55 : 1;
      return mixc([34, 90, 46], [60, 128, 70], n * 0.7 + g * 0.3).map((x) => x * seam);
    });
  },
  jamjar(c) {
    // A jar with a paper label (u around, v up): glass with red jam, the label band, a cloth cover at the top.
    pixels(c, (u, v) => {
      const h = 1 - v;
      const n = fbm(u, v, 6, 2, 291);
      if (h > 0.84) return mixc([210, 196, 170], [240, 230, 210], n);
      if (h > 0.3 && h < 0.62 && u > 0.08 && u < 0.6) return h > 0.52 || h < 0.38 ? [220, 206, 170] : [120, 70, 40];
      return mixc([110, 18, 26], [170, 40, 44], n + (Math.abs(u - 0.75) < 0.05 ? 0.6 : 0));
    });
  },
  cobweb(c) {
    // A corner cobweb on transparent: radial threads and sagging rings.
    c.clearRect(0, 0, S, S);
    c.strokeStyle = 'rgba(235,235,230,0.75)';
    c.lineWidth = 1.2;
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 0.5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * S, Math.sin(a) * S);
      c.stroke();
    }
    for (let r = 26; r < S; r += 22) {
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 0.5;
        const rr = r * (1 - 0.08 * Math.sin((i / n) * Math.PI));
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  },
  outline(c) {
    // A "bare slot" mark: the dust-free shape where a piece of furniture stood, with a soft dusty rim.
    pixels(c, (u, v) => {
      const e = Math.min(u, 1 - u, v, 1 - v);
      const n = fbm(u, v, 6, 3, 301);
      const rim = Math.exp(-Math.pow((e - 0.07) / 0.035, 2));
      const inner = e > 0.07 ? 0.18 : 0;
      return [196, 186, 170, (rim * 0.8 + inner) * (0.7 + n * 0.5) * 255];
    });
  },
  pane(c) {
    // Display-case glass: faint blue-white with one soft diagonal glint (alpha tile, glass material).
    pixels(c, (u, v) => {
      const d = Math.abs(((u + v * 0.6) % 1) - 0.3);
      const g = Math.max(0, 1 - d / 0.06) * 30;
      return [225, 238, 244, 16 + g];
    });
  },
  dust(c) {
    // Soft grey dust (the dusty floor patches and the dust sheets' folds in the empty house).
    pixels(c, (u, v) => {
      const n = fbm(u, v, 3, 5, 311);
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      return [176, 168, 156, Math.min(1, Math.max(0, (n - 0.3) * 2.2)) * Math.min(1, Math.max(0, 1.2 - d) * 1.6) * 230];
    });
  },
};

/** Tile list: name → [metres per repeat u, v] (null for face tiles). */
export const LIST = {
  plaster: [1.4, 1.4], earth: [1.6, 1.6], panel: [0.9, 0.95], boards: [1.2, 1.2], quarry: [0.6, 0.6], flags: [1.6, 1.6],
  brick: [0.9, 0.9], beam: [1.2, 0.4], oak: [0.8, 0.8], wood: [0.6, 0.6], iron: [0.4, 0.4], brass: [0.25, 0.25],
  velvet: [0.35, 0.35], quilt: [0.42, 0.42], linen: [0.4, 0.4], leather: [0.4, 0.4], stone: [0.9, 0.9], tilewhite: [0.45, 0.45],
  plain: [1, 1], wax: [0.2, 0.2], crust: [0.25, 0.25], cheese: [0.2, 0.2], ember: [0.3, 0.3], glassdark: [0.2, 0.2],
  parchment: [0.4, 0.4],
  rug_red: null, rug_round: null, runner: null, books: null, map_shire: null, map_thror: null, clock: null, baro: null,
  plate: null, window: null, fire: null, door: null, jamjar: null, cobweb: null, outline: null, dust: null, pane: [0.6, 0.6],
};


/** Tile rectangles: name → { rect: [u0, v0, du, dv] (texture space, flipY), m: [metres per repeat] | null }. */
export function layout() {
  const out = {};
  let i = 0;
  for (const [name, m] of Object.entries(LIST)) {
    const cx = (i % 8) * CELL;
    const cy = Math.floor(i / 8) * CELL;
    out[name] = { rect: [(cx + PAD) / N, 1 - (cy + PAD + S) / N, S / N, S / N], m };
    i++;
  }
  return out;
}

/**
 * Paints every tile into ctx (an N × N 2D context).
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
 * @param {(w: number, h: number) => HTMLCanvasElement|OffscreenCanvas} makeCanvas
 */
export function paintAtlas(ctx, makeCanvas) {
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, N, N);
  const tile = makeCanvas(S, S);
  const tc = tile.getContext('2d', { willReadFrequently: true });
  let i = 0;
  for (const name of Object.keys(LIST)) {
    tc.clearRect(0, 0, S, S);
    tc.save();
    P[name](tc);
    tc.restore();
    const cx = (i % 8) * CELL;
    const cy = Math.floor(i / 8) * CELL;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, CELL, CELL);
    ctx.clip();
    ctx.clearRect(cx, cy, CELL, CELL);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) ctx.drawImage(tile, cx + PAD + ox, cy + PAD + oy);
    ctx.restore();
    i++;
  }
}
