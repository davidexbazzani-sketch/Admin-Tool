// Der Coach — geführte Übungen: Atem (mit Atemkreis), Mund lockern, Anleitung, Startroutine.
// Atem- und Beruhigungsübungen fragen auf Wunsch die Anspannung vorher und nachher ab (0–100) – daraus entsteht die
// persönliche Liste „Was bei mir wirkt“.
import { useEffect, useRef, useState } from 'react'
import type { Schritt } from '../kern/inhaltTypen'
import { T } from '../ansicht/hilfen'
import type { BausteinProps } from './typen'
import { Weiter } from './Lesen'

export function Anspannung({ titel, wert, setWert }: { titel: string; wert: number | null; setWert: (n: number) => void }) {
  return (
    <label className="dc-spalte" style={{ gap: 4 }}>
      <span className="dc-klein">{titel} <b className="dc-zahl">{wert ?? '–'}</b> <span className="dc-stumm">(0 = ganz ruhig, 100 = sehr angespannt)</span></span>
      <input type="range" min={0} max={100} step={5} value={wert ?? 50} onChange={e => setWert(Number(e.target.value))} style={{ accentColor: 'var(--dc-rot)' }} data-dc-anspannung />
    </label>
  )
}

/** Atemkreis: wächst beim Einatmen, schrumpft beim Ausatmen; zählt die Runden. */
export function Atemkreis({ ein, aus, runden, onEnde }: { ein: number; aus: number; runden: number; onEnde: () => void }) {
  const [runde, setRunde] = useState(0)
  const [phase, setPhase] = useState<'ein' | 'aus'>('ein')
  const ende = useRef(onEnde)
  ende.current = onEnde
  useEffect(() => {
    if (runde >= runden) { ende.current(); return }
    const t = setTimeout(() => {
      if (phase === 'ein') setPhase('aus')
      else { setPhase('ein'); setRunde(r => r + 1) }
    }, (phase === 'ein' ? ein : aus) * 1000)
    return () => clearTimeout(t)
  }, [phase, runde, runden, ein, aus])
  const skala = phase === 'ein' ? 1 : 0.55
  return (
    <div className="dc-spalte" style={{ alignItems: 'center' }} data-dc-atemkreis>
      <div className="dc-atem">
        <div className="dc-atem-kreis" style={{ ['--dc-atem-skala' as string]: skala, transitionDuration: `${phase === 'ein' ? ein : aus}s` }} />
        <span className="dc-atem-text" aria-live="polite">{runde >= runden ? 'Fertig' : phase === 'ein' ? 'Ein' : 'Lang aus'}</span>
      </div>
      <span className="dc-klein dc-stumm dc-zahl">Runde {Math.min(runde + 1, runden)} von {runden}</span>
    </div>
  )
}

export function Atem({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'atem' }>>) {
  const [stufe, setStufe] = useState<'vorher' | 'laeuft' | 'nachher'>(s.messen ? 'vorher' : 'laeuft')
  const [vorher, setVorher] = useState<number | null>(null)
  const [nachher, setNachher] = useState<number | null>(null)
  const [fertig, setFertig] = useState(false)
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="atem">
      <span className="dc-ober">Atem</span>
      <ol style={{ margin: 0, paddingLeft: 20 }}>{s.schritte.map((x, i) => <li key={i}><T t={x} /></li>)}</ol>
      <p className="dc-klein dc-leise" style={{ margin: 0 }}>{s.hinweis}</p>
      {stufe === 'vorher' && <>
        <Anspannung titel="Wie angespannt bist du gerade?" wert={vorher} setWert={setVorher} />
        <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => { setVorher(null); setStufe('laeuft') }}>Ohne Messen</button>
          <button type="button" className="dc-knopf" onClick={() => setStufe('laeuft')} autoFocus data-dc-los>Los</button>
        </div>
      </>}
      {stufe === 'laeuft' && <>
        <Atemkreis ein={s.takt.ein} aus={s.takt.aus} runden={s.takt.runden} onEnde={() => { setFertig(true); if (vorher !== null) setStufe('nachher') }} />
        {!fertig && <div className="dc-reihe" style={{ justifyContent: 'center' }}><button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => { setFertig(true); if (vorher !== null) setStufe('nachher') }}>Abbrechen</button></div>}
        {fertig && vorher === null && <Weiter onClick={() => onFertig({})} />}
      </>}
      {stufe === 'nachher' && <>
        <Anspannung titel="Und jetzt?" wert={nachher} setWert={setNachher} />
        <Weiter onClick={() => onFertig(vorher !== null && nachher !== null ? { wirkung: { werkzeug: s.werkzeug, vorher, nachher } } : {})} />
      </>}
    </div>
  )
}

/** Mund lockern, Anleitungen: Schritt für Schritt mit Takt (je Schritt gleich viele Sekunden) */
export function Anleitung({ titel, schritte, sekunden, stumm, pruefung, onFertig }: { titel: string; schritte: string[]; sekunden: number; stumm: boolean; pruefung?: string[]; onFertig: () => void }) {
  const [i, setI] = useState(-1)
  const je = Math.max(4, Math.round(sekunden / Math.max(1, schritte.length)))
  useEffect(() => {
    if (i < 0 || i >= schritte.length) return
    const t = setTimeout(() => setI(x => x + 1), je * 1000)
    return () => clearTimeout(t)
  }, [i, je, schritte.length])
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="anleitung">
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><span className="dc-ober">{titel}</span>{stumm && <span className="dc-chip">geht auch stumm</span>}</div>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {schritte.map((x, k) => <li key={k} style={{ fontWeight: k === i ? 700 : 400, color: k < i ? 'var(--dc-stumm)' : undefined }}><T t={x} /></li>)}
      </ol>
      {i < 0 && <div className="dc-reihe"><button type="button" className="dc-knopf" onClick={() => setI(0)} autoFocus data-dc-los>Mitmachen (je {je} Sekunden)</button><button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => setI(schritte.length)}>Kenne ich – weiter</button></div>}
      {i >= 0 && i < schritte.length && <div className="dc-fortschritt"><i style={{ width: `${(i / schritte.length) * 100}%` }} /></div>}
      {i >= schritte.length && <>
        {pruefung && <div className="dc-rueck">Prüf es: {pruefung.join(' · ')}</div>}
        <Weiter onClick={onFertig} />
      </>}
    </div>
  )
}

export function Lockern({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'lockern' }>>) {
  return <Anleitung titel="Mund aufwärmen" schritte={s.uebungen} sekunden={s.sekunden} stumm={s.stummMoeglich} onFertig={() => onFertig({})} />
}
export function AnleitungSchritt({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'anleitung' }>>) {
  const [stufe, setStufe] = useState<'vorher' | 'laeuft' | 'nachher'>(s.messen && s.werkzeug ? 'vorher' : 'laeuft')
  const [vorher, setVorher] = useState<number | null>(null)
  const [nachher, setNachher] = useState<number | null>(null)
  if (stufe === 'vorher') return <div className="dc-spalte dc-ein" data-dc-schritt="anleitung"><span className="dc-ober">{s.titel}</span><Anspannung titel="Wie angespannt bist du gerade?" wert={vorher} setWert={setVorher} /><Weiter text="Los" onClick={() => setStufe('laeuft')} /></div>
  if (stufe === 'nachher') return <div className="dc-spalte dc-ein" data-dc-schritt="anleitung"><span className="dc-ober">{s.titel}</span><Anspannung titel="Und jetzt?" wert={nachher} setWert={setNachher} /><Weiter onClick={() => onFertig(vorher !== null && nachher !== null && s.werkzeug ? { wirkung: { werkzeug: s.werkzeug, vorher, nachher } } : {})} /></div>
  return <Anleitung titel={s.titel} schritte={s.schritte} sekunden={s.sekunden} stumm={s.stumm} pruefung={s.pruefung} onFertig={() => (s.messen && s.werkzeug ? setStufe('nachher') : onFertig({}))} />
}

export function Routine({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'routine' }>>) {
  const [wahl, setWahl] = useState<string[]>([])
  const kipp = (b: string) => setWahl(w => (w.includes(b) ? w.filter(x => x !== b) : w.length < s.hoechstens ? [...w, b] : w))
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="routine">
      <span className="dc-ober">Deine Startroutine</span>
      <p style={{ margin: 0 }}>Wähl {s.mindestens} bis {s.hoechstens} Schritte – in der Reihenfolge, in der du sie machst. Das wird dein Ablauf für die letzte Minute.</p>
      {s.bausteine.map(b => <button key={b} type="button" className="dc-wahl" onClick={() => kipp(b)} data-an={wahl.includes(b) ? '1' : undefined} aria-pressed={wahl.includes(b)}><span className="dc-zeichen dc-zahl">{wahl.includes(b) ? wahl.indexOf(b) + 1 : '+'}</span>{b}</button>)}
      {wahl.length >= s.mindestens && <div className="dc-karte-flach"><b>Deine Routine:</b> {wahl.join(' → ')}</div>}
      <Weiter text={wahl.length >= s.mindestens ? 'Routine speichern' : 'Später'} onClick={() => onFertig(wahl.length >= s.mindestens ? { buch: { art: 'routine', text: wahl.join(' → ') } } : {})} />
    </div>
  )
}
