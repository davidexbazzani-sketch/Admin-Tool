// Terra Incognita — eine Seegefecht-Einladung direkt aus dem Chat ablehnen, ohne das Spiel zu öffnen.
// Eine einzige Datei (z1, exklusiv angelegt: Wer zuerst antwortet, gilt). Wird erst beim Klick auf „Ablehnen“ geladen.
// Das ist ein Klick im Chat (wie das Senden einer Nachricht), kein Lauf des Spiels — darum geht es nicht durch die
// Schleuse des Spiels (die ist bei geschlossenem Raum zu). Damit ein hängendes Laufwerk trotzdem nichts aufstaut:
// immer nur eine Absage zugleich, und nach acht Sekunden wartet niemand mehr darauf.
import { versiegle } from './huelle'

interface NetzApi { netCreateExclusiveAsync?: (pfad: string, daten: unknown) => Promise<'ok' | 'vorhanden' | 'fehler'> }

let laeuft = false
export async function lehneAbAusChat(id: string, benutzer: string): Promise<void> {
  if (laeuft || !/^[a-z0-9_.-]{6,100}$/.test(id) || !benutzer) return
  const api = (globalThis as unknown as { electronAPI?: NetzApi }).electronAPI
  if (!api?.netCreateExclusiveAsync) return
  laeuft = true
  try {
    const zugriff = api.netCreateExclusiveAsync(`terra/duelle/${id}/z1.json`, await versiegle('duell', benutzer.toLowerCase(), 1, { d: id, ja: false }))
    const ende = zugriff.catch(() => 'fehler').finally(() => { laeuft = false })
    await Promise.race([ende, new Promise(r => setTimeout(r, 8000))])
  } catch { laeuft = false }
}
