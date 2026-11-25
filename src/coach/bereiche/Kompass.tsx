// Der Coach — Kompass (Stufe 2): die Werkstatt für Lebensziele, auch für Menschen, die noch keine haben.
// Sieben Stationen über Tage verteilt (je 5–15 Minuten), danach Ziel-Pyramide, Wochen-Check, Hindernis-Plan und Rückblick
// alle drei Monate. Texte liegen im verschlüsselten Buch; nichts davon verlässt diesen PC.
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Circle, Compass as KompassSymbol, Flag, RotateCcw } from 'lucide-react'
import type { Leben } from '../kern/inhaltTypen'
import type { Ziel } from '../kern/typen'
import { useCoach } from '../kern/speicher'
import { ladeLeben } from '../kern/inhalt'
import { naechsteStation, rueckblickFaellig, wochenCheckFaellig } from '../kern/leben'
import { heute, tagNummer } from '../kern/zeit'
import { Bruno, Laedt, Raumbild } from '../ansicht/hilfen'
import { Folge } from '../ablauf/Folge'
import { Rad } from '../uebungen/Werkzeuge'
import { Weiter } from '../uebungen/Lesen'

type Sicht = { art: 'start' } | { art: 'station'; id: string } | { art: 'ziel' } | { art: 'check'; id: string } | { art: 'rueckblick' }
const neueId = () => `ziel-${Date.now().toString(36)}`

export function Kompass() {
  const [leben, setLeben] = useState<Leben | null>(null)
  const [sicht, setSicht] = useState<Sicht>({ art: 'start' })
  const ohneUhr = useCoach(s => s.daten.profil.ohneZeitdruck)
  useEffect(() => { void ladeLeben().then(setLeben) }, [])
  if (!leben) return <Laedt />
  const zurueck = () => { setSicht({ art: 'start' }); void useCoach.getState().sichere() }
  if (sicht.art === 'station') {
    const st = leben.kompass.stationen.find(x => x.id === sicht.id)
    if (!st) return null
    return <Folge titel={`Kompass · ${st.titel}`} schritte={st.schritte} ohneUhr={ohneUhr} onFertig={() => {
      useCoach.getState().aendere(d => ({ ...d, kompass: { ...d.kompass, stationen: { ...d.kompass.stationen, [st.id]: tagNummer(heute()) } } }))
      setSicht(st.nr === 7 ? { art: 'ziel' } : { art: 'start' }); void useCoach.getState().sichere()
    }} />
  }
  if (sicht.art === 'ziel') return <ZielBau leben={leben} onFertig={zurueck} />
  if (sicht.art === 'check') return <WochenCheck leben={leben} id={sicht.id} onFertig={zurueck} />
  if (sicht.art === 'rueckblick') return <Rueckblick leben={leben} onFertig={zurueck} />
  return <Uebersicht leben={leben} onSicht={setSicht} />
}

function Uebersicht({ leben, onSicht }: { leben: Leben; onSicht: (s: Sicht) => void }) {
  const d = useCoach(s => s.daten)
  const tag = heute()
  const naechste = naechsteStation(d, leben)
  const faellig = wochenCheckFaellig(d, tag)
  const rueck = rueckblickFaellig(d, tag)
  const rad = useMemo(() => Object.fromEntries(Object.entries(d.kompass.lebensrad).map(([k, v]) => [k, v[v.length - 1]?.[1] ?? 0])), [d.kompass.lebensrad])
  const stationen = [...leben.kompass.stationen].sort((a, b) => a.nr - b.nr)
  const offeneZiele = d.kompass.ziele.filter(z => !z.erledigt)
  return (
    <div className="dc-breit dc-spalte" data-dc-kompass>
      <div><span className="dc-ober">Lebensziele</span><h1 className="dc-h1">Kompass</h1></div>
      <Raumbild name="ecke" hoehe={120} position="center 30%" />
      <Bruno gross haltung={naechste ? 'zuhoerend' : 'anerkennend'} text={naechste ? 'Kein Formular, sondern ein Weg in sieben Stationen. Eine pro Tag reicht. Ziele darf man auch erst unterwegs finden.' : offeneZiele.length ? 'Deine Ziele stehen. Jetzt zählt der kleinste Schritt – heute.' : 'Alle Stationen geschafft. Bau dir mit der Ziel-Pyramide ein erstes Ziel.'} />
      {rueck && <button type="button" className="dc-wahl" data-an="1" onClick={() => onSicht({ art: 'rueckblick' })} data-dc-rueckblick><span className="dc-zeichen"><RotateCcw size={16} /></span><span><b>Rückblick fällig</b><span className="dc-klein dc-leise" style={{ display: 'block' }}>Alle drei Monate: Was ist passiert, was bleibt, was ändert sich?</span></span></button>}
      <div className="dc-spalte" style={{ gap: 6 }}>
        <span className="dc-ober">Sieben Stationen</span>
        {stationen.map(st => {
          const fertig = d.kompass.stationen[st.id] !== undefined
          return (
            <button key={st.id} type="button" className="dc-wahl" onClick={() => onSicht({ art: 'station', id: st.id })} data-an={st.id === naechste ? '1' : undefined} data-dc-station={st.nr}>
              <span className="dc-zeichen">{fertig ? <CheckCircle2 size={16} style={{ color: 'var(--dc-gut)' }} /> : <Circle size={16} />}</span>
              <span style={{ flex: 1 }}><b>{st.nr}. {st.titel}</b> <span className="dc-klein dc-stumm">· {st.minuten} Min.</span><span className="dc-klein dc-leise" style={{ display: 'block' }}>{st.kurz}</span></span>
            </button>
          )
        })}
      </div>
      {(Object.keys(rad).length > 0 || d.kompass.werte.length > 0) && (
        <div className="dc-karte-flach dc-reihe" style={{ alignItems: 'flex-start', gap: 20 }}>
          {Object.keys(rad).length > 0 && <Rad bereiche={leben.kompass.lebensrad} werte={rad} groesse={150} />}
          {d.kompass.werte.length > 0 && <div className="dc-spalte" style={{ gap: 4 }}><span className="dc-ober">Deine Werte</span>{d.kompass.werte.map((w, i) => <span key={w}><b className="dc-zahl">{i + 1}.</b> {w}</span>)}</div>}
        </div>
      )}
      <div className="dc-spalte" style={{ gap: 6 }}>
        <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><span className="dc-ober">Deine Ziele</span><button type="button" className="dc-knopf dc-knopf-leise" onClick={() => onSicht({ art: 'ziel' })} data-dc-ziel-neu><Flag size={14} />Neues Ziel</button></div>
        {!d.kompass.ziele.length && <span className="dc-klein dc-leise">Noch keins – und das ist in Ordnung. Die Stationen helfen, eins zu finden.</span>}
        {d.kompass.ziele.map(z => <ZielKarte key={z.id} z={z} faellig={faellig.includes(z.id)} onCheck={() => onSicht({ art: 'check', id: z.id })} />)}
      </div>
    </div>
  )
}

function ZielKarte({ z, faellig, onCheck }: { z: Ziel; faellig: boolean; onCheck: () => void }) {
  const fertig = () => useCoach.getState().aendere(d => ({ ...d, kompass: { ...d.kompass, ziele: d.kompass.ziele.map(x => (x.id === z.id ? { ...x, erledigt: x.erledigt ? undefined : tagNummer(heute()) } : x)) } }))
  return (
    <div className="dc-karte-flach dc-spalte" style={{ gap: 4, opacity: z.erledigt ? 0.65 : 1 }} data-dc-ziel={z.id}>
      <b><KompassSymbol size={14} style={{ verticalAlign: -2 }} /> {z.lebensziel}</b>
      <span className="dc-klein">90 Tage: {z.neunzig} · diese Woche: {z.woche}</span>
      <span className="dc-klein dc-leise">Heute in zwei Minuten: <b>{z.heute}</b></span>
      {z.plan && <span className="dc-klein dc-stumm">Hindernis-Plan: {z.plan}</span>}
      <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="dc-knopf dc-knopf-nackt" onClick={fertig}>{z.erledigt ? 'wieder öffnen' : 'erreicht'}</button>
        {!z.erledigt && <button type="button" className={faellig ? 'dc-knopf' : 'dc-knopf dc-knopf-leise'} onClick={onCheck} data-dc-wochencheck>Wochen-Check{faellig ? ' fällig' : ''}</button>}
      </div>
    </div>
  )
}

function ZielBau({ leben, onFertig }: { leben: Leben; onFertig: () => void }) {
  const p = leben.kompass.pyramide
  const [w, setW] = useState<Record<string, string>>({})
  const [hindernis, setHindernis] = useState('')
  const [plan, setPlan] = useState('')
  const [geprueft, setGeprueft] = useState<Set<number>>(new Set())
  const ok = (w.lebensziel ?? '').trim() && (w.heute ?? '').trim()
  const speichere = () => {
    const z: Ziel = { id: neueId(), lebensziel: (w.lebensziel ?? '').trim(), drei: (w.drei ?? '').trim(), neunzig: (w.neunzig ?? '').trim(), woche: (w.woche ?? '').trim(), heute: (w.heute ?? '').trim(), hindernis: hindernis.trim(), plan: plan.trim(), angelegt: tagNummer(heute()), checks: [] }
    useCoach.getState().aendere(d => ({ ...d, kompass: { ...d.kompass, ziele: [...d.kompass.ziele, z].slice(-12) } }))
    useCoach.getState().schreibeIns({ art: 'kompass', text: `Ziel: ${z.lebensziel} → 3 Jahre: ${z.drei} → 90 Tage: ${z.neunzig} → Woche: ${z.woche} → heute: ${z.heute}`, bezug: z.id })
    onFertig()
  }
  return (
    <div className="dc-lauf dc-ein" data-dc-zielbau>
      <span className="dc-ober">Ziel-Pyramide</span>
      <div className="dc-karte dc-spalte">
        {p.stufen.map(st => (
          <label key={st.feld} className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>{st.titel}</b> <span className="dc-stumm">– {st.hilfe}</span></span>
            <input className="dc-eingabe" value={w[st.feld] ?? ''} onChange={e => setW(x => ({ ...x, [st.feld]: e.target.value }))} placeholder={`z. B. ${st.beispiel}`} data-dc-eingabe={st.feld === 'lebensziel' ? '' : undefined} /></label>
        ))}
        <label className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>Das wahrscheinlichste Hindernis</b> <span className="dc-stumm">– was in dir oder um dich herum dazwischenkommt</span></span><input className="dc-eingabe" value={hindernis} onChange={e => setHindernis(e.target.value)} /></label>
        <label className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>Dein Plan dafür</b> <span className="dc-stumm">– Wenn …, dann …</span></span><input className="dc-eingabe" value={plan} onChange={e => setPlan(e.target.value)} placeholder="Wenn …, dann …" /></label>
        <div className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein dc-leise">Kurz prüfen:</span>{p.pruefFragen.map((f, i) => <label key={i} className="dc-schalter dc-klein"><input type="checkbox" checked={geprueft.has(i)} onChange={() => setGeprueft(g => { const n = new Set(g); if (n.has(i)) n.delete(i); else n.add(i); return n })} />{f}</label>)}</div>
        <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><button type="button" className="dc-knopf dc-knopf-nackt" onClick={onFertig}>Später</button><button type="button" className="dc-knopf" disabled={!ok} onClick={speichere} data-dc-weiter>Ziel speichern</button></div>
      </div>
    </div>
  )
}

function WochenCheck({ leben, id, onFertig }: { leben: Leben; id: string; onFertig: () => void }) {
  const z = useCoach(s => s.daten.kompass.ziele.find(x => x.id === id))
  const [w, setW] = useState<string[]>(() => leben.kompass.wochenCheck.map(() => ''))
  if (!z) return null
  const speichere = () => {
    const c = { tag: tagNummer(heute()), voran: w[0]?.trim() ?? '', hindert: w[1]?.trim() ?? '', naechster: w[2]?.trim() ?? '' }
    useCoach.getState().aendere(d => ({ ...d, kompass: { ...d.kompass, ziele: d.kompass.ziele.map(x => (x.id === id ? { ...x, checks: [...x.checks, c].slice(-26), woche: c.naechster || x.woche } : x)) } }))
    onFertig()
  }
  return (
    <div className="dc-lauf dc-ein" data-dc-check>
      <span className="dc-ober">Wochen-Check · {z.lebensziel}</span>
      <div className="dc-karte dc-spalte">
        {leben.kompass.wochenCheck.map((f, i) => <label key={i} className="dc-spalte" style={{ gap: 4 }}><b className="dc-klein">{f}</b><input className="dc-eingabe" value={w[i]} onChange={e => setW(x => x.map((y, j) => (j === i ? e.target.value : y)))} data-dc-eingabe={i === 0 ? '' : undefined} /></label>)}
        <Weiter text="Check speichern" onClick={speichere} />
      </div>
    </div>
  )
}

function Rueckblick({ leben, onFertig }: { leben: Leben; onFertig: () => void }) {
  const [w, setW] = useState<string[]>(() => leben.kompass.rueckblick.map(() => ''))
  const speichere = () => {
    const text = leben.kompass.rueckblick.map((f, i) => (w[i]?.trim() ? `${f} ${w[i].trim()}` : '')).filter(Boolean).join(' · ')
    useCoach.getState().aendere(d => ({ ...d, kompass: { ...d.kompass, rueckblick: tagNummer(heute()) } }))
    if (text) useCoach.getState().schreibeIns({ art: 'kompass', text: `Rückblick: ${text}` })
    onFertig()
  }
  return (
    <div className="dc-lauf dc-ein" data-dc-rueckblick-lauf>
      <span className="dc-ober">Rückblick nach drei Monaten</span>
      <div className="dc-karte dc-spalte">
        {leben.kompass.rueckblick.map((f, i) => <label key={i} className="dc-spalte" style={{ gap: 4 }}><b className="dc-klein">{f}</b><textarea className="dc-eingabe" rows={2} value={w[i]} onChange={e => setW(x => x.map((y, j) => (j === i ? e.target.value : y)))} /></label>)}
        <Weiter text="Rückblick speichern" onClick={speichere} />
      </div>
    </div>
  )
}
