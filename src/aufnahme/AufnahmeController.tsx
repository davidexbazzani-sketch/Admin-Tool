// ── Präsentiermodus im Hauptfenster: Dialoge + Rückmeldung der Aufnahme-Leiste ──
import { lazy, Suspense, useEffect } from 'react'
import { useAufnahmeStore } from './aufnahmeStore'
import type { AufnahmeErgebnis } from './typen'

// Erst laden, wenn gebraucht (Performance-Regel)
const StartDialog = lazy(() => import('./StartDialog'))
const FertigDialog = lazy(() => import('./FertigDialog'))

export default function AufnahmeController() {
  const phase = useAufnahmeStore(s => s.phase)
  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { aufnahme?: { beiFertig(cb: (e: AufnahmeErgebnis | null) => void): () => void } } }).electronAPI?.aufnahme
    if (!api) return
    const st = useAufnahmeStore.getState()
    st.setBereit(true)
    const aus = api.beiFertig(e => useAufnahmeStore.getState().fertig(e && e.bildschirm ? e : null))
    return () => { aus(); useAufnahmeStore.getState().setBereit(false) }
  }, [])
  if (phase === 'start') return <Suspense fallback={null}><StartDialog /></Suspense>
  if (phase === 'fertig') return <Suspense fallback={null}><FertigDialog /></Suspense>
  return null
}
