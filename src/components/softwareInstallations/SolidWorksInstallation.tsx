import { useState, useEffect, useRef } from 'react'
import {
  Wrench, Play, AlertTriangle, CheckCircle, XCircle, Loader, Info,
  Clock, Terminal, ChevronDown, RefreshCw, Square, Eye,
} from 'lucide-react'
import { api } from '../../electronAPI'
import { createLogger } from '../../utils/activityLogger'
import { pathService } from '../../services/pathService'
import { useSwInstallStore } from '../../store/swInstallStore'
import Card from '../Card'

const log = createLogger('software-installations')

// ── AD Groups ────────────────────────────────────────────────────────────────

interface AdGroup {
  id: string
  label: string
  groupName: string
}

const AD_GROUPS: AdGroup[] = [
  { id: 'abd', label: 'Abdichtung (ABD = S212)', groupName: 'CORP\\FS_W3143_Solidworks PortaX Marine_ABD' },
  { id: 'fue', label: 'Fertigung & Entwicklung (FUE = S211)', groupName: 'CORP\\FS_W3143_Solidworks PortaX Marine_FUE' },
  { id: 'lager', label: 'Lager (S27 & S214)', groupName: 'CORP\\FS_W3143_Solidworks PortaX Marine_LAGER' },
  { id: 'stabi', label: 'Stabilisatoren & Rudermaschinen (S31 & S33)', groupName: 'CORP\\FS_W3143_Solidworks PortaX Marine_STABI' },
]

// ── Step definitions ─────────────────────────────────────────────────────────

interface StepDef {
  id: string
  label: string
  estMinutes?: number
}

const STEPS: StepDef[] = [
  { id: '0', label: 'Setup-Prozess starten' },
  { id: '2', label: 'Lokale Admin-Gruppen hinzufuegen' },
  { id: '3', label: 'Intranetzone setzen' },
  { id: '4', label: 'UAC konfigurieren' },
  { id: '5', label: 'Netzlaufwerke I: + G: mappen + SolidWorks-Mapping' },
  { id: '6', label: 'Robocopy SolidWorks-Verzeichnis', estMinutes: 70 },
  { id: '7', label: 'Spracheinstellungen' },
  { id: '8', label: 'Energieoptionen + Hoechstleistung' },
  { id: '9', label: 'Windows Updates (optional)' },
  { id: '10', label: 'HP Image Assistant (optional)' },
  { id: '11', label: 'SolidWorks installieren (silent)', estMinutes: 60 },
]

type StepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped'

// ── PowerShell script generator ──────────────────────────────────────────────

function generateScript(opts: {
  groups: string[]
  enableUac: boolean
  enableLanguage: boolean
  enableUpdates: boolean
  enableHpia: boolean
  mode: 'unc' | 'drive'
}): string {
  // ALWAYS use UNC paths — the script runs as SYSTEM via Scheduled Task,
  // which has NO drive letter mappings (I:, G: etc.)
  const marineRoot = pathService.getMarineRoot('unc')
  const mappingScript = pathService.getSoftwarePath('solidworks', 'swMappingScript', 'unc')
  const robocopyBat = pathService.getSoftwarePath('solidworks', 'robocopyFallback', 'unc')
  const hpiaPath = pathService.getSoftwarePath('solidworks', 'hpiaInstaller', 'unc')
  const regHost = pathService.getDomain('intranetRegistryHost')
  const adminImageSub = pathService.getSoftwarePath('solidworks', 'adminImageSubfolder')
  const appServer = pathService.getDomain('appServer')
  const corpDomain = pathService.getDomain('corpDomain')
  const portaxUNC = `\\\\${appServer}.${corpDomain}\\PortaX`

  const groupsList = opts.groups.map(g => `    "${g.replace(/"/g, '""')}"`).join(',\n')

  const uacBlock = opts.enableUac ? `
Write-StepLog -Step "4" -Status "start" -Message "UAC konfigurieren"
Set-ItemProperty -Path "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "ConsentPromptBehaviorAdmin" -Value 0
Set-ItemProperty -Path "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "PromptOnSecureDesktop" -Value 0
Write-StepLog -Step "4" -Status "success" -Message "UAC auf nie benachrichtigen gesetzt"
` : `Write-StepLog -Step "4" -Status "info" -Message "UAC-Aenderung uebersprungen"`

  const langBlock = opts.enableLanguage ? `
Write-StepLog -Step "7" -Status "start" -Message "Spracheinstellungen"
$lang = "de-DE"
$list = Get-WinUserLanguageList
if ($list.LanguageTag -notcontains $lang) { $list.Add($lang); Set-WinUserLanguageList $list -Force }
Set-WinSystemLocale $lang
Set-WinHomeLocation -GeoId 94
Set-WinUILanguageOverride -Language $lang
Set-Culture $lang
Write-StepLog -Step "7" -Status "success" -Message "Sprache auf Deutsch gesetzt"
` : `Write-StepLog -Step "7" -Status "info" -Message "Spracheinstellungen uebersprungen"`

  const updatesBlock = opts.enableUpdates ? `
Write-StepLog -Step "9" -Status "start" -Message "Windows Updates"
if (!(Get-Module -ListAvailable PSWindowsUpdate)) {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Confirm:$false
    Install-Module PSWindowsUpdate -Force -SkipPublisherCheck -Confirm:$false -Scope AllUsers
  } catch { Write-StepLog -Step "9" -Status "warning" -Message "PSWindowsUpdate Install: $($_.Exception.Message)" }
}
Import-Module PSWindowsUpdate -ErrorAction SilentlyContinue
if (Get-Command Get-WindowsUpdate -ErrorAction SilentlyContinue) {
  Get-WindowsUpdate -AcceptAll -Install -AutoReboot:$false
}
Write-StepLog -Step "9" -Status "success" -Message "Windows Updates verarbeitet"
` : `Write-StepLog -Step "9" -Status "info" -Message "Windows Updates uebersprungen"`

  const hpiaBlock = opts.enableHpia ? `
Write-StepLog -Step "10" -Status "start" -Message "HP Image Assistant"
$hpiaExe = "${hpiaPath}"
if (Test-Path $hpiaExe) {
  Start-Process $hpiaExe -Wait
  Write-StepLog -Step "10" -Status "success" -Message "HPIA ausgefuehrt"
} else {
  Write-StepLog -Step "10" -Status "warning" -Message "HPIA nicht gefunden: $hpiaExe"
}
` : `Write-StepLog -Step "10" -Status "info" -Message "HP Image Assistant uebersprungen"`

  return `
function Write-StepLog {
  param([string]$Step, [string]$Status, [string]$Message)
  $ts = (Get-Date).ToString("o")
  $obj = @{ step = $Step; status = $Status; message = $Message; timestamp = $ts } | ConvertTo-Json -Compress
  Write-Output "##TOOLLOG##$obj"
}

Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
$ErrorActionPreference = "Continue"

Write-StepLog -Step "0" -Status "start" -Message "Setup gestartet auf $env:COMPUTERNAME"

# --- 2. LOKALE ADMINISTRATOREN ---
Write-StepLog -Step "2" -Status "start" -Message "Lokale Admin-Gruppen"
$adminGroup = Get-LocalGroup -SID "S-1-5-32-544"
$groupsToAdd = @(
${groupsList}
)
foreach ($g in $groupsToAdd) {
  try {
    $m = Get-LocalGroupMember -Group $adminGroup -ErrorAction SilentlyContinue
    if ($m.Name -contains $g) { Write-StepLog -Step "2" -Status "info" -Message "Bereits vorhanden: $g" }
    else { Add-LocalGroupMember -Group $adminGroup -Member $g -ErrorAction Stop; Write-StepLog -Step "2" -Status "info" -Message "Hinzugefuegt: $g" }
  } catch { Write-StepLog -Step "2" -Status "warning" -Message "Fehler bei $g : $($_.Exception.Message)" }
}
Write-StepLog -Step "2" -Status "success" -Message "Admin-Gruppen verarbeitet"

# --- 3. INTRANETZONE ---
Write-StepLog -Step "3" -Status "start" -Message "Intranetzone"
$rp = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\ZoneMap\\Domains\\skf.net\\${regHost}"
if (!(Test-Path $rp)) { New-Item -Path $rp -Force | Out-Null }
Set-ItemProperty -Path $rp -Name "file" -Value 1 -Type DWord
Write-StepLog -Step "3" -Status "success" -Message "Intranetzone gesetzt"

# --- 4. UAC ---
${uacBlock}

# --- 5. NETZLAUFWERKE I: + G: MAPPEN ---
Write-StepLog -Step "5" -Status "start" -Message "Netzlaufwerke I: und G: mappen"
$nw = "${marineRoot}"
$portax = "${portaxUNC}"
$startup = "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp"

# Laufwerk I: (SKF Marine)
"net use I: " + '"' + "$nw" + '"' + " /persistent:yes" | Out-File "$startup\\MapI.bat" -Encoding ASCII
if (!(Get-PSDrive -Name I -ErrorAction SilentlyContinue)) {
  try { New-PSDrive -Name I -PSProvider FileSystem -Root $nw -Persist -ErrorAction Stop; Write-StepLog -Step "5" -Status "info" -Message "I: gemappt auf $nw" }
  catch { net use I: "$nw" /persistent:yes 2>$null; Write-StepLog -Step "5" -Status "info" -Message "I: gemappt via net use" }
}

# Laufwerk G: (PortaX - wichtig fuer SolidWorks Toolbox)
"net use G: " + '"' + "$portax" + '"' + " /persistent:yes" | Out-File "$startup\\MapG.bat" -Encoding ASCII
if (!(Get-PSDrive -Name G -ErrorAction SilentlyContinue)) {
  try { New-PSDrive -Name G -PSProvider FileSystem -Root $portax -Persist -ErrorAction Stop; Write-StepLog -Step "5" -Status "info" -Message "G: gemappt auf $portax" }
  catch { net use G: "$portax" /persistent:yes 2>$null; Write-StepLog -Step "5" -Status "info" -Message "G: gemappt via net use" }
}

# SolidWorks Mapping.bat in Startup kopieren
$swMap = "${mappingScript}"
if (Test-Path $swMap) {
  Copy-Item $swMap -Destination "$startup\\Mapping.bat" -Force
  Write-StepLog -Step "5" -Status "info" -Message "Mapping.bat in Startup kopiert"
} else {
  # Mapping.bat manuell erstellen als Fallback
  $mapContent = "net use I: ""$nw"" /persistent:yes" + [char]13 + [char]10 + "net use G: ""$portax"" /persistent:yes"
  $mapContent | Out-File "$startup\\Mapping.bat" -Encoding ASCII
  Write-StepLog -Step "5" -Status "info" -Message "Mapping.bat manuell erstellt (Fallback)"
}
Write-StepLog -Step "5" -Status "success" -Message "Netzlaufwerke I: und G: konfiguriert"

# --- 6. ROBOCOPY ---
# Robocopy wird VOM ADMIN-PC ausgefuehrt (nicht hier im Skript auf dem Zielrechner)
# weil der Scheduled Task keinen Zugriff auf Netzwerk-Shares hat.
# Das Tool kopiert die Dateien ueber den UNC-Admin-Share direkt.
Write-StepLog -Step "6" -Status "info" -Message "Robocopy wird vom Admin-PC gesteuert (Netzwerk-Zugriff)"
if (!(Test-Path "C:\\TEMP")) { New-Item -Path "C:\\TEMP" -ItemType Directory | Out-Null }
if (Test-Path "C:\\TEMP\\${adminImageSub}\\startswinstall.exe") {
  Write-StepLog -Step "6" -Status "success" -Message "SolidWorks-Verzeichnis bereits vorhanden in C:\\TEMP\\${adminImageSub}"
} else {
  Write-StepLog -Step "6" -Status "info" -Message "Warte auf Robocopy vom Admin-PC..."
}

# --- 7. SPRACHE ---
${langBlock}

# --- 8. ENERGIEOPTIONEN ---
Write-StepLog -Step "8" -Status "start" -Message "Energieoptionen"
powercfg /change monitor-timeout-ac 0; powercfg /change monitor-timeout-dc 0
powercfg /change standby-timeout-ac 0; powercfg /change standby-timeout-dc 0
powercfg /change disk-timeout-ac 0; powercfg /change disk-timeout-dc 0
powercfg /change hibernate-timeout-ac 0; powercfg /change hibernate-timeout-dc 0
try { powercfg -duplicatescheme 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null; powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c } catch {}
Write-StepLog -Step "8" -Status "success" -Message "Energieoptionen + Hoechstleistung"

# --- 9. UPDATES ---
${updatesBlock}

# --- 10. HPIA ---
${hpiaBlock}

# --- 11. SOLIDWORKS INSTALLIEREN ---
Write-StepLog -Step "11" -Status "start" -Message "SolidWorks Silent Install"
$imgDir = "C:\\TEMP\\${adminImageSub}"
$swExe = Join-Path $imgDir "StartSWInstall.exe"
if (Test-Path $swExe) {
  # Load UI automation assemblies for auto-clicking the countdown dialog.
  try {
    Add-Type -AssemblyName System.Windows.Forms -EA SilentlyContinue
    Add-Type -AssemblyName Microsoft.VisualBasic -EA SilentlyContinue
  } catch {}

  # Start StartSWInstall.exe without -Wait — we need to drive a polling loop
  # to (a) auto-click the SOLIDWORKS Installations-Manager countdown dialog and
  # (b) detect end-of-installation by watching the actual installer processes
  # (sldim.exe / setup.exe / msiexec.exe). StartSWInstall.exe itself is just a
  # launcher and may exit early while the real installer keeps running.
  $startedAt = Get-Date
  $p = Start-Process -FilePath $swExe -ArgumentList '/Install','/Now' -PassThru
  Write-StepLog -Step "11" -Status "info" -Message "StartSWInstall.exe gestartet (PID $($p.Id))"

  $autoOkClicked = $false
  $maxRunMin = 180
  $installerProcs = @('sldim','setup','msiexec','swCreateAI','InstallerCfg','sldIM')
  $lastSeenInstaller = Get-Date
  $exitedGraceSec = 90

  while (((Get-Date) - $startedAt).TotalMinutes -lt $maxRunMin) {
    Start-Sleep -Seconds 5

    # Auto-OK on the SOLIDWORKS countdown dialog (one-shot).
    if (-not $autoOkClicked) {
      try {
        $dlg = Get-Process -EA SilentlyContinue | Where-Object {
          $_.MainWindowTitle -and (
            $_.MainWindowTitle -like '*Installations-Manager*' -or
            $_.MainWindowTitle -like '*Installation Manager*' -or
            $_.MainWindowTitle -like 'SOLIDWORKS Installation*'
          )
        } | Select-Object -First 1
        if ($dlg) {
          [Microsoft.VisualBasic.Interaction]::AppActivate($dlg.Id) 2>$null | Out-Null
          Start-Sleep -Milliseconds 800
          [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
          $autoOkClicked = $true
          Write-StepLog -Step "11" -Status "info" -Message "Countdown-Dialog automatisch bestaetigt: '$($dlg.MainWindowTitle)'"
        }
      } catch {
        Write-StepLog -Step "11" -Status "info" -Message "Auto-OK Versuch: $($_.Exception.Message)"
      }
    }

    # Detect installer end: when none of the installer processes (and the
    # launcher) are running for more than the grace period, we are done.
    $running = Get-Process -Name $installerProcs -EA SilentlyContinue
    $startswActive = -not $p.HasExited
    if ($running -or $startswActive) {
      $lastSeenInstaller = Get-Date
    } else {
      $idleSec = ((Get-Date) - $lastSeenInstaller).TotalSeconds
      if ($idleSec -gt $exitedGraceSec) {
        Write-StepLog -Step "11" -Status "info" -Message "Keine Installer-Prozesse mehr seit $([int]$idleSec)s"
        break
      }
    }
  }

  $totalMin = [math]::Round(((Get-Date) - $startedAt).TotalMinutes, 1)
  if ($p.HasExited -and $p.ExitCode -ne 0) {
    Write-StepLog -Step "11" -Status "warning" -Message "SolidWorks-Installation beendet (Laufzeit: $totalMin min, Launcher-ExitCode $($p.ExitCode))"
  } else {
    Write-StepLog -Step "11" -Status "success" -Message "SolidWorks-Installation beendet (Laufzeit: $totalMin min)"
  }
} else {
  Write-StepLog -Step "11" -Status "error" -Message "StartSWInstall.exe nicht gefunden in $imgDir"
}

Write-StepLog -Step "0" -Status "complete" -Message "Setup komplett auf $env:COMPUTERNAME"
`
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function SolidWorksInstallation() {
  // Global store for installation (survives menu changes)
  const store = useSwInstallStore()
  const storePhase = store.phase
  const storeHostname = store.hostname
  const storeLogLines = store.logLines
  const storeStepStatus = store.stepStatus
  const storeStartTime = store.startTime
  const storeErrorMsg = store.errorMsg

  // Local form state (only for config phase)
  const [hostname, setHostname] = useState('')
  const [mode, setMode] = useState<'unc' | 'drive'>(pathService.preferredMode)
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [enableUac, setEnableUac] = useState(true)
  const [enableLanguage, setEnableLanguage] = useState(false)
  const [enableUpdates, setEnableUpdates] = useState(false)
  const [enableHpia, setEnableHpia] = useState(true)
  const [showLog, setShowLog] = useState(true)

  // Local UI state
  const [localPhase, setLocalPhase] = useState<'config' | 'prechecks'>('config')
  const [preChecks, setPreChecks] = useState<Record<string, 'pending' | 'ok' | 'fail' | 'loading'>>({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)

  // Determine effective phase: store takes priority if running/done/error
  const phase = storePhase !== 'idle' ? storePhase : localPhase
  const logLines = storePhase !== 'idle' ? storeLogLines : []
  const stepStatus = storePhase !== 'idle' ? storeStepStatus : {}
  const errorMsg = storePhase !== 'idle' ? storeErrorMsg : ''

  // Timer
  useEffect(() => {
    if (storePhase !== 'running') return
    const t = setInterval(() => setElapsed(Date.now() - storeStartTime), 1000)
    return () => clearInterval(t)
  }, [storePhase, storeStartTime])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  const hostnameValid = /^DE/i.test(hostname.trim())
  const groupsSelected = selectedGroups.size > 0
  const allPreChecksOk = Object.values(preChecks).every(v => v === 'ok')

  function toggleGroup(id: string) {
    setSelectedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selectAllGroups() {
    setSelectedGroups(new Set(AD_GROUPS.map(g => g.id)))
  }

  // ── Pre-checks ─────────────────────────────────────────────────────────────

  async function runPreChecks() {
    const h = hostname.trim()
    setLocalPhase('prechecks')
    const checks: Record<string, 'pending' | 'ok' | 'fail' | 'loading'> = {
      hostname: 'loading', ping: 'loading', remote: 'loading', disk: 'loading',
    }
    setPreChecks({ ...checks })

    // Hostname
    checks.hostname = hostnameValid ? 'ok' : 'fail'
    setPreChecks({ ...checks })

    // Ping
    try {
      const res = await api().runPowerShell(`if (Test-Connection -ComputerName '${h}' -Count 1 -Quiet) { 'OK' } else { 'FAIL' }`, 10000)
      checks.ping = res.stdout.trim() === 'OK' ? 'ok' : 'fail'
    } catch { checks.ping = 'fail' }
    setPreChecks({ ...checks })

    // Remote connection
    try {
      const res = await api().runPowerShell(`try { Invoke-Command -ComputerName '${h}' -ScriptBlock { $env:COMPUTERNAME } -EA Stop } catch { 'FAIL' }`, 15000)
      checks.remote = res.stdout.trim() !== 'FAIL' && res.exitCode === 0 ? 'ok' : 'fail'
    } catch { checks.remote = 'fail' }
    setPreChecks({ ...checks })

    // Disk space
    try {
      const res = await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ScriptBlock { (Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace / 1GB } -EA Stop`, 10000)
      const gb = parseFloat(res.stdout.trim())
      checks.disk = gb >= 30 ? 'ok' : 'fail'
    } catch { checks.disk = 'fail' }
    setPreChecks({ ...checks })
  }

  // ── Execute installation (via global store) ─────────────────────────────────

  function startInstallation() {
    setShowConfirm(false)
    const groups = AD_GROUPS.filter(g => selectedGroups.has(g.id)).map(g => g.groupName)
    const script = generateScript({ groups, enableUac, enableLanguage, enableUpdates, enableHpia, mode })
    store.startInstall(hostname.trim(), script)
    log('SolidWorks-Installation gestartet', `Zielrechner: ${hostname.trim()}`)
  }

  function fmtElapsed(ms: number): string {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Wrench size={22} className="text-blue-400" />
          <h2 className="text-lg font-bold text-foreground">SolidWorks 2024 SP5 Installation</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Automatisierte Ausfuehrung der Schritte 1-9 der offiziellen Installationsanleitung</p>
      </div>

      <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
        <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300">Diese Installation fuehrt die Schritte 1-9 automatisch aus. Schritt 10+ muss manuell durchgefuehrt werden (Checkliste am Ende).</p>
      </div>

      <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2.5">
        <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-xs text-yellow-300">Dauer: ca. 70-130 Minuten (Robocopy ~70 min, Installation ~60 min). Zielrechner muss eingeschaltet bleiben.</p>
      </div>

      {/* Configuration Phase */}
      {phase === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Konfiguration" icon={<Wrench size={15} />}>
            <div className="space-y-4">
              {/* Hostname */}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Hostname des Zielrechners *</label>
                <input value={hostname} onChange={e => setHostname(e.target.value)} placeholder="z.B. DEHAM12345678"
                  className={`w-full px-3 py-2 rounded-lg bg-background border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 ${hostname && !hostnameValid ? 'border-red-500/50' : 'border-border'}`} />
                {hostname && !hostnameValid && <p className="text-[10px] text-red-400 mt-1">Hostname muss mit DE beginnen</p>}
              </div>

              {/* Path mode */}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Pfad-Variante</label>
                <div className="flex gap-2">
                  {(['unc', 'drive'] as const).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border ${mode === m ? 'bg-primary/20 text-primary border-primary/40' : 'bg-muted/20 text-muted-foreground border-border hover:text-foreground'}`}>
                      {m === 'unc' ? 'UNC (\\\\w3172\\...)' : 'Laufwerk (I:\\, G:\\)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* AD Groups */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-muted-foreground font-medium">AD-Gruppen (Bereiche) *</label>
                  <button onClick={selectAllGroups} className="text-[10px] text-blue-400 hover:underline">Alle auswaehlen</button>
                </div>
                <div className="space-y-1">
                  {AD_GROUPS.map(g => (
                    <label key={g.id} className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:bg-muted/20 rounded px-2 py-1">
                      <input type="checkbox" checked={selectedGroups.has(g.id)} onChange={() => toggleGroup(g.id)} className="rounded accent-primary" />
                      {g.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Optional steps */}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Optionale Schritte</label>
                <div className="space-y-1">
                  {[
                    { label: 'UAC auf "nie benachrichtigen" setzen', checked: enableUac, set: setEnableUac },
                    { label: 'Sprache auf Deutsch umstellen', checked: enableLanguage, set: setEnableLanguage },
                    { label: 'Windows Updates installieren', checked: enableUpdates, set: setEnableUpdates },
                    { label: 'HP Image Assistant starten', checked: enableHpia, set: setEnableHpia },
                  ].map(opt => (
                    <label key={opt.label} className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:bg-muted/20 rounded px-2 py-1">
                      <input type="checkbox" checked={opt.checked} onChange={e => opt.set(e.target.checked)} className="rounded accent-primary" />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <button onClick={runPreChecks} disabled={!hostnameValid || !groupsSelected}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${hostnameValid && groupsSelected ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                  <Play size={14} />Verbindung pruefen
                </button>
              </div>
            </div>
          </Card>

          {/* Pre-checks result (appears after pressing check) */}
          <Card title="Uebersicht" icon={<Eye size={15} />}>
            <div className="text-xs text-muted-foreground space-y-2">
              <p><strong className="text-foreground">Zielrechner:</strong> {hostname || '-'}</p>
              <p><strong className="text-foreground">Pfad-Modus:</strong> {mode === 'unc' ? 'UNC' : 'Laufwerk'}</p>
              <p><strong className="text-foreground">AD-Gruppen:</strong> {selectedGroups.size === 0 ? 'keine' : AD_GROUPS.filter(g => selectedGroups.has(g.id)).map(g => g.label).join(', ')}</p>
              <p><strong className="text-foreground">Optionen:</strong> {[enableUac && 'UAC', enableLanguage && 'Sprache', enableUpdates && 'Updates', enableHpia && 'HPIA'].filter(Boolean).join(', ') || 'keine'}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Pre-checks Phase */}
      {phase === 'prechecks' && (
        <Card title="Vorab-Checks" icon={<CheckCircle size={15} />}>
          <div className="space-y-2">
            {[
              { key: 'hostname', label: 'Hostname beginnt mit DE' },
              { key: 'ping', label: 'Zielrechner online (Ping)' },
              { key: 'remote', label: 'Remote-Verbindung moeglich (WinRM)' },
              { key: 'disk', label: 'Mindestens 30 GB frei auf C:' },
            ].map(c => (
              <div key={c.key} className="flex items-center gap-2 text-xs">
                {preChecks[c.key] === 'loading' && <Loader size={14} className="animate-spin text-blue-400" />}
                {preChecks[c.key] === 'ok' && <CheckCircle size={14} className="text-green-400" />}
                {preChecks[c.key] === 'fail' && <XCircle size={14} className="text-red-400" />}
                {preChecks[c.key] === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-border" />}
                <span className="text-foreground">{c.label}</span>
              </div>
            ))}

            <div className="flex gap-2 pt-3 border-t border-border">
              <button onClick={() => setLocalPhase('config')} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border hover:text-foreground">Zurueck</button>
              <button onClick={() => setShowConfirm(true)} disabled={!allPreChecksOk}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${allPreChecksOk ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                <Play size={14} />Installation starten
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Running / Done / Error Phase — Step progress + Log */}
      {(phase === 'running' || phase === 'done' || phase === 'error') && (
        <>
          {/* Status header */}
          {phase === 'running' && (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
              <Loader size={18} className="animate-spin text-blue-400" />
              <div>
                <p className="text-sm font-semibold text-foreground">Installation laeuft auf {storeHostname || hostname}...</p>
                <p className="text-xs text-muted-foreground">Laufzeit: {fmtElapsed(elapsed)}</p>
              </div>
            </div>
          )}
          {phase === 'done' && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
              <CheckCircle size={18} className="text-green-400" />
              <p className="text-sm font-semibold text-foreground">SolidWorks-Installation auf {storeHostname || hostname} abgeschlossen ({fmtElapsed(elapsed)})</p>
            </div>
          )}
          {phase === 'error' && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <XCircle size={18} className="text-red-400" />
              <div>
                <p className="text-sm font-semibold text-foreground">Installation fehlgeschlagen</p>
                <p className="text-xs text-red-300 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Step progress */}
          <Card title="Schritt-Fortschritt" icon={<Clock size={15} />}>
            <div className="space-y-1">
              {STEPS.map(step => {
                const st = stepStatus[step.id] || 'pending'
                return (
                  <div key={step.id} className="flex items-center gap-2 text-xs py-0.5">
                    {st === 'running' && <Loader size={12} className="animate-spin text-blue-400" />}
                    {st === 'success' && <CheckCircle size={12} className="text-green-400" />}
                    {st === 'warning' && <AlertTriangle size={12} className="text-yellow-400" />}
                    {st === 'error' && <XCircle size={12} className="text-red-400" />}
                    {st === 'skipped' && <div className="w-3 h-3 rounded-full bg-muted" />}
                    {st === 'pending' && <div className="w-3 h-3 rounded-full border border-border" />}
                    <span className={st === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>{step.label}</span>
                    {step.estMinutes && st === 'running' && <span className="text-[10px] text-muted-foreground ml-auto">~{step.estMinutes} min</span>}
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Live Log */}
          {showLog && (
            <Card title="Live-Log" icon={<Terminal size={15} />}>
              <div ref={logRef} className="max-h-64 overflow-y-auto bg-background rounded-lg border border-border p-3 font-mono text-[11px] text-muted-foreground space-y-0.5">
                {logLines.length === 0 ? <p className="text-center py-4">Warte auf Output...</p> :
                  logLines.map((l, i) => <div key={i}>{l}</div>)
                }
              </div>
            </Card>
          )}

          {/* Post-installation checklist (only when done) */}
          {phase === 'done' && <PostInstallChecklist hostname={storeHostname || hostname} />}

          {/* Error actions */}
          {phase === 'error' && (
            <div className="flex gap-2">
              <button onClick={() => { store.reset(); setLocalPhase('config') }} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-foreground">Zurueck zur Konfiguration</button>
              <button onClick={startInstallation} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Erneut versuchen</button>
            </div>
          )}
        </>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowConfirm(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={20} className="text-yellow-400" />
              <h3 className="text-lg font-bold text-foreground">Installation starten?</h3>
            </div>
            <p className="text-sm text-foreground mb-3">Installation auf <strong>{hostname}</strong> starten?</p>
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 mb-3 space-y-1">
              <p><strong>Pfad-Modus:</strong> {mode}</p>
              <p><strong>AD-Gruppen:</strong> {AD_GROUPS.filter(g => selectedGroups.has(g.id)).map(g => g.label).join(', ')}</p>
              <p><strong>Geschaetzte Dauer:</strong> 70-130 Minuten</p>
            </div>
            <p className="text-[11px] text-yellow-400 mb-4">Der Vorgang kann nicht ohne Weiteres abgebrochen werden.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:bg-muted/20">Abbrechen</button>
              <button onClick={startInstallation} className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white">Installation starten</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Post-Install Checklist ───────────────────────────────────────────────────

function PostInstallChecklist({ hostname }: { hostname: string }) {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  function toggle(i: number) { setChecked(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n }) }

  const items = [
    'User am Zielrechner anmelden lassen. Klaeren: Abteilung? (Stabi / WK Lager / WK Abdichtung). PortaX benoetigt? Weitere Software?',
    `Don't Sleep aktivieren: ${pathService.getToolExecutable('dontSleep')} — auf "Bitte nicht schlafen" einstellen`,
    'Schritt 10: Ordner "Nach_der_Installation" oeffnen. Schritt 1+2 ausfuehren, dann jeweilige Abteilung.',
    'SolidWorks oeffnen > Zahnrad > Zusatzanwendungen > b)_install_user_Stabi... ausfuehren',
    `3D-Maus (falls vorhanden): 3D Connection anklicken. Treiber: ${pathService.getSoftwarePath('solidworks', 'driver3dConnexion')}`,
    'PortaX (falls noetig): Extras > PortaX > SAP R/3 Einloggen',
    'Stabi-Sonderfall: Datentraegererweiterung + Laufwerk D mit 100 GB. Bei Wellenkomponenten: KEINE Erweiterung.',
  ]

  const allDone = checked.size === items.length

  return (
    <Card title="Manuelle Schritte (Schritt 10+)" icon={<CheckCircle size={15} />} subtitle={`${hostname} — ${checked.size}/${items.length} erledigt`}>
      {allDone && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 mb-3">
          <CheckCircle size={14} className="text-green-400" />
          <p className="text-xs text-green-300 font-medium">Installation komplett abgeschlossen!</p>
        </div>
      )}
      <div className="space-y-2">
        {items.map((item, i) => (
          <label key={i} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-muted/10 rounded px-2 py-1">
            <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} className="mt-0.5 rounded accent-primary" />
            <span className={checked.has(i) ? 'text-muted-foreground line-through' : 'text-foreground'}>{item}</span>
          </label>
        ))}
      </div>
    </Card>
  )
}
