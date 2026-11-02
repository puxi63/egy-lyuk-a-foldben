/* ==== exits.js — the fast ways out of the pit (TERV 0.4 "Kijutás", 0.12): Gandalf's firework rocket (a consumable
   that shoots you up from anywhere and bursts as a dragon over the pit) and the Eagles (an expensive upgrade, called
   with Gandalf's moth as in the film: an eagle lifts you out and circles the pit before setting you down; cooldown) ==== */
import * as THREE from 'three';
import { sharedAudio } from './audio.js';
import { LAYER_TOPS } from './materials.js';
import { SPAWN_POS } from './props.js';

export const ROCKET_PRICE = 25;
export const ROCKET_MAX = 5;
export const EAGLE_PRICE = 900;
export const EAGLE_COOLDOWN = 150;
/** The Eagles are sold once a player has been down to the troll cave layer. */
const EAGLE_UNLOCK = LAYER_TOPS[2];
/** Shallower than this, the ladder is quicker: the exits refuse. */
const MIN_DEPTH = 2.5;
/** Co-op partners this close are lifted by eagles of their own. */
const NEAR = 4;
const PIT_TOP = new THREE.Vector3(0, 0, 0);
/** The dragon's picture plane: up is perpendicular to the line from the burst (~33 m over the pit) to the lawn. */
const TILT_UP = new THREE.Vector3(0, 0.42, 0.91);

const SPARKS = 2400;
const GRAVITY = 9.8;

/* Gandalf's dragon firework (TERV 0.12): a side-view dragon drawn as polylines in metres, head to the right. */
const DRAGON = [
  // Tail, back, neck, head, jaw.
  [[-6.6, 0.9], [-6, 0.5], [-4.5, 1.2], [-3, 0.6], [-1.5, 1], [0, 1.4], [1.5, 1.6], [2.6, 2.6], [3.2, 3.4], [4.2, 3.6], [4.9, 3.2], [4.2, 3], [3.4, 2.9]],
  [[-6.6, 0.9], [-6.3, 0.2], [-6, 0.5]],
  // Belly and throat.
  [[-3, 0.3], [-1.5, 0.5], [0, 0.6], [1.5, 0.9], [2.3, 1.9], [3.4, 2.9]],
  // The raised wing with its fingers and membrane ribs.
  [[0.5, 1.6], [-0.5, 3.5], [-1.2, 5.2], [0.2, 4.4], [1, 4.8], [1.6, 3.6], [2.2, 3.8], [1.6, 2]],
  [[-1.2, 5.2], [0.6, 1.7]],
  [[1, 4.8], [1, 1.7]],
  // Legs and claws.
  [[-1, 0.6], [-1.3, -0.3], [-0.9, -0.5]],
  [[1.2, 0.9], [1.4, -0.2], [1.8, -0.3]],
  // Horns.
  [[3.6, 3.5], [3.3, 4.1]],
  [[3.9, 3.6], [3.8, 4.2]],
];

function dragonPoints(step = 0.12) {
  const out = [];
  for (const line of DRAGON) {
    for (let k = 0; k < line.length - 1; k++) {
      const [ax, ay] = line[k];
      const [bx, by] = line[k + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
      for (let s = 0; s < n; s++) out.push([ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n, out.length % 7 === 0]);
    }
  }
  out.push([4, 3.3, true]); // the eye
  return out;
}

/** A soft round spark sprite. */
function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,240,200,0.9)');
  r.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A Great Eagle as in the films: dark brown, a paler golden head, yellow hooked beak and feet; wings ~7 m.
 * (Exported for the finale's flight of Eagles, finale/props.js.) */
export function buildEagle() {
  const g = new THREE.Group();
  const brown = new THREE.MeshLambertMaterial({ color: 0x4a3018 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e1e10, side: THREE.DoubleSide });
  const gold = new THREE.MeshLambertMaterial({ color: 0xa8804a });
  const yellow = new THREE.MeshLambertMaterial({ color: 0xd8b040 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), brown);
  body.scale.set(1, 0.85, 2.1);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), gold);
  head.position.set(0, 0.32, -1.25);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 8), yellow);
  beak.position.set(0, 0.24, -1.62);
  beak.rotation.x = -Math.PI / 2 - 0.5;
  g.add(beak);
  // Tail fan.
  const tail = new THREE.Shape();
  tail.moveTo(-0.25, 0);
  tail.lineTo(-0.7, 1.3);
  for (let k = 0; k <= 6; k++) tail.lineTo(-0.7 + (1.4 * k) / 6, 1.3 + (k % 2 ? 0.12 : 0));
  tail.lineTo(0.25, 0);
  const tailM = new THREE.Mesh(new THREE.ShapeGeometry(tail), dark);
  tailM.rotation.x = Math.PI / 2;
  tailM.position.set(0, 0.05, 0.95);
  g.add(tailM);
  // Wings: a broad arm and splayed primary feathers, on pivots at the shoulders for the flap.
  const wing = new THREE.Shape();
  wing.moveTo(0, -0.35);
  wing.bezierCurveTo(1.2, -0.6, 2.2, -0.5, 2.6, -0.25);
  const tips = [[3.3, -0.1], [3.05, 0.15], [3.45, 0.25], [3.05, 0.45], [3.3, 0.6], [2.8, 0.7], [2.9, 0.95], [2.3, 0.9]];
  for (const [x, y] of tips) wing.lineTo(x, y);
  wing.bezierCurveTo(1.6, 1.05, 0.8, 0.8, 0, 0.45);
  wing.lineTo(0, -0.35);
  const wingGeo = new THREE.ShapeGeometry(wing);
  wingGeo.rotateX(Math.PI / 2);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.35, 0.18, -0.3);
    const m = new THREE.Mesh(wingGeo, dark);
    m.scale.x = side;
    pivot.add(m);
    g.add(pivot);
    wings.push(pivot);
  }
  // Legs hanging down to the carried hobbit's shoulders.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 6), yellow);
    leg.position.set(side * 0.28, -0.75, 0);
    g.add(leg);
  }
  g.userData.wings = wings;
  return g;
}

/** The talons gripping the carried player's shoulders: seen at the top of that player's own view only. */
function buildTalons(slot) {
  const g = new THREE.Group();
  const yellow = new THREE.MeshLambertMaterial({ color: 0xc89a38 });
  const black = new THREE.MeshLambertMaterial({ color: 0x1a1612 });
  for (const side of [-1, 1]) {
    const foot = new THREE.Group();
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.4, 6), yellow);
    shin.position.y = 0.2;
    foot.add(shin);
    for (let k = 0; k < 3; k++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.13, 5), black);
      claw.position.set((k - 1) * 0.035, -0.04, -0.03);
      claw.rotation.x = Math.PI - 0.6;
      foot.add(claw);
    }
    foot.position.set(side * 0.3, 0.3, -0.45);
    foot.rotation.z = side * 0.35;
    foot.scale.setScalar(0.5);
    g.add(foot);
  }
  g.traverse((o) => o.layers.set(10 + slot));
  return g;
}

/** Shop drawings (the counter's `art`), in the style of ui/art.js. */
function rocketSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(25 50 50)">
    <path d="M50 92V54" stroke="#7a5a30" stroke-width="3"/>
    <path d="M42 30q8-22 16 0v30H42z" fill="#b8323a" stroke="#4a1418" stroke-width="2"/>
    <path d="M42 40h16M42 50h16" stroke="#e8c050" stroke-width="3"/>
    <path d="M42 60l-6 8h28l-6-8z" fill="#2a5a8a" stroke="#14283e" stroke-width="1.5"/>
    <text x="50" y="47" font-size="10" text-anchor="middle" fill="#f4e6c0" font-family="serif">G</text></g>
    <g fill="#ffd27a"><circle cx="22" cy="20" r="2.5"/><circle cx="80" cy="16" r="2"/><circle cx="86" cy="34" r="1.6"/></g></svg>`;
}

function mothSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path d="M50 36c-10-18-34-22-36-8-2 12 14 20 34 18-16 4-28 16-22 26 6 8 20-2 24-18 4 16 18 26 24 18 6-10-6-22-22-26 20 2 36-6 34-18-2-14-26-10-36 8z"
      fill="#c8b48c" stroke="#5a4a30" stroke-width="2"/>
    <path d="M50 34v34" stroke="#4a3a24" stroke-width="5" stroke-linecap="round"/>
    <path d="M48 32q-6-10-12-12M52 32q6-10 12-12" stroke="#4a3a24" stroke-width="1.6" fill="none"/>
    <circle cx="30" cy="30" r="5" fill="#8a7450"/><circle cx="70" cy="30" r="5" fill="#8a7450"/></svg>`;
}

export class Exits {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    // All sparks (rocket trails, bangs, the dragon) in one point cloud: one draw call. Normal blending with a fading
    // alpha, so the colours hold against the bright daytime sky (additive sparks wash out to white there).
    this.pos = new Float32Array(SPARKS * 3);
    this.col = new Float32Array(SPARKS * 4); // rgba: the alpha fades
    this.vel = new Float32Array(SPARKS * 3);
    this.life = new Float32Array(SPARKS);
    this.base = new Float32Array(SPARKS * 3); // the colour at full life
    this.drag = new Float32Array(SPARKS);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, map: sparkTexture(), vertexColors: true, transparent: true, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.scene.add(this.points);
    this.dragon = dragonPoints();
    this.shows = []; // dragon fireworks in progress
    this.trips = []; // players on their way out
    this.ui = new Map();
    this.audio = null;
    this.tmp = new THREE.Vector3();
  }

  /* ---------------- shop and save ---------------- */

  /** Extra counter rows at the Green Dragon (prices through the counter's `cost`, which applies perks and co-op). */
  shopRows(p, cost) {
    const rows = [];
    rows.push({ kind: 'rocket', art: rocketSVG(), label: `Gandalf tűzijáték-rakétája (${p.rockets || 0}/${ROCKET_MAX})`, price: cost(ROCKET_PRICE),
      ok: (p.rockets || 0) < ROCKET_MAX, act: () => {
        p.rockets = (p.rockets || 0) + 1;
        p.say(`Rakéta a zsebben. Bárhonnan kilő a gödörből: ${this.keyName(p)}.`, 4);
      } });
    if (!p.eagles && (p.maxDepth || 0) >= EAGLE_UNLOCK) {
      rows.push({ kind: 'eagles', art: mothSVG(), label: 'Gandalf molylepkéje: hívd a Sasokat', price: cost(EAGLE_PRICE), ok: true, act: () => {
        p.eagles = true;
        p.eagleCd = 0;
        p.say(`A Sasok meghallják a hívásod (${this.keyName(p)}), és bárhonnan kiemelnek.`, 5);
      } });
    }
    return rows;
  }

  /** The exit key of that player's controls. */
  keyName(p) {
    const b = this.game.bindings[p.slot];
    if (b?.kbm === 'mouse') return 'R';
    if (b?.kbm === 'keys2') return 'É';
    return 'a d-pad fel';
  }

  /* ---------------- per frame ---------------- */

  /** A player's exit key (called only when no menu is open). Eagles first when ready, else a rocket. */
  input(p, i, it) {
    if (!it.exitPressed || p.riding || p.dead > 0 || p.choosing) return;
    if (this.game.bagEnd?.isInside(p)) return;
    const eaglesReady = p.eagles && (p.eagleCd || 0) <= 0;
    if (!eaglesReady && !(p.rockets > 0)) {
      p.say(p.eagles ? `A Sasok még pihennek (${Math.ceil(p.eagleCd)} mp), és nincs rakétád.` : 'Nincs rakétád: a Zöld Sárkányban vehetsz.', 3);
      return;
    }
    if (p.depth < MIN_DEPTH) {
      p.say('Ilyen sekélyről a létra is elég.', 2.5);
      return;
    }
    if (eaglesReady) this.callEagles(p);
    else this.launchRocket(p);
  }

  launchRocket(p) {
    p.rockets--;
    p.riding = true;
    this.trips.push({ kind: 'rocket', riders: [p], t: 0, dur: 1.9 });
    p.say('Gandalf rakétája!', 2);
    // A trail of sparks straight up from the player.
    for (let k = 0; k < 160; k++) {
      const c = k % 3 === 0 ? [1, 0.4, 0.2] : k % 3 === 1 ? [1, 0.85, 0.4] : [0.5, 0.7, 1];
      this.spark(p.pos.x + (Math.random() - 0.5) * 0.5, p.pos.y + 0.3 + Math.random() * 0.6, p.pos.z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 3, 6 + Math.random() * 14, (Math.random() - 0.5) * 3, 0.6 + Math.random() * 0.8, c, 0.98);
    }
    this.sound('whoosh');
    this.game.saveNow?.();
  }

  callEagles(p) {
    const game = this.game;
    const riders = game.players.filter((q) => q === p || (q.dead <= 0 && !q.riding && !q.choosing && !game.bagEnd?.isInside(q) && q.pos.distanceTo(p.pos) < NEAR));
    p.eagleCd = EAGLE_COOLDOWN;
    for (const q of riders) q.riding = true;
    const eagles = riders.map((q) => {
      const e = buildEagle();
      e.visible = false;
      this.scene.add(e);
      const talons = buildTalons(q.slot);
      talons.visible = false;
      q.camera.add(talons);
      return { e, talons };
    });
    this.trips.push({ kind: 'eagles', riders, eagles, t: 0, dur: 8.2, a0: Math.atan2(p.pos.x, p.pos.z) });
    for (const q of riders) q.say(riders.length > 1 ? 'A Sasok! Mindkettőtöket kiemelnek.' : 'A Sasok!', 3);
    this.sound('wings');
    game.journal?.mark?.('sasok'); // NOTES-16-smaug-talk: the Eagles flown (Smaug's talk: "guest of eagles")
    game.saveNow?.();
  }

  /** Lands a rider on the lawn by the inn (as a respawn does), facing the pit. */
  land(q, k) {
    q.pos.copy(SPAWN_POS).add(this.tmp.set(q.slot * 1.2 + k * 0.3, 0, 0));
    q.vel.set(0, 0, 0);
    q.yaw = 0;
    q.pitch = -0.1;
  }

  update(dt) {
    const game = this.game;
    for (const p of game.players) if (p.eagleCd > 0) p.eagleCd = Math.max(0, p.eagleCd - dt);
    for (const tr of this.trips) {
      tr.t += dt;
      if (tr.kind === 'rocket') this.rocketTrip(tr);
      else this.eagleTrip(tr, dt);
      if (tr.t >= tr.dur) {
        for (const q of tr.riders) {
          q.riding = false;
          q.fade = 0;
          q.fadeColor = null;
        }
        for (const e of tr.eagles || []) {
          this.scene.remove(e.e);
          e.talons.parent?.remove(e.talons);
        }
      }
    }
    this.trips = this.trips.filter((tr) => tr.t < tr.dur);
    this.updateShows(dt);
    this.updateSparks(dt);
    game.players.forEach((p, i) => this.indicator(i, p));
  }

  /** Rocket: a white flash while the sparks rise, then the lawn, and the dragon bursts over the pit. */
  rocketTrip(tr) {
    const q = tr.riders[0];
    const t = tr.t;
    q.vel.set(0, 0, 0);
    q.fadeColor = '#fff6e0';
    q.fade = t < 0.6 ? t / 0.6 : t < 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / 1);
    q.kick = Math.max(q.kick || 0, t < 0.6 ? 0.8 : 0);
    if (t >= 0.6 && !tr.moved) {
      tr.moved = true;
      this.land(q, 0);
      this.startShow();
    }
  }

  /**
   * Eagles: the shadow and the wing beats reach down into the pit, darkness, then each rider hangs from an eagle that
   * circles the pit (looking down into it) and glides to the inn, where it sets the rider down.
   */
  eagleTrip(tr, dt) {
    const t = tr.t;
    const FLY0 = 1.4;
    const FLY1 = 7.0;
    tr.riders.forEach((q, k) => {
      const { e, talons } = tr.eagles[k];
      q.vel.set(0, 0, 0);
      q.fadeColor = null;
      if (t < FLY0) {
        // The shadow passing over the pit's mouth, then black.
        const flick = 0.25 + 0.2 * Math.sin(t * 9);
        q.fade = t < 1 ? flick * (t / 1) : flick + ((t - 1) / (FLY0 - 1)) * (1 - flick);
        return;
      }
      if (t < FLY1) {
        const u = (t - FLY0) / (FLY1 - FLY0);
        q.fade = u < 0.08 ? 1 - u / 0.08 : u > 0.93 ? (u - 0.93) / 0.07 : 0;
        // Circle the pit, descending, then glide towards the inn.
        const a = tr.a0 + k * Math.PI + u * 3.6;
        const r = 5 + u * 6;
        const circ = this.tmp.set(PIT_TOP.x + Math.sin(a) * r, 26 - u * 16, PIT_TOP.z + Math.cos(a) * r);
        const g = Math.max(0, (u - 0.6) / 0.4);
        const ls = SPAWN_POS;
        q.pos.set(circ.x + (ls.x + k * 1.5 - circ.x) * g * g, circ.y + (3 - circ.y) * g * g, circ.z + (ls.z + 2 - circ.z) * g * g);
        // Look half along the flight, half in towards the pit, down into it.
        q.yaw = a - Math.PI / 4 - g * Math.PI / 4;
        q.pitch = -1.0 + g * 0.65;
        e.visible = true;
        e.position.set(q.pos.x, q.pos.y + q.eyeH + 1.7, q.pos.z);
        // The eagle faces along the circle (banked into it), turning towards the inn for the glide.
        e.rotation.set(0, a - Math.PI / 2 - g * Math.PI / 4, -0.25 * (1 - g));
        const flap = Math.sin(t * 5.5 + k);
        e.userData.wings[0].rotation.z = flap * 0.45;
        e.userData.wings[1].rotation.z = -flap * 0.45;
        talons.visible = true;
        // Both hands hold on: no pick in the view while flying.
        q.viewTool.visible = false;
        if (Math.floor(t * 5.5 / Math.PI / 2) !== Math.floor((t - dt) * 5.5 / Math.PI / 2) && k === 0) this.sound('beat');
        return;
      }
      // Set down: dark for a moment, on the lawn, light again.
      e.visible = false;
      talons.visible = false;
      q.viewTool.visible = true;
      if (!tr.landed?.[k]) {
        tr.landed = tr.landed || [];
        tr.landed[k] = true;
        this.land(q, k);
      }
      q.fade = Math.max(0, 1 - (t - FLY1) / (tr.dur - FLY1));
    });
  }

  /* ---------------- the dragon firework ---------------- */

  startShow() {
    this.shows.push({ t: 0, rocket: [PIT_TOP.x, 1, PIT_TOP.z], burst: false });
  }

  updateShows(dt) {
    for (const s of this.shows) {
      s.t += dt;
      if (s.t < 1.1) {
        // The rocket climbing out of the pit with a spark tail.
        s.rocket[1] = 1 + s.t * s.t * 26;
        for (let k = 0; k < 6; k++) this.spark(s.rocket[0], s.rocket[1], s.rocket[2], (Math.random() - 0.5) * 1.2, -1 - Math.random() * 2, (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.4, [1, 0.8, 0.45], 0.97);
      } else if (!s.burst) {
        s.burst = true;
        this.sound('bang');
        // The dragon: each spark flies from the burst point to its place on the outline, then hangs, flickering.
        const cx = s.rocket[0];
        const cy = s.rocket[1];
        const cz = s.rocket[2];
        const sc = 2.2;
        for (const [x, y, hot] of this.dragon) {
          // The picture's "up" is tilted back so the dragon faces the lawn by the inn, where the players stand.
          const tx = cx + (x - 0.5) * sc;
          const ty = cy + (y - 2) * sc * TILT_UP.y + (Math.random() - 0.5) * 0.3;
          const tz = cz + (y - 2) * sc * TILT_UP.z;
          const c = hot ? [1, 0.92, 0.45] : y > 3.8 || (x > -1.3 && x < 2.3 && y > 1.8) ? [1, 0.5, 0.05] : [0.95, 0.18, 0.04];
          // With the drag k per 1/60 s a spark travels v / (60 (1 − k)) in all: start at the speed that ends on the outline.
          const k = 60 * (1 - 0.86);
          this.spark(cx, cy, cz, (tx - cx) * k, (ty - cy) * k, (tz - cz) * k, 3.6 + Math.random() * 0.8, c, 0.86, true);
        }
        // A ring of plain gold sparks around it.
        for (let k = 0; k < 140; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 7 + Math.random() * 4;
          this.spark(cx, cy, cz, Math.cos(a) * v, Math.sin(a) * v, (Math.random() - 0.5) * 3, 1.4 + Math.random() * 0.8, [1, 0.8, 0.35], 0.96);
        }
      }
    }
    this.shows = this.shows.filter((s) => s.t < 1.2);
  }

  /* ---------------- sparks ---------------- */

  /** One spark; `hang` sparks stop where the drag takes them (the dragon's outline) and only sink slowly. */
  spark(x, y, z, vx, vy, vz, life, c, drag, hang = false) {
    const i = this.next++ % SPARKS;
    const o = i * 3;
    this.pos[o] = x;
    this.pos[o + 1] = y;
    this.pos[o + 2] = z;
    this.vel[o] = vx;
    this.vel[o + 1] = vy;
    this.vel[o + 2] = vz;
    this.life[i] = life;
    this.base[o] = c[0];
    this.base[o + 1] = c[1];
    this.base[o + 2] = c[2];
    this.drag[i] = hang ? -drag : drag;
    this.points.visible = true;
  }

  updateSparks(dt) {
    if (!this.points.visible) return;
    let any = false;
    const f60 = dt * 60;
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      const c4 = i * 4;
      if (this.life[i] <= 0) {
        this.col[c4 + 3] = 0;
        continue;
      }
      any = true;
      this.life[i] -= dt;
      const hang = this.drag[i] < 0;
      const d = Math.pow(Math.abs(this.drag[i]), f60);
      this.vel[o] *= d;
      this.vel[o + 1] = this.vel[o + 1] * d - (hang ? 0.25 : GRAVITY * 0.35) * dt;
      this.vel[o + 2] *= d;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      const fadeK = Math.min(1, this.life[i] * 1.5) * (hang ? 0.75 + 0.25 * Math.sin(this.life[i] * 40 + i) : 1);
      this.col[c4] = this.base[o];
      this.col[c4 + 1] = this.base[o + 1];
      this.col[c4 + 2] = this.base[o + 2];
      this.col[c4 + 3] = fadeK;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    if (!any) this.points.visible = false;
  }

  /* ---------------- HUD line ---------------- */

  /** A small line under the bag: rockets in the pocket and whether the Eagles can be called. */
  indicator(i, p) {
    const el = this.game.huds[i]?.el;
    if (!el) return;
    let ui = this.ui.get(p);
    if (!ui || ui.root !== el) {
      ui = { root: el, line: document.createElement('div'), text: null };
      Object.assign(ui.line.style, {
        position: 'absolute', left: '50%', bottom: '14px', transform: 'translateX(-50%)', fontSize: '14px',
        color: 'var(--gold, #e8c070)', textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '3', whiteSpace: 'nowrap',
      });
      el.appendChild(ui.line);
      this.ui.set(p, ui);
    }
    const parts = [];
    if (p.rockets > 0) parts.push(`Rakéta: ${p.rockets}`);
    if (p.eagles) parts.push(p.eagleCd > 0 ? `Sasok: ${Math.ceil(p.eagleCd)} mp` : 'Sasok: hívhatók');
    const text = parts.length && !p.choosing ? `${parts.join(' · ')} — ${this.keyName(p)}` : '';
    if (text !== ui.text) {
      ui.text = text;
      ui.line.textContent = text;
    }
  }

  /* ---------------- sounds ---------------- */

  sound(kind) {
    try {
      if (!this.audio) {
        this.audio = sharedAudio();
        const len = this.audio.sampleRate;
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
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(vol, t + start + Math.min(0.05, dur / 4));
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        src.connect(f).connect(g).connect(a.destination);
        src.start(t + start);
        src.stop(t + start + dur + 0.05);
      };
      if (kind === 'whoosh') burst(0, 1.2, 'bandpass', 300, 3200, 0.5, 2);
      else if (kind === 'bang') {
        burst(0, 0.9, 'lowpass', 900, 60, 0.9);
        // The crackle afterwards.
        for (let k = 0; k < 26; k++) burst(0.3 + Math.random() * 1.6, 0.03, 'highpass', 2500, 4000, 0.25);
      } else if (kind === 'wings') for (let k = 0; k < 3; k++) burst(k * 0.45, 0.4, 'lowpass', 500, 120, 0.6);
      else if (kind === 'beat') burst(0, 0.45, 'lowpass', 420, 110, 0.35);
    } catch {
      /* audio unavailable */
    }
  }
}
