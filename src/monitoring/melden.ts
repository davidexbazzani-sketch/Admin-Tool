// ── PC-Überwachung: Meldungen NUR an den Ersteller ───────────────────────────
// Chat-Nachricht vom Absender „PC-Überwachung“ in den persönlichen Posteingang des
// Erstellers (Popup + Windows-Benachrichtigung macht der ChatController) und auf Wunsch
// eine E-Mail an seine Adresse. Die Mail geht über das Outlook des Rechners, der gerade
// prüft (wie beim Server-Monitor).

import { api } from '../electronAPI'
import { sende, sicher } from '../services/chat'
import type { MonAuftrag, MonMeldung, MonZustand } from './types'

export const MONITOR_BOT = { username: 'pc-ueberwachung', displayName: 'PC-Überwachung' }
export const istMonitorBot = (u: string | null | undefined) => !!u && sicher(u) === MONITOR_BOT.username

export async function melde(auftrag: MonAuftrag, z: MonZustand, art: MonMeldung['art'], titel: string, chatText: string, mailText?: string): Promise<void> {
  const m: MonMeldung = { at: new Date().toISOString(), art, text: titel, mail: 'aus' }
  try { await sende(MONITOR_BOT, { username: auftrag.erstelltVon.username, displayName: auftrag.erstelltVon.displayName }, chatText) } catch { /* Netzlaufwerk weg — steht trotzdem im Zustand */ }
  if (auftrag.mail && auftrag.mailAn?.trim()) {
    try {
      const r = await api().sendEmailRaw({ to: auftrag.mailAn.trim(), subject: titel, body: (mailText || chatText) + '\n\n— IT Admin Tool · PC-Überwachung', smtp: '', port: 587 })
      m.mail = r.success ? 'ok' : 'fehler'
      if (!r.success) m.mailFehler = r.error || 'unbekannt'
    } catch (e) { m.mail = 'fehler'; m.mailFehler = e instanceof Error ? e.message : String(e) }
  }
  z.meldungen.push(m)
  if (z.meldungen.length > 300) z.meldungen = z.meldungen.slice(-300)
}
