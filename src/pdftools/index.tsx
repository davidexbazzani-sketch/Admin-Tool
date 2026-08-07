// ── PDF-Werkzeuge: Modul-Einstieg (eigenes Apple-Layout) ─────────────────────
import { useEffect, useRef, useState } from 'react'
import {
  FileText, FolderOpen, Settings, X, Save, UploadCloud, Clock,
} from 'lucide-react'
import './pdftools.css'
import { api } from '../electronAPI'
import { usePdfToolsStore } from './store/usePdfToolsStore'
import { toolById } from './config'
import { openPdfViaDialog, readFileAsBytes, savePdf } from './tools/io'
import { loadPdf, getPageText } from './tools/render'
import { applyTextMarkup, type MarkupKind, type MarkupRect } from './tools/pdfOps'
import PdfViewer, { type PdfViewerHandle, type PlacementResult } from './components/PdfViewer'
import QuickAccess from './components/QuickAccess'
import ToolGroups from './components/ToolGroups'
import ToolHost from './components/ToolHost'
import Onboarding from './components/Onboarding'
import SettingsPanel from './components/SettingsPanel'
import { Tip } from './components/ui'

export default function PdfTools() {
  const tabs = usePdfToolsStore(s => s.tabs)
  const activeTabId = usePdfToolsStore(s => s.activeTabId)
  const favorites = usePdfToolsStore(s => s.favorites)
  const hiddenTools = usePdfToolsStore(s => s.hiddenTools)
  const collapsedGroups = usePdfToolsStore(s => s.collapsedGroups)
  const recents = usePdfToolsStore(s => s.recents)
  const onboardingDone = usePdfToolsStore(s => s.onboardingDone)
  const darkMode = usePdfToolsStore(s => s.darkMode)
  const addTab = usePdfToolsStore(s => s.addTab)
  const closeTab = usePdfToolsStore(s => s.closeTab)
  const setActiveTab = usePdfToolsStore(s => s.setActiveTab)
  const replaceActiveData = usePdfToolsStore(s => s.replaceActiveData)
  const setFavorites = usePdfToolsStore(s => s.setFavorites)
  const pinTool = usePdfToolsStore(s => s.pinTool)
  const unpinTool = usePdfToolsStore(s => s.unpinTool)
  const toggleGroup = usePdfToolsStore(s => s.toggleGroup)
  const completeOnboarding = usePdfToolsStore(s => s.completeOnboarding)
  const resetOnboarding = usePdfToolsStore(s => s.resetOnboarding)

  const viewerRef = useRef<PdfViewerHandle>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showRecents, setShowRecents] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState('')

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  function flash(text: string) { setToast(text); setTimeout(() => setToast(t => (t === text ? '' : t)), 3000) }

  // ── Datei oeffnen ──
  async function openViaDialog() {
    const f = await openPdfViaDialog()
    if (f) addTab(f.name, f.data, f.path)
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) { flash('Bitte eine PDF-Datei ablegen.'); return }
    const buf = new Uint8Array(await file.arrayBuffer())
    const path = (file as File & { path?: string }).path
    addTab(file.name, buf, path)
  }

  // ── Werkzeug ausfuehren ──
  function placeThen(cb: (pos: PlacementResult) => void | Promise<void>) {
    setActiveTool(null)
    requestAnimationFrame(() => viewerRef.current?.startPlacement(async (pos) => { await cb(pos) }))
  }

  async function runTool(id: string) {
    const v = viewerRef.current
    switch (id) {
      case 'open': return void openViaDialog()
      case 'recent': return setShowRecents(true)
      case 'zoom': v?.zoomIn(); return
      case 'layout': v?.cycleLayout(); return
      case 'rotateView': v?.rotateView(); return
      case 'thumbnails': v?.toggleThumbnails(); return
      case 'search': v?.openSearch(); return
      case 'highlight':
      case 'underline':
      case 'strike': {
        const ok = viewerRef.current?.applyMarkupToSelection(id as MarkupKind)
        if (!ok) flash('Markiere zuerst Text im Dokument — dann erscheint ein Menü zum Hervorheben.')
        return
      }
      case 'selectCopy': return void copyPageText()
      case 'readAloud': return void readAloud()
      case 'print': window.print(); return
      case 'share': return void shareByEmail()
      default:
        setActiveTool(id)
    }
  }

  async function copyPageText() {
    if (!activeTab) return flash('Bitte zuerst ein PDF öffnen.')
    const doc = await loadPdf(activeTab.data)
    const txt = await getPageText(doc, viewerRef.current?.getCurrentPage() ?? 1)
    await navigator.clipboard.writeText(txt).catch(() => {})
    flash('Text der aktuellen Seite kopiert.')
  }

  async function readAloud() {
    if (!activeTab) return flash('Bitte zuerst ein PDF öffnen.')
    const doc = await loadPdf(activeTab.data)
    const txt = await getPageText(doc, viewerRef.current?.getCurrentPage() ?? 1)
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(txt)
      u.lang = 'de-DE'
      window.speechSynthesis.speak(u)
      flash('Vorlesen gestartet.')
    } catch { flash('Vorlesen wird nicht unterstützt.') }
  }

  async function shareByEmail() {
    if (!activeTab) return flash('Bitte zuerst ein PDF öffnen.')
    let path = activeTab.sourcePath
    if (!path || activeTab.dirty) {
      const res = await savePdf(activeTab.data, activeTab.fileName)
      if (res.cancelled || !res.path) return
      path = res.path
    }
    await api().composeEmail({ to: '', cc: '', subject: activeTab.fileName, body: 'Anbei das PDF-Dokument.', attachmentPath: path })
  }

  async function saveActive() {
    if (!activeTab) return
    await savePdf(activeTab.data, activeTab.fileName)
  }

  async function applyMarkup(kind: MarkupKind, rects: MarkupRect[]) {
    if (!activeTab || rects.length === 0) return
    const out = await applyTextMarkup(activeTab.data, kind, rects)
    replaceActiveData(out)
    flash(kind === 'highlight' ? 'Hervorgehoben.' : kind === 'underline' ? 'Unterstrichen.' : 'Durchgestrichen.')
  }

  // Beim Modul-Verlassen evtl. laufendes Vorlesen stoppen
  useEffect(() => () => { try { window.speechSynthesis.cancel() } catch { /* ok */ } }, [])

  return (
    <div
      className={`pdfx ${darkMode ? 'pdfx-dark' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Kopfzeile: Titel + Tabs + Aktionen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--px-border)', background: 'var(--px-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--px-accent)', color: '#fff' }}><FileText size={16} /></span>
          PDF-Werkzeuge
        </div>

        {/* Tabs */}
        <div className="pdfx-scroll" style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto', paddingLeft: 8 }}>
          {tabs.map(t => (
            <div key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--px-radius-sm)',
                cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, maxWidth: 220,
                background: t.id === activeTabId ? 'var(--px-accent-soft)' : 'var(--px-surface-2)',
                border: `1px solid ${t.id === activeTabId ? 'var(--px-accent)' : 'var(--px-border)'}`,
                color: t.id === activeTabId ? 'var(--px-accent)' : 'var(--px-text-2)',
              }}>
              <FileText size={13} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.fileName}{t.dirty ? ' •' : ''}</span>
              <button onClick={e => { e.stopPropagation(); closeTab(t.id) }} aria-label="Tab schließen" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'grid', placeItems: 'center' }}><X size={13} /></button>
            </div>
          ))}
        </div>

        <Tip text="PDF-Datei öffnen"><button className="pdfx-btn" onClick={openViaDialog}><FolderOpen size={15} />Öffnen</button></Tip>
        <Tip text="Aktuelles Dokument speichern"><button className="pdfx-btn" onClick={saveActive} disabled={!activeTab}><Save size={15} />Speichern</button></Tip>
        <Tip text="Einstellungen & Werkzeuge anpassen"><button className="pdfx-btn" onClick={() => setShowSettings(true)} style={{ padding: 8 }}><Settings size={16} /></button></Tip>
      </div>

      {/* Schnellzugriff */}
      <QuickAccess
        favorites={favorites}
        onRun={runTool}
        onReorder={setFavorites}
        onUnpin={unpinTool}
        onOpenPalette={() => setShowSettings(true)}
      />

      {/* Hauptbereich: Werkzeug-Palette + Dokument */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ToolGroups
          favorites={favorites}
          hiddenTools={hiddenTools}
          collapsedGroups={collapsedGroups}
          onRun={runTool}
          onTogglePin={(id) => favorites.includes(id) ? unpinTool(id) : pinTool(id)}
          onToggleGroup={toggleGroup}
        />

        <div style={{ flex: 1, minWidth: 0, position: 'relative', background: 'var(--px-bg)' }}>
          {activeTab ? (
            <PdfViewer key={activeTab.id} ref={viewerRef} data={activeTab.data} onApplyMarkup={applyMarkup} />
          ) : (
            <EmptyState onOpen={openViaDialog} recents={recents} onOpenRecent={async (p, n) => { const f = await readFileAsBytes(p); if (f) addTab(f.name, f.data, f.path); else flash(`„${n}“ nicht gefunden.`) }} dragOver={dragOver} />
          )}
        </div>
      </div>

      {/* Drop-Overlay */}
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,113,227,0.08)', border: '3px dashed var(--px-accent)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--px-accent)', fontWeight: 600 }}>
            <UploadCloud size={48} /> PDF hier ablegen
          </div>
        </div>
      )}

      {/* Aktions-Modal */}
      {activeTool && (
        <ToolHost
          toolId={activeTool}
          data={activeTab?.data ?? null}
          fileName={activeTab?.fileName ?? 'dokument.pdf'}
          sourcePath={activeTab?.sourcePath}
          onClose={() => setActiveTool(null)}
          onReplace={(bytes, name) => replaceActiveData(bytes, { fileName: name })}
          onOpenNew={(name, bytes) => addTab(name, bytes)}
          placeThen={placeThen}
        />
      )}

      {/* Einstellungen */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onRestartOnboarding={() => { setShowSettings(false); resetOnboarding() }} />}

      {/* Onboarding (Erststart) */}
      {!onboardingDone && (
        <Onboarding onDone={(ids) => completeOnboarding(ids)} onSkip={() => completeOnboarding([])} />
      )}

      {/* Zuletzt geoeffnet */}
      {showRecents && (
        <div onClick={() => setShowRecents(false)} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.32)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} className="pdfx-card pdfx-fade-in" style={{ width: '100%', maxWidth: 460, padding: 18 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={16} />Zuletzt geöffnet</h3>
            {recents.length === 0 ? <p style={{ color: 'var(--px-text-2)' }}>Noch keine zuletzt geöffneten Dokumente.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recents.map(r => (
                  <button key={r.path} className="pdfx-btn" style={{ justifyContent: 'flex-start' }} onClick={async () => { setShowRecents(false); const f = await readFileAsBytes(r.path); if (f) addTab(f.name, f.data, f.path); else flash(`„${r.name}“ nicht gefunden.`) }}>
                    <FileText size={14} />{r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="pdfx-fade-in" style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 95, background: '#1d1d1f', color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 13, boxShadow: 'var(--px-shadow)' }}>{toast}</div>
      )}
    </div>
  )
}

function EmptyState({ onOpen, recents, onOpenRecent, dragOver }: {
  onOpen: () => void
  recents: { path: string; name: string }[]
  onOpenRecent: (path: string, name: string) => void
  dragOver: boolean
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{
          border: `2px dashed ${dragOver ? 'var(--px-accent)' : 'var(--px-border-strong)'}`,
          borderRadius: 'var(--px-radius-lg)', padding: '48px 40px', background: 'var(--px-surface)',
          boxShadow: 'var(--px-shadow-sm)',
        }}>
          <div style={{ display: 'grid', placeItems: 'center', width: 64, height: 64, margin: '0 auto 16px', borderRadius: 18, background: 'var(--px-accent-soft)', color: 'var(--px-accent)' }}>
            <UploadCloud size={32} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>PDF öffnen oder hierher ziehen</h2>
          <p style={{ color: 'var(--px-text-2)', fontSize: 14, marginBottom: 20 }}>Ziehe eine PDF-Datei in dieses Fenster oder wähle sie aus.</p>
          <button className="pdfx-btn pdfx-btn-primary" onClick={onOpen} style={{ margin: '0 auto', fontSize: 14, padding: '10px 20px' }}><FolderOpen size={16} />PDF auswählen</button>
        </div>
        {recents.length > 0 && (
          <div style={{ marginTop: 24, textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--px-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Zuletzt geöffnet</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recents.slice(0, 5).map(r => (
                <button key={r.path} className="pdfx-btn" style={{ justifyContent: 'flex-start' }} onClick={() => onOpenRecent(r.path, r.name)}>
                  <FileText size={14} />{r.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
