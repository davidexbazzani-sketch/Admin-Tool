// Der Coach — Aufbau der Inhalte (alles, was in src/coach/inhalt/ liegt).
// Regeln fürs Schreiben: src/coach/inhalt/LIESMICH.md. Geprüft von scripts/coach-pruefe.mjs.
//
// KENNUNGEN SIND EINGEFROREN, sobald sie ausgeliefert sind: Der Lernstand hängt daran. Nie umbenennen, nie neu vergeben,
// nie löschen (stattdessen `entfallen: true`). Die Reihenfolge des Kurses steht allein im Kursplan, nie in der Kennung.

export const BEREICHE = ['aussprache', 'stimme', 'ausdruck', 'gespraech', 'ueberzeugen', 'smalltalk', 'konter',
  'stegreif', 'lesen', 'ruhe', 'mut', 'selbst', 'antrieb', 'flirten'] as const
export type BereichId = typeof BEREICHE[number]
export const SCHWERPUNKTE = ['nuscheln', 'lispeln', 'stottern'] as const
/** wählbare Zusätze im Bereich aussprache */
export type SchwerpunktId = typeof SCHWERPUNKTE[number]
export type Spur = 'kern' | SchwerpunktId
/** Kurs = Bereich + Spur, z. B. "konter" oder "aussprache/stottern" */
export type KursId = string
export const kursId = (b: BereichId, spur: Spur = 'kern'): KursId => (spur === 'kern' ? b : `${b}/${spur}`)
export function kursTeile(k: KursId): { bereich: BereichId; spur: Spur } {
  const [b, s] = k.split('/')
  return { bereich: b as BereichId, spur: (s as SchwerpunktId) || 'kern' }
}

/** A belegt · B gestützt · P Praxiswissen · D Denkmodell · U umstritten oder Mythos */
export type Beleg = 'A' | 'B' | 'P' | 'D' | 'U'
export type Ton = 'ruhig' | 'klar' | 'trocken'
export type Kanal = 'wissen' | 'koennen'
/** fair = wirkt auch durchschaut · taktik = nutzt bekannte Wirkungen ohne Lüge · rot = nur erkennen und abwehren */
export type EinflussKlasse = 'fair' | 'taktik' | 'rot'
export type Phase = 'g' | 'k' | 'm'
export const PHASEN: Record<Phase, string> = { g: 'Grundlagen', k: 'Können', m: 'Meisterschaft' }
export type FaehId = string   // "<bereich>.<name>", z. B. "konter.spiel"

/** Felder, die jeder ausgelieferte Eintrag tragen darf */
export interface Neu { seit?: number; entfallen?: true }

// ── Stammdaten ──

export interface BereichInfo {
  id: BereichId
  name: string
  kurz: string            // ein Satz
  moment: string          // typischer Moment
  zeichen: string         // lucide-Symbolname
  optIn?: true            // flirten: freiwilliger Zusatz mit eigenem Hinweis
  /** im Tool angeboten? (Zwischenstände ohne halbe Bereiche) */
  freigegeben: boolean
  faehigkeiten: { id: FaehId; name: string; kurz: string; spur?: SchwerpunktId }[]
}
export interface SchwerpunktInfo { id: SchwerpunktId; name: string; leistet: string; grenze: string }
export interface Quelle { id: string; text: string; link?: string; geprueft: boolean }
export interface Figur { name: string; rolle: string; art: string }

// ── Übungen ──

export interface Kopf {
  id: string
  faehigkeit: FaehId
  /** 1 leicht … 10 sehr schwer */
  stufe: number
  kanal: Kanal
  /** braucht lautes Sprechen → nur mit Schalter „Ich kann gerade laut sprechen“; dann ist `leise` Pflicht */
  laut?: true
  /** Kennung der stillen Ersatzübung (im Vorrat) */
  leise?: string
  /** läuft mit Uhr → entfällt bei „ohne Zeitdruck“ */
  uhr?: true
  einfluss?: EinflussKlasse
  /** nur für Tests (Einstufung, Formcheck), nicht fürs Training */
  test?: true
}
export interface Wahl { text: string; wert: 0 | 1 | 2; warum: string; tendenz?: string }
export interface Frei { kriterien: string[]; muster: string[] }

export type Schritt =
  // Verstehen
  | { art: 'karte'; titel?: string; text: string; bild?: string }
  | { art: 'schaetzen'; frage: string; optionen?: string[]; richtig?: number; loesung: string; aufloesung: string }
  | { art: 'mythos'; aussage: string; urteil: 'stimmt' | 'teils' | 'falsch'; warum: string }
  | { art: 'vergleich'; lage: string; schwach: string; stark: string; frage: string; unterschied: string }
  | { art: 'studie'; frage: string; aufbau: string; ergebnis: string; grenze: string; beleg: Beleg; quellen: string[] }
  | { art: 'fachhilfe'; thema: 'logopaedie' | 'stottern' | 'seele' | 'notfall' | 'belaestigung' | 'mobbing' }
  // Erkennen
  | { art: 'auswahl'; kopf: Kopf; frage: string; sicherheit?: true; antworten: Wahl[] }
  | { art: 'wortwahl'; kopf: Kopf; frage: string; antworten: Wahl[] }
  | { art: 'kunstgriff'; kopf: Kopf; lage: string; frage: string; antworten: Wahl[]; erklaerung: string }
  | { art: 'tonfall'; kopf: Kopf; satz: string; fassungen: { betont: string; bedeutung: string }[]; frage: string; antworten: Wahl[]; ton?: string }
  | { art: 'szene'; kopf: Kopf; beschreibung: string; frage: string; antworten: Wahl[]; bild?: string }
  | { art: 'buendel'; kopf: Kopf; lage: string; frage: string; zeichen: { text: string; stuetzt: boolean; warum: string }[]; bild?: string }
  | { art: 'zuordnen'; kopf: Kopf; auftrag: string; faecher: string[]; karten: { text: string; fach: number }[] }
  | { art: 'rangfolge'; kopf: Kopf; frage: string; eintraege: { text: string; warum: string }[] }   // in richtiger Reihenfolge, stark zuerst
  | { art: 'fehler'; kopf: Kopf; auftrag: string; teile: { t: string; fehler?: string }[] }
  // Üben
  | { art: 'dialog'; kopf: Kopf; gespraech: Gespraech }
  | { art: 'konter'; kopf: Kopf; lage: string; von: string; spruch: string; schaerfe: 1 | 2 | 3; muster: { technik: string; text: string }[]; kriterien: string[] }
  | ({ art: 'blitz'; kopf: Kopf; auftrag: string; ziel: number; sekunden: number; beispiele: string[] })
  | ({ art: 'umformulieren'; kopf: Kopf; auftrag: string; vorlage: string } & Frei)
  | ({ art: 'anschluss'; kopf: Kopf; von: string; aussage: string } & Frei)
  | ({ art: 'spiegeln'; kopf: Kopf; von: string; aussage: string } & Frei)
  | ({ art: 'jaund'; kopf: Kopf; start: string } & Frei)
  | ({ art: 'kern'; kopf: Kopf; absatz: string; hoechstWoerter: number } & Frei)
  | ({ art: 'humorlabor'; kopf: Kopf; auftrag: string; vorlage: string } & Frei)
  | { art: 'bauplan'; kopf: Kopf; plan: string; anlass: string; felder: { name: string; hilfe: string }[]; muster: string[] }
  | ({ art: 'kritiker'; kopf: Kopf; satz: string } & Frei)
  | { art: 'sprechen'; kopf: Kopf; auftrag: string; sekunden: number; pruefliste: string[] }
  | { art: 'atem'; werkzeug: string; schritte: string[]; takt: { ein: number; aus: number; runden: number }; hinweis: string; messen: boolean; ton?: string }
  | { art: 'lockern'; uebungen: string[]; sekunden: number; stummMoeglich: boolean }
  | { art: 'anleitung'; titel: string; schritte: string[]; sekunden: number; stumm: boolean; pruefung?: string[]
      /** Anspannung vorher/nachher messen (zählt für „Was bei mir wirkt“); braucht die Kennung eines Werkzeugs aus gemeinsam.json */
      messen?: boolean; werkzeug?: string }
  | { art: 'nachsprechen'; kopf: Kopf; auftrag: string; zeilen: string[]; weise: 'gewohnt' | 'ueberdeutlich' | 'klar' | 'frei'; pruefliste: string[]; ton?: string }
  | { art: 'klartext'; kopf: Kopf; text: string; pruefliste: string[] }
  | { art: 'lautleiter'; kopf: Kopf; laut: string; stufen: { s: string; zeilen: string[] }[]; pruefliste: string[] }
  | { art: 'routine'; bausteine: string[]; mindestens: number; hoechstens: number }
  // ── Stufe 2: Werkzeuge fürs eigene Leben (ohne Wertung, Ergebnis geht ins Buch bzw. in Kompass/Notfallkoffer) ──
  /** Bruno erzählt einen kurzen Fall aus der Stammbesetzung */
  | { art: 'geschichte'; titel: string; figur: string; text: string; frage?: string }
  /** eigenes Erlebnis in Lage – Wendung – Schluss gießen; landet im Geschichten-Schatz */
  | { art: 'geschichtenbau'; kopf: Kopf; auftrag: string; felder: { name: string; hilfe: string }[]; muster: string[] }
  /** Gespräch vorbereiten: Anlass, Ziel, erster Satz, Wunsch, Plan B – als Karte zum Mitnehmen */
  | { art: 'gespraechskarte'; anlass: string; beispiel?: { ziel: string; erster: string; wunsch: string; planB: string } }
  /** Ernstfall eintragen; der Coach baut den Weg dorthin (Woche, Vortag, Stunde, fünf Minuten, eine Minute, danach) */
  | { art: 'fahrplan'; anlass: string }
  /** eigene Angst-Leiter: bis zu zehn Stufen mit Anspannungswert */
  | { art: 'leiter'; auftrag: string; beispiel: string[] }
  /** Werte sortieren: die wichtigsten wählen */
  | { art: 'werte'; auftrag: string; karten: string[]; waehle: number }
  /** Lebensrad: Lebensbereiche 0–10 einschätzen */
  | { art: 'lebensrad'; bereiche: string[] }
  /** geführtes Schreiben (bestmögliches Selbst, 80. Geburtstag, drei Leben …) */
  | { art: 'schreibreise'; titel: string; anleitung: string; fragen: string[]; minuten: number; insBuch?: 'erfolg' | 'saetze' | 'geschichten' | 'kompass' }
  /** Wunsch – Ergebnis – Hindernis – Plan */
  | { art: 'woop'; anlass: string; beispiel?: { wunsch: string; ergebnis: string; hindernis: string; plan: string } }
  /** Bühne: aufstehen und reden, mit Publikum, Stoppuhr und kleinen Störungen (laut, braucht leise-Ersatz) */
  | { art: 'buehne'; kopf: Kopf; auftrag: string; sekunden: number; publikum: 'klein' | 'gross' | 'video'; stoerungen: string[]; pruefliste: string[] }
  /** stille Übung mit Kopf (Mundbild im Spiegel, innerlich sprechen, Zungenlage fühlen) – echte Ersatzübung für laute Aufgaben */
  | { art: 'stumm'; kopf: Kopf; titel: string; schritte: string[]; sekunden: number; pruefliste: string[] }
  // Anwenden und nachdenken
  | { art: 'reflexion'; frage: string; insBuch?: 'erfolg' | 'saetze' | 'geschichten' | 'konter' }
  | { art: 'wenndann'; anlass: string; wenn: string[]; dann: string[] }
  | { art: 'selbstbild'; aussagen: { id: string; text: string; faehigkeit: FaehId }[] }
  | { art: 'sammeln'; auftrag: string; mindestens: number; ziel: 'wortliste' | 'saetze' | 'geschichten' }
  | { art: 'zaehler'; name: string; auftrag: string; tage: number }
  | { art: 'experiment'; auftrag: string; dauer: 'heute' | 'woche'; nachfrage: string }
  | { art: 'mission'; ref: string }

export type SchrittArt = Schritt['art']
export type MitKopf = Extract<Schritt, { kopf: Kopf }>
export const hatKopf = (s: Schritt): s is MitKopf => 'kopf' in s

/** Verzweigtes Gespräch (kurz als Schritt „dialog“, lang als Lage). */
export interface Gespraech {
  titel: string
  figur: string
  lage: string
  start: string
  knoten: { id: string; sagt: string; ende?: string; wahl?: { text: string; wert: 0 | 1 | 2; tendenz?: string; weiter: string; rueck: string }[] }[]
  prinzipien: string[]
}

// ── Lerneinheiten ──

export interface Einheit extends Neu {
  id: string                 // "konter-1-01"; Schwerpunkte "aussprache-s-01"
  bereich: BereichId
  schwerpunkt?: SchwerpunktId
  stufe: 1 | 2 | 3
  nr: number
  titel: string              // ≤ 48 Zeichen
  faehigkeiten: FaehId[]
  dauerMin: number
  beleg: Beleg
  belegHinweis?: string
  quellen: string[]
  aha: string                // ≤ 220
  schritte: Schritt[]
  regel: string              // ≤ 90
  merkkarten: { id: string; frage: string; antwort: string }[]
  mission?: string
}

export interface Lage extends Neu, Gespraech {
  id: string                 // "konter-l-01"
  bereich: BereichId
  schwerpunkt?: SchwerpunktId
  phase: Phase
  umfeld: 'kollegen' | 'vorgesetzte' | 'kunden' | 'familie' | 'freunde' | 'fremde' | 'kennenlernen' | 'telefon' | 'gruppe'
  faehigkeiten: FaehId[]
  stufe: number
  einleitung: string         // was in dieser Lage geübt wird
  transfer: string           // Frage fürs eigene Leben
  /** dient auch als Sparring (Abschluss einer Phase) */
  sparring?: true
}

/** ein Eintrag im Übungsvorrat — jede Übung mit Kopf; Kennung "konter-v-0001" */
export type VorratsEintrag = MitKopf & Neu

// ── Kursplan ──

export type Lerntag = Neu & { id: string; phase: Phase; titel?: string } & (
  | { art: 'E'; einheit: string }
  | { art: 'U'; faehigkeiten: FaehId[]; formate: SchrittArt[]; band: [number, number]; anzahl: number }
  | { art: 'L'; lage: string }
  | { art: 'A'; modus: 'mission' | 'nachbereitung' | 'wiederholung' }
  | { art: 'S'; lage: string }
)
export interface Kursplan { kurs: KursId; tage: Lerntag[] }

// ── Wissens-Seite ──

export type WissensArt = 'hebel' | 'taktik' | 'formulierung' | 'fehler' | 'mythos' | 'dahinter' | 'buch' | 'umfeld' | 'spickzettel'
export interface WissensEintrag extends Neu {
  id: string                 // "konter-w-001"
  art: WissensArt
  titel: string
  text: string
  beleg: Beleg
  belegHinweis?: string
  quellen: string[]
  faehigkeiten?: FaehId[]
  beispiele?: string[]
  /** fehler: was stattdessen · mythos: Urteil */
  statt?: string
  urteil?: 'stimmt' | 'teils' | 'falsch'
  einfluss?: EinflussKlasse
  /** Taktik: was sie kostet · wie man sie abwehrt */
  preis?: string
  abwehr?: string
  /** umfeld: für wen */
  umfeld?: string
  /** spickzettel: Punkte */
  punkte?: string[]
  /** Gruppe innerhalb der Art (z. B. Konter-Technik „bei Angriffen“) */
  gruppe?: string
}
export interface WissensSeite {
  bereich: BereichId
  kern: string
  einleitung: string
  /** „Das kannst du am Ende“ — nach Grundlagen, Können, Meisterschaft */
  ziel: [string, string, string]
  eintraege: WissensEintrag[]
}

// ── Echtes Leben ──

export interface Mission extends Neu {
  id: string                 // "konter-m-01"
  bereich: BereichId
  schwerpunkt?: SchwerpunktId
  stufe: number              // Sprosse 1…10 der Leiter
  titel: string
  auftrag: string
  ort: 'privat' | 'beruf' | 'beides'
  planVorlage: string        // „Wenn …, dann …“
  /** halb so große Fassung (wenn mehrfach verschoben) */
  halb?: string
  mutprobe?: true
}

// ── Tests ──

export interface TestAufgabe { id: string; faehigkeit: FaehId; stufe: number; frage: string; antworten: Wahl[] }
export interface BereichTests {
  bereich: BereichId
  spur: Spur
  /** Szenario-Aufgaben (Einstufung und Formcheck ziehen daraus) */
  szenarien: TestAufgabe[]
  selbstbild: { id: string; text: string; faehigkeit: FaehId }[]
  verhalten: { id: string; text: string; faehigkeit: FaehId }[]
}

// ── Gemeinsames ──

export type Anlass = 'begruessung' | 'richtig' | 'falsch' | 'rueckkehr' | 'mission' | 'ernstfall' | 'aufnahme' | 'abschluss'
  | 'serie' | 'erster' | 'kurztraining' | 'stottern-mission' | 'neue-phase' | 'formcheck' | 'freilauf' | 'leer'
export interface Werkzeug { id: string; titel: string; sekunden: number; schritte: string[]; unauffaellig: boolean; beleg: Beleg; quellen: string[]; hinweis?: string }
export interface Lesetext { id: string; titel: string; text: string; woerter: number; silben: number }
export interface Gemeinsam {
  zeilen: Record<Anlass, Record<Ton, string[]>>
  fachhilfe: Record<'logopaedie' | 'stottern' | 'seele' | 'notfall' | 'belaestigung' | 'mobbing', string>
  werkzeuge: Werkzeug[]
  lesetexte: Lesetext[]
  situationen: { id: string; text: string; bereiche: BereichId[] }[]
  einfuehrung: { titel: string; text: string }[]
  gleich: { id: string; titel: string; bereich?: BereichId; schritte: string[] }[]
  mittendrin: string[]
}

// ── Stufe 2: Inhalte fürs eigene Leben (inhalt/leben.json) ──

export type SchaerfeId = 'sanft' | 'normal' | 'arschtritt'
export type ErinnerungsArt = 'wennDann' | 'kleinster' | 'frage' | 'idee' | 'rueckblick' | 'neustart' | 'spruch'
export type FahrplanEtappe = 'woche' | 'vortag' | 'stunde' | 'fuenf' | 'minute' | 'danach'
export type ErnstfallArt = 'rede' | 'gespraech' | 'pruefung' | 'vorstellung' | 'telefon' | 'sonst'

export interface VorhabenIdee { titel: string; kleinster: string; wennDann: string; hindernis: string }
export interface VorhabenKategorie {
  kat: string            // Kennung, z. B. "bewegung"
  titel: string
  zeichen: string        // lucide-Symbolname
  /** Sprung in einen anderen Raum (nur wenn sichtbar) */
  sprung?: 'parla-italiano'
  ideen: VorhabenIdee[]
  /** konkrete Ideen für die Erinnerungsart „idee“ (Unternehmung, Freude, Buchimpuls …) */
  impulse: string[]
}
export interface Mutprobe { id: string; titel: string; auftrag: string; halb: string; warum: string }
export interface NotfallAblauf { art: ErnstfallArt; titel: string; etappen: { id: FahrplanEtappe; titel: string; schritte: string[] }[]; auswertung: string[] }
export interface KompassStation { id: string; nr: number; titel: string; kurz: string; minuten: number; einleitung: string; schritte: Schritt[] }
export interface Leben {
  vorhaben: VorhabenKategorie[]
  /** Erinnerungstexte je Art und Schärfe; Platzhalter {titel} {kleinster} {wennDann} {anzahl} {name} */
  erinnerungen: Record<ErinnerungsArt, Record<SchaerfeId, string[]>>
  mutproben: Mutprobe[]
  notfall: NotfallAblauf[]
  kompass: {
    stationen: KompassStation[]
    werteKarten: string[]
    lebensrad: string[]
    pyramide: { stufen: { feld: 'lebensziel' | 'drei' | 'neunzig' | 'woche' | 'heute'; titel: string; hilfe: string; beispiel: string }[]; pruefFragen: string[] }
    wochenCheck: string[]
    rueckblick: string[]
  }
}
