import { api } from '../electronAPI'

export interface PhoneCheckEntry {
  inputNumber: string
  found: boolean
  displayName?: string
  samAccountName?: string
  matchedField?: string
  matchedValue?: string
}

export const PHONE_FIELD_LABELS: Record<string, string> = {
  telephoneNumber:  'Telefonnummer',
  mobile:           'Mobil',
  otherTelephone:   'Weitere Telefonnummern',
  otherMobile:      'Weitere Mobilnummern',
  ipPhone:          'IP-Telefon',
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Strips all formatting chars from a phone number and normalises the country
 * code so that DE numbers always start with "49…".
 *
 * Examples (all → 49403012345):
 *   +49 40 3012345 | 0049 40 3012345 | (+49) 40 3012345
 *   040 3012345    | 040/3012345
 */
export function normalizePhone(raw: string): string {
  if (!raw || !raw.trim()) return ''
  // Keep only digits and the leading + sign
  let s = raw.replace(/[^0-9+]/g, '')
  if (!s) return ''

  if (s.startsWith('+49'))        s = '49' + s.slice(3)
  else if (s.startsWith('0049'))  s = '49' + s.slice(4)
  else if (s.startsWith('0'))     s = '49' + s.slice(1)

  return s
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toArr(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return (v as unknown[]).filter(Boolean).map(String)
  if (typeof v === 'string') return v ? [v] : []
  return []
}

interface ADUserRecord {
  DisplayName?: string
  SamAccountName?: string
  telephoneNumber?: unknown
  mobile?: unknown
  ipPhone?: unknown
  otherTelephoneJoined?: string
  otherMobileJoined?: string
}

// ── AD Query ──────────────────────────────────────────────────────────────────

/**
 * Fetches all enabled AD users with phone attributes, then matches each
 * input number against the normalised AD values.
 *
 * AD numbers are stored in formats like "(+49) 40 3012345" – normalised
 * they become "49403012345", same as a user-entered "040 3012345".
 */
export async function checkPhoneNumbers(numbers: string[]): Promise<PhoneCheckEntry[]> {
  if (numbers.length === 0) return []

  // Single PS call – fetch all active users with phone fields.
  // Multi-value attributes (otherTelephone, otherMobile) are joined with "||"
  // to survive ConvertTo-Json flattening quirks.
  const ps = [
    'try {',
    '  Get-ADUser -Filter {Enabled -eq $true}',
    '    -Properties telephoneNumber,mobile,otherTelephone,otherMobile,ipPhone,DisplayName,SamAccountName',
    '    -ErrorAction Stop |',
    '  Select-Object DisplayName,SamAccountName,telephoneNumber,mobile,ipPhone,',
    '    @{N="otherTelephoneJoined";E={if($_.otherTelephone){$_.otherTelephone -join "||"}else{""}}},',
    '    @{N="otherMobileJoined";E={if($_.otherMobile){$_.otherMobile -join "||"}else{""}}} |',
    '  ConvertTo-Json -Compress',
    '} catch { "[]" }',
  ].join(' ')

  const result = await api().runPowerShell(ps, 90000)

  let users: ADUserRecord[] = []
  try {
    const raw = JSON.parse(result.stdout || '[]')
    users = Array.isArray(raw) ? raw : (raw ? [raw as ADUserRecord] : [])
  } catch {
    throw new Error('AD-Antwort konnte nicht verarbeitet werden. Bitte sicherstellen, dass das Active Directory Modul verfügbar ist.')
  }

  // Build normalised-number → {name, sam, field, raw-value} lookup
  const lookup = new Map<string, { name: string; sam: string; field: string; value: string }>()

  for (const u of users) {
    const name = u.DisplayName || u.SamAccountName || ''
    const sam  = u.SamAccountName || ''

    const fields: [string, string[]][] = [
      ['telephoneNumber', toArr(u.telephoneNumber)],
      ['mobile',          toArr(u.mobile)],
      ['ipPhone',         toArr(u.ipPhone)],
      ['otherTelephone',  (u.otherTelephoneJoined || '').split('||').filter(Boolean)],
      ['otherMobile',     (u.otherMobileJoined    || '').split('||').filter(Boolean)],
    ]

    for (const [field, values] of fields) {
      for (const val of values) {
        const norm = normalizePhone(val)
        if (norm && !lookup.has(norm)) {
          lookup.set(norm, { name, sam, field, value: val })
        }
      }
    }
  }

  // Match each input number
  return numbers.map((num) => {
    const norm = normalizePhone(num)
    const hit  = norm ? lookup.get(norm) : undefined
    if (hit) {
      return {
        inputNumber:    num,
        found:          true,
        displayName:    hit.name,
        samAccountName: hit.sam,
        matchedField:   hit.field,
        matchedValue:   hit.value,
      }
    }
    return { inputNumber: num, found: false }
  })
}
