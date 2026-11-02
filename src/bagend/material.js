/* ==== bagend/material.js — the single shader of Bag End's interior: atlas tiling, per-room point lights, dust ====
 * Lighting is per fragment from a small per-room light list (up to LIGHTS_PER_ROOM lights, chosen by the vertex's
 * room index), so walls need no tessellation and a doorway never leaks the next room's fire. Each room also has an
 * ambient colour, a floor height (corner darkening near the floor) and a dust amount (0 = clean, 1 = the dusty empty
 * house): dust greys the up-facing surfaces and desaturates the room. `kind` per vertex: 0 lit, 1 emissive (window
 * views, glowing coals), 2 flame (emissive, flickers and wobbles), 3 lit but never dusty (cobwebs, dust decals).
 * Attributes: position, normal, uv (repeats in tile units), aCol (linear tint), aTile (atlas rect), aInfo (room, kind). */
import * as THREE from 'three';

export const MAX_ROOMS = 10;
export const LIGHTS_PER_ROOM = 4;

/** Shared uniforms of every interior material (one set for the whole house). */
export const UNI = {
  map: { value: null },
  uTime: { value: 0 },
  uFlick: { value: 1 },
  uLP: { value: Array.from({ length: MAX_ROOMS * LIGHTS_PER_ROOM }, () => new THREE.Vector4(0, -100, 0, 1)) },
  uLC: { value: Array.from({ length: MAX_ROOMS * LIGHTS_PER_ROOM }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uAmb: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector3(0.1, 0.1, 0.1)) },
  uRoomF: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector2(0, 1)) }, // (floor y, dust)
  uExposure: { value: 1 },
};

const vertex = /* glsl */ `
attribute vec3 aCol;
attribute vec4 aTile;
attribute vec2 aInfo;
uniform float uTime;
varying vec3 vPos;
varying vec3 vNor;
varying vec2 vUv;
varying vec3 vCol;
varying vec4 vTile;
varying vec2 vInfo;
void main() {
  vec3 p = position;
  if (aInfo.y > 1.5 && aInfo.y < 2.5) {
    // Flames lick: the higher a vertex in its flame (uv.y), the more it sways.
    float h = clamp(fract(uv.y), 0.0, 1.0);
    p.x += sin(uTime * 7.3 + p.y * 9.0 + p.z * 3.0) * 0.025 * h;
    p.z += cos(uTime * 6.1 + p.y * 8.0 + p.x * 3.0) * 0.025 * h;
    p.y += sin(uTime * 11.0 + p.x * 13.0) * 0.02 * h;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vPos = wp.xyz;
  vNor = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vCol = aCol;
  vTile = aTile;
  vInfo = aInfo;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const fragment = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
uniform float uFlick;
uniform float uExposure;
uniform vec4 uLP[${MAX_ROOMS * LIGHTS_PER_ROOM}];
uniform vec4 uLC[${MAX_ROOMS * LIGHTS_PER_ROOM}];
uniform vec3 uAmb[${MAX_ROOMS}];
uniform vec2 uRoomF[${MAX_ROOMS}];
varying vec3 vPos;
varying vec3 vNor;
varying vec2 vUv;
varying vec3 vCol;
varying vec4 vTile;
varying vec2 vInfo;
void main() {
  vec2 st = vTile.xy + fract(vUv) * vTile.zw;
  vec4 tex = textureGrad(map, st, dFdx(vUv) * vTile.zw, dFdy(vUv) * vTile.zw);
#ifdef GLASS
  if (tex.a < 0.02) discard;
#endif
  vec3 albedo = tex.rgb * vCol;
  int kind = int(vInfo.y + 0.5);
  int room = int(vInfo.x + 0.5);
  vec3 col;
  if (kind == 1) {
    col = albedo;
  } else if (kind == 2) {
    float f = 0.8 + 0.35 * uFlick + 0.15 * sin(uTime * 17.0 + vPos.x * 5.0);
    col = albedo * f * 1.6;
  } else {
    vec3 n = normalize(vNor);
    if (!gl_FrontFacing) n = -n;
    vec2 rf = uRoomF[room];
    vec3 L = uAmb[room];
    for (int i = 0; i < ${LIGHTS_PER_ROOM}; i++) {
      vec4 lp = uLP[room * ${LIGHTS_PER_ROOM} + i];
      vec4 lc = uLC[room * ${LIGHTS_PER_ROOM} + i];
      vec3 d = lp.xyz - vPos;
      float dist = length(d);
      float att = clamp(1.0 - dist / lp.w, 0.0, 1.0);
      att *= att;
      float ndl = max(dot(n, d / max(dist, 1e-3)), 0.0) * 0.8 + 0.2;
      float f = lc.a > 0.5 ? (0.82 + 0.3 * uFlick) : 1.0;
      L += lc.rgb * att * ndl * f;
    }
    // Corners darken near the floor; surfaces facing down get a little less light (no shadows otherwise).
    float h = vPos.y - rf.x;
    L *= mix(0.62, 1.0, smoothstep(0.0, 0.55, h)) * (0.86 + 0.14 * clamp(n.y + 0.6, 0.0, 1.0));
    if (kind != 3) {
      float dust = rf.y;
      float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
      albedo = mix(albedo, vec3(lum) * vec3(1.0, 0.97, 0.92), dust * 0.45);
      float top = smoothstep(0.35, 0.9, n.y);
      albedo = mix(albedo, vec3(0.46, 0.44, 0.41), dust * top * 0.55);
    }
    col = albedo * L;
  }
  gl_FragColor = vec4(col * uExposure, tex.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Creates the interior material (opaque, or the transparent "glass" variant used for display-case glass, cobwebs
 * and dust marks: depth test on, no depth write, alpha from the atlas).
 * @param {boolean} glass
 */
export function interiorMaterial(glass = false) {
  const m = new THREE.ShaderMaterial({
    uniforms: UNI,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: glass,
    depthWrite: !glass,
    side: THREE.DoubleSide,
    defines: glass ? { GLASS: 1 } : {},
  });
  m.name = glass ? 'bagend-glass' : 'bagend-opaque';
  return m;
}
