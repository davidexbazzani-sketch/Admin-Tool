import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PackageCheck, AlertTriangle, RefreshCw, FileDown, FileText, FileSpreadsheet,
  ChevronDown, Search as SearchIcon, ChevronLeft, Loader2, CheckCircle2, XCircle,
  Globe, Wifi, WifiOff, User as UserIcon, History, RotateCcw, Pencil, Save,
} from 'lucide-react'
import type { Prefix } from '../../types'
import {
  loadRun, setDeviceAdResult, markDeviceLateFound, undoLateFound, updateRunNotes,
  type InventoryRun, type InventoryDevice,
} from '../../services/hardwareInventory'
import { lookupMany, type AdLookupResult } from '../../services/hardwareInventoryAD'
import { exportInventoryRun, type InventoryExportFormat } from '../../services/hardwareInventoryExport'

interface Props {
  runId: string
  currentUser: string
  onBack: () => void
}

const POLL_MS = 15000
const GLOBAL_PREFIXES: Prefix[] = ['DE', 'DEHAM', 'DESCH']

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ResultsView({ runId, currentUser, onBack }: Props) {
  const [run, setRun] = useState<InventoryRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedPrefixes, setSelectedPrefixes] = useState<Set<string>>(new Set(['DEHAM']))
  const [customPrefix, setCustomPrefix] = useState('')
  const [adRunning, setAdRunning] = useState(false)
  const [adProgress, setAdProgress] = useState<{ done: number; total: number } | null>(null)

  const [search, setSearch] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [lateDialogSerial, setLateDialogSerial] = useState<string | null>(null)
  const [lateNote, setLateNote] = useState('')

  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')

  const reload = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    const r = await loadRun(runId)
    if (r) {
      setRun(r)
      if (!editingNotes) setNotesValue(r.notes || '')
    }
    setLoading(false)
  }, [runId, editingNotes])

  useEffect(() => { reload(true) }, [reload])
  useEffect(() => {
    const t = setInterval(() => reload(false), POLL_MS)
    const onFocus = () => reload(false)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [reload])

  const missing = useMemo(() => (run?.devices || []).filter(d => !d.scanned), [run])
  const lateFound = useMemo(() => (run?.devices || []).filter(d => d.lateFound), [run])
  const scanned = useMemo(() => (run?.devices || []).filter(d => d.scanned), [run])
  const filteredScanned = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scanned
    return scanned.filter(d =>
      d.serial.toLowerCase().includes(q)
      || d.deviceType.toLowerCase().includes(q)
      || d.company.toLowerCase().includes(q)
      || d.comment.toLowerCase().includes(q),
    )
  }, [scanned, search])
  const filteredMissing = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return missing
    return missing.filter(d =>
      d.serial.toLowerCase().includes(q)
      || d.deviceType.toLowerCase().includes(q)
      || d.comment.toLowerCase().includes(q)
      || (d.adHostname || '').toLowerCase().includes(q)
      || (d.adCurrentUser || '').toLowerCase().includes(q),
    )
  }, [missing, search])

  function togglePrefix(p: string) {
    setSelectedPrefixes(prev => {
      const n = new Set(prev)
      if (n.has(p)) n.delete(p); else n.add(p)
      return n
    })
  }

  function activePrefixes(): string[] {
    const arr: string[] = []
    for (const p of selectedPrefixes) {
      if (p === 'Sonstige') {
        if (customPrefix.trim()) arr.push(customPrefix.trim())
      } else arr.push(p)
    }
    return arr
  }

  async function runAdLookup(serialsOverride?: string[]) {
    if (!run) return
    const pfx = activePrefixes()
    if (pfx.length === 0) { setError('Bitte mindestens ein Präfix wählen.'); return }
    const serials = serialsOverride ?? missing.map(d => d.serial)
    if (serials.length === 0) return
    setAdRunning(true); setError('')
    setAdProgress({ done: 0, total: serials.length })
    try {
      const results = await lookupMany(serials, pfx, (done, total) => setAdProgress({ done, total }))
      // Speichern + lokalen State updaten
      for (const r of results) {
        await setDeviceAdResult(run.id, r.serial, {
          prefixesUsed: r.prefixesUsed,
          adHostname: r.hostname,
          adOnline: r.online,
          adLastOnline: r.lastOnline,
          adCurrentUser: r.currentUser,
          adNote: r.error,
        })
      }
      await reload(false)
    } finally {
      setAdRunning(false); setAdProgress(null)
    }
  }

  async function onMarkLateFound(serial: string) {
    if (!run) return
    await markDeviceLateFound(run.id, serial, currentUser, lateNote.trim() || undefined)
    setLateDialogSerial(null); setLateNote('')
    await reload(false)
  }

  async function onUndoLate(serial: string) {
    if (!run) return
    await undoLateFound(run.id, serial, currentUser)
    await reload(false)
  }

  async function saveNotes() {
    if (!run) return
    await updateRunNotes(run.id, notesValue)
    setEditingNotes(false)
    await reload(false)
  }

  async function doExport(format: InventoryExportFormat) {
    setExportOpen(false)
    if (!run) return
    setExporting(true)
    const r = await exportInventoryRun(run, format)
    setExporting(false)
    if (!r.ok && !r.cancelled) setError(r.error || 'Export fehlgeschlagen.')
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm">
        {loading ? <><Loader2 size={16} className="animate-spin" />Lade Bericht…</> : 'Bericht nicht gefunden.'}
      </div>
    )
  }

  const scannedCount = run.devices.filter(d => d.scanned).length
  const allOk = missing.length === 0

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="p-1 rounded text-muted-foreground hover:bg-accent/40"><ChevronLeft size={16} /></button>
        <PackageCheck className="text-primary" size={20} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight truncate">{run.title}</h1>
          <p className="text-[11px] text-muted-foreground">
            {run.status === 'completed' ? 'Abgeschlossen' : 'Offen'} · {scannedCount}/{run.devices.length} erfasst · {missing.length} fehlend{lateFound.length > 0 && <> · {lateFound.length} nachgefunden</>}
            <span className="ml-2 opacity-70">· Stand {fmtDate(run.updatedAt)}</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => reload(true)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent/40 border border-border" title="Aktualisieren"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <div className="relative">
            <button onClick={() => setExportOpen(o => !o)} disabled={exporting} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border">
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}Exportieren<ChevronDown size={12} />
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-1 z-20 w-40 rounded-md border border-border bg-popover shadow-xl py-1">
                  <button onClick={() => doExport('pdf')} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><FileText size={13} className="text-red-400" />Als PDF</button>
                  <button onClick={() => doExport('word')} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><FileText size={13} className="text-blue-400" />Als Word</button>
                  <button onClick={() => doExport('excel')} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><FileSpreadsheet size={13} className="text-emerald-400" />Als Excel</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
          <AlertTriangle size={14} />{error}
        </div>
      )}

      {/* Statusbox */}
      {allOk ? (
        <div className="mx-5 mt-3 px-4 py-3 rounded-lg border border-emerald-500/40 bg-emerald-500 text-black inline-flex items-center gap-2 shrink-0">
          <CheckCircle2 size={18} />
          <span className="text-sm font-medium">Inventur abgeschlossen — alle Geräte sind vorhanden ({scannedCount} von {run.devices.length}).</span>
        </div>
      ) : (
        <div className="mx-5 mt-3 px-4 py-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 shrink-0">
          <div className="flex items-center gap-2"><XCircle size={18} /><span className="text-sm font-medium">{missing.length} Geräte fehlen im Lager.</span></div>
        </div>
      )}

      {/* AD-Lookup */}
      {missing.length > 0 && (
        <div className="mx-5 mt-3 rounded-lg border border-border bg-card/40 p-3 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={14} className="text-primary" />
            <h3 className="text-xs font-semibold text-foreground">AD-Status der fehlenden Geräte abfragen</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">Präfix:</span>
            {GLOBAL_PREFIXES.map(p => (
              <button
                key={p}
                onClick={() => togglePrefix(p)}
                className={`px-2 py-0.5 rounded-md text-[11px] border ${selectedPrefixes.has(p) ? 'bg-primary/20 text-foreground border-primary/50' : 'text-muted-foreground border-border hover:bg-accent/40'}`}
              >{p}</button>
            ))}
            <button
              onClick={() => togglePrefix('Sonstige')}
              className={`px-2 py-0.5 rounded-md text-[11px] border ${selectedPrefixes.has('Sonstige') ? 'bg-primary/20 text-foreground border-primary/50' : 'text-muted-foreground border-border hover:bg-accent/40'}`}
            >Sonstige</button>
            {selectedPrefixes.has('Sonstige') && (
              <input
                value={customPrefix}
                onChange={e => setCustomPrefix(e.target.value)}
                placeholder="eigenes Präfix"
                className="px-2 py-0.5 rounded-md text-[11px] bg-background border border-border w-32"
              />
            )}
            <div className="ml-auto flex items-center gap-2">
              {adProgress && <span className="text-[10px] text-muted-foreground">{adProgress.done}/{adProgress.total}</span>}
              <button
                onClick={() => runAdLookup()}
                disabled={adRunning || activePrefixes().length === 0}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >{adRunning ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}Online-Status + Last-Logon + Benutzer prüfen</button>
            </div>
          </div>
        </div>
      )}

      {/* Such-/Info-Leiste */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border mt-3 shrink-0">
        <span className="text-[11px] text-muted-foreground">{run.extras.length} unerwartet · {missing.length} fehlend · {scannedCount} erfasst</span>
        <div className="relative ml-auto">
          <SearchIcon size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtern…" className="w-56 pl-6 pr-2 py-1 rounded-md bg-card border border-border text-xs" />
        </div>
      </div>

      {/* Einheitlicher Inhalt: unerwartete Scans (oben) · fehlend · erfasst */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
        {/* Unerwartete Scans mit Begründung — ganz oben */}
        {run.extras.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-amber-300 inline-flex items-center gap-1 mb-2"><AlertTriangle size={12} />Unerwartete Scans ({run.extras.length})</h3>
            <div className="space-y-1.5">
              {run.extras.map(x => (
                <div key={x.serial} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-medium text-foreground">{x.serial}</span>
                    <span className="text-muted-foreground">gescannt {fmtDate(x.scannedAt)} von {x.scannedBy}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-muted-foreground">Begründung: </span>
                    {x.reason
                      ? <span className={x.reason === 'SKF Eigentum' ? 'text-emerald-300 font-medium' : 'text-foreground'}>{x.reason}</span>
                      : <span className="italic text-muted-foreground/70">— keine Begründung hinterlegt —</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fehlende Geräte */}
        {missing.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-2">Fehlende Geräte ({filteredMissing.length}/{missing.length})</h3>
            <div className="space-y-1.5">
              {filteredMissing.map(d => <MissingRow key={d.serial} d={d} onLateFound={() => { setLateDialogSerial(d.serial); setLateNote('') }} onLookupOne={() => runAdLookup([d.serial])} />)}
              {filteredMissing.length === 0 && <p className="text-[11px] text-muted-foreground">Keine Treffer für den Filter.</p>}
            </div>
          </div>
        )}

        {/* Erfasste Geräte */}
        <div>
          <h3 className="text-xs font-semibold text-foreground inline-flex items-center gap-1 mb-2"><CheckCircle2 size={12} className="text-emerald-400" />Erfasste Geräte ({filteredScanned.length}/{scannedCount})</h3>
          {filteredScanned.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Keine erfassten Geräte{search ? ' für den Filter' : ''}.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {filteredScanned.map(d => (
                <div key={d.serial} className="px-2.5 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    <span className="font-mono text-foreground truncate">{d.serial}</span>
                    {d.lateFound && <span className="text-[9px] px-1 rounded-full bg-emerald-500 text-black">nachträglich</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{[d.deviceType, d.company].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Nachträglich gefunden */}
      {lateFound.length > 0 && (
        <div className="px-5 py-3 border-t border-border shrink-0">
          <h3 className="text-xs font-semibold text-foreground inline-flex items-center gap-1 mb-2"><History size={12} />Nachträglich gefunden ({lateFound.length})</h3>
          <div className="space-y-1">
            {lateFound.map(d => (
              <div key={d.serial} className="flex items-start gap-2 px-2 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 text-[11px]">
                <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-foreground">{d.serial}</div>
                  <div className="text-muted-foreground">am {fmtDate(d.lateFoundAt)} von {d.lateFoundBy}{d.lateNote && <> · {d.lateNote}</>}</div>
                </div>
                <button onClick={() => onUndoLate(d.serial)} className="text-[10px] text-muted-foreground hover:text-red-300 inline-flex items-center gap-1"><RotateCcw size={11} />zurücknehmen</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notizen */}
      <div className="px-5 py-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-xs font-semibold text-foreground">Notizen zum Bericht</h3>
          {editingNotes ? (
            <button onClick={saveNotes} className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-primary text-primary-foreground"><Save size={10} />Speichern</button>
          ) : (
            <button onClick={() => setEditingNotes(true)} className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:bg-accent/40 border border-border"><Pencil size={10} />Bearbeiten</button>
          )}
        </div>
        {editingNotes ? (
          <textarea
            value={notesValue}
            onChange={e => setNotesValue(e.target.value)}
            rows={3}
            placeholder="Beobachtungen, offene Punkte …"
            className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
          />
        ) : (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{run.notes || <span className="italic opacity-60">Keine Notiz</span>}</p>
        )}
      </div>

      {/* Nachträglich-gefunden-Dialog */}
      {lateDialogSerial && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setLateDialogSerial(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-foreground flex-1">Gerät nachträglich gefunden</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm">Seriennummer: <span className="font-mono font-medium">{lateDialogSerial}</span></p>
              <textarea
                value={lateNote}
                onChange={e => setLateNote(e.target.value)}
                rows={3}
                autoFocus
                placeholder={'Wo gefunden? (z. B. In Schrank Halle 5 entdeckt)'}
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              />
              <p className="text-[10px] text-muted-foreground">Der Eintrag wird mit Zeitstempel + deinem Namen in der Verlauf-Liste festgehalten.</p>
            </div>
            <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setLateDialogSerial(null)} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
              <button onClick={() => onMarkLateFound(lateDialogSerial)} className="ml-auto inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"><CheckCircle2 size={13} />Als gefunden markieren</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MissingRow({ d, onLateFound, onLookupOne }: { d: InventoryDevice; onLateFound: () => void; onLookupOne: () => void }) {
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px]">
      <div className="flex items-center gap-2 flex-wrap">
        <XCircle size={12} className="text-red-400 shrink-0" />
        <span className="font-mono font-medium text-foreground">{d.serial}</span>
        {d.deviceType && <span className="text-muted-foreground">{d.deviceType}</span>}
        {d.company && <span className="text-muted-foreground">· {d.company}</span>}
        {d.substate && <span className="text-muted-foreground">· {d.substate}</span>}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onLookupOne} title="Diesen Eintrag erneut im AD prüfen" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40"><RefreshCw size={11} /></button>
          <button onClick={onLateFound} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500 text-black border border-emerald-600 hover:bg-emerald-500/25">
            <CheckCircle2 size={11} />nachträglich gefunden
          </button>
        </div>
      </div>
      {(d.adHostname || d.adNote) && (
        <div className="mt-1.5 pl-4 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
          <Field label="AD-Hostname" icon={<Globe size={11} />} value={d.adHostname || '—'} mono />
          <Field label="Online" icon={d.adOnline ? <Wifi size={11} className="text-emerald-400" /> : <WifiOff size={11} className="text-red-400" />} value={d.adOnline === undefined ? '—' : (d.adOnline ? 'Ja' : 'Nein')} />
          <Field label="Letzter Logon" icon={<History size={11} />} value={fmtDate(d.adLastOnline)} />
          <Field label="Aktuell angemeldet" icon={<UserIcon size={11} />} value={d.adCurrentUser || '—'} />
          {d.adNote && <Field label="Hinweis" value={d.adNote} />}
        </div>
      )}
      {d.comment && <div className="mt-1 pl-4 text-muted-foreground">{d.comment}</div>}
    </div>
  )
}

function Field({ label, icon, value, mono }: { label: string; icon?: React.ReactNode; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      {icon}
      <span className="text-muted-foreground">{label}:</span>
      <span className={`text-foreground ${mono ? 'font-mono' : ''} truncate`}>{value}</span>
    </div>
  )
}
