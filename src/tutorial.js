/* ==== tutorial.js — the opening tutorial: one goal at a time per player, with the exact key or button for that
   player's controls and an arrow towards the place it talks about; each step completes by doing it ==== */
import { HUNGER } from './config.js';
import { LAYER_TOPS } from './materials.js';
import { SHOP_POS } from './props.js';
import { CRANE_POS } from './lift.js';

/** Key / button names per control scheme: the mouse player, the right-keyboard player (F2), a pad. */
const KEYS = {
  mouse: { dig: 'bal egérgomb', ladder: 'jobb egérgomb vagy Q', jump: 'Szóköz', down: 'Shift', use: 'E', look: 'az egér' },
  keys2: { dig: 'U', ladder: 'O', jump: 'jobb Shift', down: 'jobb Ctrl', use: 'P', look: 'I J K L' },
  pad: { dig: 'RT', ladder: 'LT vagy Y', jump: 'A', down: 'LB', use: 'X', look: 'a jobb kar' },
};

/**
 * The steps in order. `when` (optional) says when the step becomes the current goal, `done` when it is completed;
 * `target` is a world position the arrow points to. Steps already true at start (a continued game) are skipped.
 */
const STEPS = [
  { id: 'dig', text: (k) => `Nézz le (${k.look}), és áss a csákánnyal: ${k.dig}. A kiásott leletek maguktól a zsákodba repülnek.`,
    done: (p) => p.bag.length > 0 || p.depth > 2 },
  { id: 'deeper', text: () => 'Áss lejjebb! Minél mélyebbre jutsz, annál értékesebb leleteket találsz. A falban csillogó leleteket célzottan is kiáshatod.',
    done: (p) => p.depth > 4 || p.bag.length >= 4 },
  { id: 'ladder', text: (k) => `Mélyen vagy: támassz létrát a falhoz (${k.ladder}), és mássz fel rajta (${k.jump} vagy előre). A létra tetején a következő létrával folytathatod.`,
    when: (p) => p.depth > 3, done: (p, g) => g.ladders.list.length > 0 },
  { id: 'sell', text: (k) => `Vidd fel a leleteket a Zöld Sárkány pultjához, és add el őket (${k.use} a pultnál).`,
    when: (p) => p.bag.length >= 5 || p.bag.length >= p.bagCap, target: SHOP_POS, done: (p, g) => g.sold > 0 },
  { id: 'hunger', text: () => 'Figyeld a tányért: ásás és mászás közben éhezel. Ha kiürül, elájulsz, és elveszik, amit ezen az úton kiástál. A pultnál ehetsz.',
    when: (p) => p.hunger < HUNGER.max * 0.55, done: (p) => p.hunger >= HUNGER.max * 0.9 || p.seenHungerTip > 8 },
  { id: 'upgrade', text: () => 'A pultnál jobb ásót és nagyobb zsákot is vehetsz: gyorsabban ássz, többet vihetsz.',
    when: (p, g) => g.sold > 0, target: SHOP_POS, done: (p) => p.toolTier > 0 || p.bagTier > 0 },
  { id: 'lift', text: (k) => `Elérted a pincéket! A gödör szélén álló hordóliftnél (${k.use}) megállót építhetsz ide, így legközelebb nem kell lemásznod.`,
    when: (p) => (p.maxDepth || 0) >= LAYER_TOPS[1], target: CRANE_POS, done: (p, g) => g.lift.built.size > 1 },
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.done = new Set();
    this.ui = new Map(); // player → elements
    this.hints = new Map(); // player → { html, t }: a one-off parchment hint (hint() below)
  }

  /**
   * A one-off parchment hint for one player (mirkwood-foes/: the first spider, the first capture, the barrel ride):
   * shown once per game (its id is saved in the done list like the steps), for `seconds`, in the goal box's place
   * (the goal waits meanwhile). `html` already names that player's keys. Returns true when it was shown.
   */
  hint(i, p, id, html, seconds = 12) {
    if (this.done.has(id) || !html) return false;
    this.done.add(id);
    this.hints.set(p, { html, t: seconds });
    return true;
  }

  state() {
    return [...this.done];
  }

  restore(list) {
    for (const id of list || []) this.done.add(id);
  }

  /** Marks the steps a continued game has already passed. */
  skipFinished(p) {
    for (const s of STEPS) if (!this.done.has(s.id) && s.done(p, this.game)) this.done.add(s.id);
  }

  current(p) {
    for (const s of STEPS) {
      if (this.done.has(s.id)) continue;
      if (s.done(p, this.game)) {
        this.done.add(s.id);
        p.say('Szép munka!', 1.5);
        continue;
      }
      if (!s.when || s.when(p, this.game)) return s;
    }
    return null;
  }

  /** Per frame and player: the goal box and the arrow, inside that player's HUD. */
  update(dt, i, p) {
    const game = this.game;
    const b = game.bindings[i];
    const keys = b.pad != null && !b.kbm ? KEYS.pad : KEYS[b.kbm] || KEYS.pad;
    if (p.hunger < HUNGER.max * 0.55) p.seenHungerTip = (p.seenHungerTip || 0) + dt;
    // No goals inside Bag End: they all point at the pit and the inn.
    const step = p.choosing || p.riding || game.bagEnd?.isInside(p) ? null : this.current(p);
    let ui = this.ui.get(p);
    const el = game.huds[i]?.el;
    if (!el) return;
    if (!ui || ui.root !== el) {
      ui = { root: el, box: document.createElement('div'), arrow: document.createElement('div'), text: '' };
      // The parchment "quest" style of ui.css; only the position and visibility are set here.
      ui.box.className = 'quest';
      Object.assign(ui.box.style, { position: 'absolute', left: '50%', top: '64px', transform: 'translateX(-50%)', width: 'min(62%, 540px)', pointerEvents: 'none', zIndex: '4', display: 'none' });
      Object.assign(ui.arrow.style, {
        position: 'absolute', left: '50%', top: '150px', width: '0', height: '0', marginLeft: '-14px',
        borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderBottom: '26px solid #e8c070',
        filter: 'drop-shadow(0 2px 3px #000a)', transformOrigin: '50% 60%', pointerEvents: 'none', zIndex: '4', display: 'none',
      });
      el.append(ui.box, ui.arrow);
      this.ui.set(p, ui);
    }
    // A one-off hint (hint()) takes the goal box's place while it lasts.
    const h = this.hints.get(p);
    if (h) {
      h.t -= dt;
      if (h.t <= 0) this.hints.delete(p);
    }
    const text = h ? h.html : step ? `<b style="color:var(--gold,#e8c070)">Feladat:</b> ${step.text(keys)}` : '';
    if (text !== ui.text) {
      ui.text = text;
      ui.box.innerHTML = text;
      ui.box.style.display = text ? 'block' : 'none';
    }
    // The arrow: the target's direction relative to where the player looks (up = straight ahead).
    if (step?.target && p.depth < 1.5) {
      const dx = step.target.x - p.pos.x;
      const dz = step.target.z - p.pos.z;
      const ang = Math.atan2(dx, -dz) + p.yaw;
      ui.arrow.style.display = Math.hypot(dx, dz) > 3 ? 'block' : 'none';
      ui.arrow.style.transform = `rotate(${(ang * 180) / Math.PI}deg)`;
    } else ui.arrow.style.display = 'none';
  }

  /** The tutorial line for a newly joined second player. */
  static joinHint() {
    return 'Második játékos: Start a másik kontrolleren, vagy F2 a billentyűzet jobb oldalán.';
  }
}
