// Der Coach — Erkennen: Auswahl mit gestuften Antworten (auch Wortwahl, Trick erkennen, Tonfall, Szene) und Signal-Bündel.
// Bei manchen Aufgaben fragt der Coach vor der Auflösung, wie sicher man ist (Kalibrierung).
import { useMemo, useState } from 'react'
import { host } from '../host/aktiv'
import type { Schritt, Wahl as WahlT } from '../kern/inhaltTypen'
import { rng } from '../kern/zufall'
import { T, mitName, useName, useZeile } from '../ansicht/hilfen'
import type { BausteinProps } from './typen'
import { Weiter } from './Lesen'

type WahlSchritt = Extract<Schritt, { art: 'auswahl' | 'wortwahl' | 'kunstgriff' | 'tonfall' | 'szene' }>

/** Szenenbild (Stufe 4): ergänzt die Beschreibung, ersetzt sie nie; fehlt die Datei, bleibt nur der Text */
export function SzenenBild({ bild }: { bild?: string }) {
  const [da, setDa] = useState(true)
  if (!bild || !da) return null
  return <img src={host().bildPfad(`szenen/${bild}`)} alt="" loading="lazy" onError={() => setDa(false)} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 10, display: 'block' }} data-dc-szenenbild />
}

const SICHER = [{ w: 0.25, t: 'geraten' }, { w: 0.5, t: 'eher unsicher' }, { w: 0.75, t: 'ziemlich sicher' }, { w: 0.95, t: 'ganz sicher' }]

export function Auswahl({ s, onFertig }: BausteinProps<WahlSchritt>) {
  const name = useName()
  const antworten = useMemo(() => rng(s.kopf.id).misch(s.antworten), [s])
  const [wahl, setWahl] = useState<WahlT | null>(null)
  const [sicher, setSicher] = useState<number | null>(null)
  const brauchtSicher = s.art === 'auswahl' && !!s.sicherheit
  const zeile = useZeile(wahl ? (wahl.wert === 2 ? 'richtig' : 'falsch') : 'richtig', s.kopf.id)
  const beste = s.antworten.find(a => a.wert === 2)
  const fertig = () => onFertig({ wert: (wahl?.wert ?? 0) / 2, sicherheit: sicher ?? undefined, tendenzen: s.antworten.map(a => a.tendenz).filter((x): x is string => !!x), gewaehlt: wahl?.tendenz })
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt={s.art}>
      {s.art === 'kunstgriff' && <><span className="dc-ober">Trick erkennen</span><p style={{ margin: 0 }} className="dc-zitat">{s.lage}</p></>}
      {s.art === 'szene' && <><span className="dc-ober">Szene lesen</span><SzenenBild bild={s.bild} /><p style={{ margin: 0 }} className="dc-karte-flach">{s.beschreibung}</p></>}
      {s.art === 'tonfall' && <>
        <span className="dc-ober">Tonfall</span>
        <p className="dc-gross" style={{ margin: 0 }}>„{s.satz}“</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{s.fassungen.map((f, i) => <li key={i}><b>{f.betont}</b> – {f.bedeutung}</li>)}</ul>
      </>}
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}><T t={s.frage} /></p>
      {brauchtSicher && !wahl && (
        <div className="dc-reihe dc-klein"><span className="dc-leise">Wie sicher bist du?</span>
          {SICHER.map(x => <button key={x.t} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: sicher === x.w ? 'var(--dc-gelb)' : undefined }} onClick={() => setSicher(x.w)} aria-pressed={sicher === x.w}>{x.t}</button>)}
        </div>
      )}
      {antworten.map((a, i) => {
        const gezeigt = !!wahl
        return (
          <button key={i} type="button" className="dc-wahl" disabled={gezeigt || (brauchtSicher && sicher === null)} onClick={() => setWahl(a)} data-dc-antwort={a.wert}
            data-gut={gezeigt && a.wert === 2 ? '1' : undefined} data-mittel={gezeigt && a.wert === 1 && wahl === a ? '1' : undefined} data-schlecht={gezeigt && a.wert === 0 && wahl === a ? '1' : undefined}>
            <span className="dc-zeichen" aria-hidden>{gezeigt ? (a.wert === 2 ? '✓' : a.wert === 1 ? '~' : wahl === a ? '✗' : '') : String.fromCharCode(65 + i)}</span>
            <span style={{ flex: 1 }}>{mitName(a.text, name)}{gezeigt && (wahl === a || a.wert === 2) && <span className="dc-klein dc-leise" style={{ display: 'block', marginTop: 3 }}>{a.warum}</span>}</span>
            {gezeigt && <span className="dc-klein dc-stumm" style={{ flex: 'none' }}>{a.wert === 2 ? 'stark' : a.wert === 1 ? 'brauchbar' : 'schwach'}</span>}
          </button>
        )
      })}
      {wahl && <div className="dc-rueck dc-ein" data-gut={wahl.wert === 2 ? '1' : undefined}>{zeile}{wahl.wert < 2 && beste && <> Die stärkste Antwort: <b>{mitName(beste.text, name)}</b></>}</div>}
      {wahl && s.art === 'kunstgriff' && <p className="dc-leise" style={{ margin: 0 }}>{s.erklaerung}</p>}
      {wahl && <Weiter onClick={fertig} />}
    </div>
  )
}

export function Buendel({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'buendel' }>>) {
  const zeichen = useMemo(() => rng(s.kopf.id).misch(s.zeichen), [s])
  const [an, setAn] = useState<Set<number>>(new Set())
  const [offen, setOffen] = useState(false)
  const treffer = zeichen.filter((z, i) => an.has(i) === z.stuetzt).length / zeichen.length
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="buendel">
      <span className="dc-ober">Signal-Bündel</span>
      <SzenenBild bild={s.bild} />
      <p style={{ margin: 0 }} className="dc-karte-flach">{s.lage}</p>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}>{s.frage}</p>
      {zeichen.map((z, i) => (
        <button key={i} type="button" className="dc-wahl" disabled={offen} onClick={() => setAn(x => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n })}
          data-an={!offen && an.has(i) ? '1' : undefined} data-gut={offen && z.stuetzt ? '1' : undefined} data-schlecht={offen && an.has(i) && !z.stuetzt ? '1' : undefined} aria-pressed={an.has(i)}>
          <span className="dc-zeichen">{an.has(i) ? '■' : '□'}</span>
          <span>{z.text}{offen && <span className="dc-klein dc-leise" style={{ display: 'block' }}>{z.warum}</span>}</span>
        </button>
      ))}
      {!offen ? <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf" onClick={() => setOffen(true)} disabled={!an.size} data-dc-pruefen>Prüfen</button></div>
        : <><div className="dc-rueck" data-gut={treffer >= 0.8 ? '1' : undefined}>Am besten gestützt sind die markierten grünen Zeichen – sicher ist eine Deutung trotzdem nie. So prüfst du es: als Frage aussprechen.</div><Weiter onClick={() => onFertig({ wert: treffer })} /></>}
    </div>
  )
}
