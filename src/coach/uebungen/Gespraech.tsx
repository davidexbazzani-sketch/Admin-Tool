// Der Coach — Gespräch mit Verzweigung (kurz als Schritt „dialog“, lang als Lage oder Sparring).
// Jede Wahl hat Folgen; am Ende wertet der Coach nach Prinzipien aus, nicht nach Punkten.
import { useMemo, useState } from 'react'
import type { Gespraech as GespraechT, Lage } from '../kern/inhaltTypen'
import { rng } from '../kern/zufall'
import { mitName, useName } from '../ansicht/hilfen'
import type { Ergebnis } from './typen'
import { Weiter } from './Lesen'

interface Schritt { knoten: string; wahl: number; wert: number; rueck: string; text: string }

export function GespraechSpieler({ g, lage, onFertig }: { g: GespraechT; lage?: Lage; onFertig: (e: Ergebnis) => void }) {
  const name = useName()
  const ids = useMemo(() => new Map(g.knoten.map(k => [k.id, k])), [g])
  const [weg, setWeg] = useState<Schritt[]>([])
  const [jetzt, setJetzt] = useState(g.start)
  const [transfer, setTransfer] = useState('')
  const k = ids.get(jetzt)
  const ende = k?.ende !== undefined
  const ordnung = useMemo(() => rng(`${g.titel}|${jetzt}`).misch((k?.wahl ?? []).map((w, i) => ({ ...w, i }))), [g, jetzt, k])
  const waehle = (i: number) => {
    const w = k!.wahl![i]
    setWeg(x => [...x, { knoten: jetzt, wahl: i, wert: w.wert, rueck: w.rueck, text: w.text }])
    setJetzt(w.weiter)
  }
  const schnitt = weg.length ? weg.reduce((s, x) => s + x.wert, 0) / (weg.length * 2) : 0
  const tendenzen = weg.map(w => ids.get(w.knoten)?.wahl?.[w.wahl]?.tendenz).filter((x): x is string => !!x)
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="gespraech">
      <span className="dc-ober">{lage?.sparring ? 'Sparring' : lage ? 'Lage' : 'Gespräch'} · {g.titel}</span>
      {lage && weg.length === 0 && <p className="dc-leise" style={{ margin: 0 }}>{lage.einleitung}</p>}
      <p className="dc-karte-flach" style={{ margin: 0 }}>{g.lage}</p>
      {weg.map((x, i) => (
        <div key={i} className="dc-spalte" style={{ gap: 6 }}>
          <div className="dc-leise">{mitName(ids.get(x.knoten)?.sagt ?? '', name)}</div>
          <div className="dc-karte-flach" style={{ alignSelf: 'flex-end', maxWidth: '85%', borderColor: 'var(--dc-rot)' }}>{mitName(x.text, name)}</div>
          <div className="dc-rueck dc-klein" data-gut={x.wert === 2 ? '1' : undefined} data-schlecht={x.wert === 0 ? '1' : undefined}>{x.wert === 2 ? '✓ ' : x.wert === 1 ? '~ ' : '✗ '}{x.rueck}</div>
        </div>
      ))}
      {k && !ende && (
        <div className="dc-spalte dc-ein" key={jetzt} style={{ gap: 8 }}>
          {k.sagt && <div className="dc-gross" style={{ fontWeight: 600 }}>{mitName(k.sagt, name)}</div>}
          {ordnung.map(w => <button key={w.i} type="button" className="dc-wahl" onClick={() => waehle(w.i)} data-dc-wahl={w.wert}>{mitName(w.text, name)}</button>)}
        </div>
      )}
      {k && ende && <>
        <div className="dc-leise">{k.sagt}</div>
        <div className="dc-karte" style={{ borderColor: 'var(--dc-gelb)' }}>
          <div className="dc-h3" style={{ marginBottom: 6 }}>Auswertung</div>
          <p style={{ margin: 0 }}>{k.ende}</p>
          <div className="dc-klein dc-leise" style={{ marginTop: 8 }}>Worauf es ankam: {g.prinzipien.join(' · ')}</div>
          <div className="dc-klein dc-stumm" style={{ marginTop: 4 }}>{weg.filter(w => w.wert === 2).length} von {weg.length} Entscheidungen stark.</div>
        </div>
        {lage?.transfer && <label className="dc-spalte" style={{ gap: 4 }}><span style={{ fontWeight: 600 }}>{lage.transfer}</span><textarea className="dc-eingabe" rows={2} value={transfer} onChange={e => setTransfer(e.target.value)} placeholder="Ein Satz für dich (freiwillig)" /></label>}
        <Weiter onClick={() => onFertig({ wert: schnitt, tendenzen: [...new Set(g.knoten.flatMap(x => (x.wahl ?? []).map(w => w.tendenz)).filter((x): x is string => !!x))], gewaehlt: tendenzen[0], buch: transfer.trim() ? { art: 'reflexion', text: `${g.titel}: ${transfer.trim()}` } : undefined })} />
      </>}
    </div>
  )
}
