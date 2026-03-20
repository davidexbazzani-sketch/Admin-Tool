import { useState, useRef, useCallback } from 'react'
import {
  ChevronDown, ChevronRight, Play, Copy, Check,
  Loader, CheckCircle, XCircle, AlertTriangle,
  ChevronsDownUp, ChevronsUpDown, Lock, Terminal,
  Download, Trash2, PackageX, Search,
} from 'lucide-react'
import {
  exportRemoteDocResultExcel,
  exportRemoteDocResultWord,
  exportRemoteDocResultPdf,
} from '../utils/exportUtils'
import { useAppStore } from '../store/appStore'
import { api } from '../electronAPI'
import { ServicePanel } from '../components/ServicePanel'
import { CATEGORIES, type ActionType, type CmdDef, type Category } from '../utils/remoteCommands'

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckStatus = 'pending' | 'running' | 'ok' | 'warn' | 'error'

interface ServiceCheck {
  id: string
  label: string
  status: CheckStatus
  detail?: string
}

interface ConnInfo {
  user: string
  model: string
  ram: string
  os: string
  lastBoot: string
  allOk: boolean
  winrmOk: boolean
  failedServices: string[]   // service ids that failed
}


// ── Connection check PS script: Ping + WinRM only ────────────────────────────
function buildConnectScript(hostname: string): string {
  const h = hostname.replace(/'/g, "''")
  return [
    `try {`,
    // Step 1: Ping
    `  $ping = Test-Connection -ComputerName '${h}' -Count 2 -Quiet -EA SilentlyContinue`,
    `  if (-not $ping) { @{stage='ping';ok=$false} | ConvertTo-Json -Compress; exit }`,
    `  @{stage='ping';ok=$true} | ConvertTo-Json -Compress`,
    // Step 2: WinRM check + start (3 methods, same channels as compmgmt.msc)
    `  $winrm = $false`,
    `  $winrmLog = ''`,
    `  try { Test-WSMan -ComputerName '${h}' -EA Stop | Out-Null; $winrm = $true } catch {}`,
    `  if (-not $winrm) {`,
    `    @{stage='winrm';ok=$false;fixing=$true} | ConvertTo-Json -Compress`,
    `    # Method 1: Get-Service -ComputerName | Start() — RPC/SMB, same as compmgmt.msc`,
    `    try {`,
    `      $svc = Get-Service -ComputerName '${h}' -Name WinRM -EA Stop`,
    `      if ($svc.StartType -eq 'Disabled') { Set-Service -ComputerName '${h}' -Name WinRM -StartupType Manual -EA Stop }`,
    `      $svc.Start()`,
    `      $svc.WaitForStatus('Running', [TimeSpan]::FromSeconds(15))`,
    `      $winrm = $true`,
    `      $winrmLog += 'M1(Get-Service): OK; '`,
    `    } catch { $winrmLog += "M1(Get-Service): $($_.Exception.Message); " }`,
    `    # Method 2: ServiceController .NET class`,
    `    if (-not $winrm) {`,
    `      try {`,
    `        $sc = [System.ServiceProcess.ServiceController]::new('WinRM', '${h}')`,
    `        $sc.Start()`,
    `        $sc.WaitForStatus('Running', [TimeSpan]::FromSeconds(15))`,
    `        $sc.Close()`,
    `        $winrm = $true`,
    `        $winrmLog += 'M2(ServiceController): OK; '`,
    `      } catch { $winrmLog += "M2(ServiceController): $($_.Exception.Message); " }`,
    `    }`,
    `    # Method 3: sc.exe over SMB`,
    `    if (-not $winrm) {`,
    `      try {`,
    `        $scOut = & sc.exe "\\\\${h}" start WinRM 2>&1`,
    `        Start-Sleep -Seconds 3`,
    `        $chk = Get-Service -ComputerName '${h}' -Name WinRM -EA SilentlyContinue`,
    `        if ($chk -and $chk.Status -eq 'Running') { $winrm = $true; $winrmLog += 'M3(sc.exe): OK; ' }`,
    `        else { $winrmLog += "M3(sc.exe): $(($scOut -join ' ').Trim()); " }`,
    `      } catch { $winrmLog += "M3(sc.exe): $($_.Exception.Message); " }`,
    `    }`,
    `  }`,
    `  @{stage='winrm';ok=$winrm;wasFixed=(-not $winrm -eq $false -and $winrmLog -ne '');error=$winrmLog} | ConvertTo-Json -Compress`,
    `  if (-not $winrm) { exit }`,
    // Step 3: Device info (only reached when WinRM is active) — each query individually
    `  $info = @{stage='info';user='N/A';model='N/A';ram='N/A';os='N/A';lastBoot='N/A';partial=$false}`,
    `  try {`,
    `    $cs = Get-CimInstance -ComputerName '${h}' -ClassName Win32_ComputerSystem -OperationTimeoutSec 15 -EA Stop`,
    `    $info.user  = [string]$cs.UserName`,
    `    $info.model = "$($cs.Manufacturer) $($cs.Model)".Trim()`,
    `    $info.ram   = [string][math]::Round($cs.TotalPhysicalMemory/1GB,0)`,
    `  } catch { $info.partial = $true }`,
    `  try {`,
    `    $os = Get-CimInstance -ComputerName '${h}' -ClassName Win32_OperatingSystem -OperationTimeoutSec 15 -EA Stop`,
    `    $info.os       = "$($os.Caption) (Build $($os.BuildNumber))"`,
    `    $info.lastBoot = [string]$os.LastBootUpTime`,
    `  } catch { $info.partial = $true }`,
    `  if ($info.user -eq 'N/A' -and $info.os -eq 'N/A') {`,
    `    try {`,
    `      $si = Invoke-Command -ComputerName '${h}' -ScriptBlock { Get-ComputerInfo | Select-Object CsUserName,OsName,OsBuildNumber,OsLastBootUpTime,CsModel,CsTotalPhysicalMemory } -EA Stop`,
    `      if ($si.CsUserName)  { $info.user = [string]$si.CsUserName }`,
    `      if ($si.OsName)      { $info.os   = "$($si.OsName) (Build $($si.OsBuildNumber))" }`,
    `      if ($si.OsLastBootUpTime) { $info.lastBoot = [string]$si.OsLastBootUpTime }`,
    `      if ($si.CsModel)     { $info.model = [string]$si.CsModel }`,
    `      if ($si.CsTotalPhysicalMemory) { $info.ram = [string][math]::Round($si.CsTotalPhysicalMemory/1GB,0) }`,
    `    } catch {}`,
    `  }`,
    `  $info | ConvertTo-Json -Compress`,
    `} catch { @{stage='error';msg=$_.Exception.Message} | ConvertTo-Json -Compress }`,
  ].join('\n')
}

// ── Small utility components ──────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function doCopy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <button onClick={doCopy} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Kopieren">
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  )
}

function CheckRow({ check }: { check: ServiceCheck }) {
  const icons: Record<CheckStatus, React.ReactNode> = {
    pending: <span className="w-4 h-4 rounded-full border border-border inline-block" />,
    running: <Loader size={14} className="animate-spin text-blue-400" />,
    ok:      <CheckCircle size={14} className="text-emerald-400" />,
    warn:    <AlertTriangle size={14} className="text-amber-400" />,
    error:   <XCircle size={14} className="text-red-400" />,
  }
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="shrink-0">{icons[check.status]}</span>
      <span className={`text-xs ${check.status === 'error' ? 'text-red-400' : check.status === 'warn' ? 'text-amber-400' : 'text-foreground'}`}>
        {check.label}
      </span>
      {check.detail && (
        <span className="text-[11px] text-muted-foreground">{check.detail}</span>
      )}
    </div>
  )
}

function SortableTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const [sortCol, setSortCol] = useState(0)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol] ?? ''; const bv = b[sortCol] ?? ''
    const cmp = av.localeCompare(bv, 'de', { numeric: true, sensitivity: 'base' })
    return sortDir === 'asc' ? cmp : -cmp
  })
  function toggleSort(col: number) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h, i) => (
              <th key={h} className="text-left px-2 py-1.5 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap" onClick={() => toggleSort(i)}>
                {h}{sortCol === i && <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-muted/5' : ''}>
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1 text-foreground whitespace-nowrap max-w-[200px] truncate" title={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SoftwareTable({ items, onUninstall }: {
  items: { DisplayName: string; DisplayVersion?: string; Publisher?: string }[]
  onUninstall?: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const [sortCol, setSortCol] = useState(0)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const cols = ['DisplayName', 'DisplayVersion', 'Publisher'] as const
  const filtered = items
    .filter(it => !query || it.DisplayName.toLowerCase().includes(query.toLowerCase()) || (it.Publisher ?? '').toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const av = String(a[cols[sortCol]] ?? ''); const bv = String(b[cols[sortCol]] ?? '')
      const cmp = av.localeCompare(bv, 'de', { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  function toggleSort(col: number) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  const headers = ['Name', 'Version', 'Hersteller']
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Software suchen…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1 text-[11px] rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{filtered.length} / {items.length}</span>
      </div>
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              {headers.map((h, i) => (
                <th key={h} className="text-left px-2 py-1.5 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap" onClick={() => toggleSort(i)}>
                  {h}{sortCol === i && <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
              {onUninstall && <th className="px-2 py-1.5 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((it, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-muted/5' : ''}>
                <td className="px-2 py-1 text-foreground max-w-[240px] truncate" title={it.DisplayName}>{it.DisplayName}</td>
                <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">{it.DisplayVersion ?? '—'}</td>
                <td className="px-2 py-1 text-muted-foreground max-w-[160px] truncate" title={it.Publisher ?? ''}>{it.Publisher ?? '—'}</td>
                {onUninstall && (
                  <td className="px-2 py-1">
                    <button
                      onClick={() => onUninstall(it.DisplayName)}
                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      <PackageX size={10} /> Deinstallieren
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RemoteDoc() {
  const isAdmin = useAppStore((s) => s.isAdmin)

  const [hostname, setHostname]     = useState('')
  const [connecting, setConnecting] = useState(false)
  const [checks, setChecks]         = useState<ServiceCheck[]>([])
  const [connInfo, setConnInfo]     = useState<ConnInfo | null>(null)
  const [connError, setConnError]       = useState('')
  const [connErrorDetail, setConnErrorDetail] = useState('')
  const [showErrorDetail, setShowErrorDetail] = useState(false)
  const [svcCount, setSvcCount]         = useState<number | null>(null)

  // Accordion state
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  // Per-command input values
  const [inputs, setInputs]         = useState<Record<string, string>>({})
  // Per-command output
  const [outputs, setOutputs]       = useState<Record<string, { status: 'running' | 'ok' | 'error'; text: string; label: string; timestamp: Date; collapsed: boolean }>>({})
  // Export dialog
  const [exportDialog, setExportDialog] = useState<{ label: string; text: string } | null>(null)
  // Confirmation dialog
  const [confirm, setConfirm]       = useState<{ cmdKey: string; label: string; command: string; critical: boolean } | null>(null)
  // Privacy consent dialog (screenshot)
  const [consentPending, setConsentPending] = useState<{ cmdKey: string; label: string; command: string } | null>(null)

  const abortRef = useRef(false)

  function setCheck(id: string, patch: Partial<ServiceCheck>) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleAll() {
    if (expanded.size === CATEGORIES.length) setExpanded(new Set())
    else setExpanded(new Set(CATEGORIES.map(c => c.id)))
  }

  const doConnect = useCallback(async () => {
    const h = hostname.trim()
    if (!h) return
    abortRef.current = false
    setConnecting(true)
    setConnInfo(null)
    setConnError('')
    setConnErrorDetail('')
    setShowErrorDetail(false)
    setSvcCount(null)
    setOutputs({})

    const initialChecks: ServiceCheck[] = [
      { id: 'ping',  label: 'Erreichbarkeit (Ping)', status: 'pending' },
      { id: 'winrm', label: 'WinRM',                 status: 'pending' },
      { id: 'info',  label: 'Geräteinformationen',   status: 'pending' },
    ]
    setChecks(initialChecks)

    const script = buildConnectScript(h)
    // Mark ping as running
    setChecks(prev => prev.map(c => c.id === 'ping' ? { ...c, status: 'running' } : c))

    const result = await api().runPowerShell(script, 60000)
    api().log(`[RemoteDoc] connect stdout: ${result.stdout.slice(0, 2000)} | stderr: ${result.stderr.slice(0, 500)} | exit: ${result.exitCode} | timedOut: ${result.timedOut}`)
    const lines = result.stdout.split('\n').map(l => l.trim()).filter(Boolean)

    let winrmOk = false
    let hadError = false

    for (const line of lines) {
      if (!line.startsWith('{')) continue
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        const stage = obj.stage as string

        if (stage === 'ping') {
          if (obj.ok) {
            setCheck('ping', { status: 'ok' })
            setCheck('winrm', { status: 'running' })
          } else {
            setCheck('ping', { status: 'error', detail: 'Nicht erreichbar' })
            setConnError('Gerät nicht erreichbar. Bitte prüfen Sie ob der PC eingeschaltet und im Netzwerk ist.')
            hadError = true
            setConnecting(false)
            return
          }
        }

        if (stage === 'winrm') {
          if (obj.fixing === true) {
            // Intermediate: WinRM not running, actively trying to start it — keep waiting
            setCheck('winrm', { status: 'running', detail: 'Starte WinRM-Dienst…' })
            // DO NOT return — the final winrm line (ok:true/false) will come next
          } else if (obj.ok) {
            // Final result: WinRM is now running
            winrmOk = true
            setCheck('winrm', {
              status: obj.wasFixed ? 'warn' : 'ok',
              detail: obj.wasFixed ? 'war nicht aktiv → automatisch gestartet' : undefined,
            })
            setCheck('info', { status: 'running' })
          } else {
            // Final result: all methods failed
            const errDetail = String(obj.error || '')
            setCheck('winrm', { status: 'error', detail: 'Konnte nicht gestartet werden' })
            setConnError(
              'WinRM konnte nicht gestartet werden. Bitte starten Sie WinRM manuell ' +
              'über die Computerverwaltung (compmgmt.msc → Dienste → Windows Remote Management → Starten).'
            )
            if (errDetail) setConnErrorDetail(errDetail)
            hadError = true
            setConnecting(false)
            return
          }
        }

        if (stage === 'info') {
          const partial = obj.partial === true
          const allNa = obj.user === 'N/A' && obj.os === 'N/A'
          setCheck('info', {
            status: allNa ? 'warn' : partial ? 'warn' : 'ok',
            detail: allNa ? 'Infos nicht verfügbar (Kategorien trotzdem nutzbar)' : partial ? 'Teilweise geladen' : undefined,
          })
          // Always set connInfo so categories are unlocked — even when all fields are N/A
          setConnInfo({
            user:     String(obj.user || '—'),
            model:    String(obj.model || '—'),
            ram:      String(obj.ram || '—'),
            os:       String(obj.os || '—'),
            lastBoot: String(obj.lastBoot || '—'),
            allOk:    !allNa,
            winrmOk:  true,
            failedServices: [],
          })
        }

        if (stage === 'error') {
          setConnError(`Verbindungsfehler: ${obj.msg}`)
          hadError = true
        }
      } catch { /* skip malformed line */ }
    }

    // If winrm check output never arrived (e.g. timeout), surface an error
    if (!winrmOk && !hadError) {
      setCheck('winrm', { status: 'error', detail: 'Keine Antwort (Timeout)' })
      const rawOut = result.stdout || '(kein Output)'
      const rawErr = result.stderr || ''
      setConnError('Verbindungscheck hat keine Antwort erhalten (Timeout nach 60s).')
      setConnErrorDetail(`stdout: ${rawOut}\nstderr: ${rawErr}\ntimedOut: ${result.timedOut}`)
    }

    setConnecting(false)
  }, [hostname])

  async function runCommand(cat: Category, cmd: CmdDef) {
    const h = hostname.trim()
    if (!h || !connInfo) return
    let inputVal = inputs[`${cat.id}::${cmd.id}`] ?? ''
    const key = `${cat.id}::${cmd.id}`

    // File action: open file dialog first, use selected path(s) as input
    if (cmd.fileAction === 'install') {
      const path = await api().openFileDialog([
        { name: 'Installationsdatei', extensions: ['msi', 'exe', 'inf'] }
      ])
      if (!path) return
      inputVal = path
    } else if (cmd.fileAction === 'transfer') {
      const paths = await api().openFilesDialog()
      if (!paths || paths.length === 0) return
      inputVal = paths.join('|')
    }

    const psCmd = cmd.buildCmd(h, inputVal || undefined)

    // Privacy consent (screenshot): show consent dialog before running
    if (cmd.privacyConsent) {
      setConsentPending({ cmdKey: key, label: cmd.func, command: psCmd })
      return
    }

    if (cmd.action === 'read') {
      await executeCommand(key, psCmd, cmd.local, cmd.func)
    } else {
      setConfirm({
        cmdKey: key,
        label: cmd.func,
        command: psCmd,
        critical: cmd.action === 'critical',
      })
    }
  }

  async function executeCommand(key: string, psCmd: string, isLocal?: boolean, label?: string) {
    const entryLabel = label ?? key
    setOutputs(prev => ({ ...prev, [key]: { status: 'running', text: '', label: entryLabel, timestamp: new Date(), collapsed: false } }))
    setConfirm(null)
    const result = await api().runPowerShell(psCmd, 300000)
    const out = result.stdout || result.stderr || '(keine Ausgabe)'
    const isError = result.exitCode !== 0 || out.startsWith('ERR:') || out.startsWith('"ERR:')
    setOutputs(prev => ({ ...prev, [key]: { ...prev[key], status: isError ? 'error' : 'ok', text: out } }))
  }

  function formatOutput(
    text: string,
    catId?: string,
    cmdId?: string,
    onUninstall?: (name: string) => void,
  ): React.ReactNode {
    // Detect base64 image (screenshot result)
    const b64clean = text.trim().replace(/^"(.*)"$/, '$1')
    if (/^[A-Za-z0-9+/]{100,}={0,2}$/.test(b64clean)) {
      return (
        <div className="p-2">
          <img src={`data:image/png;base64,${b64clean}`} alt="Screenshot"
            className="max-w-full rounded border border-border cursor-pointer"
            onClick={() => window.open(`data:image/png;base64,${b64clean}`, '_blank')} />
          <p className="text-[10px] text-muted-foreground mt-1">Klick zum Vergrößern</p>
        </div>
      )
    }
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return <span className="text-muted-foreground text-[11px]">(keine Einträge)</span>
        if (typeof parsed[0] === 'object' && parsed[0] !== null) {
          // Software list: special table with search + uninstall button
          const first = parsed[0] as Record<string, unknown>
          if (catId === 'software' && cmdId === 'swlist' && 'DisplayName' in first) {
            return (
              <SoftwareTable
                items={parsed as { DisplayName: string; DisplayVersion?: string; Publisher?: string }[]}
                onUninstall={onUninstall}
              />
            )
          }
          const headers = Object.keys(first)
          const rows = (parsed as Record<string, unknown>[]).map(item => headers.map(h => String(item[h] ?? '—')))
          return <SortableTable headers={headers} rows={rows} />
        }
        return <pre className="text-[11px] whitespace-pre-wrap text-foreground font-mono">{parsed.join('\n')}</pre>
      }
      if (typeof parsed === 'object' && parsed !== null) {
        const pairs = Object.entries(parsed as Record<string, unknown>)
        return (
          <div className="divide-y divide-border">
            {pairs.map(([k, v], i) => (
              <div key={k} className={`flex gap-3 px-2 py-1.5 ${i % 2 === 0 ? 'bg-muted/10' : ''}`}>
                <span className="text-[11px] font-medium text-muted-foreground w-40 shrink-0">{k}</span>
                <span className="text-[11px] text-foreground break-all">{String(v ?? '—')}</span>
              </div>
            ))}
          </div>
        )
      }
    } catch { /* not JSON */ }

    // ── Plain-text PS table detection (headers + "---" separator) ──────────
    const lines = text.split('\n').map(l => l.trimEnd())
    const sepIdx = lines.findIndex(l => /^[-\s]+$/.test(l) && l.includes('--'))
    if (sepIdx > 0) {
      const headerLine = lines[sepIdx - 1]
      const sepLine    = lines[sepIdx]
      const dataLines  = lines.slice(sepIdx + 1).filter(l => l.trim())
      // Compute column positions from separator dashes
      const colRanges: [number, number][] = []
      let i = 0
      while (i < sepLine.length) {
        if (sepLine[i] === '-') {
          const start = i
          while (i < sepLine.length && sepLine[i] === '-') i++
          colRanges.push([start, i])
        } else { i++ }
      }
      if (colRanges.length >= 2) {
        const headers = colRanges.map(([s, e]) => headerLine.slice(s, e).trim())
        const rows = dataLines.map(line =>
          colRanges.map(([s, e]) => line.slice(s, e === colRanges[colRanges.length - 1][1] ? undefined : e).trim())
        )
        return <SortableTable headers={headers} rows={rows} />
      }
    }

    // ── Simple list: each non-empty line as its own row ────────────────────
    const nonEmpty = lines.filter(l => l.trim())
    if (nonEmpty.length > 1) {
      return (
        <div className="divide-y divide-border">
          {nonEmpty.map((line, i) => (
            <div key={i} className={`px-2 py-1.5 text-[11px] font-mono text-foreground ${i % 2 === 0 ? 'bg-muted/10' : ''}`}>
              {line}
            </div>
          ))}
        </div>
      )
    }

    return <pre className="text-[11px] whitespace-pre-wrap text-foreground font-mono leading-relaxed px-2 py-1">{text.trim()}</pre>
  }

  function handleUninstall(appName: string) {
    const h2 = hostname.trim()
    if (!h2) return
    const safe = appName.replace(/'/g, "''")
    const psCmd = [
      `Invoke-Command -ComputerName '${h2}' -ScriptBlock {`,
      `  $app = Get-ItemProperty -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -EA SilentlyContinue | Where-Object {$_.DisplayName -eq '${safe}'}`,
      `  if (-not $app) { Write-Output "Software nicht gefunden: ${safe}"; exit }`,
      `  $us = $app.UninstallString -replace '/I\\{', '/X{' -replace '^MsiExec.exe ', ''`,
      `  if ($us -match 'msiexec') { Start-Process msiexec -ArgumentList "$us /quiet /norestart" -Wait }`,
      `  elseif ($us) { Start-Process cmd -ArgumentList "/c $us /S /silent /quiet" -Wait -NoNewWindow }`,
      `  else { Write-Output "Kein Deinstallations-String gefunden"; exit }`,
      `  Write-Output "Deinstallation abgeschlossen: ${safe}"`,
      `}`,
    ].join('\n')
    const uninstKey = `software::uninstall-${Date.now()}`
    setConfirm({ cmdKey: uninstKey, label: `Deinstallieren: ${appName}`, command: psCmd, critical: true })
  }

  const connected = !!connInfo
  const h = hostname.trim()

  return (
    <div className="flex flex-col h-full">
      {/* ── Admin-Rechte Banner ───────────────────────────────────────────── */}
      {!isAdmin && (
        <div className="shrink-0 flex items-center gap-3 px-6 py-3 bg-amber-500/10 border-b border-amber-500/30">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-400">Admin-Rechte erforderlich</p>
            <p className="text-xs text-amber-400/80">Die Remote Doc Funktionen erfordern Administrator-Berechtigungen. Bitte starten Sie das Programm als Administrator.</p>
          </div>
        </div>
      )}

      {/* ── Sticky top bar ────────────────────────────────────────────────── */}
      <div className={`shrink-0 border-b border-border bg-background z-10 ${!isAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Title + input */}
        <div className="flex items-center gap-3 px-6 py-4">
          <Terminal size={20} className="text-primary shrink-0" />
          <h1 className="text-lg font-bold text-foreground">Remote Doc</h1>
          <div className="flex-1 flex items-center gap-2 max-w-xl ml-4">
            <input
              type="text"
              placeholder="Hostname eingeben…"
              value={hostname}
              onChange={e => setHostname(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !connecting && doConnect()}
              className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
            />
            <button
              onClick={doConnect}
              disabled={connecting || !hostname.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {connecting ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
              Verbinden
            </button>
          </div>
        </div>

        {/* Connection status */}
        {(checks.length > 0 || connError) && (
          <div className="px-6 pb-4">
            {connError ? (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 overflow-hidden">
                <div className="flex items-start gap-2 p-3">
                  <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400 flex-1">{connError}</p>
                </div>
                {connErrorDetail && (
                  <div className="border-t border-red-500/20">
                    <button
                      onClick={() => setShowErrorDetail(v => !v)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-red-400/70 hover:text-red-400 transition-colors text-left"
                    >
                      {showErrorDetail ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      Technische Details
                    </button>
                    {showErrorDetail && (
                      <pre className="px-3 pb-3 text-[10px] font-mono text-red-300/60 whitespace-pre-wrap break-all">{connErrorDetail}</pre>
                    )}
                  </div>
                )}
              </div>
            ) : connInfo ? (
              <div className="flex gap-4 items-start">
                {/* Device info box */}
                <div className="flex-1 p-3 rounded-lg bg-card border border-border space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-primary">{h}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${connInfo.allOk ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                      {connInfo.allOk ? 'Alle Dienste aktiv' : 'Teilweise aktiv'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">👤 {connInfo.user}</p>
                  <p className="text-xs text-muted-foreground">💻 {connInfo.model} | {connInfo.ram} GB RAM</p>
                  <p className="text-xs text-muted-foreground">🖥️ {connInfo.os}</p>
                  <p className="text-xs text-muted-foreground">⏱️ Letzter Boot: {connInfo.lastBoot}</p>
                </div>
                {/* Check summary */}
                <div className="shrink-0 space-y-0.5">
                  {checks.map(c => <CheckRow key={c.id} check={c} />)}
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                  <Loader size={12} className="animate-spin text-blue-400" /> Verbindung wird hergestellt…
                </p>
                {checks.map(c => <CheckRow key={c.id} check={c} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Category accordion ────────────────────────────────────────────── */}
      <div className={`flex-1 overflow-y-auto ${!isAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
        {connected && (
          <div className="px-6 pt-3 pb-1 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{CATEGORIES.length} Kategorien · {CATEGORIES.reduce((s, c) => s + c.commands.length, 0)} Befehle</p>
            <div className="flex items-center gap-3">
              {Object.values(outputs).some(o => o.status !== 'running' && !o.collapsed) && (
                <button
                  onClick={() => setOutputs(prev => {
                    const next = { ...prev }
                    for (const k of Object.keys(next)) next[k] = { ...next[k], collapsed: true }
                    return next
                  })}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronsDownUp size={13} /> Alle Ergebnisse schließen
                </button>
              )}
              <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {expanded.size === CATEGORIES.length ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
                {expanded.size === CATEGORIES.length ? 'Alle zuklappen' : 'Alle aufklappen'}
              </button>
            </div>
          </div>
        )}

        {!connected && !connecting && checks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Terminal size={40} className="opacity-20 mb-3" />
            <p className="text-sm">Hostname eingeben und auf „Verbinden" klicken</p>
            <p className="text-xs mt-1 opacity-60">Die Verbindung wird automatisch geprüft und Remote-Dienste ggf. aktiviert</p>
          </div>
        )}

        {connected && (
          <div className="px-6 pb-6 space-y-2 pt-2">
            {CATEGORIES.map(cat => {
              const isOpen = expanded.has(cat.id)
              const isSvcCat = cat.id === 'svc'
              // Dynamic label: show service count once loaded
              const catLabel = isSvcCat && svcCount !== null
                ? `${cat.label} (${svcCount})`
                : cat.label
              return (
                <div key={cat.id} className="border border-border rounded-lg overflow-hidden">
                  {/* Category header */}
                  <button
                    onClick={() => toggleExpand(cat.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/20 transition-colors"
                  >
                    {isOpen ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                    <span className="text-sm font-medium text-foreground flex-1 text-left">{catLabel}</span>
                    {!isSvcCat && <span className="text-[11px] text-muted-foreground">{cat.commands.length} Befehle</span>}
                  </button>

                  {/* Services category: render ServicePanel instead of command table */}
                  {isOpen && isSvcCat && (
                    <ServicePanel
                      hostname={h}
                      isAdmin={isAdmin}
                      onCountLoaded={setSvcCount}
                    />
                  )}

                  {/* Commands table (for all other categories) */}
                  {isOpen && !isSvcCat && (
                    <div className="divide-y divide-border">
                      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-0 bg-muted/20 border-b border-border">
                        <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Funktion / Wann sinnvoll</div>
                        <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Befehl</div>
                        <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-40">Eingabe</div>
                        <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-24">Aktion</div>
                      </div>
                      {cat.commands.map(cmd => {
                        const key = `${cat.id}::${cmd.id}`
                        const inputVal = inputs[key] ?? ''
                        const out = outputs[key]
                        const needsInput = !!cmd.input
                        const inputOk = !needsInput || inputVal.trim() !== ''
                        const inputVal2 = inputs[key] ?? ''
                        const psCmd = cmd.buildCmd(h, inputVal2 || undefined)
                        const displayCmd = cmd.local
                          ? psCmd.replace(/^try \{ /, '').replace(/ \} catch.*$/, '')
                          : psCmd.split('\n')[1]?.trim().replace(/^Invoke-Command.*-ScriptBlock \{ /, '').slice(0, 80) || psCmd.slice(0, 80)

                        // Admin-only check for write/critical
                        const needsAdmin = cmd.action !== 'read' && !isAdmin
                        const svcFailed = connInfo?.failedServices.includes(cmd.id)
                        // Commands using Invoke-Command require WinRM
                        const needsWinRM = !cmd.local && !psCmd.startsWith('ping') && !psCmd.startsWith('tracert')
                        const winrmBlocked = needsWinRM && connInfo?.winrmOk === false

                        const actionColor = cmd.action === 'critical'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                          : cmd.action === 'write'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                          : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'

                        return (
                          <div key={cmd.id}>
                            <div className={`grid grid-cols-[1fr_1fr_auto_auto] gap-0 items-start py-2 hover:bg-accent/10 transition-colors ${svcFailed || winrmBlocked ? 'opacity-40' : ''}`}>
                              {/* Function + when */}
                              <div className="px-4">
                                <p className="text-xs font-medium text-foreground">{cmd.func}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{cat.commands.find(c => c.id === cmd.id)?.when}</p>
                                {cmd.local && <span className="text-[10px] text-blue-400 mt-0.5 block">Lokal (Admin-PC)</span>}
                                {cmd.longRunning && <span className="text-[10px] text-amber-400 mt-0.5 block">⏳ Kann Minuten dauern</span>}
                              </div>
                              {/* Command preview */}
                              <div className="px-4 flex items-center gap-1">
                                <code className="text-[10px] text-muted-foreground font-mono bg-muted/30 px-1.5 py-0.5 rounded truncate max-w-[200px] block" title={psCmd}>
                                  {displayCmd}
                                </code>
                                <CopyButton text={psCmd} />
                              </div>
                              {/* Input */}
                              <div className="px-4 w-44">
                                {cmd.fileAction && (
                                  <span className="text-[10px] text-blue-400 italic">
                                    {cmd.fileAction === 'install' ? '📁 Datei wählen beim Ausführen' : '📁 Dateien wählen beim Ausführen'}
                                  </span>
                                )}
                                {cmd.privacyConsent && (
                                  <span className="text-[10px] text-amber-400 italic">⚠ Datenschutz-Einwilligung</span>
                                )}
                                {!cmd.fileAction && !cmd.privacyConsent && cmd.input?.type === 'text' && (
                                  <div className="space-y-1">
                                    <input
                                      type="text"
                                      placeholder={cmd.input.placeholder}
                                      value={inputVal}
                                      onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                      className="w-full px-2 py-1 text-[11px] rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                    />
                                    {cmd.templates && cmd.templates.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {cmd.templates.map(t => (
                                          <button
                                            key={t.label}
                                            type="button"
                                            onClick={() => setInputs(prev => ({ ...prev, [key]: t.value }))}
                                            className="px-1.5 py-0.5 text-[9px] rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors truncate max-w-[80px]"
                                            title={t.value}
                                          >
                                            {t.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {cmd.input?.type === 'dropdown' && (
                                  <select
                                    value={inputVal || cmd.input.options?.[0] || ''}
                                    onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-full px-2 py-1 text-[11px] rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary"
                                  >
                                    {cmd.input.options?.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                )}
                              </div>
                              {/* Action button */}
                              <div className="px-4 w-28">
                                {needsAdmin ? (
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Lock size={10} /> Admin
                                  </div>
                                ) : svcFailed ? (
                                  <span className="text-[10px] text-red-400">Dienst fehlt</span>
                                ) : winrmBlocked ? (
                                  <span className="text-[10px] text-red-400">WinRM fehlt</span>
                                ) : (
                                  <button
                                    onClick={() => runCommand(cat, cmd)}
                                    disabled={!inputOk || out?.status === 'running'}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${actionColor}`}
                                  >
                                    {out?.status === 'running'
                                      ? <Loader size={11} className="animate-spin" />
                                      : <Play size={11} />}
                                    Ausführen
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Output area */}
                            {out && (
                              <div className={`mx-4 mb-2 rounded-md border overflow-hidden ${out.status === 'error' ? 'border-red-500/30 bg-red-500/5' : out.status === 'running' ? 'border-blue-500/30 bg-blue-500/5' : 'border-border bg-muted/10'}`}>
                                {out.status === 'running' ? (
                                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-blue-400">
                                    <Loader size={12} className="animate-spin" />
                                    {cmd.longRunning ? 'Wird ausgeführt… kann einige Minuten dauern' : 'Wird ausgeführt…'}
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
                                      <span className={`text-[10px] font-medium shrink-0 ${out.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {out.status === 'error' ? '✕' : '✓'}
                                      </span>
                                      <span className="text-[11px] text-foreground font-medium flex-1 truncate">{out.label}</span>
                                      <span className="text-[10px] text-muted-foreground shrink-0">{out.timestamp.toLocaleTimeString('de-DE')}</span>
                                      <CopyButton text={out.text} />
                                      <button
                                        onClick={() => setExportDialog({ label: out.label, text: out.text })}
                                        title="Exportieren"
                                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        <Download size={11} />
                                      </button>
                                      <button
                                        onClick={() => setOutputs(prev => { const n = { ...prev }; delete n[key]; return n })}
                                        title="Ergebnis löschen"
                                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-red-400 transition-colors"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                      <button
                                        onClick={() => setOutputs(prev => ({ ...prev, [key]: { ...prev[key], collapsed: !prev[key].collapsed } }))}
                                        title={out.collapsed ? 'Aufklappen' : 'Zuklappen'}
                                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        {out.collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                                      </button>
                                    </div>
                                    {!out.collapsed && (
                                      <div className="px-3 py-2 max-h-72 overflow-y-auto">
                                        {formatOutput(out.text, cat.id, cmd.id, handleUninstall)}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Export dialog ─────────────────────────────────────────────────── */}
      {exportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-5 w-[360px] shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Download size={15} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Ergebnis exportieren</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Format wählen für <span className="font-medium text-foreground">„{exportDialog.label}"</span>:
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  const path = await api().saveFileDialog(`${exportDialog.label}.xlsx`, [{ name: 'Excel', extensions: ['xlsx'] }])
                  if (path) { await exportRemoteDocResultExcel(exportDialog.label, exportDialog.text, path); setExportDialog(null) }
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors"
              >
                <Download size={13} className="text-emerald-400" /> Excel (.xlsx)
              </button>
              <button
                onClick={async () => {
                  const path = await api().saveFileDialog(`${exportDialog.label}.docx`, [{ name: 'Word', extensions: ['docx'] }])
                  if (path) { await exportRemoteDocResultWord(exportDialog.label, exportDialog.text, path); setExportDialog(null) }
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors"
              >
                <Download size={13} className="text-blue-400" /> Word (.docx)
              </button>
              <button
                onClick={async () => {
                  const path = await api().saveFileDialog(`${exportDialog.label}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }])
                  if (path) { await exportRemoteDocResultPdf(exportDialog.label, exportDialog.text, path); setExportDialog(null) }
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors"
              >
                <Download size={13} className="text-red-400" /> PDF (.pdf)
              </button>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setExportDialog(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Privacy consent dialog (screenshot) ─────────────────────────── */}
      {consentPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-amber-500/40 rounded-xl p-5 w-[440px] shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground">Datenschutz-Hinweis</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sie sind dabei, einen <span className="font-semibold text-amber-400">Remote-Screenshot</span> des Bildschirms von{' '}
              <span className="font-mono text-foreground">{h}</span> aufzunehmen.
            </p>
            <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
              <p className="font-semibold">Datenschutz-Hinweis:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Der Screenshot zeigt den aktuellen Bildschirminhalt des Benutzers</li>
                <li>Diese Aktion wird im Aktivitätslog protokolliert</li>
                <li>Nur für Support-Zwecke im Rahmen der IT-Richtlinien verwenden</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConsentPending(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors">
                Abbrechen
              </button>
              <button
                onClick={() => {
                  const { cmdKey, label, command } = consentPending
                  setConsentPending(null)
                  executeCommand(cmdKey, command, false, label)
                }}
                className="px-4 py-2 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
              >
                Zustimmen & Screenshot aufnehmen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation dialog ───────────────────────────────────────────── */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`bg-card border rounded-xl p-5 w-[480px] shadow-2xl space-y-4 ${confirm.critical ? 'border-red-500/40' : 'border-amber-500/40'}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className={confirm.critical ? 'text-red-400' : 'text-amber-400'} />
              <h3 className="text-sm font-semibold text-foreground">Sicherheitsabfrage</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Folgender Befehl wird auf <span className="font-mono text-foreground">{h}</span> ausgeführt:
            </p>
            <div className="flex items-start gap-1 bg-muted/30 rounded p-2">
              <code className="text-[11px] font-mono text-foreground flex-1 whitespace-pre-wrap break-all">{confirm.command.slice(0, 400)}</code>
              <CopyButton text={confirm.command} />
            </div>
            {confirm.critical && (
              <p className="text-xs text-red-400 font-medium">⚠️ Dieser Befehl kann den Arbeitsfluss des Benutzers unterbrechen!</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors">
                Abbrechen
              </button>
              <button
                onClick={() => executeCommand(confirm.cmdKey, confirm.command, undefined, confirm.label)}
                className={`px-4 py-2 text-sm rounded-md text-white transition-colors ${confirm.critical ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              >
                Ausführen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
