/* ==== ui/runes.js — Hungarian text in the Anglo-Saxon runes of Thrór's map (the book), for decoration beside the Hungarian ==== */

/** Letter → rune, as Tolkien used the Old English futhorc on Thrór's map; accents fold to the base letter. */
const MAP = {
  a: 'ᚪ', b: 'ᛒ', c: 'ᚳ', d: 'ᛞ', e: 'ᛖ', f: 'ᚠ', g: 'ᚷ', h: 'ᚻ', i: 'ᛁ', j: 'ᛄ', k: 'ᚳ', l: 'ᛚ', m: 'ᛗ', n: 'ᚾ',
  o: 'ᚩ', p: 'ᛈ', q: 'ᚳᚹ', r: 'ᚱ', s: 'ᛋ', t: 'ᛏ', u: 'ᚢ', v: 'ᚹ', w: 'ᚹ', x: 'ᛉ', y: 'ᚣ', z: 'ᛋ', ö: 'ᛟ', ü: 'ᚣ',
};
const FOLD = { á: 'a', é: 'e', í: 'i', ó: 'o', ő: 'ö', ú: 'u', ű: 'ü' };

/** Transliterates a phrase; words are separated by the runic dot ᛫ (as on the map). */
export function toRunes(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return words.map((w) => {
    let out = '';
    for (let i = 0; i < w.length; i++) {
      const pair = w.slice(i, i + 2);
      if (pair === 'th') {
        out += 'ᚦ';
        i++;
        continue;
      }
      if (pair === 'ng') {
        out += 'ᛝ';
        i++;
        continue;
      }
      const ch = FOLD[w[i]] || w[i];
      out += MAP[ch] || '';
    }
    return out;
  }).join('᛫');
}
