/* ==== ui/glyphs.js — the exact key / button labels of every action, per input binding (TERV 0.12 HUD, 1a F2 player) ==== */

/**
 * The device a binding is shown with: 'keys2' (the right half of the keyboard, the F2 player), 'pad' (a controller,
 * also when the mouse player took over a pad before touching the keyboard) or 'mouse' (keyboard + mouse).
 * @param {{kbm: string|null, pad: number|null}|undefined} binding entry of `game.bindings`
 */
export function deviceOf(binding) {
  if (!binding) return 'mouse';
  if (binding.kbm === 'keys2') return 'keys2';
  if (binding.pad != null) return 'pad';
  return 'mouse';
}

const k = (t) => `<span class="k${t.length > 2 ? ' kw' : ''}">${t}</span>`;
const or = '<span class="or">/</span>';
const MOUSE = (side) => `<span class="k km"><svg viewBox="0 0 16 22" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="19" rx="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1.5v7M1.5 8.5h13" stroke="currentColor" stroke-width="1.3"/>${side === 'L' ? '<path d="M2.4 8V7.6A5.6 5.6 0 0 1 7.2 2.4V8z" fill="currentColor"/>' : '<path d="M13.6 8V7.6A5.6 5.6 0 0 0 8.8 2.4V8z" fill="currentColor"/>'}</svg></span>`;
const pb = (t, cls) => `<span class="pb ${cls}">${t}</span>`;
const DPAD = (dirs) => `<span class="pb pd"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9z" fill="#2a2620" stroke="#d8ccb0" stroke-width="1.2"/>${dirs.map((d) => ({
  up: '<path d="M9.8 3.3h4.4v5.7H9.8z"/>', down: '<path d="M9.8 15h4.4v5.7H9.8z"/>', left: '<path d="M3.3 9.8h5.7v4.4H3.3z"/>', right: '<path d="M15 9.8h5.7v4.4H15z"/>',
})[d]).join('').replace(/<path /g, '<path fill="#f0d890" ')}</svg></span>`;

/** Glyph HTML per device and action. `shared` is true while an F2 player exists (the mouse player then has no arrows / Enter). */
const TABLE = {
  mouse: (shared) => ({
    dig: MOUSE('L') + or + k('F'),
    ladder: MOUSE('R') + or + k('Q'),
    climb: k('Szóköz'),
    down: k('Shift'),
    interact: k('E'),
    confirm: shared ? k('Szóköz') : k('Enter'),
    nav: k('W') + k('S'),
    browse: k('A') + k('D'),
    back: k('Esc'),
    rope: k('V'), // safety/ (NOTES-11-safety)
  }),
  keys2: () => ({
    dig: k('U'),
    ladder: k('O'),
    climb: k('j.Shift'),
    down: k('j.Ctrl'),
    interact: k('P'),
    confirm: k('Enter'),
    nav: k('↑') + k('↓'),
    browse: k('←') + k('→'),
    back: k('Backspace'),
    rope: k(','),
  }),
  pad: () => ({
    dig: pb('RT', 'pt'),
    ladder: pb('LT', 'pt') + or + pb('Y', 'py'),
    climb: pb('A', 'pa'),
    down: pb('LB', 'pt'),
    interact: pb('X', 'px'),
    confirm: pb('A', 'pa'),
    nav: DPAD(['up', 'down']),
    browse: DPAD(['left', 'right']),
    back: pb('B', 'pbb'),
    rope: DPAD(['down']),
  }),
};

/**
 * Returns all glyphs of one device as an object { dig, ladder, climb, down, interact, confirm, nav, browse, back }.
 * @param {'mouse'|'keys2'|'pad'} device
 * @param {boolean} shared an F2 player exists
 */
export function glyphs(device, shared = false) {
  return TABLE[device](shared);
}
