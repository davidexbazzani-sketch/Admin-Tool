// ── PDF-Werkzeuge: Onboarding (Erststart) ────────────────────────────────────
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ONBOARDING_TASKS, ROLE_PRESETS } from '../config'

interface Props {
  onDone: (taskIds: string[]) => void
  onSkip: () => void
}

export default function Onboarding({ onDone, onSkip }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function applyPreset(taskIds: string[]) {
    setSelected(new Set(taskIds))
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="pdfx-card pdfx-fade-in" style={{ width: '100%', maxWidth: 640, padding: 28, boxShadow: 'var(--px-shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'var(--px-accent-soft)', color: 'var(--px-accent)' }}>
            <Sparkles size={22} />
          </span>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Willkommen bei den PDF-Werkzeugen</h2>
        </div>
        <p style={{ color: 'var(--px-text-2)', fontSize: 14, marginBottom: 20 }}>
          Was machst du am häufigsten mit PDFs? Wir legen dir die passenden Werkzeuge oben in den Schnellzugriff.
        </p>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--px-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Aufgaben</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
          {ONBOARDING_TASKS.map(t => (
            <button key={t.id} className="pdfx-chip" data-selected={selected.has(t.id)} onClick={() => toggle(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--px-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
          Oder eine Rolle wählen (setzt eine sinnvolle Vorauswahl)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
          {ROLE_PRESETS.map(r => (
            <button key={r.id} className="pdfx-btn" onClick={() => applyPreset(r.tasks)}>{r.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="pdfx-btn" onClick={onSkip}>Überspringen</button>
          <button className="pdfx-btn pdfx-btn-primary" onClick={() => onDone(Array.from(selected))}>
            Los geht's
          </button>
        </div>
      </div>
    </div>
  )
}
