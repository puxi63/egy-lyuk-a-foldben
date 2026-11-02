/* ==== trolls/lines.js — the Hungarian lines of the waking trolls (NOTES-24-trolls). The troll names are the ones the
   game already uses (Bert, Tom, Vilmos; approved by the user). Gandalf's own words at dawn are not quoted (the exact
   Hungarian wording is not known here); the call is the plain "Hajnal!" of TERV 0.7. ==== */
export const TROLL_LINES = {
  stirDigger: (n) => `Kőcsikorgás… ${n} morog valamit a sötétben, a kőtrollok megmozdulnak! Hagyd abba az ásást, vagy hozz erősebb fényt!`,
  stirOther: (n) => `Kőcsikorgás a trollbarlangban: ${n} morog, a kőtrollok mocorognak!`,
  wakeDigger: (n) => `${n} felébredt, lerázza magáról a követ, és feléd csoszog! Menekülj, vagy hozz fényt!`,
  wakeOther: (n) => `${n} felébredt a trollbarlangban!`,
  purseWake: (n) => `${n} felébredt az erszény kiáltására, és utánad nyúl!`,
  lightHint: 'Az erős fény visszadermeszti.',
  callHint: (key) => `Kiálts Gandalf hangján: „Hajnal!” (${key})`,
  prompt: (key) => `„Hajnal!” — Gandalf hangja: ${key}`,
  grabbed: (n) => `${n} elkapott! Rázd le: nyomd többször az ásás gombot!`,
  grabbedOther: (n, who) => `${who}t elkapta ${n}! Hozz fényt, vagy kiálts „Hajnal!”-t!`,
  struggled: (n) => `Kiszabadultál ${n} markából!`,
  stole: (n, what) => `${n} elvette: ${what}! Ha kővé dermed, a lába elé ejti.`,
  armourSaved: (n) => `${n} a zsákodba markolt, de a páncélod megvédett.`,
  emptyBag: (n) => `${n} üres zsákot talált, és dühösen ellökött.`,
  hurt: (n) => `${n} megszorongatott! (Kihívás mód)`,
  killed: (n) => `${n} végzett veled…`,
  lightFreeze: (n) => `A fényben ${n} újra kővé dermed.`,
  callSelf: 'Gandalf hangján kiáltasz: „Hajnal!” — a trollok kővé dermednek, és egy jó darabig úgy is maradnak.',
  callOther: (who) => `${who} Gandalf hangján kiált: „Hajnal!” — a trollok kővé dermednek.`,
  sunrise: 'Felvirradt: a trollok kővé dermednek.',
  shopLabel: 'Gandalf hangja: „Hajnal!” a trollbarlangban',
  bought: 'Gandalf hangja a tiétek: ha a trollbarlangban mocorognak a trollok, kiálts: „Hajnal!” (a használat gombja), és kővé dermednek.',
};
