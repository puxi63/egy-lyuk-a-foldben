/* ==== finale/index.js — the finale (TERV 0.8, 0.11/22, 0.13/6): the Arkenstone wakes Smaug, the escape up the pit
   with his fire behind the players, Bárd's black arrow from the garden, the Eagles, the feast at the Green Dragon and
   the epilogue (the auction at Bag End stopped, a garden round the pit's mouth), then free play without Smaug.
   - THE ESCAPE: on `game.events` 'arkenstone' (layer 9 emits it at the pickup) Smaug wakes (`setPose('awake')`, a roar),
     then flies after the players along their own trail (breadcrumbs recorded from the pickup on: whatever way they go,
     the hoard's exitPath, their own pit, the ladders). He lags `gapRun` m behind the one he chases and closes to
     `gapStall` m when that player stalls; fire comes in bursts (hunger, a burnt find, a knock-back; no death in normal
     mode). The lift, the ladders, Gandalf's rocket and the Eagles all count: they bring the player to the surface.
     Co-op: the straggler (the deeper player, or the nearer one when close) is chased; the existing help applies (the
     Eagles and the lift take a partner standing close).
   - THE BLACK ARROW: once everyone is out (or a straggler stays below too long) Smaug bursts out of the pit, circles
     over the garden and makes strafing runs; Bárd (laketown-events' baked figure) stands in the garden. If the players
     learned the bare patch (the thrush in layer 8, saved), his black arrow certainly hits after the first run;
     otherwise his arrows bounce until the players stand by him in the garden without being hit for `helpTime` s.
   - THE SCENES (held, short, skippable with the confirm / back button): Smaug's fall beyond Bag End's hill, the
     Eagles, the feast, home to Bag End (the auction), the garden. Then `done` (saved): Smaug is taken out of the scene
     for good, the garden stays.
   Wiring (small marked lines): game.js `new Finale(this)` + `restore(save.finale)`, `input(p, i, it)` first in the
   menu chain (true while a scene holds the player), `update(dt)`, `cullFor(seen, i)` after the decor (Smaug's fire on
   the shaft walls through underground/firelight.js's uniforms: no three.js light), `musicSituation()`, `benchIntent()`;
   save.js `finale: game.finale?.state()`. Interface used (layer 9): `game.smaug` (Smaug: root, setPose, setEye, breath,
   snore, busy), `game.events` ({ on, emit }), `underground/hoard-sites.js HOARD_SITE_PROVIDER` (lair, exitPath; loaded
   lazily, optional). ==== */
import * as THREE from 'three';
import { sharedAudio } from '../audio.js';
import { emptyIntent } from '../input.js';
import { BAG_END } from '../surface/bagend.js';
import { INN } from '../surface/inn.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { FIRE, FIRE_MAX } from '../underground/firelight.js';
import { HALL as EREBOR_HALL } from '../underground/erebor-sites.js';
import { sdf } from '../world.js';
import { LINES } from './lines.js';
import { lifeOf } from '../modes/rules.js'; // NOTES-27-loose: the tier-3 "életerő" against the fire
import { BODY_LEN, SPINE_J } from '../smaug/body.js'; // NOTES-27-loose: the joints along the trail in a shaft
import { buildAuction, buildGarden, EagleFlight, FinaleBard, PLACES, Puffs } from './props.js';

/** The numbers of the finale (metres, seconds). */
export const FIN = {
  wakeTime: 3.2, // Smaug rises in his lair before the chase
  gapRun: 15, // m along the trail behind a moving player
  gapStall: 5, // … behind a player who stalls
  gapGrace: 22, // … in the first seconds of the chase
  graceTime: 8,
  stallDist: 1.5, // a player who has not moved this far …
  stallTime: 2.5, // … for this long has stalled
  follow: 11, // m/s along the trail at most
  fly: 16, // m/s towards his trail point
  fly0: 1.6, // m above the trail's floor points he flies
  flyFar: 40, // … when far from it (a new target, a reset trail)
  fireReach: 11, // m of flame (layer 9's fire reaches 10.5 m)
  fireTime: 1.3, // s of a burst
  fireCd: 4.5, // s between bursts
  fireCdStall: 2.4, // … while the chased player stalls
  fireGap: 18, // m along the trail: closer than this he breathes
  hitHunger: 8, // of the 100 plate
  hitFloor: 5, // normal mode: fire never takes the plate below this
  hitCd: 1.6, // s between two hits on one player
  knock: 5, // m/s knock-back
  out: 1.5, // m: shallower than this a player is out
  rumble: 3.5, // s of rumbling before Smaug bursts out
  waitOut: 240, // s a straggler may stay below after the first is out
  orbitR: 34, // m: his circle over the pit and the garden (he is 20 m long)
  orbitY: 30,
  orbitPeriod: 11,
  strafeEvery: 7, // s between strafing runs
  strafe: 3.8, // s of a run (dive, breath, climb)
  gardenR: 11, // m from Bárd: "in the garden"
  helpTime: 6, // s by Bárd unhurt for the black arrow (no bare patch)
  plainEvery: 3.6, // s between his plain arrows
  // NOTES-27-loose: the shaft's squeeze. Rock within `squeezeR` m on both sides of his wing line (both horizontal
  // lines in a steep shaft) folds his wings and lays his body along the trail; tested every `squeezeEvery` s; only
  // while his head is within `squeezeOn` m of his trail point.
  squeezeR: 6,
  squeezeEvery: 0.25,
  squeezeOn: 1.5,
};
/** NOTES-27-loose: the distances (m) sampled out from his head along a wing line. */
const SQUEEZE_STEPS = [1.5, 3, 4.5, 6];

/** The held scenes after the arrow, in order, with their lengths. */
const SCENES = [
  { id: 'fall', dur: 7 },
  { id: 'eagles', dur: 7.5 },
  { id: 'feast', dur: 6.5 },
  { id: 'home', dur: 14.5 },
];

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A player's breadcrumbs since the pickup: points every 0.75 m with their arc length; reset on a teleport. */
class Trail {
  constructor(p) {
    this.pts = [];
    this.reset(p);
  }

  reset(p) {
    this.pts.length = 0;
    this.pts.push({ x: p.x, y: p.y, z: p.z, s: 0 });
    this.base = 0;
  }

  get end() {
    return this.pts[this.pts.length - 1].s;
  }

  /** Adds the position; returns true when it was a jump (lift, rocket, Eagles, death): the trail starts again. */
  add(p) {
    const l = this.pts[this.pts.length - 1];
    const d = Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z);
    if (d > 8) {
      this.reset(p);
      return true;
    }
    if (d < 0.75) return false;
    this.pts.push({ x: p.x, y: p.y, z: p.z, s: l.s + d });
    if (this.pts.length > 4000) this.pts.shift();
    return false;
  }

  /** The point at arc length s (clamped to the trail). */
  at(s, out) {
    const P = this.pts;
    if (s <= P[0].s) return out.set(P[0].x, P[0].y, P[0].z);
    const L = P[P.length - 1];
    if (s >= L.s) return out.set(L.x, L.y, L.z);
    let lo = 0;
    let hi = P.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (P[m].s <= s) lo = m;
      else hi = m;
    }
    const a = P[lo];
    const b = P[hi];
    const u = (s - a.s) / (b.s - a.s || 1);
    return out.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
  }

  /** Arc length of the trail point nearest to q. */
  nearest(q) {
    let best = 0;
    let bd = Infinity;
    for (const p of this.pts) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
      if (d < bd) {
        bd = d;
        best = p.s;
      }
    }
    return best;
  }
}

export class Finale {
  constructor(game) {
    this.game = game;
    this.stage = 'idle';
    this.t = 0;
    this.patch = false;
    this.woke = false;
    this.slain = false;
    this.done = false;
    this.trails = new Map();
    this.ui = new Map();
    this.head = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.aim = new THREE.Vector3(0, 0, -1);
    this.goal = new THREE.Vector3();
    this.target = null;
    this.sS = 0;
    this.breathing = false;
    this.fireT = 0;
    this.fireCdT = 0;
    this.hitFn = null;
    this.audio = null;
    this.scene = null; // { i, t } while a held scene runs
    this.hoard = null;
    // The props: one vertex-coloured Lambert material for all of them (one program).
    const scene = game.scene;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.bard = new FinaleBard(scene, this.mat);
    this.eagles = new EagleFlight(scene, this.mat);
    this.auction = buildAuction(scene, this.mat);
    this.garden = buildGarden(scene, this.mat);
    this.puffs = new Puffs(scene);
    // Layer 9's site provider (optional; the lair and the exit path). Loaded lazily: the module may not exist yet.
    Promise.all([import('../underground/hoard-sites.js'), import('../underground/erebor-sites.js')]).then(([m, E]) => {
      this.hoard = m.HOARD_SITE_PROVIDER || null;
      try {
        this.hoard?.getExitPath?.(E);
      } catch {
        // The exit path is optional (the chase follows the players' own trails).
      }
    }).catch(() => {});
    this.hookEvents();
  }

  /* ---------------- wiring ---------------- */

  /** Subscribes to game.events once it exists (layer 9 creates it; it may come after this module). */
  hookEvents() {
    const ev = this.game.events;
    if (!ev || ev === this.evBound || typeof ev.on !== 'function') return;
    this.evBound = ev;
    ev.on('arkenstone', (p) => this.onArkenstone(p));
  }

  /** Layer 9's Smaug, while he is still in the world. */
  get dragon() {
    const s = this.game.smaug;
    return s && s.root && !s.gone ? s : null;
  }

  /** Active players: joined, chosen a character. */
  active() {
    return this.game.players.filter((p) => !p.choosing);
  }

  isOut(p) {
    return p.dead > 0 ? false : p.depth < FIN.out || !!this.game.bagEnd?.isInside(p);
  }

  /* ---------------- the escape ---------------- */

  onArkenstone(player) {
    if (this.done || this.stage !== 'idle') return;
    this.startEscape(player, false);
  }

  startEscape(player, resumed) {
    const g = this.game;
    this.stage = 'wake';
    this.t = 0;
    this.woke = true;
    this.escapeT = 0;
    this.firstOutT = null;
    const s = this.dragon;
    if (s) {
      s.busy = true;
      s.setPose?.('awake');
      s.setEye?.(1);
      s.snore?.(false);
      this.mouthNow(s, this.head);
    } else {
      // No Smaug model: the chase runs from the lair (or 25 m under the deepest player).
      const lair = this.hoard?.smaugLair;
      const deep = this.active().reduce((a, p) => (p.pos.y < a.y ? p.pos : a), { y: Infinity, x: 0, z: 0 });
      if (lair) this.head.set(lair.x, lair.y + 3, lair.z);
      else this.head.set(deep.x || 0, (deep.y === Infinity ? -500 : deep.y) - 25, deep.z || 0);
    }
    this.trails.clear();
    for (const p of this.active()) {
      this.trails.set(p, new Trail(p.pos));
      p.finAnchor = p.pos.clone();
      p.finStall = 0;
      p.finHitT = 0;
    }
    this.target = player && !this.isOut(player) ? player : null;
    this.sS = -FIN.gapGrace;
    this.fireCdT = 2;
    this.sound('roar');
    for (const p of this.active()) {
      if (!this.isOut(p)) {
        p.kick = 1;
        p.say(resumed ? LINES.resumed : LINES.wake, 6);
      }
    }
    this.banner(LINES.wakeBanner);
    this.forceMusic('menekules');
    g.saveNow?.();
  }

  /** Where Smaug's mouth is relative to his root (world units, unrotated); cached once his model has a size. */
  mouthOffset(s, out) {
    if (this.mouthCache && this.mouthFor === s) return out.copy(this.mouthCache);
    const root = s.root;
    const q = root.quaternion.clone();
    root.quaternion.identity();
    root.updateMatrixWorld(true);
    const fz = this.fz(s);
    let off = null;
    if (typeof s.mouth === 'function') off = s.mouth(new THREE.Vector3()).sub(root.position);
    else if (s.mouth?.isObject3D) off = s.mouth.getWorldPosition(new THREE.Vector3()).sub(root.position);
    else {
      const box = new THREE.Box3().setFromObject(root);
      if (!box.isEmpty()) off = new THREE.Vector3(0, (box.min.y + box.max.y) / 2 - root.position.y, (fz < 0 ? box.min.z : box.max.z) - root.position.z);
    }
    root.quaternion.copy(q);
    root.updateMatrixWorld(true);
    if (!off) return out.set(0, 0, fz * 6);
    this.mouthCache = off;
    this.mouthFor = s;
    return out.copy(off);
  }

  /**
   * The model's forward along z: `forward` when it says so, else where its mouth lies at rest (layer 9's Smaug faces
   * +z: his `mouth()` is ahead of the root), else −z (as the game's characters).
   */
  fz(s) {
    if (this.fzFor === s) return this.fzCache;
    let f = -1;
    if (s.forward) f = s.forward.z > 0 ? 1 : -1;
    else if (typeof s.mouth === 'function') {
      const q = s.root.quaternion.clone();
      s.root.quaternion.identity();
      s.root.updateMatrixWorld(true);
      f = s.mouth(new THREE.Vector3()).z - s.root.position.z >= 0 ? 1 : -1;
      s.root.quaternion.copy(q);
      s.root.updateMatrixWorld(true);
    }
    this.fzFor = s;
    this.fzCache = f;
    return f;
  }

  /** Smaug's mouth now (world): his own `mouth()`, else root + the cached offset. */
  mouthNow(s, out) {
    if (typeof s.mouth === 'function') return s.mouth(out);
    return out.copy(s.root.position).add(this.mouthOffset(s, v2).applyQuaternion(s.root.quaternion));
  }

  /**
   * Puts Smaug so that his mouth is at `head`, facing `dir`. With his own `mouth()` the root is corrected by where the
   * mouth really is (it moves with the pose: a frame behind, which does not show), else by the rest offset.
   */
  place(head, dir) {
    const s = this.dragon;
    if (!s) return;
    const fz = this.fz(s);
    const h = Math.hypot(dir.x, dir.z);
    const yaw = fz < 0 ? Math.atan2(-dir.x, -dir.z) : Math.atan2(dir.x, dir.z);
    const pitch = Math.atan2(dir.y, h || 1e-6) * (fz < 0 ? 1 : -1);
    s.root.rotation.set(pitch, yaw, 0, 'YXZ');
    if (typeof s.mouth === 'function') {
      if (!this.placedOnce) {
        this.placedOnce = true;
        s.root.position.copy(head).sub(this.mouthOffset(s, v1).applyQuaternion(s.root.quaternion));
      }
      s.root.updateMatrixWorld(true);
      const m = s.mouth(v1);
      s.root.position.add(v2.subVectors(head, m));
      s.root.updateMatrixWorld(true);
      return;
    }
    this.mouthOffset(s, v1).applyQuaternion(s.root.quaternion);
    s.root.position.copy(head).sub(v1);
  }

  /* ---------------- NOTES-27-loose: the shaft's squeeze ---------------- */

  /** True when rock lies within FIN.squeezeR m on both sides of a line through `o` along the unit vector `a`. */
  rockBoth(o, a) {
    let hits = 0;
    for (const sg of [1, -1]) {
      for (const t of SQUEEZE_STEPS) {
        if (sdf(o.x + a.x * t * sg, o.y + a.y * t * sg, o.z + a.z * t * sg) > 0) {
          hits++;
          break;
        }
      }
    }
    return hits === 2;
  }

  /** Narrower than his wings here: his wing line (both horizontal lines when he flies steeply) meets rock both sides. */
  narrowAt(o, dir) {
    if (Math.abs(dir.y) > 0.7) return this.rockBoth(o, v1.set(1, 0, 0)) || this.rockBoth(o, v1.set(0, 0, 1));
    v1.set(dir.z, 0, -dir.x);
    if (v1.lengthSq() < 1e-6) return false;
    return this.rockBoth(o, v1.normalize());
  }

  /**
   * The cheapest look that keeps him in a narrow shaft (NOTES-27-loose): the wings folded and the 20 m body laid along
   * the chased player's trail behind the head (the trail runs through the air the players dug), instead of a straight
   * body cutting through the rock. CPU only (a few sdf samples four times a second, 16 trail look-ups a frame), no
   * draw calls. Returns true while it places him (place() is skipped then).
   */
  squeeze(tr, dt) {
    const s = this.dragon;
    if (!s?.followTrack || !s.moveRoot) return false;
    this.squeezeT = (this.squeezeT || 0) - dt;
    if (this.squeezeT <= 0) {
      this.squeezeT = FIN.squeezeEvery;
      this.narrow = this.narrowAt(this.head, this.dir);
    }
    if (Math.abs(this.dir.y) < 0.7) (this.heading ||= new THREE.Vector3(0, 0, 1)).set(this.dir.x, 0, this.dir.z).normalize();
    const goal = tr.at(this.sS, v1);
    goal.y += FIN.fly0;
    if (!this.narrow || this.head.distanceTo(goal) > FIN.squeezeOn || this.benchPin) {
      if (this.squeezing) this.unsqueeze();
      return false;
    }
    const pts = (this.trackPts ||= SPINE_J.map(() => new THREE.Vector3()));
    const n = SPINE_J.length;
    for (let k = 0; k < n - 1; k++) this.trailAt(tr, this.sS - (BODY_LEN - SPINE_J[k]), pts[k]).y += FIN.fly0;
    pts[n - 1].copy(this.head);
    const h = this.heading || this.dir;
    const yaw = this.fz(s) < 0 ? Math.atan2(-h.x, -h.z) : Math.atan2(h.x, h.z);
    s.moveRoot(this.head, (this.squeezeQ ||= new THREE.Quaternion()).setFromAxisAngle(UP, yaw));
    s.followTrack(pts, h);
    this.squeezing = true;
    return true;
  }

  /** A trail point at arc length s; before the trail's start it runs on straight back along its first metres. */
  trailAt(tr, s, out) {
    const P = tr.pts;
    const a = P[0];
    if (s >= a.s || P.length < 2) {
      if (P.length < 2 && s < a.s) return out.set(a.x, a.y, a.z).addScaledVector(this.heading || this.dir, s - a.s);
      return tr.at(s, out);
    }
    const b = P[Math.min(P.length - 1, 3)];
    const d = v2.set(a.x - b.x, a.y - b.y, a.z - b.z);
    const l = d.length() || 1;
    return out.set(a.x, a.y, a.z).addScaledVector(d, (a.s - s) / l);
  }

  /** The squeeze ends: the free flight's place and pose take over from where his body is. */
  unsqueeze() {
    const s = this.dragon;
    this.squeezing = false;
    if (!s?.followTrack) return;
    s.followTrack(null);
    // The free flight's root rotation, set without moving the body (place() then corrects the position by the mouth).
    const fz = this.fz(s);
    const d = this.dir;
    const yaw = fz < 0 ? Math.atan2(-d.x, -d.z) : Math.atan2(d.x, d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z) || 1e-6) * (fz < 0 ? 1 : -1);
    s.moveRoot(s.root.position, (this.squeezeQ ||= new THREE.Quaternion()).setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')));
  }

  /** True when the straight line between two points runs through air (sampled every 0.7 m). */
  clear(a, b) {
    const d = v2.subVectors(b, a);
    const len = d.length();
    if (len < 1.2) return true;
    d.divideScalar(len);
    for (let t = 1.2; t < len - 0.4; t += 0.7) if (sdf(a.x + d.x * t, a.y + d.y * t, a.z + d.z * t) > 0.15) return false;
    return true;
  }

  chest(p, out) {
    return out.set(p.pos.x, p.pos.y + p.eyeH * 0.6, p.pos.z);
  }

  /** The player Smaug chases: the deeper one when they are far apart, else the nearer to him. */
  pickTarget() {
    const below = this.active().filter((p) => p.dead <= 0 && !this.isOut(p));
    if (!below.length) return null;
    if (below.length === 1) return below[0];
    const [a, b] = below;
    if (Math.abs(a.depth - b.depth) > 12) return a.depth > b.depth ? a : b;
    return a.pos.distanceTo(this.head) < b.pos.distanceTo(this.head) ? a : b;
  }

  updateEscape(dt) {
    const g = this.game;
    this.escapeT += dt;
    const players = this.active();
    // Trails and stalls.
    for (const p of players) {
      let tr = this.trails.get(p);
      if (!tr) this.trails.set(p, (tr = new Trail(p.pos)));
      if (!p.riding && p.dead <= 0 && tr.add(p.pos) && p === this.target) this.sS = -6;
      if (!p.finAnchor) p.finAnchor = p.pos.clone();
      if (p.pos.distanceTo(p.finAnchor) > FIN.stallDist) {
        p.finAnchor.copy(p.pos);
        p.finStall = 0;
      } else p.finStall = (p.finStall || 0) + dt;
      p.finHitT = Math.max(0, (p.finHitT || 0) - dt);
    }
    // Who is out: Bárd waits in the garden from the first one out; everyone out → the burst.
    const out = players.filter((p) => this.isOut(p));
    if (out.length && this.firstOutT == null) {
      this.firstOutT = 0;
      this.bard.show(true, 0);
    }
    if (this.firstOutT != null) this.firstOutT += dt;
    if (players.length && (out.length === players.length || this.firstOutT > FIN.waitOut)) {
      this.endBreath();
      this.stage = 'rumble';
      this.t = 0;
      for (const p of players) p.say(LINES.rumble, 3);
      this.sound('rumble');
      return;
    }
    // The chased player (re-picked twice a second).
    this.pickT = (this.pickT || 0) - dt;
    if (this.pickT <= 0 || !this.target || this.isOut(this.target) || this.target.dead > 0) {
      this.pickT = 0.5;
      const t = this.pickTarget();
      if (t && t !== this.target) {
        const tr = this.trails.get(t);
        this.sS = Math.min(tr.nearest(this.head), tr.end - 8);
        if (this.target && players.length > 1) t.say(LINES.straggler, 3);
      }
      this.target = t;
    }
    const tp = this.target;
    if (!tp) return;
    const tr = this.trails.get(tp);
    // Along the trail: the gap he keeps, smaller when the chased player stalls.
    const stalled = tp.finStall > FIN.stallTime;
    const want = this.benchPin ? 0 : this.escapeT < FIN.graceTime ? FIN.gapGrace : stalled ? FIN.gapStall : FIN.gapRun;
    // He flies a little above the trail (the players' feet), head high in the passages.
    tr.at(this.sS, this.goal).y += FIN.fly0;
    if (this.benchPin) this.goal.copy(this.benchPin);
    // Not on top of the chased player either (a player who never moved has a trail of one point): he hovers
    // `gapStall` m off, on the side he came from.
    const tc = this.chest(tp, v3);
    if (this.goal.distanceTo(tc) < FIN.gapStall) {
      const away = v2.subVectors(this.head, tc);
      if (away.lengthSq() < 0.01) away.set(0, 1, 0);
      this.goal.copy(tc).addScaledVector(away.normalize(), FIN.gapStall);
    }
    const far = this.head.distanceTo(this.goal);
    // Never closer than `gapStall` in a straight line either (a winding stair puts trail metres close together).
    if (far < 3 && this.head.distanceTo(tp.pos) > FIN.gapStall) this.sS += clamp((tr.end - this.sS - want) * 0.9, 0, FIN.follow) * dt;
    const step = (far > 30 ? FIN.flyFar : FIN.fly) * dt;
    const prev = v3.copy(this.head);
    if (far > 1e-3) this.head.addScaledVector(v2.subVectors(this.goal, this.head).normalize(), Math.min(far, step));
    // Facing: the chased player while breathing or close, else the way he flies.
    // (Its own vector: place() below uses the shared temporaries.)
    const look = this.chest(tp, (this.lookV ||= new THREE.Vector3()));
    const moved = v2.subVectors(this.head, prev);
    const wantDir = this.breathing || far < 2 || moved.lengthSq() < 1e-6 ? look.clone().sub(this.head).normalize() : moved.normalize();
    this.dir.lerp(wantDir, Math.min(1, dt * 4)).normalize();
    // NOTES-27-loose: in a shaft narrower than his wings he folds them and his body follows the trail behind him.
    if (!this.squeeze(tr, dt)) this.place(this.head, this.dir);
    // Fire in bursts.
    const gap = tr.end - this.sS;
    this.fireCdT -= dt;
    if (this.breathing) {
      this.fireT -= dt;
      this.aim.lerp(look.clone().sub(this.head).normalize(), Math.min(1, dt * 6)).normalize();
      this.breathe(true);
      for (const p of players) if (p.dead <= 0 && !this.isOut(p)) this.tryHit(p);
      if (this.fireT <= 0) {
        this.endBreath();
        this.fireCdT = this.benchPin ? 1.2 : stalled ? FIN.fireCdStall : FIN.fireCd;
      }
    } else if (this.fireCdT <= 0 && (this.benchPin || (gap < FIN.fireGap && this.head.distanceTo(look) < FIN.fireReach + 4 && this.clear(this.head, look)))) {
      this.breathing = true;
      this.fireT = FIN.fireTime;
      this.aim.copy(look).sub(this.head).normalize();
      this.sound('fire');
      this.breathe(true);
    }
    tp.finGap = Math.max(0, Math.round(Math.min(gap, this.head.distanceTo(tp.pos))));
    void g;
  }

  /** Smaug's breath (layer 9 draws it and gives the hit test); without one, a cone of FIN.fireReach. */
  breathe(on) {
    // Bench A/B only: `&finbreath=0` keeps Smaug's own flame off (the fire light and the timing stay).
    const s = this.game.bench && this.game.params.get('finbreath') === '0' ? null : this.dragon;
    const fn = s?.breath?.(on, this.head, this.aim);
    if (on) this.hitFn = typeof fn === 'function' ? fn : typeof fn?.hits === 'function' ? (q) => fn.hits(q) : null;
  }

  endBreath() {
    if (!this.breathing) return;
    this.breathing = false;
    this.breathe(false);
    this.hitFn = null;
  }

  /** Inside the flame (and not behind rock)? */
  inFlame(q) {
    if (this.hitFn) {
      if (!this.hitFn(q)) return false;
    } else {
      const d = v2.subVectors(q, this.head);
      const t = d.dot(this.aim);
      if (t < 0 || t > FIN.fireReach) return false;
      const perp = d.addScaledVector(this.aim, -t).length();
      if (perp > 0.7 + t * 0.2) return false;
    }
    return this.clear(this.head, q);
  }

  tryHit(p) {
    if (p.finHitT > 0) return false;
    const c = this.chest(p, new THREE.Vector3());
    if (!this.inFlame(c)) return false;
    this.hit(p);
    return true;
  }

  /** A fire hit: hunger, a burnt find (never a famous / kept one), a knock-back away from the flame. */
  hit(p) {
    p.finHitT = FIN.hitCd;
    this.lastHitT = 0;
    p.finLastHit = performance.now();
    const challenge = !!this.game.enemies?.challenge;
    const floor = challenge ? 0 : FIN.hitFloor;
    // NOTES-27-loose: Kihívás armour tier 3 and up divides the harm ("több életerő", modes/rules.js lifeOf).
    p.hunger = Math.min(p.hunger, Math.max(floor, p.hunger - FIN.hitHunger / lifeOf(p)));
    let burnt = null;
    const can = p.bag.map((f, k) => (f.famous || f.keep ? -1 : k)).filter((k) => k >= 0);
    if (can.length) {
      const k = can[Math.floor(Math.random() * can.length)];
      burnt = p.bag[k];
      p.bag.splice(k, 1);
    }
    let dx = p.pos.x - this.head.x;
    let dz = p.pos.z - this.head.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.1) {
      dx = Math.random() - 0.5;
      dz = Math.random() - 0.5;
    }
    const n = Math.hypot(dx, dz) || 1;
    p.knock(dx / n, dz / n, FIN.knock);
    p.kick = 1;
    p.finFlash = 0.6;
    p.say(LINES.hit(Math.round(FIN.hitHunger / lifeOf(p)), burnt?.name), 2.5);
    this.hits = (this.hits || 0) + 1;
    if (challenge && p.hunger <= 0) p.die('Szmaug tüze elért…');
  }

  /* ---------------- the burst and the sky over the garden ---------------- */

  updateRumble(dt) {
    this.t += dt;
    for (const p of this.active()) p.kick = Math.max(p.kick || 0, 0.35 + 0.2 * Math.sin(this.t * 30));
    if (this.t < FIN.rumble) return;
    this.startSky();
  }

  startSky() {
    this.stage = 'sky';
    this.t = 0;
    this.skyA = -Math.PI / 2; // he comes up on the pit's far side, away from the garden
    this.strafeT = -2.5; // the first run comes a little after the burst
    this.help = 0;
    this.plainT = 2;
    this.blackLoosed = false;
    this.bard.show(true, 0);
    this.head.set(0, -6, 0);
    this.dir.set(0, 1, 0);
    const s = this.dragon;
    if (s) {
      s.busy = true;
      s.setPose?.('fly');
      s.setEye?.(1);
      if (!s.root.parent) this.game.scene.add(s.root);
      s.root.visible = true;
    }
    this.sound('roar');
    for (const p of this.active()) {
      p.say(LINES.burst, 3);
      p.kick = 1;
    }
    this.banner(LINES.burst);
    this.helpSaid = false;
  }

  /** Where Smaug flies over the garden this frame (an orbit, with strafing runs at a player). */
  skyPath(dt) {
    this.t += dt;
    const w = (Math.PI * 2) / FIN.orbitPeriod;
    this.skyA += w * dt;
    const orbit = v1.set(Math.cos(this.skyA) * FIN.orbitR, FIN.orbitY + Math.sin(this.skyA * 2) * 2, -10 + Math.sin(this.skyA) * FIN.orbitR * 0.8);
    // The burst: up out of the pit for the first 2.4 s.
    if (this.t < 2.4) {
      const u = this.t / 2.4;
      const e = u * u * (3 - 2 * u);
      return v3.set(orbit.x * e, -6 + (orbit.y + 6) * Math.min(1, u * 1.3), orbit.z * e);
    }
    this.strafeT += dt;
    if (this.strafeT > FIN.strafeEvery && !this.run) {
      const out = this.active().filter((p) => this.isOut(p) && p.dead <= 0 && !this.game.bagEnd?.isInside(p));
      if (out.length) {
        // The one nearest to Bárd (the players who help stand there).
        const b = PLACES.bard;
        out.sort((a, c) => Math.hypot(a.pos.x - b.x, a.pos.z - b.z) - Math.hypot(c.pos.x - b.x, c.pos.z - b.z));
        this.run = { p: out[0], t: 0, lag: out[0].pos.clone() };
      }
      this.strafeT = 0;
    }
    if (!this.run) return v3.copy(orbit);
    const r = this.run;
    r.t += dt;
    // He aims at where the player was 0.6 s ago: moving players can dodge.
    r.lag.lerp(r.p.pos, Math.min(1, dt / 0.6));
    const u = r.t / FIN.strafe;
    const k = Math.sin(Math.min(1, u) * Math.PI);
    const dive = v2.set(r.lag.x + 15 * Math.cos(this.skyA), 12, r.lag.z + 15 * Math.sin(this.skyA));
    const pos = v3.copy(orbit).lerp(dive, k * k);
    if (u > 0.35 && u < 0.72) {
      if (!this.breathing) {
        this.breathing = true;
        this.sound('fire');
      }
      this.aim.copy(this.chest(r.p, v1)).sub(pos).normalize();
      this.aim.lerp(v1.copy(r.lag).setY(r.lag.y + 0.6).sub(pos).normalize(), 0.7).normalize();
    } else this.endBreath();
    if (u >= 1) this.run = null;
    return pos;
  }

  updateSky(dt) {
    const pos = this.skyPath(dt);
    const prev = v2.copy(this.head);
    this.head.copy(pos);
    const mv = prev.sub(this.head).negate();
    const want = this.breathing ? this.aim : mv.lengthSq() > 1e-6 ? mv.normalize() : this.dir;
    this.dir.lerp(want, Math.min(1, dt * 3)).normalize();
    this.place(this.head, this.dir);
    const players = this.active();
    for (const p of players) p.finHitT = Math.max(0, (p.finHitT || 0) - dt);
    if (this.breathing) {
      this.breathe(true);
      if (!this.benchSky) for (const p of players) if (p.dead <= 0 && this.isOut(p)) this.tryHit(p);
    }
    // Bárd follows Smaug with his bow.
    const chest = this.smaugChest(new THREE.Vector3());
    const drawn = this.t > 2.4;
    this.bard.aim(chest, drawn ? 1 : 0.3, dt);
    this.bard.update(dt);
    if (this.t < 2.4 || this.blackLoosed) return;
    // The help (no bare patch): every player out stands by Bárd, unhurt.
    const out = players.filter((p) => this.isOut(p) && p.dead <= 0);
    const b = PLACES.bard;
    const near = out.length > 0 && out.every((p) => Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < FIN.gardenR && !this.game.bagEnd?.isInside(p));
    const recentHit = out.some((p) => p.finLastHit && performance.now() - p.finLastHit < 250);
    if (!this.patch) {
      if (!this.helpSaid) {
        this.helpSaid = true;
        for (const p of out) p.say(LINES.bardNoPatch, 6);
      }
      if (recentHit) this.help = 0;
      else if (near) this.help += dt;
      else this.help = Math.max(0, this.help - dt * 0.5);
      this.plainT -= dt;
      if (this.plainT <= 0 && !this.benchSky) {
        this.plainT = FIN.plainEvery;
        this.bard.shoot(() => this.smaugChest(v3), false, () => {
          this.sound('clink');
          if (!this.bounceSaid) {
            this.bounceSaid = true;
            for (const p of out) p.say(LINES.bounce, 2.5);
          }
        });
        this.sound('twang');
      }
    }
    const ready = this.patch ? this.t > 2.4 + FIN.strafeEvery + FIN.strafe + 1 : this.help >= FIN.helpTime;
    if (ready && !this.benchSky) {
      this.blackLoosed = true;
      for (const p of out) p.say(this.patch ? LINES.bardPatch : LINES.blackArrow, 3);
      this.bard.shoot(() => this.smaugChest(v3), true, () => this.slay());
      this.sound('twang');
    }
  }

  /** The bare patch's place: low on his left breast, between his root and his head. */
  smaugChest(out) {
    const s = this.dragon;
    if (!s) return out.copy(this.head).addScaledVector(this.dir, -3);
    return out.copy(s.root.position).lerp(this.head, 0.6).addScaledVector(UP, -0.6);
  }

  /** The black arrow struck: the held scenes begin. */
  slay() {
    this.endBreath();
    this.slain = true;
    this.stage = 'scene';
    this.scene = { i: 0, t: 0 };
    this.fallFrom = this.head.clone();
    this.fallDir = this.dir.clone();
    this.dragon?.setPose?.('fall');
    this.sound('hit');
    for (const p of this.active()) p.say(LINES.fall, 4);
    this.game.saveNow?.();
  }

  /* ---------------- the held scenes ---------------- */

  /** Places a held player (once per scene step) and keeps him there. */
  holdAt(p, x, z, k) {
    p.finHold = new THREE.Vector3(x + k * 0.9, 0.05, z);
    if (this.game.bagEnd?.isInside(p)) this.game.bagEnd.pass(p, false);
    p.pos.copy(p.finHold);
    p.vel.set(0, 0, 0);
  }

  updateScene(dt) {
    const sc = this.scene;
    sc.t += dt;
    const S = SCENES[sc.i];
    const t = sc.t;
    const players = this.active();
    this.bard.update(dt);
    this.eagles.update(dt);
    this.puffs.update(dt);
    if (S.id === 'fall') {
      // Down beyond Bag End's hill (out of the garden's view), tumbling.
      const u = Math.min(1, t / 4.2);
      const c = PLACES.crash;
      const f = this.fallFrom;
      const x = f.x + (c.x - f.x) * Math.pow(u, 1.2);
      const z = f.z + (c.z - f.z) * Math.pow(u, 1.2);
      const y = f.y + 6 * Math.sin(u * Math.PI * 0.5) * (1 - u) - (f.y + 14) * u * u;
      const prev = v2.copy(this.head);
      this.head.set(x, y, z);
      const d = v1.subVectors(this.head, prev);
      if (d.lengthSq() > 1e-8) this.dir.lerp(d.normalize(), Math.min(1, dt * 2)).normalize();
      this.place(this.head, this.dir);
      this.bard.aim(this.head, Math.max(0, 1 - t), dt);
      // The fall, then the steam rising beyond the hill.
      this.lookAll(this.crashed ? v1.set(PLACES.crash.x, 14, PLACES.crash.z) : this.head);
      if (u >= 1 && !this.crashed) this.crash();
      for (const p of players) p.finCaption = LINES.fall;
    } else if (S.id === 'eagles') {
      if (t < dt * 1.5) this.eagles.show(true);
      this.lookAll(this.eagles.lead || v1.set(0, 30, -8));
      for (const p of players) p.finCaption = LINES.eagles;
    } else if (S.id === 'feast') {
      this.fadeAll(t < 0.6 ? t / 0.6 : t < 1.0 ? 1 : Math.max(0, 1 - (t - 1.0) / 0.6));
      if (t >= 0.6 && !sc.placed) {
        sc.placed = true;
        this.bard.show(false);
        this.eagles.show(false);
        players.forEach((p, k) => this.holdAt(p, INN.x - 1.4, INN.z - 6.2, k));
        this.forceMusic('unnep');
        // The feast crowd in front of the inn (props.js buildAuction's second half; NOTES-17-polish).
        this.auction.showPart('feast');
        this.auction.visible = true;
      }
      this.lookAll(v1.set(INN.x, 2.2, INN.z));
      for (const p of players) p.finCaption = t > 0.8 ? LINES.feast : '';
    } else if (S.id === 'home') {
      const name = players[0]?.ch?.name || 'Bilbó';
      if (t < 0.6) this.fadeAll(t / 0.6);
      else if (t < 5.2) {
        if (!sc.home) {
          sc.home = true;
          this.auction.showPart('auction'); // (NOTES-17-polish: the same mesh drew the feast crowd)
          this.auction.visible = true;
          players.forEach((p, k) => this.holdAt(p, BAG_END.x - 0.2, BAG_END.z - 10.6, k));
        }
        this.fadeAll(Math.max(0, 1 - (t - 0.6) / 0.6));
        this.lookAll(v1.set(BAG_END.x + 1.4, 1.0, BAG_END.z - 4));
        for (const p of players) p.finCaption = LINES.home(name);
      } else if (t < 5.8) this.fadeAll((t - 5.2) / 0.6);
      else if (t < 9.6) {
        if (!sc.over) {
          sc.over = true;
          this.auction.visible = false;
        }
        this.fadeAll(Math.max(0, 1 - (t - 5.8) / 0.6));
        this.lookAll(v1.set(BAG_END.x, 1.2, BAG_END.z));
        for (const p of players) p.finCaption = LINES.auctionOver;
      } else if (t < 10.2) this.fadeAll((t - 9.6) / 0.6);
      else {
        if (!sc.garden) {
          sc.garden = true;
          this.garden.visible = true;
          players.forEach((p, k) => this.holdAt(p, -0.45, 15.6, k));
        }
        this.fadeAll(Math.max(0, 1 - (t - 10.2) / 0.6));
        this.lookAll(v1.set(0, 0.6, 6));
        for (const p of players) p.finCaption = LINES.garden;
      }
    }
    if (sc.t >= S.dur) this.nextScene();
  }

  crash() {
    this.crashed = true;
    // He is dead: out of the world for good (layer 9's hoard-fx stops drawing him once `gone`).
    this.removeSmaug();
    this.puffs.start(v1.set(PLACES.crash.x, 2, PLACES.crash.z), 9);
    this.sound('crash');
    for (const p of this.active()) p.kick = 1;
  }

  /** The skip button, or the end of a scene: the next one (the steps a skipped scene leaves undone are applied). */
  nextScene() {
    const sc = this.scene;
    const id = SCENES[sc.i].id;
    if (id === 'fall' && !this.crashed) this.crash();
    if (id === 'feast' && !sc.placed) this.forceMusic('unnep');
    // The feast crowd goes with its scene (NOTES-17-polish); the home scene shows the auction half again.
    if (id === 'feast') this.auction.visible = false;
    sc.i++;
    sc.t = 0;
    sc.placed = sc.home = sc.over = sc.garden = false;
    if (id === 'eagles' || id === 'fall') this.eagles.show(id === 'fall');
    if (sc.i >= SCENES.length) this.finish();
  }

  /** The end: Smaug out of the world for good, the garden, free play, saved. */
  finish() {
    this.stage = 'done';
    this.done = true;
    this.slain = true;
    this.scene = null;
    this.endBreath();
    this.removeSmaug();
    this.bard.show(false);
    this.eagles.show(false);
    this.auction.visible = false;
    this.garden.visible = true;
    for (const p of this.active()) {
      p.finHold = null;
      p.finCaption = '';
      p.fade = 0;
      p.say(LINES.freePlay, 6);
    }
    this.forceMusic(null);
    // TERV 0.6 "a végén külön trófea": finishing in Kihívás mode puts Bilbo's Red Book into the mathom room (the user's
    // choice, 2026-11-03; the book Bilbo starts writing after the quest, from The Lord of the Rings). [ellenőrizendő]
    if (this.game.enemies?.challenge && this.game.bagEnd?.addTrophy({ id: 'piros-konyv', color: 0xa02a24 })) {
      for (const p of this.active()) p.say('Kihívás teljesítve! Bilbó Piros Könyve a mathom-szoba vitrinjébe került.', 6);
    }
    this.game.saveNow?.();
  }

  removeSmaug() {
    const s = this.game.smaug;
    if (!s || s.gone) return;
    s.breath?.(false);
    s.snore?.(false);
    s.busy = true;
    s.gone = true;
    if (s.root) {
      s.root.visible = false;
      s.root.parent?.remove(s.root);
    }
  }

  fadeAll(f) {
    for (const p of this.active()) {
      p.fade = clamp(f, 0, 1);
      p.fadeColor = '#000';
    }
  }

  lookAll(q) {
    for (const p of this.active()) p.finLook = (p.finLook || new THREE.Vector3()).copy(q);
  }

  /* ---------------- per frame (the game's hooks) ---------------- */

  /** Before the menus: true while a held scene has the player (the skip button is read here). */
  input(p, i, it) {
    if (this.stage !== 'scene' || !this.scene || p.choosing) return false;
    if ((it.confirmPressed || it.backPressed) && !this.skipLock) {
      this.skipLock = true;
      this.nextScene();
    }
    if (p.finHold) {
      p.pos.copy(p.finHold);
      p.vel.set(0, 0, 0);
    }
    if (p.finLook) {
      const e = p.eye(v1);
      const yaw = Math.atan2(-(p.finLook.x - e.x), -(p.finLook.z - e.z));
      const pitch = Math.atan2(p.finLook.y - e.y, Math.hypot(p.finLook.x - e.x, p.finLook.z - e.z));
      const k = Math.min(1, (this.game.lastDt || 1 / 60) * 4 + 0.05);
      p.yaw += wrapA(yaw - p.yaw) * k;
      p.pitch += (clamp(pitch, -1.2, 1.2) - p.pitch) * k;
    }
    return true;
  }

  update(dt) {
    this.hookEvents();
    if (this.squeezing && this.stage !== 'escape') this.unsqueeze(); // NOTES-27-loose
    this.skipLock = false;
    this.game.lastDt = dt;
    this.benchSetup();
    this.patchHint();
    if (this.restored) this.applyRestore();
    switch (this.stage) {
      case 'wake':
        this.t += dt;
        if (this.target) {
          this.dir.lerp(this.chest(this.target, v1).sub(this.head).normalize(), Math.min(1, dt * 2)).normalize();
          this.place(this.head, this.dir);
        }
        if (this.t >= FIN.wakeTime) {
          this.stage = 'escape';
          this.dragon?.setPose?.('fly');
        }
        break;
      case 'escape':
        this.updateEscape(dt);
        this.bard.update(dt);
        break;
      case 'rumble':
        this.updateRumble(dt);
        this.bard.update(dt);
        break;
      case 'sky':
        this.updateSky(dt);
        this.puffs.update(dt);
        break;
      case 'scene':
        this.updateScene(dt);
        break;
      case 'bench-epi':
        this.eagles.update(dt);
        if (this.eagles.t > 14) this.eagles.t = 3.2;
        break;
      default:
        if (this.done && this.game.smaug && !this.game.smaug.gone) this.removeSmaug();
    }
    this.drawUi(dt);
  }

  /** Per view, after the decor has set the fire uniforms: Smaug's fire (or the glow of his embers) on the walls. */
  cullFor(seen, i) {
    void seen;
    void i;
    if (!(this.stage === 'escape' || this.stage === 'wake' || this.stage === 'sky')) return;
    // Bench A/B only: `&finfire=0` leaves the walls unlit.
    if (this.game.bench && this.game.params.get('finfire') === '0') return;
    const arr = FIRE.firePos.value;
    let n = FIRE.fireN.value;
    const t = performance.now() / 1000;
    const add = (x, y, z, w) => {
      const k = n < FIRE_MAX ? n++ : FIRE_MAX - 1;
      arr[k].set(x, y, z, w);
    };
    const fl = 0.85 + 0.1 * Math.sin(t * 23) + 0.05 * Math.sin(t * 41);
    if (this.breathing) {
      for (const d of [1.5, 5, 9]) add(this.head.x + this.aim.x * d, this.head.y + this.aim.y * d, this.head.z + this.aim.z * d, 1.1 * fl);
    } else add(this.head.x, this.head.y, this.head.z, 0.3 * fl);
    FIRE.fireN.value = n;
  }

  /** The music while the finale runs (game.js musicSituation asks first). */
  musicSituation() {
    return this.music || null;
  }

  /** Switches the music at once (Music.update would wait 10 s for a new situation). */
  forceMusic(name) {
    this.music = name;
    const m = this.game.music;
    if (!m || !m.started) return;
    const sit = name || this.game.musicSituation();
    m.wanted = sit;
    m.wantedT = 0;
    m.switchTo(sit);
  }

  /* ---------------- the bare patch (TERV 0.11/22): the thrush of Durin's door tells it ---------------- */

  patchHint() {
    if (this.patch) return;
    const E = this.game.ereborPuzzles;
    const th = E?.thrush;
    if (!th || !E.thrushOn || E.door?.phase !== 'open') return;
    this.game.players.forEach((p, i) => {
      if (this.patch || p.choosing || p.dead > 0 || p.pos.distanceTo(th.position) > 4) return;
      this.learnPatch(p, i);
    });
  }

  learnPatch(p, i) {
    this.patch = true;
    p.say(LINES.thrush, 9);
    this.game.players.forEach((q, k) => this.game.tutorial?.hint?.(k, q, `csupaszfolt-${k}`, LINES.thrushHint, 10));
    void i;
    this.game.saveNow?.();
  }

  /* ---------------- HUD: the chase line, the fire flash, the scene captions ---------------- */

  uiFor(i, p) {
    const el = this.game.huds[i]?.el;
    if (!el) return null;
    let ui = this.ui.get(p);
    if (ui && ui.root === el) return ui;
    ui?.line.remove();
    ui?.cap.remove();
    ui?.flash.remove();
    ui = { root: el, line: document.createElement('div'), cap: document.createElement('div'), flash: document.createElement('div'), text: null, capHtml: null, fl: -1 };
    Object.assign(ui.line.style, {
      position: 'absolute', left: '50%', top: '9%', transform: 'translateX(-50%)', fontSize: '1.15em', fontFamily: 'var(--f-head, Georgia, serif)',
      color: '#ffb070', textShadow: '0 1px 3px #000, 0 0 0.6em #000', pointerEvents: 'none', zIndex: '4', whiteSpace: 'nowrap', textAlign: 'center',
    });
    Object.assign(ui.cap.style, {
      position: 'absolute', left: '50%', bottom: '12%', transform: 'translateX(-50%)', width: 'min(88%, 36em)', padding: '0.6em 1.2em 0.5em',
      textAlign: 'center', fontSize: '1.05em', lineHeight: '1.35', color: 'var(--ink-dark, #3a2614)', fontFamily: 'var(--f-text, Georgia, serif)',
      background: 'var(--tx-parch) center / cover, #e8d6ac', borderRadius: '0.25em', boxShadow: '0 0.3em 1.2em #000d, inset 0 0 2.5em #7a5a2a55',
      pointerEvents: 'none', zIndex: '8', display: 'none',
    });
    Object.assign(ui.flash.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '4', opacity: '0',
      background: 'radial-gradient(ellipse at center, rgba(255,140,40,0) 35%, rgba(255,110,20,0.55) 80%, rgba(160,40,0,0.85) 100%)',
    });
    el.append(ui.flash, ui.line, ui.cap);
    this.ui.set(p, ui);
    return ui;
  }

  drawUi(dt) {
    const g = this.game;
    const shared = g.bindings.some((b) => b.kbm === 'keys2');
    g.players.forEach((p, i) => {
      const ui = this.uiFor(i, p);
      if (!ui) return;
      // The chase line.
      let text = '';
      if (!p.choosing && (this.stage === 'escape' || this.stage === 'wake')) {
        if (this.isOut(p)) text = this.active().some((q) => !this.isOut(q)) ? LINES.outWait : '';
        else if (p === this.target) text = (p.finGap ?? 99) < 7 ? LINES.chaseClose : LINES.chase(p.finGap ?? '…');
        else if (this.target) text = LINES.chasePartner(this.target.finGap ?? '…');
        if (text && this.patch) text += ` · ${LINES.patchKnown}`;
        // The one out first is told how to help a straggler (once).
        if (this.isOut(p) && this.target && !p.finHelpSaid && g.players.length > 1) {
          p.finHelpSaid = true;
          p.say(LINES.helpPartner(this.target.ch?.name || 'A társad'), 7);
        }
      } else if (!p.choosing && this.stage === 'sky' && !this.patch && !this.blackLoosed && this.t > 2.4) {
        const b = PLACES.bard;
        const near = Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < FIN.gardenR;
        text = near ? LINES.bardHelp(Math.min(FIN.helpTime, Math.floor(this.help)), FIN.helpTime) : LINES.bardGoGarden;
      }
      if (text !== ui.text) {
        ui.text = text;
        ui.line.textContent = text;
      }
      // The fire flash (a hit) and the glow when he is close behind.
      p.finFlash = Math.max(0, (p.finFlash || 0) - dt);
      const close = this.stage === 'escape' && p === this.target ? clamp(1 - ((p.finGap ?? 99) - 3) / 8, 0, 0.45) : 0;
      let fl = Math.round(Math.max(close, p.finFlash / 0.6) * 20) / 20;
      if (g.bench && g.params.get('finvig') === '0') fl = 0; // bench A/B only
      if (fl !== ui.fl) {
        ui.fl = fl;
        ui.flash.style.opacity = fl;
      }
      // The scene's caption with the skip button.
      let cap = '';
      if (this.stage === 'scene' && p.finCaption) {
        const k = glyphs(deviceOf(g.bindings[i]), shared);
        cap = `${p.finCaption}<div style="margin-top:0.35em;font-size:0.8em;opacity:0.75">${LINES.skip(`${k.confirm} / ${k.back}`)}</div>`;
      } else if (this.bannerT > 0) cap = `<span style="font-family:var(--f-title);font-size:1.3em;color:#7a1a0a">${this.bannerText}</span>`;
      if (cap !== ui.capHtml) {
        ui.capHtml = cap;
        ui.cap.innerHTML = cap;
        ui.cap.style.display = cap ? 'block' : 'none';
      }
    });
    this.bannerT = Math.max(0, (this.bannerT || 0) - dt);
  }

  banner(text) {
    this.bannerText = text;
    this.bannerT = 2.6;
  }

  /* ---------------- save ---------------- */

  /** { patch: 1, woke: 1, slain: 1, done: 1 }, or undefined when nothing happened. */
  state() {
    const out = {};
    if (this.patch) out.patch = 1;
    if (this.woke) out.woke = 1;
    if (this.slain) out.slain = 1;
    if (this.done) out.done = 1;
    return Object.keys(out).length ? out : undefined;
  }

  restore(s) {
    if (!s) return;
    this.patch = !!s.patch;
    if (s.done) {
      this.done = true;
      this.slain = true;
      this.woke = true;
      this.stage = 'done';
      this.garden.visible = true;
    } else if (s.slain || s.woke) this.restored = s;
  }

  /** A save from the middle of the finale: after the arrow → the end at once; during the escape → it goes on. */
  applyRestore() {
    const s = this.restored;
    if (!this.game.terrain?.loaded || !this.active().length) return;
    this.restored = null;
    if (s.slain) {
      this.finish();
      return;
    }
    const below = this.active().filter((p) => !this.isOut(p));
    if (below.length) this.startEscape(below[0], true);
    else {
      this.woke = true;
      this.startSky();
    }
  }

  /* ---------------- bench (`?fin=escape|arrow|epilogue`, tools/bench.mjs --q) ---------------- */

  /** The bench's scripted players stand still and look at the scene (game.js botIntent asks this first). */
  benchIntent(p, i) {
    if (!this.game.params.get('fin')) return null;
    p.botInit = true;
    const it = emptyIntent();
    if (p.finLook) {
      const e = p.eye(v1);
      const yaw = Math.atan2(-(p.finLook.x - e.x), -(p.finLook.z - e.z));
      const pitch = Math.atan2(p.finLook.y - e.y, Math.hypot(p.finLook.x - e.x, p.finLook.z - e.z));
      it.padLookX = -wrapA(yaw - p.yaw) * 3 + 0.15 * Math.sin(performance.now() / 1300 + i);
      it.padLookY = -(clamp(pitch, -1.2, 1.2) - p.pitch) * 3;
    }
    return it;
  }

  benchSetup() {
    const mode = this.game.params.get('fin');
    if (!mode || this.benchDone || !this.game.bench || !this.game.terrain?.loaded || this.game.players.length < 1) return;
    this.benchDone = true;
    const ps = this.game.players;
    const put = (p, x, y, z) => {
      p.pos.set(x, y + 0.05, z);
      p.vel.set(0, 0, 0);
      p.finHitT = 1e9; // the bench never knocks its players about
    };
    if (mode === 'escape') {
      // On layer 9's sea of gold (two of the exit path's gold points), Smaug pinned in the hall's air 7 m off, breathing
      // in bursts towards them; without the hoard, in Erebor's great hall.
      const gold = (this.hoard?.exitPath || []).filter((q) => q.tag === 'gold');
      const a = gold[1] || { x: -4.6, y: EREBOR_HALL.floor, z: 3.2 };
      const b = gold[2] || { x: a.x + 1.6, y: a.y, z: a.z + 0.4 };
      put(ps[0], a.x, a.y, a.z);
      if (ps[1]) put(ps[1], b.x, b.y, b.z);
      this.startEscape(ps[0], false);
      this.stage = 'escape';
      this.escapeT = 99;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const away = Math.hypot(mx, mz) || 1;
      // Towards the hall's middle (open air over the gold).
      this.benchPin = new THREE.Vector3(mx - (mx / away) * 7, a.y + 3.5, mz - (mz / away) * 7);
      this.head.copy(this.benchPin);
      for (const p of ps) p.finLook = this.benchPin.clone();
      // Bench A/B only: `&finlook=away` turns both views away from Smaug (the hall without him).
      if (this.game.params.get('finlook') === 'away') for (const p of ps) p.finLook.set(2 * p.pos.x - this.benchPin.x, p.pos.y + 1.4, 2 * p.pos.z - this.benchPin.z);
    } else if (mode === 'arrow') {
      const b = PLACES.bard;
      ps.forEach((p, k) => put(p, b.x - 1.5 - k * 1.4, 0, b.z - 2.4));
      this.woke = true;
      this.benchSky = true;
      this.startSky();
      for (const p of ps) p.finLook = new THREE.Vector3(0, 18, -2);
    } else if (mode === 'epilogue') {
      this.auction.visible = true;
      this.garden.visible = true;
      this.eagles.show(true);
      this.stage = 'bench-epi';
      ps.forEach((p, k) => put(p, BAG_END.x - 0.4 + k * 0.9, 0, BAG_END.z - 9));
      for (const p of ps) p.finLook = new THREE.Vector3(BAG_END.x + 0.6, 2.5, BAG_END.z - 2);
    }
  }

  /* ---------------- sounds (synthesised; muted in the bench) ---------------- */

  sound(kind) {
    try {
      if (this.game.decor?.mute || this.game.bench) return;
      if (!this.audio) {
        this.audio = sharedAudio();
        if (!this.audio) return;
        const len = this.audio.sampleRate * 2;
        this.noise = this.audio.createBuffer(1, len, this.audio.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const a = this.audio;
      if (a.state === 'suspended') a.resume();
      const t = a.currentTime;
      const burst = (start, dur, type, f0, f1, vol, q = 1) => {
        const src = a.createBufferSource();
        src.buffer = this.noise;
        const f = a.createBiquadFilter();
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(f0, t + start);
        f.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
        const gn = a.createGain();
        gn.gain.setValueAtTime(0.0001, t + start);
        gn.gain.exponentialRampToValueAtTime(vol, t + start + Math.min(0.08, dur / 4));
        gn.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        src.connect(f).connect(gn).connect(a.destination);
        src.start(t + start);
        src.stop(t + start + dur + 0.05);
      };
      const growl = (start, dur, f0, f1, vol) => {
        const o = a.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t + start);
        o.frequency.linearRampToValueAtTime(f1, t + start + dur);
        const lp = a.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 420;
        const gn = a.createGain();
        gn.gain.setValueAtTime(0.0001, t + start);
        gn.gain.exponentialRampToValueAtTime(vol, t + start + 0.25);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(lp).connect(gn).connect(a.destination);
        o.start(t + start);
        o.stop(t + start + dur + 0.05);
      };
      if (kind === 'roar') {
        growl(0, 2.4, 70, 48, 0.5);
        growl(0.05, 2.2, 104, 66, 0.25);
        burst(0, 2.4, 'lowpass', 900, 160, 0.6);
      } else if (kind === 'fire') burst(0, FIN.fireTime + 0.2, 'bandpass', 700, 260, 0.55, 0.7);
      else if (kind === 'rumble') burst(0, FIN.rumble, 'lowpass', 140, 60, 0.7);
      else if (kind === 'twang') burst(0, 0.18, 'bandpass', 1400, 500, 0.35, 6);
      else if (kind === 'clink') burst(0, 0.08, 'highpass', 3000, 5000, 0.3);
      else if (kind === 'hit') {
        burst(0, 0.12, 'bandpass', 900, 300, 0.5, 3);
        growl(0.1, 2.8, 120, 40, 0.5);
      } else if (kind === 'crash') burst(0, 2.2, 'lowpass', 400, 40, 0.9);
    } catch {
      // Sound is optional (no audio context in tests).
    }
  }
}
