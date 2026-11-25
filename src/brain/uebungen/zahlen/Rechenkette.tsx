// Rechenkette (Zahlen + Arbeitsgedächtnis): Eine Startzahl, dann erscheinen nacheinander
// Rechenschritte („+ 5“, „· 2“ …). Im Kopf mitrechnen, am Ende das Ergebnis eintippen.
// Trainiert, ein Zwischenergebnis zu halten und fortlaufend zu verändern.
//
// Stufe 1–3: plus/minus einstellig, 3–4 Schritte · 4–6: bis 20, dazu „mal 2/3“, 5–6 Schritte ·
// 7–10: mal und geteilt, 6–8 Schritte. Die Schritte kommen von Stufe zu Stufe schneller
// (1,8 s → 0,9 s). Fünf Ketten je Durchgang.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FreiProps } from '../../kern/typen'
import { rng, type Rng } from '../../kern/zufall'
import { guete } from '../../kern/wertung'
import { Balken, KopfZeile } from '../../ablauf/kit'

export interface KettenSchritt { zeichen: '+' | '−' | '·' | ':'; wert: number }
export interface Kette { start: number; schritte: KettenSchritt[]; ergebnis: number }

const s10 = (stufe: number) => Math.max(1, Math.min(10, Math.round(stufe)))
export const kettenLaenge = (stufe: number): number => [3, 4, 4, 5, 5, 6, 6, 7, 7, 8][s10(stufe) - 1]
export const schrittMs = (stufe: number): number => [1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100, 1000, 900][s10(stufe) - 1]
export const KETTEN_JE_DURCHGANG = 5

export function rechne(a: number, s: KettenSchritt): number {
  return s.zeichen === '+' ? a + s.wert : s.zeichen === '−' ? a - s.wert : s.zeichen === '·' ? a * s.wert : a / s.wert
}

/** Kette erzeugen: Zwischenergebnisse bleiben ganze Zahlen zwischen 1 und der Obergrenze. */
export function erzeugeKette(r: Rng, stufe: number): Kette {
  const s = s10(stufe)
  const max = s <= 3 ? 40 : s <= 6 ? 120 : 300
  const start = s <= 3 ? r.int(3, 15) : s <= 6 ? r.int(5, 30) : r.int(6, 40)
  const schritte: KettenSchritt[] = []
  let stand = start
  for (let i = 0; i < kettenLaenge(s); i++) {
    const moeglich: KettenSchritt[] = []
    const plusMax = s <= 3 ? 9 : 20
    for (let v = 0; v < 6; v++) {
      const w = r.int(s <= 3 ? 1 : 2, plusMax)
      if (stand + w <= max) moeglich.push({ zeichen: '+', wert: w })
      if (stand - w >= 1) moeglich.push({ zeichen: '−', wert: w })
    }
    if (s >= 4) for (const f of s >= 7 ? [2, 3, 4, 5] : [2, 3]) if (stand * f <= max) moeglich.push({ zeichen: '·', wert: f }, { zeichen: '·', wert: f })
    if (s >= 7) for (const t of [2, 3, 4, 5]) if (stand % t === 0 && stand / t >= 2) moeglich.push({ zeichen: ':', wert: t }, { zeichen: ':', wert: t }, { zeichen: ':', wert: t })
    // nicht denselben Schritt direkt rückgängig machen (+5 gefolgt von −5)
    const letzter = schritte[schritte.length - 1]
    const sinnvoll = moeglich.filter(m => !(letzter && m.wert === letzter.wert && ((m.zeichen === '+' && letzter.zeichen === '−') || (m.zeichen === '−' && letzter.zeichen === '+') || (m.zeichen === '·' && letzter.zeichen === ':') || (m.zeichen === ':' && letzter.zeichen === '·'))))
    const wahl = r.aus(sinnvoll.length ? sinnvoll : moeglich.length ? moeglich : [{ zeichen: '+', wert: 1 } as KettenSchritt])
    schritte.push(wahl)
    stand = rechne(stand, wahl)
  }
  return { start, schritte, ergebnis: stand }
}

type Phase = 'start' | 'schritt' | 'eingabe' | 'urteil'

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const [nr, setNr] = useState(0)
  const [phase, setPhase] = useState<Phase>('start')
  const [schritt, setSchritt] = useState(0)
  const [eingabe, setEingabe] = useState('')
  const [richtig, setRichtig] = useState(0)
  const [letzteOk, setLetzteOk] = useState(false)
  const fertig = useRef(false)
  const feld = useRef<HTMLInputElement>(null)
  const kette = useMemo(() => erzeugeKette(rng(start).zweig(nr), stufe), [start, nr, stufe])
  const takt = schrittMs(stufe)

  // Ablauf: Startzahl → Schritte → Eingabe
  useEffect(() => {
    if (phase === 'start') { const t = setTimeout(() => { setSchritt(0); setPhase('schritt') }, 1700); return () => clearTimeout(t) }
    if (phase === 'schritt') {
      const t = setTimeout(() => { if (schritt + 1 >= kette.schritte.length) setPhase('eingabe'); else setSchritt(x => x + 1) }, takt)
      return () => clearTimeout(t)
    }
    if (phase === 'eingabe') feld.current?.focus()
  }, [phase, schritt, kette, takt])

  const weiter = useCallback((ok: boolean, bisher: number) => {
    if (fertig.current) return
    if (nr + 1 >= KETTEN_JE_DURCHGANG) {
      fertig.current = true
      const r = bisher + (ok ? 1 : 0)
      onFertig({ leistung: guete(r / KETTEN_JE_DURCHGANG, 1), richtig: r, gesamt: KETTEN_JE_DURCHGANG, text: `${kettenLaenge(stufe)} Schritte je Kette` })
      return
    }
    setEingabe(''); setPhase('start'); setNr(n => n + 1)
  }, [nr, onFertig, stufe])

  const pruefe = () => {
    if (phase !== 'eingabe' || !eingabe.trim()) return
    const ok = Number(eingabe.replace(',', '.').replace('−', '-')) === kette.ergebnis
    setLetzteOk(ok)
    if (ok) setRichtig(x => x + 1)
    setPhase('urteil')
  }
  useEffect(() => {
    if (phase !== 'urteil') return
    const t = setTimeout(() => weiter(letzteOk, richtig - (letzteOk ? 1 : 0)), letzteOk ? 900 : 2200)
    return () => clearTimeout(t)
  }, [phase, letzteOk, richtig, weiter])

  const s = kette.schritte[schritt]
  return (
    <div className="bt-lauf" data-bt-frei="rechenkette" data-phase={phase} data-nr={nr}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">Kette {nr + 1} / {KETTEN_JE_DURCHGANG}</span>}
        mitte={<Balken anteil={(nr + (phase === 'urteil' ? 1 : phase === 'eingabe' ? 0.9 : phase === 'schritt' ? (schritt + 1) / (kette.schritte.length + 1) : 0)) / KETTEN_JE_DURCHGANG} />}
        rechts={<span className="bt-chip bt-chip-gut bt-zahl">{richtig} richtig</span>}
      />
      <div className="bt-aufgabe">
        {phase === 'start' ? 'Merke dir die Startzahl' : phase === 'schritt' ? `Rechne im Kopf weiter · Schritt ${schritt + 1} von ${kette.schritte.length}` : 'Was kommt heraus?'}
      </div>

      {phase === 'start' && <div key={`s${nr}`} className="bt-reiz bt-ein" data-bt-startzahl>{kette.start}</div>}
      {phase === 'schritt' && <div key={`k${nr}-${schritt}`} className="bt-reiz bt-ein" style={{ color: 'var(--bt-akzent-stark)' }} data-bt-schritt>{s.zeichen} {s.wert}</div>}
      {(phase === 'eingabe' || phase === 'urteil') && (
        <form onSubmit={e => { e.preventDefault(); pruefe() }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, minHeight: 180, justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input ref={feld} className="bt-eingabe" data-bt-eingabe value={eingabe} disabled={phase === 'urteil'} inputMode="numeric" autoComplete="off" aria-label="Ergebnis"
              data-zustand={phase === 'urteil' ? (letzteOk ? 'richtig' : 'falsch') : undefined}
              onChange={e => setEingabe(e.target.value.replace(/[^0-9\-−]/g, ''))} />
            {phase === 'eingabe' && <button type="submit" className="bt-knopf" disabled={!eingabe.trim()} data-bt-ok>OK</button>}
          </div>
          {phase === 'urteil' && (
            <div className="bt-leise bt-ein" data-bt-urteil>
              {letzteOk ? <b style={{ color: 'var(--bt-gut)' }}>Richtig</b> : <>
                <b style={{ color: 'var(--bt-schlecht)' }}>Richtig wäre {kette.ergebnis}</b>
                <span> — {kette.start} → {kette.schritte.map(x => `${x.zeichen} ${x.wert}`).join(' → ')}</span>
              </>}
            </div>
          )}
        </form>
      )}
    </div>
  )
}
