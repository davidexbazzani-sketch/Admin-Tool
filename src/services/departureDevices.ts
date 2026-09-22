// ── Austritte × Endgeräte-Abgleich ───────────────────────────────────────────
// Findet zu einem (ausgetretenen) Mitarbeiter die Endgeräte aus der Endgeräte-
// Übersicht, die noch auf ihn zugewiesen sind (Feld `assignedTo`). Der Namens-
// abgleich ist fuzzy (Vor/Nachname vertauscht, Tippfehler, Umlaute) über
// `fuzzyNameMatch`; zusätzlich exakter Treffer auf die Global-/Corp-ID, falls die
// im `assignedTo`-Feld statt des Namens steht.

import { loadDevices, type EndpointDevice } from './endpointDevices'
import { fuzzyNameMatch } from '../utils/nameMatch'

/** Endgeräte, die auf `name` (oder exakt auf `globalId`) zugewiesen sind. */
export function devicesForName(name: string, globalId: string | undefined, devices: EndpointDevice[]): EndpointDevice[] {
  const gid = (globalId || '').trim().toLowerCase()
  const nm = (name || '').trim()
  if (!nm && !gid) return []
  return devices.filter(d => {
    const at = (d.assignedTo || '').trim()
    if (!at) return false
    if (gid && at.toLowerCase() === gid) return true
    return !!nm && fuzzyNameMatch(at, nm)
  })
}

/** Gilt ein Gerät als „aktiv noch zugewiesen" (nicht ausgemustert/Leasingende)? */
export function isActiveAssignment(d: EndpointDevice): boolean {
  const state = (d.state || '').toLowerCase()
  if (/retired|ausgemustert|disposed|entsorgt|abgebaut/.test(state)) return false
  if ((d.retiredDate || '').trim()) return false
  return true
}

/** Lädt die Geräte EINMAL und ordnet jeder Departure-ID ihre Geräte zu (nur Treffer). */
export async function loadDeviceMapForDepartures(
  departures: { id: string; name: string; globalId: string }[],
): Promise<Record<string, EndpointDevice[]>> {
  const devices = await loadDevices().catch(() => [] as EndpointDevice[])
  const out: Record<string, EndpointDevice[]> = {}
  for (const d of departures) {
    const list = devicesForName(d.name, d.globalId, devices)
    if (list.length) out[d.id] = list
  }
  return out
}
