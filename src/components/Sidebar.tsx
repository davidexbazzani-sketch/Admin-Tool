import { useEffect, useState } from 'react'
import {
  Home, Search, BarChart3, Smartphone, Wrench, Settings, ShieldCheck, Shield,
  ChevronRight, UserSearch, Terminal, Users, FileText, MapPin, Clock,
  Bug, LogOut, Crown, LayoutDashboard, ArrowRightLeft, Lightbulb, Activity, BookOpen, Package, Stethoscope, PackagePlus, MonitorPlay,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore, useIsMasterAdmin, useIsAdmin } from '../store/authStore'
import { useRadarStore } from '../store/radarStore'
import { api } from '../electronAPI'
import type { Screen } from '../types'
import FavoritesPanel from './FavoritesPanel'
import { loadUserMenuOverrides, getHiddenForUser } from '../services/userMenuVisibility'

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

  // Per-user override: when present, replaces global hiddenMenuIds for this user.
  const [userOverride, setUserOverride] = useState<Set<string> | null>(null)

  // Load menu visibility (global + per-user override) from server on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api().netReadJson<{ hidden: string[]; masterOnly?: string[] }>(MENU_VISIBILITY_PATH)
        if (!cancelled && data && Array.isArray(data.hidden)) setHiddenMenuIds(new Set(data.hidden))
        if (!cancelled && data && Array.isArray(data.masterOnly)) setMasterOnlyIds(new Set(data.masterOnly))
      } catch { /* offline or not found — all visible */ }

      // Per-user overrides
      if (user?.id) {
        try {
          const overrides = await loadUserMenuOverrides()
          if (!cancelled) setUserOverride(getHiddenForUser(overrides, user.id))
        } catch { /* ignore */ }
      }
    })()
    return () => { cancelled = true }
  }, [setHiddenMenuIds, setMasterOnlyIds, user?.id])

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
    { id: 'software-installations', label: 'Software Installationen', icon: <PackagePlus size={18} />, adminOnly: true },
    { id: 'presentation-mode',    label: 'Präsentationsmodus',   icon: <MonitorPlay size={18} />, adminOnly: true },

    // ── Gruppe 4: Info & Hilfe ──────────────────────────────────────────
    { id: 'user-info',         label: 'Benutzer Info',        icon: <UserSearch size={18} />, dividerBefore: true },
    { id: 'xelion',            label: 'Diensthandy & Xelion', icon: <Smartphone size={18} /> },
    { id: 'trickbox',          label: 'Trickbox',             icon: <Wrench size={18} /> },
    { id: 'infra-marine',      label: 'Infrastruktur Marine', icon: <Shield size={18} /> },

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

  // Global never-hide list (so master admin can never lock themself out).
  // Per-user overrides take precedence over this and can hide everything —
  // useful for kiosk-style accounts (e.g. "presentation only").
  const ALWAYS_VISIBLE_GLOBAL = new Set<string>(['home', 'settings', 'user-management', 'user-logs', 'bug-mailbox'])

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.masterAdminOnly) return isMaster
    if (item.adminOnly && !isAdmin) return false

    if (userOverride && !isMaster) {
      // Per-user override is authoritative for non-master users — anything
      // listed in `hidden` is removed from the sidebar, including Home/Settings.
      return !userOverride.has(item.id)
    }

    // Never-hide items (global rules)
    if (ALWAYS_VISIBLE_GLOBAL.has(item.id)) return true
    // Check if globally hidden
    if (hiddenMenuIds.has(item.id)) {
      // Master admin can still see it if it's in their "master only" list
      if (isMaster && masterOnlyIds.has(item.id)) return true
      return false
    }
    return true
  })

  // Kiosk fallback: if the user landed on a screen that's hidden for them
  // (e.g. default 'home' is hidden), jump to the first visible item once.
  useEffect(() => {
    if (!userOverride || isMaster) return
    if (visibleItems.length === 0) return
    if (!visibleItems.some(i => i.id === screen)) {
      setScreen(visibleItems[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userOverride, screen])

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
