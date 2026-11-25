// Schlussfolgern: Was folgt zwingend aus den Aussagen? (logisches Denken mit Sprache)
//
// Drei Aufgabenarten:
//   Reihenfolge  – „Anna ist größer als Ben. Ben ist größer als Cem. Wer ist am kleinsten?“
//   Syllogismus  – „Alle Zorfe sind Blimse. Alle Blimse sind Kwatten. Was folgt?“ (Kunstwörter,
//                  damit kein Vorwissen hilft oder stört)
//   Bedingung    – „Wenn …, dann … . Gegeben: … . Was folgt?“ (auch die beiden klassischen Fehlschlüsse)
//
// Stufe 1–2: drei Personen · 3–4: vier · 5: fünf · 6: einfache Syllogismen ·
// 7: Reihenfolgen, bei denen sich die Antwort manchmal NICHT bestimmen lässt · 8: schwierigere
// Syllogismen und einfache Bedingungen · 9: alle vier Bedingungsfälle · 10: ungültige Schlüsse
// erkennen und Bedingungsketten.
import type { Darstellung, Frage, FragenGenerator } from '../kern/typen'
import { T } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'

const NAMEN = ['Anna', 'Ben', 'Clara', 'David', 'Emma', 'Felix', 'Greta', 'Hannes', 'Ida', 'Jonas', 'Lena', 'Max', 'Nina', 'Paul', 'Ronja', 'Tim']
const UNKLAR = 'Lässt sich nicht sicher sagen'

interface Vergleich { mehr: string; weniger: string; meist: string; wenigst: string; zweit: string }
const VERGLEICHE: Vergleich[] = [
  { mehr: 'größer', weniger: 'kleiner', meist: 'am größten', wenigst: 'am kleinsten', zweit: 'am zweitgrößten' },
  { mehr: 'älter', weniger: 'jünger', meist: 'am ältesten', wenigst: 'am jüngsten', zweit: 'am zweitältesten' },
  { mehr: 'schneller', weniger: 'langsamer', meist: 'am schnellsten', wenigst: 'am langsamsten', zweit: 'am zweitschnellsten' },
  { mehr: 'schwerer', weniger: 'leichter', meist: 'am schwersten', wenigst: 'am leichtesten', zweit: 'am zweitschwersten' },
]

const zeit = (stufe: number) => 40 + stufe * 6

// ── Reihenfolge ───────────────────────────────────────────────────────────────
function reihenfolge(r: Rng, stufe: number, mitUnklar: boolean): Frage {
  const n = stufe <= 2 ? 3 : stufe <= 4 ? 4 : stufe === 5 ? 5 : r.int(4, 5)
  const v = r.aus(VERGLEICHE)
  const ordnung = r.ausN(NAMEN, n)            // ordnung[0] ist am größten/ältesten/…
  // Paare: normal die Nachbarn der Kette
  let paare: [number, number][] = Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as [number, number])
  let luecke = -1
  if (mitUnklar && r.chance(0.6)) {
    // eine Verbindung „umhängen“: statt (i > i+1) nur (i−1 > i+1) → i und i+1 sind untereinander nicht mehr vergleichbar
    luecke = r.int(1, n - 2)
    paare = paare.map(p => (p[0] === luecke ? [luecke - 1, luecke + 1] as [number, number] : p))
  }
  const umgekehrtAnteil = stufe <= 1 ? 0 : 0.5
  let saetze = paare.map(([a, b]) => (r.chance(umgekehrtAnteil)
    ? `${ordnung[b]} ist ${v.weniger} als ${ordnung[a]}.`
    : `${ordnung[a]} ist ${v.mehr} als ${ordnung[b]}.`))
  if (stufe >= 2) saetze = r.misch(saetze)

  // Frage wählen
  type Art = 'meist' | 'wenigst' | 'zweit' | 'mitte'
  const arten: Art[] = stufe <= 3 ? ['meist', 'wenigst'] : n === 5 ? ['meist', 'wenigst', 'zweit', 'mitte'] : ['meist', 'wenigst', 'zweit']
  const art = r.aus(arten)
  const frageText: Record<Art, string> = {
    meist: `Wer ist ${v.meist}?`, wenigst: `Wer ist ${v.wenigst}?`, zweit: `Wer ist ${v.zweit}?`, mitte: 'Wer steht genau in der Mitte der Reihenfolge?',
  }
  // Antwort bestimmen: mit Lücke sind nur bestimmte Fragen noch eindeutig
  // gefragte Stelle (0 = ganz vorn); „am wenigsten“ = letzte Stelle
  const stelle = art === 'meist' ? 0 : art === 'zweit' ? 1 : art === 'mitte' ? 2 : n - 1
  let antwort: string
  if (luecke < 0) {
    antwort = ordnung[stelle]
  } else {
    // bekannt: 0 > 1 > … > luecke−1, dazu luecke−1 > luecke und luecke−1 > luecke+1 > … > n−1.
    // Damit stehen die ersten `luecke` Stellen fest. Dahinter kann ordnung[luecke] überall liegen —
    // jede spätere Stelle (auch die letzte) lässt sich nicht bestimmen.
    antwort = stelle <= luecke - 1 ? ordnung[stelle] : UNKLAR
  }
  const namen = r.misch(ordnung)
  const optionen: Darstellung[] = namen.map(T)
  if (mitUnklar) optionen.push(T(UNKLAR))
  const richtig = antwort === UNKLAR ? optionen.length - 1 : namen.indexOf(antwort)
  const erkl = luecke < 0
    ? `Reihenfolge von „${v.meist}“ bis „${v.wenigst}“: ${ordnung.join(' – ')}.`
    : antwort === UNKLAR
      ? `${ordnung[luecke]} und ${ordnung[luecke + 1]} sind beide ${v.weniger} als ${ordnung[luecke - 1]} — wie sie zueinander stehen, sagt keine Aussage. Deshalb lässt sich das nicht sicher sagen.`
      : `Sicher ist: ${ordnung.slice(0, luecke).join(' – ')} stehen vorn; nur ${ordnung[luecke]} lässt sich darunter nicht genau einordnen. Die gefragte Stelle ist trotzdem eindeutig: ${antwort}.`
  return { aufgabe: frageText[art], zeige: T(saetze.join('\n')), optionen, richtig, spalten: optionen.length <= 4 ? optionen.length : 3, erklaerung: erkl, zeitSek: zeit(stufe) }
}

// ── Syllogismen mit Kunstwörtern ──────────────────────────────────────────────
const KUNST = ['Zorfe', 'Blimse', 'Kwatten', 'Mulpen', 'Drasken', 'Wibbel', 'Glonten', 'Tarven', 'Plisten', 'Norken', 'Hulpen', 'Simmel']
const alle = (a: string, b: string) => `Alle ${a} sind ${b}.`
const keine = (a: string, b: string) => `Keine ${a} sind ${b}.`
const einige = (a: string, b: string) => `Einige ${a} sind ${b}.`
const einigeNicht = (a: string, b: string) => `Einige ${a} sind keine ${b}.`
const NICHTS = 'Keine dieser Aussagen folgt zwingend'

interface Syl { name: string; p: (a: string, b: string, c: string) => string[]; folgt: ((a: string, b: string, c: string) => string) | null; falsch: ((a: string, b: string, c: string) => string)[]; warum: string }
const SYL: Syl[] = [
  { name: 'barbara', p: (a, b, c) => [alle(a, b), alle(b, c)], folgt: (a, _b, c) => alle(a, c), falsch: [(a, _b, c) => alle(c, a), (a, _b, c) => keine(a, c), (a, _b, c) => einigeNicht(a, c)], warum: 'Wer zur ersten Gruppe gehört, gehört zur zweiten — und damit auch zur dritten. Umkehren darf man das nicht.' },
  { name: 'celarent', p: (a, b, c) => [alle(a, b), keine(b, c)], folgt: (a, _b, c) => keine(a, c), falsch: [(a, _b, c) => alle(a, c), (a, _b, c) => einige(a, c), (_a, b, c) => alle(c, b)], warum: 'Die erste Gruppe steckt ganz in der zweiten, und die zweite hat mit der dritten nichts gemeinsam.' },
  { name: 'darii', p: (a, b, c) => [einige(a, b), alle(b, c)], folgt: (a, _b, c) => einige(a, c), falsch: [(a, _b, c) => alle(a, c), (a, _b, c) => keine(a, c), (a, _b, c) => alle(c, a)], warum: 'Die „einigen“ aus der ersten Aussage gehören zur zweiten Gruppe und damit auch zur dritten. Über die übrigen weiß man nichts.' },
  { name: 'ferio', p: (a, b, c) => [einige(a, b), keine(b, c)], folgt: (a, _b, c) => einigeNicht(a, c), falsch: [(a, _b, c) => keine(a, c), (a, _b, c) => alle(a, c), (a, _b, c) => alle(c, a)], warum: 'Die „einigen“ aus der ersten Aussage gehören zu einer Gruppe, die mit der dritten nichts gemeinsam hat. Über die übrigen weiß man nichts.' },
  { name: 'camestres', p: (a, b, c) => [alle(c, b), keine(a, b)], folgt: (a, _b, c) => keine(a, c), falsch: [(a, _b, c) => alle(a, c), (a, _b, c) => einige(a, c), (_a, b, c) => alle(b, c)], warum: 'Alles aus der einen Gruppe liegt in der mittleren, die andere Gruppe berührt die mittlere nie — also berühren sich die beiden auch nicht.' },
  { name: 'baroco', p: (a, b, c) => [alle(c, b), einigeNicht(a, b)], folgt: (a, _b, c) => einigeNicht(a, c), falsch: [(a, _b, c) => keine(a, c), (a, _b, c) => alle(a, c), (a, _b, c) => einige(a, c)], warum: 'Wer nicht zur mittleren Gruppe gehört, kann auch nicht zu der Gruppe gehören, die ganz in ihr liegt.' },
  // ungültige Paare: nichts folgt
  { name: 'mitte', p: (a, b, c) => [alle(a, b), alle(c, b)], folgt: null, falsch: [(a, _b, c) => alle(a, c), (a, _b, c) => einige(a, c), (a, _b, c) => keine(a, c)], warum: 'Beide Gruppen liegen in derselben größeren Gruppe — ob sie sich überschneiden, bleibt offen.' },
  { name: 'einige2', p: (a, b, c) => [einige(a, b), einige(b, c)], folgt: null, falsch: [(a, _b, c) => einige(a, c), (a, _b, c) => alle(a, c), (a, _b, c) => keine(a, c)], warum: 'Die „einigen“ der ersten Aussage müssen nicht dieselben sein wie die der zweiten.' },
]

function syllogismus(r: Rng, stufe: number, namen: string[]): Frage {
  const gewaehlt = r.aus(namen)
  const form = SYL.find(s => s.name === gewaehlt) as Syl
  const [a, b, c] = r.ausN(KUNST, 3)
  const praemissen = form.p(a, b, c)
  const richtigText = form.folgt ? form.folgt(a, b, c) : NICHTS
  const aussagen = r.misch([...(form.folgt ? [form.folgt(a, b, c)] : []), ...form.falsch.map(f => f(a, b, c))])
  // „Keine dieser Aussagen folgt“ steht immer als letzte Auswahl da, sobald ungültige Formen im Spiel sind
  const mitNichts = !form.folgt || stufe >= 9
  const texte = mitNichts ? [...aussagen.slice(0, form.folgt ? 3 : 3), NICHTS] : aussagen
  // bei gültiger Form mit „Nichts“-Auswahl: sicherstellen, dass die richtige Aussage unter den dreien ist
  if (form.folgt && mitNichts && !texte.includes(richtigText)) texte[0] = richtigText
  return {
    aufgabe: 'Was folgt zwingend aus den beiden Aussagen?',
    zeige: T(praemissen.join('\n')),
    optionen: texte.map(T), richtig: texte.indexOf(richtigText), spalten: 2,
    erklaerung: `${form.warum} Richtig: „${richtigText}“.`,
    zeitSek: zeit(stufe) + 10,
  }
}

// ── Bedingungen ───────────────────────────────────────────────────────────────
interface Bed { wenn: string; dann: string; p: string; nichtP: string; q: string; nichtQ: string }
const BED: Bed[] = [
  { wenn: 'die Lampe grün leuchtet', dann: 'ist die Maschine bereit', p: 'Die Lampe leuchtet grün.', nichtP: 'Die Lampe leuchtet nicht grün.', q: 'Die Maschine ist bereit.', nichtQ: 'Die Maschine ist nicht bereit.' },
  { wenn: 'es regnet', dann: 'ist der Hof nass', p: 'Es regnet.', nichtP: 'Es regnet nicht.', q: 'Der Hof ist nass.', nichtQ: 'Der Hof ist nicht nass.' },
  { wenn: 'die Tür offen steht', dann: 'ertönt ein Signal', p: 'Die Tür steht offen.', nichtP: 'Die Tür steht nicht offen.', q: 'Es ertönt ein Signal.', nichtQ: 'Es ertönt kein Signal.' },
  { wenn: 'Mia Frühdienst hat', dann: 'fährt sie mit dem Rad', p: 'Mia hat Frühdienst.', nichtP: 'Mia hat keinen Frühdienst.', q: 'Mia fährt mit dem Rad.', nichtQ: 'Mia fährt nicht mit dem Rad.' },
  { wenn: 'der Tank leer ist', dann: 'blinkt die Anzeige', p: 'Der Tank ist leer.', nichtP: 'Der Tank ist nicht leer.', q: 'Die Anzeige blinkt.', nichtQ: 'Die Anzeige blinkt nicht.' },
  { wenn: 'eine Karte rot ist', dann: 'trägt sie eine gerade Zahl', p: 'Die Karte ist rot.', nichtP: 'Die Karte ist nicht rot.', q: 'Die Karte trägt eine gerade Zahl.', nichtQ: 'Die Karte trägt keine gerade Zahl.' },
  { wenn: 'Tom den Bus verpasst', dann: 'kommt er zu spät', p: 'Tom verpasst den Bus.', nichtP: 'Tom verpasst den Bus nicht.', q: 'Tom kommt zu spät.', nichtQ: 'Tom kommt nicht zu spät.' },
  { wenn: 'das Fenster gekippt ist', dann: 'läuft die Heizung nicht', p: 'Das Fenster ist gekippt.', nichtP: 'Das Fenster ist nicht gekippt.', q: 'Die Heizung läuft nicht.', nichtQ: 'Die Heizung läuft.' },
]
type Fall = 'mp' | 'mt' | 'ac' | 'da'

function bedingung(r: Rng, stufe: number, faelle: Fall[]): Frage {
  const b = r.aus(BED)
  const fall = r.aus(faelle)
  const regel = `Wenn ${b.wenn}, dann ${b.dann}.`
  const gegeben = fall === 'mp' ? b.p : fall === 'mt' ? b.nichtQ : fall === 'ac' ? b.q : b.nichtP
  // gefragt wird nach dem jeweils ANDEREN Teil
  const ja = fall === 'mp' || fall === 'da' ? b.q : b.p
  const nein = fall === 'mp' || fall === 'da' ? b.nichtQ : b.nichtP
  const richtigText = fall === 'mp' ? b.q : fall === 'mt' ? b.nichtP : UNKLAR
  const texte = [...r.misch([ja, nein]), UNKLAR]
  const warum: Record<Fall, string> = {
    mp: 'Die Bedingung ist erfüllt, also tritt die Folge ein.',
    mt: 'Die Folge ist ausgeblieben — dann kann die Bedingung nicht erfüllt gewesen sein, sonst wäre die Folge eingetreten.',
    ac: 'Die Folge kann auch einen anderen Grund haben. Aus „wenn A, dann B“ folgt nicht „wenn B, dann A“.',
    da: 'Die Regel sagt nur, was passiert, WENN die Bedingung erfüllt ist. Ist sie es nicht, bleibt die Folge offen.',
  }
  return {
    aufgabe: 'Was folgt sicher?',
    zeige: T(`${regel}\nGegeben: ${gegeben}`),
    optionen: texte.map(T), richtig: texte.indexOf(richtigText), spalten: 3,
    erklaerung: `${warum[fall]} Richtig: „${richtigText}“.`,
    zeitSek: zeit(stufe),
  }
}

// Ketten: Wenn A, dann B. Wenn B, dann C.
interface Kette { a: string; b: string; c: string; A: string; nichtA: string; C: string; nichtC: string }
const KETTEN: Kette[] = [
  { a: 'der Schalter gedrückt ist', b: 'läuft die Pumpe', c: 'steigt der Druck', A: 'Der Schalter ist gedrückt.', nichtA: 'Der Schalter ist nicht gedrückt.', C: 'Der Druck steigt.', nichtC: 'Der Druck steigt nicht.' },
  { a: 'Lea die Prüfung besteht', b: 'bekommt sie die Stelle', c: 'zieht sie um', A: 'Lea besteht die Prüfung.', nichtA: 'Lea besteht die Prüfung nicht.', C: 'Lea zieht um.', nichtC: 'Lea zieht nicht um.' },
  { a: 'die Sonne scheint', b: 'öffnet das Café die Terrasse', c: 'spielt dort Musik', A: 'Die Sonne scheint.', nichtA: 'Die Sonne scheint nicht.', C: 'Auf der Terrasse spielt Musik.', nichtC: 'Auf der Terrasse spielt keine Musik.' },
  { a: 'der Sensor Rauch meldet', b: 'schließt die Brandschutztür', c: 'leuchtet die Warnlampe', A: 'Der Sensor meldet Rauch.', nichtA: 'Der Sensor meldet keinen Rauch.', C: 'Die Warnlampe leuchtet.', nichtC: 'Die Warnlampe leuchtet nicht.' },
]
// zweiter Satz mit richtiger Wortstellung: „Wenn die Pumpe läuft, dann steigt der Druck.“
const KETTE_B_WENN: string[] = ['die Pumpe läuft', 'Lea die Stelle bekommt', 'das Café die Terrasse öffnet', 'die Brandschutztür schließt']

function kette(r: Rng, stufe: number): Frage {
  const i = r.int(0, KETTEN.length - 1)
  const k = KETTEN[i]
  const fall = r.aus(['vor', 'rueck', 'falsch'] as const)
  const regeln = [`Wenn ${k.a}, dann ${k.b}.`, `Wenn ${KETTE_B_WENN[i]}, dann ${k.c}.`]
  const gegeben = fall === 'vor' ? k.A : fall === 'rueck' ? k.nichtC : k.C
  const ja = fall === 'vor' ? k.C : k.A
  const nein = fall === 'vor' ? k.nichtC : k.nichtA
  const richtigText = fall === 'vor' ? k.C : fall === 'rueck' ? k.nichtA : UNKLAR
  const texte = [...r.misch([ja, nein]), UNKLAR]
  const warum = fall === 'vor' ? 'Eine Bedingung löst die nächste aus: aus dem Anfang folgt das Ende der Kette.'
    : fall === 'rueck' ? 'Rückwärts gedacht: Fehlt die letzte Folge, kann auch der Schritt davor nicht eingetreten sein — und damit auch der erste nicht.'
      : 'Die letzte Folge kann auch einen anderen Grund haben. Rückwärts darf man aus einer eingetretenen Folge nicht auf die Bedingung schließen.'
  return {
    aufgabe: 'Was folgt sicher?',
    zeige: T(`${(r.chance(0.5) ? regeln : regeln.slice().reverse()).join('\n')}\nGegeben: ${gegeben}`),
    optionen: texte.map(T), richtig: texte.indexOf(richtigText), spalten: 3,
    erklaerung: `${warum} Richtig: „${richtigText}“.`,
    zeitSek: zeit(stufe) + 10,
  }
}

export const erzeuge: FragenGenerator = (r, stufeRoh) => {
  const s = klemme(Math.round(stufeRoh), 1, 10)
  if (s <= 5) return reihenfolge(r, s, false)
  if (s === 6) return syllogismus(r, s, ['barbara', 'celarent'])
  if (s === 7) return reihenfolge(r, s, true)
  if (s === 8) return r.chance(0.5) ? syllogismus(r, s, ['darii', 'ferio', 'camestres']) : bedingung(r, s, ['mp', 'mt'])
  if (s === 9) return r.chance(0.6) ? bedingung(r, s, ['mp', 'mt', 'ac', 'da']) : syllogismus(r, s, ['baroco', 'mitte', 'camestres', 'ferio'])
  const wahl = r.int(0, 2)
  return wahl === 0 ? syllogismus(r, s, ['mitte', 'einige2', 'baroco', 'darii']) : wahl === 1 ? kette(r, s) : bedingung(r, s, ['mt', 'ac', 'da'])
}
