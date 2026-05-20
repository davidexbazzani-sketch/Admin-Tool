// ── SolidWorks Installation Store ─────────────────────────────────────────────
// The actual installation runs as a Scheduled Task on the target PC.
// This store only tracks the state and polls the log file.
// The polling runs via setInterval at the window level (not in React),
// so it survives component unmounts.

import { create } from 'zustand'
import { api } from '../electronAPI'
import { pathService } from '../services/pathService'

type StepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped'
type Phase = 'idle' | 'running' | 'done' | 'error'

interface SwInstallState {
  phase: Phase
  hostname: string
  startTime: number
  logLines: string[]
  stepStatus: Record<string, StepStatus>
  errorMsg: string

  startInstall: (hostname: string, script: string) => void
  reset: () => void
}

// Polling state lives OUTSIDE React and Zustand — at the window level
let _pollTimer: ReturnType<typeof setInterval> | null = null
let _remoteLogPath = ''
let _hostname = ''
let _lastLineCount = 0
let _pollStartTime = 0

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
}

function addLogLine(msg: string) {
  const ts = new Date().toLocaleTimeString('de-DE')
  useSwInstallStore.setState(s => ({ logLines: [...s.logLines, `[${ts}] ${msg}`] }))
}

async function pollOnce() {
  const store = useSwInstallStore.getState()
  if (store.phase !== 'running') { stopPolling(); return }

  // Timeout after 150 minutes
  if (Date.now() - _pollStartTime > 150 * 60 * 1000) {
    useSwInstallStore.setState({ phase: 'error', errorMsg: 'Timeout (150 min)' })
    stopPolling()
    return
  }

  try {
    // Read log via UNC admin share (faster + more reliable than Invoke-Command)
    const uncLog = `\\\\${_hostname}\\C$\\Windows\\Temp\\${_remoteLogPath.split('\\').pop()}`
    const res = await api().runPowerShell(
      `if (Test-Path '${uncLog}') { Get-Content '${uncLog}' } else { 'NOLOG' }`,
      15000
    )

    if (res.stdout.trim() === 'NOLOG') return

    const lines = res.stdout.split('\n').filter((l: string) => l.trim())
    const newLines = lines.slice(_lastLineCount)
    _lastLineCount = lines.length

    for (const line of newLines) {
      const m = line.match(/##TOOLLOG##(.+)/)
      if (m) {
        try {
          const p = JSON.parse(m[1])
          const step = p.step as string
          const status = p.status as string
          const msg = p.message as string

          if (status === 'start') useSwInstallStore.setState(s => ({ stepStatus: { ...s.stepStatus, [step]: 'running' } }))
          else if (status === 'success') useSwInstallStore.setState(s => ({ stepStatus: { ...s.stepStatus, [step]: 'success' } }))
          else if (status === 'warning') useSwInstallStore.setState(s => ({ stepStatus: { ...s.stepStatus, [step]: 'warning' } }))
          else if (status === 'error') useSwInstallStore.setState(s => ({ stepStatus: { ...s.stepStatus, [step]: 'error' } }))
          else if (status === 'complete') {
            useSwInstallStore.setState({ phase: 'done' })
            addLogLine('Installation erfolgreich abgeschlossen!')
            stopPolling()
            // Cleanup via UNC share + remote task removal
            try {
              const uncClean = `\\\\${_hostname}\\C$\\Windows\\Temp`
              await api().runPowerShell(
                `Remove-Item '${uncClean}\\itadmintool_sw_*' -Force -EA SilentlyContinue; Remove-Item '${uncClean}\\itadmintool_sw_*_run.ps1' -Force -EA SilentlyContinue; ` +
                `Invoke-Command -ComputerName '${_hostname}' -ScriptBlock { Get-ScheduledTask | Where TaskName -like 'ITAdminSW_*' | Unregister-ScheduledTask -Confirm:$false -EA SilentlyContinue } -EA SilentlyContinue`,
                15000
              )
            } catch { /* ok */ }
            return
          }

          addLogLine(`[Step ${step}] ${status}: ${msg}`)
        } catch { addLogLine(line.trim()) }
      } else if (line.trim()) {
        addLogLine(line.trim())
      }
    }
  } catch {
    // Don't log every failed poll — just silently retry
  }
}

export const useSwInstallStore = create<SwInstallState>((set, get) => ({
  phase: 'idle',
  hostname: '',
  startTime: 0,
  logLines: [],
  stepStatus: {},
  errorMsg: '',

  reset: () => {
    stopPolling()
    set({ phase: 'idle', hostname: '', startTime: 0, logLines: [], stepStatus: {}, errorMsg: '' })
  },

  startInstall: async (hostname: string, script: string) => {
    stopPolling()
    set({ phase: 'running', hostname, startTime: Date.now(), logLines: [], stepStatus: {}, errorMsg: '' })

    _hostname = hostname
    _lastLineCount = 0
    _pollStartTime = Date.now()

    const ts = Date.now()
    const remotePath = `C:\\Windows\\Temp\\itadmintool_sw_${ts}.ps1`
    _remoteLogPath = `C:\\Windows\\Temp\\itadmintool_sw_${ts}.log`
    const taskName = `ITAdminSW_${ts}`

    try {
      // Copy script to target via Base64 encoding (avoids all escaping issues)
      const uncPath = `\\\\${hostname}\\C$\\Windows\\Temp`

      addLogLine('Skript wird auf Zielrechner kopiert (Base64-Methode)...')

      // Convert script to Base64 to avoid any escaping problems
      const scriptB64 = btoa(unescape(encodeURIComponent(script)))
      const logFile = remotePath.replace('.ps1', '.log')

      // Write script via Base64 decode on target + create wrapper
      const copyCmd = [
        `$uncDir = '${uncPath}'`,
        `if (!(Test-Path $uncDir)) { throw "Admin-Share nicht erreichbar: $uncDir" }`,
        `$b64 = '${scriptB64}'`,
        `$bytes = [System.Convert]::FromBase64String($b64)`,
        `$text = [System.Text.Encoding]::UTF8.GetString($bytes)`,
        `[System.IO.File]::WriteAllText('${uncPath}\\itadmintool_sw_${ts}.ps1', $text, [System.Text.Encoding]::UTF8)`,
        // Also create wrapper that pipes output to log
        `$wrapper = 'powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${remotePath}" | Out-File -FilePath "${logFile}" -Encoding UTF8 -Force'`,
        `[System.IO.File]::WriteAllText('${uncPath}\\itadmintool_sw_${ts}_run.ps1', $wrapper, [System.Text.Encoding]::UTF8)`,
        `if (Test-Path '${uncPath}\\itadmintool_sw_${ts}.ps1') { Write-Output 'OK' } else { throw 'Fehler' }`,
      ].join('\n')
      const copyRes = await api().runPowerShell(copyCmd, 60000)
      if (!copyRes.stdout.includes('OK')) {
        throw new Error(`Skript-Kopie fehlgeschlagen: ${copyRes.stderr || copyRes.stdout}`)
      }
      addLogLine('Skript + Wrapper erfolgreich kopiert.')

      // ── ROBOCOPY: Run from Admin PC ──────────────────────────────────────────
      // The Scheduled Task on the target PC cannot access network shares.
      // So we run robocopy from the Admin PC.
      // Use DRIVE LETTER (I:\) as source — the Admin PC has I: mapped and it works.
      // Use UNC admin share (\\TARGET\C$\TEMP\) as destination.
      addLogLine('Robocopy wird vom Admin-PC gestartet...')
      const adminImageSub = pathService.getSoftwarePath('solidworks', 'adminImageSubfolder')

      // Build source path carefully — avoid double backslashes
      const marineRootDrive = pathService.getMarineRoot('drive').replace(/\\+$/, '') // remove trailing \
      const marineRootUNC = pathService.getMarineRoot('unc').replace(/\\+$/, '')
      const subPath = `700 Application\\711 IT Allgemein\\SW_INSTA\\${adminImageSub}`
      const swSourceDrive = `${marineRootDrive}\\${subPath}`
      const swSourceUNC = `${marineRootUNC}\\${subPath}`
      const swDestUNC = `\\\\${hostname}\\C$\\TEMP\\${adminImageSub}`

      // Ensure C:\TEMP exists on target
      const mkdirCmd = `if (!(Test-Path '\\\\${hostname}\\C$\\TEMP')) { New-Item -Path '\\\\${hostname}\\C$\\TEMP' -ItemType Directory -Force | Out-Null }; Write-Output 'OK'`
      await api().runPowerShell(mkdirCmd, 10000)

      // ── Reusable verification helper ─────────────────────────────────────────
      // Counts files in the destination + checks for startswinstall.exe
      // Also reads source file count once so we can compare against a real target
      // Use [System.IO.Directory]::EnumerateFiles instead of Get-ChildItem —
      // significantly faster on UNC shares with many files (no PSObject creation
      // per file). Get-ChildItem on ~84k files via UNC was hitting the timeout.
      const verifyDestCmd = [
        `$dir = '\\\\${hostname}\\C$\\TEMP\\${adminImageSub}'`,
        `if (Test-Path $dir) {`,
        `  $exe = Test-Path (Join-Path $dir 'startswinstall.exe')`,
        `  $count = 0`,
        `  $size = [int64]0`,
        `  try {`,
        `    foreach ($f in [System.IO.Directory]::EnumerateFiles($dir, '*', [System.IO.SearchOption]::AllDirectories)) {`,
        `      $count++`,
        `      try { $size += (New-Object System.IO.FileInfo $f).Length } catch {}`,
        `    }`,
        `  } catch { Write-Output ('VERIFY_ERR:' + $_.Exception.Message); exit 0 }`,
        `  Write-Output ('VERIFY:' + $exe + ':' + $count + ':' + $size)`,
        `} else { Write-Output 'NOTFOUND' }`,
      ].join('\n')

      const parseVerify = (out: string): { exists: boolean; exeFound: boolean; fileCount: number; sizeBytes: number } => {
        const trimmed = out.trim()
        if (!trimmed.startsWith('VERIFY:')) return { exists: false, exeFound: false, fileCount: 0, sizeBytes: 0 }
        const parts = trimmed.substring(7).split(':')
        return {
          exists: true,
          exeFound: parts[0] === 'True',
          fileCount: parseInt(parts[1]) || 0,
          sizeBytes: parseInt(parts[2]) || 0,
        }
      }

      // Determine expected size/count from source — once
      addLogLine('Quellverzeichnis wird analysiert (Soll-Werte werden ermittelt)...')
      const sourceStatCmd = [
        `$src = '${swSourceDrive}'`,
        `if (!(Test-Path $src)) { $src = '${swSourceUNC}' }`,
        `if (!(Test-Path $src)) { Write-Output 'SRC_ERR'; exit 1 }`,
        `$count = 0`,
        `$size = [int64]0`,
        `foreach ($f in [System.IO.Directory]::EnumerateFiles($src, '*', [System.IO.SearchOption]::AllDirectories)) {`,
        `  $count++`,
        `  try { $size += (New-Object System.IO.FileInfo $f).Length } catch {}`,
        `}`,
        `Write-Output ('SRC:' + $count + ':' + $size)`,
      ].join('\n')
      const srcStatRes = await api().runPowerShell(sourceStatCmd, 600000) // up to 10 min for source scan
      let expectedFiles = 83979
      let expectedBytes = 0
      const srcMatch = srcStatRes.stdout.match(/SRC:(\d+):(\d+)/)
      if (srcMatch) {
        expectedFiles = parseInt(srcMatch[1]) || 83979
        expectedBytes = parseInt(srcMatch[2]) || 0
        addLogLine(`Soll-Werte: ${expectedFiles} Dateien, ${(expectedBytes / 1024 / 1024 / 1024).toFixed(2)} GB`)
      } else {
        addLogLine('Quellverzeichnis-Analyse fehlgeschlagen — Schwellwert 83.979 Dateien wird verwendet.')
      }

      // ── Initial check on target ──────────────────────────────────────────────
      addLogLine('Zielverzeichnis wird ueberprueft...')
      const initRes = await api().runPowerShell(verifyDestCmd, 600000) // 10 min
      const initState = parseVerify(initRes.stdout)

      // Tolerance: accept if file count + size both >= 99% of expected and exe present
      const isComplete = (state: { exists: boolean; exeFound: boolean; fileCount: number; sizeBytes: number }): boolean => {
        if (!state.exists || !state.exeFound) return false
        const fileOk = state.fileCount >= Math.floor(expectedFiles * 0.99)
        const sizeOk = expectedBytes === 0 || state.sizeBytes >= Math.floor(expectedBytes * 0.99)
        return fileOk && sizeOk
      }

      if (initState.exists) {
        addLogLine(`Bestand: ${initState.fileCount}/${expectedFiles} Dateien, ${(initState.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB, startswinstall.exe ${initState.exeFound ? 'vorhanden' : 'fehlt'}`)
      } else {
        addLogLine('Zielverzeichnis existiert noch nicht — Neukopie.')
      }

      let robocopyOK = isComplete(initState)
      if (robocopyOK) {
        addLogLine('Verzeichnis ist bereits vollstaendig — Robocopy wird uebersprungen.')
      } else {
        // ── Retry loop ─────────────────────────────────────────────────────────
        addLogLine(`Quelle (Drive): ${swSourceDrive}`)
        addLogLine(`Quelle (UNC):   ${swSourceUNC}`)
        addLogLine(`Ziel:           ${swDestUNC}`)

        const robocopyCmd = [
          `Write-Output "ROBO_START"`,
          `$src = '${swSourceDrive}'`,
          `if (!(Test-Path $src)) {`,
          `  $src = '${swSourceUNC}'`,
          `  if (!(Test-Path $src)) { Write-Output "ROBO_ERR:Quelle nicht erreichbar"; exit 1 }`,
          `}`,
          `Write-Output "ROBO_SRC:$src"`,
          `$dst = '${swDestUNC}'`,
          // Resolve full path to Robocopy.exe — handles WoW64 redirection and
          // empty PATH inside child cmd processes (cmd-only would yield 9009).
          `$roboExe = Join-Path $env:SystemRoot 'System32\\Robocopy.exe'`,
          `if (!(Test-Path $roboExe)) { $roboExe = Join-Path $env:SystemRoot 'Sysnative\\Robocopy.exe' }`,
          `if (!(Test-Path $roboExe)) { Write-Output "ROBO_ERR:Robocopy.exe nicht gefunden ($roboExe)"; exit 1 }`,
          `Write-Output "ROBO_EXE:$roboExe"`,
          // Run Robocopy directly via PowerShell call operator. PowerShell escapes
          // arguments correctly even when paths contain spaces.
          // /E copies missing files only — re-runs are incremental.
          `$roboOutput = & $roboExe $src $dst /E /FFT /XA:H /W:5 /R:2 /MT:8 2>&1 | Out-String`,
          `$exitCode = $LASTEXITCODE`,
          `Write-Output "ROBO_RC:$exitCode"`,
          `if ($roboOutput) {`,
          `  $lastLines = ($roboOutput -split [char]10 | Where-Object { $_.Trim() } | Select-Object -Last 8) -join ' | '`,
          `  Write-Output "ROBO_SUMMARY:$lastLines"`,
          `}`,
        ].join('\n')

        const MAX_ATTEMPTS = 6
        let attempt = 0
        let prevFileCount = initState.fileCount
        let prevSizeBytes = initState.sizeBytes
        let stagnantRuns = 0

        while (attempt < MAX_ATTEMPTS) {
          attempt++
          addLogLine(`──────── Robocopy Versuch ${attempt}/${MAX_ATTEMPTS} ────────`)
          addLogLine('Robocopy laeuft... (kopiert nur fehlende/aktualisierte Dateien)')

          const rcRes = await api().runPowerShell(robocopyCmd, 14400000) // 4h
          const rcOutput = rcRes.stdout

          for (const line of rcOutput.split('\n')) {
            const trimmed = line.trim()
            if (trimmed.startsWith('ROBO_')) addLogLine(trimmed)
          }

          let robocopyExitOk = false
          if (rcOutput.includes('ROBO_ERR:')) {
            addLogLine(`FEHLER: ${rcOutput.match(/ROBO_ERR:(.+)/)?.[1] || 'Unbekannt'}`)
          } else if (rcRes.timedOut) {
            addLogLine('Robocopy Timeout (4h) — pruefe Fortschritt und versuche erneut...')
          } else {
            const rcMatch = rcOutput.match(/ROBO_RC:(\d+)/)
            const rcCode = rcMatch ? parseInt(rcMatch[1]) : -1
            if (rcCode >= 0 && rcCode < 8) {
              addLogLine(`Robocopy ExitCode ${rcCode} (OK).`)
              robocopyExitOk = true
            } else {
              addLogLine(`Robocopy ExitCode ${rcCode} — wird trotzdem geprueft, ggf. erneut versucht.`)
            }
          }

          // Parse Robocopy summary as fallback verification (in case file count
          // verify times out on slow UNC shares). Robocopy's own summary line
          // "Dateien:" / "Files:" reports total/copied/skipped — total >= expected
          // means all source files are accounted for on target.
          // Format: "Dateien: <total> <copied> <skipped> <mismatch> <failed> <extras>"
          const summaryMatch = rcOutput.match(/(?:Dateien|Files)\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/)
          let robocopySummaryOK = false
          if (summaryMatch) {
            const total = parseInt(summaryMatch[1])
            const failed = parseInt(summaryMatch[5])
            // total reflects source file count; failed must be 0
            robocopySummaryOK = robocopyExitOk && failed === 0 && total >= Math.floor(expectedFiles * 0.99)
            if (robocopySummaryOK) {
              addLogLine(`Robocopy-Bilanz OK: ${total} Quelldateien erfasst, 0 Fehler.`)
            }
          }

          // Verify after this attempt
          addLogLine('Vollstaendigkeit wird geprueft...')
          const vRes = await api().runPowerShell(verifyDestCmd, 600000) // 10 min
          const vState = parseVerify(vRes.stdout)
          const verifyErr = vRes.stdout.match(/VERIFY_ERR:(.+)/)?.[1]
          if (verifyErr) addLogLine(`Verify-Warnung: ${verifyErr}`)

          if (vState.exists || vState.fileCount > 0) {
            addLogLine(`Stand nach Versuch ${attempt}: ${vState.fileCount}/${expectedFiles} Dateien, ${(vState.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB, exe ${vState.exeFound ? 'OK' : 'fehlt'}`)
          } else {
            addLogLine(`Verify lieferte keine zaehlbaren Daten zurueck (Timeout?). Falle zurueck auf Robocopy-Bilanz.`)
          }

          if (isComplete(vState)) {
            addLogLine(`Verzeichnis vollstaendig nach Versuch ${attempt}!`)
            robocopyOK = true
            break
          }

          // Fallback: if verify failed but Robocopy summary confirms full transfer,
          // do a minimal startswinstall.exe check and accept.
          if (!vState.exists && robocopySummaryOK) {
            addLogLine('Robocopy-Bilanz signalisiert vollstaendigen Transfer — pruefe nur startswinstall.exe...')
            const exeCheck = await api().runPowerShell(
              `if (Test-Path '\\\\${hostname}\\C$\\TEMP\\${adminImageSub}\\startswinstall.exe') { 'EXE_OK' } else { 'EXE_MISSING' }`,
              30000
            )
            if (exeCheck.stdout.includes('EXE_OK')) {
              addLogLine(`Verzeichnis vollstaendig (Fallback-Bestaetigung) nach Versuch ${attempt}!`)
              robocopyOK = true
              break
            } else {
              addLogLine('startswinstall.exe nicht gefunden — naechster Versuch.')
            }
          }

          // Progress check: have file count or size increased?
          const filesGained = vState.fileCount - prevFileCount
          const bytesGained = vState.sizeBytes - prevSizeBytes
          if (filesGained <= 0 && bytesGained <= 0) {
            stagnantRuns++
            addLogLine(`Kein Fortschritt in diesem Versuch (${stagnantRuns} stagnierende Runde${stagnantRuns > 1 ? 'n' : ''}).`)
            if (stagnantRuns >= 2) {
              addLogLine('Zwei aufeinanderfolgende Versuche ohne Fortschritt — Abbruch der Schleife.')
              break
            }
          } else {
            addLogLine(`Fortschritt: +${filesGained} Dateien, +${(bytesGained / 1024 / 1024).toFixed(1)} MB`)
            stagnantRuns = 0
          }

          prevFileCount = vState.fileCount
          prevSizeBytes = vState.sizeBytes

          if (attempt < MAX_ATTEMPTS) {
            addLogLine('Verzeichnis noch unvollstaendig — naechster Robocopy-Lauf wird gestartet...')
          }
        }

        if (!robocopyOK) {
          addLogLine(`ABBRUCH: Verzeichnis konnte nach ${attempt} Versuch${attempt > 1 ? 'en' : ''} nicht vollstaendig kopiert werden.`)
          addLogLine('Bitte Quellpfad und Netzwerkverbindung pruefen, dann erneut versuchen.')
          set({ phase: 'error', errorMsg: `Robocopy fehlgeschlagen nach ${attempt} Versuch(en) — SolidWorks-Verzeichnis unvollstaendig` })
          return
        }
      }

      const wrapperPath = remotePath.replace('.ps1', '_run.ps1')

      // Create and run scheduled task for remaining steps
      addLogLine('Scheduled Task wird erstellt fuer restliche Schritte...')
      const createTaskCmd = [
        `Invoke-Command -ComputerName '${hostname}' -ScriptBlock {`,
        `  param($tn, $wp)`,
        `  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-ExecutionPolicy Bypass -NoProfile -File $wp"`,
        `  $loggedOnUser = (Get-CimInstance Win32_ComputerSystem).UserName`,
        `  if ($loggedOnUser) {`,
        `    $principal = New-ScheduledTaskPrincipal -UserId $loggedOnUser -RunLevel Highest -LogonType Interactive`,
        `  } else {`,
        `    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest`,
        `  }`,
        `  Register-ScheduledTask -TaskName $tn -Action $action -Principal $principal -Force | Out-Null`,
        `  Start-ScheduledTask -TaskName $tn`,
        `  Write-Output "STARTED:$loggedOnUser"`,
        `} -ArgumentList '${taskName}','${wrapperPath}' -EA Stop`,
      ].join('\n')
      const taskRes = await api().runPowerShell(createTaskCmd, 30000)
      if (!taskRes.stdout.includes('STARTED')) {
        addLogLine(`Task-Output: ${taskRes.stdout.trim()} | ${taskRes.stderr.trim()}`)
      }

      addLogLine('Installation laeuft auf Zielrechner. Polling gestartet (bleibt auch bei Menuewechsel aktiv).')

      // Start polling via window-level setInterval (survives React unmounts)
      _pollTimer = setInterval(pollOnce, 5000)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ phase: 'error', errorMsg: msg })
      addLogLine(`FEHLER: ${msg}`)
    }
  },
}))
