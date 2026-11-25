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
export const rechnerKurz = kurz
export const kontoOhneDomaene = kontoKurz

// ── Vorgabe: Welcher PC (mit welchem Windows-Konto) ist der Automatik-PC? ─────
// Seit 18.11.2026 einstellbar (Einstellungen → „Automatik-PC“, nur mit PIN). Die Vorgabe liegt auf dem
// Netzlaufwerk und gilt für ALLE; jeder Admin-PC liest sie jede Minute neu (automatikLeiter.ts).
// Solange nichts gespeichert ist, gilt der bisherige feste Wert (BQ8069 / DE5CG4453Q1N).
export interface AutomatikVorgabe { rechner: string; konto: string; geaendertAm?: string; geaendertVon?: string }
export const VORGABE_PFAD = 'automatik/vorgabe.json'
let vorgabe: AutomatikVorgabe | null = null

/** PC-Name groß ohne Domäne, Konto groß ohne Domäne; beides leer → keine Vorgabe. */
export function bereinigeVorgabe(v: Partial<AutomatikVorgabe> | null | undefined): AutomatikVorgabe | null {
  if (!v || typeof v !== 'object') return null
  const rechner = kurz(String(v.rechner || '')), konto = kontoKurz(String(v.konto || ''))
  if (!rechner && !konto) return null
  return { rechner, konto, geaendertAm: v.geaendertAm, geaendertVon: v.geaendertVon }
}
/** Gespeicherte Vorgabe (null = nichts gespeichert, es gilt der feste Standard). */
export const vorgabeSofort = (): AutomatikVorgabe | null => vorgabe
export function setzeVorgabe(v: Partial<AutomatikVorgabe> | null | undefined): void { vorgabe = bereinigeVorgabe(v) }
/** Was gerade gilt — die gespeicherte Vorgabe oder der feste Standard. */
export const wirksameVorgabe = (): { rechner: string; konto: string; standard: boolean } =>
  (vorgabe ? { rechner: vorgabe.rechner, konto: vorgabe.konto, standard: false } : { rechner: BEVORZUGTER_RECHNER, konto: BEVORZUGTER_MELDER, standard: true })
/** Name des Automatik-PCs für Texte: das Konto (wie bisher „BQ8069“), sonst der PC-Name. */
export const vorzugsName = (): string => { const w = wirksameVorgabe(); return w.konto || w.rechner }

/** Vorgabe vom Netzlaufwerk lesen und übernehmen. Datei fehlt → Standard. */
export async function ladeVorgabe(): Promise<AutomatikVorgabe | null> {
  try { setzeVorgabe(await api().netReadJsonAsync<AutomatikVorgabe>(VORGABE_PFAD)) } catch { /* Netzlaufwerk weg: letzten Stand behalten */ }
  return vorgabe
}
/** Vorgabe speichern (gilt für alle). `null` = zurück zum festen Standard. */
export async function speichereVorgabe(v: { rechner: string; konto: string } | null, von: string): Promise<boolean> {
  const neu = v ? bereinigeVorgabe({ ...v, geaendertAm: new Date().toISOString(), geaendertVon: von }) : null
  try {
    // „kein Eintrag“ wird als leere Vorgabe gespeichert (mit Stempel), damit sichtbar bleibt, wer zurückgesetzt hat
    const ok = await api().netWriteJsonAsync(VORGABE_PFAD, neu ?? { rechner: '', konto: '', geaendertAm: new Date().toISOString(), geaendertVon: von })
    if (ok) vorgabe = neu
    return !!ok
  } catch { return false }
}

/**
 * Ist das der Automatik-PC laut Vorgabe?
 * • Gespeicherte Vorgabe: PC-Name UND Konto müssen passen (ein leeres Feld zählt als „egal“).
 * • Nichts gespeichert (fester Standard): BQ8069 ist das WINDOWS-KONTO des Nutzers (sein PC heißt
 *   DE5CG4453Q1N) — bis 17.11.2026 wurde nur der PC-Name verglichen, dadurch galt BQ8069 immer als „aus“.
 *   Seitdem zählt dort der PC-Name ODER das angemeldete Konto; das bleibt so.
 */
export const istBevorzugt = (rechner?: string, konto?: string): boolean => {
  const v = vorgabe
  if (!v) return kurz(rechner) === BEVORZUGTER_MELDER || kurz(rechner) === BEVORZUGTER_RECHNER || (!!konto && kontoKurz(konto) === BEVORZUGTER_MELDER)
  const pcPasst = !v.rechner || kurz(rechner) === v.rechner
  const kontoPasst = !v.konto || (!!konto && kontoKurz(konto) === v.konto)
  return pcPasst && kontoPasst
}

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
  const n = vorzugsName()
  if (istBevorzugt(o.ich, o.konto)) return { darf: true, grund: `${n} ist der bevorzugte Rechner für Server-Meldungen` }
  if (!melderAktiv(o.herzschlag, jetzt)) return { darf: true, grund: `${n} ist aus – dieser PC vertritt` }
  const l = o.letzterLauf ? Date.parse(o.letzterLauf) : NaN
  if (!isNaN(l) && jetzt - l > NOTFALL_UEBERNAHME_MS) return { darf: true, grund: `${n} ist an, prüft aber seit über ${Math.round(NOTFALL_UEBERNAHME_MS / 60_000)} min nicht – dieser PC vertritt` }
  return { darf: false, grund: `${n} ist an und verschickt die Server-Meldungen` }
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
  const n = vorzugsName()
  const titel = `Automatische Server-Meldungen (Mail, Popups) kommen bevorzugt von ${n}. Ist ${n} aus (kein Lebenszeichen seit ${Math.round(MELDER_AUS_NACH_MS / 60_000)} min), übernimmt ein anderer PC mit offenem Tool – bis ${n} wieder da ist.`
  if (melderAktiv(h, jetzt)) return { aktiv: true, text: `Meldungen von ${n}${h && kurz(h.rechner) !== n ? ` (${kurz(h.rechner)})` : ''}`, titel }
  const fremd = von && !istBevorzugt(von.rechner, von.konto) && jetzt - Date.parse(von.at) < 30 * 60_000
  return {
    aktiv: false,
    text: fremd ? `${n} aus – Meldungen von ${kurz(von!.rechner)}${von!.benutzer ? ` (${von!.benutzer})` : ''}` : `${n} aus – Vertretung durch den nächsten offenen PC`,
    titel,
  }
}
