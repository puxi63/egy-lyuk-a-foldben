/* ==== erebor-puzzles/runelock.js — the rune lock of a dwarf chest (TERV 0.11/8: "Balin lefordítja a feliratot, a
   megfejtés egy egyszerű rúna-kirakós (törpe rúnák párosítása)"; technical note h.: minigames are self-contained, with
   their own input mapping, in single player and in split screen). A parchment in the player's own viewport: the chest's
   inscription in the runes the game already uses (ui/runes.js: the Old English runes Tolkien put on Thrór's map for the
   dwarves' runes), and for each rune in turn its sound is picked from four. Three wrong picks jam the lock for a while;
   a wrong sound stays crossed out (trial and error gets there, slowly). Balin's reading shows the word under the runes;
   a rune stone in the bag shows a key of rune shapes and sounds (a matching puzzle). ==== */
import { toRunes } from '../ui/runes.js';

export const LOCK = {
  mistakes: 3, // wrong picks that jam the lock
  jam: 20, // s the jammed lock rests
  won: 1.2, // s the solved parchment stays
  shut: 1.6, // s the jammed parchment stays
};

/** The sound of each rune (the letters ui/runes.js maps to it; Hungarian accents folded). */
const SOUND = {
  'ᚪ': 'A', 'ᛒ': 'B', 'ᚳ': 'K', 'ᛞ': 'D', 'ᛖ': 'E', 'ᚠ': 'F', 'ᚷ': 'G', 'ᚻ': 'H', 'ᛁ': 'I', 'ᛄ': 'J', 'ᛚ': 'L', 'ᛗ': 'M',
  'ᚾ': 'N', 'ᚩ': 'O', 'ᛈ': 'P', 'ᚱ': 'R', 'ᛋ': 'S', 'ᛏ': 'T', 'ᚢ': 'U', 'ᚹ': 'V', 'ᛉ': 'X', 'ᚣ': 'Ü', 'ᛟ': 'Ö', 'ᚦ': 'TH', 'ᛝ': 'NG',
};
const ALL = Object.keys(SOUND);

/**
 * The inscriptions: names of Durin's line from the book (Thrór, King under the Mountain; Thráin his son; Dáin of the
 * Iron Hills, ch. 15; Durin, "the father of the fathers of the eldest race", ch. 3). A chest of Erebor bearing its
 * owner's name: no invented artefact (Decision 18). The meaning is shown with Balin's reading.
 */
export const WORDS = [
  { word: 'Thrór', means: 'Thrór, a Hegy alatti király neve' },
  { word: 'Durin', means: 'Durin, a törpék ősatyjának neve' },
  { word: 'Thráin', means: 'Thráin, Thrór fiának neve' },
  { word: 'Dáin', means: 'Dáin, a Vas-hegyek urának neve' },
];

/** A small deterministic generator (the options stay the same for a chest between tries and loads). */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** The puzzle of a chest: its runes, the four sounds offered for each, the rune-stone key. */
export function puzzleFor(chestId, index) {
  const w = WORDS[index % WORDS.length];
  const glyphs = [...toRunes(w.word)];
  const r = rng(hash(`erebor-chest-${chestId}`));
  const opts = glyphs.map((g) => {
    const pool = ALL.filter((x) => SOUND[x] !== SOUND[g]);
    const pick = [SOUND[g]];
    while (pick.length < 4) {
      const s = SOUND[pool[Math.floor(r() * pool.length)]];
      if (!pick.includes(s)) pick.push(s);
    }
    for (let i = pick.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pick[i], pick[j]] = [pick[j], pick[i]];
    }
    return pick;
  });
  // The rune stone's key: the inscription's runes and three others, shuffled.
  const key = [...new Set(glyphs)];
  while (key.length < new Set(glyphs).size + 3) {
    const g = ALL[Math.floor(r() * ALL.length)];
    if (!key.includes(g)) key.push(g);
  }
  for (let i = key.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [key[i], key[j]] = [key[j], key[i]];
  }
  return { word: w.word, means: w.means, glyphs, sounds: glyphs.map((g) => SOUND[g]), opts, key };
}

/** True when a find is a rune stone (the world work's layer-8 "törpe rúnakő" finds; TERV 0.2). */
export function isRuneStone(type) {
  return !!type && (/run/i.test(type.id) || /rúnak/i.test(type.name || ''));
}

/** One player's open rune lock. */
export class RuneLock {
  constructor(owner, p, i, chest) {
    this.owner = owner;
    this.p = p;
    this.i = i;
    this.chest = chest;
    this.pz = chest.puzzle;
    this.idx = 0;
    this.sel = 0;
    this.mistakes = 0;
    this.phase = 'play';
    this.t = 0;
    this.msg = '';
    this.skipCrossed(1);
  }

  get crossed() {
    return (this.chest.crossed[this.idx] ||= new Set());
  }

  skipCrossed(dir) {
    const o = this.pz.opts[this.idx];
    if (!o) return;
    for (let n = 0; n < 4 && this.crossed.has(o[this.sel]); n++) this.sel = (this.sel + dir + 4) % 4;
  }

  /** The player's intent while the parchment is open. Returns false when the player leaves it (the back key). */
  input(it) {
    // Solved or jammed: the parchment stays a moment (index.js closes it after LOCK.won / LOCK.shut).
    if (this.phase !== 'play') return true;
    if (it.backPressed) {
      this.p.say('Otthagytad a zárat.', 1.5);
      return false;
    }
    const step = (it.leftPressed || it.upPressed ? -1 : 0) + (it.rightPressed || it.downPressed ? 1 : 0);
    if (step) {
      this.sel = (this.sel + step + 4) % 4;
      this.skipCrossed(step);
    }
    if (it.confirmPressed || it.digPressed || it.interactPressed) this.choose(this.sel);
    return true;
  }

  choose(k) {
    const o = this.pz.opts[this.idx];
    const s = o?.[k];
    if (!s || this.crossed.has(s)) return;
    if (s === this.pz.sounds[this.idx]) {
      this.idx++;
      this.owner.sound('tick', this.chest);
      if (this.idx >= this.pz.glyphs.length) {
        this.phase = 'won';
        this.t = 0;
        this.msg = 'A zár kattan, a fedél enged!';
        this.owner.solved(this.chest, this.p);
        return;
      }
      this.sel = 0;
      this.skipCrossed(1);
      this.msg = '';
      return;
    }
    this.crossed.add(s);
    this.mistakes++;
    this.owner.sound('clunk', this.chest);
    if (this.mistakes >= LOCK.mistakes) {
      this.phase = 'jam';
      this.t = 0;
      this.chest.jam = LOCK.jam;
      this.msg = 'A zár beragadt! Várj egy kicsit, aztán próbáld újra.';
      return;
    }
    this.msg = `Nem ez a hangja. (${LOCK.mistakes - this.mistakes} tévedés még belefér)`;
    this.skipCrossed(1);
  }

  /** The parchment's content (this player's own keys `g`). */
  html(g) {
    const pz = this.pz;
    const read = this.chest.read;
    const keyHave = this.owner.hasRuneStone(this.p);
    const head = (t) => `<div style="font-family:var(--f-head);font-size:1.25em;color:#5a2a0a;margin-bottom:0.2em">${t}</div>`;
    const runes = pz.glyphs.map((gl, k) => {
      const done = k < this.idx;
      const cur = k === this.idx && this.phase === 'play';
      const under = done ? pz.sounds[k] : read ? `<span style="opacity:0.55">${pz.sounds[k]}</span>` : '·';
      return `<div class="rl-cell" style="display:inline-block;margin:0 0.18em;min-width:1.7em;padding:0.1em 0.15em;border-radius:0.2em;${cur ? 'box-shadow:inset 0 0 0 2px #7a3a10;background:#7a3a1018' : ''}">
        <div style="font-size:2.1em;line-height:1.1;color:${done ? '#2a5a1a' : '#3a2010'}">${gl}</div>
        <div style="font-size:0.9em;font-weight:bold;color:${done ? '#2a5a1a' : '#6a4a2a'}">${under}</div></div>`;
    }).join('');
    let body = '';
    if (this.phase === 'play') {
      const o = pz.opts[this.idx];
      const opts = o.map((s, k) => {
        const x = this.crossed.has(s);
        const on = k === this.sel && !x;
        return `<span style="display:inline-block;margin:0.15em 0.25em;padding:0.1em 0.55em;border-radius:0.2em;min-width:1.4em;${x ? 'text-decoration:line-through;opacity:0.35' : ''}${on ? ';background:#7a3a1022;box-shadow:inset 0 0 0 2px #7a3a10;font-weight:bold' : ''}">${on ? '▸ ' : ''}${s}</span>`;
      }).join('');
      body += `<div style="margin:0.35em 0 0.1em">Melyik hangot jelöli a kiemelt rúna?</div><div style="font-size:1.15em">${opts}</div>`;
      if (read) body += `<div style="margin-top:0.35em;font-style:italic;color:#4a3a28">Balin olvasata: „${pz.word.toUpperCase()}” — ${pz.means}.</div>`;
      else if (keyHave) {
        const key = pz.key.map((gl) => `<span style="display:inline-block;margin:0 0.3em"><span style="font-size:1.35em">${gl}</span> ${SOUND[gl]}</span>`).join('');
        body += `<div style="margin-top:0.35em;font-size:0.9em;color:#4a3a28">A rúnakő kulcsa: ${key}</div>`;
      } else {
        const balin = this.owner.game.players.some((q) => !q.choosing && q.ch.id === 'balin');
        body += `<div style="margin-top:0.35em;font-size:0.85em;color:#5a4a34">${balin ? 'Balin el tudná olvasni a feliratot.' : 'Próbálgatás: a téves hang kiesik, de három tévedés beragasztja a zárat.'}</div>`;
      }
      body += `<div style="margin-top:0.4em;font-size:0.8em;color:#5a4a34">${g.nav} választás · ${g.confirm} ez az · ${g.back} kilépés</div>`;
    }
    const msg = this.msg ? `<div style="margin-top:0.3em;font-style:italic;color:${this.phase === 'won' ? '#2a5a1a' : '#7a2a10'}">${this.msg}</div>` : '';
    const marks = this.phase === 'play' ? `<div style="font-size:0.8em;color:#7a2a10;margin-top:0.2em">${'✕ '.repeat(this.mistakes)}</div>` : '';
    return head('Rúnazáras törpeláda') + `<div style="margin:0.2em 0">${runes}</div>` + body + marks + msg;
  }
}

export { SOUND };
