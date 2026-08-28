// ── SolidWorks-Diagnose: Live-Status der Ziel-PCs (online + SolidWorks-Prozess) ──
// Reine Anzeige-Hilfe für die PC-Auswahl. KEIN WinRM (spart 60-s-Kaltstart, kein
// Doppelhop, kein ASR-Trip). Eine kombinierte Bulk-Probe je Host im Runspace-Pool
// (≤10 parallel lt. Leistungsregeln):
//   1) Erreichbarkeit: ICMP, sonst TCP 445/135/5985 — ICMP ist im Firmennetz oft
//      per Firewall blockiert, deshalb der TCP-Rückfall (Muster: connectivityCheck.ts).
//   2) SolidWorks: DCOM-CIM Win32_Process mit serverseitigem Namensfilter (0/1 Zeile).
// Muster übernommen aus src/services/userPresenceScan.ts (Runspace-Pool).

import { api } from '../electronAPI'

export type SwState = 'running' | 'idle' | 'unknown'
export interface HostStatus { online: boolean; sw: SwState; checkedAt: string }

const lc = (s: string) => s.trim().toLowerCase()

/** Ein Block Hosts: Erreichbarkeit (ICMP→TCP) + SolidWorks (DCOM) in einem Pool. */
async function probeChunk(hosts: string[]): Promise<Map<string, HostStatus>> {
  const out = new Map<string, HostStatus>()
  const clean = [...new Set(hosts.map(h => h.trim()).filter(Boolean))]
  if (!clean.length) return out
  const checkedAt = new Date().toISOString()
  const list = clean.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
  const waitSec = Math.min(120, 12 + Math.ceil(clean.length / 10) * 8)
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$hosts=@(${list})`,
    `$sb={`,
    `  param($h)`,
    `  $online=$false`,
    // 1) Erreichbarkeit: ICMP zuerst (schnell), dann TCP-Ports (ICMP oft geblockt)
    `  try { if ((New-Object System.Net.NetworkInformation.Ping).Send($h,1200).Status -eq 'Success') { $online=$true } } catch {}`,
    `  if (-not $online) { foreach ($port in 445,135,5985) { try { $t=New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync($h,$port).Wait(1500)) { $online=$true }; $t.Close() } catch {}; if ($online) { break } } }`,
    `  if (-not $online) { return ($h + '|OFFLINE|UNKNOWN') }`,
    // 2) SolidWorks-Prozess über DCOM-CIM (kein WinRM, kein Doppelhop)
    `  $sw='UNKNOWN'`,
    `  try {`,
    `    $opt=New-CimSessionOption -Protocol Dcom`,
    `    $cs=New-CimSession -ComputerName $h -SessionOption $opt -OperationTimeoutSec 6 -EA Stop`,
    `    try { $p=Get-CimInstance -CimSession $cs -ClassName Win32_Process -Filter "Name='SLDWORKS.exe'" -OperationTimeoutSec 6 -EA Stop; if ($p) { $sw='RUNNING' } else { $sw='IDLE' } }`,
    `    finally { Remove-CimSession $cs -EA SilentlyContinue }`,
    `  } catch { $sw='UNKNOWN' }`,
    `  return ($h + '|ONLINE|' + $sw)`,
    `}`,
    `$max=[Math]::Min(10,$hosts.Count); if ($max -lt 1) { $max=1 }`,
    `$pool=[runspacefactory]::CreateRunspacePool(1,$max); $pool.Open()`,
    `$hs=@()`,
    `$sbText=[string]$sb`,
    `foreach ($h in $hosts) { $ps=[powershell]::Create(); $ps.RunspacePool=$pool; [void]$ps.AddScript($sbText); [void]$ps.AddArgument($h); $hs += [pscustomobject]@{ P=$ps; H=$ps.BeginInvoke() } }`,
    `$sw=[System.Diagnostics.Stopwatch]::StartNew()`,
    `foreach ($x in $hs) { $rem=(${waitSec}*1000)-$sw.ElapsedMilliseconds; if ($rem -lt 0) { $rem=0 }; if ($x.H.AsyncWaitHandle.WaitOne([int]$rem)) { try { foreach ($o in $x.P.EndInvoke($x.H)) { if ($o) { Write-Output ('REC' + [char]9 + $o) } } } catch {} } }`,
    `Write-Output 'DONE'`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, (waitSec + 20) * 1000)
    for (const line of (res.stdout ?? '').split(/\r?\n/)) {
      if (!line.startsWith('REC\t')) continue
      const parts = line.slice(4).trim().split('|')
      const h = parts[0]; if (!h) continue
      const online = parts[1] === 'ONLINE'
      const sw: SwState = parts[2] === 'RUNNING' ? 'running' : parts[2] === 'IDLE' ? 'idle' : 'unknown'
      out.set(lc(h), { online, sw, checkedAt })
    }
  } catch { /* Fehler → dieser Block bleibt unbekannt (grau) */ }
  return out
}

/** Alle Hosts prüfen. In Blöcken zu 16, damit die Punkte fortlaufend erscheinen
 *  und die PS-Nutzlast begrenzt bleibt. `onPartial` liefert den Zwischenstand. */
export async function probeHosts(
  hosts: string[],
  onPartial?: (map: Map<string, HostStatus>) => void,
): Promise<Map<string, HostStatus>> {
  const clean = [...new Set(hosts.map(h => h.trim()).filter(Boolean))]
  const out = new Map<string, HostStatus>()
  const CHUNK = 16
  for (let i = 0; i < clean.length; i += CHUNK) {
    const part = await probeChunk(clean.slice(i, i + CHUNK))
    for (const [k, v] of part) out.set(k, v)
    onPartial?.(new Map(out))
  }
  return out
}
