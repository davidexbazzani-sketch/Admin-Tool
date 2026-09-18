// ── Geräte-Einrichtung ────────────────────────────────────────────────────────
// Übersicht aller offenen Refresh- und Neu-Checklisten. Neu-Geräte: Online-/Offline-
// Punkt (alle 20 s ein Ping). Refresh-Geräte: das Tool zieht selbstständig Drucker +
// Explorer-Schnellzugriff-Datei vom Altgerät (Netz-Zwischenspeicher, nach Übertragung
// gelöscht). Klick auf „Einrichten" öffnet das Cockpit mit Kacheln (Treiber, Drucker,
// Schnellzugriffe, Windows-Updates, SolidWorks, Sprache, Netzlaufwerke, Env, Neustart).
// Drucker/Schnellzugriffe erst aktiv, wenn Daten da; andere Kacheln nur wenn Gerät online.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Rocket, Loader2, RefreshCw, Wand2, Printer, FolderOpen, CheckCircle2, Search, X, HardDrive, FolderDown } from 'lucide-react'
import { listChecklists, type Checklist } from '../services/checklists'
import { loadChecklistDeviceInfos, hostFromSerial, type ChecklistDeviceInfo } from '../services/deviceMasterData'
import { classifyModel, MODEL_CATEGORIES } from '../services/endpointDevices'
import { deployDrivesScript } from '../services/migrationOps'
import { buildParallelOnlineCheck, parseOnlineCheckLine } from '../utils/connectivityCheck'
import { api } from '../electronAPI'
import MigrationCockpit from '../components/checklists/MigrationCockpit'
import { loadDeviceSetupState, autoPullRefresh, updateDeviceSetupItem, type DeviceSetupItem } from '../services/deviceSetup'
import { PersonInfoButton } from '../components/person/PersonDossier'
import { DeviceInfoButton } from '../components/device/DeviceDossier'

export default function DeviceSetup() {
  const [items, setItems] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [infos, setInfos] = useState<Map<string, ChecklistDeviceInfo>>(new Map())
  const [online, setOnline] = useState<Map<string, boolean>>(new Map())
  const [setupState, setSetupState] = useState<Record<string, DeviceSetupItem>>({})
  const [cockpitFor, setCockpitFor] = useState<Checklist | null>(null)
  const pulling = useRef<Set<string>>(new Set())

  // Filter/Suche
  const [suche, setSuche] = useState('')
  const [typFilter, setTypFilter] = useState<'all' | 'new' | 'refresh'>('all')
  const [modelFilter, setModelFilter] = useState('')   // '' = alle; sonst Kategorie oder 'Unbekannt'

  // Netzlaufwerk-.bat-Ablage je Checkliste
  const [driveBusy, setDriveBusy] = useState<Set<string>>(new Set())
  const [driveMsg, setDriveMsg] = useState<Record<string, string>>({})

  const newHostOf = (c: Checklist) => (infos.get(c.id)?.newHostname || hostFromSerial((c.newDeviceSerial || '').trim()) || '').trim()
  const oldHostOf = (c: Checklist) => c.deviceType === 'refresh' ? (infos.get(c.id)?.oldHostname || hostFromSerial((c.oldDeviceId || '').trim()) || '').trim() : ''

  async function reload() {
    setLoading(true)
    try {
      const all = await listChecklists()
      setItems(all.filter(c => (c.deviceType === 'refresh' || c.deviceType === 'new') && (showDone || !c.completed)))
    } finally { setLoading(false) }
  }
  useEffect(() => { void reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showDone])

  // Geräteinfos (aufgelöste Hostnamen + Alt-Software)
  const infoSig = items.map(c => `${c.id}${c.newDeviceSerial}${c.oldDeviceId || ''}`).join('|')
  useEffect(() => {
    if (!items.length) { setInfos(new Map()); return }
    let cancel = false
    loadChecklistDeviceInfos(items.map(c => ({ key: c.id, newSerial: c.newDeviceSerial || '', oldId: c.deviceType === 'refresh' ? (c.oldDeviceId || '') : '' })))
      .then(m => { if (!cancel) setInfos(m) }).catch(() => {})
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoSig])

  // Zustand (Drucker/Schnellzugriffe) laden
  useEffect(() => { void loadDeviceSetupState().then(setSetupState).catch(() => {}) }, [])

  // Online-Poll (20 s) über alle Neu-Hostnamen
  const pollHosts = useMemo(() => { const s = new Set<string>(); for (const c of items) { const h = newHostOf(c); if (h) s.add(h) } return [...s] /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [items, infos])
  const pollSig = pollHosts.join('|')
  useEffect(() => {
    if (!pollHosts.length) { setOnline(new Map()); return }
    let cancel = false
    const run = async () => {
      try {
        const r = await api().runPowerShell(buildParallelOnlineCheck(pollHosts), Math.min(240000, 30000 + pollHosts.length * 800))
        if (cancel) return
        const m = new Map<string, boolean>()
        for (const line of (r.stdout || '').split(/\r?\n/)) { if (!/:OK:|:OFFLINE/.test(line)) continue; const p = parseOnlineCheckLine(line); if (p.hostname) m.set(p.hostname.trim().toLowerCase(), p.online) }
        setOnline(m)
      } catch { /* letzten Stand behalten */ }
    }
    void run()
    const t = setInterval(() => { void run() }, 20000)
    return () => { cancel = true; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollSig])

  // Auto-Pull für Refresh-Geräte (beim Öffnen + minütlich): Drucker + Schnellzugriffe.
  useEffect(() => {
    let cancel = false
    const pull = async () => {
      const fresh = await loadDeviceSetupState().catch(() => ({} as Record<string, DeviceSetupItem>))
      for (const c of items) {
        if (cancel) return
        if (c.deviceType !== 'refresh') continue
        const st = fresh[c.id]
        const printersDone = !!(st && st.printers?.length)
        const qaDone = !!(st && (st.quickAccessStaged || st.quickAccessApplied))
        const drivesDone = !!(st && st.networkDrivesAt)   // erst fertig, wenn Netzlaufwerke erfasst
        const done = printersDone && qaDone && drivesDone
        if (done || pulling.current.has(c.id)) continue
        pulling.current.add(c.id)
        try {
          const next = await autoPullRefresh(c.id, (c.oldDeviceId || '').trim(), oldHostOf(c), (c.corpId || '').trim(), st)
          fresh[c.id] = next
          if (!cancel) setSetupState(prev => ({ ...prev, [c.id]: next }))
        } catch { /* best effort */ } finally { pulling.current.delete(c.id) }
      }
    }
    void pull()
    const t = setInterval(() => { void pull() }, 60000)
    return () => { cancel = true; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, infos])

  const counts = useMemo(() => ({
    refresh: items.filter(c => c.deviceType === 'refresh').length,
    neu: items.filter(c => c.deviceType === 'new').length,
  }), [items])

  // Model-Typ des NEUEN Geräts je Checkliste (aus der Endgeräte-Übersicht abgeleitet).
  const modelKatOf = (c: Checklist) => classifyModel(infos.get(c.id)?.newModel || '') || 'Unbekannt'

  // Vorhandene Model-Typen fürs Dropdown (nur die, die aktuell vorkommen), in fester Reihenfolge.
  const modelOptions = useMemo(() => {
    const present = new Set(items.map(modelKatOf))
    const out: string[] = MODEL_CATEGORIES.filter(k => present.has(k))
    if (present.has('Unbekannt')) out.push('Unbekannt')
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, infos])

  // Gefilterte Liste (Suche über Name/Corp-ID/Hostname/Serial + Typ + Model-Typ).
  const shown = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return items.filter(c => {
      if (typFilter === 'new' && c.deviceType !== 'new') return false
      if (typFilter === 'refresh' && c.deviceType !== 'refresh') return false
      if (modelFilter && modelKatOf(c) !== modelFilter) return false
      if (q) {
        const info = infos.get(c.id)
        const hay = [c.name, c.corpId, c.newDeviceSerial, c.oldDeviceId, info?.newHostname, info?.newSerial, info?.oldHostname, info?.newModel]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, infos, suche, typFilter, modelFilter])

  const filterAktiv = !!suche.trim() || typFilter !== 'all' || !!modelFilter

  // Gescannte Netzlaufwerke als .bat auf den Public Desktop des Neugeräts legen.
  async function deployDrives(c: Checklist) {
    const drives = setupState[c.id]?.networkDrives || []
    const newHost = newHostOf(c)
    if (!drives.length || !newHost) return
    setDriveBusy(s => new Set(s).add(c.id))
    setDriveMsg(m => ({ ...m, [c.id]: '' }))
    try {
      const r = await deployDrivesScript(newHost, drives)
      if (r.ok) {
        const next = await updateDeviceSetupItem(c.id, { networkDrivesApplied: true })
        setSetupState(prev => ({ ...prev, [c.id]: next }))
        setDriveMsg(m => ({ ...m, [c.id]: '✓ SKF-Netzlaufwerke-verbinden.bat auf dem Desktop des neuen PCs abgelegt.' }))
      } else {
        setDriveMsg(m => ({ ...m, [c.id]: '✕ ' + (r.text || 'Ablegen fehlgeschlagen.') }))
      }
    } catch (e) {
      setDriveMsg(m => ({ ...m, [c.id]: '✕ ' + (e instanceof Error ? e.message : String(e)) }))
    } finally {
      setDriveBusy(s => { const n = new Set(s); n.delete(c.id); return n })
    }
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-5 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Rocket size={20} className="text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Geräte-Einrichtung</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Offene Neu- und Refresh-Checklisten. Bei Refresh-Geräten zieht das Tool automatisch Drucker + Explorer-Schnellzugriffe
        vom Altgerät. „Einrichten" öffnet das Cockpit (Treiber, Windows-Updates, Sprache … — nur bei erreichbarem Gerät).
      </p>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button onClick={() => void reload()} disabled={loading} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/20 disabled:opacity-50">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Aktualisieren
        </button>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} className="accent-primary" />erledigte anzeigen
        </label>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {filterAktiv ? `${shown.length} von ${items.length} · ` : ''}{counts.neu} Neu · {counts.refresh} Refresh
        </span>
      </div>

      {/* Suche + Filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} spellCheck={false}
            placeholder="Suche: Benutzer, Rechnername, Seriennummer, Corp-ID…"
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
          {suche && (
            <button onClick={() => setSuche('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground" title="Suche leeren"><X size={13} /></button>
          )}
        </div>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {([['all', 'Alle'], ['new', 'Neu'], ['refresh', 'Refresh']] as const).map(([val, lbl]) => (
            <button key={val} onClick={() => setTypFilter(val)}
              className={`text-xs px-3 py-1.5 ${typFilter === val ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-accent/20'}`}>{lbl}</button>
          ))}
        </div>
        <select value={modelFilter} onChange={e => setModelFilter(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary">
          <option value="">Alle Modelltypen (neu)</option>
          {modelOptions.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        {filterAktiv && (
          <button onClick={() => { setSuche(''); setTypFilter('all'); setModelFilter('') }}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground">
            <X size={12} />Filter zurücksetzen
          </button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Wird geladen…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Neu-/Refresh-Checklisten.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Treffer für die aktuelle Filterung.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shown.map(c => {
            const info = infos.get(c.id)
            const newHost = newHostOf(c)
            const oldHost = oldHostOf(c)
            const isOnline = newHost ? online.get(newHost.toLowerCase()) : undefined
            const st = setupState[c.id]
            const isRefresh = c.deviceType === 'refresh'
            const printersReady = !!(st && st.printers?.length)
            const qaReady = !!(st && st.quickAccessStaged)
            const qaApplied = !!(st && st.quickAccessApplied)
            const drivesCaptured = !!(st && st.networkDrivesAt)
            const drivesCount = st?.networkDrives?.length || 0
            const drivesApplied = !!(st && st.networkDrivesApplied)
            const driveIsBusy = driveBusy.has(c.id)
            return (
              <div key={c.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{c.name || '—'}</span>
                  {c.name && <PersonInfoButton name={c.name} sam={c.corpId} />}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isRefresh ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}`}>{isRefresh ? 'Refresh' : 'Neu'}</span>
                  {c.corpId && <span className="text-[11px] font-mono text-muted-foreground">{c.corpId}</span>}
                </div>

                <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${isOnline === true ? 'bg-green-500' : isOnline === false ? 'bg-red-500' : 'bg-muted-foreground/40 animate-pulse'}`}
                    title={isOnline === true ? 'online' : isOnline === false ? 'offline' : 'wird geprüft…'} />
                  <span className="font-mono text-foreground">{newHost || (c.newDeviceSerial || '—')}</span>
                  {newHost && info?.newHostname && <DeviceInfoButton hostname={info.newHostname} serial={info.newSerial} />}
                  {isRefresh && oldHost && <span className="text-muted-foreground">· alt: <span className="font-mono text-foreground">{oldHost}</span></span>}
                  {isRefresh && oldHost && info?.oldHostname && <DeviceInfoButton hostname={info.oldHostname} serial={info.oldSerial} />}
                </div>

                {isRefresh && (
                  <>
                    <div className="mt-2 flex items-center gap-3 text-[11px] flex-wrap">
                      <span className={`inline-flex items-center gap-1 ${printersReady ? 'text-green-400' : 'text-muted-foreground'}`}>
                        <Printer size={11} />{printersReady ? `Drucker: ${st!.printers.length}${st!.printersFrom ? ' (' + st!.printersFrom + ')' : ''}` : 'Drucker: wird ermittelt…'}
                      </span>
                      <span className={`inline-flex items-center gap-1 ${qaApplied ? 'text-green-400' : qaReady ? 'text-green-400' : 'text-muted-foreground'}`}>
                        <FolderOpen size={11} />{qaApplied ? 'Schnellzugriffe: übertragen' : qaReady ? 'Schnellzugriffe: gesichert' : 'Schnellzugriffe: wird gesichert…'}
                        {qaApplied && <CheckCircle2 size={11} className="text-green-400" />}
                      </span>
                      <span className={`inline-flex items-center gap-1 ${drivesCaptured ? 'text-green-400' : 'text-muted-foreground'}`}
                        title={drivesCaptured ? (st!.networkDrives || []).map(d => `${d.letter}: ${d.unc}`).join('\n') : 'Wird täglich ab 12:00 vom Altgerät gescannt, bis erfasst.'}>
                        <HardDrive size={11} />{drivesCaptured ? `Netzlaufwerke: ${drivesCount}` : 'Netzlaufwerke: wird ermittelt (tägl. 12:00)'}
                      </span>
                    </div>
                    {drivesCaptured && drivesCount > 0 && (
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
                        <button onClick={() => void deployDrives(c)} disabled={driveIsBusy || isOnline !== true}
                          title={isOnline !== true ? 'Der neue PC muss online sein, um die .bat abzulegen.' : 'net-use-Skript auf den Desktop des neuen PCs legen'}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-accent/20 disabled:opacity-50">
                          {driveIsBusy ? <Loader2 size={11} className="animate-spin" /> : <FolderDown size={11} />}
                          {drivesApplied ? 'Netzlaufwerke-.bat erneut ablegen' : 'Netzlaufwerke als .bat auf neuen PC'}
                        </button>
                        {drivesApplied && !driveMsg[c.id] && <span className="inline-flex items-center gap-1 text-green-400"><CheckCircle2 size={11} />abgelegt</span>}
                        {driveMsg[c.id] && <span className={driveMsg[c.id].startsWith('✓') ? 'text-green-400' : 'text-red-400'}>{driveMsg[c.id]}</span>}
                      </div>
                    )}
                  </>
                )}

                <div className="mt-3">
                  <button onClick={() => setCockpitFor(c)}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                    <Wand2 size={13} />Einrichten
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {cockpitFor && (() => {
        const st = setupState[cockpitFor.id]
        const nh = newHostOf(cockpitFor)
        return (
          <MigrationCockpit
            checklist={cockpitFor}
            info={infos.get(cockpitFor.id)}
            printers={st?.printers || []}
            quickAccessReady={!!st?.quickAccessStaged}
            online={nh ? online.get(nh.toLowerCase()) === true : false}
            onQuickAccessApplied={() => {
              void updateDeviceSetupItem(cockpitFor.id, { quickAccessStaged: false, quickAccessApplied: true })
                .then(next => setSetupState(prev => ({ ...prev, [cockpitFor.id]: next })))
            }}
            onClose={() => setCockpitFor(null)}
          />
        )
      })()}
    </div>
    </div>
  )
}
