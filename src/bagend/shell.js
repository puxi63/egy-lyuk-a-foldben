/* ==== bagend/shell.js — the architecture of Bag End's interior (fixed, built once): floors, panelled walls with
   round-topped doorways and deep round windows, barrel vaults with timber ribs, posts, wall plates and ridge beams,
   the round front door from the inside, the parlour fireplace and the kitchen hearth, the corridor's candle sconces,
   the cellar stair, and per room the "dust" layer of the empty house (cobwebs, dust patches) ====
 * Everything is written into a Builder per room (kit.js). Returns per room { shell, dust } chunks plus the static
 * colliders and the fixed lights. */
import * as THREE from 'three';
import { DOORS, ROOMS, STAIR, WALL, WINDOWS } from './plan.js';

const FRAME = 0x7a5232; // door and window frames
const BEAM = 0xd8c8b4; // tint of the dark-oak beam tile
const OAK = 0x8a6038;

/** Builds a BufferGeometry from a grid of rows (each row an array of { p: [x,y,z], n: [x,y,z], uv: [u,v] }). */
function gridGeo(rows) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const w = rows[0].length;
  for (const row of rows) {
    for (const v of row) {
      pos.push(...v.p);
      nor.push(...v.n);
      uv.push(...v.uv);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < w - 1; j++) {
      const a = i * w + j;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** The four walls of a room: side, fixed coordinate, u range, inward normal, whether it is an end wall (lunette). */
function wallsOf(r) {
  const endX = r.axis === 'x';
  return [
    { side: 'z0', fixed: r.z0, u0: r.x0, u1: r.x1, nx: 0, nz: 1, end: !endX },
    { side: 'z1', fixed: r.z1, u0: r.x0, u1: r.x1, nx: 0, nz: -1, end: !endX },
    { side: 'x0', fixed: r.x0, u0: r.z0, u1: r.z1, nx: 1, nz: 0, end: endX },
    { side: 'x1', fixed: r.x1, u0: r.z0, u1: r.z1, nx: -1, nz: 0, end: endX },
  ];
}

/** Doorways that pierce a given wall of a room. */
function doorsOn(r, w) {
  const zWall = w.side[0] === 'z';
  return DOORS.filter((d) => d.rooms.includes(r.id) && (d.line === 'z') === zWall
    && (Math.abs(w.fixed - d.c0) < 0.01 || Math.abs(w.fixed - d.c1) < 0.01));
}

function windowsOn(r, w) {
  return w.side === 'z0' ? WINDOWS.filter((x) => x.room === r.id) : [];
}

/** Maps wall-plane coordinates (u along the wall, y absolute, offset d into the room) to a local point. */
function wallPoint(w, u, y, d = 0) {
  return w.side[0] === 'z' ? [u, y, w.fixed + w.nz * d] : [w.fixed + w.nx * d, y, u];
}

/** Arch outline of a doorway in wall-plane coordinates: up the left jamb, over the semicircle, down the right. */
function archPath(d, y0, segs = 12) {
  const a = d.at - d.w / 2;
  const b = d.at + d.w / 2;
  const R = d.w / 2;
  const hs = d.h - R;
  const pts = [{ u: a, y: y0, nu: 1, ny: 0 }, { u: a, y: hs, nu: 1, ny: 0 }];
  for (let i = 1; i < segs; i++) {
    const t = Math.PI - (i / segs) * Math.PI;
    pts.push({ u: d.at + Math.cos(t) * R, y: hs + Math.sin(t) * R, nu: -Math.cos(t), ny: -Math.sin(t) });
  }
  pts.push({ u: b, y: hs, nu: -1, ny: 0 }, { u: b, y: y0, nu: -1, ny: 0 });
  return pts;
}

/** One wall face (with doorway notches, door / window holes, the lunette top on end walls) as a shape geometry. */
function wallShape(r, w) {
  const f = r.floor;
  const H = r.H;
  const shape = new THREE.Shape();
  const doors = doorsOn(r, w).sort((a, b) => a.at - b.at);
  shape.moveTo(w.u0, 0);
  const holes = [];
  for (const d of doors) {
    if (d.round) {
      const h = new THREE.Path();
      h.absarc(d.at, 0.92 - f, 0.85, 0, Math.PI * 2, false);
      holes.push(h);
      continue;
    }
    const y0 = 0 - f;
    const R = d.w / 2;
    const hs = d.h - R - f;
    if (y0 <= 0.001) {
      shape.lineTo(d.at - R, 0);
      shape.lineTo(d.at - R, hs);
      shape.absarc(d.at, hs, R, Math.PI, 0, true);
      shape.lineTo(d.at + R, 0);
    } else {
      const h = new THREE.Path();
      h.moveTo(d.at - R, y0);
      h.lineTo(d.at + R, y0);
      h.lineTo(d.at + R, hs);
      h.absarc(d.at, hs, R, 0, Math.PI, false);
      h.lineTo(d.at - R, y0);
      holes.push(h);
    }
  }
  shape.lineTo(w.u1, 0);
  shape.lineTo(w.u1, H);
  if (w.end) {
    const mid = (w.u0 + w.u1) / 2;
    shape.absellipse(mid, H, (w.u1 - w.u0) / 2, r.rise, 0, Math.PI, false);
  } else shape.lineTo(w.u0, H);
  shape.lineTo(w.u0, 0);
  for (const win of windowsOn(r, w)) {
    const h = new THREE.Path();
    h.absarc(win.at, win.y - f, win.r, 0, Math.PI * 2, false);
    holes.push(h);
  }
  shape.holes = holes;
  const g = new THREE.ShapeGeometry(shape, 18);
  // Shape (u, v) → local: z walls keep x = u; x walls turn u onto z.
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const v = p.getY(i);
    const q = wallPoint(w, u, v + f, 0);
    p.setXYZ(i, q[0], q[1], q[2]);
    n.setXYZ(i, w.nx, 0, w.nz);
  }
  return g;
}

/** The vault surface over a room (inward normals), uv in metres. */
function vaultGeo(r) {
  const N = 22;
  const s0 = r.axis === 'x' ? r.z0 : r.x0;
  const s1 = r.axis === 'x' ? r.z1 : r.x1;
  const a0 = r.axis === 'x' ? r.x0 : r.z0;
  const a1 = r.axis === 'x' ? r.x1 : r.z1;
  const hs = (s1 - s0) / 2;
  const mid = (s0 + s1) / 2;
  const rows = [];
  for (const a of [a0, a1]) {
    const row = [];
    let arc = 0;
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI;
      const s = mid - Math.cos(t) * hs;
      const y = r.floor + r.H + Math.sin(t) * r.rise;
      if (prev) arc += Math.hypot(s - prev[0], y - prev[1]);
      prev = [s, y];
      let nx = Math.cos(t) / hs;
      let ny = -Math.sin(t) / r.rise;
      const l = Math.hypot(nx, ny);
      nx /= l;
      ny /= l;
      const p = r.axis === 'x' ? [a, y, s] : [s, y, a];
      const nn = r.axis === 'x' ? [0, ny, nx] : [nx, ny, 0];
      row.push({ p, n: nn, uv: [arc, a] });
    }
    rows.push(row);
  }
  return gridGeo(rows);
}

/** A curved timber rib following the vault at axis position a (boxes along the ellipse, slightly inside). */
function rib(b, r, a, width = 0.14, depth = 0.09, segs = 12) {
  const s0 = r.axis === 'x' ? r.z0 : r.x0;
  const s1 = r.axis === 'x' ? r.z1 : r.x1;
  const hs = (s1 - s0) / 2;
  const mid = (s0 + s1) / 2;
  const P = (t) => [mid - Math.cos(t) * (hs - 0.01), r.floor + r.H + Math.sin(t) * (r.rise - 0.01)];
  for (let i = 0; i < segs; i++) {
    const [sa, ya] = P((i / segs) * Math.PI);
    const [sb, yb] = P(((i + 1) / segs) * Math.PI);
    const len = Math.hypot(sb - sa, yb - ya) + 0.02;
    const ds = (sb - sa) / len;
    const dy = (yb - ya) / len;
    // Normal of the tangent turned towards the vault's centre line (into the room).
    const ms = (sa + sb) / 2;
    const my = (ya + yb) / 2;
    let ins = -dy;
    let iny = ds;
    if (ins * (mid - ms) + iny * (r.floor + r.H - my) < 0) {
      ins = -ins;
      iny = -iny;
    }
    const cs = ms + (ins * depth) / 2;
    const cy = my + (iny * depth) / 2;
    if (r.axis === 'x') {
      b.box(width, len, depth, { center: true, x: a, y: cy, z: cs, rx: Math.atan2(sb - sa, yb - ya), tile: 'beam', tint: BEAM });
    } else {
      b.box(depth, len, width, { center: true, x: cs, y: cy, z: a, rz: Math.atan2(-(sb - sa), yb - ya), tile: 'beam', tint: BEAM });
    }
  }
}

/** The passage lining through the wall thickness, the threshold, and frame trims on both faces. */
function doorway(b, d, roomById) {
  const pts = archPath(d, 0, 14);
  const map = (u, y, w) => (d.line === 'z' ? [u, y, w] : [w, y, u]);
  const mapN = (nu, ny) => (d.line === 'z' ? [nu, ny, 0] : [0, ny, nu]);
  // Lining: rows across the thickness.
  const rows = [d.c0, d.c1].map((wc) => {
    let len = 0;
    return pts.map((p, i) => {
      if (i) len += Math.hypot(p.u - pts[i - 1].u, p.y - pts[i - 1].y);
      return { p: map(p.u, p.y, wc), n: mapN(p.nu, p.ny), uv: [len, wc] };
    });
  });
  const ra = roomById[d.rooms[0]];
  b.add(gridGeo(rows), { uv: 'metric', tile: 'oak', tint: 0x9a7048, room: ra.index });
  // Threshold board.
  const tw = d.line === 'z' ? d.w : WALL + 0.06;
  const td = d.line === 'z' ? WALL + 0.06 : d.w;
  const tc = map(d.at, 0, (d.c0 + d.c1) / 2);
  b.box(tw, 0.025, td, { x: tc[0], y: 0, z: tc[2], tile: 'oak', tint: 0x8a6038, room: ra.index });
  // Frame trims: a 9 cm band around the opening on each face.
  for (const [wc, sgn, rid] of [[d.c0, -1, d.rooms[0]], [d.c1, 1, d.rooms[1] || d.rooms[0]]]) {
    const room = roomById[rid];
    const off = wc + sgn * 0.022;
    const trimRows = [0, 0.1].map((o) => pts.map((p) => ({ p: map(p.u - p.nu * o, p.y - p.ny * o, off), n: d.line === 'z' ? [0, 0, sgn] : [sgn, 0, 0], uv: [p.u, p.y] })));
    b.add(gridGeo(trimRows), { uv: 'metric', tile: 'beam', tint: 0xc0a080, room: room.index });
    // Side faces of the trim (the 2 cm edge).
    const edge = [wc, off].map((w) => pts.map((p) => ({ p: map(p.u - p.nu * 0.1, p.y - p.ny * 0.1, w), n: mapN(-p.nu, -p.ny), uv: [p.u, p.y] })));
    b.add(gridGeo(edge), { uv: 'metric', tile: 'beam', tint: 0xa08060, room: room.index });
  }
}

/** A deep-set round window: reveal, the bright view, glazing bars, the frame ring, a deep sill. */
function roundWindow(b, win, room) {
  const { at, y, r } = win;
  b.add(new THREE.CylinderGeometry(r, r, WALL + 0.02, 28, 1, true).rotateX(Math.PI / 2), { x: at, y, z: -WALL / 2, uv: 'native', u: 3, v: 0.3, tile: 'plaster', tint: 0xf0e6d0 });
  b.add(new THREE.CircleGeometry(r, 28), { x: at, y, z: -0.24, uv: 'face', tile: 'window', kind: 1, tint: [1.05, 1.0, 0.9] });
  // Glazing: a ring and a cross of bars (small panes, as on the films' Bag End windows).
  b.box(0.035, r * 2, 0.04, { center: true, x: at, y, z: -0.2, tile: 'beam', tint: 0x9a7a5a });
  b.box(r * 2, 0.035, 0.04, { center: true, x: at, y, z: -0.2, tile: 'beam', tint: 0x9a7a5a });
  b.torus(r * 0.55, 0.018, { x: at, y, z: -0.2, tile: 'beam', tint: 0x9a7a5a }, 6, 24);
  b.torus(r * 0.98, 0.03, { x: at, y, z: -0.205, tile: 'beam', tint: 0x9a7a5a }, 6, 28);
  b.torus(r + 0.045, 0.055, { x: at, y, z: 0.005, tile: 'beam', tint: 0xc8a888 }, 8, 32);
  b.box(r * 1.5, 0.045, 0.2, { x: at, y: y - r - 0.06, z: 0.06, tile: 'oak', tint: 0xb08860 });
  void room;
}

/** The round front door from the inside: reveal, the green door with planks, brass knob, iron straps, frame. */
function frontDoor(b) {
  const R = 0.85;
  const cy = 0.92;
  b.add(new THREE.CylinderGeometry(R, R, WALL + 0.02, 32, 1, true).rotateX(Math.PI / 2), { x: 0, y: cy, z: -WALL / 2, uv: 'native', u: 6, v: 0.3, tile: 'oak', tint: 0x9a7048 });
  b.add(new THREE.CircleGeometry(R, 32), { x: 0, y: cy, z: -0.16, uv: 'face', tile: 'door' });
  b.add(new THREE.CylinderGeometry(R, R, 0.08, 32, 1, true).rotateX(Math.PI / 2), { x: 0, y: cy, z: -0.2, uv: 'native', u: 6, v: 0.2, tile: 'door' });
  // The brass knob in the exact centre (on the inside too) and its rose.
  b.cyl(0.07, 0.07, 0.015, 16, { center: true, x: 0, y: cy, z: -0.15, rx: Math.PI / 2, tile: 'brass' });
  b.sphere(0.055, { x: 0, y: cy, z: -0.09, tile: 'brass' }, 14, 10);
  b.cyl(0.02, 0.025, 0.05, 8, { center: true, x: 0, y: cy, z: -0.13, rx: Math.PI / 2, tile: 'brass' });
  // Iron hinge straps across the planks and a latch bar.
  for (const yy of [cy + 0.45, cy - 0.45]) {
    const half = Math.sqrt(R * R - (yy - cy) ** 2) * 0.92;
    b.box(half * 1.3, 0.05, 0.015, { center: true, x: -half * 0.35, y: yy, z: -0.152, tile: 'iron' });
  }
  b.box(0.05, 0.3, 0.03, { center: true, x: 0.42, y: cy + 0.05, z: -0.14, tile: 'iron' });
  // The wooden frame round the door on the wall face: a flat ring with a rounded inner edge.
  b.add(new THREE.RingGeometry(R + 0.02, R + 0.24, 40, 1), { x: 0, y: cy, z: 0.012, uv: 'planar', tile: 'oak', tint: 0xa87850 });
  b.torus(R + 0.03, 0.045, { x: 0, y: cy, z: 0.012, tile: 'beam', tint: 0xc8a888 }, 8, 40);
  b.torus(R + 0.24, 0.025, { x: 0, y: cy, z: 0.012, tile: 'beam', tint: 0xc8a888 }, 6, 40);
}

/** A candle sconce on a wall: backplate, brass arm, dish, candle, flame. Returns the flame's local position. */
function sconce(b, x, y, z, nx, nz) {
  const ry = Math.atan2(nx, nz);
  b.at(x, y, z, ry, (s) => {
    s.box(0.1, 0.18, 0.02, { center: true, y: 0, z: 0.01, tile: 'oak', tint: 0x6a4a2a });
    s.box(0.025, 0.025, 0.16, { center: true, y: -0.02, z: 0.09, tile: 'brass' });
    s.cyl(0.05, 0.035, 0.02, 12, { y: -0.03, z: 0.17, tile: 'brass' });
    s.cyl(0.017, 0.018, 0.12, 8, { y: -0.01, z: 0.17, tile: 'wax' });
    flame(s, 0, 0.12, 0.17, 0.03, 0.07);
  });
  return [x + nx * 0.17, y + 0.14, z + nz * 0.17];
}

/** A small candle flame: two crossed quads with the flame tile (kind 2: flickering, swaying). */
export function flame(b, x, y, z, w, h) {
  for (const ry of [0, Math.PI / 2]) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    b.add(g, { x, y, z, ry, uv: 'face', tile: 'fire', kind: 2, glass: true });
  }
}

/**
 * Builds the shell. Returns { rooms: [{ shell: {opaque, glass}, dust: {opaque, glass} }], colliders: [boxes],
 * lights: [{ room, p: [x,y,z], c: [r,g,b], range, flicker }] } (lights in local coordinates).
 * @param {import('./kit.js').Builder} b
 */
export function buildShell(b) {
  const roomById = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
  const out = { rooms: [], colliders: [], lights: [] };
  const L = (room, p, c, range, flicker = false) => out.lights.push({ room, p, c, range, flicker });

  for (const r of ROOMS) {
    b.room = r.index;
    const f = r.floor;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    // Floor (boards run along the room's long axis).
    const along = r.axis === 'x' ? 0 : Math.PI / 2;
    b.add(new THREE.PlaneGeometry(r.axis === 'x' ? r.x1 - r.x0 : r.z1 - r.z0, r.axis === 'x' ? r.z1 - r.z0 : r.x1 - r.x0), {
      x: cx, y: f, z: cz, rx: -Math.PI / 2, ry: along, tile: r.floorTile, tint: r.floorTile === 'boards' ? 0xe8dcc8 : 0xffffff,
    });
    // Walls, panelling and posts.
    for (const w of wallsOf(r)) {
      b.add(wallShape(r, w), { uv: 'metric', tile: r.walls, tint: r.walls === 'earth' ? 0xffffff : 0xfff6e8 });
      if (r.wains) {
        // Lower wall finish between the doorways, with a moulded rail on top.
        const gaps = doorsOn(r, w).filter((d) => !d.round && f >= -0.001).map((d) => [d.at - d.w / 2 - 0.1, d.at + d.w / 2 + 0.1]);
        if (w.side === 'z0' && r.id === 'eloszoba') gaps.push([-0.98, 0.98]);
        gaps.sort((a, c) => a[0] - c[0]);
        let s = w.u0;
        const runs = [];
        for (const [g0, g1] of gaps) {
          if (g0 > s) runs.push([s, g0]);
          s = Math.max(s, g1);
        }
        if (w.u1 > s) runs.push([s, w.u1]);
        const hgt = r.wains === 'tilewhite' ? 1.15 : 0.92;
        for (const [u0, u1] of runs) {
          const len = u1 - u0;
          if (len < 0.05) continue;
          const mid = (u0 + u1) / 2;
          const c = wallPoint(w, mid, f, 0.016);
          const rotY = w.side[0] === 'z' ? 0 : Math.PI / 2;
          b.box(len, hgt, 0.032, { x: c[0], y: f, z: c[2], ry: rotY, tile: r.wains, tint: r.wains === 'panel' ? 0xf0e0cc : 0xffffff, du: u0 / 0.9 });
          const rc = wallPoint(w, mid, f, 0.03);
          b.box(len, 0.055, 0.06, { x: rc[0], y: f + hgt, z: rc[2], ry: rotY, tile: 'beam', tint: 0xc0a080 });
          const sk = wallPoint(w, mid, f, 0.04);
          b.box(len, 0.1, 0.05, { x: sk[0], y: f, z: sk[2], ry: rotY, tile: 'beam', tint: 0xa08060 });
        }
      }
    }
    // The vault, its ribs (with posts down the long walls), the wall plates and the ridge beam.
    b.add(vaultGeo(r), { uv: 'metric', tile: r.walls === 'earth' ? 'earth' : 'plaster', tint: r.walls === 'earth' ? 0xe0d8d0 : 0xfff2e0 });
    const a0 = r.axis === 'x' ? r.x0 : r.z0;
    const a1 = r.axis === 'x' ? r.x1 : r.z1;
    const len = a1 - a0;
    const nRib = Math.max(1, Math.round(len / 1.45));
    const longWalls = wallsOf(r).filter((w) => !w.end);
    const blocked = (w, a) => doorsOn(r, w).some((d) => !d.round && Math.abs(d.at - a) < d.w / 2 + 0.16)
      || windowsOn(r, w).some((x) => Math.abs(x.at - a) < x.r + 0.18);
    for (let i = 0; i <= nRib; i++) {
      const a = i === 0 ? a0 + 0.08 : i === nRib ? a1 - 0.08 : a0 + (len * i) / nRib;
      rib(b, r, a, i === 0 || i === nRib ? 0.16 : 0.14, 0.09);
      for (const w of longWalls) {
        if (blocked(w, a)) continue;
        const p = wallPoint(w, a, f, 0.045);
        b.box(r.axis === 'x' ? 0.14 : 0.09, r.H, r.axis === 'x' ? 0.09 : 0.14, { x: p[0], y: f, z: p[2], tile: 'beam', tint: BEAM, rz: 0 });
      }
    }
    for (const w of longWalls) {
      const p = wallPoint(w, (w.u0 + w.u1) / 2, f + r.H - 0.13, 0.05);
      b.box(r.axis === 'x' ? len : 0.1, 0.13, r.axis === 'x' ? 0.1 : len, { x: p[0], y: p[1], z: p[2], tile: 'beam', tint: BEAM });
    }
    const crown = f + r.H + r.rise - 0.05;
    b.box(r.axis === 'x' ? len : 0.2, 0.06, r.axis === 'x' ? 0.2 : len, { x: cx, y: crown - 0.03, z: cz, tile: 'beam', tint: BEAM });
    // Window rooms: the bright views and their daylight; the others get a dim spill from their doorway.
    for (const w of WINDOWS.filter((x) => x.room === r.id)) {
      roundWindow(b, w, r);
      L(r.index, [w.at, w.y + 0.1, 1.0], [1.05, 0.86, 0.64], 6.4);
    }
    out.rooms.push({ shell: null, dust: null });
  }
  // Doorways (lining, threshold, trims) and the front door.
  for (const d of DOORS) {
    if (d.round) {
      b.room = roomById.eloszoba.index;
      frontDoor(b);
    } else doorway(b, d, roomById);
  }

  // The parlour fireplace: a stone chimney breast on the east end wall, brick firebox, hearth stone.
  {
    const r = roomById.nappali;
    b.room = r.index;
    const x1 = r.x1;
    const zc = 2.1;
    b.box(0.48, 0.95, 0.37, { x: x1 - 0.24, y: 0, z: zc - 0.665, tile: 'stone' });
    b.box(0.48, 0.95, 0.37, { x: x1 - 0.24, y: 0, z: zc + 0.665, tile: 'stone' });
    b.box(0.5, 0.3, 1.7, { x: x1 - 0.25, y: 0.95, z: zc, tile: 'stone' });
    b.box(0.4, r.H + r.rise * 0.93 - 1.25, 1.62, { x: x1 - 0.2, y: 1.25, z: zc, tile: 'plaster', tint: 0xf4e8d4 });
    b.box(0.08, 0.95, 0.96, { x: x1 - 0.04, y: 0, z: zc, tile: 'brick', tint: 0x6a5a50 });
    b.box(0.48, 0.05, 0.96, { x: x1 - 0.24, y: 0.9, z: zc, tile: 'brick', tint: 0x302824 });
    b.box(0.9, 0.04, 1.9, { x: x1 - 0.45, y: 0, z: zc, tile: 'flags', tint: 0xb0a898 });
    out.colliders.push({ x: x1 - 0.25, z: zc, hw: 0.27, hd: 0.86 });
  }
  // The kitchen hearth: a brick chimney breast with a wide alcove on the back wall, where the range stands.
  {
    const r = roomById.konyha;
    b.room = r.index;
    const z1 = r.z1;
    const xc = -3;
    b.box(0.4, 1.35, 0.5, { x: xc - 0.9, y: 0, z: z1 - 0.25, tile: 'brick' });
    b.box(0.4, 1.35, 0.5, { x: xc + 0.9, y: 0, z: z1 - 0.25, tile: 'brick' });
    b.box(2.2, 0.28, 0.5, { x: xc, y: 1.35, z: z1 - 0.25, tile: 'brick' });
    b.box(2.2, r.H + r.rise * 0.6 - 1.63, 0.4, { x: xc, y: 1.63, z: z1 - 0.2, tile: 'plaster', tint: 0xf0e4d0 });
    b.box(1.4, 1.35, 0.05, { x: xc, y: 0, z: z1 - 0.03, tile: 'brick', tint: 0x7a6a60 });
    b.box(1.4, 0.04, 0.48, { x: xc, y: 0, z: z1 - 0.25, tile: 'flags', tint: 0x8a8278 });
    b.box(2.3, 0.06, 0.12, { x: xc, y: 1.62, z: z1 - 0.52, tile: 'beam', tint: BEAM });
    out.colliders.push({ x: xc, z: z1 - 0.25, hw: 1.1, hd: 0.27 });
  }
  // Candle sconces: the hall and the corridor (the house is never completely dark).
  {
    const hall = roomById.eloszoba;
    b.room = hall.index;
    for (const [x, nx] of [[hall.x0, 1], [hall.x1, -1]]) L(hall.index, sconce(b, x, 1.5, 3.75, nx, 0), [1.0, 0.62, 0.32], 4.6, true);
    L(hall.index, [0, 1.7, 1.4], [0.45, 0.37, 0.29], 4.2);
    const cor = roomById.folyoso;
    b.room = cor.index;
    for (const x of [-5.6, 0.7, 6.2]) L(cor.index, sconce(b, x, 1.5, cor.z1, 0, -1), [1.0, 0.62, 0.32], 5.2, true);
  }
  // The cellar stair: a landing from the doorway and four steps down to the cellar floor, with a handrail.
  {
    const r = roomById.pince;
    b.room = r.index;
    const w = STAIR.x1 - STAIR.x0;
    const xc = (STAIR.x0 + STAIR.x1) / 2;
    b.box(w, 1, STAIR.landing - r.z0, { x: xc, y: -1, z: (r.z0 + STAIR.landing) / 2, tile: 'stone', tint: 0xd0c4b0 });
    const dz = (STAIR.z1 - STAIR.landing) / STAIR.steps;
    for (let k = 0; k < STAIR.steps - 1; k++) {
      const top = STAIR.top + ((STAIR.bottom - STAIR.top) * (k + 1)) / STAIR.steps;
      b.box(w, top + 1, dz, { x: xc, y: -1, z: STAIR.landing + dz * (k + 0.5), tile: 'stone', tint: 0xd0c4b0 });
    }
    for (const x of [STAIR.x0 + 0.04, STAIR.x1 - 0.04]) {
      for (const [z, y] of [[r.z0 + 0.15, 0], [STAIR.landing, 0], [STAIR.z1 - 0.1, -0.8]]) b.box(0.06, 0.9, 0.06, { x, y, z, tile: 'beam', tint: BEAM });
      const zA = STAIR.landing;
      const zB = STAIR.z1 - 0.1;
      const l = Math.hypot(zB - zA, 0.8);
      b.box(0.06, 0.05, l, { center: true, x, y: 0.9 - 0.4, z: (zA + zB) / 2, rx: Math.atan2(0.8, zB - zA), tile: 'beam', tint: BEAM });
      b.box(0.06, 0.05, STAIR.landing - r.z0 - 0.15, { center: true, x, y: 0.9, z: (r.z0 + 0.15 + STAIR.landing) / 2, tile: 'beam', tint: BEAM });
    }
  }
  // Fixed spill lights for the rooms without windows (from their doorways).
  const spill = (id, p, k = 1) => L(roomById[id].index, p, [0.62 * k, 0.52 * k, 0.42 * k], 4.6);
  spill('konyha', [-3, 1.6, 7.3]);
  spill('kamra', [-8.65, 1.6, 7.3]);
  spill('kamra', [-6.5, 1.5, 9.4], 0.5);
  spill('mathom', [3.15, 1.6, 7.3]);
  spill('pince', [9.15, 1.4, 7.2], 1.8);
  spill('pince', [9.15, 0.8, 9.8], 0.9);
  spill('folyoso', [0, 1.6, 4.9], 0.7);

  // Shell chunks per room (the builder holds everything of this pass; split by room afterwards in index.js).
  out.shell = b.take();
  // The dust layer of the empty house: cobwebs in the upper corners, grey patches on the floor.
  for (const r of ROOMS) {
    b.room = r.index;
    const f = r.floor;
    const y = f + r.H - 0.02;
    const corners = [[r.x0, r.z0, 1, 1], [r.x1, r.z0, -1, 1], [r.x0, r.z1, 1, -1], [r.x1, r.z1, -1, -1]];
    corners.forEach(([x, z, sx, sz], i) => {
      if ((i + r.index) % 4 === 3) return;
      const s = 0.55 + ((i * 7 + r.index * 3) % 5) * 0.08;
      const g = new THREE.BufferGeometry();
      const P = [x, y, z, x + sx * s, y, z, x, y - s * 0.9, z, x, y, z + sz * s];
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.02, 0.02, 0.02, 0.98], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      b.add(g, { uv: 'face', tile: 'cobweb', glass: true, kind: 3, tint: [0.9, 0.9, 0.88] });
    });
    const n = Math.round(((r.x1 - r.x0) * (r.z1 - r.z0)) / 7) + 1;
    for (let i = 0; i < n; i++) {
      const u = ((i * 0.618 + r.index * 0.31) % 1) * 0.8 + 0.1;
      const v = ((i * 0.382 + r.index * 0.57) % 1) * 0.8 + 0.1;
      const s = 1.2 + ((i * 5 + r.index) % 4) * 0.35;
      b.add(new THREE.PlaneGeometry(s, s * 0.8), {
        x: r.x0 + u * (r.x1 - r.x0), y: f + 0.004 + i * 0.0005, z: r.z0 + v * (r.z1 - r.z0), rx: -Math.PI / 2, ry: i, uv: 'face', tile: 'dust', glass: true, kind: 3, tint: [0.75, 0.72, 0.68],
      });
    }
  }
  out.dust = b.take();
  return out;
}
