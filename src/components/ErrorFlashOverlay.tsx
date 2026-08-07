import { useAppStore } from '../store/appStore'
import { AlertOctagon } from 'lucide-react'

/**
 * Vollbild-Overlay, das die ganze App rot blinken lässt, solange
 * errorFlashActive im AppStore true ist. Das Overlay reagiert auf KEINE
 * Maus-Events (pointer-events: none) — der Benutzer kann normal weiter
 * tippen und das auslösende Eingabefeld leeren. Erst dann wird der Flag
 * von der zuständigen Komponente wieder auf false gesetzt.
 */
export default function ErrorFlashOverlay() {
  const active = useAppStore(s => s.errorFlashActive)
  const message = useAppStore(s => s.errorFlashMessage)
  if (!active) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      <div className="absolute inset-0 error-flash-bg" />
      <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md bg-red-700 text-white font-semibold text-sm shadow-2xl error-flash-pill inline-flex items-center gap-2">
        <AlertOctagon size={16} />
        {message || 'Falsche Eingabe — bitte korrigieren'}
      </div>
      <style>{`
        @keyframes error-flash-anim {
          0%, 100% { background-color: rgba(220, 38, 38, 0.0); }
          50%      { background-color: rgba(220, 38, 38, 0.55); }
        }
        .error-flash-bg { animation: error-flash-anim 0.6s ease-in-out infinite; }
        @keyframes error-flash-pill-anim {
          0%, 100% { transform: translate(-50%, 0) scale(1); }
          50%      { transform: translate(-50%, 0) scale(1.07); }
        }
        .error-flash-pill { animation: error-flash-pill-anim 0.6s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
