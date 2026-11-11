/* ==== coop-actions/lamp.js — one holds the lamp while the other digs (TERV 0.11/18 "az egyik tartja a lámpát, a másik
   ás (nagyobb fény, gyorsabb ásás)"; 0.5 "Kettős fáklya"; NOTES-23-coop-actions).
   - The lamp key (H, the F2 player's "-", a pad's right-stick click) raises the player's lamp or lowers it again. Held
     high the holder's own lamp hangs higher and burns brighter, and both hands are on it (no digging).
   - A partner within LAMP.reach of the holder digs in that light: his own lamp brightens too and his swing cooldown is
     × LAMP.dig (player.js tryDig asks digMult). While it lasts both count as a strong light (`p.lightPower` + 1).
   - In single play the lamp key asks Dori (when hired) to hold the lamp: he keeps close and holds his lantern up; the
     player gets the digger's light and speed. Again = he lowers it.
   No new light in the scene (that would recompile every material): the players' own lamps change (player.js reads
   `lampBoost`, `lampReach`, `lampLift`). ==== */
import { LAMP } from './rules.js';

export class Lamp {
  constructor(ca) {
    this.ca = ca;
    this.game = ca.game;
    /** Single play: Dori holds the lamp. */
    this.dori = false;
  }

  /** The lamp key. */
  toggle(p) {
    const ca = this.ca;
    if (p.carrying || ca.chests.heldBy(p)) {
      ca.say(p, 'lamp-hands', 'Mindkét kezed a ládán van: most nem tarthatod a lámpát.', 3);
      return;
    }
    const partner = ca.humans().find((q) => q !== p);
    if (!partner && ca.dori) {
      this.dori = !this.dori;
      p.lampUp = false;
      p.say(this.dori ? 'Dori magasra tartja a lámpását: „Áss csak, én világítok!” Több fény, gyorsabb ásás.' : 'Dori leengedte a lámpást.', 3.5);
      if (this.dori) ca.hint('lamp', p);
      return;
    }
    p.lampUp = !p.lampUp;
    if (!p.lampUp) {
      p.say('Leengedted a lámpást.', 2);
      return;
    }
    if (partner) {
      p.say(`Magasra tartod a lámpást: ${partner.ch.name} a fényében gyorsabban ás. (Közben te nem ássz.)`, 4);
      ca.hint('lamp', p);
    } else p.say('Magasra tartod a lámpást: messzebbre látsz, de ásni így nem tudsz. Ketten jobb: az egyik tartja, a másik ás.', 4);
  }

  /** Is p's raised lamp on (p is free, not carrying)? */
  holding(p) {
    return !!p.lampUp && this.ca.free(p) && !p.carrying;
  }

  /** Per frame: who holds, who digs in the light; the lamps' numbers; the strong light. */
  update() {
    const ca = this.ca;
    const players = ca.humans();
    const H = ca.dori;
    if (!H) this.dori = false;
    const now = performance.now();
    for (const p of this.game.players) {
      if (p.swing > 0.6) p.coopDigT = now; // swinging: the prompt below offers the partner the lamp
      if (p.lampUp && (p.carrying || p.dead > 0)) p.lampUp = false;
      const hold = this.holding(p);
      let aid = false;
      if (!hold && ca.free(p)) {
        aid = players.some((q) => q !== p && this.holding(q) && q.pos.distanceTo(p.pos) < LAMP.reach);
        if (!aid && this.dori && H?.placed && H.pos.distanceTo(p.pos) < LAMP.reach + 0.6) aid = true;
      }
      p.lampAid = aid;
      p.digBlocked = hold;
      const L = hold ? LAMP.holder : aid ? LAMP.digger : null;
      // smith (NOTES-40-smith): the smith's lamp upgrade multiplies in (`p.smithLamp`, null without it).
      p.lampBoost = (L ? L.boost : 1) * (p.smithLamp?.boost || 1);
      p.lampReach = (L ? L.reach : 1) * (p.smithLamp?.reach || 1);
      p.lampLift = hold ? LAMP.holder.lift : 0;
      // The strong light (enemies/, gollum/, mirkwood-foes/ read p.lightPower): one step up while it lasts.
      const strong = hold || aid;
      if (strong && !p.coopLit) {
        p.coopLit = true;
        p.coopLightBase = p.lightPower;
        p.lightPower = (p.lightPower ?? 1) + 1;
      } else if (!strong && p.coopLit) {
        p.coopLit = false;
        if (p.coopLightBase === undefined) delete p.lightPower;
        else p.lightPower = p.coopLightBase;
      }
    }
  }

  /** The swing cooldown factor for p (player.js tryDig). */
  digMult(p) {
    return p.lampAid ? LAMP.dig : 1;
  }

  /** The prompt line for p, or ''. */
  prompt(p) {
    const ca = this.ca;
    const key = ca.lampKey(p);
    if (this.holding(p)) return `Magasra tartod a lámpást · ${key} leengeded`;
    if (p.lampAid) return this.dori ? `Dori tartja a lámpát: több fény, gyorsabb ásás · ${key} leengedi` : 'A társad tartja a lámpát: több fény, gyorsabb ásás';
    if (p.depth < 4 || !ca.free(p) || p.carrying) return '';
    const partner = ca.humans().find((q) => q !== p);
    // Offered only while the partner is digging near (a swing in the last 2.5 s).
    if (partner && partner.pos.distanceTo(p.pos) < LAMP.reach && !partner.lampUp && performance.now() - (partner.coopDigT || -1e9) < 2500) return `${key} tartsd magasra a lámpást ${partner.ch.name} társadnak`;
    return '';
  }
}
