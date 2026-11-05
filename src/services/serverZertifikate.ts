// ── Server-Zertifikate: was läuft wann ab? ───────────────────────────────────
// Liest je Server per WinRM (NUR lesend):
//   • Zertifikatsspeicher LocalMachine\My, \WebHosting, \Remote Desktop
//   • Verwendung: IIS-HTTPS-Bindungen, http.sys (netsh http show sslcert), RDP
//     (Win32_TSGeneralSetting), SQL Server (SuperSocketNetLib\Certificate)
//   • TLS-Ports: Handshake auf dem Server selbst gegen 127.0.0.1 (SNI = FQDN) — nur
//     Ports, die lauschen UND sicher TLS sprechen: übliche HTTPS/LDAPS-Ports, die oben
//     gefundenen Bindungs-Ports, SEAL „Secure URL" (z. B. W3148:9126) und von Hand
//     eingetragene. So werden auch Datei-Zertifikate (Apache/Tomcat) erkannt.
// Gemeldet (Popup + Mail, je Schwelle EINMAL) werden nur Zertifikate, die tatsächlich
// verwendet werden: 30 Tage vorher, 5 Tage vorher und wenn abgelaufen.
// Selbstsignierte RDP-Zertifikate erneuert Windows selbst → nur angezeigt.
//
// Ablage: server_monitor/zertifikate/<HOST>.json (letzter Stand)
//         server_monitor/zertifikate/<HOST>.ports.json (von Hand eingetragene TLS-Ports)

import { api } from '../electronAPI'
import { fern, lies, kurzFehler, ladeInventar } from './serverZustand'
import {
  loadServerConfig, loadServerStatus, aktualisiereStatus, hostKey, meldeZiele,
  type ServerTile,
} from './serverMonitor'
import { melde, type ServerEreignis } from './serverEreignisse'
import { getScanSchedule, isConfiguredDue, loadRunStatus, saveRunStatus, isStatusClaimed as isRunStatusClaimed } from './scanSchedules'

export type VerwendungsArt = 'iis' | 'httpsys' | 'rdp' | 'sql' | 'port'
export interface ZertVerwendung { art: VerwendungsArt; text: string; port?: number }
export interface Zertifikat {
  thumb: string
  cn: string
  subject?: string
  san: string[]
  aussteller: string
  von: string                // ISO (UTC)
  bis: string                // ISO (UTC)
  speicher: string           // My · WebHosting · Remote Desktop · '' = nur am Port gesehen
  privat?: boolean
  serverAuth?: boolean
  vorlage?: string           // AD-Zertifikatsvorlage (automatische Erneuerung möglich)
  selbst?: boolean           // selbstsigniert
  verwendung: ZertVerwendung[]
}
export interface PortProbe { port: number; ok: boolean; thumb?: string; fehler?: string }
export interface ZertStand {
  host: string
  am: string
  erreichbar: boolean
  fehler?: string
  fqdn?: string
  zertifikate: Zertifikat[]
  ports: PortProbe[]
}
/** Kurzfassung für die Kachel (status.json servers[*].zertifikate) */
export interface ZertZusammenfassung {
  am: string
  erreichbar: boolean
  verwendet: number
  warnung: number            // ≤ 30 Tage
  kritisch: number           // ≤ 5 Tage oder abgelaufen
  naechstes?: { cn: string; bis: string; tage: number; verwendung: string }
}

export const SCHWELLE_WARNUNG = 30
export const SCHWELLE_KRITISCH = 5
export const SERVER_CERTS_SCAN_ID = 'server-certs'
export const SERVER_CERTS_STATUS = 'server_monitor/zertifikate_schedule.json'
/** Übliche Ports, die sicher TLS sprechen (nur geprüft, wenn sie auf dem Server lauschen). */
export const TLS_STANDARD_PORTS = [443, 8443, 9443, 4443, 636, 3269, 5986]

const key = (h: string) => (h || '').trim().toUpperCase()
const standDatei = (h: string) => `server_monitor/zertifikate/${key(h)}.json`
const portDatei = (h: string) => `server_monitor/zertifikate/${key(h)}.ports.json`
const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : v == null ? [] : [v as T]

export async function ladeZertStand(h: string): Promise<ZertStand | null> {
  const d = await api().netReadJsonAsync<ZertStand>(standDatei(h)).catch(() => null)
  return d && Array.isArray(d.zertifikate) ? d : null
}
export async function ladeExtraPorts(h: string): Promise<number[]> {
  const d = await api().netReadJsonAsync<{ ports?: number[] }>(portDatei(h)).catch(() => null)
  return arr<number>(d?.ports).filter(p => Number.isInteger(p) && p > 0 && p < 65536)
}
export async function speichereExtraPorts(h: string, ports: number[], by: string): Promise<boolean> {
  return api().netWriteJsonAsync(portDatei(h), { ports: [...new Set(ports)].sort((a, b) => a - b), am: new Date().toISOString(), von: by }).catch(() => false)
}
/** Eingabe „9126, 8444 1234" → Portliste (ungültige fallen weg). */
export function parsePorts(s: string): number[] {
  return [...new Set((s || '').split(/[^0-9]+/).map(Number).filter(p => Number.isInteger(p) && p > 0 && p < 65536))]
}
/** SEAL „Secure URL to connect with: https://W3148.corp.skf.net:9126" → [9126] */
export function sealTlsPorts(roh?: string): number[] {
  const out = new Set<number>()
  for (const m of (roh || '').matchAll(/https:\/\/[^\s/:]+:(\d{2,5})/gi)) out.add(Number(m[1]))
  return [...out]
}

// ── PowerShell (läuft per WinRM auf dem Server, nur lesend) ───────────────────
export const ZERT_INNER = String.raw`
    $fqdn = $env:COMPUTERNAME
    try { $dom = [string](Get-CimInstance Win32_ComputerSystem).Domain; if ($dom -and $dom -ne 'WORKGROUP') { $fqdn = $env:COMPUTERNAME + '.' + $dom } } catch { }
    function Get-SkfZert($c, [string]$speicher) {
      $san = @()
      try { $ext = $c.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' } | Select-Object -First 1; if ($ext) { $san = @(($ext.Format($false) -split ',\s*') | ForEach-Object { ($_ -replace '^[^=:]+[=:]\s*', '').Trim() } | Where-Object { $_ }) } } catch { }
      $eku = @(); try { $e2 = $c.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | Select-Object -First 1; if ($e2) { $eku = @($e2.EnhancedKeyUsages | ForEach-Object { [string]$_.Value }) } } catch { }
      $tpl = ''; try { $t2 = $c.Extensions | Where-Object { $_.Oid.Value -eq '1.3.6.1.4.1.311.21.7' -or $_.Oid.Value -eq '1.3.6.1.4.1.311.20.2' } | Select-Object -First 1; if ($t2) { $tpl = ([string]$t2.Format($false)).Split(',')[0].Trim() } } catch { }
      [pscustomobject]@{
        thumb = ([string]$c.Thumbprint).ToUpper()
        cn = [string]$c.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
        subject = [string]$c.Subject
        san = $san
        aussteller = [string]$c.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $true)
        von = $c.NotBefore.ToUniversalTime().ToString('o')
        bis = $c.NotAfter.ToUniversalTime().ToString('o')
        speicher = $speicher
        privat = [bool]$c.HasPrivateKey
        serverAuth = [bool](($eku.Count -eq 0) -or ($eku -contains '1.3.6.1.5.5.7.3.1'))
        vorlage = $tpl
        selbst = [bool]($c.Subject -eq $c.Issuer)
      }
    }
    $zert = @{}
    $verw = @{}
    function Add-SkfVerw([string]$t, [string]$art, [string]$text, [int]$port) {
      $t = ($t -replace '[^0-9A-Fa-f]', '').ToUpper(); if (-not $t) { return }
      if (-not $verw.ContainsKey($t)) { $verw[$t] = @() }
      $verw[$t] += [pscustomobject]@{ art = $art; text = $text; port = $port }
    }
    foreach ($sp in 'My', 'WebHosting', 'Remote Desktop') {
      foreach ($c in @(Get-ChildItem -LiteralPath ('Cert:\LocalMachine\' + $sp) -ErrorAction SilentlyContinue)) {
        if ($c -is [System.Security.Cryptography.X509Certificates.X509Certificate2]) { $t = ([string]$c.Thumbprint).ToUpper(); if (-not $zert.ContainsKey($t)) { $zert[$t] = Get-SkfZert $c $sp } }
      }
    }
    $bindPorts = @()
    # IIS-HTTPS-Bindungen
    if (Get-Module -ListAvailable WebAdministration) {
      try {
        Import-Module WebAdministration -ErrorAction Stop
        $sites = @(Get-Website)
        foreach ($b in @(Get-ChildItem IIS:\SslBindings -ErrorAction SilentlyContinue)) {
          $t = [string]$b.Thumbprint; if (-not $t) { continue }
          $port = [int]$b.Port; $hn = [string]$b.Host
          $site = (@($sites | Where-Object { @($_.Bindings.Collection | Where-Object { $_.protocol -eq 'https' -and ([string]$_.bindingInformation).EndsWith(':' + $port + ':' + $hn) }).Count -gt 0 } | ForEach-Object { [string]$_.Name }) -join ', ')
          $txt = 'IIS https :' + $port; if ($hn) { $txt += ' ' + $hn }; if ($site) { $txt += ' (' + $site + ')' }
          Add-SkfVerw $t 'iis' $txt $port; $bindPorts += $port
        }
      } catch { }
    }
    # http.sys (z. B. WinRM-HTTPS, Reporting Services, eigene Dienste)
    $bind = ''; $bport = 0
    foreach ($z in @(& (Join-Path $env:SystemRoot 'System32\netsh.exe') http show sslcert 2>$null)) {
      if ([string]$z -match '^\s*(.+?)\s+:\s+(.*)$') {
        $lab = $Matches[1]; $val = $Matches[2].Trim()
        if ($lab -match '(?i)port' -and $val -match ':(\d{1,5})$') { $bind = $val; $bport = [int]$Matches[1] }
        elseif ($val -match '^[0-9a-fA-F]{40}$') { Add-SkfVerw $val 'httpsys' ('http.sys ' + $bind) $bport; if ($bport) { $bindPorts += $bport } }
      }
    }
    # Remotedesktop
    try { $ts = Get-CimInstance -Namespace 'root\cimv2\TerminalServices' -ClassName Win32_TSGeneralSetting -ErrorAction Stop | Select-Object -First 1; if ($ts -and $ts.SSLCertificateSHA1Hash) { Add-SkfVerw ([string]$ts.SSLCertificateSHA1Hash) 'rdp' 'Remotedesktop (RDP)' 3389 } } catch { }
    # SQL Server
    foreach ($k in @(Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server' -ErrorAction SilentlyContinue)) {
      $nl = Join-Path $k.PSPath 'MSSQLServer\SuperSocketNetLib'
      $cv = [string](Get-ItemProperty -LiteralPath $nl -Name Certificate -ErrorAction SilentlyContinue).Certificate
      if ($cv) { Add-SkfVerw $cv 'sql' ('SQL Server (' + $k.PSChildName + ')') 1433 }
    }
    # TLS-Ports: nur lauschende, die TLS sprechen — Handshake gegen 127.0.0.1 mit SNI = FQDN
    $listen = @([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { [int]$_.Port })
    $kand = @(@($P.standard) + @($P.extra) + $bindPorts | ForEach-Object { [int]$_ } | Where-Object { $_ -gt 0 -and $_ -ne 3389 } | Sort-Object -Unique)
    $proben = @()
    foreach ($port in $kand) {
      if ($listen -notcontains $port) { continue }
      $tcp = New-Object System.Net.Sockets.TcpClient
      try {
        $iar = $tcp.BeginConnect('127.0.0.1', $port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne(3000)) { throw 'keine Verbindung' }
        $tcp.EndConnect($iar)
        $tcp.ReceiveTimeout = 5000; $tcp.SendTimeout = 5000
        $cb = [System.Net.Security.RemoteCertificateValidationCallback] { param($s, $c, $ch, $e) $true }
        $ssl = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false, $cb)
        $ssl.AuthenticateAsClient($fqdn, (New-Object System.Security.Cryptography.X509Certificates.X509CertificateCollection), [System.Security.Authentication.SslProtocols](3072 -bor 768 -bor 192), $false)
        $rc = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
        $t = ([string]$rc.Thumbprint).ToUpper()
        if (-not $zert.ContainsKey($t)) { $zert[$t] = Get-SkfZert $rc '' }
        Add-SkfVerw $t 'port' ('TLS-Port ' + $port) $port
        $proben += [pscustomobject]@{ port = $port; ok = $true; thumb = $t; fehler = '' }
        try { $ssl.Close() } catch { }
      } catch {
        $msg = [string]$_.Exception.Message; if ($_.Exception.InnerException) { $msg = [string]$_.Exception.InnerException.Message }
        $proben += [pscustomobject]@{ port = $port; ok = $false; thumb = ''; fehler = (($msg -split "\r?\n")[0]) }
      } finally { try { $tcp.Close() } catch { } }
    }
    $aus = @(foreach ($t in $zert.Keys) { $z = $zert[$t]; $z | Add-Member -NotePropertyName verwendung -NotePropertyValue @($(if ($verw.ContainsKey($t)) { $verw[$t] } else { @() })) -Force; $z })
    @{ ok = $true; fqdn = $fqdn; zertifikate = $aus; ports = $proben } | ConvertTo-Json -Depth 6 -Compress
`

// ── Auswertung ──────────────────────────────────────────────────────────────
/**
 * Resttage nach KALENDERTAGEN (nicht 24-h-Blöcken): läuft morgen früh ab → 1 („morgen"),
 * später heute → 0 („heute"), schon vorbei → negativ (abgelaufen).
 */
export function tageBis(bis: string, jetzt = Date.now()): number {
  const ms = new Date(bis).getTime()
  if (isNaN(ms)) return Number.NaN
  const tag = (t: number) => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) }
  const kal = Math.round((tag(ms) - tag(jetzt)) / 86400_000)
  return ms < jetzt ? Math.min(-1, kal) : kal
}
/** „Template=PKICT_SKF_WebServer(1.3.6.1.4.1.311.21.8.…)" → „PKICT_SKF_WebServer"; nur OID → „(ohne Namen)" */
export function vorlageName(v?: string): string {
  const s = (v || '').replace(/^[^=]+=\s*/, '').trim()
  const m = /^(.+?)\s*\(\s*[\d.]+\s*\)$/.exec(s)
  if (m) return m[1].trim()
  if (/^[\d.]+$/.test(s)) return '(ohne Namen)'
  return s
}
export type ZertStufe = 'abgelaufen' | 'kritisch' | 'warnung' | 'ok'
export function zertStufe(tage: number): ZertStufe {
  if (isNaN(tage) || tage < 0) return 'abgelaufen'
  if (tage <= SCHWELLE_KRITISCH) return 'kritisch'
  if (tage <= SCHWELLE_WARNUNG) return 'warnung'
  return 'ok'
}
/** Wird das Zertifikat wirklich verwendet (→ Meldungen)? Selbstsignierte RDP-Zertifikate erneuert Windows selbst. */
export function zertRelevant(z: Zertifikat): boolean {
  if (!z.verwendung.length) return false
  if (z.selbst && z.verwendung.every(v => v.art === 'rdp')) return false
  return true
}
export const verwendungText = (z: Zertifikat) => z.verwendung.map(v => v.text).join(' · ')

/** Doppelte Verwendungen zusammenfassen: IIS-Bindung + http.sys + Port-Probe desselben Ports → IIS-Text gewinnt. */
export function bereinigeVerwendung(v: ZertVerwendung[]): ZertVerwendung[] {
  const rang: Record<VerwendungsArt, number> = { iis: 0, sql: 1, rdp: 2, httpsys: 3, port: 4 }
  const sortiert = [...v].sort((a, b) => rang[a.art] - rang[b.art])
  const ports = new Set<number>()
  const aus: ZertVerwendung[] = []
  for (const x of sortiert) {
    if (x.port && (x.art === 'httpsys' || x.art === 'port') && ports.has(x.port)) continue
    if (x.port) ports.add(x.port)
    if (aus.some(y => y.art === x.art && y.text === x.text)) continue
    aus.push(x)
  }
  return aus
}

export function zertAusRoh(host: string, d: Record<string, unknown>): ZertStand {
  const zertifikate = arr<Record<string, unknown>>(d.zertifikate).map(r => ({
    thumb: String(r.thumb || '').toUpperCase(), cn: String(r.cn || ''), subject: String(r.subject || '') || undefined,
    san: arr<string>(r.san).map(String).filter(Boolean), aussteller: String(r.aussteller || ''),
    von: String(r.von || ''), bis: String(r.bis || ''), speicher: String(r.speicher || ''),
    privat: !!r.privat, serverAuth: r.serverAuth !== false, vorlage: String(r.vorlage || '') || undefined, selbst: !!r.selbst,
    verwendung: bereinigeVerwendung(arr<ZertVerwendung>(r.verwendung).map(v => ({ art: v.art, text: String(v.text || ''), port: Number(v.port) || undefined }))),
  })).filter(z => z.thumb && z.bis)
  // verwendete zuerst, dann nach Ablauf
  zertifikate.sort((a, b) => (zertRelevant(b) ? 1 : 0) - (zertRelevant(a) ? 1 : 0) || a.bis.localeCompare(b.bis))
  return {
    host: key(host), am: new Date().toISOString(), erreichbar: true, fqdn: String(d.fqdn || '') || undefined,
    zertifikate, ports: arr<PortProbe>(d.ports).map(p => ({ port: Number(p.port), ok: !!p.ok, thumb: p.thumb || undefined, fehler: p.fehler || undefined })),
  }
}

export function fasseZertZusammen(s: ZertStand, jetzt = Date.now()): ZertZusammenfassung {
  const rel = s.zertifikate.filter(zertRelevant)
  let warnung = 0, kritisch = 0
  let naechstes: ZertZusammenfassung['naechstes']
  for (const z of rel) {
    const t = tageBis(z.bis, jetzt)
    const st = zertStufe(t)
    if (st === 'warnung') warnung++
    else if (st === 'kritisch' || st === 'abgelaufen') kritisch++
    if (!naechstes || z.bis < naechstes.bis) naechstes = { cn: z.cn, bis: z.bis, tage: t, verwendung: verwendungText(z) }
  }
  return { am: s.am, erreichbar: s.erreichbar, verwendet: rel.length, warnung, kritisch, naechstes }
}

/** Meldungen je Schwelle: 30 Tage, 5 Tage, abgelaufen — feste IDs → je Zertifikat und Schwelle nur EINMAL. */
export function zertEreignisse(s: ZertStand, tile?: Pick<ServerTile, 'hostname' | 'description' | 'ip'>, jetzt = Date.now()): ServerEreignis[] {
  const aus: ServerEreignis[] = []
  for (const z of s.zertifikate.filter(zertRelevant)) {
    const tage = tageBis(z.bis, jetzt)
    const st = zertStufe(tage)
    if (st === 'ok') continue
    const schwelle = st === 'abgelaufen' ? 'abgelaufen' : st === 'kritisch' ? '5' : '30'
    aus.push({
      id: `zertifikat|${key(s.host)}|${z.thumb}|${schwelle}`, typ: 'zertifikat',
      host: tile?.hostname?.trim() || s.host, bezeichnung: tile?.description, ip: tile?.ip, at: new Date(jetzt).toISOString(),
      zert: { cn: z.cn || z.subject || z.thumb, bis: z.bis, tage, thumb: z.thumb, verwendung: verwendungText(z), aussteller: z.aussteller, schwelle, san: z.san.slice(0, 6), vorlage: z.vorlage ? vorlageName(z.vorlage) : undefined, selbst: z.selbst },
    })
  }
  return aus
}

// ── Abfrage ─────────────────────────────────────────────────────────────────
/** Zertifikate eines Servers lesen und speichern (nur lesend am Server). */
export async function pruefeZertifikate(host: string): Promise<ZertStand> {
  const TAG = '@@SRVZERT@@'
  const [extra, inv] = await Promise.all([ladeExtraPorts(host), ladeInventar(host).catch(() => null)])
  const payload = { standard: TLS_STANDARD_PORTS, extra: [...new Set([...extra, ...sealTlsPorts(inv?.seal?.roh)])] }
  const r = await api().runPowerShell(fern(host, ZERT_INNER, TAG, payload, 180000), 200000)
  const d = lies<Record<string, unknown>>(r.stdout, TAG)
  let stand: ZertStand
  if (!d || d.ok === false) {
    const alt = await ladeZertStand(host)
    // letzter guter Stand bleibt sichtbar, ist aber als nicht aktuell markiert
    stand = { ...(alt || { zertifikate: [], ports: [] }), host: key(host), am: new Date().toISOString(), erreichbar: false,
      fehler: d?.fehler ? kurzFehler(String(d.fehler)) : r.timedOut ? 'Zeitüberschreitung' : kurzFehler(r.stderr) || 'keine Antwort per WinRM' }
  } else stand = zertAusRoh(host, d)
  await api().netWriteJsonAsync(standDatei(host), stand).catch(() => false)
  return stand
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Alle Server (laut Ping online) prüfen — netzschonend: 2 gleichzeitig, Pausen mit
 * Zufallsanteil. Kurzfassung in status.json, neue Schwellen → Popup + Mail (Kachel-Haken
 * „bei Zertifikat-Ablauf"). `nurHosts` = einzelne Server (Knopf im Panel).
 */
export async function runZertifikatsScan(by: string, nurHosts?: string[]): Promise<{ ok: boolean; summary: string; geprueft: number; warnungen: number }> {
  const cfg = await loadServerConfig()
  const status = await loadServerStatus()
  const wunsch = nurHosts ? new Set(nurHosts.map(hostKey)) : null
  const tiles = cfg.tiles.filter(t => t.hostname.trim() && (!wunsch || wunsch.has(hostKey(t.hostname))) && status.servers[hostKey(t.hostname)]?.online !== false)
  const zusammen: Record<string, ZertZusammenfassung> = {}
  const ereignisse: ServerEreignis[] = []
  let geprueft = 0, fehler = 0, warnungen = 0
  const schlange = [...tiles]
  const arbeiter = async (start: number) => {
    if (start) await sleep(start)
    for (let t = schlange.shift(); t; t = schlange.shift()) {
      const s = await pruefeZertifikate(t.hostname.trim())
      geprueft++
      if (!s.erreichbar) fehler++
      const z = fasseZertZusammen(s)
      zusammen[hostKey(t.hostname)] = z
      warnungen += z.warnung + z.kritisch
      if (s.erreichbar) ereignisse.push(...zertEreignisse(s, t))
      if (schlange.length) await sleep(1500 + Math.floor(Math.random() * 1500))
    }
  }
  await Promise.all([arbeiter(0), arbeiter(1000)])
  if (Object.keys(zusammen).length) {
    await aktualisiereStatus(frisch => {
      const servers = { ...frisch.servers }
      for (const [k, z] of Object.entries(zusammen)) servers[k] = { ...(servers[k] || { online: true, consecutiveFailures: 0 }), zertifikate: z }
      return { ...frisch, servers }
    })
  }
  if (ereignisse.length) await melde(ereignisse, meldeZiele(cfg.tiles), by).catch(() => [])
  return { ok: true, geprueft, warnungen, summary: `${geprueft} Server geprüft${fehler ? ` (${fehler} nicht erreichbar)` : ''} · ${warnungen} Zertifikat(e) laufen in ≤ ${SCHWELLE_WARNUNG} Tagen ab oder sind abgelaufen` }
}

/** Täglich laut Zeitplan (Einstellungen → Automatische Scans → server-certs, Standard 07:00). */
export async function runZertifikatsScanIfDue(by: string, now = Date.now()): Promise<boolean> {
  const sched = await getScanSchedule(SERVER_CERTS_SCAN_ID)
  const st = await loadRunStatus(SERVER_CERTS_STATUS)
  if (!isConfiguredDue(sched, st.lastRunAt, now)) return false
  if (isRunStatusClaimed(st, now)) return false
  const token = `${by}#${Math.random().toString(36).slice(2, 10)}`
  await saveRunStatus(SERVER_CERTS_STATUS, { ...st, running: { by: token, at: new Date().toISOString() } })
  if ((await loadRunStatus(SERVER_CERTS_STATUS)).running?.by !== token) return false
  try {
    const r = await runZertifikatsScan(by)
    await saveRunStatus(SERVER_CERTS_STATUS, { lastRunAt: new Date().toISOString(), lastResult: r.ok ? 'success' : 'error', lastSummary: r.summary, running: undefined })
    return true
  } catch {
    await saveRunStatus(SERVER_CERTS_STATUS, { ...st, running: undefined })
    return false
  }
}
