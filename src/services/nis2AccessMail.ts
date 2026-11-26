// ── NIS2 Zugänge-Check: Mail an Nutzer mit lokalem Admin-Zugang ohne Antrag ──
// Bittet die Person, den Konzern-Antrag „Permanent Admin Access on Windows 11 machines“ in
// ServiceNow auszufüllen (Link direkt im Text), den Grund ausführlich zu beschreiben und sich zu
// melden, falls der Zugang nicht mehr gebraucht wird. Text-Einstellungen und Kontakt-Protokoll
// liegen geteilt auf dem Netzlaufwerk (vor jedem Schreiben frisch laden, Protokoll nur anhängen).

import { api } from '../electronAPI'

export const ACCESS_MAIL_FILE = 'nis2/access-mail.json'

/** ServiceNow (skfprod) – Katalog-Eintrag „Permanent Admin Access on Windows 11 machines“ (aus der ServiceNow Welt). */
export const ANTRAG_LINK = 'https://skfprod.service-now.com/sp?id=sc_cat_item&sys_id=1a22ecc94f56f38020f269d18110c781'
export const ANTRAG_NAME = 'Permanent Admin Access on Windows 11 machines'
export const LINK_TEXT = 'Hier geht es direkt zum Antrag'

export interface AccessMailEinstellungen { link?: string; cc?: string }
export interface AccessMailKontakt {
  at: string; by: string; sam: string; name: string; mail: string; pcs: string[]
  art: 'gesendet' | 'entwurf'
}
/** „Mitarbeiter kontaktiert“ – von Hand angekreuzt oder automatisch beim Mailversand */
export interface Kontaktiert { at: string; by: string; quelle: 'mail' | 'manuell' }
export interface AccessMailStand {
  einstellungen: AccessMailEinstellungen
  kontakte: AccessMailKontakt[]
  /** samLower → Haken „Mitarbeiter kontaktiert“ */
  kontaktiert: Record<string, Kontaktiert>
}

const leer = (): AccessMailStand => ({ einstellungen: {}, kontakte: [], kontaktiert: {} })

export async function ladeAccessMail(): Promise<AccessMailStand> {
  try {
    const d = await api().netReadJsonAsync<AccessMailStand>(ACCESS_MAIL_FILE)
    if (d && typeof d === 'object') return {
      einstellungen: d.einstellungen ?? {},
      kontakte: Array.isArray(d.kontakte) ? d.kontakte : [],
      kontaktiert: d.kontaktiert && typeof d.kontaktiert === 'object' ? d.kontaktiert : {},
    }
  } catch { /* noch keine Datei */ }
  return leer()
}

async function aendere(f: (s: AccessMailStand) => AccessMailStand): Promise<AccessMailStand> {
  const neu = f(await ladeAccessMail())
  try { await api().netWriteJson(ACCESS_MAIL_FILE, neu) } catch { /* Netzlaufwerk nicht erreichbar */ }
  return neu
}
/** Mail protokollieren – setzt zugleich den Haken „Mitarbeiter kontaktiert“ (auch beim Öffnen in Outlook). */
export const protokolliereAccessMail = (k: AccessMailKontakt) => aendere(s => ({
  ...s,
  kontakte: [...s.kontakte, k].slice(-2000),
  kontaktiert: { ...s.kontaktiert, [k.sam.toLowerCase()]: { at: k.at, by: k.by, quelle: 'mail' } },
}))
/** Haken „Mitarbeiter kontaktiert“ von Hand setzen oder entfernen. */
export const setzeKontaktiert = (sam: string, an: boolean, by: string, quelle: Kontaktiert['quelle']) => aendere(s => {
  const k = { ...s.kontaktiert }
  if (an) k[sam.toLowerCase()] = { at: new Date().toISOString(), by, quelle }
  else delete k[sam.toLowerCase()]
  return { ...s, kontaktiert: k }
})
export const speichereAccessMailEinstellungen = (e: AccessMailEinstellungen) => aendere(s => ({ ...s, einstellungen: e }))

/** Link: leeres Feld in den Einstellungen = Standard (nie „ohne Link“). */
export const antragsLink = (e?: AccessMailEinstellungen): string => (e?.link || '').trim() || ANTRAG_LINK

export function vorname(anzeige: string): string {
  const s = (anzeige || '').trim()
  if (s.includes(',')) return s.split(',')[1].trim().split(/\s+/)[0] || ''
  return s.split(/\s+/)[0] || ''
}

export function baueAdminMail(o: { name: string; sam: string; pcs: string[]; absender: string }): { subject: string; body: string } {
  const vn = vorname(o.name)
  const pcs = o.pcs.length ? o.pcs.join(', ') : 'deinem PC'
  const rechner = o.pcs.length > 1 ? `deinen Rechnern ${pcs}` : `deinem Rechner ${pcs}`
  const zeilen = [
    `Hallo ${vn || 'zusammen'},`,
    '',
    `bei unserer NIS2-Überprüfung der Zugänge haben wir festgestellt, dass auf ${rechner} für dein Konto (${o.sam}) ein lokaler Administrator-Zugang eingerichtet ist.`,
    '',
    `Für jeden dauerhaften lokalen Admin-Zugang möchte der Konzern einen genehmigten Antrag haben. Bitte fülle dafür den Antrag „${ANTRAG_NAME}“ in ServiceNow aus:`,
    `${LINK_TEXT}`,
    '',
    'Bitte beschreibe den Grund im Antrag lieber etwas ausführlicher: Für welche Programme oder Aufgaben brauchst du die Adminrechte, wie oft, und warum geht es nicht anders? Dauerhafte Adminrechte werden nur in Ausnahmefällen genehmigt – es muss mindestens einen technischen Grund geben, warum die Arbeit ohne sie nicht möglich ist.',
    '',
    'Falls du den Admin-Zugang nicht mehr benötigst, gib mir bitte kurz Rückmeldung – dann entfernen wir ihn.',
    '',
    'Vielen Dank!',
    '',
    'Viele Grüße',
    o.absender,
    'IT · SKF Marine',
  ]
  return { subject: 'Lokaler Admin-Zugang auf deinem PC – bitte Antrag stellen (NIS2)', body: zeilen.join('\n') }
}

/** Klartext → HTML; „Hier geht es direkt zum Antrag“ wird zum Hyperlink. Fehlt der Satz im (von Hand
 *  geänderten) Text, wird er vor „Bitte beschreibe“ bzw. dem Gruß eingefügt. */
export function adminMailHtml(text: string, link: string = ANTRAG_LINK): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const ziel = (link || '').trim() || ANTRAG_LINK
  let t = text
  if (!t.includes(LINK_TEXT)) {
    const vor = ['Bitte beschreibe', 'Falls du den Admin-Zugang', 'Vielen Dank', 'Viele Grüße'].map(s => t.indexOf(s)).find(i => i >= 0)
    t = vor != null ? t.slice(0, vor) + `${LINK_TEXT}\n\n` + t.slice(vor) : `${t}\n\n${LINK_TEXT}`
  }
  const html = esc(t).replace(LINK_TEXT, () => `<a href="${esc(ziel)}">${esc(LINK_TEXT)}</a>`)
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${html.split(/\r?\n/).join('<br>')}</div>`
}
