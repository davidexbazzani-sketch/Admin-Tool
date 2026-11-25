// Der Coach — Anwenden und sich selbst einschätzen: Wenn-Dann-Plan, Selbsteinschätzung, Sammeln, Zähler, Tagesexperiment.
import { useState } from 'react'
import type { Schritt } from '../kern/inhaltTypen'
import { T } from '../ansicht/hilfen'
import type { BausteinProps } from './typen'
import { Weiter } from './Lesen'

export function Wenndann({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'wenndann' }>>) {
  const [wenn, setWenn] = useState(s.wenn[0] ?? '')
  const [dann, setDann] = useState(s.dann[0] ?? '')
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="wenndann">
      <span className="dc-ober">Wenn-Dann-Plan</span>
      <p style={{ margin: 0, fontWeight: 600 }}>{s.anlass}</p>
      <p className="dc-klein dc-leise" style={{ margin: 0 }}>Ein fester Auslöser nimmt dem Willen die Arbeit ab. Wähl einen Vorschlag oder schreib deinen eigenen.</p>
      <label className="dc-spalte" style={{ gap: 4 }}><b>Wenn …</b><input className="dc-eingabe" value={wenn} onChange={e => setWenn(e.target.value)} list="dc-wenn" data-dc-wenn /></label>
      <datalist id="dc-wenn">{s.wenn.map(w => <option key={w} value={w} />)}</datalist>
      <label className="dc-spalte" style={{ gap: 4 }}><b>… dann</b><input className="dc-eingabe" value={dann} onChange={e => setDann(e.target.value)} list="dc-dann" data-dc-dann /></label>
      <datalist id="dc-dann">{s.dann.map(w => <option key={w} value={w} />)}</datalist>
      <Weiter text="Plan merken" onClick={() => onFertig(wenn.trim() && dann.trim() ? { buch: { art: 'plan', text: `Wenn ${wenn.trim()}, dann ${dann.trim()}` } } : {})} />
    </div>
  )
}

const STUFEN = ['trifft nicht zu', 'eher nicht', 'teils', 'eher ja', 'trifft zu']
export function Selbstbild({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'selbstbild' }>>) {
  const [werte, setWerte] = useState<Record<string, number>>({})
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="selbstbild">
      <span className="dc-ober">Selbsteinschätzung</span>
      {s.aussagen.map(a => (
        <div key={a.id} className="dc-spalte" style={{ gap: 6 }}>
          <span>{a.text}</span>
          <div className="dc-reihe" style={{ gap: 4 }}>{STUFEN.map((x, i) => <button key={i} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: werte[a.id] === i ? 'var(--dc-gelb)' : undefined, color: werte[a.id] === i ? 'var(--dc-ink)' : undefined }} aria-pressed={werte[a.id] === i} onClick={() => setWerte(w => ({ ...w, [a.id]: i }))}>{x}</button>)}</div>
        </div>
      ))}
      <Weiter onClick={() => onFertig({})} />
    </div>
  )
}

export function Sammeln({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'sammeln' }>>) {
  const [text, setText] = useState('')
  const zeilen = text.split('\n').map(x => x.trim()).filter(Boolean)
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="sammeln">
      <span className="dc-ober">Sammeln</span>
      <p style={{ margin: 0, fontWeight: 600 }}><T t={s.auftrag} /></p>
      <textarea className="dc-eingabe" rows={5} value={text} onChange={e => setText(e.target.value)} placeholder="Eins pro Zeile" autoFocus />
      <span className="dc-klein dc-stumm">{zeilen.length} von mindestens {s.mindestens}</span>
      <Weiter text={zeilen.length ? 'Ins Buch' : 'Später'} onClick={() => onFertig(zeilen.length ? { buch: { art: s.ziel === 'geschichten' ? 'geschichte' : s.ziel === 'wortliste' ? 'wortliste' : 'satz', text: zeilen.join('\n') } } : {})} />
    </div>
  )
}

export function Zaehler({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'zaehler' }>>) {
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="zaehler">
      <span className="dc-ober">Zähler: {s.name}</span>
      <p style={{ margin: 0 }}>{s.auftrag}</p>
      <p className="dc-klein dc-leise" style={{ margin: 0 }}>Der Zähler steht {s.tage} Tage lang auf „Heute“ – ein Klick am Abend genügt. Sich selbst beobachten verändert schon.</p>
      <Weiter text="Zähler einrichten" onClick={() => onFertig({ buch: { art: 'plan', text: `Zähler „${s.name}“ für ${s.tage} Tage` }, zaehler: { name: s.name, tage: s.tage } })} />
    </div>
  )
}

export function Experiment({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'experiment' }>>) {
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="experiment">
      <span className="dc-ober">Experiment für {s.dauer === 'heute' ? 'heute' : 'diese Woche'}</span>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}><T t={s.auftrag} /></p>
      <p className="dc-klein dc-leise" style={{ margin: 0 }}>Bruno fragt beim nächsten Training: {s.nachfrage}</p>
      <Weiter text="Ich probier's" onClick={() => onFertig({ buch: { art: 'plan', text: `Experiment: ${s.auftrag}` } })} />
    </div>
  )
}
