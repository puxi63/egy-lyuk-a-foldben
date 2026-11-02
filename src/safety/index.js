/* ==== safety/index.js — safety and comfort (NOTES-11-safety):
   - FALL DAMAGE (TERV 0.6 "Mitől lehet meghalni: … nagy esés", in both modes; 0.4 armour tiers 1–2): the landing speed
     gives an equivalent fall height. Below FALL[mode].from nothing happens; above it a hurt fall costs a bite of the plate,
     knocks the player down for a moment and a big one shakes a find out of the bag (it lies close by in a small sack, picked
     up by touching it); from FALL[mode].death (+ the armour's `fall` metres) the fall kills. Kihívás mode (the existing
     `enemies.challenge` flag) hurts from lower, harder, kills from lower, and has no hunger floor. Water deeper than
     WATER_SAFE, a belay rope, rides (lift, Eagles, rocket, barrels, the finale's held scenes), the enchanted stream's catch
     (`p.safeFallT`) never count.
   - ROPE BELAYING (TERV 0.11/19 "Kötélbiztosítás"; the dwarves carry ropes in the book: ch. 8 the hooked rope at the
     enchanted stream, ch. 11–12 the ropes up to the secret door's ledge [ellenőrizendő: chapter detail]): one player
     presses the rope key near the partner; while the rope is on (within ROPE.len) the partner's falls are paid out on the
     rope (fall speed capped) and never hurt or kill, in Kihívás mode too. One line is drawn between them.
   - BALIN'S ESTIMATE (TERV 0.11/3 "Visszaút-jelző (Balin becslése …)" [ellenőrizendő]): a shared upgrade at the Green
     Dragon counter; a mark on every player's hunger plate shows how much of the plate the climb home needs from the
     current depth (by ladder, or to a built lift stop near enough and the ride from there). Without it, nothing.
   - HOLLOW BELOW (NOTES-18-levelfix): a player standing on a thin floor (at most HOLLOW.slab of rock) over a big air
     space is warned, every time he comes to such a spot (not only the first time in a layer): the depth of the drop and
     whether it would hurt or kill him. Over Smaug's treasury the warning is the dragon's snoring coming up through the
     gold; over Mirkwood's root hall it says the roots will catch him (underground/mirkwood-water.js rootSlide); over
     deep water it says so. A few density samples per player twice a second; text through p.say, no HUD change.
   Wiring: game.js builds it as `game.safety`, calls input / update / overlay, restores its state; save.js saves state();
   hud.js adds shopRows; player.js calls landFall() at a landing and honours `p.downT` (knocked down). ==== */
import * as THREE from 'three';
import { HUNGER, PLAYER } from '../config.js';
import { armourOf } from '../enemies/armour.js';
import { LIFT_STOPS } from '../lift.js';
import { raycast, sdf } from '../world.js';
import { inBasin, WATER_Y } from '../underground/lake-sites.js';
import { inRootHallAir } from '../underground/mirkwood-water.js';
import { HOARD_TOP, HALL9 } from '../underground/hoard-sites.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { lifeOf } from '../modes/rules.js'; // modes (NOTES-15-modes): Kihívás armour tier 3 "több életerő"

/**
 * Fall rules per mode. Heights are metres of free fall equivalent to the landing speed (v² / 2g). `from`: a hurt fall
 * starts here; `death`: the deadly height before armour (normal mode keeps the game's old PLAYER.fallDeath); `hurt`:
 * multiplier on the plate cost; `floor`: the plate never drops below this from a fall (normal mode: a hurt fall alone
 * never starves you).
 */
export const FALL = {
  normal: { from: 5, death: PLAYER.fallDeath, hurt: 1, floor: 5 },
  challenge: { from: 4, death: PLAYER.fallDeath - 2, hurt: 1.5, floor: 0 },
  /** Plate cost: base + per metre above `from` (times the mode's and the armour's multiplier). */
  cost: [5, 2.2],
  /** Knocked down: seconds base + per metre above `from`, capped (times 0.5 + 0.5 × the armour's multiplier). */
  down: [0.8, 0.25, 2.2],
  /** Metres above `from` that shake a find out of the bag (not with the mithril shirt). */
  drop: 2,
};
/** Water at least this deep (m at the feet) breaks a fall: no hurt, no death (a hand's depth still counts). */
export const WATER_SAFE = 0.5;
/** The belay rope: length (m between the two), the fall speed it pays out at (m/s), grace out of reach (s). */
export const ROPE = { len: 24, catchSpeed: 5, outGrace: 0.6, color: 0x9a7a4e, points: 12 };
/**
 * The hollow-below warning: the thickest floor it looks through (m), the sample steps, the deepest drop it measures,
 * seconds between checks per player, the quiet time before the same warning repeats, the shortest drop it warns of.
 */
export const HOLLOW = { slab: 2.6, step: 0.25, far: 30, every: 0.5, repeat: 25, min: 4 };
/** Balin's estimate: price (counter, perks and co-op apply), the reach of a lift stop counted as "near" (m of depth). */
export const BALIN = { price: 80, liftNear: 40 };

/** The fall rule of the current mode. */
function ruleOf(game) {
  return game?.enemies?.challenge ? FALL.challenge : FALL.normal;
}

/**
 * Called by player.js when the player lands (grounded this frame, not last frame, not on a ladder). `impact` is the
 * downward speed before the landing. Returns true when the player died (player.js then stops its update).
 */
export function landFall(p, impact) {
  const game = p.game;
  const h = (impact * impact) / (2 * PLAYER.gravity);
  const rule = ruleOf(game);
  if (game.safety?.track && h > 0.3) game.safety.track.push(+h.toFixed(2)); // QA: every landing's height
  if (h < rule.from) return false;
  const safety = game.safety;
  // Never counted: a ride or a held scene, the stream's catch, deep water, the belay rope.
  if (p.riding || p.asleep || (p.safeFallT || 0) > 0) return false;
  if (p.water && p.water.depth >= WATER_SAFE) return false;
  if (safety?.belayerOf(p)) {
    p.say('A kötél megtartott.', 2.5);
    safety.log('belayed', p, h);
    return false;
  }
  const arm = armourOf(p);
  if (h >= rule.death + arm.fall) {
    safety?.log('death', p, h);
    p.die('Nagyot estél…');
    return true;
  }
  if (!safety || (game.bench && !safety.testing)) return false; // the perf bench's bots keep the old rule only
  safety.hurt(p, h, rule, arm);
  return false;
}

/** Balin's reckoning slate for the counter (viewBox 100 × 100, the style of ui/art.js): Balin's reckoning slate. */
function balinSVG() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="93" rx="30" ry="5" fill="#0006"/>
    <rect x="16" y="14" width="68" height="70" rx="4" fill="#2e3236" stroke="#6a4a2a" stroke-width="5"/>
    <circle cx="44" cy="50" r="20" fill="none" stroke="#e8e2d0" stroke-width="2"/>
    <path d="M44 50V30A20 20 0 0 1 63 56z" fill="#e8e2d0" opacity=".35"/>
    <path d="M44 50L63 56" stroke="#e8c070" stroke-width="3" stroke-linecap="round"/>
    <path d="M70 26v46M66 34h8M66 46h8M66 58h8" stroke="#e8e2d0" stroke-width="1.6"/>
    <path d="M24 78h40" stroke="#e8e2d0" stroke-width="1.2" stroke-dasharray="2 3"/></svg>`;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class Safety {
  constructor(game) {
    this.game = game;
    /** Balin's estimate bought (shared by the company, saved). */
    this.balin = false;
    /** QA: lets the hurt rule run on the bench page. */
    this.testing = false;
    /** Recent fall events for QA: { kind, slot, h }. */
    this.events = [];
    /** Recent hollow-below warnings for QA: { kind, slot, drop } (NOTES-18-levelfix). */
    this.hollows = [];
    // The rope: one line, hidden unless a belay is on.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROPE.points * 3), 3));
    this.rope = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ROPE.color }));
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    game.scene.add(this.rope);
  }

  log(kind, p, h) {
    this.events.push({ kind, slot: p.slot, h: +h.toFixed(2) });
    if (this.events.length > 40) this.events.shift();
  }

  /* ---------------- fall damage ---------------- */

  /** A hurt fall: a bite of the plate, knocked down for a moment, maybe a find shaken out of the bag. */
  hurt(p, h, rule, arm) {
    const over = h - rule.from;
    const mult = arm.hurt ?? 1;
    const cost = Math.round((FALL.cost[0] + FALL.cost[1] * over) * rule.hurt * mult / lifeOf(p));
    // Set directly (not addHunger): a fall's harm does not follow the appetite perk or Bag End's comforts.
    const before = p.hunger;
    p.hunger = Math.min(p.hunger, Math.max(rule.floor, p.hunger - cost));
    const lost = Math.max(0, Math.round(before - p.hunger));
    p.downT = Math.min(FALL.down[2], FALL.down[0] + FALL.down[1] * over) * (0.5 + 0.5 * mult);
    p.vel.x *= 0.2;
    p.vel.z *= 0.2;
    p.kick = 1;
    const mithril = (p.armour | 0) >= 4;
    let dropped = null;
    if (!mithril && over >= FALL.drop) dropped = this.dropFind(p);
    if (mithril) this.game.decor?.ereborFx?.flash?.(p, 0.7, 0.9);
    const what = mithril ? 'A mithrilpáncél felfogta az esés nagyját.' : 'Nagyot huppantál!';
    p.say(`${what}${lost ? ` (−${lost} a tányérból)` : ''}${dropped ? ` Kiesett a zsákodból: ${dropped.name}.` : ''}`, 3.5);
    this.log('hurt', p, h);
    this.lastHurt = { slot: p.slot, h: +h.toFixed(2), lost, down: +p.downT.toFixed(2), dropped: dropped?.id || null };
  }

  /** Shakes one find (never a famous or kept one) out of the bag; it lies in a small sack beside the player. */
  dropFind(p) {
    const can = p.bag.map((f, k) => (f.famous || f.keep ? -1 : k)).filter((k) => k >= 0);
    if (!can.length) return null;
    const o = tmpA.set(p.pos.x, p.pos.y + 0.5, p.pos.z);
    for (let n = 0; n < 8; n++) {
      const a = p.yaw + Math.PI + n * (Math.PI / 4);
      const d = tmpB.set(Math.sin(a), 0, Math.cos(a));
      // Room beside the player (no wall within 1.6 m), then a floor under that spot.
      if (raycast(o, d, 1.6) >= 0) continue;
      const x = o.x + d.x * 1.4;
      const z = o.z + d.z * 1.4;
      if (sdf(x, o.y, z) > 0) continue;
      const t = raycast(tmpB.set(x, o.y, z), DOWN, 2.5);
      if (t < 0) continue;
      const k = can[Math.floor(Math.random() * can.length)];
      const f = p.bag.splice(k, 1)[0];
      this.game.sacks.drop(x, o.y - t, z, [f]);
      return f;
    }
    return null;
  }

  /* ---------------- belaying ---------------- */

  /** The partner who belays p right now, or null. */
  belayerOf(p) {
    for (const q of this.game.players) if (q !== p && q.belay === p) return q;
    if (this.game.modes?.helper?.belays(p)) return this.game.modes.helper; // modes (NOTES-15-modes): the hired dwarf
    return null;
  }

  /** Whether q can hold a rope for p now (both in play, not riding, within the rope's length). */
  canBelay(q, p) {
    const g = this.game;
    if (!p || p === q || p.dead > 0 || q.dead > 0 || p.choosing || q.choosing || q.riding) return false;
    if (g.bagEnd?.isInside(q) || g.bagEnd?.isInside(p)) return false;
    return q.pos.distanceTo(p.pos) <= ROPE.len;
  }

  /** The rope key (called only when no menu is open): takes up the rope for the partner, or lets it go. */
  input(p, i, it) {
    if (!it.ropePressed || p.dead > 0 || p.choosing) return;
    if (p.belay) {
      this.release(p, `Elengedted a kötelet.`);
      return;
    }
    const partner = this.game.players.find((q) => q !== p && !q.choosing);
    if (!partner) {
      if (this.game.modes?.ropeKey(p)) return; // modes (NOTES-15-modes): the hired dwarf belays in single play
      p.say('A kötélhez társ kell: egyikőtök biztosítja a másikat.', 3);
      return;
    }
    if (partner.belay === p) {
      p.say(`${partner.ch.name} már biztosít téged.`, 2.5);
      return;
    }
    if (!this.canBelay(p, partner)) {
      p.say(`${partner.ch.name} túl messze van a kötélhez (${ROPE.len} m).`, 3);
      return;
    }
    p.belay = partner;
    p.belayOut = 0;
    p.say(`Biztosítod ${partner.ch.name} társadat a kötéllel.`, 3);
    partner.say(`${p.ch.name} biztosít: ha leesel, a kötél megtart.`, 3.5);
    this.log('belay-on', p, 0);
  }

  release(p, text) {
    const partner = p.belay;
    p.belay = null;
    if (text) p.say(text, 2.5);
    if (partner && text) partner.say('Lekerültél a kötélről.', 2.5);
  }

  /** Per frame (after the players moved): timers, the belay rope (catch, reach, drawing). */
  update(dt) {
    let pair = null;
    for (const p of this.game.players) {
      if (p.safeFallT > 0) p.safeFallT = Math.max(0, p.safeFallT - dt);
      const partner = p.belay;
      if (!partner) continue;
      if (!this.game.players.includes(partner) || p.dead > 0 || p.choosing || p.riding || partner.dead > 0 || partner.choosing) {
        this.release(p, null);
        continue;
      }
      if (p.pos.distanceTo(partner.pos) > ROPE.len) {
        p.belayOut = (p.belayOut || 0) + dt;
        if (p.belayOut > ROPE.outGrace) {
          this.release(p, 'Kifutott a kötél: túl messzire kerültetek.');
          continue;
        }
      } else p.belayOut = 0;
      // A fall on the rope: paid out slowly (the partner lowers you), never a hard landing.
      if (!partner.climbing && !partner.riding && partner.vel.y < -ROPE.catchSpeed) partner.vel.y = -ROPE.catchSpeed;
      pair = [p, partner];
    }
    this.drawRope(pair);
    for (const p of this.game.players) this.hollowStep(p, dt);
  }

  /* ---------------- hollow below ---------------- */

  /**
   * The air under a thin floor at (x, z) below the feet at y: { slab, drop, bottom } (m), or null when the rock under
   * the feet is thicker than HOLLOW.slab or there is no solid ground under the feet.
   */
  hollowAt(x, y, z) {
    if (sdf(x, y - 0.12, z) <= 0) return null; // not standing on rock here
    let a = -1;
    for (let d = 0.37; d <= HOLLOW.slab; d += HOLLOW.step) {
      if (sdf(x, y - d, z) <= 0) {
        a = d;
        break;
      }
    }
    if (a < 0) return null;
    let b = HOLLOW.far;
    for (let d = a + 0.5; d <= HOLLOW.far; d += 0.5) {
      if (sdf(x, y - d, z) > 0) {
        b = d;
        break;
      }
    }
    return { slab: a, drop: b - a, bottom: y - b };
  }

  /** The hollow-below warning for one player (see the header). */
  hollowStep(p, dt) {
    p.hollowT = (p.hollowT || 0) - dt;
    p.hollowQuiet = Math.max(0, (p.hollowQuiet || 0) - dt);
    if (p.hollowT > 0) return;
    p.hollowT = HOLLOW.every;
    if (p.dead > 0 || p.choosing || p.riding || p.asleep || p.barrel || p.climbing || !p.grounded || p.pos.y > -3 || p.isInside) return;
    // Under the feet, and a little ahead where the pick works.
    const fx = -Math.sin(p.yaw) * 0.7;
    const fz = -Math.cos(p.yaw) * 0.7;
    let h = this.hollowAt(p.pos.x, p.pos.y, p.pos.z);
    const h2 = this.hollowAt(p.pos.x + fx, p.pos.y, p.pos.z + fz);
    if (h2 && (!h || h2.drop > h.drop)) h = h2;
    const rule = ruleOf(this.game);
    if (!h || h.drop < Math.max(HOLLOW.min, rule.from)) {
      if (!h) p.hollowKind = null;
      return;
    }
    const deadly = h.drop >= rule.death + armourOf(p).fall;
    const bx = p.pos.x;
    const bz = p.pos.z;
    const m = Math.round(h.drop);
    let kind;
    let text;
    if (h.bottom < HOARD_TOP && h.bottom > HALL9.floor - 2 && !this.game.smaug?.gone) {
      kind = 'smaug';
      text = `A talpad alatt vékony a kő: mélyről, mintegy ${m} méterről Szmaug horkolása dübörög fel. Ha átszakad, kötél nélkül halálos a zuhanás! Áss oldalra, vagy a lépcsőn menj le.`;
    } else if (inRootHallAir(bx, h.bottom + 2, bz, 0)) {
      kind = 'roots';
      text = `Alattad hatalmas üreg tátong (kb. ${m} m): Bakacsinerdő gyökereinek csarnoka. Ha átszakad, kapaszkodj az óriási gyökerekbe!`;
    } else if (h.bottom < WATER_Y + 0.4 && h.bottom > WATER_Y - 6 && inBasin(bx, bz)) {
      kind = 'water';
      text = `Alattad üreg tátong (kb. ${m} m), az alján mély víz csillog.`;
    } else {
      kind = deadly ? 'deadly' : 'hurt';
      text = deadly
        ? `Alattad mély üreg tátong (kb. ${m} m)! Ha átszakad, kötél nélkül halálos a zuhanás. Áss oldalra!`
        : `Alattad üreg tátong (kb. ${m} m). Ha átszakad, megsérülhetsz: óvatosan áss!`;
    }
    // Once per spot and kind: again only after a quiet spell, or when it gets worse.
    const worse = kind === 'deadly' && p.hollowKind === 'hurt';
    if (p.hollowKind === kind && p.hollowQuiet > 0 && !worse) return;
    p.hollowKind = kind;
    p.hollowQuiet = HOLLOW.repeat;
    // QA: the warnings shown (kept apart from the fall events).
    this.hollows.push({ kind, slot: p.slot, drop: +h.drop.toFixed(1) });
    if (this.hollows.length > 20) this.hollows.shift();
    p.say(text, 6);
  }

  /** The rope between the belayer's hands and the partner's waist, sagging a little. */
  drawRope(pair) {
    this.rope.visible = !!pair;
    if (!pair) return;
    const [a, b] = pair;
    const A = tmpA.set(a.pos.x - Math.sin(a.yaw) * 0.25, a.pos.y + a.eyeH * 0.62, a.pos.z - Math.cos(a.yaw) * 0.25);
    const B = tmpB.set(b.pos.x, b.pos.y + b.eyeH * 0.55, b.pos.z);
    const len = A.distanceTo(B);
    const sag = Math.min(1.4, 0.05 * len) * (1 - Math.min(1, Math.abs(A.y - B.y) / Math.max(0.01, len)) * 0.8);
    const attr = this.rope.geometry.attributes.position;
    const n = ROPE.points - 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      attr.setXYZ(k, A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t - sag * 4 * t * (1 - t), A.z + (B.z - A.z) * t);
    }
    attr.needsUpdate = true;
  }

  /* ---------------- Balin's estimate ---------------- */

  /** Counter rows (hud.js rows): Balin's estimate, once for the company. */
  shopRows(p, cost) {
    if (this.balin) return [];
    return [{
      kind: 'balin', art: balinSVG(), label: 'Balin becslése: a hazaút ára a tányéron', price: cost(BALIN.price), ok: true, act: () => {
        this.balin = true;
        for (const q of this.game.players) q.say('Balin megbecsüli a hazautat: a tányéron a vonal mutatja, mennyi étel kell a felmászáshoz.', 5);
        this.game.saveNow?.();
      },
    }];
  }

  /**
   * The plate a player needs to climb home from here (hunger points): by ladder all the way, or up (or down) to a built
   * lift stop within BALIN.liftNear of the current depth and the ride from there (a ride costs no hunger). 0 on the surface.
   */
  homeNeed(p) {
    const d = p.depth;
    if (d < 1.5 || this.game.bagEnd?.isInside(p)) return 0;
    const mult = this.game.bagEnd?.effects?.hungerMult ? this.game.bagEnd.effects.hungerMult(p) : 1;
    // Hunger per metre climbed: the climbing cost per second over the climb speed (perks of the character).
    const perM = (HUNGER.perClimbSecond * p.perk.hunger * mult) / (PLAYER.climb * p.perk.climb);
    let best = d * perM;
    const built = this.game.lift?.built;
    if (built) {
      for (const s of LIFT_STOPS) {
        if (!s.depth || !built.has(s.id) || Math.abs(d - s.depth) > BALIN.liftNear) continue;
        best = Math.min(best, Math.max(0, d - s.depth) * perM);
      }
    }
    return best;
  }

  /* ---------------- per player HUD: the plate's mark, the rope's prompt ---------------- */

  /** Called per player after its HUD update (game.js): the estimate's mark on the plate and the rope line of text. */
  overlay(i, p) {
    const hud = this.game.huds[i];
    if (!hud) return;
    const el = hud.el;
    // The estimate's mark: a radial line on the plate at the share of the plate the climb home needs.
    if (!el.balinMark) {
      const svg = el.querySelector('.plate svg');
      if (!svg) return;
      const ns = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'balin-mark');
      g.innerHTML = '<line x1="50" y1="50" x2="50" y2="3" stroke="#f8f0dc" stroke-width="4.2" stroke-linecap="round"/>'
        + '<line class="bm-ink" x1="50" y1="50" x2="50" y2="3" stroke="#2a1c10" stroke-width="2" stroke-linecap="round"/>'
        + '<circle class="bm-ink-dot" cx="50" cy="5" r="3" fill="#2a1c10" stroke="#f8f0dc" stroke-width="1.2"/>';
      g.style.display = 'none';
      svg.appendChild(g);
      el.balinMark = g;
      el.balinInk = [g.querySelector('.bm-ink'), g.querySelector('.bm-ink-dot')];
      el.ropeLine = document.createElement('div');
      Object.assign(el.ropeLine.style, { position: 'absolute', left: '0', right: '0', top: '72%', textAlign: 'center', fontSize: '15px', color: 'var(--gold, #e8c070)', textShadow: '0 1px 3px #000', pointerEvents: 'none' });
      el.append(el.ropeLine);
      el.balinC = {};
    }
    const c = el.balinC;
    const max = this.game.bagEnd?.effects?.hungerMax ?? HUNGER.max;
    const need = this.balin && !p.choosing && p.dead <= 0 ? this.homeNeed(p) : 0;
    const share = Math.min(1, need / max);
    const deg = need > 0.25 ? Math.round(share * 720) / 2 : -1;
    if (c.deg !== deg) {
      c.deg = deg;
      el.balinMark.style.display = deg < 0 ? 'none' : '';
      if (deg >= 0) el.balinMark.setAttribute('transform', `rotate(${deg} 50 50)`);
    }
    // Red when the plate holds less than the way home needs (or the way is longer than a full plate).
    const short = deg >= 0 && (p.hunger < need || need > max);
    if (c.short !== short) {
      c.short = short;
      const col = short ? '#b02a18' : '#2a1c10';
      el.balinInk[0].setAttribute('stroke', col);
      el.balinInk[1].setAttribute('fill', col);
    }
    p.homeNeed = need; // QA and other modules may read it
    // The rope's line of text: the state, or a hint when the partner is below within reach.
    const dev = `${deviceOf(this.game.bindings[i])}|${this.game.bindings.some((b) => b.kbm === 'keys2')}`;
    if (c.dev !== dev) {
      c.dev = dev;
      const [d, sh] = dev.split('|');
      c.key = glyphs(d, sh === 'true').rope || '';
    }
    const key = c.key;
    let text = '';
    const by = this.belayerOf(p);
    const partner = this.game.players.find((q) => q !== p && !q.choosing);
    if (p.belay) text = `Biztosítod: ${p.belay.ch.name} <span style="opacity:.75">· ${key} elengeded</span>`;
    else if (by) text = `Kötélen vagy: ${by.ch.name} biztosít`;
    else if (partner && p.dead <= 0 && !p.choosing && partner.depth > 1.5 && p.pos.y - partner.pos.y > 3 && this.canBelay(p, partner) && !partner.belay) {
      text = `${key} kötél: biztosítsd ${partner.ch.name} társadat`;
    }
    if (c.text !== text) {
      c.text = text;
      el.ropeLine.innerHTML = text;
    }
  }

  /* ---------------- save ---------------- */

  state() {
    return { balin: this.balin };
  }

  restore(s) {
    this.balin = !!s?.balin;
  }
}
