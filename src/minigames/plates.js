/* ==== minigames/plates.js — the dwarves' plate throwing (TERV 0.11/12: "Törpe tányérdobálás (a filmből): amikor beállít
   a 13 törpe, ritmusjáték: a repülő tányérokat és poharakat kell elkapni és a helyükre tenni. Ha egy sem törik el,
   jutalmat kapsz."). Book ch. 1 (the dwarves' washing-up song while they clear the table, Bilbo fearing for his
   crockery) and the first film (they toss the plates to each other down the hall). The song is not quoted here.
   - Trigger: the "Váratlan vendégek" event (TERV 0.7, 13 dwarves knock) is not built yet; it should call
     `game.minigames.plates.party()` or emit `game.events.emit('unexpected-party')`. Until then the game is started from
     the kitchen's crockery slot ("Anyja nyugati-végi porcelánja", any tier) in Bag End: a menu row "Tányérdobálás a
     törpékkel" (bagend/effects.js `slotRows` hook).
   - A parchment in the player's own viewport (DOM only, no 3D): three lanes ending on the dresser's shelves; plates
     and glasses come flying down a lane, each thrown by one of the thirteen; press that lane's key (left / up / right,
     the middle also with the confirm key) as it reaches the shelf. ±0.2 s window. A plate that is not caught breaks.
   - 14 pieces per player, about 15 s. Co-op: a partner inside Bag End plays at the same time, with his own throws;
     the reward is shared: only if nothing broke for either player ("együtt").
   - Reward (once per game day per player; the game can be replayed): a full plate (the HUD hunger plate) and the
     "fed" bonus of a cooked meal (bagend/effects.js `fed`: hunger ×0.85 for 180 s + 90 s per crockery tier).
     Failure: the broken count, no reward, no penalty. The back key leaves. ==== */
import { GOLD, glyphsOf, head, keysOf, rng, schemeOf, sound } from './common.js';

export const PLATES = {
  count: 14,
  start: 2.0, // s before the first catch
  travel: 1.4, // s a piece flies down its lane
  window: 0.2, // s either side of the catch moment
  gaps: [0.55, 0.8, 0.8, 1.05], // the rhythm's gaps (s), picked per piece
  catchY: 80, // % of the lane height: the shelf
  end: 2.4, // s the result stays
};

/** The thirteen of Thorin's company (book ch. 1) [ellenőrizendő: the Hungarian spelling of the names]. */
export const DWARVES = ['Dwalin', 'Balin', 'Kíli', 'Fíli', 'Dori', 'Nori', 'Ori', 'Óin', 'Glóin', 'Bifur', 'Bofur', 'Bombur', 'Thorin'];

const LANE_KEYS = {
  mouse: ['A', 'W', 'D'],
  keys2: ['←', '↑', '→'],
  pad: ['◀', '▲', '▶'],
};

const PLATE_SVG = '<svg viewBox="0 0 40 40" width="2.3em" height="2.3em"><ellipse cx="20" cy="20" rx="18" ry="12" fill="#f6f0e2" stroke="#5a7ab0" stroke-width="2.4"/><ellipse cx="20" cy="20" rx="10" ry="6.5" fill="none" stroke="#9ab0d0" stroke-width="1.2"/></svg>';
const GLASS_SVG = '<svg viewBox="0 0 40 40" width="2.0em" height="2.0em"><path d="M11 5h18l-3 14q-6 5-12 0z" fill="#d8ecf4" stroke="#6a8a9a" stroke-width="1.6"/><path d="M20 22v9M13 34h14" stroke="#6a8a9a" stroke-width="2"/></svg>';

export class Plates {
  constructor(mg) {
    this.mg = mg;
    this.game = mg.game;
    this.runs = new Map(); // player → run
    this.days = {}; // slot → last rewarded game day
    this.session = null;
    this.game.events?.on?.('unexpected-party', () => this.party());
  }

  today() {
    return this.game.dayClock?.day?.() ?? 1;
  }

  holds(p) {
    return this.runs.has(p);
  }

  get running() {
    return this.runs.size > 0;
  }

  /** The kitchen's crockery slot gets the start row (bagend/effects.js slotRows hook). */
  slotRows(s, p, t) {
    if (s.id !== 'porcelan' || !(t > 0)) return [];
    return [{
      label: 'Tányérdobálás a törpékkel',
      ok: !this.runs.size,
      desc: 'Ahogy a Váratlan Vendégségen: a törpék dobálják a tányérokat és poharakat, neked kell elkapnod őket. Ha egy sem törik el, jutalmat kapsz.',
      act: () => {
        const i = this.game.players.indexOf(p);
        const v = this.game.bagEnd?.menuFor?.(i);
        v?.menu?.close();
        v?.menu?.prompt(null);
        this.start(p);
        return '';
      },
    }];
  }

  /** The unexpected party's hook: everybody inside Bag End plays. */
  party() {
    const inside = this.game.players.filter((q) => !q.choosing && this.game.bagEnd?.isInside(q));
    if (inside.length) this.start(inside[0]);
  }

  start(p) {
    if (this.runs.size) return false;
    const players = [p, ...this.game.players.filter((q) => q !== p && !q.choosing && q.dead <= 0 && !this.mg.busy(q) && this.game.bagEnd?.isInside(q))];
    this.session = { t: 0, over: 0, done: false, result: '' };
    players.forEach((q) => {
      const i = this.game.players.indexOf(q);
      const r = rng((this.today() * 104729 + i * 7907 + (this.seq = (this.seq || 0) + 1) * 13) >>> 0);
      const items = [];
      let at = PLATES.start;
      for (let k = 0; k < PLATES.count; k++) {
        items.push({ lane: Math.floor(r() * 3), kind: r() < 0.68 ? 'plate' : 'glass', who: DWARVES[Math.floor(r() * DWARVES.length)], at, state: 'fly', el: null });
        at += PLATES.gaps[Math.floor(r() * PLATES.gaps.length)] * (1 - k * 0.012);
      }
      this.runs.set(q, { i, items, caught: 0, broken: 0, built: false, scheme: schemeOf(this.game, i), msg: '' });
      // Bag End's own prompt (the slot's "E") stays hidden while the parchment is up.
      this.game.bagEnd?.menuFor?.(i)?.menu?.prompt(null);
      this.mg.hint(q, i, 'plates', `<b style="${GOLD}">Tányérdobálás.</b> A tányérok és poharak három sávban repülnek a tálaló polcai felé. Amikor egy a polchoz ér, nyomd meg a sávja gombját (${keysOf(this.game, i).lanes}; a középsőt a megerősítő gombbal is). Ha egy sem törik el, jutalmat kapsz! Kilépés: ${keysOf(this.game, i).back}.`, 10);
    });
    if (players.length > 1) for (const q of players) q.say('Tányérdobálás, együtt: csak akkor jár jutalom, ha egyikőtöknél sem törik el semmi!', 3);
    return true;
  }

  input(p, i, it) {
    const r = this.runs.get(p);
    if (!r) return false;
    if (it.backPressed) {
      this.leave(p);
      p.say('Otthagytad a tányérokat.', 2);
      return true;
    }
    if (this.session.done) return true;
    const lanes = [it.leftPressed, it.upPressed || it.confirmPressed || it.digPressed, it.rightPressed];
    lanes.forEach((on, lane) => {
      if (on) this.press(r, lane);
    });
    return true;
  }

  /** A press in a lane: the flying piece of that lane nearest its catch moment, if within the window. */
  press(r, lane, t = this.session.t) {
    let best = null;
    for (const it of r.items) {
      if (it.state !== 'fly' || it.lane !== lane) continue;
      if (Math.abs(t - it.at) <= PLATES.window && (!best || Math.abs(t - it.at) < Math.abs(t - best.at))) best = it;
    }
    if (!best) return false;
    best.state = 'caught';
    r.caught++;
    sound(this.game, 'catch');
    return true;
  }

  leave(p) {
    this.runs.delete(p);
    this.mg.overlay.box(p, this.game.players.indexOf(p), '');
    if (!this.runs.size) this.session = null;
  }

  update(dt) {
    if (!this.runs.size) return;
    const S = this.session;
    S.t += dt;
    for (const [p, r] of this.runs) {
      if (p.dead > 0 || p.choosing) {
        this.leave(p);
        continue;
      }
      for (const it of r.items) {
        if (it.state === 'fly' && S.t > it.at + PLATES.window) {
          it.state = 'broken';
          r.broken++;
          sound(this.game, 'smash');
        }
      }
    }
    if (!this.runs.size) return;
    const all = [...this.runs.values()];
    if (!S.done && all.every((r) => r.items.every((it) => it.state !== 'fly'))) this.finish();
    if (S.done) {
      S.over += dt;
      if (S.over > PLATES.end) for (const p of [...this.runs.keys()]) this.leave(p);
    }
  }

  finish() {
    const S = this.session;
    S.done = true;
    const broken = [...this.runs.values()].reduce((s, r) => s + r.broken, 0);
    const day = this.today();
    const fx = this.game.bagEnd?.effects;
    for (const [p, r] of this.runs) {
      if (broken === 0) {
        const slot = p.slot ?? r.i;
        if (this.days[slot] !== day) {
          this.days[slot] = day;
          const max = fx?.hungerMax ?? 100;
          p.hunger = Math.max(p.hunger, max);
          if (fx?.fed) fx.fed.set(p, Math.max(fx.fed.get(p) || 0, 180 + 90 * (fx.t?.('porcelan') || 0)));
          r.reward = true;
          r.msg = 'Egy sem tört el! Bilbó anyja porcelánja ép maradt. Jóllaktál: tele a tányérod, és egy ideig lassabban éhezel.';
          sound(this.game, 'win');
        } else r.msg = 'Egy sem tört el! (Mára már megkaptad a jutalmat.)';
      } else {
        r.msg = this.runs.size > 1
          ? `Összesen ${broken} darab tört el (nálad ${r.broken}). Most nincs jutalom.`
          : `${broken} darab összetört. Most nincs jutalom.`;
      }
      p.say(r.msg, 4.5);
    }
    this.game.saveNow?.();
  }

  /** The parchment: built once per run, then only the pieces' styles move. */
  html(p, i) {
    const r = this.runs.get(p);
    if (!r) return '';
    const S = this.session;
    if (S.done) {
      return head('Tányérdobálás') + `<div style="font-size:1.05em">Elkapva: <b>${r.caught}</b> · összetört: <b>${r.broken}</b></div><div style="margin-top:0.35em;font-weight:bold;font-style:italic;color:${r.broken || !r.msg.startsWith('Egy') ? '#7a2a10' : '#2a5a1a'}">${r.msg}</div>`;
    }
    const keys = LANE_KEYS[r.scheme] || LANE_KEYS.mouse;
    const g = glyphsOf(this.game, i);
    const lanes = [0, 1, 2].map((l) => `<div style="position:relative;flex:1;border-left:${l ? '1px dashed #8a6a4a' : 'none'}" data-lane="${l}">
      <div style="position:absolute;left:8%;right:8%;top:${PLATES.catchY + 4}%;height:0.45em;background:#6a4422;border-radius:0.15em;box-shadow:0 2px 2px #0006"></div>
      <div style="position:absolute;left:0;right:0;top:${PLATES.catchY + 9}%;text-align:center;font-weight:bold;color:#5a2a0a">${keys[l]}</div></div>`).join('');
    const pieces = r.items.map((it, k) => `<div data-k="${k}" style="position:absolute;left:${(it.lane * 33.33 + 16.66).toFixed(2)}%;top:0;transform:translate(-50%,-200%);text-align:center;will-change:transform;display:none">
      <div class="pl-art" style="will-change:transform">${it.kind === 'plate' ? PLATE_SVG : GLASS_SVG}</div><div style="font-size:0.7em;line-height:1;color:#4a3a28">${it.who}</div></div>`).join('');
    return head('Tányérdobálás') + `<div style="font-size:0.85em;color:#5a4a34">Kapd el, amikor a polchoz ér! ${g.back} kilépés</div>
      <div class="pl-field" style="position:relative;height:13em;margin-top:0.3em;display:flex;background:#00000008;border-radius:0.2em;overflow:hidden">${lanes}${pieces}</div>
      <div class="pl-score" style="margin-top:0.25em;font-size:0.9em">Elkapva: 0 · összetört: 0</div>`;
  }

  /** Per frame while running: moves the pieces (style only) on the player's parchment. */
  draw(p) {
    const r = this.runs.get(p);
    const box = this.mg.overlay.boxEl(p);
    if (!r || !box || this.session.done) return;
    if (!r.els || r.els.box !== box || !r.els.score?.isConnected) {
      r.els = { box, items: [...box.querySelectorAll('[data-k]')], score: box.querySelector('.pl-score') };
      r.els.art = r.els.items.map((e) => e.querySelector('.pl-art'));
    }
    const t = this.session.t;
    r.items.forEach((it, k) => {
      const el = r.els.items[k];
      if (!el) return;
      const u = (t - (it.at - PLATES.travel)) / PLATES.travel;
      let show = u >= 0 && it.state === 'fly';
      let y = u * PLATES.catchY;
      if (it.state === 'caught' && t < it.at + 0.4) {
        show = true;
        y = PLATES.catchY;
      } else if (it.state === 'broken' && t < it.at + PLATES.window + 0.5) {
        show = true;
        y = PLATES.catchY + 6;
      }
      const vis = show ? 'block' : 'none';
      if (el.style.display !== vis) el.style.display = vis;
      if (!show) return;
      // 13em field: y% of its height; the piece is centred on its point.
      el.style.transform = `translate(-50%, calc(${(y * 0.13).toFixed(2)}em - 60%))`;
      // Only the piece spins (a plate end over end, a glass wobbles); the thrower's name stays level.
      const art = r.els.art[k];
      if (art) art.style.transform = `rotate(${it.state === 'broken' ? 35 : it.kind === 'plate' ? (t * 400 + k * 60) % 360 : Math.sin(t * 9 + k) * 18}deg)`;
      const op = it.state === 'broken' ? '0.45' : '1';
      if (el.style.opacity !== op) el.style.opacity = op;
      if (it.state === 'broken' && !el.dataset.b) {
        el.dataset.b = '1';
        el.style.filter = 'sepia(1) hue-rotate(-30deg) saturate(3)';
      }
    });
    const txt = `Elkapva: ${r.caught} · összetört: ${r.broken}`;
    if (r.els.score && r.els.score.textContent !== txt) r.els.score.textContent = txt;
  }

  state() {
    return Object.keys(this.days).length ? { d: { ...this.days } } : undefined;
  }

  restore(s) {
    this.days = s && s.d && typeof s.d === 'object' ? { ...s.d } : {};
  }
}
