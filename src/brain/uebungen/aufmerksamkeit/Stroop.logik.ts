// Stroop / Farbwort — reine Logik (ohne Oberfläche): Stufen, Durchgänge erzeugen, prüfen, werten.
// Die Stufen-Tabelle steht ausführlich im Kopf von Stroop.tsx.
import type { Rohergebnis } from '../../kern/typen'
import { rng, type Rng } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'
import { fuelle, jeStufe, median, mittel, msText, unterschiedMs, zeitenRichtig, zieheFolge } from './gemeinsam.logik'

export type Farbe = 'rot' | 'blau' | 'gruen' | 'gelb'
/** feste Reihenfolge = Reihenfolge der Knöpfe und Tasten */
export const FARBEN: readonly Farbe[] = ['rot', 'blau', 'gruen', 'gelb']
export const FARBWORT: Record<Farbe, string> = { rot: 'ROT', blau: 'BLAU', gruen: 'GRÜN', gelb: 'GELB' }
export const FARBTASTE: Record<Farbe, string> = { rot: 'd', blau: 'f', gruen: 'j', gelb: 'k' }

/** worauf geantwortet wird: auf die Schriftfarbe (Normalfall) oder auf das Wort */
export type StroopHinweis = 'farbe' | 'wort'

export interface StroopStufe {
  /** Anteil der Durchgänge, in denen Wort und Schriftfarbe NICHT zusammenpassen */
  inkongruent: number
  /** Antwortfrist */
  fristMs: number
  /** Anteil der Durchgänge mit Hinweis „WORT“ (0 = es gilt immer die Schriftfarbe) */
  wortAnteil: number
  /** so lange steht der Hinweis schon vor dem Wort da */
  vorlaufMs: number
}

export const STROOP_STUFEN: readonly StroopStufe[] = [
  { inkongruent: 0.30, fristMs: 3000, wortAnteil: 0, vorlaufMs: 0 },
  { inkongruent: 0.35, fristMs: 2800, wortAnteil: 0, vorlaufMs: 0 },
  { inkongruent: 0.40, fristMs: 2600, wortAnteil: 0, vorlaufMs: 0 },
  { inkongruent: 0.45, fristMs: 2400, wortAnteil: 0, vorlaufMs: 0 },
  { inkongruent: 0.50, fristMs: 2200, wortAnteil: 0, vorlaufMs: 0 },
  { inkongruent: 0.55, fristMs: 2000, wortAnteil: 0, vorlaufMs: 0 },
  { inkongruent: 0.60, fristMs: 1800, wortAnteil: 0, vorlaufMs: 0 },
  { inkongruent: 0.65, fristMs: 1800, wortAnteil: 0.3, vorlaufMs: 600 },
  { inkongruent: 0.72, fristMs: 1500, wortAnteil: 0.4, vorlaufMs: 450 },
  { inkongruent: 0.80, fristMs: 1200, wortAnteil: 0.5, vorlaufMs: 300 },
]
export const stroopStufe = (stufe: number): StroopStufe => jeStufe(STROOP_STUFEN, stufe)

/** Duell: feste Schwierigkeit, unabhängig von der Stufe — beide Spieler bekommen so genau dieselbe Folge */
export const STROOP_DUELL: StroopStufe = { inkongruent: 0.5, fristMs: 2000, wortAnteil: 0, vorlaufMs: 0 }
/** Durchgänge im Training */
export const STROOP_ANZAHL = 30

export interface StroopVersuch {
  /** das geschriebene Wort */
  wort: Farbe
  /** die Schriftfarbe */
  farbe: Farbe
  hinweis: StroopHinweis
  kongruent: boolean
  /** die richtige Antwort */
  richtig: Farbe
  /** 0..1: Länge der Pause vor dem Durchgang (damit der Einsatz nicht vorhersehbar ist) */
  zittern: number
}

/** Die richtige Antwort eines Reizes: Schriftfarbe — außer der Hinweis verlangt das Wort. */
export const stroopAntwort = (wort: Farbe, farbe: Farbe, hinweis: StroopHinweis): Farbe => (hinweis === 'wort' ? wort : farbe)

/**
 * Erzeugt n Durchgänge mit exakt dem verlangten Anteil inkongruenter Reize.
 * Regeln: jede Antwort etwa gleich oft, nie dreimal dieselbe Antwort hintereinander, nie zweimal genau
 * derselbe Reiz hintereinander. `vorher` = schon gezeigte Durchgänge (Duell: der Strom wird blockweise verlängert).
 */
export function stroopVersuche(r: Rng, p: StroopStufe, n: number, vorher: readonly StroopVersuch[] = []): StroopVersuch[] {
  const nInk = Math.round(n * p.inkongruent)
  const nKon = n - nInk
  const wInk = Math.round(nInk * p.wortAnteil)
  const wKon = Math.round(nKon * p.wortAnteil)
  const arten = r.misch<{ kongruent: boolean; hinweis: StroopHinweis }>([
    ...fuelle(nInk - wInk, { kongruent: false, hinweis: 'farbe' as const }),
    ...fuelle(wInk, { kongruent: false, hinweis: 'wort' as const }),
    ...fuelle(nKon - wKon, { kongruent: true, hinweis: 'farbe' as const }),
    ...fuelle(wKon, { kongruent: true, hinweis: 'wort' as const }),
  ])
  const davor = vorher.slice(-2)
  const artVor = (i: number) => (i >= 0 ? arten[i] : davor[davor.length + i])
  const antwortVor = (bisher: readonly Farbe[], i: number) => (i >= 0 ? bisher[i] : davor[davor.length + i]?.richtig)

  // 1) die richtigen Antworten: gleichmäßig über die vier Farben, ohne Dreierserien
  const antworten = zieheFolge(r, FARBEN, n, (f, bisher) => {
    const i = bisher.length
    const a1 = antwortVor(bisher, i - 1), a2 = antwortVor(bisher, i - 2)
    if (a1 === f && a2 === f) return false
    // zwei kongruente Reize mit derselben Antwort wären genau derselbe Reiz
    if (arten[i].kongruent && artVor(i - 1)?.kongruent && a1 === f) return false
    return true
  })

  // 2) die störende zweite Dimension
  const liste: StroopVersuch[] = []
  for (let i = 0; i < n; i++) {
    const { kongruent, hinweis } = arten[i]
    const richtig = antworten[i]
    let stoer = richtig
    if (!kongruent) {
      const letzter = liste[i - 1] ?? davor[davor.length - 1]
      const andere = FARBEN.filter(f => f !== richtig)
      const neu = andere.filter(f => {
        const wort = hinweis === 'wort' ? richtig : f, farbe = hinweis === 'wort' ? f : richtig
        return !(letzter && letzter.wort === wort && letzter.farbe === farbe)
      })
      stoer = r.aus(neu.length ? neu : andere)
    }
    liste.push({
      wort: hinweis === 'wort' ? richtig : stoer,
      farbe: hinweis === 'wort' ? stoer : richtig,
      hinweis, kongruent, richtig, zittern: r(),
    })
  }
  return liste
}

/** Endloser Strom fürs Duell: Blöcke zu je `block` Durchgängen, jeder Block aus seinem eigenen Zufalls-Zweig. */
export function stroopStrom(start: number, p: StroopStufe, mindestens: number, block = 20): StroopVersuch[] {
  const liste: StroopVersuch[] = []
  for (let b = 0; liste.length < mindestens; b++) liste.push(...stroopVersuche(rng(start).zweig(`stroop-${b}`), p, block, liste))
  return liste
}

export interface StroopMessung { kongruent: boolean; richtig: boolean; ms: number | null }

/** Stroop-Effekt: mittlere Zeit der richtigen inkongruenten minus der richtigen kongruenten Antworten (null, wenn eine Sorte fehlt). */
export function stroopEffekt(m: readonly StroopMessung[]): number | null {
  return unterschiedMs(zeitenRichtig(m.filter(x => !x.kongruent)), zeitenRichtig(m.filter(x => x.kongruent)))
}

const ergebnisText = (m: readonly StroopMessung[]): string | undefined => {
  const zeiten = zeitenRichtig(m)
  if (!zeiten.length) return undefined
  const effekt = stroopEffekt(m)
  const schnitt = `Ø ${Math.round(mittel(zeiten))} ms`
  return effekt === null ? schnitt : `Stroop-Effekt ${msText(effekt)} · ${schnitt}`
}

/**
 * Wertung im Training. Genauigkeit zählt über alle Durchgänge (zu langsam = falsch); das Tempo kommt aus dem
 * Median der richtigen Antworten, gemessen an der Frist der Stufe (volles Tempo bei etwa einem Viertel der Frist + 250 ms).
 */
export function stroopWertung(m: readonly StroopMessung[], fristMs: number): Rohergebnis {
  const zeiten = zeitenRichtig(m)
  const richtig = m.filter(x => x.richtig).length
  const tempo = tempoAus(median(zeiten), 0.25 * fristMs + 250, 0.75 * fristMs + 150)
  return {
    leistung: guete(m.length ? richtig / m.length : 0, tempo),
    richtig, gesamt: m.length,
    rtMs: zeiten.length ? Math.round(mittel(zeiten)) : undefined,
    text: ergebnisText(m),
  }
}

/** Duell-Punkte wie bei den Fragen-Übungen: +10 je richtige, −5 je falsche oder zu späte Antwort, nie unter 0 */
export const stroopDuellPunkte = (richtig: number, falsch: number): number => Math.max(0, richtig * 10 - falsch * 5)

/** Wertung im Duell: Güte aus Genauigkeit und Menge (Richtwert: eine richtige Antwort je 1,6 s). */
export function stroopDuellWertung(m: readonly StroopMessung[], dauerSek: number): Rohergebnis {
  const zeiten = zeitenRichtig(m)
  const richtig = m.filter(x => x.richtig).length
  return {
    leistung: guete(m.length ? richtig / m.length : 0, Math.min(1, richtig / Math.max(1, dauerSek / 1.6))),
    richtig, gesamt: m.length,
    rtMs: zeiten.length ? Math.round(mittel(zeiten)) : undefined,
    text: ergebnisText(m),
    duellPunkte: stroopDuellPunkte(richtig, m.length - richtig),
  }
}
