/* ==== hoard/neck.js — the colliders of Smaug's raised neck and head (NOTES-27-loose; NOTES-7a-hoard's open item).
   underground/hoard-fx.js gives his sleeping body capsule colliders (one per spine segment, in `capsules()` order). When
   he lifts his head ('stir', 'settle') or rears up ('awake': the wake scare, the conversation), the neck and the head
   leave those capsules: this module adds six live capsules (the segments from the shoulders to the mouth, read from
   the posed bones each frame: `smaug.neckCapsules`) and masks the sleeping neck's six while the live ones stand in.
   - The live capsules join decor.js's collider list once (re-sorted by height, as decor.js does after building). The
     list's band search keys on each collider's fixed `y`: theirs stays at BAND_Y over the lair, and each frame's box
     radius `br` covers the capsule from there (at most decor.maxBr; a capsule that would need more is switched off).
   - The sleeping neck's colliders keep hoard-fx's own `on` (it sets it every frame from busy / gone); a getter adds
     the mask, so hoard-fx.js is unchanged.
   Cost: six capsules more in the sdf's band (only near the lair) and a few vector reads a frame while somebody is
   deep enough for Smaug to be posed (src/hoard/index.js). No draw calls. ==== */
import { SHOULDER_BONE } from '../smaug/body.js';

/** Height of the live capsules' band centre over the lair (m): the reared neck spans about −0.4 … +2.6 m. */
const BAND_Y = 1.0;

export class NeckColliders {
  /**
   * @param {object} decor underground/decor.js (its `colliders`, `colliderY`, `maxBr`)
   * @param {object} fx underground/hoard-fx.js (its `smaug` and the sleeping body's `colliders`)
   */
  constructor(decor, fx) {
    this.smaug = fx.smaug;
    this.raised = false;
    const yc = this.smaug.lair.y + BAND_Y;
    // The sleeping neck's colliders (segments SHOULDER_BONE … the mouth): their `on` gets the mask.
    this.lying = fx.colliders.slice(SHOULDER_BONE);
    const self = this;
    for (const c of this.lying) {
      let fxOn = c.on;
      Object.defineProperty(c, 'on', {
        configurable: true,
        enumerable: true,
        get: () => fxOn && !self.raised,
        set: (v) => {
          fxOn = v;
        },
      });
    }
    this.live = this.lying.map(() => ({ t: 'cap', a: [0, yc, 0], b: [0, yc, 0], r: 0.5, x: 0, y: yc, z: 0, br: 1, on: false, smaugNeck: true }));
    this.maxBr = decor.maxBr;
    const list = decor.colliders;
    list.push(...this.live);
    list.sort((a, b) => a.y - b.y);
    decor.colliderY = Float32Array.from(list, (c) => c.y);
  }

  /**
   * Per frame, after `smaug.update` (the bones' world matrices are this frame's).
   * @param {boolean} active Smaug lies on the hoard (not the finale's, not slain) and is posed this frame
   */
  update(active) {
    const s = this.smaug;
    this.raised = active && s.pose !== 'sleep';
    if (!this.raised) {
      for (const c of this.live) c.on = false;
      return;
    }
    s.neckCapsules(this.live);
    for (const c of this.live) {
      c.x = (c.a[0] + c.b[0]) / 2;
      c.z = (c.a[2] + c.b[2]) / 2;
      const br = Math.max(Math.abs(c.a[0] - c.x), Math.abs(c.a[2] - c.z), Math.abs(c.a[1] - c.y), Math.abs(c.b[1] - c.y)) + c.r;
      c.br = br;
      c.on = br <= this.maxBr;
    }
  }
}
