import { useState, useEffect } from 'react'
import { ShieldCheck, User, Lock, LogIn, Eye, EyeOff, AlertTriangle, CheckCircle, Loader, KeyRound, WifiOff, RefreshCw } from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import type { AppSession } from '../types/auth'

type View = 'main' | 'recovery-key' | 'recovery-newpw' | 'first-run-key'

export default function Login() {
  const setSession = useAuthStore(s => s.setSession)
  const networkAvailable = useAuthStore(s => s.networkAvailable)
  const setNetworkAvailable = useAuthStore(s => s.setNetworkAvailable)
  const firstRunKey = useAuthStore(s => s.firstRunRecoveryKey)
  const setFirstRunKey = useAuthStore(s => s.setFirstRunRecoveryKey)

  const [view, setView] = useState<View>(firstRunKey ? 'first-run-key' : 'main')

  // Admin login form
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // SSO
  const [ssoLoading, setSsoLoading] = useState(false)
  const [ssoError, setSsoError] = useState('')

  // Recovery
  const [recoveryKey, setRecoveryKey] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [recoverySuccess, setRecoverySuccess] = useState(false)

  // Network check
  const [checkingNetwork, setCheckingNetwork] = useState(false)

  useEffect(() => {
    if (firstRunKey) setView('first-run-key')
  }, [firstRunKey])

  async function retryNetwork() {
    setCheckingNetwork(true)
    const ok = await api().netIsAvailable()
    setNetworkAvailable(ok)
    setCheckingNetwork(false)
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await api().authLogin(username.trim(), password)
      if (res.success && res.user) {
        const session: AppSession = {
          user: res.user,
          loginMethod: 'password',
          loginTime: new Date().toISOString(),
        }
        setSession(session)
      } else {
        setLoginError(res.error ?? 'Anmeldung fehlgeschlagen')
      }
    } catch (err) {
      setLoginError('Verbindungsfehler: ' + String(err))
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleSso() {
    setSsoLoading(true)
    setSsoError('')
    try {
      const res = await api().authSso()
      const session: AppSession = {
        user: res.user,
        loginMethod: 'sso',
        loginTime: new Date().toISOString(),
      }
      setSession(session)
    } catch (err) {
      setSsoError('Windows-Anmeldung fehlgeschlagen: ' + String(err))
    } finally {
      setSsoLoading(false)
    }
  }

  async function handleRecoveryKeyCheck(e: React.FormEvent) {
    e.preventDefault()
    setRecoveryLoading(true)
    setRecoveryError('')
    try {
      const ok = await api().authVerifyRecovery(recoveryKey.trim().toUpperCase())
      if (ok) {
        setView('recovery-newpw')
      } else {
        setRecoveryError('Ungültiger Recovery-Key')
      }
    } catch {
      setRecoveryError('Fehler beim Prüfen des Recovery-Keys')
    } finally {
      setRecoveryLoading(false)
    }
  }

  async function handleRecoveryReset(e: React.FormEvent) {
    e.preventDefault()
    if (newPw !== newPw2) { setRecoveryError('Passwörter stimmen nicht überein'); return }
    if (newPw.length < 6) { setRecoveryError('Passwort muss mindestens 6 Zeichen haben'); return }
    setRecoveryLoading(true)
    setRecoveryError('')
    try {
      await api().authResetMasterPassword(newPw)
      setRecoverySuccess(true)
      setTimeout(() => { setView('main'); setRecoverySuccess(false); setNewPw(''); setNewPw2(''); setRecoveryKey('') }, 2500)
    } catch {
      setRecoveryError('Fehler beim Zurücksetzen des Passworts')
    } finally {
      setRecoveryLoading(false)
    }
  }

  // ── View: First-run recovery key display ─────────────────────────────────
  if (view === 'first-run-key' && firstRunKey) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background px-8">
        <div className="w-full max-w-lg bg-card border border-amber-500/40 rounded-2xl p-8 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <KeyRound size={22} className="text-amber-400 shrink-0" />
            <h2 className="text-lg font-bold text-foreground">Erstkonfiguration abgeschlossen</h2>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-400">⚠ Bitte notieren Sie diesen Recovery-Key!</p>
            <p className="text-xs text-muted-foreground">Er wird benötigt, falls Sie Ihr Master-Admin-Passwort vergessen. Er wird nur jetzt einmal angezeigt.</p>
            <div className="mt-3 bg-black/30 rounded-lg px-4 py-3 font-mono text-lg tracking-widest text-amber-300 text-center select-all">
              {firstRunKey.match(/.{1,4}/g)?.join(' ')}
            </div>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>• Master Admin: <span className="text-foreground font-mono">Davidxe</span></p>
            <p>• Netzlaufwerk-Pfad: {api ? '\\\\w3172\\skf Marine\\...\\Tool IT\\recovery\\' : '...'}</p>
            <p>• Der verschlüsselte Backup liegt zusätzlich im Recovery-Ordner</p>
          </div>
          <button
            onClick={() => { setFirstRunKey(null); setView('main') }}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            Verstanden — Zur Anmeldung
          </button>
        </div>
      </div>
    )
  }

  // ── View: Recovery key entry ─────────────────────────────────────────────
  if (view === 'recovery-key') {
    return (
      <LoginFrame>
        <h2 className="text-base font-semibold text-foreground mb-1">Passwort vergessen</h2>
        <p className="text-xs text-muted-foreground mb-5">Geben Sie den Recovery-Key ein der beim ersten Start angezeigt wurde.</p>
        <form onSubmit={handleRecoveryKeyCheck} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Recovery-Key</label>
            <input
              type="text"
              value={recoveryKey}
              onChange={e => setRecoveryKey(e.target.value.toUpperCase())}
              placeholder="XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX"
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground font-mono text-sm focus:outline-none focus:border-primary"
            />
          </div>
          {recoveryError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12}/>{recoveryError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setView('main'); setRecoveryError(''); setRecoveryKey('') }}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors">
              Zurück
            </button>
            <button type="submit" disabled={recoveryLoading || !recoveryKey.trim()}
              className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-colors">
              {recoveryLoading ? <Loader size={14} className="animate-spin mx-auto" /> : 'Prüfen'}
            </button>
          </div>
        </form>
      </LoginFrame>
    )
  }

  // ── View: Recovery new password ──────────────────────────────────────────
  if (view === 'recovery-newpw') {
    return (
      <LoginFrame>
        {recoverySuccess ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle size={40} className="text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-400">Passwort erfolgreich zurückgesetzt!</p>
            <p className="text-xs text-muted-foreground">Sie werden zur Anmeldung weitergeleitet…</p>
          </div>
        ) : (
          <>
            <h2 className="text-base font-semibold text-foreground mb-1">Neues Passwort setzen</h2>
            <p className="text-xs text-muted-foreground mb-5">Recovery-Key bestätigt. Setzen Sie jetzt ein neues Passwort für den Master Admin.</p>
            <form onSubmit={handleRecoveryReset} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Neues Passwort</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Passwort bestätigen</label>
                <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary" />
              </div>
              {recoveryError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12}/>{recoveryError}</p>}
              <button type="submit" disabled={recoveryLoading || !newPw || !newPw2}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-colors">
                {recoveryLoading ? <Loader size={14} className="animate-spin mx-auto" /> : 'Passwort setzen'}
              </button>
            </form>
          </>
        )}
      </LoginFrame>
    )
  }

  // ── View: Main login ─────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-background">
      {/* Left panel — branding */}
      <div className="hidden lg:flex w-80 shrink-0 flex-col items-center justify-center bg-primary/5 border-r border-border px-8 gap-6">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <ShieldCheck size={32} className="text-primary-foreground" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Admin Tool</h1>
          <p className="text-xs text-muted-foreground mt-1">SKF Marine · IT Administration</p>
        </div>
        <div className="mt-4 space-y-2 w-full">
          {['Abfrage-Menü', 'Remote Doc', 'Standort-Übersicht', 'Benutzerverwaltung'].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle size={12} className="text-primary shrink-0" />
              {f}
            </div>
          ))}
        </div>
        <div className="mt-auto text-[10px] text-muted-foreground/50 text-center">
          Entwickelt von Davide Bazzani<br />v1.0.0 Beta
        </div>
      </div>

      {/* Right panel — login forms */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Network warning */}
        {!networkAvailable && (
          <div className="w-full max-w-sm mb-6 flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <WifiOff size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-400">Netzlaufwerk nicht erreichbar</p>
              <p className="text-[11px] text-amber-400/70">Benutzerverwaltung und Logging nicht verfügbar.</p>
            </div>
            <button onClick={retryNetwork} disabled={checkingNetwork}
              className="shrink-0 p-1 rounded hover:bg-amber-500/20 text-amber-400 transition-colors">
              {checkingNetwork ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          </div>
        )}

        <div className="w-full max-w-sm space-y-5">
          {/* Logo (mobile) */}
          <div className="flex lg:hidden items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <ShieldCheck size={20} className="text-primary-foreground" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Admin Tool</p>
              <p className="text-[11px] text-muted-foreground">SKF Marine</p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground">Anmeldung</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Wählen Sie Ihre Anmeldeoption</p>
          </div>

          {/* Admin login */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground">Admin-Anmeldung</span>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-3">
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Benutzername"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Passwort"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {loginError && (
                <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                  <AlertTriangle size={12} className="shrink-0" />{loginError}
                </div>
              )}
              <button
                type="submit"
                disabled={loginLoading || !username.trim() || !password}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loginLoading ? <Loader size={14} className="animate-spin" /> : <><LogIn size={14} /> Anmelden</>}
              </button>
            </form>
            <button onClick={() => { setView('recovery-key'); setLoginError('') }}
              className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline">
              Passwort vergessen?
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">oder</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* SSO */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <User size={14} className="text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold text-foreground">Windows-Anmeldung (SSO)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Anmeldung mit dem aktuellen Windows-Benutzer. Gibt nur Lese-Rechte.
            </p>
            {ssoError && (
              <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                <AlertTriangle size={12} className="shrink-0" />{ssoError}
              </div>
            )}
            <button
              onClick={handleSso}
              disabled={ssoLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              {ssoLoading
                ? <Loader size={14} className="animate-spin" />
                : <><User size={14} /> Mit Windows-Konto anmelden</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LoginFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center h-screen bg-background px-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-6 shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <ShieldCheck size={16} className="text-primary-foreground" />
          </div>
          <p className="text-sm font-bold text-foreground">Admin Tool</p>
        </div>
        {children}
      </div>
    </div>
  )
}
