/* ==== noise.js — small deterministic hash and value noise (shared by the main thread and the mesher worker) ==== */

/** Integer hash of three ints to [0, 1). */
export function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

/** 3D value noise in [0, 1). */
export function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const fz = fade(z - zi);
  const a = hash3(xi, yi, zi);
  const b = hash3(xi + 1, yi, zi);
  const c = hash3(xi, yi + 1, zi);
  const d = hash3(xi + 1, yi + 1, zi);
  const e = hash3(xi, yi, zi + 1);
  const f = hash3(xi + 1, yi, zi + 1);
  const g = hash3(xi, yi + 1, zi + 1);
  const h = hash3(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * fx;
  const x2 = c + (d - c) * fx;
  const x3 = e + (f - e) * fx;
  const x4 = g + (h - g) * fx;
  const y1 = x1 + (x2 - x1) * fy;
  const y2 = x3 + (x4 - x3) * fy;
  return y1 + (y2 - y1) * fz;
}

/** 2D value noise in [0, 1) (a z = 0 slice of the 3D noise). */
export function noise2(x, z) {
  return noise3(x, 0.5, z);
}

/** Two-octave 3D noise in [0, 1). */
export function fbm3(x, y, z) {
  return (noise3(x, y, z) * 2 + noise3(x * 2.03, y * 2.03, z * 2.03)) / 3;
}

/** Small seeded PRNG (mulberry32). */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
