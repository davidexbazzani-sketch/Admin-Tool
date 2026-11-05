// ── Logbuch der Software-Installationen ──────────────────────────────────────
// Wer hat wann was auf welchem PC installiert — und mit welchem Ergebnis. Gilt für alle
// Kacheln unter „Software Installationen" (SolidWorks, Xelion, Jabra, Enaio, eDrawings). Liegt
// zentral auf dem Netzlaufwerk, damit alle Admins dasselbe Logbuch sehen.
//
// Jeder Lauf bekommt beim START einen Eintrag „läuft" und beim ENDE sein Ergebnis. So
// bleibt auch ein Lauf sichtbar, dessen Tool zwischendurch geschlossen wurde (er steht
// dann als „ohne Rückmeldung" im Logbuch). Geschrieben wird immer gegen den frisch
// gelesenen Stand (nur den eigenen Eintrag ändern), damit sich zwei Admins nicht
// gegenseitig Einträge überschreiben. Eine Datei je Jahr hält die Dateien klein.

import { create } from 'zustand'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'

// 'eDrawings' bleibt für alte Logbuch-Einträge (die Kachel wurde am 04.11.2026 durch FreeCAD ersetzt)
export type InstallSoftware = 'SolidWorks' | 'Xelion' | 'Jabra' | 'Enaio' | 'Enaio Capture' | 'eDrawings' | 'FreeCAD'
export type InstallStatus = 'laeuft' | 'ok' | 'fehler' | 'abgebrochen'

export interface InstallLogEintrag {
  id: string
  software: InstallSoftware
  host: string
  von: string
  start: string          // ISO
  ende?: string          // ISO
  status: InstallStatus
  text: string
  /** z. B. „mit vorherigem vollständigen Entfernen", „gestartet aus Sound Fix" */
  details?: string
}

interface LogDatei { version: number; eintraege: InstallLogEintrag[] }

const ORDNER = 'logs/software_installs'
const datei = (jahr: number) => `${ORDNER}/logbuch_${jahr}.json`

/** Ab so viel Stunden ohne Abschluss gilt ein Lauf als „ohne Rückmeldung". */
export const OHNE_RUECKMELDUNG_STUNDEN = 4

/** Zähler, damit offene Logbuch-Ansichten nach einem Eintrag neu laden. */
export const useInstallLogVersion = create<{ v: number; bump: () => void }>(set => ({ v: 0, bump: () => set(s => ({ v: s.v + 1 })) }))

function wer(): string {
  const u = useAuthStore.getState().session?.user
  return u?.displayName || u?.username || 'unbekannt'
}

async function lese(jahr: number): Promise<InstallLogEintrag[]> {
  try {
    const d = await api().netReadJson<LogDatei>(datei(jahr))
    return d && Array.isArray(d.eintraege) ? d.eintraege : []
  } catch { return [] }
}

// Schreibvorgänge dieses Tools nacheinander — sonst überholt das Ende eines schnellen
// Laufs dessen eigenen Start-Eintrag.
let kette: Promise<unknown> = Promise.resolve()
function nacheinander<T>(f: () => Promise<T>): Promise<T> {
  const p = kette.then(f, f)
  kette = p.catch(() => undefined)
  return p
}

async function upsert(e: InstallLogEintrag): Promise<void> {
  const jahr = new Date(e.start).getFullYear()
  const liste = await lese(jahr)
  const i = liste.findIndex(x => x.id === e.id)
  if (i >= 0) liste[i] = { ...liste[i], ...e }
  else liste.push(e)
  try { await api().netWriteJson(datei(jahr), { version: 1, eintraege: liste } satisfies LogDatei) } catch { /* Logbuch darf nie den Ablauf stören */ }
  useInstallLogVersion.getState().bump()
}

const offen = new Map<string, InstallLogEintrag>()

/** Lauf beginnt — liefert die ID für logEnde. */
export function logStart(software: InstallSoftware, host: string, details?: string): Promise<string> {
  const e: InstallLogEintrag = {
    id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    software, host: host.trim().toUpperCase(), von: wer(), start: new Date().toISOString(),
    status: 'laeuft', text: 'Installation läuft …', details,
  }
  offen.set(e.id, e)
  return nacheinander(() => upsert(e)).then(() => e.id)
}

/** Lauf endet. */
export function logEnde(id: string, status: Exclude<InstallStatus, 'laeuft'>, text: string): Promise<void> {
  const basis = offen.get(id)
  if (!basis) return Promise.resolve()
  offen.delete(id)
  return nacheinander(() => upsert({ ...basis, status, text: text.slice(0, 1000), ende: new Date().toISOString() }))
}

/** Logbuch dieses und des vorigen Jahres, neueste zuerst. */
export async function ladeInstallLogbuch(): Promise<InstallLogEintrag[]> {
  const j = new Date().getFullYear()
  const [a, b] = await Promise.all([lese(j), lese(j - 1)])
  return [...a, ...b].sort((x, y) => y.start.localeCompare(x.start))
}

export function ohneRueckmeldung(e: InstallLogEintrag): boolean {
  return e.status === 'laeuft' && Date.now() - Date.parse(e.start) > OHNE_RUECKMELDUNG_STUNDEN * 3600_000
}

/**
 * Für Stores mit EINEM Lauf und einer `phase` (SolidWorks, Xelion): Start und Ende aus
 * den Zustandswechseln ableiten — so wird jeder Ausstieg erfasst, auch Timeout und
 * „Zurücksetzen" mitten im Lauf.
 */
export function beobachtePhase<S extends { phase: string; hostname: string; startTime: number; errorMsg: string }>(
  store: { subscribe: (f: (s: S, prev: S) => void) => () => void },
  software: InstallSoftware,
  erfolgText: (s: S) => string,
): void {
  let laufId: Promise<string> | null = null
  const schliesse = (status: Exclude<InstallStatus, 'laeuft'>, text: string) => {
    const id = laufId; laufId = null
    if (id) void id.then(i => logEnde(i, status, text))
  }
  store.subscribe((s, prev) => {
    const neuGestartet = s.phase === 'running' && (prev.phase !== 'running' || s.startTime !== prev.startTime)
    if (neuGestartet) {
      if (prev.phase === 'running') schliesse('abgebrochen', 'Durch einen neuen Lauf ersetzt.')
      laufId = logStart(software, s.hostname)
      return
    }
    if (prev.phase === 'running' && s.phase !== 'running') {
      if (s.phase === 'done') schliesse('ok', erfolgText(s))
      else if (s.phase === 'error') schliesse('fehler', s.errorMsg || 'Fehler ohne nähere Angabe.')
      else schliesse('abgebrochen', 'Vom Bediener zurückgesetzt/abgebrochen.')
    }
  })
}
