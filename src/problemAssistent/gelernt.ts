// ── Problem-Assistent: aus ausgeführten Lösungen lernen ──────────────────────
// Wird eine Lösung ausgeführt, merkt sich das Tool „Eingabe → Problem“. Bei ähnlicher
// Eingabe rückt dieses Problem für alle Kollegen nach vorn (und wird bei wiederholter
// gleicher Eingabe direkt vorgeschlagen).
//   problem-assistent/gelernt/<benutzer>.json — jeder schreibt nur seine eigene Datei,
//   gelesen werden alle → niemand überschreibt einen anderen.
// Nur die asynchronen Netz-Aufrufe (blockieren den Hauptprozess nicht).

import { api } from '../electronAPI'
import { falte, type PaGelernt } from './suche'

const ORDNER = 'problem-assistent/gelernt'
const MAX_JE_BENUTZER = 400
const sicher = (s: string) => (s || 'unbekannt').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60)

interface Datei { von: string; eintraege: { q: string; id: string; n: number; zuletzt: string }[] }

let cache: Promise<PaGelernt[]> | null = null

/** Umbenannte bzw. zusammengelegte Probleme (Softwarecenter → Intune, 08.11.2026): Gelerntes bleibt gültig. */
const UMBENANNT: Record<string, string> = {
  'leistung-sms-agent-host-cpu': 'leistung-intune-agent-cpu',
  'leistung-ccmcache-belegt-platz': 'leistung-imecache-belegt-platz',
  'update-softwarecenter-0x80091007-hash': 'update-unternehmensportal-inhalt-fehler',
  'update-softwarecenter-inhalt-nicht-gefunden': 'update-unternehmensportal-inhalt-fehler',
  'update-softwarecenter-neustart-countdown': 'update-intune-neustart-angekuendigt',
  'update-softwarecenter-haengt-wird-installiert': 'update-unternehmensportal-haengt-wird-installiert',
  'update-softwarecenter-0x87d0070c-laufzeit': 'update-unternehmensportal-haengt-wird-installiert',
  'update-softwarecenter-anforderungen-nicht-erfuellt': 'update-unternehmensportal-anforderungen-nicht-erfuellt',
  'update-softwarecenter-zeigt-programm-nicht': 'update-unternehmensportal-zeigt-programm-nicht',
  'update-softwarecenter-download-haengt': 'update-unternehmensportal-download-haengt',
  'update-softwarecenter-cache-voll': 'update-unternehmensportal-zu-wenig-speicher',
  'update-softwarecenter-oeffnet-nicht': 'update-unternehmensportal-fehlt',
  'update-softwarecenter-erkennung-0x87d00324': 'update-intune-0x87d1041c-nicht-erkannt',
  'update-softwarecenter-0x87d00668-weiter-erforderlich': 'update-intune-0x87d1041c-nicht-erkannt',
  'update-softwarecenter-wartungsfenster': 'update-intune-neustart-angekuendigt',
}

/** Alle Lern-Einträge aller Benutzer (gleiche Eingabe + Problem zusammengezählt). */
export function ladeGelernt(neu = false): Promise<PaGelernt[]> {
  if (cache && !neu) return cache
  cache = (async () => {
    let dateien: string[] = []
    try { dateien = (await api().netListDirAsync(ORDNER)).filter(f => f.endsWith('.json')) } catch { return [] }
    const summe = new Map<string, PaGelernt>()
    const listen = await Promise.all(dateien.map(f => api().netReadJsonAsync<Datei>(`${ORDNER}/${f}`).catch(() => null)))
    for (const d of listen) {
      if (!d || !Array.isArray(d.eintraege)) continue
      for (const e of d.eintraege) {
        if (!e || typeof e.q !== 'string' || typeof e.id !== 'string') continue
        const id = UMBENANNT[e.id] || e.id
        const k = `${e.q}\u0000${id}`
        const alt = summe.get(k)
        summe.set(k, { q: e.q, id, n: (alt?.n || 0) + Math.max(1, Math.min(50, Number(e.n) || 1)) })
      }
    }
    return [...summe.values()]
  })().catch(() => [])
  return cache
}

/** Merkt „Eingabe → ausgeführtes Problem“ in der eigenen Datei. */
export async function lerne(eingabe: string, problemId: string, benutzer: string): Promise<boolean> {
  const q = falte(eingabe).slice(0, 160)
  if (q.replace(/\s/g, '').length < 3 || !problemId) return false
  const pfad = `${ORDNER}/${sicher(benutzer)}.json`
  let d: Datei | null = null
  try { d = await api().netReadJsonAsync<Datei>(pfad) } catch { d = null }
  if (!d || !Array.isArray(d.eintraege)) d = { von: benutzer, eintraege: [] }
  const jetzt = new Date().toISOString()
  const e = d.eintraege.find(x => x.q === q && x.id === problemId)
  if (e) { e.n = Math.min(50, (Number(e.n) || 0) + 1); e.zuletzt = jetzt } else d.eintraege.push({ q, id: problemId, n: 1, zuletzt: jetzt })
  d.eintraege = d.eintraege.sort((a, b) => String(b.zuletzt).localeCompare(String(a.zuletzt))).slice(0, MAX_JE_BENUTZER)
  d.von = benutzer
  let ok = false
  try { ok = await api().netWriteJsonAsync(pfad, d) } catch { ok = false }
  cache = null
  return ok
}
