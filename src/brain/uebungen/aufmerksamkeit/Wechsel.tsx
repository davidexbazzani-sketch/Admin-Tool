// Aufgabenwechsel (Aufmerksamkeit): Eine Ziffer 1–9 (nie die 5), dazu abwechselnd zwei Fragen:
//   A „Gerade oder ungerade?“      — runder Rahmen
//   B „Größer oder kleiner als 5?“ — eckiger Rahmen
// Welche Frage gilt, zeigen das Wort über der Ziffer UND die Form des Rahmens. Jeder Wechsel kostet Zeit —
// trainiert wird, sich schnell auf die andere Regel umzustellen.
//
// Stufen (32 Durchgänge):
//   Stufe  Reihenfolge                         Wechsel  Frist     Hinweis vor der Ziffer
//     1    vorhersehbar: A A B B A A B B …     ~48 %    3500 ms   600 ms
//     2    vorhersehbar                        ~48 %    3000 ms   600 ms
//     3    vorhersehbar                        ~48 %    2600 ms   500 ms
//     4    zufällig                             30 %    2600 ms   400 ms
//     5    zufällig                             35 %    2300 ms   400 ms
//     6    zufällig                             42 %    2000 ms   300 ms
//     7    zufällig                             50 %    1800 ms   300 ms
//     8    zufällig                             50 %    1600 ms   150 ms
//     9    zufällig                             50 %    1400 ms   erscheint zusammen mit der Ziffer
//    10    zufällig                             50 %    1200 ms   zusammen mit der Ziffer
// Ablauf: 3,5 s Vorlauf (Belegung lesen), dann je Durchgang:
//         neutrale Pause (350–550 ms) → Hinweis (Frage + Rahmen) → Ziffer bis zur Antwort oder Frist → Rückmeldung.
// Bedienung: ← = ungerade bzw. kleiner als 5 · → = gerade bzw. größer als 5. Die Belegung beider Fragen steht dauerhaft unten.
// Wertung: Anteil richtig (zu langsam zählt als falsch) × Tempo (Median der richtigen Antworten, gemessen an der Frist).
// Ergebniszeile: Wechselkosten = mittlere Zeit nach einem Wechsel − nach einer Wiederholung (nur richtige Antworten). Kein Duell.
import { useMemo, useState } from 'react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useTasten } from '../../ablauf/kit'
import { useDruck, useReizTakt } from './takt.logik'
import {
  WECHSEL_BELEGUNG, WECHSEL_FRAGE, wechselStufe, wechselVersuche, wechselWertung, type Seite, type WechselAufgabe,
} from './Wechsel.logik'
import './aufmerksamkeit.css'

export * from './Wechsel.logik'

const SEITEN: readonly Seite[] = ['links', 'rechts']
const AUFGABEN: readonly WechselAufgabe[] = ['paritaet', 'groesse']
/** Vorlauf vor dem ersten Durchgang: Zeit, die Belegung unten zu lesen */
const START_MS = 3500

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const s = wechselStufe(stufe)
  const versuche = useMemo(() => wechselVersuche(rng(start), stufe), [start, stufe])
  const n = versuche.length
  const [richtig, setRichtig] = useState(0)
  const druck = useDruck()

  const takt = useReizTakt<Seite>({
    anzahl: n,
    startMs: START_MS,
    pauseMs: nr => 350 + 200 * versuche[nr].zittern,
    vorMs: () => s.vorlaufMs,
    fristMs: () => s.fristMs,
    rueckMs: a => (a.richtig ? 240 : 950),
    pruefe: (nr, wahl) => versuche[nr].richtig === wahl,
    onAntwort: (_a, alle) => setRichtig(alle.filter(x => x.richtig).length),
    onEnde: alle => onFertig(wechselWertung(alle.map(a => ({ wechsel: versuche[a.nr].wechsel, richtig: a.richtig, ms: a.ms })), s.fristMs)),
  })

  useTasten({ ArrowLeft: () => takt.antworte('links'), ArrowRight: () => takt.antworte('rechts') })

  const v = versuche[Math.min(takt.nr, n - 1)]
  const a = takt.letzte
  const zeigtZiffer = takt.phase === 'reiz' || takt.phase === 'rueck'
  const zeigtHinweis = takt.phase === 'vor' || zeigtZiffer
  const erledigt = takt.nr + (takt.phase === 'rueck' || takt.phase === 'ende' ? 1 : 0)

  return (
    <div className="bt-lauf" data-bt-frei="wechsel" data-phase={takt.phase} data-nr={takt.nr}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">{Math.min(takt.nr + 1, n)} / {n}</span>}
        mitte={<Balken anteil={erledigt / n} />}
        rechts={<span className="bt-chip bt-chip-gut bt-zahl">{richtig} richtig</span>}
      />
      <div className="bt-uhr" aria-hidden="true">
        {takt.phase === 'start' && <i style={{ animation: `bt-uhr-lauf ${START_MS}ms linear forwards` }} />}
        {takt.phase === 'reiz' && <i key={takt.nr} style={{ animation: `bt-uhr-lauf ${s.fristMs}ms linear forwards` }} />}
      </div>

      <div className="bt-aufgabe">
        Beantworte die Frage, die über der Zahl steht
        <span className="bt-leise" style={{ fontWeight: 400, fontSize: 14 }}> · {s.folge === 'aabb' ? 'sie wechselt nach je zwei Zahlen' : 'sie wechselt ohne Vorwarnung'}</span>
      </div>

      <div className={`bt-reiz bt-auf-buehne bt-auf-hoch ${a ? (a.richtig ? 'bt-blitz-gut' : 'bt-blitz-schlecht') : ''}`} data-bt-buehne>
        <div className="bt-auf-frage" data-aufgabe={zeigtHinweis ? v.aufgabe : undefined} data-bt-frage={zeigtHinweis ? v.aufgabe : undefined}>
          {zeigtHinweis ? WECHSEL_FRAGE[v.aufgabe] : ''}
        </div>
        {takt.phase === 'start'
          ? <div className="bt-auf-mitte bt-auf-bereit" style={{ height: 148 }}><span>Schau dir unten die Belegung an.<br />Finger auf <Taste>←</Taste> und <Taste>→</Taste> – gleich geht’s los</span></div>
          : (
            <div className={`bt-auf-rahmen ${a && !a.richtig ? 'bt-ruettel' : ''}`} data-aufgabe={zeigtHinweis ? v.aufgabe : undefined}>
              {zeigtZiffer
                ? <span data-bt-ziffer>{v.ziffer}</span>
                : !zeigtHinweis && <span className="bt-auf-fix" aria-hidden="true">+</span>}
            </div>
          )}
        <div className="bt-auf-meldung" data-art={a && !a.richtig ? 'schlecht' : undefined} data-bt-meldung>
          {a && !a.richtig ? `${a.wahl === null ? 'Zu langsam' : 'Falsch'} – die ${v.ziffer} ist ${WECHSEL_BELEGUNG[v.aufgabe][v.richtig]}` : ''}
        </div>
      </div>

      <div className="bt-antwortleiste" style={{ gap: 14 }}>
        {SEITEN.map(seite => (
          <button key={seite} type="button" className="bt-feld bt-auf-seite" data-seite={seite} data-bt-wahl={seite}
            data-gut={a && v.richtig === seite ? '' : undefined}
            data-schlecht={a && !a.richtig && a.wahl === seite ? '' : undefined}
            {...druck(() => takt.antworte(seite))}>
            <span className="bt-auf-zeile"><Taste>{seite === 'links' ? '←' : '→'}</Taste></span>
            {AUFGABEN.map(aufgabe => (
              <span key={aufgabe} className="bt-auf-zeile">
                <i className="bt-auf-marke" data-aufgabe={aufgabe} aria-hidden="true" />
                {WECHSEL_BELEGUNG[aufgabe][seite]}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  )
}
