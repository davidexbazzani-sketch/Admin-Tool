// Brain Trainer — gemeinsame Typen (der „Vertrag“ zwischen Kern, Übungen, IQ-Test und Duellen).
// Der ganze Bereich ist eigenständig: nichts hier hängt an den IT-Funktionen des Tools.
import type { ComponentType } from 'react'
import type { Rng } from './zufall'

// ── Gebiete ───────────────────────────────────────────────────────────────────
export type Gebiet = 'logik' | 'gedaechtnis' | 'tempo' | 'aufmerksamkeit' | 'raum' | 'sprache' | 'zahlen' | 'geo' | 'raetsel'

export interface GebietInfo { id: Gebiet; name: string; satz: string }

export const GEBIETE: GebietInfo[] = [
  { id: 'logik', name: 'Logik', satz: 'Regeln erkennen und weiterdenken' },
  { id: 'gedaechtnis', name: 'Gedächtnis', satz: 'Behalten und im Kopf damit arbeiten' },
  { id: 'tempo', name: 'Tempo', satz: 'Schnell erfassen und reagieren' },
  { id: 'aufmerksamkeit', name: 'Aufmerksamkeit', satz: 'Fokus halten, Ablenkung ausblenden' },
  { id: 'raum', name: 'Raum', satz: 'Formen im Kopf drehen und falten' },
  { id: 'sprache', name: 'Sprache', satz: 'Wörter, Bedeutungen, Beziehungen' },
  { id: 'zahlen', name: 'Zahlen', satz: 'Rechnen, schätzen, kombinieren' },
  { id: 'geo', name: 'Geographie', satz: 'Länder, Hauptstädte, Lage' },
  { id: 'raetsel', name: 'Rätsel', satz: 'Knobeln und planen' },
]
export const gebietName = (g: Gebiet): string => GEBIETE.find(x => x.id === g)?.name ?? g

// ── Figuren: kleine SVG-Szenen im Raum 0..100 ─────────────────────────────────
export type Fuellung = 'voll' | 'leer' | 'halb' | 'schraffur'
export type FormTyp = 'kreis' | 'quadrat' | 'dreieck' | 'raute' | 'stern' | 'kreuz' | 'sechseck' | 'fuenfeck' | 'pfeil'
  | 'linie' | 'punkt' | 'rechteck' | 'pfad' | 'text' | 'ring'

export interface Form {
  typ: FormTyp
  /** Mittelpunkt (bei 'linie' der Anfang) */
  x: number
  y: number
  /** Größe = Durchmesser bzw. Kantenlänge (Standard 30) */
  g?: number
  /** Drehung in Grad um den Mittelpunkt */
  dreh?: number
  fuell?: Fuellung
  /** Farbton: 0 = Schrift/Linie · 1 = Akzent · 2 = zweiter Akzent · 3 = gedämpft */
  ton?: 0 | 1 | 2 | 3
  /** Strichstärke (Standard 3) */
  dick?: number
  /** 'rechteck': Breite/Höhe */
  b?: number
  h?: number
  /** 'linie': Ende */
  x2?: number
  y2?: number
  /** 'pfad': SVG-Pfad im Raum 0..100 (wird NICHT verschoben; x/y sind dann der Drehpunkt) */
  d?: string
  /** 'text' */
  text?: string
  /** an der senkrechten Achse durch den Mittelpunkt spiegeln */
  spiegel?: boolean
  /** gestrichelt zeichnen (z. B. Faltlinie) */
  strich?: boolean
  /** 'rechteck'/'quadrat' ohne abgerundete Ecken (Kästchen, die nahtlos aneinanderliegen sollen) */
  eckig?: boolean
}

export interface Szene {
  elemente: Form[]
  /** Kantenlänge des Zeichenraums (Standard 100) */
  vb?: number
}

// ── Was gezeigt wird (Aufgabe, Auswahl) ───────────────────────────────────────
export type Darstellung =
  | { art: 'text'; text: string; klein?: boolean }
  | { art: 'szene'; szene: Szene }
  /** 3×3-Matrix, null = die gesuchte Zelle */
  | { art: 'matrix'; zellen: (Szene | null)[] }
  /** Folge aus Figuren oder Texten/Zahlen, null = „?“ */
  | { art: 'folge'; teile: (Szene | string | null)[] }
  /** Schritte nebeneinander mit Pfeilen (z. B. Papier falten) */
  | { art: 'schritte'; teile: Szene[]; texte?: string[] }

export const T = (text: string): Darstellung => ({ art: 'text', text })
export const S = (szene: Szene): Darstellung => ({ art: 'szene', szene })

// ── Frage mit Auswahl oder Eingabe ────────────────────────────────────────────
export interface Frage {
  aufgabe: string
  zeige?: Darstellung
  /** Auswahl (leer bei Eingabe) */
  optionen: Darstellung[]
  /** Index der richtigen Auswahl (−1 bei Eingabe) */
  richtig: number
  /** statt Auswahl eine Zahl oder ein Wort tippen */
  eingabe?: 'zahl' | 'wort'
  /** bei Eingabe: alle gültigen Antworten (Vergleich ohne Groß/Klein und Leerzeichen) */
  loesungen?: string[]
  /** kurze Erklärung der Lösung (Training zeigt sie nach der Antwort) */
  erklaerung?: string
  /** Richtzeit je Aufgabe in Sekunden */
  zeitSek?: number
  /** Merkphase vor der Frage (Merkfähigkeit): erst zeigen, dann ausblenden */
  vorab?: { zeige: Darstellung; sek: number; hinweis?: string }
  /** Spalten der Auswahl (sonst nach Anzahl) */
  spalten?: number
}

/** Erzeugt EINE Aufgabe. Stufe 1 (leicht) … 10 (sehr schwer). Gleicher Zufall + gleiche Stufe = gleiche Aufgabe. */
export type FragenGenerator = (r: Rng, stufe: number) => Frage

// ── Übungen ───────────────────────────────────────────────────────────────────
export type IqGebiet = 'figural' | 'numerisch' | 'verbal' | 'raeumlich' | 'schluss' | 'rechnen' | 'merken'

export interface UebungMeta {
  id: string
  name: string
  gebiet: Gebiet
  /** ein Satz: worum geht es */
  kurz: string
  /** „Was wird trainiert?“ */
  trainiert: string
  /** Bedienung in einem Satz (Tasten, Klicks) */
  bedienung?: string
  /** ungefähre Dauer eines Durchgangs */
  dauer: string
  /** als Duell-Disziplin geeignet */
  duell?: boolean
  /** dauert länger (z. B. großes Sudoku) → nicht im Tages-Training */
  lang?: boolean
}

/** Was eine freie Übung (eigene Oberfläche) bekommt */
export interface FreiProps {
  stufe: number
  /** Startwert für den Zufall (im Duell für beide gleich) */
  start: number
  modus: 'training' | 'duell'
  /** nur Duell: feste Dauer in Sekunden */
  dauerSek?: number
  /** laufender Punktestand (Duell: wird dem Gegner gezeigt) */
  onPunkte?: (punkte: number) => void
  onFertig: (e: Rohergebnis) => void
}

export interface Rohergebnis {
  /** Güte des Durchgangs 0..1 (Genauigkeit × Tempo, je Übung festgelegt) */
  leistung: number
  richtig: number
  gesamt: number
  /** mittlere Reaktionszeit in ms, wenn sinnvoll */
  rtMs?: number
  /** eine Zeile fürs Ergebnis, z. B. „Spanne 7“ oder „Ø 412 ms“ */
  text?: string
  /** Duell-Punkte dieses Durchgangs (sonst richtig − falsch) */
  duellPunkte?: number
}

export interface UebungModul {
  /** Auswahl-/Eingabe-Aufgaben */
  erzeuge?: FragenGenerator
  /** eigene Oberfläche */
  Komponente?: ComponentType<FreiProps>
}

export interface KatalogEintrag extends UebungMeta {
  art: 'fragen' | 'frei'
  /** Fragen je Trainings-Durchgang (Standard 10) */
  anzahl?: number
  /** lädt das Modul erst bei Bedarf (eigenes Teilpaket) */
  lade: () => Promise<UebungModul>
}

// ── Gespeicherte Daten (nur lokal, verschlüsselt) ─────────────────────────────
export interface Lauf {
  /** Übung */
  u: string
  g: Gebiet
  /** Zeitpunkt (ISO) */
  t: string
  /** Stufe */
  s: number
  /** Brain-Punkte 0..1000 */
  p: number
  /** richtig / gesamt */
  r: number
  n: number
  /** mittlere Reaktionszeit */
  ms?: number
  /** Dauer in Sekunden */
  d: number
  /** woher: Training, Tages-Training, Duell */
  q: 'training' | 'heute' | 'duell'
}

export interface TagEintrag {
  /** Durchgänge */
  n: number
  /** Summe der Brain-Punkte */
  p: number
  /** geübte Gebiete */
  g: Gebiet[]
  /** Tages-Training geschafft */
  heute?: boolean
  /** Sekunden */
  d: number
}

export interface IqEintrag {
  t: string
  fragen: 10 | 20 | 30
  iq: number
  von: number
  bis: number
  prozentrang: number
  /** je Gebiet: richtig/gesamt und Abweichung vom eigenen Niveau (−1..+1) */
  profil: { gebiet: IqGebiet; richtig: number; gesamt: number; tendenz: number }[]
  dauerSek: number
}

export interface DuellEintrag {
  t: string
  gegner: string
  disziplin: string
  ich: number
  er: number
  /** 1 = Sieg, 0 = Unentschieden, −1 = Niederlage */
  ausgang: 1 | 0 | -1
}

export interface BrainEinstellungen {
  /** Fortschritt lokal speichern (sonst nur für diese Sitzung) */
  speichern: boolean
  ton: boolean
  /** Ziel: Trainingstage je Woche */
  wochenziel: number
}

export interface BrainDaten {
  v: 1
  benutzer: string
  angelegt: string
  einstellungen: BrainEinstellungen
  /** aktuelle Stufe je Übung */
  stufen: Record<string, number>
  /** höchste erreichte Stufe je Übung */
  hoechst: Record<string, number>
  laeufe: Lauf[]
  /** Tagesübersicht, Schlüssel JJJJ-MM-TT (Ortszeit) */
  tage: Record<string, TagEintrag>
  iq: IqEintrag[]
  duelle: DuellEintrag[]
  /** Abzeichen → Datum */
  abzeichen: Record<string, string>
  /** schon gezeigte Sprach-Aufgaben (gegen Wiederholung), je Übung die letzten Kennungen */
  gesehen: Record<string, number[]>
}

export const leereDaten = (benutzer: string, speichern: boolean): BrainDaten => ({
  v: 1, benutzer, angelegt: new Date().toISOString(),
  einstellungen: { speichern, ton: false, wochenziel: 4 },
  stufen: {}, hoechst: {}, laeufe: [], tage: {}, iq: [], duelle: [], abzeichen: {}, gesehen: {},
})

/** Ortszeit-Tag JJJJ-MM-TT */
export const tagVon = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
