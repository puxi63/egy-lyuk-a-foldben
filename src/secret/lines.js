/* ==== secret/lines.js — the secret ending's Hungarian texts (UI strings stay Hungarian; TERV 0.11/10, NOTES-22-secret).
   Facts behind them: Thrór, King under the Mountain, and his son Thráin escaped when Smaug came; Thrór made the map of
   the Mountain with its secret door, and the key went with it (The Hobbit ch. 1, Thorin's tale and Gandalf's map); the
   Arkenstone, the Heart of the Mountain (ch. 13), set above the King's throne (the films); "There and Back Again", the
   book's subtitle; the closing scene: some years later, one autumn evening, Gandalf and Balin visit Bilbo at Bag End
   while he writes his memoirs, Balin's beard longer and his belt splendid, Dale and the Lake prosper, the old songs came
   true after a fashion, Gandalf calls Bilbo "only quite a little fellow in a wide world", Bilbo laughs and hands him the
   tobacco-jar (ch. 19). Everything paraphrased, nothing quoted at length. ==== */

export const LINES = {
  prompt: 'Lezárt kőajtó',
  promptThrone: 'Thrór trónja',
  sealed: (n, names) => `Thrór jele a kőbe vésve. Az ajtó meg sem moccan: még ${n} híres lelet hiányzik (${names}).`,
  notNow: 'Az ajtó most nem nyílik: előbb meneküljetek Szmaug elől!',
  opening: 'Minden híres lelet hazakerült… Thrór jele felizzik a kövön, és az ajtó mélyen morajlik.',
  openingPartner: (name) => `${name} megérintette Thrór jelét: megnyílik egy rejtett ajtó a kincstárban!`,
  opened: 'Megnyílt a rejtett kamra: Thrór régi trónterme.',
  enter: 'Thrór trónterme. A trón előtt állva használd a gombot.',
  seenThrone: 'Thrór trónja. A Hegy alatti Király helye üres, a titka már a tiétek.',
  skip: (k) => `Tovább: ${k}`,
  /** The throne: Thrór, the empty setting, the carved stone's last secret. */
  throne: [
    'Thrór trónterme. Itt ült egykor Thrór, a Hegy alatti Király, mielőtt eljött a sárkány.',
    'A trón fölött üres a foglalat: itt ragyogott az Arkenkő, a Hegy Szíve. Most Zsáklak vitrinjében fénylik.',
    'A kőbe vésett rúnák Thrór utolsó titkáról szólnak: amikor Szmaug lecsapott, Thrór és a fia, Thráin megmenekült, és elhagyta a Hegyet.',
    'Thrór megrajzolta a Hegy térképét a titkos ajtóval, és hozzá hagyta a kulcsot, hogy az örökösei egyszer hazatérhessenek. Oda és vissza: a történet véget ért.',
  ],
  /** After the credits: Bag End, years later (book ch. 19, paraphrased). */
  closing: [
    'Évekkel később, egy őszi estén Bilbó Zsáklakban az emlékiratait írta, amikor megszólalt a csengő.',
    'Gandalf és Balin állt az ajtóban. Balin szakálla jóval hosszabb lett, és pompás, ékköves övet viselt.',
    'Elmesélték, hogy Völgy újra él, a Hegy és a Tó népe gazdagon, barátságban él, és a régi dalok jóslatai a maguk módján valóra váltak.',
    'Gandalf elmosolyodott: Bilbó nagyszerű hobbit, de azért csak egy egészen kicsi valaki ebben a tágas világban.',
    'Bilbó nevetett, hogy hála az égnek, és odanyújtotta Gandalfnak a dohányos bödönt.',
  ],
  end: 'Vége. Szabad játék: Zsáklak, a gödör és a kincstár a tiétek.',
};
