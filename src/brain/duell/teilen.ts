// Freiwilliges Teilen eines IQ-Ergebnisses: per Chat an ausgewählte Kollegen und/oder als Eintrag
// in die Bestenliste. NUR was der Benutzer hier selbst auslöst, verlässt den eigenen PC —
// geteilt werden Schätzwert, Bereich, Testlänge und Datum, nie einzelne Antworten.
import { api } from '../../electronAPI'
import { sende, type ChatIch } from '../../services/chat'
import type { IqEintrag } from '../kern/typen'
import { bereichText, iqText } from '../iq/irt'

export interface BestenEintrag { username: string; displayName: string; iq: number; von: number; bis: number; fragen: number; am: string }

const ORDNER = 'brain/bestenliste'
const sicher = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_')
const pfad = (username: string) => `${ORDNER}/${sicher(username)}.json`

export async function ladeBestenliste(): Promise<BestenEintrag[]> {
  let dateien: string[] = []
  try { dateien = (await api().netListDirAsync(ORDNER)).filter(f => /\.json$/i.test(f)) } catch { return [] }
  const roh = await Promise.all(dateien.map(f => api().netReadJsonAsync<Partial<BestenEintrag>>(`${ORDNER}/${f}`).catch(() => null)))
  const aus: BestenEintrag[] = []
  for (const e of roh) {
    if (!e || typeof e.username !== 'string' || typeof e.iq !== 'number' || typeof e.von !== 'number' || typeof e.bis !== 'number') continue
    aus.push({ username: e.username, displayName: typeof e.displayName === 'string' && e.displayName ? e.displayName : e.username, iq: e.iq, von: e.von, bis: e.bis, fragen: Number(e.fragen) || 0, am: typeof e.am === 'string' ? e.am : '' })
  }
  // Sortiert nach Schätzwert; bei Gleichstand zählt der genauere Test (mehr Fragen)
  return aus.sort((a, b) => b.iq - a.iq || b.fragen - a.fragen || a.displayName.localeCompare(b.displayName, 'de'))
}

/** Eigenen Eintrag veröffentlichen (ersetzt einen früheren). */
export async function veroeffentliche(ich: ChatIch, e: IqEintrag): Promise<boolean> {
  const eintrag: BestenEintrag = { username: ich.username.toLowerCase(), displayName: ich.displayName || ich.username, iq: e.iq, von: e.von, bis: e.bis, fragen: e.fragen, am: e.t }
  try { return await api().netWriteJsonAsync(pfad(ich.username), eintrag) } catch { return false }
}
export async function entferneEintrag(username: string): Promise<boolean> {
  try { return await api().netDeleteFileAsync(pfad(username)) } catch { return false }
}

export function iqTextFuerChat(e: IqEintrag): string {
  const am = new Date(e.t).toLocaleDateString('de-DE')
  return `🧠 Brain Trainer — mein IQ-Test vom ${am} (${e.fragen} Fragen): Schätzwert ${iqText(e.iq)}, wahrscheinlicher Bereich ${bereichText(e.von, e.bis)}. (Orientierung, kein offizieller Test.)`
}

/** Ergebnis als Chat-Nachricht an die ausgewählten Kollegen. Gibt zurück, bei wie vielen es geklappt hat. */
export async function teileImChat(ich: ChatIch, an: { username: string; displayName: string }[], e: IqEintrag): Promise<number> {
  const text = iqTextFuerChat(e)
  const ergebnis = await Promise.all(an.map(empfaenger => sende(ich, empfaenger, text).then(n => !!n).catch(() => false)))
  return ergebnis.filter(Boolean).length
}
