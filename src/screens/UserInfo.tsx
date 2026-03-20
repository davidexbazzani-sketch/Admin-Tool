import { useState, useRef } from 'react'
import {
  Plus, Minus, Upload, Search, Monitor, CheckSquare, Square,
  Loader, AlertCircle, CheckCircle, Users, FileSpreadsheet,
  FileText, File, ChevronDown, Mail,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import type { DeviceEntry, UserProfileData } from '../types'
import Card from '../components/Card'
import ExcelColumnDialog from '../components/ExcelColumnDialog'
import UserProfileAccordion from '../components/UserProfileAccordion'
import {
  openFileForImport, parseExcelSheet, extractFromExcel, extractFromTextBytes,
  type ExcelSheetData, type FileOpenResult,
} from '../utils/fileImport'
import { exportExcelUserProfiles, exportWordUserProfiles, exportPdfUserProfiles } from '../utils/exportUtils'
import { api } from '../electronAPI'
import type { CandidateUser } from '../utils/adSearchUtils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserEntry { id: string; value: string }

interface UserInfoResult {
  id: string
  inputValue: string
  status: 'pending' | 'loading' | 'done' | 'error' | 'disambig'
  data?: UserProfileData
  error?: string
  technicalDetail?: string
  candidates?: CandidateUser[]
}

// ── PowerShell query ───────────────────────────────────────────────────────────

export function buildFullUserQuery(input: string): string {
  const esc = input.replace(/'/g, "''")
  // Build LDAP filter for name search (pre-computed in JS)
  const words = esc.split(/\s+/).filter(Boolean)
  let ldapFilter: string
  if (words.length >= 2) {
    const fn = words[0]; const ln = words[words.length - 1]
    ldapFilter = `(&(objectCategory=person)(objectClass=user)(|(displayName=*${esc}*)(&(givenName=*${fn}*)(sn=*${ln}*))(&(givenName=*${ln}*)(sn=*${fn}*))))`
  } else {
    ldapFilter = `(&(objectCategory=person)(objectClass=user)(|(displayName=*${esc}*)(sn=*${esc}*)(givenName=*${esc}*)(sAMAccountName=*${esc}*)(employeeID=${esc})(mail=${esc}*)))`
  }

  const props = [
    'DisplayName','GivenName','Surname','EmailAddress','EmployeeID','Description',
    'Title','Department','Company','Manager','DirectReports','Office',
    'StreetAddress','PostalCode','City','Country','TelephoneNumber','Mobile',
    'Fax','IPPhone','OtherTelephone','OtherMobile','Enabled','LockedOut',
    'whenCreated','PasswordLastSet','PasswordNeverExpires','LastLogonDate',
    'badPasswordTime','badLogonCount','AccountExpirationDate',
    'SmartcardLogonRequired','MemberOf','HomeDirectory','ProfilePath',
    'ScriptPath','UserPrincipalName','primaryGroupID',
    ...Array.from({ length: 15 }, (_, i) => `extensionAttribute${i + 1}`),
  ].join("','")

  return [
    `try {`,
    `  $props = @('${props}')`,
    `  $u = $null; $multiResult = ''`,
    // 1. Exact SAM / EmpID match
    `  try { $u = Get-ADUser -Identity '${esc}' -Properties $props -EA Stop } catch {}`,
    `  if (!$u) { try { $u = Get-ADUser -Filter "EmployeeID -eq '${esc}'" -Properties $props -EA Stop | Select-Object -First 1 } catch {} }`,
    // 2. LDAP name/mail search (single query, server-side filter)
    `  if (!$u) {`,
    `    $cands = @(Get-ADUser -LDAPFilter '${ldapFilter}' -Properties $props -ResultSetSize 21 -EA SilentlyContinue)`,
    `    if ($cands.Count -eq 1) { $u = $cands[0] }`,
    `    elseif ($cands.Count -gt 20) { throw "Zu viele Treffer – bitte Suche eingrenzen." }`,
    `    elseif ($cands.Count -gt 1) {`,
    `      $multiArr = @($cands | Select-Object -First 20 | ForEach-Object { @{Sam=[string]$_.SamAccountName;Name=[string]$_.DisplayName;EmpID=[string]$_.EmployeeID;Dept=[string]$_.Department;Title=[string]$_.Title} })`,
    `      $multiResult = 'MULTI:' + ($multiArr | ConvertTo-Json -Compress)`,
    `    }`,
    `  }`,
    `  if ($multiResult) { Write-Output $multiResult }`,
    `  elseif (!$u) { throw "Benutzer nicht gefunden: ${esc}" }`,
    `  else {`,
    // Manager / DirectReports
    `    $mN=''; $mS=''`,
    `    if ($u.Manager) { $mg=Get-ADUser $u.Manager -Properties DisplayName -EA SilentlyContinue; if($mg){$mN=[string]$mg.DisplayName; $mS=[string]$mg.SamAccountName} }`,
    `    $rpts=@()`,
    `    if ($u.DirectReports) { $rpts=$u.DirectReports | Select-Object -First 20 | ForEach-Object { $r=Get-ADUser $_ -Properties DisplayName -EA SilentlyContinue; if($r){"$([string]$r.DisplayName)~~$([string]$r.SamAccountName)"} } }`,
    // Password expiry
    `    $pe=''; $pd=$null`,
    `    if (!$u.PasswordNeverExpires -and $u.PasswordLastSet) { $pol=Get-ADDefaultDomainPasswordPolicy -EA SilentlyContinue; if($pol -and $pol.MaxPasswordAge.TotalDays -gt 0) { $exp=$u.PasswordLastSet.Add($pol.MaxPasswordAge); $pe=$exp.ToString('dd.MM.yyyy'); $pd=[int][math]::Ceiling(($exp-(Get-Date)).TotalDays) } }`,
    // Groups (direct memberOf)
    `    $gr=($u.MemberOf | ForEach-Object { ($_ -split ',')[0] -replace '^CN=' } | Sort-Object) -join ';'`,
    // Primary group (not in memberOf)
    `    $pgName=''`,
    `    try {`,
    `      $pgRID=[int]$u.primaryGroupID`,
    `      if ($pgRID) {`,
    `        $domSID=(Get-ADDomain -EA SilentlyContinue).DomainSID.Value`,
    `        if ($domSID) { $pg=Get-ADGroup -Identity "$domSID-$pgRID" -EA SilentlyContinue; if($pg){$pgName=[string]$pg.Name} }`,
    `      }`,
    `    } catch {}`,
    // ExtAttributes
    `    $ext=@{}; 1..15 | ForEach-Object { $k="extensionAttribute$_"; $v=$u.$k; if($v){$ext[$k]=[string]$v} }`,
    // ── Device detection – Method 1 (primary): WMI scan ───────────────────
    // Same technique used in query menu (Win32_ComputerSystem.UserName) – known to work.
    `    $dev=''; $lt=''; $co=$false; $devMethod=''`,
    `    try {`,
    `      $siteOU=try{($u.DistinguishedName -replace '^CN=[^,]+,','' -replace '^[^,]+,','')}catch{''}`,
    `      $nearComps=@()`,
    `      if ($siteOU) {`,
    `        $nearComps=@(Get-ADComputer -Filter 'Enabled -eq $true' -SearchBase $siteOU -Properties LastLogonDate -EA SilentlyContinue |`,
    `          Where-Object { $_.LastLogonDate -and $_.LastLogonDate -gt (Get-Date).AddDays(-30) } |`,
    `          Sort-Object LastLogonDate -Descending | Select-Object -First 20 -ExpandProperty Name)`,
    `      }`,
    `      if ($nearComps) {`,
    `        $sam3=$u.SamAccountName; $jobs3=@{}`,
    `        foreach ($hh in $nearComps) {`,
    `          $jobs3[$hh]=Start-Job -ScriptBlock { param($h,$s); try{$cs=Get-CimInstance -ClassName Win32_ComputerSystem -ComputerName $h -OperationTimeoutSec 3 -EA SilentlyContinue; if($cs -and $cs.UserName -match "\\\\$s$"){$h}else{''}}catch{''} } -ArgumentList $hh,$sam3`,
    `        }`,
    `        $null=Wait-Job -Job $jobs3.Values -Timeout 20 -EA SilentlyContinue`,
    `        $wmiFound=@($jobs3.Values|Receive-Job -EA SilentlyContinue|Where-Object{$_})|Select-Object -First 1`,
    `        $jobs3.Values|Remove-Job -Force -EA SilentlyContinue`,
    `        if ($wmiFound) { $dev=[string]$wmiFound; $lt=(Get-Date).ToString('dd.MM.yyyy HH:mm'); $co=$true; $devMethod='WMI-Scan' }`,
    `      }`,
    `    } catch {}`,
    // ── Method 2: AD Computer ManagedBy / Description ─────────────────────
    `    if (!$dev) {`,
    `      try {`,
    `        $sam2=$u.SamAccountName; $dn2=$u.DistinguishedName`,
    `        $comp=Get-ADComputer -Filter "Description -like '*$sam2*'" -Properties Description,LastLogonDate -EA SilentlyContinue | Sort-Object LastLogonDate -Descending | Select-Object -First 1`,
    `        if (!$comp -and $dn2) { $comp=Get-ADComputer -Filter "ManagedBy -eq '$dn2'" -Properties ManagedBy,LastLogonDate -EA SilentlyContinue | Sort-Object LastLogonDate -Descending | Select-Object -First 1 }`,
    `        if ($comp) { $dev=[string]$comp.Name; $lt=if($comp.LastLogonDate){$comp.LastLogonDate.ToString('dd.MM.yyyy HH:mm')}else{''}; $devMethod='AD-Computerobjekt' }`,
    `      } catch {}`,
    `    }`,
    // ── Method 3: Event 4624 on all DCs (fallback) ─────────────────────────
    `    $allDCs=@()`,
    `    if (!$dev) {`,
    `      try {`,
    `        try { $allDCs=@((Get-ADDomainController -Filter * -EA SilentlyContinue).HostName | Select-Object -First 4) } catch {}`,
    `        if (!$allDCs) { try { $allDCs=@((Get-ADDomainController -Discover -EA SilentlyContinue).HostName) } catch {} }`,
    `        foreach ($dcH in $allDCs) {`,
    `          $evs=Get-WinEvent -ComputerName $dcH -FilterHashtable @{LogName='Security';Id=4624;StartTime=(Get-Date).AddDays(-60)} -MaxEvents 300 -EA SilentlyContinue |`,
    `            Where-Object { $_.Properties[5].Value -ieq $u.SamAccountName -and $_.Properties[8].Value -in @(2,10,11) -and $_.Properties[11].Value -and $_.Properties[11].Value -notmatch '^\\s*$|^-$|^\\?$|^WORKGROUP$' }`,
    `          if ($evs) { $ev=$evs|Sort-Object TimeCreated -Descending|Select-Object -First 1; $dev=$ev.Properties[11].Value.Trim().ToUpper(); $lt=$ev.TimeCreated.ToString('dd.MM.yyyy HH:mm'); $co=[bool]($ev.TimeCreated -gt (Get-Date).AddHours(-8)); $devMethod='Event-Log 4624'; break }`,
    `        }`,
    `      } catch {}`,
    `    }`,
    // ── Method 4: Kerberos TGT events 4768 → IP → DNS (last resort) ───────
    `    if (!$dev) {`,
    `      try {`,
    `        foreach ($dcH in $allDCs) {`,
    `          $kers=Get-WinEvent -ComputerName $dcH -FilterHashtable @{LogName='Security';Id=4768;StartTime=(Get-Date).AddDays(-14)} -MaxEvents 200 -EA SilentlyContinue |`,
    `            Where-Object { $_.Properties[0].Value -ieq $u.SamAccountName -and $_.Properties[9].Value -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$' }`,
    `          if ($kers) {`,
    `            foreach ($ker in ($kers|Sort-Object TimeCreated -Descending)) {`,
    `              $ip=[string]$ker.Properties[9].Value`,
    `              if ($ip -and $ip -ne '::1' -and $ip -ne '127.0.0.1') {`,
    `                try { $hn=([System.Net.Dns]::GetHostEntry($ip)).HostName; if($hn -and $hn -notmatch '^\\d'){$dev=$hn.Split('.')[0].ToUpper();$lt=$ker.TimeCreated.ToString('dd.MM.yyyy HH:mm');$co=[bool]($ker.TimeCreated -gt (Get-Date).AddHours(-8));$devMethod='Kerberos+DNS';break} } catch {}`,
    `              }`,
    `            }`,
    `            if ($dev) { break }`,
    `          }`,
    `        }`,
    `      } catch {}`,
    `    }`,
    // ── Output ─────────────────────────────────────────────────────────────
    `    @{`,
    `      Sam=$u.SamAccountName; UPN=$u.UserPrincipalName; GivenName=$u.GivenName; Surname=$u.Surname; Name=$u.DisplayName; EmpID=$u.EmployeeID`,
    `      Mail=$u.EmailAddress; Desc=$u.Description; Title=$u.Title; Dept=$u.Department; Company=$u.Company`,
    `      MgrName=$mN; MgrSam=$mS`,
    `      Office=$u.Office; Street=$u.StreetAddress; PostalCode=$u.PostalCode; City=$u.City; Country=$u.Country`,
    `      Phone=$u.TelephoneNumber; Mobile=$u.Mobile; Fax=$u.Fax; IPPhone=$u.IPPhone`,
    `      OtherPhone=($u.OtherTelephone -join ';'); OtherMobile=($u.OtherMobile -join ';')`,
    `      Enabled=[bool]$u.Enabled; Locked=[bool]$u.LockedOut`,
    `      Created=if($u.whenCreated){$u.whenCreated.ToString('dd.MM.yyyy')}else{''}`,
    `      PwdSet=if($u.PasswordLastSet){$u.PasswordLastSet.ToString('dd.MM.yyyy HH:mm')}else{'Nicht gesetzt'}`,
    `      PwdNeverExpires=[bool]$u.PasswordNeverExpires; PwdExpiry=$pe; PwdDaysLeft=$pd`,
    `      LastLogon=if($u.LastLogonDate){$u.LastLogonDate.ToString('dd.MM.yyyy HH:mm')}else{''}`,
    `      BadPwdTime=if($u.badPasswordTime -and $u.badPasswordTime -gt 0){[DateTime]::FromFileTime($u.badPasswordTime).ToString('dd.MM.yyyy HH:mm')}else{''}`,
    `      BadLogonCount=[int]$u.badLogonCount`,
    `      AcctExpiry=if($u.AccountExpirationDate){$u.AccountExpirationDate.ToString('dd.MM.yyyy')}else{''}`,
    `      SmartCard=[bool]$u.SmartcardLogonRequired`,
    `      Groups=$gr; PrimaryGroup=$pgName; Reports=($rpts -join ';;;')`,
    `      HomeDir=$u.HomeDirectory; ProfilePath=$u.ProfilePath; ScriptPath=$u.ScriptPath`,
    `      ExtAttrs=($ext | ConvertTo-Json -Compress)`,
    `      Device=$dev; LogonTime=$lt; CurrentlyOn=$co; DevMethod=$devMethod`,
    `    } | ConvertTo-Json -Compress`,
    `  }`,
    `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
  ].join('\n')
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId() { return Math.random().toString(36).slice(2) }
function makeEntry(value = ''): UserEntry { return { id: makeId(), value } }
const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'docx', 'pdf']

// ── Main component ─────────────────────────────────────────────────────────────

export default function UserInfo() {
  const setScreen    = useAppStore((s) => s.setScreen)
  const setDevices   = useAppStore((s) => s.setDevices)

  // Input
  const [rows, setRows]                       = useState<UserEntry[]>([makeEntry()])
  const [isDragOver, setIsDragOver]           = useState(false)
  const [importLoading, setImportLoading]     = useState(false)
  const [importError, setImportError]         = useState('')
  const [pendingExcelData, setPendingExcelData] = useState<ExcelSheetData | null>(null)

  // Query
  const [results, setResults]   = useState<UserInfoResult[]>([])
  const [isQuerying, setIsQuerying] = useState(false)
  const cancelledRef            = useRef(false)

  // UI state
  const [expandedIds, setExpandedIds]   = useState<Set<string>>(new Set())
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set())

  // Export
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportLoading, setExportLoading]   = useState(false)
  const [lastSavedPath, setLastSavedPath]   = useState('')

  // ── File import ───────────────────────────────────────────────────────────

  function applyImportedUsers(users: string[]) {
    if (!users.length) return
    setRows((p) => [...p.filter((r) => r.value.trim()), ...users.map((v) => makeEntry(v))])
  }

  async function processFile(file: FileOpenResult) {
    if (['xlsx', 'xls', 'csv'].includes(file.ext)) {
      const sd = parseExcelSheet(file.bytes)
      if (!sd.columns.length) { setImportError('Keine Spalten gefunden.'); return }
      setPendingExcelData(sd)
    } else if (['pdf', 'docx'].includes(file.ext)) {
      const { hostnames, serials } = extractFromTextBytes(file.bytes)
      applyImportedUsers([...hostnames, ...serials])
    } else {
      setImportError(`Nicht unterstütztes Format: .${file.ext}`)
    }
  }

  async function handleImport() {
    setImportError('')
    setImportLoading(true)
    try {
      const file = await openFileForImport()
      if (file) await processFile(file)
    } catch (err) { setImportError(String(err)) }
    finally { setImportLoading(false) }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setIsDragOver(false)
    const nf = e.dataTransfer.files[0]
    if (!nf) return
    const ed = (window as Window & { electronDrop?: { getPath: (f: File) => string } }).electronDrop
    const fp = ed ? ed.getPath(nf) : (nf as File & { path?: string }).path ?? ''
    const ext = fp.toLowerCase().split('.').pop() ?? ''
    if (!SUPPORTED_EXTS.includes(ext)) { setImportError('Format nicht unterstützt.'); return }
    setImportLoading(true); setImportError('')
    try {
      const r = await api().readFile(fp)
      if (!r.success || !r.data) throw new Error(r.error ?? 'Lesefehler')
      const bin = atob(r.data); const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      await processFile({ filePath: fp, ext, bytes })
    } catch (err) { setImportError(String(err)) }
    finally { setImportLoading(false) }
  }

  function handleColumnDialogConfirm(hCols: string[], sCols: string[]) {
    if (!pendingExcelData) return
    const { hostnames, serials } = extractFromExcel(pendingExcelData.rows, hCols, sCols)
    applyImportedUsers([...hostnames, ...serials])
    setPendingExcelData(null)
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  async function queryUser(input: string, resultId: string) {
    setResults((p) => p.map((r) => r.id === resultId ? { ...r, status: 'loading' } : r))
    const setError = (error: string, technicalDetail?: string) =>
      setResults((p) => p.map((r) => r.id === resultId ? { ...r, status: 'error', error, technicalDetail } : r))
    try {
      const res = await api().runPowerShell(buildFullUserQuery(input), 90000)
      const out = res.stdout.trim()

      if (out.startsWith('ERR:')) {
        const msg = out.slice(4)
        if (msg.toLowerCase().includes('nicht gefunden')) {
          setError(`Benutzer „${input}" wurde im Active Directory nicht gefunden. Bitte Eingabe prüfen.`)
        } else {
          setError('Die AD-Abfrage konnte nicht durchgeführt werden.', msg)
        }
      } else if (out.startsWith('MULTI:')) {
        let candidates: CandidateUser[] = []
        try { candidates = JSON.parse(out.slice(6)) } catch { /* empty list */ }
        setResults((p) => p.map((r) => r.id === resultId ? { ...r, status: 'disambig', candidates } : r))
      } else if (!out) {
        setError('Die AD-Abfrage konnte nicht durchgeführt werden (keine Ausgabe).', res.stderr || undefined)
      } else {
        // Extract the JSON object – ignore any PS warnings printed before it
        const jsonMatch = out.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          const logMsg = `[${new Date().toISOString()}] Kein JSON für Eingabe "${input}"\nRohe PS-Ausgabe:\n${out}\n\n`
          api().log(logMsg)
          setError('Die AD-Abfrage hat kein gültiges Format zurückgegeben.', out.slice(0, 300))
          return
        }
        try {
          const data: UserProfileData = JSON.parse(jsonMatch[0])
          setResults((p) => p.map((r) => r.id === resultId ? { ...r, status: 'done', data } : r))
          setExpandedIds((p) => { const n = new Set(p); n.add(resultId); return n })
        } catch (parseErr) {
          const logMsg = `[${new Date().toISOString()}] JSON-Fehler für Eingabe "${input}"\nRohe PS-Ausgabe:\n${out}\n\n`
          api().log(logMsg)
          setError('Die AD-Abfrage hat kein gültiges Format zurückgegeben.', `${String(parseErr)} — ${out.slice(0, 200)}`)
        }
      }
    } catch (err) {
      setError('Die AD-Abfrage konnte nicht durchgeführt werden.', String(err))
    }
  }

  async function requeryUser(resultId: string, sam: string) {
    setResults((p) => p.map((r) => r.id === resultId ? { ...r, inputValue: sam, candidates: undefined } : r))
    await queryUser(sam, resultId)
  }

  async function handleQuery(extraInput?: string) {
    const inputs = extraInput
      ? [extraInput]
      : rows.map((r) => r.value.trim()).filter(Boolean)
    if (!inputs.length) return

    cancelledRef.current = false
    setSelectedDevices(new Set())

    const newEntries: UserInfoResult[] = inputs.map((v) => ({ id: makeId(), inputValue: v, status: 'pending' as const }))

    if (extraInput) {
      // Add to existing results
      setResults((p) => [...p, ...newEntries])
      setIsQuerying(true)
      for (const entry of newEntries) {
        if (cancelledRef.current) break
        await queryUser(entry.inputValue, entry.id)
      }
    } else {
      setResults(newEntries)
      setExpandedIds(new Set())
      setIsQuerying(true)
      for (const entry of newEntries) {
        if (cancelledRef.current) break
        await queryUser(entry.inputValue, entry.id)
      }
    }
    setIsQuerying(false)
  }

  function cancelQuery() {
    cancelledRef.current = true
    api().cancelAll()
    setIsQuerying(false)
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function goToDevice(hostname: string) {
    const d: DeviceEntry = { id: makeId(), type: 'hostname', value: hostname, resolvedHostnames: [hostname] }
    setDevices([d]); setScreen('query-menu')
  }

  function goToSelectedDevices() {
    const hostnames = Array.from(selectedDevices)
    setDevices(hostnames.map((h) => ({ id: makeId(), type: 'hostname', value: h, resolvedHostnames: [h] })))
    setScreen('query-menu')
  }

  function toggleDevice(hostname: string) {
    setSelectedDevices((p) => { const n = new Set(p); n.has(hostname) ? n.delete(hostname) : n.add(hostname); return n })
  }

  function toggleExpand(id: string) {
    setExpandedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport(format: 'excel' | 'word' | 'pdf') {
    setExportMenuOpen(false)
    const done = results.filter((r) => r.status === 'done' && r.data)
    if (!done.length) return
    const profiles = done.map((r) => r.data!)

    const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : 'pdf'
    const defaultName = `Benutzerprofile_${new Date().toLocaleDateString('de-DE').replace(/\./g, '-')}.${ext}`
    const savePath = await api().saveFileDialog(defaultName, [{ name: ext.toUpperCase(), extensions: [ext] }])
    if (!savePath) return

    setExportLoading(true)
    try {
      if (format === 'excel') await exportExcelUserProfiles(profiles, savePath)
      else if (format === 'word') await exportWordUserProfiles(profiles, savePath)
      else await exportPdfUserProfiles(profiles, savePath)
      setLastSavedPath(savePath)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExportLoading(false)
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const hasInput     = rows.some((r) => r.value.trim())
  const doneResults  = results.filter((r) => r.status === 'done')
  const hasDevices   = doneResults.some((r) => r.data?.Device)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Benutzer Informationen</h1>
        <p className="text-sm text-muted-foreground mt-1">Vollständiges AD-Profil — Gerät, Gruppen, Kontakte und mehr</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input */}
        <Card title="Benutzereingabe" icon={<Users size={16} />} subtitle="Name, SAMAccountName oder Corp ID">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Benutzer</p>
              <button onClick={() => setRows((r) => [...r, makeEntry()])} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                <Plus size={13} /> Hinzufügen
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {rows.map((row) => (
                <div key={row.id} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="z.B. Max Mustermann, max.mustermann oder E12345"
                    value={row.value}
                    onChange={(e) => setRows((r) => r.map((x) => x.id === row.id ? { ...x, value: e.target.value } : x))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && hasInput) handleQuery() }}
                    className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                    disabled={rows.length === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-30"
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Import */}
        <Card title="Datei-Import" icon={<Upload size={16} />} subtitle=".xlsx, .xls, .csv, .docx, .pdf">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false) }}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center py-6 gap-3 rounded-lg border-2 border-dashed transition-all duration-150 select-none ${isDragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-muted/20'}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDragOver ? 'bg-primary/20' : 'bg-primary/10'}`}>
              <Upload size={18} className="text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">{isDragOver ? 'Datei loslassen…' : 'Datei hier hineinziehen'}</p>
            <button onClick={handleImport} disabled={importLoading} className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {importLoading ? 'Importiere…' : 'Durchsuchen'}
            </button>
            {importError && <p className="text-xs text-destructive text-center">{importError}</p>}
          </div>
        </Card>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {isQuerying && (
            <button onClick={cancelQuery} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors">
              Abbrechen
            </button>
          )}
          {hasDevices && selectedDevices.size > 0 && !isQuerying && (
            <button onClick={goToSelectedDevices} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
              <Monitor size={15} /> {selectedDevices.size} Gerät(e) abfragen
            </button>
          )}
          {doneResults.length > 0 && !isQuerying && (
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen((p) => !p)}
                disabled={exportLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50"
              >
                {exportLoading ? <Loader size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                Exportieren
                <ChevronDown size={13} />
              </button>
              {exportMenuOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden w-48">
                  <button onClick={() => handleExport('excel')} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors">
                    <FileSpreadsheet size={14} className="text-emerald-400" /> Excel (.xlsx)
                  </button>
                  <button onClick={() => handleExport('word')} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors">
                    <FileText size={14} className="text-blue-400" /> Word (.docx)
                  </button>
                  <button onClick={() => handleExport('pdf')} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors">
                    <File size={14} className="text-red-400" /> PDF
                  </button>
                </div>
              )}
            </div>
          )}
          {lastSavedPath && !exportLoading && (
            <button onClick={() => api().openPath(lastSavedPath)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
              Datei öffnen
            </button>
          )}
        </div>
        <button
          onClick={() => handleQuery()}
          disabled={!hasInput || isQuerying}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${hasInput && !isQuerying ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
        >
          {isQuerying ? <Loader size={15} className="animate-spin" /> : <Search size={15} />}
          {isQuerying ? 'Abfrage läuft…' : 'Abfragen'}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => (
            <ResultCard
              key={result.id}
              result={result}
              expanded={expandedIds.has(result.id)}
              onToggleExpand={() => toggleExpand(result.id)}
              deviceSelected={result.data?.Device ? selectedDevices.has(result.data.Device) : false}
              onToggleDevice={() => result.data?.Device && toggleDevice(result.data.Device)}
              onQueryDevice={goToDevice}
              onQueryUser={(sam) => handleQuery(sam)}
              onRequery={(rId, sam) => requeryUser(rId, sam)}
            />
          ))}
        </div>
      )}

      {/* Excel column dialog */}
      {pendingExcelData && (
        <ExcelColumnDialog
          columns={pendingExcelData.columns}
          rows={pendingExcelData.rows}
          onConfirm={handleColumnDialogConfirm}
          onCancel={() => setPendingExcelData(null)}
        />
      )}

      {/* Close export menu on outside click */}
      {exportMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
      )}
    </div>
  )
}

// ── Result card ────────────────────────────────────────────────────────────────

interface ResultCardProps {
  result: UserInfoResult
  expanded: boolean
  onToggleExpand: () => void
  deviceSelected: boolean
  onToggleDevice: () => void
  onQueryDevice: (h: string) => void
  onQueryUser: (sam: string) => void
  onRequery: (resultId: string, sam: string) => void
}

function ResultCard({ result, expanded, onToggleExpand, deviceSelected, onToggleDevice, onQueryDevice, onQueryUser, onRequery }: ResultCardProps) {
  const { inputValue, status, data, error } = result
  const displayName = status === 'done' && data?.Name ? data.Name : inputValue

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border">
        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <Users size={14} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
          {status === 'done' && data?.Sam && (
            <p className="text-[11px] text-muted-foreground font-mono">{data.Sam}{data.EmpID ? ` · ${data.EmpID}` : ''}</p>
          )}
        </div>

        {/* Quick status badges */}
        {status === 'done' && data && (
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${data.Enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              {data.Enabled ? 'Aktiv' : 'Deaktiviert'}
            </span>
            {data.Locked && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">Gesperrt</span>}
            {/* Device checkbox for bulk select */}
            {data.Device && (
              <button onClick={onToggleDevice} className="text-muted-foreground hover:text-primary transition-colors" title="Gerät auswählen">
                {deviceSelected ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}
              </button>
            )}
          </div>
        )}

        {/* Status indicator */}
        {status === 'loading' && <span className="flex items-center gap-1.5 text-[11px] text-blue-400 shrink-0"><Loader size={11} className="animate-spin" /> Abfrage…</span>}
        {status === 'pending' && <span className="text-[11px] text-muted-foreground shrink-0">Wartend…</span>}
        {status === 'error' && <span className="flex items-center gap-1 text-[11px] text-destructive shrink-0"><AlertCircle size={11} /> Fehler</span>}
        {status === 'disambig' && <span className="flex items-center gap-1 text-[11px] text-amber-400 shrink-0"><AlertCircle size={11} /> Auswahl</span>}
        {status === 'done' && <span className="flex items-center gap-1 text-[11px] text-emerald-400 shrink-0"><CheckCircle size={11} /> Gefunden</span>}

        {/* Toggle expand */}
        {status === 'done' && (
          <button onClick={onToggleExpand} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 ml-1">
            {expanded ? <ChevronDown size={14} /> : <ChevronDown size={14} className="-rotate-90" />}
            {expanded ? 'Zuklappen' : 'Vollständiges Profil'}
          </button>
        )}
      </div>

      {/* Error */}
      {status === 'error' && (
        <ErrorDetail error={error} technicalDetail={result.technicalDetail} />
      )}

      {/* Disambiguation */}
      {status === 'disambig' && result.candidates && (
        <div className="px-4 py-3 space-y-2">
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <AlertCircle size={12} />
            Mehrere Benutzer gefunden – bitte den richtigen auswählen:
          </p>
          <div className="space-y-1.5">
            {result.candidates.map((c) => (
              <button
                key={c.Sam}
                onClick={() => onRequery(result.id, c.Sam)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:bg-accent hover:border-primary/40 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Users size={12} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{c.Name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {c.Sam}{c.EmpID ? ` · ${c.EmpID}` : ''}{c.Dept ? ` · ${c.Dept}` : ''}
                  </p>
                </div>
                {c.Title && <span className="text-[11px] text-muted-foreground shrink-0 max-w-[150px] truncate">{c.Title}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary row (collapsed state) */}
      {status === 'done' && data && !expanded && (
        <div className="px-4 py-3 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1.5 text-sm">
          {data.Dept && <SummaryField label="Abteilung" value={data.Dept} />}
          {data.Office && <SummaryField label="Standort" value={data.Office} />}
          {data.Mail && <SummaryField label="E-Mail" value={data.Mail} />}
          {data.Device
            ? <div className="flex flex-col gap-0.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  {data.CurrentlyOn ? 'Aktuell auf' : 'Zuletzt auf'}
                </p>
                <div className="flex items-center gap-1.5">
                  {data.CurrentlyOn && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                  <span className="font-mono text-xs font-medium text-foreground">{data.Device}</span>
                  <button onClick={() => onQueryDevice(data.Device)} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0">
                    Abfragen
                  </button>
                </div>
              </div>
            : <SummaryField label="Gerät" value="Nicht ermittelt" />
          }
        </div>
      )}

      {/* Full profile accordion */}
      {status === 'done' && data && expanded && (
        <div className="p-3">
          <UserProfileAccordion
            data={data}
            onQueryDevice={onQueryDevice}
            onQueryUser={onQueryUser}
          />
        </div>
      )}
    </div>
  )
}

function ErrorDetail({ error, technicalDetail }: { error?: string; technicalDetail?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-4 py-3 space-y-1.5">
      <p className="text-sm text-destructive">{error}</p>
      {technicalDetail && (
        <div>
          <button onClick={() => setOpen((p) => !p)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown size={11} className={open ? '' : '-rotate-90'} />
            Technische Details
          </button>
          {open && (
            <pre className="mt-1.5 px-3 py-2 text-[10px] text-muted-foreground bg-muted/30 rounded-md border border-border overflow-x-auto whitespace-pre-wrap break-all font-mono">
              {technicalDetail}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
      <p className="text-xs text-foreground truncate">{value}</p>
    </div>
  )
}
