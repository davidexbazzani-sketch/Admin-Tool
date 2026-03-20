import { useState } from 'react'
import { X, FlaskConical } from 'lucide-react'

interface Props {
  betaMode: boolean
}

export default function BetaBanner({ betaMode }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (!betaMode || dismissed) return null

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400">
      <FlaskConical size={13} className="shrink-0" />
      <p className="text-[11px] flex-1">
        <span className="font-semibold">BETA</span>
        {' '}— Dieses Tool befindet sich noch in der Entwicklung. Fehler können auftreten. Bitte nutze den Bug-Meldungs-Button für Rückmeldungen.
      </p>
      <button onClick={() => setDismissed(true)}
        className="p-0.5 rounded hover:bg-amber-500/20 transition-colors">
        <X size={12} />
      </button>
    </div>
  )
}
