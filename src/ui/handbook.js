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
     opens; while open, the DOM changes only on input (the game is frozen meanwhile). ==== */
import { BAG_TIERS, COOP, HUNGER, LADDER_LEN, SHOP, TOOL_TIERS } from '../config.js';
import { EAGLE_COOLDOWN, EAGLE_PRICE, ROCKET_MAX, ROCKET_PRICE } from '../exits.js';
import { FIND_TYPES } from '../finds.js';
import { SKIP_KEY } from '../input.js';
import { LIFT_STOPS } from '../lift.js';
import { LAYER_NAMES, LAYER_TOPS } from '../materials.js';
import { ARMOUR_SHOP_MAX, ARMOUR_TIERS } from '../enemies/armour.js';
import { COMBAT } from '../enemies/combat.js';
import { TROLL } from '../trolls/index.js';
import { BALIN } from '../safety/index.js';
import { GARDEN } from '../shire/index.js';
import { isMathom, MATHOM_IDS, REP, TRADE } from '../shire/mathoms.js';
import { MEAL, MEAL_WINDOWS, SNACKS } from '../shire/meals.js';
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
  tukkacat: 'Az öreg Tuk nyári mulatságainak tűzijátékaiból (nem azonos Gandalf rakétájával a boltban).',
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
  };
}

/* ------------------------------------------------------------------ the chapters */

export const CHAPTERS = [
  { id: 'leletek', title: 'Leletek', short: 'Leletek' },
  { id: 'bolt', title: 'Szerszámok és bolt', short: 'Bolt' },
  { id: 'ellenseg', title: 'Ellenségek és védekezés', short: 'Ellenség' },
  { id: 'megye', title: 'A Megye élete', short: 'Megye' },
  { id: 'zsaklak', title: 'Zsáklak', short: 'Zsáklak' },
  { id: 'iranyitas', title: 'Irányítás', short: 'Irányítás' },
];

/** What a locked entry says (no name, no hint of what it is). */
const LOCK_TEXT = [
  'Ezt a leletet még nem találtátok meg. Ásd tovább a földet: amint a zsákodba kerül, Bilbó beírja ide.',
  'Erről még nem tudtok. Ha a pultnál felbukkan vagy megveszitek, Bilbó beírja ide.',
  'Ezzel még nem találkoztatok. Ha egyszer szembejön, Bilbó beírja ide, hogyan védekezz.',
  'Ezt még nem élték meg a Megyében. Ha megtörténik, Bilbó beírja ide.',
  'Ez a darab még nincs meg Zsáklakban. Ha megveszitek, Bilbó beírja ide, mire jó.',
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
  if (SNACKS[f.id]) lines.push(`<b>Étel:</b> étkezéskor a zsákodból is megeszed (+${SNACKS[f.id]} a tányérra).`);
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
      + p('Ha megtelik a zsák, a lelet a földön marad. Nagyobb zsákot a pultnál veszel.')
      + (S.reached(6) ? p('Tóváros alatt Bárd is megveszi a leleteidet a standjánál.') : ''),
  }));
  add(C, 'Általában', has(MATHOM_IDS), () => ({
    title: 'Mathomok',
    meta: 'csere, ajándék, hírnév',
    body: p('Mathom minden, aminek egy hobbit nem veszi hasznát, de kidobni sem dobná ki. A szomszéd hobbit elcseréli a legolcsóbb mathomodat almás pitére, Hosszúvölgyi levélre vagy egy másik mathomra'
      + ` (naponta ${TRADE.perDay} csere, mindegyik +${TRADE.rep} hírnév). Bilbó születésnapján ajándékba adhatod őket: mindegyik +${REP.gift} hírnév.`) + listFound(MATHOM_IDS, S),
  }));
  const foods = [...COOK_IDS, ...Object.keys(SNACKS).filter((id) => !COOK_IDS.includes(id))];
  add(C, 'Általában', has(foods), () => ({
    title: 'Étel a zsákban',
    meta: 'harapnivaló, főzés',
    body: p('Néhány lelet ehető: étkezéskor a hobbit magától megeszik egyet a zsákjából, és ez időben evésnek számít (A Megye élete: a hét étkezés). A krumplit és a gombát Zsáklak konyhája meg is főzi.') + listFound(foods, S),
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
    body: p('A pultnál adod el a zsák tartalmát, és itt veszel szerszámot, zsákot, létrát, elemózsiát, páncélt és Gandalf portékáit. Mindig a következő fokozatot kínálja.')
      + p(`A hírnév szintenként ${pct(REP.price)}-kal olcsóbbá teszi a boltot.${coop}`),
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
      + p(`Induláskor ${SHOP.startLadders} létrád van; a pultnál ${SHOP.ladderPack} darab ${gold(SHOP.ladderPrice)}.`),
  }));
  add(C, 'Kellékek', true, () => ({
    title: 'Elemózsia',
    meta: `${SHOP.foodPrice} arany`,
    body: p('Megveszed, és rögtön meg is eszed: a tányér megtelik. Ha üres a tányér, a hobbit elájul, és otthon tér magához.')
      + p(`Ásás, mászás és ugrás fogyasztja a tányért. Ára ${gold(SHOP.foodPrice)}; időben enni a Megye élete szerint is jó.`),
  }));
  add(C, 'Gandalf portékái', true, () => ({
    title: 'Gandalf tűzijáték-rakétája',
    meta: `${ROCKET_PRICE} arany · legfeljebb ${ROCKET_MAX}`,
    body: p('Gyors kijutás a mélyből: elsütöd (kijutás gomb), és egy szempillantás alatt kilő a gödörből; fent sárkány alakú tűzijátékként robban.')
      + p(`Csak ${num(2.5, 1)} m-nél mélyebbről működik (fentebb a létra gyorsabb). Egyszerre legfeljebb ${ROCKET_MAX} lehet nálad; darabja ${gold(ROCKET_PRICE)}.`),
  }));
  add(C, 'Gandalf portékái', S.eagles || S.reached(2), () => ({
    title: 'A Sasok',
    meta: `${EAGLE_PRICE} arany`,
    body: p('Gandalf molylepkéjével hívod őket (kijutás gomb): egy sas bárhonnan kiemel a gödörből, és körözés után leszállít a felszínre. A közeli társadat is kiemelik.')
      + p(`Egyszer kell megvenni (${gold(EAGLE_PRICE)}), utána ${EAGLE_COOLDOWN} másodpercenként hívhatod őket újra. A pult akkor kínálja, ha már jártál a trollok barlangjának mélységében.`),
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
    body: p('Ha egy étkezés feléig nem ettél, a hobbit magától megeszik egy harapnivalót a zsákjából, és ez időben evésnek számít.')
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
      + p(`Hírnevet hoz: minden csere (+${TRADE.rep}), Bilbó születésnapja (+${REP.birthday}) és minden ott elajándékozott mathom (+${REP.gift}).`),
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

/* ---------------- 6. controls (always) ---------------- */

function controlEntries(add) {
  const C = 5;
  const skip = keyName(SKIP_KEY);
  const table = (rows) => `<table>${rows.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</table>`;
  add(C, '', true, () => ({
    title: 'Billentyűzet és egér',
    meta: 'az első játékos',
    body: table([
      ['W A S D', 'járás'], ['egér', 'nézelődés'], ['bal egérgomb / F', 'ásás'], ['jobb egérgomb / Q', 'létra lerakása'],
      ['Szóköz', 'ugrás, mászás'], ['Shift / C', 'lefelé mászás, lopakodás'], ['E', 'használat (pult, ajtók, bútorok)'],
      ['G / középső egérgomb', 'kődobás'], ['X', 'a karakter képessége (Bilbónak a Gyűrű)'], ['T', 'csúfolódás (Bilbó)'],
      ['R', 'rakéta vagy a Sasok'], ['V', 'kötélbiztosítás'], ['H', 'lámpa magasra'],
    ]),
  }));
  add(C, '', true, () => ({
    title: 'Második játékos a billentyűzeten',
    meta: 'F2: a billentyűzet jobb fele',
    body: p('Az F2 billentyűvel csatlakozik egy második játékos a billentyűzet jobb oldalán (ha nincs kontroller).') + table([
      ['nyilak', 'járás'], ['I J K L', 'nézelődés'], ['U', 'ásás'], ['O', 'létra'], ['jobb Shift / Num 0', 'ugrás'], ['jobb Ctrl / .', 'lefelé mászás'],
      ['P', 'használat'], ['Ő', 'kődobás'], ['Á', 'képesség'], ['Ű', 'csúfolódás'], ['É', 'rakéta, Sasok'], [',', 'kötél'], ['-', 'lámpa'],
      ['N', 'szerződés'], ['Ú', 'térkép'], ['Enter / Backspace', 'menükben: választás / vissza'],
    ]),
  }));
  add(C, '', true, () => ({
    title: 'Kontroller',
    meta: 'Xbox-elrendezés',
    body: p('Egy új kontroller Start gombja csatlakoztatja a második játékost.') + table([
      ['bal kar', 'járás'], ['jobb kar', 'nézelődés'], ['RT / RB', 'ásás'], ['LT / Y', 'létra'], ['A', 'ugrás, választás'], ['LB (tartva)', 'lefelé mászás, lopakodás'],
      ['X', 'használat'], ['B', 'kődobás · menükben vissza'], ['D-pad bal', 'képesség'], ['D-pad jobb', 'csúfolódás'], ['D-pad fel', 'rakéta, Sasok'], ['D-pad le', 'kötél'],
      ['jobb kar benyomva', 'lámpa'], ['bal kar benyomva', 'térkép'], ['View', 'szerződés (2 mp tartva: a 2. játékos kiszáll)'], ['Start (Menu)', 'szünet'],
    ]),
  }));
  add(C, '', true, () => ({
    title: 'Képernyők és menük',
    meta: 'szünet, térkép, szerződés',
    body: table([
      ['Esc / Start', 'szünet (a kézikönyv, a zsák, a gyűjtemény és a beállítások innen)'], ['B', 'Thrór térképe'], ['J vagy Tab', 'a szerződés tekercse'],
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
