/* ==== enemies/armour.js — the armour tiers (TERV 0.4 Páncél, Decision 20): what each tier gives, the baked body that
   shows it (tools/figbake/lib/armour.mjs: "<id>-a<tier>.json"), the Green Dragon counter rows and their drawings.
   No weight: armour never slows the player (user rule). ==== */
import { mithrilShirtSVG } from '../ui/art.js'; // NOTES-27-loose: armourSVG(4)

/**
 * The tiers. `fall` metres added to the deadly fall height (PLAYER.fallDeath), `hurt` the multiplier on a hurt fall's
 * harm (safety/index.js, NOTES-11-safety: tier 1 "kisebb esési sérülés"), `steal` the chance that a grabbing
 * goblin gets a find out of the bag, `knock` the knockback multiplier, `rockProof` falling rocks do not knock the
 * player down (no rock-fall event exists yet: the flag is for it), `price` at the counter (perks and co-op apply).
 * Tier 4, the mithril shirt, is locked: only Erebor gives it (Thorin's gift in the book), it is never sold.
 */
export const ARMOUR_TIERS = [
  { name: 'Úti ruha', fall: 0, hurt: 1, steal: 1, knock: 1, rockProof: false, price: 0 },
  { name: 'Bőrmellény', fall: 1.5, hurt: 0.6, steal: 0.6, knock: 1, rockProof: false, price: 60 },
  { name: 'Törpe láncing', fall: 4, hurt: 0.5, steal: 0.6, knock: 1, rockProof: true, price: 220 },
  { name: 'Törpe vért sisakkal', fall: 4, hurt: 0.5, steal: 0.6, knock: 0.5, rockProof: true, price: 600 },
  { name: 'Mithrilpáncél', fall: 6, hurt: 0.3, steal: 0.35, knock: 0.5, rockProof: true, price: 0, locked: true },
];
/** The highest tier sold at the counter (the mithril shirt comes from Erebor). */
export const ARMOUR_SHOP_MAX = 3;
/** The highest tier that has baked bodies (tier 4: the mithril shirt, "<id>-a4.json", NOTES-8-mithril-look). */
const BAKED_MAX = 4;

/** The effects of a player's armour. */
export function armourOf(p) {
  return ARMOUR_TIERS[Math.max(0, Math.min(ARMOUR_TIERS.length - 1, p?.armour | 0))];
}

/** The baked body of a character in an armour tier: "bilbo" (tier 0) or "bilbo-a2". */
export function armourAsset(ch, tier) {
  const t = Math.min(BAKED_MAX, tier | 0);
  return t > 0 ? `${ch.id}-a${t}` : ch.id;
}

/** Counter rows (hud.js rows → `...game.enemies.shopRows(p, cost)`): the next tier of the player's own armour. */
export function armourRows(p, cost) {
  const next = (p.armour | 0) + 1;
  if (next > ARMOUR_SHOP_MAX) return [];
  const t = ARMOUR_TIERS[next];
  return [{
    kind: 'armour', tier: next, art: armourSVG(next), label: `Páncél: ${t.name}`, price: cost(t.price), ok: true, act: () => {
      p.setArmour(next);
      p.say(`Új páncél: ${t.name}. ${ARMOUR_SAY[next]}`, 5);
      p.game.saveNow?.();
    },
  }];
}

/** What the player is told on buying a tier (TERV 0.4 table). */
const ARMOUR_SAY = [
  '',
  'Kisebb az esési sérülés, és a goblinok ritkábban lopnak.',
  'A beomló kövek nem döntenek le, és még nagyobb esést is kibírsz.',
  'Fele akkora hátralökés, ha egy goblin elkap. Kihívás módban több életerőd is van.', // (modes/rules.js lifeOf)
];

/** Counter drawings of the tiers (viewBox 100 × 100, the style of ui/art.js). */
export function armourSVG(tier) {
  if (tier >= 4) return mithrilShirtSVG(); // NOTES-27-loose: tier 4 is the mithril shirt, not the plate
  const shadow = '<ellipse cx="50" cy="93" rx="30" ry="5" fill="#0006"/>';
  if (tier === 1) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${shadow}
      <path d="M30 14l10 6h20l10-6 12 10-6 16v46c0 4-3 6-6 6H30c-3 0-6-2-6-6V40l-6-16z" fill="#7a4e2a" stroke="#3a2010" stroke-width="2"/>
      <path d="M40 20c4 8 16 8 20 0" fill="none" stroke="#3a2010" stroke-width="2"/>
      <path d="M50 28v58" stroke="#3a2010" stroke-width="2"/>
      <path d="M44 34l12 6M56 34l-12 6M44 46l12 6M56 46l-12 6M44 58l12 6M56 58l-12 6" stroke="#c8a870" stroke-width="1.6"/>
      <path d="M26 80h48" stroke="#3a2010" stroke-width="1.5" stroke-dasharray="3 3"/></svg>`;
  }
  if (tier === 2) {
    const rings = [];
    for (let y = 26; y < 86; y += 6) for (let x = 28 + ((y / 6) % 2) * 3; x < 74; x += 6) rings.push(`<circle cx="${x}" cy="${y}" r="2.6"/>`);
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${shadow}
      <defs><clipPath id="mailclip"><path d="M30 14l10 6h20l10-6 14 10-8 18v44c0 4-3 6-6 6H30c-3 0-6-2-6-6V42l-8-18z"/></clipPath></defs>
      <path d="M30 14l10 6h20l10-6 14 10-8 18v44c0 4-3 6-6 6H30c-3 0-6-2-6-6V42l-8-18z" fill="#6e7276" stroke="#2e3034" stroke-width="2"/>
      <g clip-path="url(#mailclip)" fill="none" stroke="#c4c8cc" stroke-width="1.1">${rings.join('')}</g>
      <path d="M40 20c4 8 16 8 20 0" fill="none" stroke="#2e3034" stroke-width="2.5"/></svg>`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${shadow}
    <path d="M26 44c0-6 4-10 10-10h28c6 0 10 4 10 10v30c0 8-10 14-24 14s-24-6-24-14z" fill="#a8acb2" stroke="#3a3c40" stroke-width="2"/>
    <path d="M50 36v48" stroke="#d8b04a" stroke-width="3"/><path d="M28 74c10 6 34 6 44 0" fill="none" stroke="#d8b04a" stroke-width="2.5"/>
    <path d="M18 40c2-8 10-12 16-8l-4 12c-4-2-8-2-12-4zM82 40c-2-8-10-12-16-8l4 12c4-2 8-2 12-4z" fill="#8a8e94" stroke="#3a3c40" stroke-width="2"/>
    <path d="M32 26c0-14 36-14 36 0v4H32z" fill="#b8bcc2" stroke="#3a3c40" stroke-width="2"/>
    <path d="M30 28h40" stroke="#d8b04a" stroke-width="3"/><path d="M50 12v24" stroke="#d8b04a" stroke-width="2"/>
    <path d="M48 28h4v10h-4z" fill="#8a8e94" stroke="#3a3c40" stroke-width="1"/></svg>`;
}
