/* ==== daynight.js — the shared game day clock (TERV 0.7 "Napszakok", the moon phases for Thrór's moon-letters) and
   the surface's look by time of day (NOTES-10-daynight).

   THE CLOCK: one clock for both players. Its time source is Bag End's play clock (`game.bagEnd.clock`, real seconds,
   saved with the house; the cellar wine ages on it), so there is no second clock and nothing new in the save: a save
   without it starts at 08:00 of day 1. Sleeping and the enchanted stream move that clock forward.
   A game day lasts DAY.length real seconds (20 minutes), split unevenly (DAY.map): dawn 1.5 min, day 9 min, evening
   4 min, night 5.5 min — the evenings come round every 20 minutes and last long enough for Durin's door, the nights
   are short and readable.

   API (`game.dayClock`): hour() 0..24, day() 1.., isNight(), isEvening(), isDawn(), isDay(), moonPhase() 0..1
   (0 new, 0.5 full), moonIndex() 0..7, moonName(), phaseName(), realMinutesUntil(h), advance(hours), advanceTo(h),
   sleep(p) (the bed), and the hooks onDawn / onDusk / onEvening (functions) plus game.events.emit('dawn' | 'dusk' |
   'evening', info). 'dusk' = night begins (21:00), 'dawn' = night ends (05:00); a sleep that jumps over the night
   fires only 'dawn'.

   THE LOOK (DayLook): per frame it blends a few keyframes of the surface palette (fog, hemisphere, sun / moon light,
   sky dome colours, the painted panorama's tint) into `lighting.tod`, which lighting.js applyView() uses instead of
   its fixed golden afternoon; it moves the one directional light (sun by day, moon by night: no extra light, no new
   program, no shadow pass), scales the surface's emissive and lamp-glass materials, and tints layer 8's sun-shaft
   opening. Only uniforms and colours change.
   NIGHT EXTRAS (NOTES-28-night): the stars in the sky dome (`uStars`), the lanterns and windows lit at night
   (`GLOW_NIGHT`, the glass material's own uniform), and the fireflies (one Points object, shown only while they are out).
   All three are 0 / hidden at the bench pages' 16:30. ==== */
import * as THREE from 'three';
import { buildFireflies, FIREFLY_ON } from './surface/fireflies.js';
import { GLOW_NIGHT } from './surface/mats.js';
import { SKY_UNIFORMS } from './surface/sky.js';

/** The clock's constants. Hours are game hours (0..24), lengths are real seconds. */
export const DAY = {
  /** Real seconds of one game day (see the header and NOTES-10 for why 20 minutes). */
  length: 1200,
  /** [real second within the day, game hour], piecewise linear; the cycle starts at dawn, 05:00. */
  map: [[0, 5], [90, 7], [630, 17], [870, 21], [1200, 29]],
  /** A new game (clock 0) starts at this hour of day 1. */
  startHour: 8,
  /** The evening window (the setting sun: Durin's door), [from, to). */
  eveningFrom: 17.5,
  eveningTo: 21,
  /** Night: [nightFrom, 24) and [0, nightTo). */
  nightFrom: 21,
  nightTo: 5,
  /** Dawn: [nightTo, dawnTo). */
  dawnTo: 7,
  /** The bed wakes the sleepers at this hour. */
  wakeHour: 7,
  /** Game hours lost in Mirkwood's enchanted sleep. */
  enchantedSleepHours: 4,
  /** A moon cycle of this many game days (one phase per day), starting at the waxing crescent on day 1. */
  moonDays: 8,
  moonStart: 1,
  /** The bench and gallery pages hold this hour (the golden afternoon the game had before the clock). */
  benchHour: 16.5,
  /** Sun rise / set hours of the sky model (DayLook). */
  sunRise: 5.25,
  sunSet: 19.75,
};

const L = DAY.length;
const mod = (a, n) => ((a % n) + n) % n;

/** Real second within the day → game hour. */
function secToHour(s) {
  const m = DAY.map;
  for (let i = 1; i < m.length; i++) {
    if (s <= m[i][0]) {
      const [s0, h0] = m[i - 1];
      const [s1, h1] = m[i];
      return mod(h0 + ((s - s0) / (s1 - s0)) * (h1 - h0), 24);
    }
  }
  return DAY.map[0][1];
}

/** Game hour → real second within the day. */
function hourToSec(h) {
  const m = DAY.map;
  let hh = mod(h, 24);
  if (hh < m[0][1]) hh += 24;
  for (let i = 1; i < m.length; i++) {
    if (hh <= m[i][1]) {
      const [s0, h0] = m[i - 1];
      const [s1, h1] = m[i];
      return s0 + ((hh - h0) / (h1 - h0)) * (s1 - s0);
    }
  }
  return 0;
}

const START = hourToSec(DAY.startHour);

/** The moon phases' Hungarian names (index 0 new … 4 full … 7 waning crescent). */
export const MOON_NAMES = ['újhold', 'növekvő sarló', 'első negyed', 'növekvő hold', 'telihold', 'fogyó hold', 'utolsó negyed', 'fogyó sarló'];

/** The HUD's word for the time of day. */
function phaseWord(h) {
  if (h >= DAY.nightFrom || h < DAY.nightTo) return 'Éjszaka';
  if (h < DAY.dawnTo) return 'Hajnal';
  if (h < 10) return 'Reggel';
  if (h < 12) return 'Délelőtt';
  if (h < 13.5) return 'Dél';
  if (h < DAY.eveningFrom) return 'Délután';
  return 'Este';
}

/** The coarse state the events follow. */
function stateOf(h) {
  if (h >= DAY.nightFrom || h < DAY.nightTo) return 'night';
  if (h >= DAY.eveningFrom) return 'evening';
  return 'day';
}

export class DayClock {
  constructor(game) {
    this.game = game;
    const q = game.params?.get?.('hour');
    /** Bench / gallery pages hold a fixed hour (`?hour=` overrides it); null = the clock runs. */
    this.fixedHour = game.bench ? (q != null && q !== '' ? +q : DAY.benchHour) : null;
    this.fixedDay = 1;
    /** Hooks for the next features (goblin night, the auction): called with { day, hour }. */
    this.onDawn = null;
    this.onDusk = null;
    this.onEvening = null;
    this.prev = null;
    this.look = new DayLook(game);
    // A dev / QA start hour on a normal page (moves the saved clock forward once).
    if (!game.bench && q != null && q !== '') this.advanceTo(+q);
  }

  /* ---------------- queries ---------------- */

  /** Real seconds since the dawn of day 1 (Bag End's play clock + the start offset). */
  get seconds() {
    return (this.game.bagEnd?.clock || 0) + START;
  }

  hour() {
    return this.fixedHour != null ? this.fixedHour : secToHour(mod(this.seconds, L));
  }

  /** The day number, 1 on a new game; it turns at dawn (05:00). */
  day() {
    return this.fixedHour != null ? this.fixedDay : Math.floor(this.seconds / L) + 1;
  }

  isNight(h = this.hour()) {
    return h >= DAY.nightFrom || h < DAY.nightTo;
  }

  /** The setting sun (Durin's door): 17:30–21:00. */
  isEvening(h = this.hour()) {
    return h >= DAY.eveningFrom && h < DAY.eveningTo;
  }

  isDawn(h = this.hour()) {
    return h >= DAY.nightTo && h < DAY.dawnTo;
  }

  isDay(h = this.hour()) {
    return h >= DAY.nightTo && h < DAY.eveningFrom;
  }

  /** 0..7: one phase per day, cycling every DAY.moonDays days. */
  moonIndex() {
    return mod(this.day() - 1 + DAY.moonStart, DAY.moonDays);
  }

  /** 0..1 (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter). */
  moonPhase() {
    return this.moonIndex() / DAY.moonDays;
  }

  moonName() {
    return MOON_NAMES[Math.round((this.moonPhase() * 8)) % 8];
  }

  /** The moon's brightness 0..1 by its phase. */
  moonLight() {
    return (1 - Math.cos(this.moonPhase() * Math.PI * 2)) / 2;
  }

  /** The HUD word: Hajnal, Reggel, Délelőtt, Dél, Délután, Este, Éjszaka. */
  phaseName(h = this.hour()) {
    return phaseWord(h);
  }

  /** Real minutes until the clock next shows hour `h` (0 when it is that hour now). */
  realMinutesUntil(h) {
    if (this.fixedHour != null) return 0;
    return mod(hourToSec(h) - mod(this.seconds, L), L) / 60;
  }

  /** The HUD dial's angle (deg): the sun from −90 (rising) over 0 (noon) to 90 (setting); the night half for the moon. */
  dialAngle(h = this.hour()) {
    const r = DAY.sunRise;
    const s = DAY.sunSet;
    if (h >= r && h < s) return -90 + ((h - r) / (s - r)) * 180;
    const n = mod(h - s, 24);
    return 90 + (n / (24 - (s - r))) * 180;
  }

  /* ---------------- moving the clock ---------------- */

  /** Moves the clock forward to the next time it shows hour `h`. Returns the real seconds skipped. */
  advanceTo(h) {
    if (this.fixedHour != null) {
      this.fixedHour = mod(h, 24);
      return 0;
    }
    if (!this.game.bagEnd) return 0;
    const d = mod(hourToSec(h) - mod(this.seconds, L), L);
    this.game.bagEnd.clock += d;
    return d;
  }

  /** Moves the clock forward by `hours` game hours (whole days first). */
  advance(hours) {
    const days = Math.floor(hours / 24);
    if (days > 0 && this.fixedHour == null && this.game.bagEnd) this.game.bagEnd.clock += days * L;
    else if (days > 0) this.fixedDay += days;
    return this.advanceTo(this.hour() + (hours - days * 24));
  }

  /** May the bed skip the night now? From the evening on, at night and at dawn. */
  canSleep(h = this.hour()) {
    return h >= DAY.eveningFrom || h < DAY.dawnTo;
  }

  /**
   * The Bag End bed (bagend/effects.js sleep → bagEnd.onSleep). Co-op rule: every player must be inside Bag End
   * (one presses, both sleep); a partner outside blocks it. Returns the message for the sleeper.
   */
  sleep(p) {
    const g = this.game;
    const h = this.hour();
    if (!this.canSleep(h)) return `${this.phaseName(h)} van, még nem vagy álmos. Este vagy éjjel alhatsz. (Mentve.)`;
    const away = g.players.some((q) => q !== p && !q.choosing && !g.bagEnd?.isInside(q));
    if (away) return 'Csak együtt alhattok: előbb a társad is jöjjön haza Zsáklakba. (Mentve.)';
    this.advanceTo(DAY.wakeHour);
    for (const q of g.players) {
      if (q.choosing) continue;
      q.dnWake = WAKE_FADE;
      if (q !== p) q.say(`Átaludtátok az éjszakát. Reggel van (${this.day()}. nap).`, 4);
    }
    return `Átaludtad az éjszakát. Reggel van (${this.day()}. nap). (Mentve.)`;
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    const g = this.game;
    for (const p of g.players) {
      // Waking up after the bed: the view fades in from black.
      if (p.dnWake > 0) {
        p.dnWake = Math.max(0, p.dnWake - dt);
        if (!p.riding && !p.asleep) {
          p.fadeColor = '#000';
          p.fade = Math.min(1, p.dnWake / (WAKE_FADE * 0.7));
        }
      }
      // Mirkwood's enchanted sleep (underground/mirkwood-water.js counts p.sleptCount): hours pass for everyone.
      const n = p.sleptCount || 0;
      if (p.dnSlept === undefined) p.dnSlept = n;
      else if (n > p.dnSlept) {
        p.dnSlept = n;
        this.advance(DAY.enchantedSleepHours);
      }
    }
    const h = this.hour();
    const st = stateOf(h);
    if (this.prev && st !== this.prev) {
      const info = { day: this.day(), hour: h };
      if (st === 'night') this.fire('dusk', info);
      else if (st === 'day') this.fire('dawn', info);
      else if (st === 'evening' && this.prev === 'day') this.fire('evening', info);
      else if (st === 'evening') this.fire('dawn', info); // from night straight into the evening: a long jump
    }
    this.prev = st;
    this.look.apply(h, this);
  }

  fire(name, info) {
    const hook = { dawn: this.onDawn, dusk: this.onDusk, evening: this.onEvening }[name];
    if (hook) hook(info);
    this.game.events?.emit(name, info);
  }
}

/** Seconds of the fade-in after sleeping in the bed. */
const WAKE_FADE = 1.8;

/* ================================================================================================
   The look: keyframes of the surface palette by hour
   ================================================================================================ */

const C = (hex) => new THREE.Color(hex);

/**
 * Keyframes (hour → palette). `sun` is the sun light's intensity before the horizon fade, `glow` the sky's sun-glow
 * colour, `tint` the painted panorama's and the clouds' colour, `lamp` the lamp glass's night glow (0 by day … 1 at
 * night: the lanterns and lit windows brighter and warmer, the dark windows lit; NOTES-28-night), `emis` the foliage's
 * emissive scale. 16.5 is the game's old fixed golden afternoon (lighting.js LIGHT.surface, sky.js
 * SKY_COLORS), so the bench pages look as before.
 */
const NIGHT = { fogNear: 22, fogFar: 165, fog: 0x1d2a40, hemiSky: 0x7a92cc, hemiGround: 0x2a2c34, hemi: 0.95, sunColor: 0x9a7aa0, sun: 0, zenith: 0x0b1428, horizon: 0x26344e, warm: 0x2c3854, glow: 0x000000, tint: 0x46526e, lamp: 1, emis: 0.2 };
const KEYS = [
  [0, NIGHT],
  [4.4, NIGHT],
  [5.2, { fog: 0x8a8aa4, hemiSky: 0xc4bcd4, hemiGround: 0x4a4232, hemi: 1.0, sunColor: 0xff9a68, sun: 0.9, zenith: 0x4a6292, horizon: 0xe6b4a4, warm: 0xffa888, glow: 0xffb090, tint: 0xb4aabc, lamp: 0.45, emis: 0.5 }],
  [7, { fog: 0xc6d4dc, hemiSky: 0xdce8f4, hemiGround: 0x6a5a38, hemi: 1.3, sunColor: 0xffe0b4, sun: 2.4, zenith: 0x5a90d0, horizon: 0xd8e2ea, warm: 0xffe0b8, glow: 0xfff0d4, tint: 0xf4f4f6, lamp: 0, emis: 1 }],
  [12.5, { fog: 0xc8d8dc, hemiSky: 0xdce8f4, hemiGround: 0x6c5c36, hemi: 1.4, sunColor: 0xfff0d8, sun: 2.8, zenith: 0x4a84cc, horizon: 0xd2e0e6, warm: 0xffe8c4, glow: 0xfff4dc, tint: 0xffffff, lamp: 0, emis: 1 }],
  [16.5, { fog: 0xc4d2cc, hemiSky: 0xd6e4f0, hemiGround: 0x6a5a34, hemi: 1.35, sunColor: 0xffd6a0, sun: 2.7, zenith: 0x4f86c8, horizon: 0xcfdde0, warm: 0xffd9a8, glow: 0xfff0d0, tint: 0xffffff, lamp: 0, emis: 1 }],
  [18.5, { fog: 0xd2bc9c, hemiSky: 0xe2ccb4, hemiGround: 0x6a4a2c, hemi: 1.2, sunColor: 0xffb070, sun: 2.5, zenith: 0x5a7cb8, horizon: 0xf2c898, warm: 0xffb070, glow: 0xffd090, tint: 0xffe0c0, lamp: 0.08, emis: 0.9 }],
  [19.6, { fog: 0xa47c78, hemiSky: 0xbc9cac, hemiGround: 0x4a3428, hemi: 1.0, sunColor: 0xff7a40, sun: 1.4, zenith: 0x3c5088, horizon: 0xf09a68, warm: 0xff8a50, glow: 0xffa060, tint: 0xd0a094, lamp: 0.4, emis: 0.6 }],
  [20.5, { fogNear: 34, fogFar: 190, fog: 0x46506e, hemiSky: 0x8e96c4, hemiGround: 0x30282c, hemi: 1.05, sunColor: 0x9a7aa0, sun: 0.2, zenith: 0x1a2448, horizon: 0x6c6c8c, warm: 0x8a6a80, glow: 0x6a5a70, tint: 0x7a7a96, lamp: 0.85, emis: 0.35 }],
  [21.6, NIGHT],
  [24, NIGHT],
].map(([h, k]) => [h, Object.fromEntries(Object.entries(k).map(([n, v]) => [n, typeof v === 'number' && !['hemi', 'sun', 'lamp', 'emis', 'fogNear', 'fogFar'].includes(n) ? C(v) : v]))]);

/** The moon's light and its glow in the sky. */
const MOON = { color: C(0xb4c4f0), light: 0.42, glow: C(0xd8e0f4) };
/** The sun's highest elevation (deg); with the azimuth step below the 16:30 sun is the old fixed SUN_DIR. */
const SUN_MAX_EL = 38.3;
const SUN_AZ_PER_H = 9.25;
const MOON_MAX_EL = 34;
/** Layer 8's sun-shaft opening (erebor-fx.js `sun`): day, evening and night colours. */
const SHAFT = { day: C(0xffe2a0), eve: C(0xffb060), night: C(0x1e2a3e) };

const deg = Math.PI / 180;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Direction towards a body at azimuth `az` (deg from south towards west; south is −z, west −x) and elevation `el`. */
function dirOf(az, el, out) {
  const ce = Math.cos(el * deg);
  return out.set(-Math.sin(az * deg) * ce, Math.sin(el * deg), -Math.cos(az * deg) * ce).normalize();
}

class DayLook {
  constructor(game) {
    this.game = game;
    /** The blended palette lighting.js reads (same fields as LIGHT.surface). */
    this.tod = {
      fog: new THREE.Color(), fogNear: 45, fogFar: 210, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemi: 1,
      sunColor: new THREE.Color(), sun: 1,
    };
    this.tint = new THREE.Color(1, 1, 1);
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.glowCol = new THREE.Color();
    this.lastH = -1;
    this.lastMoon = -1;
    this.mats = null;
    /** night extras: the fireflies' Points object (built with the materials). */
    this.flies = null;
    /** Exposed for QA: the last values written. */
    this.state = {};
  }

  /** The surface materials whose glow changes with the light (found once, after the surface is built). */
  collect() {
    const root = this.game.scene.getObjectByName('surface-root');
    if (!root) return null;
    const emis = new Map();
    const glow = new Set();
    root.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        if (m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b) && !emis.has(m)) emis.set(m, m.emissive.clone());
        if (o.name.startsWith('surface-glow') && m.isMeshBasicMaterial) glow.add(m);
      }
    });
    // night extras: the fireflies are built here, once, after the surface (they read its registered spots).
    this.flies = buildFireflies(root);
    return { emis, glow: [...glow] };
  }

  apply(h, clock) {
    const lighting = this.game.lighting;
    if (!lighting) return;
    const moonI = clock.moonIndex();
    if (Math.abs(h - this.lastH) < 0.002 && moonI === this.lastMoon && lighting.tod === this.tod) return;
    this.lastH = h;
    this.lastMoon = moonI;
    // Keyframe blend.
    let i = 1;
    while (i < KEYS.length - 1 && KEYS[i][0] <= h) i++;
    const [h0, a] = KEYS[i - 1];
    const [h1, b] = KEYS[i];
    const t = h1 > h0 ? Math.min(1, Math.max(0, (h - h0) / (h1 - h0))) : 0;
    const T = this.tod;
    const num = (n) => a[n] + (b[n] - a[n]) * t;
    T.fog.copy(a.fog).lerp(b.fog, t);
    T.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
    T.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
    T.hemi = num('hemi');
    // The fog closes in at night (the far hills melt into the dark blue; fewer chunks drawn, never more).
    T.fogNear = (a.fogNear ?? 45) + ((b.fogNear ?? 45) - (a.fogNear ?? 45)) * t;
    T.fogFar = (a.fogFar ?? 210) + ((b.fogFar ?? 210) - (a.fogFar ?? 210)) * t;
    SKY_UNIFORMS.uZenith.value.copy(a.zenith).lerp(b.zenith, t);
    SKY_UNIFORMS.uHorizon.value.copy(a.horizon).lerp(b.horizon, t);
    SKY_UNIFORMS.uWarm.value.copy(a.warm).lerp(b.warm, t);
    this.tint.copy(a.tint).lerp(b.tint, t);
    // The sun's and the moon's places.
    const r = DAY.sunRise;
    const s = DAY.sunSet;
    const sunEl = SUN_MAX_EL * Math.sin(Math.PI * ((h - r) / (s - r)));
    dirOf((h - 12.5) * SUN_AZ_PER_H, sunEl, this.sunDir);
    const n = mod(h - s, 24) / (24 - (s - r)); // 0 at sunset … 1 at sunrise
    const moonEl = MOON_MAX_EL * Math.sin(Math.PI * n);
    dirOf(180 + (n - 0.5) * 130, moonEl, this.moonDir);
    const moonBright = clock.moonLight();
    const sunI = num('sun') * smooth(-2, 4, sunEl);
    const mI = MOON.light * (0.35 + 0.65 * moonBright) * smooth(-2, 6, moonEl);
    const useMoon = mI > sunI;
    const dir = useMoon ? this.moonDir : this.sunDir;
    if (useMoon) T.sunColor.copy(MOON.color);
    else T.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
    // Never exactly 0 on the surface: lighting.js leaves the sun out of the shaders at 0 (an underground-only switch).
    T.sun = Math.max(0.03, useMoon ? mI : sunI);
    lighting.sun.position.copy(dir).multiplyScalar(100);
    SKY_UNIFORMS.uSunDir.value.copy(dir);
    if (useMoon) this.glowCol.copy(MOON.glow).multiplyScalar(0.25 + 0.45 * moonBright * smooth(-2, 6, moonEl));
    else this.glowCol.copy(a.glow).lerp(b.glow, t).multiplyScalar(smooth(-3, 3, sunEl));
    SKY_UNIFORMS.uSunColor.value.copy(this.glowCol);
    if (SKY_UNIFORMS.uMoon) SKY_UNIFORMS.uMoon.value.set(clock.moonPhase(), useMoon ? 1 : 0);
    lighting.tod = T;
    lighting.skyTint = this.tint;
    // Lamp glass and lit windows (night extras: the glass material's night glow), foliage's faint emissive.
    this.mats ||= this.collect();
    const lamp = num('lamp');
    const emis = num('emis');
    GLOW_NIGHT.value = lamp;
    if (this.mats) {
      for (const [m, base] of this.mats.emis) m.emissive.copy(base).multiplyScalar(emis);
    }
    // night extras (NOTES-28-night): the stars fade in through the dusk and out at dawn; the fireflies come out after
    // sunset and go at dawn (hidden, no draw call, the rest of the day).
    const stars = h < 12 ? 1 - smooth(4.3, 5.3, h) : smooth(20.2, 21.4, h);
    SKY_UNIFORMS.uStars.value = stars;
    const flies = h < 12 ? 1 - smooth(4.4, 5.2, h) : smooth(19.5, 20.4, h);
    FIREFLY_ON.value = flies;
    if (this.flies) this.flies.visible = flies > 0.01;
    // Layer 8's sun shaft: lit by day, golden in the evening, dark at night.
    const shaft = this.game.decor?.ereborFx?.sun?.material;
    if (shaft) {
      const ev = smooth(16.5, 18.5, h) * (1 - smooth(20.0, 20.8, h));
      const lit = smooth(4.8, 5.8, h) * (1 - smooth(20.4, 21.0, h));
      shaft.color.copy(SHAFT.night).lerp(SHAFT.day, lit).lerp(SHAFT.eve, ev * lit);
    }
    this.state = { hour: +h.toFixed(3), sun: +T.sun.toFixed(3), hemi: +T.hemi.toFixed(3), useMoon, sunEl: +sunEl.toFixed(1), moonEl: +moonEl.toFixed(1), fog: T.fog.getHexString(), sunColor: T.sunColor.getHexString(), zenith: SKY_UNIFORMS.uZenith.value.getHexString(), lamp: +lamp.toFixed(2), emis: +emis.toFixed(2), stars: +stars.toFixed(2), flies: +flies.toFixed(2) };
  }
}
