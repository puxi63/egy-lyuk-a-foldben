/* ==== coop-actions/chests.js — the heavy dwarf chests (TERV 0.11/18 "a nehéz kincsesláda, amit ketten cipeltek";
   NOTES-23-coop-actions).
   - Three chests in the mines of Erebor (rules.js CHESTS). One player takes a handle with the use key and cannot move
     it ("túl nehéz egyedül"); when a second pair of hands takes the other handle (the partner, or Dori in single play)
     they carry it together, slowly (walk × CHEST.speed, no jumping, no ladders, no digging). It hangs between the two:
     too far apart or one of them taken (a fall, a goblin, a ride) and it slips to the floor.
   - The use key again sets it down. At a built lift stop below the surface the use key loads it into the barrel and the
     lift carries it up: it waits beside the crane in the garden. Carried (or set down) at the Green Dragon's counter or
     Bag End's round door, the use key opens it: the gold goes into the shared purse and the dwarf work into the bags
     (finds.js types; no room: their value in gold). Each chest gives its reward once (saved).
   - A chest set down on the dwarves' hoist rides with it (hoist.js). ==== */
import * as THREE from 'three';
import { FIND_TYPES } from '../finds.js';
import { CRANE_POS, LIFT_SPEEDS } from '../lift.js';
import { SHOP_POS } from '../props.js';
import { BAG_END } from '../surface/bagend.js';
import { sdf } from '../world.js';
import { EREBOR_SITE_PROVIDER } from '../underground/erebor-sites.js';
import { buildChest } from './models.js';
import { CHEST, CHESTS } from './rules.js';

/** Where a chest the lift brought up waits: on the lawn beside the crane, off the pit's edge. */
const CRANE_SPOT = { x: CRANE_POS.x + 2.1, z: CRANE_POS.z + 1.0 };
/** Outside Bag End's round door (as bagend/index.js DOOR_OUT). */
const DOOR = { x: BAG_END.x, z: BAG_END.z - 0.12 };
const DORI = 'dori';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** The first solid point below (x, y0, z) in the world field (terrain and set pieces), or null within `range`. */
export function floorBelow(x, z, y0, range = 4) {
  for (let y = y0; y > y0 - range; y -= 0.04) if (sdf(x, y, z) > 0) return y + 0.03;
  return null;
}

export class Chests {
  constructor(ca) {
    this.ca = ca;
    this.game = ca.game;
    this.list = CHESTS.map((def) => {
      const m = buildChest(ca.mat);
      this.game.scene.add(m.group);
      const y = floorBelow(def.x, def.z, def.y0, 3) ?? def.y0 - 0.6;
      return {
        def, model: m, pos: new THREE.Vector3(def.x, y, def.z), yaw: def.yaw, state: 'rest', grips: [], t: 0, rewarded: false,
      };
    });
    this.findById = new Map(FIND_TYPES.map((f) => [f.id, f]));
    /** QA: the last opening's reward, the last slip. */
    this.lastOpen = null;
    this.lastDrop = null;
  }

  /** The chest p holds a handle of, or null. */
  heldBy(p) {
    return this.list.find((c) => c.grips.includes(p)) || null;
  }

  /** The chest Dori carries (single play), or null. */
  get doriChest() {
    return this.list.find((c) => c.state === 'carry' && c.grips.includes(DORI)) || null;
  }

  /** The nearest resting chest p can reach a handle of, or null. */
  nearest(p, reach = CHEST.grab) {
    let best = null;
    let bd = reach;
    for (const c of this.list) {
      if (c.state !== 'rest') continue;
      const d = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      if (d < bd && Math.abs(p.pos.y - c.pos.y) < 1.5) {
        bd = d;
        best = c;
      }
    }
    if (!best) return null;
    // An Erebor rune chest (erebor-puzzles/) nearer to the player keeps the use key.
    for (const r of EREBOR_SITE_PROVIDER.runeChests || []) {
      if (Math.abs(p.pos.y - r.y) < 2 && Math.hypot(p.pos.x - r.x, p.pos.z - r.z) < bd) return null;
    }
    return best;
  }

  /** The use key (index.js decides it is ours). True when it was spent here. */
  use(p) {
    const c = this.heldBy(p);
    if (c) {
      if (c.state === 'carry') {
        if (this.openSpot(c)) return this.open(c, p);
        const st = this.liftStop(c, p);
        if (st) return this.sendUp(c, st);
        this.drop(c, 'Letettétek a ládát.');
        return true;
      }
      // Holding one handle alone: the use key lets go.
      this.release(c, p, 'Elengedted a láda fülét.');
      return true;
    }
    const n = this.nearest(p);
    if (!n) return false;
    if (this.openSpot(n)) return this.open(n, p);
    this.grip(n, p);
    return true;
  }

  grip(c, p) {
    const ca = this.ca;
    c.grips.push(p);
    const other = c.grips.find((q) => q !== p);
    if (other) {
      this.lift(c);
      return;
    }
    // Single play: Dori takes the other handle when he is near.
    const H = ca.dori;
    if (H && H.placed && H.pos.distanceTo(c.pos) < 14) {
      c.grips.push(DORI);
      this.placeDori(c, p);
      this.lift(c);
      return;
    }
    const partner = ca.humans().find((q) => q !== p);
    p.say(partner
      ? `Túl nehéz egyedül! ${partner.ch.name} fogja meg a másik fülét (${ca.useKeyText(partner)}).`
      : 'Túl nehéz egyedül: meg se moccan. Kell egy társ a másik fülére (vagy fogadd fel Dorit a Zöld Sárkány pultjánál).', 4);
  }

  /** Both handles held: up it comes. */
  lift(c) {
    c.state = 'carry';
    for (const q of c.grips) if (q !== DORI) q.say(c.grips.includes(DORI) ? 'Dori megfogja a másik fülét: „Hó-rukk!” Lassan, egyenletesen vigyétek.' : 'Felemeltétek a ládát! Lassan vigyétek, és ne szakadjatok el egymástól.', 4);
    this.ca.hint('chest-carry');
  }

  /** Puts Dori at the free side of the chest, his trail from there through the chest to the player. */
  placeDori(c, p) {
    const H = this.ca.dori;
    const a0 = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
    let spot = null;
    for (let k = 0; k < 8 && !spot; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
      const x = c.pos.x + Math.sin(a) * 0.95;
      const z = c.pos.z + Math.cos(a) * 0.95;
      // Open at waist and head height, with a floor under it.
      if (sdf(x, c.pos.y + 0.6, z) > -0.15 || sdf(x, c.pos.y + 1.3, z) > -0.15) continue;
      const f = floorBelow(x, z, c.pos.y + 0.5, 1.4);
      if (f != null) spot = tmpA.set(x, f, z);
    }
    if (!spot) spot = tmpA.copy(c.pos);
    H.place(spot, [spot, c.pos, p.pos]);
  }

  /** One hand lets go of a chest held alone. */
  release(c, p, text) {
    c.grips = c.grips.filter((q) => q !== p);
    if (text) p.say(text, 2.5);
  }

  /** The chest slips or is set down: it rests on the floor under its middle. */
  drop(c, text) {
    const people = c.grips.filter((q) => q !== DORI);
    c.grips = [];
    c.state = 'rest';
    const y = floorBelow(c.pos.x, c.pos.z, c.pos.y + 0.7, 3);
    c.pos.y = y ?? c.pos.y - CHEST.hands;
    for (const q of people) if (text) q.say(text, 3);
    this.lastDrop = { id: c.def.id, text };
  }

  /** A built lift stop below the surface where the carrier (or the chest) stands, or null. */
  liftStop(c, p) {
    const lift = this.game.lift;
    const st = lift.stationAt(p.pos) || lift.stationAt(c.pos);
    return st && st.depth > 0 ? st : null;
  }

  /** Loaded into the barrel: the lift carries it up to the crane in the garden. */
  sendUp(c, stop) {
    const people = c.grips.filter((q) => q !== DORI);
    c.grips = [];
    c.state = 'lift';
    c.t = 0;
    c.dur = Math.min(CHEST.liftMax, 0.8 + stop.depth / (LIFT_SPEEDS[this.game.lift.speedTier]?.speed || 4));
    c.loaders = people;
    for (const q of people) q.say(`A ládát beemelitek a hordóba: a lift felviszi a felszínre, a daru mellé (${stop.name.split(' ·')[0]}).`, 5);
    return true;
  }

  /** At the Green Dragon's counter or Bag End's round door (or inside Bag End). */
  openSpot(c) {
    const g = this.game;
    if (c.state === 'carry' && c.grips.some((q) => q !== DORI && g.bagEnd?.isInside(q))) return true;
    if (c.pos.y < -2 || c.pos.y > 3) return false;
    if (Math.hypot(c.pos.x - SHOP_POS.x, c.pos.z - SHOP_POS.z) < CHEST.openShop) return 'shop';
    if (Math.hypot(c.pos.x - DOOR.x, c.pos.z - DOOR.z) < CHEST.openDoor) return 'bagend';
    return false;
  }

  /** Opens the chest: the reward, once. */
  open(c, p) {
    const g = this.game;
    const where = this.openSpot(c) === 'shop' ? 'a Zöld Sárkány pultjánál' : 'Zsáklakban';
    const people = [...new Set([p, ...c.grips.filter((q) => q !== DORI)])];
    // Everyone near shares in the dwarf work (round robin over the bags); the gold is the shared purse's.
    for (const q of this.ca.humans()) if (!people.includes(q) && q.pos.distanceTo(c.pos) < 6) people.push(q);
    c.grips = [];
    c.state = 'open';
    c.t = 0;
    if (c.rewarded) return true;
    c.rewarded = true;
    let gold = c.def.gold;
    const got = [];
    c.def.finds.forEach((id, k) => {
      const f = this.findById.get(id);
      if (!f) return;
      const q = people[k % people.length];
      if (q.bag.length + (q.incoming || 0) < q.bagCap) {
        q.bag.push(f);
        got.push(`${f.name} → ${q.ch.name}`);
      } else gold += f.value;
    });
    g.money += gold;
    this.lastOpen = { id: c.def.id, gold, finds: got.slice(), where };
    for (const q of people) q.say(`Kinyitottátok ${c.def.name} ${where}! +${gold} arany a közös erszénybe${got.length ? `, és ${got.join(', ')}` : ''}.`, 7);
    g.saveNow?.();
    return true;
  }

  /**
   * Per frame (after the players moved): who carries what (the walk factor, the hands), the hanging chest, slips, the
   * lift's barrel, the opening, the drawing.
   */
  update(dt) {
    const g = this.game;
    const H = this.ca.dori;
    const players = g.players;
    for (const q of players) {
      q.carrying = false;
      q.carryK = 1;
    }
    for (const c of this.list) {
      if (c.state === 'carry') this.carry(c, H);
      else if (c.grips.length) {
        // One hand alone: walking off lets go; a carrier who is taken lets go.
        for (const q of c.grips.slice()) {
          if (q === DORI) continue;
          if (!this.ca.free(q) || Math.hypot(q.pos.x - c.pos.x, q.pos.z - c.pos.z) > CHEST.grab + 0.8) this.release(c, q, '');
        }
      }
      if (c.state === 'rest') this.ca.hoist.ride(c);
      if (c.state === 'lift') {
        c.t += dt;
        if (c.t >= c.dur) {
          c.state = 'rest';
          const y = floorBelow(CRANE_SPOT.x, CRANE_SPOT.z, 2, 5);
          c.pos.set(CRANE_SPOT.x, y ?? 0, CRANE_SPOT.z);
          c.yaw = 0;
          for (const q of c.loaders || []) q.say('A láda felért: ott vár a daru mellett, Zsáklak kertjében. Vigyétek a Zöld Sárkányba vagy Zsáklakba!', 5);
          g.saveNow?.();
        }
      }
      if (c.state === 'open') {
        c.t += dt;
        if (c.t > 6) c.state = 'gone';
      }
      this.draw(c, players, dt);
    }
  }

  /** The chest between its two carriers. */
  carry(c, H) {
    const ends = c.grips.map((q) => (q === DORI ? H?.pos : q.pos));
    const people = c.grips.filter((q) => q !== DORI);
    let slip = '';
    if (c.grips.includes(DORI) && !H) slip = 'Dori nélkül nem bírod: a láda lecsúszott.';
    for (const q of people) if (!this.ca.free(q)) slip = 'A láda kicsúszott a kezetekből!';
    if (!slip) {
      const [a, b] = ends;
      if (Math.hypot(a.x - b.x, a.z - b.z) > CHEST.maxGap) slip = c.grips.includes(DORI) ? 'Dori nem tudott követni a ládával: letettétek.' : 'Túl messzire kerültetek egymástól: a láda lecsúszott!';
      else if (Math.abs(a.y - b.y) > CHEST.maxRise) slip = 'A láda megbillent és lecsúszott: ilyen meredeken nem bírjátok.';
    }
    if (slip) {
      this.drop(c, slip);
      return;
    }
    const [a, b] = ends;
    c.pos.set((a.x + b.x) / 2, (a.y + b.y) / 2 + CHEST.hands, (a.z + b.z) / 2);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (dx * dx + dz * dz > 0.01) c.yaw = Math.atan2(-dz, dx);
    for (const q of people) {
      q.carrying = true;
      q.carryK = CHEST.speed;
    }
  }

  draw(c, players, dt) {
    const m = c.model;
    const shown = (c.state === 'rest' || c.state === 'carry' || c.state === 'open') && players.some((q) => q.pos.distanceTo(c.pos) < CHEST.show);
    m.group.visible = shown;
    if (!shown) return;
    m.group.position.copy(c.pos);
    m.group.rotation.y = c.yaw;
    const open = c.state === 'open' ? Math.min(1, c.t / 1.1) : 0;
    m.lid.rotation.x = -1.9 * open * open * (3 - 2 * open);
    m.glint.visible = open > 0.3;
  }

  /** Save: per chest its resting spot, or 0 once opened. A carried chest is saved where it hangs (on the floor below). */
  state() {
    const out = {};
    for (const c of this.list) {
      if (c.rewarded) out[c.def.id] = 0;
      else if (c.state === 'lift') out[c.def.id] = [CRANE_SPOT.x, 0, CRANE_SPOT.z].map((v) => +v.toFixed(2));
      else {
        const y = c.state === 'carry' ? c.pos.y - CHEST.hands : c.pos.y;
        out[c.def.id] = [c.pos.x, y, c.pos.z].map((v) => +v.toFixed(2));
      }
    }
    return out;
  }

  /** From state(); a missing chest keeps its start spot. */
  restore(s) {
    if (!s) return;
    for (const c of this.list) {
      const v = s[c.def.id];
      if (v === 0) {
        c.rewarded = true;
        c.state = 'gone';
      } else if (Array.isArray(v) && v.length === 3) {
        const [x, y, z] = v;
        // On its floor as saved; settled again only when the ground there changed (dug away, filled).
        const f = floorBelow(x, z, y + 0.8, 3);
        c.pos.set(x, f == null || Math.abs(f - y) < 0.12 ? y : f, z);
        c.state = 'rest';
      }
    }
  }

  /** The prompt line for p (index.js), or ''. */
  prompt(p) {
    const ca = this.ca;
    const key = ca.useKey(p);
    const c = this.heldBy(p);
    if (c?.state === 'carry') {
      if (this.openSpot(c)) return `${key} kinyitjátok a ládát`;
      if (this.liftStop(c, p)) return `${key} a ládát a hordóliftbe teszitek: felviszi a felszínre`;
      return `Cipelitek a nehéz törpeládát · ${key} leteszitek`;
    }
    if (c) return 'Fogod a láda egyik fülét: kell valaki a másikra is!';
    const n = this.nearest(p);
    if (!n) return '';
    if (this.openSpot(n)) return `${key} kinyitod a nehéz törpeládát`;
    return `Nehéz törpeláda · ${key} megfogod az egyik fülét (ketten bírjátok el)`;
  }

  /** The nearest chest within `d` m (the tutorial hint), or null. */
  near(p, d) {
    return this.list.find((c) => (c.state === 'rest' || c.state === 'carry') && tmpB.copy(c.pos).distanceTo(p.pos) < d) || null;
  }
}
