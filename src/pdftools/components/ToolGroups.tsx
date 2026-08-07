// ── PDF-Werkzeuge: Werkzeug-Palette (Gruppen, aufklappbar) ───────────────────
import { ChevronDown, Pin } from 'lucide-react'
import { PDF_GROUPS, toolsByGroup, type PdfGroupId } from '../config'
import { ToolIcon, Tip } from './ui'

interface Props {
  favorites: string[]
  hiddenTools: string[]
  collapsedGroups: PdfGroupId[]
  onRun: (id: string) => void
  onTogglePin: (id: string) => void
  onToggleGroup: (id: PdfGroupId) => void
}

export default function ToolGroups({ favorites, hiddenTools, collapsedGroups, onRun, onTogglePin, onToggleGroup }: Props) {
  return (
    <div className="pdfx-scroll" style={{ width: 264, borderRight: '1px solid var(--px-border)', overflowY: 'auto', background: 'var(--px-surface-2)', flexShrink: 0 }}>
      {PDF_GROUPS.map(group => {
        const collapsed = collapsedGroups.includes(group.id)
        const tools = toolsByGroup(group.id).filter(t => !hiddenTools.includes(t.id))
        if (tools.length === 0) return null
        return (
          <div key={group.id} style={{ borderBottom: '1px solid var(--px-border)' }}>
            <button
              onClick={() => onToggleGroup(group.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--px-text)' }}>{group.title}</span>
                  {group.pro && <span className="pdfx-pro-badge">PRO</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--px-text-3)' }}>{group.hint}</div>
              </div>
              <ChevronDown size={16} style={{ color: 'var(--px-text-3)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 180ms' }} />
            </button>
            {!collapsed && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '0 10px 12px' }}>
                {tools.map(tool => {
                  const pinned = favorites.includes(tool.id)
                  return (
                    <Tip key={tool.id} text={tool.tooltip}>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <button className="pdfx-tool" data-destructive={tool.destructive} onClick={() => onRun(tool.id)}>
                          <span className="pdfx-tool-icon"><ToolIcon name={tool.icon} size={19} /></span>
                          <span className="pdfx-tool-label">{tool.label}</span>
                          {tool.status === 'service' && <span style={{ fontSize: 9, color: 'var(--px-text-3)' }}>Dienst</span>}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onTogglePin(tool.id) }}
                          title={pinned ? 'Aus Schnellzugriff lösen' : 'An Schnellzugriff anpinnen'}
                          aria-label="Anpinnen"
                          style={{
                            position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 6,
                            border: 'none', cursor: 'pointer',
                            background: pinned ? 'var(--px-accent)' : 'transparent',
                            color: pinned ? '#fff' : 'var(--px-text-3)',
                            display: 'grid', placeItems: 'center',
                          }}
                        ><Pin size={11} /></button>
                      </div>
                    </Tip>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
