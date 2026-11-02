/* ==== coop-actions/rules.js — the numbers and places of Beorn's rule (TERV 0.11/18 "Beorn szabálya: kettesével gyertek":
   the heavy chest two carry, the pulley two pull, one holds the lamp while the other digs; in single play the hired
   dwarf, Dori, is the second pair of hands; NOTES-23-coop-actions). No game imports, so tests and other modules can
   read it freely. Every place is a fixed point in an existing open space of the mines of Erebor (layer 8,
   underground/erebor-sites.js: the great hall 525 m, the forges 552 m, the deepest gallery 574 m); nothing here stamps
   air into the generated field (sites.js is not touched). ==== */

/**
 * The heavy dwarf chests (Erebor: Thrór's kingdom; the book ch. 13: the dwarves' treasure, and ch. 18: Bilbo's reward,
 * "two small chests, one filled with silver, and the other with gold, such as one strong pony could carry" — too heavy
 * for one hobbit). Generic iron-bound dwarf chests, no named item; 
ame is the accusative phrase of the opening message. `x, z` the spot, `y0` a height just above its floor
 * (the floor is found below it), `yaw` the chest's facing at rest; `gold` goes into the shared purse when it is opened
 * at the Green Dragon or Bag End, `finds` (finds.js ids, layer 8 dwarf work) into the openers' bags.
 */
export const CHESTS = [
  // The great hall, 7 m from the lift's south door: the first and lightest.
  { id: 'csarnok', name: 'a nagycsarnok nehéz törpeládáját', x: 2.6, z: 5.6, y0: -524.4, yaw: 0, gold: 450, finds: ['karperec'] },
  // The forges, by the south wall's tool racks: out through the west door and 75 m up the great ramp to the lift.
  { id: 'kohok', name: 'a kohók nehéz törpeládáját', x: -1.6, z: 5.2, y0: -551.4, yaw: 0.2, gold: 700, finds: ['csiszoltko', 'karperec'] },
  // The deepest working, by the gem face: the dwarves' hoist (HOIST below) lifts it to the forges.
  { id: 'mely', name: 'a legmélyebb tárna nehéz törpeládáját', x: 1.5, z: -2.6, y0: -573.4, yaw: 0.6, gold: 1100, finds: ['csiszoltko', 'csiszoltko', 'nyersko'] },
];

export const CHEST = {
  grab: 1.75, // m from the chest (horizontally) to take hold of a handle
  speed: 0.42, // walk speed factor while carrying ("lassan")
  maxGap: 3.1, // m between the two carriers before the chest slips
  maxRise: 1.7, // m of height between them before it slips
  doriGap: 2.0, // m Dori keeps behind the player on the trail while carrying
  hands: 0.38, // m the chest hangs above the carriers' feet
  openShop: 4.6, // m round the Green Dragon's counter where it can be opened
  openDoor: 4.2, // m round Bag End's round door (outside; or anywhere inside)
  show: 46, // m: drawn only when a player is this near
  liftMax: 8, // seconds of the barrel ride up (as lift.js: 0.8 + way / speed, at most 8)
};

/**
 * The dwarves' hoist ("Törpe csigasor", the name lift.js gives the dwarf pulley): a platform on two ropes over a wheel in a
 * gantry, in a shaft from the deepest gallery (574 m) up through the forges' floor (552 m). It hangs on a pawl: it only
 * rises when two pull at the same moment (within `window` s), `step` m a pull; holding the use key `brakeHold` s
 * releases the brake and it sinks back. The shaft (radius `r`) is cut once, the first time a player comes below
 * `carveBelow` (the dwarves' old shaft; world.js digSphere, saved with the dug terrain).
 */
export const HOIST = {
  x: 0.26, z: 0.21, // on the deepest gallery's course, under the middle of the forges
  bottom: -574, // floor of the deepest gallery (refined from the field at start)
  top: -552, // the forges' floor
  r: 0.95, // shaft radius
  plat: 0.78, // platform radius (players and the chest standing on it ride)
  handle: 1.35, // the two top handles: this far from the axis on the forges' floor
  step: 1.4, // m per pull together
  stepT: 0.5, // s a pull takes
  window: 0.45, // s between the two pulls that still counts as "together"
  beat: 1.3, // s of Dori's rhythm in single play ("Hó… rukk!")
  beatWin: 0.36, // s either side of his "rukk!" that counts
  brakeHold: 0.9, // s holding the use key to release the brake
  sink: 1.8, // m/s it sinks with the brake off
  rail: 1.18, // m: the rail round the top hole (keeps walkers out while the platform is down)
  carveBelow: -500,
};

/**
 * The lamp held high (TERV 0.11/18 "az egyik tartja a lámpát, a másik ás (nagyobb fény, gyorsabb ásás)"; 0.5 "Kettős
 * fáklya"). The holder's own lamp goes up and burns brighter; a partner digging within `reach` gets more light and a
 * shorter swing cooldown. Both count as a strong light while it lasts (`p.lightPower` + 1: goblins, spiders and
 * Gollum read it).
 */
export const LAMP = {
  reach: 3.6, // m between the holder and the digger
  dig: 0.72, // the digger's swing cooldown × this
  holder: { boost: 1.7, reach: 1.5, lift: 0.55 }, // the raised lamp: intensity ×, distance ×, metres higher
  digger: { boost: 1.45, reach: 1.3 },
  doriFollow: 1.3, // m Dori keeps from the player while he holds the lamp
};
