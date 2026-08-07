import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { X, FileSpreadsheet, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { api } from '../../electronAPI'
import { createRun, type InventoryColumn, type InventoryFieldMap } from '../../services/hardwareInventory'

interface Props {
  currentUser: string
  onClose: () => void
  onCreated: (runId: string) => void
}

const ROLE_FIELDS: { key: keyof InventoryFieldMap; label: string; required: boolean }[] = [
  { key: 'serial', label: 'Seriennummer', required: true },
  { key: 'deviceType', label: 'Gerätetyp', required: false },
  { key: 'comment', label: 'Kommentar', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'substate', label: 'Substate', required: false },
]

function autoDetect(cols: InventoryColumn[]): InventoryFieldMap {
  const lower = (s: string) => s.toLowerCase()
  const find = (...needles: string[]): string => {
    for (const n of needles) {
      const c = cols.find(c => lower(c.label) === n || lower(c.key) === n)
      if (c) return c.key
    }
    for (const n of needles) {
      const c = cols.find(c => lower(c.label).includes(n) || lower(c.key).includes(n))
      if (c) return c.key
    }
    return ''
  }
  return {
    serial: find('seriennummer', 'serial', 'sn', 's/n'),
    deviceType: find('gerätetyp', 'geraetetyp', 'devicetype', 'typ', 'type', 'model'),
    comment: find('kommentar', 'comment', 'bemerkung', 'note', 'notes'),
    company: find('company', 'firma', 'unternehmen'),
    status: find('status'),
    substate: find('substate', 'sub-state', 'unterstatus', 'sub state'),
  }
}

export default function ImportDialog({ currentUser, onClose, onCreated }: Props) {
  const [filename, setFilename] = useState('')
  const [filePath, setFilePath] = useState('')
  const [columns, setColumns] = useState<InventoryColumn[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fieldMap, setFieldMap] = useState<InventoryFieldMap>({ serial: '', deviceType: '', comment: '', company: '', status: '', substate: '' })
  const [title, setTitle] = useState('')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void pickFile() /* eslint-disable-line */ }, [])

  async function pickFile() {
    setError('')
    const path = await api().openFileDialog([{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }])
    if (!path) { onClose(); return }
    setParsing(true); setFilePath(path)
    try {
      const r = await api().readFile(path)
      if (!r.success || !r.data) throw new Error(r.error || 'Datei konnte nicht gelesen werden.')
      const bin = atob(r.data)
      const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
      const wb = XLSX.read(u8, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const parsed = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as Record<string, unknown>[]
      if (parsed.length === 0) throw new Error('Datei enthält keine Zeilen.')
      const keys = Object.keys(parsed[0])
      const cols: InventoryColumn[] = keys.map(k => ({ key: k, label: k.replace(/\r?\n/g, ' ').trim() }))
      const stringRows: Record<string, string>[] = parsed.map(row => {
        const out: Record<string, string> = {}
        for (const k of keys) out[k] = String(row[k] ?? '').trim()
        return out
      })
      const fn = path.split(/[\\/]/).pop() || ''
      setFilename(fn)
      setColumns(cols)
      setRows(stringRows)
      setFieldMap(autoDetect(cols))
      const today = new Date().toLocaleDateString('de-DE')
      setTitle(`Inventur ${today}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setParsing(false)
    }
  }

  async function save() {
    if (!fieldMap.serial) { setError('Bitte mindestens die Seriennummer-Spalte zuordnen.'); return }
    setSaving(true); setError('')
    const r = await createRun({
      title: title.trim() || undefined,
      importedFilename: filename,
      importedBy: currentUser,
      fieldMap, columns, rows,
    })
    setSaving(false)
    if (!r.ok || !r.run) { setError(r.error || 'Anlegen fehlgeschlagen.'); return }
    onCreated(r.run.id)
  }

  const sample = useMemo(() => rows.slice(0, 3), [rows])
  const validSerials = useMemo(() => {
    if (!fieldMap.serial) return 0
    return rows.filter(r => (r[fieldMap.serial] || '').trim()).length
  }, [rows, fieldMap.serial])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <FileSpreadsheet size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-foreground flex-1">ServiceNow-Export importieren</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent/40 text-muted-foreground"><X size={16} /></button>
        </div>

        {parsing && (
          <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />Datei wird eingelesen…
          </div>
        )}

        {!parsing && error && (
          <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            <AlertTriangle size={14} />{error}
          </div>
        )}

        {!parsing && rows.length > 0 && (
          <>
            <div className="px-5 py-3 border-b border-border text-xs text-muted-foreground">
              <div className="font-medium text-foreground truncate" title={filePath}>{filename}</div>
              <div className="opacity-70">{rows.length} Zeilen · {columns.length} Spalten{fieldMap.serial && <> · {validSerials} mit Seriennummer</>}</div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Titel der Inventur</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Spalten zuordnen</h3>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Wähle aus der ServiceNow-Excel die passenden Spalten für die Standard-Felder. Andere Spalten werden auch übernommen (für den Export sichtbar).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ROLE_FIELDS.map(f => (
                    <div key={f.key}>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                        {f.label}{f.required && <span className="text-red-300 ml-1">*</span>}
                      </label>
                      <select
                        value={fieldMap[f.key]}
                        onChange={e => setFieldMap(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="">— nicht zugeordnet —</option>
                        {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vorschau (erste 3 Zeilen)</h3>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="text-[11px] w-full">
                    <thead>
                      <tr className="bg-accent/30 text-muted-foreground">
                        {columns.slice(0, 8).map(c => (
                          <th key={c.key} className="text-left font-medium px-2 py-1.5 whitespace-nowrap">{c.label}</th>
                        ))}
                        {columns.length > 8 && <th className="px-2 py-1.5 text-muted-foreground">…</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sample.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          {columns.slice(0, 8).map(c => (
                            <td key={c.key} className="px-2 py-1 text-foreground truncate max-w-[200px]" title={r[c.key]}>{r[c.key] || '—'}</td>
                          ))}
                          {columns.length > 8 && <td className="px-2 py-1 text-muted-foreground">…</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={pickFile} disabled={saving} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Andere Datei wählen</button>
              <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
              <button onClick={save} disabled={saving || !fieldMap.serial} className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Inventur starten
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
