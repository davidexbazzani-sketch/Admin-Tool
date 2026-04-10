import { useEffect } from 'react'
import {
  Home, Search, BarChart3, Smartphone, Wrench, Settings, ShieldCheck,
  ChevronRight, UserSearch, Terminal, Users, FileText, MapPin, Clock,
  Bug, LogOut, Crown, LayoutDashboard, ArrowRightLeft, Lightbulb, Activity, BookOpen, Package, Stethoscope,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore, useIsMasterAdmin, useIsAdmin } from '../store/authStore'
import { useRadarStore } from '../store/radarStore'
import { api } from '../electronAPI'
import type { Screen } from '../types'
import FavoritesPanel from './FavoritesPanel'

const MENU_VISIBILITY_PATH = 'settings/menu_visibility.json'

interface NavItem {
  id: Screen
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
  masterAdminOnly?: boolean
  dividerBefore?: boolean
}

export default function Sidebar() {
  const screen    = useAppStore(s => s.screen)
  const setScreen = useAppStore(s => s.setScreen)
  const hiddenMenuIds = useAppStore(s => s.hiddenMenuIds)
  const setHiddenMenuIds = useAppStore(s => s.setHiddenMenuIds)
  const masterOnlyIds = useAppStore(s => s.masterOnlyIds)
  const setMasterOnlyIds = useAppStore(s => s.setMasterOnlyIds)
  const setSession = useAuthStore(s => s.setSession)
  const session   = useAuthStore(s => s.session)
  const isMaster  = useIsMasterAdmin()
  const isAdmin   = useIsAdmin()
  const user      = session?.user

  // Load menu visibility from server on mount
  useEffect(() => {
    ;(async () => {
      try {
        const data = await api().netReadJson<{ hidden: string[]; masterOnly?: string[] }>(MENU_VISIBILITY_PATH)
        if (data && Array.isArray(data.hidden)) setHiddenMenuIds(new Set(data.hidden))
        if (data && Array.isArray(data.masterOnly)) setMasterOnlyIds(new Set(data.masterOnly))
      } catch { /* offline or not found — all visible */ }
    })()
  }, [setHiddenMenuIds, setMasterOnlyIds])

  const NAV_ITEMS: NavItem[] = [
    // ── Gruppe 1: Start ─────────────────────────────────────────────────
    { id: 'home',              label: 'Startbildschirm',      icon: <Home size={18} /> },
    { id: 'location-overview', label: 'Standort-Übersicht',   icon: <MapPin size={18} /> },

    // ── Gruppe 2: Werkzeuge ─────────────────────────────────────────────
    { id: 'query-menu',        label: 'Abfrage-Menü',         icon: <Search size={18} />, dividerBefore: true },
    { id: 'remote-doc',        label: 'Remote Doc',           icon: <Terminal size={18} /> },
    { id: 'it-guru',           label: 'IT Guru',              icon: <Lightbulb size={18} /> },
    { id: 'pc-diagnosis',       label: 'PC-Diagnose',         icon: <Stethoscope size={18} /> },

    // ── Gruppe 3: Automation ────────────────────────────────────────────
    { id: 'scheduled-tasks',   label: 'Geplante Aufgaben',    icon: <Clock size={18} />, adminOnly: true, dividerBefore: true },
    { id: 'dashboards',        label: 'Dashboards',           icon: <LayoutDashboard size={18} /> },
    { id: 'network-radar',     label: 'Netzwerk-Radar',       icon: <Activity size={18} />, adminOnly: true },
    { id: 'pc-migration',      label: 'PC-Migration',         icon: <ArrowRightLeft size={18} />, adminOnly: true },
    { id: 'software-inventory', label: 'Software-Inventar',   icon: <Package size={18} />, adminOnly: true },

    // ── Gruppe 4: Info & Hilfe ──────────────────────────────────────────
    { id: 'user-info',         label: 'Benutzer Info',        icon: <UserSearch size={18} />, dividerBefore: true },
    { id: 'xelion',            label: 'Diensthandy & Xelion', icon: <Smartphone size={18} /> },
    { id: 'trickbox',          label: 'Trickbox',             icon: <Wrench size={18} /> },

    // ── Gruppe 5: Wissen & Ergebnisse ───────────────────────────────────
    { id: 'knowledge-base',   label: 'Wissensdatenbank',     icon: <BookOpen size={18} />, dividerBefore: true },
    { id: 'results',           label: 'Ergebnisse',           icon: <BarChart3 size={18} />, dividerBefore: true },
    { id: 'settings',          label: 'Einstellungen',        icon: <Settings size={18} /> },

    // ── Gruppe 6: Master Admin ──────────────────────────────────────────
    { id: 'user-management',   label: 'Benutzerverwaltung',   icon: <Users size={18} />, masterAdminOnly: true, dividerBefore: true },
    { id: 'user-logs',         label: 'Benutzer-Logs',        icon: <FileText size={18} />, masterAdminOnly: true },
    { id: 'bug-mailbox',       label: 'Bug-Meldungen',        icon: <Bug size={18} />, masterAdminOnly: true },
  ]

  const radarScanning = useRadarStore(s => s.scanning)

  // Items that should never be hidden
  const ALWAYS_VISIBLE = new Set<string>(['home', 'settings', 'user-management', 'user-logs', 'bug-mailbox'])

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.masterAdminOnly) return isMaster
    if (item.adminOnly && !isAdmin) return false
    // Never-hide items
    if (ALWAYS_VISIBLE.has(item.id)) return true
    // Check if globally hidden
    if (hiddenMenuIds.has(item.id)) {
      // Master admin can still see it if it's in their "master only" list
      if (isMaster && masterOnlyIds.has(item.id)) return true
      return false
    }
    return true
  })

  // Role display
  const roleLabel = user?.role === 'master_admin'
    ? '👑 Master Admin'
    : user?.role === 'admin'
    ? '🔐 Administrator'
    : '👤 Standardbenutzer'

  const roleColor = user?.role === 'master_admin'
    ? 'text-amber-400'
    : user?.role === 'admin'
    ? 'text-blue-400'
    : 'text-muted-foreground'

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border h-full">
      {/* Logo / branding */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          {user?.role === 'master_admin'
            ? <Crown size={16} className="text-amber-300" />
            : <ShieldCheck size={16} className="text-primary-foreground" />
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {user?.displayName ?? user?.username ?? 'Admin Tool'}
          </p>
          <p className={`text-[10px] truncate ${roleColor}`}>{roleLabel}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
        {/* Favorites panel — above all nav items */}
        <FavoritesPanel />
        <div className="my-1 mx-4 h-px bg-sidebar-border" />

        {visibleItems.map((item) => {
          const active = screen === item.id
          return (
            <div key={item.id} className="px-2">
              {item.dividerBefore && <div className="my-2 h-px bg-sidebar-border" />}
              <button
                onClick={() => setScreen(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                  transition-colors duration-150 group
                  ${active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                  }
                `}
              >
                <span className={active ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'}>
                  {item.icon}
                </span>
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.id === 'network-radar' && radarScanning && (
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" title="Scan läuft..." />
                )}
                {active && <ChevronRight size={14} />}
              </button>
            </div>
          )
        })}
      </nav>

      {/* Footer: user info + logout */}
      <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
        <div className="px-1">
          <p className="text-[10px] text-muted-foreground truncate">
            {session?.loginMethod === 'sso' ? '(SSO) ' : ''}{user?.username}
          </p>
          <p className="text-[10px] text-muted-foreground/50">Entwickelt von Davide Bazzani · v1.0.0</p>
        </div>
        <button
          onClick={() => {
            if (user?.username) api().heartbeatClear(user.username).catch(() => {})
            setSession(null)
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-red-400 transition-colors"
        >
          <LogOut size={13} />
          Abmelden
        </button>
      </div>
    </aside>
  )
}
