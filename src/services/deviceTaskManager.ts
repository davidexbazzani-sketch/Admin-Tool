// ── Remote-Task-Manager (Prozesse + Leistung) ─────────────────────────────────
// Liest über WinRM (Invoke-Command) live die Prozesse eines Ziel-PCs (CPU%/RAM),
// beendet/neustartet Prozesse und liefert Leistungsdaten (CPU/RAM/GPU).
// Muster: ProcessPanel.tsx (Kill/ERR:-Konvention), ServerPerformanceCheck (Perf-CIM).

import { api } from '../electronAPI'
import type { PSResult } from '../electronAPI'

function psq(s: string): string { return (s || '').replace(/'/g, "''") }

async function runPS(script: string, timeoutMs = 30000): Promise<PSResult> {
  return api().runPowerShell(script, timeoutMs).catch(() => ({ stdout: '', stderr: '', exitCode: -1, timedOut: true } as PSResult))
}

// ── Prozesse ──────────────────────────────────────────────────────────────────

export interface ProcInfo { name: string; pid: number; cpuPct: number; memMB: number }

/** Prozessliste mit Momentan-CPU% (auf logische Kerne normiert) + privatem Arbeitsspeicher. */
export async function listProcesses(hostname: string): Promise<{ ok: boolean; items: ProcInfo[]; error?: string }> {
  const h = psq(hostname)
  const inner = [
    `$lc = (Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue).NumberOfLogicalProcessors`,
    `if (-not $lc -or $lc -lt 1) { $lc = 1 }`,
    `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -EA SilentlyContinue |`,
    `  Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } |`,
    `  Select-Object @{N='name';E={$_.Name}}, @{N='pid';E={[int]$_.IDProcess}}, @{N='cpu';E={[math]::Round(($_.PercentProcessorTime / $lc),1)}}, @{N='mem';E={[math]::Round($_.WorkingSetPrivate/1MB,1)}} |`,
    `  Sort-Object cpu -Descending | ConvertTo-Json -Compress`,
  ].join('\n')
  const script = `try { $o = Invoke-Command -ComputerName '${h}' -EA Stop -ScriptBlock { ${inner} }; Write-Output $o } catch { Write-Output ('ERR:' + $_.Exception.Message) }`
  const res = await runPS(script, 30000)
  const out = (res.stdout ?? '').trim()
  if (res.timedOut) return { ok: false, items: [], error: 'Zeitüberschreitung' }
  if (!out || out.startsWith('ERR:')) return { ok: false, items: [], error: out.replace(/^ERR:/, '') || res.stderr || 'Keine Antwort' }
  try {
    const parsed = JSON.parse(out)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const items: ProcInfo[] = arr.filter((p: { name?: string }) => p && p.name).map((p: { name: string; pid: number; cpu: number; mem: number }) => ({
      // PerfProc-Name kann Duplikat-Suffixe (#1, #2) haben → für Anzeige + CRITICAL_PROCS-Abgleich normalisieren.
      name: String(p.name).replace(/#\d+$/, ''), pid: Number(p.pid), cpuPct: Number(p.cpu) || 0, memMB: Number(p.mem) || 0,
    }))
    return { ok: true, items }
  } catch { return { ok: false, items: [], error: 'Antwort nicht lesbar' } }
}

export interface ProcActionResult { ok: boolean; message: string }

/** Prozess beenden (Stop-Process -Force). */
export async function killProcess(hostname: string, pid: number): Promise<ProcActionResult> {
  const h = psq(hostname)
  const id = Number(pid)
  if (!Number.isFinite(id)) return { ok: false, message: 'Ungültige PID' }
  const script = [
    `try {`,
    `  $r = Invoke-Command -ComputerName '${h}' -EA Stop -ScriptBlock {`,
    `    try { Stop-Process -Id ${id} -Force -EA Stop; @{ success=$true } | ConvertTo-Json -Compress }`,
    `    catch { @{ success=$false; message=$_.Exception.Message } | ConvertTo-Json -Compress }`,
    `  }`,
    `  Write-Output $r`,
    `} catch { @{ success=$false; message=$_.Exception.Message } | ConvertTo-Json -Compress }`,
  ].join('\n')
  const res = await runPS(script, 30000)
  try {
    const p = JSON.parse((res.stdout ?? '').trim()) as { success?: boolean; message?: string }
    return { ok: p.success === true, message: p.message || (p.success ? 'Beendet' : 'Fehler') }
  } catch { return { ok: false, message: res.stderr?.trim() || 'Keine Antwort' } }
}

/**
 * Prozess neu starten (best effort): Programmpfad ermitteln → beenden → im
 * BENUTZERKONTEXT des angemeldeten Users neu starten (Einmal-Scheduled-Task).
 * Nur für Prozesse mit ermittelbarem Pfad (keine reinen Systemprozesse).
 */
export async function restartProcess(hostname: string, pid: number): Promise<ProcActionResult> {
  const h = psq(hostname)
  const id = Number(pid)
  if (!Number.isFinite(id)) return { ok: false, message: 'Ungültige PID' }
  const sb = [
    `$result='ERR:unvollstaendig'`,
    `try {`,
    // Pfad ermitteln
    `  $p = Get-Process -Id ${id} -EA Stop`,
    `  $path = $p.Path`,
    `  if (-not $path) { $result='ERR:Kein Programmpfad ermittelbar (Systemprozess?)'; } else {`,
    // angemeldeten User ermitteln
    `    $user = $null`,
    `    try { $cs = Get-CimInstance Win32_ComputerSystem -EA Stop; if ($cs.UserName) { $user = $cs.UserName } } catch {}`,
    `    if (-not $user) { try { $ep = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop) | Select-Object -First 1; if ($ep) { $ow = Invoke-CimMethod -InputObject $ep -MethodName GetOwner -EA Stop; if ($ow.User) { $user = "$($ow.Domain)\\$($ow.User)" } } } catch {} }`,
    `    if (-not $user) { $result='ERR:Kein Benutzer angemeldet — Neustart nur im Benutzerkontext moeglich'; } else {`,
    `      Stop-Process -Id ${id} -Force -EA Stop`,
    `      Start-Sleep -Milliseconds 800`,
    `      $taskName = 'ITAdminRestart_' + (Get-Date -Format 'yyyyMMddHHmmssfff')`,
    `      try {`,
    `        $action = New-ScheduledTaskAction -Execute $path`,
    // Nur ÜBER den Trigger starten (kein zusätzliches Start-ScheduledTask → sonst
    // würde die App doppelt starten). Warten, bis der Trigger bei +2s gefeuert hat.
    `        $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)`,
    `        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -User $user -Force | Out-Null`,
    `        Start-Sleep -Seconds 4`,
    `        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -EA SilentlyContinue`,
    `        $result = 'OK:neu gestartet als ' + $user`,
    `      } catch { $result = 'ERR:Neustart-Task fehlgeschlagen: ' + $_.Exception.Message }`,
    `    }`,
    `  }`,
    `} catch { $result = 'ERR:' + $_.Exception.Message }`,
    `Write-Output ('RES:' + $result)`,
  ].join('\n')
  const script = `try { Invoke-Command -ComputerName '${h}' -ScriptBlock { ${sb} } -EA Stop } catch { Write-Output ('RES:ERR:' + $_.Exception.Message) }`
  const res = await runPS(script, 45000)
  const line = (res.stdout ?? '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('RES:'))
  if (!line) return { ok: false, message: res.stderr?.trim() || 'Keine Antwort' }
  const body = line.slice(4)
  if (body.startsWith('ERR:')) return { ok: false, message: body.slice(4) }
  return { ok: true, message: body.replace(/^OK:\s*/, '') || 'Neu gestartet' }
}

// ── Leistung (CPU / RAM / GPU) ────────────────────────────────────────────────

export interface CpuPerf { model: string; cores: number; logical: number; maxClockMhz: number; loadPct: number }
export interface RamModule { slot: string; sizeGB: number; speed: number; manufacturer: string; partNumber: string }
export interface RamPerf { totalGB: number; usedGB: number; freeGB: number; pct: number; slotsUsed: number; slotsTotal: number; modules: RamModule[] }
export interface GpuPerf { name: string; vram: string; driver: string; videoMode: string }
export interface PerfSnapshot { ok: boolean; cpu?: CpuPerf; ram?: RamPerf; gpus: GpuPerf[]; gpuUtilPct: number | null; error?: string }

export async function getPerformance(hostname: string): Promise<PerfSnapshot> {
  const h = psq(hostname)
  const inner = [
    `$r = @{}`,
    `try { $c = Get-CimInstance Win32_Processor -EA Stop | Select-Object -First 1; $r.cpu = @{ model=[string]$c.Name; cores=[int]$c.NumberOfCores; logical=[int]$c.NumberOfLogicalProcessors; maxClockMhz=[int]$c.MaxClockSpeed; loadPct=[int]$c.LoadPercentage } } catch {}`,
    `try {`,
    `  $cs = Get-CimInstance Win32_ComputerSystem -EA Stop; $os = Get-CimInstance Win32_OperatingSystem -EA Stop`,
    `  $mem = @(Get-CimInstance Win32_PhysicalMemory -EA SilentlyContinue)`,
    `  $marr = Get-CimInstance Win32_PhysicalMemoryArray -EA SilentlyContinue`,
    `  $tot = [math]::Round($cs.TotalPhysicalMemory/1GB,1); $free = [math]::Round($os.FreePhysicalMemory/1MB,1); $used = [math]::Round($tot-$free,1)`,
    `  $pct = if ($tot -gt 0) { [math]::Round(($used/$tot)*100,0) } else { 0 }`,
    `  $mods = @($mem | ForEach-Object { @{ slot=[string]$_.Tag; sizeGB=[math]::Round($_.Capacity/1GB,0); speed=[int]$_.Speed; manufacturer=([string]$_.Manufacturer).Trim(); partNumber=([string]$_.PartNumber).Trim() } })`,
    `  $slotsTotal = if ($marr) { ($marr | Measure-Object -Property MemoryDevices -Sum).Sum } else { $mods.Count }`,
    `  $r.ram = @{ totalGB=$tot; usedGB=$used; freeGB=$free; pct=$pct; slotsUsed=$mods.Count; slotsTotal=[int]$slotsTotal; modules=$mods }`,
    `} catch {}`,
    `try { $r.gpus = @(Get-CimInstance Win32_VideoController -EA SilentlyContinue | ForEach-Object { @{ name=[string]$_.Name; vram=$(if($_.AdapterRAM){[math]::Round($_.AdapterRAM/1GB,1).ToString()+' GB'}else{'N/A'}); driver=[string]$_.DriverVersion; videoMode=[string]$_.VideoModeDescription } }) } catch {}`,
    // GPU-Auslastung: MAX über die Engine-Instanzen (nicht Summe → sonst >100%), auf 0..100 begrenzt.
    `try { $s = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -EA Stop).CounterSamples; $mx = ($s | Measure-Object -Property CookedValue -Maximum).Maximum; $r.gpuUtil = [math]::Min(100, [math]::Round($mx,0)) } catch { $r.gpuUtil = $null }`,
    `$r | ConvertTo-Json -Depth 5 -Compress`,
  ].join('\n')
  const script = `try { $o = Invoke-Command -ComputerName '${h}' -EA Stop -ScriptBlock { ${inner} }; Write-Output $o } catch { Write-Output ('ERR:' + $_.Exception.Message) }`
  const res = await runPS(script, 30000)
  const out = (res.stdout ?? '').trim()
  if (res.timedOut) return { ok: false, gpus: [], gpuUtilPct: null, error: 'Zeitüberschreitung' }
  if (!out || out.startsWith('ERR:')) return { ok: false, gpus: [], gpuUtilPct: null, error: out.replace(/^ERR:/, '') || 'Keine Antwort' }
  try {
    const p = JSON.parse(out) as {
      cpu?: CpuPerf
      ram?: (Omit<RamPerf, 'modules'> & { modules?: RamModule | RamModule[] })
      gpus?: GpuPerf | GpuPerf[]
      gpuUtil?: number | null
    }
    const ram = p.ram ? { ...p.ram, modules: Array.isArray(p.ram.modules) ? p.ram.modules : (p.ram.modules ? [p.ram.modules] : []) } as RamPerf : undefined
    const gpus = p.gpus ? (Array.isArray(p.gpus) ? p.gpus : [p.gpus]) : []
    return { ok: true, cpu: p.cpu, ram, gpus, gpuUtilPct: (typeof p.gpuUtil === 'number' ? p.gpuUtil : null) }
  } catch { return { ok: false, gpus: [], gpuUtilPct: null, error: 'Antwort nicht lesbar' } }
}

/** Prozesse, die man nicht versehentlich beenden sollte (Warnhinweis). */
export const CRITICAL_PROCS = new Set([
  'System', 'Idle', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'smss',
  'svchost', 'explorer', 'dwm', 'fontdrvhost', 'sihost', 'ctfmon', 'RuntimeBroker',
  'LogonUI', 'WmiPrvSE',
])
