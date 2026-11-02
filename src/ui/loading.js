/* ==== ui/loading.js — the loading screen (TERV 0.12 Betöltés; NOTES-21-screens) ====
 * A page of Bilbo's book: a pencil drawing of the place the game will open at (Bag End for a new game, else the deepest
 * layer reached in the save that will load), its name, and a short line from the book underneath.
 *
 * Loaded by index.html as its own small module before main.js, so it shows while three.js and the game's modules are
 * still downloading. It imports nothing heavy (no three.js, no materials.js: the layer table is copied below and
 * qa/screens checks it against materials.js).
 *
 * Honest about the load (NOTES-20-startup): while the field workers run, the drawing is sketched in and the progress
 * line follows the finished slabs (field-start.js reports them). Right before the Game constructor (about 5 s on the
 * main thread) main.js calls `freeze()`: the text says the page will stand still for a few seconds; only the pencil
 * keeps moving then (a transform animation, which the compositor runs without the main thread). `done()` fades the page
 * out and removes it. With `?bench` the screen removes itself at once. ==== */

const params = new URLSearchParams(location.search);

/** materials.js LAYER_TOPS / LAYER_NAMES, copied (that module pulls in the level sites); qa/screens compares them. */
export const TOPS = [0, 35, 90, 150, 230, 300, 390, 470, 580];
export const NAMES = ['Zsáklak kertje', 'Hobbitüregek és pincék', 'A trollok barlangja', 'Goblinváros (Ködhegység)', 'Gollam tava', 'Bakacsinerdő gyökerei', 'Tóváros alatt', 'Erebor tárnái', 'Szmaug kincstára'];

/**
 * The line under each drawing: very short lines from the book in free translation, or a plain summary of what the book
 * tells. All marked [ellenőrizendő]: the wording of the published Hungarian translation was not checked.
 */
export const LINES = {
  bagend: { q: '„Egy lyuk a földben élt egy hobbit.”', src: 'A hobbit, 1. fejezet: az első mondat, szabad fordításban' },
  'layer-1': { q: '„Jó reggelt!”', src: 'Bilbó Gandalfnak, 1. fejezet' },
  'layer-2': { q: '„Kalandok? Kellemetlen dolgok! Elkésik tőlük az ember a vacsoráról.”', src: 'Bilbó, 1. fejezet, szabad fordításban' },
  'layer-3': { q: '„Virradjon rátok, és váljatok kővé!”', src: 'Gandalf a trolloknak, 2. fejezet, szabad fordításban' },
  'layer-4': { q: 'A sötét alagútban, négykézláb kúszva, Bilbó keze egy gyűrűre tévedt.', src: 'az 5. fejezet nyomán' },
  'layer-5': { q: '„Mi van a zsebemben?”', src: 'Bilbó kérdése Gollamhoz, 5. fejezet' },
  'layer-6': { q: '„Le ne térjetek az ösvényről!”', src: 'Gandalf intelme, 7. fejezet, szabad fordításban' },
  'layer-7': { q: 'Tóváros nem a parton állt, hanem kint a tavon, hatalmas cölöpökön.', src: 'a 10. fejezet nyomán' },
  'layer-8': { q: '„Ha többre becsülnénk az ételt és a dalt az aranynál, vidámabb volna a világ.”', src: 'Thorin, 18. fejezet, szabad fordításban' },
  'layer-9': { q: '„Élő sárkányon soha ne nevess!”', src: '12. fejezet, szabad fordításban' },
};

/** The deepest depth reached in a raw save string (players' `maxDepth`), without parsing the whole save. */
export function deepestIn(raw) {
  let d = 0;
  for (const m of raw.matchAll(/"maxDepth":(\d+(?:\.\d+)?)/g)) d = Math.max(d, +m[1]);
  return d;
}

/** Which place the game will open at: mirrors main.js's choice of slot (the one-shot start choice, ?mode=, the newer save). */
export function pickPlace() {
  let intent = null;
  try {
    intent = JSON.parse(sessionStorage.getItem('egy-lyuk-start') || 'null'); // modes/rules.js START_KEY (not removed here)
  } catch {
    intent = null;
  }
  const want = intent?.mode || params.get('mode');
  if (want === 'versus' || intent?.fresh) return 'bagend';
  const read = (k) => {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      const t = +(raw.match(/"t":(\d+)/)?.[1] || 0);
      return { raw, t };
    } catch {
      return null;
    }
  };
  const n = read('egy-lyuk-save-v1');
  const k = read('egy-lyuk-save-kihivas-v1');
  const s = want === 'kihivas' ? k : want === 'normal' ? n : k && (!n || k.t > n.t) ? k : n;
  return s ? placeAt(deepestIn(s.raw)) : 'bagend';
}

/** The location key of a depth (sketches.js keys). */
export function placeAt(depth) {
  if (!(depth > 0.5)) return 'bagend';
  let i = 0;
  TOPS.forEach((t, j) => {
    if (depth >= t) i = j;
  });
  return `layer-${i + 1}`;
}

/** The screen's public face (main.js, field-start.js, QA: window.__loading). */
export const loading = {
  el: null,
  place: null,
  stage: 'start',
  gen: { done: 0, total: 0 },
  /** Field worker progress: `done` of `total` slabs (field-start.js). */
  progress(done, total) {
    this.gen = { done, total };
    if (!this.el || this.stage === 'freeze') return;
    this.stage = 'gen';
    this.el.querySelector('.ld-bar i').style.transform = `scaleX(${(0.1 + 0.7 * (done / Math.max(1, total))).toFixed(3)})`;
    this.el.querySelector('.ld-msg').textContent = `A föld rétegei készülnek … ${done} / ${total}`;
  },
  /** Right before the Game constructor: say plainly that the page will stand still for a few seconds. */
  freeze() {
    this.stage = 'freeze';
    if (!this.el) return;
    this.el.classList.add('freezing');
    this.el.querySelector('.ld-bar i').style.transform = 'scaleX(0.9)';
    this.el.querySelector('.ld-msg').innerHTML = 'A világ összeáll. <b>A lap most néhány másodpercre megáll</b> — ez így van rendjén, nem fagyott le.';
  },
  /** The Game exists: fade out, then remove the page (no animation is left running). */
  done() {
    this.stage = 'done';
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.add('gone');
    setTimeout(() => el.remove(), 700);
  },
};
window.__loading = loading;

async function mount() {
  const el = document.getElementById('loading');
  if (!el) return;
  if (params.get('bench')) {
    el.remove();
    return;
  }
  const place = pickPlace();
  loading.place = place;
  loading.el = el;
  const { SKETCHES } = await import('./sketches.js');
  const name = place === 'bagend' ? 'Zsáklak, a Domb alatt' : NAMES[+place.split('-')[1] - 1];
  const line = LINES[place];
  el.querySelector('.ld-draw').innerHTML = SKETCHES[place]();
  el.querySelector('.ld-place').textContent = name;
  el.querySelector('.ld-q').textContent = line.q;
  el.querySelector('.ld-src').innerHTML = `${line.src} <span class="chk">[ellenőrizendő]</span>`;
  el.classList.add('ready');
  // Progress that arrived before the drawing was mounted.
  if (loading.stage === 'freeze') loading.freeze();
  else if (loading.gen.total) loading.progress(loading.gen.done, loading.gen.total);
}
mount();
