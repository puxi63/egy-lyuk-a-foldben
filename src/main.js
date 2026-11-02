/* ==== main.js — entry: load the save, the start screen (Folytatás / Új játék / Kihívás / Versengés), then the game ====
   modes (NOTES-15-modes): the title offers a new game in normal or Kihívás mode and Versengés; Kihívás has its own save
   slot. A choice that needs another world (a new game, the other slot, Versengés) is handed across a reload as a one-shot
   sessionStorage entry (START_KEY), so the world behind the title is always built for the mode that will be played.
   screens (NOTES-21-screens): the loading screen (ui/loading.js) covers the load and says when the page will stand
   still; the title's board also offers Beállítások (B) and Stáblista (S), drawn by ui/screens.js. */
// Load flow (NOTES-20-startup): first import, so the field workers start before the rest of the graph evaluates.
import { fieldGen } from './field-start.js';
import { Game } from './game.js';
import { loadSave, peekSave } from './save.js';
import { sharedAudio } from './audio.js';
import { START_KEY } from './modes/rules.js';
// The loading screen (NOTES-21-screens): index.html loaded it already; this is the same module instance.
import { loading } from './ui/loading.js';

const params = new URLSearchParams(location.search);
let intent = null;
try {
  intent = JSON.parse(sessionStorage.getItem(START_KEY) || 'null');
  sessionStorage.removeItem(START_KEY);
} catch {
  intent = null;
}
let mode = 'normal';
let save = null;
if (!params.get('bench')) {
  // The title's choice; else `?mode=` (a direct link / QA); else the newer of the two slots.
  const want = intent?.mode || params.get('mode');
  if (want === 'versus') mode = 'versus';
  else if (intent?.fresh) mode = intent.mode === 'kihivas' ? 'kihivas' : 'normal';
  else {
    const n = peekSave('normal');
    const k = peekSave('kihivas');
    mode = want === 'kihivas' || want === 'normal' ? want : k && (!n || k.t > n.t) ? 'kihivas' : 'normal';
    save = await loadSave(mode);
  }
}
const gen = await fieldGen;
// The Game constructor blocks the page for a few seconds (NOTES-20-startup): say so first and let that text paint.
loading.freeze();
if (!params.get('bench')) {
  await Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    new Promise((r) => setTimeout(r, 150)), // a hidden tab runs no animation frames
  ]);
}
const game = new Game(params, save, { mode: params.get('bench') ? null : mode, genMs: gen?.ms, genWorkers: gen?.workers });
loading.done();
const start = document.getElementById('start');
const choices = document.getElementById('choices');
const extras = document.getElementById('extras');

if (game.bench) {
  start.remove();
  // Repeatable runs: the goblins' spawns, looks and wanderings come from Math.random, seeded here (bench only).
  let seed = 0x9e3779b9;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Made at start like after the start screen's click in play, so the bench does not time its creation.
  sharedAudio();
  game.benchSetup();
} else {
  const begin = () => {
    if (start.classList.contains('gone')) return;
    start.classList.add('gone');
    game.screens.titleUp = false; // screens (NOTES-21-screens): Esc / Start pause from now on
    game.input.lockPointer();
    game.music.start(game.musicSituation());
    sharedAudio();
  };
  const when = (t) => new Date(t).toLocaleString('hu-HU', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const other = mode === 'kihivas' ? 'normal' : 'kihivas';
  const otherSave = mode === 'versus' ? null : peekSave(other);
  // A new game over an existing save of that slot needs a second press (that save is deleted).
  const armed = new Set();
  const newGame = (m, btn) => {
    if (m === mode && !save && m !== 'versus') return begin();
    if (m !== 'versus' && peekSave(m) && !armed.has(m)) {
      armed.add(m);
      btn.innerHTML = `Biztosan? <small>${m === 'kihivas' ? 'A Kihívás-mentés' : 'A mentés'} törlődik. Még egyszer: ${btn.dataset.key}</small>`;
      return;
    }
    game.newGame(m);
  };
  const list = [];
  const add = (id, key, html, act) => list.push({ id, key, html, act });
  if (mode === 'versus') add('begin-btn', 'Enter', 'Versengés indul! <small>2 játékos osztott képernyőn, 10 perc · Enter / A</small>', begin);
  else if (save) add('cont-btn', 'Enter', `Folytatás${mode === 'kihivas' ? ' · Kihívás' : ''} <small>Enter / A · mentve: ${when(save.t)}</small>`, begin);
  else add('begin-btn', 'Enter', `Indulás!${mode === 'kihivas' ? ' · Kihívás mód' : ''} <small>Enter / A</small>`, begin);
  if (otherSave) {
    add('other-btn', 'F', `Folytatás: ${other === 'kihivas' ? 'a Kihívás-mentés' : 'a normál mentés'} <small>F · mentve: ${when(otherSave.t)}</small>`, () => {
      try {
        sessionStorage.setItem(START_KEY, JSON.stringify({ mode: other }));
      } catch {
        /* storage blocked */
      }
      game.noSave = true;
      location.reload();
    });
  }
  if (mode !== 'normal' || save) add('new-btn', 'N', 'Új játék <small>N / Y</small>', (b) => newGame('normal', b));
  if (mode !== 'kihivas' || save) add('kihivas-btn', 'K', 'Új játék Kihívás módban <small>K · erősebb veszélyek, végleges veszteség</small>', (b) => newGame('kihivas', b));
  if (mode !== 'versus') add('versus-btn', 'V', 'Versengés <small>V · 2 játékos, 10 perc, a mentést nem érinti</small>', (b) => newGame('versus', b));
  choices.innerHTML = list.map((b) => `<button id="${b.id}" data-key="${b.key}">${b.html}</button>`).join('');
  // screens (NOTES-21-screens): the settings desk and the credits, painted smaller at the board's foot.
  const more = [
    { id: 'settings-btn', key: 'B', html: 'Beállítások <small>B</small>', act: () => game.screens.openSettings(() => {}) },
    { id: 'credits-btn', key: 'S', html: 'Stáblista <small>S</small>', act: () => game.screens.playCredits() },
  ];
  extras.innerHTML = more.map((b) => `<button id="${b.id}" data-key="${b.key}">${b.html}</button>`).join('');
  const buttons = list.map((b) => document.getElementById(b.id));
  // The choices after the first are smaller, so the board still clears the controls panel on short screens.
  // The first choice spans the board, the rest sit two to a row.
  Object.assign(choices.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '0.4rem' });
  buttons[0].style.gridColumn = '1 / -1';
  buttons.slice(1).forEach((b) => Object.assign(b.style, { fontSize: '1.1rem', padding: '0.1rem 0.4rem', lineHeight: '1.15' }));
  if (buttons.length % 2 === 0) buttons[buttons.length - 1].style.gridColumn = '1 / -1';
  // One highlight over the choices and the two extras (arrows / D-pad), painted as a brush stroke (ui.css .sel).
  const all = [...list, ...more];
  const allBtns = [...buttons, ...more.map((b) => document.getElementById(b.id))];
  let sel = 0;
  const mark = () => allBtns.forEach((b, i) => b.classList.toggle('sel', i === sel));
  const press = (i) => all[i].act(allBtns[i]);
  allBtns.forEach((b, i) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (game.screens.busy) return;
    sel = i;
    mark();
    press(i);
  }));
  mark();
  const move = (d) => {
    sel = (sel + d + all.length) % all.length;
    mark();
  };
  const titleIdle = () => !start.classList.contains('gone') && !game.screens.busy;
  window.addEventListener('keydown', (e) => {
    if (!titleIdle()) return;
    if (e.code === 'Enter') press(sel);
    if (e.code === 'ArrowDown') move(1);
    if (e.code === 'ArrowUp') move(-1);
    const k = all.findIndex((b) => b.key.length === 1 && e.code === `Key${b.key}`);
    if (k >= 0) press(k);
  });
  game.canvas.addEventListener('click', () => game.input.lockPointer());
  // A pad: A (or Start) presses the highlighted choice, the D-pad moves, Y starts a new game.
  const prev = new Map();
  const padWait = () => {
    if (start.classList.contains('gone')) return;
    for (const p of game.input.pads()) {
      const was = prev.get(p.index) || [];
      const now = p.buttons.map((b) => b.pressed);
      const edge = (n) => now[n] && !was[n];
      prev.set(p.index, now);
      if (game.screens.busy) continue; // the settings / credits read the pads themselves
      if (edge(0) || edge(9)) press(sel);
      if (edge(12)) move(-1);
      if (edge(13)) move(1);
      const nb = list.findIndex((b) => b.id === 'new-btn');
      if (edge(3) && nb >= 0) press(nb);
    }
    requestAnimationFrame(padWait);
  };
  padWait();
}
game.start();
