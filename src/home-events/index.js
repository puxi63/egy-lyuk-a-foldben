/* ==== home-events/index.js — Bag End's comfort-gated home events (TERV 0.13/2: "Egyes események csak elég kényelmes
   otthonnal jönnek: Gandalf betoppan, a 13 törpe beállít, Bilbó születésnapja; Lobelia irigykedik, és megpróbál
   ellopni egy ezüstkanalat"; 0.7 "Váratlan vendégek"; 0.11/12 the plate throwing; 0.11/13 the birthday gifts).
   NOTES-14-bagend-events.
   - Gandalf drops in (book ch. 1: he knocks with his staff, blows smoke rings; TERV 0.3 "betoppan, tanácsot ad,
     tűzijátékot hoz"): comfort ≥ 30, by day, at most every 3rd game day. Gift: one of his firework rockets per player
     at home (exits.js `p.rockets`), and a hint for the deepest layer reached. Once the house is ready for the party
     (comfort ≥ 90) he scratches his sign on the round door: the dwarves come on a later day.
   - The Unexpected Party (book ch. 1, TERV 0.7): one-off, comfort ≥ 90, after Gandalf's sign, from tea-time to the
     evening (16:00–21:00). The thirteen arrive group by group, then Gandalf; they eat the pantry bare (free food at
     home is off until the next game day) and stay to dig: the hall pegs (bagEnd.effects.extraDwarves) decide how many
     stay and for how long (dig cooldown ×(1 − 0.015 × n) for 1 + 0.25 × peg tier game days). The scene ends by
     starting the plate throwing (minigames/plates.js, `game.events.emit('unexpected-party')`).
   - Bilbo's birthday (22 September): a game day stands for a month here, day 1 = April, so it falls on days 6, 18,
     30 … (every 12th). Comfort ≥ 60, any time 07:00–21:00 with somebody at home. A party; Bilbo gives presents (the
     hobbit custom, TERV 0.11/13) → "hírnév": finds sell for 5 % more for one game day; everybody at home eats his fill.
     NOTES-19-ui: each watcher may pick a mathom from his bag to give away (TERV 0.11/13 "szülinapodon te adsz
     ajándékot … hírnevet szerzel"): every mathom given adds 4 % to that day's fame.
   - Lobelia's envy (TERV 0.13/2): the sideboard with the silver spoons (talalo tier 2) and comfort ≥ 45, by day, at
     most every 5th game day, at most 3 visits, none after she was caught. She tries to pocket one spoon: catch her
     (confirm / use key) → she gives it back with another one she picked up in the garden (an "Ezüstkanál" find; TERV
     layer 1 "Lobelia kanalat lop a felszínen"). Not caught → she leaves with one spoon; the sideboard's tier is not
     touched (the real loss of the spoons is the auction's first lot, timed-events/auction.js).
   Every event: a short held scene in Bag End (captions on a parchment, controller friendly: confirm = next, back =
   skip; rewards are given on skip too), one home event per game day, saved flags. Off on bench pages (`force` for QA)
   and while the finale runs. Idle cost: one check every 0.5 s (a few comparisons). The figures are built once at start
   (figures.js) and hidden.
   Wiring (marked "home-events (NOTES-14-bagend-events)"): game.js `this.homeEvents = new HomeEvents(this)` +
   `restore(save.home)` after the minigames; per-player chain `else if (this.homeEvents.input(p, i, it)) menuOpen = true;`
   before the minigames; `this.homeEvents.update(dt)` after the minigames; save.js `home: game.homeEvents?.state()`;
   player.js tryDig × `homeEvents.digMult(p)`; bagend/effects.js reads `be.pantryEaten()` / `be.sellMult()`. ==== */
import * as THREE from 'three';
import { ROCKET_MAX } from '../exits.js';
import { FIND_TYPES } from '../finds.js';
import { isMathom } from '../shire/mathoms.js'; // shire (NOTES-26-shire)
import { layerAtDepth } from '../materials.js';
import { DAY } from '../daynight.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { INTERIOR_ORIGIN } from '../bagend/index.js';
import { buildVisitors, DWARF_ARRIVALS } from './figures.js';
import { buildDoorMark, SmokeRings } from './marks.js';

/** The rules (comfort is bagEnd.comfort, 0 … 192; days and hours are the day clock's). */
export const HOME = {
  check: 0.5, // s between the checks
  settle: 1.5, // s a player must be inside (and free) before a visit starts
  step: 7, // s a caption stays before the next one comes by itself
  stepMin: 0.35, // s before a press can move on (two players pressing in the same frame move one step)
  gandalf: { comfort: 30, every: 3, from: 8, to: 17.5 },
  party: { comfort: 90, from: 16, to: 21, digPer: 0.015, stay: [2, 4, 8, 13], days: 1, perPeg: 0.25 },
  // giftFame / chooseT / giftChoices: the gift choice (NOTES-19-ui): each mathom given adds to the fame; s to choose.
  birthday: { comfort: 60, month: 6, year: 12, from: 7, to: 21, fame: 1.05, giftFame: 0.04, chooseT: 15, giftChoices: 3 },
  lobelia: { comfort: 45, every: 5, max: 3, from: 9, to: 17, catchT: 6, spoonTier: 2 },
};

/** Where the visitors stand and the players are held (Bag End local metres, plan.js; the hall is x −1.8…1.8, z 0…4.2). */
const SPOTS = {
  gandalf: [0, 0.8, 0],
  gandalfParty: [0, 0.45, 0],
  lobelia: [-3.05, 2.75, Math.PI / 2],
  lobeliaSteal: [-3.25, 3.0, Math.atan2(-0.35, 0.3)],
  holdHall: [[-0.42, 3.5], [0.42, 3.5]],
  holdParty: [[-0.45, 3.85], [0.45, 3.85]],
  holdDining: [[-0.85, 2.5], [-0.85, 3.0]],
};
/** The thirteen, in arrival order: [x, z] (they face the players). */
const DWARF_XZ = [[-1.3, 2.65], [1.3, 2.65], [-0.75, 2.8], [0.75, 2.8], [-1.35, 1.95], [-0.8, 2.1], [0.8, 2.1], [1.35, 1.95], [-1.3, 1.25], [1.3, 1.25], [-0.75, 1.4], [0.75, 1.4], [0, 1.15]];
const DWARF_SPOTS = DWARF_XZ.map(([x, z]) => [x, z, Math.atan2(0 - x, 3.85 - z)]);

/** Gandalf's hint by the deepest layer reached (materials.js layer index). Paraphrases of the book, kept short. */
const HINTS = [
  'Ez a gödör többet tud, mint egy közönséges lyuk. Ásd csak mélyebbre, de a létráidat ne hagyd otthon!',
  'A régi hobbitpincék alatt a trollok barlangja jön. A trollok hajnalban, ha rájuk süt a nap, kővé válnak.',
  'A trollok zsákmánya között jó pengét is találhatsz. A goblinok dobszóval jönnek: éjjel maradj otthon, vagy légy résen.',
  'A goblinok alagutjai alatt egy hideg tó van, és valaki lakik a közepén. Ha találós kérdést kapsz, gondold meg, mit felelsz.',
  'Bakacsinerdőben ne térjetek le az ösvényről, és ne igyatok a fekete patakból!',
  'A tündék királyának pincéiből hordóban is ki lehet jutni. Lejjebb Tóváros cölöpei alatt jártok.',
  'Tóváros alatt Bárd szívesen vásárol. Utána Erebor tárnái jönnek: a törpék csarnokai.',
  'Durin napján, napnyugtakor a rigó kopogtat a szürke kőnél: Thrór kulcsa és a lenyugvó nap fénye nyitja az ajtót.',
  'Szmaug kincstárában járj csendben: a sárkány alszik, de fél szemmel figyel. Az Arkenkő felébreszti.',
];

const v1 = new THREE.Vector3();
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inHours = (h, from, to) => h >= from && h < to;

export class HomeEvents {
  constructor(game) {
    this.game = game;
    /** QA: allows the events on a bench page. */
    this.force = false;
    this.checkT = HOME.check;
    this.scene = null;
    this.ui = new Map();
    this.since = new Map(); // player → seconds inside and free
    this.resetState();
    const be = game.bagEnd;
    if (be) {
      this.figs = buildVisitors(be.scene, INTERIOR_ORIGIN, DWARF_SPOTS);
      // NOTES-19-ui: Gandalf's smoke rings (interior, hidden until his visit) and his sign on the door (surface).
      this.rings = new SmokeRings(be.scene, INTERIOR_ORIGIN);
      // bagend/effects.js hooks: the pantry the dwarves ate, the birthday's fame on selling.
      be.pantryEaten = () => this.pantryEaten();
      be.sellMult = () => this.sellMult();
      // The guest bed's row needs nothing from here (bagend/effects.js `sleepGuest`).
    }
    if (game.scene) this.doorMark = buildDoorMark(game.scene);
    this.syncMark();
  }

  resetState() {
    /** Gandalf: last visit day, visits, the day he scratched his sign on the door (null = not yet). */
    this.gandalf = { last: null, n: 0, mark: null };
    /** The party: the game day it happened (null = not yet), the dwarves staying, the clock second their help ends. */
    this.party = { day: null, stay: 0, until: 0 };
    /** The birthday: the game day it was last held (see HOME.birthday), the clock second the fame ends, how many. */
    this.birthday = { year: null, fameUntil: 0, n: 0, mult: 0, gifts: 0 }; // mult 0 = the plain fame; gifts in all
    /** Lobelia: last visit day, visits, caught. */
    this.lobelia = { last: null, n: 0, caught: false };
    /** The game day of the last home event (one per day). */
    this.lastDay = null;
    this.syncMark();
  }

  /** NOTES-19-ui: the door shows Gandalf's sign once he scratched it (saved as g.m). */
  syncMark() {
    if (this.doorMark) this.doorMark.visible = this.gandalf.mark != null;
  }

  get enabled() {
    return this.force || !this.game.bench;
  }

  clock() {
    return this.game.bagEnd?.clock || 0;
  }

  today() {
    return this.game.dayClock?.day?.() ?? 1;
  }

  hour() {
    return this.game.dayClock?.hour?.() ?? 12;
  }

  comfort() {
    return this.game.bagEnd?.comfort || 0;
  }

  /* ---------------- the effects other modules read ---------------- */

  /** bagend/effects.js: the dwarves ate the pantry bare (until the next game day). */
  pantryEaten() {
    return this.party.day != null && this.today() === this.party.day;
  }

  /** bagend/effects.js mathomSellBonus: the birthday's fame (finds sell for more for a game day). */
  sellMult() {
    return this.clock() < this.birthday.fameUntil ? this.birthday.mult || HOME.birthday.fame : 1;
  }

  /** player.js tryDig: the dwarves who stayed after the party dig along (a shorter dig cooldown). */
  digMult() {
    return this.party.stay > 0 && this.clock() < this.party.until ? 1 - HOME.party.digPer * this.party.stay : 1;
  }

  /* ---------------- which event is due ---------------- */

  /** The Shire-calendar mapping: a game day stands for a month, day 1 = April → September = day 6 + 12k. */
  static isBirthday(day) {
    return day >= HOME.birthday.month && (day - HOME.birthday.month) % HOME.birthday.year === 0;
  }

  /** The event due now ('party' | 'birthday' | 'gandalf' | 'lobelia') or null. Priority in that order. */
  due() {
    const day = this.today();
    const h = this.hour();
    const c = this.comfort();
    const H = HOME;
    if (this.party.day == null && this.gandalf.mark != null && day > this.gandalf.mark && c >= H.party.comfort && inHours(h, H.party.from, H.party.to)) return 'party';
    if (this.lastDay === day) return null;
    if (HomeEvents.isBirthday(day) && this.birthday.year !== day && c >= H.birthday.comfort && inHours(h, H.birthday.from, H.birthday.to)) return 'birthday';
    const g = this.gandalf;
    const wantsMark = g.mark == null && c >= H.party.comfort;
    if (c >= H.gandalf.comfort && inHours(h, H.gandalf.from, H.gandalf.to) && (g.last == null || day >= g.last + H.gandalf.every || (wantsMark && day > g.last))) return 'gandalf';
    const L = this.lobelia;
    if (!L.caught && L.n < H.lobelia.max && c >= H.lobelia.comfort && (this.game.bagEnd?.tiers?.talalo || 0) >= H.lobelia.spoonTier
      && inHours(h, H.lobelia.from, H.lobelia.to) && (L.last == null || day >= L.last + H.lobelia.every)) return 'lobelia';
    return null;
  }

  /** A player who can watch a visit: inside Bag End, settled, no menu, fade, minigame or journal page. */
  free(p, i) {
    const g = this.game;
    if (p.choosing || p.dead > 0 || p.riding || p.asleep || !g.bagEnd?.isInside(p)) return false;
    const v = g.bagEnd.view?.[i];
    if (v && (v.dir || v.menu?.open)) return false;
    if (g.minigames?.busy?.(p) || g.journal?.isOpen?.(p)) return false;
    return true;
  }

  /* ---------------- per frame ---------------- */

  update(dt) {
    if (this.scene) {
      this.runScene(dt);
      return;
    }
    this.checkT -= dt;
    if (this.checkT > 0) return;
    const step = HOME.check - this.checkT;
    this.checkT = HOME.check;
    if (!this.enabled || !this.game.bagEnd || !this.game.dayClock) return;
    const st = this.game.finale?.stage;
    if (st && st !== 'idle' && st !== 'done') return;
    const ready = [];
    this.game.players.forEach((p, i) => {
      const t = this.free(p, i) ? (this.since.get(p) || 0) + step : 0;
      this.since.set(p, t);
      if (t >= HOME.settle) ready.push(p);
    });
    if (!ready.length) return;
    const id = this.due();
    if (id) this.start(id);
  }

  /** Starts a scene for every free player at home (QA may call it directly). */
  start(id) {
    const g = this.game;
    const viewers = g.players.filter((p, i) => this.free(p, i));
    if (!viewers.length || this.scene) return false;
    const steps = this[`${id}Steps`]();
    this.scene = { id, steps, k: -1, t: 0, viewers: new Set(viewers), caught: false, catchOpen: false };
    viewers.forEach((p) => {
      const i = g.players.indexOf(p);
      const v = g.bagEnd.menuFor(i);
      v.menu.close();
      v.menu.prompt(null);
    });
    // The ones away hear of it.
    const away = { gandalf: 'Hír jön Zsáklakból: Gandalf kopogtatott az ajtón.', party: 'Hír jön Zsáklakból: tizenhárom törpe állított be!', birthday: 'Ma van Bilbó születésnapja: Zsáklakban ünnepelnek.', lobelia: 'Hír jön Zsáklakból: Kiskötő-Zsákos Lobelia benézett.' }[id];
    for (const p of g.players) if (!this.scene.viewers.has(p) && !p.choosing) p.say(away, 4);
    this.next();
    return true;
  }

  /** The next step (or the end). */
  next() {
    const S = this.scene;
    S.k++;
    S.t = 0;
    const st = S.steps[S.k];
    this.rings?.stop(); // NOTES-19-ui: the smoke rings belong to their own caption only
    if (!st) {
      this.finish(false);
      return;
    }
    st.enter?.();
    S.catchOpen = !!st.catch;
  }

  runScene(dt) {
    const S = this.scene;
    S.t += dt;
    const st = S.steps[S.k];
    // A viewer who left the game (removed) or died lets go.
    for (const p of [...S.viewers]) if (!this.game.players.includes(p) || p.dead > 0) S.viewers.delete(p);
    if (!S.viewers.size) {
      this.finish(true);
      return;
    }
    this.rings?.update(dt); // NOTES-19-ui: only while the smoke-ring caption is up
    if (S.t >= (st.dur || HOME.step)) this.next();
    if (this.scene) this.drawUi();
  }

  /** Per player, early in the menu chain: true while the scene holds the player (confirm = next, back = skip). */
  input(p, i, it) {
    const S = this.scene;
    if (!S || !S.viewers.has(p)) return false;
    const st = S.steps[S.k];
    const go = it.confirmPressed || it.interactPressed || it.digPressed;
    const choosing = st?.choose && S.gift && [...S.gift.values()].some((c) => c.opts.length);
    if (S.t > HOME.stepMin && choosing && !it.backPressed) {
      // NOTES-19-ui: the birthday gift: left / right picks, confirm gives (each watcher for himself).
      const c = S.gift?.get(p);
      if (c && !c.done) {
        const step = (it.rightPressed ? 1 : 0) - (it.leftPressed ? 1 : 0);
        if (step) c.sel = (c.sel + step + c.opts.length) % c.opts.length;
        if (go) this.giveGift(p, c);
      }
      if ([...S.viewers].every((q) => S.gift?.get(q)?.done)) this.next();
    } else if (S.t > HOME.stepMin && st) {
      if (it.backPressed) this.finish(true);
      else if (go) {
        if (st.catch && S.catchOpen) {
          S.caught = true;
          S.catcher = p;
        }
        this.next();
      }
    }
    // Held in place, the view turned to the visitor.
    const hold = this.scene?.hold;
    const k = [...(this.scene?.viewers || [])].indexOf(p);
    if (hold && k >= 0) {
      const [x, z] = hold[k % hold.length];
      p.pos.set(INTERIOR_ORIGIN.x + x, this.game.bagEnd.floorHeight(INTERIOR_ORIGIN.x + x, INTERIOR_ORIGIN.z + z), INTERIOR_ORIGIN.z + z);
    }
    p.vel.set(0, 0, 0);
    const look = this.scene?.look;
    if (look) {
      const e = p.eye(v1);
      const yaw = Math.atan2(-(INTERIOR_ORIGIN.x + look[0] - e.x), -(INTERIOR_ORIGIN.z + look[2] - e.z));
      const pitch = Math.atan2(look[1] - e.y, Math.hypot(INTERIOR_ORIGIN.x + look[0] - e.x, INTERIOR_ORIGIN.z + look[2] - e.z));
      const kk = Math.min(1, (this.game.bagEnd?.lastDt || 1 / 60) * 4 + 0.05);
      p.yaw += wrapA(yaw - p.yaw) * kk;
      p.pitch += (clamp(pitch, -1.2, 1.2) - p.pitch) * kk;
    }
    return true;
  }

  /** Ends the scene: hides the visitors, gives the rewards (also when skipped), saves. */
  finish(skipped) {
    const S = this.scene;
    if (!S) return;
    this.scene = null;
    S.skipped = skipped;
    this.rings?.stop();
    const f = this.figs;
    if (f) {
      f.gandalf.visible = false;
      f.dwarves.visible = false;
      f.lobelia.visible = false;
    }
    this[`${S.id}Done`](S);
    for (const p of this.game.players) this.since.set(p, 0);
    this.drawUi(true);
    this.game.saveNow?.();
  }

  /* ---------------- the scenes ---------------- */

  /** Places a figure (local x, z, yaw) and shows it. */
  place(m, [x, z, yaw]) {
    m.position.set(x, this.game.bagEnd.floorHeight(INTERIOR_ORIGIN.x + x, INTERIOR_ORIGIN.z + z) - INTERIOR_ORIGIN.y, z);
    m.rotation.y = yaw;
    m.visible = true;
  }

  /** Holds the viewers at `hold` ([[x, z] …]) looking at local [x, y, z]. */
  stage(hold, look) {
    this.scene.hold = hold;
    this.scene.look = look;
  }

  gandalfSteps() {
    const f = this.figs;
    const mark = this.gandalf.mark == null && this.comfort() >= HOME.party.comfort;
    const first = this.gandalf.n === 0;
    const steps = [
      { title: 'Kopogtatnak', text: 'Kopp, kopp, kopp! Valaki a botjával kopogtat a kerek zöld ajtón.', dur: 4.5, enter: () => this.stage(SPOTS.holdHall, [0, 1.5, 0.3]) },
      {
        title: 'Gandalf betoppan',
        text: first
          ? 'Gandalf az: hosszú szürke köpeny, hegyes kék kalap, ezüst sál, a derekáig érő fehér szakáll. Körülnéz, és elégedetten bólint: Zsáklak kezd újra a régi lenni.'
          : 'Gandalf az, megint. Körülnéz a házban, és elégedetten bólint.',
        enter: () => {
          this.place(f.gandalf, SPOTS.gandalf);
          this.stage(SPOTS.holdHall, [0, 1.3, 0.8]);
        },
      },
      {
        title: 'Füstkarikák',
        text: 'Rágyújt a pipájára, és füstkarikákat ereget: az egyik nagy karikán egy kisebb bújik át, aztán mindkettő kiszáll az ajtón.',
        enter: () => this.smoke(), // NOTES-19-ui: drawn
      },
      { title: 'Ajándék', text: this.gandalfGiftText() },
      { title: 'Tanács', text: `Mielőtt indul, tanácsot ad: ${this.hint()}` },
    ];
    if (mark) steps.push({ title: 'A jel az ajtón', text: 'Távozóban a botja hegyével egy furcsa jelet karcol a kerek zöld ajtóra. Holnap este vendégek jöhetnek…' });
    else steps.push({ title: 'Búcsú', text: 'Gandalf megbiccenti a kalapját, és már ott sincs. Ki tudja, mikor jön legközelebb?', dur: 4 });
    steps.mark = mark;
    return steps;
  }

  /** NOTES-19-ui: the smoke rings from Gandalf's mouth (his figure's local head height), the view lifted to follow. */
  smoke() {
    const m = this.figs?.gandalf;
    if (!m || !this.rings) return;
    const yaw = m.rotation.y;
    v1.set(m.position.x + Math.sin(yaw) * 0.14, m.position.y + 1.57, m.position.z + Math.cos(yaw) * 0.14);
    this.rings.start(v1, yaw);
    this.stage(SPOTS.holdHall, [m.position.x, 1.85, m.position.z + 0.3]);
  }

  gandalfGiftText() {
    const home = this.game.players.filter((p, i) => this.free(p, i));
    const room = home.some((p) => (p.rockets || 0) < ROCKET_MAX);
    return room
      ? `Az ajándék: egy tűzijáték-rakéta a híres tűzijátékaiból (${home.length > 1 ? 'mindkettőtöknek' : 'neked'}). Ha bajban vagy a gödörben, egy rakéta kirepít.`
      : 'Rakétát hozott volna, de már tele a zsebed velük. Helyette tanácsot ad.';
  }

  /** The hint for the deepest layer anybody reached. */
  hint() {
    const deep = Math.max(0, ...this.game.players.map((p) => p.maxDepth || 0));
    return HINTS[clamp(layerAtDepth(deep), 0, HINTS.length - 1)];
  }

  gandalfDone(S) {
    const day = this.today();
    const g = this.gandalf;
    g.last = day;
    g.n++;
    if (S.steps.mark) g.mark = day;
    this.syncMark();
    this.lastDay = day;
    let n = 0;
    for (const p of S.viewers) {
      if ((p.rockets || 0) < ROCKET_MAX) {
        p.rockets = (p.rockets || 0) + 1;
        n++;
      }
    }
    const msg = n ? 'Gandalf rakétát hagyott nálad: a gödörben a kijutás gombjával gyújthatod meg.' : 'Gandalf továbbállt.';
    for (const p of S.viewers) p.say(S.skipped ? `Gandalf járt itt. ${msg}` : msg, 4);
  }

  partySteps() {
    const f = this.figs;
    const show = (n) => {
      f.dwarves.geometry.setDrawRange(0, f.counts[n]);
      f.dwarves.visible = n > 0;
    };
    const look = [0, 0.8, 1.9];
    return [
      { title: 'Váratlan vendégek', text: 'Csengetnek! Az ajtóban egy kék szakállú, sötétzöld csuklyás törpe áll: „Dwalin, szolgálatodra!” [ellenőrizendő]', enter: () => { show(1); this.stage(SPOTS.holdParty, look); } },
      { title: 'Váratlan vendégek', text: 'Aztán Balin, skarlátvörös csuklyában, majd Fíli és Kíli, kék csuklyában.', enter: () => show(4) },
      { title: 'Váratlan vendégek', text: 'Dori, Nori, Ori, Óin és Glóin, aztán Bifur, Bofur és Bombur: az előszoba megtelik csuklyákkal és köpenyekkel.', enter: () => show(12) },
      {
        title: 'Thorin és Gandalf',
        text: 'Végül a botjával kopogtat Gandalf, mögötte Thorin Tölgypajzs, égszínkék csuklyában, hosszú ezüstbojttal.',
        enter: () => {
          show(13);
          this.place(f.gandalf, SPOTS.gandalfParty);
        },
      },
      { title: 'A kamra', text: 'A törpék megeszik, ami a kamrában van: magkalácsot, málnalekvárt, almás pitét, sertéspástétomot, sajtot. Mára üres a kamra.' },
      { title: 'Ki marad?', text: this.partyStayText() },
      { title: 'Mosogatás', text: 'Aztán elmosogatnak, és repülnek a tányérok! Kapd el őket, hogy anyád porcelánja ép maradjon.', dur: 4.5 },
    ];
  }

  /** How many dwarves stay to dig (the hall pegs, bagEnd.effects.extraDwarves) and for how long. */
  partyStay() {
    const pegs = this.game.bagEnd?.tiers?.fogasok || 0;
    const stay = HOME.party.stay[pegs] || HOME.party.stay[0];
    const days = HOME.party.days + HOME.party.perPeg * pegs;
    return { pegs, stay, days };
  }

  partyStayText() {
    const { pegs, stay, days } = this.partyStay();
    const where = pegs ? 'Ahány fogas, annyi csuklya: ' : 'Kevés a fogas, a legtöbb csuklya a földre kerül: ';
    return `${where}${stay} törpe marad, és ${days === 1 ? 'holnapig' : `${days.toString().replace('.', ',')} napig`} ingyen ás veletek (gyorsabb ásás).`;
  }

  partyDone(S) {
    const day = this.today();
    const { stay, days } = this.partyStay();
    this.party.day = day;
    this.party.stay = stay;
    this.party.until = this.clock() + days * DAY.length;
    this.lastDay = day;
    for (const p of S.viewers) p.say(`${stay} törpe marad, és veletek ás. A kamra mára üres.`, 4.5);
    // The plate throwing (minigames/plates.js listens; it starts for the players at home). Hook for NOTES-13-minigames.
    this.game.events?.emit?.('unexpected-party', { stay, skipped: S.skipped });
  }

  birthdaySteps() {
    const look = null;
    return [
      { title: 'Szeptember 22.', text: 'Ma van Zsákos Bilbó születésnapja! A Megyében ilyenkor az ünnepelt ad ajándékot a vendégeinek.', enter: () => this.stage(null, look) },
      {
        title: 'Ajándékok',
        text: (p) => this.giftText(p),
        choose: true, // NOTES-19-ui
        dur: HOME.birthday.chooseT,
        enter: () => this.giftStart(),
      },
      { title: 'Ünnepi lakoma', text: () => `Aztán közös lakoma: mindenki jóllakik. Holnapig jobb áron veszik a leleteidet (hírnév: +${Math.round((this.giftMult() - 1) * 100)} %).` },
    ];
  }

  /* NOTES-19-ui: the birthday gift choice (TERV 0.11/13). A mathom is a find of no special use: not famous, not kept. */

  /** The mathoms a player can give: the cheapest distinct kinds in his bag (HOME.birthday.giftChoices), then "none". */
  giftOptions(p) {
    const seen = new Set();
    const opts = [];
    for (const t of [...(p.bag || [])].sort((a, b) => (a.value || 0) - (b.value || 0))) {
      if (!t || t.famous || t.keep || seen.has(t.id)) continue;
      if (!isMathom(t)) continue; // shire (NOTES-26-shire): only the mathom kinds (shire/mathoms.js MATHOM_IDS) are given
      seen.add(t.id);
      opts.push(t);
      if (opts.length >= HOME.birthday.giftChoices) break;
    }
    if (opts.length) opts.push(null); // null: none of my own, the house's mathoms go
    return opts;
  }

  giftStart() {
    const S = this.scene;
    S.gift = new Map();
    for (const p of S.viewers) {
      const opts = this.giftOptions(p);
      S.gift.set(p, { opts, sel: 0, done: !opts.length, gave: null });
    }
  }

  /** Gives the chosen mathom: out of the bag; the fame grows in birthdayDone. */
  giveGift(p, c) {
    const t = c.opts[c.sel];
    c.done = true;
    if (!t) return;
    const i = p.bag.indexOf(t);
    if (i >= 0) p.bag.splice(i, 1);
    c.gave = t;
  }

  /** Mathoms given in this scene. */
  giftCount() {
    let n = 0;
    for (const c of this.scene?.gift?.values() || []) if (c.gave) n++;
    return n;
  }

  /** The fame multiplier this birthday gives (the plain fame plus each mathom given). */
  giftMult(n = this.giftCount()) {
    return HOME.birthday.fame + HOME.birthday.giftFame * n;
  }

  giftText(p) {
    const c = this.scene?.gift?.get(p);
    const intro = 'A szomszédok sorra bekopognak. A Megye szokása szerint az ünnepelt ad ajándékot: ';
    if (!c || !c.opts.length) return `${intro}a zsákodban nincs mathom, így a ház mathomjai, egy üveg lekvár és egy zsebkendő mennek ajándékba.`;
    if (c.done) {
      return c.gave
        ? `Odaadtad: <b>${c.gave.name}</b>. A szomszéd boldogan viszi haza, és egész Hobbitfalva rólad beszél (hírnév).`
        : 'A ház mathomjait adod: egy üveg lekvárt és egy zsebkendőt. A tieid a zsákodban maradnak.';
    }
    const t = c.opts[c.sel];
    const pick = t ? `<b>${t.name}</b> <small>(${t.value} arany)</small>` : '<b>egyiket sem</b> <small>(a ház mathomjai mennek)</small>';
    const dots = c.opts.map((o, k) => (k === c.sel ? '●' : '○')).join(' ');
    return `${intro}melyik mathomot adod oda a zsákodból?<div style="margin-top:0.3em;font-size:1.1em">‹ ${pick} ›</div><div style="font-size:0.75em;opacity:0.7">${dots}</div>`
      + `<div style="font-size:0.85em;font-style:italic">Minden odaadott mathom hírnevet hoz: holnapig +${Math.round(HOME.birthday.giftFame * 100)} % a leletek árára.</div>`;
  }

  birthdayDone(S) {
    const day = this.today();
    this.birthday.year = day;
    this.birthday.n++;
    this.birthday.fameUntil = this.clock() + DAY.length;
    const gifts = [...(S.gift?.values() || [])].filter((c) => c.gave).length; // NOTES-19-ui
    this.birthday.mult = this.giftMult(gifts);
    this.birthday.gifts += gifts;
    this.game.shire?.onBirthday(gifts); // shire (NOTES-26-shire): the feast and each mathom given raise the reputation
    this.lastDay = day;
    const fx = this.game.bagEnd?.effects;
    for (const p of S.viewers) {
      p.hunger = Math.max(p.hunger || 0, fx?.hungerMax ?? 100);
      p.say('Boldog születésnapot! Tele a tányér, és egy napig jobb áron adhatsz el.', 4.5);
    }
  }

  lobeliaSteps() {
    const f = this.figs;
    const keys = (p) => {
      const i = this.game.players.indexOf(p);
      const shared = this.game.bindings?.some((b) => b.kbm === 'keys2');
      return glyphs(deviceOf(this.game.bindings?.[i]), shared);
    };
    return [
      { title: 'Látogató', text: 'Csengetnek. Kiskötő-Zsákos Lobelia az: csak egy percre jött, mondja.', dur: 5, enter: () => { this.place(f.lobelia, SPOTS.lobelia); this.stage(SPOTS.holdDining, [-3.05, 0.7, 2.75]); } },
      { title: 'Irigység', text: 'Irigykedve körbenéz: a porcelán, a szőnyegek, a tálaló… és rajta az ezüstkanalak.', dur: 5 },
      {
        title: 'Az ezüstkanál!',
        text: (p) => `Lobelia a tálalóhoz oson, és egy ezüstkanalat csúsztat a táskájába! Kapd rajta: ${keys(p).confirm}`,
        catch: true,
        dur: HOME.lobelia.catchT,
        enter: () => this.place(f.lobelia, SPOTS.lobeliaSteal),
      },
      {
        title: 'Lobelia',
        text: () => (this.scene?.caught
          ? 'Rajtakaptad! Lobelia elvörösödik, visszaadja a kanalat, és egy másikat is, amit még a kertben szedett fel. Aztán sértődötten elviharzik.'
          : 'Lobelia a kanállal a táskájában elviharzik. Szerencsére a többi ezüstkanál megmaradt.'),
        dur: 5,
        enter: () => this.place(f.lobelia, SPOTS.lobelia),
      },
    ];
  }

  lobeliaDone(S) {
    const day = this.today();
    const L = this.lobelia;
    L.last = day;
    L.n++;
    this.lastDay = day;
    if (!S.caught) return;
    L.caught = true;
    const p = S.catcher || [...S.viewers][0];
    const spoon = FIND_TYPES.find((t) => t.id === 'kanal');
    if (p && spoon && p.bag.length < (p.bagCap || 0)) {
      p.bag.push(spoon);
      p.say('Egy ezüstkanál került a zsákodba: Lobeliáé volt… vagy inkább a tiéd.', 4);
    } else if (spoon) {
      this.game.money += spoon.value;
      p?.say(`Tele a zsák: a kanál árát (${spoon.value} arany) a közös erszénybe tetted.`, 4);
    }
  }

  /* ---------------- the captions ---------------- */

  uiFor(i, p) {
    const el = this.game.huds[i]?.el;
    if (!el) return null;
    let u = this.ui.get(p);
    if (u && u.root === el) return u;
    u?.cap.remove();
    u = { root: el, cap: document.createElement('div'), html: null };
    u.cap.className = 'home-event-caption';
    Object.assign(u.cap.style, {
      position: 'absolute', left: '50%', bottom: '11%', transform: 'translateX(-50%)', width: 'min(90%, 34em)', padding: '0.55em 1.2em 0.5em',
      textAlign: 'center', fontSize: '1.02em', lineHeight: '1.35', color: 'var(--ink-dark, #3a2614)', fontFamily: 'var(--f-text, Georgia, serif)',
      background: 'var(--tx-parch) center / cover, #e8d6ac', borderRadius: '0.25em', boxShadow: '0 0.3em 1.2em #000d, inset 0 0 2.5em #7a5a2a55',
      pointerEvents: 'none', zIndex: '8', display: 'none',
    });
    el.append(u.cap);
    this.ui.set(p, u);
    return u;
  }

  /** Writes each viewer's caption when it changed (`clear`: hide all). */
  drawUi(clear = false) {
    const g = this.game;
    const S = this.scene;
    const shared = g.bindings?.some((b) => b.kbm === 'keys2');
    g.players.forEach((p, i) => {
      let html = '';
      if (!clear && S && S.viewers.has(p)) {
        const st = S.steps[S.k];
        if (st) {
          const text = typeof st.text === 'function' ? st.text(p) : st.text;
          const k = glyphs(deviceOf(g.bindings?.[i]), shared);
          const choosing = st.choose && S.gift?.get(p) && !S.gift.get(p).done; // NOTES-19-ui
          const left = st.catch || choosing ? ` · ${Math.max(0, Math.ceil((st.dur || HOME.step) - S.t))} mp` : '';
          html = `<div style="font-family:var(--f-title, Georgia, serif);font-size:1.25em;color:#5a2a0a;margin-bottom:0.15em">${st.title}${left}</div>${text}`
            + `<div style="margin-top:0.35em;font-size:0.78em;opacity:0.75">${choosing ? `${k.browse} választás · ${k.confirm} odaadom` : `${k.confirm} tovább`} · ${k.back} kihagyás</div>`;
        }
      }
      const u = html || this.ui.has(p) ? this.uiFor(i, p) : null;
      if (!u || html === u.html) return;
      u.html = html;
      u.cap.innerHTML = html;
      u.cap.style.display = html ? 'block' : 'none';
    });
  }

  /* ---------------- save ---------------- */

  /** { g: { l, n, m }, p: { d, s, u }, b: { y, f, n, m: fame multiplier, g: mathoms given }, l: { l, n, c }, d } with empty parts left out; undefined if nothing. */
  state() {
    const out = {};
    const G = this.gandalf;
    if (G.n) out.g = { l: G.last, n: G.n, ...(G.mark != null ? { m: G.mark } : {}) };
    const P = this.party;
    if (P.day != null) out.p = { d: P.day, s: P.stay, u: Math.round(P.until) };
    const B = this.birthday;
    if (B.year != null) out.b = { y: B.year, f: Math.round(B.fameUntil), n: B.n, ...(B.mult ? { m: B.mult } : {}), ...(B.gifts ? { g: B.gifts } : {}) };
    const L = this.lobelia;
    if (L.n) out.l = { l: L.last, n: L.n, ...(L.caught ? { c: 1 } : {}) };
    if (this.lastDay != null) out.d = this.lastDay;
    return Object.keys(out).length ? out : undefined;
  }

  restore(s) {
    this.resetState();
    if (!s || typeof s !== 'object') return;
    const num = (v) => (Number.isFinite(v) ? v : null);
    if (s.g) this.gandalf = { last: num(s.g.l), n: s.g.n | 0, mark: num(s.g.m) };
    if (s.p) this.party = { day: num(s.p.d), stay: s.p.s | 0, until: +s.p.u || 0 };
    if (s.b) this.birthday = { year: num(s.b.y), fameUntil: +s.b.f || 0, n: s.b.n | 0, mult: +s.b.m || 0, gifts: s.b.g | 0 };
    if (s.l) this.lobelia = { last: num(s.l.l), n: s.l.n | 0, caught: !!s.l.c };
    this.lastDay = num(s.d);
    this.syncMark();
  }
}

/** For QA / notes: the arrival order's names. */
export const ARRIVALS = DWARF_ARRIVALS.map((d) => d.name);
