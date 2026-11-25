// Der Coach — Merkkarte: Frage zeigen, selbst abrufen, aufdecken, ehrlich bewerten (Abrufen schlägt Wiederlesen).
import { useEffect, useState } from 'react'
import { ladeMerkkarte } from '../kern/inhalt'
import { useCoach } from '../kern/speicher'
import { bucheMerkkarte } from '../kern/buchung'
import { heute } from '../kern/zeit'
import { Laedt, T } from '../ansicht/hilfen'

export function Merkkarte({ ref_, onFertig }: { ref_: string; onFertig: () => void }) {
  const [k, setK] = useState<{ frage: string; antwort: string; einheit: string } | null | undefined>(undefined)
  const [offen, setOffen] = useState(false)
  const buch = useCoach(s => s.buch)
  useEffect(() => {
    if (ref_.startsWith('m:')) void ladeMerkkarte(ref_.slice(2)).then(setK)
    else { const e = buch.eintraege.find(x => `b:${x.id}` === ref_); setK(e ? { frage: e.bezug ?? 'Aus deinem Buch', antwort: e.text, einheit: 'Dein Buch' } : null) }
  }, [ref_, buch])
  useEffect(() => { if (k === null) onFertig() }, [k, onFertig])
  if (k === undefined) return <Laedt />
  if (!k) return null
  const bewerte = (richtig: boolean) => { useCoach.getState().aendere(d => bucheMerkkarte(d, ref_, richtig, heute())); onFertig() }
  return (
    <div className="dc-spalte dc-ein" data-dc-merkkarte={ref_}>
      <span className="dc-ober">Merkkarte · {k.einheit}</span>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}><T t={k.frage} /></p>
      {!offen ? <><p className="dc-klein dc-leise" style={{ margin: 0 }}>Erst selbst antworten – im Kopf oder halblaut. Dann aufdecken.</p>
        <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf" onClick={() => setOffen(true)} autoFocus data-dc-aufdecken>Aufdecken</button></div></>
        : <>
          <div className="dc-karte-flach dc-ein" style={{ borderColor: 'var(--dc-gelb)' }}><T t={k.antwort} /></div>
          <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => bewerte(false)} data-dc-nochnicht>Noch nicht</button>
            <button type="button" className="dc-knopf" onClick={() => bewerte(true)} autoFocus data-dc-gewusst>Gewusst</button>
          </div>
        </>}
    </div>
  )
}
