// Parla Italiano — Bausteine mit Wertung: Auswahl, Tippen, Satzbau, Paare.
// Jeder Baustein meldet GENAU EINMAL über onAntwort, ob es geklappt hat, und zeigt danach
// selbst, was richtig gewesen wäre. Den Rest (Meldung, „Weiter“) macht der Ablauf.
import { useEffect, useMemo, useRef, useState } from 'react'
import { rng } from '../../brain/kern/zufall'
import type { AAuswahl, APaare, ASatzbau, ATippen } from '../kern/typen'
import { pruefeEingabe, satzGleich } from '../kern/antwort'
import { Laut } from './teile'

export interface Antwort {
  richtig: boolean
  /** die richtige Lösung zum Anzeigen (wenn es nicht stimmte) */
  loesung?: string
  /** Hinweis bei „fast richtig“ */
  fast?: string
  /** Erklärung */
  nach?: string
  woerter: { kennung: number; richtig: boolean }[]
}
export interface UebungProps<T> { a: T; onAntwort: (x: Antwort) => void; ton: boolean; langsam: boolean }

const BUCHSTABEN = ['A', 'B', 'C', 'D']

// ── Auswahl ─────────────────────────────────────────────────────────────────────────────
export function Auswahl({ a, onAntwort, ton, langsam }: UebungProps<AAuswahl>) {
  const [wahl, setWahl] = useState<number | null>(null)
  const waehle = (i: number) => {
    if (wahl !== null || i < 0 || i >= a.optionen.length) return
    setWahl(i)
    const richtig = i === a.richtig
    onAntwort({ richtig, loesung: a.optionen[a.richtig], nach: a.nach, woerter: a.wort ? [{ kennung: a.wort, richtig }] : [] })
  }
  const waehleRef = useRef(waehle)
  waehleRef.current = waehle
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const n = '1234'.indexOf(e.key)
      const b = 'abcd'.indexOf(e.key.toLowerCase())
      if (n >= 0) waehleRef.current(n); else if (b >= 0 && e.key.length === 1) waehleRef.current(b)
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])
  const versteckt = a.nurTon && wahl === null
  return (
    <div className="pi-spalte pi-ein" data-pi-auswahl data-pi-richtig={a.richtig}>
      <div className="pi-ober">{a.kopf}</div>
      {a.text && (
        <div>
          <div className="pi-h3 pi-it" lang="it" style={{ marginBottom: 6 }}>{a.text.titel}</div>
          <div className="pi-lesetext" lang="it">{a.text.it}</div>
        </div>
      )}
      {a.nurTon && (
        <div className="pi-reihe" style={{ justifyContent: 'center', padding: '6px 0' }}>
          <Laut stelle={a.ton} an={ton} langsam={langsam} gross auto titel="Noch einmal anhören" />
        </div>
      )}
      {a.frage && !versteckt && (
        <div className="pi-reihe" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <div className={`pi-frage ${a.frageIt ? 'pi-it' : ''}`} lang={a.frageIt ? 'it' : undefined} style={{ flex: 1 }}>{a.frage}</div>
          {!a.nurTon && <Laut stelle={a.ton} an={ton} langsam={langsam} auto />}
        </div>
      )}
      {a.zusatz && !versteckt && <p className="pi-leise">{a.zusatz}</p>}
      <div className="pi-optionen">
        {a.optionen.map((o, i) => {
          const stand = wahl === null ? undefined : i === a.richtig ? 'richtig' : i === wahl ? 'falsch' : 'blass'
          return (
            <button key={i} type="button" className="pi-option" data-stand={stand} disabled={wahl !== null} onClick={() => waehle(i)} data-pi-option={i}>
              <kbd>{BUCHSTABEN[i]}</kbd><span className={a.optIt ? 'pi-it' : undefined} lang={a.optIt ? 'it' : undefined}>{o}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Tippen ──────────────────────────────────────────────────────────────────────────────
const AKZENTE = ['à', 'è', 'é', 'ì', 'ò', 'ù']

export function Tippen({ a, onAntwort, ton, langsam }: UebungProps<ATippen>) {
  const [text, setText] = useState('')
  const [stand, setStand] = useState<'offen' | 'richtig' | 'falsch'>('offen')
  const feld = useRef<HTMLInputElement>(null)
  useEffect(() => { feld.current?.focus() }, [])
  const pruefe = () => {
    if (stand !== 'offen' || !text.trim()) return
    const p = pruefeEingabe(text, a.loesung, a.auch)
    const richtig = p.urteil !== 'falsch'
    setStand(richtig ? 'richtig' : 'falsch')
    onAntwort({ richtig, loesung: a.loesung, fast: p.urteil === 'fast' ? p.hinweis : undefined, woerter: a.wort ? [{ kennung: a.wort, richtig }] : [] })
  }
  const setze = (z: string) => {
    const el = feld.current
    if (!el || stand !== 'offen') return
    const von = el.selectionStart ?? text.length, bis = el.selectionEnd ?? text.length
    const neu = text.slice(0, von) + z + text.slice(bis)
    setText(neu)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(von + 1, von + 1) })
  }
  const eingabe = (
    <input ref={feld} className={`pi-eingabe ${a.vor !== undefined ? 'pi-eingabe-klein' : ''}`} value={text} lang="it" spellCheck={false} autoComplete="off" autoCapitalize="off"
      data-stand={stand === 'offen' ? undefined : stand} readOnly={stand !== 'offen'} placeholder={a.vor !== undefined ? '…' : 'Auf Italienisch …'}
      onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && stand === 'offen') { e.preventDefault(); e.stopPropagation(); pruefe() } }} data-pi-eingabe />
  )
  return (
    <div className="pi-spalte pi-ein" data-pi-tippen data-pi-loesung={a.loesung}>
      <div className="pi-ober">{a.kopf}</div>
      {a.nurTon && <div className="pi-reihe" style={{ justifyContent: 'center', padding: '6px 0' }}><Laut stelle={a.ton} an={ton} langsam={langsam} gross auto titel="Noch einmal anhören" /></div>}
      {a.frage && <div className="pi-frage">{a.frage}</div>}
      {a.vor !== undefined
        ? <div className="pi-it" lang="it" style={{ fontSize: 21, lineHeight: 2 }}>{a.vor}{eingabe}{a.nachText}</div>
        : eingabe}
      {a.zusatz && <p className="pi-leise">{a.zusatz}</p>}
      {stand === 'offen' && (
        <div className="pi-reihe" style={{ justifyContent: 'space-between' }}>
          <div className="pi-akzente" aria-label="Buchstaben mit Akzent">{AKZENTE.map(z => <button key={z} type="button" onClick={() => setze(z)} tabIndex={-1} title={`${z} einfügen`}>{z}</button>)}</div>
          <button type="button" className="pi-knopf" disabled={!text.trim()} onClick={pruefe} data-pi-pruefen>Prüfen</button>
        </div>
      )}
    </div>
  )
}

// ── Satzbau ─────────────────────────────────────────────────────────────────────────────
export function Satzbau({ a, onAntwort, ton, langsam }: UebungProps<ASatzbau>) {
  const vorrat = useMemo(() => rng(a.id + a.loesung).misch([...a.teile, ...a.extra]).map((t, i) => ({ t, i })), [a])
  const [gelegt, setGelegt] = useState<number[]>([])
  const [stand, setStand] = useState<'offen' | 'richtig' | 'falsch'>('offen')
  const pruefe = () => {
    if (stand !== 'offen' || !gelegt.length) return
    const richtig = satzGleich(gelegt.map(i => vorrat[i].t), a.teile)
    setStand(richtig ? 'richtig' : 'falsch')
    onAntwort({ richtig, loesung: a.loesung, woerter: [] })
  }
  const pruefeRef = useRef(pruefe)
  pruefeRef.current = pruefe
  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.defaultPrevented) pruefeRef.current() }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])
  return (
    <div className="pi-spalte pi-ein" data-pi-satzbau data-pi-loesung={a.loesung} data-pi-teile={a.teile.join(' ')}>
      <div className="pi-ober">Bau den Satz auf Italienisch</div>
      <div className="pi-reihe" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <div className="pi-frage" style={{ flex: 1 }}>{a.de}</div>
        {stand !== 'offen' && <Laut stelle={a.ton} an={ton} langsam={langsam} auto />}
      </div>
      <div className="pi-bauplatz" data-stand={stand === 'offen' ? undefined : stand} data-pi-bauplatz>
        {gelegt.map((i, k) => (
          <button key={i} type="button" className="pi-kachel" lang="it" disabled={stand !== 'offen'} onClick={() => setGelegt(g => g.filter((_, x) => x !== k))}>{vorrat[i].t}</button>
        ))}
        {!gelegt.length && <span className="pi-stumm" style={{ alignSelf: 'center', padding: '0 4px' }}>Tippe die Wörter in der richtigen Reihenfolge an.</span>}
      </div>
      <div className="pi-kacheln">
        {vorrat.map(v => {
          const weg = gelegt.includes(v.i)
          return <button key={v.i} type="button" className="pi-kachel" lang="it" data-weg={weg ? '1' : undefined} disabled={weg || stand !== 'offen'} onClick={() => setGelegt(g => [...g, v.i])} data-pi-kachel={v.t}>{v.t}</button>
        })}
      </div>
      {stand === 'offen' && <div className="pi-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="pi-knopf" disabled={!gelegt.length} onClick={pruefe} data-pi-pruefen>Prüfen</button></div>}
    </div>
  )
}

// ── Paare ───────────────────────────────────────────────────────────────────────────────
export function Paare({ a, onAntwort }: UebungProps<APaare>) {
  const rechts = useMemo(() => rng(a.id).misch(a.paare.map((_, i) => i)), [a])
  const [links, setLinks] = useState<number | null>(null)
  const [fertig, setFertig] = useState<number[]>([])
  const [falsch, setFalsch] = useState<{ l: number; r: number } | null>(null)
  const fehler = useRef<Set<number>>(new Set())
  const gemeldet = useRef(false)

  const waehleRechts = (r: number) => {
    if (links === null || fertig.includes(r) || falsch) return
    if (r === links) {
      const neu = [...fertig, r]
      setFertig(neu); setLinks(null)
      if (neu.length === a.paare.length && !gemeldet.current) {
        gemeldet.current = true
        onAntwort({ richtig: fehler.current.size === 0, woerter: a.paare.flatMap((p, i) => (p.wort ? [{ kennung: p.wort, richtig: !fehler.current.has(i) }] : [])) })
      }
    } else {
      fehler.current.add(links); fehler.current.add(r)
      setFalsch({ l: links, r })
      setTimeout(() => { setFalsch(null); setLinks(null) }, 550)
    }
  }
  return (
    <div className="pi-spalte pi-ein" data-pi-paare>
      <div className="pi-ober">Was gehört zusammen?</div>
      <p className="pi-leise">Tippe erst links ein italienisches Wort an, dann rechts die Bedeutung.</p>
      <div className="pi-paare">
        {a.paare.map((p, i) => {
          const r = rechts[i]
          const lStand = fertig.includes(i) ? 'fertig' : falsch?.l === i ? 'falsch' : links === i ? 'gewaehlt' : undefined
          const rStand = fertig.includes(r) ? 'fertig' : falsch?.r === r ? 'falsch' : undefined
          return (
            <div key={i} style={{ display: 'contents' }}>
              <button type="button" className="pi-paar pi-it" lang="it" data-stand={lStand} disabled={fertig.includes(i)} onClick={() => { if (!falsch) setLinks(i) }} data-pi-links={i}>{p.it}</button>
              <button type="button" className="pi-paar" data-stand={rStand} disabled={fertig.includes(r)} onClick={() => waehleRechts(r)} data-pi-rechts={r}>{a.paare[r].de}</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
