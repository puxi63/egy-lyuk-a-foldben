/* ==== wheel/slices.js — the action wheel's eight slices (NOTES-43-wheel) ====
 * Each slice performs its action through the very path its shortcut takes: it sets the same intent flag that key sets
 * (the ladder, the rope, the lamp, the stone, the wall tap, the Eagles and the charge: read by player.js, safety/,
 * coop-actions/, enemies/, finders.js and exits.js exactly as for the key), or, for eating, calls the bag screen's own
 * shire/meals.js eatFromBag. Nothing here repeats an action's rules; `state()` only reads what the HUD may show (counts,
 * cooldowns, the obvious refusals) and the action itself still has the last word.
 *
 * `dir` is a fixed compass slot (0 = up, clockwise in 45° steps), so a slice keeps its place as others unlock (muscle
 * memory); `unlocked()` is the spoiler-free rule (owned, or met, as the handbook's state reads it), and once seen on this
 * device a slice stays (greyed with its price or reason) even when its count runs out. */
import { FINDERS, SHOP } from '../config.js';
import { CHARGE, EAGLE_MAX, EAGLE_PRICE, ROCKET_MAX, ROCKET_PRICE } from '../exits.js';
import { COMBAT } from '../enemies/combat.js';
import { BAG_FOOD } from '../shire/meals.js';
import { findersOf } from '../finders.js';

/** Exits' minimum depth for the charge and the Eagles (exits.js MIN_DEPTH, not exported there). */
const MIN_DEPTH = 2.5;
/** The depth from which the wall tap and the raised lamp count as met (the first steps into the pit). */
const PIT_DEPTH = 3;

const inside = (g, p) => !!g.bagEnd?.isInside?.(p);
const been = (p) => (p.maxDepth || 0) >= PIT_DEPTH || p.depth >= PIT_DEPTH;
const priceOf = (g, p, n) => `${g.huds[p.slot]?.cost?.(g, n) ?? n} arany`;

/** The food a player would eat from his bag: the most filling one that still fits on the plate, else the smallest. */
export function foodPick(g, p) {
  const max = g.bagEnd?.effects?.hungerMax ?? 100;
  const room = max - p.hunger;
  let best = null;
  let small = null;
  for (const f of p.bag) {
    const fill = f && BAG_FOOD[f.id];
    if (!fill) continue;
    if (fill <= room + 1 && (!best || fill > BAG_FOOD[best])) best = f.id;
    if (!small || fill < BAG_FOOD[small]) small = f.id;
  }
  return best || small;
}

const foodCount = (p) => {
  let n = 0;
  for (const f of p.bag) if (f && BAG_FOOD[f.id]) n++;
  return n;
};

/**
 * The slices. state(p, g) → { label, count, ok, why, cd } (cd 0…1: the cooldown ring's filled part, 0 = none);
 * act(p, g, it) performs it on the release frame (`it` is that frame's intent, read by the rest of the frame).
 */
export const SLICES = [
  {
    id: 'ladder', dir: 0, name: 'Létra', glyph: 'ladder',
    unlocked: () => true,
    state(p, g) {
      const n = p.ladders || 0;
      const why = n <= 0 ? 'Nincs nálad' : inside(g, p) ? 'Zsáklakban nem' : p.carrying ? 'Kezed a ládán' : '';
      return { label: 'Létra', count: n > 0 ? `${n}` : priceOf(g, p, SHOP.ladderPrice), ok: !why, why, cd: 0 };
    },
    act(p, g, it) {
      it.ladderPressed = true;
    },
  },
  {
    id: 'eagles', dir: 1, name: 'Sasok', glyph: 'eagles',
    unlocked: (p) => (p.eagleCalls || 0) > 0,
    state(p, g) {
      const n = p.eagleCalls || 0;
      const why = n <= 0 ? 'Nincs nálad' : inside(g, p) ? 'Zsáklakban nem' : p.depth < MIN_DEPTH ? 'Csak a föld alatt' : '';
      return { label: 'Sasok', count: n > 0 ? `${n}/${EAGLE_MAX}` : priceOf(g, p, EAGLE_PRICE), ok: !why, why, cd: 0 };
    },
    act(p, g, it) {
      // exits.input: the exit key alone calls the Eagles (with the crouch key it would light a charge).
      it.exitPressed = true;
      it.climbDown = false;
    },
  },
  {
    id: 'charge', dir: 2, name: 'Gandalf tűzijáték-töltete', glyph: 'charge',
    unlocked: (p) => (p.rockets || 0) > 0,
    state(p, g) {
      const n = p.rockets || 0;
      const lit = g.exits?.charges?.find?.((ch) => ch.p === p);
      const why = n <= 0 ? 'Nincs nálad' : inside(g, p) ? 'Zsáklakban nem' : p.depth < MIN_DEPTH ? 'Csak a föld alatt' : lit ? 'Már ég egy kanóc' : '';
      return { label: 'Töltet', count: n > 0 ? `${n}/${ROCKET_MAX}` : priceOf(g, p, ROCKET_PRICE), ok: !why, why, cd: lit ? Math.max(0, 1 - lit.t / CHARGE.fuse) : 0 };
    },
    act(p, g, it) {
      // exits.input: the crouch key held with the exit key places and lights the charge.
      it.exitPressed = true;
      it.climbDown = true;
    },
  },
  {
    id: 'tap', dir: 3, name: 'Kopogtatás a falon', glyph: 'tap',
    unlocked: (p) => been(p),
    state(p, g) {
      const cd = findersOf(g).tapCd?.[p.slot] || 0;
      const why = p.depth < 1 || inside(g, p) ? 'Csak a föld alatt' : cd > 0 ? `Zúg a fal (${Math.ceil(cd)} mp)` : '';
      return { label: 'Kopogtatás', count: '', ok: !why, why, cd: cd > 0 ? Math.min(1, cd / FINDERS.tap.cooldown) : 0 };
    },
    act(p, g, it) {
      it.tapPressed = true;
    },
  },
  {
    id: 'eat', dir: 4, name: 'Evés a zsákból', glyph: 'eat',
    unlocked: (p) => foodCount(p) > 0,
    state(p, g) {
      const n = foodCount(p);
      const max = g.bagEnd?.effects?.hungerMax ?? 100;
      const why = n <= 0 ? 'Nincs étel a zsákban' : p.hunger >= max - 0.5 ? 'Tele a tányér' : !g.shire?.meals ? 'Most nem' : '';
      return { label: 'Evés', count: n > 0 ? `${n} falat` : '', ok: !why, why, cd: 0 };
    },
    act(p, g) {
      // The bag screen's own path (ui/collection.js BagView.eat): shire/meals.js eatFromBag, then the save.
      const id = foodPick(g, p);
      const res = id && g.shire?.meals?.eatFromBag(p, id);
      if (!res) return;
      if (!res.ok) p.say(res.text, 2.5);
      else g.saveNow?.();
    },
  },
  {
    id: 'lamp', dir: 5, name: 'Lámpa magasra', glyph: 'lamp',
    unlocked: (p, g) => been(p) && !g.modes?.versus,
    state(p) {
      const why = p.carrying ? 'Kezed a ládán' : '';
      return { label: p.lampUp ? 'Lámpa le' : 'Lámpa fel', count: '', ok: !why, why, cd: 0 };
    },
    act(p, g, it) {
      it.lampPressed = true;
    },
  },
  {
    id: 'stone', dir: 6, name: 'Kődobás', glyph: 'throw',
    unlocked: (p, g) => !!g.tutorial?.done?.has('goblin') || (p.stones ?? COMBAT.stonesMax) < COMBAT.stonesMax,
    state(p, g) {
      const n = p.stones ?? COMBAT.stonesMax;
      const cd = p.stoneCd || 0;
      const why = n <= 0 ? 'Elfogyott: áss' : inside(g, p) ? 'Zsáklakban nem' : '';
      return { label: 'Kődobás', count: `${n}/${COMBAT.stonesMax}`, ok: !why, why, cd: cd > 0 ? Math.min(1, cd / COMBAT.stoneCooldown) : 0 };
    },
    act(p, g, it) {
      it.throwPressed = true;
    },
  },
  {
    id: 'rope', dir: 7, name: 'Kötélbiztosítás', glyph: 'rope',
    unlocked: (p, g) => g.players.length > 1 || !!g.modes?.helper?.active,
    state(p, g) {
      const partner = g.players.find((q) => q !== p && !q.choosing);
      let why = '';
      if (p.belay) why = '';
      else if (inside(g, p)) why = 'Zsáklakban nem';
      else if (!partner) why = g.modes?.helper?.active ? '' : 'Társ kell';
      else if (partner.belay === p) why = 'Ő biztosít téged';
      else if (g.safety?.canBelay && !g.safety.canBelay(p, partner)) why = 'Túl messze';
      return { label: p.belay ? 'Kötél el' : 'Kötél', count: '', ok: !why, why, cd: 0 };
    },
    act(p, g, it) {
      it.ropePressed = true;
    },
  },
];

/** The slice in each compass slot (index = dir). */
export const BY_DIR = SLICES.slice().sort((a, b) => a.dir - b.dir);
