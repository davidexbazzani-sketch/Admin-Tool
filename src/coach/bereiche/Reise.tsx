// Der Coach — Reise: die Strecke mit Runden (gezeichnet, kein Bild), Fortschritt je Kurs, Staffel.
// Vergangenes bleibt stehen, Kommendes passt sich an, wenn Bereiche wechseln.
import { ArrowUp } from 'lucide-react'
import type { BereichId } from '../kern/inhaltTypen'
import { PHASEN, kursId } from '../kern/inhaltTypen'
import type { InhaltsIndex } from '../kern/index'
import { useCoach } from '../kern/speicher'
import { fortschritt, gewaehlt, kurseVonBereich, pflegeStaffel, staffelGroesse } from '../kern/kurs'
import { heute, tagNummer } from '../kern/zeit'
import { Symbol } from '../ansicht/Symbol'

function Strecke({ runde, trainings }: { runde: number; trainings: number }) {
  const von = Math.max(1, runde - 3)
  const stationen = Array.from({ length: 8 }, (_, i) => von + i)
  const breite = 720, hoehe = 120
  const x = (i: number) => 40 + i * ((breite - 80) / 7)
  const y = (i: number) => (i % 2 ? 40 : 80)
  const pfad = stationen.map((_, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(i)}`).join(' ')
  return (
    <div className="dc-strecke" data-dc-strecke>
      <svg viewBox={`0 0 ${breite} ${hoehe}`} role="img" aria-label={`Runde ${runde}, ${trainings} von 5 Trainings`}>
        <path d={pfad} fill="none" stroke="var(--dc-rand)" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 12" />
        {stationen.map((r, i) => {
          const vorbei = r < runde, jetzt = r === runde
          return (
            <g key={r}>
              <circle cx={x(i)} cy={y(i)} r={jetzt ? 18 : 13} fill={vorbei ? 'var(--dc-rot)' : jetzt ? 'var(--dc-gelb)' : 'var(--dc-flaeche2)'} stroke="var(--dc-rand)" strokeWidth="2" />
              <text x={x(i)} y={y(i) + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={vorbei ? 'var(--dc-rot-ink)' : jetzt ? 'var(--dc-gelb-ink)' : 'var(--dc-leise)'} fontFamily="var(--dc-titel)">{vorbei ? '✓' : r}</text>
              {r % 4 === 0 && <text x={x(i)} y={y(i) + (i % 2 ? -24 : 34)} textAnchor="middle" fontSize="10" fill="var(--dc-stumm)">Formcheck</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function Reise({ index }: { index: InhaltsIndex }) {
  const daten = useCoach(s => s.daten)
  const bereiche = gewaehlt(daten.profil, index)
  const aktiv = bereiche.filter(b => daten.kurse[kursId(b)]?.aktiv)
  const wartend = bereiche.filter(b => !daten.kurse[kursId(b)]?.aktiv)
  const plaetze = staffelGroesse(daten.profil)
  const vorziehen = (b: BereichId) => useCoach.getState().aendere(d => {
    const tag = tagNummer(heute())
    const reihe = [b, ...d.profil.bereiche.filter(x => x !== b)]
    const kurse = { ...d.kurse }
    // den zuletzt aktiven Bereich zurückstellen, wenn kein Platz ist
    const akt = reihe.filter(x => kurse[kursId(x)]?.aktiv)
    if (akt.length >= plaetze) { const raus = akt[akt.length - 1]; for (const k of kurseVonBereich(d.profil, index, raus)) if (kurse[k]) kurse[k] = { ...kurse[k], aktiv: false } }
    for (const k of kurseVonBereich(d.profil, index, b)) kurse[k] = { ...(kurse[k] ?? { erledigt: {}, seit: tag, kurz: [] }), aktiv: true }
    const n = { ...d, profil: { ...d.profil, bereiche: reihe }, kurse }
    return { ...n, kurse: pflegeStaffel(n, index, tag) }
  })
  const zeile = (b: BereichId) => {
    const info = index.bereiche.find(x => x.id === b)!
    return kurseVonBereich(daten.profil, index, b).map(k => { const f = fortschritt(index, k, daten.kurse[k]); return (
      <div key={k} className="dc-reihe" style={{ flexWrap: 'nowrap' }} data-dc-reise-kurs={k}>
        <span className="dc-reihe" style={{ width: 240, flex: 'none', gap: 8, flexWrap: 'nowrap' }}><Symbol name={info.zeichen} />{info.name}{k.includes('/') && <span className="dc-klein dc-stumm"> · {index.schwerpunkte.find(s => s.id === k.split('/')[1])?.name}</span>}</span>
        <span className="dc-balken" style={{ flex: 1 }}><i style={{ width: `${f.gesamt ? (f.erledigt / f.gesamt) * 100 : 0}%` }} /></span>
        <span className="dc-klein dc-stumm dc-zahl" style={{ width: 150, textAlign: 'right' }}>{f.gesamt ? (f.fertig ? 'Meisterklasse' : `${f.erledigt}/${f.gesamt} · ${f.phase ? PHASEN[f.phase] : ''}`) : 'Inhalte folgen'}</span>
      </div>) })
  }
  return (
    <div className="dc-breit dc-spalte" data-dc-reise>
      <div><span className="dc-ober">Deine Reise</span><h1 className="dc-h1">Runde {daten.runde.nr}</h1></div>
      <div className="dc-karte"><Strecke runde={daten.runde.nr} trainings={daten.runde.trainings} /><p className="dc-klein dc-leise" style={{ margin: '6px 0 0' }}>Fünf Trainings sind eine Runde, danach kommt ein kurzer Rundencheck. Jeder Bereich hat nach rund zwanzig Lerntagen einen Formcheck.</p></div>
      <div className="dc-karte dc-spalte">
        <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><h2 className="dc-h2">Im Training</h2><span className="dc-klein dc-stumm">{plaetze >= 99 ? 'alle gleichzeitig' : `${plaetze} Bereiche gleichzeitig`} · änderbar in den Einstellungen</span></div>
        {aktiv.length ? aktiv.map(zeile) : <span className="dc-leise">Noch kein Bereich im Training.</span>}
      </div>
      {wartend.length > 0 && <div className="dc-karte dc-spalte">
        <h2 className="dc-h2">Als Nächstes</h2>
        <span className="dc-klein dc-leise">Diese Bereiche laufen über Wiederholungen mit und rücken nach, sobald ein Bereich eine Phase geschafft hat.</span>
        {wartend.map(b => <div key={b} className="dc-reihe" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}>{zeile(b)}</div><button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => vorziehen(b)} title="Jetzt ins Training holen" data-dc-vorziehen={b}><ArrowUp size={14} />Jetzt</button></div>)}
      </div>}
    </div>
  )
}
