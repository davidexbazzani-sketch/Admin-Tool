// ── Xelion-Durchwahlen prüfen: welche werden nicht mehr benutzt? ────────────
//
// GRUNDLAGE IST DIE VERGABELISTE (Durchwahlliste.xlsx), nicht das AD. Jede Zeile ist
// eine Durchwahl mit dem Namen, auf den sie vergeben ist. Zu jedem Namen wird im AD
// nachgesehen:
//   · gibt es das Konto — aktiv, deaktiviert oder gar nicht?
//   · wann war die Person zuletzt angemeldet?
//   · welche Xelion-Berechtigung hat sie?
//   · was steht am Konto im Feld „Rufnummer"?
//
// Zweck: ungenutzte Durchwahlen bei Xelion kündigen — und dabei NIE eine erwischen, die
// noch benutzt wird. Deshalb gilt durchgehend: aus „nicht gefunden" darf nicht
// „existiert nicht" werden. Jeder Name wird aktiv im AD gesucht, bevor ein Urteil fällt.
//
// WARUM ANR: AD kann Platzhalter-Suchen (`sn=*Silva*`) nicht indizieren — eine Abfrage
// je Name dauerte in der Praxis über fünf Minuten. `anr=<Name>` ist die dafür vorgesehene,
// indizierte Namensauflösung (Anzeigename, Vor-/Nachname, Anmeldename) und findet auch
// abweichende Schreibweisen wie „Daniela MierswaSilva" zu „Daniela Mierswa Silva".

import { api } from '../electronAPI'
import { fuzzyNameMatch, nameTokens } from '../utils/nameMatch'
import { loadPhoneList } from './phoneAssignment'

/** Was das AD zu dem Namen aus der Vergabeliste sagt. */
export type AdBefund =
  | 'aktiv'
  | 'inaktiv'
  | 'nicht-im-ad'
  | 'mehrdeutig'      // mehrere passende Konten — von Hand klären
  | 'ungeprueft'      // Gegenprüfung lief nicht durch
  | 'ohne-namen'      // Zeile der Liste ohne Benutzer (frei oder gesperrt)

/** Einstufung der Durchwahl. Reine Anzeige — das Werkzeug kündigt nichts. */
export type DurchwahlStatus = 'in-benutzung' | 'pruefen' | 'kuendbar' | 'ungeprueft'

export interface DurchwahlZeile {
  /** Die vierstellige Durchwahl aus der Vergabeliste. */
  durchwahl: string
  /** Name, auf den die Durchwahl vergeben ist (leer = freie/gesperrte Zeile). */
  name: string
  /** Abteilung — aus dem AD, sobald ein Konto gefunden wurde. */
  abteilung: string
  /** Abteilung, wie sie in der Vergabeliste steht (nur Rückfallebene ohne AD-Konto). */
  abteilungListe: string
  bemerkung: string
  /** Zeile in der Excel — für spätere Rückverweise. */
  zeile: number

  befund: AdBefund
  sam: string
  /** E-Mail des gefundenen Kontos (bei leerem Feld der UPN — Hauskonvention). */
  email: string
  /** Corp ID = AD-Attribut EmployeeID. */
  corpId: string
  /** Anzeigename des gefundenen Kontos, wenn er vom Listennamen abweicht. */
  gefundenAls: string
  zuletztOnline: string
  /** Was am gefundenen Konto im Feld „Rufnummer" steht. */
  rufnummerAd: string
  /** Stimmt die AD-Rufnummer mit der Durchwahl aus der Liste überein? */
  rufnummerPasst: boolean | null
  xelionGruppen: string[]
  /** Aktive Konten, die GENAU diese Durchwahl im AD tragen (auch andere Personen). */
  traegerAktiv: string[]

  status: DurchwahlStatus
  grund: string
}

export interface PruefErgebnis {
  zeilen: DurchwahlZeile[]
  warnungen: string[]
  geladenAm: string
  karenzTage: number
  /** true = die AD-Gegenprüfung ist durchgelaufen. Vorher gilt NICHTS als kündbar. */
  gegengeprueft: boolean
}

export const KARENZ_VORGABE_TAGE = 180

/** Woran eine AD-Gruppe als Xelion-Berechtigung erkannt wird. */
const XELION_MUSTER = 'xelion'
/** Trennzeichen für die Gruppenliste aus PowerShell (kommt in AD-Namen nicht vor). */
const TRENNER = ';;'
/** Namen je ANR-Abfrage — hält den Filter handlich. */
const ANR_BLOCK = 120

// ── AD-Zugriff ───────────────────────────────────────────────────────────────

export interface AdKonto {
  name: string
  sam: string
  abteilung: string
  email: string
  corpId: string
  aktiv: boolean
  lastLogon: string
  telefon: string
  xelion: string[]
}

const FELDER = 'DisplayName,Enabled,LastLogonDate,telephoneNumber,MemberOf,EmailAddress,UserPrincipalName,EmployeeID,Department'

/**
 * Gemeinsamer Ausgabeteil beider Abfragen.
 *
 * ACHTUNG, hier lag ein Fehler, der zu Fehlkündigungen geführt hätte: die Form
 * `,@(…) | ConvertTo-Json` liefert KEIN Array, sondern `{"value":[…],"Count":n}`.
 * Der Parser fand darin keine Konten, jede Zeile wurde „nicht im AD vorhanden" und
 * damit kündbar. `ConvertTo-Json -InputObject @(…)` liefert dagegen in beiden Fällen
 * ein echtes Array — auch bei genau einem Treffer (lokal gegengeprüft).
 */
const AUSGABE = [
  `$aus = @($r | ForEach-Object { [pscustomobject]@{`,
  `  N=[string]$(if ($_.DisplayName) { $_.DisplayName } else { $_.Name })`,
  `  S=[string]$_.SamAccountName`,
  // Hauskonvention: ist EmailAddress leer, gilt der UPN als E-Mail.
  `  E=[string]$(if ($_.EmailAddress) { $_.EmailAddress } elseif ("$($_.UserPrincipalName)" -like '*@*') { $_.UserPrincipalName } else { '' })`,
  `  C=[string]$_.EmployeeID`,
  `  D=[string]$_.Department`,
  `  A=[bool]$_.Enabled`,
  `  L=[string]$(if ($_.LastLogonDate) { $_.LastLogonDate.ToString('o') } else { '' })`,
  `  T=[string]$_.telephoneNumber`,
  // Gruppen schon auf dem Server auf Xelion eingrenzen — sonst kämen 40 Gruppen je Person.
  `  X=[string](@($_.MemberOf | ForEach-Object { if ($_ -match '^CN=([^,]+)') { $Matches[1] } } | Where-Object { $_ -match '${XELION_MUSTER}' } | Sort-Object -Unique) -join '${TRENNER}')`,
  `}})`,
  `ConvertTo-Json -InputObject @($aus) -Depth 3 -Compress`,
].join('\n')

function psq(s: string): string { return s.replace(/'/g, "''") }
function ldapEsc(s: string): string {
  return s.replace(/\\/g, '\\5c').replace(/\(/g, '\\28').replace(/\)/g, '\\29').replace(/\*/g, '\\2a')
}

function parseKonten(out: string): AdKonto[] {
  const j = JSON.parse(out)
  const arr: Record<string, unknown>[] = Array.isArray(j) ? j : [j]
  return arr.map(x => ({
    name: String(x.N ?? ''),
    sam: String(x.S ?? ''),
    abteilung: String(x.D ?? ''),
    email: String(x.E ?? ''),
    corpId: String(x.C ?? ''),
    aktiv: Boolean(x.A),
    lastLogon: String(x.L ?? ''),
    telefon: String(x.T ?? ''),
    xelion: String(x.X ?? '').split(TRENNER).map(g => g.trim()).filter(Boolean),
  })).filter(k => k.name || k.sam)
}

/**
 * Schreibvarianten eines Namens für die ANR-Suche.
 *
 * ANR vergleicht Präfixe und faltet KEINE Umlaute: `anr=Uwe Döring` findet das Konto
 * „Uwe Doering" nicht (realer Fall). Der lokale Abgleich könnte das (er faltet ö→oe),
 * bekommt den Treffer aber nie zu sehen, wenn ANR nichts liefert. Deshalb werden mehrere
 * Schreibweisen mitgeschickt. Varianten, die ins Leere laufen, kosten nur Filterlänge —
 * ein falscher Treffer wird ohnehin lokal aussortiert.
 */
function nameVarianten(name: string): string[] {
  const n = name.trim()
  if (!n) return []
  const v = new Set<string>([n])
  // ö → oe   (Liste mit Umlaut, AD ohne)
  v.add(n.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
         .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue'))
  // ö → o    (manche Konten lassen den Umlaut ganz weg)
  // Der Bereich der kombinierenden Diakritika wird aus Codepunkten gebaut, damit keine
  // literalen Kombinationszeichen im Quelltext stehen (wie in utils/nameMatch.ts).
  v.add(n.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/ß/g, 'ss'))
  // oe → ö   (umgekehrter Fall: Liste ohne Umlaut, AD mit)
  if (/(ae|oe|ue)/i.test(n)) {
    v.add(n.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü')
           .replace(/Ae/g, 'Ä').replace(/Oe/g, 'Ö').replace(/Ue/g, 'Ü'))
  }
  return [...v].filter(x => x.length >= 2)
}

/** Erkennt Raum-, Funktions- und Sammelnummern, hinter denen keine Person steht. */
export function siehtNachPersonAus(name: string): boolean {
  const n = (name || '').trim()
  if (!n) return false
  if (/[0-9]/.test(n)) return false                      // „1056", „Test2"
  if (/[.()/\\[\]]/.test(n)) return false                // „VGO.EG.Flur", „Prüfer (WP)"
  return n.split(/\s+/).filter(t => t.length >= 2).length >= 2   // Vor- UND Nachname
}

/** Konten zu einer Namensliste — indiziert über ANR, in Blöcken. */
async function sucheKontenZuNamen(namen: string[]): Promise<{ konten: AdKonto[]; fehler?: string }> {
  const liste = [...new Set(namen.map(n => n.trim()).filter(n => n.length >= 2))]
  if (!liste.length) return { konten: [] }

  const alle: AdKonto[] = []
  for (let i = 0; i < liste.length; i += ANR_BLOCK) {
    const oder = liste.slice(i, i + ANR_BLOCK)
      .flatMap(nameVarianten)
      .map(v => `(anr=${ldapEsc(v)})`)
      .join('')
    const ps = [
      `$ErrorActionPreference='SilentlyContinue'`,
      `if (-not (Get-Command Get-ADUser -EA SilentlyContinue)) { Write-Output 'FEHLER:Das AD-Modul (RSAT) fehlt auf diesem PC.'; return }`,
      `try { $r = @(Get-ADUser -LDAPFilter "(&(objectCategory=person)(objectClass=user)(|${oder}))" -Properties ${FELDER} -ResultSetSize 5000 -EA Stop) }`,
      `catch { Write-Output ('FEHLER:' + $_.Exception.Message); return }`,
      AUSGABE,
    ].join('\n')
    const r = await api().runPowerShell(ps, 120000)
    const out = (r.stdout || '').trim()
    if (out.startsWith('FEHLER:')) return { konten: [], fehler: out.slice(7) }
    if (!out) return { konten: [], fehler: r.stderr?.trim() || 'Die Namenssuche im AD lieferte keine Antwort.' }
    try { alle.push(...parseKonten(out)) } catch { return { konten: [], fehler: 'Antwort der Namenssuche nicht lesbar.' } }
  }
  return { konten: alle }
}

/**
 * Alle Konten, die überhaupt eine Rufnummer tragen — indizierter Präsenzfilter.
 * Beantwortet die wichtigste Sicherheitsfrage: trägt jemand diese Durchwahl noch?
 * Das funktioniert über die NUMMER und ist damit vom Namensabgleich unabhängig.
 */
async function sucheKontenMitRufnummer(): Promise<{ konten: AdKonto[]; fehler?: string }> {
  const ps = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `if (-not (Get-Command Get-ADUser -EA SilentlyContinue)) { Write-Output 'FEHLER:Das AD-Modul (RSAT) fehlt auf diesem PC.'; return }`,
    `try { $r = @(Get-ADUser -LDAPFilter '(&(objectCategory=person)(objectClass=user)(telephoneNumber=*))' -Properties ${FELDER} -ResultSetSize 20000 -EA Stop) }`,
    `catch { Write-Output ('FEHLER:' + $_.Exception.Message); return }`,
    AUSGABE,
  ].join('\n')
  const r = await api().runPowerShell(ps, 180000)
  const out = (r.stdout || '').trim()
  if (out.startsWith('FEHLER:')) return { konten: [], fehler: out.slice(7) }
  if (!out) return { konten: [], fehler: r.stderr?.trim() || 'Die Rufnummern-Abfrage lieferte keine Antwort.' }
  try { return { konten: parseKonten(out) } } catch { return { konten: [], fehler: 'Antwort der Rufnummern-Abfrage nicht lesbar.' } }
}

// ── Hilfen ───────────────────────────────────────────────────────────────────

/** Letzte vier Ziffern einer Rufnummer — das ist die Durchwahl. */
export function durchwahlVon(nummer: string): string {
  const z = (nummer || '').replace(/\D+/g, '')
  return z.length >= 4 ? z.slice(-4) : z
}

/**
 * Klartext zum Vergleich „letzte vier Stellen der AD-Rufnummer ↔ Durchwahl".
 * Leer, wenn im AD keine Rufnummer steht — dann ist nichts zu vergleichen, und das ist
 * etwas anderes als „ungleich".
 */
export function passtText(z: DurchwahlZeile): string {
  if (z.rufnummerPasst === null) return ''
  return z.rufnummerPasst ? 'gleich' : 'ungleich'
}

/**
 * Verklebte Namensformen als Suchschlüssel: Tokens einmal in Originalreihenfolge und
 * einmal alphabetisch sortiert aneinandergehängt. Damit sind zusammen- und
 * getrenntgeschriebene Doppelnachnamen vergleichbar („Mierswa Silva" ↔ „MierswaSilva").
 */
function glueSchluessel(name: string): string[] {
  const t = nameTokens(name)
  if (t.length === 0) return []
  if (t.length === 1) return [t[0]]
  const original = t.join('')
  const sortiert = [...t].sort().join('')
  return original === sortiert ? [original] : [original, sortiert]
}

/** Tage seit der letzten Anmeldung — `null`, wenn unbekannt. */
export function tageSeit(iso: string): number | null {
  const s = (iso || '').trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

/** „vor 4 Tagen (01.10.2026)" bzw. „—". */
export function zuletztOnlineText(iso: string): string {
  const tage = tageSeit(iso)
  if (tage === null) return '—'
  const datum = new Date(iso).toLocaleDateString('de-DE')
  if (tage <= 0) return `heute (${datum})`
  if (tage === 1) return `gestern (${datum})`
  return `vor ${tage} Tagen (${datum})`
}

export const BEFUND_TEXT: Record<AdBefund, string> = {
  aktiv: 'aktiv',
  inaktiv: 'inaktiv (Konto deaktiviert)',
  'nicht-im-ad': 'nicht im AD vorhanden',
  mehrdeutig: 'mehrdeutig — mehrere Konten',
  ungeprueft: 'ungeprüft',
  'ohne-namen': 'kein Name in der Liste',
}

export const STATUS_TEXT: Record<DurchwahlStatus, string> = {
  'in-benutzung': 'in Benutzung',
  pruefen: 'prüfen',
  kuendbar: 'Kündigung möglich',
  ungeprueft: 'ungeprüft',
}

export const OHNE_XELION = 'keine Xelion-Gruppe'

// ── Stufe 1: die Vergabeliste einlesen ──────────────────────────────────────

/**
 * Liest die Vergabeliste und baut daraus die Zeilen. Noch ohne AD — damit steht die
 * Tabelle sofort. Alles bleibt „ungeprüft", und ungeprüft ist nie kündbar.
 */
export async function ladeDurchwahlliste(karenzTage = KARENZ_VORGABE_TAGE): Promise<PruefErgebnis> {
  const warnungen: string[] = []
  let zeilen: DurchwahlZeile[] = []

  try {
    const liste = await loadPhoneList()
    zeilen = liste.entries
      .filter(e => e.nummer !== null)
      .map(e => ({
        durchwahl: String(e.nummer),
        name: (e.user || '').trim(),
        // Die Abteilung kommt aus dem AD, sobald ein Konto gefunden ist. Der Wert aus
        // der Vergabeliste bleibt nur als Rückfallebene erhalten (dort ist er oft veraltet).
        abteilung: '',
        abteilungListe: (e.abt || '').trim(),
        bemerkung: (e.bemerkung || '').trim(),
        zeile: e.row,
        befund: (e.user || '').trim() ? 'ungeprueft' : 'ohne-namen' as AdBefund,
        sam: '', email: '', corpId: '', gefundenAls: '', zuletztOnline: '', rufnummerAd: '',
        rufnummerPasst: null, xelionGruppen: [], traegerAktiv: [],
        status: 'ungeprueft' as DurchwahlStatus, grund: '',
      }))
  } catch (e) {
    warnungen.push(`Vergabeliste nicht lesbar: ${e instanceof Error ? e.message : String(e)}`)
  }

  for (const z of zeilen) stufeEin(z, karenzTage, true)
  zeilen.sort((a, b) => a.durchwahl.localeCompare(b.durchwahl, 'de', { numeric: true }))
  return {
    zeilen, warnungen, geladenAm: new Date().toISOString(), karenzTage,
    gegengeprueft: false,
  }
}

// ── Stufe 2: gegen das AD prüfen ────────────────────────────────────────────

/**
 * Sieht zu jedem Namen aus der Liste im AD nach. Zwei indizierte Abfragen, parallel:
 * die Namenssuche (ANR) und alle Konten mit Rufnummer. Fällt eine davon aus, bleibt
 * alles ungeprüft und nichts kündbar — eine halbe Antwort würde Konten als „nicht
 * vorhanden" ausweisen, die es gibt, und genau daraus entstünde eine Fehlkündigung.
 */
export async function pruefeGegenAd(basis: PruefErgebnis, karenzTage = basis.karenzTage): Promise<PruefErgebnis> {
  const zeilen = basis.zeilen.map(z => ({ ...z }))
  const warnungen = [...basis.warnungen]

  const namen = zeilen.filter(z => z.name).map(z => z.name)
  const [ausNamen, mitNummer] = await Promise.all([
    namen.length
      ? sucheKontenZuNamen(namen)
      : Promise.resolve({ konten: [] as AdKonto[], fehler: undefined as string | undefined }),
    sucheKontenMitRufnummer(),
  ])

  // PLAUSIBILITÄTSSPERRE. Wird zu hunderten Namen KEIN einziges Konto gefunden, ist das
  // kein Befund über die Welt, sondern ein Defekt — kaputte Abfrage, fehlende Rechte,
  // leere Antwort. Ohne diese Sperre würde daraus „niemand existiert" und damit „alles
  // kündbar". Genau das ist am 05.10. real passiert (fehlerhafte JSON-Ausgabe), deshalb
  // steht sie hier.
  const MINDEST_TREFFERQUOTE = 0.2
  const gefunden = new Set(ausNamen.konten.map(k => k.sam || k.name)).size
  const zuWenig = namen.length >= 20 && gefunden < namen.length * MINDEST_TREFFERQUOTE

  const fehler = ausNamen.fehler || mitNummer.fehler
    || (zuWenig
      ? `Zu ${namen.length} Namen kamen nur ${gefunden} AD-Konten zurück. Das ist unplausibel — vermutlich antwortet das AD nicht richtig oder die Rechte fehlen. Die Prüfung wird verworfen, statt alle Namen fälschlich als „nicht vorhanden" zu melden.`
      : '')
  if (fehler) {
    warnungen.push(`AD-Prüfung fehlgeschlagen: ${fehler} Es gilt weiterhin keine Durchwahl als kündbar.`)
    for (const z of zeilen) stufeEin(z, karenzTage, true)
    return { ...basis, zeilen, warnungen, karenzTage, gegengeprueft: false }
  }

  // Beide Trefferlisten für den Namensabgleich zusammenwerfen — die Konten aus der
  // Rufnummern-Abfrage kosten nichts extra und erhöhen die Trefferchance.
  const konten = [...ausNamen.konten]
  const bekannt = new Set(konten.map(k => k.sam || k.name))
  for (const k of mitNummer.konten) if (!bekannt.has(k.sam || k.name)) konten.push(k)

  // Index: verklebte Namensform → Konten
  const nachName = new Map<string, AdKonto[]>()
  for (const k of konten) {
    for (const sch of glueSchluessel(k.name)) nachName.set(sch, [...(nachName.get(sch) ?? []), k])
  }
  // Index: Durchwahl → Konten, die sie im Feld „Rufnummer" tragen
  const nachNummer = new Map<string, AdKonto[]>()
  for (const k of mitNummer.konten) {
    const d = durchwahlVon(k.telefon)
    if (d.length === 4) nachNummer.set(d, [...(nachNummer.get(d) ?? []), k])
  }

  const uebernehmen = (z: DurchwahlZeile, k: AdKonto) => {
    z.befund = k.aktiv ? 'aktiv' : 'inaktiv'
    z.sam = k.sam
    z.email = k.email
    z.corpId = k.corpId
    z.abteilung = k.abteilung
    z.zuletztOnline = k.lastLogon
    z.rufnummerAd = k.telefon
    z.xelionGruppen = k.xelion
    if (k.name && k.name.toLowerCase() !== z.name.toLowerCase()) z.gefundenAls = k.name
    const d = durchwahlVon(k.telefon)
    z.rufnummerPasst = k.telefon ? d === z.durchwahl : null
  }

  // Zuerst der schnelle Schlüsselabgleich, danach der unscharfe Durchlauf nur noch für
  // die paar übrig gebliebenen — so bleibt die Tippfehler-Toleranz erhalten.
  const restlich: DurchwahlZeile[] = []
  for (const z of zeilen) {
    if (z.befund !== 'ungeprueft') continue
    const treffer = new Map<string, AdKonto>()
    for (const sch of glueSchluessel(z.name)) {
      for (const k of nachName.get(sch) ?? []) treffer.set(k.sam || k.name, k)
    }
    const liste = [...treffer.values()]
    if (liste.length === 1) uebernehmen(z, liste[0])
    else if (liste.length > 1) z.befund = 'mehrdeutig'
    else restlich.push(z)
  }
  for (const z of restlich) {
    const liste = konten.filter(k => fuzzyNameMatch(k.name, z.name))
    if (liste.length === 1) uebernehmen(z, liste[0])
    else if (liste.length > 1) z.befund = 'mehrdeutig'
    else z.befund = 'nicht-im-ad'
  }

  // Wer trägt diese Durchwahl im AD — unabhängig vom Namen.
  for (const z of zeilen) {
    z.traegerAktiv = (nachNummer.get(z.durchwahl) ?? [])
      .filter(k => k.aktiv)
      .map(k => k.name)
  }

  const unvollstaendig = warnungen.length > 0
  for (const z of zeilen) stufeEin(z, karenzTage, unvollstaendig)
  zeilen.sort((a, b) => a.durchwahl.localeCompare(b.durchwahl, 'de', { numeric: true }))

  return { zeilen, warnungen, geladenAm: new Date().toISOString(), karenzTage, gegengeprueft: true }
}

// ── Einstufung ───────────────────────────────────────────────────────────────

/**
 * Entscheidet, ob eine Durchwahl gekündigt werden kann. Reihenfolge ist Absicht: erst
 * alles, was DAGEGEN spricht, ganz zum Schluss erst „kündbar". Jeder Zweig trägt seine
 * Begründung mit, damit in Tabelle und Export nachvollziehbar ist, worauf es sich stützt.
 */
function stufeEin(z: DurchwahlZeile, karenzTage: number, unvollstaendig: boolean): void {
  const setze = (s: DurchwahlStatus, grund: string) => { z.status = s; z.grund = grund }

  // Stärkster Hinweis zuerst: die Nummer steht im AD bei einem aktiven Konto.
  // Gilt unabhängig davon, wie der Name in der Liste geschrieben ist.
  if (z.traegerAktiv.length) {
    setze('in-benutzung', `Diese Durchwahl ist im AD bei einem aktiven Konto hinterlegt: ${z.traegerAktiv.join(', ')}.`)
    return
  }

  if (z.befund === 'ungeprueft') { setze('ungeprueft', 'Das AD wurde für diese Zeile noch nicht geprüft.'); return }

  if (z.befund === 'ohne-namen') {
    setze('pruefen', z.bemerkung
      ? `Nicht auf eine Person vergeben — Bemerkung: „${z.bemerkung}".`
      : 'In der Liste frei, auf niemanden vergeben. Ob der freie Nummernvorrat gekündigt werden soll, ist eine Entscheidung, keine Datenfrage.')
    return
  }

  if (z.befund === 'mehrdeutig') { setze('pruefen', 'Mehrere AD-Konten passen zu diesem Namen — von Hand klären.'); return }
  if (z.befund === 'aktiv') { setze('in-benutzung', 'Das AD-Konto ist aktiv.'); return }

  if (z.xelionGruppen.length) {
    setze('in-benutzung', `Xelion-Berechtigung vorhanden (${z.xelionGruppen.join(', ')}).`)
    return
  }

  const tage = tageSeit(z.zuletztOnline)
  if (tage !== null && tage <= karenzTage) {
    setze('in-benutzung', `Letzte Anmeldung vor ${tage} Tagen — innerhalb der Karenzzeit von ${karenzTage} Tagen.`)
    return
  }

  if (z.bemerkung) { setze('pruefen', `Bemerkung in der Liste: „${z.bemerkung}" — vor dem Kündigen ansehen.`); return }
  // Hinter „VGO.EG.Flur", „BMA" oder „1056" steht keine Person. Dass das AD dazu nichts
  // findet, ist selbstverständlich und sagt NICHTS über die Benutzung aus — solche
  // Nummern dürfen deshalb nie automatisch als kündbar gelten.
  if (!siehtNachPersonAus(z.name)) {
    setze('pruefen', `„${z.name}" ist kein Personenname — vermutlich eine Raum-, Funktions- oder Sammelnummer. Das AD kann dazu nichts sagen.`)
    return
  }
  if (z.gefundenAls) { setze('pruefen', `Konto nur über die Namenssuche gefunden („${z.gefundenAls}") — bitte bestätigen.`); return }
  if (unvollstaendig) { setze('pruefen', 'Nicht alle Quellen konnten gelesen werden — solange gilt keine Durchwahl als kündbar.'); return }

  if (z.befund === 'nicht-im-ad') { setze('kuendbar', 'Zu diesem Namen gibt es im AD kein Konto (gezielt nachgesucht).'); return }
  setze('kuendbar', tage === null
    ? 'Konto deaktiviert, keine Anmeldung bekannt.'
    : `Konto deaktiviert, letzte Anmeldung vor ${tage} Tagen (Karenzzeit ${karenzTage} Tage).`)
}

// ── Export ───────────────────────────────────────────────────────────────────

export const SPALTEN = [
  'Markierung',
  'Durchwahl', 'Name (Liste)', 'E-Mail', 'Corp ID', 'Abteilung', 'AD-Status', 'Gefunden als',
  'Zuletzt angemeldet', 'Rufnummer im AD', 'Rufnummer = Durchwahl', 'Xelion-Berechtigung',
  'Durchwahl-Status', 'Begründung', 'Bemerkung',
] as const

/**
 * `markierung` ist der Klartext der von Hand gesetzten Farbe (siehe durchwahlAnsicht.ts).
 * Sie wird als Text hereingegeben, damit dieser Dienst die Ansicht nicht kennen muss —
 * eine Einfuhr von dort wäre ein Ringbezug.
 */
export function zeileAlsArray(z: DurchwahlZeile & { markierung?: string }): string[] {
  return [
    z.markierung || '—',
    z.durchwahl,
    z.name || '—',
    z.email || '—',
    z.corpId || '—',
    z.abteilung || (z.abteilungListe ? `${z.abteilungListe} (Liste)` : '—'),
    BEFUND_TEXT[z.befund],
    z.gefundenAls || '—',
    zuletztOnlineText(z.zuletztOnline),
    // Der Vergleich steht in der eigenen Spalte daneben — hier nur die nackte Nummer.
    z.rufnummerAd || '—',
    passtText(z) || '—',
    z.xelionGruppen.length ? z.xelionGruppen.join(', ') : OHNE_XELION,
    STATUS_TEXT[z.status],
    z.grund || '—',
    z.bemerkung || '—',
  ]
}
