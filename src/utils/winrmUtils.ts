// ── WinRM ensure utility ──────────────────────────────────────────────────────
// Starts WinRM on a remote host using [System.ServiceProcess.ServiceController]
// – the same .NET API used by compmgmt.msc. Works over RPC/SMB without needing
// WinRM to already be running.
// Result is cached per hostname for the lifetime of the renderer process.

import { api } from '../electronAPI'

const winrmCache = new Map<string, boolean>()

export function clearWinRMCache(hostname?: string): void {
  if (hostname) { winrmCache.delete(hostname.toLowerCase()); misserfolgBis.delete(hostname.toLowerCase()) }
  else { winrmCache.clear(); misserfolgBis.clear() }
}

export function buildEnsureWinRMScript(hostname: string): string {
  const h = hostname.replace(/'/g, "''")
  return [
    `$winrm = $false`,
    `try { Test-WSMan -ComputerName '${h}' -EA Stop | Out-Null; $winrm = $true } catch {}`,
    `if (-not $winrm) {`,
    `  # Method 1: Get-Service -ComputerName | Start() — RPC/SMB, same as compmgmt.msc`,
    `  try {`,
    `    $svc = Get-Service -ComputerName '${h}' -Name WinRM -EA Stop`,
    `    if ($svc.StartType -eq 'Disabled') { Set-Service -ComputerName '${h}' -Name WinRM -StartupType Manual -EA Stop }`,
    `    $svc.Start()`,
    `    $svc.WaitForStatus('Running', [TimeSpan]::FromSeconds(15))`,
    `    $winrm = $true`,
    `  } catch {}`,
    `  # Method 2: ServiceController .NET class`,
    `  if (-not $winrm) {`,
    `    try {`,
    `      $sc = [System.ServiceProcess.ServiceController]::new('WinRM', '${h}')`,
    `      $sc.Start()`,
    `      $sc.WaitForStatus('Running', [TimeSpan]::FromSeconds(15))`,
    `      $sc.Close()`,
    `      $winrm = $true`,
    `    } catch {}`,
    `  }`,
    `  # Method 3: sc.exe over SMB`,
    `  if (-not $winrm) {`,
    `    try {`,
    `      & sc.exe "\\\\${h}" start WinRM 2>&1 | Out-Null`,
    `      Start-Sleep -Seconds 3`,
    `      $chk = Get-Service -ComputerName '${h}' -Name WinRM -EA SilentlyContinue`,
    `      if ($chk -and $chk.Status -eq 'Running') { $winrm = $true }`,
    `    } catch {}`,
    `  }`,
    `}`,
    `@{ winrmActive=$winrm } | ConvertTo-Json -Compress`,
  ].join('\n')
}

/** Ensures WinRM is running on `hostname`. Result is cached per session. */
// Laufende Prüfungen je Hostname. Der Cache oben wird erst NACH dem Lauf gefüllt —
// ohne diese Zwischenstufe starten gleichzeitige Anfragen für denselben PC jeweils ein
// eigenes powershell.exe mit bis zu 60 s Laufzeit. Das passiert im Alltag ständig
// (Personen-Dossier fragt Drucker und Postfächer parallel für dasselbe Gerät ab,
// Sound Fix hat drei Abschnitte auf einem Host, Daylis mehrere Befehle). Jetzt teilen
// sich alle Wartenden EINE Prüfung.
const laufendeChecks = new Map<string, Promise<boolean>>()

// Wie lange ein MISSERFOLG gemerkt wird. Erfolge gelten für die Laufzeit des Fensters
// (WinRM bleibt an), Misserfolge nur kurz: sonst gilt ein PC, der morgens aus war oder
// bei dem eine einzelne Abfrage in ein Zeitfenster gelaufen ist, bis zum Programm-
// Neustart als unerreichbar — und das sieht nach „gar nichts geht mehr" aus.
const MISSERFOLG_GILT_MS = 2 * 60 * 1000
const misserfolgBis = new Map<string, number>()

export async function ensureWinRM(hostname: string): Promise<boolean> {
  const key = hostname.toLowerCase()
  if (winrmCache.get(key) === true) return true
  if (winrmCache.get(key) === false) {
    const bis = misserfolgBis.get(key) ?? 0
    if (Date.now() < bis) return false
    // Merkzeit abgelaufen → erneut versuchen.
    winrmCache.delete(key)
    misserfolgBis.delete(key)
  }
  const laufend = laufendeChecks.get(key)
  if (laufend) return laufend

  const p = ensureWinRMIntern(hostname, key).finally(() => { laufendeChecks.delete(key) })
  laufendeChecks.set(key, p)
  return p
}

async function ensureWinRMIntern(hostname: string, key: string): Promise<boolean> {
  const script = buildEnsureWinRMScript(hostname)
  // 60s wie beim Remote-Doc-Connect: die Kaltaktivierung (WinRM-Dienst per RPC/SMB
  // starten) durchläuft im schlechtesten Fall 3 Methoden mit je bis zu 15s Wartezeit
  // (≈33s). 30s waren zu knapp -> Timeout -> fälschlich "WinRM nicht aktiv".
  const result = await api().runPowerShell(script, 60000)
  let ok = false
  try {
    const parsed = JSON.parse(result.stdout.trim())
    ok = parsed.winrmActive === true
  } catch { /* default false */ }

  winrmCache.set(key, ok)
  if (!ok) misserfolgBis.set(key, Date.now() + MISSERFOLG_GILT_MS)
  else misserfolgBis.delete(key)
  return ok
}
