/* ==== surface/sky.js — the sky dome (gradient, sun glow, blended into the fog at the horizon), the painted panorama of
   far hills (a band that follows the camera), soft clouds and the chimney smoke billboards ==== */
import * as THREE from 'three';
import { rng } from './kit.js';
import { SURFACE_TIME } from './mats.js';
import { cloudTexture } from './textures.js';

/** Golden-afternoon palette shared with lighting.js. */
export const SKY_COLORS = {
  zenith: new THREE.Color(0x4f86c8),
  horizon: new THREE.Color(0xcfdde0),
  warm: new THREE.Color(0xffd9a8),
  sun: new THREE.Color(0xfff0d0),
  haze: new THREE.Color(0xc4d2cc),
};

/** Uniforms lighting.js drives per view (sun direction, darkness underground). */
export const SKY_UNIFORMS = {
  uZenith: { value: SKY_COLORS.zenith.clone() },
  uHorizon: { value: SKY_COLORS.horizon.clone() },
  uWarm: { value: SKY_COLORS.warm.clone() },
  uSunColor: { value: SKY_COLORS.sun.clone() },
  uSunDir: { value: new THREE.Vector3(-0.55, 0.42, -0.72).normalize() },
  uDark: { value: 0 },
  // daynight (NOTES-10-daynight): x = the moon's phase 0..1 (0 new, 0.5 full), y = 1 when the disc at uSunDir is the moon.
  uMoon: { value: new THREE.Vector2(0, 0) },
  // night extras (NOTES-28-night): 0..1, the stars' strength (0 by day, so the dome's day picture is unchanged).
  uStars: { value: 0 },
  uTime: SURFACE_TIME,
};

const camPos = new THREE.Vector3();

/** Keeps a camera-centred object around the viewing camera (sky dome, panorama, clouds). */
function followCamera(obj, keepY = false) {
  obj.frustumCulled = false;
  obj.matrixAutoUpdate = false;
  obj.onBeforeRender = (renderer, scene, camera) => {
    camPos.setFromMatrixPosition(camera.matrixWorld);
    obj.position.set(camPos.x, keepY ? obj.position.y : camPos.y, camPos.z);
    obj.updateMatrix();
    obj.matrixWorld.copy(obj.matrix);
    SURFACE_TIME.value = performance.now() / 1000;
  };
}

/** The dome: zenith-to-horizon gradient with a warm band and sun glow; below the horizon it is pure fog colour. */
function buildDome(scene) {
  const g = new THREE.SphereGeometry(140, 32, 16);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // On the far plane: drawn after the opaque objects, only the pixels nothing else covered pass the depth test.
        gl_Position.z = gl_Position.w * 0.999999;
      }`,
    fragmentShader: `
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uWarm; uniform vec3 uSunColor; uniform vec3 uSunDir;
      uniform float uDark; uniform vec2 uMoon; uniform float uStars; uniform float uTime;
      #include <fog_pars_fragment>
      varying vec3 vDir;
      // night extras (NOTES-28-night): a small 3D hash (cells fixed to the sky, so the stars do not crawl as you turn).
      vec3 starHash(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.xxy + p.yxx) * p.zyx);
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float s = max(dot(d, uSunDir), 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.75, h), 0.55));
        // Warm haze low in the sky, strongest towards the sun.
        col = mix(col, uWarm, pow(1.0 - abs(h), 7.0) * (0.25 + 0.45 * pow(s, 3.0)));
        float disc = smoothstep(0.99975, 0.9999, s);
        // daynight: at night the disc is the moon, lit by its phase (waxing: the right side, as seen from the Shire).
        if (uMoon.y > 0.5 && disc > 0.0) {
          vec3 rt = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)) + vec3(0.0001, 0.0, 0.0));
          vec3 up = cross(rt, uSunDir);
          vec2 q = vec2(dot(d, rt), dot(d, up)) / 0.02;
          float xt = cos(6.2831853 * uMoon.x) * sqrt(max(0.0, 1.0 - q.y * q.y));
          float lit = uMoon.x < 0.5 ? step(xt, q.x) : step(q.x, -xt);
          disc *= mix(0.05, 1.0, lit);
        }
        col += uSunColor * (pow(s, 6.0) * 0.25 + pow(s, 200.0) * 0.5 + disc * 2.0);
        // night extras (NOTES-28-night): stars, one in ~180 sky cells, faint to bright, a slow twinkle; they fade towards
        // the horizon and around the moon. Skipped entirely by day (a uniform branch: the day picture is untouched).
        if (uStars > 0.001) {
          vec3 sp = d * 150.0;
          vec3 cell = floor(sp);
          vec3 hs = starHash(cell);
          if (hs.x > 0.9945) {
            vec3 off = 0.25 + 0.5 * starHash(cell + 17.0);
            float r = length(fract(sp) - off);
            float tw = 0.8 + 0.2 * sin(uTime * (1.3 + 2.0 * hs.y) + hs.z * 60.0);
            float st = smoothstep(0.3, 0.0, r) * (0.3 + 0.9 * hs.y * hs.y) * tw;
            st *= smoothstep(0.03, 0.25, h) * (1.0 - pow(s, 60.0) * uMoon.y);
            col += vec3(0.86, 0.9, 1.0) * st * uStars * 1.8;
          }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          // Exactly the fog colour at and below the horizon, so fogged far hills melt into the sky.
          float fw = 1.0 - smoothstep(-0.01, 0.16, h);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, max(fw, uDark));
        #endif
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: true,
  });
  Object.assign(m.uniforms, SKY_UNIFORMS);
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'surface-sky';
  // Last of the opaque objects (before the transparent panorama and clouds, as before): the dome is shaded only where
  // it shows, not under the whole picture (underground it costs nothing).
  mesh.renderOrder = 1000;
  followCamera(mesh);
  scene.add(mesh);
  return mesh;
}

/** The painted panorama: three hazy ranges of hills, with tiny doors, trees and hedgerows on the nearest. */
function panoramaTexture() {
  const W = 4096;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rand = rng(909);
  const haze = SKY_COLORS.haze;
  const mixHex = (hex, k) => {
    const a = new THREE.Color(hex);
    a.lerp(haze, k);
    return `#${a.getHexString(THREE.SRGBColorSpace)}`;
  };
  // A periodic ridge line (sum of sines with integer frequencies, so it wraps around 360°).
  const ridge = (x, base, amps, seed) => {
    let y = base;
    amps.forEach(([f, a], i) => {
      y += Math.sin((x / W) * Math.PI * 2 * f + seed * (i + 1) * 1.7) * a;
    });
    return y;
  };
  const layers = [
    { base: 250, amps: [[3, 40], [7, 18], [13, 8]], color: 0x7a9a7a, k: 0.72, seed: 1 },
    { base: 300, amps: [[4, 34], [9, 16], [17, 6]], color: 0x6a9050, k: 0.55, seed: 2 },
    { base: 350, amps: [[5, 30], [11, 12], [23, 5]], color: 0x5f8a40, k: 0.4, seed: 3, detail: true },
  ];
  for (const L of layers) {
    g.fillStyle = mixHex(L.color, L.k);
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, ridge(x, L.base, L.amps, L.seed));
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    // Soft light on the ridges (the sun side), darker shade at the foot.
    const grd = g.createLinearGradient(0, L.base - 60, 0, H);
    grd.addColorStop(0, 'rgba(255,240,200,0.12)');
    grd.addColorStop(1, 'rgba(40,60,40,0.18)');
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.restore();
    if (L.base >= 300) {
      // Patchwork fields on the far slopes: tinted parallelograms (hay, pasture, grazed grass) edged by dark hedgerow
      // lines, painted only onto this hill layer.
      g.save();
      g.globalCompositeOperation = 'source-atop';
      const tints = [0xb8b060, 0x6a9a40, 0x90b060, 0x587e34, 0xa8a858];
      for (let i = 0; i < 420; i++) {
        const x = rand() * W;
        const y = ridge(x, L.base, L.amps, L.seed) + 6 + rand() * 120;
        const w = 40 + rand() * 90;
        const h = 8 + rand() * 16;
        const sk = (rand() - 0.5) * 30;
        g.globalAlpha = 0.35;
        g.fillStyle = mixHex(tints[Math.floor(rand() * tints.length)], L.k);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y + sk * 0.2);
        g.lineTo(x + w + sk, y + h + sk * 0.2);
        g.lineTo(x + sk, y + h);
        g.closePath();
        g.fill();
        g.globalAlpha = 0.55;
        g.strokeStyle = mixHex(0x2e4e1c, L.k * 0.9);
        g.lineWidth = 1.2;
        g.stroke();
      }
      g.restore();
    }
    if (L.detail) {
      // Tiny trees, hedgerow lines and doors (forced perspective: the farthest doors of the Shire).
      for (let i = 0; i < 260; i++) {
        const x = rand() * W;
        const y = ridge(x, L.base, L.amps, L.seed) + 4 + rand() * 60;
        g.fillStyle = mixHex(0x3a6024, L.k * 0.9);
        g.beginPath();
        g.ellipse(x, y, 3 + rand() * 5, 3 + rand() * 4, 0, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 40; i++) {
        const x = rand() * W;
        const y = ridge(x, L.base, L.amps, L.seed) + 18 + rand() * 50;
        g.fillStyle = mixHex([0xd8b030, 0xb83a2a, 0x2f5a9a, 0x2f7a3e][i % 4], L.k * 0.6);
        g.beginPath();
        g.arc(x, y, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = mixHex(0x355a20, L.k);
      g.lineWidth = 1.5;
      for (let i = 0; i < 30; i++) {
        const x = rand() * W;
        const y = ridge(x, L.base, L.amps, L.seed) + 20 + rand() * 80;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 40 + rand() * 80, y + (rand() - 0.5) * 20);
        g.stroke();
      }
    }
  }
  // Fade the top edge a little (aerial perspective).
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function buildPanorama(scene) {
  const R = 132;
  const g = new THREE.CylinderGeometry(R, R, 34, 64, 1, true);
  // Bottom at about −14 m, top at +20 m (around 8° above the horizon at that distance).
  g.translate(0, 3, 0);
  const m = new THREE.MeshBasicMaterial({ map: panoramaTexture(), transparent: true, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'surface-panorama';
  mesh.renderOrder = -50;
  mesh.position.y = 0;
  followCamera(mesh, true);
  scene.add(mesh);
  return mesh;
}

/** Soft cumulus clouds on the dome, drifting slowly. */
function buildClouds(scene) {
  const rand = rng(313);
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < 16; i++) {
    const az = rand() * Math.PI * 2;
    const el = 0.12 + rand() * 0.45;
    const R = 125;
    const cx = Math.cos(az) * Math.cos(el) * R;
    const cy = Math.sin(el) * R;
    const cz = Math.sin(az) * Math.cos(el) * R;
    const w = 26 + rand() * 34;
    const h = w * 0.5;
    const right = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(w / 2);
    const up = new THREE.Vector3(-Math.cos(az) * Math.sin(el), Math.cos(el), -Math.sin(az) * Math.sin(el)).multiplyScalar(h / 2);
    const base = pos.length / 3;
    for (const [sx, sy, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(cx + right.x * sx + up.x * sy, cy + right.y * sx + up.y * sy, cz + right.z * sx + up.z * sy);
      uv.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, color: 0xffffff });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'surface-clouds';
  mesh.renderOrder = -60;
  followCamera(mesh);
  const follow = mesh.onBeforeRender;
  mesh.onBeforeRender = (r, s, cam, ...rest) => {
    mesh.rotation.y = SURFACE_TIME.value * 0.002;
    follow(r, s, cam, ...rest);
  };
  scene.add(mesh);
  return mesh;
}

/** Builds the sky dome, panorama and clouds. Returns { dome, panorama, clouds }. */
export function buildSky(scene) {
  return { dome: buildDome(scene), panorama: buildPanorama(scene), clouds: buildClouds(scene) };
}

/** Chimney smoke: rising, growing, fading billboards from each chimney (one draw call for all of them). */
export function buildSmoke(scene, origins) {
  const per = 9;
  const corner = [];
  const origin = [];
  const phase = [];
  const idx = [];
  origins.forEach((o, ci) => {
    for (let k = 0; k < per; k++) {
      const base = corner.length / 2;
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        corner.push(x, y);
        origin.push(o.x, o.y, o.z);
        phase.push(k / per + ci * 0.137);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(origin, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: `
      attribute vec2 aCorner; attribute float aPhase;
      uniform float uTime;
      varying vec2 vUv; varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        float t = fract(uTime * 0.07 + aPhase);
        vec3 p = position + vec3(t * 2.2 + sin(t * 5.0 + aPhase * 30.0) * 0.25, t * 5.5, t * 0.9 + cos(t * 4.0 + aPhase * 20.0) * 0.2);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        float size = 0.25 + t * 1.5;
        mvPosition.xy += aCorner * size;
        vUv = aCorner;
        vAlpha = smoothstep(0.0, 0.08, t) * (1.0 - t) * 0.5;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec2 vUv; varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        float r = length(vUv);
        float a = vAlpha * smoothstep(1.0, 0.2, r);
        gl_FragColor = vec4(vec3(0.86, 0.85, 0.83), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  m.uniforms.uTime = SURFACE_TIME;
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'surface-smoke';
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
