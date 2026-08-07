import { useEffect, useRef, useState } from 'react'
import {
  X, Trash2, Check, Paperclip, AlertTriangle, Loader2,
  Image as ImageIcon, Clipboard,
} from 'lucide-react'
import {
  updateMarker, deleteMarker, addMarkerScreenshot, deleteMarkerScreenshot,
  readScreenshotBase64, formatBytes,
  type Marker, type MarkerScreenshot,
} from '../../services/accessPoints'
import { api } from '../../electronAPI'

interface Props {
  marker: Marker
  currentUser: string
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
}

function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function MarkerDetailDialog({ marker, currentUser, onClose, onChanged, onDeleted }: Props) {
  const [name, setName] = useState(marker.name)
  const [mac, setMac] = useState(marker.mac)
  const [serial, setSerial] = useState(marker.serial)
  const [model, setModel] = useState(marker.model)
  const [notes, setNotes] = useState(marker.notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [hint, setHint] = useState('')
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null)
  const [thumbCache, setThumbCache] = useState<Record<string, string>>({})
  const pasteAreaRef = useRef<HTMLDivElement>(null)

  // Re-seeden bei Marker-Wechsel
  useEffect(() => {
    setName(marker.name); setMac(marker.mac); setSerial(marker.serial)
    setModel(marker.model); setNotes(marker.notes); setError(''); setHint('')
    setConfirmDelete(false)
  }, [marker.id])

  // Thumbnails laden (kleines Vorschaubild je Screenshot)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const sc of marker.screenshots) {
        if (thumbCache[sc.id]) continue
        const b64 = await readScreenshotBase64(sc)
        if (cancelled) return
        if (b64) setThumbCache(prev => ({ ...prev, [sc.id]: `data:image/png;base64,${b64}` }))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marker.screenshots])

  // Globaler Paste-Listener: Bild aus Zwischenablage → Screenshot
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      // Editier-Inputs ignorieren, damit Text-Paste normal funktioniert
      const t = e.target as HTMLElement
      const tag = (t?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      const items = Array.from(e.clipboardData.items)
      const img = items.find(i => i.type.startsWith('image/'))
      if (!img) return
      e.preventDefault()
      const blob = img.getAsFile()
      if (!blob) return
      const buf = await blob.arrayBuffer()
      const u8 = new Uint8Array(buf)
      let bin = ''
      const chunk = 8192
      for (let i = 0; i < u8.byteLength; i += chunk) bin += String.fromCharCode(...u8.subarray(i, i + chunk))
      const b64 = btoa(bin)
      const fn = `paste_${Date.now()}.png`
      setUploading(true); setError('')
      const r = await addMarkerScreenshot(marker.id, b64, fn, currentUser)
      setUploading(false)
      if (!r.ok) { setError(r.error || 'Screenshot konnte nicht gespeichert werden.'); return }
      setHint('Screenshot eingefügt.')
      setTimeout(() => setHint(''), 2200)
      onChanged()
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [marker.id, currentUser, onChanged])

  // ESC schließt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (lightbox) setLightbox(null); else if (!busy) onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, lightbox, onClose])

  async function save() {
    setBusy(true); setError('')
    const r = await updateMarker(marker.id, { name: name.trim(), mac: mac.trim(), serial: serial.trim(), model: model.trim(), notes: notes.trim() })
    setBusy(false)
    if (!r.ok) { setError(r.error || 'Speichern fehlgeschlagen.'); return }
    onChanged()
  }

  async function attachFile() {
    const paths = await api().openFilesDialog([{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg'] }])
    if (!paths || paths.length === 0) return
    setUploading(true); setError('')
    for (const p of paths) {
      const r = await api().readFile(p)
      if (!r.success || !r.data) continue
      const fn = p.split(/[\\/]/).pop() || 'screenshot.png'
      const res = await addMarkerScreenshot(marker.id, r.data, fn, currentUser)
      if (!res.ok) { setError(res.error || 'Upload fehlgeschlagen.'); break }
    }
    setUploading(false)
    onChanged()
  }

  async function removeScreenshot(sc: MarkerScreenshot) {
    await deleteMarkerScreenshot(marker.id, sc.id)
    setThumbCache(prev => { const n = { ...prev }; delete n[sc.id]; return n })
    onChanged()
  }

  async function openShot(sc: MarkerScreenshot) {
    const data = thumbCache[sc.id] || (await readScreenshotBase64(sc) ? `data:image/png;base64,${await readScreenshotBase64(sc)}` : '')
    if (data) setLightbox({ src: data, name: sc.filename })
  }

  async function doDelete() {
    setBusy(true)
    const r = await deleteMarker(marker.id)
    setBusy(false)
    if (!r.ok) { setError(r.error || 'Löschen fehlgeschlagen.'); return }
    onDeleted()
  }

  const hasExtra = Object.keys(marker.extra || {}).length > 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => !busy && onClose()}>
      <div ref={pasteAreaRef} tabIndex={-1} className="w-full max-w-xl h-full bg-card border-l border-border shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-2 px-5 pt-4 border-b border-border pb-3">
          <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shrink-0 mt-1.5" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">{marker.name || '(unbenannter AP)'}</h2>
            <p className="text-[11px] text-muted-foreground">erstellt {fmtDateTime(marker.createdAt)} · zuletzt {fmtDateTime(marker.updatedAt)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground" title="Schließen"><X size={18} /></button>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
            <AlertTriangle size={14} />{error}
          </div>
        )}
        {hint && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-emerald-500 border border-emerald-600 text-black text-xs shrink-0">
            {hint}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label="Name" value={name} onChange={setName} placeholder="z. B. AP-DEHAM-08" />
          <Field label="MAC-Adresse" value={mac} onChange={setMac} placeholder="00:11:22:33:44:55" />
          <Field label="Seriennummer" value={serial} onChange={setSerial} placeholder="FCW1234ABCD" />
          <Field label="Modell" value={model} onChange={setModel} placeholder="z. B. Cisco Aironet 2802I" />
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Notizen</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Anmerkungen, Raum-Hinweis, Mast/Decke, …"
              className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </div>

          {hasExtra && (
            <details className="rounded-md border border-border bg-background/40">
              <summary className="px-3 py-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Inventar-Felder ({Object.keys(marker.extra).length})
              </summary>
              <div className="px-3 pb-3 space-y-1">
                {Object.entries(marker.extra).map(([k, v]) => v ? (
                  <div key={k} className="text-[11px] flex gap-2">
                    <span className="text-muted-foreground shrink-0 w-32">{k}:</span>
                    <span className="text-foreground break-words">{v}</span>
                  </div>
                ) : null)}
              </div>
            </details>
          )}

          {/* Screenshots */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1">
                <ImageIcon size={12} />Screenshots ({marker.screenshots.length})
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={attachFile}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:bg-accent/40 border border-border disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}Datei…
                </button>
              </div>
            </div>
            <div className="px-3 py-3 rounded-md bg-amber-300/10 border border-dashed border-amber-300/40 text-[11px] text-foreground inline-flex items-center gap-1.5 mb-2">
              <Clipboard size={12} className="text-amber-400" />
              Tipp: Mit <kbd className="px-1 py-0.5 bg-card border border-border rounded text-[10px]">Strg + V</kbd> kannst du einen Screenshot direkt aus der Zwischenablage einfügen.
            </div>
            <div className="grid grid-cols-3 gap-2">
              {marker.screenshots.map(sc => (
                <div key={sc.id} className="relative group">
                  {thumbCache[sc.id] ? (
                    <img
                      src={thumbCache[sc.id]}
                      alt={sc.filename}
                      onClick={() => openShot(sc)}
                      className="w-full h-24 object-cover rounded border border-border bg-white cursor-pointer hover:opacity-90"
                    />
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center rounded border border-border bg-accent/20">
                      <Loader2 size={14} className="animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <button
                    onClick={() => removeScreenshot(sc)}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Entfernen"
                  ><X size={11} /></button>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={sc.filename}>{sc.filename}</p>
                  <p className="text-[9px] text-muted-foreground/70">{formatBytes(sc.size)}</p>
                </div>
              ))}
              {marker.screenshots.length === 0 && (
                <div className="col-span-3 text-center text-[11px] text-muted-foreground/70 py-4">Noch keine Screenshots</div>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-5 py-3 flex items-center gap-2">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Speichern
          </button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Schließen</button>
          <div className="ml-auto">
            {confirmDelete ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[11px] text-red-300">AP entfernen?</span>
                <button onClick={doDelete} disabled={busy} className="px-2 py-1 rounded-md text-[11px] bg-red-500/20 text-red-300 hover:bg-red-500/30">Ja, löschen</button>
                <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-accent/40">Abbrechen</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-300 border border-border">
                <Trash2 size={12} />Marker löschen
              </button>
            )}
          </div>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <div className="flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.name} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
            <span className="text-white/80 text-xs">{lightbox.name}</span>
            <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"><X size={20} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted-foreground mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  )
}

