// ── PIN-Sperre (0506): gemeinsamer Baustein ─────────────────────────────────────
// `mitPin(aktion)` führt die Aktion sofort aus, wenn schon entsperrt — sonst erst nach der PIN.
// Entsperrt bleibt es für den Besuch des Bildschirms (bis die Komponente verschwindet).
// Eigene Datei ohne weitere Abhängigkeiten, damit jeder Bildschirm sie nutzen kann
// (zugang.tsx der Netzwerkgeräte bindet Zugangsdaten ein und soll nicht überall mitgeladen werden).
import { useState } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'

export const TOOL_PIN = '0506'

export function usePinSperre(hinweis = 'Für geschützte Einstellungen.') {
  const [entsperrt, setEntsperrt] = useState(false)
  const [wartend, setWartend] = useState<null | (() => void)>(null)
  const [pin, setPin] = useState('')
  const [fehler, setFehler] = useState(false)

  function mitPin(aktion: () => void) {
    if (entsperrt) { aktion(); return }
    setPin(''); setFehler(false); setWartend(() => aktion)
  }
  function pruefen() {
    if (pin.trim() !== TOOL_PIN) { setFehler(true); return }
    setEntsperrt(true)
    const a = wartend; setWartend(null)
    a?.()
  }

  const pinDialog = wartend && (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-6" onClick={() => setWartend(null)} data-pin-dialog>
      <div className="bg-card border border-border rounded-xl shadow-2xl p-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1"><Lock size={16} className="text-blue-400" /><h3 className="text-sm font-semibold text-foreground">PIN eingeben</h3></div>
        <p className="text-xs text-muted-foreground mb-3">{hinweis}</p>
        <input value={pin} onChange={e => { setPin(e.target.value); setFehler(false) }} autoFocus type="password" inputMode="numeric" data-pin-feld
          onKeyDown={e => { if (e.key === 'Enter') pruefen() }}
          className="w-full px-3 py-2 text-center tracking-[0.4em] text-lg rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
        {fehler && <p className="mt-2 text-xs text-red-300 flex items-center gap-1" data-pin-falsch><AlertTriangle size={13} />PIN falsch.</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={() => setWartend(null)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
          <button onClick={pruefen} disabled={!pin} data-pin-weiter className="ml-auto px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Weiter</button>
        </div>
      </div>
    </div>
  )

  return { entsperrt, mitPin, pinDialog }
}
