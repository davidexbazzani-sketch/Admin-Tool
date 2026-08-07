// ── Benutzer-Anmeldungen finden (mit IP + DNS-Check) ─────────────────────────
// Ermittelt, auf welchen PCs ein Benutzer AKTUELL angemeldet ist. Scannt die
// Computer im Standort-OU des Benutzers (aktiv in den letzten Wochen) parallel
// und gedrosselt. Pro Treffer wird zusaetzlich ermittelt:
//   - die tatsaechliche IP des Geraets (vom Geraet selbst abgefragt)
//   - die DNS-Aufloesung des Hostnamens (Ping vom Admin-PC)
//   - ob ein DNS-Problem vorliegt (Antwortender Rechner != Hostname, oder
//     DNS-IP != Geraete-IP, oder Hostname nicht aufloesbar)

import { api } from '../electronAPI'

export interface SessionHit {
  hostname: string
  state: 'Aktiv' | 'Getrennt' | string
  ip: string          // tatsaechliche IP des Geraets
  dnsIp: string       // IP laut DNS/Ping des Hostnamens
  dnsProblem: boolean
}

export interface PresenceResult {
  ok: boolean
  hits: SessionHit[]
  scanned: number
  error?: string
}

const MAX_COMPUTERS = 150
const BATCH_SIZE = 12
const BATCH_WAIT_SEC = 12

// Gemeinsamer Job-Scriptblock (als PS-Text), der einen Host prueft und bei
// Treffer "host|state|ip|dnsIp|dnsProblem" zurueckliefert (sonst '').
// $matchSam steuert, ob nur ein bestimmter Benutzer zaehlt.
export const HOST_PROBE_JOB = [
  `param($h,$s)`,
  `try {`,
  `  $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ComputerName $h -OperationTimeoutSec 4 -EA SilentlyContinue`,
  `  if (-not $cs) { return '' }`,
  `  $state='Aktiv'; $matched=$false`,
  `  if ($s) {`,
  `    if ($cs.UserName -match "\\\\$s$") { $matched=$true }`,
  `    if (-not $matched) {`,
  `      try { $q=quser /server:$h 2>$null; foreach($l in $q){ if($l -match "(?i)\\b$s\\b"){ $matched=$true; if($l -match '(?i)Disc|Getr'){$state='Getrennt'}; break } } } catch {}`,
  `    }`,
  `    if (-not $matched) { return '' }`,
  `  }`,
  `  $ip=''`,
  `  try { $ip = (Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -ComputerName $h -OperationTimeoutSec 4 -EA SilentlyContinue | Where-Object { $_.IPEnabled -and $_.IPAddress } | ForEach-Object { $_.IPAddress } | Where-Object { $_ -like '*.*.*.*' -and $_ -notlike '169.254.*' -and $_ -notlike '*:*' } | Select-Object -First 1) } catch {}`,
  `  $remoteName=[string]$cs.Name`,
  `  $dnsIp=''`,
  `  try { $dnsIp = (Test-Connection -ComputerName $h -Count 1 -EA Stop).IPV4Address.IPAddressToString } catch { try { $dnsIp = ([System.Net.Dns]::GetHostAddresses($h) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1).IPAddressToString } catch {} }`,
  `  $dnsProblem='0'`,
  `  if ($remoteName -and ($remoteName -notlike "$h*")) { $dnsProblem='1' }`,
  `  elseif ($ip -and $dnsIp -and ($ip -ne $dnsIp)) { $dnsProblem='1' }`,
  `  elseif (-not $dnsIp) { $dnsProblem='1' }`,
  `  return ($h + '|' + $state + '|' + $ip + '|' + $dnsIp + '|' + $dnsProblem)`,
  `} catch { return '' }`,
].join('\n')

export async function findUserSessions(sam: string): Promise<PresenceResult> {
  const s = sam.trim().replace(/'/g, "''")
  if (!s) return { ok: false, hits: [], scanned: 0, error: 'Kein Benutzer angegeben.' }

  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$sam='${s}'`,
    `$u = Get-ADUser -Identity $sam -Properties DistinguishedName -EA SilentlyContinue`,
    `if (-not $u) { Write-Output 'NOUSER'; exit }`,
    `$siteOU = $u.DistinguishedName -replace '^CN=[^,]+,','' -replace '^[^,]+,',''`,
    `$comps = @()`,
    `if ($siteOU) {`,
    `  $comps = @(Get-ADComputer -Filter 'Enabled -eq $true' -SearchBase $siteOU -Properties LastLogonDate -EA SilentlyContinue |`,
    `    Where-Object { $_.LastLogonDate -and $_.LastLogonDate -gt (Get-Date).AddDays(-45) } |`,
    `    Sort-Object LastLogonDate -Descending | Select-Object -First ${MAX_COMPUTERS} -ExpandProperty Name)`,
    `}`,
    `Write-Output ("META" + [char]9 + $comps.Count)`,
    `if ($comps.Count -eq 0) { exit }`,
    `$batch = ${BATCH_SIZE}`,
    `for ($i=0; $i -lt $comps.Count; $i += $batch) {`,
    `  $end = [Math]::Min($i+$batch-1, $comps.Count-1)`,
    `  $slice = $comps[$i..$end]`,
    `  $jobs = @()`,
    `  foreach ($h in $slice) {`,
    `    $jobs += Start-Job -ScriptBlock {`,
    HOST_PROBE_JOB,
    `    } -ArgumentList $h,$sam`,
    `  }`,
    `  $null = Wait-Job -Job $jobs -Timeout ${BATCH_WAIT_SEC} -EA SilentlyContinue`,
    `  foreach ($j in $jobs) {`,
    `    $r = Receive-Job -Job $j -EA SilentlyContinue`,
    `    if ($r) { foreach ($rr in $r) { if ($rr) { Write-Output ("SESS" + [char]9 + $rr) } } }`,
    `  }`,
    `  $jobs | Remove-Job -Force -EA SilentlyContinue`,
    `}`,
  ].join('\n')

  try {
    const res = await api().runPowerShell(script, 220000)
    const out = res.stdout ?? ''
    if (out.includes('NOUSER')) return { ok: false, hits: [], scanned: 0, error: 'Benutzer nicht im AD gefunden.' }

    let scanned = 0
    const metaLine = out.split(/\r?\n/).find(l => l.startsWith('META\t'))
    if (metaLine) scanned = parseInt(metaLine.split('\t')[1], 10) || 0

    const seen = new Set<string>()
    const hits: SessionHit[] = []
    for (const line of out.split(/\r?\n/)) {
      if (!line.startsWith('SESS\t')) continue
      const [host, state, ip, dnsIp, dnsProblem] = line.slice(5).trim().split('|')
      const key = (host || '').toUpperCase()
      if (!host || seen.has(key)) continue
      seen.add(key)
      hits.push({
        hostname: host,
        state: (state as SessionHit['state']) || 'Aktiv',
        ip: ip || '',
        dnsIp: dnsIp || '',
        dnsProblem: dnsProblem === '1',
      })
    }
    return { ok: true, hits, scanned }
  } catch (e) {
    return { ok: false, hits: [], scanned: 0, error: e instanceof Error ? e.message : String(e) }
  }
}
