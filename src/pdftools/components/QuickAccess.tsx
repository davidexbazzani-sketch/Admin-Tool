// ── PDF-Werkzeuge: Schnellzugriff (anpassbar, Drag & Drop) ───────────────────
import { useRef, useState } from 'react'
import { X, Plus } from 'lucide-react'
import { toolById } from '../config'
import { ToolIcon, Tip } from './ui'

interface Props {
  favorites: string[]
  onRun: (id: string) => void
  onReorder: (ids: string[]) => void
  onUnpin: (id: string) => void
  onOpenPalette: () => void
}

export default function QuickAccess({ favorites, onRun, onReorder, onUnpin, onOpenPalette }: Props) {
  const dragId = useRef<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  function handleDrop(targetId: string) {
    const from = dragId.current
    setOverId(null)
    dragId.current = null
    if (!from || from === targetId) return
    const next = [...favorites]
    const fi = next.indexOf(from)
    const ti = next.indexOf(targetId)
    if (fi < 0 || ti < 0) return
    next.splice(fi, 1)
    next.splice(ti, 0, from)
    onReorder(next)
  }

  return (
    <div
      className="pdfx-scroll"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
        borderBottom: '1px solid var(--px-border)', background: 'var(--px-surface)',
        overflowX: 'auto',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--px-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 4, whiteSpace: 'nowrap' }}>
        Schnellzugriff
      </span>
      {favorites.map(id => {
        const tool = toolById(id)
        if (!tool) return null
        return (
          <Tip key={id} text={tool.tooltip}>
            <div
              draggable
              onDragStart={() => { dragId.current = id }}
              onDragOver={e => { e.preventDefault(); setOverId(id) }}
              onDragLeave={() => setOverId(o => (o === id ? null : o))}
              onDrop={() => handleDrop(id)}
              style={{ position: 'relative' }}
              className="pdfx-fade-in"
            >
              <button
                onClick={() => onRun(id)}
                className="pdfx-btn"
                data-destructive={tool.destructive}
                style={{
                  whiteSpace: 'nowrap',
                  borderColor: overId === id ? 'var(--px-accent)' : undefined,
                  color: tool.destructive ? 'var(--px-danger)' : undefined,
                }}
              >
                <ToolIcon name={tool.icon} size={15} />
                {tool.label}
                {tool.pro && <span className="pdfx-pro-badge">PRO</span>}
              </button>
              <button
                onClick={() => onUnpin(id)}
                title="Aus Schnellzugriff entfernen"
                aria-label="Aus Schnellzugriff entfernen"
                style={{
                  position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: 999,
                  background: 'var(--px-text-3)', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'grid', placeItems: 'center', opacity: 0.85,
                }}
              ><X size={10} /></button>
            </div>
          </Tip>
        )
      })}
      <button className="pdfx-btn" onClick={onOpenPalette} title="Werkzeug hinzufügen" style={{ whiteSpace: 'nowrap' }}>
        <Plus size={15} />Werkzeug
      </button>
    </div>
  )
}
