// Der Coach — der gerade gültige Host. Gesetzt wird er nur von den drei Einstiegsdateien (DerCoach.tsx, Erinnerung.tsx,
// kurzStand.ts) über setzeHost(); alle anderen Teile holen ihn mit host(). Ohne Host (z. B. in Tests) gilt ein stiller
// Ersatz, der nichts speichert.
import type { Ablage, CoachHost } from './host'

const stilleAblage: Ablage = {
  laden: async () => ({ ok: true, daten: null, verschluesselung: false }),
  speichern: async () => ({ ok: false, fehler: 'kein Speicher' }),
  loeschen: async () => true,
  beiseite: async () => true,
}
const ersatz: CoachHost = {
  benutzer: () => '', anzeigeName: () => '', raumOffen: () => false, darfSehen: () => false, andereKarteSichtbar: () => false,
  beobachte: () => () => { /* nichts */ }, ablage: () => stilleAblage, kannOeffnen: () => false, oeffne: () => { /* nichts */ },
  benachrichtige: () => { /* nichts */ }, speichereDatei: async () => false, ladeDatei: async () => null,
  bildPfad: d => `./coach/bilder/${d}`, tonPfad: d => `./coach/ton/${d}`,
}

let aktuell: CoachHost = ersatz
export function setzeHost(h: CoachHost): void { aktuell = h }
export const host = (): CoachHost => aktuell
