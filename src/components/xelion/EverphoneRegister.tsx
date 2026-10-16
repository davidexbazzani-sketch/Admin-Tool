// ── Everphone-Register (im „Diensthandy & Xelion"-Screen) ────────────────────
// Zeigt je Mitarbeiter Anzahl Mobilgeräte + Rufnummer (aus dem Everphone-Export)
// und erlaubt das Aktualisieren per Excel-Import (Original-Everphone-Export).
//
// Jeder Import ersetzt das Register vollständig. Wer im neuen Export fehlt, wandert
// deshalb ins ARCHIV statt verloren zu gehen — das Archiv wächst mit jedem Import und
// wird nie geleert. Umgekehrt wird ein Archiv-Eintrag als „wieder da" gekennzeichnet,
// wenn die Person erneut auftaucht; gelöscht wird er auch dann nicht.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Smartphone, Search, UploadCloud, Loader2, Check, X, AlertTriangle, Info,
  Archive, ArrowLeft, RotateCcw,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import Card from '../Card'
import { openFileForImport } from '../../utils/fileImport'
import {
  loadEverphone, saveEverphone, parseEverphoneWorkbook,
  loadEverphoneArchive, planArchive, commitArchive, istVerdaechtig,
  ARCHIVE_VERDACHT_ANTEIL,
  type EverphoneEntry, type EverphoneArchiveEntry, type ArchivePlan,
} from '../../services/everphone'

function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Ein noch nicht übernommener Import — wartet auf die Bestätigung. */
interface OffenerImport {
  parsed: EverphoneEntry[]
  filename: string
  plan: ArchivePlan
}

export default function EverphoneRegister() {
  const user = useAuthStore(s => s.session?.user)
  const by = user?.displayName || user?.username || 'unbekannt'

  const [entries, setEntries] = useState<EverphoneEntry[]>([])
  const [meta, setMeta] = useState<{ updatedAt: string; updatedBy: string; importedFilename?: string }>({ updatedAt: '', updatedBy: '' })
  const [archiv, setArchiv] = useState<EverphoneArchiveEntry[]>([])
  const [archivMeta, setArchivMeta] = useState<{ updatedAt: string; updatedBy: string }>({ updatedAt: '', updatedBy: '' })
  const [ansicht, setAnsicht] = useState<'register' | 'archiv'>('register')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [offen, setOffen] = useState<OffenerImport | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [s, a] = await Promise.all([loadEverphone(), loadEverphoneArchive()])
      setEntries(s.entries)
      setMeta({ updatedAt: s.updatedAt, updatedBy: s.updatedBy, importedFilename: s.importedFilename })
      setArchiv(a.entries)
      setArchivMeta({ updatedAt: a.updatedAt, updatedBy: a.updatedBy })
    } catch { setError('Everphone-Daten konnten nicht geladen werden (Netzlaufwerk?).') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])

  /**
   * Import übernehmen: ZUERST das Archiv schreiben, dann das Register. Scheitert das
   * Archiv, wird das Register nicht angefasst — sonst wären die fehlenden Einträge weg,
   * ohne irgendwo festgehalten zu sein.
   */
  async function uebernehmen(imp: OffenerImport) {
    setBusy(true); setError(''); setMsg(''); setOffen(null)
    try {
      const ok = await commitArchive(imp.plan, meta.updatedAt, by, imp.filename)
      if (!ok) {
        setError('Das Archiv konnte nicht geschrieben werden — der Import wurde deshalb NICHT übernommen '
          + '(Netzlaufwerk/Schreibrechte?). So geht kein Eintrag verloren.')
        return
      }
      if (!await saveEverphone(imp.parsed, by, imp.filename)) {
        setError('Speichern des Registers fehlgeschlagen (Netzlaufwerk/Schreibrechte?).')
        return
      }
      await reload()
      const mitNummer = imp.parsed.filter(e => e.phone).length
      const teile = [
        `${imp.parsed.length} Mitarbeiter übernommen`,
        `${mitNummer} mit Rufnummer`,
      ]
      if (imp.plan.vanished.length) teile.push(`${imp.plan.vanished.length} ins Archiv verschoben`)
      if (imp.plan.returning.length) teile.push(`${imp.plan.returning.length} wieder aufgetaucht`)
      setMsg(`${teile.join(' · ')} · aus „${imp.filename}".`)
    } catch (e) {
      setError('Import fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }

  async function doImport() {
    setError(''); setMsg(''); setOffen(null)
    try {
      const file = await openFileForImport()
      if (!file) return
      if (!['xlsx', 'xls'].includes(file.ext)) { setError('Bitte die Everphone-Excel (.xlsx) wählen.'); return }
      setBusy(true)
      const parsed = parseEverphoneWorkbook(file.bytes)
      if (parsed.length === 0) { setError('Keine Einträge erkannt. Ist es der Original-Everphone-Export?'); return }
      const filename = file.filePath.split(/[\\/]/).pop() || 'Everphone.xlsx'

      // Archiv frisch lesen — in der Zwischenzeit kann jemand anders importiert haben.
      const a = await loadEverphoneArchive()
      const plan = planArchive(entries, parsed, a.entries)
      const imp: OffenerImport = { parsed, filename, plan }

      // Würde der Import einen großen Teil des Registers ins Archiv schieben, ist das
      // meistens die falsche Datei. Dann erst zurückfragen und zeigen, wen es trifft.
      if (istVerdaechtig(plan, entries.length)) { setOffen(imp); return }
      await uebernehmen(imp)
    } catch (e) {
      setError('Import fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? entries.filter(e => e.name.toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q) || (e.phone || '').includes(q) || e.deviceIds.some(d => d.toLowerCase().includes(q))) : entries
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [entries, search])

  const archivRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? archiv.filter(e => e.name.toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q) || (e.phone || '').includes(q) || e.deviceIds.some(d => d.toLowerCase().includes(q))) : archiv
    // Neuestes zuerst — was gerade weggefallen ist, interessiert am meisten.
    return [...list].sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''))
  }, [archiv, search])

  const totalDevices = useMemo(() => entries.reduce((n, e) => n + (e.deviceCount || e.deviceIds.length), 0), [entries])
  const archivOffen = useMemo(() => archiv.filter(e => !e.returnedAt).length, [archiv])

  const actions = (
    <div className="flex items-center gap-2">
      {ansicht === 'register' ? (
        <>
          <button onClick={() => { setAnsicht('archiv'); setSearch('') }}
            title="Einträge, die in einem neuen Import nicht mehr dabei waren"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-foreground hover:bg-accent">
            <Archive size={14} />Archiv{archiv.length > 0 && <span className="text-muted-foreground">({archiv.length})</span>}
          </button>
          <button onClick={doImport} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}Excel importieren
          </button>
        </>
      ) : (
        <button onClick={() => { setAnsicht('register'); setSearch('') }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-foreground hover:bg-accent">
          <ArrowLeft size={14} />Zurück zum Register
        </button>
      )}
    </div>
  )

  const untertitel = ansicht === 'archiv'
    ? (archiv.length
      ? `${archiv.length} archivierte Einträge · ${archivOffen} nicht mehr im Register${archivMeta.updatedAt ? ` · zuletzt ergänzt ${fmtDateTime(archivMeta.updatedAt)}` : ''}`
      : 'Noch nichts archiviert — hier landen Einträge, die in einem neuen Import fehlen.')
    : (meta.updatedAt
      ? `${entries.length} Mitarbeiter · ${totalDevices} Geräte · Stand ${fmtDateTime(meta.updatedAt)}${meta.importedFilename ? ` · „${meta.importedFilename}"` : ''}`
      : 'Noch keine Everphone-Liste importiert.')

  return (
    <Card
      title={ansicht === 'archiv' ? 'Everphone – Archiv' : 'Everphone – Mobilgeräte je Mitarbeiter'}
      icon={ansicht === 'archiv' ? <Archive size={18} /> : <Smartphone size={18} />}
      actions={actions} subtitle={untertitel}>

      {/* Anleitung nur im Register — im Archiv wäre sie nur Ballast. */}
      {ansicht === 'register' && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/5 border border-blue-500/20 text-[11px] text-muted-foreground">
          <Info size={13} className="text-blue-400 mt-0.5 shrink-0" />
          <span>Lade die Liste unverändert aus dem <b>Everphone-Portal</b> als Excel herunter und importiere sie hier. Erwartetes Format (so wie exportiert): je Mitarbeiter eine Zeile mit <b>Name</b> (Spalte A), <b>E-Mail</b> ggf. mit angehängter Rufnummer (Spalte B) und <b>„N Devices"</b> (Spalte D); direkt darunter je eine Zeile mit der <b>Geräte-ID</b> (Spalte A). Wer im neuen Import fehlt, wandert ins <b>Archiv</b> und bleibt dort dauerhaft.</span>
        </div>
      )}

      {msg && <div className="px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2"><Check size={13} />{msg}<button onClick={() => setMsg('')} className="ml-auto text-muted-foreground hover:text-foreground"><X size={12} /></button></div>}
      {error && <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{error}</div>}

      {/* Rückfrage bei auffällig vielen Wegfällen */}
      {offen && (
        <div className="px-3 py-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 text-xs space-y-2">
          <p className="flex items-start gap-2 text-foreground">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <span>
              Dieser Import würde <b>{offen.plan.vanished.length} von {entries.length}</b> Einträgen
              ins Archiv verschieben (mehr als {Math.round(ARCHIVE_VERDACHT_ANTEIL * 100)} %).
              Das sieht nach der falschen Datei oder einem unvollständigen Export aus —
              bitte einmal prüfen. Archiviert wird nichts gelöscht, aber das Register zeigt
              danach nur noch die {offen.parsed.length} Einträge aus „{offen.filename}".
            </span>
          </p>
          <div className="max-h-32 overflow-auto rounded border border-border bg-background/50 px-2 py-1">
            {offen.plan.vanished.map((e, i) => (
              <div key={`${e.name}_${i}`} className="text-[11px] text-muted-foreground">
                {e.name}{e.email ? ` · ${e.email}` : ''} · {e.deviceCount || e.deviceIds.length} Gerät(e)
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void uebernehmen(offen)} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Trotzdem übernehmen
            </button>
            <button onClick={() => setOffen(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border text-foreground hover:bg-accent">
              <X size={13} />Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Suche */}
      <div className="relative w-72">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Name, E-Mail, Rufnummer, Geräte-ID…"
          className="w-full pl-7 pr-2 py-1.5 rounded-md bg-background border border-border text-xs" />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 size={16} className="animate-spin" />Wird geladen…</div>
      ) : ansicht === 'archiv' ? (
        /* ── Archiv ──────────────────────────────────────────────────────── */
        archiv.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-10 text-center">
            <Archive size={36} className="opacity-30" />
            <p className="text-sm">Noch nichts im Archiv.</p>
            <p className="text-[11px] max-w-md">Beim nächsten Import landen hier automatisch alle Einträge,
              die im neuen Everphone-Export nicht mehr enthalten sind — und bleiben dauerhaft erhalten.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/20 text-muted-foreground text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Mitarbeiter</th>
                  <th className="text-left px-3 py-2 font-medium">E-Mail</th>
                  <th className="text-left px-3 py-2 font-medium">Rufnummer</th>
                  <th className="text-center px-3 py-2 font-medium">Geräte</th>
                  <th className="text-left px-3 py-2 font-medium">Geräte-IDs</th>
                  <th className="text-left px-3 py-2 font-medium">Zuletzt im Import</th>
                  <th className="text-left px-3 py-2 font-medium">Archiviert</th>
                </tr>
              </thead>
              <tbody>
                {archivRows.map((e, i) => (
                  <tr key={`${e.archivedAt}_${e.name}_${i}`} className="border-t border-border/50 hover:bg-accent/10">
                    <td className="px-3 py-1.5 text-foreground">
                      {e.name}
                      {/* Wieder aufgetaucht: der Eintrag bleibt im Archiv, ist aber kein Wegfall mehr. */}
                      {e.returnedAt && (
                        <span title={`Wieder im Register seit ${fmtDateTime(e.returnedAt)}`}
                          className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-border bg-muted/20 text-[10px] text-muted-foreground">
                          <RotateCcw size={9} />wieder da
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{e.email || '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{e.phone || '—'}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground font-semibold">
                        {e.deviceCount || e.deviceIds.length}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground/80">{e.deviceIds.join(', ') || '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{fmtDateTime(e.lastSeenAt)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {fmtDateTime(e.archivedAt)}
                      <span className="block text-[10px] text-muted-foreground/70">
                        {e.archivedBy}{e.importFilename ? ` · „${e.importFilename}"` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
                {archivRows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Kein Treffer für den Filter.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-10 text-center">
          <Smartphone size={36} className="opacity-30" />
          <p className="text-sm">Noch keine Everphone-Liste. Oben „Excel importieren".</p>
        </div>
      ) : (
        /* ── Register ────────────────────────────────────────────────────── */
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
