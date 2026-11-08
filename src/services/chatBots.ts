// ── Chat: automatische Absender (kein Antworten möglich) ─────────────────────
import { DRUCKER_BOT, istDruckerBot } from './tonerWarnung'
import { MONITOR_BOT, istMonitorBot } from '../monitoring/melden'

export interface ChatBot { username: string; displayName: string; status: string; leer: string; fuss: string }

export const CHAT_BOTS: ChatBot[] = [
  { ...DRUCKER_BOT, status: 'automatische Toner-Meldungen', leer: 'Noch keine Toner-Meldungen — hier erscheint es, sobald eine Patrone fast leer ist.', fuss: 'Automatische Meldungen des Toner-Checks — Antworten ist hier nicht möglich.' },
  { ...MONITOR_BOT, status: 'Meldungen deiner Überwachungen', leer: 'Noch keine Meldungen — hier erscheinen die Ergebnisse der PC-Überwachungen, die du angelegt hast.', fuss: 'Automatische Meldungen der PC-Überwachung (nur an dich als Ersteller) — Antworten ist hier nicht möglich.' },
]

export const istBot = (u: string | null | undefined) => istDruckerBot(u) || istMonitorBot(u)
export const botVon = (u: string | null | undefined): ChatBot | undefined =>
  istDruckerBot(u) ? CHAT_BOTS[0] : istMonitorBot(u) ? CHAT_BOTS[1] : undefined
export { istDruckerBot, istMonitorBot }
