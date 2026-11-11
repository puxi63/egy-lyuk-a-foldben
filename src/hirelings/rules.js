/* ==== hirelings/rules.js — the numbers of the hired dwarves (TODO item 33, NOTES-42-hirelings) ====
 * Seven of Thorin's company who are neither playable (player.js CHARACTERS: Bilbo, Thorin, Balin, Bofur, Bombur, Kíli)
 * nor the single-play helper (Dori, modes/helper.js): Óin, Glóin, Ori, Dwalin, Nori, Bifur, Fíli. Their hood and beard
 * colours are the Unexpected Party's (home-events/figures.js DWARF_ARRIVALS). Lines: short, plain Hungarian, in
 * character, not quotes from the translation. ==== */

/** The deepest layer they work in (index into materials.js LAYER_TOPS): layers I–III, the surface down to 150 m. */
export const MAX_LAYER = 2;

/** Bottom (m below the surface) of the deepest layer they work in. */
export const LIMIT_DEPTH = 150;

export const HIRE = {
  /** A meal of one dwarf (gold), seven a day; free while Bag End's pantry is stocked. ×Kihívás food, ×co-op price. */
  meal: 1,
  /** Shifts (meal windows) a day: shire/meals.js MEAL_WINDOWS. */
  shifts: 7,
  /** At most this many meal windows are worked off in one go (a long clock jump). */
  maxCatchUp: 21,
  /** Metres from the Green Dragon's counter (props.js SHOP_POS) where the menu stays open (hud.js nearShop: 3.2). */
  reach: 3.2,
};

/** Óin and Glóin's lanterns. */
export const LANTERN = {
  perShift: 2, // per dwarf
  max: 64, // lanterns in all
  spacing: 6.5, // m between two lanterns
  ladderClear: 1.0, // m from a placed ladder
  playerClear: 1.5, // m from a player when hung
  height: 1.35, // m over the floor
  wallOff: 0.17, // m from the wall surface to the lantern's centre
  light: 1.0, // strength in the fire light (underground/firelight.js; Goblin-town's torches are about 1)
  checkEvery: 0.5, // s between two lantern checks (a few lanterns each)
  checkN: 4,
};

/** Ori's map: days per layer (I, II, III). */
export const ORI = { days: [2, 3, 4] };

/** Dwalin, Nori and Bifur gleaning: the small finds left in the explored layers. */
export const GLEAN = {
  small: 25, // a find worth at most this much is small (finds.js values)
  chance: 0.55, // chance of one find per shift on an untouched layer; × the share of the small finds still there
  share: 0.6, // of the find's value comes to the purse (the inn's price for a loose find)
  playerClear: 6, // m: a find this close to a player is left for him
};

/**
 * Fíli's stairwell: a helix carved down beside the pit (axis chosen by qa/hirelings/probe-axis.mjs: no locked set
 * piece, the fewest generated hollows crossed, 15 m from the lift column). `s` is the length along the helix.
 */
export const STAIR = {
  ax: -5, az: -6.5, // the axis (world x, z)
  R: 2.4, // m, the helix's radius (the walking line)
  slope: 35, // degrees
  top: 0.15, // y of the walking line at s = 0 (the lawn)
  perShift: 4, // m of stair (along the helix) per shift, in whole steps: 3.85 m, 2.2 m of depth
  step: 0.35, // m between two carved spots
  r1: 0.85, r1y: 0.8, // the lower sphere: radius, height over the walking line
  r2: 0.7, r2y: 1.5, // the upper sphere
  tread: 0.5, // m between two planks
  walk: 1.35, // walking speed × on the stair (shire/meals.js p.mealK)
  playerClear: 2.5, // m: never carved this close to a player
  ladderClear: 0.7, // m added to the tunnel's radius round a placed ladder
};

/** The dwarves, in menu order. `job`: lamp | map | glean | stair; `wage`: gold a day (×1.35 with two players). */
export const DWARVES = [
  {
    id: 'oin', name: 'Óin', job: 'lamp', wage: 8, hood: 0x6a4a2a, beard: 0x9a9a92,
    jobName: 'lámpásokat gyújt',
    hire: 'Óin vagyok. Glóinnal mi értünk a tűzrakáshoz: fény lesz a járataitokban.',
    bye: 'Óin eloltja a taplóját. Ha kellek, itt leszek a Zöld Sárkányban.',
  },
  {
    id: 'gloin', name: 'Glóin', job: 'lamp', wage: 8, hood: 0xe8e4dc, beard: 0xa83a1a,
    jobName: 'lámpásokat gyújt',
    hire: 'Glóin vagyok. Ahol én járok, ott ég a láng, ha nedves is a fa.',
    bye: 'Glóin összecsomagol. Ha megint sötét lesz odalent, szólj.',
  },
  {
    id: 'ori', name: 'Ori', job: 'map', wage: 2, hood: 0x8a8a8a, beard: 0x6a4a2a,
    jobName: 'térképet rajzol',
    hire: 'Ori vagyok. Lassan dolgozom, de pontosan: lerajzolom Thrór térképére, amit kiástatok.',
    bye: 'Ori elteszi a tollát és a pergament.',
  },
  {
    id: 'dwalin', name: 'Dwalin', job: 'glean', wage: 6, hood: 0x2a4a2a, beard: 0x3a4a8a,
    jobName: 'leleteket szed',
    hire: 'Dwalin vagyok. Ami apróság a földben maradt, azt én összeszedem.',
    bye: 'Dwalin a vállára veti a zsákját, és elköszön.',
  },
  {
    id: 'nori', name: 'Nori', job: 'glean', wage: 6, hood: 0x5a2a6a, beard: 0x8a4a2a,
    jobName: 'leleteket szed',
    hire: 'Nori vagyok. Az apró, csillogó dolgok nem kerülik el a szemem.',
    bye: 'Nori zsebre dugja a kezét, és elballag.',
  },
  {
    id: 'bifur', name: 'Bifur', job: 'glean', wage: 6, hood: 0xd8b030, beard: 0x5a4a3a,
    jobName: 'leleteket szed',
    hire: 'Bifur vagyok. Kaparok, rostálok, amíg akad valami.',
    bye: 'Bifur kiveri a földet a csizmájából, és elmegy.',
  },
  {
    id: 'fili', name: 'Fíli', job: 'stair', wage: 10, hood: 0x2a4a9a, beard: 0xc89a4a,
    jobName: 'lépcsőt ácsol',
    hire: 'Fíli vagyok. Lépcsőt vágok a mélybe a gödör mellé, deszkával, hogy gyorsabban járjatok.',
    bye: 'Fíli leteszi a szerszámot. A lépcső marad, ameddig elkészült.',
  },
];

export const BY_ID = Object.fromEntries(DWARVES.map((d) => [d.id, d]));
