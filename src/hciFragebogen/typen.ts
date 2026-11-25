// HCI-Fragebogen („Analysis applications HCI“): Datentypen.
// Rohdaten = das, was die Fernabfrage vom Server liest (nur lesend). Kurze Schlüssel, weil die
// Ausgabe als eine JSON-Zeile durch die Fernsitzung kommt.

export interface RohSystem {
  name: string
  os: string
  version: string
  build: string
  ubr: number
  /** „1809“, „21H2“ … */
  anzeige: string
  installiert: string
  boot: string
  hersteller: string
  modell: string
  kerne: number
  sockel: number
  ramGB: number
  ramFreiGB: number
  /** zugesicherter Speicher (Commit): Grenze und frei, in GB */
  commitGB: number
  commitFreiGB: number
  hypervisor: boolean
  domaene: string
  /** Werte, die Hyper-V dem Gast mitteilt (u. a. PhysicalHostName = Knoten, auf dem die VM gerade läuft) */
  gast: Record<string, string>
  integration: string
  neustartAusstehend: boolean
  /** nach einem Absturz automatisch neu starten (Windows-Einstellung) */
  autoReboot: number
  dumpArt: number
  platten: { n: string; g: number; f: number }[]
  auslagerung: { n: string; mb: number; spitze: number; jetzt: number }[]
  /** Speicherabbilder: vollständiges Abbild + kleine Abbilder + Live-Berichte */
  abbild: { voll: string; vollMB: number; klein: string[]; live: string[] }
}

export interface RohSoftware { n: string; v: string; h: string; d: string; o: string }
export interface RohJava { q: 'registry' | 'prozess'; v: string; o: string; h?: string }
export interface RohSql { n: string; v: string; pl: string; e: string }
export interface RohHotfix { id: string; a: string; d: string }
export interface RohDienst { n: string; d: string; s: string; m: string; p: string; u: string }

export interface RohSkript { p: string; lesbar: boolean; tok: string[] }
export interface RohAufgabe {
  n: string; pf: string; s: string; u: string; au: string
  /** Programmdateien der Aktionen (nur Dateiname, nie die Argumente) */
  prog: string[]
  /** gefundene Neustart-/Herunterfahr-Befehle in den Aktionen (nur das Stichwort) */
  tok: string[]
  sk: RohSkript[]
  l: string
  r: number
}

export interface RohTreiber { n: string; d: string; s: string; m: string; a: string; p: string; h: string; v: string; b: string; dt: string; sig: string }
export interface RohFilter { n: string; i: number; h: string; f: number }
export interface RohNetz { n: string; b: string; s: string; h: string; v: string; dt: string; g: string }
export interface RohBindung { a: string; k: string; d: string }
export interface RohGeraet { k: string; n: string; h: string }
export interface RohPort { port: number; proc: string }
export interface RohProzess { n: string; mb: number; hd: number; th: number }

export interface RohNeustart { t: string; proz: string; grund: string; art: string; kommentar: string; wer: string }
export interface RohEreignis { t: string; l: string; q: string; id: number; st: number; m: string }
export interface RohUnerwartet {
  /** Start des Betriebssystems NACH dem Ausfall */
  start: string
  /** letztes Lebenszeichen vor dem Ausfall */
  aus: string
  /** woher „aus“ stammt: Text der Meldung 6008 oder letzter Protokolleintrag */
  ausQuelle: '6008' | 'letzter Eintrag' | ''
  ids: number[]
  /** Bugcheck-Code aus Kernel-Power 41 (0 = keiner, die VM wurde hart beendet) */
  bug: string
  davor: RohEreignis[]
}
export interface RohGruppe { q: string; id: number; n: number; l: string; m: string }
export interface RohAbsturz { art: string; app: string; modul: string; n: number; l: string }
export interface RohMsi { t: string; id: number; n: string; v: string }
export interface RohNeuDienst { t: string; n: string; datei: string; art: string }
export interface RohUpdate { t: string; n: string }

export interface HciRoh {
  ok: boolean
  fehler?: string
  v: number
  am: string
  zone: string
  tage: number
  vorMin: number
  dauerS: number
  system: RohSystem
  software: RohSoftware[]
  dotnet: { release: number; version: string; core: string[] }
  java: RohJava[]
  sql: RohSql[]
  rollen: string[]
  merkmale: string[]
  hotfix: RohHotfix[]
  dienste: RohDienst[]
  /** Dienste, deren Wiederherstellung „Computer neu starten“ enthält */
  dienstNeustart: string[]
  aufgaben: RohAufgabe[]
  wu: { richtlinie: boolean; auOptions: number; keinAuto: number; keinNeustartAngemeldet: number; wsus: boolean }
  treiber: RohTreiber[]
  treiberGesamt: number
  treiberMicrosoft: number
  filter: RohFilter[]
  /** fltmc ließ sich nicht ausführen (fehlende Rechte) */
  filterFehlt: boolean
  netz: RohNetz[]
  bindungen: RohBindung[]
  defender: { modus: string; av: boolean; echtzeit: boolean; version: string } | null
  vss: string[]
  geraete: RohGeraet[]
  iscsi: number
  ports: RohPort[]
  prozesse: RohProzess[]
  griffe: RohProzess[]
  /** älteste Einträge der Protokolle = wie weit die Auswertung zurückreicht */
  protokollAb: { system: string; anwendung: string }
  neustarts: RohNeustart[]
  unerwartet: RohUnerwartet[]
  bugcheck: { t: string; m: string }[]
  sysFehler: RohGruppe[]
  sysFehlerGekappt: boolean
  speicherEreignisse: RohGruppe[]
  ressourcen: { t: string; m: string }[]
  whea: { t: string; id: number; m: string }[]
  abstuerze: RohAbsturz[]
  msi: RohMsi[]
  updates: RohUpdate[]
  neueDienste: RohNeuDienst[]
  /** Teile, die nicht gelesen werden konnten */
  luecken: string[]
}

export type Urteil = 'Yes' | 'No' | 'Unknown' | ''

export interface HciAntwort {
  nr: number
  /** Kurzurteil, steht in der ersten Zeile der Antwort (leer bei Freitext-Fragen) */
  urteil: Urteil
  /** vorgeschlagene Antwort, englisch, so wie sie in die Excel-Zelle kommt */
  text: string
  /** braucht eine Angabe von Hand (Ansprechpartner, Herstelleraussage) */
  manuell: boolean
  /** Hinweis für den Bearbeiter (deutsch, kommt NICHT in die Excel) */
  hinweis?: string
}

export interface HciEinstellungen {
  /** Beginn des Problems im Cluster (JJJJ-MM-TT) — Bezugspunkt für Frage 8 */
  problemSeit: string
  /** so viele Tage zurück werden die Protokolle ausgewertet */
  tage: number
  /** so viele Minuten vor einem unerwarteten Ausfall werden angesehen */
  vorMin: number
}

export interface HciBogen {
  v: 1
  host: string
  erhoben?: { am: string; von: string; dauerS: number }
  roh?: HciRoh
  /** von Hand geänderte Antworten (Nr. → Text); fehlt eine Nr., gilt der Vorschlag */
  eigene: Record<string, string>
  geaendert?: { am: string; von: string }
  /** letzter fehlgeschlagener Versuch */
  versuch?: { am: string; fehler: string }
}
