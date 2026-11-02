/* ==== modes/rules.js — the numbers of the game modes (NOTES-15-modes): Kihívás (TERV 0.6), Versengés (TERV 0.11/20) and
   the hired dwarf of single play (TERV 0.11/18). No imports from game modules, so safety/ and enemies/ can use lifeOf()
   without an import cycle. ==== */

/** One-shot start choice handed across the title's reload (sessionStorage; main.js reads and removes it). */
export const START_KEY = 'egy-lyuk-start';

/** The modes a game can run in. `normal` and `kihivas` have their own save slots (TERV 0.6 "külön mentési hely"). */
export const MODE = { normal: 'normal', challenge: 'kihivas', versus: 'versus' };

/**
 * Kihívás mode (TERV 0.6). What TERV fixes: harsher death (the bag is lost for good and a part of the unspent money,
 * part of the pit caves in), stronger dangers (goblins, spiders, trolls, cold water can kill), less pay, dearer food,
 * a separate save slot; armour tier 3 "Kihívás módban több életerő". The numbers are this pass's choice (TERV gives none).
 */
export const CHALLENGE = {
  moneyLoss: 0.2, // share of the shared purse lost on a death ("a nálad lévő, még el nem költött pénz egy része")
  sell: 0.8, // the counter pays this share of a find's value ("kevesebb fizetség")
  food: 1.5, // the counter's food costs this much more ("drágább étel")
  life: 1.35, // armour tier 3 and up: every Kihívás harm is divided by this ("több életerő")
  lifeTier: 3,
  caveDepth: 6, // a death deeper than this (m) caves the pit in there ("a gödör egy része beomlik")
  caveR: 2.2, // radius (m) of the cave-in, centred a little above the death spot
  caveClear: 5, // no cave-in this close (horizontally) to the lift column, which runs the whole depth
  cocoon: 25, // plate points a closing spider cocoon takes (× the armour's `hurt`)
  wash: 30, // plate points a flood wash-up takes (the cold water; the breath ran out)
  chill: 1.0, // plate points per second while swimming in the cold underground water
};

/** Versengés (TERV 0.11/20): 10 minutes; `?vsTime=<s>` shortens it for QA. */
export const VERSUS = { duration: 600, countdown: 3, ladders: 30 };

/** The hired dwarf of single play (TERV 0.11/18 "Egyjátékos módban egy felfogadott törpe segít helyetted"). */
export const HELPER = {
  name: 'Dori',
  price: 150, // at the Green Dragon counter (perks apply; single play only)
  follow: 2.2, // m he keeps from the player on the same level
  speed: 3.4, // m/s along the player's trail
  step: 1.3, // m of height between two trail points he still walks (more: a shaft, he stays at its top)
  crumb: 0.7, // m between trail points
  crumbs: 400,
  rescue: 10, // m: within this he frees a held player (a goblin's grab, a spider's cocoon)
  rescueT: [1.2, 2.5], // seconds before he frees the player from a goblin / a cocoon
};

/** The Kihívás "életerő" factor of a player: harms are divided by it (armour tier 3 and up). */
export function lifeOf(p) {
  return p?.game?.enemies?.challenge && (p.armour | 0) >= CHALLENGE.lifeTier ? CHALLENGE.life : 1;
}
