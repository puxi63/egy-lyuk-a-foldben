/* ==== modes/versus.js — Versengés mód (TERV 0.11/20 "osztott képernyőn ki ás fel több kincset 10 perc alatt, külön
   pályán, a mentést nem érinti"; NOTES-15-modes).
   - Started from the title ("Versengés"): the page reloads into this mode with no save loaded, so the world is freshly
     generated (its own map, not the saved game's dug pit) and nothing is ever written (game.noSave, no save slot).
   - Two players in split screen: player 2 joins as usual (F2, or Start on a second pad). When both have picked their
     characters a short countdown runs, then VERSUS.duration seconds (10 minutes; `?vsTime=<s>` for QA).
   - The score is the treasure value dug: every find that lands in a player's bag is counted at its value and leaves
     the bag at once (no trips to the counter, no full bag). The plate stays full; a death costs only the time of the
     walk back. Everything else is the main game's digging, finds and HUD.
   - At the end both players are held and a winner page shows the scores; confirm = another round, back = the title.
   Cost: nothing per frame outside this mode; in it, a loop over the players and DOM writes only when a value changes. ==== */
import { START_KEY, VERSUS } from './rules.js';

const fmtTime = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export class Versus {
  constructor(game) {
    this.game = game;
    const q = +(game.params?.get('vsTime') || 0);
    this.duration = q > 0 ? q : VERSUS.duration;
    /** 'wait' (for the second player and the characters) → 'count' → 'run' → 'end'. */
    this.phase = 'wait';
    this.t = 0;
    this.left = this.duration;
    this.scores = [0, 0];
    this.counts = [0, 0];
    this.ui = [];
    this.endEl = null;
  }

  /** Both players are in and have picked a character. */
  ready() {
    const ps = this.game.players;
    return ps.length >= 2 && ps.every((p) => !p.choosing);
  }

  /** Per player before the normal controls (game.js): holds the players outside the race and on the winner page. */
  input(p, i, it) {
    if (this.phase === 'run') return false;
    if (this.phase === 'end') {
      if (i === 0 || this.game.players.length > 1) {
        if (it.confirmPressed || it.digPressed) this.again();
        else if (it.backPressed) this.toTitle();
      }
      return true;
    }
    return true; // waiting or counting down: nobody digs yet
  }

  update(dt) {
    const g = this.game;
    if (this.phase === 'wait') {
      if (this.ready()) {
        this.phase = 'count';
        this.t = VERSUS.countdown;
        for (const p of g.players) p.ladders = Math.max(p.ladders, VERSUS.ladders);
      }
    } else if (this.phase === 'count') {
      this.t -= dt;
      if (this.t <= 0) {
        this.phase = 'run';
        this.left = this.duration;
        for (const p of g.players) p.say('Ásás! Aki több kincset ás ki, nyer.', 3);
      }
    } else if (this.phase === 'run') {
      this.left -= dt;
      g.players.forEach((p, i) => {
        // The finds that landed count at their value and leave the bag (famous ones go to their case as usual).
        if (p.bag.length) {
          for (const f of p.bag) this.scores[i] += f.value || 0;
          this.counts[i] += p.bag.length;
          p.bag.length = 0;
        }
        const max = g.bagEnd?.effects?.hungerMax ?? 100;
        if (p.hunger < max) p.hunger = max;
      });
      if (this.left <= 0) this.finish();
    }
    for (let i = 0; i < g.players.length; i++) this.hud(i);
  }

  /** The race ends: everyone is held, the winner page shows. */
  finish() {
    this.phase = 'end';
    this.left = 0;
    const g = this.game;
    const names = g.players.map((p) => p.ch.name);
    const [a, b] = this.scores;
    this.winner = a === b ? -1 : a > b ? 0 : 1;
    this.showEnd(names);
  }

  /** The timer and both scores at the top of each player's view (inline styles: ui.css belongs to the UI work). */
  hud(i) {
    const g = this.game;
    const el = g.huds[i]?.el;
    if (!el) return;
    let u = this.ui[i];
    if (!u || u.el !== el) {
      const box = document.createElement('div');
      box.className = 'vs-box';
      Object.assign(box.style, {
        position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: '6', pointerEvents: 'none',
        padding: '4px 16px 6px', textAlign: 'center', color: '#3a2410', fontFamily: 'Almendra, "EB Garamond", Georgia, serif',
        background: 'linear-gradient(#efe0bc, #d9c08a)', border: '2px solid #6a4a22', borderRadius: '6px',
        boxShadow: '0 2px 8px #0008', minWidth: '170px',
      });
      box.innerHTML = '<div class="vs-t" style="font-size:24px;line-height:1.1"></div><div class="vs-s" style="font-size:15px"></div><div class="vs-o" style="font-size:12px;opacity:.75"></div>';
      el.append(box);
      u = this.ui[i] = { el, box, t: box.querySelector('.vs-t'), s: box.querySelector('.vs-s'), o: box.querySelector('.vs-o'), c: {} };
    }
    const set = (k, v, node) => {
      if (u.c[k] === v) return;
      u.c[k] = v;
      node.textContent = v;
    };
    const other = g.players[1 - i];
    let t;
    if (this.phase === 'wait') t = g.players.length < 2 ? 'Versengés' : 'Válasszatok!';
    else if (this.phase === 'count') t = `${Math.ceil(this.t)}…`;
    else t = fmtTime(this.left);
    set('t', t, u.t);
    set('s', this.phase === 'wait' && g.players.length < 2 ? 'A 2. játékos: F2, vagy Start a 2. kontrolleren' : `Kincs: ${this.scores[i]} arany`, u.s);
    set('o', other && this.phase !== 'wait' ? `${other.ch.name}: ${this.scores[1 - i]} arany` : `${fmtTime(this.duration)} perc, aki több kincset ás ki`, u.o);
  }

  /** The winner page over both views. */
  showEnd(names) {
    if (this.endEl) return;
    const el = document.createElement('div');
    el.className = 'vs-end';
    Object.assign(el.style, {
      position: 'fixed', inset: '0', zIndex: '50', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, #0006, #000c)', fontFamily: 'Almendra, "EB Garamond", Georgia, serif',
    });
    const rows = names.map((n, i) => `<div style="display:flex;justify-content:space-between;gap:28px;font-size:22px;padding:4px 0;${i === this.winner ? 'color:#7a1a0a;font-weight:bold' : ''}">
      <span>${n}</span><span>${this.scores[i]} arany · ${this.counts[i]} lelet</span></div>`).join('');
    const head = this.winner < 0 ? 'Döntetlen!' : `${names[this.winner]} nyert!`;
    el.innerHTML = `<div style="min-width:min(520px,90vw);padding:26px 40px 22px;color:#3a2410;text-align:center;
        background:linear-gradient(#f2e6c6,#d8bf86);border:3px solid #6a4a22;border-radius:8px;box-shadow:0 8px 40px #000">
      <div style="font-family:'Uncial Antiqua',Almendra,serif;font-size:18px;letter-spacing:2px;opacity:.8">Versengés vége</div>
      <h2 class="vs-win" style="margin:6px 0 14px;font-size:38px;font-family:'Uncial Antiqua',Almendra,serif">${head}</h2>
      ${rows}
      <div style="margin-top:18px;font-size:16px;opacity:.85">Enter / A: még egy kör · Esc / B: vissza a címhez</div></div>`;
    document.body.append(el);
    this.endEl = el;
  }

  again() {
    try {
      sessionStorage.setItem(START_KEY, JSON.stringify({ mode: 'versus' }));
    } catch {
      /* storage blocked: the title comes back */
    }
    location.reload();
  }

  toTitle() {
    try {
      sessionStorage.removeItem(START_KEY);
    } catch {
      /* storage blocked */
    }
    location.reload();
  }

  /** QA: the state in one object. */
  info() {
    return { phase: this.phase, left: +this.left.toFixed(2), scores: [...this.scores], counts: [...this.counts], winner: this.winner ?? null, duration: this.duration };
  }
}
