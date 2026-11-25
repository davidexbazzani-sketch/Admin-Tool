// Der Coach — Halle: alle vierzehn Bereiche als Karten; jede führt zur Bereichsseite (auch für nicht gewählte Bereiche).
import type { BereichId } from '../kern/inhaltTypen'
import { kursId } from '../kern/inhaltTypen'
import type { InhaltsIndex } from '../kern/index'
import { useCoach } from '../kern/speicher'
import { fortschritt } from '../kern/kurs'
import { Symbol } from '../ansicht/Symbol'
import { Raumbild } from '../ansicht/hilfen'
import { WissenSuche } from './WissenSuche'

export function Halle({ index, onBereich }: { index: InhaltsIndex; onBereich: (b: BereichId) => void }) {
  const daten = useCoach(s => s.daten)
  return (
    <div className="dc-breit dc-spalte" data-dc-halle>
      <div><span className="dc-ober">Freies Training</span><h1 className="dc-h1">Halle</h1></div>
      <Raumbild name="halle" hoehe={180} position="center 55%" />
      <p className="dc-leise" style={{ margin: 0 }}>Jeder Bereich hat seine eigene Seite: das Wissen dahinter, alle Übungen und Tests, die Aufgaben fürs echte Leben und Spickzettel. Offen für alle – auch für Bereiche, die du nicht gewählt hast.</p>
      <WissenSuche index={index} />
      <div className="dc-raster">
        {index.bereiche.map(b => {
          const gew = daten.profil.bereiche.includes(b.id)
          const st = daten.kurse[kursId(b.id)]
          const f = fortschritt(index, kursId(b.id), st)
          return (
            <button key={b.id} type="button" className="dc-wahl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }} onClick={() => onBereich(b.id)} data-dc-halle-bereich={b.id}>
              <span className="dc-reihe" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <span className="dc-reihe" style={{ gap: 8, flexWrap: 'nowrap' }}><Symbol name={b.zeichen} size={18} /><b>{b.name}</b></span>
                {gew && <span className={`dc-chip ${st?.aktiv ? 'dc-chip-rot' : ''}`}>{st?.aktiv ? 'im Training' : 'gewählt'}</span>}
              </span>
              <span className="dc-klein dc-leise">{b.kurz}</span>
              {f.gesamt > 0 ? <span className="dc-balken" title={`${f.erledigt} von ${f.gesamt} Lerntagen`}><i style={{ width: `${(f.erledigt / f.gesamt) * 100}%` }} /></span> : <span className="dc-klein dc-stumm">Inhalte folgen</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
