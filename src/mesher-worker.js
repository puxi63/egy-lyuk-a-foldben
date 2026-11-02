/* ==== mesher-worker.js — naive surface nets: one smooth vertex per surface cell, quads across sign changes ==== */
import { CELL, CHUNK, ORIGIN } from './config.js';
import { shadeAt } from './materials.js';
import { FACE_WORDS } from './visibility.js';

const P = CHUNK + 2; // padded samples per axis (18)
const C = P - 1; // cells per axis in the padded block (17)
const vIndex = new Int32Array(C * C * C);
const pos = new Float32Array(C * C * C * 3);
const nrm = new Float32Array(C * C * C * 3);
const col = new Float32Array(C * C * C * 3);
/** Per vertex: cellar clay, troll stone, moisture, roots (0..255, read as normalized weights by the soil shader). */
const soil = new Uint8Array(C * C * C * 4);
const sw = [0, 0, 0, 0];
const idx = new Uint16Array(C * C * C * 18);
const rgb = [0, 0, 0];

// The 8 corner offsets and the 12 cube edges (pairs of corner numbers).
const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const EA = Int32Array.from(EDGES, (e) => e[0]);
const EB = Int32Array.from(EDGES, (e) => e[1]);
const CF = Float64Array.from(CORNERS.flat());
/** Offset of each corner's sample from the cell's first sample in the padded block. */
const COFF = Int32Array.from(CORNERS, ([x, y, z]) => x + P * (y + P * z));

function mesh(d, oi, oj, ok) {
  const t0 = performance.now();
  const at = (x, y, z) => d[x + P * (y + P * z)];
  const cv = new Float32Array(8);
  let nv = 0;
  // Pass 1: a vertex in every cell that the surface crosses. (Flat corner/edge tables and direct indexing: the same
  // arithmetic in the same order as before, without the per-cell closures and destructuring.)
  for (let z = 0; z < C; z++) {
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const base = x + P * (y + P * z);
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = d[base + COFF[c]];
          cv[c] = v;
          if (v > 0) mask |= 1 << c;
        }
        const ci = x + C * (y + C * z);
        if (mask === 0 || mask === 255) {
          vIndex[ci] = -1;
          continue;
        }
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let cnt = 0;
        for (let e = 0; e < 12; e++) {
          const a = EA[e];
          const b = EB[e];
          const va = cv[a];
          const vb = cv[b];
          if (va > 0 === vb > 0) continue;
          const t = va / (va - vb);
          const a3 = a * 3;
          const b3 = b * 3;
          sx += CF[a3] + (CF[b3] - CF[a3]) * t;
          sy += CF[a3 + 1] + (CF[b3 + 1] - CF[a3 + 1]) * t;
          sz += CF[a3 + 2] + (CF[b3 + 2] - CF[a3 + 2]) * t;
          cnt++;
        }
        const wx = ORIGIN.x + (oi + x + sx / cnt) * CELL;
        const wy = ORIGIN.y + (oj + y + sy / cnt) * CELL;
        const wz = ORIGIN.z + (ok + z + sz / cnt) * CELL;
        // Normal towards the air: the negative density gradient over the cell's corners.
        let gx = cv[1] + cv[3] + cv[5] + cv[7] - cv[0] - cv[2] - cv[4] - cv[6];
        let gy = cv[2] + cv[3] + cv[6] + cv[7] - cv[0] - cv[1] - cv[4] - cv[5];
        let gz = cv[4] + cv[5] + cv[6] + cv[7] - cv[0] - cv[1] - cv[2] - cv[3];
        const gl = -Math.hypot(gx, gy, gz) || -1;
        gx /= gl;
        gy /= gl;
        gz /= gl;
        const p3 = nv * 3;
        pos[p3] = wx;
        pos[p3 + 1] = wy;
        pos[p3 + 2] = wz;
        nrm[p3] = gx;
        nrm[p3 + 1] = gy;
        nrm[p3 + 2] = gz;
        shadeAt(wx, wy, wz, gy, rgb, sw);
        col[p3] = rgb[0];
        col[p3 + 1] = rgb[1];
        col[p3 + 2] = rgb[2];
        const p4 = nv * 4;
        soil[p4] = Math.round(sw[0] * 255);
        soil[p4 + 1] = Math.round(sw[1] * 255);
        soil[p4 + 2] = Math.round(sw[2] * 255);
        soil[p4 + 3] = Math.round(sw[3] * 255);
        vIndex[ci] = nv++;
      }
    }
  }
  // Pass 2: a quad for every owned sample edge with a sign change (owned samples are local 1..16 on every axis).
  let ni = 0;
  const cell = (x, y, z) => vIndex[x + C * (y + C * z)];
  const quad = (a, b, c, e, flip) => {
    if (a < 0 || b < 0 || c < 0 || e < 0) return;
    if (flip) {
      idx[ni++] = a; idx[ni++] = c; idx[ni++] = b;
      idx[ni++] = a; idx[ni++] = e; idx[ni++] = c;
    } else {
      idx[ni++] = a; idx[ni++] = b; idx[ni++] = c;
      idx[ni++] = a; idx[ni++] = c; idx[ni++] = e;
    }
  };
  for (let z = 1; z <= CHUNK; z++) {
    for (let y = 1; y <= CHUNK; y++) {
      for (let x = 1; x <= CHUNK; x++) {
        const v0 = at(x, y, z) > 0;
        if (v0 !== at(x + 1, y, z) > 0) quad(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), !v0);
        if (v0 !== at(x, y + 1, z) > 0) quad(cell(x - 1, y, z - 1), cell(x - 1, y, z), cell(x, y, z), cell(x, y, z - 1), !v0);
        if (v0 !== at(x, y, z + 1) > 0) quad(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), !v0);
      }
    }
  }
  return {
    positions: pos.slice(0, nv * 3),
    normals: nrm.slice(0, nv * 3),
    colors: col.slice(0, nv * 3),
    soil: soil.slice(0, nv * 4),
    indices: idx.slice(0, ni),
    ms: performance.now() - t0,
  };
}

/**
 * The open regions of a chunk for the per-view occlusion culling (visibility.js). A cell of the padded block counts as
 * open when any of its 8 corners is air (every rendered surface and every line of sight lies in such cells); open cells
 * are flood-filled with 6-connectivity. Per region: the faces it touches and, per face, which cells of that face's
 * shared layer it holds (the outermost padded cell layer, which is the neighbour chunk's own outermost cell layer on
 * that side, so two neighbours' regions are joined exactly when they share an open cell there). Returns
 * { n, faces: Uint8Array(n), masks: Uint32Array(n * 6 * FACE_WORDS) }, or null when every cell is open.
 */
const openCell = new Uint8Array(C * C * C);
const region = new Int32Array(C * C * C);
const stack = new Int32Array(C * C * C);
function regions(d) {
  let open = 0;
  for (let z = 0; z < C; z++) {
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const base = x + P * (y + P * z);
        let o = 0;
        for (let c = 0; c < 8; c++) {
          if (d[base + COFF[c]] <= 0) {
            o = 1;
            break;
          }
        }
        openCell[x + C * (y + C * z)] = o;
        open += o;
      }
    }
  }
  if (open === C * C * C) return null;
  region.fill(0);
  const faces = [];
  const masks = [];
  const last = C - 1;
  for (let start = 0; start < C * C * C; start++) {
    if (!openCell[start] || region[start]) continue;
    const id = faces.length + 1;
    const m = new Uint32Array(6 * FACE_WORDS);
    let f = 0;
    let sp = 0;
    stack[sp++] = start;
    region[start] = id;
    const mark = (face, u, v) => {
      const bit = u + C * v;
      m[face * FACE_WORDS + (bit >> 5)] |= 1 << (bit & 31);
      f |= 1 << face;
    };
    while (sp) {
      const c = stack[--sp];
      const x = c % C;
      const y = ((c / C) | 0) % C;
      const z = (c / (C * C)) | 0;
      // Face cells indexed (u, v) = the other two axes in x, y, z order.
      if (x === 0) mark(0, y, z);
      if (x === last) mark(1, y, z);
      if (y === 0) mark(2, x, z);
      if (y === last) mark(3, x, z);
      if (z === 0) mark(4, x, y);
      if (z === last) mark(5, x, y);
      if (x > 0 && openCell[c - 1] && !region[c - 1]) { region[c - 1] = id; stack[sp++] = c - 1; }
      if (x < last && openCell[c + 1] && !region[c + 1]) { region[c + 1] = id; stack[sp++] = c + 1; }
      if (y > 0 && openCell[c - C] && !region[c - C]) { region[c - C] = id; stack[sp++] = c - C; }
      if (y < last && openCell[c + C] && !region[c + C]) { region[c + C] = id; stack[sp++] = c + C; }
      if (z > 0 && openCell[c - C * C] && !region[c - C * C]) { region[c - C * C] = id; stack[sp++] = c - C * C; }
      if (z < last && openCell[c + C * C] && !region[c + C * C]) { region[c + C * C] = id; stack[sp++] = c + C * C; }
    }
    // A pocket that touches no face cannot be seen from outside the chunk, but the camera may stand in it: kept.
    faces.push(f);
    masks.push(m);
  }
  const n = faces.length;
  const out = new Uint32Array(n * 6 * FACE_WORDS);
  masks.forEach((m, i) => out.set(m, i * 6 * FACE_WORDS));
  return { n, faces: Uint8Array.from(faces), masks: out };
}

self.onmessage = (ev) => {
  const { key, version, data, oi, oj, ok } = ev.data;
  const r = mesh(data, oi, oj, ok);
  r.regions = regions(data);
  const extra = r.regions ? [r.regions.faces.buffer, r.regions.masks.buffer] : [];
  self.postMessage({ key, version, ...r }, [...extra, r.positions.buffer, r.normals.buffer, r.colors.buffer, r.soil.buffer, r.indices.buffer]);
};
