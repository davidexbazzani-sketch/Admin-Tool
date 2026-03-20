import { useState, useEffect, useRef, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import {
  ArrowLeft, Plus, Minus, Grid, Undo2, Redo2, Eye, EyeOff, Save, Loader,
  Type, FileText, Edit2, Maximize2, Minimize2, LayoutDashboard,
} from 'lucide-react'
import WidgetRenderer from '../components/dashboard/WidgetRenderer'
import PropertiesPanel from '../components/dashboard/PropertiesPanel'
import WidgetCatalog from '../components/dashboard/WidgetCatalog'
import AlarmSystem from '../components/dashboard/AlarmSystem'
import { useDashboardStore } from '../store/dashboardStore'
import type { DashboardConfig, DashboardElement, WidgetType, ActiveAlarm } from '../types/dashboard'
import { DEFAULT_WIDGET_STYLE, DEFAULT_WIDGET_CONFIG } from '../types/dashboard'

interface DashboardEditorProps {
  dashboard: DashboardConfig
  initialMode: 'edit' | 'live'
  username: string
  displayName: string
  onClose: () => void
  onSave: (config: DashboardConfig) => Promise<void>
}

interface ContextMenu {
  x: number
  y: number
  elementId: string
}

export default function DashboardEditor({
  dashboard,
  initialMode,
  username,
  displayName,
  onClose,
  onSave,
}: DashboardEditorProps) {
  const [current, setCurrent] = useState<DashboardConfig>({ ...dashboard })
  const [history, setHistory] = useState<DashboardConfig[]>([dashboard])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'edit' | 'live'>(initialMode)
  const [zoom, setZoom] = useState(0.75)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(dashboard.name)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const { addAlarm } = useDashboardStore()

  // Stable alarm handler — must NOT be an inline arrow so widgets don't restart their intervals on every render
  const handleAlarmTrigger = useCallback((alarm: Omit<ActiveAlarm, 'id' | 'acknowledged'>) => {
    addAlarm({ ...alarm, id: `al-${Date.now()}`, acknowledged: false })
  }, [addAlarm])

  // Close context menu on outside click
  useEffect(() => {
    function handleClick() {
      setContextMenu(null)
    }
    if (contextMenu) {
      window.addEventListener('click', handleClick)
      return () => window.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  // ── History management ──────────────────────────────────────────────────────

  function pushHistory(newState: DashboardConfig) {
    setHistory(prev => [...prev.slice(0, historyIdx + 1), newState])
    setHistoryIdx(prev => prev + 1)
    setCurrent(newState)
    setIsDirty(true)
  }

  function undo() {
    if (historyIdx > 0) {
      const idx = historyIdx - 1
      setCurrent(history[idx])
      setHistoryIdx(idx)
      setIsDirty(true)
    }
  }

  function redo() {
    if (historyIdx < history.length - 1) {
      const idx = historyIdx + 1
      setCurrent(history[idx])
      setHistoryIdx(idx)
      setIsDirty(true)
    }
  }

  // ── Element manipulation ────────────────────────────────────────────────────

  function updateElement(id: string, patch: Partial<DashboardElement>) {
    const newState = {
      ...current,
      elements: current.elements.map(e => (e.id === id ? { ...e, ...patch } : e)),
    }
    pushHistory(newState)
  }

  function deleteElement(id: string) {
    const newState = {
      ...current,
      elements: current.elements.filter(e => e.id !== id),
    }
    pushHistory(newState)
    setSelectedId(null)
  }

  function duplicateElement(id: string) {
    const el = current.elements.find(e => e.id === id)
    if (!el) return
    const copy: DashboardElement = {
      ...el,
      id: `el-${Date.now()}`,
      position: { x: el.position.x + 20, y: el.position.y + 20 },
      zIndex: Math.max(...current.elements.map(e => e.zIndex), 0) + 1,
    }
    pushHistory({ ...current, elements: [...current.elements, copy] })
    setSelectedId(copy.id)
  }

  function bringToFront(id: string) {
    const maxZ = Math.max(...current.elements.map(e => e.zIndex), 0)
    updateElement(id, { zIndex: maxZ + 1 })
  }

  function sendToBack(id: string) {
    const minZ = Math.min(...current.elements.map(e => e.zIndex), 0)
    updateElement(id, { zIndex: minZ - 1 })
  }

  // ── Drag / resize stop (push to history only on stop) ─────────────────────

  function handleDragStop(id: string, x: number, y: number) {
    const newState = {
      ...current,
      elements: current.elements.map(e =>
        e.id === id ? { ...e, position: { x, y } } : e
      ),
    }
    pushHistory(newState)
  }

  function handleResizeStop(id: string, x: number, y: number, w: number, h: number) {
    const newState = {
      ...current,
      elements: current.elements.map(e =>
        e.id === id ? { ...e, position: { x, y }, size: { width: w, height: h } } : e
      ),
    }
    pushHistory(newState)
  }

  // ── Add element from catalog ────────────────────────────────────────────────

  function getDefaultTitle(type: WidgetType): string {
    const labels: Partial<Record<WidgetType, string>> = {
      'online-status': 'Online-Status',
      'cpu-usage': 'CPU',
      'ram-usage': 'RAM',
      'disk-usage': 'Festplatte',
      'service-status': 'Dienste',
      'uptime': 'Uptime',
      'system-info': 'System-Info',
      'logged-in-user': 'Angemeldeter User',
      'event-log-errors': 'Event-Log Fehler',
      'windows-update': 'Windows Update',
      'quick-actions': 'Schnellaktionen',
      'clock': 'Uhr',
      'note': 'Notiz',
      'text-label': 'Beschriftung',
      'divider': '',
      'counter': 'Zähler',
      'table': 'Tabelle',
    }
    return labels[type] ?? type
  }

  function addElement(type: WidgetType) {
    const defaultSizes: Partial<Record<WidgetType, { width: number; height: number }>> = {
      'online-status': { width: 280, height: 200 },
      'cpu-usage': { width: 200, height: 160 },
      'ram-usage': { width: 200, height: 160 },
      'disk-usage': { width: 200, height: 160 },
      'service-status': { width: 280, height: 200 },
      'clock': { width: 220, height: 100 },
      'note': { width: 250, height: 150 },
      'text-label': { width: 200, height: 60 },
      'divider': { width: 400, height: 30 },
      'system-info': { width: 320, height: 240 },
      'quick-actions': { width: 300, height: 160 },
      'counter': { width: 180, height: 120 },
      'uptime': { width: 200, height: 120 },
      'logged-in-user': { width: 220, height: 100 },
      'event-log-errors': { width: 220, height: 100 },
      'windows-update': { width: 220, height: 100 },
      'table': { width: 500, height: 300 },
    }
    const size = defaultSizes[type] ?? { width: 250, height: 180 }
    const maxZ = Math.max(...current.elements.map(e => e.zIndex), 0) + 1
    const newEl: DashboardElement = {
      id: `el-${Date.now()}`,
      type,
      position: { x: 100, y: 100 },
      size,
      zIndex: maxZ,
      style: { ...DEFAULT_WIDGET_STYLE },
      config: { ...DEFAULT_WIDGET_CONFIG, title: getDefaultTitle(type) },
      thresholds: [],
    }
    const newState = { ...current, elements: [...current.elements, newEl] }
    pushHistory(newState)
    setSelectedId(newEl.id)
    setShowCatalog(false)
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  const saveNow = useCallback(async () => {
    setIsSaving(true)
    try {
      const updated: DashboardConfig = {
        ...current,
        name: nameInput,
        updatedAt: new Date().toISOString(),
      }
      await onSave(updated)
      setCurrent(updated)
      setIsDirty(false)
    } finally {
      setIsSaving(false)
    }
  }, [current, nameInput, onSave])

  // ── Auto-save (60 s) ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isDirty || mode !== 'edit') return
    const t = setTimeout(saveNow, 60_000)
    return () => clearTimeout(t)
  }, [isDirty, current, mode, saveNow])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't fire shortcuts when typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveNow() }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo() }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo() }
      if (e.key === 'Delete' && selectedId && mode === 'edit') deleteElement(selectedId)
      if (e.ctrlKey && e.key === 'd' && selectedId) { e.preventDefault(); duplicateElement(selectedId) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedId, mode, historyIdx, history, current, isDirty, saveNow])

  // ── Context menu handler ────────────────────────────────────────────────────

  function handleContextMenu(e: React.MouseEvent, elementId: string) {
    if (mode !== 'edit') return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, elementId })
  }

  // ── Name commit helper ──────────────────────────────────────────────────────

  function commitName() {
    setEditingName(false)
    setCurrent(c => ({ ...c, name: nameInput }))
    setIsDirty(true)
  }

  // ── Selected element ────────────────────────────────────────────────────────

  const selectedElement = current.elements.find(e => e.id === selectedId) ?? null

  // ── Outer container style (fullscreen support) ──────────────────────────────

  const outerStyle: React.CSSProperties = isFullscreen
    ? { position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column' }
    : { display: 'flex', flexDirection: 'column', height: '100%' }

  // ── Canvas ──────────────────────────────────────────────────────────────────

  const canvas = (
    <div
      className="flex-1 overflow-auto"
      style={{ backgroundColor: '#0a0a12' }}
      onClick={e => {
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).dataset.canvas
        ) {
          setSelectedId(null)
        }
      }}
    >
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          width: current.canvasWidth,
          height: current.canvasHeight,
          position: 'relative',
          backgroundColor: current.background.color,
          ...(current.gridEnabled && mode === 'edit'
            ? {
                backgroundImage: `radial-gradient(circle, #444 1px, transparent 1px)`,
                backgroundSize: `${current.gridSize}px ${current.gridSize}px`,
              }
            : {}),
        }}
        data-canvas="true"
        onClick={e => {
          if ((e.target as HTMLElement).dataset.canvas) setSelectedId(null)
        }}
      >
        {/* Empty state */}
        {current.elements.length === 0 && mode === 'edit' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-dashed border-white/10 rounded-2xl p-12 text-center">
              <LayoutDashboard size={48} className="mx-auto mb-4 text-white/20" />
              <p className="text-white/30 text-sm">
                Klicke auf &quot;+ Widget&quot; um das Dashboard zu befüllen
              </p>
            </div>
          </div>
        )}

        {current.elements
          .slice()
          .sort((a, b) => a.zIndex - b.zIndex)
          .map(element => (
            <Rnd
              key={element.id}
              position={{ x: element.position.x, y: element.position.y }}
              size={{ width: element.size.width, height: element.size.height }}
              onDragStop={(_e, d) => handleDragStop(element.id, d.x, d.y)}
              onResizeStop={(_e, _dir, ref, _delta, pos) =>
                handleResizeStop(element.id, pos.x, pos.y, ref.offsetWidth, ref.offsetHeight)
              }
              disableDragging={mode === 'live' || element.locked || false}
              enableResizing={mode === 'edit' && !element.locked}
              dragGrid={current.gridEnabled ? [current.gridSize, current.gridSize] : [1, 1]}
              resizeGrid={current.gridEnabled ? [current.gridSize, current.gridSize] : [1, 1]}
              bounds="parent"
              style={{
                zIndex: element.zIndex,
                outline:
                  selectedId === element.id && mode === 'edit'
                    ? '2px solid #6366f1'
                    : 'none',
                outlineOffset: '2px',
              }}
              onClick={e => {
                e.stopPropagation()
                setSelectedId(element.id)
              }}
              onContextMenu={e => handleContextMenu(e as unknown as React.MouseEvent, element.id)}
            >
              <WidgetRenderer
                element={element}
                mode={mode === 'live' ? 'live' : 'edit'}
                isSelected={selectedId === element.id}
                onAlarmTrigger={handleAlarmTrigger}
              />
            </Rnd>
          ))}
      </div>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={outerStyle} className="bg-background text-foreground">

      {/* ── EDIT MODE ──────────────────────────────────────────────────────── */}
      {mode === 'edit' && (
        <>
          {/* Toolbar */}
          <div className="shrink-0 h-12 bg-card border-b border-border flex items-center gap-2 px-3">

            {/* Back */}
            <button
              onClick={() => {
                if (isDirty) {
                  if (confirm('Ungespeicherte Änderungen verwerfen?')) onClose()
                } else {
                  onClose()
                }
              }}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground"
              title="Schließen"
            >
              <ArrowLeft size={16} />
            </button>

            {/* Dashboard name */}
            {editingName ? (
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitName()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                className="text-sm font-semibold bg-background border border-primary rounded px-2 py-0.5 text-foreground focus:outline-none w-48"
                autoFocus
              />
            ) : (
              <span
                className="text-sm font-semibold text-foreground cursor-text hover:text-primary transition-colors"
                onClick={() => setEditingName(true)}
                title="Klicken zum Umbenennen"
              >
                {nameInput}
              </span>
            )}

            {/* Dirty indicator */}
            {isDirty && (
              <span
                className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                title="Ungespeicherte Änderungen"
              />
            )}

            <div className="h-6 w-px bg-border mx-1" />

            {/* Add widget */}
            <button
              onClick={() => setShowCatalog(true)}
              title="Widget hinzufügen"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus size={13} /> Widget
            </button>

            {/* Add text label */}
            <button
              onClick={() => addElement('text-label')}
              title="Text hinzufügen"
              className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
            >
              <Type size={15} />
            </button>

            {/* Add divider */}
            <button
              onClick={() => addElement('divider')}
              title="Trennlinie hinzufügen"
              className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
            >
              <Minus size={15} />
            </button>

            {/* Add note */}
            <button
              onClick={() => addElement('note')}
              title="Notiz hinzufügen"
              className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
            >
              <FileText size={15} />
            </button>

            <div className="h-6 w-px bg-border mx-1" />

            {/* Grid toggle */}
            <button
              onClick={() => setCurrent(c => ({ ...c, gridEnabled: !c.gridEnabled }))}
              className={`p-1.5 rounded text-muted-foreground transition-colors ${
                current.gridEnabled ? 'bg-primary/20 text-primary' : 'hover:bg-accent'
              }`}
              title="Raster ein/aus"
            >
              <Grid size={15} />
            </button>

            <div className="h-6 w-px bg-border mx-1" />

            {/* Undo */}
            <button
              onClick={undo}
              disabled={historyIdx <= 0}
              title="Rückgängig (Strg+Z)"
              className="p-1.5 rounded hover:bg-accent text-muted-foreground disabled:opacity-30 transition-colors"
            >
              <Undo2 size={15} />
            </button>

            {/* Redo */}
            <button
              onClick={redo}
              disabled={historyIdx >= history.length - 1}
              title="Wiederholen (Strg+Y)"
              className="p-1.5 rounded hover:bg-accent text-muted-foreground disabled:opacity-30 transition-colors"
            >
              <Redo2 size={15} />
            </button>

            <div className="flex-1" />

            {/* Zoom controls */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <button
                onClick={() => setZoom(z => Math.max(0.25, parseFloat((z - 0.1).toFixed(2))))}
                className="p-1 rounded hover:bg-accent transition-colors"
                title="Verkleinern"
              >
                <Minus size={13} />
              </button>
              <span className="w-12 text-center font-mono select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(2, parseFloat((z + 0.1).toFixed(2))))}
                className="p-1 rounded hover:bg-accent transition-colors"
                title="Vergrößern"
              >
                <Plus size={13} />
              </button>
            </div>

            {/* Background color */}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[10px] text-muted-foreground select-none">Hintergrund</span>
              <input
                type="color"
                value={current.background.color}
                onChange={e =>
                  setCurrent(c => ({
                    ...c,
                    background: { ...c.background, color: e.target.value },
                  }))
                }
                className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent"
                title="Hintergrundfarbe"
              />
            </div>

            <div className="h-6 w-px bg-border mx-1" />

            {/* Live preview toggle */}
            <button
              onClick={() => setMode(m => (m === 'edit' ? 'live' : 'edit'))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors border-border text-muted-foreground hover:bg-accent"
              title="Live-Vorschau"
            >
              <Eye size={13} /> Live
            </button>

            {/* Save */}
            <button
              onClick={saveNow}
              disabled={!isDirty || isSaving}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              title="Speichern (Strg+S)"
            >
              {isSaving ? (
                <Loader size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              Speichern
            </button>
          </div>

          {/* Main area: canvas + properties panel */}
          <div className="flex flex-1 overflow-hidden">
            {canvas}

            {/* Right panel */}
            <div className="shrink-0 w-72 border-l border-border bg-card overflow-y-auto flex flex-col">
              {selectedElement ? (
                <PropertiesPanel
                  element={selectedElement}
                  onUpdate={updateElement}
                  onDelete={deleteElement}
                  onDuplicate={duplicateElement}
                  onBringToFront={bringToFront}
                  onSendToBack={sendToBack}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center p-6">
                  <p className="text-xs text-muted-foreground text-center leading-relaxed">
                    Klicke auf ein Element,<br />um es zu bearbeiten
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── LIVE MODE ──────────────────────────────────────────────────────── */}
      {mode === 'live' && (
        <>
          {/* Minimal top bar */}
          <div className="shrink-0 h-10 bg-card/80 backdrop-blur border-b border-border flex items-center gap-3 px-4">
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
              title="Schließen"
            >
              <ArrowLeft size={15} />
            </button>
            <span className="text-sm font-semibold text-foreground">{current.name}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 select-none">
              Live
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setMode('edit')}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Zum Editor wechseln"
            >
              <Edit2 size={13} /> Bearbeiten
            </button>
            <button
              onClick={() => setIsFullscreen(f => !f)}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
              title={isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>

          {/* Canvas wrapped in AlarmSystem */}
          <AlarmSystem dashboardId={current.id} userId={displayName}>
            {canvas}
          </AlarmSystem>
        </>
      )}

      {/* ── Widget Catalog Modal ────────────────────────────────────────────── */}
      {showCatalog && (
        <WidgetCatalog
          onAdd={addElement}
          onClose={() => setShowCatalog(false)}
        />
      )}

      {/* ── Context Menu ───────────────────────────────────────────────────── */}
      {contextMenu && mode === 'edit' && (
        <div
          className="fixed z-[9999] bg-card border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors flex items-center justify-between"
            onClick={() => {
              duplicateElement(contextMenu.elementId)
              setContextMenu(null)
            }}
          >
            <span>Duplizieren</span>
            <span className="text-muted-foreground text-[10px]">Strg+D</span>
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
            onClick={() => {
              bringToFront(contextMenu.elementId)
              setContextMenu(null)
            }}
          >
            In Vordergrund
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
            onClick={() => {
              sendToBack(contextMenu.elementId)
              setContextMenu(null)
            }}
          >
            In Hintergrund
          </button>
          <div className="my-1 border-t border-border" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-between"
            onClick={() => {
              deleteElement(contextMenu.elementId)
              setContextMenu(null)
            }}
          >
            <span>Löschen</span>
            <span className="text-muted-foreground text-[10px]">Entf</span>
          </button>
        </div>
      )}
    </div>
  )
}
