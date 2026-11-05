// ── Rundmail an ausgewählte Lizenz-Inhaber ──────────────────────────────────────
// Eine Mail je Person (persönliche Anrede mit Vorname, geduzt). Der Text ist frei
// anpassbar; `{vorname}` wird je Empfänger ersetzt. Wer wann angeschrieben wurde,
// steht geteilt auf dem Netzlaufwerk — so schreibt niemand dieselbe Person doppelt an.

import { api } from '../electronAPI'

const PROTOKOLL_FILE = 'xelion/lizenzen/mails.json'

export const PLATZHALTER_VORNAME = '{vorname}'

export interface MailVorlage { betreff: string; text: string }

export function standardVorlage(absender: string): MailVorlage {
  return {
    betreff: 'Kurze Frage: Nutzt du die Xelion-Telefonie-App?',
    text:
`Hallo ${PLATZHALTER_VORNAME},

auf dich ist aktuell eine Xelion-Lizenz zugewiesen. Wir schauen gerade, welche Lizenzen tatsächlich gebraucht werden.

Deshalb meine kurze Frage: Benutzt du die Xelion-Telefonie-App, oder reicht dir Microsoft Teams für deine Kommunikation aus?

Gib mir bitte einfach mit einer kurzen Antwort auf diese Mail Bescheid.

Vielen Dank und viele Grüße
${absender}
IT Support Marine`,
  }
}

/** Vorname aus „Vorname Nachname" oder „Nachname, Vorname"; Rückfall: aus der E-Mail. */
export function vornameVon(name: string, email = ''): string {
  const n = (name || '').trim()
  const ausName = n.includes(',') ? (n.split(',')[1] || '').trim().split(/\s+/)[0] : n.split(/\s+/)[0]
  if (ausName) return ausName
  const lokal = (email.split('@')[0] || '').split(/[._-]+/)[0] || ''
  return lokal ? lokal[0].toUpperCase() + lokal.slice(1) : ''
}

export function setzeEin(vorlage: string, vorname: string): string {
  return vorlage.split(PLATZHALTER_VORNAME).join(vorname)
}

// ── Protokoll ─────────────────────────────────────────────────────────────────

export interface MailEintrag { am: string; von: string; betreff: string; an: string }
interface ProtokollDatei { version: number; nachKey: Record<string, MailEintrag[]> }

export async function ladeMailProtokoll(): Promise<Record<string, MailEintrag[]>> {
  try {
    const d = await api().netReadJson<ProtokollDatei>(PROTOKOLL_FILE)
    if (d && d.nachKey && typeof d.nachKey === 'object') return d.nachKey
  } catch { /* noch keins */ }
  return {}
}

/** Hängt Einträge an (frisch gelesen → nur anhängen → schreiben), nie überschreiben. */
export async function protokolliereMails(neu: Record<string, MailEintrag>): Promise<Record<string, MailEintrag[]>> {
  const nachKey = await ladeMailProtokoll()
  for (const [k, e] of Object.entries(neu)) nachKey[k] = [...(nachKey[k] ?? []), e]
  await api().netWriteJson(PROTOKOLL_FILE, { version: 1, nachKey } satisfies ProtokollDatei)
  return nachKey
}
