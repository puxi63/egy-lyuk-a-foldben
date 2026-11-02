/* ==== underground/sdf-mesh.js — sculpting with signed distance functions: a few SDF primitives and smooth blends,
   and a small surface-nets mesher that turns an SDF into a smooth mesh (raw arrays; no three.js, so it runs in the
   generator worker) ==== */

/** Polynomial smooth minimum (blends two distances over about k metres). */
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth subtraction of b from a. */
export function ssub(a, b, k) {
  return -smin(-a, b, k);
}

/** Distance to a segment a→b with a radius that goes from ra to rb (a rounded cone, approximate). */
export function cone(px, py, pz, a, b, ra, rb) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const vz = b[2] - a[2];
  const l2 = vx * vx + vy * vy + vz * vz;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy + (pz - a[2]) * vz) / l2));
  return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t, pz - a[2] - vz * t) - (ra + (rb - ra) * t);
}

/** Approximate distance to an axis-aligned ellipsoid at c with radii r. */
export function ellipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0];
  const y = (py - c[1]) / r[1];
  const z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const k1 = Math.sqrt((x * x) / (r[0] * r[0]) + (y * y) / (r[1] * r[1]) + (z * z) / (r[2] * r[2]));
  return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}

/**
 * Surface nets of `fn(x, y, z)` (negative inside) over the box [min, max] with the given cell size. Returns raw
 * non-indexed triangles { position, normal (from the SDF gradient), uv (zeros), color } as Float32Arrays, or null.
 * `colorFn(x, y, z, nx, ny, nz, out)` optionally fills a vertex colour.
 */
export function meshSdf(fn, min, max, cell, colorFn = null) {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const f = new Float32Array(nx * ny * nz);
  // A coarse pass every 4 samples: far from the surface (more than the coarse step away) the coarse value's sign is
  // the true sign (an SDF changes by at most the distance), so only samples near the surface are evaluated exactly.
  const C4 = 4;
  const gx = Math.ceil(nx / C4) + 1;
  const gy = Math.ceil(ny / C4) + 1;
  const gz = Math.ceil(nz / C4) + 1;
  const coarse = new Float32Array(gx * gy * gz);
  for (let k = 0; k < gz; k++) {
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) coarse[i + gx * (j + gy * k)] = fn(min[0] + i * C4 * cell, min[1] + j * C4 * cell, min[2] + k * C4 * cell);
    }
  }
  const far = C4 * cell * 1.8;
  for (let k = 0; k < nz; k++) {
    const ck = Math.round(k / C4);
    for (let j = 0; j < ny; j++) {
      const cj = Math.round(j / C4);
      for (let i = 0; i < nx; i++) {
        const c = coarse[Math.round(i / C4) + gx * (cj + gy * ck)];
        f[i + nx * (j + ny * k)] = Math.abs(c) > far ? c : fn(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
      }
    }
  }
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const vid = new Int32Array(cx * cy * cz).fill(-1);
  const vp = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const o = corner[c];
          cv[c] = f[i + o[0] + nx * (j + o[1] + ny * (k + o[2]))];
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          if (cv[a] < 0 === cv[b] < 0) continue;
          const t = cv[a] / (cv[a] - cv[b]);
          sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
          sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
          sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
          n++;
        }
        vid[i + cx * (j + cy * k)] = vp.length / 3;
        vp.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
      }
    }
  }
  const nv = vp.length / 3;
  if (!nv) return null;
  // Normals from the SDF gradient (central differences on the function itself: smoother than the grid).
  const vn = new Float32Array(nv * 3);
  const e = cell * 0.5;
  for (let v = 0; v < nv; v++) {
    const x = vp[v * 3];
    const y = vp[v * 3 + 1];
    const z = vp[v * 3 + 2];
    const gx = fn(x + e, y, z) - fn(x - e, y, z);
    const gy = fn(x, y + e, z) - fn(x, y - e, z);
    const gz = fn(x, y, z + e) - fn(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    vn[v * 3] = gx / l;
    vn[v * 3 + 1] = gy / l;
    vn[v * 3 + 2] = gz / l;
  }
  const tris = [];
  const cell3 = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= cx || j >= cy || k >= cz ? -1 : vid[i + cx * (j + cy * k)]);
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < cz; k++) {
    for (let j = 1; j < cy; j++) {
      for (let i = 1; i < cx; i++) {
        const in0 = f[i + nx * (j + ny * k)] < 0;
        if (in0 !== f[i + 1 + nx * (j + ny * k)] < 0) quad(cell3(i, j - 1, k - 1), cell3(i, j, k - 1), cell3(i, j, k), cell3(i, j - 1, k));
        if (in0 !== f[i + nx * (j + 1 + ny * k)] < 0) quad(cell3(i - 1, j, k - 1), cell3(i - 1, j, k), cell3(i, j, k), cell3(i, j, k - 1));
        if (in0 !== f[i + nx * (j + ny * (k + 1))] < 0) quad(cell3(i - 1, j - 1, k), cell3(i, j - 1, k), cell3(i, j, k), cell3(i - 1, j, k));
      }
    }
  }
  const nt = tris.length / 3;
  const pos = new Float32Array(nt * 9);
  const nor = new Float32Array(nt * 9);
  const col = new Float32Array(nt * 9);
  const rgb = [0.5, 0.5, 0.5];
  const vc = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    if (colorFn) colorFn(vp[v * 3], vp[v * 3 + 1], vp[v * 3 + 2], vn[v * 3], vn[v * 3 + 1], vn[v * 3 + 2], rgb);
    vc[v * 3] = rgb[0];
    vc[v * 3 + 1] = rgb[1];
    vc[v * 3 + 2] = rgb[2];
  }
  for (let t = 0; t < nt; t++) {
    let a = tris[t * 3];
    let b = tris[t * 3 + 1];
    const c = tris[t * 3 + 2];
    // Wind every triangle to face along the gradient (outwards).
    const ux = vp[b * 3] - vp[a * 3];
    const uy = vp[b * 3 + 1] - vp[a * 3 + 1];
    const uz = vp[b * 3 + 2] - vp[a * 3 + 2];
    const wx = vp[c * 3] - vp[a * 3];
    const wy = vp[c * 3 + 1] - vp[a * 3 + 1];
    const wz = vp[c * 3 + 2] - vp[a * 3 + 2];
    const fx = uy * wz - uz * wy;
    const fy = uz * wx - ux * wz;
    const fz = ux * wy - uy * wx;
    if (fx * (vn[a * 3] + vn[b * 3] + vn[c * 3]) + fy * (vn[a * 3 + 1] + vn[b * 3 + 1] + vn[c * 3 + 1]) + fz * (vn[a * 3 + 2] + vn[b * 3 + 2] + vn[c * 3 + 2]) < 0) {
      const s = a;
      a = b;
      b = s;
    }
    const ids = [a, b, c];
    for (let q = 0; q < 3; q++) {
      const v = ids[q];
      for (let d = 0; d < 3; d++) {
        pos[t * 9 + q * 3 + d] = vp[v * 3 + d];
        nor[t * 9 + q * 3 + d] = vn[v * 3 + d];
        col[t * 9 + q * 3 + d] = vc[v * 3 + d];
      }
    }
  }
  return { position: pos, normal: nor, uv: new Float32Array(nt * 6), color: col };
}
