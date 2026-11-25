// Der Coach — Üben mit eigenen Worten: Konter, Umformulieren, Aufgreifen, Spiegeln, Ja-und, Kernbotschaft, Pointe,
// Kritiker umbauen, Bauplan, Zeitdruck-Runde, Reflexion. Erst selbst schreiben, dann mit Musterlösungen vergleichen
// und an den Kriterien selbst prüfen (zählt halb). Eine spätere KI-Rückmeldung hängt an kern/ki.ts.
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookmarkPlus, Timer } from 'lucide-react'
import type { Schritt } from '../kern/inhaltTypen'
import { ki } from '../kern/ki'
import { T, mitName, useName } from '../ansicht/hilfen'
import type { BausteinProps, Ergebnis } from './typen'
import { Weiter } from './Lesen'

type FreiSchritt = Extract<Schritt, { art: 'konter' | 'umformulieren' | 'anschluss' | 'spiegeln' | 'jaund' | 'kern' | 'humorlabor' | 'kritiker' }>
const SCHAERFE = ['', 'neckend', 'stichelnd', 'übergriffig']
const UEBER: Record<FreiSchritt['art'], string> = { konter: 'Konter-Training', umformulieren: 'Satz umbauen', anschluss: 'Aufgreifen', spiegeln: 'Zuhör-Probe', jaund: 'Ja, und …', kern: 'Kernbotschaft', humorlabor: 'Pointe bauen', kritiker: 'Selbstgespräch umbauen' }

function Kriterien({ liste, an, setAn }: { liste: string[]; an: Set<number>; setAn: (s: Set<number>) => void }) {
  return (
    <div className="dc-spalte" style={{ gap: 6 }}>
      <span className="dc-klein dc-leise">Prüf deine Antwort selbst – was trifft zu?</span>
      {liste.map((k, i) => (
        <label key={i} className="dc-schalter dc-klein"><input type="checkbox" checked={an.has(i)} onChange={() => { const n = new Set(an); if (n.has(i)) n.delete(i); else n.add(i); setAn(n) }} data-dc-kriterium={i} />{k}</label>
      ))}
    </div>
  )
}

export function Freitext({ s, onFertig }: BausteinProps<FreiSchritt>) {
  const name = useName()
  const [text, setText] = useState('')
  const [offen, setOffen] = useState(false)
  const [an, setAn] = useState<Set<number>>(new Set())
  const [schatz, setSchatz] = useState(false)
  const [kiHinweis, setKiHinweis] = useState<string | null>(null)
  const muster: { technik?: string; text: string }[] = s.art === 'konter' ? s.muster : s.muster.map(t => ({ text: t }))
  const aufgabe = s.art === 'konter' ? s.spruch : s.art === 'jaund' ? s.start : s.art === 'kern' ? s.absatz : s.art === 'kritiker' ? s.satz : s.art === 'umformulieren' || s.art === 'humorlabor' ? s.vorlage : s.aussage
  const vergleiche = () => {
    setOffen(true)
    if (ki.verfuegbar() && text.trim()) void ki.bewerte({ art: s.art, aufgabe, antwort: text, kriterien: s.kriterien }).then(u => { if (u) setKiHinweis(u.hinweis) })
  }
  const fertig = () => {
    const e: Ergebnis = { wert: text.trim() ? an.size / s.kriterien.length : 0, selbst: true }
    if (schatz && text.trim()) e.buch = { art: s.art === 'konter' ? 'konter' : s.art === 'kritiker' ? 'satz' : 'antwort', text: `${aufgabe} → ${text.trim()}` }
    onFertig(e)
  }
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt={s.art}>
      <span className="dc-ober">{UEBER[s.art]}</span>
      {s.art === 'konter' && <>
        <p className="dc-leise" style={{ margin: 0 }}>{s.lage}</p>
        <div className="dc-karte-flach"><div className="dc-reihe" style={{ justifyContent: 'space-between' }}><b>{s.von}:</b><span className={`dc-chip ${s.schaerfe === 3 ? 'dc-chip-rot' : s.schaerfe === 2 ? 'dc-chip-gelb' : ''}`}>{SCHAERFE[s.schaerfe]}</span></div><div className="dc-gross" style={{ marginTop: 4 }}>{s.spruch}</div></div>
      </>}
      {(s.art === 'umformulieren' || s.art === 'humorlabor') && <><p style={{ margin: 0, fontWeight: 600 }}>{s.auftrag}</p><p className="dc-gross dc-zitat" style={{ margin: 0 }}><T t={s.vorlage} /></p></>}
      {(s.art === 'anschluss' || s.art === 'spiegeln') && <><p style={{ margin: 0, fontWeight: 600 }}>{s.art === 'anschluss' ? 'Greif auf, was gesagt wurde: eine Anschlussfrage oder eine Würdigung.' : 'Gib in eigenen Worten zurück, was du gehört hast – Inhalt und Gefühl.'}</p><div className="dc-karte-flach"><b>{s.von}:</b> {s.aussage}</div></>}
      {s.art === 'jaund' && <><p style={{ margin: 0, fontWeight: 600 }}>Nimm das Angebot an und leg etwas dazu.</p><p className="dc-gross dc-zitat" style={{ margin: 0 }}>{s.start}</p></>}
      {s.art === 'kern' && <><p style={{ margin: 0, fontWeight: 600 }}>Bring es auf einen Satz (höchstens {s.hoechstWoerter} Wörter).</p><p className="dc-karte-flach" style={{ margin: 0 }}>{s.absatz}</p></>}
      {s.art === 'kritiker' && <><p style={{ margin: 0, fontWeight: 600 }}>Bau den Satz um: ehrlich, freundlich, glaubwürdig – so, wie du mit einem Freund reden würdest.</p><p className="dc-zitat" style={{ margin: 0 }}>{s.satz}</p></>}
      <textarea className="dc-eingabe" rows={s.art === 'kern' ? 2 : 3} value={text} onChange={e => setText(e.target.value)} disabled={offen} placeholder={s.art === 'konter' ? 'Deine Antwort – oder leer lassen, wenn dir nichts einfällt' : 'Deine Fassung'} autoFocus data-dc-eingabe />
      {s.art === 'kern' && text.trim() && <span className="dc-klein dc-stumm">{text.trim().split(/\s+/).length} Wörter</span>}
      {!offen && <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf" onClick={vergleiche} data-dc-vergleichen>{text.trim() ? 'Vergleichen' : 'Mir fällt nichts ein – zeig mir Ideen'}</button></div>}
      {offen && <>
        <div className="dc-spalte" style={{ gap: 6 }}>
          <span className="dc-klein dc-leise">So könnte es klingen:</span>
          {muster.map((m, i) => <div key={i} className="dc-karte-flach" style={{ padding: '8px 12px' }}>{m.technik && <span className="dc-chip" style={{ marginRight: 8 }}>{m.technik}</span>}{mitName(m.text, name)}</div>)}
        </div>
        {kiHinweis && <div className="dc-rueck">{kiHinweis}</div>}
        {text.trim() ? <Kriterien liste={s.kriterien} an={an} setAn={setAn} /> : <p className="dc-klein dc-leise" style={{ margin: 0 }}>Kein Problem – genau so entsteht Vorrat. Such dir eine der Antworten aus und sag sie einmal halblaut.</p>}
        {text.trim() && <label className="dc-schalter dc-klein"><input type="checkbox" checked={schatz} onChange={e => setSchatz(e.target.checked)} /><BookmarkPlus size={14} />{s.art === 'konter' ? 'In meinen Konter-Schatz' : 'In mein Buch'}</label>}
        <Weiter onClick={fertig} />
      </>}
    </div>
  )
}

export function Bauplan({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'bauplan' }>>) {
  const [werte, setWerte] = useState<string[]>(() => s.felder.map(() => ''))
  const [offen, setOffen] = useState(false)
  const gefuellt = werte.filter(w => w.trim()).length
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="bauplan">
      <span className="dc-ober">Bauplan: {s.plan}</span>
      <p style={{ margin: 0, fontWeight: 600 }}>{s.anlass}</p>
      {s.felder.map((f, i) => (
        <label key={i} className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>{f.name}</b> <span className="dc-stumm">– {f.hilfe}</span></span>
          <textarea className="dc-eingabe" rows={2} value={werte[i]} disabled={offen} onChange={e => setWerte(w => w.map((x, j) => (j === i ? e.target.value : x)))} /></label>
      ))}
      {!offen ? <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf" onClick={() => setOffen(true)}>Vergleichen</button></div>
        : <>{s.muster.map((m, i) => <div key={i} className="dc-karte-flach">{m}</div>)}<Weiter onClick={() => onFertig({ wert: gefuellt / s.felder.length, selbst: true, buch: gefuellt ? { art: 'antwort', text: werte.filter(Boolean).join(' / ') } : undefined })} /></>}
    </div>
  )
}

export function Blitz({ s, onFertig, ohneUhr }: BausteinProps<Extract<Schritt, { art: 'blitz' }>>) {
  const [laeuft, setLaeuft] = useState(false)
  const [rest, setRest] = useState(s.sekunden)
  const [liste, setListe] = useState<string[]>([])
  const [eingabe, setEingabe] = useState('')
  const [fertig, setFertig] = useState(false)
  const feld = useRef<HTMLInputElement>(null)
  const uhr = !ohneUhr && !!s.kopf.uhr
  useEffect(() => {
    if (!laeuft || !uhr) return
    const t = setInterval(() => setRest(r => { if (r <= 1) { clearInterval(t); setFertig(true); return 0 } return r - 1 }), 1000)
    return () => clearInterval(t)
  }, [laeuft, uhr])
  const dazu = () => { const x = eingabe.trim(); if (x) { setListe(l => [...l, x]); setEingabe('') } feld.current?.focus() }
  const wert = useMemo(() => Math.min(1, liste.length / s.ziel), [liste, s.ziel])
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="blitz">
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><span className="dc-ober">Zeitdruck-Runde</span>{uhr && <span className="dc-chip dc-chip-gelb dc-zahl"><Timer size={13} />{rest} s</span>}</div>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}>{s.auftrag}</p>
      <p className="dc-klein dc-leise" style={{ margin: 0 }}>Ziel: {s.ziel} Einfälle{uhr ? ` in ${s.sekunden} Sekunden` : ' – ohne Uhr, in deinem Tempo'}. Qualität zählt hier nicht, Menge schon.</p>
      {!laeuft ? <div className="dc-reihe"><button type="button" className="dc-knopf" onClick={() => { setLaeuft(true); setTimeout(() => feld.current?.focus(), 30) }} autoFocus data-dc-los>Los</button></div> : <>
        <div className="dc-reihe" style={{ flexWrap: 'nowrap' }}>
          <input ref={feld} className="dc-eingabe" value={eingabe} disabled={fertig} onChange={e => setEingabe(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') dazu() }} placeholder="Einfall eintippen, Enter" data-dc-eingabe />
          <button type="button" className="dc-knopf dc-knopf-leise" onClick={dazu} disabled={fertig}>+</button>
        </div>
        <ol style={{ margin: 0, paddingLeft: 22 }}>{liste.map((x, i) => <li key={i}>{x}</li>)}</ol>
        {!fertig && <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf dc-knopf-leise" onClick={() => setFertig(true)} data-dc-fertig>Fertig</button></div>}
      </>}
      {fertig && <>
        <div className="dc-rueck" data-gut={wert >= 1 ? '1' : undefined}>{liste.length} von {s.ziel}. {wert >= 1 ? 'Ziel erreicht.' : 'Jeder Einfall zählt – Einfälle lassen sich aufwärmen wie Muskeln.'}</div>
        <div className="dc-klein dc-leise">Ideen von Bruno: {s.beispiele.join(' · ')}</div>
        <Weiter onClick={() => onFertig({ wert, selbst: true })} />
      </>}
    </div>
  )
}

export function Reflexion({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'reflexion' }>>) {
  const [text, setText] = useState('')
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="reflexion">
      <span className="dc-ober">Nachdenken</span>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}><T t={s.frage} /></p>
      <textarea className="dc-eingabe" rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Zwei, drei Sätze – nur für dich" autoFocus data-dc-eingabe />
      {s.insBuch && <span className="dc-klein dc-stumm">Kommt in dein Buch ({s.insBuch === 'konter' ? 'Konter-Schatz' : s.insBuch === 'saetze' ? 'Sätze für die Ecke' : s.insBuch === 'erfolg' ? 'Erfolgsbuch' : 'Geschichten'}).</span>}
      <Weiter text={text.trim() ? 'Weiter' : 'Überspringen'} onClick={() => onFertig(text.trim() ? { buch: { art: s.insBuch === 'konter' ? 'konter' : s.insBuch === 'saetze' ? 'satz' : s.insBuch === 'erfolg' ? 'erfolg' : s.insBuch === 'geschichten' ? 'geschichte' : 'reflexion', text: text.trim() } } : {})} />
    </div>
  )
}
