/* ==== timed-events/index.js — the timed events on the day clock (NOTES-12-events): goblin night (goblin-night.js)
   and the Sackville-Bagginses' auction during play (auction.js).
   Wiring (game.js, marked "timed-events"): `new TimedEvents(this)` after the day clock and Bag End, `restore(save.events)`,
   `update(dt)` once per frame after the enemies; save.js `events: game.timedEvents?.state()`. ==== */
import { Auction } from './auction.js';
import { GoblinNight } from './goblin-night.js';

export class TimedEvents {
  constructor(game) {
    this.game = game;
    this.goblinNight = new GoblinNight(game);
    this.auction = new Auction(game);
  }

  update(dt) {
    this.goblinNight.update(dt);
    this.auction.update(dt);
  }

  /** { gn: goblin night, au: auction } — a missing field restores the defaults. */
  state() {
    const out = {};
    const gn = this.goblinNight.state();
    const au = this.auction.state();
    if (Object.keys(gn).length) out.gn = gn;
    if (Object.keys(au).length) out.au = au;
    return out;
  }

  restore(s) {
    this.goblinNight.restore(s?.gn);
    this.auction.restore(s?.au);
  }
}
