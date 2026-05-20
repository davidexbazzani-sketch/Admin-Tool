import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Activity, Server, Send, Search, CheckCircle, XCircle, AlertTriangle,
  Loader, Info, Eye, ChevronDown, RotateCcw, Mail, Clock, RefreshCw, Settings2, Plus, Trash2, Edit3,
} from 'lucide-react'
import { useAuthStore, useIsMasterAdmin, useIsAdmin } from '../../store/authStore'
import { api } from '../../electronAPI'
import { createLogger } from '../../utils/activityLogger'
import Card from '../Card'
import type { InventoryItem } from '../../types/auth'

const log = createLogger('infra-marine')

const INVENTORY_FILE = 'inventory/inventory.json'
const DXC_CONFIG_PATH = 'config/server_performance_check/dxc_recipients.json'
const PERF_HISTORY_PATH = 'logs/server_performance_checks/history.json'

// ── Types ────────────────────────────────────────────────────────────────────

interface PerfResult {
  hostname: string
  timestamp: string
  reachable: boolean
  os?: string
  model?: string
  uptime?: number
  ip?: string
  cpu?: { model: string; cores: number; avgUsage: number }
  ram?: { totalGB: number; usedGB: number; pct: number; slotsUsed: number; slotsTotal: number }
  disks?: { drive: string; totalGB: number; freeGB: number; pctUsed: number }[]
  errors: string[]
  assessment: { ram: 'ok' | 'warn' | 'critical'; cpu: 'ok' | 'warn' | 'critical'; disk: 'ok' | 'warn' | 'critical' }
}

interface DxcRecipient {
  id: string; name: string; email: string; defaultPosition: 'TO' | 'CC' | 'BCC'; active: boolean
}

type Phase = 'select' | 'checking' | 'results' | 'mail' | 'directmail' | 'config'

// ── Thresholds ───────────────────────────────────────────────────────────────
const TH = { ramWarn: 70, ramCrit: 85, cpuWarn: 70, cpuCrit: 90, diskWarn: 20, diskCrit: 10, diskCWarn: 15 }

function assess(r: PerfResult): PerfResult['assessment'] {
  const ram = !r.ram ? 'ok' : r.ram.pct >= TH.ramCrit ? 'critical' : r.ram.pct >= TH.ramWarn ? 'warn' : 'ok'
  const cpu = !r.cpu ? 'ok' : r.cpu.avgUsage >= TH.cpuCrit ? 'critical' : r.cpu.avgUsage >= TH.cpuWarn ? 'warn' : 'ok'
  let disk: 'ok' | 'warn' | 'critical' = 'ok'
  if (r.disks) {
    for (const d of r.disks) {
      const freePct = 100 - d.pctUsed
      const thresh = d.drive === 'C:' ? TH.diskCWarn : TH.diskCrit
      if (freePct < thresh) { disk = 'critical'; break }
      if (freePct < TH.diskWarn) disk = 'warn'
    }
  }
  return { ram, cpu, disk }
}

function statusColor(s: 'ok' | 'warn' | 'critical') {
  return s === 'critical' ? 'text-red-400' : s === 'warn' ? 'text-yellow-400' : 'text-green-400'
}

function nextRamStep(gb: number): number {
  if (gb <= 8) return 16; if (gb <= 16) return 32; if (gb <= 32) return 64; return 128
}

// ── PowerShell for performance data ──────────────────────────────────────────
// Uses the same remote() function as Remote Doc for connectivity fallback

import { remote } from '../../utils/remoteCommands'

// The inner script runs ON the target PC (via WinRM/WMI/PsExec/schtasks)
const PERF_CHECK_INNER_SCRIPT = [
  '$r = @{ hostname = $env:COMPUTERNAME; reachable = $true; errors = @() }',
  'try {',
  '  $os = Get-CimInstance Win32_OperatingSystem -EA Stop',
  '  $cs = Get-CimInstance Win32_ComputerSystem -EA Stop',
  '  $cpu = Get-CimInstance Win32_Processor -EA Stop | Select -First 1',
  '  $mem = Get-CimInstance Win32_PhysicalMemory -EA SilentlyContinue',
  '  $memArr = Get-CimInstance Win32_PhysicalMemoryArray -EA SilentlyContinue',
  '  $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -EA Stop',
  '  $net = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=true" -EA SilentlyContinue | Select -First 1',
  '  $cpuLoad = ($cpu | Measure-Object LoadPercentage -Average).Average',
  '  $totalRam = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)',
  '  $freeRam = [math]::Round($os.FreePhysicalMemory / 1MB, 1)',
  '  $usedRam = [math]::Round($totalRam - $freeRam, 1)',
  '  $ramPct = if ($totalRam -gt 0) { [math]::Round(($usedRam / $totalRam) * 100, 0) } else { 0 }',
  '  $slotsUsed = if ($mem) { ($mem | Measure-Object).Count } else { 0 }',
  '  $slotsTotal = if ($memArr) { ($memArr | Measure-Object -Property MemoryDevices -Sum).Sum } else { $slotsUsed }',
  '  $uptime = if ($os.LastBootUpTime) { [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 1) } else { 0 }',
  '  $r.os = "$($os.Caption) $($os.BuildNumber)"',
  '  $r.model = $cs.Model',
  '  $r.uptime = $uptime',
  '  $r.ip = if ($net) { $net.IPAddress[0] } else { "" }',
  '  $r.cpu = @{ model = $cpu.Name; cores = $cpu.NumberOfLogicalProcessors; avgUsage = [math]::Round($cpuLoad, 0) }',
  '  $r.ram = @{ totalGB = $totalRam; usedGB = $usedRam; pct = $ramPct; slotsUsed = $slotsUsed; slotsTotal = $slotsTotal }',
  '  $r.disks = @($disks | ForEach-Object { @{ drive = $_.DeviceID; totalGB = [math]::Round($_.Size/1GB,1); freeGB = [math]::Round($_.FreeSpace/1GB,1); pctUsed = if($_.Size -gt 0){[math]::Round((1-$_.FreeSpace/$_.Size)*100,0)}else{0} } })',
  '} catch { $r.errors += $_.Exception.Message }',
  '$r | ConvertTo-Json -Depth 4 -Compress',
].join('\n')

function buildCheckPs(hostname: string): string {
  // Use the same remote() wrapper as Remote Doc — handles WinRM/WMI/PsExec/schtasks fallback
  return remote(hostname, PERF_CHECK_INNER_SCRIPT)
}

// ── DXC Mail Generator (English) ─────────────────────────────────────────────

interface MailUpgrade {
  hostname: string; result: PerfResult
  wantRam: boolean; targetRam: number; ramReason: string
  wantCpu: boolean; cpuText: string
  wantDisk: boolean; diskDrive: string; diskTarget: number
  wantOther: boolean; otherText: string
}

function generateDxcMail(upgrades: MailUpgrade[], requestDate: string, timeWindow: string, notes: string, senderName: string, senderEmail: string): string {
  const lines: string[] = [
    'Hello,',
    '',
    'As part of our regular performance monitoring, we have identified hardware',
    'bottlenecks on the following server(s) and would like to request a hardware',
    'upgrade.',
    '',
  ]

  const count = upgrades.length
  upgrades.forEach((u, i) => {
    const r = u.result
    if (count > 1) {
      lines.push('=' .repeat(80))
      lines.push(`SERVER ${i + 1} of ${count}: ${u.hostname}`)
      lines.push('='.repeat(80))
    } else {
      lines.push(`Server: ${u.hostname}`)
      lines.push('-'.repeat(40))
    }
    lines.push('')
    lines.push('Current state:')
    if (r.ip) lines.push(`- IP address:        ${r.ip}`)
    if (r.os) lines.push(`- Operating system:  ${r.os}`)
    if (r.cpu) lines.push(`- CPU:               ${r.cpu.model} (${r.cpu.cores} logical cores)`)
    if (r.ram) {
      lines.push(`- RAM (total):       ${r.ram.totalGB} GB`)
      lines.push(`- RAM (utilization): ${r.ram.usedGB} GB used of ${r.ram.totalGB} GB (${r.ram.pct}%)`)
      if (r.ram.slotsTotal > 0) lines.push(`- RAM slots:         ${r.ram.slotsUsed} of ${r.ram.slotsTotal} occupied`)
    }
    if (r.disks) {
      for (const d of r.disks) {
        lines.push(`- Disk ${d.drive}:${' '.repeat(Math.max(1, 13 - d.drive.length))}${d.freeGB} GB free of ${d.totalGB} GB (${d.pctUsed}% used)`)
      }
    }
    if (r.uptime !== undefined) lines.push(`- Uptime:            ${r.uptime} days`)

    // Bottlenecks
    const bottlenecks: string[] = []
    if (r.assessment.ram === 'critical' && r.ram) bottlenecks.push(`RAM utilization critical (${r.ram.pct}%) - urgent upgrade recommended`)
    if (r.assessment.ram === 'warn' && r.ram) bottlenecks.push(`RAM utilization elevated (${r.ram.pct}%)`)
    if (r.assessment.cpu === 'critical' && r.cpu) bottlenecks.push(`CPU utilization critical (${r.cpu.avgUsage}%)`)
    if (r.assessment.disk === 'critical' && r.disks) {
      for (const d of r.disks) { if (100 - d.pctUsed < TH.diskCrit) bottlenecks.push(`Disk ${d.drive}: only ${100 - d.pctUsed}% free space remaining`) }
    }
    if (bottlenecks.length) {
      lines.push('', 'Identified bottlenecks:')
      bottlenecks.forEach(b => lines.push(`- ${b}`))
    }

    // Upgrade request
    const reqs: string[] = []
    if (u.wantRam) {
      reqs.push(`- RAM:               increase from ${r.ram?.totalGB ?? '?'} GB to ${u.targetRam} GB`)
      if (u.ramReason) reqs.push(`                     Reason: ${u.ramReason}`)
    }
    if (u.wantDisk) reqs.push(`- Disk ${u.diskDrive}:${' '.repeat(Math.max(1, 13 - u.diskDrive.length))}expand to ${u.diskTarget} GB`)
    if (u.wantCpu) reqs.push(`- CPU:               ${u.cpuText}`)
    if (u.wantOther) reqs.push(`- Other:             ${u.otherText}`)
    if (reqs.length) { lines.push('', 'Upgrade request:'); lines.push(...reqs) }

    lines.push('')
  })

  lines.push('='.repeat(80))
  lines.push('REQUESTED IMPLEMENTATION DATE')
  lines.push('='.repeat(80))
  lines.push(`Date:                ${requestDate}`)
  lines.push(`Time window:         ${timeWindow}`)

  if (notes.trim()) {
    lines.push('', '='.repeat(80), 'NOTES', '='.repeat(80), '', notes.trim())
  }

  lines.push('', '', 'Please confirm receipt of this request and provide a planned implementation date.', '')
  lines.push('', 'Thank you!', '', `Best regards`, senderName, '', '---', 'SKF Marine GmbH', senderEmail, 'This email was generated using the IT Admin Tool.')

  return lines.join('\n')
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ServerPerformanceCheck() {
  const session = useAuthStore(s => s.session)
  const isMaster = useIsMasterAdmin()
  const isAdmin = useIsAdmin()
  const displayName = session?.user.displayName ?? ''
  const userEmail = session?.user.username ? `${session.user.username}@skf.com` : ''

  const [phase, setPhase] = useState<Phase>('select')
  const [servers, setServers] = useState<InventoryItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<PerfResult[]>([])
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [logLines, setLogLines] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  // Mail state
  const [recipients, setRecipients] = useState<DxcRecipient[]>([])
  const [mailServers, setMailServers] = useState<Set<string>>(new Set())
  const [upgrades, setUpgrades] = useState<Map<string, MailUpgrade>>(new Map())
  const [requestDate, setRequestDate] = useState('')
  const [timeWindow, setTimeWindow] = useState('Outside business hours (weekdays 18:00-06:00 CET)')
  const [notes, setNotes] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  // Load servers from inventory
  useEffect(() => {
    ;(async () => {
      try {
        const data = await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)
        if (Array.isArray(data)) setServers(data.filter(i => i.category === 'Server'))
      } catch { /* empty */ }
    })()
  }, [])

  // Load DXC recipients
  useEffect(() => {
    ;(async () => {
      try {
        const data = await api().netReadJson<{ recipients: DxcRecipient[] }>(DXC_CONFIG_PATH)
        if (data?.recipients?.length) setRecipients(data.recipients)
        else setRecipients([{ id: '1', name: 'DXC', email: 'tvadnai@dxc.com', defaultPosition: 'TO', active: true }])
      } catch {
        setRecipients([{ id: '1', name: 'DXC', email: 'tvadnai@dxc.com', defaultPosition: 'TO', active: true }])
      }
    })()
  }, [])

  // Default request date = today + 7
  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() + 7)
    setRequestDate(d.toISOString().split('T')[0])
  }, [])

  // Cooldown
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  // Auto-scroll log
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logLines])

  const filteredServers = servers.filter(s => {
    const q = search.toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || (s.ip || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)
  })

  function addLog(msg: string) { setLogLines(prev => [...prev, `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`]) }

  function toggleServer(id: string) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function selectAll() { setSelected(new Set(filteredServers.map(s => s.id))) }
  function deselectAll() { setSelected(new Set()) }

  // ── Run performance checks ─────────────────────────────────────────────────

  async function runChecks() {
    const toCheck = servers.filter(s => selected.has(s.id))
    setPhase('checking')
    setChecking(true)
    setResults([])
    setLogLines([])
    setProgress({ done: 0, total: toCheck.length })

    const allResults: PerfResult[] = []

    // Process in batches of 10
    for (let i = 0; i < toCheck.length; i += 10) {
      const batch = toCheck.slice(i, i + 10)
      addLog(`Batch ${Math.floor(i / 10) + 1}: ${batch.map(s => s.name).join(', ')}`)

      const promises = batch.map(async (srv) => {
        addLog(`Pruefe ${srv.name}...`)
        try {
          const ps = buildCheckPs(srv.name)
          const res = await api().runPowerShell(ps, 90000)
          const parsed = JSON.parse(res.stdout.trim()) as PerfResult
          parsed.timestamp = new Date().toISOString()
          parsed.assessment = assess(parsed)
          addLog(`${srv.name}: ${parsed.reachable ? 'OK' : 'Nicht erreichbar'}`)
          return parsed
        } catch (e) {
          addLog(`${srv.name}: Fehler - ${e instanceof Error ? e.message : String(e)}`)
          return { hostname: srv.name, timestamp: new Date().toISOString(), reachable: false, errors: [String(e)], assessment: { ram: 'ok' as const, cpu: 'ok' as const, disk: 'ok' as const } }
        }
      })

      const batchResults = await Promise.all(promises)
      allResults.push(...batchResults)
      setResults([...allResults])
      setProgress({ done: allResults.length, total: toCheck.length })
    }

    setChecking(false)
    setPhase('results')
    log('Server Performance Check', `${toCheck.length} Server geprueft`)

    // Save to history
    try { await api().netWriteJson(PERF_HISTORY_PATH, allResults) } catch { /* ok */ }

    // Pre-select critical servers for mail
    const critical = new Set(allResults.filter(r => r.assessment.ram === 'critical' || r.assessment.cpu === 'critical' || r.assessment.disk === 'critical').map(r => r.hostname))
    setMailServers(critical)

    // Pre-build upgrade suggestions
    const map = new Map<string, MailUpgrade>()
    for (const r of allResults) {
      if (!r.reachable) continue
      const u: MailUpgrade = {
        hostname: r.hostname, result: r,
        wantRam: r.assessment.ram === 'critical', targetRam: nextRamStep(r.ram?.totalGB ?? 0),
        ramReason: r.ram ? `Current RAM utilization ${r.ram.pct}% - frequent bottlenecks observed` : '',
        wantCpu: r.assessment.cpu === 'critical', cpuText: 'More powerful CPU - details to be aligned with IT',
        wantDisk: r.assessment.disk === 'critical', diskDrive: 'C:', diskTarget: 250,
        wantOther: false, otherText: '',
      }
      map.set(r.hostname, u)
    }
    setUpgrades(map)
  }

  // ── Send DXC mail ──────────────────────────────────────────────────────────

  const activeRecipients = recipients.filter(r => r.active)
  const toRecipients = activeRecipients.filter(r => r.defaultPosition === 'TO').map(r => r.email)
  const ccRecipients = activeRecipients.filter(r => r.defaultPosition === 'CC').map(r => r.email)

  const selectedUpgrades = useMemo(() => {
    return Array.from(mailServers).map(h => upgrades.get(h)).filter((u): u is MailUpgrade => !!u && (u.wantRam || u.wantCpu || u.wantDisk || u.wantOther))
  }, [mailServers, upgrades])

  const mailBody = useMemo(() => {
    if (selectedUpgrades.length === 0) return ''
    return generateDxcMail(selectedUpgrades, requestDate, timeWindow, notes, displayName, userEmail)
  }, [selectedUpgrades, requestDate, timeWindow, notes, displayName, userEmail])

  const mailSubject = selectedUpgrades.length === 1
    ? `Hardware upgrade request: ${selectedUpgrades[0].hostname} - RAM/CPU/Disk expansion`
    : `Hardware upgrade request - ${selectedUpgrades.length} servers`

  async function handleSendMail() {
    setShowConfirm(false)
    setSending(true)
    setToast(null)
    try {
      const res = await api().sendEmailRaw({
        to: toRecipients.join(';'), subject: mailSubject, body: mailBody,
        html: false, smtp: '', port: 0, method: 'outlook',
      })
      if (res.success) {
        setToast({ type: 'ok', msg: 'Anfrage erfolgreich an DXC gesendet' })
        log('DXC-Aufruest-Mail gesendet', `${selectedUpgrades.length} Server, Empfaenger: ${toRecipients.join(', ')}`)
        setCooldown(60)
      } else {
        setToast({ type: 'error', msg: res.error || 'Fehler' })
      }
    } catch (e) {
      setToast({ type: 'error', msg: String(e) })
    } finally { setSending(false) }
  }

  async function handleCompose() {
    await api().composeEmail({ to: toRecipients.join(';'), cc: ccRecipients.join(';'), subject: mailSubject, body: mailBody })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Activity size={22} className="text-blue-400" />
          <h2 className="text-lg font-bold text-foreground">Server Performance Check</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Performance-Analyse der Server und Aufruest-Anfragen an DXC</p>
      </div>

      <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
        <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300">Server aus der Standort-Uebersicht analysieren (CPU, RAM, Festplatte) und bei Engpaessen direkt eine Aufruest-Anfrage an DXC senden. Die Mail an DXC ist auf Englisch.</p>
      </div>

      {/* Phase: Server Selection */}
      {phase === 'select' && (
        <Card title="Server-Auswahl" icon={<Server size={15} />}
          actions={
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Server suchen..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground w-48" />
            </div>
          }>
          {servers.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-2">In der Standort-Uebersicht sind keine Server hinterlegt.</p>
              <button onClick={() => { /* navigate to location-overview */ }} className="text-xs text-blue-400 underline">Zur Standort-Uebersicht</button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={selectAll} className="text-[10px] text-blue-400 hover:underline">Alle auswaehlen</button>
                <span className="text-[10px] text-muted-foreground">|</span>
                <button onClick={deselectAll} className="text-[10px] text-blue-400 hover:underline">Auswahl aufheben</button>
                <span className="text-[10px] text-muted-foreground ml-auto">{selected.size} von {servers.length} ausgewaehlt</span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/30 text-muted-foreground">
                    <th className="w-8 px-2 py-2"></th>
                    <th className="text-left px-3 py-2 font-medium">Hostname</th>
                    <th className="text-left px-3 py-2 font-medium">IP</th>
                    <th className="text-left px-3 py-2 font-medium">Beschreibung</th>
                  </tr></thead>
                  <tbody>
                    {filteredServers.map((s, i) => (
                      <tr key={s.id} className={`${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20 transition-colors`}>
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleServer(s.id)} className="rounded accent-primary cursor-pointer" />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.ip || '-'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button onClick={runChecks} disabled={selected.size === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${selected.size > 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                  <Activity size={14} />Performance-Check starten ({selected.size} Server)
                </button>
                <button onClick={() => {
                  // Build empty upgrade entries for selected servers (no perf data)
                  const selServers = servers.filter(s => selected.has(s.id))
                  const map = new Map<string, MailUpgrade>()
                  for (const srv of selServers) {
                    map.set(srv.name, {
                      hostname: srv.name,
                      result: { hostname: srv.name, timestamp: '', reachable: true, errors: [], assessment: { ram: 'ok', cpu: 'ok', disk: 'ok' } },
                      wantRam: false, targetRam: 32, ramReason: '',
                      wantCpu: false, cpuText: 'More powerful CPU - details to be aligned with IT',
                      wantDisk: false, diskDrive: 'C:', diskTarget: 250,
                      wantOther: false, otherText: '',
                    })
                  }
                  setUpgrades(map)
                  setMailServers(new Set(selServers.map(s => s.name)))
                  setPhase('directmail')
                }} disabled={selected.size === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${selected.size > 0 ? 'text-muted-foreground border border-border hover:text-foreground hover:bg-muted/20' : 'text-muted-foreground bg-muted cursor-not-allowed'}`}>
                  <Mail size={14} />Direkt Mail an DXC (ohne Check)
                </button>
                {isMaster && (
                  <button onClick={() => setPhase('config')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-foreground hover:bg-muted/20 ml-auto">
                    <Settings2 size={14} />Empfaenger verwalten
                  </button>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Phase: Checking */}
      {phase === 'checking' && (
        <Card title={`Performance-Check laeuft... (${progress.done}/${progress.total})`} icon={<Loader size={15} className="animate-spin" />}>
          <div className="space-y-2">
            {results.map(r => (
              <div key={r.hostname} className="flex items-center gap-2 text-xs">
                {r.reachable ? <CheckCircle size={12} className="text-green-400" /> : <XCircle size={12} className="text-red-400" />}
                <span className="text-foreground font-medium">{r.hostname}</span>
                {r.reachable && r.ram && <span className="text-muted-foreground">RAM {r.ram.pct}% | CPU {r.cpu?.avgUsage ?? '-'}%</span>}
                {!r.reachable && <span className="text-red-400">Nicht erreichbar</span>}
              </div>
            ))}
            <div ref={logRef} className="max-h-40 overflow-y-auto bg-background rounded border border-border p-2 font-mono text-[10px] text-muted-foreground mt-2">
              {logLines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </Card>
      )}

      {/* Phase: Results */}
      {phase === 'results' && (
        <>
          <Card title="Ergebnisse" icon={<CheckCircle size={15} />}
            actions={
              <div className="flex gap-2">
                <button onClick={() => { setPhase('select') }} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1">Zurueck</button>
                <button onClick={() => runChecks()} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 flex items-center gap-1"><RefreshCw size={10} />Erneut</button>
              </div>
            }>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/30 text-muted-foreground">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="text-left px-3 py-2 font-medium">Hostname</th>
                  <th className="text-left px-3 py-2 font-medium">RAM</th>
                  <th className="text-left px-3 py-2 font-medium">CPU</th>
                  <th className="text-left px-3 py-2 font-medium">Festplatte</th>
                  <th className="text-left px-3 py-2 font-medium">Empfehlung</th>
                </tr></thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.hostname} className={`${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20`}>
                      <td className="px-2 py-2 text-center">
                        {r.reachable && <input type="checkbox" checked={mailServers.has(r.hostname)} onChange={() => {
                          setMailServers(prev => { const n = new Set(prev); n.has(r.hostname) ? n.delete(r.hostname) : n.add(r.hostname); return n })
                        }} className="rounded accent-primary cursor-pointer" />}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">{r.hostname}</td>
                      <td className="px-3 py-2">
                        {r.reachable && r.ram ? <span className={statusColor(r.assessment.ram)}>{r.ram.pct}% ({r.ram.usedGB}/{r.ram.totalGB} GB)</span> : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.reachable && r.cpu ? <span className={statusColor(r.assessment.cpu)}>{r.cpu.avgUsage}%</span> : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.reachable && r.disks ? r.disks.map(d => <div key={d.drive} className={statusColor(100 - d.pctUsed < TH.diskCrit ? 'critical' : 100 - d.pctUsed < TH.diskWarn ? 'warn' : 'ok')}>{d.drive} {d.freeGB} GB frei</div>) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-2 text-[10px]">
                        {!r.reachable ? <span className="text-muted-foreground">Nicht erreichbar</span> :
                          r.assessment.ram === 'critical' || r.assessment.cpu === 'critical' || r.assessment.disk === 'critical'
                            ? <span className="text-red-400 font-medium">Aufruest-Bedarf</span>
                            : r.assessment.ram === 'warn' || r.assessment.cpu === 'warn' || r.assessment.disk === 'warn'
                              ? <span className="text-yellow-400">Auffaellig</span>
                              : <span className="text-green-400">OK</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setPhase('mail')} disabled={mailServers.size === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${mailServers.size > 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                <Send size={14} />Auswahl an DXC senden ({mailServers.size})
              </button>
            </div>
          </Card>
        </>
      )}

      {/* Phase: Mail */}
      {phase === 'mail' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Aufruest-Anfrage an DXC" icon={<Mail size={15} />}>
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]">
                <Info size={11} /> Mail-Sprache: Englisch
              </div>

              {/* Recipients */}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Empfaenger (TO)</label>
                <div className="flex flex-wrap gap-1">
                  {toRecipients.map(e => <span key={e} className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[11px] border border-blue-500/30">{e}</span>)}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Gewuenschtes Datum *</label>
                <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground" />
              </div>

              {/* Time window */}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Zeitfenster</label>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {[
                    { de: 'Werktags 18-06 Uhr', en: 'Outside business hours (weekdays 18:00-06:00 CET)' },
                    { de: 'Wochenende', en: 'Weekend' },
                    { de: 'Frei waehlbar', en: 'Flexible / to be coordinated' },
                  ].map(tw => (
                    <button key={tw.en} onClick={() => setTimeWindow(tw.en)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${timeWindow === tw.en ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'text-muted-foreground border-border hover:text-foreground'}`}>
                      {tw.de}
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-server upgrade wishes */}
              {Array.from(mailServers).map(h => {
                const u = upgrades.get(h)
                if (!u) return null
                const r = u.result
                return (
                  <div key={h} className="p-3 rounded-lg bg-muted/10 border border-border space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">{h}</h4>
                    {r.ram && <p className="text-[10px] text-muted-foreground">RAM: {r.ram.usedGB}/{r.ram.totalGB} GB ({r.ram.pct}%) | CPU: {r.cpu?.avgUsage}%</p>}
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={u.wantRam} onChange={e => setUpgrades(m => { const n = new Map(m); const v = { ...n.get(h)! }; v.wantRam = e.target.checked; n.set(h, v); return n })} className="rounded accent-primary" />
                        RAM erhoehen auf <input type="number" value={u.targetRam} onChange={e => setUpgrades(m => { const n = new Map(m); const v = { ...n.get(h)! }; v.targetRam = Number(e.target.value); n.set(h, v); return n })} className="w-16 px-1 py-0.5 rounded bg-background border border-border text-xs text-foreground" /> GB
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={u.wantDisk} onChange={e => setUpgrades(m => { const n = new Map(m); const v = { ...n.get(h)! }; v.wantDisk = e.target.checked; n.set(h, v); return n })} className="rounded accent-primary" />
                        Festplatte erweitern
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={u.wantCpu} onChange={e => setUpgrades(m => { const n = new Map(m); const v = { ...n.get(h)! }; v.wantCpu = e.target.checked; n.set(h, v); return n })} className="rounded accent-primary" />
                        CPU verbessern
                      </label>
                    </div>
                  </div>
                )
              })}

              {/* Notes */}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Anmerkungen (optional, auf Englisch)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional - Background / urgency"
                  className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground resize-y" />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
                <button onClick={() => selectedUpgrades.length > 0 ? setShowConfirm(true) : null}
                  disabled={selectedUpgrades.length === 0 || sending || cooldown > 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${selectedUpgrades.length > 0 && !sending && cooldown === 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                  <Send size={14} />{sending ? 'Sende...' : cooldown > 0 ? `Warten (${cooldown}s)` : 'Anfrage senden'}
                </button>
                <button onClick={handleCompose} disabled={selectedUpgrades.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-foreground disabled:opacity-40">
                  <Eye size={14} />In Outlook oeffnen
                </button>
                <button onClick={() => setPhase('results')} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-foreground">Zurueck</button>
              </div>

              {toast && (
                <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${toast.type === 'ok' ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                  {toast.type === 'ok' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {toast.msg}
                </div>
              )}
            </div>
          </Card>

          {/* Mail Preview */}
          <Card title="Vorschau (Englisch)" icon={<Eye size={15} />}>
            <div className="space-y-2 text-xs">
              <div><span className="text-muted-foreground font-medium">An: </span><span className="text-foreground">{toRecipients.join('; ')}</span></div>
              <div><span className="text-muted-foreground font-medium">Betreff: </span><span className="text-foreground font-semibold">{mailSubject}</span></div>
              <div className="pt-2 border-t border-border">
                <pre className="text-foreground whitespace-pre-wrap font-sans text-[11px] leading-relaxed">{mailBody || 'Bitte mindestens eine Aufruest-Option auswaehlen'}</pre>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Phase: Direct Mail (without performance check) — reuses mail UI */}
      {phase === 'directmail' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Anfrage an DXC (ohne Performance-Check)" icon={<Mail size={15} />}>
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]">
                <Info size={11} /> Mail-Sprache: Englisch
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Empfaenger (TO)</label>
                <div className="flex flex-wrap gap-1">
                  {toRecipients.map(e => <span key={e} className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[11px] border border-blue-500/30">{e}</span>)}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Gewuenschtes Datum *</label>
                <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Zeitfenster</label>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {[{ de: 'Werktags 18-06 Uhr', en: 'Outside business hours (weekdays 18:00-06:00 CET)' }, { de: 'Wochenende', en: 'Weekend' }, { de: 'Frei waehlbar', en: 'Flexible / to be coordinated' }].map(tw => (
                    <button key={tw.en} onClick={() => setTimeWindow(tw.en)} className={`px-2 py-0.5 rounded-full text-[10px] border ${timeWindow === tw.en ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'text-muted-foreground border-border hover:text-foreground'}`}>{tw.de}</button>
                  ))}
                </div>
              </div>
              {Array.from(mailServers).map(h => {
                const u = upgrades.get(h)
                if (!u) return null
                return (
                  <div key={h} className="p-3 rounded-lg bg-muted/10 border border-border space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">{h}</h4>
                    <p className="text-[10px] text-muted-foreground">Keine Performance-Daten (Check nicht durchgefuehrt)</p>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={u.wantRam} onChange={e => setUpgrades(m => { const n = new Map(m); n.set(h, { ...n.get(h)!, wantRam: e.target.checked }); return n })} className="rounded accent-primary" />RAM erhoehen auf <input type="number" value={u.targetRam} onChange={e => setUpgrades(m => { const n = new Map(m); n.set(h, { ...n.get(h)!, targetRam: Number(e.target.value) }); return n })} className="w-16 px-1 py-0.5 rounded bg-background border border-border text-xs" /> GB</label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={u.wantDisk} onChange={e => setUpgrades(m => { const n = new Map(m); n.set(h, { ...n.get(h)!, wantDisk: e.target.checked }); return n })} className="rounded accent-primary" />Festplatte erweitern</label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={u.wantCpu} onChange={e => setUpgrades(m => { const n = new Map(m); n.set(h, { ...n.get(h)!, wantCpu: e.target.checked }); return n })} className="rounded accent-primary" />CPU verbessern</label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={u.wantOther} onChange={e => setUpgrades(m => { const n = new Map(m); n.set(h, { ...n.get(h)!, wantOther: e.target.checked }); return n })} className="rounded accent-primary" />Sonstiges</label>
                      {u.wantOther && <textarea value={u.otherText} onChange={e => setUpgrades(m => { const n = new Map(m); n.set(h, { ...n.get(h)!, otherText: e.target.value }); return n })} rows={2} placeholder="Beschreibung (auf Englisch)" className="w-full px-2 py-1 rounded bg-background border border-border text-xs text-foreground" />}
                    </div>
                  </div>
                )
              })}
              <div><label className="text-[11px] text-muted-foreground font-medium mb-1 block">Anmerkungen (optional, auf Englisch)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional" className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground resize-y" /></div>
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
                <button onClick={() => selectedUpgrades.length > 0 ? setShowConfirm(true) : null} disabled={selectedUpgrades.length === 0 || sending || cooldown > 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${selectedUpgrades.length > 0 && !sending && cooldown === 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                  <Send size={14} />{sending ? 'Sende...' : cooldown > 0 ? `Warten (${cooldown}s)` : 'Anfrage senden'}</button>
                <button onClick={handleCompose} disabled={selectedUpgrades.length === 0} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-foreground disabled:opacity-40"><Eye size={14} />In Outlook oeffnen</button>
                <button onClick={() => setPhase('select')} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-foreground">Zurueck</button>
              </div>
              {toast && <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${toast.type === 'ok' ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>{toast.type === 'ok' ? <CheckCircle size={12} /> : <XCircle size={12} />}{toast.msg}</div>}
            </div>
          </Card>
          <Card title="Vorschau (Englisch)" icon={<Eye size={15} />}>
            <div className="space-y-2 text-xs">
              <div><span className="text-muted-foreground font-medium">An: </span><span className="text-foreground">{toRecipients.join('; ')}</span></div>
              <div><span className="text-muted-foreground font-medium">Betreff: </span><span className="text-foreground font-semibold">{mailSubject}</span></div>
              <div className="pt-2 border-t border-border"><pre className="text-foreground whitespace-pre-wrap font-sans text-[11px] leading-relaxed">{mailBody || 'Bitte mindestens eine Aufruest-Option auswaehlen'}</pre></div>
            </div>
          </Card>
        </div>
      )}

      {/* Phase: Config — Empfaenger-Verwaltung (Master Admin) */}
      {phase === 'config' && isMaster && (
        <Card title="DXC-Empfaenger verwalten" icon={<Settings2 size={15} />}>
          <div className="space-y-4">
            <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-yellow-300">Aenderungen werden zentral gespeichert und gelten fuer alle Admins.</p>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/30 text-muted-foreground">
                  <th className="w-10 px-2 py-1.5 font-medium">Aktiv</th>
                  <th className="text-left px-2 py-1.5 font-medium">Name</th>
                  <th className="text-left px-2 py-1.5 font-medium">E-Mail</th>
                  <th className="text-left px-2 py-1.5 font-medium">Position</th>
                  <th className="w-16 px-2 py-1.5 font-medium">Aktion</th>
                </tr></thead>
                <tbody>
                  {recipients.map((r, i) => (
                    <tr key={r.id} className={`${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={r.active} onChange={e => setRecipients(prev => prev.map(x => x.id === r.id ? { ...x, active: e.target.checked } : x))} className="rounded accent-primary" />
                      </td>
                      <td className="px-2 py-1.5 text-foreground">{r.name}</td>
                      <td className="px-2 py-1.5 text-foreground font-mono text-[11px]">{r.email}</td>
                      <td className="px-2 py-1.5">
                        <select value={r.defaultPosition} onChange={e => setRecipients(prev => prev.map(x => x.id === r.id ? { ...x, defaultPosition: e.target.value as 'TO' | 'CC' | 'BCC' } : x))} className="px-1 py-0.5 rounded bg-background border border-border text-[11px] text-foreground">
                          <option value="TO">TO</option><option value="CC">CC</option><option value="BCC">BCC</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => setRecipients(prev => prev.filter(x => x.id !== r.id))} className="text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input id="newRecipName" placeholder="Name" className="px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" />
                <input id="newRecipEmail" placeholder="E-Mail *" className="px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" />
                <select id="newRecipPos" className="px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground">
                  <option value="TO">TO</option><option value="CC">CC</option><option value="BCC">BCC</option>
                </select>
              </div>
              <button onClick={() => {
                const nameEl = document.getElementById('newRecipName') as HTMLInputElement
                const emailEl = document.getElementById('newRecipEmail') as HTMLInputElement
                const posEl = document.getElementById('newRecipPos') as HTMLSelectElement
                if (!emailEl?.value.trim()) return
                setRecipients(prev => [...prev, {
                  id: `r_${Date.now()}`, name: nameEl?.value.trim() || '', email: emailEl.value.trim(),
                  defaultPosition: (posEl?.value || 'CC') as 'TO' | 'CC' | 'BCC', active: true,
                }])
                if (nameEl) nameEl.value = ''
                if (emailEl) emailEl.value = ''
              }} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs text-primary border border-primary/30 hover:bg-primary/10">
                <Plus size={12} />Hinzufuegen
              </button>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <button onClick={async () => {
                try {
                  await api().netWriteJson(DXC_CONFIG_PATH, { version: 1, lastModified: new Date().toISOString(), modifiedBy: session?.user.username || '', recipients })
                  setToast({ type: 'ok', msg: 'Empfaenger gespeichert' })
                } catch (e) { setToast({ type: 'error', msg: String(e) }) }
              }} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Speichern</button>
              <button onClick={() => setPhase('select')} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border hover:text-foreground">Zurueck</button>
              {toast && <span className={`text-xs ${toast.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{toast.msg}</span>}
            </div>
          </div>
        </Card>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowConfirm(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={20} className="text-yellow-400" />
              <h3 className="text-lg font-bold text-foreground">Anfrage an DXC senden?</h3>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 mb-3 space-y-1">
              <p><strong>Empfaenger:</strong> {toRecipients.join(', ')}</p>
              <p><strong>Server:</strong> {selectedUpgrades.map(u => u.hostname).join(', ')}</p>
              <p><strong>Datum:</strong> {requestDate}</p>
            </div>
            <p className="text-[11px] text-yellow-400 mb-4">Diese Anfrage geht an einen externen Dienstleister (DXC) und kann Kosten verursachen.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:bg-muted/20">Abbrechen</button>
              <button onClick={handleSendMail} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Senden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
