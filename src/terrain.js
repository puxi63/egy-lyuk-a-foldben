/* ==== terrain.js — chunk meshes, the mesher worker pool and the remesh queue (edits first, then the initial load),
   and the triplanar soil shader of the layers ==== */
import * as THREE from 'three';
import { CELL, CHUNK, CX, CY, CZ, ORIGIN } from './config.js';
import { chunkVersion, extractChunk } from './world.js';
import { makeSoilArray } from './underground/soil-textures.js';
import { ChunkVisibility, OPEN_REGIONS, SOLID_REGIONS } from './visibility.js';
import { FIRE, FIRE_GLSL } from './underground/firelight.js';
import { EDGE } from './edge.js'; // NOTES-44-pickup-edge

/** GLSL float literal. */
const glf = (v) => (Number.isInteger(v) ? `${v}.0` : String(v));
/**
 * NOTES-44-pickup-edge: the world's edge in the soil shader. Every fragment past the last diggable sample plane (the
 * block's side faces and its floor; edge.js EDGE) is drawn as hard blue-grey bedrock with pale carved rune strokes, so
 * the wall where digging stops reads as the end of the world. No new draw call or texture: one max() per fragment, the
 * rock and the strokes only where the edge is.
 */
const EDGE_GLSL = `
        float edgeSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * t); }
        float edgeRune(vec2 f, float h) {
          float d = edgeSeg(f, vec2(0.0, -0.32), vec2(0.0, 0.32));
          float s = h > 0.78 ? 1.0 : -1.0;
          float y0 = 0.08 + fract(h * 7.31) * 0.2;
          d = min(d, edgeSeg(f, vec2(0.0, y0), vec2(0.2 * s, y0 - 0.17)));
          if (fract(h * 3.7) > 0.45) d = min(d, edgeSeg(f, vec2(0.0, y0 - 0.26), vec2(-0.2 * s, y0 - 0.1)));
          else d = min(d, edgeSeg(f, vec2(0.0, y0 - 0.3), vec2(0.2 * s, y0 - 0.47)));
          return 1.0 - smoothstep(0.03, 0.06, d);
        }`;
const EDGE_FRAG = `
        // NOTES-44-pickup-edge: past the last diggable plane = the edge of the world (hard bedrock, carved runes).
        {
          float edgeOut = max(max(vWPos.x - ${glf(EDGE.x1)}, ${glf(EDGE.x0)} - vWPos.x), max(max(vWPos.z - ${glf(EDGE.z1)}, ${glf(EDGE.z0)} - vWPos.z), ${glf(EDGE.y0)} - vWPos.y));
          if (edgeOut > -0.03 && vWPos.y < -0.15) {
            vec3 ebw = pow(abs(vWNorm), vec3(4.0));
            ebw /= (ebw.x + ebw.y + ebw.z + 1e-5);
            float eW = smoothstep(-0.03, 0.04, edgeOut);
            vec4 rk = triSoil(5.0, 0.45, ebw);
            vec3 bed = vec3(0.13, 0.135, 0.155) * (0.7 + 0.6 * rk.a) + rk.rgb * 0.12;
            vec2 fp = abs(vWNorm.y) > 0.7 ? vWPos.xz : (abs(vWNorm.x) > abs(vWNorm.z) ? vWPos.zy : vWPos.xy);
            vec2 cell = floor(fp / 0.7);
            float h = soilHash(vec3(cell, 7.0));
            float rune = h > 0.55 ? edgeRune(fract(fp / 0.7) - 0.5, h) : 0.0;
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(bed, vec3(0.5, 0.46, 0.38), rune * 0.8), eW);
            soilH = mix(soilH, 0.55 + 0.35 * rk.a - rune * 0.5, eW);
            soilWet *= 1.0 - eW;
            soilGlint *= 1.0 - eW;
            soilGold *= 1.0 - eW;
          }
        }`;

const WORKERS = 2;
/**
 * Chunks per draw batch (x, y, z). The chunk meshes of a 2 × 2 × 2 brick share one geometry (rebuilt when a member
 * is remeshed); per view only the runs of visible members are drawn (geometry groups), so the batching saves draw
 * calls without drawing a single extra triangle.
 */
const BRICK = 2;
const BX = CX / BRICK;
const BY = CY / BRICK;
const BZ = CZ / BRICK;
const SLOTS = BRICK * BRICK * BRICK;
const JOBS_PER_WORKER = 2;
/**
 * During the initial load nothing waits for an edit, so each worker may hold more jobs (the round trip per job, not
 * the meshing, bounded the load); the extra slots are dropped as they come back once the load is done.
 */
const LOAD_JOBS_PER_WORKER = 8;
const PADDED = (CHUNK + 2) ** 3;

/** Shared detail texture: a few octaves of grain and pebbles, tiled with triplanar mapping in the shader. */
function makeDetailTexture() {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const rnd = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (x, y, f) => {
    const gx = (x / S) * f;
    const gy = (y / S) * f;
    const xi = Math.floor(gx);
    const yi = Math.floor(gy);
    const tx = gx - xi;
    const ty = gy - yi;
    const w = (a, b) => rnd(((a % f) + f) % f, ((b % f) + f) % f);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = w(xi, yi) + (w(xi + 1, yi) - w(xi, yi)) * sx;
    const b = w(xi, yi + 1) + (w(xi + 1, yi + 1) - w(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = smooth(x, y, 4) * 0.45 + smooth(x, y, 16) * 0.35 + rnd(x, y) * 0.2;
      // Pebbles: darker rounded spots.
      const p = smooth(x, y, 24);
      if (p > 0.78) v *= 0.75;
      const c = Math.max(0, Math.min(255, Math.round(v * 255)));
      const o = (y * S + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = c;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Adds triplanar detail (world-space, no UVs needed) to a Lambert material with vertex colours. */
export function addTriplanarDetail(material, detail, scale = 0.8, strength = 0.6) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bw = abs(vWNorm); bw /= (bw.x + bw.y + bw.z + 1e-4);
        float dt = texture2D(detailMap, vWPos.zy * ${scale.toFixed(3)}).r * bw.x
                 + texture2D(detailMap, vWPos.xz * ${scale.toFixed(3)}).r * bw.y
                 + texture2D(detailMap, vWPos.xy * ${scale.toFixed(3)}).r * bw.z;
        diffuseColor.rgb *= ${(1 - strength / 2).toFixed(3)} + ${strength.toFixed(3)} * dt;`);
  };
  material.customProgramCacheKey = () => `triplanar-${scale}-${strength}`;
}

/**
 * The underground soil shader, injected into a MeshPhongMaterial with vertex colours. Per fragment: triplanar samples
 * of the soil array layers by weight (garden soil / cellar clay / troll stone; a layer below 0.4 % weight is skipped),
 * world-height strata bands, roots and worm tunnels near the top, moss on damp upward faces in the deep layers, wet
 * darkening and gloss (Phong specular strength), a bump from the texture height, and faint glints in the troll stone
 * close to the viewer. The weights come from the `soil` vertex attribute (cellar, troll, moisture, roots) or, with
 * `opts.fixed` (a THREE.Vector4), from a uniform (the stone trolls and other carved stone use this). Deeper than
 * 100 m the fourth weight is the Misty Mountains rock of Goblin-town instead of the roots (materials.js shadeAt), and
 * Goblin-town's torches add their warm light (underground/firelight.js; nothing when no fire is near the camera).
 */
export function addSoilShader(material, soilTex, opts = {}) {
  const fixed = opts.fixed || null;
  const bump = opts.bump ?? 0.008;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.soilTex = { value: soilTex };
    shader.uniforms.soilFixed = { value: fixed || new THREE.Vector4() };
    shader.uniforms.soilBump = { value: bump };
    shader.uniforms.firePos = FIRE.firePos;
    shader.uniforms.fireN = FIRE.fireN;
    const attr = fixed ? 'uniform vec4 soilFixed;' : 'attribute vec4 soil;';
    // The terrain's vertices are 25 cm apart and the fire light changes smoothly over metres, so on the terrain it is
    // evaluated per vertex and interpolated (well under 1 % from the per-pixel value, 8× fewer evaluations). Carved
    // stone (`fixed`) can have large triangles and keeps it per pixel.
    const fireVert = !fixed;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${attr}
varying vec3 vWPos;
varying vec3 vWNorm;
varying vec4 vSoil;
${fireVert ? `varying vec3 vFire;
${FIRE_GLSL}` : ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNorm = normalize(mat3(modelMatrix) * objectNormal);
        vSoil = ${fixed ? 'soilFixed' : 'soil'};
        ${fireVert ? 'vFire = fireLight(vWPos, vWNorm);' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform highp sampler2DArray soilTex;
        uniform float soilBump;
        varying vec3 vWPos;
        varying vec3 vWNorm;
        varying vec4 vSoil;
        float soilH;
        float soilWet;
        float soilGlint;
        float soilGold;
        vec4 triSoil(float layer, float s, vec3 bw) {
          return texture(soilTex, vec3(vWPos.zy * s, layer)) * bw.x
               + texture(soilTex, vec3(vWPos.xz * s, layer)) * bw.y
               + texture(soilTex, vec3(vWPos.xy * s, layer)) * bw.z;
        }
        float soilHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        ${EDGE_GLSL}
        ${fireVert ? 'varying vec3 vFire;' : FIRE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 bw = pow(abs(vWNorm), vec3(4.0));
          bw /= (bw.x + bw.y + bw.z + 1e-5);
          // Mirkwood's roots (layer 6, below 296 m, where every other weight is 0): the first weight is the giant roots'
          // bark, the fourth the Elvenking's carved stone, and the rest is the dark loam instead of the garden soil.
          float deepWood = step(vWPos.y, -296.0);
          // Beneath Lake-town (layer 7, below 386 m; NOTES-5a-laketown): the first weight is the old piles' waterlogged
          // timber, the second layer 6's loam (where the layers meet), the fourth the black mud, the rest the lake silt.
          float deep7 = step(vWPos.y, -386.0);
          // The mines of Erebor (layer 8, below 470 m; NOTES-6a-erebor): the first weight is the carved hall stone, the
          // second the green-veined dwarf stone, the fourth the ore; the rest stays layer 7's silt (where they meet).
          float deep8 = step(vWPos.y, -470.0);
          // Smaug's treasury (layer 9, below 580 m; NOTES-7a-hoard): the first weight is the carved stone (the hall-stone
          // layer), the second the dwarf stone, the fourth Smaug's gold instead of the ore.
          float deep9 = step(vWPos.y, -580.0);
          float wB = vSoil.x * deepWood * (1.0 - deep7);
          float wE = vSoil.w * deepWood * (1.0 - deep7);
          float wC = vSoil.x * (1.0 - deepWood);
          float wTim = vSoil.x * deep7 * (1.0 - deep8);
          float wMud = vSoil.w * deep7 * (1.0 - deep8);
          float wLoam = vSoil.y * deep7 * (1.0 - deep8);
          float wHall = vSoil.x * deep8;
          float wDw = vSoil.y * deep8;
          float wOre = vSoil.w * deep8 * (1.0 - deep9);
          float wGold = vSoil.w * deep9;
          // The second weight: the troll stone, or deeper than 200 m the wet rock of Gollum's lake (layer 5).
          float deepLake = step(vWPos.y, -200.0);
          float wT = vSoil.y * (1.0 - deepLake);
          float wL = vSoil.y * deepLake * (1.0 - deep7);
          // The fourth weight: roots near the top, the Misty Mountains rock deeper than 100 m.
          float deepRock = step(vWPos.y, -100.0);
          float wK = vSoil.w * deepRock * (1.0 - deepWood);
          float rootW = vSoil.w * (1.0 - deepRock);
          float wG = max(0.0, 1.0 - wC - wT - wK - wL - wB - wE - wTim - wMud - wLoam - wHall - wDw - wOre - wGold);
          vec3 alb = vec3(0.0);
          float hgt = 0.0;
          if (wG > 0.004) { vec4 t = triSoil(7.0 * deepWood + 3.0 * deep7, 0.85 - 0.15 * deepWood - 0.15 * deep7, bw); alb += t.rgb * wG; hgt += t.a * wG; }
          if (wLoam > 0.004) { vec4 t = triSoil(7.0, 0.7, bw); alb += t.rgb * wLoam; hgt += t.a * wLoam; }
          if (wTim > 0.004) { vec4 t = triSoil(11.0, 0.6, bw); alb += t.rgb * wTim; hgt += t.a * wTim; }
          if (wMud > 0.004) { vec4 t = triSoil(12.0, 0.5, bw); alb += t.rgb * wMud; hgt += t.a * wMud; }
          if (wDw > 0.004) { vec4 t = triSoil(13.0, 0.5, bw); alb += t.rgb * wDw; hgt += t.a * wDw; }
          if (wHall > 0.004) { vec4 t = triSoil(14.0, 0.4, bw); alb += t.rgb * wHall; hgt += t.a * wHall; }
          if (wOre > 0.004) { vec4 t = triSoil(15.0, 0.7, bw); alb += t.rgb * wOre; hgt += t.a * wOre; }
          if (wGold > 0.004) { vec4 t = triSoil(16.0, 1.1, bw); alb += t.rgb * wGold; hgt += t.a * wGold; }
          if (wB > 0.004) { vec4 t = triSoil(8.0, 0.55, bw); alb += t.rgb * wB; hgt += t.a * wB; }
          if (wE > 0.004) { vec4 t = triSoil(9.0, 0.4, bw); alb += t.rgb * wE; hgt += t.a * wE; }
          if (wC > 0.004) { vec4 t = triSoil(1.0, 0.6, bw); alb += t.rgb * wC; hgt += t.a * wC; }
          if (wT > 0.004) { vec4 t = triSoil(2.0, 0.65, bw); alb += t.rgb * wT; hgt += t.a * wT; }
          if (wK > 0.004) { vec4 t = triSoil(5.0, 0.5, bw); alb += t.rgb * wK; hgt += t.a * wK; }
          if (wL > 0.004) { vec4 t = triSoil(6.0, 0.45, bw); alb += t.rgb * wL; hgt += t.a * wL; }
          alb *= 2.0;
          // Strata: bands by world height, gently warped; strong in the garden soil, faint bedding in the stone.
          float warp = texture(soilTex, vec3(vWPos.xz * 0.045, 4.0)).a;
          vec3 strata = texture(soilTex, vec3(vWPos.x * 0.013 + vWPos.z * 0.011, vWPos.y * 0.21 + warp * 0.9, 4.0)).rgb * 2.0;
          // Faded out on flat faces, where the lookup is constant along one axis and smears into bands.
          alb *= mix(vec3(1.0), strata, ((0.95 - 0.6 * deepWood + 0.1 * deep7) * wG + 0.55 * wC + 0.3 * wT + 0.32 * wK + 0.22 * wL + 0.1 * wE + 0.35 * wLoam + 0.18 * wDw) * (1.0 - bw.y));
          diffuseColor.rgb *= alb;
          // Roots and worm tunnels in the top metres.
          if (rootW > 0.01) {
            vec4 r = triSoil(3.0, 0.75, bw);
            // Patchy: roots and worm runs come and go along the wall.
            float rootPatch = smoothstep(0.3, 0.6, texture(soilTex, vec3(vWPos.xz * 0.11 + vWPos.y * 0.13, 4.0)).a);
            float m = r.a * rootW * rootPatch;
            diffuseColor.rgb = mix(diffuseColor.rgb, r.rgb * 0.55, m);
            hgt = mix(hgt, 0.85, m * 0.6);
          }
          float wet = vSoil.z;
          // Moss: damp, not facing down, mostly on the troll stone (a little on the cellar clay). Its noise is sampled
          // only where moss can grow at all (none in the garden soil or the Misty Mountains rock).
          float mossW = smoothstep(0.3, 0.6, wet) * (wT * 0.9 + wC * 0.2 + wB * 0.55) * smoothstep(-0.3, 0.2, vWNorm.y) * (1.0 - 0.7 * smoothstep(0.75, 0.95, vWNorm.y));
          float moss = 0.0;
          if (mossW > 0.0) {
            float mn = texture(soilTex, vec3(vWPos.xz * 0.21 + vWPos.y * 0.17, 4.0)).a;
            moss = 0.8 * smoothstep(0.62, 0.8, mn + hgt * 0.2) * mossW;
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.2, 0.06) * (0.7 + 0.6 * hgt), moss);
          wet *= 1.0 - moss * 0.5;
          // (The gold is glossy, not wet: it keeps its brightness.)
          diffuseColor.rgb *= 1.0 - 0.32 * wet * (1.0 - 0.85 * wGold);
          soilGold = wGold;
          soilH = hgt;
          soilWet = wet;
          // Glints: rare tiny crystals in the troll stone that catch the light from some angles, close to the eye.
          soilGlint = 0.0;
          float dist = length(cameraPosition - vWPos);
          // (Erebor: the gems in the ore veins glint most, the dwarf stone's crystals a little.)
          float wGl = wT + 0.6 * wK + 1.6 * wOre + 0.25 * wDw + 2.4 * wGold;
          if (wGl > 0.05 && dist < 6.0) {
            vec3 gp = vWPos * 13.0;
            vec3 cell = floor(gp);
            float h = soilHash(cell);
            if (h > 0.965) {
              vec3 f = fract(gp) - 0.5;
              vec3 V = normalize(cameraPosition - vWPos);
              float tw = fract(h * 91.7 + dot(V, vec3(4.1, 6.3, 2.7)));
              soilGlint = smoothstep(0.3, 0.0, length(f)) * smoothstep(0.82, 1.0, tw) * smoothstep(6.0, 1.5, dist) * wGl * (1.0 - moss);
            }
          }
        }${EDGE_FRAG}`)
      .replace('#include <specularmap_fragment>', `float specularStrength = 0.03 + soilWet * (0.25 + 0.75 * soilH);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 sp = -vViewPosition;
          vec3 dpx = dFdx(sp);
          vec3 dpy = dFdy(sp);
          float dhx = dFdx(soilH) * soilBump;
          float dhy = dFdy(soilH) * soilBump;
          vec3 r1 = cross(dpy, normal);
          vec3 r2 = cross(normal, dpx);
          float det = dot(dpx, r1) * faceDirection;
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.93, 0.78) * soilGlint * 1.6;
        // Smaug's gold glows faintly in its own light (the films' treasury).
        totalEmissiveRadiance += diffuseColor.rgb * vec3(0.16, 0.12, 0.05) * soilGold;
        totalEmissiveRadiance += diffuseColor.rgb * ${fireVert ? 'vFire' : 'fireLight(vWPos, normalize(vWNorm) * faceDirection)'};`);
  };
  material.customProgramCacheKey = () => `soil-${fixed ? 'fixed' : 'attr'}-${bump}-vfire-edge`;
}

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.detail = makeDetailTexture();
    /** The underground soil layers (shared with underground/decor.js for the carved stone). */
    this.soilTex = makeSoilArray();
    this.material = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x3a3630, shininess: 38 });
    addSoilShader(this.material, this.soilTex);
    /** Per chunk key with a surface: the mesher's arrays ({ positions, normals, colors, soil, indices }). */
    this.meshes = new Map();
    /** Per brick (2 × 2 × 2 chunks): { mesh, start, count } once a member has a surface; see rebuildBatch. */
    this.batches = new Array(BX * BY * BZ).fill(null);
    this.dirtyBatches = new Set();
    this.batchMaterial = [this.material];
    /** Per-view occlusion culling (visibility.js): the chunks' open regions and the last view's visible set. */
    this.vis = new ChunkVisibility();
    this.planes = new Float32Array(16);
    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
    this.meshedVersion = new Uint32Array(CX * CY * CZ).fill(0xffffffff);
    /** Per chunk: the version at which it was found to have a surface while no worker slot was free (see update). */
    this.waitingVersion = new Uint32Array(CX * CY * CZ).fill(0xffffffff);
    this.inFlight = new Map();
    this.workers = [];
    this.idle = [];
    this.stats = { jobs: 0, meshMs: 0, meshMaxMs: 0, lastMs: 0, triangles: 0, loadMs: 0 };
    this.scratch = new Int8Array(PADDED);
    for (let w = 0; w < WORKERS; w++) {
      const worker = new Worker(new URL('./mesher-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (ev) => this.handleResult(worker, ev.data);
      this.workers.push(worker);
      for (let j = 0; j < LOAD_JOBS_PER_WORKER; j++) this.idle.push(worker);
    }
    this.extraSlots = WORKERS * (LOAD_JOBS_PER_WORKER - JOBS_PER_WORKER);
    this.loadT0 = performance.now();
    this.loaded = false;
  }

  /** Chunks with a newer version than their mesh: those near the given points first (the edits). */
  collectDirty(points) {
    const dirty = [];
    for (let i = 0; i < chunkVersion.length; i++) {
      if (chunkVersion[i] !== this.meshedVersion[i] && !this.inFlight.has(i)) dirty.push(i);
    }
    if (points.length && dirty.length > 1) {
      const dist = (key) => {
        const cx = key % CX;
        const cy = Math.floor(key / CX) % CY;
        const cz = Math.floor(key / (CX * CY));
        let best = Infinity;
        for (const p of points) {
          const dx = (cx + 0.5) * 4 + ORIGIN.x - p.x;
          const dy = (cy + 0.5) * 4 + ORIGIN.y - p.y;
          const dz = (cz + 0.5) * 4 + ORIGIN.z - p.z;
          best = Math.min(best, dx * dx + dy * dy + dz * dz);
        }
        return best;
      };
      // Each key's distance computed once, not per comparison (NOTES-20-startup: the load sorted ~5000 keys a frame).
      const d = new Map();
      for (const key of dirty) d.set(key, dist(key));
      dirty.sort((a, b) => d.get(a) - d.get(b));
    }
    return dirty;
  }

  /**
   * Dispatches remesh jobs (each worker holds at most JOBS_PER_WORKER, so a fresh edit never waits behind a long
   * queue); chunks without a surface are resolved on the spot. `refill` (a worker result during the load): stop at the
   * first chunk with a surface that finds no free slot, instead of examining the whole budget.
   */
  update(points, refill = false) {
    const dirty = this.collectDirty(points);
    let budget = 96; // chunks examined per frame
    for (const key of dirty) {
      // A chunk already seen with a surface at this version, still waiting for a slot: not re-extracted (the load
      // examined the same waiting chunks every frame; NOTES-20-startup).
      if (!this.idle.length && this.waitingVersion[key] === chunkVersion[key]) continue;
      if (--budget < 0) break;
      // After the load: no worker slot free, so stop here instead of re-extracting the waiting chunks every frame
      // (5832 samples each; a swing touches up to eight chunks, two players dig at once).
      if ((this.loaded || refill) && !this.idle.length) break;
      const cx = key % CX;
      const cy = Math.floor(key / CX) % CY;
      const cz = Math.floor(key / (CX * CY));
      const kind = extractChunk(cx, cy, cz, this.scratch);
      const version = chunkVersion[key];
      // No worker slot free: only uniform chunks can still be settled this frame.
      if (kind === 2 && !this.idle.length) {
        this.waitingVersion[key] = version;
        continue;
      }
      if (kind !== 2) {
        this.vis.setRegions(key, kind === 0 ? SOLID_REGIONS : OPEN_REGIONS);
        this.setMesh(key, null);
        this.meshedVersion[key] = version;
        continue;
      }
      const worker = this.idle.pop();
      const data = this.scratch.slice();
      this.inFlight.set(key, version);
      worker.postMessage({ key, version, data, oi: cx * CHUNK - 1, oj: cy * CHUNK - 1, ok: cz * CHUNK - 1 }, [data.buffer]);
    }
    if (!this.loaded && this.inFlight.size === 0 && this.collectDirty([]).length === 0) {
      this.loaded = true;
      this.justLoaded = true;
      this.stats.loadMs = performance.now() - this.loadT0;
      // Back to JOBS_PER_WORKER per worker: drop the idle extra slots now, the rest as they come back (onResult).
      while (this.extraSlots > 0 && this.idle.length) {
        this.idle.pop();
        this.extraSlots--;
      }
    }
  }

  onResult(worker, r) {
    // After the load the extra load-time slots are not handed back (JOBS_PER_WORKER again).
    if (this.loaded && this.extraSlots > 0) this.extraSlots--;
    else this.idle.push(worker);
    this.inFlight.delete(r.key);
    this.stats.jobs++;
    this.stats.meshMs += r.ms;
    this.stats.lastMs = r.ms;
    if (this.loaded) this.stats.meshMaxMs = Math.max(this.stats.meshMaxMs, r.ms);
    this.meshedVersion[r.key] = r.version;
    this.vis.setRegions(r.key, r.regions);
    if (!r.indices.length) {
      this.setMesh(r.key, null);
      return;
    }
    this.setMesh(r.key, { positions: r.positions, normals: r.normals, colors: r.colors, soil: r.soil, indices: r.indices });
  }

  /**
   * Called for every worker result. During the initial load the freed slot is refilled at once (NOTES-20-startup):
   * the load frames are slow, and waiting for the next frame's update() left the workers idle most of the time.
   */
  handleResult(worker, r) {
    this.onResult(worker, r);
    if (!this.loaded) this.update([], true);
  }

  /**
   * Per view: shows only the chunk meshes this camera may see (visibility.js: the solid ground hides what it encloses;
   * nothing beyond `maxDist`, the fog's far plane, is drawn either). Returns the visible-chunk mask, which the
   * buried things (finds) use for the same view.
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} maxDist
   */
  cullFor(camera, maxDist) {
    camera.updateMatrixWorld();
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    for (let i = 0; i < 4; i++) {
      const pl = this.frustum.planes[i];
      this.planes[i * 4] = pl.normal.x;
      this.planes[i * 4 + 1] = pl.normal.y;
      this.planes[i * 4 + 2] = pl.normal.z;
      this.planes[i * 4 + 3] = pl.constant;
    }
    const vis = this.vis;
    vis.compute(camera.position, this.planes, maxDist);
    this.applyVisible(vis.visible);
    return vis.visible;
  }

  /** Shows the batches' runs of chunks marked in `visible` (per chunk key, 1 = draw), hides the rest. */
  applyVisible(visible) {
    this.flush();
    for (let bi = 0; bi < this.batches.length; bi++) {
      const b = this.batches[bi];
      if (!b) continue;
      // Runs of visible members (members without triangles join the runs): one geometry group, one draw call each.
      const groups = b.mesh.geometry.groups;
      let n = 0;
      let open = null;
      for (let s = 0; s < SLOTS; s++) {
        const cnt = b.count[s];
        if (!cnt) continue;
        if (visible[b.keys[s]]) {
          if (open) open.count = b.start[s] + cnt - open.start;
          else {
            open = b.pool[n++];
            open.start = b.start[s];
            open.count = cnt;
          }
        } else open = null;
      }
      groups.length = 0;
      for (let k = 0; k < n; k++) groups.push(b.pool[k]);
      b.mesh.visible = n > 0;
    }
  }

  /** Stores (or with null removes) a chunk's mesh arrays; its brick is rebuilt before the next view is drawn. */
  setMesh(key, data) {
    const old = this.meshes.get(key);
    if (old) this.stats.triangles -= old.indices.length / 3;
    if (data) {
      this.meshes.set(key, data);
      this.stats.triangles += data.indices.length / 3;
    } else if (old) this.meshes.delete(key);
    else return;
    const cx = key % CX;
    const cy = Math.floor(key / CX) % CY;
    const cz = Math.floor(key / (CX * CY));
    this.dirtyBatches.add(((cx / BRICK) | 0) + BX * (((cy / BRICK) | 0) + BY * ((cz / BRICK) | 0)));
  }

  /** Rebuilds the bricks whose members changed (at most once per brick and frame). */
  flush() {
    if (!this.dirtyBatches.size) return;
    for (const bi of this.dirtyBatches) this.rebuildBatch(bi);
    this.dirtyBatches.clear();
  }

  /**
   * Concatenates a brick's member meshes into one geometry, members in slot order (x fastest, then y, then z), and
   * remembers each member's index range for the per-view groups.
   */
  rebuildBatch(bi) {
    const bx = bi % BX;
    const by = Math.floor(bi / BX) % BY;
    const bz = Math.floor(bi / (BX * BY));
    let b = this.batches[bi];
    const keys = b ? b.keys : new Int32Array(SLOTS);
    const parts = [];
    let nv = 0;
    let ni = 0;
    for (let s = 0; s < SLOTS; s++) {
      const cx = bx * BRICK + (s % BRICK);
      const cy = by * BRICK + (Math.floor(s / BRICK) % BRICK);
      const cz = bz * BRICK + Math.floor(s / (BRICK * BRICK));
      keys[s] = cx + CX * (cy + CY * cz);
      const m = this.meshes.get(keys[s]);
      parts.push(m || null);
      if (m) {
        nv += m.positions.length / 3;
        ni += m.indices.length;
      }
    }
    if (!ni) {
      if (b) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        this.batches[bi] = null;
      }
      return;
    }
    this.stats.rebuiltVerts = (this.stats.rebuiltVerts || 0) + nv;
    const pos = new Float32Array(nv * 3);
    const nrm = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const soil = new Uint8Array(nv * 4);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const start = new Int32Array(SLOTS);
    const count = new Int32Array(SLOTS);
    let v = 0;
    let i = 0;
    parts.forEach((m, s) => {
      start[s] = i;
      if (!m) return;
      pos.set(m.positions, v * 3);
      nrm.set(m.normals, v * 3);
      col.set(m.colors, v * 3);
      soil.set(m.soil, v * 4);
      const src = m.indices;
      for (let k = 0; k < src.length; k++) idx[i + k] = src[k] + v;
      count[s] = src.length;
      v += m.positions.length / 3;
      i += src.length;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('soil', new THREE.BufferAttribute(soil, 4, true));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    // The brick's box (plus the quarter-metre the surface may reach into the neighbours) bounds every member.
    const S = CHUNK * CELL * BRICK;
    g.boundingBox = new THREE.Box3(
      new THREE.Vector3(ORIGIN.x + bx * S - CELL, ORIGIN.y + by * S - CELL, ORIGIN.z + bz * S - CELL),
      new THREE.Vector3(ORIGIN.x + (bx + 1) * S + CELL, ORIGIN.y + (by + 1) * S + CELL, ORIGIN.z + (bz + 1) * S + CELL),
    );
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    if (b) {
      b.mesh.geometry.dispose();
      b.mesh.geometry = g;
    } else {
      const mesh = new THREE.Mesh(g, this.batchMaterial);
      mesh.matrixAutoUpdate = false;
      mesh.name = 'terrain-batch';
      this.scene.add(mesh);
      b = { mesh, keys, pool: Array.from({ length: SLOTS }, () => ({ start: 0, count: 0, materialIndex: 0 })) };
      this.batches[bi] = b;
    }
    b.start = start;
    b.count = count;
  }

  /** True for the terrain's batch meshes (QA: the draw-call breakdown). */
  isBatch(o) {
    return o.name === 'terrain-batch';
  }
}
