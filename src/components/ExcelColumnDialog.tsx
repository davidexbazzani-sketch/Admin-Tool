import { useState } from 'react'
import { X, Table } from 'lucide-react'
import type { ExcelColumn } from '../utils/fileImport'

type ColumnRole = 'hostname' | 'serial' | 'ignore'

interface Props {
  columns: ExcelColumn[]
  onConfirm: (hostnameColNames: string[], serialColNames: string[]) => void
  onCancel: () => void
}

const ROLE_LABELS: Record<ColumnRole, string> = {
  hostname: 'Hostname',
  serial:   'Seriennummer',
  ignore:   'Ignorieren',
}

const ROLE_COLORS: Record<ColumnRole, string> = {
  hostname: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  serial:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  ignore:   'bg-muted text-muted-foreground border-border',
}

export default function ExcelColumnDialog({ columns, onConfirm, onCancel }: Props) {
  const [roles, setRoles] = useState<Record<string, ColumnRole>>(
    Object.fromEntries(columns.map((c) => [c.name, c.detectedAs]))
  )

  function setRole(colName: string, role: ColumnRole) {
    setRoles((prev) => ({ ...prev, [colName]: role }))
  }

  function handleConfirm() {
    const hostnameColNames = columns.filter((c) => roles[c.name] === 'hostname').map((c) => c.name)
    const serialColNames   = columns.filter((c) => roles[c.name] === 'serial').map((c) => c.name)
    onConfirm(hostnameColNames, serialColNames)
  }

  const hasSelection =
    Object.values(roles).includes('hostname') || Object.values(roles).includes('serial')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Table size={16} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Spalten auswählen</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Welche Spalten enthalten Hostnames oder Seriennummern?
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
                <div className="flex gap-1 shrink-0">
                  {(['hostname', 'serial', 'ignore'] as ColumnRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(col.name, r)}
                      className={`
                        px-2.5 py-1 text-[11px] font-medium rounded border transition-colors
                        ${role === r
                          ? ROLE_COLORS[r]
                          : 'border-border text-muted-foreground hover:bg-accent'
                        }
                      `}
                    >
                      {ROLE_LABELS[r]}
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
            {Object.values(roles).filter((r) => r !== 'ignore').length} Spalte(n) ausgewählt
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
