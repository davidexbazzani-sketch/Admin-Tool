// ── Xelion Installation Store ────────────────────────────────────────────────
// Installiert Xelion (MSIX/.appinstaller) silent aus der Ferne:
//   1. .appinstaller-Datei via UNC-Admin-Share auf den Zielrechner kopieren
//   2. Add-AppxPackage als ANGEMELDETER Benutzer (Scheduled Task) ausfuehren
//      (MSIX-Apps installieren pro Benutzer, daher im User-Kontext)
//   3. Log-Datei via UNC pollen, Schritt-Status aktualisieren
//
// Polling laeuft window-level (ueberlebt Menuewechsel) — wie der SolidWorks-Store.

import { create } from 'zustand'
import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'

type StepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped'
type Phase = 'idle' | 'running' | 'done' | 'error'

interface XelionInstallState {
  phase: Phase
  hostname: string
  startTime: number
  logLines: string[]
  stepStatus: Record<string, StepStatus>
  errorMsg: string
  startInstall: (hostname: string, installerContent: string) => void
  reset: () => void
}

export const XELION_STEPS = [
  { id: '0', label: 'Vorbereitung' },
  { id: '1', label: 'Installer auf Zielrechner kopieren' },
  { id: '2', label: 'Xelion installieren (silent, im Benutzerkontext)' },
  { id: '3', label: 'Installation pruefen' },
]

const PKG_NAME = 'XelionWindowsDesktop'

let _pollTimer: ReturnType<typeof setInterval> | null = null
let _hostname = ''
let _logUnc = ''
let _lastLineCount = 0
let _pollStartTime = 0
let _taskName = ''

function stopPolling() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null } }

function addLogLine(msg: string) {
  const ts = new Date().toLocaleTimeString('de-DE')
  useXelionInstallStore.setState(s => ({ logLines: [...s.logLines, `[${ts}] ${msg}`] }))
}
function setStep(step: string, status: StepStatus) {
  useXelionInstallStore.setState(s => ({ stepStatus: { ...s.stepStatus, [step]: status } }))
}

// PowerShell-Skript, das auf dem Zielrechner laeuft (im User-Kontext).
function buildScript(appInstallerPath: string): string {
  return [
    'function Write-StepLog {',
    '  param([string]$Step,[string]$Status,[string]$Message)',
    '  $obj = @{ step=$Step; status=$Status; message=$Message; timestamp=(Get-Date).ToString("o") } | ConvertTo-Json -Compress',
    '  Write-Output "##TOOLLOG##$obj"',
    '}',
    'Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force',
    '$ErrorActionPreference = "Continue"',
    `Write-StepLog -Step "2" -Status "start" -Message "Xelion wird installiert (silent) auf $env:COMPUTERNAME"`,
    '# Laufendes Xelion beenden (ersetzt -ForceApplicationShutdown, das mit -AppInstallerFile nicht erlaubt ist)',
    'try { Get-Process -Name "Xelion*" -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue } catch {}',
    'try {',
    `  Add-AppxPackage -AppInstallerFile "${appInstallerPath}" -ErrorAction Stop`,
    '  Write-StepLog -Step "2" -Status "success" -Message "Add-AppxPackage abgeschlossen"',
    '} catch {',
    '  Write-StepLog -Step "2" -Status "error" -Message ("Installation fehlgeschlagen: " + $_.Exception.Message)',
    '}',
    'Write-StepLog -Step "3" -Status "start" -Message "Pruefe Installation"',
    `$pkg = Get-AppxPackage -Name "${PKG_NAME}" -ErrorAction SilentlyContinue`,
    'if ($pkg) {',
    '  Write-StepLog -Step "3" -Status "success" -Message ("Xelion installiert: Version " + $pkg.Version)',
    '} else {',
    '  Write-StepLog -Step "3" -Status "warning" -Message "Xelion-Paket nach Installation nicht gefunden (laeuft Download evtl. noch?)"',
    '}',
    `Write-StepLog -Step "0" -Status "complete" -Message "Fertig auf $env:COMPUTERNAME"`,
  ].join('\n')
}

async function pollOnce() {
  const store = useXelionInstallStore.getState()
  if (store.phase !== 'running') { stopPolling(); return }
  if (Date.now() - _pollStartTime > 30 * 60 * 1000) {
    useXelionInstallStore.setState({ phase: 'error', errorMsg: 'Timeout (30 min)' })
    stopPolling(); return
  }
  try {
    const res = await api().runPowerShell(`if (Test-Path '${_logUnc}') { Get-Content '${_logUnc}' } else { 'NOLOG' }`, 15000)
    if (res.stdout.trim() === 'NOLOG') return
    const lines = res.stdout.split('\n').filter((l: string) => l.trim())
    const newLines = lines.slice(_lastLineCount)
    _lastLineCount = lines.length
    for (const line of newLines) {
      const m = line.match(/##TOOLLOG##(.+)/)
      if (!m) { if (line.trim()) addLogLine(line.trim()); continue }
      try {
        const p = JSON.parse(m[1]) as { step: string; status: string; message: string }
        if (p.status === 'start') setStep(p.step, 'running')
        else if (p.status === 'success') setStep(p.step, 'success')
        else if (p.status === 'warning') setStep(p.step, 'warning')
        else if (p.status === 'error') { setStep(p.step, 'error'); useXelionInstallStore.setState({ phase: 'error', errorMsg: p.message }) }
        else if (p.status === 'complete') {
          useXelionInstallStore.setState({ phase: 'done' })
          addLogLine('Xelion-Installation abgeschlossen.')
          stopPolling()
          // Aufraeumen: Temp-Dateien + Scheduled Task entfernen
          try {
            const tmp = `\\\\${_hostname}\\C$\\Windows\\Temp`
            await api().runPowerShell(
              `Remove-Item '${tmp}\\itadmintool_xelion_*' -Force -EA SilentlyContinue; ` +
              `Invoke-Command -ComputerName '${_hostname}' -ScriptBlock { Get-ScheduledTask | Where-Object TaskName -like 'ITAdminXelion_*' | Unregister-ScheduledTask -Confirm:$false -EA SilentlyContinue } -EA SilentlyContinue`,
              15000,
            )
          } catch { /* ok */ }
          return
        }
        addLogLine(`[Schritt ${p.step}] ${p.status}: ${p.message}`)
      } catch { addLogLine(line.trim()) }
    }
  } catch { /* stiller Retry */ }
}

export const useXelionInstallStore = create<XelionInstallState>((set) => ({
  phase: 'idle',
  hostname: '',
  startTime: 0,
  logLines: [],
  stepStatus: {},
  errorMsg: '',

  reset: () => { stopPolling(); set({ phase: 'idle', hostname: '', startTime: 0, logLines: [], stepStatus: {}, errorMsg: '' }) },

  startInstall: async (hostname: string, installerContent: string) => {
    stopPolling()
    set({ phase: 'running', hostname, startTime: Date.now(), logLines: [], stepStatus: {}, errorMsg: '' })
    _hostname = hostname
    _lastLineCount = 0
    _pollStartTime = Date.now()

    const ts = Date.now()
    const appInstallerPath = `C:\\Windows\\Temp\\itadmintool_xelion_${ts}.appinstaller`
    const scriptPath = `C:\\Windows\\Temp\\itadmintool_xelion_${ts}.ps1`
    const wrapperPath = `C:\\Windows\\Temp\\itadmintool_xelion_${ts}_run.ps1`
    const logPath = `C:\\Windows\\Temp\\itadmintool_xelion_${ts}.log`
    _logUnc = `\\\\${hostname}\\C$\\Windows\\Temp\\itadmintool_xelion_${ts}.log`
    _taskName = `ITAdminXelion_${ts}`

    try {
      setStep('0', 'running')
      // WinRM auf dem Zielrechner sicherstellen (per RPC/SMB) — wie bei Remote Doc.
      addLogLine('WinRM auf Zielrechner wird aktiviert/geprueft...')
      const winrmOk = await ensureWinRM(hostname)
      if (!winrmOk) throw new Error('WinRM konnte auf dem Zielrechner nicht aktiviert werden — Service nicht erreichbar oder Berechtigungen fehlen.')
      addLogLine('WinRM aktiv.')

      const uncDir = `\\\\${hostname}\\C$\\Windows\\Temp`
      const script = buildScript(appInstallerPath)

      // Inhalte Base64-kodiert uebertragen (vermeidet Escaping-Probleme).
      const enc = (s: string) => btoa(unescape(encodeURIComponent(s)))
      const appB64 = enc(installerContent)
      const scriptB64 = enc(script)
      const wrapper = `powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${scriptPath}" | Out-File -FilePath "${logPath}" -Encoding UTF8 -Force`
      const wrapperB64 = enc(wrapper)

      setStep('0', 'success')
      setStep('1', 'running')
      addLogLine('Installer + Skript werden auf den Zielrechner kopiert...')

      const copyCmd = [
        `$uncDir = '${uncDir}'`,
        `if (!(Test-Path $uncDir)) { throw "Admin-Share nicht erreichbar: $uncDir" }`,
        `[System.IO.File]::WriteAllBytes('${uncDir}\\itadmintool_xelion_${ts}.appinstaller', [System.Convert]::FromBase64String('${appB64}'))`,
        `[System.IO.File]::WriteAllText('${uncDir}\\itadmintool_xelion_${ts}.ps1', [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${scriptB64}')), [System.Text.Encoding]::UTF8)`,
        `[System.IO.File]::WriteAllText('${uncDir}\\itadmintool_xelion_${ts}_run.ps1', [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${wrapperB64}')), [System.Text.Encoding]::UTF8)`,
        `if (Test-Path '${uncDir}\\itadmintool_xelion_${ts}.appinstaller') { Write-Output 'OK' } else { throw 'Kopie fehlgeschlagen' }`,
      ].join('\n')
      const copyRes = await api().runPowerShell(copyCmd, 60000)
      if (!copyRes.stdout.includes('OK')) throw new Error(`Kopie fehlgeschlagen: ${copyRes.stderr || copyRes.stdout}`)
      setStep('1', 'success')
      addLogLine('Dateien kopiert.')

      // Scheduled Task als ANGEMELDETER Benutzer (MSIX = pro Benutzer).
      addLogLine('Scheduled Task wird im Benutzerkontext erstellt und gestartet...')
      const createTaskCmd = [
        `Invoke-Command -ComputerName '${hostname}' -ScriptBlock {`,
        `  param($tn,$wp)`,
        `  # Angemeldeten Benutzer robust ermitteln (Konsole, sonst explorer.exe-Besitzer = auch RDP/Zweit-Session)`,
        `  $loggedOnUser = (Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue).UserName`,
        `  if (-not $loggedOnUser) { try { $loggedOnUser = (Get-Process -IncludeUserName -Name explorer -EA Stop | Select-Object -First 1 -ExpandProperty UserName) } catch {} }`,
        `  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-ExecutionPolicy Bypass -NoProfile -File $wp"`,
        `  if ($loggedOnUser) {`,
        `    $principal = New-ScheduledTaskPrincipal -UserId $loggedOnUser -RunLevel Highest -LogonType Interactive`,
        `  } else {`,
        `    # Kein interaktiver Benutzer erkannt — Task laeuft als SYSTEM (best effort)`,
        `    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest`,
        `  }`,
        `  Register-ScheduledTask -TaskName $tn -Action $action -Principal $principal -Force | Out-Null`,
        `  Start-ScheduledTask -TaskName $tn`,
        `  if ($loggedOnUser) { Write-Output "STARTED:$loggedOnUser" } else { Write-Output 'STARTED:SYSTEM' }`,
        `} -ArgumentList '${_taskName}','${wrapperPath}' -EA Stop`,
      ].join('\n')
      const taskRes = await api().runPowerShell(createTaskCmd, 30000)
      if (!taskRes.stdout.includes('STARTED')) {
        addLogLine(`Task-Ausgabe: ${taskRes.stdout.trim()} | ${taskRes.stderr.trim()}`)
      } else {
        const runAs = taskRes.stdout.split('STARTED:')[1]?.trim() || 'Benutzer'
        addLogLine(runAs === 'SYSTEM'
          ? 'Kein interaktiver Benutzer erkannt — Installation laeuft als SYSTEM (best effort).'
          : `Task gestartet als: ${runAs}`)
      }

      addLogLine('Installation laeuft auf dem Zielrechner. Polling aktiv (bleibt bei Menuewechsel bestehen).')
      _pollTimer = setInterval(pollOnce, 4000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ phase: 'error', errorMsg: msg })
      addLogLine(`FEHLER: ${msg}`)
    }
  },
}))
