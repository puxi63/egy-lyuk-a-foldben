/* ==== ui/journal.js — "A szerződés": Bilbo's endless contract scroll, the per-layer collection and objective log (TERV
   0.9 Gyűjtemény és haladás, 0.11/17 "A szerződés", 0.12 themed UI; NOTES-9-journal, NOTES-25-map-contract).
   A long parchment scroll between two wooden rollers in each player's own viewport: one chapter per layer with its name
   in the runes of Thrór's map, its depth range, whether anyone has reached it, the clauses the Burglar takes on there
   (famous finds, special items, events and puzzles; a red wax seal when met), numbered across the whole scroll, and the
   embedded finds dug there ("x / N lelet"). Layers nobody has reached yet still list what awaits, dimmed. The bottom
   roller holds what is still rolled up: it thins as more clauses are met. The contract's small print (Thorin and
   Company's letter in the book, ch. 2, paraphrased) closes every chapter, the funeral-expenses line among it.
   Every entry reads the real game state (NOTES-9-journal and NOTES-25 list the sources); nothing is invented.
   Cost: nothing per frame while closed except a timer; the state is gathered at most once a second (2.5 times a second
   while a page is open) and the page's DOM is rebuilt only when it is opened, paged, or something on it changed.
   "The scroll unrolls further" (TERV 0.11/17; NOTES-19-ui's ink slip restyled): when an entry gets met or a new layer is
   reached, each player gets a small scroll in his own HUD that unrolls between its rollers while a quill writes the new
   clause and a flourish underlines it; a clause met on an open page gets its wax seal pressed on. CSS animations on one
   element per player, started only on such a change.
   The module keeps its old name (journal.js, `game.journal`, `journalPressed`), so the hooks in other modules stay. ==== */
import { FIND_TYPES } from '../finds.js';
import { LIFT_STOPS } from '../lift.js';
import { LAYER_BOTTOM, LAYER_NAMES, LAYER_TOPS, layerAtDepth } from '../materials.js';
import { CHESTS as HEAVY_CHESTS } from '../coop-actions/rules.js';
import { RUNE_CHESTS } from '../underground/erebor-sites.js';
import { FEASTS } from '../underground/mirkwood-sites.js';
import { deviceOf, glyphs } from './glyphs.js';
import { toRunes } from './runes.js';

const LAYERS = LAYER_TOPS.length;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
/** Seconds between state polls while every journal is closed / while one is open. */
const POLL_CLOSED = 1;
const POLL_OPEN = 0.4;
/** Seconds a freshly ticked row keeps its ink animation class on a (re)rendered page (NOTES-19-ui). */
const FRESH_S = 3;
/** The quill of the ink slip (NOTES-19-ui): a goose feather with its cut nib, drawn in the parchment palette. */
const QUILL = '<svg class="ji-q" viewBox="0 0 40 40" aria-hidden="true"><path d="M5 35C10 22 20 9 36 3c-3 9-10 19-24 27z" fill="#f4ecd8" stroke="#5a3a1a" stroke-width="1.4"/><path d="M5 35L30 8" stroke="#8a6a44" stroke-width="1"/><path d="M5 35l3-6 2 2z" fill="#2a1406"/></svg>';
/** The flourish under the written line: one ink stroke, drawn by its dash offset. */
const FLOURISH = '<svg class="ji-f" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M4 8C40 3 70 12 100 7s60-6 80 0c6 2 10 0 14-4"/></svg>';

/** The contract's heading under the title (who offers it to whom: the book's letter, ch. 2) [ellenőrizendő]. */
const PARTIES = 'Thorin és Társasága · Zsákos Bilbó betörő úr részére';
/**
 * The small print: free paraphrases of Thorin and Company's letter (A hobbit, ch. 2; the film's contract has the same
 * funeral clause) [ellenőrizendő: the published Hungarian wording was not checked]. The first two head chapter I,
 * the funeral line closes every chapter.
 */
const TERMS = [
  'Fizetés átadáskor: a teljes nyereség (ha lesz) legfeljebb tizennegyed része.',
  'Az útiköltséget a Társaság minden esetben állja.',
];
const FUNERAL = 'Temetési költségek: ha netán szükség lesz rájuk, és másként nem intézik el, a Társaság vagy megbízottai viselik.';

const trophy = (id) => (s) => s.trophies.has(id);
const FAMOUS = 'híres lelet · Zsáklak vitrinjébe kerül';

/**
 * What can be obtained per layer (index = layer). `get(s)` returns true/false or [n, N] from the gathered state `s`
 * (gather() below). `hide(s)`: the clause stays off the scroll while it returns true (the secret ending). Only things
 * that exist in the code; the lift stops are appended from lift.js LIFT_STOPS.
 */
const ENTRIES = [
  // 1. Zsáklak kertje: its finds (and the surface stop, which is always there); Bag End's home events
  //    (home-events/, NOTES-14-bagend-events).
  [
    { label: 'Gandalf betoppan', note: 'kényelmes otthon kell hozzá', get: (s) => !!s.home.g },
    { label: 'Váratlan vendégség', note: 'Gandalf jele után · nagyon kényelmes otthon', get: (s) => !!s.home.p },
    { label: 'Bilbó születésnapja', note: 'szeptember 22. (a 6., 18., 30. … nap)', get: (s) => !!s.home.b },
    { label: 'Lobelia rajtakapva', note: 'az ezüstkanalaknál', get: (s) => !!s.home.l?.c },
  ],
  // 2. Hobbitüregek és pincék: the two-lever dwarf door (underground/coop.js, TERV 0.5 "Csak co-opban").
  [
    { label: 'A kétkaros törpeajtó', note: 'csak ketten nyitható · mögötte egy ládányi érme', get: (s) => !!s.coop.torpeajto },
  ],
  // 3. A trollok barlangja: Sting (enemies/sting.js), Glamdring (finds.js, NOTES-22-secret), the rune door with two
  //    keys (underground/coop.js).
  [
    { label: 'Fullánk', note: 'a trollok zsákmánya között · a megtalálóé marad', get: (s) => s.sting },
    { label: 'Glamdring', note: FAMOUS, get: trophy('glamdring') },
    { label: 'A rúnás kőajtó', note: 'csak ketten nyitható · mögötte a trollok aranyfazekai', get: (s) => !!s.coop.runaajto },
  ],
  // 4. Goblinváros: Bilbo's brass buttons, the famous find (finds.js `gombok`).
  [
    { label: 'Bilbó réz gombjai', note: FAMOUS, get: trophy('gombok') },
  ],
  // 5. Gollam tava: the Ring and the riddle game (gollum/).
  [
    { label: 'A Gyűrű', note: 'a megtalálóé marad', get: (s) => s.ringFound },
    { label: 'Találós játék Gollammal', note: 'nyerd meg a sziget előtti parton', get: (s) => s.riddleWins > 0 },
  ],
  // 6. Bakacsinerdő gyökerei: Orkrist, the feast clearings (underground/mirkwood-fx.js), the cell and the barrels
  //    (mirkwood-foes/; recorded by this journal, see mark()).
  [
    { label: 'Orkrist', note: FAMOUS, get: trophy('orkrist') },
    { label: 'A tündék lakomáinak kincse', note: 'lopakodva közelíts', get: (s) => [s.feasts, FEASTS.length] },
    { label: 'Szökés a Tünde-király börtönéből', note: '', get: (s) => s.marks.has('cella') },
    { label: 'Hordós szökés a folyón', note: 'a pince csapóajtajától', get: (s) => s.marks.has('hordo') },
  ],
  // 7. Tóváros alatt: Girion's emeralds, the Master's hoard (underground/laketown-fx.js).
  [
    { label: 'Girion smaragdjai', note: FAMOUS, get: trophy('girion') },
    { label: 'A Polgármester rejtett kincse', note: 'egy korhadt csapóajtó alatt', get: (s) => s.ltHoard },
  ],
  // 8. Erebor tárnái: the harps, the mithril shirt (underground/erebor-fx.js), the moon letters (ui/map.js, NOTES-25),
  //    Thrór's key, Durin's door, the treasure room, the rune chests (erebor-puzzles/), the heavy chests carried by two
  //    (coop-actions/, NOTES-23), the thrush's secret (finale/).
  [
    { label: 'A törpék hárfái', note: FAMOUS, get: trophy('harfak') },
    { label: 'Mithrilpáncél', note: 'a megtalálóé marad', get: (s) => s.mithril },
    { label: 'Thrór térképének holdbetűi', note: 'csak sarlós holdnál olvashatók · Térkép', get: (s) => s.marks.has('holdbetuk') },
    { label: 'Thrór kulcsa', note: 'az ajtó előtt, a földben', get: (s) => !!s.ep.key || s.trophies.has('thror-kulcs') },
    { label: 'Durin ajtaja', note: 'a lenyugvó nap fénye a kulcslyukon', get: (s) => !!s.ep.door },
    { label: 'A kincseskamra Durin ajtaja mögött', note: '', get: (s) => !!s.ep.room },
    { label: 'Rúnazáras törpeládák', note: '', get: (s) => [(s.ep.chests || []).length, RUNE_CHESTS.length] },
    { label: 'Nehéz törpeládák', note: 'Beorn szabálya: kettesével gyertek', get: (s) => [s.heavy, HEAVY_CHESTS.length] },
    { label: 'Szmaug csupasz foltja', note: 'a rigó elárulja, vagy Szmaug maga mutatja meg', get: (s) => s.patch },
  ],
  // 9. Szmaug kincstára: the Arkenstone (hoard/), the black arrow and the end of the adventure (finale/), Thrór's
  //    throne room and the secret ending (secret/, NOTES-22-secret; "Oda és vissza" stays hidden until the room opens).
  [
    { label: 'Az Arkenkő', note: FAMOUS, get: (s) => s.ark || s.trophies.has('arkenko') },
    // NOTES-16-smaug-talk: the conversation and Smaug's doubt about the dwarves (hoard/talk.js marks both).
    { label: 'Beszélgetés Szmauggal', note: 'Bilbó a Gyűrűvel, rejtvényes címekkel', get: (s) => s.marks.has('szmaug') },
    { label: 'Szmaug kételyt ébreszt', note: '„Gondoltak a törpék rá, hogyan viszed haza a részedet?”', get: (s) => s.marks.has('szmaug-ketely') },
    { label: 'A fekete nyíl: Szmaug lezuhan', note: '', get: (s) => s.slain },
    { label: 'Ünnep és hazatérés', note: 'a kaland vége', get: (s) => s.done },
    { label: 'Thrór trónterme', note: 'minden híres lelet után · a kincstár mögött', get: (s) => s.secretOpen },
    { label: 'Oda és vissza', note: 'a titkos befejezés', get: (s) => s.secretSeen, hide: (s) => !s.secretOpen },
  ],
];

// The barrel lift's stops (lift.js), each on the page of the layer it serves (the surface stop always exists).
for (const st of LIFT_STOPS) {
  if (!st.depth) continue;
  ENTRIES[layerAtDepth(st.depth)].push({ label: 'Hordólift-megálló', note: `${st.depth} m`, get: (s) => s.lift.has(st.id), lift: true });
}

/** The sellable find types of each layer (not the famous or kept ones), by value. */
const TYPES = Array.from({ length: LAYERS }, (_, l) => FIND_TYPES.filter((f) => f.layer === l && !f.famous && !f.keep).sort((a, b) => a.value - b.value));

/** The pad's View (Back) button: two overlapping windows, as on the controller. */
const VIEW = '<span class="pb pt jn-view"><svg viewBox="0 0 16 12" aria-hidden="true"><rect x="1" y="1" width="9" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="5.5" y="4" width="9.5" height="7" rx="1.6" fill="currentColor"/></svg></span>';
const key = (t) => `<span class="k${t.length > 2 ? ' kw' : ''}">${t}</span>`;

/** The journal key of a binding (input.js `journalPressed`). `shared`: an F2 player owns J, so player 1 uses Tab. */
export function journalKeyHtml(binding, shared) {
  const dev = deviceOf(binding);
  if (dev === 'keys2') return key('N');
  if (dev === 'pad') return VIEW;
  return shared ? key('Tab') : key('J');
}

/* The roller: a turned wooden rod with knobs at both ends (shared by the scroll and the slip). */
const ROD = 'linear-gradient(#2a1406, #7a4a22 22%, #c08a50 48%, #8a5428 70%, #2a1406)';
const KNOB = 'radial-gradient(circle at 40% 35%, #e8b878, #9a5e26 55%, #3a1e0c)';
const PARCH = 'radial-gradient(ellipse at 50% 45%, #0000 55%, #6a4a2240 100%), var(--tx-parch) center / cover, #e8d6ac';

const CSS = `
.journal { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(92cqw, 47em); max-height: 96cqh;
  display: none; z-index: 9; pointer-events: none; padding: 0.62em 0 calc(var(--roll, 1.2em) / 2 + 0.1em); color: var(--ink-dark); font-family: var(--f-text); font-size: 0.92em; line-height: 1.22; }
.journal.on { display: block; }
/* the rollers: the top one carries the scroll; the bottom one holds what is still rolled up (--roll: its thickness) */
.jn-rod { position: absolute; left: -0.35em; right: -0.35em; z-index: 2; height: 0.95em; border-radius: 0.45em; background: ${ROD}; box-shadow: 0 0.18em 0.4em #000b; }
.jn-rod::before, .jn-rod::after { content: ''; position: absolute; top: 50%; width: 0.95em; height: 1.45em; border-radius: 45%; transform: translateY(-50%); background: ${KNOB}; box-shadow: 0 0.1em 0.3em #000a; }
.jn-rod::before { left: -0.7em; }
.jn-rod::after { right: -0.7em; }
.jn-rod.top { top: 0; }
.jn-rod.bot { top: calc(100% - var(--roll, 1.2em)); height: var(--roll, 1.2em); border-radius: calc(var(--roll, 1.2em) / 2);
  background: linear-gradient(#5a3a16, #c8ae7a 18%, #f2e4c0 46%, #d8c08e 70%, #5a3a16); }
.jn-rod.bot::before, .jn-rod.bot::after { height: calc(var(--roll, 1.2em) + 0.5em); }
.jn-sheet { position: relative; display: flex; flex-direction: column; max-height: calc(96cqh - 0.75em - var(--roll, 1.2em) / 2); overflow: hidden; padding: 0.95em 1.35em calc(var(--roll, 1.2em) / 2 + 0.45em); background: ${PARCH};
  box-shadow: 0 0.4em 1.6em #000d, inset 0 0 3em #7a5a2a66; border-left: 1px solid #8a6a3a66; border-right: 1px solid #8a6a3a66; }
.jn-sheet::before { content: ''; position: absolute; inset: 0.55em 0.42em; border: 1px solid #5a3a1a99; pointer-events: none;
  box-shadow: inset 0 0 0 0.16em #0000, inset 0 0 0 calc(0.16em + 1px) #5a3a1a55; }
/* opening: the parchment unrolls downwards and the bottom roller travels with it */
.journal.on .jn-sheet { animation: jn-unroll 0.55s ease-out both; }
.journal.on .jn-rod.bot { animation: jn-roll 0.55s ease-out both; }
@keyframes jn-unroll { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes jn-roll { from { top: 0.1em; } }
.jn-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.6em; font-family: var(--f-head); font-size: 0.86em; color: #6a4a2a; }
.jn-top b { font-family: var(--f-title); font-weight: normal; font-size: 1.15em; color: #5a2a0a; letter-spacing: 0.02em; white-space: nowrap; }
.jn-top > span { white-space: nowrap; }
.jn-top .jn-par { flex: 1; min-width: 0; text-align: center; font-style: italic; font-family: var(--f-text); font-size: 0.92em; color: #6a5034; overflow: hidden; text-overflow: ellipsis; }
.jn-title { text-align: center; margin: 0.1em 0 0.3em; }
.jn-ru { font-family: var(--f-rune); font-size: 0.95em; letter-spacing: 0.12em; color: #8a2414; }
.jn-nm { font-family: var(--f-head); font-size: 1.6em; line-height: 1.1; color: #3a1a08; }
.jn-nm i { font-style: normal; font-family: var(--f-title); color: #8a2414; margin-right: 0.35em; font-size: 0.8em; }
.jn-st { font-size: 0.9em; color: #5a4028; font-style: italic; }
.jn-st .yes { color: #2f5a1a; font-style: normal; font-family: var(--f-head); }
.jn-st .no { color: #7a2a10; font-style: normal; font-family: var(--f-head); }
.jn-pre { margin: 0.1em 6% 0.25em; text-align: center; font-size: 0.78em; font-style: italic; color: #5a4028; }
.jn-rule { height: 0; border-top: 1px solid #5a3a1a66; margin: 0.25em 8% 0.4em; position: relative; }
.jn-rule::after { content: '᛫᛫᛫'; position: absolute; left: 50%; top: -0.62em; transform: translateX(-50%); padding: 0 0.4em; font-family: var(--f-rune); font-size: 0.8em;
  color: #8a2414; background: #dcc79a; border-radius: 0.3em; }
/* NOTES-31 (queue item 18): the sheet is a column whose body gives way, so the footer (progress, keys) always stays on
   the parchment above the bottom roller; short viewports (720p, small windows, the halves of a split screen) compact
   the page so that the body fits too: one line per clause, no rune line or legend, the small print on one line. */
.jn-in { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.jn-in > * { flex: none; }
.jn-in > .jn-body { flex: 0 1 auto; min-height: 0; overflow: hidden; }
.jn-body { display: grid; grid-template-columns: 1fr; gap: 0.35em 1.4em; }
@container hud (min-aspect-ratio: 5 / 4) { .jn-body { grid-template-columns: 1.55fr 1fr; } }
@container hud (max-height: 820px) {
  .jn-sheet { padding-top: 0.75em; padding-left: 1.2em; padding-right: 1.2em; }
  .jn-row .jn-l { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .jn-leg { display: none; }
  .jn-fine { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.25em; }
  .jn-pre { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
@container hud (max-height: 640px) {
  .journal { font-size: 0.86em; }
  .jn-ru { display: none; }
  .jn-nm { font-size: 1.3em; }
  .jn-title { margin: 0 0 0.15em; }
  .jn-rule { margin: 0.15em 8% 0.3em; }
  .jn-row { padding: 0; line-height: 1.18; }
  .jn-types { line-height: 1.15; }
}
@container hud (max-height: 420px) {
  .journal { font-size: 0.95em; padding-top: 0.5em; }
  .jn-top .jn-par, .jn-pre { display: none; }
  .jn-st { font-size: 0.82em; }
  .jn-foot { margin-top: 0.2em; }
}
.jn-h { font-family: var(--f-head); font-size: 0.98em; color: #5a2a0a; margin: 0 0 0.2em; border-bottom: 1px dotted #5a3a1a77; }
.jn-row { display: flex; align-items: baseline; gap: 0.4em; padding: 0.05em 0; }
.jn-no { flex: none; min-width: 2.1em; font-family: var(--f-head); font-size: 0.82em; color: #8a2414; white-space: nowrap; }
/* the seal: an empty dashed ring while open, a red wax seal with Bilbo's B rune once met */
.jn-box { flex: none; position: relative; width: 0.92em; height: 0.92em; border: 0.08em dashed #6a4a2aaa; border-radius: 50%; transform: translateY(0.14em); }
.jn-row.done .jn-box { border: 0; background: radial-gradient(circle at 36% 30%, #d85a40, #921e10 58%, #5a0a04); box-shadow: 0 0.06em 0.14em #0008, 0 0 0 0.06em #7a160c66; }
.jn-row.done .jn-box::after { content: 'ᛒ'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--f-rune); font-size: 0.68em; color: #f6d0b0cc; }
.jn-l { flex: 1; min-width: 0; }
.jn-l small { font-style: italic; font-size: 0.82em; color: #6a5034; }
.jn-l > span { color: #5a4630; }
.jn-row.done .jn-l > span { color: #2a1406; }
.jn-row.lift .jn-l > span { color: #5a4630; }
.jn-n { flex: none; font-family: var(--f-head); font-size: 0.9em; color: #5a2a0a; white-space: nowrap; }
.jn-none { font-style: italic; color: #6a5034; font-size: 0.9em; }
.jn-cnt { display: flex; align-items: center; gap: 0.5em; margin: 0.1em 0 0.25em; }
.jn-cnt b { font-family: var(--f-head); font-weight: normal; font-size: 1.12em; color: #3a1a08; white-space: nowrap; }
.jn-bar { flex: 1; height: 0.38em; border: 1px solid #5a3a1a99; border-radius: 0.2em; overflow: hidden; background: #fff3; }
.jn-bar i { display: block; height: 100%; background: linear-gradient(#c89a3a, #8a5a1a); }
.jn-types { columns: 12em 2; column-gap: 1em; font-size: 0.84em; line-height: 1.25; }
.jn-types div { break-inside: avoid; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jn-types em { font-style: normal; color: #7a5a2a; font-size: 0.92em; }
.jn-types .g { color: #8a5a10; }
.jn-leg { font-size: 0.74em; font-style: italic; color: #6a5034; margin-top: 0.15em; }
.journal.far .jn-body, .journal.far .jn-nm { opacity: 0.5; filter: sepia(0.4); }
.jn-fine { margin: 0.4em 4% 0; padding-top: 0.2em; border-top: 1px dotted #5a3a1a77; text-align: center; font-size: 0.72em; font-style: italic; color: #5a4028; }
.jn-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.8em; margin-top: 0.35em; font-size: 0.8em; color: #5a4028; }
.jn-knots { display: flex; align-items: center; }
.jn-knots span { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 1.25em; height: 1.25em; margin-right: 0.55em;
  border-radius: 50%; border: 0.1em solid #5a3a1a; font-family: var(--f-head); font-size: 0.8em; color: #5a3a1a; background: #f3e6c4aa; }
.jn-knots span + span::before { content: ''; position: absolute; right: 100%; top: 50%; width: 0.6em; border-top: 0.1em dotted #5a3a1a99; }
.jn-knots .r { background: #5a3a1a; color: #f3e6c4; }
.jn-knots .c { box-shadow: 0 0 0 0.14em #8a2414; }
.jn-prog { font-family: var(--f-head); white-space: nowrap; color: #5a2a0a; }
.jn-keys { display: flex; align-items: center; gap: 0.3em; white-space: nowrap; }
.jn-keys .k, .jn-keys .pb { font-size: 0.95em; }
.jn-view svg { width: 1em; height: 0.8em; }
/* NOTES-19-ui / NOTES-25: a freshly met clause gets its seal pressed on, the ink of its line is still wet. */
.jn-row.ink .jn-box { animation: jn-seal 0.7s cubic-bezier(0.3, 1.6, 0.5, 1) both; }
.jn-row.ink .jn-l > span { animation: jn-wet 2.4s ease-out both; }
@keyframes jn-seal { from { opacity: 0; transform: translateY(0.14em) scale(1.9) rotate(-20deg); } }
@keyframes jn-wet { from { color: #0a0402; text-shadow: 0 0 0.25em #3a1a0855; } }
/* NOTES-19-ui, restyled (NOTES-25): the little scroll that unrolls with the new clause. */
.jink { position: absolute; left: 50%; top: 0.9em; z-index: 8; display: none; max-width: min(46cqw, 26em); padding: 0.5em 0 0.62em; text-align: center;
  pointer-events: none; color: var(--ink-dark); transform: translateX(-50%) rotate(-1deg); }
.jink.on { display: block; animation: ji-in 0.3s ease-out both, ji-out 0.6s ease-in 4.8s forwards; }
.ji-sheet { position: relative; padding: 0.38em 1.1em 0.35em; background: var(--tx-parch) center / cover, #e8d6ac; box-shadow: 0 0.25em 0.9em #000b, inset 0 0 1.4em #7a5a2a66;
  border-left: 1px solid #8a6a3a66; border-right: 1px solid #8a6a3a66; }
.jink.on .ji-sheet { animation: jn-unroll 0.5s ease-out 0.1s both; }
.ji-rod { position: absolute; left: -0.3em; right: -0.3em; top: 0; height: 0.62em; z-index: 1; border-radius: 0.3em; background: ${ROD}; box-shadow: 0 0.12em 0.3em #000a; }
.ji-rod::before, .ji-rod::after { content: ''; position: absolute; top: 50%; width: 0.6em; height: 0.95em; border-radius: 45%; transform: translateY(-50%); background: ${KNOB}; }
.ji-rod::before { left: -0.45em; }
.ji-rod::after { right: -0.45em; }
.ji-rod.b { top: calc(100% - 0.72em); height: 0.72em; background: linear-gradient(#5a3a16, #d8c08e 30%, #f2e4c0 50%, #c8ae7a 75%, #5a3a16); }
.jink.on .ji-rod.b { animation: ji-roll 0.5s ease-out 0.1s both; }
@keyframes ji-roll { from { top: 0; } }
.ji-h { font-family: var(--f-head); font-size: 0.72em; color: #7a4a22; letter-spacing: 0.03em; white-space: nowrap; }
.ji-w { position: relative; display: inline-block; max-width: 100%; }
.ji-t { display: block; font-family: var(--f-head); font-size: 1.12em; line-height: 1.15; color: #2a1406; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ji-t i { font-style: normal; font-family: var(--f-title); color: #8a2414; margin-right: 0.3em; font-size: 0.85em; }
.jink.on .ji-t { animation: ji-write 1.5s steps(24, end) 0.65s both; }
.ji-q { position: absolute; top: -0.9em; width: 1.5em; height: 1.5em; left: 0; opacity: 0; }
.jink.on .ji-q { animation: ji-quill 1.5s steps(24, end) 0.65s both; }
.ji-f { display: block; width: 100%; height: 0.55em; margin-top: 0.05em; }
.ji-f path { fill: none; stroke: #6a2a10; stroke-width: 1.6; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
.jink.on .ji-f path { animation: ji-flourish 0.7s ease-out 2.15s forwards; }
.ji-more { font-size: 0.7em; font-style: italic; color: #6a5034; }
@keyframes ji-in { from { opacity: 0; transform: translateX(-50%) translateY(-0.4em) rotate(-1deg); } }
@keyframes ji-out { to { opacity: 0; transform: translateX(-50%) translateY(-0.3em) rotate(-1deg); } }
@keyframes ji-write { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes ji-quill { 0% { left: 0; opacity: 1; transform: rotate(0deg); } 50% { transform: rotate(-8deg) translateY(-0.1em); } 92% { opacity: 1; } 100% { left: 100%; opacity: 0; transform: rotate(4deg); } }
@keyframes ji-flourish { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { .journal.on .jn-sheet, .journal.on .jn-rod.bot, .jink.on .ji-sheet, .jink.on .ji-rod.b { animation: none; } }
`;

function injectCss() {
  if (document.getElementById('journal-style')) return;
  const st = document.createElement('style');
  st.id = 'journal-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

export class Journal {
  constructor(game) {
    this.game = game;
    /**
     * Events the modules do not save themselves (mirkwood-foes/: 'cella' the cell escape, 'hordo' the barrel ride;
     * hoard/talk.js: 'szmaug', 'szmaug-ketely'; ui/map.js: 'holdbetuk' the moon letters read).
     */
    this.marks = new Set();
    /**
     * NOTES-31-handbook: the find kinds that have been in a player's bag (polled with the state, at most once a second),
     * so the handbook keeps describing a find after it was sold. Saved as the optional `seen` list of this journal's
     * save object; a save without it starts empty (the handbook also derives finds from the rest of the save).
     */
    this.seen = new Set();
    this.ui = new Map(); // player → { root, box, inner, open, page, html }
    this.t = POLL_CLOSED; // poll at the first update
    this.view = null; // the last gathered values (refresh())
    this.sig = '';
    this.ticks = -1; // ticked entries at the last poll (-1: not polled yet)
    this.hintPending = false; // NOTES-25: the first-tick hint waits while another hint is on screen
    // NOTES-19-ui: the ink slip. Done flags per entry and the reached layer count at the last poll (null: no baseline).
    this.prevDone = null;
    this.prevReached = -1;
    this.fresh = new Map(); // 'layer:index' → time (s, performance.now) it got ticked, for the page's ink class
    this.inked = []; // the last slip shown (QA): [{ kind, layer, text }]
    // Embedded finds per layer (finds.js items, by their type's layer; the famous ones are entries, not counted).
    this.findIdx = Array.from({ length: LAYERS }, () => []);
    (game.finds?.items || []).forEach((it, i) => {
      if (!it.type.famous && it.type.layer >= 0 && it.type.layer < LAYERS) this.findIdx[it.type.layer].push(i);
    });
  }

  state() {
    // NOTES-38-finders: Balin's layer maps and the lamp shimmer tier ride in this object as the optional `finders` field
    // (finders.js state(); absent when nothing was bought, and a save without it starts with none).
    const finders = this.game.finders ? this.game.finders.state() : this.findersSave;
    if (!this.marks.size && !this.seen.size && !finders) return undefined;
    const out = { marks: [...this.marks] };
    if (this.seen.size) out.seen = [...this.seen]; // NOTES-31-handbook (optional field)
    if (finders) out.finders = finders;
    return out;
  }

  restore(s) {
    // NOTES-38-finders: kept for finders.js (created later, with the first player: findersOf reads it).
    if (s?.finders && typeof s.finders === 'object') this.findersSave = s.finders;
    for (const m of s?.marks || []) this.marks.add(m);
    for (const id of s?.seen || []) if (typeof id === 'string') this.seen.add(id);
  }

  /** NOTES-31-handbook: records the find kinds now in the players' bags (a few dozen ids, once per poll). */
  noteSeen() {
    for (const p of this.game.players) {
      if (p.choosing) continue;
      for (const f of p.bag || []) if (f?.id && !this.seen.has(f.id)) this.seen.add(f.id);
    }
  }

  /** A module reports an event it does not save itself (the cell escape, the barrel ride, the moon letters). */
  mark(id) {
    if (this.marks.has(id)) return;
    this.marks.add(id);
    this.t = POLL_CLOSED; // poll on the next frame
  }

  isOpen(p) {
    return !!this.ui.get(p)?.open;
  }

  /** The deepest depth anyone has reached: the players' maxDepth (lift.js), the save's absent slots, the built stops. */
  deepest() {
    const game = this.game;
    let d = 0;
    for (const p of game.players) if (!p.choosing) d = Math.max(d, p.maxDepth || 0);
    for (const s of game.save?.slots || []) if (s) d = Math.max(d, s.maxDepth || 0);
    for (const id of game.lift?.built || []) d = Math.max(d, LIFT_STOPS.find((x) => x.id === id)?.depth || 0);
    return d;
  }

  /** The state every entry reads (one object per poll). */
  gather() {
    const g = this.game;
    const sec = g.hoard?.secret;
    return {
      trophies: new Set(g.bagEnd?.trophies || []),
      coop: g.decor?.coop?.state?.() || g.save?.coop || {},
      sting: !!g.enemies?.sting?.owned,
      ringFound: !!g.gollum?.ring?.found,
      riddleWins: g.gollum?.memory?.wins || 0,
      feasts: g.decor?.mirkFx?.feasts ? g.decor.mirkFx.feasts.filter((f) => f.found).length : (g.save?.mirkwood?.feasts || []).filter(Boolean).length,
      marks: this.marks,
      home: g.homeEvents?.state?.() || g.save?.home || {}, // home-events (NOTES-14-bagend-events)
      ltHoard: g.decor?.laketownFx ? !!g.decor.laketownFx.hoardOpen : !!g.save?.laketown?.hoard,
      mithril: g.decor?.ereborFx ? !!g.decor.ereborFx.mithrilTaken : !!g.save?.erebor?.mithril,
      ep: g.ereborPuzzles?.state?.() || {},
      // coop-actions (NOTES-23-coop-actions): the heavy chests opened and rewarded.
      heavy: (g.coopActions?.chests?.list || []).filter((c) => c.rewarded).length,
      patch: !!g.finale?.patch,
      slain: !!g.finale?.slain,
      done: !!g.finale?.done,
      ark: !!g.hoard?.arkTaken,
      // NOTES-22-secret: Thrór's throne room and the secret ending.
      secretOpen: !!sec?.open,
      secretSeen: !!sec?.seen,
      lift: g.lift?.built || new Set(),
    };
  }

  /** Gathers every value shown; returns true when anything changed since the last call. */
  refresh() {
    this.noteSeen();
    const s = this.gather();
    let ticks = 0;
    let clauses = 0;
    const entries = ENTRIES.map((list) => list.map((e) => {
      const v = e.get(s);
      const done = Array.isArray(v) ? v[1] > 0 && v[0] >= v[1] : !!v;
      const hidden = !!e.hide?.(s);
      if (!hidden) clauses++;
      if (done && !e.lift) ticks++;
      return { e, v, done, hidden };
    }));
    // The clauses' running numbers across the whole scroll (the visible ones), and how many are met.
    const base = [];
    let n = 0;
    let met = 0;
    for (const list of entries) {
      base.push(n);
      for (const x of list) {
        if (x.hidden) continue;
        n++;
        if (x.done) met++;
      }
    }
    const items = this.game.finds?.items || [];
    const finds = this.findIdx.map((idx) => {
      let k = 0;
      for (const i of idx) if (items[i].taken) k++;
      return k;
    });
    const deepest = Math.round(this.deepest());
    this.view = { entries, finds, deepest, ticks, base, clauses, met };
    this.detectInk(entries, deepest);
    const sig = `${deepest}|${finds.join(',')}|${entries.map((l) => l.map((x) => (x.hidden ? 'h' : Array.isArray(x.v) ? x.v.join('/') : x.done ? 1 : 0)).join('')).join(':')}`;
    const changed = sig !== this.sig;
    this.sig = sig;
    return changed;
  }

  /** The running number of a clause (QA and the slip): its position among the visible clauses of the scroll. */
  clauseNo(layer, index) {
    const v = this.view;
    if (!v) return 0;
    let n = v.base[layer];
    for (let k = 0; k <= index; k++) if (!v.entries[layer][k].hidden) n++;
    return n;
  }

  /** Per frame (cheap): polls the state now and then, rebuilds open pages that changed, gives the first-tick hint. */
  update(dt) {
    const game = this.game;
    // Players who left: forget their pages (their HUD element went with them).
    for (const [p, u] of this.ui) {
      if (!game.players.includes(p)) {
        u.box.remove();
        this.ui.delete(p);
      }
    }
    let anyOpen = false;
    for (const u of this.ui.values()) anyOpen ||= u.open;
    this.t += dt;
    if (this.t < (anyOpen ? POLL_OPEN : POLL_CLOSED)) return;
    this.t = 0;
    if (game.players.every((p) => p.choosing)) return;
    const changed = this.refresh();
    const ticks = this.view.ticks;
    if ((this.ticks >= 0 && ticks > this.ticks) || this.hintPending) this.firstTickHint();
    this.ticks = ticks;
    if (changed && anyOpen) {
      for (const [p, u] of this.ui) if (u.open) this.render(p);
    }
  }

  /**
   * NOTES-19-ui: compares the poll with the last one; a newly met entry (not a lift stop) or a newly reached layer
   * unrolls the slip for every player. The first poll only sets the baseline (a loaded save writes nothing).
   */
  detectInk(entries, deepest) {
    const reached = LAYER_TOPS.filter((t, k) => k === 0 || deepest >= t).length;
    const done = entries.map((l) => l.map((x) => x.done));
    if (!this.prevDone) {
      this.prevDone = done;
      this.prevReached = reached;
      return;
    }
    const now = performance.now() / 1000;
    const news = [];
    entries.forEach((l, li) => l.forEach((x, k) => {
      if (x.done && !this.prevDone[li][k] && !x.e.lift && !x.hidden) {
        news.push({ kind: 'entry', layer: li, text: x.e.label, no: this.clauseNo(li, k) });
        this.fresh.set(`${li}:${k}`, now);
      }
    }));
    if (reached > this.prevReached) {
      const l = reached - 1; // the deepest newly reached layer gets the slip: its chapter is new
      news.unshift({ kind: 'layer', layer: l, text: LAYER_NAMES[l] || `${l + 1}. réteg` });
    }
    this.prevDone = done;
    this.prevReached = Math.max(this.prevReached, reached);
    if (news.length) this.ink(news);
  }

  /** Unrolls one slip in each present player's HUD with the first news ("és még n pont" under it). */
  ink(news) {
    const game = this.game;
    const first = news[0];
    const head = first.kind === 'layer' ? 'Új fejezet a szerződésben' : 'A szerződés tovább gördül';
    const line = first.kind === 'layer' ? `<i>${ROMAN[first.layer]}.</i>${first.text}` : `<i>§ ${first.no}.</i>${first.text}`;
    const more = news.length > 1 ? `<div class="ji-more">és még ${news.length - 1} pont</div>` : '';
    const html = `<i class="ji-rod"></i><div class="ji-sheet"><div class="ji-h">${head}</div><div class="ji-w"><span class="ji-t">${line}</span>${QUILL}${FLOURISH}</div>${more}</div><i class="ji-rod b"></i>`;
    this.inked = news.map((n) => ({ kind: n.kind, layer: n.layer, text: n.text }));
    injectCss();
    game.players.forEach((p, i) => {
      if (p.choosing) return;
      const hudIn = game.huds[i]?.el?.querySelector('.hud-in');
      if (!hudIn) return;
      let el = hudIn.querySelector(':scope > .jink');
      if (!el) {
        el = document.createElement('div');
        el.className = 'jink';
        el.addEventListener('animationend', (ev) => {
          if (ev.animationName === 'ji-out') el.classList.remove('on');
        });
        hudIn.appendChild(el);
      }
      el.innerHTML = html;
      // Restart without a synchronous layout (it was `void el.offsetWidth`; NOTES-29-final): a slip still showing has
      // its running animations restarted, a hidden one (the end of ji-out removes `on`) simply starts.
      if (el.classList.contains('on')) {
        for (const a of el.getAnimations()) {
          a.cancel();
          a.play();
        }
      } else el.classList.add('on');
    });
  }

  /** One parchment hint per player, with his own journal key, the first time an entry gets met (tutorial.js hint). */
  firstTickHint() {
    const game = this.game;
    const shared = game.bindings.some((b) => b.kbm === 'keys2');
    this.hintPending = false;
    game.players.forEach((p, i) => {
      if (p.choosing || game.tutorial?.done?.has(`naplo-${i}`)) return;
      // NOTES-25: a hint already on screen (e.g. the moon letters' Durin hint) is not replaced; this one waits.
      if (game.tutorial?.hints?.has(p)) {
        this.hintPending = true;
        return;
      }
      const k = journalKeyHtml(game.bindings[i], shared);
      game.tutorial?.hint?.(i, p, `naplo-${i}`, `<b style="color:var(--gold,#e8c070)">A szerződés.</b> Teljesült egy pont a szerződésben! Nyisd meg a tekercset (${k}): rétegenként mutatja, mit szereztetek már meg, és mi vár még rátok a mélyben.`, 10);
    });
  }

  /** True when the player cannot open the journal now (held by a ride, a sleep, a spider, the barrels, death …). */
  busy(p) {
    return p.choosing || p.dead > 0 || p.riding || p.asleep || p.barrel || p.captured || p.wrap || p.cocoon;
  }

  /**
   * While a page is open it holds the player like a menu (game.js asks this first, after the finale's held scenes):
   * back or the journal key closes it, left/right or up/down pages. Returns true while open.
   */
  held(p, i, it) {
    const u = this.ui.get(p);
    if (!u?.open) return false;
    if (this.busy(p)) {
      this.close(p);
      return false;
    }
    if (it.backPressed || it.journalPressed) {
      this.close(p);
      return true; // this frame's back press is spent on the journal
    }
    const step = (it.rightPressed || it.downPressed ? 1 : 0) - (it.leftPressed || it.upPressed ? 1 : 0);
    if (step) {
      u.page = (u.page + step + LAYERS) % LAYERS;
      this.render(p);
    }
    return true;
  }

  /** The journal key with no other menu open (game.js asks this where the player walks freely): opens his page. */
  tryOpen(p, i, it) {
    if (!it.journalPressed || this.busy(p)) return false;
    this.open(p, p.depth > 0.5 ? layerAtDepth(p.depth) : 0);
    return true;
  }

  open(p, page = 0) {
    const game = this.game;
    const i = game.players.indexOf(p);
    const el = game.huds[i]?.el;
    if (!el) return;
    injectCss();
    let u = this.ui.get(p);
    if (!u || u.root !== el) {
      u?.box.remove();
      u = { root: el, box: document.createElement('div'), inner: null, open: false, page: 0, html: '' };
      u.box.className = 'journal';
      // The rollers and the sheet stay; only the sheet's content is rewritten (so a refresh does not unroll it again).
      u.box.innerHTML = '<i class="jn-rod top"></i><div class="jn-sheet"><div class="jn-in"></div></div><i class="jn-rod bot"></i>';
      u.inner = u.box.querySelector('.jn-in');
      (el.querySelector('.hud-in') || el).appendChild(u.box);
      this.ui.set(p, u);
    }
    u.open = true;
    u.page = Math.max(0, Math.min(LAYERS - 1, page));
    this.refresh();
    this.render(p);
    u.box.classList.add('on');
  }

  close(p) {
    const u = this.ui.get(p);
    if (!u) return;
    u.open = false;
    u.box.classList.remove('on');
  }

  /** Writes the player's page (only when its HTML differs from what is shown). */
  render(p) {
    const u = this.ui.get(p);
    if (!u || !this.view) return;
    const game = this.game;
    const i = game.players.indexOf(p);
    const shared = game.bindings.some((b) => b.kbm === 'keys2');
    const g = glyphs(deviceOf(game.bindings[i]), shared);
    const html = this.pageHtml(u.page, g, journalKeyHtml(game.bindings[i], shared));
    if (html === u.html) return;
    u.html = html;
    u.inner.innerHTML = html;
    u.box.classList.toggle('far', u.page > 0 && this.view.deepest < LAYER_TOPS[u.page]);
    // The bottom roller: thick while most of the scroll is still rolled up, thin when most clauses are met.
    const left = this.view.clauses ? 1 - this.view.met / this.view.clauses : 1;
    u.box.style.setProperty('--roll', `${(0.75 + 1.05 * left).toFixed(2)}em`);
  }

  /** One layer's chapter of the scroll. */
  pageHtml(l, g, jkey) {
    const v = this.view;
    const top = LAYER_TOPS[l];
    const bottom = LAYER_TOPS[l + 1] ?? LAYER_BOTTOM;
    const reached = l === 0 || v.deepest >= top;
    const name = LAYER_NAMES[l] || `${l + 1}. réteg`;
    const status = reached
      ? `<span class="yes">Itt már jártatok.</span>${l === LAYERS - 1 || v.deepest < bottom ? ` Legmélyebb pont: ${v.deepest} m.` : ''}`
      : `<span class="no">Ide még senki sem jutott le.</span> Ami itt vár:`;
    const now = performance.now() / 1000;
    let no = v.base[l];
    const rows = v.entries[l].map(({ e, v: val, done, hidden }, k) => {
      if (hidden) return '';
      no++;
      const ink = done && now - (this.fresh.get(`${l}:${k}`) ?? -99) < FRESH_S ? ' ink' : ''; // NOTES-19-ui
      const count = Array.isArray(val) ? `<span class="jn-n">${val[0]} / ${val[1]}</span>` : '';
      const note = e.note ? ` <small>· ${e.note}</small>` : '';
      return `<div class="jn-row${done ? ' done' : ''}${ink}${e.lift ? ' lift' : ''}"><span class="jn-no">§ ${no}.</span><span class="jn-box"></span><span class="jn-l"><span>${e.label}</span>${note}</span>${count}</div>`;
    }).join('') || '<div class="jn-none">Itt nincs különleges kincs vagy kaland, csak a föld leletei.</div>';
    const total = this.findIdx[l].length;
    const dug = v.finds[l];
    const types = TYPES[l].map((f) => `<div>${f.embedded ? '<span class="g">✦</span> ' : ''}${f.name} <em>${f.value} arany</em></div>`).join('');
    const knots = LAYER_TOPS.map((t, k) => `<span class="${k === 0 || v.deepest >= t ? 'r' : ''}${k === l ? ' c' : ''}">${k + 1}</span>`).join('');
    const pre = l === 0 ? `<div class="jn-pre">${TERMS.join(' ')}</div>` : '';
    return `<div class="jn-top"><b>Szerződés</b><span class="jn-par">${PARTIES}</span><span>${ROMAN[l]}. fejezet · ${top}–${bottom} m</span></div>
      <div class="jn-title"><div class="jn-ru">${toRunes(name)}</div><div class="jn-nm"><i>${ROMAN[l]}.</i>${name}</div><div class="jn-st">${status}</div></div>
      ${pre}<div class="jn-rule"></div>
      <div class="jn-body">
        <div><div class="jn-h">A Betörő vállalja</div>${rows}</div>
        <div><div class="jn-h">A föld rejti</div>
          <div class="jn-cnt"><b>${dug} / ${total} lelet</b><span class="jn-bar"><i style="width:${total ? ((dug / total) * 100).toFixed(1) : 0}%"></i></span></div>
          <div class="jn-types">${types}</div>
          <div class="jn-leg">✦ a falban is csillog. A számláló a falba rejtett leleteket méri; a többi ásás közben bukkan elő.</div>
        </div>
      </div>
      <div class="jn-fine">${FUNERAL}</div>
      <div class="jn-foot"><div class="jn-knots">${knots}</div><span class="jn-prog">${v.met} / ${v.clauses} pont teljesítve</span><div class="jn-keys">${g.browse}<span>tekerés</span><span class="or">·</span>${g.back}<span class="or">/</span>${jkey}<span>bezárás</span></div></div>`;
  }
}
