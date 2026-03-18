import { api } from '../electronAPI'

export interface XelionResult {
  name: string
  telephoneNumber: string
  mobile: string
  ipPhone: string
  pwdLastSet: string
  hasXelion: boolean
  hasMobile: boolean
}

export async function queryXelionUser(nameOrId: string, adDomain: string): Promise<XelionResult> {
  const ps = `
    try {
      $u = Get-ADUser -Filter {(SamAccountName -eq "${nameOrId}") -or (DisplayName -eq "${nameOrId}")} \`
           -Properties telephoneNumber,mobile,ipPhone,pwdLastSet -ErrorAction Stop | Select-Object -First 1
      if ($u) {
        [PSCustomObject]@{
          Name             = $u.Name
          SamAccountName   = $u.SamAccountName
          telephoneNumber  = $u.telephoneNumber
          mobile           = $u.mobile
          ipPhone          = $u.ipPhone
          pwdLastSet       = [DateTime]::FromFileTime($u.pwdLastSet).ToString("dd.MM.yyyy HH:mm:ss")
        } | ConvertTo-Json -Compress
      } else { '{"error":"Benutzer nicht gefunden"}' }
    } catch { '{"error":"' + $_.Exception.Message + '"}' }
  `
  const result = await api().runPowerShell(ps, 15000)
  try {
    const data = JSON.parse(result.stdout || '{}')
    if (data.error) throw new Error(data.error)
    return {
      name: data.Name ?? nameOrId,
      telephoneNumber: data.telephoneNumber ?? '',
      mobile: data.mobile ?? '',
      ipPhone: data.ipPhone ?? '',
      pwdLastSet: data.pwdLastSet ?? '',
      hasXelion: !!data.telephoneNumber,
      hasMobile: !!data.mobile,
    }
  } catch {
    throw new Error(result.stderr || 'Abfrage fehlgeschlagen')
  }
}

export async function queryAllEmployees(location: string, adDomain: string): Promise<XelionResult[]> {
  const ps = `
    try {
      Get-ADUser -Filter {Office -like "*${location}*"} \`
        -Properties telephoneNumber,mobile,ipPhone,pwdLastSet,Office -ErrorAction Stop |
      Select-Object Name,SamAccountName,telephoneNumber,mobile,ipPhone,
        @{N="pwdLastSet";E={[DateTime]::FromFileTime($_.pwdLastSet).ToString("dd.MM.yyyy HH:mm:ss")}},Office |
      ConvertTo-Json -Compress
    } catch { '[]' }
  `
  const result = await api().runPowerShell(ps, 30000)
  try {
    const data = JSON.parse(result.stdout || '[]')
    const arr: unknown[] = Array.isArray(data) ? data : [data]
    return arr.map((d: unknown) => {
      const item = d as Record<string, string>
      return {
        name: item['Name'] ?? '',
        telephoneNumber: item['telephoneNumber'] ?? '',
        mobile: item['mobile'] ?? '',
        ipPhone: item['ipPhone'] ?? '',
        pwdLastSet: item['pwdLastSet'] ?? '',
        hasXelion: !!item['telephoneNumber'],
        hasMobile: !!item['mobile'],
      }
    })
  } catch {
    return []
  }
}
