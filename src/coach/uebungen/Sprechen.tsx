// Der Coach — Sprech-Übungen: Nachsprechen, Klar-Modus (gewohnt – überdeutlich – klar), Laut-Leiter, freies Sprechen.
// Lautes Sprechen braucht kein Mikrofon; Aufnehmen ist immer freiwillig. Die Selbstprüfung mit der Prüfliste trägt
// auch ohne Aufnahme. Der Coach bewertet keinen Laut automatisch.
import { useEffect, useRef, useState } from 'react'
import { Mic, Play, Square, Timer } from 'lucide-react'
import type { Schritt } from '../kern/inhaltTypen'
import { useCoach } from '../kern/speicher'
import { ladeLesetext } from '../kern/inhalt'
import { Rekorder, spieleAufnahme, stoppeAufnahme, type Aufgenommen } from '../ton/aufnahme'
import { T, mitName, useName, useZeile } from '../ansicht/hilfen'
import type { BausteinProps } from './typen'
import { Weiter } from './Lesen'
import { Anleitung } from './Gefuehrt'

/** Aufnehmen und Anhören einer Fassung (nur im Arbeitsspeicher) */
export function Aufnahmeknopf({ name, onAufnahme }: { name: string; onAufnahme?: (a: Aufgenommen) => void }) {
  const mikrofon = useCoach(s => s.daten.profil.mikrofon)
  const [zustand, setZustand] = useState<'bereit' | 'nimmt' | 'da' | 'fehler'>('bereit')
  const [a, setA] = useState<Aufgenommen | null>(null)
  const rek = useRef<Rekorder | null>(null)
  useEffect(() => () => { rek.current?.verwirf(); stoppeAufnahme() }, [])
  if (!mikrofon) return null
  const stopp = async () => { const x = await rek.current?.stoppe(); rek.current = null; if (x) { setA(x); setZustand('da'); onAufnahme?.(x) } else setZustand('bereit') }
  const start = async () => {
    try { rek.current = new Rekorder(); await rek.current.starte(() => { void stopp() }); setZustand('nimmt') } catch { setZustand('fehler') }
  }
  return (
    <span className="dc-reihe" style={{ gap: 6 }}>
      {zustand !== 'nimmt' ? <button type="button" className="dc-knopf dc-knopf-leise" onClick={start} data-dc-aufnehmen><Mic size={15} />{a ? `${name} neu` : `${name} aufnehmen`}</button>
        : <button type="button" className="dc-knopf" onClick={stopp} data-dc-stopp><Square size={14} />Stopp</button>}
      {a && zustand !== 'nimmt' && <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => void spieleAufnahme(a.daten)}><Play size={15} />Anhören</button>}
      {zustand === 'fehler' && <span className="dc-klein dc-stumm">Kein Mikrofon gefunden – prüf einfach nach Gefühl.</span>}
    </span>
  )
}

function Pruefliste({ punkte, an, setAn, hinweis = 'Prüf selbst – nach Gefühl oder an der Aufnahme:' }: { punkte: string[]; an: Set<number>; setAn: (s: Set<number>) => void; hinweis?: string }) {
  return (
    <div className="dc-spalte" style={{ gap: 6 }}>
      <span className="dc-klein dc-leise">{hinweis}</span>
      {punkte.map((p, i) => <label key={i} className="dc-schalter dc-klein"><input type="checkbox" checked={an.has(i)} onChange={() => { const n = new Set(an); if (n.has(i)) n.delete(i); else n.add(i); setAn(n) }} />{p}</label>)}
    </div>
  )
}

const WEISE = { gewohnt: 'wie du sonst sprichst', ueberdeutlich: 'überdeutlich – jedes Wort übertrieben klar', klar: 'klar und natürlich', frei: 'eine Kostprobe, ganz in deiner Art' }

export function Nachsprechen({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'nachsprechen' }>>) {
  const name = useName()
  const [an, setAn] = useState<Set<number>>(new Set())
  const [gesprochen, setGesprochen] = useState(false)
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="nachsprechen">
      <span className="dc-ober">Sprechen – {WEISE[s.weise]}</span>
      <p style={{ margin: 0, fontWeight: 600 }}><T t={s.auftrag} /></p>
      <div className="dc-karte-flach dc-spalte" style={{ gap: 6 }}>{s.zeilen.map((z, i) => <div key={i} className="dc-gross">{mitName(z, name || '(dein Name)')}</div>)}</div>
      <div className="dc-reihe"><Aufnahmeknopf name="Fassung" /><button type="button" className="dc-knopf dc-knopf-leise" onClick={() => setGesprochen(true)} data-dc-gesprochen>Ich habe es laut gesprochen</button></div>
      {gesprochen && <><Pruefliste punkte={s.pruefliste} an={an} setAn={setAn} /><Weiter onClick={() => onFertig({ wert: an.size / s.pruefliste.length, selbst: true })} /></>}
    </div>
  )
}

export function Klartext({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'klartext' }>>) {
  const [text, setText] = useState<string>(s.text.startsWith('lesetext-') ? '' : s.text)
  const [runde, setRunde] = useState(0)
  const [an, setAn] = useState<Set<number>>(new Set())
  const zeile = useZeile('aufnahme', s.kopf.id)
  useEffect(() => { if (s.text.startsWith('lesetext-')) void ladeLesetext(s.text).then(l => setText(l?.text ?? '')) }, [s.text])
  const runden: ('gewohnt' | 'ueberdeutlich' | 'klar')[] = ['gewohnt', 'ueberdeutlich', 'klar']
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="klartext">
      <span className="dc-ober">Klar-Modus · Durchgang {Math.min(runde + 1, 3)} von 3</span>
      <p style={{ margin: 0, fontWeight: 600 }}>{runde < 3 ? `Lies den Text ${WEISE[runden[runde]]}.` : 'Vergleich: Was hat sich verändert?'}</p>
      <p className="dc-karte-flach dc-gross" style={{ margin: 0 }}><T t={text} /></p>
      {runde < 3 ? <div className="dc-reihe"><Aufnahmeknopf key={runde} name={`Durchgang ${runde + 1}`} /><button type="button" className="dc-knopf" onClick={() => setRunde(r => r + 1)} data-dc-gesprochen>Gelesen</button></div>
        : <><div className="dc-rueck">{zeile}</div><Pruefliste punkte={s.pruefliste} an={an} setAn={setAn} /><Weiter onClick={() => onFertig({ wert: an.size / s.pruefliste.length, selbst: true })} /></>}
    </div>
  )
}

export function Lautleiter({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'lautleiter' }>>) {
  const [stufe, setStufe] = useState(0)
  const [an, setAn] = useState<Set<number>>(new Set())
  const fertig = stufe >= s.stufen.length
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="lautleiter">
      <span className="dc-ober">Laut-Leiter: {s.laut}</span>
      <div className="dc-reihe">{s.stufen.map((x, i) => <span key={i} className={`dc-chip ${i === stufe ? 'dc-chip-rot' : i < stufe ? 'dc-chip-gut' : ''}`}>{i < stufe ? '✓ ' : ''}{x.s}</span>)}</div>
      {!fertig ? <>
        <div className="dc-karte-flach dc-spalte" style={{ gap: 6 }}>{s.stufen[stufe].zeilen.map((z, i) => <div key={i} className="dc-gross">{z}</div>)}</div>
        <div className="dc-reihe"><Aufnahmeknopf key={stufe} name="Stufe" /><button type="button" className="dc-knopf" onClick={() => setStufe(x => x + 1)} data-dc-gesprochen>Sitzt – nächste Stufe</button><button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => setStufe(s.stufen.length)}>Hier aufhören</button></div>
      </> : <><Pruefliste punkte={s.pruefliste} an={an} setAn={setAn} /><Weiter onClick={() => onFertig({ wert: an.size / s.pruefliste.length, selbst: true })} /></>}
    </div>
  )
}

export function Sprechen({ s, onFertig, ohneUhr }: BausteinProps<Extract<Schritt, { art: 'sprechen' }>>) {
  const [laeuft, setLaeuft] = useState(false)
  const [rest, setRest] = useState(s.sekunden)
  const [fertig, setFertig] = useState(false)
  const [an, setAn] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!laeuft || ohneUhr) return
    const t = setInterval(() => setRest(r => { if (r <= 1) { clearInterval(t); setFertig(true); return 0 } return r - 1 }), 1000)
    return () => clearInterval(t)
  }, [laeuft, ohneUhr])
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="sprechen">
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><span className="dc-ober">Frei sprechen</span>{!ohneUhr && laeuft && <span className="dc-chip dc-chip-gelb dc-zahl"><Timer size={13} />{rest} s</span>}</div>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}><T t={s.auftrag} /></p>
      {!laeuft ? <div className="dc-reihe"><button type="button" className="dc-knopf" onClick={() => setLaeuft(true)} autoFocus data-dc-los>Los{ohneUhr ? '' : ` (${s.sekunden} Sekunden)`}</button><Aufnahmeknopf name="Rede" /></div>
        : !fertig ? <div className="dc-reihe"><Aufnahmeknopf name="Rede" /><button type="button" className="dc-knopf dc-knopf-leise" onClick={() => setFertig(true)} data-dc-fertig>Fertig</button></div> : null}
      {fertig && <><Pruefliste punkte={s.pruefliste} an={an} setAn={setAn} /><Weiter onClick={() => onFertig({ wert: an.size / s.pruefliste.length, selbst: true })} /></>}
    </div>
  )
}

/** stille Übung: geführt (stumm), danach Selbstcheck – zählt als Selbstbewertung (halb) */
export function Stumm({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'stumm' }>>) {
  const [phase, setPhase] = useState<'ueben' | 'pruefen'>('ueben')
  const [an, setAn] = useState<Set<number>>(new Set())
  if (phase === 'ueben') return <Anleitung titel={s.titel} schritte={s.schritte} sekunden={s.sekunden} stumm onFertig={() => setPhase('pruefen')} />
  return (
    <div className="dc-spalte dc-ein" style={{ width: '100%' }} data-dc-schritt="stumm">
      <span className="dc-ober">{s.titel} · Selbstcheck</span>
      <Pruefliste punkte={s.pruefliste} an={an} setAn={setAn} hinweis="Prüf selbst – nach Gefühl, ehrlich und ohne Strenge:" />
      <Weiter onClick={() => onFertig({ wert: an.size / Math.max(1, s.pruefliste.length), selbst: true })} />
    </div>
  )
}
