/* ==== ui/credits.js — the credits (TERV 0.12 Stáblista; NOTES-21-screens) ====
 * "A törpék dala alatt a karakterek Bilbó rajzaiként vonulnak el": a long page of Bilbo's book scrolls up, the people
 * of the story drawn in pencil (the six player characters from ui/art.js portraitSVG, greyed like pencil; Gandalf,
 * Gollum, Smaug and Bard as line drawings from ui/sketches.js), with their names as the game uses them.
 * The dwarves' song is only a reference: the music situation 'stablista' plays the player's own recording if
 * assets/music/stablista.mp3 exists (OLVASSEL-ZENE.txt), else the general list. No lyrics anywhere.
 *
 * Reachable from the title (Stáblista) and callable by the finale: `game.screens.playCredits()` returns a Promise
 * that resolves when the scroll ends or is skipped (queue item 9, the secret ending, is meant to call it). The scroll
 * is one CSS transform animation, so it costs nothing on the main thread; hidden, the page is display:none. ==== */
import { CHARACTERS } from '../player.js';
import { portraitSVG } from './art.js';
import { FIGURES } from './sketches.js';

/** Short roles, as the book introduces them (no invented titles). */
const ROLES = {
  bilbo: 'a betörő',
  thorin: 'a törpék vezére',
  balin: 'Thorin társa',
  bofur: 'Thorin társa',
  bombur: 'Thorin társa',
  kili: 'Thorin társa, Fíli öccse',
};
const OTHERS = [
  { key: 'gandalf', name: 'Gandalf', role: 'a varázsló' },
  { key: 'gollam', name: 'Gollam', role: 'a tó lakója a hegy gyökerei alatt' },
  { key: 'szmaug', name: 'Szmaug', role: 'a sárkány' },
  { key: 'bard', name: 'Bárd', role: 'a tóvárosi íjász' },
];
/** The rest of Thorin's company (book ch. 1), named only. */
const COMPANY = ['Dwalin', 'Fíli', 'Dori', 'Nori', 'Ori', 'Óin', 'Glóin', 'Bifur'];

/** Pixels per second of the scroll (default); `play({ duration })` overrides the total time. */
const SPEED = 46;

export class CreditsView {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    this.resolve = null;
    el.className = 'scr scr-credits';
    const card = (art, name, role, cls = '') => `<figure class="cr-fig ${cls}"><div class="cr-art">${art}</div><figcaption><b>${name}</b><small>${role}</small></figcaption></figure>`;
    el.innerHTML = `
      <div class="cr-page" aria-hidden="true"></div>
      <div class="cr-window">
        <div class="cr-roll">
          <h1>Egy lyuk a földben</h1>
          <p class="cr-sub">J. R. R. Tolkien regénye, <i>A hobbit</i> nyomán</p>
          <p class="cr-song">♪ a törpék dala alatt ♪</p>
          <div class="cr-rule"></div>
          <h2>Szereplők, Bilbó rajzaiban</h2>
          <div class="cr-figs">${CHARACTERS.map((ch) => card(portraitSVG(ch), ch.name, ROLES[ch.id] || '', 'pencil')).join('')}</div>
          <div class="cr-figs">${OTHERS.map((o) => card(FIGURES[o.key](), o.name, o.role, 'line')).join('')}</div>
          <h3>Thorin társaságából még</h3>
          <p class="cr-names">${COMPANY.join(' · ')}</p>
          <h3>És mindenki más a könyvből</h3>
          <p class="cr-names">Kiskötő-Zsákosék · a Zöld Sárkány vendégei · a trollok, kőből · a goblinok · Bakacsinerdő pókjai · a tündék · Tóváros népe</p>
          <div class="cr-rule"></div>
          <h3>Készült</h3>
          <p class="cr-names">Varga Tamás terve alapján · programozta Claude (Anthropic)</p>
          <p class="cr-names small">Megjelenítés: three.js · Betűk (SIL OFL): Uncial Antiqua, Almendra, EB Garamond, Caveat, Noto Sans Runic</p>
          <div class="cr-rule"></div>
          <p class="cr-end">Oda és vissza</p>
          <p class="cr-tail">— vége —</p>
        </div>
      </div>
      <p class="cr-skip">A / Enter / Esc: kihagyás</p>`;
    this.roll = el.querySelector('.cr-roll');
    this.win = el.querySelector('.cr-window');
    this.roll.addEventListener('animationend', () => this.finish());
    el.addEventListener('click', () => this.skippable && this.finish());
  }

  /**
   * Plays the credits. opts: { duration } in seconds (default: the roll's height at SPEED px/s), { skippable } (true).
   * Resolves when done or skipped.
   */
  play(opts = {}) {
    this.finish(); // a running roll ends first
    this.skippable = opts.skippable !== false;
    this.el.querySelector('.cr-skip').style.display = this.skippable ? '' : 'none';
    this.el.classList.add('on');
    const from = Math.round(this.win.clientHeight * 0.55); // the title starts a little below the middle, not off-screen
    const to = -this.roll.scrollHeight;
    const dur = opts.duration || (from - to) / SPEED;
    this.roll.style.setProperty('--from', `${from}px`);
    this.roll.style.setProperty('--to', `${to}px`);
    this.roll.style.setProperty('--dur', `${dur.toFixed(2)}s`);
    this.roll.classList.remove('run');
    void this.roll.offsetWidth; // restart the animation
    this.roll.classList.add('run');
    this.playing = true;
    return new Promise((res) => {
      this.resolve = res;
    });
  }

  /** Stops the scroll and resolves the play() promise. */
  finish() {
    if (!this.playing) return;
    this.playing = false;
    this.roll.classList.remove('run');
    this.el.classList.remove('on');
    const r = this.resolve;
    this.resolve = null;
    this.onEnd?.();
    r?.();
  }

  hide() {
    this.finish();
  }

  input(it) {
    if (this.skippable && (it.backPressed || it.pausePressed || it.confirmPressed)) this.finish();
  }
}
