// ── Toner-Warnung: fast leere Patronen melden ────────────────────────────────
// Fällt eine Patrone unter 4 % (Anzeige ≤ 3 %), entsteht eine „Warnung":
//   • jeder Tool-Nutzer bekommt oben rechts ein Popup, das bleibt, bis ER es bestätigt
//   • alle Tool-Nutzer bekommen im Chat eine Nachricht vom Absender „Druckerhure"
//   • ins Drucker-Dossier wird ein Eintrag geschrieben
// Steigt der Füllstand wieder über 10 % (Patrone getauscht), ist die Warnung erledigt; fällt
// er später erneut, ist das eine NEUE Warnung (neue ID → neues Popup, neue Chat-Nachricht).
//
// Die Messwerte liefert der gedrosselte Drucker-Scan in services/druckerFlotte.ts (nur
// außerhalb der Arbeitszeit automatisch) bzw. ein Einzel-Scan im Drucker-Dossier.
//
// Ablage (Tool-Netzordner):
//   printer-dossiers/toner/warnungen.json          gemeinsamer Stand aller Warnungen
//   printer-dossiers/toner/bestaetigt/<user>.json  welche Warnungen DIESER Nutzer gelesen hat
//                                                  (je Nutzer eine Datei → keine Schreibkonflikte)
// Alles über die asynchronen net*Async-Aufrufe, damit das Tool nicht hakt.

import { api } from '../electronAPI'
import { logPrinterAction } from './printerDossier'
import { ladeNutzer, sende, sicher } from './chat'

export const TONER_ORDNER = 'printer-dossiers/toner'
const DATEI = `${TONER_ORDNER}/warnungen.json`
const bestaetigtDatei = (u: string) => `${TONER_ORDNER}/bestaetigt/${sicher(u)}.json`

/** Warnen ab: Füllstand unter 4 % — die Drucker zeigen dann 3 % oder weniger. */
export const WARN_UNTER_PROZENT = 4
/** Erledigt ab: über 10 % (neue Patrone) — dazwischen bleibt eine Warnung stehen (kein Flattern). */
const ERLEDIGT_AB_PROZENT = 10
const ERLEDIGTE_BEHALTEN_TAGE = 90

/** Absender der automatischen Chat-Nachrichten. */
export const DRUCKER_BOT = { username: 'druckerhure', displayName: 'Druckerhure' }
export const istDruckerBot = (u: string | null | undefined) => !!u && sicher(u) === DRUCKER_BOT.username

export interface TonerWarnung {
  id: string               // <drucker>|<material>@<seit> — je Episode eindeutig
  key: string              // <drucker>|<material>
  drucker: string
  ip: string
  standort?: string
  material: string         // z. B. „Patrone Gelb 508A HP CF362A"
  prozent: number
  seit: string             // ISO: erstmals unter der Schwelle
  zuletzt: string          // ISO: zuletzt so gemessen
  aktiv: boolean
  erledigtAm?: string
  chatGesendet?: number    // an wie viele Nutzer
}

export interface TonerStand {
  version: 1
  /** veraltet — der Scan-Stand steht jetzt in druckerFlotte (status.json) */
  letzterScan?: { am: string; von: string; drucker: number; erreicht: number; dauerS: number }
  warnungen: TonerWarnung[]
}

/** SNMP-Bezeichnungen enden oft mit einem Nullbyte („CF360A\u0000") — weg damit. */
export function sauber(s: string): string {
  return (s || '').replace(/[\u0000-\u001f\u007f�]/g, '').replace(/\s+/g, ' ').trim()
}

/** Resttoner-/Auffangbehälter (Drucker melden hier den FREIEN Platz, nicht den Füllstand). */
export function istResttoner(name: string): boolean {
  return /auffang|waste|rest ?toner|collection|resttonerbeh/i.test(name)
}

/**
 * Zählt dieses Verbrauchsmaterial als Toner/Patrone? Fixiereinheit, Resttonerbehälter,
 * Bildtrommel, Wartungskit u. ä. melden ebenfalls Prozente, sind aber keine Patrone.
 */
export function istToner(name: string): boolean {
  const n = name.toLowerCase()
  if (istResttoner(n) || /fixier|fuser|trommel|drum|imaging|transfer|wartung|maintenance|roll|kit\b|heft|staple/.test(n)) return false
  return /toner|patrone|cartridge|kartusche|tinte|\bink\b|druckkassette/.test(n)
}

const norm = (s: string) => sauber(s).toLowerCase()
export const warnKey = (drucker: string, material: string) => `${norm(drucker)}|${norm(material)}`

// ── Gemeinsamer Stand ────────────────────────────────────────────────────────

/** null = Datei vorhanden, aber nicht lesbar → dann NIE schreiben (sonst wären alle Warnungen weg). */
export async function ladeStand(): Promise<TonerStand | null> {
  const d = await api().netReadJsonAsync<TonerStand>(DATEI).catch(() => null)
  if (d && Array.isArray(d.warnungen)) return d
  const da = await api().netListDirAsync(TONER_ORDNER).then(l => l.some(f => f.toLowerCase() === 'warnungen.json')).catch(() => true)
  return da ? null : { version: 1, warnungen: [] }
}

export async function speichereStand(s: TonerStand): Promise<boolean> {
  const grenze = Date.now() - ERLEDIGTE_BEHALTEN_TAGE * 86400_000
  s.warnungen = s.warnungen.filter(w => w.aktiv || new Date(w.erledigtAm || w.zuletzt).getTime() > grenze)
  return api().netWriteJsonAsync(DATEI, s).catch(() => false)
}

export async function ladeBestaetigt(user: string): Promise<Set<string>> {
  const d = await api().netReadJsonAsync<{ ids?: string[] }>(bestaetigtDatei(user)).catch(() => null)
  return new Set(Array.isArray(d?.ids) ? d!.ids : [])
}

/** Warnung als gelesen merken (nur in der eigenen Datei). Alte, nicht mehr aktive IDs fallen raus. */
export async function bestaetige(user: string, ids: string[], nochAktiv: string[]): Promise<boolean> {
  const alt = await ladeBestaetigt(user)
  const aktiv = new Set(nochAktiv)
  const neu = [...new Set([...alt, ...ids])].filter(id => aktiv.has(id) || ids.includes(id))
  return api().netWriteJsonAsync(bestaetigtDatei(user), { ids: neu, am: new Date().toISOString() }).catch(() => false)
}

// ── Messung einordnen ────────────────────────────────────────────────────────

export interface Messung { drucker: string; ip: string; standort?: string; material: string; prozent: number }

/**
 * Messungen EINES Druckers in den Stand einarbeiten (Stand wird verändert).
 * Liefert die neu entstandenen Warnungen (für Chat + Dossier).
 */
export function arbeiteEin(stand: TonerStand, drucker: string, messungen: Messung[], jetzt = new Date().toISOString()): TonerWarnung[] {
  const neu: TonerWarnung[] = []
  for (const m of messungen) {
    if (!istToner(m.material)) continue
    const key = warnKey(drucker, m.material)
    const offen = stand.warnungen.find(w => w.aktiv && w.key === key)
    if (m.prozent < WARN_UNTER_PROZENT) {
      if (offen) { offen.prozent = m.prozent; offen.zuletzt = jetzt; offen.ip = m.ip || offen.ip; continue }
      const w: TonerWarnung = {
        id: `${key}@${jetzt}`, key, drucker: sauber(drucker), ip: m.ip, standort: m.standort,
        material: sauber(m.material), prozent: m.prozent, seit: jetzt, zuletzt: jetzt, aktiv: true,
      }
      stand.warnungen.push(w)
      neu.push(w)
    } else if (offen && m.prozent > ERLEDIGT_AB_PROZENT) {
      offen.aktiv = false; offen.erledigtAm = jetzt; offen.prozent = m.prozent; offen.zuletzt = jetzt
    }
  }
  return neu
}

export function chatText(w: TonerWarnung): string {
  return `🖨️ ${w.drucker} benötigt folgende neue Patrone: „${w.material}" (noch ${w.prozent} %)`
    + `${w.standort ? `\nStandort: ${w.standort}` : ''}${w.ip ? `\nIP: ${w.ip}` : ''}`
}

/** Neue Warnungen an alle Tool-Nutzer melden (Chat) und im Drucker-Dossier vermerken. */
export async function melde(neu: TonerWarnung[]): Promise<void> {
  if (!neu.length) return
  const empfaenger = (await ladeNutzer().catch(() => [])).filter(n => !istDruckerBot(n.username))
  for (const w of neu) {
    let n = 0
    for (const e of empfaenger) {
      if (await sende(DRUCKER_BOT, { username: e.username, displayName: e.displayName }, chatText(w)).catch(() => null)) n++
    }
    w.chatGesendet = n
    void logPrinterAction(w.drucker, `Toner fast leer: ${w.material} — noch ${w.prozent} % (automatische Toner-Warnung, ${n} Nutzer per Chat benachrichtigt)`, 'Toner-Check', 'SNMP')
  }
}
