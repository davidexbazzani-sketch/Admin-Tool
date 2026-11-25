// Reaktionszeit (Tempo): auf ein Signal so schnell wie möglich reagieren.
// Trainiert die Reaktionsgeschwindigkeit, ab Stufe 4 die schnelle Entscheidung zwischen mehreren Antworten
// und ab Stufe 8 zusätzlich das Zurückhalten einer schon vorbereiteten Reaktion.
//
// Stufen (Richtzeit = Median der richtigen Reaktionen: „sehr gut“ / „langsam“):
//   1  einfache Reaktion ·  6 Versuche · Wartezeit 1,5–3,0 s · 280 / 700 ms
//   2  einfache Reaktion ·  7 Versuche · Wartezeit 1,2–3,5 s · 250 / 620 ms
//   3  einfache Reaktion ·  8 Versuche · Wartezeit 1,2–4,0 s · 220 / 540 ms
//   4  Wahlreaktion ← →      ·  8 Versuche · 400 / 900 ms
//   5  Wahlreaktion ← →      · 10 Versuche · 350 / 800 ms
//   6  Wahlreaktion ← → ↑ ↓  · 10 Versuche · 430 / 950 ms
//   7  Wahlreaktion ← → ↑ ↓  · 10 Versuche · 380 / 850 ms
//   8  Wahlreaktion ← → ↑ ↓ + „Stopp“ (2 von 10 Versuchen: nicht reagieren) · 450 / 950 ms
//   9  wie 8 · 410 / 880 ms
//  10  wie 8, Wartezeit schon ab 0,7 s (schlechter abzuschätzen) · 380 / 820 ms
// Wartezeit vor dem Signal bei der Wahlreaktion: 0,9–2,2 s. Die Stufen einer Art unterscheiden sich vor allem
// darin, wie schnell man für dieselbe Güte sein muss.
//
// Regeln:
//   • Reaktion vor dem Signal (oder schneller als 100 ms danach) = Frühstart: zählt als Fehler, der Versuch
//     wird mit neuer Wartezeit wiederholt. Nach so vielen Frühstarts wie Versuchen endet der Durchgang.
//   • Wahlreaktion: falsche Richtung oder keine Reaktion in 1,8 s = Fehler. „Stopp“: 1,2 s stillhalten.
//   • Gemessen wird vom ersten Bild mit dem Signal (requestAnimationFrame) bis zum Tastendruck bzw. bis zum
//     HERUNTERDRÜCKEN der Maustaste, jeweils mit performance.now().
//   • Wertung: tempoGuete(richtig / (Versuche + Frühstarts), Tempo aus dem Median) — siehe tempo.logik.ts.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ban } from 'lucide-react'
import type { FreiProps } from '../../kern/typen'
import { Balken, KopfZeile, Taste, useTasten } from '../../ablauf/kit'
import { RICHTUNGEN, RK_FRUEH_MS, RK_STOPP_MS, reaktionPlan, reaktionRichtig, reaktionStufe, reaktionWarte, reaktionWertung, type Richtung, type RkStand } from './Reaktion.logik'
import { sofortKlick } from './tempo.logik'
import './tempo.css'

export * from './Reaktion.logik'

type Phase = 'warten' | 'reiz' | 'rueck'
/** gut = richtig reagiert · gehalten = bei Stopp stillgehalten · falsch = falsche Richtung · stopp = bei Stopp gedrückt */
type Ausgang = 'gut' | 'gehalten' | 'falsch' | 'stopp' | 'verpasst' | 'frueh'
interface Rueck { art: Ausgang; ms?: number }

const RUECK_MS = 750
const RUECK_FEHLER_MS = 1100
const PFEIL = { links: ArrowLeft, rechts: ArrowRight, oben: ArrowUp, unten: ArrowDown } as const
const PFEIL_NAME: Record<Richtung, string> = { links: 'links', rechts: 'rechts', oben: 'oben', unten: 'unten' }
const RUECK_TEXT: Record<Exclude<Ausgang, 'gut'>, string> = {
  gehalten: 'Gut gehalten', falsch: 'Falsche Richtung', stopp: 'Hier nicht drücken', verpasst: 'Zu langsam', frueh: 'Zu früh',
}

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const st = useMemo(() => reaktionStufe(stufe), [stufe])
  const plan = useMemo(() => reaktionPlan(start, stufe), [start, stufe])
  const n = plan.length

  const [nr, setNr] = useState(0)
  const [anlauf, setAnlauf] = useState(0)
  const [phase, setPhase] = useState<Phase>('warten')
  const [rueck, setRueck] = useState<Rueck | null>(null)
  const [verlauf, setVerlauf] = useState<Rueck[]>([])

  // Derselbe Stand noch einmal als Ref: Tasten und Zeitgeber müssen ihn SOFORT sehen (nicht erst nach dem
  // nächsten Zeichnen) — sonst könnten zwei Eingaben im selben Augenblick doppelt zählen.
  const lage = useRef<{ nr: number; anlauf: number; phase: Phase }>({ nr: 0, anlauf: 0, phase: 'warten' })
  /** Zeitpunkt, ab dem das Signal zu sehen ist (0 = noch nicht) */
  const t0 = useRef(0)
  const stand = useRef<RkStand>({ zeiten: [], richtig: 0, gewertet: 0, fruehstarts: 0 })
  const fertig = useRef(false)

  const schliesseAb = useCallback(() => {
    if (fertig.current) return
    fertig.current = true
    onFertig(reaktionWertung(stufe, stand.current))
  }, [onFertig, stufe])

  /** Versuch (oder Frühstart) abschließen und die Rückmeldung zeigen */
  const werte = useCallback((art: Ausgang, ms?: number) => {
    if (fertig.current || lage.current.phase === 'rueck') return
    lage.current.phase = 'rueck'
    const s = stand.current
    if (art === 'frueh') s.fruehstarts++
    else {
      s.gewertet++
      if (art === 'gut' && ms !== undefined) { s.richtig++; s.zeiten.push(ms) }
      if (art === 'gehalten') s.richtig++
      setVerlauf(v => [...v, { art, ms }])
    }
    setRueck({ art, ms })
    setPhase('rueck')
  }, [])

  const antwort = useCallback((eingabe: 'frei' | Richtung) => {
    if (fertig.current) return
    const jetzt = performance.now()
    const l = lage.current
    if (l.phase === 'rueck') return
    // Tasten, die auf dieser Stufe keine Antwort sind, bleiben ohne Wirkung
    if (st.art === 'einfach' ? eingabe !== 'frei' : eingabe === 'frei' || RICHTUNGEN.indexOf(eingabe) >= st.richtungen) return
    if (l.phase === 'warten' || !t0.current || jetzt - t0.current < RK_FRUEH_MS) { werte('frueh'); return }
    const v = plan[l.nr]
    if (v.art === 'stopp') werte('stopp')
    else if (reaktionRichtig(v, eingabe)) werte('gut', jetzt - t0.current)
    else werte('falsch')
  }, [plan, st, werte])

  // Wartezeit, dann das Signal
  useEffect(() => {
    if (phase !== 'warten') return
    const t = setTimeout(() => { t0.current = 0; lage.current.phase = 'reiz'; setPhase('reiz') }, reaktionWarte(start, stufe, nr, anlauf))
    return () => clearTimeout(t)
  }, [phase, nr, anlauf, start, stufe])

  // Das Signal steht im Dokument: die Zeit läuft ab dem nächsten Bild. Dazu die Frist für „zu langsam“
  // bzw. bei Stopp für „gut gehalten“.
  useLayoutEffect(() => {
    if (phase !== 'reiz') return
    const gesetzt = performance.now()
    t0.current = gesetzt
    const bild = requestAnimationFrame(() => { const jetzt = performance.now(); if (jetzt - gesetzt < 100) t0.current = jetzt })
    const stopp = plan[nr].art === 'stopp'
    const t = setTimeout(() => werte(stopp ? 'gehalten' : 'verpasst'), stopp ? RK_STOPP_MS : st.maxMs)
    return () => { cancelAnimationFrame(bild); clearTimeout(t) }
  }, [phase, nr, plan, st, werte])

  // Rückmeldung kurz stehen lassen, dann weiter (oder Schluss)
  useEffect(() => {
    if (phase !== 'rueck' || !rueck) return
    const gutGelaufen = rueck.art === 'gut' || rueck.art === 'gehalten'
    const t = setTimeout(() => {
      const s = stand.current
      if (s.gewertet >= n || s.fruehstarts >= n) { schliesseAb(); return }
      const l = lage.current
      if (rueck.art === 'frueh') l.anlauf++
      else { l.nr++; l.anlauf = 0 }
      l.phase = 'warten'
      setNr(l.nr); setAnlauf(l.anlauf); setRueck(null); setPhase('warten')
    }, gutGelaufen ? RUECK_MS : RUECK_FEHLER_MS)
    return () => clearTimeout(t)
  }, [phase, rueck, n, schliesseAb])

  useTasten({
    ' ': () => antwort('frei'),
    ArrowLeft: () => antwort('links'),
    ArrowRight: () => antwort('rechts'),
    ArrowUp: () => antwort('oben'),
    ArrowDown: () => antwort('unten'),
  })

  const v = plan[Math.min(nr, n - 1)]
  const wahlreaktion = st.art === 'wahl'
  const reiz = phase !== 'reiz' ? undefined : v.art === 'pfeil' ? v.richtung : v.art

  let zustand: string
  let inhalt: ReactNode
  if (phase === 'warten') {
    zustand = 'warten'
    inhalt = wahlreaktion ? <span className="bt-tempo-rk-kreuz" aria-hidden="true">+</span> : <span className="bt-tempo-rk-klein">Warte …</span>
  } else if (phase === 'reiz') {
    if (v.art === 'einfach') { zustand = 'los'; inhalt = 'Jetzt!' }
    else if (v.art === 'stopp') { zustand = 'stopp'; inhalt = <><Ban size={118} strokeWidth={2.4} aria-hidden="true" /><span className="bt-tempo-rk-klein">Stopp</span></> }
    else { const Bild = PFEIL[v.richtung ?? 'links']; zustand = 'pfeil'; inhalt = <Bild size={170} strokeWidth={2.6} aria-label={`Pfeil nach ${PFEIL_NAME[v.richtung ?? 'links']}`} /> }
  } else {
    const art = rueck?.art ?? 'frueh'
    zustand = art === 'gut' || art === 'gehalten' ? 'gut' : 'schlecht'
    inhalt = art === 'gut' ? <span className="bt-zahl">{Math.round(rueck?.ms ?? 0)} ms</span> : <span className="bt-tempo-rk-mittel">{RUECK_TEXT[art]}</span>
  }

  const zeiten = stand.current.zeiten
  const letzte = zeiten.length ? Math.round(zeiten[zeiten.length - 1]) : null
  const fruehstarts = stand.current.fruehstarts
  const pfeilKnopf = (r: Richtung, taste: string) => {
    const Bild = PFEIL[r]
    return (
      <button key={r} type="button" className="bt-feld bt-tempo-rk-knopf" style={{ gridArea: r }} data-bt-richtung={r}
        aria-label={`Pfeil nach ${PFEIL_NAME[r]} (Taste ${taste})`} {...sofortKlick(() => antwort(r))}>
        <Bild size={24} aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="bt-lauf" data-bt-frei="reaktion" data-phase={phase} data-reiz={reiz} data-versuch={nr} data-anlauf={anlauf}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">Versuch {Math.min(nr + 1, n)} / {n}</span>}
        mitte={<Balken anteil={verlauf.length / n} />}
        rechts={<>
          {fruehstarts > 0 && <span className="bt-chip bt-chip-warm bt-zahl" data-bt-fruehstarts>{fruehstarts} {fruehstarts === 1 ? 'Frühstart' : 'Frühstarts'}</span>}
          <span className="bt-chip bt-chip-akzent bt-zahl">{letzte === null ? '– ms' : `${letzte} ms`}</span>
        </>}
      />
      <div className="bt-aufgabe">
        {wahlreaktion ? 'Drücke die Pfeiltaste, in deren Richtung der Pfeil zeigt' : 'Reagiere, sobald das Feld aufleuchtet'}
        {st.stopps > 0 && <span className="bt-leise" style={{ fontWeight: 400, fontSize: 14 }}> · bei „Stopp“ nichts drücken</span>}
      </div>

      <div className="bt-tempo-rk-feld" data-zustand={zustand} data-klickbar={wahlreaktion ? undefined : ''} data-bt-reizfeld
        role={wahlreaktion ? undefined : 'button'} aria-live="off"
        onPointerDown={wahlreaktion ? undefined : e => { if (e.button === 0) antwort('frei') }}>
        {inhalt}
      </div>

      <div className="bt-tempo-rk-verlauf" aria-label="Bisherige Versuche">
        {plan.map((_, i) => {
          const e = verlauf[i]
          const gut = e && (e.art === 'gut' || e.art === 'gehalten')
          return (
            <span key={i} className="bt-tempo-rk-marke bt-zahl" data-gut={gut ? '' : undefined} data-schlecht={e && !gut ? '' : undefined} data-jetzt={!e && i === nr ? '' : undefined}>
              {!e ? i + 1 : e.art === 'gut' ? Math.round(e.ms ?? 0) : e.art === 'gehalten' ? '✓' : '✗'}
            </span>
          )
        })}
      </div>

      {wahlreaktion ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
          <div className="bt-tempo-rk-tasten" data-vier={st.richtungen > 2 ? '' : undefined}>
            {pfeilKnopf('links', '←')}
            {st.richtungen > 2 && pfeilKnopf('oben', '↑')}
            {st.richtungen > 2 && pfeilKnopf('unten', '↓')}
            {pfeilKnopf('rechts', '→')}
          </div>
          <div className="bt-klein bt-leise" style={{ maxWidth: 300 }}>
            Pfeiltasten {st.richtungen > 2 ? <><Taste>←</Taste> <Taste>↑</Taste> <Taste>↓</Taste> <Taste>→</Taste></> : <><Taste>←</Taste> <Taste>→</Taste></>} oder die Knöpfe.
            Nicht raten: zu früh gedrückt zählt als Fehler.
          </div>
        </div>
      ) : (
        <div className="bt-klein bt-leise">
          <Taste>Leertaste</Taste> oder Klick ins Feld — aber erst, wenn es aufleuchtet. Zu früh gedrückt zählt als Fehler.
        </div>
      )}
    </div>
  )
}
