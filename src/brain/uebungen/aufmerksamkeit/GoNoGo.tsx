// Go / No-Go (Aufmerksamkeit): Figuren erscheinen im festen Takt. Bei den meisten wird gedrückt (Go) — bei
// einigen wenigen gerade NICHT (No-Go). Weil das Drücken zur Gewohnheit wird, muss es aktiv gestoppt werden.
// Go und No-Go unterscheiden sich in der FORM der Figur, nie nur in der Farbe.
//
// Stufen (40 Figuren je Durchgang):
//   Stufe  Regel                                             Takt     davon leer  No-Go
//     1    eine Go-Figur, eine No-Go-Figur                   1100 ms  300 ms      30 %
//     2    wie 1                                             1000 ms  300 ms      30 %
//     3    wie 1                                              900 ms  250 ms      25 %
//     4    wie 1                                              800 ms  250 ms      25 %
//     5    drei Go-Figuren, zwei No-Go-Figuren                780 ms  250 ms      25 %
//     6    wie 5                                              740 ms  230 ms      25 %
//     7    wie 5                                              700 ms  220 ms      25 %
//     8    nicht drücken, wenn die Figur dieselbe ist
//          wie die vorige (vier Figuren)                      700 ms  220 ms      25 %
//     9    wie 8                                              650 ms  200 ms      25 %
//    10    wie 8                                              600 ms  200 ms      25 %
// Welche Figuren Go und No-Go sind, wird je Durchgang neu gezogen; die Regel steht die ganze Zeit oben.
// Vor der ersten Figur bleiben 3–4 s, um sich die Regel einzuprägen.
// Ablauf: Die Figur steht (Takt − leer) da, dann ist die Bühne kurz leer. Gedrückt werden darf bis zur nächsten
//         Figur, gezählt wird je Figur nur der erste Druck.
// Bedienung: Leertaste oder der große Knopf.
// Wertung: Trefferquote × (1 − Fehlalarmquote) — ein Fehlalarm wiegt rund dreimal so schwer wie ein verpasster
//          Go-Reiz — × Tempo (Median der Treffer-Reaktionszeiten, gemessen am Takt). Kein Duell.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useTasten } from '../../ablauf/kit'
import { SzeneBild } from '../../figuren/Zeige'
import { useDruck } from './takt.logik'
import { GNG_FORMNAME, gngPlan, gngStufe, gngWertung, type GngForm, type GngMessung, type GngRegel } from './GoNoGo.logik'
import './aufmerksamkeit.css'

export * from './GoNoGo.logik'

type Phase = 'start' | 'reiz' | 'leer' | 'ende'
type Ausgang = 'treffer' | 'fehlalarm' | 'verpasst' | 'gewartet'

/** Zeit zum Einprägen der Regel vor der ersten Figur */
const START_MS: Record<GngRegel, number> = { eine: 3000, zwei: 4000, gleich: 3500 }
const MELDUNG: Record<Ausgang, { text: string; art: 'gut' | 'schlecht' | 'warn' }> = {
  treffer: { text: 'Treffer', art: 'gut' },
  fehlalarm: { text: 'Hier nicht drücken!', art: 'schlecht' },
  verpasst: { text: 'Verpasst', art: 'warn' },
  gewartet: { text: 'Gut gewartet', art: 'gut' },
}

function Figur({ form, klein }: { form: GngForm; klein?: boolean }) {
  return (
    <SzeneBild className={klein ? 'bt-auf-figur-klein' : 'bt-auf-figur'} titel={GNG_FORMNAME[form]}
      szene={{ elemente: [{ typ: form, x: 50, y: 50, g: 68, fuell: 'voll', ton: 1 }] }} />
  )
}

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const s = gngStufe(stufe)
  const plan = useMemo(() => gngPlan(rng(start), stufe), [start, stufe])
  const n = plan.versuche.length
  const [stand, setStand] = useState<{ nr: number; phase: Phase }>({ nr: 0, phase: 'start' })
  const [meldung, setMeldung] = useState<{ nr: number; ausgang: Ausgang } | null>(null)
  const [richtig, setRichtig] = useState(0)
  const messungen = useRef<GngMessung[]>([])
  /** das Antwortfenster der laufenden Figur ist offen */
  const offen = useRef(false)
  const offenNr = useRef(0)
  const reizAb = useRef(0)
  const gedruecktMs = useRef<number | null>(null)
  const aus = useRef(false)
  const fertig = useRef(onFertig)
  fertig.current = onFertig
  const druck = useDruck()

  /** Fenster der Figur schließen, verbuchen, weiter */
  const schliesse = useCallback((nr: number) => {
    if (aus.current) return
    offen.current = false
    const v = plan.versuche[nr]
    const ms = gedruecktMs.current
    messungen.current.push({ go: v.go, gedrueckt: ms !== null, ms })
    if (ms === null) setMeldung({ nr, ausgang: v.go ? 'verpasst' : 'gewartet' })
    setRichtig(messungen.current.filter(x => x.go === x.gedrueckt).length)
    if (nr + 1 < n) { setStand({ nr: nr + 1, phase: 'reiz' }); return }
    aus.current = true
    setStand({ nr, phase: 'ende' })
    fertig.current(gngWertung(messungen.current, s.intervallMs))
  }, [n, plan, s.intervallMs])

  // Layout-Effekt: läuft, sobald der neue Stand im Dokument steht, also noch VOR dem Zeichnen
  useLayoutEffect(() => {
    const { nr, phase } = stand
    if (phase === 'ende' || aus.current) return
    let t: ReturnType<typeof setTimeout>
    let bild = 0
    if (phase === 'start') t = setTimeout(() => setStand({ nr: 0, phase: 'reiz' }), START_MS[plan.regel])
    else if (phase === 'reiz') {
      // ab jetzt zählt die Reaktionszeit; der Startpunkt wird auf den Beginn des Bildes nachgezogen, das die Figur zeigt
      reizAb.current = performance.now()
      bild = requestAnimationFrame(() => { reizAb.current = performance.now() })
      offenNr.current = nr
      gedruecktMs.current = null
      offen.current = true
      t = setTimeout(() => setStand({ nr, phase: 'leer' }), s.intervallMs - s.lueckeMs)
    } else t = setTimeout(() => schliesse(nr), s.lueckeMs)
    return () => { clearTimeout(t); if (bild) cancelAnimationFrame(bild) }
  }, [stand, plan.regel, s.intervallMs, s.lueckeMs, schliesse])

  const druecke = useCallback(() => {
    // je Figur zählt nur der erste Druck
    if (aus.current || !offen.current || gedruecktMs.current !== null) return
    gedruecktMs.current = performance.now() - reizAb.current
    const nr = offenNr.current
    setMeldung({ nr, ausgang: plan.versuche[nr].go ? 'treffer' : 'fehlalarm' })
  }, [plan])

  useTasten({ ' ': druecke })

  const v = plan.versuche[stand.nr]
  // Treffer und Fehlalarm gehören zur laufenden Figur; „verpasst“ und „gewartet“ stehen erst fest, wenn schon die nächste da ist
  const jetzt = meldung && meldung.nr === stand.nr && stand.phase !== 'ende' ? meldung.ausgang : null
  const davor = meldung && meldung.nr === stand.nr - 1 && stand.phase === 'reiz' && (meldung.ausgang === 'verpasst' || meldung.ausgang === 'gewartet') ? meldung.ausgang : null
  const zeige = jetzt ?? davor
  const erledigt = stand.nr + (stand.phase === 'ende' ? 1 : 0)

  return (
    <div className="bt-lauf" data-bt-frei="gonogo" data-phase={stand.phase} data-nr={stand.nr}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">{Math.min(stand.nr + 1, n)} / {n}</span>}
        mitte={<Balken anteil={erledigt / n} />}
        rechts={<span className="bt-chip bt-chip-gut bt-zahl">{richtig} richtig</span>}
      />
      <div className="bt-uhr" aria-hidden="true">
        {stand.phase === 'start' && <i style={{ animation: `bt-uhr-lauf ${START_MS[plan.regel]}ms linear forwards` }} />}
      </div>

      <div className="bt-auf-regel" data-neu={stand.phase === 'start' ? '' : undefined} data-bt-regel={plan.regel}>
        {plan.regel === 'eine' && (
          <>
            <span className="bt-auf-regelteil" data-art="go"><Check size={18} />Drücke bei <Figur form={plan.go[0]} klein /></span>
            <span className="bt-auf-regelteil" data-art="nogo"><X size={18} />Nicht drücken bei <Figur form={plan.noGo[0]} klein /></span>
          </>
        )}
        {plan.regel === 'zwei' && (
          <>
            <span className="bt-auf-regelteil" data-art="go"><Check size={18} />Drücke bei jeder Figur</span>
            <span className="bt-auf-regelteil" data-art="nogo"><X size={18} />nur nicht bei <Figur form={plan.noGo[0]} klein /> und <Figur form={plan.noGo[1]} klein /></span>
          </>
        )}
        {plan.regel === 'gleich' && (
          <>
            <span className="bt-auf-regelteil" data-art="go"><Check size={18} />Drücke bei jeder Figur</span>
            <span className="bt-auf-regelteil" data-art="nogo"><X size={18} />nicht drücken, wenn die Figur dieselbe ist wie die vorige</span>
          </>
        )}
      </div>

      {/* Treffer bekommen nur ein leises Wort (im schnellen Takt würde ein Aufblitzen stören), Fehlalarme ein deutliches Zeichen */}
      <div className={`bt-reiz bt-auf-buehne ${jetzt === 'fehlalarm' ? 'bt-blitz-schlecht' : ''}`}
        data-bt-buehne data-form={stand.phase === 'reiz' ? v.form : undefined}>
        <div className={`bt-auf-mitte ${jetzt === 'fehlalarm' ? 'bt-ruettel' : ''}`} style={{ height: 152 }}>
          {stand.phase === 'start' && <span className="bt-auf-bereit">Präge dir die Regel ein – gleich geht’s los</span>}
          {stand.phase === 'reiz' && <Figur form={v.form} />}
        </div>
        <div className="bt-auf-meldung" data-art={zeige ? MELDUNG[zeige].art : undefined} data-bt-meldung>{zeige ? MELDUNG[zeige].text : ''}</div>
      </div>

      <button type="button" className="bt-knopf bt-knopf-gross bt-auf-druck" data-bt-druck {...druck(druecke)}>
        Drücken <Taste>Leertaste</Taste>
      </button>
    </div>
  )
}
