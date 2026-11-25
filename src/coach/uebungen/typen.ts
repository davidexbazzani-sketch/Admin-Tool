// Der Coach — gemeinsame Schnittstelle der Übungsbausteine.
import type { BuchEintrag, EigeneLeiter, Ernstfall } from '../kern/typen'

export interface Ergebnis {
  /** 0..1; fehlt bei ungewerteten Schritten (Karte, Atem, Reflexion …) */
  wert?: number
  /** Selbstbewertung (zählt halb) */
  selbst?: boolean
  /** gefühlte Sicherheit 0..1 (Kalibrierung) */
  sicherheit?: number
  /** Tendenzen, die in den Antworten angeboten waren, und die gewählte */
  tendenzen?: string[]
  gewaehlt?: string
  /** etwas Geschriebenes, das ins Buch soll */
  buch?: { art: BuchEintrag['art']; text: string }
  /** Anspannung vorher/nachher (Werkzeuge) */
  wirkung?: { werkzeug: string; vorher: number; nachher: number }
  /** laute Übung übersprungen → Liste „Später laut“ */
  spaeterLaut?: string
  /** Zähler einrichten (steht dann `tage` Tage auf „Heute“) */
  zaehler?: { name: string; tage: number }
  /** Stufe 2: Ernstfall eingetragen, eigene Leiter gebaut, Werte gewählt, Lebensrad eingeschätzt */
  ernstfall?: Ernstfall
  leiter?: EigeneLeiter
  werte?: string[]
  lebensrad?: Record<string, number>
}

export interface BausteinProps<S> {
  s: S
  /** wird nach dem „Weiter“ genau einmal gerufen */
  onFertig: (e: Ergebnis) => void
  /** Übung ohne Stoppuhr (Schalter „ohne Zeitdruck“ oder Schwerpunkt Stottern) */
  ohneUhr: boolean
}
