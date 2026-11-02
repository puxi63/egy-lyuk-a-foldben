/* ==== visibility.js — per-view occlusion culling of the terrain chunks (and of what is buried in them): a flood fill
   from the camera through the open regions of the chunks, so the solid ground hides whatever it encloses. No three.js
   here: the mesher worker imports FACE_WORDS. ==== */
import { CHUNK, CELL, CX, CY, CZ, ORIGIN } from './config.js';

/** Cells per face layer of the padded block (17 × 17) in 32-bit words. */
export const FACE_WORDS = Math.ceil(((CHUNK + 1) * (CHUNK + 1)) / 32);

const N = CX * CY * CZ;
const SIZE = CHUNK * CELL;
/** Half the diagonal of a chunk, plus a little: the distance test of a chunk's centre. */
const CHUNK_RADIUS = 3.5;
/** Metres by which a chunk's box is grown for the frustum test. */
const MARGIN = 0.5;
const STEP = [-1, 1, -CX, CX, -CX * CY, CX * CY];
const OPPOSITE = [1, 0, 3, 2, 5, 4];
const BOX = {
  x0: ORIGIN.x, x1: ORIGIN.x + CX * SIZE,
  y0: ORIGIN.y, y1: ORIGIN.y + CY * SIZE,
  z0: ORIGIN.z, z1: ORIGIN.z + CZ * SIZE,
};
/** Chunk layers whose side faces border the open air outside the block (the air above y = 0). */
const FIRST_OPEN_LAYER = Math.max(0, Math.floor((-0.25 - ORIGIN.y) / SIZE));

/** One region touching every face with every face cell: an all-air chunk, or one not analysed yet. */
export const OPEN_REGIONS = { n: 1, faces: Uint8Array.of(63), masks: new Uint32Array(6 * FACE_WORDS).fill(0xffffffff) };
/** No open cell at all: a solid chunk. */
export const SOLID_REGIONS = { n: 0, faces: new Uint8Array(0), masks: new Uint32Array(0) };

/**
 * Which chunks a camera can possibly see. Each chunk has open regions (mesher-worker.js `regions`: flood-filled open
 * cells, the faces each touches and its cells on each face's shared layer). Per view a breadth-first walk starts in
 * the camera's chunk (or at the faces of the block the camera looks into from outside) and crosses from a region to
 * the neighbour's regions that share an open cell with it on the common face, only forwards (a straight line of sight
 * never turns back along an axis), only into chunks that touch the view frustum's side planes and lie within the fog
 * distance. Conservative: a chunk that is not reached cannot contribute a single pixel. A region reached by several
 * walks keeps the most permissive one (it is walked again when a new arrival allows a direction the earlier ones did
 * not), so no line of sight is lost to the visiting order.
 */
export class ChunkVisibility {
  constructor() {
    /** Per chunk: its open regions. Unknown chunks count as fully open. */
    this.regions = new Array(N).fill(OPEN_REGIONS);
    // Per chunk: per region and entry face (6 = the camera's own chunk), the banned directions of the most
    // permissive arrival (0xff = not arrived that way yet); valid while stamp[key] is this view's stamp.
    this.state = new Array(N).fill(null);
    this.stamp = new Uint32Array(N);
    this.view = 0;
    /** Per view: 1 for every chunk the camera may see (whose space a line of sight may reach, plus the chunks whose
     * meshes reach into such a chunk). */
    this.visible = new Uint8Array(N);
    this.reached = new Uint8Array(N);
    this.tested = new Uint8Array(N); // 0 untested, 1 inside the view, 2 outside
    this.queue = [];
    this.count = 0;
  }

  /** Sets a chunk's regions (null: every cell open; SOLID_REGIONS for a solid chunk). */
  setRegions(key, r) {
    this.regions[key] = r || OPEN_REGIONS;
    this.state[key] = null;
  }

  /** True when the chunk's box touches the frustum's side planes and its centre is within reach. */
  inView(key, cam, planes, r2) {
    const t = this.tested[key];
    if (t) return t === 1;
    const cx = key % CX;
    const cy = ((key / CX) | 0) % CY;
    const cz = (key / (CX * CY)) | 0;
    const x0 = ORIGIN.x + cx * SIZE;
    const y0 = ORIGIN.y + cy * SIZE;
    const z0 = ORIGIN.z + cz * SIZE;
    const dx = x0 + SIZE / 2 - cam.x;
    const dy = y0 + SIZE / 2 - cam.y;
    const dz = z0 + SIZE / 2 - cam.z;
    let ok = dx * dx + dy * dy + dz * dz < r2;
    // The four side planes only: the near plane would drop chunks between the eye and the near plane.
    for (let p = 0; ok && p < 16; p += 4) {
      const nx = planes[p];
      const ny = planes[p + 1];
      const nz = planes[p + 2];
      // The box grown by MARGIN: the frustum's edge rows of pixels must not depend on rounding.
      const px = nx > 0 ? x0 + SIZE + MARGIN : x0 - MARGIN;
      const py = ny > 0 ? y0 + SIZE + MARGIN : y0 - MARGIN;
      const pz = nz > 0 ? z0 + SIZE + MARGIN : z0 - MARGIN;
      if (nx * px + ny * py + nz * pz + planes[p + 3] < 0) ok = false;
    }
    this.tested[key] = ok ? 1 : 2;
    return ok;
  }

  /** Records an arrival at (chunk, region, entry face) with its banned directions; queues it when it allows more. */
  push(key, region, entry, banned) {
    let st = this.state[key];
    const rg = this.regions[key];
    if (!st || st.length < rg.n * 7) st = this.state[key] = new Uint8Array(Math.max(7, rg.n * 7));
    if (this.stamp[key] !== this.view) {
      this.stamp[key] = this.view;
      st.fill(0xff);
    }
    const s = region * 7 + entry;
    const old = st[s];
    if (old !== 0xff && (old & ~banned) === 0) return; // nothing new allowed
    st[s] = old === 0xff ? banned : old & banned;
    this.queue.push(key, region, entry);
  }

  /**
   * Fills `visible` for one view.
   * @param {{x:number,y:number,z:number}} cam camera position
   * @param {Float32Array|number[]} planes the frustum's four side planes as (nx, ny, nz, d), inside where n·p + d ≥ 0
   * @param {number} maxDist the fog's far distance (nothing beyond it can be seen)
   * @returns {number} how many chunks may be seen
   */
  compute(cam, planes, maxDist) {
    const r = maxDist + CHUNK_RADIUS;
    const r2 = r * r;
    this.view = (this.view + 1) >>> 0 || 1;
    this.visible.fill(0);
    this.tested.fill(0);
    const q = this.queue;
    q.length = 0;
    const W = FACE_WORDS;
    // Every region of a chunk that touches a face (no shared-cell test: arrivals from the camera or from outside).
    const pushAll = (key, face, banned, entry) => {
      const rg = this.regions[key];
      for (let s = 0; s < rg.n; s++) if (face < 0 || rg.faces[s] & (1 << face)) this.push(key, s, entry, banned);
    };
    const inside = cam.x >= BOX.x0 && cam.x < BOX.x1 && cam.y >= BOX.y0 && cam.y < BOX.y1 && cam.z >= BOX.z0 && cam.z < BOX.z1;
    if (inside) {
      const cx = Math.floor((cam.x - BOX.x0) / SIZE);
      const cy = Math.floor((cam.y - BOX.y0) / SIZE);
      const cz = Math.floor((cam.z - BOX.z0) / SIZE);
      const key = cx + CX * (cy + CY * cz);
      this.visible[key] = 1;
      // The camera's own chunk: it may see out through any face (even from inside a wall).
      for (let f = 0; f < 6; f++) {
        if ((f === 0 && cx === 0) || (f === 1 && cx === CX - 1) || (f === 2 && cy === 0) || (f === 3 && cy === CY - 1) || (f === 4 && cz === 0) || (f === 5 && cz === CZ - 1)) continue;
        const nk = key + STEP[f];
        if (!this.inView(nk, cam, planes, r2)) continue;
        const e = OPPOSITE[f];
        pushAll(nk, e, 1 << e, e);
      }
    } else {
      // Seen from outside: the faces of the block that border open air and face the camera.
      const seed = (key, face) => {
        if (this.inView(key, cam, planes, r2)) pushAll(key, face, 1 << face, face);
      };
      if (cam.y >= BOX.y1) for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) seed(cx + CX * (CY - 1 + CY * cz), 3);
      for (let cy = FIRST_OPEN_LAYER; cy < CY; cy++) {
        for (let n = 0; n < CX; n++) {
          if (cam.x < BOX.x0 && n < CZ) seed(CX * (cy + CY * n), 0);
          if (cam.x >= BOX.x1 && n < CZ) seed(CX - 1 + CX * (cy + CY * n), 1);
          if (cam.z < BOX.z0) seed(n + CX * cy, 4);
          if (cam.z >= BOX.z1) seed(n + CX * (cy + CY * (CZ - 1)), 5);
        }
      }
    }
    for (let h = 0; h < q.length; h += 3) {
      const key = q[h];
      const reg = q[h + 1];
      const entry = q[h + 2];
      const banned = this.state[key][reg * 7 + entry];
      this.visible[key] = 1;
      const rg = this.regions[key];
      const touch = rg.faces[reg];
      const cx = key % CX;
      const cy = ((key / CX) | 0) % CY;
      const cz = (key / (CX * CY)) | 0;
      for (let f = 0; f < 6; f++) {
        if (banned & (1 << f) || !(touch & (1 << f))) continue;
        if ((f === 0 && cx === 0) || (f === 1 && cx === CX - 1) || (f === 2 && cy === 0) || (f === 3 && cy === CY - 1) || (f === 4 && cz === 0) || (f === 5 && cz === CZ - 1)) continue;
        const nk = key + STEP[f];
        if (!this.inView(nk, cam, planes, r2)) continue;
        const e = OPPOSITE[f];
        const nb = banned | (1 << e);
        const ng = this.regions[nk];
        const a0 = (reg * 6 + f) * W;
        for (let s = 0; s < ng.n; s++) {
          if (!(ng.faces[s] & (1 << e))) continue;
          // Joined only when the two regions share an open cell of the common layer.
          const b0 = (s * 6 + e) * W;
          let shared = false;
          for (let w = 0; w < W && !shared; w++) shared = (rg.masks[a0 + w] & ng.masks[b0 + w]) !== 0;
          if (shared) this.push(nk, s, e, nb);
        }
      }
    }
    // A chunk's mesh reaches one cell into its −x, −y and −z neighbours (the mesher's padded first cell), so a chunk is
    // drawn when it or one of those seven neighbours was reached.
    const reached = this.reached;
    reached.set(this.visible);
    let count = 0;
    for (let key = 0; key < N; key++) {
      if (!reached[key]) continue;
      const cx = key % CX;
      const cy = ((key / CX) | 0) % CY;
      const cz = (key / (CX * CY)) | 0;
      for (let o = 1; o < 8; o++) {
        const x = cx + (o & 1);
        const y = cy + ((o >> 1) & 1);
        const z = cz + ((o >> 2) & 1);
        if (x >= CX || y >= CY || z >= CZ) continue;
        this.visible[x + CX * (y + CY * z)] = 1;
      }
    }
    for (let key = 0; key < N; key++) count += this.visible[key];
    this.count = count;
    return count;
  }
}
