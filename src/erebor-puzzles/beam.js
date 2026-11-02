/* ==== erebor-puzzles/beam.js — the light-ray puzzle of Durin's Day door (TERV technical note h.: "a light-ray puzzle
   on a 2D grid of mirror sockets"): the setting sun's ray enters at the provider's light source — straight down a
   shaft onto the socket below it, or sideways along a given direction — and then runs straight in the xz plane at the
   beam's height. A mirror standing in a socket turns it: its facing is one of eight directions (45° steps); a sideways
   ray is reflected off the mirror's line (both faces are polished), a ray from above is sent out along the facing (the
   mirror under the shaft leans back 45°). Empty sockets let the ray pass; solid ground stops it (the density field and
   the props' colliders: world.js sdf); digging opens the rock. Heights follow the targets (the ray climbs or drops
   between a mirror and the next, as a tilted mirror would send it). Pure functions: trace() for the game, solve() for
   the mirror count and QA. ==== */
import { sdf } from '../world.js';

export const BEAM = {
  hitR: 0.34, // m: how near a mirror's centre the ray must pass to hit it
  keyR: 0.42, // m: … and the keyhole
  cone: 0.25, // rad off the door's normal that the keyhole still takes (the provider's keyholeCone wins)
  under: 0.6, // m: a socket this near under the light source (in xz) takes a ray that comes straight down
  range: 36, // m: the longest straight run
  step: 0.2, // m between the solid-ground samples along a run
  skip: 0.35, // m left unsampled at both ends of a run (the source, the mirror's own stand, the door's face)
  bounces: 14,
};

/** The facing of a mirror (rot 0..7, 45° steps) in xz: also the normal of its line. */
export function facing(rot) {
  const th = (rot * Math.PI) / 4;
  return { x: -Math.sin(th), z: Math.cos(th) };
}

/** A sideways ray (dx, dz) after a mirror (rot), or null when it grazes the mirror's edge. rot and rot+4 are alike. */
export function reflect(dx, dz, rot) {
  const n = facing(rot);
  const d = dx * n.x + dz * n.z;
  if (Math.abs(d) < 0.05) return null;
  const rx = dx - 2 * d * n.x;
  const rz = dz - 2 * d * n.z;
  const l = Math.hypot(rx, rz) || 1;
  return { x: rx / l, z: rz / l };
}

/** Everything a ray from (px, pz) along (dx, dz) passes, nearest first: [{ t, along }] (t: a target with x, z, r). */
function along(px, pz, dx, dz, targets, from) {
  const out = [];
  for (const t of targets) {
    if (t === from) continue;
    const rx = t.x - px;
    const rz = t.z - pz;
    const a = rx * dx + rz * dz;
    if (a < 0.15 || a > BEAM.range) continue;
    if (Math.abs(rx * dz - rz * dx) > t.r) continue;
    out.push({ t, along: a });
  }
  out.sort((u, v) => u.along - v.along);
  return out;
}

/** True when the keyhole takes a ray going (dx, dz): nearly straight onto the door's face (within the cone). */
function intoDoor(door, dx, dz, cone) {
  if (!door || door.nx == null) return true;
  return -(dx * door.nx + dz * door.nz) >= Math.cos(cone);
}

/** The first solid sample between a and b (skipping the ends), or null when the run is clear. */
export function blockedBetween(a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  for (let s = BEAM.skip; s <= len - BEAM.skip; s += BEAM.step) {
    const k = s / len;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    const z = a.z + (b.z - a.z) * k;
    if (sdf(x, y, z) > 0) return { x, y, z };
  }
  return null;
}

/** The socket straight under a light source without a sideways direction (or null). */
export function socketUnder(light, sockets) {
  if (!light || !light.down) return null;
  let best = null;
  for (const s of sockets) {
    const d = Math.hypot(s.x - light.x, s.z - light.z);
    if (d < BEAM.under && (!best || d < best.d)) best = { d, s };
  }
  return best?.s || null;
}

/**
 * Traces the ray. `light` {x, y, z, dx, dz, down}; `mirrors` Map socketId → rot for the sockets holding one; `sockets`
 * [{id, x, y, z}] (y: where the mirror's centre stands, i.e. the beam's height there); `keyhole`; `door` (its normal);
 * `opt` { cone, solid } (solid(a, b) → first blocked point or null; default blockedBetween).
 * Returns { points: [{x, y, z}], lit, blocked: {x, y, z} | null, via: [socket ids in order] }.
 */
export function trace(light, mirrors, sockets, keyhole, door, opt = {}) {
  const solid = opt.solid || blockedBetween;
  const cone = opt.cone ?? BEAM.cone;
  const res = { points: [], lit: false, blocked: null, via: [] };
  if (!light) return res;
  const targets = [];
  for (const s of sockets) if (mirrors.has(s.id)) targets.push({ x: s.x, y: s.y, z: s.z, r: BEAM.hitR, s });
  const key = keyhole ? { x: keyhole.x, y: keyhole.y, z: keyhole.z, r: BEAM.keyR, key: true } : null;
  if (key) targets.push(key);
  let p = { x: light.x, y: light.y, z: light.z };
  res.points.push(p);
  let dx = light.dx;
  let dz = light.dz;
  let from = null;
  const under = socketUnder(light, sockets);
  if (light.down) {
    // Straight down the shaft onto the socket below (a mirror there leans back and sends it out along its facing).
    if (!under) return res;
    const floorY = under.floorY ?? under.y - 1;
    const end = mirrors.has(under.id) ? { x: under.x, y: under.y, z: under.z } : { x: under.x, y: floorY, z: under.z };
    const b = solid(p, end);
    if (b) {
      res.points.push(b);
      res.blocked = b;
      return res;
    }
    res.points.push(end);
    if (!mirrors.has(under.id)) return res;
    const f = facing(mirrors.get(under.id));
    dx = f.x;
    dz = f.z;
    res.via.push(under.id);
    p = end;
    from = targets.find((t) => t.s === under) || null;
  }
  for (let n = 0; n < BEAM.bounces; n++) {
    let hit = along(p.x, p.z, dx, dz, targets, from)[0] || null;
    if (hit && hit.t.key && !intoDoor(door, dx, dz, cone)) hit = null;
    // Nothing ahead: the ray runs on at its height until solid ground stops it (or the range ends).
    const end = hit ? { x: hit.t.x, y: hit.t.y, z: hit.t.z } : { x: p.x + dx * BEAM.range, y: p.y, z: p.z + dz * BEAM.range };
    const b = solid(p, end);
    if (b) {
      res.points.push(b);
      res.blocked = b;
      return res;
    }
    res.points.push(end);
    if (!hit) return res;
    if (hit.t.key) {
      res.lit = true;
      return res;
    }
    const r = reflect(dx, dz, mirrors.get(hit.t.s.id));
    res.via.push(hit.t.s.id);
    if (!r) return res; // grazing the mirror's edge: the light stops there
    dx = r.x;
    dz = r.z;
    p = end;
    from = hit.t;
  }
  return res;
}

/**
 * The fewest mirrors that bring the light to the keyhole, ignoring the ground (rock can be dug; a pillar in the way
 * shows up in QA's trace): Map socketId → rot, or null. Breadth-first over (socket, direction); an empty socket on
 * the way may be passed or used.
 */
export function solve(light, sockets, keyhole, door, opt = {}) {
  const maxMirrors = opt.max ?? 7;
  const cone = opt.cone ?? BEAM.cone;
  if (!light || !keyhole) return null;
  const T = sockets.map((s) => ({ x: s.x, z: s.z, r: BEAM.hitR, s }));
  const key = { x: keyhole.x, z: keyhole.z, r: BEAM.keyR, key: true };
  const queue = [];
  const seen = new Set();
  const under = socketUnder(light, sockets);
  if (light.down) {
    if (!under) return null;
    const t0 = T.find((t) => t.s === under);
    for (let rot = 0; rot < 8; rot++) {
      const f = facing(rot);
      queue.push({ x: under.x, z: under.z, dx: f.x, dz: f.z, from: t0, used: new Map([[under.id, rot]]) });
    }
  } else queue.push({ x: light.x, z: light.z, dx: light.dx, dz: light.dz, from: null, used: new Map() });
  while (queue.length) {
    const st = queue.shift();
    const ev = along(st.x, st.z, st.dx, st.dz, [...T, key], st.from);
    for (const e of ev) {
      if (e.t.key) {
        if (intoDoor(door, st.dx, st.dz, cone)) return st.used;
        continue;
      }
      if (st.used.has(e.t.s.id)) break; // an earlier mirror stands in the way
      if (st.used.size >= maxMirrors) continue;
      for (let rot = 0; rot < 4; rot++) {
        const r = reflect(st.dx, st.dz, rot);
        if (!r || r.x * st.dx + r.z * st.dz < -0.99) continue; // grazing or straight back
        const k = `${e.t.s.id}|${Math.round(r.x * 10)},${Math.round(r.z * 10)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const used = new Map(st.used);
        used.set(e.t.s.id, rot);
        queue.push({ x: e.t.x, z: e.t.z, dx: r.x, dz: r.z, from: e.t, used });
      }
    }
  }
  return null;
}
