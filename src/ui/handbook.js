/* ==== ui/handbook.js — Bilbo's handbook: a searchable in-game guide to what every part of the game is for
   (TODO-QUEUE item 17, NOTES-31-handbook). Opened from the pause book ("Kézikönyv", ui/screens.js).
   - CONTENT: six chapters (finds; tools and the shop; foes and defence; Shire life; Bag End; controls). Prices,
     layers, values and effects are generated from the game's own tables (FIND_TYPES, config.js, exits.js, enemies/
     armour.js, shire/, bagend/furniture.js, lift.js, ...), so they never go stale; hand-written lines explain what
     the tables do not say.
   - SPOILER-FREE (the user's rule): an entry is described only once this save has found, seen, bought or met what it
     is about; otherwise its row says "???" and neither its name nor its text is put into the DOM or the search index.
     Every unlock is derived from state the game already keeps (and saves): the bags, the sacks, the dug embedded finds,
     Bag End's trophies, tiers and wine, the keep items, the players' tiers, the deepest depth reached, the tutorial's
     done list (its hints: the first goblin, the spiders, the neighbour, the garden), Shire life's reputation, the home
     events. One optional addition: ui/journal.js `seen` (find kinds that have been in a bag, so a sold find stays known).
     The controls and the shop's always-visible rows are always described.
   - UI: Bilbo's notebook on the leather of a book. Chapters on the left, the chapter's entries in the middle, the
     selected entry on the right (a narrow half of a split screen stacks them). It opens in the opener's own viewport.
     Keyboard: a search box (case- and accent-insensitive) that has the focus when a keyboard player opens it, arrows
     to browse. Pad: left / right chapters, up / down entries, B back.
   - COST: nothing while closed (no DOM, no listener, no timer); the state is gathered and the DOM is built when it
     opens; while open, the DOM changes only on input (the game is frozen meanwhile).
   - NOTES-45-final-docs: entries for the features of TODO items 27–36 (the partner marker, the charge and the Eagles,
     wall tapping, Balin's map, the lamp shimmer, Bilbo's party, the dwarf smith, XP and skills, the hired dwarves, the
     action wheel, the pickup filter, the world's edge), a seventh chapter "Hősök és képességek", and the key tables
     brought in step with input.js (wheel 2 / 9 / LB, tap 1 / Ö / LB + RS).
   - NOTES-46-stations: the main-station guide's entry (Hősök › A gödörben), its stations per reached layer.
   - NOTES-47-station-uses: "Mit adnak a fő állomások?" (Hősök › A gödörben): each station's use, reached layers only. ==== */
import { BAG_TIERS, COOP, FINDERS, HUNGER, LADDER_LEN, SHOP, TOOL_TIERS } from '../config.js';
import { CHARGE, EAGLE_MAX, EAGLE_PRICE, ROCKET_MAX, ROCKET_PRICE } from '../exits.js';
import { EDGE, EDGE_LINES } from '../edge.js';
import { FIND_TYPES, PICKUP_CATS } from '../finds.js';
import { SKIP_KEY, WHEEL_KEYS } from '../input.js';
import { CHARACTERS } from '../player.js';
import { DWARVES, GLEAN, HIRE, LANTERN, LIMIT_DEPTH, MAX_LAYER, ORI, STAIR } from '../hirelings/rules.js';
import { STAGES } from '../party/index.js';
import { SMITH, UPGRADES } from '../smith/index.js';
import { WHEEL } from '../wheel/index.js';
import { MAX_RANK, SKILLS, XP_GAIN } from '../xp/config.js';
import { levelStart } from '../xp/index.js';
import { LIFT_STOPS } from '../lift.js';
import { STATIONS } from '../stations.js';
import { EXISTING as STATION_EXISTING, USES as STATION_USES } from '../station-uses/index.js';
import { LAYER_NAMES, LAYER_TOPS } from '../materials.js';
import { ARMOUR_SHOP_MAX, ARMOUR_TIERS } from '../enemies/armour.js';
import { COMBAT } from '../enemies/combat.js';
import { TROLL } from '../trolls/index.js';
import { BALIN } from '../safety/index.js';
import { GARDEN } from '../shire/index.js';
import { isMathom, MATHOM_IDS, REP, TRADE } from '../shire/mathoms.js';
import { BAG_FOOD, MEAL, MEAL_WINDOWS, SNACKS } from '../shire/meals.js';
import { SLOTS } from '../bagend/furniture.js';
import { ROOM } from '../bagend/plan.js';
import { WINE_ID } from '../bagend/effects.js';
import { MEALS } from './art.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const LOCKED = '???';
/** Gems among the finds (by id): what the "Drágakövek" entry gathers. */
const GEM_IDS = ['smaragd', 'rubin', 'kristaly', 'zafir', 'feherko', 'nyersko', 'csiszoltko', 'szrubin', 'szfeherko'];
/** Finds the Bag End kitchen cooks (bagend/effects.js COOKABLE). */
const COOK_IDS = ['krumpli', 'gomba'];

/** Hand-written notes on single finds (what the tables do not say). Shown only with the unlocked entry. */
const FIND_NOTES = {
  fullank: 'Bilbó kése a trollok zsákmányából. Kéken izzik, ha goblin, pók vagy tünde-őr van a közelben, és erősebben üt a csákánynál.',
  gyuru: 'Bilbó a képesség gombjával felhúzza és leveszi: láthatatlan lesz. Szmaug kincstárában a sárkány mégis megérzi a szagát.',
  mithril: 'Thorin ajándéka: a legjobb páncél (a „Páncélok” szakasz írja, mit véd). Az Erebor lezárt fegyvertárában áll.',
  arkenko: 'A Hegy Szíve. A használat gombjával veszed fel; Zsáklak vitrinjébe kerül.',
  dohany: 'A szomszéd hobbit is ezt adja egy mathomért cserébe.',
  almaspite: 'A szomszéd hobbit adja egy mathomért cserébe.',
  paradicsom: 'A földkupac melletti veteményesben terem.',
  tukkacat: 'Az öreg Tuk nyári mulatságainak tűzijátékaiból (nem azonos Gandalf töltetével a boltban).',
};

/** Accent- and case-insensitive form for the search. */
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
const strip = (html) => html.replace(/<[^>]+>/g, ' ');
const gold = (n) => `<b>${Math.round(n).toLocaleString('hu-HU')} arany</b>`;
const pct = (x) => `${(x * 100).toLocaleString('hu-HU', { maximumFractionDigits: 1 })} %`;
const num = (x, d = 2) => x.toLocaleString('hu-HU', { maximumFractionDigits: d });
const p = (t) => `<p>${t}</p>`;
const ul = (rows) => `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>`;
const keyName = (code) => (code === 'KeyY' ? 'Z' : code.replace(/^Key/, ''));
const digit = (code) => code.replace(/^Digit/, '');
const layerLabel = (l) => (l >= 0 ? `${ROMAN[l]}. réteg · ${LAYER_NAMES[l]}` : 'a Megyéből');

/* ------------------------------------------------------------------ the state the unlocks read */

/** Everything the unlocks need, read once when the handbook opens (all existing, saved state). */
export function gatherState(game) {
  const g = game;
  const slots = (g.slotData?.() || g.save?.slots || []).filter(Boolean);
  const found = new Set(g.journal?.seen || []);
  for (const s of slots) for (const id of s.bag || []) found.add(id);
  for (const q of g.players) for (const f of q.bag || []) found.add(f.id);
  for (const sk of g.sacks?.list || []) for (const f of sk.items || []) found.add(f.id);
  for (const it of g.finds?.items || []) if (it.taken) found.add(it.type.id);
  for (const id of g.bagEnd?.trophies || []) found.add(id);
  if (g.bagEnd?.wine?.length) found.add(WINE_ID);
  for (const b of g.shire?.beds || []) if (b.crop) found.add(b.crop);
  const sting = !!g.enemies?.sting?.owned || slots.some((s) => s.sting) || g.players.some((q) => q.sting);
  if (sting) found.add('fullank');
  if (g.gollum?.ring?.found) found.add('gyuru');
  const armour = Math.max(0, ...slots.map((s) => s.armour || 0), ...g.players.map((q) => q.armour || 0));
  if (armour >= 4 || g.decor?.ereborFx?.mithrilTaken || g.save?.erebor?.mithril) found.add('mithril');
  if (g.hoard?.arkTaken) found.add('arkenko');
  const deepest = g.journal?.deepest?.() || 0;
  const reached = (l) => l === 0 || deepest >= LAYER_TOPS[l];
  const done = g.tutorial?.done || new Set();
  const doneLike = (prefix) => [...done].some((d) => d === prefix || d.startsWith(`${prefix}-`));
  const M = g.shire?.mathoms;
  const home = g.homeEvents?.state?.() || g.save?.home || {};
  // NOTES-45-final-docs: the state of the features of items 27–36 (all existing, saved state; nothing is created here:
  // `game.finders` is read only when it exists, else the journal's saved copy of its purchases).
  const fs = g.finders ? { maps: [...g.finders.maps], lamp: g.finders.lamp } : g.journal?.findersSave || {};
  const party = g.shire?.party;
  const smith = g.shire?.smith;
  const present = g.players.filter((q) => !q.choosing);
  return {
    found,
    deepest,
    reached,
    tool: Math.max(0, ...slots.map((s) => s.toolTier || 0)),
    bag: Math.max(0, ...slots.map((s) => s.bagTier || 0)),
    armour,
    sting,
    eagles: slots.some((s) => s.eagles),
    goblin: done.has('goblin'),
    spider: done.has('pok') || reached(5),
    troll: reached(2) || !!g.enemies?.trolls?.owned,
    trollVoice: !!g.enemies?.trolls?.owned,
    smaug: reached(8) || !!g.journal?.marks?.has('szmaug') || !!g.finale?.slain,
    neighbour: doneLike('shire-szomszed') || (M?.rep || 0) > 0 || (M?.trades?.n || 0) > 0,
    garden: doneLike('shire-kert') || (g.shire?.bedsOpen?.() || 0) > 0,
    rep: M?.rep || 0,
    repLevel: M ? M.level() : 0,
    buyer: !!M?.buyer,
    birthday: !!home.b,
    tiers: g.bagEnd?.tiers || {},
    comfort: g.bagEnd?.comfort ?? 0,
    lift: g.lift?.built || new Set(),
    coop: g.players.length > 1,
    // NOTES-45-final-docs
    partner: g.players.length > 1 || slots.length > 1,
    pit: deepest >= 3 || slots.some((s) => (s.maxDepth || 0) >= 3),
    maps: new Set(Array.isArray(fs.maps) ? fs.maps : []),
    lamp: fs.lamp | 0,
    party: party ? { stages: party.stages | 0, done: !!party.done } : { stages: 0, done: false },
    partyMet: doneLike('shire-party') || (party?.stages | 0) > 0,
    // The smith's levels are the company's, shared by every player and character (smith/index.js `shared`).
    smithLevels: Array.isArray(smith?.shared) ? smith.shared.slice() : [],
    hired: [...(g.hirelings?.hired?.keys?.() || [])],
    heroes: present.map((q) => ({ name: q.ch?.name || '', id: q.ch?.id, xp: Math.round(q.xp?.xp || 0), level: q.xp?.level || 1, free: q.xp?.free || 0 })),
    // NOTES-46-stations: the main stations visited (read only: `game.stations` if it exists, else the journal's copy).
    stations: new Set(g.stations ? [...g.stations.visited] : g.journal?.stationsSave || []),
  };
}

/* ------------------------------------------------------------------ the chapters */

export const CHAPTERS = [
  { id: 'leletek', title: 'Leletek', short: 'Leletek' },
  { id: 'bolt', title: 'Szerszámok és bolt', short: 'Bolt' },
  { id: 'ellenseg', title: 'Ellenségek és védekezés', short: 'Ellenség' },
  { id: 'megye', title: 'A Megye élete', short: 'Megye' },
  { id: 'zsaklak', title: 'Zsáklak', short: 'Zsáklak' },
  { id: 'hosok', title: 'Hősök és képességek', short: 'Hősök' }, // NOTES-45-final-docs
  { id: 'iranyitas', title: 'Irányítás', short: 'Irányítás' },
];

/** What a locked entry says (no name, no hint of what it is). */
const LOCK_TEXT = [
  'Ezt a leletet még nem találtátok meg. Ásd tovább a földet: amint a zsákodba kerül, Bilbó beírja ide.',
  'Erről még nem tudtok. Ha a pultnál felbukkan vagy megveszitek, Bilbó beírja ide.',
  'Ezzel még nem találkoztatok. Ha egyszer szembejön, Bilbó beírja ide, hogyan védekezz.',
  'Ezt még nem élték meg a Megyében. Ha megtörténik, Bilbó beírja ide.',
  'Ez a darab még nincs meg Zsáklakban. Ha megveszitek, Bilbó beírja ide, mire jó.',
  'Ezt még nem próbáltátok ki. Ha egyszer sorra kerül, Bilbó beírja ide.',
  '',
];

/**
 * Builds every entry for the state `S`. An entry: { ch, group, open, title, meta, body }. Locked entries get no title,
 * meta or body (nothing of them reaches the DOM or the search).
 */
export function buildEntries(game, S) {
  const out = [];
  const add = (ch, group, open, make) => {
    if (!open) {
      out.push({ ch, group, open: false, title: LOCKED, meta: '', body: '' });
      return;
    }
    const e = make();
    out.push({ ch, group, open: true, title: e.title, meta: e.meta || '', body: e.body });
  };
  findEntries(add, S);
  shopEntries(add, game, S);
  foeEntries(add, game, S);
  shireEntries(add, S);
  bagEndEntries(add, S);
  heroEntries(add, S);
  controlEntries(add);
  out.forEach((e, i) => {
    e.i = i;
    e.key = e.open ? fold(`${e.title} ${e.meta} ${strip(e.body)}`) : '';
  });
  return out;
}

/* ---------------- 1. finds ---------------- */

function findLines(f) {
  const lines = [];
  if (f.famous) lines.push('<b>Híres lelet.</b> Nem eladó: Zsáklak mathom-szobájának vitrinjébe kerül, a Gyűjteményben is látod.');
  else if (f.keep) lines.push('<b>Nem eladó:</b> a megtalálóé marad.');
  else if (f.value > 0) lines.push(`Alapára a Zöld Sárkány pultjánál: ${gold(f.value)}.`);
  if (f.layer >= 0 && f.weight > 0) {
    const same = FIND_TYPES.filter((x) => x.layer === f.layer && x.weight > 0);
    const share = f.weight / same.reduce((s, x) => s + x.weight, 0);
    const how = share >= 0.25 ? 'gyakori' : share >= 0.12 ? 'nem ritka' : share >= 0.06 ? 'ritka' : 'nagyon ritka';
    lines.push(f.embedded ? `A falban csillog, messziről látni (${how} a rétegében).` : `Ásás közben bukkan elő a földből (${how} a rétegében).`);
  } else if (f.embedded && (f.famous || f.keep)) lines.push('Egyetlen darab van belőle, egy különleges helyen.');
  if (isMathom(f)) lines.push('<b>Mathom:</b> a szomszéd hobbit elcseréli, és Bilbó születésnapján ajándékba adhatod. Mindkettő hírnevet hoz.');
  // NOTES-35-lift-doors-bag: every bag food can be eaten by hand from the bag screen.
  if (BAG_FOOD[f.id]) lines.push(`<b>Étel:</b> a zsákodból bármikor megeheted (szünet → Zsák, válaszd ki, „Megeszem”: +${BAG_FOOD[f.id]} a tányérra)${SNACKS[f.id] ? '; étkezéskor a hobbit magától is elővesz egyet' : ''}.`);
  if (COOK_IDS.includes(f.id)) lines.push('Zsáklak konyhájában (tűzhely) megfőzheted: jóllakat.');
  if (f.id === WINE_ID) lines.push('Zsáklak pincéjében a borospolcon érlelve egyre többet ér.');
  if (GEM_IDS.includes(f.id)) lines.push('<b>Drágakő:</b> a rétege legértékesebb leletei közé tartozik.');
  if (f.hoard) lines.push('<b>Szmaug kincse.</b> Ha túl sok van belőle a zsákodban, rád tör a sárkánykór: nem válsz meg az aranytól, és lassabb leszel. A társad szava (használat gomb mellette) vagy egy étkezés a felszínen kigyógyít.');
  if (FIND_NOTES[f.id]) lines.push(FIND_NOTES[f.id]);
  return lines.map(p).join('');
}

function listFound(ids, S) {
  return ul(ids.map((id) => FIND_TYPES.find((f) => f.id === id)).filter(Boolean).map((f) => (S.found.has(f.id) ? `${f.name}${f.value ? ` · ${f.value} arany` : ''}` : LOCKED)));
}

function findEntries(add, S) {
  const C = 0;
  const has = (ids) => ids.some((id) => S.found.has(id));
  add(C, 'Általában', true, () => ({
    title: 'A leletekről',
    meta: 'eladás, zsák, árak',
    body: p('Amit kiásol, magától a zsákodba repül, amíg van benne hely. A zsák tartalmát a felszínen a <b>Zöld Sárkány</b> pultjánál adod el (a pult használat gombja), az arany a közös erszénybe kerül.')
      + p(`Az ár a lelet alapára, ezt módosítja: ketten játszva ×${num(COOP.sell)} (a bolt viszont ×${num(COOP.price)}), a hírnév szintenként +${pct(REP.sell)}, Zsáklak vitrinjei, a karakterek saját előnyei, és az alkalmi új vevők.`)
      + p('Ha megtelik a zsák, a lelet ott marad: a falba zárt lelet a kiásott járatban lóg a levegőben, és ha később van hely, egy csákánycsapással beveszed. Nagyobb zsákot a pultnál veszel; a törpe kovács foltozással meg is toldja.')
      + (S.reached(6) ? p('Tóváros alatt Bárd is megveszi a leleteidet a standjánál.') : ''),
  }));
  // NOTES-44-pickup-edge: the pickup filter (always on the bag screen). The always-kept pieces are named only once found.
  const always = ['fullank', 'gyuru', 'mithril', 'arkenko'].filter((id) => S.found.has(id)).map((id) => FIND_TYPES.find((f) => f.id === id)?.name).filter(Boolean);
  add(C, 'Általában', true, () => ({
    title: 'Mit veszel fel?',
    meta: 'Szünet › Zsák › Felvétel',
    body: p('Ásás közben a kiásott leletek maguktól a zsákodba repülnek. A Szünet menü <b>Zsák</b> lapján, alul, a <b>Felvétel</b> sávban mindenki a saját sorában kapcsolhatja ki, mit nem kér:')
      + ul(PICKUP_CATS.map((c) => `<b>${c.label}</b> (${c.note})`))
      + p('Billentyűzeten az <b>1–4</b> gomb kapcsolja (a billentyűzet jobb felén játszó társnak a <b>7, 8, 9, Ö</b>), kontrolleren az <b>Y</b> lépteti a jelet, az <b>X</b> kapcsol; egérrel kattints rá. Minden játékos csak a saját sorát állítja.')
      + p(`A híres leleteket${always.length ? ` és ezeket: ${always.join(', ')}` : ' és a különleges, egyetlen darabos kincseket'} mindig felveszed.`)
      + p('Amit otthagysz, azt a játék röviden jelzi („Krumpli: otthagytad (szűrő)”). A falba zárt lelet a helyén marad, és a kiásott járatban lóg a levegőben (a lámpa csillámja és a felbérelt törpék is látják); ha később mégis kell, kapcsold vissza, és üss rá a csákánnyal. Az ásás közben előbukkanó apróság, amit nem kérsz, a földben marad.'),
  }));
  add(C, 'Általában', has(MATHOM_IDS), () => ({
    title: 'Mathomok',
    meta: 'csere, ajándék, hírnév',
    body: p('Mathom minden, aminek egy hobbit nem veszi hasznát, de kidobni sem dobná ki. A szomszéd hobbit elcseréli a legolcsóbb mathomodat almás pitére, Hosszúvölgyi levélre vagy egy másik mathomra'
      + ` (naponta ${TRADE.perDay} csere, mindegyik +${TRADE.rep} hírnév). Bilbó születésnapján ajándékba adhatod őket: mindegyik +${REP.gift} hírnév.`) + listFound(MATHOM_IDS, S),
  }));
  const foods = [...COOK_IDS, ...Object.keys(BAG_FOOD).filter((id) => !COOK_IDS.includes(id))];
  add(C, 'Általában', has(foods), () => ({
    title: 'Étel a zsákban',
    meta: 'harapnivaló, főzés',
    body: p('Néhány lelet ehető. <b>A zsákodból bármikor megeheted:</b> szünet (Esc / Start) → Zsák, fel / le kiválasztod az ételt, és A / Enter / Szóköz vagy a „Megeszem” gomb. A tányér telik, és ha épp egy étkezés ideje van, az időben evésnek számít (A Megye élete: a hét étkezés).')
      + p('Ha egy étkezés feléig nem ettél, a hobbit magától is elővesz egy harapnivalót. A nyers krumpli keveset ér: Zsáklak konyhája a krumplit és a gombát megfőzi, főzve sokkal laktatóbb.')
      + p('Gyorsabban: az <b>Akciókerék</b> Evés pontja (2 / 9 / LB nyomva tartva) a zsákod legjobban illő ételét eszi meg: a legtöbbet adót, ami még elfér a tányérodon.') + listFound(foods, S),
  }));
  const famous = FIND_TYPES.filter((f) => f.famous).map((f) => f.id);
  add(C, 'Általában', has(famous), () => ({
    title: 'Híres leletek',
    meta: 'a vitrinek trófeái',
    body: p(`Minden réteg mélyén egy-egy híres tárgy rejlik a könyvből. Nem adhatók el: Zsáklak mathom-szobájának vitrinjeibe kerülnek (Gyűjtemény). Eddig ${famous.filter((id) => S.found.has(id)).length} / ${famous.length}.`) + listFound(famous, S),
  }));
  add(C, 'Általában', has(GEM_IDS), () => ({
    title: 'Drágakövek',
    meta: 'a legértékesebb leletek',
    body: p('A drágakövek a rétegük legritkább és legdrágább leletei; a falban erősen csillognak. Érdemes nekik helyet hagyni a zsákban.') + listFound(GEM_IDS, S),
  }));
  // One entry per find kind, by layer and value (the Shire's own kinds last).
  const layers = [...new Set(FIND_TYPES.map((f) => f.layer))].sort((a, b) => (a < 0) - (b < 0) || a - b);
  for (const l of layers) {
    const kinds = FIND_TYPES.filter((f) => f.layer === l).sort((a, b) => (a.famous || a.keep ? 1 : 0) - (b.famous || b.keep ? 1 : 0) || a.value - b.value);
    const group = l >= 0 ? `${ROMAN[l]}. ${LAYER_NAMES[l]}` : 'A Megye termései';
    for (const f of kinds) add(C, group, S.found.has(f.id), () => ({ title: f.name, meta: layerLabel(l), body: findLines(f) }));
  }
}

/* ---------------- 2. tools and the shop ---------------- */

function shopEntries(add, game, S) {
  const C = 1;
  const coop = S.coop ? ` Ketten játszva minden ár ×${num(COOP.price)}.` : '';
  add(C, 'A pult', true, () => ({
    title: 'A Zöld Sárkány pultja',
    meta: 'a felszínen, a gödör mellett',
    body: p('A pultnál adod el a zsák tartalmát, és itt veszel szerszámot, zsákot, létrát, elemózsiát, páncélt, Gandalf portékáit, Balin térképét és a lámpa csillámját. Itt fogadhatsz fel törpéket is Thorin társaságából. Mindig a következő fokozatot kínálja; ha a sorok nem férnek el, a lista görgetve követi a kijelölést.')
      + p(`A hírnév szintenként ${pct(REP.price)}-kal olcsóbbá teszi a boltot.${coop}`)
      + p('A pulttól keletre, a dűlőút túloldalán a törpe kovács fejleszti a felszerelésedet (lásd: „A törpe kovács”).'),
  }));
  TOOL_TIERS.forEach((t, k) => add(C, 'Ásók és csákányok', k <= S.tool + 1, () => ({
    title: t.name,
    meta: k ? `${k + 1}. fokozat · ${t.price} arany` : 'az induló szerszám',
    body: p(`Egy csapás ${num(t.radius)} m sugarú gödröt váj, ereje ${t.power} (a kemény kőzet lassabban enged), ${num(1 / t.cooldown, 1)} csapás másodpercenként.`)
      + (k ? p(`Ára: ${gold(t.price)} a pultnál.`) : '') + (k === S.tool ? p('<i>Ez van most a kezedben.</i>') : ''),
  })));
  BAG_TIERS.forEach((t, k) => add(C, 'Zsákok', k <= S.bag + 1, () => ({
    title: t.name,
    meta: k ? `${k + 1}. fokozat · ${t.price} arany` : 'az induló zsák',
    body: p(`${t.cap} lelet fér bele (egyes karaktereknek több).`) + (k ? p(`Ára: ${gold(t.price)} a pultnál.`) : ''),
  })));
  add(C, 'Kellékek', true, () => ({
    title: 'Létrák',
    meta: `${SHOP.ladderPack} darab · ${SHOP.ladderPrice} arany`,
    body: p(`Egy létra ${LADDER_LEN} m hosszú: a falhoz támasztod (létra gomb), és felmászol rajta. Mászni fárasztóbb, mint járni: ${num(HUNGER.perClimbSecond, 1)} pont fogy a tányérról másodpercenként.`)
      + p('Lefelé a lefelé mászás gombjával mászol (Shift / C, a 2. játékos jobb Ctrl / ., kontrolleren LB nyomva tartva). Egy létra tetején állva ugyanezzel a gombbal lépsz rá a létrára fentről, és indulsz lefelé; ilyenkor az előre gomb a létra tetején megállít, nem lép le a mélybe. Ha zuhanás közben létra mellett esel el, elkapod.')
      + p(`Induláskor ${SHOP.startLadders} létrád van; a pultnál ${SHOP.ladderPack} darab ${gold(SHOP.ladderPrice)}.`),
  }));
  add(C, 'Kellékek', true, () => ({
    title: 'Elemózsia',
    meta: `${SHOP.foodPrice} arany`,
    body: p('Megveszed, és rögtön meg is eszed: a tányér megtelik. Ha üres a tányér, a hobbit elájul, és otthon tér magához.')
      + p(`Ásás, mászás és ugrás fogyasztja a tányért. Ára ${gold(SHOP.foodPrice)}; időben enni a Megye élete szerint is jó.`),
  }));
  add(C, 'Gandalf portékái', true, () => ({
    title: 'Gandalf tűzijáték-töltete',
    meta: `${ROCKET_PRICE} arany · legfeljebb ${ROCKET_MAX}`,
    body: p('Robbanótöltet Gandalf tűzijátékaiból. Guggolj le, és nyomd meg a kijutás gombját (C + R; a 2. játékosnak . + É; kontrolleren LB + D-pad fel): a töltet az előtted lévő falra vagy a lábad elé kerül, és meggyullad a kanóca.')
      + p(`${num(CHARGE.fuse, 0)} másodperc múlva robban: kb. ${num(CHARGE.radius, 1)} m sugarú gömböt vág ki a földből és a kőből is. Aki ${num(CHARGE.harm, 1)} m-nél közelebb áll, azt ledönti és megsebzi (a tányérból fogy; Kihívás módban halálos is lehet). A dörrenést a goblinok és a trollok is meghallják, a kincstárban Szmaug is.`)
      + p(`Zsáklakban, ${num(2.5, 1)} m-nél sekélyebben, a hordólift megállóinál és a védett helyeken nem robbanthatsz. Gandalf ajándékba is hoz belőle. Egyszerre legfeljebb ${ROCKET_MAX} lehet nálad; darabja ${gold(ROCKET_PRICE)}.`)
      + p('Az <b>Akciókerékből</b> is meggyújthatod (2 / 9 / LB nyomva tartva, „Töltet”); a kanóc égése ott körként látszik.'),
  }));
  add(C, 'Gandalf portékái', true, () => ({
    title: 'A Sasok',
    meta: `${EAGLE_PRICE} arany hívásonként · legfeljebb ${EAGLE_MAX}`,
    body: p('Gandalf molylepkéjével hívod őket (kijutás gomb: R; a 2. játékosnak É; kontrolleren D-pad fel): a Sasok bárhonnan azonnal kiemelnek a gödörből, és letesznek a fogadó melletti gyepen. A közeli társadat is kiemelik.')
      + p(`Csak ${num(2.5, 1)} m-nél mélyebbről hívhatók (fentebb a létra is elég). Minden hívás egyszer használható; darabja ${gold(EAGLE_PRICE)}, egyszerre legfeljebb ${EAGLE_MAX} lehet nálad. A pult kezdettől árulja.`)
      + p('Az <b>Akciókerékből</b> is hívhatod őket (2 / 9 / LB nyomva tartva, „Sasok”).'),
  }));
  add(C, 'Gandalf portékái', true, () => ({
    title: 'Gandalf hangja',
    meta: `${TROLL.price} arany · az egész társaságnak`,
    body: p('Ha a trollok mocorognak vagy felébredtek a barlangjukban, a használat gombjával Gandalf hangján „Hajnal!”-t kiáltasz: mind kővé dermednek, és egy ideig úgy is maradnak.'),
  }));
  add(C, 'Gandalf portékái', true, () => ({
    title: 'Balin becslése',
    meta: `${BALIN.price} arany · közös`,
    body: p('Egy jel a tányéron megmutatja, mennyi étel kell a hazaúthoz a mostani mélységből (létrán, vagy a közeli megépült liftmegállóig és onnan liftezve).'),
  }));
  /* NOTES-38-finders: Balin's layer map and the lamp shimmer (both offered by the counter from the start). */
  add(C, 'Leletkeresés', true, () => ({
    title: 'Balin térképe',
    meta: `rétegenként ${FINDERS.maps[0]}–${FINDERS.maps[FINDERS.maps.length - 1]} arany · közös`,
    body: p('A pultnál rétegenként megveheted Balin térképét: a sorban balra / jobbra választod a réteget. Csak olyan réteget kínál, ahová már leértetek, és amit még nem vettetek meg.')
      + p('Thrór térképén (B; a 2. játékosnak Ú; kontrolleren a bal kar benyomása) a réteg sávjában megjelennek Balin kis alaprajzai: felülnézetből, északkal felfelé, mélységszeletenként a réteg összes ürege és terme, a mélységükkel.')
      + ul(FINDERS.maps.map((pr, l) => (S.reached(l) ? `${ROMAN[l]}. réteg · ${LAYER_NAMES[l]}: ${pr} arany${S.maps.has(l) ? ' · megvettétek' : ''}` : LOCKED))),
  }));
  add(C, 'Leletkeresés', true, () => ({
    title: 'Lámpa csillámja',
    meta: `${FINDERS.lamp.length} fokozat · közös`,
    body: p('A lámpád fényében a falba zárt leletek halványan átderengenek a földön: kis csillag a lelet színében, a távolsággal halványul. Csak a hatótávon belüli, még ki nem ásott leleteket mutatja, és csak a föld alatt. Ketten játszva mindenki a saját lámpája körül látja.')
      + ul(FINDERS.lamp.map((t, k) => (k <= S.lamp ? `${ROMAN[k]}. fokozat: ${t.range} m-ről · ${t.price} arany${k < S.lamp ? ' · megvan' : ' <i>(következő)</i>'}` : LOCKED))),
  }));
  /* NOTES-40-smith: the travelling dwarf smith (his forge stands by the counter from the start). */
  const FX_NAMES = { power: 'ásóerő', swing: 'ütésidő', lampReach: 'hatótáv', lampBoost: 'fényerő', bag: 'zsák', climb: 'mászás', hunger: 'éhezés' };
  add(C, 'A törpe kovács', true, () => {
    const lv = UPGRADES.map((u, k) => `${u.name} ${S.smithLevels[k] | 0}`).join(', ');
    return {
      title: 'A törpe kovács',
      meta: 'a pulttól keletre · végtelen fejlesztés',
      body: p('A Zöld Sárkány pultjától keletre, a dűlőút túloldalán egy vándorló törpe kovács nyitott műhelyt: sok törpe kovácsmunkából élt, amióta elhagyták a Hegyet. Az üllőnél a használat gombbal nyílik a fejlesztések listája.')
        + p(`Öt fejlesztés van, mindegyik <b>végtelen sok szintre</b> fejleszthető. Minden szint ${pct(SMITH.growth - 1)}-kal drágább az előzőnél, és egyre kevesebbet ad hozzá: a hatás közelít egy felső határhoz, de sosem éri el.`)
        + ul(UPGRADES.map((u) => `<b>${u.name}</b> (${u.base} aranytól): ${u.desc} Legfeljebb ${u.fx.map((f) => `${FX_NAMES[f.key] || ''} ${f.cap > 0 ? '+' : '−'}${pct(Math.abs(f.cap))}`).join(', ')}.`))
        + p(`A fejlesztés közös: egyszer kell megvenni, és mindkettőtökre (minden hősre) érvényes; a közös erszényből fizettek. Ketten játszva az árak ×${num(COOP.price)}, a hírnév nem csökkenti őket. Ugyanazt a fejlesztést egymás után többször is megrendelheted: a kijelölés rajta marad.`)
        + (S.smithLevels.some((v) => v > 0) ? p(`<b>Most:</b> ${lv}`) : ''),
    };
  });
  /* NOTES-42-hirelings: seven of Thorin's company hired at the counter (the row is offered from the start). */
  const wage = (job) => DWARVES.filter((d) => d.job === job);
  const who = (job) => wage(job).map((d) => d.name).join(', ').replace(/, ([^,]*)$/, ' és $1');
  const hiredLine = (job) => {
    const h = wage(job).filter((d) => S.hired.includes(d.id)).map((d) => d.name);
    return h.length ? p(`<i>Most dolgozik: ${h.join(', ')}.</i>`) : '';
  };
  add(C, 'Törpék munkára', true, () => ({
    title: 'Törpék Thorin társaságából',
    meta: `${Math.min(...DWARVES.map((d) => d.wage))}–${Math.max(...DWARVES.map((d) => d.wage))} arany/nap · a pultnál`,
    body: p(`Thorin társai közül heten — ${DWARVES.map((d) => d.name).join(', ').replace(/, ([^,]*)$/, ' és $1')} — felfogadhatók a pultnál (a „Törpék Thorin társaságából” sor nyitja a listát).`)
      + p(`A napi bért felfogadáskor, aztán minden reggel előre fizeted a közös erszényből; a hét étkezés idején esznek (fejenként ${HIRE.meal} arany, ha Zsáklak kamrája tele van, ingyen). Ha nincs elég arany, nem dolgoznak (adósság nincs), és szólnak; amint az erszény fizetni tud, folytatják.`)
      + p(`A háttérben dolgoznak, étkezésenként egy műszakot, éjjel pihennek, és reggelente jelentést kapsz: mit végeztek, mibe került (az utolsó jelentés a listában is megmarad). Csak a felső ${MAX_LAYER + 1} rétegben dolgoznak (0–${LIMIT_DEPTH} m), és csak ott, ahová már leértetek.`)
      + p(`Ketten játszva a bérek ×${num(COOP.price)}. Ugyanebben a listában el is bocsáthatod őket.`)
      + (S.hired.length ? p(`<i>Most dolgozik: ${S.hired.map((id) => DWARVES.find((d) => d.id === id)?.name).filter(Boolean).join(', ')}.</i>`) : ''),
  }));
  add(C, 'Törpék munkára', true, () => ({
    title: `${who('lamp')}: lámpások`,
    meta: `${wage('lamp')[0].wage} arany/nap fejenként`,
    body: p(`Lámpásokat akasztanak a kiásott járataitok falára, a felszínhez legközelebbiektől lefelé: műszakonként fejenként ${LANTERN.perShift}-t, legalább ${num(LANTERN.spacing, 1)} m-re egymástól, összesen legfeljebb ${LANTERN.max}-et. A lámpás fénye bevilágítja a járatot.`)
      + p('Ha kiásod mögüle a falat, leveszik; a következő műszakban újat akasztanak. A létrák, a hordólift és a játékosok mellé nem tesznek.') + hiredLine('lamp'),
  }));
  add(C, 'Törpék munkára', true, () => ({
    title: `${who('map')}: térkép`,
    meta: `${wage('map')[0].wage} arany/nap`,
    body: p(`Thrór térképére rajzolja egy réteg feltárt részét: amerre a járataitok és a feltört üregek vezetnek. Rétegenként ${ORI.days.join(' / ')} nap alatt végez (I. / II. / III. réteg), a legsekélyebb még kész nélküli rétegen kezdi.`)
      + p('A térképen vörös tintával, mélységszeletenként látszik a munkája (a félkész rész százalékkal). Olcsóbb és lassabb, mint Balin térképe, és csak azt mutatja, ahol már jártatok.') + hiredLine('map'),
  }));
  add(C, 'Törpék munkára', true, () => ({
    title: `${who('glean')}: apró leletek`,
    meta: `${wage('glean')[0].wage} arany/nap fejenként`,
    body: p(`Összeszedik a feltárt rétegekben a falban maradt apró leleteket (legfeljebb ${GLEAN.small} arany értékűeket; híres és különleges leletet soha), és eladják: az ár ${pct(GLEAN.share)}-a kerül az erszénybe. Mindig ott keresnek, ahol a legtöbb maradt.`)
      + p('Amit felszednek, az a ti számotokra is eltűnik a falból: ahogy a réteg kiürül, egyre kevesebbet hoznak, és egy idő után a bérüket sem keresik meg. A játékos közelében lévő leletet meghagyják neki.') + hiredLine('glean'),
  }));
  add(C, 'Törpék munkára', true, () => ({
    title: `${who('stair')}: csigalépcső`,
    meta: `${wage('stair')[0].wage} arany/nap`,
    body: p(`Csigalépcsőt vág a gödör mellé a gyeptől lefelé, deszkafokokkal: műszakonként ${num(Math.floor(STAIR.perShift / STAIR.step) * STAIR.step, 2)} m lépcsőt, a feltárt mélységig (legfeljebb ${LIMIT_DEPTH} m-ig). A bejáratát fakeret jelzi a gyepen.`)
      + p(`A lépcsőn ×${num(STAIR.walk)} sebességgel jártok, gyorsabban, mint létrán, mászás, éhezés és esés nélkül. A létráitokhoz, a hordólifthez és a lezárt helyekhez nem nyúl; ha valaki a lépcső helyén áll, megvárja, ha egy létra áll az útjában, ott megáll.`) + hiredLine('stair'),
  }));
  add(C, 'A hordólift', true, () => ({
    title: 'Hordólift',
    meta: 'a darunál, a felszínen',
    body: p('A daru melletti hordóliftnek megállókat építhetsz azokban a rétegekben, ahol már jártatok; utána ingyen utazol oda és vissza. Gyorsabb csigasort is vehetsz hozzá.')
      + ul(LIFT_STOPS.map((s) => ((S.deepest || 0) >= s.depth - 1 || S.lift.has(s.id) ? `${s.name}${s.price ? ` · ${s.price} arany` : ''}${S.lift.has(s.id) ? ' · megépült' : ''}` : LOCKED))),
  }));
}

/* ---------------- 3. foes and defence ---------------- */

function foeEntries(add, game, S) {
  const C = 2;
  add(C, 'Goblinok', S.goblin, () => ({
    title: 'Kődobás',
    meta: 'G vagy középső egérgomb · kontrolleren B',
    body: p(`Egy zsebnyi kő (${COMBAT.stonesMax}) mindig nálad van: dobd meg vele a goblint (G vagy a középső egérgomb; a második billentyűzetes játékosnak Ő; kontrolleren B). Minden csákánycsapás, ami a földbe mar, visszaad egy követ.`)
      + p('A találat hátralöki a goblint, elejti, amit lopott, és elfut. <b>Bilbó</b> erősebben és messzebbre dob: a könyv kődobáló hobbitja.'),
  }));
  add(C, 'Goblinok', S.goblin, () => ({
    title: 'Ha elkap egy goblin',
    meta: 'lerázás',
    body: p('A goblin elkap, és ellop egy leletet a zsákodból. <b>Rázd le:</b> nyomd többször gyorsan az ásás gombot. Ha a társadat kapják el, üsd meg a goblint a csákánnyal vagy dobd meg: elengedi.')
      + p('Az elejtett leletet felveheted, ha hozzáérsz. Az ütés (csákány) és a kődobás senkit nem öl meg: elűzi őket.'),
  }));
  add(C, 'Fegyverek', S.sting, () => ({
    title: 'Fullánk',
    meta: 'a trollok zsákmányából',
    body: p(`Aki megtalálja, megtartja. A csákány helyett ezzel szúrsz: ${num(COMBAT.power.sting / COMBAT.power.pick, 1)}-szer erősebb ütés, kicsit messzebbre is elér. Kéken izzik, ha ellenség van a közelben.`),
  }));
  ARMOUR_TIERS.forEach((t, k) => {
    if (!k) return;
    const open = k <= ARMOUR_SHOP_MAX ? k <= S.armour + 1 : S.found.has('mithril') || S.armour >= k;
    add(C, 'Páncélok', open, () => ({
      title: t.name,
      meta: t.locked ? 'nem eladó · az Ereborban' : `${k}. fokozat · ${t.price} arany`,
      body: ul([
        t.fall ? `+${num(t.fall, 1)} m-rel nagyobb esést élsz túl` : 'az esés ellen nem véd',
        t.hurt < 1 ? `az esési sérülés ×${num(t.hurt)}` : '',
        t.steal < 1 ? `a goblinok és trollok csak ${pct(t.steal)} eséllyel lopnak a zsákodból` : '',
        t.knock < 1 ? `fele akkora hátralökés, ha elkapnak (×${num(t.knock)})` : '',
        t.rockProof ? 'a hulló kövek nem döntenek le' : '',
      ].filter(Boolean)) + p('A páncél nem lassít.') + (t.locked ? '' : p(`Ára: ${gold(t.price)} a pultnál.`)),
    }));
  });
  add(C, 'A mélység lakói', S.troll, () => ({
    title: 'Trollok és a hajnal',
    meta: `${LAYER_NAMES[2]}`,
    body: p('A barlangban kőtrollok állnak. Ha erős fény nélkül ásol a közelükben, mocorogni kezdenek: hagyd abba, vagy hozz fényt, és megnyugszanak. Ha tovább ásol, a legközelebbi felébred, utánad indul, elkap, és elvisz egy leletet.')
      + p(`Erős fény (törpe bányászlámpa, a társad magasra tartott lámpája) visszadermeszti őket; a hajnal kővé változtatja mindet. Bilbó halkabban ás.${S.trollVoice ? ' Gandalf hangja a tiétek: „Hajnal!” (használat gomb).' : ' A pultnál „Gandalf hangja” is kapható ellenük.'}`),
  }));
  add(C, 'A mélység lakói', S.spider, () => ({
    title: 'Pókok',
    meta: `${LAYER_NAMES[5]}`,
    body: p('Bakacsinerdő gyökerei között pókok vadásznak: hálóba csavarnak. Üsd vagy dobd meg őket, és elmenekülnek; a társad kiszabadíthat. Bilbó csúfolódó dalával magához csalja őket (csúfolódás gomb), hogy a többiek elvegyenek, amit akarnak.'),
  }));
  add(C, 'A mélység lakói', S.smaug, () => ({
    title: 'Szmaug',
    meta: `${LAYER_NAMES[8]}`,
    body: p('A sárkány a kincsén alszik. Az ásás (főleg az aranyban), a futás és a nagy esés zajt csap: ha a zajmérő megtelik, Szmaug felriad, és tüzet fúj a leghangosabbra. Normál módban nem halsz meg, de hátravet, és egy lelet elég a zsákodban.')
      + p('Lopakodj (a lefelé mászás gombját nyomva tartva), Bilbó halkabban jár. Szmaug ellen harcolni nem lehet.'),
  }));
}

/* ---------------- 4. Shire life ---------------- */

function shireEntries(add, S) {
  const C = 3;
  const hh = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  add(C, 'Az étkezések', true, () => ({
    title: 'A hét étkezés',
    meta: 'jóllakott vagy morcos',
    body: p('Egy hobbit napjában hétszer eszik. A tányér melletti kis óra mutatja, melyik étkezés ideje van.')
      + ul(MEALS.map((m, k) => `${m}: ${hh(MEAL_WINDOWS[k][0])}–${hh(MEAL_WINDOWS[k][1])}`))
      + p(`<b>Jóllakott:</b> ha egy étkezés idején eszel, a következő étkezés végéig gyorsabban ásol (×${num(1 / MEAL.fedDig)}). <b>Morcos:</b> ha egy étkezés úgy telik el, hogy nem ettél (és a tányér nem volt tele), lassabban ásol és jársz, amíg időben nem eszel.`),
  }));
  add(C, 'Az étkezések', true, () => ({
    title: 'Harapnivaló a zsákból',
    meta: 'mélyen is időben enni',
    body: p(`Ha egy étkezés feléig nem ettél, a hobbit magától megeszik egy harapnivalót a zsákjából, és ez időben evésnek számít. Kézzel is ehetsz a zsákból (szünet → Zsák → „Megeszem”), a nyers krumplit is (+${BAG_FOOD.krumpli}).`)
      + p('Az Akciókerék Evés pontja (2 / 9 / LB nyomva tartva) a zsákod legjobban illő ételét eszi meg: a legtöbbet adót, ami még elfér a tányérodon.')
      + ul(Object.entries(SNACKS).map(([id, n]) => {
        const f = FIND_TYPES.find((x) => x.id === id);
        return S.found.has(id) && f ? `${f.name}: +${n} a tányérra` : LOCKED;
      })),
  }));
  add(C, 'A szomszédság', S.neighbour, () => ({
    title: 'A szomszéd cseréi',
    meta: `naponta ${TRADE.perDay} csere`,
    body: p('A szomszéd hobbit a kertje kapujában áll. A legolcsóbb mathomodat elcseréli almás pitére (étel), Hosszúvölgyi levélre vagy egy másik mathomra; nagyobb hírnévvel gyakrabban ad értékesebbet.')
      + p(`Naponta ${TRADE.perDay} cserét vállal, mindegyik +${TRADE.rep} hírnév.`),
  }));
  add(C, 'A szomszédság', S.neighbour || S.rep > 0 || S.birthday, () => ({
    title: 'Hírnév',
    meta: `most: ${REP.names[S.repLevel]} (${S.rep} pont)`,
    body: p(`Minden szint ${pct(REP.price)}-kal olcsóbbá teszi a Zöld Sárkány árait, és ${pct(REP.sell)}-kal többet fizet a leletekért.`)
      + ul(REP.levels.map((n, k) => (k <= S.repLevel + 1 ? `${REP.names[k]}: ${n} ponttól${k ? ` · −${pct(REP.price * k)} ár, +${pct(REP.sell * k)} eladás` : ''}` : LOCKED)))
      + p(`Hírnevet hoz: minden csere (+${TRADE.rep}), Bilbó születésnapja (+${REP.birthday}) és minden ott elajándékozott mathom (+${REP.gift})${S.partyMet ? ', valamint Bilbó ünnepségének előkészületei a Mulatóréten' : ''}.`),
  }));
  add(C, 'A szomszédság', S.repLevel >= 1 || S.buyer, () => ({
    title: 'Új vevők',
    meta: `×${num(REP.buyerMult, 1)} egy fajta leletért`,
    body: p(`A hírneved új vevőket csal a Zöld Sárkányba: naponta egyszer, szerencsével, egy vevő ×${num(REP.buyerMult, 1)} árat ad egyfajta leletért a nap végéig. A pult eladási sora mutatja, mit keres. Minél nagyobb a hírnév, annál gyakrabban jön.`),
  }));
  add(C, 'A kert', S.garden, () => ({
    title: 'Veteményes',
    meta: 'a kiásott földből',
    body: p('A földkupac mellett ágyások nyílnak: minél több földet ástok ki, annál több. Ültess beléjük (használat gomb az ágyásnál), és ha beértek, szüreteld: a termés a zsákodba kerül. Az alvás is sietteti.')
      + ul(Object.entries(GARDEN.crops).map(([id, c]) => (S.found.has(id) ? `${c.name}: ${num(c.days)} nap alatt érik, ${c.yield} darab` : LOCKED))),
  }));
  add(C, 'Ünnepek', S.birthday, () => ({
    title: 'Bilbó születésnapja',
    meta: 'szeptember 22.',
    body: p('Ha elég kényelmes Zsáklak, a születésnapon ünnep van: a hobbit-szokás szerint az ünnepelt ad ajándékot. A zsákodban lévő mathomokat elajándékozhatod.')
      + p(`Az ünnep +${REP.birthday} hírnév, minden elajándékozott mathom további +${REP.gift}.`),
  }));
  // NOTES-39-party: Bilbo's eleventy-first party. Unlocked by its hint (the purse once held the first stage's price) or a
  // stage bought; the stages after the next one stay "???", the scene is told only once it was held.
  const P = S.party;
  add(C, 'Ünnepek', S.partyMet, () => ({
    title: 'Bilbó ünnepsége',
    meta: `a Mulatórét · ${P.done ? 'megtartották' : `${P.stages} / ${STAGES.length} rész kész`}`,
    body: p(`A gödörtől délnyugatra, a dűlőút végén áll a Mulatófa. Az út mellett, a kapu helyénél álló táblánál (használat gomb) rendezheted be a Mulatórétet Bilbó száztizenegyedik születésnapjára. ${STAGES.length} rész van, mindegyik drágább az előzőnél, és csak sorban készíthetők el; a közös erszényből fizettek, bármelyikőtök rendelhet (ketten játszva az árak ×${num(COOP.price)}, a hírnév nem csökkenti őket). Minden rész rögtön meg is látszik a réten.`)
      + ul(STAGES.map((s, k) => (k <= P.stages ? `<b>${s.name}</b> · ${gold(s.price)}${k < P.stages ? ' · kész' : ' <i>(következő)</i>'}<br><small>${s.gain[0].toUpperCase()}${s.gain.slice(1)}.</small>` : LOCKED)))
      + (P.stages >= STAGES.length ? p(`Az ünnepség alkonyatkor kezdődik (19 és 23 óra között), ha valamelyikőtök a Mulatóréten van. 19 órakor szól a játék, ha máshol jártok. Ha nem akartok alkonyatig várni, a táblánál a „Várakozás alkonyatig” ugrik az időben (ha mindannyian ott vagytok). Az ünnepség jelenetét a megerősítés gomb lapozza, a vissza gomb átugorja (a jutalom akkor is jár).`) : '')
      + (P.done ? p('Az ünnepségen Gandalf tűzijátéka és sárkánya, vacsora, Bilbó beszéde — és Bilbó egy villanással eltűnt. Az üres szék ott maradt a Mulatófa alatt. Emlékül Gandalf régi tűzijátéka a mathom-szoba vitrinjébe került (Gyűjtemény). Az ünnepség nem ismétlődik.') : ''),
  }));
}

/* ---------------- 5. Bag End ---------------- */

function bagEndEntries(add, S) {
  const C = 4;
  add(C, 'Általában', true, () => ({
    title: 'Zsáklak berendezése',
    meta: `kényelem: ${S.comfort}`,
    body: p('Zsáklakban a szobák bútorait a közös erszényből veszed (a bútor helyénél a használat gombja). Minden darabnak több fokozata van, és mindegyik kényelmet ad; egyes események (Gandalf látogatása, a vendégség, a születésnap) csak elég kényelmes otthonban történnek meg.'),
  }));
  for (const s of SLOTS) {
    const have = S.tiers[s.id] | 0;
    const room = ROOM[s.room]?.name || 'Zsáklak';
    add(C, room, have > 0, () => ({
      title: s.name,
      meta: `${room} · ${have} / ${s.tiers.length}. fokozat`,
      body: ul(s.tiers.map((t, k) => {
        if (k > have) return LOCKED;
        const what = [t.effect, t.desc].filter(Boolean).join(' ');
        return `<b>${t.name}</b> · ${t.price} arany · kényelem +${t.comfort}${what ? `<br><small>${what}</small>` : ''}${k < have ? '' : ' <i>(következő)</i>'}`;
      })),
    }));
  }
}

/* ---------------- 6. heroes and abilities (NOTES-45-final-docs) ---------------- */

/** A skill's text without what this save has not met yet (Sting, the spiders). */
function skillText(t, S) {
  let s = t;
  if (!S.sting) s = s.replace(' (vagy a Fullánk)', '');
  if (!S.spider) s = s.replace(' és a pókokat', '').replace(' és a pókok', '');
  return s;
}

function heroEntries(add, S) {
  const C = 5;
  // NOTES-41-xp: experience and skill points (the HUD plaque is there from the start).
  const foes = [S.goblin ? 'a goblinok' : '', S.spider ? 'a pókok' : ''].filter(Boolean).join(' és ');
  add(C, 'Tapasztalat', true, () => ({
    title: 'Tapasztalat és képességek',
    meta: 'Szünet › Képességek',
    body: p(`Tapasztalatot gyűjtesz az ásással (keményebb kőben és mélyebb rétegben többet), minden lelettel, ami a zsákodba kerül (az értékesebb többet ér, egy híres lelet ${XP_GAIN.find.famous} tapasztalatot)${foes ? `, ${foes} elkergetésével` : ''}${S.troll ? `, a trollok kővé dermesztésével (${XP_GAIN.troll} trollonként)` : ''} és minden új réteg első elérésével.`)
      + p(`Minden szintlépés egy <b>képességpontot</b> ad. A Szünet menü <b>Képességek</b> lapján költheted el a hősöd saját képességeire (hősönként négy, mindegyik legfeljebb ${MAX_RANK}. fokig). Az első szintek gyorsan jönnek (a 2. szinthez ${levelStart(2)}, az 5. szinthez ${levelStart(5).toLocaleString('hu-HU')} tapasztalat kell), a későbbiek egyre lassabban. A pontok nem kerülnek aranyba, és visszavenni csak azt lehet, amit ugyanabban a látogatásban adtál.`)
      + p('A Képességek lapon fel / le választasz, a megerősítés (vagy jobbra) ad egy pontot, balra visszaveszed; egérrel kattints a sorra, majd még egyszer. Ketten játszva mindenkinek saját tapasztalata és saját lapja van, és mindenki a saját gombjaival lapozza.')
      + p('A neved alatti kis táblán a szinted és a tapasztalatcsík látszik; a piros pecsét (pl. +2) jelzi, ha elkölthető képességpontod van. Szintlépéskor egy szalag is szól róla.')
      + (S.heroes.length ? ul(S.heroes.map((h) => `${h.name}: ${h.level}. szint · ${h.xp.toLocaleString('hu-HU')} tapasztalat${h.free ? ` · ${h.free} elkölthető pont` : ''}`)) : ''),
  }));
  for (const ch of CHARACTERS) {
    const skills = SKILLS[ch.id];
    if (!skills) continue;
    add(C, 'Tapasztalat', true, () => ({
      title: `${ch.name} képességei`,
      meta: [ch.plus, ch.minus].filter(Boolean).join(' · '),
      body: ul(skills.map((s) => `<b>${s.name}</b>: ${skillText(s.desc, S)}<br><small>${MAX_RANK}. fokon: ${s.line(MAX_RANK)}</small>`)),
    }));
  }
  // NOTES-38-finders: knocking on the wall (met once a player has been 3 m down, as the wheel's slice).
  const hear = [S.goblin ? 'a goblinok' : '', S.spider ? 'a pókok' : ''].filter(Boolean).join(' és ');
  add(C, 'A gödörben', S.pit, () => ({
    title: 'Kopogtatás a falon',
    meta: '1 · Ö · LB + jobb kar benyomása · Akciókerék',
    body: p(`Lent a gödörben fordulj a falnak (legfeljebb ${num(FINDERS.tap.reach, 1)} m-re), és kopogtass: <b>1</b> (a 2. játékosnak <b>Ö</b>; kontrolleren tartsd az LB-t, és nyomd be a jobb kart), vagy válaszd az Akciókerékből. A visszhang megmondja, merre és nagyjából milyen messze van a rétegen a legközelebbi üreg, pince vagy terem (a saját alagutaitokat és azt az üreget, amiben állsz, nem számítja): „Üregesen kong… balra, kb. 12 m”, és a célkereszt körül egy gyűrű nyila is arra mutat.`)
      + p(`Ingyenes, de zajos${hear ? `: ${hear} meghallják, a kincstárban Szmaug is` : ''}. Utána ${FINDERS.tap.cooldown} másodpercig zúg a fal, addig nem kopogtathatsz újra. Ha a rétegen nincs üreg: „Tömören szól a fal”.`)
      + p('A visszhang bármilyen üregre felel, a kis zugokra is. A réteg fő helyszíneit (pincék, barlangok, csarnokok) a bal oldali tábla, a Fő állomások jelzője mutatja.'),
  }));
  // NOTES-46-stations: the main-station guide (the badge is there from the first metre underground).
  add(C, 'A gödörben', true, () => ({
    title: 'Fő állomások jelzője',
    meta: 'bal oldali tábla · Beállítások › Fő állomások jelzője',
    body: p('Lent a gödörben a képernyőd bal oldalán, a tányér alatt egy pergamentábla mutatja a réteg legközelebbi fő helyszínét, ahol még egyikőtök sem járt. A nyíl a nézésedhez képest mutat arra (felfelé: előtted), mellette a hely neve, a vízszintes távolság („14 m”) és a szintkülönbség („↓ 6 m”: ennyivel lejjebb van, „↑”: feljebb, vagy „egy szinten”). Ha a hely szinte pontosan alattad vagy fölötted van, a nyíl helyén ↓ vagy ↑ áll.')
      + p('Amint valamelyikőtök belép egy ilyen helyre, az megjártnak számít (a játék el is menti), és a tábla a következőre mutat; ha a réteg minden fő helyszínén jártatok, eltűnik. Ketten játszva mindenkinek saját táblája van, a saját rétegén. A felszínen, Zsáklakban, menükben és jelenetekben nincs tábla. A Beállításokban kapcsolhatod ki (Fő állomások jelzője); ezt a gép jegyzi meg, a mentéstől külön.')
      + p('A fő helyszínek rétegenként (csak ahová már leértetek):')
      + ul(STATIONS.map((list, l) => (S.reached(l) ? `${ROMAN[l]}. réteg: ${list.map((st) => (S.stations.has(st.id) ? `${st.name} <i>(megjártátok)</i>` : st.name)).join(', ')}` : LOCKED))),
  }));
  // NOTES-47-station-uses: what each main station gives (the new daily uses and the stations' own adventures, spoiler-free;
  // only the layers someone has reached are listed).
  add(C, 'A gödörben', true, () => ({
    title: 'Mit adnak a fő állomások?',
    meta: 'használat gomb a helyszínen · naponta egyszer',
    body: p('Minden fő helyszínen van mit tenni. Ahol a képernyő közepe alatt feltűnik egy sor a használat gombbal, ott naponta egyszer (a Megye napja hajnalban fordul) kapsz valamit: ételt, Gandalf tűzijáték-töltetét vagy egy leletet. Ha már megvolt aznap, a sor azt mutatja: „ma már megvolt (holnap újra)”.')
      + p('Az étel és a töltet mindenkinek jár (ketten játszva mindkettőtöknek), a leletek a társaságnak naponta egyszer. A lelet a zsákba kerül, ha van benne hely és a felvételi szűrőd engedi; ha nem, ott marad, és a nap még nem számít elhasználtnak. Töltetet csak az kap, akinek nincs tele a zsebe. A kamra étele étkezésnek számít a Megye étkezési idejében; Kihívásban csak kétharmad tányér.')
      + ul(STATIONS.map((list, l) => {
        if (!S.reached(l)) return LOCKED;
        const rows = list.map((st) => {
          const u = STATION_USES.find((x) => x.station === st.id);
          const fname = u?.find ? FIND_TYPES.find((t) => t.id === u.find)?.name : '';
          const what = u ? u.short.replace('{f}', fname && S.found.has(u.find) ? `egy „${fname}”` : 'egy lelet') : STATION_EXISTING[st.id];
          return what ? `${st.name}: ${what}` : `${st.name}: itt csak a hely maga vár (a lépcső teteje a kincstár felett)`;
        });
        return `<b>${ROMAN[l]}. réteg</b><br>${rows.join('<br>')}`;
      })),
  }));
  // NOTES-44-pickup-edge: the world's edge (on Thrór's map from the start, the fence round the meadow).
  const side = Math.round(EDGE.x1 - EDGE.x0 + 1);
  add(C, 'A gödörben', true, () => ({
    title: 'A világ széle',
    meta: `${side} × ${side} m-es gödör · a rét kerítése`,
    body: p(`A gödör ${side} × ${side} méteres. A széléhez érve a föld sötét, rúnákkal rótt kőfallá változik: azon túl nem lehet ásni, és a játék szól is: „${EDGE_LINES.dig}” A legmélyén, Szmaug kincstára alatt is ugyanez a helyzet.`)
      + p(`Fent a Megyében a rét szélén körbefutó kerítésig mehetsz (a gödörtől kb. ${EDGE.surface} m-re): „${EDGE_LINES.walk}” Thrór térképén a világ szélét satírozott kősáv jelzi.`),
  }));
  // NOTES-36-partner: the co-op partner marker (met once two have played).
  add(C, 'Ketten játszva', S.partner, () => ({
    title: 'A társad jele',
    meta: 'a társ színe, távolsága, mélysége',
    body: p('Ketten játszva a képernyőfeleden egy kis tű mutatja a társad helyét a feje fölött, a falon és a földön át is, fölötte egy fatáblán a neve a színében, a távolsága („14 m”) és a szintkülönbség („↓ 12 m”: lejjebb van, „↑”: feljebb). Ha nincs a látómeződben, a tábla a képernyő szélén vár, és egy nyíl mutatja, merre fordulj; ha messze alattad van, lefelé mutat.')
      + p('Közelről (2,5–5,5 m) a jel elhalványul. Ha a társad Zsáklakban van, a jel a kerek ajtón áll („Zsáklakban”). Menükben, jelenetekben, ájultan és a Versengés módban nincs jel. Thrór térképén mindkettőtök pontja és a köztetek lévő távolság is látszik.'),
  }));
}

/* ---------------- 7. controls (always) ---------------- */

function controlEntries(add) {
  const C = 6;
  const skip = keyName(SKIP_KEY);
  const table = (rows) => `<table>${rows.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</table>`;
  add(C, '', true, () => ({
    title: 'Billentyűzet és egér',
    meta: 'az első játékos',
    body: table([
      ['W A S D', 'járás'], ['egér', 'nézelődés'], ['bal egérgomb / F', 'ásás'], ['jobb egérgomb / Q', 'létra lerakása'],
      ['Szóköz', 'ugrás, mászás'], ['Shift / C', 'lefelé mászás, lopakodás'], ['E', 'használat (pult, ajtók, bútorok)'],
      ['G / középső egérgomb', 'kődobás'], ['X', 'a karakter képessége (Bilbónak a Gyűrű)'], ['T', 'csúfolódás (Bilbó)'],
      ['R', 'a Sasok hívása'], ['C + R', 'töltet lerakása, meggyújtása'], ['V', 'kötélbiztosítás'], ['H', 'lámpa magasra'],
      ['1', 'kopogtatás a falon'], [`${digit(WHEEL_KEYS.mouse)} (nyomva tartva)`, 'Akciókerék: válassz az egérrel, engedd el'],
      ['B', 'Thrór térképe'], ['J / Tab', 'a szerződés tekercse'],
    ]),
  }));
  add(C, '', true, () => ({
    title: 'Második játékos a billentyűzeten',
    meta: 'F2: a billentyűzet jobb fele',
    body: p('Az F2 billentyűvel csatlakozik egy második játékos a billentyűzet jobb oldalán (ha nincs kontroller).') + table([
      ['nyilak', 'járás'], ['I J K L', 'nézelődés'], ['U', 'ásás'], ['O', 'létra'], ['jobb Shift / Num 0', 'ugrás'], ['jobb Ctrl / .', 'lefelé mászás'],
      ['P', 'használat'], ['Ő', 'kődobás'], ['Á', 'képesség'], ['Ű', 'csúfolódás'], ['É', 'Sasok'], ['. + É', 'töltet'], [',', 'kötél'], ['-', 'lámpa'],
      ['Ö', 'kopogtatás a falon'], [`${digit(WHEEL_KEYS.keys2)} (nyomva tartva)`, 'Akciókerék: válassz a nyilakkal, engedd el'],
      ['N', 'szerződés'], ['Ú', 'térkép'], ['Enter / Backspace', 'menükben: választás / vissza'],
    ]),
  }));
  add(C, '', true, () => ({
    title: 'Kontroller',
    meta: 'Xbox-elrendezés',
    body: p('Egy új kontroller Start gombja csatlakoztatja a második játékost.') + table([
      ['bal kar', 'járás'], ['jobb kar', 'nézelődés'], ['RT / RB', 'ásás'], ['LT / Y', 'létra'], ['A', 'ugrás, választás'], ['LB (tartva)', 'lefelé mászás, lopakodás'],
      ['LB (nyomva tartva, más gomb nélkül)', 'Akciókerék: válassz a bal karral, engedd el'],
      ['X', 'használat'], ['B', 'kődobás · menükben vissza'], ['D-pad bal', 'képesség'], ['D-pad jobb', 'csúfolódás'], ['D-pad fel', 'Sasok'], ['LB + D-pad fel', 'töltet'], ['D-pad le', 'kötél'],
      ['jobb kar benyomva', 'lámpa (LB nélkül)'], ['LB + jobb kar benyomva', 'kopogtatás a falon'], ['bal kar benyomva', 'térkép'],
      ['View', 'szerződés (2 mp tartva: a 2. játékos kiszáll)'], ['LB + View', 'következő zeneszám'], ['Start (Menu)', 'szünet'],
    ]),
  }));
  add(C, '', true, () => ({
    title: 'Akciókerék',
    meta: `${digit(WHEEL_KEYS.mouse)} · ${digit(WHEEL_KEYS.keys2)} · LB nyomva tartva`,
    body: p(`A különleges akciókat egy kerékből is elérheted. Tartsd nyomva a <b>${digit(WHEEL_KEYS.mouse)}</b>-es gombot (a billentyűzet jobb felén játszó társ a <b>${digit(WHEEL_KEYS.keys2)}</b>-est, kontrolleren az <b>LB</b>-t, más gomb nélkül), és ${num(WHEEL.hold, 1)} másodperc múlva kinyílik a pergamenkerék a saját képernyőfeleden. Az egérrel (a nyilakkal, a bal karral) válaszd ki az akciót, és engedd el a gombot: megtörténik. Ha semmit sem választasz (az egér vagy a kar középen), elengedve nem történik semmi.`)
      + p(`A játék közben nem áll meg: a társad tovább játszik, te lassabban lépsz (×${num(WHEEL.slow)}), és az egér nem forgatja a nézetet, amíg a kerék nyitva van; kontrollerrel és a nyilakkal választva meg is állsz.`)
      + p('A kerékben csak az látszik, amit már megszereztél vagy megismertél, és minden akció mindig ugyanott van: fent a létra, jobbra fent a Sasok, jobbra a töltet, jobbra lent a kopogtatás, lent az evés a zsákból, balra lent a lámpa, balra a kődobás, balra fent a kötél. Mindegyiknél ott a darabszám vagy az ár, a visszatöltődés köre, és kicsiben a saját gyorsgombja. A szürke akció most nem használható, alatta röviden az ok („Csak a föld alatt”, „Nincs nálad”…).')
      + p('Kontrolleren az LB rövid megnyomása, a lopakodás (LB + bal kar) és az LB-s gombpárok (LB + D-pad fel: töltet, LB + jobb kar benyomása: kopogtatás, LB + View: következő zeneszám) ugyanúgy működnek, mint eddig. Ha új akciót szerzel, a játék egyszer szól: „Új akció: … — tartsd nyomva …”.'),
  }));
  add(C, '', true, () => ({
    title: 'Thrór térképe',
    meta: 'B · Ú · bal kar benyomva',
    body: p('A térkép a gödör keresztmetszetét mutatja rétegenként, a ti helyetekkel és mélységetekkel (ketten játszva a köztetek lévő távolsággal is). Megnyitja: <b>B</b> (a 2. játékosnak <b>Ú</b>; kontrolleren a bal kar benyomása), vagy a szünet menü Térkép sora.')
      + p('A megvett rétegeken Balin alaprajzai is látszanak (a réteg összes ürege és terme); ha Ori dolgozik nálatok, vörös tintával az ő térképe is: amerre már jártatok. A gödör két oldalán és alján satírozott kősáv jelzi a világ szélét.')
      + p('A réteg fő helyszínei felé a játék közben a bal oldali tábla, a Fő állomások jelzője vezet.'),
  }));
  add(C, '', true, () => ({
    title: 'Képernyők és menük',
    meta: 'szünet, térkép, szerződés',
    body: table([
      ['Esc / Start', 'szünet (a térkép, a szerződés, a zsák, a képességek, a gyűjtemény, a kézikönyv és a beállítások innen)'], ['B', 'Thrór térképe'], ['J vagy Tab', 'a szerződés tekercse'],
      ['Szünet › Zsák', 'a zsák tartalma; ételt is ehetsz belőle; alul a Felvétel: mit veszel fel ásáskor (1–4 · 7 8 9 Ö · Y + X)'],
      ['Szünet › Képességek', 'tapasztalat és képességpontok'],
      ['F2', 'második billentyűzetes játékos'], ['F3', 'osztott képernyő: egymás mellett / egymás alatt'], ['M', 'zene halkítása'],
    ]) + p('A menükben a nyilakkal (WASD-vel, D-paddal) lépsz, Enterrel, Szóközzel vagy A-val választasz, Esc-kel vagy B-vel lépsz vissza.'),
  }));
  add(C, '', true, () => ({
    title: 'Zene léptetése',
    meta: `${skip} · kontrolleren LB + View`,
    body: p(`A következő zeneszám: <b>${skip}</b> billentyű (amerikai billentyűzeten ${SKIP_KEY.replace('Key', '')}), kontrolleren tartsd az LB-t és nyomd meg a View gombot. A szünetben és a beállításokban is van ilyen sor; a véletlen sorrend a beállításokban kapcsolható.`),
  }));
}

/* ------------------------------------------------------------------ the view */

const CSS = `
.scr-hb { background: #0008; }
.hb-frame { position: absolute; container: hb / size; display: flex; align-items: center; justify-content: center; }
.hb-book { width: 100%; height: 100%; max-width: 74rem; max-height: 46rem; box-sizing: border-box; padding: 0.7em; display: flex; font-size: clamp(10.5px, min(2.25cqh, 1.45cqw), 17px);
  background: linear-gradient(90deg, #4a1c10, #6a2a18 48%, #3a140a 50%, #6a2a18 52%, #4a1c10); border-radius: 0.6em; box-shadow: 0 1.2em 2.4em #000d, inset 0 0 0 2px #2a0c06; }
.hb-page { flex: 1; min-width: 0; min-height: 0; display: grid; grid-template-rows: auto 1fr auto; gap: 0.4em; padding: 0.8em 1.1em 0.6em; box-sizing: border-box; color: #2e2014; border-radius: 0.3em;
  background: repeating-linear-gradient(180deg, transparent 0 1.9em, #8a6a3a1c 1.9em calc(1.9em + 1px)), linear-gradient(90deg, #e6d4aa, #f2e6c8 30%, #efe2c2 85%, #cdb88a); box-shadow: inset 0 0 2em #7a5a2a55; }
.hb-head { display: flex; align-items: center; gap: 0.8em; min-width: 0; }
.hb-head h2 { margin: 0; font-family: var(--f-title); font-weight: normal; font-size: 1.7em; color: #4a2410; white-space: nowrap; line-height: 1; }
.hb-head small { font-style: italic; color: #6a5236; font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.hb-search { flex: 0 1 15em; min-width: 6em; font: inherit; font-size: 0.95em; color: #2e2014; background: #fff6e0aa; border: 1px solid #5a3a1a88; border-radius: 0.3em; padding: 0.2em 0.5em; outline: none; }
.hb-search:focus { border-color: #7a1e10; box-shadow: 0 0 0 0.12em #b8904a66; }
.hb-main { display: grid; grid-template-columns: 11em minmax(0, 1fr) minmax(0, 1.45fr); gap: 0.9em; min-height: 0; }
.hb-ch, .hb-list, .hb-det { min-height: 0; overflow: hidden auto; scrollbar-width: thin; scrollbar-color: #8a6a3a66 transparent; }
.hb-ch { display: flex; flex-direction: column; gap: 0.1em; border-right: 1px dotted #5a3a1a66; padding-right: 0.5em; }
.hb-ch button { font: inherit; text-align: left; background: none; border: 0; padding: 0.2em 0.3em 0.2em 1.3em; position: relative; cursor: pointer; color: #3a2410; border-radius: 0.2em; line-height: 1.15; }
.hb-ch button b { font-family: var(--f-head); font-weight: normal; font-size: 1.08em; }
.hb-ch button small { display: block; font-size: 0.75em; color: #7a5e3e; font-style: italic; }
.hb-ch button.sel { background: linear-gradient(176deg, transparent 0 50%, #b8904a40 52% 82%, transparent 86%); color: #7a1e10; }
.hb-ch button.sel::before { content: '❧'; position: absolute; left: 0.15em; top: 0.12em; color: #7a1e10; }
.hb-list { list-style: none; margin: 0; padding: 0 0.3em 0 0; }
.hb-list .g { font-family: var(--f-head); font-size: 0.82em; color: #8a2414; margin: 0.45em 0 0.1em; border-bottom: 1px dotted #5a3a1a55; }
.hb-list .g:first-child { margin-top: 0; }
.hb-list li.e { padding: 0.1em 0.35em; cursor: pointer; border-radius: 0.2em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.25; }
.hb-list li.e.lk { color: #9a8468; letter-spacing: 0.15em; }
.hb-list li.e.sel { background: #b8904a44; color: #7a1e10; box-shadow: inset 0.18em 0 0 #7a1e10; }
.hb-list li.e em { font-style: normal; font-size: 0.78em; color: #7a5e3e; margin-left: 0.4em; }
.hb-list .none { font-style: italic; color: #6a5236; }
.hb-det { padding: 0 0.4em 0 0.9em; border-left: 1px dotted #5a3a1a66; line-height: 1.32; }
.hb-det h3 { margin: 0; font-family: var(--f-head); font-weight: normal; font-size: 1.45em; color: #3a1a08; line-height: 1.1; }
.hb-det .meta { margin: 0.1em 0 0.45em; font-style: italic; font-size: 0.85em; color: #6a5236; }
.hb-det p { margin: 0 0 0.45em; }
.hb-det ul { margin: 0 0 0.45em; padding-left: 1.2em; }
.hb-det li { margin: 0.05em 0; }
.hb-det small { color: #5a4430; font-style: italic; }
.hb-det table { border-collapse: collapse; width: 100%; font-size: 0.92em; }
.hb-det th { text-align: left; font-family: var(--f-head); font-weight: normal; color: #5a2a0a; white-space: nowrap; padding: 0.06em 0.8em 0.06em 0; vertical-align: top; }
.hb-det td { padding: 0.06em 0; border-bottom: 1px dotted #5a3a1a33; }
.hb-det.lk h3 { color: #9a8468; letter-spacing: 0.2em; }
.hb-det.lk p { font-style: italic; color: #6a5236; }
.hb-foot { display: flex; justify-content: space-between; align-items: center; gap: 0.8em; font-size: 0.8em; color: #6a5236; min-width: 0; }
.hb-foot span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.hb-back { flex: none; font-family: var(--f-head); font-size: 1em; color: #3a2412; background: #e8d6ac; border: 1px solid #5a3a1a; border-radius: 0.25em; padding: 0.05em 0.7em; cursor: pointer; }
/* a narrow viewport (the side-by-side halves): the chapters become a strip on top */
@container hb (max-width: 760px) {
  .hb-book { font-size: clamp(10.5px, min(2.1cqh, 2.05cqw), 15px); }
  .hb-main { grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr); grid-template-rows: auto minmax(0, 1fr); }
  .hb-ch { grid-column: 1 / -1; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px dotted #5a3a1a66; padding: 0 0 0.25em; }
  .hb-ch button { padding: 0.1em 0.4em 0.1em 1.1em; }
  .hb-ch button small { display: none; }
  .hb-head small { display: none; }
}
@container hb (max-width: 480px) {
  .hb-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 0.8fr) minmax(0, 1.2fr); }
  .hb-det { border-left: 0; border-top: 1px dotted #5a3a1a66; padding: 0.3em 0 0; }
}
/* a short viewport (the top / bottom halves) */
@container hb (max-height: 420px) {
  .hb-book { padding: 0.4em; }
  .hb-page { padding: 0.45em 0.8em 0.35em; gap: 0.25em; }
  .hb-head h2 { font-size: 1.35em; }
  .hb-ch button small { display: none; }
}
`;

function injectCss() {
  if (document.getElementById('handbook-style')) return;
  const st = document.createElement('style');
  st.id = 'handbook-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

export class HandbookView {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    el.className = 'scr scr-hb';
    this.entries = [];
    this.chapter = 0;
    this.sel = 0; // index into the current list (this.list())
    this.query = '';
    this.onBack = null;
  }

  get isOpen() {
    return this.el.classList.contains('on');
  }

  /** Opens for player `who` (his viewport in split screen). `focus`: give the search box the keyboard. */
  show(who, onBack, focus = false) {
    injectCss();
    const g = this.game;
    this.onBack = onBack;
    this.state = gatherState(g);
    this.entries = buildEntries(g, this.state);
    this.query = '';
    this.chapter = Math.max(0, Math.min(this.chapter, CHAPTERS.length - 1));
    this.sel = 0;
    const vp = (g.players.length > 1 ? g.viewports?.()[who] : null) || { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const open = this.entries.filter((e) => e.open).length;
    this.el.innerHTML = `<div class="hb-frame" style="left:${vp.x}px;top:${vp.y}px;width:${vp.w}px;height:${vp.h}px">
      <div class="hb-book"><div class="hb-page">
        <div class="hb-head"><h2>Kézikönyv</h2><small>Bilbó jegyzetei arról, mi mire való · ${open} / ${this.entries.length} lap kitöltve</small>
          <input class="hb-search" type="search" placeholder="Keresés…" aria-label="Keresés a kézikönyvben" autocomplete="off" spellcheck="false"></div>
        <div class="hb-main"><div class="hb-ch">${CHAPTERS.map((c, k) => {
          const n = this.entries.filter((e) => e.ch === k);
          return `<button type="button" data-ch="${k}"><b>${c.title}</b><small>${n.filter((e) => e.open).length} / ${n.length}</small></button>`;
        }).join('')}</div><ul class="hb-list"></ul><div class="hb-det"></div></div>
        <div class="hb-foot"><span class="hb-keys"></span><button class="hb-back" type="button">Vissza</button></div>
      </div></div></div>`;
    this.listEl = this.el.querySelector('.hb-list');
    this.detEl = this.el.querySelector('.hb-det');
    this.searchEl = this.el.querySelector('.hb-search');
    const pad = g.bindings.some((b) => b.pad != null);
    this.el.querySelector('.hb-keys').textContent = `${pad ? 'D-pad bal / jobb: fejezet · fel / le: lap · B: vissza · ' : ''}nyilak: lapozás · gépelj a kereséshez · Esc: vissza`;
    this.el.querySelector('.hb-back').addEventListener('click', () => this.onBack?.());
    this.el.querySelector('.hb-ch').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-ch]');
      if (b) this.setChapter(+b.dataset.ch, true);
    });
    this.listEl.addEventListener('click', (ev) => {
      const li = ev.target.closest('li.e');
      if (li) this.select(+li.dataset.k);
    });
    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl.value;
      this.sel = 0;
      this.render();
    });
    // While typing, the game's own key listener (window) must not see the key presses: letters are moves and shortcuts
    // there (and it cancels Space). Key releases still reach it, so no key stays "held" in input.js.
    this.searchEl.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      this.searchKey(ev);
    });
    this.el.classList.add('on');
    this.render();
    if (focus) this.searchEl.focus({ preventScroll: true });
  }

  hide() {
    if (this.searchEl && document.activeElement === this.searchEl) this.searchEl.blur();
    this.el.classList.remove('on');
    this.el.innerHTML = '';
    this.listEl = this.detEl = this.searchEl = null;
    this.entries = [];
    this.state = null;
  }

  /** The entries the middle column lists: the chapter's, or the unlocked matches of the search across all chapters. */
  list() {
    const q = fold(this.query.trim());
    if (!q) return this.entries.filter((e) => e.ch === this.chapter);
    const words = q.split(/\s+/);
    const hits = this.entries.filter((e) => e.open && words.every((w) => e.key.includes(w)));
    // Entries whose title matches come first (the filter is stable otherwise).
    const inTitle = (e) => (words.every((w) => fold(e.title).includes(w)) ? 0 : 1);
    return hits.map((e) => [inTitle(e), e]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  }

  setChapter(k, clearSearch = false) {
    this.chapter = (k + CHAPTERS.length) % CHAPTERS.length;
    if (clearSearch && this.searchEl) {
      this.searchEl.value = '';
      this.query = '';
    }
    this.sel = 0;
    this.render();
  }

  select(k) {
    const n = this.list().length;
    if (!n) return;
    this.sel = (k + n) % n;
    this.render();
  }

  /** Keys typed into the search box (the window listener does not get them). */
  searchKey(ev) {
    const k = ev.key;
    if (k === 'Escape') {
      ev.preventDefault();
      if (this.searchEl.value) {
        this.searchEl.value = '';
        this.query = '';
        this.sel = 0;
        this.render();
      } else this.onBack?.();
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      ev.preventDefault();
      this.select(this.sel + (k === 'ArrowDown' ? 1 : -1));
    } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && !this.searchEl.value) {
      ev.preventDefault();
      this.setChapter(this.chapter + (k === 'ArrowRight' ? 1 : -1));
    } else if (k === 'PageDown' || k === 'PageUp') {
      ev.preventDefault();
      this.detEl.scrollTop += (k === 'PageDown' ? 1 : -1) * this.detEl.clientHeight * 0.8;
    } else if (k === 'Enter' || k === 'Tab') {
      ev.preventDefault();
      this.searchEl.blur();
    }
  }

  /** The merged intents (Screens.frame): the pad and the keyboard while the search box does not have the focus. */
  input(it) {
    if (this.searchEl && document.activeElement === this.searchEl) {
      // Key presses are stopped at the box, so whatever arrives here comes from a pad: its d-pad takes over the
      // browsing (the box gives up the focus), B / Start go back.
      if (!(it.upPressed || it.downPressed || it.leftPressed || it.rightPressed)) {
        if (it.backPressed || it.pausePressed) this.onBack?.();
        return;
      }
      this.searchEl.blur();
    }
    if (it.backPressed || it.pausePressed) return this.onBack?.();
    if (it.leftPressed) this.setChapter(this.chapter - 1, true);
    if (it.rightPressed) this.setChapter(this.chapter + 1, true);
    if (it.upPressed) this.select(this.sel - 1);
    if (it.downPressed) this.select(this.sel + 1);
    if (it.confirmPressed) this.searchEl?.focus({ preventScroll: true });
  }

  render() {
    if (!this.listEl) return;
    const items = this.list();
    this.sel = Math.max(0, Math.min(this.sel, items.length - 1));
    const searching = !!this.query.trim();
    this.el.querySelectorAll('.hb-ch button').forEach((b) => b.classList.toggle('sel', !searching && +b.dataset.ch === this.chapter));
    let html = '';
    let group = null;
    items.forEach((e, k) => {
      const gname = searching ? CHAPTERS[e.ch].title : e.group;
      if (gname && gname !== group) html += `<li class="g">${gname}</li>`;
      group = gname;
      html += `<li class="e${e.open ? '' : ' lk'}${k === this.sel ? ' sel' : ''}" data-k="${k}">${e.title}</li>`;
    });
    this.listEl.innerHTML = html || '<li class="none">Nincs ilyen lap a kitöltött lapok között.</li>';
    const cur = items[this.sel];
    this.detEl.classList.toggle('lk', !!cur && !cur.open);
    if (!cur) this.detEl.innerHTML = '';
    else if (cur.open) this.detEl.innerHTML = `<h3>${cur.title}</h3>${cur.meta ? `<p class="meta">${cur.meta}</p>` : ''}${cur.body}`;
    else this.detEl.innerHTML = `<h3>${LOCKED}</h3><p>${LOCK_TEXT[cur.ch]}</p>`;
    this.detEl.scrollTop = 0;
    // Keep the selected row in view (only the list scrolls; no scrollIntoView, which may move the page).
    const row = this.listEl.querySelector('li.e.sel');
    if (row) {
      const top = row.offsetTop - this.listEl.offsetTop;
      if (top < this.listEl.scrollTop) this.listEl.scrollTop = top - 4;
      else if (top + row.offsetHeight > this.listEl.scrollTop + this.listEl.clientHeight) this.listEl.scrollTop = top + row.offsetHeight - this.listEl.clientHeight + 4;
    }
  }
}
