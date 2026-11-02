/* ==== surface/mats.js — the shared surface materials (one per batch key; every merged batch is one draw call) ==== */
import * as THREE from 'three';
import { barkTexture, floraAtlas, leafCardTexture } from './plant-textures.js';
import {
  blobTexture, bladeTexture, fileTexture, flagTexture, grassTexture, gravelTexture, leafTexture, plasterTexture, shingleTexture,
  signAtlas, soilTexture, thatchTexture, woodTexture,
} from './textures.js';

/** Shared time uniform for the animated surface parts (smoke, small life, the mill wheel); lighting.js advances it. */
export const SURFACE_TIME = { value: 0 };

/**
 * night extras (NOTES-28-night): 0 by day … 1 at night; daynight.js DayLook sets it when the hour moves. The lantern
 * glass and lit windows burn brighter and warmer, the dark window glass (round windows, the neighbours' windows) lights
 * up warm, its sky reflection takes the lamplight. At 0 the material draws exactly as before.
 */
export const GLOW_NIGHT = { value: 0 };

/**
 * The glass of lanterns and windows (unlit, vertex colours). The parts are told apart by their batch colour (linear):
 * warm lit glass (r ≥ 0.3, b < r / 2), dark window glass (max < 0.08 and not bluish: the potting shed's grey-blue pane,
 * b ≈ 1.37 r, stays dark), and the bluish sky reflection over the round windows (b > 1.3 r, 0.08 ≤ max ≤ 0.4).
 */
function glowMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowNight = GLOW_NIGHT;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlowNight;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float mx = max(c.r, max(c.g, c.b));
          float warm = step(0.3, c.r) * step(c.b * 2.0, c.r);
          float dark = (1.0 - step(0.08, mx)) * step(c.b, c.r * 1.3);
          float refl = step(c.r * 1.3, c.b) * step(0.08, mx) * step(mx, 0.4);
          // Lamplight behind the glass at night: an amber deeper than the day's lit-window colour (0xf0c070).
          // (Red pushed more than green and blue, so the tone mapping keeps it amber instead of washing it pale.)
          vec3 lamp = vec3(1.0, 0.43, 0.08);
          c = mix(c, c * vec3(1.4, 0.95, 0.5), warm * uGlowNight);
          c = mix(c, lamp, dark * uGlowNight);
          c = mix(c, lamp * 0.85, refl * uGlowNight);
          diffuseColor.rgb = c;
        }`);
  };
  m.customProgramCacheKey = () => 'surface-glow-night';
  return m;
}

/**
 * The lawn and hill turf: vertex colours × a grass texture in world space (two rotated scales against tiling and a
 * broad brightness variation), toned down right at the pit seam. `detail` (the terrain's detail texture) is no longer
 * sampled; the parameter is kept for the callers.
 */
function turfMaterial(detail, grass, lo, hi) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.grassMap = { value: grass };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D grassMap;\nvarying vec3 vWPos;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 hd2 = max(vec2(${lo.toFixed(3)}) - vWPos.xz, vWPos.xz - vec2(${hi.toFixed(3)}));
        float hd = length(max(hd2, 0.0));
        // At the seam the blades fade towards a flat tone, so the lawn meets the dug block's own surface softly.
        // (The old blend into the terrain's detail texture streaked at grazing angles; the block no longer uses it.)
        float wSeam = (1.0 - smoothstep(0.0, 0.8, hd)) * 0.5;
        // Two rotated scales of the blade texture (no visible tiling) and a broad brightness variation.
        vec3 g1 = texture2D(grassMap, vWPos.xz * 0.42).rgb;
        vec3 g1b = texture2D(grassMap, mat2(0.8, -0.6, 0.6, 0.8) * vWPos.xz * 0.27 + 0.5).rgb;
        vec3 g2 = texture2D(grassMap, vWPos.xz * 0.043 + 0.37).rgb;
        vec3 lawn = mix(g1, g1b, 0.45) * (0.55 + 0.75 * g2.g) * 1.35;
        diffuseColor.rgb *= mix(lawn, vec3(1.12), wSeam);`);
  };
  m.customProgramCacheKey = () => `surface-turf-${lo}-${hi}`;
  return m;
}

/** GLSL: the wind (a slow gust wave rolling across the Shire plus a quick flutter) as a world-space offset. */
const WIND = `
  uniform float uTime;
  vec3 shireWind(vec3 wp, float amp, float flutter) {
    float gust = 0.6 + 0.4 * sin(uTime * 0.37 + wp.x * 0.021 + wp.z * 0.017);
    float ph = uTime * 1.3 + wp.x * 0.11 + wp.z * 0.07;
    vec3 w = vec3(sin(ph), 0.0, cos(ph * 0.83)) * amp * gust;
    w += vec3(sin(uTime * 5.7 + wp.x * 3.1 + wp.y * 2.3), sin(uTime * 6.3 + wp.z * 2.9) * 0.5, cos(uTime * 5.1 + wp.z * 3.3)) * flutter * gust;
    return w;
  }`;

/**
 * Double-sided cards (grass tufts, flora, leaf clusters): keep the geometry's normal on back faces too (three flips it,
 * which turned half the blades black), and sway in the wind. `sway` is GLSL giving the vertex's sway weight
 * (from the uv: 0 at the root); `amp` / `flutter` are metres.
 */
function swayCards(m, key, sway, amp, flutter, extra = null) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SURFACE_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${WIND}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
          float sw = ${sway};
          transformed += shireWind(wp0, ${amp.toFixed(3)}, ${flutter.toFixed(3)}) * sw;
        }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
    if (extra) extra(shader);
  };
  m.customProgramCacheKey = () => `surface-cards-${key}`;
  return m;
}

/**
 * The flora atlas material: alpha-cut plant cards; white bloom texels take the vertex colour (one card, many flower
 * colours), green texels keep their painted colour.
 */
function floraMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: floraAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
  // The local v inside the atlas cell (the cards' root is at the cell's bottom edge).
  return swayCards(m, 'flora', 'pow(fract(uv.y * 4.0), 2.0)', 0.05, 0.012, (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      float bloomMask = smoothstep(0.5, 0.75, min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)));
      diffuseColor.rgb *= mix(vec3(max(max(vColor.r, vColor.g), vColor.b)), vColor.rgb, bloomMask);`);
  });
}

/** Leaf-cluster cards of the trees: alpha-to-coverage edges (MSAA), canopy normals, a gentle sway and flutter. */
function leavesMaterial() {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true, map: leafCardTexture(), alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
    emissive: new THREE.Color(0x1c2a08),
  });
  return swayCards(m, 'leaves', '1.0', 0.07, 0.02);
}

/** Builds every surface material. `detail` is the terrain's triplanar detail texture; lo / hi the pit seam. */
export function surfaceMats(detail, lo, hi) {
  const lam = (o) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
  const darkWood = fileTexture('dark_wood_diff_1k.jpg');
  const darkWoodN = fileTexture('dark_wood_nor_gl_1k.jpg', false);
  const brick = fileTexture('castle_brick_07_diff_1k.jpg');
  const brickN = fileTexture('castle_brick_07_nor_gl_1k.jpg', false);
  return {
    turf: turfMaterial(detail, grassTexture(), lo, hi),
    wood: lam({ map: woodTexture() }),
    darkwood: lam({ map: darkWood, normalMap: darkWoodN, normalScale: new THREE.Vector2(0.6, 0.6) }),
    plaster: lam({ map: plasterTexture() }),
    stone: lam({ map: brick, normalMap: brickN, normalScale: new THREE.Vector2(0.8, 0.8) }),
    flag: lam({ map: flagTexture() }),
    roof: lam({ map: shingleTexture() }),
    thatch: lam({ map: thatchTexture() }),
    // A faint warm-green emissive stands in for light shining through the leaves (the sun is often behind them).
    foliage: lam({ map: leafTexture(), emissive: new THREE.Color(0x24320c) }),
    plain: lam({}),
    glow: glowMaterial(), // night extras (NOTES-28-night): lit at night
    sign: lam({ map: signAtlas(), side: THREE.DoubleSide }),
    tuft: swayCards(lam({ map: bladeTexture(), alphaTest: 0.5, side: THREE.DoubleSide }), 'tuft', 'uv.y * uv.y', 0.035, 0.008),
    flora: floraMaterial(),
    leaves: leavesMaterial(),
    bark: lam({ map: barkTexture() }),
    soil: lam({ map: soilTexture() }),
    lane: lam({ map: gravelTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    blob: new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    water: new THREE.MeshPhongMaterial({ color: 0x2c4a58, specular: 0x4a4438, shininess: 30, transparent: true, opacity: 0.9, vertexColors: true }),
    cloth: lam({ side: THREE.DoubleSide }),
  };
}
