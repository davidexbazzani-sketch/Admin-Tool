import { useState, useCallback, useRef } from 'react'
import {
  Stethoscope, Play, ChevronDown, ChevronRight, Loader,
  CheckCircle, XCircle, AlertTriangle, Info, Zap, Download,
  Shield, Wifi, HardDrive, Activity, Monitor, RefreshCw, Users, Clock,
} from 'lucide-react'
import { api, type PSResult } from '../electronAPI'
import { CATEGORIES } from '../utils/remoteCommands'
import { DIAG_RULES, createFinding, type DiagFinding, type Severity } from '../utils/diagnosisMapping'

// ── Types ────────────────────────────────────────────────────────────────────

interface AreaResult {
  id: string
  label: string
  icon: React.ReactNode
  status: 'pending' | 'running' | 'ok' | 'warn' | 'error' | 'skipped'
  findings: DiagFinding[]
  rawOutput?: string
  checksRun: number
  checksOk: number
}

type Phase = 'idle' | 'running' | 'done'

// ── PS Helpers ───────────────────────────────────────────────────────────────

function buildRemoteScript(h: string, script: string): string {
  const hs = h.replace(/'/g, "''")
  return `try { Invoke-Command -ComputerName '${hs}' -ScriptBlock { ${script} } -EA Stop | ConvertTo-Json -Depth 4 -Compress } catch { Write-Output "ERR:$($_.Exception.Message)" }`
}

async function runPS(script: string, timeout = 30000): Promise<PSResult> {
  return api().runPowerShell(script, timeout)
}

async function runRemote(h: string, script: string, timeout = 30000): Promise<{ ok: boolean; data: string }> {
  try {
    const res = await runPS(buildRemoteScript(h, script), timeout)
    const out = res.stdout?.trim() ?? ''
    if (out.startsWith('ERR:')) return { ok: false, data: out }
    return { ok: true, data: out }
  } catch (e) {
    return { ok: false, data: `ERR:${e}` }
  }
}

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

// ── Diagnose-Bereiche ────────────────────────────────────────────────────────

const AREAS = [
  { id: 'event-logs', label: 'Event-Log Analyse', icon: <Activity size={16} /> },
  { id: 'hardware', label: 'Hardware-Check', icon: <HardDrive size={16} /> },
  { id: 'services', label: 'Dienste-Check', icon: <RefreshCw size={16} /> },
  { id: 'network', label: 'Netzwerk-Check', icon: <Wifi size={16} /> },
  { id: 'security', label: 'Sicherheit', icon: <Shield size={16} /> },
  { id: 'updates', label: 'Updates & Patches', icon: <Download size={16} /> },
  { id: 'software', label: 'Software-Probleme', icon: <Monitor size={16} /> },
  { id: 'performance', label: 'Performance', icon: <Zap size={16} /> },
  { id: 'profile', label: 'Benutzerprofil', icon: <Users size={16} /> },
]

// ══════════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════════

export default function PCDiagnosis() {
  const [hostname, setHostname] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [areas, setAreas] = useState<AreaResult[]>([])
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set())
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set())
  const [skillRunning, setSkillRunning] = useState<string | null>(null)
  const [skillOutput, setSkillOutput] = useState<Record<string, string>>({})
  const [confirmSkill, setConfirmSkill] = useState<DiagFinding | null>(null)
  const cancelRef = useRef(false)

  const updateArea = useCallback((id: string, patch: Partial<AreaResult>) => {
    setAreas(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }, [])

  // ── Run a single diagnosis area ────────────────────────────────────────
  const runArea = useCallback(async (areaId: string, h: string): Promise<AreaResult> => {
    const base: AreaResult = { ...AREAS.find(a => a.id === areaId)!, status: 'running', findings: [], checksRun: 0, checksOk: 0 }

    const addFinding = (ruleId: string, context = '', rawData?: unknown) => {
      const rule = DIAG_RULES.find(r => r.id === ruleId)
      if (rule) base.findings.push(createFinding(rule, context, rawData))
    }

    const addCustom = (severity: Severity, title: string, desc: string, skillId?: string, skillCat?: string, skillInput?: string) => {
      base.findings.push({
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        severity, category: areaId, title, description: desc,
        causes: [], solution: '',
        skillId, skillCategory: skillCat, skillInput,
      })
    }

    try {
      switch (areaId) {

        case 'event-logs': {
          const r = await runRemote(h, [
            `$errs = @()`,
            `$sys = Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2,3;StartTime=(Get-Date).AddDays(-7)} -MaxEvents 100 -EA SilentlyContinue`,
            `$app = Get-WinEvent -FilterHashtable @{LogName='Application';Level=1,2;StartTime=(Get-Date).AddDays(-7)} -MaxEvents 100 -EA SilentlyContinue`,
            `$bsod = $sys | Where-Object { $_.Id -eq 1001 -and $_.Message -match 'BugCheck' }`,
            `$shutdowns = $sys | Where-Object { $_.Id -in @(6008,41) }`,
            `$svcCrash = $sys | Where-Object { $_.Id -in @(7031,7034) }`,
            `$appCrash = $app | Where-Object { $_.Id -eq 1000 }`,
            `$diskErr = $sys | Where-Object { $_.Id -in @(11,51) }`,
            `@{`,
            `  sysErrors = ($sys | Where-Object Level -le 2).Count`,
            `  sysWarnings = ($sys | Where-Object Level -eq 3).Count`,
            `  bsodCount = @($bsod).Count`,
            `  shutdownCount = @($shutdowns).Count`,
            `  svcCrashCount = @($svcCrash).Count`,
            `  appCrashCount = @($appCrash).Count`,
            `  diskErrCount = @($diskErr).Count`,
            `  lastBsod = if($bsod){$bsod[0].TimeCreated.ToString('dd.MM.yyyy HH:mm')}else{''}`,
            `  lastShutdown = if($shutdowns){$shutdowns[0].TimeCreated.ToString('dd.MM.yyyy HH:mm')}else{''}`,
            `}`,
          ].join('\n'))
          base.checksRun = 5
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              base.rawOutput = JSON.stringify(d, null, 2)
              if (Number(d.bsodCount) > 0) addFinding('evt-1001', String(d.lastBsod))
              if (Number(d.shutdownCount) > 0) addFinding('evt-6008', String(d.lastShutdown))
              if (Number(d.svcCrashCount) > 0) addFinding('evt-7034')
              if (Number(d.appCrashCount) > 3) addFinding('evt-1000')
              if (Number(d.diskErrCount) > 0) addFinding('evt-11')
              base.checksOk = 5 - base.findings.length
            }
          }
          break
        }

        case 'hardware': {
          const r = await runRemote(h, [
            `$disk = Get-PhysicalDisk | Select FriendlyName,HealthStatus,Size`,
            `$vol = Get-Volume | Where DriveLetter | Select DriveLetter,Size,SizeRemaining`,
            `$devErr = Get-PnpDevice | Where ConfigManagerErrorCode -ne 0 | Select FriendlyName,ConfigManagerErrorCode`,
            `$os = Get-CimInstance Win32_OperatingSystem`,
            `$cpu = (Get-CimInstance Win32_Processor).LoadPercentage`,
            `$ramTotal = [math]::Round($os.TotalVisibleMemorySize/1MB,1)`,
            `$ramFree = [math]::Round($os.FreePhysicalMemory/1MB,1)`,
            `$ramPct = [math]::Round(($ramTotal-$ramFree)/$ramTotal*100,0)`,
            `@{`,
            `  disks = @($disk)`,
            `  volumes = @($vol | ForEach-Object { @{Letter=$_.DriveLetter;SizeGB=[math]::Round($_.Size/1GB,1);FreeGB=[math]::Round($_.SizeRemaining/1GB,1);FreePct=if($_.Size -gt 0){[math]::Round($_.SizeRemaining/$_.Size*100,1)}else{0}} })`,
            `  deviceErrors = @($devErr)`,
            `  cpuPct = $cpu`,
            `  ramPct = $ramPct`,
            `  ramTotal = $ramTotal`,
            `  ramFree = $ramFree`,
            `}`,
          ].join('\n'))
          base.checksRun = 5
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              base.rawOutput = JSON.stringify(d, null, 2)
              const disks = d.disks as Array<Record<string, unknown>> ?? []
              for (const dk of disks) {
                if (dk.HealthStatus && String(dk.HealthStatus) !== 'Healthy') addFinding('hw-disk-unhealthy', String(dk.FriendlyName), dk)
              }
              const vols = d.volumes as Array<Record<string, unknown>> ?? []
              for (const v of vols) {
                const pct = Number(v.FreePct)
                if (pct < 5) addCustom('critical', `Festplatte ${v.Letter}: kritisch voll (${pct}% frei)`, 'Weniger als 5% freier Speicher!', 'wintemp', 'disk')
                else if (pct < 10) addCustom('warning', `Festplatte ${v.Letter}: fast voll (${pct}% frei)`, 'Weniger als 10% freier Speicher.', 'wintemp', 'disk')
              }
              const devErrs = d.deviceErrors as Array<Record<string, unknown>> ?? []
              if (devErrs.length > 0) addCustom('warning', `${devErrs.length} Gerät(e) mit Treiber-Fehler`, devErrs.map(e => String(e.FriendlyName)).join(', '), 'deverror', 'devmgr')
              if (Number(d.ramPct) > 85) addFinding('hw-ram-high')
              if (Number(d.cpuPct) > 80) addFinding('hw-cpu-high')
              base.checksOk = base.checksRun - base.findings.length
            }
          }
          break
        }

        case 'services': {
          const r = await runRemote(h, [
            `$stopped = Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' } | Select Name,DisplayName,Status`,
            `$important = @('Spooler','BITS','wuauserv','AudioSrv','Themes','LanmanWorkstation','Dnscache','EventLog','Schedule','W32Time')`,
            `$impStopped = $stopped | Where-Object { $_.Name -in $important }`,
            `@{ stoppedAuto = @($stopped); importantStopped = @($impStopped); totalStopped = @($stopped).Count }`,
          ].join('\n'))
          base.checksRun = 2
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              base.rawOutput = JSON.stringify(d, null, 2)
              const impStopped = d.importantStopped as Array<Record<string, unknown>> ?? []
              for (const svc of impStopped) {
                const name = String(svc.Name ?? '')
                const found = DIAG_RULES.find(r2 => r2.check === 'services' && r2.pattern && r2.pattern.test(name))
                if (found) { base.findings.push(createFinding(found, name)) }
                else { base.findings.push(createFinding(DIAG_RULES.find(r2 => r2.id === 'svc-generic-stopped')!, name)) }
              }
              const others = (d.stoppedAuto as Array<Record<string, unknown>> ?? []).filter(s => !impStopped.some(i => i.Name === s.Name))
              if (others.length > 3) addCustom('info', `${others.length} weitere Auto-Start-Dienste gestoppt`, others.map(s => String(s.Name)).join(', '))
              base.checksOk = impStopped.length === 0 ? 2 : 1
            }
          }
          break
        }

        case 'network': {
          const r = await runRemote(h, [
            `$dns = try { Resolve-DnsName 'google.com' -EA Stop; 'OK' } catch { 'FAIL' }`,
            `$gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue | Select -First 1).NextHop`,
            `$gwPing = if($gw) { Test-Connection $gw -Count 1 -Quiet -EA SilentlyContinue } else { $false }`,
            `$sc = try { (Test-ComputerSecureChannel -EA Stop); 'OK' } catch { 'FAIL' }`,
            `$adapters = Get-NetAdapter | Select Name,Status,MediaConnectionState,LinkSpeed`,
            `$wlan = Get-NetAdapter | Where PhysicalMediaType -match '802.11' | Select Name,Status`,
            `@{ dns=$dns; gateway=$gw; gatewayOk=$gwPing; secureChannel=$sc; adapters=@($adapters); wlan=@($wlan) }`,
          ].join('\n'))
          base.checksRun = 4
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              base.rawOutput = JSON.stringify(d, null, 2)
              if (d.dns === 'FAIL') addFinding('net-dns-fail')
              else base.checksOk++
              if (!d.gatewayOk) addFinding('net-gateway-fail')
              else base.checksOk++
              if (d.secureChannel === 'FAIL') addFinding('net-sc-broken')
              else base.checksOk++
              const adapters = d.adapters as Array<Record<string, unknown>> ?? []
              const disconnected = adapters.filter(a => String(a.Status) === 'Disconnected')
              if (disconnected.length > 0) addCustom('info', `${disconnected.length} Netzwerkadapter getrennt`, disconnected.map(a => String(a.Name)).join(', '), 'getadapter', 'net')
              base.checksOk++
            }
          }
          break
        }

        case 'security': {
          const r = await runRemote(h, [
            `$def = Get-MpComputerStatus -EA SilentlyContinue`,
            `$threats = @(Get-MpThreatDetection -EA SilentlyContinue).Count`,
            `$bl = Get-BitLockerVolume -MountPoint 'C:' -EA SilentlyContinue`,
            `$sigAge = if($def){ ((Get-Date) - $def.AntivirusSignatureLastUpdated).Days } else { -1 }`,
            `@{`,
            `  rtEnabled = $def.RealTimeProtectionEnabled`,
            `  sigAge = $sigAge`,
            `  threats = $threats`,
            `  blStatus = if($bl){$bl.ProtectionStatus.ToString()}else{'NotFound'}`,
            `  lastScan = if($def.LastFullScanEndTime -and $def.LastFullScanEndTime.Year -gt 2000){$def.LastFullScanEndTime.ToString('dd.MM.yyyy')}else{'Nie'}`,
            `}`,
          ].join('\n'))
          base.checksRun = 4
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              base.rawOutput = JSON.stringify(d, null, 2)
              if (d.rtEnabled === false) addFinding('sec-defender-disabled')
              else base.checksOk++
              if (Number(d.sigAge) > 7) addFinding('sec-defender-outdated')
              else base.checksOk++
              if (Number(d.threats) > 0) addFinding('sec-threat-found')
              else base.checksOk++
              if (d.blStatus !== 'On' && d.blStatus !== 'NotFound') addFinding('sec-bitlocker-off')
              else base.checksOk++
            }
          }
          break
        }

        case 'updates': {
          const r = await runRemote(h, [
            `$hf = Get-HotFix | Sort InstalledOn -Descending | Select -First 1`,
            `$daysSince = if($hf.InstalledOn){ ((Get-Date) - $hf.InstalledOn).Days } else { 999 }`,
            `$lastGPO = try { gpresult /r 2>&1 | Select-String 'Letzte.*angewendet|Last time.*applied' | Select -First 1 } catch { '' }`,
            `@{ lastUpdate=$hf.InstalledOn.ToString('dd.MM.yyyy'); daysSince=$daysSince; lastHotFixId=$hf.HotFixID; lastGPO=[string]$lastGPO }`,
          ].join('\n'), 45000)
          base.checksRun = 2
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              base.rawOutput = JSON.stringify(d, null, 2)
              if (Number(d.daysSince) > 30) addFinding('upd-outdated30')
              else base.checksOk++
              base.checksOk++
            }
          }
          break
        }

        case 'software': {
          const r = await runRemote(h, [
            `$teamsCacheSize = 0`,
            `$teamsPath = "$env:LOCALAPPDATA\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache"`,
            `if (Test-Path $teamsPath) { $teamsCacheSize = [math]::Round((Get-ChildItem $teamsPath -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,0) }`,
            `$ostSize = 0`,
            `$ostFiles = Get-ChildItem "$env:LOCALAPPDATA\\Microsoft\\Outlook\\*.ost" -EA SilentlyContinue`,
            `if ($ostFiles) { $ostSize = [math]::Round(($ostFiles | Measure-Object Length -Sum).Sum/1GB,2) }`,
            `$zscaler = Get-Service ZSATunnel -EA SilentlyContinue`,
            `@{ teamsCacheMB=$teamsCacheSize; ostSizeGB=$ostSize; zscalerStatus=if($zscaler){$zscaler.Status.ToString()}else{'NotInstalled'} }`,
          ].join('\n'))
          base.checksRun = 3
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              base.rawOutput = JSON.stringify(d, null, 2)
              if (Number(d.teamsCacheMB) > 500) addFinding('sw-teams-cache')
              else base.checksOk++
              if (Number(d.ostSizeGB) > 5) addFinding('sw-outlook-ost')
              else base.checksOk++
              if (d.zscalerStatus === 'Stopped') addFinding('sw-zscaler-off')
              else base.checksOk++
            }
          }
          break
        }

        case 'performance': {
          const r = await runRemote(h, [
            `$os = Get-CimInstance Win32_OperatingSystem`,
            `$uptime = ((Get-Date) - $os.LastBootUpTime).Days`,
            `$autostart = @(Get-CimInstance Win32_StartupCommand -EA SilentlyContinue).Count`,
            `$tempSize = [math]::Round((Get-ChildItem "$env:TEMP" -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,0)`,
            `$topCpu = Get-Process | Sort CPU -Descending | Select -First 5 Name,@{N='CPU_s';E={[math]::Round($_.CPU,1)}},@{N='RAM_MB';E={[math]::Round($_.WS/1MB,0)}}`,
            `$topRam = Get-Process | Sort WS -Descending | Select -First 5 Name,@{N='RAM_MB';E={[math]::Round($_.WS/1MB,0)}}`,
            `@{ uptimeDays=$uptime; autostartCount=$autostart; tempSizeMB=$tempSize; topCpu=@($topCpu); topRam=@($topRam); lastBoot=$os.LastBootUpTime.ToString('dd.MM.yyyy HH:mm') }`,
          ].join('\n'))
          base.checksRun = 4
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              base.rawOutput = JSON.stringify(d, null, 2)
              const uptime = Number(d.uptimeDays)
              if (uptime > 30) addFinding('perf-uptime30')
              else if (uptime > 14) addFinding('perf-uptime14')
              else base.checksOk++
              const autostart = Number(d.autostartCount)
              if (autostart > 15) { base.findings.push(createFinding(DIAG_RULES.find(r2 => r2.id === 'perf-autostart')!, String(autostart))) }
              else base.checksOk++
              if (Number(d.tempSizeMB) > 1000) addFinding('perf-temp-large')
              else base.checksOk++
              base.checksOk++
            }
          }
          break
        }

        case 'profile': {
          const r = await runRemote(h, [
            `$bak = Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' -EA SilentlyContinue | Where { $_.PSChildName -match '\\.bak$' }`,
            `$profileSize = 0`,
            `try { $profileSize = [math]::Round((Get-ChildItem $env:USERPROFILE -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,0) } catch {}`,
            `@{ hasTempProfile=@($bak).Count -gt 0; profileSizeMB=$profileSize }`,
          ].join('\n'))
          base.checksRun = 2
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              base.rawOutput = JSON.stringify(d, null, 2)
              if (d.hasTempProfile) addFinding('prof-temp')
              else base.checksOk++
              const sizeMB = Number(d.profileSizeMB)
              if (sizeMB > 5000) { base.findings.push(createFinding(DIAG_RULES.find(r2 => r2.id === 'prof-large')!, `${Math.round(sizeMB / 1024)} GB`)) }
              else base.checksOk++
            }
          }
          break
        }
      }
    } catch {
      base.status = 'skipped'
      return base
    }

    base.status = base.findings.some(f => f.severity === 'critical') ? 'error'
      : base.findings.some(f => f.severity === 'warning') ? 'warn' : 'ok'
    return base
  }, [])

  // ── Start Diagnosis ────────────────────────────────────────────────────
  const startDiagnosis = useCallback(async () => {
    const h = hostname.trim()
    if (!h) return
    cancelRef.current = false
    setPhase('running')
    setExpandedAreas(new Set())
    setExpandedFindings(new Set())
    setSkillOutput({})

    const initial: AreaResult[] = AREAS.map(a => ({ ...a, status: 'pending' as const, findings: [], checksRun: 0, checksOk: 0 }))
    setAreas(initial)

    // Run in batches of 3 parallel
    const BATCH = 3
    const results = [...initial]
    for (let i = 0; i < AREAS.length; i += BATCH) {
      if (cancelRef.current) break
      const batch = AREAS.slice(i, i + BATCH)
      // Set running status
      for (const a of batch) updateArea(a.id, { status: 'running' })
      const batchResults = await Promise.all(batch.map(a => runArea(a.id, h)))
      for (const r of batchResults) {
        const idx = results.findIndex(x => x.id === r.id)
        if (idx >= 0) results[idx] = r
        updateArea(r.id, r)
      }
    }

    setAreas(results)
    setPhase('done')
    // Auto-expand areas with findings
    const withFindings = new Set(results.filter(a => a.findings.length > 0).map(a => a.id))
    setExpandedAreas(withFindings)
  }, [hostname, runArea, updateArea])

  /** Look up skill label (func) from CATEGORIES */
  const getSkillLabel = useCallback((skillId?: string, skillCategory?: string): string => {
    if (!skillId) return ''
    // Search in expected category first
    if (skillCategory) {
      for (const cat of CATEGORIES) {
        if (cat.id === skillCategory) {
          const cmd = cat.commands.find(c => c.id === skillId)
          if (cmd) return cmd.func
        }
      }
    }
    // Fallback: search all categories
    for (const cat of CATEGORIES) {
      const cmd = cat.commands.find(c => c.id === skillId)
      if (cmd) return cmd.func
    }
    return skillId
  }, [])

  // ── Execute a Remote Doc skill directly ────────────────────────────────
  const executeSkill = useCallback(async (finding: DiagFinding) => {
    if (!finding.skillId || !finding.skillCategory) return
    const h = hostname.trim()
    if (!h) return

    // Find the command in CATEGORIES
    let foundCmd = null
    for (const cat of CATEGORIES) {
      if (cat.id === finding.skillCategory) {
        foundCmd = cat.commands.find(c => c.id === finding.skillId)
        break
      }
    }
    // Search all categories if not found in expected one
    if (!foundCmd) {
      for (const cat of CATEGORIES) {
        const cmd = cat.commands.find(c => c.id === finding.skillId)
        if (cmd) { foundCmd = cmd; break }
      }
    }
    if (!foundCmd) { setSkillOutput(prev => ({ ...prev, [finding.id]: 'ERR: Skill nicht gefunden' })); return }

    setSkillRunning(finding.id)
    try {
      const psCmd = foundCmd.buildCmd(h, finding.skillInput || undefined)
      const timeout = foundCmd.longRunning ? 60000 : 30000
      const res = await api().runPowerShell(psCmd, timeout)
      setSkillOutput(prev => ({ ...prev, [finding.id]: res.stdout?.trim() || res.stderr || 'OK' }))
    } catch (e) {
      setSkillOutput(prev => ({ ...prev, [finding.id]: `ERR: ${e}` }))
    }
    setSkillRunning(null)
  }, [hostname])

  // ── Computed values ────────────────────────────────────────────────────
  const allFindings = areas.flatMap(a => a.findings)
  const criticals = allFindings.filter(f => f.severity === 'critical')
  const warnings = allFindings.filter(f => f.severity === 'warning')
  const infos = allFindings.filter(f => f.severity === 'info')
  const totalChecks = areas.reduce((s, a) => s + a.checksRun, 0)
  const okChecks = areas.reduce((s, a) => s + a.checksOk, 0)
  const doneAreas = areas.filter(a => a.status !== 'pending' && a.status !== 'running').length
  const sortedFindings = [...criticals, ...warnings, ...infos]

  const overallColor = criticals.length > 0 ? 'text-red-400' : warnings.length > 0 ? 'text-amber-400' : 'text-emerald-400'
  const overallBg = criticals.length > 0 ? 'bg-red-500/10 border-red-500/30' : warnings.length > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'

  const sevIcon = (s: Severity) => s === 'critical' ? <XCircle size={16} className="text-red-400 shrink-0" /> : s === 'warning' ? <AlertTriangle size={16} className="text-amber-400 shrink-0" /> : <Info size={16} className="text-blue-400 shrink-0" />
  const areaStatusIcon = (s: AreaResult['status']) =>
    s === 'ok' ? <CheckCircle size={16} className="text-emerald-400" /> :
    s === 'warn' ? <AlertTriangle size={16} className="text-amber-400" /> :
    s === 'error' ? <XCircle size={16} className="text-red-400" /> :
    s === 'running' ? <Loader size={16} className="animate-spin text-blue-400" /> :
    s === 'skipped' ? <XCircle size={16} className="text-muted-foreground/50" /> :
    <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />

  // ══════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Stethoscope size={24} /> PC-Diagnose
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automatische Fehleranalyse — 9 Bereiche, 30+ Checks
        </p>
      </div>

      {/* ── Input + Start ──────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div className="bg-card rounded-lg border border-border p-5 space-y-4 max-w-xl">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hostname</label>
            <input
              type="text" placeholder="z.B. DEHAM12345678" value={hostname}
              onChange={e => setHostname(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && hostname.trim() && startDiagnosis()}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <button onClick={startDiagnosis} disabled={!hostname.trim()}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
              hostname.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25' : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}>
            <Play size={16} /> Vollständige Diagnose starten
          </button>
        </div>
      )}

      {/* ── Running progress ───────────────────────────────────────── */}
      {phase === 'running' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Loader size={20} className="animate-spin text-primary" />
            <span className="text-sm font-medium text-foreground">Diagnose läuft... ({doneAreas}/{AREAS.length})</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-muted/30 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.round((doneAreas / AREAS.length) * 100)}%` }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {areas.map(a => (
              <div key={a.id} className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
                a.status === 'running' ? 'border-blue-500/30 bg-blue-500/5' : a.status === 'pending' ? 'border-border bg-card' : 'border-border bg-card'
              }`}>
                {areaStatusIcon(a.status)}
                <span className="text-xs text-foreground">{a.label}</span>
                {a.findings.length > 0 && <span className="ml-auto text-[10px] font-bold text-amber-400">{a.findings.length}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      {phase === 'done' && (
        <>
          {/* Summary */}
          <div className={`rounded-lg border p-5 ${overallBg}`}>
            <div className="flex items-center gap-4">
              <div className={`text-4xl font-bold ${overallColor}`}>
                {criticals.length > 0 ? <XCircle size={48} /> : warnings.length > 0 ? <AlertTriangle size={48} /> : <CheckCircle size={48} />}
              </div>
              <div>
                <p className={`text-lg font-bold ${overallColor}`}>
                  {criticals.length === 0 && warnings.length === 0 ? 'Alles OK' : `${criticals.length} Fehler, ${warnings.length} Warnungen`}
                  {infos.length > 0 && `, ${infos.length} Hinweise`}
                </p>
                <p className="text-sm text-muted-foreground">{okChecks} von {totalChecks} Checks bestanden — {hostname.trim()}</p>
              </div>
              <div className="ml-auto">
                <button onClick={() => { setPhase('idle'); setAreas([]) }}
                  className="px-4 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                  Neue Diagnose
                </button>
              </div>
            </div>
          </div>

          {/* Findings list */}
          {sortedFindings.length > 0 && (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/20">
                <p className="text-sm font-semibold text-foreground">Gefundene Probleme ({sortedFindings.length})</p>
              </div>
              <div className="divide-y divide-border/50">
                {sortedFindings.map(f => {
                  const expanded = expandedFindings.has(f.id)
                  const output = skillOutput[f.id]
                  return (
                    <div key={f.id} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {sevIcon(f.severity)}
                        <span className="text-sm font-medium text-foreground flex-1">{f.title}</span>
                        <button onClick={() => setExpandedFindings(prev => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n })}
                          className="p-1 rounded hover:bg-accent text-muted-foreground" title="Details">
                          <Info size={14} />
                        </button>
                        {f.skillId && (
                          <button
                            onClick={() => setConfirmSkill(f)} disabled={skillRunning === f.id}
                            className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-md bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-50">
                            {skillRunning === f.id ? <Loader size={10} className="animate-spin" /> : <Zap size={10} />}
                            Fehlerbehebung: {getSkillLabel(f.skillId, f.skillCategory)}
                          </button>
                        )}
                      </div>
                      {expanded && (
                        <div className="mt-2 ml-6 space-y-1.5 text-xs">
                          <p className="text-muted-foreground">{f.description}</p>
                          {f.causes.length > 0 && (
                            <div>
                              <p className="font-semibold text-foreground">Mögliche Ursachen:</p>
                              <ul className="list-disc ml-4 text-muted-foreground">{f.causes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                            </div>
                          )}
                          {f.solution && <p className="text-muted-foreground"><strong>Lösung:</strong> {f.solution}</p>}
                        </div>
                      )}
                      {output && (
                        <pre className="mt-2 ml-6 p-2 rounded bg-muted/20 text-[10px] text-muted-foreground max-h-32 overflow-auto font-mono whitespace-pre-wrap">{output}</pre>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Confirm skill execution dialog */}
          {confirmSkill && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-card border border-border rounded-xl p-5 w-[400px] shadow-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Fehlerbehebung ausführen?</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>{getSkillLabel(confirmSkill.skillId, confirmSkill.skillCategory)}</strong> auf <strong className="font-mono">{hostname.trim()}</strong> ausführen?
                </p>
                {confirmSkill.skillInput && (
                  <p className="text-[10px] text-muted-foreground">Parameter: <code className="bg-muted/30 px-1 rounded">{confirmSkill.skillInput}</code></p>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setConfirmSkill(null)}
                    className="flex-1 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">Abbrechen</button>
                  <button onClick={() => { const f = confirmSkill; setConfirmSkill(null); executeSkill(f) }}
                    className="flex-1 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Ausführen</button>
                </div>
              </div>
            </div>
          )}

          {/* Area details (collapsible) */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Detail-Bereiche</p>
            {areas.map(a => (
              <div key={a.id} className="bg-card rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedAreas(prev => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-accent/10 transition-colors">
                  {expandedAreas.has(a.id) ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                  {areaStatusIcon(a.status)}
                  <span className="text-xs font-medium text-foreground flex-1 text-left">{a.label}</span>
                  <span className="text-[10px] text-muted-foreground">{a.checksOk}/{a.checksRun} OK</span>
                  {a.findings.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      a.findings.some(f => f.severity === 'critical') ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>{a.findings.length}</span>
                  )}
                </button>
                {expandedAreas.has(a.id) && a.rawOutput && (
                  <div className="px-4 pb-3">
                    <pre className="p-2 rounded bg-muted/20 text-[10px] text-muted-foreground max-h-48 overflow-auto font-mono whitespace-pre-wrap">
                      {a.rawOutput}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
