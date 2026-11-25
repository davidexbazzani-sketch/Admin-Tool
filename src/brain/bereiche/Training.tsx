// Training: alle Übungen nach Gebiet, mit eigener Stufe und Bestwert.
import { useMemo } from 'react'
import { Clock, Swords } from 'lucide-react'
import { GEBIETE, type KatalogEintrag } from '../kern/typen'
import { KATALOG } from '../kern/katalog'
import { useBrain } from '../kern/speicher'
import { bestwerte } from '../kern/fortschritt'
import { standGebiet } from '../kern/wertung'
import { GebietSymbol } from '../Symbole'

export default function Training({ onStart }: { onStart: (u: KatalogEintrag) => void }) {
  const daten = useBrain(s => s.daten)
  const beste = useMemo(() => bestwerte(daten), [daten])

  return (
    <div className="bt-breite" data-bt-bereich="training">
      <h1 className="bt-h1">Training</h1>
      <p className="bt-leise" style={{ margin: '6px 0 22px' }}>
        {KATALOG.length} Übungen in {GEBIETE.filter(g => KATALOG.some(u => u.gebiet === g.id)).length} Gebieten. Jede Übung merkt sich deine Stufe und wird von selbst schwerer oder leichter.
      </p>

      {GEBIETE.map(g => {
        const liste = KATALOG.filter(u => u.gebiet === g.id)
        if (!liste.length) return null
        const stand = standGebiet(daten.laeufe, g.id)
        return (
          <section key={g.id} style={{ marginBottom: 28 }} data-bt-gebiet={g.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span className="bt-symbol"><GebietSymbol gebiet={g.id} /></span>
              <div>
                <h2 className="bt-h2">{g.name}</h2>
                <div className="bt-klein bt-leise">{g.satz}</div>
              </div>
              {stand !== null && <span className="bt-chip bt-chip-akzent bt-zahl" style={{ marginLeft: 'auto' }} title="Dein Stand in diesem Gebiet (0–1000)">Stand {stand}</span>}
            </div>
            <div className="bt-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
              {liste.map(u => {
                const b = beste[u.id]
                return (
                  <button key={u.id} type="button" className="bt-karte bt-karte-klick" onClick={() => onStart(u)} data-bt-karte={u.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span className="bt-h3" style={{ flex: 1, minWidth: 0 }}>{u.name}</span>
                      <span className="bt-chip bt-zahl">Stufe {daten.stufen[u.id] ?? 1}</span>
                    </div>
                    <div className="bt-klein bt-leise" style={{ minHeight: 36 }}>{u.kurz}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }} className="bt-klein bt-stumm">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} />{u.dauer}</span>
                      {u.duell && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Auch als Duell möglich"><Swords size={12} />Duell</span>}
                      <span style={{ marginLeft: 'auto' }} className="bt-zahl">{b ? `Bestwert ${b.best}` : 'neu'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
