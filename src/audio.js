/* ==== audio.js — the player's own music (assets/music, TERV.md 0.10): found at run time, crossfaded by situation ==== */

const DIR = 'assets/music/';
const EXTS = ['mp3', 'ogg', 'm4a'];
const FADE = 2.5; // seconds
const SWITCH_DELAY = 10; // seconds in a new situation before its music takes over
const SETTINGS_KEY = 'egy-lyuk-settings-v1';
const LEVELS = [1, 0.6, 0.3, 0];

let sharedCtx = null;
let fxGain = null;

/** The per-device settings (music, effects, look; NOTES-21-screens): never part of the game save. */
export function readSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

/** Merges `patch` into the stored settings. */
export function writeSettings(patch) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch }));
  } catch {
    /* storage blocked: the setting lasts for this page only */
  }
}

/** The stored effects volume 0..1 (default 1). */
export function effectsLevel() {
  const v = readSettings().fx;
  return typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 1;
}

/**
 * The one AudioContext of the game, shared by every synthesised sound (digging, goblins, drums, exits). Creating a
 * context can block the main thread for a few hundred ms, so it is made once, at the start screen's click, instead of
 * by each module at its first sound in the middle of play.
 * Effects volume (NOTES-21-screens): every module connects its sounds to `ctx.destination`; the context's own
 * `destination` is shadowed by one master gain in front of the real output, so the settings' effects knob reaches all
 * of them without touching the modules.
 */
export function sharedAudio() {
  if (!sharedCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      sharedCtx = new AC();
      try {
        fxGain = sharedCtx.createGain();
        fxGain.gain.value = effectsLevel();
        fxGain.connect(sharedCtx.destination);
        Object.defineProperty(sharedCtx, 'destination', { value: fxGain, configurable: true });
      } catch {
        fxGain = null;
      }
    }
  }
  return sharedCtx;
}

/** Sets (and stores) the effects volume 0..1. */
export function setEffectsLevel(v) {
  const lv = Math.max(0, Math.min(1, v));
  writeSettings({ fx: lv });
  if (fxGain) fxGain.gain.value = lv;
  return lv;
}

/** Finds the first existing file for a base name (tries .mp3, .ogg, .m4a); null when there is none. */
async function probe(name) {
  for (const ext of EXTS) {
    try {
      const r = await fetch(`${DIR}${name}.${ext}`, { method: 'HEAD', cache: 'no-store' });
      if (r.ok) return `${DIR}${name}.${ext}`;
    } catch {
      /* offline or blocked */
    }
  }
  return null;
}

/** All files of a numbered series name-1, name-2, … up to the first gap (max 100). */
async function probeSeries(prefix, max = 100) {
  const out = [];
  for (let n = 1; n <= max; n++) {
    const url = await probe(`${prefix}${n}`);
    if (!url) break;
    out.push(url);
  }
  return out;
}

export class Music {
  constructor() {
    this.lists = new Map(); // situation → Promise<urls[]>
    this.general = probeSeries('zene-');
    this.decks = [new Audio(), new Audio()];
    for (const d of this.decks) {
      d.preload = 'auto';
      d.addEventListener('ended', () => {
        if (d === this.decks[this.active]) this.next();
      });
    }
    this.active = 0;
    this.current = null; // the situation now playing
    this.wanted = null;
    this.wantedT = 0;
    this.index = new Map();
    this.duck = 1;
    // Ducking near Smaug (hoard/ sets it every frame: 1 far away, lower close to his head; NOTES-7a-hoard).
    this.near = 1;
    this.level = 1;
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (typeof s.music === 'number') this.level = s.music;
    } catch {
      /* no settings */
    }
    this.started = false;
  }

  /** The tracks of a situation: 'cim', 'felszin', 'reteg-1' … (series), 'halal' (single); empty when none. */
  list(situation) {
    if (!this.lists.has(situation)) {
      // 'stablista': the credits (NOTES-21-screens), meant for the player's own recording of the dwarves' song.
      const single = ['cim', 'halal', 'szmaug', 'menekules', 'unnep', 'stablista'].includes(situation);
      this.lists.set(situation, single ? probe(situation).then((u) => (u ? [u] : [])) : probeSeries(`${situation}-`));
    }
    return this.lists.get(situation);
  }

  /** Call after a user gesture (autoplay rules). */
  start(situation) {
    this.started = true;
    this.wanted = situation;
    this.switchTo(situation);
  }

  /** The game reports its situation every frame; the music follows after SWITCH_DELAY seconds (the title at once). */
  update(dt, situation) {
    if (!this.started) return;
    if (situation !== this.wanted) {
      this.wanted = situation;
      this.wantedT = 0;
    }
    this.wantedT += dt;
    if (this.wanted !== this.current && (this.wantedT > SWITCH_DELAY || this.current === 'cim')) this.switchTo(this.wanted);
    // Volume ramps (crossfade and ducking).
    const target = this.level * this.duck * this.near;
    this.decks.forEach((d, i) => {
      const goal = i === this.active ? target : 0;
      const step = dt / FADE;
      d.volume = Math.max(0, Math.min(1, d.volume + Math.max(-step, Math.min(step, goal - d.volume))));
      if (i !== this.active && d.volume === 0 && !d.paused) d.pause();
    });
  }

  async switchTo(situation) {
    this.current = situation;
    let urls = await this.list(situation);
    // Smaug's treasury without its own szmaug.mp3: the layer's own series first (NOTES-7a-hoard).
    if (!urls.length && situation === 'szmaug') urls = await this.list('reteg-9');
    if (!urls.length) urls = await this.general;
    if (this.current !== situation) return;
    // Two situations without their own music share the general list: keep it playing instead of restarting.
    if (urls === this.urls && !this.decks[this.active].paused) return;
    this.playFrom(urls, situation);
  }

  playFrom(urls, key) {
    if (!urls.length) {
      this.active = 1 - this.active; // fade out whatever plays
      return;
    }
    const i = ((this.index.get(key) ?? -1) + 1) % urls.length;
    this.index.set(key, i);
    this.active = 1 - this.active;
    const d = this.decks[this.active];
    d.src = urls[i];
    d.volume = 0;
    d.play().catch(() => {});
    this.urls = urls;
    this.key = key;
  }

  next() {
    if (this.urls) this.playFrom(this.urls, this.key);
  }

  /** A one-shot sting (death) over the ducked music. */
  async sting(name) {
    const urls = await this.list(name);
    if (!urls.length) return;
    const a = new Audio(urls[0]);
    a.volume = this.level;
    this.duck = 0.25;
    a.addEventListener('ended', () => {
      this.duck = 1;
    });
    a.play().catch(() => {
      this.duck = 1;
    });
  }

  /** M key: steps the music volume down 100 % → 60 % → 30 % → off → 100 % (from any knob setting: the next step below it). */
  cycleLevel() {
    const below = LEVELS.find((l) => l < this.level - 1e-3);
    return this.setLevel(below ?? LEVELS[0]);
  }

  /** The settings' music knob (NOTES-21-screens): sets and stores the music volume 0..1; returns it. */
  setLevel(v) {
    this.level = Math.max(0, Math.min(1, v));
    writeSettings({ music: this.level });
    return this.level;
  }
}
