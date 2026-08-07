import { useState, useEffect, useRef } from 'react'
import {
  Phone, Play, AlertTriangle, CheckCircle, XCircle, Loader, Info,
  Clock, Terminal, RefreshCw, Upload, PackageOpen,
} from 'lucide-react'
import { api } from '../../electronAPI'
import { createLogger } from '../../utils/activityLogger'
import { useAuthStore } from '../../store/authStore'
import { useXelionInstallStore, XELION_STEPS } from '../../store/xelionInstallStore'
import { loadXelionInstaller, replaceXelionInstaller, type XelionInstaller } from '../../services/xelionInstaller'
import { ensureWinRM, clearWinRMCache } from '../../utils/winrmUtils'
import { isValidRemoteTarget, isIpv4, ensureWinRmTrustedHost } from '../../utils/remoteTarget'
import Card from '../Card'

const log = createLogger('software-installations')

type PreCheck = 'pending' | 'ok' | 'fail' | 'loading'

function fmtDateTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function XelionInstallation() {
  const store = useXelionInstallStore()
  const user = useAuthStore(s => s.session?.user)
  const currentUser = user?.displayName || user?.username || 'unbekannt'

  const [hostname, setHostname] = useState('')
  const [installer, setInstaller] = useState<XelionInstaller | null>(null)
  const [loadingInstaller, setLoadingInstaller] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState('')

  const [localPhase, setLocalPhase] = useState<'config' | 'prechecks'>('config')
  const [preChecks, setPreChecks] = useState<Record<string, PreCheck>>({})
  const [installedVersion, setInstalledVersion] = useState<string | null>(null)
  const [loggedOnUser, setLoggedOnUser] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)

  const phase = store.phase !== 'idle' ? store.phase : localPhase
  const targetValid = isValidRemoteTarget(hostname)
  const targetIsIp = isIpv4(hostname)
  const allPreChecksOk = Object.values(preChecks).length > 0 && Object.values(preChecks).every(v => v === 'ok')

  useEffect(() => { void reloadInstaller() }, [])
  useEffect(() => {
    if (store.phase !== 'running') return
    const t = setInterval(() => setElapsed(Date.now() - store.startTime), 1000)
    return () => clearInterval(t)
  }, [store.phase, store.startTime])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [store.logLines])

  function flash(t: string) { setToast(t); setTimeout(() => setToast(c => (c === t ? '' : c)), 4000) }

  async function reloadInstaller() {
    setLoadingInstaller(true)
    try { setInstaller(await loadXelionInstaller()) } finally { setLoadingInstaller(false) }
  }

  async function handleReplace() {
    let path: string | null = null
    try { path = await api().openFileDialog([{ name: 'AppInstaller', extensions: ['appinstaller'] }]) } catch { /* abgebrochen */ }
    if (!path) return
    setUploading(true)
    try {
      const res = await replaceXelionInstaller(path, currentUser)
      if (!res.ok || !res.installer) { flash(res.error || 'Austausch fehlgeschlagen.'); return }
      setInstaller(res.installer)
      flash(`Neuer Installer eingepflegt: Version ${res.installer.version}`)
      log('Xelion-Installer ausgetauscht', `Version ${res.installer.version} (${res.installer.fileName})`)
    } finally {
      setUploading(false)
    }
  }

  async function runPreChecks() {
    const h = hostname.trim()
    setLocalPhase('prechecks')
    setInstalledVersion(null)
    setLoggedOnUser(null)
    clearWinRMCache(h)  // frische Aktivierung erzwingen (kein veralteter Cache)
    // 'user' ist KEIN blockierender Check mehr — die Installation ist moeglich,
    // sobald der PC online + WinRM erreichbar ist.
    const checks: Record<string, PreCheck> = { hostname: 'loading', installer: 'loading', ping: 'loading', winrm: 'loading', remote: 'loading' }
    setPreChecks({ ...checks })

    checks.hostname = targetValid ? 'ok' : 'fail'; setPreChecks({ ...checks })
    checks.installer = installer && installer.content ? 'ok' : 'fail'; setPreChecks({ ...checks })

    // Bei IP: sicherstellen, dass sie in den WinRM-TrustedHosts steht (NTLM),
    // damit Invoke-Command per IP funktioniert. Best-Effort.
    if (targetIsIp) { try { await ensureWinRmTrustedHost(h) } catch { /* Remote-Check meldet es */ } }

    try {
      const res = await api().runPowerShell(`if (Test-Connection -ComputerName '${h}' -Count 1 -Quiet) { 'OK' } else { 'FAIL' }`, 10000)
      checks.ping = res.stdout.trim() === 'OK' ? 'ok' : 'fail'
    } catch { checks.ping = 'fail' }
    setPreChecks({ ...checks })

    // WinRM auf dem Zielrechner aktivieren (per RPC/SMB) — wie bei Remote Doc.
    try {
      checks.winrm = (await ensureWinRM(h)) ? 'ok' : 'fail'
    } catch { checks.winrm = 'fail' }
    setPreChecks({ ...checks })

    try {
      const res = await api().runPowerShell(`try { Invoke-Command -ComputerName '${h}' -ScriptBlock { $env:COMPUTERNAME } -EA Stop } catch { 'FAIL' }`, 15000)
      checks.remote = res.stdout.trim() !== 'FAIL' && res.exitCode === 0 ? 'ok' : 'fail'
    } catch { checks.remote = 'fail' }
    setPreChecks({ ...checks })

    // Angemeldeten Benutzer ermitteln (nur zur Info — MSIX installiert pro
    // Benutzer). Robuste Erkennung: Win32_ComputerSystem, sonst explorer.exe-Besitzer
    // (erfasst auch RDP-/Zweit-Sessions). Blockiert die Installation NICHT.
    try {
      const res = await api().runPowerShell(
        `try { (Invoke-Command -ComputerName '${h}' -ScriptBlock { $u=(Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue).UserName; if(-not $u){ try { $u=(Get-Process -IncludeUserName -Name explorer -EA Stop | Select-Object -First 1 -ExpandProperty UserName) } catch {} }; $u } -EA Stop) } catch { '' }`,
        15000,
      )
      setLoggedOnUser(res.stdout.trim() || null)
    } catch { setLoggedOnUser(null) }

    // Bereits installiert? (Get-AppxPackage -AllUsers, da MSIX pro Benutzer)
    try {
      const res = await api().runPowerShell(
        `try { ((Invoke-Command -ComputerName '${h}' -ScriptBlock { (Get-AppxPackage -AllUsers -Name 'XelionWindowsDesktop' -EA SilentlyContinue | Select-Object -First 1).Version } -EA Stop)) } catch { '' }`,
        15000,
      )
      setInstalledVersion(res.stdout.trim() || null)
    } catch { setInstalledVersion(null) }
  }

  function startInstallation() {
    setShowConfirm(false)
    if (!installer?.content) { flash('Kein Installer hinterlegt.'); return }
    store.startInstall(hostname.trim(), installer.content)
    log('Xelion-Installation gestartet', `Zielrechner: ${hostname.trim()} (Version ${installer.version})`)
  }

  function fmtElapsed(ms: number): string {
    const s = Math.floor(ms / 1000); const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2">
          <Phone size={22} className="text-teal-400" />
          <h2 className="text-lg font-bold text-foreground">Xelion Desktop Installation</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Silent-Installation der Xelion-App (MSIX) aus der Ferne auf einem Zielrechner</p>
      </div>

      <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
        <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300">Xelion wird komplett ohne Klick installiert. Da es sich um eine MSIX-App handelt, erfolgt die Installation im Kontext des <strong>am Zielrechner angemeldeten Benutzers</strong> — dieser muss angemeldet sein. Der Client benoetigt Internetzugang zu appinstaller.xelion.com.</p>
      </div>

      {/* Installer-Verwaltung */}
      <Card title="Installer-Quelle" icon={<PackageOpen size={15} />} subtitle="Zentrale .appinstaller-Datei (austauschbar bei neuer Xelion-Version)">
        {loadingInstaller ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader size={14} className="animate-spin" />Lade Installer-Info...</div>
        ) : installer ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground space-y-0.5 flex-1 min-w-[220px]">
              <p><strong className="text-foreground">Version:</strong> {installer.version}</p>
              <p><strong className="text-foreground">Datei:</strong> {installer.fileName}</p>
              <p>
                <strong className="text-foreground">Quelle:</strong>{' '}
                {installer.source === 'central'
                  ? <span className="text-emerald-300">zentral (Netzlaufwerk)</span>
                  : <span className="text-foreground font-medium">mitgelieferter Standard</span>}
                {installer.uploadedAt && <span className="ml-2 opacity-70">· {fmtDateTime(installer.uploadedAt)} von {installer.uploadedBy}</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={reloadInstaller} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground" title="Aktualisieren"><RefreshCw size={14} /></button>
              <button onClick={handleReplace} disabled={uploading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}Installer austauschen
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-xs text-red-300 flex-1">Kein Installer gefunden. Bitte eine .appinstaller-Datei einpflegen.</p>
            <button onClick={handleReplace} disabled={uploading} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}Installer einpflegen
            </button>
          </div>
        )}
      </Card>

      {/* Konfiguration */}
      {phase === 'config' && (
        <Card title="Konfiguration" icon={<Phone size={15} />}>
          <div className="space-y-4">
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Hostname oder IP-Adresse des Zielrechners *</label>
              <input value={hostname} onChange={e => setHostname(e.target.value)} placeholder="z.B. DEHAM12345678 oder 10.20.30.40"
                className={`w-full px-3 py-2 rounded-lg bg-background border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 ${hostname && !targetValid ? 'border-red-500/50' : 'border-border'}`} />
              {hostname && !targetValid && <p className="text-[10px] text-red-400 mt-1">Bitte einen Hostnamen (beginnt mit DE) oder eine gültige IP-Adresse eingeben</p>}
              {targetIsIp && <p className="text-[10px] text-amber-400 mt-1">Verbindung per IP nutzt WinRM/NTLM — die IP wird bei der Prüfung automatisch zu den TrustedHosts hinzugefügt (lokale Admin-Rechte nötig).</p>}
            </div>
            <div className="flex gap-2 pt-2 border-t border-border">
              <button onClick={runPreChecks} disabled={!targetValid || !installer?.content}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${targetValid && installer?.content ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                <Play size={14} />Verbindung pruefen
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Prechecks */}
      {phase === 'prechecks' && (
        <Card title="Vorab-Checks" icon={<CheckCircle size={15} />}>
          <div className="space-y-2">
            {[
              { key: 'hostname', label: 'Gültiges Ziel (Hostname DE… oder IP)' },
              { key: 'installer', label: 'Installer hinterlegt' },
              { key: 'ping', label: 'Zielrechner online (Ping)' },
              { key: 'winrm', label: 'WinRM auf Zielrechner aktiviert' },
              { key: 'remote', label: 'Remote-Verbindung moeglich (WinRM)' },
            ].map(c => (
              <div key={c.key} className="flex items-center gap-2 text-xs">
                {preChecks[c.key] === 'loading' && <Loader size={14} className="animate-spin text-blue-400" />}
                {preChecks[c.key] === 'ok' && <CheckCircle size={14} className="text-green-400" />}
                {preChecks[c.key] === 'fail' && <XCircle size={14} className="text-red-400" />}
                {(!preChecks[c.key] || preChecks[c.key] === 'pending') && <div className="w-3.5 h-3.5 rounded-full border border-border" />}
                <span className="text-foreground">{c.label}</span>
              </div>
            ))}

            {/* Info (nicht blockierend): angemeldeter Benutzer */}
            <div className="flex items-center gap-2 text-xs pt-1">
              <Info size={14} className="text-blue-400 shrink-0" />
              <span className="text-foreground">
                Angemeldeter Benutzer: {loggedOnUser
                  ? <strong>{loggedOnUser}</strong>
                  : <span className="text-muted-foreground">wird zur Laufzeit ermittelt — Installation laeuft im Kontext des aktiven Benutzers</span>}
              </span>
            </div>

            {installedVersion && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mt-2">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-foreground">Xelion ist bereits installiert (Version {installedVersion}). Beim Start wird vorher nachgefragt, ob neu installiert werden soll.</p>
              </div>
            )}

            <div className="flex gap-2 pt-3 border-t border-border">
              <button onClick={() => setLocalPhase('config')} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border hover:text-foreground">Zurueck</button>
              <button onClick={() => setShowConfirm(true)} disabled={!allPreChecksOk}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${allPreChecksOk ? 'bg-teal-600 hover:bg-teal-500 text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                <Play size={14} />Installation starten
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Running / Done / Error */}
      {(phase === 'running' || phase === 'done' || phase === 'error') && (
        <>
          {phase === 'running' && (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
              <Loader size={18} className="animate-spin text-blue-400" />
              <div>
                <p className="text-sm font-semibold text-foreground">Installation laeuft auf {store.hostname}...</p>
                <p className="text-xs text-muted-foreground">Laufzeit: {fmtElapsed(elapsed)}</p>
              </div>
            </div>
          )}
          {phase === 'done' && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
              <CheckCircle size={18} className="text-green-400" />
              <p className="text-sm font-semibold text-foreground">Xelion-Installation auf {store.hostname} abgeschlossen ({fmtElapsed(elapsed)})</p>
            </div>
          )}
          {phase === 'error' && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <XCircle size={18} className="text-red-400" />
              <div>
                <p className="text-sm font-semibold text-foreground">Installation fehlgeschlagen</p>
                <p className="text-xs text-red-300 mt-0.5">{store.errorMsg}</p>
              </div>
            </div>
          )}

          <Card title="Schritt-Fortschritt" icon={<Clock size={15} />}>
            <div className="space-y-1">
              {XELION_STEPS.map(step => {
                const st = store.stepStatus[step.id] || 'pending'
                return (
                  <div key={step.id} className="flex items-center gap-2 text-xs py-0.5">
                    {st === 'running' && <Loader size={12} className="animate-spin text-blue-400" />}
                    {st === 'success' && <CheckCircle size={12} className="text-green-400" />}
                    {st === 'warning' && <AlertTriangle size={12} className="text-yellow-400" />}
                    {st === 'error' && <XCircle size={12} className="text-red-400" />}
                    {st === 'pending' && <div className="w-3 h-3 rounded-full border border-border" />}
                    <span className={st === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>{step.label}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Live-Log" icon={<Terminal size={15} />}>
            <div ref={logRef} className="max-h-64 overflow-y-auto bg-background rounded-lg border border-border p-3 font-mono text-[11px] text-muted-foreground space-y-0.5">
              {store.logLines.length === 0 ? <p className="text-center py-4">Warte auf Output...</p> : store.logLines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </Card>

          {(phase === 'done' || phase === 'error') && (
            <div className="flex gap-2">
              <button onClick={() => { store.reset(); setLocalPhase('config'); setPreChecks({}); setInstalledVersion(null) }} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-foreground">Zurueck zur Konfiguration</button>
              {phase === 'error' && <button onClick={startInstallation} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Erneut versuchen</button>}
            </div>
          )}
        </>
      )}

      {/* Confirm */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowConfirm(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4"><AlertTriangle size={20} className="text-yellow-400" /><h3 className="text-lg font-bold text-foreground">{installedVersion ? 'Xelion ist bereits installiert' : 'Installation starten?'}</h3></div>
            {installedVersion ? (
              <p className="text-sm text-foreground mb-3">Auf <strong>{hostname}</strong> ist Xelion bereits installiert (Version <strong>{installedVersion}</strong>). Trotzdem neu installieren{installer && installer.version !== installedVersion ? <> (auf Version <strong>{installer.version}</strong>)</> : null}?</p>
            ) : (
              <p className="text-sm text-foreground mb-3">Xelion auf <strong>{hostname}</strong> installieren?</p>
            )}
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 mb-4 space-y-1">
              <p><strong>Installer-Version:</strong> {installer?.version}</p>
              {installedVersion && <p><strong>Aktuell installiert:</strong> {installedVersion}</p>}
              <p><strong>Modus:</strong> Silent, im Kontext des angemeldeten Benutzers</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:bg-muted/20">Abbrechen</button>
              <button onClick={startInstallation} className="px-4 py-2 rounded-lg text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white">{installedVersion ? 'Trotzdem neu installieren' : 'Installation starten'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-card border border-border rounded-lg shadow-2xl px-4 py-3 text-sm text-foreground max-w-sm">{toast}</div>
      )}
    </div>
  )
}
