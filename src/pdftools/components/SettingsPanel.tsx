// ── PDF-Werkzeuge: Modul-Einstellungen ───────────────────────────────────────
import { Eye, EyeOff, Pin, RotateCcw, Sparkles, Moon, Sun } from 'lucide-react'
import { PDF_GROUPS, toolsByGroup } from '../config'
import { usePdfToolsStore } from '../store/usePdfToolsStore'
import { Modal, ToolIcon } from './ui'

export default function SettingsPanel({ onClose, onRestartOnboarding }: { onClose: () => void; onRestartOnboarding: () => void }) {
  const favorites = usePdfToolsStore(s => s.favorites)
  const hidden = usePdfToolsStore(s => s.hiddenTools)
  const darkMode = usePdfToolsStore(s => s.darkMode)
  const pinTool = usePdfToolsStore(s => s.pinTool)
  const unpinTool = usePdfToolsStore(s => s.unpinTool)
  const toggleHidden = usePdfToolsStore(s => s.toggleHidden)
  const resetPersonalization = usePdfToolsStore(s => s.resetPersonalization)
  const setDarkMode = usePdfToolsStore(s => s.setDarkMode)

  return (
    <Modal
      title="Einstellungen"
      onClose={onClose}
      wide
      footer={<button className="pdfx-btn pdfx-btn-primary" onClick={onClose}>Fertig</button>}
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <button className="pdfx-btn" onClick={onRestartOnboarding}><Sparkles size={15} />Onboarding erneut starten</button>
        <button className="pdfx-btn" onClick={resetPersonalization}><RotateCcw size={15} />Auf Standard zurücksetzen</button>
        <button className="pdfx-btn" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}{darkMode ? 'Heller Modus' : 'Dunkler Modus'}
        </button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 14 }}>
        Lege fest, welche Werkzeuge sichtbar sind und welche im Schnellzugriff erscheinen.
      </p>

      {PDF_GROUPS.map(group => (
        <div key={group.id} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--px-text-2)', marginBottom: 8 }}>{group.title}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {toolsByGroup(group.id).map(tool => {
              const isHidden = hidden.includes(tool.id)
              const isPinned = favorites.includes(tool.id)
              return (
                <div key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 'var(--px-radius-sm)', background: 'var(--px-surface-2)', border: '1px solid var(--px-border)' }}>
                  <span style={{ color: 'var(--px-accent)' }}><ToolIcon name={tool.icon} size={17} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {tool.label}{tool.pro && <span className="pdfx-pro-badge">PRO</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--px-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.tooltip}</div>
                  </div>
                  <button
                    className="pdfx-btn" style={{ padding: 6 }}
                    onClick={() => isPinned ? unpinTool(tool.id) : pinTool(tool.id)}
                    title={isPinned ? 'Aus Schnellzugriff lösen' : 'An Schnellzugriff anpinnen'}
                  >
                    <Pin size={14} color={isPinned ? 'var(--px-accent)' : 'var(--px-text-3)'} />
                  </button>
                  <button
                    className="pdfx-btn" style={{ padding: 6 }}
                    onClick={() => toggleHidden(tool.id)}
                    title={isHidden ? 'Einblenden' : 'Ausblenden'}
                  >
                    {isHidden ? <EyeOff size={14} color="var(--px-text-3)" /> : <Eye size={14} />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </Modal>
  )
}
