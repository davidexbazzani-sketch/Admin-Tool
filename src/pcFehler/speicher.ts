// ── PC-Fehler: Ablage auf dem Netzlaufwerk ───────────────────────────────────
//   pc-fehler/uebersicht.json   klein: nur PCs MIT Befund (für das Proaktive Radar)
//   pc-fehler/pcs/<HOST>.json   je PC mit Befund: Befunde + nicht zugeordnete Fehler (Detailansicht)
// Jeder Lauf liefert das vollständige Bild der letzten 7 Tage — es wird ersetzt, nicht angehäuft.
// Ist ein PC wieder fehlerfrei, verschwindet er aus der Übersicht.
// Wurde ein Befund behoben, merkt sich die Übersicht den Zeitpunkt: Alte Protokolleinträge von
// DAVOR lösen den Befund nicht erneut aus — nur, wenn der Fehler danach wieder auftritt.

import { api } from '../electronAPI'
import { leseGruppen, werteAus, laufwerkBefund, SCHWERE_RANG, type Befund } from './auswertung'
import type { FehlerGruppe } from './katalog'

const UEBERSICHT = 'pc-fehler/uebersicht.json'
const ORDNER = 'pc-fehler/pcs'
const pfad = (host: string) => `${ORDNER}/${host.toUpperCase().replace(/[^A-Z0-9._-]/g, '_')}.json`
const TAG_MS = 24 * 60 * 60 * 1000

export interface PcFehlerEintrag {
  /** Wann der PC gelesen wurde. */
  am: string
  befunde: Befund[]
  /** Anzahl nicht zugeordneter Fehlergruppen (Details in der PC-Datei). */
  unbekannt: number
}
export interface PcFehlerUebersicht {
  v: 1
  /** Letzte Aktualisierung der Übersicht. */
  stand: string
  /** So viele PCs wurden beim letzten Lauf gelesen (mit und ohne Befund). */
  gelesen?: number
  pcs: Record<string, PcFehlerEintrag>
  /** Host → Befund → wann behoben (8 Tage, dann sind die alten Protokolleinträge ohnehin aus dem 7-Tage-Fenster). */
  behoben?: Record<string, Record<string, string>>
}
export interface PcFehlerDatei { v: 1; host: string; am: string; befunde: Befund[]; unbekannt: FehlerGruppe[]; rauschen: number; unterSchwelle: number }

export async function ladeUebersicht(): Promise<PcFehlerUebersicht | null> {
  try {
    const u = await api().netReadJsonAsync<PcFehlerUebersicht>(UEBERSICHT)
    if (u && typeof u === 'object' && u.pcs && typeof u.pcs === 'object') return u
    return { v: 1, stand: '', pcs: {} }
  } catch { return null }
}

export async function ladePcFehler(host: string): Promise<PcFehlerDatei | null> {
  try { const d = await api().netReadJsonAsync<PcFehlerDatei>(pfad(host)); return d && Array.isArray(d.befunde) ? d : null } catch { return null }
}

/** Was ein Lauf über einen PC herausgefunden hat (null = PC ohne Befund → aus der Übersicht nehmen). */
export type FehlerMeldung = Record<string, PcFehlerEintrag | null>

/**
 * Antwort eines PCs auswerten und – nur wenn es Befunde gibt – die Detaildatei schreiben.
 * Liefert die Anzahl der Befunde. `vorher` = Stand der Übersicht vor diesem Lauf.
 */
export async function verarbeiteFehler(host: string, am: string, roh: { fe?: unknown; lw?: unknown }, vorher: PcFehlerUebersicht, meldung: FehlerMeldung): Promise<number> {
  const gruppen = leseGruppen(roh.fe)
  if (!gruppen) return 0   // Protokolle nicht lesbar → alten Stand stehen lassen
  const a = werteAus(gruppen)
  const lw = laufwerkBefund(roh.lw, am)
  if (lw) a.befunde.push(lw)
  // Schon behoben? Dann zählt nur, was DANACH wieder aufgetreten ist
  const behoben = vorher.behoben?.[host] || {}
  const befunde = a.befunde.filter(b => !(behoben[b.key] && b.zuletzt <= behoben[b.key])).sort((x, y) => SCHWERE_RANG[x.schwere] - SCHWERE_RANG[y.schwere] || y.anzahl - x.anzahl)
  if (!befunde.length) { if (vorher.pcs[host]) meldung[host] = null; return 0 }
  const datei: PcFehlerDatei = { v: 1, host, am, befunde, unbekannt: a.unbekannt.slice(0, 40), rauschen: a.rauschen, unterSchwelle: a.unterSchwelle }
  try { await api().netWriteJsonAsync(pfad(host), datei) } catch { /* Übersicht reicht fürs Radar */ }
  meldung[host] = { am, befunde, unbekannt: a.unbekannt.length }
  return befunde.length
}

function raeumeAuf(u: PcFehlerUebersicht): void {
  const jetzt = Date.now()
  // PCs, die seit 3 Wochen nicht mehr gelesen wurden (ausgemustert, umbenannt), fallen heraus
  for (const [h, e] of Object.entries(u.pcs)) { const t = new Date(e.am).getTime(); if (!isNaN(t) && t < jetzt - 21 * TAG_MS) delete u.pcs[h] }
  for (const [h, m] of Object.entries(u.behoben || {})) {
    for (const [k, iso] of Object.entries(m)) { const t = new Date(iso).getTime(); if (isNaN(t) || t < jetzt - 8 * TAG_MS) delete m[k] }
    if (!Object.keys(m).length) delete u.behoben![h]
  }
}

/** Übersicht frisch laden, nur die gemeldeten PCs setzen bzw. entfernen, schreiben. */
export async function merkeFehler(meldung: FehlerMeldung, gelesen?: number): Promise<void> {
  if (!Object.keys(meldung).length && gelesen == null) return
  const u = await ladeUebersicht()
  if (!u) return
  for (const [h, e] of Object.entries(meldung)) { if (e) u.pcs[h] = e; else delete u.pcs[h] }
  raeumeAuf(u)
  u.stand = new Date().toISOString()
  if (gelesen != null) u.gelesen = gelesen
  try { await api().netWriteJsonAsync(UEBERSICHT, u) } catch { /* nächster Lauf */ }
}

/** Befund wurde behoben: aus der Liste nehmen und den Zeitpunkt merken. */
export async function markiereBehoben(host: string, key: string, am = new Date().toISOString()): Promise<boolean> {
  const u = await ladeUebersicht()
  if (!u) return false
  u.behoben = u.behoben || {}
  u.behoben[host] = { ...(u.behoben[host] || {}), [key]: am }
  const e = u.pcs[host]
  if (e) { e.befunde = e.befunde.filter(b => b.key !== key); if (!e.befunde.length) delete u.pcs[host] }
  raeumeAuf(u)
  try { return await api().netWriteJsonAsync(UEBERSICHT, u) } catch { return false }
}
