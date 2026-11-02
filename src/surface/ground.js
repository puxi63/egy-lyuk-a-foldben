/* ==== surface/ground.js — the land around the pit: the flat walkable meadow (y = 0 inside the player's ±60 m bounds),
   the rolling hills beyond it, the Bywater valley with its lake, the winding lanes, grass tufts and wild flowers ==== */
import * as THREE from 'three';
import { CELL, ORIGIN } from '../config.js';
import { noise3 } from '../noise.js';
import { plant } from './flora.js';
import { fbm2, inPit, noise2, rng, smoothstep } from './kit.js';

/** Bywater: the lake, its arm to the west (crossed by the double-arched bridge) and the mill on the north shore. */
export const LAKE = { x: 34, z: -108, r: 13, armTo: { x: 2, z: -116 }, armR: 3.6, y: -1.15 };
export const MILL_POS = { x: 37, z: -93 };
export const BRIDGE_POS = { x: 16, z: -112 };
/** The Party Field's tree and Bag End's position (the hill builder and the oak use them). */
export const PARTY_TREE = { x: -27, z: -33 };

const ringDist = (x, z) => Math.pow(Math.abs(x) ** 6 + Math.abs(z) ** 6, 1 / 6);

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

/** Signed distance to the lake's shore (negative on the water). */
export function waterDist(x, z) {
  const c = Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.r;
  const a = segDist(x, z, LAKE.x, LAKE.z, LAKE.armTo.x, LAKE.armTo.z) - LAKE.armR;
  return Math.min(c, a);
}

/**
 * Ground height at (x, z). Exactly 0 inside the walkable square (the player's collision uses flat analytic ground there);
 * beyond it rolling hills rise towards a rim that hides the edge of the world, with a valley opening towards Bywater.
 */
export function groundHeight(x, z) {
  const d = ringDist(x, z);
  if (d < 57) return 0;
  const m = smoothstep(57, 95, d);
  let h = m * (2.5 + 12 * fbm2(x * 0.011 + 3.1, z * 0.011 - 5.7) + 4 * noise2(x * 0.035, z * 0.035));
  // Gentle undulation: the set's soft, "dug-out" knolls and hollows (grows with the distance, none near the meadow).
  h += smoothstep(60, 110, d) * 2.4 * (noise2(x * 0.045 + 11.3, z * 0.045 - 4.1) - 0.45);
  h += smoothstep(105, 150, d) * 14;
  // The valley from the garden down to Bywater, and the lake basin.
  const cv = 1 - smoothstep(10, 34, segDist(x, z, 6, -50, LAKE.x - 6, LAKE.z + 6));
  h *= 1 - 0.85 * cv;
  const wd = waterDist(x, z);
  const basin = 1 - smoothstep(0, 22, wd);
  h = h * (1 - basin) - 1.0 * basin * smoothstep(57, 70, d);
  if (wd < 0) h -= 1.4 * smoothstep(0, -3.5, wd);
  return h;
}

/** Grid lines between a and b: fine near the pit, coarser far away (shared by neighbouring strips: no cracks). */
function lines(a, b) {
  const out = [a];
  let v = a;
  while (v < b - 1e-6) {
    const d = Math.min(Math.abs(v), Math.abs(v + 0.1));
    const step = d < 40 ? 2 : d < 70 ? 3 : 4;
    v = Math.min(b, v + step);
    if (b - v < step * 0.35 && v !== b) v = b;
    out.push(v);
  }
  return out;
}

function gridGeo(xs, zs, hFn) {
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const o = j * nx + i;
      pos.set([xs[i], hFn(xs[i], zs[j]), zs[j]], o * 3);
      uv.set([xs[i], zs[j]], o * 2);
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Distance from (x, z) to the pit block's edge (0 on the seam). */
function holeDist(x, z, lo, hi) {
  const dx = Math.max(lo - x, 0, x - hi);
  const dz = Math.max(lo - z, 0, z - hi);
  return Math.hypot(dx, dz);
}

/** The field a point belongs to (fields are 22 × 18 m cells), as a value in [0, 1) choosing its kind. */
export function fieldType(x, z) {
  return noise2(Math.floor(x / 22) * 3.7, Math.floor(z / 18) * 5.1);
}

/** Lawn / meadow colour: the terrain's own top colour on the seam, the Shire's greens further out. */
export function groundColor(x, z, h, lo, hi, out) {
  const hd = holeDist(x, z, lo, hi);
  // The terrain mesher's grass top (materials.js colorAt) for a seamless edge.
  // Its fine noise only on the 0.25 m skirt; further out its mean colour, blended into the lawn over 4 m.
  const v = 1 + (0.82 + 0.36 * noise3(x * 1.7, 0, z * 1.7) - 1) * (1 - smoothstep(0, 1.2, hd));
  const tr = 0.22 * v;
  const tg = 0.42 * v;
  const tb = 0.12 * v;
  const n1 = fbm2(x * 0.06, z * 0.06);
  const n2 = noise2(x * 0.23 + 7, z * 0.23 - 3);
  // Lush lawn with yellower sunny patches and darker clumps.
  const n3 = noise2(x * 0.9 - 11, z * 0.9 + 4);
  let r = 0.24 + 0.2 * n1 - 0.06 * n2 + 0.05 * n3;
  let g = 0.45 + 0.12 * n1 - 0.08 * n2 + 0.04 * n3;
  let b = 0.1 + 0.04 * n1;
  // Patchwork fields on the far hills (the hedgerows in shire.js run along the same 22 × 18 m field edges): lush
  // pasture, golden hay meadows, pale grazed grass, darker grass in the hedgerows' shade.
  const far = smoothstep(55, 90, ringDist(x, z));
  if (far > 0) {
    const field = fieldType(x, z);
    let fr = r;
    let fg = g;
    let fb = b;
    if (field < 0.3) {
      fr *= 0.82;
      fg *= 0.96;
    } else if (field < 0.52) {
      fr += 0.13;
      fg += 0.05;
      fb -= 0.02;
    } else if (field < 0.7) {
      fr += 0.05;
      fg += 0.06;
      fb += 0.02;
    }
    const ex = Math.min(((x % 22) + 22) % 22, 22 - (((x % 22) + 22) % 22));
    const ez = Math.min(((z % 18) + 18) % 18, 18 - (((z % 18) + 18) % 18));
    const shade = 1 - 0.3 * (1 - smoothstep(1, 4.5, Math.min(ex, ez)));
    r = r + (fr * shade - r) * far;
    g = g + (fg * shade - g) * far;
    b = b + (fb * shade - b) * far;
  }
  // Damp, darker grass by the lake.
  const wd = waterDist(x, z);
  if (wd < 6) {
    const k = 1 - smoothstep(-1, 6, wd);
    r *= 1 - 0.35 * k;
    g *= 1 - 0.2 * k;
    b *= 1 - 0.1 * k;
  }
  if (h < -1.12) {
    r = 0.25;
    g = 0.22;
    b = 0.14;
  }
  const w = 1 - smoothstep(0, 4, hd);
  out[0] = tr * w + r * (1 - w);
  out[1] = tg * w + g * (1 - w);
  out[2] = tb * w + b * (1 - w);
}

/**
 * The ground mesh: a 0.25 m skirt around the pit (its inner edge matches the terrain's outer vertices exactly; see
 * buildSurface) and a variable-resolution grid out to 150 m. Returns one geometry with vertex colours.
 */
export function groundGeometry() {
  const R = 150;
  // The terrain mesh's outermost vertices sit at cell centres, half a cell beyond the block's −x/−z faces and half a
  // cell short of its +x/+z faces: the hole matches them exactly (no gap, no overlap).
  const lo = ORIGIN.x - CELL / 2;
  const hi = -ORIGIN.x - CELL / 2;
  const fine = (a, b) => {
    const out = [];
    const n = Math.round((b - a) / 0.25);
    for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
    return out;
  };
  const geos = [];
  const flat = () => 0;
  // Skirt: 1.5 m around the hole at 0.25 m (flat), four strips.
  const S = 1.5;
  geos.push(gridGeo(fine(lo - S, hi + S), fine(lo - S, lo), flat));
  geos.push(gridGeo(fine(lo - S, hi + S), fine(hi, hi + S), flat));
  geos.push(gridGeo(fine(lo - S, lo), fine(lo, hi), flat));
  geos.push(gridGeo(fine(hi, hi + S), fine(lo, hi), flat));
  // The rest: four strips around the skirt with shared grid lines.
  const a = lo - S;
  const b = hi + S;
  const xsAll = [...lines(-R, a).slice(0, -1), ...lines(a, b).slice(0, -1), ...lines(b, R)];
  const neg = lines(-R, a);
  const mid = lines(a, b);
  const pos = lines(b, R);
  geos.push(gridGeo(xsAll, neg, groundHeight));
  geos.push(gridGeo(xsAll, pos, groundHeight));
  geos.push(gridGeo(neg, mid, groundHeight));
  geos.push(gridGeo(pos, mid, groundHeight));
  const out = [];
  const c = [0, 0, 0];
  for (const g of geos) {
    g.computeVertexNormals();
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      groundColor(p.getX(i), p.getZ(i), p.getY(i), lo, hi, c);
      col.set(c, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.push(g);
  }
  return { geos: out, lo, hi };
}

/* ---- lanes: dirt-and-gravel ribbons following the ground, with soft grassy edges (vertex alpha) ---- */

/** The lanes as point lists (x, z). The main lane: Bag End's gate → past the counter → round the pit → Bywater. */
export const LANES = [
  {
    w: 1.7,
    pts: [[-8, 17.6], [-6, 15.4], [-2.5, 14.2], [1.5, 13.7], [5.5, 14.6], [9.5, 14.3], [13.6, 11.5], [15.3, 5], [15.4, -3],
      [14.6, -10], [12.5, -16.5], [8, -22], [5.5, -30], [8, -42], [11, -54], [15, -66], [21, -79], [24, -89], [21, -99], [17.5, -104], [16, -107.2]],
  },
  { w: 1.3, pts: [[12.5, -16.5], [4, -17.4], [-6, -17.8], [-14, -20.5], [-21, -26], [-25, -30.5]] },
  { w: 1.1, pts: [[24, -89], [30, -88], [35, -89.5]] },
  { w: 1.5, pts: [[16, -117.8], [15.5, -121], [13, -127], [9, -134]] },
  { w: 1.0, pts: [[-14, -20.5], [-22, -19], [-30, -16], [-40, -18], [-50, -24], [-58, -34], [-64, -44]] },
];

/** Smooth point list along a lane (Catmull-Rom in xz). */
export function lanePoints(lane, step = 0.6) {
  const curve = new THREE.CatmullRomCurve3(lane.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.ceil(curve.getLength() / step);
  return curve.getSpacedPoints(n);
}

/**
 * Distance from (x, z) to the nearest lane edge (for keeping flowers and tufts off the lanes). Exact within about 6 m
 * of a lane; farther away it returns at least 6 (the lane samples are hashed in 6 m cells).
 */
const LANE_CELL = 6;
let laneGrid = null;
export function laneDist(x, z) {
  if (!laneGrid) {
    laneGrid = new Map();
    for (const l of LANES) {
      for (const p of lanePoints(l, 1.0)) {
        const k = `${Math.floor(p.x / LANE_CELL)},${Math.floor(p.z / LANE_CELL)}`;
        if (!laneGrid.has(k)) laneGrid.set(k, []);
        laneGrid.get(k).push([p.x, p.z, l.w]);
      }
    }
  }
  const cx = Math.floor(x / LANE_CELL);
  const cz = Math.floor(z / LANE_CELL);
  let best = LANE_CELL;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const list = laneGrid.get(`${cx + i},${cz + j}`);
      if (!list) continue;
      for (const [px, pz, w] of list) {
        const d = Math.hypot(x - px, z - pz) - w / 2;
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/** Lane ribbons: three vertices across (edge alpha 0, centre alpha 1), lifted 3 cm over the ground. */
export function laneGeometry() {
  const rand = rng(7);
  const geos = [];
  for (const lane of LANES) {
    const pts = lanePoints(lane);
    const pos = [];
    const uv = [];
    const col = [];
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const o = pts[Math.max(0, i - 1)];
      let tx = q.x - o.x;
      let tz = q.z - o.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      if (i > 0) along += p.distanceTo(pts[i - 1]);
      const w = lane.w * (0.85 + 0.3 * noise2(p.x * 0.3, p.z * 0.3));
      for (let s = -2; s <= 2; s++) {
        const k = s / 2;
        const jitter = (rand() - 0.5) * 0.12;
        let x = p.x - tz * (k * w + jitter);
        let z = p.z + tx * (k * w + jitter);
        if (inPit(x, z, 0.05)) {
          // Never draw over the pit block (the lane passes near its east side).
          x = Math.sign(x) * Math.max(Math.abs(x), 12.1);
        }
        pos.push(x, groundHeight(x, z) + 0.03 + (Math.abs(s) < 2 ? 0.005 : 0), z);
        uv.push(k * w * 1.1, along * 1.1);
        const a = Math.abs(s) === 2 ? 0 : Math.abs(s) === 1 ? 0.75 : 0.95;
        // Worn centre slightly lighter; grass creeps in along the middle strip of the far lanes.
        const l = 0.95 + rand() * 0.1;
        col.push(l, l * 0.98, l * 0.94, a);
      }
    }
    const idx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      for (let s = 0; s < 4; s++) {
        const a = i * 5 + s;
        idx.push(a, a + 1, a + 5, a + 1, a + 6, a + 5);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    geos.push(g);
  }
  return geos;
}

/* ---- grass tufts and wild flowers ---- */

/** One tuft: three crossed blade quads (normals up, so they light like the lawn). */
function tuftGeo(h, w) {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    g.rotateY((k * Math.PI) / 3);
    parts.push(g);
  }
  const pos = [];
  const uv = [];
  const idx = [];
  let base = 0;
  for (const g of parts) {
    pos.push(...g.attributes.position.array);
    uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + base);
    base += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Scatters grass tufts over the lawns (dense near the pit and the lanes' verges, sparser further out; also in the
 * cracks of the lanes: the set is lived-in, not pristine). `avoid(x, z)` returns true where nothing may grow.
 */
export function scatterTufts(batch, avoid) {
  const rand = rng(1234);
  let n = 0;
  for (let i = 0; i < 9000 && n < 3200; i++) {
    const r = 12.5 + Math.pow(rand(), 1.6) * 48;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r * 1.15;
    const z = Math.sin(a) * r * 1.15;
    if (inPit(x, z, 0.4) || Math.abs(x) > 60 || Math.abs(z) > 60 || avoid(x, z)) continue;
    const ld = laneDist(x, z);
    // Lanes: no tufts on the worn strips, only a few small weeds in the cracks of the middle.
    const weed = ld < -0.35;
    if ((ld < 0.15 && !weed) || (weed && rand() > 0.05)) continue;
    const h = weed ? 0.08 + rand() * 0.06 : (ld < 0.8 ? 0.2 : 0.12) + rand() * 0.14;
    const g = tuftGeo(h, h * 1.1);
    const m = new THREE.Matrix4().makeRotationY(rand() * 6.28).setPosition(x, 0, z);
    const c = new THREE.Color(0.62 + rand() * 0.2, 0.82 + rand() * 0.15, 0.4 + rand() * 0.1);
    batch.add('tuft', g, c, m, { ao: h, aoMin: 0.8 });
    n++;
  }
}

/**
 * Wild flowers in the meadow, in drifts (a noise mask): daisies, buttercups and clover, a few poppies (flora cards).
 * Along the lane verges and the meadow's rim, tall grass with seed heads.
 */
export function scatterWildflowers(batch, avoid) {
  const rand = rng(4321);
  const kinds = ['daisy', 'meadow', 'meadow', 'daisy', 'poppy'];
  const tints = [0xffffff, 0xf8e040, 0xffffff, 0xf0b8d8, 0xffffff];
  for (let i = 0; i < 2600; i++) {
    const x = (rand() - 0.5) * 118;
    const z = (rand() - 0.5) * 118;
    if (inPit(x, z, 0.5) || avoid(x, z) || laneDist(x, z) < 0.3) continue;
    if (noise2(x * 0.12 + 5, z * 0.12 - 2) < 0.55) continue;
    const k = Math.floor(noise2(x * 0.05, z * 0.05) * 5 + rand() * 1.5) % kinds.length;
    plant(batch, x, groundHeight(x, z), z, kinds[k], { tint: tints[k], scale: 0.55 + rand() * 0.35 });
  }
  // Long grass on the lane verges (the worn strip stays clear) and in rough patches further out.
  for (let i = 0; i < 9000; i++) {
    const x = (rand() - 0.5) * 118;
    const z = (rand() - 0.5) * 118;
    if (inPit(x, z, 0.5) || avoid(x, z)) continue;
    const ld = laneDist(x, z);
    const verge = ld > 0.15 && ld < 0.9;
    const rough = Math.max(Math.abs(x), Math.abs(z)) > 40 && noise2(x * 0.08 - 3, z * 0.08 + 8) > 0.66;
    if (!(verge && rand() < 0.5) && !(rough && rand() < 0.12)) continue;
    plant(batch, x, groundHeight(x, z), z, rand() < 0.8 ? 'grass' : rand() < 0.5 ? 'dock' : 'meadow', { scale: 0.6 + rand() * 0.4 });
  }
}
