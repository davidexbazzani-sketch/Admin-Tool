// ── Verwaltungsgebäude: Geräte auf dem Lageplan verorten ─────────────────────
// Wie OT-Geräte, nur mit dem Lageplan „KG-Staffelgeschoss Übersicht"
// (public/verwaltungsgebaeude/grundriss.pdf), EIGENER Geräteliste und dem Feld
// „Raumnummer" (statt „Arbeitsplatz") unter dem Hostnamen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Building, Search, RefreshCw, Loader2, X, Trash2, MapPin, Crosshair, AlertTriangle, FileDown, Lock } from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import PlanViewer from '../components/otDevices/PlanViewer'
import { useMapIntentStore } from '../store/mapIntentStore'
import { loadEndpointStatusLookup, isDeviceInUse } from '../services/deviceMaps'
import {
  listDevices, createDevice, updateDevice, moveDevice, deleteDevice, searchDevices, canonHost, type OtDevice,
} from '../services/verwaltungsgebaeude'
import { exportVerwaltungsgebaeudePdf } from '../services/verwaltungsgebaeudeExport'

const PLAN_ASSET = 'verwaltungsgebaeude/grundriss.pdf'

export default function Verwaltungsgebaeude() {
  const user = useAuthStore(s => s.session?.user)
  const currentUser = user?.displayName || user?.username || 'unbekannt'

  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [planError, setPlanError] = useState('')
  const [devices, setDevices] = useState<OtDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [placeKind, setPlaceKind] = useState<'none' | 'device' | 'lock'>('none')
  const [statusOf, setStatusOf] = useState<((h: string) => string) | null>(null)   // Endgeräte-Status je Hostname
  const placementMode = placeKind !== 'none'
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [blinkingId, setBlinkingId] = useState<string | null>(null)
  const [resetSignal] = useState(0)
  const [exporting, setExporting] = useState(false)

  async function exportPdf() {
    setExporting(true); setError('')
    try {
      const r = await exportVerwaltungsgebaeudePdf(devices)
      if (!r.ok && !r.cancelled) setError('PDF-Export fehlgeschlagen: ' + (r.error || 'unbekannt'))
    } finally { setExporting(false) }
  }

  // Lageplan (gebündeltes Asset) einmal laden.
  useEffect(() => {
    let cancelled = false
    api().readAsset(PLAN_ASSET)
      .then(r => { if (cancelled) return; if (r.success && r.data) setPdfBase64(r.data); else setPlanError(r.error || 'Lageplan nicht gefunden.') })
      .catch(e => { if (!cancelled) setPlanError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    try { setDevices(await listDevices()); setError('') }
    catch { setError('Liste konnte nicht geladen werden. Netzlaufwerk erreichbar?') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void reload() }, [reload])

  // Absicht aus Dossier/Checkliste: 'focus' = Marker aufleuchten, 'place' = neues Gerät platzieren.
  const intent = useMapIntentStore(s => s.intent)
  const clearIntent = useMapIntentStore(s => s.clear)
  const placeHostRef = useRef<string | null>(null)
  useEffect(() => {
    if (!intent || intent.screen !== 'verwaltungsgebaeude') return
    if (intent.mode === 'place') {
      placeHostRef.current = intent.hostname
      setPlaceKind('device')
      clearIntent()
    } else {
      if (devices.length === 0) return
      const d = devices.find(x => canonHost(x.hostname) === canonHost(intent.hostname))
      if (d) { setPageIndex(d.page - 1); setSelectedId(null); setBlinkingId(d.id) }
      clearIntent()
    }
  }, [intent, devices, clearIntent])
  // Beim Zurückkehren ins Fenster aktualisieren (andere Admin-PCs).
  useEffect(() => {
    const onFocus = () => { void reload() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])
  // Endgeräte-Status laden (für die rote „nicht in use"-Markierung) — einmal + bei Fokus.
  useEffect(() => {
    const load = () => { loadEndpointStatusLookup().then(fn => setStatusOf(() => fn)).catch(() => {}) }
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [])

  const lockCount = useMemo(() => devices.filter(d => d.kind === 'lock').length, [devices])
  const deviceCount = devices.length - lockCount
  const filtered = useMemo(() => searchDevices(devices.filter(d => d.kind !== 'lock'), search), [devices, search])
  const selected = useMemo(() => devices.find(d => d.id === selectedId) || null, [devices, selectedId])

  // ── Marker verschieben (optimistisch lokal, gebündelt/entprellt speichern) ──
  const moveTimer = useRef<number | null>(null)
  const pendingMove = useRef<{ id: string; x: number; y: number } | null>(null)
  function onDeviceMove(id: string, x: number, y: number) {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, x, y } : d))
    pendingMove.current = { id, x, y }
    if (moveTimer.current) window.clearTimeout(moveTimer.current)
    moveTimer.current = window.setTimeout(() => { const p = pendingMove.current; if (p) void moveDevice(p.id, p.x, p.y) }, 350)
  }

  // ── Platzieren (Gerät ODER verschlossene Tür) ──
  async function onPlace(x: number, y: number) {
    if (placeKind === 'lock') {
      const d = await createDevice({ page: pageIndex + 1, x, y, createdBy: currentUser, kind: 'lock' })
      setDevices(prev => [...prev, d])
      return   // Schloss-Modus bleibt aktiv → mehrere Türen schnell setzen
    }
    const host = placeHostRef.current || undefined   // aus Checkliste vorbelegt?
    const d = await createDevice({ page: pageIndex + 1, x, y, hostname: host, createdBy: currentUser })
    placeHostRef.current = null
    setDevices(prev => [...prev, d])
    setSelectedId(d.id); setBlinkingId(host ? d.id : null)
    setPlaceKind('none')   // Hostname eintragen; für das nächste Gerät erneut aktivieren
  }

  // ── Liste anklicken → Marker blinkt im Plan ──
  function jumpTo(d: OtDevice) {
    setPageIndex(d.page - 1)
    setBlinkingId(d.id)
    setSelectedId(null)
  }
  function openDetail(d: OtDevice) { setBlinkingId(null); setSelectedId(d.id) }

  // ── Detail bearbeiten ──
  function patchLocal(id: string, patch: Partial<OtDevice>) { setDevices(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d)) }
  async function persist(id: string, patch: Partial<Pick<OtDevice, 'hostname' | 'arbeitsplatz' | 'notes'>>) { await updateDevice(id, patch) }
  async function removeSelected() {
    if (!selected) return
    const id = selected.id
    setSelectedId(null); setBlinkingId(null)
    setDevices(prev => prev.filter(d => d.id !== id))
    await deleteDevice(id)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <Building className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Verwaltungsgebäude</h1>
          <p className="text-[11px] text-muted-foreground">{deviceCount} Gerät(e){lockCount > 0 ? ` · ${lockCount} verschlossene Tür(en)` : ''} auf dem Lageplan verortet</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void reload()} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border" title="Aktualisieren">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportPdf} disabled={exporting || devices.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Lageplan + Geräteliste als PDF exportieren">
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}Als PDF
          </button>
          <button
            onClick={() => setPlaceKind(k => k === 'device' ? 'none' : 'device')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border ${placeKind === 'device' ? 'bg-amber-400 text-black border-amber-500' : 'bg-primary text-primary-foreground border-transparent hover:opacity-90'}`}
            title="Ein neues Gerät auf dem Plan platzieren"
          >
            {placeKind === 'device' ? <Crosshair size={14} /> : <MapPin size={14} />}{placeKind === 'device' ? 'Platzieren aktiv – Plan anklicken' : 'Gerät platzieren'}
          </button>
          <button
            onClick={() => setPlaceKind(k => k === 'lock' ? 'none' : 'lock')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border ${placeKind === 'lock' ? 'bg-amber-400 text-black border-amber-500' : 'bg-red-500/10 text-red-300 border-red-500/40 hover:bg-red-500/20'}`}
            title="Verschlossene Türen auf dem Plan markieren (mehrere hintereinander möglich)"
          >
            {placeKind === 'lock' ? <Crosshair size={14} /> : <Lock size={14} />}{placeKind === 'lock' ? 'Türen setzen aktiv – Plan anklicken' : 'Tür verschlossen'}
          </button>
        </div>
      </div>

      {(error || planError) && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
          <AlertTriangle size={14} />{planError || error}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Liste */}
        <aside className="w-64 shrink-0 border-r border-border flex flex-col">
          <div className="p-2.5 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hostname/Raum suchen…"
                className="w-full pl-8 pr-2 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {deviceCount === 0 ? 'Noch keine Geräte platziert. „Gerät platzieren" klicken und auf den Plan tippen.' : 'Keine Treffer.'}
              </div>
            ) : filtered.map(d => {
              const active = d.id === blinkingId || d.id === selectedId
              const st = statusOf ? statusOf(d.hostname) : ''
              const notInUse = !!st && !isDeviceInUse(st)
              return (
                <div
                  key={d.id}
                  onClick={() => jumpTo(d)}
                  onDoubleClick={() => openDetail(d)}
                  title={`Klick: im Plan zeigen · Doppelklick: Details${notInUse ? ` · Status: ${st} (nicht „in use")` : ''}`}
                  className={`flex items-center gap-2 px-3 py-2 border-b border-border/50 cursor-pointer ${active ? 'bg-primary/10' : 'hover:bg-accent/20'} ${notInUse ? 'ring-2 ring-inset ring-red-500/70' : ''}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 self-start ${notInUse ? 'bg-red-500' : active ? 'bg-green-400' : 'bg-blue-500'}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-foreground font-mono truncate">{d.hostname || <span className="italic text-muted-foreground">ohne Hostname</span>}</span>
                    {d.arbeitsplatz && <span className="block text-[11px] text-muted-foreground truncate">Raum {d.arbeitsplatz}</span>}
                    {notInUse && <span className="block text-[10px] text-red-400 font-medium truncate">{st}</span>}
                  </span>
                  {d.hostname && <DeviceInfoButton hostname={d.hostname} />}
                </div>
              )
            })}
          </div>
        </aside>

        {/* Plan */}
        <main className="flex-1 min-w-0">
          <PlanViewer
            pdfBase64={pdfBase64}
            pageIndex={pageIndex}
            devices={devices}
            selectedId={selectedId}
            blinkingId={blinkingId}
            placementMode={placementMode}
            onPlace={onPlace}
            onDeviceClick={(id) => { setBlinkingId(null); setSelectedId(id) }}
            onDeviceMove={onDeviceMove}
            onEmptyClick={() => setBlinkingId(null)}
            onPageCountKnown={() => { /* Grundriss kann mehrere Seiten haben */ }}
            resetSignal={resetSignal}
            placeHint={placeKind === 'lock' ? 'Klicke auf den Plan, wo eine Tür verschlossen ist' : 'Klicke auf den Plan, um ein Gerät zu platzieren'}
          />
        </main>

        {/* Detail */}
        {selected && (
          <aside className="w-72 shrink-0 border-l border-border flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              {selected.kind === 'lock' ? (
                <><span className="flex items-center justify-center w-4 h-4 rounded bg-red-600"><Lock size={10} className="text-white" /></span><span className="text-sm font-semibold text-foreground">Verschlossene Tür</span></>
              ) : (
                <><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="text-sm font-semibold text-foreground">Geräte-Details</span></>
              )}
              <button onClick={() => setSelectedId(null)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={15} /></button>
            </div>
            <div className="p-3 space-y-3 overflow-y-auto">
              {selected.kind === 'lock' ? (
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium block mb-1">Bezeichnung (optional)</label>
                  <input
                    autoFocus
                    value={selected.hostname}
                    onChange={e => patchLocal(selected.id, { hostname: e.target.value })}
                    onBlur={() => void persist(selected.id, { hostname: selected.hostname.trim() })}
                    placeholder="z. B. Tür Serverraum"
                    className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">Hostname</label>
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={selected.hostname}
                        onChange={e => patchLocal(selected.id, { hostname: e.target.value })}
                        onBlur={() => void persist(selected.id, { hostname: selected.hostname.trim() })}
                        placeholder="z. B. DE123456"
                        className="flex-1 min-w-0 px-2.5 py-2 rounded-md bg-background border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      {selected.hostname.trim() && <DeviceInfoButton hostname={selected.hostname.trim()} />}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">Raumnummer</label>
                    <input
                      value={selected.arbeitsplatz}
                      onChange={e => patchLocal(selected.id, { arbeitsplatz: e.target.value })}
                      onBlur={() => void persist(selected.id, { arbeitsplatz: selected.arbeitsplatz.trim() })}
                      placeholder="z. B. 2.14"
                      className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">Notiz</label>
                <textarea
                  value={selected.notes}
                  onChange={e => patchLocal(selected.id, { notes: e.target.value })}
                  onBlur={() => void persist(selected.id, { notes: selected.notes })}
                  rows={4}
                  placeholder="optional"
                  className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Zum Verschieben den Punkt auf dem Plan ziehen.</p>
              <button onClick={removeSelected} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10 text-sm">
                <Trash2 size={14} />{selected.kind === 'lock' ? 'Markierung entfernen' : 'Gerät entfernen'}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
