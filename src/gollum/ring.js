/* ==== gollum/ring.js — the Ring (TERV 0.2 layer 5's famous find, 0.4, 0.5, 0.12): it lies on the tunnel floor in the
   dark (the lake provider's ringSpot; book ch. 5: Bilbo's hand met it on the tunnel floor). A keep-find (finds.js
   `gyuru`, keep: true): never sold, once per game. Anyone may pick it up; only Bilbo can wear it — another character
   puts it in the shared collection and a Bilbo player can wear it from then on.
   Worn (Bilbo's ability slot: X / Á / d-pad left; input.js `ringPressed`):
   - goblins (and later spiders and elves) cannot see the wearer: isInvisible(p);
   - in the partner's view the body vanishes, only a faint shimmer of its outline shows (the body's material swapped
     for an additive rim-light shader, one draw call as before; the tool, bag and sword hidden);
   - in the own view the film's shadow world: the picture greys (a per-view flag folded into three's tone-mapping
     chunk: the sign of toneMappingExposure, a uniform every lit material already has: no extra pass, no new
     program), the view stretches (a wider field of view), a CSS vignette with streaks at the edges, the hand and tool
     turn translucent, sounds are muffled (a low-pass on the shared audio context's output) and a wind roars.
   - Smaug's sense of smell is a stored counter for later (`smell`, seconds worn). ==== */
import * as THREE from 'three';
import { sharedAudio } from '../audio.js';
import { chunkKey } from '../enemies/sites.js';
import { sdf } from '../world.js';

/** Tuning. */
export const RING = {
  pickup: 1.2, // metres from the spot
  fov: 15, // degrees added to the view while worn (the stretch)
  fade: 0.5, // seconds for the look to come and go
  muffle: 900, // Hz: the low-pass while worn (one player); co-op: muffleCoop (the other player hears too)
  muffleCoop: 2400,
  wind: 0.09,
};

/* ---- the shadow-world grade, folded into three's tone-mapping chunk ------------------------------------------------
   A negative toneMappingExposure marks "this view wears the Ring": the tone-mapping functions use its absolute value,
   and the fragment greys towards a cold, lifted, washed-out grey. Patched once at import, before any program is
   compiled; materials without tone mapping (flames, dust motes) keep their colour. */
let patched = false;
(function patchToneMapping() {
  const C = THREE.ShaderChunk;
  const decl = 'uniform float toneMappingExposure;';
  const line = 'gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );';
  if (!C.tonemapping_pars_fragment.includes(decl) || !C.tonemapping_fragment.includes(line)) {
    console.warn('[ring] three.js tone-mapping chunks changed: the shadow-world grade is off');
    return;
  }
  const [head, tail] = C.tonemapping_pars_fragment.split(decl);
  C.tonemapping_pars_fragment = `${head}${decl}${tail.replace(/toneMappingExposure/g, 'abs( toneMappingExposure )')}`;
  C.tonemapping_fragment = C.tonemapping_fragment.replace(line, `${line}
	if ( toneMappingExposure < 0.0 ) {
		float ringL = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
		vec3 ringG = vec3( ringL ) * vec3( 0.9, 0.97, 1.06 );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, ringG, 0.88 ) * 0.86 + vec3( 0.05, 0.055, 0.06 );
	}`);
  patched = true;
})();

/* ---- materials ------------------------------------------------------------------------------------------------------ */

const uTime = { value: 0 };
const uShimmer = { value: 0 };
let shimmerMat = null;
let ghostMat = null;

/** The partner's view of an invisible wearer: only a faint, wavering rim of the skinned body (additive). */
export function shimmerMaterial() {
  if (shimmerMat) return shimmerMat;
  const m = new THREE.MeshBasicMaterial({ color: 0xc8d6e6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uShimmer = uShimmer;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vRingN;\nvarying vec3 vRingV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * ( 0.008 * sin( uTime * 7.0 + position.y * 38.0 ) );')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRingN = normalize( normalMatrix * objectNormal );\nvRingV = -mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uShimmer;\nvarying vec3 vRingN;\nvarying vec3 vRingV;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', [
        'float ringRim = 1.0 - abs( dot( normalize( vRingN ), normalize( vRingV ) ) );',
        'ringRim = ringRim * ringRim * ringRim;',
        'float ringWave = 0.65 + 0.35 * sin( uTime * 9.0 + gl_FragCoord.y * 0.07 );',
        'vec4 diffuseColor = vec4( diffuse * ringRim * ringWave * 0.16 * uShimmer, 1.0 );',
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'lyuk-ring-shimmer-v1';
  shimmerMat = m;
  return m;
}

/** The wearer's own hand and tool: pale and translucent. */
export function ghostMaterial() {
  if (!ghostMat) ghostMat = new THREE.MeshLambertMaterial({ color: 0xc4ccd6, emissive: 0x161a20, transparent: true, opacity: 0.3, depthWrite: false });
  return ghostMat;
}

/**
 * The height of a chunk's meshed surface under (x, z) nearest to y0 (vertical ray against its triangles), or null.
 * `data` is terrain.js's chunk mesh arrays { positions, indices }.
 */
function meshFloorAt(data, x, z, y0) {
  const P = data.positions;
  const I = data.indices;
  let best = null;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3;
    const b = I[t + 1] * 3;
    const c = I[t + 2] * 3;
    // Barycentric coordinates of (x, z) in the triangle's plan projection.
    const d = (P[b + 2] - P[c + 2]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 2] - P[c + 2]);
    if (Math.abs(d) < 1e-9) continue;
    const u = ((P[b + 2] - P[c + 2]) * (x - P[c]) + (P[c] - P[b]) * (z - P[c + 2])) / d;
    const v = ((P[c + 2] - P[a + 2]) * (x - P[c]) + (P[a] - P[c]) * (z - P[c + 2])) / d;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    const y = u * P[a + 1] + v * P[b + 1] + w * P[c + 1];
    if (Math.abs(y - y0) < 0.4 && (best === null || Math.abs(y - y0) < Math.abs(best - y0))) best = y;
  }
  return best;
}

/** A soft round dot for the glint (a tiny canvas texture). */
function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,240,200,0.8)');
  g.addColorStop(1, 'rgba(255,220,140,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The Ring itself: plain gold, a small band (book: "a ring of gold"). */
function ringMesh() {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0036, 10, 28), new THREE.MeshStandardMaterial({ color: 0xf0c040, metalness: 1, roughness: 0.18, emissive: 0x3a2a04 }));
  g.add(band);
  // A faint golden glint so it can be spotted in the lamplight (one point, additive).
  const pts = new THREE.BufferGeometry();
  pts.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.012], 3));
  const glint = new THREE.Points(pts, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.11, sizeAttenuation: true, transparent: true, opacity: 0.7, map: softDot(), depthWrite: false, blending: THREE.AdditiveBlending }));
  glint.frustumCulled = false;
  g.add(glint);
  g.userData.glint = glint;
  return g;
}

/* ---- the Ring ---------------------------------------------------------------------------------------------------- */

export class Ring {
  constructor(owner) {
    this.owner = owner;
    this.game = owner.game;
    /** Shared, saved: found, who found it (character id), won by the pocket riddle, seconds worn, Smaug's smell. */
    this.found = false;
    this.by = null;
    this.won = false;
    this.wornT = 0;
    this.smell = 0;
    this.ground = ringMesh();
    this.ground.name = 'ring-ground';
    this.ground.visible = false;
    this.game.scene.add(this.ground);
    this.flying = null;
    this.views = new Map(); // player → { k, edge, slot, ... }
    this.audio = null;
    this.patched = patched;
  }

  state() {
    return { found: this.found, by: this.by, won: this.won, wornT: Math.round(this.wornT), smell: Math.round(this.smell) };
  }

  restore(s) {
    if (!s) return;
    this.found = !!s.found;
    this.by = s.by || null;
    this.won = !!s.won;
    this.wornT = s.wornT || 0;
    this.smell = s.smell || 0;
  }

  get spot() {
    return this.owner.sites.ringSpot;
  }

  /** True while p wears the Ring (goblins, spiders and elves cannot see him). */
  isInvisible(p) {
    return !!p?.ringOn && p.dead <= 0;
  }

  /** The ability slot (Bilbo): put the Ring on or take it off. */
  toggle(p) {
    if (p.ch.id !== 'bilbo') return false;
    if (!this.found) return false;
    if (p.dead > 0 || p.riding || p.choosing) return true;
    p.ringOn = !p.ringOn;
    p.say(p.ringOn ? 'Felhúztad a Gyűrűt: láthatatlan vagy. Minden szürke és távoli…' : 'Lehúztad a Gyűrűt.', 2.5);
    this.owner.sound(p.ringOn ? 'ringOn' : 'ringOff', null);
    this.owner.hint(p, 'gyuru-on');
    return true;
  }

  /** Per view (terrain.cullFor's mask): the Ring on the floor shows only where its chunk can be seen. */
  cullFor(visible) {
    const s = this.spot;
    if (!s || this.found) {
      this.ground.visible = !!this.flying;
      return;
    }
    const k = chunkKey(s.x, s.y + 0.1, s.z);
    this.ground.visible = !!this.flying || k < 0 || !!visible[k];
  }

  update(dt) {
    const game = this.game;
    uTime.value += dt;
    const s = this.spot;
    // Lying on the floor: flat, the glint pulsing slowly.
    if (s && !this.found && !this.flying) {
      // On the real floor (the provider's height is the floor before its noise): walked down the density field once.
      if (this.floorFor !== s) {
        this.floorFor = s;
        this.meshFloor = false;
        this.floorY = s.y;
        if (sdf(s.x, s.y + 0.6, s.z) <= 0) {
          for (let d = 0; d < 2; d += 0.005) {
            if (sdf(s.x, s.y + 0.6 - d, s.z) > 0) {
              this.floorY = s.y + 0.6 - d;
              break;
            }
          }
        }
      }
      // On the drawn floor: the meshed surface (25 cm cells) can lie a few centimetres off the field's zero, so once
      // the chunk is meshed the floor is taken from the mesh (one ray, retried until the mesh exists).
      if (!this.meshFloor && (this.meshTry = (this.meshTry || 0) - dt) <= 0) {
        this.meshTry = 1;
        const data = this.game.terrain?.meshes?.get(chunkKey(s.x, this.floorY, s.z));
        const hit = data ? meshFloorAt(data, s.x, s.z, this.floorY) : null;
        if (hit != null) {
          this.floorY = hit;
          this.meshFloor = true;
        }
      }
      this.ground.position.set(s.x, this.floorY + 0.006, s.z);
      this.ground.rotation.set(Math.PI / 2, 0, 0.7);
      this.ground.userData.glint.material.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(uTime.value * 1.7));
      for (const p of game.players) {
        if (p.dead > 0 || p.choosing || p.riding) continue;
        if (Math.hypot(p.pos.x - s.x, p.pos.y - s.y, p.pos.z - s.z) < RING.pickup) {
          this.flying = { p, t: 0, from: this.ground.position.clone() };
          break;
        }
      }
    }
    if (this.flying) {
      const f = this.flying;
      f.t += dt / 0.7;
      const k = Math.min(1, f.t);
      const e = k * k * (3 - 2 * k);
      this.ground.position.lerpVectors(f.from, f.p.camera.position, e);
      this.ground.position.y += Math.sin(k * Math.PI) * 0.4;
      this.ground.rotation.y += dt * 9;
      if (k >= 1) {
        this.flying = null;
        this.pickedUp(f.p);
      }
    }
    // Worn time, Smaug's smell, the per-player look.
    let anyOn = false;
    game.players.forEach((p, i) => {
      if (p.ringOn && (p.ch.id !== 'bilbo' || p.dead > 0 || p.choosing)) p.ringOn = false;
      if (p.ringOn) {
        anyOn = true;
        this.wornT += dt;
        this.smell += dt;
      }
      this.look(p, i, dt);
    });
    this.updateAudio(dt, anyOn);
  }

  pickedUp(p) {
    this.found = true;
    this.by = p.ch.id;
    const bilboHere = this.game.players.some((q) => q.ch.id === 'bilbo' && !q.choosing);
    if (p.ch.id === 'bilbo') {
      p.say('Valami hideg fémes dolog a földön… egy gyűrű! Zsebre teszed.', 6);
    } else {
      p.say('Egy aranygyűrű a földön! Ezt csak Bilbó viselheti: a közös gyűjteménybe teszed.', 6);
      for (const q of this.game.players) if (q !== p && q.ch.id === 'bilbo' && !q.choosing) q.say(`${p.ch.name} gyűrűt talált: a tiéd, felhúzhatod.`, 5);
      if (!bilboHere) p.say('Bilbóként felhúzhatod majd.', 4);
    }
    this.owner.sound('ringOn', null);
    this.owner.hint(p, 'gyuru');
    this.game.saveNow?.();
  }

  /** The per-player look: the view's stretch, the vignette, the ghost hand, the shimmer for the others, the slot. */
  look(p, i, dt) {
    let v = this.views.get(p);
    const el = this.game.huds[i]?.el;
    if (!v) {
      v = { k: 0, edge: null, slot: null, root: null, fov0: p.camera.fov, slotText: null, swapped: new Map() };
      this.views.set(p, v);
    }
    if (el && v.root !== el) {
      v.root = el;
      v.edge = document.createElement('div');
      // The stretched, greyed edge of the shadow world: a cold vignette over faint radial streaks (only opacity changes).
      Object.assign(v.edge.style, {
        position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3', opacity: '0',
        background: 'radial-gradient(ellipse at center, rgba(30,34,40,0) 42%, rgba(52,58,66,0.5) 78%, rgba(18,20,24,0.92) 100%), repeating-conic-gradient(from 0deg at 50% 50%, rgba(220,228,236,0.07) 0deg 1.5deg, rgba(0,0,0,0) 1.5deg 4deg)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 30%, #000 80%)', maskImage: 'radial-gradient(ellipse at center, transparent 30%, #000 80%)',
      });
      v.slot = document.createElement('div');
      Object.assign(v.slot.style, {
        position: 'absolute', right: '1.2em', bottom: '13.2em', display: 'none', alignItems: 'center', gap: '0.4em', padding: '0.2em 0.6em 0.2em 0.3em',
        fontFamily: 'var(--f-head, Georgia, serif)', fontSize: '0.85em', color: '#f6e8c4', background: 'var(--tx-wood) center / cover, #5a3a1e',
        borderRadius: '0.25em', boxShadow: '0 0.12em 0.35em #0009', pointerEvents: 'none', zIndex: '3',
      });
      el.append(v.edge, v.slot);
      v.lastOp = -1;
    }
    const on = !!p.ringOn;
    v.k = Math.max(0, Math.min(1, v.k + (on ? dt : -dt) / RING.fade));
    const k = v.k * v.k * (3 - 2 * v.k);
    // The stretch: a wider field of view.
    const fov = v.fov0 + RING.fov * k;
    if (Math.abs(p.camera.fov - fov) > 0.01) {
      p.camera.fov = fov;
      p.camera.updateProjectionMatrix();
    }
    if (v.edge) {
      const op = Math.round(k * 20) / 20;
      if (op !== v.lastOp) {
        v.lastOp = op;
        v.edge.style.opacity = op;
      }
    }
    // The own hand and tool (and Sting's hilt) translucent; the body (seen by the others) a shimmer only.
    this.swap(p.viewTool, on, ghostMaterial(), v);
    const hilt = this.game.enemies?.sting?.views?.get(p)?.holder;
    if (hilt) this.swap(hilt, on, ghostMaterial(), v);
    this.shimmer(p, on, v);
    if (on) uShimmer.value = k;
    // The quick slot: the Ring and its key, once found (Bilbo wears it; the others see who can).
    if (v.slot) {
      const b = this.game.bindings[i];
      const key = b?.kbm === 'keys2' ? 'Á' : b?.pad != null && !b.kbm ? 'd-pad ←' : 'X';
      const text = !this.found ? '' : p.ch.id === 'bilbo' ? `${on ? 'Lehúzás' : 'Gyűrű'} — ${key}` : 'Gyűrű: csak Bilbó viselheti';
      if (text !== v.slotText) {
        v.slotText = text;
        v.slot.innerHTML = text ? `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><ellipse cx="12" cy="12" rx="8.5" ry="6.5" fill="none" stroke="#e8c050" stroke-width="2.6"/><ellipse cx="12" cy="11.2" rx="8.5" ry="6.5" fill="none" stroke="#fff0b0" stroke-width="0.8" opacity="0.7"/></svg><span>${text}</span>` : '';
        v.slot.style.display = text ? 'flex' : 'none';
        v.slot.style.opacity = p.ch.id === 'bilbo' ? '1' : '0.7';
      }
    }
  }

  /** Swaps every mesh under `root` to `mat` while `on` (remembering the originals); restores them when off. */
  swap(root, on, mat, v) {
    if (!root) return;
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (on && o.material !== mat) {
        v.swapped.set(o, o.material);
        o.material = mat;
      } else if (!on && o.material === mat && v.swapped.has(o)) {
        o.material = v.swapped.get(o);
        v.swapped.delete(o);
      }
    });
  }

  /** The body the others see: the skinned mesh draws the shimmer, everything hanging on it (tool, bag, sword) hides. */
  shimmer(p, on, v) {
    const rig = p.body?.userData?.rig;
    if (!rig?.mesh) return;
    const mesh = rig.mesh;
    if (on) {
      if (mesh.material !== shimmerMaterial()) {
        v.bodyMat = mesh.material;
        mesh.material = shimmerMaterial();
      }
      p.body.traverse((o) => {
        if (o !== mesh && (o.isMesh || o.isPoints) && o.visible) {
          o.visible = false;
          (v.hidden ||= new Set()).add(o);
        }
      });
    } else {
      if (mesh.material === shimmerMaterial()) mesh.material = v.bodyMat;
      if (v.hidden) {
        for (const o of v.hidden) o.visible = true;
        v.hidden = null;
      }
    }
  }

  /** Per view: the shadow-world grade (the exposure's sign) and a greyer fog for a wearer's own view. */
  viewFor(p, renderer, scene) {
    const v = this.views.get(p);
    const k = v ? v.k : 0;
    renderer.toneMappingExposure = this.patched && k > 0.02 ? -1 : 1;
    if (k > 0.02 && scene.fog) {
      const c = scene.fog.color;
      const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
      c.setRGB(c.r + (l * 0.95 + 0.03 - c.r) * k, c.g + (l + 0.033 - c.g) * k, c.b + (l * 1.08 + 0.038 - c.b) * k);
      renderer.setClearColor(c);
    }
  }

  /** Muffled sounds and the wind while somebody wears it (one audio output for both players: milder in co-op). */
  updateAudio(dt, anyOn) {
    if (!anyOn && !this.audio) return;
    try {
      if (!this.audio) {
        const a = sharedAudio();
        if (!a) return;
        const real = a.destination;
        const bus = a.createBiquadFilter();
        bus.type = 'lowpass';
        bus.frequency.value = 20000;
        bus.Q.value = 0.5;
        bus.connect(real);
        // Every sound connects to `a.destination` when it plays: route those through the muffle filter.
        Object.defineProperty(a, 'destination', { value: bus, configurable: true });
        const len = a.sampleRate * 2;
        const buf = a.createBuffer(1, len, a.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
          d[i] = last * 6;
        }
        const src = a.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const bp = a.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 380;
        bp.Q.value = 0.7;
        const gain = a.createGain();
        gain.gain.value = 0;
        src.connect(bp).connect(gain).connect(real);
        src.start();
        this.audio = { a, bus, bp, gain, k: 0 };
      }
      const au = this.audio;
      au.k = Math.max(0, Math.min(1, au.k + (anyOn ? dt : -dt) / RING.fade));
      const coop = this.game.players.filter((p) => !p.choosing).length > 1;
      const lo = coop ? RING.muffleCoop : RING.muffle;
      au.bus.frequency.value = 20000 * Math.pow(lo / 20000, au.k);
      au.gain.gain.value = RING.wind * au.k * (0.75 + 0.25 * Math.sin(uTime.value * 0.7));
      au.bp.frequency.value = 300 + 140 * Math.sin(uTime.value * 0.31);
    } catch {
      /* audio unavailable */
    }
  }

  /** Objects whose programs game.warmPrograms() should compile (added to the scene for one compile). */
  warmObjects() {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    g.add(new THREE.Mesh(geo, ghostMaterial()));
    return g;
  }
}
