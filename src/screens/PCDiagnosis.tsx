import { useState, useCallback, useRef } from 'react'
import {
  Stethoscope, Play, ChevronDown, ChevronRight, Loader,
  CheckCircle, XCircle, AlertTriangle, Info, Zap, Download,
  Shield, Wifi, HardDrive, Activity, Monitor, RefreshCw, Users, Clock, FileText,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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

type Phase = 'idle' | 'preload' | 'preselect' | 'running' | 'done'

interface SoftwareItem {
  DisplayName: string
  DisplayVersion: string
  Publisher: string
}

interface ServiceItem {
  Name: string
  DisplayName: string
  Status: string       // Running, Stopped, etc.
  StartType: string    // Automatic, Manual, Disabled
}

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

type TimeRange = '1' | '7' | '30'
const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1', label: 'Letzte 24 Stunden' },
  { value: '7', label: 'Letzte 7 Tage' },
  { value: '30', label: 'Letzte 30 Tage' },
]

export default function PCDiagnosis() {
  const [hostname, setHostname] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRange>('7')
  const [phase, setPhase] = useState<Phase>('idle')
  const [areas, setAreas] = useState<AreaResult[]>([])
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set())
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set())
  const [skillRunning, setSkillRunning] = useState<string | null>(null)
  const [skillOutput, setSkillOutput] = useState<Record<string, string>>({})
  const [confirmSkill, setConfirmSkill] = useState<DiagFinding | null>(null)
  const cancelRef = useRef(false)

  // ── Optional pre-scan checks ───────────────────────────────────────────
  const [checkSoftware, setCheckSoftware] = useState(false)
  const [checkServices, setCheckServices] = useState(false)
  const [swList, setSwList] = useState<SoftwareItem[]>([])
  const [swSelected, setSwSelected] = useState<Set<string>>(new Set())
  const [swFilter, setSwFilter] = useState('')
  const [svcList, setSvcList] = useState<ServiceItem[]>([])
  const [svcSelected, setSvcSelected] = useState<Set<string>>(new Set())
  const [svcFilter, setSvcFilter] = useState('')
  const [preloadError, setPreloadError] = useState('')

  const updateArea = useCallback((id: string, patch: Partial<AreaResult>) => {
    setAreas(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }, [])

  // ── Run a single diagnosis area ────────────────────────────────────────
  const runArea = useCallback(async (areaId: string, h: string, days: number, selectedApps: string[] = [], selectedSvcs: string[] = []): Promise<AreaResult> => {
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
          // Helper function to extract event details (embedded in the PS script)
          const detailFn = [
            'function Evt($e,$max=5) {',
            '  @($e | Select-Object -First $max | ForEach-Object {',
            '    $msg = ($_.Message -split "\\n")[0]',
            '    if ($msg.Length -gt 200) { $msg = $msg.Substring(0,200) + "..." }',
            '    [PSCustomObject]@{',
            '      Time = $_.TimeCreated.ToString("dd.MM.yyyy HH:mm:ss")',
            '      Id = $_.Id',
            '      Level = switch($_.Level){ 1{"Kritisch"} 2{"Fehler"} 3{"Warnung"} default{"Info"} }',
            '      Source = $_.ProviderName',
            '      Message = $msg',
            '    }',
            '  })',
            '}',
          ].join('\n')

          const r = await runRemote(h, [
            `$d = ${days}`,
            `$start = (Get-Date).AddDays(-$d)`,
            `$r = @{}`,
            detailFn,
            ``,
            `# ── System-Log ──`,
            `$sys = @(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2,3;StartTime=$start} -MaxEvents 500 -EA SilentlyContinue)`,
            `$r.sysErrors = @($sys | Where-Object Level -le 2).Count`,
            `$r.sysWarnings = @($sys | Where-Object Level -eq 3).Count`,
            ``,
            `# Bluescreens`,
            `$bsod = @($sys | Where-Object { $_.Id -eq 1001 -and $_.Message -match 'BugCheck' })`,
            `$r.bsodCount = $bsod.Count`,
            `$r.lastBsod = if($bsod.Count -gt 0){$bsod[0].TimeCreated.ToString('dd.MM.yyyy HH:mm')}else{''}`,
            `$r.bsodDetails = @(Evt $bsod 3)`,
            ``,
            `# Unerwartete Shutdowns`,
            `$shut = @($sys | Where-Object { $_.Id -in @(6008,41) })`,
            `$r.shutdownCount = $shut.Count`,
            `$r.lastShutdown = if($shut.Count -gt 0){$shut[0].TimeCreated.ToString('dd.MM.yyyy HH:mm')}else{''}`,
            `$r.shutdownDetails = @(Evt $shut 5)`,
            ``,
            `# Dienst-Abstuerze`,
            `$svcCrash = @($sys | Where-Object { $_.Id -in @(7031,7034,7023,7024) })`,
            `$r.svcCrashCount = $svcCrash.Count`,
            `$r.svcCrashDetails = @(Evt $svcCrash 5)`,
            ``,
            `# Festplatten-E/A`,
            `$diskErr = @($sys | Where-Object { $_.Id -in @(7,9,11,15,51,52,55,98,129,140,153,157) })`,
            `$r.diskErrCount = $diskErr.Count`,
            `$r.diskErrDetails = @(Evt $diskErr 5)`,
            ``,
            `# Netzwerk-Fehler`,
            `$netErr = @($sys | Where-Object { $_.ProviderName -match 'Tcpip|NDIS|Dhcp|DNS|NetBT|e1[a-z]express|igb|vmxnet' -and $_.Level -le 2 })`,
            `$r.netErrCount = $netErr.Count`,
            `$r.netErrDetails = @(Evt $netErr 5)`,
            ``,
            `# Treiber-Fehler`,
            `$drvErr = @($sys | Where-Object { $_.ProviderName -match 'DriverFrameworks|Kernel-PnP' -and $_.Level -le 2 })`,
            `$r.driverErrCount = $drvErr.Count`,
            `$r.driverErrDetails = @(Evt $drvErr 5)`,
            ``,
            `# Speicher/RAM`,
            `$memErr = @(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-MemoryDiagnostics-Results';StartTime=$start} -MaxEvents 10 -EA SilentlyContinue | Where-Object Level -le 3)`,
            `$r.memErrCount = @($memErr).Count`,
            `$r.memErrDetails = @(Evt $memErr 3)`,
            ``,
            `# Windows Update`,
            `$wuErr = @(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-WindowsUpdateClient';Level=1,2;StartTime=$start} -MaxEvents 20 -EA SilentlyContinue)`,
            `$r.wuErrCount = @($wuErr).Count`,
            `$r.wuErrDetails = @(Evt $wuErr 5)`,
            ``,
            `# ── Application-Log ──`,
            `$app = @(Get-WinEvent -FilterHashtable @{LogName='Application';Level=1,2;StartTime=$start} -MaxEvents 500 -EA SilentlyContinue)`,
            `$r.appErrors = $app.Count`,
            ``,
            `# App-Abstuerze (WER)`,
            `$appCrash = @($app | Where-Object { $_.Id -in @(1000,1002) })`,
            `$r.appCrashCount = $appCrash.Count`,
            `$r.appCrashDetails = @(Evt $appCrash 5)`,
            ``,
            `# MSI-Fehler`,
            `$msiErr = @($app | Where-Object { $_.ProviderName -eq 'MsiInstaller' -and $_.Level -le 2 })`,
            `$r.msiErrCount = @($msiErr).Count`,
            `$r.msiErrDetails = @(Evt $msiErr 3)`,
            ``,
            `# .NET / CLR`,
            `$clrErr = @($app | Where-Object { $_.ProviderName -match 'CLR|.NET Runtime' -and $_.Level -le 2 })`,
            `$r.clrErrCount = @($clrErr).Count`,
            `$r.clrErrDetails = @(Evt $clrErr 3)`,
            ``,
            `# ── Security-Log ──`,
            `$secFail = @(Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625;StartTime=$start} -MaxEvents 100 -EA SilentlyContinue)`,
            `$r.loginFailCount = $secFail.Count`,
            `$r.loginFailDetails = @(Evt $secFail 5)`,
            ``,
            `$lockout = @(Get-WinEvent -FilterHashtable @{LogName='Security';Id=4740;StartTime=$start} -MaxEvents 20 -EA SilentlyContinue)`,
            `$r.lockoutCount = @($lockout).Count`,
            `$r.lockoutDetails = @(Evt $lockout 3)`,
            ``,
            `# ── NTFS ──`,
            `$ntfs = @(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Ntfs','Microsoft-Windows-Ntfs';Level=1,2;StartTime=$start} -MaxEvents 20 -EA SilentlyContinue)`,
            `$r.ntfsErrCount = @($ntfs).Count`,
            `$r.ntfsErrDetails = @(Evt $ntfs 3)`,
            ``,
            `# ── Task Scheduler ──`,
            `$taskErr = @(Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TaskScheduler/Operational';Level=1,2;StartTime=$start} -MaxEvents 30 -EA SilentlyContinue)`,
            `$r.taskErrCount = @($taskErr).Count`,
            `$r.taskErrDetails = @(Evt $taskErr 3)`,
            ``,
            `# ── Top Sources + IDs ──`,
            `$allErr = @($sys | Where-Object Level -le 2) + @($app | Where-Object Level -le 2)`,
            `$r.topSources = @($allErr | Group-Object ProviderName | Sort-Object Count -Desc | Select-Object -First 5 Name,Count)`,
            `$r.topEventIds = @($allErr | Group-Object Id | Sort-Object Count -Desc | Select-Object -First 10 Name,Count)`,
            ``,
            `$r.days = $d`,
            `$r`,
          ].join('\n'), 60000)

          base.checksRun = 15
          if (r.ok) {
            const d = safeParseJson(r.data) as Record<string, unknown> | null
            if (d) {
              // Format detailed rawOutput with event details per category
              const fmtEvents = (label: string, count: unknown, details: unknown) => {
                const c = Number(count)
                if (c === 0) return `${label}: 0\n`
                const arr = Array.isArray(details) ? details as Array<Record<string, unknown>> : []
                let out = `${label}: ${c}\n`
                for (const e of arr) {
                  out += `  [${e.Time}] Event ${e.Id} (${e.Level}) — ${e.Source}\n`
                  out += `    ${e.Message}\n`
                }
                return out
              }
              base.rawOutput = [
                `═══ Event-Log Analyse (letzte ${d.days} Tage) ═══`,
                `System-Fehler: ${d.sysErrors} | System-Warnungen: ${d.sysWarnings} | App-Fehler: ${d.appErrors}`,
                '',
                fmtEvents('Bluescreens (BugCheck)', d.bsodCount, d.bsodDetails),
                fmtEvents('Unerwartete Shutdowns', d.shutdownCount, d.shutdownDetails),
                fmtEvents('Dienst-Abstürze', d.svcCrashCount, d.svcCrashDetails),
                fmtEvents('Festplatten-E/A-Fehler', d.diskErrCount, d.diskErrDetails),
                fmtEvents('Netzwerk-Fehler', d.netErrCount, d.netErrDetails),
                fmtEvents('Treiber-Fehler', d.driverErrCount, d.driverErrDetails),
                fmtEvents('RAM/Speicher-Fehler', d.memErrCount, d.memErrDetails),
                fmtEvents('Windows Update-Fehler', d.wuErrCount, d.wuErrDetails),
                fmtEvents('App-Abstürze (WER)', d.appCrashCount, d.appCrashDetails),
                fmtEvents('MSI/Installations-Fehler', d.msiErrCount, d.msiErrDetails),
                fmtEvents('.NET/CLR-Fehler', d.clrErrCount, d.clrErrDetails),
                fmtEvents('Fehlgeschlagene Anmeldungen', d.loginFailCount, d.loginFailDetails),
                fmtEvents('Kontosperrungen', d.lockoutCount, d.lockoutDetails),
                fmtEvents('NTFS-Dateisystem-Fehler', d.ntfsErrCount, d.ntfsErrDetails),
                fmtEvents('Aufgabenplaner-Fehler', d.taskErrCount, d.taskErrDetails),
                '── Top 5 Fehlerquellen ──',
                ...(Array.isArray(d.topSources) ? (d.topSources as Array<Record<string, unknown>>).map(s => `  ${s.Name}: ${s.Count}x`) : []),
                '',
                '── Top 10 Event-IDs ──',
                ...(Array.isArray(d.topEventIds) ? (d.topEventIds as Array<Record<string, unknown>>).map(s => `  Event ${s.Name}: ${s.Count}x`) : []),
              ].join('\n')

              // Bluescreens
              if (Number(d.bsodCount) > 0) addFinding('evt-1001', String(d.lastBsod))
              else base.checksOk++
              // Unerwartete Shutdowns
              if (Number(d.shutdownCount) > 0) addFinding('evt-6008', String(d.lastShutdown))
              else base.checksOk++
              // Dienst-Abstürze
              if (Number(d.svcCrashCount) > 0) {
                const svcDetails = Array.isArray(d.svcCrashDetails) ? (d.svcCrashDetails as Array<Record<string, unknown>>).map(e => String(e.Message || '')).slice(0, 3).join(' | ') : ''
                addCustom('warning', `${d.svcCrashCount} Dienst-Abstürze`, svcDetails || 'Dienste sind unerwartet abgestürzt.', 'svc-restart', 'svc')
              } else base.checksOk++
              // App-Abstürze
              const crashCount = Number(d.appCrashCount)
              if (crashCount > 5) {
                const crashDetails = Array.isArray(d.appCrashDetails) ? (d.appCrashDetails as Array<Record<string, unknown>>).map(e => String(e.Message || '')).slice(0, 3).join(' | ') : ''
                addCustom('warning', `${crashCount} Anwendungs-Abstürze`, crashDetails || `Programme sind ${crashCount}x abgestürzt.`, 'sfc', 'repair')
              } else if (crashCount > 0) {
                const crashDetails = Array.isArray(d.appCrashDetails) ? (d.appCrashDetails as Array<Record<string, unknown>>).map(e => `${e.Time}: ${e.Message}`).slice(0, 2).join(' | ') : ''
                addCustom('info', `${crashCount} Anwendungs-Absturz(e)`, crashDetails || `Programme sind ${crashCount}x abgestürzt.`)
              } else base.checksOk++
              // Festplatten-E/A
              if (Number(d.diskErrCount) > 0) addFinding('evt-11')
              else base.checksOk++
              // Netzwerk-Fehler
              if (Number(d.netErrCount) > 3) addCustom('warning', `${d.netErrCount} Netzwerk-Fehler in der Ereignisanzeige`, 'Netzwerkadapter oder TCP/IP-Stack Probleme erkannt.', 'flushdns', 'net')
              else base.checksOk++
              // Treiber-Fehler
              if (Number(d.driverErrCount) > 0) addCustom('warning', `${d.driverErrCount} Treiber-Fehler`, 'Plug-and-Play oder Treiber-Framework Fehler.', 'deverror', 'devmgr')
              else base.checksOk++
              // RAM-Fehler
              if (Number(d.memErrCount) > 0) addCustom('critical', 'Speicher-Diagnosefehler erkannt', 'Windows-Speicherdiagnose hat Probleme gemeldet.', 'topram', 'procs')
              else base.checksOk++
              // Windows Update Fehler
              if (Number(d.wuErrCount) > 0) addCustom('warning', `${d.wuErrCount} Windows Update-Fehler`, 'Updates konnten nicht installiert werden.', 'usoscan', 'gpo')
              else base.checksOk++
              // Login-Fehlversuche
              if (Number(d.loginFailCount) > 10) addCustom('warning', `${d.loginFailCount} fehlgeschlagene Anmeldeversuche`, 'Möglicherweise falsches Passwort gespeichert oder Brute-Force.', 'log-sec-failed', 'eventlogs')
              else base.checksOk++
              // Kontosperrungen
              if (Number(d.lockoutCount) > 0) addCustom('warning', `${d.lockoutCount} Kontosperrung(en)`, 'Ein Konto wurde gesperrt — falsches Passwort in einer App?')
              else base.checksOk++
              // MSI/Installations-Fehler
              if (Number(d.msiErrCount) > 0) addCustom('info', `${d.msiErrCount} Installations-/MSI-Fehler`, 'Software-Installationen oder Updates hatten Probleme.')
              else base.checksOk++
              // NTFS-Fehler
              if (Number(d.ntfsErrCount) > 0) addCustom('critical', `${d.ntfsErrCount} NTFS-Dateisystem-Fehler`, 'Dateisystem-Beschädigung erkannt — CHKDSK empfohlen.', 'chkdskrun', 'diskmgmt')
              else base.checksOk++
              // Task-Scheduler Fehler
              if (Number(d.taskErrCount) > 3) addCustom('info', `${d.taskErrCount} Aufgabenplaner-Fehler`, 'Geplante Aufgaben sind fehlgeschlagen.')
              else base.checksOk++
              // Gesamt System+App Fehler als Info
              const totalErr = Number(d.sysErrors) + Number(d.appErrors)
              if (totalErr > 50) addCustom('info', `${totalErr} Fehler-Einträge gesamt (System: ${d.sysErrors}, Apps: ${d.appErrors})`, `In den letzten ${d.days} Tagen.`)
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

          // ── Deep service analysis for selected services ──
          if (selectedSvcs.length > 0) {
            base.checksRun += selectedSvcs.length
            const svcNames = selectedSvcs.map(n => "'" + n.replace(/'/g, "''") + "'").join(',')
            const sr = await runRemote(h, [
              '$d = ' + days,
              '$start = (Get-Date).AddDays(-$d)',
              '$names = @(' + svcNames + ')',
              '$results = @()',
              'foreach ($sn in $names) {',
              '  $svc = Get-Service -Name $sn -EA SilentlyContinue',
              '  if (-not $svc) { $results += [PSCustomObject]@{Name=$sn;DisplayName="";Status="NotFound";StartType="";Errors=0;Warnings=0;LastStop="";LastError="";Restarts=0}; continue }',
              '  $evts = @(Get-WinEvent -FilterHashtable @{LogName="System";ProviderName="Service Control Manager";StartTime=$start} -MaxEvents 500 -EA SilentlyContinue | Where-Object { $_.Message -match $svc.DisplayName -or $_.Message -match $sn })',
              '  $errs = @($evts | Where-Object { $_.Id -in @(7000,7001,7009,7011,7023,7024,7031,7034,7043) })',
              '  $stops = @($evts | Where-Object { $_.Id -eq 7036 -and $_.Message -match "beendet|stopped" })',
              '  $starts = @($evts | Where-Object { $_.Id -eq 7036 -and $_.Message -match "gestartet|running" })',
              '  $results += [PSCustomObject]@{',
              '    Name = $sn',
              '    DisplayName = $svc.DisplayName',
              '    Status = $svc.Status.ToString()',
              '    StartType = $svc.StartType.ToString()',
              '    Errors = $errs.Count',
              '    Warnings = @($evts | Where-Object Level -eq 3).Count',
              '    LastStop = if ($stops.Count -gt 0) { $stops[0].TimeCreated.ToString("dd.MM.yyyy HH:mm") } else { "" }',
              '    LastError = if ($errs.Count -gt 0) { $errs[0].TimeCreated.ToString("dd.MM.yyyy HH:mm") + " - " + ($errs[0].Message -split "\\n")[0].Substring(0, [Math]::Min(100, ($errs[0].Message -split "\\n")[0].Length)) } else { "" }',
              '    Restarts = [Math]::Min($starts.Count, $stops.Count)',
              '  }',
              '}',
              '$results',
            ].join('\n'), 45000)

            if (sr.ok) {
              const svcData = safeParseJson(sr.data)
              const svcArr = Array.isArray(svcData) ? svcData : svcData ? [svcData] : []
              for (const sd of svcArr as Array<Record<string, unknown>>) {
                const sName = String(sd.Name ?? '')
                const dName = String(sd.DisplayName || sName)
                const status = String(sd.Status ?? '')
                const errCount = Number(sd.Errors ?? 0)
                const restarts = Number(sd.Restarts ?? 0)
                const lastStop = String(sd.LastStop ?? '')
                const lastErr = String(sd.LastError ?? '')

                if (status === 'NotFound') {
                  addCustom('info', `Dienst "${sName}" nicht gefunden`, 'Dieser Dienst ist auf dem Ziel-PC nicht installiert.')
                  continue
                }
                if (status === 'Stopped' && (sd.StartType === 'Automatic' || sd.StartType === 'Automatic (Delayed Start)')) {
                  addCustom('warning', `${dName}: Gestoppt (sollte laufen)`, `StartType: ${sd.StartType}. Letzter Stopp: ${lastStop || 'unbekannt'}`, 'svc-restart', 'svc', sName)
                } else if (errCount > 0) {
                  addCustom(errCount > 5 ? 'warning' : 'info',
                    `${dName}: ${errCount} Fehler, ${restarts} Neustarts`,
                    lastErr || `Fehler in den letzten ${days} Tagen.`, 'svc-restart', 'svc', sName)
                } else {
                  base.checksOk++
                }
              }
              base.rawOutput = (base.rawOutput || '') + '\n\n── Dienste-Analyse ──\n' + JSON.stringify(svcArr, null, 2)
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

          // ── App-specific log analysis for selected software ──
          if (selectedApps.length > 0) {
            const appNames = selectedApps.map(n => n.replace(/'/g, "''"))
            const appPatterns = appNames.map(n => {
              // Extract short name for log matching (e.g. "Google Chrome" → "chrome", "Microsoft Teams" → "teams")
              const short = n.toLowerCase().replace(/microsoft\s*/i, '').replace(/google\s*/i, '').split(/[\s(,\-]+/)[0]
              return short
            }).filter(s => s.length >= 3)
            const patternStr = appPatterns.map(p => "'" + p + "'").join(',')

            if (appPatterns.length > 0) {
              base.checksRun += selectedApps.length
              const sr = await runRemote(h, [
                '$d = ' + days,
                '$start = (Get-Date).AddDays(-$d)',
                '$patterns = @(' + patternStr + ')',
                '$results = @()',
                '# Check Application event log for each app',
                '$appLog = @(Get-WinEvent -FilterHashtable @{LogName="Application";Level=1,2,3;StartTime=$start} -MaxEvents 1000 -EA SilentlyContinue)',
                '# Check System log too',
                '$sysLog = @(Get-WinEvent -FilterHashtable @{LogName="System";Level=1,2,3;StartTime=$start} -MaxEvents 500 -EA SilentlyContinue)',
                '$allLogs = $appLog + $sysLog',
                'foreach ($pat in $patterns) {',
                '  $matches = @($allLogs | Where-Object { $_.Message -match $pat -or $_.ProviderName -match $pat })',
                '  $errors = @($matches | Where-Object Level -le 2)',
                '  $warnings = @($matches | Where-Object Level -eq 3)',
                '  $results += [PSCustomObject]@{',
                '    Pattern = $pat',
                '    TotalEvents = $matches.Count',
                '    Errors = $errors.Count',
                '    Warnings = $warnings.Count',
                '    LastError = if ($errors.Count -gt 0) { $errors[0].TimeCreated.ToString("dd.MM.yyyy HH:mm") + " - " + ($errors[0].Message -split "\\n")[0].Substring(0, [Math]::Min(120, ($errors[0].Message -split "\\n")[0].Length)) } else { "" }',
                '    LastWarning = if ($warnings.Count -gt 0) { $warnings[0].TimeCreated.ToString("dd.MM.yyyy HH:mm") + " - " + ($warnings[0].Message -split "\\n")[0].Substring(0, [Math]::Min(120, ($warnings[0].Message -split "\\n")[0].Length)) } else { "" }',
                '    Sources = @($matches | Group-Object ProviderName | Sort-Object Count -Desc | Select-Object -First 3 Name,Count)',
                '  }',
                '}',
                '$results',
              ].join('\n'), 45000)

              if (sr.ok) {
                const appData = safeParseJson(sr.data)
                const appArr = Array.isArray(appData) ? appData : appData ? [appData] : []
                for (let ai = 0; ai < selectedApps.length; ai++) {
                  const appName = selectedApps[ai]
                  const appResult = appArr[ai] as Record<string, unknown> | undefined
                  if (!appResult) { base.checksOk++; continue }
                  const errCount = Number(appResult.Errors ?? 0)
                  const warnCount = Number(appResult.Warnings ?? 0)
                  if (errCount > 0) {
                    addCustom(errCount > 5 ? 'warning' : 'info',
                      `${appName}: ${errCount} Fehler, ${warnCount} Warnungen`,
                      String(appResult.LastError || 'Fehler in der Ereignisanzeige gefunden.'),
                      'log-app-errors', 'eventlogs')
                  } else if (warnCount > 3) {
                    addCustom('info',
                      `${appName}: ${warnCount} Warnungen`,
                      String(appResult.LastWarning || 'Warnungen in der Ereignisanzeige.'))
                  } else {
                    base.checksOk++
                  }
                }
                // Append app analysis to raw output
                base.rawOutput = (base.rawOutput || '') + '\n\n── Software-Analyse ──\n' + JSON.stringify(appArr, null, 2)
              }
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

  // ── Load software + services from remote PC ────────────────────────────
  const loadPreData = useCallback(async () => {
    const h = hostname.trim()
    if (!h) return
    const hs = h.replace(/'/g, "''")
    setPreloadError('')
    setPhase('preload')

    // WinRM activation block (reused)
    const winrmBlock = [
      '$winrm = $false',
      "try { Test-WSMan -ComputerName '" + hs + "' -EA Stop | Out-Null; $winrm = $true } catch {}",
      'if (-not $winrm) {',
      "  try { $svc = Get-Service -ComputerName '" + hs + "' -Name WinRM -EA Stop; if ($svc.StartType -eq 'Disabled') { Set-Service -ComputerName '" + hs + "' -Name WinRM -StartupType Manual -EA Stop }; $svc.Start(); $svc.WaitForStatus('Running', [TimeSpan]::FromSeconds(10)); $winrm = $true } catch {}",
      '  if (-not $winrm) { try { sc.exe "\\\\' + hs + '" start WinRM 2>&1 | Out-Null; Start-Sleep 3; $chk = Get-Service -ComputerName ' + "'" + hs + "'" + ' -Name WinRM -EA SilentlyContinue; if ($chk -and $chk.Status -eq "Running") { $winrm = $true } } catch {} }',
      '}',
      'if (-not $winrm) { Write-Output "ERR:WinRM nicht aktivierbar"; exit }',
    ].join('\n')

    // Load software if requested
    if (checkSoftware) {
      try {
        const swScript = winrmBlock + '\n' + [
          "Invoke-Command -ComputerName '" + hs + "' -ScriptBlock {",
          "  $paths=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
          '  Get-ItemProperty $paths -EA SilentlyContinue | Where-Object {$_.DisplayName} | Select-Object DisplayName,DisplayVersion,Publisher | Group-Object DisplayName | ForEach-Object { $_.Group | Sort-Object DisplayVersion -Descending | Select-Object -First 1 } | Sort-Object DisplayName | ConvertTo-Json -Compress',
          '} -EA Stop',
        ].join('\n')
        const res = await api().runPowerShell(swScript, 30000)
        const out = (res.stdout ?? '').trim()
          .replace(/PSComputerName\s*:.*/g, '').replace(/RunspaceId\s*:.*/g, '').replace(/PSShowComputerName\s*:.*/g, '').trim()
        if (out.startsWith('ERR:')) { setPreloadError(out.slice(4)); setPhase('idle'); return }
        const parsed = JSON.parse(out)
        const arr: SoftwareItem[] = (Array.isArray(parsed) ? parsed : [parsed])
          .filter((e: Record<string, unknown>) => e.DisplayName)
          .map((e: Record<string, unknown>) => ({ DisplayName: String(e.DisplayName ?? ''), DisplayVersion: String(e.DisplayVersion ?? ''), Publisher: String(e.Publisher ?? '') }))
        setSwList(arr)
        setSwSelected(new Set())
      } catch (e) { setPreloadError(`Software: ${e}`); setPhase('idle'); return }
    }

    // Load services if requested
    if (checkServices) {
      try {
        const svcScript = winrmBlock + '\n' + [
          "Invoke-Command -ComputerName '" + hs + "' -ScriptBlock {",
          '  Get-Service | Select-Object Name,DisplayName,@{N="Status";E={$_.Status.ToString()}},@{N="StartType";E={$_.StartType.ToString()}} | Sort-Object DisplayName | ConvertTo-Json -Compress',
          '} -EA Stop',
        ].join('\n')
        const res = await api().runPowerShell(svcScript, 30000)
        const out = (res.stdout ?? '').trim()
          .replace(/PSComputerName\s*:.*/g, '').replace(/RunspaceId\s*:.*/g, '').replace(/PSShowComputerName\s*:.*/g, '').trim()
        if (!out.startsWith('ERR:')) {
          const parsed = JSON.parse(out)
          const arr: ServiceItem[] = (Array.isArray(parsed) ? parsed : [parsed])
            .filter((e: Record<string, unknown>) => e.Name)
            .map((e: Record<string, unknown>) => ({ Name: String(e.Name ?? ''), DisplayName: String(e.DisplayName ?? ''), Status: String(e.Status ?? ''), StartType: String(e.StartType ?? '') }))
          setSvcList(arr)
          setSvcSelected(new Set())
        }
      } catch { /* services optional — continue even if it fails */ }
    }

    setPhase('preselect')
  }, [hostname, checkSoftware, checkServices])

  // ── Start Diagnosis ────────────────────────────────────────────────────
  const startDiagnosis = useCallback(async () => {
    const h = hostname.trim()
    if (!h) return

    // If user wants pre-scan options → load data first
    if ((checkSoftware || checkServices) && phase === 'idle') {
      await loadPreData()
      return
    }

    startDiagnosisDirect()
  }, [hostname, checkSoftware, checkServices, phase, loadPreData])

  /** Direct start — runs the actual scan */
  const startDiagnosisDirect = useCallback(async () => {
    const h = hostname.trim()
    if (!h) return
    cancelRef.current = false
    setPhase('running')
    setExpandedAreas(new Set())
    setExpandedFindings(new Set())
    setSkillOutput({})

    const initial: AreaResult[] = AREAS.map(a => ({ ...a, status: 'pending' as const, findings: [], checksRun: 0, checksOk: 0 }))
    setAreas(initial)

    const BATCH = 3
    const results = [...initial]
    const selectedApps = [...swSelected]
    const selectedSvcs = [...svcSelected]
    for (let i = 0; i < AREAS.length; i += BATCH) {
      if (cancelRef.current) break
      const batch = AREAS.slice(i, i + BATCH)
      for (const a of batch) updateArea(a.id, { status: 'running' })
      const batchResults = await Promise.all(batch.map(a => runArea(a.id, h, Number(timeRange), selectedApps, selectedSvcs)))
      for (const r of batchResults) {
        const idx = results.findIndex(x => x.id === r.id)
        if (idx >= 0) results[idx] = r
        updateArea(r.id, r)
      }
    }
    setAreas(results)
    setPhase('done')
    const withFindings = new Set(results.filter(a => a.findings.length > 0).map(a => a.id))
    setExpandedAreas(withFindings)
  }, [hostname, timeRange, runArea, updateArea, swSelected, svcSelected])

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

  // ── PDF Export ──────────────────────────────────────────────────────────
  const [lastPdfPath, setLastPdfPath] = useState<string | null>(null)

  const exportPdf = useCallback(async () => {
    const h = hostname.trim()
    const now = new Date()
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const defaultName = `PC_Diagnose_${h}_${ts}.pdf`

    const savePath = await api().saveFileDialog(defaultName, [{ name: 'PDF', extensions: ['pdf'] }])
    if (!savePath) return

    const allF = areas.flatMap(a => a.findings)
    const crits = allF.filter(f => f.severity === 'critical')
    const warns = allF.filter(f => f.severity === 'warning')
    const infs = allF.filter(f => f.severity === 'info')
    const total = areas.reduce((s, a) => s + a.checksRun, 0)
    const ok = areas.reduce((s, a) => s + a.checksOk, 0)

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 15
    let y = 15

    const addPage = () => { doc.addPage(); y = 15 }
    const checkSpace = (needed: number) => { if (y + needed > 275) addPage() }

    // ── Header ──────────────────────────────────────────────────────────
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('PC-Diagnose Bericht', margin, y)
    y += 8
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Hostname: ${h}`, margin, y)
    doc.text(`Datum: ${now.toLocaleDateString('de-DE')} ${now.toLocaleTimeString('de-DE')}`, pageW - margin - 60, y)
    y += 4
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    const extras: string[] = [`Zeitraum: ${timeRange === '1' ? '24 Stunden' : timeRange + ' Tage'}`]
    if (swSelected.size > 0) extras.push(`${swSelected.size} Software geprüft`)
    if (svcSelected.size > 0) extras.push(`${svcSelected.size} Dienste geprüft`)
    doc.text(extras.join(' | '), margin, y)
    doc.setTextColor(0, 0, 0)
    y += 6

    // ── Zusammenfassung ─────────────────────────────────────────────────
    const summaryColor = crits.length > 0 ? [220, 53, 69] : warns.length > 0 ? [255, 193, 7] : [40, 167, 69]
    doc.setFillColor(summaryColor[0], summaryColor[1], summaryColor[2])
    doc.roundedRect(margin, y, pageW - 2 * margin, 14, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    const summaryText = crits.length === 0 && warns.length === 0
      ? 'Alles OK'
      : `${crits.length} Fehler, ${warns.length} Warnungen${infs.length > 0 ? `, ${infs.length} Hinweise` : ''}`
    doc.text(summaryText, margin + 4, y + 6)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`${ok} von ${total} Checks bestanden`, margin + 4, y + 11)
    doc.setTextColor(0, 0, 0)
    y += 20

    // ── Bereiche-Übersicht ──────────────────────────────────────────────
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Bereiche', margin, y)
    y += 5

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Bereich', 'Status', 'Checks OK', 'Probleme']],
      body: areas.map(a => [
        a.label,
        a.status === 'ok' ? 'OK' : a.status === 'warn' ? 'Warnungen' : a.status === 'error' ? 'Fehler' : a.status === 'skipped' ? 'Übersprungen' : '—',
        `${a.checksOk}/${a.checksRun}`,
        String(a.findings.length),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 30 }, 2: { cellWidth: 25 }, 3: { cellWidth: 20 } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const val = data.cell.text[0]
          if (val === 'Fehler') data.cell.styles.textColor = [220, 53, 69]
          else if (val === 'Warnungen') data.cell.styles.textColor = [255, 140, 0]
          else if (val === 'OK') data.cell.styles.textColor = [40, 167, 69]
        }
      },
    })
    y = (doc as unknown as Record<string, unknown>).lastAutoTable ? ((doc as unknown as Record<string, { finalY: number }>).lastAutoTable.finalY + 8) : y + 40

    // ── Gefundene Probleme ──────────────────────────────────────────────
    const sorted = [...crits, ...warns, ...infs]
    if (sorted.length > 0) {
      checkSpace(15)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`Gefundene Probleme (${sorted.length})`, margin, y)
      y += 5

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['', 'Problem', 'Beschreibung', 'Fehlerbehebung']],
        body: sorted.map(f => [
          f.severity === 'critical' ? 'FEHLER' : f.severity === 'warning' ? 'WARNUNG' : 'INFO',
          f.title,
          f.description,
          f.skillId ? `Skill: ${getSkillLabel(f.skillId, f.skillCategory)}` : f.solution || '—',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 1: { cellWidth: 45 }, 2: { cellWidth: 55 }, 3: { cellWidth: 42 } },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const val = data.cell.text[0]
            if (val === 'FEHLER') { data.cell.styles.textColor = [220, 53, 69]; data.cell.styles.fillColor = [253, 237, 237] }
            else if (val === 'WARNUNG') { data.cell.styles.textColor = [180, 100, 0]; data.cell.styles.fillColor = [255, 248, 225] }
            else { data.cell.styles.textColor = [30, 100, 180]; data.cell.styles.fillColor = [235, 245, 255] }
          }
        },
      })
      y = (doc as unknown as Record<string, { finalY: number }>).lastAutoTable?.finalY + 8 || y + 30
    }

    // ── Detail pro Bereich ───────────────────────────────────────────────
    for (const area of areas) {
      if (area.findings.length === 0 && !area.rawOutput) continue
      checkSpace(20)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      const statusEmoji = area.status === 'ok' ? '[OK]' : area.status === 'warn' ? '[!]' : area.status === 'error' ? '[X]' : '[—]'
      doc.text(`${statusEmoji} ${area.label}  (${area.checksOk}/${area.checksRun} OK)`, margin, y)
      y += 5

      if (area.findings.length > 0) {
        for (const f of area.findings) {
          checkSpace(18)
          const sevLabel = f.severity === 'critical' ? 'FEHLER' : f.severity === 'warning' ? 'WARNUNG' : 'INFO'
          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          if (f.severity === 'critical') doc.setTextColor(220, 53, 69)
          else if (f.severity === 'warning') doc.setTextColor(180, 100, 0)
          else doc.setTextColor(30, 100, 180)
          doc.text(`[${sevLabel}] ${f.title}`, margin + 3, y)
          doc.setTextColor(0, 0, 0)
          y += 4
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          const descLines = doc.splitTextToSize(f.description, pageW - 2 * margin - 6)
          doc.text(descLines, margin + 5, y)
          y += descLines.length * 3 + 1

          if (f.causes.length > 0) {
            doc.setFont('helvetica', 'italic')
            doc.text('Ursachen: ' + f.causes.join(', '), margin + 5, y)
            y += 3.5
          }
          if (f.solution) {
            doc.setFont('helvetica', 'normal')
            doc.text('Lösung: ' + f.solution, margin + 5, y)
            y += 3.5
          }
          y += 2
        }
      }

      if (area.rawOutput) {
        checkSpace(15)
        doc.setFontSize(7)
        doc.setFont('courier', 'normal')
        doc.setTextColor(100, 100, 100)
        const rawLines = doc.splitTextToSize(area.rawOutput.slice(0, 800), pageW - 2 * margin - 10)
        for (const line of rawLines.slice(0, 20)) {
          checkSpace(3.5)
          doc.text(line, margin + 3, y)
          y += 3
        }
        if (rawLines.length > 20) { doc.text('... (gekürzt)', margin + 3, y); y += 3 }
        doc.setTextColor(0, 0, 0)
      }
      y += 5
    }

    // ── Selected Software Analysis ─────────────────────────────────────
    if (swSelected.size > 0) {
      checkSpace(20)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text(`Software-Analyse (${swSelected.size} Programme)`, margin, y)
      y += 2

      const swArea = areas.find(a => a.id === 'software')
      const swFindings = swArea?.findings.filter(f => [...swSelected].some(s => f.title.includes(s) || f.title.toLowerCase().includes(s.toLowerCase().split(/[\s(]/)[0]))) ?? []
      const swOkApps = [...swSelected].filter(s => !swFindings.some(f => f.title.includes(s) || f.title.toLowerCase().includes(s.toLowerCase().split(/[\s(]/)[0])))

      const swBody: string[][] = []
      for (const app of [...swSelected]) {
        const finding = swFindings.find(f => f.title.includes(app) || f.title.toLowerCase().includes(app.toLowerCase().split(/[\s(]/)[0]))
        swBody.push([
          app,
          finding ? (finding.severity === 'critical' ? 'FEHLER' : finding.severity === 'warning' ? 'WARNUNG' : 'INFO') : 'OK',
          finding ? finding.description.slice(0, 80) : 'Keine Fehler in den Logs',
        ])
      }
      autoTable(doc, {
        startY: y + 3,
        margin: { left: margin, right: margin },
        head: [['Software', 'Status', 'Details']],
        body: swBody,
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 18 }, 2: { cellWidth: 87 } },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 1) {
            const v = data.cell.text[0]
            if (v === 'OK') { data.cell.styles.textColor = [40, 167, 69]; data.cell.styles.fillColor = [235, 255, 240] }
            else if (v === 'FEHLER') { data.cell.styles.textColor = [220, 53, 69]; data.cell.styles.fillColor = [253, 237, 237] }
            else if (v === 'WARNUNG') { data.cell.styles.textColor = [180, 100, 0]; data.cell.styles.fillColor = [255, 248, 225] }
            else { data.cell.styles.textColor = [30, 100, 180]; data.cell.styles.fillColor = [235, 245, 255] }
          }
        },
      })
      y = (doc as unknown as Record<string, { finalY: number }>).lastAutoTable?.finalY + 8 || y + 30
    }

    // ── Selected Services Analysis ──────────────────────────────────────
    if (svcSelected.size > 0) {
      checkSpace(20)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text(`Dienste-Analyse (${svcSelected.size} Dienste)`, margin, y)
      y += 2

      const svcArea = areas.find(a => a.id === 'services')
      const svcBody: string[][] = []
      for (const svcName of [...svcSelected]) {
        const finding = svcArea?.findings.find(f => f.title.includes(svcName) || f.skillInput === svcName)
        const svcItem = svcList.find(s => s.Name === svcName)
        svcBody.push([
          svcItem?.DisplayName || svcName,
          svcName,
          svcItem?.Status || '—',
          svcItem?.StartType === 'Automatic' ? 'Auto' : svcItem?.StartType || '—',
          finding ? (finding.severity === 'critical' ? 'FEHLER' : finding.severity === 'warning' ? 'WARNUNG' : 'INFO') : 'OK',
          finding ? finding.description.slice(0, 60) : 'Keine Probleme',
        ])
      }
      autoTable(doc, {
        startY: y + 3,
        margin: { left: margin, right: margin },
        head: [['Dienst', 'Name', 'Status', 'Start', 'Ergebnis', 'Details']],
        body: svcBody,
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 6.5, cellPadding: 1.5 },
        columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 22 }, 2: { cellWidth: 16 }, 3: { cellWidth: 12 }, 4: { cellWidth: 16 }, 5: { cellWidth: 54 } },
        didParseCell: (data) => {
          if (data.section === 'body') {
            // Status column color
            if (data.column.index === 2) {
              const v = data.cell.text[0]
              if (v === 'Running') data.cell.styles.textColor = [40, 167, 69]
              else if (v === 'Stopped') data.cell.styles.textColor = [220, 53, 69]
            }
            // Result column color
            if (data.column.index === 4) {
              const v = data.cell.text[0]
              if (v === 'OK') { data.cell.styles.textColor = [40, 167, 69]; data.cell.styles.fillColor = [235, 255, 240] }
              else if (v === 'FEHLER') { data.cell.styles.textColor = [220, 53, 69]; data.cell.styles.fillColor = [253, 237, 237] }
              else if (v === 'WARNUNG') { data.cell.styles.textColor = [180, 100, 0]; data.cell.styles.fillColor = [255, 248, 225] }
            }
          }
        },
      })
      y = (doc as unknown as Record<string, { finalY: number }>).lastAutoTable?.finalY + 8 || y + 30
    }

    // ── Footer ──────────────────────────────────────────────────────────
    const pageCount = doc.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(150, 150, 150)
      doc.text(`IT Admin Tool — PC-Diagnose ${h} — ${now.toLocaleDateString('de-DE')}`, margin, 290)
      doc.text(`Seite ${p} / ${pageCount}`, pageW - margin - 20, 290)
    }

    // ── Save ────────────────────────────────────────────────────────────
    const arrayBuffer = doc.output('arraybuffer')
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const b64 = btoa(binary)
    const result = await api().writeFile(savePath, b64)
    if (result.success) setLastPdfPath(savePath)
  }, [areas, hostname, getSkillLabel])

  const openLastPdf = useCallback(async () => {
    if (lastPdfPath) await api().openPath(lastPdfPath)
  }, [lastPdfPath])

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
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              <Clock size={12} className="inline mr-1" />Zeitraum für Event-Log Analyse
            </label>
            <div className="flex gap-2">
              {TIME_RANGES.map(tr => (
                <button key={tr.value} onClick={() => setTimeRange(tr.value)}
                  className={`flex-1 px-3 py-2 text-xs rounded-md border transition-colors ${
                    timeRange === tr.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}>
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
          {/* Optional pre-scan checks */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={checkSoftware} onChange={e => setCheckSoftware(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-primary" />
              <span className="text-xs text-muted-foreground">
                <Monitor size={11} className="inline mr-1" />
                Software-Probleme prüfen — <span className="text-foreground">Programme gezielt auf Fehler in den Logs prüfen</span>
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={checkServices} onChange={e => setCheckServices(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-primary" />
              <span className="text-xs text-muted-foreground">
                <RefreshCw size={11} className="inline mr-1" />
                Dienste-Check erweitert — <span className="text-foreground">Alle Dienste laden, Status prüfen, Fehler-Historie analysieren</span>
              </span>
            </label>
          </div>
          {preloadError && <p className="text-xs text-red-400">{preloadError}</p>}

          <button onClick={startDiagnosis} disabled={!hostname.trim()}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
              hostname.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25' : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}>
            <Play size={16} /> {checkSoftware || checkServices ? 'Daten laden & Diagnose vorbereiten' : 'Vollständige Diagnose starten'}
          </button>
        </div>
      )}

      {/* ── Pre-loading ────────────────────────────────────────────── */}
      {phase === 'preload' && (
        <div className="flex items-center gap-3 p-5">
          <Loader size={20} className="animate-spin text-primary" />
          <span className="text-sm text-foreground">
            Lade {checkSoftware && checkServices ? 'Software & Dienste' : checkSoftware ? 'installierte Software' : 'Dienste'} von {hostname.trim()}...
          </span>
        </div>
      )}

      {/* ── Pre-selection (Software + Services) ────────────────────── */}
      {phase === 'preselect' && (
        <div className="space-y-4">
          {/* Software selection */}
          {checkSoftware && swList.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Monitor size={14} className="text-primary" />
                  Software auswählen ({swSelected.size} von {swList.length})
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => { const filtered = swList.filter(s => !swFilter || s.DisplayName.toLowerCase().includes(swFilter.toLowerCase())).map(s => s.DisplayName); setSwSelected(prev => { const n = new Set(prev); filtered.forEach(f => n.add(f)); return n }) }}
                    className="text-[10px] text-primary hover:text-primary/80">Alle sichtbaren</button>
                  <button onClick={() => setSwSelected(new Set())}
                    className="text-[10px] text-muted-foreground hover:text-foreground">Keine</button>
                </div>
              </div>
              <input type="text" placeholder="Software filtern..." value={swFilter}
                onChange={e => setSwFilter(e.target.value)}
                className="w-full px-2 py-1 text-[11px] rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
              <div className="max-h-48 overflow-y-auto space-y-0.5 border border-border rounded-md p-1">
                {swList
                  .filter(s => !swFilter || s.DisplayName.toLowerCase().includes(swFilter.toLowerCase()))
                  .map((sw, idx) => (
                    <label key={idx} className={`flex items-center gap-2 px-2 py-0.5 rounded cursor-pointer hover:bg-accent/30 ${swSelected.has(sw.DisplayName) ? 'bg-primary/5' : ''}`}>
                      <input type="checkbox" checked={swSelected.has(sw.DisplayName)}
                        onChange={e => setSwSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(sw.DisplayName) : n.delete(sw.DisplayName); return n })}
                        className="w-3 h-3 rounded accent-primary shrink-0" />
                      <span className="text-[11px] text-foreground flex-1 truncate">{sw.DisplayName}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0">{sw.DisplayVersion}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}

          {/* Services selection */}
          {checkServices && svcList.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <RefreshCw size={14} className="text-blue-400" />
                  Dienste auswählen ({svcSelected.size} von {svcList.length})
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => { const filtered = svcList.filter(s => !svcFilter || s.DisplayName.toLowerCase().includes(svcFilter.toLowerCase()) || s.Name.toLowerCase().includes(svcFilter.toLowerCase())).map(s => s.Name); setSvcSelected(prev => { const n = new Set(prev); filtered.forEach(f => n.add(f)); return n }) }}
                    className="text-[10px] text-primary hover:text-primary/80">Alle sichtbaren</button>
                  <button onClick={() => { const stopped = svcList.filter(s => s.Status !== 'Running' && s.StartType === 'Automatic').map(s => s.Name); setSvcSelected(new Set(stopped)) }}
                    className="text-[10px] text-amber-400 hover:text-amber-300">Nur gestoppte Auto-Dienste</button>
                  <button onClick={() => setSvcSelected(new Set())}
                    className="text-[10px] text-muted-foreground hover:text-foreground">Keine</button>
                </div>
              </div>
              <input type="text" placeholder="Dienst filtern..." value={svcFilter}
                onChange={e => setSvcFilter(e.target.value)}
                className="w-full px-2 py-1 text-[11px] rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
              <div className="max-h-48 overflow-y-auto space-y-0.5 border border-border rounded-md p-1">
                {svcList
                  .filter(s => !svcFilter || s.DisplayName.toLowerCase().includes(svcFilter.toLowerCase()) || s.Name.toLowerCase().includes(svcFilter.toLowerCase()))
                  .map((svc, idx) => {
                    const isRunning = svc.Status === 'Running'
                    const isStopped = svc.Status === 'Stopped'
                    const isAuto = svc.StartType === 'Automatic' || svc.StartType === 'Automatic (Delayed Start)'
                    const stoppedAuto = isStopped && isAuto
                    return (
                      <label key={idx} className={`flex items-center gap-2 px-2 py-0.5 rounded cursor-pointer hover:bg-accent/30 ${svcSelected.has(svc.Name) ? 'bg-primary/5' : ''} ${stoppedAuto ? 'bg-red-500/5' : ''}`}>
                        <input type="checkbox" checked={svcSelected.has(svc.Name)}
                          onChange={e => setSvcSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(svc.Name) : n.delete(svc.Name); return n })}
                          className="w-3 h-3 rounded accent-primary shrink-0" />
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-emerald-400' : isStopped ? 'bg-red-400' : 'bg-amber-400'}`} />
                        <span className="text-[11px] text-foreground flex-1 truncate" title={svc.Name}>{svc.DisplayName || svc.Name}</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${isRunning ? 'text-emerald-400 bg-emerald-500/10' : isStopped ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                          {svc.Status}
                        </span>
                        <span className="text-[8px] text-muted-foreground shrink-0">{svc.StartType === 'Automatic' ? 'Auto' : svc.StartType === 'Automatic (Delayed Start)' ? 'Auto (V)' : svc.StartType === 'Manual' ? 'Manuell' : svc.StartType}</span>
                      </label>
                    )
                  })}
              </div>
              <p className="text-[9px] text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />Läuft
                <span className="inline-block w-2 h-2 rounded-full bg-red-400 ml-3 mr-1" />Gestoppt
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 ml-3 mr-1" />Andere
                {' — '}{svcList.filter(s => s.Status === 'Stopped' && (s.StartType === 'Automatic' || s.StartType === 'Automatic (Delayed Start)')).length} Auto-Dienste gestoppt
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={() => { setPhase('idle'); setCheckSoftware(false); setCheckServices(false) }}
              className="px-4 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
              Zurück
            </button>
            <button onClick={() => { setSwSelected(new Set()); setSvcSelected(new Set()); startDiagnosisDirect() }}
              className="px-4 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
              Ohne Auswahl starten
            </button>
            <button onClick={startDiagnosisDirect}
              className="flex items-center gap-2 px-6 py-2 rounded-lg font-semibold text-xs bg-primary text-primary-foreground hover:bg-primary/90">
              <Play size={14} /> Diagnose starten
              {(swSelected.size > 0 || svcSelected.size > 0) && ` (${swSelected.size} Apps, ${svcSelected.size} Dienste)`}
            </button>
          </div>
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
              <div className="ml-auto flex items-center gap-2">
                <button onClick={exportPdf}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20">
                  <Download size={12} /> Als PDF speichern
                </button>
                {lastPdfPath && (
                  <button onClick={openLastPdf}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">
                    <FileText size={12} /> PDF öffnen
                  </button>
                )}
                <button onClick={() => { setPhase('idle'); setAreas([]); setLastPdfPath(null) }}
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
                {expandedAreas.has(a.id) && (
                  <div className="px-4 pb-3 space-y-2">
                    {/* Per-finding detail for this area */}
                    {a.findings.length > 0 && (
                      <div className="space-y-1">
                        {a.findings.map(f => (
                          <div key={f.id} className={`flex items-start gap-2 px-2 py-1.5 rounded text-[10px] ${
                            f.severity === 'critical' ? 'bg-red-500/5' : f.severity === 'warning' ? 'bg-amber-500/5' : 'bg-blue-500/5'
                          }`}>
                            {sevIcon(f.severity)}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground">{f.title}</p>
                              <p className="text-muted-foreground mt-0.5">{f.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {a.findings.length === 0 && (
                      <p className="text-[10px] text-emerald-400 flex items-center gap-1 px-2 py-1"><CheckCircle size={10} /> Keine Probleme gefunden</p>
                    )}
                    {/* Raw output toggle */}
                    {a.rawOutput && (
                      <details className="text-[9px]">
                        <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Rohdaten anzeigen</summary>
                        <pre className="mt-1 p-2 rounded bg-muted/20 text-muted-foreground max-h-40 overflow-auto font-mono whitespace-pre-wrap">{a.rawOutput}</pre>
                      </details>
                    )}
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
