// ── PC-Volldiagnose: Berichte (PDF, Markdown + JSON für die KI) ───────────────
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import { richtungText } from './richtung'
import { BEREICH_TEXT, PHASE_TEXT, SCHWERE_RANG, type VdLauf } from './typen'

const SCHWERE_TEXT = { kritisch: 'Kritisch', warnung: 'Warnung', hinweis: 'Hinweis' } as const
const datum = (t?: number | string) => { const d = t ? new Date(t) : null; return d && !isNaN(d.getTime()) ? d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }
const pad = (n: number) => String(n).padStart(2, '0')
export const dateiName = (l: VdLauf, endung: string) => { const d = new Date(l.start); return `Volldiagnose_${l.host.toUpperCase()}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.${endung}` }

function sortierteBefunde(l: VdLauf) {
  return [...l.befunde].sort((a, b) => (a.folgeVon ? 1 : 0) - (b.folgeVon ? 1 : 0) || SCHWERE_RANG[a.schwere] - SCHWERE_RANG[b.schwere] || (b.passend ? 1 : 0) - (a.passend ? 1 : 0))
}

/** Markdown: je Befund ein klar abgegrenzter Abschnitt (für Menschen und KI). */
export function berichtMarkdown(l: VdLauf): string {
  const z = l.ziel
  const out: string[] = []
  out.push(`# Volldiagnose ${l.host.toUpperCase()}`, '')
  out.push(`- Gerät: ${z?.geraet === 'server' ? 'Server' : 'Arbeitsplatz-PC'} · ${z?.os || '?'} ${z?.build ? `(Build ${z.build})` : ''}`)
  if (z?.modell) out.push(`- Modell: ${z.modell}${z.seriennummer ? ` · Seriennummer ${z.seriennummer}` : ''}`)
  out.push(`- Angemeldet: ${z?.benutzer || '—'}${z?.sitzung ? ` (${z.sitzung})` : ''}${z?.boot ? ` · letzter Start: ${datum(z.boot)}` : ''}`)
  out.push(`- Diagnose: ${datum(l.start)} von ${l.von} · Ereignis-Zeitraum ${l.tage} Tage${l.richtung ? ` · Richtung: ${richtungText(l.richtung)}` : ''}`)
  out.push(`- Ergebnis: ${l.befunde.filter(b => b.schwere === 'kritisch').length} kritisch · ${l.befunde.filter(b => b.schwere === 'warnung').length} Warnungen · ${l.befunde.filter(b => b.schwere === 'hinweis').length} Hinweise`, '')
  out.push('> Aufbau: Ursachenbild (bereichsübergreifende Erklärung), dann je Befund ein Abschnitt „## Befund: …“ mit Ergebnis, Belegen und Lösungswegen, danach Maßnahmen und alle Prüfungen. Der Lese-Schritt hat am Gerät nichts geändert.', '')
  if (l.ursachen.length) {
    out.push('## Ursachenbild', '')
    for (const u of l.ursachen) { out.push(`### ${u.titel}`, '', u.text, '', ...u.belege.map(b => `- ${b}`), ...(u.sperrt?.length ? [`- Gesperrt bis zur Behebung: ${u.sperrt.map(p => PHASE_TEXT[p]).join(', ')}`] : []), '') }
  }
  for (const b of sortierteBefunde(l)) {
    out.push(`## Befund: ${b.titel}`, '')
    out.push(`- Schwere: ${SCHWERE_TEXT[b.schwere]} · Bereich: ${BEREICH_TEXT[b.bereich]} · Typ: \`${b.typ}\`${b.passend ? ' · passt zur Richtung' : ''}${b.neu ? ' · neu seit der letzten Diagnose' : ''}${b.folgeVon ? ` · Folge von „${l.ursachen.find(u => u.id === b.folgeVon)?.titel || b.folgeVon}“` : ''}`)
    out.push(`- Ergebnis: ${b.text}`)
    if (b.belege.length) out.push('- Belege:', ...b.belege.map(x => `  - ${x}`))
    if (b.ursacheOffen) out.push(`- Ursache noch offen – Vertiefung: ${b.vertiefungen.join(', ') || '—'}`)
    if (b.fachdiagnose) out.push(`- Fachdiagnose: ${b.fachdiagnose}`)
    out.push('- Lösungswege:', ...b.loesungen.map((x, i) => `  ${i + 1}. ${x.titel} (${x.art}${x.schritte?.length ? ': ' + x.schritte.map(s => s.aktion).join(' → ') : ''}${x.werkzeug ? ': ' + x.werkzeug : ''}) – ${x.wirkung}`))
    if (b.nach) out.push(`- Nachprüfung: ${b.nach}`)
    out.push('')
  }
  const gelaufen = l.massnahmen.filter(m => m.status !== 'offen')
  if (gelaufen.length) {
    out.push('## Ausgeführte Maßnahmen', '')
    for (const m of gelaufen) out.push(`- ${m.loesung.titel}${m.eingabe ? ` (${m.eingabe})` : ''}: ${m.status}${m.fehler ? ' – ' + m.fehler : ''}${m.nachpruefung ? ` · Nachprüfung: ${m.nachpruefung}` : ''}`)
    out.push('')
  }
  out.push('## Prüfungen', '', '| Prüfung | Ergebnis | Hinweis |', '|---|---|---|')
  for (const p of l.pruefungen) out.push(`| ${p.titel.replace(/\|/g, '/')} | ${p.status} | ${(p.grund || (p.befunde ? p.befunde + ' Befund(e)' : '')).replace(/\|/g, '/')} |`)
  out.push('')
  return out.join('\n')
}

export function berichtJson(l: VdLauf) {
  return { art: 'pc-volldiagnose', host: l.host, ziel: l.ziel, start: new Date(l.start).toISOString(), von: l.von, tage: l.tage, richtung: l.richtung, ursachen: l.ursachen, befunde: sortierteBefunde(l), massnahmen: l.massnahmen.map(m => ({ titel: m.loesung.titel, status: m.status, eingabe: m.eingabe, fehler: m.fehler, nachpruefung: m.nachpruefung, befunde: m.befunde })), pruefungen: l.pruefungen }
}

/** Zeichen, die die PDF-Standardschrift (WinAnsi) nicht kennt. */
const pdfText = (t: string) => (t || '').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/✓/g, 'OK').replace(/✗/g, 'X').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ„“”‚‘’–—…•€]/g, '')

export function berichtPdf(l: VdLauf): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const rand = 14
  let y = 16
  const nachTabelle = () => { y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 7 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(pdfText(`Volldiagnose ${l.host.toUpperCase()}`), rand, y); y += 7
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const z = l.ziel
  for (const zeile of [
    `${z?.geraet === 'server' ? 'Server' : 'Arbeitsplatz-PC'} · ${z?.os || '?'}${z?.build ? ' (Build ' + z.build + ')' : ''}${z?.modell ? ' · ' + z.modell : ''}`,
    `Angemeldet: ${z?.benutzer || '—'} · Diagnose ${datum(l.start)} von ${l.von} · Zeitraum ${l.tage} Tage${l.richtung ? ' · Richtung: ' + richtungText(l.richtung) : ''}`,
  ]) { doc.text(pdfText(zeile), rand, y); y += 5 }
  y += 2
  if (l.ursachen.length) {
    autoTable(doc, { startY: y, margin: { left: rand, right: rand }, head: [['Ursachenbild', 'Erklärung']], theme: 'grid',
      headStyles: { fillColor: [30, 64, 175], fontSize: 8 }, bodyStyles: { fontSize: 8, valign: 'top' }, columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' } },
      body: l.ursachen.map(u => [pdfText(u.titel), pdfText(u.text + (u.belege.length ? '\n- ' + u.belege.slice(0, 5).join('\n- ') : ''))]) })
    nachTabelle()
  }
  autoTable(doc, { startY: y, margin: { left: rand, right: rand }, head: [['Schwere', 'Befund', 'Ergebnis', 'Lösungsweg']], theme: 'grid',
    headStyles: { fillColor: [55, 65, 81], fontSize: 8 }, bodyStyles: { fontSize: 7.5, valign: 'top' }, columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 45, fontStyle: 'bold' }, 3: { cellWidth: 50 } },
    body: sortierteBefunde(l).map(b => [SCHWERE_TEXT[b.schwere], pdfText(b.titel + (b.folgeVon ? ' (Folgefehler)' : '')), pdfText(b.text + (b.belege.length ? '\n' + b.belege.slice(0, 3).join('\n') : '')), pdfText(b.loesungen.slice(0, 2).map(x => x.titel).join('\n'))]),
    didParseCell: d => { if (d.section === 'body' && d.column.index === 0) { const t = String(d.cell.raw); d.cell.styles.textColor = t === 'Kritisch' ? [200, 30, 45] : t === 'Warnung' ? [180, 120, 0] : [40, 90, 200] } } })
  nachTabelle()
  const gelaufen = l.massnahmen.filter(m => m.status !== 'offen')
  if (gelaufen.length) {
    autoTable(doc, { startY: y, margin: { left: rand, right: rand }, head: [['Maßnahme', 'Ergebnis', 'Nachprüfung']], theme: 'grid', headStyles: { fillColor: [5, 120, 80], fontSize: 8 }, bodyStyles: { fontSize: 8 },
      body: gelaufen.map(m => [pdfText(m.loesung.titel + (m.eingabe ? ' (' + m.eingabe + ')' : '')), pdfText(m.status + (m.fehler ? ': ' + m.fehler : '')), pdfText(m.nachpruefung || '')]) })
    nachTabelle()
  }
  autoTable(doc, { startY: y, margin: { left: rand, right: rand }, head: [['Prüfung', 'Ergebnis', 'Hinweis']], theme: 'striped', headStyles: { fillColor: [100, 116, 139], fontSize: 7.5 }, bodyStyles: { fontSize: 7 },
    body: l.pruefungen.map(p => [pdfText(p.titel), p.status, pdfText(p.grund || (p.befunde ? p.befunde + ' Befund(e)' : ''))]) })
  return new Uint8Array(doc.output('arraybuffer'))
}

function b64Bytes(u: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
const b64Text = (t: string) => b64Bytes(new TextEncoder().encode(t))

/** PDF speichern (Dialog) — liefert den Pfad. */
export async function speicherePdf(l: VdLauf): Promise<string | null> {
  const ziel = await api().saveFileDialog(dateiName(l, 'pdf'), [{ name: 'PDF', extensions: ['pdf'] }])
  if (!ziel) return null
  const r = await api().writeFile(ziel, b64Bytes(berichtPdf(l)))
  if (!r.success) throw new Error(r.error || 'PDF konnte nicht gespeichert werden')
  return ziel
}
/** Markdown + JSON speichern (Dialog) — für die Auswertung mit KI. */
export async function speichereKiBericht(l: VdLauf): Promise<string | null> {
  const ziel = await api().saveFileDialog(dateiName(l, 'md'), [{ name: 'Markdown-Bericht', extensions: ['md'] }])
  if (!ziel) return null
  const md = /\.md$/i.test(ziel) ? ziel : `${ziel}.md`
  const r1 = await api().writeFile(md, b64Text(berichtMarkdown(l)))
  if (!r1.success) throw new Error(r1.error || 'Bericht konnte nicht gespeichert werden')
  await api().writeFile(md.replace(/\.md$/i, '.json'), b64Text(JSON.stringify(berichtJson(l), null, 2)))
  return md
}
