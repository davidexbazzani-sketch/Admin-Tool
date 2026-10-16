// ── Farbmarkierung einer Tabellenzeile (wie „Füllfarbe" in Excel) ───────────
// Der Punkt in der Zeile öffnet eine kleine Palette. Wie beim Kopfzeilen-Filter hängt
// das Aufklappmenü in einem Portal, weil die Tabelle in einem Container mit
// `overflow-auto` steckt und sonst abgeschnitten würde.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { FARBEN, farbe, type FarbId } from '../../services/durchwahlAnsicht'

interface Props {
  aktuell: FarbId | ''
  onWahl: (f: FarbId | null) => void
  /** Steht im Aufklappmenü als Überschrift, damit klar ist, welche Zeile gemeint ist. */
  titel: string
}

export default function FarbWahl({ aktuell, onWahl, titel }: Props) {
  const [offen, setOffen] = useState(false)
  const knopfRef = useRef<HTMLButtonElement>(null)
  const menueRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const platziere = useCallback(() => {
    const r = knopfRef.current?.getBoundingClientRect()
    if (!r) return
    const BREITE = 170, HOEHE = 240
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - BREITE - 8)),
      top: window.innerHeight - r.bottom < HOEHE ? Math.max(8, r.top - HOEHE) : r.bottom + 4,
    })
  }, [])

  useLayoutEffect(() => { if (offen) platziere() }, [offen, platziere])

  useEffect(() => {
    if (!offen) return
    function aussen(e: MouseEvent) {
      const z = e.target as Node
      if (!knopfRef.current?.contains(z) && !menueRef.current?.contains(z)) setOffen(false)
    }
    function taste(e: KeyboardEvent) { if (e.key === 'Escape') setOffen(false) }
    document.addEventListener('mousedown', aussen)
    document.addEventListener('keydown', taste)
    window.addEventListener('scroll', platziere, true)
    window.addEventListener('resize', platziere)
    return () => {
      document.removeEventListener('mousedown', aussen)
      document.removeEventListener('keydown', taste)
      window.removeEventListener('scroll', platziere, true)
      window.removeEventListener('resize', platziere)
    }
  }, [offen, platziere])

  const f = farbe(aktuell)

  function waehle(id: FarbId | null) { onWahl(id); setOffen(false) }

  return (
    <>
      <button ref={knopfRef} type="button" onClick={() => setOffen(o => !o)}
        title={f ? `Markierung: ${f.name} — zum Ändern klicken` : 'Zeile farbig markieren'}
        className={`w-4 h-4 rounded-full border shrink-0 ${
          f ? `${f.punkt} border-transparent` : 'border-border hover:border-foreground/60'
        }`} />

      {offen && pos && createPortal(
        <div ref={menueRef} style={{ left: pos.left, top: pos.top, width: 170 }}
          className="fixed z-[200] rounded-lg border border-border bg-card shadow-2xl text-xs py-1">
          <p className="px-2.5 py-1 text-[10px] text-muted-foreground truncate" title={titel}>{titel}</p>
          {FARBEN.map(x => (
            <button key={x.id} onClick={() => waehle(x.id)}
              className="flex w-full items-center gap-2 px-2.5 py-1 text-left hover:bg-accent/40">
              <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${x.punkt}`} />
              <span className="text-foreground">{x.name}</span>
              {aktuell === x.id && <Check size={11} className="ml-auto text-foreground" />}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button onClick={() => waehle(null)} disabled={!aktuell}
            className="flex w-full items-center gap-2 px-2.5 py-1 text-left hover:bg-accent/40 disabled:opacity-40 disabled:hover:bg-transparent">
            <span className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
            <span className="text-foreground">Markierung entfernen</span>
          </button>
        </div>,
        document.body)}
    </>
  )
}
