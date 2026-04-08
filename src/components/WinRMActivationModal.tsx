import { useState, useEffect, useRef } from 'react'
import { Loader, CheckCircle, XCircle, AlertTriangle, X, Wifi, WifiOff, Shield, HelpCircle } from 'lucide-react'
import { api } from '../electronAPI'
import WinRMHelpModal from './WinRMHelpModal'

type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

interface MethodStep {
  id: string
  label: string
  status: StepStatus
  detail?: string
}

interface Props {
  hostname: string
  onSuccess: () => void           // WinRM activated → re-connect normally
  onRestricted: () => void        // All methods failed → connect restricted
  onCancel: () => void
  psExecPath?: string
  timeout?: number                // ms per method, default 30000
}

const DEFAULT_TIMEOUT = 30000

export default function WinRMActivationModal({ hostname, onSuccess, onRestricted, onCancel, psExecPath, timeout = DEFAULT_TIMEOUT }: Props) {
  const h = hostname.replace(/'/g, "''")
  const [steps, setSteps] = useState<MethodStep[]>([
    { id: 'ping',    label: 'Ping prüfen',                    status: 'running' },
    { id: 'winrm',   label: 'WinRM testen',                   status: 'pending' },
    { id: 'm1',      label: 'Methode 1: sc.exe (SMB)',        status: 'pending' },
    { id: 'm2',      label: 'Methode 2: WMI/DCOM',            status: 'pending' },
    { id: 'm3',      label: 'Methode 3: PsExec',              status: 'pending' },
    { id: 'm4',      label: 'Methode 4: Geplante Aufgabe',    status: 'pending' },
    { id: 'm5',      label: 'Methode 5: Remote Registry',     status: 'pending' },
    { id: 'm6',      label: 'Methode 6: WMI Process Create',  status: 'pending' },
  ])
  const [phase, setPhase] = useState<'activating' | 'done-success' | 'done-fail'>('activating')
  const [showManualHelp, setShowManualHelp] = useState(false)
  const [progress, setProgress] = useState(0)
  const abortRef = useRef(false)

  function updateStep(id: string, status: StepStatus, detail?: string) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, detail } : s))
  }

  async function runPS(script: string, timeoutMs = timeout): Promise<{ ok: boolean; out: string }> {
    try {
      const res = await api().runPowerShell(script, timeoutMs)
      const out = (res.stdout?.trim() || '') + (res.stderr?.trim() || '')
      return { ok: res.exitCode === 0 && !out.toLowerCase().includes('error') && !out.toLowerCase().includes('fehlgeschlagen'), out }
    } catch (e) {
      return { ok: false, out: String(e) }
    }
  }

  async function testWinRM(): Promise<boolean> {
    const { ok } = await runPS(`Test-WSMan -ComputerName '${h}' -ErrorAction Stop | Out-Null; Write-Output 'OK'`, 5000)
    return ok
  }

  async function log(msg: string) {
    try { await api().log(`[WinRM-Aktivierung] ${msg}`) } catch { /* ignore */ }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await log(`Verbindungsversuch zu ${hostname} gestartet`)

      // ── Step 1: Ping ──
      updateStep('ping', 'running')
      const pingRes = await runPS(`Test-Connection -ComputerName '${h}' -Count 1 -Quiet`, 5000)
      if (cancelled) return
      if (!pingRes.ok || pingRes.out.includes('False')) {
        updateStep('ping', 'error', 'Nicht erreichbar')
        await log(`${hostname}: Ping fehlgeschlagen`)
        setPhase('done-fail')
        return
      }
      updateStep('ping', 'success', 'Erreichbar')
      setProgress(10)

      // ── Step 2: WinRM test ──
      updateStep('winrm', 'running')
      if (await testWinRM()) {
        updateStep('winrm', 'success', 'Bereits aktiv')
        await log(`${hostname}: WinRM bereits aktiv`)
        setPhase('done-success')
        onSuccess()
        return
      }
      updateStep('winrm', 'error', 'Nicht verfügbar — Aktivierung wird gestartet')
      await log(`${hostname}: WinRM nicht verfügbar — Aktivierung gestartet`)
      setProgress(15)
      if (cancelled) return

      // ── Method 1: sc.exe (SMB) ──
      updateStep('m1', 'running')
      const m1 = await runPS([
        `sc.exe "\\\\${h}" config WinRM start= auto 2>&1 | Out-Null`,
        `sc.exe "\\\\${h}" start WinRM 2>&1 | Out-Null`,
        `Start-Sleep -Seconds 3`,
        `$q = sc.exe "\\\\${h}" query WinRM 2>&1`,
        `if ($q -match 'RUNNING') { Write-Output 'OK' } else { Write-Output "FAIL:$q" }`,
      ].join('; '), DEFAULT_TIMEOUT)
      if (cancelled) return
      if (m1.ok && m1.out.includes('OK')) {
        if (await testWinRM()) {
          updateStep('m1', 'success', 'sc.exe erfolgreich')
          await log(`${hostname}: Methode 1 (sc.exe) erfolgreich`)
          setPhase('done-success')
          onSuccess()
          return
        }
      }
      updateStep('m1', 'error', m1.out.slice(0, 80))
      await log(`${hostname}: Methode 1 (sc.exe) fehlgeschlagen — ${m1.out.slice(0, 100)}`)
      setProgress(28)
      if (cancelled) return

      // ── Method 2: WMI/DCOM ──
      updateStep('m2', 'running')
      const m2 = await runPS([
        `$opt = New-CimSessionOption -Protocol Dcom`,
        `$s = New-CimSession -ComputerName '${h}' -SessionOption $opt -EA Stop`,
        `$svc = Get-CimInstance -CimSession $s -ClassName Win32_Service -Filter "Name='WinRM'" -EA Stop`,
        `Invoke-CimMethod -InputObject $svc -MethodName ChangeStartMode -Arguments @{StartMode='Automatic'} | Out-Null`,
        `Invoke-CimMethod -InputObject $svc -MethodName StartService | Out-Null`,
        `Remove-CimSession $s`,
        `Start-Sleep -Seconds 3`,
        `Write-Output 'OK'`,
      ].join('; '), DEFAULT_TIMEOUT)
      if (cancelled) return
      if (m2.ok) {
        if (await testWinRM()) {
          updateStep('m2', 'success', 'WMI/DCOM erfolgreich')
          await log(`${hostname}: Methode 2 (WMI/DCOM) erfolgreich`)
          setPhase('done-success')
          onSuccess()
          return
        }
      }
      updateStep('m2', 'error', m2.out.slice(0, 80))
      await log(`${hostname}: Methode 2 (WMI/DCOM) fehlgeschlagen — ${m2.out.slice(0, 100)}`)
      setProgress(41)
      if (cancelled) return

      // ── Method 3: PsExec ──
      const psDir = (psExecPath || '\\\\w3172\\skf marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT\\tools').replace(/\\+$/, '').replace(/\\PsExec(64)?\.exe$/i, '')
      updateStep('m3', 'running', 'PsExec wird gesucht...')
      const psCheck = await runPS(`$p64='${psDir}\\PsExec64.exe'; $p32='${psDir}\\PsExec.exe'; if (Test-Path $p64) { Write-Output "FOUND:$p64" } elseif (Test-Path $p32) { Write-Output "FOUND:$p32" } else { Write-Output 'NOTFOUND' }`, 5000)
      if (cancelled) return
      const psPathMatch = psCheck.out.match(/FOUND:(.+)/)
      if (psPathMatch) {
        const psPath = psPathMatch[1].trim()
        const m3 = await runPS(
          `& '${psPath}' "\\\\${h}" -s -accepteula powershell -Command "Enable-PSRemoting -Force -SkipNetworkProfileCheck" 2>&1; Start-Sleep -Seconds 5; Write-Output 'DONE'`,
          45000
        )
        if (cancelled) return
        if (await testWinRM()) {
          updateStep('m3', 'success', 'PsExec erfolgreich')
          await log(`${hostname}: Methode 3 (PsExec) erfolgreich`)
          setPhase('done-success')
          onSuccess()
          return
        }
        updateStep('m3', 'error', m3.out.slice(0, 80))
        await log(`${hostname}: Methode 3 (PsExec) fehlgeschlagen — ${m3.out.slice(0, 100)}`)
      } else {
        updateStep('m3', 'skipped', 'PsExec nicht gefunden')
        await log(`${hostname}: Methode 3 übersprungen — PsExec nicht gefunden unter ${psDir}`)
      }
      setProgress(54)
      if (cancelled) return

      // ── Method 4: Scheduled Task ──
      updateStep('m4', 'running')
      const m4 = await runPS([
        `schtasks /create /s ${h} /tn "IT_Tool_EnableWinRM" /tr "powershell.exe -ExecutionPolicy Bypass -Command Enable-PSRemoting -Force -SkipNetworkProfileCheck" /sc once /st 00:00 /ru SYSTEM /rl HIGHEST /f 2>&1`,
        `schtasks /run /s ${h} /tn "IT_Tool_EnableWinRM" 2>&1`,
        `Start-Sleep -Seconds 8`,
        `schtasks /delete /s ${h} /tn "IT_Tool_EnableWinRM" /f 2>&1`,
        `Write-Output 'DONE'`,
      ].join('; '), DEFAULT_TIMEOUT)
      if (cancelled) return
      if (await testWinRM()) {
        updateStep('m4', 'success', 'Geplante Aufgabe erfolgreich')
        await log(`${hostname}: Methode 4 (schtasks) erfolgreich`)
        setPhase('done-success')
        onSuccess()
        return
      }
      updateStep('m4', 'error', m4.out.slice(0, 80))
      await log(`${hostname}: Methode 4 (schtasks) fehlgeschlagen — ${m4.out.slice(0, 100)}`)
      setProgress(67)
      if (cancelled) return

      // ── Method 5: Remote Registry ──
      updateStep('m5', 'running')
      const m5 = await runPS([
        `sc.exe "\\\\${h}" start RemoteRegistry 2>&1 | Out-Null`,
        `Start-Sleep -Seconds 2`,
        `reg add "\\\\${h}\\HKLM\\SYSTEM\\CurrentControlSet\\Services\\WinRM" /v Start /t REG_DWORD /d 2 /f 2>&1`,
        `sc.exe "\\\\${h}" start WinRM 2>&1`,
        `Start-Sleep -Seconds 3`,
        `Write-Output 'DONE'`,
      ].join('; '), DEFAULT_TIMEOUT)
      if (cancelled) return
      if (await testWinRM()) {
        updateStep('m5', 'success', 'Remote Registry erfolgreich')
        await log(`${hostname}: Methode 5 (Remote Registry) erfolgreich`)
        setPhase('done-success')
        onSuccess()
        return
      }
      updateStep('m5', 'error', m5.out.slice(0, 80))
      await log(`${hostname}: Methode 5 (Remote Registry) fehlgeschlagen — ${m5.out.slice(0, 100)}`)
      setProgress(80)
      if (cancelled) return

      // ── Method 6: WMI Process Create ──
      updateStep('m6', 'running')
      const m6 = await runPS([
        `Invoke-WmiMethod -ComputerName '${h}' -Class Win32_Process -Name Create -ArgumentList "powershell.exe -ExecutionPolicy Bypass -Command Enable-PSRemoting -Force -SkipNetworkProfileCheck" -EA Stop`,
        `Start-Sleep -Seconds 5`,
        `Write-Output 'DONE'`,
      ].join('; '), DEFAULT_TIMEOUT)
      if (cancelled) return
      if (await testWinRM()) {
        updateStep('m6', 'success', 'WMI Process Create erfolgreich')
        await log(`${hostname}: Methode 6 (WMI Process Create) erfolgreich`)
        setPhase('done-success')
        onSuccess()
        return
      }
      updateStep('m6', 'error', m6.out.slice(0, 80))
      await log(`${hostname}: Methode 6 (WMI Process Create) fehlgeschlagen — ${m6.out.slice(0, 100)}`)
      setProgress(100)

      // ── All methods failed ──
      await log(`${hostname}: Alle 6 WinRM-Aktivierungsmethoden fehlgeschlagen — eingeschränkter Modus angeboten`)
      setPhase('done-fail')
    })()

    return () => { cancelled = true; abortRef.current = true }
  }, []) // eslint-disable-line

  const statusIcon = (s: StepStatus) => {
    switch (s) {
      case 'pending': return <div className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" />
      case 'running': return <Loader size={16} className="animate-spin text-blue-400 shrink-0" />
      case 'success': return <CheckCircle size={16} className="text-emerald-400 shrink-0" />
      case 'error':   return <XCircle size={16} className="text-red-400 shrink-0" />
      case 'skipped': return <div className="w-4 h-4 rounded-full bg-muted-foreground/20 shrink-0" />
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-[520px] max-h-[85vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <Shield size={16} className="text-primary" />
          <span className="font-semibold text-sm text-foreground flex-1">Verbindung zu {hostname}</span>
          <button onClick={() => { abortRef.current = true; onCancel() }}
            className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X size={14} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted/30">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        {/* Steps list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {steps.map(step => (
            <div key={step.id} className={`flex items-start gap-2.5 ${step.status === 'pending' ? 'opacity-40' : ''}`}>
              <div className="mt-0.5">{statusIcon(step.status)}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs ${step.status === 'running' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </p>
                {step.detail && (
                  <p className={`text-[10px] mt-0.5 truncate ${step.status === 'error' ? 'text-red-400/70' : step.status === 'success' ? 'text-emerald-400/70' : 'text-muted-foreground/60'}`}>
                    {step.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center gap-2">
          {phase === 'activating' && (
            <>
              <Loader size={14} className="animate-spin text-blue-400" />
              <span className="text-xs text-muted-foreground flex-1">WinRM wird aktiviert...</span>
              <button onClick={() => { abortRef.current = true; onCancel() }}
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                Abbrechen
              </button>
            </>
          )}
          {phase === 'done-success' && (
            <>
              <CheckCircle size={14} className="text-emerald-400" />
              <span className="text-xs text-emerald-400 flex-1">WinRM erfolgreich aktiviert!</span>
            </>
          )}
          {phase === 'done-fail' && (
            <>
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-xs text-muted-foreground flex-1">Alle Methoden fehlgeschlagen</span>
              <button onClick={() => setShowManualHelp(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20">
                <HelpCircle size={11} /> Anleitung vor Ort
              </button>
              <button onClick={onRestricted}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20">
                <WifiOff size={11} /> Alternative Methoden testen
              </button>
              <button onClick={onCancel}
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                Abbrechen
              </button>
            </>
          )}
          {showManualHelp && <WinRMHelpModal onClose={() => setShowManualHelp(false)} />}
        </div>
      </div>
    </div>
  )
}
