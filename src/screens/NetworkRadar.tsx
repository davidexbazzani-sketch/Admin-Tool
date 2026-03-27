import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Activity, RefreshCw, Loader, AlertTriangle, CheckCircle, XCircle,
  ChevronRight, Terminal, Lightbulb, BarChart3, Shield, Cpu, HardDrive,
  TrendingDown, Wifi, WifiOff, Filter, ArrowUpDown, Play,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { useRadarStore, getAbortFlag, setAbortFlag, type RadarHealthScore, type RadarPattern } from '../store/radarStore'
import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthScore {
  hostname: string
  label?: string
  online: boolean
  total: number
  hardware: number
  security: number
  performance: number
  prediction: number
  details: Record<string, string>
  recommendations: Recommendation[]
  timestamp: string
}

interface Recommendation {
  severity: 'critical' | 'warning' | 'info'
  text: string
  skillId?: string
}

interface Pattern {
  id: string
  severity: 'critical' | 'warning' | 'info'
  icon: string
  title: string
  description: string
  affectedCount: number
  affectedHosts: string[]
  recommendation: string
  detectedAt: string
}

type Tab = 'health' | 'patterns'
type SortKey = 'score-asc' | 'score-desc' | 'name' | 'status'
type FilterKey = 'all' | 'green' | 'yellow' | 'red' | 'offline'

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-red-400'
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-400'
  if (score >= 40) return 'bg-amber-400'
  return 'bg-red-400'
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Gesund'
  if (score >= 40) return 'Warnung'
  return 'Kritisch'
}

// ── Score Bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, max, label }: { score: number; max: number; label: string }) {
  const pct = Math.round((score / max) * 100)
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={scoreColor(pct)}>{score}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div className={`h-full rounded-full ${scoreBg(pct)} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── PC Row ────────────────────────────────────────────────────────────────────
function PCRow({ hs, onDetail, onRemoteDoc }: {
  hs: HealthScore
  onDetail: () => void
  onRemoteDoc: () => void
}) {
  const topIssues = hs.recommendations.filter(r => r.severity !== 'info').slice(0, 2)
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/10 transition-colors border-b border-border/50">
      {/* Score */}
      <div className={`w-14 text-center shrink-0 ${scoreColor(hs.total)}`}>
        <span className="text-lg font-bold">{hs.online ? hs.total : '—'}</span>
        <span className="text-[9px] block">/100</span>
      </div>

      {/* Status dot */}
      <span className={`w-3 h-3 rounded-full shrink-0 ${hs.online ? scoreBg(hs.total) : 'bg-muted-foreground/30'}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground font-mono">{hs.hostname}</span>
          {hs.label && <span className="text-[10px] text-muted-foreground">"{hs.label}"</span>}
          {!hs.online && <span className="text-[9px] text-muted-foreground bg-muted/30 px-1 rounded">Offline</span>}
        </div>
        {hs.online && topIssues.length > 0 && (
          <div className="flex items-center gap-2 mt-0.5">
            {topIssues.map((r, i) => (
              <span key={i} className={`text-[9px] ${r.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>
                {r.severity === 'critical' ? '🔴' : '🟡'} {r.text}
              </span>
            ))}
          </div>
        )}
        {hs.online && topIssues.length === 0 && (
          <span className="text-[9px] text-emerald-400">✅ Alles OK</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onDetail} className="px-2 py-1 text-[10px] rounded border border-border hover:bg-accent text-muted-foreground">Details</button>
        <button onClick={onRemoteDoc} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Remote Doc"><Terminal size={12} /></button>
      </div>
    </div>
  )
}

// ── Pattern Card ──────────────────────────────────────────────────────────────
function PatternCard({ pattern }: { pattern: Pattern }) {
  const [expanded, setExpanded] = useState(false)
  const colors = { critical: 'border-red-500/30 bg-red-500/5', warning: 'border-amber-500/30 bg-amber-500/5', info: 'border-blue-500/30 bg-blue-500/5' }
  const labels = { critical: '🔴 KRITISCH', warning: '🟡 WARNUNG', info: 'ℹ️ INFO' }

  return (
    <div className={`rounded-lg border p-4 space-y-2 ${colors[pattern.severity]}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm">{pattern.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold">{labels[pattern.severity]}</span>
          </div>
          <p className="text-xs font-medium text-foreground mt-0.5">{pattern.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{pattern.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-muted-foreground">{pattern.affectedCount} PCs betroffen</span>
        <button onClick={() => setExpanded(!expanded)} className="text-primary hover:underline">
          {expanded ? 'Weniger' : 'Details'}
        </button>
      </div>
      {expanded && (
        <div className="space-y-1 pt-1 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground">Betroffene: {pattern.affectedHosts.join(', ')}</p>
          <p className="text-[10px] text-foreground">Empfehlung: {pattern.recommendation}</p>
        </div>
      )}
    </div>
  )
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ hs, onClose, onRunSkill }: {
  hs: HealthScore
  onClose: () => void
  onRunSkill: (hostname: string, skillId: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-[600px] max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-2 sticky top-0 bg-card z-10">
          <span className={`w-4 h-4 rounded-full ${scoreBg(hs.total)}`} />
          <span className="font-semibold text-sm text-foreground font-mono">{hs.hostname}</span>
          {hs.label && <span className="text-xs text-muted-foreground">— {hs.label}</span>}
          <span className={`ml-auto text-lg font-bold ${scoreColor(hs.total)}`}>{hs.total}/100</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground ml-2">
            <XCircle size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Overall score bar */}
          <div className="h-3 rounded-full bg-muted/30 overflow-hidden">
            <div className={`h-full rounded-full ${scoreBg(hs.total)} transition-all`} style={{ width: `${hs.total}%` }} />
          </div>

          {/* 4 pillars grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-1 text-xs font-medium">
                <HardDrive size={12} /> Hardware
                <span className={`ml-auto ${scoreColor((hs.hardware / 25) * 100)}`}>{hs.hardware}/25</span>
              </div>
              <ScoreBar score={hs.hardware} max={25} label="Hardware" />
              {Object.entries(hs.details).filter(([k]) => ['ssdHealth', 'battery', 'ramErrors', 'temperature'].includes(k)).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-[9px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground">{v}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-1 text-xs font-medium">
                <Shield size={12} /> Sicherheit
                <span className={`ml-auto ${scoreColor((hs.security / 30) * 100)}`}>{hs.security}/30</span>
              </div>
              <ScoreBar score={hs.security} max={30} label="Sicherheit" />
              {Object.entries(hs.details).filter(([k]) => ['defenderActive', 'bitlocker', 'firewall', 'pendingUpdates', 'localAdmins'].includes(k)).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-[9px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground">{v}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-1 text-xs font-medium">
                <Cpu size={12} /> Performance
                <span className={`ml-auto ${scoreColor((hs.performance / 25) * 100)}`}>{hs.performance}/25</span>
              </div>
              <ScoreBar score={hs.performance} max={25} label="Performance" />
              {Object.entries(hs.details).filter(([k]) => ['diskFree', 'ramUsage', 'uptime', 'weeklyErrors', 'autostartCount'].includes(k)).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-[9px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground">{v}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-1 text-xs font-medium">
                <TrendingDown size={12} /> Vorhersage
                <span className={`ml-auto ${scoreColor((hs.prediction / 20) * 100)}`}>{hs.prediction}/20</span>
              </div>
              <ScoreBar score={hs.prediction} max={20} label="Vorhersage" />
              {Object.entries(hs.details).filter(([k]) => ['ssdLifeRemaining', 'diskFullIn', 'certExpiry', 'deviceAge'].includes(k)).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-[9px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {hs.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Empfehlungen</p>
              <div className="space-y-1.5">
                {hs.recommendations.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span>{r.severity === 'critical' ? '🔴' : r.severity === 'warning' ? '🟡' : 'ℹ️'}</span>
                    <span className="flex-1 text-foreground">{r.text}</span>
                    {r.skillId && (
                      <button onClick={() => onRunSkill(hs.hostname, r.skillId!)}
                        className="flex items-center gap-1 px-2 py-0.5 text-[9px] rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 shrink-0">
                        <Play size={9} /> Ausführen
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Health Score calculation ───────────────────────────────────────────────────
function calculateScore(raw: Record<string, unknown>): Omit<HealthScore, 'hostname' | 'label' | 'timestamp'> {
  let hw = 25, sec = 30, perf = 25, pred = 20
  const details: Record<string, string> = {}
  const recommendations: Recommendation[] = []

  // Hardware
  const ssd = String(raw.ssdHealth ?? 'Unknown')
  details.ssdHealth = ssd
  if (ssd.includes('Warning') || ssd.includes('Caution')) { hw -= 15; recommendations.push({ severity: 'warning', text: 'SSD zeigt Warnungen', skillId: 'rd_diskmgmt_disksmart' }) }
  else if (ssd.includes('Bad') || ssd.includes('Unknown')) { hw -= 22; recommendations.push({ severity: 'critical', text: 'SSD-Zustand kritisch!', skillId: 'rd_diskmgmt_disksmart' }) }

  const ramErr = Number(raw.ramErrors ?? 0)
  details.ramErrors = `${ramErr} Fehler`
  if (ramErr > 5) { hw -= 10; recommendations.push({ severity: 'critical', text: `${ramErr} RAM-Fehler erkannt` }) }
  else if (ramErr > 0) hw -= 3

  // Security
  const defActive = raw.defenderActive !== false
  details.defenderActive = defActive ? '✅ Aktiv' : '❌ Aus'
  if (!defActive) { sec -= 10; recommendations.push({ severity: 'critical', text: 'Defender ist deaktiviert!', skillId: 'rd_sysconfig_defquick' }) }

  const bl = raw.bitlocker === 'On' || raw.bitlocker === true
  details.bitlocker = bl ? '✅ An' : '❌ Aus'
  if (!bl) { sec -= 5; recommendations.push({ severity: 'warning', text: 'BitLocker ist nicht aktiv', skillId: 'rd_security_bitlocker' }) }

  const fw = raw.firewallProfiles ?? 3
  details.firewall = `${fw}/3 aktiv`
  if (Number(fw) < 3) sec -= 3

  const updates = Number(raw.pendingUpdates ?? 0)
  details.pendingUpdates = `${updates} ausstehend`
  if (updates > 10) { sec -= 8; recommendations.push({ severity: 'critical', text: `${updates} Updates ausstehend!`, skillId: 'rd_gpo_usoinst' }) }
  else if (updates > 5) { sec -= 4; recommendations.push({ severity: 'warning', text: `${updates} Updates ausstehend` }) }
  else if (updates > 0) sec -= 1

  const admins = Number(raw.localAdmins ?? 2)
  details.localAdmins = `${admins} Admins`
  if (admins > 4) { sec -= 3; recommendations.push({ severity: 'warning', text: `${admins} lokale Admins (zu viele)` }) }

  // Performance
  const diskPct = Number(raw.diskFreePct ?? 50)
  details.diskFree = `${diskPct}% frei`
  if (diskPct < 10) { perf -= 8; recommendations.push({ severity: 'critical', text: `Nur ${diskPct}% Speicher frei!`, skillId: 'rd_disk_wintemp' }) }
  else if (diskPct < 20) { perf -= 4; recommendations.push({ severity: 'warning', text: `Speicher knapp (${diskPct}% frei)`, skillId: 'rd_disk_wintemp' }) }

  const ramUsage = Number(raw.ramUsagePct ?? 50)
  details.ramUsage = `${ramUsage}% genutzt`
  if (ramUsage > 90) perf -= 5
  else if (ramUsage > 70) perf -= 2

  const uptime = Number(raw.uptimeDays ?? 0)
  details.uptime = `${uptime} Tage`
  if (uptime > 90) { perf -= 4; recommendations.push({ severity: 'warning', text: `${uptime} Tage Uptime — Neustart empfohlen` }) }
  else if (uptime > 30) perf -= 2

  const errors = Number(raw.weeklyErrors ?? 0)
  details.weeklyErrors = `${errors}/Woche`
  if (errors > 20) { perf -= 4; recommendations.push({ severity: 'warning', text: `${errors} Fehler-Events/Woche` }) }
  else if (errors > 5) perf -= 2

  const autostart = Number(raw.autostartCount ?? 5)
  details.autostartCount = `${autostart} Programme`
  if (autostart > 20) { perf -= 4; recommendations.push({ severity: 'warning', text: `${autostart} Autostart-Programme`, skillId: 'rd_procs_autostart' }) }

  // Prediction
  if (ssd.includes('Warning')) { pred -= 10; details.ssdLifeRemaining = '~45 Tage' }
  if (diskPct < 15) { pred -= 5; details.diskFullIn = `~${Math.round(diskPct * 3)} Tage` }
  details.deviceAge = raw.deviceAge ? `${raw.deviceAge} Jahre` : 'Unbekannt'

  hw = Math.max(0, hw); sec = Math.max(0, sec); perf = Math.max(0, perf); pred = Math.max(0, pred)

  return {
    online: true,
    total: hw + sec + perf + pred,
    hardware: hw, security: sec, performance: perf, prediction: pred,
    details, recommendations,
  }
}

// ── Pattern detection ─────────────────────────────────────────────────────────
function detectPatterns(scores: HealthScore[]): Pattern[] {
  const patterns: Pattern[] = []
  const online = scores.filter(s => s.online)
  const now = new Date().toISOString()

  // Pattern: Many offline PCs (network issue)
  const offline = scores.filter(s => !s.online)
  if (offline.length >= 3) {
    patterns.push({
      id: 'offline-cluster', severity: 'critical', icon: '🌐',
      title: `Netzwerk-Problem: ${offline.length} PCs nicht erreichbar`,
      description: `${offline.length} PCs sind offline — möglicher Switch/VLAN-Ausfall`,
      affectedCount: offline.length, affectedHosts: offline.map(s => s.hostname),
      recommendation: 'Netzwerk-Infrastruktur prüfen (Switch, VLAN, Verkabelung)',
      detectedAt: now,
    })
  }

  // Pattern: Many PCs with critical security
  const secCritical = online.filter(s => s.security < 15)
  if (secCritical.length >= 3) {
    patterns.push({
      id: 'security-gap', severity: 'critical', icon: '🛡️',
      title: `Sicherheitslücke: ${secCritical.length} PCs ungeschützt`,
      description: `${secCritical.length} PCs haben einen Sicherheits-Score unter 15/30`,
      affectedCount: secCritical.length, affectedHosts: secCritical.map(s => s.hostname),
      recommendation: 'Defender aktivieren, Updates installieren, BitLocker prüfen',
      detectedAt: now,
    })
  }

  // Pattern: Many pending updates
  const manyUpdates = online.filter(s => Number(s.details.pendingUpdates?.replace(/\D/g, '') ?? 0) > 10)
  if (manyUpdates.length >= 5) {
    patterns.push({
      id: 'update-backlog', severity: 'warning', icon: '📦',
      title: `Update-Rückstand: ${manyUpdates.length} PCs mit >10 Updates`,
      description: 'Möglicherweise WSUS-Problem oder Update-Policy blockiert',
      affectedCount: manyUpdates.length, affectedHosts: manyUpdates.map(s => s.hostname),
      recommendation: 'WSUS-Server und Update-Policies prüfen',
      detectedAt: now,
    })
  }

  // Pattern: Disk space critical
  const diskLow = online.filter(s => Number(s.details.diskFree?.replace(/\D/g, '') ?? 50) < 10)
  if (diskLow.length >= 3) {
    patterns.push({
      id: 'disk-wave', severity: 'warning', icon: '💾',
      title: `Speicher-Engpass: ${diskLow.length} PCs fast voll`,
      description: `${diskLow.length} PCs haben weniger als 10% freien Speicher`,
      affectedCount: diskLow.length, affectedHosts: diskLow.map(s => s.hostname),
      recommendation: 'Disk-Cleanup auf betroffenen PCs durchführen',
      detectedAt: now,
    })
  }

  // Pattern: High uptime
  const longUptime = online.filter(s => Number(s.details.uptime?.replace(/\D/g, '') ?? 0) > 60)
  if (longUptime.length >= 5) {
    patterns.push({
      id: 'uptime-wave', severity: 'warning', icon: '⏰',
      title: `Neustart-Welle nötig: ${longUptime.length} PCs >60 Tage Uptime`,
      description: 'Lange Uptime kann zu Performance-Problemen und fehlenden Updates führen',
      affectedCount: longUptime.length, affectedHosts: longUptime.map(s => s.hostname),
      recommendation: 'Geplanten Neustart-Zyklus einrichten',
      detectedAt: now,
    })
  }

  // Pattern: Overall fleet health
  const avgScore = online.length > 0 ? Math.round(online.reduce((s, h) => s + h.total, 0) / online.length) : 0
  const greenPct = online.length > 0 ? Math.round(online.filter(s => s.total >= 70).length / online.length * 100) : 0
  if (greenPct >= 90) {
    patterns.push({
      id: 'fleet-healthy', severity: 'info', icon: '✅',
      title: `Fleet-Gesundheit: ${greenPct}% der PCs sind gesund`,
      description: `Durchschnittlicher Score: ${avgScore}/100`,
      affectedCount: online.length, affectedHosts: [],
      recommendation: 'Weiter so! Regelmäßige Scans beibehalten.',
      detectedAt: now,
    })
  }

  return patterns
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NetworkRadar() {
  const user = useAuthStore(s => s.session?.user)
  const setScreen = useAppStore(s => s.setScreen)
  const setDevices = useAppStore(s => s.setDevices)

  const [tab, setTab] = useState<Tab>('health')
  // Global store — survives page navigation
  const scanning = useRadarStore(s => s.scanning)
  const scanProgress = useRadarStore(s => ({ done: s.progress, total: s.total }))
  const scores = useRadarStore(s => s.scores) as HealthScore[]
  const patterns = useRadarStore(s => s.patterns) as Pattern[]
  const radarActions = useRadarStore(s => ({
    startScan: s.startScan, updateProgress: s.updateProgress,
    finishScan: s.finishScan, failScan: s.failScan, stopScan: s.stopScan, loadCached: s.loadCached,
  }))

  const [sortKey, setSortKey] = useState<SortKey>('score-asc')
  const [filterKey, setFilterKey] = useState<FilterKey>('all')
  const [detailHost, setDetailHost] = useState<HealthScore | null>(null)

  // Load inventory
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  useEffect(() => {
    api().netReadJson<InventoryItem[]>('inventory/inventory.json').then(d => {
      if (d) setInventory(d)
    })
  }, [])

  // Load cached scores (only if store is empty — don't overwrite running scan)
  useEffect(() => {
    if (scores.length === 0 && !scanning) {
      api().netReadJson<{ scores: HealthScore[]; patterns?: Pattern[] }>('health_scores/fleet_summary.json').then(d => {
        if (d?.scores) {
          radarActions.loadCached(d.scores as RadarHealthScore[], (d.patterns ?? detectPatterns(d.scores)) as RadarPattern[])
        }
      })
    }
  }, []) // eslint-disable-line

  // ── Scan all PCs ────────────────────────────────────────────────────────────
  // startScan uses the global store — scan survives page navigations
  async function startScan() {
    if (scanning) return
    const hosts = inventory.filter(i => i.category === 'Computer' || i.category === 'Server')
    if (hosts.length === 0) return

    radarActions.startScan(hosts.length)
    const results: HealthScore[] = []

    const BATCH = 10
    for (let i = 0; i < hosts.length; i += BATCH) {
      if (getAbortFlag()) break
      const batch = hosts.slice(i, i + BATCH)
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          const host = item.name
          try {
            const pingRes = await api().runPowerShell(`Test-Connection -ComputerName '${host}' -Count 1 -Quiet`, 3000)
            const online = pingRes.stdout?.trim() === 'True'
            if (!online) {
              return { hostname: host, label: item.description, online: false, total: 0, hardware: 0, security: 0, performance: 0, prediction: 0, details: {}, recommendations: [], timestamp: new Date().toISOString() } as HealthScore
            }
            const script = `
$r = @{}
try { $pd = Get-PhysicalDisk | Select -First 1; $r.ssdHealth = $pd.HealthStatus } catch { $r.ssdHealth = 'Unknown' }
try { $r.ramErrors = (Get-WinEvent -FilterHashtable @{LogName='System';Id=201} -MaxEvents 10 -EA SilentlyContinue).Count } catch { $r.ramErrors = 0 }
try { $def = Get-MpComputerStatus -EA SilentlyContinue; $r.defenderActive = $def.RealTimeProtectionEnabled } catch { $r.defenderActive = $true }
try { $bl = Get-BitLockerVolume -MountPoint C: -EA SilentlyContinue; $r.bitlocker = if($bl.ProtectionStatus -eq 'On'){'On'}else{'Off'} } catch { $r.bitlocker = 'Unknown' }
try { $r.firewallProfiles = (Get-NetFirewallProfile | Where Enabled -eq $true).Count } catch { $r.firewallProfiles = 3 }
try { $r.localAdmins = (Get-LocalGroupMember Administrators -EA SilentlyContinue).Count } catch { $r.localAdmins = 2 }
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -EA SilentlyContinue
if($disk){ $r.diskFreePct = [math]::Round($disk.FreeSpace/$disk.Size*100) } else { $r.diskFreePct = 50 }
$os = Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
if($os){ $r.ramUsagePct = [math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/$os.TotalVisibleMemorySize*100); $r.uptimeDays = [math]::Round(((Get-Date)-$os.LastBootUpTime).TotalDays) } else { $r.ramUsagePct=50; $r.uptimeDays=0 }
try { $r.weeklyErrors = (Get-WinEvent -FilterHashtable @{LogName='System';Level=2;StartTime=(Get-Date).AddDays(-7)} -MaxEvents 100 -EA SilentlyContinue).Count } catch { $r.weeklyErrors = 0 }
try { $r.autostartCount = (Get-CimInstance Win32_StartupCommand -EA SilentlyContinue).Count } catch { $r.autostartCount = 5 }
try { $r.pendingUpdates = 0 } catch {}
$r | ConvertTo-Json -Compress`
            const res = await api().runPowerShell(`Invoke-Command -ComputerName '${host}' -ScriptBlock { ${script} } -EA Stop`, 30000)
            const raw = JSON.parse(res.stdout?.trim() || '{}')
            const calc = calculateScore(raw)
            return { hostname: host, label: item.description, ...calc, timestamp: new Date().toISOString() } as HealthScore
          } catch {
            return { hostname: host, label: item.description, online: false, total: 0, hardware: 0, security: 0, performance: 0, prediction: 0, details: {}, recommendations: [], timestamp: new Date().toISOString() } as HealthScore
          }
        })
      )

      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value)
      }
      // Update global store — visible even if component is unmounted
      radarActions.updateProgress(results.length, [...results] as RadarHealthScore[])
    }

    if (getAbortFlag()) return

    const detected = detectPatterns(results)
    radarActions.finishScan([...results] as RadarHealthScore[], detected as RadarPattern[])

    await api().netWriteJson('health_scores/fleet_summary.json', {
      scanDate: new Date().toISOString(),
      scannedBy: user?.username,
      scores: results,
      patterns: detected,
    })
  }

  function goToRemoteDoc(hostname: string) {
    setDevices([{ id: 'radar-0', type: 'hostname' as const, value: hostname, resolvedHostnames: [hostname] }])
    setScreen('remote-doc')
  }

  // ── Filtered & sorted scores ────────────────────────────────────────────────
  const filtered = scores.filter(s => {
    if (filterKey === 'all') return true
    if (filterKey === 'offline') return !s.online
    if (filterKey === 'green') return s.online && s.total >= 70
    if (filterKey === 'yellow') return s.online && s.total >= 40 && s.total < 70
    if (filterKey === 'red') return s.online && s.total < 40
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'score-asc') return a.total - b.total
    if (sortKey === 'score-desc') return b.total - a.total
    if (sortKey === 'name') return a.hostname.localeCompare(b.hostname)
    return 0
  })

  const onlineCount = scores.filter(s => s.online).length
  const greenCount = scores.filter(s => s.online && s.total >= 70).length
  const yellowCount = scores.filter(s => s.online && s.total >= 40 && s.total < 70).length
  const redCount = scores.filter(s => s.online && s.total < 40).length
  const offlineCount = scores.filter(s => !s.online).length
  const fleetScore = onlineCount > 0 ? Math.round(scores.filter(s => s.online).reduce((a, s) => a + s.total, 0) / onlineCount) : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <Activity size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Netzwerk-Radar</h1>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setTab('health')}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${tab === 'health' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:bg-accent'}`}>
            Health Score
          </button>
          <button onClick={() => setTab('patterns')}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${tab === 'patterns' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:bg-accent'}`}>
            Muster-Erkennung
            {patterns.filter(p => p.severity === 'critical').length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[8px] rounded-full px-1">
                {patterns.filter(p => p.severity === 'critical').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Scan progress bar */}
      {scanning && (
        <div className="shrink-0 px-6 py-2 bg-blue-500/5 border-b border-blue-500/20">
          <div className="flex items-center gap-2 text-xs text-blue-400">
            <Loader size={12} className="animate-spin" />
            Scan läuft: {scanProgress.done}/{scanProgress.total} PCs
            <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
              <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${scanProgress.total > 0 ? (scanProgress.done / scanProgress.total) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'health' && (
          <div className="p-6 space-y-4">
            {/* Fleet summary */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <span className={`text-3xl font-bold ${scoreColor(fleetScore)}`}>{fleetScore}</span>
                <div>
                  <p className="text-xs text-muted-foreground">Fleet-Score</p>
                  <div className="h-2 w-24 rounded-full bg-muted/30 overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBg(fleetScore)}`} style={{ width: `${fleetScore}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => setFilterKey('green')} className="flex items-center gap-1 text-emerald-400 hover:underline">🟢 {greenCount}</button>
                <button onClick={() => setFilterKey('yellow')} className="flex items-center gap-1 text-amber-400 hover:underline">🟡 {yellowCount}</button>
                <button onClick={() => setFilterKey('red')} className="flex items-center gap-1 text-red-400 hover:underline">🔴 {redCount}</button>
                <button onClick={() => setFilterKey('offline')} className="flex items-center gap-1 text-muted-foreground hover:underline">⚫ {offlineCount}</button>
                <button onClick={() => setFilterKey('all')} className="text-muted-foreground hover:underline text-[10px]">Alle</button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                  className="px-2 py-1 text-[10px] rounded border border-border bg-background text-foreground">
                  <option value="score-asc">Score ↑ (schlechteste zuerst)</option>
                  <option value="score-desc">Score ↓ (beste zuerst)</option>
                  <option value="name">Name A-Z</option>
                </select>
                <button onClick={startScan} disabled={scanning}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {scanning ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Jetzt scannen
                </button>
              </div>
            </div>

            {/* PC list */}
            {sorted.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                {sorted.map(hs => (
                  <PCRow key={hs.hostname} hs={hs}
                    onDetail={() => setDetailHost(hs)}
                    onRemoteDoc={() => goToRemoteDoc(hs.hostname)} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Activity size={40} className="mx-auto opacity-20 mb-3" />
                <p className="text-sm">Noch kein Scan durchgeführt</p>
                <p className="text-xs opacity-60 mt-1">Klicken Sie "Jetzt scannen" um die PCs aus der Standort-Übersicht zu prüfen</p>
              </div>
            )}
          </div>
        )}

        {tab === 'patterns' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground flex-1">
                {patterns.length} Muster erkannt
              </p>
              <button onClick={startScan} disabled={scanning}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                <RefreshCw size={12} /> Jetzt analysieren
              </button>
            </div>

            {/* Critical patterns */}
            {patterns.filter(p => p.severity === 'critical').length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Kritisch</p>
                {patterns.filter(p => p.severity === 'critical').map(p => <PatternCard key={p.id} pattern={p} />)}
              </div>
            )}

            {/* Warning patterns */}
            {patterns.filter(p => p.severity === 'warning').length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Warnung</p>
                {patterns.filter(p => p.severity === 'warning').map(p => <PatternCard key={p.id} pattern={p} />)}
              </div>
            )}

            {/* Info patterns */}
            {patterns.filter(p => p.severity === 'info').length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Info</p>
                {patterns.filter(p => p.severity === 'info').map(p => <PatternCard key={p.id} pattern={p} />)}
              </div>
            )}

            {patterns.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle size={40} className="mx-auto opacity-20 mb-3" />
                <p className="text-sm">Keine Muster erkannt</p>
                <p className="text-xs opacity-60 mt-1">Führen Sie einen Scan durch um das Netzwerk zu analysieren</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailHost && (
        <DetailModal
          hs={detailHost}
          onClose={() => setDetailHost(null)}
          onRunSkill={(hostname, skillId) => {
            setDevices([{ id: 'radar-0', type: 'hostname' as const, value: hostname, resolvedHostnames: [hostname] }])
            setScreen('remote-doc')
          }}
        />
      )}
    </div>
  )
}
