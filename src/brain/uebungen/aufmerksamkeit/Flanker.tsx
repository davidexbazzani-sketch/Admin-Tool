// Flanker (Aufmerksamkeit): Fünf Zeichen in einer Reihe — gefragt ist nur die Richtung des MITTLEREN Pfeils.
// Die äußeren Pfeile („Flanken“) zeigen mal in dieselbe, mal in die Gegenrichtung und müssen ausgeblendet werden.
//
// Stufen (30 Durchgänge; der Rest nach den inkongruenten teilt sich 2 : 1 in kongruent und neutral):
//   Stufe  inkongruent  Frist     Lage der Reihe
//     1       30 %      1500 ms   immer in der Mitte
//     2       34 %      1400 ms   Mitte
//     3       38 %      1300 ms   Mitte
//     4       42 %      1200 ms   Mitte
//     5       46 %      1100 ms   Mitte
//     6       50 %      1000 ms   Mitte
//     7       55 %       900 ms   wandert bis ±30 px nach oben/unten
//     8       60 %       800 ms   wandert bis ±42 px
//     9       65 %       700 ms   wandert bis ±54 px
//    10       70 %       600 ms   wandert bis ±66 px
// Arten: kongruent (→→→→→) · inkongruent (←←→←←) · neutral (– – → – –).
// Ablauf: 2 s Vorlauf, dann je Durchgang: Pause mit Fixationskreuz in der Mitte (500–800 ms) → Reihe bis zur Antwort
// oder Frist → kurze Rückmeldung. Wandert die Reihe, gibt es fünf Lagen (oben … unten), nie zweimal dieselbe hintereinander.
// Bedienung: Pfeiltasten ← / → oder die beiden Knöpfe.
// Wertung: Anteil richtig (zu langsam zählt als falsch) × Tempo (Median der richtigen Antworten, gemessen an der Frist).
// Ergebniszeile: Flanker-Effekt = mittlere Zeit inkongruent − kongruent (nur richtige Antworten). Kein Duell.
import { useMemo, useState } from 'react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useTasten } from '../../ablauf/kit'
import { useDruck, useReizTakt } from './takt.logik'
import { flankerStufe, flankerVersuche, flankerWertung, type FlankerZeichen, type Richtung } from './Flanker.logik'
import './aufmerksamkeit.css'

export * from './Flanker.logik'

const SEITEN: readonly Richtung[] = ['links', 'rechts']
/** Vorlauf vor dem ersten Durchgang (Finger auf die Tasten) */
const START_MS = 2000

/** Ein Zeichen der Reihe: Pfeil nach links/rechts oder (neutral) ein Strich. Gezeichnet, damit es nicht von der Schrift abhängt. */
function Zeichen({ z }: { z: FlankerZeichen }) {
  return (
    <svg className="bt-auf-pfeil" viewBox="0 0 100 100" aria-hidden="true" data-zeichen={z}>
      <g fill="none" stroke="currentColor" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round"
        transform={z === 'links' ? 'translate(100 0) scale(-1 1)' : undefined}>
        {z === 'strich'
          ? <line x1={24} y1={50} x2={76} y2={50} />
          : <><line x1={14} y1={50} x2={84} y2={50} /><polyline points="56,22 86,50 56,78" /></>}
      </g>
    </svg>
  )
}

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const s = flankerStufe(stufe)
  const versuche = useMemo(() => flankerVersuche(rng(start), stufe), [start, stufe])
  const n = versuche.length
  const [richtig, setRichtig] = useState(0)
  const druck = useDruck()

  const takt = useReizTakt<Richtung>({
    anzahl: n,
    startMs: START_MS,
    pauseMs: nr => 500 + 300 * versuche[nr].zittern,
    fristMs: () => s.fristMs,
    rueckMs: a => (a.richtig ? 220 : 800),
    pruefe: (nr, wahl) => versuche[nr].ziel === wahl,
    onAntwort: (_a, alle) => setRichtig(alle.filter(x => x.richtig).length),
    onEnde: alle => onFertig(flankerWertung(alle.map(a => ({ art: versuche[a.nr].art, richtig: a.richtig, ms: a.ms })), s.fristMs)),
  })

  useTasten({ ArrowLeft: () => takt.antworte('links'), ArrowRight: () => takt.antworte('rechts') })

  const v = versuche[Math.min(takt.nr, n - 1)]
  const a = takt.letzte
  const zeigtReihe = takt.phase === 'reiz' || takt.phase === 'rueck'
  const erledigt = takt.nr + (takt.phase === 'rueck' || takt.phase === 'ende' ? 1 : 0)

  return (
    <div className="bt-lauf" data-bt-frei="flanker" data-phase={takt.phase} data-nr={takt.nr}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">{Math.min(takt.nr + 1, n)} / {n}</span>}
        mitte={<Balken anteil={erledigt / n} />}
        rechts={<span className="bt-chip bt-chip-gut bt-zahl">{richtig} richtig</span>}
      />
      <div className="bt-uhr" aria-hidden="true">
        {takt.phase === 'start' && <i style={{ animation: `bt-uhr-lauf ${START_MS}ms linear forwards` }} />}
        {takt.phase === 'reiz' && <i key={takt.nr} style={{ animation: `bt-uhr-lauf ${s.fristMs}ms linear forwards` }} />}
      </div>

      <div className="bt-aufgabe">Wohin zeigt der <span style={{ color: 'var(--bt-akzent-stark)' }}>mittlere</span> Pfeil?</div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
        <div className={`bt-reiz bt-auf-buehne bt-auf-breit ${a ? (a.richtig ? 'bt-blitz-gut' : 'bt-blitz-schlecht') : ''}`} data-bt-buehne>
          {takt.phase === 'start' && (
            <div className="bt-auf-zentrum bt-auf-bereit">Finger auf <Taste>←</Taste> und <Taste>→</Taste> – gleich geht’s los</div>
          )}
          {takt.phase === 'pause' && <div className="bt-auf-zentrum bt-auf-fix" aria-hidden="true">+</div>}
          {zeigtReihe && (
            <div className="bt-auf-pfeilreihe" data-bt-reihe={v.reihe.join(',')} data-lage={v.lage}
              style={{ transform: `translateY(calc(-50% + ${Math.round(v.lage * s.hubPx)}px))` }}>
              {v.reihe.map((z, i) => <Zeichen key={i} z={z} />)}
            </div>
          )}
        </div>
        <div className="bt-auf-meldung" data-art={a && !a.richtig ? 'schlecht' : undefined} data-bt-meldung>
          {a && !a.richtig ? `${a.wahl === null ? 'Zu langsam' : 'Falsch'} – der mittlere Pfeil zeigt nach ${v.ziel}` : ''}
        </div>
      </div>

      <div className="bt-antwortleiste">
        {SEITEN.map(seite => (
          <button key={seite} type="button" className="bt-feld bt-auf-wahl" style={{ minWidth: 190 }} data-bt-wahl={seite}
            data-gut={a && v.ziel === seite ? '' : undefined}
            data-schlecht={a && !a.richtig && a.wahl === seite ? '' : undefined}
            {...druck(() => takt.antworte(seite))}>
            {seite === 'links' ? <><Taste>←</Taste>Links</> : <>Rechts<Taste>→</Taste></>}
          </button>
        ))}
      </div>
    </div>
  )
}
