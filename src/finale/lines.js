/* ==== finale/lines.js — the finale's Hungarian texts (UI strings stay Hungarian; TERV 0.8, 0.11/21–22, 0.13/6).
   Facts behind them, all from The Hobbit: the Arkenstone and Smaug (book ch. 12–13), Bard of Lake-town and the black
   arrow, the thrush that tells him of the bare patch (ch. 14), the hollow of Smaug's left breast "as bare as a snail
   out of its shell" (ch. 12, paraphrased), the Eagles (ch. 17), the auction at Bag End and the Sackville-Bagginses
   measuring the rooms while Bilbo was presumed dead (ch. 19), Bilbo's acorn (the films). Paraphrased, nothing quoted
   at length. Names as the rest of the game uses them; [ellenőrizendő] marks wording the Hungarian translation may put
   differently. ==== */

export const LINES = {
  wake: 'Szmaug felébredt! Menekülj felfelé: a hordólift, a létrák és a Sasok is kivisznek!',
  wakeBanner: 'Szmaug felébredt!',
  chase: (m) => `Szmaug a nyomodban: ${m} m`,
  chaseClose: 'Szmaug utolér! Ne állj meg!',
  chasePartner: (m) => `Szmaug a társadat üldözi (${m} m tőle)`,
  straggler: 'Lemaradtál: Szmaug most téged üldöz!',
  helpPartner: (name) => `${name} lemaradt, Szmaug őt üldözi! Menj vissza érte: a Sasok és a hordólift a melletted álló társat is viszik.`,
  outWait: 'Kijutottál! A társad még lent van: Szmaug őt üldözi.',
  patchKnown: 'Tudod: Szmaug bal mellén csupasz folt van.',
  hit: (n, burnt) => `Szmaug tüze elért! (−${n} étel)${burnt ? ` Elégett: ${burnt}.` : ''}`,
  rumble: 'Megremeg a föld… Szmaug jön a gödörből!',
  burst: 'Szmaug kitör a gödörből!',
  bardPatch: 'Bárd tudja, hol a csupasz folt: a fekete nyíl biztosan talál!',
  bardNoPatch: 'Bárd nyilai lepattannak Szmaug pikkelyeiről. Állj mellé a kertben, és kerüld el a tüzet, hogy nyugodtan célozhasson!',
  bardHelp: (s, n) => `Bárd céloz… ${s}/${n} mp — maradj mellette, és kerüld el a tüzet!`,
  bardGoGarden: 'Gyere a kertbe, Bárd mellé!',
  bounce: 'A nyíl lepattan Szmaug pikkelyeiről.',
  blackArrow: 'Bárd felajzza a fekete nyilat…',
  fall: 'A fekete nyíl a csupasz foltba csapódik. Szmaug lezuhan a domb mögé!',
  eagles: 'Megérkeztek a Sasok!',
  feast: 'Ünnep a Zöld Sárkányban: a sárkánynak vége!',
  home: (name) => `${name} hazaér Zsáklakba… és épp árverés folyik! Kiskötő-Zsákosék már a szobákat méricskélik.`,
  auctionOver: '„Nem haltam meg!” Az árverésnek vége, a holmi visszakerül. Ami még hiányzik, Zsáklakban visszaveheted.',
  garden: 'A gödör köré kert kerül, és Bilbó makkjából fa nő. Áss tovább a gyűjteményért: Szmaug helyén üres a kincstár.',
  freePlay: 'Vége a kalandnak. Szabad játék: a gyűjteményért tovább áshatsz.',
  skip: (k) => `Átugrás: ${k}`,
  thrush: 'A rigó odaröppen hozzád, és a csőrével a saját bal melle felé bök: Szmaug bal mellén, a mélyedésben hiányzik egy pikkely, ott csupasz! Ha Bárd tudja, a fekete nyíl biztosan talál.',
  thrushHint: 'A rigó elárulta Szmaug csupasz foltját (bal mellén). A fináléban Bárd fekete nyila így biztosan talál.',
  resumed: 'Szmaug még mindig a nyomodban!',
};
