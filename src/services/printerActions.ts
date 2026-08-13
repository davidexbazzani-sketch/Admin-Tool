// ── Drucker-Netzwerkaktionen ──────────────────────────────────────────────────
// Zwei getrennte Ziele (wichtig für die UI):
//   • DRUCKSERVER-WARTESCHLANGE (PowerShell PrintManagement): Aufträge anzeigen/
//     löschen, pausieren/fortsetzen, Testseite, Spooler neu starten. Läuft auf dem
//     Admin-PC gegen den lokalen Spooler bzw. per -ComputerName gegen den Server.
//   • PHYSISCHES GERÄT (SNMP/HTTP): Status/Toner/Seitenzähler lesen, Gerät
//     physisch neu starten (prtGeneralReset), Web-Interface (EWS) öffnen.
//
// Recherche-Grundlage: Standard Printer-MIB (RFC 3805) + Host-Resources-MIB.
// prtGeneralReset 1.3.6.1.2.1.43.5.1.1.3.1 : powerCycleReset(4) = Neustart.

import { api } from '../electronAPI'

export interface ActionResult {
  ok: boolean
  text: string
}

function psq(s: string): string { return (s || '').replace(/'/g, "''") }

/** Escaping für einen WQL-Single-Quote-Literal INNERHALB eines PS-Double-Quote-Strings
 *  ("Name='<wql>'"): Backslash + Single-Quote WQL-escapen; ", `, $ entfernen, damit
 *  weder der PS-String bricht noch etwas interpoliert/injiziert wird. */
function wql(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/["`$]/g, '')
}

/** -ComputerName-Argument, wenn ein Druckserver gesetzt ist (sonst lokal). */
function serverArg(server?: string): string {
  const s = (server || '').trim()
  return s ? ` -ComputerName '${psq(s)}'` : ''
}

/** Ruft eine Win32_Printer-Methode (Pause/Resume/PrintTestPage) per CIM auf.
 *  Hinweis: Invoke-CimMethod mit -InputObject nutzt die CIM-Session des Objekts —
 *  KEIN zusätzliches -ComputerName (sonst Parameter-Set-Konflikt). Die Instanz aus
 *  Get-CimInstance -ComputerName ist bereits an den Server gebunden. */
async function cimPrinterMethod(printer: string, method: 'Pause' | 'Resume' | 'PrintTestPage', server: string | undefined, okMsg: string): Promise<ActionResult> {
  const cimComputer = (server || '').trim() ? ` -ComputerName '${psq(server!)}'` : ''
  const script = [
    `$ErrorActionPreference='Stop'`,
    `try {`,
    `  $pr = Get-CimInstance${cimComputer} -ClassName Win32_Printer -Filter "Name='${wql(printer)}'" -EA Stop`,
    `  if (-not $pr) { Write-Output 'ERR:Drucker nicht gefunden'; return }`,
    `  Invoke-CimMethod -InputObject $pr -MethodName ${method} | Out-Null`,
    `  Write-Output '${okMsg.replace(/'/g, "''")}'`,
    `} catch { Write-Output ("ERR:" + $_.Exception.Message) }`,
  ].join('\n')
  return runPS(script, 20000)
}

/** Führt ein PowerShell-Skript lokal aus und normalisiert Fehler ("ERR:"-Konvention). */
async function runPS(script: string, timeoutMs = 25000): Promise<ActionResult> {
  try {
    const res = await api().runPowerShell(script, timeoutMs)
    if (res.timedOut) return { ok: false, text: 'Zeitüberschreitung — Drucker/Server nicht erreichbar?' }
    const out = (res.stdout || '').trim()
    if (out.startsWith('ERR:')) return { ok: false, text: out.slice(4).trim() || 'Fehler' }
    if (!out && res.stderr) return { ok: false, text: res.stderr.trim() }
    return { ok: true, text: out }
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) }
  }
}

// ── Erreichbarkeit & Namensauflösung ─────────────────────────────────────────

/** Löst einen Druckernamen zu einer IP auf (DNS-A-Record; sonst leer). */
export async function resolvePrinterIp(nameOrHost: string): Promise<string> {
  const n = psq(nameOrHost.trim())
  if (!n) return ''
  const r = await runPS(
    `$ErrorActionPreference='SilentlyContinue'; $a = Resolve-DnsName -Name '${n}' -Type A -EA SilentlyContinue | Where-Object { $_.IPAddress } | Select-Object -First 1 -ExpandProperty IPAddress; if ($a) { $a } else { '' }`,
    12000,
  )
  return r.ok ? r.text.trim() : ''
}

/** Ping/Erreichbarkeit (ICMP, sonst TCP 9100/RAW bzw. 80). */
export async function pingPrinter(ipOrHost: string): Promise<ActionResult> {
  const h = psq(ipOrHost.trim())
  if (!h) return { ok: false, text: 'Keine IP/Host angegeben.' }
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$online=$false; $m=''`,
    `if (Test-Connection -ComputerName '${h}' -Count 1 -Quiet -EA SilentlyContinue) { $online=$true; $m='Ping' }`,
    `if (-not $online) { try { $t=New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync('${h}',9100).Wait(1500)) { $online=$true; $m='RAW 9100' }; $t.Close() } catch {} }`,
    `if (-not $online) { try { $t=New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync('${h}',80).Wait(1500)) { $online=$true; $m='HTTP 80' }; $t.Close() } catch {} }`,
    `if ($online) { "ONLINE ($m)" } else { "OFFLINE" }`,
  ].join('\n')
  const r = await runPS(script, 12000)
  if (!r.ok) return r
  return { ok: r.text.startsWith('ONLINE'), text: r.text }
}

// ── Warteschlange / Druckserver (PowerShell) ─────────────────────────────────

/** Queue-Status (PrinterStatus, Port, Treiber, Freigabe) + Auftragszahl. */
export async function queueStatus(printer: string, server?: string): Promise<ActionResult> {
  const p = psq(printer)
  const script = [
    `$ErrorActionPreference='Stop'`,
    `try {`,
    `  $pr = Get-Printer -Name '${p}'${serverArg(server)}`,
    `  $jc = @(Get-PrintJob -PrinterName '${p}'${serverArg(server)} -EA SilentlyContinue).Count`,
    `  $o = [ordered]@{ Name=$pr.Name; Status=[string]$pr.PrinterStatus; Auftraege=$jc; Port=[string]$pr.PortName; Treiber=[string]$pr.DriverName; Freigegeben=[bool]$pr.Shared }`,
    `  $o | ConvertTo-Json -Compress`,
    `} catch { Write-Output ("ERR:" + $_.Exception.Message) }`,
  ].join('\n')
  const r = await runPS(script, 20000)
  if (!r.ok) return r
  try {
    const o = JSON.parse(r.text) as Record<string, unknown>
    const lines = [
      `Status: ${o.Status}`,
      `Aufträge in Warteschlange: ${o.Auftraege}`,
      `Port: ${o.Port}`,
      `Treiber: ${o.Treiber}`,
      `Freigegeben: ${o.Freigegeben ? 'ja' : 'nein'}`,
    ]
    return { ok: true, text: lines.join('\n') }
  } catch { return r }
}

/** Aktuelle Druckaufträge anzeigen. */
export async function listJobs(printer: string, server?: string): Promise<ActionResult> {
  const p = psq(printer)
  const script = [
    `$ErrorActionPreference='Stop'`,
    `try {`,
    `  $j = @(Get-PrintJob -PrinterName '${p}'${serverArg(server)} -EA SilentlyContinue | Select-Object @{N='ID';E={$_.Id}},@{N='Dokument';E={$_.DocumentName}},@{N='Benutzer';E={$_.UserName}},@{N='Status';E={[string]$_.JobStatus}},@{N='Seiten';E={$_.TotalPages}})`,
    `  if ($j.Count -eq 0) { Write-Output 'Keine Aufträge in der Warteschlange.' } else { $j | ConvertTo-Json -Compress }`,
    `} catch { Write-Output ("ERR:" + $_.Exception.Message) }`,
  ].join('\n')
  const r = await runPS(script, 20000)
  if (!r.ok || !r.text.startsWith('[') && !r.text.startsWith('{')) return r
  try {
    const arr = JSON.parse(r.text) as Record<string, unknown>[]
    const rows = (Array.isArray(arr) ? arr : [arr]).map(j =>
      `#${j.ID} · ${j.Dokument || '—'} · ${j.Benutzer || '—'} · ${j.Status || ''}${j.Seiten ? ' · ' + j.Seiten + ' S.' : ''}`)
    return { ok: true, text: rows.join('\n') }
  } catch { return r }
}

/** Alle Aufträge löschen (Warteschlange leeren). */
export async function clearJobs(printer: string, server?: string): Promise<ActionResult> {
  const p = psq(printer)
  const arg = serverArg(server)
  const script = [
    `$ErrorActionPreference='Stop'`,
    `try {`,
    `  $jobs=@(Get-PrintJob -PrinterName '${p}'${arg} -EA SilentlyContinue)`,
    `  foreach($j in $jobs){ Remove-PrintJob -PrinterName '${p}'${arg} -ID $j.Id -EA SilentlyContinue }`,
    `  Write-Output ("Warteschlange geleert (" + $jobs.Count + " Auftrag/Aufträge entfernt).")`,
    `} catch { Write-Output ("ERR:" + $_.Exception.Message) }`,
  ].join('\n')
  return runPS(script, 25000)
}

/** Einen einzelnen Auftrag abbrechen. */
export async function cancelJob(printer: string, jobId: number | string, server?: string): Promise<ActionResult> {
  const p = psq(printer)
  const id = Number(jobId)
  if (!Number.isFinite(id)) return { ok: false, text: 'Ungültige Auftrags-ID.' }
  const script = `$ErrorActionPreference='Stop'; try { Remove-PrintJob -PrinterName '${p}'${serverArg(server)} -ID ${id} -EA Stop; Write-Output ("Auftrag ${id} gelöscht.") } catch { Write-Output ("ERR:" + $_.Exception.Message) }`
  return runPS(script, 15000)
}

/** Warteschlange pausieren (Win32_Printer.Pause — es gibt KEIN Suspend-PrintQueue-Cmdlet). */
export async function pausePrinter(printer: string, server?: string): Promise<ActionResult> {
  return cimPrinterMethod(printer, 'Pause', server, 'Warteschlange pausiert.')
}

/** Warteschlange fortsetzen (Win32_Printer.Resume — es gibt KEIN Resume-PrintQueue-Cmdlet). */
export async function resumePrinter(printer: string, server?: string): Promise<ActionResult> {
  return cimPrinterMethod(printer, 'Resume', server, 'Warteschlange fortgesetzt.')
}

/** Windows-Testseite drucken (Ende-zu-Ende-Test bis zum Gerät). */
export async function printTestPage(printer: string, server?: string): Promise<ActionResult> {
  return cimPrinterMethod(printer, 'PrintTestPage', server, 'Testseite gesendet.')
}

/** Druckspooler neu starten (betrifft ALLE Drucker des Servers/PCs!). */
export async function restartSpooler(server?: string): Promise<ActionResult> {
  const s = (server || '').trim()
  const script = s
    ? `$ErrorActionPreference='Stop'; try { Get-Service -ComputerName '${psq(s)}' -Name Spooler -EA Stop | Restart-Service -Force -EA Stop; Write-Output 'Spooler auf ${psq(s)} neu gestartet.' } catch { Write-Output ("ERR:" + $_.Exception.Message) }`
    : `$ErrorActionPreference='Stop'; try { Restart-Service -Name Spooler -Force -EA Stop; Write-Output 'Lokaler Spooler neu gestartet.' } catch { Write-Output ("ERR:" + $_.Exception.Message) }`
  return runPS(script, 30000)
}

// ── Web-Interface (EWS) ──────────────────────────────────────────────────────

/** Öffnet das eingebettete Web-Interface des Geräts (http://<ip>). */
export async function openPrinterWeb(ipOrHost: string): Promise<ActionResult> {
  const h = (ipOrHost || '').trim()
  if (!h) return { ok: false, text: 'Keine IP/Host für das Web-Interface hinterlegt.' }
  const url = /^https?:\/\//i.test(h) ? h : `http://${h}/`
  try { await api().openExternal(url); return { ok: true, text: `Web-Interface geöffnet: ${url}` } }
  catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}

// ── SNMP (physisches Gerät) ──────────────────────────────────────────────────

const OID = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  hrPrinterStatus: '1.3.6.1.2.1.25.3.5.1.1',       // 3=idle 4=printing 5=warmup
  hrPrinterDetectedError: '1.3.6.1.2.1.25.3.5.1.2',
  prtSupplyDesc: '1.3.6.1.2.1.43.11.1.1.6',        // Bezeichnung je Verbrauchsmaterial
  prtSupplyLevel: '1.3.6.1.2.1.43.11.1.1.9',       // aktueller Füllstand
  prtSupplyMax: '1.3.6.1.2.1.43.11.1.1.8',         // Maximalkapazität
  prtMarkerLifeCount: '1.3.6.1.2.1.43.10.2.1.4',   // Lebenszeit-Seitenzähler
  prtGeneralReset: '1.3.6.1.2.1.43.5.1.1.3.1',     // set 4 = powerCycleReset
} as const

export interface PrinterSupply {
  name: string
  level: number
  max: number
  percent: number | null   // null = unbekannt/Sonderwert
}
export interface SnmpPrinterStatus {
  reachable: boolean
  sysDescr?: string
  sysName?: string
  printerStatus?: string
  errors?: string[]
  pageCount?: number
  supplies: PrinterSupply[]
  error?: string
}

function suffixOf(oid: string, base: string): string {
  return oid.startsWith(base + '.') ? oid.slice(base.length + 1) : oid
}

const PRINTER_STATUS_TEXT: Record<number, string> = { 1: 'Sonstiger', 2: 'Unbekannt', 3: 'Bereit', 4: 'Druckt', 5: 'Aufwärmen' }

/** Liest Modell, Status, Seitenzähler und Toner-/Verbrauchsmaterial-Füllstände per SNMP. */
export async function snmpPrinterStatus(ip: string, community?: string, version: 'v1' | 'v2c' = 'v1'): Promise<SnmpPrinterStatus> {
  const host = (ip || '').trim()
  if (!host) return { reachable: false, supplies: [], error: 'Keine IP hinterlegt.' }
  const comm = (community || 'public').trim() || 'public'

  const getR = await api().snmpQuery({ host, op: 'get', oids: [OID.sysDescr, OID.sysName], version, community: comm, timeoutMs: 3000, retries: 1 })
  if (!getR.success) return { reachable: false, supplies: [], error: getR.error || 'SNMP nicht erreichbar' }

  const out: SnmpPrinterStatus = { reachable: true, supplies: [] }
  for (const vb of getR.varbinds || []) {
    if (vb.oid === OID.sysDescr && vb.type !== 'error') out.sysDescr = String(vb.value)
    if (vb.oid === OID.sysName && vb.type !== 'error') out.sysName = String(vb.value)
  }

  // Status
  const statR = await api().snmpQuery({ host, op: 'walk', oid: OID.hrPrinterStatus, version, community: comm, timeoutMs: 3000, retries: 1 })
  if (statR.success && statR.varbinds && statR.varbinds.length > 0) {
    const n = Number(statR.varbinds[0].value)
    out.printerStatus = PRINTER_STATUS_TEXT[n] || `Code ${n}`
  }

  // Seitenzähler (erster Marker)
  const pageR = await api().snmpQuery({ host, op: 'walk', oid: OID.prtMarkerLifeCount, version, community: comm, timeoutMs: 3000, retries: 1 })
  if (pageR.success && pageR.varbinds && pageR.varbinds.length > 0) {
    const n = Number(pageR.varbinds[0].value)
    if (Number.isFinite(n) && n >= 0) out.pageCount = n
  }

  // Verbrauchsmaterial: Beschreibung + Füllstand + Max über gemeinsamen Index mergen.
  const [descR, lvlR, maxR] = await Promise.all([
    api().snmpQuery({ host, op: 'walk', oid: OID.prtSupplyDesc, version, community: comm, timeoutMs: 3500, retries: 1 }),
    api().snmpQuery({ host, op: 'walk', oid: OID.prtSupplyLevel, version, community: comm, timeoutMs: 3500, retries: 1 }),
    api().snmpQuery({ host, op: 'walk', oid: OID.prtSupplyMax, version, community: comm, timeoutMs: 3500, retries: 1 }),
  ])
  if (descR.success) {
    const levels = new Map<string, number>()
    const maxes = new Map<string, number>()
    for (const vb of lvlR.varbinds || []) levels.set(suffixOf(vb.oid, OID.prtSupplyLevel), Number(vb.value))
    for (const vb of maxR.varbinds || []) maxes.set(suffixOf(vb.oid, OID.prtSupplyMax), Number(vb.value))
    for (const vb of descR.varbinds || []) {
      const idx = suffixOf(vb.oid, OID.prtSupplyDesc)
      const name = String(vb.value || '').trim() || `Material ${idx}`
      const level = levels.get(idx)
      const max = maxes.get(idx)
      let percent: number | null = null
      if (typeof level === 'number' && typeof max === 'number' && max > 0 && level >= 0) percent = Math.max(0, Math.min(100, Math.round((level / max) * 100)))
      out.supplies.push({ name, level: level ?? -1, max: max ?? -1, percent })
    }
  }

  return out
}

/**
 * Startet das Gerät physisch neu (prtGeneralReset = powerCycleReset(4)) per SNMP-SET.
 * Benötigt die SNMP-WRITE-Community (meist deaktiviert!). Bei Fehlschlag → EWS nutzen.
 */
export async function snmpRestartDevice(ip: string, writeCommunity: string, version: 'v1' | 'v2c' = 'v1'): Promise<ActionResult> {
  const host = (ip || '').trim()
  if (!host) return { ok: false, text: 'Keine IP hinterlegt.' }
  const comm = (writeCommunity || '').trim()
  if (!comm) return { ok: false, text: 'Keine SNMP-Write-Community hinterlegt (Stammdaten).' }
  const r = await api().snmpQuery({ host, op: 'set', oid: OID.prtGeneralReset, setType: 'Integer', setValue: 4, version, community: comm, timeoutMs: 4000, retries: 1 })
  if (r.success) return { ok: true, text: 'Neustart-Befehl gesendet (powerCycleReset). Gerät ist ~1–3 min offline.' }
  return { ok: false, text: `SNMP-Neustart fehlgeschlagen: ${r.error || 'unbekannt'} — Write-Community/Version prüfen oder Web-Interface nutzen.` }
}
