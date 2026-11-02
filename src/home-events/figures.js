/* ==== home-events/figures.js — the visitors of Bag End's home events (NOTES-14-bagend-events): Gandalf, the thirteen
   dwarves of the Unexpected Party and Lobelia Sackville-Baggins. Simple vertex-coloured figures (one Lambert material,
   one draw call each), built once at start into Bag End's interior scene and kept hidden until a scene shows them.
   The looks follow the book (ch. 1): Gandalf's tall pointed blue hat, long grey cloak, silver scarf and long white
   beard; the dwarves' hoods in the book's colours, Thorin's sky-blue one with a long silver tassel. Lobelia has no
   description in The Hobbit: a plain hobbit lady (dress, shawl, bonnet, a bag for the spoons). The finale borrows
   the same kind of figure for Otho and the feast crowd (hobbitGeometry, NOTES-17-polish). ==== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Paints a geometry in one colour (sRGB hex) as a vertex colour attribute; returns it. */
function painted(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

/** A small collector: add(geometry, colour), then merge (optionally moved / turned / scaled as a whole). */
class Parts {
  constructor() {
    this.list = [];
  }

  add(geo, hex) {
    this.list.push(painted(geo, hex));
    return geo;
  }

  merge() {
    return mergeGeometries(this.list);
  }
}

/** Gandalf, standing; local: faces +z, feet at 0. The staff in his right hand (he knocks with it). */
export function gandalfGeometry() {
  const P = new Parts();
  const robe = new THREE.CylinderGeometry(0.17, 0.36, 1.32, 12);
  robe.translate(0, 0.66, 0);
  P.add(robe, 0x86868a);
  const chest = new THREE.SphereGeometry(0.21, 12, 9);
  chest.scale(1.05, 1.05, 0.8);
  chest.translate(0, 1.3, 0);
  P.add(chest, 0x86868a);
  for (const s of [-1, 1]) {
    const boot = new THREE.SphereGeometry(0.08, 8, 6);
    boot.scale(0.9, 0.55, 1.6);
    boot.translate(s * 0.1, 0.04, 0.12);
    P.add(boot, 0x1a1816);
    const arm = new THREE.CylinderGeometry(0.06, 0.085, 0.62, 8);
    arm.rotateZ(s * 0.22);
    arm.rotateX(-0.35);
    arm.translate(s * 0.26, 1.12, 0.08);
    P.add(arm, 0x7a7a7e);
    const hand = new THREE.SphereGeometry(0.045, 7, 5);
    hand.translate(s * 0.33, 0.86, 0.2);
    P.add(hand, 0xd2b298);
  }
  const scarf = new THREE.TorusGeometry(0.12, 0.035, 6, 14);
  scarf.rotateX(Math.PI / 2);
  scarf.translate(0, 1.45, 0.01);
  P.add(scarf, 0xc8ccd6);
  const head = new THREE.SphereGeometry(0.11, 12, 9);
  head.translate(0, 1.6, 0.02);
  P.add(head, 0xd8b8a0);
  const nose = new THREE.SphereGeometry(0.025, 6, 5);
  nose.scale(0.9, 1, 1.4);
  nose.translate(0, 1.6, 0.13);
  P.add(nose, 0xc8a088);
  const beard = new THREE.ConeGeometry(0.12, 0.62, 10);
  beard.rotateX(Math.PI);
  beard.translate(0, 1.24, 0.09);
  P.add(beard, 0xe6e6e0);
  const brows = new THREE.BoxGeometry(0.17, 0.03, 0.03);
  brows.translate(0, 1.65, 0.105);
  P.add(brows, 0xe6e6e0);
  const brim = new THREE.CylinderGeometry(0.3, 0.3, 0.015, 18);
  brim.translate(0, 1.7, 0);
  P.add(brim, 0x5a6c9a);
  const cone = new THREE.ConeGeometry(0.13, 0.55, 12);
  cone.rotateX(-0.18);
  cone.translate(0, 1.97, -0.05);
  P.add(cone, 0x6274a6);
  // The staff, held upright in the right hand.
  const staff = new THREE.CylinderGeometry(0.022, 0.028, 1.8, 6);
  staff.translate(0.36, 0.9, 0.22);
  P.add(staff, 0x6a4a2a);
  return P.merge();
}

/** The thirteen in the order they arrive (book ch. 1) with their hood colours (as the hall pegs' hoods, furniture.js).
 *  Dori, Nori, Ori, Óin and Glóin: "two purple, a grey, a brown and a white" — which is whose the book does not say. */
export const DWARF_ARRIVALS = [
  { name: 'Dwalin', hood: 0x2a4a2a, beard: 0x3a4a8a }, // "a blue beard tucked into a golden belt"
  { name: 'Balin', hood: 0xb8202a, beard: 0xe8e4dc },
  { name: 'Kíli', hood: 0x2a4a9a, beard: 0x4a2a14 },
  { name: 'Fíli', hood: 0x2a4a9a, beard: 0xc89a4a },
  { name: 'Dori', hood: 0x5a2a6a, beard: 0x7a6a5a },
  { name: 'Nori', hood: 0x5a2a6a, beard: 0x8a4a2a },
  { name: 'Ori', hood: 0x8a8a8a, beard: 0x6a4a2a },
  { name: 'Óin', hood: 0x6a4a2a, beard: 0x9a9a92 },
  { name: 'Glóin', hood: 0xe8e4dc, beard: 0xa83a1a },
  { name: 'Bifur', hood: 0xd8b030, beard: 0x5a4a3a },
  { name: 'Bofur', hood: 0xd8b030, beard: 0x3a2a1a },
  { name: 'Bombur', hood: 0x9ac088, beard: 0xb86a2a, wide: 1.45 },
  { name: 'Thorin', hood: 0x8ab8e0, beard: 0x2a221c, tassel: true, tall: 1.06 },
];

/** One dwarf: cloak, belt, head, a long beard, the pointed hood; local: faces +z, feet at 0. */
function dwarfParts(P, d, m) {
  const w = d.wide || 1;
  const t = d.tall || 1;
  const put = (geo, hex) => {
    geo.applyMatrix4(m);
    P.add(geo, hex);
  };
  const body = new THREE.CylinderGeometry(0.17 * w, 0.27 * w, 0.82 * t, 10);
  body.translate(0, 0.45 * t, 0);
  put(body, new THREE.Color(d.hood).multiplyScalar(0.55).getHex());
  const belt = new THREE.CylinderGeometry(0.205 * w, 0.215 * w, 0.06, 10);
  belt.translate(0, 0.52 * t, 0);
  put(belt, 0x3a2414);
  for (const s of [-1, 1]) {
    const boot = new THREE.SphereGeometry(0.075, 7, 5);
    boot.scale(1, 0.6, 1.5);
    boot.translate(s * 0.1 * w, 0.04, 0.08);
    put(boot, 0x2a1a10);
    const arm = new THREE.CylinderGeometry(0.05, 0.065, 0.45, 7);
    arm.rotateZ(s * 0.25);
    arm.translate(s * 0.22 * w, 0.66 * t, 0.02);
    put(arm, new THREE.Color(d.hood).multiplyScalar(0.5).getHex());
  }
  const head = new THREE.SphereGeometry(0.105, 10, 8);
  head.translate(0, 0.98 * t, 0.02);
  put(head, 0xd0a888);
  const beard = new THREE.ConeGeometry(0.11 * Math.min(w, 1.2), 0.42, 9);
  beard.rotateX(Math.PI);
  beard.translate(0, 0.78 * t, 0.1);
  put(beard, d.beard);
  // The hood: a cloth cap over the head and a pointed tip falling back.
  const cap = new THREE.SphereGeometry(0.125, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55);
  cap.translate(0, 1.0 * t, 0);
  put(cap, d.hood);
  const tip = new THREE.ConeGeometry(0.08, 0.32, 8);
  tip.rotateX(-0.9);
  tip.translate(0, 1.12 * t, -0.13);
  put(tip, d.hood);
  const cape = new THREE.CylinderGeometry(0.15 * w, 0.2 * w, 0.22, 10, 1, true);
  cape.translate(0, 0.84 * t, -0.01);
  put(cape, d.hood);
  if (d.tassel) {
    const cord = new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4);
    cord.translate(0, 1.06 * t, -0.33);
    put(cord, 0xd8dce4);
    const tas = new THREE.ConeGeometry(0.03, 0.09, 6);
    tas.translate(0, 0.9 * t, -0.33);
    put(tas, 0xe8ecf4);
  }
}

/**
 * The thirteen as one geometry, in arrival order; `counts[k]` = the index count that draws the first k dwarves, so a
 * scene shows them one group after another with setDrawRange (still one draw call).
 * @param {Array<[number, number, number]>} spots local [x, z, yaw] per dwarf (arrival order)
 */
export function dwarvesGeometry(spots) {
  const counts = [0];
  const geos = [];
  DWARF_ARRIVALS.forEach((d, k) => {
    const P = new Parts();
    const [x, z, yaw] = spots[k];
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
    dwarfParts(P, d, m);
    const g = P.merge();
    geos.push(g);
    counts.push(counts[k] + g.index.count);
  });
  return { geometry: mergeGeometries(geos), counts };
}

/** Lobelia: a hobbit lady with a bonnet, a shawl and a bag on her arm; bare hobbit feet. Local: faces +z. */
export function lobeliaGeometry() {
  const P = new Parts();
  const skirt = new THREE.CylinderGeometry(0.15, 0.3, 0.62, 12);
  skirt.translate(0, 0.33, 0);
  P.add(skirt, 0x6a3a4a);
  const bodice = new THREE.CylinderGeometry(0.13, 0.15, 0.3, 10);
  bodice.translate(0, 0.78, 0);
  P.add(bodice, 0x7a4a5a);
  const shawl = new THREE.CylinderGeometry(0.11, 0.2, 0.16, 10);
  shawl.translate(0, 0.86, 0);
  P.add(shawl, 0xc8b08a);
  for (const s of [-1, 1]) {
    const foot = new THREE.SphereGeometry(0.06, 7, 5);
    foot.scale(1, 0.5, 1.7);
    foot.translate(s * 0.08, 0.03, 0.12);
    P.add(foot, 0xc89878);
    const arm = new THREE.CylinderGeometry(0.04, 0.05, 0.36, 7);
    arm.rotateZ(s * 0.3);
    arm.translate(s * 0.18, 0.72, 0.02);
    P.add(arm, 0x7a4a5a);
  }
  const bag = new THREE.BoxGeometry(0.14, 0.12, 0.07);
  bag.translate(0.24, 0.52, 0.04);
  P.add(bag, 0x3a2a1a);
  const head = new THREE.SphereGeometry(0.1, 10, 8);
  head.translate(0, 1.04, 0.01);
  P.add(head, 0xd8b098);
  const hair = new THREE.SphereGeometry(0.105, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.5);
  hair.translate(0, 1.05, -0.01);
  P.add(hair, 0x5a3a22);
  const bonnet = new THREE.CylinderGeometry(0.08, 0.15, 0.08, 12);
  bonnet.translate(0, 1.14, -0.01);
  P.add(bonnet, 0x4a2a3a);
  const ribbon = new THREE.TorusGeometry(0.1, 0.012, 5, 14);
  ribbon.rotateX(Math.PI / 2);
  ribbon.translate(0, 1.1, -0.01);
  P.add(ribbon, 0xa8384a);
  return P.merge();
}

/**
 * Builds the visitors into a scene once, hidden. Returns { root, gandalf, dwarves, lobelia, counts, material }.
 * @param {THREE.Scene} scene Bag End's interior scene
 * @param {THREE.Vector3} origin the interior's world origin
 * @param {Array<[number, number, number]>} dwarfSpots local [x, z, yaw] per dwarf
 */
export function buildVisitors(scene, origin, dwarfSpots) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const root = new THREE.Group();
  root.name = 'home-events-visitors';
  root.position.copy(origin);
  const gandalf = new THREE.Mesh(gandalfGeometry(), material);
  gandalf.name = 'home-gandalf';
  const dw = dwarvesGeometry(dwarfSpots);
  const dwarves = new THREE.Mesh(dw.geometry, material);
  dwarves.name = 'home-dwarves';
  dwarves.frustumCulled = false; // the draw range changes; the hall is small
  const lobelia = new THREE.Mesh(lobeliaGeometry(), material);
  lobelia.name = 'home-lobelia';
  for (const m of [gandalf, dwarves, lobelia]) {
    m.visible = false;
    root.add(m);
  }
  scene.add(root);
  return { root, gandalf, dwarves, lobelia, counts: dw.counts, material };
}

/* ---- hobbits for the finale's epilogue (NOTES-17-polish): Otho at the auction, the feast crowd at the Green Dragon ---- */

/**
 * A hobbit (book ch. 1: no shoes, the soles leathery and the feet hairy, thick curly brown hair, bright clothes,
 * "chiefly green and yellow", rather fat in the stomach). Local: faces +z, feet at 0, about 1.05 m.
 * o: { coat, waistcoat, breeches (or `dress` for a hobbit lady: a long skirt instead of the breeches and the coat),
 *      hair, skin, h (height factor), wide (girth factor), mug (a mug held in the right hand at the chest),
 *      raise (the mug raised high, a toast), rod (a measuring rod held upright in the right hand) }
 */
export function hobbitGeometry(o = {}) {
  const P = new Parts();
  const h = o.h ?? 1;
  const w = o.wide ?? 1;
  const skin = o.skin ?? 0xd2a888;
  const hair = o.hair ?? 0x5a3a22;
  const S = (geo) => {
    geo.scale(1, h, 1);
    return geo;
  };
  for (const s of [-1, 1]) {
    // Big bare feet with brown hair on top.
    const foot = new THREE.SphereGeometry(0.065, 7, 4);
    foot.scale(1, 0.5, 1.8);
    foot.translate(s * 0.08, 0.035, 0.09);
    P.add(foot, skin);
    const fur = new THREE.SphereGeometry(0.05, 6, 3);
    fur.scale(0.95, 0.45, 1.3);
    fur.translate(s * 0.08, 0.06, 0.07);
    P.add(fur, hair);
    if (!o.dress) {
      const shin = S(new THREE.CylinderGeometry(0.042, 0.038, 0.2, 7));
      shin.translate(s * 0.075, 0.16 * h, 0);
      P.add(shin, skin);
      const leg = S(new THREE.CylinderGeometry(0.07 * w, 0.06, 0.22, 8));
      leg.translate(s * 0.08 * w, 0.36 * h, 0);
      P.add(leg, o.breeches ?? 0x6a5030);
    }
  }
  if (o.dress) {
    const skirt = S(new THREE.CylinderGeometry(0.15 * w, 0.27 * w, 0.5, 12));
    skirt.translate(0, 0.3 * h, 0);
    P.add(skirt, o.dress);
  }
  // The body (waistcoat or bodice) and the round stomach.
  const body = S(new THREE.CylinderGeometry(0.14 * w, 0.17 * w, 0.36, 10));
  body.translate(0, 0.64 * h, 0);
  P.add(body, o.waistcoat ?? 0xc8a038);
  const belly = new THREE.SphereGeometry(0.16 * w, 9, 6);
  belly.scale(1, 0.95 * h, 0.9);
  belly.translate(0, 0.58 * h, 0.03);
  P.add(belly, o.waistcoat ?? 0xc8a038);
  if (o.coat && !o.dress) {
    // The coat: open at the front (the waistcoat shows), down to the hips.
    const coat = S(new THREE.CylinderGeometry(0.165 * w, 0.215 * w, 0.46, 12, 1, true, Math.PI * 0.27, Math.PI * 1.46));
    coat.translate(0, 0.6 * h, 0);
    P.add(coat, o.coat);
  }
  const sleeve = o.coat && !o.dress ? o.coat : o.waistcoat ?? 0xc8a038;
  for (const s of [-1, 1]) {
    const right = s < 0;
    const arm = S(new THREE.CylinderGeometry(0.042, 0.052, 0.34, 7));
    let hand;
    if (right && (o.mug || o.rod)) {
      if (o.raise) {
        // A toast: the forearm up, the mug over the head's height.
        arm.rotateZ(-2.6);
        arm.translate(-0.24 * w, 0.92 * h, 0.04);
        hand = [-0.3 * w, 1.06 * h, 0.06];
      } else {
        // Held in front of the chest.
        arm.rotateX(-1.05);
        arm.translate(-0.17 * w, 0.66 * h, 0.12);
        hand = [-0.16 * w, 0.6 * h, 0.25];
      }
    } else {
      arm.rotateZ(s * 0.22);
      arm.translate(s * 0.21 * w, 0.62 * h, 0.01);
      hand = [s * 0.25 * w, 0.44 * h, 0.03];
    }
    P.add(arm, sleeve);
    const hd = new THREE.SphereGeometry(0.04, 6, 4);
    hd.translate(...hand);
    P.add(hd, skin);
    if (right && o.mug) {
      const mug = new THREE.CylinderGeometry(0.04, 0.036, 0.1, 8);
      mug.translate(hand[0], hand[1] + 0.05, hand[2] + 0.01);
      P.add(mug, 0x9a8a6a);
    }
    if (right && o.rod) {
      const rod = new THREE.BoxGeometry(0.018, 1.0, 0.008);
      rod.translate(hand[0], hand[1] + 0.12, hand[2] + 0.02);
      P.add(rod, 0xd8c890);
    }
  }
  const head = new THREE.SphereGeometry(0.1, 9, 7);
  head.translate(0, 0.98 * h, 0.01);
  P.add(head, skin);
  const nose = new THREE.SphereGeometry(0.022, 6, 4);
  nose.translate(0, 0.97 * h, 0.105);
  P.add(nose, 0xc89878);
  // Thick curly brown hair: a cap and a few curls round it.
  const cap = new THREE.SphereGeometry(0.106, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cap.translate(0, 1.0 * h, -0.005);
  P.add(cap, hair);
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (0.35 + (1.3 * k) / 4); // round the sides and the back, not over the face
    const curl = new THREE.SphereGeometry(0.036, 5, 3);
    curl.translate(Math.sin(a) * 0.095, 0.99 * h + (k % 3) * 0.02, Math.cos(a) * 0.095);
    P.add(curl, hair);
  }
  if (o.dress) {
    // A hobbit lady's shawl round the shoulders.
    const shawl = S(new THREE.CylinderGeometry(0.1 * w, 0.19 * w, 0.14, 10));
    shawl.translate(0, 0.84 * h, 0);
    P.add(shawl, o.shawl ?? 0xc8b08a);
  }
  return P.merge();
}

/**
 * Otho Sackville-Baggins at the auction (book ch. 19: the Sackville-Bagginses measuring Bilbo's rooms; The Hobbit does
 * not describe him): a plain hobbit gentleman with a measuring rod.
 */
export function othoGeometry() {
  return hobbitGeometry({ coat: 0x4a3a28, waistcoat: 0x8a7a3a, breeches: 0x3a3428, hair: 0x4a3020, rod: true, wide: 1.08 });
}

/** The feast crowd at the Green Dragon (the finale): a few hobbits in green and yellow, some with mugs. */
export const FEAST_HOBBITS = [
  { coat: 0x3a6a2a, waistcoat: 0xd0a830, breeches: 0x5a4a2a, hair: 0x5a3a22, mug: true, raise: true },
  { waistcoat: 0x4a7a2a, breeches: 0x6a5030, hair: 0x3a2414, mug: true, wide: 1.15 },
  { dress: 0xc8a030, waistcoat: 0x3a6a2a, hair: 0x6a4a2a, shawl: 0xd8c8a0, h: 0.96 },
  { coat: 0xb89028, waistcoat: 0x2a5a2a, breeches: 0x4a3a22, hair: 0x4a3020, mug: true },
  { dress: 0x4a7a3a, waistcoat: 0xd8b848, hair: 0x5a3a22, shawl: 0xc8b08a, h: 0.94, mug: true },
  { waistcoat: 0xc89a30, breeches: 0x3a5a2a, hair: 0x6a4626, mug: true, raise: true, h: 1.03 },
];
