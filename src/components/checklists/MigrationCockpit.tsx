// ── Migrations-Cockpit (pro Checklisten-Zeile) ────────────────────────────────
// Öffnet sich über „Klicke mich" neben dem NEUEN Gerät (nur bei erreichbarem PC).
// Kacheln: Treiber, Drucker, Explorer-Schnellzugriffe, Windows-Updates, SolidWorks
// (nur wenn Altgerät SolidWorks hatte), Sprache, Netzlaufwerke/WLAN, System-/
// Umgebungsvariablen, Neustart+Report. Alles läuft im Hintergrund (Stores außerhalb
// React) → Kachel wechseln / Modal schließen bricht nichts ab. Mehrere Kacheln
// auswählbar und gesammelt ausführbar. Drucker & Schnellzugriffe zusätzlich als
// .bat auf den Public Desktop.
import { useEffect, useState, type ReactNode } from 'react'
import {
  X, Wand2, Cpu, Printer, FolderOpen, Globe, HardDrive, TerminalSquare, Power, FileText,
  Boxes, Loader2, CheckCircle2, XCircle, ArrowLeft, RefreshCw, Play, Link2, Star, Download, Info,
} from 'lucide-react'
import type { Checklist } from '../../services/checklists'
import type { Screen } from '../../types'
import { hostFromSerial, type ChecklistDeviceInfo } from '../../services/deviceMasterData'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { scanOneHost, type HpHostReport, type DriverItem } from '../../services/hpDrivers'
import { useHpDeployStore } from '../../store/hpDeployStore'
import { useSwInstallStore } from '../../store/swInstallStore'
import { useMigrationJobs } from '../../store/migrationJobsStore'
import {
  applyPrintersLive, deployPrinterScript,
  applyQuickAccessLive, deployQuickAccessScript, deleteQuickAccessBundle,
  type MigrationPrinter,
} from '../../services/refreshMigration'
import { connectPrinterViaSeal, setDefaultPrinterLocal } from '../../services/printerConnections'
import {
  getLanguage, setGermanLanguage, deployLanguageScript, getEnvVars, transferEnvVars,
  getNetworkDrives, mapNetworkDrives, deployDrivesScript, transferWlan,
  searchWindowsUpdates, installWindowsUpdates, rebootHost,
  type LangInfo, type EnvVar, type NetDrive, type WinUpdate,
} from '../../services/migrationOps'
import { useAppStore } from '../../store/appStore'
import { useCurrentUser } from '../../store/authStore'

type TileId = 'drivers' | 'printers' | 'quickaccess' | 'winupdate' | 'solidworks' | 'language' | 'drives' | 'env' | 'reboot'

interface CockpitCtx {
  newHost: string; oldHost: string; corpId: string; isRefresh: boolean; by: string
  checklistId: string; printers: MigrationPrinter[]; quickAccessReady: boolean; online: boolean
  onQuickAccessApplied?: () => void
}

export default function MigrationCockpit({ checklist, info, onClose, printers = [], quickAccessReady = false, online = false, onQuickAccessApplied }: {
  checklist: Checklist; info?: ChecklistDeviceInfo; onClose: () => void
  printers?: MigrationPrinter[]; quickAccessReady?: boolean; online?: boolean; onQuickAccessApplied?: () => void
}) {
  const by = useCurrentUser()?.username || 'cockpit'
  const newHost = (info?.newHostname || hostFromSerial((checklist.newDeviceSerial || '').trim()) || '').trim()
  const isRefresh = checklist.deviceType === 'refresh' && !!(checklist.oldDeviceId || '').trim()
  const oldHost = isRefresh ? (info?.oldHostname || hostFromSerial((checklist.oldDeviceId || '').trim()) || '').trim() : ''
  const corpId = (checklist.corpId || '').trim()
  const hasSolidWorks = !!info?.software?.includes('SolidWorks')
  const ctx: CockpitCtx = { newHost, oldHost, corpId, isRefresh, by, checklistId: checklist.id, printers, quickAccessReady, online, onQuickAccessApplied }

  const [open, setOpen] = useState<TileId | null>(null)
  const [selected, setSelected] = useState<Set<TileId>>(new Set())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (open) setOpen(null); else onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // applicable = für diesen Gerätetyp sinnvoll (sonst ausgeblendet); enabled = jetzt klickbar.
  // Drucker/Schnellzugriffe: erst wenn Daten da. Alle übrigen: nur wenn Gerät online.
  const offReason = online ? undefined : 'Gerät offline — Kachel erst bei erreichbarem Gerät'
  const tiles: { id: TileId; label: string; icon: ReactNode; desc: string; applicable: boolean; enabled: boolean; reason?: string; batch: boolean }[] = [
    { id: 'drivers', label: 'Treiber-Installation', icon: <Cpu size={18} />, desc: 'HP-Treiber suchen & installieren (ohne BIOS).', applicable: true, enabled: online, reason: offReason, batch: true },
    { id: 'printers', label: 'Drucker einrichten', icon: <Printer size={18} />, desc: 'Drucker + Standard vom Altgerät übernehmen.', applicable: isRefresh, enabled: printers.length > 0, reason: printers.length > 0 ? undefined : 'Drucker werden noch vom Altgerät ermittelt', batch: true },
    { id: 'quickaccess', label: 'Explorer-Schnellzugriffe', icon: <FolderOpen size={18} />, desc: 'Schnellzugriffe vom Altgerät übertragen.', applicable: isRefresh, enabled: quickAccessReady, reason: quickAccessReady ? undefined : 'Schnellzugriff-Datei wird noch gesichert', batch: true },
    { id: 'winupdate', label: 'Windows-Updates', icon: <RefreshCw size={18} />, desc: 'Verfügbare Updates suchen & installieren.', applicable: true, enabled: online, reason: offReason, batch: true },
    { id: 'solidworks', label: 'SolidWorks', icon: <Boxes size={18} />, desc: 'War auf dem Altgerät installiert.', applicable: hasSolidWorks, enabled: online, reason: offReason, batch: false },
    { id: 'language', label: 'Sprache', icon: <Globe size={18} />, desc: 'Anzeigen / komplett auf Deutsch setzen.', applicable: true, enabled: online, reason: offReason, batch: true },
    { id: 'drives', label: 'Netzlaufwerke / WLAN', icon: <HardDrive size={18} />, desc: 'Netzlaufwerke & WLAN vom Altgerät.', applicable: isRefresh, enabled: online, reason: offReason, batch: true },
    { id: 'env', label: 'System-/Umgebungsvariablen', icon: <TerminalSquare size={18} />, desc: 'Anzeigen / vom Altgerät übernehmen.', applicable: true, enabled: online, reason: offReason, batch: isRefresh },
    { id: 'reboot', label: 'Neustart + Report', icon: <Power size={18} />, desc: 'Report ansehen, Gerät neu starten.', applicable: true, enabled: online, reason: offReason, batch: false },
  ]
  const shownTiles = tiles.filter(t => t.applicable)

  function toggleSel(id: TileId) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function runBatch(ids: TileId[]) {
    for (const id of ids) {
      const t = tiles.find(x => x.id === id)
      if (!t || !t.applicable || !t.enabled || !t.batch) continue
      await runTileBatch(id, ctx)
    }
  }

  const selectableBatch = shownTiles.filter(t => t.batch && t.enabled)

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Kopf */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/10">
          <Wand2 size={18} className="text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground truncate">Migrations-Cockpit — {checklist.name || '—'}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              Neu: <span className="font-mono text-foreground">{newHost || '—'}</span>{newHost && <DeviceInfoButton hostname={newHost} serial={info?.newSerial} />}
              {isRefresh && <> · Alt: <span className="font-mono text-foreground">{oldHost || '—'}</span>{oldHost && <DeviceInfoButton hostname={oldHost} serial={info?.oldSerial} />}</>}
              {corpId && <> · <span className="font-mono">{corpId}</span></>}
            </div>
          </div>
          {open && (
            <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/20 text-muted-foreground">
              <ArrowLeft size={13} />Kacheln
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent/30 text-muted-foreground"><X size={18} /></button>
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto p-4">
          {!open ? (
            <>
              {/* Sammel-Ausführen */}
              <div className="flex items-center gap-2 flex-wrap mb-3 pb-3 border-b border-border">
                <span className="text-[11px] text-muted-foreground">Mehrere Kacheln auswählen und zusammen ausführen:</span>
                <button onClick={() => setSelected(new Set(selectableBatch.map(t => t.id)))}
                  className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent/20 text-muted-foreground">Alle auswählen</button>
                <button onClick={() => setSelected(new Set())}
                  className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent/20 text-muted-foreground">Auswahl leeren</button>
                <button disabled={selected.size === 0} onClick={() => void runBatch([...selected])}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                  <Play size={13} />Ausgewählte ausführen ({selected.size})
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {shownTiles.map(t => (
                  <div key={t.id} title={t.enabled ? undefined : t.reason}
                    className={`relative rounded-lg border border-border bg-card p-3 transition-colors ${t.enabled ? 'hover:border-primary/40 hover:bg-accent/20' : 'opacity-50'}`}>
                    {t.batch && t.enabled && (
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} onClick={e => e.stopPropagation()}
                        title="Für Sammel-Ausführung auswählen"
                        className="absolute top-2 right-2 w-4 h-4 accent-primary" />
                    )}
                    <button type="button" disabled={!t.enabled} onClick={() => setOpen(t.id)} className="w-full text-left disabled:cursor-not-allowed">
                      <div className="flex items-center gap-2 text-primary"><span className="shrink-0">{t.icon}</span>
                        <span className="text-sm font-semibold text-foreground">{t.label}</span></div>
                      <p className="text-[11px] text-muted-foreground mt-1 pr-5">{t.desc}</p>
                      <div className="mt-1.5">{t.enabled ? <TileStatus id={t.id} ctx={ctx} /> : <span className="text-[10px] text-amber-500">{t.reason}</span>}</div>
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <TilePanel id={open} ctx={ctx} checklist={checklist} info={info} onNavigate={(s) => { useAppStore.getState().setScreen(s); onClose() }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Status-Badge je Kachel (aus den Hintergrund-Stores) ───────────────────────
function jobKey(host: string, id: string) { return `${host.toLowerCase()}:${id}` }

function TileStatus({ id, ctx }: { id: TileId; ctx: CockpitCtx }) {
  const hpActive = useHpDeployStore(s => s.activeHosts)
  const hpResults = useHpDeployStore(s => s.results)
  const swPhase = useSwInstallStore(s => s.phase)
  const swHost = useSwInstallStore(s => s.hostname)
  const jobs = useMigrationJobs(s => s.jobs)
  const hostLc = ctx.newHost.toLowerCase()

  if (id === 'drivers') {
    if (hpActive.includes(hostLc)) return <Badge kind="run" text="läuft…" />
    const r = hpResults[hostLc]
    if (r) return <Badge kind={r.status === 'fehler' ? 'err' : 'ok'} text={r.status} />
    return null
  }
  if (id === 'solidworks') {
    if (swHost && swHost.toLowerCase() === hostLc && (swPhase === 'running')) return <Badge kind="run" text="läuft…" />
    if (swHost && swHost.toLowerCase() === hostLc && swPhase === 'done') return <Badge kind="ok" text="fertig" />
    return null
  }
  const j = jobs[jobKey(ctx.newHost, id)]
  if (!j) return null
  return <Badge kind={j.status === 'running' ? 'run' : j.status === 'done' ? 'ok' : 'err'} text={j.status === 'running' ? 'läuft…' : j.status === 'done' ? 'fertig' : 'Fehler'} />
}

function Badge({ kind, text }: { kind: 'run' | 'ok' | 'err'; text: string }) {
  const cls = kind === 'run' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : kind === 'ok' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-300 border-red-500/30'
  return <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${cls}`}>
    {kind === 'run' ? <Loader2 size={10} className="animate-spin" /> : kind === 'ok' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}{text}
  </span>
}

// ── Sammel-Ausführung je Kachel (Standard-Aktion) ─────────────────────────────
async function runTileBatch(id: TileId, ctx: CockpitCtx): Promise<void> {
  const jobs = useMigrationJobs.getState()
  const key = jobKey(ctx.newHost, id)
  if (id === 'drivers') {
    const rep = await scanOneHost(ctx.newHost).catch(() => null)
    if (!rep) return
    const items = rep.items.filter(i => i.klasse !== 'bios' && i.anwendbar && !i.ohneHardwareBezug && (i.status === 'veraltet' || i.status === 'verfuegbar'))
    if (items.length) await useHpDeployStore.getState().run([{ host: ctx.newHost, items }], { rebootMode: 'notify', by: ctx.by })
    return
  }
  if (id === 'printers') {
    await jobs.run(key, () => applyPrintersLive(ctx.newHost, ctx.printers))   // vorab gezogene Drucker
    return
  }
  if (id === 'quickaccess') {
    // QA-Datei ist bereits gesichert (Auto-Pull) → nur übertragen, dann Netz-Bundle löschen.
    await jobs.run(key, async () => { const r = await applyQuickAccessLive(ctx.newHost, ctx.checklistId); if (r.ok) { await deleteQuickAccessBundle(ctx.checklistId); ctx.onQuickAccessApplied?.() } return r })
    return
  }
  if (id === 'winupdate') { await jobs.run(key, () => installWindowsUpdates(ctx.newHost)); return }
  if (id === 'language') { await jobs.run(key, () => setGermanLanguage(ctx.newHost)); return }
  if (id === 'drives') { await jobs.run(key, async () => { const d = await getNetworkDrives(ctx.oldHost); if (!d.ok) return { ok: false, text: d.text }; const m = await mapNetworkDrives(ctx.newHost, d.drives || []); await transferWlan(ctx.oldHost, ctx.newHost); return m }); return }
  if (id === 'env') { await jobs.run(key, () => transferEnvVars(ctx.oldHost, ctx.newHost, ctx.corpId)); return }
}

// ── Panels ─────────────────────────────────────────────────────────────────────
function TilePanel({ id, ctx, checklist, info, onNavigate }: { id: TileId; ctx: CockpitCtx; checklist: Checklist; info?: ChecklistDeviceInfo; onNavigate: (s: Screen) => void }) {
  switch (id) {
    case 'drivers': return <DriversPanel ctx={ctx} />
    case 'printers': return <PrintersPanel ctx={ctx} />
    case 'quickaccess': return <QuickAccessPanel ctx={ctx} />
    case 'winupdate': return <WinUpdatePanel ctx={ctx} />
    case 'solidworks': return <SolidWorksPanel ctx={ctx} onNavigate={onNavigate} />
    case 'language': return <LanguagePanel ctx={ctx} />
    case 'drives': return <DrivesPanel ctx={ctx} />
    case 'env': return <EnvPanel ctx={ctx} />
    case 'reboot': return <RebootReportPanel ctx={ctx} checklist={checklist} info={info} />
  }
}

function PanelHead({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return <div className="mb-3"><div className="flex items-center gap-2 text-primary">{icon}<h3 className="text-sm font-semibold text-foreground">{title}</h3></div>{sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}</div>
}
function JobResult({ ctx, id }: { ctx: CockpitCtx; id: string }) {
  const j = useMigrationJobs(s => s.jobs)[jobKey(ctx.newHost, id)]
  if (!j) return null
  if (j.status === 'running') return <p className="text-[11px] text-blue-300 inline-flex items-center gap-1 mt-2"><Loader2 size={11} className="animate-spin" />läuft im Hintergrund…</p>
  return <p className={`text-[11px] mt-2 inline-flex items-start gap-1 ${j.status === 'done' ? 'text-green-400' : 'text-red-300'}`}>{j.status === 'done' ? <CheckCircle2 size={11} className="mt-px" /> : <XCircle size={11} className="mt-px" />}<span>{j.text || (j.status === 'done' ? 'fertig' : 'Fehler')}</span></p>
}
const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40'
const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent/20 disabled:opacity-40'

// ── Treiber ──────────────────────────────────────────────────────────────────
function DriversPanel({ ctx }: { ctx: CockpitCtx }) {
  const [rep, setRep] = useState<HpHostReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const hpRun = useHpDeployStore(s => s.run)
  const phaseByHost = useHpDeployStore(s => s.phaseByHost)
  const results = useHpDeployStore(s => s.results)
  const hostLc = ctx.newHost.toLowerCase()

  async function scan() {
    setLoading(true)
    try {
      const r = await scanOneHost(ctx.newHost)
      setRep(r)
      const pre = new Set(r.items.filter(i => i.klasse === 'normal' && i.anwendbar && !i.ohneHardwareBezug && !i.matchUnsicher && i.status === 'veraltet').map(i => i.softpaqId))
      setSel(pre)
    } catch { setRep(null) } finally { setLoading(false) }
  }
  useEffect(() => { void scan() /* eslint-disable-next-line */ }, [])

  const items = (rep?.items || []).filter(i => i.klasse !== 'bios')   // BIOS nie
  function toggle(id: string) { setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  async function install() {
    const chosen = items.filter(i => sel.has(i.softpaqId))
    if (chosen.length) await hpRun([{ host: ctx.newHost, items: chosen as DriverItem[] }], { rebootMode: 'notify', by: ctx.by })
  }
  const phase = phaseByHost[hostLc]
  const res = results[hostLc]

  return (
    <div>
      <PanelHead icon={<Cpu size={16} />} title="Treiber-Installation" sub={`HP-Treiber für ${ctx.newHost} — BIOS ist ausgeschlossen.`} />
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => void scan()} disabled={loading} className={btnGhost}>{loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Neu scannen</button>
        <button onClick={() => void install()} disabled={sel.size === 0} className={btnPrimary}><Download size={13} />{sel.size} installieren</button>
        {phase && <span className="text-[11px] text-blue-300 inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" />{phase}</span>}
      </div>
      {res && <p className={`text-[11px] mb-2 ${res.status === 'fehler' ? 'text-red-300' : 'text-green-400'}`}>{res.message}</p>}
      {loading && !rep ? <p className="text-xs text-muted-foreground">Treiber werden gesucht…</p>
        : items.length === 0 ? <p className="text-xs text-muted-foreground">Keine (nicht-BIOS) Treiber gefunden.</p>
        : <div className="max-h-[52vh] overflow-y-auto rounded border border-border divide-y divide-border">
            {items.map(i => (
              <label key={i.softpaqId} className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent/10 cursor-pointer">
                <input type="checkbox" checked={sel.has(i.softpaqId)} onChange={() => toggle(i.softpaqId)} className="accent-primary" />
                <span className="min-w-0 flex-1"><span className="block text-xs text-foreground truncate">{i.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{i.category} · {i.status}{i.latestVersion ? ' · ' + i.latestVersion : ''}</span></span>
              </label>
            ))}
          </div>}
    </div>
  )
}

// ── Drucker ──────────────────────────────────────────────────────────────────
function PrintersPanel({ ctx }: { ctx: CockpitCtx }) {
  const printers = ctx.printers   // vorab automatisch vom Altgerät gezogen
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const runJob = useMigrationJobs(s => s.run)

  async function one(name: string, dflt: boolean) {
    setBusy(name); setMsg(null)
    try {
      const r = await connectPrinterViaSeal(ctx.newHost, name)
      if (r.ok && dflt) await setDefaultPrinterLocal(ctx.newHost, name)
      setMsg(`${name}: ${r.ok ? 'verbunden' + (dflt ? ' (Standard)' : '') : r.text}`)
    } catch (e) { setMsg(`${name}: ${e instanceof Error ? e.message : String(e)}`) } finally { setBusy(null) }
  }

  return (
    <div>
      <PanelHead icon={<Printer size={16} />} title="Drucker einrichten" sub={`Vom Altgerät ${ctx.oldHost} → ${ctx.newHost} (SEAL, im Benutzerkontext).`} />
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button disabled={!printers.length} onClick={() => void runJob(jobKey(ctx.newHost, 'printers'), () => applyPrintersLive(ctx.newHost, printers))} className={btnPrimary}><Link2 size={13} />Alle übertragen</button>
        <button disabled={!printers.length} onClick={() => void runJob(jobKey(ctx.newHost, 'printers') + ':bat', () => deployPrinterScript(ctx.newHost, printers))} className={btnGhost}><Download size={13} />Als .bat auf Public Desktop</button>
      </div>
      <JobResult ctx={ctx} id="printers" />
      {msg && <p className="text-[11px] text-muted-foreground mt-1">{msg}</p>}
      {printers.length === 0 ? <p className="text-xs text-muted-foreground mt-2">Keine Drucker vom Altgerät ermittelt.</p>
        : <div className="max-h-[48vh] overflow-y-auto rounded border border-border divide-y divide-border mt-2">
            {printers.map((p, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Printer size={12} className={p.isDefault ? 'text-amber-500' : 'text-muted-foreground'} />
                <span className="text-xs text-foreground flex-1 truncate">{p.name}</span>
                {p.isDefault && <span className="text-[10px] px-1.5 rounded-full bg-amber-500 text-black inline-flex items-center gap-0.5"><Star size={9} />Standard</span>}
                <button disabled={!!busy} onClick={() => void one(p.name, p.isDefault)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent/20 disabled:opacity-40">
                  {busy === p.name ? <Loader2 size={10} className="animate-spin" /> : 'verbinden'}</button>
              </div>
            ))}
          </div>}
    </div>
  )
}

// ── Schnellzugriffe ──────────────────────────────────────────────────────────
function QuickAccessPanel({ ctx }: { ctx: CockpitCtx }) {
  const runJob = useMigrationJobs(s => s.run)
  const id = ctx.checklistId
  return (
    <div>
      <PanelHead icon={<FolderOpen size={16} />} title="Explorer-Schnellzugriffe" sub={`Bereits vom Altgerät ${ctx.oldHost} gesichert → auf ${ctx.newHost} übertragen.`} />
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => void runJob(jobKey(ctx.newHost, 'quickaccess'), async () => { const r = await applyQuickAccessLive(ctx.newHost, id); if (r.ok) { await deleteQuickAccessBundle(id); ctx.onQuickAccessApplied?.() } return r })} className={btnPrimary}><Link2 size={13} />Übertragen</button>
        <button onClick={() => void runJob(jobKey(ctx.newHost, 'quickaccess') + ':bat', () => deployQuickAccessScript(ctx.newHost, id))} className={btnGhost}><Download size={13} />Als .bat auf Public Desktop</button>
      </div>
      <JobResult ctx={ctx} id="quickaccess" />
      <p className="text-[11px] text-muted-foreground mt-3">Nach dem Übertragen wird die zwischengespeicherte Datei auf dem Netzlaufwerk gelöscht. Explorer wird kurz neu gestartet.</p>
    </div>
  )
}

// ── Windows-Updates ──────────────────────────────────────────────────────────
function WinUpdatePanel({ ctx }: { ctx: CockpitCtx }) {
  const [ups, setUps] = useState<WinUpdate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const runJob = useMigrationJobs(s => s.run)
  async function search() { setLoading(true); setErr(null); const r = await searchWindowsUpdates(ctx.newHost); setLoading(false); if (r.ok) setUps(r.updates || []); else setErr(r.text || 'Fehler') }
  useEffect(() => { void search() /* eslint-disable-next-line */ }, [])
  return (
    <div>
      <PanelHead icon={<RefreshCw size={16} />} title="Windows-Updates" sub={`${ctx.newHost} — ohne automatischen Neustart.`} />
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={() => void search()} disabled={loading} className={btnGhost}>{loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Suchen</button>
        <button disabled={!ups?.length} onClick={() => void runJob(jobKey(ctx.newHost, 'winupdate'), () => installWindowsUpdates(ctx.newHost))} className={btnPrimary}><Download size={13} />Alle installieren</button>
      </div>
      <JobResult ctx={ctx} id="winupdate" />
      {err && <p className="text-[11px] text-red-300 mt-1">{err}</p>}
      {loading && !ups ? <p className="text-xs text-muted-foreground mt-2">Updates werden gesucht…</p>
        : ups && ups.length === 0 ? <p className="text-xs text-green-400 mt-2">Keine ausstehenden Updates.</p>
        : ups && <div className="max-h-[48vh] overflow-y-auto rounded border border-border divide-y divide-border mt-2">
            {ups.map((u, i) => (<div key={i} className="px-2 py-1.5"><span className="block text-xs text-foreground">{u.title}</span>
              <span className="block text-[10px] text-muted-foreground">{u.kb ? 'KB ' + u.kb + ' · ' : ''}{u.size} MB</span></div>))}
          </div>}
    </div>
  )
}

// ── SolidWorks (Launcher) ────────────────────────────────────────────────────
function SolidWorksPanel({ ctx, onNavigate }: { ctx: CockpitCtx; onNavigate: (s: Screen) => void }) {
  return (
    <div>
      <PanelHead icon={<Boxes size={16} />} title="SolidWorks" sub="War auf dem Altgerät installiert." />
      <p className="text-xs text-foreground">Auf dem Altgerät war <strong>SolidWorks</strong> installiert. Die Installation läuft über den dedizierten Menüpunkt (Produktauswahl, Robocopy, geplanter Task — benötigt einen angemeldeten Benutzer).</p>
      <p className="text-xs text-muted-foreground mt-2">Zielgerät: <span className="font-mono text-foreground">{ctx.newHost}</span>{ctx.newHost && <DeviceInfoButton hostname={ctx.newHost} />}</p>
      <button onClick={() => onNavigate('software-installations')} className={`${btnPrimary} mt-3`}><Boxes size={13} />Zur SolidWorks-Installation</button>
    </div>
  )
}

// ── Sprache ──────────────────────────────────────────────────────────────────
function LanguagePanel({ ctx }: { ctx: CockpitCtx }) {
  const [info, setInfo] = useState<LangInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const runJob = useMigrationJobs(s => s.run)
  async function load() { setLoading(true); const r = await getLanguage(ctx.newHost); setLoading(false); if (r.ok && r.info) setInfo(r.info) }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [])
  return (
    <div>
      <PanelHead icon={<Globe size={16} />} title="Sprache" sub={`${ctx.newHost}`} />
      {loading && !info ? <p className="text-xs text-muted-foreground">Sprache wird gelesen…</p>
        : info ? <div className="text-xs text-foreground space-y-0.5 mb-3">
            <div>System-Gebietsschema: <span className="font-mono">{info.systemLocale || '—'}</span></div>
            <div>Kultur: <span className="font-mono">{info.culture || '—'}</span></div>
            <div>UI-Override: <span className="font-mono">{info.uiOverride || '—'}</span></div>
          </div> : <p className="text-xs text-muted-foreground mb-3">Sprache nicht lesbar.</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => void runJob(jobKey(ctx.newHost, 'language'), () => setGermanLanguage(ctx.newHost))} className={btnPrimary}><Globe size={13} />Komplett auf Deutsch (de-DE) setzen</button>
        <button onClick={() => void runJob(jobKey(ctx.newHost, 'language') + ':bat', () => deployLanguageScript(ctx.newHost))} className={btnGhost}><Download size={13} />Als .cmd auf Public Desktop</button>
      </div>
      <JobResult ctx={ctx} id="language" />
      <p className="text-[11px] text-muted-foreground mt-2">Wirkt vollständig nach Neuanmeldung/Neustart. Die .cmd setzt die Benutzer-Sprache zuverlässig; das System-Gebietsschema nur mit Adminrechten.</p>
    </div>
  )
}

// ── Netzlaufwerke / WLAN ─────────────────────────────────────────────────────
function DrivesPanel({ ctx }: { ctx: CockpitCtx }) {
  const [drives, setDrives] = useState<NetDrive[] | null>(null)
  const runJob = useMigrationJobs(s => s.run)
  useEffect(() => { void getNetworkDrives(ctx.oldHost).then(r => setDrives(r.ok ? (r.drives || []) : [])) }, [ctx.oldHost])
  return (
    <div>
      <PanelHead icon={<HardDrive size={16} />} title="Netzlaufwerke / WLAN" sub={`Vom Altgerät ${ctx.oldHost} → ${ctx.newHost}.`} />
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button disabled={!drives?.length} onClick={() => void runJob(jobKey(ctx.newHost, 'drives'), () => mapNetworkDrives(ctx.newHost, drives || []))} className={btnPrimary}><Link2 size={13} />Netzlaufwerke übernehmen</button>
        <button disabled={!drives?.length} onClick={() => void runJob(jobKey(ctx.newHost, 'drives') + ':bat', () => deployDrivesScript(ctx.newHost, drives || []))} className={btnGhost}><Download size={13} />Als .bat auf Public Desktop</button>
        <button onClick={() => void runJob(jobKey(ctx.newHost, 'drives') + ':wlan', () => transferWlan(ctx.oldHost, ctx.newHost))} className={btnGhost}>WLAN-Profile übernehmen</button>
      </div>
      <JobResult ctx={ctx} id="drives" />
      {drives === null ? <p className="text-xs text-muted-foreground mt-2">Netzlaufwerke werden gelesen…</p>
        : drives.length === 0 ? <p className="text-xs text-muted-foreground mt-2">Keine Netzlaufwerke am Altgerät gefunden.</p>
        : <div className="rounded border border-border divide-y divide-border mt-2">
            {drives.map((d, i) => (<div key={i} className="flex items-center gap-2 px-2 py-1.5 text-xs"><span className="font-mono text-foreground w-8">{d.letter}:</span><span className="font-mono text-muted-foreground truncate">{d.unc}</span></div>))}
          </div>}
    </div>
  )
}

// ── System-/Umgebungsvariablen ───────────────────────────────────────────────
function EnvPanel({ ctx }: { ctx: CockpitCtx }) {
  const [vars, setVars] = useState<EnvVar[] | null>(null)
  const [loading, setLoading] = useState(false)
  const runJob = useMigrationJobs(s => s.run)
  async function load() { setLoading(true); const r = await getEnvVars(ctx.newHost); setLoading(false); setVars(r.ok ? (r.vars || []) : []) }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [])
  return (
    <div>
      <PanelHead icon={<TerminalSquare size={16} />} title="System-/Umgebungsvariablen" sub={ctx.isRefresh ? `Anzeigen (${ctx.newHost}) / vom Altgerät ${ctx.oldHost} übernehmen.` : `Anzeigen (${ctx.newHost}).`} />
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={() => void load()} disabled={loading} className={btnGhost}>{loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Aktualisieren</button>
        {ctx.isRefresh && <button onClick={() => void runJob(jobKey(ctx.newHost, 'env'), () => transferEnvVars(ctx.oldHost, ctx.newHost, ctx.corpId))} className={btnPrimary}><Link2 size={13} />Vom Altgerät übernehmen</button>}
      </div>
      <JobResult ctx={ctx} id="env" />
      {loading && !vars ? <p className="text-xs text-muted-foreground mt-2">Variablen werden gelesen…</p>
        : vars && vars.length === 0 ? <p className="text-xs text-muted-foreground mt-2">Keine Variablen gelesen.</p>
        : vars && <div className="max-h-[46vh] overflow-y-auto rounded border border-border divide-y divide-border mt-2">
            {vars.map((v, i) => (<div key={i} className="px-2 py-1 text-[11px]"><span className="font-mono text-foreground">{v.name}</span> <span className="text-[9px] px-1 rounded bg-muted/30 text-muted-foreground">{v.scope}</span><span className="block font-mono text-muted-foreground truncate">{v.value}</span></div>))}
          </div>}
    </div>
  )
}

// ── Neustart + Report ────────────────────────────────────────────────────────
function RebootReportPanel({ ctx, checklist, info }: { ctx: CockpitCtx; checklist: Checklist; info?: ChecklistDeviceInfo }) {
  const runJob = useMigrationJobs(s => s.run)
  const jobs = useMigrationJobs(s => s.jobs)
  const hpResults = useHpDeployStore(s => s.results)
  const lines: string[] = []
  const drv = hpResults[ctx.newHost.toLowerCase()]
  if (drv) lines.push(`Treiber: ${drv.message}`)
  for (const [id, label] of [['printers', 'Drucker'], ['quickaccess', 'Schnellzugriffe'], ['winupdate', 'Windows-Updates'], ['language', 'Sprache'], ['drives', 'Netzlaufwerke'], ['env', 'Variablen']] as const) {
    const j = jobs[jobKey(ctx.newHost, id)]
    if (j) lines.push(`${label}: ${j.status === 'done' ? 'OK' : j.status === 'running' ? 'läuft…' : 'Fehler'}${j.text ? ' — ' + j.text : ''}`)
  }
  return (
    <div>
      <PanelHead icon={<Power size={16} />} title="Neustart + Report" sub={ctx.newHost} />
      <div className="rounded-lg border border-border bg-muted/10 p-3 mb-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1"><FileText size={13} className="text-primary" />Abschluss-Report</div>
        <div className="text-[11px] text-muted-foreground">Gerät: <span className="font-mono text-foreground">{ctx.newHost}</span>{ctx.newHost && <DeviceInfoButton hostname={ctx.newHost} serial={info?.newSerial} />} · Nutzer: {checklist.name}{info?.software?.length ? ` · Alt-Software: ${info.software.join(', ')}` : ''}</div>
        {lines.length === 0 ? <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Info size={11} />Noch keine Aktionen in dieser Sitzung ausgeführt.</p>
          : <ul className="mt-2 space-y-0.5">{lines.map((l, i) => <li key={i} className="text-[11px] text-foreground">• {l}</li>)}</ul>}
      </div>
      <button onClick={() => { if (window.confirm(`${ctx.newHost} jetzt neu starten?`)) void runJob(jobKey(ctx.newHost, 'reboot'), () => rebootHost(ctx.newHost)) }} className={`${btnPrimary} bg-red-600 hover:bg-red-500`}><Power size={13} />Gerät neu starten</button>
      <JobResult ctx={ctx} id="reboot" />
    </div>
  )
}
