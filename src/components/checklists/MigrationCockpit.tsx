// ── Migrations-Cockpit (pro Checklisten-Zeile) ────────────────────────────────
// Öffnet sich über „Klicke mich" neben dem NEUEN Gerät (nur bei erreichbarem PC).
// Kacheln: Treiber, Basic (Grundeinrichtung je Modell-Typ, inkl. Sprache für ALLE
// Benutzer), Drucker, Explorer-Schnellzugriffe, Windows-Updates, SolidWorks (nur wenn
// Altgerät SolidWorks hatte), EuroPAR (nur bei EuroPAR-Geräten), Netzlaufwerke/WLAN,
// Neustart+Report. Alles läuft im Hintergrund (Stores außerhalb
// React) → Kachel wechseln / Modal schließen bricht nichts ab. Mehrere Kacheln
// auswählbar und gesammelt ausführbar. Drucker & Schnellzugriffe zusätzlich als
// .bat auf den Public Desktop.
import { useEffect, useState, type ReactNode } from 'react'
import {
  X, Wand2, Cpu, Printer, FolderOpen, HardDrive, TerminalSquare, Power, FileText,
  Boxes, Loader2, CheckCircle2, XCircle, ArrowLeft, RefreshCw, Play, Link2, Star, Download, Info, FolderSync, ScrollText,
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
  mapNetworkDrives, deployDrivesScript, transferWlan, wlanSinnvoll, WLAN_KATEGORIEN,
  searchWindowsUpdates, installWindowsUpdates, rebootHost,
  type NetDrive, type WinUpdate,
} from '../../services/migrationOps'
import {
  applyEuroparFolders, stageEuroparFolders, europarDirName, formatEuroparSize, EUROPAR_FOLDERS,
  type EuroparFolderState,
} from '../../services/europar'
import {
  applyEuroparEnvVars, readEuroparEnvVars, europarEnvKomplett, EUROPAR_ENV_VARS,
  type EuroparEnvState,
} from '../../services/europarEnv'
import {
  BASIC_SCRIPTS, basicScriptForCategory, basicStepList, runBasicSetup,
  subscribeBasicProgress, basicProgress,
  type BasicScript, type BasicScriptId, type BasicStepResult,
} from '../../services/basicSetup'
import { WINUPDATE_INTERVAL_H } from '../../services/autoWindowsUpdate'
import { loadStoredNetworkDrives, refreshNetworkDrivesLive } from '../../services/deviceNetworkDrives'
import { classifyModel } from '../../services/endpointDevices'
import {
  runAutoSetup, autoSetupProgress, autoSetupLaeuft, subscribeAutoSetup, autoStepList,
  type AutoStepResult,
} from '../../services/autoSetup'
import { TileInfoButton } from './TileInfo'
import { useAppStore } from '../../store/appStore'
import { useCurrentUser } from '../../store/authStore'

type TileId = 'drivers' | 'setupscript' | 'printers' | 'quickaccess' | 'europar' | 'winupdate' | 'solidworks' | 'drives' | 'reboot'

interface CockpitCtx {
  newHost: string; oldHost: string; corpId: string; isRefresh: boolean; by: string
  checklistId: string; printers: MigrationPrinter[]; quickAccessReady: boolean; online: boolean
  europarReady: boolean; europarDir: string; europarFolders: EuroparFolderState[]
  modelKategorie: string           // Modell-Typ des NEUEN Geräts (classifyModel) → Basic-Variante
  basicRunAt?: string              // letzter erfolgreicher/teilweiser Basic-Lauf (ISO)
  basicRunOk?: boolean
  basicSteps?: BasicStepResult[]
  onBasicDone?: (ok: boolean, steps: BasicStepResult[], at: string, scriptId: BasicScriptId) => void
  winUpdateAt?: string             // letzter automatischer Update-Lauf
  winUpdateOk?: boolean
  winUpdateText?: string
  onQuickAccessApplied?: () => void
  onEuroparStaged?: (folders: EuroparFolderState[], dir: string) => void
  onEuroparApplied?: (folders: EuroparFolderState[]) => void
  onEuroparEnvApplied?: (vars: EuroparEnvState[]) => void
}

export default function MigrationCockpit({ checklist, info, onClose, printers = [], quickAccessReady = false, online = false, onQuickAccessApplied, initialTile, europarApplicable = false, europarReady = false, europarDir = '', europarFolders = [], onEuroparStaged, onEuroparApplied, onEuroparEnvApplied, basicRunAt, basicRunOk, basicSteps, onBasicDone, winUpdateAt, winUpdateOk, winUpdateText, autoSetupDoneAt, autoSetupOk, onAutoSetupDone }: {
  checklist: Checklist; info?: ChecklistDeviceInfo; onClose: () => void
  printers?: MigrationPrinter[]; quickAccessReady?: boolean; online?: boolean; onQuickAccessApplied?: () => void
  /** Kachel, die beim Öffnen direkt aufgeschlagen wird (z. B. aus der EuroPAR-Kachel der Übersicht). */
  initialTile?: TileId
  /** true = Altgerät ist laut Scan ein EuroPAR-Gerät → Kachel wird überhaupt angezeigt. */
  europarApplicable?: boolean
  europarReady?: boolean; europarDir?: string; europarFolders?: EuroparFolderState[]
  onEuroparStaged?: (folders: EuroparFolderState[], dir: string) => void
  onEuroparApplied?: (folders: EuroparFolderState[]) => void
  onEuroparEnvApplied?: (vars: EuroparEnvState[]) => void
  basicRunAt?: string; basicRunOk?: boolean; basicSteps?: BasicStepResult[]
  onBasicDone?: (ok: boolean, steps: BasicStepResult[], at: string, scriptId: BasicScriptId) => void
  winUpdateAt?: string; winUpdateOk?: boolean; winUpdateText?: string
  autoSetupDoneAt?: string; autoSetupOk?: boolean; onAutoSetupDone?: () => void
}) {
  const by = useCurrentUser()?.username || 'cockpit'
  const newHost = (info?.newHostname || hostFromSerial((checklist.newDeviceSerial || '').trim()) || '').trim()
  const isRefresh = checklist.deviceType === 'refresh' && !!(checklist.oldDeviceId || '').trim()
  const oldHost = isRefresh ? (info?.oldHostname || hostFromSerial((checklist.oldDeviceId || '').trim()) || '').trim() : ''
  const corpId = (checklist.corpId || '').trim()
  const hasSolidWorks = !!info?.software?.includes('SolidWorks')
  const modelKategorie = classifyModel(info?.newModel || '')
  const euroDir = europarDir || europarDirName(newHost, checklist.id)
  const ctx: CockpitCtx = {
    newHost, oldHost, corpId, isRefresh, by, checklistId: checklist.id, printers, quickAccessReady, online,
    europarReady, europarDir: euroDir, europarFolders, modelKategorie, basicRunAt, basicRunOk, basicSteps, onBasicDone, winUpdateAt, winUpdateOk, winUpdateText,
    onQuickAccessApplied, onEuroparStaged, onEuroparApplied, onEuroparEnvApplied,
  }

  const [open, setOpen] = useState<TileId | null>(initialTile ?? null)
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
    { id: 'setupscript', label: 'Basic', icon: <ScrollText size={18} />, desc: 'Grundeinrichtung passend zum Modell-Typ — läuft komplett aus der Ferne.', applicable: true, enabled: online, reason: offReason, batch: true },
    { id: 'printers', label: 'Drucker einrichten', icon: <Printer size={18} />, desc: 'Drucker + Standard vom Altgerät übernehmen.', applicable: isRefresh, enabled: printers.length > 0, reason: printers.length > 0 ? undefined : 'Drucker werden noch vom Altgerät ermittelt', batch: true },
    { id: 'quickaccess', label: 'Explorer-Schnellzugriffe', icon: <FolderOpen size={18} />, desc: 'Schnellzugriffe vom Altgerät übertragen.', applicable: isRefresh, enabled: quickAccessReady, reason: quickAccessReady ? undefined : 'Schnellzugriff-Datei wird noch gesichert', batch: true },
    { id: 'europar', label: 'EuroPAR', icon: <FolderSync size={18} />, desc: `Ordner (${EUROPAR_FOLDERS.join(', ')}) übernehmen + Umgebungsvariablen setzen.`, applicable: isRefresh && europarApplicable, enabled: online, reason: offReason, batch: true },
    { id: 'winupdate', label: 'Windows-Updates', icon: <RefreshCw size={18} />, desc: `Automatisch alle ${WINUPDATE_INTERVAL_H} h — hier auch von Hand.`, applicable: true, enabled: online, reason: offReason, batch: true },
    { id: 'solidworks', label: 'SolidWorks', icon: <Boxes size={18} />, desc: 'War auf dem Altgerät installiert.', applicable: hasSolidWorks, enabled: online, reason: offReason, batch: false },
    { id: 'drives', label: 'Netzlaufwerke / WLAN', icon: <HardDrive size={18} />, desc: 'Netzlaufwerke & WLAN vom Altgerät.', applicable: isRefresh, enabled: online, reason: offReason, batch: true },
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
              {/* Komplett-Einrichtung: genau die Reihenfolge, die auch die Automatik fährt */}
              <AutoSetupLeiste checklist={checklist} info={info} by={by} online={online}
                doneAt={autoSetupDoneAt} doneOk={autoSetupOk} onDone={onAutoSetupDone} />

              {/* Sammel-Ausführen einzelner Kacheln */}
              <div className="flex items-center gap-2 flex-wrap mb-3 pb-3 border-b border-border">
                <span className="text-[11px] text-muted-foreground">Einzelne Kacheln auswählen und zusammen ausführen:</span>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                  <input type="checkbox" className="w-3.5 h-3.5 accent-primary"
                    checked={selectableBatch.length > 0 && selected.size === selectableBatch.length}
                    onChange={e => setSelected(e.target.checked ? new Set(selectableBatch.map(t => t.id)) : new Set())} />
                  alle Kacheln auswählen
                </label>
                <button disabled={selected.size === 0} onClick={() => void runBatch([...selected])}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                  <Play size={13} />Ausgewählte ausführen ({selected.size})
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {shownTiles.map(t => (
                  <div key={t.id} title={t.enabled ? undefined : t.reason}
                    className={`relative rounded-lg border border-border bg-card p-3 transition-colors ${t.enabled ? 'hover:border-primary/40 hover:bg-accent/20' : 'opacity-50'}`}>
                    {/* „i" erklärt, was die Kachel genau macht — auch bei deaktivierten Kacheln lesbar. */}
                    <TileInfoButton id={t.id} icon={t.icon} label={t.label} hinweis={t.enabled ? undefined : t.reason}
                      className="absolute top-2 right-2 p-0.5 rounded-full text-muted-foreground hover:text-primary hover:bg-accent/30" />
                    {t.batch && t.enabled && (
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} onClick={e => e.stopPropagation()}
                        title="Für Sammel-Ausführung auswählen"
                        className="absolute top-2.5 right-8 w-4 h-4 accent-primary" />
                    )}
                    <button type="button" disabled={!t.enabled} onClick={() => setOpen(t.id)} className="w-full text-left disabled:cursor-not-allowed">
                      <div className="flex items-center gap-2 text-primary pr-14"><span className="shrink-0">{t.icon}</span>
                        <span className="text-sm font-semibold text-foreground">{t.label}</span></div>
                      <p className="text-[11px] text-muted-foreground mt-1">{t.desc}</p>
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


// ── Komplett-Einrichtung (alle Kacheln der Reihe nach) ───────────────────────
// Zeigt den Live-Zwischenstand — auch dann, wenn die Automatik den Lauf gestartet hat
// und niemand das Fenster offen hatte. Der Fortschritt liegt in einem modulweiten Store,
// deshalb überlebt er das Schließen des Cockpits. [[auto_setup_feature]]
function AutoSetupLeiste({ checklist, info, by, online, doneAt, doneOk, onDone }: {
  checklist: Checklist; info?: ChecklistDeviceInfo; by: string; online: boolean
  doneAt?: string; doneOk?: boolean; onDone?: () => void
}) {
  const [, tick] = useState(0)
  useEffect(() => subscribeAutoSetup(() => tick(n => n + 1)), [])
  const [frage, setFrage] = useState(false)

  const laeuft = autoSetupLaeuft(checklist.id)
  const stand: AutoStepResult[] = autoSetupProgress(checklist.id) || autoStepList()
  const schonGelaufen = !!doneAt

  async function starten() {
    setFrage(false)
    // nurFehlende: ein zweiter Lauf zieht nur nach, was fehlt — nichts wird doppelt gemacht.
    await runAutoSetup(checklist, info, by, { nurFehlende: true })
    onDone?.()
  }

  return (
    <div className="mb-3 pb-3 border-b border-border">
      <div className="flex items-center gap-2 flex-wrap">
        <Wand2 size={14} className="text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground">Komplett-Einrichtung</span>
        <span className="text-[11px] text-muted-foreground">alle Kacheln der Reihe nach — läuft sonst automatisch, sobald der PC erreichbar ist</span>
        <button
          onClick={() => (schonGelaufen ? setFrage(true) : void starten())}
          disabled={laeuft || !online}
          title={!online ? 'Der neue PC muss online sein' : undefined}
          className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {laeuft ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {laeuft ? 'läuft…' : schonGelaufen ? 'Erneut einrichten' : 'Jetzt komplett einrichten'}
        </button>
      </div>

      {doneAt && !laeuft && (
        <p className={`text-[11px] mt-1.5 inline-flex items-center gap-1 ${doneOk ? 'text-green-400' : 'text-amber-300'}`}>
          {doneOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
          Komplett eingerichtet am {new Date(doneAt).toLocaleString('de-DE')}{doneOk ? '' : ' — nicht alle Schritte erfolgreich'} · die stündliche Automatik ist für dieses Gerät aus.
        </p>
      )}

      {/* Rückfrage vor dem Wiederholen */}
      {frage && (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
          <p className="text-xs text-foreground">Dieser PC wurde bereits komplett eingerichtet. Wollen Sie wirklich nochmal alles draufspielen?</p>
          <p className="text-[11px] text-muted-foreground mt-1">Es wird nichts doppelt gemacht — bereits erledigte Schritte werden übersprungen, nur Fehlendes wird nachgezogen.</p>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={() => void starten()} className="text-xs px-3 py-1.5 rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Ja, Fehlendes nachziehen</button>
            <button onClick={() => setFrage(false)} className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent/20">Abbrechen</button>
          </div>
        </div>
      )}

      {/* Live-Zwischenstand */}
      {(laeuft || autoSetupProgress(checklist.id)) && (
        <div className="mt-2 rounded border border-border divide-y divide-border">
          {stand.map((z, i) => (
            <div key={z.id} className="flex items-start gap-2 px-2 py-1">
              <span className="text-[10px] text-muted-foreground w-4 shrink-0 mt-0.5">{i + 1}.</span>
              <span className="shrink-0 mt-0.5">
                {z.status === 'ok' ? <CheckCircle2 size={12} className="text-green-400" />
                  : z.status === 'uebersprungen' ? <CheckCircle2 size={12} className="text-muted-foreground" />
                  : z.status === 'fehler' ? <XCircle size={12} className="text-red-400" />
                  : z.status === 'laeuft' ? <Loader2 size={12} className="animate-spin text-blue-300" />
                  : <span className="inline-block w-3 h-3 rounded-full border border-muted-foreground/40" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-xs ${z.status === 'laeuft' ? 'text-blue-300 font-semibold' : 'text-foreground'}`}>
                  {z.label}{z.status === 'laeuft' ? ' — läuft gerade…' : ''}
                </span>
                {z.text && <span className={`block text-[10px] ${z.status === 'fehler' ? 'text-red-300' : 'text-muted-foreground'}`}>{z.text}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-2">
        Reihenfolge: Basic · Drucker · Treiber · Schnellzugriffe · Netzlaufwerke · EuroPAR · Windows-Updates.
        Ein fehlgeschlagener Schritt hält den Ablauf nicht auf. Nach dem Durchlauf bekommt der Anwender eine Meldung am PC.
      </p>
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
  if (id === 'setupscript') {
    const sc = basicScriptForCategory(ctx.modelKategorie)
    if (!sc) return
    await jobs.run(key, async () => {
      const r = await runBasicSetup(ctx.newHost, ctx.corpId, sc.id)
      ctx.onBasicDone?.(r.ok, r.steps, r.finishedAt, r.scriptId)
      const fehler = r.steps.filter(st => st.status === 'fehler').length
      return { ok: r.ok, text: fehler ? `${fehler} von ${r.steps.length} Schritten fehlgeschlagen` : `${r.steps.length} Schritte ausgeführt` }
    })
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
  if (id === 'europar') {
    // Beide Teile: 1) Ordner aus dem Netz-Zwischenspeicher aufs Neugerät kopieren (der
    // Zwischenspeicher wird erst nach geprüfter Vollständigkeit geleert), 2) Umgebungs-
    // variablen setzen. Teil 1 nur, wenn überhaupt etwas gesichert ist.
    await jobs.run(key, async () => {
      const teile: string[] = []
      let ok = true
      if (ctx.europarReady) {
        const r = await applyEuroparFolders(ctx.newHost, ctx.europarDir)
        if (r.ok) ctx.onEuroparApplied?.(r.folders); else ok = false
        teile.push(`Ordner: ${r.text || (r.ok ? 'übertragen' : 'fehlgeschlagen')}`)
      } else {
        teile.push('Ordner: übersprungen (noch nicht gesichert)')
      }
      const e = await applyEuroparEnvVars(ctx.newHost, ctx.corpId)
      if (e.ok) ctx.onEuroparEnvApplied?.(e.vars); else ok = false
      teile.push(`Variablen: ${e.text || (e.ok ? 'gesetzt' : 'fehlgeschlagen')}`)
      return { ok, text: teile.join(' · ') }
    })
    return
  }
  if (id === 'winupdate') { await jobs.run(key, () => installWindowsUpdates(ctx.newHost)); return }
  if (id === 'drives') {
    await jobs.run(key, async () => {
      const teile: string[] = []
      let ok = true
      // Laufwerke frisch vom Altgerät lesen (HKU-Methode, pflegt den zentralen Stand mit).
      const d = await refreshNetworkDrivesLive(ctx.oldHost, ctx.by)
      if (!d.drives.length) {
        teile.push(`Laufwerke: ${d.ok ? 'keine am Altgerät verbunden' : (d.reason || 'nicht lesbar')}`)
      } else {
        const m = await mapNetworkDrives(ctx.newHost, d.drives)
        if (!m.ok) ok = false
        teile.push(`Laufwerke: ${m.ok ? `${d.drives.length} verbunden` : (m.text || 'fehlgeschlagen')}`)
      }
      // WLAN nur bei Laptops — Desktops haben keinen Adapter.
      if (wlanSinnvoll(ctx.modelKategorie)) {
        const w = await transferWlan(ctx.oldHost, ctx.newHost)
        if (!w.ok) ok = false
        teile.push(`WLAN: ${w.text || (w.ok ? 'übernommen' : 'fehlgeschlagen')}`)
      }
      return { ok, text: teile.join(' · ') }
    })
    return
  }
}

// ── Panels ─────────────────────────────────────────────────────────────────────
function TilePanel({ id, ctx, checklist, info, onNavigate }: { id: TileId; ctx: CockpitCtx; checklist: Checklist; info?: ChecklistDeviceInfo; onNavigate: (s: Screen) => void }) {
  switch (id) {
    case 'drivers': return <DriversPanel ctx={ctx} />
    case 'setupscript': return <BasicPanel ctx={ctx} />
    case 'printers': return <PrintersPanel ctx={ctx} />
    case 'quickaccess': return <QuickAccessPanel ctx={ctx} />
    case 'europar': return <EuroparPanel ctx={ctx} />
    case 'winupdate': return <WinUpdatePanel ctx={ctx} />
    case 'solidworks': return <SolidWorksPanel ctx={ctx} onNavigate={onNavigate} />
    case 'drives': return <DrivesPanel ctx={ctx} />
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

// ── Basic: Grundeinrichtung je Modell-Typ (läuft komplett aus der Ferne) ─────
function BasicPanel({ ctx }: { ctx: CockpitCtx }) {
  const runJob = useMigrationJobs(s => s.run)
  const job = useMigrationJobs(s => s.jobs)[jobKey(ctx.newHost, 'setupscript')]
  const auto = basicScriptForCategory(ctx.modelKategorie)
  const [gewaehlt, setGewaehlt] = useState<BasicScriptId | ''>(auto?.id || '')
  const script: BasicScript | null = BASIC_SCRIPTS.find(s => s.id === gewaehlt) || null

  // Fortschritt kommt aus dem modulweiten Store → Kachelwechsel/Schließen bricht nichts ab.
  const [, tick] = useState(0)
  useEffect(() => subscribeBasicProgress(() => tick(n => n + 1)), [])
  const live = basicProgress(ctx.newHost)

  const laeuft = job?.status === 'running'
  // Live-Fortschritt hat Vorrang; sonst der gespeicherte letzte Lauf; sonst die reine Schrittliste.
  const zeilen: BasicStepResult[] = live?.length
    ? live
    : ctx.basicSteps?.length ? ctx.basicSteps
    : script ? basicStepList(script.id) : []

  /** Ohne Argument: kompletter Lauf. Mit schrittId: nur dieser eine Schritt. */
  async function starten(schrittId?: string) {
    if (!script) return
    await runJob(jobKey(ctx.newHost, 'setupscript'), async () => {
      const r = await runBasicSetup(ctx.newHost, ctx.corpId, script.id, schrittId)
      // Einzelschritte überschreiben den Gesamtstempel nicht — nur der volle Lauf zählt.
      if (!schrittId) ctx.onBasicDone?.(r.ok, r.steps, r.finishedAt, r.scriptId)
      const fehler = r.steps.filter(st => st.status === 'fehler').length
      const was = schrittId ? (r.steps[0]?.label || 'Schritt') : `${r.steps.length} Schritte`
      return { ok: r.ok, text: fehler ? `${was}: fehlgeschlagen` : `${was} ausgeführt` }
    })
  }

  const stempel = ctx.basicRunAt ? new Date(ctx.basicRunAt).toLocaleString('de-DE') : ''

  return (
    <div>
      <PanelHead icon={<ScrollText size={16} />} title="Basic"
        sub={`Grundeinrichtung von ${ctx.newHost} — jeder Schritt wird aus der Ferne ausgeführt, nichts wird auf dem Gerät abgelegt.`} />

      {/* Zuordnung + letzter Lauf */}
      <div className="rounded border border-border p-2.5 mb-3">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Modell-Typ:</span>
          <span className="font-semibold text-foreground">{ctx.modelKategorie || 'unbekannt'}</span>
          {auto
            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">automatisch zugeordnet</span>
            : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {ctx.modelKategorie ? 'keine Variante hinterlegt — bitte wählen' : 'Modell unbekannt — bitte wählen'}
              </span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <select value={gewaehlt} onChange={e => setGewaehlt(e.target.value as BasicScriptId | '')} disabled={laeuft}
            className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary disabled:opacity-50">
            <option value="">— Variante wählen —</option>
            {BASIC_SCRIPTS.map(s => <option key={s.id} value={s.id}>{s.label} ({s.kategorien.join(', ')})</option>)}
          </select>
          {script && auto && script.id !== auto.id && <span className="text-[10px] text-amber-300">weicht von der Modell-Zuordnung ab</span>}
        </div>
        {stempel && (
          <p className={`text-[11px] mt-2 inline-flex items-center gap-1 ${ctx.basicRunOk ? 'text-green-400' : 'text-amber-300'}`}>
            {ctx.basicRunOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            Zuletzt ausgeführt am {stempel}{ctx.basicRunOk ? '' : ' — nicht alle Schritte erfolgreich'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => void starten()} disabled={!script || !ctx.online || laeuft} className={btnPrimary}
          title={!script ? 'Erst eine Variante wählen' : !ctx.online ? 'Der neue PC muss online sein' : 'Alle Schritte jetzt auf dem PC ausführen'}>
          {laeuft ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {stempel ? 'Erneut ausführen' : 'Jetzt ausführen'}
        </button>
        {laeuft && <span className="text-[11px] text-blue-300">läuft im Hintergrund — das Fenster darf geschlossen werden</span>}
      </div>
      <JobResult ctx={ctx} id="setupscript" />

      {/* Schritte */}
      {zeilen.length > 0 && (
        <div className="mt-3 rounded border border-border divide-y divide-border">
          {zeilen.map((z, i) => (
            <div key={z.id} className="flex items-start gap-2 px-2 py-1.5">
              <span className="text-[10px] text-muted-foreground w-4 shrink-0 mt-0.5">{i + 1}.</span>
              <span className="shrink-0 mt-0.5">
                {z.status === 'ok' ? <CheckCircle2 size={12} className="text-green-400" />
                  : z.status === 'teilweise' ? <CheckCircle2 size={12} className="text-amber-400" />
                  : z.status === 'fehler' ? <XCircle size={12} className="text-red-400" />
                  : z.status === 'laeuft' ? <Loader2 size={12} className="animate-spin text-blue-300" />
                  : <span className="inline-block w-3 h-3 rounded-full border border-muted-foreground/40" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-foreground">{z.label}</span>
                {z.text && <span className={`block text-[10px] ${z.status === 'fehler' ? 'text-red-300' : 'text-muted-foreground'}`}>{z.text}</span>}
              </span>
              {/* Einzelnen Schritt nachziehen, ohne den ganzen Lauf (z. B. nur die Sprache). */}
              <button type="button" onClick={() => void starten(z.id)} disabled={!script || !ctx.online || laeuft}
                title={`Nur „${z.label}" ausführen`}
                className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-accent/30 disabled:opacity-40">
                <Play size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        Alles läuft fern: Maschinen-Einstellungen (Energie, Registry, lokale Gruppen, System-Sprache, Updates) direkt per WinRM,
        Dateien von den Netzfreigaben über den Admin-PC auf die Admin-Freigabe des Ziels, benutzerbezogene Einstellungen in der
        Registry-Hive des Zielbenutzers. Fehlgeschlagene Schritte brechen den Lauf nicht ab — sie stehen oben einzeln.
        Nach Sprache und Umgebungsvariablen ist eine Neuanmeldung nötig.
      </p>
    </div>
  )
}

// ── EuroPAR-Ordner (C:\EuroPAR, C:\Local, C:\SCHNITTDATEN) ───────────────────
function EuroparPanel({ ctx }: { ctx: CockpitCtx }) {
  const runJob = useMigrationJobs(s => s.run)
  const [folders, setFolders] = useState<EuroparFolderState[]>(ctx.europarFolders || [])
  const vorhanden = folders.filter(f => f.state !== 'missing')
  const gesamtDateien = vorhanden.reduce((a, f) => a + f.files, 0)
  const gesamtBytes = vorhanden.reduce((a, f) => a + f.bytes, 0)

  async function uebertragen() {
    await runJob(jobKey(ctx.newHost, 'europar'), async () => {
      const r = await applyEuroparFolders(ctx.newHost, ctx.europarDir)
      setFolders(r.folders)
      if (r.ok) ctx.onEuroparApplied?.(r.folders)
      return { ok: r.ok, text: r.text }
    })
  }
  async function erneutSichern() {
    await runJob(jobKey(ctx.newHost, 'europar') + ':stage', async () => {
      const r = await stageEuroparFolders(ctx.oldHost, ctx.europarDir)
      setFolders(r.folders)
      if (r.ok) ctx.onEuroparStaged?.(r.folders, ctx.europarDir)
      return { ok: r.ok, text: r.text }
    })
  }

  return (
    <div>
      <PanelHead icon={<FolderSync size={16} />} title="EuroPAR"
        sub={`Zwei Teile: die drei Ordner vom Altgerät ${ctx.oldHost || '—'} nach C:\\ auf ${ctx.newHost} und die EuroPAR-Umgebungsvariablen.`} />
      <h4 className="text-xs font-semibold text-foreground mb-2">1 · Ordner ({EUROPAR_FOLDERS.join(', ')})</h4>

      {vorhanden.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine gesicherten Ordner. Das Tool sichert sie automatisch, sobald das Altgerät erreichbar ist.</p>
      ) : (
        <div className="rounded border border-border divide-y divide-border mb-3">
          {folders.map(f => (
            <div key={f.name} className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-xs font-mono text-foreground flex-1 truncate">C:\{f.name}</span>
              {f.state === 'missing' ? <span className="text-[10px] text-muted-foreground">auf dem Altgerät nicht vorhanden</span>
                : f.state === 'ok' ? <span className="text-[10px] text-green-400 inline-flex items-center gap-1"><CheckCircle2 size={10} />{f.files} Dateien · {formatEuroparSize(f.bytes)}</span>
                : <span className="text-[10px] text-red-300 inline-flex items-center gap-1"><XCircle size={10} />{f.missing} von {f.files} Dateien fehlen</span>}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => void uebertragen()} disabled={!ctx.europarReady || !ctx.online} className={btnPrimary}
          title={!ctx.europarReady ? 'Ordner werden noch gesichert' : !ctx.online ? 'Der neue PC muss online sein' : undefined}>
          <Link2 size={13} />Auf neuen PC übertragen
        </button>
        <button onClick={() => void erneutSichern()} disabled={!ctx.oldHost} className={btnGhost}>
          <RefreshCw size={13} />Erneut vom Altgerät sichern
        </button>
      </div>
      <JobResult ctx={ctx} id="europar" />
      <JobResult ctx={ctx} id="europar:stage" />

      <p className="text-[11px] text-muted-foreground mt-3">
        Zwischenspeicher: <span className="font-mono">…\Tool IT\Europar\{ctx.europarDir || '—'}</span>
        {vorhanden.length > 0 && <> · {gesamtDateien} Dateien · {formatEuroparSize(gesamtBytes)}</>}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">
        Kopiert wird additiv (robocopy /E) — auf dem neuen PC wird nichts gelöscht. Nach dem Übertragen wird jede Datei einzeln
        geprüft; erst wenn alles vollständig angekommen ist, löscht das Tool <span className="font-mono">Europar\{ctx.europarDir || '…'}</span> vom
        Netzlaufwerk. Etwas anderes wird dort nie gelöscht.
      </p>

      <EuroparEnvSection ctx={ctx} />
    </div>
  )
}

// ── EuroPAR, Teil 2: Umgebungsvariablen ──────────────────────────────────────
function EuroparEnvSection({ ctx }: { ctx: CockpitCtx }) {
  const runJob = useMigrationJobs(s => s.run)
  const [vars, setVars] = useState<EuroparEnvState[] | null>(null)
  const [user, setUser] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function lesen() {
    if (!ctx.online) { setErr('Der neue PC ist offline.'); return }
    setLoading(true); setErr('')
    const r = await readEuroparEnvVars(ctx.newHost, ctx.corpId)
    setLoading(false)
    if (r.ok || r.vars.length) { setVars(r.vars); setUser(r.user || '') }
    if (!r.ok) setErr(r.text || 'Lesen fehlgeschlagen')
  }
  useEffect(() => { void lesen() /* eslint-disable-next-line */ }, [])

  async function setzen() {
    await runJob(jobKey(ctx.newHost, 'europar') + ':env', async () => {
      const r = await applyEuroparEnvVars(ctx.newHost, ctx.corpId)
      if (r.vars.length) { setVars(r.vars); setUser(r.user || '') }
      if (r.ok) ctx.onEuroparEnvApplied?.(r.vars)
      return { ok: r.ok, text: r.text }
    })
  }

  // Ohne gelesenen Ist-Zustand wird der Soll-Zustand angezeigt (Ist = „—").
  const zeilen: EuroparEnvState[] = vars ?? EUROPAR_ENV_VARS.map(v => ({
    name: v.name, scope: v.scope, soll: v.value, ist: '', erfuellt: false,
  }))
  const komplett = europarEnvKomplett(vars ?? undefined)

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <div className="flex items-center gap-2 flex-wrap">
        <h4 className="text-xs font-semibold text-foreground">2 · Umgebungsvariablen</h4>
        {vars && (komplett
          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">alle gesetzt</span>
          : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">{zeilen.filter(v => !v.erfuellt).length} offen</span>)}
        {user && <span className="text-[10px] text-muted-foreground">Benutzerprofil: <span className="font-mono">{user}</span></span>}
      </div>

      <div className="rounded border border-border divide-y divide-border mt-2">
        {zeilen.map((v, i) => (
          <div key={`${v.scope}:${v.name}:${i}`} className="px-2 py-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-foreground">{v.name}</span>
              <span className="text-[9px] px-1 rounded bg-muted/30 text-muted-foreground">{v.scope === 'machine' ? 'System' : 'Benutzer'}</span>
              <span className="text-[11px] font-mono text-foreground">{v.soll}</span>
              {v.name.toLowerCase() === 'path' && <span className="text-[9px] text-muted-foreground">(wird nur ergänzt)</span>}
              {vars && (v.erfuellt
                ? <CheckCircle2 size={11} className="text-green-400" />
                : <XCircle size={11} className="text-amber-400" />)}
              {v.geaendert && <span className="text-[9px] text-green-400">neu gesetzt</span>}
            </div>
            {vars && <p className="text-[10px] text-muted-foreground font-mono truncate">Ist: {v.ist || '—'}</p>}
            {v.error && <p className="text-[10px] text-red-300">{v.error}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2">
        <button onClick={() => void setzen()} disabled={!ctx.online} className={btnPrimary}
          title={!ctx.online ? 'Der neue PC muss online sein' : 'Fehlende Variablen auf dem neuen PC setzen'}>
          <TerminalSquare size={13} />Umgebungsvariablen setzen
        </button>
        <button onClick={() => void lesen()} disabled={loading || !ctx.online} className={btnGhost}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Ist-Zustand lesen
        </button>
      </div>
      <JobResult ctx={ctx} id="europar:env" />
      {err && <p className="text-[11px] text-red-300 mt-1">{err}</p>}
      <p className="text-[11px] text-muted-foreground mt-2">
        Benutzer-Variablen gehen in die Registry-Hive des Zielbenutzers (ist niemand angemeldet, wird das Profil
        kurz geladen). <span className="font-mono">Path</span> wird nie überschrieben, sondern nur ergänzt, falls der Eintrag fehlt.
        Damit die Variablen greifen, muss sich der Benutzer neu anmelden.
      </p>
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

      {/* Automatik-Stand: läuft im Hintergrund, solange das Gerät in der Einrichtung steht. */}
      <div className="rounded border border-border p-2.5 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
            Automatik alle {WINUPDATE_INTERVAL_H} h
          </span>
          <span className="text-[11px] text-muted-foreground">läuft von selbst, solange das Gerät hier steht und online ist</span>
        </div>
        <p className={`text-[11px] mt-1.5 inline-flex items-start gap-1 ${ctx.winUpdateAt ? (ctx.winUpdateOk ? 'text-green-400' : 'text-amber-300') : 'text-muted-foreground'}`}>
          {ctx.winUpdateAt
            ? <>{ctx.winUpdateOk ? <CheckCircle2 size={12} className="mt-px" /> : <XCircle size={12} className="mt-px" />}
                <span>Zuletzt am {new Date(ctx.winUpdateAt).toLocaleString('de-DE')}{ctx.winUpdateText ? ` — ${ctx.winUpdateText}` : ''}</span></>
            : <span>Noch kein automatischer Lauf{ctx.winUpdateText ? ` — ${ctx.winUpdateText}` : ''}.</span>}
        </p>
      </div>

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

// ── Netzlaufwerke / WLAN ─────────────────────────────────────────────────────
function DrivesPanel({ ctx }: { ctx: CockpitCtx }) {
  const [drives, setDrives] = useState<NetDrive[] | null>(null)
  const [stand, setStand] = useState('')          // Zeitstempel des zentralen Standes
  const [live, setLive] = useState(false)         // wird gerade frisch gelesen?
  const [hinweis, setHinweis] = useState('')
  const runJob = useMigrationJobs(s => s.run)
  const wlanOk = wlanSinnvoll(ctx.modelKategorie)

  // Erst den zentral gespeicherten Stand zeigen (ohne Netzzugriff, sofort da), dann live
  // nachladen. refreshNetworkDrivesLive pflegt den zentralen Stand gleich mit.
  const laden = async (nurCache = false) => {
    const cache = await loadStoredNetworkDrives(ctx.oldHost).catch(() => null)
    if (cache) { setDrives(cache.drives); setStand(new Date(cache.scannedAt).toLocaleString('de-DE')) }
    else if (nurCache) setDrives([])
    if (nurCache) return
    setLive(true)
    try {
      const r = await refreshNetworkDrivesLive(ctx.oldHost, ctx.by)
      setDrives(r.drives)
      setStand(new Date(r.scannedAt).toLocaleString('de-DE'))
      setHinweis(r.ok ? '' : (r.reason || 'Altgerät nicht erreichbar — angezeigt wird der zuletzt gespeicherte Stand.'))
    } finally { setLive(false) }
  }
  useEffect(() => { void laden() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ctx.oldHost])

  return (
    <div>
      <PanelHead icon={<HardDrive size={16} />} title="Netzlaufwerke / WLAN"
        sub={`Vom Altgerät ${ctx.oldHost} → ${ctx.newHost}. Erfassen und Verbinden laufen auch von selbst im Hintergrund.`} />
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button disabled={!drives?.length} onClick={() => void runJob(jobKey(ctx.newHost, 'drives'), () => mapNetworkDrives(ctx.newHost, drives || []))} className={btnPrimary}
          title="Verbindet die Laufwerke im Kontext des angemeldeten Benutzers — dafür muss jemand am neuen PC angemeldet sein."><Link2 size={13} />Netzlaufwerke übernehmen</button>
        <button disabled={!drives?.length} onClick={() => void runJob(jobKey(ctx.newHost, 'drives') + ':bat', () => deployDrivesScript(ctx.newHost, drives || [], ctx.checklistId))} className={btnGhost}
          title="Rückfallebene, wenn niemand angemeldet ist: Der Anwender startet die .bat nach seiner Anmeldung selbst."><Download size={13} />Als .bat auf Public Desktop</button>
        <button onClick={() => void laden()} disabled={live} className={btnGhost}>
          {live ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Neu einlesen
        </button>
        {wlanOk && (
          <button onClick={() => void runJob(jobKey(ctx.newHost, 'drives') + ':wlan', () => transferWlan(ctx.oldHost, ctx.newHost))} className={btnGhost}>WLAN-Profile übernehmen</button>
        )}
      </div>
      {!wlanOk && (
        <p className="text-[11px] text-muted-foreground mb-2">
          WLAN-Profile werden nur bei Laptops übernommen ({WLAN_KATEGORIEN.join(', ')}) — dieses Gerät ist {ctx.modelKategorie || 'von unbekanntem Typ'}.
        </p>
      )}
      <JobResult ctx={ctx} id="drives" />
      {hinweis && <p className="text-[11px] text-amber-300 mt-1">{hinweis}</p>}

      {drives === null ? <p className="text-xs text-muted-foreground mt-2">Netzlaufwerke werden gelesen…</p>
        : drives.length === 0 ? <p className="text-xs text-muted-foreground mt-2">Auf dem Altgerät sind keine Netzlaufwerke verbunden.</p>
        : <>
            <div className="rounded border border-border divide-y divide-border mt-2">
              {drives.map((d, i) => (<div key={i} className="flex items-center gap-2 px-2 py-1.5 text-xs"><span className="font-mono text-foreground w-8">{d.letter}:</span><span className="font-mono text-muted-foreground truncate">{d.unc}</span></div>))}
            </div>
            {stand && <p className="text-[11px] text-muted-foreground mt-1">Stand vom {stand}{live ? ' · wird gerade aktualisiert…' : ''}</p>}
          </>}

      <p className="text-[11px] text-muted-foreground mt-3">
        Gelesen werden die dauerhaft verbundenen Laufwerke aller Benutzerprofile des Altgeräts; derselbe Stand steht
        auch im Geräte-„i". Verbunden wird mit <span className="font-mono">/persistent:yes</span> im Kontext des
        angemeldeten Benutzers — ist niemand angemeldet, versucht es der Hintergrundlauf später erneut.
      </p>
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
  for (const [id, label] of [['setupscript', 'Basic'], ['printers', 'Drucker'], ['quickaccess', 'Schnellzugriffe'], ['europar', 'EuroPAR'], ['winupdate', 'Windows-Updates'], ['drives', 'Netzlaufwerke']] as const) {
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
