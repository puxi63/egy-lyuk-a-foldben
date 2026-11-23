/* ==== shared-items.js — found items that work for both players (NOTES-50-shared-items, TODO-QUEUE 43; the user,
   2026-11-23: "elég egyiküknek felvenni").
   A one-time find that gives an ability or an effect belongs to the company: when one player gets it, the other has
   it too, also a player who joins later. Bought things (tools, bags, armour tiers 1–3, ladders, charges, Eagle calls)
   and XP stay per player.
   - The Ring: shared by gollum/ring.js itself (`found` is game-wide, every player wears it independently).
   - Sting (`p.sting`, enemies/sting.js) and the mithril shirt (armour tier 4, underground/erebor-fx.js): the per-slot
     save fields stay as they are (`sting`, `armour`); this derives the shared state from them every frame — if any
     player in the game or any slot of the loaded save has it, every playing character gets it, and the next save
     writes it into both slots. So an old save where only slot 1 has Sting or the mithril shirt gives it to both, with
     no new field and no VERSION change. ==== */

/** The armour tier of the mithril shirt (enemies/armour.js ARMOUR_TIERS[4]; never sold, only found). */
export const MITHRIL_TIER = 4;

/** True when somebody in the company owns Sting (a player now, or any slot of the loaded save). */
export function stingShared(game) {
  return game.players.some((p) => p.sting) || (game.save?.slots || []).some((s) => s && s.sting);
}

/** True when somebody in the company wears the mithril shirt (armour tier 4: a player now, or any saved slot). */
export function mithrilShared(game) {
  return game.players.some((p) => (p.armour | 0) >= MITHRIL_TIER) || (game.save?.slots || []).some((s) => s && (s.armour | 0) >= MITHRIL_TIER);
}

/** Per frame (game.update): gives every playing character the shared finds he lacks (cheap: two flags per player). */
export function syncSharedItems(game) {
  let sting = null;
  let mithril = null;
  for (const p of game.players) {
    if (p.choosing || !p.ch) continue;
    if (!p.sting && (sting ??= stingShared(game))) p.sting = true;
    // setArmour rebuilds the body once (the baked "<id>-a4" look); only when it is missing.
    if ((p.armour | 0) < MITHRIL_TIER && (mithril ??= mithrilShared(game))) p.setArmour(MITHRIL_TIER);
  }
}
