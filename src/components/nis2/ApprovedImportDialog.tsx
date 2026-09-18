import { useMemo, useState } from 'react'
import { X, ClipboardCheck } from 'lucide-react'
import type { ExcelColumn } from '../../utils/fileImport'

export interface ColumnMap { name: string; status?: string; ritm?: string; req?: string }

interface Props {
  columns: ExcelColumn[]
  rows: Record<string, unknown>[]
  onConfirm: (map: ColumnMap) => void
  onCancel: () => void
}

/** Auto-Erkennung der Spalten (Header + Werte-Muster) für den SC-Req-Item-Export. */
export function autodetectColumns(columns: ExcelColumn[], rows: Record<string, unknown>[]): ColumnMap {
  const H = (c: ExcelColumn) => c.name.toLowerCase()
  const val = (c: ExcelColumn, re: RegExp) => rows.slice(0, 25).some(r => re.test(String(r[c.name] ?? '')))
  const byHeader = (re: RegExp) => columns.find(c => re.test(H(c)))?.name
  const byVal = (re: RegExp) => columns.find(c => val(c, re))?.name
  const name = byHeader(/requested for|antragsteller|^name$|mitarbeiter|benutzer|^user$/) || byHeader(/name/)
  const status = byHeader(/stage|status|state|genehmig|approval/)
  const ritm = byVal(/^\s*RITM\d/i) || byHeader(/ritm/) || byHeader(/^number$|nummer/)
  const req = byVal(/^\s*REQ\d/i) || byHeader(/^request$|^req$/)
  return { name: name || '', status, ritm, req }
}

export default function ApprovedImportDialog({ columns, rows, onConfirm, onCancel }: Props) {
  const auto = useMemo(() => autodetectColumns(columns, rows), [columns, rows])
  const [map, setMap] = useState<ColumnMap>(auto)
  const opts = ['', ...columns.map(c => c.name)]
  const sel = (role: keyof ColumnMap, label: string, hint: string, required = false) => (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground">{label}{required && ' *'} <span className="text-muted-foreground/60">— {hint}</span></label>
      <select value={map[role] || ''} onChange={e => setMap(m => ({ ...m, [role]: e.target.value || undefined }))}
        className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary">
        <option value="">(keine)</option>
        {opts.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-[760px] max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <ClipboardCheck size={16} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Genehmigte Liste — Spalten zuordnen</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Stage = „Completed" gilt als genehmigt (mit RITM/REQ). Andere Status werden als Antrag angezeigt.</p>
            </div>
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-3 shrink-0">
          {sel('name', 'Name', 'Person (z. B. „Requested for")', true)}
          {sel('status', 'Status', 'Stage/Status des Antrags')}
          {sel('ritm', 'RITM-Nummer', 'z. B. Spalte „Number"')}
          {sel('req', 'REQ-Nummer', 'z. B. Spalte „Request"')}
        </div>

        {rows.length > 0 && (
          <div className="px-5 pb-3 min-h-0 flex-1 overflow-auto">
            <p className="text-[10px] font-medium text-muted-foreground mb-2">Vorschau (erste {Math.min(rows.length, 8)} Zeilen)</p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[11px]">
                <thead><tr className="bg-muted/30 border-b border-border">{columns.map(c => (
                  <th key={c.name} className={`px-2 py-1.5 text-left font-semibold whitespace-nowrap ${[map.name, map.status, map.ritm, map.req].includes(c.name) ? 'text-primary' : 'text-muted-foreground'}`}>{c.name}</th>
                ))}</tr></thead>
                <tbody className="divide-y divide-border">
                  {rows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="hover:bg-accent/10">{columns.map(c => <td key={c.name} className="px-2 py-1 text-foreground/80 whitespace-nowrap max-w-[200px] truncate">{String(row[c.name] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
          <p className="text-[11px] text-muted-foreground">{rows.length} Zeilen in der Datei</p>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors">Abbrechen</button>
            <button onClick={() => map.name && onConfirm(map)} disabled={!map.name}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">Übernehmen</button>
          </div>
        </div>
      </div>
    </div>
  )
}
