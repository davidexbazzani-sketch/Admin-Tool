// ── Automatik-PC: genau EIN PC führt alle automatischen Scans aus ────────────
// Nutzerwunsch 17.11.2026: „jede Art von automatischem Scan immer nur von einem PC, bevorzugt
// BQ8069 — nur wenn dieser PC aus ist, ein anderer, aber immer nur einer; niemals den gleichen
// Scan von mehreren PCs.“
//
// Vorher hatte jeder Scan nur seinen eigenen Claim: WER ihn machte, war Zufall — und war BQ8069
// aus, durfte jeder andere PC jeden Scan holen (verschiedene Scans auf verschiedenen PCs; bei
// gleichzeitigem Start teils doppelt, weil die meisten Claims sofort gegenlasen).
//
// Jetzt gibt es EINEN Automatik-PC (Datei automatik/leiter.json mit Lebenszeichen alle 60 s):
//   • BQ8069 (Windows-Konto des Nutzers, PC DE5CG4453Q1N) ist es immer, sobald dort das Tool mit
//     Admin-Anmeldung läuft — er übernimmt sofort, auch von einer Vertretung.
//   • Ist BQ8069 aus (kein Lebenszeichen seit 3 min), übernimmt GENAU EIN anderer Admin-PC: Claim
//     schreiben → kurz warten → gegenlesen → nach 10 s noch einmal gegenlesen. Erst dann zählt er.
//   • Die Vertretung bleibt, solange ihr Tool offen ist (kein Hin- und Herspringen) — bis BQ8069
//     zurückkommt. Beim Schließen gibt sie sofort frei.
//   • Jeder automatische Scan fragt VOR dem Start `darfAutomatik()` — das liest die Datei frisch,
//     damit eine Übernahme durch BQ8069 sofort greift.
// Nicht betroffen (bewusst je PC): Popups/Erinnerungen des angemeldeten Benutzers, Chat, Spiele,
// eigener Outlook-Kalender, Bildschirme, die gerade offen sind (Live-Ansichten).

import { api } from '../electronAPI'
import { istBevorzugt, eigenerRechner, eigenesKonto, BEVORZUGTER_MELDER } from './serverMelder'

export const LEITER_PFAD = 'automatik/leiter.json'
export const LEITER_HERZ_MS = 60_000
/** Ohne Lebenszeichen seit so langer Zeit gilt der Automatik-PC als aus. */
export const LEITER_AUS_NACH_MS = 3 * 60_000
/** Vertretung: zweite Gegenprobe nach so langer Zeit (zwei PCs, die gleichzeitig übernehmen wollten). */
export const LEITER_BESTAETIGUNG_MS = 10_000

export interface Leiter {
  token: string
  rechner: string
  konto?: string
  benutzer?: string
  /** ist das BQ8069 (bevorzugter PC)? */
  bevorzugt: boolean
  /** Lebenszeichen (ISO) */
  at: string
  /** seit wann dieser PC Automatik-PC ist */
  seit: string
}

// ── reine Funktionen (testbar) ─────────────────────────────────────────────

export function leiterAktiv(l: Leiter | null | undefined, jetzt = Date.now()): boolean {
  if (!l?.token) return false
  const t = Date.parse(l.at || '')
  if (isNaN(t)) return false
  // Uhrversatz bis 3 min in die Zukunft tolerieren
  return jetzt - t < LEITER_AUS_NACH_MS && t - jetzt < LEITER_AUS_NACH_MS
}

export type Entscheidung = 'leiter' | 'uebernehmen' | 'nicht'
/**
 * Was soll DIESES Fenster tun?
 * - leiter: ist schon Automatik-PC (Lebenszeichen schreiben)
 * - uebernehmen: Automatik-PC werden (Claim + Gegenprobe)
 * - nicht: ein anderer ist Automatik-PC
 */
export function entscheide(o: { token: string; bevorzugt: boolean; leiter: Leiter | null | undefined; jetzt?: number }): Entscheidung {
  const jetzt = o.jetzt ?? Date.now()
  const l = o.leiter
  if (l?.token && l.token === o.token) return 'leiter'
  const aktiv = leiterAktiv(l, jetzt)
  if (!aktiv) return 'uebernehmen'
  // BQ8069 übernimmt sofort von einer Vertretung — aber nicht von einem anderen BQ8069-Fenster
  // (z. B. zweite Sitzung), sonst würden sich zwei bevorzugte Fenster ständig abwechseln.
  if (o.bevorzugt && !l!.bevorzugt) return 'uebernehmen'
  return 'nicht'
}

const kurz = (r?: string) => (r || '').trim().toUpperCase().split('.')[0]
const kontoKurz = (k?: string) => ((k || '').trim().toUpperCase().split('\\').pop() || '').split('@')[0]

/** Anzeige „Automatik-PC: …“ (Server-Bildschirm u. a.). */
export function leiterText(l: Leiter | null | undefined, jetzt = Date.now()): { aktiv: boolean; bevorzugt: boolean; text: string; titel: string } {
  const titel = [
    'Alle automatischen Scans (Server-Prüfungen, Geräte-, Netzwerk-, Drucker-, Software-Scans, Mails …) laufen auf GENAU EINEM PC:',
    `• bevorzugt ${BEVORZUGTER_MELDER} — sobald dort das Tool läuft, übernimmt er sofort`,
    `• ist ${BEVORZUGTER_MELDER} aus, übernimmt genau EIN anderer Admin-PC mit offenem Tool (bis ${BEVORZUGTER_MELDER} zurück ist)`,
    'Nie derselbe Scan von mehreren PCs.',
  ].join('\n')
  if (!leiterAktiv(l, jetzt)) return { aktiv: false, bevorzugt: false, text: `Automatik-PC: keiner aktiv – ${BEVORZUGTER_MELDER} aus, kein Admin-Tool offen`, titel }
  const wer = l!.bevorzugt ? `${BEVORZUGTER_MELDER}${kurz(l!.rechner) && kurz(l!.rechner) !== BEVORZUGTER_MELDER ? ` (${kurz(l!.rechner)})` : ''}`
    : `${kurz(l!.rechner) || 'unbekannt'}${l!.konto ? ` (${kontoKurz(l!.konto)})` : ''}`
  return {
    aktiv: true, bevorzugt: !!l!.bevorzugt,
    text: l!.bevorzugt ? `Automatik-PC: ${wer}` : `Automatik-PC: ${wer} – Vertretung, ${BEVORZUGTER_MELDER} ist aus`,
    titel,
  }
}

// ── Laufzeit ────────────────────────────────────────────────────────────────

/** Kennung dieses Fensters (ein Tool je Windows-Sitzung, siehe Einzelinstanz in electron/main.ts). */
const TOKEN = `al#${Math.random().toString(36).slice(2, 10)}`
let teilnehmen = false
let benutzerFn: () => string = () => ''
let warteFn = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
let letzteEntscheidung: { ich: boolean; leiter: Leiter | null; am: number } = { ich: false, leiter: null, am: 0 }

export async function ladeLeiter(): Promise<Leiter | null> {
  try {
    const l = await api().netReadJsonAsync<Leiter>(LEITER_PFAD)
    return l && typeof l === 'object' && typeof l.token === 'string' && l.token ? l : null
  } catch { return null }
}
async function schreibe(l: Leiter): Promise<boolean> {
  try { return !!(await api().netWriteJsonAsync(LEITER_PFAD, l)) } catch { return false }
}

async function ich(): Promise<{ rechner: string; konto: string; bevorzugt: boolean }> {
  const [rechner, konto] = await Promise.all([eigenerRechner(), eigenesKonto()])
  return { rechner, konto, bevorzugt: istBevorzugt(rechner, konto) }
}

let pruefLauf: Promise<boolean> | null = null
/**
 * Einmal entscheiden (und ggf. Lebenszeichen schreiben bzw. übernehmen). Läuft nie doppelt.
 * Rückgabe: ist DIESES Fenster jetzt der Automatik-PC?
 */
export function pruefeLeiter(): Promise<boolean> {
  if (!teilnehmen) return Promise.resolve(false)
  if (pruefLauf) return pruefLauf
  pruefLauf = (async () => {
    try {
      const me = await ich()
      const l = await ladeLeiter()
      const e = entscheide({ token: TOKEN, bevorzugt: me.bevorzugt, leiter: l })
      const jetzt = new Date().toISOString()
      if (e === 'nicht') { letzteEntscheidung = { ich: false, leiter: l, am: Date.now() }; return false }
      if (e === 'leiter') {
        const neu: Leiter = { ...l!, at: jetzt, benutzer: benutzerFn() || l!.benutzer }
        await schreibe(neu)
        letzteEntscheidung = { ich: true, leiter: neu, am: Date.now() }
        return true
      }
      // übernehmen: Claim → Zufallspause → Gegenprobe (→ Vertretung: nach 10 s noch einmal)
      const claim: Leiter = { token: TOKEN, rechner: me.rechner || 'unbekannt', konto: me.konto || undefined, benutzer: benutzerFn() || undefined, bevorzugt: me.bevorzugt, at: jetzt, seit: jetzt }
      if (!(await schreibe(claim))) { letzteEntscheidung = { ich: false, leiter: l, am: Date.now() }; return false }
      await warteFn(1500 + Math.floor(Math.random() * 1500))
      let da = await ladeLeiter()
      if (da?.token === TOKEN && !me.bevorzugt) {
        await warteFn(LEITER_BESTAETIGUNG_MS)
        da = await ladeLeiter()
      }
      const ok = da?.token === TOKEN
      letzteEntscheidung = { ich: ok, leiter: da, am: Date.now() }
      return ok
    } catch {
      letzteEntscheidung = { ich: false, leiter: letzteEntscheidung.leiter, am: Date.now() }
      return false
    } finally {
      pruefLauf = null
    }
  })()
  return pruefLauf
}

/**
 * Darf DIESER PC jetzt einen automatischen Scan starten? Liest die Datei frisch: nur wenn sie
 * (noch) dieses Fenster nennt. Wer nicht am Verfahren teilnimmt (kein Admin), darf nie.
 */
export async function darfAutomatik(): Promise<boolean> {
  if (!teilnehmen) return false
  // Noch nie entschieden (gerade gestartet)? → jetzt entscheiden
  if (!letzteEntscheidung.am) return pruefeLeiter()
  const l = await ladeLeiter()
  const ok = !!l && l.token === TOKEN && leiterAktiv(l)
  if (!ok && letzteEntscheidung.ich) letzteEntscheidung = { ich: false, leiter: l, am: Date.now() }
  return ok
}

/** Letzter bekannter Stand (sofort, ohne Netzlaufwerk) — für Anzeigen. */
export const leiterSofort = () => letzteEntscheidung
/** Ist dieses Fenster der Automatik-PC (letzter bekannter Stand)? */
export const binAutomatikPc = () => teilnehmen && letzteEntscheidung.ich

/**
 * Am Verfahren teilnehmen (nur Admins): sofort entscheiden, dann alle 60 s Lebenszeichen bzw.
 * erneut prüfen. Rückgabe: Stop — gibt den Automatik-PC sofort frei (andere übernehmen dann).
 */
export function starteAutomatikLeiter(o: { benutzer: () => string; warte?: (ms: number) => Promise<void>; herzMs?: number }): () => void {
  teilnehmen = true
  benutzerFn = o.benutzer
  if (o.warte) warteFn = o.warte
  void pruefeLeiter()
  const t = setInterval(() => { void pruefeLeiter() }, o.herzMs ?? LEITER_HERZ_MS)
  return () => {
    clearInterval(t)
    const war = letzteEntscheidung.ich
    teilnehmen = false
    letzteEntscheidung = { ich: false, leiter: null, am: 0 }
    if (war) {
      // freigeben: Lebenszeichen auf „lange her“ → der nächste Admin-PC übernimmt beim nächsten Takt
      void ladeLeiter().then(l => { if (l?.token === TOKEN) void schreibe({ ...l, at: new Date(0).toISOString() }) })
    }
  }
}

/** Nur für Tests: Zustand zurücksetzen. */
export function _leiterZuruecksetzen(): void {
  teilnehmen = false; benutzerFn = () => ''; letzteEntscheidung = { ich: false, leiter: null, am: 0 }; pruefLauf = null
  warteFn = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
}
export const _leiterToken = () => TOKEN
