/* ==== finds.js — what can be dug up: the find types and their models, the embedded finds, the random ones,
   and the short flight of every dug-up find into the player's bag ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, CHUNK, CX, CY, CZ, ORIGIN } from './config.js';
import { rng } from './noise.js';
import { LAYER_BOTTOM, LAYER_TOPS, layerAtDepth } from './materials.js';
import { sampleDensity } from './world.js';
import { BUTTONS_POS } from './underground/goblin-sites.js';
import { ORKRIST_POS } from './underground/mirkwood-sites.js';
import { FAMOUS7, HOARD } from './underground/laketown-sites.js';
import { FAMOUS8 } from './underground/erebor-sites.js';
import { goldTop, HALL9, inGold } from './underground/hoard-sites.js';
import { CAVE } from './underground/pieces.js';
import { TROLL_FLOOR } from './underground/sites.js';
import { famousMoment } from './famous-moment.js'; // NOTES-27-loose hook: the famous find's moment (TERV 0.12)

/**
 * Find types. `layer` is where it occurs, `weight` its relative frequency there (rarer = worth more),
 * `embedded` finds glint in the walls, the others turn up at random while digging. `glow` is the glint strength.
 */
export const FIND_TYPES = [
  // Layer 1: Zsáklak kertje
  { id: 'krumpli', name: 'Krumpli', value: 2, layer: 0, weight: 40, color: 0xb08a4a },
  { id: 'gomba', name: 'Gomba Zsizsik gazda földjéről', value: 4, layer: 0, weight: 25, color: 0xd8c8a8 },
  { id: 'gomb', name: 'Bilbó réz gombja', value: 9, layer: 0, weight: 12, color: 0xc89a3a, embedded: true, glow: 0.25, metal: true },
  { id: 'kanal', name: 'Ezüstkanál', value: 15, layer: 0, weight: 8, color: 0xd8dde4, embedded: true, glow: 0.3, metal: true },
  { id: 'mathom', name: 'Elásott mathom', value: 22, layer: 0, weight: 4, color: 0x8a6ab0, embedded: true, glow: 0.35 },
  // Layer 2: Hobbitüregek és pincék
  { id: 'kancso', name: 'Törött kancsó', value: 6, layer: 1, weight: 30, color: 0x9a6a48 },
  { id: 'dohany', name: 'Hosszúvölgyi levél', value: 12, layer: 1, weight: 22, color: 0x6a5a2a },
  { id: 'pipa', name: 'Régi pipa', value: 20, layer: 1, weight: 12, color: 0x5a3a22, embedded: true, glow: 0.25 },
  // id kept from v1 saves; Gandalf's fireworks from the Old Took's midsummer parties (A hobbit, 1. fejezet).
  { id: 'tukkacat', name: 'Gandalf régi tűzijátéka', value: 32, layer: 1, weight: 6, color: 0xc83a3a, embedded: true, glow: 0.45 },
  { id: 'borosuveg', name: 'Öreg borosüveg', value: 45, layer: 1, weight: 3, color: 0x2a7a3a, embedded: true, glow: 0.5 },
  // Layer 3: A trollok barlangja
  { id: 'csont', name: 'Trollvacsora csontja', value: 8, layer: 2, weight: 30, color: 0xe0d8c0 },
  { id: 'ezusterme', name: 'Ezüstérme', value: 25, layer: 2, weight: 20, color: 0xc8ccd4, embedded: true, glow: 0.4, metal: true },
  { id: 'trollarany', name: 'Trollarany', value: 45, layer: 2, weight: 14, color: 0xe8b830, embedded: true, glow: 0.55, metal: true },
  { id: 'kard', name: 'Rozsdás kard a trollok zsákmányából', value: 70, layer: 2, weight: 6, color: 0x9ab0c8, embedded: true, glow: 0.6, metal: true },
  { id: 'smaragd', name: 'Smaragd', value: 120, layer: 2, weight: 3, color: 0x28d070, embedded: true, glow: 0.9 },
  // Sting (A hobbit, 2. fejezet: Bilbo's knife from the trolls' hoard): `keep` = never sold, never dug at random. It lies
  // by the trolls' chest and goes to the player who finds it (p.sting, enemies/sting.js), not into the bag.
  { id: 'fullank', name: 'Fullánk', value: 0, layer: 2, weight: 0, color: 0xc8d4e8, keep: true, metal: true },
  // Glamdring (A hobbit, 3. fejezet: the Foe-hammer, Gandalf's sword from the trolls' hoard, made in Gondolin; TERV 0.2
  // row 3, 0.11/7): the famous find of layer 3. It lies on the floor by the trolls' chest, next to Sting; a swing takes it
  // into Bag End's mathom room (bagEnd.addTrophy), like Orkrist. Appended last to `items` (NOTES-22-secret).
  { id: 'glamdring', name: 'Glamdring', value: 0, layer: 2, weight: 0, color: 0xd8e2ee, embedded: true, glow: 0.9, metal: true, famous: true },
  // Layer 4: Goblinváros (NOTES-2a-goblintown). Goblin tools and chains (A hobbit, 4. fejezet: the goblins make
  // hammers, axes, swords, daggers, pickaxes and tongs), the dwarves' luggage the goblins carried off (4. fejezet),
  // stolen treasure and weapons taken from travellers (generic), a ruby (a generic gem).
  { id: 'goblinlanc', name: 'Rozsdás goblinlánc', value: 14, layer: 3, weight: 30, color: 0x6a5a4e },
  { id: 'goblincsakany', name: 'Goblin csákány', value: 24, layer: 3, weight: 22, color: 0x5a5250 },
  { id: 'malha', name: 'Málha a törpék elhurcolt poggyászából', value: 35, layer: 3, weight: 12, color: 0x7a6040 },
  { id: 'ezustkupa', name: 'Lopott ezüstkupa', value: 55, layer: 3, weight: 18, color: 0xd0d4dc, embedded: true, glow: 0.4, metal: true },
  { id: 'tor', name: 'Utazóktól elvett tőr', value: 80, layer: 3, weight: 12, color: 0xa8b4c0, embedded: true, glow: 0.5, metal: true },
  { id: 'aranylanc', name: 'Lopott aranylánc', value: 110, layer: 3, weight: 7, color: 0xe8b830, embedded: true, glow: 0.6, metal: true },
  { id: 'rubin', name: 'Rubin', value: 170, layer: 3, weight: 3, color: 0xe0203a, embedded: true, glow: 0.95 },
  // The famous find of layer 4 (TERV 0.11/7): not sold, it goes into Bag End's mathom room (bagEnd.addTrophy).
  { id: 'gombok', name: 'Bilbó réz gombjai', value: 0, layer: 3, weight: 0, color: 0xd8a840, embedded: true, glow: 0.9, metal: true, famous: true },
  // Layer 5: Gollam tava (NOTES-3a-lake; TERV 0.2: cave fish, bones). The blind fish Gollum caught in the lake and the
  // bones of what he ate (A hobbit, 5. fejezet: fish, and goblin meat when he could get it; the film: the goblin he drags
  // off), then lost little things (generic, Decision 18): a purse lost by a traveller, a tarnished trinket, cave
  // crystal and a sapphire. The layer's famous find is the Ring (src/gollum/, a `keep` entry).
  { id: 'barlangihal', name: 'Vak barlangi hal', value: 16, layer: 4, weight: 30, color: 0xb8c4c8 },
  { id: 'halcsont', name: 'Halcsontok Gollam szigetéről', value: 21, layer: 4, weight: 24, color: 0xd8d4c4 },
  { id: 'goblincsont', name: 'Goblincsont Gollam vacsorájából', value: 32, layer: 4, weight: 14, color: 0xc8bc9c },
  { id: 'erszeny', name: 'Elveszett erszény régi érmékkel', value: 72, layer: 4, weight: 18, color: 0x6a4a30, embedded: true, glow: 0.35 },
  { id: 'csecsebecse', name: 'Megfakult ezüst csecsebecse', value: 105, layer: 4, weight: 12, color: 0xb8c0c8, embedded: true, glow: 0.5, metal: true },
  { id: 'kristaly', name: 'Barlangi kristály', value: 150, layer: 4, weight: 7, color: 0xc8e0f0, embedded: true, glow: 0.7 },
  { id: 'zafir', name: 'Zafír', value: 230, layer: 4, weight: 3, color: 0x2850e0, embedded: true, glow: 0.95 },
  // The Ring (A hobbit, 5. fejezet: Bilbo finds it on the tunnel floor in the dark): `keep` = never sold, never dug at
  // random, once per game. It lies at the lake provider's ringSpot and goes into the shared collection (src/gollum/ring.js).
  { id: 'gyuru', name: 'A Gyűrű', value: 0, layer: 4, weight: 0, color: 0xf0c040, keep: true, metal: true },
  // Layer 6: Bakacsinerdő gyökerei (NOTES-4a-mirkwood; TERV 0.2: elven wine, silver-leaf jewellery, spider silk). The
  // spiders' silk and the bundles they wrapped (A hobbit, 8. fejezet; the film), an elven arrow (the wood-elves'
  // bows, 8. fejezet), then the Elvenking's things: the wine of his cellars (8–9. fejezet: the strong wine of Dorwinion
  // [ellenőrizendő]), silver-leaf jewellery (TERV 0.2), a silver goblet from the elves' feasts, and white gems (8.
  // fejezet: the Elvenking's weakness was treasure, silver and white gems). The famous find: Orkrist (below).
  { id: 'pokselyem', name: 'Pókselyem', value: 22, layer: 5, weight: 30, color: 0xd8d8d0 },
  { id: 'tundenyil', name: 'Tünde nyílvessző', value: 30, layer: 5, weight: 24, color: 0x9a8a5a },
  { id: 'batyu', name: 'Pókselyembe csavart batyu', value: 44, layer: 5, weight: 14, color: 0xc8c6ba },
  { id: 'tundebor', name: 'Dorwinion bora a Tünde-király pincéjéből', value: 85, layer: 5, weight: 18, color: 0x7a1a3a, embedded: true, glow: 0.45 },
  { id: 'ezustlevel', name: 'Ezüstlevelű tünde-ékszer', value: 130, layer: 5, weight: 12, color: 0xd0dce0, embedded: true, glow: 0.55, metal: true },
  { id: 'serleg', name: 'Ezüstserleg a tündék lakomájáról', value: 190, layer: 5, weight: 7, color: 0xc8ccd4, embedded: true, glow: 0.6, metal: true },
  { id: 'feherko', name: 'Fehér drágakő', value: 300, layer: 5, weight: 3, color: 0xf0f4ff, embedded: true, glow: 1.0 },
  // The famous find of layer 6 (TERV 0.11/7): Thorin's sword, which the Elvenking took from him (A hobbit, 8. fejezet);
  // it hangs on the wall of the armoury alcove off the king's hall and goes into Bag End's mathom room (bagEnd.addTrophy).
  { id: 'orkrist', name: 'Orkrist', value: 0, layer: 5, weight: 0, color: 0xb8c8e0, embedded: true, glow: 0.9, metal: true, famous: true },
  // Layer 7: Tóváros alatt (NOTES-5a-laketown; TERV 0.2: sunken trade goods, old harpoons). The Lake-men fished and
  // traded on the Long Lake (A hobbit, 10. fejezet), the elves' barrels came down the Forest River to them (9–10.
  // fejezet), the toy-market of Dale was the wonder of the North (1. fejezet), the black arrows (14. fejezet; the films:
  // the windlance's black arrows of Dale), the Master's gold (the films). Generic: the net, the harpoon, the hoop, the
  // trade casket.
  { id: 'halo', name: 'Korhadt halászháló', value: 30, layer: 6, weight: 30, color: 0x8a8460 },
  { id: 'szigony', name: 'Régi szigony', value: 40, layer: 6, weight: 24, color: 0x6a6258, metal: true },
  { id: 'abroncs', name: 'Tündehordó vasabroncsa', value: 58, layer: 6, weight: 14, color: 0x5a5048, metal: true },
  { id: 'kereskedolada', name: 'Elsüllyedt kereskedőláda', value: 110, layer: 6, weight: 18, color: 0x7a5a38, embedded: true, glow: 0.4 },
  { id: 'volgyijatek', name: 'Játék Völgy vásárából', value: 160, layer: 6, weight: 12, color: 0xc86a3a, embedded: true, glow: 0.5 },
  { id: 'feketenyil', name: 'Fekete nyílvessző', value: 230, layer: 6, weight: 7, color: 0x2a2a30, embedded: true, glow: 0.55, metal: true },
  { id: 'polgarany', name: 'Arany a Polgármester rejtett kincséből', value: 340, layer: 6, weight: 4, color: 0xe8b830, embedded: true, glow: 0.75, metal: true },
  // The famous find of layer 7 (TERV 0.11/7): the emeralds of Girion, lord of Dale (A hobbit, 12. és 14. fejezet); here
  // on the chest in the Master's hidden hoard under the sunken old town; it goes into Bag End's mathom room.
  { id: 'girion', name: 'Girion smaragdjai', value: 0, layer: 6, weight: 0, color: 0x30d878, embedded: true, glow: 0.95, famous: true },
  // Layer 8: Erebor tárnái (NOTES-6a-erebor; TERV 0.2: iron, gems, dwarf rune stones). The dwarves mined iron and gems
  // under the Mountain and worked them in their forges (A hobbit, 1. és 12–13. fejezet; the films' mines and forges);
  // runes (Thrór's map). Generic: the ore, the tongs, the bar, the rough and the cut gem, the bracelet.
  { id: 'vasero', name: 'Vasérc a tárnákból', value: 42, layer: 7, weight: 30, color: 0x8a4a30, metal: true },
  { id: 'kovacsfogo', name: 'Törpe kovácsfogó', value: 58, layer: 7, weight: 24, color: 0x4a4a50, metal: true },
  { id: 'vasrud', name: 'Kovácsolt vasrúd', value: 80, layer: 7, weight: 14, color: 0x5a5c62, metal: true },
  { id: 'runako', name: 'Törpe rúnakő', value: 140, layer: 7, weight: 18, color: 0x7a8a80, embedded: true, glow: 0.4 },
  { id: 'nyersko', name: 'Nyers ékkő a tárnák falából', value: 200, layer: 7, weight: 12, color: 0x40c0a0, embedded: true, glow: 0.6 },
  { id: 'csiszoltko', name: 'Csiszolt ékkő a törpék műhelyéből', value: 300, layer: 7, weight: 7, color: 0xe03050, embedded: true, glow: 0.85 },
  { id: 'karperec', name: 'Törpe aranykarperec', value: 460, layer: 7, weight: 4, color: 0xe8c040, embedded: true, glow: 0.75, metal: true },
  // The famous find of layer 8 (TERV 0.11/7): the dwarves' harps, "harps of gold strung with silver" (A hobbit, 13.
  // fejezet); they hang in an alcove of the great hall and go into Bag End's mathom room (bagEnd.addTrophy).
  { id: 'harfak', name: 'A törpék hárfái', value: 0, layer: 7, weight: 0, color: 0xe8c050, embedded: true, glow: 0.9, metal: true, famous: true },
  // The mithril shirt (A hobbit, 13. fejezet: Thorin's gift to Bilbo, with its belt of pearls and crystals): `keep` =
  // never sold, never dug at random; it stands in Erebor's sealed armoury and the finder wears it (armour tier 4,
  // underground/erebor-fx.js); Bag End's case keeps its place (addTrophy).
  { id: 'mithril', name: 'Mithrilpáncél', value: 0, layer: 7, weight: 0, color: 0xdfe8f4, keep: true, metal: true },
  // Layer 9: Szmaug kincstára (NOTES-7a-hoard; TERV 0.2: gold, gems). The dragon's hoard of gold and silver, gems and
  // pearls, and the great two-handled cup Bilbo carries off from under Smaug's nose (A hobbit, 12–13. fejezet).
  // `hoard`: Smaug's gold, which feeds the dragon-sickness (src/hoard/). The most valuable finds of the game.
  { id: 'szerme', name: 'Aranyérmék Szmaug kincséből', value: 150, layer: 8, weight: 34, color: 0xf0c040, metal: true, hoard: true },
  { id: 'szlanc', name: 'Aranylánc a sárkány kincséből', value: 210, layer: 8, weight: 24, color: 0xe8b838, metal: true, hoard: true },
  { id: 'gyongysor', name: 'Gyöngysor a kincstárból', value: 270, layer: 8, weight: 14, color: 0xf0ece0, hoard: true },
  { id: 'szserleg', name: 'Kétfülű aranyserleg', value: 420, layer: 8, weight: 16, color: 0xf0c040, embedded: true, glow: 0.7, metal: true, hoard: true },
  { id: 'szrubin', name: 'Vörös drágakő Szmaug ágyából', value: 620, layer: 8, weight: 10, color: 0xe8203a, embedded: true, glow: 0.85, hoard: true },
  { id: 'szfeherko', name: 'Fehér drágakő a kincstárból', value: 850, layer: 8, weight: 6, color: 0xf2f6ff, embedded: true, glow: 0.95, hoard: true },
  // The Arkenstone, the Heart of the Mountain (A hobbit, 13. fejezet; TERV 0.7: one of a kind, never sold, Bag End's case):
  // `keep`, never dug at random; it lies half buried on a dune of the hoard and is picked up there (underground/hoard-fx.js,
  // src/hoard/), which wakes Smaug (TERV 0.8: the finale).
  { id: 'arkenko', name: 'Az Arkenkő', value: 0, layer: 8, weight: 0, color: 0xf4f8ff, keep: true },
];

/**
 * NOTES-44-pickup-edge: the pickup filter's categories (per player slot: which dug finds go into the bag). `id` is what
 * the save stores (`slots[i].pickup` lists the categories switched off), `label` the Zsák screen's toggle.
 */
export const PICKUP_CATS = [
  { id: 'food', label: 'Étel', note: 'krumpli, gomba, barlangi hal' },
  { id: 'small', label: 'Apró holmi', note: 'kancsó, csont, lánc, háló…' },
  { id: 'valuable', label: 'Értékes leletek', note: 'a falban csillogók, Szmaug aranya' },
  { id: 'gem', label: 'Drágakövek', note: 'smaragd, rubin, zafír, kristály…' },
];
/** Edible finds (the dug ones, plus the garden's snacks for completeness: shire/meals.js BAG_FOOD). */
const FOOD_FINDS = new Set(['krumpli', 'gomba', 'barlangihal', 'paradicsom', 'almaspite']);
/** Gems and crystals (all embedded). */
const GEM_FINDS = new Set(['smaragd', 'rubin', 'kristaly', 'zafir', 'feherko', 'nyersko', 'csiszoltko', 'szrubin', 'szfeherko']);

/**
 * The pickup category of a find type, or null when it is always picked up (famous finds, `keep` items: Sting, the Ring,
 * the mithril shirt, the Arkenstone; and anything without a type). Food → gems → embedded or Smaug's hoard = valuable →
 * the rest (the loose, common finds) = small. Cached on the type.
 */
export function pickupCat(type) {
  if (!type) return null;
  if (type.pickCat !== undefined) return type.pickCat;
  const c = type.famous || type.keep ? null
    : FOOD_FINDS.has(type.id) ? 'food'
      : GEM_FINDS.has(type.id) ? 'gem'
        : type.embedded || type.hoard ? 'valuable' : 'small';
  Object.defineProperty(type, 'pickCat', { value: c, enumerable: false });
  return c;
}

/** A small recognisable model per find type (about 10–25 cm), centred on the origin. */
function buildGeometry(id) {
  const g = [];
  const add = (geo, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    geo.rotateX(rx);
    geo.rotateZ(rz);
    geo.translate(x, y, z);
    g.push(geo);
  };
  switch (id) {
    case 'krumpli': {
      const s = new THREE.IcosahedronGeometry(0.07, 1);
      s.scale(1.3, 0.85, 0.95);
      add(s);
      break;
    }
    case 'gomba':
      add(new THREE.CylinderGeometry(0.02, 0.025, 0.07, 8), 0, -0.02);
      add(new THREE.SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.015);
      break;
    case 'gomb':
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 16), 0, 0, 0, Math.PI / 2);
      break;
    case 'kanal': {
      const bowl = new THREE.SphereGeometry(0.035, 10, 6);
      bowl.scale(1, 0.35, 1.5);
      add(bowl, 0, 0, -0.07);
      add(new THREE.BoxGeometry(0.014, 0.008, 0.13), 0, 0.006, 0.03);
      break;
    }
    case 'mathom':
      add(new THREE.BoxGeometry(0.1, 0.07, 0.08));
      add(new THREE.BoxGeometry(0.106, 0.015, 0.086), 0, 0.03);
      break;
    case 'kancso': {
      const pts = [[0.0, -0.06], [0.05, -0.06], [0.06, -0.02], [0.05, 0.03], [0.03, 0.06], [0.035, 0.07]].map(([x, y]) => new THREE.Vector2(x, y));
      add(new THREE.LatheGeometry(pts, 12));
      break;
    }
    case 'dohany':
      add(new THREE.BoxGeometry(0.11, 0.05, 0.07));
      add(new THREE.BoxGeometry(0.115, 0.02, 0.02), 0, 0.03);
      break;
    case 'pipa':
      add(new THREE.CylinderGeometry(0.03, 0.022, 0.05, 10), 0.05, 0.015);
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), -0.03, 0, 0, 0, Math.PI / 2.2);
      break;
    case 'tukkacat':
      // A firework rocket: the paper tube, the cone and the guide stick.
      add(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 10), 0, 0.03);
      add(new THREE.ConeGeometry(0.032, 0.06, 10), 0, 0.13);
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 5), 0.03, -0.08);
      break;
    case 'borosuveg':
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), 0, -0.02);
      add(new THREE.CylinderGeometry(0.012, 0.02, 0.06, 8), 0, 0.06);
      break;
    case 'csont':
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), 0, 0, 0, 0, Math.PI / 2);
      for (const x of [-0.08, 0.08]) for (const z of [-0.015, 0.015]) add(new THREE.SphereGeometry(0.022, 8, 6), x, 0, z);
      break;
    case 'ezusterme':
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16), 0, 0, 0, Math.PI / 2);
      break;
    case 'trollarany':
      add(new THREE.DodecahedronGeometry(0.06, 0));
      add(new THREE.DodecahedronGeometry(0.035, 0), 0.05, 0.02, 0.01);
      break;
    case 'kard':
      add(new THREE.BoxGeometry(0.03, 0.42, 0.008), 0, 0.12);
      add(new THREE.BoxGeometry(0.12, 0.018, 0.02), 0, -0.1);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), 0, -0.155);
      break;
    case 'smaragd': {
      const o = new THREE.OctahedronGeometry(0.06, 0);
      o.scale(0.8, 1.2, 0.8);
      add(o);
      break;
    }
    case 'goblinlanc':
      for (let i = 0; i < 4; i++) {
        const t = new THREE.TorusGeometry(0.03, 0.009, 5, 10);
        t.scale(0.65, 1, 1);
        add(t, (i - 1.5) * 0.045, 0, 0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2);
      }
      break;
    case 'goblincsakany':
      add(new THREE.CylinderGeometry(0.009, 0.011, 0.22, 6), 0, -0.03);
      add(new THREE.ConeGeometry(0.014, 0.1, 5), 0.05, 0.08, 0, 0, -Math.PI / 2 - 0.25);
      add(new THREE.ConeGeometry(0.012, 0.07, 5), -0.04, 0.08, 0, 0, Math.PI / 2 + 0.25);
      break;
    case 'malha':
      add(new THREE.BoxGeometry(0.12, 0.08, 0.08));
      add(new THREE.TorusGeometry(0.045, 0.006, 4, 12), 0, 0, 0, 0, Math.PI / 2);
      break;
    case 'ezustkupa': {
      const pts = [[0, -0.06], [0.04, -0.06], [0.01, -0.045], [0.008, 0.0], [0.035, 0.02], [0.04, 0.07], [0.036, 0.07], [0.0, 0.025]].map(([x, y]) => new THREE.Vector2(x, y));
      add(new THREE.LatheGeometry(pts, 12));
      break;
    }
    case 'tor':
      add(new THREE.BoxGeometry(0.022, 0.16, 0.006), 0, 0.06);
      add(new THREE.BoxGeometry(0.07, 0.014, 0.016), 0, -0.025);
      add(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 6), 0, -0.06);
      break;
    case 'aranylanc':
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        add(new THREE.TorusGeometry(0.014, 0.004, 4, 8), Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05, i % 2 ? Math.PI / 2 : 0, a);
      }
      break;
    case 'rubin': {
      const o = new THREE.OctahedronGeometry(0.05, 1);
      o.scale(1, 0.75, 1);
      add(o);
      break;
    }
    case 'gombok':
      // A few brass buttons scattered on the threshold.
      for (const [x, z, k] of [[0, 0, 0.3], [0.06, 0.035, 1.1], [-0.05, 0.05, 2.0], [0.02, -0.06, 0.7], [-0.08, -0.02, 1.6]]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 12), x, 0, z, k * 0.2, k * 0.15);
      break;
    case 'barlangihal': {
      // A pale blind cave fish: a slim body, a forked tail, a low back fin.
      const body = new THREE.SphereGeometry(0.035, 10, 7);
      body.scale(2.6, 0.75, 0.55);
      add(body);
      const tail = new THREE.ConeGeometry(0.03, 0.05, 4);
      tail.scale(1, 1, 0.25);
      add(tail, 0.105, 0, 0, 0, Math.PI / 2);
      const fin = new THREE.ConeGeometry(0.018, 0.03, 3);
      fin.scale(1.6, 1, 0.2);
      add(fin, -0.005, 0.03, 0);
      break;
    }
    case 'halcsont':
      // A fish skeleton: the spine, the ribs, the skull.
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 5), 0, 0, 0, 0, Math.PI / 2);
      for (let i = 0; i < 7; i++) for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.003, 0.002, 0.045, 4), -0.055 + i * 0.016, 0, s * 0.02, s * 0.9, 0);
      add(new THREE.ConeGeometry(0.022, 0.05, 6), -0.105, 0, 0, 0, Math.PI / 2);
      break;
    case 'goblincsont':
      // A gnawed long bone with knobbly ends and a few finger bones.
      add(new THREE.CylinderGeometry(0.012, 0.014, 0.17, 6), 0, 0, 0, 0, Math.PI / 2);
      for (const x of [-0.085, 0.085]) add(new THREE.SphereGeometry(0.02, 7, 5), x, 0, 0);
      for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 4), -0.03 + i * 0.03, -0.012, 0.03, 1.2, 0.4 * i);
      break;
    case 'erszeny': {
      // A leather purse, its neck tied, two coins spilled out.
      const bag = new THREE.SphereGeometry(0.05, 10, 8);
      bag.scale(1, 0.85, 0.9);
      add(bag);
      add(new THREE.CylinderGeometry(0.018, 0.03, 0.03, 8), 0, 0.05);
      for (const [x, z] of [[0.065, 0.02], [0.05, -0.04]]) add(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 10), x, -0.035, z, 0.2, 0);
      break;
    }
    case 'csecsebecse':
      // A tarnished little silver locket on a broken chain.
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 14), 0, 0, 0, Math.PI / 2);
      add(new THREE.TorusGeometry(0.008, 0.003, 4, 8), 0, 0.036, 0);
      for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(0.007, 0.002, 3, 6), 0.012 * i - 0.004, 0.05 + i * 0.006, 0, i % 2 ? Math.PI / 2 : 0, 0.5);
      break;
    case 'kristaly':
      // A cluster of pale hexagonal crystals.
      for (const [x, z, h, rx, rz] of [[0, 0, 0.11, 0, 0], [0.025, 0.01, 0.07, 0.3, -0.4], [-0.022, 0.015, 0.08, -0.25, 0.35], [0.005, -0.025, 0.06, 0.4, 0.1]]) {
        const c = new THREE.CylinderGeometry(0.012, 0.014, h, 6);
        c.translate(0, h / 2, 0);
        const tip = new THREE.ConeGeometry(0.012, 0.025, 6);
        tip.translate(0, h + 0.0125, 0);
        add(c, x, -0.04, z, rx, rz);
        add(tip, x, -0.04, z, rx, rz);
      }
      break;
    case 'zafir': {
      const o = new THREE.OctahedronGeometry(0.05, 1);
      o.scale(0.9, 0.7, 0.9);
      add(o);
      break;
    }
    case 'pokselyem':
      // A skein of grey spider silk, wound round itself.
      for (let i = 0; i < 4; i++) {
        const t = new THREE.TorusGeometry(0.045, 0.012, 5, 12);
        add(t, 0, 0, 0, i * 0.8, i * 0.5);
      }
      break;
    case 'tundenyil':
      // A slim elven arrow: the shaft, a leaf-shaped head, grey fletching.
      add(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 5), 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.ConeGeometry(0.012, 0.045, 4), -0.17, 0, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.002, 0.014), 0.13, 0, s * 0.008, s * 0.4, 0);
      break;
    case 'batyu': {
      // A small bundle wrapped in silk, a few strands round it.
      const b = new THREE.SphereGeometry(0.045, 9, 8);
      b.scale(1, 1.8, 1);
      add(b);
      for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(0.046, 0.004, 3, 10), 0, -0.04 + i * 0.04, 0, Math.PI / 2 + (i - 1) * 0.2, 0);
      break;
    }
    case 'tundebor':
      // A dark wine flask with a stopper.
      add(new THREE.SphereGeometry(0.045, 10, 8), 0, -0.02);
      add(new THREE.CylinderGeometry(0.012, 0.018, 0.06, 8), 0, 0.045);
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.015, 8), 0, 0.08);
      break;
    case 'ezustlevel': {
      // A silver brooch of leaves: three leaf blades round a small boss.
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.SphereGeometry(0.03, 8, 4);
        leaf.scale(0.45, 0.08, 1.2);
        const a = (i / 3) * Math.PI * 2;
        leaf.rotateY(a);
        leaf.translate(Math.sin(a) * 0.03, 0, Math.cos(a) * 0.03);
        g.push(leaf);
      }
      add(new THREE.SphereGeometry(0.012, 8, 6));
      break;
    }
    case 'serleg': {
      const pts = [[0, -0.07], [0.035, -0.07], [0.008, -0.055], [0.007, -0.005], [0.03, 0.01], [0.042, 0.06], [0.038, 0.06], [0.0, 0.02]].map(([x, y]) => new THREE.Vector2(x, y));
      add(new THREE.LatheGeometry(pts, 14));
      break;
    }
    case 'feherko': {
      const o = new THREE.OctahedronGeometry(0.045, 1);
      o.scale(1, 1.25, 1);
      add(o);
      break;
    }
    case 'orkrist':
      // Orkrist (A hobbit: the Goblin-cleaver): a long, slightly curved elven blade, a narrow guard, a wrapped grip.
      add(new THREE.BoxGeometry(0.038, 0.78, 0.008), 0, 0.42);
      add(new THREE.ConeGeometry(0.019, 0.09, 4), 0, 0.855);
      add(new THREE.BoxGeometry(0.16, 0.02, 0.03), 0, 0.02);
      add(new THREE.CylinderGeometry(0.014, 0.016, 0.18, 7), 0, -0.08);
      add(new THREE.SphereGeometry(0.022, 8, 6), 0, -0.18);
      break;
    case 'glamdring': {
      // Glamdring (Gandalf's sword, the Foe-hammer): a long straight elven blade tapering to a point with a fuller, a
      // crossguard whose arms bend towards the blade, a ringed grip and a disc pommel (the films' look). About 1.2 m;
      // centred on its middle so a swing anywhere along it reaches it.
      const L = 0.98;
      const W = 0.027;
      const sh = new THREE.Shape();
      sh.moveTo(-W, 0);
      sh.lineTo(-W * 0.82, L * 0.78);
      sh.quadraticCurveTo(-W * 0.6, L * 0.93, 0, L);
      sh.quadraticCurveTo(W * 0.6, L * 0.93, W * 0.82, L * 0.78);
      sh.lineTo(W, 0);
      sh.lineTo(-W, 0);
      const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1, curveSegments: 6 });
      blade.translate(0, 0, -0.002);
      add(blade);
      add(new THREE.BoxGeometry(0.008, L * 0.7, 0.012), 0, L * 0.37);
      add(new THREE.BoxGeometry(0.2, 0.022, 0.03), 0, 0);
      for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.011, 0.065, 5), s * 0.104, 0.028, 0, 0, -s * 0.5);
      add(new THREE.CylinderGeometry(0.015, 0.017, 0.22, 7), 0, -0.12);
      for (const y of [-0.05, -0.19]) add(new THREE.TorusGeometry(0.018, 0.005, 4, 10), 0, y, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.036, 0.036, 0.018, 12), 0, -0.25, 0, Math.PI / 2);
      for (const p of g) p.translate(0, -0.37, 0);
      break;
    }
    case 'halo':
      // A wad of rotten net: a crumpled lump with a few mesh loops and a float.
      for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(0.04 + i * 0.006, 0.004, 3, 8), (i - 2) * 0.012, 0, 0, i * 0.7, i * 0.4);
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 8), 0.05, 0.02, 0, 0, Math.PI / 2);
      break;
    case 'szigony':
      // An old harpoon: a shaft stump, a barbed iron head.
      add(new THREE.CylinderGeometry(0.008, 0.009, 0.24, 6), 0.04, 0, 0, 0, Math.PI / 2);
      add(new THREE.ConeGeometry(0.016, 0.07, 4), -0.115, 0, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.006, 0.035, 3), -0.08, s * 0.012, 0, 0, Math.PI / 2 - s * 0.6);
      break;
    case 'abroncs':
      add(new THREE.TorusGeometry(0.075, 0.007, 4, 18), 0, 0, 0, Math.PI / 2 - 0.3, 0);
      break;
    case 'kereskedolada':
      // A small banded trade casket.
      add(new THREE.BoxGeometry(0.13, 0.08, 0.09));
      for (const x of [-0.04, 0.04]) add(new THREE.BoxGeometry(0.012, 0.084, 0.094), x);
      break;
    case 'volgyijatek': {
      // A painted wooden toy horse on a little board with wheels.
      const body = new THREE.BoxGeometry(0.08, 0.035, 0.03);
      add(body, 0, 0.02);
      add(new THREE.BoxGeometry(0.025, 0.05, 0.025), 0.045, 0.05);
      for (const x of [-0.03, 0.03]) for (const z of [-0.01, 0.01]) add(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 4), x, -0.005, z);
      add(new THREE.BoxGeometry(0.1, 0.008, 0.04), 0, -0.024);
      for (const x of [-0.04, 0.04]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), x, -0.03, 0, Math.PI / 2);
      break;
    }
    case 'feketenyil':
      // A black arrow: a long black iron bolt with a heavy head.
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 6), 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.ConeGeometry(0.016, 0.06, 4), -0.2, 0, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.002, 0.016), 0.15, 0, s * 0.009, s * 0.4, 0);
      break;
    case 'polgarany':
      // A spill of gold coins.
      for (const [x, z, k] of [[0, 0, 0], [0.035, 0.02, 1], [-0.03, 0.025, 2], [0.01, -0.035, 3], [-0.025, -0.02, 4], [0.005, 0.005, 5]]) add(new THREE.CylinderGeometry(0.02, 0.02, 0.005, 10), x, k * 0.004, z, k * 0.25, k * 0.2);
      break;
    case 'vasero':
      // A lump of rusty iron ore with a few smaller lumps grown on.
      add(new THREE.DodecahedronGeometry(0.055, 0), 0, 0, 0, 0.3, 0.2);
      add(new THREE.DodecahedronGeometry(0.035, 0), 0.045, 0.02, 0.01, 0.8, 0);
      add(new THREE.DodecahedronGeometry(0.028, 0), -0.04, -0.015, 0.025, 0.2, 1.1);
      break;
    case 'kovacsfogo':
      // A smith's tongs: two long reins crossed at the rivet, the jaws bent towards each other.
      for (const s of [-1, 1]) {
        add(new THREE.BoxGeometry(0.24, 0.012, 0.01), 0.02, 0, s * 0.006, 0, s * 0.09);
        add(new THREE.BoxGeometry(0.05, 0.014, 0.012), -0.115, s * 0.012, s * 0.006, 0, -s * 0.5);
      }
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.03, 8), -0.07, 0, 0, Math.PI / 2, 0);
      break;
    case 'vasrud': {
      // A wrought iron bar: tapered, four-sided.
      const b = new THREE.CylinderGeometry(0.022, 0.03, 0.2, 4);
      b.rotateY(Math.PI / 4);
      add(b, 0, 0, 0, 0, Math.PI / 2);
      break;
    }
    case 'runako':
      // A flat stone with carved runes (strokes raised from the face: one colour, the glint shows them).
      add(new THREE.BoxGeometry(0.12, 0.16, 0.03));
      for (const [x, y, h, a] of [[-0.03, 0.04, 0.06, 0], [-0.03, 0.05, 0.035, 0.7], [0.02, 0.04, 0.06, 0], [0.035, 0.03, 0.035, -0.7], [-0.025, -0.035, 0.05, 0], [0.01, -0.03, 0.045, 0.6], [0.03, -0.04, 0.05, 0]]) {
        add(new THREE.BoxGeometry(0.008, h, 0.008), x, y, 0.017, 0, a);
      }
      break;
    case 'nyersko':
      // Rough gem crystals in a bit of rock.
      add(new THREE.DodecahedronGeometry(0.04, 0), 0, -0.02, 0);
      for (const [x, z, h, rx, rz] of [[0, 0, 0.09, 0, 0], [0.02, 0.015, 0.06, 0.4, -0.5], [-0.02, -0.01, 0.07, -0.3, 0.45]]) {
        const o = new THREE.OctahedronGeometry(0.02, 0);
        o.scale(1, h / 0.04, 1);
        add(o, x, 0.02, z, rx, rz);
      }
      break;
    case 'csiszoltko':
      // A cut gem: a flat table on a faceted crown over a deep pointed pavilion.
      add(new THREE.CylinderGeometry(0.03, 0.045, 0.02, 8), 0, 0.01);
      add(new THREE.ConeGeometry(0.045, 0.05, 8), 0, -0.025, 0, Math.PI, 0);
      break;
    case 'karperec':
      // A heavy dwarf bracelet of gold with set stones.
      add(new THREE.TorusGeometry(0.045, 0.012, 6, 18), 0, 0, 0, Math.PI / 2, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        add(new THREE.OctahedronGeometry(0.012, 0), Math.cos(a) * 0.05, 0.004, Math.sin(a) * 0.05);
      }
      break;
    case 'harfak':
      // Two dwarf harps (gold, silver strings: one colour), side by side in the xy plane: the pillar, the curved neck,
      // the sound box, the strings.
      for (const [ox, s] of [[-0.21, 1.25], [0.21, 1.05]]) {
        const h = 0.5 * s;
        add(new THREE.CylinderGeometry(0.014 * s, 0.016 * s, h, 6), ox - 0.12 * s, 0, 0);
        const neck = new THREE.TorusGeometry(0.13 * s, 0.013 * s, 5, 10, Math.PI * 0.8);
        neck.rotateZ(0.15);
        add(neck, ox, h / 2 - 0.07 * s, 0);
        const box = new THREE.BoxGeometry(0.05 * s, h * 0.95, 0.05 * s);
        box.rotateZ(-0.42);
        add(box, ox + 0.04 * s, -0.01, 0);
        for (let k = 0; k < 6; k++) {
          const x = ox - 0.09 * s + k * 0.035 * s;
          const len = h * (0.85 - k * 0.1);
          add(new THREE.BoxGeometry(0.003, len, 0.003), x, h / 2 - 0.05 * s - len / 2, 0);
        }
      }
      break;
    case 'mithril':
      // The mithril shirt: a small mail shirt, short sleeves, a belt.
      add(new THREE.CylinderGeometry(0.07, 0.085, 0.2, 10));
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 8), s * 0.09, 0.06, 0, 0, s * 1.1);
      add(new THREE.TorusGeometry(0.083, 0.008, 4, 14), 0, -0.05, 0, Math.PI / 2, 0);
      break;
    case 'szerme':
      // A heap of gold coins.
      for (const [x, z, k] of [[0, 0, 0], [0.04, 0.015, 1], [-0.035, 0.03, 2], [0.015, -0.04, 3], [-0.03, -0.025, 4], [0.01, 0.01, 5], [0.03, -0.01, 6]]) add(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 10), x, k * 0.005, z, k * 0.3, k * 0.25);
      break;
    case 'szlanc':
      // A heavy gold chain: links in a loose loop.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        add(new THREE.TorusGeometry(0.014, 0.004, 4, 8), Math.cos(a) * 0.07, 0, Math.sin(a) * 0.05, i % 2 ? Math.PI / 2 : 0, a);
      }
      break;
    case 'gyongysor':
      // A string of pearls (white beads) in a loop.
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        add(new THREE.SphereGeometry(0.009, 6, 4), Math.cos(a) * 0.065, 0, Math.sin(a) * 0.05);
      }
      break;
    case 'szserleg':
      // The great two-handled cup: a deep bowl on a stem and foot, a handle each side.
      add(new THREE.CylinderGeometry(0.06, 0.035, 0.09, 12, 1, true), 0, 0.05);
      add(new THREE.CylinderGeometry(0.035, 0.012, 0.02, 12), 0, 0.0);
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.05, 6), 0, -0.035);
      add(new THREE.CylinderGeometry(0.045, 0.05, 0.012, 12), 0, -0.065);
      for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.028, 0.006, 4, 10, Math.PI), s * 0.065, 0.05, 0, 0, s * -Math.PI / 2);
      break;
    case 'szrubin':
      // A large red cut stone.
      add(new THREE.CylinderGeometry(0.035, 0.05, 0.022, 10), 0, 0.011);
      add(new THREE.ConeGeometry(0.05, 0.055, 10), 0, -0.027, 0, Math.PI, 0);
      break;
    case 'szfeherko': {
      // A white gem like starlight: a rounded faceted stone.
      const o = new THREE.OctahedronGeometry(0.05, 1);
      o.scale(1, 0.75, 1);
      add(o);
      break;
    }
    case 'arkenko': {
      // The Arkenstone: a great white gem of a thousand facets.
      const o = new THREE.IcosahedronGeometry(0.075, 1);
      o.scale(1, 0.85, 0.95);
      add(o);
      break;
    }
    case 'girion':
      // Girion's necklace of emeralds: green stones on a golden chain loop.
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const o = new THREE.OctahedronGeometry(0.016, 0);
        o.scale(0.8, 1.2, 0.8);
        add(o, Math.cos(a) * 0.08, 0, Math.sin(a) * 0.065);
      }
      add(new THREE.OctahedronGeometry(0.03, 1), 0, -0.01, 0.075);
      break;
    default:
      add(new THREE.IcosahedronGeometry(0.06, 0));
  }
  // Merge needs matching attributes: drop UVs everywhere.
  for (const p of g) p.deleteAttribute('uv');
  return mergeGeometries(g.map((p) => (p.index ? p.toNonIndexed() : p)));
}

const byLayer = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((l) => FIND_TYPES.filter((f) => f.layer === l && !f.famous));
/** The embedded finds of a save made before Goblin-town (v2) came from this many candidates, down to this depth. */
const V2_COUNT = 1000;
const V2_BOTTOM = 150;
/** Embedded finds in Goblin-town's rock (layer 4, 150–230 m). */
const L4_COUNT = 330;
const L4_TOP = LAYER_TOPS[3];
const L4_BOTTOM = LAYER_TOPS[4];
/** Embedded finds in the rock round Gollum's lake (layer 5, 230–300 m; NOTES-3a-lake). */
const L5_COUNT = 300;
/** Layer 5's bottom as it was when its finds were placed (LAYER_BOTTOM moved on to 390 m with layer 6). */
const L5_BOTTOM = 300;
/** Embedded finds in the loam and roots of Mirkwood (layer 6, 300–390 m; NOTES-4a-mirkwood). */
const L6_COUNT = 320;
/** Layer 6's bottom as it was when its finds were placed (LAYER_BOTTOM moved on to 470 m with layer 7). */
const L6_BOTTOM = 390;
/** Embedded finds in the silt and piles beneath Lake-town (layer 7, 390–470 m; NOTES-5a-laketown). */
const L7_COUNT = 340;
/** Layer 7's bottom as it was when its finds were placed (LAYER_BOTTOM moved on to 580 m with layer 8). */
const L7_BOTTOM = 470;
/** Embedded finds in the rock of Erebor's mines (layer 8, 470–580 m; NOTES-6a-erebor). */
const L8_COUNT = 360;
/** Layer 8's bottom as it was when its finds were placed (LAYER_BOTTOM moved on to 634 m with layer 9). */
const L8_BOTTOM = 580;
/** Embedded finds in Smaug's treasury (layer 9; NOTES-7a-hoard): most in the sea of gold, the rest in the rock. */
const L9_COUNT = 300;

/** Weighted pick of a find type in a layer (optionally only the embedded ones). */
function pick(layer, r, embeddedOnly) {
  // `keep` finds (Sting) are placed by hand, never dug up at random.
  const list = byLayer[layer].filter((f) => !f.keep && (!embeddedOnly || f.embedded));
  let total = 0;
  for (const f of list) total += f.weight;
  let x = r * total;
  for (const f of list) {
    x -= f.weight;
    if (x <= 0) return f;
  }
  return list[list.length - 1];
}

/** Chance per cubic metre dug of a random (not embedded) find. */
const RANDOM_PER_M3 = 1.0;
/** Seconds a dug-up find flies into the bag. */
const FLIGHT = 0.55;

export class Finds {
  constructor(scene, count = 1000) {
    this.scene = scene;
    const r = rng(1937);
    this.geo = new Map();
    this.mat = new Map();
    for (const t of FIND_TYPES) {
      this.geo.set(t.id, buildGeometry(t.id));
      const c = new THREE.Color(t.color);
      this.mat.set(t.id, new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(t.glow || 0.05) }));
    }
    // Embedded finds: below the topsoil, away from the block's walls, never floating in a cave; more deeper down.
    // Placed against the generated field (Game builds Finds before the save's terrain is applied), in a fixed order
    // the saves index into: the first V2_COUNT exactly as before Goblin-town (layers 1–3), then layer 4, then the
    // famous find. New layers must append, never reorder.
    this.items = [];
    for (let tries = 0; this.items.length < count && tries < count * 20; tries++) {
      const depth = 1 + Math.pow(r(), 0.8) * (V2_BOTTOM - 2);
      const x = ORIGIN.x + 1.5 + r() * 21;
      const z = ORIGIN.z + 1.5 + r() * 21;
      const type = pick(layerAtDepth(depth), r(), true);
      if (sampleDensity(x, -depth, z) < 8) continue;
      this.items.push({ type, x, y: -depth, z, rot: new THREE.Euler(r() * 6, r() * 6, r() * 6), taken: false });
    }
    // Layer 4 (Goblin-town): in the rock around its caverns, a few more near the top of the layer.
    const r4 = rng(2304);
    for (let n = 0, tries = 0; n < L4_COUNT && tries < L4_COUNT * 30; tries++) {
      const depth = L4_TOP + 1 + Math.pow(r4(), 1.1) * (L4_BOTTOM - L4_TOP - 2);
      const x = ORIGIN.x + 1.5 + r4() * 21;
      const z = ORIGIN.z + 1.5 + r4() * 21;
      const type = pick(layerAtDepth(depth), r4(), true);
      const rot = new THREE.Euler(r4() * 6, r4() * 6, r4() * 6);
      if (sampleDensity(x, -depth, z) < 8) continue;
      this.items.push({ type, x, y: -depth, z, rot, taken: false });
      n++;
    }
    // The famous find of layer 4: Bilbo's brass buttons on the back gate's threshold.
    this.items.push({ type: FIND_TYPES.find((f) => f.id === 'gombok'), x: BUTTONS_POS.x, y: BUTTONS_POS.y, z: BUTTONS_POS.z, rot: new THREE.Euler(0, 0.4, 0), taken: false });
    // Layer 5 (Gollum's lake, NOTES-3a-lake): in the rock round the cave and the tunnel, appended after the famous find
    // of layer 4 (older saves index into the list before it). Its famous find, the Ring, is placed by src/gollum/.
    const r5 = rng(2305);
    for (let n = 0, tries = 0; n < L5_COUNT && tries < L5_COUNT * 30; tries++) {
      const depth = LAYER_TOPS[4] + 1 + Math.pow(r5(), 1.05) * (L5_BOTTOM - LAYER_TOPS[4] - 2);
      const x = ORIGIN.x + 1.5 + r5() * 21;
      const z = ORIGIN.z + 1.5 + r5() * 21;
      const type = pick(layerAtDepth(depth), r5(), true);
      const rot = new THREE.Euler(r5() * 6, r5() * 6, r5() * 6);
      if (sampleDensity(x, -depth, z) < 8) continue;
      this.items.push({ type, x, y: -depth, z, rot, taken: false });
      n++;
    }
    // Layer 6 (the roots of Mirkwood, NOTES-4a-mirkwood): in the loam, the roots and round the halls, appended after
    // layer 5 (older saves index into the list before it); then its famous find, Orkrist, in the armoury alcove.
    const r6 = rng(2306);
    for (let n = 0, tries = 0; n < L6_COUNT && tries < L6_COUNT * 30; tries++) {
      const depth = LAYER_TOPS[5] + 1 + Math.pow(r6(), 1.05) * (L6_BOTTOM - LAYER_TOPS[5] - 2);
      const x = ORIGIN.x + 1.5 + r6() * 21;
      const z = ORIGIN.z + 1.5 + r6() * 21;
      const type = pick(layerAtDepth(depth), r6(), true);
      const rot = new THREE.Euler(r6() * 6, r6() * 6, r6() * 6);
      if (sampleDensity(x, -depth, z) < 8) continue;
      this.items.push({ type, x, y: -depth, z, rot, taken: false });
      n++;
    }
    this.items.push({ type: FIND_TYPES.find((f) => f.id === 'orkrist'), x: ORKRIST_POS.x, y: ORKRIST_POS.y, z: ORKRIST_POS.z, rot: new THREE.Euler(Math.PI / 2, 0, 0), taken: false });
    // Layer 7 (beneath Lake-town, NOTES-5a-laketown): in the silt and the piles, appended after Orkrist (index 1951; the
    // older indices stay valid); then a little of the Master's gold in the hoard room's walls, then its famous find,
    // Girion's emeralds, on the Master's chest.
    const r7 = rng(2307);
    for (let n = 0, tries = 0; n < L7_COUNT && tries < L7_COUNT * 30; tries++) {
      const depth = LAYER_TOPS[6] + 1 + Math.pow(r7(), 1.05) * (L7_BOTTOM - LAYER_TOPS[6] - 2);
      const x = ORIGIN.x + 1.5 + r7() * 21;
      const z = ORIGIN.z + 1.5 + r7() * 21;
      const type = pick(layerAtDepth(depth), r7(), true);
      const rot = new THREE.Euler(r7() * 6, r7() * 6, r7() * 6);
      if (sampleDensity(x, -depth, z) < 8) continue;
      this.items.push({ type, x, y: -depth, z, rot, taken: false });
      n++;
    }
    const gold = FIND_TYPES.find((f) => f.id === 'polgarany');
    for (let n = 0, tries = 0; n < 8 && tries < 400; tries++) {
      // 0.15–0.45 m into the hoard room's walls and floor.
      const side = Math.floor(r7() * 5);
      const h = HOARD;
      const dIn = 0.15 + r7() * 0.3;
      const u = r7();
      const v = r7();
      const x = side === 0 ? h.x0 - dIn : side === 1 ? h.x1 + dIn : h.x0 + 0.3 + u * (h.x1 - h.x0 - 0.6);
      const z = side === 2 ? h.z0 - dIn : side === 3 ? h.z1 + dIn : side === 4 ? h.z0 + 0.3 + v * (h.z1 - h.z0 - 0.6) : h.z0 + 0.3 + u * (h.z1 - h.z0 - 0.6);
      const y = side === 4 ? h.y0 - dIn : h.y0 + 0.2 + v * 1.4;
      const rot = new THREE.Euler(r7() * 6, r7() * 6, r7() * 6);
      if (sampleDensity(x, y, z) < 8) continue;
      this.items.push({ type: gold, x, y, z, rot, taken: false });
      n++;
    }
    this.items.push({ type: FIND_TYPES.find((f) => f.id === 'girion'), x: FAMOUS7.x, y: FAMOUS7.y, z: FAMOUS7.z, rot: new THREE.Euler(Math.PI / 2, 0, 0), taken: false });
    // Layer 8 (the mines of Erebor, NOTES-6a-erebor): in the dwarf stone round the workings, appended after Girion's
    // emeralds (index 2300; the older indices stay valid); then its famous find, the dwarves' harps, on the wall of the
    // great hall's alcove.
    const r8 = rng(2308);
    for (let n = 0, tries = 0; n < L8_COUNT && tries < L8_COUNT * 30; tries++) {
      const depth = LAYER_TOPS[7] + 1 + Math.pow(r8(), 1.05) * (L8_BOTTOM - LAYER_TOPS[7] - 2);
      const x = ORIGIN.x + 1.5 + r8() * 21;
      const z = ORIGIN.z + 1.5 + r8() * 21;
      const type = pick(layerAtDepth(depth), r8(), true);
      const rot = new THREE.Euler(r8() * 6, r8() * 6, r8() * 6);
      if (sampleDensity(x, -depth, z) < 8) continue;
      this.items.push({ type, x, y: -depth, z, rot, taken: false });
      n++;
    }
    this.items.push({ type: FIND_TYPES.find((f) => f.id === 'harfak'), x: FAMOUS8.x, y: FAMOUS8.y, z: FAMOUS8.z, rot: new THREE.Euler(0, Math.PI / 2, 0), taken: false });
    // Layer 9 (Smaug's treasury, NOTES-7a-hoard): three in four in the sea of gold (between the stone floor and the gold's
    // surface), the rest in the rock round the treasury; appended after the harps (index 2662 on; the older indices stay
    // valid). Its famous find, the Arkenstone, is not in this list (underground/hoard-fx.js, src/hoard/).
    const r9 = rng(2309);
    for (let n = 0, tries = 0; n < L9_COUNT && tries < L9_COUNT * 30; tries++) {
      const inSea = r9() < 0.75;
      const x = ORIGIN.x + 1.5 + r9() * 21;
      const z = ORIGIN.z + 1.5 + r9() * 21;
      const top = goldTop(x, z);
      const y = inSea ? HALL9.floor + 0.3 + r9() * (top - 0.25 - HALL9.floor - 0.3) : -(LAYER_TOPS[8] + 1 + r9() * (LAYER_BOTTOM - LAYER_TOPS[8] - 2));
      const type = pick(8, r9(), true);
      const rot = new THREE.Euler(r9() * 6, r9() * 6, r9() * 6);
      if (inSea && !inGold(x, y, z)) continue;
      if (sampleDensity(x, y, z) < 8) continue;
      this.items.push({ type, x, y, z, rot, taken: false });
      n++;
    }
    // Layer 3's famous find, Glamdring (NOTES-22-secret): appended after layer 9's finds (index 2962; every older index
    // stays valid). It lies flat on the cave floor along the trolls' chest, in front of it beside Sting (pieces.js CAVE).
    {
      const [cx, cz] = CAVE.chest;
      const yaw = -1.2;
      const lx = -0.1;
      const lz = 1.25;
      const x = cx + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
      const z = cz - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
      let y = TROLL_FLOOR;
      for (let t = TROLL_FLOOR + 0.8; t > TROLL_FLOOR - 1; t -= 0.02) {
        if (sampleDensity(x, t, z) > 0) {
          y = t + 0.01;
          break;
        }
      }
      // The blade along the chest's long side (its local x), lying flat (the blade's thin axis up).
      const d = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const up = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(d, up);
      const rot = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, d, up));
      this.items.push({ type: FIND_TYPES.find((f) => f.id === 'glamdring'), x, y: y + 0.02, z, rot, taken: false });
    }
    // One instanced mesh per embedded type (about ten draw calls in all). Per view only the untaken finds in the
    // chunks that view may see are written into the instance buffers (cullFor), so the instance order changes.
    this.meshes = new Map();
    this.typeIndex = new Map();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const embeddedTypes = FIND_TYPES.filter((f) => f.embedded);
    for (const t of embeddedTypes) {
      const list = this.items.filter((it) => it.type === t);
      const mesh = new THREE.InstancedMesh(this.geo.get(t.id), this.mat.get(t.id), Math.max(1, list.length));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.typeIndex.set(t.id, this.meshes.size);
      this.meshes.set(t.id, mesh);
    }
    this.meshList = [...this.meshes.values()];
    this.counts = new Int32Array(this.meshList.length);
    // Each find's matrix, and the chunks its model may reach into (a sphere of 0.3 m around its centre).
    const S = CHUNK * CELL;
    this.byChunk = Array.from({ length: CX * CY * CZ }, () => null);
    this.items.forEach((it, i) => {
      it.index = i;
      it.mesh = this.typeIndex.get(it.type.id);
      it.matrix = m.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromEuler(it.rot), one).toArray(new Float32Array(16));
      const span = (v, o, n) => [Math.max(0, Math.floor((v - 0.3 - o) / S)), Math.min(n - 1, Math.floor((v + 0.3 - o) / S))];
      const [x0, x1] = span(it.x, ORIGIN.x, CX);
      const [y0, y1] = span(it.y, ORIGIN.y, CY);
      const [z0, z1] = span(it.z, ORIGIN.z, CZ);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            const key = cx + CX * (cy + CY * cz);
            (this.byChunk[key] || (this.byChunk[key] = [])).push(it);
          }
        }
      }
    });
    this.seenStamp = new Uint32Array(this.items.length);
    this.stamp = 0;
    this.rand = rng(4242);
    this.flying = [];
  }

  /**
   * Per view: fills the instance buffers with the untaken finds in the chunks this view may see (terrain.cullFor's
   * mask); a find in a chunk no line of sight reaches cannot show a pixel.
   * @param {Uint8Array} visible per chunk key, 1 when the chunk may be seen
   */
  cullFor(visible) {
    const counts = this.counts;
    counts.fill(0);
    const stamp = ++this.stamp;
    for (let key = 0; key < visible.length; key++) {
      if (!visible[key]) continue;
      const list = this.byChunk[key];
      if (!list) continue;
      for (const it of list) {
        if (it.taken || this.seenStamp[it.index] === stamp) continue;
        this.seenStamp[it.index] = stamp;
        const k = it.mesh;
        this.meshList[k].instanceMatrix.array.set(it.matrix, counts[k] * 16);
        counts[k]++;
      }
    }
    for (let k = 0; k < this.meshList.length; k++) {
      const mesh = this.meshList[k];
      const n = counts[k];
      mesh.count = n;
      mesh.visible = n > 0;
      if (!n) continue;
      const attr = mesh.instanceMatrix;
      if (attr.addUpdateRange) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, n * 16);
      } else attr.updateRange = { offset: 0, count: n * 16 };
      attr.needsUpdate = true;
    }
  }

  /**
   * The taken finds of a save made before Goblin-town (v2), as indices into `items`. A v2 session built its list
   * against the field as loaded, so every candidate whose spot was already dug was skipped, and since a skipped
   * candidate does not draw its rotation the random sequence slipped there; it falls back into step a little later,
   * shifted by some places. So a saved index t points at about candidate t + j of the fixed list for some j ≥ 0 (or at
   * a find the fixed list does not have at all). Per saved index the smallest shift (up to SHIFT_MAX) whose candidate
   * lies next to dug samples is taken (the swing that collected a find dug around it); candidates whose spot is dug out
   * are taken in any case. Exact for a save made in one session from a new game.
   * @param {number[]} saved the v2 save's `taken`
   * @param {(x: number, y: number, z: number, r: number) => boolean} changedNear true when samples within r metres of
   *   the point differ from the generated field (save.js)
   */
  migrateTakenV2(saved, changedNear) {
    const SHIFT_MAX = 40;
    const B = this.items.slice(0, V2_COUNT);
    const dug = B.map((it) => sampleDensity(it.x, it.y, it.z) < 8);
    const out = new Set();
    for (let i = 0; i < B.length; i++) if (dug[i]) out.add(i);
    for (const t of saved) {
      // An index that still points at a dug-out find is that find (a save from a new game's first session matches).
      if (dug[t]) continue;
      for (let k = t; k < B.length && k <= t + SHIFT_MAX; k++) {
        if (dug[k]) continue;
        const it = B[k];
        if (changedNear(it.x, it.y, it.z, 0.45)) {
          out.add(k);
          break;
        }
      }
    }
    return [...out].sort((a, b) => a - b);
  }

  /** Hides the embedded finds taken in a saved game (indices into `items`). */
  hideTaken(indices) {
    for (const i of indices) {
      const it = this.items[i];
      if (it) it.taken = true;
    }
  }

  /**
   * Embedded finds inside the dug sphere, at most `room` of them: returns them (taken; the next view drops them).
   * NOTES-44-pickup-edge: `accept(type)` false (the player's pickup filter) leaves a find where it is, untaken (the
   * shimmer and the hirelings' gleaning still see it); it is pushed to `left` and takes no room.
   */
  collect(x, y, z, r, room, accept = null, left = null) {
    const got = [];
    const r2 = (r + 0.12) * (r + 0.12);
    for (const it of this.items) {
      if (it.taken || got.length >= room) continue;
      const dx = it.x - x;
      const dy = it.y - y;
      const dz = it.z - z;
      if (dx * dx + dy * dy + dz * dz < r2) {
        if (accept && !accept(it.type)) {
          left?.push(it);
          continue;
        }
        it.taken = true;
        got.push(it);
      }
    }
    return got;
  }

  /**
   * NOTES-44-pickup-edge: the nearest untaken, not famous embedded find within `rad` of the segment o + d·[0, len] (the
   * pick's reach before the wall it hits): a find whose soil was dug away round it (left by the pickup filter, or by a
   * full bag) hangs in the air there; a swing at it takes it. Only the chunks the segment passes are searched (a swing
   * calls this once). Returns the item or null.
   */
  inReach(o, d, len, rad = 0.28) {
    const S = CHUNK * CELL;
    let best = null;
    let bestT = Infinity;
    const keys = new Set();
    for (let s = 0; s <= len + 0.3; s += 1) {
      const t = Math.min(s, len);
      for (const e of [-rad, rad]) {
        const cx = Math.floor((o.x + d.x * t + e - ORIGIN.x) / S);
        const cy = Math.floor((o.y + d.y * t + e - ORIGIN.y) / S);
        const cz = Math.floor((o.z + d.z * t + e - ORIGIN.z) / S);
        if (cx < 0 || cy < 0 || cz < 0 || cx >= CX || cy >= CY || cz >= CZ) continue;
        keys.add(cx + CX * (cy + CY * cz));
      }
    }
    const r2 = rad * rad;
    for (const key of keys) {
      const list = this.byChunk[key];
      if (!list) continue;
      for (const it of list) {
        if (it.taken || it.type.famous) continue;
        const px = it.x - o.x;
        const py = it.y - o.y;
        const pz = it.z - o.z;
        const t = px * d.x + py * d.y + pz * d.z;
        if (t < 0 || t > len || t >= bestT) continue;
        const qx = px - d.x * t;
        const qy = py - d.y * t;
        const qz = pz - d.z * t;
        if (qx * qx + qy * qy + qz * qz > r2) continue;
        // Only one hanging in the air (a find still in the soil beside the ray is the dig sphere's, as before).
        if (sampleDensity(it.x, it.y, it.z) > 0) continue;
        best = it;
        bestT = t;
      }
    }
    return best;
  }

  /**
   * Random finds for the soil removed (cubic metres) at a depth: a type plus a spot near the dig point. (NOTES-44: the
   * pickup filter is applied by the caller, after the roll, so the random sequence and the find rate stay the same.)
   */
  randomFinds(removed, depth, x, y, z) {
    const got = [];
    let chance = removed * RANDOM_PER_M3;
    while (chance > 0) {
      if (this.rand() < Math.min(1, chance)) {
        const type = pick(layerAtDepth(depth), this.rand(), false);
        got.push({ type, x: x + (this.rand() - 0.5) * 0.4, y: y + (this.rand() - 0.5) * 0.4, z: z + (this.rand() - 0.5) * 0.4, rot: new THREE.Euler(this.rand() * 6, this.rand() * 6, 0) });
      }
      chance -= 1;
    }
    return got;
  }

  /** A dug-up find flies in an arc to the player's bag; `done` runs on arrival. */
  fly(find, player, done) {
    if (find.type.famous) {
      famousMoment(player, find); // NOTES-27-loose hook: golden glow + camera push-in for the finder (famous-moment.js)
      // A famous find is not sold: it goes into Bag End's mathom room (TERV 0.11/7, 0.13) instead of the bag.
      done = () => {
        player.incoming = Math.max(0, (player.incoming || 0) - 1);
        player.game.bagEnd?.addTrophy(find.type);
        player.say(`${find.type.name}! Zsáklak vitrinjébe kerül.`, 5);
        player.game.saveNow?.();
      };
    }
    const mesh = new THREE.Mesh(this.geo.get(find.type.id), this.mat.get(find.type.id));
    mesh.position.set(find.x, find.y, find.z);
    mesh.rotation.copy(find.rot);
    this.scene.add(mesh);
    this.flying.push({ mesh, from: mesh.position.clone(), player, t: 0, done });
  }

  update(dt) {
    const target = new THREE.Vector3();
    for (const f of this.flying) {
      f.t += dt / FLIGHT;
      const p = f.player;
      // The bag hangs at the hip, a little behind the player.
      target.set(p.pos.x + Math.sin(p.yaw) * 0.25, p.pos.y + 0.55, p.pos.z + Math.cos(p.yaw) * 0.25);
      const k = Math.min(1, f.t);
      const e = k * k * (3 - 2 * k);
      f.mesh.position.lerpVectors(f.from, target, e);
      f.mesh.position.y += Math.sin(k * Math.PI) * 0.6;
      f.mesh.rotation.y += dt * 9;
      f.mesh.scale.setScalar(1 - k * 0.6);
      if (f.t >= 1) {
        this.scene.remove(f.mesh);
        f.done();
      }
    }
    this.flying = this.flying.filter((f) => f.t < 1);
  }
}
