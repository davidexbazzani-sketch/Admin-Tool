// ── Treiber-Installation: PDF-Bericht ────────────────────────────────────────
// Baut aus den (nachgeprüften) Installationsergebnissen je PC eine Tabelle
// „Treiber · vorher · neueste · Ergebnis" und speichert sie als PDF.
// Muster wie src/services/gpuDriversExport.ts (jsPDF + jspdf-autotable).

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import type { HpDeployResult } from './hpDrivers'

const BLAU: [number, number, number] = [30, 64, 175]
const ZEBRA: [number, number, number] = [240, 244, 255]
const GRUEN: [number, number, number] = [22, 128, 61]
const ROT: [number, number, number] = [190, 40, 40]

// jsPDF-Standardfont ist WinAnsi (cp1252): Umlaute/„…"/– sind ok, aber → und ✓/✗ NICHT.
const pdfSafe = (s: string) => (s || '').replace(/→/g, '->').replace(/[✓✔]/g, 'OK').replace(/[✗✘]/g, 'X')

function fmtNow(): string {
  try { return new Date().toLocaleString('de-DE') } catch { return new Date().toISOString() }
}
function sanitizeFile(s: string): string { return (s || '').replace(/[\\/:*?"<>|]/g, '_').trim() }
function abToB64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf); let s = ''
  for (let i = 0; i < b.byteLength; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192))
  return btoa(s)
}

/** PDF-Dokument aus den Ergebnissen bauen. */
export function buildHpDriverReport(results: HpDeployResult[], by: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const mitInhalt = results.filter(r => r.ergebnisse && r.ergebnisse.length)

  doc.setFontSize(15); doc.setTextColor(...BLAU)
  doc.text('Treiber-Installation – Bericht', 14, 15)
  doc.setFontSize(9); doc.setTextColor(90, 90, 90)
  const bestaetigt = mitInhalt.reduce((n, r) => n + r.ergebnisse.filter(e => e.verifiziert).length, 0)
  const gesamt = mitInhalt.reduce((n, r) => n + r.ergebnisse.length, 0)
  doc.text(`Erstellt: ${fmtNow()}  ·  Bearbeiter: ${by || '—'}  ·  ${mitInhalt.length} PC(s)  ·  ${bestaetigt}/${gesamt} Treiber bestätigt`, 14, 21)

  let y = 27
  for (const r of mitInhalt) {
    const ok = r.ergebnisse.filter(e => e.verifiziert).length
    doc.setFontSize(11); doc.setTextColor(20, 20, 20)
    doc.text(`${r.host}`, 14, y)
    doc.setFontSize(8.5); doc.setTextColor(...(ok === r.ergebnisse.length ? GRUEN : ROT))
    doc.text(`${ok}/${r.ergebnisse.length} bestätigt${r.needsReboot ? ' · Neustart nötig' : ''}${r.verifyMoeglich ? '' : ' · Nachprüfung nicht möglich'}`, 60, y)
    y += 2

    autoTable(doc, {
      startY: y,
      head: [['Treiber / Gerät', 'Kategorie', 'Version vorher', 'nachher', 'Ergebnis', 'Versuche']],
      body: r.ergebnisse.map(e => [
        pdfSafe(e.name), pdfSafe(e.category), e.vorher || '—', e.nachher || '—',
        pdfSafe((e.verifiziert ? 'OK: ' : 'FEHLER: ') + e.info), String(e.versuche || 0),
      ]),
      styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' },
      headStyles: { fillColor: BLAU, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: { 0: { cellWidth: 78 }, 4: { cellWidth: 88 } },
      margin: { left: 8, right: 8 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const txt = String(data.cell.raw || '')
          data.cell.styles.textColor = txt.startsWith('FEHLER') ? ROT : GRUEN
        }
      },
    })
    // finalY der letzten Tabelle als neue Y-Position.
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
    y += 8
    if (y > 190) { doc.addPage(); y = 20 }
  }

  if (!mitInhalt.length) { doc.setFontSize(11); doc.setTextColor(120, 120, 120); doc.text('Keine Ergebnisse vorhanden.', 14, 30) }
  return doc
}

/** Bericht als PDF speichern (Dateidialog) und danach öffnen. */
export async function exportHpDriverReport(results: HpDeployResult[], by: string): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  try {
    const doc = buildHpDriverReport(results, by)
    const name = sanitizeFile(`Treiber-Bericht ${new Date().toISOString().slice(0, 10)}.pdf`)
    const path = await api().saveFileDialog(name, [{ name: 'PDF', extensions: ['pdf'] }])
    if (!path) return { ok: true, cancelled: true }
    const r = await api().writeFile(path, abToB64(doc.output('arraybuffer')))
    if (!r.success) return { ok: false, error: r.error || 'Datei konnte nicht gespeichert werden.' }
    api().openPath(path).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
