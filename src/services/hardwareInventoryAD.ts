// ── Hardware-Inventur – AD-Lookup für fehlende Geräte ────────────────────────
// Pro fehlendem Gerät werden alle ausgewählten Präfixe als Hostname-Kandidat
// gebaut (Präfix + Seriennummer). Der erste in AD vorhandene Hostname wird
// verwendet; für ihn werden Online-Status, Last-Logon und aktuell angemeldeter
// Benutzer ermittelt. Parallel max. 10 Geräte (Performance-Regel).

import { api } from '../electronAPI'

export interface AdLookupResult {
  serial: string
  prefixesUsed: string[]
  hostname?: string
  online?: boolean
  lastOnline?: string
  currentUser?: string
  error?: string
}

const PARALLEL = 8
const TIMEOUT_MS = 90000

function psEscape(s: string): string {
  return s.replace(/'/g, "''")
}

function buildScript(serial: string, prefixes: string[]): string {
  // Hostname-Kandidaten als PS-Array
  const candidates = prefixes.map(p => `'${psEscape(p + serial)}'`).join(',')
  const lines: string[] = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `Import-Module ActiveDirectory -EA SilentlyContinue`,
    `$cands = @(${candidates})`,
    `$found = $null`,
    `foreach ($c in $cands) {`,
    `  try {`,
    `    $cmp = Get-ADComputer -Identity $c -Properties LastLogonDate -EA Stop`,
    `    if ($cmp) { $found = $cmp; break }`,
    `  } catch {}`,
    `}`,
    `if (-not $found) {`,
    `  Write-Output ('@NOT_FOUND@' + ($cands -join ','))`,
    `  return`,
    `}`,
    `$hn = [string]$found.Name`,
    `$ll = if ($found.LastLogonDate) { $found.LastLogonDate.ToString('o') } else { '' }`,
    `$online = $false`,
    `try { $online = Test-Connection -ComputerName $hn -Count 1 -Quiet -EA SilentlyContinue } catch {}`,
    `$cu = ''`,
    `if ($online) {`,
    `  try {`,
    `    $cs = Get-CimInstance -ComputerName $hn -ClassName Win32_ComputerSystem -EA SilentlyContinue`,
    `    if ($cs -and $cs.UserName) { $cu = [string]$cs.UserName }`,
    `  } catch {}`,
    `  if (-not $cu) {`,
    `    try {`,
    `      $q = Invoke-Command -ComputerName $hn -ScriptBlock { quser 2>&1 } -EA SilentlyContinue`,
    `      if ($q) {`,
    `        $lines = ($q -split "\`r?\`n") | Where-Object { $_ -match 'console|rdp-tcp|Active' }`,
    `        if ($lines) { $cu = ($lines[0] -replace '^\\s*>?\\s*([^\\s]+).*','$1') }`,
    `      }`,
    `    } catch {}`,
    `  }`,
    `}`,
    `$obj = [pscustomobject]@{ hostname=$hn; online=$online; lastOnline=$ll; currentUser=$cu }`,
    `Write-Output ('@RES@' + ($obj | ConvertTo-Json -Compress))`,
  ]
  return lines.join('\n')
}

export async function lookupOne(serial: string, prefixes: string[]): Promise<AdLookupResult> {
  if (prefixes.length === 0) return { serial, prefixesUsed: [], error: 'Kein Präfix gewählt' }
  try {
    const script = buildScript(serial, prefixes)
    const res = await api().runPowerShell(script, TIMEOUT_MS)
    const lines = (res.stdout || '').split(/\r?\n/)
    for (const raw of lines) {
      const line = raw.trim()
      if (line.startsWith('@RES@')) {
        try {
          const o = JSON.parse(line.slice(5)) as { hostname: string; online: boolean; lastOnline: string; currentUser: string }
          return {
            serial, prefixesUsed: prefixes,
            hostname: o.hostname, online: !!o.online,
            lastOnline: o.lastOnline || undefined,
            currentUser: o.currentUser || undefined,
          }
        } catch { /* nächste Zeile */ }
      }
      if (line.startsWith('@NOT_FOUND@')) {
        return { serial, prefixesUsed: prefixes, error: 'Kein Hostname-Kandidat in AD gefunden' }
      }
    }
    const err = (res.stderr || '').trim().slice(0, 200)
    return { serial, prefixesUsed: prefixes, error: err || 'Keine Antwort vom AD' }
  } catch (e) {
    return { serial, prefixesUsed: prefixes, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Parallel-Lookup mit kleiner Pool-Größe (Performance-Regel: max. ~10 parallel).
 * onProgress wird nach jedem fertigen Eintrag aufgerufen.
 */
export async function lookupMany(serials: string[], prefixes: string[], onProgress?: (done: number, total: number, last?: AdLookupResult) => void): Promise<AdLookupResult[]> {
  const out: AdLookupResult[] = []
  let next = 0
  const total = serials.length

  async function worker(): Promise<void> {
    while (next < serials.length) {
      const i = next++
      const r = await lookupOne(serials[i], prefixes)
      out[i] = r
      onProgress?.(out.filter(Boolean).length, total, r)
    }
  }

  const workers = Array.from({ length: Math.min(PARALLEL, serials.length) }, () => worker())
  await Promise.all(workers)
  return out
}
