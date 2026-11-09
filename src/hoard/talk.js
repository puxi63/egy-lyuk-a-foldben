/* ==== hoard/talk.js — the conversation with Smaug (TERV 0.11/21 "Beszélgetés Szmauggal"; NOTES-16-smaug-talk).
   The book, ch. 12 "Inside Information": Smaug wakes, smells the invisible Bilbo and talks to him; Bilbo will not give
   his name and answers with riddling titles drawn from his adventures (he who walks unseen, the clue-finder, the
   web-cutter, the stinging fly, chosen for the lucky number, he who buries his friends alive and draws them again from
   the water, came from the end of a bag, friend of bears and guest of eagles, Ringwinner and Luckwearer,
   Barrel-rider). Smaug tries to sow doubt about the dwarves (have they thought how you will carry off your fourteenth
   share?). Bilbo leads him to boast of his armour and so sees the bare patch in the hollow of his left breast.
   THE GAME: when Smaug stirs (the noise meter, hoard/index.js) while Bilbo wears the Ring in the treasury, Smaug
   speaks instead of waking at once. Each round he asks who the thief is; Bilbo picks one of 3–4 answers in his own
   viewport. GOOD answers are the book's titles, offered only when the save shows the deed behind them (the barrel
   ride, the Ring won, a web cut, ...); BAD answers blurt the truth (his name, Bag End, the dwarves) or flatter
   clumsily. A good answer calms the meter and buys time (a lull: noise counts for less afterwards); a bad one raises
   it, and past the waking mark he breathes fire (the existing wake). A last round, while the bare patch is not yet
   known, is his boast: the book's answer shows the patch (the finale's `patch` flag). The partner may whisper a hint
   (the use key) or just watch. Skippable (the back button: Bilbo slips away). The texts are this game's paraphrases;
   the Hungarian translation's wording is unverified ([ellenőrizendő] in NOTES-16-smaug-talk.md).
   Cost: nothing per frame unless a conversation is running (hoard/index.js creates this only then). ==== */
import { deviceOf, glyphs } from '../ui/glyphs.js';

/** Timing (s) and the meter's changes. */
export const TALK = {
  intro: 3.2, // Smaug's opening line
  answerTime: 20, // his patience per round; silence counts as a bad answer
  reply: 3.0, // his reply to an answer
  end: 3.4,
  lock: 0.5, // input ignored this long after the choices appear (the swing that stirred him must not answer)
  rounds: 3, // title rounds (fewer if fewer titles are earned), plus the boast while the bare patch is unknown
  good: -0.14, // a good answer: the meter falls
  bad: 0.24, // a bad one: it rises (past NOISE.wake he breathes fire)
  silent: 0.16,
  lullPer: 12, // seconds of lull per good answer
  lullMax: 45,
  lullFactor: 0.35, // during the lull noise counts this much
  whisper: 0.03, // the partner's whisper (meter units before distance)
  cooldown: 45, // after a conversation (or a skip) he does not talk again for this long
  cooldownFire: 30,
};

/** What the save shows (unlock conditions read the live modules, falling back on the save). */
function deeds(game, speaker) {
  const marks = game.journal?.marks || new Set();
  const ep = game.ereborPuzzles?.state?.() || game.save?.ereborPuzzles || {};
  const home = game.homeEvents?.state?.() || game.save?.home || {};
  const coop = game.decor?.coop?.state?.() || game.save?.coop || {};
  const ring = game.gollum?.ring || {};
  return {
    ring: !!ring.found,
    ringWon: !!ring.won,
    door: !!ep.door || !!ep.key,
    web: marks.has('halo') || marks.has('pok'),
    party: !!home.p,
    dwarfMate: game.players.some((q) => q !== speaker && !q.choosing && q.ch?.id && q.ch.id !== 'bilbo'),
    barrel: marks.has('hordo'),
    trolls: !!game.enemies?.sting?.owned || !!coop.runaajto,
    eagles: marks.has('sasok') || game.players.some((q) => (q.eagleCd || 0) > 0),
  };
}

/**
 * Bilbo's riddling titles (book ch. 12, in the book's order). `ok(d)` is the unlock (d = deeds()); `reply` is Smaug's
 * answer (paraphrased). The wording is the game's own [ellenőrizendő].
 */
export const TITLES = [
  { id: 'lathatatlan', text: 'Az vagyok, aki láthatatlanul jár.', ok: (d) => d.ring, reply: 'Azt elhiszem… de aligha így szólítanak otthon.' },
  { id: 'nyomkereso', text: 'Nyomkereső vagyok.', ok: (d) => d.door, reply: 'Nyomkereső? Szép cím. És milyen nyomot kerestél az én termemben?' },
  { id: 'halovago', text: 'Hálóvágó vagyok, fullánkos légy.', ok: (d) => d.web, reply: 'Hálóvágó, fullánkos légy… Szép címek! De engem nem csípsz meg.' },
  { id: 'szerencseszam', text: 'A szerencseszám kedvéért választottak ki.', ok: (d) => d.party || d.dwarfMate, reply: 'Szép címek! De a szerencseszám nem mindig hoz szerencsét.' },
  { id: 'eltemeto', text: 'Élve temetem el a barátaimat, vízbe fojtom őket, aztán élve húzom ki őket a vízből.', ok: (d) => d.barrel, reply: 'Ez már kevésbé hangzik dicséretesen…' },
  { id: 'zsakvege', text: 'Egy zsák végéből jöttem, de zsák nem került a fejemre.', ok: (d) => d.trolls, reply: 'Zsák… zsák vége… Rejtvényekben beszélsz, tolvaj.' },
  { id: 'sasok', text: 'A medvék barátja vagyok, és a sasok vendége.', ok: (d) => d.eagles, reply: 'Sasok… Hm. Nem szeretem a sasokat.' },
  { id: 'gyuru', text: 'Gyűrűnyerő vagyok és Szerencsehozó.', ok: (d) => d.ringWon, reply: 'Gyűrűnyerő? Szerencsehozó? Kedves nevek… egyre kíváncsibb vagyok.' },
  { id: 'hordolovas', text: 'Hordólovas vagyok.', ok: (d) => d.barrel, reply: 'Hordók! Ebben már van valami. Hordókon jöttél… a tavi emberek küldtek, igaz?' },
];

/** Bad answers: the truth blurted out, or clumsy flattery. `reply` is Smaug's (the meter rises). */
export const BLURTS = [
  { id: 'nev', text: 'Zsákos Bilbó vagyok, Zsáklakból.', reply: 'Zsákos… Zsáklak… Megjegyeztem, tolvaj! Most már tudom, kit keressek!' },
  { id: 'torpek', text: 'Thorinnal és a törpékkel jöttem, hogy visszavegyük a kincsüket.', reply: 'Törpék! Tudtam, hogy törpeszag van itt! Az én kincsemet akarjátok?!' },
  { id: 'hizeleg', text: 'Ó, nagy Szmaug, adj egy kis aranyat, úgyis olyan sok van neked!', reply: 'Az én aranyamból? Egyetlen rézgarast sem, tolvaj!' },
  { id: 'kincs', text: 'Csak egy serlegért jöttem, nem fogod észrevenni.', reply: 'Egy serlegért?! Minden darabot ismerek, tolvaj!' },
];

/** Smaug's lines, round by round (paraphrased from ch. 12). */
const LINES = {
  intro: 'Nocsak, tolvaj! Érzem a szagodat, hallom a lélegzetedet. Gyere csak közelebb!',
  ask: [
    'Ki vagy, és honnan jöttél, ha szabad kérdeznem?',
    'Ügyes beszéd… De mondd meg igazán: ki vagy te?',
    'A törpék küldtek, igaz? Gondoltak-e rá, hogyan viszed haza a tizennegyed részedet? Becsapnak, tolvaj! Na, ki vagy?',
  ],
  boast: 'Engem nem lehet legyőzni! A páncélom tízszeres pajzs, a fogam kard, a karmom lándzsa, a farkam csapása mennykő!',
  boastGood: 'Úgy hallottam, a sárkányok alul puhábbak, főleg a mellük táján.',
  boastBad: 'Rozsdás vaslemezek az egész, semmi több!',
  patch: 'Szmaug büszkén megfordul, és megmutatja gyémántokkal kirakott hasát. „Káprázatos! Hibátlan!” – mondod. De bal mellén, a mélyedésben csupasz folt van, mint egy csiga a házán kívül!',
  boastAngry: 'Rozsdás?! Az én páncélom?!',
  silent: 'Hallgatsz? Majd megszólalsz, ha megpörkölök!',
  endGood: 'Na jó, tolvaj… Pihenek egyet. De a szagodat nem felejtem el!',
  skip: 'Csendben elsurransz…',
};

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** True when player p may hold the conversation: Bilbo wearing the Ring inside the treasury. */
export function canSpeak(game, p, inHoard) {
  return !!p && !p.choosing && p.dead <= 0 && !p.riding && p.ch?.id === 'bilbo' && !!game.gollum?.isInvisible?.(p) && inHoard(p.pos);
}

/* ---------------- the panel's look (NOTES-33-smaug-ui): CSS only, injected once ----------------
   A dark, ember-lit plate in a gold frame (filigree corners with a coin), dragon scales faint in the ground, an eye-coin
   by the title, the round as a badge with coins, Smaug's line set apart, the answers as rows (the chosen one lit like
   embers, with his eye as its bullet), the patience as a burning fuse. Static gradients and shadows only; the only
   animations are transform / opacity on small elements (the fuse's spark). Sized in the HUD's container units, so the
   half-width and the half-height split views scale it; a short, wide view lays the answers out in two columns. */
let talkStyled = false;
function addTalkStyle() {
  if (talkStyled) return;
  talkStyled = true;
  const st = document.createElement('style');
  st.textContent = `
.smaug-talk { position: absolute; left: 50%; bottom: 7%; transform: translateX(-50%); width: min(92%, 37em); box-sizing: border-box; z-index: 7; pointer-events: none;
  font-size: clamp(11px, min(2.4cqw, 3.6cqh), 16px); line-height: 1.28; text-align: center; color: #efdcb4; font-family: var(--f-text, Georgia, serif);
  padding: 0.5em 1.45em 0.45em; border: 0.13em solid #c8a04a; border-radius: 0.45em;
  background:
    radial-gradient(ellipse 75% 60% at 50% 122%, rgba(255, 112, 30, 0.36), rgba(200, 60, 12, 0.12) 55%, rgba(0, 0, 0, 0) 76%),
    radial-gradient(ellipse 80% 55% at 50% -10%, rgba(130, 40, 14, 0.45), rgba(0, 0, 0, 0) 70%),
    radial-gradient(circle at 50% 0, rgba(0, 0, 0, 0) 0.5em, rgba(232, 192, 112, 0.07) 0.53em, rgba(0, 0, 0, 0) 0.62em) 0 0 / 1.1em 0.62em,
    radial-gradient(circle at 50% 0, rgba(0, 0, 0, 0) 0.5em, rgba(232, 192, 112, 0.07) 0.53em, rgba(0, 0, 0, 0) 0.62em) 0.55em 0.31em / 1.1em 0.62em,
    linear-gradient(#26130b, #130906);
  box-shadow: 0 0 0 0.12em #1a0c06, 0 0 0 0.24em #7a5a2a, 0 0.4em 1.3em rgba(0, 0, 0, 0.8), inset 0 0 1.4em rgba(0, 0, 0, 0.75), inset 0 0 0 0.28em rgba(20, 8, 3, 0.55); }
.smaug-talk * { box-sizing: border-box; }
.smaug-talk.watch { width: min(88%, 33em); font-size: clamp(11px, min(2.25cqw, 3.4cqh), 15px); border-color: #9a7a44; box-shadow: 0 0 0 0.12em #1a0c06, 0 0 0 0.22em #5a4426, 0 0.4em 1.2em rgba(0, 0, 0, 0.75), inset 0 0 1.4em rgba(0, 0, 0, 0.8); }
.smaug-talk.angry { border-color: #e0562a; }
.smaug-talk .st-in { position: relative; max-height: 56cqh; overflow: hidden; }
.smaug-talk .st-cn { position: absolute; width: 2.1em; height: 2.1em; color: #d8b060; }
.smaug-talk .st-cn svg { display: block; width: 100%; height: 100%; }
.smaug-talk .st-cn.tl { left: -0.2em; top: -0.2em; }
.smaug-talk .st-cn.tr { right: -0.2em; top: -0.2em; transform: scaleX(-1); }
.smaug-talk .st-cn.bl { left: -0.2em; bottom: -0.2em; transform: scaleY(-1); }
.smaug-talk .st-cn.br { right: -0.2em; bottom: -0.2em; transform: scale(-1, -1); }
.smaug-talk.watch .st-cn { color: #a88a52; }
.st-h { display: flex; align-items: center; justify-content: center; gap: 0.45em; margin: 0 0 0.15em; }
.st-rule { flex: 1 1 0; max-width: 7em; height: 1px; position: relative; background: linear-gradient(90deg, rgba(200, 160, 74, 0), #c8a04a); }
.st-rule.r { background: linear-gradient(90deg, #c8a04a, rgba(200, 160, 74, 0)); }
.st-rule::after { content: ''; position: absolute; right: -0.2em; top: -0.17em; width: 0.36em; height: 0.36em; background: #c8a04a; transform: rotate(45deg); }
.st-rule.r::after { right: auto; left: -0.2em; }
.st-eye { width: 1.45em; height: 1.45em; flex: none; display: block; }
.st-t { font-family: var(--f-head); font-size: 1.2em; color: #f0c870; text-shadow: 0 1px 1px #000, 0 0 0.6em rgba(255, 120, 30, 0.35); white-space: nowrap; }
.smaug-talk.angry .st-t { color: #ff7a48; }
.st-rd { display: inline-flex; align-items: center; gap: 0.35em; flex: none; font-family: var(--f-head); font-size: 0.72em; line-height: 1; color: #2a1608;
  padding: 0.22em 0.55em 0.2em; border-radius: 1em; background: linear-gradient(#f2d488, #c8963a); box-shadow: 0 0 0 1px #6a4a1a, inset 0 1px 0 #fff6; }
.st-pips { display: inline-flex; gap: 0.18em; }
.st-pips i { width: 0.5em; height: 0.5em; border-radius: 50%; background: #6a4a1a; box-shadow: inset 0 1px 1px #0008; }
.st-pips i.on { background: #a8240c; box-shadow: inset 0 0 0 1px #5a1004; }
.st-q { margin: 0.2em -0.6em 0.25em; padding: 0.3em 0.9em 0.35em;
  background: linear-gradient(90deg, rgba(200, 160, 74, 0), rgba(200, 160, 74, 0.55), rgba(200, 160, 74, 0)) top / 100% 1px no-repeat,
    linear-gradient(90deg, rgba(200, 160, 74, 0), rgba(200, 160, 74, 0.55), rgba(200, 160, 74, 0)) bottom / 100% 1px no-repeat,
    linear-gradient(90deg, rgba(110, 20, 8, 0), rgba(110, 22, 8, 0.42) 18%, rgba(110, 22, 8, 0.42) 82%, rgba(110, 20, 8, 0)); }
.st-who { font-family: var(--f-head); font-weight: normal; font-variant: small-caps; letter-spacing: 0.04em; color: #ff5634; text-shadow: 0 0 0.5em rgba(255, 60, 20, 0.45), 0 1px 1px #000; }
.st-say { font-style: italic; font-size: 1.04em; color: #fbecc8; }
.st-n { margin: 0.25em 0; padding: 0.3em 0.6em; font-style: italic; color: #fbecc8; }
.st-tip { font-size: 0.78em; font-style: italic; color: #c8a878; margin: 0 0 0.25em; }
.st-list { display: flex; flex-direction: column; gap: 0.2em; margin: 0 auto; max-width: 34em; }
.st-c { position: relative; text-align: left; padding: 0.18em 0.7em 0.2em 1.85em; border-radius: 0.3em; color: #e6d2a8;
  border: 1px solid rgba(200, 160, 74, 0.26); background: linear-gradient(90deg, rgba(64, 32, 16, 0.8), rgba(40, 20, 10, 0.55)); }
.st-c::before { content: ''; position: absolute; left: 0.62em; top: 50%; width: 0.7em; height: 0.7em; margin-top: -0.35em; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff0b0, #d8a040 45%, #7a5014 85%); box-shadow: 0 0 0 1px #4a3010; }
.st-c.on { color: #fff6dc; font-weight: 600; border-color: #f2c860;
  background: linear-gradient(90deg, rgba(178, 62, 14, 0.92), rgba(110, 30, 8, 0.85) 62%, rgba(66, 18, 6, 0.8));
  box-shadow: inset 0 0 0 1px rgba(255, 224, 150, 0.3), 0 0 0.7em rgba(255, 110, 30, 0.45); }
.st-c.on::before { width: 0.95em; height: 0.75em; left: 0.5em; margin-top: -0.375em; border-radius: 50% / 50%;
  background: radial-gradient(ellipse 14% 62% at 50% 50%, #1a0402 70%, rgba(26, 4, 2, 0) 100%), radial-gradient(ellipse at 50% 50%, #fff2a0, #ffb030 40%, #d0500e 75%, #5a1206);
  box-shadow: 0 0 0 1px #3a0e04, 0 0 0.45em rgba(255, 170, 60, 0.85); }
.st-c.hinted { border-color: rgba(160, 210, 100, 0.7); }
.st-hint { font-size: 0.8em; font-weight: normal; color: #b6dc84; white-space: nowrap; }
.smaug-talk.watch .st-c { padding-top: 0.12em; padding-bottom: 0.14em; color: #cfbb92; background: linear-gradient(90deg, rgba(48, 26, 14, 0.7), rgba(32, 18, 10, 0.45)); }
.smaug-talk.watch .st-c::before { opacity: 0.7; }
.st-bar { position: relative; height: 0.42em; margin: 0.5em 5% 0.2em; border-radius: 0.21em;
  background: repeating-linear-gradient(115deg, #7a5634 0 0.2em, #4e3420 0.2em 0.4em); box-shadow: 0 0 0 1px #1a0c06, inset 0 1px 1px rgba(255, 220, 160, 0.25); }
.st-ash { position: absolute; inset: 0; border-radius: inherit; transform-origin: right center; transform: scaleX(0);
  background: linear-gradient(90deg, #6a2a10, #2a1a12 6%, #1c1410); }
.st-sw { position: absolute; inset: 0; display: block; }
.st-spark { position: absolute; right: -0.55em; top: 50%; width: 1.1em; height: 1.1em; margin-top: -0.55em; border-radius: 50%;
  background: radial-gradient(circle, #fffbe0 0, #ffd060 18%, rgba(255, 130, 30, 0.75) 38%, rgba(255, 70, 10, 0) 70%); animation: stFlick 0.2s ease-in-out infinite alternate; }
.st-bar.low .st-spark { background: radial-gradient(circle, #fff4d0 0, #ff9a40 18%, rgba(255, 60, 20, 0.85) 40%, rgba(255, 40, 10, 0) 72%); animation-duration: 0.11s; }
@keyframes stFlick { from { transform: scale(0.72) rotate(0deg); opacity: 0.8; } to { transform: scale(1.12) rotate(40deg); opacity: 1; } }
.st-k { margin-top: 0.35em; padding-top: 0.3em; font-size: 0.76em; color: #bba27a;
  background: linear-gradient(90deg, rgba(200, 160, 74, 0), rgba(200, 160, 74, 0.32), rgba(200, 160, 74, 0)) top / 100% 1px no-repeat; }
.st-win { font-size: 0.86em; color: #c4e08a; margin-top: 0.2em; }
@container hud (max-height: 460px) and (min-aspect-ratio: 16/9) {
  .smaug-talk { width: min(94%, 56em); bottom: 2.5%; padding-top: 0.35em; padding-bottom: 0.3em; font-size: clamp(11px, min(2.4cqw, 3.3cqh), 16px); }
  .smaug-talk.watch { width: min(90%, 52em); font-size: clamp(11px, min(2.25cqw, 3.15cqh), 15px); }
  .st-h { margin-bottom: 0.05em; }
  .st-tip { margin-bottom: 0.15em; }
  .st-k { margin-top: 0.2em; padding-top: 0.2em; }
  .st-list { display: grid; grid-template-columns: 1fr 1fr; max-width: none; }
  .st-q { margin-top: 0.1em; margin-bottom: 0.2em; padding-top: 0.2em; padding-bottom: 0.25em; }
  .st-bar { margin-top: 0.4em; }
}
`;
  document.head.appendChild(st);
}

/** Gold filigree for one corner (mirrored by CSS for the other three): a curling double line ending in a coin. */
const CORNER_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 37 V13 Q3 3 13 3 H37" fill="none" stroke="currentColor" stroke-width="1.8"/>
<path d="M8 30 Q8 8 30 8" fill="none" stroke="currentColor" stroke-width="1" opacity="0.7"/><path d="M15 3 q-1 7 5 8 q5 0 4 -5" fill="none" stroke="currentColor" stroke-width="1.1"/>
<path d="M3 15 q7 -1 8 5 q0 5 -5 4" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="9.5" cy="9.5" r="3.6" fill="currentColor"/><circle cx="9.5" cy="9.5" r="1.7" fill="#3a2008"/></svg>`;
const CORNERS = ['tl', 'tr', 'bl', 'br'].map((c) => `<span class="st-cn ${c}">${CORNER_SVG}</span>`).join('');

/** Smaug's eye on a gold coin (flat fills: no gradient ids to clash between the two viewports). */
const EYE_COIN = `<svg class="st-eye" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#c8a04a" stroke="#5a3a14" stroke-width="1.2"/>
<circle cx="16" cy="16" r="12" fill="#2a0e06" stroke="#f0d080" stroke-width="1"/>
${Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * Math.PI * 2; return `<circle cx="${(16 + Math.cos(a) * 13.5).toFixed(2)}" cy="${(16 + Math.sin(a) * 13.5).toFixed(2)}" r="0.8" fill="#7a5420"/>`; }).join('')}
<path d="M6 16 Q16 7 26 16 Q16 25 6 16 Z" fill="#e8701a"/><ellipse cx="16" cy="16" rx="5.5" ry="5" fill="#ffc040"/><ellipse cx="16" cy="16" rx="2.6" ry="2.6" fill="#fff0a0" opacity="0.6"/>
<ellipse cx="16" cy="16" rx="1.3" ry="6.2" fill="#1a0402"/></svg>`;

/**
 * One conversation. The owner (hoard/index.js) supplies: game, smaug, noise (read / write), addNoise(p, k),
 * arkenstoneNear(p), sickPartnerNear(p), wake(target), and onEnd(result) (result: 'good' | 'fire' | 'skip' | 'abort').
 */
export class SmaugTalk {
  constructor(owner, speaker) {
    this.owner = owner;
    this.game = owner.game;
    this.speaker = speaker;
    this.d = deeds(this.game, speaker);
    this.earned = TITLES.filter((t) => t.ok(this.d));
    this.used = new Set();
    this.round = 0;
    this.rounds = Math.min(TALK.rounds, this.earned.length);
    this.boast = !this.game.finale?.patch; // the last round: his boast (the bare patch)
    this.goods = 0;
    this.phase = 'intro';
    this.t = 0;
    this.sel = 0;
    this.choices = []; // { text, good, title?, blurt?, boast? }
    this.line = LINES.intro;
    this.reply = '';
    this.hint = null; // { k: choice index, by: name }
    this.result = null;
    this.ui = new Map();
    this.game.journal?.mark?.('szmaug'); // journal (NOTES-16-smaug-talk): the conversation took place
  }

  get done() {
    return this.phase === 'done';
  }

  /** The partners who see the conversation (anyone else in the treasury's layer). */
  watchers() {
    return this.game.players.filter((q) => q !== this.speaker && !q.choosing && q.dead <= 0 && this.owner.inLayer(q));
  }

  start(phase, line = this.line) {
    this.phase = phase;
    this.t = 0;
    this.line = line;
  }

  /** The next round's choices: up to two earned titles not yet used and two blurts (the boast: its own). */
  nextRound() {
    this.round++;
    this.sel = 0;
    this.hint = null;
    if (this.round > this.rounds) {
      this.choices = shuffle([
        { text: LINES.boastGood, good: true, boast: true },
        { text: LINES.boastBad, good: false, boast: true, reply: LINES.boastAngry },
        { ...shuffle([...BLURTS])[0], good: false },
      ]).map((c) => (c.id ? { text: c.text, good: false, reply: c.reply } : c));
      this.start('ask', LINES.boast);
      return;
    }
    const left = this.earned.filter((t) => !this.used.has(t.id));
    const goods = shuffle([...left]).slice(0, Math.random() < 0.5 && left.length > 1 ? 2 : 1);
    const bads = shuffle([...BLURTS]).slice(0, goods.length > 1 ? 2 : 3);
    this.choices = shuffle([
      ...goods.map((t) => ({ text: t.text, good: true, title: t, reply: t.reply })),
      ...bads.map((b) => ({ text: b.text, good: false, reply: b.reply })),
    ]);
    // The first round asks who; the last sows doubt about the dwarves (journal flavour); between: asks again.
    const doubt = this.round > 1 && this.round === this.rounds;
    if (doubt) this.game.journal?.mark?.('szmaug-ketely');
    this.start('ask', LINES.ask[this.round === 1 ? 0 : doubt ? 2 : 1]);
  }

  /** An answer (k = choice index; -1 = silence). */
  answer(k) {
    const c = this.choices[k];
    const o = this.owner;
    this.narr = false; // the reply is Smaug's words, except the patch's reveal (narration)
    if (!c) {
      o.noise = Math.min(1, o.noise + TALK.silent);
      this.reply = LINES.silent;
    } else if (c.good) {
      this.goods++;
      if (c.title) this.used.add(c.title.id);
      o.noise = Math.max(0, o.noise + TALK.good);
      if (c.boast) {
        this.reply = LINES.patch;
        this.narr = true;
        this.learnPatch();
      } else this.reply = c.reply;
    } else {
      o.noise = Math.min(1, o.noise + TALK.bad);
      this.reply = c.reply;
    }
    this.lastGood = !!c?.good;
    this.start('reply', this.line);
    if (o.noise >= o.wakeMark) {
      // Too far: he breathes fire at the voice (hoard/index.js's wake).
      this.speaker.say(`Szmaug: „${this.reply}”`, 3);
      this.finish('fire');
    }
  }

  /** The bare patch (book ch. 12; the thrush overhears Bilbo telling the dwarves and tells Bard: ch. 14). */
  learnPatch() {
    const game = this.game;
    const fin = game.finale;
    if (!fin || fin.patch) return;
    fin.patch = true;
    const text = 'Szmaug csupasz foltja: bal mellén, a mélyedésben. A rigó meghallja, amikor elmondod a törpéknek, és elviszi a hírt Bárdnak: a fináléban a fekete nyíl biztosan talál.';
    game.players.forEach((q, k) => game.tutorial?.hint?.(k, q, `csupaszfolt-${k}`, text, 10));
    for (const q of this.watchers()) q.say('Bilbó meglátta Szmaug csupasz foltját!', 4);
    this.patchLearned = true;
    game.saveNow?.();
  }

  finish(result) {
    if (this.phase === 'done') return;
    this.result = result;
    this.phase = 'done';
    this.draw();
    this.owner.talkEnded(this, result);
  }

  /** Per player and frame: true while this player's input belongs to the conversation. */
  input(p, i, it) {
    if (this.phase === 'done') return false;
    if (p === this.speaker) {
      if (it.backPressed) {
        this.speaker.say(LINES.skip, 2.5);
        this.finish('skip');
        return true;
      }
      const go = it.confirmPressed || it.digPressed || it.interactPressed;
      if (this.phase === 'ask' && this.t > TALK.lock) {
        const n = this.choices.length;
        if (it.upPressed) this.sel = (this.sel + n - 1) % n;
        if (it.downPressed) this.sel = (this.sel + 1) % n;
        if (go) this.answer(this.sel);
      } else if (go && this.t > TALK.lock && (this.phase === 'intro' || this.phase === 'reply')) this.t = 1e3; // read: next
      return true;
    }
    // A partner: the use key whispers a hint (the Arkenstone and a dragon-sick partner come first).
    if (it.interactPressed && this.phase === 'ask' && !this.hint && this.watchers().includes(p) && !this.owner.arkenstoneNear(p) && !this.owner.sickPartnerNear(p)) {
      const k = this.choices.findIndex((c) => c.good);
      if (k >= 0) {
        this.hint = { k, by: p.ch?.name || 'A társad' };
        this.owner.addNoise(p, TALK.whisper);
        p.say('Odasúgtad Bilbónak a választ.', 2);
      }
      return true;
    }
    return false;
  }

  /** Per frame while it runs. Returns false once finished. */
  update(dt) {
    if (this.phase === 'done') return false;
    this.t += dt;
    const sp = this.speaker;
    const o = this.owner;
    // The speaker must stay: Bilbo invisible in the treasury. Taking off the Ring: Smaug sees him (fire).
    if (!this.game.players.includes(sp) || sp.choosing || sp.dead > 0 || !o.inHall(sp)) {
      this.finish('abort');
      return false;
    }
    if (!this.game.gollum?.isInvisible?.(sp)) {
      sp.say('Lehúztad a Gyűrűt: Szmaug meglát!', 3);
      this.finish('fire');
      return false;
    }
    // The others' noise still counts (hoard/index.js updateNoise): too loud wakes him in the middle of it.
    if (o.noise >= o.wakeMark) {
      this.finish('fire');
      return false;
    }
    // He looks for the voice: the head sweeps round where the smell is (he cannot see the wearer).
    const s = o.smaug;
    if (s) {
      const a = o.time * 0.7;
      s.look = (this.look ||= sp.pos.clone());
      s.look.set(sp.pos.x + Math.sin(a) * 2.2, sp.pos.y + 0.9, sp.pos.z + Math.cos(a * 0.8) * 2.2);
    }
    switch (this.phase) {
      case 'intro':
        if (this.t > TALK.intro) this.nextRound();
        break;
      case 'ask':
        if (this.t >= TALK.answerTime) this.answer(-1);
        break;
      case 'reply':
        if (this.t > TALK.reply + (this.patchLearned && this.round > this.rounds ? 3 : 0)) {
          if (this.round >= this.rounds + (this.boast ? 1 : 0)) this.start('end', LINES.endGood);
          else this.nextRound();
        }
        break;
      case 'end':
        if (this.t > TALK.end) this.finish('good');
        break;
      default:
        break;
    }
    this.draw();
    return this.phase !== 'done';
  }

  /* ---------------- the panel, in the speaker's and the watchers' own viewports (NOTES-33-smaug-ui) ---------------- */

  draw() {
    const game = this.game;
    const watch = this.phase === 'done' ? [] : this.watchers();
    game.players.forEach((p, i) => {
      const el = game.huds[i]?.el;
      if (!el) return;
      let ui = this.ui.get(p);
      const html = this.phase === 'done' ? '' : p === this.speaker ? this.html(i, true) : watch.includes(p) ? this.html(i, false) : '';
      if (!ui && !html) return;
      if (!ui || ui.root !== el) {
        ui?.box.remove();
        addTalkStyle();
        // The frame (corners) is built once; only the inner content is rewritten when its text changes.
        ui = { root: el, box: document.createElement('div'), inner: null, html: '', ash: null, spark: null, fuse: null, left: '', low: null };
        ui.box.className = 'smaug-talk';
        ui.box.style.display = 'none';
        ui.box.innerHTML = `${CORNERS}<div class="st-in"></div>`;
        ui.inner = ui.box.querySelector('.st-in');
        el.appendChild(ui.box);
        this.ui.set(p, ui);
      }
      if (html !== ui.html) {
        ui.html = html;
        ui.inner.innerHTML = html;
        ui.box.style.display = html ? 'block' : 'none';
        ui.box.classList.toggle('watch', p !== this.speaker);
        ui.box.classList.toggle('angry', this.phase === 'reply' && !this.lastGood && !this.narr);
        ui.fuse = ui.inner.querySelector('.st-bar');
        ui.ash = ui.fuse && ui.fuse.querySelector('.st-ash');
        ui.spark = ui.fuse && ui.fuse.querySelector('.st-sw');
        ui.left = '';
        ui.low = null;
      }
      // His patience, the burning fuse: two compositor-only transforms, written only when the value changes.
      if (ui.ash) {
        const left = Math.max(0, 1 - this.t / TALK.answerTime);
        const s = left.toFixed(3);
        if (s !== ui.left) {
          ui.left = s;
          ui.ash.style.transform = `scaleX(${(1 - left).toFixed(3)})`;
          ui.spark.style.transform = `translateX(${((left - 1) * 100).toFixed(2)}%)`;
        }
        const low = left < 0.25;
        if (low !== ui.low) {
          ui.low = low;
          ui.fuse.classList.toggle('low', low);
        }
      }
    });
  }

  /** The panel's content for player i: the speaker chooses; a watcher sees the choices and may whisper. */
  html(i, speaker) {
    const g = glyphs(deviceOf(this.game.bindings[i]), this.game.bindings.some((b) => b.kbm === 'keys2'));
    // The round as a badge with one coin per round (the boast counts as the last one).
    const total = this.rounds + (this.boast ? 1 : 0);
    const pips = Array.from({ length: total }, (_, k) => `<i${k < this.round ? ' class="on"' : ''}></i>`).join('');
    const badge = this.round > 0 && (this.phase === 'ask' || this.phase === 'reply') ? `<span class="st-rd">${this.round}. kör<span class="st-pips">${pips}</span></span>` : '';
    const head = (t) => `<div class="st-h"><i class="st-rule"></i>${EYE_COIN}<span class="st-t">${t}</span>${badge}<i class="st-rule r"></i></div>`;
    const say = (t, who = 'Szmaug') => (t ? `<div class="st-q"><b class="st-who">${who}:</b> <span class="st-say">„${t}”</span></div>` : '');
    const narr = (t) => `<div class="st-n">${t}</div>`;
    const bar = '<div class="st-bar"><i class="st-ash"></i><span class="st-sw"><i class="st-spark"></i></span></div>';
    const list = (mine) => `<div class="st-list">${this.choices.map((c, k) => {
      const on = mine && k === this.sel;
      const hinted = this.hint && this.hint.k === k;
      const tag = hinted ? ` <span class="st-hint">‹ ${mine ? `${this.hint.by} súgja` : 'ezt súgtad'}</span>` : '';
      return `<div class="st-c${on ? ' on' : ''}${hinted ? ' hinted' : ''}">${c.text}${tag}</div>`;
    }).join('')}</div>`;
    const keys = (t) => `<div class="st-k">${t}</div>`;
    if (!speaker) {
      const who = this.speaker.ch?.name || 'Bilbó';
      const top = head(`Szmaug ${who === 'Zsákos Bilbó' ? 'Bilbóval' : who} beszél`);
      if (this.phase === 'ask') {
        return top + say(this.line) + list(false) + bar
          + keys(this.hint ? 'Odasúgtad a választ.' : `${g.interact} súgj neki (halkan: Szmaug is meghallhatja) · vagy csak figyelj`);
      }
      if (this.phase === 'reply' && this.narr) return top + narr(this.reply);
      return top + say(this.phase === 'reply' ? this.reply : this.line);
    }
    const skip = `${g.back} kihagyás (elsurransz)`;
    switch (this.phase) {
      case 'intro':
        return head('Szmaug megszólal') + say(this.line) + keys(`${g.confirm} tovább · ${skip}`);
      case 'ask':
        return head(this.round > this.rounds ? 'Szmaug dicsekszik' : 'Szmaug kérdez') + say(this.line)
          + '<div class="st-tip">Ne áruld el, ki vagy: felelj rejtvényesen!</div>'
          + list(true) + bar + keys(`${g.nav} választás · ${g.confirm} ezt mondod · ${skip}`);
      case 'reply':
        if (this.narr) return head('A csupasz folt!') + narr(this.reply) + keys(`${g.confirm} tovább · ${skip}`);
        return head(this.lastGood ? 'Szmaug elgondolkodik…' : 'Szmaug dühös!') + say(this.reply) + keys(`${g.confirm} tovább · ${skip}`);
      case 'end':
        return head('Szmaug elcsendesedik') + say(this.line) + '<div class="st-win">Időt nyertél a kincs elhordására.</div>';
      default:
        return '';
    }
  }

  dispose() {
    for (const ui of this.ui.values()) ui.box.remove();
    this.ui.clear();
  }
}
