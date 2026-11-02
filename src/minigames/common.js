/* ==== minigames/common.js — shared bits of the side minigames (TERV 0.11/9, 11, 12, 14; technical note h.: "separate,
   self-contained modules with their own input mapping; each works in single player and in split screen"; 0.12 themed
   UI): the per-player overlay (a parchment panel and a prompt line inside that player's own HUD element, inline styles
   as the other modules do), the key names per control scheme, a tiny seeded random generator and synthesised sounds.
   Nothing here runs per frame unless a minigame asks for it. ==== */
import * as THREE from 'three';
import { sharedAudio } from '../audio.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';

/** Plain key names per control scheme (prompts are plain text; the parchments use the glyph HTML of ui/glyphs.js). */
export const KEYS = {
  mouse: { use: 'E', act: 'bal egérgomb / F', back: 'Esc', lanes: 'A · W · D' },
  keys2: { use: 'P', act: 'U', back: 'Backspace', lanes: '← · ↑ · →' },
  pad: { use: 'X', act: 'RT', back: 'B', lanes: 'D-pad ← · ↑ · →' },
};

export const GOLD = 'color:var(--gold,#e8c070)';
export const INK = 'color:#5a2a0a';

/** The control scheme of player i ('mouse' | 'keys2' | 'pad'). */
export function schemeOf(game, i) {
  return deviceOf(game.bindings?.[i]);
}

/** The key names of player i. */
export function keysOf(game, i) {
  return KEYS[schemeOf(game, i)] || KEYS.mouse;
}

/** The glyph HTML of player i (ui/glyphs.js). */
export function glyphsOf(game, i) {
  return glyphs(schemeOf(game, i), !!game.bindings?.some((b) => b.kbm === 'keys2'));
}

/** A small deterministic generator (xorshift32). */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Vertex-coloured copy of a geometry (all minigame props share one Lambert program per kind). */
export function painted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], k * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Per player: a parchment panel and a prompt line in the player's own HUD element. Elements are made on first use and
 * written only when their content changes.
 */
export class Overlay {
  constructor(game) {
    this.game = game;
    this.ui = new Map(); // player → { root, box, prompt, html, text, place }
  }

  get(p, i) {
    const el = this.game.huds[i]?.el;
    if (!el) return null;
    let u = this.ui.get(p);
    if (!u || u.root !== el) {
      u?.box.remove();
      u?.prompt.remove();
      u = { root: el, box: document.createElement('div'), prompt: document.createElement('div'), html: '', text: '', place: '' };
      Object.assign(u.prompt.style, {
        position: 'absolute', left: '50%', top: '60%', transform: 'translateX(-50%)', fontSize: '17px', color: 'var(--gold, #e8c070)',
        textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '6', whiteSpace: 'nowrap',
      });
      Object.assign(u.box.style, {
        position: 'absolute', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(90%, 31em)', maxHeight: '88%', overflow: 'hidden',
        padding: '0.7em 1.1em 0.8em', textAlign: 'center', fontSize: '0.98em', lineHeight: '1.3', color: 'var(--ink-dark, #3a2614)',
        background: 'var(--tx-parch) center / cover, #e8d6ac', borderRadius: '0.25em', boxShadow: '0 0.3em 1.2em #000d, inset 0 0 2.5em #7a5a2a55',
        fontFamily: 'var(--f-text, Georgia, serif)', pointerEvents: 'none', zIndex: '7', display: 'none', top: '50%',
      });
      u.box.className = 'minigame-parchment';
      el.append(u.prompt, u.box);
      this.ui.set(p, u);
    }
    return u;
  }

  /** The parchment's content ('' hides it); `place` 'mid' (centred) or 'low' (the lower part, the view stays free). */
  box(p, i, html, place = 'mid') {
    const u = this.get(p, i);
    if (!u) return;
    if (place !== u.place) {
      u.place = place;
      u.box.style.top = place === 'low' ? '80%' : '50%';
    }
    if (html !== u.html) {
      u.html = html;
      u.box.innerHTML = html;
      u.box.style.display = html ? 'block' : 'none';
    }
  }

  prompt(p, i, text) {
    const u = this.ui.get(p) || (text ? this.get(p, i) : null);
    if (!u || text === u.text) return;
    u.text = text;
    u.prompt.textContent = text;
  }

  /** The live element of a parchment (the plate game moves its items by style, not by rewriting the HTML). */
  boxEl(p) {
    return this.ui.get(p)?.box || null;
  }
}

/** A heading on the parchment. */
export const head = (t) => `<div style="font-family:var(--f-head);font-size:1.22em;color:#5a2a0a;margin-bottom:0.2em">${t}</div>`;

/** A horizontal meter (0..1) with an optional marked zone [z0, z1] and a needle. */
export function meter(v, z0 = null, z1 = null, color = '#7a3a10') {
  const zone = z0 == null ? '' : `<div style="position:absolute;top:0;bottom:0;left:${(z0 * 100).toFixed(1)}%;width:${((z1 - z0) * 100).toFixed(1)}%;background:#4a7a2a66;border-left:1px solid #2a5a1a;border-right:1px solid #2a5a1a"></div>`;
  return `<div style="position:relative;height:0.9em;margin:0.35em auto;width:88%;border:2px solid #6a4a2a;border-radius:0.45em;background:#f4e6c2;overflow:hidden">${zone}
    <div style="position:absolute;top:-2px;bottom:-2px;left:calc(${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}% - 2px);width:4px;background:${color}"></div></div>`;
}

let noiseBuf = null;

/** Synthesised sounds (optional: no audio context in tests, muted on bench pages). */
export function sound(game, kind) {
  try {
    if (game.decor?.mute) return;
    const a = sharedAudio();
    if (!a) return;
    if (a.state === 'suspended') a.resume();
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    }
    const t = a.currentTime;
    const burst = (start, dur, type, f0, f1, vol, q = 1) => {
      const src = a.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = a.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(f0, t + start);
      f.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(vol, t + start + Math.min(0.04, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      src.connect(f).connect(g).connect(a.destination);
      src.start(t + start);
      src.stop(t + start + dur + 0.05);
    };
    const tone = (start, dur, type, f0, f1, vol) => {
      const o = a.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + start);
      o.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(vol, t + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(a.destination);
      o.start(t + start);
      o.stop(t + start + dur + 0.05);
    };
    switch (kind) {
      case 'tick': burst(0, 0.05, 'bandpass', 2600, 2200, 0.2, 5); break;
      case 'coins': for (let k = 0; k < 6; k++) tone(k * 0.07, 0.18, 'triangle', 2400 + k * 180, 2100 + k * 120, 0.04); break;
      // The purse's squeak, then the trolls' stone grinding and a low rumble.
      case 'cry': tone(0, 0.18, 'square', 900, 1300, 0.05); tone(0.2, 0.28, 'square', 1200, 700, 0.05); break;
      case 'rumble': burst(0, 3.2, 'lowpass', 160, 60, 0.6); burst(0.1, 2.6, 'bandpass', 500, 260, 0.12, 1.5); break;
      case 'clack': burst(0, 0.06, 'bandpass', 1800, 1400, 0.35, 3); tone(0, 0.08, 'triangle', 700, 500, 0.05); break;
      case 'swish': burst(0, 0.18, 'bandpass', 900, 2600, 0.12, 2); break;
      case 'plop': tone(0, 0.12, 'sine', 500, 180, 0.12); burst(0.05, 0.15, 'lowpass', 800, 200, 0.15); break;
      case 'catch': tone(0, 0.12, 'sine', 1900, 1700, 0.05); tone(0.03, 0.2, 'triangle', 3100, 2900, 0.03); break;
      case 'smash': burst(0, 0.35, 'highpass', 3000, 5000, 0.35); for (let k = 0; k < 5; k++) tone(k * 0.03, 0.12, 'triangle', 3600 - k * 300, 2600 - k * 200, 0.03); break;
      case 'puff': burst(0, 0.5, 'lowpass', 700, 250, 0.18); break;
      case 'cough': for (let k = 0; k < 3; k++) burst(k * 0.22, 0.14, 'bandpass', 500, 300, 0.25, 2); break;
      case 'win': for (let k = 0; k < 4; k++) tone(k * 0.12, 0.25, 'triangle', [523, 659, 784, 1046][k], [523, 659, 784, 1046][k], 0.05); break;
      default: break;
    }
  } catch (e) {
    // Sound is optional.
  }
}
