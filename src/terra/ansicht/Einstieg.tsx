// Terra Incognita — der Einstieg: Kapitän, Schiff und Flagge wählen. Liegt auf dem Netzlaufwerk schon ein
// Spielstand (anderer oder neuer PC), wird er angeboten.
import { useEffect, useState } from 'react'
import { saeubereName } from '../kern/namen'
import { neuereSicherung, spieleHierWeiter, useGemeinsam, type SicherungInfo } from '../netz/gemeinsam'
import { useTerra } from '../speicher'
import { tagText } from '../zeit'
import { FlaggenWahl } from './Einstellungen'
import { Bild } from './teile'

const SCHIFFE = ['Seeschwalbe', 'Morgenstern', 'Windsbraut', 'Zuversicht', 'Albatros', 'Möwe', 'Nordlicht', 'Sturmvogel', 'Gute Hoffnung', 'Kleine Freiheit']

export default function Einstieg() {
  const benutzer = useTerra(s => s.benutzer)
  const anzeigeName = useTerra(s => s.anzeigeName)
  const beginne = useTerra(s => s.beginne)
  const uebernimm = useTerra(s => s.uebernimm)
  const verschluesselung = useTerra(s => s.verschluesselung)
  const verbunden = useGemeinsam(s => s.verbunden)
  const [kapitaen, setKapitaen] = useState(() => (anzeigeName || benutzer).split(/[ ,]+/)[0] || '')
  const [schiff, setSchiff] = useState(() => SCHIFFE[Math.floor(Math.random() * SCHIFFE.length)])
  const [flagge, setFlagge] = useState<[number, number, number, number]>(() => [Math.floor(Math.random() * 6), Math.floor(Math.random() * 8), Math.floor(Math.random() * 8), 1 + Math.floor(Math.random() * 7)])
  const [sicherung, setSicherung] = useState<SicherungInfo | null>(null)
  const [fehler, setFehler] = useState('')
  useEffect(() => {
    if (!benutzer || !verbunden) return
    let lebt = true
    void neuereSicherung(benutzer, -1).then(s => { if (lebt) setSicherung(s) })
    return () => { lebt = false }
  }, [benutzer, verbunden])
  const los = (): void => {
    const k = saeubereName(kapitaen), s = saeubereName(schiff)
    if (!k || !s) { setFehler('Kapitän und Schiff brauchen einen Namen.'); return }
    beginne(k, s, flagge)
  }
  return (
    <div className="ti-schleier" style={{ position: 'absolute' }} data-ti-einstieg>
      <div className="ti-blatt">
        <Bild name="hafen" className="ti-blatt-bild" />
        <div className="ti-blatt-in">
          <div className="ti-ueber">Hamburg, am Kai</div>
          <h2>Terra Incognita</h2>
          <p className="ti-prosa">Vor dir liegt ein Boot, kaum größer als eine Nussschale, und dahinter das Meer, von dem die Karten nur den Anfang kennen. Segle hinaus, entdecke, was noch niemand gesehen hat – und kehre rechtzeitig um, solange der Proviant reicht. Was du als Erster im Hafen meldest, darfst du taufen: Dein Name dafür steht dann auf den Karten aller Kollegen.</p>
          {sicherung && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--ti-flaeche)', borderRadius: 6 }} data-ti-sicherung-da>
              <p><b>Du bist schon einmal ausgelaufen.</b> Auf dem Netzlaufwerk liegt dein Spielstand vom {tagText(sicherung.tag)}.</p>
              <button type="button" className="ti-knopf ti-knopf-gold" style={{ marginTop: 6 }} onClick={() => void sicherung.hole().then(d => (d ? uebernimm(d.stand, d.karte) : false)).then(ok => { if (ok) spieleHierWeiter(); else setFehler('Die Sicherung ließ sich nicht lesen.') })} data-ti-sicherung-holen>Dort weitermachen</button>
            </div>
          )}
          <h3>{sicherung ? 'Oder neu beginnen' : 'Wer sticht in See?'}</h3>
          <label className="ti-stumm">Dein Kapitänsname<input className="ti-eingabe" maxLength={28} value={kapitaen} onChange={e => setKapitaen(e.target.value)} data-ti-kapitaen autoFocus /></label>
          <label className="ti-stumm" style={{ display: 'block', marginTop: 8 }}>Wie heißt dein Schiff?<input className="ti-eingabe" maxLength={28} value={schiff} onChange={e => setSchiff(e.target.value)} data-ti-schiff /></label>
          <div style={{ marginTop: 10 }}><span className="ti-stumm" style={{ display: 'block', marginBottom: 4 }}>Deine Flagge</span><FlaggenWahl fl={flagge} onChange={setFlagge} /></div>
          {fehler && <p className="ti-fehler" style={{ marginTop: 8 }}>{fehler}</p>}
          <p className="ti-stumm" style={{ marginTop: 12 }}>Dein Spielstand liegt {verschluesselung ? 'verschlüsselt auf diesem PC' : 'nur in dieser Sitzung (auf diesem PC lässt sich nicht verschlüsselt speichern)'}. Kollegen sehen deinen Kapitänsnamen, Schiff, Rang und deine Taufnamen. Es gibt keine Fristen und keine Pflicht – wer wegbleibt, verliert nichts.</p>
          <div className="ti-fuss"><button type="button" className="ti-knopf ti-knopf-gold" onClick={los} data-ti-los>Leinen los!</button></div>
        </div>
      </div>
    </div>
  )
}
