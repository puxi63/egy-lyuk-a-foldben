/* ==== minigames/smoke.js — the smoke-ring contest (TERV 0.11/14: "Pipafüst-verseny Gandalffal este a padon: ki fúj
   szebb füstkarikát (Gandalf füsthajói). A győztes másnapra erősítést kap (gyorsabb ásás)."; 0.7 "este pipázás a
   padon"; NOTES-1c: `bagEnd.effects.smokeRings` = Bilbo's pipe in the parlour). Book ch. 1: Bilbo and Gandalf blow
   smoke rings at Bag End's door; Gandalf's rings are the bigger ones, and he sends a smaller ring through a big one
   [ellenőrizendő: the passage's Hungarian wording]. The smoke ship is the films' (LotR), left out.
   - Where / when: at the bench by Bag End's round door, in the evening of the day clock (isEvening: 17:30–21:00),
     once per game day, with Bilbo's pipe bought (parlour slot "Pipa és teázóasztalka", any tier).
   - Gandalf stands by the bench (a simple figure: grey cloak, tall pointed blue hat, white beard, staff, pipe —
     book ch. 1; built at start, hidden until the contest).
   - Three rounds. Hold the dig key to draw on the pipe (the bowl glows, a meter fills); release inside the marked zone
     to blow a fine ring (scored 0–10 by how close to the zone's middle); too little = a feeble puff, too much = a
     cough (0). The ring rises from the player's view (3D torus, a pooled mesh). Then Gandalf blows his (scored by a
     seeded draw, 7.2–9.5), in the last round a big ring with a small one sent through it.
   - Co-op: a partner within 4 m of the bench plays the same rounds at once, each in his own viewport.
   - The winner (the highest total; a player must beat Gandalf; players level with each other both win) gets faster
     digging for the next day: the dig key's cooldown ×0.8 until the end of the next game day (player.js hook
     `minigames.digMult`). Losing: nothing. The back key leaves. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GOLD, head, keysOf, meter, painted, rng, sound } from './common.js';

export const SMOKE = {
  bench: { x: -5.0, z: 22.78 }, // the bench in front of Bag End (surface/bagend.js: local −3.0, face + 0.45; yaw π)
  reach: 1.7, // m from the bench's middle
  join: 4, // m: a co-op partner who joins
  rounds: 3,
  draw: 0.42, // meter per second while drawing
  zone: 0.16, // the zone's width
  timeout: 9, // s per draw
  gandalf: [7.2, 9.5], // his score per round
  buff: 0.8, // dig cooldown multiplier of the winner
  ringLife: 4.6,
  over: 3,
};

/** Gandalf, standing (book ch. 1: "a tall pointed blue hat, a long grey cloak, a silver scarf … a long white beard";
 *  a staff and a pipe). Local: faces +z, feet at 0. */
function gandalfGeometry() {
  const P = [];
  const add = (geo, hex) => P.push(painted(geo, hex));
  const robe = new THREE.CylinderGeometry(0.17, 0.36, 1.32, 12);
  robe.translate(0, 0.66, 0);
  add(robe, 0x86868a);
  const chest = new THREE.SphereGeometry(0.21, 12, 9);
  chest.scale(1.05, 1.05, 0.8);
  chest.translate(0, 1.3, 0);
  add(chest, 0x86868a);
  for (const s of [-1, 1]) {
    const boot = new THREE.SphereGeometry(0.08, 8, 6);
    boot.scale(0.9, 0.55, 1.6);
    boot.translate(s * 0.1, 0.04, 0.12);
    add(boot, 0x1a1816);
    const arm = new THREE.CylinderGeometry(0.06, 0.085, 0.62, 8);
    arm.rotateZ(s * 0.22);
    arm.rotateX(s > 0 ? -0.7 : -0.2);
    arm.translate(s * 0.26, 1.12, s > 0 ? 0.14 : 0.04);
    add(arm, 0x7a7a7e);
    const hand = new THREE.SphereGeometry(0.045, 7, 5);
    hand.translate(s * 0.32, s > 0 ? 0.95 : 0.84, s > 0 ? 0.36 : 0.12);
    add(hand, 0xd2b298);
  }
  const scarf = new THREE.TorusGeometry(0.12, 0.035, 6, 14);
  scarf.rotateX(Math.PI / 2);
  scarf.translate(0, 1.45, 0.01);
  add(scarf, 0xc8ccd6);
  const headG = new THREE.SphereGeometry(0.11, 12, 9);
  headG.translate(0, 1.6, 0.02);
  add(headG, 0xd8b8a0);
  const nose = new THREE.SphereGeometry(0.025, 6, 5);
  nose.scale(0.9, 1, 1.4);
  nose.translate(0, 1.6, 0.13);
  add(nose, 0xc8a088);
  const beard = new THREE.ConeGeometry(0.12, 0.55, 10);
  beard.rotateX(Math.PI);
  beard.translate(0, 1.27, 0.09);
  add(beard, 0xe6e6e0);
  const brows = new THREE.BoxGeometry(0.16, 0.025, 0.03);
  brows.translate(0, 1.65, 0.105);
  add(brows, 0xe6e6e0);
  const brim = new THREE.CylinderGeometry(0.3, 0.3, 0.015, 18);
  brim.translate(0, 1.7, 0);
  add(brim, 0x4e5a74);
  const cone = new THREE.ConeGeometry(0.13, 0.6, 12);
  cone.rotateX(-0.18);
  cone.translate(0, 2.0, -0.05);
  add(cone, 0x56627e);
  const staff = new THREE.CylinderGeometry(0.022, 0.028, 1.85, 6);
  staff.translate(-0.33, 0.92, 0.12);
  add(staff, 0x6a4a2a);
  // The pipe from the beard's side, held in the right hand.
  const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5);
  stem.rotateX(Math.PI / 2 - 0.5);
  stem.translate(0.08, 1.46, 0.27);
  add(stem, 0x8a6238);
  const bowl = new THREE.CylinderGeometry(0.03, 0.022, 0.06, 8);
  bowl.translate(0.1, 1.38, 0.43);
  add(bowl, 0x5a3a20);
  const g = mergeGeometries(P);
  g.computeVertexNormals();
  return g;
}

const mouthOf = new THREE.Vector3();

export class Smoke {
  constructor(mg) {
    this.mg = mg;
    this.game = mg.game;
    this.runs = new Map(); // player → run
    this.session = null;
    this.lastDay = null;
    this.buffs = {}; // slot → the last game day the faster digging lasts
    const root = this.game.scene.getObjectByName('surface-root') || this.game.scene;
    const B = SMOKE.bench;
    this.gandalf = new THREE.Mesh(gandalfGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.gandalf.name = 'minigame-gandalf';
    // In front of the bench's right end, on the garden path, turned towards the players.
    this.gandalf.position.set(B.x + 1.5, 0, B.z - 1.7);
    this.gandalf.rotation.y = Math.atan2(-1.5, 1.7);
    this.gandalf.visible = false;
    root.add(this.gandalf);
    // The ring pool: torus meshes, each with its own fading material (one program).
    const geo = new THREE.TorusGeometry(0.1, 0.022, 8, 28);
    this.rings = [];
    for (let k = 0; k < 10; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xdcdcd4, transparent: true, opacity: 0, depthWrite: false }));
      m.name = 'minigame-smoke-ring';
      m.visible = false;
      m.renderOrder = 3;
      root.add(m);
      this.rings.push({ m, life: 0, max: 1, vel: new THREE.Vector3(), q: 1, s0: 1, s1: 2, wob: 0 });
    }
    this.liveRings = 0;
  }

  today() {
    return this.game.dayClock?.day?.() ?? 1;
  }

  evening() {
    return !!this.game.dayClock?.isEvening?.();
  }

  near(p, r = SMOKE.reach) {
    return p.pos.y > -1 && p.pos.y < 3 && Math.hypot(p.pos.x - SMOKE.bench.x, p.pos.z - SMOKE.bench.z) < r;
  }

  holds(p) {
    return this.runs.has(p);
  }

  get running() {
    return this.runs.size > 0 || this.liveRings > 0;
  }

  /** Faster digging for the winner (player.js multiplies the dig cooldown). */
  digMult(p) {
    const until = this.buffs[p.slot];
    return until != null && until >= this.today() ? SMOKE.buff : 1;
  }

  prompt(p, i) {
    if (!this.near(p) || this.game.bagEnd?.isInside(p)) return '';
    if (!this.evening()) return 'A pad: este (napnyugtakor) pipafüst-verseny Gandalffal';
    if (this.lastDay === this.today()) return 'Ma este már fújtatok füstkarikát (holnap este újra)';
    return `Pipafüst-verseny Gandalffal: ${keysOf(this.game, i).use}`;
  }

  tryStart(p, i) {
    if (!this.near(p) || this.game.bagEnd?.isInside(p)) return false;
    if (this.runs.size) return true;
    if (!this.evening()) {
      p.say('Gandalf este jön: napnyugtakor gyere a padhoz (nézd a tányér melletti nap–hold korongot).', 3.5);
      return true;
    }
    if (this.lastDay === this.today()) {
      p.say('Ma este már volt füstkarika-verseny. Holnap este újra!', 2.5);
      return true;
    }
    if (this.game.bagEnd?.effects && !this.game.bagEnd.effects.smokeRings) {
      p.say('Nincs pipád! Zsáklak nappalijában: „Pipa és teázóasztalka”.', 3.5);
      return true;
    }
    this.start(p);
    return true;
  }

  start(p) {
    const players = [p, ...this.game.players.filter((q) => q !== p && !q.choosing && q.dead <= 0 && !this.mg.busy(q) && this.near(q, SMOKE.join))];
    const r = rng((this.today() * 2654435761) >>> 0);
    this.session = {
      round: 0, phase: 'draw', t: 0, zones: Array.from({ length: SMOKE.rounds }, () => 0.55 + r() * 0.25),
      gandalf: Array.from({ length: SMOKE.rounds }, () => +(SMOKE.gandalf[0] + r() * (SMOKE.gandalf[1] - SMOKE.gandalf[0])).toFixed(1)),
      gScores: [], done: false, over: 0, result: '',
    };
    this.lastDay = this.today();
    this.gandalf.visible = true;
    players.forEach((q, k) => {
      const i = this.game.players.indexOf(q);
      this.runs.set(q, { i, k, fill: 0, drawing: false, blown: false, scores: [], msg: '', seat: SMOKE.bench.x + (k ? 0.4 : -0.4) });
      this.mg.hint(q, i, 'smoke', `<b style="${GOLD}">Pipafüst-verseny Gandalffal.</b> Tartsd nyomva (${keysOf(this.game, i).act}): szívod a pipát; engedd el, amikor a mérő a zöld sávban van — ott lesz a legszebb a füstkarika. Három kör. A győztes másnapra gyorsabban ás. Kilépés: ${keysOf(this.game, i).back}.`, 12);
    });
    for (const q of players) q.say(players.length > 1 ? 'Gandalf leül mellétek a padhoz: ki fúj szebb füstkarikát?' : 'Gandalf megáll a padnál: ki fúj szebb füstkarikát?', 3);
    return true;
  }

  input(p, i, it) {
    const r = this.runs.get(p);
    if (!r) return false;
    if (it.backPressed) {
      this.leave(p);
      p.say('Felálltál a padról.', 2);
      return true;
    }
    const S = this.session;
    if (S.phase !== 'draw' || r.blown) return true;
    if (it.dig) {
      r.drawing = true;
      r.fill += SMOKE.draw * (this.lastDt || 1 / 60);
      if (r.fill > 1.02) this.blow(p, r);
    } else if (r.drawing && r.fill > 0.04) this.blow(p, r);
    return true;
  }

  /** Releases the draw: scores the ring and sends it up. */
  blow(p, r) {
    const S = this.session;
    const c = S.zones[S.round];
    let score;
    if (r.fill > 1) {
      score = 0;
      r.msg = 'Köhögsz! Túl sokat szívtál.';
      sound(this.game, 'cough');
    } else {
      score = Math.max(0, Math.min(10, +(10 - Math.abs(r.fill - c) * 40).toFixed(1)));
      r.msg = score >= 9 ? 'Gyönyörű, kerek füstkarika!' : score >= 6.8 ? 'Szép füstkarika.' : r.fill < c ? 'Csak egy gyenge pöffenés…' : 'Szétfoszló, kusza karika…';
      sound(this.game, 'puff');
      p.eye(mouthOf);
      const f = p.forward(new THREE.Vector3());
      mouthOf.addScaledVector(f, 0.7);
      mouthOf.y -= 0.05;
      this.spawnRing(mouthOf, f.multiplyScalar(0.7).add(new THREE.Vector3(0, 0.25, 0)), score / 10, 0.8);
    }
    r.scores.push(score);
    r.blown = true;
    r.drawing = false;
  }

  spawnRing(pos, vel, q, size) {
    const R = this.rings.find((x) => x.life <= 0) || this.rings[0];
    R.life = R.max = q > 0.6 ? SMOKE.ringLife : 1.2 + q * 2;
    R.q = q;
    R.vel.copy(vel);
    R.s0 = size;
    R.s1 = size * (q > 0.6 ? 2.6 : 1.8);
    R.wob = Math.random() * 6;
    R.m.position.copy(pos);
    R.m.lookAt(pos.clone().add(vel));
    R.m.visible = true;
    this.liveRings = this.rings.filter((x) => x.life > 0).length;
  }

  /** Gandalf's ring(s) from his mouth over the garden. */
  gandalfBlows(last) {
    const g = this.gandalf;
    const m = new THREE.Vector3(0.1, 1.5, 0.3).applyEuler(g.rotation).add(g.position);
    const dir = new THREE.Vector3(0.25, 0.55, -0.8).normalize();
    this.spawnRing(m, dir.clone().multiplyScalar(0.5), 1, 1.7);
    if (last) setTimeout(() => this.runs.size && this.spawnRing(m, dir.clone().multiplyScalar(0.95), 1, 0.7), 450);
    sound(this.game, 'puff');
  }

  leave(p) {
    this.runs.delete(p);
    this.mg.overlay.box(p, this.game.players.indexOf(p), '');
    if (!this.runs.size) {
      this.session = null;
      this.gandalf.visible = false;
    }
  }

  update(dt) {
    this.lastDt = dt;
    if (this.liveRings > 0) this.rings_(dt);
    if (!this.runs.size) return;
    const S = this.session;
    S.t += dt;
    for (const [p, r] of this.runs) {
      if (p.dead > 0 || p.choosing) {
        this.leave(p);
        continue;
      }
      // Seated on the bench: the view from the seat, looking out over the garden (Gandalf on the right).
      p.pos.set(r.seat, Math.max(p.pos.y, 0.02), SMOKE.bench.z - 0.5);
      p.vel.set(0, 0, 0);
      p.yaw = -0.32;
      p.pitch = 0.12;
      p.camera.position.set(r.seat, 0.45 + (p.eyeH || 1) * 0.62, SMOKE.bench.z - 0.06);
      if (S.phase === 'draw' && !r.blown && S.t > SMOKE.timeout) this.blow(p, r);
    }
    if (!this.runs.size) return;
    const all = [...this.runs.values()];
    if (S.phase === 'draw' && all.every((r) => r.blown)) {
      S.phase = 'gandalf';
      S.t = 0;
    } else if (S.phase === 'gandalf') {
      if (S.gScores.length === S.round && S.t > 0.8) {
        S.gScores.push(S.gandalf[S.round]);
        this.gandalfBlows(S.round === SMOKE.rounds - 1);
      }
      if (S.t > 2.6) {
        S.round++;
        if (S.round >= SMOKE.rounds) this.finish();
        else {
          S.phase = 'draw';
          S.t = 0;
          for (const r of all) {
            r.fill = 0;
            r.blown = false;
            r.drawing = false;
            r.msg = '';
          }
        }
      }
    } else if (S.phase === 'over') {
      S.over += dt;
      if (S.over > SMOKE.over) for (const p of [...this.runs.keys()]) this.leave(p);
    }
  }

  rings_(dt) {
    let n = 0;
    for (const R of this.rings) {
      if (R.life <= 0) continue;
      R.life -= dt;
      if (R.life <= 0) {
        R.m.visible = false;
        R.m.material.opacity = 0;
        continue;
      }
      n++;
      const u = 1 - R.life / R.max;
      R.m.position.addScaledVector(R.vel, dt);
      R.vel.multiplyScalar(1 - dt * 0.25);
      const s = R.s0 + (R.s1 - R.s0) * u;
      const w = R.q > 0.6 ? 1 : 1 + Math.sin(R.wob + u * 9) * 0.35 * (1 - R.q);
      R.m.scale.set(s * w, (s / w) * (R.q > 0.6 ? 1 : 0.7), s * (R.q > 0.6 ? 1 : 1.6));
      R.m.material.opacity = (R.q > 0.6 ? 0.6 : 0.35) * Math.min(1, u * 8) * (1 - u);
    }
    this.liveRings = n;
  }

  finish() {
    const S = this.session;
    S.phase = 'over';
    S.over = 0;
    const gTotal = +S.gScores.reduce((a, b) => a + b, 0).toFixed(1);
    const totals = [...this.runs].map(([p, r]) => [p, r, +r.scores.reduce((a, b) => a + b, 0).toFixed(1)]);
    const best = Math.max(...totals.map((x) => x[2]));
    const until = this.today() + 1;
    for (const [p, r, tot] of totals) {
      r.total = tot;
      if (tot === best && tot > gTotal) {
        this.buffs[p.slot] = until;
        r.won = true;
        r.msg = `Nyertél (${tot} – Gandalf ${gTotal})! Holnapra erőt ad: holnap estig gyorsabban ásol.`;
        sound(this.game, 'win');
      } else {
        r.won = false;
        r.msg = tot > gTotal ? `Szép volt (${tot}), de a társad jobb volt.` : `Gandalf nyert (${gTotal} – ${tot}). Az ő karikái a nagyobbak.`;
      }
      p.say(r.msg, 4.5);
    }
    S.result = { gandalf: gTotal, totals: totals.map((x) => x[2]) };
    this.game.saveNow?.();
  }

  html(p, i, g) {
    const r = this.runs.get(p);
    if (!r) return '';
    const S = this.session;
    const others = [...this.runs].filter(([q]) => q !== p);
    const sum = (a) => a.reduce((x, y) => x + y, 0).toFixed(1);
    const row = (name, sc) => `<span style="display:inline-block;margin:0 0.5em"><b>${name}</b>: ${sc.map((v) => v.toFixed(1)).join(' · ') || '–'} (${sum(sc)})</span>`;
    const scores = `<div style="font-size:0.88em;margin-top:0.25em">${row('Te', r.scores)}${others.map(([q, o]) => row(q.ch.name, o.scores)).join('')}${row('Gandalf', S.gScores)}</div>`;
    let body = '';
    if (S.phase === 'over') body = `<div style="font-weight:bold;font-style:italic;color:${r.won ? '#2a5a1a' : '#7a2a10'};margin-top:0.2em">${r.msg}</div>`;
    else if (S.phase === 'draw' && !r.blown) {
      const c = S.zones[S.round];
      body = `<div>${S.round + 1}. kör / ${SMOKE.rounds} · ${r.drawing ? 'szívod a pipát…' : 'tartsd nyomva a szíváshoz'}</div>${meter(r.fill, c - SMOKE.zone / 2, c + SMOKE.zone / 2, '#8a3a10')}
        <div style="font-size:0.85em;color:#5a4a34">${g.dig} nyomva: szívás · elengedve: karika · ${g.back} kilépés</div>`;
    } else body = `<div>${S.round + 1}. kör / ${SMOKE.rounds}</div><div style="font-style:italic">${r.msg}${S.phase === 'gandalf' ? ' — most Gandalf fúj…' : others.length ? ' — a társadra vársz…' : ''}</div>`;
    return head('Pipafüst-verseny Gandalffal') + body + scores;
  }

  state() {
    const out = {};
    if (this.lastDay != null) out.d = this.lastDay;
    const b = Object.fromEntries(Object.entries(this.buffs).filter(([, v]) => v >= this.today()));
    if (Object.keys(b).length) out.b = b;
    return Object.keys(out).length ? out : undefined;
  }

  restore(s) {
    this.lastDay = s && Number.isFinite(s.d) ? s.d : null;
    this.buffs = s && s.b && typeof s.b === 'object' ? { ...s.b } : {};
  }
}
