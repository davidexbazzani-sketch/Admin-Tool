// ── Automatische Mails: zuerst über die Mail-PCs, der Automatik-PC zuletzt ─────
// Nutzerwunsch 27.11.2026: „die automatischen Outlook-Meldungen sollen nicht bevorzugt von meinem PC
// ausgehen – mein PC nur als letzte Wahl, erst Timos oder Tims PC, wenn die online sind.“
//
// • Die Reihenfolge der Mail-PCs steht in automatik/mail-pcs.json (Einstellungen → Für alle →
//   Automatik & Scans → „Mail-PCs“). Der Automatik-PC selbst ist immer die letzte Wahl.
// • Jeder PC aus der Liste schreibt bei offenem Tool jede Minute ein Lebenszeichen
//   (automatik/mailpc/<PC>.json). Älter als 3 min = nicht online.
// • Scans und Prüfungen laufen weiter NUR auf dem Automatik-PC (Regel „ein PC“). Will er eine Mail
//   verschicken, legt er sie in den Postausgang (automatik/postausgang/<id>.json), sobald ein Mail-PC
//   online ist; der erste online Mail-PC verschickt sie über SEIN Outlook (Absender = sein Postfach).
// • Ist keiner online, verschickt der Automatik-PC selbst – wie bisher. Bleibt eine Mail im Postausgang
//   liegen (Mail-PC ging aus, Outlook-Fehler), übernimmt nach 4 min der Automatik-PC.
// • Doppelversand-Schutz: wer sendet, legt vorher exklusiv <id>.claim an. Anhänge (lokaler Pfad) und
//   Zugangsdaten gehen nie in den Postausgang – solche Mails verschickt der Automatik-PC selbst.

import { api } from '../electronAPI'
import { protokolliere } from './aktivitaet'
import { eigenerRechner, eigenesKonto, kontoOhneDomaene, rechnerKurz } from './serverMelder'

export const MAILPC_PFAD = 'automatik/mail-pcs.json'
export const MAILPC_HERZ_ORDNER = 'automatik/mailpc'
export const POSTAUSGANG = 'automatik/postausgang'
export const MAILPC_HERZ_MS = 60_000
/** Ohne Lebenszeichen seit so langer Zeit gilt ein Mail-PC als nicht online. */
export const MAILPC_AUS_NACH_MS = 3 * 60_000
/** Liegt eine Mail so lange unberührt im Postausgang, verschickt der Automatik-PC sie selbst. */
export const UEBERNAHME_NACH_MS = 4 * 60_000
/** Ein Versuch, der so lange „läuft“, gilt als abgebrochen (PC aus während des Sendens). */
export const CLAIM_VERWAIST_MS = 10 * 60_000
/** Älter → verwerfen (wäre nur noch verwirrend). */
export const POSTAUSGANG_MAX_MS = 24 * 3600_000
/** Pro Durchgang höchstens so viele Mails (Leistungsregel: Bulk in 10ern). */
export const JE_DURCHGANG = 10

export interface MailPcListe { version: 1; reihenfolge: string[]; geaendertAm?: string; geaendertVon?: string }
export interface MailPcHerz { rechner: string; konto?: string; benutzer?: string; at: string }
export interface PostausgangMail {
  id: string
  angelegtAm: string
  angelegtVon: string
  /** Mail-PC, der beim Anlegen zuständig war (nur Anzeige) */
  fuer: string
  mail: { to: string; cc?: string; subject: string; body: string; html?: boolean; protokoll?: { art: 'automatisch' | 'manuell'; quelle: string } }
  fehlschlaege?: { rechner: string; am: string; fehler: string }[]
}
export interface Claim { rechner: string; am: string }

type MailOpts = Parameters<Window['electronAPI']['sendEmailRaw']>[0] & { attachmentPath?: string }
export type MailErgebnis = { success: boolean; error?: string; method?: string; uebergeben?: string }

const kurz = rechnerKurz

// ── reine Funktionen (testbar) ─────────────────────────────────────────────

export function bereinigeListe(l: Partial<MailPcListe> | null | undefined): MailPcListe {
  const roh = Array.isArray(l?.reihenfolge) ? l!.reihenfolge : []
  const reihenfolge = [...new Set(roh.map(r => kurz(String(r || ''))).filter(r => /^[A-Z0-9][A-Z0-9-]{1,14}$/.test(r)))].slice(0, 8)
  return { version: 1, reihenfolge, geaendertAm: l?.geaendertAm, geaendertVon: l?.geaendertVon }
}

export function herzAktiv(h: MailPcHerz | null | undefined, jetzt = Date.now()): boolean {
  const t = Date.parse(h?.at || '')
  if (isNaN(t)) return false
  return jetzt - t < MAILPC_AUS_NACH_MS && t - jetzt < MAILPC_AUS_NACH_MS
}

/** Erster Mail-PC der Reihenfolge, der online ist (ohne die ausgeschlossenen). null = keiner. */
export function waehleMailPc(reihenfolge: string[], herzen: Map<string, MailPcHerz>, jetzt = Date.now(), ohne: string[] = []): string | null {
  for (const pc of reihenfolge) {
    if (ohne.includes(pc)) continue
    if (herzAktiv(herzen.get(pc), jetzt)) return pc
  }
  return null
}

/**
 * Wer verschickt eine Mail aus dem Postausgang?
 * - 'ich': dieser PC soll sie jetzt verschicken
 * - 'andere': ein anderer ist dran (oder schickt gerade)
 */
export function zustaendig(o: {
  mail: PostausgangMail; claim: Claim | null; reihenfolge: string[]; herzen: Map<string, MailPcHerz>; ich: string; binAutomatik: boolean; jetzt?: number
}): 'ich' | 'andere' {
  const jetzt = o.jetzt ?? Date.now()
  const c = o.claim ? Date.parse(o.claim.am) : NaN
  if (o.claim && !isNaN(c) && jetzt - c < CLAIM_VERWAIST_MS) return 'andere'
  const ohne = [...new Set((o.mail.fehlschlaege || []).map(f => f.rechner))]
  const pc = waehleMailPc(o.reihenfolge, o.herzen, jetzt, ohne)
  if (pc && pc === o.ich) return 'ich'
  const alter = jetzt - Date.parse(o.mail.angelegtAm)
  // letzte Wahl: der Automatik-PC — wenn kein Mail-PC online ist oder die Mail schon zu lange liegt
  if (o.binAutomatik && (!pc || !(alter < UEBERNAHME_NACH_MS))) return 'ich'
  return 'andere'
}

/** Nur das, was ein anderer PC zum Senden braucht — nie Zugangsdaten. */
export function fuerPostausgang(o: MailOpts): PostausgangMail['mail'] {
  return { to: o.to, cc: o.cc || undefined, subject: o.subject, body: o.body, html: o.html || undefined, protokoll: o.protokoll }
}

// ── Laufzeit ────────────────────────────────────────────────────────────────

let liste: MailPcListe = { version: 1, reihenfolge: [] }
export const listeSofort = (): MailPcListe => liste

export async function ladeListe(): Promise<MailPcListe> {
  try { liste = bereinigeListe(await api().netReadJsonAsync<MailPcListe>(MAILPC_PFAD)) } catch { /* letzter Stand bleibt */ }
  return liste
}

export async function speichereListe(reihenfolge: string[], von: string): Promise<boolean> {
  const neu = bereinigeListe({ reihenfolge, geaendertAm: new Date().toISOString(), geaendertVon: von })
  try {
    const ok = !!(await api().netWriteJsonAsync(MAILPC_PFAD, neu))
    if (ok) liste = neu
    return ok
  } catch { return false }
}

export async function ladeHerzen(reihenfolge: string[]): Promise<Map<string, MailPcHerz>> {
  const m = new Map<string, MailPcHerz>()
  await Promise.all(reihenfolge.map(async pc => {
    try {
      const h = await api().netReadJsonAsync<MailPcHerz>(`${MAILPC_HERZ_ORDNER}/${pc}.json`)
      if (h && typeof h.at === 'string') m.set(pc, h)
    } catch { /* nicht da = nicht online */ }
  }))
  return m
}

/** Welcher PC verschickt automatische Mails gerade? (Anzeige) — null = der Automatik-PC selbst. */
export async function aktuellerMailPc(): Promise<{ pc: string | null; herzen: Map<string, MailPcHerz>; liste: MailPcListe }> {
  const l = await ladeListe()
  const herzen = await ladeHerzen(l.reihenfolge)
  return { pc: waehleMailPc(l.reihenfolge, herzen), herzen, liste: l }
}

const neueId = () => `pm_${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`

/**
 * Automatische Mail verschicken — für ALLE automatischen Meldungen (Server, PC-Überwachung, Austritte,
 * Lizenzen, Passwort-Erinnerungen, Geplante Aufgaben). Ist ein Mail-PC online, geht die Mail über den
 * Postausgang an ihn; sonst (oder im Zweifel) verschickt dieser PC selbst.
 * success = verschickt ODER sicher im Postausgang abgelegt.
 */
export async function automatischeMail(o: MailOpts): Promise<MailErgebnis> {
  const selbst = () => api().sendEmailRaw(o)
  if (o.attachmentPath) return selbst()
  try {
    const l = await ladeListe()
    if (!l.reihenfolge.length) return selbst()
    const ich = kurz(await eigenerRechner())
    const pc = waehleMailPc(l.reihenfolge, await ladeHerzen(l.reihenfolge))
    if (!pc || pc === ich) return selbst()
    const m: PostausgangMail = { id: neueId(), angelegtAm: new Date().toISOString(), angelegtVon: ich, fuer: pc, mail: fuerPostausgang(o) }
    const r = await api().netCreateExclusiveAsync(`${POSTAUSGANG}/${m.id}.json`, m)
    if (r !== 'ok') return selbst()   // im Zweifel lieber selbst senden als eine Meldung verlieren
    protokolliere({
      art: o.protokoll?.art || 'automatisch', quelle: o.protokoll?.quelle || 'Automatische Mail',
      aktion: `Mail an Mail-PC ${pc} übergeben (Postausgang)`, ziel: [o.to, o.cc && `CC ${o.cc}`].filter(Boolean).join(' · ').slice(0, 300),
      details: [`Betreff: ${(o.subject || '').slice(0, 200)}`],
    })
    return { success: true, method: 'mail-pc', uebergeben: pc }
  } catch { return selbst() }
}

// ── Mail-PC: Lebenszeichen + Postausgang abarbeiten ─────────────────────────

async function lies<T>(pfad: string): Promise<T | null> {
  try { return (await api().netReadJsonAsync<T>(pfad)) ?? null } catch { return null }
}

/** Lebenszeichen schreiben — nur wenn dieser PC in der Liste steht. `weg` = beim Schließen sofort freigeben. */
export async function schreibeHerz(benutzer: string, weg = false): Promise<boolean> {
  const [r, k] = await Promise.all([eigenerRechner(), eigenesKonto()])
  const ich = kurz(r)
  if (!ich || !liste.reihenfolge.includes(ich)) return false
  const h: MailPcHerz = { rechner: ich, konto: kontoOhneDomaene(k) || undefined, benutzer: benutzer || undefined, at: weg ? new Date(0).toISOString() : new Date().toISOString() }
  try { return !!(await api().netWriteJsonAsync(`${MAILPC_HERZ_ORDNER}/${ich}.json`, h)) } catch { return false }
}

let durchgang: Promise<{ gesendet: number; fehler: number }> | null = null
/**
 * Postausgang abarbeiten. Läuft auf den Mail-PCs der Liste und (als letzte Wahl) auf dem Automatik-PC.
 * `binAutomatik` liefert frisch, ob dieser PC gerade Automatik-PC ist.
 */
export function bearbeitePostausgang(binAutomatik: () => Promise<boolean>): Promise<{ gesendet: number; fehler: number }> {
  if (durchgang) return durchgang
  durchgang = (async () => {
    let gesendet = 0, fehler = 0
    try {
      const l = await ladeListe()
      const ich = kurz(await eigenerRechner())
      const automatik = await binAutomatik()
      if (!ich || (!l.reihenfolge.includes(ich) && !automatik)) return { gesendet, fehler }
      let namen: string[] = []
      try { namen = (await api().netListDirAsync(POSTAUSGANG)) || [] } catch { return { gesendet, fehler } }
      const mails = namen.filter(n => /^pm_[\w-]+\.json$/.test(n)).sort().slice(0, JE_DURCHGANG * 3)
      if (!mails.length) return { gesendet, fehler }
      const herzen = await ladeHerzen(l.reihenfolge)
      let versucht = 0
      for (const datei of mails) {
        if (versucht >= JE_DURCHGANG) break
        const id = datei.replace(/\.json$/, '')
        const m = await lies<PostausgangMail>(`${POSTAUSGANG}/${datei}`)
        if (!m?.mail?.to) continue
        const jetzt = Date.now()
        if (jetzt - Date.parse(m.angelegtAm) > POSTAUSGANG_MAX_MS) {
          if (automatik) {
            await api().netDeleteFileAsync(`${POSTAUSGANG}/${datei}`).catch(() => false)
            protokolliere({ art: 'automatisch', quelle: m.mail.protokoll?.quelle || 'Automatische Mail', aktion: 'Mail aus dem Postausgang verworfen (älter als 24 h, nie verschickt)', ziel: m.mail.to, details: [`Betreff: ${m.mail.subject.slice(0, 200)}`] })
          }
          continue
        }
        const claimPfad = `${POSTAUSGANG}/${id}.claim`
        const claim = await lies<Claim>(claimPfad)
        if (zustaendig({ mail: m, claim, reihenfolge: l.reihenfolge, herzen, ich, binAutomatik: automatik, jetzt }) !== 'ich') continue
        // verwaister Versuch (PC ging beim Senden aus): Claim weg, der PC gilt für diese Mail als gescheitert
        if (claim) {
          m.fehlschlaege = [...(m.fehlschlaege || []), { rechner: kurz(claim.rechner), am: new Date().toISOString(), fehler: 'Versand abgebrochen (PC ging aus?)' }]
          await api().netWriteJsonAsync(`${POSTAUSGANG}/${datei}`, m).catch(() => false)
          await api().netDeleteFileAsync(claimPfad).catch(() => false)
        }
        if ((await api().netCreateExclusiveAsync(claimPfad, { rechner: ich, am: new Date().toISOString() } satisfies Claim).catch(() => 'fehler')) !== 'ok') continue
        versucht++
        let r: { success: boolean; error?: string } = { success: false }
        try { r = await api().sendEmailRaw({ ...m.mail, smtp: '', port: 587 }) } catch (e) { r = { success: false, error: e instanceof Error ? e.message : String(e) } }
        if (r.success) {
          gesendet++
          await api().netDeleteFileAsync(`${POSTAUSGANG}/${datei}`).catch(() => false)
          await api().netDeleteFileAsync(claimPfad).catch(() => false)
        } else {
          fehler++
          m.fehlschlaege = [...(m.fehlschlaege || []), { rechner: ich, am: new Date().toISOString(), fehler: (r.error || 'unbekannt').slice(0, 300) }]
          await api().netWriteJsonAsync(`${POSTAUSGANG}/${datei}`, m).catch(() => false)
          await api().netDeleteFileAsync(claimPfad).catch(() => false)
        }
      }
    } catch { /* nächster Durchgang */ }
    return { gesendet, fehler }
  })().finally(() => { durchgang = null })
  return durchgang
}

/** Nur für Tests. */
export function _mailPcZuruecksetzen(): void { liste = { version: 1, reihenfolge: [] }; durchgang = null }
