// Stroop / Farbwort (Aufmerksamkeit): Ein Farbwort steht in einer Schriftfarbe da — gefragt ist die
// SCHRIFTFARBE, nicht das Wort. Das Lesen läuft von selbst ab und muss unterdrückt werden.
//
// Stufen (Training: 30 Durchgänge):
//   Stufe  inkongruent  Frist   Besonderheit
//     1       30 %      3,0 s
//     2       35 %      2,8 s
//     3       40 %      2,6 s
//     4       45 %      2,4 s
//     5       50 %      2,2 s
//     6       55 %      2,0 s
//     7       60 %      1,8 s
//     8       65 %      1,8 s   Hinweis über dem Wort: „FARBE“ oder „WORT“ (30 % WORT), steht 600 ms vorher da
//     9       72 %      1,5 s   40 % WORT, Hinweis 450 ms vorher
//    10       80 %      1,2 s   50 % WORT, Hinweis 300 ms vorher
// Ablauf: 2 s Vorlauf (mit Hinweis-Regel 3,5 s), dann je Durchgang:
//         Pause mit Fixationskreuz (450–650 ms) → [Hinweis] → Wort bis zur Antwort oder Frist → kurze Rückmeldung.
// Bedienung: Tasten D F J K = ROT BLAU GRÜN GELB (feste Zuordnung) oder die vier Knöpfe.
// Wertung: Anteil richtig (zu langsam zählt als falsch) × Tempo (Median der richtigen Antworten, gemessen an der Frist).
// Ergebniszeile: Stroop-Effekt = mittlere Zeit inkongruent − kongruent (nur richtige Antworten).
// Duell: feste Schwierigkeit unabhängig von der Stufe (50 % inkongruent, Frist 2 s, ohne Hinweis), endloser Strom für
//        genau `dauerSek`; +10 je richtige, −5 je falsche oder zu späte Antwort, nie unter 0.
import { useMemo, useState } from 'react'
import { Palette, Type } from 'lucide-react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useTasten, useUhr } from '../../ablauf/kit'
import { useDruck, useReizTakt, type TaktAntwort } from './takt.logik'
import {
  FARBEN, FARBTASTE, FARBWORT, STROOP_ANZAHL, STROOP_DUELL, stroopDuellPunkte, stroopDuellWertung, stroopStrom, stroopStufe,
  stroopVersuche, stroopWertung, type Farbe, type StroopMessung,
} from './Stroop.logik'
import './aufmerksamkeit.css'

export * from './Stroop.logik'

export function Komponente({ stufe, start, modus, dauerSek, onPunkte, onFertig }: FreiProps) {
  const duell = modus === 'duell'
  const dauer = dauerSek ?? 60
  const p = duell ? STROOP_DUELL : stroopStufe(stufe)
  const mitHinweis = p.wortAnteil > 0
  // Duell: genug Durchgänge für die ganze Zeit (schneller als 350 ms je Durchgang geht es nicht)
  const versuche = useMemo(
    () => (duell
      ? stroopStrom(start, STROOP_DUELL, Math.ceil((dauer * 1000) / 350) + 5)
      : stroopVersuche(rng(start), stroopStufe(stufe), STROOP_ANZAHL)),
    [duell, start, stufe, dauer])
  const [zahl, setZahl] = useState({ richtig: 0, falsch: 0 })
  const druck = useDruck()

  const messungen = (alle: readonly TaktAntwort<Farbe>[]): StroopMessung[] =>
    alle.map(a => ({ kongruent: versuche[a.nr % versuche.length].kongruent, richtig: a.richtig, ms: a.ms }))

  // Vorlauf: Finger auf die Tasten; mit Hinweis-Regel länger, damit sie gelesen werden kann; im Duell zählt jede Sekunde
  const startMs = duell ? 700 : mitHinweis ? 3500 : 2000

  const takt = useReizTakt<Farbe>({
    anzahl: duell ? Infinity : STROOP_ANZAHL,
    startMs,
    pauseMs: nr => { const z = versuche[nr % versuche.length].zittern; return duell ? 240 + 100 * z : 450 + 200 * z },
    vorMs: () => p.vorlaufMs,
    fristMs: () => p.fristMs,
    rueckMs: a => (duell ? (a.richtig ? 140 : 380) : a.richtig ? 260 : 850),
    pruefe: (nr, wahl) => versuche[nr % versuche.length].richtig === wahl,
    onAntwort: (_a, alle) => {
      const richtig = alle.filter(x => x.richtig).length
      setZahl({ richtig, falsch: alle.length - richtig })
      if (duell) onPunkte?.(stroopDuellPunkte(richtig, alle.length - richtig))
    },
    onEnde: alle => onFertig(duell ? stroopDuellWertung(messungen(alle), dauer) : stroopWertung(messungen(alle), p.fristMs)),
  })
  const rest = useUhr(duell ? dauer : undefined, takt.halt)

  useTasten(Object.fromEntries(FARBEN.map(f => [FARBTASTE[f], () => takt.antworte(f)])))

  const v = versuche[takt.nr % versuche.length]
  const a = takt.letzte
  const zeigtWort = takt.phase === 'reiz' || takt.phase === 'rueck'
  const zeigtHinweis = takt.phase === 'vor' || zeigtWort
  const erledigt = takt.nr + (takt.phase === 'rueck' || takt.phase === 'ende' ? 1 : 0)

  return (
    <div className="bt-lauf" data-bt-frei="stroop" data-phase={takt.phase} data-nr={takt.nr}>
      <KopfZeile
        links={duell
          ? <span className="bt-chip bt-chip-warm bt-zahl">{rest} s</span>
          : <span className="bt-chip bt-zahl">{Math.min(takt.nr + 1, STROOP_ANZAHL)} / {STROOP_ANZAHL}</span>}
        mitte={duell ? <Balken anteil={rest / dauer} warm /> : <Balken anteil={erledigt / STROOP_ANZAHL} />}
        rechts={duell
          ? <span className="bt-chip bt-chip-akzent bt-zahl">{stroopDuellPunkte(zahl.richtig, zahl.falsch)} Punkte</span>
          : <span className="bt-chip bt-chip-gut bt-zahl">{zahl.richtig} richtig</span>}
      />
      {/* Frist je Durchgang; im Duell zeigt schon der Balken oben die Zeit → hier nur Platzhalter, damit nichts springt */}
      <div className="bt-uhr" aria-hidden="true" style={duell ? { visibility: 'hidden' } : undefined}>
        {takt.phase === 'start' && <i style={{ animation: `bt-uhr-lauf ${startMs}ms linear forwards` }} />}
        {takt.phase === 'reiz' && <i key={takt.nr} style={{ animation: `bt-uhr-lauf ${p.fristMs}ms linear forwards` }} />}
      </div>

      <div className="bt-aufgabe">
        {mitHinweis
          ? <>Achte auf den Hinweis: <span style={{ color: 'var(--bt-akzent-stark)' }}>FARBE</span> = Schriftfarbe · <span style={{ color: 'var(--bt-akzent2)' }}>WORT</span> = was dort steht</>
          : <>Welche <span style={{ color: 'var(--bt-akzent-stark)' }}>Farbe</span> hat die Schrift?</>}
      </div>

      <div className={`bt-reiz bt-auf-buehne ${a ? (a.richtig ? 'bt-blitz-gut' : 'bt-blitz-schlecht') : ''}`} data-bt-buehne>
        {mitHinweis && (
          <div className="bt-auf-hinweis" data-hinweis={v.hinweis} data-leer={zeigtHinweis ? undefined : ''} data-bt-hinweis={zeigtHinweis ? v.hinweis : undefined}>
            {v.hinweis === 'wort' ? <Type size={16} /> : <Palette size={16} />}
            {v.hinweis === 'wort' ? 'WORT' : 'FARBE'}
          </div>
        )}
        <div className={`bt-auf-mitte ${a && !a.richtig ? 'bt-ruettel' : ''}`}>
          {takt.phase === 'start'
            ? <span className="bt-auf-bereit">Finger auf <Taste>D</Taste> <Taste>F</Taste> <Taste>J</Taste> <Taste>K</Taste> – gleich geht’s los</span>
            : zeigtWort
              ? <span className="bt-auf-wort" data-farbe={v.farbe} data-bt-wort>{FARBWORT[v.wort]}</span>
              : <span className="bt-auf-fix" aria-hidden="true">+</span>}
        </div>
        <div className="bt-auf-meldung" data-art={a && !a.richtig ? 'schlecht' : undefined} data-bt-meldung>
          {a && !a.richtig ? `${a.wahl === null ? 'Zu langsam – richtig' : 'Richtig'} wäre ${FARBWORT[v.richtig]}` : ''}
        </div>
      </div>

      <div className="bt-antwortleiste">
        {FARBEN.map(f => (
          <button key={f} type="button" className="bt-feld bt-auf-wahl" data-bt-wahl={f}
            data-gut={a && v.richtig === f ? '' : undefined}
            data-schlecht={a && !a.richtig && a.wahl === f ? '' : undefined}
            {...druck(() => takt.antworte(f))}>
            <i className="bt-auf-punkt" data-farbe={f} aria-hidden="true" />
            {FARBWORT[f]}
            <Taste>{FARBTASTE[f].toUpperCase()}</Taste>
          </button>
        ))}
      </div>
    </div>
  )
}
