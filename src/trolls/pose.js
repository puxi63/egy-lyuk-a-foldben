/* ==== trolls/pose.js — moving the stone trolls without new meshes or draw calls (NOTES-24-trolls).

   The three trolls are one merged mesh (underground/decor.js `l3-trolls`, the shared carved-stone material) and their
   ferns are in the troll cave's merged plant mesh. A troll that wakes is moved as a whole (a group transform: walk,
   turn, lean, sway, shake) by a few lines in those two materials' vertex shaders:
   - every troll vertex carries its troll's index in the `uv` attribute (decor.js addTrolls writes uv = (−1000 − i,
     −1000); the carved stone has no texture map, so its uv was unused, and every other stone geometry keeps uv ≥ −999);
   - a fern vertex belongs to the troll whose rest base is within `w` metres horizontally and more than 1 m below it
     (the plant material holds the troll ferns only);
   - each troll has one pose matrix (rest → now), identity while it stands in its old place; `uTrollOn` is 0 while all
     three stand there, so the shared programs skip the work entirely.
   The soil texture is sampled at the rest position (no swimming of the stone pattern over a walking troll); lighting
   uses the turned normal. The programs are compiled with the materials at start (no new program while playing). ==== */
import * as THREE from 'three';

/** Shared uniforms of both patched materials (trolls/index.js writes them). */
export const TROLL_U = {
  uTrollOn: { value: 0 },
  uTrollRest: { value: [new THREE.Vector4(0, -9999, 0, 0), new THREE.Vector4(0, -9999, 0, 0), new THREE.Vector4(0, -9999, 0, 0)] },
  uTrollPose: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
};

/** The uv value decor.js writes into troll i's vertices (both components; see the header). */
export const trollUv = (i) => -1000 - i;

const COMMON = `
uniform float uTrollOn;
uniform vec4 uTrollRest[3];
uniform mat4 uTrollPose[3];
mat4 trollPoseOf(int i) { return i == 0 ? uTrollPose[0] : (i == 1 ? uTrollPose[1] : uTrollPose[2]); }`;

/** Owner by the uv tag (the carved stone). */
const OWNER_UV = `
int trollOwner() {
  if (uTrollOn < 0.5 || uv.y > -999.0) return -1;
  return int(-uv.x - 999.5);
}`;

/** Owner by position (the ferns). */
const OWNER_POS = `
int trollOwner() {
  if (uTrollOn < 0.5) return -1;
  for (int i = 0; i < 3; i++) {
    vec4 r = uTrollRest[i];
    if (position.y > r.y + 1.0 && distance(position.xz, r.xz) < r.w) return i;
  }
  return -1;
}`;

/**
 * Adds the troll pose to a material's vertex shader, after any existing onBeforeCompile (the soil shader).
 * @param {THREE.Material} material
 * @param {'uv'|'pos'} owner how a vertex finds its troll
 * @param {string} key the program cache key (a distinct program from the unpatched materials of the same kind)
 */
export function patchTrollMaterial(material, owner, key) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, TROLL_U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${COMMON}${owner === 'uv' ? OWNER_UV : OWNER_POS}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        int trollI = trollOwner();
        mat4 trollM = trollI >= 0 ? trollPoseOf(trollI) : mat4(1.0);
        vec3 trollRestN = objectNormal;
        objectNormal = mat3(trollM) * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 trollRestP = transformed;
        transformed = (trollM * vec4(transformed, 1.0)).xyz;`)
      // The soil shader's world position and normal (its triplanar texture) stay at the rest pose.
      .replace('vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;', 'vWPos = (modelMatrix * vec4(trollRestP, 1.0)).xyz;')
      .replace('vWNorm = normalize(mat3(modelMatrix) * objectNormal);', 'vWNorm = normalize(mat3(modelMatrix) * trollRestN);');
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}
