// Der Coach — Erkennen durch Ordnen: Zuordnen (Karte → Fach), Reihenfolge (stark → schwach), Fehler finden.
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Schritt } from '../kern/inhaltTypen'
import { rng } from '../kern/zufall'
import { T } from '../ansicht/hilfen'
import type { BausteinProps } from './typen'
import { Weiter } from './Lesen'

export function Zuordnen({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'zuordnen' }>>) {
  const karten = useMemo(() => rng(s.kopf.id).misch(s.karten.map((k, i) => ({ ...k, i }))), [s])
  const [zu, setZu] = useState<Record<number, number>>({})
  // die erste Karte ist schon gewählt – man tippt gleich das Fach; danach springt die Auswahl zur nächsten offenen Karte
  const [aktiv, setAktiv] = useState<number | null>(() => karten[0]?.i ?? null)
  const [offen, setOffen] = useState(false)
  const alle = karten.every(k => zu[k.i] !== undefined)
  const richtig = karten.filter(k => zu[k.i] === k.fach).length
  const lege = (fach: number) => { if (aktiv === null) return; setZu(z => ({ ...z, [aktiv]: fach })); const naechste = karten.find(k => k.i !== aktiv && zu[k.i] === undefined); setAktiv(naechste ? naechste.i : null) }
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="zuordnen">
      <span className="dc-ober">Sortieren</span>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}>{s.auftrag}</p>
      <p className="dc-klein dc-leise" style={{ margin: 0 }}>Die markierte Aussage gehört in welches Fach? Eine andere Aussage kannst du jederzeit antippen.</p>
      {karten.map(k => (
        <button key={k.i} type="button" className="dc-wahl" disabled={offen} onClick={() => setAktiv(k.i)} data-an={aktiv === k.i ? '1' : undefined}
          data-gut={offen && zu[k.i] === k.fach ? '1' : undefined} data-schlecht={offen && zu[k.i] !== k.fach ? '1' : undefined} data-dc-karte={k.i} data-dc-offen={zu[k.i] === undefined ? '1' : undefined}>
          <span style={{ flex: 1 }}><T t={k.text} /></span>
          <span className="dc-chip" style={{ flex: 'none' }}>{zu[k.i] !== undefined ? s.faecher[zu[k.i]] : '…'}{offen && zu[k.i] !== k.fach && ` → ${s.faecher[k.fach]}`}</span>
        </button>
      ))}
      {!offen && <div className="dc-reihe">{s.faecher.map((f, i) => <button key={i} type="button" className="dc-knopf dc-knopf-leise" disabled={aktiv === null} onClick={() => lege(i)} data-dc-fach={i}>{f}</button>)}</div>}
      {!offen ? <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf" disabled={!alle} onClick={() => setOffen(true)} data-dc-pruefen>Prüfen</button></div>
        : <><div className="dc-rueck" data-gut={richtig === karten.length ? '1' : undefined}>{richtig} von {karten.length} richtig.</div><Weiter onClick={() => onFertig({ wert: richtig / karten.length })} /></>}
    </div>
  )
}

export function Rangfolge({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'rangfolge' }>>) {
  const [ord, setOrd] = useState(() => rng(s.kopf.id).misch(s.eintraege.map((e, i) => ({ ...e, i }))))
  const [offen, setOffen] = useState(false)
  const schiebe = (von: number, nach: number) => setOrd(o => { if (nach < 0 || nach >= o.length) return o; const n = [...o]; const [x] = n.splice(von, 1); n.splice(nach, 0, x); return n })
  // Wertung: Anteil richtig geordneter Paare
  let paare = 0, gut = 0
  for (let a = 0; a < ord.length; a++) for (let b = a + 1; b < ord.length; b++) { paare++; if (ord[a].i < ord[b].i) gut++ }
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="rangfolge">
      <span className="dc-ober">Reihenfolge</span>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}><T t={s.frage} /></p>
      <p className="dc-klein dc-leise" style={{ margin: 0 }}>Oben die stärkste, unten die schwächste.</p>
      {ord.map((e, pos) => (
        <div key={e.i} className="dc-wahl" style={{ cursor: 'default' }} data-gut={offen && e.i === pos ? '1' : undefined} data-schlecht={offen && e.i !== pos ? '1' : undefined}>
          <span className="dc-zeichen dc-zahl">{pos + 1}.</span>
          <span style={{ flex: 1 }}><T t={e.text} />{offen && <span className="dc-klein dc-leise" style={{ display: 'block' }}>Platz {e.i + 1}: {e.warum}</span>}</span>
          {!offen && <span className="dc-reihe" style={{ gap: 2, flex: 'none' }}>
            <button type="button" className="dc-knopf-nackt dc-knopf" onClick={() => schiebe(pos, pos - 1)} disabled={pos === 0} aria-label="nach oben"><ArrowUp size={15} /></button>
            <button type="button" className="dc-knopf-nackt dc-knopf" onClick={() => schiebe(pos, pos + 1)} disabled={pos === ord.length - 1} aria-label="nach unten"><ArrowDown size={15} /></button>
          </span>}
        </div>
      ))}
      {!offen ? <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf" onClick={() => setOffen(true)} data-dc-pruefen>Prüfen</button></div>
        : <><div className="dc-rueck" data-gut={gut === paare ? '1' : undefined}>{gut === paare ? 'Genau die richtige Reihenfolge.' : `${Math.round(gut / paare * 100)} % der Paare richtig geordnet.`}</div><Weiter onClick={() => onFertig({ wert: gut / paare })} /></>}
    </div>
  )
}

export function Fehler({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'fehler' }>>) {
  const [an, setAn] = useState<Set<number>>(new Set())
  const [offen, setOffen] = useState(false)
  const soll = s.teile.map((t, i) => (t.fehler ? i : -1)).filter(i => i >= 0)
  const treffer = soll.filter(i => an.has(i)).length
  const falsch = [...an].filter(i => !s.teile[i].fehler).length
  const wert = Math.max(0, (treffer - falsch) / soll.length)
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="fehler">
      <span className="dc-ober">Fehler finden</span>
      <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}>{s.auftrag}</p>
      <p className="dc-karte-flach" style={{ margin: 0, lineHeight: 2 }}>
        {s.teile.map((t, i) => (<span key={i}>
          {/* Leerzeichen zwischen den Teilen – außer vor Satzzeichen (die Teile selbst tragen keine Leerzeichen am Rand) */}
          {i > 0 && !/^[.,;:!?)»“”…–-]/.test(t.t) && ' '}
          <button type="button" disabled={offen} onClick={() => setAn(x => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n })}
            style={{ border: 0, padding: '1px 2px', borderRadius: 4, cursor: offen ? 'default' : 'pointer', background: offen ? (t.fehler ? 'var(--dc-gut-weich)' : an.has(i) ? 'var(--dc-schlecht-weich)' : 'transparent') : an.has(i) ? 'var(--dc-gelb-weich)' : 'transparent', textDecoration: an.has(i) ? 'underline' : 'none' }}
            aria-pressed={an.has(i)} data-dc-teil={i}>{t.t}</button>
        </span>))}
      </p>
      {!offen ? <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf" onClick={() => setOffen(true)} data-dc-pruefen>Prüfen</button></div>
        : <>
          <div className="dc-rueck" data-gut={wert >= 0.99 ? '1' : undefined}>{treffer} von {soll.length} gefunden{falsch ? `, ${falsch} zu viel markiert` : ''}.
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{soll.map(i => <li key={i}><b>„{s.teile[i].t.trim()}“</b> – {s.teile[i].fehler}</li>)}</ul>
          </div>
          <Weiter onClick={() => onFertig({ wert })} />
        </>}
    </div>
  )
}
