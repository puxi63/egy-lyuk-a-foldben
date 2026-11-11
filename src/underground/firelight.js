/* ==== underground/firelight.js — the warm light of Goblin-town's torches and braziers on the rock, the walkways and
   the props, without adding three.js lights (a real PointLight would add its cost to every lit material in the whole
   game). Per view the nearest FIRE_MAX fires (decor.js picks them for the camera) go into shared uniforms; the soil
   shader (terrain.js) and the decor materials (addFireLight) add `albedo × fireLight(position, normal)` to the
   emissive term. With no fire near the camera `fireN` is 0 and the loop ends at once (layers 1–3 and the surface look
   exactly as before). No occlusion: a fire also lights rock right behind a thin wall (radius FIRE_RADIUS). ==== */
import * as THREE from 'three';

/** Fires per view. */
export const FIRE_MAX = 8;
/** Reach of a fire's light in metres. */
export const FIRE_RADIUS = 9;

/** Shared uniforms (one object, referenced by every material that shows the fire light). */
export const FIRE = {
  firePos: { value: Array.from({ length: FIRE_MAX }, () => new THREE.Vector4()) },
  fireN: { value: 0 },
};

/**
 * NOTES-42-hirelings: an extra fire list (same layout: x, y, z, strength, phase per fire) that every setFires call also
 * picks from, whatever the layer's own list and `on` are: Óin and Glóin's lanterns in the upper layers
 * (hirelings/lanterns.js). null when there is none.
 */
export const FIRE_EXTRA = { list: null };

/** GLSL: the uniforms and fireLight(world position, world normal) → warm radiance to multiply with the albedo. */
export const FIRE_GLSL = `
uniform vec4 firePos[${FIRE_MAX}];
uniform int fireN;
vec3 fireLight(vec3 p, vec3 n) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${FIRE_MAX}; i++) {
    if (i >= fireN) break;
    vec4 f = firePos[i];
    vec3 d = f.xyz - p;
    float dd = dot(d, d);
    if (dd > ${(FIRE_RADIUS * FIRE_RADIUS).toFixed(1)}) continue;
    float att = 1.0 - dd / ${(FIRE_RADIUS * FIRE_RADIUS).toFixed(1)};
    // A smooth window times an inverse-square falloff: bright pools close to the flame, a faint glow farther out.
    att *= att / (1.0 + dd * 0.4);
    float lam = 0.22 + 0.78 * max(dot(n, d * inversesqrt(dd + 1e-3)), 0.0);
    acc += vec3(1.0, 0.52, 0.2) * (att * lam * f.w);
  }
  return acc;
}`;

/**
 * Adds the fire light to a MeshPhongMaterial / MeshLambertMaterial (it must not have its own onBeforeCompile).
 * `strength` scales it (metal reflects a little less of the diffuse fire light, for instance).
 */
export function addFireLight(material, strength = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.firePos = FIRE.firePos;
    shader.uniforms.fireN = FIRE.fireN;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFireW;\nvarying vec3 vFireN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFireW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFireN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFireW;\nvarying vec3 vFireN;\n${FIRE_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * fireLight(vFireW, normalize(vFireN) * (gl_FrontFacing ? 1.0 : -1.0)) * ${strength.toFixed(2)};`);
  };
  const prev = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `fire-${strength}-${prev ? prev() : ''}`;
  return material;
}

/**
 * Per view: writes the fires nearest to `cam` into the uniforms (pass a point a few metres in front of the camera:
 * the fires the player looks at win over the ones behind). `fires` is a flat Float32Array of x, y, z, strength,
 * phase per fire; `t` the clock (the flames flicker); `on` false switches the light off (fireN = 0).
 */
export function setFires(fires, cam, t, on) {
  const extra = FIRE_EXTRA.list; // NOTES-42-hirelings: the lanterns
  const n = on ? fires.length / 5 : 0;
  const ne = extra ? extra.length / 5 : 0;
  if (!n && !ne) {
    FIRE.fireN.value = 0;
    return;
  }
  // Insertion of the FIRE_MAX nearest (a few dozen fires: no sort of the whole list).
  const best = setFires.best || (setFires.best = new Int32Array(FIRE_MAX));
  const bestD = setFires.bestD || (setFires.bestD = new Float32Array(FIRE_MAX));
  let k = 0;
  const lim = (FIRE_RADIUS + 14) * (FIRE_RADIUS + 14);
  // NOTES-42-hirelings: index i < n is the layer's list, n + e the extra list's fire e.
  for (let i = 0; i < n + ne; i++) {
    const src = i < n ? fires : extra;
    const o = (i < n ? i : i - n) * 5;
    const dx = src[o] - cam.x;
    const dy = src[o + 1] - cam.y;
    const dz = src[o + 2] - cam.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > lim) continue;
    if (k < FIRE_MAX) {
      let j = k++;
      while (j > 0 && bestD[j - 1] > d) {
        bestD[j] = bestD[j - 1];
        best[j] = best[j - 1];
        j--;
      }
      bestD[j] = d;
      best[j] = i;
    } else if (d < bestD[FIRE_MAX - 1]) {
      let j = FIRE_MAX - 1;
      while (j > 0 && bestD[j - 1] > d) {
        bestD[j] = bestD[j - 1];
        best[j] = best[j - 1];
        j--;
      }
      bestD[j] = d;
      best[j] = i;
    }
  }
  const arr = FIRE.firePos.value;
  for (let j = 0; j < k; j++) {
    const i = best[j];
    const src = i < n ? fires : extra;
    const o = (i < n ? i : i - n) * 5;
    const ph = src[o + 4];
    // Flicker: two incommensurate waves and a fast shiver.
    const fl = 0.86 + 0.08 * Math.sin(t * 7.3 + ph) + 0.05 * Math.sin(t * 13.1 + ph * 2.7) + 0.03 * Math.sin(t * 29 + ph * 5.1);
    arr[j].set(src[o], src[o + 1], src[o + 2], src[o + 3] * fl);
  }
  FIRE.fireN.value = k;
}
