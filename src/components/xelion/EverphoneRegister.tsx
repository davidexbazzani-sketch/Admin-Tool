// ── Everphone-Register (im „Diensthandy & Xelion"-Screen) ────────────────────
// Zeigt je Mitarbeiter Anzahl Mobilgeräte + Rufnummer (aus dem Everphone-Export)
// und erlaubt das Aktualisieren per Excel-Import (Original-Everphone-Export).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Smartphone, Search, UploadCloud, Loader2, Check, X, AlertTriangle, Info } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import Card from '../Card'
import { openFileForImport } from '../../utils/fileImport'
import {
  loadEverphone, saveEverphone, parseEverphoneWorkbook, type EverphoneEntry,
} from '../../services/everphone'

function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function EverphoneRegister() {
  const user = useAuthStore(s => s.session?.user)
  const by = user?.displayName || user?.username || 'unbekannt'

  const [entries, setEntries] = useState<EverphoneEntry[]>([])
  const [meta, setMeta] = useState<{ updatedAt: string; updatedBy: string; importedFilename?: string }>({ updatedAt: '', updatedBy: '' })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const s = await loadEverphone()
      setEntries(s.entries)
      setMeta({ updatedAt: s.updatedAt, updatedBy: s.updatedBy, importedFilename: s.importedFilename })
    } catch { setError('Everphone-Daten konnten nicht geladen werden (Netzlaufwerk?).') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])

  async function doImport() {
    setError(''); setMsg('')
    try {
      const file = await openFileForImport()
      if (!file) return
      if (!['xlsx', 'xls'].includes(file.ext)) { setError('Bitte die Everphone-Excel (.xlsx) wählen.'); return }
      setBusy(true)
      const parsed = parseEverphoneWorkbook(file.bytes)
      if (parsed.length === 0) { setError('Keine Einträge erkannt. Ist es der Original-Everphone-Export?'); return }
      const filename = file.filePath.split(/[\\/]/).pop() || 'Everphone.xlsx'
      const ok = await saveEverphone(parsed, by, filename)
      if (!ok) { setError('Speichern fehlgeschlagen (Netzlaufwerk/Schreibrechte?).'); return }
      await reload()
      const withPhone = parsed.filter(e => e.phone).length
      setMsg(`${parsed.length} Mitarbeiter übernommen · ${withPhone} mit Rufnummer · aus „${filename}".`)
    } catch (e) {
      setError('Import fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? entries.filter(e => e.name.toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q) || (e.phone || '').includes(q) || e.deviceIds.some(d => d.toLowerCase().includes(q))) : entries
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [entries, search])

  const totalDevices = useMemo(() => entries.reduce((n, e) => n + (e.deviceCount || e.deviceIds.length), 0), [entries])

  const actions = (
    <div className="flex items-center gap-2">
      <button onClick={doImport} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}Excel importieren
      </button>
    </div>
  )

  return (
    <Card title="Everphone – Mobilgeräte je Mitarbeiter" icon={<Smartphone size={18} />} actions={actions}
      subtitle={meta.updatedAt ? `${entries.length} Mitarbeiter · ${totalDevices} Geräte · Stand ${fmtDateTime(meta.updatedAt)}${meta.importedFilename ? ` · „${meta.importedFilename}"` : ''}` : 'Noch keine Everphone-Liste importiert.'}>

      {/* Anleitung */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/5 border border-blue-500/20 text-[11px] text-muted-foreground">
        <Info size={13} className="text-blue-400 mt-0.5 shrink-0" />
        <span>Lade die Liste unverändert aus dem <b>Everphone-Portal</b> als Excel herunter und importiere sie hier. Erwartetes Format (so wie exportiert): je Mitarbeiter eine Zeile mit <b>Name</b> (Spalte A), <b>E-Mail</b> ggf. mit angehängter Rufnummer (Spalte B) und <b>„N Devices"</b> (Spalte D); direkt darunter je eine Zeile mit der <b>Geräte-ID</b> (Spalte A).</span>
      </div>

      {msg && <div className="px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2"><Check size={13} />{msg}<button onClick={() => setMsg('')} className="ml-auto text-muted-foreground hover:text-foreground"><X size={12} /></button></div>}
      {error && <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2"><AlertTriangle size={13} />{error}</div>}

      {/* Suche */}
      <div className="relative w-72">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, E-Mail, Rufnummer, Geräte-ID…" className="w-full pl-7 pr-2 py-1.5 rounded-md bg-background border border-border text-xs" />
      </div>

      {/* Tabelle */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 size={16} className="animate-spin" />Wird geladen…</div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-10 text-center">
          <Smartphone size={36} className="opacity-30" />
          <p className="text-sm">Noch keine Everphone-Liste. Oben „Excel importieren".</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/20 text-muted-foreground text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Mitarbeiter</th>
                <th className="text-left px-3 py-2 font-medium">E-Mail</th>
                <th className="text-left px-3 py-2 font-medium">Rufnummer</th>
                <th className="text-center px-3 py-2 font-medium">Geräte</th>
                <th className="text-left px-3 py-2 font-medium">Geräte-IDs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={`${e.name}_${i}`} className="border-t border-border/50 hover:bg-accent/10">
                  <td className="px-3 py-1.5 text-foreground">{e.name}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{e.email || '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{e.phone || '—'}</td>
                  <td className="px-3 py-1.5 text-center"><span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 font-semibold">{e.deviceCount || e.deviceIds.length}</span></td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground/80">{e.deviceIds.join(', ') || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Kein Treffer für den Filter.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
