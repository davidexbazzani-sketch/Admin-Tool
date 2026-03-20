// ── WinRM ensure utility ──────────────────────────────────────────────────────
// Starts WinRM on a remote host using [System.ServiceProcess.ServiceController]
// – the same .NET API used by compmgmt.msc. Works over RPC/SMB without needing
// WinRM to already be running.
// Result is cached per hostname for the lifetime of the renderer process.

import { api } from '../electronAPI'

const winrmCache = new Map<string, boolean>()

export function clearWinRMCache(hostname?: string): void {
  if (hostname) winrmCache.delete(hostname.toLowerCase())
  else winrmCache.clear()
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
export async function ensureWinRM(hostname: string): Promise<boolean> {
  const key = hostname.toLowerCase()
  if (winrmCache.has(key)) return winrmCache.get(key)!

  const script = buildEnsureWinRMScript(hostname)
  const result = await api().runPowerShell(script, 30000)
  let ok = false
  try {
    const parsed = JSON.parse(result.stdout.trim())
    ok = parsed.winrmActive === true
  } catch { /* default false */ }

  winrmCache.set(key, ok)
  return ok
}
