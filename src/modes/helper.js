/* ==== modes/helper.js — the hired dwarf of single play (TERV 0.11/18 "Beorn szabálya: kettesével gyertek … Egyjátékos
   módban egy felfogadott törpe segít helyetted"; NOTES-15-modes). Deliberately minimal, not an AI companion:
   - Hired once at the Green Dragon counter (single play only; TERV 0.2 lists the other dwarves as hireable helpers).
     Dori: in TERV's helper list "Dori cipel"; in the book he is the strong one who carries Bilbo in the goblin tunnels
     (ch. 4–5) and lifts him into the tree (ch. 6) [ellenőrizendő: the chapter details].
   - He walks the player's own trail (points the player stood on, so no path finding and no walking through rock) and
     stops where the trail drops more than a step: at the top of the shaft the player went down. Grounded and out of the
     rope's reach, he "climbs down after you" to the shaft's bottom and walks on; after a lift ride, the rocket or the Eagles
     he is beside the player again.
   - The rope key in single play: Dori belays the player from where he stands, with the same rope as two players
     (safety/: falls paid out at ROPE.catchSpeed, never hurt or kill, in Kihívás mode too; out of reach lets go).
   - Rescues within HELPER.rescue m: he frees the player from a goblin's or a troll's grab, drives off a spider that is
     wrapping him and cuts him out of a spider's cocoon; his line names the captor (rescueLine, NOTES-27-loose).
   - The co-op-only chambers stay shut in single play (TERV 0.5 "Csak co-opban … egyjátékos módban ezek zárva maradnak"):
     Dori does not open them. With two players he waits off-screen (hidden) and comes back when one plays alone.
   - Beorn's rule (coop-actions/, NOTES-23-coop-actions): he is the second pair of hands. He takes the other handle of a
     heavy chest (walking the trail close behind the player), pulls the hoist's other rope on his own rhythm, and holds
     his lantern up while the player digs. coop-actions/ sets his `task` (setTask): `follow` shortens his distance on
     the trail, `at()` puts him on a spot (the hoist) instead of the trail.
   The figure is the Unexpected Party's Dori (home-events/figures.js: the book's hood colours), one draw call. ==== */
import * as THREE from 'three';
import { dwarvesGeometry, DWARF_ARRIVALS } from '../home-events/figures.js';
import { ROPE } from '../safety/index.js';
import { HELPER } from './rules.js';
import { buildLantern } from '../coop-actions/models.js'; // coop-actions (NOTES-23-coop-actions): his lantern

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** The counter's drawing: a hooded dwarf with a coil of rope (viewBox 100 × 100, the style of ui/art.js). */
function doriSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="93" rx="30" ry="5" fill="#0006"/>
    <path d="M30 90V52c0-12 9-20 20-20s20 8 20 20v38z" fill="#3a1a44" stroke="#1e0e24" stroke-width="2"/>
    <path d="M36 34c0-14 28-14 28 0l-4 6H40z" fill="#5a2a6a" stroke="#1e0e24" stroke-width="2"/><path d="M60 30l14 18-10-4z" fill="#5a2a6a"/>
    <circle cx="50" cy="42" r="9" fill="#d0a888"/><path d="M41 46c2 22 16 22 18 0l-9 6z" fill="#7a6a5a" stroke="#3a3028" stroke-width="1.5"/>
    <ellipse cx="72" cy="70" rx="12" ry="9" fill="none" stroke="#9a7a4e" stroke-width="4"/><ellipse cx="72" cy="70" rx="6" ry="4" fill="none" stroke="#9a7a4e" stroke-width="3"/></svg>`;
}

/**
 * NOTES-27-loose: Dori's line for a rescue, by the captor: a troll (trolls/index.js: `isTroll`, its name: Bert, Tom,
 * Vilmos), a spider wrapping the player (mirkwood-foes/), else a goblin (enemies/goblins.js).
 */
export function rescueLine(captor, p) {
  if (captor?.isTroll) return `${HELPER.name} kiszabadított ${captor.name} markából!`;
  if (captor && p?.wrap?.spider === captor) return `${HELPER.name} elzavarta a pókot!`;
  return `${HELPER.name} elkergette a goblint!`;
}

export class Helper {
  constructor(game) {
    this.game = game;
    /** As a player for the rope's HUD line (safety/ overlay: "Kötélen vagy: Dori biztosít"). */
    this.ch = { name: HELPER.name };
    /** Hired at the counter (shared, saved). */
    this.hired = false;
    this.mesh = null;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.trail = [];
    this.ti = 0; // the trail point he stands at (or walks from)
    this.belaying = false;
    this.outT = 0;
    this.heldT = 0;
    this.placed = false;
    this.line = null;
    /** coop-actions (NOTES-23-coop-actions): the Beorn's-rule task { kind, follow?, at? } or null; his raised lantern. */
    this.task = null;
    this.lantern = null;
  }

  /** One player in the game (Dori helps only in single play). */
  get solo() {
    return this.game.players.filter((p) => !p.choosing).length === 1 && this.game.players.length === 1;
  }

  get active() {
    return this.hired && this.solo;
  }

  /** The figure and the rope line, built on hiring (or on loading a game where he is hired). */
  build() {
    if (this.mesh) return;
    const k = DWARF_ARRIVALS.findIndex((d) => d.name === HELPER.name);
    const spots = DWARF_ARRIVALS.map(() => [0, 0, 0]);
    const { geometry, counts } = dwarvesGeometry(spots);
    geometry.setDrawRange(counts[k], counts[k + 1] - counts[k]);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.game.scene.add(this.mesh);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROPE.points * 3), 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ROPE.color }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.game.scene.add(this.line);
    // coop-actions (NOTES-23-coop-actions): the lantern he holds up in his raised hand (no light of its own), hidden.
    this.lantern = buildLantern(this.mesh.material);
    this.lantern.position.set(-0.3, 1.55, 0.22);
    this.mesh.add(this.lantern);
  }

  /** coop-actions (NOTES-23-coop-actions): sets his task; leaving a fixed spot restarts his trail from where he stands. */
  setTask(task) {
    const prev = this.task;
    this.task = task;
    if (prev?.at && !task?.at) {
      this.trail = [this.pos.clone()];
      this.ti = 0;
    }
    if (this.lantern) this.lantern.visible = task?.kind === 'lamp';
  }

  /** coop-actions (NOTES-23-coop-actions): puts him at `pos` with a trail through `pts` (taking a chest's handle). */
  place(pos, pts) {
    this.pos.copy(pos);
    this.trail = pts.map((v) => v.clone());
    this.ti = 0;
    this.placed = true;
  }

  hire() {
    this.hired = true;
    this.build();
    this.placed = false;
  }

  /** The counter row (hud.js rows, single play only). */
  shopRows(p, cost) {
    if (this.hired || this.game.players.length > 1) return [];
    return [{
      kind: 'helper', art: doriSVG(), label: `${HELPER.name} felfogadása: biztosít, kiment, cipel, húz, lámpát tart (egyjátékos)`, price: cost(HELPER.price), ok: true, act: () => {
        this.hire();
        // coop-actions (NOTES-23-coop-actions): Beorn's rule's second pair of hands.
        p.say(`${HELPER.name}, szolgálatodra! Veled tart a gödörbe: a kötél gombbal biztosít, kiment, ha elkapnak, megfogja a nehéz láda másik fülét, húzza a csigasort, és tartja a lámpát.`, 7);
        this.game.saveNow?.();
      },
    }];
  }

  /** Puts him beside the player (a start, after a ride, a respawn). */
  placeBeside(p) {
    const a = p.yaw + Math.PI * 0.75;
    this.pos.set(p.pos.x + Math.sin(a) * 1.4, p.pos.y, p.pos.z + Math.cos(a) * 1.4);
    this.trail = [p.pos.clone()];
    this.ti = 0;
    this.placed = true;
  }

  /** The rope key with no partner (safety/ calls it): Dori takes up the rope, or lets it go. True when handled. */
  ropeKey(p) {
    if (!this.active) return false;
    if (this.belaying) {
      this.belaying = false;
      p.say(`${HELPER.name} elengedte a kötelet.`, 2.5);
      return true;
    }
    if (!this.placed || this.pos.distanceTo(p.pos) > ROPE.len || this.game.bagEnd?.isInside(p)) {
      p.say(`${HELPER.name} túl messze van a kötélhez (${ROPE.len} m).`, 3);
      return true;
    }
    this.belaying = true;
    this.outT = 0;
    p.say(`${HELPER.name} biztosít a kötéllel: ha leesel, megtart.`, 3.5);
    this.game.safety?.log?.('belay-on', p, 0);
    return true;
  }

  /** Is Dori belaying p right now (safety/ landFall)? */
  belays(p) {
    return this.active && this.belaying && this.game.players[0] === p;
  }

  /** Per frame (modes/index.js, only while hired). */
  update(dt) {
    if (!this.mesh) this.build();
    const p = this.game.players[0];
    const on = this.active && p && !p.choosing;
    this.mesh.visible = !!on && this.placed && !p.riding;
    if (!on) {
      this.belaying = false;
      this.line.visible = false;
      return;
    }
    if (p.dead > 0) {
      this.belaying = false;
      this.placed = false;
      this.mesh.visible = false;
      this.line.visible = false;
      return;
    }
    if (!this.placed || p.riding) {
      if (!p.riding) this.placeBeside(p);
      this.line.visible = false;
      return;
    }
    // After a ride (the lift, the rocket, the Eagles) or a respawn: far off at once → he came along.
    if (this.pos.distanceTo(p.pos) > 60) this.placeBeside(p);
    // coop-actions (NOTES-23-coop-actions): a task's fixed spot (the hoist's rope), else the trail at the task's distance.
    const at = this.task?.at?.();
    if (at) {
      this.pos.copy(at);
      tmpB.subVectors(p.pos, this.pos);
      if (tmpB.x * tmpB.x + tmpB.z * tmpB.z > 0.01) this.yaw = Math.atan2(tmpB.x, tmpB.z);
    } else {
      this.trailStep(p);
      this.walk(p, dt, this.task?.follow);
    }
    this.rescue(p, dt);
    this.rope(p, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  /** Records the points the player stood on. */
  trailStep(p) {
    if (!p.grounded || p.climbing || this.game.bagEnd?.isInside(p)) return;
    const last = this.trail[this.trail.length - 1];
    if (last && last.distanceTo(p.pos) < HELPER.crumb) return;
    this.trail.push(p.pos.clone());
    if (this.trail.length > HELPER.crumbs) {
      const cut = this.trail.length - HELPER.crumbs;
      this.trail.splice(0, cut);
      this.ti = Math.max(0, this.ti - cut);
    }
  }

  walk(p, dt, follow = HELPER.follow) {
    const tr = this.trail;
    const dist = this.pos.distanceTo(p.pos);
    if (dist > follow && this.ti < tr.length - 1) {
      const next = tr[this.ti + 1];
      const dy = next.y - tr[this.ti].y;
      if (Math.abs(dy) <= HELPER.step) {
        // Walk on along the trail.
        tmpA.subVectors(next, this.pos);
        const l = tmpA.length();
        const step = HELPER.speed * (dist > 8 ? 1.6 : 1) * dt;
        if (l <= step) {
          this.pos.copy(next);
          this.ti++;
        } else this.pos.addScaledVector(tmpA, step / l);
      } else if (dy > 0 || (p.grounded && dist > ROPE.len * 0.8 && !this.belaying)) {
        // The trail climbs (the player came back up past him), or the player is far below on firm ground: he takes
        // the ladders after the player, to the shaft's bottom (then walks on; the next shaft's top stops him again).
        this.ti++;
        this.pos.copy(tr[this.ti]);
        if (dy < 0) p.say(`${HELPER.name} lemászott utánad.`, 2);
      }
      // Else: the trail drops into a shaft; he waits at its top (where he can belay).
    }
    tmpB.subVectors(p.pos, this.pos);
    if (tmpB.x * tmpB.x + tmpB.z * tmpB.z > 0.01) this.yaw = Math.atan2(tmpB.x, tmpB.z);
  }

  /**
   * Frees the player from a goblin's or a troll's grab, a spider's wrapping or its cocoon when near enough. The line
   * names the captor (NOTES-27-loose: it said "elkergette a goblint" for a troll too).
   */
  rescue(p, dt) {
    const near = this.pos.distanceTo(p.pos) < HELPER.rescue;
    // A grab (goblins.js, trolls/: `p.held`), or a spider still wrapping him (mirkwood-foes/: `p.wrap.spider`).
    const g = p.held || p.wrap?.spider || null;
    if (near && (g || p.cocoon)) {
      this.heldT += dt;
      if (g && this.heldT > HELPER.rescueT[0]) {
        const line = rescueLine(g, p);
        g.hit?.(this.pos.x, this.pos.z, 1, 'pick');
        if (p.held === g) g.release?.();
        p.say(line, 2.5);
        this.heldT = 0;
      } else if (p.cocoon && this.heldT > HELPER.rescueT[1]) {
        this.game.mirkFoes?.freeCocoon?.(p, null);
        p.say(`${HELPER.name} kivágott a gubóból!`, 2.5);
        this.heldT = 0;
      }
    } else this.heldT = 0;
  }

  /** The belay: reach, the paid-out fall, the line from his hands to the player's waist. */
  rope(p, dt) {
    if (!this.belaying) {
      this.line.visible = false;
      return;
    }
    if (this.pos.distanceTo(p.pos) > ROPE.len) {
      this.outT += dt;
      if (this.outT > ROPE.outGrace) {
        this.belaying = false;
        this.line.visible = false;
        p.say('Kifutott a kötél: túl messzire kerültél Doritól.', 3);
        return;
      }
    } else this.outT = 0;
    if (!p.climbing && !p.riding && p.vel.y < -ROPE.catchSpeed) p.vel.y = -ROPE.catchSpeed;
    const A = tmpA.set(this.pos.x + Math.sin(this.yaw) * 0.25, this.pos.y + 0.7, this.pos.z + Math.cos(this.yaw) * 0.25);
    const B = tmpB.set(p.pos.x, p.pos.y + p.eyeH * 0.55, p.pos.z);
    const len = A.distanceTo(B);
    const sag = Math.min(1.4, 0.05 * len) * (1 - Math.min(1, Math.abs(A.y - B.y) / Math.max(0.01, len)) * 0.8);
    const attr = this.line.geometry.attributes.position;
    const n = ROPE.points - 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      attr.setXYZ(k, A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t - sag * 4 * t * (1 - t), A.z + (B.z - A.z) * t);
    }
    attr.needsUpdate = true;
    this.line.visible = true;
  }
}
