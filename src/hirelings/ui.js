/* ==== hirelings/ui.js — the hiring menu's parchment (own CSS `#hire-style`, inside each player's HUD) and the
   counter row's drawing (NOTES-42-hirelings). Written only when its signature changes (hirelings/index.js drawUi). ==== */
import { COOP } from '../config.js';
import { DWARVES, HIRE, LIMIT_DEPTH } from './rules.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** A small hooded dwarf head in his hood and beard colours (viewBox 32 × 32). */
export function hoodSVG(d) {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 29V17c0-6 4-10 8-10s8 4 8 10v12z" fill="${hex(d.hood)}" stroke="#2a1608" stroke-width="1.2"/>
    <path d="M10 10c2-7 10-7 12 0l-2 3h-8z" fill="${hex(d.hood)}" stroke="#2a1608" stroke-width="1.2"/><path d="M20 7l6 7-5-2z" fill="${hex(d.hood)}" stroke="#2a1608" stroke-width="1"/>
    <circle cx="16" cy="15" r="4" fill="#d6ae8c"/><path d="M12 17c1 10 7 10 8 0l-4 2.5z" fill="${hex(d.beard)}" stroke="#2a1608" stroke-width="0.8"/></svg>`;
}

/** The counter's drawing for the row: three hooded dwarves (viewBox 100 × 100, the style of ui/art.js). */
export function rowArt() {
  const one = (d, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-14 40V12c0-11 6-18 14-18s14 7 14 18v28z" fill="${hex(d.hood)}" stroke="#1e0e04" stroke-width="2"/>
    <path d="M-10 -2c3-12 17-12 20 0l-3 5h-14z" fill="${hex(d.hood)}" stroke="#1e0e04" stroke-width="2"/><circle cx="0" cy="8" r="7" fill="#d0a888"/>
    <path d="M-7 11c2 18 12 18 14 0l-7 4z" fill="${hex(d.beard)}" stroke="#2a1a10" stroke-width="1.4"/></g>`;
  const [a, b, c] = [DWARVES[0], DWARVES[2], DWARVES[6]];
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="93" rx="40" ry="5" fill="#0006"/>${one(a, 24, 50, 0.95)}${one(c, 76, 50, 0.95)}${one(b, 50, 46, 1.05)}</svg>`;
}

export const CSS = `
.hire-menu{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(95%,36em);max-height:94%;overflow:hidden;padding:.8em 1.2em .7em;background:var(--tx-parch,#ead8b0) center/cover,#ead8b0;color:var(--ink-dark,#3a2410);border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.65),inset 0 0 28px rgba(90,58,18,.4);font-family:var(--f-text,Georgia,serif);font-size:15px;line-height:1.3;z-index:7;display:none}
.hire-menu h3{margin:0;text-align:center;font-family:var(--f-title,Georgia,serif);font-weight:normal;font-size:1.3em;color:#5a2a0a}
.hire-menu .hire-sub{text-align:center;font-style:italic;font-size:.78em;opacity:.85;margin:.1em 0 .4em}
.hire-menu .hire-purse{text-align:center;font-size:.84em;margin-bottom:.3em;color:#7a4a10}
.hire-row{display:flex;align-items:center;gap:.45em;padding:.1em .4em;border-radius:4px}
.hire-row.sel{background:rgba(90,58,18,.2)}
.hire-row.sel .hire-nm{font-weight:bold}
.hire-row svg{width:1.55em;height:1.55em;flex:none}
.hire-row .hire-job{font-size:.82em;opacity:.8;white-space:nowrap}
.hire-row .hire-st{margin-left:auto;font-size:.76em;padding:.05em .45em;border-radius:8px;white-space:nowrap;border:1px solid rgba(90,58,18,.45)}
.hire-row .hire-st.work{background:#5a7a2a;color:#f4ecd0;border-color:#3a5a14}
.hire-row .hire-st.unpaid{background:#8a2a1a;color:#f4e0d0;border-color:#5a140c}
.hire-row .hire-st.idle{background:#b8a070;color:#2a1608}
.hire-row .hire-wg{width:5.6em;text-align:right;white-space:nowrap;color:#7a4a10;font-size:.9em}
.hire-desc{margin-top:.4em;padding-top:.35em;border-top:1px solid rgba(90,58,18,.35);font-size:.82em;min-height:6.4em}
.hire-desc q{font-style:italic;color:#5a2a0a}
.hire-desc .hire-rep{margin-top:.3em;font-size:.95em;color:#4a3010}
.hire-keys{margin-top:.4em;font-size:.76em;display:flex;gap:.35em;align-items:center;justify-content:center;flex-wrap:wrap}
`;

/** The whole menu's HTML for player p (m: { sel }, k: the key glyphs). */
export function menuHtml(H, p, m, k) {
  const g = H.game;
  const rows = H.rows();
  const sel = rows[m.sel] || rows[0];
  const list = rows.map((r, j) => {
    if (r.close) return `<div class="hire-row${j === m.sel ? ' sel' : ''}"><svg viewBox="0 0 32 32"></svg><span class="hire-nm">Bezárás</span></div>`;
    const d = r.d;
    const st = H.stateOf(d);
    return `<div class="hire-row${j === m.sel ? ' sel' : ''}">${hoodSVG(d)}<span class="hire-nm">${d.name}</span><span class="hire-job">${d.jobName}</span>`
      + `<span class="hire-st ${st.key}">${st.key === 'free' ? 'szabad' : st.key === 'work' ? 'dolgozik' : st.key === 'unpaid' ? 'nincs pénz' : 'nincs munka'}</span><span class="hire-wg">${H.wageOf(d)} arany/nap</span></div>`;
  }).join('');
  let desc = '';
  let act = 'bezárás';
  if (!sel.close) {
    const d = sel.d;
    const st = H.stateOf(d);
    const hired = H.hired.has(d.id);
    act = hired ? 'elbocsátás' : `felfogadás (ma ${H.wageOf(d)} arany)`;
    desc = `<q>${d.hire}</q><br>${H.jobText(d)}${hired && st.key !== 'work' ? `<br><b>Most:</b> ${st.text}.` : ''}`;
  }
  const meal = H.mealCost();
  const daily = DWARVES.filter((d) => H.hired.has(d.id)).reduce((s, d) => s + H.wageOf(d), 0);
  const n = H.hired.size;
  const food = meal ? `étel ${n * HIRE.shifts * meal} arany (${HIRE.shifts} étkezés × ${meal})` : 'étel: Zsáklak kamrájából, ingyen';
  const coop = g.players.length > 1 ? ` · ketten: a bérek ×${COOP.price}` : '';
  const rep = H.report ? `<div class="hire-rep"><b>Legutóbbi jelentés:</b> ${H.report.text.replace(/^Reggeli jelentés: /, '')}</div>` : '';
  return `<h3>Törpék munkára</h3><div class="hire-sub">Thorin társai közül, akik épp ráérnek · csak a felső három rétegben (0–${LIMIT_DEPTH} m), ahová már leértetek · napi bér reggel előre, enni a hét étkezés idején esznek</div>`
    + `<div class="hire-purse">Közös erszény: ${g.money} arany · ${n ? `${n} törpe: napi bér ${daily} arany, ${food}` : 'most senki sem dolgozik'}${coop}</div>${list}<div class="hire-desc">${desc}${rep}</div>`
    + `<div class="hire-keys">${k.nav}<span>választás</span><i>·</i>${k.confirm}<span>${act}</span><i>·</i>${k.back}<span>bezárás</span></div>`;
}
