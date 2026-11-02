/* ==== minigames/golf.js — Bullroarer Took's golf (TERV 0.11/11: "Bikabőgő Tuk golfja [a név ellenőrizendő]: a könyv
   szerint Tuk egy goblinvezér, Golfimbul fejét ütötte egy nyúlüregbe, és így találták fel a golfot. Minijáték a kertben:
   a saját kiásott lyukaidba golfozol. Co-opban egymás ellen."). Book ch. 1: at the Battle of the Green Fields
   [the Hungarian name ellenőrizendő] Bullroarer Took knocked the goblin king Golfimbul's head off with a wooden club;
   it flew through the air and went down a rabbit-hole, and so the battle was won and golf invented.
   - At the tee in the garden (Bullroarer's wooden club lies on the lawn by a ball, south of the pit, by the spawn
     point) the use key starts a round. The hole is one of the players' own dug holes in the garden (any spot of the
     diggable block where the lawn is dug at least 0.8 m deep — the pit counts); the nearest one at least 3 m away
     gets a flag. No hole yet: the player is told to dig one first.
   - Each player plays his own ball in his own viewport: aim by looking (mouse / stick / IJKL), hold the dig key — the
     swing's power swells and ebbs — and release to hit. The ball rolls over the real ground (the density field) with
     friction and slope, and drops into any dug hole it rolls over. After it stops the player steps up to it.
   - 5 strokes at most, par 3. Holed within par: 30 / 20 / 10 gold (1 / 2 / 3 strokes) into the shared purse, once per
     game day per player. Co-op: every other player on the surface within 10 m of the tee plays too, against each
     other: the fewest strokes wins. The back key leaves. ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { changedNear } from '../save.js';
import { sdf } from '../world.js';
import { GOLD, head, keysOf, meter, painted, sound } from './common.js';

export const GOLF = {
  tee: { x: 2.2, z: 14.2 }, // the tee on the lawn by the spawn point (0, 15), between the pit (the block ends at z 12) and the inn
  reach: 1.7, // m from the tee: the prompt and the start
  join: 10, // m from the tee: co-op partners who join
  maxStrokes: 5,
  par: 3,
  vMin: 1.2, // m/s at no power
  vMax: 13, // m/s at full power
  friction: 2.3, // m/s² rolling
  slope: 4.5, // m/s² per unit of slope
  holeDepth: 0.8, // m below the lawn: a dug hole
  holeY: -0.6, // the ball drops when the ground under it is lower than this
  minDist: 3, // m: the nearest hole at least this far from the tee
  outR: 34, // m from the tee: the ball is lost
  ballR: 0.045,
  over: 2.6, // s the results stay
};

/** The first solid point below `from` at (x, z) (the ground's height), from the density field; null if none in 7 m. */
export function groundY(x, z, from = 1.5) {
  let y = from;
  if (sdf(x, y, z) > 0) return y;
  for (let k = 0; k < 70; k++) {
    const ny = y - 0.1;
    if (sdf(x, ny, z) > 0) {
      let lo = ny;
      let hi = y;
      for (let n = 0; n < 5; n++) {
        const m = (lo + hi) / 2;
        if (sdf(x, m, z) > 0) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2;
    }
    y = ny;
  }
  return null;
}

function clubGeometry() {
  const P = [];
  // Bullroarer's wooden club, lying on the lawn: a knotty shaft and a heavy head (book: "a wooden club").
  const shaft = new THREE.CylinderGeometry(0.022, 0.03, 0.95, 7);
  shaft.rotateZ(Math.PI / 2);
  P.push(painted(shaft, 0x8a6238));
  const knob = new THREE.SphereGeometry(0.075, 9, 7);
  knob.scale(1.25, 0.95, 0.95);
  knob.translate(0.52, 0.02, 0);
  P.push(painted(knob, 0x6e4a28));
  const grip = new THREE.CylinderGeometry(0.026, 0.026, 0.2, 7);
  grip.rotateZ(Math.PI / 2);
  grip.translate(-0.38, 0, 0);
  P.push(painted(grip, 0x4a3420));
  const ball = new THREE.SphereGeometry(0.045, 10, 8);
  ball.translate(0.25, 0.0, 0.32);
  P.push(painted(ball, 0xf2ecdc));
  const g = mergeGeometries(P);
  g.computeVertexNormals();
  return g;
}

function flagGeometry() {
  const P = [];
  const pole = new THREE.CylinderGeometry(0.015, 0.015, 1.5, 5);
  pole.translate(0, 0.75, 0);
  P.push(painted(pole, 0xc8b898));
  const cloth = new THREE.BufferGeometry();
  cloth.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.48, 0, 0, 1.18, 0, 0.42, 1.33, 0, 0, 1.18, 0, 0, 1.48, 0, 0.42, 1.33, 0], 3));
  cloth.computeVertexNormals();
  P.push(painted(cloth, 0xb83a20));
  const g = mergeGeometries(P);
  g.computeVertexNormals();
  return g;
}

const tri = (t) => 1 - Math.abs(((t % 2) + 2) % 2 - 1);

export class Golf {
  constructor(mg) {
    this.mg = mg;
    this.game = mg.game;
    this.runs = new Map(); // player → run
    this.days = {}; // slot → last rewarded game day
    this.overT = 0;
    const root = this.game.scene.getObjectByName('surface-root') || this.game.scene;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const ty = groundY(GOLF.tee.x, GOLF.tee.z) ?? 0;
    this.tee = new THREE.Vector3(GOLF.tee.x, ty, GOLF.tee.z);
    this.club = new THREE.Mesh(clubGeometry(), mat);
    this.club.name = 'minigame-golf-club';
    this.club.position.set(this.tee.x, ty + 0.03, this.tee.z);
    this.club.rotation.y = 0.5;
    root.add(this.club);
    this.flag = new THREE.Mesh(flagGeometry(), mat);
    this.flag.name = 'minigame-golf-flag';
    this.flag.visible = false;
    root.add(this.flag);
    const ballGeo = painted(new THREE.SphereGeometry(GOLF.ballR, 12, 9), 0xffffff);
    ballGeo.computeVertexNormals();
    // One ball per player (white for player 1, a warm cream for player 2).
    this.balls = [0xf6f2e8, 0xf0d890].map((c, k) => {
      const m = new THREE.Mesh(ballGeo, new THREE.MeshLambertMaterial({ color: c, vertexColors: true }));
      m.name = `minigame-golf-ball-${k}`;
      m.visible = false;
      root.add(m);
      return m;
    });
    this.target = null;
    this.v = new THREE.Vector3();
  }

  today() {
    return this.game.dayClock?.day?.() ?? 1;
  }

  near(p, r = GOLF.reach) {
    return p.pos.y > -1.5 && p.pos.y < 3 && Math.hypot(p.pos.x - this.tee.x, p.pos.z - this.tee.z) < r;
  }

  holds(p) {
    return this.runs.has(p);
  }

  get running() {
    return this.runs.size > 0;
  }

  prompt(p, i) {
    if (!this.near(p) || this.game.bagEnd?.isInside(p)) return '';
    return `Bikabőgő Tuk golfja: ${keysOf(this.game, i).use}`;
  }

  /**
   * The players' dug holes in the garden: cells (0.5 m) of the block that are air 0.8 m below the lawn and were dug
   * (the density differs from the generated field there: the old well is not a player's hole).
   */
  findHoles() {
    const out = [];
    for (let x = -11.5; x <= 11.5; x += 0.5) {
      for (let z = -11.5; z <= 11.5; z += 0.5) {
        if (sdf(x, -GOLF.holeDepth, z) < 0 && sdf(x, -0.45, z) < 0 && changedNear(x, -GOLF.holeDepth, z, 0.25)) out.push({ x, z });
      }
    }
    return out;
  }

  tryStart(p, i) {
    if (!this.near(p) || this.game.bagEnd?.isInside(p)) return false;
    if (this.runs.size) return true;
    const holes = this.findHoles();
    let best = null;
    let bd = Infinity;
    for (const h of holes) {
      const d = Math.hypot(h.x - this.tee.x, h.z - this.tee.z);
      if (d >= GOLF.minDist && d < bd) {
        bd = d;
        best = h;
      }
    }
    if (!best) {
      p.say('Nincs még lyuk a kertben! Áss egyet (a gödör is jó), abba golfozhatsz.', 3.5);
      return true;
    }
    this.target = best;
    const fy = groundY(best.x, best.z, 0.5) ?? -1;
    this.flag.position.set(best.x, Math.max(fy, -0.9), best.z);
    this.flag.visible = true;
    this.overT = 0;
    const players = [p, ...this.game.players.filter((q) => q !== p && !q.choosing && q.dead <= 0 && !this.mg.busy(q) && this.near(q, GOLF.join) && !this.game.bagEnd?.isInside(q))];
    players.forEach((q) => this.join(q, this.game.players.indexOf(q)));
    if (players.length > 1) for (const q of players) q.say('Bikabőgő Tuk golfja, egymás ellen: a kevesebb ütés nyer!', 3);
    return true;
  }

  join(p, i) {
    const k = this.runs.size % this.balls.length;
    const ball = this.balls[k];
    const side = k ? 0.5 : -0.5;
    const toT = Math.atan2(-(this.target.x - this.tee.x), -(this.target.z - this.tee.z));
    const pos = new THREE.Vector3(this.tee.x + Math.cos(toT) * side, 0, this.tee.z - Math.sin(toT) * side);
    pos.y = (groundY(pos.x, pos.z) ?? 0) + GOLF.ballR;
    ball.position.copy(pos);
    ball.visible = true;
    const run = { i, ball, pos, vel: new THREE.Vector3(), last: pos.clone(), phase: 'aim', strokes: 0, power: 0, t: 0, yaw: toT, holed: false, msg: '', reward: 0 };
    this.runs.set(p, run);
    p.yaw = toT;
    this.mg.hint(p, i, 'golf', `<b style="${GOLD}">Bikabőgő Tuk golfja.</b> A könyv szerint Bikabőgő Tuk a Zöldmezők csatájában [ellenőrizendő] egy fabunkóval leütötte Golfimbul goblinvezér fejét; a fej messzire repült, és egy nyúlüregbe pottyant: így nyerték meg a csatát, és így találták fel a golfot. Célozz nézéssel, tartsd nyomva (${keysOf(this.game, i).act}) a lendülethez, engedd el az ütéshez. Kilépés: ${keysOf(this.game, i).back}.`, 16);
  }

  /** Puts the player behind his ball, looking along the aim (held in place: menuOpen). */
  stand(p, r) {
    const fx = -Math.sin(r.yaw);
    const fz = -Math.cos(r.yaw);
    const x = r.pos.x - fx * 0.8;
    const z = r.pos.z - fz * 0.8;
    const y = groundY(x, z, r.pos.y + 1.2);
    p.pos.set(x, (y ?? r.pos.y) + 0.02, z);
    p.vel.set(0, 0, 0);
    p.yaw = r.yaw;
    p.pitch = -0.42;
  }

  input(p, i, it, dt) {
    const r = this.runs.get(p);
    if (!r) return false;
    if (it.backPressed) {
      this.leave(p, r, 'Abbahagytad a golfot.');
      return true;
    }
    if (r.phase === 'aim' || r.phase === 'charge') {
      r.yaw -= (it.lookX || 0) + (it.padLookX || 0) * dt;
      this.stand(p, r);
    }
    if (r.phase === 'aim' && it.dig) {
      r.phase = 'charge';
      r.t = 0;
    } else if (r.phase === 'charge') {
      r.power = tri(r.t * 0.9);
      if (!it.dig) this.strike(r);
    } else if (r.phase === 'roll' || r.phase === 'in' || r.phase === 'out') {
      // Watch the ball.
      const dx = r.pos.x - p.pos.x;
      const dz = r.pos.z - p.pos.z;
      const dy = r.pos.y - (p.pos.y + (p.eyeH || 1));
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.max(-1.2, Math.min(0.3, Math.atan2(dy, Math.hypot(dx, dz))));
    }
    return true;
  }

  strike(r, power = r.power) {
    const v = GOLF.vMin + power * (GOLF.vMax - GOLF.vMin);
    r.vel.set(-Math.sin(r.yaw) * v, 0, -Math.cos(r.yaw) * v);
    r.last.copy(r.pos);
    r.strokes++;
    r.phase = 'roll';
    r.t = 0;
    r.power = power;
    sound(this.game, 'clack');
  }

  leave(p, r, msg) {
    r.ball.visible = false;
    this.runs.delete(p);
    if (msg) p.say(msg, 2);
    if (!this.runs.size) this.flag.visible = false;
  }

  /** The ball's roll (sub-stepped), only while a ball moves. */
  roll(r, dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let s = 0; s < steps && r.phase === 'roll'; s++) {
      const y0 = groundY(r.pos.x, r.pos.z, r.pos.y + 0.6) ?? -9;
      if (y0 < GOLF.holeY) {
        r.phase = 'in';
        r.t = 0;
        r.dropTo = y0 + GOLF.ballR;
        sound(this.game, 'plop');
        return;
      }
      const e = 0.25;
      const gx = ((groundY(r.pos.x + e, r.pos.z, r.pos.y + 0.6) ?? y0) - (groundY(r.pos.x - e, r.pos.z, r.pos.y + 0.6) ?? y0)) / (2 * e);
      const gz = ((groundY(r.pos.x, r.pos.z + e, r.pos.y + 0.6) ?? y0) - (groundY(r.pos.x, r.pos.z - e, r.pos.y + 0.6) ?? y0)) / (2 * e);
      r.vel.x -= Math.max(-1, Math.min(1, gx)) * GOLF.slope * h;
      r.vel.z -= Math.max(-1, Math.min(1, gz)) * GOLF.slope * h;
      const sp = Math.hypot(r.vel.x, r.vel.z);
      const ns = Math.max(0, sp - GOLF.friction * h);
      if (sp > 0) {
        r.vel.x *= ns / sp;
        r.vel.z *= ns / sp;
      }
      r.pos.x += r.vel.x * h;
      r.pos.z += r.vel.z * h;
      r.pos.y = y0 + GOLF.ballR;
      if (Math.hypot(r.pos.x - this.tee.x, r.pos.z - this.tee.z) > GOLF.outR) {
        r.phase = 'out';
        r.t = 0;
        return;
      }
      if (ns < 0.06) {
        r.vel.set(0, 0, 0);
        r.phase = r.strokes >= GOLF.maxStrokes ? 'done' : 'aim';
        r.t = 0;
        if (r.phase === 'done') r.msg = `${GOLF.maxStrokes} ütésből sem ment be.`;
        else r.yaw = Math.atan2(-(this.target.x - r.pos.x), -(this.target.z - r.pos.z));
        return;
      }
    }
  }

  update(dt) {
    if (!this.runs.size) return;
    for (const [p, r] of this.runs) {
      r.t += dt;
      if (p.dead > 0 || p.choosing) {
        this.leave(p, r);
        continue;
      }
      if (r.phase === 'roll') this.roll(r, dt);
      else if (r.phase === 'in') {
        r.pos.y = Math.max(r.dropTo, r.pos.y - dt * 3);
        if (r.t > 0.8) this.holed(p, r);
      } else if (r.phase === 'out' && r.t > 1) {
        r.pos.copy(r.last);
        r.phase = r.strokes >= GOLF.maxStrokes ? 'done' : 'aim';
        r.msg = r.phase === 'done' ? `${GOLF.maxStrokes} ütésből sem ment be.` : '';
        p.say('A labda elgurult a kertből: onnan ütsz újra, ahonnan elütötted.', 2.5);
      }
      if (r.phase === 'aim' && r.t < dt * 1.5) this.stand(p, r);
      r.ball.position.copy(r.pos);
    }
    // Everybody finished: the results stay a moment, then the round closes.
    const all = [...this.runs.values()];
    if (all.length && all.every((r) => r.phase === 'holed' || r.phase === 'done')) {
      if (!this.overT) this.finish(all);
      this.overT += dt;
      if (this.overT > GOLF.over) for (const [p, r] of [...this.runs]) this.leave(p, r);
    }
  }

  holed(p, r) {
    r.phase = 'holed';
    r.holed = true;
    r.msg = r.strokes === 1 ? 'Egy ütésből! Bikabőgő Tuk is megirigyelné.' : `Bent van, ${r.strokes} ütésből!`;
    sound(this.game, 'win');
  }

  /** Rewards and the versus result, once when every player is done. */
  finish(all) {
    const day = this.today();
    for (const [p, r] of this.runs) {
      const slot = p.slot ?? r.i;
      if (r.holed && r.strokes <= GOLF.par) {
        const gold = 10 * (GOLF.par + 1 - r.strokes);
        if (this.days[slot] !== day) {
          this.days[slot] = day;
          this.game.money += gold;
          r.reward = gold;
          r.msg += ` +${gold} arany.`;
          sound(this.game, 'coins');
        } else r.msg += ' (Mára már kaptál jutalmat.)';
      }
    }
    if (all.length > 1) {
      const holed = [...this.runs].filter(([, r]) => r.holed).sort((a, b) => a[1].strokes - b[1].strokes);
      let text = 'Senkinek sem ment be: döntetlen.';
      if (holed.length === 1 || (holed.length > 1 && holed[0][1].strokes < holed[1][1].strokes)) text = `${holed[0][0].ch.name} nyert (${holed[0][1].strokes} ütés)!`;
      else if (holed.length > 1) text = `Döntetlen: ${holed[0][1].strokes} ütés mindkettőtöknek.`;
      this.result = text;
      for (const [, r] of this.runs) r.versus = text;
    } else this.result = null;
    for (const [p, r] of this.runs) p.say(r.msg, 4);
    this.game.saveNow?.();
  }

  html(p, i, g) {
    const r = this.runs.get(p);
    if (!r) return '';
    const dist = this.target ? Math.hypot(this.target.x - r.pos.x, this.target.z - r.pos.z) : 0;
    let body = `<div>Ütés: <b>${r.strokes}</b> / ${GOLF.maxStrokes} (par ${GOLF.par}) · a zászlóig ${dist.toFixed(1)} m</div>`;
    if (r.phase === 'aim') body += `<div style="font-size:0.85em;color:#5a4a34;margin-top:0.2em">Célozz nézéssel · tartsd nyomva: ${g.dig} (lendület) · engedd el: ütés · ${g.back} kilépés</div>`;
    else if (r.phase === 'charge') body += meter(r.power, 0, 1, '#7a2a10') + `<div style="font-size:0.85em;color:#5a4a34">Engedd el a kívánt erőnél!</div>`;
    else if (r.phase === 'roll') body += '<div style="font-style:italic">Gurul…</div>';
    else if (r.phase === 'out') body += '<div style="font-style:italic;color:#7a2a10">Elgurult!</div>';
    else body += `<div style="font-weight:bold;font-style:italic;color:${r.holed ? '#2a5a1a' : '#7a2a10'};margin-top:0.2em">${r.msg || (r.phase === 'in' ? 'Bepottyant!' : '')}</div>${r.versus ? `<div style="margin-top:0.2em">${r.versus}</div>` : ''}`;
    return head('Bikabőgő Tuk golfja') + body;
  }

  state() {
    return Object.keys(this.days).length ? { d: { ...this.days } } : undefined;
  }

  restore(s) {
    this.days = s && s.d && typeof s.d === 'object' ? { ...s.d } : {};
  }
}
