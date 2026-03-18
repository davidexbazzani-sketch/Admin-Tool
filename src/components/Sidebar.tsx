import { Home, Search, BarChart3, Smartphone, Wrench, Settings, ShieldCheck, ChevronRight } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import type { Screen } from '../types'

interface NavItem {
  id: Screen
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home',        label: 'Startbildschirm',   icon: <Home size={18} /> },
  { id: 'query-menu',  label: 'Abfrage-Menü',       icon: <Search size={18} /> },
  { id: 'results',     label: 'Ergebnisse',          icon: <BarChart3 size={18} /> },
  { id: 'xelion',      label: 'Diensthandy & Xelion',icon: <Smartphone size={18} /> },
  { id: 'trickkiste',  label: 'Trickkiste',           icon: <Wrench size={18} /> },
  { id: 'settings',   label: 'Einstellungen',        icon: <Settings size={18} /> },
]

export default function Sidebar() {
  const screen = useAppStore((s) => s.screen)
  const setScreen = useAppStore((s) => s.setScreen)
  const isAdmin = useAppStore((s) => s.isAdmin)

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border h-full">
      {/* Logo / branding */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <ShieldCheck size={16} className="text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">Admin Tool</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {isAdmin ? '🔐 Administrator' : '👤 Standardbenutzer'}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = screen === item.id
          return (
            <button
              key={item.id}
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
              {active && <ChevronRight size={14} />}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-sidebar-border">
        <p className="text-[10px] text-muted-foreground">v1.0.0</p>
      </div>
    </aside>
  )
}
