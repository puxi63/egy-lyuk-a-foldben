/* ==== gollum/riddles.js — the riddle game with Gollum (TERV 0.3 / 0.7; the book, ch. 5 "Riddles in the Dark").
   Only the book's riddles, in the book's order of who asks what: Gollum asks the mountain, the wind, the dark, the fish
   and time; Bilbo asks the teeth, the sun on the daisies, the eggs, the "no-legs" (the fish on a little table) and
   finally "What have I got in my pocket?". The Hungarian texts are this game's own faithful renderings, not the
   Hungarian edition's wording (all marked [ellenőrizendő] in NOTES-3b-gollum.md). Turn-based as in the book: Gollum
   asks (3–4 answers on a parchment, his impatience as a timer), then the player asks one of Bilbo's riddles and
   Gollum tries to answer. Per-player UI inside each HUD; in co-op whoever stands near may answer. ==== */
import { deviceOf, glyphs } from '../ui/glyphs.js';

/** Gollum's riddles (the player answers). `answer` is the right choice; the others are plain distractors. */
export const GOLLUM_RIDDLES = [
  { id: 'hegy', text: 'Gyökerét senki sem látja,<br>a fánál is magasabbra hág,<br>egyre feljebb, feljebb tör,<br>s mégsem nő soha.', answer: 'Hegy', wrong: ['Fa', 'Torony', 'Felhő'] },
  { id: 'szel', text: 'Hangja nincs, mégis kiált,<br>szárnya nincs, mégis száll,<br>foga nincs, mégis harap,<br>szája nincs, mégis mormol.', answer: 'Szél', wrong: ['Denevér', 'Farkas', 'Patak'] },
  { id: 'sotet', text: 'Nem látod, nem tapintod,<br>nem hallod, nem szagolod;<br>csillagok mögött, dombok alatt lakik,<br>üres lyukakat tölt meg.<br>Előbb jön, s utána is jön,<br>életet olt ki, nevetést fojt el.', answer: 'Sötétség', wrong: ['Csend', 'Köd', 'Álom'] },
  { id: 'hal', text: 'Él, mégsem lélegzik,<br>hideg, mint a halál;<br>sosem szomjas, mindig iszik,<br>páncélt hord, mégsem csörög.', answer: 'Hal', wrong: ['Kígyó', 'Béka', 'Kő'] },
  { id: 'ido', text: 'Mindent felfal: madarat, vadat,<br>fát és virágot;<br>vasat rág, acélt harap,<br>kemény követ porrá őröl;<br>királyt öl, várost dönt,<br>s a magas hegyet is földig hordja.', answer: 'Idő', wrong: ['Tűz', 'Sárkány', 'Víz'] },
];

/**
 * Bilbo's riddles (the player asks, Gollum answers). `fail` is the chance that Gollum misses it the first time it is
 * asked in this game save (the book: the teeth were easy for him, the daisies he half remembered from long ago above
 * ground, the eggs and the no-legs nearly beat him); once asked he knows it. `reply` is his answer.
 */
export const BILBO_RIDDLES = [
  { id: 'fogak', label: 'A harminc fehér ló', text: 'Harminc fehér ló egy piros dombon:<br>előbb harapnak, aztán dobognak,<br>aztán megállnak.', reply: 'Fogak! Fogak, drágaszágom! Pedig nekünk csak hat van…', fail: 0.12 },
  { id: 'szem', label: 'Szem a kék arcon', text: 'Szem a kék arcon<br>látott egy szemet a zöld arcon.<br>„Olyan, mint ez a szem” – mondta az első –,<br>„csak lent van, nem fent.”', reply: 'Nap a százszorszépeken… emlékszünk, régen, odafent…', fail: 0.25 },
  { id: 'tojas', label: 'A pánt nélküli láda', text: 'Pánt nélküli, kulcs nélküli,<br>fedél nélküli ládika,<br>mégis arany kincs van benne.', reply: 'Tojások! Tojássok, drágaszágom!', fail: 0.42 },
  { id: 'lab', label: 'Lábatlan az egylábún', text: 'Lábatlan feküdt az egylábún,<br>kétláb ült mellé a háromlábún,<br>négyláb is kapott valamit.', reply: 'Hal a kis asztalon, ember a széken, és a macska kapja a szálkát!', fail: 0.36 },
];
/** "What have I got in my pocket?" (only Bilbo, only with the Ring found, once): Gollum's three guesses, then he loses. */
export const POCKET = { id: 'zseb', label: 'Mi van a zsebemben?', text: 'Mi van a zsebemben?', guesses: ['Kezek!', 'Kés!', 'Madzag… vagy semmi!'] };

/** Timing (seconds) and the rewards. */
export const RIDDLE = {
  answerTime: [26, 22, 18], // Gollum's patience per round
  rounds: 3, // a player who answers three of his riddles (and he all of hers) outlasts him
  pickTime: 25, // choosing which riddle to ask; he grows impatient
  winGold: 70, // Gollum missed a riddle
  outlastGold: 40, // three rounds without a miss on either side
  pocketGold: 120,
  stealGold: [10, 30], // with an empty bag he takes gold instead
  joinRadius: 8, // co-op: a player this near the riddle spot can answer too
};

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * One game of riddles. The owner (gollum/index.js) supplies: `game`, `body` (GollumBody: talk / gulp), `spot`,
 * `memory` ({ asked: [ids], bilbo: [ids], pocket }), `ringFound()` and the outcome callbacks onEnd(result, players).
 * result: 'win' | 'outlast' | 'pocket' | 'lose' | 'abort'.
 */
export class RiddleGame {
  constructor(owner, challenger) {
    this.owner = owner;
    this.game = owner.game;
    this.challenger = challenger;
    this.round = 0;
    this.phase = 'intro';
    this.t = 0;
    this.sel = 0;
    this.choices = [];
    this.riddle = null;
    this.asked = new Set();
    this.mine = null;
    this.result = null;
    this.answeredBy = null;
    this.say = 'Szereti a találós kérdéseket, drágaszágom? Ha mi nyerünk, elvesszük a kincsét! Ha ő nyer… ajándékot kap.';
    this.ui = new Map(); // player → { root, box, ... }
    this.owner.sound('gollum', null);
  }

  /** Players who take part this frame: the challenger, and anyone near the riddle spot. */
  participants() {
    const s = this.owner.sites.riddleSpot;
    return this.game.players.filter((p) => !p.choosing && p.dead <= 0 && (p === this.challenger || (s && Math.hypot(p.pos.x - s.x, p.pos.y - s.y, p.pos.z - s.z) < RIDDLE.joinRadius)));
  }

  /** Gollum's next riddle: one not asked in this game, preferring those never asked in this save. */
  nextGollumRiddle() {
    const mem = this.owner.memory;
    const left = GOLLUM_RIDDLES.filter((r) => !this.asked.has(r.id));
    const fresh = left.filter((r) => !mem.asked.includes(r.id));
    const pool = fresh.length ? fresh : left;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** The riddles the player may ask now (Bilbo's, not yet asked in this game; the pocket question when allowed). */
  playerRiddles() {
    const list = BILBO_RIDDLES.filter((r) => !this.asked.has(r.id));
    const bilbo = this.participants().some((p) => p.ch.id === 'bilbo');
    if (bilbo && this.owner.ringFound() && !this.owner.memory.pocket) list.push(POCKET);
    return list;
  }

  start(phase, say = '') {
    this.phase = phase;
    this.t = 0;
    this.sel = 0;
    this.say = say;
  }

  /** Per player and frame: true while this player's input belongs to the riddle UI. */
  input(p, it) {
    if (!this.participants().includes(p)) return false;
    const n = this.phase === 'ask' ? this.choices.length : this.phase === 'pick' ? this.mineList.length : 0;
    if (n) {
      if (it.upPressed) this.sel = (this.sel + n - 1) % n;
      if (it.downPressed) this.sel = (this.sel + 1) % n;
      if (it.confirmPressed || it.digPressed || it.interactPressed) {
        if (this.phase === 'ask') this.answer(p, this.sel);
        else this.ask(p, this.mineList[this.sel]);
      }
    }
    return true;
  }

  answer(p, i) {
    const c = this.choices[i];
    this.answeredBy = p;
    this.owner.memory.asked.includes(this.riddle.id) || this.owner.memory.asked.push(this.riddle.id);
    if (c === this.riddle.answer) {
      this.owner.sound('hiss', null);
      this.start('right', `„${c}!” – Ssss… eltalálta, drágaszágom.`);
    } else {
      this.owner.sound('cackle', null);
      this.result = 'lose';
      this.start('end', c ? `„${c}”? Nem, nem! ${this.riddle.answer} a megfejtés, drágaszágom! Elvesztette!` : `Lejárt az ideje! ${this.riddle.answer} a megfejtés! Elvesztette, drágaszágom!`);
    }
  }

  ask(p, r) {
    this.mine = r;
    this.asked.add(r.id);
    this.answeredBy = p;
    if (r === POCKET) {
      this.owner.memory.pocket = true;
      this.start('pocket', '');
      return;
    }
    this.start('think', 'Sss… hadd gondolkozzunk, drágaszágom… gollam…');
    this.body().gulp();
  }

  body() {
    return this.owner.body;
  }

  /** Per frame (the owner calls it while the game runs). */
  update(dt) {
    this.t += dt;
    const b = this.body();
    b.pose.talk = 1;
    if (Math.random() < dt * 0.25) b.gulp();
    switch (this.phase) {
      case 'intro':
        if (this.t > 4) this.nextRound();
        break;
      case 'ask': {
        const limit = RIDDLE.answerTime[Math.min(this.round - 1, RIDDLE.answerTime.length - 1)];
        this.limit = limit;
        if (limit - this.t < 8 && !this.hurried) {
          this.hurried = true;
          this.say = 'Gyorsan, gyorsan! Nem várunk sokáig, drágaszágom!';
          this.owner.sound('hiss', null);
        }
        if (this.t >= limit) this.answer(this.answeredBy || this.challenger, -1);
        break;
      }
      case 'right':
        if (this.t > 2.4) {
          if (this.round >= RIDDLE.rounds) {
            this.result = 'outlast';
            this.start('end', 'Ssss… elég, elég! Elfogyott a türelmünk… Nyert. Itt az ajándéka, drágaszágom.');
          } else {
            this.mineList = this.playerRiddles();
            this.start('pick', 'Most ő kérdezzen, drágaszágom. Kérdezzen!');
          }
        }
        break;
      case 'pick':
        if (this.t > RIDDLE.pickTime * 0.6 && !this.hurried2) {
          this.hurried2 = true;
          this.say = 'Kérdezzen már! Kérdezzen!';
        }
        if (this.t >= RIDDLE.pickTime) this.ask(this.challenger, this.mineList[0]);
        break;
      case 'think':
        if (this.t > 2.6 + this.mine.fail * 4) {
          const mem = this.owner.memory;
          const known = mem.bilbo.includes(this.mine.id);
          if (!known) mem.bilbo.push(this.mine.id);
          const miss = !known && Math.random() < this.mine.fail;
          if (miss || this.forceMiss) {
            this.result = 'win';
            this.owner.sound('wail', null);
            this.start('end', 'Nem tudjuk… nem tudjuk, drágaszágom! Ssss… Nyert. Ajándékot ígértünk…');
          } else {
            this.owner.sound('hiss', null);
            this.start('answered', this.mine.reply);
            b.gulp();
          }
        }
        break;
      case 'answered':
        if (this.t > 3.2) this.nextRound();
        break;
      case 'pocket': {
        // His three guesses, one after the other (the book), then he has lost.
        const k = Math.floor(this.t / 1.7);
        const g = POCKET.guesses[Math.min(k, POCKET.guesses.length - 1)];
        this.say = POCKET.guesses.slice(0, Math.min(k + 1, POCKET.guesses.length)).join(' … ');
        if (Math.floor((this.t - dt) / 1.7) !== k && k < POCKET.guesses.length) {
          b.gulp();
          this.owner.sound('hiss', null);
        }
        void g;
        if (this.t > 1.7 * POCKET.guesses.length + 0.8) {
          this.result = 'pocket';
          this.owner.sound('wail', null);
          this.start('end', 'Rossz, rossz! Ez nem igazság, drágaszágom… Mi van a zsebében? Ssss… Nyert.');
        }
        break;
      }
      case 'end':
        if (this.t > 4.5) this.finish();
        break;
      default:
        break;
    }
    this.draw();
  }

  nextRound() {
    this.round++;
    this.hurried = false;
    this.hurried2 = false;
    this.riddle = this.nextGollumRiddle();
    this.asked.add(this.riddle.id);
    this.choices = shuffle([this.riddle.answer, ...shuffle([...this.riddle.wrong]).slice(0, 3)]);
    this.start('ask', '');
    this.owner.sound('gollum', null);
    this.body().gulp();
  }

  finish() {
    this.phase = 'done';
    this.draw();
    this.owner.riddleEnded(this.result || 'abort', this.participants(), this.answeredBy || this.challenger);
  }

  /** Ends the game early (the challenger died, left or rode away): no reward, no theft. */
  abort() {
    this.result = 'abort';
    this.finish();
  }

  /* ---------------- the parchment UI, one per participating player ---------------- */

  draw() {
    const game = this.game;
    const parts = this.phase === 'done' ? [] : this.participants();
    game.players.forEach((p, i) => {
      const el = game.huds[i]?.el;
      let ui = this.ui.get(p);
      if (!el) return;
      if (!ui || ui.root !== el) {
        ui?.box.remove();
        ui = { root: el, box: document.createElement('div'), html: '' };
        Object.assign(ui.box.style, {
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(86%, 34em)', maxHeight: '86%', overflow: 'hidden',
          padding: '0.8em 1.4em 0.9em', textAlign: 'center', fontSize: '0.98em', lineHeight: '1.35', color: 'var(--ink-dark, #3a2614)',
          background: 'var(--tx-parch) center / cover, #e8d6ac', borderRadius: '0.25em', boxShadow: '0 0.3em 1.2em #000d, inset 0 0 2.5em #7a5a2a55',
          fontFamily: 'var(--f-text, Georgia, serif)', pointerEvents: 'none', zIndex: '7', display: 'none',
        });
        el.appendChild(ui.box);
        this.ui.set(p, ui);
      }
      const html = parts.includes(p) ? this.html(p, i) : '';
      if (html !== ui.html) {
        ui.html = html;
        ui.box.innerHTML = html;
        ui.box.style.display = html ? 'block' : 'none';
      }
      // The timer (Gollum's patience) changes every frame: only its width is written.
      const bar = ui.box.querySelector('.rg-bar i');
      if (bar && this.phase === 'ask') bar.style.width = `${Math.max(0, 100 * (1 - this.t / (this.limit || 20))).toFixed(1)}%`;
      if (bar && this.phase === 'pick') bar.style.width = `${Math.max(0, 100 * (1 - this.t / RIDDLE.pickTime)).toFixed(1)}%`;
    });
  }

  /** The parchment's content for player p (its own keys). */
  html(p, i) {
    const g = glyphs(deviceOf(this.game.bindings[i]), this.game.bindings.some((b) => b.kbm === 'keys2'));
    const head = (t) => `<div style="font-family:var(--f-head);font-size:1.25em;color:#5a2a0a;margin-bottom:0.25em">${t}</div>`;
    const say = (t) => (t ? `<div style="font-style:italic;color:#4a3a28;margin:0.35em 0">„${t}”</div>` : '');
    const bar = '<div class="rg-bar" style="height:0.4em;margin:0.55em auto 0.2em;width:80%;background:#7a5a3a55;border-radius:0.2em;overflow:hidden"><i style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#8a2a10,#c8781a)"></i></div>';
    const list = (items) => items.map((t, k) => `<div style="margin:0.18em auto;padding:0.14em 0.6em;width:fit-content;min-width:40%;border-radius:0.2em;${k === this.sel ? 'background:#7a3a1022;box-shadow:inset 0 0 0 2px #7a3a10;font-weight:bold' : ''}">${k === this.sel ? '▸ ' : ''}${t}</div>`).join('');
    const keys = `<div style="margin-top:0.45em;font-size:0.8em;color:#5a4a34">${g.nav} választás · ${g.confirm} ez az</div>`;
    switch (this.phase) {
      case 'intro':
        return head('Találós kérdések a sötétben') + say(this.say);
      case 'ask':
        return head(`Gollam kérdez (${this.round}. kör)`) + `<div style="margin:0.3em 0 0.4em">${this.riddle.text}</div>` + say(this.say) + list(this.choices) + bar + keys;
      case 'right':
      case 'think':
      case 'answered':
        return head(this.phase === 'right' ? 'Eltaláltad!' : this.mine ? `„${this.mine.text.replace(/<br>/g, ' ')}”` : '') + say(this.say);
      case 'pick':
        return head('Most te kérdezel') + say(this.say) + list(this.mineList.map((r) => r.label)) + bar + keys;
      case 'pocket':
        return head('„Mi van a zsebemben?”') + say(this.say);
      case 'end': {
        const title = this.result === 'lose' ? 'Vesztettél…' : 'Nyertél!';
        return head(title) + say(this.say);
      }
      default:
        return '';
    }
  }

  dispose() {
    for (const ui of this.ui.values()) ui.box.remove();
    this.ui.clear();
  }
}
