import { api } from '../electronAPI'

export interface XelionResult {
  name: string
  // Allgemein/General tab — this is the Xelion "Rufnummer" field
  telephoneNumber: string
  // Rufnummern tab — any of these means a phone number exists outside of Xelion
  mobile: string
  ipPhone: string
  pager: string
  homePhone: string
  facsimileTelephoneNumber: string
  pwdLastSet: string
  // true  = telephoneNumber (Allgemein) is set → user has a Xelion account number
  hasXelion: boolean
  // true  = at least one entry in the "Rufnummern" tab fields
  //         (mobile | pager | homePhone | facsimileTelephoneNumber | ipPhone)
  hasAnyPhone: boolean
}

// AD attributes that make up the "Rufnummern" tab in ADUC
const PHONE_ATTRS = ['mobile', 'pager', 'homePhone', 'facsimileTelephoneNumber', 'ipPhone']

function mapUser(d: Record<string, string>): XelionResult {
  const mobile = d['mobile'] ?? ''
  const pager = d['pager'] ?? ''
  const homePhone = d['homePhone'] ?? ''
  const fax = d['facsimileTelephoneNumber'] ?? ''
  const ipPhone = d['ipPhone'] ?? ''

  return {
    name: d['Name'] ?? d['SamAccountName'] ?? '',
    telephoneNumber: d['telephoneNumber'] ?? '',
    mobile,
    ipPhone,
    pager,
    homePhone,
    facsimileTelephoneNumber: fax,
    pwdLastSet: d['pwdLastSet'] ?? '',
    hasXelion: !!(d['telephoneNumber'] ?? '').trim(),
    hasAnyPhone: !!(mobile || pager || homePhone || fax || ipPhone),
  }
}

export async function queryXelionUser(nameOrId: string, _adDomain: string): Promise<XelionResult> {
  const ps = `
    try {
      $u = Get-ADUser -Filter {((SamAccountName -eq "${nameOrId}") -or (DisplayName -eq "${nameOrId}")) -and (Enabled -eq $true)} \`
           -Properties telephoneNumber,mobile,pager,homePhone,facsimileTelephoneNumber,ipPhone,pwdLastSet,Enabled \`
           -ErrorAction Stop | Select-Object -First 1
      if ($u) {
        [PSCustomObject]@{
          Name                       = $u.Name
          SamAccountName             = $u.SamAccountName
          telephoneNumber            = $u.telephoneNumber
          mobile                     = $u.mobile
          pager                      = $u.pager
          homePhone                  = $u.homePhone
          facsimileTelephoneNumber   = $u.facsimileTelephoneNumber
          ipPhone                    = $u.ipPhone
          pwdLastSet                 = [DateTime]::FromFileTime($u.pwdLastSet).ToString("dd.MM.yyyy HH:mm:ss")
        } | ConvertTo-Json -Compress
      } else { '{"error":"Benutzer nicht gefunden"}' }
    } catch { '{"error":"' + $_.Exception.Message + '"}' }
  `
  const result = await api().runPowerShell(ps, 15000)
  try {
    const data = JSON.parse(result.stdout || '{}')
    if (data.error) throw new Error(data.error)
    return mapUser(data as Record<string, string>)
  } catch {
    throw new Error(result.stderr || 'Abfrage fehlgeschlagen')
  }
}

export async function queryAllEmployees(location: string, _adDomain: string): Promise<XelionResult[]> {
  const ps = `
    try {
      Get-ADUser -Filter {(Office -like "*${location}*") -and (Enabled -eq $true)} \`
        -Properties telephoneNumber,mobile,pager,homePhone,facsimileTelephoneNumber,ipPhone,pwdLastSet,Office,Enabled \`
        -ErrorAction Stop |
      Select-Object Name,SamAccountName,telephoneNumber,mobile,pager,homePhone,facsimileTelephoneNumber,ipPhone,
        @{N="pwdLastSet";E={[DateTime]::FromFileTime($_.pwdLastSet).ToString("dd.MM.yyyy HH:mm:ss")}},Office |
      ConvertTo-Json -Compress
    } catch { '[]' }
  `
  const result = await api().runPowerShell(ps, 30000)
  try {
    const data = JSON.parse(result.stdout || '[]')
    const arr: unknown[] = Array.isArray(data) ? data : [data]
    return arr.map((d) => mapUser(d as Record<string, string>))
  } catch {
    return []
  }
}
