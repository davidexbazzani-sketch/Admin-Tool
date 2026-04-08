import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, Play, Copy, Check,
  Loader, CheckCircle, XCircle, AlertTriangle,
  ChevronsDownUp, ChevronsUpDown, Lock, Terminal,
  Download, Trash2, PackageX, Search, Info, X, Lightbulb,
} from 'lucide-react'
import {
  exportRemoteDocResultExcel,
  exportRemoteDocResultWord,
  exportRemoteDocResultPdf,
} from '../utils/exportUtils'
import { Star } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../electronAPI'
import { ServicePanel } from '../components/ServicePanel'
import { CATEGORIES, type ActionType, type CmdDef, type Category, setExecMethod, setPsExecDir, getPsExecDir, type ExecMethod } from '../utils/remoteCommands'
import { loadFavorites, saveFavorites, addSkill, removeSkill, isSkillFavorite } from '../utils/favorites'
import type { FavoritesData } from '../types/favorites'
import { buildSearchIndex, searchSkills, type SearchResult, type SkillDescription } from '../utils/remoteDocSearch'
import WinRMActivationModal from '../components/WinRMActivationModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckStatus = 'pending' | 'running' | 'ok' | 'warn' | 'error'

interface ServiceCheck {
  id: string
  label: string
  status: CheckStatus
  detail?: string
}

type ConnectionMode = 'full' | 'wmi' | 'psexec' | 'schtasks' | 'none'

interface ConnInfo {
  user: string
  model: string
  ram: string
  os: string
  lastBoot: string
  allOk: boolean
  winrmOk: boolean
  connectionMode: ConnectionMode  // full = WinRM, restricted = CIM/DCOM fallback
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
  // Determine if we should use card layout (many columns or long values)
  const useCards = headers.length > 5 || rows.some(r => r.some(c => c.length > 60))
  if (useCards && rows.length > 0) {
    // Card layout: each row as a card with key-value pairs
    return (
      <div className="space-y-2 p-1">
        <p className="text-[9px] text-muted-foreground px-1">{sorted.length} Einträge — Klicke auf Spaltenname zum Sortieren</p>
        <div className="flex flex-wrap gap-1 px-1 mb-1">
          {headers.map((h, i) => (
            <button key={h} onClick={() => toggleSort(i)}
              className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${sortCol === i ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:bg-accent'}`}>
              {h}{sortCol === i && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
          ))}
        </div>
        {sorted.map((row, i) => (
          <div key={i} className={`rounded-lg border border-border p-2.5 space-y-1 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
            {headers.map((h, j) => {
              const val = row[j]
              if (!val || val === '—' || val === '' || val === 'null' || val === 'undefined') return null
              return (
                <div key={h} className="flex gap-2 text-[11px]">
                  <span className="text-muted-foreground shrink-0 w-32 font-medium">{h}:</span>
                  <span className="text-foreground break-words">{val}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }
  // Standard table layout for compact data
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
            <tr key={i} className={`hover:bg-accent/20 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1.5 text-foreground max-w-[300px] break-words" title={cell.length > 50 ? cell : undefined}>
                  {cell.length > 80 ? cell.slice(0, 77) + '…' : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type SoftwareItem = {
  DisplayName: string
  DisplayVersion?: string
  Publisher?: string
  PSChildName?: string      // product code if MSI, e.g. {GUID}
  UninstallString?: string
}

function SoftwareTable({ items, onUninstall, onRepair }: {
  items: SoftwareItem[]
  onUninstall?: (name: string) => void
  onRepair?: (name: string, productCode: string) => void
}) {
  const [query, setQuery] = useState('')
  const [sortCol, setSortCol] = useState(0)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const cols = ['DisplayName', 'DisplayVersion', 'Publisher'] as const
  const hasActions = !!(onUninstall || onRepair)
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
              {hasActions && <th className="px-2 py-1.5 w-40" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((it, i) => {
              const isMsi = !!(it.PSChildName?.startsWith('{'))
              return (
              <tr key={i} className={i % 2 === 0 ? 'bg-muted/5' : ''}>
                <td className="px-2 py-1 text-foreground max-w-[240px] truncate" title={it.DisplayName}>{it.DisplayName}</td>
                <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">{it.DisplayVersion ?? '—'}</td>
                <td className="px-2 py-1 text-muted-foreground max-w-[160px] truncate" title={it.Publisher ?? ''}>{it.Publisher ?? '—'}</td>
                {hasActions && (
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      {onUninstall && (
                        <button
                          onClick={() => onUninstall(it.DisplayName)}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                          <PackageX size={10} /> Deinstall.
                        </button>
                      )}
                      {onRepair && (
                        <button
                          onClick={() => isMsi && onRepair(it.DisplayName, it.PSChildName!)}
                          disabled={!isMsi}
                          title={isMsi ? 'MSI-Reparatur ausführen' : 'Nur bei MSI-Programmen verfügbar'}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Reparieren
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RemoteDoc() {
  const isAdmin  = useAppStore((s) => s.isAdmin)
  const devices  = useAppStore((s) => s.devices)

  // Pre-fill hostname when coming from LocationOverview (devices contains exactly one host)
  const pendingHost = devices.length === 1 ? (devices[0].resolvedHostnames[0] ?? '') : ''

  const [hostname, setHostname]     = useState(pendingHost)
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
  // Fallback dialog (when WinRM fails)
  const [showFallbackDialog, setShowFallbackDialog] = useState(false)
  const [fallbackActivating, setFallbackActivating] = useState(false)

  // Event explanations database
  const [eventExplanations, setEventExplanations] = useState<Record<string, { title: string; severity: string; explanation: string; solution: string }> | null>(null)
  const [eventInfoPopup, setEventInfoPopup] = useState<{ id: string; title: string; severity: string; explanation: string; solution: string } | null>(null)
  useEffect(() => {
    async function loadExpl() {
      let d = await api().netReadJson<{ events: Record<string, unknown> }>('knowledge_base/event_explanations.json')
      if (!d) d = await api().netReadJson<{ events: Record<string, unknown> }>('event_explanations.json')
      if (d?.events) setEventExplanations(d.events as typeof eventExplanations)
    }
    loadExpl()
  }, [])

  const abortRef = useRef(false)

  // ── Favorites ─────────────────────────────────────────────────────────────────
  const favUser = useAuthStore(s => s.session?.user?.username)
  const [favData, setFavData] = useState<FavoritesData>({ devices: [], skills: [] })
  useEffect(() => {
    if (favUser) loadFavorites(favUser).then(setFavData)
  }, [favUser])

  // ── Skill descriptions (lazy loaded) ──────────────────────────────────────
  const [skillDescs, setSkillDescs] = useState<Record<string, { kurz: string; info: { wasPassiert: string; wannBenutzen: string[]; zuBeachten: string[]; kombiniertMit: string[]; neustartNoetig: boolean; risikoLevel: string; geschaetzteDauer: string } }> | null>(null)
  const [infoPopup, setInfoPopup] = useState<{ catId: string; cmdId: string } | null>(null)
  useEffect(() => {
    async function loadDescs() {
      // Try both paths (basePath might already include knowledge_base)
      let d = await api().netReadJson<Record<string, unknown>>('knowledge_base/skill_descriptions.json')
      if (!d) d = await api().netReadJson<Record<string, unknown>>('skill_descriptions.json')
      if (d) {
        console.log('[RemoteDoc] skill_descriptions loaded:', Object.keys(d).length, 'skills')
        setSkillDescs(d as typeof skillDescs)
        buildSearchIndex(CATEGORIES, d as Record<string, SkillDescription>)
      } else {
        console.log('[RemoteDoc] skill_descriptions not found — building index from CATEGORIES only')
        buildSearchIndex(CATEGORIES, null)
      }
    }
    loadDescs().catch(() => buildSearchIndex(CATEGORIES, null))
  }, [])

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedResultIdx, setSelectedResultIdx] = useState(-1)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!searchQuery.trim()) {
      setSearchResults([])
      setSelectedResultIdx(-1)
      return
    }
    searchDebounceRef.current = setTimeout(() => {
      const results = searchSkills(searchQuery)
      setSearchResults(results)
      setSelectedResultIdx(-1)
    }, 150)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [searchQuery])

  // Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        setSearchFocused(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setSearchQuery('')
      setSearchResults([])
      setSearchFocused(false)
      searchInputRef.current?.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedResultIdx(prev => Math.min(prev + 1, searchResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedResultIdx(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && selectedResultIdx >= 0 && searchResults[selectedResultIdx]) {
      e.preventDefault()
      const r = searchResults[selectedResultIdx]
      const cat = CATEGORIES.find(c => c.id === r.catId)
      if (cat) {
        runCommand(cat, r.cmd)
        setRecentSearches(prev => [searchQuery, ...prev.filter(s => s !== searchQuery)].slice(0, 5))
        setSearchQuery('')
        setSearchResults([])
      }
    }
  }

  async function toggleFavSkill(cat: Category, cmd: CmdDef) {
    if (!favUser) return
    const skillId = `rd::${cat.id}::${cmd.id}`
    let updated: FavoritesData
    if (isSkillFavorite(favData, skillId)) {
      updated = removeSkill(favData, skillId)
    } else {
      updated = addSkill(favData, { skillId, label: cmd.func, category: cat.label, source: 'remote-doc' })
    }
    setFavData(updated)
    await saveFavorites(favUser, updated)
  }

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

    // ── LOCAL MODE: Skip ping/WinRM, connect directly ──────────────────
    const { getLocalMode } = await import('../utils/remoteCommands')
    if (getLocalMode()) {
      setChecks([
        { id: 'ping', label: 'Erreichbarkeit', status: 'ok', detail: 'Lokaler Modus' },
        { id: 'winrm', label: 'WinRM', status: 'ok', detail: 'Lokaler Modus — nicht benötigt' },
        { id: 'info', label: 'Geräteinformationen', status: 'running' },
      ])
      try {
        const infoRes = await api().runPowerShell([
          `$cs = Get-CimInstance Win32_ComputerSystem`,
          `$os = Get-CimInstance Win32_OperatingSystem`,
          `@{user=$cs.UserName;model="$($cs.Manufacturer) $($cs.Model)";ram="$([math]::Round($cs.TotalPhysicalMemory/1GB,1)) GB";os=$os.Caption;lastBoot=$os.LastBootUpTime.ToString('dd.MM.yyyy HH:mm')} | ConvertTo-Json -Compress`,
        ].join('; '), 10000)
        const info = JSON.parse(infoRes.stdout?.trim() || '{}')
        setCheck('info', { status: 'ok', detail: 'Lokaler Modus' })
        setConnInfo({
          user: info.user || '—', model: info.model || '—', ram: info.ram || '—',
          os: info.os || '—', lastBoot: info.lastBoot || '—',
          allOk: true, winrmOk: true, connectionMode: 'full', failedServices: [],
        })
      } catch {
        setCheck('info', { status: 'ok', detail: 'Lokaler Modus' })
        setConnInfo({
          user: 'Lokaler Modus', model: '—', ram: '—', os: '—', lastBoot: '—',
          allOk: true, winrmOk: true, connectionMode: 'full', failedServices: [],
        })
      }
      setConnecting(false)
      return
    }
    // ── END LOCAL MODE ──────────────────────────────────────────────────
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
            // Final result: all WinRM methods failed → show fallback dialog
            const errDetail = String(obj.error || '')
            setCheck('winrm', { status: 'error', detail: 'Nicht verfügbar — Fallback möglich' })
            if (errDetail) setConnErrorDetail(errDetail)
            // Don't return! Show fallback dialog instead
            setShowFallbackDialog(true)
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
            connectionMode: 'full',
            failedServices: [],
          })
          setExecMethod('winrm')
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

  // ── Fallback: Restricted connection via CIM/DCOM ───────────────────────────
  async function connectWithFallback() {
    const h = hostname.trim()
    setShowFallbackDialog(false)
    setConnecting(true)
    setConnError('')

    // Device info script (runs locally on target via any method)
    const infoScript = [
      `$r = @{ user='N/A'; model='N/A'; ram='N/A'; os='N/A'; lastBoot='N/A' }`,
      `try {`,
      `  $cs = Get-CimInstance Win32_ComputerSystem -EA Stop`,
      `  $r.user = $cs.UserName; $r.model = "$($cs.Manufacturer) $($cs.Model)"; $r.ram = "$([math]::Round($cs.TotalPhysicalMemory/1GB,1)) GB"`,
      `} catch {}`,
      `try {`,
      `  $osI = Get-CimInstance Win32_OperatingSystem -EA Stop`,
      `  $r.os = $osI.Caption; $r.lastBoot = $osI.LastBootUpTime.ToString('dd.MM.yyyy HH:mm')`,
      `} catch {}`,
      `$r | ConvertTo-Json -Compress`,
    ].join('\n')

    type ProbeResult = { method: ExecMethod; mode: ConnectionMode; label: string }
    const probes: { method: ExecMethod; mode: ConnectionMode; label: string; test: () => Promise<boolean> }[] = [
      // Probe 1: WMI Process Create
      {
        method: 'wmi', mode: 'wmi', label: 'WMI Process Create',
        test: async () => {
          setCheck('winrm', { status: 'running', detail: 'Teste WMI Process Create...' })
          const guid = Math.random().toString(36).slice(2)
          const share = '\\\\\\\\' + h + '\\\\C$\\\\Temp'
          const r = await api().runPowerShell([
            '$unc = "' + share + '"',
            `if (-not (Test-Path $unc)) { New-Item -Path $unc -ItemType Directory -Force | Out-Null }`,
            `$wmi = Invoke-WmiMethod -ComputerName '${h}' -Class Win32_Process -Name Create -ArgumentList "cmd /c echo WMI_OK > C:\\Temp\\wmiprobe_${guid}.txt" -EA Stop`,
            `Start-Sleep -Seconds 3`,
            `$result = if (Test-Path "$unc\\wmiprobe_${guid}.txt") { Get-Content "$unc\\wmiprobe_${guid}.txt" -Raw } else { 'FAIL' }`,
            `Remove-Item "$unc\\wmiprobe_${guid}.txt" -Force -EA SilentlyContinue`,
            `if ($result -match 'WMI_OK') { Write-Output 'PROBE_OK' } else { Write-Output 'PROBE_FAIL' }`,
          ].join('\n'), 15000)
          return r.stdout?.includes('PROBE_OK') ?? false
        },
      },
      // Probe 2: PsExec
      {
        method: 'psexec', mode: 'psexec', label: 'PsExec',
        test: async () => {
          setCheck('winrm', { status: 'running', detail: 'Teste PsExec...' })
          const dir = getPsExecDir().replace(/\\+$/, '')
          const r = await api().runPowerShell([
            `$p64 = '${dir}\\PsExec64.exe'; $p32 = '${dir}\\PsExec.exe'`,
            `$psExe = if (Test-Path $p64) { $p64 } elseif (Test-Path $p32) { $p32 } else { $null }`,
            `if (-not $psExe) { Write-Output 'NO_PSEXEC'; exit }`,
            `$r = & $psExe "\\\\${h}" -s -accepteula cmd /c "echo PSEXEC_OK" 2>&1`,
            `if (($r -join ' ') -match 'PSEXEC_OK') { Write-Output 'PROBE_OK' } else { Write-Output 'PROBE_FAIL' }`,
          ].join('\n'), 20000)
          return r.stdout?.includes('PROBE_OK') ?? false
        },
      },
      // Probe 3: schtasks
      {
        method: 'schtasks', mode: 'schtasks', label: 'Geplante Aufgabe (schtasks)',
        test: async () => {
          setCheck('winrm', { status: 'running', detail: 'Teste schtasks...' })
          const guid = Math.random().toString(36).slice(2)
          const share = '\\\\\\\\' + h + '\\\\C$\\\\Temp'
          const r = await api().runPowerShell([
            '$unc = "' + share + '"',
            `if (-not (Test-Path $unc)) { New-Item -Path $unc -ItemType Directory -Force | Out-Null }`,
            `schtasks /create /s ${h} /tn "ITProbe_${guid}" /tr "cmd /c echo SCHTASK_OK > C:\\Temp\\schprobe_${guid}.txt" /sc once /st 00:00 /ru SYSTEM /rl HIGHEST /f 2>&1 | Out-Null`,
            `schtasks /run /s ${h} /tn "ITProbe_${guid}" 2>&1 | Out-Null`,
            `Start-Sleep -Seconds 4`,
            `$result = if (Test-Path "$unc\\schprobe_${guid}.txt") { Get-Content "$unc\\schprobe_${guid}.txt" -Raw } else { 'FAIL' }`,
            `schtasks /delete /s ${h} /tn "ITProbe_${guid}" /f 2>&1 | Out-Null`,
            `Remove-Item "$unc\\schprobe_${guid}.txt" -Force -EA SilentlyContinue`,
            `if ($result -match 'SCHTASK_OK') { Write-Output 'PROBE_OK' } else { Write-Output 'PROBE_FAIL' }`,
          ].join('\n'), 20000)
          return r.stdout?.includes('PROBE_OK') ?? false
        },
      },
    ]

    let foundMethod: ProbeResult | null = null
    for (const probe of probes) {
      try {
        if (await probe.test()) {
          foundMethod = { method: probe.method, mode: probe.mode, label: probe.label }
          break
        }
      } catch { /* try next */ }
    }

    if (foundMethod) {
      setExecMethod(foundMethod.method)
      setCheck('winrm', { status: 'warn', detail: `Verbunden via ${foundMethod.label}` })

      // Get device info using the found method
      try {
        let infoJson = '{}'
        if (foundMethod.method === 'wmi') {
          // Use CIM/DCOM for info (faster than WMI Process Create)
          const infoRes = await api().runPowerShell([
            `try {`,
            `  $so = New-CimSessionOption -Protocol Dcom`,
            `  $cs = New-CimSession -ComputerName '${h}' -SessionOption $so -EA Stop`,
            `  $sys = Get-CimInstance Win32_ComputerSystem -CimSession $cs -EA SilentlyContinue`,
            `  $osI = Get-CimInstance Win32_OperatingSystem -CimSession $cs -EA SilentlyContinue`,
            `  $r = @{ user='N/A'; model='N/A'; ram='N/A'; os='N/A'; lastBoot='N/A' }`,
            `  if($sys) { $r.user = $sys.UserName; $r.model = "$($sys.Manufacturer) $($sys.Model)"; $r.ram = "$([math]::Round($sys.TotalPhysicalMemory/1GB,1)) GB" }`,
            `  if($osI) { $r.os = $osI.Caption; $r.lastBoot = $osI.LastBootUpTime.ToString('dd.MM.yyyy HH:mm') }`,
            `  Remove-CimSession $cs`,
            `  $r | ConvertTo-Json -Compress`,
            `} catch { @{user='N/A';model='N/A';ram='N/A';os='N/A';lastBoot='N/A'} | ConvertTo-Json -Compress }`,
          ].join('\n'), 15000)
          infoJson = infoRes.stdout?.trim() || '{}'
        } else {
          // Use WMI for basic info
          const infoRes = await api().runPowerShell([
            `try {`,
            `  $sys = Get-WmiObject Win32_ComputerSystem -ComputerName '${h}' -EA Stop`,
            `  $osI = Get-WmiObject Win32_OperatingSystem -ComputerName '${h}' -EA Stop`,
            `  $r = @{ user='N/A'; model='N/A'; ram='N/A'; os='N/A'; lastBoot='N/A' }`,
            `  if($sys) { $r.user = $sys.UserName; $r.model = "$($sys.Manufacturer) $($sys.Model)"; $r.ram = "$([math]::Round($sys.TotalPhysicalMemory/1GB,1)) GB" }`,
            `  if($osI) { $r.os = $osI.Caption; $r.lastBoot = $osI.LastBootUpTime }`,
            `  $r | ConvertTo-Json -Compress`,
            `} catch { @{user='N/A';model='N/A';ram='N/A';os='N/A';lastBoot='N/A'} | ConvertTo-Json -Compress }`,
          ].join('\n'), 15000)
          infoJson = infoRes.stdout?.trim() || '{}'
        }
        const raw = JSON.parse(infoJson)
        setCheck('info', { status: raw.user !== 'N/A' ? 'ok' : 'warn', detail: `Via ${foundMethod.label}` })
        setConnInfo({
          user: raw.user || '—', model: raw.model || '—', ram: raw.ram || '—',
          os: raw.os || '—', lastBoot: raw.lastBoot || '—',
          allOk: true, winrmOk: false,
          connectionMode: foundMethod.mode,
          failedServices: [],
        })
      } catch {
        setCheck('info', { status: 'warn', detail: 'Info nicht abrufbar' })
        setConnInfo({
          user: '—', model: '—', ram: '—', os: '—', lastBoot: '—',
          allOk: true, winrmOk: false,
          connectionMode: foundMethod.mode,
          failedServices: [],
        })
      }
    } else {
      setCheck('winrm', { status: 'error', detail: 'Keine Verbindungsmethode verfügbar' })
      setConnError('Weder WinRM, WMI, PsExec noch schtasks verfügbar. Nur lokale Befehle (Ping, DNS) möglich.')
      setConnInfo({
        user: '—', model: '—', ram: '—', os: '—', lastBoot: '—',
        allOk: false, winrmOk: false, connectionMode: 'none',
        failedServices: [],
      })
    }
    setConnecting(false)
  }

  // ── Fallback: Try to activate WinRM remotely ─────────────────────────────
  async function activateWinRM() {
    const h = hostname.trim()
    setFallbackActivating(true)
    setShowFallbackDialog(false)

    const methods = [
      { name: 'CIM/DCOM', script: `$so=New-CimSessionOption -Protocol Dcom; $cs=New-CimSession -ComputerName '${h}' -SessionOption $so; Invoke-CimMethod -CimSession $cs -ClassName Win32_Service -MethodName StartService -Filter "Name='WinRM'"; Remove-CimSession $cs; Write-Output 'OK'` },
      { name: 'sc.exe', script: `$r = sc.exe "\\\\${h}" start WinRM 2>&1; Write-Output $r` },
      { name: 'schtasks', script: `schtasks /create /s ${h} /tn "EnableWinRM" /tr "powershell -Command Enable-PSRemoting -Force" /sc once /st 00:00 /ru SYSTEM /f 2>&1; schtasks /run /s ${h} /tn "EnableWinRM" 2>&1; Start-Sleep -Seconds 10; schtasks /delete /s ${h} /tn "EnableWinRM" /f 2>&1; Write-Output 'OK'` },
    ]

    for (const m of methods) {
      setCheck('winrm', { status: 'running', detail: `WinRM aktivieren via ${m.name}...` })
      try {
        const res = await api().runPowerShell(m.script, 20000)
        if (res.stdout?.includes('OK') || res.exitCode === 0) {
          // Verify WinRM is now running
          const verify = await api().runPowerShell(`Test-WSMan -ComputerName '${h}' -EA Stop | Out-Null; Write-Output 'OK'`, 5000)
          if (verify.stdout?.includes('OK')) {
            setCheck('winrm', { status: 'ok', detail: `Aktiviert via ${m.name}` })
            setFallbackActivating(false)
            // Re-run full connection
            doConnect()
            return
          }
        }
      } catch { /* try next method */ }
    }

    setCheck('winrm', { status: 'error', detail: 'Aktivierung fehlgeschlagen' })
    setFallbackActivating(false)
    // Offer restricted mode
    setShowFallbackDialog(true)
  }

  // Auto-connect when navigating from LocationOverview with a pre-filled hostname
  useEffect(() => {
    if (pendingHost) doConnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    console.log('[RemoteDoc] executeCommand key=%s\n--- PS script ---\n%s\n-----------------', key, psCmd)
    const result = await api().runPowerShell(psCmd, 300000)
    console.log('[RemoteDoc] result exitCode=%d stdout=%s stderr=%s', result.exitCode, result.stdout?.slice(0, 500), result.stderr?.slice(0, 200))
    const out = result.stdout || result.stderr || '(keine Ausgabe)'
    // For structured JSON results (e.g. drive mapping), check the success field too
    let isError = result.exitCode !== 0 || out.startsWith('ERR:') || out.startsWith('"ERR:')
    if (!isError) {
      try {
        const j = JSON.parse(out)
        if (typeof j === 'object' && j !== null && 'success' in j && j.success === false) isError = true
      } catch { /* not JSON, keep current isError */ }
    }
    setOutputs(prev => ({ ...prev, [key]: { ...prev[key], status: isError ? 'error' : 'ok', text: out } }))
  }

  function formatOutput(
    text: string,
    catId?: string,
    cmdId?: string,
    onUninstall?: (name: string) => void,
    onRepair?: (name: string, productCode: string) => void,
  ): React.ReactNode {
    // Detect base64 image (legacy bare-base64 screenshot result)
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
    // Structured screenshot result {success, image, error}
    if (catId === 'screenshot' && cmdId === 'screencap') {
      try {
        const ss = JSON.parse(text) as { success?: boolean; image?: string; error?: string }
        if (ss.success && ss.image) {
          return (
            <div className="p-2">
              <img src={`data:image/png;base64,${ss.image}`} alt="Screenshot"
                className="max-w-full rounded border border-border cursor-pointer"
                onClick={() => window.open(`data:image/png;base64,${ss.image}`, '_blank')} />
              <p className="text-[10px] text-muted-foreground mt-1">Klick zum Vergrößern</p>
            </div>
          )
        }
        return <p className="text-xs text-red-400 px-2 py-2">Screenshot-Fehler: {ss.error || 'Unbekannter Fehler'}</p>
      } catch { /* fall through to normal rendering */ }
    }
    try {
      // Double-parse: some PS commands call ConvertTo-Json inside remote() ScriptBlock,
      // causing the outer remote() wrapper to JSON-encode the already-encoded string.
      let parsed = JSON.parse(text)
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed) } catch { /* keep as string */ }
      }

      // ── Strip PS remoting metadata and unwrap "value" field ────────────
      function stripPSMetadata(obj: unknown): unknown {
        if (Array.isArray(obj)) {
          return obj.map(item => stripPSMetadata(item))
        }
        if (typeof obj === 'object' && obj !== null) {
          const o = obj as Record<string, unknown>
          // Remove PS remoting fields
          const hasPSMeta = 'PSComputerName' in o || 'RunspaceId' in o || 'PSShowComputerName' in o
          if (hasPSMeta) {
            const cleaned: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(o)) {
              if (k !== 'PSComputerName' && k !== 'RunspaceId' && k !== 'PSShowComputerName') {
                cleaned[k] = v
              }
            }
            // If only "value" remains, unwrap it
            const keys = Object.keys(cleaned)
            if (keys.length === 1 && keys[0] === 'value') {
              const val = cleaned.value
              if (typeof val === 'string') {
                try { return JSON.parse(val) } catch { return val }
              }
              return val
            }
            return cleaned
          }
        }
        return obj
      }
      parsed = stripPSMetadata(parsed)

      // Double-parse again after stripping (value field might be a JSON string)
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed) } catch { /* keep as string */ }
      }

      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return <span className="text-muted-foreground text-[11px]">(keine Einträge)</span>
        if (typeof parsed[0] === 'object' && parsed[0] !== null) {
          // Software list: special table with search + uninstall + repair buttons
          const first = parsed[0] as Record<string, unknown>
          if (catId === 'software' && cmdId === 'swlist' && 'DisplayName' in first) {
            return (
              <SoftwareTable
                items={parsed as SoftwareItem[]}
                onUninstall={onUninstall}
                onRepair={onRepair}
              />
            )
          }
          const headers = Object.keys(first)
          // Detect if this is event log data (has ID or Ereignis-ID column)
          const idCol = headers.findIndex(h => h === 'ID' || h === 'Ereignis-ID' || h === 'Id')
          const isEventData = idCol >= 0 && catId === 'eventlogs' && eventExplanations

          if (isEventData) {
            // Event-Log table with [i] explanation buttons
            const items = parsed as Record<string, unknown>[]
            return (
              <div className="space-y-0">
                {items.map((item, idx) => {
                  const eventId = String(item[headers[idCol]] ?? '')
                  const expl = eventExplanations?.[eventId]
                  const sevColors: Record<string, string> = { critical: 'border-l-red-400', error: 'border-l-red-400', warning: 'border-l-amber-400', info: 'border-l-blue-400' }
                  const borderColor = expl ? (sevColors[expl.severity] ?? 'border-l-border') : 'border-l-border'
                  return (
                    <div key={idx} className={`border-l-2 ${borderColor} ${idx % 2 === 0 ? 'bg-muted/5' : ''} px-3 py-2`}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-0.5">
                          {headers.map(h => {
                            const val = String(item[h] ?? '—')
                            if (!val || val === '—') return null
                            return (
                              <div key={h} className="flex gap-2 text-[11px]">
                                <span className="text-muted-foreground w-28 shrink-0 font-medium">{h}:</span>
                                <span className="text-foreground break-words flex-1">{val}</span>
                              </div>
                            )
                          })}
                        </div>
                        {expl && (
                          <button onClick={() => setEventInfoPopup({ id: eventId, ...expl })}
                            className="p-1 rounded hover:bg-accent shrink-0 mt-0.5" title={`Event ${eventId}: ${expl.title}`}>
                            <Info size={13} className="text-blue-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }

          const rows = (parsed as Record<string, unknown>[]).map(item => headers.map(h => String(item[h] ?? '—')))
          return <SortableTable headers={headers} rows={rows} />
        }
        // Array of simple strings — render as clean numbered list
        return (
          <div className="space-y-0">
            {(parsed as string[]).map((item, i) => (
              <div key={i} className={`px-3 py-1.5 text-[11px] text-foreground flex gap-2 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
                <span className="text-muted-foreground w-6 text-right shrink-0">{i + 1}.</span>
                <span className="break-words">{String(item)}</span>
              </div>
            ))}
          </div>
        )
      }
      if (typeof parsed === 'object' && parsed !== null) {
        const pairs = Object.entries(parsed as Record<string, unknown>)
        return (
          <div className="divide-y divide-border">
            {pairs.map(([k, v], i) => {
              // Format values nicely
              let displayVal = ''
              if (v === null || v === undefined) displayVal = '—'
              else if (typeof v === 'boolean') displayVal = v ? '✅ Ja' : '❌ Nein'
              else if (typeof v === 'number') displayVal = v.toLocaleString('de-DE')
              else if (Array.isArray(v)) displayVal = v.map(String).join(', ')
              else if (typeof v === 'object') displayVal = JSON.stringify(v, null, 2)
              else displayVal = String(v)

              // Color-code certain values
              const valLower = displayVal.toLowerCase()
              const isGood = valLower === 'true' || valLower === 'running' || valLower === 'ok' || valLower === 'healthy' || valLower === 'online' || valLower === 'enabled' || valLower.includes('✅')
              const isBad = valLower === 'false' || valLower === 'stopped' || valLower === 'error' || valLower === 'disabled' || valLower === 'offline' || valLower.includes('❌')
              const valColor = isGood ? 'text-emerald-400' : isBad ? 'text-red-400' : 'text-foreground'

              return (
                <div key={k} className={`flex gap-3 px-3 py-2 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
                  <span className="text-[11px] font-medium text-muted-foreground w-44 shrink-0 py-0.5">{k}</span>
                  <span className={`text-[11px] ${valColor} break-words whitespace-pre-wrap flex-1`}>{displayVal}</span>
                </div>
              )
            })}
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

    // ── Smart plain-text rendering ──────────────────────────────────────────
    const nonEmpty = lines.filter(l => l.trim())
    if (nonEmpty.length > 1) {
      // Detect if it looks like a key:value listing (e.g. ipconfig, systeminfo)
      const kvPattern = nonEmpty.filter(l => l.includes(':') && !l.startsWith('---')).length > nonEmpty.length * 0.4
      if (kvPattern) {
        // Render as structured key-value with visual grouping
        return (
          <div className="divide-y divide-border">
            {nonEmpty.map((line, i) => {
              const colonIdx = line.indexOf(':')
              if (colonIdx > 0 && colonIdx < 40) {
                const key = line.slice(0, colonIdx).trim()
                const val = line.slice(colonIdx + 1).trim()
                return (
                  <div key={i} className={`flex gap-2 px-3 py-1.5 ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
                    <span className="text-[11px] font-medium text-muted-foreground w-44 shrink-0">{key}</span>
                    <span className="text-[11px] text-foreground break-words flex-1">{val || '—'}</span>
                  </div>
                )
              }
              // Section headers (lines without colon or empty-ish)
              if (line.trim() && !line.includes(':')) {
                return (
                  <div key={i} className="px-3 py-2 bg-muted/15 font-semibold text-[11px] text-foreground">
                    {line.trim()}
                  </div>
                )
              }
              return (
                <div key={i} className={`px-3 py-1 text-[11px] font-mono text-foreground ${i % 2 === 0 ? 'bg-muted/5' : ''}`}>
                  {line}
                </div>
              )
            })}
          </div>
        )
      }

      // Regular list — each line in its own row with comfortable spacing
      return (
        <div className="space-y-0">
          {nonEmpty.map((line, i) => (
            <div key={i} className={`px-3 py-1.5 text-[11px] font-mono text-foreground leading-relaxed ${i % 2 === 0 ? 'bg-muted/5' : ''} ${line.startsWith(' ') ? 'pl-6' : ''}`}>
              {line}
            </div>
          ))}
        </div>
      )
    }

    return <pre className="text-[11px] whitespace-pre-wrap text-foreground font-mono leading-relaxed px-3 py-2">{text.trim()}</pre>
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
    // Use software::swlist as key so result appears in the software list output area
    setConfirm({ cmdKey: 'software::swlist', label: `Deinstallieren: ${appName}`, command: psCmd, critical: true })
  }

  function handleRepair(appName: string, productCode: string) {
    const h2 = hostname.trim()
    if (!h2) return
    const safePc = productCode.replace(/'/g, "''")
    const safeApp = appName.replace(/'/g, "''")
    const psCmd = [
      `Invoke-Command -ComputerName '${h2}' -ScriptBlock {`,
      `  $proc = Start-Process msiexec.exe -ArgumentList '/fa ${safePc} /quiet /norestart' -Wait -PassThru`,
      `  Write-Output "Reparatur abgeschlossen: ${safeApp} (ExitCode: $($proc.ExitCode))"`,
      `}`,
    ].join('\n')
    setConfirm({ cmdKey: 'software::swlist', label: `Reparieren: ${appName}`, command: psCmd, critical: false })
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

        {/* ── Search bar ── */}
        <div className="px-6 pb-3 relative">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Skills durchsuchen... (Strg+K)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              onKeyDown={handleSearchKeyDown}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Recent searches (when empty + focused) */}
          {searchFocused && !searchQuery && recentSearches.length > 0 && (
            <div className="absolute left-6 right-6 top-full mt-1 z-30 bg-card border border-border rounded-lg shadow-xl p-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider px-2 mb-1">Letzte Suchen</p>
              <div className="flex flex-wrap gap-1">
                {recentSearches.map((s, i) => (
                  <button key={i} onClick={() => setSearchQuery(s)}
                    className="px-2 py-0.5 text-[10px] rounded-full bg-muted/30 text-muted-foreground hover:bg-accent border border-border">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search results */}
          {searchResults.length > 0 && searchQuery && (
            <div className="absolute left-6 right-6 top-full mt-1 z-30 bg-card border border-border rounded-lg shadow-xl max-h-[50vh] overflow-y-auto">
              <div className="px-3 py-2 border-b border-border flex items-center">
                <p className="text-[10px] text-muted-foreground flex-1">
                  {searchResults.length} Treffer für „{searchQuery}"
                </p>
              </div>
              {searchResults.map((r, i) => {
                const desc = skillDescs?.[`rd_${r.catId}_${r.cmdId}`]
                const scoreColor = r.score >= 80 ? 'text-emerald-400' : r.score >= 50 ? 'text-amber-400' : 'text-muted-foreground'
                return (
                  <div key={`${r.catId}-${r.cmdId}`}
                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-accent/30 cursor-pointer border-b border-border/50 transition-colors ${i === selectedResultIdx ? 'bg-primary/5' : ''}`}
                    onClick={() => {
                      const cat = CATEGORIES.find(c => c.id === r.catId)
                      if (cat) {
                        setExpanded(prev => { const n = new Set(prev); n.add(r.catId); return n })
                        setRecentSearches(prev => [searchQuery, ...prev.filter(s => s !== searchQuery)].slice(0, 5))
                        setSearchQuery('')
                        setSearchResults([])
                      }
                    }}
                  >
                    <span className={`text-[10px] font-mono w-8 text-right shrink-0 ${scoreColor}`}>
                      {r.score}%
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{r.cmd.func}</p>
                      {desc?.kurz && (
                        <p className="text-[10px] text-muted-foreground truncate">{desc.kurz}</p>
                      )}
                      <p className="text-[9px] text-muted-foreground/50">{r.catLabel}</p>
                    </div>
                    {hostname && connInfo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const cat = CATEGORIES.find(c => c.id === r.catId)
                          if (cat) runCommand(cat, r.cmd)
                          setRecentSearches(prev => [searchQuery, ...prev.filter(s => s !== searchQuery)].slice(0, 5))
                          setSearchQuery('')
                          setSearchResults([])
                        }}
                        className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 shrink-0"
                        title="Ausführen"
                      >
                        <Play size={11} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setInfoPopup({ catId: r.catId, cmdId: r.cmdId })
                      }}
                      className="p-1 rounded hover:bg-accent text-blue-400/60 shrink-0"
                      title="Info"
                    >
                      <Info size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* No results */}
          {searchQuery && searchFocused && searchResults.length === 0 && searchQuery.length >= 2 && (
            <div className="absolute left-6 right-6 top-full mt-1 z-30 bg-card border border-border rounded-lg shadow-xl p-4 text-center">
              <Search size={20} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Keine Treffer für „{searchQuery}"</p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">Überprüfen Sie die Schreibweise oder verwenden Sie allgemeinere Begriffe</p>
              <button
                onClick={() => {
                  useAppStore.getState().setScreen('it-guru')
                }}
                className="mt-2 flex items-center gap-1 mx-auto px-3 py-1.5 text-[10px] rounded-md bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
              >
                <Lightbulb size={10} /> IT Guru fragen
              </button>
            </div>
          )}
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

      {/* ── Local mode banner ── */}
      {(() => { try { return require('../utils/remoteCommands').getLocalMode() } catch { return false } })() && connInfo && (
        <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
          <span className="text-xs text-blue-400 flex-1">
            Lokaler Modus — Alle Befehle werden auf DEINEM PC ausgeführt (nicht remote). Der Hostname wird ignoriert.
          </span>
        </div>
      )}

      {/* ── Restricted mode banner ── */}
      {connInfo && connInfo.connectionMode !== 'full' && connInfo.connectionMode !== 'none' && (
        <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <span className="text-xs text-amber-400 flex-1">
            Verbunden via <strong>{connInfo.connectionMode === 'wmi' ? 'WMI Process Create' : connInfo.connectionMode === 'psexec' ? 'PsExec' : 'schtasks'}</strong> — WinRM nicht verfügbar. Alle Befehle funktionieren, aber etwas langsamer.
          </span>
        </div>
      )}

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
                        const inputOk = !needsInput || (
                          cmd.input?.type === 'drivemap'
                            ? (inputVal.split('|')[0]?.trim() !== '' && (inputVal.split('|')[1] ?? '').trim() !== '')
                            : cmd.input?.type === 'envvar'
                            ? (inputVal.includes('=') && inputVal.split('=')[0]?.trim() !== '')
                            : cmd.input?.type === 'driveletter'
                            ? inputVal.trim() !== ''
                            : cmd.input?.type === 'diskpart'
                            ? (inputVal.split('|')[0]?.trim() !== '' && (inputVal.split('|')[1] ?? '').trim() !== '')
                            : cmd.input?.type === 'diskvol'
                            ? (inputVal.split('|')[0]?.trim() !== '' && (inputVal.split('|')[1] ?? '').trim() !== '')
                            : cmd.input?.type === 'diskletter'
                            ? (inputVal.split('|')[0]?.trim() !== '' && (inputVal.split('|')[1] ?? '').trim() !== '')
                            : cmd.input?.type === 'userpass'
                            ? (inputVal.split('|')[0]?.trim() !== '' && (inputVal.split('|')[1] ?? '').trim() !== '')
                            : cmd.input?.type === 'usergroup'
                            ? (inputVal.split('|')[0]?.trim() !== '' && (inputVal.split('|')[1] ?? '').trim() !== '')
                            : cmd.input?.type === 'useradd'
                            ? (inputVal.split('|')[0]?.trim() !== '')
                            : cmd.input?.type === 'filepipe'
                            ? (inputVal.split('|')[0]?.trim() !== '' && (inputVal.split('|')[1] ?? '').trim() !== '')
                            : inputVal.trim() !== ''
                        )
                        const inputVal2 = inputs[key] ?? ''
                        const psCmd = cmd.buildCmd(h, inputVal2 || undefined)
                        const displayCmd = cmd.local
                          ? psCmd.replace(/^try \{ /, '').replace(/ \} catch.*$/, '')
                          : psCmd.split('\n')[1]?.trim().replace(/^Invoke-Command.*-ScriptBlock \{ /, '').slice(0, 80) || psCmd.slice(0, 80)

                        // Admin-only check for write/critical
                        const needsAdmin = cmd.action !== 'read' && !isAdmin
                        const svcFailed = connInfo?.failedServices.includes(cmd.id)
                        // Commands using Invoke-Command require WinRM
                        // Commands that work without WinRM (local, ping, tracert, or CIM-based)
                        const isFallbackCapable = cmd.local
                          || psCmd.startsWith('ping') || psCmd.startsWith('tracert')
                          || psCmd.includes('Test-Connection') || psCmd.includes('Test-NetConnection')
                          || psCmd.includes('Resolve-DnsName') || psCmd.includes('nslookup')
                          || psCmd.includes('Get-CimInstance') || psCmd.includes('Get-WmiObject')
                          || psCmd.includes('Test-Path') || psCmd.includes('Get-ChildItem')
                          || psCmd.includes('Get-WinEvent') || psCmd.includes('shutdown')
                          || psCmd.includes('\\\\') // UNC path operations
                          || cat.id === 'net' // network commands generally work locally
                        const needsWinRM = !isFallbackCapable
                        const winrmBlocked = false // All commands work via fallback methods

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
                                <div className="flex items-center gap-1">
                                  <p className="text-xs font-medium text-foreground">{cmd.func}</p>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleFavSkill(cat, cmd) }}
                                    title={isSkillFavorite(favData, `rd::${cat.id}::${cmd.id}`) ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                                    className="p-0.5 rounded hover:bg-accent shrink-0"
                                  >
                                    <Star size={11} className={isSkillFavorite(favData, `rd::${cat.id}::${cmd.id}`) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'} />
                                  </button>
                                  {skillDescs && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setInfoPopup({ catId: cat.id, cmdId: cmd.id }) }}
                                      title="Info anzeigen"
                                      className="p-0.5 rounded hover:bg-accent shrink-0"
                                    >
                                      <Info size={11} className="text-blue-400/60 hover:text-blue-400" />
                                    </button>
                                  )}
                                </div>
                                {skillDescs?.[`rd_${cat.id}_${cmd.id}`]?.kurz
                                  ? <p className="text-[10px] text-muted-foreground/70 mt-0.5">{skillDescs[`rd_${cat.id}_${cmd.id}`].kurz}</p>
                                  : <p className="text-[11px] text-muted-foreground mt-0.5">{cat.commands.find(c => c.id === cmd.id)?.when}</p>
                                }
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
                                    {/* Spezielle Hilfe für Laufwerk-Trennen */}
                                    {cmd.id === 'mapdriverem' && (
                                      <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-1.5">
                                        <p className="text-[8px] text-muted-foreground flex items-center gap-1"><Info size={8} className="text-blue-400" /> Klicken Sie auf einen Buchstaben oder tippen Sie den Buchstaben des Laufwerks das getrennt werden soll. Tipp: Nutzen Sie zuerst "Verbundene Laufwerke anzeigen" um zu sehen welche Laufwerke gemappt sind.</p>
                                      </div>
                                    )}
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
                                {cmd.input?.type === 'drivemap' && (
                                  <div className="space-y-2 w-56">
                                    {/* Laufwerksbuchstabe */}
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Laufwerksbuchstabe</label>
                                      <div className="flex gap-1 flex-wrap">
                                        {['H','I','S','T','U','Z'].map(l => (
                                          <button key={l} onClick={() => {
                                            const path = inputVal.split('|')[1] ?? ''
                                            setInputs(prev => ({ ...prev, [key]: `${l}|${path}` }))
                                          }}
                                            className={`w-7 h-7 text-[10px] font-bold rounded border transition-colors ${
                                              (inputVal.split('|')[0] ?? '') === l
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'border-border text-muted-foreground hover:bg-accent'
                                            }`}>{l}:</button>
                                        ))}
                                        <input
                                          type="text" maxLength={1} placeholder="?"
                                          value={!['H','I','S','T','U','Z'].includes(inputVal.split('|')[0] ?? '') ? (inputVal.split('|')[0] ?? '') : ''}
                                          onChange={e => {
                                            const letter = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1)
                                            const path = inputVal.split('|')[1] ?? ''
                                            setInputs(prev => ({ ...prev, [key]: `${letter}|${path}` }))
                                          }}
                                          className="w-7 h-7 text-[10px] font-bold rounded border border-dashed border-border bg-background text-foreground text-center uppercase focus:outline-none focus:border-primary"
                                          title="Anderen Buchstaben eingeben"
                                        />
                                      </div>
                                    </div>

                                    {/* Netzwerkpfad */}
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Netzwerkpfad</label>
                                      <input
                                        type="text"
                                        placeholder="z.B. w3172\Freigabe"
                                        value={inputVal.split('|')[1] ?? ''}
                                        onChange={e => {
                                          const letter = inputVal.split('|')[0] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${letter}|${e.target.value}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                    </div>

                                    {/* Hilfe-Infobox */}
                                    <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-2 space-y-1">
                                      <p className="text-[9px] font-semibold text-blue-400 flex items-center gap-1"><Info size={10} /> So funktioniert es:</p>
                                      <p className="text-[9px] text-muted-foreground leading-relaxed">
                                        1. Wählen Sie einen <strong>Buchstaben</strong> (z.B. <span className="font-mono bg-muted/30 px-0.5 rounded">Z:</span>)<br />
                                        2. Geben Sie den <strong>Serverpfad</strong> ein<br />
                                        <span className="text-[8px]">
                                        Beispiele:<br />
                                        • <span className="font-mono">w3172\Abteilung</span><br />
                                        • <span className="font-mono">server\freigabe\ordner</span><br />
                                        </span>
                                        Das <span className="font-mono">\\</span> wird automatisch ergänzt.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* ── Envvar: Zwei-Feld-Eingabe für Umgebungsvariablen ── */}
                                {cmd.input?.type === 'envvar' && (
                                  <div className="space-y-2 w-56">
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Variablenname</label>
                                      <input
                                        type="text"
                                        placeholder="z.B. JAVA_HOME"
                                        value={(inputVal.split('=')[0] ?? '')}
                                        onChange={e => {
                                          const val = inputVal.includes('=') ? inputVal.split('=').slice(1).join('=') : ''
                                          setInputs(prev => ({ ...prev, [key]: `${e.target.value}=${val}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary uppercase"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Wert</label>
                                      <input
                                        type="text"
                                        placeholder="z.B. C:\Program Files\Java\jdk-17"
                                        value={inputVal.includes('=') ? inputVal.split('=').slice(1).join('=') : ''}
                                        onChange={e => {
                                          const name = inputVal.split('=')[0] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${name}=${e.target.value}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                    </div>
                                    {cmd.templates && cmd.templates.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {cmd.templates.map(t => (
                                          <button key={t.label} type="button"
                                            onClick={() => setInputs(prev => ({ ...prev, [key]: t.value }))}
                                            className="px-1.5 py-0.5 text-[9px] rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                            {t.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-2">
                                      <p className="text-[9px] font-semibold text-blue-400 flex items-center gap-1"><Info size={10} /> So funktioniert es:</p>
                                      <p className="text-[9px] text-muted-foreground leading-relaxed">
                                        1. Geben Sie den <strong>Variablennamen</strong> ein (z.B. JAVA_HOME)<br />
                                        2. Geben Sie den <strong>Wert</strong> ein (z.B. einen Pfad)<br />
                                        <span className="text-[8px]">
                                        Oder klicken Sie auf eine Vorlage oben.<br />
                                        System-Variablen gelten für alle Benutzer.<br />
                                        Benutzer-Variablen nur für den angemeldeten User.
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* ── Driveletter: Nur Laufwerksbuchstabe mit Buttons ── */}
                                {cmd.input?.type === 'driveletter' && (
                                  <div className="space-y-2 w-56">
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Laufwerksbuchstabe</label>
                                      <div className="flex gap-1 flex-wrap">
                                        {['C','D','E','F','G'].map(l => (
                                          <button key={l} onClick={() => setInputs(prev => ({ ...prev, [key]: l }))}
                                            className={`w-7 h-7 text-[10px] font-bold rounded border transition-colors ${
                                              inputVal === l
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'border-border text-muted-foreground hover:bg-accent'
                                            }`}>{l}:</button>
                                        ))}
                                        <input
                                          type="text" maxLength={1} placeholder="?"
                                          value={!['C','D','E','F','G'].includes(inputVal) ? inputVal : ''}
                                          onChange={e => {
                                            const letter = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1)
                                            setInputs(prev => ({ ...prev, [key]: letter }))
                                          }}
                                          className="w-7 h-7 text-[10px] font-bold rounded border border-dashed border-border bg-background text-foreground text-center uppercase focus:outline-none focus:border-primary"
                                          title="Anderen Buchstaben eingeben"
                                        />
                                      </div>
                                    </div>
                                    <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-2">
                                      <p className="text-[9px] text-muted-foreground leading-relaxed">
                                        Klicken Sie auf den Buchstaben des Laufwerks oder tippen Sie einen anderen ein.<br/>
                                        <span className="text-[8px]">Tipp: Nutzen Sie zuerst &quot;Volumes/Partitionen&quot; um die vorhandenen Laufwerke zu sehen.</span>
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* ── Diskpart: Laufwerk + MB Eingabe ── */}
                                {cmd.input?.type === 'diskpart' && (
                                  <div className="space-y-2 w-56">
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Laufwerksbuchstabe</label>
                                      <div className="flex gap-1 flex-wrap">
                                        {['C','D','E','F'].map(l => (
                                          <button key={l} onClick={() => {
                                            const mb = inputVal.split('|')[1] ?? ''
                                            setInputs(prev => ({ ...prev, [key]: `${l}|${mb}` }))
                                          }}
                                            className={`w-7 h-7 text-[10px] font-bold rounded border transition-colors ${
                                              (inputVal.split('|')[0] ?? '') === l
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'border-border text-muted-foreground hover:bg-accent'
                                            }`}>{l}:</button>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Größe in MB</label>
                                      <input
                                        type="text"
                                        placeholder="z.B. 2048"
                                        value={inputVal.split('|')[1] ?? ''}
                                        onChange={e => {
                                          const dl = inputVal.split('|')[0] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${dl}|${e.target.value}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                      <div className="flex gap-1 mt-1 flex-wrap">
                                        {[{l:'1 GB',v:'1024'},{l:'5 GB',v:'5120'},{l:'10 GB',v:'10240'},{l:'20 GB',v:'20480'}].map(t => (
                                          <button key={t.v} onClick={() => {
                                            const dl = inputVal.split('|')[0] ?? ''
                                            setInputs(prev => ({ ...prev, [key]: `${dl}|${t.v}` }))
                                          }}
                                            className="px-1.5 py-0.5 text-[9px] rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                            {t.l}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-2">
                                      <p className="text-[9px] text-amber-400 font-semibold flex items-center gap-1"><AlertTriangle size={10} /> Achtung</p>
                                      <p className="text-[9px] text-muted-foreground leading-relaxed">
                                        Die Partition wird um die angegebene Größe verkleinert. Stellen Sie sicher, dass genügend freier Speicher vorhanden ist.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* ── Diskvol: DiskNr + Buchstabe (für neues Volume & Init) ── */}
                                {cmd.input?.type === 'diskvol' && (
                                  <div className="space-y-2 w-56">
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">
                                        {cmd.id === 'diskinit' ? 'Datenträger-Nummer' : 'Disk-Nummer'}
                                      </label>
                                      <div className="flex gap-1 flex-wrap">
                                        {['0','1','2','3'].map(n => (
                                          <button key={n} onClick={() => {
                                            const second = inputVal.split('|')[1] ?? ''
                                            setInputs(prev => ({ ...prev, [key]: `${n}|${second}` }))
                                          }}
                                            className={`w-7 h-7 text-[10px] font-bold rounded border transition-colors ${
                                              (inputVal.split('|')[0] ?? '') === n
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'border-border text-muted-foreground hover:bg-accent'
                                            }`}>{n}</button>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">
                                        {cmd.id === 'diskinit' ? 'Partitionsstil' : 'Laufwerksbuchstabe'}
                                      </label>
                                      {cmd.id === 'diskinit' ? (
                                        <div className="flex gap-1">
                                          {['GPT','MBR'].map(s => (
                                            <button key={s} onClick={() => {
                                              const dn = inputVal.split('|')[0] ?? ''
                                              setInputs(prev => ({ ...prev, [key]: `${dn}|${s}` }))
                                            }}
                                              className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-colors ${
                                                (inputVal.split('|')[1] ?? '') === s
                                                  ? 'bg-primary text-primary-foreground border-primary'
                                                  : 'border-border text-muted-foreground hover:bg-accent'
                                              }`}>{s}</button>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="flex gap-1 flex-wrap">
                                          {['D','E','F','G','H'].map(l => (
                                            <button key={l} onClick={() => {
                                              const dn = inputVal.split('|')[0] ?? ''
                                              setInputs(prev => ({ ...prev, [key]: `${dn}|${l}` }))
                                            }}
                                              className={`w-7 h-7 text-[10px] font-bold rounded border transition-colors ${
                                                (inputVal.split('|')[1] ?? '') === l
                                                  ? 'bg-primary text-primary-foreground border-primary'
                                                  : 'border-border text-muted-foreground hover:bg-accent'
                                              }`}>{l}:</button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-2">
                                      <p className="text-[9px] font-semibold text-blue-400 flex items-center gap-1"><Info size={10} /> Hinweis</p>
                                      <p className="text-[9px] text-muted-foreground leading-relaxed">
                                        {cmd.id === 'diskinit'
                                          ? <>Wählen Sie <strong>GPT</strong> für moderne Systeme (UEFI) oder <strong>MBR</strong> für ältere BIOS-Systeme.<br/><span className="text-[8px]">Tipp: Nutzen Sie zuerst &quot;Alle Disks Status&quot; für die Disk-Nummer.</span></>
                                          : <>Wählen Sie die Disk-Nummer und den gewünschten Buchstaben.<br/><span className="text-[8px]">Tipp: Nutzen Sie zuerst &quot;Festplatten-Gesundheit SMART&quot; für eine Übersicht.</span></>
                                        }
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* ── Diskletter: Alt + Neu Buchstabe ── */}
                                {cmd.input?.type === 'diskletter' && (
                                  <div className="space-y-2 w-56">
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Aktueller Buchstabe</label>
                                      <div className="flex gap-1 flex-wrap">
                                        {['C','D','E','F','G','H'].map(l => (
                                          <button key={l} onClick={() => {
                                            const nw = inputVal.split('|')[1] ?? ''
                                            setInputs(prev => ({ ...prev, [key]: `${l}|${nw}` }))
                                          }}
                                            className={`w-7 h-7 text-[10px] font-bold rounded border transition-colors ${
                                              (inputVal.split('|')[0] ?? '') === l
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'border-border text-muted-foreground hover:bg-accent'
                                            }`}>{l}:</button>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Neuer Buchstabe</label>
                                      <div className="flex gap-1 flex-wrap">
                                        {['D','E','F','G','H','X','Y','Z'].map(l => (
                                          <button key={l} onClick={() => {
                                            const old = inputVal.split('|')[0] ?? ''
                                            setInputs(prev => ({ ...prev, [key]: `${old}|${l}` }))
                                          }}
                                            className={`w-7 h-7 text-[10px] font-bold rounded border transition-colors ${
                                              (inputVal.split('|')[1] ?? '') === l
                                                ? 'bg-green-500 text-white border-green-500'
                                                : 'border-border text-muted-foreground hover:bg-accent'
                                            }`}>{l}:</button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-2">
                                      <p className="text-[9px] text-muted-foreground leading-relaxed">
                                        Wählen Sie oben den aktuellen Buchstaben und unten den gewünschten neuen Buchstaben.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* ── Userpass: Benutzername + Passwort ── */}
                                {cmd.input?.type === 'userpass' && (
                                  <div className="space-y-2 w-56">
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Benutzername</label>
                                      <input
                                        type="text"
                                        placeholder="z.B. adminlocal"
                                        value={inputVal.split('|')[0] ?? ''}
                                        onChange={e => {
                                          const pw = inputVal.split('|')[1] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${e.target.value}|${pw}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Passwort</label>
                                      <input
                                        type="text"
                                        placeholder="Neues Passwort"
                                        value={inputVal.split('|')[1] ?? ''}
                                        onChange={e => {
                                          const user = inputVal.split('|')[0] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${user}|${e.target.value}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                    </div>
                                    <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-2">
                                      <p className="text-[9px] font-semibold text-blue-400 flex items-center gap-1"><Info size={10} /> Hinweis</p>
                                      <p className="text-[9px] text-muted-foreground leading-relaxed">
                                        Geben Sie den <strong>lokalen</strong> Benutzernamen und das gewünschte Passwort ein.<br />
                                        <span className="text-[8px]">
                                          Passwort-Anforderungen je nach PC-Policy (Mindestlänge, Komplexität).
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* ── Usergroup: Benutzername + Gruppe (mit Schnellwahl) ── */}
                                {cmd.input?.type === 'usergroup' && (
                                  <div className="space-y-2 w-56">
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Benutzername oder DOMAIN\User</label>
                                      <input
                                        type="text"
                                        placeholder="z.B. SKF\dbazzani"
                                        value={inputVal.split('|')[0] ?? ''}
                                        onChange={e => {
                                          const group = inputVal.split('|')[1] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${e.target.value}|${group}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Gruppe</label>
                                      <div className="flex gap-1 flex-wrap mb-1">
                                        {['Administrators','Remote Desktop Users','Users','Power Users'].map(g => (
                                          <button key={g} onClick={() => {
                                            const user = inputVal.split('|')[0] ?? ''
                                            setInputs(prev => ({ ...prev, [key]: `${user}|${g}` }))
                                          }}
                                            className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
                                              (inputVal.split('|')[1] ?? '') === g
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                                            }`}>{g === 'Administrators' ? 'Admin' : g === 'Remote Desktop Users' ? 'RDP' : g === 'Power Users' ? 'Power' : g}</button>
                                        ))}
                                      </div>
                                      <input
                                        type="text"
                                        placeholder="Oder andere Gruppe eingeben"
                                        value={!['Administrators','Remote Desktop Users','Users','Power Users'].includes(inputVal.split('|')[1] ?? '') ? (inputVal.split('|')[1] ?? '') : ''}
                                        onChange={e => {
                                          const user = inputVal.split('|')[0] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${user}|${e.target.value}` }))
                                        }}
                                        className="w-full px-2 py-1 text-[10px] rounded border border-dashed border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                    </div>
                                    <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-2">
                                      <p className="text-[9px] text-muted-foreground leading-relaxed">
                                        <strong>Tipp:</strong> Für Domain-User das Format <span className="font-mono bg-muted/30 px-0.5 rounded">DOMAIN\username</span> nutzen.<br />
                                        <span className="text-[8px]">Lokale Benutzer einfach mit dem Namen eingeben.</span>
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* ── Useradd: Corp-ID / Name + Gruppe (mit AD-Lookup) ── */}
                                {/* ── Filepipe: Two labeled fields separated by | ── */}
                                {cmd.input?.type === 'filepipe' && (
                                  <div className="space-y-2 w-64">
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">{cmd.input.labels?.[0] ?? 'Feld 1'}</label>
                                      <input
                                        type="text"
                                        placeholder={cmd.input.examples?.[0] ?? ''}
                                        value={inputVal.split('|')[0] ?? ''}
                                        onChange={e => {
                                          const part2 = inputVal.split('|')[1] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${e.target.value}|${part2}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">{cmd.input.labels?.[1] ?? 'Feld 2'}</label>
                                      <input
                                        type="text"
                                        placeholder={cmd.input.examples?.[1] ?? ''}
                                        value={inputVal.split('|')[1] ?? ''}
                                        onChange={e => {
                                          const part1 = inputVal.split('|')[0] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${part1}|${e.target.value}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                    </div>
                                  </div>
                                )}

                                {cmd.input?.type === 'useradd' && (
                                  <div className="space-y-2 w-56">
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Corp-ID oder Name</label>
                                      <input
                                        type="text"
                                        placeholder="z.B. dbazzani oder Bazzani"
                                        value={inputVal.split('|')[0] ?? ''}
                                        onChange={e => {
                                          const group = inputVal.split('|')[1] ?? ''
                                          setInputs(prev => ({ ...prev, [key]: `${e.target.value}|${group}` }))
                                        }}
                                        className="w-full px-2 py-1.5 text-[11px] rounded border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-muted-foreground block mb-0.5">Zielgruppe</label>
                                      <div className="flex gap-1 flex-wrap">
                                        {['Administrators','Remote Desktop Users','Users'].map(g => (
                                          <button key={g} onClick={() => {
                                            const user = inputVal.split('|')[0] ?? ''
                                            setInputs(prev => ({ ...prev, [key]: `${user}|${g}` }))
                                          }}
                                            className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
                                              (inputVal.split('|')[1] ?? '') === g
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                                            }`}>{g === 'Administrators' ? 'Admin' : g === 'Remote Desktop Users' ? 'RDP' : g}</button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="rounded-md bg-green-500/5 border border-green-500/20 p-2 space-y-1">
                                      <p className="text-[9px] font-semibold text-green-400 flex items-center gap-1"><Info size={10} /> AD-Lookup</p>
                                      <p className="text-[9px] text-muted-foreground leading-relaxed">
                                        Geben Sie die <strong>Corp-ID</strong> (z.B. <span className="font-mono bg-muted/30 px-0.5 rounded">dbazzani</span>) oder den <strong>Namen</strong> (z.B. <span className="font-mono bg-muted/30 px-0.5 rounded">Bazzani</span>) ein.<br />
                                        <span className="text-[8px]">
                                          Das Active Directory wird automatisch nach dem Benutzer durchsucht. Bei Namenssuche wird der erste Treffer verwendet.<br />
                                          Der Benutzer wird als <strong>Domain-Account</strong> zur gewählten Gruppe hinzugefügt.
                                        </span>
                                      </p>
                                    </div>
                                  </div>
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
                                  <span className="text-[10px] text-amber-400" title="Dieser Befehl erfordert WinRM. Nutzen Sie 'WinRM remote aktivieren' für alle Funktionen.">🔒 WinRM nötig</span>
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
                                        {formatOutput(out.text, cat.id, cmd.id, handleUninstall, handleRepair)}
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

      {/* ── Skill Info Popup ── */}
      {infoPopup && skillDescs && (() => {
        const key = `rd_${infoPopup.catId}_${infoPopup.cmdId}`
        const desc = skillDescs[key]
        const cat = CATEGORIES.find(c => c.id === infoPopup.catId)
        const cmd = cat?.commands.find(c => c.id === infoPopup.cmdId)
        if (!desc || !cmd) return null
        const info = desc.info
        const riskColors: Record<string, string> = {
          niedrig: 'text-emerald-400 bg-emerald-500/10',
          mittel: 'text-amber-400 bg-amber-500/10',
          hoch: 'text-orange-400 bg-orange-500/10',
          kritisch: 'text-red-400 bg-red-500/10',
        }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setInfoPopup(null)}>
            <div className="bg-card border border-border rounded-xl w-[520px] max-h-[80vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
                <Info size={15} className="text-blue-400" />
                <span className="font-semibold text-sm text-foreground flex-1">{cmd.func}</span>
                <button onClick={() => setInfoPopup(null)} className="p-1 rounded hover:bg-accent text-muted-foreground"><X size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Was passiert</p>
                  <p className="text-foreground">{info.wasPassiert}</p>
                </div>
                {info.wannBenutzen?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Wann benutzen</p>
                    <ul className="space-y-0.5">{info.wannBenutzen.map((w: string, i: number) => <li key={i} className="text-foreground">• {w}</li>)}</ul>
                  </div>
                )}
                {info.zuBeachten?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">Zu beachten</p>
                    <ul className="space-y-0.5">{info.zuBeachten.map((z: string, i: number) => <li key={i} className="text-foreground">• {z}</li>)}</ul>
                  </div>
                )}
                {info.kombiniertMit?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Funktioniert gut mit</p>
                    <div className="flex flex-wrap gap-1">{info.kombiniertMit.map((k: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px]">{k}</span>
                    ))}</div>
                  </div>
                )}
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${riskColors[info.risikoLevel] ?? riskColors.niedrig}`}>
                    Risiko: {info.risikoLevel}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Dauer: {info.geschaetzteDauer}</span>
                  <span className="text-[10px] text-muted-foreground">Neustart: {info.neustartNoetig ? 'Ja' : 'Nein'}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Event Explanation Popup ── */}
      {eventInfoPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEventInfoPopup(null)}>
          <div className="bg-card border border-border rounded-xl w-[480px] max-h-[70vh] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <span className={`w-3 h-3 rounded-full shrink-0 ${
                eventInfoPopup.severity === 'critical' ? 'bg-red-400' :
                eventInfoPopup.severity === 'error' ? 'bg-red-400' :
                eventInfoPopup.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400'
              }`} />
              <span className="font-semibold text-sm text-foreground flex-1">Event {eventInfoPopup.id}: {eventInfoPopup.title}</span>
              <button onClick={() => setEventInfoPopup(null)} className="p-1 rounded hover:bg-accent text-muted-foreground"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(70vh-50px)]">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Was bedeutet das?</p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{eventInfoPopup.explanation}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Lösung</p>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap bg-muted/10 rounded-lg p-3 border border-border">
                  {eventInfoPopup.solution}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── WinRM Activation Modal (6-method live progress) ── */}
      {showFallbackDialog && (
        <WinRMActivationModal
          hostname={hostname.trim()}
          onSuccess={() => {
            setShowFallbackDialog(false)
            doConnect() // re-connect with full WinRM
          }}
          onRestricted={() => {
            setShowFallbackDialog(false)
            connectWithFallback()
          }}
          onCancel={() => setShowFallbackDialog(false)}
        />
      )}
    </div>
  )
}
