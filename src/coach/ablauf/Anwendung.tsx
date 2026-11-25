// Der Coach — Anwendungstage: Mission wählen, eine echte Situation nachbereiten („Mir fiel nichts ein“), wiederholen.
import { useEffect, useState } from 'react'
import type { KursId } from '../kern/inhaltTypen'
import { kursTeile } from '../kern/inhaltTypen'
import { indexJetzt } from '../kern/inhalt'
import { useCoach } from '../kern/speicher'
import { missionsVorschlag } from '../kern/buchung'
import { luecke } from '../kern/gehirn/schaetzung'
import { heute, tagNummer } from '../kern/zeit'
import { neuerEintrag } from '../kern/gehirn/wiederholung'
import { MissionBericht, MissionWahl } from './Mission'
import { Merkkarte } from './Merkkarte'
import { Weiter } from '../uebungen/Lesen'

export function Vorschlag({ kurs, onFertig }: { kurs: KursId; onFertig: () => void }) {
  const [id, setId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const d = useCoach.getState().daten
    const idx = indexJetzt()
    const fs = idx.bereiche.find(b => b.id === kursTeile(kurs).bereich)?.faehigkeiten.map(f => f.id) ?? []
    const kleiner = fs.some(f => luecke(d.f[f], tagNummer(heute())))
    setId(missionsVorschlag(d, idx, kurs, kleiner))
  }, [kurs])
  useEffect(() => { if (id === null) onFertig() }, [id, onFertig])
  if (!id) return null
  return <MissionWahl id={id} onFertig={onFertig} />
}

/** Treppenwitz-Plan: echte Situation notieren, drei Antworten bauen, die beste behalten (Konter-Schatz + Merkkarte) */
export function Nachbereitung({ onFertig }: { onFertig: () => void }) {
  const [lage, setLage] = useState('')
  const [antworten, setAntworten] = useState(['', '', ''])
  const [beste, setBeste] = useState<number | null>(null)
  const TECHNIK = ['Rückfrage oder übersetzen', 'Zustimmen und überzeichnen', 'Umdeuten – oder eine Grenze']
  const speichere = () => {
    if (lage.trim() && beste !== null && antworten[beste].trim()) {
      const st = useCoach.getState()
      const id = st.schreibeIns({ art: 'konter', text: antworten[beste].trim(), bezug: lage.trim() })
      st.aendere(d => ({ ...d, kasten: { ...d.kasten, [`b:${id}`]: neuerEintrag(tagNummer(heute())) } }))
    }
    onFertig()
  }
  return (
    <div className="dc-spalte dc-ein" data-dc-nachbereitung>
      <span className="dc-ober">Nachbereitung · Aus dem Treppenwitz wird Vorrat</span>
      <label className="dc-spalte" style={{ gap: 4 }}><b>Eine echte Situation, in der dir nichts einfiel</b><textarea className="dc-eingabe" rows={2} value={lage} onChange={e => setLage(e.target.value)} placeholder="Wer hat was gesagt?" autoFocus /></label>
      {TECHNIK.map((t, i) => (
        <label key={i} className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>Antwort {i + 1}</b> <span className="dc-stumm">– {t}</span></span>
          <div className="dc-reihe" style={{ flexWrap: 'nowrap' }}><input className="dc-eingabe" value={antworten[i]} onChange={e => setAntworten(a => a.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: beste === i ? 'var(--dc-gelb)' : undefined }} aria-pressed={beste === i} onClick={() => setBeste(i)}>{beste === i ? '★ die beste' : 'die beste?'}</button></div></label>
      ))}
      <p className="dc-klein dc-leise" style={{ margin: 0 }}>Die beste Antwort kommt in deinen Konter-Schatz und als Merkkarte zurück – die Lagen wiederholen sich.</p>
      <Weiter text={lage.trim() ? 'Behalten' : 'Heute keine Situation'} onClick={speichere} />
    </div>
  )
}

export function Anwendungstag({ modus, kurs, onFertig }: { modus: string; kurs: KursId; onFertig: () => void }) {
  const [teil, setTeil] = useState(0)
  const offen = useCoach(s => s.daten.missionen.offen.filter(m => m.gewaehlt < tagNummer(heute())))
  const karten = useCoach(s => Object.keys(s.daten.kasten).filter(k => k.startsWith(`m:${kursTeile(kurs).bereich}-`)).slice(0, 3))
  if (modus === 'nachbereitung') return <Nachbereitung onFertig={onFertig} />
  if (modus === 'wiederholung') {
    if (teil < karten.length) return <Merkkarte key={teil} ref_={karten[teil]} onFertig={() => setTeil(t => t + 1)} />
    return <Nachbereitung onFertig={onFertig} />
  }
  // mission: offene erst berichten, dann eine neue wählen
  if (teil < offen.length) return <MissionBericht key={offen[teil].id} id={offen[teil].id} onFertig={() => setTeil(t => t + 1)} />
  return <Vorschlag kurs={kurs} onFertig={onFertig} />
}
