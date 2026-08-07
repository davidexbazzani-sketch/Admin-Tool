// ── Export der "Wo angemeldet?"-Berichte (Excel / Word / PDF) ────────────────
// Exportiert die Massen-Scan- und DNS-Check-Protokolle. Gleiche Technik wie die
// uebrigen Tool-Exporte (Datei-Dialog + writeFile, Libraries exceljs/docx/jspdf).
import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import type { ScanRow } from './userPresenceScan'
import type { DnsRow, DnsStatus } from './userPresenceScan'
import type { WinrmDnsRow, WinrmDnsStatus } from './userPresenceScan'

export type ExportFormat = 'excel' | 'word' | 'pdf'

const DNS_LABEL: Record<DnsStatus, string> = { OK: 'OK', MISMATCH: 'Falsche IP', NO_PTR: 'PTR fehlt', NO_A: 'Hostname unauflösbar' }

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.byteLength; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}
async function writeAndCheck(savePath: string, base64: string): Promise<void> {
  const r = await api().writeFile(savePath, base64)
  if (!r.success) throw new Error(r.error || 'Datei konnte nicht gespeichert werden.')
}
function sanitize(s: string): string { return s.replace(/[\\/:*?"<>|]/g, '_') }
function fmt(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE') }
function stamp(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? 'export' : d.toISOString().slice(0, 16).replace(/[:T]/g, '-') }

const BORDER = { style: BorderStyle.SINGLE, size: 1 }
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }
const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

// ── generischer Tabellen-Export ──────────────────────────────────────────────
interface Col { header: string; width: number }

async function exportTable(opts: {
  title: string
  subtitle: string
  baseName: string
  columns: Col[]
  rows: string[][]
  format: ExportFormat
  intro?: string[]        // optionaler Erklaerungstext (Absaetze) ueber der Tabelle
}): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const { title, subtitle, columns, rows, format, intro } = opts
  const extMap: Record<ExportFormat, string> = { excel: 'xlsx', word: 'docx', pdf: 'pdf' }
  const filterMap: Record<ExportFormat, { name: string; extensions: string[] }> = {
    excel: { name: 'Excel', extensions: ['xlsx'] }, word: { name: 'Word', extensions: ['docx'] }, pdf: { name: 'PDF', extensions: ['pdf'] },
  }
  const savePath = await api().saveFileDialog(sanitize(`${opts.baseName}.${extMap[format]}`), [filterMap[format]])
  if (!savePath) return { ok: true, cancelled: true }
  try {
    if (format === 'excel') {
      const wb = new ExcelJS.Workbook(); wb.creator = 'IT Admin Tool'; wb.created = new Date()
      const ws = wb.addWorksheet('Bericht')
      ws.addRow([title]).getCell(1).font = { bold: true, size: 14 }
      ws.addRow([subtitle]).getCell(1).font = { italic: true, color: { argb: 'FF666666' } }
      ws.addRow([])
      if (intro && intro.length) {
        for (const line of intro) { const r = ws.addRow([line]); r.getCell(1).alignment = { wrapText: true } }
        ws.addRow([])
      }
      const hr = ws.addRow(columns.map(c => c.header))
      hr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEAD_FILL })
      for (const r of rows) ws.addRow(r)
      ws.columns = columns.map(c => ({ width: c.width }))
      await writeAndCheck(savePath, arrayBufferToBase64(await wb.xlsx.writeBuffer() as ArrayBuffer))
    } else if (format === 'word') {
      const headCells = columns.map(c => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c.header, bold: true, size: 16 })] })] }))
      const bodyRows = rows.map(r => new TableRow({ children: r.map(v => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: v, size: 16 })] })] })) }))
      const introParas = (intro ?? []).map(line => new Paragraph({ children: [new TextRun({ text: line, size: 20 })], spacing: { after: 120 } }))
      const doc = new Document({ sections: [{ children: [
        new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: subtitle, italics: true, color: '666666' })] }),
        new Paragraph({ text: '' }),
        ...introParas,
        ...(introParas.length ? [new Paragraph({ text: '' })] : []),
        new Table({ rows: [new TableRow({ tableHeader: true, children: headCells }), ...bodyRows], width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL_BORDERS }),
      ] }] })
      await writeAndCheck(savePath, await Packer.toBase64String(doc))
    } else {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      doc.setFontSize(15); doc.setTextColor(30, 64, 175); doc.text(title, 14, 15)
      doc.setFontSize(9); doc.setTextColor(90); doc.text(subtitle, 14, 21)
      let startY = 26
      if (intro && intro.length) {
        doc.setFontSize(9.5); doc.setTextColor(30, 30, 30)
        let y = 28
        for (const para of intro) {
          const lines: string[] = doc.splitTextToSize(para, pageW - 28)
          for (const ln of lines) { doc.text(ln, 14, y); y += 4.6 }
          y += 2
        }
        startY = y + 3
      }
      autoTable(doc, {
        startY, head: [columns.map(c => c.header)], body: rows,
        styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [30, 64, 175], textColor: 255 }, alternateRowStyles: { fillColor: [240, 244, 255] },
        margin: { left: 14, right: 14 },
      })
      await writeAndCheck(savePath, arrayBufferToBase64(doc.output('arraybuffer')))
    }
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Massen-Scan (Benutzer -> Geraet) ─────────────────────────────────────────
export async function exportPresenceScan(rows: ScanRow[], meta: { createdAt: string; by: string }, format: ExportFormat) {
  const cols: Col[] = [
    { header: 'Status', width: 10 }, { header: 'Corp ID', width: 14 }, { header: 'Name', width: 28 },
    { header: 'Abteilung', width: 24 }, { header: 'Angemeldet', width: 12 }, { header: 'IP-Adresse', width: 16 },
    { header: 'Hostname', width: 22 }, { header: 'Zuweisung', width: 16 }, { header: 'Eigentlich zugewiesen an', width: 26 }, { header: 'Model-Typ', width: 18 }, { header: 'Abteilungsleiter', width: 20 }, { header: 'DNS', width: 14 },
  ]
  const assignLabel = (r: ScanRow) => r.assignmentStatus === 'ok' ? 'richtig' : r.assignmentStatus === 'mismatch' ? 'FALSCH' : 'nicht im Inventar'
  const leaderLabel = (r: ScanRow) => r.assignmentStatus !== 'mismatch' ? '' : r.leaderMatch === 'yes' ? 'Gerät des Abteilungsleiters' : r.leaderMatch === 'no' ? 'NICHT vom Abteilungsleiter' : r.leaderMatch === 'unknown' ? 'Leiter unbekannt' : ''
  const body = rows.map(r => [
    r.enabled ? 'Aktiv' : 'Inaktiv', r.sam, r.displayName, r.department ?? '',
    r.loggedIn ? 'Ja' : 'Nein', r.loggedIn ? r.ip : '', r.loggedIn ? r.hostname : '',
    r.loggedIn ? assignLabel(r) : '', r.loggedIn && r.assignmentStatus === 'mismatch' ? (r.assignedTo ?? '') : '',
    r.loggedIn ? (r.deviceType ?? '') : '',
    r.loggedIn ? leaderLabel(r) : '',
    r.loggedIn ? (r.dnsProblem ? 'DNS-Problem' : 'OK') : '',
  ])
  return exportTable({
    title: 'Wo angemeldet? — Massen-Scan',
    subtitle: `Erstellt: ${fmt(meta.createdAt)} · ${meta.by} · ${rows.filter(r => r.loggedIn).length} angemeldet von ${rows.length}`,
    baseName: `Anmeldungen_${stamp(meta.createdAt)}`,
    columns: cols, rows: body, format,
  })
}

// ── DNS-Check ────────────────────────────────────────────────────────────────
export async function exportPresenceDns(rows: DnsRow[], meta: { createdAt: string; by: string; mergedFrom?: number }, format: ExportFormat) {
  const cols: Col[] = [
    { header: 'Status', width: 22 }, { header: 'IP-Adresse', width: 18 }, { header: 'Hostname (PTR)', width: 38 }, { header: 'DNS -> IP', width: 18 },
  ]
  const body = rows.map(r => [DNS_LABEL[r.status], r.ip, r.host, r.fwdIp])
  const merged = meta.mergedFrom && meta.mergedFrom > 0
  return exportTable({
    title: merged ? 'DNS-Fehler — Sammelliste' : 'Wo angemeldet? — DNS-Check',
    subtitle: merged
      ? `Erstellt: ${fmt(meta.createdAt)} · ${meta.by} · zusammengeführt aus ${meta.mergedFrom} Protokollen · ${rows.length} DNS-Fehler (dedupliziert)`
      : `Erstellt: ${fmt(meta.createdAt)} · ${meta.by} · ${rows.filter(r => r.status !== 'OK').length} Probleme von ${rows.length} geprüft`,
    baseName: merged ? `DNS-Fehler_Sammelliste_${stamp(meta.createdAt)}` : `DNS-Check_${stamp(meta.createdAt)}`,
    columns: cols, rows: body, format,
  })
}

// ── WinRM/Kerberos-Erreichbarkeit (Forward/Reverse-DNS-Mismatch) ─────────────
const WINRM_LABEL: Record<WinrmDnsStatus, string> = {
  OK: 'OK', MISMATCH: 'PTR-MISMATCH', NO_A: 'NO A-RECORD', NO_PTR: 'NO PTR-RECORD',
}

// Englischer Erklaerungstext fuer die DNS-/Netzwerk-Abteilung (Weiterleitung).
function winrmIntro(): string[] {
  return [
    'SUBJECT: Forward/Reverse DNS inconsistency causing WinRM / Kerberos authentication failures (error 0x80090322).',
    'PROBLEM: The devices listed below are powered on and reachable on the network, but they cannot be managed remotely via WinRM/PowerShell Remoting. When connecting, Kerberos fails with "The request is not supported / An unknown security error occurred (0x80090322)".',
    'ROOT CAUSE: For each affected device the forward (A) and reverse (PTR) DNS records do not match. The hostname resolves via its A record to an IP address, but the PTR record of that same IP address points to a DIFFERENT hostname. Because Kerberos validates the service principal name (SPN) against the name returned by the reverse (PTR) lookup, the ticket does not match the target and the secure channel is rejected.',
    'EXAMPLE: Hostname "DE5CG4332XJ0" resolves (A record) to 10.170.35.13, but 10.170.35.13 resolves (PTR record) back to "DE5CG4474QNP". The two names are not identical, which breaks Kerberos authentication.',
    'ACTION REQUIRED: Please clean up the stale DNS entries so that forward and reverse records are consistent for every device below: the PTR record of the resolved IP address must return the same hostname as the A record. This typically means removing/updating outdated A and PTR records and enabling DNS scavenging so stale records are purged automatically. The "A-Record IP" and "PTR points to" columns show exactly where each record currently points.',
  ]
}

export async function exportPresenceWinrm(rows: WinrmDnsRow[], meta: { createdAt: string; by: string; mergedFrom?: number }, format: ExportFormat) {
  const cols: Col[] = [
    { header: 'Status', width: 18 }, { header: 'Hostname (device)', width: 30 }, { header: 'A-Record IP', width: 18 }, { header: 'PTR points to', width: 34 },
  ]
  const body = rows.map(r => [WINRM_LABEL[r.status], r.hostname, r.ip, r.ptr])
  const merged = meta.mergedFrom && meta.mergedFrom > 0
  return exportTable({
    title: merged ? 'WinRM/DNS errors — consolidated report' : 'Wo angemeldet? — WinRM/DNS-Erreichbarkeit',
    subtitle: merged
      ? `Created: ${fmt(meta.createdAt)} · ${meta.by} · consolidated from ${meta.mergedFrom} reports · ${rows.length} affected devices (deduplicated)`
      : `Created: ${fmt(meta.createdAt)} · ${meta.by} · ${rows.filter(r => r.status !== 'OK').length} affected of ${rows.length} checked`,
    baseName: merged ? `WinRM-DNS-Errors_consolidated_${stamp(meta.createdAt)}` : `WinRM-DNS-Check_${stamp(meta.createdAt)}`,
    columns: cols, rows: body, format,
    intro: winrmIntro(),
  })
}
