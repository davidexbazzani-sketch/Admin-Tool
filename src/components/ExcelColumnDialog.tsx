import { useState } from 'react'
import { X, Table } from 'lucide-react'
import type { ExcelColumn } from '../utils/fileImport'

type ColumnRole = string

export interface DialogRole {
  id: string
  label: string
  /** Tailwind-Klassen für den gewählten Zustand. */
  color: string
}

interface Props {
  columns: ExcelColumn[]
  rows?: Record<string, unknown>[]
  onConfirm: (hostnameColNames: string[], serialColNames: string[], assignedToColNames: string[]) => void
  onCancel: () => void
  // ── Optional: eigener Rollensatz ──────────────────────────────────────────
  // Ohne diese Angaben verhält sich der Dialog wie bisher (Hostname/Seriennummer/
  // ServiceNow) — die bestehenden Aufrufer in Home und UserInfo bleiben unberührt.
  // Der Drucker-Import gibt seine eigenen Rollen mit.
  roles?: DialogRole[]
  titel?: string
  untertitel?: string
  /** Vorauswahl je Spaltenname (aus der Kopfzeilen-Erkennung). */
  initialRoles?: Record<string, string>
  /** Wird statt `onConfirm` aufgerufen, wenn `roles` gesetzt ist: Rollen-Id → Spaltennamen. */
  onConfirmMap?: (nachRolle: Record<string, string[]>) => void
  /** Mindestens eine dieser Rollen muss vergeben sein, sonst bleibt „Importieren" gesperrt. */
  pflichtRollen?: string[]
}

const IGNORE = 'ignore'

const STANDARD_ROLLEN: DialogRole[] = [
  { id: 'hostname',   label: 'Hostname',             color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  { id: 'serial',     label: 'Seriennummer',         color: 'bg-emerald-500 text-black border-emerald-500/30' },
  { id: 'assignedto', label: 'ServiceNow Zuweisung', color: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  { id: IGNORE,       label: 'Ignorieren',           color: 'bg-muted text-muted-foreground border-border' },
]

export default function ExcelColumnDialog({
  columns, rows, onConfirm, onCancel,
  roles: rollenProp, titel, untertitel, initialRoles, onConfirmMap, pflichtRollen,
}: Props) {
  const eigen = !!rollenProp
  const rollen = rollenProp ?? STANDARD_ROLLEN
  const pflicht = pflichtRollen ?? ['hostname', 'serial']

  const [roles, setRoles] = useState<Record<string, ColumnRole>>(
    Object.fromEntries(columns.map((c) => [c.name, initialRoles?.[c.name] ?? c.detectedAs]))
  )

  function setRole(colName: string, role: ColumnRole) {
    setRoles((prev) => ({ ...prev, [colName]: role }))
  }

  function spaltenZu(rolle: string): string[] {
    return columns.filter((c) => roles[c.name] === rolle).map((c) => c.name)
  }

  function handleConfirm() {
    if (eigen && onConfirmMap) {
      const nachRolle: Record<string, string[]> = {}
      for (const r of rollen) if (r.id !== IGNORE) nachRolle[r.id] = spaltenZu(r.id)
      onConfirmMap(nachRolle)
      return
    }
    onConfirm(spaltenZu('hostname'), spaltenZu('serial'), spaltenZu('assignedto'))
  }

  const farbe = (id: string) => rollen.find((r) => r.id === id)?.color ?? ''
  const hasSelection = pflicht.some((r) => Object.values(roles).includes(r))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-card border border-border rounded-xl shadow-2xl ${eigen ? "w-[920px]" : "w-[720px]"} max-h-[85vh] flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Table size={16} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">{titel ?? 'Spalten auswählen'}</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {untertitel ?? 'Welche Spalten enthalten Hostnames oder Seriennummern?'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Table preview */}
        {rows && rows.length > 0 && (
          <div className="shrink-0 px-5 pt-3 pb-2 border-b border-border">
            <p className="text-[10px] font-medium text-muted-foreground mb-2">Vorschau (erste {Math.min(rows.length, 8)} Zeilen)</p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    {columns.map(col => (
                      <th key={col.name} className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="hover:bg-accent/10">
                      {columns.map(col => (
                        <td key={col.name} className="px-2 py-1 text-foreground/80 font-mono whitespace-nowrap max-w-[180px] truncate">
                          {String(row[col.name] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Column list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {columns.map((col) => {
            const role = roles[col.name]
            return (
              <div
                key={col.name}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:bg-accent/20 transition-colors"
              >
                {/* Column letter badge */}
                <span className="w-7 h-7 flex items-center justify-center rounded bg-muted text-[11px] font-bold text-muted-foreground shrink-0 font-mono">
                  {col.letter}
                </span>

                {/* Column name + preview */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{col.name}</p>
                  {col.preview.length > 0 && (
                    <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                      {col.preview.join(' · ')}
                    </p>
                  )}
                </div>

                {/* Role selector */}
                <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                  {rollen.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRole(col.name, r.id)}
                      className={`
                        px-2.5 py-1 text-[11px] font-medium rounded border transition-colors
                        ${role === r.id
                          ? farbe(r.id)
                          : 'border-border text-muted-foreground hover:bg-accent'
                        }
                      `}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
          <p className="text-[11px] text-muted-foreground">
            {Object.values(roles).filter((r) => r !== IGNORE).length} Spalte(n) ausgewählt
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleConfirm}
              disabled={!hasSelection}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              Importieren
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
