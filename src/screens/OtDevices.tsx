// ── OT-Geräte: PCs auf dem Hallenplan verorten ───────────────────────────────
// Fester, gebündelter Hallenplan (public/ot-devices/hallenlayout.pdf) als Grund-
// lage. PCs per Klick platzieren, Hostname eintragen, in der Liste anklicken →
// Marker blinkt im Plan auf. Verlustfreies Zoomen via pdf.js (PlanViewer).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Factory, Search, RefreshCw, Loader2, X, Trash2, MapPin, Crosshair, AlertTriangle, FileDown } from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import PlanViewer from '../components/otDevices/PlanViewer'
import {
  listDevices, createDevice, updateDevice, moveDevice, deleteDevice, searchDevices, canonHost, type OtDevice,
} from '../services/otDevices'
import { exportOtDevicesPdf } from '../services/otDevicesExport'
import { useMapIntentStore } from '../store/mapIntentStore'
import { loadEndpointStatusLookup, isDeviceInUse } from '../services/deviceMaps'

const PLAN_ASSET = 'ot-devices/hallenlayout.pdf'

export default function OtDevices() {
  const user = useAuthStore(s => s.session?.user)
  const currentUser = user?.displayName || user?.username || 'unbekannt'

  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [planError, setPlanError] = useState('')
  const [devices, setDevices] = useState<OtDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [placementMode, setPlacementMode] = useState(false)
  const [statusOf, setStatusOf] = useState<((h: string) => string) | null>(null)   // Endgeräte-Status je Hostname
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [blinkingId, setBlinkingId] = useState<string | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [exporting, setExporting] = useState(false)

  async function exportPdf() {
    setExporting(true); setError('')
    try {
      const r = await exportOtDevicesPdf(devices)
      if (!r.ok && !r.cancelled) setError('PDF-Export fehlgeschlagen: ' + (r.error || 'unbekannt'))
    } finally { setExporting(false) }
  }

  // Hallenplan (gebündeltes Asset) einmal laden.
  useEffect(() => {
    let cancelled = false
    api().readAsset(PLAN_ASSET)
      .then(r => { if (cancelled) return; if (r.success && r.data) setPdfBase64(r.data); else setPlanError(r.error || 'Hallenplan nicht gefunden.') })
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

  // Absicht aus Dossier/Checkliste: 'focus' = Marker aufleuchten, 'place' = neuen platzieren.
  const intent = useMapIntentStore(s => s.intent)
  const clearIntent = useMapIntentStore(s => s.clear)
  const placeHostRef = useRef<string | null>(null)
  useEffect(() => {
    if (!intent || intent.screen !== 'ot-devices') return
    if (intent.mode === 'place') {
      placeHostRef.current = intent.hostname
      setPlacementMode(true)
      clearIntent()
    } else {
      if (devices.length === 0) return   // warten, bis geladen
      const d = devices.find(x => canonHost(x.hostname) === canonHost(intent.hostname))
      if (d) { setPageIndex(d.page - 1); setSelectedId(null); setBlinkingId(d.id) }
      clearIntent()
    }
  }, [intent, devices, clearIntent])

  const filtered = useMemo(() => searchDevices(devices, search), [devices, search])
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

  // ── Platzieren ──
  async function onPlace(x: number, y: number) {
    const host = placeHostRef.current || undefined   // aus Checkliste vorbelegt?
    const d = await createDevice({ page: pageIndex + 1, x, y, hostname: host, createdBy: currentUser })
    placeHostRef.current = null
    setDevices(prev => [...prev, d])
    setSelectedId(d.id); setBlinkingId(host ? d.id : null)
    setPlacementMode(false)   // Hostname eintragen; für den nächsten PC erneut aktivieren
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
        <Factory className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">OT-Geräte</h1>
          <p className="text-[11px] text-muted-foreground">{devices.length} PC(s) auf dem Hallenplan verortet</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void reload()} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border" title="Aktualisieren">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportPdf} disabled={exporting || devices.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Hallenplan + PC-Liste als PDF exportieren">
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}Als PDF
          </button>
          <button
            onClick={() => setPlacementMode(m => !m)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border ${placementMode ? 'bg-amber-400 text-black border-amber-500' : 'bg-primary text-primary-foreground border-transparent hover:opacity-90'}`}
            title="Einen neuen PC auf dem Plan platzieren"
          >
            {placementMode ? <Crosshair size={14} /> : <MapPin size={14} />}{placementMode ? 'Platzieren aktiv – Plan anklicken' : 'PC platzieren'}
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
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hostname suchen…"
                className="w-full pl-8 pr-2 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {devices.length === 0 ? 'Noch keine PCs platziert. „PC platzieren" klicken und auf den Plan tippen.' : 'Keine Treffer.'}
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
                    {d.arbeitsplatz && <span className="block text-[11px] text-muted-foreground truncate">{d.arbeitsplatz}</span>}
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
            onPageCountKnown={() => { /* Hallenplan hat i. d. R. eine Seite */ }}
            resetSignal={resetSignal}
          />
        </main>

        {/* Detail */}
        {selected && (
          <aside className="w-72 shrink-0 border-l border-border flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-sm font-semibold text-foreground">PC-Details</span>
              <button onClick={() => setSelectedId(null)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={15} /></button>
            </div>
            <div className="p-3 space-y-3 overflow-y-auto">
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
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">Arbeitsplatz</label>
                <input
                  value={selected.arbeitsplatz}
                  onChange={e => patchLocal(selected.id, { arbeitsplatz: e.target.value })}
                  onBlur={() => void persist(selected.id, { arbeitsplatz: selected.arbeitsplatz.trim() })}
                  placeholder="z. B. Halle 2 / Platz 14"
                  className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
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
                <Trash2 size={14} />PC entfernen
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
