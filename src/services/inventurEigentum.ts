// ── Hardware-Inventur – Eigentum („Wer bezahlt?") ──────────────────────────────
// Jedes Inventur-Gerät bekommt per Seriennummer das Feld „Wer bezahlt?" aus der
// Endgeräte-Übersicht. Steht dort SKF → Label „SKF Eigentum".
//
// Gespeichert wird je Gerät `owner` als Momentaufnahme:
//   undefined → noch nie abgeglichen
//   null      → nicht in der Endgeräte-Übersicht
//   ''        → in der Übersicht, aber ohne Angabe
//   'SKF' …   → Rohwert aus der Spalte
// Beim Anzeigen gewinnt der aktuelle Wert aus der Übersicht; fehlt das Gerät dort
// inzwischen (z. B. zurückgegeben), bleibt die gespeicherte Momentaufnahme.

import { api } from '../electronAPI'
import { loadDevices } from './endpointDevices'
import { normalizeSerial, type InventoryRun } from './hardwareInventory'

export type EigentumKlasse = 'skf' | 'hcl' | 'sonst' | 'unbekannt'

export const EIGENTUM_LABEL: Record<EigentumKlasse, string> = {
  skf: 'SKF Eigentum',
  hcl: 'HCL',
  sonst: 'Sonstige',
  unbekannt: 'Unbekannt',
}

export function eigentumKlasse(owner: string | null | undefined): EigentumKlasse {
  if (owner === undefined || owner === null) return 'unbekannt'
  if (/skf/i.test(owner)) return 'skf'
  if (/hcl/i.test(owner)) return 'hcl'
  return 'sonst'
}

/** Text für Export/Tooltip: „SKF", „HCL", Rohwert oder Hinweis. */
export function eigentumText(owner: string | null | undefined): string {
  const k = eigentumKlasse(owner)
  if (k === 'skf') return 'SKF'
  if (k === 'hcl') return 'HCL'
  if (k === 'unbekannt') return owner === null ? 'nicht in Endgeräte-Übersicht' : ''
  return (owner || '').trim() || 'ohne Angabe'
}

/**
 * Fach = Kommentar am Asset in der Asset-Datenbank (Endgeräte-Übersicht) — hat
 * IMMER Vorrang, auch wenn er leer ist. Nur wenn das Gerät dort gar nicht
 * vorkommt (epComment undefined), gilt der Kommentar aus dem Inventur-Import.
 */
export function fachText(x: { comment?: string; epComment?: string; fachNachgetragen?: string }): string {
  const ep = (x.epComment || '').trim()
  if (ep) return ep
  // beim Scan in ServiceNow nachgetragen (Asset-Datenbank kennt es erst nach dem nächsten Endgeräte-Import)
  const nach = (x.fachNachgetragen || '').trim()
  if (nach) return nach
  return x.epComment !== undefined ? '' : (x.comment || '').trim()
}

/** Muss beim Scan nach dem Fach gefragt werden? (nur wenn die Endgeräte-Übersicht geladen ist) */
export function fachFehlt(x: { comment?: string; epComment?: string; fachNachgetragen?: string; fachBestaetigtAm?: string }): boolean {
  return !fachText(x) && !x.fachBestaetigtAm
}

/** Kommentar aus dem Inventur-Import, wenn er vom Fach abweicht (sonst ''). */
export function importKommentarAbweichend(x: { comment?: string; epComment?: string; fachNachgetragen?: string }): string {
  const c = (x.comment || '').trim()
  return c && c !== fachText(x) ? c : ''
}

/** Seriennummer → „Wer bezahlt?" + Asset-Kommentar. null, wenn die Endgeräte-Übersicht leer/unlesbar ist. */
export type EigentumLookup = Map<string, { owner: string; kommentar: string }>

let cache: { am: number; map: EigentumLookup | null } | null = null
const CACHE_MS = 60_000

export async function ladeEigentum(frisch = false): Promise<EigentumLookup | null> {
  if (!frisch && cache && Date.now() - cache.am < CACHE_MS) return cache.map
  let map: EigentumLookup | null = null
  try {
    const devs = await loadDevices()
    if (devs.length > 0) {
      map = new Map()
      for (const d of devs) {
        const s = normalizeSerial(d.serial)
        if (!s) continue
        const owner = (d.assetOwnership || '').trim()
        const kommentar = (d.comments || '').trim()
        // doppelte Seriennummer: eine Angabe schlägt „leer"
        const alt = map.get(s)
        map.set(s, { owner: alt?.owner || owner, kommentar: alt?.kommentar || kommentar })
      }
    }
  } catch { map = null }
  cache = { am: Date.now(), map }
  return map
}

/**
 * Trägt Eigentum + Asset-Kommentar in alle Geräte und unerwarteten Scans ein.
 * Ohne Lookup (Übersicht unlesbar) bleibt alles, wie es ist. Liefert eine Kopie.
 */
export function mitEigentum(run: InventoryRun, lookup: EigentumLookup | null): { run: InventoryRun; geaendert: boolean } {
  if (!lookup) return { run, geaendert: false }
  let geaendert = false
  function ergaenze<T extends { serial: string; owner?: string | null; epComment?: string }>(x: T): T {
    const e = lookup!.get(x.serial)
    // nicht (mehr) in der Übersicht: gespeicherte Momentaufnahme behalten
    const owner = e ? e.owner : (x.owner === undefined ? null : x.owner)
    const epComment = e ? e.kommentar : x.epComment
    if (owner === x.owner && epComment === x.epComment) return x
    geaendert = true
    return { ...x, owner, epComment }
  }
  const devices = run.devices.map(ergaenze)
  const extras = run.extras.map(ergaenze)
  return { run: geaendert ? { ...run, devices, extras } : run, geaendert }
}

/**
 * Momentaufnahme dauerhaft im Bericht speichern (für frühere Inventuren).
 * Lädt den Bericht frisch, ändert nur `owner` und lässt „Stand"/Index unberührt.
 */
export async function speichereEigentum(runId: string, lookup: EigentumLookup | null): Promise<boolean> {
  if (!lookup) return false
  try {
    const datei = `hardware-inventory/runs/${runId}.json`
    const frisch = await api().netReadJson<InventoryRun>(datei)
    if (!frisch || !Array.isArray(frisch.devices)) return false
    if (!Array.isArray(frisch.extras)) frisch.extras = []
    const { run, geaendert } = mitEigentum(frisch, lookup)
    if (!geaendert) return true
    return await api().netWriteJson(datei, run)
  } catch { return false }
}

export function zaehleEigentum(owners: Array<string | null | undefined>): Record<EigentumKlasse, number> {
  const z: Record<EigentumKlasse, number> = { skf: 0, hcl: 0, sonst: 0, unbekannt: 0 }
  for (const o of owners) z[eigentumKlasse(o)]++
  return z
}
