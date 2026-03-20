import { useEffect, useRef, useState, useCallback } from 'react'
import {
  RefreshCw, Loader2, Wifi, WifiOff, Settings, Cpu, Database, HardDrive,
  Clock, AlertTriangle, Download, User, Monitor, Zap, FileText, Type,
  Minus, Hash, ServerCrash, CheckCircle2, XCircle, Activity,
} from 'lucide-react'
import { api } from '../../electronAPI'
import type {
  DashboardElement, ActiveAlarm, Threshold, QuickAction,
} from '../../types/dashboard'

// ── PS command builders ─────────────────────────────────────────────────────

const psOnline = (h: string) =>
  `try { $r=Test-Connection -ComputerName '${h}' -Count 1 -Quiet -EA Stop; if($r){'online'}else{'offline'} } catch { 'offline' }`

const psCpu = (h: string) =>
  `try { $r=Invoke-Command -ComputerName '${h}' -ScriptBlock { (Get-CimInstance Win32_Processor).LoadPercentage } -EA Stop; "$r" } catch { 'ERR' }`

const psRam = (h: string) =>
  `try { $r=Invoke-Command -ComputerName '${h}' -ScriptBlock { $os=Get-CimInstance Win32_OperatingSystem; [PSCustomObject]@{Used=[math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/1MB,1);Total=[math]::Round($os.TotalVisibleMemorySize/1MB,1);Pct=[math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/$os.TotalVisibleMemorySize*100)} } -EA Stop; $r|ConvertTo-Json -Compress } catch { 'ERR' }`

const psDisk = (h: string) =>
  `try { $r=Invoke-Command -ComputerName '${h}' -ScriptBlock { $d=Get-PSDrive C; [PSCustomObject]@{UsedGB=[math]::Round($d.Used/1GB,1);FreeGB=[math]::Round($d.Free/1GB,1);TotalGB=[math]::Round(($d.Used+$d.Free)/1GB,1);Pct=[math]::Round($d.Used/($d.Used+$d.Free)*100)} } -EA Stop; $r|ConvertTo-Json -Compress } catch { 'ERR' }`

const psUptime = (h: string) =>
  `try { $r=Invoke-Command -ComputerName '${h}' -ScriptBlock { $u=(Get-Date)-(Get-CimInstance Win32_OperatingSystem).LastBootUpTime; "$([int]$u.TotalDays)d $($u.Hours)h $($u.Minutes)m" } -EA Stop; "$r" } catch { 'ERR' }`

const psSysInfo = (h: string) =>
  `try { $r=Invoke-Command -ComputerName '${h}' -ScriptBlock { $cs=Get-CimInstance Win32_ComputerSystem; $os=Get-CimInstance Win32_OperatingSystem; $b=Get-CimInstance Win32_BIOS; [PSCustomObject]@{Hostname=$env:COMPUTERNAME;Model="$($cs.Manufacturer) $($cs.Model)";OS=$os.Caption;Build=$os.BuildNumber;Serial=$b.SerialNumber;RAM="$([math]::Round($cs.TotalPhysicalMemory/1GB,0)) GB"} } -EA Stop; $r|ConvertTo-Json -Compress } catch { 'ERR' }`

const psLoggedIn = (h: string) =>
  `try { $r=Invoke-Command -ComputerName '${h}' -ScriptBlock { (Get-CimInstance Win32_ComputerSystem).UserName } -EA Stop; if($r){"$r"}else{'Niemand'} } catch { 'ERR' }`

const psService = (h: string, svc: string) =>
  `try { $r=Invoke-Command -ComputerName '${h}' -ScriptBlock { Get-Service '${svc}' | Select Name,Status,StartType } -EA Stop; $r|ConvertTo-Json -Compress } catch { 'ERR' }`

const psEventErrors = (h: string) =>
  `try { $r=Invoke-Command -ComputerName '${h}' -ScriptBlock { (Get-EventLog -LogName System -EntryType Error -After (Get-Date).AddHours(-24) -EA SilentlyContinue).Count } -EA Stop; "$r" } catch { 'ERR' }`

const psUpdates = (h: string) =>
  `try { $r=Invoke-Command -ComputerName '${h}' -ScriptBlock { (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search('IsInstalled=0').Updates.Count } -EA Stop; "$r" } catch { 'ERR' }`

// ── Threshold evaluator ─────────────────────────────────────────────────────

function evalThresholds(thresholds: Threshold[], value: number): string | null {
  for (const t of thresholds) {
    const v = Number(t.value)
    if (t.condition === 'gt'  && value >  v) return t.color
    if (t.condition === 'lt'  && value <  v) return t.color
    if (t.condition === 'gte' && value >= v) return t.color
    if (t.condition === 'lte' && value <= v) return t.color
    if (t.condition === 'eq'  && value === v) return t.color
    if (t.condition === 'ne'  && value !== v) return t.color
  }
  return null
}

function defaultCpuColor(pct: number): string {
  if (pct < 50) return '#10b981'
  if (pct < 80) return '#f59e0b'
  return '#ef4444'
}

function parseOutput(raw: string): unknown {
  const s = raw.trim()
  if ((s.startsWith('{') || s.startsWith('[')) ) {
    try { return JSON.parse(s) } catch { /* fall through */ }
  }
  return s
}

// ── Sub-display components ──────────────────────────────────────────────────

function Gauge({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 45, cx = 60, cy = 60
  const circumference = Math.PI * r
  const dash = (Math.min(100, Math.max(0, value)) / 100) * circumference
  const pathD = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  return (
    <svg width="120" height="72" viewBox="0 0 120 72" className="mx-auto">
      <path d={pathD} fill="none" stroke="#2a2a3e" strokeWidth="12" strokeLinecap="round" />
      <path
        d={pathD} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
      />
      <text x={cx} y={cy - 2} textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">{value}%</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#888" fontSize="11">{label}</text>
    </svg>
  )
}

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 w-full px-2">
      <div className="flex justify-between text-xs">
        <span style={{ color: '#888' }}>{label}</span>
        <span style={{ color }}>{value}%</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#2a2a3e' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ── Loading / Error atoms ───────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 text-muted-foreground py-3">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-xs">Lade…</span>
    </div>
  )
}

function ErrorState({ msg = 'Fehler' }: { msg?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-red-400 text-xs py-2 px-1">
      <AlertTriangle size={13} />
      <span>{msg}</span>
    </div>
  )
}

// ── Edit-mode placeholder ───────────────────────────────────────────────────

const WIDGET_META: Record<string, { label: string; icon: React.ReactNode }> = {
  'online-status':    { label: 'Online/Offline-Status', icon: <Wifi size={22} /> },
  'service-status':   { label: 'Dienst-Status',         icon: <Settings size={22} /> },
  'cpu-usage':        { label: 'CPU-Auslastung',        icon: <Cpu size={22} /> },
  'ram-usage':        { label: 'RAM-Auslastung',        icon: <Database size={22} /> },
  'disk-usage':       { label: 'Festplatten-Belegung',  icon: <HardDrive size={22} /> },
  'uptime':           { label: 'Uptime',                icon: <Clock size={22} /> },
  'system-info':      { label: 'System-Info',           icon: <Monitor size={22} /> },
  'logged-in-user':   { label: 'Angemeldeter Benutzer', icon: <User size={22} /> },
  'event-log-errors': { label: 'Event-Log Fehler',      icon: <AlertTriangle size={22} /> },
  'windows-update':   { label: 'Windows Updates',       icon: <Download size={22} /> },
  'quick-actions':    { label: 'Schnellaktionen',        icon: <Zap size={22} /> },
  'clock':            { label: 'Uhr',                   icon: <Clock size={22} /> },
  'note':             { label: 'Notiz',                 icon: <FileText size={22} /> },
  'text-label':       { label: 'Beschriftung',          icon: <Type size={22} /> },
  'divider':          { label: 'Trennlinie',            icon: <Minus size={22} /> },
  'counter':          { label: 'Zähler',                icon: <Hash size={22} /> },
  'table':            { label: 'Tabelle',               icon: <Monitor size={22} /> },
}

function EditPlaceholder({ type }: { type: string }) {
  const meta = WIDGET_META[type] ?? { label: type, icon: <Activity size={22} /> }
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4 opacity-50 select-none">
      <span className="text-muted-foreground">{meta.icon}</span>
      <span className="text-xs text-muted-foreground font-medium">{meta.label}</span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget sub-implementations (live mode)
// ══════════════════════════════════════════════════════════════════════════════

// ── online-status ────────────────────────────────────────────────────────────

interface OnlineResult { hostname: string; status: 'online' | 'offline' | 'loading' | 'error' }

function OnlineStatusWidget({ element, onAlarmTrigger, refreshKey }: {
  element: DashboardElement
  onAlarmTrigger?: WidgetRendererProps['onAlarmTrigger']
  refreshKey: number
}) {
  const { config, thresholds, alarm } = element
  const [results, setResults] = useState<OnlineResult[]>(
    config.targets.map(h => ({ hostname: h, status: 'loading' }))
  )
  const isMounted = useRef(true)
  const alarmFiredRef = useRef<Set<string>>(new Set())
  // Keep onAlarmTrigger in a ref so it never needs to be in dependency arrays
  const onAlarmTriggerRef = useRef(onAlarmTrigger)
  useEffect(() => { onAlarmTriggerRef.current = onAlarmTrigger }, [onAlarmTrigger])

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return
    setResults(config.targets.map(h => ({ hostname: h, status: 'loading' })))
    await Promise.all(config.targets.map(async (h) => {
      try {
        const res = await api().runPowerShell(psOnline(h), 15000)
        if (!isMounted.current) return
        const status = res.stdout.trim() === 'online' ? 'online' : 'offline'
        setResults(prev => prev.map(r => r.hostname === h ? { ...r, status } : r))

        // Alarm logic
        if (
          status === 'offline' &&
          alarm?.enabled &&
          alarm.condition.type === 'offline' &&
          !alarmFiredRef.current.has(h)
        ) {
          alarmFiredRef.current.add(h)
          onAlarmTriggerRef.current?.({
            widgetId: element.id,
            dashboardId: '',
            widgetTitle: config.title ?? 'Online-Status',
            hostname: h,
            conditionText: `${h} ist offline`,
            currentValue: 'offline',
            triggeredAt: new Date().toISOString(),
          })
        } else if (status === 'online') {
          alarmFiredRef.current.delete(h)
        }
      } catch {
        if (isMounted.current)
          setResults(prev => prev.map(r => r.hostname === h ? { ...r, status: 'error' } : r))
      }
    }))
  }, [config.targets, alarm, element.id, config.title])

  useEffect(() => {
    isMounted.current = true
    fetchAll()
    let interval: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0) {
      interval = setInterval(fetchAll, config.refreshInterval * 1000)
    }
    return () => {
      isMounted.current = false
      if (interval) clearInterval(interval)
    }
  }, [fetchAll, config.autoRefresh, config.refreshInterval, refreshKey])

  const dotColor = (status: OnlineResult['status'], hostname: string): string => {
    if (status === 'loading') return '#6b7280'
    if (status === 'error')   return '#6b7280'
    if (thresholds?.length) {
      const val = status === 'online' ? 1 : 0
      const c = evalThresholds(thresholds, val)
      if (c) return c
    }
    return status === 'online' ? '#10b981' : '#ef4444'
  }

  const isTile = config.displayFormat !== 'list'

  if (isTile) {
    return (
      <div className="flex flex-wrap gap-2 p-1">
        {results.map(r => (
          <div
            key={r.hostname}
            className="flex flex-col items-center gap-1 rounded-lg px-3 py-2 min-w-[80px]"
            style={{ backgroundColor: '#1a1a2e' }}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: dotColor(r.status, r.hostname),
                boxShadow: r.status === 'online'
                  ? `0 0 6px ${dotColor(r.status, r.hostname)}`
                  : undefined,
              }}
            />
            <span className="text-xs font-mono truncate max-w-[96px]" title={r.hostname}>
              {r.hostname}
            </span>
            {r.status === 'loading'
              ? <Loader2 size={10} className="animate-spin text-muted-foreground" />
              : <span className="text-[10px]" style={{ color: dotColor(r.status, r.hostname) }}>
                  {r.status === 'online' ? 'Online' : r.status === 'error' ? 'Fehler' : 'Offline'}
                </span>
            }
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {results.map(r => (
        <div key={r.hostname} className="flex items-center gap-2.5 py-1.5 px-1">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              backgroundColor: dotColor(r.status, r.hostname),
              boxShadow: r.status === 'online' ? `0 0 5px ${dotColor(r.status, r.hostname)}` : undefined,
            }}
          />
          <span className="text-xs font-mono flex-1 truncate">{r.hostname}</span>
          {r.status === 'loading'
            ? <Loader2 size={12} className="animate-spin text-muted-foreground" />
            : <span className="text-xs shrink-0" style={{ color: dotColor(r.status, r.hostname) }}>
                {r.status === 'online' ? 'Online' : r.status === 'error' ? 'Fehler' : 'Offline'}
              </span>
          }
        </div>
      ))}
    </div>
  )
}

// ── service-status ───────────────────────────────────────────────────────────

interface SvcEntry { hostname: string; service: string; status: string; loading: boolean }

function ServiceStatusWidget({ element, refreshKey }: {
  element: DashboardElement
  refreshKey: number
}) {
  const { config } = element
  const services = config.services ?? []
  const targets  = config.targets

  const initial: SvcEntry[] = targets.flatMap(h =>
    services.map(s => ({ hostname: h, service: s, status: '', loading: true }))
  )
  const [rows, setRows] = useState<SvcEntry[]>(initial)
  const isMounted = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return
    setRows(targets.flatMap(h => services.map(s => ({ hostname: h, service: s, status: '', loading: true }))))
    await Promise.all(
      targets.flatMap(h =>
        services.map(async (s) => {
          try {
            const res = await api().runPowerShell(psService(h, s), 15000)
            if (!isMounted.current) return
            const raw = parseOutput(res.stdout) as { Status?: string } | string
            const statusStr = typeof raw === 'object' && raw !== null && 'Status' in raw
              ? String(raw.Status)
              : String(raw).trim()
            setRows(prev =>
              prev.map(r =>
                r.hostname === h && r.service === s
                  ? { ...r, status: statusStr, loading: false }
                  : r
              )
            )
          } catch {
            if (isMounted.current)
              setRows(prev =>
                prev.map(r =>
                  r.hostname === h && r.service === s
                    ? { ...r, status: 'ERR', loading: false }
                    : r
                )
              )
          }
        })
      )
    )
  }, [targets, services])

  useEffect(() => {
    isMounted.current = true
    fetchAll()
    let iv: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0)
      iv = setInterval(fetchAll, config.refreshInterval * 1000)
    return () => { isMounted.current = false; if (iv) clearInterval(iv) }
  }, [fetchAll, config.autoRefresh, config.refreshInterval, refreshKey])

  const statusColor = (s: string) => {
    if (s === 'Running')  return '#10b981'
    if (s === 'Stopped')  return '#ef4444'
    if (s === 'ERR')      return '#ef4444'
    return '#6b7280'
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {rows.length === 0 && (
        <span className="text-xs text-muted-foreground px-1 py-2">Keine Dienste konfiguriert</span>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5 px-1">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor(r.status) }} />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-xs font-medium truncate">{r.service}</span>
            {targets.length > 1 && (
              <span className="text-[10px] text-muted-foreground font-mono">{r.hostname}</span>
            )}
          </div>
          {r.loading
            ? <Loader2 size={12} className="animate-spin text-muted-foreground" />
            : <span className="text-xs shrink-0" style={{ color: statusColor(r.status) }}>
                {r.status === 'Running' ? 'Läuft' : r.status === 'Stopped' ? 'Gestoppt' : r.status || '?'}
              </span>
          }
        </div>
      ))}
    </div>
  )
}

// ── Numeric metric widget (cpu / ram / disk / uptime) helper ─────────────────

type MetricData =
  | { type: 'cpu'; pct: number }
  | { type: 'ram'; used: number; total: number; pct: number }
  | { type: 'disk'; usedGB: number; totalGB: number; pct: number }
  | { type: 'uptime'; text: string }
  | null

function MetricDisplay({
  data, thresholds, displayFormat, hostname,
}: {
  data: MetricData | 'loading' | 'error'
  thresholds: Threshold[]
  displayFormat: string
  hostname: string
}) {
  if (data === 'loading') return <LoadingState />
  if (data === null || data === 'error') return <ErrorState />

  let pct = 0
  let label = hostname
  let colorBase = '#10b981'
  let displayText = ''

  if (data.type === 'cpu') {
    pct = data.pct
    displayText = `${pct}%`
    colorBase = thresholds.length
      ? evalThresholds(thresholds, pct) ?? defaultCpuColor(pct)
      : defaultCpuColor(pct)
  } else if (data.type === 'ram') {
    pct = data.pct
    displayText = `${data.used} / ${data.total} GB (${pct}%)`
    colorBase = thresholds.length
      ? evalThresholds(thresholds, pct) ?? defaultCpuColor(pct)
      : defaultCpuColor(pct)
  } else if (data.type === 'disk') {
    pct = data.pct
    displayText = `${data.usedGB} / ${data.totalGB} GB (${100 - pct}% frei)`
    colorBase = thresholds.length
      ? evalThresholds(thresholds, pct) ?? defaultCpuColor(pct)
      : defaultCpuColor(pct)
  } else if (data.type === 'uptime') {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-2">
        <Clock size={18} className="text-blue-400" />
        <span className="text-lg font-bold text-white">{data.text}</span>
        <span className="text-xs text-muted-foreground">{hostname}</span>
      </div>
    )
  }

  if (displayFormat === 'gauge') {
    return <Gauge value={pct} color={colorBase} label={label} />
  }
  if (displayFormat === 'bar') {
    return <Bar value={pct} color={colorBase} label={displayText} />
  }
  // 'number' or default
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 py-1">
      <span className="text-2xl font-bold" style={{ color: colorBase }}>
        {data.type === 'cpu' ? `${pct}%` : displayText}
      </span>
      <span className="text-xs text-muted-foreground">{hostname}</span>
    </div>
  )
}

// ── cpu-usage ────────────────────────────────────────────────────────────────

function CpuWidget({ element, refreshKey }: { element: DashboardElement; refreshKey: number }) {
  const { config, thresholds = [] } = element
  const targets = config.targets
  const [dataMap, setDataMap] = useState<Record<string, MetricData | 'loading' | 'error'>>(
    Object.fromEntries(targets.map(h => [h, 'loading']))
  )
  const isMounted = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return
    setDataMap(Object.fromEntries(targets.map(h => [h, 'loading'])))
    await Promise.all(targets.map(async h => {
      try {
        const res = await api().runPowerShell(psCpu(h), 15000)
        if (!isMounted.current) return
        const raw = res.stdout.trim()
        const pct = parseInt(raw, 10)
        setDataMap(prev => ({ ...prev, [h]: isNaN(pct) ? 'error' : { type: 'cpu', pct } }))
      } catch {
        if (isMounted.current) setDataMap(prev => ({ ...prev, [h]: 'error' }))
      }
    }))
  }, [targets])

  useEffect(() => {
    isMounted.current = true
    fetchAll()
    let iv: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0)
      iv = setInterval(fetchAll, config.refreshInterval * 1000)
    return () => { isMounted.current = false; if (iv) clearInterval(iv) }
  }, [fetchAll, config.autoRefresh, config.refreshInterval, refreshKey])

  return (
    <div className="flex flex-col gap-2">
      {targets.map(h => (
        <MetricDisplay
          key={h} data={dataMap[h] ?? 'loading'}
          thresholds={thresholds}
          displayFormat={config.displayFormat ?? 'bar'}
          hostname={h}
        />
      ))}
    </div>
  )
}

// ── ram-usage ────────────────────────────────────────────────────────────────

function RamWidget({ element, refreshKey }: { element: DashboardElement; refreshKey: number }) {
  const { config, thresholds = [] } = element
  const targets = config.targets
  const [dataMap, setDataMap] = useState<Record<string, MetricData | 'loading' | 'error'>>(
    Object.fromEntries(targets.map(h => [h, 'loading']))
  )
  const isMounted = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return
    setDataMap(Object.fromEntries(targets.map(h => [h, 'loading'])))
    await Promise.all(targets.map(async h => {
      try {
        const res = await api().runPowerShell(psRam(h), 15000)
        if (!isMounted.current) return
        const parsed = parseOutput(res.stdout) as { Used?: number; Total?: number; Pct?: number } | string
        if (typeof parsed === 'object' && parsed !== null && 'Pct' in parsed) {
          setDataMap(prev => ({ ...prev, [h]: {
            type: 'ram',
            used: parsed.Used ?? 0,
            total: parsed.Total ?? 0,
            pct: parsed.Pct ?? 0,
          }}))
        } else {
          setDataMap(prev => ({ ...prev, [h]: 'error' }))
        }
      } catch {
        if (isMounted.current) setDataMap(prev => ({ ...prev, [h]: 'error' }))
      }
    }))
  }, [targets])

  useEffect(() => {
    isMounted.current = true
    fetchAll()
    let iv: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0)
      iv = setInterval(fetchAll, config.refreshInterval * 1000)
    return () => { isMounted.current = false; if (iv) clearInterval(iv) }
  }, [fetchAll, config.autoRefresh, config.refreshInterval, refreshKey])

  return (
    <div className="flex flex-col gap-2">
      {targets.map(h => (
        <MetricDisplay
          key={h} data={dataMap[h] ?? 'loading'}
          thresholds={thresholds}
          displayFormat={config.displayFormat ?? 'bar'}
          hostname={h}
        />
      ))}
    </div>
  )
}

// ── disk-usage ───────────────────────────────────────────────────────────────

function DiskWidget({ element, refreshKey }: { element: DashboardElement; refreshKey: number }) {
  const { config, thresholds = [] } = element
  const targets = config.targets
  const [dataMap, setDataMap] = useState<Record<string, MetricData | 'loading' | 'error'>>(
    Object.fromEntries(targets.map(h => [h, 'loading']))
  )
  const isMounted = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return
    setDataMap(Object.fromEntries(targets.map(h => [h, 'loading'])))
    await Promise.all(targets.map(async h => {
      try {
        const res = await api().runPowerShell(psDisk(h), 15000)
        if (!isMounted.current) return
        const parsed = parseOutput(res.stdout) as {
          UsedGB?: number; FreeGB?: number; TotalGB?: number; Pct?: number
        } | string
        if (typeof parsed === 'object' && parsed !== null && 'Pct' in parsed) {
          setDataMap(prev => ({ ...prev, [h]: {
            type: 'disk',
            usedGB: parsed.UsedGB ?? 0,
            totalGB: parsed.TotalGB ?? 0,
            pct: parsed.Pct ?? 0,
          }}))
        } else {
          setDataMap(prev => ({ ...prev, [h]: 'error' }))
        }
      } catch {
        if (isMounted.current) setDataMap(prev => ({ ...prev, [h]: 'error' }))
      }
    }))
  }, [targets])

  useEffect(() => {
    isMounted.current = true
    fetchAll()
    let iv: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0)
      iv = setInterval(fetchAll, config.refreshInterval * 1000)
    return () => { isMounted.current = false; if (iv) clearInterval(iv) }
  }, [fetchAll, config.autoRefresh, config.refreshInterval, refreshKey])

  return (
    <div className="flex flex-col gap-2">
      {targets.map(h => (
        <MetricDisplay
          key={h} data={dataMap[h] ?? 'loading'}
          thresholds={thresholds}
          displayFormat={config.displayFormat ?? 'bar'}
          hostname={h}
        />
      ))}
    </div>
  )
}

// ── uptime ───────────────────────────────────────────────────────────────────

function UptimeWidget({ element, refreshKey }: { element: DashboardElement; refreshKey: number }) {
  const { config } = element
  const targets = config.targets
  const [dataMap, setDataMap] = useState<Record<string, string | 'loading' | 'error'>>(
    Object.fromEntries(targets.map(h => [h, 'loading']))
  )
  const isMounted = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return
    setDataMap(Object.fromEntries(targets.map(h => [h, 'loading'])))
    await Promise.all(targets.map(async h => {
      try {
        const res = await api().runPowerShell(psUptime(h), 15000)
        if (!isMounted.current) return
        const val = res.stdout.trim()
        setDataMap(prev => ({ ...prev, [h]: val === 'ERR' ? 'error' : val }))
      } catch {
        if (isMounted.current) setDataMap(prev => ({ ...prev, [h]: 'error' }))
      }
    }))
  }, [targets])

  useEffect(() => {
    isMounted.current = true
    fetchAll()
    let iv: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0)
      iv = setInterval(fetchAll, config.refreshInterval * 1000)
    return () => { isMounted.current = false; if (iv) clearInterval(iv) }
  }, [fetchAll, config.autoRefresh, config.refreshInterval, refreshKey])

  return (
    <div className="flex flex-col gap-2">
      {targets.map(h => {
        const val = dataMap[h] ?? 'loading'
        if (val === 'loading') return <LoadingState key={h} />
        if (val === 'error')   return <ErrorState key={h} />
        return (
          <div key={h} className="flex flex-col items-center justify-center gap-1 py-2">
            <Clock size={18} className="text-blue-400" />
            <span className="text-lg font-bold text-white">{val}</span>
            <span className="text-xs text-muted-foreground">{h}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── system-info ───────────────────────────────────────────────────────────────

interface SysInfoData {
  Hostname?: string; Model?: string; OS?: string
  Build?: string; Serial?: string; RAM?: string
}

const SYS_INFO_LABELS: Record<string, string> = {
  Hostname: 'Hostname',
  Model:    'Modell',
  OS:       'Betriebssystem',
  Build:    'Build',
  Serial:   'Seriennummer',
  RAM:      'RAM',
}

function SystemInfoWidget({ element, refreshKey }: { element: DashboardElement; refreshKey: number }) {
  const { config } = element
  const target = config.targets[0] ?? ''
  const [data, setData] = useState<SysInfoData | null | 'loading' | 'error'>('loading')
  const isMounted = useRef(true)

  const fetch = useCallback(async () => {
    if (!isMounted.current || !target) return
    setData('loading')
    try {
      const res = await api().runPowerShell(psSysInfo(target), 15000)
      if (!isMounted.current) return
      const parsed = parseOutput(res.stdout)
      if (typeof parsed === 'object' && parsed !== null) {
        setData(parsed as SysInfoData)
      } else {
        setData('error')
      }
    } catch {
      if (isMounted.current) setData('error')
    }
  }, [target])

  useEffect(() => {
    isMounted.current = true
    fetch()
    let iv: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0)
      iv = setInterval(fetch, config.refreshInterval * 1000)
    return () => { isMounted.current = false; if (iv) clearInterval(iv) }
  }, [fetch, config.autoRefresh, config.refreshInterval, refreshKey])

  if (!target) return <ErrorState msg="Kein Ziel konfiguriert" />
  if (data === 'loading') return <LoadingState />
  if (data === 'error' || data === null) return <ErrorState />

  const fields = config.fields?.length
    ? config.fields
    : Object.keys(SYS_INFO_LABELS)

  return (
    <div className="flex flex-col divide-y divide-border text-xs">
      {fields.map(f => {
        const val = (data as Record<string, string>)[f]
        if (val === undefined) return null
        return (
          <div key={f} className="flex justify-between py-1.5 px-1 gap-2">
            <span className="text-muted-foreground shrink-0">{SYS_INFO_LABELS[f] ?? f}</span>
            <span className="text-right font-mono truncate">{val}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── logged-in-user ───────────────────────────────────────────────────────────

function LoggedInUserWidget({ element, refreshKey }: { element: DashboardElement; refreshKey: number }) {
  const { config } = element
  const targets = config.targets
  const [userMap, setUserMap] = useState<Record<string, string | 'loading' | 'error'>>(
    Object.fromEntries(targets.map(h => [h, 'loading']))
  )
  const isMounted = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return
    setUserMap(Object.fromEntries(targets.map(h => [h, 'loading'])))
    await Promise.all(targets.map(async h => {
      try {
        const res = await api().runPowerShell(psLoggedIn(h), 15000)
        if (!isMounted.current) return
        const val = res.stdout.trim()
        setUserMap(prev => ({ ...prev, [h]: val === 'ERR' ? 'error' : val }))
      } catch {
        if (isMounted.current) setUserMap(prev => ({ ...prev, [h]: 'error' }))
      }
    }))
  }, [targets])

  useEffect(() => {
    isMounted.current = true
    fetchAll()
    let iv: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0)
      iv = setInterval(fetchAll, config.refreshInterval * 1000)
    return () => { isMounted.current = false; if (iv) clearInterval(iv) }
  }, [fetchAll, config.autoRefresh, config.refreshInterval, refreshKey])

  return (
    <div className="flex flex-col gap-2">
      {targets.map(h => {
        const val = userMap[h] ?? 'loading'
        if (val === 'loading') return <LoadingState key={h} />
        if (val === 'error')   return <ErrorState key={h} />
        const isNobody = val === 'Niemand'
        return (
          <div key={h} className="flex items-center gap-2.5 py-1 px-1">
            <div className={`p-1.5 rounded-full ${isNobody ? 'bg-muted' : 'bg-blue-500/20'}`}>
              <User size={14} className={isNobody ? 'text-muted-foreground' : 'text-blue-400'} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{val}</span>
              {targets.length > 1 && (
                <span className="text-[10px] text-muted-foreground font-mono">{h}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── event-log-errors ─────────────────────────────────────────────────────────

function EventLogErrorsWidget({ element, refreshKey }: { element: DashboardElement; refreshKey: number }) {
  const { config } = element
  const targets = config.targets
  const [countMap, setCountMap] = useState<Record<string, number | 'loading' | 'error'>>(
    Object.fromEntries(targets.map(h => [h, 'loading']))
  )
  const isMounted = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return
    setCountMap(Object.fromEntries(targets.map(h => [h, 'loading'])))
    await Promise.all(targets.map(async h => {
      try {
        const res = await api().runPowerShell(psEventErrors(h), 15000)
        if (!isMounted.current) return
        const n = parseInt(res.stdout.trim(), 10)
        setCountMap(prev => ({ ...prev, [h]: isNaN(n) ? 'error' : n }))
      } catch {
        if (isMounted.current) setCountMap(prev => ({ ...prev, [h]: 'error' }))
      }
    }))
  }, [targets])

  useEffect(() => {
    isMounted.current = true
    fetchAll()
    let iv: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0)
      iv = setInterval(fetchAll, config.refreshInterval * 1000)
    return () => { isMounted.current = false; if (iv) clearInterval(iv) }
  }, [fetchAll, config.autoRefresh, config.refreshInterval, refreshKey])

  return (
    <div className="flex flex-col gap-2">
      {targets.map(h => {
        const val = countMap[h] ?? 'loading'
        if (val === 'loading') return <LoadingState key={h} />
        if (val === 'error')   return <ErrorState key={h} />
        const count = val as number
        const hasErrors = count > 0
        return (
          <div key={h} className="flex items-center gap-2.5 py-1 px-1">
            {hasErrors
              ? <XCircle size={16} className="text-red-400 shrink-0" />
              : <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            }
            <div className="flex flex-col min-w-0">
              <span className={`text-sm font-semibold ${hasErrors ? 'text-red-400' : 'text-green-400'}`}>
                {hasErrors ? `${count} Fehler (24h)` : 'Keine Fehler'}
              </span>
              {targets.length > 1 && (
                <span className="text-[10px] text-muted-foreground font-mono">{h}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── windows-update ───────────────────────────────────────────────────────────

function WindowsUpdateWidget({ element, refreshKey }: { element: DashboardElement; refreshKey: number }) {
  const { config } = element
  const targets = config.targets
  const [countMap, setCountMap] = useState<Record<string, number | 'loading' | 'error'>>(
    Object.fromEntries(targets.map(h => [h, 'loading']))
  )
  const isMounted = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return
    setCountMap(Object.fromEntries(targets.map(h => [h, 'loading'])))
    await Promise.all(targets.map(async h => {
      try {
        const res = await api().runPowerShell(psUpdates(h), 15000)
        if (!isMounted.current) return
        const n = parseInt(res.stdout.trim(), 10)
        setCountMap(prev => ({ ...prev, [h]: isNaN(n) ? 'error' : n }))
      } catch {
        if (isMounted.current) setCountMap(prev => ({ ...prev, [h]: 'error' }))
      }
    }))
  }, [targets])

  useEffect(() => {
    isMounted.current = true
    fetchAll()
    let iv: ReturnType<typeof setInterval> | null = null
    if (config.autoRefresh && config.refreshInterval > 0)
      iv = setInterval(fetchAll, config.refreshInterval * 1000)
    return () => { isMounted.current = false; if (iv) clearInterval(iv) }
  }, [fetchAll, config.autoRefresh, config.refreshInterval, refreshKey])

  return (
    <div className="flex flex-col gap-2">
      {targets.map(h => {
        const val = countMap[h] ?? 'loading'
        if (val === 'loading') return <LoadingState key={h} />
        if (val === 'error')   return <ErrorState key={h} />
        const count = val as number
        const hasPending = count > 0
        return (
          <div key={h} className="flex items-center gap-2.5 py-1 px-1">
            <Download
              size={16}
              className={`shrink-0 ${hasPending ? 'text-amber-400' : 'text-green-400'}`}
            />
            <div className="flex flex-col min-w-0">
              <span className={`text-sm font-semibold ${hasPending ? 'text-amber-400' : 'text-green-400'}`}>
                {hasPending ? `${count} Updates ausstehend` : 'Aktuell'}
              </span>
              {targets.length > 1 && (
                <span className="text-[10px] text-muted-foreground font-mono">{h}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── quick-actions ────────────────────────────────────────────────────────────

const DEFAULT_ACTIONS = (target: string): QuickAction[] => [
  {
    id: 'restart', label: 'Neustart', confirmRequired: true, color: 'red',
    command: `Restart-Computer -ComputerName '${target}' -Force`,
  },
  {
    id: 'shutdown', label: 'Herunterfahren', confirmRequired: true, color: 'red',
    command: `Stop-Computer -ComputerName '${target}' -Force`,
  },
  {
    id: 'gpupdate', label: 'GP-Update', confirmRequired: false, color: 'blue',
    command: `Invoke-Command -ComputerName '${target}' -ScriptBlock { gpupdate /force }`,
  },
  {
    id: 'spooler', label: 'Spooler neu', confirmRequired: false, color: 'amber',
    command: `Invoke-Command -ComputerName '${target}' -ScriptBlock { Restart-Service Spooler }`,
  },
]

const ACTION_COLOR_MAP: Record<string, string> = {
  red:   'bg-red-500/20 text-red-300 hover:bg-red-500/40 border-red-500/30',
  blue:  'bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 border-blue-500/30',
  amber: 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/40 border-amber-500/30',
  green: 'bg-green-500/20 text-green-300 hover:bg-green-500/40 border-green-500/30',
}

function QuickActionsWidget({ element }: { element: DashboardElement }) {
  const { config } = element
  const target = config.targets[0] ?? ''
  const actions = (config.actions?.length ? config.actions : DEFAULT_ACTIONS(target))
    .map(a => ({
      ...a,
      command: a.command.replace(/TARGET/g, target),
    }))

  const [runningId, setRunningId] = useState<string | null>(null)
  const [resultId, setResultId]   = useState<string | null>(null)
  const [resultOk, setResultOk]   = useState(true)
  const isMounted = useRef(true)

  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false } }, [])

  const run = async (action: QuickAction) => {
    if (action.confirmRequired) {
      const ok = window.confirm(
        `Aktion "${action.label}" auf ${target || 'Ziel'} ausführen?`
      )
      if (!ok) return
    }
    setRunningId(action.id)
    try {
      const res = await api().runPowerShell(action.command, 30000)
      if (!isMounted.current) return
      setResultOk(res.exitCode === 0 && !res.timedOut)
    } catch {
      if (isMounted.current) setResultOk(false)
    } finally {
      if (isMounted.current) {
        setRunningId(null)
        setResultId(action.id)
        setTimeout(() => { if (isMounted.current) setResultId(null) }, 3000)
      }
    }
  }

  return (
    <div className="flex flex-wrap gap-2 p-1">
      {!target && (
        <span className="text-xs text-muted-foreground">Kein Ziel konfiguriert</span>
      )}
      {actions.map(a => {
        const colorCls = ACTION_COLOR_MAP[a.color] ?? ACTION_COLOR_MAP['blue']
        const isRunning = runningId === a.id
        const isResult  = resultId  === a.id
        return (
          <button
            key={a.id}
            onClick={() => run(a)}
            disabled={!!runningId}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colorCls}
            `}
          >
            {isRunning && <Loader2 size={11} className="animate-spin" />}
            {isResult && (resultOk
              ? <CheckCircle2 size={11} className="text-green-400" />
              : <XCircle size={11} className="text-red-400" />
            )}
            {!isRunning && !isResult && <Zap size={11} />}
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

// ── clock ────────────────────────────────────────────────────────────────────

function ClockWidget({ element }: { element: DashboardElement }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`

  const { style } = element
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 py-2"
      style={{ textAlign: style.textAlign }}
    >
      <span
        className="font-bold tabular-nums leading-none"
        style={{ fontSize: Math.max(style.fontSize * 2, 28), color: style.textColor }}
      >
        {time}
      </span>
      <span className="text-sm text-muted-foreground">{date}</span>
    </div>
  )
}

// ── note ─────────────────────────────────────────────────────────────────────

function NoteWidget({ element }: { element: DashboardElement }) {
  const { config, style } = element
  return (
    <div
      className="w-full h-full overflow-auto text-sm leading-relaxed"
      style={{
        whiteSpace: 'pre-wrap',
        color: style.textColor,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontBold ? 'bold' : 'normal',
        fontStyle: style.fontItalic ? 'italic' : 'normal',
        textAlign: style.textAlign,
      }}
    >
      {config.text || <span className="text-muted-foreground italic">Kein Text</span>}
    </div>
  )
}

// ── text-label ───────────────────────────────────────────────────────────────

function TextLabelWidget({ element }: { element: DashboardElement }) {
  const { config, style } = element
  return (
    <div
      className="w-full flex items-center"
      style={{
        color: style.textColor,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontBold ? 'bold' : 'normal',
        fontStyle: style.fontItalic ? 'italic' : 'normal',
        textAlign: style.textAlign,
        justifyContent: style.textAlign === 'center' ? 'center'
          : style.textAlign === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      {config.text || ''}
    </div>
  )
}

// ── divider ──────────────────────────────────────────────────────────────────

function DividerWidget({ element }: { element: DashboardElement }) {
  const { config, style } = element
  return (
    <div className="flex items-center gap-3 w-full py-1">
      <div
        className="flex-1"
        style={{
          height: Math.max(1, style.borderWidth),
          backgroundColor: style.borderColor,
          borderStyle: style.borderStyle !== 'none' ? style.borderStyle : 'solid',
        }}
      />
      {config.text && (
        <>
          <span
            className="text-xs shrink-0"
            style={{ color: style.titleColor, fontFamily: style.fontFamily }}
          >
            {config.text}
          </span>
          <div
            className="flex-1"
            style={{
              height: Math.max(1, style.borderWidth),
              backgroundColor: style.borderColor,
            }}
          />
        </>
      )}
    </div>
  )
}

// ── counter ──────────────────────────────────────────────────────────────────

function CounterWidget({ element }: { element: DashboardElement }) {
  const { config, style } = element
  // Static value from config.text, or count of targets
  const rawVal = config.text?.trim()
  const value  = rawVal && /^\d+$/.test(rawVal)
    ? parseInt(rawVal, 10)
    : config.targets.length

  return (
    <div className="flex flex-col items-center justify-center gap-1 py-2">
      <span
        className="font-bold tabular-nums leading-none"
        style={{ fontSize: Math.max(style.fontSize * 3, 48), color: style.textColor }}
      >
        {value}
      </span>
      {config.title && (
        <span className="text-xs text-muted-foreground">{config.title}</span>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// WidgetRenderer – main export
// ══════════════════════════════════════════════════════════════════════════════

export interface WidgetRendererProps {
  element: DashboardElement
  mode: 'edit' | 'live'
  isSelected?: boolean
  onAlarmTrigger?: (alarm: Omit<ActiveAlarm, 'id' | 'acknowledged'>) => void
}

export default function WidgetRenderer({ element, mode, isSelected: _isSelected, onAlarmTrigger }: WidgetRendererProps) {
  const { style, config, type } = element
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Track last update time when refresh key changes (after first render)
  useEffect(() => {
    if (refreshKey > 0) setLastUpdated(new Date())
  }, [refreshKey])

  // Also set initial load timestamp
  useEffect(() => {
    const t = setTimeout(() => setLastUpdated(new Date()), 500)
    return () => clearTimeout(t)
  }, [])

  // ── Container styles ──────────────────────────────────────────────────────
  const containerStyle: React.CSSProperties = {
    backgroundColor: style.backgroundColor,
    borderRadius:    style.borderRadius,
    borderColor:     style.borderColor,
    borderWidth:     style.borderStyle !== 'none' ? style.borderWidth : 0,
    borderStyle:     style.borderStyle !== 'none' ? style.borderStyle : undefined,
    opacity:         style.opacity,
    boxShadow:       style.shadow ? '0 4px 20px rgba(0,0,0,0.4)' : undefined,
    fontFamily:      style.fontFamily,
    fontSize:        style.fontSize,
    color:           style.textColor,
    textAlign:       style.textAlign,
    width:           '100%',
    height:          '100%',
    overflow:        'hidden',
    display:         'flex',
    flexDirection:   'column',
  }

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const fmtTime = (d: Date) =>
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`

  // ── Widget content ────────────────────────────────────────────────────────
  const renderContent = () => {
    if (mode === 'edit') return <EditPlaceholder type={type} />

    switch (type) {
      case 'online-status':
        return (
          <OnlineStatusWidget
            element={element} onAlarmTrigger={onAlarmTrigger} refreshKey={refreshKey}
          />
        )
      case 'service-status':
        return <ServiceStatusWidget element={element} refreshKey={refreshKey} />
      case 'cpu-usage':
        return <CpuWidget element={element} refreshKey={refreshKey} />
      case 'ram-usage':
        return <RamWidget element={element} refreshKey={refreshKey} />
      case 'disk-usage':
        return <DiskWidget element={element} refreshKey={refreshKey} />
      case 'uptime':
        return <UptimeWidget element={element} refreshKey={refreshKey} />
      case 'system-info':
        return <SystemInfoWidget element={element} refreshKey={refreshKey} />
      case 'logged-in-user':
        return <LoggedInUserWidget element={element} refreshKey={refreshKey} />
      case 'event-log-errors':
        return <EventLogErrorsWidget element={element} refreshKey={refreshKey} />
      case 'windows-update':
        return <WindowsUpdateWidget element={element} refreshKey={refreshKey} />
      case 'quick-actions':
        return <QuickActionsWidget element={element} />
      case 'clock':
        return <ClockWidget element={element} />
      case 'note':
        return <NoteWidget element={element} />
      case 'text-label':
        return <TextLabelWidget element={element} />
      case 'divider':
        return <DividerWidget element={element} />
      case 'counter':
        return <CounterWidget element={element} />
      case 'table':
        return (
          <div className="flex items-center justify-center text-muted-foreground text-xs py-4">
            <ServerCrash size={14} className="mr-1.5" />
            Tabellen-Widget (in Entwicklung)
          </div>
        )
      default:
        return <EditPlaceholder type={type} />
    }
  }

  return (
    <div style={containerStyle}>
      {/* Title row */}
      {style.titleVisible && config.title && (
        <div
          className="flex items-center justify-between px-3 pt-2.5 pb-1 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span
            className="text-xs font-semibold truncate"
            style={{ color: style.titleColor }}
          >
            {config.title}
          </span>
          {config.showRefreshButton && mode === 'live' && (
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="ml-2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Aktualisieren"
            >
              <RefreshCw size={11} />
            </button>
          )}
        </div>
      )}

      {/* Refresh button without title */}
      {(!style.titleVisible || !config.title) && config.showRefreshButton && mode === 'live' && (
        <div className="flex justify-end px-2 pt-1 shrink-0">
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw size={11} />
          </button>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto px-2 py-1.5 min-h-0">
        {renderContent()}
      </div>

      {/* Timestamp footer */}
      {config.showTimestamp && lastUpdated && mode === 'live' && (
        <div className="px-3 pb-1.5 pt-0.5 shrink-0">
          <span className="text-[10px] text-muted-foreground/60">
            zuletzt: {fmtTime(lastUpdated)}
          </span>
        </div>
      )}
    </div>
  )
}
