/* ==== exits.js — Gandalf's wares at the Green Dragon (TERV 0.4 "Kijutás", 0.12; NOTES-37-blast-eagles):
   - GANDALF'S FIREWORK CHARGE (the user, 2026-11-10: "eddig Gandalf tűzijátéka vitt fel azonnal, most az robbant"): a
     consumable (the saved `p.rockets` count, the same field as the old rocket; Gandalf's gift at Bag End is one too).
     Crouch + the exit key sets it against the soil in front (or at the feet) and lights it; after CHARGE.fuse seconds
     of a sparking fuse it blasts a sphere of CHARGE.radius out of soil and rock through the ordinary dig path
     (world.js digSphere: the locked shells stay), hurts or knocks back players within CHARGE.harm, wakes goblins and
     the troll cave (enemies.blast) and raises Smaug's noise meter (hoard.addNoise). It refuses in Bag End, shallower
     than MIN_DEPTH, at a built barrel-lift stop and next to any locked set piece. Gandalf's dragon burst over the pit
     is the blast's show.
   - THE EAGLES (called with Gandalf's moth, as in the film): a consumable call priced like the old rocket
     (EAGLE_PRICE each, at most EAGLE_MAX carried, sold from the start); the exit key lifts the caller (and a partner
     close by) out at once from anywhere deeper than MIN_DEPTH and sets them down on the lawn by the inn. Saved per slot
     in this module's own save field (`exits.calls`); a save that bought the old one-off Eagles upgrade (`eagles: true`)
     gets EAGLE_MAX calls. ==== */
import * as THREE from 'three';
import { sharedAudio } from './audio.js';
import { armourOf } from './enemies/armour.js';
import { lifeOf } from './modes/rules.js';
import { SPAWN_POS } from './props.js';
import { FALL } from './safety/index.js';
import { lockTouches } from './underground/sites.js';
import { digSphere, raycast } from './world.js';

export const ROCKET_PRICE = 25;
export const ROCKET_MAX = 5;
/** The Eagles are priced like the charge (the user, 2026-11-10): a call each, at most this many carried. */
export const EAGLE_PRICE = ROCKET_PRICE;
export const EAGLE_MAX = ROCKET_MAX;
/**
 * The blasting charge: `radius` m of soil and rock blasted (the biggest pick scoops 0.95 m), `fuse` s before it goes
 * off, `harm` m from the blast centre to a body's middle that hurts or knocks back, `smaug` noise-meter units (before
 * the treasury's distance factor), `margin` m kept clear of locked set pieces, `reach` m to the soil in front where it
 * is set (else at the feet). The goblins' hearing distance is enemies/index.js BLAST_HEAR (30 m).
 */
export const CHARGE = { radius: 1.8, fuse: 4, harm: 3.4, smaug: 0.6, margin: 1.2, reach: 2.2 };
/** Shallower than this, neither the Eagles (the ladder is quicker) nor a charge (the garden and the houses). */
const MIN_DEPTH = 2.5;
/** Co-op partners this close are lifted by eagles of their own. */
const NEAR = 4;
const PIT_TOP = new THREE.Vector3(0, 0, 0);
/** The dragon's picture plane: up is perpendicular to the line from the burst (~33 m over the pit) to the lawn. */
const TILT_UP = new THREE.Vector3(0, 0.42, 0.91);
/** The Eagles' lift (s): dark by LIFT_OUT, on the lawn, light again by LIFT_IN; the eagle seen leaving until `dur`. */
const LIFT_OUT = 0.55;
const LIFT_IN = 1.5;
const LIFT_DUR = 2.6;

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

/** Gandalf's firework charge as it lies lit on the soil: a red paper bundle with a gold band and a short fuse. */
function buildCharge() {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xb8323a });
  const gold = new THREE.MeshLambertMaterial({ color: 0xe8c050 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2018 });
  for (const [x, z] of [[-0.06, 0], [0.06, 0], [0, 0.09]]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 10), red);
    tube.position.set(x, 0.16, z);
    g.add(tube);
  }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 14), gold);
  band.position.y = 0.17;
  g.add(band);
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 5), dark);
  fuse.position.set(0, 0.39, 0.03);
  fuse.rotation.x = 0.4;
  g.add(fuse);
  g.userData.tip = new THREE.Vector3(0, 0.46, 0.06);
  return g;
}

const PARK_Y = -10000;

/** Shop drawings (the counter's `art`), in the style of ui/art.js: the charge, a bundle of Gandalf's fireworks. */
function chargeSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="90" rx="28" ry="5" fill="#0006"/>
    <g stroke="#4a1418" stroke-width="2"><rect x="30" y="40" width="14" height="48" rx="3" fill="#b8323a"/>
    <rect x="56" y="40" width="14" height="48" rx="3" fill="#b8323a"/><rect x="43" y="34" width="14" height="54" rx="3" fill="#c8424a"/></g>
    <path d="M28 62h44" stroke="#e8c050" stroke-width="6"/>
    <text x="50" y="80" font-size="11" text-anchor="middle" fill="#f4e6c0" font-family="serif">G</text>
    <path d="M50 34q2-10 10-14t8-10" stroke="#2a2018" stroke-width="2.5" fill="none"/>
    <g fill="#ffd27a"><circle cx="68" cy="10" r="4"/><circle cx="78" cy="6" r="2"/><circle cx="74" cy="18" r="1.8"/><circle cx="60" cy="6" r="1.6"/></g></svg>`;
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
    // All sparks (fuse sparks, the blast, the dragon over the pit) in one point cloud: one draw call. Normal blending
    // with a fading alpha, so the colours hold against the bright daytime sky (additive sparks wash out to white there).
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
    this.charges = []; // lit charges: { p, mesh, at, c, t }
    // One charge model per player slot, built now and parked far below the world (visible, so the game's start-up
    // shader warm-up compiles its material: no compile hitch at the first charge).
    this.chargeMeshes = [buildCharge(), buildCharge()];
    for (const m of this.chargeMeshes) {
      m.position.set(0, PARK_Y, 0);
      this.scene.add(m);
    }
    this.eaglePool = []; // the carrying eagles, built at the first call and reused
    this.kept = []; // per slot: { ch, n } the Eagle calls last seen (a slot that left keeps them for the save)
    this.lastBlast = null; // QA / NOTES-37: the last blast's numbers
    this.ui = new Map();
    this.audio = null;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
  }

  /* ---------------- save ---------------- */

  /** This module's save field (save.js `exits`): the Eagle calls per player slot (null: nothing known for the slot). */
  state() {
    const save = this.game.save;
    const n = Math.max(2, save?.slots?.length || 0);
    const calls = [];
    for (let i = 0; i < n; i++) {
      const p = this.game.players[i];
      if (p && !p.choosing) {
        this.initCalls(p);
        calls[i] = p.eagleCalls;
      } else if (this.kept[i]) calls[i] = this.kept[i].n;
      else calls[i] = this.savedCalls(i, save?.slots?.[i]?.ch);
    }
    return { calls };
  }

  /**
   * The Eagle calls the loaded save gives slot i (playing character `ch`): the saved count, or, for a save from before
   * the calls (the old one-off Eagles upgrade bought: `eagles: true`), a full EAGLE_MAX; null when the slot is not that
   * character's (a new player).
   */
  savedCalls(i, ch) {
    const save = this.game.save;
    const slot = save?.slots?.[i];
    if (!slot || !ch || slot.ch !== ch) return null;
    const n = save.exits?.calls?.[i];
    if (Number.isFinite(n)) return Math.max(0, Math.min(EAGLE_MAX, n | 0));
    return slot.eagles ? EAGLE_MAX : 0;
  }

  /** Sets a player's Eagle calls once his character is known: kept from this session, else from the save, else 0. */
  initCalls(p) {
    if (p.eagleCalls !== undefined || p.choosing || !p.ch) return;
    const k = this.kept[p.slot];
    p.eagleCalls = k && k.ch === p.ch.id ? k.n : this.savedCalls(p.slot, p.ch.id) ?? 0;
  }

  /* ---------------- shop ---------------- */

  /** Extra counter rows at the Green Dragon (prices through the counter's `cost`, which applies perks and co-op). */
  shopRows(p, cost) {
    this.initCalls(p);
    const calls = p.eagleCalls || 0;
    return [
      { kind: 'rocket', art: chargeSVG(), label: `Gandalf tűzijáték-töltete (${p.rockets || 0}/${ROCKET_MAX})`, price: cost(ROCKET_PRICE),
        ok: (p.rockets || 0) < ROCKET_MAX, act: () => {
          p.rockets = (p.rockets || 0) + 1;
          p.say(`Töltet a zsebben. A gödörben guggolva teszed le és gyújtod meg (${this.chargeKeys(p)}): utat robbant a földben és a kőben.`, 5);
        } },
      { kind: 'eagles', art: mothSVG(), label: `Gandalf molylepkéje: Sas-hívás (${calls}/${EAGLE_MAX})`, price: cost(EAGLE_PRICE),
        ok: calls < EAGLE_MAX, act: () => {
          p.eagleCalls = (p.eagleCalls || 0) + 1;
          p.say(`A molylepke elhozza a Sasokat, ha hívod őket (${this.keyName(p)}): bárhonnan azonnal kiemelnek a gödörből.`, 5);
        } },
    ];
  }

  /** The exit key of that player's controls. */
  keyName(p) {
    const b = this.game.bindings[p.slot];
    if (b?.kbm === 'mouse') return 'R';
    if (b?.kbm === 'keys2') return 'É';
    return 'a d-pad fel';
  }

  /** The charge's keys: the crouch key held with the exit key. */
  chargeKeys(p) {
    const b = this.game.bindings[p.slot];
    if (b?.kbm === 'mouse') return 'C + R';
    if (b?.kbm === 'keys2') return '. + É';
    return 'LB + d-pad fel';
  }

  /* ---------------- input ---------------- */

  /** A player's exit key (called only when no menu is open): with the crouch key a charge, alone the Eagles. */
  input(p, i, it) {
    if (!it.exitPressed || p.riding || p.dead > 0 || p.choosing) return;
    this.initCalls(p);
    if (it.climbDown) {
      this.placeCharge(p);
      return;
    }
    if (this.game.bagEnd?.isInside(p)) return;
    if (!(p.eagleCalls > 0)) {
      p.say(p.rockets > 0
        ? `Nincs Sas-hívásod (a Zöld Sárkányban vehetsz). A töltetet guggolva gyújtod meg: ${this.chargeKeys(p)}.`
        : 'Nincs Sas-hívásod: a Zöld Sárkányban vehetsz.', 3.5);
      return;
    }
    if (p.depth < MIN_DEPTH) {
      p.say('Ilyen sekélyről a létra is elég.', 2.5);
      return;
    }
    this.callEagles(p);
  }

  /* ---------------- the Eagles ---------------- */

  /** An eagle from the pool (built at the first call; the finale's flight has its own instanced ones). */
  eagleFor(k) {
    while (this.eaglePool.length <= k) {
      const e = buildEagle();
      e.visible = false;
      this.scene.add(e);
      this.eaglePool.push(e);
    }
    return this.eaglePool[k];
  }

  callEagles(p) {
    const game = this.game;
    const riders = game.players.filter((q) => q === p || (q.dead <= 0 && !q.riding && !q.choosing && !q.held && !game.bagEnd?.isInside(q) && q.pos.distanceTo(p.pos) < NEAR));
    p.eagleCalls = Math.max(0, (p.eagleCalls || 0) - 1);
    p.eagleCd = 0;
    for (const q of riders) {
      q.riding = true;
      q.vel.set(0, 0, 0);
    }
    // Two trips can overlap (each player called): the second takes the next two eagles of the pool.
    const base = this.trips.length ? 2 : 0;
    const eagles = riders.map((q, k) => this.eagleFor(base + k));
    this.trips.push({ kind: 'eagles', riders, eagles, t: 0, dur: LIFT_DUR });
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
    q.safeFallT = Math.max(q.safeFallT || 0, 1.5);
  }

  /**
   * The Eagles: the wing beats and their shadow over the rider, dark at once (LIFT_OUT), on the lawn; the light comes
   * back with the eagle that brought him climbing away over the pit.
   */
  eagleTrip(tr, dt) {
    const t = tr.t;
    tr.riders.forEach((q, k) => {
      const e = tr.eagles[k];
      q.vel.set(0, 0, 0);
      q.fadeColor = null;
      if (t < LIFT_OUT) {
        const flick = 0.2 * Math.sin(t * 22);
        q.fade = Math.min(1, t / LIFT_OUT + Math.max(0, flick));
        return;
      }
      if (!tr.landed?.[k]) {
        tr.landed = tr.landed || [];
        tr.landed[k] = true;
        this.land(q, k);
        if (k === 0) this.sound('beat');
      }
      q.fade = Math.max(0, 1 - (t - LIFT_OUT) / (LIFT_IN - LIFT_OUT));
      // The eagle leaves: from over the rider, up and away towards the pit.
      const u = (t - LIFT_OUT) / (tr.dur - LIFT_OUT);
      e.visible = u < 1;
      e.position.set(q.pos.x + 1.5 * k, q.pos.y + 3.2 + u * 9, q.pos.z - 2 - u * 14);
      e.rotation.set(-0.25, 0, 0);
      const flap = Math.sin(t * 6 + k);
      e.userData.wings[0].rotation.z = flap * 0.5;
      e.userData.wings[1].rotation.z = -flap * 0.5;
    });
  }

  /* ---------------- the charge ---------------- */

  /**
   * Where p's charge would go and why not: { at (the charge on the soil), c (the blast centre) } or { refuse: line }.
   * Set against the soil in front within CHARGE.reach (the blast centre 0.7 m into it), else at the feet (the centre a
   * little under the floor).
   */
  chargeSpot(p) {
    const game = this.game;
    if (game.bagEnd?.isInside(p)) return { refuse: 'Zsáklakban nem robbantunk! A töltetet a gödörben tedd le.' };
    if (p.depth < MIN_DEPTH) return { refuse: 'Ilyen sekélyen nem robbanthatsz: a kert és a házak bánnák. Menj lejjebb (legalább 2,5 m).' };
    const o = p.eye(new THREE.Vector3());
    const d = p.forward(new THREE.Vector3());
    const hit = raycast(o, d, CHARGE.reach);
    let at;
    let c;
    if (hit >= 0) {
      at = o.clone().addScaledVector(d, Math.max(0, hit - 0.12));
      c = o.clone().addScaledVector(d, hit + 0.7);
    } else {
      at = new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z);
      c = new THREE.Vector3(p.pos.x, p.pos.y - 0.3, p.pos.z);
    }
    // NOTES-35-lift-doors-bag: a built barrel-lift stop (its locked floor slab and the landing room above it).
    const R = CHARGE.radius + CHARGE.margin;
    for (const b of game.lift?.slabs?.values?.() || []) {
      if (b.off) continue;
      if (c.x > b.x0 - R && c.x < b.x1 + R && c.z > b.z0 - R && c.z < b.z1 + R && c.y > b.y0 - R && c.y < b.y1 + R + 3) {
        return { refuse: 'Itt nem robbanthatsz: a hordólift megállója túl közel van. Odébb tedd le a töltetet.' };
      }
    }
    // Any other locked set piece (the co-op niches, Smaug's gold, the throne room's front, Erebor's guarded walls, ...).
    if (lockTouches(c.x, c.y, c.z, R)) return { refuse: 'Itt nem robbanthatsz: ezt a helyet nem lehet szétrobbantani. Odébb tedd le a töltetet.' };
    return { at, c };
  }

  /** Crouch + exit key: sets p's charge and lights the fuse (one burning charge per player at a time). */
  placeCharge(p) {
    if (!(p.rockets > 0)) {
      p.say('Nincs töltet nálad: a Zöld Sárkányban vehetsz.', 3);
      return false;
    }
    if (this.charges.some((ch) => ch.p === p)) {
      p.say('Már ég egy kanóc! Fuss arrébb!', 2.5);
      return false;
    }
    const spot = this.chargeSpot(p);
    if (spot.refuse) {
      p.say(spot.refuse, 4);
      return false;
    }
    p.rockets--;
    const mesh = this.chargeMeshes[p.slot] || this.chargeMeshes[0];
    mesh.position.copy(spot.at);
    mesh.rotation.set(0, p.yaw, 0);
    this.charges.push({ p, mesh, at: spot.at, c: spot.c, t: 0 });
    p.say(`Ég a kanóc! Fuss arrébb: ${CHARGE.fuse} másodperc!`, 3.5);
    for (const q of this.game.players) {
      if (q !== p && !q.choosing && q.dead <= 0 && q.pos.distanceTo(spot.c) < 14) q.say(`Vigyázz, ${p.ch.name} töltete mindjárt robban!`, 3);
    }
    this.sound('fuse');
    this.game.saveNow?.();
    return true;
  }

  /** Burns the fuses (sparks from the tip); a burnt-out fuse blasts. */
  updateCharges(dt) {
    if (!this.charges.length) return;
    for (const ch of this.charges) {
      ch.t += dt;
      const tip = this.tmp.copy(ch.mesh.userData.tip).applyEuler(ch.mesh.rotation).add(ch.mesh.position);
      for (let k = 0; k < 3; k++) {
        const c = k === 0 ? [1, 1, 0.8] : [1, 0.7, 0.25];
        this.spark(tip.x, tip.y, tip.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 2, 0.25 + Math.random() * 0.3, c, 0.9);
      }
      if (ch.t >= CHARGE.fuse) this.blast(ch);
    }
    this.charges = this.charges.filter((ch) => ch.t < CHARGE.fuse);
  }

  /**
   * The blast: the sphere through the ordinary dig path (one digSphere call, full bite: soil and rock alike; the
   * locked shells stay and the terrain's remesh queue takes the touched chunks as for any dig), the embedded finds in it
   * to the one who lit it, the harm, the noise, the show.
   */
  blast(ch) {
    const game = this.game;
    const { p, c } = ch;
    ch.mesh.position.set(0, PARK_Y, 0);
    const t0 = performance.now();
    const res = digSphere(c.x, c.y, c.z, CHARGE.radius, 255);
    game.laketownEvents?.dug?.(p, c.x, c.y, c.z); // a blast at a layer-7 cavity's breach lets the lake in
    const ms = performance.now() - t0;
    if (game.stats) {
      game.stats.digMs = ms;
      game.stats.digMax = Math.max(game.stats.digMax || 0, ms);
    }
    const found = this.blastFinds(p, c);
    const hurt = [];
    for (const q of game.players) {
      const h = this.harm(q, c);
      if (h) hurt.push({ slot: q.slot, ...h });
    }
    const woke = game.enemies?.blast?.(c, p) || null;
    // Smaug hears it as if made at the blast (his meter's distance factor from there), counted to the one who lit it.
    let smaug = 0;
    if (game.hoard?.addNoise) {
      smaug = game.hoard.addNoise({ pos: c, ch: null, hoardNoise: 0 }, CHARGE.smaug) || 0;
      if (smaug > 0 && game.players.includes(p)) p.hoardNoise = (p.hoardNoise || 0) + smaug;
    }
    // The show: a spray of sparks and clods at the blast, the view shakes for everyone near, the dragon over the pit.
    for (let k = 0; k < 220; k++) {
      const v = this.tmp2.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 9);
      const col = k % 4 === 0 ? [1, 1, 0.85] : k % 4 === 1 ? [1, 0.55, 0.1] : k % 4 === 2 ? [1, 0.8, 0.3] : [0.38, 0.27, 0.16];
      this.spark(c.x, c.y, c.z, v.x, v.y, v.z, 0.5 + Math.random() * 0.8, col, k % 4 === 3 ? 0.97 : 0.92);
    }
    for (const q of game.players) {
      const d = q.pos.distanceTo(c);
      if (d < 25 && !game.bagEnd?.isInside(q)) q.kick = Math.max(q.kick || 0, 1 - d / 25);
    }
    this.startShow();
    this.sound('boom');
    if (game.players.includes(p) && p.dead <= 0 && !hurt.some((h) => h.slot === p.slot)) p.say('BUMM! Gandalf töltete utat robbantott.', 2.5);
    this.lastBlast = { ms: +ms.toFixed(3), removed: +res.removed.toFixed(2), c: c.toArray().map((v) => +v.toFixed(2)), found, hurt, woke, smaug: +smaug.toFixed(3) };
  }

  /** Embedded finds inside the blast: to the one who lit it (famous ones always: they go to Bag End), up to his bag room. */
  blastFinds(p, c) {
    const finds = this.game.finds;
    if (!finds?.items || !this.game.players.includes(p)) return 0;
    let room = (p.bagCap || 0) - p.bag.length - (p.incoming || 0);
    const r2 = (CHARGE.radius + 0.12) ** 2;
    const got = [];
    const left = [];
    for (const it of finds.items) {
      if (it.taken) continue;
      const dx = it.x - c.x;
      const dy = it.y - c.y;
      const dz = it.z - c.z;
      if (dx * dx + dy * dy + dz * dz >= r2) continue;
      // NOTES-44-pickup-edge: the lighter's pickup filter leaves a find where it is (untaken, still gleanable).
      if (p.accepts && !p.accepts(it.type)) {
        left.push(it);
        continue;
      }
      if (!it.type.famous) {
        if (room <= 0) continue;
        room--;
      }
      it.taken = true;
      got.push(it);
    }
    if (left.length) p.leftBehind?.(left);
    for (const f of got) {
      p.incoming = (p.incoming || 0) + 1;
      finds.fly(f, p, () => {
        p.incoming--;
        if (p.dead > 0) return;
        p.bag.push(f.type);
        p.say(`${f.type.name} (${f.type.value} arany)`);
      });
    }
    return got.length;
  }

  /**
   * The blast's harm (the fall rules' scale, safety/index.js): within CHARGE.harm of the blast centre a player is
   * thrown away from it and knocked down, and loses a bite of the plate (more near the centre, × the armour's `hurt`).
   * Normal mode never takes the plate below the fall floor (FALL.normal.floor): a blast alone never kills; in Kihívás
   * (÷ the tier-3 "életerő", lifeOf) an empty plate kills, as a troll's grab does.
   */
  harm(q, c) {
    const game = this.game;
    if (q.dead > 0 || q.choosing || q.riding || game.bagEnd?.isInside(q)) return null;
    const dir = this.tmp.set(q.pos.x, q.pos.y + 0.7, q.pos.z).sub(c);
    const d = dir.length();
    if (d >= CHARGE.harm) return null;
    const k = 1 - d / CHARGE.harm;
    const mult = armourOf(q).hurt ?? 1;
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(Math.sin(q.yaw), 0, Math.cos(q.yaw));
    dir.normalize();
    q.vel.x += dir.x * (3 + 6 * k);
    q.vel.z += dir.z * (3 + 6 * k);
    q.vel.y = Math.max(q.vel.y, 2 + 3 * k);
    q.grounded = false;
    q.knockT = Math.max(q.knockT || 0, 0.5);
    q.downT = Math.max(q.downT || 0, (0.5 + 1.3 * k) * (0.5 + 0.5 * mult));
    q.kick = 1;
    const challenge = !!game.enemies?.challenge;
    const cost = Math.round(((challenge ? 12 + 30 * k : 6 + 14 * k) * mult) / lifeOf(q));
    const before = q.hunger;
    if (challenge) {
      q.hunger = Math.max(0, q.hunger - cost);
      if (q.hunger <= 0) {
        q.die('A töltet robbanása végzett veled.');
        return { d: +d.toFixed(2), lost: Math.round(before), died: true };
      }
    } else q.hunger = Math.min(q.hunger, Math.max(FALL.normal.floor, q.hunger - cost));
    const lost = Math.max(0, Math.round(before - q.hunger));
    q.say(`Elkapott a robbanás!${lost ? ` (−${lost} a tányérból)` : ''}`, 3);
    return { d: +d.toFixed(2), lost, down: +q.downT.toFixed(2), died: false };
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    const game = this.game;
    for (const p of game.players) {
      if (p.eagleCalls === undefined) this.initCalls(p);
      // Remembered per slot for the save (a player who leaves keeps his calls); a new object only on a change.
      const k = this.kept[p.slot];
      if (p.eagleCalls !== undefined && (!k || k.n !== p.eagleCalls || k.ch !== p.ch.id)) this.kept[p.slot] = { ch: p.ch.id, n: p.eagleCalls };
    }
    for (const tr of this.trips) {
      tr.t += dt;
      this.eagleTrip(tr, dt);
      if (tr.t >= tr.dur) {
        for (const q of tr.riders) {
          q.riding = false;
          q.fade = 0;
          q.fadeColor = null;
        }
        for (const e of tr.eagles) e.visible = false;
      }
    }
    this.trips = this.trips.filter((tr) => tr.t < tr.dur);
    this.updateCharges(dt);
    this.updateShows(dt);
    this.updateSparks(dt);
    game.players.forEach((p, i) => this.indicator(i, p));
  }

  /* ---------------- the dragon firework ---------------- */

  /**
   * Launches the dragon firework. Default: out of the pit, the picture facing the lawn by the inn. party/ (NOTES-39-party)
   * passes `{ x, z, toward }`: the launch spot on the ground and the point (THREE.Vector3) the picture faces.
   */
  startShow(opts = null) {
    const rocket = opts ? [opts.x, 1, opts.z] : [PIT_TOP.x, 1, PIT_TOP.z];
    let right = null;
    let up = null;
    if (opts?.toward) {
      // The burst happens ~32.5 m up (the climb below); the picture's right and up are square to the line to the viewers.
      const look = opts.toward.clone().sub(this.tmp.set(rocket[0], 1 + 1.1 * 1.1 * 26, rocket[2])).normalize();
      right = new THREE.Vector3(0, 1, 0).cross(look).normalize();
      up = look.clone().cross(right).normalize();
    }
    this.shows.push({ t: 0, rocket, burst: false, right, up });
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
          const R = s.right;
          const U = s.up;
          const px = (x - 0.5) * sc;
          const py = (y - 2) * sc;
          const tx = R ? cx + px * R.x + py * U.x : cx + px;
          const ty = (R ? cy + px * R.y + py * U.y : cy + py * TILT_UP.y) + (Math.random() - 0.5) * 0.3;
          const tz = R ? cz + px * R.z + py * U.z : cz + py * TILT_UP.z;
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

  /** A small line under the bag: a burning fuse, the charges in the pocket and the Eagle calls, with their keys. */
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
    const lit = this.charges.find((ch) => ch.p === p);
    if (lit) parts.push(`Ég a kanóc: ${Math.max(1, Math.ceil(CHARGE.fuse - lit.t))} mp!`);
    if (p.rockets > 0) parts.push(`Töltet: ${p.rockets} (${this.chargeKeys(p)})`);
    if (p.eagleCalls > 0) parts.push(`Sasok: ${p.eagleCalls} (${this.keyName(p)})`);
    const text = parts.length && !p.choosing ? parts.join(' · ') : '';
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
        src.loop = dur > 0.9; // the noise buffer is 1 s long: the fuse's hiss and the rumble loop it
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
      if (kind === 'fuse') {
        // The fuse's hiss for the whole burn, with a few spits.
        burst(0, CHARGE.fuse, 'highpass', 3000, 5200, 0.07);
        for (let k = 0; k < 10; k++) burst(Math.random() * CHARGE.fuse, 0.04, 'bandpass', 2400, 3600, 0.12, 3);
      } else if (kind === 'boom') {
        // The blast in the rock: a deep thud, the rumble after it, falling grit.
        burst(0, 1.8, 'lowpass', 500, 35, 1.0);
        burst(0.05, 2.6, 'lowpass', 180, 30, 0.6);
        for (let k = 0; k < 18; k++) burst(0.4 + Math.random() * 1.8, 0.05, 'highpass', 1800, 3000, 0.15);
      }
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
