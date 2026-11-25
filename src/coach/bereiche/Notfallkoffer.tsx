// Der Coach — Notfallkoffer (für alle, egal welche Bereiche gewählt sind): Runterfahren in 60 Sekunden, Mittendrin,
// die Werkzeuge mit gemessener Wirkung („Was bei mir wirkt“) und „Gleich geht's los“.
// Die Rangliste ist eine Beobachtung, kein Versprechen – erst ab drei Einsätzen je Werkzeug.
import { useState } from 'react'
import { ArrowLeft, LifeBuoy, Phone } from 'lucide-react'
import type { Werkzeug } from '../kern/inhaltTypen'
import { useCoach } from '../kern/speicher'
import { Bruno, Raumbild, T, useGemeinsam, useZeile } from '../ansicht/hilfen'
import { Anspannung, Atemkreis } from '../uebungen/Gefuehrt'
import { Weiter } from '../uebungen/Lesen'
import { verbucheErgebnis } from '../ablauf/verbuchen'
import { Routine } from '../uebungen/Gefuehrt'
import { ErnstfallBereich } from './Ernstfaelle'
import { BrunoTon } from '../ansicht/BrunoTon'
import { GEFUEHRT } from '../ton/bruno'

/** Bausteine für die eigene Startroutine (Format „routine“) */
const ROUTINE_BAUSTEINE = ['Fünf lange Ausatmer', 'Schultern hochziehen und fallen lassen', 'Füße fest auf den Boden', 'Satz sagen: „Ich bin aufgeregt – mein Körper macht sich bereit.“', 'Ersten Satz einmal leise sprechen', 'Ein freundliches Gesicht suchen', 'Einen Schluck Wasser', 'Hände kurz kräftig drücken, dann locker lassen', 'An das Ziel denken: Was sollen die anderen am Ende wissen?']

export function rangliste(werkzeuge: Werkzeug[], wirkung: Record<string, number[]>): { w: Werkzeug; mittel: number | null }[] {
  const mit = werkzeuge.map((w, i) => { const x = wirkung[w.id] ?? []; return { w, i, mittel: x.length >= 3 ? x.reduce((a, b) => a + b, 0) / x.length : null, n: x.length } })
  return mit.sort((a, b) => {
    const ma = a.mittel !== null && !(a.n >= 5 && a.mittel < 3) ? a.mittel : -1
    const mb = b.mittel !== null && !(b.n >= 5 && b.mittel < 3) ? b.mittel : -1
    if (ma !== mb) return mb - ma
    return a.i - b.i
  }).map(x => ({ w: x.w, mittel: x.mittel }))
}

function WerkzeugLauf({ w, onEnde }: { w: Werkzeug; onEnde: () => void }) {
  const [vorher, setVorher] = useState<number | null>(null)
  const [nachher, setNachher] = useState<number | null>(null)
  const [stufe, setStufe] = useState(0)
  return (
    <div className="dc-spalte dc-ein" data-dc-werkzeug={w.id}>
      <h3 className="dc-h2">{w.titel}</h3>
      {stufe === 0 && <><Anspannung titel="Anspannung jetzt:" wert={vorher} setWert={setVorher} /><Weiter text="Los" onClick={() => setStufe(1)} /></>}
      {stufe === 1 && <>{GEFUEHRT.has(w.id) && <div><BrunoTon datei={`gefuehrt-${w.id}.ogg`} /></div>}<ol style={{ margin: 0, paddingLeft: 20 }}>{w.schritte.map((s, i) => <li key={i}><T t={s} /></li>)}</ol>
        {(w.id === 'ausatmen' || w.id === 'seufzer') && <Atemkreis ein={w.id === 'seufzer' ? 3 : 4} aus={w.id === 'seufzer' ? 7 : 8} runden={w.id === 'seufzer' ? 4 : 6} onEnde={() => undefined} />}
        {w.hinweis && <p className="dc-klein dc-leise" style={{ margin: 0 }}>{w.hinweis}</p>}
        <Weiter text="Gemacht" onClick={() => setStufe(2)} /></>}
      {stufe === 2 && <><Anspannung titel="Und jetzt?" wert={nachher} setWert={setNachher} />
        <Weiter onClick={() => { if (vorher !== null && nachher !== null) verbucheErgebnis(undefined, { wirkung: { werkzeug: w.id, vorher, nachher } }); onEnde() }} /></>}
    </div>
  )
}

function Sechzig({ onEnde }: { onEnde: () => void }) {
  const [phase, setPhase] = useState(0)
  const zeile = useZeile('ernstfall', 'sechzig')
  return (
    <div className="dc-spalte dc-ein" data-dc-sechzig>
      <h3 className="dc-h2">Runterfahren in 60 Sekunden</h3>
      {phase === 0 && <><div><BrunoTon datei="gefuehrt-sechzig.ogg" text="Bruno führt dich durch" /></div><p style={{ margin: 0 }}>Fünf lange Ausatmer. Durch die Nase ein, durch leicht gespitzte Lippen lang aus.</p><Atemkreis ein={4} aus={7} runden={5} onEnde={() => setPhase(1)} /><span className="dc-klein dc-stumm">Wird dir schwummrig: aufhören und normal weiteratmen.</span></>}
      {phase === 1 && <><p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}>Sag dir: „Ich bin aufgeregt – mein Körper stellt Energie bereit.“</p><Weiter onClick={() => setPhase(2)} /></>}
      {phase === 2 && <><p className="dc-gross" style={{ margin: 0 }}>Blick nach außen: Benenn drei Dinge im Raum. Such dir ein freundliches Gesicht. Was sollen die Leute am Ende wissen?</p><Bruno gross haltung="ruhig" text={zeile} /><Weiter text="Fertig" onClick={onEnde} /></>}
    </div>
  )
}

export function Notfallkoffer({ start, onZurueck }: { start?: string; onZurueck: () => void }) {
  const g = useGemeinsam()
  const wirkung = useCoach(s => s.daten.wirkung)
  const routine = useCoach(s => [...s.buch.eintraege].reverse().find(e => e.art === 'routine'))
  const bereiche = useCoach(s => s.daten.profil.bereiche)
  const [ansicht, setAnsicht] = useState<string | null>(start ?? null)
  if (!g) return null
  const liste = rangliste(g.werkzeuge, wirkung)
  const gleich = g.gleich.find(x => x.id === ansicht)
  const werkzeug = g.werkzeuge.find(w => `w:${w.id}` === ansicht)
  return (
    <div className="dc-breit dc-spalte" data-dc-notfall>
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}>
        <h1 className="dc-h1"><LifeBuoy size={24} style={{ verticalAlign: -3, color: 'var(--dc-gelb)' }} /> Notfallkoffer</h1>
        <button type="button" className="dc-knopf dc-knopf-nackt" onClick={ansicht ? () => setAnsicht(null) : onZurueck}><ArrowLeft size={15} />{ansicht ? 'Koffer' : 'Zurück'}</button>
      </div>
      {!ansicht && <Raumbild name="notfall" hoehe={150} position="center 22%" />}
      {ansicht === 'sechzig' && <div className="dc-karte"><Sechzig onEnde={() => setAnsicht(null)} /></div>}
      {ansicht === 'mittendrin' && <div className="dc-karte dc-spalte dc-ein"><h3 className="dc-h2">Wenn es dich mittendrin erwischt</h3><ol style={{ margin: 0, paddingLeft: 20 }} className="dc-gross">{g.mittendrin.map((m, i) => <li key={i}>{m}</li>)}</ol><Weiter text="Okay" onClick={() => setAnsicht(null)} /></div>}
      {gleich && <div className="dc-karte dc-spalte dc-ein"><h3 className="dc-h2">{gleich.titel}</h3><ol style={{ margin: 0, paddingLeft: 20 }} className="dc-gross">{gleich.schritte.map((m, i) => <li key={i}>{m}</li>)}</ol><Weiter text="Bereit" onClick={() => setAnsicht(null)} /></div>}
      {werkzeug && <div className="dc-karte"><WerkzeugLauf w={werkzeug} onEnde={() => setAnsicht(null)} /></div>}
      {ansicht === 'routine' && <div className="dc-karte"><Routine s={{ art: 'routine', bausteine: ROUTINE_BAUSTEINE, mindestens: 3, hoechstens: 5 }} ohneUhr onFertig={r => { verbucheErgebnis(undefined, r); setAnsicht(null) }} /></div>}
      {(ansicht === 'fahrplan' || ansicht?.startsWith('auswerten:')) && <ErnstfallBereich auswerten={ansicht.startsWith('auswerten:') ? ansicht.slice(10) : undefined} />}
      {!ansicht && <>
        <div className="dc-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          <button type="button" className="dc-wahl" style={{ borderColor: 'var(--dc-rot)', padding: 18 }} onClick={() => setAnsicht('sechzig')} data-dc-sechzig-los><span className="dc-zeichen">⏱</span><span><b className="dc-gross">Runterfahren in 60 Sekunden</b><span className="dc-klein dc-leise" style={{ display: 'block' }}>Atmen, umdeuten, Blick nach außen</span></span></button>
          <button type="button" className="dc-wahl" style={{ padding: 18 }} onClick={() => setAnsicht('mittendrin')}><span className="dc-zeichen">!</span><span><b className="dc-gross">Mittendrin</b><span className="dc-klein dc-leise" style={{ display: 'block' }}>Wenn es dich beim Sprechen erwischt</span></span></button>
        </div>
        <div className="dc-karte-flach dc-spalte" style={{ gap: 6 }} data-dc-startroutine>
          <span className="dc-ober">Deine Startroutine</span>
          {routine ? <span className="dc-gross" style={{ fontWeight: 600 }}>{routine.text}</span> : <span className="dc-klein dc-leise">Drei bis fünf feste Schritte für die letzte Minute – immer gleich, damit der Kopf nichts entscheiden muss.</span>}
          <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf dc-knopf-leise" onClick={() => setAnsicht('routine')} data-dc-routine-bauen>{routine ? 'Neu zusammenstellen' : 'Routine bauen'}</button></div>
        </div>
        <ErnstfallBereich />
        <span className="dc-ober">Gleich geht's los</span>
        <div className="dc-raster">{g.gleich.filter(x => !x.bereich || bereiche.includes(x.bereich)).map(x => <button key={x.id} type="button" className="dc-wahl" onClick={() => setAnsicht(x.id)}>{x.titel}</button>)}</div>
        <span className="dc-ober">Was bei mir wirkt</span>
        <span className="dc-klein dc-stumm">Nach jedem Einsatz fragt Bruno die Anspannung vorher und nachher ab. Ab drei Einsätzen sortiert sich die Liste nach dem, was bei dir wirkt – eine Beobachtung, kein Versprechen.</span>
        <div className="dc-raster">{liste.map(({ w, mittel }) => <button key={w.id} type="button" className="dc-wahl" onClick={() => setAnsicht(`w:${w.id}`)} data-dc-werkzeug-los={w.id}><span style={{ flex: 1 }}><b>{w.titel}</b><span className="dc-klein dc-stumm" style={{ display: 'block' }}>{w.sekunden} Sekunden{w.unauffaellig ? ' · unauffällig' : ''}{mittel !== null ? ` · senkt bei dir im Schnitt um ${Math.round(mittel)}` : ''}</span></span></button>)}</div>
        <div className="dc-karte-flach dc-spalte dc-klein" style={{ gap: 8 }} data-dc-hilfe>
          <div className="dc-reihe" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><Phone size={16} style={{ flex: 'none', marginTop: 2 }} /><span className="dc-leise">{g.fachhilfe.seele} Wer Panikattacken erlebt oder ohne Alkohol oder Tabletten nicht mehr auftritt, sollte mit einer Ärztin oder einem Arzt sprechen. Medikamente empfiehlt der Coach nicht.</span></div>
          {/* weitere Hilfen: aufklappbar, damit der Koffer ruhig bleibt */}
          <details data-dc-hilfe-belaestigung><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Wenn dich jemand bedrängt, bedroht oder belästigt</summary><p className="dc-leise" style={{ margin: '6px 0 0' }}>{g.fachhilfe.belaestigung}</p></details>
          <details data-dc-hilfe-mobbing><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Wenn dich jemand bei der Arbeit schikaniert</summary><p className="dc-leise" style={{ margin: '6px 0 0' }}>{g.fachhilfe.mobbing}</p></details>
        </div>
      </>}
    </div>
  )
}
