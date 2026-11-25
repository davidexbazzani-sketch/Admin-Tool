// Aufmerksamkeit — Zeitsteuerung für Reaktionsaufgaben (Stroop, Flanker, Aufgabenwechsel).
//
// Ein Durchgang läuft immer gleich ab:
//   Pause (neutral, Fixation) → [Hinweis vorab] → Reiz (Antwort bis zur Frist) → Rückmeldung → nächster Durchgang
// Gemessen wird mit performance.now() vom Erscheinen des Reizes bis zum Tastendruck. Der Startpunkt ist der
// Beginn des Bildaufbaus, in dem der Reiz zum ersten Mal gezeichnet wird (requestAnimationFrame direkt nach dem
// Einsetzen ins Dokument); liefert der Browser kein Bild (Fenster verdeckt), gilt der Zeitpunkt des Einsetzens.
// Angenommen wird je Durchgang genau EINE Antwort, und nur solange der Reiz offen ist — Tasten in der Pause
// zählen nicht. Alle Zeitgeber hängen an einem Effekt und werden beim Aushängen entfernt; `onEnde` kommt genau einmal.
import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

export type TaktPhase = 'start' | 'pause' | 'vor' | 'reiz' | 'rueck' | 'ende'

export interface TaktAntwort<A> {
  /** Nummer des Durchgangs (ab 0) */
  nr: number
  /** gewählte Antwort; null = Frist abgelaufen */
  wahl: A | null
  richtig: boolean
  /** Reaktionszeit in ms; null = keine Antwort */
  ms: number | null
}

export interface TaktPlan<A> {
  /** Zahl der Durchgänge; Infinity = läuft, bis `halt()` gerufen wird (Duell) */
  anzahl: number
  /** Vorlauf vor dem ersten Durchgang (Regel lesen, Finger auf die Tasten) */
  startMs: number
  /** neutrale Pause vor dem Durchgang */
  pauseMs: (nr: number) => number
  /** Hinweis schon vor dem Reiz zeigen (0 = gleichzeitig mit dem Reiz) */
  vorMs?: (nr: number) => number
  /** Antwortfrist ab Erscheinen des Reizes */
  fristMs: (nr: number) => number
  /** Dauer der Rückmeldung */
  rueckMs: (a: TaktAntwort<A>) => number
  pruefe: (nr: number, wahl: A) => boolean
  /** nach jeder Antwort (auch „zu langsam“) */
  onAntwort?: (a: TaktAntwort<A>, alle: readonly TaktAntwort<A>[]) => void
  /** genau einmal: nach dem letzten Durchgang oder nach `halt()` */
  onEnde: (alle: readonly TaktAntwort<A>[]) => void
}

export interface Takt<A> {
  nr: number
  phase: TaktPhase
  /** Antwort des laufenden Durchgangs (nur in der Phase 'rueck' gesetzt) */
  letzte: TaktAntwort<A> | null
  /** Antwort geben — wirkt nur, solange der Reiz offen ist */
  antworte: (wahl: A) => void
  /** sofort beenden (Duell: Zeit abgelaufen) */
  halt: () => void
}

export function useReizTakt<A>(plan: TaktPlan<A>): Takt<A> {
  const [stand, setStand] = useState<{ nr: number; phase: TaktPhase }>({ nr: 0, phase: 'start' })
  const p = useRef(plan)
  p.current = plan
  const alle = useRef<TaktAntwort<A>[]>([])
  /** der Reiz steht und wartet auf eine Antwort */
  const offen = useRef(false)
  const offenNr = useRef(0)
  const reizAb = useRef(0)
  const aus = useRef(false)

  const beende = useCallback(() => {
    if (aus.current) return
    aus.current = true
    offen.current = false
    setStand(s => ({ nr: s.nr, phase: 'ende' }))
    p.current.onEnde(alle.current)
  }, [])

  const buche = useCallback((wahl: A | null, ms: number | null) => {
    if (aus.current || !offen.current) return
    offen.current = false
    const nr = offenNr.current
    const a: TaktAntwort<A> = { nr, wahl, richtig: wahl !== null && p.current.pruefe(nr, wahl), ms }
    alle.current.push(a)
    setStand({ nr, phase: 'rueck' })
    p.current.onAntwort?.(a, alle.current)
  }, [])

  // Layout-Effekt: läuft, sobald der neue Stand im Dokument steht, also noch VOR dem Zeichnen
  useLayoutEffect(() => {
    const { nr, phase } = stand
    if (phase === 'ende' || aus.current) return
    let zeit = 0
    let bild = 0
    let weiter: () => void
    if (phase === 'start') {
      zeit = p.current.startMs
      weiter = () => setStand({ nr: 0, phase: 'pause' })
    } else if (phase === 'pause') {
      zeit = p.current.pauseMs(nr)
      weiter = () => setStand({ nr, phase: (p.current.vorMs?.(nr) ?? 0) > 0 ? 'vor' : 'reiz' })
    } else if (phase === 'vor') {
      zeit = p.current.vorMs?.(nr) ?? 0
      weiter = () => setStand({ nr, phase: 'reiz' })
    } else if (phase === 'reiz') {
      // ab jetzt zählt die Reaktionszeit; der Startpunkt wird auf den Beginn des Bildes nachgezogen, das den Reiz zeigt
      reizAb.current = performance.now()
      bild = requestAnimationFrame(() => { reizAb.current = performance.now() })
      offenNr.current = nr
      offen.current = true
      zeit = p.current.fristMs(nr)
      weiter = () => buche(null, null)
    } else {
      zeit = p.current.rueckMs(alle.current[alle.current.length - 1])
      weiter = () => { if (nr + 1 >= p.current.anzahl) beende(); else setStand({ nr: nr + 1, phase: 'pause' }) }
    }
    const t = setTimeout(() => weiter(), Math.max(0, zeit))
    return () => {
      clearTimeout(t)
      if (bild) cancelAnimationFrame(bild)
      if (phase === 'reiz') offen.current = false
    }
  }, [stand, buche, beende])

  const antworte = useCallback((wahl: A) => {
    if (!offen.current) return
    buche(wahl, performance.now() - reizAb.current)
  }, [buche])

  const letzte = stand.phase === 'rueck' ? alle.current[alle.current.length - 1] ?? null : null
  return { nr: stand.nr, phase: stand.phase, letzte, antworte, halt: beende }
}

/**
 * Eigenschaften für Antwortknöpfe. Der Knopf
 *  • löst schon beim Herunterdrücken aus (genauere Reaktionszeit als erst beim Loslassen),
 *  • nimmt keinen Fokus an — sonst würde ihn die Leertaste ein zweites Mal auslösen,
 *  • schluckt den Klick, der auf das Herunterdrücken folgt (kein doppeltes Auslösen).
 * Aufruf: const druck = useDruck();  <button {...druck(() => antworte('links'))}>
 */
export function useDruck() {
  const gedrueckt = useRef(false)
  return useCallback((aktion: () => void) => ({
    tabIndex: -1,
    onMouseDown: (e: MouseEvent) => e.preventDefault(),
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return
      gedrueckt.current = true
      aktion()
    },
    onClick: () => {
      if (gedrueckt.current) { gedrueckt.current = false; return }
      aktion()
    },
  }), [])
}
