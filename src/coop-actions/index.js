/* ==== coop-actions/index.js — Beorn's rule: "kettesével gyertek" (TERV 0.11/18; Decision 17; NOTES-23-coop-actions).
   Things that need two: the heavy dwarf chest two carry (chests.js), the dwarves' hoist two pull (hoist.js), one
   holding the lamp while the other digs (lamp.js). In single play the hired dwarf, Dori (modes/helper.js), is the
   second pair of hands for all three.
   Wiring: modes/index.js builds it (`game.coopActions`), passes it each player's intent first (`input`, before the
   lift, the shop and the other use-key owners: a use press it spends is cleared from the intent) and calls `update(dt)`
   each frame after the players moved; the save rides in the mode state (`mode.ca`). player.js reads `carrying`,
   `carryK`, `digBlocked`, the lamp numbers and `digMult()`. Idle cost: a few distance checks per frame; DOM writes only
   when a prompt changes. ==== */
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { Chests } from './chests.js';
import { Hoist } from './hoist.js';
import { Lamp } from './lamp.js';
import { sharedMaterial } from './models.js';
import { CHEST, LAMP } from './rules.js';

/** The lamp key's label per device (input.js: H, the F2 player's "-" key, a pad's right-stick click). */
const LAMP_KEY = { mouse: '<span class="k">H</span>', keys2: '<span class="k">-</span>', pad: '<span class="pb pt">RS</span>' };

/** The one-off tutorial hints (tutorial.js hint(): shown once per game, saved with the tutorial). */
const HINTS = {
  chest: (k, solo) => `<b>Beorn szabálya: kettesével gyertek!</b> Ezt a nehéz törpeládát egyedül nem bírod el. ${solo ? `Fogd meg az egyik fülét (${k.use}), Dori megfogja a másikat` : `Álljatok a két végéhez, és mindketten nyomjátok meg a használat gombot (${k.use})`}. Lassan vihetitek, létrán nem. Egy hordólift-megállóban a lift felviszi a felszínre; a Zöld Sárkány pultjánál vagy Zsáklak ajtajánál nyissátok ki!`,
  'chest-carry': (k) => `Cipelitek a ládát: maradjatok együtt, különben lecsúszik. ${k.use}: leteszitek; egy hordólift-megállóban beemelitek a hordóba.`,
  hoist: (k, solo) => `<b>Törpe csigasor.</b> ${solo ? `Dori a másik kötélnél: az ő ütemére húzz (${k.use}), amikor rákiált, hogy „rukk!”.` : `Csak akkor emelkedik, ha ketten egyszerre húzzátok (${k.use}): a pallón állva vagy a felső akna két kötelénél.`} A gomb nyomva tartásával kiold a fék, és leereszkedik. A ládát is felviszi, ha a pallóra teszitek.`,
  lamp: (k, solo) => `<b>Kettős fény.</b> ${solo ? `Dori tartja a lámpát (${k.lamp}): a fényében gyorsabban ássz.` : `Az egyikőtök magasra tartja a lámpát (${k.lamp}), a másik a közelében ás: több fény, gyorsabb ásás.`}`,
};

export class CoopActions {
  constructor(game) {
    this.game = game;
    this.mat = sharedMaterial();
    this.chests = new Chests(this);
    this.hoist = new Hoist(this);
    this.lamp = new Lamp(this);
    this.msgT = new Map();
    this.ui = new Map(); // HUD element → { el, text }
    this.hintT = 0;
  }

  /** The players in play (not choosing a character). */
  humans() {
    return this.game.players.filter((q) => !q.choosing);
  }

  /** Dori when he helps (hired, single play), else null. */
  get dori() {
    const H = this.game.modes?.helper;
    return H?.active && !this.game.modes?.versus ? H : null;
  }

  /** Free to act: alive, not riding, held, wrapped or carried off by anything. */
  free(p) {
    return p.dead <= 0 && !p.choosing && !p.riding && !p.asleep && !p.held && !p.wrap && !p.cocoon && !p.washed && !p.barrel && !p.captured;
  }

  /** A throttled message (once per `every` s per key and player). */
  say(p, key, text, every = 5) {
    const k = `${key}|${p.slot}`;
    const t = performance.now();
    if (t - (this.msgT.get(k) || -1e9) < every * 1000) return;
    this.msgT.set(k, t);
    p.say(text, Math.min(5, every + 1));
  }

  device(p) {
    const i = this.game.players.indexOf(p);
    return deviceOf(this.game.bindings?.[i]);
  }

  useKey(p) {
    const shared = this.game.bindings?.some((b) => b.kbm === 'keys2');
    return glyphs(this.device(p), shared).interact;
  }

  /** The use key as plain text (for p.say messages, which are not HTML). */
  useKeyText(p) {
    return { mouse: 'E', keys2: 'P', pad: 'X' }[this.device(p)] || 'E';
  }

  lampKey(p) {
    return LAMP_KEY[this.device(p)] || LAMP_KEY.mouse;
  }

  /** A one-off tutorial hint for p (or the first player in play); tutorial.js shows each id once per game. */
  hint(id, p = null) {
    const tut = this.game.tutorial;
    const q = p || this.humans()[0];
    if (!tut?.hint || !q || tut.done?.has?.(`beorn-${id}`)) return;
    const i = this.game.players.indexOf(q);
    if (i >= 0) tut.hint(i, q, `beorn-${id}`, HINTS[id]({ use: this.useKey(q), lamp: this.lampKey(q) }, !!this.dori), 14);
  }

  /** Whether p is in a menu or a held scene that owns the keys. */
  busy(p, i) {
    const g = this.game;
    return !!(g.lift?.menus?.has(p) || g.huds?.[i]?.shopOpen || g.journal?.ui?.get?.(p)?.open);
  }

  /**
   * Per player, before every other use-key owner (modes/index.js input): the lamp key, the chest's handles, the hoist's
   * ropes. A use press spent here is cleared from the intent. Never holds the player (returns false).
   */
  input(p, i, it) {
    if (this.game.modes?.versus || !this.free(p) || this.busy(p, i)) {
      this.hoist.holds.delete(p);
      return false;
    }
    if (it.lampPressed) this.lamp.toggle(p);
    if (it.interactPressed && this.use(p)) it.interactPressed = false;
    this.hoist.hold(p, it);
    if (p.carrying && (it.digPressed || it.ladderPressed || it.jumpPressed)) this.say(p, 'hands', 'Mindkét kezed a ládán van: tedd le, ha ásni, mászni vagy ugrani akarsz.', 4);
    return false;
  }

  /** The use key: a chest held, the hoist's ropes, a chest to take, the hoist called down. True when spent. */
  use(p) {
    const C = this.chests;
    const Hs = this.hoist;
    if (C.heldBy(p)) return C.use(p);
    // On the platform or at a top handle the use key pulls; only a chest at the top, off the platform, is taken there.
    if (Hs.puller(p) && !(Hs.atTop && !Hs.onPlatform(p) && C.nearest(p))) {
      Hs.pull(p);
      return true;
    }
    if (C.use(p)) return true;
    return Hs.callDown(p);
  }

  /** The swing cooldown factor (player.js tryDig): faster in a held lamp's light. */
  digMult(p) {
    return this.lamp.digMult(p);
  }

  /** Kihívás cave-in (modes/): never fill the hoist's shaft. */
  nearShaft(x, y, z) {
    return this.hoist.nearShaft(x, y, z);
  }

  /** Per frame, after the players moved. */
  update(dt) {
    if (this.game.modes?.versus) return;
    this.hoist.update(dt);
    this.chests.update(dt);
    this.lamp.update(dt);
    this.doriTask();
    this.hints(dt);
    this.game.players.forEach((p, i) => this.overlay(i, p));
  }

  /** Dori's part in single play: carry > pull > the lamp (modes/helper.js setTask). */
  doriTask() {
    const H = this.dori;
    const helper = this.game.modes?.helper;
    if (!H) {
      if (helper?.task) helper.setTask(null);
      return;
    }
    let task = null;
    if (this.chests.doriChest) task = { kind: 'carry', follow: CHEST.doriGap };
    else if (this.hoist.beat) task = { kind: 'pull', at: () => this.hoist.doriSpot() };
    else if (this.lamp.dori) task = { kind: 'lamp', follow: LAMP.doriFollow };
    if ((task?.kind || null) !== (H.task?.kind || null)) H.setTask(task);
  }

  /** The first sight of a chest, the hoist or a partner to light: the tutorial's one-off hints (checked 4 times a second). */
  hints(dt) {
    this.hintT += dt;
    if (this.hintT < 0.25) return;
    this.hintT = 0;
    for (const p of this.humans()) {
      if (p.dead > 0 || p.depth < 3) continue;
      if (this.chests.near(p, 6)) this.hint('chest', p);
      if (this.hoist.carved && (this.hoist.puller(p) || this.hoist.below(p))) this.hint('hoist', p);
      const partner = this.humans().find((q) => q !== p);
      if (p.depth > 12 && ((partner && partner.pos.distanceTo(p.pos) < LAMP.reach) || this.dori)) this.hint('lamp', p);
    }
  }

  /** The prompt line for p: the chest, the hoist, the lamp (first that has something). */
  promptFor(p) {
    if (p.choosing || p.dead > 0 || this.game.modes?.versus) return '';
    return this.chests.prompt(p) || this.hoist.prompt(p) || this.lamp.prompt(p);
  }

  /** One line of text in the player's HUD (inline styles: index.html's stylesheet belongs to the UI work). */
  overlay(i, p) {
    const hud = this.game.huds?.[i];
    if (!hud?.el) return;
    let u = this.ui.get(hud.el);
    if (!u) {
      const el = document.createElement('div');
      el.className = 'beorn-prompt';
      Object.assign(el.style, {
        position: 'absolute', left: '0', right: '0', top: '58%', textAlign: 'center', fontSize: '16px', color: 'var(--gold, #e8c070)',
        textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '4',
      });
      hud.el.append(el);
      u = { el, text: '' };
      this.ui.set(hud.el, u);
    }
    const text = this.promptFor(p);
    if (u.text !== text) {
      u.text = text;
      u.el.innerHTML = text;
    }
  }

  state() {
    return { c: this.chests.state(), h: this.hoist.state() };
  }

  restore(s) {
    if (!s) return;
    this.chests.restore(s.c);
    this.hoist.restore(s.h);
  }
}
