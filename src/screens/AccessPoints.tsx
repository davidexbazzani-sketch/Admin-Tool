import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Wifi, FileUp, FileDown, Plus, Search, RefreshCw, Loader2, AlertTriangle,
  ChevronLeft, ChevronRight, MapPin, Layers, Pencil, Trash2,
  Upload, Package, Map as MapIcon, X, FileSpreadsheet,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useIsAdmin } from '../store/authStore'
import {
  listFloorPlans, listMarkers, loadInventory, readFloorPlanBytes,
  uploadFloorPlans, renameFloorPlan, deleteFloorPlan, updateFloorPlanPageCount,
  createMarker, moveMarker, searchMarkers, searchInventory,
  type FloorPlan, type Marker, type InventoryStore, type InventoryItem,
} from '../services/accessPoints'
import { exportAccessPointsPdf, type ExportProgress } from '../services/accessPointsExport'
import { syncSerialIpFromExcel } from '../services/accessPointsSync'
import PdfViewer from '../components/accessPoints/PdfViewer'
import MarkerDetailDialog from '../components/accessPoints/MarkerDetailDialog'
import InventoryImportDialog from '../components/accessPoints/InventoryImportDialog'

const POLL_MS = 15000

export default function AccessPoints() {
  const user = useAuthStore(s => s.session?.user)
  const isAdmin = useIsAdmin()
  const currentUserName = user?.displayName || user?.username || ''

  const [floorplans, setFloorplans] = useState<FloorPlan[]>([])
  const [markers, setMarkers] = useState<Marker[]>([])
  const [inventory, setInventory] = useState<InventoryStore | null>(null)

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const pdfCache = useRef<Map<string, string>>(new Map())
  const [resetSignal, setResetSignal] = useState(0)

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'aps' | 'inventory'>('aps')
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [blinkingMarkerId, setBlinkingMarkerId] = useState<string | null>(null)

  const [placementMode, setPlacementMode] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [syncUnmatched, setSyncUnmatched] = useState<string[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ cur: number; total: number } | null>(null)
  const [renamingPlanId, setRenamingPlanId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeletePlan, setConfirmDeletePlan] = useState<string | null>(null)

  // ── Daten laden ────────────────────────────────────────────────────────────
  const reload = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const [fps, mks, inv] = await Promise.all([listFloorPlans(), listMarkers(), loadInventory()])
      setFloorplans(fps)
      setMarkers(mks)
      setInventory(inv)
      setError('')
      // Auswahl initial setzen
      setSelectedPlanId(prev => prev && fps.some(p => p.id === prev) ? prev : (fps[0]?.id ?? null))
    } catch {
      setError('Daten konnten nicht geladen werden. Netzlaufwerk erreichbar?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload(true) }, [reload])

  useEffect(() => {
    const t = setInterval(() => reload(false), POLL_MS)
    const onFocus = () => reload(false)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [reload])

  // PDF-Bytes für ausgewählten Plan laden
  useEffect(() => {
    if (!selectedPlanId) { setPdfBase64(null); return }
    const cached = pdfCache.current.get(selectedPlanId)
    if (cached) { setPdfBase64(cached); setPageIndex(0); setResetSignal(s => s + 1); return }
    setPlanLoading(true)
    setPdfBase64(null)
    const fp = floorplans.find(p => p.id === selectedPlanId)
    if (!fp) { setPlanLoading(false); return }
    readFloorPlanBytes(fp).then(b => {
      if (!b) { setError('Lageplan-Datei konnte nicht vom Netzlaufwerk geladen werden.'); setPlanLoading(false); return }
      pdfCache.current.set(selectedPlanId, b)
      setPdfBase64(b)
      setPageIndex(0)
      setResetSignal(s => s + 1)
      setPlanLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId])

  // ── Such-Logik ────────────────────────────────────────────────────────────
  const filteredMarkers = useMemo(() => searchMarkers(markers, search), [markers, search])
  const filteredInventory = useMemo(() => {
    if (!inventory) return []
    return searchInventory(inventory.items, search)
  }, [inventory, search])
  const searchHitIds = useMemo(() => new Set(filteredMarkers.map(m => m.id)), [filteredMarkers])

  const selectedPlan = useMemo(() => floorplans.find(p => p.id === selectedPlanId) ?? null, [floorplans, selectedPlanId])
  const markersOnSelected = useMemo(
    () => markers.filter(m => m.floorplanId === selectedPlanId && m.page === pageIndex + 1),
    [markers, selectedPlanId, pageIndex],
  )
  const totalMarkersOnPlan = useMemo(
    () => markers.filter(m => m.floorplanId === selectedPlanId).length,
    [markers, selectedPlanId],
  )

  function jumpToMarker(m: Marker) {
    setSelectedPlanId(m.floorplanId)
    setPageIndex(Math.max(0, m.page - 1))
    // Marker dauerhaft blinken lassen — endet erst beim Klick auf Marker
    // oder auf leere Stelle der Karte.
    setBlinkingMarkerId(m.id)
    // Detail-Dialog NICHT öffnen; der User soll erst den blinkenden Punkt sehen.
    setSelectedMarkerId(null)
  }

  // ── Lagepläne verwalten ────────────────────────────────────────────────────
  async function handleUpload() {
    setUploading(true); setError('')
    setUploadProgress({ cur: 0, total: 0 })
    const r = await uploadFloorPlans(currentUserName, (cur, total) => setUploadProgress({ cur, total }))
    setUploading(false)
    setUploadProgress(null)
    if (!r.ok) { setError(r.error || 'Upload fehlgeschlagen.'); return }
    if (r.added > 0) await reload(false)
  }

  async function startRename(p: FloorPlan) {
    setRenamingPlanId(p.id)
    setRenameValue(p.name)
  }
  async function commitRename() {
    if (!renamingPlanId) return
    if (renameValue.trim()) {
      await renameFloorPlan(renamingPlanId, renameValue.trim())
      await reload(false)
    }
    setRenamingPlanId(null)
  }
  async function doDeletePlan(id: string) {
    await deleteFloorPlan(id)
    pdfCache.current.delete(id)
    if (selectedPlanId === id) setSelectedPlanId(null)
    setConfirmDeletePlan(null)
    await reload(false)
  }

  // ── Marker platzieren ──────────────────────────────────────────────────────
  async function onPlaceMarker(x: number, y: number) {
    if (!selectedPlanId) return
    const r = await createMarker({
      floorplanId: selectedPlanId, page: pageIndex + 1, x, y,
      name: 'Neuer AP', mac: '', serial: '', ip: '', model: '', notes: '', extra: {},
      createdBy: currentUserName,
    })
    if (r.ok && r.marker) {
      setPlacementMode(false)
      await reload(false)
      setSelectedMarkerId(r.marker.id)
    }
  }

  async function onInventoryDrop(itemId: string, x: number, y: number) {
    if (!selectedPlanId || !inventory) return
    const it = inventory.items.find(i => i.id === itemId)
    if (!it) return
    const get = (key: string) => (key && it.fields[key]) || ''
    const fm = inventory.fieldMap
    // Extras: alle Felder außer den Rollen-Feldern
    const usedKeys = new Set<string>([fm.name, fm.mac, fm.serial, fm.model, fm.location].filter(Boolean))
    const extra: Record<string, string> = {}
    for (const c of inventory.columns) {
      if (usedKeys.has(c.key)) continue
      const v = it.fields[c.key]
      if (v && v.trim()) extra[c.label] = v
    }
    const r = await createMarker({
      floorplanId: selectedPlanId, page: pageIndex + 1, x, y,
      name: get(fm.name) || 'Neuer AP',
      mac: get(fm.mac),
      serial: get(fm.serial),
      ip: '',
      model: get(fm.model),
      notes: get(fm.location),
      extra,
      inventoryItemId: it.id,
      createdBy: currentUserName,
    })
    if (r.ok && r.marker) {
      await reload(false)
      setSelectedMarkerId(r.marker.id)
    }
  }

  async function onMarkerMove(id: string, x: number, y: number) {
    // Lokal optimistisch
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, x, y } : m))
    await moveMarker(id, x, y)
  }

  // ── Seriennummer + IP aus Netzwerk-Inventar-Excel übernehmen ────────────────
  async function doSyncExcel() {
    if (syncing) return
    setSyncing(true); setError(''); setSyncResult(null); setSyncUnmatched([])
    try {
      const r = await syncSerialIpFromExcel()
      if (r.cancelled) return
      if (!r.ok) { setError('Excel-Abgleich fehlgeschlagen: ' + (r.error || 'unbekannt')); return }
      await reload(false)
      setSyncResult(`Aus „${r.filename}": ${r.updated} von ${r.matched} zugeordneten AP(s) mit Seriennummer/IP aktualisiert (${r.totalRows} Zeilen gelesen).`)
      setSyncUnmatched(r.unmatchedMarkers ?? [])
    } finally { setSyncing(false) }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function doExport() {
    if (floorplans.length === 0) { setError('Keine Lagepläne vorhanden.'); return }
    setExporting(true); setError('')
    setExportProgress({ phase: 'Vorbereiten', current: 0, total: 1 })
    const r = await exportAccessPointsPdf(floorplans, markers, p => setExportProgress(p))
    setExporting(false)
    setExportProgress(null)
    if (!r.ok && !r.cancelled) setError(r.error || 'Export fehlgeschlagen.')
  }

  const selectedMarker = useMemo(() => markers.find(m => m.id === selectedMarkerId) ?? null, [markers, selectedMarkerId])

  const planMarkerCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of markers) map.set(m.floorplanId, (map.get(m.floorplanId) ?? 0) + 1)
    return map
  }, [markers])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <Wifi className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Access Points Übersicht</h1>
          <p className="text-[11px] text-muted-foreground">
            {floorplans.length} Lagepläne · {markers.length} platzierte APs
            {inventory && <> · {inventory.items.length} im Inventar</>}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name, MAC, Seriennr. suchen…"
              className="w-64 pl-7 pr-3 py-1.5 rounded-md bg-card border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"><X size={11} /></button>
            )}
          </div>
          <button
            onClick={() => reload(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border"
            title="Aktualisieren"
          ><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button
            onClick={() => setPlacementMode(p => !p)}
            disabled={!selectedPlanId}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${placementMode ? 'bg-amber-300 text-black border-amber-500' : 'bg-card text-foreground border-border hover:bg-accent/40'} disabled:opacity-50`}
          >
            <MapPin size={13} />AP platzieren
          </button>
          <button
            onClick={doSyncExcel}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-card text-foreground border border-border hover:bg-accent/40 disabled:opacity-50"
            title="Seriennummer & IP-Adresse aus einer Netzwerk-Inventar-Excel (Abgleich über den AP-Namen) übernehmen"
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            Seriennr./IP aus Excel
          </button>
          <button
            onClick={doExport}
            disabled={exporting || floorplans.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
            Als PDF exportieren
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
          <AlertTriangle size={14} />{error}
        </div>
      )}

      {exporting && exportProgress && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-primary/10 border border-primary/30 text-xs text-foreground shrink-0">
          Export: {exportProgress.phase} ({exportProgress.current}/{exportProgress.total})
        </div>
      )}

      {syncResult && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 shrink-0">
          <div className="flex items-start gap-2">
            <FileSpreadsheet size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p>{syncResult}</p>
              {syncUnmatched.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-emerald-300/80 hover:text-emerald-200">{syncUnmatched.length} AP(s) ohne Excel-Zeile (nicht aktualisiert)</summary>
                  <div className="mt-1 max-h-28 overflow-y-auto font-mono text-[11px] text-emerald-200/70 grid grid-cols-2 gap-x-4">
                    {syncUnmatched.map((n, i) => <div key={i} className="truncate">{n}</div>)}
                  </div>
                </details>
              )}
            </div>
            <button onClick={() => { setSyncResult(null); setSyncUnmatched([]) }} className="text-emerald-300/70 hover:text-emerald-200"><X size={13} /></button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Linke Seitenleiste */}
        <aside className="w-72 shrink-0 border-r border-border flex flex-col bg-card/30">
          {/* Lagepläne-Liste */}
          <div className="border-b border-border">
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
                <MapIcon size={11} />Lagepläne ({floorplans.length})
              </h3>
              {isAdmin && (
                <button onClick={handleUpload} disabled={uploading} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border">
                  {uploading ? <Loader2 size={10} className="animate-spin" /> : <FileUp size={10} />}Hochladen
                </button>
              )}
            </div>
            {uploadProgress && uploadProgress.total > 0 && (
              <div className="px-3 pb-2 text-[10px] text-muted-foreground">Lade {uploadProgress.cur}/{uploadProgress.total}…</div>
            )}
            <div className="max-h-64 overflow-y-auto px-2 pb-2 space-y-0.5">
              {floorplans.length === 0 && !loading && (
                <div className="px-2 py-4 text-[11px] text-center text-muted-foreground">
                  Noch keine Pläne. {isAdmin ? 'Klicke „Hochladen", um PDFs zu importieren.' : 'Ein Admin muss zuerst Pläne hochladen.'}
                </div>
              )}
              {floorplans.map(p => {
                const cnt = planMarkerCount.get(p.id) ?? 0
                const active = p.id === selectedPlanId
                return (
                  <div key={p.id} className={`group rounded-md ${active ? 'bg-primary/15' : 'hover:bg-accent/30'}`}>
                    <button
                      onClick={() => setSelectedPlanId(p.id)}
                      className="w-full text-left px-2 py-1.5 flex items-center gap-2"
                    >
                      <Layers size={13} className={active ? 'text-primary' : 'text-muted-foreground'} />
                      {renamingPlanId === p.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingPlanId(null) }}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-xs bg-background border border-border rounded px-1 py-0.5"
                        />
                      ) : (
                        <span className="flex-1 text-xs text-foreground truncate" title={p.name}>{p.name}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground shrink-0">{cnt}</span>
                    </button>
                    {isAdmin && renamingPlanId !== p.id && (
                      <div className="hidden group-hover:flex items-center gap-0.5 px-2 pb-1">
                        <button onClick={() => startRename(p)} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40" title="Umbenennen"><Pencil size={11} /></button>
                        {confirmDeletePlan === p.id ? (
                          <span className="inline-flex items-center gap-1 text-[10px]">
                            <button onClick={() => doDeletePlan(p.id)} className="px-1 py-0.5 rounded bg-red-500/20 text-red-300">Ja</button>
                            <button onClick={() => setConfirmDeletePlan(null)} className="px-1 py-0.5 rounded text-muted-foreground hover:bg-accent/40">Nein</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDeletePlan(p.id)} className="p-0.5 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/10" title="Löschen"><Trash2 size={11} /></button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('aps')}
              className={`flex-1 px-3 py-2 text-xs ${activeTab === 'aps' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              APs ({filteredMarkers.length})
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 px-3 py-2 text-xs ${activeTab === 'inventory' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Inventar ({inventory?.items.length ?? 0})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {activeTab === 'aps' && (
              <>
                {filteredMarkers.length === 0 ? (
                  <div className="px-2 py-6 text-[11px] text-center text-muted-foreground">
                    {markers.length === 0 ? 'Noch keine APs platziert.' : 'Keine Treffer.'}
                  </div>
                ) : (
                  filteredMarkers.map(m => {
                    const plan = floorplans.find(p => p.id === m.floorplanId)
                    const isSelected = m.id === blinkingMarkerId || m.id === selectedMarkerId
                    return (
                      <button
                        key={m.id}
                        onClick={() => jumpToMarker(m)}
                        onDoubleClick={() => setSelectedMarkerId(m.id)}
                        title="Klick: auf dem Lageplan anzeigen · Doppelklick: Details öffnen"
                        className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] ${isSelected ? 'bg-primary/15' : 'hover:bg-accent/30'}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          <span className="flex-1 text-foreground font-medium truncate">{m.name || '(unbenannt)'}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {plan?.name || '—'}
                          {m.mac && <> · {m.mac}</>}
                          {m.serial && <> · {m.serial}</>}
                        </div>
                      </button>
                    )
                  })
                )}
              </>
            )}

            {activeTab === 'inventory' && (
              <>
                <div className="flex items-center gap-1 mb-2 px-1">
                  <button
                    onClick={() => setImportOpen(true)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] bg-card border border-border text-foreground hover:bg-accent/40"
                  >
                    <Upload size={11} />{inventory ? 'Neu importieren' : 'Excel importieren'}
                  </button>
                </div>
                {!inventory ? (
                  <div className="px-2 py-6 text-[11px] text-center text-muted-foreground">
                    <Package size={28} className="opacity-30 mx-auto mb-2" />
                    Noch kein Inventar.<br />Lade eine Excel-Datei mit allen Access Points hoch.
                  </div>
                ) : filteredInventory.length === 0 ? (
                  <div className="px-2 py-6 text-[11px] text-center text-muted-foreground">Keine Treffer.</div>
                ) : (
                  <>
                    <p className="px-1 text-[10px] text-muted-foreground mb-1">
                      Auf einen Plan ziehen, um zu platzieren →
                    </p>
                    {filteredInventory.map(it => <InventoryCard key={it.id} item={it} inventory={inventory} onJump={jumpToMarker} onShowDetail={setSelectedMarkerId} markers={markers} />)}
                  </>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Mitte: PDF-Viewer */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Seiten-Navigation für mehrseitige PDFs */}
          {selectedPlan && selectedPlan.pageCount > 1 && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs">
              <button onClick={() => setPageIndex(p => Math.max(0, p - 1))} disabled={pageIndex === 0} className="p-1 rounded hover:bg-accent/40 disabled:opacity-30"><ChevronLeft size={14} /></button>
              <span className="text-muted-foreground">Seite {pageIndex + 1} / {selectedPlan.pageCount}</span>
              <button onClick={() => setPageIndex(p => Math.min(selectedPlan.pageCount - 1, p + 1))} disabled={pageIndex >= selectedPlan.pageCount - 1} className="p-1 rounded hover:bg-accent/40 disabled:opacity-30"><ChevronRight size={14} /></button>
              <span className="ml-auto text-muted-foreground">{markersOnSelected.length} APs auf dieser Seite · {totalMarkersOnPlan} auf diesem Plan</span>
            </div>
          )}

          <div className="flex-1 relative">
            {planLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-muted-foreground gap-2 text-sm">
                <Loader2 size={16} className="animate-spin" />Lade Plan vom Netzlaufwerk…
              </div>
            )}
            {!selectedPlan && !planLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                {floorplans.length === 0 ? 'Lade Pläne hoch, um zu beginnen.' : 'Wähle links einen Lageplan.'}
              </div>
            )}
            {selectedPlan && (
              <PdfViewer
                pdfBase64={pdfBase64}
                pageIndex={pageIndex}
                markers={markers.filter(m => m.floorplanId === selectedPlanId)}
                selectedMarkerId={selectedMarkerId}
                blinkingMarkerId={blinkingMarkerId}
                placementMode={placementMode}
                searchHitIds={searchHitIds}
                onPlaceMarker={onPlaceMarker}
                onMarkerClick={(id) => { setBlinkingMarkerId(null); setSelectedMarkerId(id) }}
                onMarkerMove={onMarkerMove}
                onInventoryDrop={onInventoryDrop}
                onEmptyClick={() => setBlinkingMarkerId(null)}
                onPageCountKnown={(c) => { if (selectedPlan && c !== selectedPlan.pageCount) updateFloorPlanPageCount(selectedPlan.id, c) }}
                resetSignal={resetSignal}
              />
            )}
          </div>
        </main>
      </div>

      {selectedMarker && (
        <MarkerDetailDialog
          marker={selectedMarker}
          currentUser={currentUserName}
          onClose={() => setSelectedMarkerId(null)}
          onChanged={() => reload(false)}
          onDeleted={() => { setSelectedMarkerId(null); reload(false) }}
        />
      )}

      {importOpen && (
        <InventoryImportDialog
          currentUser={currentUserName}
          onClose={() => setImportOpen(false)}
          onImported={() => reload(false)}
        />
      )}
    </div>
  )
}

function InventoryCard({ item, inventory, onJump, onShowDetail, markers }: {
  item: InventoryItem
  inventory: InventoryStore
  onJump: (m: Marker) => void
  onShowDetail: (markerId: string) => void
  markers: Marker[]
}) {
  const fm = inventory.fieldMap
  const name = item.fields[fm.name] || '—'
  const model = item.fields[fm.model] || ''
  const serial = item.fields[fm.serial] || ''
  const loc = item.fields[fm.location] || ''
  const placedMarker = item.placedMarkerId ? markers.find(m => m.id === item.placedMarkerId) : null
  const isPlaced = !!placedMarker

  function onPinDragStart(e: React.DragEvent) {
    if (isPlaced) { e.preventDefault(); return }
    e.dataTransfer.setData('application/x-ap-inventory', item.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  function onCardClick() {
    if (isPlaced && placedMarker) onJump(placedMarker)
  }
  function onCardDoubleClick() {
    if (isPlaced && placedMarker) onShowDetail(placedMarker.id)
  }

  const pinTitle = isPlaced
    ? 'Bereits auf einem Lageplan platziert — klicke auf den Eintrag, um den Standort zu zeigen.'
    : 'Stecknadel auf den Lageplan ziehen, um den Access Point dort zu platzieren.'
  const cardTitle = isPlaced ? 'Klick: auf dem Lageplan anzeigen · Doppelklick: Details öffnen' : undefined

  return (
    <div
      onClick={onCardClick}
      onDoubleClick={onCardDoubleClick}
      title={cardTitle}
      className={`px-2 py-1.5 rounded-md border border-border bg-card/60 hover:bg-accent/30 text-[11px] ${isPlaced ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-2">
        {/* Stecknadel: nur sie ist ziehbar */}
        <span
          draggable={!isPlaced}
          onDragStart={onPinDragStart}
          onClick={(e) => e.stopPropagation()}
          title={pinTitle}
          className={`shrink-0 inline-flex ${isPlaced ? 'cursor-help' : 'cursor-grab active:cursor-grabbing'}`}
        >
          <MapPin
            size={16}
            className={isPlaced ? 'text-emerald-500' : 'text-red-500'}
            fill="currentColor"
            fillOpacity={0.35}
            strokeWidth={2.2}
          />
        </span>
        <span className="flex-1 font-medium text-foreground truncate" title={name}>{name}</span>
        {isPlaced && (
          <span className="text-[10px] text-emerald-400 shrink-0">platziert</span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground truncate pl-6">
        {[model, loc].filter(Boolean).join(' · ') || '—'}
      </div>
      {serial && <div className="text-[10px] text-muted-foreground/70 truncate pl-6">SN: {serial}</div>}
    </div>
  )
}
