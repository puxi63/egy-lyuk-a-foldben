/* ==== lift.js — the barrel lift (TERV 0.4 "Gyorsutazás"): a stop per layer, built once the layer is reached;
   the ride is a short fade (the rope runs in its own narrow shaft), co-op partners close by ride along ==== */
import * as THREE from 'three';
import { digSphere } from './world.js';

/** The lift column (inside the block, near the south edge) and the surface crane beside the pit. */
const COLUMN = { x: -4, z: 9.0 };
export const CRANE_POS = new THREE.Vector3(-4, 0, 13.4);

/**
 * The stops: depth (m below the surface) of the landing floor, the layer it serves, the price of building it.
 * The surface stop always exists.
 */
export const LIFT_STOPS = [
  { id: 'felszin', name: 'Felszín (Zsáklak kertje)', depth: 0, price: 0 },
  { id: 'pince', name: 'Hobbitüregek és pincék · 36 m', depth: 36, price: 60 },
  { id: 'troll', name: 'A trollok barlangja · 91 m', depth: 91, price: 200 },
  // Goblin-town: the landing is at the end of the goblins' lift tunnel off the east gallery (underground/goblin-sites.js
  // TUNNELS 'lift'), so the ride ends inside the town (NOTES-2a).
  { id: 'goblin', name: 'Goblinváros · 173 m', depth: 173, price: 450 },
  // Gollum's lake: the landing is on the lake's northern shore, under the low roof by the wall (the column comes down
  // into the cave's edge there; underground/lake-sites.js LIFT_SPOT, NOTES-3a-lake).
  { id: 'gollam', name: 'Gollam tava · 284 m', depth: 284, price: 750 },
  // The roots of Mirkwood: the landing is on the dry bank of the grotto pool under the Elvenking's halls, where the
  // river from the cellar's trapdoor comes out (underground/mirkwood-sites.js RIVER_EXIT, NOTES-4a-mirkwood).
  { id: 'bakacsin', name: 'Bakacsinerdő · 351 m', depth: 351, price: 1100 },
  // Beneath Lake-town: the landing is in the wharf cave by the old landing stage, where Bárd keeps his stall
  // (underground/laketown-sites.js WHARF, LIFT7, BARD_STALL; NOTES-5a-laketown).
  { id: 'tovaros', name: 'Tóváros alatt · 435 m', depth: 435, price: 1500 },
  // The mines of Erebor: the landing is in the great ramp at the great hall's south door (the ramp passes the column
  // there at the hall's floor; underground/erebor-sites.js LIFT8, NOTES-6a-erebor).
  { id: 'erebor', name: 'Erebor tárnái · 525 m', depth: 525, price: 2100 },
  // Smaug's treasury: the landing at the foot of the spiral stair, where the ledge starts along the hall's south wall
  // (underground/hoard-sites.js LANDING, LIFT9; NOTES-7a-hoard).
  { id: 'kincstar', name: 'Szmaug kincstára · 620 m', depth: 620, price: 3000 },
];

/** Speed tiers (m/s of the ride) and their prices. */
export const LIFT_SPEEDS = [
  { name: 'Kézi csigasor', speed: 4, price: 0 },
  { name: 'Törpe csigasor', speed: 8, price: 120 },
  { name: 'Ellensúlyos hordólift', speed: 16, price: 350 },
];

const NEAR = 2.4; // metres from a station to use it
const FADE = 0.35; // seconds of fade out / in

/** World position of a stop's station (where the barrel waits). */
function stationPos(stop, out = new THREE.Vector3()) {
  if (stop.depth === 0) return out.copy(CRANE_POS);
  return out.set(COLUMN.x, -stop.depth, COLUMN.z);
}

/** A barrel with an open top and iron hoops, a rope above it. */
function buildBarrel(ropeLen) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(0.5 + Math.sin(t * Math.PI) * 0.08, t * 1.1));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), wood);
  body.material.side = THREE.DoubleSide;
  g.add(body);
  for (const y of [0.15, 0.55, 0.95]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.55 + (y === 0.55 ? 0.03 : 0), 0.025, 6, 20), iron);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, ropeLen, 6), new THREE.MeshLambertMaterial({ color: 0xb8a070 }));
  rope.position.y = 1.1 + ropeLen / 2;
  g.add(rope);
  return g;
}

/** The surface crane: two posts, a beam reaching over the pit edge, the pulley wheel and the waiting barrel. */
function buildCrane() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (const dx of [-1.1, 1.1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), wood);
    post.position.set(dx, 1.7, 0);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 0.22), wood);
  beam.position.set(0, 3.4, 0);
  g.add(beam);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), new THREE.MeshLambertMaterial({ color: 0x3a3a3e }));
  wheel.position.set(0, 3.1, 0);
  g.add(wheel);
  const barrel = buildBarrel(1.7);
  barrel.position.set(0, 0, 0);
  g.add(barrel);
  g.position.copy(CRANE_POS);
  return g;
}

export class Lift {
  constructor(scene) {
    this.scene = scene;
    this.built = new Set(['felszin']);
    this.speedTier = 0;
    scene.add(buildCrane());
    this.landings = new Map();
    this.rides = []; // { players, from, to, t, dur, phase }
    this.menus = new Map(); // player → { el, sel }
  }

  /** Builds a stop: carves the landing room into the soil and puts the barrel there. */
  buildStop(stop) {
    if (this.built.has(stop.id)) return;
    this.built.add(stop.id);
    this.carve(stop);
  }

  carve(stop) {
    const p = stationPos(stop);
    // A domed landing room, the floor about at the stop depth.
    digSphere(p.x, p.y + 1.3, p.z, 2.0);
    digSphere(p.x + 1.2, p.y + 1.1, p.z, 1.5);
    if (!this.landings.has(stop.id)) {
      const b = buildBarrel(2.2);
      b.position.set(p.x - 0.9, p.y - 0.6, p.z);
      this.scene.add(b);
      this.landings.set(stop.id, b);
    }
  }

  /** The stop whose station a player stands at, or null. */
  stationAt(pos) {
    for (const s of LIFT_STOPS) {
      if (!this.built.has(s.id)) continue;
      const p = stationPos(s);
      if (Math.hypot(pos.x - p.x, pos.z - p.z) < NEAR && Math.abs(pos.y - (s.depth ? p.y - 0.6 : 0)) < 2.5) return s;
    }
    return null;
  }

  /** The menu rows for a player at a station: rides to built stops, building reached stops, the speed upgrade. */
  rows(game, player, at) {
    const rows = [];
    for (const s of LIFT_STOPS) {
      if (s === at) continue;
      if (this.built.has(s.id)) rows.push({ label: `Utazás: ${s.name}`, price: 0, act: () => this.ride(game, player, at, s) });
      else if ((player.maxDepth || 0) >= s.depth - 1) rows.push({ label: `Megálló építése: ${s.name}`, price: s.price, act: () => this.buildStop(s) });
      else rows.push({ label: `${s.name} (még nem jártál ott)`, price: 0, off: true, act: () => {} });
    }
    const next = LIFT_SPEEDS[this.speedTier + 1];
    if (next) rows.push({ label: `Gyorsabb lift: ${next.name}`, price: next.price, act: () => this.speedTier++ });
    return rows;
  }

  /** Starts a ride; co-op partners within reach of the station ride along. */
  ride(game, player, from, to) {
    const a = stationPos(from);
    const riders = game.players.filter((q) => q === player || (q.dead <= 0 && !q.riding && q.pos.distanceTo(player.pos) < NEAR));
    const dist = Math.abs(to.depth - from.depth) + 4;
    const dur = Math.min(8, 0.8 + dist / LIFT_SPEEDS[this.speedTier].speed);
    for (const q of riders) q.riding = true;
    this.rides.push({ riders, to, t: 0, dur, a });
    for (const q of riders) q.say(`Hordólift: ${to.name}`, 2);
  }

  /** Handles a player's lift menu (returns true while it is open, which freezes movement). */
  input(game, i, it) {
    const player = game.players[i];
    const hud = game.huds[i];
    let m = this.menus.get(player);
    const at = player.riding || player.dead > 0 ? null : this.stationAt(player.pos);
    if (!m) {
      if (at && it.interactPressed && !hud.shopOpen) {
        m = { sel: 0, el: document.createElement('div') };
        m.el.className = 'shop lift-menu';
        hud.el.appendChild(m.el);
        this.menus.set(player, m);
        return true;
      }
      return false;
    }
    if (!at || it.backPressed || it.interactPressed) {
      this.closeMenu(player);
      return false;
    }
    const rows = this.rows(game, player, at);
    if (it.upPressed) m.sel = (m.sel + rows.length - 1) % rows.length;
    if (it.downPressed) m.sel = (m.sel + 1) % rows.length;
    m.sel = Math.min(m.sel, rows.length - 1);
    if (it.confirmPressed || it.digPressed) {
      const r = rows[m.sel];
      if (r.off) player.say('Előbb ásd le magad odáig.');
      else if (r.price > game.money) player.say('Nincs elég aranyad.');
      else {
        game.money -= r.price;
        r.act();
        game.saveNow?.();
        if (player.riding) {
          this.closeMenu(player);
          return true;
        }
      }
    }
    m.el.innerHTML = `<h2>Hordólift</h2><div class="gold">Közös arany: ${game.money} · ${LIFT_SPEEDS[this.speedTier].name}</div>
      ${rows.map((r, k) => `<div class="row ${k === m.sel ? 'sel' : ''} ${r.off ? 'off' : ''}"><span>${r.label}</span><b>${r.price ? `${r.price} arany` : ''}</b></div>`).join('')}
      <div class="hint">Fel/le: választás · A / Enter: indulás, vásárlás · B / Esc: bezárás</div>`;
    return true;
  }

  closeMenu(player) {
    const m = this.menus.get(player);
    if (m) m.el.remove();
    this.menus.delete(player);
  }

  /** Prompt text for a player near a station (for the HUD), or ''. */
  prompt(player) {
    if (this.menus.has(player) || player.riding) return '';
    return this.stationAt(player.pos) ? 'Hordólift: X / E' : '';
  }

  /** Advances the rides: fade out, travel, place the riders at the destination, fade in. */
  update(dt, game) {
    for (const r of this.rides) {
      r.t += dt;
      const fade = r.t < FADE ? r.t / FADE : r.t > r.dur - FADE ? Math.max(0, (r.dur - r.t) / FADE) : 1;
      for (const q of r.riders) {
        q.fade = fade;
        q.vel.set(0, 0, 0);
        // Hold the riders at the start until fully dark, then at the destination.
        if (r.t > FADE && !r.moved) {
          const b = stationPos(r.to);
          r.riders.forEach((p, k) => p.pos.set(b.x + 0.6 + k * 0.7, r.to.depth ? b.y - 0.55 : 0.05, b.z + (r.to.depth ? 0 : 1.2)));
          r.moved = true;
        }
      }
      if (r.t >= r.dur) {
        for (const q of r.riders) {
          q.riding = false;
          q.fade = 0;
        }
      }
    }
    this.rides = this.rides.filter((r) => r.t < r.dur);
    // Deepest point reached per player (a stop can be built once its depth was reached).
    for (const p of game.players) p.maxDepth = Math.max(p.maxDepth || 0, p.depth);
  }

  state() {
    return { built: [...this.built], speedTier: this.speedTier };
  }

  restore(s) {
    if (!s) return;
    this.speedTier = s.speedTier || 0;
    for (const id of s.built || []) {
      const stop = LIFT_STOPS.find((x) => x.id === id);
      if (stop && !this.built.has(id)) {
        this.built.add(id);
        this.carve(stop);
      }
    }
  }
}
