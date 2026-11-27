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
import SoundFixWindow from './components/device/SoundFixWindow'
import BugReportWidget from './components/BugReportWidget'
import BetaBanner from './components/BetaBanner'
import LicenseAlarmController from './components/licenses/LicenseAlarmController'
import EmployeeReminderController from './components/employees/EmployeeReminderController'
import DepartureEmailController from './components/scans/DepartureEmailController'
import BackupSchedulerController from './components/backups/BackupSchedulerController'
import SoftwareScanController from './components/softwareInventory/SoftwareScanController'
import PrinterConnectionScanController from './components/printer/PrinterConnectionScanController'
import PrinterIpScanController from './components/printer/PrinterIpScanController'
import DeviceScanController from './components/device/DeviceScanController'
import RadarScanController from './components/scans/RadarScanController'
import VlanScanController from './components/scans/VlanScanController'
import ServerMonitorController from './components/server/ServerMonitorController'
import GameInviteController from './components/games/GameInviteController'
import ChatController from './components/chat/ChatController'
import AufnahmeController from './aufnahme/AufnahmeController'
import TonerWarnungController from './components/printer/TonerWarnungController'
import MonitorController from './monitoring/MonitorController'
import { MonitorDialogSlot } from './monitoring/MonitorDialog'
import LostDeviceScanController from './components/scans/LostDeviceScanController'
import NetworkDrivesScanController from './components/scans/NetworkDrivesScanController'
import WeekendCheckController from './components/scans/WeekendCheckController'
import PcVerlaufController, { PcFehlerController, WartelisteController } from './components/scans/PcVerlaufController'
import KostenVerlaufController from './components/scans/KostenVerlaufController'
import TerminScanController from './components/checklists/TerminScanController'
import EuroparScanController from './components/scans/EuroparScanController'
import WindowsUpdateController from './components/scans/WindowsUpdateController'
import EuroparStagingController from './components/scans/EuroparStagingController'
import NetworkDriveSetupController from './components/scans/NetworkDriveSetupController'
import AutoSetupController from './components/scans/AutoSetupController'
import Nis2AccessScanController from './components/scans/Nis2AccessScanController'
import DriverRolloutController from './components/scans/DriverRolloutController'
import ErrorFlashOverlay from './components/ErrorFlashOverlay'
import AutomatikLeiterController from './components/AutomatikLeiterController'
import MailPcController from './components/MailPcController'
import GeplanteAufgabenController from './components/scans/GeplanteAufgabenController'
import { darfAutomatik } from './services/automatikLeiter'
import { startLogoAusblenden } from './utils/startLogo'
import { DossierProvider, PersonDossierSlot } from './components/person/PersonDossier'
import { DeviceDossierProvider, DeviceDossierSlot } from './components/device/DeviceDossier'
import { PrinterDossierProvider, PrinterDossierSlot } from './components/printer/PrinterDossier'
import type { Screen } from './types'
import { api, setzePsQuellenHinweis } from './electronAPI'
import { starteMailProtokoll } from './services/aktivitaet'

// Aktivitätsprotokoll: Mailversand mitschreiben (einmal beim Laden)
starteMailProtokoll()
// Zugriffsprotokoll: Fernbefehle ohne eigene Quellangabe bekommen den offenen Bildschirm mit
setzePsQuellenHinweis(() => {
  const s = useAppStore.getState().screen
  return `offen: ${s || '?'}${typeof document !== 'undefined' && document.hidden ? ', Tool im Hintergrund' : ''}`
})
import { ensureDailyAdUsers } from './services/adUserDirectory'
import LockScreen from './components/LockScreen'
import { loadAppLock, canBypassLock, type AppLock } from './services/appLock'

import AusgeblendetHinweis, { useAusgeblendet } from './components/AusgeblendetHinweis'

// Lazy-loaded screens (per Performance-Regeln: erst laden wenn geöffnet)
const Einstellungen = lazy(() => import('./einstellungen/Einstellungen'))
const AufnahmeLeiste = lazy(() => import('./aufnahme/AufnahmeLeiste'))
const ITGuru = lazy(() => import('./screens/ITGuru'))
const PCDiagnosis = lazy(() => import('./screens/PCDiagnosis'))
const Startseite = lazy(() => import('./screens/Startseite'))
const NetworkRadar = lazy(() => import('./screens/NetworkRadar'))
const VlanOverview = lazy(() => import('./screens/VlanOverview'))
const KnowledgeBase = lazy(() => import('./screens/KnowledgeBase'))
const KnowledgeSearch = lazy(() => import('./knowledge/KnowledgeSearch'))
const InfrastructureProjects = lazy(() => import('./screens/InfrastructureProjects'))
const GroupSearch = lazy(() => import('./screens/GroupSearch'))
const AccessPoints = lazy(() => import('./screens/AccessPoints'))
const ClientGeraete = lazy(() => import('./screens/ClientGeraete'))
const DruckerUebersicht = lazy(() => import('./screens/DruckerUebersicht'))
const OtDevices = lazy(() => import('./screens/OtDevices'))
const PruffeldZoll = lazy(() => import('./screens/PruffeldZoll'))
const Verwaltungsgebaeude = lazy(() => import('./screens/Verwaltungsgebaeude'))
const Games = lazy(() => import('./screens/Games'))
const Pausenraum = lazy(() => import('./screens/Pausenraum'))
// Brain Trainer: eigenständiger Bereich im Pausenraum — wird erst beim Öffnen geladen
const BrainTrainer = lazy(() => import('./brain/BrainTrainer'))
// Parla Italiano: Italienisch-Kurs im Pausenraum — wird erst beim Öffnen geladen
const ParlaItaliano = lazy(() => import('./italiano/ParlaItaliano'))
// Terra Incognita: Entdecker-Spiel im Pausenraum — wird erst beim Öffnen geladen, nichts davon im Hauptpaket
const TerraIncognita = lazy(() => import('./terra/TerraIncognita'))
// Der Coach: Training für Wirkung, Mut und Antrieb im Pausenraum — wird erst beim Öffnen geladen, nichts davon im Hauptpaket
const DerCoach = lazy(() => import('./coach/DerCoach'))
// … und seine Erinnerung ans Training (nachgeladen über Spaeter, frühestens 75 s nach dem Start)
const CoachErinnerung = lazy(() => import('./coach/Erinnerung'))
// … und die tägliche Erinnerung daran: wird erst eine Weile nach dem Start geholt, damit der Start nicht langsamer wird
const ItalienischErinnerung = lazy(() => import('./italiano/Erinnerung'))
function Spaeter({ nachMs, children }: { nachMs: number; children: React.ReactNode }) {
  const [da, setDa] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDa(true), nachMs); return () => clearTimeout(t) }, [nachMs])
  return da ? <Suspense fallback={null}>{children}</Suspense> : null
}
const Onboarding = lazy(() => import('./screens/Onboarding'))
const Licenses = lazy(() => import('./screens/Licenses'))
const HardwareInventory = lazy(() => import('./screens/HardwareInventory'))
const AccessoryInventory = lazy(() => import('./screens/AccessoryInventory'))
const UserPresence = lazy(() => import('./screens/UserPresence'))
const EmployeeManagement = lazy(() => import('./screens/EmployeeManagement'))
const EndpointDevices = lazy(() => import('./screens/EndpointDevices'))
const GpuDriverMgmt = lazy(() => import('./screens/GpuDriverMgmt'))
const TreiberInstallation = lazy(() => import('./screens/TreiberInstallation'))
const DeviceSetup = lazy(() => import('./screens/DeviceSetup'))
const ServiceNow = lazy(() => import('./screens/ServiceNow'))
const TicketAssignment = lazy(() => import('./screens/TicketAssignment'))
const PdfTools = lazy(() => import('./pdftools'))
const PhoneAssignment = lazy(() => import('./screens/PhoneAssignment'))
const Backups = lazy(() => import('./screens/Backups'))
const Netzwerkgeraete = lazy(() => import('./screens/Netzwerkgeraete'))
const ProactiveRadar = lazy(() => import('./screens/ProactiveRadar'))
const ServerMonitor = lazy(() => import('./screens/ServerMonitor'))
const Nis2 = lazy(() => import('./screens/Nis2'))
const SupportTools = lazy(() => import('./screens/SupportTools'))
const Drucker = lazy(() => import('./screens/Drucker'))
const CriticalDevices = lazy(() => import('./screens/CriticalDevices'))

function renderScreen(screen: Screen) {
  switch (screen) {
    case 'home':              return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Startseite /></Suspense>
    case 'massenabfragen':    return <Home />
    case 'query-menu':        return <QueryMenu />
    case 'results':           return <Results />
    case 'user-info':         return <UserInfo />
    case 'xelion':            return <XelionCheck />
    case 'rufnummer-vergabe': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><PhoneAssignment /></Suspense>
    case 'remote-doc':        return <RemoteDoc />
    case 'trickbox':          return <Trickkiste />
    case 'it-guru':           return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><ITGuru /></Suspense>
    case 'settings':          return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Einstellungen /></Suspense>
    // frühere „Benutzerverwaltung“ → Einstellungen, Kachel „Benutzer & Rechte“
    case 'user-management':   return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Einstellungen startKachel="benutzer" /></Suspense>
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
    case 'ticket-assignment': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><TicketAssignment /></Suspense>
    case 'support-tools': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><SupportTools /></Suspense>
    case 'drucker': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Drucker /></Suspense>
    case 'gruppen-suche': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><GroupSearch /></Suspense>
    case 'access-points': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><AccessPoints /></Suspense>
    case 'drucker-uebersicht': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><DruckerUebersicht /></Suspense>
    case 'client-geraete': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><ClientGeraete /></Suspense>
    case 'ot-devices': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><OtDevices /></Suspense>
    case 'pruffeld-zoll': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><PruffeldZoll /></Suspense>
    case 'verwaltungsgebaeude': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Verwaltungsgebaeude /></Suspense>
    case 'games': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Pausenraum /></Suspense>
    case 'vier-gewinnt': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Games /></Suspense>
    case 'brain-trainer': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><BrainTrainer /></Suspense>
    case 'parla-italiano': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><ParlaItaliano /></Suspense>
    case 'terra-incognita': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><TerraIncognita /></Suspense>
    case 'der-coach': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><DerCoach /></Suspense>
    case 'licenses': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Licenses /></Suspense>
    case 'hardware-inventory': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><HardwareInventory /></Suspense>
    case 'accessory-inventory': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><AccessoryInventory /></Suspense>
    case 'pdf-tools': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><PdfTools /></Suspense>
    case 'checklists': return <Checklists />
    case 'device-setup': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><DeviceSetup /></Suspense>
    case 'scheduled-tasks':   return <ScheduledTasks />
    case 'bug-mailbox':       return <BugMailbox />
    case 'dashboards':        return <Dashboards />
    case 'network-radar':     return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><NetworkRadar /></Suspense>
    case 'vlan-overview':     return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><VlanOverview /></Suspense>
    case 'nis2':              return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Nis2 /></Suspense>
    case 'critical-devices':  return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><CriticalDevices /></Suspense>
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
    case 'usv': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><Netzwerkgeraete /></Suspense>
    case 'proactive-radar': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><ProactiveRadar /></Suspense>
    case 'server': return <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>}><ServerMonitor /></Suspense>
    default:                  return <Home />
  }
}

/**
 * Wache: ist ein Bildschirm für diesen Benutzer ausgeblendet (Einstellungen → „Benutzer & Rechte“),
 * erscheint ein Hinweis statt des Inhalts — auch bei direkten Sprüngen (Startseite, Chat-Duell,
 * Server-Popups …). Solange die Rechte noch nicht berechnet sind, gilt alles als sichtbar.
 */
function Bildschirm({ screen }: { screen: Screen }) {
  const aus = useAusgeblendet(screen)
  return aus ? <AusgeblendetHinweis screen={screen} /> : renderScreen(screen)
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
  // „Sound Fix" ebenso — damit die Treibersuche nebenher laufen kann, während im
  // Hauptfenster weitergearbeitet wird.
  if (typeof window !== 'undefined' && window.location.hash === '#soundfix') {
    return <SoundFixWindow />
  }
  // Präsentiermodus: kleine Aufnahme-Leiste (eigenes Fenster, nimmt auf und kodiert)
  if (typeof window !== 'undefined' && window.location.hash === '#aufnahme') {
    return <Suspense fallback={null}><AufnahmeLeiste /></Suspense>
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
  const [appLock, setAppLockState] = useState<AppLock>({ locked: false })
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
  // Seit 17.11.2026 nur auf dem Automatik-PC (BQ8069 bzw. genau eine Vertretung) — stündlich
  // nachsehen, ob der Tagesabgleich fällig ist (ensureDailyAdUsers prüft das Datum selbst).
  useEffect(() => {
    if (!session) return
    const pruefe = () => { void darfAutomatik().then(ok => { if (ok) void ensureDailyAdUsers().catch(() => {}) }).catch(() => {}) }
    const start = setTimeout(pruefe, 45_000)
    const t = setInterval(pruefe, 60 * 60_000)
    return () => { clearTimeout(start); clearInterval(t) }
  }, [session?.user.username])

  // Globale Programm-Sperre live erkennen (auch bereits angemeldete Nutzer sperren).
  useEffect(() => {
    if (!session) return
    let cancelled = false
    const tick = () => { void loadAppLock().then(l => { if (!cancelled) setAppLockState(l) }).catch(() => {}) }
    tick()
    const t = setInterval(tick, 20_000)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    return () => { cancelled = true; clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [session?.user.username])

  // Apply theme
  useEffect(() => {
    if (settings.theme === 'light') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }, [settings.theme])

  // Start-Animation (Logo aus start.html): weg, sobald der erste echte Bildschirm gezeichnet ist
  // (Anmeldung, Sperrbildschirm oder Tool). Keine Mindestdauer — verlängert den Start nie.
  // Sicherheitsnetz: nach 20 s in jedem Fall weg (z. B. wenn authInit hängt).
  useEffect(() => {
    const t = setTimeout(startLogoAusblenden, 20_000)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!initialized) return
    requestAnimationFrame(() => requestAnimationFrame(startLogoAusblenden))
  }, [initialized])

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

  // Globale Sperre: alle außer davidxe sehen nur den Sperrbildschirm (angemeldet, aber ohne Inhalte).
  if (appLock.locked && !canBypassLock(session.user)) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
        <TitleBar />
        <LockScreen lock={appLock} />
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
              <Bildschirm screen={screen} />
            </ErrorBoundary>
            <BugReportWidget currentScreen={screen} />
            {/* zuerst: bestimmt den EINEN Automatik-PC (BQ8069 bevorzugt) — alle Scans fragen ihn */}
            <AutomatikLeiterController />
            {/* automatische Mails: zuerst über die Mail-PCs (Timo/Tim), der Automatik-PC zuletzt */}
            <MailPcController />
            <LicenseAlarmController />
            <EmployeeReminderController />
            <DepartureEmailController />
            <BackupSchedulerController />
            <SoftwareScanController />
            <PrinterConnectionScanController />
            <PrinterIpScanController />
            <DeviceScanController />
            <RadarScanController />
            <VlanScanController />
            <LostDeviceScanController />
            <NetworkDrivesScanController />
            <WeekendCheckController />
            <PcVerlaufController />
            <PcFehlerController />
            <WartelisteController />
            <KostenVerlaufController />
            <TerminScanController />
            <EuroparScanController />
            <WindowsUpdateController />
            <EuroparStagingController />
            <NetworkDriveSetupController />
            <AutoSetupController />
            <Nis2AccessScanController />
            <DriverRolloutController />
            <GeplanteAufgabenController />
            <ServerMonitorController />
            <GameInviteController />
            <ChatController />
            <AufnahmeController />
            <TonerWarnungController />
            <MonitorController />
            <Spaeter nachMs={45000}><ItalienischErinnerung /></Spaeter>
            <Spaeter nachMs={75000}><CoachErinnerung /></Spaeter>
            <ErrorFlashOverlay />
          </main>
        </div>
      </div>
      {/* Dossier-Fenster INNERHALB aller drei Provider → in jedem Fenster funktionieren alle „i“-Knöpfe */}
      <PersonDossierSlot />
      <DeviceDossierSlot />
      <PrinterDossierSlot />
      <MonitorDialogSlot />
      </PrinterDossierProvider>
     </DeviceDossierProvider>
    </DossierProvider>
  )
}
