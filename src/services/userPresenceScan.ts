// ── Massen-Scan: wo sind alle Hamburg-Benutzer angemeldet (IP + DNS) ─────────
// Effizient: wir scannen die Computer EINMAL (gedrosselt, batchweise) und lesen
// pro Computer den angemeldeten Benutzer + IP + DNS-Status. Danach werden die
// Benutzer (SKF Marine, aktiv+inaktiv) dagegen gejoint. So entsteht eine Liste
// "Benutzer -> aktuelles Geraet (IP)" inkl. DNS-Problem-Markierung.
//
// Ergebnisse werden als Protokoll (mit Datum/Uhrzeit) zentral gespeichert; alte
// Protokolle bleiben abrufbar.

import { api } from '../electronAPI'

export interface ComputerRecord {
  hostname: string
  status: 'OK' | 'OFFLINE' | 'ERR'
  sam: string          // angemeldeter Benutzer (SamAccountName, '' wenn keiner)
  ip: string
  dnsIp: string
  dnsProblem: boolean
}

export interface ScanRow {
  sam: string
  displayName: string
  enabled: boolean
  department?: string
  hostname: string     // '' wenn nicht angemeldet/gefunden
  ip: string
  dnsIp: string
  dnsProblem: boolean
  loggedIn: boolean
  // Zuweisungs-Abgleich gegen das Inventar (Standort-Uebersicht):
  //   ok       = angemeldeter Benutzer == zugewiesener Benutzer
  //   mismatch = falsch zugewiesen (assignedTo = wem es eigentlich gehoert)
  //   unknown  = Geraet nicht im Inventar / keine Zuweisung hinterlegt
  assignmentStatus?: 'ok' | 'mismatch' | 'unknown'
  assignedTo?: string  // eigentlich zugewiesen an (Anzeigename oder Corp ID)
  deviceType?: string  // Model-Typ aus der Endgeraete-Uebersicht (z. B. "Laptop Standard")
  // Nur bei mismatch + ohne DNS-Problem: gehoert das (nicht zugewiesene) Geraet
  // wenigstens dem Abteilungsleiter der angemeldeten Person?
  //   yes = Geraet des Abteilungsleiters · no = fremde Person · unknown = Leiter unbekannt
  leaderMatch?: 'yes' | 'no' | 'unknown'
}

export interface ScanProtocolMeta {
  id: string
  createdAt: string
  by: string
  totalUsers: number
  withSession: number
  dnsProblems: number
  computersScanned: number
}

export interface ScanProtocol extends ScanProtocolMeta {
  rows: ScanRow[]
}

const SCAN_DIR = 'config/user-presence/scans'
const INDEX_FILE = `${SCAN_DIR}/index.json`

export const SCAN_BATCH_SIZE = 10      // gleichzeitige Remote-Abfragen pro Batch (max. 10 lt. Regeln)
export const SCAN_BATCH_WAIT_SEC = 35  // WinRM-Aktivierung + Invoke-Command brauchen laenger

// Modul-Cache fuer die Computer-Liste (vermeidet wiederholte AD-Abfragen bei
// mehreren Einzel-Suchen kurz nacheinander).
let _compCache: { computers: string[]; at: number } | null = null
const COMP_CACHE_MS = 10 * 60 * 1000

export async function getHamburgComputersCached(force = false): Promise<{ ok: boolean; computers: string[]; error?: string; cached?: boolean }> {
  if (!force && _compCache && (Date.now() - _compCache.at) < COMP_CACHE_MS) {
    return { ok: true, computers: _compCache.computers, cached: true }
  }
  const r = await getHamburgComputers()
  if (r.ok) _compCache = { computers: r.computers, at: Date.now() }
  return r
}

// ── Kandidaten-Computer (Hamburg / SKF Marine Standort-OUs) ──────────────────
export async function getHamburgComputers(maxComputers = 1200): Promise<{ ok: boolean; computers: string[]; error?: string }> {
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$users = Get-ADUser -Filter "Company -eq 'SKF MARINE GMBH'" -Properties DistinguishedName -EA SilentlyContinue`,
    `if (-not $users) { Write-Output 'NOUSERS'; exit }`,
    `$ous = $users | ForEach-Object { $_.DistinguishedName -replace '^CN=[^,]+,','' -replace '^[^,]+,','' } | Sort-Object -Unique`,
    `$all = New-Object System.Collections.Generic.List[object]`,
    `$seen = New-Object System.Collections.Generic.HashSet[string]`,
    `foreach ($ou in $ous) {`,
    // Alle aktivierten Computer im OU — KEIN striktes LastLogonDate-Pflichtfilter
    // (das Attribut ist oft nicht aktuell repliziert und wuerde aktive Rechner ausblenden).
    `  $cs = Get-ADComputer -Filter 'Enabled -eq $true' -SearchBase $ou -Properties LastLogonDate -EA SilentlyContinue`,
    `  foreach ($c in $cs) { if ($seen.Add([string]$c.Name)) { $all.Add($c) } }`,
    `}`,
    // Fallback: liefert das Standort-OU nichts, domaenenweit nach aktivierten Computern suchen.
    `if ($all.Count -eq 0) {`,
    `  $cs = Get-ADComputer -Filter 'Enabled -eq $true' -Properties LastLogonDate -EA SilentlyContinue`,
    `  foreach ($c in $cs) { if ($seen.Add([string]$c.Name)) { $all.Add($c) } }`,
    `}`,
    `Write-Output ("COUNT" + [char]9 + $all.Count)`,
    `foreach ($c in $all) { Write-Output ("COMP" + [char]9 + [string]$c.Name) }`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 120000)
    const out = res.stdout ?? ''
    if (out.includes('NOUSERS')) return { ok: false, computers: [], error: 'Keine SKF-Marine-Benutzer im AD gefunden.' }
    const computers = out.split(/\r?\n/)
      .filter(l => l.startsWith('COMP\t'))
      .map(l => l.split('\t')[1])
      .filter(Boolean)
      .slice(0, maxComputers)
    if (computers.length === 0) {
      const dbg = (res.stderr || out).trim().slice(0, 300)
      return { ok: false, computers: [], error: `Keine Computer im AD gefunden (Standort-OU + Domain-Fallback leer).${dbg ? ' Details: ' + dbg : ''}` }
    }
    return { ok: true, computers }
  } catch (e) {
    return { ok: false, computers: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Einen Batch von Computern abfragen (gedrosselt) ──────────────────────────
export async function scanComputersBatch(hosts: string[]): Promise<ComputerRecord[]> {
  if (hosts.length === 0) return []
  const list = hosts.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$hosts = @(${list})`,
    `$jobs = @()`,
    `foreach ($h in $hosts) {`,
    `  $jobs += Start-Job -ScriptBlock {`,
    `    param($h)`,
    `    # 1) WinRM auf dem Ziel aktivieren (RPC/SMB) — wie bei Remote Doc / Daylis`,
    `    $rm=$false`,
    `    try { Test-WSMan -ComputerName $h -EA Stop | Out-Null; $rm=$true } catch {}`,
    `    if (-not $rm) { try { $svc=Get-Service -ComputerName $h -Name WinRM -EA Stop; if ($svc.StartType -eq 'Disabled') { Set-Service -ComputerName $h -Name WinRM -StartupType Manual -EA SilentlyContinue }; $svc.Start(); $svc.WaitForStatus('Running',[TimeSpan]::FromSeconds(6)); $rm=$true } catch {} }`,
    `    if (-not $rm) { try { $sc=[System.ServiceProcess.ServiceController]::new('WinRM',$h); $sc.Start(); $sc.WaitForStatus('Running',[TimeSpan]::FromSeconds(6)); $sc.Close(); $rm=$true } catch {} }`,
    `    if (-not $rm) { try { & sc.exe "\\\\$h" start WinRM 2>&1 | Out-Null; Start-Sleep -Seconds 3; $chk=Get-Service -ComputerName $h -Name WinRM -EA SilentlyContinue; if ($chk -and $chk.Status -eq 'Running') { $rm=$true } } catch {} }`,
    `    if (-not $rm) { return ($h + '|OFFLINE||||0') }`,
    `    # 2) Angemeldeten Benutzer + IP DIREKT auf dem Geraet auslesen (Invoke-Command)`,
    `    try {`,
    `      $r = Invoke-Command -ComputerName $h -ScriptBlock {`,
    `        $u=''`,
    `        try { $u=(Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}`,
    `        if (-not $u) { try { $u=(Get-Process -IncludeUserName -Name explorer -EA Stop | Select-Object -First 1 -ExpandProperty UserName) } catch {} }`,
    `        if (-not $u) { try { $qq=@(quser 2>$null) | Where-Object { $_ -and $_ -notmatch 'USERNAME|BENUTZER' }; if ($qq) { $ln=($qq | Select-Object -First 1); $u=((($ln -replace '^[>\\s]+','') -split '\\s{2,}')[0]); if ($u -and $u -notmatch '\\\\') { $u="$env:USERDOMAIN\\$u" } } } catch {} }`,
    `        if (-not $u) { try { $u=(Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Authentication\\LogonUI' -Name LastLoggedOnUser -EA Stop).LastLoggedOnUser } catch {} }`,
    `        $ip=(Get-CimInstance Win32_NetworkAdapterConfiguration -EA SilentlyContinue | Where-Object { $_.IPEnabled -and $_.IPAddress } | ForEach-Object { $_.IPAddress } | Where-Object { $_ -like '*.*.*.*' -and $_ -notlike '169.254.*' -and $_ -notlike '*:*' } | Select-Object -First 1)`,
    `        [pscustomobject]@{ N=$env:COMPUTERNAME; U=[string]$u; IP=[string]$ip }`,
    `      } -EA Stop`,
    `      $user=[string]$r.U; $sam=($user -split '\\\\')[-1]`,
    `      $ip=[string]$r.IP; $remoteName=[string]$r.N`,
    `      $dnsIp=''`,
    `      try { $dnsIp = (Test-Connection -ComputerName $h -Count 1 -EA Stop).IPV4Address.IPAddressToString } catch { try { $dnsIp = ([System.Net.Dns]::GetHostAddresses($h) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1).IPAddressToString } catch {} }`,
    `      $dp='0'`,
    `      if ($remoteName -and ($remoteName -notlike "$h*")) { $dp='1' }`,
    `      elseif ($ip -and $dnsIp -and ($ip -ne $dnsIp)) { $dp='1' }`,
    `      elseif (-not $dnsIp) { $dp='1' }`,
    `      return ($h + '|OK|' + $sam + '|' + $ip + '|' + $dnsIp + '|' + $dp)`,
    `    } catch { return ($h + '|ERR||||0') }`,
    `  } -ArgumentList $h`,
    `}`,
    `$null = Wait-Job -Job $jobs -Timeout ${SCAN_BATCH_WAIT_SEC} -EA SilentlyContinue`,
    `foreach ($j in $jobs) {`,
    `  $r = Receive-Job -Job $j -EA SilentlyContinue`,
    `  if ($r) { foreach ($rr in $r) { if ($rr) { Write-Output ("REC" + [char]9 + $rr) } } }`,
    `}`,
    `$jobs | Remove-Job -Force -EA SilentlyContinue`,
  ].join('\n')

  try {
    const res = await api().runPowerShell(script, (SCAN_BATCH_WAIT_SEC + 20) * 1000)
    const out = res.stdout ?? ''
    const recs: ComputerRecord[] = []
    for (const line of out.split(/\r?\n/)) {
      if (!line.startsWith('REC\t')) continue
      const [hostname, status, sam, ip, dnsIp, dp] = line.slice(4).trim().split('|')
      if (!hostname) continue
      recs.push({
        hostname,
        status: (status as ComputerRecord['status']) || 'ERR',
        sam: sam || '',
        ip: ip || '',
        dnsIp: dnsIp || '',
        dnsProblem: dp === '1',
      })
    }
    return recs
  } catch {
    // Batch komplett fehlgeschlagen -> als ERR markieren, Scan laeuft weiter
    return hosts.map(h => ({ hostname: h, status: 'ERR' as const, sam: '', ip: '', dnsIp: '', dnsProblem: false }))
  }
}

// ── Protokoll-Persistenz ─────────────────────────────────────────────────────
export async function listProtocols(): Promise<ScanProtocolMeta[]> {
  try {
    const idx = await api().netReadJson<{ items: ScanProtocolMeta[] }>(INDEX_FILE)
    if (idx && Array.isArray(idx.items)) {
      return [...idx.items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    }
  } catch { /* leer */ }
  return []
}

export async function loadProtocol(id: string): Promise<ScanProtocol | null> {
  try { return await api().netReadJson<ScanProtocol>(`${SCAN_DIR}/${id}.json`) } catch { return null }
}

export async function saveProtocol(protocol: ScanProtocol): Promise<boolean> {
  try {
    const ok = await api().netWriteJson(`${SCAN_DIR}/${protocol.id}.json`, protocol)
    if (!ok) return false
    const meta: ScanProtocolMeta = {
      id: protocol.id, createdAt: protocol.createdAt, by: protocol.by,
      totalUsers: protocol.totalUsers, withSession: protocol.withSession,
      dnsProblems: protocol.dnsProblems, computersScanned: protocol.computersScanned,
    }
    const existing = await listProtocols()
    const items = [meta, ...existing.filter(m => m.id !== meta.id)].slice(0, 100)
    await api().netWriteJson(INDEX_FILE, { version: 1, items })
    return true
  } catch {
    return false
  }
}

export async function deleteProtocol(id: string): Promise<boolean> {
  try {
    await api().netDeleteFile(`${SCAN_DIR}/${id}.json`).catch(() => {})
    const existing = await listProtocols()
    await api().netWriteJson(INDEX_FILE, { version: 1, items: existing.filter(m => m.id !== id) })
    return true
  } catch {
    return false
  }
}

// Aus Computer-Records + Benutzerliste die Benutzer-Zeilen bauen.
export function buildScanRows(
  records: ComputerRecord[],
  users: { sam: string; displayName: string; enabled: boolean; department?: string }[],
): ScanRow[] {
  // sam (lowercase) -> bestes Computer-Record (bevorzugt OK + angemeldet)
  const bySam = new Map<string, ComputerRecord>()
  for (const r of records) {
    if (r.status !== 'OK' || !r.sam) continue
    const key = r.sam.toLowerCase()
    if (!bySam.has(key)) bySam.set(key, r)
  }
  return users.map(u => {
    const rec = bySam.get(u.sam.toLowerCase())
    return {
      sam: u.sam,
      displayName: u.displayName,
      enabled: u.enabled,
      department: u.department,
      hostname: rec?.hostname ?? '',
      ip: rec?.ip ?? '',
      dnsIp: rec?.dnsIp ?? '',
      dnsProblem: rec?.dnsProblem ?? false,
      loggedIn: !!rec,
    }
  })
}

export function makeProtocolId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ── DNS-Check (Forward/Reverse-Konsistenz je IP) ─────────────────────────────

export const DNS_BATCH_SIZE = 128

export type DnsStatus = 'OK' | 'MISMATCH' | 'NO_PTR' | 'NO_A'
export interface DnsRow {
  ip: string
  host: string       // Hostname laut Reverse-DNS (PTR)
  fwdIp: string      // IP, auf die der Hostname per Forward-DNS aufloest
  status: DnsStatus
}

export interface DnsProtocolMeta { id: string; createdAt: string; by: string; total: number; problems: number }
export interface DnsProtocol extends DnsProtocolMeta { rows: DnsRow[] }

const DNS_DIR = 'config/user-presence/dns'
const DNS_INDEX = `${DNS_DIR}/index.json`

// Pro IP: Reverse-DNS (PTR) -> Hostname, dann Forward-DNS -> IP, vergleichen.
export async function dnsCheckBatch(ips: string[]): Promise<DnsRow[]> {
  if (ips.length === 0) return []
  const list = ips.map(ip => `'${ip}'`).join(',')
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$ips=@(${list})`,
    // Reverse-DNS asynchron (schnell, parallel)
    `$rev = foreach ($ip in $ips) { [pscustomobject]@{ IP=$ip; T=[System.Net.Dns]::GetHostEntryAsync($ip) } }`,
    `try { [System.Threading.Tasks.Task]::WaitAll(@($rev.T), 8000) } catch {}`,
    `foreach ($r in $rev) {`,
    `  $ptr=''`,
    `  try { if ($r.T.Status -eq 'RanToCompletion') { $ptr=[string]$r.T.Result.HostName } } catch {}`,
    `  $fwd=''`,
    `  if ($ptr) { try { $a=[System.Net.Dns]::GetHostAddresses($ptr) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1; if ($a) { $fwd=$a.IPAddressToString } } catch {} }`,
    `  $st = if (-not $ptr) { 'NO_PTR' } elseif (-not $fwd) { 'NO_A' } elseif ($fwd -ne $r.IP) { 'MISMATCH' } else { 'OK' }`,
    `  Write-Output ('DNS' + [char]9 + $r.IP + '|' + $ptr + '|' + $fwd + '|' + $st)`,
    `}`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 30000)
    const rows: DnsRow[] = []
    for (const line of (res.stdout ?? '').split(/\r?\n/)) {
      if (!line.startsWith('DNS\t')) continue
      const [ip, host, fwdIp, status] = line.slice(4).trim().split('|')
      if (!ip) continue
      rows.push({ ip, host: host || '', fwdIp: fwdIp || '', status: (status as DnsStatus) || 'NO_PTR' })
    }
    return rows
  } catch {
    return ips.map(ip => ({ ip, host: '', fwdIp: '', status: 'NO_PTR' as DnsStatus }))
  }
}

export async function listDnsProtocols(): Promise<DnsProtocolMeta[]> {
  try { const idx = await api().netReadJson<{ items: DnsProtocolMeta[] }>(DNS_INDEX); if (idx && Array.isArray(idx.items)) return [...idx.items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) } catch {}
  return []
}
export async function loadDnsProtocol(id: string): Promise<DnsProtocol | null> {
  try { return await api().netReadJson<DnsProtocol>(`${DNS_DIR}/${id}.json`) } catch { return null }
}
export async function saveDnsProtocol(p: DnsProtocol): Promise<boolean> {
  try {
    const ok = await api().netWriteJson(`${DNS_DIR}/${p.id}.json`, p)
    if (!ok) return false
    const meta: DnsProtocolMeta = { id: p.id, createdAt: p.createdAt, by: p.by, total: p.total, problems: p.problems }
    const existing = await listDnsProtocols()
    await api().netWriteJson(DNS_INDEX, { version: 1, items: [meta, ...existing.filter(m => m.id !== meta.id)].slice(0, 100) })
    return true
  } catch { return false }
}
export async function deleteDnsProtocol(id: string): Promise<boolean> {
  try { await api().netDeleteFile(`${DNS_DIR}/${id}.json`).catch(() => {}); const ex = await listDnsProtocols(); await api().netWriteJson(DNS_INDEX, { version: 1, items: ex.filter(m => m.id !== id) }); return true } catch { return false }
}
export function makeDnsProtocolId(): string { return `dns_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

// ── WinRM/Kerberos-Erreichbarkeit (Forward/Reverse-DNS je Hostname) ──────────
// Startet beim COMPUTERNAMEN: A-Record -> IP, dann PTR(IP) -> Name. Weicht der
// PTR-Name vom Hostnamen ab, schlaegt Kerberos/WinRM fehl (SPN-Mismatch,
// 0x80090322). Genau dieses Muster erzeugt "online, aber per WinRM nicht
// erreichbar" (Software-Inventar).

export const WINRM_DNS_BATCH_SIZE = 128

export type WinrmDnsStatus = 'OK' | 'MISMATCH' | 'NO_A' | 'NO_PTR'
export interface WinrmDnsRow {
  hostname: string   // geprueftes Computerkonto (aus dem Inventar)
  ip: string         // IP laut Forward-DNS (A-Record)
  ptr: string        // Name, auf den die A-Record-IP per Reverse-DNS (PTR) zeigt
  status: WinrmDnsStatus
}
export interface WinrmDnsProtocolMeta { id: string; createdAt: string; by: string; total: number; problems: number }
export interface WinrmDnsProtocol extends WinrmDnsProtocolMeta { rows: WinrmDnsRow[] }

const WINRM_DIR = 'config/user-presence/winrm'
const WINRM_INDEX = `${WINRM_DIR}/index.json`

export async function winrmDnsCheckBatch(hostnames: string[]): Promise<WinrmDnsRow[]> {
  if (hostnames.length === 0) return []
  const list = hostnames.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$hs=@(${list})`,
    // Phase 1: Forward (A) je Hostname asynchron
    `$fwd = foreach ($h in $hs) { [pscustomobject]@{ H=$h; T=[System.Net.Dns]::GetHostAddressesAsync($h) } }`,
    `try { [System.Threading.Tasks.Task]::WaitAll(@($fwd.T), 8000) } catch {}`,
    // IP herausziehen und Phase 2 (Reverse/PTR) asynchron starten
    `$mid = foreach ($f in $fwd) {`,
    `  $ip=''`,
    `  try { if ($f.T.Status -eq 'RanToCompletion') { $a=$f.T.Result | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1; if ($a) { $ip=$a.IPAddressToString } } } catch {}`,
    `  [pscustomobject]@{ H=$f.H; IP=$ip; RT=$(if ($ip) { [System.Net.Dns]::GetHostEntryAsync($ip) } else { $null }) }`,
    `}`,
    `$rts=@($mid | Where-Object { $_.RT } | ForEach-Object { $_.RT })`,
    `if ($rts.Count -gt 0) { try { [System.Threading.Tasks.Task]::WaitAll($rts, 8000) } catch {} }`,
    `foreach ($m in $mid) {`,
    `  $ptr=''`,
    `  try { if ($m.RT -and $m.RT.Status -eq 'RanToCompletion') { $ptr=[string]$m.RT.Result.HostName } } catch {}`,
    `  $st = if (-not $m.IP) { 'NO_A' } elseif (-not $ptr) { 'NO_PTR' } else { $ps=($ptr -split '\\.')[0]; $hn=($m.H -split '\\.')[0]; if ($ps -ieq $hn) { 'OK' } else { 'MISMATCH' } }`,
    `  Write-Output ('WRM' + [char]9 + $m.H + '|' + $m.IP + '|' + $ptr + '|' + $st)`,
    `}`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 40000)
    const rows: WinrmDnsRow[] = []
    for (const line of (res.stdout ?? '').split(/\r?\n/)) {
      if (!line.startsWith('WRM\t')) continue
      const [hostname, ip, ptr, status] = line.slice(4).trim().split('|')
      if (!hostname) continue
      rows.push({ hostname, ip: ip || '', ptr: ptr || '', status: (status as WinrmDnsStatus) || 'NO_A' })
    }
    return rows
  } catch {
    return hostnames.map(h => ({ hostname: h, ip: '', ptr: '', status: 'NO_A' as WinrmDnsStatus }))
  }
}

export async function listWinrmProtocols(): Promise<WinrmDnsProtocolMeta[]> {
  try { const idx = await api().netReadJson<{ items: WinrmDnsProtocolMeta[] }>(WINRM_INDEX); if (idx && Array.isArray(idx.items)) return [...idx.items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) } catch {}
  return []
}
export async function loadWinrmProtocol(id: string): Promise<WinrmDnsProtocol | null> {
  try { return await api().netReadJson<WinrmDnsProtocol>(`${WINRM_DIR}/${id}.json`) } catch { return null }
}
export async function saveWinrmProtocol(p: WinrmDnsProtocol): Promise<boolean> {
  try {
    const ok = await api().netWriteJson(`${WINRM_DIR}/${p.id}.json`, p)
    const meta: WinrmDnsProtocolMeta = { id: p.id, createdAt: p.createdAt, by: p.by, total: p.total, problems: p.problems }
    const existing = await listWinrmProtocols()
    await api().netWriteJson(WINRM_INDEX, { version: 1, items: [meta, ...existing.filter(m => m.id !== meta.id)].slice(0, 100) })
    return ok
  } catch { return false }
}
export async function deleteWinrmProtocol(id: string): Promise<boolean> {
  try { await api().netDeleteFile(`${WINRM_DIR}/${id}.json`).catch(() => {}); const ex = await listWinrmProtocols(); await api().netWriteJson(WINRM_INDEX, { version: 1, items: ex.filter(m => m.id !== id) }); return true } catch { return false }
}
export function makeWinrmProtocolId(): string { return `wrm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

// ── IP-basierter Standort-Scan (DNS-unabhaengig) ─────────────────────────────

export const PING_BATCH_SIZE = 256
export const IP_PROBE_BATCH_SIZE = 10
// Ausnahme (vom Nutzer freigegeben): Die EINZEL-Suche darf 50 Geraete parallel
// abfragen — die Last liegt fast komplett auf dem Admin-PC (1 WinRM-Verbindung
// pro Zielgeraet, ~50 lokale PowerShell-Jobs), nicht auf Netz/Servern.
export const IP_PROBE_BATCH_SIZE_SINGLE = 50
export const IP_PROBE_WAIT_SEC = 35

export interface SiteSubnets { ok: boolean; site: string; subnets: string[]; error?: string }

// Subnetze des AD-Standorts, dessen Name den Filter enthaelt (Standard: DEHAM).
// Quelle: AD Sites & Services (Get-ADReplicationSubnet -> Site).
export async function getSiteSubnets(siteFilter = 'DEHAM'): Promise<SiteSubnets> {
  const f = siteFilter.replace(/'/g, "''")
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$target='${f}'`,
    `$subs = Get-ADReplicationSubnet -Filter * -Properties Site -EA SilentlyContinue`,
    `if (-not $subs) { Write-Output 'NOSUBNETS'; exit }`,
    `$sites = New-Object System.Collections.Generic.HashSet[string]`,
    `foreach ($s in $subs) {`,
    `  $sn=''`,
    `  if ($s.Site) { $sn = (($s.Site -split ',')[0] -replace '^CN=','') }`,
    `  if ($sn -and $sn -like "*$target*") { [void]$sites.Add($sn); Write-Output ('SUBNET' + [char]9 + [string]$s.Name) }`,
    `}`,
    `foreach ($x in $sites) { Write-Output ('SITE' + [char]9 + $x) }`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 30000)
    const out = res.stdout ?? ''
    if (out.includes('NOSUBNETS')) return { ok: false, site: '', subnets: [], error: 'Keine Subnetze im AD (Sites & Services) gefunden.' }
    const siteNames: string[] = []
    const subnets: string[] = []
    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith('SITE\t')) { const s = line.split('\t')[1]; if (s) siteNames.push(s) }
      else if (line.startsWith('SUBNET\t')) { const c = line.split('\t')[1]; if (c && c.includes('/') && !c.includes(':')) subnets.push(c) }
    }
    const uniqueSubnets = [...new Set(subnets)]
    if (uniqueSubnets.length === 0) {
      return { ok: false, site: '', subnets: [], error: `Kein AD-Standort mit „${siteFilter}" gefunden — bitte Subnetz manuell eintragen.` }
    }
    return { ok: true, site: siteNames.join(', ') || siteFilter, subnets: uniqueSubnets }
  } catch (e) {
    return { ok: false, site: '', subnets: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// CIDR -> Liste der Host-IPs (IPv4). Netz-/Broadcast-Adresse wird ausgelassen.
function ipToInt(ip: string): number {
  const p = ip.split('.').map(Number)
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0
}
function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}
export function expandCidr(cidr: string): string[] {
  const [base, bitsStr] = cidr.split('/')
  const bits = parseInt(bitsStr, 10)
  if (!base || base.includes(':') || isNaN(bits) || bits < 0 || bits > 32) return []
  const baseInt = ipToInt(base)
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0
  const network = (baseInt & mask) >>> 0
  const size = Math.pow(2, 32 - bits)
  const ips: string[] = []
  if (bits >= 31) { for (let i = 0; i < size; i++) ips.push(intToIp((network + i) >>> 0)) }
  else { for (let i = 1; i < size - 1; i++) ips.push(intToIp((network + i) >>> 0)) }
  return ips
}
export function expandSubnets(cidrs: string[], maxTotal = 8192): { ips: string[]; capped: boolean } {
  const seen = new Set<string>()
  const ips: string[] = []
  // WICHTIG: NICHT expandCidr(c) aufrufen — das würde ein sehr kleines Präfix
  // (z. B. /8 = 16 Mio. Hosts) komplett im Speicher materialisieren und den
  // Renderer einfrieren/OOM, BEVOR die Kappung greift. Stattdessen je Subnetz
  // lazy generieren und beim Erreichen von maxTotal sofort abbrechen.
  for (const c of cidrs) {
    const [base, bitsStr] = (c || '').split('/')
    const bits = parseInt(bitsStr, 10)
    if (!base || base.includes(':') || isNaN(bits) || bits < 0 || bits > 32) continue
    const baseInt = ipToInt(base)
    const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0
    const network = (baseInt & mask) >>> 0
    const size = Math.pow(2, 32 - bits)
    const start = bits >= 31 ? 0 : 1
    const end = bits >= 31 ? size : size - 1
    for (let i = start; i < end; i++) {
      const ip = intToIp((network + i) >>> 0)
      if (seen.has(ip)) continue
      seen.add(ip); ips.push(ip)
      if (ips.length >= maxTotal) return { ips, capped: true }
    }
  }
  return { ips, capped: false }
}

// Ping-Sweep eines IP-Batches (DNS-unabhaengig, asynchron). Liefert online-IPs.
//
// Robustheit: WaitAll bekommt ein hartes Zeitlimit — haengt auch nur ein
// einzelner Ping-Task, wuerde ein grenzenloses WaitAll sonst das aeussere
// runPowerShell-Timeout reissen und der GANZE Batch lieferte still 0 Treffer
// (Symptom: "0 von 0 geprueft"). Ausgewertet werden nur fertige Tasks; der
// DONE-Marker verraet, ob das Skript regulaer durchgelaufen ist.
export async function pingBatch(ips: string[], timeoutMs = 500): Promise<{ up: string[]; error?: string }> {
  if (ips.length === 0) return { up: [] }
  const list = ips.map(ip => `'${ip}'`).join(',')
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$ips=@(${list})`,
    `$tasks = foreach ($ip in $ips) { try { [pscustomobject]@{ IP=$ip; T=([System.Net.NetworkInformation.Ping]::new()).SendPingAsync($ip, ${timeoutMs}) } } catch {} }`,
    `$tasks = @($tasks | Where-Object { $_ -and $_.T })`,
    `try { [void][System.Threading.Tasks.Task]::WaitAll(@($tasks.T), ${timeoutMs + 4000}) } catch {}`,
    `foreach ($t in $tasks) { try { if ($t.T.IsCompleted -and -not $t.T.IsFaulted -and $t.T.Result.Status -eq 'Success') { Write-Output ('UP' + [char]9 + $t.IP) } } catch {} }`,
    `Write-Output 'DONE'`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 30000)
    const out = res.stdout ?? ''
    const up = out.split(/\r?\n/).filter(l => l.startsWith('UP\t')).map(l => l.split('\t')[1]).filter(Boolean)
    if (!out.includes('DONE')) {
      const detail = (res.stderr ?? '').trim().split(/\r?\n/)[0] || 'PowerShell-Skript wurde vorzeitig beendet (Timeout).'
      return { up, error: detail }
    }
    return { up }
  } catch (e) {
    return { up: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Bekannte Hostnamen (z. B. aus dem Inventar) per DNS zu IPv4-Adressen aufloesen.
// Fuer den Fast-Path der Einzel-Suche: die wahrscheinlichen Geraete des Users
// direkt proben, bevor der volle Subnetz-Scan startet. Ein falscher DNS-Eintrag
// ist unkritisch — das Probe-Ergebnis wird ohnehin gegen den echten Benutzer
// verifiziert, und bei Nichttreffer greift der volle Scan.
export async function resolveHostsToIps(hostnames: string[]): Promise<string[]> {
  const clean = [...new Set(hostnames.map(h => h.trim()).filter(Boolean))].slice(0, 20)
  if (clean.length === 0) return []
  const list = clean.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `foreach ($h in @(${list})) {`,
    `  try {`,
    `    $a = [System.Net.Dns]::GetHostAddresses($h) | Where-Object { $_.AddressFamily -eq 'InterNetwork' }`,
    `    foreach ($x in $a) { Write-Output ('IP' + [char]9 + $x.IPAddressToString) }`,
    `  } catch {}`,
    `}`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 15000)
    const ips = (res.stdout ?? '').split(/\r?\n/).filter(l => l.startsWith('IP\t')).map(l => l.split('\t')[1]).filter(Boolean)
    return [...new Set(ips)]
  } catch {
    return []
  }
}

// Online-IPs abfragen: angemeldeter Benutzer + Geraete-Hostname.
//
// Reihenfolge der Methoden (schnell -> langsam), jede fuer sich robust:
//   1) WMI/CIM ueber DCOM (Win32_ComputerSystem.UserName)  -> KEIN WinRM noetig,
//      liefert den interaktiv an der Konsole angemeldeten Benutzer.
//   2) quser /server:<ip>  -> faengt zusaetzlich RDP-Sitzungen ab (auch ohne WinRM).
//   3) WinRM/Invoke-Command -> nur als letzte Rueckfallebene (activate=true).
//
// Parallelisierung ueber einen Runspace-Pool statt Start-Job (deutlich leichter
// und schneller). Jede Remote-Operation hat ein hartes Zeitlimit, damit ein
// haengendes Geraet nie den ganzen Batch blockiert.
//
// Status:  OK + sam  = Benutzer gefunden ·  OK ohne sam = erreichbar, niemand
// angemeldet ·  OFFLINE = per DCOM/quser nicht erreichbar (Kandidat fuer den
// WinRM-Pass).  activate=false laesst Schritt 3 (WinRM) weg.
export async function scanIpsBatch(ips: string[], activate = true): Promise<ComputerRecord[]> {
  if (ips.length === 0) return []
  const list = ips.map(ip => `'${ip}'`).join(',')
  const waitSec = activate ? IP_PROBE_WAIT_SEC : 20
  const winrmStep = activate
    ? `    if (-not $u) { try { $so=New-PSSessionOption -OpenTimeout 5000 -OperationTimeout 9000 -CancelTimeout 2000; $r=Invoke-Command -ComputerName $ip -SessionOption $so -EA Stop -ScriptBlock { $x=''; try { $x=(Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}; if (-not $x) { try { $qq=@(quser 2>$null); $ln=($qq | Where-Object { $_ -match 'Aktiv|Active' } | Select-Object -First 1); if (-not $ln) { $ln=($qq | Where-Object { $_ -notmatch 'USERNAME|BENUTZER' } | Select-Object -First 1) }; if ($ln) { $x=((($ln -replace '^[>\\s]+','') -split '\\s{2,}')[0]); if ($x -and $x -notmatch '\\\\') { $x="$env:USERDOMAIN\\$x" } } } catch {} }; [string]$x }; if ($r) { $u=[string]$r; $reach=$true } } catch {} }`
    : ''
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$ips=@(${list})`,
    `$sb={`,
    `  param($ip)`,
    `  $u=''; $cn=''; $reach=$false`,
    // 1) WMI/CIM ueber DCOM — kein WinRM noetig
    `  try {`,
    `    $opt=New-CimSessionOption -Protocol Dcom`,
    `    $s=New-CimSession -ComputerName $ip -SessionOption $opt -OperationTimeoutSec 8 -EA Stop`,
    `    try { $cs=Get-CimInstance -CimSession $s -ClassName Win32_ComputerSystem -OperationTimeoutSec 8 -EA Stop; $u=[string]$cs.UserName; $cn=[string]$cs.DNSHostName; if (-not $cn) { $cn=[string]$cs.Name }; $reach=$true } finally { Remove-CimSession $s -EA SilentlyContinue }`,
    `  } catch {}`,
    // 2) quser /server (RPC) — faengt RDP-Sitzungen ab, auch wenn UserName leer war
    `  if (-not $u) { try { $qq=@(quser /server:$ip 2>$null); if ($qq -and $qq.Count -gt 1) { $reach=$true; $ln=($qq | Where-Object { $_ -match 'Aktiv|Active' } | Select-Object -First 1); if (-not $ln) { $ln=($qq | Where-Object { $_ -notmatch 'USERNAME|BENUTZER' } | Select-Object -First 1) }; if ($ln) { $x=((($ln -replace '^[>\\s]+','') -split '\\s{2,}')[0]); if ($x) { $u=$x } } } } catch {} }`,
    // 3) WinRM (nur bei activate=true)
    winrmStep,
    // Hostname sicherstellen
    `  if (-not $cn) { try { $cn=([System.Net.Dns]::GetHostEntry($ip)).HostName } catch { $cn=$ip } }`,
    `  $sam=''; if ($u) { $sam=($u -split '\\\\')[-1] }`,
    // DNS-Gegenprobe: Hostname -> IP; weicht sie von der echten IP ab => DNS-Problem
    `  $dnsIp=''; try { $dnsIp=([System.Net.Dns]::GetHostAddresses($cn) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1).IPAddressToString } catch {}`,
    `  $dp='0'; if (-not $dnsIp) { $dp='1' } elseif ($dnsIp -ne $ip) { $dp='1' }`,
    `  if ($sam) { return ($ip + '|OK|' + $sam + '|' + $cn + '|' + $dnsIp + '|' + $dp) }`,
    `  elseif ($reach) { return ($ip + '|OK||' + $cn + '|' + $dnsIp + '|' + $dp) }`,
    `  else { return ($ip + '|OFFLINE||||0') }`,
    `}`,
    `$max=[Math]::Min(50,$ips.Count); if ($max -lt 1) { $max=1 }`,
    `$pool=[runspacefactory]::CreateRunspacePool(1,$max); $pool.Open()`,
    `$hs=@()`,
    `$sbText=[string]$sb`,
    `foreach ($ip in $ips) { $p=[powershell]::Create(); $p.RunspacePool=$pool; [void]$p.AddScript($sbText); [void]$p.AddArgument($ip); $hs += [pscustomobject]@{ P=$p; H=$p.BeginInvoke() } }`,
    `$sw=[System.Diagnostics.Stopwatch]::StartNew()`,
    `foreach ($h in $hs) { $rem=(${waitSec}*1000)-$sw.ElapsedMilliseconds; if ($rem -lt 0) { $rem=0 }; if ($h.H.AsyncWaitHandle.WaitOne([int]$rem)) { try { foreach ($o in $h.P.EndInvoke($h.H)) { if ($o) { Write-Output ('REC' + [char]9 + $o) } } } catch {} } }`,
    `Write-Output 'DONE'`,
  ].join('\n')
  try {
    const timeoutMs = (waitSec + 20) * 1000
    const res = await api().runPowerShell(script, timeoutMs)
    const out = res.stdout ?? ''
    const recs: ComputerRecord[] = []
    for (const line of out.split(/\r?\n/)) {
      if (!line.startsWith('REC\t')) continue
      // ip|status|sam|hostname|dnsIp|dp
      const [ip, status, sam, hostname, dnsIp, dp] = line.slice(4).trim().split('|')
      if (!ip) continue
      recs.push({
        hostname: hostname || ip,    // Geraete-Hostname (vom Geraet gemeldet)
        status: (status as ComputerRecord['status']) || 'ERR',
        sam: sam || '',
        ip,                          // echte, verbundene IP (massgeblich)
        dnsIp: dnsIp || '',
        dnsProblem: dp === '1',
      })
    }
    return recs
  } catch {
    return ips.map(ip => ({ hostname: ip, status: 'ERR' as const, sam: '', ip, dnsIp: '', dnsProblem: false }))
  }
}
