/* ==== player.js — one player: first-person body, collision with the density field, digging, ladders, hunger, death ==== */
import * as THREE from 'three';
import { BAG_TIERS, HUNGER, LADDER_LEN, ORIGIN, PLAYER, TOOL_TIERS } from './config.js';
import { materialAt, MATS } from './materials.js';
import { digSphere, normalAt, raycast, sdf } from './world.js';
import { clearLadderSpot, LADDER_CAP, pushOutOfSurface, SPAWN_POS } from './props.js';
import { CharacterBody, viewForearm } from './characters.js';
import { armourAsset, armourOf } from './enemies/armour.js';
import { waterStep } from './underground/lake-water.js';
import { mirkwoodWaterStep } from './underground/mirkwood-water.js';
import { laketownWaterStep } from './underground/laketown-water.js';
// Fall damage and the belay rope (safety/, NOTES-11-safety).
import { landFall } from './safety/index.js';

/**
 * The selectable characters (TERV.md 0.3). `perk` multipliers: find (random find chance), power (bite), rock (bite in
 * hard soil), sell (selling price), price (shop prices), hunger (hunger costs), bag (capacity), climb (climb speed).
 * Look: the body is the baked film-look model assets/characters/<id>.json (characters.js, tools/figbake/designs);
 * `height` and `eye` are its standing height and eye height in metres (life size: a hobbit 1.1 m, the dwarves
 * 1.35–1.45 m); `coat` / `vest` / `hair` / `beard` are its main colours (the fallback body and UI accents).
 */
export const CHARACTERS = [
  { id: 'bilbo', name: 'Zsákos Bilbó', coat: 0x5e4028, vest: 0x7a1e22, hair: 0x6a4a2c, color: '#7fbf5a', height: 1.1, eye: 0.98,
    plus: 'Betörő: több leletet talál', minus: 'Kisebb zsák', perk: { find: 1.35, bag: 0.8 } },
  { id: 'thorin', name: 'Tölgypajzsos Thorin', coat: 0x232c3e, vest: 0x3a3a44, hair: 0x18161a, beard: 0x18161a, color: '#6a9ae0', height: 1.45, eye: 1.3,
    plus: 'Vezető: erősebb csákányütés minden kőben', minus: 'Drágábban vásárol', perk: { power: 1.2, price: 1.15 } },
  { id: 'balin', name: 'Balin', coat: 0x7a2228, vest: 0x9a8a70, hair: 0xe8e6e0, beard: 0xf0eee8, color: '#e07a8a', height: 1.36, eye: 1.2,
    plus: 'Tudós: drágábban ad el', minus: 'Lassabban mászik', perk: { sell: 1.2, climb: 0.85 } },
  { id: 'bofur', name: 'Bofur', coat: 0x6a5232, vest: 0xa88a3a, hair: 0x2a1e14, beard: 0x2a1e14, color: '#d8a050', height: 1.4, eye: 1.24,
    plus: 'Bányász: kőben a leggyorsabb', minus: 'Gyorsabban éhezik', perk: { rock: 1.45, hunger: 1.2 } },
  { id: 'bombur', name: 'Bombur', coat: 0x4e5a2a, vest: 0x8a6a3a, hair: 0xc85a22, beard: 0xc85a22, color: '#e08a40', height: 1.38, eye: 1.22, width: 1.6,
    plus: 'Erős: hatalmas zsák', minus: 'Nagyon éhes, lassan mászik', perk: { bag: 1.6, hunger: 1.5, climb: 0.8 } },
  { id: 'kili', name: 'Kíli', coat: 0x2e2a2a, vest: 0x4a3a2c, hair: 0x2a1a10, beard: 0x2a1a10, color: '#9a80e0', height: 1.45, eye: 1.31,
    plus: 'Felderítő: gyorsan mászik', minus: 'Kisebb zsák', perk: { climb: 1.35, bag: 0.8 } },
];
const NO_PERK = { find: 1, power: 1, rock: 1, sell: 1, price: 1, hunger: 1, bag: 1, climb: 1 };

const tmpN = new THREE.Vector3();
/** 26 unit directions (cube faces, edges and corners) for sampling a collision sphere's surface. */
const DIRS = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) DIRS.push(new THREE.Vector3(x, y, z).normalize());
const tmpV = new THREE.Vector3();
/** The five lower directions of the feet sphere (straight down and the four lower edges): the floor probes. */
const FOOT_DIRS = DIRS.filter((d) => d.y < -0.6);

/**
 * Movement over rough soil (TODO item 22, NOTES-34-stuck-ladder).
 * - `stepUp`: a walking player whose move is blocked tries the same move lifted by up to this much (m) and settles onto
 *   what he stands on: steps, lumps and the rims of dug holes up to 0.42 m are walked over (the old body rode up only
 *   about 0.12 m; anything higher stopped him dead).
 * - `stepDown`: a player who was on the ground and walks off a drop up to this much stays on the ground (snapped down,
 *   no hop and no landing), also down slopes.
 * - `stepWait`: after an attempt that met a wall of full height the next one waits this long (s): pushing into a wall costs no
 *   extra collision passes every frame.
 * - `eyeRate`: the view follows a step smoothly (m/s), the body moves at once.
 * - `stuckEmbed` / `stuckPush`: the unstuck step runs once a body centre has been inside the solid this long (s), or the
 *   collision has stayed unresolved (a sample still `stuckDeep` m or more inside) while the player pushes without
 *   getting anywhere this long; it searches the nearest free spot (up first, at
 *   most 0.8 m up or `stuckReach` m sideways, never through a ceiling or across more than `stuckWall` m of solid) at most every `stuckEvery` s.
 */
export const MOVE = { stepUp: 0.42, stepDown: 0.45, stepWait: 0.07, eyeRate: 2.6, stuckEmbed: 0.15, stuckPush: 0.6, stuckReach: 0.6, stuckDeep: 0.08, stuckWall: 0.2, stuckEvery: 0.25 };
/** The unstuck search's candidate offsets (built once): up first, then sideways in growing rings, then down. */
const UNSTUCK = [];
for (let k = 1; k <= 8; k++) UNSTUCK.push([0, k * 0.1, 0]);
for (const r of [0.15, 0.3, 0.45, 0.6]) {
  for (let a = 0; a < 8; a++) UNSTUCK.push([Math.cos((a * Math.PI) / 4) * r, 0, Math.sin((a * Math.PI) / 4) * r]);
  for (let a = 0; a < 8; a++) UNSTUCK.push([Math.cos((a * Math.PI) / 4) * r, 0.2, Math.sin((a * Math.PI) / 4) * r]);
}
for (let k = 1; k <= 3; k++) UNSTUCK.push([0, -k * 0.12, 0]);
/** The saved state of a step attempt (no allocation per frame). */
const stepSave = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: false };
/** The foot's rim: 8 points 0.27 m around the feet (just outside the body's 0.25 m) (x, z pairs), see rimTop(). */
const RIM = [];
for (let a = 0; a < 8; a++) RIM.push(Math.cos((a * Math.PI) / 4) * 0.27, Math.sin((a * Math.PI) / 4) * 0.27);

/**
 * Co-op pass-through (TODO item 20, NOTES-32-ladder-coop): the players have no collision with each other (no body is a
 * solid for the other's collide(), the dig ray reads the soil alone), so they walk through each other. While a view's
 * eye is inside a partner's body (closer than `r` m to his axis, between his feet and head), that body is not drawn in
 * this view, so walking through him does not fill the screen with the inside of his model.
 */
const SEE_THROUGH = { r: 0.45, below: 0.2, above: 0.25 };

/**
 * The body the other players see: the character's baked, skinned model (characters.js). userData: `bag` (scaled by how
 * full the bag is), `pick` (the right hand's grip frame; refreshTool puts the tool model in it) and `rig` (the
 * CharacterBody that poses the skeleton in syncVisuals).
 */
export function buildBody(ch, asset = ch.id) {
  // asset: the armour variant's baked body (enemies/armour.js armourAsset), the plain body without armour.
  const rig = new CharacterBody(ch, asset);
  const g = rig.group;
  g.userData = { bag: rig.bag, pick: rig.pick, rig };
  return g;
}

/**
 * The tool's model per tier (every upgrade looks better): 0 the garden spade, 1 an iron dwarf pick, 2 Bofur's
 * double-headed mattock with brass bands, 3 the Erebor miner's pick (dark blued steel, a long beak and a chisel end,
 * a bronze collar and gold bands with green enamel; NOTES-2a), 4 the mithril pick with glowing runes. Built pointing
 * along −z.
 */
export function buildToolModel(tier) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: tier >= 2 ? (tier === 3 ? 0x3a2414 : 0x4a2e1a) : 0x6a4a2a });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.55 + Math.min(tier, 3) * 0.05, 8), wood);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.2;
  g.add(handle);
  const headZ = -0.48 - Math.min(tier, 3) * 0.025;
  if (tier === 0) {
    // A flat spade blade.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.2), new THREE.MeshLambertMaterial({ color: 0x8a8a84 }));
    blade.position.z = headZ - 0.05;
    g.add(blade);
  } else if (tier === 3) {
    // The Erebor miner's pick: a heavy dark-steel head, a long slightly curved beak up, a broad chisel end down.
    const steel = new THREE.MeshLambertMaterial({ color: 0x3c424c, emissive: 0x06080a });
    const bronze = new THREE.MeshLambertMaterial({ color: 0xa8742e, emissive: 0x1a0e02 });
    const gold = new THREE.MeshLambertMaterial({ color: 0xd8b04a, emissive: 0x2a1c04 });
    const green = new THREE.MeshLambertMaterial({ color: 0x1e6a46, emissive: 0x04140c });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 8), bronze);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = headZ;
    g.add(collar);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.2, 0.058), steel);
    bar.position.z = headZ;
    g.add(bar);
    // The beak: three tapering segments bending forward.
    let y = 0.1;
    let z = headZ;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.022 - i * 0.006, 0.028 - i * 0.006, 0.075, 6), steel);
      y += 0.034;
      z -= 0.012 * i;
      seg.position.set(0, y, z);
      seg.rotation.x = -0.18 * (i + 1);
      g.add(seg);
      y += 0.034;
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 6), steel);
    tip.position.set(0, y + 0.02, z - 0.05);
    tip.rotation.x = -0.75;
    g.add(tip);
    const chisel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.03), steel);
    chisel.position.set(0, -0.15, headZ);
    g.add(chisel);
    // Gold bands with a green enamel inlay on the handle, a gold cap at the butt.
    for (const zb of [-0.1, -0.24, -0.36]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.024, 8), gold);
      band.rotation.x = Math.PI / 2;
      band.position.z = zb;
      g.add(band);
      const inlay = new THREE.Mesh(new THREE.CylinderGeometry(0.0265, 0.0265, 0.008, 8), green);
      inlay.rotation.x = Math.PI / 2;
      inlay.position.z = zb;
      g.add(inlay);
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), gold);
    cap.position.z = 0.08;
    g.add(cap);
  } else {
    const mithril = tier === 4;
    // Sizes grow with the tier; the mithril pick keeps the proportions it had as the old tier 3.
    const t = mithril ? 3 : tier;
    const metal = mithril
      ? new THREE.MeshLambertMaterial({ color: 0xe8f0ff, emissive: 0x3a5a8a })
      : new THREE.MeshLambertMaterial({ color: tier === 2 ? 0x5a5a62 : 0x9a9aa2 });
    // The pick head: a bar across the handle, pointed at both ends (one end flat on the mattock).
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26 + t * 0.04, 0.05), metal);
    bar.position.z = headZ;
    g.add(bar);
    const tipUp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), metal);
    tipUp.position.set(0, 0.17 + t * 0.02, headZ);
    g.add(tipUp);
    const tipDown = tier === 2 ? new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.06), metal) : new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), metal);
    tipDown.position.set(0, -0.17 - t * 0.02, headZ);
    if (tier !== 2) tipDown.rotation.x = Math.PI;
    g.add(tipDown);
    if (tier >= 2) {
      // Brass bands (the mattock) or blue runes (mithril) on the handle.
      const bandMat = mithril ? new THREE.MeshBasicMaterial({ color: 0x8ac8ff }) : new THREE.MeshLambertMaterial({ color: 0xc89a3a, emissive: 0x2a1a00 });
      for (const z of [-0.1, -0.25, -0.38]) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), bandMat);
        band.rotation.x = Math.PI / 2;
        band.position.z = z;
        g.add(band);
      }
    }
  }
  return g;
}

/**
 * How the first-person grip is turned: the hand and the tool share the grip frame (the tool along −z); the roll about
 * the handle brings the character's forearm in from the lower right, the pitch tilts the tool up and forward.
 */
const VIEW_GRIP = { roll: 2.45, pitch: 0.5, yaw: -0.12, pos: [0.25, -0.2, -0.4] };

/**
 * First-person tool held in view (attached to the camera): the current tier's tool in the character's own hand and
 * sleeve (cut from its baked model). The outer group swings (syncVisuals), the inner ones hold the grip.
 */
export function buildViewTool(tier, ch, asset) {
  const g = new THREE.Group();
  const pitch = new THREE.Group();
  pitch.rotation.set(VIEW_GRIP.pitch, VIEW_GRIP.yaw, 0, 'YXZ');
  // The armour shows on the forearm too (bracers, mail cuffs, vambraces of the armour variant's body).
  const grip = ch ? viewForearm(ch, asset || ch.id) : new THREE.Group();
  grip.rotation.z = VIEW_GRIP.roll;
  grip.add(buildToolModel(tier));
  pitch.add(grip);
  g.add(pitch);
  g.position.set(...VIEW_GRIP.pos);
  return g;
}

export class Player {
  /**
   * @param {number} slot 0 or 1 (also the render layer offset)
   * @param {object} game the game (scene, finds, ladders, sacks, money)
   */
  constructor(slot, game, character) {
    this.slot = slot;
    this.game = game;
    this.choosing = false; // true while the character select is open for this player
    this.pos = SPAWN_POS.clone().add(new THREE.Vector3(slot * 1.2, 0, 0));
    this.vel = new THREE.Vector3();
    this.yaw = 0; // facing the pit (−z)
    this.pitch = -0.25;
    this.grounded = false;
    this.climbing = false;
    this.hunger = HUNGER.max;
    this.faint = 0;
    this.toolTier = 0;
    this.bagTier = 0;
    this.bag = [];
    this.incoming = 0; // finds still flying into the bag
    this.ladders = 0;
    this.cooldown = 0;
    this.swing = 0;
    this.dead = 0;
    this.messages = [];
    // Combat (enemies/): armour tier, Sting owned, held by a goblin, a shove's or Bombur's charge's timers, stones.
    // A bench run may dress both players in one armour tier (`&armour=4`: the tier-3 / tier-4 body A/B, NOTES-8).
    this.armour = game.bench ? Math.max(0, Math.min(4, +(game.params?.get('armour') || 0) | 0)) : 0;
    this.sting = false;
    this.held = null;
    this.knockT = 0;
    this.dashT = 0;
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 160);
    this.camera.layers.enable(0);
    // Each player sees the other bodies (layer 1 + slot) but not their own; the view tool is on layer 10 + slot.
    this.camera.layers.enable(10 + slot);
    this.setCharacter(character);
    game.scene.add(this.camera);
    this.lamp = new THREE.PointLight(0xffeedd, 0, 18, 1.7);
    game.scene.add(this.lamp);
  }

  /** Lets this camera see the other players' bodies. */
  seeOthers(others) {
    for (const o of others) if (o !== this) this.camera.layers.enable(1 + o.slot);
  }

  get depth() {
    return Math.max(0, -this.pos.y);
  }

  /** Swaps the character: its body (seen by the others) and its perks. */
  setCharacter(ch) {
    this.ch = ch;
    this.perk = { ...NO_PERK, ...ch.perk };
    // Eye height and collision spheres per character: a hobbit fits lower passages than a dwarf.
    this.eyeH = ch.eye || PLAYER.eye;
    this.spheres = [PLAYER.spheres[0], (PLAYER.spheres[0] + this.eyeH - 0.05) / 2, this.eyeH - 0.05];
    if (this.body) this.game.scene.remove(this.body);
    this.body = buildBody(ch, armourAsset(ch, this.armour));
    this.game.scene.add(this.body);
    this.refreshTool();
  }

  /** Armour tier (enemies/armour.js): the body the others see and the own forearm change with it; no weight. */
  setArmour(tier) {
    this.armour = tier;
    this.setCharacter(this.ch);
  }

  /**
   * A shove (a goblin's, enemies/goblins.js): a horizontal push and a hop; the armour halves it from tier 3. For a
   * moment the player's own steering is weak, so the push carries.
   */
  knock(dx, dz, speed) {
    const k = speed * armourOf(this).knock;
    this.vel.x = dx * k;
    this.vel.z = dz * k;
    this.vel.y = Math.max(this.vel.y, 3 * Math.min(1, armourOf(this).knock + 0.3));
    this.grounded = false;
    this.knockT = 0.45;
  }

  /** Rebuilds the held tool for the current tier: in the own view and in the other player's view. */
  refreshTool() {
    if (this.viewTool) this.camera.remove(this.viewTool);
    this.viewTool = buildViewTool(this.toolTier || 0, this.ch, armourAsset(this.ch, this.armour));
    this.viewTool.traverse((o) => o.layers.set(10 + this.slot));
    this.camera.add(this.viewTool);
    const pick = this.body.userData.pick;
    pick.clear();
    // The model points along −z, which is the handle direction of the right hand's grip frame.
    pick.add(buildToolModel(this.toolTier || 0));
    // The skinned mesh arrives asynchronously and copies the group's layer; the tool and the bag hang on its bones.
    this.body.userData.rig.setLayer(1 + this.slot);
    pick.traverse((o) => o.layers.set(1 + this.slot));
    this.body.userData.bag.traverse((o) => o.layers.set(1 + this.slot));
  }

  get bagCap() {
    return Math.round(BAG_TIERS[this.bagTier].cap * this.perk.bag);
  }

  get tool() {
    return TOOL_TIERS[this.toolTier];
  }

  say(text, seconds = 2.5) {
    this.messages.push({ text, t: seconds });
    if (this.messages.length > 4) this.messages.shift();
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  eye(out) {
    return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
  }

  /** One frame: look, move, collide, act. `it` is the player's intent; `menuOpen` freezes movement. */
  update(dt, it, menuOpen) {
    for (const m of this.messages) m.t -= dt;
    this.messages = this.messages.filter((m) => m.t > 0);
    if (this.dead > 0) {
      this.dead -= dt;
      if (this.dead <= 0) this.respawn();
      this.syncVisuals(dt);
      return;
    }
    if (!menuOpen) {
      this.yaw -= it.lookX + (it.padLookX || 0) * dt;
      this.pitch -= it.lookY + (it.padLookY || 0) * dt;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    }
    // ---- Mirkwood's foes (mirkwood-foes/, NOTES-4b): hanging in a spider's cocoon or riding a barrel down the river,
    // that module moves the player (no walking physics); being wrapped (`wrap`) stops the walk like a goblin's grab. ----
    if (this.game.mirkFoes?.ride(this, dt, it)) {
      this.syncVisuals(dt);
      return;
    }
    // ---- end of the Mirkwood block ----
    // ---- Beneath Lake-town (laketown-events/, NOTES-5b-flood-bard): washed up by the flood, that module moves the player. ----
    if (this.game.laketownEvents?.ride(this, dt, it)) {
      this.syncVisuals(dt);
      return;
    }
    // ---- end of the Lake-town block ----
    // ---- safety (NOTES-11-safety): knocked down by a hard landing, no walking or digging for a moment. ----
    if (this.downT > 0) this.downT = Math.max(0, this.downT - dt);
    const down = this.downT > 0;
    // ---- end of the safety block ----
    // Held by a goblin (or wrapped by a spider): no walking (enemies/index.js input() counts the struggle).
    const mx = menuOpen || this.held || this.wrap || down ? 0 : it.mx;
    const mz = menuOpen || this.held || this.wrap || down ? 0 : it.mz;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Desired horizontal velocity in world space.
    let wx = -sin * mz + cos * mx;
    let wz = -cos * mz - sin * mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const inside = !!this.game.bagEnd?.isInside(this);
    const ladder = this.game.ladders.near(this.pos.x, this.pos.y, this.pos.z);
    // (coop-actions, NOTES-23-coop-actions: no ladders while carrying the heavy chest.)
    this.climbing = !!ladder && !this.carrying && (mz > 0.3 || it.jumpHeld || it.climbDown || this.climbing) && !(this.grounded && mz < -0.3);
    if (this.climbing && ladder) {
      // On a ladder: up with forward or jump, down with back or crouch; no gravity.
      const up = (mz > 0.3 || it.jumpHeld ? 1 : 0) - (mz < -0.3 || it.climbDown ? 1 : 0);
      this.vel.set(wx * 0.6, up * PLAYER.climb * this.perk.climb, wz * 0.6);
      if (up > 0) this.addHunger(-HUNGER.perClimbSecond * dt);
      // At the top (a capped ladder's top too, NOTES-32-ladder-coop): stepping forward hops off it; climbing up alone
      // stops there (no hop into the air and fall back), unless another ladder continues above.
      if (this.pos.y > ladder.top - 0.1 && up > 0) {
        if (mz > 0.3) this.vel.y = PLAYER.jump * 0.6;
        else {
          const next = this.game.ladders.near(ladder.x, ladder.top + 0.3, ladder.z);
          if (next && next !== ladder) this.vel.y = PLAYER.jump * 0.6;
          else this.vel.y = 0;
        }
      }
    } else {
      // After a shove the push carries (weak steering); Bombur's charge runs straight ahead (enemies/combat.js).
      this.knockT = Math.max(0, (this.knockT || 0) - dt);
      this.dashT = Math.max(0, (this.dashT || 0) - dt);
      let a = this.grounded ? PLAYER.accel : PLAYER.airAccel;
      let speed = PLAYER.walk;
      // ---- Sneaking (NOTES-4a-mirkwood: the elves' feast lights go out if you rush at them): the crouch key on the
      // ground walks at 42 % (the ladder's climb-down key; not on a ladder). ----
      if (it.climbDown && this.grounded && !ladder) speed *= 0.42;
      // ---- end of the sneaking block ----
      // Mirkwood's sticky web sheets slow the walk (mirkwood-foes/ sets `slow`, 1 elsewhere).
      speed *= this.slow || 1;
      // ---- coop-actions (NOTES-23-coop-actions): carrying the heavy chest with a partner, slowly. ----
      speed *= this.carryK || 1;
      // ---- end of the coop-actions block ----
      speed *= this.mealK || 1; // shire (NOTES-26-shire): "morcos" after a skipped meal walks a little slower
      if (this.knockT > 0) a = PLAYER.airAccel * 0.5;
      if (this.dashT > 0) {
        wx = -sin;
        wz = -cos;
        speed = this.dashSpeed || PLAYER.walk * 2;
        a = PLAYER.accel;
      }
      this.vel.x += (wx * speed - this.vel.x) * Math.min(1, a * dt);
      this.vel.z += (wz * speed - this.vel.z) * Math.min(1, a * dt);
      this.vel.y -= PLAYER.gravity * dt;
      if (this.grounded && it.jumpPressed && !menuOpen && !this.carrying) {
        this.vel.y = PLAYER.jump;
        this.grounded = false;
        this.addHunger(-HUNGER.perJump);
      }
      if (wl > 0.1 && this.grounded) this.addHunger(-HUNGER.perWalkSecond * dt);
    }
    // ---- Water (Gollum's lake, layer 5; underground/lake-water.js, NOTES-3a-lake): wading slows the steps, deeper
    // water floats the player (slow paddling, no drowning), a bank can be climbed out of. Sets `this.water`. ----
    // The roots of Mirkwood (layer 6, NOTES-4a-mirkwood): the river's wading and the enchanted stream's caught falls.
    // Beneath Lake-town (layer 7, laketown-events/): the current's push, and swimming in a flooded cavity (true: handled).
    if (!this.climbing && this.pos.y < -385 && this.game.laketownEvents?.waterStep(this, it, dt, wx, wz, menuOpen)) { /* the flood */ }
    else if (!this.climbing && this.pos.y < -270 && this.pos.y > -300) waterStep(this, it, dt, wx, wz, menuOpen);
    // Layer 7's pools, channel and stream: wading and swimming (underground/laketown-water.js, NOTES-5a-laketown).
    else if (!this.climbing && this.pos.y < -386) laketownWaterStep(this, it, dt, wx, wz, menuOpen);
    else if (!this.climbing && this.pos.y < -320) mirkwoodWaterStep(this, it, dt, wx, wz, menuOpen);
    else this.water = null;
    // ---- end of the water block ----
    const prevX = this.pos.x;
    const prevY = this.pos.y;
    const prevZ = this.pos.z;
    // The move the player means this frame (his steering direction at his current speed): a slide along a step's face
    // has lost the push into it, so the velocity alone would never ask for the step.
    const sp = Math.max(Math.hypot(this.vel.x, this.vel.z), 0.5) * dt;
    const ex = wx * sp;
    const ez = wz * sp;
    this.pos.addScaledVector(this.vel, dt);
    const impact = -this.vel.y;
    const wasGrounded = this.grounded;
    // Stood on the soil itself last frame (not only held up by a platform that sets `grounded`, coop-actions/hoist.js).
    const wasSoil = !!this.onSoil;
    this.collide();
    this.onSoil = this.grounded;
    // Rough soil (NOTES-34-stuck-ladder): step up onto what blocks a walking move, stay on the ground down small drops
    // (also wading; not swimming).
    const walking = !inside && !this.climbing && wl > 0.1 && this.vel.y <= 0.5 && !this.water?.swimming;
    this.stepWait = Math.max(0, (this.stepWait || 0) - dt);
    if (walking && (wasSoil || this.grounded) && this.stepWait <= 0) this.stepUp(prevX, prevY, prevZ, ex, ez);
    if (!inside && wasSoil && wasGrounded && !this.grounded && !this.climbing && this.vel.y <= 0 && !this.water?.swimming) this.stepDown();
    this.onSoil = this.grounded;
    // Squeezed between floor and ceiling (the head's crown in the soil): the passage is too low, step back. Only the
    // solid side is trusted (the air of a partly dug tunnel reads shallow everywhere: the old test, the head's centre
    // nearer than 0.125 m to "a surface" by the field, stopped players dead in most hand-dug tunnels). The move into
    // the obstacle is undone per axis first, so the player still slides along a low edge.
    this.lowHead = !inside && this.squeezed();
    if (this.lowHead) {
      const mx2 = this.pos.x;
      this.pos.x = prevX;
      if (this.squeezed()) {
        this.pos.x = mx2;
        this.pos.z = prevZ;
        if (this.squeezed()) this.pos.x = prevX;
        else this.vel.z = 0;
      } else this.vel.x = 0;
      if (this.pos.x === prevX && this.pos.z === prevZ) {
        this.vel.x = 0;
        this.vel.z = 0;
      }
    }
    if (!inside && !this.climbing) this.unstuck(dt, wl > 0.1);
    else this.stuckT = this.embedT = 0;
    // ---- safety (NOTES-11-safety): a landing hurts or kills by its speed (safety/index.js landFall: the modes, the
    // armour, the belay rope, water and rides), so digging down step by step is safe. ----
    if (this.grounded && !wasGrounded && !this.climbing && landFall(this, impact)) return;
    // ---- end of the safety block ----
    // Keep inside the Shire (Bag End's interior lies far outside it).
    if (!inside) {
      this.pos.x = Math.max(-60, Math.min(60, this.pos.x));
      this.pos.z = Math.max(-60, Math.min(60, this.pos.z));
    }
    if (this.pos.y < ORIGIN.y - 5) this.respawn(); // fell out of the world

    this.cooldown -= dt;
    if (!menuOpen && !inside) {
      // coop-actions (NOTES-23-coop-actions): both hands on the chest or on the raised lamp: no swing, no ladder.
      const hands = this.carrying || this.digBlocked;
      if (it.dig && this.cooldown <= 0 && !this.held && !this.wrap && !down && !hands) this.tryDig();
      if (it.ladderPressed && !this.carrying) this.tryLadder();
    }
    // A dropped bag is picked up by touching it.
    const items = this.game.sacks.take(this.pos.x, this.pos.y, this.pos.z);
    if (items) {
      const room = this.bagCap - this.bag.length;
      this.bag.push(...items.slice(0, room));
      this.say(room >= items.length ? 'Visszaszerezted a zsákot!' : `Visszaszereztél ${room} leletet, a többi nem fér el.`);
    }
    // Hunger: fainting, then death.
    if (this.hunger <= 0) {
      this.faint += dt;
      if (this.faint > HUNGER.faintSeconds) this.die('Elájultál az éhségtől…');
    } else this.faint = 0;
    this.syncVisuals(dt);
  }

  addHunger(d) {
    if (this.game.bench) return;
    // Costs scale with the character's appetite; food is never scaled.
    // Bag End's pantry raises the plate; its comforts slow the hunger.
    const fx = this.game.bagEnd?.effects;
    const max = HUNGER.max + (fx ? fx.hungerMaxBonus : 0);
    const mult = fx ? fx.hungerMult(this) : 1;
    this.hunger = Math.max(0, Math.min(max, this.hunger + (d < 0 ? d * this.perk.hunger * mult : d)));
  }

  /**
   * Pushes the body's spheres out of the soil; sets `grounded`. Uses only points INSIDE the solid: after digging,
   * the field's magnitude on the air side no longer measures the distance to the nearest surface (the removed
   * ground still reads as near), so the air side is never trusted.
   */
  collide() {
    if (this.game.bagEnd?.isInside(this)) {
      this.game.bagEnd.collide(this, PLAYER.radius);
      return;
    }
    this.grounded = false;
    // True while the last pass still found the body in the soil (read by unstuck()).
    this.unresolved = true;
    const r = PLAYER.radius;
    for (let iter = 0; iter < 5; iter++) {
      tmpV.set(0, 0, 0);
      let hits = 0;
      let deepest = 0;
      for (const h of this.spheres) {
        const cy = this.pos.y + h;
        for (const d of DIRS) {
          const depth = sdf(this.pos.x + d.x * r, cy + d.y * r, this.pos.z + d.z * r);
          if (depth <= 0) continue;
          tmpV.addScaledVector(d, -(depth + 0.004));
          hits++;
          if (depth > deepest) deepest = depth;
          if (h === this.spheres[0] && d.y < -0.6) this.grounded = true;
        }
      }
      this.residual = deepest;
      if (!hits) {
        this.unresolved = false;
        break;
      }
      tmpV.multiplyScalar(1 / Math.sqrt(hits));
      tmpN.copy(tmpV).normalize();
      if (tmpN.y > 0.7) {
        // Walkable ground (under ~45°): out straight up, not along the slope's normal. The normal's sideways part let a
        // standing player creep down every slope (the gold's dunes: 0.1–0.2 m in 2 s, more at low frame rates), also
        // while a menu or a held scene froze his walking (NOTES-29-final).
        this.pos.y += tmpV.length() / tmpN.y;
        if (this.vel.y < 0) this.vel.y = 0;
        continue;
      }
      this.pos.add(tmpV);
      const vn = this.vel.dot(tmpN);
      if (vn < 0) this.vel.addScaledVector(tmpN, -vn);
    }
    // A small probe under the feet keeps the grounded state stable on slopes.
    if (!this.grounded && this.vel.y <= 0.01 && sdf(this.pos.x, this.pos.y + this.spheres[0] - r - 0.05, this.pos.z) > 0) this.grounded = true;
    // The foot's rim (NOTES-34-stuck-ladder): a ledge top under the body's edge holds the player (on a step's edge, a
    // hole's rim) instead of letting him slide off it backwards.
    // Only for a player who stood on the soil before (not one carried by a moving platform: the hoist's riders sink
    // past the hole's edge and must not be caught on it).
    if (!this.grounded && this.onSoil && this.vel.y <= 0.01 && this.vel.y > -3 && this.rimTop() !== null) {
      this.pos.y = this.rimY;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
    }
    // The Shire's solid props (Bag End's hill, the inn, trees, posts, the spoil heap).
    if (this.pos.y > -2) pushOutOfSurface(this.pos, r);
  }

  /**
   * A ledge top under the foot's rim (8 points 0.27 m around the feet): solid just under the feet and air 0.12 m above
   * them. Returns the highest such top (also in `rimY`), or null. Only the solid side of the field is trusted.
   */
  rimTop() {
    const x = this.pos.x;
    const y = this.pos.y;
    const z = this.pos.z;
    let best = null;
    for (let a = 0; a < 8; a++) {
      const px = x + RIM[a * 2];
      const pz = z + RIM[a * 2 + 1];
      if (sdf(px, y - 0.03, pz) <= 0 || sdf(px, y + 0.12, pz) > 0) continue;
      let lo = y - 0.03;
      let hi = y + 0.12;
      for (let n = 0; n < 4; n++) {
        const m = (lo + hi) / 2;
        if (sdf(px, m, pz) > 0) lo = m;
        else hi = m;
      }
      if (best === null || lo > best) best = lo;
    }
    this.rimY = best;
    return best;
  }

  /** Can the body stand at its feet's level here: the feet sphere's floor probes or the foot's rim touch a top? */
  supported() {
    const r = PLAYER.radius;
    const cy = this.pos.y + this.spheres[0];
    for (const d of FOOT_DIRS) if (sdf(this.pos.x + d.x * r, cy + d.y * (r + 0.03), this.pos.z + d.z * r) > 0) return true;
    return this.rimTop() !== null;
  }

  /** The head's crown is in the soil (solid side only): the passage is too low for this body. */
  squeezed() {
    const head = this.spheres[this.spheres.length - 1];
    return sdf(this.pos.x, this.pos.y + head + PLAYER.radius * 0.4, this.pos.z) > 0;
  }

  /**
   * Step-up (NOTES-34-stuck-ladder): the walking move (ex, ez) from (px, py, pz) was blocked; try it lifted by up to
   * MOVE.stepUp and settle down onto what is under the feet. Standing on an edge (no floor right under the body's
   * centre), the move is also tried lowered by up to MOVE.stepDown: going down a step whose ceiling comes down with
   * it (the head met the lower ceiling ahead while the feet still stood on the edge); with no floor there yet it is a
   * plain fall from the lowered spot. Kept only when it gets clearly
   * further, stands on something and the head fits; else the blocked result stays. Only on blocked frames: at most
   * four collision passes and ~15 floor probes.
   */
  stepUp(px, py, pz, ex, ez) {
    const el = Math.hypot(ex, ez);
    if (el < 1e-4) return;
    const ux = ex / el;
    const uz = ez / el;
    const got = (this.pos.x - px) * ux + (this.pos.z - pz) * uz;
    if (got > el * 0.92) return;
    const need = Math.max(el * 0.6, got + el * 0.15);
    const crown = this.spheres[this.spheres.length - 1] + PLAYER.radius;
    stepSave.x = this.pos.x;
    stepSave.y = this.pos.y;
    stepSave.z = this.pos.z;
    stepSave.vx = this.vel.x;
    stepSave.vy = this.vel.y;
    stepSave.vz = this.vel.z;
    stepSave.g = this.grounded;
    // As high as the head room allows here and at the end of the move (a low tunnel still steps over small lumps).
    let up = MOVE.stepUp;
    while (up > 0.1 && (sdf(px, py + crown + up, pz) > 0 || sdf(px + ex, py + crown + up, pz + ez) > 0)) up -= 0.08;
    let wall = false;
    if (up > 0.1) {
      this.pos.set(px + ex, py + up, pz + ez);
      this.collide();
      const lifted = (this.pos.x - px) * ux + (this.pos.z - pz) * uz;
      // Lifted no further at all: a wall of full height (the next attempt waits a moment, see MOVE.stepWait).
      wall = lifted < got + el * 0.05;
      // Lifted, the move must get clearly further (a wall stays a wall: no floor search then).
      if (lifted > need) {
        // Down onto the step's top.
        for (let d = 0; d <= up + 0.06; d += 0.03) {
          if (this.supported()) {
            this.collide();
            const rise = this.pos.y - py;
            if ((this.pos.x - px) * ux + (this.pos.z - pz) * uz > need && rise > 0.01 && rise < up + 0.05 && !this.squeezed() && this.supported()) {
              this.stepDone();
              return;
            }
            break;
          }
          this.pos.y -= 0.03;
        }
      }
    }
    if (sdf(px, py - 0.08, pz) <= 0) {
      for (let down = 0.15; down <= MOVE.stepDown + 0.001; down += 0.15) {
        this.pos.set(px + ex, py - down, pz + ez);
        this.collide();
        if ((this.pos.x - px) * ux + (this.pos.z - pz) * uz > need && this.pos.y < py - 0.01 && !this.squeezed()) {
          // On the lower floor, or off the edge (ducking under the ceiling ahead): then a plain fall from here.
          if (this.supported()) this.stepDone();
          else {
            this.grounded = false;
            this.stepEye = Math.min(0.5, (this.stepEye || 0) + (stepSave.y - this.pos.y));
          }
          return;
        }
      }
    }
    this.pos.set(stepSave.x, stepSave.y, stepSave.z);
    this.vel.set(stepSave.vx, stepSave.vy, stepSave.vz);
    this.grounded = stepSave.g;
    // A real wall: no new attempt for a moment (pushing into a wall costs no extra passes every frame).
    if (wall) this.stepWait = MOVE.stepWait;
  }

  /** A kept step: on the ground, no fall speed, the view follows the height change smoothly. */
  stepDone() {
    this.grounded = true;
    if (this.vel.y < 0) this.vel.y = 0;
    this.stepEye = Math.max(-0.5, Math.min(0.5, (this.stepEye || 0) - (this.pos.y - stepSave.y)));
  }

  /**
   * Step-down (NOTES-34-stuck-ladder): a player who was on the ground and is not any more (walked off a small drop or
   * down a slope) is put back on the ground below, if it is within MOVE.stepDown; no hop, no landing. A larger drop is
   * a real fall (the safety rules unchanged).
   */
  stepDown() {
    const y0 = this.pos.y;
    for (let d = 0.03; d <= MOVE.stepDown; d += 0.03) {
      this.pos.y = y0 - d;
      if (this.supported()) {
        this.collide();
        this.grounded = true;
        this.vel.y = 0;
        this.stepEye = Math.min(0.5, (this.stepEye || 0) + (y0 - this.pos.y));
        return;
      }
    }
    this.pos.y = y0;
  }

  /** The body fits at (x, y, z): each sphere's centre and its six axis points are out of the solid. */
  fitsAt(x, y, z) {
    const r = PLAYER.radius * 0.9;
    for (const h of this.spheres) {
      const cy = y + h;
      if (sdf(x, cy, z) > 0 || sdf(x + r, cy, z) > 0 || sdf(x - r, cy, z) > 0 || sdf(x, cy, z + r) > 0 || sdf(x, cy, z - r) > 0) return false;
      if (sdf(x, cy + r, z) > 0 || sdf(x, cy - r, z) > 0) return false;
    }
    return true;
  }

  /**
   * The unstuck step (NOTES-34-stuck-ladder): when a body centre has stayed inside the solid, or the collision stayed
   * unresolved while the player pushed, the nearest spot where the body fits is searched (UNSTUCK: up first, then
   * sideways rings, then down; at most MOVE.stuckReach). Up only while the crown is in the air and the way up for the
   * crown stays air (never up through a ceiling); down only while the feet are in the air (never down through a
   * floor); sideways only across at most MOVE.stuckWall m of solid (never through a wall into the next room).
   */
  unstuck(dt, pushing) {
    // The feet and middle spheres' centres (the head in a low ceiling is the squeeze's business: lowHead).
    const emb = sdf(this.pos.x, this.pos.y + this.spheres[0], this.pos.z) > 0.02 || sdf(this.pos.x, this.pos.y + this.spheres[1], this.pos.z) > 0.02;
    this.embedT = emb ? (this.embedT || 0) + dt : 0;
    // Pushing without getting anywhere (within 5 cm of where it began) while the soil still holds the body; not a
    // passage that is merely too low for the head (that one is a plain stop, lowHead).
    if (!pushing || !this.unresolved || this.residual < MOVE.stuckDeep || this.lowHead || Math.abs(this.pos.x - (this.stuckX ?? 1e9)) + Math.abs(this.pos.z - (this.stuckZ ?? 1e9)) > 0.05) {
      this.stuckT = 0;
      this.stuckX = this.pos.x;
      this.stuckZ = this.pos.z;
    } else this.stuckT = (this.stuckT || 0) + dt;
    this.unstuckCd = Math.max(0, (this.unstuckCd || 0) - dt);
    if (this.unstuckCd > 0 || (this.embedT < MOVE.stuckEmbed && this.stuckT < MOVE.stuckPush)) return;
    this.unstuckCd = MOVE.stuckEvery;
    const x = this.pos.x;
    const y = this.pos.y;
    const z = this.pos.z;
    const r = PLAYER.radius;
    const crown = y + this.spheres[this.spheres.length - 1] + r * 0.5;
    const crownFree = sdf(x, crown, z) <= 0;
    const feetFree = sdf(x, y + this.spheres[0] - r * 0.5, z) <= 0;
    const mid = this.spheres[1];
    for (let i = 0; i < UNSTUCK.length; i++) {
      const o = UNSTUCK[i];
      if (o[1] > 0 && !o[0] && !o[2]) {
        if (!crownFree) continue;
        let clear = true;
        for (let k = 0.1; k <= o[1] + 0.001 && clear; k += 0.1) if (sdf(x + o[0], crown + k, z + o[2]) > 0) clear = false;
        if (!clear) continue;
      }
      if (o[1] < 0 && !feetFree) continue;
      if (o[0] || o[2]) {
        // Not across a wall: the way between at mid-body height crosses at most MOVE.stuckWall of solid.
        if (sdf(x + o[0] * 0.5, y + mid, z + o[2] * 0.5) > MOVE.stuckWall || sdf(x + o[0], y + mid, z + o[2]) > MOVE.stuckWall) continue;
      }
      if (!this.fitsAt(x + o[0], y + o[1], z + o[2])) continue;
      this.pos.set(x + o[0], y + o[1], z + o[2]);
      if (this.vel.y < 0) this.vel.y = 0;
      this.vel.x = 0;
      this.vel.z = 0;
      this.collide();
      this.embedT = 0;
      this.stuckT = 0;
      this.unstucks = (this.unstucks || 0) + 1;
      return;
    }
  }

  tryDig() {
    const o = this.eye(new THREE.Vector3());
    const d = this.forward(new THREE.Vector3());
    const t = raycast(o, d, PLAYER.reach);
    // minigames (NOTES-13-minigames): the smoke-ring winner digs faster the next day (cooldown × 0.8).
    this.cooldown = this.tool.cooldown * (this.game.minigames?.digMult?.(this) ?? 1);
    // home-events (NOTES-14-bagend-events): the dwarves who stayed after the Unexpected Party dig along.
    this.cooldown *= this.game.homeEvents?.digMult?.(this) ?? 1;
    // coop-actions (NOTES-23-coop-actions): digging in the light of a lamp a partner (or Dori) holds up is faster.
    this.cooldown *= this.game.coopActions?.digMult?.(this) ?? 1;
    // shire (NOTES-26-shire): "jóllakott" (a meal on time) digs a little faster, "morcos" (one skipped) a little slower.
    this.cooldown *= this.game.shire?.digMult?.(this) ?? 1;
    this.swing = 1;
    // A goblin in front takes the blow (the pick, or Sting once owned): no digging this swing.
    if (this.game.enemies?.strike(this, o, d)) return;
    // A web sheet in front is cut, a prisoner's swing picks the cell's lock (mirkwood-foes/): no digging this swing.
    if (this.game.mirkFoes?.strike(this, o, d)) return;
    // No digging under water (laketown-events/: a flooded cavity).
    if (this.game.laketownEvents?.strike(this, o, d)) return;
    if (t < 0) return;
    const at = o.clone().addScaledVector(d, t + 0.05);
    const mat = MATS[materialAt(at.x, at.y, at.z)];
    // Hard soil: a slightly narrower scoop and a much smaller bite per swing (the tool's power / hardness).
    const r = this.tool.radius / Math.pow(mat.hard, 0.25);
    const bite = (this.tool.power * this.perk.power * (mat.hard > 1 ? this.perk.rock : 1)) / mat.hard;
    // The sphere sits half its radius behind the hit surface, so the scoop is body-wide.
    const hit = o.addScaledVector(d, t + r * 0.5);
    if (hit.y > 0.6) return; // the open sky over the garden
    const t0 = performance.now();
    const res = digSphere(hit.x, hit.y, hit.z, r, bite);
    // A stroke at a layer-7 cavity's breach lets the lake in (laketown-events/).
    this.game.laketownEvents?.dug(this, hit.x, hit.y, hit.z);
    this.game.stats.digMs = performance.now() - t0;
    this.game.stats.digMax = Math.max(this.game.stats.digMax, this.game.stats.digMs);
    // The feel of the swing: clods, sparks in stone, the sound, a small kick of the view (harder soil kicks more).
    this.game.digfx?.burst(at, d, materialAt(at.x, at.y, at.z), res.removed);
    this.kick = 0.5 + Math.min(1, mat.hard / 2.4) * 0.5;
    if (res.removed <= 0) return;
    this.addHunger(-HUNGER.perSwing * mat.hard);
    this.game.enemies?.dug(this); // a stone for the pocket
    // Dug-up finds fly into the bag by themselves; a full bag leaves embedded finds in the wall.
    const room = this.bagCap - this.bag.length - this.incoming;
    const embedded = this.game.finds.collect(hit.x, hit.y, hit.z, r, Math.max(0, room));
    const random = this.game.finds.randomFinds(res.removed * this.perk.find, -hit.y, hit.x, hit.y, hit.z).slice(0, Math.max(0, room - embedded.length));
    if (room <= 0) this.say('Tele a zsák! Vidd fel a pulthoz.');
    for (const f of [...embedded, ...random]) {
      this.incoming++;
      this.game.finds.fly(f, this, () => {
        this.incoming--;
        if (this.dead > 0) return;
        this.bag.push(f.type);
        this.say(`${f.type.name} (${f.type.value} arany)`);
      });
    }
  }

  tryLadder() {
    if (this.ladders <= 0) {
      this.say('Nincs nálad létra. A pultnál vehetsz.');
      return;
    }
    const L = this.game.ladders;
    // On a ladder near its top: the next one continues it (only up to the height cap, NOTES-32-ladder-coop).
    const on = L.near(this.pos.x, this.pos.y, this.pos.z);
    if (on && this.pos.y > on.top - 1.6) {
      if (on.top < on.y + LADDER_LEN - 0.01 || L.lenAt(on.x, on.top, on.z) < LADDER_CAP.min) {
        this.sayTooHigh();
        return;
      }
      const n = new THREE.Vector3(Math.sin(on.yaw), 0, Math.cos(on.yaw));
      if (L.add(new THREE.Vector3(on.x, on.top, on.z), n)) this.ladders--;
      return;
    }
    if (on) {
      this.say('Itt már áll egy létra. Mássz a tetejére, ott folytathatod.');
      return;
    }
    // Otherwise lean it on the wall in front, foot on the floor at the player's feet.
    const o = new THREE.Vector3(this.pos.x, this.pos.y + 0.6, this.pos.z);
    const d = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const t = raycast(o, d, 1.6);
    if (t < 0) {
      this.say('Fordulj egy fal felé a létrához.');
      return;
    }
    const wall = o.clone().addScaledVector(d, t);
    normalAt(wall.x, wall.y, wall.z, tmpN);
    tmpN.y = 0;
    if (tmpN.lengthSq() < 0.05) tmpN.copy(d).negate();
    tmpN.normalize();
    const foot = wall.addScaledVector(tmpN, 0.18);
    foot.y = this.pos.y;
    // Too near the surface: the ladder would stick out of the ground (a capped one needs LADDER_CAP.min m left).
    if (L.lenAt(foot.x, foot.y, foot.z) < LADDER_CAP.min) {
      this.sayTooHigh();
      return;
    }
    // Clear of the soil (NOTES-34-stuck-ladder): out from the wall as far as needed, the foot on the floor; no clear
    // spot: refused, the ladder kept.
    if (clearLadderSpot(foot, tmpN, L.lenAt(foot.x, foot.y, foot.z)) < 0) {
      this.say('Itt nem fér el a létra: ásd ki jobban a falat előtte.', 3);
      return;
    }
    if (L.lenAt(foot.x, foot.y, foot.z) < LADDER_CAP.min) {
      this.sayTooHigh();
      return;
    }
    if (L.add(foot, tmpN)) this.ladders--;
  }

  /** The refused ladder (the height cap, NOTES-32-ladder-coop): nothing is placed or used up. */
  sayTooHigh() {
    this.say('Itt a létra kilógna a földből: legfeljebb egy kicsit állhat ki a felszín fölé.', 3);
  }

  /**
   * Co-op pass-through (NOTES-32-ladder-coop): hides a partner's body from this view while the eye is inside it, shows
   * it again once apart (camera layers 1 + slot, see seeOthers). No allocation; a layer bit flips only on a change.
   */
  seeThrough() {
    const ps = this.game.players;
    if (ps.length < 2) return;
    const ey = this.camera.position.y;
    const r2 = SEE_THROUGH.r * SEE_THROUGH.r;
    for (let i = 0; i < ps.length; i++) {
      const o = ps[i];
      if (o === this) continue;
      const dx = o.pos.x - this.pos.x;
      const dz = o.pos.z - this.pos.z;
      const inside = dx * dx + dz * dz < r2 && ey > o.pos.y - SEE_THROUGH.below && ey < o.pos.y + (o.ch?.height || 1.2) + SEE_THROUGH.above;
      const layer = 1 + o.slot;
      if (inside === this.camera.layers.isEnabled(layer)) {
        if (inside) this.camera.layers.disable(layer);
        else this.camera.layers.enable(layer);
      }
    }
  }

  die(reason) {
    if (this.held) this.held.release?.();
    // modes (NOTES-15-modes): Kihívás loses the bag for good (no sack) and part of the purse; else the sack stays.
    if (!this.game.modes?.death(this, reason)) {
      this.say(`${reason} Elveszett, amit ezen az úton kiástál.`, 5);
      this.game.sacks.drop(this.pos.x, this.pos.y, this.pos.z, this.bag);
    }
    this.bag = [];
    this.dead = 2.5;
    this.vel.set(0, 0, 0);
    this.game.music?.sting('halal');
    this.game.saveNow?.();
  }

  respawn() {
    this.dead = 0;
    this.downT = 0;
    this.pos.copy(SPAWN_POS).add(tmpV.set(this.slot * 1.2, 0, 0));
    this.vel.set(0, 0, 0);
    this.stepEye = 0;
    this.hunger = Math.max(this.hunger, HUNGER.respawnLevel);
    this.faint = 0;
  }

  /** Camera, body, lamp and the tool swing. */
  syncVisuals(dt) {
    // Knocked down (safety/): the view drops towards the floor and tilts, then rises as the player gets up.
    const downK = this.dead > 0 ? 0 : Math.min(1, (this.downT || 0) / 0.45);
    const eyeY = this.dead > 0 ? 0.25 : this.eyeH - downK * (this.eyeH - 0.45);
    // A step up or down (NOTES-34-stuck-ladder): the view follows smoothly.
    const se = this.stepEye || 0;
    this.stepEye = se > 0 ? Math.max(0, se - MOVE.eyeRate * dt) : Math.min(0, se + MOVE.eyeRate * dt);
    this.camera.position.set(this.pos.x, this.pos.y + eyeY + this.stepEye, this.pos.z);
    this.seeThrough(); // co-op pass-through (NOTES-32-ladder-coop)
    this.kick = Math.max(0, (this.kick || 0) - dt * 7);
    const kick = this.kick * this.kick * 0.035;
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch - kick, this.yaw, (this.dead > 0 ? 0.6 : 0) + downK * 0.35 + kick * 0.4, 'YXZ'));
    this.body.position.copy(this.pos);
    this.body.rotation.y = this.yaw;
    this.body.visible = this.dead <= 0;
    this.swing = Math.max(0, this.swing - dt * 4);
    const s = Math.sin(this.swing * Math.PI);
    this.viewTool.rotation.x = -s * 1.1;
    // The body: walk cycle from the horizontal speed, the dig swing, the climbing pose, the look up / down.
    this.body.userData.rig.animate({
      dt, speed: Math.hypot(this.vel.x, this.vel.z), vy: this.vel.y, grounded: this.grounded, climbing: this.climbing,
      swing: this.swing, pitch: this.pitch, walk: PLAYER.walk, fill: this.bag.length / this.bagCap,
    });
    // The lamp hangs just above and behind the head (no blown-out wall up close); brighter underground.
    this.lamp.position.copy(this.camera.position).addScaledVector(this.forward(tmpV), -0.15);
    this.lamp.position.y += 0.3;
    this.lamp.intensity = this.depth > 1 ? 6 : 3;
    // ---- coop-actions (NOTES-23-coop-actions): the lamp held high (brighter, reaching further) or a partner's light. ----
    this.lamp.intensity *= this.lampBoost || 1;
    this.lamp.distance = 18 * (this.lampReach || 1);
    this.lamp.position.y += this.lampLift || 0;
    // ---- end of the coop-actions block ----
  }
}
