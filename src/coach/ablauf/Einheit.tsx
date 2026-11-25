// Der Coach — eine Einheit durchspielen: Kopf, Schritte (verstehen → üben → anwenden), Abschluss mit Aha, Regel, Merkkarten.
// Laute Übungen: Ist „Ich kann gerade laut sprechen“ aus, kommt die stille Ersatzübung, und die laute wandert auf die
// Liste „Später laut“.
import { useEffect, useState } from 'react'
import type { Einheit as EinheitT, Schritt as S } from '../kern/inhaltTypen'
import { hatKopf } from '../kern/inhaltTypen'
import { ladeEinheit, ladeVorrat } from '../kern/inhalt'
import { useCoach } from '../kern/speicher'
import { legeKarten } from '../kern/buchung'
import { heute } from '../kern/zeit'
import { BelegChip, Laedt, Quellen, T } from '../ansicht/hilfen'
import { Schritt } from '../uebungen/Schritt'
import { Weiter } from '../uebungen/Lesen'
import { MissionWahl } from './Mission'
import { verbucheErgebnis } from './verbuchen'

export function EinheitLauf({ id, laut, ohneUhr, kurz, onFertig }: { id: string; laut: boolean; ohneUhr: boolean; kurz?: boolean; onFertig: () => void }) {
  const [e, setE] = useState<EinheitT | null>(null)
  const [schritte, setSchritte] = useState<S[] | null>(null)
  const [i, setI] = useState(-1)
  useEffect(() => {
    let lebt = true
    void (async () => {
      const x = await ladeEinheit(id)
      if (!x || !lebt) return
      // laute Schritte ersetzen, wenn gerade nicht laut gesprochen werden kann
      const liste: S[] = []
      for (const s of x.schritte) {
        if (hatKopf(s) && s.kopf.laut && !laut) {
          const ersatz = s.kopf.leise ? await ladeVorrat(s.kopf.leise) : null
          verbucheErgebnis(undefined, { spaeterLaut: s.kopf.id })
          if (ersatz) liste.push(ersatz)
        } else liste.push(s)
      }
      // Kurzfassung (laut Einstufung bekannt): eine Übung, Regel, Merkkarten
      const kurzListe = kurz ? [liste.find(s => hatKopf(s)) ?? liste[0], ...liste.filter(s => s.art === 'mission')].filter(Boolean) : liste
      if (lebt) { setE(x); setSchritte(kurzListe) }
    })()
    return () => { lebt = false }
  }, [id, laut, kurz])
  if (!e || !schritte) return <Laedt />
  const weiter = () => setI(x => x + 1)
  const ende = i >= schritte.length
  const s = schritte[i]
  return (
    <div className="dc-lauf" data-dc-einheit={id}>
      <div className="dc-fortschritt" aria-hidden><i style={{ width: `${Math.max(0, Math.min(1, (i + 1) / (schritte.length + 1))) * 100}%` }} /></div>
      {i < 0 && (
        <div className="dc-karte dc-spalte dc-ein">
          <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><span className="dc-ober">{kurz ? 'Kurzfassung' : 'Neue Einheit'} · {e.dauerMin} Minuten</span><BelegChip b={e.beleg} hinweis={e.belegHinweis} /></div>
          <h2 className="dc-h1">{e.titel}</h2>
          {kurz && <p className="dc-leise" style={{ margin: 0 }}>Laut Einstufung kennst du das schon – deshalb die schnelle Fassung.</p>}
          <Weiter text="Los" onClick={weiter} />
        </div>
      )}
      {s && (
        <div className="dc-karte" key={i}>
          {s.art === 'mission'
            ? <MissionWahl id={s.ref} onFertig={weiter} />
            : <Schritt s={s} ohneUhr={ohneUhr} onFertig={r => { verbucheErgebnis(hatKopf(s) ? s.kopf : undefined, r); weiter() }} />}
        </div>
      )}
      {ende && (
        <div className="dc-karte dc-spalte dc-ein" data-dc-einheit-ende>
          <span className="dc-ober">Das nimmst du mit</span>
          <p className="dc-gross" style={{ margin: 0 }}><T t={e.aha} /></p>
          <div className="dc-karte-flach" style={{ borderColor: 'var(--dc-rot)' }}><b>Regel:</b> {e.regel}</div>
          <div className="dc-klein dc-leise">Neue Merkkarten für die Wiederholung: {e.merkkarten.map(m => m.frage).join(' · ')}</div>
          {e.belegHinweis && <details className="dc-klein dc-leise"><summary style={{ cursor: 'pointer' }}>Wie gut ist das belegt?</summary><p style={{ margin: '6px 0' }}>{e.belegHinweis}</p><Quellen ids={e.quellen} /></details>}
          <Weiter onClick={() => { useCoach.getState().aendere(d => legeKarten(d, e.merkkarten.map(m => `m:${m.id}`), heute())); onFertig() }} />
        </div>
      )}
    </div>
  )
}
