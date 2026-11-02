/* ==== hoard/meter.js — the treasury's overlays in a player's HUD (themed, TERV 0.12; NOTES-7a-hoard):
   - THE NOISE METER: Smaug's eye in a dwarf-wrought iron frame at the top of the view: its lids open with the noise,
     the gold iris and the slit pupil show, the rim glows red past the waking mark; under it his state in Hungarian
     and his name in runes. Shown only in layer 9 while Smaug lies on the hoard.
   - THE DRAGON-SICKNESS: a gold haze bleeding in from the screen's edge and a gold cast over the whole view
     (TERV 0.11/1 and 0.12 "Sárkánykór: aranyszínű keret szivárog be a kép szélén").
   - THE FIRE'S FLASH: a short orange-red flare at the screen's edge when Smaug's fire strikes the player.
   - A PROMPT (the Arkenstone, bringing a partner to their senses), in the HUD's own prompt style.
   Built once per HUD, appended into its `.hud-in` (sized in its em); update() writes only what changed. ==== */
import { toRunes } from '../ui/runes.js';

let styled = false;
function addStyle() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
.sm-meter { position: absolute; left: 50%; top: 0.7em; transform: translateX(-50%); width: 10.5em; display: flex; flex-direction: column; align-items: center; pointer-events: none; opacity: 0; transition: opacity 0.8s; }
.sm-meter.on { opacity: 1; }
.sm-meter svg { width: 100%; height: auto; display: block; filter: drop-shadow(0 0.15em 0.3em #000c); overflow: visible; }
.sm-meter .sm-l { font-family: var(--f-head); font-size: 0.86em; color: var(--gold); text-shadow: 0 1px 2px #000, 0 0 0.5em #000; margin-top: -0.15em; white-space: nowrap; }
.sm-meter .sm-ru { font-family: var(--f-rune); font-size: 0.6em; color: #c8a04a; opacity: 0.75; letter-spacing: 0.18em; text-shadow: 0 1px 2px #000; }
.sm-meter.stir .sm-l { color: #f2a446; }
.sm-meter.wake .sm-l { color: #ff6a3a; animation: smPulse 0.45s ease-in-out infinite alternate; }
@keyframes smPulse { to { color: #ffd08a; } }
.sm-sick { position: absolute; inset: 0; pointer-events: none; opacity: 0; z-index: 2; }
.sm-sick .tint { position: absolute; inset: 0; background: #e8b030; mix-blend-mode: color; opacity: 0.55; }
.sm-sick .edge { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(255, 210, 90, 0) 38%, rgba(232, 168, 40, 0.42) 72%, rgba(200, 130, 20, 0.85) 100%);
  box-shadow: inset 0 0 4em 1.2em rgba(255, 200, 70, 0.55); animation: smSick 2.6s ease-in-out infinite alternate; }
@keyframes smSick { to { opacity: 0.72; } }
.sm-fire { position: absolute; inset: 0; pointer-events: none; opacity: 0; z-index: 3; box-shadow: inset 0 0 6em 2.2em rgba(255, 96, 20, 0.95), inset 0 0 1.4em 0.4em rgba(255, 220, 120, 0.9); }
`;
  document.head.appendChild(st);
}

/** The eye in its frame (viewBox 0 0 200 84): the lids' opening is a clipped ellipse whose height follows the noise. */
function eyeSVG(id) {
  return `<svg viewBox="0 0 200 84" aria-hidden="true">
  <defs>
    <radialGradient id="smIris${id}" cx="50%" cy="50%" r="55%">
      <stop offset="0" stop-color="#fff2a0"/><stop offset="0.35" stop-color="#ffc030"/><stop offset="0.75" stop-color="#e05a10"/><stop offset="1" stop-color="#5a1206"/>
    </radialGradient>
    <linearGradient id="smIron${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2e24"/><stop offset="1" stop-color="#16110c"/></linearGradient>
    <linearGradient id="smLid${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a160c"/><stop offset="0.5" stop-color="#3a0c06"/><stop offset="1" stop-color="#5a160c"/></linearGradient>
    <clipPath id="smOpen${id}"><ellipse class="sm-open" cx="100" cy="42" rx="74" ry="1"/></clipPath>
    <clipPath id="smAlm${id}"><path d="M22 42 Q100 -6 178 42 Q100 90 22 42 Z"/></clipPath>
  </defs>
  <path d="M8 42 L30 12 L170 12 L192 42 L170 72 L30 72 Z" fill="url(#smIron${id})" stroke="#c8a04a" stroke-width="2.2"/>
  <path d="M15 42 L34 17 L166 17 L185 42 L166 67 L34 67 Z" fill="none" stroke="#7a5a2a" stroke-width="1"/>
  ${[30, 170].map((x) => `<path d="M${x} 6 l4 6 l-4 6 l-4 -6 Z" fill="#c8a04a"/><path d="M${x} 66 l4 6 l-4 6 l-4 -6 Z" fill="#c8a04a"/>`).join('')}
  <g clip-path="url(#smAlm${id})">
    <rect x="20" y="0" width="160" height="84" fill="url(#smLid${id})"/>
    ${Array.from({ length: 9 }, (_, i) => `<path d="M${24 + i * 18} 30 q9 7 18 0" fill="none" stroke="#2a0804" stroke-width="1.6"/><path d="M${33 + i * 18} 54 q9 7 18 0" fill="none" stroke="#2a0804" stroke-width="1.6"/>`).join('')}
    <g clip-path="url(#smOpen${id})">
      <ellipse cx="100" cy="42" rx="80" ry="40" fill="url(#smIris${id})"/>
      <ellipse class="sm-pupil" cx="100" cy="42" rx="4" ry="30" fill="#140402"/>
    </g>
  </g>
  <path class="sm-rim" d="M22 42 Q100 -6 178 42 Q100 90 22 42 Z" fill="none" stroke="#e8c070" stroke-width="2.6"/>
  <g class="sm-ticks" stroke="#e8c070" stroke-width="1.6"></g>
</svg>`;
}

let uidN = 0;

/** One player's treasury overlays (built on first use inside the player's HUD). */
export class HoardHud {
  constructor(hud) {
    addStyle();
    this.hud = hud;
    const host = hud.el.querySelector('.hud-in') || hud.el;
    const id = `${++uidN}`;
    this.meter = document.createElement('div');
    this.meter.className = 'sm-meter';
    this.meter.innerHTML = `${eyeSVG(id)}<div class="sm-l"></div><div class="sm-ru">${toRunes('Szmaug')}</div>`;
    this.sick = document.createElement('div');
    this.sick.className = 'sm-sick';
    this.sick.innerHTML = '<div class="tint"></div><div class="edge"></div>';
    this.fire = document.createElement('div');
    this.fire.className = 'sm-fire';
    this.prompt = document.createElement('div');
    this.prompt.className = 'prompt sm-prompt';
    host.append(this.sick, this.fire, this.meter, this.prompt);
    this.open = this.meter.querySelector('.sm-open');
    this.pupil = this.meter.querySelector('.sm-pupil');
    this.rim = this.meter.querySelector('.sm-rim');
    this.label = this.meter.querySelector('.sm-l');
    this.c = {};
  }

  set(key, v, fn) {
    if (this.c[key] === v) return;
    this.c[key] = v;
    fn(v);
  }

  /**
   * @param {object} s { show, noise 0..1, state 'sleep'|'stir'|'wake'|'settle', label, sick 0..1, fire 0..1, prompt html|'' }
   */
  update(s) {
    this.set('show', !!s.show, (v) => this.meter.classList.toggle('on', v));
    if (s.show) {
      // The lids open with the noise (a thin line asleep, wide past the waking mark).
      const ry = Math.round((1 + Math.pow(Math.min(1, s.noise), 0.8) * 27) * 2) / 2;
      this.set('ry', ry, (v) => this.open.setAttribute('ry', v));
      this.set('pupil', s.state === 'wake' ? 7 : 4, (v) => this.pupil.setAttribute('rx', v));
      this.set('state', s.state, (v) => {
        this.meter.classList.toggle('stir', v === 'stir' || v === 'settle' || v === 'talk'); // talk: NOTES-16-smaug-talk
        this.meter.classList.toggle('wake', v === 'wake');
      });
      const hot = s.noise > 0.82 || s.state === 'wake' ? 2 : s.noise > 0.4 ? 1 : 0;
      this.set('rim', hot, (v) => this.rim.setAttribute('stroke', v === 2 ? '#ff5a28' : v === 1 ? '#f0a040' : '#e8c070'));
      this.set('label', s.label, (v) => (this.label.textContent = v));
    }
    const sk = Math.round(Math.min(1, s.sick) * 40) / 40;
    this.set('sick', sk, (v) => (this.sick.style.opacity = v));
    const fi = Math.round(Math.min(1, s.fire) * 40) / 40;
    this.set('fire', fi, (v) => (this.fire.style.opacity = v));
    this.set('prompt', s.prompt || '', (v) => (this.prompt.innerHTML = v));
  }

  remove() {
    this.meter.remove();
    this.sick.remove();
    this.fire.remove();
    this.prompt.remove();
  }
}
