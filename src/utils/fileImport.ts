import * as XLSX from 'xlsx'
import { api } from '../electronAPI'

const HOSTNAME_KEYWORDS = ['hostname', 'pc-name', 'pcname', 'computer', 'device', 'name', 'host']
const SERIAL_KEYWORDS = ['serial', 'seriennummer', 'sn', 'asset', 'serialnumber', 'serial number']

function fuzzyMatch(colName: string, keywords: string[]): boolean {
  const lower = colName.toLowerCase().replace(/[\s_\-]/g, '')
  return keywords.some((k) => lower.includes(k.replace(/[\s_\-]/g, '')))
}

function extractFromText(text: string): { hostnames: string[]; serials: string[] } {
  // Hostname pattern: 2-8 uppercase letters followed by 6-12 alphanumeric chars
  const hostnameRx = /\b([A-Z]{2,8}\d{6,12})\b/g
  // Serial pattern: pure alphanumeric 8-15 chars (no prefix pattern)
  const serialRx = /\b([A-Z0-9]{8,15})\b/g

  const hostnames = Array.from(new Set([...text.matchAll(hostnameRx)].map((m) => m[1])))
  const allAlphaNum = Array.from(new Set([...text.matchAll(serialRx)].map((m) => m[1])))
  const serials = allAlphaNum.filter((v) => !hostnames.includes(v))

  return { hostnames, serials }
}

export async function importFile(): Promise<{ hostnames: string[]; serials: string[] }> {
  const filePath = await api().openFileDialog([
    { name: 'Unterstützte Dateien', extensions: ['xlsx', 'xls', 'csv', 'docx', 'pdf'] },
  ])
  if (!filePath) return { hostnames: [], serials: [] }

  const readResult = await api().readFile(filePath)
  if (!readResult.success || !readResult.data) {
    throw new Error(readResult.error ?? 'Datei konnte nicht gelesen werden')
  }

  const ext = filePath.toLowerCase().split('.').pop() ?? ''
  const buf = Buffer.from(readResult.data, 'base64')

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    return parseExcelCsv(buf, ext)
  }

  if (ext === 'pdf' || ext === 'docx') {
    // For PDF/DOCX in renderer, we do basic text extraction from buffer
    const text = buf.toString('utf-8').replace(/[^\x20-\x7E\n]/g, ' ')
    return extractFromText(text)
  }

  throw new Error(`Nicht unterstütztes Dateiformat: .${ext}`)
}

async function parseExcelCsv(
  buf: Buffer,
  ext: string
): Promise<{ hostnames: string[]; serials: string[] }> {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  if (rows.length === 0) return { hostnames: [], serials: [] }

  const columns = Object.keys(rows[0])

  // Auto-detect
  const hostnameCol = columns.find((c) => fuzzyMatch(c, HOSTNAME_KEYWORDS))
  const serialCol = columns.find((c) => fuzzyMatch(c, SERIAL_KEYWORDS))

  if (hostnameCol || serialCol) {
    const hostnames = hostnameCol
      ? rows.map((r) => String(r[hostnameCol] ?? '').trim()).filter(Boolean)
      : []
    const serials = serialCol
      ? rows.map((r) => String(r[serialCol] ?? '').trim()).filter(Boolean)
      : []
    return { hostnames, serials }
  }

  // No auto-detection — ask user via a simple prompt (in a real app this would be a dialog)
  // For now, pick the first column as hostnames
  const firstCol = columns[0]
  const values = rows.map((r) => String(r[firstCol] ?? '').trim()).filter(Boolean)
  // Heuristic: if values look like serials (no alpha prefix), treat as serials
  const looksLikeSerial = values.every((v) => /^\d/.test(v))
  return looksLikeSerial
    ? { hostnames: [], serials: values }
    : { hostnames: values, serials: [] }
}
