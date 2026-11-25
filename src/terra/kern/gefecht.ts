// Terra Incognita — Gefechte im Spiel: die Stellung (gestellt, Hinterhalt, eigener Angriff), Zoll und Flucht, die
// Aufstellung des Kampfes aus dem Spielstand und was danach folgt (Beute, Kopfgeld — oder die Niederlage).
//
// Niederlage (Wunsch des Nutzers: „hart“): Das Schiff wird in den letzten Hafen geschleppt, die halbe Ladung ist weg,
// ein Zehntel des Golds ebenso, und der Rumpf ist schwer beschädigt — die Werft will für die Reparatur bezahlt werden.
// Das Schiff selbst, Karte, Atlas und Rang bleiben immer.
import { gegnerSchiffe, gegnerTitel, GEGNER_NAME, piratName, type Gegner } from '../kampf/gegner'
import { bilanz, neuerKampf, type KampfAkte } from '../kampf/kampf'
import type { Kampf, KampfStart, SchiffStart } from '../kampf/regeln'
import { gebietVon } from './gebiete'
import { wocheVon } from './piraten'
import { KLASSEN, type SchiffWerte } from './schiff'
import { kehreUm, ladungMenge, werteVon, type Spiel, type Umwelt } from './spiel'
import { CHRONIK_MAX, merkeErledigt, type KampfAusgang, type StellungArt, type TiStand } from './stand'
import { streu, streu3 } from './streu'
import { WAREN } from './waren'
import { windIn } from './wind'
import { neueSchatzkarte } from './wirkung'

const S_FLUCHT = 9601, S_KAMPF = 9602, S_BEUTE = 9603

export interface Stellung {
  art: StellungArt
  gegner: Gegner
  /** Zoll, mit dem man sich freikauft (0 = die nehmen keinen) */
  zoll: number
  /** Aussicht auf Flucht in Prozent (0 = Flucht ist hier kein Thema: eigener Angriff) */
  flucht: number
  /** der Ausguck hat den Hinterhalt rechtzeitig gesehen: kein Überfall, mehr Aussicht auf Flucht */
  gewarnt: boolean
}

/** die eigenen Schiffe für das Gefecht: das Flaggschiff und die Begleitschiffe, die noch schwimmen */
export function eigeneSchiffe(s: TiStand, w: SchiffWerte = werteVon(s)): SchiffStart[] {
  const aus: SchiffStart[] = [{
    id: 0, seite: 0, name: s.schiffName || 'Flaggschiff', art: 'segler', klasse: s.klasse, rumpf: Math.max(1, Math.min(s.rumpf, w.rumpfMax)), rumpfMax: w.rumpfMax,
    crewMax: w.crew, kanonen: w.kanonen, bewegung: w.fahrt, enter: w.enter, drehbassen: w.drehbassen, navigator: w.navigator, arzt: w.arzt, mut: 1, staerke: 0,
  }]
  s.geleit.forEach((g, i) => {
    const k = KLASSEN[g.klasse]
    if (!k || g.rumpf <= 0 || i > 1) return
    aus.push({ id: i + 1, seite: 0, name: g.name || `${k.name} ${i + 1}`, art: 'segler', klasse: g.klasse, rumpf: Math.min(g.rumpf, k.rumpf), rumpfMax: k.rumpf, crewMax: k.crew, kanonen: k.kanonen, bewegung: k.fahrt, enter: 0, drehbassen: false, navigator: false, arzt: 0, mut: 1, staerke: 0 })
  })
  return aus
}

/** Wie schnell ist der Gegner? (für die Aussicht auf Flucht) */
const gegnerFahrt = (g: Gegner, klasse: number): number => Math.max(...gegnerSchiffe(g, klasse).filter(x => x.art !== 'fort').map(x => x.bewegung), 0)

/** Zoll der Piraten: etwas weniger, als sie selbst an Beute wert wären (wächst mit der Entfernung), höchstens die halbe
 *  Kasse — die Dolmetscherin handelt ihn herunter. Mit leerer Kasse kauft man sich nicht frei. */
export function zollVon(s: TiStand, g: Gegner, w: SchiffWerte = werteVon(s)): number {
  if (g.art !== 'pirat') return 0
  const z = Math.min(quadrat(g.stufe, 40), Math.max(10, Math.floor(s.gold / 2)))
  return Math.max(1, Math.floor((z * w.zoll) / 100))
}

export function stellungFuer(spiel: Spiel, g: Gegner, art: StellungArt): Stellung {
  const s = spiel.stand, w = werteVon(s)
  const gewarnt = art === 'hinterhalt' && w.ausguck
  let flucht = 0
  if (art === 'gestellt' || art === 'hinterhalt') {
    flucht = 45 + 8 * (w.fahrt - gegnerFahrt(g, s.klasse)) + (gewarnt ? 20 : 0) - (art === 'hinterhalt' && !gewarnt ? 15 : 0) + (g.art === 'krake' ? 10 : g.art === 'schlange' ? -10 : 0)
    flucht = Math.max(10, Math.min(90, flucht))
  }
  return { art, gegner: g, zoll: art === 'gestellt' || art === 'hinterhalt' ? zollVon(s, g, w) : 0, flucht, gewarnt }
}

export type Antwort = { ok: true; text: string } | { ok: false; grund: string }

/** sich freikaufen: Der Pirat lässt einen für heute in Ruhe */
export function zahleZoll(spiel: Spiel, st: Stellung, u: Umwelt): Antwort {
  const s = spiel.stand
  if (st.zoll <= 0) return { ok: false, grund: 'Mit denen lässt sich nicht verhandeln.' }
  if (s.gold < st.zoll) return { ok: false, grund: 'So viel Gold ist nicht in der Kasse.' }
  s.gold -= st.zoll
  s.kampf.zoelle++
  merkeErledigt(s, st.gegner.id, u.tag)
  s.zug++
  return { ok: true, text: `${st.zoll} Gold wechseln den Besitzer. Die Piraten drehen grinsend ab.` }
}

/** Flucht versuchen. Gelingt sie, lässt einen dieser Gegner heute in Ruhe; sonst beginnt der Kampf mit ihm im Vorteil. */
export function versucheFlucht(spiel: Spiel, st: Stellung, u: Umwelt): boolean {
  const s = spiel.stand
  if (st.flucht <= 0) return false
  const ok = streu3(s.saat, s.zug, 91, S_FLUCHT) % 100 < st.flucht
  s.zug++
  if (ok) merkeErledigt(s, st.gegner.id, u.tag)
  return ok
}

/** Stand des großen Gegners für die Aufstellung: noch übriger und voller Lebensbalken (aus der gemeinsamen Welt) */
export interface GrossLage { rest: number; max: number }

/** Die Aufstellung eines Kampfes. `nachFlucht`: Die Flucht ist misslungen — der Gegner liegt nah und zieht zuerst. */
export function kampfStart(spiel: Spiel, st: Stellung, u: Umwelt, nachFlucht = false, gross?: GrossLage): KampfStart {
  const s = spiel.stand, g = st.gegner
  const saat = streu3(s.saat, s.zug, 93, S_KAMPF)
  const ueberfall = (st.art === 'hinterhalt' && !st.gewarnt) || nachFlucht
  const feinde = g.art === 'gross' ? gegnerSchiffe(g, s.klasse, gross?.rest ?? 1, gross?.max ?? 1) : gegnerSchiffe(g, s.klasse)
  return {
    saat, wind: windIn(gebietVon(g.q, g.r), u.tag), felsen: g.art === 'nest' ? 3 + (saat % 3) : saat % 4,
    maxRunden: g.art === 'gross' ? 6 : 12, ersterZug: ueberfall ? 1 : 0, nahe: ueberfall, schiffe: [...eigeneSchiffe(s), ...feinde],
  }
}

/** Den Kampf beginnen: Er wird sofort als „laufend“ im Spielstand vermerkt (wer das Tool mittendrin schließt, kommt
 *  nicht davon — beim nächsten Öffnen kämpft die Mannschaft ihn zu Ende). */
export function beginneKampf(spiel: Spiel, st: Stellung, u: Umwelt, nachFlucht = false, gross?: GrossLage): Kampf {
  const start = kampfStart(spiel, st, u, nachFlucht, gross)
  const k = neuerKampf(start)
  spiel.stand.kampf.laufend = { art: st.art, gegner: st.gegner, akte: { start, aktionen: [] } }
  spiel.stand.zug++
  return k
}
/** nach jedem Befehl: die Befehle im Spielstand nachtragen */
export function merkeBefehle(spiel: Spiel, k: Kampf): void {
  const l = spiel.stand.kampf.laufend
  if (l) l.akte = { start: l.akte.start, aktionen: k.aktionen.slice() }
}

export interface KampfFolge {
  ausgang: KampfAusgang
  titel: string
  text: string
  zeilen: string[]
  /** das Schiff wurde in den letzten Hafen geschleppt */
  umkehr: boolean
  /** angerichteter Schaden (großer Gegner) */
  schaden: number
  /** der große Gegner ist in diesem Kampf versunken */
  todesstoss: boolean
}

/** Beute je Stufe: wächst mit dem Quadrat der Entfernung, wie die Preise der Schiffe */
const quadrat = (stufe: number, faktor: number): number => Math.floor((faktor * (1 + stufe) * (1 + stufe)) / 2)

/** Was nach dem Kampf folgt. Räumt den laufenden Kampf ab und schreibt die Chronik.
 *  `bonus`: Prozent mehr Schaden am großen Gegner (Bündnis-Kameraden, die diese Woche mitgekämpft haben). */
export function kampfEnde(spiel: Spiel, k: Kampf, art: StellungArt, g: Gegner, u: Umwelt, bonus = 0): KampfFolge {
  const s = spiel.stand, w = werteVon(s), b = bilanz(k), zeilen: string[] = []
  s.kampf.laufend = null
  for (const [id, rumpf] of Object.entries(b.geleit)) { const i = Number(id) - 1; if (s.geleit[i]) { s.geleit[i].rumpf = rumpf; if (rumpf <= 0) zeilen.push(`Die „${s.geleit[i].name}“ ist kampfunfähig und muss in die Werft.`) } }
  let titel = '', text = '', umkehr = false, todesstoss = false
  const name = gegnerTitel(g)
  if (b.ausgang === 'niederlage') {
    const gold = Math.floor(s.gold / 10)
    s.gold -= gold
    kehreUm(spiel)
    s.rumpf = Math.max(1, Math.floor(w.rumpfMax / 10))
    s.kampf.niederlagen++
    if (g.art !== 'gross') merkeErledigt(s, g.id, u.tag)
    umkehr = true
    titel = 'Geschlagen'
    text = g.art === 'pirat' || g.art === 'nest'
      ? 'Die Piraten räumen die Kasse halb leer und werfen, was ihnen nicht gefällt, über Bord. Mit leckem Rumpf schleppt die Mannschaft das Schiff in den letzten Hafen.'
      : 'Was von dem Schiff übrig ist, treibt stundenlang, bis die Mannschaft es mit Notsegeln in den letzten Hafen bringt. Die halbe Ladung und ein Teil der Kasse liegen auf dem Meeresgrund.'
    zeilen.push(`−${gold} Gold`, 'Die halbe Ladung ist verloren', `Rumpf schwer beschädigt (${s.rumpf}/${w.rumpfMax}) – die Werft bessert ihn aus`)
  } else {
    s.rumpf = Math.max(1, Math.min(b.rumpf, w.rumpfMax))
    if (b.ausgang === 'flucht') {
      s.kampf.fluchten++
      merkeErledigt(s, g.id, u.tag)
      titel = 'Entkommen'
      text = 'Mit vollen Segeln über den Horizont. Heute sehen sie dich nicht wieder.'
    } else if (b.ausgang === 'remis') {
      merkeErledigt(s, g.id, u.tag)
      titel = g.art === 'gross' ? 'Der große Gegner zieht sich zurück' : 'Der Gegner dreht ab'
      text = g.art === 'gross' ? 'Für heute ist es genug. Jeder Treffer zählt – der Rest ist Sache der anderen Kapitäne (oder deine, morgen).' : b.geflohen.length ? 'Mit zerschossenem Rumpf macht er sich davon.' : 'Keine Seite kommt an die andere heran. Bei Einbruch der Dunkelheit verliert man sich aus den Augen.'
    } else {
      s.kampf.siege++
      merkeErledigt(s, g.id, u.tag)
      titel = 'Sieg!'
      text = beute(spiel, k, b.bezwungen.map(x => x.id), b.geentert.map(x => x.id), g, u, zeilen, w)
      todesstoss = g.art === 'gross' && b.bezwungen.some(x => x.boss)
    }
  }
  // der große Gegner: Jeder Schaden zählt, auch bei einer Niederlage
  if (g.art === 'gross') {
    const wo = wocheVon(u.tag)
    if (s.gross.w !== wo) { s.gross.vorher = s.gross.w ? [s.gross.w, s.gross.schaden, s.gross.hp, s.gross.kaempfe] : s.gross.vorher; s.gross.w = wo; s.gross.schaden = 0; s.gross.hp = 0; s.gross.kaempfe = 0 }
    if (!s.gross.kaempfe) s.gross.hp = grossAnteil(s.klasse)
    const schaden = Math.floor((b.schaden * (100 + Math.max(0, Math.min(30, bonus)))) / 100)
    s.gross.schaden += schaden
    s.gross.kaempfe++
    s.gross.tag = u.tag
    zeilen.unshift(`${schaden} Schaden am großen Gegner${schaden > b.schaden ? ` (davon ${schaden - b.schaden} Bündnis-Bonus)` : ''}`)
    const ruhm = 5 * (1 + s.klasse) + (todesstoss ? 100 * (1 + s.klasse) : 0)
    s.ruhm += ruhm
    zeilen.push(`+${ruhm} Ruhm${todesstoss ? ' – der Todesstoß!' : ''}`)
  }
  for (const x of b.bezwungen) s.kampf.versenkt[x.art === 'segler' ? 'pirat' : x.art] = (s.kampf.versenkt[x.art === 'segler' ? 'pirat' : x.art] ?? 0) + 1
  s.kampf.nr++
  s.kampf.chronik.push({ nr: s.kampf.nr, tag: u.tag, art, gegner: g, titel: name, ausgang: b.ausgang, zeilen: zeilen.slice(0, 12), akte: { start: k.start, aktionen: k.aktionen.slice() } as KampfAkte })
  while (s.kampf.chronik.length > CHRONIK_MAX) s.kampf.chronik.shift()
  s.zug++
  return { ausgang: b.ausgang, titel, text, zeilen, umkehr, schaden: b.schaden, todesstoss }
}

/** Anteil am Lebensbalken des großen Gegners, den ein Kapitän mitbringt: so viel, wie er selbst in etwa fünf Kämpfen
 *  anrichtet. Allein ist er so in einer Woche zu schaffen; mit mehr Kapitänen wird er zäher — und fällt trotzdem schneller. */
export const grossAnteil = (klasse: number): number => [17, 36, 85, 140, 245, 170, 125][Math.max(0, Math.min(6, klasse))]

function beute(spiel: Spiel, k: Kampf, bezwungen: number[], geentert: number[], g: Gegner, u: Umwelt, zeilen: string[], w: SchiffWerte): string {
  const s = spiel.stand, plus = 100 + w.beute
  let gold = 0, ruhm = 0, kopfgeld = 0, text = ''
  const wurf = (n: number, i: number): number => streu3(g.saat, s.zug, i, S_BEUTE) % n
  for (const id of bezwungen) {
    const x = k.schiffe.find(sch => sch.id === id)
    if (!x) continue
    if (x.boss) continue
    if (x.art === 'fort') { gold += quadrat(g.stufe, 250); ruhm += 60 * (1 + g.stufe); continue }
    if (x.art === 'segler') {
      let beute = Math.floor((quadrat(g.stufe, 60) * (75 + wurf(51, id))) / 100)
      if (geentert.includes(id)) {
        beute = Math.floor((beute * 3) / 2)
        // im Laderaum der Piraten: Ware, so viel Platz ist
        const ware = WAREN[Math.min(WAREN.length - 1, (streu(g.saat, id, S_BEUTE) % 6) + Math.min(5, g.stufe - 1))]
        const platz = Math.max(0, w.laderaum - ladungMenge(s)), menge = Math.min(platz, 2 + g.stufe)
        if (menge > 0) { s.ladung[ware.id] = (s.ladung[ware.id] ?? 0) + menge; zeilen.push(`+${menge} ${ware.name} aus dem Laderaum der Piraten`) }
      }
      gold += beute
      kopfgeld += quadrat(g.stufe, 30)
      ruhm += 15 * (1 + g.stufe)
    } else {
      gold += quadrat(g.stufe, 80)
      ruhm += 30 * (1 + g.stufe)
    }
  }
  gold = Math.floor((gold * plus) / 100)
  s.gold += gold
  s.ruhm += ruhm
  s.kampf.kopfgeld += kopfgeld
  if (gold) zeilen.push(`+${gold} Gold Beute`)
  if (ruhm) zeilen.push(`+${ruhm} Ruhm`)
  if (kopfgeld) zeilen.push(`${kopfgeld} Gold Kopfgeld – zahlt der Hafenmeister im nächsten Hafen`)
  if (g.art === 'pirat') {
    const n = piratName(g.saat)
    s.kampf.trophaeen[`p${g.saat}`] = n.kapitaen
    text = geentert.length ? `Die Mannschaft stürmt hinüber. ${n.kapitaen} wirft den Säbel aufs Deck – die „${n.schiff}“ gehört dir.` : `${n.kapitaen} streicht die Flagge. Was die „${n.schiff}“ an Bord hatte, wechselt den Besitzer.`
    if (wurf(4, 99) === 0 && neueSchatzkarte(s, s.q, s.r)) zeilen.push('In der Kajüte des Kapitäns: eine Schatzkarte!')
  } else if (g.art === 'nest') {
    s.kampf.trophaeen[g.id] = gegnerTitel(g)
    text = 'Die Festung schweigt, die Schiffe sind genommen. In den Höhlen hinter dem Strand liegt, was die Piraten über Jahre zusammengeraubt haben.'
    if (neueSchatzkarte(s, s.q, s.r)) zeilen.push('Unter den Papieren des Nests: eine Schatzkarte!')
  } else {
    s.kampf.trophaeen[g.art] = GEGNER_NAME[g.art]
    text = g.art === 'krake' ? 'Die Fangarme erschlaffen. Langsam sinkt der riesige Leib in die Tiefe – und an der Oberfläche treibt, was er verschlungen hatte.'
      : g.art === 'schlange' ? 'Ein letztes Aufbäumen, dann gleitet die Schlange schlaff unter den Kiel. In ihrem Nest auf der Klippe glänzt etwas.'
        : g.art === 'geist' ? 'Mit einem Seufzen, das allen durch Mark und Bein geht, löst sich das Geisterschiff im Nebel auf. Zurück bleibt eine Kiste voll altem Gold.'
          : 'Der große Gegner versinkt!'
  }
  return text
}
