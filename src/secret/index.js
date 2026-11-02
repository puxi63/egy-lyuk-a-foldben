/* ==== secret/index.js — the secret ending (TERV 0.11/10, NOTES-22-secret): whoever brings every famous find home to
   Bag End opens a hidden chamber behind the treasury, Thrór's old throne room; at the throne its last secret is told,
   the credits roll, and a closing scene follows (Bag End years later: Gandalf and Balin visit Bilbo, the book's end).
   - THE DOOR: a carved frame on the treasury's corner tower (underground/hoard-sites.js THRONE_DOOR, hoard-pieces.js);
     between the jambs the tower's rock, undiggable (THRONE_LOCKS). The use key at it: with a famous find missing it
     says how many (and which); with all of them (REQUIRED: Bag End's trophies plus Sting, which its owner carries) the
     opening moment plays: a rumble, Thrór's runes glow on the stone, the plug sinks away (carved at run time, which the
     terrain save keeps), the chamber is open (saved).
   - THE THRONE: the use key before it holds every player for four captions (the empty setting of the Arkenstone glows,
     the stone's runes brighten), then the credits through `game.screens.playCredits()` (ui/screens.js; a resolved
     promise when it is missing or disabled), then the closing scene at Bag End's door (Gandalf, Balin and Bilbo as the
     home events' figures), five captions, the skip keys advance. Saved once per game (`seen`); free play after.
   Wiring: src/hoard/index.js owns it (built in its constructor; `input` first in its input, `update` in its update, the
   prompt in its HUD prompt, `state` / `restore` inside the hoard's save field), so game.js and save.js are untouched.
   Meshes: built once, hidden until needed (the door's glow, the stone's runes, the setting's glow in layer 9's group;
   the three figures on the surface); the throne room's stone is merged into the treasury's own meshes. ==== */
import * as THREE from 'three';
import { FIND_TYPES } from '../finds.js';
import { dwarvesGeometry, gandalfGeometry, hobbitGeometry } from '../home-events/figures.js';
import { BAG_END } from '../surface/bagend.js';
import { groundHeight } from '../surface/ground.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { toRunes } from '../ui/runes.js';
import { inThroneRoom, THRONE, THRONE_DOOR, THRONE_PLUG_LOCK, THRONE_ROOM, THRONE_STONE } from '../underground/hoard-sites.js';
import { addLocks } from '../underground/sites.js';
import { digSphere, sampleDensity } from '../world.js';
import { LINES } from './lines.js';

/**
 * The famous finds the chamber asks for (TERV 0.11/7's list, layer by layer). All but Sting are Bag End's trophy ids
 * (bagEnd.trophies); Sting stays with its owner (enemies/sting.js `owned`).
 */
export const REQUIRED = [
  { id: 'glamdring', name: 'Glamdring' },
  { id: 'fullank', name: 'Fullánk', sting: true },
  { id: 'gombok', name: 'Bilbó réz gombjai' },
  { id: 'orkrist', name: 'Orkrist' },
  { id: 'girion', name: 'Girion smaragdjai' },
  { id: 'harfak', name: 'A törpék hárfái' },
  { id: 'thror-kulcs', name: 'Thrór kulcsa' },
  { id: 'mithril', name: 'Mithrilpáncél' },
  { id: 'arkenko', name: 'Az Arkenkő' },
];
for (const r of REQUIRED) r.name = FIND_TYPES.find((f) => f.id === r.id)?.name || r.name;

/** Timing (s) and reach (m). */
export const SECRET = {
  doorReach: 1.7, // from the door's middle, on the hall side
  throneReach: 1.5, // from the throne's front
  openGlow: 1.2, // the runes glow up
  carveAt: [1.6, 2.2, 2.8], // the plug sinks in three bites (top, middle, bottom)
  openEnd: 4.2,
  caption: 5.2, // per caption of the throne and the closing scene
  fade: 0.6,
};

const D = THRONE_DOOR;
const v1 = new THREE.Vector3();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A canvas texture with runes (Thrór's map's runes, ui/runes.js) in gold on a transparent ground. */
function runeTexture(lines, w, h, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  if (opts.frame) {
    // The door's outline: a thin glowing line round the plug.
    x.strokeStyle = 'rgba(255,236,190,0.85)';
    x.lineWidth = w * 0.02;
    x.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.97);
  }
  x.fillStyle = opts.color || '#ffe6a8';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = opts.shadow || 'rgba(255,200,110,0.9)';
  x.shadowBlur = w * 0.03;
  lines.forEach((ln, i) => {
    x.font = `${Math.round(ln.size * h)}px 'Noto Sans Runic', 'Segoe UI Historic', serif`;
    x.fillText(ln.text, w / 2, ln.y * h);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round glow (the empty setting's light). */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(230,240,255,0.45)');
  g.addColorStop(1, 'rgba(200,220,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Secret {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.seen = false;
    this.stage = 'sealed'; // 'sealed' | 'opening' | 'open' | 'throne' | 'credits' | 'closing' | 'done'
    this.t = 0;
    this.step = 0; // caption index in the throne / closing scene
    this.carved = 0; // bites of the plug carved so far (3 = open)
    this.frontLock = null;
    this.checkT = 0;
    this.creditsCalled = false;
    this.closingRan = false;
    this.ui = new Map();
    this.skipLock = false;
    this.buildMeshes();
  }

  /* ---------------- meshes (built once, hidden) ---------------- */

  buildMeshes() {
    const g = this.game;
    const group = g.decor?.groups?.l9 || g.scene;
    if (!group || typeof document === 'undefined') return;
    // Thrór's runes glowing on the door's plug during the opening (additive, faces the hall: −z).
    const thror = toRunes('Thrór');
    this.doorMat = new THREE.MeshBasicMaterial({ map: runeTexture([{ text: thror, y: 0.36, size: 0.17 }, { text: toRunes('király a hegy alatt'), y: 0.6, size: 0.07 }], 256, 420, { frame: true }), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(D.hw * 2, D.h), this.doorMat);
    this.doorGlow.name = 'secret-door-runes';
    this.doorGlow.position.set(D.x, D.y0 + D.h / 2, D.z0 - 0.03);
    this.doorGlow.rotation.y = Math.PI;
    this.doorGlow.renderOrder = 3;
    this.doorGlow.visible = false;
    // The carved stone's runes (shown once the door is open): Thrór, King under the Mountain; the map and the key, for
    // the heirs (Hungarian in Thrór's map's runes, as the rest of the game writes them).
    const S = THRONE_STONE;
    this.stoneMat = new THREE.MeshBasicMaterial({
      map: runeTexture([
        { text: thror, y: 0.14, size: 0.12 },
        { text: toRunes('király a hegy alatt'), y: 0.32, size: 0.065 },
        { text: toRunes('térkép és kulcs'), y: 0.5, size: 0.065 },
        { text: toRunes('a titkos ajtóhoz'), y: 0.66, size: 0.065 },
        { text: toRunes('az örökösöknek'), y: 0.84, size: 0.065 },
      ], 256, 400, { color: '#e8c070', shadow: 'rgba(255,190,90,0.6)' }),
      transparent: true, opacity: 0.85, depthWrite: false,
    });
    this.stoneRunes = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.34), this.stoneMat);
    this.stoneRunes.name = 'secret-stone-runes';
    this.stoneRunes.position.set(S.x + Math.sin(S.yaw) * 0.137, THRONE_ROOM.floor + 0.2 + 0.78, S.z + Math.cos(S.yaw) * 0.137);
    this.stoneRunes.rotation.y = S.yaw;
    this.stoneRunes.renderOrder = 2;
    this.stoneRunes.visible = false;
    // The empty setting's glow (the throne scene).
    this.setGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xeef4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.setGlow.name = 'secret-setting-glow';
    this.setGlow.position.set(THRONE.x, THRONE.setY, THRONE_ROOM.z1 - 0.2);
    this.setGlow.scale.setScalar(1.6);
    this.setGlow.renderOrder = 3;
    this.setGlow.visible = false;
    group.add(this.doorGlow, this.stoneRunes, this.setGlow);
    // The closing scene's figures at Bag End's door (one vertex-coloured material, hidden until the scene).
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const gy = (x, z) => groundHeight(x, z);
    const place = (m, x, z) => {
      m.position.set(x, gy(x, z), z);
      m.rotation.y = Math.PI; // the figures face +z locally: turned to face out of the door (−z)
      m.visible = false;
      g.scene.add(m);
      return m;
    };
    this.gandalf = place(new THREE.Mesh(gandalfGeometry(), mat), BAG_END.x - 0.85, BAG_END.z - 1.6);
    this.gandalf.name = 'secret-gandalf';
    // Balin alone out of the thirteen (arrival order: Dwalin, Balin, …): his index range of the merged geometry.
    const spots = Array.from({ length: 13 }, () => [0, 0, 0]);
    const dw = dwarvesGeometry(spots);
    this.balin = place(new THREE.Mesh(dw.geometry, mat), BAG_END.x + 0.85, BAG_END.z - 1.5);
    this.balin.geometry.setDrawRange(dw.counts[1], dw.counts[2] - dw.counts[1]);
    this.balin.name = 'secret-balin';
    this.bilbo = place(new THREE.Mesh(hobbitGeometry({ coat: 0x2f6a3a, waistcoat: 0xc8a030 }), mat), BAG_END.x, BAG_END.z - 0.7);
    this.bilbo.name = 'secret-bilbo';
    this.figures = [this.gandalf, this.balin, this.bilbo];
  }

  showFigures(on) {
    for (const m of this.figures || []) m.visible = on;
  }

  /* ---------------- save ---------------- */

  /** { open: 1, seen: 1 } (only the set flags), or undefined when the chamber is still sealed. */
  state() {
    if (!this.open && !this.seen) return undefined;
    const out = { open: 1 };
    if (this.seen) out.seen = 1;
    return out;
  }

  restore(s) {
    if (!s) return;
    this.open = !!s.open || !!s.seen;
    this.seen = !!s.seen;
    if (this.open) {
      this.stage = this.seen ? 'done' : 'open';
      THRONE_PLUG_LOCK.off = true;
      if (this.stoneRunes) this.stoneRunes.visible = true;
      // The terrain save holds the carved plug; update() checks it once the terrain is in (and carves it if not).
      this.carved = 0;
    }
  }

  /* ---------------- the requirement ---------------- */

  /** The famous finds still missing (REQUIRED entries). */
  missing() {
    const g = this.game;
    const trophies = g.bagEnd?.trophies || [];
    return REQUIRED.filter((r) => (r.sting ? !g.enemies?.sting?.owned : !trophies.includes(r.id)));
  }

  /** True while the finale's escape or its scenes run (the door waits until it is over). */
  finaleBusy() {
    const st = this.game.finale?.stage;
    return !!st && st !== 'idle' && st !== 'done';
  }

  /* ---------------- where the players are ---------------- */

  doorNear(p) {
    if (this.open || this.stage !== 'sealed') return false;
    const cx = D.x;
    const cz = D.z0 - 0.7;
    return Math.hypot(p.pos.x - cx, p.pos.z - cz) < SECRET.doorReach && Math.abs(p.pos.y - (D.y0 + 0.2)) < 1.8;
  }

  throneNear(p) {
    if (!this.open || (this.stage !== 'open' && this.stage !== 'done')) return false;
    const fz = THRONE.z - 1.1;
    return inThroneRoom(p.pos) && Math.hypot(p.pos.x - THRONE.x, p.pos.z - fz) < SECRET.throneReach;
  }

  held() {
    return this.stage === 'throne' || this.stage === 'credits' || this.stage === 'closing';
  }

  active() {
    return this.game.players.filter((p) => !p.choosing);
  }

  /** The HUD prompt for a player (hoard/meter.js's prompt line), or ''. */
  prompt(p, g) {
    if (p.choosing || p.dead > 0) return '';
    if (this.doorNear(p)) return `<span class="pr-in"><span>${LINES.prompt}</span>${g.interact || ''}</span>`;
    if (this.throneNear(p)) return `<span class="pr-in"><span>${LINES.promptThrone}</span>${g.interact || ''}</span>`;
    return '';
  }

  /* ---------------- input ---------------- */

  /** First in the hoard's input: true while a scene holds the player, or when the use key was spent here. */
  input(p, i, it) {
    if (p.choosing) return false;
    if (this.held()) {
      if ((it.confirmPressed || it.backPressed) && !this.skipLock && this.stage !== 'credits') {
        this.skipLock = true;
        this.next();
      }
      this.pin(p);
      return true;
    }
    if (!it.interactPressed || p.dead > 0 || p.riding) return false;
    if (this.doorNear(p)) {
      this.tryOpen(p);
      return true;
    }
    if (this.throneNear(p)) {
      if (this.seen) p.say(LINES.seenThrone, 4);
      else this.startThrone(p);
      return true;
    }
    return false;
  }

  /** Keeps a held player in place, turned towards the scene's subject. */
  pin(p) {
    if (p.secHold) {
      p.pos.copy(p.secHold);
      p.vel.set(0, 0, 0);
    }
    if (p.secLook) {
      const e = p.eye(v1);
      const yaw = Math.atan2(-(p.secLook.x - e.x), -(p.secLook.z - e.z));
      const pitch = Math.atan2(p.secLook.y - e.y, Math.hypot(p.secLook.x - e.x, p.secLook.z - e.z));
      const k = Math.min(1, (this.game.lastDt || 1 / 60) * 4 + 0.05);
      p.yaw += wrapA(yaw - p.yaw) * k;
      p.pitch += (clamp(pitch, -1.2, 1.2) - p.pitch) * k;
    }
  }

  /* ---------------- the door ---------------- */

  tryOpen(p) {
    const miss = this.missing();
    if (miss.length) {
      p.say(LINES.sealed(miss.length, miss.map((r) => r.name).join(', ')), 6);
      return false;
    }
    if (this.finaleBusy()) {
      p.say(LINES.notNow, 4);
      return false;
    }
    this.stage = 'opening';
    this.t = 0;
    this.opener = p;
    if (this.doorGlow) this.doorGlow.visible = true;
    this.rumble(2.6);
    p.say(LINES.opening, 5);
    for (const q of this.active()) {
      if (q !== p) q.say(LINES.openingPartner(p.ch?.name || 'A társad'), 5);
      if (q.pos.distanceTo(p.pos) < 25) q.kick = 1;
    }
    return true;
  }

  /** Carves bite k of the door's plug (0 top, 1 middle, 2 bottom); the shells round it stay (locked samples). */
  carve(k) {
    THRONE_PLUG_LOCK.off = true;
    // The gold and rock in front of the door stay as they are (a temporary lock on the hall side).
    if (!this.frontLock) this.frontLock = addLocks([{ x0: D.x - D.hw - 1.2, x1: D.x + D.hw + 1.2, y0: D.y0 - 1.5, y1: D.y0 + D.h + 1.5, z0: D.z0 - 2, z1: D.z0 + 0.02 }])[0];
    this.frontLock.off = false;
    const y = D.y0 + [2.0, 1.25, 0.5][k];
    for (const x of [D.x - 0.38, D.x + 0.38]) for (const z of [D.z0 + 0.35, (D.z0 + D.z1) / 2, D.z1 - 0.2]) digSphere(x, y, z, 0.78, 255);
    this.frontLock.off = true;
    this.carved = Math.max(this.carved, k + 1);
  }

  /** True when the plug's middle is air (opened, or restored with the carved terrain). */
  plugOpen() {
    return sampleDensity(D.x, D.y0 + 1.2, (D.z0 + D.z1) / 2) <= 0 && sampleDensity(D.x, D.y0 + 0.4, (D.z0 + D.z1) / 2) <= 0;
  }

  /* ---------------- the throne, the credits, the closing scene ---------------- */

  startThrone(p) {
    this.stage = 'throne';
    this.t = 0;
    this.step = 0;
    for (const q of this.active()) {
      q.secHold = q.riding ? null : q.pos.clone();
      q.secLook = inThroneRoom(q.pos) ? new THREE.Vector3(THRONE.x, THRONE.setY - 0.3, THRONE_ROOM.z1) : null;
      q.secCaption = LINES.throne[0];
    }
    if (this.setGlow) this.setGlow.visible = true;
    this.rumble(1.2, 0.35);
    void p;
  }

  /** The skip keys: the next caption (or the next part). */
  next() {
    if (this.stage === 'throne') {
      this.step++;
      this.t = 0;
      if (this.step >= LINES.throne.length) this.toCredits();
    } else if (this.stage === 'closing') {
      if (this.t < SECRET.fade * 2) this.t = SECRET.fade * 2; // the fade in is cut short
      else {
        this.step++;
        this.capT = 0;
        if (this.step >= LINES.closing.length) this.finish();
      }
    }
  }

  toCredits() {
    this.stage = 'credits';
    this.t = 0;
    if (this.setGlow) this.setGlow.visible = false;
    for (const q of this.active()) q.secCaption = '';
    const sc = this.game.screens;
    let pr = null;
    try {
      if (sc && typeof sc.playCredits === 'function') {
        this.creditsCalled = true;
        pr = sc.playCredits();
      }
    } catch (e) {
      console.warn('secret: credits failed', e);
    }
    Promise.resolve(pr).catch(() => {}).then(() => this.startClosing());
  }

  startClosing() {
    if (this.stage !== 'credits') return;
    this.stage = 'closing';
    this.t = 0;
    this.capT = 0;
    this.step = 0;
    this.placed = false;
    this.closingRan = true;
  }

  /** Puts the players before Bag End's door, looking at it (the closing scene). */
  placeAtBagEnd() {
    const look = new THREE.Vector3(BAG_END.x, groundHeight(BAG_END.x, BAG_END.z - 1.5) + 1.25, BAG_END.z - 1.5);
    this.active().forEach((p, k, all) => {
      const x = BAG_END.x + (k - (all.length - 1) / 2) * 0.9;
      const z = BAG_END.z - 5.2;
      if (this.game.bagEnd?.isInside?.(p)) this.game.bagEnd.pass(p, false);
      p.secHold = new THREE.Vector3(x, groundHeight(x, z) + 0.05, z);
      p.pos.copy(p.secHold);
      p.vel.set(0, 0, 0);
      p.secLook = look.clone();
    });
    this.showFigures(true);
  }

  finish() {
    this.stage = 'done';
    this.seen = true;
    this.open = true;
    this.showFigures(false);
    for (const p of this.active()) {
      p.secHold = null;
      p.secLook = null;
      p.secCaption = '';
      p.fade = 0;
      p.say(LINES.end, 6);
    }
    this.game.saveNow?.();
  }

  /* ---------------- sound ---------------- */

  /** A low stone rumble (synthesised; no sound in the bench or when muted). */
  rumble(len = 2.4, gain = 0.8) {
    const g = this.game;
    if (g.bench || g.decor?.mute) return;
    const ctx = g.smaug?.audio?.ctx || (g.smaug?.ensureAudio?.() && g.smaug.audio?.ctx);
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * len);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
      d[i] = last * 9 * Math.min(1, i / 4000) * (1 - i / n);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const gn = ctx.createGain();
    gn.gain.value = gain;
    src.connect(lp).connect(gn).connect(ctx.destination);
    src.start(t);
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    this.skipLock = false;
    const g = this.game;
    this.t += dt;
    if (this.stage === 'opening') {
      const t = this.t;
      if (this.doorMat) this.doorMat.opacity = t < SECRET.openGlow ? t / SECRET.openGlow : t < SECRET.carveAt[2] ? 1 : Math.max(0, 1 - (t - SECRET.carveAt[2]) / (SECRET.openEnd - SECRET.carveAt[2]));
      SECRET.carveAt.forEach((at, k) => {
        if (t >= at && this.carved < k + 1) {
          this.carve(k);
          this.rumble(0.9, 0.5);
          for (const q of this.active()) if (q.pos.distanceTo(v1.set(D.x, D.y0, D.z0)) < 20) q.kick = Math.max(q.kick || 0, 0.7);
        }
      });
      if (t >= SECRET.openEnd) {
        this.stage = 'open';
        this.open = true;
        if (this.doorGlow) this.doorGlow.visible = false;
        if (this.stoneRunes) this.stoneRunes.visible = true;
        for (const q of this.active()) q.say(LINES.opened, 5);
        g.saveNow?.();
      }
    } else if (this.open && this.carved < 3 && g.terrain?.loaded !== false) {
      // A restored open chamber: the saved terrain normally holds the carved plug; carve it if it does not.
      this.checkT -= dt;
      if (this.checkT <= 0) {
        this.checkT = 1;
        if (this.plugOpen()) this.carved = 3;
        else for (let k = 0; k < 3; k++) this.carve(k);
      }
    }
    if (this.stage === 'open') {
      for (const p of this.active()) {
        if (!p.secEntered && inThroneRoom(p.pos)) {
          p.secEntered = true;
          p.say(LINES.enter, 5);
        }
      }
    } else if (this.stage === 'throne') {
      const pulse = 0.55 + 0.35 * Math.sin(this.t * 2.4);
      if (this.setGlow) this.setGlow.material.opacity = Math.min(1, this.t / 0.8 + this.step * 0.3) * pulse;
      if (this.stoneMat) this.stoneMat.opacity = this.step >= 2 ? 0.85 + 0.15 * Math.sin(this.t * 3) : 0.85;
      for (const p of this.active()) {
        p.secCaption = LINES.throne[this.step] || '';
        if (this.step >= 2 && p.secLook && inThroneRoom(p.pos)) p.secLook.set(THRONE_STONE.x, THRONE_ROOM.floor + 1.0, THRONE_STONE.z);
      }
      if (this.t >= SECRET.caption) this.next();
    } else if (this.stage === 'closing') {
      const F = SECRET.fade;
      const t = this.t;
      if (t < F) this.fadeAll(t / F);
      else {
        if (!this.placed) {
          this.placed = true;
          this.placeAtBagEnd();
        }
        if (t < F * 2) this.fadeAll(1 - (t - F) / F);
        else {
          this.fadeAll(0);
          this.capT = (this.capT || 0) + dt;
          if (this.capT >= SECRET.caption) {
            this.step++;
            this.capT = 0;
            if (this.step >= LINES.closing.length) this.finish();
          }
        }
      }
      if (this.stage === 'closing') for (const p of this.active()) p.secCaption = t >= F ? LINES.closing[this.step] || '' : '';
    }
    this.drawUi();
  }

  fadeAll(f) {
    for (const p of this.active()) {
      p.fade = clamp(f, 0, 1);
      p.fadeColor = '#000';
    }
  }

  /* ---------------- HUD: the parchment caption ---------------- */

  uiFor(i, p) {
    const el = this.game.huds?.[i]?.el;
    if (!el) return null;
    let ui = this.ui.get(p);
    if (ui && ui.root === el) return ui;
    ui?.cap.remove();
    ui = { root: el, cap: document.createElement('div'), html: null };
    // Inline styles (the stylesheet belongs to the UI work), as the finale's caption strip.
    Object.assign(ui.cap.style, {
      position: 'absolute', left: '50%', bottom: '12%', transform: 'translateX(-50%)', width: 'min(88%, 38em)', padding: '0.7em 1.3em 0.55em',
      textAlign: 'center', fontSize: '1.05em', lineHeight: '1.4', color: 'var(--ink-dark, #3a2614)', fontFamily: 'var(--f-text, Georgia, serif)',
      background: 'var(--tx-parch) center / cover, #e8d6ac', borderRadius: '0.25em', boxShadow: '0 0.3em 1.2em #000d, inset 0 0 2.5em #7a5a2a55',
      pointerEvents: 'none', zIndex: '8', display: 'none',
    });
    ui.cap.className = 'secret-caption';
    el.append(ui.cap);
    this.ui.set(p, ui);
    return ui;
  }

  drawUi() {
    const g = this.game;
    if (!g.huds || typeof document === 'undefined') return;
    const shared = g.bindings?.some((b) => b.kbm === 'keys2');
    g.players.forEach((p, i) => {
      const text = this.held() && !p.choosing ? p.secCaption || '' : '';
      if (!text && !this.ui.has(p)) return;
      const ui = this.uiFor(i, p);
      if (!ui) return;
      let html = '';
      if (text) {
        const k = glyphs(deviceOf(g.bindings[i]), shared);
        html = `${text}<div style="margin-top:0.35em;font-size:0.8em;opacity:0.75">${LINES.skip(`${k.confirm} / ${k.back}`)}</div>`;
      }
      if (html !== ui.html) {
        ui.html = html;
        ui.cap.innerHTML = html;
        ui.cap.style.display = html ? 'block' : 'none';
      }
    });
  }
}
