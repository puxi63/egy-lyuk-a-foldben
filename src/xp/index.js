/* ==== xp/index.js — character experience (TODO item 31, NOTES-41-xp).
   - XpState (`player.xp`): one player slot's XP, level, skill ranks (per character: a slot keeps its level, the ranks
     belong to the character played), the save part and the derived effects (`applySkills` multiplies the player's
     perks and fills `player.xpK`).
   - XpHub (`game.xp`): the entry points other modules call on an event (a foe struck, a troll turned to stone).
   Every gain is an event (a swing that bites, a find in the bag, a hit, a layer reached): nothing runs per frame
   except one depth comparison in player.js. The HUD reads `xp.ver` to redraw only on a change. ==== */
import { sharedAudio } from '../audio.js';
import { LAYER_TOPS, layerAtDepth } from '../materials.js';
import { MAX_RANK, NO_XPK, SKILLS, XP_CURVE, XP_GAIN } from './config.js';

/** XP needed to go from level L to L + 1. */
export function needFor(level) {
  return Math.round((XP_CURVE.a * Math.pow(level, XP_CURVE.b)) / 5) * 5;
}

/** Total XP at which level L starts (level 1 at 0). Cached: the curve is fixed. */
const STARTS = [0, 0];
export function levelStart(level) {
  while (STARTS.length <= level) STARTS.push(STARTS[STARTS.length - 1] + needFor(STARTS.length - 1));
  return STARTS[level];
}

/** The level reached with `xp` total XP (1 + the number of thresholds passed). */
export function levelOf(xp) {
  let l = 1;
  while (xp >= levelStart(l + 1)) l++;
  return l;
}

/** The skills of a character id ([] for a character without any, e.g. an unknown id). */
export function skillsOf(chId) {
  return SKILLS[chId] || [];
}

export class XpState {
  /** @param {object} player the Player this state belongs to */
  constructor(player) {
    this.p = player;
    this.xp = 0; // total XP (fractions kept in play; saved rounded)
    this.level = 1;
    /** Ranks per character id: { bilbo: [r0, r1, r2, r3], … }. */
    this.ranks = {};
    /** Deepest layer index already rewarded (the garden is 0). */
    this.deep = 0;
    /** Bumped on every visible change (XP shown rounded, level, ranks): the HUD redraws only then. */
    this.ver = 0;
    /** Pending level-up notice for the HUD: { level, gained } (the HUD clears it). */
    this.notice = null;
    /** The depth (m, negative y) below which the next layer starts: one comparison per frame in player.js. */
    this.nextY = -LAYER_TOPS[1];
    this.foeT = new WeakMap();
  }

  /** The current character's ranks (an array with one entry per skill, created on demand). */
  myRanks() {
    const id = this.p.ch?.id;
    const n = skillsOf(id).length;
    let r = this.ranks[id];
    if (!r) r = this.ranks[id] = new Array(n).fill(0);
    while (r.length < n) r.push(0);
    return r;
  }

  /** Skill points earned (one per level above 1). */
  get earned() {
    return this.level - 1;
  }

  /** Points spent on the current character's skills. */
  get spent() {
    return this.myRanks().reduce((s, v) => s + v, 0);
  }

  /** Points left to spend on the current character (never more than the ranks still open). */
  get free() {
    const spent = this.spent;
    return Math.max(0, Math.min(this.earned - spent, skillsOf(this.p.ch?.id).length * MAX_RANK - spent));
  }

  /** Progress inside the current level: { into, need, frac }. */
  progress() {
    const s = levelStart(this.level);
    const need = needFor(this.level);
    const into = Math.max(0, this.xp - s);
    return { into, need, frac: Math.min(1, into / need) };
  }

  /**
   * Adds XP (scaled by the Tanulékonyság skill); levels up as often as the new total allows and queues the HUD notice.
   * `why` is only for QA / logs (the last gain is kept in `last`).
   */
  gain(amount, why = '') {
    if (!(amount > 0) || this.p.choosing) return 0;
    const add = amount * (this.p.xpK?.xp ?? 1);
    const before = Math.floor(this.xp);
    this.xp += add;
    this.last = { why, add };
    let up = 0;
    while (this.xp >= levelStart(this.level + 1)) {
      this.level++;
      up++;
    }
    if (up) {
      this.notice = { level: this.level, gained: (this.notice?.gained || 0) + up };
      this.p.game?.xp?.chime?.();
    }
    if (up || Math.floor(this.xp) !== before) this.ver++;
    return add;
  }

  /** A swing that removed soil: hardness and depth make it worth more. */
  dig(hard, depth) {
    const g = XP_GAIN.dig;
    const layer = depth > 0.5 ? layerAtDepth(depth) : 0;
    this.gain(g.base * Math.pow(Math.max(0.5, hard), g.hardPow) * (1 + g.perLayer * layer), 'dig');
  }

  /** A find landed in the bag (a famous one: dug up, on its way to the mathom room). */
  find(type) {
    const g = XP_GAIN.find;
    if (type?.famous) this.gain(g.famous, 'famous');
    else this.gain(g.base + g.perSqrtGold * Math.sqrt(Math.max(0, type?.value || 0)), 'find');
  }

  /** A hit on a foe (enemies/combat.js): by kind, once per foe every few seconds. */
  foe(foe) {
    const kind = foe?.constructor?.name;
    const amount = XP_GAIN.foe[kind] || 0;
    if (!amount) return;
    const now = performance.now();
    const t = this.foeT.get(foe);
    if (t && now - t < XP_GAIN.foe.again * 1000) return;
    this.foeT.set(foe, now);
    this.gain(amount, `foe:${kind}`);
  }

  /** The player went below the next layer's top (player.js compares `nextY` once per frame). */
  deeper(depth) {
    const layer = layerAtDepth(depth);
    while (this.deep < layer) {
      this.deep++;
      this.gain(XP_GAIN.layer.perLayer * this.deep, 'layer');
    }
    this.syncNext();
  }

  syncNext() {
    const top = LAYER_TOPS[this.deep + 1];
    this.nextY = top === undefined ? -Infinity : -top;
  }

  /** Raises skill i of the current character by one rank; false when no point is free or it is at its top. */
  raise(i) {
    const r = this.myRanks();
    if (i < 0 || i >= r.length || r[i] >= MAX_RANK || this.free <= 0) return false;
    r[i]++;
    this.ver++;
    applySkills(this.p);
    return true;
  }

  /** Takes back one rank of skill i (the skills screen allows it only for ranks raised during the same visit). */
  lower(i) {
    const r = this.myRanks();
    if (i < 0 || i >= r.length || r[i] <= 0) return false;
    r[i]--;
    this.ver++;
    applySkills(this.p);
    return true;
  }

  /**
   * The save part (game.js slotData, field `xp`): { x: total XP, d: deepest layer rewarded, s: { chId: ranks } }.
   * Undefined while nothing was earned, so an untouched slot writes no field at all.
   */
  state() {
    const s = {};
    for (const [id, r] of Object.entries(this.ranks)) if (r.some((v) => v > 0)) s[id] = r.slice();
    if (this.xp < 1 && !Object.keys(s).length) return undefined;
    const out = { x: Math.floor(this.xp), d: this.deep };
    if (Object.keys(s).length) out.s = s;
    return out;
  }

  /**
   * Loads the save part. Absent (every save made before this item): level 1, 0 XP, no ranks, and the layers this slot
   * has already reached (its saved maxDepth) count as rewarded — no retroactive XP.
   */
  restore(s, maxDepth = 0) {
    this.xp = Math.max(0, +s?.x || 0);
    this.level = levelOf(this.xp);
    this.deep = Number.isFinite(s?.d) ? Math.max(0, Math.min(LAYER_TOPS.length - 1, s.d | 0)) : layerAtDepth(Math.max(0, maxDepth));
    this.ranks = {};
    for (const [id, r] of Object.entries(s?.s || {})) {
      if (Array.isArray(r)) this.ranks[id] = r.map((v) => Math.max(0, Math.min(MAX_RANK, v | 0)));
    }
    this.notice = null;
    this.syncNext();
    this.ver++;
    applySkills(this.p);
  }
}

/**
 * Applies the current character's skill ranks: a new player.perk = the character's own perks (player.basePerk, set by
 * setCharacter) × the skills, and player.xpK (the other effects); then the smith's layer goes back on top. Call after
 * setCharacter and after every rank change.
 */
export function applySkills(p) {
  const base = p.basePerk || p.smithBase || p.perk;
  const perk = { ...base };
  const k = { ...NO_XPK };
  const st = p.xp;
  if (st) {
    const ranks = st.myRanks();
    skillsOf(p.ch?.id).forEach((sk, i) => {
      const r = ranks[i] || 0;
      if (!r) return;
      for (const [key, v] of Object.entries(sk.fx.perk || {})) perk[key] = (perk[key] ?? 1) * (1 + v * r);
      for (const [key, v] of Object.entries(sk.fx.k || {})) {
        if (key === 'sneak') k.sneak += v * r;
        else k[key] *= 1 + v * r;
      }
    });
  }
  p.perk = perk;
  p.xpK = k;
  // The smith (NOTES-40-smith) layers its upgrades on top of player.perk: the new object becomes its base and it
  // re-layers at once (it never sees the old scaled copy; nothing is multiplied in place).
  p.game?.smith?.apply?.(p);
}

/** game.xp: the entry points the other modules call (all optional-chained there). */
export class XpHub {
  constructor(game) {
    this.game = game;
  }

  /** A player's hit on a foe (enemies/combat.js: pick, Sting, stone, arrow, charge). */
  foe(p, foe) {
    p?.xp?.foe(foe);
  }

  /** A stone troll turned back to stone by player p (his strong light, or Gandalf's "Hajnal!": trolls/index.js). */
  troll(p) {
    p?.xp?.gain(XP_GAIN.troll, 'troll');
  }

  /** A soft three-note chime on a level-up (the shared audio context; silent on bench pages). */
  chime() {
    const g = this.game;
    if (g.bench || g.decor?.mute) return;
    try {
      const a = sharedAudio();
      if (!a) return;
      if (a.state === 'suspended') a.resume();
      const t0 = a.currentTime;
      for (const [start, f, vol] of [[0, 659, 0.05], [0.14, 988, 0.045], [0.28, 1319, 0.03]]) {
        const o = a.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t0 + start);
        const gn = a.createGain();
        gn.gain.setValueAtTime(0.0001, t0 + start);
        gn.gain.exponentialRampToValueAtTime(vol, t0 + start + 0.03);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 0.9);
        o.connect(gn).connect(a.destination);
        o.start(t0 + start);
        o.stop(t0 + start + 1);
      }
    } catch {
      // No audio: the notice alone.
    }
  }
}
