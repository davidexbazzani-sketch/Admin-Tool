import { useState } from 'react'
import { X, ListChecks } from 'lucide-react'
import type { ExcelColumn } from '../utils/fileImport'

type TaskColRole = 'task' | 'ignore'

interface Props {
  columns: ExcelColumn[]
  rows?: Record<string, unknown>[]
  onConfirm: (taskColNames: string[]) => void
  onCancel: () => void
}

const ROLE_STYLES: Record<TaskColRole, string> = {
  task:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
  ignore: 'bg-muted text-muted-foreground border-border',
}
const ROLE_LABELS: Record<TaskColRole, string> = {
  task:   'TASK-Nummer',
  ignore: 'Ignorieren',
}

/** Heuristik: Spaltenname enthält „task"/„aufgabe" ODER die Werte sehen wie TASK-Nrn aus. */
export function detectTaskCol(col: ExcelColumn): TaskColRole {
  const nameLower = col.name.toLowerCase().replace(/[\s_\-]/g, '')
  if (['task', 'aufgabe', 'tasknr', 'tasknummer', 'ritm', 'req'].some(k => nameLower.includes(k))) return 'task'
  if (col.preview.some(v => /^TASK\s*\d{3,}/i.test(v.trim()))) return 'task'
  return 'ignore'
}

export default function TaskColumnDialog({ columns, rows, onConfirm, onCancel }: Props) {
  const [roles, setRoles] = useState<Record<string, TaskColRole>>(
    Object.fromEntries(columns.map(c => [c.name, detectTaskCol(c)])),
  )

  function setRole(colName: string, role: TaskColRole) {
    setRoles(prev => ({ ...prev, [colName]: role }))
  }
  function handleConfirm() {
    onConfirm(columns.filter(c => roles[c.name] === 'task').map(c => c.name))
  }
  const hasSelection = Object.values(roles).includes('task')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-[680px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <ListChecks size={16} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">TASK-Spalte auswählen</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Welche Spalte enthält die TASK-Nummern?</p>
            </div>
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>

        {rows && rows.length > 0 && (
          <div className="shrink-0 px-5 pt-3 pb-2 border-b border-border">
            <p className="text-[10px] font-medium text-muted-foreground mb-2">Vorschau (erste {Math.min(rows.length, 8)} Zeilen)</p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    {columns.map(col => (
                      <th key={col.name} className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{col.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="hover:bg-accent/10">
                      {columns.map(col => (
                        <td key={col.name} className="px-2 py-1 text-foreground/80 font-mono whitespace-nowrap max-w-[180px] truncate">{String(row[col.name] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {columns.map(col => {
            const role = roles[col.name]
            return (
              <div key={col.name} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:bg-accent/20 transition-colors">
                <span className="w-7 h-7 flex items-center justify-center rounded bg-muted text-[11px] font-bold text-muted-foreground shrink-0 font-mono">{col.letter}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{col.name}</p>
                  {col.preview.length > 0 && (
                    <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{col.preview.join(' · ')}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {(['task', 'ignore'] as TaskColRole[]).map(r => (
                    <button key={r} onClick={() => setRole(col.name, r)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors ${role === r ? ROLE_STYLES[r] : 'border-border text-muted-foreground hover:bg-accent'}`}>
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
          <p className="text-[11px] text-muted-foreground">{Object.values(roles).filter(r => r === 'task').length} Spalte(n) als TASK markiert</p>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors">Abbrechen</button>
            <button onClick={handleConfirm} disabled={!hasSelection}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">
              Importieren
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
