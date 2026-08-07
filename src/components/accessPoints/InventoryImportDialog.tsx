import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { X, FileSpreadsheet, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { autoDetectFieldMap, setInventory, type InventoryColumn, type InventoryFieldMap } from '../../services/accessPoints'
import { api } from '../../electronAPI'

interface Props {
  currentUser: string
  onClose: () => void
  onImported: () => void
}

const ROLE_FIELDS: { key: keyof InventoryFieldMap; label: string }[] = [
  { key: 'name', label: 'AP-Name' },
  { key: 'mac', label: 'MAC-Adresse' },
  { key: 'serial', label: 'Seriennummer / UID' },
  { key: 'model', label: 'Modell / Typ' },
  { key: 'location', label: 'Standort' },
]

export default function InventoryImportDialog({ currentUser, onClose, onImported }: Props) {
  const [filename, setFilename] = useState('')
  const [columns, setColumns] = useState<InventoryColumn[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fieldMap, setFieldMap] = useState<InventoryFieldMap>({ name: '', mac: '', serial: '', model: '', location: '' })
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Direkt beim Öffnen den Datei-Dialog anzeigen
  useEffect(() => {
    void pickFile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      const cols: InventoryColumn[] = keys.map(k => ({ key: k, label: k.replace(/\r?\n/g, ' ').trim() }))
      const stringRows: Record<string, string>[] = parsed.map(row => {
        const out: Record<string, string> = {}
        for (const k of keys) out[k] = String(row[k] ?? '').trim()
        return out
      })
      setFilename(path.split(/[\\/]/).pop() || '')
      setColumns(cols)
      setRows(stringRows)
      setFieldMap(autoDetectFieldMap(cols))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setParsing(false)
    }
  }

  async function save() {
    if (rows.length === 0) return
    if (!fieldMap.name) { setError('Bitte mindestens eine Spalte als „AP-Name" wählen.'); return }
    setSaving(true); setError('')
    const r = await setInventory({
      uploadedFilename: filename,
      uploadedBy: currentUser,
      uploadedAt: new Date().toISOString(),
      columns,
      fieldMap,
      rows,
    })
    setSaving(false)
    if (!r.ok) { setError(r.error || 'Speichern fehlgeschlagen.'); return }
    onImported()
    onClose()
  }

  const sample = useMemo(() => rows.slice(0, 3), [rows])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <FileSpreadsheet size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-foreground flex-1">Inventar importieren</h2>
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
              <span className="text-foreground font-medium">{filename}</span>
              <span className="ml-2 opacity-70">{rows.length} Zeilen · {columns.length} Spalten</span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Rollen-Zuordnung */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Spalten zuordnen</h3>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Wähle die Excel-Spalten, die diesen Standard-Feldern entsprechen. Nicht-zugeordnete Spalten werden trotzdem gespeichert und sind später unter „Inventar-Felder" sichtbar.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ROLE_FIELDS.map(f => (
                    <div key={f.key}>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">{f.label}{f.key === 'name' && <span className="text-red-300 ml-1">*</span>}</label>
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

              {/* Vorschau */}
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
                {columns.length > 8 && <p className="text-[10px] text-muted-foreground mt-1">Es werden alle {columns.length} Spalten gespeichert (nur die ersten 8 sind hier sichtbar).</p>}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={pickFile} disabled={saving} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Andere Datei wählen</button>
              <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
              <button onClick={save} disabled={saving || !fieldMap.name} className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Importieren
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
