/* ==== surface/fireflies.js — night extras (NOTES-28-night): a few fireflies drifting and blinking over Bag End's front
   garden, its hedge and the kitchen garden on summer evenings and nights. One Points object (one draw call, only while
   they are out); the drift and the blinking run on the GPU from the shared surface clock. daynight.js DayLook builds it
   once (after the surface) and sets its strength when the hour moves; at 0 it is hidden, so by day it costs nothing. ==== */
import * as THREE from 'three';
import { rng } from './kit.js';
import { SURFACE_TIME } from './mats.js';

/**
 * Where the fireflies gather: { x, z, rx, rz } world boxes (centre, half sizes), filled by the surface builders
 * (bagend.js: the front hedge and the flower beds; garden.js: the vegetable beds) while the surface is built.
 */
export const FIREFLY_SPOTS = [];

/** How many fireflies in all. */
const COUNT = 56;

/** The fireflies' strength uniform (0 hidden … 1 full); DayLook writes it. */
export const FIREFLY_ON = { value: 0 };

/**
 * Builds the fireflies into `parent` (the surface root) from FIREFLY_SPOTS. Returns the Points object (hidden), or null
 * when no spot was registered.
 */
export function buildFireflies(parent) {
  if (!FIREFLY_SPOTS.length) return null;
  const rand = rng(1937);
  const pos = new Float32Array(COUNT * 3);
  const prm = new Float32Array(COUNT * 4);
  // Spread over the spots by their area (at least one each).
  const area = FIREFLY_SPOTS.map((s) => s.rx * s.rz);
  const total = area.reduce((a, b) => a + b, 0);
  for (let i = 0; i < COUNT; i++) {
    let k = rand() * total;
    let si = 0;
    while (si < FIREFLY_SPOTS.length - 1 && k > area[si]) k -= area[si++];
    if (i < FIREFLY_SPOTS.length) si = i;
    const s = FIREFLY_SPOTS[si];
    pos[i * 3] = s.x + (rand() * 2 - 1) * s.rx;
    pos[i * 3 + 1] = (s.y ?? 0) + 0.4 + rand() * 1.1;
    pos[i * 3 + 2] = s.z + (rand() * 2 - 1) * s.rz;
    // Phase, drift speed, drift radius, blink rate.
    prm[i * 4] = rand() * 100;
    prm[i * 4 + 1] = 0.25 + rand() * 0.3;
    prm[i * 4 + 2] = 0.4 + rand() * 0.8;
    prm[i * 4 + 3] = 0.6 + rand() * 0.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aParams', new THREE.BufferAttribute(prm, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
      attribute vec4 aParams;
      uniform float uTime; uniform float uOn;
      varying float vGlow;
      void main() {
        float t = uTime * aParams.y + aParams.x;
        float r = aParams.z;
        vec3 p = position + vec3(sin(t) * r + sin(t * 2.3) * 0.15, sin(t * 0.7) * 0.3 + sin(t * 3.1) * 0.06, cos(t * 0.8) * r + cos(t * 1.9) * 0.15);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        // Blinking: a slow pulse, dark most of the time, a soft flash now and then.
        float b = sin(uTime * aParams.w + aParams.x * 3.7);
        // Fades out with distance instead of the fog (additive points would add the fog colour as a disc).
        vGlow = uOn * (0.15 + 0.85 * smoothstep(0.35, 0.95, b)) * (1.0 - smoothstep(18.0, 40.0, -mvPosition.z));
        gl_PointSize = clamp(18.0 / max(0.5, -mvPosition.z), 1.5, 7.0);
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `
      varying float vGlow;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float a = smoothstep(1.0, 0.0, dot(q, q)) * vGlow;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.82, 1.0, 0.42) * a * 1.6, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  m.uniforms.uTime = SURFACE_TIME;
  m.uniforms.uOn = FIREFLY_ON;
  const pts = new THREE.Points(g, m);
  pts.name = 'surface-fireflies';
  pts.frustumCulled = false;
  pts.visible = false;
  pts.matrixAutoUpdate = false;
  parent.add(pts);
  return pts;
}
