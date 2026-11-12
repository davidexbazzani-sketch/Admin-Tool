// ── Endgeräte-Übersicht – Kostenverlauf ───────────────────────────────────────
// Einmal pro Kalenderwoche ein Messpunkt der Gesamtkosten (alle Geräte mit bekanntem
// Model-Typ — unabhängig von Filtern in der Ansicht). Der Punkt der LAUFENDEN Woche
// wird bei jeder Prüfung auf den aktuellen Stand gezogen (z. B. nach einem Excel-Import);
// Punkte vergangener Wochen werden nie mehr verändert. Fehlt eine Woche (Tool lief
// nicht), verbindet der Chart einfach die vorhandenen Punkte.
//
// Speicher: endpoint-devices/kosten_verlauf.json (geteilt für alle App-User)

import { api } from '../electronAPI'
import { loadDevices, classifyModel, deviceCost, type EndpointDevice } from './endpointDevices'

export interface KostenPunkt {
  woche: string                 // ISO-Kalenderwoche, z. B. "2026-W44"
  montag: string                // Montag dieser Woche (YYYY-MM-DD) — für die x-Achse
  monatlich: number
  jaehrlich: number
  geraete: number               // Geräte mit bekanntem Model-Typ (gehen in die Kosten ein)
  geraeteGesamt: number
  jeTyp: Record<string, { anzahl: number; monatlich: number }>
  aktualisiertAm: string
  von: string
}

interface VerlaufDatei { version: number; punkte: KostenPunkt[] }

const DATEI = 'endpoint-devices/kosten_verlauf.json'

/** ISO-8601-Kalenderwoche (Woche mit dem ersten Donnerstag = KW 1) + Montag der Woche. */
export function isoWoche(d: Date): { woche: string; montag: string } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const wt = t.getUTCDay() || 7
  const mo = new Date(t); mo.setUTCDate(t.getUTCDate() - wt + 1)
  t.setUTCDate(t.getUTCDate() + 4 - wt)   // Donnerstag derselben Woche bestimmt das Jahr
  const jahr = t.getUTCFullYear()
  const kw = Math.ceil(((t.getTime() - Date.UTC(jahr, 0, 1)) / 86400000 + 1) / 7)
  return { woche: `${jahr}-W${String(kw).padStart(2, '0')}`, montag: mo.toISOString().slice(0, 10) }
}

const rund = (n: number) => Math.round(n * 100) / 100

export function berechneKosten(devices: EndpointDevice[]): Pick<KostenPunkt, 'monatlich' | 'jaehrlich' | 'geraete' | 'geraeteGesamt' | 'jeTyp'> {
  let monatlich = 0, geraete = 0
  const jeTyp: KostenPunkt['jeTyp'] = {}
  for (const d of devices) {
    const c = deviceCost(d)   // SKF-Eigentum kostet nichts mehr
    if (c === null) continue
    monatlich += c; geraete++
    const typ = classifyModel(d.model)
    const e = jeTyp[typ] || (jeTyp[typ] = { anzahl: 0, monatlich: 0 })
    e.anzahl++; e.monatlich = rund(e.monatlich + c)
  }
  return { monatlich: rund(monatlich), jaehrlich: rund(monatlich * 12), geraete, geraeteGesamt: devices.length, jeTyp }
}

export async function ladeKostenVerlauf(): Promise<KostenPunkt[]> {
  try {
    const d = await api().netReadJson<VerlaufDatei>(DATEI)
    if (d && Array.isArray(d.punkte)) return [...d.punkte].sort((a, b) => a.woche.localeCompare(b.woche))
  } catch { /* leer */ }
  return []
}

/**
 * Setzt bzw. aktualisiert den Punkt der laufenden Woche. Liest dafür die Datei frisch
 * (mehrere App-Instanzen) und schreibt nur, wenn sich etwas geändert hat.
 * Ohne Geräte (Liste nicht ladbar/leer) wird nichts geschrieben — sonst entstünde ein
 * falscher 0-€-Punkt.
 */
export async function aktualisiereKostenPunkt(von: string, jetzt = new Date()): Promise<KostenPunkt | null> {
  const devices = await loadDevices()
  if (!devices.length) return null
  const k = berechneKosten(devices)
  const { woche, montag } = isoWoche(jetzt)
  // netReadJson liefert bei Lesefehlern ebenfalls null → nur bei wirklich fehlender Datei neu
  // anfangen, sonst nie schreiben (der bisherige Verlauf wäre weg).
  let datei: VerlaufDatei | null = null
  try { datei = await api().netReadJson<VerlaufDatei>(DATEI) } catch { return null }
  if (!datei) {
    let da = true
    try { da = await api().netExists(DATEI) } catch { return null }
    if (da) return null
  } else if (!Array.isArray(datei.punkte)) return null
  const punkte = datei ? [...datei.punkte] : []
  const i = punkte.findIndex(p => p.woche === woche)
  const alt = i >= 0 ? punkte[i] : null
  if (alt && alt.monatlich === k.monatlich && alt.geraete === k.geraete && alt.geraeteGesamt === k.geraeteGesamt) return alt
  const neu: KostenPunkt = { woche, montag, ...k, aktualisiertAm: jetzt.toISOString(), von }
  if (i >= 0) punkte[i] = neu; else punkte.push(neu)
  punkte.sort((a, b) => a.woche.localeCompare(b.woche))
  const ok = await api().netWriteJson(DATEI, { version: 1, punkte } satisfies VerlaufDatei)
  return ok ? neu : null
}
