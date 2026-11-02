/* ==== surface/parts.js — reusable Shire props built from primitives into the static batch: hobbit-hole hills with
   round doors and windows, trees, hedges, fences, barrels, benches, lanterns, pumpkins, crops and flowers ==== */
import * as THREE from 'three';
import { clump, plant, verge } from './flora.js';
import { box, cyl, lumpy, noise2, rng, shadeBelow, smoothstep, trs } from './kit.js';
import { Accum, leafCards, shireTree } from './trees.js';

const rand = rng(777);

/**
 * A placement frame: everything added through it is built in local metres (x right, y up, +z towards the viewer /
 * out of the door) and moved to (x, y, z) turned by `yaw`.
 */
export function at(batch, x, y, z, yaw = 0) {
  const world = trs(x, y, z, 0, yaw, 0);
  return {
    batch,
    x,
    y,
    z,
    yaw,
    world,
    /** Local point → world (THREE.Vector3). */
    toWorld(lx, ly, lz) {
      return new THREE.Vector3(lx, ly, lz).applyMatrix4(world);
    },
    add(key, geo, color, local = null, o = {}) {
      const m = local ? world.clone().multiply(local) : world;
      return batch.add(key, geo, color, m, { groundY: y, ...o });
    },
  };
}

/** Vertex-coloured copy helper for parts that carry their own colours. */
function colored(geo, c) {
  const col = new THREE.Color(c);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/* ---- trees and greenery ---- */

/**
 * A tree (see trees.js): a branching trunk with leaf clusters of cards and dark inner masses.
 * kind: 'oak' (the great oak above Bag End), 'party' (the Party Tree), 'round' (garden and meadow trees), 'poplar',
 * 'far' and 'farPoplar' (the hills: lower detail). Returns { top, x, z, trunkR }.
 */
export function tree(batch, x, y, z, s = 1, kind = 'round', seed = 1) {
  return shireTree(batch, x, y, z, s, kind, seed);
}

/** Fuzzy leaf cards over one leaf mass (hedges, bushes): breaks the smooth blob silhouette into leaves. */
function fuzz(acc, cx, cy, cz, rx, ry, rz, n, size, color, r) {
  const C = new THREE.Vector3(cx, cy - ry * 0.4, cz);
  for (let k = 0; k < n; k++) {
    // Points on the upper / outer part of the ellipsoid.
    const a = r() * Math.PI * 2;
    const e = 0.15 + r() * 1.1;
    const px = cx + Math.cos(a) * Math.cos(e) * rx * 0.8;
    const py = cy + Math.sin(e) * ry * 0.8;
    const pz = cz + Math.sin(a) * Math.cos(e) * rz * 0.8;
    const c = color.clone().multiplyScalar(0.75 + 0.35 * Math.sin(e) + (r() - 0.5) * 0.1);
    leafCards(acc, px, py, pz, size, 1, r, c, C, Math.max(rx, ry, rz));
  }
}

/** Leaf-card tint of a hedge or bush colour (the card texture is mid-green: lighten the base colour). */
function cardTint(color) {
  const c = new THREE.Color(color);
  return new THREE.Color(Math.min(1.2, c.r * 2.2 + 0.08), Math.min(1.2, c.g * 1.9 + 0.1), Math.min(1.2, c.b * 1.6 + 0.04));
}

/** A clipped hedge along a polyline: overlapping lumpy leaf masses fuzzed with leaf cards, weeds at its foot. */
export function hedge(batch, pts, h = 1.1, w = 0.8, color = 0x557f30, seed = 3) {
  const r = rng(seed * 31 + 7);
  const acc = new Accum();
  const tint = cardTint(color);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 1.1));
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const g = new THREE.SphereGeometry(1, 8, 5);
      g.scale(w * 0.62, h * 0.62, (len / n) * 0.8);
      lumpy(g, 0.09, 2.2, seed + i * 7 + k);
      g.translate(0, h * 0.48, 0);
      colored(g, 0xffffff);
      shadeBelow(g, 0, h * 0.8, 0.5);
      batch.add('foliage', g, color, trs(x, 0, z, 0, yaw, 0), { ao: 0, jitter: 0.1 });
      fuzz(acc, x, h * 0.5, z, w * 0.6, h * 0.55, w * 0.6, 4, Math.min(0.9, h * 0.6), tint, r);
    }
  }
  batch.add('leaves', acc.geometry(), 0xffffff, null, { ao: 0, jitter: 0.06 });
  // Grass and weeds along both sides of its foot.
  for (const side of [-w * 0.5, w * 0.5]) verge(batch, pts, { side, every: 0.7, width: 0.25, scale: 0.8 });
}

/** A loose, rounded bush (by doors and in beds), fuzzed with leaf cards. */
export function bush(batch, x, y, z, r = 0.6, color = 0x4a7a2a, seed = 5) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  lumpy(g, r * 0.25, 2.5, seed);
  g.scale(1, 0.8, 1);
  g.translate(x, y + r * 0.65, z);
  colored(g, 0xffffff);
  shadeBelow(g, y, y + r * 1.2, 0.5);
  batch.add('foliage', g, color, null, { ao: 0, jitter: 0.12 });
  const acc = new Accum();
  fuzz(acc, x, y + r * 0.65, z, r, r * 0.8, r, Math.max(4, Math.round(r * 12)), Math.min(0.8, r * 0.9), cardTint(color), rng(Math.round(seed * 13 + 5)));
  batch.add('leaves', acc.geometry(), 0xffffff, null, { ao: 0, jitter: 0.08 });
}

/* ---- fences, gates, posts ---- */

/** A rough split-timber fence along a polyline (posts every ~2.2 m, two rails), weathered grey-brown. */
export function fence(batch, pts, h = 0.95, opts = {}) {
  const tint = opts.color ?? 0xb8a890;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.2));
    const yaw = Math.atan2(bx - ax, bz - az);
    const y0 = opts.groundY ? opts.groundY(ax, az) : 0;
    const y1 = opts.groundY ? opts.groundY(bx, bz) : 0;
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 0) continue;
      const t = k / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const post = box(0.13, h + 0.15, 0.13, 1);
      post.translate(0, (h + 0.15) / 2 - 0.1, 0);
      batch.add('wood', post, 0xc0b0a0, trs(x, y0 + (y1 - y0) * t, z, (rand() - 0.5) * 0.08, yaw + rand(), (rand() - 0.5) * 0.08), { ao: 0.4, groundY: y0 + (y1 - y0) * t });
      // Long grass and a dock or two round the foot of each post (the mower never gets there).
      if (opts.weeds !== false) clump(batch, x, y0 + (y1 - y0) * t, z, ['grass', 'grass', 'dock', 'meadow'], 2, 0.25, { scale: 0.9 });
    }
    if (opts.weeds !== false && !opts.groundY) verge(batch, [[ax, az], [bx, bz]], { every: 1.3, width: 0.3, scale: 0.75, kinds: ['grass', 'grass', 'meadow', 'daisy'] });
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const tilt = Math.atan2(y1 - y0, len);
    for (const ry of opts.rails ?? [h * 0.45, h * 0.85]) {
      const rail = box(len, 0.07, 0.05, 0.8);
      rail.rotateZ(tilt);
      batch.add('wood', rail, tint, trs(mx, (y0 + y1) / 2 + ry + (rand() - 0.5) * 0.04, mz, 0, yaw - Math.PI / 2, (rand() - 0.5) * 0.02), { ao: 0 });
    }
  }
}

/* ---- the hobbit hole: a turf hill with a vertical front, round door, round windows, chimney ---- */

/**
 * A hobbit-hole hill. The front face stands at local z = 0 (bowing back at the ends), the turf mound rises behind it.
 * Returns { F, heightAt(lx, lz), faceZ(lx) }.
 * o: { w, d, faceH, topH, curve, skirt, faceColor, turfColor, seed }
 */
export function holeHill(batch, x, y, z, yaw, o) {
  const F = at(batch, x, y, z, yaw);
  const W = o.w;
  const D = o.d;
  const faceH = o.faceH;
  const topH = o.topH;
  const curve = o.curve ?? 0.6;
  const seed = o.seed ?? 1;
  const nu = o.nu ?? 26;
  const nv = o.nv ?? 14;
  const S0 = 1.35;
  const faceZ = (lx) => -curve * (lx / (W / 2)) ** 2;
  const prof = (t) => {
    const rise = Math.sin(Math.min(1, t / 0.42) * Math.PI / 2);
    return (faceH + (topH - faceH) * rise) * (1 - smoothstep(0.5, 1, t));
  };
  const side = (s) => 1 - smoothstep(0.55, S0, Math.abs(s));
  const hAt = (s, t) => {
    const lx = (s * W) / 2;
    let h = prof(t) * side(s) + (noise2(lx * 0.25 + seed, t * 3 - seed) - 0.5) * 0.5 * smoothstep(0, 0.2, t) * side(s);
    // Beyond the face ends the mound runs down to the ground in front, too.
    if (Math.abs(s) > 1) h *= 1 - smoothstep(1, S0, Math.abs(s)) * 0.0;
    if (o.skirt && (t >= 0.999 || Math.abs(s) >= S0 - 1e-6)) h = -o.skirt;
    return h;
  };
  const pos = [];
  const uv = [];
  const col = [];
  const turf = new THREE.Color(o.turfColor ?? 0x4f7a26);
  for (let j = 0; j <= nv; j++) {
    const t = j / nv;
    for (let i = 0; i <= nu; i++) {
      const s = -S0 + (2 * S0 * i) / nu;
      const lx = (s * W) / 2;
      // Beyond the face ends the mound's front edge curves forward to meet the ground.
      const fz = Math.abs(s) <= 1 ? faceZ(lx) : faceZ(Math.sign(s) * W / 2) + (Math.abs(s) - 1) * W * 0.3;
      const lz = fz - t * D;
      const h = hAt(s, t);
      pos.push(lx, h, lz);
      uv.push(lx, lz);
      const n = noise2(lx * 0.3 + seed * 3, lz * 0.3);
      const k = 0.85 + 0.3 * n;
      col.push(turf.r * k, turf.g * k, turf.b * k);
    }
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  F.add('turf', g, 0xffffff, null, { ao: 0 });

  // The front face: earth-and-plaster wall from the ground up to the turf's front edge.
  const fp = [];
  const fu = [];
  const fi = [];
  const fn = 24;
  for (let i = 0; i <= fn; i++) {
    const s = -1 + (2 * i) / fn;
    const lx = (s * W) / 2;
    const h = Math.max(0.02, hAt(s, 0));
    fp.push(lx, -0.3, faceZ(lx) + 0.02, lx, h + 0.04, faceZ(lx) + 0.02);
    fu.push(lx * 0.5, -0.15, lx * 0.5, (h + 0.04) * 0.5);
  }
  for (let i = 0; i < fn; i++) {
    const a = i * 2;
    fi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
  fg.setIndex(fi);
  fg.computeVertexNormals();
  F.add(o.faceKey ?? 'plaster', fg, o.faceColor ?? 0xc8b48c, null, { ao: 0.8, aoMin: 0.6 });
  // A turf lip overhanging the face, with grass hanging over the edge.
  if (!o.noLip) {
    const lipPts = [];
    for (let i = 0; i <= 12; i++) {
      const s = -1 + (2 * i) / 12;
      const lx = (s * W) / 2;
      const h = hAt(s, 0);
      if (h > 0.25) lipPts.push(new THREE.Vector3(lx, h - 0.02, faceZ(lx) + 0.08));
    }
    if (lipPts.length > 2) {
      const lip = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lipPts), lipPts.length * 3, 0.12, 5, false);
      lumpy(lip, 0.05, 3, seed);
      F.add('foliage', lip, 0x587e2a, null, { ao: 0, jitter: 0.1 });
    }
  }
  const heightAt = (lx, lz) => {
    const s = lx / (W / 2);
    const t = Math.max(0, Math.min(1, (faceZ(lx) - lz) / D));
    return hAt(s, t);
  };
  return { F, heightAt, faceZ };
}

/** A round door (planks, frame, brass knob in the centre, optional ring of stones), facing local +z at (lx, ·, lz). */
export function roundDoor(F, lx, lz, R, color, o = {}) {
  const cy = R + (o.lift ?? 0.04);
  const door = cyl(R, R, 0.08, o.seg ?? 28, 1.2);
  door.rotateX(Math.PI / 2);
  F.add('wood', door, color, trs(lx, cy, lz + 0.04), { ao: 0.3, aoMin: 0.75, jitter: 0.02 });
  if (!o.simple) {
    // Plank grooves: thin dark strips across the door face.
    for (let k = -2; k <= 2; k++) {
      const yy = (k / 2.6) * R;
      const half = Math.sqrt(Math.max(0, R * R - yy * yy)) * 0.96;
      const groove = box(0.015, half * 2, 0.01, 1);
      F.add('plain', groove, new THREE.Color(color).multiplyScalar(0.55), trs(lx + yy, cy, lz + 0.085), { ao: 0 });
    }
  }
  const frame = new THREE.TorusGeometry(R + 0.04, o.frameW ?? 0.075, 6, o.seg ?? 28);
  F.add('wood', frame, o.frameColor ?? 0xb09070, trs(lx, cy, lz + 0.06), { ao: 0 });
  const knob = new THREE.SphereGeometry(Math.max(0.03, R * 0.075), 10, 8);
  F.add('plain', knob, 0xe0b848, trs(lx, cy, lz + 0.13), { ao: 0 });
  if (o.stones) {
    const n = Math.round(R * 14);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (i / (n - 1));
      if (a > Math.PI) continue;
      const st = box(0.22, 0.14, 0.12, 2);
      F.add('stone', st, 0xd0c8b8, trs(lx + Math.cos(a) * (R + 0.2), cy + Math.sin(a) * (R + 0.2), lz + 0.05, 0, 0, a + Math.PI / 2), { ao: 0 });
    }
  }
  // Threshold stone.
  const step = box(R * 2.1, 0.12, 0.5, 1);
  F.add('stone', step, 0xb8b0a0, trs(lx, 0.02, lz + 0.25), { ao: 0 });
}

/** A round window with a frame, cross bars and a sill (glass dark, or lit warm at dusk with `lit`). */
export function roundWindow(F, lx, cy, lz, R, o = {}) {
  const glass = new THREE.CircleGeometry(R, 20);
  F.add('glow', glass, o.lit ? 0xf0c070 : 0x34383a, trs(lx, cy, lz + 0.02), { ao: 0 });
  // A faint sky reflection in the upper half.
  const refl = new THREE.CircleGeometry(R * 0.7, 12, 0.3, 1.6);
  F.add('glow', refl, 0x6a7a84, trs(lx - R * 0.1, cy + R * 0.12, lz + 0.025), { ao: 0 });
  const frame = new THREE.TorusGeometry(R + 0.02, 0.06, 6, 20);
  F.add('wood', frame, o.frameColor ?? 0xe8dcc0, trs(lx, cy, lz + 0.05), { ao: 0 });
  for (const rz of o.panes === 4 ? [0, Math.PI / 2] : [0, Math.PI / 3, -Math.PI / 3]) {
    const bar = box(R * 2, 0.03, 0.03, 1);
    F.add('wood', bar, o.frameColor ?? 0xe8dcc0, trs(lx, cy, lz + 0.05, 0, 0, rz), { ao: 0 });
  }
  if (o.box !== false) {
    // Flower box under the window.
    const fb = box(R * 2, 0.18, 0.22, 1.5);
    F.add('wood', fb, o.boxColor ?? 0x6a8a4a, trs(lx, cy - R - 0.12, lz + 0.14), { ao: 0 });
    const cols = o.flowers ?? [0xf0c030, 0x9a60c0, 0xf08030];
    for (let i = 0; i < 9; i++) {
      const fx = lx - R * 0.9 + (i / 8) * R * 1.8;
      const leaf = new THREE.IcosahedronGeometry(0.09, 0);
      F.add('foliage', leaf, 0x4a7a2a, trs(fx, cy - R - 0.0, lz + 0.14 + (rand() - 0.5) * 0.08, 0, 0, 0, [1, 0.8, 1]), { ao: 0 });
      const fl = new THREE.OctahedronGeometry(0.05, 0);
      F.add('plain', fl, cols[i % cols.length], trs(fx + (rand() - 0.5) * 0.06, cy - R + 0.07, lz + 0.18 + (rand() - 0.5) * 0.08), { ao: 0, jitter: 0.2 });
    }
  }
}

/** A chimney: a short stone stack or a clay pipe sticking out of the turf; returns the smoke origin (world). */
export function chimney(F, lx, ly, lz, kind = 'stack') {
  if (kind === 'pipe') {
    const p = cyl(0.13, 0.15, 1.1, 10, 1.5);
    p.translate(0, 0.55, 0);
    F.add('plain', p, 0x8a5a40, trs(lx, ly - 0.25, lz), { ao: 0 });
    const cap = cyl(0.2, 0.17, 0.1, 10, 1.5);
    F.add('plain', cap, 0x6a4a34, trs(lx, ly + 0.85, lz), { ao: 0 });
    return F.toWorld(lx, ly + 0.95, lz);
  }
  const st = box(0.55, 1.4, 0.55, 1.2);
  st.translate(0, 0.7, 0);
  F.add('stone', st, 0xc8bca8, trs(lx, ly - 0.4, lz, 0, 0.3), { ao: 0 });
  const pot = cyl(0.12, 0.14, 0.35, 8, 1.5);
  F.add('plain', pot, 0x9a5a3a, trs(lx, ly + 1.15, lz), { ao: 0 });
  return F.toWorld(lx, ly + 1.35, lz);
}

/* ---- small props ---- */

/** A garden bench (seat, back, legs); `local` is the placement in the frame. */
export function bench(F, local, len = 1.4, color = 0xb08a5a) {
  const seat = box(len, 0.06, 0.38, 1);
  F.add('wood', seat, color, local.clone().multiply(trs(0, 0.42, 0)), { ao: 0.3 });
  const back = box(len, 0.32, 0.05, 1);
  F.add('wood', back, color, local.clone().multiply(trs(0, 0.72, -0.18, -0.12)), { ao: 0 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.06, 0.42, 0.06, 1);
      F.add('wood', leg, 0x9a8470, local.clone().multiply(trs((sx * len) / 2.3, 0.21, sz * 0.15)), { ao: 0.3 });
    }
  }
}

/** A barrel (bulging staves and two dark hoops), standing or lying. */
export function barrel(F, local, h = 0.9, r = 0.32) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(r * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * h - h / 2));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h);
  F.add('darkwood', g, 0xf0d0a8, local, { ao: 0 });
  const lid = new THREE.CircleGeometry(r * 0.86, 14);
  lid.rotateX(-Math.PI / 2);
  F.add('darkwood', lid, 0xd8b890, local.clone().multiply(trs(0, h / 2, 0)), { ao: 0 });
  for (const yy of [-0.32, 0.32]) {
    const hoop = new THREE.TorusGeometry(r * (0.86 + 0.14 * Math.sin((0.5 + yy) * Math.PI)) + 0.008, 0.018, 4, 16);
    hoop.rotateX(Math.PI / 2);
    F.add('plain', hoop, 0x3a3430, local.clone().multiply(trs(0, yy * h, 0)), { ao: 0 });
  }
}

/** A lantern on a post or hanging (dark iron frame, warm glass). Returns the light's world position. */
export function lantern(F, lx, ly, lz, post = true) {
  if (post) {
    const p = box(0.09, ly, 0.09, 1);
    p.translate(0, ly / 2, 0);
    F.add('wood', p, 0x8a7a68, trs(lx, 0, lz), { ao: 0.4 });
  }
  const frame = box(0.2, 0.26, 0.2, 2);
  F.add('plain', frame, 0x2a2622, trs(lx, ly + 0.15, lz), { ao: 0 });
  const glass = box(0.16, 0.2, 0.16, 2);
  for (const [dx, dz] of [[0.021, 0], [-0.021, 0], [0, 0.021], [0, -0.021]]) {
    const pane = glass.clone();
    F.add('glow', pane, 0xffc860, trs(lx + dx, ly + 0.15, lz + dz, 0, 0, 0, [dx ? 0.1 : 1, 1, dz ? 0.1 : 1]), { ao: 0 });
  }
  const roof = cyl(0.01, 0.17, 0.12, 4);
  F.add('plain', roof, 0x2a2622, trs(lx, ly + 0.34, lz, 0, Math.PI / 4), { ao: 0 });
  return F.toWorld(lx, ly + 0.15, lz);
}

/** A ribbed pumpkin (or squash) with a stem. */
export function pumpkin(F, lx, lz, r = 0.3, color = 0xe07a20) {
  const g = new THREE.SphereGeometry(r, 14, 9);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const k = 1 + 0.08 * Math.cos(8 * Math.atan2(z, x));
    p.setXYZ(i, x * k, p.getY(i) * 0.72, z * k);
  }
  g.computeVertexNormals();
  F.add('plain', g, color, trs(lx, r * 0.66, lz, 0, rand() * 6), { ao: r * 0.9, aoMin: 0.6 });
  const stem = cyl(0.025, 0.04, 0.12, 5);
  F.add('plain', stem, 0x5a6a2a, trs(lx, r * 1.38, lz, 0.3, rand() * 6), { ao: 0 });
}

/** A cupped leaf (part of a sphere) for cabbages and lettuces; `frill` ruffles its edge. */
function cupLeaf(r, frill = 0) {
  const g = new THREE.SphereGeometry(r, 4, 2, -0.7, 1.4, 0.15, 1.25);
  if (frill > 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + frill * Math.sin(p.getX(i) * 60 + p.getY(i) * 40);
      p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

/**
 * A cabbage: a firm heart wrapped in layers of cupped leaves, the outer ones darker, spread and curled back.
 * With `frilly` it is a lettuce (a loose rosette of frilled, lighter leaves).
 */
export function cabbage(F, lx, lz, s = 1, color = 0x8ab060, frilly = false) {
  const base = new THREE.Color(color);
  if (!frilly) {
    const head = new THREE.SphereGeometry(0.12 * s, 7, 5);
    lumpy(head, 0.012 * s, 22, lx * 3 + lz);
    F.add('plain', head, base.clone().lerp(new THREE.Color(0xe0f0b0), 0.35), trs(lx, 0.12 * s, lz, 0, 0, 0, [1, 0.88, 1]), { ao: 0.2, aoMin: 0.75 });
  }
  const rings = frilly ? [[5, 0.09, 0.75, 0.05], [7, 0.13, 1.05, 0.09]] : [[3, 0.13, 0.45, 0.04], [5, 0.17, 0.95, 0.08], [6, 0.2, 1.35, 0.13]];
  rings.forEach(([n, rr, tilt, out], ring) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + lx * 5 + ring;
      const leaf = cupLeaf(rr * s, frilly ? 0.08 : 0.02);
      // Outer leaves darker and bluer; lettuce lighter at the heart.
      const c = base.clone().offsetHSL(ring * 0.012, 0, (frilly ? -0.06 : -0.05) * ring + 0.02 + (rand() - 0.5) * 0.04);
      F.add('plain', leaf, c, trs(lx + Math.cos(a) * out * s, 0.04 + (frilly ? 0.02 : 0.06) * (2 - ring) * s, lz + Math.sin(a) * out * s, tilt + rand() * 0.2, -a + Math.PI / 2, 0, [1, 0.9, 1]), { ao: 0.12, aoMin: 0.7, jitter: 0.1 });
    }
  });
}

/** Carrots: feathery tops (flora cards) over the orange shoulder. */
export function carrot(F, lx, lz) {
  const sh = cyl(0.028, 0.02, 0.05, 6);
  F.add('plain', sh, 0xe0701a, trs(lx, 0.015, lz), { ao: 0 });
  const w = F.toWorld(lx, 0, lz);
  plant(F.batch, w.x, w.y, w.z, 'carrot', { scale: 1.3 + rand() * 0.4, cards: 3 });
}

/** A leek: white shank and a fan of folded blue-green blades. */
export function leek(F, lx, lz) {
  const st = cyl(0.026, 0.032, 0.2, 7);
  st.translate(0, 0.1, 0);
  F.add('plain', st, 0xeef0dc, trs(lx, 0, lz), { ao: 0.15, aoMin: 0.7 });
  const fan = rand() * 6;
  for (let i = 0; i < 4; i++) {
    const b = box(0.045, 0.38 + rand() * 0.1, 0.008, 1);
    b.translate(0, 0.19, 0);
    F.add('plain', b, i % 2 ? 0x4a7a5a : 0x3e6e56, trs(lx, 0.17, lz, (i % 2 ? 1 : -1) * (0.25 + i * 0.12), fan, (rand() - 0.5) * 0.2), { ao: 0, jitter: 0.1 });
  }
}

/** The card kind for a flower colour (cottage planting: the colour picks a plausible flower). */
function flowerKind(color, tall, n) {
  const c = new THREE.Color(color);
  const hsl = {};
  c.getHSL(hsl);
  if (tall) return rand() < 0.75 ? 'hollyhock' : 'foxglove';
  if (n <= 2) return rand() < 0.5 ? 'meadow' : 'daisy';
  if (hsl.s < 0.4 && hsl.l > 0.8) return rand() < 0.6 ? 'daisy' : 'cottage';
  if (hsl.h > 0.62 && hsl.h < 0.85) return rand() < 0.65 ? 'lavender' : 'lupin';
  if (hsl.h < 0.03 || hsl.h > 0.94) return rand() < 0.4 ? 'poppy' : rand() < 0.5 ? 'rose' : 'cottage';
  return 'cottage';
}

/**
 * A flower clump: a leafy base and several flowering cards (hollyhocks or foxgloves with `tall`; lavender, lupins,
 * daisies, poppies, roses or mixed cottage flowers chosen by the colour, which tints the blooms). `n` sets how full it
 * is (n ≤ 2: a small weed among the crops); `ly` lifts it (a pot on a bench).
 */
export function flowerClump(F, lx, lz, color, tall = false, n = 7, ly = 0) {
  const w = F.toWorld(lx, ly, lz);
  const kind = flowerKind(color, tall, n);
  const count = tall ? 1 + Math.min(2, Math.floor(n / 3)) : Math.max(1, Math.round(n / 3));
  for (let i = 0; i < count; i++) {
    const a = rand() * 6.28;
    const rr = i === 0 ? 0 : 0.08 + rand() * 0.12;
    plant(F.batch, w.x + Math.cos(a) * rr, w.y, w.z + Math.sin(a) * rr, i > 0 && rand() < 0.3 && !tall ? 'leafy' : kind, { tint: color, scale: n <= 2 ? 0.7 : 1 });
  }
  if (n > 2) plant(F.batch, w.x, w.y, w.z, 'leafy', { scale: tall ? 1.1 : 0.8 });
}

/** A soft contact shadow under a prop (one merged transparent mesh for all of them). */
export function blob(batch, x, z, rx, rz = rx, y = 0.012, yaw = 0) {
  const g = new THREE.PlaneGeometry(rx * 2, rz * 2);
  g.rotateX(-Math.PI / 2);
  batch.add('blob', g, 0xffffff, trs(x, y, z, 0, yaw, 0), { ao: 0, jitter: 0 });
}
