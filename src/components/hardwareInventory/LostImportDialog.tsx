import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { X, FileSpreadsheet, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { api } from '../../electronAPI'
import { addLostSerials } from '../../services/lostDevices'

interface Props {
  currentUser: string
  onClose: () => void
  onImported: (added: number, skipped: number) => void
}

interface Column { key: string; label: string }

function autoDetectSerial(cols: Column[]): string {
  const lower = (s: string) => s.toLowerCase()
  for (const n of ['seriennummer', 'serial', 'serialnumber', 'sn', 's/n']) {
    const c = cols.find(c => lower(c.label) === n || lower(c.key) === n)
    if (c) return c.key
  }
  for (const n of ['seriennummer', 'serial', 'sn']) {
    const c = cols.find(c => lower(c.label).includes(n))
    if (c) return c.key
  }
  return ''
}

export default function LostImportDialog({ currentUser, onClose, onImported }: Props) {
  const [filename, setFilename] = useState('')
  const [columns, setColumns] = useState<Column[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [serialCol, setSerialCol] = useState('')
  const [typeCol, setTypeCol] = useState('')
  const [commentCol, setCommentCol] = useState('')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void pickFile() /* eslint-disable-line */ }, [])

  async function pickFile() {
    setError('')
    const path = await api().openFileDialog([{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }])
    if (!path) { onClose(); return }
    setParsing(true)
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
      const cols: Column[] = keys.map(k => ({ key: k, label: k.replace(/\r?\n/g, ' ').trim() }))
      const stringRows = parsed.map(row => {
        const out: Record<string, string> = {}
        for (const k of keys) out[k] = String(row[k] ?? '').trim()
        return out
      })
      setFilename(path.split(/[\\/]/).pop() || '')
      setColumns(cols)
      setRows(stringRows)
      setSerialCol(autoDetectSerial(cols))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setParsing(false)
    }
  }

  const validSerials = useMemo(() => {
    if (!serialCol) return 0
    return rows.filter(r => (r[serialCol] || '').trim()).length
  }, [rows, serialCol])
  const sample = useMemo(() => rows.slice(0, 3), [rows])

  async function save() {
    if (!serialCol) { setError('Bitte die Spalte mit den Seriennummern auswählen.'); return }
    setSaving(true); setError('')
    const items = rows.map(r => ({
      serial: r[serialCol] || '',
      deviceType: typeCol ? r[typeCol] : undefined,
      comment: commentCol ? r[commentCol] : undefined,
    })).filter(x => x.serial.trim())
    const res = await addLostSerials(items, filename || 'Import', currentUser)
    setSaving(false)
    if (!res.ok) { setError(res.error || 'Import fehlgeschlagen.'); return }
    onImported(res.added, res.skipped)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <FileSpreadsheet size={16} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-foreground flex-1">Verlorene Geräte importieren</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent/40 text-muted-foreground"><X size={16} /></button>
        </div>

        {parsing && (
          <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />Datei wird eingelesen…</div>
        )}

        {!parsing && error && (
          <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs"><AlertTriangle size={14} />{error}</div>
        )}

        {!parsing && rows.length > 0 && (
          <>
            <div className="px-5 py-3 border-b border-border text-xs text-muted-foreground">
              <div className="font-medium text-foreground truncate">{filename}</div>
              <div className="opacity-70">{rows.length} Zeilen · {columns.length} Spalten{serialCol && <> · {validSerials} mit Seriennummer</>}</div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Spalte zuordnen</h3>
                <p className="text-[11px] text-muted-foreground mb-3">Wähle die Spalte, in der die <strong className="text-foreground">Seriennummern</strong> stehen. Gerätetyp und Kommentar sind optional.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1">Seriennummer <span className="text-red-300">*</span></label>
                    <select value={serialCol} onChange={e => setSerialCol(e.target.value)} className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="">— wählen —</option>
                      {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1">Gerätetyp (optional)</label>
                    <select value={typeCol} onChange={e => setTypeCol(e.target.value)} className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="">— nicht zugeordnet —</option>
                      {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1">Kommentar (optional)</label>
                    <select value={commentCol} onChange={e => setCommentCol(e.target.value)} className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="">— nicht zugeordnet —</option>
                      {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vorschau (erste 3 Zeilen)</h3>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="text-[11px] w-full">
                    <thead><tr className="bg-accent/30 text-muted-foreground">
                      {columns.slice(0, 8).map(c => <th key={c.key} className="text-left font-medium px-2 py-1.5 whitespace-nowrap">{c.label}</th>)}
                      {columns.length > 8 && <th className="px-2 py-1.5">…</th>}
                    </tr></thead>
                    <tbody>
                      {sample.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          {columns.slice(0, 8).map(c => <td key={c.key} className="px-2 py-1 text-foreground truncate max-w-[200px]" title={r[c.key]}>{r[c.key] || '—'}</td>)}
                          {columns.length > 8 && <td className="px-2 py-1 text-muted-foreground">…</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={pickFile} disabled={saving} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Andere Datei</button>
              <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
              <button onClick={save} disabled={saving || !serialCol} className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Zur Verlust-Liste hinzufügen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
