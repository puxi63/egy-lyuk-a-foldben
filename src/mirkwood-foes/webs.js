/* ==== mirkwood-foes/webs.js — the spiders' silk (book ch. 8: the webs across the path, the dwarves bound in cocoons and
   hung from the boughs): sticky web sheets (all in one transparent mesh with a procedural orb-web pattern: spokes and a
   spiral, ragged and sagging; cut sheets tear and fade), the draglines spiders hang from (one LineSegments), and the
   silk cocoons a caught player hangs in (one mesh per player, wrapped in strands). Cheap: three draw calls at most
   for all sheets and threads, plus one per hanging cocoon. ==== */
import * as THREE from 'three';
import { characterMaterial } from '../characters.js';

export const WEB = {
  slow: 0.35, // walking speed factor inside a sheet
  thick: 0.45, // half thickness of a sheet's sticky zone (m)
  pickHits: 3, // swings of the pick to cut a sheet (Sting: one)
  regrow: 240, // seconds until a cut sheet is spun again
};

const tmp = new THREE.Vector3();
const tU = new THREE.Vector3();
const tV = new THREE.Vector3();

/** The orb-web pattern (fragment): spokes, a spiral of capture threads, sagging and broken here and there. */
function webMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xd8d4cc, emissive: 0x141412, side: THREE.DoubleSide, transparent: true, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aWeb;\nattribute vec2 aSize;\nvarying vec4 vWeb;\nvarying vec2 vSize;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWeb = aWeb;\nvSize = aSize;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec4 vWeb;',
        'varying vec2 vSize;',
        'float webHash(float n) { return fract(sin(n) * 43758.5453); }',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '{',
        '  vec2 q = vWeb.xy * vSize * 0.5;', // metres from the centre
        '  float seed = vWeb.z;',
        '  float alive = vWeb.w;',
        '  float r = length(q);',
        '  float R = 0.5 * min(vSize.x, vSize.y);',
        '  float a = atan(q.y, q.x);',
        '  float spokes = 14.0 + floor(webHash(seed) * 8.0);',
        '  float sa = a * spokes / 6.2831853 + webHash(seed + 1.0) * 3.0;',
        '  float spoke = abs(fract(sa) - 0.5) * 6.2831853 / spokes * r;', // distance to the nearest spoke in metres
        // The spiral: rings about 9 cm apart, sagging between the spokes.
        '  float sag = 0.025 * sin(fract(sa) * 3.14159);',
        '  float ring = abs(fract((r + sag) / 0.09 + a / 6.2831853) - 0.5) * 0.09;',
        '  float w = max(fwidth(r), 0.004);',
        '  float thread = max(smoothstep(w * 1.6, 0.0, spoke), smoothstep(w * 1.6, 0.0, ring) * step(0.12, r));',
        // Broken threads and a ragged edge; the hub is a dense pad.
        '  float brk = step(0.18, fract(sin(floor(sa) * 12.9898 + floor((r + sag) / 0.09) * 78.233 + seed) * 43758.5));',
        '  thread *= mix(1.0, brk, step(0.5, ring / w));',
        '  thread = max(thread, smoothstep(0.12, 0.05, r) * 0.6);',
        '  float edge = smoothstep(R * 1.02, R * 0.86, r + 0.05 * sin(a * 7.0 + seed));',
        // Cutting tears the web from the cut outwards and fades it.
        '  float tear = smoothstep(alive * 1.3 - 0.3, alive * 1.3, webHash(floor(sa) + seed * 3.1) * 0.5 + r / R * 0.5);',
        '  float alpha = thread * edge * (1.0 - tear) * alive;',
        '  if (alpha < 0.02) discard;',
        // Thin threads further away fade to a faint silver haze instead of shimmering.
        '  diffuseColor.a *= clamp(alpha, 0.0, 1.0) * mix(0.9, 0.55, clamp(w * 40.0, 0.0, 1.0));',
        '}',
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'lyuk-web-v1';
  return m;
}

/** A silk cocoon (about 1.5 m, wrapped round a body), one geometry for all; painted for the character material. */
function cocoonGeometry() {
  const seg = 20;
  const rings = 26;
  const pos = [];
  const nrm = [];
  const col = [];
  const pbr = [];
  const idx = [];
  const H = 1.45;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    // Profile: a narrow top (the thread), a wide middle, a rounded bottom; lumpy.
    const prof = Math.sin(Math.PI * Math.pow(t, 0.85)) * (0.3 + 0.06 * Math.sin(t * 9.0));
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const lump = 1 + 0.07 * Math.sin(a * 3 + t * 11) + 0.05 * Math.sin(a * 5 - t * 17);
      const r = Math.max(0.02, prof * lump);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.85;
      const y = -t * H;
      pos.push(x, y, z);
      const n = new THREE.Vector3(Math.cos(a), (0.5 - t) * 0.6, Math.sin(a)).normalize();
      nrm.push(n.x, n.y, n.z);
      // Wrapped strands: diagonal bands of brighter silk over a duller base.
      const band = 0.5 + 0.5 * Math.sin((a * 2 + t * 38) * 1.0);
      const band2 = 0.5 + 0.5 * Math.sin(a * -3 + t * 29);
      const v = 0.62 + 0.22 * Math.pow(band, 6) + 0.12 * Math.pow(band2, 8);
      const c = Math.round(255 * Math.min(1, v));
      col.push(c, c - 6, c - 16, Math.round(255 * (0.55 + 0.4 * Math.max(0, n.y * 0.5 + 0.5))));
      pbr.push(150, 0, 120, 255);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + 1;
      const c = a + seg + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(new Uint8Array(col.map((v) => Math.max(0, v))), 4, true));
  g.setAttribute('aPbr', new THREE.BufferAttribute(new Uint8Array(pbr), 4, true));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class Webs {
  constructor(game) {
    this.game = game;
    this.sheets = []; // { c, n, u, v, w, h, alive, hits, cutT, regrowT }
    this.mesh = null;
    this.version = -1;
    this.material = webMaterial();
    // Draglines: up to 16 segments (from a ceiling point to a hanging spider or cocoon).
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    lg.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xc8c4bc, transparent: true, opacity: 0.7 }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    game.scene.add(this.lines);
    this.lineN = 0;
    this.cocoonGeo = cocoonGeometry();
    this.cocoons = new Map(); // player → mesh
  }

  /**
   * Rebuilds the sheets from the sites (on a new provider or test site). Layer 6 draws its own webs
   * (underground/mirkwood-fx.js, `sites.src.fx`): then no mesh is built here, and a cut sheet is hidden in that mesh
   * (fx.setWeb(i, on) if it has one, else its index range: 4 × 4 quads = 96 indices per sheet, in WEB_SHEETS order).
   */
  build(sites) {
    if (this.version === sites.version) return;
    this.version = sites.version;
    if (this.mesh) {
      this.game.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.sheets = sites.webSheets.map((s, i) => {
      const n = new THREE.Vector3(s.nx, s.ny, s.nz).normalize();
      // In-plane axes: u horizontal where possible, v up the sheet.
      const u = new THREE.Vector3(0, 1, 0).cross(n);
      if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
      u.normalize();
      const v = new THREE.Vector3().crossVectors(n, u).normalize();
      return { i, c: new THREE.Vector3(s.x, s.y, s.z), n, u, v, w: s.w, h: s.h, alive: 1, hits: 0, cutT: 0, regrowT: 0 };
    });
    this.fx = sites.src.fx || null;
    if (!this.sheets.length || this.fx?.webs) return;
    const pos = [];
    const web = [];
    const size = [];
    const nrm = [];
    const idx = [];
    for (const s of this.sheets) {
      const base = pos.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        tmp.copy(s.c).addScaledVector(s.u, (a * s.w) / 2).addScaledVector(s.v, (b * s.h) / 2);
        pos.push(tmp.x, tmp.y, tmp.z);
        nrm.push(s.n.x, s.n.y, s.n.z);
        web.push(a, b, (s.i * 7.31) % 100, 1);
        size.push(s.w, s.h);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aWeb', new THREE.Float32BufferAttribute(web, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'mirkwood-webs';
    this.mesh.renderOrder = 2;
    this.game.scene.add(this.mesh);
  }

  /** The sheet a point is inside (its sticky zone), or null. */
  sheetAt(p) {
    for (const s of this.sheets) {
      if (s.alive < 0.5) continue;
      tmp.subVectors(p, s.c);
      if (Math.abs(tmp.dot(s.n)) > WEB.thick) continue;
      if (Math.abs(tmp.dot(s.u)) > s.w / 2 || Math.abs(tmp.dot(s.v)) > s.h / 2) continue;
      return s;
    }
    return null;
  }

  /** The first intact sheet a ray (o, unit d) crosses within `reach`, with its distance: { s, t } or null. */
  sheetOnRay(o, d, reach) {
    let best = null;
    for (const s of this.sheets) {
      if (s.alive < 0.5) continue;
      const den = d.dot(s.n);
      if (Math.abs(den) < 1e-4) continue;
      const t = tmp.subVectors(s.c, o).dot(s.n) / den;
      if (t < 0 || t > reach || (best && t > best.t)) continue;
      tmp.copy(o).addScaledVector(d, t).sub(s.c);
      if (Math.abs(tmp.dot(s.u)) > s.w / 2 || Math.abs(tmp.dot(s.v)) > s.h / 2) continue;
      best = { s, t };
    }
    return best;
  }

  /** A blow on a sheet: the pick needs a few, Sting cuts it at once. Returns true when it was cut. */
  hit(s, sting) {
    s.hits += sting ? WEB.pickHits : 1;
    if (s.hits < WEB.pickHits) return false;
    s.cutT = 0.6;
    s.hits = 0;
    s.regrowT = WEB.regrow;
    this.game.journal?.mark?.('halo'); // NOTES-16-smaug-talk: a web cut (Smaug's talk: "web-cutter")
    return true;
  }

  /** Per frame: cut sheets tear away; cut sheets regrow out of sight after a while; the alive attribute follows. */
  update(dt, seenFn) {
    if (!this.mesh && !this.fx?.webs) return;
    const attr = this.mesh?.geometry.attributes.aWeb;
    let dirty = false;
    for (const s of this.sheets) {
      let want = s.alive;
      if (s.cutT > 0) {
        s.cutT = Math.max(0, s.cutT - dt);
        want = s.cutT / 0.6 * 0.49; // below 0.5: no longer sticky at once
      } else if (s.regrowT > 0) {
        s.regrowT -= dt;
        want = 0;
        if (s.regrowT <= 0 && !seenFn(s.c)) want = 1;
        else if (s.regrowT <= 0) s.regrowT = 5;
      }
      if (want !== s.alive) {
        const was = s.alive >= 0.5;
        s.alive = want;
        if (attr) {
          for (let k = 0; k < 4; k++) attr.array[(s.i * 4 + k) * 4 + 3] = want;
          dirty = true;
        } else if (was !== want >= 0.5) this.showFxSheet(s.i, want >= 0.5);
      }
    }
    if (dirty) attr.needsUpdate = true;
  }

  /** Shows or hides sheet i in layer 6's web mesh (see build()). */
  showFxSheet(i, on) {
    const fx = this.fx;
    if (fx.setWeb) {
      fx.setWeb(i, on);
      return;
    }
    const idx = fx.webs.geometry.index;
    if (!idx || (i + 1) * 96 > idx.count) return;
    if (!this.fxIndex) this.fxIndex = idx.array.slice();
    for (let k = i * 96; k < (i + 1) * 96; k++) idx.array[k] = on ? this.fxIndex[k] : this.fxIndex[i * 96];
    idx.needsUpdate = true;
  }

  /* ---------------- draglines ---------------- */

  beginLines() {
    this.lineN = 0;
  }

  line(a, b) {
    if (this.lineN >= 16) return;
    const arr = this.lines.geometry.attributes.position.array;
    const o = this.lineN * 6;
    arr[o] = a.x;
    arr[o + 1] = a.y;
    arr[o + 2] = a.z;
    arr[o + 3] = b.x;
    arr[o + 4] = b.y;
    arr[o + 5] = b.z;
    this.lineN++;
  }

  endLines() {
    const g = this.lines.geometry;
    g.setDrawRange(0, this.lineN * 2);
    this.lines.visible = this.lineN > 0;
    if (this.lineN) g.attributes.position.needsUpdate = true;
  }

  /* ---------------- cocoons ---------------- */

  /** Shows (or moves) a player's cocoon hanging from `top` (the thread's ceiling point is drawn by the caller). */
  cocoon(p, top, sway) {
    let m = this.cocoons.get(p);
    if (!m) {
      m = new THREE.Mesh(this.cocoonGeo, characterMaterial());
      m.name = 'cocoon';
      this.cocoons.set(p, m);
      this.game.scene.add(m);
    }
    m.visible = true;
    m.position.copy(top);
    m.rotation.set(sway * 0.12, sway * 0.6, sway * 0.08);
    return m;
  }

  hideCocoon(p) {
    const m = this.cocoons.get(p);
    if (m) m.visible = false;
  }

  /** A mesh for the shader warm-up (game.warmPrograms at start). */
  warmMeshes() {
    const m = new THREE.Mesh(this.cocoonGeo, characterMaterial());
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('aWeb', new THREE.Float32BufferAttribute(new Array(16).fill(1), 4));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(new Array(8).fill(1), 2));
    return [m, new THREE.Mesh(g, this.material)];
  }
}

export { tU, tV };
