// ── Übergabe-Termine (Checklisten) ────────────────────────────────────────────
// Termin je Checkliste (oder frei eingetragen) im gemeinsamen Kalender
// checklists/uebergabe-termine.json — für alle Admins sichtbar. Jede Änderung wird mit
// der Kennung des Bearbeiters protokolliert (verlauf + Notizen).
//
// Outlook (electron/outlookAktion.ts): echte Besprechungsanfrage an den Mitarbeiter,
// IT-Support als optionaler Teilnehmer (= „CC"); Verschieben/Absagen schickt ein Update.
// Postfach-Scan: Antworten der Mitarbeiter (eigenes Postfach + IT-Support-Postfach) →
// Zu-/Absage, Outlook-„Neue Zeit vorschlagen" oder Freitext („Freitag ab 10") →
// eindeutige Vorschläge werden automatisch umgetragen, der Rest als Vorschlag angezeigt.

import { api } from '../electronAPI'
import { batchAdLookup } from './adUserLookup'
import { readCentralAdUsers, buildNameIndex, lookupUserByName } from './adUserDirectory'
import { leseAntwort, ohneZitat } from './terminParser'
import { fuzzyNameMatch } from '../utils/nameMatch'
import type { Checklist } from './checklists'
import { classifyModel } from './endpointDevices'

export const TERMIN_DATEI = 'checklists/uebergabe-termine.json'
export const IT_SUPPORT_MAIL = 'support.marine@skf.com'
export const RAEUME = ['E10', 'E11']

export type TerminStatus = 'geplant' | 'zugesagt' | 'abgesagt' | 'verschoben' | 'erledigt' | 'storniert'
export type TerminArt = 'neu' | 'refresh' | 'eigener'

export interface TerminNotiz { text: string; by: string; at: string }
export interface TerminVerlauf { text: string; by: string; at: string }
export interface MailVorschlag {
  mailId: string; von: string; empfangen: string; betreff: string; auszug: string
  start?: string; ende?: string; fundstelle?: string; ankunft?: string
  quelle: 'outlook' | 'text'; art: 'vorschlag' | 'absage' | 'zusage' | 'unklar'
  erledigt?: 'uebernommen' | 'verworfen'; erledigtBy?: string; erledigtAt?: string
}

export interface UebergabeTermin {
  id: string
  checklistId?: string
  titel: string                 // z. B. „Übergabe Max Muster" oder frei
  name: string
  corpId?: string
  email?: string
  art: TerminArt
  start: string                 // lokal „YYYY-MM-DDTHH:mm"
  ende: string
  raum: string
  status: TerminStatus
  /** Outlook-Termin (Besprechungsanfrage). geoeffnet = nur im Outlook-Fenster geöffnet, Absenden nicht bestätigt. */
  outlook?: { entryId: string; globalId?: string; gesendetAt: string; gesendetBy: string; veraltet?: boolean; geoeffnet?: boolean; antwortStatus?: number }
  /** Wie die Übergabe-Nachricht rausging: als Termin oder als reine Mail, direkt gesendet oder in Outlook geöffnet. */
  nachricht?: { art: 'termin' | 'mail'; weg: 'gesendet' | 'geoeffnet'; at: string; by: string; an: string }
  ersteAnmeldung?: { at: string; by: string; raum: string; weg?: 'gesendet' | 'geoeffnet' }
  /** Genaue Ankunftszeit „HH:mm" (aus Zusage „bin um 08:30 da" oder Vorschlag „Montag um 9") — Zeitfenster bleibt. */
  ankunft?: string
  notizen: TerminNotiz[]
  verlauf: TerminVerlauf[]
  vorschlaege: MailVorschlag[]
  createdBy: string; createdAt: string
  updatedBy?: string; updatedAt?: string
}

export interface TerminStore {
  version: 1
  termine: UebergabeTermin[]
  verarbeiteteMails: string[]
  letzterScan?: { at: string; by: string; treffer: number; fehler?: string[] }
  einstellungen?: { autoUebernehmen?: boolean; postfaecher?: string[] }
}

// ── Zeit-Helfer (lokale Zeit ohne Zeitzone) ───────────────────────────────────
const p2 = (n: number) => String(n).padStart(2, '0')
export function lokal(d: Date): string { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}` }
export function ausLokal(s: string): Date { const [d, t = '00:00'] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi) }
const outlookZeit = (s: string) => s.replace('T', ' ')
const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
export function zeitraumText(start: string, ende: string, kurz = false): string {
  const a = ausLokal(start), b = ausLokal(ende)
  const datum = `${kurz ? WT[a.getDay()].slice(0, 2) + '.' : WT[a.getDay()] + ','} ${p2(a.getDate())}.${p2(a.getMonth() + 1)}.${a.getFullYear()}`
  return kurz ? `${datum} ${p2(a.getHours())}:${p2(a.getMinutes())}–${p2(b.getHours())}:${p2(b.getMinutes())}`
    : `${datum} zwischen ${p2(a.getHours())}:${p2(a.getMinutes())} und ${p2(b.getHours())}:${p2(b.getMinutes())} Uhr`
}
/** „08:30" → „kommt um 08:30 Uhr", „09:00–10:00" → „kommt zwischen 09:00 und 10:00 Uhr". */
export function ankunftText(a: string): string {
  return a.includes('–') ? `kommt zwischen ${a.replace('–', ' und ')} Uhr` : `kommt um ${a} Uhr`
}
const neueId = () => `ut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const jetzt = () => new Date().toISOString()

// ── Speicher ──────────────────────────────────────────────────────────────────
const LEER: TerminStore = { version: 1, termine: [], verarbeiteteMails: [] }

export async function ladeTermine(): Promise<TerminStore> {
  try {
    const s = await api().netReadJson<TerminStore>(TERMIN_DATEI)
    if (s && Array.isArray(s.termine)) return { ...LEER, ...s, verarbeiteteMails: s.verarbeiteteMails ?? [] }
  } catch { /* leer */ }
  return { ...LEER, termine: [] }
}

/** Frisch laden → ändern → schreiben (mehrere Admins arbeiten parallel). */
async function aendere(fn: (s: TerminStore) => TerminStore | void): Promise<TerminStore | null> {
  const s = await ladeTermine()
  const neu = fn(s) || s
  try { return (await api().netWriteJson(TERMIN_DATEI, neu)) ? neu : null } catch { return null }
}

export async function aendereTermin(id: string, by: string, patch: Partial<UebergabeTermin>, verlaufText?: string): Promise<TerminStore | null> {
  return aendere(s => {
    const t = s.termine.find(x => x.id === id); if (!t) return
    Object.assign(t, patch, { updatedBy: by, updatedAt: jetzt() })
    if (verlaufText) t.verlauf.push({ text: verlaufText, by, at: jetzt() })
  })
}

export async function neuerTermin(t: Omit<UebergabeTermin, 'id' | 'notizen' | 'verlauf' | 'vorschlaege' | 'createdAt'> & { notiz?: string }): Promise<{ store: TerminStore | null; termin: UebergabeTermin }> {
  const termin: UebergabeTermin = {
    ...t, id: neueId(), notizen: t.notiz ? [{ text: t.notiz, by: t.createdBy, at: jetzt() }] : [],
    verlauf: [{ text: `Termin angelegt: ${zeitraumText(t.start, t.ende, true)}, Raum ${t.raum}`, by: t.createdBy, at: jetzt() }],
    vorschlaege: [], createdAt: jetzt(),
  }
  delete (termin as { notiz?: string }).notiz
  const store = await aendere(s => { s.termine.push(termin) })
  return { store, termin }
}

export async function notizHinzufuegen(id: string, text: string, by: string): Promise<TerminStore | null> {
  return aendere(s => { const t = s.termine.find(x => x.id === id); if (t && text.trim()) t.notizen.push({ text: text.trim(), by, at: jetzt() }) })
}

export async function loescheTermin(id: string): Promise<TerminStore | null> {
  return aendere(s => { s.termine = s.termine.filter(x => x.id !== id) })
}

export async function speichereEinstellungen(e: TerminStore['einstellungen']): Promise<TerminStore | null> {
  return aendere(s => { s.einstellungen = { ...s.einstellungen, ...e } })
}

/** Aktueller (nicht stornierter) Termin einer Checkliste. */
export function terminVon(store: TerminStore | null, checklistId: string): UebergabeTermin | undefined {
  return [...(store?.termine ?? [])].reverse().find(t => t.checklistId === checklistId && t.status !== 'storniert')
}

// ── Empfänger ─────────────────────────────────────────────────────────────────
/** Mailadresse des Mitarbeiters: AD über Corp-ID (UPN-Fallback steckt in batchAdLookup), sonst zentrales AD-Verzeichnis per Name. */
export async function emailFuer(name: string, corpId?: string): Promise<string> {
  if (corpId?.trim()) {
    try { const r = await batchAdLookup([corpId.trim()]); const e = r.get(corpId.trim())?.email; if (e) return e } catch { /* weiter */ }
  }
  try {
    const dir = await readCentralAdUsers()
    if (dir) { const hit = lookupUserByName(buildNameIndex(dir.users), name); if (hit?.email) return hit.email }
  } catch { /* leer */ }
  return ''
}

// ── Texte ─────────────────────────────────────────────────────────────────────
function vorname(name: string): string {
  const s = (name || '').trim()
  if (s.includes(',')) return s.split(',')[1].trim().split(/\s+/)[0] || s
  return s.split(/\s+/)[0] || s
}

/** mitTermin = als Outlook-Termin (Hinweis „Neue Zeit vorschlagen"); false = reine Mail. */
export function baueEinladung(o: { name: string; art: TerminArt; start: string; ende: string; raum: string; bearbeiter: string; mitTermin?: boolean; formfaktor?: 'tower' | 'mini' | '' }): { subject: string; body: string } {
  const wann = zeitraumText(o.start, o.ende)
  const refresh = o.art === 'refresh'
  // Tower: kein Abholen — der Termin ist die einmalige Anmeldung am Gerät, danach wird er
  // am Arbeitsplatz aufgestellt. Dazu die Frage nach dem Bereich (Stabi, Welle, Abdichtung).
  if (o.formfaktor === 'tower') {
    const zeilen = [
      `Hallo ${vorname(o.name)},`,
      '',
      `dein neuer Rechner (Tower-PC) ist vorbereitet. Bevor wir ihn bei dir am Arbeitsplatz aufstellen, meldest du dich bitte einmal daran an – am ${wann} im Raum ${o.raum}. Dabei werden dein Profil und deine Programme eingerichtet, das dauert nur ein paar Minuten.`,
      '',
      'Bitte bring dein Handy (zwecks Authentifizierung) mit.',
      '',
      'Kurze Frage vorab: In welchem Bereich arbeitest du – Stabi, Welle oder Abdichtung? Eine kurze Antwort auf diese Nachricht genügt.',
      '',
      o.mitTermin === false
        ? 'Falls du es in diesem Zeitraum nicht schaffst, gib uns bitte kurz Bescheid und nenne uns einen alternativen Terminvorschlag – einfach auf diese Mail antworten.'
        : 'Falls du es in diesem Zeitraum nicht schaffst, gib uns bitte kurz Bescheid und nenne uns einen alternativen Terminvorschlag – einfach auf diese Einladung antworten oder in Outlook „Neue Zeit vorschlagen" nutzen.',
      '',
      'Viele Grüße',
      o.bearbeiter,
      'IT-Support · SKF Marine',
    ]
    return { subject: `Anmeldung an deinem neuen Rechner – ${zeitraumText(o.start, o.ende, true)} Uhr, Raum ${o.raum}`, body: zeilen.join('\n') }
  }
  const zeilen = [
    `Hallo ${vorname(o.name)},`,
    '',
    refresh
      ? `dein neuer Rechner ist bereit und ersetzt dein bisheriges Gerät. Die Übergabe findet am ${wann} im Raum ${o.raum} statt – komm einfach in diesem Zeitraum vorbei.`
      : `dein neuer Rechner ist bereit. Die Übergabe findet am ${wann} im Raum ${o.raum} statt – komm einfach in diesem Zeitraum vorbei.`,
    '',
    refresh
      ? 'Bitte bring dein bisheriges Gerät (Altgerät) sowie dein Handy (zwecks Authentifizierung) mit.'
      : 'Bitte bring dein Handy (zwecks Authentifizierung) mit.',
    '',
    o.mitTermin === false
      ? 'Falls du es in diesem Zeitraum nicht schaffst, gib uns bitte kurz Bescheid und nenne uns einen alternativen Terminvorschlag – einfach auf diese Mail antworten.'
      : 'Falls du es in diesem Zeitraum nicht schaffst, gib uns bitte kurz Bescheid und nenne uns einen alternativen Terminvorschlag – einfach auf diese Einladung antworten oder in Outlook „Neue Zeit vorschlagen" nutzen.',
    '',
    'Viele Grüße',
    o.bearbeiter,
    'IT-Support · SKF Marine',
  ]
  const kurz = zeitraumText(o.start, o.ende, true)
  return { subject: `${refresh ? 'Austausch deines Rechners' : 'Übergabe deines neuen Rechners'} – ${kurz} Uhr, Raum ${o.raum}`, body: zeilen.join('\n') }
}

/** Absage durch die IT: Termin fällt aus, wir melden uns für einen neuen Übergabetermin. */
export function baueAbsage(o: { name: string; art: TerminArt; start: string; ende: string; bearbeiter: string }): { subject: string; body: string } {
  const was = o.art === 'refresh' ? 'den Austausch deines Rechners' : o.art === 'neu' ? 'die Übergabe deines neuen Rechners' : 'den Termin'
  return {
    subject: `Abgesagt: ${o.art === 'refresh' ? 'Austausch deines Rechners' : 'Übergabe deines neuen Rechners'} – ${zeitraumText(o.start, o.ende, true)} Uhr`,
    body: [
      `Hallo ${vorname(o.name)},`,
      '',
      `leider müssen wir den Termin am ${zeitraumText(o.start, o.ende)} für ${was} absagen.`,
      '',
      'Wir kommen zeitnah auf dich zu, um einen neuen Übergabetermin zu vereinbaren. Bis dahin musst du nichts weiter tun.',
      '',
      'Entschuldige bitte die Umstände.',
      '',
      'Viele Grüße',
      o.bearbeiter,
      'IT-Support · SKF Marine',
    ].join('\n'),
  }
}

export function baueErstanmeldeMail(o: { name: string; raum: string; bearbeiter: string; wann?: string }): { subject: string; body: string } {
  return {
    subject: 'Kurz vorbeikommen: erste Anmeldung an deinem neuen Rechner',
    body: [
      `Hallo ${vorname(o.name)},`,
      '',
      'damit dein neuer Rechner schon vorab deine persönliche Software installieren kann, musst du dich einmal kurz selbst daran anmelden.',
      '',
      `Bitte komm dafür ${o.wann?.trim() ? o.wann.trim() + ' ' : ''}kurz in Raum ${o.raum} vorbei – das dauert nur wenige Minuten. Bitte bring dein Handy (zwecks Authentifizierung) mit.`,
      '',
      'Falls es dir gerade nicht passt, gib uns bitte kurz Bescheid, wann du vorbeikommen kannst.',
      '',
      'Viele Grüße',
      o.bearbeiter,
      'IT-Support · SKF Marine',
    ].join('\n'),
  }
}

// ── Outlook ───────────────────────────────────────────────────────────────────
/** anzeigen = Termin nur im Outlook-Fenster öffnen (Benutzer prüft und sendet selbst). */
export async function sendeEinladung(o: { to: string; cc: string; subject: string; body: string; start: string; ende: string; raum: string; anzeigen?: boolean }): Promise<{ ok: boolean; entryId?: string; globalId?: string; error?: string; bereitsVorhanden?: boolean }> {
  // Gibt es genau diese Einladung schon im eigenen Kalender (z. B. weil beim letzten Mal die
  // Rückmeldung von Outlook verloren ging)? Dann verknüpfen statt ein zweites Mal senden.
  const finde = async () => {
    const f = await api().outlookAktion({ aktion: 'meeting-find', subject: o.subject, start: outlookZeit(o.start) })
    return f.ok && f.gefunden ? { entryId: String(f.entryId || ''), globalId: String(f.globalId || ''), gesendet: f.gesendet !== false } : null
  }
  const vorhanden = await finde()
  if (vorhanden) {
    const ids = { entryId: vorhanden.entryId, globalId: vorhanden.globalId }
    // Nur geöffnet, nie abgeschickt (Outlook-Fenster ohne Senden geschlossen) + jetzt „Direkt senden" → diesen Entwurf senden
    if (!vorhanden.gesendet && !o.anzeigen) {
      const s = await api().outlookAktion({ aktion: 'meeting-update', entryId: vorhanden.entryId, body: o.body, location: `Raum ${o.raum}` })
      return s.ok ? { ok: true, ...ids } : { ok: false, error: String(s.error || 'Outlook-Fehler') }
    }
    return { ok: true, ...ids, bereitsVorhanden: true }
  }

  const r = await api().outlookAktion({
    aktion: 'meeting-create', anzeigen: !!o.anzeigen, subject: o.subject, body: o.body, location: `Raum ${o.raum}`,
    start: outlookZeit(o.start), end: outlookZeit(o.ende),
    required: [o.to], optional: o.cc.split(/[;,]/).map(x => x.trim()).filter(Boolean),
  })
  if (r.ok) return { ok: true, entryId: String(r.entryId || ''), globalId: String(r.globalId || '') }
  // Rückmeldung kaputt/zu spät, Outlook hat aber evtl. trotzdem gesendet → im Kalender nachsehen
  if (r.unlesbar || /zeitüberschreitung/i.test(String(r.error || ''))) {
    const wieder = await finde()
    if (wieder) return { ok: true, ...wieder }
  }
  return { ok: false, error: String(r.error || 'Outlook-Fehler') }
}

export async function aktualisiereEinladung(t: UebergabeTermin, bearbeiter: string): Promise<{ ok: boolean; error?: string }> {
  if (!t.outlook?.entryId) return { ok: false, error: 'Zu diesem Termin gibt es keine Outlook-Einladung.' }
  const txt = t.art === 'eigener' ? null : baueEinladung({ name: t.name, art: t.art, start: t.start, ende: t.ende, raum: t.raum, bearbeiter })
  const r = await api().outlookAktion({
    aktion: 'meeting-update', entryId: t.outlook.entryId, start: outlookZeit(t.start), end: outlookZeit(t.ende),
    location: `Raum ${t.raum}`, ...(txt ? { subject: txt.subject, body: txt.body } : {}),
  })
  return r.ok ? { ok: true } : { ok: false, error: String(r.error || 'Outlook-Fehler') }
}

/**
 * Absage an den Mitarbeiter: mit Outlook-Termin → Outlook-Absage (Betreff „Abgesagt: …" setzt
 * Outlook selbst) mit unserem Text; ohne Termin → Absage-Mail (CC IT-Support).
 * text = null → still absagen (nur Outlook-Termin zurückziehen, keine eigene Mail).
 */
export async function sageEinladungAb(t: UebergabeTermin, text: { subject: string; body: string } | null, cc = IT_SUPPORT_MAIL): Promise<{ ok: boolean; error?: string; weg?: 'outlook' | 'mail' | 'keiner' }> {
  if (t.outlook?.entryId) {
    const r = await api().outlookAktion({ aktion: 'meeting-cancel', entryId: t.outlook.entryId, ...(text ? { body: text.body } : {}) })
    return r.ok ? { ok: true, weg: 'outlook' } : { ok: false, error: String(r.error || 'Outlook-Fehler') }
  }
  if (text && t.email) {
    const r = await sendeMail(t.email, cc, text.subject, text.body)
    return r.ok ? { ok: true, weg: 'mail' } : { ok: false, error: r.error }
  }
  return { ok: true, weg: 'keiner' }
}

export async function sendeMail(to: string, cc: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const r = await api().sendEmailRaw({ to, cc, subject, body, smtp: '', port: 587 })
  return r.success ? { ok: true } : { ok: false, error: r.error || 'Senden fehlgeschlagen' }
}

/** Mail nur im Outlook-Fenster öffnen (Benutzer prüft und sendet selbst). */
export async function oeffneMail(to: string, cc: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const r = await api().composeEmail({ to, cc, subject, body })
  return r.success ? { ok: true } : { ok: false, error: r.fallback ? 'Outlook nicht erreichbar — es wurde ein einfaches Mailfenster (mailto) geöffnet.' : 'Outlook-Fenster konnte nicht geöffnet werden.' }
}

// ── Postfach-Scan ─────────────────────────────────────────────────────────────
interface ScanTreffer { id: string; postfach: string; von: string; vonName?: string; betreff: string; empfangen: string; klasse: number; text: string; vorschlagStart: string; vorschlagEnde: string; neueZeit?: boolean }
interface StatusTreffer {
  id: string; gefunden: boolean; start?: string; ende?: string; ort?: string; meetingStatus?: number
  antworten?: { adresse: string; name: string; typ: number; status: number }[]
}

/**
 * Wiedererkennung einer Mail über Absender + Zeit + Art + Betreff — NICHT über die EntryID:
 * Outlook verschiebt verarbeitete Besprechungsantworten nach „Gelöschte Elemente" und die
 * EntryID ändert sich dabei → sonst würde dieselbe Antwort doppelt verarbeitet.
 */
const mailSchluessel = (m: ScanTreffer) => `${m.von}|${m.empfangen}|${m.klasse}|${m.betreff}`.toLowerCase()

/** Gehört der Absender zu diesem Termin? Adresse ODER Name (Exchange liefert teils andere Adressen). */
function istPerson(t: UebergabeTermin, adresse: string, name?: string): boolean {
  if (adresse && t.email && adresse.toLowerCase() === t.email.toLowerCase()) return true
  return !!(name && t.name && fuzzyNameMatch(name, t.name))
}

const RESPONSE: Record<number, string> = { 2: 'mit Vorbehalt zugesagt', 3: 'zugesagt', 4: 'abgesagt' }

const OFFEN: TerminStatus[] = ['geplant', 'zugesagt', 'verschoben', 'abgesagt']

export async function postfachScan(by: string, tage = 21): Promise<{ ok: boolean; store?: TerminStore | null; neu: number; umgetragen: number; error?: string; hinweise?: string[] }> {
  const vorher = await ladeTermine()
  const grenze = Date.now() - 86400000
  const aktiv = vorher.termine.filter(t => OFFEN.includes(t.status) && t.email && ausLokal(t.ende).getTime() > grenze)
  if (!aktiv.length) return { ok: true, store: vorher, neu: 0, umgetragen: 0, hinweise: ['Keine offenen Termine mit Mailadresse — nichts zu prüfen.'] }
  const absender = [...new Set(aktiv.map(t => t.email!.toLowerCase()))]
  const postfaecher = vorher.einstellungen?.postfaecher ?? [IT_SUPPORT_MAIL]
  const r = await api().outlookAktion({ aktion: 'scan', tage, maxItems: 1500, absender, postfaecher }, 180000)
  if (!r.ok) return { ok: false, neu: 0, umgetragen: 0, error: String(r.error || 'Postfach konnte nicht gelesen werden') }
  const treffer = (Array.isArray(r.treffer) ? r.treffer : []) as ScanTreffer[]
  const auto = vorher.einstellungen?.autoUebernehmen !== false
  let neu = 0, umgetragen = 0

  const store = await aendere(s => {
    const bekannt = new Set(s.verarbeiteteMails)
    // älteste zuerst, damit die neueste Antwort am Ende gewinnt
    for (const m of [...treffer].sort((a, b) => a.empfangen.localeCompare(b.empfangen))) {
      // Eigene Nachrichten nie als Antwort werten (Einladung/Erstanmelde-Mail beim Test an sich
      // selbst): unsere Signatur steht im NEUEN Teil — in echten Antworten nur im Zitat.
      if (m.klasse === 53 || /IT-Support\s*[·•-]\s*SKF Marine/i.test(ohneZitat(m.text))) continue
      const key = mailSchluessel(m)
      if (bekannt.has(key) || bekannt.has(m.id)) continue
      const empfangen = ausLokal(m.empfangen.replace(' ', 'T'))
      const t = [...s.termine].reverse().find(x => OFFEN.includes(x.status) && istPerson(x, m.von, m.vonName)
        && (!x.outlook?.gesendetAt || empfangen.getTime() >= new Date(x.outlook.gesendetAt).getTime() - 60000))
      if (!t) continue          // fremde Besprechungsantwort → NICHT als verarbeitet merken (gehört evtl. später zu einem Termin)
      bekannt.add(key); s.verarbeiteteMails.push(key)
      neu++
      const auszug = m.text.replace(/\s+/g, ' ').trim().slice(0, 400)
      const basis = { mailId: m.id, von: m.von, empfangen: m.empfangen, betreff: m.betreff, auszug }
      let v: MailVorschlag
      if (m.vorschlagStart && m.vorschlagEnde) {
        v = { ...basis, quelle: 'outlook', art: 'vorschlag', start: m.vorschlagStart.replace(' ', 'T'), ende: m.vorschlagEnde.replace(' ', 'T'), fundstelle: 'Gegenvorschlag über Outlook' }
      } else if (m.neueZeit && !leseAntwort(m.text, empfangen, { start: ausLokal(t.start), ende: ausLokal(t.ende) }, m.klasse).typ.startsWith('vor')) {
        // Outlook meldet einen Gegenvorschlag, die Zeit war aber nicht lesbar und im Text steht keine:
        // NICHT als Absage werten, sondern zum Nachsehen in Outlook markieren
        v = { ...basis, quelle: 'outlook', art: 'unklar', fundstelle: 'Outlook „Neue Zeit vorgeschlagen" — Zeit nicht lesbar, bitte die Antwort in Outlook ansehen' }
        t.verlauf.push({ text: `Gegenvorschlag über Outlook erhalten (Mail vom ${m.empfangen}) — vorgeschlagene Zeit bitte in Outlook ansehen`, by: `Postfach-Scan (${by})`, at: jetzt() })
      } else {
        const a = leseAntwort(m.text, empfangen, { start: ausLokal(t.start), ende: ausLokal(t.ende) }, m.klasse)
        const scanBy = `Postfach-Scan (${by})`
        if (a.typ === 'vorschlag') {
          const tv = a.vorschlag
          v = { ...basis, quelle: 'text', art: 'vorschlag', start: lokal(tv.start), ende: lokal(tv.ende), ankunft: tv.einzelzeit ? lokal(tv.start).slice(11) : undefined,
            fundstelle: tv.fundstelle + (tv.eindeutig ? '' : ' (nicht eindeutig)') }
          if (auto && tv.eindeutig) v.erledigt = 'uebernommen'
        } else if (a.typ === 'zusage') {
          // Zusage — ggf. mit Ankunftszeit INNERHALB des Fensters („bin um 08:30 da"): Fenster bleibt, kein Outlook-Update nötig
          v = { ...basis, quelle: 'text', art: 'zusage', ankunft: a.ankunft, fundstelle: a.fundstelle, erledigt: 'uebernommen', erledigtBy: scanBy, erledigtAt: jetzt() }
          t.status = 'zugesagt'
          if (a.ankunft) t.ankunft = a.ankunft
          t.verlauf.push({ text: `Zusage erkannt${a.ankunft ? ` — ${ankunftText(a.ankunft)}` : ''} (Mail vom ${m.empfangen}${a.fundstelle ? `: „${a.fundstelle}"` : ''})`, by: scanBy, at: jetzt() })
          t.updatedBy = scanBy; t.updatedAt = jetzt()
        } else {
          v = { ...basis, quelle: 'text', art: a.typ }
          if (a.typ === 'absage') { t.status = 'abgesagt'; t.verlauf.push({ text: `Absage ohne neuen Vorschlag erkannt (Mail vom ${m.empfangen}) — bitte nachfassen`, by: scanBy, at: jetzt() }) }
        }
      }
      if (v.quelle === 'outlook' && auto) v.erledigt = 'uebernommen'
      if (v.art === 'vorschlag' && v.erledigt === 'uebernommen' && v.start && v.ende) {
        const alt = zeitraumText(t.start, t.ende, true)
        t.start = v.start; t.ende = v.ende; t.status = 'verschoben'
        t.ankunft = v.ankunft   // neue feste Uhrzeit (oder keine, bei Zeitspanne)
        if (t.outlook) t.outlook.veraltet = true
        t.verlauf.push({ text: `Automatisch umgetragen: ${alt} → ${zeitraumText(v.start, v.ende, true)}${v.ankunft ? ` (kommt um ${v.ankunft} Uhr)` : ''} (Mail von ${m.von}, ${m.empfangen}: „${v.fundstelle}")`, by: `Postfach-Scan (${by})`, at: jetzt() })
        t.updatedBy = `Postfach-Scan (${by})`; t.updatedAt = jetzt()
        v.erledigtBy = `Postfach-Scan (${by})`; v.erledigtAt = jetzt()
        umgetragen++
      }
      t.vorschlaege.push(v)
    }
    s.letzterScan = { at: jetzt(), by, treffer: neu, fehler: Array.isArray(r.fehler) ? (r.fehler as string[]) : undefined }
  })

  // ── Teil 2: Antwortstatus direkt am Outlook-Termin (Kalender des Absenders) ──
  // Klickt der Mitarbeiter nur „Zusagen" (ggf. ohne Antwort-Mail), steht das zuverlässig
  // NUR hier. Außerdem: in Outlook geänderte Zeit/Raum (z. B. Gegenvorschlag dort angenommen).
  const hinweise = [...(Array.isArray(r.fehler) ? (r.fehler as string[]) : []), ...(Array.isArray(r.info) ? (r.info as string[]) : [])]
  let ausKalender = 0
  // Nur EIGENE Einladungen: Der Termin liegt im Kalender dessen, der sie verschickt hat —
  // von einem anderen PC aus ist er nicht erreichbar (die Kollegen prüfen ihre selbst, s. TerminScanController).
  const mitTermin = (store ?? vorher).termine.filter(t => OFFEN.includes(t.status) && t.outlook?.entryId && t.outlook.gesendetBy === by && ausLokal(t.ende).getTime() > grenze)
  let endStore = store
  if (mitTermin.length) {
    const st = await api().outlookAktion({ aktion: 'status', termine: mitTermin.map(t => ({ id: t.id, entryId: t.outlook!.entryId, globalId: t.outlook!.globalId, start: outlookZeit(t.start) })) }, 120000)
    if (!st.ok) hinweise.push('Teilnehmerstatus konnte nicht gelesen werden: ' + String(st.error || 'Outlook-Fehler'))
    else {
      const ergebnisse = (Array.isArray(st.termine) ? st.termine : []) as StatusTreffer[]
      const scanBy = `Outlook-Kalender (${by})`
      endStore = await aendere(s => {
        for (const e of ergebnisse) {
          const t = s.termine.find(x => x.id === e.id)
          if (!t || !t.outlook) continue
          if (!e.gefunden) {
            if (!t.outlook.geoeffnet) hinweise.push(`${t.name}: Outlook-Termin nicht mehr in deinem Kalender gefunden (gelöscht oder von jemand anderem gesendet?)`)
            continue
          }
          // a) Antwortstatus des Mitarbeiters (Pflichtteilnehmer)
          const a = (e.antworten ?? []).find(x => x.typ === 1 && istPerson(t, x.adresse, x.name))
          const neuStatus = a?.status ?? 0
          const bisher = t.outlook.antwortStatus ?? 0
          if (RESPONSE[neuStatus] && neuStatus !== bisher) {
            t.outlook.antwortStatus = neuStatus
            // Abgelehnt, aber per Nachricht eine neue Zeit vorgeschlagen? Dann ist das KEINE Absage —
            // der Vorschlag (umgetragen oder offen) gilt, Status bleibt.
            const mitVorschlag = neuStatus === 4 && t.vorschlaege.some(v => (v.art === 'vorschlag' || v.quelle === 'outlook') && v.erledigt !== 'verworfen'
              && (!t.outlook!.gesendetAt || ausLokal(v.empfangen.replace(' ', 'T')).getTime() >= new Date(t.outlook!.gesendetAt).getTime() - 60000))
            // Zusage zählt nicht, solange das Tool umgetragen hat und das Outlook-Update aussteht (sie gilt dann der alten Zeit)
            if (neuStatus === 3 && t.status !== 'zugesagt' && !t.outlook.veraltet) t.status = 'zugesagt'
            if (neuStatus === 4 && !mitVorschlag) t.status = 'abgesagt'
            t.verlauf.push({ text: `Outlook-Antwort: ${t.name} hat ${RESPONSE[neuStatus]}${neuStatus === 4 ? (mitVorschlag ? ' und eine neue Zeit vorgeschlagen (siehe Vorschlag)' : ' — bitte nachfassen') : ''}`, by: scanBy, at: jetzt() })
            t.updatedBy = scanBy; t.updatedAt = jetzt()
            ausKalender++
          }
          // b) Zeit/Raum in Outlook geändert? Nur übernehmen, wenn das Tool NICHT selbst neuer ist (veraltet = Tool hat umgetragen, Outlook-Update steht aus)
          const oStart = (e.start || '').replace(' ', 'T'), oEnde = (e.ende || '').replace(' ', 'T')
          if (oStart && oEnde && !t.outlook.veraltet && (oStart !== t.start || oEnde !== t.ende)) {
            const alt = zeitraumText(t.start, t.ende, true)
            // Ankunftszeit nur behalten, wenn sie im neuen Fenster am selben Tag liegt
            if (t.ankunft && (oStart.slice(0, 10) !== t.start.slice(0, 10) || t.ankunft < oStart.slice(11) || t.ankunft >= oEnde.slice(11))) t.ankunft = undefined
            t.start = oStart; t.ende = oEnde
            t.verlauf.push({ text: `In Outlook geändert: ${alt} → ${zeitraumText(oStart, oEnde, true)}`, by: scanBy, at: jetzt() })
            t.updatedBy = scanBy; t.updatedAt = jetzt()
            ausKalender++
          }
          const raumNeu = (e.ort || '').replace(/^Raum\s+/i, '').trim()
          if (raumNeu && raumNeu !== t.raum && !t.outlook.veraltet) {
            t.verlauf.push({ text: `Raum in Outlook geändert: ${t.raum} → ${raumNeu}`, by: scanBy, at: jetzt() })
            t.raum = raumNeu; ausKalender++
          }
        }
      }) ?? store
    }
  }
  if (ausKalender) hinweise.unshift(`${ausKalender} Änderung(en) aus dem Outlook-Kalender übernommen`)
  return { ok: true, store: endStore, neu, umgetragen, hinweise }
}

/** Offenen Vorschlag übernehmen (verschiebt den Termin) oder verwerfen. */
export async function vorschlagEntscheiden(terminId: string, mailId: string, uebernehmen: boolean, by: string): Promise<TerminStore | null> {
  return aendere(s => {
    const t = s.termine.find(x => x.id === terminId); const v = t?.vorschlaege.find(x => x.mailId === mailId)
    if (!t || !v) return
    v.erledigt = uebernehmen ? 'uebernommen' : 'verworfen'; v.erledigtBy = by; v.erledigtAt = jetzt()
    if (uebernehmen && v.start && v.ende) {
      const alt = zeitraumText(t.start, t.ende, true)
      t.start = v.start; t.ende = v.ende; t.status = 'verschoben'
      t.ankunft = v.ankunft
      if (t.outlook) t.outlook.veraltet = true
      t.verlauf.push({ text: `Vorschlag übernommen: ${alt} → ${zeitraumText(v.start, v.ende, true)} (Mail von ${v.von})`, by, at: jetzt() })
      t.updatedBy = by; t.updatedAt = jetzt()
    }
  })
}

/** Kennung für den Verlauf: „Anzeigename (Login)". */
export function kennung(user?: { displayName?: string; username?: string } | null): string {
  const d = user?.displayName?.trim(), u = user?.username?.trim()
  return d && u && d !== u ? `${d} (${u})` : d || u || 'unbekannt'
}

/** Standard-Vorschlag: nächster Werktag 08:00–13:00. */
export function standardZeitraum(): { datum: string; von: string; bis: string } {
  const d = new Date(); d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return { datum: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, von: '08:00', bis: '13:00' }
}

export function artVon(c: Checklist): TerminArt { return c.deviceType === 'refresh' ? 'refresh' : 'neu' }

/**
 * Bauform des neuen Geräts: „Hardware fertig" der Checkliste (Tower / Mini-PC) zählt zuerst,
 * sonst das Modell aus der Endgeräte-Übersicht (EliteDesk Mini → mini, SFF/Z4 → tower).
 * Laptops und Unbekanntes → '' (normale Übergabe zum Abholen).
 */
export function formfaktorVon(c: Checklist, modell?: string): 'tower' | 'mini' | '' {
  if (c.hardwareType === 'tower') return 'tower'
  if (c.hardwareType === 'minipc') return 'mini'
  if (c.hardwareType && c.hardwareType !== 'inprogress' && c.hardwareType !== 'none') return ''   // Laptop/Z-Book
  const typ = classifyModel(modell || '')
  if (typ === 'Desktop Mini') return 'mini'
  if (typ === 'Desktop SFF' || typ === 'Desktop Workstation') return 'tower'
  return ''
}
