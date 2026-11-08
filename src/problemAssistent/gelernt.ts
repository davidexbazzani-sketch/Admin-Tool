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
        const k = `${e.q}\u0000${e.id}`
        const alt = summe.get(k)
        summe.set(k, { q: e.q, id: e.id, n: (alt?.n || 0) + Math.max(1, Math.min(50, Number(e.n) || 1)) })
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
