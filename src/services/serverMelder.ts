// ── Server-Meldungen: bevorzugter Rechner ────────────────────────────────────
// Nutzerwunsch 16.11.2026: Die automatischen Server-Meldungen (Mail bei Offline, Neustart,
// Problemen der Dienst-Prüfung, Zertifikat-Ablauf; dazu Popups/Historie) sollen IMMER
// bevorzugt von BQ8069 verschickt werden. BQ8069 ist Davides Windows-Konto (sein PC heißt
// DE5CG4453Q1N) — erkannt wird deshalb PC-Name ODER angemeldetes Konto. Nur wenn BQ8069 aus
// ist, nimmt ein anderer PC, auf dem das Tool offen ist, die Prüfungen samt Meldungen.
//
// Wie: Der Server-Controller auf BQ8069 schreibt jede Minute einen Herzschlag nach
// server_monitor/melder.json. Alle anderen Instanzen lassen die automatischen Läufe aus,
// solange dieser Herzschlag frisch ist (< 3 min). Fehlt er (PC aus, Standby, Tool zu,
// niemand bzw. kein Admin angemeldet), übernimmt wie bisher die erste Instanz, die den Lauf
// beansprucht – und gibt ihn ab, sobald BQ8069 wieder schlägt. Notfall: Schlägt BQ8069 zwar,
// prüft aber seit 15 min nicht mehr (Tool hängt), springt ebenfalls ein anderer ein.

import { api } from '../electronAPI'

export const BEVORZUGTER_MELDER = 'BQ8069'
/** PC des Nutzers (Bestätigung 17.11.2026: `hostname` → DE5CG4453Q1N, angemeldet als BQ8069). */
export const BEVORZUGTER_RECHNER = 'DE5CG4453Q1N'
export const MELDER_PFAD = 'server_monitor/melder.json'
export const HERZSCHLAG_MS = 60_000
/** Kein Herzschlag seit so langer Zeit = BQ8069 ist aus (3 verpasste Schläge). */
export const MELDER_AUS_NACH_MS = 3 * 60_000
/** BQ8069 schlägt, hat aber seit so langer Zeit keinen Ping-Lauf mehr gemacht → Vertretung. */
export const NOTFALL_UEBERNAHME_MS = 15 * 60_000

/** `konto` = angemeldetes Windows-Konto des schreibenden PCs (z. B. „bq8069“). */
export interface MelderHerzschlag { rechner: string; konto?: string; benutzer?: string; at: string }
/** Wer hat den letzten automatischen Lauf gemacht (steht in status.json). */
export interface LaufVon { rechner: string; konto?: string; benutzer?: string; at: string }

const kurz = (r?: string) => (r || '').trim().toUpperCase().split('.')[0]
/** Konto ohne Domäne: „CORP\bq8069“ bzw. „bq8069@corp…“ → „BQ8069“. */
const kontoKurz = (k?: string) => ((k || '').trim().toUpperCase().split('\\').pop() || '').split('@')[0]
/**
 * Ist das der bevorzugte Melder? BQ8069 ist das WINDOWS-KONTO des Nutzers (sein PC heißt DE5CG4453Q1N) —
 * bis 17.11.2026 wurde nur der PC-Name verglichen, dadurch galt BQ8069 immer als „aus“ und jeder PC mit
 * offenem Tool machte die automatischen Prüfungen (auch PCs ohne Zugriff auf die Server). Jetzt zählt
 * der PC-Name ODER das angemeldete Konto.
 */
export const istBevorzugt = (rechner?: string, konto?: string) =>
  kurz(rechner) === BEVORZUGTER_MELDER || kurz(rechner) === BEVORZUGTER_RECHNER || (!!konto && kontoKurz(konto) === BEVORZUGTER_MELDER)

let eigener: Promise<string> | null = null
let eigenerSync = ''
/** Name dieses PCs (groß, ohne Domäne). Leer, wenn nicht lesbar. */
export function eigenerRechner(): Promise<string> {
  if (!eigener) eigener = (async () => { try { return (eigenerSync = kurz(await api().getHostname())) } catch { return '' } })()
  return eigener
}
/** Wie eigenerRechner(), aber sofort (leer, solange noch nicht gelesen). */
export const eigenerRechnerSofort = () => eigenerSync
let konto: Promise<string> | null = null
let kontoSync = ''
/** Angemeldetes Windows-Konto dieses PCs (z. B. „bq8069“). Leer, wenn nicht lesbar. */
export function eigenesKonto(): Promise<string> {
  if (!konto) konto = (async () => { try { return (kontoSync = String(await api().getWindowsUsername() || '').trim()) } catch { return '' } })()
  return konto
}
export const eigenesKontoSofort = () => kontoSync
/** PC + Konto, z. B. „DE5CG4453Q1N (bq8069)“ — für „abgefragt von …“. */
export async function eigeneKennung(): Promise<string> {
  const [r, k] = await Promise.all([eigenerRechner(), eigenesKonto()])
  return `${r || 'unbekannter PC'}${k ? ` (${k})` : ''}`
}
/** Nur für Tests: Rechnernamen und Konto neu lesen (z. B. um BQ8069 und einen anderen PC nachzustellen). */
export function vergissRechner(): void { eigener = null; eigenerSync = ''; konto = null; kontoSync = '' }

/** Ist der Herzschlag von BQ8069 frisch? Zeit in der Zukunft (Uhrversatz) bis 3 min wird toleriert. */
export function melderAktiv(h: MelderHerzschlag | null | undefined, jetzt = Date.now()): boolean {
  if (!h || !istBevorzugt(h.rechner, h.konto)) return false
  const t = Date.parse(h.at)
  if (isNaN(t)) return false
  return jetzt - t < MELDER_AUS_NACH_MS && t - jetzt < MELDER_AUS_NACH_MS
}

/**
 * Darf DIESE Instanz die automatischen Server-Prüfungen samt Meldungen ausführen? (rein, testbar)
 * `letzterLauf` = status.pingRunAt (letzter automatischer Ping-Lauf, egal von wem).
 */
export function darfServerPruefen(o: { ich: string; konto?: string; herzschlag: MelderHerzschlag | null | undefined; letzterLauf?: string | null; jetzt?: number }): { darf: boolean; grund: string } {
  const jetzt = o.jetzt ?? Date.now()
  if (istBevorzugt(o.ich, o.konto)) return { darf: true, grund: `${BEVORZUGTER_MELDER} ist der bevorzugte Rechner für Server-Meldungen` }
  if (!melderAktiv(o.herzschlag, jetzt)) return { darf: true, grund: `${BEVORZUGTER_MELDER} ist aus – dieser PC vertritt` }
  const l = o.letzterLauf ? Date.parse(o.letzterLauf) : NaN
  if (!isNaN(l) && jetzt - l > NOTFALL_UEBERNAHME_MS) return { darf: true, grund: `${BEVORZUGTER_MELDER} ist an, prüft aber seit über ${Math.round(NOTFALL_UEBERNAHME_MS / 60_000)} min nicht – dieser PC vertritt` }
  return { darf: false, grund: `${BEVORZUGTER_MELDER} ist an und verschickt die Server-Meldungen` }
}

/**
 * Darf DIESER PC eine Server-Mail jetzt selbst verschicken? Ja auf BQ8069, sonst nur, wenn BQ8069 aus
 * ist bzw. seit 15 min nicht mehr prüft. Nein → die Mail wird vorgemerkt und BQ8069 schickt sie
 * im nächsten Lauf (sendeWartende) — betrifft v. a. „Jetzt prüfen“ von Hand auf einem anderen PC.
 */
export async function mailRechtJetzt(): Promise<boolean> {
  try {
    const [ich, k] = await Promise.all([eigenerRechner(), eigenesKonto()])
    if (istBevorzugt(ich, k)) return true
    // Seit 17.11.2026: der EINE Automatik-PC verschickt (services/automatikLeiter.ts) — andere PCs
    // merken die Mail vor, der Automatik-PC schickt sie im nächsten Lauf (sendeWartende).
    // Gibt es gerade KEINEN aktiven Automatik-PC, verschickt dieser PC selbst (sonst ginge sie verloren).
    const { darfAutomatik, ladeLeiter, leiterAktiv } = await import('./automatikLeiter')
    if (await darfAutomatik()) return true
    if (leiterAktiv(await ladeLeiter())) return false
    // BQ8069 an (Herzschlag — schreiben auch ältere Tool-Versionen)? → BQ8069 schickt
    return !melderAktiv(await ladeHerzschlag())
  } catch { return true }   // im Zweifel lieber selbst melden als eine Meldung verlieren
}

export async function ladeHerzschlag(): Promise<MelderHerzschlag | null> {
  try {
    const h = await api().netReadJsonAsync<MelderHerzschlag>(MELDER_PFAD)
    return h && typeof h === 'object' && typeof h.rechner === 'string' && typeof h.at === 'string' ? h : null
  } catch { return null }
}

/** Schreibvorgänge nacheinander — sonst könnte ein „weg“ (Abmelden) ein späteres „da“ überholen. */
let kette: Promise<void> = Promise.resolve()
/** Nur auf BQ8069: „ich bin da“ (bzw. beim Abmelden „ich bin weg“ → andere übernehmen sofort). */
export function schreibeHerzschlag(benutzer: string, weg = false): Promise<void> {
  const at = weg ? new Date(0).toISOString() : new Date().toISOString()
  kette = kette.then(async () => {
    const [ich, k] = await Promise.all([eigenerRechner(), eigenesKonto()])
    if (!istBevorzugt(ich, k)) return
    try { await api().netWriteJsonAsync(MELDER_PFAD, { rechner: ich, konto: k || undefined, benutzer, at } satisfies MelderHerzschlag) } catch { /* nächster Schlag */ }
  })
  return kette
}

/** Anzeige für den Server-Bildschirm: Wer verschickt die Meldungen gerade? */
export function melderText(h: MelderHerzschlag | null | undefined, von: LaufVon | null | undefined, jetzt = Date.now()): { aktiv: boolean; text: string; titel: string } {
  const titel = `Automatische Server-Meldungen (Mail, Popups) kommen bevorzugt von ${BEVORZUGTER_MELDER}. Ist ${BEVORZUGTER_MELDER} aus (kein Lebenszeichen seit ${Math.round(MELDER_AUS_NACH_MS / 60_000)} min), übernimmt ein anderer PC mit offenem Tool – bis ${BEVORZUGTER_MELDER} wieder da ist.`
  if (melderAktiv(h, jetzt)) return { aktiv: true, text: `Meldungen von ${BEVORZUGTER_MELDER}${h && kurz(h.rechner) !== BEVORZUGTER_MELDER ? ` (${kurz(h.rechner)})` : ''}`, titel }
  const fremd = von && !istBevorzugt(von.rechner, von.konto) && jetzt - Date.parse(von.at) < 30 * 60_000
  return {
    aktiv: false,
    text: fremd ? `${BEVORZUGTER_MELDER} aus – Meldungen von ${kurz(von!.rechner)}${von!.benutzer ? ` (${von!.benutzer})` : ''}` : `${BEVORZUGTER_MELDER} aus – Vertretung durch den nächsten offenen PC`,
    titel,
  }
}
