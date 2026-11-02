/* ==== famous-moment.js — the famous find's moment (TERV 0.12 screen table: "Híres lelet: aranyfény a falban, a
   kamera ráközelít, Bilbó könyvében új lap íródik"; NOTES-27-loose).
   When a famous find is dug out (finds.js `fly`, one marked hook), for the finder only:
   - a golden glow where the find lay: a DOM radial-gradient spot over the finder's own viewport, at the find's screen
     position (projected through his camera), blended "screen" over the picture: no draw call, no material;
   - the camera closes in: his camera's field of view narrows by FOV_IN and widens back (a tween owned here; player.js
     sets the camera's position and rotation every frame but never its fov, so the two do not fight);
   - then the contract scroll's existing slip ("A szerződés tovább gördül", ui/journal.js): the find has reached Bag
     End's case by then (the flight is 0.55 s), and the journal is asked to poll at once so the slip follows the moment.
   The tween runs on its own requestAnimationFrame (1.6 s), restores the exact fov at the end, and stands down when the
   player leaves the game. Each find type has its moment once per session. ==== */

/** The moment's timing (s): closing in, holding, widening back. */
export const MOMENT = { in: 0.35, hold: 0.55, out: 0.7, fovIn: 0.2 };
const DUR = MOMENT.in + MOMENT.hold + MOMENT.out;

/** Running moments per player: { base, t0, el }. */
const running = new Map();
/** Find types whose moment has been shown (once per session). */
const shown = new Set();
/** True while the requestAnimationFrame loop runs (one loop for every running moment). */
let looping = false;

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** How far the camera is closed in at time t (0..1). */
function pushAt(t) {
  if (t < MOMENT.in) return ease(t / MOMENT.in);
  if (t < MOMENT.in + MOMENT.hold) return 1;
  return 1 - ease((t - MOMENT.in - MOMENT.hold) / MOMENT.out);
}

/** The golden glow over the finder's viewport at the find's screen spot (or the view's centre when behind him). */
function glow(game, player, find) {
  const i = game.players.indexOf(player);
  const vp = game.viewports?.()[i];
  if (!vp || typeof document === 'undefined') return null;
  let fx = 0.5;
  let fy = 0.5;
  const cam = player.camera;
  if (cam && find && typeof find.x === 'number') {
    cam.updateMatrixWorld();
    const v = { x: find.x, y: find.y, z: find.z };
    // Project by hand (no THREE import needed): view, then projection.
    const e = cam.matrixWorldInverse.elements;
    const vx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12];
    const vy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13];
    const vz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14];
    if (vz < -0.05) {
      const p = cam.projectionMatrix.elements;
      const cx = p[0] * vx + p[8] * vz;
      const cy = p[5] * vy + p[9] * vz;
      const w = -vz;
      fx = Math.min(0.9, Math.max(0.1, 0.5 + (cx / w) * 0.5));
      fy = Math.min(0.9, Math.max(0.1, 0.5 - (cy / w) * 0.5));
    }
  }
  const el = document.createElement('div');
  el.className = 'famous-glow';
  const r = Math.round(Math.min(vp.w, vp.h) * 0.55);
  el.style.cssText = `position:fixed;left:${vp.x}px;top:${vp.y}px;width:${vp.w}px;height:${vp.h}px;pointer-events:none;z-index:5;`
    + `mix-blend-mode:screen;opacity:0;background:radial-gradient(circle ${r}px at ${(fx * 100).toFixed(1)}% ${(fy * 100).toFixed(1)}%,`
    + 'rgba(255,214,110,.85) 0%,rgba(255,186,60,.45) 35%,rgba(200,120,20,.12) 65%,rgba(0,0,0,0) 100%);';
  document.body.appendChild(el);
  el.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0.8, offset: 0.6 }, { opacity: 0 }], { duration: DUR * 1000, easing: 'ease-out', fill: 'forwards' });
  return el;
}

/** Ends a player's moment: the exact fov back, the glow removed. */
function finish(player) {
  const m = running.get(player);
  if (!m) return;
  running.delete(player);
  if (player.camera) {
    player.camera.fov = m.base;
    player.camera.updateProjectionMatrix();
  }
  m.el?.remove();
}

function tick() {
  const now = performance.now();
  for (const [player, m] of running) {
    const t = (now - m.t0) / 1000;
    if (t >= DUR || !m.game.players.includes(player)) {
      finish(player);
      // The scroll's slip right after the moment (the find is in the case by now): the journal polls on its next frame.
      if (m.game.journal && 't' in m.game.journal) m.game.journal.t = 1e9;
      continue;
    }
    const cam = player.camera;
    cam.fov = m.base * (1 - MOMENT.fovIn * pushAt(t));
    cam.updateProjectionMatrix();
  }
  looping = running.size > 0;
  if (looping) requestAnimationFrame(tick);
}

/**
 * The famous find's moment for its finder (finds.js `fly` calls it for a famous find). Once per find type a session.
 * @param {object} player the finder (player.js: `game`, `camera`)
 * @param {{ type: { id: string }, x: number, y: number, z: number }} find the dug-out find
 * @returns {boolean} true when the moment started
 */
export function famousMoment(player, find) {
  const game = player?.game;
  const id = find?.type?.id;
  if (!game || !player.camera || !id || shown.has(id)) return false;
  shown.add(id);
  const old = running.get(player);
  const base = old ? old.base : player.camera.fov;
  if (old) old.el?.remove();
  running.set(player, { game, base, t0: performance.now(), el: glow(game, player, find) });
  if (!looping) {
    looping = true;
    requestAnimationFrame(tick);
  }
  return true;
}

/** QA: the running moment of a player ({ base, t } or null) and the shown find types. */
export function famousState(player) {
  const m = running.get(player);
  return { running: m ? { base: m.base, t: (performance.now() - m.t0) / 1000 } : null, shown: [...shown] };
}
