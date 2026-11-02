/* ==== config.js — world grid, tuning and economy constants (shared by the main thread and the mesher worker) ==== */

/** Edge length of one density cell in metres. */
export const CELL = 0.25;
/** Cells per chunk edge (a chunk is 4 m). */
export const CHUNK = 16;
/**
 * Chunk counts: the diggable block is 24 m × 640 m × 24 m (x, y, z; 4 m of it above the ground): all nine layers, down to
 * the stone floor of Smaug's treasury at 634 m (NOTES-7a-hoard; it was 592 m with the mines of Erebor, NOTES-6a-erebor).
 * The block grows by an even number of chunks, so the 2 × 2 × 2 draw batches of the upper layers stay the same. Saves
 * made with a shorter block are not migrated.
 */
export const CX = 6;
export const CY = 160;
export const CZ = 6;
/** Sample counts per axis (one more than the cells). */
export const NX = CX * CHUNK + 1;
export const NY = CY * CHUNK + 1;
export const NZ = CZ * CHUNK + 1;
/** World position of sample (0, 0, 0). The ground surface is at y = 0. */
export const ORIGIN = { x: -12, y: -636, z: -12 };
/** Density units per cell of signed distance (Int8 storage saturates about 1 m from the surface). */
export const DSCALE = 32;
/** Samples this close to the side and bottom faces of the block cannot be dug (keeps the walls closed). */
export const EDGE_LOCK = 2;

/** Player body (a hobbit): eye height, collision spheres, movement. */
export const PLAYER = {
  eye: 1.05,
  radius: 0.25,
  spheres: [0.3, 0.7, 1.0],
  walk: 3.6,
  accel: 18,
  airAccel: 5,
  gravity: 18,
  jump: 5.4,
  climb: 2.4,
  reach: 2.6,
  fallDeath: 9.5,
};

/** Hunger costs (the plate is 100). */
export const HUNGER = {
  max: 100,
  perSwing: 0.15,
  perClimbSecond: 1.1,
  perWalkSecond: 0.06,
  perJump: 0.3,
  faintSeconds: 3,
  respawnLevel: 60,
};

/** Upgrade tiers: scoop radius (m), bite per swing (density units, divided by the soil's hardness) and swing time (s)
 * for the tool; item capacity for the bag. */
export const TOOL_TIERS = [
  { name: 'Kerti ásó', radius: 0.62, power: 7, cooldown: 0.38, price: 0 },
  { name: 'Törpe csákány', radius: 0.72, power: 12, cooldown: 0.34, price: 40 },
  { name: 'Bofur csákánya', radius: 0.82, power: 20, cooldown: 0.3, price: 150 },
  // TERV 0.4: between Bofur's pick and the mithril pick (added with Goblin-town's hard rock, NOTES-2a-goblintown).
  { name: 'Ereborbeli bányászcsákány', radius: 0.88, power: 26, cooldown: 0.28, price: 340 },
  { name: 'Mithril csákány', radius: 0.95, power: 32, cooldown: 0.25, price: 750 },
];
export const BAG_TIERS = [
  { name: 'Vászonzsák', cap: 10, price: 0 },
  { name: 'Bőrzsák', cap: 20, price: 30 },
  { name: 'Törpe hátizsák', cap: 35, price: 120 },
  { name: 'Bilbó zsákja', cap: 60, price: 400 },
];
export const SHOP = {
  ladderPack: 5,
  ladderPrice: 10,
  foodPrice: 4,
  startMoney: 20,
  startLadders: 6,
};
/**
 * Co-op pacing (TERV Decision 16): with two players the shop costs more and finds sell for less, so a pair progresses
 * at about the solo pace. Hunger is not scaled.
 */
export const COOP = { price: 1.35, sell: 0.75 };
export const LADDER_LEN = 4;
export const MAX_LADDERS = 256;
export const MAX_PLAYERS = 2;
