// ── VLAN-/Netzwerk-Export (Excel / PDF) ───────────────────────────────────────
// Exportiert die GESAMTE Netzwerk-Übersicht gruppiert nach VLAN/Subnetz: pro VLAN
// die Bezeichnung + Subnetz + Gateway, darunter alle IPs mit den zugeordneten
// Geräten (Hostname, PTR/DNS, NetBIOS, Benutzer, Typ/Geräteart, Bauform, offene Ports).
// Der Export ist zweisprachig (Deutsch / Englisch) — siehe TX + toEn().

import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import { normalizeCidr, ipToInt, findVlanDef, type VlanConfig, type VlanDef, type VlanDevice } from './vlans'
import { VLAN_CATALOG_2026 } from '../data/vlanSeed'

export type VlanExportFormat = 'excel' | 'pdf'
export type ExportLang = 'de' | 'en'

/** Angereicherte Info je IP (aus Scan + Port-/PTR-/NetBIOS-Check). */
export interface VlanExportDeviceInfo {
  type?: string        // sprechender Typ, z. B. "Drucker"
  kind?: string        // Geräteart aus dem Portprofil/SNMP
  formFactor?: string  // Bauform/Modelltyp aus der Endgeräte-Übersicht (Laptop Standard …)
  ptr?: string         // Reverse-DNS
  netbios?: string     // NetBIOS-Name
  ports?: string       // offene Ports
  mac?: string         // MAC-Adresse (eigenes Subnetz)
  vendor?: string      // Hersteller (MAC-OUI / SNMP)
  snmpName?: string    // SNMP sysName
  printerName?: string // Drucker-Name aus der Standort-Übersicht (per IP zugeordnet)
}

// ── Sprachtabellen ────────────────────────────────────────────────────────────
// Detail-Spalten (12 Feld-Spalten + „Bauform"). Reihenfolge MUSS zu deviceRow passen.
const DETAIL_COLS_DE = ['IP', 'Hostname', 'PTR (DNS)', 'NetBIOS', 'Benutzer', 'Online', 'Typ', 'Geräteart', 'Bauform', 'Offene Ports', 'MAC', 'Hersteller', 'SNMP-Name']
const DETAIL_COLS_EN = ['IP', 'Hostname', 'PTR (DNS)', 'NetBIOS', 'User', 'Online', 'Type', 'Device kind', 'Form factor', 'Open ports', 'MAC', 'Vendor', 'SNMP name']
const COL_WIDTHS = [16, 26, 30, 18, 20, 8, 14, 24, 18, 20, 18, 16, 26]

const TX = {
  de: {
    cols: DETAIL_COLS_DE,
    ovSheet: 'VLAN-Übersicht', detailSheet: 'Netzwerk',
    ovHeaders: ['VLAN-ID', 'Name', 'Subnetz', 'Gateway', 'Geräte gesamt', 'davon online'],
    ovNoSubnet: 'Ohne Subnetz', noSubnetGroup: 'Ohne Subnetz-Zuordnung',
    titlePrefix: 'Netzwerk-Übersicht', stand: 'Stand',
    pdfOv: ['VLAN-ID', 'Bezeichnung', 'Subnetz', 'Gateway', 'Geräte', 'online'],
    pdfSub: 'VLANs/Subnetze',
    noSubnet: 'kein Subnetz', gateway: 'Gateway', gwShort: 'GW', online: 'online',
    noDevices: '(keine Geräte gefunden / gescannt)',
    yes: 'ja', no: 'nein', locale: 'de-DE',
  },
  en: {
    cols: DETAIL_COLS_EN,
    ovSheet: 'VLAN Overview', detailSheet: 'Network',
    ovHeaders: ['VLAN ID', 'Name', 'Subnet', 'Gateway', 'Devices total', 'of which online'],
    ovNoSubnet: 'No subnet', noSubnetGroup: 'No subnet assignment',
    titlePrefix: 'Network overview', stand: 'As of',
    pdfOv: ['VLAN ID', 'Description', 'Subnet', 'Gateway', 'Devices', 'online'],
    pdfSub: 'VLANs/subnets',
    noSubnet: 'no subnet', gateway: 'Gateway', gwShort: 'GW', online: 'online',
    noDevices: '(no devices found / scanned)',
    yes: 'yes', no: 'no', locale: 'en-GB',
  },
} as const

// Übersetzung der erkannten Typ-/Geräteart-Texte (aus vlans.ts DEVICE_TYPE_LABEL +
// den kind-Literalen des Klassifizierers). Unbekannt → Originalstring (Fallback).
const TO_EN: Record<string, string> = {
  'Drucker': 'Printer',
  'Drucker (SNMP)': 'Printer (SNMP)',
  'Telefon (VoIP)': 'Phone (VoIP)',
  'PC/Laptop': 'PC/Laptop',
  'Server': 'Server',
  'Sonstiges': 'Other',
  'PC (Endnutzer)': 'PC (end user)',
  'PC/Server (RDP)': 'PC/Server (RDP)',
  'Windows-Geraet': 'Windows device',
  'Linux/Netzwerkgeraet (SSH)': 'Linux/network device (SSH)',
  'Netzwerkgeraet (Telnet)': 'Network device (Telnet)',
  'Web-verwaltetes Geraet': 'Web-managed device',
  'Kamera (RTSP)': 'Camera (RTSP)',
  'Kamera (SNMP)': 'Camera (SNMP)',
  'Switch/Netzwerk (SNMP)': 'Switch/network (SNMP)',
  'USV (SNMP)': 'UPS (SNMP)',
  'Access Point (SNMP)': 'Access point (SNMP)',
}
function toEn(s: string): string { return TO_EN[s] ?? s }

type Tx = (typeof TX)[ExportLang]

function fmtNow(locale: string): string {
  return new Date().toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function sanitize(s: string): string { return s.replace(/[\\/:*?"<>|]/g, '_') }

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

interface Group { def?: VlanDef; cidr: string; title: string; devices: VlanDevice[]; present: boolean }

function groupLabel(def: VlanDef | undefined, cidr: string): string {
  if (!def) return cidr || 'Ohne Subnetz-Zuordnung'
  const parts = [def.vlanId ? `VLAN ${def.vlanId}` : '', def.name || ''].filter(Boolean)
  return parts.length ? parts.join(' — ') : cidr
}

function buildGroups(config: VlanConfig, devices: VlanDevice[]): Group[] {
  // "present" = kommt aus Config oder Scan (= relevant fürs Detailblatt).
  const presentCidrs = new Set<string>()
  for (const v of config.vlans) { const n = normalizeCidr(v.cidr); if (n) presentCidrs.add(n) }
  for (const d of devices) { if (d.cidr) presentCidrs.add(d.cidr) }
  // Zusätzlich ALLE aktuellen Katalog-VLANs (damit die Übersicht auf Seite 1 vollständig ist).
  const allCidrs = new Set(presentCidrs)
  for (const c of VLAN_CATALOG_2026) { const n = normalizeCidr(c.cidr || ''); if (n) allCidrs.add(n) }

  const groups: Group[] = []
  for (const cidr of allCidrs) {
    const def = findVlanDef(cidr, config)   // Config zuerst, sonst Katalog -> VLAN-ID/Name/Gateway auch ohne Import
    const devs = devices.filter(d => d.cidr === cidr).sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip))
    groups.push({ def, cidr, title: groupLabel(def, cidr), devices: devs, present: presentCidrs.has(cidr) })
  }
  const noCidr = devices.filter(d => !d.cidr).sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip))
  if (noCidr.length) groups.push({ cidr: '', title: 'Ohne Subnetz-Zuordnung', devices: noCidr, present: true })

  groups.sort((a, b) => {
    const na = a.def?.vlanId ? Number(a.def.vlanId) : Infinity
    const nb = b.def?.vlanId ? Number(b.def.vlanId) : Infinity
    if (na !== nb) return (na || Infinity) - (nb || Infinity)
    return (a.cidr || '').localeCompare(b.cidr || '')
  })
  return groups
}

// Gruppen-Titel sprachabhängig (nur der „ohne Subnetz"-Fall ist deutschsprachig fix).
function titleOf(g: Group, t: Tx): string {
  return g.cidr ? g.title : t.noSubnetGroup
}

function deviceRow(d: VlanDevice, infoOf: (ip: string) => VlanExportDeviceInfo, lang: ExportLang): string[] {
  const i = infoOf(d.ip)
  const t = TX[lang]
  const tr = lang === 'en' ? toEn : (s: string) => s
  return [
    d.ip, d.hostname || i.printerName || '', i.ptr || '', i.netbios || '', d.user || '',
    d.online ? t.yes : t.no, tr(i.type || ''), tr(i.kind || ''), i.formFactor || '',
    i.ports || '', i.mac || '', i.vendor || '', i.snmpName || '',
  ]
}

// ── Excel ─────────────────────────────────────────────────────────────────────
async function buildExcel(groups: Group[], infoOf: (ip: string) => VlanExportDeviceInfo, site: string, lang: ExportLang): Promise<string> {
  const t = TX[lang]
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'; wb.created = new Date()

  // 1) Übersichtsblatt
  const ovWidths = [10, 28, 20, 16, 14, 14]
  const ov = wb.addWorksheet(t.ovSheet)
  ov.columns = t.ovHeaders.map((header, i) => ({ header, width: ovWidths[i] || 14 }))
  ov.getRow(1).font = { bold: true }
  for (const g of groups) {
    ov.addRow([g.def?.vlanId || '', g.def?.name || (g.cidr ? '' : t.ovNoSubnet), g.cidr || '—', g.def?.gateway || '', g.devices.length, g.devices.filter(d => d.online).length])
  }

  // 2) Detailblatt – gruppiert nach VLAN
  const ws = wb.addWorksheet(t.detailSheet)
  ws.columns = t.cols.map((h, i) => ({ header: h, width: COL_WIDTHS[i] || 16 }))
  ws.spliceRows(1, 1) // Header pro Gruppe statt global
  const lastCol = t.cols.length

  ws.addRow([`${t.titlePrefix} ${site ? '(' + site + ')' : ''} — ${t.stand} ${fmtNow(t.locale)}`])
  ws.mergeCells(ws.rowCount, 1, ws.rowCount, lastCol)
  ws.getRow(ws.rowCount).font = { bold: true, size: 13 }
  ws.addRow([])

  for (const g of groups.filter(x => x.present || x.devices.length > 0)) {
    const online = g.devices.filter(d => d.online).length
    const titleRow = ws.addRow([`${titleOf(g, t)}    ·    ${g.cidr || t.noSubnet}${g.def?.gateway ? '    ·    ' + t.gateway + ' ' + g.def.gateway : ''}    ·    ${online}/${g.devices.length} ${t.online}`])
    ws.mergeCells(titleRow.number, 1, titleRow.number, lastCol)
    titleRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }

    const hdr = ws.addRow([...t.cols])
    hdr.font = { bold: true }
    hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5EAF2' } }

    if (g.devices.length === 0) {
      ws.addRow([t.noDevices])
    } else {
      for (const d of g.devices) ws.addRow(deviceRow(d, infoOf, lang))
    }
    ws.addRow([])
  }

  const buf = await wb.xlsx.writeBuffer()
  return arrayBufferToBase64(buf as ArrayBuffer)
}

// ── PDF ────────────────────────────────────────────────────────────────────────
function buildPdf(groups: Group[], infoOf: (ip: string) => VlanExportDeviceInfo, site: string, lang: ExportLang): string {
  const t = TX[lang]
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  doc.setFontSize(15); doc.text(`${t.titlePrefix}${site ? ' – ' + site : ''}`, 40, 40)
  doc.setFontSize(9); doc.setTextColor(120)
  doc.text(`${t.stand}: ${fmtNow(t.locale)}  ·  ${groups.length} ${t.pdfSub}`, 40, 56)
  doc.setTextColor(0)

  // Seite 1: VLAN-Übersicht (alle VLANs mit Subnetz, Bezeichnung, Gateway, Geräteanzahl)
  autoTable(doc, {
    head: [t.pdfOv as unknown as string[]],
    body: groups.map(g => [g.def?.vlanId || '', g.def?.name || (g.cidr ? '' : t.ovNoSubnet), g.cidr || '—', g.def?.gateway || '', String(g.devices.length), String(g.devices.filter(d => d.online).length)]),
    startY: 72,
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [244, 247, 251] },
    margin: { left: 40, right: 40 },
  })

  // Ab Seite 2: Detail je VLAN (nur VLANs mit Geräten / in der Config)
  doc.addPage()
  let y = 46
  for (const g of groups.filter(x => x.present || x.devices.length > 0)) {
    const online = g.devices.filter(d => d.online).length
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 46 }
    doc.setFontSize(10.5); doc.setFont('helvetica', 'bold')
    doc.text(`${titleOf(g, t)}`, 40, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90)
    doc.text(`${g.cidr || t.noSubnet}${g.def?.gateway ? '  ·  ' + t.gwShort + ' ' + g.def.gateway : ''}  ·  ${online}/${g.devices.length} ${t.online}`, 40, y + 13)
    doc.setTextColor(0)

    const body = g.devices.length ? g.devices.map(d => deviceRow(d, infoOf, lang)) : [['—', t.noDevices, ...Array(t.cols.length - 2).fill('')]]
    autoTable(doc, {
      head: [t.cols as unknown as string[]], body,
      startY: y + 20,
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 7 },
      alternateRowStyles: { fillColor: [244, 247, 251] },
      margin: { left: 40, right: 40 },
      tableWidth: pageW - 80,
    })
    // @ts-expect-error – jspdf-autotable ergänzt lastAutoTable zur Laufzeit
    y = (doc.lastAutoTable?.finalY ?? y + 40) + 22
  }
  return doc.output('datauristring').split(',')[1]
}

// ── Öffentlich ─────────────────────────────────────────────────────────────────
export async function exportVlanNetwork(
  format: VlanExportFormat,
  config: VlanConfig,
  devices: VlanDevice[],
  infoOf: (ip: string) => VlanExportDeviceInfo,
  lang: ExportLang = 'de',
): Promise<{ ok: boolean; error?: string; path?: string }> {
  try {
    const groups = buildGroups(config, devices)
    if (groups.length === 0) return { ok: false, error: 'Keine VLANs/Geräte zum Exportieren.' }
    const site = config.site || ''
    const stamp = new Date().toISOString().slice(0, 10)
    const ext = format === 'excel' ? 'xlsx' : 'pdf'
    const base = sanitize(`Netzwerk_VLAN_Uebersicht_${stamp}${lang === 'en' ? '_EN' : ''}`)
    const path = await api().saveFileDialog(`${base}.${ext}`, [{ name: format === 'excel' ? 'Excel' : 'PDF', extensions: [ext] }])
    if (!path) return { ok: false }   // abgebrochen
    const b64 = format === 'excel' ? await buildExcel(groups, infoOf, site, lang) : buildPdf(groups, infoOf, site, lang)
    await writeAndCheck(path, b64)
    return { ok: true, path }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
