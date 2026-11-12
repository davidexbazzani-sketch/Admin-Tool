// ── Knopf „Aufnahme“ in der Titelleiste (neben dem Chat) ─────────────────────
import { Video } from 'lucide-react'
import { useAufnahmeStore } from './aufnahmeStore'

export default function AufnahmeKnopf() {
  const bereit = useAufnahmeStore(s => s.bereit)
  const phase = useAufnahmeStore(s => s.phase)
  const oeffneStart = useAufnahmeStore(s => s.oeffneStart)
  if (!bereit) return null   // nur im angemeldeten Hauptfenster (Controller gemountet)
  const laeuft = phase === 'laeuft'
  return (
    <button onClick={oeffneStart} disabled={phase !== 'aus'} data-aufnahme-knopf
      title={laeuft ? 'Aufnahme läuft – beenden über die Leiste oben (oder Strg+Umschalt+F10)' : 'Bildschirm aufnehmen (Erklärvideo) – mit Mikrofon, Kamera und Mauseffekten'}
      className={`relative h-7 px-2 mr-0.5 flex items-center gap-1.5 rounded text-[11px] transition-colors ${laeuft ? 'bg-red-600 text-white' : phase !== 'aus' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}>
      {laeuft ? <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> : <Video size={14} />}
      <span className="font-medium">{laeuft ? 'Aufnahme läuft' : 'Aufnahme'}</span>
    </button>
  )
}
