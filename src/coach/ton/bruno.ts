// Der Coach — Brunos Stimme (Stufe 4): kurze Aufnahmen für geführte Übungen und Vorsprech-Sätze.
// Gespielt wird nur auf Knopfdruck (Büro!), nie automatisch. Jede Aufnahme wurde beim Erstellen mit einem
// Spracherkenner gegengehört (scripts/coach-ton-pruefe.py); Betonungs-Beispiele gibt es bewusst nicht, weil die
// Sprachausgabe Betonung nicht verlässlich setzt (gemessen am 25.11.2026).
import { host } from '../host/aktiv'

/** geführte Übungen mit Ton (Notfallkoffer): „sechzig“ und die Werkzeug-Kennungen */
export const GEFUEHRT = new Set(['sechzig', 'ausatmen', 'seufzer', 'umdeuten', 'annehmen', 'anspannen', 'blick', 'blackout'])

let laeuft: HTMLAudioElement | null = null

export function stoppeBruno(): void { try { laeuft?.pause() } catch { /* egal */ } laeuft = null }

/** spielt eine Aufnahme; löst auf, wenn sie zu Ende ist, gestoppt wurde oder nicht abspielbar war */
export function spieleBruno(datei: string, onEnde?: () => void): void {
  stoppeBruno()
  const a = new Audio(host().tonPfad(datei))
  laeuft = a
  const fertig = () => { if (laeuft === a) laeuft = null; onEnde?.() }
  a.onended = fertig
  a.onerror = fertig
  void a.play().catch(fertig)
}
