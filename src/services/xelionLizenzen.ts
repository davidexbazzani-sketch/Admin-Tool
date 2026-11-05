// ── Xelion-Lizenzen prüfen: zahlen wir für Lizenzen, die keiner braucht? ─────
//
// Grundlage ist die Lizenzliste des Dienstleisters (Import, siehe xelionLizenzenCsv.ts).
// Zu jedem Eintrag wird nachgesehen:
//   · AD: gibt es das Konto, ist es aktiv, wann zuletzt angemeldet, welche Rufnummer,
//     welche Xelion-Gruppe?
//   · Vergabeliste (Durchwahlliste.xlsx): ist die Durchwahl dort auf diese Person vergeben?
//   · optional, per Knopf: ist Xelion auf dem PC installiert und wann zuletzt benutzt?
//
// Daraus folgt eine EMPFEHLUNG — reine Anzeige, das Werkzeug kündigt nichts. Wie bei der
// Durchwahl-Prüfung gilt: aus „nicht gefunden" wird nie „existiert nicht", solange nicht
// alle Quellen gelesen werden konnten. Funktionskonten und Sammelrufe sind nie „kündbar".

import { api } from '../electronAPI'
import { samePerson } from './personMasterData'
import { ensureDailyAdUsers } from './adUserDirectory'
import { loadPhoneList, type PhoneEntry, type PhoneEntryStatus } from './phoneAssignment'
import {
  sucheKontenMitRufnummer, parseKonten, ausgabeSkript, ldapEsc, durchwahlVon, tageSeit,
  zuletztOnlineText, FELDER, LISTEN_TRENNER, KARENZ_VORGABE_TAGE, type AdKonto,
} from './rufnummerPruefung'
import {
  baueEintraege, statistik, type CsvZeile, type LizenzBasis, type LizenzTyp, type ImportStatistik,
} from './xelionLizenzenCsv'

export { KARENZ_VORGABE_TAGE }

const IMPORT_FILE = 'xelion/lizenzen/import.json'
const IMPORT_VORHER_FILE = 'xelion/lizenzen/import_vorher.json'
const STAND_FILE = 'xelion/lizenzen/stand.json'
const PC_FILE = 'xelion/lizenzen/pc_pruefung.json'

/** Ein PC-Befund gilt so lange als aktuell genug, um in die Empfehlung einzugehen. */
export const PC_FRISCH_TAGE = 30
/** Ältere PC-Befunde werden beim Schreiben verworfen. */
const PC_AUFBEWAHRUNG_TAGE = 365
/** Unter dieser Trefferquote gilt der AD-Abgleich als defekt (siehe Plausibilitätssperre). */
const MINDEST_TREFFERQUOTE = 0.5
/** Domains, die zu uns gehören — alles andere ist „extern". */
const EIGENE_DOMAINS = /@(skf\.com|skfgroup\.onmicrosoft\.com|skf-marine\.com)$/i

// ── Typen ────────────────────────────────────────────────────────────────────

export type AdBefundLizenz = 'aktiv' | 'inaktiv' | 'nicht-im-ad' | 'ungeprueft' | 'entfaellt'

export interface AdTreffer {
  befund: AdBefundLizenz
  /** Woher der Treffer stammt — Transparenz für die Tabelle. */
  quelle: '' | 'rufnummer' | 'xelion-gruppe' | 'verzeichnis' | 'mail' | 'gc'
  sam: string
  anzeigename: string
  abteilung: string
  lastLogon: string
  /** AD-Rufnummer; `null` = nicht ermittelbar (Abfrage fehlgeschlagen). */
  telefon: string | null
  /** Xelion-Gruppen (auch verschachtelt); `null` = nicht ermittelbar. */
  xelionGruppen: string[] | null
}

export interface VergabeTreffer {
  durchwahl: string
  status: PhoneEntryStatus
  name: string
  /** Gefunden über die Nummer aus der Xelion-Liste oder über den Namen. */
  ueber: 'nummer' | 'name'
  /** Steht dort dieselbe Person? */
  passt: boolean
}

export type Empfehlung =
  | 'ungeprueft' | 'kuendbar' | 'pruefen' | 'in-benutzung'
  | 'durchwahl-klaeren' | 'durchwahl-freigeben' | 'unauffaellig'
  | 'funktionskonto' | 'gruppe'

export const EMPFEHLUNG_TEXT: Record<Empfehlung, string> = {
  ungeprueft: 'ungeprüft',
  kuendbar: 'Lizenz kündbar',
  pruefen: 'Lizenz prüfen',
  'in-benutzung': 'in Benutzung',
  'durchwahl-klaeren': 'Durchwahl ohne Lizenz – klären',
  'durchwahl-freigeben': 'Durchwahl freigeben',
  unauffaellig: 'unauffällig',
  funktionskonto: 'Funktionskonto',
  gruppe: 'Gruppenleitung',
}

export const TYP_TEXT: Record<LizenzTyp, string> = {
  person: 'Person',
  funktion: 'Funktionskonto',
  'ohne-user': 'Leitung ohne Benutzer',
  gruppe: 'Gruppenleitung',
}

export const AD_TEXT: Record<AdBefundLizenz, string> = {
  aktiv: 'aktiv',
  inaktiv: 'deaktiviert',
  'nicht-im-ad': 'nicht im AD',
  ungeprueft: 'ungeprüft',
  entfaellt: '—',
}

export interface LizenzEintrag extends LizenzBasis {
  ad: AdTreffer
  vergabe: VergabeTreffer[]
  hinweise: string[]
  empfehlung: Empfehlung
  grund: string
}

export interface LizenzStand {
  version: number
  eintraege: LizenzEintrag[]
  warnungen: string[]
  karenzTage: number
  /** true = der AD-Abgleich ist vollständig durchgelaufen. Vorher ist NICHTS kündbar. */
  gegengeprueft: boolean
  adAm: string
  importAt: string
  importVon: string
  importDatei: string
  updatedAt: string
  updatedBy: string
}

export interface ImportDatei {
  version: number
  datei: string
  importAt: string
  importVon: string
  zeilen: CsvZeile[]
  statistik: ImportStatistik
}

// ── PC-Befunde ───────────────────────────────────────────────────────────────

export interface HostBefund {
  geprueftAm: string
  geprueftVon: string
  erreichbar: boolean
  fehler?: string
  /** Letzter Versuch, falls der Host diesmal nicht erreichbar war (Befund bleibt der alte). */
  letzterVersuch?: string
  version?: string
  /** Gibt es auf dem PC ein Profil dieses Benutzers? */
  profil: boolean
  /** Paket für diesen Benutzer registriert? `null` = unbekannt. */
  installiert: boolean | null
  installState?: string
  /** Neueste Datei im Xelion-Datenordner des Profils (ISO). */
  zuletztGenutzt?: string
  quelle?: string
  /** Datenordner ohne registriertes Paket. */
  reste?: boolean
  laeuft?: boolean
  /** Zuletzt an diesem PC angemeldet (aus dem Profil, ISO). */
  profilZuletzt?: string
}

export interface PcPersonBefund {
  hosts: Record<string, HostBefund>
  /** Zeitpunkt, an dem für diese Person kein PC bekannt war. */
  keinPcAm?: string
}

export interface PcPruefungDatei {
  version: number
  nachSam: Record<string, PcPersonBefund>
  updatedAt: string
}

export type PcZustand = 'genutzt' | 'installiert-ungenutzt' | 'nicht-installiert' | 'nicht-erreichbar' | 'kein-pc' | 'ungeprueft'

export interface PcZusammenfassung {
  zustand: PcZustand
  text: string
  /** Nur frische Befunde zählen für die Empfehlung. */
  frisch: boolean
  tageSeitNutzung: number | null
  host?: string
  geprueftAm?: string
}

export const PC_TEXT: Record<PcZustand, string> = {
  genutzt: 'genutzt',
  'installiert-ungenutzt': 'installiert, nicht genutzt',
  'nicht-installiert': 'nicht installiert',
  'nicht-erreichbar': 'nicht erreichbar',
  'kein-pc': 'kein PC bekannt',
  ungeprueft: 'nicht geprüft',
}

function tageAlt(iso: string | undefined): number | null {
  return iso ? tageSeit(iso) : null
}

/** Fasst die Host-Befunde einer Person zu einer Aussage zusammen. */
export function fassePcZusammen(b: PcPersonBefund | undefined, karenzTage: number): PcZusammenfassung {
  if (!b) return { zustand: 'ungeprueft', text: PC_TEXT.ungeprueft, frisch: false, tageSeitNutzung: null }
  const hosts = Object.entries(b.hosts)
  if (!hosts.length) {
    const alt = tageAlt(b.keinPcAm)
    return {
      zustand: b.keinPcAm ? 'kein-pc' : 'ungeprueft', text: b.keinPcAm ? PC_TEXT['kein-pc'] : PC_TEXT.ungeprueft,
      frisch: alt !== null && alt <= PC_FRISCH_TAGE, tageSeitNutzung: null, geprueftAm: b.keinPcAm,
    }
  }
  const erreicht = hosts.filter(([, h]) => h.erreichbar)
  const neuester = hosts.map(([, h]) => h.geprueftAm).sort().pop()
  const frisch = (tageAlt(neuester) ?? 9999) <= PC_FRISCH_TAGE
  if (!erreicht.length) {
    return { zustand: 'nicht-erreichbar', text: `${PC_TEXT['nicht-erreichbar']} (${hosts.length} PC)`, frisch: false, tageSeitNutzung: null, geprueftAm: neuester }
  }
  // Neueste Nutzungsspur über alle PCs
  let best: { host: string; tage: number } | null = null
  for (const [host, h] of erreicht) {
    const t = tageAlt(h.zuletztGenutzt)
    if (h.installiert && t !== null && (!best || t < best.tage)) best = { host, tage: t }
  }
  const installiertIrgendwo = erreicht.some(([, h]) => h.installiert)
  if (best && best.tage <= karenzTage) {
    return {
      zustand: 'genutzt', text: `genutzt vor ${best.tage} Tagen (${best.host})`, frisch,
      tageSeitNutzung: best.tage, host: best.host, geprueftAm: neuester,
    }
  }
  if (installiertIrgendwo) {
    return {
      zustand: 'installiert-ungenutzt',
      text: best ? `installiert, zuletzt genutzt vor ${best.tage} Tagen (${best.host})` : 'installiert, keine Nutzungsspur',
      frisch, tageSeitNutzung: best?.tage ?? null, host: best?.host, geprueftAm: neuester,
    }
  }
  return {
    zustand: 'nicht-installiert', text: `nicht installiert (${erreicht.length} PC${erreicht.length === 1 ? '' : 's'})`,
    frisch, tageSeitNutzung: null, geprueftAm: neuester,
  }
}

// ── Stufe 1: aus dem Import die Einträge bauen ──────────────────────────────

function leererAd(typ: LizenzTyp): AdTreffer {
  return {
    befund: typ === 'person' ? 'ungeprueft' : 'entfaellt', quelle: '', sam: '', anzeigename: '',
    abteilung: '', lastLogon: '', telefon: null, xelionGruppen: null,
  }
}

export function baueStand(imp: ImportDatei, karenzTage: number, by: string): LizenzStand {
  const eintraege: LizenzEintrag[] = baueEintraege(imp.zeilen).map(b => ({
    ...b, ad: leererAd(b.typ), vergabe: [], hinweise: [], empfehlung: 'ungeprueft', grund: '',
  }))
  const stand: LizenzStand = {
    version: 1, eintraege, warnungen: [], karenzTage, gegengeprueft: false, adAm: '',
    importAt: imp.importAt, importVon: imp.importVon, importDatei: imp.datei,
    updatedAt: new Date().toISOString(), updatedBy: by,
  }
  stufeAlleEin(stand, {})
  return stand
}

export function neueImportDatei(zeilen: CsvZeile[], datei: string, by: string): ImportDatei {
  return {
    version: 1, datei, importAt: new Date().toISOString(), importVon: by, zeilen,
    statistik: statistik(zeilen, baueEintraege(zeilen)),
  }
}

/** Vergleich zum vorigen Import — für die Vorschau vor dem Übernehmen. */
export interface ImportVergleich {
  neu: string[]
  weg: string[]
  lizenzGeaendert: { name: string; vorher: string; nachher: string }[]
  vorherAnzahl: number
}

export function vergleicheImport(vorher: CsvZeile[] | null, nachher: CsvZeile[]): ImportVergleich | null {
  if (!vorher?.length) return null
  const a = new Map(baueEintraege(vorher).filter(e => e.typ !== 'gruppe').map(e => [e.key, e]))
  const b = new Map(baueEintraege(nachher).filter(e => e.typ !== 'gruppe').map(e => [e.key, e]))
  return {
    neu: [...b.keys()].filter(k => !a.has(k)).map(k => b.get(k)!.name),
    weg: [...a.keys()].filter(k => !b.has(k)).map(k => a.get(k)!.name),
    lizenzGeaendert: [...b.values()]
      .filter(e => a.has(e.key) && a.get(e.key)!.lizenz !== e.lizenz)
      .map(e => ({ name: e.name, vorher: a.get(e.key)!.lizenz, nachher: e.lizenz })),
    vorherAnzahl: a.size,
  }
}

// ── Speicher ─────────────────────────────────────────────────────────────────

export async function ladeImport(): Promise<ImportDatei | null> {
  try {
    const d = await api().netReadJson<ImportDatei>(IMPORT_FILE)
    if (d && Array.isArray(d.zeilen)) return d
  } catch { /* noch keiner */ }
  return null
}

/** Übernimmt einen bestätigten Import. Der vorige Stand bleibt als import_vorher.json erhalten. */
export async function speichereImport(imp: ImportDatei): Promise<void> {
  const alt = await ladeImport()
  if (alt) await api().netWriteJson(IMPORT_VORHER_FILE, alt)
  const ok = await api().netWriteJson(IMPORT_FILE, imp)
  if (!ok) throw new Error('Die Lizenzliste konnte nicht auf dem Netzlaufwerk gespeichert werden.')
}

export async function ladeStand(): Promise<LizenzStand | null> {
  try {
    const d = await api().netReadJson<LizenzStand>(STAND_FILE)
    if (d && Array.isArray(d.eintraege)) return d
  } catch { /* noch keiner */ }
  return null
}

/** Nur ein gegengeprüfter Stand wird geteilt — ein halber sähe bei den anderen „fertig" aus. */
export async function speichereStand(s: LizenzStand): Promise<boolean> {
  if (!s.gegengeprueft) return false
  try { return (await api().netWriteJson(STAND_FILE, s)) !== false } catch { return false }
}

/**
 * PC-Befunde lesen. `null` = Datei existiert, ist aber nicht lesbar — dann darf NICHT
 * geschrieben werden, sonst wären alle bisherigen Befunde weg.
 */
export async function ladePcBefunde(): Promise<PcPruefungDatei | null> {
  const leer: PcPruefungDatei = { version: 1, nachSam: {}, updatedAt: '' }
  let roh: unknown
  try { roh = await api().netReadJson<PcPruefungDatei>(PC_FILE) } catch { return null }
  if (roh === null || roh === undefined) {
    // netReadJson liefert null für „fehlt" UND „kaputt" — nur wenn sie wirklich fehlt, neu anfangen.
    let da = true
    try { da = await api().netExists(PC_FILE) } catch { /* Netzlaufwerk weg → nicht schreiben */ }
    return da ? null : leer
  }
  const d = roh as PcPruefungDatei
  if (typeof d !== 'object' || typeof d.nachSam !== 'object' || d.nachSam === null) return null
  return d
}

// Schreibvorgänge dieser Sitzung hintereinander.
let kette: Promise<unknown> = Promise.resolve()
function nacheinander<T>(fn: () => Promise<T>): Promise<T> {
  const next = kette.then(fn, fn)
  kette = next.then(() => {}, () => {})
  return next
}

/**
 * Neue Host-Befunde einmischen: frisch lesen, nur die übergebenen Hosts ersetzen.
 * Bei unerreichbaren Hosts bleibt ein vorhandener Befund stehen; nur der Versuch wird notiert.
 */
export async function speicherePcBefunde(
  neu: Record<string, PcPersonBefund>,
): Promise<PcPruefungDatei> {
  return nacheinander(async () => {
    const d = await ladePcBefunde()
    if (!d) throw new Error('Die Datei mit den PC-Befunden ist nicht lesbar — es wird nichts überschrieben.')
    for (const [sam, b] of Object.entries(neu)) {
      const k = sam.toLowerCase()
      const alt = d.nachSam[k] ?? { hosts: {} }
      const hosts = { ...alt.hosts }
      for (const [host, h] of Object.entries(b.hosts)) {
        const vorher = hosts[host]
        if (!h.erreichbar && vorher?.erreichbar) {
          hosts[host] = { ...vorher, letzterVersuch: h.geprueftAm, fehler: h.fehler }
        } else hosts[host] = h
      }
      d.nachSam[k] = { hosts, keinPcAm: b.keinPcAm ?? (Object.keys(b.hosts).length ? undefined : alt.keinPcAm) }
    }
    // Aufräumen: uralte Befunde weg
    for (const b of Object.values(d.nachSam)) {
      for (const [host, h] of Object.entries(b.hosts)) {
        if ((tageAlt(h.geprueftAm) ?? 0) > PC_AUFBEWAHRUNG_TAGE) delete b.hosts[host]
      }
    }
    d.updatedAt = new Date().toISOString()
    const ok = await api().netWriteJson(PC_FILE, d)
    if (ok === false) throw new Error('PC-Befunde konnten nicht gespeichert werden.')
    return d
  })
}

// ── Stufe 2: AD-Abgleich ─────────────────────────────────────────────────────

const AD_VORSPANN = [
  `$ErrorActionPreference='SilentlyContinue'`,
  `if (-not (Get-Command Get-ADUser -EA SilentlyContinue)) { Write-Output 'FEHLER:Das AD-Modul (RSAT) fehlt auf diesem PC.'; return }`,
]

/**
 * Alle Mitglieder der Xelion-Gruppen — auch verschachtelt (LDAP-Kettenregel). Liefert
 * zusätzlich je Konto die Namen der Xelion-Gruppen (XN), über die es Mitglied ist.
 */
export function xelionGruppenSkript(): string {
  return [
    ...AD_VORSPANN,
    `try { $gs = @(Get-ADGroup -LDAPFilter '(cn=*xelion*)' -EA Stop) } catch { Write-Output ('FEHLER:' + $_.Exception.Message); return }`,
    `$gn=@{}; $r=New-Object System.Collections.ArrayList`,
    `foreach ($g in $gs) {`,
    `  $dn = ([string]$g.DistinguishedName) -replace '\\\\','\\5c' -replace '\\(','\\28' -replace '\\)','\\29' -replace '\\*','\\2a'`,
    `  $m = @(Get-ADUser -LDAPFilter "(memberOf:1.2.840.113556.1.4.1941:=$dn)" -Properties ${FELDER} -ResultSetSize 20000)`,
    `  foreach ($u in $m) { $k=[string]$u.SamAccountName; if (-not $gn.ContainsKey($k)) { $gn[$k]=New-Object System.Collections.ArrayList; [void]$r.Add($u) }; [void]$gn[$k].Add([string]$g.Name) }`,
    `}`,
    ausgabeSkript(
      [`XN=[string](@($gn[[string]$_.SamAccountName]) -join '${LISTEN_TRENNER}')`],
      `ConvertTo-Json -InputObject @{ G=@($gs | ForEach-Object { [string]$_.Name }); K=@($aus) } -Depth 4 -Compress`,
    ),
  ].join('\n')
}

async function sucheXelionGruppenMitglieder(): Promise<{ konten: AdKonto[]; gruppen: string[]; fehler?: string }> {
  const r = await api().runPowerShell(xelionGruppenSkript(), 240000)
  const out = (r.stdout || '').trim()
  if (out.startsWith('FEHLER:')) return { konten: [], gruppen: [], fehler: out.slice(7) }
  if (!out) return { konten: [], gruppen: [], fehler: r.stderr?.trim() || 'Die Abfrage der Xelion-Gruppen lieferte keine Antwort.' }
  try {
    const j = JSON.parse(out) as { G?: unknown; K?: unknown }
    const gruppen = (Array.isArray(j.G) ? j.G : j.G ? [j.G] : []).map(String)
    return { konten: parseKonten(Array.isArray(j.K) ? j.K : j.K ? [j.K] : []), gruppen }
  } catch { return { konten: [], gruppen: [], fehler: 'Antwort der Xelion-Gruppenabfrage nicht lesbar.' } }
}

/** Gezielte Suche für die Reste: E-Mail, UPN, Proxyadressen, Corp ID — erst Domäne, dann Global Catalog. */
export function restSuchSkript(mails: string[], sams: string[], gc: boolean): string {
  const oder = [
    ...mails.flatMap(m => [`(mail=${ldapEsc(m)})`, `(userPrincipalName=${ldapEsc(m)})`, `(proxyAddresses=smtp:${ldapEsc(m)})`]),
    ...sams.map(s => `(sAMAccountName=${ldapEsc(s)})`),
  ].join('')
  return [
    ...AD_VORSPANN,
    gc
      ? `$srv=$null; try { $srv=(Get-ADRootDSE -EA Stop).dnsHostName + ':3268' } catch { Write-Output 'FEHLER:Global Catalog nicht erreichbar.'; return }`
      : `$srv=$null`,
    // Ein Apostroph in einer Adresse („o'neil@…") würde sonst den PowerShell-Text beenden.
    `$p=@{ LDAPFilter='(&(objectCategory=person)(objectClass=user)(|${oder.replace(/'/g, "''")}))'; Properties=@('${FELDER.split(',').join("','")}','proxyAddresses'); ResultSetSize=5000 }`,
    `if ($srv) { $p.Server=$srv }`,
    `try { $r = @(Get-ADUser @p -EA Stop) } catch { Write-Output ('FEHLER:' + $_.Exception.Message); return }`,
    ausgabeSkript([`P=[string](@($_.proxyAddresses | Where-Object { $_ -like 'smtp:*' } | ForEach-Object { $_.Substring(5) }) -join '${LISTEN_TRENNER}')`]),
  ].join('\n')
}

const REST_BLOCK = 60

async function sucheRest(mails: string[], sams: string[], gc: boolean): Promise<{ konten: AdKonto[]; fehler?: string }> {
  const alle: AdKonto[] = []
  // Mails und Corp IDs gemeinsam in Blöcken — eine Abfrage je Block.
  const posten = [...mails.map(m => ({ m })), ...sams.map(s => ({ s }))]
  for (let i = 0; i < posten.length; i += REST_BLOCK) {
    const teil = posten.slice(i, i + REST_BLOCK)
    const ps = restSuchSkript(
      teil.flatMap(x => ('m' in x && x.m ? [x.m] : [])),
      teil.flatMap(x => ('s' in x && x.s ? [x.s] : [])), gc)
    const r = await api().runPowerShell(ps, 120000)
    const out = (r.stdout || '').trim()
    if (out.startsWith('FEHLER:')) return { konten: alle, fehler: out.slice(7) }
    if (!out) return { konten: alle, fehler: r.stderr?.trim() || 'Die Einzelsuche im AD lieferte keine Antwort.' }
    try { alle.push(...parseKonten(out)) } catch { return { konten: alle, fehler: 'Antwort der Einzelsuche nicht lesbar.' } }
  }
  return { konten: alle }
}

/** Liest die Rufnummer gezielt je sAMAccountName (indiziert, in Blöcken). */
export function rufnummernSkript(sams: string[]): string {
  const oder = sams.map(s => `(sAMAccountName=${ldapEsc(s)})`).join('').replace(/'/g, "''")
  return [
    ...AD_VORSPANN,
    `try { $r = @(Get-ADUser -LDAPFilter '(&(objectCategory=person)(objectClass=user)(|${oder}))' -Properties telephoneNumber -ResultSetSize 5000 -EA Stop) }`,
    `catch { Write-Output ('FEHLER:' + $_.Exception.Message); return }`,
    `ConvertTo-Json -InputObject @($r | ForEach-Object { [pscustomobject]@{ S=[string]$_.SamAccountName; T=[string]$_.telephoneNumber } }) -Compress`,
  ].join('\n')
}

const NUMMER_BLOCK = 100

/**
 * Rufnummern für Konten, die nur aus dem Tagesverzeichnis bekannt sind (das kennt keine
 * Rufnummer). Die Sammelabfrage „alle Konten mit Rufnummer" reicht dafür nicht: in
 * einer großen Domäne ist sie gedeckelt, und wer jenseits der Grenze liegt, stünde
 * sonst fälschlich ohne Nummer da.
 */
async function sucheRufnummernZuSams(sams: string[]): Promise<{ nachSam: Map<string, string>; fehler?: string }> {
  const nachSam = new Map<string, string>()
  const liste = [...new Set(sams.map(s => s.trim()).filter(Boolean))]
  for (let i = 0; i < liste.length; i += NUMMER_BLOCK) {
    const r = await api().runPowerShell(rufnummernSkript(liste.slice(i, i + NUMMER_BLOCK)), 120000)
    const out = (r.stdout || '').trim()
    if (out.startsWith('FEHLER:')) return { nachSam, fehler: out.slice(7) }
    if (!out) return { nachSam, fehler: r.stderr?.trim() || 'Die Rufnummern-Nachsuche lieferte keine Antwort.' }
    try {
      const j = JSON.parse(out) as unknown
      const arr = (Array.isArray(j) ? j : j ? [j] : []) as { S?: unknown; T?: unknown }[]
      for (const x of arr) if (x.S) nachSam.set(String(x.S).toLowerCase(), String(x.T ?? '').trim())
    } catch { return { nachSam, fehler: 'Antwort der Rufnummern-Nachsuche nicht lesbar.' } }
  }
  return { nachSam }
}

/** Fortschritt für die Anzeige. */
export type AdSchritt = (text: string) => void

/**
 * Gleicht alle Personen gegen das AD ab. Drei Massenabfragen (Tagesverzeichnis, alle
 * Konten mit Rufnummer, alle Mitglieder der Xelion-Gruppen) und für den Rest gezielte
 * Suchen in Blöcken. Fällt eine Massenabfrage aus oder ist die Trefferquote unplausibel,
 * bleibt der Stand „nicht gegengeprüft" — und dann ist nichts kündbar.
 */
export async function pruefeLizenzenGegenAd(
  basis: LizenzStand, pc: PcPruefungDatei | null, by: string, schritt?: AdSchritt,
): Promise<LizenzStand> {
  const stand: LizenzStand = {
    ...basis,
    eintraege: basis.eintraege.map(e => ({ ...e, ad: leererAd(e.typ), vergabe: [], hinweise: [] })),
    warnungen: [],
  }
  const warn = (w: string) => stand.warnungen.push(w)

  schritt?.('AD: Tagesverzeichnis, Rufnummern und Xelion-Gruppen werden gelesen …')
  const [verz, mitNummer, gruppen, vergabe] = await Promise.all([
    ensureDailyAdUsers().catch(e => ({ dir: null, refreshed: false, error: String(e) })),
    sucheKontenMitRufnummer().catch(e => ({ konten: [] as AdKonto[], fehler: String(e) })),
    sucheXelionGruppenMitglieder().catch(e => ({ konten: [] as AdKonto[], gruppen: [] as string[], fehler: String(e) })),
    loadPhoneList().then(l => l.entries).catch(e => { warn(`Vergabeliste nicht lesbar: ${e instanceof Error ? e.message : String(e)}`); return null }),
  ])

  if (mitNummer.fehler) warn(`Rufnummern-Abfrage fehlgeschlagen: ${mitNummer.fehler}`)
  if (gruppen.fehler) warn(`Abfrage der Xelion-Gruppen fehlgeschlagen: ${gruppen.fehler}`)
  if (!verz.dir) warn('Das zentrale AD-Verzeichnis ist nicht verfügbar — es wird gezielt nachgesucht (dauert länger).')
  const telefonSicher = !mitNummer.fehler
  const gruppenSicher = !gruppen.fehler
  if (gruppenSicher && !gruppen.gruppen.length) warn('Im AD wurde keine Gruppe mit „xelion" im Namen gefunden — die Spalte „Xelion-Gruppe" bleibt leer.')

  // ── Index aller bekannten Konten ──
  type Konto = { k: AdKonto; quelle: AdTreffer['quelle'] }
  const nachSchluessel = new Map<string, Konto>()
  const merke = (k: AdKonto, quelle: AdTreffer['quelle']) => {
    for (const s of [k.email, k.upn, k.sam, ...k.proxies]) {
      const key = (s || '').trim().toLowerCase()
      if (!key) continue
      const vorher = nachSchluessel.get(key)
      // Treffer aus den vollständigen Abfragen gehen vor
      if (!vorher || vorher.quelle === 'verzeichnis') nachSchluessel.set(key, { k, quelle })
    }
  }
  for (const u of verz.dir?.users ?? []) {
    merke({
      name: u.displayName, sam: u.sam, abteilung: u.department || '', email: u.email || '', corpId: '',
      aktiv: u.enabled, lastLogon: u.lastLogon || '', telefon: '', xelion: [], upn: '', proxies: [], xelionAlle: [],
    }, 'verzeichnis')
  }
  for (const k of mitNummer.konten) merke(k, 'rufnummer')
  for (const k of gruppen.konten) merke(k, 'xelion-gruppe')

  // Telefon und Gruppen je sam (die Konten aus dem Verzeichnis kennen beides nicht)
  const telNachSam = new Map(mitNummer.konten.map(k => [k.sam.toLowerCase(), k.telefon]))
  const grpNachSam = new Map(gruppen.konten.map(k => [k.sam.toLowerCase(), k.xelionAlle.length ? k.xelionAlle : k.xelion]))

  const personen = stand.eintraege.filter(e => e.typ === 'person')
  const finde = (e: LizenzEintrag) => nachSchluessel.get(e.email) ?? (e.samAusMail ? nachSchluessel.get(e.samAusMail.toLowerCase()) : undefined)

  // ── Reste gezielt nachsuchen: Domäne, dann Global Catalog ──
  let restFehler = ''
  for (const gc of [false, true]) {
    const offen = personen.filter(e => !finde(e))
    if (!offen.length) break
    schritt?.(`AD: ${offen.length} Personen werden gezielt ${gc ? 'im Global Catalog' : 'in der Domäne'} gesucht …`)
    const r = await sucheRest(offen.map(e => e.email), offen.map(e => e.samAusMail).filter(Boolean), gc)
    for (const k of r.konten) merke(k, gc ? 'gc' : 'mail')
    if (r.fehler) { restFehler = r.fehler; if (!gc) break }
  }
  if (restFehler) warn(`Gezielte Nachsuche unvollständig: ${restFehler}`)

  // ── Übernehmen ──
  let gefunden = 0
  for (const e of personen) {
    const t = finde(e)
    if (!t) continue
    gefunden++
    const k = t.k
    const sam = k.sam.toLowerCase()
    e.ad = {
      befund: k.aktiv ? 'aktiv' : 'inaktiv',
      quelle: t.quelle,
      sam: k.sam,
      anzeigename: k.name,
      abteilung: k.abteilung,
      lastLogon: k.lastLogon,
      // Konten nur aus dem Tagesverzeichnis: Rufnummer unten gezielt nachlesen.
      telefon: telNachSam.has(sam) ? telNachSam.get(sam) || '' : (k.telefon || (t.quelle === 'verzeichnis' || !telefonSicher ? null : '')),
      xelionGruppen: grpNachSam.has(sam) ? grpNachSam.get(sam)! : (gruppenSicher ? [] : null),
    }
  }

  const unvollstaendig = !!(mitNummer.fehler || gruppen.fehler || restFehler)
  for (const e of personen) {
    if (e.ad.befund !== 'ungeprueft') continue
    // „nicht im AD" erst, wenn wirklich alle Quellen gelesen werden konnten
    if (!unvollstaendig) e.ad.befund = 'nicht-im-ad'
  }

  // PLAUSIBILITÄTSSPERRE (wie bei der Durchwahl-Prüfung): findet der Abgleich zu hunderten
  // Personen kaum Konten, ist das ein Defekt, kein Befund — sonst wäre plötzlich alles kündbar.
  const zuWenig = personen.length >= 20 && gefunden < personen.length * MINDEST_TREFFERQUOTE
  if (zuWenig) {
    warn(`Zu ${personen.length} Personen wurden nur ${gefunden} AD-Konten gefunden. Das ist unplausibel — der Abgleich wird verworfen, statt Lizenzen fälschlich als kündbar zu melden.`)
  }
  stand.gegengeprueft = !unvollstaendig && !zuWenig

  // ── Funktionskonten: nur zur Anzeige im AD nachsehen (über sam = userName) ──
  for (const e of stand.eintraege) {
    if (e.typ !== 'funktion') continue
    const t = nachSchluessel.get(e.userName.toLowerCase())
    if (t) {
      e.ad = {
        ...leererAd('funktion'), befund: t.k.aktiv ? 'aktiv' : 'inaktiv', quelle: t.quelle, sam: t.k.sam,
        anzeigename: t.k.name, abteilung: t.k.abteilung, lastLogon: t.k.lastLogon,
        telefon: telNachSam.get(t.k.sam.toLowerCase()) || t.k.telefon || null,
      }
    }
  }

  // ── Rufnummern nachlesen, wo noch keine sicher feststeht ──
  const ohneNummer = stand.eintraege.filter(e => e.ad.sam && e.ad.telefon === null)
  if (ohneNummer.length) {
    schritt?.(`AD: Rufnummern für ${ohneNummer.length} Konten werden gezielt gelesen …`)
    const nach = await sucheRufnummernZuSams(ohneNummer.map(e => e.ad.sam))
    for (const e of ohneNummer) {
      const sam = e.ad.sam.toLowerCase()
      // Konto gefunden → seine Nummer (auch „keine"); nicht gefunden → bleibt „nicht ermittelt"
      if (nach.nachSam.has(sam)) e.ad.telefon = nach.nachSam.get(sam)!
    }
    // Ohne gesicherte Rufnummer darf nichts als kündbar gelten
    if (nach.fehler) { warn(`Rufnummern-Nachsuche unvollständig: ${nach.fehler}`); stand.gegengeprueft = false }
  }

  ordneVergabeZu(stand, vergabe)
  stand.adAm = new Date().toISOString()
  stand.updatedAt = stand.adAm
  stand.updatedBy = by
  stufeAlleEin(stand, pc?.nachSam ?? {})
  return stand
}

/** Vergabeliste: über die Durchwahl aus Xelion und über den Namen. */
function ordneVergabeZu(stand: LizenzStand, eintraege: PhoneEntry[] | null): void {
  if (!eintraege) return
  const nachNummer = new Map<string, PhoneEntry>()
  for (const p of eintraege) if (p.nummer !== null) nachNummer.set(String(p.nummer).padStart(4, '0'), p)
  for (const e of stand.eintraege) {
    if (e.typ === 'gruppe') continue
    const treffer: VergabeTreffer[] = []
    const namen = [e.name, e.ad.anzeigename].filter(Boolean)
    const passt = (user: string) => !!user && namen.some(n => samePerson(user, n))
    for (const d of e.durchwahlen) {
      const p = nachNummer.get(d)
      if (p) treffer.push({ durchwahl: d, status: p.status, name: (p.user || '').trim(), ueber: 'nummer', passt: passt(p.user) })
    }
    if (e.typ === 'person') {
      for (const p of eintraege) {
        if (p.nummer === null || p.status !== 'vergeben' || !passt(p.user)) continue
        const d = String(p.nummer).padStart(4, '0')
        if (!treffer.some(t => t.durchwahl === d)) treffer.push({ durchwahl: d, status: p.status, name: p.user.trim(), ueber: 'name', passt: true })
      }
    }
    e.vergabe = treffer
  }
}

// ── Einstufung ───────────────────────────────────────────────────────────────

/** Welche Rufnummern-Quellen gibt es für den Eintrag? */
export function nummernQuellen(e: LizenzEintrag): { xelion: boolean; vergabe: boolean; ad: boolean } {
  return {
    xelion: e.nummern.length > 0,
    vergabe: e.vergabe.some(v => v.passt && v.status === 'vergeben'),
    ad: !!(e.ad.telefon && durchwahlVon(e.ad.telefon).length === 4),
  }
}

function sammleHinweise(e: LizenzEintrag): string[] {
  const h = [...e.listenHinweise]
  const adDw = e.ad.telefon ? durchwahlVon(e.ad.telefon) : ''
  if (adDw && e.durchwahlen.length && !e.durchwahlen.includes(adDw)) {
    h.push(`AD-Rufnummer endet auf ${adDw}, in Xelion steht ${e.durchwahlen.join(', ')}.`)
  }
  if (adDw && !e.nummern.length) h.push(`Im AD steht die Rufnummer ${e.ad.telefon}, in Xelion keine.`)
  for (const v of e.vergabe) {
    if (v.ueber === 'nummer' && v.status !== 'vergeben') h.push(`In der Vergabeliste ist ${v.durchwahl} als „${v.status}" geführt.`)
    else if (v.ueber === 'nummer' && v.name && !v.passt) h.push(`In der Vergabeliste ist ${v.durchwahl} an „${v.name}" vergeben.`)
    else if (v.ueber === 'name' && !e.durchwahlen.includes(v.durchwahl)) h.push(`Vergabeliste: ${v.durchwahl} ist auf diesen Namen vergeben, in Xelion nicht.`)
  }
  if (e.typ === 'person' && e.email && !EIGENE_DOMAINS.test(e.email)) h.push('Externe E-Mail-Adresse.')
  if (e.umleitungAktiv && e.umleitung) h.push(`Umleitung aktiv auf ${e.umleitung}${e.umleitungDefekt ? ' (Wert von Excel zerstört)' : ''}.`)
  if (e.lizenz === 'ja' && e.ad.xelionGruppen && !e.ad.xelionGruppen.length && e.typ === 'person') h.push('Lizenz, aber in keiner Xelion-Gruppe im AD.')
  if (e.chatLinien) h.push(`${e.chatLinien} Chat-Leitung(en).`)
  return [...new Set(h)]
}

function anmeldeText(e: LizenzEintrag): string {
  const t = tageSeit(e.ad.lastLogon)
  return t === null ? 'keine Anmeldung bekannt' : `letzte Anmeldung vor ${t} Tagen`
}

/**
 * Entscheidet die Empfehlung. Reihenfolge ist Absicht: erst alles, was gegen ein
 * Kündigen spricht, dann erst „kündbar". Jeder Zweig trägt seine Begründung.
 */
export function stufeLizenzEin(
  e: LizenzEintrag, karenzTage: number, gegengeprueft: boolean, pcRoh: PcPersonBefund | undefined,
  alleNachName?: Map<string, LizenzEintrag>,
): void {
  const setze = (x: Empfehlung, grund: string) => { e.empfehlung = x; e.grund = grund }
  e.hinweise = sammleHinweise(e)
  const nr = e.durchwahlen.length ? e.durchwahlen.join(', ') : e.nummern.map(n => '+' + n).join(', ')

  if (e.typ === 'gruppe') {
    const mitglieder = e.mitglieder.map(m => alleNachName?.get(m.toLowerCase())).filter(Boolean) as LizenzEintrag[]
    const personen = mitglieder.filter(m => m.typ === 'person')
    if (personen.length && personen.every(m => m.ad.befund === 'inaktiv' || m.ad.befund === 'nicht-im-ad')) {
      e.hinweise.push('Alle Personen in diesem Sammelruf sind im AD deaktiviert oder nicht vorhanden.')
    }
    setze('gruppe', `Sammelruf mit ${e.mitglieder.length} Mitglied(ern) — wird nie als kündbar vorgeschlagen.`)
    return
  }
  if (e.typ === 'funktion' || e.typ === 'ohne-user') {
    if (e.lizenz === 'ja' && !e.nummern.length) e.hinweise.push('Lizenz ohne Rufnummer.')
    const lz = e.lizenz === 'ja' ? 'mit Lizenz' : 'ohne Lizenz'
    setze('funktionskonto', `${e.typ === 'funktion' ? 'Funktionskonto' : 'Leitung ohne Benutzer'} ${lz}${nr ? `, Nummer ${nr}` : ', keine Nummer'} — wird nie als kündbar vorgeschlagen.`)
    return
  }

  // ── Personen ──
  if (!gegengeprueft || e.ad.befund === 'ungeprueft') {
    setze('ungeprueft', 'Der AD-Abgleich ist noch nicht vollständig durchgelaufen — solange gilt nichts als kündbar.')
    return
  }

  const q = nummernQuellen(e)
  const irgendeineNummer = q.xelion || q.vergabe || q.ad
  const pc = fassePcZusammen(pcRoh, karenzTage)
  const tage = tageSeit(e.ad.lastLogon)
  const inGruppe = !!e.ad.xelionGruppen?.length
  const extern = !!e.email && !EIGENE_DOMAINS.test(e.email)

  if (e.lizenz === 'ja') {
    if (pc.zustand === 'genutzt' && pc.frisch) {
      setze('in-benutzung', `Xelion am PC ${pc.host} vor ${pc.tageSeitNutzung} Tagen benutzt.`)
      return
    }
    if (e.ad.befund === 'nicht-im-ad' && extern) {
      setze('pruefen', 'Externe Adresse ohne AD-Konto — vermutlich ein Dienstleister. Bitte von Hand klären.')
      return
    }
    if (e.ad.befund === 'nicht-im-ad') {
      setze('kuendbar', 'Zu dieser Adresse gibt es kein AD-Konto (E-Mail, UPN, Proxyadressen und Global Catalog durchsucht).')
      return
    }
    if (e.ad.befund === 'inaktiv') {
      setze('kuendbar', `AD-Konto deaktiviert, ${anmeldeText(e)}.`)
      return
    }
    if (!irgendeineNummer && !e.sammelrufe.length) {
      setze('kuendbar', 'Lizenz ohne Rufnummer — weder in Xelion noch in Vergabeliste oder AD. Xelion ist so nicht nutzbar.')
      return
    }
    if (!q.xelion) {
      setze('pruefen', e.sammelrufe.length && !q.vergabe && !q.ad
        ? `Keine eigene Nummer, nur Mitglied im Sammelruf ${e.sammelrufe.join(', ')} — braucht es dafür eine eigene Lizenz?`
        : 'In Xelion keine Nummer, aber in Vergabeliste bzw. AD steht eine — Nummer in Xelion fehlt oder Lizenz überflüssig.')
      return
    }
    if (tage === null || tage > karenzTage) {
      setze('pruefen', tage === null
        ? 'Konto aktiv, aber keine Anmeldung bekannt.'
        : `Konto aktiv, aber seit ${tage} Tagen nicht angemeldet (Karenzzeit ${karenzTage} Tage).`)
      return
    }
    if (pc.frisch && (pc.zustand === 'nicht-installiert' || pc.zustand === 'installiert-ungenutzt')) {
      setze('pruefen', `PC-Prüfung: ${pc.text}. Ob die Handy-App genutzt wird, kann das Tool nicht sehen.`)
      return
    }
    setze('in-benutzung', `Konto aktiv, Nummer ${nr}, ${anmeldeText(e)}${inGruppe ? `, Xelion-Gruppe ${e.ad.xelionGruppen!.join(', ')}` : ''}.`)
    return
  }

  // Ohne Lizenz
  if (!irgendeineNummer) {
    setze('unauffaellig', 'Keine Lizenz und keine Rufnummer.')
    return
  }
  const woher = [q.xelion && `Xelion ${nr}`, q.vergabe && 'Vergabeliste', q.ad && `AD ${e.ad.telefon}`].filter(Boolean).join(', ')
  if (e.ad.befund === 'inaktiv' || e.ad.befund === 'nicht-im-ad') {
    setze('durchwahl-freigeben', `Rufnummer vorhanden (${woher}), aber ${e.ad.befund === 'inaktiv' ? `das AD-Konto ist deaktiviert (${anmeldeText(e)})` : 'kein AD-Konto'} — Durchwahl in Xelion und Vergabeliste freigeben.`)
    return
  }
  const tendenz = (pc.zustand === 'genutzt' && pc.frisch) ? 'eher Lizenz nötig: Xelion wird am PC benutzt'
    : inGruppe ? `eher Lizenz nötig: Xelion-Gruppe ${e.ad.xelionGruppen!.join(', ')}`
    : (tage === null || tage > karenzTage) ? `eher freigeben: ${anmeldeText(e)}`
    : (e.umleitungAktiv ? 'Rufnummer wird umgeleitet' : 'offen')
  setze('durchwahl-klaeren', `Rufnummer vorhanden (${woher}), Konto aktiv, aber keine Lizenz — Lizenz nötig oder Durchwahl freigeben? Tendenz: ${tendenz}.`)
}

export function stufeAlleEin(stand: LizenzStand, pc: Record<string, PcPersonBefund>): void {
  const nachName = new Map(stand.eintraege.filter(e => e.userName).map(e => [e.userName.toLowerCase(), e]))
  // Personen und Konten zuerst, Sammelrufe danach (sie schauen auf ihre Mitglieder).
  const reihenfolge = [...stand.eintraege].sort((a, b) => Number(a.typ === 'gruppe') - Number(b.typ === 'gruppe'))
  for (const e of reihenfolge) {
    stufeLizenzEin(e, stand.karenzTage, stand.gegengeprueft, e.ad.sam ? pc[e.ad.sam.toLowerCase()] : undefined, nachName)
  }
}

// ── Anzeige / Export ─────────────────────────────────────────────────────────

export const LIZENZ_TEXT: Record<LizenzBasis['lizenz'], string> = { ja: 'Ja', nein: 'Nein', leer: '—' }

export function vergabeText(e: LizenzEintrag): string {
  if (!e.vergabe.length) return ''
  return e.vergabe.map(v => `${v.durchwahl} · ${v.status === 'vergeben' ? (v.name || 'vergeben') : v.status}${v.passt ? '' : ' (≠)'}`).join('; ')
}

export function adNummerText(e: LizenzEintrag): string {
  if (e.ad.telefon === null) return e.ad.befund === 'entfaellt' ? '' : 'nicht ermittelt'
  return e.ad.telefon
}

export const EXPORT_SPALTEN = [
  'Typ', 'Name', 'Benutzer (Xelion)', 'Abteilung', 'Lizenz', 'Rufnummer (Xelion)', 'Durchwahl',
  'Vergabeliste', 'Rufnummer im AD', 'AD-Status', 'Corp ID', 'Zuletzt angemeldet', 'Xelion-Gruppe (AD)',
  'Sammelrufe', 'Xelion-Status', 'Umleitung', 'Zugewiesene Geräte', 'PC-Prüfung', 'Empfehlung', 'Begründung', 'Hinweise',
] as const

export function eintragAlsArray(e: LizenzEintrag, pcText: string, geraeteText = ''): string[] {
  return [
    TYP_TEXT[e.typ],
    e.name,
    e.userName || '—',
    e.ad.abteilung || '—',
    LIZENZ_TEXT[e.lizenz],
    e.nummern.map(n => '+' + n).join(', ') || '—',
    e.durchwahlen.join(', ') || '—',
    vergabeText(e) || '—',
    adNummerText(e) || '—',
    AD_TEXT[e.ad.befund],
    e.ad.sam || '—',
    e.ad.befund === 'entfaellt' ? '—' : zuletztOnlineText(e.ad.lastLogon),
    e.ad.xelionGruppen === null ? '—' : e.ad.xelionGruppen.join(', ') || 'keine',
    e.sammelrufe.join(', ') || '—',
    e.userStatus || '—',
    e.umleitungAktiv ? (e.umleitung || 'aktiv') : '—',
    geraeteText || '—',
    pcText || '—',
    EMPFEHLUNG_TEXT[e.empfehlung],
    e.grund,
    e.hinweise.join(' ') || '—',
  ]
}
