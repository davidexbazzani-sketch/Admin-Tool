// Parla Italiano — Typen für Aufgaben und für den gespeicherten Lernstand.
import type { Dialog, Grammatik, Wort } from './inhaltTypen'

export type Faehigkeit = 'wortschatz' | 'grammatik' | 'hoeren' | 'lesen' | 'schreiben' | 'gespraech'
export const FAEHIGKEITEN: { id: Faehigkeit; name: string }[] = [
  { id: 'wortschatz', name: 'Wortschatz' },
  { id: 'grammatik', name: 'Grammatik' },
  { id: 'hoeren', name: 'Hören' },
  { id: 'lesen', name: 'Lesen' },
  { id: 'schreiben', name: 'Schreiben' },
  { id: 'gespraech', name: 'Gespräch' },
]

/** Stelle in der Tondatei eines Lerntags: w = Wort (Platz 0 … 11), d = Dialogzeile (Platz 0 …) */
export interface TonStelle { tag: number; art: 'w' | 'd'; nr: number }

interface Gewertet { id: string; f: Faehigkeit; /** Kennung des Wortes, dessen Lernstand diese Aufgabe verändert */ wort?: number }

// ── Aufgaben ohne Wertung (zeigen, erklären) ──
export interface AEinstieg { typ: 'einstieg'; id: string; tag: number; level: number; ort: string; titel: string; ziel: string; rueckblick?: string }
export interface AKarte { typ: 'karte'; id: string; wort: number; w: Wort; ton?: TonStelle }
export interface AGrammatik { typ: 'grammatik'; id: string; g: Grammatik }
export interface ADialog { typ: 'dialog'; id: string; tag: number; d: Dialog }
export interface AWissen { typ: 'wissen'; id: string; titel: string; text: string }
/** zwei Sätze aus dem Dialog laut nachsprechen (ohne Wertung — das Tool hört nicht zu) */
export interface ANachsprechen { typ: 'nachsprechen'; id: string; saetze: { it: string; de: string; ton?: TonStelle }[] }

// ── Aufgaben mit Wertung ──
export interface AAuswahl extends Gewertet {
  typ: 'auswahl'
  /** Arbeitsanweisung („Was bedeutet das?“) */
  kopf: string
  /** das Gefragte (Wort, Satz mit Lücke, Lage) */
  frage?: string
  /** Frage ist Italienisch (andere Schrift, Lautsprecher) */
  frageIt?: boolean
  /** kleiner Zusatz unter der Frage (Übersetzung, Schauplatz) */
  zusatz?: string
  ton?: TonStelle
  /** nur hören: die Frage wird nicht gezeigt, bis geantwortet ist */
  nurTon?: boolean
  /** Lesetext, auf den sich die Frage bezieht */
  text?: { titel: string; it: string }
  optionen: string[]
  richtig: number
  /** Antworten sind Italienisch */
  optIt?: boolean
  /** Erklärung nach der Antwort */
  nach?: string
}
export interface APaare extends Gewertet { typ: 'paare'; paare: { it: string; de: string; wort?: number }[] }
export interface ASatzbau extends Gewertet {
  typ: 'satzbau'
  /** der deutsche Satz, der gebaut werden soll */
  de: string
  loesung: string
  /** die Wortkacheln der Lösung in richtiger Reihenfolge */
  teile: string[]
  /** zusätzliche falsche Kacheln */
  extra: string[]
  ton?: TonStelle
}
export interface ATippen extends Gewertet {
  typ: 'tippen'
  kopf: string
  frage?: string
  /** Text vor und nach dem Eingabefeld (Lückensatz) */
  vor?: string
  nachText?: string
  zusatz?: string
  ton?: TonStelle
  nurTon?: boolean
  loesung: string
  auch?: string[]
}

export type Aufgabe = AEinstieg | AKarte | AGrammatik | ADialog | AWissen | ANachsprechen | AAuswahl | APaare | ASatzbau | ATippen
export type GewerteteAufgabe = AAuswahl | APaare | ASatzbau | ATippen
export const istGewertet = (a: Aufgabe): a is GewerteteAufgabe => a.typ === 'auswahl' || a.typ === 'paare' || a.typ === 'satzbau' || a.typ === 'tippen'

export interface Ergebnis {
  id: string
  f: Faehigkeit
  richtig: boolean
  /** Wörter, deren Lernstand sich ändert (bei Paaren mehrere) */
  woerter: { kennung: number; richtig: boolean }[]
  ms: number
}

// ── Gespeicherter Lernstand ──
export interface ItEinstellungen {
  /** Ton an (Kopfhörer!) — aus fürs Großraumbüro */
  ton: boolean
  /** Dialoge langsamer abspielen */
  langsam: boolean
  /** Schreib-Aufgaben stellen */
  tippen: boolean
  /** einmal am Tag im Tool daran erinnern, wenn die Lektion noch offen ist */
  erinnerung: boolean
  /** frühestens ab dieser Uhrzeit erinnern (HH:MM) */
  erinnerungUm: string
}

export type PruefungsTeil = 'wortschatz' | 'grammatik' | 'lesen' | 'hoeren' | 'gespraech'
export interface PruefungEintrag { level: number; am: string; r: number; n: number; teile: Partial<Record<PruefungsTeil, [number, number]>>; ok: boolean }
export type TestArt = 'tag' | 'vokabel' | 'hoeren' | 'grammatik' | 'tempo' | 'einstufung' | 'abschnitt' | 'training'
export interface TestEintrag { art: TestArt; am: string; r: number; n: number; tag?: number; titel?: string }

/** [Fach 1–5, fällig am (Tagnummer), richtig, falsch] */
export type KastenEintrag = [number, number, number, number]
/** [Aufgaben, richtig, Sekunden, Punkte] */
export type TagesWerte = [number, number, number, number]

export interface ItDaten {
  v: 1
  benutzer: string
  begonnen: string
  /** aktuelles Level 1 … 24; 25 = am Ziel */
  level: number
  /** Anzahl abgeschlossener Lerntage (0 … 120) */
  lektionen: number
  /** Lerntag → Datum, an dem die Lektion abgeschlossen wurde */
  lektionAm: Record<number, string>
  /** Lerntag → Sterne des Tagestests (0–3), der nach dieser Lektion gemacht wurde */
  sterne: Record<number, number>
  pruefungen: PruefungEintrag[]
  tests: TestEintrag[]
  kasten: Record<number, KastenEintrag>
  faehig: Record<Faehigkeit, [number, number]>
  tage: Record<string, TagesWerte>
  punkte: number
  joker: number
  jokerTage: string[]
  einstellungen: ItEinstellungen
  /** einmalige Hinweise, die schon gezeigt wurden */
  gesehen: Record<string, boolean>
  /** bestandene Abschnittsprüfungen: 'A1' | 'A2' | 'B1' → Datum */
  urkunden: Record<string, string>
  /** verdiente Abzeichen: Kennung → Datum */
  abzeichen: Record<string, string>
}

export const leereFaehig = (): Record<Faehigkeit, [number, number]> => ({ wortschatz: [0, 0], grammatik: [0, 0], hoeren: [0, 0], lesen: [0, 0], schreiben: [0, 0], gespraech: [0, 0] })

export function leereDaten(benutzer: string, am: string): ItDaten {
  return {
    v: 1, benutzer, begonnen: am, level: 1, lektionen: 0, lektionAm: {}, sterne: {}, pruefungen: [], tests: [], kasten: {},
    faehig: leereFaehig(), tage: {}, punkte: 0, joker: 0, jokerTage: [],
    einstellungen: { ton: true, langsam: false, tippen: true, erinnerung: true, erinnerungUm: '11:30' }, gesehen: {}, urkunden: {}, abzeichen: {},
  }
}

/** öffentlicher Eintrag in der Reisegruppe — mehr als das verlässt den PC nicht */
export interface GruppenEintrag { username: string; displayName: string; level: number; seit: string }
