import { useState, useMemo } from 'react'
import {
  X, Search,
  Wifi, Settings, Cpu, Database, HardDrive, Clock,
  AlertTriangle, Download, User, Monitor, Zap,
  FileText, Type, Minus, Hash,
} from 'lucide-react'
import type { WidgetType } from '../../types/dashboard'

// ── Widget catalog definition ────────────────────────────────────────────────

interface CatalogEntry {
  type: WidgetType
  label: string
  description: string
  icon: React.ReactNode
  category: string
  iconColor: string
}

const CATALOG: CatalogEntry[] = [
  // ── Status & Monitoring ──────────────────────────────────────────────────
  {
    type:        'online-status',
    label:       'Online/Offline-Status',
    description: 'Überwacht ob Geräte erreichbar sind',
    icon:        <Wifi size={20} />,
    category:    'Status & Monitoring',
    iconColor:   'text-emerald-400',
  },
  {
    type:        'service-status',
    label:       'Dienst-Status',
    description: 'Windows-Dienste überwachen',
    icon:        <Settings size={20} />,
    category:    'Status & Monitoring',
    iconColor:   'text-blue-400',
  },
  {
    type:        'cpu-usage',
    label:       'CPU-Auslastung',
    description: 'Live CPU-Last anzeigen',
    icon:        <Cpu size={20} />,
    category:    'Status & Monitoring',
    iconColor:   'text-orange-400',
  },
  {
    type:        'ram-usage',
    label:       'RAM-Auslastung',
    description: 'Arbeitsspeicher-Nutzung anzeigen',
    icon:        <Database size={20} />,
    category:    'Status & Monitoring',
    iconColor:   'text-purple-400',
  },
  {
    type:        'disk-usage',
    label:       'Festplatten-Belegung',
    description: 'Freien Speicherplatz überwachen',
    icon:        <HardDrive size={20} />,
    category:    'Status & Monitoring',
    iconColor:   'text-amber-400',
  },
  {
    type:        'uptime',
    label:       'Uptime',
    description: 'Laufzeit seit letztem Neustart',
    icon:        <Clock size={20} />,
    category:    'Status & Monitoring',
    iconColor:   'text-cyan-400',
  },
  {
    type:        'event-log-errors',
    label:       'Event-Log Fehler',
    description: 'Systemfehler der letzten 24 Stunden',
    icon:        <AlertTriangle size={20} />,
    category:    'Status & Monitoring',
    iconColor:   'text-red-400',
  },
  {
    type:        'windows-update',
    label:       'Windows Updates',
    description: 'Ausstehende Updates anzeigen',
    icon:        <Download size={20} />,
    category:    'Status & Monitoring',
    iconColor:   'text-sky-400',
  },
  {
    type:        'logged-in-user',
    label:       'Angemeldeter Benutzer',
    description: 'Wer ist gerade am Gerät angemeldet',
    icon:        <User size={20} />,
    category:    'Status & Monitoring',
    iconColor:   'text-teal-400',
  },

  // ── Informationen ────────────────────────────────────────────────────────
  {
    type:        'system-info',
    label:       'System-Info',
    description: 'Hostname, Modell, OS, RAM, Seriennummer',
    icon:        <Monitor size={20} />,
    category:    'Informationen',
    iconColor:   'text-indigo-400',
  },

  // ── Remote-Aktionen ──────────────────────────────────────────────────────
  {
    type:        'quick-actions',
    label:       'Schnellaktionen',
    description: 'Neustart, Shutdown, GP-Update und mehr',
    icon:        <Zap size={20} />,
    category:    'Remote-Aktionen',
    iconColor:   'text-yellow-400',
  },

  // ── Sonstiges ────────────────────────────────────────────────────────────
  {
    type:        'clock',
    label:       'Uhr',
    description: 'Aktuelle Uhrzeit und Datum anzeigen',
    icon:        <Clock size={20} />,
    category:    'Sonstiges',
    iconColor:   'text-slate-300',
  },
  {
    type:        'note',
    label:       'Notiz',
    description: 'Freitext-Notiz oder Hinweis',
    icon:        <FileText size={20} />,
    category:    'Sonstiges',
    iconColor:   'text-lime-400',
  },
  {
    type:        'text-label',
    label:       'Beschriftung',
    description: 'Formatiertes Textelement für Überschriften',
    icon:        <Type size={20} />,
    category:    'Sonstiges',
    iconColor:   'text-slate-300',
  },
  {
    type:        'divider',
    label:       'Trennlinie',
    description: 'Visuelle Trennlinie mit optionalem Label',
    icon:        <Minus size={20} />,
    category:    'Sonstiges',
    iconColor:   'text-slate-400',
  },
  {
    type:        'counter',
    label:       'Zähler',
    description: 'Große Zahlen-Anzeige für KPIs',
    icon:        <Hash size={20} />,
    category:    'Sonstiges',
    iconColor:   'text-pink-400',
  },
]

// ── Category section header colors ───────────────────────────────────────────

const CATEGORY_ACCENT: Record<string, string> = {
  'Status & Monitoring': 'border-emerald-500/40 text-emerald-300',
  'Informationen':       'border-indigo-500/40 text-indigo-300',
  'Remote-Aktionen':     'border-yellow-500/40 text-yellow-300',
  'Sonstiges':           'border-slate-500/40 text-slate-300',
}

const CATEGORY_NOTE: Record<string, string> = {
  'Remote-Aktionen': 'Erfordert Admin-Rechte auf dem Zielgerät',
}

// ── Component ────────────────────────────────────────────────────────────────

export interface WidgetCatalogProps {
  onSelect: (type: WidgetType) => void
  onCancel: () => void
}

export default function WidgetCatalog({ onSelect, onCancel }: WidgetCatalogProps) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<WidgetType | null>(null)

  // Filtered entries based on search query
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return CATALOG
    return CATALOG.filter(
      e =>
        e.label.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
    )
  }, [search])

  // Group by category, preserving order
  const groups = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>()
    for (const entry of filtered) {
      const list = map.get(entry.category) ?? []
      list.push(entry)
      map.set(entry.category, list)
    }
    return map
  }, [filtered])

  const handleSelect = (type: WidgetType) => {
    setSelected(type)
  }

  const handleConfirm = () => {
    if (selected) onSelect(selected)
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      {/* Dialog */}
      <div
        className="flex flex-col w-[720px] max-w-[95vw] max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: '#1e1e2e',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div>
            <h2 className="text-base font-semibold text-foreground">Widget hinzufügen</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Widget-Typ auswählen und auf dem Dashboard platzieren
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div
          className="px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Widget suchen…"
              autoFocus
              className="
                w-full pl-8 pr-3 py-2 rounded-lg text-sm
                bg-white/5 border border-white/8 text-foreground
                placeholder:text-muted-foreground/60
                focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/40
                transition-colors
              "
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Catalog content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {groups.size === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Search size={24} className="opacity-30" />
              <span className="text-sm">Keine Widgets gefunden für "{search}"</span>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {Array.from(groups.entries()).map(([category, entries]) => {
                const accentCls = CATEGORY_ACCENT[category] ?? 'border-slate-500/40 text-slate-300'
                const note = CATEGORY_NOTE[category]
                return (
                  <section key={category}>
                    {/* Category header */}
                    <div className={`flex items-center gap-3 mb-3`}>
                      <span className={`text-xs font-semibold uppercase tracking-wider ${accentCls.split(' ')[1]}`}>
                        {category}
                      </span>
                      <div className={`flex-1 border-t ${accentCls.split(' ')[0]}`} />
                      {note && (
                        <span className="text-[10px] text-muted-foreground/60 italic">{note}</span>
                      )}
                    </div>

                    {/* Widget cards grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {entries.map(entry => {
                        const isSelected = selected === entry.type
                        return (
                          <button
                            key={entry.type}
                            onClick={() => handleSelect(entry.type)}
                            onDoubleClick={() => { setSelected(entry.type); onSelect(entry.type) }}
                            className={`
                              relative flex flex-col items-start gap-2 rounded-xl p-3.5 text-left
                              border transition-all duration-150 group cursor-pointer
                              ${isSelected
                                ? 'border-primary/70 bg-primary/10 ring-1 ring-primary/40'
                                : 'border-white/6 bg-white/3 hover:bg-white/6 hover:border-white/12'
                              }
                            `}
                          >
                            {/* Icon */}
                            <div
                              className={`
                                p-2 rounded-lg transition-colors
                                ${isSelected
                                  ? 'bg-primary/20'
                                  : 'bg-white/5 group-hover:bg-white/8'
                                }
                                ${entry.iconColor}
                              `}
                            >
                              {entry.icon}
                            </div>

                            {/* Labels */}
                            <div className="flex flex-col gap-0.5 min-w-0 w-full">
                              <span
                                className={`
                                  text-xs font-semibold leading-snug truncate
                                  ${isSelected ? 'text-primary' : 'text-foreground'}
                                `}
                              >
                                {entry.label}
                              </span>
                              <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                                {entry.description}
                              </span>
                            </div>

                            {/* Selected checkmark */}
                            {isSelected && (
                              <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                  <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="text-xs text-muted-foreground">
            {selected
              ? `Ausgewählt: ${CATALOG.find(e => e.type === selected)?.label ?? selected}`
              : 'Kein Widget ausgewählt'
            }
          </span>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onCancel}
              className="
                px-4 py-1.5 rounded-lg text-sm text-muted-foreground
                hover:text-foreground hover:bg-white/5
                border border-transparent hover:border-white/8
                transition-colors
              "
            >
              Abbrechen
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="
                px-4 py-1.5 rounded-lg text-sm font-medium
                bg-primary text-primary-foreground
                hover:bg-primary/90 active:bg-primary/80
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors
              "
            >
              Hinzufügen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
