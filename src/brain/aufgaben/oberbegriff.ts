// Was passt nicht? / Oberbegriff (Sprache): Wörter nach ihrer Bedeutung ordnen.
// Zwei Frageformen, gemischt:
//   • fünf Wörter, eines gehört nicht dazu  → „Welches Wort passt nicht zu den anderen?“
//   • vier Wörter und vier Oberbegriffe      → „Welcher Oberbegriff passt zu allen?“
// Die Wortgruppen sind von Hand zusammengestellt (sprachdaten/gruppen.ts); dort steht auch, welche Gruppen
// nah oder eng beieinanderliegen und warum sich kein Wort doppelt zuordnen lässt.
//
// Stufen — drei Dinge ändern sich:
//   1. der Abstand zwischen der Gruppe und dem fremden Wort:
//        fern = ganz anderes Sachgebiet (Apfel unter Möbeln)                          → Stufe 1–4
//        nah  = verwandtes Gebiet, aber leicht zu trennen (Pfanne unter Möbeln)       → Stufe 2–4
//        eng  = nur ein Merkmal trennt, das man wissen muss (Molch unter Reptilien)   → ab Stufe 4, ab Stufe 5 NUR noch
//      Anteile fern/nah/eng: Stufe 1: 100/0/0 · 2: 70/30/0 · 3: 30/70/0 · 4: 10/20/70 · ab 5: 0/0/100
//   2. die Gruppen: Lage 1 (Obst, Möbel, Farben …) auf Stufe 1–4, Lage 2 (Säugetiere, Blasinstrumente …) auf
//      Stufe 3–9, Lage 3 (Reptilien, Edelsteine, Literaturgattungen …) ab Stufe 5; Stufe 10 nur Lage 3.
//      Gefragt wird immer eine Gruppe, die einen Nachbarn im gewünschten Abstand hat.
//   3. die Wörter: bei „fern“ die gängigsten Mitglieder (Stufe 1–2 sechs, Stufe 3–4 acht); bei „eng“ zuerst die,
//      die in die Irre führen (Wal, Fledermaus, Lichtjahr), und ab Stufe 6 nur noch die weniger geläufigen
//      (die hinteren der Liste: Gneis und Porphyr statt Granit und Marmor).
// „Welcher Oberbegriff?“ macht bis Stufe 4 etwa ein Drittel aus, danach ein Viertel und nur noch bei Gruppen,
// bei denen auch das Wissen verlangt (Lage 3 oder Gruppen mit irreführenden Wörtern).
// Die Richtzeit steigt von 18 auf 27 Sekunden.
import type { Frage, FragenGenerator } from '../kern/typen'
import { T } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { GRUPPEN, NIE_ALS_OBERBEGRIFF, type Gruppe } from './sprachdaten/gruppen'

export type Abstand = 'fern' | 'nah' | 'eng'
const ABSTAENDE: Abstand[] = ['fern', 'nah', 'eng']

/** Anteil der Gruppen aus Lage 1 / 2 / 3 je Stufe */
export const LAGEN: number[][] = [
  [1, 0, 0], [1, 0, 0], [0.6, 0.4, 0], [0.15, 0.85, 0], [0, 0.75, 0.25],
  [0, 0.65, 0.35], [0, 0.5, 0.5], [0, 0.3, 0.7], [0, 0.1, 0.9], [0, 0, 1],
]
/** Anteil fern / nah / eng je Stufe (ab Stufe 5 nur eng) */
export const ABSTAND: number[][] = [
  [1, 0, 0], [0.7, 0.3, 0], [0.3, 0.7, 0], [0.1, 0.2, 0.7], [0, 0, 1],
  [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1],
]

const JE_ID = new Map(GRUPPEN.map(g => [g.id, g]))
const JE_LAGE: Gruppe[][] = [1, 2, 3].map(t => GRUPPEN.filter(g => g.t === t))
const gruppe = (id: string): Gruppe => JE_ID.get(id)!
const gross = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** nach Anteilen ziehen (verbraucht genau eine Zufallszahl) */
function ziehe(r: Rng, anteile: number[]): number {
  const x = r()
  let summe = 0, letzter = 0
  for (let i = 0; i < anteile.length; i++) {
    if (anteile[i] <= 0) continue
    letzter = i
    summe += anteile[i]
    if (x < summe) return i
  }
  return letzter
}

/** nahe Gruppen, die nicht eng sind (leicht zu trennen) */
const mittlere = (g: Gruppe): string[] => g.nah.filter(x => !g.eng.includes(x))
/** Gruppen einer Lage, die einen Nachbarn im gewünschten Abstand haben */
const passend = (lage: number, abstand: Abstand): Gruppe[] =>
  JE_LAGE[lage - 1].filter(g => (abstand === 'eng' ? g.eng.length > 0 : abstand === 'nah' ? mittlere(g).length > 0 : true))

/** alle Gruppen, die auf einer Stufe gefragt werden können */
export function vorrat(stufe: number): Gruppe[] {
  const s = klemme(Math.round(stufe), 1, 10)
  const aus = new Set<Gruppe>()
  for (let lage = 1; lage <= 3; lage++) {
    if (LAGEN[s - 1][lage - 1] <= 0) continue
    ABSTAENDE.forEach((a, i) => { if (ABSTAND[s - 1][i] > 0) passend(lage, a).forEach(g => aus.add(g)) })
  }
  return [...aus]
}
/** Gruppen aus einem anderen Sachgebiet (nur geläufige: Lage 1–2) */
const ferne = (g: Gruppe): Gruppe[] => GRUPPEN.filter(x => x.feld !== g.feld && x.t <= 2)
/** Gruppen, denen die Wörter von g sicher NICHT angehören (sie nennen g als nah) */
const naheOberbegriffe = (g: Gruppe): Gruppe[] => GRUPPEN.filter(x => x.id !== g.id && x.nah.includes(g.id))

/**
 * Vier Wörter der Gruppe zeigen.
 *   fern: nur eindeutige Wörter, auf niedrigen Stufen die gängigsten
 *   nah:  beliebige Mitglieder (die nahen Paare sind von Hand geprüft)
 *   eng:  bis zu `hoechstens` Wörter, die in die Irre führen, dazu ab Stufe 6 nur die weniger geläufigen
 *         (die letzten sechs der Liste)
 */
function vierAus(r: Rng, g: Gruppe, s: number, abstand: Abstand, fallen: string[], hoechstens: number): string[] {
  if (abstand === 'fern') {
    const klar = g.w.slice(0, g.klar)
    return r.ausN(klar.slice(0, s <= 2 ? 6 : s <= 4 ? 8 : klar.length), 4)
  }
  if (abstand === 'nah') return r.ausN(g.w, 4)
  const zuerst = r.misch([...new Set(fallen)].filter(w => g.w.includes(w))).slice(0, hoechstens)
  const rest = r.misch((s >= 6 ? g.w.slice(-6) : g.w).filter(w => !zuerst.includes(w)))
  return r.misch([...zuerst, ...rest].slice(0, 4))
}

const spaltenFuer = (woerter: string[]): number => (woerter.length <= 4 ? 2 : Math.max(...woerter.map(w => w.length)) <= 9 ? 5 : 3)

/** „Welches Wort passt nicht?“ — vier Wörter aus g, eines aus einer anderen Gruppe im gewünschten Abstand */
export function passtNicht(r: Rng, g: Gruppe, stufe: number, abstand: Abstand): Frage {
  const s = klemme(Math.round(stufe), 1, 10)
  const n = abstand === 'fern' ? r.aus(ferne(g)) : gruppe(r.aus(abstand === 'eng' ? g.eng : mittlere(g)))
  const vier = vierAus(r, g, s, abstand, g.falle?.[n.id] ?? [], 2)
  const fremd = abstand === 'fern' ? r.aus(n.w.slice(0, Math.min(n.klar, 6)))
    : abstand === 'nah' ? r.aus(n.w)
      // eng: ein Wort, das hierher zu gehören scheint – sonst (ab Stufe 6) eines der weniger geläufigen
      : r.aus(n.falle?.[g.id] ?? (s >= 6 ? n.w.slice(-5) : n.w))
  const woerter = r.misch([...vier, fremd])
  // bei nahen Gruppen das unterscheidende Merkmal dazu: erst das des fremden Wortes, dann das der Gruppe
  const merk = abstand === 'fern' ? '' : [n.merk, g.merk].filter(Boolean).join(' ')
  return {
    aufgabe: 'Welches Wort passt nicht zu den anderen?',
    optionen: woerter.map(w => T(w)),
    richtig: woerter.indexOf(fremd),
    spalten: spaltenFuer(woerter),
    erklaerung: `„${fremd}“ ist ${n.ein}, die anderen vier sind ${g.name}.${merk ? ' ' + merk : ''}`,
    zeitSek: 17 + s,
  }
}

/** „Welcher Oberbegriff passt zu allen?“ — vier Wörter aus g, vier Oberbegriffe zur Wahl */
export function oberbegriff(r: Rng, g: Gruppe, stufe: number, abstand: Abstand): Frage {
  const s = klemme(Math.round(stufe), 1, 10)
  // beim Oberbegriff verriete schon EIN gängiges Wort die Gruppe → möglichst nur irreführende Wörter zeigen
  const vier = vierAus(r, g, s, abstand, Object.values(g.falle ?? {}).flat(), 4)
  // falsche Oberbegriffe: bei nah/eng erst die geprüften Nachbarn, dann das eigene Sachgebiet, zuletzt weit entfernte
  const gesperrt = NIE_ALS_OBERBEGRIFF[g.id] ?? []
  const nahe = abstand === 'fern' ? [] : [...r.misch(naheOberbegriffe(g)), ...r.misch(GRUPPEN.filter(x => x.feld === g.feld))]
  const namen: string[] = [g.name]
  for (const x of [...nahe, ...r.misch(ferne(g))]) {
    if (namen.length < 4 && x.id !== g.id && !gesperrt.includes(x.id) && !namen.includes(x.name)) namen.push(x.name)
  }
  const gemischt = r.misch(namen)
  return {
    aufgabe: 'Welcher Oberbegriff passt zu allen?',
    zeige: { art: 'folge', teile: vier },
    optionen: gemischt.map(n => T(gross(n))),
    richtig: gemischt.indexOf(g.name),
    spalten: 2,
    erklaerung: `${vier.slice(0, 3).join(', ')} und ${vier[3]} sind ${g.name}.${abstand !== 'fern' && g.merk ? ' ' + g.merk : ''}`,
    zeitSek: 17 + s,
  }
}

export const erzeuge: FragenGenerator = (r, stufe) => {
  const s = klemme(Math.round(stufe), 1, 10)
  const lage = 1 + ziehe(r, LAGEN[s - 1])
  let abstand = ABSTAENDE[ziehe(r, ABSTAND[s - 1])]
  // eine Gruppe, die einen Nachbarn in diesem Abstand hat (gibt es in der Lage keine, eine Stufe leichter)
  let gruppen = passend(lage, abstand)
  if (!gruppen.length && abstand === 'eng') { abstand = 'nah'; gruppen = passend(lage, abstand) }
  if (!gruppen.length) { abstand = 'fern'; gruppen = passend(lage, abstand) }
  const g = r.aus(gruppen)
  const alsOberbegriff = r() < (s >= 5 ? 0.25 : 0.35) && (s < 5 || g.t === 3 || !!g.falle)
  return alsOberbegriff ? oberbegriff(r, g, s, abstand) : passtNicht(r, g, s, abstand)
}
