// ── Import der Netzdienstleister-Excel (DEHAM.xlsx) ───────────────────────────
// Übernimmt den STABILEN Teil der Netzdoku in die VLAN-Übersicht: VLAN-ID, Name,
// Gateway und Subnetz je VLAN (Blatt „VLAN Subnet details"). Die dynamische
// ARP-/Geräte-Zuordnung wird bewusst NICHT importiert (die bleibt live aus dem
// Scan). Die Datei liegt fest auf der Freigabe unter network/DEHAM.xlsx und kann
// vom Nutzer bei neuen Exporten einfach ersetzt werden.

import ExcelJS from 'exceljs'
import { api } from '../electronAPI'
import { normalizeCidr } from './vlans'

export const VLAN_EXCEL_PATH = 'network/DEHAM.xlsx'

export interface VlanTopologyEntry { vlanId: string; name: string; cidr: string; gateway?: string }
export interface VlanImportResult { ok: boolean; entries: VlanTopologyEntry[]; note?: string; error?: string }

function firstIpv4(s: string): string {
  const m = (s || '').match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)
  return m ? m[0] : ''
}
function cellText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] }
    if (o.richText) return o.richText.map(r => r.text).join('')
    if (o.text) return o.text
    if (o.result != null) return String(o.result)
    return ''
  }
  return String(v)
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

/**
 * Liest network/DEHAM.xlsx von der Freigabe und parst das Blatt „VLAN Subnet
 * details" → autoritative VLAN-Topologie (ID, Name, Gateway, Subnetz).
 */
export async function importVlanTopology(): Promise<VlanImportResult> {
  let b64: string | null
  try { b64 = await api().netReadRawFile(VLAN_EXCEL_PATH) } catch { b64 = null }
  if (!b64) return { ok: false, entries: [], error: `DEHAM.xlsx nicht gefunden — bitte die Datei in den Tool-Netzordner legen (…\\Tool IT\\${VLAN_EXCEL_PATH.replace(/\//g, '\\')}).` }

  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(base64ToUint8(b64) as unknown as Parameters<typeof wb.xlsx.load>[0]) } catch (e) {
    return { ok: false, entries: [], error: 'Excel konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : String(e)) }
  }

  // Blatt „VLAN Subnet details" (tolerant: exakt, sonst per Namensteil).
  const ws = wb.getWorksheet('VLAN Subnet details')
    || wb.worksheets.find(w => /subnet/i.test(w.name) && /vlan/i.test(w.name))
    || wb.worksheets.find(w => /subnet/i.test(w.name))
  if (!ws) return { ok: false, entries: [], error: 'Blatt „VLAN Subnet details" nicht in der Excel gefunden.' }

  const entries: VlanTopologyEntry[] = []
  let bigSubnet = 0
  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn === 1) return   // Kopfzeile
    const vals = (row.values as unknown[]).slice(1)
    const vlanId = cellText(vals[0]).trim()
    const name = cellText(vals[1]).trim()
    const gateway = firstIpv4(cellText(vals[2]))
    const cidr = normalizeCidr(cellText(vals[3]).trim())
    if (!/^\d+$/.test(vlanId) || !cidr) return
    const bits = parseInt(cidr.split('/')[1] || '32', 10)
    if (bits < 20) bigSubnet++   // sehr großes Netz (z. B. /10) — Scan wird gekappt
    entries.push({ vlanId, name, cidr, gateway: gateway || undefined })
  })

  if (entries.length === 0) return { ok: false, entries: [], error: 'Keine gültigen VLAN-/Subnetz-Zeilen im Blatt „VLAN Subnet details" gefunden.' }
  const note = bigSubnet > 0 ? `${bigSubnet} sehr großes Subnetz (z. B. /10) — der Scan begrenzt hier automatisch auf max. 8192 IPs.` : undefined
  return { ok: true, entries, note }
}
