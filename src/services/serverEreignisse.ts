// ── Server-Monitor: Ereignisse (Ausfall, wieder erreichbar, Neustart) ─────────
// Erkannt im Ping-Zyklus (offline/wieder da) und in der Reboot-Abfrage (neue
// Startzeit). Jedes Ereignis wird EINMAL angelegt (feste ID) und dann:
//   • in die Server-Historie geschrieben,
//   • per Mail an die Adresse der Kachel geschickt (wenn dort angehakt),
//   • bei Neustarts jedem Admin als Popup oben rechts gezeigt, bis ER „Gelesen" klickt.
// Ob ein Neustart geplant oder unerwartet war, liest detailsZuNeustarts() aus dem
// System-Ereignisprotokoll des Servers (1074 = geplant, 41/6008 = unerwartet).
//
// Ablage (Tool-Netzordner):
//   server_monitor/ereignisse.json          gemeinsame Liste (begrenzt auf 60 Tage)
//   server_monitor/gelesen/<user>.json      welche Neustart-Meldungen DIESER Nutzer gelesen hat

import { api } from '../electronAPI'
import { addHistoryEntry } from './serverHistory'

const DATEI = 'server_monitor/ereignisse.json'
const gelesenDatei = (u: string) => `server_monitor/gelesen/${(u || 'unbekannt').toLowerCase().replace(/[^a-z0-9._-]/g, '_')}.json`
const BEHALTEN_TAGE = 60
/** Popup nur für Neustarts der letzten 48 Stunden (ältere stehen in der Historie). */
export const POPUP_STUNDEN = 48
export const MONITOR_ABSENDER = 'IT Admin Tool (Server-Monitor)'

export type EreignisTyp = 'offline' | 'wieder-online' | 'neustart' | 'pruefung' | 'zertifikat'
/** Zertifikat läuft ab (30 / 5 Tage vorher, abgelaufen) — aus serverZertifikate.ts */
export interface ZertMeldung {
  cn: string; bis: string; tage: number; thumb: string; verwendung: string
  aussteller?: string; schwelle: '30' | '5' | 'abgelaufen'; san?: string[]; vorlage?: string; selbst?: boolean
}
export type NeustartArt = 'geplant' | 'unerwartet' | 'unbekannt'

export interface ServerEreignis {
  id: string                 // typ|HOST|zeitstempel — je Vorfall eindeutig
  typ: EreignisTyp
  host: string
  bezeichnung?: string
  ip?: string
  at: string                 // ISO — wann erkannt
  boot?: string              // neue Startzeit (yyyy-MM-dd HH:mm, Serverzeit)
  vorherBoot?: string
  art?: NeustartArt
  /** geplant: wurde ausgeschaltet/heruntergefahren oder „nur" neu gestartet? (1074, Typ) */
  aktion?: 'neustart' | 'herunterfahren'
  /** wann heruntergefahren wurde (1074 bzw. 6006, Serverzeit yyyy-MM-dd HH:mm) */
  ausAm?: string
  grund?: string             // Klartext (Auslöser, Grund, Benutzer)
  dauerMin?: number          // wieder-online: wie lange nicht erreichbar
  probleme?: string[]        // pruefung: was nicht in Ordnung ist (je Zeile ein Prüfpunkt)
  zert?: ZertMeldung         // zertifikat
  mail?: 'gesendet' | 'fehler' | 'aus'
}

interface Datei { ereignisse: ServerEreignis[] }

export async function ladeEreignisse(): Promise<ServerEreignis[] | null> {
  const d = await api().netReadJsonAsync<Datei>(DATEI).catch(() => undefined)
  if (d === undefined) return null
  return Array.isArray(d?.ereignisse) ? d!.ereignisse : []
}

/**
 * Neue Ereignisse anfügen (doppelte IDs werden übersprungen). Liefert nur die
 * wirklich NEU angelegten zurück — nur für die gibt es Mail/Historie.
 */
async function fuegeHinzu(neu: ServerEreignis[]): Promise<ServerEreignis[]> {
  if (!neu.length) return []
  const alt = await ladeEreignisse()
  if (alt === null) return []        // Datei nicht lesbar → nichts überschreiben
  const ids = new Set(alt.map(e => e.id))
  const wirklich = neu.filter(e => !ids.has(e.id))
  if (!wirklich.length) return []
  const grenze = Date.now() - BEHALTEN_TAGE * 86400_000
  const liste = [...wirklich, ...alt].filter(e => new Date(e.at).getTime() > grenze).slice(0, 500)
  const ok = await api().netWriteJsonAsync(DATEI, { ereignisse: liste }).catch(() => false)
  return ok ? wirklich : []
}

async function setzeMailStatus(ids: string[], status: ServerEreignis['mail']): Promise<void> {
  if (!ids.length) return
  const alt = await ladeEreignisse()
  if (!alt) return
  const set = new Set(ids)
  await api().netWriteJsonAsync(DATEI, { ereignisse: alt.map(e => set.has(e.id) ? { ...e, mail: status } : e) }).catch(() => false)
}

export async function ladeGelesen(user: string): Promise<Set<string>> {
  const d = await api().netReadJsonAsync<{ ids?: string[] }>(gelesenDatei(user)).catch(() => null)
  return new Set(Array.isArray(d?.ids) ? d!.ids : [])
}

export async function markiereGelesen(user: string, ids: string[]): Promise<boolean> {
  const alt = await ladeGelesen(user)
  const alle = await ladeEreignisse()
  const bekannt = new Set((alle || []).map(e => e.id))
  const neu = [...new Set([...alt, ...ids])].filter(id => bekannt.has(id) || ids.includes(id))
  return api().netWriteJsonAsync(gelesenDatei(user), { ids: neu, am: new Date().toISOString() }).catch(() => false)
}

/** Neustart- und Prüf-Meldungen, die ICH noch nicht gelesen habe (für das Popup). */
export function offeneNeustarts(alle: ServerEreignis[], gelesen: Set<string>, jetzt = Date.now()): ServerEreignis[] {
  return alle
    .filter(e => (e.typ === 'neustart' || e.typ === 'pruefung' || e.typ === 'zertifikat') && !gelesen.has(e.id) && jetzt - new Date(e.at).getTime() < POPUP_STUNDEN * 3600_000)
    .sort((a, b) => b.at.localeCompare(a.at))
}

// ── Texte ────────────────────────────────────────────────────────────────────
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const bootText = (b?: string) => {
  if (!b) return '—'
  const d = new Date(b.replace(' ', 'T'))
  return isNaN(d.getTime()) ? b : zeit(d.toISOString())
}
const name = (e: ServerEreignis) => `${e.host}${e.bezeichnung ? ` (${e.bezeichnung})` : ''}`

/** Überschrift einer Neustart-Meldung (Popup, Windows-Hinweis, Mail-Betreff). */
export function neustartUeberschrift(e: Pick<ServerEreignis, 'art' | 'aktion'>, laut = false): string {
  if (e.art === 'unerwartet') return laut ? 'Server UNERWARTET ausgefallen und neu gestartet' : 'Server unerwartet ausgefallen und neu gestartet'
  if (e.aktion === 'herunterfahren') return 'Server heruntergefahren und wieder gestartet'
  return 'Server neu gestartet'
}

const datum = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
/** „läuft in 5 Tagen ab" / „läuft morgen ab" / „ABGELAUFEN" */
export function zertFrist(z: Pick<ZertMeldung, 'tage'>, laut = false): string {
  if (isNaN(z.tage) || z.tage < 0) return laut ? 'ABGELAUFEN' : 'abgelaufen'
  if (z.tage === 0) return 'läuft heute ab'
  if (z.tage === 1) return 'läuft morgen ab'
  return `läuft in ${z.tage} Tagen ab`
}

export function titelVon(e: ServerEreignis): string {
  if (e.typ === 'zertifikat' && e.zert) return `Zertifikat ${zertFrist(e.zert, true)}: ${e.zert.cn} auf ${e.host}`
  if (e.typ === 'offline') return `Server offline: ${e.host}`
  if (e.typ === 'wieder-online') return `Server wieder erreichbar: ${e.host}`
  if (e.typ === 'pruefung') return `Server-Prüfung: ${e.probleme?.length || 0} Problem${(e.probleme?.length || 0) === 1 ? '' : 'e'} auf ${e.host}`
  return `${neustartUeberschrift(e, true)}: ${e.host}`
}

/** Art eines Neustarts in einem Satz (Mail, Popup). */
export function artText(e: Pick<ServerEreignis, 'art' | 'aktion'>): string {
  if (e.art === 'geplant') return e.aktion === 'herunterfahren' ? 'geplant — sauber heruntergefahren (ausgeschaltet) und wieder gestartet' : 'geplant — sauber heruntergefahren und neu gestartet'
  if (e.art === 'unerwartet') return 'UNERWARTET — vorher nicht sauber heruntergefahren (Absturz, Hänger, Stromausfall oder hart ausgeschaltet)'
  return 'unbekannt (kein Eintrag im Ereignisprotokoll gefunden)'
}

export function textVon(e: ServerEreignis): string {
  const z: string[] = []
  if (e.typ === 'zertifikat' && e.zert) {
    const c = e.zert
    z.push(`Auf dem Server ${name(e)}${e.ip ? ` · ${e.ip}` : ''} ${c.tage < 0 ? 'ist ein verwendetes Zertifikat ABGELAUFEN' : `${zertFrist(c)} ein verwendetes Zertifikat`}.`)
    z.push('')
    z.push(`Zertifikat:   ${c.cn}`)
    if (c.san?.length) z.push(`Namen (SAN):  ${c.san.join(', ')}`)
    z.push(`Gültig bis:   ${datum(c.bis)}${c.tage >= 0 ? ` (noch ${c.tage} Tag${c.tage === 1 ? '' : 'e'})` : ''}`)
    z.push(`Verwendet:    ${c.verwendung || '—'}`)
    if (c.aussteller) z.push(`Aussteller:   ${c.aussteller}${c.selbst ? ' (selbstsigniert)' : ''}`)
    if (c.vorlage) z.push(`AD-Vorlage:   ${c.vorlage} — wird ggf. automatisch erneuert; bitte prüfen, ob das neue Zertifikat auch gebunden ist`)
    z.push(`Fingerabdruck: ${c.thumb}`)
    z.push('', 'Bitte rechtzeitig erneuern (bzw. den Application Owner informieren). Im Tool: Infrastruktur → Server → Kachel → „Dienste & Prüfungen" → Reiter „Zertifikate".')
  } else if (e.typ === 'offline') {
    z.push(`Der Server ${name(e)}${e.ip ? ` · ${e.ip}` : ''} ist seit ${zeit(e.at)} nicht mehr erreichbar (3× kein Ping).`)
    z.push('', 'Er wurde heruntergefahren, ist abgestürzt oder hat ein Netzwerkproblem. Sobald er wieder läuft, meldet das Tool, ob das Herunterfahren geplant war (mit Benutzer und Grund) oder unerwartet.')
  } else if (e.typ === 'wieder-online') {
    z.push(`Der Server ${name(e)}${e.ip ? ` · ${e.ip}` : ''} ist seit ${zeit(e.at)} wieder erreichbar${e.dauerMin ? ` (war ca. ${e.dauerMin} Minuten nicht erreichbar)` : ''}.`)
  } else if (e.typ === 'pruefung') {
    z.push(`Auf dem Server ${name(e)}${e.ip ? ` · ${e.ip}` : ''} ist bei der Prüfung am ${zeit(e.at)} nicht alles in Ordnung:`)
    z.push('')
    for (const p of e.probleme || []) z.push(`  • ${p}`)
    z.push('', 'Im Tool unter Infrastruktur → Server → Kachel → „Dienste & Prüfungen" steht der genaue Stand; dort lässt sich z. B. ein Dienst direkt neu starten.')
  } else {
    z.push(e.art === 'unerwartet' ? `Der Server ${name(e)}${e.ip ? ` · ${e.ip}` : ''} ist UNERWARTET ausgefallen und wurde neu gestartet.`
      : e.aktion === 'herunterfahren' ? `Der Server ${name(e)}${e.ip ? ` · ${e.ip}` : ''} wurde heruntergefahren und wieder gestartet.`
      : `Der Server ${name(e)}${e.ip ? ` · ${e.ip}` : ''} wurde neu gestartet.`)
    z.push('')
    if (e.ausAm) z.push(`Heruntergefahren: ${bootText(e.ausAm)}`)
    z.push(`Gestartet:        ${bootText(e.boot)}`)
    if (e.vorherBoot) z.push(`Vorheriger Start: ${bootText(e.vorherBoot)}`)
    z.push(`Art:              ${artText(e)}`)
    if (e.grund) z.push(`Details:          ${e.grund}`)
  }
  z.push('', `Gemeldet vom ${MONITOR_ABSENDER} am ${zeit(new Date().toISOString())}.`)
  return z.join('\n')
}

// ── Melden (Historie + Mail) ─────────────────────────────────────────────────
export interface MeldeZiel { email?: string; offline: boolean; neustart: boolean; pruefung?: boolean; zertifikat?: boolean }

/**
 * Ereignisse anlegen; für die NEUEN: Historie-Eintrag + Mail (wenn an der Kachel
 * angehakt). `ziele` = Kachel-Einstellungen je HOSTKEY. Liefert die neuen Ereignisse.
 */
export async function melde(ereignisse: ServerEreignis[], ziele: Record<string, MeldeZiel>, _by?: string): Promise<ServerEreignis[]> {
  const neu = await fuegeHinzu(ereignisse)
  const ok: string[] = [], fehler: string[] = [], aus: string[] = []
  for (const e of neu) {
    const historie = e.typ === 'zertifikat' && e.zert
      ? `Zertifikat ${zertFrist(e.zert)}: ${e.zert.cn} (gültig bis ${datum(e.zert.bis)}) · ${e.zert.verwendung}`
      : e.typ === 'pruefung'
      ? `Prüfung: ${(e.probleme || []).join(' · ')}`
      : e.typ === 'neustart'
      ? `${e.aktion === 'herunterfahren' ? 'Herunterfahren + Start' : 'Neustart'} erkannt: ${e.ausAm ? `aus ${bootText(e.ausAm)}, ` : ''}gestartet ${bootText(e.boot)} — ${e.art === 'geplant' ? 'geplant' : e.art === 'unerwartet' ? 'UNERWARTET' : 'Art unbekannt'}${e.grund ? ` · ${e.grund}` : ''}`
      : e.typ === 'offline' ? `Nicht erreichbar seit ${zeit(e.at)} (3× kein Ping)`
      : `Wieder erreichbar seit ${zeit(e.at)}${e.dauerMin ? ` (ca. ${e.dauerMin} min weg)` : ''}`
    await addHistoryEntry(e.host, historie, MONITOR_ABSENDER).catch(() => undefined)

    const z = ziele[e.host.toUpperCase()]
    const will = !!z?.email && (e.typ === 'neustart' ? z.neustart : e.typ === 'pruefung' ? !!z.pruefung : e.typ === 'zertifikat' ? !!z.zertifikat : z.offline)
    if (!will) { aus.push(e.id); continue }
    try {
      const r = await api().sendEmailRaw({ to: z!.email!, subject: titelVon(e), body: textVon(e), smtp: '', port: 587 })
      if (r?.success) ok.push(e.id); else fehler.push(e.id)
    } catch { fehler.push(e.id) }
  }
  await setzeMailStatus(ok, 'gesendet')
  await setzeMailStatus(fehler, 'fehler')
  await setzeMailStatus(aus, 'aus')
  return neu
}

// ── Neustart-Details aus dem Ereignisprotokoll ───────────────────────────────
export interface NeustartDetail { art: NeustartArt; grund?: string; aktion?: 'neustart' | 'herunterfahren'; ausAm?: string }

/** 1074-Typ („power off", „Ausschalten", „restart", „Neu starten" …) → Aktion. */
export function aktionAusTyp(typ?: string): 'neustart' | 'herunterfahren' | undefined {
  const t = (typ || '').trim()
  if (!t) return undefined
  if (/power\s*off|shut\s*down|ausschalten|herunterfahren/i.test(t)) return 'herunterfahren'
  if (/restart|neu\s*start/i.test(t)) return 'neustart'
  return undefined
}

/**
 * Für (wenige) neu gestartete Server per WinRM das System-Ereignisprotokoll lesen:
 *   41 (Kernel-Power) / 6008 (EventLog) rund um den Start → unerwartet
 *   1074 (User32) seit dem VORHERIGEN Start → geplant, mit Typ (ausschalten/neu starten),
 *        Auslöser, Grund, Benutzer — auch wenn der Server lange aus war
 *   sonst 6006 (EventLog sauber beendet) seit dem vorherigen Start → geplant, ohne Details
 *        (z. B. vom Hypervisor/Host heruntergefahren)
 * `vorher` = bisher bekannte Startzeit je Host (Serverzeit yyyy-MM-dd HH:mm) für das
 * Suchfenster; ohne Angabe 14 Tage. Nur lesend. Fehlt die Antwort, ist die Art „unbekannt".
 */
/** Rohzeile aus detailsZuNeustarts → Detail (eigene Funktion, damit testbar). */
export function neustartDetailAus(o: Record<string, unknown>): NeustartDetail {
  const s = (v: unknown) => String(v ?? '').trim()
  if (o.Unerwartet) {
    return { art: 'unerwartet', grund: Number(o.UnerwartetId) === 41 ? 'Kernel-Power 41: vorher nicht sauber heruntergefahren' : 'EventLog 6008: das vorherige Herunterfahren war unerwartet' }
  }
  if (s(o.GeplantAm)) {
    const typ = s(o.Typ)
    const teile = [
      typ && `Typ: ${typ}`,
      s(o.Prozess) && `ausgelöst von ${s(o.Prozess)}`,
      s(o.Benutzer) && `Benutzer ${s(o.Benutzer)}`,
      s(o.Grund) && `Grund: ${s(o.Grund)}`,
      s(o.Kommentar) && `Kommentar: ${s(o.Kommentar)}`,
    ].filter(Boolean)
    return { art: 'geplant', aktion: aktionAusTyp(typ), ausAm: s(o.GeplantAm), grund: teile.join(' · ') || undefined }
  }
  if (s(o.SauberAm)) {
    return { art: 'geplant', ausAm: s(o.SauberAm), grund: 'sauber heruntergefahren (EventLog 6006) — ohne Angabe von Benutzer/Grund, z. B. über den Hypervisor/Host' }
  }
  return { art: 'unbekannt' }
}

export async function detailsZuNeustarts(hosts: string[], vorher: Record<string, string> = {}): Promise<Record<string, NeustartDetail>> {
  const aus: Record<string, NeustartDetail> = {}
  if (!hosts.length) return aus
  const liste = hosts.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
  // je Server die vorherige Startzeit, Schlüssel = Kurzname wie $env:COMPUTERNAME
  const kurz = (h: string) => h.trim().split('.')[0].toUpperCase()
  const karte: Record<string, string> = {}
  for (const [h, v] of Object.entries(vorher)) if (v) karte[kurz(h)] = v
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(karte))))
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$so = New-PSSessionOption -OpenTimeout 15000 -OperationTimeout 60000`,
    `$r = @(Invoke-Command -ComputerName @(${liste}) -ThrottleLimit 10 -SessionOption $so -ErrorAction SilentlyContinue -ArgumentList '${b64}' -ScriptBlock {`,
    `  param($b64)`,
    `  $m = $null; if ($b64) { $m = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json }`,
    `  $boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime`,
    `  $von = $boot.AddDays(-14)`,
    `  $v = ''; if ($m) { $v = [string]$m.($env:COMPUTERNAME) }`,
    `  if ($v) { try { $von = [datetime]::ParseExact($v, 'yyyy-MM-dd HH:mm', [Globalization.CultureInfo]::InvariantCulture).AddMinutes(-1) } catch { } }`,
    `  if ($von -lt $boot.AddDays(-30)) { $von = $boot.AddDays(-30) }`,
    `  $u = Get-WinEvent -FilterHashtable @{ LogName='System'; Id=41,6008; StartTime=$boot.AddMinutes(-10); EndTime=$boot.AddMinutes(30) } -MaxEvents 1 -ErrorAction SilentlyContinue`,
    `  $g = Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='User32'; Id=1074; StartTime=$von; EndTime=$boot } -MaxEvents 1 -ErrorAction SilentlyContinue`,
    `  $s = Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='EventLog'; Id=6006; StartTime=$von; EndTime=$boot } -MaxEvents 1 -ErrorAction SilentlyContinue`,
    `  $p = if ($g) { @($g.Properties | ForEach-Object { [string]$_.Value }) } else { @() }`,
    `  [pscustomobject]@{`,
    `    Unerwartet = [bool]$u; UnerwartetId = if ($u) { [int]$u.Id } else { 0 }`,
    `    GeplantAm = if ($g) { $g.TimeCreated.ToString('yyyy-MM-dd HH:mm') } else { '' }`,
    `    SauberAm = if ($s) { $s.TimeCreated.ToString('yyyy-MM-dd HH:mm') } else { '' }`,
    `    Prozess = if ($p.Count -gt 0) { $p[0] } else { '' }; Grund = if ($p.Count -gt 2) { $p[2] } else { '' }`,
    `    Typ = if ($p.Count -gt 4) { $p[4] } else { '' }; Kommentar = if ($p.Count -gt 5) { $p[5] } else { '' }`,
    `    Benutzer = if ($p.Count -gt 6) { $p[6] } else { '' }`,
    `  }`,
    `})`,
    `ConvertTo-Json -InputObject @($r | Select-Object PSComputerName, Unerwartet, UnerwartetId, GeplantAm, SauberAm, Prozess, Grund, Typ, Kommentar, Benutzer) -Compress`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 180000)
    const txt = (res.stdout ?? '').trim()
    const p = txt ? JSON.parse(txt) : []
    for (const o of (Array.isArray(p) ? p : [p])) {
      const host = String(o?.PSComputerName || '').trim().toUpperCase()
      if (!host) continue
      aus[host] = neustartDetailAus(o)
    }
  } catch { /* Art bleibt unbekannt */ }
  return aus
}
