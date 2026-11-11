/* ==== xp/config.js — character experience (TODO item 31, NOTES-41-xp): the XP sources, the level curve and every
   playable character's own skills. Kept here (not in config.js) so the XP tuning lives in one place. ==== */

/**
 * XP per event. Everything is event-based (a swing that bites, a find landing in the bag, a foe struck, a troll turned
 * to stone, a layer reached for the first time): nothing is counted per frame.
 * - `dig`: per swing that removes soil: `base` × hardness^`hardPow` × (1 + `perLayer` × layer index).
 * - `find`: per find in the bag: `base` + `perSqrtGold` × √(value in gold); a famous find (it goes to Bag End's mathom
 *   room, not into the bag) gives `famous`.
 * - `foe`: per hit on a foe, by kind (the class name of the agent); the same foe gives XP again only after `again` s
 *   (no farming a stunned goblin). Wood-elf guards give none (they are not foes to beat).
 * - `troll`: per stone troll a player's light or Gandalf's "Hajnal!" turns back to stone.
 * - `layer`: the first time this slot reaches a layer: `perLayer` × layer index (the garden is layer 0).
 */
export const XP_GAIN = {
  dig: { base: 1, hardPow: 0.5, perLayer: 0.2 },
  find: { base: 3, perSqrtGold: 1.5, famous: 150 },
  foe: { Goblin: 8, Spider: 12, again: 5 },
  troll: 60,
  layer: { perLayer: 50 },
};

/**
 * The level curve: going from level L to L + 1 needs round(a × L^b / 5) × 5 XP. Early levels come quickly (level 2 at
 * 40 XP, level 5 at about 900), later ones slower (level 11 at ~9 300, level 21 at ~59 000). There is no hard level
 * cap: the levels go on (slower and slower), one skill point each, but the skills cap at `maxRank` per skill, so after
 * every skill of the character is at its top (level 21 with four skills) further levels only count.
 */
export const XP_CURVE = { a: 40, b: 1.75 };

/** Ranks per skill (each rank one skill point). */
export const MAX_RANK = 5;

/**
 * The skills of each playable character (3–4 each, built on their existing traits in player.js CHARACTERS). Names
 * and descriptions are generic Hungarian descriptions (no invented names, no magic). `fx` gives the effect per rank:
 * - `perk.*`: multiplies the character's perk of that name (player.js: find, power, rock, sell, price, hunger, bag,
 *   climb) by (1 + value × rank);
 * - `k.*`: the other effects (xpK on the player), (1 + value × rank) unless noted: `sneak` (added to the sneaking
 *   walk's 0.42 factor), `hear` (how far goblins and spiders hear the digging), `stoneSpeed`, `stonePower`, `stoneCd`
 *   (stone throw), `pick` (the pick's / Sting's blow on a foe), `arrowCd` (Kíli's bow), `chargeCd` (Bombur's charge),
 *   `swing` (the dig swing's cooldown), `radius` (the dig scoop), `walk` (walking speed), `xp` (XP gained).
 * `line(r)` is the effect at rank r as the skills screen shows it.
 */
const pct = (v) => `${Math.round(Math.abs(v) * 100)} %`;
export const SKILLS = {
  bilbo: [
    { id: 'lopakodas', name: 'Lopakodás', desc: 'Lopakodva gyorsabban haladsz, és ásás közben a goblinok és a pókok csak közelebbről hallanak meg.',
      fx: { k: { sneak: 0.03, hear: -0.06 } }, line: (r) => `lopakodó lépés +${pct(0.03 * r / 0.42)}, hallótávolság −${pct(0.06 * r)}` },
    { id: 'kodobas', name: 'Kődobás', desc: 'A kő messzebbre repül, nagyobbat üt, és hamarabb dobhatsz újra.',
      fx: { k: { stoneSpeed: 0.06, stonePower: 0.08, stoneCd: -0.06 } }, line: (r) => `ütés +${pct(0.08 * r)}, sebesség +${pct(0.06 * r)}, újra −${pct(0.06 * r)}` },
    { id: 'eles-szem', name: 'Éles szem', desc: 'Még több leletet veszel észre a kiásott földben.',
      fx: { perk: { find: 0.05 } }, line: (r) => `leletesély +${pct(0.05 * r)}` },
    { id: 'pakolas', name: 'Ügyes pakolás', desc: 'Okosabban pakolsz: több lelet fér a zsákodba.',
      fx: { perk: { bag: 0.05 } }, line: (r) => `zsák +${pct(0.05 * r)}` },
  ],
  thorin: [
    { id: 'eros-csapas', name: 'Erős csapás', desc: 'Még erősebben ütsz a csákánnyal, mindenféle talajban.',
      fx: { perk: { power: 0.04 } }, line: (r) => `csákányütés +${pct(0.04 * r)}` },
    { id: 'harc', name: 'Harci tapasztalat', desc: 'A csákányod (vagy a Fullánk) jobban megtaszítja a goblinokat és a pókokat.',
      fx: { k: { pick: 0.1 } }, line: (r) => `ütés ellenfélre +${pct(0.1 * r)}` },
    { id: 'kitartas', name: 'Kitartás', desc: 'A munka kevésbé éheztet meg.',
      fx: { perk: { hunger: -0.05 } }, line: (r) => `éhezés −${pct(0.05 * r)}` },
    { id: 'alku', name: 'Alkudozás', desc: 'A pultnál jobban alkuszol: olcsóbban vásárolsz.',
      fx: { perk: { price: -0.02 } }, line: (r) => `árak −${pct(0.02 * r)}` },
  ],
  balin: [
    { id: 'kereskedes', name: 'Kereskedés', desc: 'Jobban ismered a leletek értékét: többet kapsz értük a pultnál.',
      fx: { perk: { sell: 0.03 } }, line: (r) => `eladási ár +${pct(0.03 * r)}` },
    { id: 'leletismeret', name: 'Leletismeret', desc: 'Tudod, hol keresd: több leletet találsz.',
      fx: { perk: { find: 0.04 } }, line: (r) => `leletesély +${pct(0.04 * r)}` },
    { id: 'maszas', name: 'Mászás gyakorlata', desc: 'Gyakorlattal fürgébben mászol a létrán.',
      fx: { perk: { climb: 0.05 } }, line: (r) => `mászás +${pct(0.05 * r)}` },
    { id: 'tanulas', name: 'Tanulékonyság', desc: 'Mindenből többet tanulsz: több tapasztalatot kapsz.',
      fx: { k: { xp: 0.06 } }, line: (r) => `tapasztalat +${pct(0.06 * r)}` },
  ],
  bofur: [
    { id: 'kofejtes', name: 'Kőfejtés', desc: 'Kemény kőben még gyorsabban haladsz.',
      fx: { perk: { rock: 0.06 } }, line: (r) => `ütés kőben +${pct(0.06 * r)}` },
    { id: 'gyors-csakany', name: 'Gyors csákány', desc: 'Szaporábban lendíted a csákányt.',
      fx: { k: { swing: -0.03 } }, line: (r) => `lendítés ideje −${pct(0.03 * r)}` },
    { id: 'szeles-csapas', name: 'Széles csapás', desc: 'Egy-egy ütéssel valamivel nagyobb darabot fejtesz ki.',
      fx: { k: { radius: 0.02 } }, line: (r) => `kifejtett darab +${pct(0.02 * r)} átmérő` },
    { id: 'beosztas', name: 'Beosztás', desc: 'Jobban beosztod az elemózsiát: lassabban éhezel.',
      fx: { perk: { hunger: -0.05 } }, line: (r) => `éhezés −${pct(0.05 * r)}` },
  ],
  bombur: [
    { id: 'teherbiras', name: 'Teherbírás', desc: 'Még többet elcipelsz: nagyobb a zsákod.',
      fx: { perk: { bag: 0.05 } }, line: (r) => `zsák +${pct(0.05 * r)}` },
    { id: 'mertekletesseg', name: 'Mértékletesség', desc: 'Megtanulsz kevesebbel beérni: lassabban éhezel.',
      fx: { perk: { hunger: -0.06 } }, line: (r) => `éhezés −${pct(0.06 * r)}` },
    { id: 'roham', name: 'Roham', desc: 'Hamarabb nekirugaszkodhatsz újra a rohamnak.',
      fx: { k: { chargeCd: -0.1 } }, line: (r) => `roham újra −${pct(0.1 * r)}` },
    { id: 'maszas', name: 'Mászás gyakorlata', desc: 'Gyakorlattal fürgébben mászol a létrán.',
      fx: { perk: { climb: 0.05 } }, line: (r) => `mászás +${pct(0.05 * r)}` },
  ],
  kili: [
    { id: 'ijaszat', name: 'Íjászat', desc: 'Gyorsabban húzod fel és lövöd ki a következő nyilat.',
      fx: { k: { arrowCd: -0.08 } }, line: (r) => `újratöltés −${pct(0.08 * r)}` },
    { id: 'furge-maszas', name: 'Fürge mászás', desc: 'Még gyorsabban mászol a létrán.',
      fx: { perk: { climb: 0.04 } }, line: (r) => `mászás +${pct(0.04 * r)}` },
    { id: 'konnyu-lepes', name: 'Könnyű léptek', desc: 'Gyorsabban jársz.',
      fx: { k: { walk: 0.02 } }, line: (r) => `járás +${pct(0.02 * r)}` },
    { id: 'pakolas', name: 'Ügyes pakolás', desc: 'Okosabban pakolsz: több lelet fér a zsákodba.',
      fx: { perk: { bag: 0.05 } }, line: (r) => `zsák +${pct(0.05 * r)}` },
  ],
};

/** The neutral extra effects (no skill). */
export const NO_XPK = { sneak: 0, hear: 1, stoneSpeed: 1, stonePower: 1, stoneCd: 1, pick: 1, arrowCd: 1, chargeCd: 1, swing: 1, radius: 1, walk: 1, xp: 1 };
