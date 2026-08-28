import { useEffect, useRef, useState, lazy, Suspense } from 'react'
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
import DepartmentsOverview from './screens/DepartmentsOverview'
import OrganizationStructure from './screens/OrganizationStructure'
import UserOverview from './screens/UserOverview'
import Checklists from './screens/Checklists'
import ScheduledTasks from './screens/ScheduledTasks'
import BugMailbox from './screens/BugMailbox'
import Dashboards from './screens/Dashboards'
import PCMigration from './screens/PCMigration'
import SoftwareInventory from './screens/SoftwareInventory'
import InfrastructureMarine from './screens/InfrastructureMarine'
import SoftwareInstallations from './screens/SoftwareInstallations'
import PresentationMode from './screens/PresentationMode'
import PresentationPlayer from './screens/PresentationPlayer'
import TaskManagerWindow from './components/device/TaskManagerWindow'
import BugReportWidget from './components/BugReportWidget'
import BetaBanner from './components/BetaBanner'
import LicenseAlarmController from './components/licenses/LicenseAlarmController'
import EmployeeReminderController from './components/employees/EmployeeReminderController'
import BackupSchedulerController from './components/backups/BackupSchedulerController'
import SoftwareScanController from './components/softwareInventory/SoftwareScanController'
import PrinterConnectionScanController from './components/printer/PrinterConnectionScanController'
import PrinterIpScanController from './components/printer/PrinterIpScanController'
import DeviceScanController from './components/device/DeviceScanController'
import RadarScanController from './components/scans/RadarScanController'
import VlanScanController from './components/scans/VlanScanController'
import ServerMonitorController from './components/server/ServerMonitorController'
import ErrorFlashOverlay from './components/ErrorFlashOverlay'
import { DossierProvider } from './components/person/PersonDossier'
import { DeviceDossierProvider } from './components/device/DeviceDossier'
import { PrinterDossierProvider } from './components/printer/PrinterDossier'
import type { Screen } from './types'
import { api } from './electronAPI'
import { ensureDailyAdUsers } from './services/adUserDirectory'

// Lazy-loaded screens (per Performance-Regeln: erst laden wenn geöffnet)
const ITGuru = lazy(() => import('./screens/ITGuru'))
const PCDiagnosis = lazy(() => import('./screens/PCDiagnosis'))
const NetworkRadar = lazy(() => import('./screens/NetworkRadar'))
const VlanOverview = lazy(() => import('./screens/VlanOverview'))
const KnowledgeBase = lazy(() => import('./screens/KnowledgeBase'))
const KnowledgeSearch = lazy(() => import('./knowledge/KnowledgeSearch'))
const InfrastructureProjects = lazy(() => import('./screens/InfrastructureProjects'))
const GroupSearch = lazy(() => import('./screens/GroupSearch'))
const AccessPoints = lazy(() => import('./screens/AccessPoints'))
const Onboarding = lazy(() => import('./screens/Onboarding'))
const Licenses = lazy(() => import('./screens/Licenses'))
const HardwareInventory = lazy(() => import('./screens/HardwareInventory'))
const AccessoryInventory = lazy(() => import('./screens/AccessoryInventory'))
const UserPresence = lazy(() => import('./screens/UserPresence'))
const EmployeeManagement = lazy(() => import('./screens/EmployeeManagement'))
const EndpointDevices = lazy(() => import('./screens/EndpointDevices'))
const GpuDriverMgmt = lazy(() => import('./screens/GpuDriverMgmt'))
const TreiberInstallation = lazy(() => import('./screens/TreiberInstallation'))
const ServiceNow = lazy(() => import('./screens/ServiceNow'))
const PdfTools = lazy(() => import('./pdftools'))
const PhoneAssignment = lazy(() => import('./screens/PhoneAssignment'))
const Backups = lazy(() => import('./screens/Backups'))
const USV = lazy(() => import('./screens/USV'))
const ProactiveRadar = lazy(() => import('./screens/ProactiveRadar'))
const ServerMonitor = lazy(() => import('./screens/ServerMonitor'))

function renderScreen(screen: Screen) {
  switch (screen) {
    case 'home':              return <Home />
    case 'query-menu':        return <QueryMenu />
    case 'results':           return <Results />
    case 'user-info':         return <UserInfo />
    case 'xelion':            return <XelionCheck />
    case 'rufnummer-vergabe': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><PhoneAssignment /></Suspense>
    case 'remote-doc':        return <RemoteDoc />
    case 'trickbox':          return <Trickkiste />
    case 'it-guru':           return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><ITGuru /></Suspense>
    case 'settings':          return <Settings />
    case 'user-management':   return <UserManagement />
    case 'user-logs':         return <UserLogs />
    case 'location-overview': return <LocationOverview />
    case 'departments-overview': return <DepartmentsOverview />
    case 'organization-structure': return <OrganizationStructure />
    case 'user-overview': return <UserOverview />
    case 'user-presence': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><UserPresence /></Suspense>
    case 'employee-management': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><EmployeeManagement /></Suspense>
    case 'onboarding': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Onboarding /></Suspense>
    case 'endpoint-devices': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><EndpointDevices /></Suspense>
    case 'gpu-driver-mgmt': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><GpuDriverMgmt /></Suspense>
    case 'treiber-installation': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><TreiberInstallation /></Suspense>
    case 'servicenow': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><ServiceNow /></Suspense>
    case 'gruppen-suche': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><GroupSearch /></Suspense>
    case 'access-points': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><AccessPoints /></Suspense>
    case 'licenses': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Licenses /></Suspense>
    case 'hardware-inventory': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><HardwareInventory /></Suspense>
    case 'accessory-inventory': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><AccessoryInventory /></Suspense>
    case 'pdf-tools': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><PdfTools /></Suspense>
    case 'checklists': return <Checklists />
    case 'scheduled-tasks':   return <ScheduledTasks />
    case 'bug-mailbox':       return <BugMailbox />
    case 'dashboards':        return <Dashboards />
    case 'network-radar':     return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><NetworkRadar /></Suspense>
    case 'vlan-overview':     return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><VlanOverview /></Suspense>
    case 'knowledge-base':   return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><KnowledgeBase /></Suspense>
    case 'knowledge-search': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><KnowledgeSearch /></Suspense>
    case 'pc-migration':      return <PCMigration />
    case 'software-inventory': return <SoftwareInventory />
    case 'pc-diagnosis':      return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><PCDiagnosis /></Suspense>
    case 'infra-marine':      return <InfrastructureMarine />
    case 'infra-projects':    return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><InfrastructureProjects /></Suspense>
    case 'software-installations': return <SoftwareInstallations />
    case 'presentation-mode': return <PresentationMode />
    case 'backups': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Backups /></Suspense>
    case 'usv': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><USV /></Suspense>
    case 'proactive-radar': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><ProactiveRadar /></Suspense>
    case 'server': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><ServerMonitor /></Suspense>
    default:                  return <Home />
  }
}

export default function App() {
  // Presentation player runs in a separate Electron window using the same
  // bundle but with hash "#presentation". Bypass all auth/init logic.
  if (typeof window !== 'undefined' && window.location.hash === '#presentation') {
    return <PresentationPlayer />
  }
  // Remote-Task-Manager läuft in einem eigenständigen Fenster (#taskmgr, ?host=…) —
  // gleiches Bundle, aber ohne Auth/Sidebar, nur die Task-Manager-Ansicht.
  if (typeof window !== 'undefined' && window.location.hash === '#taskmgr') {
    return <TaskManagerWindow />
  }

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

  // Benutzerverzeichnis: einmal pro Tag automatisch frisch aus AD laden, sobald
  // ein Benutzer angemeldet ist. Laeuft im Hintergrund (blockiert die UI nicht)
  // und legt den Stand zentral ab, damit alle Clients dieselben Daten sehen
  // (u. a. E-Mail-Adressen fuer die Endgeraete-Uebersicht).
  useEffect(() => {
    if (!session) return
    void ensureDailyAdUsers().catch(() => {})
  }, [session?.user.username])

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
    <DossierProvider>
     <DeviceDossierProvider>
      <PrinterDossierProvider>
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
            <LicenseAlarmController />
            <EmployeeReminderController />
            <BackupSchedulerController />
            <SoftwareScanController />
            <PrinterConnectionScanController />
            <PrinterIpScanController />
            <DeviceScanController />
            <RadarScanController />
            <VlanScanController />
            <ServerMonitorController />
            <ErrorFlashOverlay />
          </main>
        </div>
      </div>
      </PrinterDossierProvider>
     </DeviceDossierProvider>
    </DossierProvider>
  )
}
