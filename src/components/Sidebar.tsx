import { useEffect, useMemo, useState } from 'react'
import {
  Home, BarChart3, Smartphone, Wrench, Settings, ShieldCheck, Shield,
  ChevronRight, UserSearch, Users, FileText, MapPin, Clock,
  Bug, LogOut, Crown, LayoutDashboard, ArrowRightLeft, Lightbulb, Activity, BookOpen, Package, Stethoscope, PackagePlus, MonitorPlay, PhoneCall,
  Building2, Network, ClipboardList, FolderKanban, ScanSearch, Wifi, CalendarClock, Boxes, Cable, UserPlus, ChevronDown, MonitorSmartphone, Ticket,
  DatabaseBackup, BatteryCharging, Rocket, Radar, Cpu, Server, HardDriveDownload, Factory, Gamepad2, ClipboardCheck, Building,
  GripVertical, RotateCcw, Check as CheckIcon, LifeBuoy,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore, useIsMasterAdmin, useIsAdmin } from '../store/authStore'
import { useRadarStore } from '../store/radarStore'
import { api } from '../electronAPI'
import type { Screen } from '../types'
import FavoritesPanel from './FavoritesPanel'
import { loadUserMenuOverrides, getHiddenForUser } from '../services/userMenuVisibility'
import { loadUserMenuOrders, getOrderForUser, saveUserMenuOrder, clearUserMenuOrder, type MenuOrderEntry } from '../services/userMenuOrder'
import { PDF_TOOLS_ENABLED } from '../pdftools/config'
import { MENU_CATALOG, type MenuCatalogItem } from '../utils/menuCatalog'
import { parseMenuVisibility, computeMenuVisible } from '../utils/menuVisibility'

// Icons je Menüpunkt (Datenliste kommt aus dem zentralen menuCatalog).
const ITEM_ICONS: Partial<Record<Screen, React.ReactNode>> = {
  'home': <Home size={18} />,
  'gpu-driver-mgmt': <Cpu size={18} />,
  'location-overview': <MapPin size={18} />,
  'access-points': <Wifi size={18} />,
  'ot-devices': <Factory size={18} />,
  'pruffeld-zoll': <ClipboardCheck size={18} />,
  'verwaltungsgebaeude': <Building size={18} />,
  'departments-overview': <Building2 size={18} />,
  'organization-structure': <Network size={18} />,
  'user-overview': <Users size={18} />,
  'user-info': <UserSearch size={18} />,
  'gruppen-suche': <ScanSearch size={18} />,
  'checklists': <ClipboardList size={18} />,
  'device-setup': <Rocket size={18} />,
  'hardware-inventory': <Boxes size={18} />,
  'accessory-inventory': <Cable size={18} />,
  'software-installations': <PackagePlus size={18} />,
  'pc-migration': <ArrowRightLeft size={18} />,
  'pc-diagnosis': <Stethoscope size={18} />,
  'employee-management': <UserPlus size={18} />,
  'onboarding': <Rocket size={18} />,
  'treiber-installation': <HardDriveDownload size={18} />,
  'servicenow': <Ticket size={18} />,
  'ticket-assignment': <ArrowRightLeft size={18} />,
  'support-tools': <LifeBuoy size={18} />,
  'endpoint-devices': <MonitorSmartphone size={18} />,
  'infra-marine': <Shield size={18} />,
  'infra-projects': <FolderKanban size={18} />,
  'scheduled-tasks': <Clock size={18} />,
  'presentation-mode': <MonitorPlay size={18} />,
  'user-presence': <MapPin size={18} />,
  'licenses': <CalendarClock size={18} />,
  'proactive-radar': <Radar size={18} />,
  'nis2': <ShieldCheck size={18} />,
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
  'knowledge-search': <ScanSearch size={18} />,
  'server': <Server size={18} />,
  'it-guru': <Lightbulb size={18} />,
  'games': <Gamepad2 size={18} />,
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
  // Geschützter Gründer-Master (Davidxe): ihm kann nichts ausgeblendet werden.
  const isFounder = !!user?.isFounder || (user?.username?.toLowerCase() === 'davidxe')

  // Per-user override: when present, replaces global hiddenMenuIds for this user.
  const [userOverride, setUserOverride] = useState<Set<string> | null>(null)

  // Aufgeklappte Kategorien (Standard: alle zu)
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())

  // Per-Benutzer-Menü-Reihenfolge (Drag & Drop)
  const [userOrder, setUserOrder] = useState<MenuOrderEntry[] | null>(null)
  const [arranging, setArranging] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

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

      // Per-user overrides + persönliche Menü-Reihenfolge
      if (user?.id) {
        try {
          const overrides = await loadUserMenuOverrides()
          if (!cancelled) setUserOverride(getHiddenForUser(overrides, user.id))
        } catch { /* ignore */ }
        try {
          const orders = await loadUserMenuOrders()
          if (!cancelled) setUserOrder(getOrderForUser(orders, user.id))
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
  // Verschiebbare Menüpunkte = alles außer Startbildschirm/Ergebnisse (topLevel)
  // und der fixen Kategorie „Einstellungen".
  const REORDERABLE = useMemo(() => MENU_CATALOG.filter(c => !c.topLevel && c.category !== 'Einstellungen'), [])
  const isReorderable = (id: Screen) => REORDERABLE.some(c => c.id === id)

  // Verschiebbare Punkte in der persönlichen Reihenfolge (fehlende hinten im Katalog-Standard).
  const effectiveReorderable = useMemo(() => {
    const byId = new Map(MENU_CATALOG.map(c => [c.id, c]))
    const seen = new Set<string>()
    const result: MenuCatalogItem[] = []
    if (userOrder) {
      for (const o of userOrder) {
        const c = byId.get(o.id as Screen)
        if (!c || c.topLevel || c.category === 'Einstellungen' || seen.has(c.id)) continue
        seen.add(c.id)
        result.push({ ...c, category: o.category || c.category })
      }
    }
    // Neue (noch nicht angeordnete) Katalog-Punkte an ihrer natürlichen Nachbar-
    // Position einfügen statt hinten anhängen — sonst landet ein neu ergänzter
    // Menüpunkt bei Nutzern mit eigener Reihenfolge ganz unten (eigene Gruppe).
    for (let i = 0; i < REORDERABLE.length; i++) {
      const c = REORDERABLE[i]
      if (seen.has(c.id)) continue
      let insertAt = 0
      let category = c.category
      for (let j = i - 1; j >= 0; j--) {
        const idx = result.findIndex(r => r.id === REORDERABLE[j].id)
        if (idx >= 0) { insertAt = idx + 1; category = result[idx].category; break }
      }
      result.splice(insertAt, 0, { ...c, category })
      seen.add(c.id)
    }
    return result
  }, [userOrder, REORDERABLE])

  const MENU: Section[] = useMemo(() => {
    const home = MENU_CATALOG.filter(c => c.id === 'home')
    const results = MENU_CATALOG.filter(c => c.id === 'results')
    const einst = MENU_CATALOG.filter(c => c.category === 'Einstellungen')
    const effectiveCatalog: MenuCatalogItem[] = [...home, ...effectiveReorderable, ...results, ...einst]
    const out: Section[] = []
    for (const c of effectiveCatalog) {
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
  }, [effectiveReorderable])

  // Drag & Drop: verschobenen Punkt VOR das Ziel setzen (übernimmt dessen Kategorie).
  async function applyReorder(dId: string, overId: string) {
    if (dId === overId) return
    const arr: MenuOrderEntry[] = effectiveReorderable.map(c => ({ id: c.id, category: c.category }))
    const from = arr.findIndex(x => x.id === dId)
    if (from < 0) return
    const [moved] = arr.splice(from, 1)
    const insertIdx = arr.findIndex(x => x.id === overId)
    if (insertIdx < 0) arr.push(moved)
    else { moved.category = arr[insertIdx].category; arr.splice(insertIdx, 0, moved) }
    setUserOrder(arr)
    if (user?.id) await saveUserMenuOrder(user.id, arr)
  }
  async function resetOrder() {
    setUserOrder(null); setArranging(false); setDragId(null); setDragOverId(null)
    if (user?.id) await clearUserMenuOrder(user.id)
  }

  const radarScanning = useRadarStore(s => s.scanning)
  const licensesAlarmCount = useAppStore(s => s.licensesAlarmCount)
  const employeeReminderCount = useAppStore(s => s.employeeReminderCount)
  const serverAlarmCount = useAppStore(s => s.serverAlarmCount)

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
      isFounder,
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
    if (items.some(i => i.id === 'server')) n += serverAlarmCount
    return n
  }

  // Eine einzelne Menue-Schaltflaeche (oben/unten oder innerhalb einer Kategorie)
  function renderItem(item: NavItem, indented: boolean) {
    const active = screen === item.id
    const alarmCount = item.id === 'licenses' ? licensesAlarmCount : item.id === 'server' ? serverAlarmCount : 0
    const alarmActive = alarmCount > 0
    const canDrag = arranging && isReorderable(item.id)
    const isDropTarget = canDrag && dragOverId === item.id && !!dragId && dragId !== item.id
    return (
      <button
        key={item.id}
        draggable={canDrag}
        onDragStart={canDrag ? (e) => { setDragId(item.id); e.dataTransfer.effectAllowed = 'move' } : undefined}
        onDragOver={canDrag ? (e) => { e.preventDefault(); if (dragOverId !== item.id) setDragOverId(item.id) } : undefined}
        onDragLeave={canDrag ? () => { if (dragOverId === item.id) setDragOverId(null) } : undefined}
        onDrop={canDrag ? (e) => { e.preventDefault(); if (dragId) void applyReorder(dragId, item.id); setDragId(null); setDragOverId(null) } : undefined}
        onDragEnd={canDrag ? () => { setDragId(null); setDragOverId(null) } : undefined}
        onClick={() => { if (arranging) return; setScreen(item.id) }}
        className={`
          w-full flex items-center gap-3 ${indented ? (canDrag ? 'pl-3 pr-3' : 'pl-9 pr-3') : 'px-3'} py-2 rounded-md text-sm
          transition-colors duration-150 group ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}
          ${isDropTarget ? 'border-t-2 border-primary' : ''} ${dragId === item.id ? 'opacity-40' : ''}
          ${active && !arranging
            ? 'bg-primary text-primary-foreground font-medium'
            : alarmActive
              ? 'licenses-alarm-blink font-medium'
              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
          }
        `}
      >
        {canDrag && <GripVertical size={14} className="text-muted-foreground shrink-0" />}
        <span className={active && !arranging ? 'text-primary-foreground' : (alarmActive ? '' : 'text-muted-foreground group-hover:text-foreground')}>
          {item.icon}
        </span>
        <span className="flex-1 text-left truncate">{item.label}</span>
        {alarmActive && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold" title={item.id === 'server' ? `${serverAlarmCount} Server offline` : `${licensesAlarmCount} Lizenz(en) laufen bald aus`}>
            {alarmCount}
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
        {active && !arranging && <ChevronRight size={14} />}
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

        {/* Menü selbst anordnen (Drag & Drop, pro Benutzer gespeichert) */}
        <div className="px-2 pb-1 flex items-center gap-1.5">
          {!arranging ? (
            <button onClick={() => setArranging(true)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
              <GripVertical size={12} />Menü anordnen
            </button>
          ) : (
            <>
              <button onClick={() => { setArranging(false); setDragId(null); setDragOverId(null) }}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90">
                <CheckIcon size={12} />Fertig
              </button>
              <button onClick={() => void resetOrder()} title="Standard-Reihenfolge wiederherstellen"
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-sidebar-border text-muted-foreground hover:text-foreground">
                <RotateCcw size={12} />Zurücksetzen
              </button>
            </>
          )}
        </div>
        {arranging && <p className="px-3 pb-1 text-[10px] text-muted-foreground">Menüpunkte per Ziehen (Griff) neu anordnen — auch zwischen Kategorien.</p>}

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
          const open = arranging || openCats.has(section.name)
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
