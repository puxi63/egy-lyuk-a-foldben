/* ==== hirelings/index.js — hired dwarves working the explored upper layers (TODO item 33, NOTES-42-hirelings) ====
 * Seven of Thorin's company (rules.js DWARVES: Óin, Glóin, Ori, Dwalin, Nori, Bifur, Fíli — the non-playable ones
 * other than Dori) can be hired at the Green Dragon's counter (a row next to Dori's, modes/index.js shopRows) into this
 * module's own parchment menu: each dwarf, his job, his wage, his state, hire / dismiss.
 * - Simulated in the background, by the seven meals (shire/meals.js MEAL_WINDOWS): every meal window that opens is one
 *   shift. Each hired dwarf first has his day's wage (paid in advance: on hiring, then at the first shift of each game
 *   day), then eats (HIRE.meal gold, nothing while Bag End's pantry is stocked), then works one shift. If the purse
 *   cannot pay, he does not work (no debt) and says so once a day. At night (22:30–06:30) nobody works.
 * - Jobs, only in the layers someone has reached and never below MAX_LAYER (layers I–III, 0–150 m):
 *   Óin, Glóin: lanterns along the players' dug tunnels (lanterns.js); Ori: maps the explored part of a layer onto
 *   Thrór's map over days (ui/map.js oriSvg); Dwalin, Nori, Bifur: glean the small finds left in the explored layers
 *   (finds.js items really taken, so the income shrinks as the layer empties); Fíli: the stairwell (stairs.js).
 * - The first shift of each day starts with the morning report: one line to every player (what they did, what it cost).
 * - Costs nothing per frame beyond a timer: the shift check every 0.25 s, the lantern check every 0.5 s, the survey's
 *   time-sliced fill (≈1 ms a frame, only after a shift). Drawn: at most 3 draw calls (lanterns, treads, figures), each
 *   only in a view whose chunks hold them.
 * Owned by the Shire (shire/index.js: constructed, input / update / state / restore; saved as the optional `h` of the
 * Shire's save part: absent = nobody hired, nothing built). Off on bench pages (`shire.force` for QA); `?hire=1` on a
 * bench page hangs lanterns along the dug tunnels and stands three figures (the GPU bench), `?hire=2` also starts the
 * bench players beside two lanterns underground. Off in Versengés. ==== */
import { COOP } from '../config.js';
import { LAYER_TOPS, layerAtDepth } from '../materials.js';
import { SHOP_POS } from '../props.js';
import { CULL_HOOKS } from '../underground/decor.js';
import { deviceOf, glyphs } from '../ui/glyphs.js';
import { raycast, sampleDensity } from '../world.js';
import { Figures } from './figures.js';
import { Lanterns } from './lanterns.js';
import { BY_ID, DWARVES, GLEAN, HIRE, LANTERN, LIMIT_DEPTH, MAX_LAYER, ORI, STAIR } from './rules.js';
import { Stairs } from './stairs.js';
import { Survey } from './survey.js';
import { CSS, hoodSVG, menuHtml, rowArt } from './ui.js';

export { DWARVES, MAX_LAYER, LIMIT_DEPTH };

const ROMAN = ['I', 'II', 'III'];
const GOLD = 'color:#7a4a10';
const DOWN = { x: 0, y: -1, z: 0 };
const SURVEY_MS = 1.0;

const blankAcc = () => ({ wage: 0, meal: 0, pantry: 0, gold: 0, per: {} });

export class Hirelings {
  constructor(shire) {
    this.shire = shire;
    this.game = shire.game;
    /** id → { paid: game day the wage is paid for, stopDay, why: '' | 'wage' | 'meal' | 'idle:<reason>' } */
    this.hired = new Map();
    this.lastKey = null; // the last meal window worked off
    this.acc = blankAcc(); // since the last morning report
    this.report = null; // { day, text }: the last morning report
    this.ori = [0, 0, 0]; // Ori's progress per layer (0..1)
    this.survey = new Survey();
    this.lanterns = new Lanterns(this.game);
    this.stairs = new Stairs(this.game, shire.mat);
    this.figures = new Figures(this.game, shire.mat);
    this.menu = new Map(); // player → { sel }
    this.ui = new Map();
    this.slowT = 0;
    this.hinted = new Set();
    this.small = null; // per layer: the small finds (gleaning), built lazily
    const q = this.game.params?.get?.('hire');
    /** Bench pages: `?hire=1` hangs lanterns along the dug tunnels and stands figures (visual only, the GPU bench). */
    this.benchShow = !!this.game.bench && q != null && q !== '' && q !== '0';
    this.benchDone = false;
    CULL_HOOKS.push((visible) => this.cullFor(visible));
  }

  get enabled() {
    return this.shire.enabled && !this.game.modes?.versus;
  }

  /* ---------------- rules ---------------- */

  coop() {
    return this.game.players.length > 1;
  }

  /** A dwarf's wage for one game day (×COOP.price with two players, as the counter's prices). */
  wageOf(d) {
    return Math.round(d.wage * (this.coop() ? COOP.price : 1));
  }

  /** One dwarf's meal: free while Bag End's pantry is stocked; ×Kihívás food, ×co-op price. */
  mealCost() {
    if (this.game.bagEnd?.effects?.freeFoodAtHome) return 0;
    const food = this.game.modes?.econ?.food ?? 1;
    return Math.max(1, Math.round(HIRE.meal * food * (this.coop() ? COOP.price : 1)));
  }

  deepest() {
    const g = this.game;
    return g.journal?.deepest?.() ?? Math.max(0, ...g.players.map((p) => p.maxDepth || 0));
  }

  /** A layer they may work in: reached by someone, and not below MAX_LAYER. */
  layerOk(l) {
    return l >= 0 && l <= MAX_LAYER && (l === 0 || this.deepest() >= LAYER_TOPS[l]);
  }

  today() {
    return this.game.dayClock?.day?.() ?? 1;
  }

  /** Walking speed × for player p (shire/meals.js p.mealK): Fíli's stair. */
  walkMult(p) {
    return this.enabled && this.stairs.onStair(p) ? STAIR.walk : 1;
  }

  sayAll(text, s = 5) {
    for (const p of this.game.players) if (!p.choosing) p.say(text, s);
  }

  per(id) {
    return (this.acc.per[id] ||= { shifts: 0, lanterns: 0, map: 0, finds: 0, gold: 0, stair: 0, unpaid: 0, idle: '' });
  }

  /* ---------------- hiring ---------------- */

  hire(d, p) {
    if (this.hired.has(d.id)) return false;
    const g = this.game;
    const cost = this.wageOf(d);
    if (g.money < cost) {
      p?.say(`${d.name} felfogadásához ma ${cost} arany kell (a napi bér), a közös erszényben ${g.money} van.`, 4);
      return false;
    }
    g.money -= cost;
    this.acc.wage += cost;
    const h = { paid: this.today(), stopDay: -1, why: '' };
    this.hired.set(d.id, h);
    p?.say(`${d.name}: „${d.hire}”`, 6);
    if (this.lastKey == null) this.lastKey = this.shire.meals.now().ref;
    // The first shift at once (he has eaten before he came), if it is not night.
    if (this.shire.meals.now().key >= 0) {
      if (!this.survey.ready) this.survey.runNow();
      this.work(d, h);
      this.survey.start();
    } else p?.say(`${d.name} reggel kezd.`, 3);
    g.saveNow?.();
    return true;
  }

  dismiss(d, p) {
    if (!this.hired.delete(d.id)) return false;
    this.figures.drop(d.id);
    p?.say(d.bye, 4);
    this.game.saveNow?.();
    return true;
  }

  /* ---------------- shifts ---------------- */

  /** Every 0.25 s: works off the meal windows opened since the last one. */
  tickShifts() {
    const w = this.shire.meals.now();
    if (w.key < 0) return; // night
    if (this.lastKey == null || w.key < this.lastKey) {
      this.lastKey = w.key;
      return;
    }
    if (w.key === this.lastKey) return;
    const from = Math.max(this.lastKey + 1, w.key - HIRE.maxCatchUp + 1);
    for (let k = from; k <= w.key; k++) this.shift(k);
    this.lastKey = w.key;
    if (this.hired.size) this.game.saveNow?.();
  }

  /** One meal window (key = day × 7 + index). */
  shift(k) {
    const day = Math.floor(k / HIRE.shifts);
    if (k % HIRE.shifts === 0) this.morning(day);
    if (!this.hired.size) return;
    if (!this.survey.ready && this.game.terrain?.loaded !== false) this.survey.runNow();
    for (const d of DWARVES) {
      const h = this.hired.get(d.id);
      if (!h) continue;
      if (h.paid < day && !this.pay(d, h, day, this.wageOf(d), 'wage')) continue;
      const meal = this.mealCost();
      if (meal === 0) this.acc.pantry++;
      else if (!this.pay(d, h, day, meal, 'meal')) continue;
      this.work(d, h);
    }
    this.survey.start(); // fresh for the next shift
  }

  /** Pays `cost` from the purse for dwarf d (the wage, or a meal); false (and one line a day) when it cannot. */
  pay(d, h, day, cost, what) {
    const g = this.game;
    if (g.money < cost) {
      this.per(d.id).unpaid++;
      h.why = what;
      if (h.stopDay !== day) {
        h.stopDay = day;
        this.sayAll(`${d.name} nem dolgozik: ${what === 'wage' ? `nincs meg a napi bére (${cost} arany)` : `nincs pénz az ételére (${cost} arany)`} a közös erszényben.`, 5);
      }
      return false;
    }
    g.money -= cost;
    if (what === 'wage') {
      h.paid = day;
      this.acc.wage += cost;
    } else this.acc.meal += cost;
    if (h.why === 'wage' || h.why === 'meal') h.why = '';
    return true;
  }

  /** One shift of dwarf d's job. */
  work(d, h) {
    const a = this.per(d.id);
    a.shifts++;
    h.why = '';
    if (d.job === 'lamp') this.workLamp(d, h, a);
    else if (d.job === 'map') this.workMap(d, h, a);
    else if (d.job === 'glean') this.workGlean(d, h, a);
    else if (d.job === 'stair') this.workStair(d, h, a);
  }

  workLamp(d, h, a) {
    const hung = this.lanterns.place(this.survey.cand, LANTERN.perShift, (l) => this.layerOk(l));
    a.lanterns += hung.length;
    if (!hung.length) {
      h.why = this.lanterns.list.length >= LANTERN.max ? 'idle:minden lámpás ég' : 'idle:nincs több kiásott, sötét járat';
      a.idle = h.why;
      return;
    }
    // He stands beside his newest lantern, facing it.
    const l = hung[hung.length - 1];
    const ox = Math.sin(l.yaw);
    const oz = Math.cos(l.yaw);
    const side = d.id === 'oin' ? 1 : -1;
    this.stand(d.id, l.x + ox * 0.3 + oz * 0.75 * side, l.y - LANTERN.height, l.z + oz * 0.3 - ox * 0.75 * side, l.yaw + Math.PI);
  }

  workMap(d, h, a) {
    let l = -1;
    for (let k = 0; k <= MAX_LAYER; k++) if (this.layerOk(k) && this.ori[k] < 1) { l = k; break; }
    if (l < 0) {
      h.why = 'idle:minden feltárt rétege lerajzolva';
      a.idle = h.why;
      return;
    }
    const before = this.ori[l];
    const next = before + 1 / (HIRE.shifts * ORI.days[l]);
    this.ori[l] = next > 1 - 1e-6 ? 1 : next; // (the sum of the shifts' parts may fall a hair short of 1)
    a.map += this.ori[l] - before;
    a.mapL = l;
    if (this.ori[l] >= 1 && before < 1) this.sayAll(`Ori elkészült: a ${ROMAN[l]}. réteg feltárt részei Thrór térképén (B / Ú / bal kar).`, 5);
    this.standOnFloor(d.id, l);
  }

  /** The small finds per layer (built once; finds.js items, so taking one really takes it). */
  smallFinds() {
    if (this.small) return this.small;
    const items = this.game.finds?.items || [];
    this.small = Array.from({ length: MAX_LAYER + 1 }, () => []);
    for (const it of items) {
      const t = it.type;
      if (t.famous || t.keep || t.hoard || !(t.value > 0) || t.value > GLEAN.small) continue;
      const l = layerAtDepth(Math.max(0, -it.y));
      if (l <= MAX_LAYER) this.small[l].push(it);
    }
    return this.small;
  }

  /** The share (0..1) of a layer's small finds still in the soil. */
  leftShare(l) {
    const list = this.smallFinds()[l] || [];
    if (!list.length) return 0;
    return list.filter((it) => !it.taken).length / list.length;
  }

  workGlean(d, h, a) {
    const g = this.game;
    let l = -1;
    let best = 0;
    for (let k = 0; k <= MAX_LAYER; k++) {
      if (!this.layerOk(k)) continue;
      const s = this.leftShare(k);
      if (s > best + 1e-9) {
        best = s;
        l = k;
      }
    }
    if (l < 0) {
      h.why = 'idle:nem maradt apró lelet a feltárt rétegekben';
      a.idle = h.why;
      return;
    }
    a.glL = l;
    this.standOnFloor(d.id, l);
    if (Math.random() >= GLEAN.chance * best) return;
    const clear2 = GLEAN.playerClear * GLEAN.playerClear;
    const left = this.smallFinds()[l].filter((it) => !it.taken && g.players.every((p) => (p.pos.x - it.x) ** 2 + (p.pos.y - it.y) ** 2 + (p.pos.z - it.z) ** 2 > clear2));
    if (!left.length) return;
    const it = left[Math.floor(Math.random() * left.length)];
    it.taken = true;
    const gold = this.sale(it);
    g.money += gold;
    g.sold = (g.sold || 0) + gold;
    a.finds++;
    a.gold += gold;
    this.acc.gold += gold;
  }

  /** What a find brings to the purse: GLEAN.share of its value (×Kihívás sale, ×co-op sale). */
  sale(it) {
    const sell = this.game.modes?.econ?.sell ?? 1;
    return Math.max(1, Math.round(it.type.value * GLEAN.share * sell * (this.coop() ? COOP.sell : 1)));
  }

  workStair(d, h, a) {
    const r = this.stairs.build(this.deepest());
    a.stair += r.m;
    for (const it of r.finds) {
      const gold = this.sale(it);
      this.game.money += gold;
      a.finds++;
      a.gold += gold;
      this.acc.gold += gold;
    }
    if (r.blocked === 'ladder') h.why = 'idle:egy létrátok áll a lépcső útjában, ahhoz nem nyúl';
    else if (r.blocked === 'deep' && !r.m) h.why = `idle:a lépcső elérte a feltárt mélységet (${Math.round(this.stairs.depth)} m)`;
    else if (r.blocked === 'player' && !r.m) h.why = 'idle:valaki a lépcső helyén állt, megvárta';
    if (h.why) a.idle = h.why;
    if (this.stairs.built > 0) {
      const c = this.stairs.at(Math.max(0, this.stairs.built - 1.2));
      this.stand(d.id, c.x, c.y, c.z, -c.a + Math.PI);
    }
  }

  /** Puts a figure at (x, floor y, z) facing yaw, if the spot is open and has a floor (else none). */
  stand(id, x, y, z, yaw) {
    const t = raycast({ x, y: y + 1.0, z }, DOWN, 1.8);
    if (t < 0 || sampleDensity(x, y + 0.9, z) > 0 || this.game.players.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 1.2 && Math.abs(p.pos.y - y) < 2)) {
      this.figures.drop(id);
      return;
    }
    this.figures.set(id, { x: +x.toFixed(2), y: +(y + 1.0 - t).toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(2) });
  }

  standOnFloor(id, l) {
    const f = this.survey.floors[l];
    if (!f || !f.length) {
      this.figures.drop(id);
      return;
    }
    const k = Math.floor(Math.random() * (f.length / 3)) * 3;
    this.stand(id, f[k], f[k + 1], f[k + 2], Math.random() * Math.PI * 2);
  }

  /* ---------------- the morning report ---------------- */

  morning(day) {
    const a = this.acc;
    const text = this.reportText(a);
    this.acc = blankAcc();
    if (!text) return;
    this.report = { day, text };
    this.sayAll(text, 10);
  }

  /** The report line of the accumulated work and costs ('' when nothing happened). */
  reportText(a) {
    const parts = [];
    const ids = (job) => DWARVES.filter((d) => d.job === job && a.per[d.id]?.shifts);
    const names = (list) => list.map((d) => d.name).join(' és ');
    const lamp = ids('lamp');
    const lanterns = lamp.reduce((s, d) => s + a.per[d.id].lanterns, 0);
    if (lamp.length) parts.push(lanterns ? `${names(lamp)} ${lanterns} lámpást akasztott ki (most ${this.lanterns.list.length} ég)` : `${names(lamp)}: nem talált több sötét járatot`);
    const ori = a.per.ori;
    if (ori?.shifts) parts.push(ori.map > 0 ? `Ori a ${ROMAN[ori.mapL ?? 0]}. réteg térképén dolgozott (${Math.round(this.ori[ori.mapL ?? 0] * 100)} % kész)` : 'Ori: minden feltárt réteg lerajzolva');
    const gl = ids('glean');
    if (gl.length) {
      const n = gl.reduce((s, d) => s + a.per[d.id].finds, 0);
      const gold = gl.reduce((s, d) => s + a.per[d.id].gold, 0);
      parts.push(n ? `${names(gl)} ${n} apró leletet szedett (+${gold} arany)` : `${names(gl)}: nem akadt apró lelet`);
    }
    const fi = a.per.fili;
    if (fi?.shifts) parts.push(fi.stair > 0 ? `Fíli ${String(Math.round(fi.stair * 10) / 10).replace('.', ',')} m lépcsőt vágott (${Math.round(this.stairs.depth)} m mélyig ér)${fi.finds ? `, a falban ${fi.finds} leletet talált (+${fi.gold} arany)` : ''}` : 'Fíli nem haladt a lépcsővel');
    const unpaid = DWARVES.filter((d) => a.per[d.id]?.unpaid).map((d) => d.name);
    if (!parts.length && !unpaid.length && !a.wage && !a.meal) return '';
    const cost = a.wage + a.meal;
    const food = a.meal ? `, étel ${a.meal}` : a.pantry ? ', étel a kamrából' : '';
    let text = `Reggeli jelentés: ${parts.length ? parts.join(' · ') : 'senki sem dolgozott'}. Költség: ${cost} arany (bér ${a.wage}${food}).`;
    if (unpaid.length) text += ` Üres erszény miatt nem dolgozott: ${unpaid.join(', ')}.`;
    return text;
  }

  /* ---------------- the counter row and the menu ---------------- */

  /** The Green Dragon counter's row (modes/index.js shopRows): opens the menu. */
  shopRows(p) {
    if (!this.enabled) return [];
    const wages = DWARVES.map((d) => this.wageOf(d));
    const n = this.hired.size;
    return [{
      kind: 'hirelings', art: rowArt(), label: `Törpék Thorin társaságából: munkára fogadás${n ? ` (${n} dolgozik)` : ''} ▸`, price: 0,
      priceLabel: `${Math.min(...wages)}–${Math.max(...wages)} arany/nap`, ok: true,
      act: () => {
        const i = this.game.players.indexOf(p);
        const hud = this.game.huds?.[i];
        if (hud) hud.shopOpen = false;
        this.menu.set(p, { sel: 0 });
      },
    }];
  }

  nearCounter(p) {
    return !p.choosing && p.dead <= 0 && p.pos.distanceTo(SHOP_POS) < HIRE.reach;
  }

  rows() {
    return [...DWARVES.map((d) => ({ d })), { close: true }];
  }

  /** Per player in the Shire's chain: the menu (held). True = this player is held. */
  input(p, i, it) {
    const m = this.menu.get(p);
    if (!m) return false;
    if (!this.enabled || it.backPressed || it.interactPressed || !this.nearCounter(p)) {
      this.menu.delete(p);
      return true;
    }
    const rows = this.rows();
    if (it.upPressed) m.sel = (m.sel + rows.length - 1) % rows.length;
    if (it.downPressed) m.sel = (m.sel + 1) % rows.length;
    if (it.confirmPressed || it.digPressed) {
      const r = rows[m.sel];
      if (r.close) this.menu.delete(p);
      else if (this.hired.has(r.d.id)) this.dismiss(r.d, p);
      else this.hire(r.d, p);
    }
    return true;
  }

  /** A dwarf's state for the menu: { key: 'free' | 'work' | 'unpaid' | 'idle', text }. */
  stateOf(d) {
    const h = this.hired.get(d.id);
    if (!h) return { key: 'free', text: 'szabad' };
    if (h.why === 'wage' || h.why === 'meal') return { key: 'unpaid', text: 'nem dolgozik: üres az erszény' };
    if (h.why.startsWith('idle:')) return { key: 'idle', text: `nincs munka: ${h.why.slice(5)}` };
    return { key: 'work', text: 'dolgozik' };
  }

  /** The job's details for the menu (numbers of the current game). */
  jobText(d) {
    const pct = (v) => `${Math.round(v * 100)} %`;
    const lay = (f) => ROMAN.map((r, l) => `${r}. ${this.layerOk(l) ? f(l) : '—'}`).join(', ');
    if (d.job === 'lamp') return `Lámpásokat akaszt a kiásott járataitok falára, a felszínhez legközelebbiektől lefelé, legalább ${String(LANTERN.spacing).replace('.', ',')} m-enként, műszakonként ${LANTERN.perShift}-t. Most ${this.lanterns.list.length} lámpás ég (legfeljebb ${LANTERN.max}).`;
    if (d.job === 'map') return `Thrór térképére rajzolja egy réteg feltárt részét (ahol ástatok, és ahová betörtetek), rétegenként ${ORI.days.join(' / ')} nap alatt. Olcsóbb és lassabb, mint Balin térképe, és csak azt mutatja, ahol már jártatok. Kész: ${lay((l) => pct(this.ori[l]))}.`;
    if (d.job === 'glean') return `Összeszedi a feltárt rétegekben maradt apró leleteket (legfeljebb ${GLEAN.small} arany értékűeket), és eladja: az áruk ${pct(GLEAN.share)}-a a közös erszénybe kerül. Ahogy fogynak, egyre kevesebbet hoz. Még a földben: ${lay((l) => pct(this.leftShare(l)))}.`;
    return `Csigalépcsőt vág a gödör mellé, deszkafokokkal: rajta ×${String(STAIR.walk).replace('.', ',')} gyorsabban jártok, és nem kell létra. A létráitokhoz, a hordóliftehez nem nyúl, és csak a feltárt mélységig ás. Kész: ${this.stairs.built > 0 ? `${Math.round(this.stairs.depth)} m mélyig` : 'még semmi'}.`;
  }

  keysFor(i) {
    const shared = this.game.bindings?.some((b) => b.kbm === 'keys2');
    return glyphs(deviceOf(this.game.bindings?.[i]), shared);
  }

  uiFor(i, p) {
    const el = this.game.huds?.[i]?.el;
    if (!el) return null;
    let u = this.ui.get(p);
    if (u && u.root === el) return u;
    if (!document.getElementById('hire-style')) {
      const st = document.createElement('style');
      st.id = 'hire-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    u?.menu.remove();
    const menu = document.createElement('div');
    menu.className = 'hire-menu';
    el.appendChild(menu);
    u = { root: el, menu, sig: null };
    this.ui.set(p, u);
    return u;
  }

  drawUi(clear = false) {
    const g = this.game;
    g.players.forEach((p, i) => {
      const m = clear ? null : this.menu.get(p);
      if (!m && !this.ui.has(p)) return;
      const u = this.uiFor(i, p);
      if (!u) return;
      const k = m ? this.keysFor(i) : null;
      const sig = m ? `${m.sel}|${g.money}|${[...this.hired].map(([id, h]) => id + h.why).join(',')}|${this.lanterns.list.length}|${this.ori.join()}|${this.stairs.built.toFixed(1)}|${k.nav}|${g.players.length}|${this.report?.day}` : '';
      if (sig === u.sig) return;
      u.sig = sig;
      u.menu.style.display = m ? 'block' : 'none';
      if (m) u.menu.innerHTML = menuHtml(this, p, m, k);
    });
  }

  /* ---------------- per frame ---------------- */

  cullFor(visible) {
    this.lanterns.cullFor(visible);
    this.stairs.cullFor(visible);
    this.figures.cullFor(visible);
  }

  update(dt) {
    const g = this.game;
    const show = this.enabled || this.benchShow;
    this.lanterns.setOn(show);
    this.stairs.setOn(show);
    this.figures.setOn(show);
    if (this.benchShow && !this.enabled) {
      this.benchPlace();
      return;
    }
    if (!this.enabled) {
      if (this.menu.size) this.menu.clear();
      if (this.ui.size) this.drawUi(true);
      return;
    }
    const loaded = g.terrain?.loaded !== false;
    if (loaded) {
      if (this.survey.running) this.survey.step(SURVEY_MS);
      if (this.lanterns.check(dt)) g.saveNow?.();
      if (this.stairs.built > 0 && this.stairs.treadSig < 0) this.stairs.syncTreads();
    }
    this.figures.sync();
    this.slowT += dt;
    if (this.slowT >= 0.25) {
      this.slowT = 0;
      if (loaded) this.tickShifts();
      this.hints();
    }
    if (this.menu.size || this.ui.size) this.drawUi();
  }

  /** A one-time hint per player at the counter once the second layer is reached. */
  hints() {
    if (this.deepest() < LAYER_TOPS[1]) return;
    this.game.players.forEach((p, i) => {
      if (this.hinted.has(p) || !this.game.huds?.[i]?.shopOpen) return;
      this.hinted.add(p);
      this.shire.hint(p, 'hire', `<b style="${GOLD}">Törpék munkára.</b> A pultnál Thorin társai közül heten (Óin, Glóin, Ori, Dwalin, Nori, Bifur, Fíli) felfogadhatók napi bérért: lámpást akasztanak, térképet rajzolnak, apró leleteket szednek, lépcsőt vágnak — a háttérben, a hét étkezés ritmusában, csak a felső három rétegben (0–${LIMIT_DEPTH} m). Reggelente jelentést kapsz, mit végeztek, mibe került.`);
    });
  }

  /** Bench page with `?hire=1`: lanterns along every dug tunnel of the upper layers and three figures (once loaded). */
  benchPlace() {
    if (this.benchDone || this.game.terrain?.loaded === false) return;
    this.benchDone = true;
    this.survey.runNow();
    this.lanterns.place(this.survey.cand, 40, () => true);
    const ids = ['oin', 'gloin', 'dwalin'];
    this.lanterns.list.slice(0, 3).forEach((l, k) => this.stand(ids[k], l.x + Math.sin(l.yaw) * 0.3 + Math.cos(l.yaw) * 0.75, l.y - LANTERN.height, l.z + Math.cos(l.yaw) * 0.3 - Math.sin(l.yaw) * 0.75, l.yaw + Math.PI));
    this.figures.sync();
    // `?hire=2`: the bench players start in the lit tunnels (beside two lanterns) instead of on the lawn, so the bench
    // measures the lanterns' light around them while they dig.
    if (this.game.params?.get?.('hire') === '2') {
      this.game.players.forEach((p, i) => {
        const l = this.lanterns.list[Math.min(this.lanterns.list.length - 1, 4 + i * 6)];
        if (!l) return;
        p.pos.set(l.x + Math.sin(l.yaw) * 0.7, l.y - LANTERN.height + 0.1, l.z + Math.cos(l.yaw) * 0.7);
        p.vel.set(0, 0, 0);
        p.yaw = l.yaw + Math.PI / 2;
      });
    }
  }

  /* ---------------- save (inside the Shire's save as `h`) ---------------- */

  state() {
    const out = {};
    if (this.hired.size) {
      out.d = [...this.hired].map(([id, h]) => [id, h.paid]);
      if (this.lastKey != null) out.t = this.lastKey;
    }
    if (this.lanterns.list.length) out.l = this.lanterns.state();
    if (this.ori.some((v) => v > 0)) out.o = this.ori.map((v) => Math.round(v * 1000) / 1000);
    const f = this.stairs.state();
    if (f) out.f = f;
    const a = this.acc;
    if (a.wage || a.meal || a.gold || Object.keys(a.per).length) out.s = JSON.parse(JSON.stringify(a));
    if (this.report) out.r = this.report;
    return Object.keys(out).length ? out : undefined;
  }

  restore(h) {
    const s = h && typeof h === 'object' ? h : {};
    this.hired.clear();
    for (const e of Array.isArray(s.d) ? s.d : []) {
      if (!Array.isArray(e) || !BY_ID[e[0]]) continue;
      this.hired.set(e[0], { paid: Number.isFinite(e[1]) ? e[1] : -1, stopDay: -1, why: '' });
    }
    this.lastKey = Number.isFinite(s.t) ? s.t : null;
    this.lanterns.restore(s.l);
    this.ori = [0, 1, 2].map((l) => Math.max(0, Math.min(1, +(Array.isArray(s.o) ? s.o[l] : 0) || 0)));
    this.stairs.restore(s.f);
    const a = blankAcc();
    if (s.s && typeof s.s === 'object') {
      for (const k of ['wage', 'meal', 'pantry', 'gold']) a[k] = Math.max(0, +s.s[k] || 0);
      for (const [id, v] of Object.entries(s.s.per || {})) if (BY_ID[id] && v && typeof v === 'object') a.per[id] = { shifts: 0, lanterns: 0, map: 0, finds: 0, gold: 0, stair: 0, unpaid: 0, idle: '', ...v };
    }
    this.acc = a;
    this.report = s.r && typeof s.r.text === 'string' ? { day: s.r.day, text: s.r.text } : null;
    this.menu.clear();
    this.figures.clear();
    this.small = null;
  }
}

export { hoodSVG };
