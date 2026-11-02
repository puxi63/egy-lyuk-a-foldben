/* ==== underground/laketown-water.js — the standing and flowing water beneath Lake-town (layer 7):
   - the POOLS (the pile cavern's three, the wharf's under the old landing stage, the old town's market pool): one
     merged flat mesh with Gollum's lake's water look (lake-water.js waterVert / waterFrag: dark, still, a faint swell,
     the lamps' glints), opaque and drawn before the terrain (renderOrder −1) like the lake;
   - the CHANNEL (one turn round the block, sloping down) and the STREAM across the pile cavern: ribbons with the
     flowing-water shader of Mirkwood's river (mirkwood-water.js), murky brown-green, flowing fast in the channel;
   - how a player moves in them: wading and swimming (lake-water.js waterStep with each water as its body). The
     current's push and the rising water are the laketown-events work's (src/laketown-events/); this file only gives
     the water its surfaces and its wading.
   Wiring: decor.js builds LaketownWater and calls update(dt, players); player.js's water block calls
   laketownWaterStep() below 386 m when the events module did not take the step. ==== */
import * as THREE from 'three';
import { waterFrag, waterVert, RING_MAX, waterStep } from './lake-water.js';
import { material as flowMaterial } from './mirkwood-water.js';
import { CHANNEL, flowingLevel, POOLS, STREAM7, waterLevel } from './laketown-sites.js';

/** The lake-water material (the same shader as Gollum's lake), murkier: brown-green depth, grey-green mirror. */
export function lakeLookMaterial(deep = new THREE.Color(0.014, 0.018, 0.013), sky = new THREE.Color(0.045, 0.058, 0.048)) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uRings: { value: Array.from({ length: RING_MAX }, () => new THREE.Vector4()) },
    uRingN: { value: 0 },
    uLamp: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uLampCol: { value: new THREE.Color(1.0, 0.86, 0.66) },
    uDeep: { value: deep },
    uSky: { value: sky },
  }]);
  return new THREE.ShaderMaterial({ uniforms, vertexShader: waterVert, fragmentShader: waterFrag, fog: true });
}

/** Sets a water material's clock and the two players' lamps (as lake-water.js does). */
export function waterUniforms(mat, time, players) {
  const u = mat.uniforms;
  u.uTime.value = time;
  for (let i = 0; i < 2; i++) {
    const p = players[i];
    const L = u.uLamp.value[i];
    if (!p || p.dead > 0 || !p.lamp) L.set(0, 0, 0, 0);
    else L.set(p.lamp.position.x, p.lamp.position.y, p.lamp.position.z, p.lamp.intensity > 0 ? p.lamp.intensity / 6 : 0);
  }
}

function finish(pos, idx, mat, name, flow) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (flow) g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.matrixAutoUpdate = false;
  m.renderOrder = -1;
  m.name = name;
  return m;
}

/** A ribbon over a 3D polyline (each point its own water height), half width hw; aFlow: arc length, side −1..1. */
function ribbon3(pts, hw, pos, flow, idx) {
  let arc = 0;
  const base = pos.length / 3;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[2] - a[2];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (i > 0) arc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
    for (const s of [-1, 1]) {
      pos.push(pts[i][0] - tz * hw * s, pts[i][1], pts[i][2] + tx * hw * s);
      flow.push(arc, s);
    }
    if (i > 0) {
      const p = base + (i - 1) * 2;
      // Counter-clockwise seen from above (front faces up).
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
}

export class LaketownWater {
  /** @param {THREE.Object3D} group the layer's decor group (the surfaces are shown with it) */
  constructor(group) {
    this.time = 0;
    // ---- the pools: discs a little wider than their basins (the rim runs under the floor, hidden) ----
    {
      const pos = [];
      const idx = [];
      const N = 24;
      for (const p of POOLS) {
        const base = pos.length / 3;
        pos.push(p.x, p.w, p.z);
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          pos.push(p.x + Math.cos(a) * (p.r + 0.3), p.w, p.z + Math.sin(a) * (p.r + 0.3));
          idx.push(base, base + 1 + ((i + 1) % N), base + 1 + i);
        }
      }
      this.poolMat = lakeLookMaterial();
      this.pools = finish(pos, idx, this.poolMat, 'l7-pools');
      group.add(this.pools);
    }
    // ---- the channel and the stream: flowing, murky ----
    {
      const pos = [];
      const flow = [];
      const idx = [];
      ribbon3(CHANNEL, 1.08, pos, flow, idx);
      // The stream across the pile cavern: its level falls gently towards the sink pool (a hair over the pools'
      // discs where they meet, so they do not z-fight).
      const n = STREAM7.length;
      ribbon3(STREAM7.map((p, i) => [p[0], -408.36 + (-408.52 + 408.36) * (i / (n - 1)) + 0.004, p[1]]), 0.85, pos, flow, idx);
      this.flowMat = flowMaterial({ speed: 0.9, sheen: 0.35, deep: new THREE.Color(0.014, 0.017, 0.012), sky: new THREE.Color(0.04, 0.05, 0.04), sheenCol: new THREE.Color(0.016, 0.019, 0.014) });
      this.flow = finish(pos, idx, this.flowMat, 'l7-channel', flow);
      group.add(this.flow);
    }
  }

  /** Per frame: the clock and the lamps. */
  update(dt, players) {
    this.time += dt;
    waterUniforms(this.poolMat, this.time, players);
    waterUniforms(this.flowMat, this.time, players);
    this.poolMat.uniforms.uRingN.value = 0;
  }
}

/* ---------------------------------------------------------------- moving in the water ---- */

const flowTmp = { x: 0, z: 0, q: 0 };
/** Reused bodies of water for waterStep (level, plan outline). */
const POOL_BODY = { level: 0, inside: (x, z) => waterLevel(x, z, POOL_BODY.level) > -Infinity };
const FLOW_BODY = { level: 0, inside: (x, z) => !Number.isNaN(flowingLevel(x, FLOW_BODY.level - 0.3, z, flowTmp)) };

/**
 * How a player moves in layer 7's fixed water (player.js's water block, below 386 m): wading or swimming in a pool, the
 * channel or the stream (lake-water.js waterStep with that water as its body). The flood's water and the current's
 * push: src/laketown-events/.
 * @returns {boolean} true while swimming
 */
export function laketownWaterStep(p, it, dt, wx, wz, menuOpen) {
  const x = p.pos.x;
  const z = p.pos.z;
  const fl = flowingLevel(x, p.pos.y, z, flowTmp);
  if (!Number.isNaN(fl)) {
    FLOW_BODY.level = fl;
    return waterStep(p, it, dt, wx, wz, menuOpen, FLOW_BODY);
  }
  const wl = waterLevel(x, z, p.pos.y);
  if (wl > -Infinity) {
    POOL_BODY.level = wl;
    return waterStep(p, it, dt, wx, wz, menuOpen, POOL_BODY);
  }
  p.water = null;
  return false;
}
