import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Scan, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, Check,
  ChevronLeft, PackageCheck, Search, RotateCcw, Trash2, Info,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import {
  applyScan, loadRun, completeRunWithReasons, extractSerialFromScan, normalizeSerial,
  unscanDevice, removeExtra,
  type InventoryRun, type InventoryDevice,
} from '../../services/hardwareInventory'
import { loadLostSerialSet, markRecovered } from '../../services/lostDevices'
import { loadDevices as loadEndpointDevices } from '../../services/endpointDevices'
import { playShrillAlert } from '../../services/scanAlert'

interface Props {
  runId: string
  currentUser: string
  onBack: () => void
  onCompleted: () => void
}

const POLL_MS = 8000

type FilterMode = 'all' | 'missing' | 'scanned'

export default function ScanPanel({ runId, currentUser, onBack, onCompleted }: Props) {
  const setErrorFlash = useAppStore(s => s.setErrorFlash)
  const [run, setRun] = useState<InventoryRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [lastResult, setLastResult] = useState<{ kind: 'matched_new' | 'matched_again' | 'extra' | 'invalid'; serial: string; rawValue?: string; ts: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const [filter, setFilter] = useState<FilterMode>('missing')
  const [search, setSearch] = useState('')
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [completing, setCompleting] = useState(false)

  // Abgleich gegen die "verloren gemeldeten" Geraete
  const [lostSet, setLostSet] = useState<Set<string>>(new Set())
  const [lostFound, setLostFound] = useState<{ serial: string; location: string } | null>(null)

  // Extras-Review vor dem Abschluss (Begruendung je unerwartetem Scan)
  const [extrasReview, setExtrasReview] = useState(false)
  const [extrasLoading, setExtrasLoading] = useState(false)
  const [extrasReasons, setExtrasReasons] = useState<Record<string, string>>({})
  const [skfSet, setSkfSet] = useState<Set<string>>(new Set())

  // Rechtsklick-Kontextmenue zum Entfernen einer Erfassung
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; kind: 'device' | 'extra'; serial: string } | null>(null)
  const [removing, setRemoving] = useState(false)

  // Kontextmenue schliessen bei Klick/Scroll/Escape ausserhalb
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [ctxMenu])

  function openCtxMenu(e: React.MouseEvent, kind: 'device' | 'extra', serial: string) {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, kind, serial })
  }

  async function handleRemoveEntry() {
    if (!ctxMenu) return
    setRemoving(true)
    const r = ctxMenu.kind === 'device'
      ? await unscanDevice(runId, ctxMenu.serial, currentUser)
      : await removeExtra(runId, ctxMenu.serial, currentUser)
    setRemoving(false)
    setCtxMenu(null)
    if (!r.ok) { setError(r.error || 'Eintrag konnte nicht entfernt werden.'); return }
    if (r.run) setRun(r.run)
    refocus()
  }

  // Beim Verlassen des Panels den globalen Flash sicherheitshalber abräumen
  useEffect(() => () => { setErrorFlash(false) }, [setErrorFlash])

  const reload = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    const r = await loadRun(runId)
    if (r) setRun(r)
    setLoading(false)
  }, [runId])

  useEffect(() => { reload(true) }, [reload])

  // Live-Sync (andere Mitarbeiter scannen parallel) — nur wenn keine
  // unbestätigte Falsch-Scan-Eingabe im Feld steht (sonst springt der Fokus).
  useEffect(() => {
    const t = setInterval(() => { if (!invalid) reload(false) }, POLL_MS)
    const onFocus = () => { if (!invalid) reload(false) }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [reload, invalid])

  // Eingabefeld initial fokussieren + nach jedem Scan refokussieren
  useEffect(() => {
    inputRef.current?.focus()
  }, [run?.id])

  // Liste der verloren gemeldeten Seriennummern laden + regelmaessig auffrischen
  useEffect(() => {
    const refresh = () => loadLostSerialSet().then(setLostSet).catch(() => {})
    refresh()
    const t = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(t); window.removeEventListener('focus', refresh) }
  }, [])

  function refocus() {
    inputRef.current?.focus()
  }

  async function submit() {
    const raw = value
    if (!raw.trim()) return
    setBusy(true)
    const r = await applyScan(runId, raw, currentUser)
    setBusy(false)
    if (!r.ok) { setError(r.error || 'Scan fehlgeschlagen.'); return }
    if (r.run) setRun(r.run)
    const out = r.outcome!
    if (out.kind === 'invalid') {
      // Falsch-Scan: Eingabe behalten, Ton + Rot-Blink, App blockiert weiteres Scannen
      setInvalid(true)
      setErrorFlash(true, `Falsch-Scan erkannt: "${raw.slice(0, 80)}"`)
      playShrillAlert()
      setLastResult({ kind: 'invalid', serial: raw, rawValue: raw, ts: Date.now() })
      // Feld NICHT leeren — Benutzer muss den falschen Wert manuell entfernen
      inputRef.current?.focus(); inputRef.current?.select()
      return
    }
    setLastResult({ kind: out.kind, serial: out.normalizedSerial, rawValue: raw, ts: Date.now() })
    setValue('')

    // Abgleich: War diese Seriennummer als "verloren" gemeldet? -> gross melden
    // und automatisch zu den wieder aufgefundenen Geraeten verschieben.
    const serial = out.normalizedSerial
    if (serial && lostSet.has(serial)) {
      const location = `bei der Inventur am ${new Date().toLocaleDateString('de-DE')} gefunden`
      const rec = await markRecovered(serial, location, currentUser, 'inventur')
      if (rec.ok) {
        setLostSet(prev => { const n = new Set(prev); n.delete(serial); return n })
        setLostFound({ serial, location })
      }
    }
    refocus()
  }

  // Eingabe-Wert ändert sich: solange ungültig + abweichend, Flash beibehalten;
  // sobald geleert oder eine Seriennummer extrahierbar ist, Flash entfernen.
  function onChangeValue(v: string) {
    setValue(v)
    if (invalid) {
      if (v.trim() === '' || extractSerialFromScan(v)) {
        setInvalid(false)
        setErrorFlash(false)
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    if (e.key === 'Escape') { e.preventDefault(); clearInvalid() }
  }

  function clearInvalid() {
    setValue('')
    setInvalid(false)
    setErrorFlash(false)
    refocus()
  }

  // "Inventur abschließen" gedrueckt: bei unerwarteten Scans zuerst die
  // Begruendungen erfassen (Extras-Review), sonst direkt zur Bestaetigung.
  async function startComplete() {
    if (run && run.extras.length > 0) {
      setExtrasReview(true)
      setExtrasLoading(true)
      try {
        const devs = await loadEndpointDevices()
        const ownerBySerial = new Map<string, string>()
        for (const d of devs) { const s = normalizeSerial(d.serial); if (s) ownerBySerial.set(s, d.assetOwnership || '') }
        const reasons: Record<string, string> = {}
        const skf = new Set<string>()
        for (const ex of run.extras) {
          const owner = ownerBySerial.get(ex.serial) || ''
          if (/skf/i.test(owner)) { reasons[ex.serial] = 'SKF Eigentum'; skf.add(ex.serial) }
          else reasons[ex.serial] = ex.reason || ''
        }
        setSkfSet(skf); setExtrasReasons(reasons)
      } catch {
        const reasons: Record<string, string> = {}
        for (const ex of run.extras) reasons[ex.serial] = ex.reason || ''
        setSkfSet(new Set()); setExtrasReasons(reasons)
      } finally { setExtrasLoading(false) }
    } else {
      setConfirmComplete(true)
    }
  }

  const allExtrasHaveReason = useMemo(() => {
    if (!run) return true
    return run.extras.every(ex => skfSet.has(ex.serial) || (extrasReasons[ex.serial] || '').trim().length > 0)
  }, [run, skfSet, extrasReasons])

  async function doComplete() {
    setCompleting(true)
    const r = await completeRunWithReasons(runId, currentUser, extrasReasons)
    setCompleting(false)
    setConfirmComplete(false)
    if (!r.ok) { setError(r.error || 'Abschluss fehlgeschlagen.'); return }
    onCompleted()
  }

  const devices: InventoryDevice[] = run?.devices || []
  const scannedCount = useMemo(() => devices.filter(d => d.scanned).length, [devices])
  const missingCount = devices.length - scannedCount

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return devices.filter(d => {
      if (filter === 'missing' && d.scanned) return false
      if (filter === 'scanned' && !d.scanned) return false
      if (!q) return true
      return d.serial.toLowerCase().includes(q)
        || d.deviceType.toLowerCase().includes(q)
        || d.comment.toLowerCase().includes(q)
    })
  }, [devices, filter, search])

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="p-1 rounded text-muted-foreground hover:bg-accent/40"><ChevronLeft size={16} /></button>
        <Scan className="text-primary" size={20} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight truncate">{run?.title || 'Inventur'}</h1>
          <p className="text-[11px] text-muted-foreground">
            {loading ? 'Lade…' : `${scannedCount}/${devices.length} erfasst · ${missingCount} fehlend`}
            {run && run.extras.length > 0 && <span className="ml-2 text-amber-300">· {run.extras.length} unerwartete Scans</span>}
            {run && run.scanLog.length > 0 && <span className="ml-2 opacity-70">· {run.scanLog.length} Scan-Aktionen gesamt</span>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => reload(true)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent/40 border border-border" title="Aktualisieren"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button
            onClick={startComplete}
            disabled={!run || run.status !== 'open' || devices.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          ><PackageCheck size={14} />Inventur abschließen</button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
          <AlertTriangle size={14} />{error}
        </div>
      )}

      {/* Scan-Eingabe */}
      <div className={`mx-5 mt-3 rounded-lg border-2 p-4 shrink-0 ${invalid ? 'border-red-500 bg-red-500/10' : 'border-primary/40 bg-primary/5'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Scan size={16} className={invalid ? 'text-red-400' : 'text-primary'} />
          <span className={`text-xs font-semibold ${invalid ? 'text-red-300' : 'text-foreground'}`}>
            {invalid ? 'Falsch-Scan — bitte den Wert löschen und neu scannen' : 'Seriennummer scannen oder eintippen'}
          </span>
          <kbd className="ml-auto px-1.5 py-0.5 bg-card border border-border rounded text-[10px] text-muted-foreground">Enter zum Bestätigen</kbd>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={e => onChangeValue(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => { if (!extrasReview && !confirmComplete && !lostFound) setTimeout(refocus, 50) }}
            spellCheck={false}
            autoComplete="off"
            placeholder="z. B. CND2201VT5"
            className={`flex-1 px-3 py-3 rounded-md bg-background border-2 text-base font-mono tracking-wider focus:outline-none ${invalid ? 'border-red-500 text-red-200' : 'border-border text-foreground focus:border-primary'}`}
          />
          {invalid ? (
            <button
              onClick={clearInvalid}
              className="inline-flex items-center gap-1 px-3 py-3 rounded-md text-sm font-medium bg-red-500/20 text-red-200 hover:bg-red-500/30"
            ><Trash2 size={14} />Löschen</button>
          ) : (
            <button
              onClick={submit}
              disabled={busy || !value.trim()}
              className="inline-flex items-center gap-1 px-4 py-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Erfassen</button>
          )}
        </div>
        {lastResult && (
          <div className="mt-2 text-xs space-y-0.5">
            {lastResult.kind === 'matched_new' && <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 size={12} />Erfasst: <span className="font-mono">{lastResult.serial}</span></span>}
            {lastResult.kind === 'matched_again' && <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle size={12} />Bereits gescannt: <span className="font-mono">{lastResult.serial}</span></span>}
            {lastResult.kind === 'extra' && <span className="inline-flex items-center gap-1 text-blue-300"><AlertTriangle size={12} />Unbekannte Seriennummer (nicht in ServiceNow-Liste): <span className="font-mono">{lastResult.serial}</span></span>}
            {lastResult.kind === 'invalid' && <span className="inline-flex items-center gap-1 text-red-300"><XCircle size={12} />Falsch-Scan — Eingabe entfernen, um weiter zu scannen</span>}
            {lastResult.kind !== 'invalid' && lastResult.rawValue && normalizeSerial(lastResult.rawValue) !== lastResult.serial && (
              <div className="text-[10px] text-muted-foreground pl-4">
                aus Multi-Wert-Scan: <span className="font-mono">{lastResult.rawValue}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter + Liste */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border mt-3 shrink-0">
        <div className="flex rounded-md border border-border overflow-hidden">
          <FilterBtn active={filter === 'missing'} onClick={() => setFilter('missing')} label={`Fehlend (${missingCount})`} />
          <FilterBtn active={filter === 'scanned'} onClick={() => setFilter('scanned')} label={`Erfasst (${scannedCount})`} />
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label={`Alle (${devices.length})`} />
        </div>
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtern…"
            className="w-56 pl-6 pr-2 py-1 rounded-md bg-card border border-border text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {filtered.map(d => (
            <div
              key={d.serial}
              onContextMenu={d.scanned ? (e) => openCtxMenu(e, 'device', d.serial) : undefined}
              title={d.scanned ? 'Rechtsklick: Erfassung zurücknehmen' : undefined}
              className={`px-2.5 py-1.5 rounded-md border text-[11px] ${d.scanned ? 'border-emerald-500/30 bg-emerald-500/5 cursor-context-menu' : 'border-border bg-card/60'}`}
            >
              <div className="flex items-center gap-1.5">
                {d.scanned
                  ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                  : <span className="w-3 h-3 rounded-full border border-border shrink-0" />}
                <span className="font-mono text-foreground truncate">{d.serial}</span>
              </div>
              <div className="text-[10px] text-muted-foreground truncate">{[d.deviceType, d.company].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-6 text-center text-xs text-muted-foreground">Keine Einträge</div>
          )}
        </div>

        {run && run.extras.length > 0 && filter !== 'missing' && (
          <div className="mt-4">
            <h3 className="text-[11px] uppercase tracking-wide text-amber-300 mb-1.5">Unerwartete Scans ({run.extras.length})</h3>
            <p className="text-[10px] text-muted-foreground mb-1.5">Rechtsklick auf einen Eintrag, um ihn zu entfernen.</p>
            <div className="flex flex-wrap gap-1.5">
              {run.extras.map(x => (
                <span
                  key={x.serial}
                  onContextMenu={(e) => openCtxMenu(e, 'extra', x.serial)}
                  title="Rechtsklick: Eintrag entfernen"
                  className="px-2 py-0.5 rounded bg-amber-300 text-black text-[10px] font-mono cursor-context-menu"
                >{x.serial}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rechtsklick-Kontextmenue */}
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[200px] rounded-md border border-border bg-card shadow-xl py-1"
          style={{ top: Math.min(ctxMenu.y, window.innerHeight - 80), left: Math.min(ctxMenu.x, window.innerWidth - 220) }}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
        >
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border font-mono truncate">{ctxMenu.serial}</div>
          <button
            onClick={handleRemoveEntry}
            disabled={removing}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
          >
            {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {ctxMenu.kind === 'device' ? 'Erfassung zurücknehmen' : 'Eintrag entfernen'}
          </button>
        </div>
      )}

      {/* Extras-Review: Begruendung je unerwartetem Scan vor dem Abschluss */}
      {extrasReview && run && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border border-amber-500/50 bg-card shadow-2xl">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <AlertTriangle size={18} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-foreground flex-1">Unerwartete Scans begründen ({run.extras.length})</h2>
              <button onClick={() => setExtrasReview(false)} className="p-1 rounded hover:bg-accent/40 text-muted-foreground"><XCircle size={16} /></button>
            </div>

            <div className="mx-5 mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>Bitte prüfe zuerst, ob der <strong>Status dieser Geräte im ServiceNow korrekt hinterlegt</strong> ist. Trage anschließend je Gerät eine kurze Begründung ein, warum es sich im Lager befindet.</span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {extrasLoading ? (
                <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />Abgleich mit Endgeräte-Übersicht…</div>
              ) : run.extras.map(ex => {
                const isSkf = skfSet.has(ex.serial)
                return (
                  <div key={ex.serial} className={`rounded-md border p-2.5 ${isSkf ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card/60'}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-sm text-foreground">{ex.serial}</span>
                      {isSkf && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-500/40 inline-flex items-center gap-1"><CheckCircle2 size={10} />SKF Eigentum (aus Endgeräte-Übersicht)</span>}
                    </div>
                    {isSkf ? (
                      <p className="text-[11px] text-emerald-300/90 pl-0.5">Begründung automatisch: <strong>SKF Eigentum</strong> — keine weitere Eingabe nötig.</p>
                    ) : (
                      <input
                        value={extrasReasons[ex.serial] || ''}
                        onChange={e => setExtrasReasons(prev => ({ ...prev, [ex.serial]: e.target.value }))}
                        placeholder="Begründung: warum befindet sich das Gerät im Lager?"
                        className="w-full px-2.5 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setExtrasReview(false)} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Zurück</button>
              <button
                onClick={() => { setExtrasReview(false); setConfirmComplete(true) }}
                disabled={extrasLoading || !allExtrasHaveReason}
                className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              ><Check size={13} />Weiter zum Abschluss</button>
            </div>
          </div>
        </div>
      )}

      {/* Grosses Popup: verlorenes Geraet bei der Inventur gefunden */}
      {lostFound && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => { setLostFound(null); refocus() }}>
          <div className="w-full max-w-lg rounded-2xl border-2 border-emerald-500 bg-card shadow-2xl text-center px-8 py-8" onClick={e => e.stopPropagation()}>
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4"><PackageCheck size={36} className="text-emerald-400" /></div>
            <h2 className="text-2xl font-bold text-emerald-300 mb-2">Verlorenes Gerät gefunden!</h2>
            <p className="text-lg font-mono text-foreground mb-3">{lostFound.serial}</p>
            <p className="text-sm text-muted-foreground mb-5">Wurde zu „Wieder aufgefundene Geräte" hinzugefügt<br />({lostFound.location}).</p>
            <button onClick={() => { setLostFound(null); refocus() }} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500">Weiter scannen</button>
          </div>
        </div>
      )}

      {/* Abschluss-Bestätigung */}
      {confirmComplete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-500/50 bg-card shadow-2xl">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <AlertTriangle size={18} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-foreground">Inventur wirklich abschließen?</h2>
            </div>
            <div className="px-5 py-4 text-sm text-foreground space-y-2">
              <p>Sind Sie sicher, dass wirklich alle Geräte gescannt wurden?</p>
              <p className="text-muted-foreground">Haben Sie auch in den anderen IT-Räumlichkeiten gründlich geschaut?</p>
              <div className="mt-3 px-3 py-2 rounded-md bg-accent/30 text-xs">
                <div><span className="text-muted-foreground">Erfasst:</span> <span className="font-medium text-emerald-300">{scannedCount}</span> / {devices.length}</div>
                <div><span className="text-muted-foreground">Fehlend:</span> <span className="font-medium text-red-300">{missingCount}</span></div>
                {run && run.extras.length > 0 && <div><span className="text-muted-foreground">Unerwartete Scans:</span> <span className="font-medium text-amber-300">{run.extras.length}</span></div>}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setConfirmComplete(false)} disabled={completing} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 inline-flex items-center gap-1"><RotateCcw size={12} />Nochmal prüfen</button>
              <button onClick={doComplete} disabled={completing} className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {completing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Ja, abschließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}
    >{label}</button>
  )
}

