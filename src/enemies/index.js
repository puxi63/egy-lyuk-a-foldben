/* ==== enemies/index.js — the enemies of the game (phase 2: the goblins): spawning in Goblin-town (enemies/sites.js
   provider), goblin night (TERV 0.11/5), the drive-off combat (combat.js), Sting (sting.js), the armour counter rows
   (armour.js), stolen finds dropped on the floor, the first-goblin hint, per-view culling and the sounds.
   Wiring (game.js): `new Enemies(game)`, `update(dt)` once per frame after the players, `input(p, i, it)` per player
   when no menu is open, `cullFor(visible)` per view; player.tryDig asks `strike(p, o, d)` first; hud.js adds
   `shopRows(p, cost)`. Goblins are never saved: they respawn on load. ==== */
import * as THREE from 'three';
import { sharedAudio } from '../audio.js';
import { LAYER_TOPS } from '../materials.js';
import { digSphere, raycast, sdf } from '../world.js';
import { armourRows } from './armour.js';
import { Combat, COMBAT } from './combat.js';
import { GOBLIN_LOOKS, GoblinBody, weaponMesh } from './goblin-body.js';
import { Goblin, GOBLIN, randomLook } from './goblins.js';
import { chunkKey, floorBelow, GoblinSites } from './sites.js';
import { Sting } from './sting.js';
import { Trolls } from '../trolls/index.js'; // trolls (NOTES-24-trolls)

/** NOTES-37-blast-eagles: goblins this far (m) from Gandalf's charge hear it go off. */
const BLAST_HEAR = 30;

/**
 * Goblin night (TERV 0.11/5): the warning and the break-out of one wave. When and where a raid comes is decided by
 * timed/goblin-night.js on the day clock (NOTES-12-events): every few game days at dusk, once Goblin-town was reached.
 * `warn` seconds of drums before the goblins come out; `goblins` per wave (+`perExtraPlayer` in co-op), never more than
 * GOBLIN.maxActive goblins about at once.
 */
export const RAID = { minDepth: LAYER_TOPS[1], warn: 6, goblins: 3, perExtraPlayer: 1 };

/** Key names per control scheme, in the style of tutorial.js (the hint names the exact keys of that player). */
const KEYS = {
  mouse: { dig: 'bal egérgomb', throw: 'G vagy középső egérgomb', ability: 'X' },
  keys2: { dig: 'U', throw: 'Ő', ability: 'Á' },
  pad: { dig: 'RT', throw: 'B', ability: 'a d-pad bal' },
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.sites = new GoblinSites();
    this.combat = new Combat(this);
    this.sting = new Sting(this);
    // trolls (NOTES-24-trolls): the stone trolls that wake when somebody digs in the dark in their cave.
    this.trolls = new Trolls(game);
    /** Kihívás mód (TERV 0.6): set by modes/ (NOTES-15-modes) from the game's mode; a grab also hurts (goblins.js steal()). */
    this.challenge = false;
    this.noiseT = [0, 0];
    this.spawnT = 2;
    // Goblin night is driven by timed/goblin-night.js (NOTES-12-events). Older QA scripts switch raids off with
    // `raidT = 1e9`: goblin-night.js honours that (raidsOff).
    this.raidT = 0;
    this.raidWarning = 0;
    this.raidPending = null;
    this.drops = []; // stolen finds lying on the floor: { mesh, type, vel, rest }
    // Other foes that the drive-off combat can hit (mirkwood-foes/: the spiders and the elf guards). Each source is a
    // function returning an array of agents with pos, scale, state, hit(fromX, fromZ, power, kind) and optionally
    // hitY0 / hitY1 / hitR (their body capsule) and stingGlow (Sting glows near them).
    this.foeSources = [];
    this.foeBuf = [];
    this.hintUi = new Map();
    this.visibleKeys = [null, null];
    this.audio = null;
    // Shader warm-up: game.js compiles every visible material at start (renderer.compile); the weapons, stones and
    // arrows are shown for that one compile so the first goblin does not stall a frame. Hidden again on the first update.
    this.warm = new THREE.Group();
    this.warm.add(weaponMesh('club'), weaponMesh('cleaver'));
    this.warm.scale.setScalar(1e-4);
    this.warm.position.set(0, -1000, 0);
    game.scene.add(this.warm);
    this.combat.stoneMesh.visible = true;
    this.combat.arrowMesh.visible = true;
    // The skinned body's program is not in that compile (the bodies load later and the own body is not drawn), so the
    // first goblin in view stalled a frame (~150 ms): compile it once a goblin body has loaded.
    const probe = new GoblinBody(GOBLIN_LOOKS[0]);
    probe.ready.then(() => {
      if (!probe.mesh || !game.players.length) return;
      probe.group.position.set(0, -1000, 0);
      game.scene.add(probe.group);
      game.warmPrograms();
      game.scene.remove(probe.group);
      probe.mesh.skeleton?.dispose();
    });
  }

  /* ---------------- queries used by the agents and combat ---------------- */

  /** A player the goblins may go after (alive, in the pit, not riding, not in Bag End or the menus). */
  canTarget(p) {
    // The Ring's wearer is invisible to them (gollum/ring.js isInvisible): they lose track of him.
    return p && p.dead <= 0 && !p.choosing && !p.riding && p.depth > 1 && !this.game.bagEnd?.isInside(p) && !this.game.gollum?.isInvisible(p);
  }

  canGrab(p) {
    return this.canTarget(p) && !p.held && (p.graceT || 0) <= 0;
  }

  /** Light strength of a player: 1 the hobbit lamp; 2+ a strong light (the dwarf miner's lamp, Gandalf's staff) scares
   * goblins (TERV 0.4). The Fény upgrades are not built yet: they set `p.lightPower`. */
  lightPower(p) {
    return p.lightPower ?? 1;
  }

  /** Registers another foe source for the combat (see foeSources in the constructor). */
  addFoes(fn) {
    this.foeSources.push(fn);
  }

  /** Every foe the combat can hit: the goblins and the registered sources (one reused array). */
  allFoes() {
    const out = this.foeBuf;
    out.length = 0;
    for (const g of this.list) out.push(g);
    for (const fn of this.foeSources) for (const g of fn()) out.push(g);
    return out;
  }

  /** The nearest goblin's distance to a point (Infinity without goblins); foes marked stingGlow (the spiders) count. */
  nearestGoblin(pos, goblinsOnly = false) {
    let best = Infinity;
    for (const g of this.list) best = Math.min(best, g.pos.distanceTo(pos));
    if (goblinsOnly) return best;
    for (const fn of this.foeSources) for (const g of fn()) if (g.stingGlow && g.state !== 'gone') best = Math.min(best, g.pos.distanceTo(pos));
    return best;
  }

  /** Squared distance test of a point against a foe's body capsule (a vertical segment), radius r. */
  foeTouches(g, x, y, z, r) {
    const y0 = g.pos.y + (g.hitY0 ?? 0.15);
    const y1 = g.pos.y + (g.hitY1 ?? 1.25 * g.scale);
    const cy = Math.max(y0, Math.min(y1, y));
    const rr = r + (g.hitR || 0);
    return (x - g.pos.x) ** 2 + (y - cy) ** 2 + (z - g.pos.z) ** 2 < rr * rr;
  }

  /** A goblin whose body capsule a ray hits within `reach`, nearest first. */
  goblinOnRay(o, d, reach, r) {
    let best = null;
    let bt = reach;
    for (const g of this.allFoes()) {
      if (g.state === 'gone' || g.unhittable) continue;
      // Closest approach of the ray to the body's axis (a vertical segment), sampled along the ray.
      for (let t = 0.2; t <= bt; t += 0.1) {
        const x = o.x + d.x * t;
        const y = o.y + d.y * t;
        const z = o.z + d.z * t;
        if (this.foeTouches(g, x, y, z, r)) {
          // Not through rock: the soil between blocks the blow.
          if (raycast(o, d, t) < 0) {
            best = g;
            bt = t;
          }
          break;
        }
      }
    }
    return best;
  }

  /** A goblin whose body is within r of a point. */
  goblinNear(pos, r) {
    for (const g of this.allFoes()) {
      if (g.state === 'gone' || g.unhittable) continue;
      if (this.foeTouches(g, pos.x, pos.y, pos.z, r)) return g;
    }
    return null;
  }

  /** True when a point is at least `d` metres from every player in the game. */
  farFromPlayers(pos, d) {
    return this.game.players.every((p) => p.choosing || p.pos.distanceTo(pos) > d);
  }

  /** The next patrol waypoint of a goblin: Goblin-town's patrol points near its home, or a random spot nearby. */
  waypoint(g) {
    const pts = this.sites.patrolPoints().filter((q) => Math.hypot(q.x - g.home.x, q.y - g.home.y, q.z - g.home.z) < 14);
    if (pts.length) {
      const q = pts[Math.floor(Math.random() * pts.length)];
      return new THREE.Vector3(q.x, q.y, q.z);
    }
    const a = Math.random() * Math.PI * 2;
    const r = 1.5 + Math.random() * 4;
    return new THREE.Vector3(g.home.x + Math.cos(a) * r, g.home.y, g.home.z + Math.sin(a) * r);
  }

  /* ---------------- events from the agents ---------------- */

  onGrab(g, p) {
    p.say('Egy goblin elkapott! Rázd le: nyomd többször az ásás gombot!', 3);
    for (const q of this.game.players) if (q !== p && !q.choosing) q.say(`${p.ch.name}t elkapta egy goblin! Üsd meg, hogy elengedje!`, 3);
  }

  /** A looter was hit: the find falls to the floor, to be picked up by touching it. */
  dropLoot(g) {
    const type = g.loot;
    g.setLoot(null);
    if (!type) return;
    const mesh = new THREE.Mesh(this.game.finds.geo.get(type.id), this.game.finds.mat.get(type.id));
    g.centre(mesh.position);
    this.game.scene.add(mesh);
    this.drops.push({ mesh, type, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2), rest: false, t: 0 });
  }

  lootLost(g) {
    const type = g.loot;
    g.setLoot(null);
    if (!type) return;
    for (const p of this.game.players) if (!p.choosing) p.say(`A goblin eltűnt a sötétben: ${type.name} odaveszett.`, 3.5);
  }

  /* ---------------- input, strikes and the counter ---------------- */

  /** A player's combat keys (no menu open): the stone throw and the character ability; the held player struggles. */
  input(p, i, it) {
    if (p.dead > 0 || p.choosing || p.riding) return;
    if (this.trolls.input(p, i, it)) return; // trolls (NOTES-24-trolls): "Hajnal!" (also while a troll holds him)
    if (p.held) {
      if (it.digPressed) {
        p.struggle = (p.struggle || 0) + 1;
        p.kick = 0.6;
        if (p.struggle >= GOBLIN.struggle) {
          const g = p.held;
          g.hit(p.pos.x, p.pos.z, 0.8, 'struggle');
          if (!g.isTroll) p.say('Lerázod a goblint!', 2); // trolls (NOTES-24-trolls): a troll says its own line
          p.graceT = 1.5;
        }
      }
      return;
    }
    if (this.game.bagEnd?.isInside(p)) return;
    if (it.throwPressed) this.combat.throwStone(p);
    if (it.abilityPressed) this.combat.ability(p);
  }

  /** player.tryDig: a goblin in front takes the blow instead of the soil. */
  strike(p, o, d) {
    return this.combat.strike(p, o, d);
  }

  /** A swing that bit the soil gives a stone back (player.tryDig). */
  dug(p) {
    p.stones = Math.min(COMBAT.stonesMax, (p.stones ?? COMBAT.stonesMax) + 1);
    this.trolls.dug(p); // trolls (NOTES-24-trolls): digging in the dark in the troll cave is heard
  }

  /**
   * NOTES-37-blast-eagles: Gandalf's charge went off at `pos` (exits.js blast), lit by player `by`. Goblins within
   * BLAST_HEAR m that are not busy rush at the nearest player they may go after (the one who lit it first), or go to look
   * at the blast when nobody is there; in and around the troll cave the nearest stone troll wakes at once (no warning:
   * the blast is louder than any digging), unless Gandalf's "Hajnal!" or the dawn still keeps them stone (`calmT`) or the
   * page is a quiet bench page. Returns what woke (QA).
   */
  blast(pos, by) {
    let goblins = 0;
    for (const g of this.list) {
      if (g.state !== 'patrol' || g.pos.distanceTo(pos) > BLAST_HEAR) continue;
      let target = this.canTarget(by) && by.pos.distanceTo(g.pos) < BLAST_HEAR + 10 ? by : null;
      if (!target) {
        let bd = BLAST_HEAR + 10;
        for (const p of this.game.players) {
          const d = this.canTarget(p) ? p.pos.distanceTo(g.pos) : Infinity;
          if (d < bd) {
            bd = d;
            target = p;
          }
        }
      }
      if (target) {
        g.target = target;
        g.set('alert');
        g.screech = 0.6;
        this.sound('screech', g.pos);
      } else {
        g.way = pos.clone();
        g.t = 0;
      }
      goblins++;
    }
    let troll = null;
    const tr = this.trolls;
    if (tr && !tr.quiet && tr.list.length && tr.calmT <= 0 && tr.inCave(pos, 6)) {
      const near = tr.near();
      const target = near.includes(by) ? by : near[0];
      const t = target && tr.nearestStone(pos);
      if (t) {
        tr.wake(t, target);
        tr.stage = 'stir';
        tr.stirT = Math.max(tr.stirT || 0, 6);
        tr.stirE = Math.max(tr.stirE || 0, 1.2);
        troll = t.name;
      }
    }
    return { goblins, troll };
  }

  /** Counter rows for the Green Dragon (hud.js). */
  shopRows(p, cost) {
    return [...armourRows(p, cost), ...this.trolls.shopRows(p, cost)]; // trolls (NOTES-24-trolls): "Gandalf hangja"
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    const game = this.game;
    if (this.warm) {
      game.scene.remove(this.warm);
      this.warm = null;
    }
    // Digging is noise for a moment (Bilbo's is quieter: goblins.js notices()).
    game.players.forEach((p, i) => {
      this.noiseT[i] = Math.max(0, this.noiseT[i] - dt);
      if (game.intents[i]?.dig && !p.held) this.noiseT[i] = 1.5;
      p.graceT = Math.max(0, (p.graceT || 0) - dt);
    });
    this.spawn(dt);
    this.raid(dt);
    for (const g of this.list) g.update(dt);
    // Gone: escaped looters, and goblins far from everybody that nobody sees.
    for (const g of this.list) {
      if (g.state === 'gone') continue;
      if (g.state !== 'grab' && !g.loot && this.farFromPlayers(g.pos, GOBLIN.despawn) && !this.seen(g)) g.set('gone');
      if (g.pos.y < -400) g.set('gone');
    }
    if (this.list.some((g) => g.state === 'gone')) {
      for (const g of this.list) if (g.state === 'gone') g.dispose();
      this.list = this.list.filter((g) => g.state !== 'gone');
    }
    this.combat.update(dt);
    this.sting.update(dt);
    this.trolls.update(dt); // trolls (NOTES-24-trolls)
    this.updateDrops(dt);
    this.updateHints(dt);
  }

  /** Whether a goblin was in a chunk some view could see in the last frame. */
  seen(g) {
    const k = chunkKey(g.pos.x, g.pos.y + 0.7, g.pos.z);
    return this.visibleKeys.some((v) => v && (k < 0 || v[k]));
  }

  /** Goblin-town keeps up to GOBLIN.maxActive goblins around the players inside it, appearing out of sight. */
  spawn(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 1;
    const inTown = this.game.players.filter((p) => this.canTarget(p) && this.sites.inside(p.pos.x, p.pos.y, p.pos.z));
    if (!inTown.length || this.list.length >= GOBLIN.maxActive) return;
    const pts = this.sites.spawnPoints().filter((q) => {
      const d = Math.min(...inTown.map((p) => Math.hypot(q.x - p.pos.x, q.y - p.pos.y, q.z - p.pos.z)));
      if (d < 7 || d > 32) return false;
      const k = chunkKey(q.x, q.y + 0.7, q.z);
      // Out of sight when possible: not in a chunk a view saw last frame (close points are always allowed for the
      // test cavity, which is all in view).
      return !this.visibleKeys.some((v) => v && k >= 0 && v[k]) || this.sites.tests.length > 0;
    });
    if (!pts.length) return;
    const q = pts[Math.floor(Math.random() * pts.length)];
    this.add(q.x, q.y, q.z);
    this.spawnT = 3 + Math.random() * 4;
  }

  /** Adds a goblin at a floor point. */
  add(x, y, z, look = randomLook()) {
    const g = new Goblin(this, look, x, y, z);
    this.list.push(g);
    return g;
  }

  /* ---------------- goblin night ---------------- */

  /** True when a QA script switched goblin nights off (`raidT = 1e9`, the old play-time timer's off switch). */
  get raidsOff() {
    return this.raidT >= 1e8;
  }

  /** The pending break-out of a wave (timed/goblin-night.js starts it with startRaid). */
  raid(dt) {
    this.raidWarning = Math.max(0, this.raidWarning - dt);
    if (!this.raidPending) return;
    this.raidPending.t -= dt;
    if (this.raidPending.t <= 0) {
      const r = this.raidPending;
      this.raidPending = null;
      // The target may have gone up meanwhile: then the deepest one still in the pit, else nobody (no wave).
      const p = this.canTarget(r.p) ? r.p : r.fallback?.();
      if (p) this.breakOut(p, r.n);
    }
  }

  /**
   * Starts one wave of a goblin night at player p: a warning (drums, Sting's glow, the message), then the break-out
   * a few seconds later. `n` goblins (default: RAID.goblins + RAID.perExtraPlayer per extra player); `text` the message;
   * `fallback()` picks another target if p left the pit during the warning.
   */
  startRaid(p, n = null, text = null, fallback = null) {
    const count = n ?? RAID.goblins + RAID.perExtraPlayer * (this.game.players.length - 1);
    this.raidWarning = RAID.warn + 4;
    this.raidPending = { p, t: RAID.warn, n: count, fallback };
    const msg = text || 'Dobszó a mélyből… Goblin-éjszaka! Goblinok törnek elő az oldaljáratokból!';
    for (const q of this.game.players) if (!q.choosing) q.say(msg, 5);
    this.sound('drums', p.pos);
  }

  /** The raiders come out of a side tunnel near p: Goblin-town's tunnel mouths, or a tunnel stamped into the wall. */
  breakOut(p, count = null) {
    const want = count ?? RAID.goblins + RAID.perExtraPlayer * (this.game.players.length - 1);
    // Never more than GOBLIN.maxActive goblins about (Goblin-town's own ones count).
    const n = Math.max(0, Math.min(want, GOBLIN.maxActive - this.list.filter((g) => g.state !== 'gone').length));
    if (!n) return;
    let mouth = null;
    const mouths = this.sites.tunnelMouths().filter((m) => Math.hypot(m.x - p.pos.x, m.y - p.pos.y, m.z - p.pos.z) < 25);
    if (mouths.length) {
      const m = mouths[Math.floor(Math.random() * mouths.length)];
      mouth = { x: m.x, y: m.y, z: m.z, nx: m.nx, nz: m.nz };
    } else mouth = this.stampTunnel(p);
    if (!mouth) return;
    for (let k = 0; k < n; k++) {
      // In the tunnel, one behind the other, already rushing out at the players.
      const back = 0.6 + k * 0.7;
      const x = mouth.x - mouth.nx * back;
      const z = mouth.z - mouth.nz * back;
      const f = floorBelow(x, mouth.y + 0.6, z, 3) || { x, y: mouth.y, z };
      const g = this.add(f.x, f.y, f.z);
      g.raider = true;
      g.home.copy(p.pos);
      g.target = p;
      g.set('alert', -0.3 * k);
    }
  }

  /** A side tunnel dug into the shaft wall beside p (TERV h: spawn points stamped into the terrain). */
  stampTunnel(p) {
    const o = new THREE.Vector3(p.pos.x, p.pos.y + 0.7, p.pos.z);
    const start = Math.random() * Math.PI * 2;
    // A wall at least 1.6 m off first; in a narrow shaft (every wall nearer) the nearest acceptable one, so a raid night
    // still finds the player who digs a body-wide shaft (it silently brought nobody there; NOTES-29-final).
    for (let k = 0; k < 16; k++) {
      const a = start + (k / 8) * Math.PI * 2;
      const d = tmp.set(Math.sin(a), 0, Math.cos(a));
      const t = raycast(o, d, 9);
      if (t < (k < 8 ? 1.6 : 0.3)) continue;
      const wall = tmp2.copy(o).addScaledVector(d, t);
      for (let s = 0; s < 5; s++) digSphere(wall.x + d.x * (s * 0.8 - 0.3), wall.y + 0.1, wall.z + d.z * (s * 0.8 - 0.3), 0.85);
      const inner = wall.clone().addScaledVector(d, 2.6);
      if (sdf(inner.x, inner.y, inner.z) > -0.2) continue; // the block's wall would not give way
      return { x: wall.x, y: p.pos.y, z: wall.z, nx: -d.x, nz: -d.z };
    }
    // No wall within reach in any direction (a big open cave): they come out of the dark across its floor, 7 m off.
    for (let k = 0; k < 8; k++) {
      const a = start + (k / 8) * Math.PI * 2;
      const d = tmp.set(Math.sin(a), 0, Math.cos(a));
      if (raycast(o, d, 9) >= 0) continue;
      const f = floorBelow(o.x + d.x * 7, o.y + 0.5, o.z + d.z * 7, 4);
      if (f) return { x: f.x, y: f.y, z: f.z, nx: -d.x, nz: -d.z };
    }
    return null;
  }

  /* ---------------- stolen finds on the floor ---------------- */

  updateDrops(dt) {
    if (!this.drops.length) return;
    for (const dr of this.drops) {
      dr.t += dt;
      if (!dr.rest) {
        dr.vel.y -= 9.8 * dt;
        dr.mesh.position.addScaledVector(dr.vel, dt);
        if (sdf(dr.mesh.position.x, dr.mesh.position.y - 0.05, dr.mesh.position.z) > 0) {
          dr.mesh.position.addScaledVector(dr.vel, -dt);
          dr.rest = true;
        }
      }
      dr.mesh.rotation.y += dt * 1.5;
      for (const p of this.game.players) {
        if (p.dead > 0 || p.choosing || dr.t < 0.4) continue;
        if (p.pos.distanceTo(tmp.copy(dr.mesh.position).setY(dr.mesh.position.y - 0.4)) < 1.0) {
          if (p.bag.length >= p.bagCap) {
            if (!dr.warned) p.say('Tele a zsák: nem fér el a lelet.', 2);
            dr.warned = true;
            continue;
          }
          p.bag.push(dr.type);
          p.say(`Visszaszerezted: ${dr.type.name}`, 2.5);
          this.game.scene.remove(dr.mesh);
          dr.taken = true;
          break;
        }
      }
    }
    this.drops = this.drops.filter((d) => !d.taken);
  }

  /* ---------------- per view ---------------- */

  /** Per view: goblins, drops and Sting show only in chunks this view may see (terrain.cullFor's mask). */
  cullFor(visible, viewIndex = 0) {
    this.visibleKeys[viewIndex] = visible;
    for (const g of this.list) {
      const k1 = chunkKey(g.pos.x, g.pos.y + 0.2, g.pos.z);
      const k2 = chunkKey(g.pos.x, g.pos.y + 1.2, g.pos.z);
      g.group.visible = k1 < 0 || k2 < 0 || !!visible[k1] || !!visible[k2];
    }
    for (const dr of this.drops) {
      const k = chunkKey(dr.mesh.position.x, dr.mesh.position.y, dr.mesh.position.z);
      dr.mesh.visible = k < 0 || !!visible[k];
    }
    this.sting.cullFor(visible);
  }

  /* ---------------- the first-goblin hint ---------------- */

  /** Marks a hint step done for a player (strikes and throws teach themselves). */
  hinted(p, what) {
    p.goblinHintDone = (p.goblinHintDone || 0) + (what === 'hit' || what === 'stone-hit' ? 1 : 0);
  }

  /**
   * The first time a goblin comes near a player: one goal box (the tutorial's parchment style) with that player's own
   * keys for the pick and the stones (and Kíli's bow / Bombur's charge). Shown once per game (saved with the tutorial).
   */
  updateHints(dt) {
    const game = this.game;
    game.players.forEach((p, i) => {
      const el = game.huds[i]?.el;
      if (!el) return;
      let ui = this.hintUi.get(p);
      if (!ui || ui.root !== el) {
        ui = { root: el, box: document.createElement('div'), t: 0, text: '' };
        ui.box.className = 'quest';
        Object.assign(ui.box.style, { position: 'absolute', left: '50%', top: '64px', transform: 'translateX(-50%)', width: 'min(62%, 540px)', pointerEvents: 'none', zIndex: '6', display: 'none' });
        el.appendChild(ui.box);
        this.hintUi.set(p, ui);
      }
      // The stone pocket (and the ability's readiness), shown while goblins are about or the pocket is not full.
      if (!ui.line) {
        ui.line = document.createElement('div');
        Object.assign(ui.line.style, {
          position: 'absolute', left: '50%', bottom: '104px', transform: 'translateX(-50%)', fontSize: '14px', color: 'var(--gold, #e8c070)',
          textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '3', whiteSpace: 'nowrap',
        });
        el.appendChild(ui.line);
        ui.lineText = null;
      }
      {
        const b0 = game.bindings[i];
        const k0 = b0?.pad != null && !b0.kbm ? KEYS.pad : KEYS[b0?.kbm] || KEYS.pad;
        const stones = p.stones ?? COMBAT.stonesMax;
        const near = this.nearestGoblin(p.pos) < 25;
        let text = '';
        if (!p.choosing && p.dead <= 0 && (near || stones < COMBAT.stonesMax)) {
          text = `Kövek: ${stones} — ${k0.throw.split(' ')[0]}`;
          if (p.ch.id === 'kili') text += ` · Íj: ${p.abilityCd > 0 ? '…' : 'kész'} — ${k0.ability}`;
          if (p.ch.id === 'bombur') text += ` · Roham: ${p.abilityCd > 0 ? `${Math.ceil(p.abilityCd)} mp` : 'kész'} — ${k0.ability}`;
        }
        if (text !== ui.lineText) {
          ui.lineText = text;
          ui.line.textContent = text;
        }
      }
      const done = game.tutorial?.done?.has('goblin');
      if (!done && !ui.t && this.canTarget(p) && this.nearestGoblin(p.pos, true) < 14) {
        ui.t = 12;
        game.tutorial?.done?.add('goblin');
        const b = game.bindings[i];
        const k = b?.pad != null && !b.kbm ? KEYS.pad : KEYS[b?.kbm] || KEYS.pad;
        let extra = '';
        if (p.ch.id === 'kili') extra = ` Kíli íjjal is lő: ${k.ability}.`;
        if (p.ch.id === 'bombur') extra = ` Bombur fel is löki őket: ${k.ability} (rohamozás).`;
        ui.text = `<b style="color:var(--gold,#e8c070)">Goblinok!</b> Elkapnak, és ellopnak egy leletet a zsákodból. Üsd meg őket a csákánnyal (${k.dig}), vagy dobj rájuk követ (${k.throw}).${extra} Ha a társadat kapják el, üsd meg a goblint!`;
        ui.box.innerHTML = ui.text;
        ui.box.style.display = 'block';
        // The tutorial's own goal box would sit in the same place: it waits while this one shows.
        const tb = game.tutorial?.ui?.get(p)?.box;
        if (tb) tb.style.visibility = 'hidden';
      }
      if (ui.t > 0) {
        ui.t -= dt;
        if (ui.t <= 0 || (p.goblinHintDone || 0) >= 2) {
          ui.t = -1;
          ui.box.style.display = 'none';
          const tb = game.tutorial?.ui?.get(p)?.box;
          if (tb) tb.style.visibility = '';
        }
      }
    });
  }

  /* ---------------- sounds (synthesised, like exits.js) ---------------- */

  sound(kind, pos) {
    try {
      // Only what a player could hear (within 30 m of somebody).
      if (pos && this.farFromPlayers(pos, 30)) return;
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
        g.gain.exponentialRampToValueAtTime(vol, t + start + Math.min(0.03, dur / 4));
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
        g.gain.exponentialRampToValueAtTime(vol, t + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(a.destination);
        o.start(t + start);
        o.stop(t + start + dur + 0.05);
      };
      switch (kind) {
        case 'screech': tone(0, 0.35, 'sawtooth', 900, 1500, 0.08); burst(0, 0.3, 'bandpass', 2500, 1800, 0.12, 4); break;
        case 'grab': burst(0, 0.18, 'lowpass', 600, 200, 0.4); break;
        case 'cackle': for (let k = 0; k < 4; k++) tone(k * 0.11, 0.08, 'square', 520 + k * 40, 380, 0.05); break;
        case 'yelp': tone(0, 0.22, 'sawtooth', 1200, 500, 0.08); break;
        case 'thwack': burst(0, 0.12, 'lowpass', 900, 120, 0.6); break;
        case 'sting': tone(0, 0.5, 'sine', 1800, 2400, 0.06); burst(0, 0.1, 'highpass', 3000, 5000, 0.2); break;
        case 'throw': burst(0, 0.15, 'bandpass', 800, 1600, 0.15, 2); break;
        case 'clonk': burst(0, 0.08, 'bandpass', 1400, 700, 0.4, 3); break;
        case 'tick': burst(0, 0.05, 'highpass', 2000, 3000, 0.12); break;
        case 'bow': burst(0, 0.1, 'lowpass', 400, 150, 0.4); tone(0, 0.12, 'triangle', 220, 180, 0.08); break;
        case 'charge': burst(0, 0.6, 'lowpass', 300, 80, 0.5); break;
        case 'drums': for (let k = 0; k < 8; k++) burst(k * 0.42, 0.3, 'lowpass', 180, 50, k % 2 ? 0.5 : 0.8); break;
        // Mirkwood (mirkwood-foes/): the spiders' hiss and skitter, silk, the elves, the cell door, the barrels.
        case 'hiss': burst(0, 0.7, 'highpass', 3000, 5200, 0.14); burst(0.05, 0.5, 'bandpass', 1800, 1200, 0.08, 3); break;
        case 'skitter': for (let k = 0; k < 6; k++) burst(k * 0.05, 0.03, 'highpass', 2500, 3500, 0.07); break;
        case 'wrap': for (let k = 0; k < 5; k++) burst(k * 0.16, 0.14, 'bandpass', 1200, 2200, 0.1, 2); break;
        case 'tear': burst(0, 0.25, 'bandpass', 2400, 900, 0.18, 1.5); break;
        case 'elf': tone(0, 0.5, 'sine', 660, 740, 0.05); tone(0.18, 0.6, 'sine', 880, 990, 0.04); break;
        case 'door': burst(0, 0.35, 'lowpass', 500, 120, 0.4); tone(0, 0.3, 'square', 140, 90, 0.03); break;
        case 'lock': burst(0, 0.06, 'highpass', 3000, 4200, 0.18); break;
        case 'splash': burst(0, 0.8, 'lowpass', 1800, 300, 0.45); break;
        case 'thunk': burst(0, 0.1, 'lowpass', 700, 160, 0.5); break;
        default: break;
      }
    } catch {
      /* audio unavailable */
    }
  }
}

export { COMBAT, GOBLIN };
