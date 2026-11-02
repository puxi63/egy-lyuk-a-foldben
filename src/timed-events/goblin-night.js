/* ==== timed-events/goblin-night.js — goblin night on the day clock (TERV 0.11/5 "Goblin-éjszaka", NOTES-12-events) ====
   Every few game days, at dusk, goblins break into the pit from side tunnels for the night. The waves themselves (the
   drums, Sting's glow, the side tunnel, the raiders) are the goblin module's (enemies/index.js startRaid / breakOut);
   this module decides when and near whom, keeps the raiders about the company, and sends them home at dawn.
   - Gating: only once a player has been down to Goblin-town (layer 4, maxDepth ≥ LAYER_TOPS[3]); the first raid comes at
     the first dusk at least one game day after that, then every NIGHT_RAID.everyDays days.
   - Where: next to the deepest player in the pit (deeper than NIGHT_RAID.inPit, not in Bag End). Nobody in the pit at
     dusk: the drums warn, and the goblins lurk in the pit — the first wave comes out next to whoever goes down before
     dawn (so the break-out is in the upper shaft, by the pit's mouth). Staying home or sleeping in the bed is safe.
   - Normal mode: they steal finds (goblins.js steal) and flee when hit or scared; Kihívás mode (`enemies.challenge`) a
     grab also hurts and can kill (goblins.js). At dawn every raider flees and slinks off.
   Off on the bench pages, during the finale and when a QA script switched raids off (`enemies.raidT = 1e9`). ==== */
import { LAYER_TOPS } from '../materials.js';

export const NIGHT_RAID = {
  everyDays: 3, // a raid night every 3rd game day (3 × 20 real minutes = one hour of play)
  afterUnlock: 1, // the first raid: the first dusk at least this many game days after reaching Goblin-town
  unlockDepth: LAYER_TOPS[3], // Goblin-town's top (150 m)
  inPit: 4, // a player deeper than this is "in the pit" (a raid target)
  waves: 3, // at most this many waves in one night…
  waveGap: [45, 75], // …the next one this many real seconds after the previous wave is gone (the night is 5.5 minutes)
};

export class GoblinNight {
  constructor(game) {
    this.game = game;
    /** The game day Goblin-town was first reached (null: not yet) and the day of the last raid night (saved). */
    this.unlockDay = null;
    this.lastDay = null;
    /** The running raid night: { day, wave, gapT } or null. */
    this.night = null;
    /** QA: allows raids on a bench page. */
    this.force = false;
    this.pollT = 0;
    this.tickT = 0;
    game.events?.on('dusk', (info) => this.dusk(info));
    game.events?.on('dawn', () => this.end('dawn'));
  }

  get enabled() {
    return this.force || (!this.game.bench && !this.game.enemies?.raidsOff);
  }

  /** The finale's scenes run (the escape from Smaug, the epilogue): no raid. */
  blocked() {
    const st = this.game.finale?.stage;
    return st != null && st !== 'idle' && st !== 'done';
  }

  /** A player the raiders go for: in the pit, not riding, not in Bag End (enemies.canTarget) and deep enough. */
  inPit(p) {
    return !!this.game.enemies?.canTarget(p) && p.depth > NIGHT_RAID.inPit;
  }

  deepestInPit() {
    let best = null;
    for (const p of this.game.players) if (this.inPit(p) && (!best || p.depth > best.depth)) best = p;
    return best;
  }

  checkUnlock() {
    if (this.unlockDay != null || !this.game.dayClock) return;
    if (this.game.players.some((p) => (p.maxDepth || 0) >= NIGHT_RAID.unlockDepth)) this.unlockDay = this.game.dayClock.day();
  }

  /** Is the night starting on `day` a raid night? */
  due(day) {
    if (this.unlockDay == null || day - this.unlockDay < NIGHT_RAID.afterUnlock) return false;
    return this.lastDay == null || day - this.lastDay >= NIGHT_RAID.everyDays;
  }

  dusk(info) {
    if (!this.enabled || this.blocked() || this.night) return;
    this.checkUnlock();
    if (this.due(info.day)) this.begin(info.day);
  }

  /** Starts a raid night. With somebody in the pit the first wave comes at once (update); else the drums warn. */
  begin(day) {
    this.lastDay = day;
    this.night = { day, wave: 0, gapT: 0 };
    if (this.deepestInPit()) return;
    const E = this.game.enemies;
    for (const q of this.game.players) {
      if (!q.choosing) q.say('Dobszó szól a gödör mélyéből… Goblin-éjszaka! Ma éjjel goblinok lesnek a gödörben. Zsáklakban biztonságban vagytok.', 6);
    }
    E.raidWarning = 6;
    E.sound('drums', null);
  }

  /** The night is over (dawn, or the finale began): every raider flees and slinks off; a pending wave is called off. */
  end(reason) {
    if (!this.night) return;
    this.night = null;
    const E = this.game.enemies;
    if (!E) return;
    E.raidPending = null;
    let any = false;
    for (const g of E.list) {
      if (!g.raider || g.state === 'gone') continue;
      any = true;
      g.release?.();
      g.scared = true;
      g.target = null;
      const from = this.nearestPlayer(g.pos)?.pos || g.pos;
      g.flee(from, 12);
    }
    if (reason === 'dawn' && any) {
      for (const q of this.game.players) if (!q.choosing && q.depth > 1) q.say('Hajnalodik: a goblinok visszahúzódnak a járataikba.', 4);
    }
  }

  nearestPlayer(pos, filter = (p) => this.inPit(p)) {
    let best = null;
    let bd = Infinity;
    for (const p of this.game.players) {
      if (!filter(p)) continue;
      const d = p.pos.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  update(dt) {
    this.pollT -= dt;
    if (this.pollT <= 0) {
      this.pollT = 1;
      this.checkUnlock();
    }
    const n = this.night;
    if (!n) return;
    const D = this.game.dayClock;
    if (D && !D.isNight()) {
      this.end('dawn');
      return;
    }
    if (this.blocked()) {
      this.end('finale');
      return;
    }
    const E = this.game.enemies;
    const raiders = E.list.filter((g) => g.raider && g.state !== 'gone');
    if (raiders.length) {
      // On a raid night they know the company is down there: they prowl about the nearest player and go for him
      // when close (a patrolling goblin elsewhere only notices the lamp or the digging).
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = 1;
        for (const g of raiders) {
          if (g.state !== 'patrol') continue;
          const p = this.nearestPlayer(g.pos);
          if (!p) continue;
          g.home.copy(p.pos);
          if (p.pos.distanceTo(g.pos) < 14) {
            g.target = p;
            g.set('alert');
          }
        }
      }
      return;
    }
    if (E.raidPending || n.wave >= NIGHT_RAID.waves) return;
    n.gapT -= dt;
    if (n.gapT > 0) return;
    const p = this.deepestInPit();
    if (!p) return;
    const text = n.wave === 0 ? null : 'Újra dobszó a mélyből… a goblinok visszatérnek!';
    E.startRaid(p, null, text, () => this.deepestInPit());
    n.wave++;
    n.gapT = NIGHT_RAID.waveGap[0] + Math.random() * (NIGHT_RAID.waveGap[1] - NIGHT_RAID.waveGap[0]);
  }

  /** { u: unlock day, l: last raid day } (raid nights in progress are not saved: a reload starts calm). */
  state() {
    const out = {};
    if (this.unlockDay != null) out.u = this.unlockDay;
    if (this.lastDay != null) out.l = this.lastDay;
    return out;
  }

  restore(s) {
    this.unlockDay = s?.u ?? null;
    this.lastDay = s?.l ?? null;
  }
}
