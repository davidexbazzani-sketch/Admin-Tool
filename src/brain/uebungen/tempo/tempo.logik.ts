// Tempo-Familie — gemeinsame, reine Helfer (ohne Oberfläche, in .tmp-test/brain/tempo_test.ts geprüft).
import type { MouseEvent, PointerEvent } from 'react'
import { klemme } from '../../kern/zufall'

/** Stufe auf 1..10 bringen (ganze Zahl) */
export const stufeFest = (stufe: number): number => klemme(Math.round(stufe) || 1, 1, 10)

/**
 * Güte für Übungen, bei denen das Tempo die eigentliche Leistung ist (Reaktionszeit, Zahlen verbinden).
 * Die allgemeine `guete()` gibt dem Tempo nur 20 % — wer fehlerfrei, aber gemächlich reagiert, käme dort
 * immer auf 0,8 und würde aufsteigen. Hier zählt das Tempo zur Hälfte:
 *   fehlerfrei + sehr schnell → 1,0 · fehlerfrei + Tempo 0,6 → 0,8 (Aufstieg) · fehlerfrei + langsam → 0,5.
 * Fehler drücken das Ganze anteilig (schnelles Raten lohnt sich nicht).
 */
export function tempoGuete(anteil: number, tempo: number): number {
  const a = klemme(anteil, 0, 1)
  return klemme(a * (0.5 + 0.5 * klemme(tempo, 0, 1)), 0, 1)
}

/** Güte aus einer Menge je Zeit: (richtig − falsch) gemessen an einem Zielwert (Ziel erreicht = 1). */
export function mengenGuete(richtig: number, falsch: number, ziel: number): number {
  return ziel > 0 ? klemme(Math.max(0, richtig - falsch) / ziel, 0, 1) : 0
}

/** 1.25 → „1,3“ */
export const kommaZahl = (x: number, stellen = 1): string => x.toFixed(stellen).replace('.', ',')

/**
 * Knopf, der schon beim Herunterdrücken der Maustaste auslöst (ein Klick käme erst beim Loslassen —
 * das wären rund 100 ms geschenkte Zeit). Die Tastatur-Bedienung des Knopfs (Enter/Leertaste, `detail === 0`)
 * bleibt erhalten; ein Mausklick löst nicht doppelt aus. Die Maus setzt außerdem keinen Fokus auf den Knopf —
 * sonst würde eine spätere Leertaste ihn ungewollt noch einmal auslösen.
 */
export function sofortKlick(aktion: () => void): { onPointerDown: (e: PointerEvent) => void; onMouseDown: (e: MouseEvent) => void; onClick: (e: MouseEvent) => void } {
  return {
    onPointerDown: e => { if (e.button === 0) aktion() },
    onMouseDown: e => e.preventDefault(),
    onClick: e => { if (e.detail === 0) aktion() },
  }
}
