// ── Zubehör-Bestellung: Mailtext, Empfänger, Links ───────────────────────────
// Rein rechnend (ohne electronAPI), damit es testbar ist. Versand/Outlook/PDF macht
// der Screen über api().sendEmailRaw / composeEmail und accessoryInventoryExport.ts.

import type { BestellPosition } from './accessoryInventory'
import { kategorieIndex } from './zubehoerKatalog'

export const BESTELL_AN = 'sascha.herges@skf.com'
export const BESTELL_CC = 'support.marine@skf.com'     // IT-Support-Postfach (wie uebergabeTermine/departureReminder)

const datumDe = (d = new Date()) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Betreff — beginnt wie bisher mit „Zubehör Inventur" (bestehende Mail-Regeln greifen weiter). */
export const bestellBetreff = (d = new Date()) => `Zubehör Inventur – Bestellung vom ${datumDe(d)}`

/** Dateiname des PDF-Anhangs (ohne Umlaute: geht so sicher durch VBS/Outlook). */
export const bestellDatei = (ext: string, d = new Date()) => `Bestellung Zubehoer ${d.toISOString().slice(0, 10)}.${ext}`

export function linkHref(url: string): string {
  const u = (url ?? '').trim()
  if (!u) return ''
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

/** Kurzform für Tabellen: „amazon.de · B0ABCDEF12" bzw. Hostname. */
export function kurzLink(url: string): string {
  const h = linkHref(url)
  if (!h) return ''
  try {
    const u = new URL(h)
    const host = u.hostname.replace(/^www\./, '')
    const asin = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i.exec(u.pathname)?.[1]
    if (asin) return `${host} · ${asin.toUpperCase()}`
    if (u.pathname === '/s' && u.searchParams.get('k')) return `${host} · Suche „${u.searchParams.get('k')}"`
    return host
  } catch { return h.length > 48 ? `${h.slice(0, 45)}…` : h }
}

export function adressFehler(an: string, cc: string): string | null {
  const ok = (s: string) => /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(s)
  const liste = (s: string) => s.split(/[;,]/).map(x => x.trim()).filter(Boolean)
  if (!liste(an).length) return 'Bitte einen Empfänger (An) eintragen.'
  const falsch = [...liste(an), ...liste(cc)].find(a => !ok(a))
  return falsch ? `„${falsch}" ist keine gültige E-Mail-Adresse.` : null
}
/** Mehrere Adressen für Outlook: „a@x; b@y". */
export const adressListe = (s: string) => s.split(/[;,]/).map(x => x.trim()).filter(Boolean).join('; ')

/** Gültige Positionen in Anzeige-Reihenfolge: Lager-Artikel nach Kategorie, freie Positionen am Ende. */
export function sortiertePositionen(p: BestellPosition[]): BestellPosition[] {
  return p.filter(x => x.name.trim() && x.menge > 0)
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (Number(!!a.x.manuell) - Number(!!b.x.manuell)) || (kategorieIndex(a.x.kategorie) - kategorieIndex(b.x.kategorie)) || (a.i - b.i))
    .map(({ x }) => x)
}

const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function anrede(an: string): string {
  return adressListe(an).toLowerCase() === BESTELL_AN ? 'Hallo Sascha,' : 'Hallo,'
}

/** HTML-Mail: Tabelle Artikel · Anzahl · Link (klickbar), optional Anmerkung. */
export function bestellMailHtml(x: { positionen: BestellPosition[]; von: string; an: string; anmerkung?: string; mitPdf?: boolean; datum?: Date }): string {
  const pos = sortiertePositionen(x.positionen)
  const summe = pos.reduce((s, p) => s + p.menge, 0)
  const td = 'style="border:1px solid #d0d7e2;padding:6px 10px;font-family:Segoe UI,Arial,sans-serif;font-size:10pt;vertical-align:top"'
  const th = 'style="border:1px solid #1e40af;padding:6px 10px;background:#1e40af;color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:10pt;text-align:left"'
  const zeilen = pos.map((p, i) => {
    const h = linkHref(p.link)
    const link = h ? `<a href="${esc(h)}" style="color:#1d4ed8">${esc(kurzLink(p.link))}</a>` : '<span style="color:#888">kein Link hinterlegt</span>'
    return `<tr><td ${td}>${i + 1}</td><td ${td}>${esc(p.name)}</td><td ${td} align="center"><b>${p.menge}</b></td><td ${td}>${link}</td></tr>`
  }).join('')
  const absatz = (t: string) => `<p style="font-family:Segoe UI,Arial,sans-serif;font-size:10pt;margin:0 0 10px 0">${t}</p>`
  return [
    absatz(esc(anrede(x.an))),
    absatz(`anbei die Bestellung für das IT-Zubehör-Lager (Kleinteile) vom ${datumDe(x.datum)}${x.mitPdf ? ' — die Liste hängt zusätzlich als PDF an' : ''}:`),
    `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 10px 0">`,
    `<tr><th ${th}>Pos.</th><th ${th}>Artikel</th><th ${th}>Anzahl</th><th ${th}>Bestelllink</th></tr>`,
    zeilen,
    `<tr><td ${td}></td><td ${td}><b>Summe</b></td><td ${td} align="center"><b>${summe}</b></td><td ${td}>${pos.length} Position${pos.length === 1 ? '' : 'en'}</td></tr>`,
    `</table>`,
    x.anmerkung?.trim() ? absatz(`<b>Anmerkung:</b> ${esc(x.anmerkung.trim()).replace(/\n/g, '<br>')}`) : '',
    absatz(`Viele Grüße<br>${esc(x.von)}<br>IT-Support · SKF Marine`),
  ].join('\n')
}

/** Klartext (Vorschau / Fallback ohne Outlook). */
export function bestellMailText(x: { positionen: BestellPosition[]; von: string; an: string; anmerkung?: string; datum?: Date }): string {
  const pos = sortiertePositionen(x.positionen)
  return [
    anrede(x.an), '',
    `anbei die Bestellung für das IT-Zubehör-Lager (Kleinteile) vom ${datumDe(x.datum)}:`, '',
    ...pos.map((p, i) => `${i + 1}. ${p.name} — ${p.menge} Stück\n   ${linkHref(p.link) || '(kein Link hinterlegt)'}`), '',
    `Summe: ${pos.reduce((s, p) => s + p.menge, 0)} Stück in ${pos.length} Position${pos.length === 1 ? '' : 'en'}`,
    ...(x.anmerkung?.trim() ? ['', `Anmerkung: ${x.anmerkung.trim()}`] : []), '',
    'Viele Grüße', x.von, 'IT-Support · SKF Marine',
  ].join('\n')
}
