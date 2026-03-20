import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './store/appStore'
import { useAuthStore } from './store/authStore'
import { ErrorBoundary } from './components/ErrorBoundary'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Login from './screens/Login'
import Home from './screens/Home'
import QueryMenu from './screens/QueryMenu'
import Results from './screens/Results'
import UserInfo from './screens/UserInfo'
import XelionCheck from './screens/XelionCheck'
import RemoteDoc from './screens/RemoteDoc'
import Trickkiste from './screens/Trickkiste'
import Settings from './screens/Settings'
import UserManagement from './screens/UserManagement'
import UserLogs from './screens/UserLogs'
import LocationOverview from './screens/LocationOverview'
import ScheduledTasks from './screens/ScheduledTasks'
import BugMailbox from './screens/BugMailbox'
import Dashboards from './screens/Dashboards'
import BugReportWidget from './components/BugReportWidget'
import BetaBanner from './components/BetaBanner'
import type { Screen } from './types'
import { api } from './electronAPI'

function renderScreen(screen: Screen) {
  switch (screen) {
    case 'home':              return <Home />
    case 'query-menu':        return <QueryMenu />
    case 'results':           return <Results />
    case 'user-info':         return <UserInfo />
    case 'xelion':            return <XelionCheck />
    case 'remote-doc':        return <RemoteDoc />
    case 'trickkiste':        return <Trickkiste />
    case 'settings':          return <Settings />
    case 'user-management':   return <UserManagement />
    case 'user-logs':         return <UserLogs />
    case 'location-overview': return <LocationOverview />
    case 'scheduled-tasks':   return <ScheduledTasks />
    case 'bug-mailbox':       return <BugMailbox />
    case 'dashboards':        return <Dashboards />
    default:                  return <Home />
  }
}

export default function App() {
  const screen       = useAppStore(s => s.screen)
  const setIsAdmin   = useAppStore(s => s.setIsAdmin)
  const setAdminChecked = useAppStore(s => s.setAdminChecked)
  const setSettings  = useAppStore(s => s.setSettings)
  const settings     = useAppStore(s => s.settings)

  const session         = useAuthStore(s => s.session)
  const setNetworkAvailable = useAuthStore(s => s.setNetworkAvailable)
  const setInitialized  = useAuthStore(s => s.setInitialized)
  const setFirstRunKey  = useAuthStore(s => s.setFirstRunRecoveryKey)
  const initialized     = useAuthStore(s => s.initialized)

  const [betaMode, setBetaMode] = useState(true)
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Heartbeat management — set on login, refresh every 2 min, clear on logout
  useEffect(() => {
    const el = window.electronAPI
    if (!el) return

    if (session) {
      const username = session.user.username

      // Check for stale heartbeat (= previous crash)
      el.heartbeatCheck(username).then(async stale => {
        if (stale) {
          // App crashed last time — send notification email
          try {
            const emailCfg = await el.netReadJson<{ email: string; smtp: string; port: number; useTls?: boolean; notifyEmail: string }>(`email_config/${username}.json`)
            if (emailCfg?.notifyEmail && emailCfg.email && emailCfg.smtp) {
              await el.sendEmailRaw({
                to: emailCfg.notifyEmail,
                subject: 'IT Admin Tool – Absturz erkannt',
                body: `Das IT Admin Tool wurde nicht sauber beendet (Absturz oder Neustart).\n\nBenutzer: ${session.user.displayName} (${username})\nLetzter Heartbeat: ${stale.timestamp}\n\nDiese Nachricht wurde automatisch beim nächsten Start gesendet.`,
                smtp: emailCfg.smtp,
                port: emailCfg.port,
                useTls: emailCfg.useTls,
                from: emailCfg.email,
              })
            }
          } catch {}
        }
      }).catch(() => {})

      // Set heartbeat immediately and refresh every 2 minutes
      el.heartbeatSet(username).catch(() => {})
      heartbeatTimer.current = setInterval(() => {
        el.heartbeatSet(username).catch(() => {})
      }, 2 * 60 * 1000)
    } else {
      // Logged out — clear interval (heartbeat:clear handled in authStore/logout)
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current)
        heartbeatTimer.current = null
      }
    }

    return () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current)
        heartbeatTimer.current = null
      }
    }
  }, [session?.user.username])

  // On mount: run auth init + Windows admin check + load settings
  useEffect(() => {
    const el = window.electronAPI
    if (!el) return

    // Check Windows admin elevation (separate from app auth)
    el.checkAdmin()
      .then(v => { setIsAdmin(v); setAdminChecked(true) })
      .catch(() => setAdminChecked(true))

    // Load saved settings
    el.getSettings()
      .then(s => {
        const merged = { ...settings, ...s }
        setSettings(merged as typeof settings)
        if (merged.theme === 'light') document.documentElement.classList.add('light')
      })
      .catch(() => {})

    // Initialize auth / network storage
    el.authInit()
      .then(res => {
        setNetworkAvailable(res.networkAvailable)
        if (res.isFirstRun && res.recoveryKey) {
          setFirstRunKey(res.recoveryKey)
        }
        setInitialized(true)

        // Load app config for beta mode
        el.getAppConfig().then(cfg => setBetaMode(cfg?.betaMode ?? true)).catch(() => {})
      })
      .catch(() => {
        setNetworkAvailable(false)
        setInitialized(true)
      })
  }, [])

  // Apply theme
  useEffect(() => {
    if (settings.theme === 'light') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }, [settings.theme])

  // Show nothing until initialized (avoids flash of login screen)
  if (!initialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center animate-pulse">
            <span className="text-primary text-lg">🔐</span>
          </div>
          <p className="text-sm text-muted-foreground">Wird geladen…</p>
        </div>
      </div>
    )
  }

  // Show login if not authenticated
  if (!session) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          <Login />
        </div>
      </div>
    )
  }

  // Main app — authenticated
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TitleBar />
      <BetaBanner betaMode={betaMode} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden relative">
          <ErrorBoundary key={screen}>
            {renderScreen(screen)}
          </ErrorBoundary>
          <BugReportWidget currentScreen={screen} />
        </main>
      </div>
    </div>
  )
}
