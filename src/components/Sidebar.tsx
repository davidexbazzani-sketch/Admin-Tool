import { useEffect, useMemo, useState } from 'react'
import {
  Home, BarChart3, Smartphone, Wrench, Settings, ShieldCheck, Shield,
  ChevronRight, UserSearch, Users, FileText, MapPin, Clock,
  Bug, LogOut, Crown, LayoutDashboard, ArrowRightLeft, Lightbulb, Activity, BookOpen, Package, Stethoscope, PackagePlus, MonitorPlay, PhoneCall,
  Building2, Network, ClipboardList, FolderKanban, ScanSearch, Wifi, CalendarClock, Boxes, Cable, UserPlus, ChevronDown, MonitorSmartphone, Ticket,
  DatabaseBackup, BatteryCharging, Rocket, Radar,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore, useIsMasterAdmin, useIsAdmin } from '../store/authStore'
import { useRadarStore } from '../store/radarStore'
import { api } from '../electronAPI'
import type { Screen } from '../types'
import FavoritesPanel from './FavoritesPanel'
import { loadUserMenuOverrides, getHiddenForUser } from '../services/userMenuVisibility'
import { PDF_TOOLS_ENABLED } from '../pdftools/config'
import { MENU_CATALOG } from '../utils/menuCatalog'
import { parseMenuVisibility, computeMenuVisible } from '../utils/menuVisibility'

// Icons je Menüpunkt (Datenliste kommt aus dem zentralen menuCatalog).
const ITEM_ICONS: Partial<Record<Screen, React.ReactNode>> = {
  'home': <Home size={18} />,
  'location-overview': <MapPin size={18} />,
  'access-points': <Wifi size={18} />,
  'departments-overview': <Building2 size={18} />,
  'organization-structure': <Network size={18} />,
  'user-overview': <Users size={18} />,
  'user-info': <UserSearch size={18} />,
  'gruppen-suche': <ScanSearch size={18} />,
  'checklists': <ClipboardList size={18} />,
  'hardware-inventory': <Boxes size={18} />,
  'accessory-inventory': <Cable size={18} />,
  'software-installations': <PackagePlus size={18} />,
  'pc-migration': <ArrowRightLeft size={18} />,
  'pc-diagnosis': <Stethoscope size={18} />,
  'employee-management': <UserPlus size={18} />,
  'onboarding': <Rocket size={18} />,
  'servicenow': <Ticket size={18} />,
  'endpoint-devices': <MonitorSmartphone size={18} />,
  'infra-marine': <Shield size={18} />,
  'infra-projects': <FolderKanban size={18} />,
  'scheduled-tasks': <Clock size={18} />,
  'presentation-mode': <MonitorPlay size={18} />,
  'user-presence': <MapPin size={18} />,
  'licenses': <CalendarClock size={18} />,
  'proactive-radar': <Radar size={18} />,
  'software-inventory': <Package size={18} />,
  'network-radar': <Activity size={18} />,
  'vlan-overview': <Cable size={18} />,
  'backups': <DatabaseBackup size={18} />,
  'usv': <BatteryCharging size={18} />,
  'dashboards': <LayoutDashboard size={18} />,
  'xelion': <Smartphone size={18} />,
  'rufnummer-vergabe': <PhoneCall size={18} />,
  'trickbox': <Wrench size={18} />,
  'pdf-tools': <FileText size={18} />,
  'knowledge-base': <BookOpen size={18} />,
  'it-guru': <Lightbulb size={18} />,
  'results': <BarChart3 size={18} />,
  'settings': <Settings size={18} />,
  'user-management': <Users size={18} />,
  'user-logs': <FileText size={18} />,
  'bug-mailbox': <Bug size={18} />,
}
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Standort': <MapPin size={16} />,
  'User': <Users size={16} />,
  'IT Support': <Wrench size={16} />,
  'Infrastruktur': <Network size={16} />,
  'Telefonie': <PhoneCall size={16} />,
  'Sonstiges': <Boxes size={16} />,
  'Einstellungen': <Settings size={16} />,
}

const MENU_VISIBILITY_PATH = 'settings/menu_visibility.json'

interface NavItem {
  id: Screen
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
  masterAdminOnly?: boolean
}

type Section =
  | { kind: 'item'; item: NavItem }
  | { kind: 'category'; name: string; icon: React.ReactNode; items: NavItem[] }

export default function Sidebar() {
  const screen    = useAppStore(s => s.screen)
  const setScreen = useAppStore(s => s.setScreen)
  const hiddenMenuIds = useAppStore(s => s.hiddenMenuIds)
  const setHiddenMenuIds = useAppStore(s => s.setHiddenMenuIds)
  const menuMinRole = useAppStore(s => s.menuMinRole)
  const setMenuMinRole = useAppStore(s => s.setMenuMinRole)
  const setSession = useAuthStore(s => s.setSession)
  const session   = useAuthStore(s => s.session)
  const isMaster  = useIsMasterAdmin()
  const isAdmin   = useIsAdmin()
  const user      = session?.user

  // Per-user override: when present, replaces global hiddenMenuIds for this user.
  const [userOverride, setUserOverride] = useState<Set<string> | null>(null)

  // Aufgeklappte Kategorien (Standard: alle zu)
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())

  // Load menu visibility (global + per-user override) from server on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api().netReadJson<unknown>(MENU_VISIBILITY_PATH)
        if (!cancelled && data) {
          const v = parseMenuVisibility(data)
          setHiddenMenuIds(v.hidden)
          setMenuMinRole(v.minRole)
        }
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
  }, [setHiddenMenuIds, setMenuMinRole, user?.id])

  // Aufklappbare Kategorien (standardmaessig zu). "Startbildschirm" bleibt oben
  // und "Ergebnisse" + Kategorie "Einstellungen" unten. Remote Doc & Abfrage-
  // Menue sind bewusst NICHT mehr in der Seitenleiste — sie bleiben weiterhin
  // ueber den Startbildschirm erreichbar.
  //
  // Aufgebaut aus dem zentralen MENU_CATALOG (Single Source of Truth, geteilt
  // mit den Einstellungen). Icons kommen aus ITEM_ICONS/CATEGORY_ICONS. topLevel-
  // Eintraege werden eigenstaendig gerendert, sonst zusammenhaengende gleiche
  // Kategorien zu einer aufklappbaren Gruppe zusammengefasst.
  const MENU: Section[] = useMemo(() => {
    const out: Section[] = []
    for (const c of MENU_CATALOG) {
      const nav: NavItem = { id: c.id, label: c.label, icon: ITEM_ICONS[c.id] }
      if (c.adminOnly) nav.adminOnly = true
      if (c.masterAdminOnly) nav.masterAdminOnly = true
      if (c.topLevel) { out.push({ kind: 'item', item: nav }); continue }
      const last = out[out.length - 1]
      if (last && last.kind === 'category' && last.name === c.category) {
        last.items.push(nav)
      } else {
        out.push({ kind: 'category', name: c.category, icon: CATEGORY_ICONS[c.category], items: [nav] })
      }
    }
    return out
  }, [])

  const radarScanning = useRadarStore(s => s.scanning)
  const licensesAlarmCount = useAppStore(s => s.licensesAlarmCount)
  const employeeReminderCount = useAppStore(s => s.employeeReminderCount)

  // Global never-hide list (so master admin can never lock themself out).
  // Per-user overrides take precedence over this and can hide everything —
  // useful for kiosk-style accounts (e.g. "presentation only").
  const ALWAYS_VISIBLE_GLOBAL = new Set<string>(['home', 'settings', 'user-management', 'user-logs', 'bug-mailbox'])

  function isVisible(item: NavItem): boolean {
    // Feature-Flag: PDF-Werkzeuge-Modul abschaltbar
    if (item.id === 'pdf-tools' && !PDF_TOOLS_ENABLED) return false
    // Zentrale Auswertung (fest verankerte Rolle + globales Ausblenden +
    // konfigurierte Mindest-Rolle + per-Benutzer-Override).
    return computeMenuVisible(item.id, {
      isAdmin,
      isMaster,
      userOverride,
      hidden: hiddenMenuIds,
      minRole: menuMinRole,
      alwaysVisibleGlobal: ALWAYS_VISIBLE_GLOBAL,
      builtinAdminOnly: item.adminOnly,
      builtinMasterOnly: item.masterAdminOnly,
    })
  }

  // Alle Eintraege flach (fuer Kiosk-Fallback)
  const visibleItems = MENU.flatMap(s => s.kind === 'item' ? [s.item] : s.items).filter(isVisible)

  function toggleCat(name: string) {
    setOpenCats(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  // Hinweis-Zaehler einer (eingeklappten) Kategorie (Lizenz-/Mitarbeiter-Alarme)
  function catAlertCount(items: NavItem[]): number {
    let n = 0
    if (items.some(i => i.id === 'licenses')) n += licensesAlarmCount
    if (items.some(i => i.id === 'employee-management')) n += employeeReminderCount
    return n
  }

  // Eine einzelne Menue-Schaltflaeche (oben/unten oder innerhalb einer Kategorie)
  function renderItem(item: NavItem, indented: boolean) {
    const active = screen === item.id
    const alarmActive = item.id === 'licenses' && licensesAlarmCount > 0
    return (
      <button
        key={item.id}
        onClick={() => setScreen(item.id)}
        className={`
          w-full flex items-center gap-3 ${indented ? 'pl-9 pr-3' : 'px-3'} py-2 rounded-md text-sm
          transition-colors duration-150 group
          ${active
            ? 'bg-primary text-primary-foreground font-medium'
            : alarmActive
              ? 'licenses-alarm-blink font-medium'
              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
          }
        `}
      >
        <span className={active ? 'text-primary-foreground' : (alarmActive ? '' : 'text-muted-foreground group-hover:text-foreground')}>
          {item.icon}
        </span>
        <span className="flex-1 text-left truncate">{item.label}</span>
        {alarmActive && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold" title={`${licensesAlarmCount} Lizenz(en) laufen bald aus`}>
            {licensesAlarmCount}
          </span>
        )}
        {item.id === 'employee-management' && employeeReminderCount > 0 && !active && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold" title={`${employeeReminderCount} neue Mitarbeiter beginnen bald`}>
            {employeeReminderCount}
          </span>
        )}
        {item.id === 'network-radar' && radarScanning && (
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" title="Scan läuft..." />
        )}
        {active && <ChevronRight size={14} />}
      </button>
    )
  }

  // Kategorie, die den aktuell offenen Screen enthaelt — wird beim Navigieren
  // automatisch aufgeklappt (einmalig), bleibt danach aber frei ein-/ausklappbar.
  const activeCatName = MENU.reduce<string | null>(
    (acc, s) => acc ?? (s.kind === 'category' && s.items.some(i => i.id === screen) ? s.name : null),
    null,
  )
  useEffect(() => {
    if (!activeCatName) return
    setOpenCats(prev => (prev.has(activeCatName) ? prev : new Set(prev).add(activeCatName)))
  }, [activeCatName])

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

        {MENU.map((section) => {
          // Einzelner, immer sichtbarer Eintrag (Startbildschirm / Ergebnisse)
          if (section.kind === 'item') {
            if (!isVisible(section.item)) return null
            return <div key={section.item.id} className="px-2">{renderItem(section.item, false)}</div>
          }

          // Kategorie – nur rendern, wenn sie sichtbare Eintraege hat
          const items = section.items.filter(isVisible)
          if (items.length === 0) return null
          const hasActive = items.some(i => i.id === screen)
          const open = openCats.has(section.name)
          const alerts = catAlertCount(items)

          return (
            <div key={section.name} className="px-2">
              <button
                onClick={() => toggleCat(section.name)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-150
                  ${hasActive ? 'text-foreground' : 'text-muted-foreground'} hover:bg-sidebar-accent hover:text-foreground`}
              >
                <span className="shrink-0">{section.icon}</span>
                <span className="flex-1 text-left font-semibold truncate">{section.name}</span>
                {!open && alerts > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Es liegen Hinweise in dieser Kategorie vor" />
                )}
                <ChevronDown size={15} className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
              </button>
              {/* Fluessiges Auf-/Zuklappen via Grid-Rows-Animation (0fr <-> 1fr) */}
              <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="mt-0.5 space-y-0.5">{items.map(i => renderItem(i, true))}</div>
                </div>
              </div>
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

      <style>{`
        @keyframes licenses-alarm-blink-anim {
          0%, 100% { background-color: rgba(220, 38, 38, 0.18); color: rgb(254, 202, 202); box-shadow: inset 0 0 0 1px rgba(220, 38, 38, 0.45); }
          50%      { background-color: rgba(220, 38, 38, 0.55); color: rgb(255, 255, 255); box-shadow: inset 0 0 0 1px rgba(220, 38, 38, 0.95); }
        }
        .licenses-alarm-blink {
          animation: licenses-alarm-blink-anim 1.2s ease-in-out infinite;
        }
      `}</style>
    </aside>
  )
}
