/* ==== surface/life.js — small life of the Shire, animated on the GPU in one draw call: butterflies over the flower
   beds, bees round the hives, swallows circling high, ducks paddling on the lake ==== */
import * as THREE from 'three';
import { rng } from './kit.js';
import { SURFACE_TIME } from './mats.js';

const KIND = { butterfly: 0, bee: 1, bird: 2, duck: 3 };

/** Local models (x across the wings, z forward). Each returns { pos: [], col: [] } triangles. */
function butterflyModel(c) {
  const w = 0.06;
  return {
    pos: [0, 0, 0.02, -w * 1.6, 0, 0.05, -w * 1.2, 0, -0.04, 0, 0, 0.02, w * 1.6, 0, 0.05, w * 1.2, 0, -0.04, 0, 0, 0.02, -w, 0, -0.05, 0, 0, -0.03, 0, 0, 0.02, 0, 0, -0.03, w, 0, -0.05],
    col: new Array(12).fill(c).flat(),
  };
}
function beeModel() {
  return { pos: [0, 0.01, 0.02, -0.012, 0, -0.015, 0.012, 0, -0.015, 0, 0, 0.02, 0.012, 0, -0.015, -0.012, 0, -0.015], col: new Array(6).fill([0.9, 0.7, 0.1]).flat() };
}
function birdModel() {
  const s = 0.22;
  return {
    pos: [0, 0, 0.1, -s * 1.8, 0, -0.05, 0, 0, -0.12, 0, 0, 0.1, 0, 0, -0.12, s * 1.8, 0, -0.05],
    col: new Array(6).fill([0.12, 0.12, 0.16]).flat(),
  };
}
function duckModel(male) {
  const geos = [];
  const body = new THREE.SphereGeometry(0.16, 8, 5);
  body.scale(0.8, 0.6, 1.3);
  body.translate(0, 0.04, 0);
  geos.push([body, male ? [0.55, 0.5, 0.45] : [0.5, 0.4, 0.28]]);
  const head = new THREE.SphereGeometry(0.075, 7, 5);
  head.translate(0, 0.17, 0.15);
  geos.push([head, male ? [0.12, 0.42, 0.2] : [0.45, 0.35, 0.24]]);
  const bill = new THREE.ConeGeometry(0.025, 0.08, 4);
  bill.rotateX(Math.PI / 2);
  bill.translate(0, 0.16, 0.24);
  geos.push([bill, [0.9, 0.65, 0.1]]);
  const pos = [];
  const col = [];
  for (const [g, c] of geos) {
    const ng = g.toNonIndexed();
    pos.push(...ng.attributes.position.array);
    for (let i = 0; i < ng.attributes.position.count; i++) col.push(...c);
  }
  return { pos, col };
}

/**
 * Builds all small life as one mesh. `spots`: { flowers: [[x, z]], hives: [Vector3], lake: {x, z, y} }.
 */
export function buildLife(scene, spots) {
  const rand = rng(4242);
  const pos = [];
  const col = [];
  const center = [];
  const params = [];
  const add = (m, kind, cx, cy, cz, radius, speed) => {
    const n = m.pos.length / 3;
    const ph = rand() * 100;
    for (let i = 0; i < n; i++) {
      pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
      col.push(m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]);
      center.push(cx, cy, cz);
      params.push(kind, ph, radius, speed);
    }
  };
  const wingCols = [[0.95, 0.95, 0.9], [0.98, 0.85, 0.2], [0.95, 0.55, 0.15], [0.55, 0.65, 0.95], [0.95, 0.95, 0.9]];
  spots.flowers.forEach(([x, z], i) => {
    add(butterflyModel(wingCols[i % wingCols.length]), KIND.butterfly, x, 0.5, z, 0.8 + rand() * 1.6, 0.4 + rand() * 0.3);
  });
  for (const h of spots.hives) for (let k = 0; k < 7; k++) add(beeModel(), KIND.bee, h.x, h.y, h.z, 0.4 + rand() * 1.2, 1.2 + rand() * 1.2);
  for (let k = 0; k < 7; k++) add(birdModel(), KIND.bird, (rand() - 0.5) * 60, 22 + rand() * 12, -20 + (rand() - 0.5) * 60, 12 + rand() * 18, 0.12 + rand() * 0.08);
  for (let k = 0; k < 7; k++) add(duckModel(k % 2 === 0), KIND.duck, spots.lake.x + (rand() - 0.5) * 10, spots.lake.y, spots.lake.z + (rand() - 0.5) * 8, 1.5 + rand() * 3, 0.06 + rand() * 0.05);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 3));
  g.setAttribute('aParams', new THREE.Float32BufferAttribute(params, 4));
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color(0x2a2a26) });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SURFACE_TIME;
    // Thin wings seen from below would turn black with the flipped back-face normal: keep the up normal.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        attribute vec3 aCenter;
        attribute vec4 aParams;
        vec3 lifePath(float kind, float t, float r) {
          if (kind < 0.5) return vec3(cos(t) * r + sin(t * 2.3) * r * 0.35, 0.15 * sin(t * 3.1) + 0.25 * sin(t * 0.7), sin(t) * r * 0.8 + cos(t * 1.7) * 0.3);
          if (kind < 1.5) return vec3(cos(t * 1.3) * r, 0.25 * sin(t * 2.7), sin(t * 1.9) * r);
          if (kind < 2.5) return vec3(cos(t) * r, 2.0 * sin(t * 0.5), sin(t) * r);
          return vec3(cos(t) * r, 0.0, sin(t) * r * 0.7);
        }`)
      .replace('#include <begin_vertex>', `
        float kind = aParams.x;
        float t = uTime * aParams.w + aParams.y;
        vec3 transformed = position;
        // Wing flap: the wing tips (|x|) rise and fall.
        float rate = kind < 0.5 ? 13.0 : kind < 1.5 ? 60.0 : 5.0;
        float amp = kind < 0.5 ? 1.3 : kind < 1.5 ? 0.4 : kind < 2.5 ? 0.6 : 0.0;
        transformed.y += abs(position.x) * sin(uTime * rate + aParams.y * 7.0) * amp;
        if (kind > 2.5) transformed.y += sin(uTime * 1.7 + aParams.y) * 0.01;
        vec3 p0 = lifePath(kind, t, aParams.z);
        vec3 p1 = lifePath(kind, t + 0.02, aParams.z);
        vec3 dir = p1 - p0;
        float yaw = atan(dir.x, dir.z);
        float cy = cos(yaw), sy = sin(yaw);
        transformed = vec3(cy * transformed.x + sy * transformed.z, transformed.y, -sy * transformed.x + cy * transformed.z);
        transformed += aCenter + p0;`);
  };
  m.customProgramCacheKey = () => 'surface-life';
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'surface-life';
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
