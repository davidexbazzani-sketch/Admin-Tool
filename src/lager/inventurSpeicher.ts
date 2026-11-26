// „Lager einsehen“ — Mini-Inventur auf dem Netzlaufwerk. Nur asynchron. Jedes Fach wird einzeln
// gegen den frisch gelesenen Stand gespeichert und gegengelesen (zwei Leute können gleichzeitig zählen).
// Schreibt NIE, wenn eine vorhandene Datei nicht lesbar ist.

import { api } from '../electronAPI'
import { protokolliere } from '../services/aktivitaet'
import { LAGERLISTE_DATEI, type Lagerliste } from './quellen'
import { abweichungen, berechneSoll, type MiniInventurDatei, type Zaehlung } from './inventur'
import type { OrtId, RohGeraet } from './typen'

const ZEIGER = 'hardware-inventory/lager-inventur.json'
const DATEI = (id: string) => `hardware-inventory/lager-inventur/${id}.json`
const QUELLE = 'Lager einsehen · Mini-Inventur'
export const ERR_NETZ = 'Netzlaufwerk nicht erreichbar oder Datei nicht lesbar — nichts gespeichert.'

export interface Zeiger {
  version: 1
  aktiv?: { id: string; titel: string; gestartetAm: string; gestartetVon: string }
  letzte?: { id: string; titel: string; abgeschlossenAm: string; abweichungen: { ort: OrtId; text: string }[] }
  verlauf: { id: string; titel: string; gestartetAm: string; abgeschlossenAm?: string; abweichungen: number; verworfen?: boolean }[]
}

type Gelesen<T> = { ok: true; daten: T | null } | { ok: false }

async function lies<T>(pfad: string): Promise<Gelesen<T>> {
  try {
    const r = await api().netReadJsonStatusAsync(pfad)
    if (r.status === 'ok') return { ok: true, daten: r.daten as T }
    if (r.status === 'fehlt') return { ok: true, daten: null }
    return { ok: false }
  } catch { return { ok: false } }
}

async function schreib(pfad: string, d: unknown): Promise<boolean> {
  try { return await api().netWriteJsonAsync(pfad, d) } catch { return false }
}

export async function ladeZeiger(): Promise<Zeiger | null> {
  const z = await lies<Zeiger>(ZEIGER)
  if (!z.ok) return null
  return z.daten && Array.isArray(z.daten.verlauf) ? z.daten : { version: 1, verlauf: [] }
}

export async function ladeInventur(id: string): Promise<MiniInventurDatei | null> {
  const r = await lies<MiniInventurDatei>(DATEI(id))
  return r.ok && r.daten && r.daten.zaehlung ? r.daten : null
}

const neueId = () => `li_${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`

/** Liste übernehmen (wird auch die neue Lagerliste für die Ansicht) und Mini-Inventur starten. */
export async function starteInventur(zeilen: RohGeraet[], datei: string, von: string): Promise<{ ok: boolean; inventur?: MiniInventurDatei; fehler?: string }> {
  const zeiger = await ladeZeiger()
  if (!zeiger) return { ok: false, fehler: ERR_NETZ }
  if (zeiger.aktiv) return { ok: false, fehler: `Es läuft schon eine Mini-Inventur (gestartet von ${zeiger.aktiv.gestartetVon}). Bitte dort mitzählen oder sie erst abschließen.` }
  const jetzt = new Date().toISOString()
  const liste: Lagerliste = { version: 1, stand: jetzt, von, datei, zeilen }
  if (!(await schreib(LAGERLISTE_DATEI, liste))) return { ok: false, fehler: ERR_NETZ }
  const { soll, sollGeraete, ohne } = berechneSoll(zeilen)
  const id = neueId()
  const titel = `Mini-Inventur ${new Date().toLocaleDateString('de-DE')}`
  const inv: MiniInventurDatei = { version: 1, id, titel, gestartetAm: jetzt, gestartetVon: von, datei, soll, sollGeraete, ohne, zaehlung: {}, status: 'offen', verlauf: [{ am: jetzt, von, was: `gestartet mit ${datei} (${zeilen.length} Zeilen)` }] }
  let erstellt: 'ok' | 'vorhanden' | 'fehler' = 'fehler'
  try { erstellt = await api().netCreateExclusiveAsync(DATEI(id), inv) } catch { /* unten */ }
  if (erstellt !== 'ok') return { ok: false, fehler: ERR_NETZ }
  // Zeiger frisch lesen und nur „aktiv“ setzen
  const frisch = await ladeZeiger()
  if (!frisch) return { ok: false, fehler: ERR_NETZ }
  if (frisch.aktiv && frisch.aktiv.id !== id) return { ok: false, fehler: `Gerade hat ${frisch.aktiv.gestartetVon} eine Mini-Inventur gestartet — bitte dort mitzählen.` }
  frisch.aktiv = { id, titel, gestartetAm: jetzt, gestartetVon: von }
  if (!(await schreib(ZEIGER, frisch))) return { ok: false, fehler: ERR_NETZ }
  protokolliere({ art: 'manuell', quelle: QUELLE, aktion: `${titel} gestartet (${sollGeraete.length} Geräte in Fächern, ${ohne.length} ohne Fach)`, ziel: 'Lager' })
  return { ok: true, inventur: inv }
}

/** Ein Fach zählen. Liefert den frischen Stand (mit den Zählungen der anderen). */
export async function speichereZaehlung(id: string, ort: OrtId, z: Zaehlung | null): Promise<{ ok: boolean; inventur?: MiniInventurDatei; fehler?: string }> {
  for (let versuch = 0; versuch < 2; versuch++) {
    const r = await lies<MiniInventurDatei>(DATEI(id))
    if (!r.ok || !r.daten) return { ok: false, fehler: ERR_NETZ }
    const inv = r.daten
    if (inv.status !== 'offen') return { ok: false, fehler: 'Diese Mini-Inventur ist schon abgeschlossen.', inventur: inv }
    if (z) inv.zaehlung[ort] = z
    else delete inv.zaehlung[ort]
    if (!(await schreib(DATEI(id), inv))) return { ok: false, fehler: ERR_NETZ }
    // gegenlesen: hat jemand gleichzeitig geschrieben und unseren Eintrag verloren?
    const kontrolle = await ladeInventur(id)
    const angekommen = kontrolle && (z ? kontrolle.zaehlung[ort]?.am === z.am : !kontrolle.zaehlung[ort])
    if (angekommen) return { ok: true, inventur: kontrolle! }
  }
  return { ok: false, fehler: 'Gleichzeitig hat jemand anderes gespeichert — bitte noch einmal versuchen.' }
}

export async function schliesseAb(id: string, von: string, verwerfen = false): Promise<{ ok: boolean; inventur?: MiniInventurDatei; fehler?: string }> {
  const r = await lies<MiniInventurDatei>(DATEI(id))
  if (!r.ok || !r.daten) return { ok: false, fehler: ERR_NETZ }
  const inv = r.daten
  const jetzt = new Date().toISOString()
  inv.status = 'abgeschlossen'
  inv.abgeschlossenAm = jetzt
  inv.abgeschlossenVon = von
  inv.verlauf.push({ am: jetzt, von, was: verwerfen ? 'verworfen' : 'abgeschlossen' })
  if (!(await schreib(DATEI(id), inv))) return { ok: false, fehler: ERR_NETZ }
  const zeiger = await ladeZeiger()
  if (!zeiger) return { ok: false, fehler: ERR_NETZ }
  const ab = abweichungen(inv)
  if (zeiger.aktiv?.id === id) delete zeiger.aktiv
  if (!verwerfen) zeiger.letzte = { id, titel: inv.titel, abgeschlossenAm: jetzt, abweichungen: ab }
  zeiger.verlauf = [{ id, titel: inv.titel, gestartetAm: inv.gestartetAm, abgeschlossenAm: jetzt, abweichungen: ab.length, verworfen: verwerfen || undefined }, ...zeiger.verlauf.filter(v => v.id !== id)].slice(0, 100)
  if (!(await schreib(ZEIGER, zeiger))) return { ok: false, fehler: ERR_NETZ }
  protokolliere({
    art: 'manuell', quelle: QUELLE, ziel: 'Lager',
    aktion: verwerfen ? `${inv.titel} verworfen` : `${inv.titel} abgeschlossen — ${ab.length ? `${ab.length} Abweichung(en)` : 'alles stimmt'}`,
    details: ab.map(a => a.text).slice(0, 39),
  })
  return { ok: true, inventur: inv }
}

/** Abweichungen der letzten Mini-Inventur nicht mehr im Raum zeigen. */
export async function letzteAusblenden(): Promise<boolean> {
  const zeiger = await ladeZeiger()
  if (!zeiger) return false
  delete zeiger.letzte
  return schreib(ZEIGER, zeiger)
}
