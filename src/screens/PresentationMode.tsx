import { useEffect, useMemo, useState } from 'react'
import {
  MonitorPlay, Plus, Trash2, GripVertical, Play, Eye, Loader,
  Globe, Clock, Maximize2, AlertTriangle, ExternalLink, Cloud, HardDrive,
  CheckCircle, XCircle, RotateCcw,
} from 'lucide-react'
import Card from '../components/Card'
import { api } from '../electronAPI'
import {
  loadConfig, saveCentral, saveLocal, clearLocal,
  makeNewSlide, makeEmptyConfig,
  type PresentationConfig, type Slide, type StorageMode,
} from '../services/presentationConfig'
import { useAuthStore } from '../store/authStore'

interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
  scaleFactor: number
}

type Toast = { kind: 'success' | 'error'; text: string }

export default function PresentationMode() {
  const user = useAuthStore(s => s.session?.user)
  const [config, setConfig] = useState<PresentationConfig>(makeEmptyConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<StorageMode | null>(null)
  const [dirty, setDirty] = useState(false)
  const [source, setSource] = useState<StorageMode | 'empty'>('empty')
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [selectedDisplay, setSelectedDisplay] = useState<number | null>(null)
  const [preview, setPreview] = useState<Slide | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [confirmClearLocal, setConfirmClearLocal] = useState(false)

  function showToast(t: Toast) {
    setToast(t)
    setTimeout(() => setToast(curr => (curr === t ? null : curr)), 4000)
  }

  // Load config + displays
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [res, ds] = await Promise.all([
        loadConfig(),
        api().presentationListDisplays(),
      ])
      if (!alive) return
      setConfig(res.config)
      setSource(res.source)
      setDisplays(ds)
      const ext = ds.find(d => !d.primary)
      setSelectedDisplay((ext ?? ds[0])?.id ?? null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  function patchSlide(id: string, patch: Partial<Slide>) {
    setConfig(c => ({ ...c, slides: c.slides.map(s => s.id === id ? { ...s, ...patch } : s) }))
    setDirty(true)
  }
  function addSlide() {
    setConfig(c => ({ ...c, slides: [...c.slides, makeNewSlide()] }))
    setDirty(true)
  }
  function deleteSlide(id: string) {
    setConfig(c => ({ ...c, slides: c.slides.filter(s => s.id !== id) }))
    setDirty(true)
  }
  function reorderTo(targetId: string) {
    if (!dragId || dragId === targetId) return
    setConfig(c => {
      const arr = [...c.slides]
      const from = arr.findIndex(s => s.id === dragId)
      const to = arr.findIndex(s => s.id === targetId)
      if (from < 0 || to < 0) return c
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return { ...c, slides: arr }
    })
    setDirty(true)
  }

  async function handleSave(target: StorageMode): Promise<boolean> {
    console.log(`[PresentationMode] handleSave(${target}) start, slides:`, config.slides.length)
    setSaving(target)
    try {
      const modBy = user?.displayName || user?.username || 'unbekannt'
      const res = target === 'central'
        ? await saveCentral(config, modBy)
        : await saveLocal(config, modBy)
      console.log(`[PresentationMode] saveResult(${target}):`, res)
      if (res.ok) {
        setDirty(false)
        setSource(target)
        setConfig(c => ({ ...c, lastModified: new Date().toISOString(), modifiedBy: modBy }))
        showToast({
          kind: 'success',
          text: target === 'central'
            ? 'Zentral gespeichert — alle Nutzer sehen die neue Konfiguration.'
            : 'Lokal gespeichert — nur auf diesem Rechner sichtbar.',
        })
        return true
      } else {
        showToast({ kind: 'error', text: res.error || 'Speichern fehlgeschlagen.' })
        return false
      }
    } catch (e) {
      console.error('[PresentationMode] handleSave exception:', e)
      const msg = e instanceof Error ? e.message : String(e)
      showToast({ kind: 'error', text: `Unerwarteter Fehler: ${msg}` })
      return false
    } finally {
      setSaving(null)
    }
  }

  async function handleClearLocal() {
    setConfirmClearLocal(false)
    const res = await clearLocal()
    if (!res.ok) {
      showToast({ kind: 'error', text: res.error || 'Lokale Kopie konnte nicht geloescht werden.' })
      return
    }
    // Reload from central
    const reloaded = await loadConfig()
    setConfig(reloaded.config)
    setSource(reloaded.source)
    setDirty(false)
    showToast({ kind: 'success', text: 'Lokale Kopie geloescht — zentrale Version wird verwendet.' })
  }

  async function startPresentation() {
    if (dirty) {
      // If user hits play with unsaved changes, save to whatever source was loaded
      // (default to central if nothing loaded). User will see the toast if it fails.
      const target: StorageMode = source === 'local' ? 'local' : 'central'
      const ok = await handleSave(target)
      if (!ok) return
    }
    await api().presentationOpen(selectedDisplay != null ? { displayId: selectedDisplay } : undefined)
  }

  const activeCount = useMemo(() => config.slides.filter(s => s.active && s.url.trim()).length, [config.slides])
  const totalDuration = useMemo(() =>
    config.slides.filter(s => s.active && s.url.trim()).reduce((a, s) => a + s.durationSec, 0),
    [config.slides],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader size={16} className="animate-spin" /> Lade Slides...
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MonitorPlay size={22} className="text-blue-400" />
              <h2 className="text-lg font-bold text-foreground">Präsentationsmodus</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Webseiten in Endlosschleife im Vollbild anzeigen — z.B. für ein Display in der Halle.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <SourceBadge source={source} />
              {config.lastModified && (
                <p className="text-[11px] text-muted-foreground">
                  Letzte Änderung: {new Date(config.lastModified).toLocaleString('de-DE')} · {config.modifiedBy || 'unbekannt'}
                </p>
              )}
              {dirty && (
                <span className="text-[11px] text-amber-400 font-medium">● Ungespeicherte Änderungen</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => handleSave('local')}
              disabled={saving !== null}
              title="Lokal speichern (nur auf diesem Rechner sichtbar — gut zum Testen)"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                saving === null
                  ? 'bg-muted/30 text-foreground border-border hover:bg-muted/50'
                  : 'bg-muted/10 text-muted-foreground border-border cursor-not-allowed'
              }`}
            >
              {saving === 'local' ? <Loader size={14} className="animate-spin" /> : <HardDrive size={14} />}
              Lokal speichern
            </button>
            <button
              onClick={() => handleSave('central')}
              disabled={saving !== null}
              title="Zentral speichern (alle Tool-Nutzer sehen die Aenderung)"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                saving === null
                  ? 'bg-blue-600/90 text-white border-blue-500 hover:bg-blue-500'
                  : 'bg-muted/10 text-muted-foreground border-border cursor-not-allowed'
              }`}
            >
              {saving === 'central' ? <Loader size={14} className="animate-spin" /> : <Cloud size={14} />}
              Zentral speichern
            </button>
            <button
              onClick={startPresentation}
              disabled={activeCount === 0 || saving !== null}
              title={activeCount === 0 ? 'Mindestens eine aktive Slide mit URL erforderlich' : 'Vollbild-Praesentation starten'}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
                activeCount > 0 && saving === null
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              <Play size={14} />Präsentation starten
            </button>
          </div>
        </div>

        {/* Source explanation banner */}
        {source === 'local' && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
            <HardDrive size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 text-xs text-amber-200">
              Du arbeitest mit einer <strong>lokalen Kopie</strong>. Andere Nutzer sehen weiterhin die zentrale Version.
              Klick auf "Zentral speichern" um die Änderungen für alle freizugeben.
            </div>
            <button
              onClick={() => setConfirmClearLocal(true)}
              className="flex items-center gap-1 text-xs text-amber-200 hover:text-amber-100 px-2 py-1 rounded border border-amber-500/30 hover:bg-amber-500/10"
            >
              <RotateCcw size={12} />Lokale Kopie verwerfen
            </button>
          </div>
        )}

        {/* Quick info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card title="Aktive Slides" icon={<Globe size={14} />}>
            <p className="text-2xl font-semibold text-foreground">{activeCount}</p>
            <p className="text-[11px] text-muted-foreground">von {config.slides.length} insgesamt</p>
          </Card>
          <Card title="Schleifendauer" icon={<Clock size={14} />}>
            <p className="text-2xl font-semibold text-foreground">
              {Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, '0')}
            </p>
            <p className="text-[11px] text-muted-foreground">min:sek pro Durchlauf</p>
          </Card>
          <Card title="Anzeige" icon={<Maximize2 size={14} />}>
            <select
              value={selectedDisplay ?? ''}
              onChange={e => setSelectedDisplay(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-md text-sm text-foreground px-2 py-1.5"
            >
              {displays.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label} {d.primary ? '(Primär)' : ''} · {d.bounds.width}×{d.bounds.height}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Monitor für Vollbild-Anzeige</p>
          </Card>
        </div>

        {/* Hinweis */}
        <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
          <AlertTriangle size={14} className="text-blue-400 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-300 space-y-0.5">
            <p>Im Player: <strong>Leertaste</strong> = Pause/Play · <strong>← →</strong> = Vor/Zurück · <strong>ESC</strong> = Beenden</p>
            <p>Seiten mit Login (z.B. ServiceNow) verlangen ggf. einmaliges Anmelden im Präsentations-Fenster.</p>
          </div>
        </div>

        {/* Slides */}
        <Card
          title="Slides"
          icon={<MonitorPlay size={15} />}
          subtitle={`${config.slides.length} Eintrag${config.slides.length === 1 ? '' : 'e'} · drag zum Sortieren`}
        >
          <div className="space-y-2">
            {config.slides.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Noch keine Slides angelegt. Klick auf "Slide hinzufügen" um zu starten.
              </div>
            )}
            {config.slides.map((slide, idx) => (
              <SlideRow
                key={slide.id}
                slide={slide}
                index={idx}
                onPatch={patch => patchSlide(slide.id, patch)}
                onDelete={() => deleteSlide(slide.id)}
                onPreview={() => setPreview(slide)}
                onDragStart={() => setDragId(slide.id)}
                onDragEnd={() => setDragId(null)}
                onDrop={() => reorderTo(slide.id)}
                isDragSource={dragId === slide.id}
              />
            ))}

            <button onClick={addSlide}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors">
              <Plus size={14} />Slide hinzufügen
            </button>
          </div>
        </Card>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm">
          <div
            className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-2xl border ${
              toast.kind === 'success'
                ? 'bg-green-500/15 border-green-500/40 text-green-200'
                : 'bg-red-500/15 border-red-500/40 text-red-200'
            }`}
          >
            {toast.kind === 'success' ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <p className="text-sm">{toast.text}</p>
          </div>
        </div>
      )}

      {/* Confirm clear local */}
      {confirmClearLocal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setConfirmClearLocal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <RotateCcw size={18} className="text-amber-400" />
              <h3 className="text-base font-semibold text-foreground">Lokale Kopie verwerfen?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Die lokal gespeicherten Änderungen gehen verloren. Anschließend wird die zentrale Version geladen.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmClearLocal(false)} className="px-3 py-1.5 rounded-md text-sm text-muted-foreground border border-border hover:bg-muted/30">Abbrechen</button>
              <button onClick={handleClearLocal} className="px-3 py-1.5 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-500">Verwerfen</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <Eye size={14} className="text-blue-400 shrink-0" />
                <p className="text-sm font-medium text-foreground truncate">{preview.title || preview.url}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-xs text-muted-foreground hover:text-foreground">Schließen</button>
            </div>
            <iframe src={preview.url} className="flex-1 w-full bg-background" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: StorageMode | 'empty' }) {
  if (source === 'central') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300">
        <Cloud size={11} />Zentral (alle Nutzer)
      </span>
    )
  }
  if (source === 'local') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-200">
        <HardDrive size={11} />Lokal (nur dieser Rechner)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted/30 border border-border text-muted-foreground">
      Keine Konfiguration
    </span>
  )
}

// ── Single slide row ─────────────────────────────────────────────────────────

interface SlideRowProps {
  slide: Slide
  index: number
  onPatch: (patch: Partial<Slide>) => void
  onDelete: () => void
  onPreview: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: () => void
  isDragSource: boolean
}

function SlideRow({ slide, index, onPatch, onDelete, onPreview, onDragStart, onDragEnd, onDrop, isDragSource }: SlideRowProps) {
  const [durationUnit, setDurationUnit] = useState<'s' | 'm'>(
    slide.durationSec >= 60 && slide.durationSec % 60 === 0 ? 'm' : 's'
  )
  const displayedDuration = durationUnit === 'm' ? slide.durationSec / 60 : slide.durationSec

  function updateDuration(val: number, unit: 's' | 'm') {
    const sec = unit === 'm' ? val * 60 : val
    onPatch({ durationSec: Math.max(1, Math.round(sec)) })
  }

  const isValidUrl = /^https?:\/\//i.test(slide.url.trim())

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      className={`group flex items-start gap-3 p-3 rounded-lg border ${
        isDragSource ? 'border-blue-500/40 bg-blue-500/5 opacity-50' : 'border-border bg-card hover:border-border/70'
      }`}
    >
      <div className="flex flex-col items-center gap-1 pt-1 cursor-grab text-muted-foreground group-hover:text-foreground">
        <GripVertical size={16} />
        <span className="text-[10px] font-semibold">{index + 1}</span>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-2">
        {/* Title + URL */}
        <div className="space-y-1.5">
          <input
            value={slide.title}
            onChange={e => onPatch({ title: e.target.value })}
            placeholder="Titel (optional)"
            className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <div className="relative">
            <input
              value={slide.url}
              onChange={e => onPatch({ url: e.target.value })}
              placeholder="https://..."
              className={`w-full pl-7 pr-2 py-1.5 rounded-md bg-background border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 ${
                slide.url && !isValidUrl ? 'border-red-500/40 focus:ring-red-500/40' : 'border-border focus:ring-primary/50'
              }`}
            />
            <Globe size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {/* Duration */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Dauer</label>
            <div className="flex gap-1">
              <input
                type="number" min={1}
                value={displayedDuration}
                onChange={e => updateDuration(Number(e.target.value) || 1, durationUnit)}
                className="w-16 px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <select
                value={durationUnit}
                onChange={e => {
                  const u = e.target.value as 's' | 'm'
                  setDurationUnit(u)
                  updateDuration(displayedDuration, u)
                }}
                className="px-1.5 py-1 rounded-md bg-background border border-border text-xs text-foreground"
              >
                <option value="s">sek</option>
                <option value="m">min</option>
              </select>
            </div>
          </div>

          {/* Zoom */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Zoom</label>
            <select
              value={slide.zoom}
              onChange={e => onPatch({ zoom: Number(e.target.value) })}
              className="w-full px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground"
            >
              {[0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0].map(z => (
                <option key={z} value={z}>{Math.round(z * 100)}%</option>
              ))}
            </select>
          </div>

          {/* Auto-Refresh */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Auto-Refresh</label>
            <div className="flex gap-1">
              <input
                type="number" min={0}
                value={slide.refreshIntervalSec}
                onChange={e => onPatch({ refreshIntervalSec: Math.max(0, Number(e.target.value) || 0) })}
                className="w-16 px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                title="0 = kein Auto-Refresh"
              />
              <span className="text-[10px] text-muted-foreground self-center">sek</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right column: actions */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={slide.active} onChange={e => onPatch({ active: e.target.checked })}
            className="rounded accent-primary" />
          Aktiv
        </label>
        <div className="flex gap-1 mt-1">
          <button onClick={onPreview} disabled={!isValidUrl}
            title="Vorschau"
            className={`p-1.5 rounded-md border ${isValidUrl ? 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/30' : 'border-border text-muted-foreground/40 cursor-not-allowed'}`}>
            <Eye size={13} />
          </button>
          <button onClick={() => window.electronAPI?.openExternal(slide.url)} disabled={!isValidUrl}
            title="Im Browser öffnen"
            className={`p-1.5 rounded-md border ${isValidUrl ? 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/30' : 'border-border text-muted-foreground/40 cursor-not-allowed'}`}>
            <ExternalLink size={13} />
          </button>
          <button onClick={onDelete} title="Löschen"
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
