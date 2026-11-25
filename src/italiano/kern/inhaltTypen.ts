// Parla Italiano — Aufbau der Lerninhalte (eine JSON-Datei je Level unter ../inhalt/level-NN.json).
//
// WICHTIG: Kennungen der Einträge ergeben sich aus ihrer Position (Lerntag + Platz in der Liste).
// Der Lernstand der Benutzer hängt an diesen Kennungen — nach einer Veröffentlichung also keine
// Einträge umsortieren, einfügen oder entfernen, nur Texte verbessern.

/** Wortart: n = Nomen (immer mit Artikel), v = Verb (Grundform), a = Adjektiv/Adverb, p = Wendung/ganzer Ausdruck, x = Sonstiges (Zahl, Fragewort, Präposition …) */
export type Wortart = 'n' | 'v' | 'a' | 'p' | 'x'

export interface Paar { it: string; de: string }

export interface Wort {
  /** Italienisch; Nomen mit bestimmtem Artikel („il caffè“, „l'amico“) */
  it: string
  /** Deutsch; Nomen mit Artikel („der Kaffee“) */
  de: string
  art: Wortart
  /** Aussprachehilfe in italienischer Schreibung, Silben mit Bindestrich, betonte Silbe GROSS: „co-la-ZIO-ne“ */
  aus: string
  /** kurzer Beispielsatz mit diesem Wort */
  bsp: Paar
  /** ein passendes Emoji als Bildanker (optional) */
  emoji?: string
  /** kurzer Hinweis auf Deutsch (optional): Plural, Ausnahme, Verwechslungsgefahr */
  hinweis?: string
  /** weitere richtige italienische Schreibweisen beim Tippen (optional) */
  auch?: string[]
}

export interface GrammatikUebung {
  /** Satz mit genau einer Lücke „___“ */
  satz: string
  loesung: string
  /** genau 3 falsche Möglichkeiten */
  falsch: string[]
  /** Übersetzung des vollständigen Satzes */
  de: string
  /** ein Satz Begründung auf Deutsch (optional) */
  warum?: string
}

export interface Grammatik {
  titel: string
  /** Erklärung auf Deutsch, höchstens 800 Zeichen; **fett** und Zeilenumbrüche sind erlaubt */
  erklaerung: string
  tabelle?: { kopf: string[]; zeilen: string[][] }
  beispiele: Paar[]
  /** genau 8 Übungen */
  uebungen: GrammatikUebung[]
}

/** Feste Figuren der Geschichte + zwei freie Rollen (mit `als` benannt, z. B. „Barista“) */
export type Sprecher = 'ben' | 'giulia' | 'nonna' | 'marco' | 'sofia' | 'luca' | 'uomo' | 'donna'

export interface DialogZeile {
  wer: Sprecher
  /** Anzeigename für die freien Rollen „uomo“/„donna“ (z. B. „Barista“, „Signora“) */
  als?: string
  it: string
  de: string
}

export interface AuswahlFrage {
  frage: string
  richtig: string
  /** genau 3 falsche Antworten */
  falsch: string[]
}

export interface Rollenspiel {
  /** Lage auf Deutsch: was ist los, was möchtest du sagen? */
  lage: string
  /** die passende italienische Antwort */
  richtig: string
  /** 2 oder 3 unpassende italienische Antworten */
  falsch: string[]
  /** Übersetzung der richtigen Antwort */
  de: string
}

export interface Dialog {
  titel: string
  /** Schauplatz auf Deutsch */
  ort: string
  /** 6 bis 10 Zeilen */
  zeilen: DialogZeile[]
  /** genau 3 Verständnisfragen */
  fragen: AuswahlFrage[]
  /** 2 oder 3 Situationen */
  rollenspiel: Rollenspiel[]
  /** offene Frage am Ende der Folge, auf Deutsch („Wer ist der Mann mit dem roten Schal?“) */
  folge: string
}

export interface TagInhalt {
  /** Lerntag 1 … 120 */
  tag: number
  /** Titel auf Deutsch („Im Café bestellen“) */
  titel: string
  /** „Danach kannst du …“ */
  ziel: string
  /** genau 12 */
  woerter: Wort[]
  grammatik: Grammatik
  dialog: Dialog
  /** „Lo sapevi?“ — Wissenswertes über Italien, auf Deutsch */
  wissen: { titel: string; text: string }
}

export interface Lesetext {
  titel: string
  /** 350 bis 900 Zeichen Italienisch, nur mit dem Stoff bis zu diesem Level */
  it: string
  /** genau 4 Fragen */
  fragen: AuswahlFrage[]
}

export interface LevelInhalt {
  level: number
  /** genau 5 Lerntage */
  tage: TagInhalt[]
  pruefung: { lesetext: Lesetext }
}

export const SPRECHER: Sprecher[] = ['ben', 'giulia', 'nonna', 'marco', 'sofia', 'luca', 'uomo', 'donna']
export const WORTARTEN: Wortart[] = ['n', 'v', 'a', 'p', 'x']
export const TAGE_JE_LEVEL = 5
export const LEVEL_ANZAHL = 24
export const WOERTER_JE_TAG = 12

/** Kennung eines Wortes: Lerntag × 100 + Platz (1 … 12) */
export const wortKennung = (tag: number, platz: number): number => tag * 100 + platz
export const tagVonKennung = (kennung: number): number => Math.floor(kennung / 100)
export const levelVonTag = (tag: number): number => Math.floor((tag - 1) / TAGE_JE_LEVEL) + 1
export const ersterTag = (level: number): number => (level - 1) * TAGE_JE_LEVEL + 1
