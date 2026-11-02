/* ==== bagend/furniture.js — the furnishing slots of Bag End (TERV 0.13, Decision 19: fixed slots, 2–4 tiers) ====
 * Every slot: id, room, Hungarian name, interaction point `at` (local x, z), its tiers (name, base price in gold,
 * comfort points, effect text) and build(b, k, d) which writes tier k's models into the builder (k = 0: the bare
 * slot of the plundered house: a dust-free outline on the floor or a pale mark on the wall) and returns its
 * colliders and lights. `dep`: the model also depends on another slot's tier d (chairs follow the table, the kettle
 * stands on the range when there is one).
 *
 * Decision 18 (nothing invented): the items are from the book or the films (the pegs, the wall clock and the
 * barometer of the hall; seed-cake, raspberry jam, apple-tart, cheese, pork-pie in the pantry — the dwarves ate them
 * in chapter 1; his mother's West Farthing crockery and the kettle; Bilbo's armchair by the fire, his pipe, the
 * doilies; the clock on the mantelpiece; his desk, the Shire map and Thrór's map, his book; casks and wine racks;
 * the mathom room's cases; the bed; the dwarves' hoods in the book's colours) or plain household things. */
import * as THREE from 'three';
import { flame } from './shell.js';

const WALNUT = 0x7a5236;
const OAKT = 0xb88a5a;
const DARK = 0x5a3a24;
const IRON = 0x8a8a8a;
const BRASS = 0xffffff;
const BEAM = 0xd8c8b4;

/** A few linear helpers for colours (tints are hex sRGB, converted by the builder). */
const c3 = (hex, k = 1) => {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
};

/* ---------------------------------------------------------------- small parts */

/** A bare-slot outline on the floor (the dust-free shape where a piece stood). */
function outline(b, x, z, w, d, ry = 0, y = 0) {
  b.add(new THREE.PlaneGeometry(w + 0.2, d + 0.2), { x, y: y + 0.006, z, rx: -Math.PI / 2, ry, uv: 'face', tile: 'outline', glass: true, kind: 3 });
}

/** A pale mark on a wall where something hung (nx, nz: the wall's inward normal). */
function wallMark(b, x, y, z, w, h, nx, nz) {
  b.add(new THREE.PlaneGeometry(w + 0.12, h + 0.12), { x: x + nx * 0.006, y, z: z + nz * 0.006, ry: Math.atan2(nx, nz), uv: 'face', tile: 'outline', glass: true, kind: 3, tint: [1.15, 1.12, 1.08] });
}

/** Turned leg / spindle. */
function leg(b, x, y, z, h, r = 0.025, tint = WALNUT) {
  b.lathe([[r * 0.8, 0], [r, h * 0.08], [r * 0.7, h * 0.2], [r * 1.2, h * 0.5], [r * 0.7, h * 0.8], [r, h * 0.92], [r * 0.9, h]], 8, { x, y, z, tile: 'wood', tint, v: 1, u: 1 });
}

/** A table: top w × d at height h, four turned legs, an apron. */
function table(b, x, z, w, d, h = 0.72, o = {}) {
  const tint = o.tint ?? WALNUT;
  b.at(x, 0, z, o.ry || 0, (t) => {
    t.box(w, 0.05, d, { y: h - 0.05, tile: 'oak', tint: o.top ?? 0xd8b088 });
    t.box(w - 0.14, 0.09, d - 0.14, { y: h - 0.14, tile: 'wood', tint });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(t, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), h - 0.05, 0.03, tint);
  });
}

/** A hobbit chair with a round-topped back (faces +z before ry). */
function chair(b, x, z, ry, tint = WALNUT, cushion = null) {
  b.at(x, 0, z, ry, (c) => {
    c.box(0.42, 0.05, 0.4, { y: 0.42, tile: 'wood', tint });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(c, sx * 0.17, 0, sz * 0.16, 0.42, 0.018, tint);
    for (const sx of [-1, 1]) c.box(0.04, 0.5, 0.04, { x: sx * 0.18, y: 0.45, z: -0.17, tile: 'wood', tint });
    // The round back: a half-disc board with a carved ring.
    c.add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(0), { y: 0.78, z: -0.17, tile: 'wood', tint, uv: 'planar' });
    c.box(0.4, 0.06, 0.03, { y: 0.74, z: -0.17, tile: 'wood', tint });
    c.box(0.04, 0.24, 0.025, { y: 0.52, z: -0.17, tile: 'wood', tint });
    if (cushion) c.box(0.38, 0.04, 0.36, { y: 0.47, tile: 'velvet', tint: cushion });
  });
}

/** A jar (lathe) with the jam / preserve label tile. */
function jar(b, x, y, z, s = 1, tint = 0xffffff) {
  b.lathe([[0.0, 0], [0.045 * s, 0], [0.05 * s, 0.02 * s], [0.05 * s, 0.1 * s], [0.04 * s, 0.12 * s], [0.042 * s, 0.135 * s], [0.0, 0.14 * s]], 10, { x, y, z, tile: 'jamjar', uv: 'native', u: 1, v: 1, tint });
}

/** A wine bottle lying (axis along a) or standing. */
function bottle(b, x, y, z, ry = 0, lying = true) {
  const pts = [[0, 0], [0.036, 0], [0.038, 0.02], [0.038, 0.2], [0.03, 0.24], [0.013, 0.27], [0.013, 0.32], [0.016, 0.33], [0, 0.33]];
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0.0005, r), h)), 8);
  if (lying) g.rotateX(Math.PI / 2);
  b.add(g, { x, y, z, ry, tile: 'glassdark', uv: 'native', u: 1, v: 1 });
}

/** A plate: West Farthing crockery (disc with the painted rim tile and a shallow rim). */
function plate(b, x, y, z, r = 0.11, o = {}) {
  const g = new THREE.CircleGeometry(r, 18);
  if (o.upright) {
    b.add(g, { x, y, z, rx: o.tilt ?? -0.2, ry: o.ry || 0, uv: 'face', tile: 'plate' });
    return;
  }
  g.rotateX(-Math.PI / 2);
  b.add(g, { x, y: y + 0.012, z, uv: 'face', tile: 'plate' });
  b.cyl(r, r * 0.7, 0.012, 18, { x, y, z, tile: 'plain', tint: 0xf0ece0, open: true });
}

/** A cup with a saucer. */
function cup(b, x, y, z, tint = 0xf2eee2) {
  b.cyl(0.06, 0.06, 0.008, 12, { x, y, z, tile: 'plain', tint });
  b.lathe([[0.025, 0], [0.04, 0.01], [0.045, 0.05], [0.042, 0.055]], 10, { x, y: y + 0.008, z, tile: 'plain', tint: 0xf0ebe0 });
}

/** A candle on a holder, with its flame; returns the flame position. */
function candle(b, x, y, z, h = 0.14, holder = 'brass') {
  b.cyl(0.045, 0.055, 0.02, 10, { x, y, z, tile: holder, tint: holder === 'brass' ? BRASS : IRON });
  b.cyl(0.012, 0.016, 0.06, 6, { x, y: y + 0.02, z, tile: holder, tint: holder === 'brass' ? BRASS : IRON });
  b.cyl(0.016, 0.017, h, 8, { x, y: y + 0.07, z, tile: 'wax' });
  flame(b, x, y + 0.07 + h, z, 0.03, 0.06);
  return [x, y + 0.07 + h + 0.04, z];
}

/** A lantern hanging or standing (iron frame, glowing glass); returns its light point. */
function lantern(b, x, y, z) {
  b.box(0.14, 0.02, 0.14, { center: true, x, y, z, tile: 'iron' });
  b.box(0.12, 0.18, 0.12, { x, y: y + 0.01, z, tile: 'fire', uv: 'face', kind: 1, tint: [1.4, 1.0, 0.6] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.015, 0.2, 0.015, { x: x + sx * 0.065, y, z: z + sz * 0.065, tile: 'iron' });
  b.cyl(0.02, 0.08, 0.06, 8, { x, y: y + 0.2, z, tile: 'iron' });
  b.torus(0.03, 0.006, { x, y: y + 0.28, z, tile: 'iron' }, 4, 10);
  return [x, y + 0.12, z];
}

/** A shelf unit: uprights, boards at the given heights, against a wall (faces +z before ry). */
function shelves(b, x, z, ry, w, d, heights, tint = OAKT) {
  b.at(x, 0, z, ry, (s) => {
    for (const sx of [-1, 1]) s.box(0.05, heights[heights.length - 1] + 0.06, d, { x: sx * (w / 2 - 0.025), tile: 'wood', tint });
    for (const h of heights) {
      s.box(w, 0.035, d, { y: h, tile: 'wood', tint });
      s.box(w - 0.1, 0.05, 0.02, { y: h - 0.05, z: d / 2 - 0.01, tile: 'wood', tint: new THREE.Color(tint).multiplyScalar(0.8) });
    }
    s.box(w, 0.1, d, { y: 0, tile: 'wood', tint: new THREE.Color(tint).multiplyScalar(0.7) });
  });
}

/** A cask lying along x (or z with ry), on the floor level y (bottom). */
function cask(b, x, y, z, r = 0.26, len = 0.62, ry = 0, tap = false) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([r * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * len - len / 2]);
  }
  const g = new THREE.LatheGeometry(pts.map(([rr, h]) => new THREE.Vector2(rr, h)), 14);
  g.rotateZ(Math.PI / 2);
  b.add(g, { x, y: y + r, z, ry, tile: 'beam', uv: 'native', u: 6, v: 1, tint: 0xd8b898 });
  for (const s of [-1, 1]) {
    const cap = new THREE.CircleGeometry(r * 0.86, 14);
    cap.rotateY(s * Math.PI / 2);
    b.add(cap, { x: x + Math.cos(ry) * s * len / 2, y: y + r, z: z - Math.sin(ry) * s * len / 2, ry, tile: 'oak', uv: 'planar', tint: 0xa08060 });
    for (const k of [0.12, 0.38]) {
      const hr = r * (0.86 + 0.14 * Math.sin((0.5 - k + 0.5) * Math.PI)) + 0.004;
      b.torus(hr, 0.008, { x: x + Math.cos(ry) * s * len * (0.5 - k), y: y + r, z: z - Math.sin(ry) * s * len * (0.5 - k), ry: ry + Math.PI / 2, tile: 'iron', tint: 0x6a6a6a }, 4, 16);
    }
  }
  if (tap) b.box(0.03, 0.08, 0.03, { x: x + Math.cos(ry) * (len / 2 + 0.02), y: y + r * 0.5, z: z - Math.sin(ry) * (len / 2 + 0.02), tile: 'brass' });
}

/** A rug on the floor. */
function rug(b, x, z, w, d, tile, ry = 0, tint = 0xffffff) {
  if (tile === 'rug_round') {
    b.add(new THREE.CircleGeometry(w / 2, 28).rotateX(-Math.PI / 2).scale(1, 1, d / w), { x, y: 0.008, z, ry, uv: 'face', tile, tint });
    return;
  }
  b.add(new THREE.PlaneGeometry(w, d), { x, y: 0.008, z, rx: -Math.PI / 2, ry, uv: tile === 'runner' ? 'native' : 'face', u: tile === 'runner' ? w / 0.9 : 1, v: 1, tile, tint });
}

/** A framed picture / map on a wall (nx, nz inward normal). */
function framed(b, x, y, z, w, h, nx, nz, tile, frame = WALNUT) {
  const ry = Math.atan2(nx, nz);
  b.at(x, y, z, ry, (f) => {
    f.box(w + 0.08, h + 0.08, 0.025, { center: true, z: 0.012, tile: 'wood', tint: frame });
    f.plane(w, h, { z: 0.027, tile });
  });
}

/** A dwarf's hood hanging from a peg by its point (cloth, tinted); `tassel`: Thorin's long silver tassel (book). */
function hood(b, x, y, z, nx, nz, tint, tassel = false) {
  const ry = Math.atan2(nx, nz);
  b.at(x, y, z, ry, (h) => {
    h.lathe([[0.0, -0.36], [0.07, -0.34], [0.11, -0.26], [0.1, -0.14], [0.05, -0.05], [0.012, 0]], 10, { z: 0.07, tile: 'velvet', tint, sz: 0.5 });
    h.box(0.2, 0.03, 0.06, { y: -0.37, z: 0.07, tile: 'velvet', tint: c3(tint, 0.8) });
    if (tassel) {
      h.cyl(0.012, 0.012, 0.3, 6, { y: -0.68, z: 0.07, tile: 'plain', tint: 0xd8dce4 });
      h.cyl(0.03, 0.012, 0.08, 8, { y: -0.74, z: 0.07, tile: 'plain', tint: 0xd8dce4 });
    }
  });
}

/** A loaf / round cake (crust). */
function cake(b, x, y, z, r = 0.09, h = 0.07, tint = 0xffffff, seeds = false) {
  b.lathe([[0, 0], [r, 0], [r * 1.02, h * 0.6], [r * 0.8, h * 0.95], [0, h]], 12, { x, y, z, tile: 'crust', uv: 'native', u: 2, v: 1, tint });
  if (seeds) for (let i = 0; i < 7; i++) b.box(0.008, 0.004, 0.012, { x: x + Math.cos(i * 2.4) * r * 0.5, y: y + h * 0.97, z: z + Math.sin(i * 2.4) * r * 0.5, ry: i, tile: 'plain', tint: 0x3a2a1a });
}

/** A cheese wheel. */
function cheese(b, x, y, z, r = 0.12, h = 0.09) {
  b.cyl(r, r, h, 16, { x, y, z, tile: 'cheese', u: 3, v: 1 });
  b.disc(r * 0.99, 16, { x, y: y + h + 0.001, z, tile: 'cheese', uv: 'planar' });
}

/** A pie (apple-tart: flat with a lattice; pork-pie: tall raised pie). */
function pie(b, x, y, z, kind) {
  if (kind === 'tart') {
    b.cyl(0.13, 0.11, 0.04, 16, { x, y, z, tile: 'crust', u: 3, v: 1, tint: 0xf0d0a0 });
    b.disc(0.12, 16, { x, y: y + 0.041, z, tile: 'crust', uv: 'planar', tint: 0xc89050 });
    for (let i = -2; i <= 2; i++) {
      b.box(0.012, 0.008, 0.22, { x: x + i * 0.04, y: y + 0.041, z, tile: 'crust', tint: 0xffe0b0 });
      b.box(0.22, 0.008, 0.012, { x, y: y + 0.045, z: z + i * 0.04, tile: 'crust', tint: 0xffe0b0 });
    }
  } else {
    b.cyl(0.075, 0.085, 0.11, 12, { x, y, z, tile: 'crust', u: 2, v: 1, tint: 0xf0c890 });
    b.lathe([[0, 0], [0.078, 0], [0.07, 0.025], [0.02, 0.03], [0, 0.03]], 12, { x, y: y + 0.11, z, tile: 'crust', tint: 0xd8a060 });
  }
}

/* ---------------------------------------------------------------- the slots */

const T = (name, price, comfort, effect = '', desc = '') => ({ name, price, comfort, effect, desc });

export const SLOTS = [
  /* ===== Előszoba (hall) ===== */
  {
    id: 'fogasok', room: 'eloszoba', name: 'Kalap- és kabátfogasok', at: [-1.15, 1.2],
    tiers: [
      T('Egy sor fogas', 30, 2, 'Váratlan vendégek: 4 törpe marad, és ingyen ás veled.'),
      T('Két sor fogas', 120, 3, 'Váratlan vendégek: 8 törpe marad.'),
      T('Fogasfal tizenhárom vendégnek', 350, 5, 'Váratlan vendégek: mind a 13 törpe marad.', 'A törpék csuklyái a könyv színeiben.'),
    ],
    build(b, k) {
      const x = -1.8;
      if (!k) {
        wallMark(b, x, 1.5, 1.2, 1.5, 0.12, 1, 0);
        return {};
      }
      // The dwarves' hoods in the book's colours (ch. 1): Dwalin dark green, Balin scarlet, Fíli and Kíli blue, Dori
      // Nori Ori purple, Óin Glóin white, Bifur Bofur yellow, Bombur pale green, Thorin sky blue.
      const hoods = [0x2a4a2a, 0xb8202a, 0x2a4a9a, 0x2a4a9a, 0x5a2a6a, 0x5a2a6a, 0x5a2a6a, 0xe8e4dc, 0xe8e4dc, 0xd8b030, 0xd8b030, 0x9ac088, 0x8ab8e0];
      const rails = k === 1 ? [[1.6, 4]] : k === 2 ? [[1.6, 4], [1.15, 4]] : [[1.66, 7], [1.18, 7]];
      let n = 0;
      for (const [y, count] of rails) {
        const len = count === 7 ? 1.7 : 1.1;
        b.box(0.03, 0.1, len, { x: x + 0.015, y: y - 0.05, z: 1.2, tile: 'wood', tint: WALNUT });
        for (let i = 0; i < count; i++) {
          const z = 1.2 - len / 2 + 0.1 + (i * (len - 0.2)) / (count - 1);
          b.cyl(0.012, 0.018, 0.1, 6, { x: x + 0.07, y: y, z, rz: -Math.PI / 2, tile: 'wood', tint: DARK });
          b.sphere(0.02, { x: x + 0.12, y: y, z, tile: 'wood', tint: DARK }, 6, 4);
          const show = k === 1 ? i === 1 : k === 2 ? (i % 2 === 0) : true;
          if (show && n < 13 && (k === 3 || y > 1.4 || i < 2)) {
            hood(b, x + 0.06, y, z, 1, 0, k === 3 ? hoods[n] : [0x6a4a2a, 0x3a5a3a, 0x8a3a2a, 0x4a4a6a][n % 4], k === 3 && n === 12);
            n++;
          }
        }
      }
      return { colliders: k >= 2 ? [{ x: x + 0.12, z: 1.2, hw: 0.12, hd: 0.85 }] : [] };
    },
  },
  {
    id: 'ora', room: 'eloszoba', name: 'Falióra', at: [1.15, 0.7],
    tiers: [T('Egyszerű falióra', 40, 2), T('Faragott falióra ingával', 160, 4, '', 'Az óra a könyv előszobájából.')],
    build(b, k) {
      const x = 1.8;
      const z = 0.7;
      if (!k) {
        wallMark(b, x, 1.6, z, 0.4, 0.4, -1, 0);
        return {};
      }
      b.at(x, 0, z, -Math.PI / 2, (c) => {
        if (k === 1) {
          c.cyl(0.19, 0.19, 0.07, 20, { center: true, y: 1.62, z: 0.035, rx: Math.PI / 2, tile: 'wood', tint: WALNUT });
          c.add(new THREE.CircleGeometry(0.16, 20), { y: 1.62, z: 0.072, uv: 'face', tile: 'clock' });
        } else {
          c.box(0.34, 0.86, 0.12, { y: 1.05, tile: 'wood', tint: DARK });
          c.box(0.4, 0.06, 0.15, { y: 1.9, tile: 'wood', tint: WALNUT });
          c.add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), { y: 1.96, z: 0.05, tile: 'wood', tint: DARK, uv: 'planar' });
          c.add(new THREE.CircleGeometry(0.14, 20), { y: 1.72, z: 0.125, uv: 'face', tile: 'clock' });
          c.box(0.22, 0.4, 0.01, { y: 1.12, z: 0.12, tile: 'plain', tint: 0x2a1a10 });
          c.box(0.012, 0.3, 0.012, { y: 1.2, z: 0.13, tile: 'brass' });
          c.cyl(0.05, 0.05, 0.012, 12, { center: true, y: 1.18, z: 0.135, rx: Math.PI / 2, tile: 'brass' });
          c.box(0.36, 0.05, 0.14, { y: 1.0, tile: 'wood', tint: WALNUT });
        }
      });
      return {};
    },
  },
  {
    id: 'barometer', room: 'eloszoba', name: 'Barométer', at: [1.15, 1.5],
    tiers: [T('Fa barométer', 35, 2, '', 'A barométer a könyv előszobájából.'), T('Réz barométer', 140, 3)],
    build(b, k) {
      const x = 1.8;
      const z = 1.5;
      if (!k) {
        wallMark(b, x, 1.45, z, 0.26, 0.7, -1, 0);
        return {};
      }
      const tile = k === 1 ? 'wood' : 'brass';
      const tint = k === 1 ? 0x8a5a34 : 0xffffff;
      b.at(x, 0, z, -Math.PI / 2, (c) => {
        // A banjo barometer: the round dial below, the long neck with the thermometer above.
        c.cyl(0.15, 0.15, 0.045, 20, { center: true, y: 1.25, z: 0.022, rx: Math.PI / 2, tile, tint });
        c.add(new THREE.CircleGeometry(0.12, 20), { y: 1.25, z: 0.047, uv: 'face', tile: 'baro' });
        c.box(0.08, 0.5, 0.04, { y: 1.38, tile, tint });
        c.box(0.012, 0.36, 0.01, { y: 1.44, z: 0.042, tile: 'plain', tint: 0xb02020 });
        c.cyl(0.06, 0.06, 0.04, 14, { center: true, y: 1.92, z: 0.02, rx: Math.PI / 2, tile, tint });
        if (k === 2) c.torus(0.155, 0.012, { y: 1.25, z: 0.045, tile: 'brass' }, 6, 24);
      });
      return {};
    },
  },
  {
    id: 'botok', room: 'eloszoba', name: 'Sétabot- és esernyőtartó', at: [1.1, 2.1],
    tiers: [T('Tartó egy sétabottal', 25, 1), T('Tartó botokkal és esernyővel', 90, 2)],
    build(b, k) {
      const x = 1.55;
      const z = 2.05;
      if (!k) {
        outline(b, x, z, 0.26, 0.26);
        return {};
      }
      b.lathe([[0, 0], [0.12, 0], [0.13, 0.05], [0.11, 0.5], [0.12, 0.55], [0.1, 0.56]], 14, { x, y: 0, z, tile: 'plain', tint: 0x9a7a5a });
      b.cyl(0.124, 0.124, 0.06, 14, { x, y: 0.4, z, tile: 'plain', tint: 0x3a5a4a, open: true });
      const sticks = k === 1 ? [[0.02, 0.01, 0.95, 0x5a3a20]] : [[0.02, 0.01, 0.95, 0x5a3a20], [-0.04, 0.04, 1.0, 0x3a2414], [0.03, -0.05, 0.9, 0x7a5030]];
      for (const [dx, dz, h, t] of sticks) {
        b.cyl(0.012, 0.014, h, 6, { x: x + dx, y: 0.03, z: z + dz, rx: dz * 2, rz: -dx * 2, tile: 'wood', tint: t });
        b.torus(0.04, 0.011, { x: x + dx + 0.04, y: h + 0.02, z: z + dz, tile: 'wood', tint: t }, 4, 8, Math.PI);
      }
      if (k === 2) {
        b.lathe([[0.005, 0], [0.05, 0.2], [0.06, 0.55], [0.01, 0.75]], 8, { x: x - 0.03, y: 0.05, z: z - 0.03, tile: 'velvet', tint: 0x2a3a2a });
        b.cyl(0.01, 0.01, 0.2, 6, { x: x - 0.03, y: 0.8, z: z - 0.03, tile: 'wood', tint: DARK });
      }
      return { colliders: [{ x, z, hw: 0.16, hd: 0.16 }] };
    },
  },
  {
    id: 'futoszonyeg', room: 'eloszoba', name: 'Futószőnyeg', at: [0, 2.8], reach: 1.2,
    tiers: [T('Fonott futószőnyeg', 30, 1), T('Mintás futószőnyeg', 110, 2)],
    build(b, k) {
      if (!k) return {};
      rug(b, 0, 2.3, 3.4, 0.95, 'runner', Math.PI / 2, k === 1 ? 0x9a8a70 : 0xffffff);
      return {};
    },
  },

  /* ===== Nappali (parlour) ===== */
  {
    id: 'kandallo', room: 'nappali', name: 'Kandalló', at: [6.75, 1.0],
    tiers: [
      T('Kisöpört kandalló, rőzse', 50, 2, 'Pihenés a tűz mellett: −5 % éhezés a következő úton.'),
      T('Lobogó tűz, rézeszközök', 180, 4, 'Pihenés: −10 % éhezés.'),
      T('Faragott párkány, gyertyák, kandallóóra', 450, 6, 'Pihenés: −15 % éhezés.', 'Az óra a kandallópárkányon (könyv, 1. fejezet).'),
    ],
    build(b, k) {
      const x1 = 8.1;
      const zc = 2.1;
      const lights = [];
      if (!k) {
        // Cold ash and a broken log in the empty hearth.
        b.box(0.5, 0.012, 0.7, { x: x1 - 0.28, y: 0.04, z: zc, tile: 'ember', tint: 0x333333 });
        b.cyl(0.04, 0.05, 0.4, 6, { center: true, x: x1 - 0.3, y: 0.08, z: zc + 0.1, rx: Math.PI / 2, ry: 0.4, tile: 'beam', tint: 0x6a6a6a });
        return {};
      }
      // Firedogs and logs, the fire.
      for (const dz of [-0.28, 0.28]) {
        b.box(0.34, 0.03, 0.03, { x: x1 - 0.3, y: 0.08, z: zc + dz, tile: 'iron' });
        b.box(0.03, 0.2, 0.03, { x: x1 - 0.46, y: 0.04, z: zc + dz, tile: 'iron' });
        b.sphere(0.03, { x: x1 - 0.46, y: 0.25, z: zc + dz, tile: k >= 2 ? 'brass' : 'iron' }, 8, 6);
      }
      b.box(0.36, 0.03, 0.62, { x: x1 - 0.28, y: 0.04, z: zc, tile: 'ember', kind: 1, tint: [1.2, 0.9, 0.7] });
      const logs = k === 1 ? 2 : 3;
      for (let i = 0; i < logs; i++) b.cyl(0.05, 0.055, 0.56, 7, { center: true, x: x1 - 0.32 + (i % 2) * 0.08, y: 0.13 + Math.floor(i / 2) * 0.08, z: zc, rx: Math.PI / 2, ry: (i - 1) * 0.25, tile: 'beam', tint: 0x6a4a34 });
      const fh = k === 1 ? 0.24 : 0.42;
      for (let i = 0; i < (k === 1 ? 3 : 5); i++) flame(b, x1 - 0.3, 0.12, zc - 0.2 + i * (0.4 / ((k === 1 ? 3 : 5) - 1)), 0.18, fh * (0.75 + ((i * 7) % 3) * 0.15));
      lights.push({ p: [x1 - 0.6, 0.5, zc], c: k === 1 ? [1.1, 0.55, 0.22] : [2.0, 1.0, 0.45], range: k === 1 ? 5.0 : 7.5, flicker: true });
      if (k >= 2) {
        // A brass fender and the fire irons on a stand.
        b.box(0.03, 0.08, 1.2, { x: x1 - 0.86, y: 0.04, z: zc, tile: 'brass' });
        b.box(0.36, 0.08, 0.03, { x: x1 - 0.68, y: 0.04, z: zc - 0.6, tile: 'brass' });
        b.box(0.36, 0.08, 0.03, { x: x1 - 0.68, y: 0.04, z: zc + 0.6, tile: 'brass' });
        b.cyl(0.07, 0.09, 0.03, 10, { x: x1 - 0.7, y: 0.04, z: zc + 0.82, tile: 'brass' });
        b.cyl(0.012, 0.012, 0.6, 6, { x: x1 - 0.7, y: 0.06, z: zc + 0.82, tile: 'brass' });
        for (let i = 0; i < 3; i++) b.cyl(0.008, 0.008, 0.55, 5, { x: x1 - 0.7 + (i - 1) * 0.04, y: 0.1, z: zc + 0.8, rz: (i - 1) * 0.08, tile: 'iron' });
      }
      if (k >= 3) {
        // The carved wooden mantel, two candlesticks, the clock on the mantelpiece, the crockery.
        b.box(0.32, 0.07, 2.0, { x: x1 - 0.42, y: 1.25, z: zc, tile: 'oak', tint: 0xa87850 });
        b.box(0.08, 0.16, 1.9, { x: x1 - 0.54, y: 1.1, z: zc, tile: 'wood', tint: WALNUT });
        for (const dz of [-0.92, 0.92]) b.box(0.08, 1.1, 0.12, { x: x1 - 0.54, y: 0, z: zc + dz, tile: 'wood', tint: WALNUT });
        lights.push({ p: candle(b, x1 - 0.4, 1.32, zc - 0.75), c: [0.7, 0.45, 0.22], range: 3.2, flicker: true });
        candle(b, x1 - 0.4, 1.32, zc + 0.75);
        b.box(0.12, 0.22, 0.26, { x: x1 - 0.4, y: 1.32, z: zc, tile: 'wood', tint: DARK });
        b.add(new THREE.CircleGeometry(0.08, 16), { x: x1 - 0.339, y: 1.45, z: zc, ry: -Math.PI / 2, uv: 'face', tile: 'clock' });
        plate(b, x1 - 0.45, 1.42, zc - 0.4, 0.09, { upright: true, ry: -Math.PI / 2, tilt: 0.2 });
        plate(b, x1 - 0.45, 1.42, zc + 0.4, 0.09, { upright: true, ry: -Math.PI / 2, tilt: 0.2 });
      }
      return { lights };
    },
  },
  {
    id: 'karosszek', room: 'nappali', name: 'Bilbó karosszéke', at: [5.55, 2.85],
    tiers: [
      T('Kopott karosszék', 60, 2, 'Leülhetsz pihenni: a következő úton lassabban éhezel.'),
      T('Bilbó karosszéke', 220, 4, 'A pihenés erősebb és tovább tart.'),
      T('Karosszék, zsámoly és csipketerítők', 480, 6, 'A legjobb pihenés.', 'Anyja csipketerítői (film).'),
    ],
    build(b, k) {
      const x = 6.3;
      const z = 2.1;
      if (!k) {
        outline(b, x, z, 0.8, 0.8, Math.PI / 2);
        return {};
      }
      const fabric = k === 1 ? 0x7a6a50 : 0x8a2a22;
      b.at(x, 0, z, Math.PI / 2, (a) => {
        // Faces +x (the fire): the chair's front is local +z.
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(a, sx * 0.32, 0, sz * 0.3, 0.16, 0.025, DARK);
        a.box(0.76, 0.24, 0.72, { y: 0.14, tile: 'velvet', tint: fabric });
        a.box(0.62, 0.1, 0.6, { y: 0.38, z: 0.04, tile: 'velvet', tint: c3(fabric, 1.15) });
        a.box(0.7, k === 1 ? 0.62 : 0.78, 0.16, { y: 0.36, z: -0.29, rx: -0.1, tile: 'velvet', tint: fabric });
        a.box(0.74, 0.5, 0.04, { y: 0.14, z: -0.36, tile: 'wood', tint: DARK });
        for (const sx of [-1, 1]) {
          a.box(0.12, 0.28, 0.66, { x: sx * 0.33, y: 0.38, z: 0.02, tile: 'velvet', tint: fabric });
          a.cyl(0.07, 0.07, 0.66, 10, { center: true, x: sx * 0.33, y: 0.66, z: 0.02, rx: Math.PI / 2, tile: 'velvet', tint: fabric });
          if (k >= 2) a.box(0.1, 0.5, 0.26, { x: sx * 0.34, y: 0.66, z: -0.2, ry: sx * 0.12, tile: 'velvet', tint: fabric });
        }
        if (k >= 2) a.cyl(0.35, 0.35, 0.16, 14, { center: true, y: 1.12, z: -0.35, rx: Math.PI / 2, tile: 'velvet', tint: fabric, t0: -Math.PI / 2, tl: Math.PI });
        if (k >= 3) {
          // Doilies on the arms and the headrest, a footstool before the fire.
          for (const sx of [-1, 1]) a.box(0.15, 0.005, 0.24, { x: sx * 0.33, y: 0.735, z: 0.15, tile: 'linen', tint: 0xfffaf0 });
          a.plane(0.3, 0.22, { y: 1.15, z: -0.185, tile: 'linen', tint: 0xfffaf0 });
          a.box(0.4, 0.2, 0.32, { y: 0.06, z: 0.75, tile: 'velvet', tint: fabric });
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(a, sx * 0.16, 0, 0.75 + sz * 0.12, 0.08, 0.018, DARK);
        }
      });
      return { colliders: [{ x, z, hw: 0.4, hd: 0.42 }, ...(k >= 3 ? [{ x: x + 0.75, z, hw: 0.17, hd: 0.21 }] : [])] };
    },
  },
  {
    id: 'pipa', room: 'nappali', name: 'Pipa és teázóasztalka', at: [5.55, 1.15],
    tiers: [
      T('Kis asztal, Bilbó pipájával', 40, 1, 'Pipafüst-verseny Gandalffal (ha betoppan).'),
      T('Pipatartó, dohányosdoboz, csipketerítő, teáscsésze', 150, 3),
    ],
    build(b, k) {
      const x = 6.25;
      const z = 1.05;
      if (!k) {
        outline(b, x, z, 0.5, 0.5);
        return {};
      }
      b.cyl(0.26, 0.26, 0.04, 18, { x, y: 0.56, z, tile: 'oak', tint: 0xc09060 });
      b.lathe([[0.03, 0], [0.04, 0.1], [0.025, 0.3], [0.045, 0.45], [0.03, 0.56]], 8, { x, y: 0, z, tile: 'wood', tint: WALNUT });
      b.cyl(0.18, 0.2, 0.03, 12, { x, y: 0, z, tile: 'wood', tint: WALNUT });
      // Bilbo's long pipe: bowl and stem.
      b.cyl(0.006, 0.006, 0.34, 6, { center: true, x: x - 0.05, y: 0.62, z: z - 0.02, rz: Math.PI / 2, ry: 0.5, tile: 'wood', tint: 0x4a2a14 });
      b.cyl(0.02, 0.016, 0.04, 8, { x: x + 0.1, y: 0.6, z: z + 0.07, tile: 'wood', tint: 0x6a3a1a });
      if (k >= 2) {
        b.disc(0.2, 18, { x, y: 0.602, z, tile: 'linen', tint: 0xfffaf0 });
        cup(b, x - 0.1, 0.603, z + 0.1);
        b.box(0.12, 0.06, 0.08, { x: x + 0.08, y: 0.6, z: z - 0.1, tile: 'wood', tint: 0x6a3a1a });
        // A pipe rack with three pipes.
        b.box(0.18, 0.02, 0.05, { x: x - 0.05, y: 0.6, z: z - 0.15, tile: 'wood', tint: DARK });
        b.box(0.18, 0.02, 0.05, { x: x - 0.05, y: 0.7, z: z - 0.15, tile: 'wood', tint: DARK });
        for (let i = 0; i < 3; i++) b.cyl(0.005, 0.005, 0.16, 5, { x: x - 0.11 + i * 0.06, y: 0.6, z: z - 0.15, tile: 'wood', tint: 0x4a2a14 });
      }
      return { colliders: [{ x, z, hw: 0.26, hd: 0.26 }] };
    },
  },
  {
    id: 'szonyeg', room: 'nappali', name: 'Szőnyeg a kandalló előtt', at: [4.6, 2.1], reach: 1.4,
    tiers: [T('Foltozott szőnyeg', 40, 1), T('Nagy, kerek, mintás szőnyeg', 160, 3)],
    build(b, k) {
      if (!k) return {};
      if (k === 1) rug(b, 6.2, 2.1, 1.6, 2.0, 'rug_red', 0, 0x9a8a7a);
      else rug(b, 6.1, 2.1, 2.8, 2.6, 'rug_round');
      return {};
    },
  },
  {
    id: 'falipolc', room: 'nappali', name: 'Polc a csecsebecséknek', at: [4.2, 3.4],
    tiers: [T('Falipolc néhány csecsebecsével', 70, 2), T('Teli tálaló porcelánnal és könyvekkel', 230, 3)],
    build(b, k) {
      const z = 4.2;
      if (!k) {
        wallMark(b, 4.2, 1.5, z, 1.6, 0.6, 0, -1);
        return {};
      }
      if (k === 1) {
        b.box(1.6, 0.04, 0.22, { x: 4.2, y: 1.45, z: z - 0.11, tile: 'wood', tint: WALNUT });
        for (const dx of [-0.65, 0.65]) b.box(0.04, 0.16, 0.18, { x: 4.2 + dx, y: 1.3, z: z - 0.1, tile: 'wood', tint: WALNUT });
        b.lathe([[0, 0], [0.05, 0], [0.07, 0.08], [0.03, 0.18], [0.04, 0.22]], 10, { x: 3.7, y: 1.49, z: z - 0.1, tile: 'plain', tint: 0xf0ebe0 });
        plate(b, 4.2, 1.6, z - 0.06, 0.1, { upright: true, tilt: 0.15, ry: Math.PI });
        b.box(0.14, 0.1, 0.1, { x: 4.7, y: 1.49, z: z - 0.1, tile: 'wood', tint: 0x8a5a2a });
        return {};
      }
      // A dresser: cupboard below, open shelves above with crockery and books.
      b.box(1.7, 0.85, 0.48, { x: 4.2, y: 0, z: z - 0.24, tile: 'wood', tint: WALNUT });
      for (const dx of [-0.42, 0.42]) b.box(0.74, 0.65, 0.01, { x: 4.2 + dx, y: 0.1, z: z - 0.485, tile: 'panel', uv: 'planar', tint: 0xd0b090 });
      b.box(1.8, 0.04, 0.52, { x: 4.2, y: 0.85, z: z - 0.26, tile: 'oak', tint: 0xb08050 });
      shelves(b, 4.2, z - 0.15, Math.PI, 1.7, 0.28, [0.9, 1.3, 1.7, 2.0], WALNUT);
      for (let i = 0; i < 5; i++) plate(b, 3.55 + i * 0.32, 1.42, z - 0.12, 0.11, { upright: true, tilt: 0.25, ry: Math.PI });
      b.add(new THREE.PlaneGeometry(1.5, 0.3), { x: 4.2, y: 1.86, z: z - 0.27, ry: Math.PI, uv: 'native', u: 6, v: 1, tile: 'books' });
      for (let i = 0; i < 5; i++) cup(b, 3.6 + i * 0.3, 0.935, z - 0.32);
      b.lathe([[0, 0], [0.08, 0], [0.1, 0.08], [0.06, 0.16], [0.03, 0.18], [0.05, 0.2]], 12, { x: 4.2, y: 0.935, z: z - 0.25, tile: 'plain', tint: 0xf0ebe0 });
      return { colliders: [{ x: 4.2, z: z - 0.26, hw: 0.88, hd: 0.27 }] };
    },
  },

  /* ===== Ebédlő (dining room) ===== */
  {
    id: 'asztal', room: 'ebedlo', name: 'Ebédlőasztal', at: [-3.3, 1.0],
    tiers: [
      T('Kis asztal', 60, 2),
      T('Hosszú asztal, terítővel', 200, 3),
      T('Asztal tizennégy főre, megterítve', 500, 5, 'A törpék lakomája is elfér (Váratlan vendégek).', 'A nyugati-végi porcelánnal megterítve.'),
    ],
    build(b, k) {
      const x = -5.1;
      const z = 2.1;
      const L = [0, 1.5, 2.6, 3.4][k];
      if (!k) {
        outline(b, x, z, 2.6, 0.9);
        return {};
      }
      table(b, x, z, L, 0.95, 0.72, { tint: WALNUT });
      if (k >= 2) b.box(L * 0.92, 0.004, 0.5, { x, y: 0.721, z, tile: 'linen', tint: 0xf4ecd8 });
      if (k >= 3) {
        for (let i = 0; i < 6; i++) {
          for (const s of [-1, 1]) {
            const px = x - L / 2 + 0.35 + (i * (L - 0.7)) / 5;
            plate(b, px, 0.722, z + s * 0.3, 0.1);
            cup(b, px + 0.13, 0.722, z + s * 0.32);
          }
        }
        cake(b, x - 0.5, 0.725, z, 0.13, 0.09, 0xffffff, true);
        pie(b, x + 0.5, 0.725, z, 'tart');
        cheese(b, x, 0.725, z - 0.05, 0.1, 0.08);
      }
      return { colliders: [{ x, z, hw: L / 2, hd: 0.48 }] };
    },
  },
  {
    id: 'szekek', room: 'ebedlo', name: 'Székek', at: [-6.9, 1.0], dep: 'asztal',
    tiers: [T('Négy szék', 50, 1), T('Nyolc szék', 140, 2), T('Tizennégy szék', 380, 4, 'Tizenhárom törpének és a házigazdának.')],
    build(b, k, d) {
      const x = -5.1;
      const z = 2.1;
      if (!k) {
        outline(b, x - 1.9, z, 0.45, 0.45);
        return {};
      }
      const L = d ? [0, 1.5, 2.6, 3.4][d] : 2.6;
      const per = [0, 2, 3, 6][k];
      const ends = k >= 2;
      const pts = [];
      for (let i = 0; i < per; i++) {
        const px = per === 1 ? x : x - L / 2 + 0.3 + (i * (L - 0.6)) / Math.max(1, per - 1);
        pts.push([px, z - 0.72, 0], [px, z + 0.72, Math.PI]);
      }
      if (ends) pts.push([x - L / 2 - 0.4, z, Math.PI / 2], [x + L / 2 + 0.4, z, -Math.PI / 2]);
      // Without a table the chairs stand along the walls.
      if (!d) {
        pts.length = 0;
        const n = per * 2 + (ends ? 2 : 0);
        for (let i = 0; i < n; i++) pts.push([-7.7 + (i % 7) * 0.5, i < 7 ? 3.85 : 0.35, i < 7 ? Math.PI : 0]);
      }
      const cols = [];
      for (const [px, pz, ry] of pts) {
        chair(b, px, pz, ry, WALNUT, k >= 3 ? 0x6a2a24 : null);
        cols.push({ x: px, z: pz, hw: 0.21, hd: 0.21 });
      }
      return { colliders: cols };
    },
  },
  {
    id: 'talalo', room: 'ebedlo', name: 'Tálalószekrény', at: [-3.6, 3.3],
    tiers: [T('Tálalószekrény', 90, 2), T('Tálaló az ezüstkanalakkal', 260, 3, '', 'Az ezüstkanalak, amelyekre Lobelia annyira fáj a foga.')],
    build(b, k) {
      const x = -3.6;
      const z = 4.2;
      if (!k) {
        outline(b, x, z - 0.26, 1.5, 0.5);
        return {};
      }
      b.box(1.5, 0.82, 0.5, { x, y: 0.08, z: z - 0.26, tile: 'wood', tint: WALNUT });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(b, x + sx * 0.7, 0, z - 0.26 + sz * 0.2, 0.1, 0.03, DARK);
      for (const dx of [-0.5, 0, 0.5]) {
        b.box(0.44, 0.6, 0.01, { x: x + dx, y: 0.18, z: z - 0.515, tile: 'panel', tint: 0xd0b090 });
        b.sphere(0.018, { x: x + dx, y: 0.6, z: z - 0.53, tile: 'brass' }, 6, 4);
      }
      b.box(1.56, 0.04, 0.54, { x, y: 0.9, z: z - 0.27, tile: 'oak', tint: 0xb08050 });
      b.lathe([[0, 0], [0.07, 0], [0.09, 0.1], [0.05, 0.22], [0.06, 0.26]], 12, { x: x - 0.5, y: 0.94, z: z - 0.25, tile: 'plain', tint: 0xf0ebe0 });
      if (k >= 2) {
        // The silver spoons in an open case, a silver jug.
        b.box(0.42, 0.05, 0.26, { x: x + 0.25, y: 0.94, z: z - 0.25, tile: 'velvet', tint: 0x2a3a5a });
        for (let i = 0; i < 6; i++) {
          b.box(0.012, 0.006, 0.18, { x: x + 0.08 + i * 0.065, y: 0.99, z: z - 0.25, tile: 'plain', tint: 0xdde2ea });
          b.sphere(0.018, { x: x + 0.08 + i * 0.065, y: 0.995, z: z - 0.34, tile: 'plain', tint: 0xdde2ea, sy: 0.4 }, 6, 4);
        }
        b.lathe([[0, 0], [0.05, 0], [0.06, 0.08], [0.04, 0.18], [0.05, 0.22]], 12, { x: x + 0.62, y: 0.94, z: z - 0.25, tile: 'plain', tint: 0xd8dde4 });
      }
      return { colliders: [{ x, z: z - 0.26, hw: 0.78, hd: 0.27 }] };
    },
  },
  {
    id: 'csillar', room: 'ebedlo', name: 'Gyertyák', at: [-5.1, 3.45],
    tiers: [T('Gyertyatartók az asztalon', 40, 1), T('Gyertyás csillár', 220, 3)],
    build(b, k) {
      const x = -5.1;
      const z = 2.1;
      if (!k) return {};
      const lights = [];
      if (k === 1) {
        lights.push({ p: candle(b, x - 0.25, 0.73, z, 0.18), c: [0.95, 0.6, 0.3], range: 4.2, flicker: true });
        candle(b, x + 0.25, 0.73, z, 0.18);
      } else {
        const y = 2.0;
        b.cyl(0.008, 0.008, 2.85 - y, 4, { x, y: y + 0.1, z, tile: 'iron' });
        b.torus(0.42, 0.025, { x, y, z, rx: Math.PI / 2, tile: 'wood', tint: DARK }, 6, 24);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          b.cyl(0.006, 0.006, 0.55, 4, { center: true, x: x + Math.cos(a) * 0.2, y: y + 0.32, z: z + Math.sin(a) * 0.2, rz: Math.cos(a) * 0.65, rx: -Math.sin(a) * 0.65, tile: 'iron' });
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          candle(b, x + Math.cos(a) * 0.42, y + 0.02, z + Math.sin(a) * 0.42, 0.12, 'iron');
        }
        lights.push({ p: [x, y + 0.2, z], c: [1.5, 0.95, 0.5], range: 6.0, flicker: true });
      }
      return { lights };
    },
  },

  /* ===== Konyha (kitchen) ===== */
  {
    id: 'tuzhely', room: 'konyha', name: 'Tűzhely', at: [-3, 9.65],
    tiers: [
      T('Öreg vastűzhely', 80, 2, 'Főzés: a kiásott krumpliból és gombából étel lesz.'),
      T('Befűtött tűzhely, fazékkal', 260, 3, 'Főzés: +25 % tápláló.'),
      T('Rézedények a gerendán', 600, 4, 'Főzés: +50 % tápláló.'),
    ],
    build(b, k) {
      const x = -3;
      const z = 10.75;
      if (!k) {
        outline(b, x, z, 1.3, 0.45, 0, 0.04);
        return {};
      }
      const lights = [];
      // An iron range in the alcove: the body, oven doors, the grate, the hob plate and the flue.
      b.box(1.3, 0.78, 0.5, { x, y: 0.04, z, tile: 'iron', tint: 0x9a9a9a });
      b.box(1.36, 0.04, 0.54, { x, y: 0.82, z, tile: 'iron', tint: 0xbababa });
      for (const dx of [-0.38, 0.38]) {
        b.box(0.4, 0.4, 0.02, { x: x + dx, y: 0.18, z: z - 0.26, tile: 'iron', tint: 0x6a6a6a });
        b.box(0.18, 0.025, 0.03, { x: x + dx, y: 0.5, z: z - 0.28, tile: 'brass' });
      }
      b.box(0.34, 0.22, 0.02, { x, y: 0.4, z: z - 0.255, tile: k >= 2 ? 'ember' : 'iron', kind: k >= 2 ? 1 : 0, tint: k >= 2 ? [1.3, 0.8, 0.5] : [0.3, 0.3, 0.3] });
      for (let i = 0; i < 4; i++) b.box(0.015, 0.22, 0.03, { x: x - 0.12 + i * 0.08, y: 0.4, z: z - 0.27, tile: 'iron', tint: 0x3a3a3a });
      b.cyl(0.08, 0.08, 1.0, 10, { x, y: 0.86, z: z + 0.1, tile: 'iron', tint: 0x5a5a5a });
      lights.push({ p: [x, 0.6, z - 0.6], c: k >= 2 ? [1.3, 0.62, 0.3] : [0.5, 0.3, 0.15], range: k >= 2 ? 5.0 : 3.0, flicker: true });
      if (k >= 2) {
        // A pot on the hob.
        b.lathe([[0, 0], [0.16, 0], [0.17, 0.02], [0.17, 0.2], [0.18, 0.22]], 14, { x: x - 0.32, y: 0.86, z, tile: 'iron', tint: 0x4a4a4a });
        b.disc(0.16, 14, { x: x - 0.32, y: 1.04, z, tile: 'crust', uv: 'planar', tint: 0xa07040 });
      }
      if (k >= 3) {
        // Copper pans and ladles hanging from the beam over the hearth.
        for (let i = 0; i < 6; i++) {
          const px = x - 1.0 + i * 0.4;
          b.cyl(0.004, 0.004, 0.12, 4, { x: px, y: 1.52, z: 10.42, tile: 'iron' });
          if (i % 2 === 0) {
            b.cyl(0.13 - i * 0.01, 0.11 - i * 0.01, 0.07, 14, { center: true, x: px, y: 1.35, z: 10.45, rx: Math.PI / 2, tile: 'brass', tint: 0xe09060 });
            b.box(0.03, 0.2, 0.01, { x: px, y: 1.38, z: 10.45, tile: 'brass', tint: 0xe09060 });
          } else {
            b.cyl(0.008, 0.008, 0.3, 4, { x: px, y: 1.2, z: 10.43, tile: 'brass', tint: 0xe09060 });
            b.sphere(0.04, { x: px, y: 1.2, z: 10.43, tile: 'brass', tint: 0xe09060, pl: Math.PI / 2, p0: Math.PI / 2 }, 8, 4);
          }
        }
      }
      return { colliders: [{ x, z, hw: 0.68, hd: 0.3 }], lights };
    },
  },
  {
    id: 'kanna', room: 'konyha', name: 'Teáskanna', at: [-2.0, 9.6], dep: 'tuzhely',
    tiers: [T('Öntöttvas teáskanna', 30, 1, 'Főzés: +10 %.', '„Tegyük fel a teát!”'), T('Rézkanna', 120, 2, 'Főzés: +20 %.')],
    build(b, k, d) {
      if (!k) return {};
      const onRange = d > 0;
      const x = onRange ? -2.65 : -3.3;
      const y = onRange ? 0.86 : 0.04;
      const z = onRange ? 10.75 : 10.7;
      const tile = k === 1 ? 'iron' : 'brass';
      const tint = k === 1 ? 0x4a4a4a : 0xe8a070;
      b.lathe([[0, 0], [0.1, 0], [0.13, 0.06], [0.12, 0.14], [0.06, 0.2], [0.03, 0.21], [0.0, 0.22]], 14, { x, y, z, tile, tint });
      b.cyl(0.015, 0.025, 0.14, 6, { center: true, x: x - 0.13, y: y + 0.12, z, rz: 0.9, tile, tint });
      b.torus(0.08, 0.01, { x, y: y + 0.24, z, tile, tint }, 4, 12, Math.PI);
      b.sphere(0.015, { x, y: y + 0.225, z, tile: 'wood', tint: DARK }, 6, 4);
      return {};
    },
  },
  {
    id: 'porcelan', room: 'konyha', name: 'Anyja nyugati-végi porcelánja', at: [-0.85, 8.8],
    tiers: [
      T('Tálalópolc', 70, 1),
      T('Tányérok és csészék', 240, 3, 'A főtt étel tovább tart (hosszabb jóllakottság).', 'Belladonna Tuk porcelánja (film).'),
      T('A teljes készlet', 520, 4, 'A főtt étel még tovább tart.'),
    ],
    build(b, k) {
      const x = 0;
      const z = 8.8;
      if (!k) {
        outline(b, x - 0.27, z, 0.5, 1.6, Math.PI / 2);
        return {};
      }
      // A kitchen dresser against the east wall: cupboard below, plate rack above (faces −x).
      b.at(x, 0, z, -Math.PI / 2, (d) => {
        d.box(1.6, 0.85, 0.5, { y: 0, z: 0.25, tile: 'wood', tint: 0x6a8a6a });
        for (const dx of [-0.4, 0.4]) d.box(0.7, 0.62, 0.01, { x: dx, y: 0.12, z: 0.505, tile: 'panel', tint: 0x9ab09a });
        d.box(1.66, 0.04, 0.54, { y: 0.85, z: 0.26, tile: 'oak', tint: 0xc09868 });
        shelves(d, 0, 0.14, 0, 1.6, 0.26, [0.9, 1.3, 1.65, 2.0], 0x6a8a6a);
        d.box(1.6, 1.1, 0.02, { y: 0.9, z: 0.01, tile: 'wood', tint: 0x5a7a5a });
        if (k >= 2) {
          for (const [y, n] of [[1.33, 5], [1.68, 5]]) for (let i = 0; i < n; i++) plate(d, -0.62 + i * 0.31, y + 0.12, 0.12, 0.12, { upright: true, tilt: -0.22 });
          for (let i = 0; i < 6; i++) cup(d, -0.65 + i * 0.26, 0.935, 0.18);
        }
        if (k >= 3) {
          for (let i = 0; i < 6; i++) plate(d, -0.65 + i * 0.26, 2.06, 0.12, 0.1, { upright: true, tilt: -0.22 });
          d.lathe([[0, 0], [0.09, 0], [0.12, 0.08], [0.1, 0.16], [0.04, 0.2], [0.06, 0.22]], 12, { x: 0.45, y: 0.89, z: 0.3, tile: 'plain', tint: 0xf0ebe0 });
          for (let i = 0; i < 3; i++) d.lathe([[0, 0], [0.04, 0], [0.11, 0.06], [0.12, 0.07]], 12, { x: -0.5 + i * 0.05, y: 0.89 + i * 0.03, z: 0.3, tile: 'plain', tint: 0xf0ebe0 });
          d.lathe([[0, 0], [0.05, 0], [0.065, 0.1], [0.04, 0.2], [0.055, 0.24]], 10, { x: 0.1, y: 0.89, z: 0.32, tile: 'plain', tint: 0xf0ebe0 });
        }
      });
      return { colliders: [{ x: x - 0.26, z, hw: 0.28, hd: 0.82 }] };
    },
  },
  {
    id: 'konyhaasztal', room: 'konyha', name: 'Konyhaasztal', at: [-4.7, 8.0],
    tiers: [T('Gyalult asztal két lócával', 50, 1), T('Asztal kenyérrel, kosárral, almával', 130, 2)],
    build(b, k) {
      const x = -3.6;
      const z = 8.5;
      if (!k) {
        outline(b, x, z, 1.7, 0.85);
        return {};
      }
      table(b, x, z, 1.7, 0.85, 0.74, { tint: OAKT, top: 0xe8c8a0 });
      for (const s of [-1, 1]) {
        b.box(1.5, 0.05, 0.28, { x, y: 0.42, z: z + s * 0.62, tile: 'oak', tint: 0xd8b088 });
        for (const dx of [-0.6, 0.6]) b.box(0.05, 0.42, 0.24, { x: x + dx, y: 0, z: z + s * 0.62, tile: 'wood', tint: OAKT });
      }
      if (k >= 2) {
        b.box(0.4, 0.025, 0.26, { x: x - 0.4, y: 0.74, z, tile: 'oak', tint: 0xe0c090 });
        cake(b, x - 0.4, 0.765, z, 0.1, 0.09, 0xffe0c0);
        b.lathe([[0, 0], [0.12, 0], [0.18, 0.12], [0.19, 0.13]], 12, { x: x + 0.35, y: 0.74, z, tile: 'wood', tint: 0xb08850 });
        for (let i = 0; i < 6; i++) b.sphere(0.04, { x: x + 0.35 + Math.cos(i) * 0.08, y: 0.84 + (i % 2) * 0.03, z: z + Math.sin(i) * 0.08, tile: 'plain', tint: i % 2 ? 0xb02a20 : 0x8ab040 }, 8, 6);
        b.lathe([[0, 0], [0.09, 0], [0.13, 0.08], [0.14, 0.09]], 12, { x: x + 0.05, y: 0.74, z: z - 0.25, tile: 'plain', tint: 0xf0ebe0 });
      }
      return { colliders: [{ x, z, hw: 0.86, hd: 0.78 }] };
    },
  },

  /* ===== Kamra (pantry) ===== */
  {
    id: 'polc1', room: 'kamra', name: '1. kamrapolc', at: [-10.15, 8.9],
    tiers: [T('Málnalekvár', 40, 1, '+5 tányér; otthon ingyen ehetsz.'), T('Lekvárok és sajtok', 150, 2, '+10 tányér.')],
    build(b, k) {
      const x = -11;
      const z = 8.9;
      if (!k) {
        outline(b, x + 0.22, z, 0.4, 3.0, 0);
        wallMark(b, x, 1.0, z, 3.0, 0.9, 1, 0);
        return {};
      }
      shelves(b, x + 0.2, z, Math.PI / 2, 3.0, 0.38, [0.45, 0.95, 1.45, 1.85], OAKT);
      for (let i = 0; i < 12; i++) jar(b, x + 0.2, 0.985, z - 1.3 + i * 0.235, 1, 0xffffff);
      for (let i = 0; i < 9; i++) jar(b, x + 0.2, 1.485, z - 1.2 + i * 0.3, 1.2, 0xffffff);
      if (k >= 2) {
        for (let i = 0; i < 5; i++) cheese(b, x + 0.2, 0.485, z - 1.1 + i * 0.55, 0.13 - (i % 2) * 0.03, 0.1);
        for (let i = 0; i < 8; i++) jar(b, x + 0.18, 1.885, z - 1.2 + i * 0.34, 0.9, 0xe8c070);
      }
      return { colliders: [{ x: x + 0.2, z, hw: 0.22, hd: 1.5 }] };
    },
  },
  {
    id: 'polc2', room: 'kamra', name: '2. kamrapolc', at: [-8.8, 10.15],
    tiers: [T('Magkalácsok és kenyerek', 50, 1, '+5 tányér; otthon ingyen ehetsz.'), T('Almás piték, sertéspástétomok', 180, 2, '+10 tányér.')],
    build(b, k) {
      const x = -8.8;
      const z = 11;
      if (!k) {
        outline(b, x, z - 0.22, 3.2, 0.4);
        wallMark(b, x, 1.0, z, 3.2, 0.9, 0, -1);
        return {};
      }
      shelves(b, x, z - 0.2, Math.PI, 3.2, 0.38, [0.45, 0.95, 1.45, 1.85], OAKT);
      for (let i = 0; i < 6; i++) cake(b, x - 1.3 + i * 0.52, 0.985, z - 0.2, 0.11, 0.08, 0xffffff, true);
      for (let i = 0; i < 5; i++) cake(b, x - 1.2 + i * 0.6, 1.485, z - 0.2, 0.12, 0.11, 0xf0d0a0);
      if (k >= 2) {
        for (let i = 0; i < 5; i++) pie(b, x - 1.2 + i * 0.6, 0.485, z - 0.2, 'tart');
        for (let i = 0; i < 7; i++) pie(b, x - 1.35 + i * 0.45, 1.885, z - 0.2, 'pork');
      }
      return { colliders: [{ x, z: z - 0.2, hw: 1.6, hd: 0.22 }] };
    },
  },
  {
    id: 'polc3', room: 'kamra', name: '3. kamrapolc', at: [-7.15, 7.9],
    tiers: [T('Kosár zöldség és alma', 45, 1, '+5 tányér; otthon ingyen ehetsz.'), T('Sonkák és kolbászok a gerendán', 200, 2, '+10 tányér.')],
    build(b, k) {
      const x = -6.3;
      const z = 7.9;
      if (!k) {
        outline(b, x - 0.22, z, 0.4, 1.6);
        return {};
      }
      shelves(b, x - 0.2, z, -Math.PI / 2, 1.6, 0.38, [0.45, 0.95, 1.45], OAKT);
      for (let i = 0; i < 3; i++) {
        const pz = z - 0.5 + i * 0.5;
        b.lathe([[0, 0], [0.12, 0], [0.16, 0.14], [0.17, 0.15]], 10, { x: x - 0.2, y: 0.485, z: pz, tile: 'wood', tint: 0xb08850 });
        for (let j = 0; j < 5; j++) b.sphere(0.04, { x: x - 0.2 + Math.cos(j * 1.3) * 0.07, y: 0.6 + (j % 2) * 0.03, z: pz + Math.sin(j * 1.3) * 0.07, tile: 'plain', tint: [0xb02a20, 0x8ab040, 0xd09030][i] }, 8, 6);
      }
      // Potato sacks on the floor.
      for (let i = 0; i < 2; i++) b.lathe([[0, 0], [0.2, 0], [0.23, 0.2], [0.18, 0.45], [0.06, 0.5], [0.03, 0.56]], 10, { x: x - 0.75, y: 0, z: z - 0.4 + i * 0.6, tile: 'linen', tint: 0xb09a70 });
      for (let i = 0; i < 6; i++) b.sphere(0.035, { x: x - 0.2 + ((i % 3) - 1) * 0.06, y: 1.0, z: z + 0.3 + Math.floor(i / 3) * 0.08, tile: 'plain', tint: 0xa88a50 }, 6, 4);
      const cols = [{ x: x - 0.2, z, hw: 0.22, hd: 0.8 }, { x: x - 0.75, z: z - 0.1, hw: 0.25, hd: 0.55 }];
      if (k >= 2) {
        // A pole across the room with hams, sausages and strings of onions.
        b.cyl(0.03, 0.03, 4.6, 8, { center: true, x: -8.65, y: 1.95, z: 9.0, rz: Math.PI / 2, tile: 'beam', tint: BRASS });
        for (let i = 0; i < 7; i++) {
          const px = -10.6 + i * 0.6;
          b.cyl(0.003, 0.003, 0.15, 3, { x: px, y: 1.8, z: 9.0, tile: 'linen' });
          if (i % 3 === 1) {
            for (let j = 0; j < 5; j++) b.cyl(0.025, 0.025, 0.32, 6, { x: px + (j - 2) * 0.05, y: 1.45, z: 9.0, tile: 'crust', tint: 0x9a3a2a });
          } else if (i % 3 === 0) {
            b.lathe([[0.02, 0], [0.1, 0.06], [0.13, 0.22], [0.08, 0.36], [0.03, 0.4]], 10, { x: px, y: 1.42, z: 9.0, tile: 'crust', tint: 0xc07050 });
          } else {
            for (let j = 0; j < 5; j++) b.sphere(0.04, { x: px + Math.sin(j) * 0.03, y: 1.75 - j * 0.07, z: 9.0, tile: 'plain', tint: 0xd8b070 }, 6, 4);
          }
        }
      }
      return { colliders: cols };
    },
  },

  /* ===== Dolgozószoba (study) ===== */
  {
    id: 'iroasztal', room: 'dolgozo', name: 'Bilbó íróasztala', at: [10.2, 1.45],
    tiers: [
      T('Egyszerű íróasztal', 80, 2, 'Itt veheted a térkép- és mélységfejlesztéseket.'),
      T('Íróasztal tollal, tintával, gyertyával', 240, 3),
      T('A könyve: Oda és vissza', 520, 4, 'A könyvbe íródik a haladásod.', 'Bilbó könyve (film).'),
    ],
    build(b, k) {
      const x = 10.2;
      const z = 0.55;
      if (!k) {
        outline(b, x, z, 1.3, 0.65);
        return {};
      }
      const lights = [];
      table(b, x, z, 1.3, 0.65, 0.76, { tint: DARK, top: 0xa87850 });
      b.box(0.5, 0.12, 0.02, { x: x - 0.25, y: 0.58, z: z + 0.32, tile: 'wood', tint: WALNUT });
      b.sphere(0.015, { x: x - 0.25, y: 0.64, z: z + 0.34, tile: 'brass' }, 6, 4);
      chair(b, x, z + 0.62, Math.PI, DARK, k >= 3 ? 0x2a4a3a : null);
      if (k >= 2) {
        // Papers, the inkpot with a quill, a candle.
        for (let i = 0; i < 4; i++) b.box(0.21, 0.002, 0.29, { x: x - 0.2 + i * 0.03, y: 0.761 + i * 0.002, z: z + 0.05, ry: i * 0.15 - 0.2, tile: 'parchment' });
        b.cyl(0.03, 0.035, 0.05, 10, { x: x + 0.3, y: 0.76, z: z - 0.1, tile: 'glassdark', tint: 0x4a4a6a });
        b.add(new THREE.PlaneGeometry(0.03, 0.26), { x: x + 0.32, y: 0.92, z: z - 0.1, rz: -0.35, uv: 'face', tile: 'plain', tint: 0xf0ece0 });
        lights.push({ p: candle(b, x + 0.5, 0.76, z - 0.2, 0.15), c: [0.9, 0.58, 0.28], range: 3.6, flicker: true });
      }
      if (k >= 3) {
        // The book, open, thick, red leather (There and Back Again), and a rolled map.
        b.box(0.24, 0.05, 0.32, { x: x + 0.05, y: 0.762, z: z + 0.02, ry: 0.1, tile: 'leather', tint: 0xa03024 });
        b.box(0.22, 0.012, 0.3, { x: x - 0.06, y: 0.81, z: z + 0.02, ry: 0.15, rz: 0.06, tile: 'parchment' });
        b.box(0.22, 0.012, 0.3, { x: x + 0.16, y: 0.81, z: z + 0.04, ry: 0.05, rz: -0.06, tile: 'parchment' });
        b.cyl(0.03, 0.03, 0.45, 10, { center: true, x: x - 0.45, y: 0.79, z: z - 0.15, rz: Math.PI / 2, ry: 0.3, tile: 'parchment', u: 1, v: 1 });
      }
      return { colliders: [{ x, z, hw: 0.66, hd: 0.34 }, { x, z: z + 0.62, hw: 0.22, hd: 0.22 }], lights };
    },
  },
  {
    id: 'terkepek', room: 'dolgozo', name: 'Térképek a falon', at: [11.25, 2.1],
    tiers: [T('A Megye térképe', 70, 1), T('Thrór térképe', 400, 3, 'A holdbetűk olvashatók.', 'Thrór térképe, amelyet Gandalf adott át (film).')],
    build(b, k) {
      const x = 12;
      if (!k) {
        wallMark(b, x, 1.45, 1.6, 0.8, 0.6, -1, 0);
        return {};
      }
      framed(b, x, 1.45, 1.4, 0.75, 0.56, -1, 0, 'map_shire');
      if (k >= 2) {
        framed(b, x, 1.42, 2.6, 0.62, 0.62, -1, 0, 'map_thror', 0x3a2414);
        b.box(0.02, 0.02, 0.02, { x: x - 0.04, y: 1.75, z: 2.6, tile: 'brass' });
      }
      return {};
    },
  },
  {
    id: 'konyvespolc', room: 'dolgozo', name: 'Könyvespolc', at: [9.15, 2.4],
    tiers: [T('Polc néhány könyvvel', 60, 1), T('Teli könyvespolc', 200, 3), T('Könyvek és térképtekercsek', 420, 4)],
    build(b, k) {
      const x = 8.4;
      const z = 2.4;
      if (!k) {
        outline(b, x + 0.2, z, 0.36, 1.6);
        wallMark(b, x, 1.0, z, 1.6, 1.6, 1, 0);
        return {};
      }
      const hs = [0.1, 0.5, 0.9, 1.3, 1.7];
      shelves(b, x + 0.18, z, Math.PI / 2, 1.6, 0.34, [...hs.slice(1), 2.0], DARK);
      b.box(0.02, 2.0, 1.6, { x: x + 0.01, y: 0, z, tile: 'wood', tint: 0x3a2414 });
      const rows = k === 1 ? 2 : 4;
      for (let i = 0; i < rows; i++) {
        const w = k === 1 ? 0.7 : 1.48;
        b.add(new THREE.PlaneGeometry(w, 0.36), { x: x + 0.3, y: hs[i + 1] + 0.2, z: z - (k === 1 ? 0.35 : 0), ry: Math.PI / 2, uv: 'native', u: w / 0.4, v: 1, tile: 'books', du: i * 0.37 });
        b.box(0.22, 0.34, w, { x: x + 0.15, y: hs[i + 1] + 0.035, z: z - (k === 1 ? 0.35 : 0), tile: 'leather', tint: 0x3a2a1a });
      }
      if (k >= 3) {
        // Pigeonholes of rolled maps on the top shelf, a candle.
        for (let i = 0; i < 8; i++) b.cyl(0.035, 0.035, 0.3, 8, { center: true, x: x + 0.18, y: 1.75 + (i % 2) * 0.08, z: z - 0.65 + i * 0.18, rz: Math.PI / 2, tile: 'parchment', u: 1, v: 1 });
      }
      return { colliders: [{ x: x + 0.18, z, hw: 0.2, hd: 0.82 }] };
    },
  },

  /* ===== Hálószoba (bedroom) ===== */
  {
    id: 'agy', room: 'haloszoba', name: 'Bilbó ágya', at: [-9.65, 2.8],
    tiers: [
      T('Egyszerű ágy', 90, 2, 'Alvás: átugrod az éjszakát; itt menthetsz.'),
      T('Ágy paplannal', 260, 4),
      T('Faragott ágy, foltvarrott paplan, éjjeliszekrény', 600, 6),
    ],
    build(b, k) {
      const x = -11.0;
      const z = 2.8;
      if (!k) {
        outline(b, x, z, 2.0, 1.2);
        return {};
      }
      const lights = [];
      // Head against the west wall (x = −12), along +x.
      for (const sz of [-1, 1]) b.box(1.96, 0.16, 0.05, { x, y: 0.2, z: z + sz * 0.56, tile: 'wood', tint: 0x9a6a44 });
      b.box(1.9, 0.06, 1.1, { x, y: 0.22, z, tile: 'wood', tint: 0x6a4a30 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(b, x + sx * 0.94, 0, z + sz * 0.55, 0.36, 0.035, 0x9a6a44);
      b.box(1.86, 0.2, 1.06, { x, y: 0.28, z, tile: 'linen', tint: 0xf0e8d8 });
      b.box(0.05, 0.22, 1.12, { x: -10.03, y: 0.3, z, tile: 'wood', tint: 0x9a6a44 });
      for (const sz of [-1, 1]) b.cyl(0.03, 0.03, 0.62, 8, { x: -10.03, y: 0, z: z + sz * 0.57, tile: 'wood', tint: 0x7a5236 });
      b.box(0.36, 0.12, 0.8, { x: x - 0.74, y: 0.48, z, tile: 'linen', tint: 0xfaf6ec });
      // Headboard: round-topped (carved at the top tier).
      b.box(0.08, 0.75, 1.2, { x: -11.96, y: 0.14, z, tile: 'wood', tint: 0x7a5236 });
      if (k >= 3) {
        b.add(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(0), { x: -11.96, y: 0.84, z, tile: 'wood', tint: DARK, uv: 'planar' });
        b.torus(0.48, 0.025, { x: -11.91, y: 0.84, z, ry: Math.PI / 2, tile: 'wood', tint: WALNUT }, 4, 16, Math.PI);
      }
      if (k >= 2) {
        b.box(1.5, 0.05, 1.12, { x: x + 0.2, y: 0.48, z, tile: k >= 3 ? 'quilt' : 'velvet', tint: k >= 3 ? 0xffffff : 0x6a7a4a });
        b.box(1.5, 0.26, 0.02, { x: x + 0.2, y: 0.25, z: z - 0.565, tile: k >= 3 ? 'quilt' : 'velvet', tint: k >= 3 ? 0xffffff : 0x6a7a4a });
        b.box(1.5, 0.26, 0.02, { x: x + 0.2, y: 0.25, z: z + 0.565, tile: k >= 3 ? 'quilt' : 'velvet', tint: k >= 3 ? 0xffffff : 0x6a7a4a });
      }
      if (k >= 3) {
        // A nightstand with a candle.
        b.box(0.42, 0.55, 0.4, { x: -11.7, y: 0, z: z + 0.95, tile: 'wood', tint: WALNUT });
        lights.push({ p: candle(b, -11.7, 0.55, z + 0.95, 0.14), c: [0.85, 0.55, 0.26], range: 3.8, flicker: true });
      }
      return { colliders: [{ x, z, hw: 1.0, hd: 0.6 }, ...(k >= 3 ? [{ x: -11.7, z: z + 0.95, hw: 0.22, hd: 0.21 }] : [])], lights };
    },
  },
  {
    id: 'vendegagy', room: 'haloszoba', name: 'Vendégágy', at: [-10.55, 1.05],
    tiers: [T('Vendégágy', 120, 2, 'A második játékos ágya: itt is alhattok és menthettek.'), T('Vendégágy paplannal', 280, 3)],
    build(b, k) {
      const x = -9.25;
      const z = 1.05;
      if (!k) {
        outline(b, x, z, 1.7, 0.9);
        return {};
      }
      b.box(1.66, 0.26, 0.86, { x, y: 0.12, z, tile: 'wood', tint: OAKT });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 0.14, 0.06, { x: x + sx * 0.8, y: 0, z: z + sz * 0.4, tile: 'wood', tint: DARK });
      b.box(1.6, 0.14, 0.8, { x, y: 0.38, z, tile: 'linen', tint: 0xf0e8d8 });
      b.box(0.3, 0.09, 0.6, { x: x + 0.62, y: 0.52, z, tile: 'linen', tint: 0xfaf6ec });
      b.box(0.07, 0.6, 0.9, { x: -8.44, y: 0.12, z, tile: 'wood', tint: OAKT });
      if (k >= 2) b.box(1.2, 0.05, 0.88, { x: x - 0.18, y: 0.52, z, tile: 'quilt', tint: 0xd8c8b0 });
      return { colliders: [{ x, z, hw: 0.85, hd: 0.45 }] };
    },
  },
  {
    id: 'szekreny', room: 'haloszoba', name: 'Ruhásszekrény', at: [-9.0, 3.3],
    tiers: [T('Ruhásszekrény', 100, 2), T('Bilbó mellényei és kabátjai', 260, 3, '', 'A könyv szerint egész szobák voltak a ruháinak.')],
    build(b, k) {
      const x = -9.05;
      const z = 4.2;
      if (!k) {
        outline(b, x, z - 0.3, 1.0, 0.55);
        return {};
      }
      b.box(1.0, 1.9, 0.55, { x, y: 0.06, z: z - 0.29, tile: 'wood', tint: WALNUT });
      b.box(1.06, 0.08, 0.6, { x, y: 1.96, z: z - 0.3, tile: 'wood', tint: DARK });
      for (const dx of [-0.24, 0.24]) {
        b.box(0.44, 1.6, 0.012, { x: x + dx, y: 0.2, z: z - 0.57, tile: 'panel', tint: 0xc8a888 });
        b.sphere(0.016, { x: x + dx * 0.15, y: 1.0, z: z - 0.585, tile: 'brass' }, 6, 4);
      }
      b.box(1.0, 0.06, 0.55, { x, y: 0, z: z - 0.29, tile: 'wood', tint: DARK });
      if (k >= 2) {
        // A clothes stand beside it with his red waistcoat and his coat.
        const sx = -10.0;
        const sz = 3.85;
        b.cyl(0.02, 0.025, 1.6, 6, { x: sx, y: 0, z: sz, tile: 'wood', tint: DARK });
        b.cyl(0.18, 0.2, 0.03, 10, { x: sx, y: 0, z: sz, tile: 'wood', tint: DARK });
        b.lathe([[0.02, 0], [0.16, -0.06], [0.18, -0.5], [0.15, -0.6], [0.0, -0.6]], 10, { x: sx, y: 1.55, z: sz, tile: 'velvet', tint: 0x6a4a30, sz: 0.6 });
        b.lathe([[0.02, 0], [0.13, -0.05], [0.14, -0.36], [0.0, -0.36]], 10, { x: sx + 0.03, y: 1.42, z: sz - 0.08, tile: 'velvet', tint: 0x9a2a22, sz: 0.55 });
        for (let i = 0; i < 4; i++) b.sphere(0.008, { x: sx + 0.03, y: 1.38 - i * 0.07, z: sz - 0.155, tile: 'brass' }, 4, 3);
      }
      return { colliders: [{ x, z: z - 0.29, hw: 0.52, hd: 0.3 }, ...(k >= 2 ? [{ x: -10.0, z: 3.85, hw: 0.18, hd: 0.18 }] : [])] };
    },
  },

  /* ===== Mathom-szoba ===== */
  ...[1, 2, 3].map((n) => {
    const place = [[0.3, 8.9, Math.PI / 2, [1.15, 8.9]], [3.15, 11, Math.PI, [3.15, 10.05]], [6, 8.9, -Math.PI / 2, [5.15, 8.9]]][n - 1];
    return {
      id: `vitrin${n}`, room: 'mathom', name: `${n}. vitrin`, at: place[3], vitrin: n - 1,
      tiers: [T('Vitrin néhány mathommal', 120, 2, '+2 % a leletek eladási árára; ide kerülnek a híres leletek.'), T('Megvilágított vitrin, bársonnyal', 320, 3, '+4 %; mind a három díszvitrinnel még +4 %.')],
      build(b, k) {
        const [wx, wz, ry] = place;
        const nx = Math.round(Math.sin(ry));
        const nz = Math.round(Math.cos(ry));
        const cx = wx + nx * 0.28;
        const cz = wz + nz * 0.28;
        if (!k) {
          outline(b, cx, cz, 1.7, 0.5, ry);
          return {};
        }
        const lights = [];
        b.at(cx, 0, cz, ry, (v) => {
          // Base cabinet, glass upper case with frame posts, two glass shelves, a cornice.
          v.box(1.7, 0.8, 0.5, { tile: 'wood', tint: WALNUT });
          for (const dx of [-0.42, 0.42]) v.box(0.76, 0.6, 0.01, { x: dx, y: 0.1, z: 0.255, tile: 'panel', tint: 0xd0b090 });
          v.box(1.74, 0.04, 0.54, { y: 0.8, tile: 'oak', tint: 0xb08050 });
          v.box(1.66, 1.0, 0.02, { y: 0.84, z: -0.24, tile: k >= 2 ? 'velvet' : 'wood', tint: k >= 2 ? 0x2a2a5a : 0x5a3a24 });
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.box(0.035, 1.0, 0.035, { x: sx * 0.83, y: 0.84, z: sz * 0.23, tile: 'wood', tint: DARK });
          v.box(1.76, 0.08, 0.56, { y: 1.84, tile: 'wood', tint: DARK });
          for (const h of [1.16, 1.5]) v.box(1.62, 0.012, 0.42, { y: h, glass: true, tile: 'pane', kind: 3 });
          v.box(1.64, 1.0, 0.004, { y: 0.84, z: 0.245, glass: true, tile: 'pane', kind: 3 });
          for (const sx of [-1, 1]) v.box(0.004, 1.0, 0.46, { x: sx * 0.82, y: 0.84, glass: true, tile: 'pane', kind: 3 });
          // A few mathoms (the useless things hobbits keep and give away).
          v.lathe([[0, 0], [0.04, 0], [0.06, 0.06], [0.025, 0.14], [0.035, 0.18]], 10, { x: -0.55, y: 0.84, z: 0, tile: 'plain', tint: 0xf0ebe0 });
          v.box(0.12, 0.08, 0.09, { x: 0.5, y: 0.84, z: 0, tile: 'wood', tint: 0x8a5a2a });
          v.cyl(0.05, 0.05, 0.02, 12, { x: 0.15, y: 1.172, z: 0.02, tile: 'brass' });
          v.sphere(0.04, { x: -0.3, y: 1.21, z: 0, tile: 'plain', tint: 0x6a8aa0 }, 8, 6);
          v.cyl(0.035, 0.045, 0.1, 10, { x: 0.62, y: 1.172, z: 0, tile: 'brass', tint: 0xd09060 });
          v.box(0.2, 0.012, 0.03, { x: -0.6, y: 1.172, z: 0.05, ry: 0.3, tile: 'plain', tint: 0xdde2ea });
          v.lathe([[0, 0], [0.05, 0], [0.05, 0.01], [0.02, 0.03], [0.015, 0.12], [0.03, 0.14]], 8, { x: 0.05, y: 0.84, z: 0, tile: 'brass' });
          v.box(0.18, 0.12, 0.02, { x: -0.1, y: 0.84, z: -0.15, rx: -0.2, tile: 'wood', tint: 0x6a4a2a });
          v.sphere(0.035, { x: 0.3, y: 0.84 + 0.035, z: 0.05, tile: 'velvet', tint: 0x8a6a3a }, 8, 6);
          if (k >= 2) {
            v.lathe([[0, 0], [0.03, 0], [0.05, 0.1], [0.02, 0.18]], 8, { x: 0.45, y: 1.512, z: 0, tile: 'brass' });
            v.box(0.16, 0.1, 0.1, { x: -0.45, y: 1.512, z: 0, tile: 'leather', tint: 0x6a2a2a });
            v.cyl(0.06, 0.06, 0.015, 12, { x: 0, y: 1.512, z: 0.03, tile: 'plain', tint: 0xd8dde4 });
            v.box(1.6, 0.01, 0.4, { y: 1.168, tile: 'velvet', tint: 0x3a2a5a });
            v.box(1.6, 0.012, 0.4, { y: 0.842, tile: 'velvet', tint: 0x3a2a5a });
            v.lathe([[0, 0], [0.03, 0], [0.04, 0.05], [0.02, 0.1], [0.03, 0.14]], 8, { x: 0.25, y: 1.512, z: 0, tile: 'plain', tint: 0x4a7a6a });
            v.box(0.1, 0.06, 0.07, { x: -0.2, y: 1.512, z: 0.02, tile: 'brass' });
            v.cyl(0.07, 0.07, 0.02, 14, { x: -0.25, y: 0.854, z: 0.05, tile: 'brass', tint: 0xe0c080 });
            lights.push({ p: [cx + nx * 0.5, 1.6, cz + nz * 0.5], c: [0.8, 0.62, 0.36], range: 3.0 });
            lantern(v, 0, 1.92, 0);
          }
        });
        return { colliders: [{ x: cx, z: cz, hw: Math.abs(nz) ? 0.87 : 0.27, hd: Math.abs(nz) ? 0.27 : 0.87 }], lights };
      },
    };
  }),

  /* ===== Pince (cellar) ===== */
  {
    id: 'hordok', room: 'pince', name: 'Hordók', at: [11.0, 9.6], reach: 1.6,
    tiers: [T('Két hordó', 60, 1, 'A bor gyorsabban érik.'), T('Hordósor', 200, 2, 'A bor még gyorsabban érik.'), T('Hordósor csappal, lámpással', 450, 3, 'A leggyorsabban érik a bor.')],
    build(b, k) {
      const x = 11.62;
      const f = -1;
      if (!k) {
        outline(b, x, 9.6, 0.7, 2.6, 0, f);
        return {};
      }
      const n = [0, 2, 4, 6][k];
      const lights = [];
      // Timber cradles along the east wall, casks with their heads towards the room.
      for (const lvl of [0, 1]) {
        if (lvl && n < 4) continue;
        b.box(0.08, 0.1, 2.8, { x: x - 0.22, y: f + lvl * 0.56, z: 9.6, tile: 'beam', tint: BEAM });
        b.box(0.08, 0.1, 2.8, { x: x + 0.22, y: f + lvl * 0.56, z: 9.6, tile: 'beam', tint: BEAM });
      }
      for (let i = 0; i < n; i++) {
        const lvl = i >= 3 ? 1 : 0;
        const zz = 8.6 + (i % 3) * 0.95 + lvl * 0.45;
        cask(b, x, f + 0.06 + lvl * 0.56, zz, 0.27, 0.66, Math.PI, k >= 3 && i === 1);
      }
      if (k >= 3) {
        b.lathe([[0, 0], [0.05, 0], [0.055, 0.14], [0.05, 0.15]], 10, { x: x - 0.5, y: f, z: 9.4, tile: 'beam', tint: BEAM });
        lights.push({ p: lantern(b, x - 0.3, f + 1.55, 10.85), c: [1.0, 0.7, 0.38], range: 4.5 });
        b.box(0.02, 0.4, 0.02, { x: x - 0.3, y: f + 1.85, z: 10.85, tile: 'iron' });
      }
      return { colliders: [{ x, z: 9.6, hw: 0.36, hd: 1.45 }], lights };
    },
  },
  {
    id: 'borospolc', room: 'pince', name: 'Borospolc', at: [7.3, 9.2], reach: 1.6,
    tiers: [T('Kis borospolc (6 palack)', 80, 1, 'A pincében tartott bor idővel többet ér.'), T('Nagy borospolc (14 palack)', 260, 2), T('Pincényi borospolc (24 palack)', 600, 3)],
    build(b, k) {
      const x = 6.3;
      const f = -1;
      const zc = 9.4;
      if (!k) {
        outline(b, x + 0.2, zc, 0.36, 2.4, 0, f);
        return {};
      }
      const w = [0, 1.0, 2.0, 3.0][k];
      const lights = [];
      const cols = Math.round(w / 0.25);
      const rows = 5;
      b.at(x + 0.18, f, zc, Math.PI / 2, (r) => {
        r.box(w, 0.04, 0.34, { y: 0, tile: 'wood', tint: OAKT });
        r.box(w, 0.04, 0.34, { y: 1.5, tile: 'wood', tint: OAKT });
        for (let i = 0; i <= cols; i++) r.box(0.03, 1.5, 0.34, { x: -w / 2 + (i * w) / cols, tile: 'wood', tint: OAKT });
        for (let j = 1; j < rows; j++) r.box(w, 0.025, 0.34, { y: j * 0.3, tile: 'wood', tint: OAKT });
      });
      const total = [0, 6, 14, 24][k];
      let placed = 0;
      for (let j = 0; j < rows && placed < total; j++) {
        for (let i = 0; i < cols && placed < total; i++) {
          if ((i * 3 + j * 5) % 4 === 3 && placed < total - 2 && k < 3) continue;
          bottle(b, x + 0.02, f + 0.04 + j * 0.3 + 0.06, zc - w / 2 + (i + 0.5) * (w / cols), Math.PI / 2);
          placed++;
        }
      }
      lights.push({ p: lantern(b, x + 0.35, f + 1.75, zc), c: [0.95, 0.66, 0.36], range: 4.8 });
      return { colliders: [{ x: x + 0.18, z: zc, hw: 0.2, hd: w / 2 + 0.02 }], lights };
    },
  },
];
