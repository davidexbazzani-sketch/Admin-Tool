import * as XLSX from 'xlsx'
import { api } from '../electronAPI'

const HOSTNAME_KEYWORDS = ['hostname', 'pc-name', 'pcname', 'computer', 'device', 'name', 'host']
const SERIAL_KEYWORDS = ['serial', 'seriennummer', 'sn', 'asset', 'serialnumber', 'serial number']

// ── Browser-compatible base64 → Uint8Array ────────────────────────────────────
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// Convert column index (0-based) to Excel letter: 0→A, 25→Z, 26→AA …
function indexToLetter(idx: number): string {
  let result = ''
  let n = idx
  do {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return result
}

function fuzzyMatch(colName: string, keywords: string[]): boolean {
  const lower = colName.toLowerCase().replace(/[\s_\-]/g, '')
  return keywords.some((k) => lower.includes(k.replace(/[\s_\-]/g, '')))
}

function extractFromText(text: string): { hostnames: string[]; serials: string[] } {
  const hostnameRx = /\b([A-Z]{2,8}\d{6,12})\b/g
  const serialRx = /\b([A-Z0-9]{8,15})\b/g
  const hostnames = Array.from(new Set([...text.matchAll(hostnameRx)].map((m) => m[1])))
  const allAlphaNum = Array.from(new Set([...text.matchAll(serialRx)].map((m) => m[1])))
  const serials = allAlphaNum.filter((v) => !hostnames.includes(v))
  return { hostnames, serials }
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ExcelColumn {
  letter: string    // A, B, C, AA …
  name: string      // actual header text from the sheet
  preview: string[] // first 3 non-empty cell values
  // auto-detected role (can be overridden by user in the dialog)
  detectedAs: 'hostname' | 'serial' | 'ignore'
}

export interface ExcelSheetData {
  columns: ExcelColumn[]
  rows: Record<string, unknown>[]
}

export interface FileOpenResult {
  filePath: string
  ext: string
  bytes: Uint8Array
}

// ── Step 1: open dialog + read bytes ─────────────────────────────────────────
export async function openFileForImport(): Promise<FileOpenResult | null> {
  const filePath = await api().openFileDialog([
    { name: 'Unterstützte Dateien', extensions: ['xlsx', 'xls', 'csv', 'docx', 'pdf'] },
  ])
  if (!filePath) return null

  const readResult = await api().readFile(filePath)
  if (!readResult.success || !readResult.data) {
    throw new Error(readResult.error ?? 'Datei konnte nicht gelesen werden')
  }

  const ext = filePath.toLowerCase().split('.').pop() ?? ''
  const bytes = base64ToUint8Array(readResult.data)
  return { filePath, ext, bytes }
}

// ── Step 2a (Excel/CSV): parse sheet → columns + rows ────────────────────────
export function parseExcelSheet(bytes: Uint8Array): ExcelSheetData {
  const wb = XLSX.read(bytes, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]

  if (rows.length === 0) return { columns: [], rows: [] }

  const colNames = Object.keys(rows[0])
  const columns: ExcelColumn[] = colNames.map((name, idx) => {
    const preview = rows
      .slice(0, 5)
      .map((r) => String(r[name] ?? '').trim())
      .filter(Boolean)
      .slice(0, 3)

    let detectedAs: ExcelColumn['detectedAs'] = 'ignore'
    if (fuzzyMatch(name, HOSTNAME_KEYWORDS)) detectedAs = 'hostname'
    else if (fuzzyMatch(name, SERIAL_KEYWORDS)) detectedAs = 'serial'

    return { letter: indexToLetter(idx), name, preview, detectedAs }
  })

  return { columns, rows }
}

// ── Step 2b: extract final lists from user-selected column roles ──────────────
export function extractFromExcel(
  rows: Record<string, unknown>[],
  hostnameColNames: string[],
  serialColNames: string[],
  assignedToColNames?: string[]
): { hostnames: string[]; serials: string[]; assignedToMap: Record<string, string> } {
  const hostnameCol = hostnameColNames[0] ?? ''
  const assignedCol = (assignedToColNames ?? [])[0] ?? ''

  // Build map: hostname → assignedTo
  const assignedToMap: Record<string, string> = {}
  if (hostnameCol && assignedCol) {
    for (const row of rows) {
      const hn = String(row[hostnameCol] ?? '').trim()
      const at = String(row[assignedCol] ?? '').trim()
      if (hn && at) assignedToMap[hn] = at
    }
  }

  const hostnames = [
    ...new Set(
      hostnameColNames.flatMap((col) =>
        rows.map((r) => String(r[col] ?? '').trim()).filter(Boolean)
      )
    ),
  ]
  const serials = [
    ...new Set(
      serialColNames.flatMap((col) =>
        rows.map((r) => String(r[col] ?? '').trim()).filter(Boolean)
      )
    ),
  ]
  return { hostnames, serials, assignedToMap }
}

// ── Step 2c (PDF/DOCX): text extraction ──────────────────────────────────────
export function extractFromTextBytes(bytes: Uint8Array): { hostnames: string[]; serials: string[] } {
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes)
    .replace(/[^\x20-\x7E\n]/g, ' ')
  return extractFromText(text)
}

// ── Phone number extraction (for PhoneCheck import) ───────────────────────────

/**
 * Extracts likely German phone numbers from raw text bytes.
 * Matches strings starting with country codes (+49, 0049, (+49)) or
 * a local leading zero, followed by digits/formatting chars.
 */
export function extractPhoneNumbersFromText(bytes: Uint8Array): string[] {
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes)
    .replace(/[^\x20-\x7EÄÖÜäöüß\n\r]/g, ' ')

  // Match: +49..., 0049..., (+49)..., or word-boundary 0[1-9]...
  const phoneRx = /(?:\+49|0049|\(\+49\)|\b0[1-9])[\d\s\-\.\/\(\)]{4,25}/g
  const raw = [...text.matchAll(phoneRx)].map((m) => m[0].trim())

  // Deduplicate and keep only entries with at least 6 digits
  return [...new Set(raw)].filter((p) => p.replace(/\D/g, '').length >= 6)
}

/**
 * Extracts phone number values from chosen Excel columns.
 * Values are filtered to those containing at least 5 digits.
 */
export function extractPhonesFromExcel(
  rows: Record<string, unknown>[],
  phoneColNames: string[]
): string[] {
  const values = [
    ...new Set(
      phoneColNames.flatMap((col) =>
        rows.map((r) => String(r[col] ?? '').trim()).filter(Boolean)
      )
    ),
  ]
  return values.filter((v) => v.replace(/\D/g, '').length >= 5)
}
