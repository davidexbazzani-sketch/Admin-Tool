// Der Coach — Verstehen: Erklärkarte, Studie, Fachhilfe, Schätzfrage, Mythos oder Fakt, Vorher/Nachher.
import { useState } from 'react'
import { ArrowRight, LifeBuoy, Phone } from 'lucide-react'
import type { Schritt } from '../kern/inhaltTypen'
import { BelegChip, Quellen, T, useGemeinsam } from '../ansicht/hilfen'
import type { BausteinProps } from './typen'

export function Weiter({ onClick, text = 'Weiter', auto }: { onClick: () => void; text?: string; auto?: boolean }) {
  return <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf" onClick={onClick} autoFocus={auto !== false} data-dc-weiter>{text}<ArrowRight size={16} /></button></div>
}

export function Karte({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'karte' }>>) {
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="karte">
      {s.titel && <h3 className="dc-h2">{s.titel}</h3>}
      <p className="dc-gross" style={{ margin: 0 }}><T t={s.text} /></p>
      <Weiter onClick={() => onFertig({})} />
    </div>
  )
}

export function Studie({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'studie' }>>) {
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="studie">
      <div className="dc-reihe"><span className="dc-ober">Studie in 60 Sekunden</span><BelegChip b={s.beleg} /></div>
      <p style={{ margin: 0 }}><b>Die Frage:</b> {s.frage}</p>
      <p style={{ margin: 0 }}><b>So wurde es untersucht:</b> {s.aufbau}</p>
      <p style={{ margin: 0 }}><b>Das kam heraus:</b> {s.ergebnis}</p>
      <p className="dc-leise" style={{ margin: 0 }}><b>Die Grenze:</b> {s.grenze}</p>
      <Quellen ids={s.quellen} />
      <Weiter onClick={() => onFertig({})} />
    </div>
  )
}

export function Fachhilfe({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'fachhilfe' }>>) {
  const g = useGemeinsam()
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="fachhilfe">
      <div className="dc-karte-flach dc-reihe" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', borderColor: s.thema === 'notfall' ? 'var(--dc-rot)' : undefined }}>
        {s.thema === 'notfall' || s.thema === 'seele' || s.thema === 'belaestigung' ? <Phone size={20} style={{ flex: 'none', color: 'var(--dc-rot)' }} /> : <LifeBuoy size={20} style={{ flex: 'none', color: 'var(--dc-gelb)' }} />}
        <p style={{ margin: 0 }}>{g?.fachhilfe[s.thema] ?? ''}</p>
      </div>
      <Weiter onClick={() => onFertig({})} />
    </div>
  )
}

export function Schaetzen({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'schaetzen' }>>) {
  const [wahl, setWahl] = useState<number | null>(null)
  const [offen, setOffen] = useState(false)
  const zeige = () => setOffen(true)
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="schaetzen">
      <span className="dc-ober">Schätz mal</span>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}>{s.frage}</p>
      {s.optionen?.map((o, i) => (
        <button key={i} type="button" className="dc-wahl" disabled={offen} onClick={() => { setWahl(i); zeige() }}
          data-an={wahl === i ? '1' : undefined} data-gut={offen && i === s.richtig ? '1' : undefined} data-schlecht={offen && wahl === i && i !== s.richtig ? '1' : undefined}>
          <span className="dc-zeichen">{offen && i === s.richtig ? '✓' : offen && wahl === i ? '✗' : String.fromCharCode(65 + i)}</span><span>{o}</span>
        </button>
      ))}
      {!s.optionen && !offen && <div className="dc-reihe"><button type="button" className="dc-knopf dc-knopf-leise" onClick={zeige} autoFocus data-dc-aufloesen>Ich habe geschätzt – auflösen</button></div>}
      {offen && <div className="dc-rueck dc-ein" data-gut={s.optionen ? (wahl === s.richtig ? '1' : undefined) : '1'}><b>{s.loesung}</b><br />{s.aufloesung}</div>}
      {offen && <Weiter onClick={() => onFertig({})} />}
    </div>
  )
}

const URTEIL: Record<'stimmt' | 'teils' | 'falsch', string> = { stimmt: 'Stimmt', teils: 'Teils', falsch: 'Mythos' }
export function Mythos({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'mythos' }>>) {
  const [wahl, setWahl] = useState<'stimmt' | 'teils' | 'falsch' | null>(null)
  const richtig = wahl === s.urteil
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="mythos">
      <span className="dc-ober">Mythos oder Fakt?</span>
      <p className="dc-gross dc-zitat" style={{ margin: 0 }}>„{s.aussage}“</p>
      <div className="dc-reihe">
        {(['stimmt', 'teils', 'falsch'] as const).map(u => (
          <button key={u} type="button" className="dc-wahl" style={{ width: 'auto' }} disabled={!!wahl} onClick={() => setWahl(u)}
            data-gut={wahl && u === s.urteil ? '1' : undefined} data-schlecht={wahl === u && u !== s.urteil ? '1' : undefined}>
            {wahl && u === s.urteil ? '✓ ' : wahl === u ? '✗ ' : ''}{URTEIL[u]}
          </button>
        ))}
      </div>
      {wahl && <div className="dc-rueck dc-ein" data-gut={richtig ? '1' : undefined}><b>{URTEIL[s.urteil]}.</b> {s.warum}</div>}
      {wahl && <Weiter onClick={() => onFertig({})} />}
    </div>
  )
}

export function Vergleich({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'vergleich' }>>) {
  const [offen, setOffen] = useState(false)
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="vergleich">
      <span className="dc-ober">Vorher – nachher</span>
      <p style={{ margin: 0 }}>{s.lage}</p>
      <div className="dc-raster" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="dc-karte-flach"><div className="dc-klein dc-stumm">Fassung A</div><T t={s.schwach} /></div>
        <div className="dc-karte-flach" style={{ borderColor: 'var(--dc-rot)' }}><div className="dc-klein dc-stumm">Fassung B</div><T t={s.stark} /></div>
      </div>
      <p style={{ margin: 0, fontWeight: 600 }}>{s.frage}</p>
      {!offen ? <div className="dc-reihe"><button type="button" className="dc-knopf dc-knopf-leise" onClick={() => setOffen(true)} autoFocus data-dc-aufloesen>Kurz überlegen – dann auflösen</button></div>
        : <><div className="dc-rueck dc-ein" data-gut="1">{s.unterschied}</div><Weiter onClick={() => onFertig({})} /></>}
    </div>
  )
}
