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

  /* ---------------- the parchment, in the speaker's and the watchers' own viewports ---------------- */

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
        ui = { root: el, box: document.createElement('div'), html: '' };
        Object.assign(ui.box.style, {
          position: 'absolute', left: '50%', bottom: '7%', transform: 'translateX(-50%)', width: 'min(90%, 36em)', maxHeight: '62%', overflow: 'hidden',
          padding: '0.7em 1.3em 0.75em', textAlign: 'center', fontSize: '0.95em', lineHeight: '1.32', color: 'var(--ink-dark, #3a2614)',
          background: 'radial-gradient(ellipse at 50% 120%, #c8501a33, #0000 60%), var(--tx-parch) center / cover, #e8d6ac', borderRadius: '0.25em',
          boxShadow: '0 0.3em 1.2em #000d, inset 0 0 2.5em #7a3a1a66', fontFamily: 'var(--f-text, Georgia, serif)', pointerEvents: 'none', zIndex: '7', display: 'none',
        });
        ui.box.className = 'smaug-talk';
        el.appendChild(ui.box);
        this.ui.set(p, ui);
      }
      if (html !== ui.html) {
        ui.html = html;
        ui.box.innerHTML = html;
        ui.box.style.display = html ? 'block' : 'none';
      }
      // His patience: only the bar's width changes per frame.
      const bar = ui.box.querySelector('.st-bar i');
      if (bar) bar.style.width = `${Math.max(0, 100 * (1 - this.t / TALK.answerTime)).toFixed(1)}%`;
    });
  }

  /** The parchment's content for player i: the speaker chooses; a watcher sees the choices and may whisper. */
  html(i, speaker) {
    const g = glyphs(deviceOf(this.game.bindings[i]), this.game.bindings.some((b) => b.kbm === 'keys2'));
    const head = (t) => `<div style="font-family:var(--f-head);font-size:1.2em;color:#6a1a08;margin-bottom:0.2em">${t}</div>`;
    const say = (t, who = 'Szmaug') => (t ? `<div style="font-style:italic;color:#4a2a18;margin:0.3em 0"><b style="font-style:normal;color:#8a2414">${who}:</b> „${t}”</div>` : '');
    const narr = (t) => `<div style="font-style:italic;color:#3a2614;margin:0.3em 0">${t}</div>`;
    const bar = '<div class="st-bar" style="height:0.38em;margin:0.5em auto 0.15em;width:80%;background:#7a5a3a55;border-radius:0.2em;overflow:hidden"><i style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#8a1a08,#e0701a)"></i></div>';
    const list = (mine) => this.choices.map((c, k) => {
      const on = mine && k === this.sel;
      const hinted = this.hint && this.hint.k === k;
      const tag = hinted ? ` <span style="font-size:0.8em;color:#2f5a1a">‹ ${mine ? `${this.hint.by} súgja` : 'ezt súgtad'}</span>` : '';
      return `<div class="st-c${on ? ' on' : ''}" style="margin:0.16em auto;padding:0.12em 0.6em;width:fit-content;max-width:96%;border-radius:0.2em;${on ? 'background:#7a3a1022;box-shadow:inset 0 0 0 2px #7a3a10;font-weight:bold' : mine ? '' : 'opacity:0.8'}">${on ? '▸ ' : ''}${c.text}${tag}</div>`;
    }).join('');
    const keys = (t) => `<div style="margin-top:0.4em;font-size:0.78em;color:#5a4a34">${t}</div>`;
    if (!speaker) {
      const who = this.speaker.ch?.name || 'Bilbó';
      const top = head(`Szmaug ${who === 'Zsákos Bilbó' ? 'Bilbóval' : who} beszél`);
      if (this.phase === 'ask') {
        return top + say(this.line) + list(false)
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
        return head(this.round > this.rounds ? 'Szmaug dicsekszik' : `Szmaug kérdez (${this.round}. kör)`) + say(this.line)
          + '<div style="font-size:0.8em;color:#6a5034;margin:-0.1em 0 0.2em">Ne áruld el, ki vagy: felelj rejtvényesen!</div>'
          + list(true) + bar + keys(`${g.nav} választás · ${g.confirm} ezt mondod · ${skip}`);
      case 'reply':
        if (this.narr) return head('A csupasz folt!') + narr(this.reply) + keys(`${g.confirm} tovább · ${skip}`);
        return head(this.lastGood ? 'Szmaug elgondolkodik…' : 'Szmaug dühös!') + say(this.reply) + keys(`${g.confirm} tovább · ${skip}`);
      case 'end':
        return head('Szmaug elcsendesedik') + say(this.line) + `<div style="font-size:0.85em;color:#2f5a1a;margin-top:0.2em">Időt nyertél a kincs elhordására.</div>`;
      default:
        return '';
    }
  }

  dispose() {
    for (const ui of this.ui.values()) ui.box.remove();
    this.ui.clear();
  }
}
