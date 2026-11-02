/* ==== gollum/index.js — Gollum, the riddle game and the Ring (TERV 0.3, 0.4, 0.5, 0.7, 0.12; NOTES-3b-gollum).
   Gollum lives on his island in the lake (gollum/sites.js: the lake world's provider, or a QA test cavity). When a
   player comes down into the lake cave he paddles ashore in his little boat and lurks in the dark at the lurk points,
   whispering and watching, his pale eyes glinting; light keeps him away (a strong light, p.lightPower ≥ 2, far away).
   A player who stays on the riddle beach is challenged: he crawls to the riddle spot and the riddle game starts
   (gollum/riddles.js): win → gold, lose → he steals a find (or gold). The Ring (gollum/ring.js) lies on the tunnel
   floor; the longer Bilbo wears it, the more Gollum follows him ("Tolvaj! Zsákos!") and the bolder he gets: close
   behind, at last snatching a find. Normal mode never kills.
   Wiring (game.js): `new Gollum(game)`, `sites.use(LAKE_SITE_PROVIDER)`, `restore(save.gollum)`, `input(p, i, it)` per
   player before the menus (true while the riddle UI has the player), `update(dt)`, `cullFor(seen, i)` and
   `viewFor(p, i)` per view; save.js snapshot `gollum: game.gollum?.state()`; enemies ask `isInvisible(p)`. ==== */
import * as THREE from 'three';
import { sharedAudio } from '../audio.js';
import { LAYER_TOPS } from '../materials.js';
import { raycast } from '../world.js';
import { chunkKey } from '../enemies/sites.js';
import { boatMesh, glintMaterial, GollumBody } from './body.js';
import { RIDDLE, RiddleGame } from './riddles.js';
import { Ring, shimmerMaterial } from './ring.js';
import { LakeSites, snapFloor } from './sites.js';

/** Tuning (metres, seconds, metres per second). */
export const GOLLUM = {
  crawl: 1.5,
  flee: 2.4,
  paddle: 0.9,
  keepLamp: 5.5, // the hobbit lamp: he keeps this far from it (except at the riddle spot)
  keepBright: 12, // a strong light (lightPower ≥ 2): this far, and no riddle game
  riddleNear: 6, // a player this near the riddle spot …
  riddleStay: 4, // … for this long is challenged
  cooldown: 90, // after a riddle game
  lurkEvery: [14, 24],
  leaveAfter: 15, // no player in the cave this long: he goes home
  followFrom: 60, // seconds of wearing the Ring (in the whole game) before he follows
  followFull: 900, // … and at full boldness after this many more
  followDepth: LAYER_TOPS[3], // he follows Bilbo up to Goblin-town (book ch. 5), not higher
  snatchEvery: 75,
};

/** Key names per control scheme (the hints name the exact keys of that player, like tutorial.js). */
const KEYS = {
  mouse: { nav: 'W / S', confirm: 'Szóköz', ring: 'X' },
  keys2: { nav: '↑ / ↓', confirm: 'Enter', ring: 'Á' },
  pad: { nav: 'a d-pad ↑ / ↓', confirm: 'A', ring: 'a d-pad ←' },
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const dir = new THREE.Vector3();

export class Gollum {
  constructor(game) {
    this.game = game;
    this.sites = new LakeSites();
    this.ring = new Ring(this);
    /** Saved: the riddles asked so far (his and Bilbo's), whether the pocket riddle was used, the score. */
    this.memory = { asked: [], bilbo: [], pocket: false, wins: 0, losses: 0 };
    this.body = new GollumBody();
    this.group = this.body.group;
    this.group.name = 'gollum';
    this.boat = boatMesh();
    this.boat.visible = false;
    game.scene.add(this.group, this.boat);
    this.group.visible = false;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.mode = 'away';
    this.t = 0;
    this.target = null;
    this.after = null;
    this.pathS = 0;
    this.lurkT = 0;
    this.stayT = 0;
    this.cooldown = 0;
    this.emptyT = 0;
    this.whisperT = 4;
    this.riddle = null;
    this.trail = [];
    this.trailT = 0;
    this.followT = 0;
    this.snatchT = GOLLUM.snatchEvery;
    this.thiefT = 0;
    this.seen = false;
    this.visibleKeys = [null, null];
    this.hintUi = new Map();
    this.audio = null;
    // His skinned program, the shimmer (a skinned basic material), the glints, the boat and the ghost hand are compiled
    // once his body has loaded, so neither his first appearance nor the first time the Ring is worn stalls a frame.
    this.body.ready.then(() => {
      if (!this.body.mesh || !game.players.length) return;
      const g = new THREE.Group();
      g.position.set(0, -1000, 0);
      const ghost = new THREE.SkinnedMesh(this.body.mesh.geometry, shimmerMaterial());
      ghost.bind(this.body.mesh.skeleton, this.body.mesh.bindMatrix);
      ghost.frustumCulled = false;
      const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)), glintMaterial());
      g.add(ghost, pts, this.ring.warmObjects(), boatMesh());
      const wasVisible = this.group.visible;
      this.group.visible = true;
      const p0 = this.group.position.clone();
      this.group.position.set(0, -1000, 0);
      game.scene.add(g);
      game.warmPrograms();
      game.scene.remove(g);
      this.group.position.copy(p0);
      this.group.visible = wasVisible;
    });
  }

  /* ---------------- save ---------------- */

  state() {
    return { ring: this.ring.state(), riddles: { asked: [...this.memory.asked], bilbo: [...this.memory.bilbo], pocket: this.memory.pocket, wins: this.memory.wins, losses: this.memory.losses } };
  }

  /** A missing field means none (older saves). */
  restore(s) {
    if (!s) return;
    this.ring.restore(s.ring);
    const r = s.riddles || {};
    this.memory = { asked: [...(r.asked || [])], bilbo: [...(r.bilbo || [])], pocket: !!r.pocket, wins: r.wins || 0, losses: r.losses || 0 };
  }

  /* ---------------- queries ---------------- */

  /** True while p wears the Ring: goblins (and later spiders and elves) cannot see him. */
  isInvisible(p) {
    return this.ring.isInvisible(p);
  }

  ringFound() {
    return this.ring.found;
  }

  lightPower(p) {
    return this.game.enemies?.lightPower?.(p) ?? p.lightPower ?? 1;
  }

  /** Players Gollum deals with: alive, playing, not riding, not in Bag End. */
  active(p) {
    return p && p.dead <= 0 && !p.choosing && !p.riding && !this.game.bagEnd?.isInside?.(p);
  }

  /** Whether his chunk was in some view's mask last frame. */
  inView(x, y, z) {
    const k = chunkKey(x, y + 0.4, z);
    return this.visibleKeys.some((v) => v && (k < 0 || v[k]));
  }

  /* ---------------- input ---------------- */

  /** Per player when no other menu has it: the riddle UI (true: the player's input is taken), the Ring's key. */
  input(p, i, it) {
    if (this.riddle && this.riddle.input(p, it)) return true;
    if (it.ringPressed && p.ch.id === 'bilbo' && this.ring.found) this.ring.toggle(p);
    return false;
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    const game = this.game;
    this.ring.update(dt);
    // Bench: `?ring=1` puts the Ring on the first player (Bilbo) for the shadow-world measurement.
    if (game.bench && game.params?.get('ring') === '1' && game.players[0]?.ch.id === 'bilbo') {
      this.ring.found = true;
      game.players[0].ringOn = true;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    // Seconds since each player last took the Ring off (he keeps following a little while).
    for (const p of game.players) p.ringOffT = p.ringOn ? 0 : (p.ringOffT ?? 99) + dt;
    this.t += dt;
    if (this.sites.active || this.mode === 'follow') this.behave(dt);
    const pose = this.body.pose;
    this.body.animate({ dt });
    pose.talk = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (this.riddle) {
      const r = this.riddle;
      if (!this.active(r.challenger) && r.phase !== 'end' && r.phase !== 'done') r.abort();
      else r.update(dt);
    }
    this.updateHints(dt);
  }

  /** Gollum's state machine. */
  behave(dt) {
    const game = this.game;
    const s = this.sites;
    const inCave = game.players.filter((p) => this.active(p) && s.inside(p.pos.x, p.pos.y, p.pos.z));
    const pose = this.body.pose;
    const wearer = this.followTarget();
    // Breadcrumbs of the Ring's bearer: Gollum follows exactly where he went (no path finding needed).
    if (wearer) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.4;
        const last = this.trail[this.trail.length - 1];
        if (!last || last.distanceTo(wearer.pos) > 0.5) this.trail.push(wearer.pos.clone());
        if (this.trail.length > 160) this.trail.shift();
      }
    }
    if (inCave.length) this.emptyT = 0;
    else this.emptyT += dt;
    pose.paddle = 0;
    pose.crawl = 0;
    pose.squat = 1;
    pose.lean = 0;
    this.boat.visible = false;
    // The nearest player he watches.
    const watch = this.nearest(inCave.length ? inCave : game.players.filter((p) => this.active(p)));
    if (watch) {
      const want = Math.atan2(-(watch.pos.x - this.pos.x), -(watch.pos.z - this.pos.z));
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      pose.look = Math.max(-1, Math.min(1, d));
      // Crouched and watching, he turns to face the player (the head leads).
      if (this.mode === 'lurk' || this.mode === 'home') this.yaw += d * Math.min(1, dt * 1.5);
    }
    // The Ring draws him out of the cave after its bearer.
    if (wearer && this.mode !== 'riddle' && this.mode !== 'follow' && this.mode !== 'snatch') this.startFollow(wearer);
    switch (this.mode) {
      case 'away':
        // Not here: he comes home to his island when the lake is about (unseen).
        if (s.island && !this.inView(s.island.x, s.island.y, s.island.z)) this.set('home', s.island);
        break;
      case 'home': {
        this.place(s.island);
        if (inCave.length && this.t > 2) {
          if (s.swimPath.length > 1) {
            this.pathS = 0;
            this.set('paddle');
          } else this.goLurk();
        }
        break;
      }
      case 'paddle': {
        // Along the boat's route, feet over the gunwales (book ch. 5).
        const path = s.swimPath;
        this.pathS += GOLLUM.paddle * dt;
        const at = this.alongPath(path, this.pathS, tmp);
        pose.paddle = 1;
        pose.squat = 0;
        const ahead = this.alongPath(path, this.pathS + 0.3, tmp2);
        this.yaw = Math.atan2(-(ahead.x - at.x), -(ahead.z - at.z));
        this.pos.set(at.x, s.waterLevel > -1e6 ? s.waterLevel - 0.1 : at.y, at.z);
        this.boat.visible = true;
        this.boat.position.copy(this.pos);
        this.boat.rotation.y = this.yaw;
        this.boat.position.y += 0.02 * Math.sin(this.t * 1.3);
        if (!at.more) {
          // Ashore: the boat stays at the water's edge.
          this.boatLeft = this.boat.position.clone();
          this.boatYaw = this.yaw;
          this.goLurk();
        }
        break;
      }
      case 'crawl':
        this.crawl(dt, this.after === 'flee' ? GOLLUM.flee : GOLLUM.crawl);
        break;
      case 'lurk': {
        this.lurkT -= dt;
        // A strong light, or the lamp too close: back into the dark.
        const glare = this.glare();
        if (glare) {
          this.goLurk(true);
          break;
        }
        this.whisper(dt, inCave);
        if (this.emptyT > GOLLUM.leaveAfter) {
          if (!this.inView(this.pos.x, this.pos.y, this.pos.z)) this.set('away');
          break;
        }
        // A player staying on the riddle beach is challenged.
        const rs = s.riddleSpot;
        const near = rs && this.cooldown <= 0 ? inCave.find((p) => Math.hypot(p.pos.x - rs.x, p.pos.y - rs.y, p.pos.z - rs.z) < GOLLUM.riddleNear && !this.isInvisible(p) && this.lightPower(p) < 2) : null;
        this.stayT = near ? this.stayT + dt : 0;
        if (near && this.stayT > GOLLUM.riddleStay) {
          this.challenger = near;
          this.walkTo(rs, 'riddle');
          near.say('Valami közeledik a sötétben… csoszogás, sziszegés…', 3);
          this.sound('gollum', this.pos);
          break;
        }
        if (this.lurkT <= 0) this.goLurk();
        break;
      }
      case 'riddle': {
        const rs = s.riddleSpot;
        this.place(rs);
        this.yaw = rs.yaw ?? this.yaw;
        if (!this.riddle) {
          if (!this.active(this.challenger)) {
            this.goLurk();
            break;
          }
          this.riddle = new RiddleGame(this, this.challenger);
          this.hint(this.challenger, 'gollum');
        }
        break;
      }
      case 'follow':
        this.follow(dt);
        break;
      case 'leave':
        this.crawl(dt, GOLLUM.flee);
        break;
      default:
        break;
    }
    // His boat waits at the shore once he has come ashore.
    if (this.boatLeft && this.mode !== 'paddle' && this.mode !== 'away' && this.mode !== 'home') {
      this.boat.visible = true;
      this.boat.position.copy(this.boatLeft);
      this.boat.rotation.y = this.boatYaw;
    }
    if (this.mode === 'home' || this.mode === 'away') this.boatLeft = null;
    // First sight: the hint, once per game.
    if (this.group.visible && this.mode !== 'away') {
      for (const p of game.players) if (this.active(p) && p.pos.distanceTo(this.pos) < 16) this.hint(p, 'gollum');
    }
  }

  set(state, at = null) {
    this.mode = state;
    this.t = 0;
    if (at) this.place(at);
  }

  place(at) {
    if (at) this.pos.set(at.x, at.y, at.z);
  }

  nearest(list) {
    let best = null;
    let bd = Infinity;
    for (const p of list) {
      const d = p.pos.distanceTo(this.pos);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** A player whose light drives him off from where he is now. */
  glare() {
    for (const p of this.game.players) {
      if (!this.active(p)) continue;
      const d = p.pos.distanceTo(this.pos);
      if (d < (this.lightPower(p) >= 2 ? GOLLUM.keepBright : GOLLUM.keepLamp * 0.6)) return p;
    }
    return null;
  }

  /** Goes to a dark lurk point: away from every lamp (far from bright ones), within sight of the players. */
  goLurk(flee = false) {
    const pts = this.sites.lurkPoints;
    if (!pts.length) {
      this.set('lurk');
      this.lurkT = 20;
      return;
    }
    const players = this.game.players.filter((p) => this.active(p));
    let best = null;
    let bs = -Infinity;
    for (const q of pts) {
      let score = Math.random() * 3;
      for (const p of players) {
        const d = Math.hypot(q.x - p.pos.x, q.y - p.pos.y, q.z - p.pos.z);
        const keep = this.lightPower(p) >= 2 ? GOLLUM.keepBright : GOLLUM.keepLamp;
        if (d < keep) score -= 20 + (keep - d) * 5;
        else if (d > 22) score -= (d - 22) * 0.5;
        if (flee) score += d * 0.3;
      }
      if (score > bs) {
        bs = score;
        best = q;
      }
    }
    this.walkTo(best, 'lurk', flee);
  }

  /** Crawls to a point, then enters `then` (unseen and blocked: he slips there through the dark). */
  walkTo(at, then, flee = false) {
    this.target = new THREE.Vector3(at.x, at.y, at.z);
    this.after = flee ? 'flee' : null;
    this.then = then;
    this.set('crawl');
  }

  crawl(dt, speed) {
    const pose = this.body.pose;
    const goal = this.target;
    if (!goal) {
      this.set('lurk');
      return;
    }
    dir.copy(goal).sub(this.pos);
    dir.y = 0;
    const dist = dir.length();
    if (dist < 0.25 || this.t > 25) {
      this.pos.copy(goal);
      this.arrive();
      return;
    }
    dir.multiplyScalar(1 / dist);
    pose.crawl = 1;
    pose.squat = 0;
    pose.speed = speed / GOLLUM.crawl;
    this.yaw = Math.atan2(-dir.x, -dir.z);
    // Blocked by rock ahead: unseen he slips on to the goal (he knows the cave's cracks), seen he waits.
    tmp.set(this.pos.x, this.pos.y + 0.35, this.pos.z);
    const hit = raycast(tmp, dir, 0.6);
    if (hit >= 0 && hit < 0.5) {
      if (!this.inView(this.pos.x, this.pos.y, this.pos.z) && !this.inView(goal.x, goal.y, goal.z)) {
        this.pos.copy(goal);
        this.arrive();
      }
      return;
    }
    const step = Math.min(dist, speed * dt);
    snapFloor(this.pos.x + dir.x * step, this.pos.y, this.pos.z + dir.z * step, tmp);
    this.pos.copy(tmp);
  }

  arrive() {
    const then = this.then || 'lurk';
    this.then = null;
    if (then === 'lurk') {
      this.set('lurk');
      this.lurkT = GOLLUM.lurkEvery[0] + Math.random() * (GOLLUM.lurkEvery[1] - GOLLUM.lurkEvery[0]);
    } else if (then === 'gone') {
      this.set('away');
    } else this.set(then);
  }

  /** A point `s` metres along a polyline (with `more` = false at its end). */
  alongPath(path, s, out) {
    let left = s;
    for (let k = 0; k + 1 < path.length; k++) {
      const a = path[k];
      const b = path[k + 1];
      const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (left <= l) {
        const u = l > 0 ? left / l : 0;
        out.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
        out.more = true;
        return out;
      }
      left -= l;
    }
    const e = path[path.length - 1];
    out.set(e.x, e.y, e.z);
    out.more = false;
    return out;
  }

  /** Whispers from the dark while players are near. */
  whisper(dt, inCave) {
    this.whisperT -= dt;
    if (this.whisperT > 0) return;
    this.whisperT = 7 + Math.random() * 8;
    const near = inCave.filter((p) => p.pos.distanceTo(this.pos) < 22);
    if (!near.length) return;
    this.sound(Math.random() < 0.5 ? 'gollum' : 'whisper', this.pos);
    if (this.body.gulp) this.body.gulp();
    const lines = ['Gollam! Gollam!', 'Sss… drágaszágom…', 'Mi az, drágaszágom? Mi jött ide?', 'Ehető-e, drágaszágom? Gollam!'];
    const line = lines[Math.floor(Math.random() * lines.length)];
    for (const p of near) p.say(`Suttogás a sötétből: „${line}”`, 3);
  }

  /* ---------------- the riddle game's outcome ---------------- */

  riddleEnded(result, players, by) {
    const game = this.game;
    const r = this.riddle;
    this.riddle = null;
    r?.dispose();
    this.cooldown = GOLLUM.cooldown;
    const msg = (t, s = 5) => {
      for (const p of players.length ? players : [by]) p?.say(t, s);
    };
    if (result === 'lose') {
      this.memory.losses++;
      const victim = by && by.bag.length ? by : players.find((p) => p.bag.length) || by;
      if (victim?.bag.length) {
        const k = Math.floor(Math.random() * victim.bag.length);
        const [f] = victim.bag.splice(k, 1);
        msg(`Gollam elkapta a zsákodból: ${f.name}. „A mienk, drágaszágom!”`);
      } else {
        const gold = Math.min(game.money, RIDDLE.stealGold[0] + Math.floor(Math.random() * (RIDDLE.stealGold[1] - RIDDLE.stealGold[0])));
        game.money -= gold;
        msg(gold > 0 ? `Üres a zsákod: Gollam ${gold} aranyat vitt el a közös erszényből.` : 'Üres a zsákod és az erszény: Gollam sziszegve elkotródik.');
      }
      this.sound('cackle', this.pos);
    } else if (result === 'win' || result === 'outlast' || result === 'pocket') {
      this.memory.wins++;
      const gold = result === 'pocket' ? RIDDLE.pocketGold : result === 'win' ? RIDDLE.winGold : RIDDLE.outlastGold;
      game.money += gold;
      msg(`Nyertél! Gollam ajándéka: ${gold} arany a közös erszénybe.`);
      if (result === 'pocket') {
        // The book: he goes for his "birthday present", finds it gone and guesses who has it.
        this.ring.won = true;
        this.thiefT = 6;
      }
    }
    game.saveNow?.();
    // Back into the dark (or home to his island by boat when there is one).
    this.goLurk(true);
  }

  /* ---------------- following the Ring ---------------- */

  /** The Ring's bearer he follows: Bilbo, worn long enough, below Goblin-town's top, wearing it now (or a moment ago). */
  followTarget() {
    if (!this.ring.found || this.ring.wornT < GOLLUM.followFrom) return null;
    for (const p of this.game.players) {
      if (p.ch.id !== 'bilbo' || !this.active(p) || p.depth < GOLLUM.followDepth) continue;
      if (p.ringOn || (p.ringOffT || 0) < 20) return p;
    }
    return null;
  }

  /** 0..1: how bold he is (how long the Ring has been worn). */
  boldness() {
    return Math.max(0, Math.min(1, (this.ring.wornT - GOLLUM.followFrom) / GOLLUM.followFull));
  }

  startFollow(p) {
    // He comes along the bearer's trail, from out of sight behind him.
    if (this.trail.length < 6) return;
    const back = this.trail[Math.max(0, this.trail.length - 25)];
    if (this.inView(back.x, back.y, back.z) && this.mode !== 'lurk' && this.mode !== 'crawl') return;
    this.followP = p;
    this.trailI = Math.max(0, this.trail.length - 25);
    if (this.mode === 'away' || this.mode === 'home' || this.mode === 'paddle') this.pos.copy(back);
    this.set('follow');
  }

  follow(dt) {
    const p = this.followP;
    const pose = this.body.pose;
    const b = this.boldness();
    if (!p || !this.followTarget()) {
      this.trail.length = 0;
      if (!this.inView(this.pos.x, this.pos.y, this.pos.z)) this.set('away');
      else this.goLurk(true);
      return;
    }
    const keep = 15 - 11.5 * b;
    const d = p.pos.distanceTo(this.pos);
    pose.lean = 0.15 * b;
    if (d > keep && this.trailI < this.trail.length) {
      // Along the trail towards him.
      const q = this.trail[Math.min(this.trailI, this.trail.length - 1)];
      dir.copy(q).sub(this.pos);
      const l = dir.length();
      if (l < 0.3) this.trailI++;
      else {
        dir.multiplyScalar(1 / l);
        const step = Math.min(l, (GOLLUM.crawl + 1.2 * b) * dt);
        this.pos.addScaledVector(dir, step);
        this.yaw = Math.atan2(-dir.x, -dir.z);
        pose.crawl = 1;
        pose.squat = 0;
        pose.speed = 1 + b;
      }
      // Far behind and unseen: he catches up through the dark.
      if (d > keep + 18 && !this.inView(this.pos.x, this.pos.y, this.pos.z)) {
        this.trailI = Math.max(this.trailI, this.trail.length - 12);
        this.pos.copy(this.trail[this.trailI]);
      }
    }
    // His cry (TERV 0.4 "Tolvaj! Zsákos!"), louder and more often as he grows bolder.
    this.whisperT -= dt;
    if (this.whisperT <= 0) {
      this.whisperT = 26 - 14 * b + Math.random() * 8;
      const line = b > 0.25 || this.ring.won ? 'Tolvaj! Tolvaj! Zsákos! Utáljuk, örökre!' : 'Sss… drágaszágom… hol van, hol van?';
      p.say(`Valaki a nyomodban: „${line}”`, 4);
      this.sound(b > 0.25 ? 'wail' : 'whisper', this.pos);
    }
    // Bold at last: he snatches a find from the bag (never the Ring, never deadly) and flees.
    this.snatchT -= dt;
    if (b >= 0.8 && d < 3.2 && this.snatchT <= 0 && p.bag.length) {
      this.snatchT = GOLLUM.snatchEvery;
      const [f] = p.bag.splice(Math.floor(Math.random() * p.bag.length), 1);
      p.kick = 0.8;
      p.say(`Gollam rád ugrott a sötétből, és kikapta a zsákodból: ${f.name}! „Tolvaj! Zsákos!”`, 5);
      this.sound('cackle', this.pos);
      this.walkTo(this.trail[Math.max(0, this.trail.length - 40)] || this.pos, 'gone', true);
      this.trail.length = 0;
    }
  }

  /* ---------------- per view ---------------- */

  /** Per view: Gollum, his boat and the Ring on the floor only in chunks this view may see. */
  cullFor(visible, i = 0) {
    this.visibleKeys[i] = visible;
    const show = this.mode !== 'away' && (this.sites.active || this.mode === 'follow');
    const k1 = chunkKey(this.pos.x, this.pos.y + 0.2, this.pos.z);
    const k2 = chunkKey(this.pos.x, this.pos.y + 0.8, this.pos.z);
    this.group.visible = show && (k1 < 0 || k2 < 0 || !!visible[k1] || !!visible[k2]);
    if (this.boat.visible || this.boatLeft || this.mode === 'paddle') {
      const kb = chunkKey(this.boat.position.x, this.boat.position.y + 0.2, this.boat.position.z);
      this.boat.visible = (this.mode === 'paddle' || !!this.boatLeft) && this.sites.active && (kb < 0 || !!visible[kb]);
    }
    this.ring.cullFor(visible);
  }

  /** Per view, before it is drawn: the Ring's shadow world for its wearer's own view. */
  viewFor(p, i, renderer, scene) {
    this.ring.viewFor(p, renderer, scene);
  }

  /* ---------------- hints (the tutorial's parchment, once per game, with that player's keys) ---------------- */

  hint(p, what) {
    const tut = this.game.tutorial;
    if (!tut?.done || !p) return;
    const id = what === 'gyuru' ? 'gyuru' : what === 'gollum' ? 'gollum' : null;
    if (!id || tut.done.has(id)) return;
    tut.done.add(id);
    const i = this.game.players.indexOf(p);
    const b = this.game.bindings[i];
    const k = b?.pad != null && !b.kbm ? KEYS.pad : KEYS[b?.kbm] || KEYS.pad;
    let text = '';
    if (id === 'gollum') text = `<b style="color:var(--gold,#e8c070)">Gollam!</b> A sötétből les rád. A lámpád fénye távol tartja. Ha a parton, a találós kérdések helyén maradsz, odajön, és találós kérdéseket ad fel: ${k.nav} választás, ${k.confirm} válasz. Ha nyersz, ajándékot ad; ha vesztesz, ellop egy leletet.`;
    else if (p.ch.id === 'bilbo') text = `<b style="color:var(--gold,#e8c070)">A Gyűrű.</b> Felhúzva (${k.ring}) láthatatlan vagy: a goblinok nem látnak. De minél tovább viseled, Gollam annál inkább a nyomodba szegődik…`;
    else text = '<b style="color:var(--gold,#e8c070)">A Gyűrű.</b> Csak Bilbó viselheti: a közös gyűjteménybe került. Bilbóként felhúzva láthatatlanná tesz.';
    this.hintUi.set(p, { t: 12, text, i });
  }

  updateHints(dt) {
    this.game.players.forEach((p, i) => {
      const el = this.game.huds[i]?.el;
      const h = this.hintUi.get(p);
      if (!el) return;
      if (!this.hintBox) this.hintBox = new Map();
      let box = this.hintBox.get(p);
      if (!box || box.parentNode !== el) {
        box = document.createElement('div');
        box.className = 'quest';
        Object.assign(box.style, { position: 'absolute', left: '50%', top: '64px', transform: 'translateX(-50%)', width: 'min(62%, 540px)', pointerEvents: 'none', zIndex: '6', display: 'none' });
        el.appendChild(box);
        this.hintBox.set(p, box);
      }
      const tb = this.game.tutorial?.ui?.get(p)?.box;
      if (h && h.t > 0 && !this.riddle?.participants().includes(p)) {
        if (box.innerHTML !== h.text) box.innerHTML = h.text;
        box.style.display = 'block';
        if (tb) tb.style.visibility = 'hidden';
        h.t -= dt;
        if (h.t <= 0) {
          this.hintUi.delete(p);
          box.style.display = 'none';
          if (tb) tb.style.visibility = '';
        }
      } else if (box.style.display !== 'none') {
        box.style.display = 'none';
        if (tb) tb.style.visibility = '';
      }
    });
    // After the pocket riddle (the book): from the dark, a little later, his cry.
    if (this.thiefT > 0) {
      this.thiefT -= dt;
      if (this.thiefT <= 0) {
        for (const p of this.game.players) if (this.active(p)) p.say('A sziget felől: „Tolvaj! Tolvaj! Zsákos! Utáljuk, örökre!”', 5);
        this.sound('wail', null);
      }
    }
  }

  /* ---------------- sounds (synthesised, like enemies/index.js) ---------------- */

  sound(kind, pos) {
    try {
      if (this.game.bench) return;
      if (pos && this.game.players.every((p) => p.choosing || p.pos.distanceTo(pos) > 30)) return;
      if (!this.audio) {
        this.audio = sharedAudio();
        if (!this.audio) return;
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
        g.gain.exponentialRampToValueAtTime(vol, t + start + Math.min(0.04, dur / 4));
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        src.connect(f).connect(g).connect(a.destination);
        src.start(t + start);
        src.stop(t + start + dur + 0.05);
      };
      const tone = (start, dur, type, f0, f1, vol) => {
        const o = a.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t + start);
        o.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(vol, t + start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(a.destination);
        o.start(t + start);
        o.stop(t + start + dur + 0.05);
      };
      switch (kind) {
        // The throaty swallow, "gollum": two low gulps.
        case 'gollum': burst(0, 0.16, 'bandpass', 260, 140, 0.5, 3); burst(0.24, 0.2, 'bandpass', 220, 110, 0.55, 3); tone(0.24, 0.18, 'sine', 120, 80, 0.06); break;
        case 'hiss': burst(0, 0.7, 'highpass', 3500, 5200, 0.12, 0.8); break;
        case 'whisper': for (let k = 0; k < 5; k++) burst(k * 0.16, 0.14, 'bandpass', 1400 + 500 * Math.sin(k * 2.1), 1900, 0.06, 4); break;
        case 'cackle': for (let k = 0; k < 5; k++) burst(k * 0.12, 0.09, 'bandpass', 900, 600, 0.25, 5); break;
        case 'wail': tone(0, 0.9, 'sawtooth', 700, 320, 0.05); burst(0, 0.9, 'bandpass', 1800, 900, 0.12, 3); break;
        case 'ringOn': tone(0, 1.4, 'sine', 880, 660, 0.05); burst(0, 1.2, 'lowpass', 300, 60, 0.3); break;
        case 'ringOff': tone(0, 0.6, 'sine', 660, 880, 0.04); break;
        default: break;
      }
    } catch {
      /* audio unavailable */
    }
  }
}
