// ── Robust multi-method connectivity check ──────────────────────────────────
// Many corporate PCs block ICMP (ping) via Windows Firewall, but SMB (445) and
// RPC (135) are always open for AD/GPO/file-sharing. This check tries multiple
// methods so we don't falsely mark reachable PCs as "offline".

/**
 * Returns a PowerShell script block that sets two variables:
 *   $online  [bool]  — whether the host is reachable
 *   $method  [string] — which method succeeded ('Ping'|'SMB'|'RPC'|'DNS'|'none')
 */
export function buildOnlineCheck(hostname: string): string {
  const h = hostname.replace(/'/g, "''")
  return [
    '$online = $false',
    "$method = 'none'",
    // Method 1: ICMP Ping (fastest)
    "try { if (Test-Connection -ComputerName '" + h + "' -Count 1 -Quiet -EA SilentlyContinue) { $online = $true; $method = 'Ping' } } catch {}",
    // Method 2: TCP 445 (SMB — always open on domain PCs)
    'if (-not $online) { try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync(' + "'" + h + "'" + ', 445).Wait(2000)) { $online = $true; $method = ' + "'SMB'" + ' }; $t.Close() } catch {} }',
    // Method 3: TCP 135 (RPC/DCOM — always open on domain PCs)
    'if (-not $online) { try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync(' + "'" + h + "'" + ', 135).Wait(2000)) { $online = $true; $method = ' + "'RPC'" + ' }; $t.Close() } catch {} }',
  ].join('\n')
}

/**
 * Returns a standalone PS command that outputs "HOSTNAME:OK:METHOD" or "HOSTNAME:OFFLINE"
 * for use in bulk checks.
 */
export function buildSingleOnlineCheckCmd(hostname: string): string {
  const h = hostname.replace(/'/g, "''")
  return buildOnlineCheck(h) + '\nif ($online) { Write-Output (' + "'" + h + ":OK:'" + ' + $method) } else { Write-Output ' + "'" + h + ":OFFLINE'" + ' }'
}

/**
 * Returns a PS script that checks multiple hostnames and outputs one line per host.
 * Format: "HOSTNAME:OK:Ping" or "HOSTNAME:OK:SMB" or "HOSTNAME:OFFLINE"
 * Uses .NET for speed — no ForEach-Object -Parallel needed.
 */
export function buildBulkOnlineCheck(hostnames: string[]): string {
  const list = hostnames.map(h => "'" + h.replace(/'/g, "''") + "'").join(',')
  return [
    'foreach ($h in @(' + list + ')) {',
    '  $online = $false; $method = "none"',
    // Ping via .NET (1.5s timeout — faster than Test-Connection)
    '  try { $p = (New-Object System.Net.NetworkInformation.Ping).Send($h, 1500); if ($p.Status -eq "Success") { $online = $true; $method = "Ping" } } catch {}',
    // Port 445 (SMB)
    '  if (-not $online) { try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync($h, 445).Wait(2000)) { $online = $true; $method = "SMB" }; $t.Close() } catch {} }',
    // Port 135 (RPC)
    '  if (-not $online) { try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync($h, 135).Wait(2000)) { $online = $true; $method = "RPC" }; $t.Close() } catch {} }',
    '  if ($online) { Write-Output ($h + ":OK:" + $method) } else { Write-Output ($h + ":OFFLINE") }',
    '}',
  ].join('\n')
}

/** Parse a single line from the bulk check output */
export function parseOnlineCheckLine(line: string): { hostname: string; online: boolean; method: string } {
  const trimmed = line.trim()
  if (trimmed.includes(':OFFLINE')) {
    return { hostname: trimmed.replace(':OFFLINE', ''), online: false, method: 'none' }
  }
  // "HOSTNAME:OK:Ping" or "HOSTNAME:OK:SMB"
  const match = trimmed.match(/^(.+):OK:(.+)$/)
  if (match) {
    return { hostname: match[1], online: true, method: match[2] }
  }
  return { hostname: trimmed, online: false, method: 'none' }
}
