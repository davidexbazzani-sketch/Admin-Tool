// ── Flotten-WLAN-Analyse (Ansicht in der Netzwerk-Diagnose) ──────────────────
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Laptop, X, Wifi, ShieldAlert, FileDown, Check, Clock, Plus } from 'lucide-react'
import { useNetFleetStore } from '../store/netFleetStore'
import { laptopHosts, buildFleetRows, fleetCluster, istAuffaellig, saveFleetRun, listFleetRuns, loadFleetRun,
  saveFleetFixReport, listFleetFixReports, loadFleetFixReport, newFleetFixId,
  type FleetRow, type FleetIndexEntry, type FleetFixReport, type FleetFixIndexEntry } from './netFleet'
import { analysiere } from './analyse'
import { applyNetFixes, fixToWire, saveFixBackup } from './applyFix'
import { buildFleetFixPdf, savePdf, type AenderungsBericht, type AenderungsBerichtEintrag } from './pdf'
import { ladeBenutzerPCs } from './userPcs'
import UserPicker from '../components/UserPicker'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import type { NetLauf } from './types'

type SortKey = 'disconnects' | 'authFehler' | 'pc' | 'driverVersion'

export default function NetFleet({ by, onOpenAnalyse }: { by: string; onOpenAnalyse: (lauf: NetLauf) => void }) {
  const { running, done, total, current, ergebnisse, runLog, finishedTick, runFleet, cancel } = useNetFleetStore()
  const [hosts, setHosts] = useState<string[]>([])
  const [manual, setManual] = useState('')
  const [loadingLaptops, setLoadingLaptops] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('disconnects')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [confirmFix, setConfirmFix] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [fixMsg, setFixMsg] = useState('')
  const [savedTick, setSavedTick] = useState(0)
  const [history, setHistory] = useState<FleetIndexEntry[]>([])
  const [histOpen, setHistOpen] = useState(false)
  const [loadedRows, setLoadedRows] = useState<FleetRow[] | null>(null)   // aus dem Verlauf geladen (ohne Läufe)
  const [fixReport, setFixReport] = useState<FleetFixReport | null>(null)  // letztes/geöffnetes Fix-Protokoll
  const [fixHistory, setFixHistory] = useState<FleetFixIndexEntry[]>([])
  const [fixHistOpen, setFixHistOpen] = useState(false)

  const laeufeByPc = useMemo(() => new Map(ergebnisse.map(l => [l.pc, l])), [ergebnisse])
  const liveRows = useMemo(() => buildFleetRows(ergebnisse), [ergebnisse])
  const rows = loadedRows ?? liveRows
  const cluster = useMemo(() => fleetCluster(rows), [rows])

  const sortedRows = useMemo(() => {
    const r = [...rows]
    r.sort((a, b) =>
      sortKey === 'pc' ? a.pc.localeCompare(b.pc)
        : sortKey === 'driverVersion' ? (a.driverVersion || '').localeCompare(b.driverVersion || '')
          : sortKey === 'authFehler' ? b.authFehler - a.authFehler || b.disconnects - a.disconnects
            : b.disconnects - a.disconnects || b.authFehler - a.authFehler)
    return r
  }, [rows, sortKey])

  useEffect(() => { void listFleetRuns().then(setHistory); void listFleetFixReports().then(setFixHistory) }, [savedTick])

  // Nach Abschluss eines Live-Scans: FleetRun speichern + Auffällige vorwählen.
  useEffect(() => {
    if (running || liveRows.length === 0 || loadedRows) return
    void saveFleetRun(liveRows, by).then(() => setSavedTick(t => t + 1))
    setSel(new Set(liveRows.filter(r => istAuffaellig(r)).map(r => r.pc)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedTick])

  async function pickAllLaptops() {
    setLoadingLaptops(true); setLoadedRows(null)
    const hs = await laptopHosts()
    setHosts(hs); setLoadingLaptops(false)
  }
  function addManual() {
    const hs = [...new Set(manual.split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(Boolean))]
    setHosts(prev => [...new Set([...prev, ...hs])]); setManual(''); setLoadedRows(null)
  }
  async function addUser(sam: string, name: string) {
    const pcs = await ladeBenutzerPCs(sam, name)
    setHosts(prev => [...new Set([...prev, ...pcs.map(p => p.hostname.toUpperCase())])]); setLoadedRows(null)
  }
  function removeHost(h: string) { setHosts(prev => prev.filter(x => x !== h)) }

  function startScan() { setLoadedRows(null); setFixMsg(''); void runFleet(hosts, by) }

  async function openHist(e: FleetIndexEntry) {
    const run = await loadFleetRun(e.pfad)
    if (run) { setLoadedRows(run.rows); setHistOpen(false); setSel(new Set(run.rows.filter(r => istAuffaellig(r)).map(r => r.pc))) }
  }

  const toggleSel = (pc: string) => setSel(prev => { const n = new Set(prev); n.has(pc) ? n.delete(pc) : n.add(pc); return n })

  // Sammel-Fix: Standard-WLAN-Fixes auf die gewählten; protokolliert je PC WAS geändert wurde.
  async function fixSelected() {
    setConfirmFix(false)
    const targets = [...sel].map(pc => laeufeByPc.get(pc)).filter((l): l is NetLauf => !!l && l.ok)
    if (!targets.length) { setFixMsg('Für die gewählten PCs liegen keine (aktuellen) Scan-Daten vor — bitte erst scannen.'); return }
    setFixing(true); setFixMsg(''); setFixReport(null)
    const berichte: AenderungsBericht[] = []
    let ohne = 0
    const queue = [...targets]
    const worker = async () => {
      while (queue.length) {
        const l = queue.shift()!
        const fixbar = analysiere(l).filter(b => b.fixbar && b.fix && !b.standardAus && b.verbindung !== 'LAN')
        if (!fixbar.length) { ohne++; continue }
        try {
          const res = await applyNetFixes(l.pc, fixbar.map(b => fixToWire(b.id, b.titel, b.fix!)))
          const byId = new Map(res.results.map(r => [r.id, r]))
          const eintraege: AenderungsBerichtEintrag[] = fixbar.map(b => {
            const rr = byId.get(b.id)
            return { titel: b.titel, kategorie: b.kategorie, fundort: b.fundort, alt: rr?.alt || '—', neu: rr?.neu || '—', ok: !!rr?.ok, fehler: rr?.fehler || undefined }
          })
          const okN = eintraege.filter(e => e.ok).length
          berichte.push({ host: l.pc, at: new Date().toISOString(), by, gesamt: eintraege.length, ok: okN, gesichert: true, neustartNoetig: res.neustartNoetig, eintraege })
          if (res.ok) await saveFixBackup({ host: l.pc, changedAt: new Date().toISOString(), changedBy: by, entries: res.results.filter(r => r.ok), neustartNoetig: res.neustartNoetig })
        } catch (e) {
          berichte.push({ host: l.pc, at: new Date().toISOString(), by, gesamt: 0, ok: 0, neustartNoetig: false, eintraege: [{ titel: 'Fehler beim Anwenden', kategorie: 'info', alt: '—', neu: '—', ok: false, fehler: e instanceof Error ? e.message : String(e) }] })
        }
      }
    }
    await Promise.all(Array.from({ length: 5 }, worker))
    setFixing(false)
    berichte.sort((a, b) => a.host.localeCompare(b.host))
    const report: FleetFixReport = { id: newFleetFixId(), ranAt: new Date().toISOString(), ranBy: by, berichte }
    await saveFleetFixReport(report)
    setFixReport(report); setSavedTick(t => t + 1)
    const okPc = berichte.filter(b => b.ok > 0).length
    const okChanges = berichte.reduce((n, b) => n + b.ok, 0)
    setFixMsg(`${okChanges} Änderung(en) auf ${okPc} PC(s) angewendet und protokolliert${ohne ? ` · ${ohne} PC(s) ohne offene WLAN-Fixes` : ''}. Wirkt nach WLAN-Neuverbindung/Neustart; Rückgängig je PC im Geräte-„i".`)
  }
  async function openFixReport(e: FleetFixIndexEntry) {
    const r = await loadFleetFixReport(e.pfad)
    if (r) { setFixReport(r); setFixHistOpen(false) }
  }

  function exportCsv() {
    const head = ['PC', 'Adapter', 'Treiber', 'Energiesparen', 'Abschaltbar', 'Roaming', 'U-APSD', 'Trennungen', 'AuthFehler', 'HOCH']
    const lines = [head.join(';'), ...sortedRows.map(r => [r.pc, r.adapter, r.driverVersion, r.wlanSpar, r.turnOff == null ? '' : (r.turnOff ? 'ja' : 'nein'), r.roaming, r.uapsd, r.disconnects, r.authFehler, r.hochBefunde].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))]
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `WLAN-Flotte_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const auffCount = rows.filter(r => istAuffaellig(r)).length

  return (
    <div className="space-y-4">
      {/* Ziel-Auswahl */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Laptop size={15} className="text-primary" />Laptops für die Flotten-Analyse</div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => void pickAllLaptops()} disabled={loadingLaptops || running}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50">
            {loadingLaptops ? <Loader2 size={13} className="animate-spin" /> : <Laptop size={13} />}Alle Laptops laden
          </button>
          <span className="text-[11px] text-muted-foreground">{hosts.length} PC(s) gewählt</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Benutzer hinzufügen</div>
            <UserPicker onPick={u => void addUser(u.sam, u.displayName)} placeholder="Benutzer suchen…" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Hostnamen hinzufügen</div>
            <div className="flex items-center gap-2">
              <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addManual() }}
                placeholder="DE5CG… (Leerzeichen/Komma)" spellCheck={false}
                className="flex-1 px-2 py-1.5 text-xs font-mono rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              <button onClick={addManual} disabled={!manual.trim()} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"><Plus size={12} />Add</button>
            </div>
          </div>
        </div>
        {hosts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hosts.slice(0, 60).map(h => (
              <span key={h} className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-foreground">{h}<button onClick={() => removeHost(h)} className="text-muted-foreground hover:text-red-400"><X size={10} /></button></span>
            ))}
            {hosts.length > 60 && <span className="text-[10px] text-muted-foreground">… +{hosts.length - 60}</span>}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {!running ? (
            <button onClick={startScan} disabled={hosts.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              <Wifi size={15} />Flotte scannen ({hosts.length})
            </button>
          ) : (
            <button onClick={cancel} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-red-500/40 text-red-300 text-sm hover:bg-red-500/10"><X size={15} />Abbrechen</button>
          )}
          <button onClick={() => setHistOpen(o => !o)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><Clock size={13} />Verlauf ({history.length})</button>
          <button onClick={() => setFixHistOpen(o => !o)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><Check size={13} />Fix-Historie ({fixHistory.length})</button>
          {rows.length > 0 && <button onClick={exportCsv} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><FileDown size={13} />CSV</button>}
        </div>
        {running && (
          <div>
            <div className="flex items-center gap-2 text-xs text-foreground"><Loader2 size={13} className="animate-spin text-primary" />Scanne {done}/{total}… {current.length > 0 && <span className="text-muted-foreground font-mono">{current.join(', ')}</span>}</div>
            <div className="mt-1 h-1.5 rounded bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
          </div>
        )}
        {histOpen && history.length > 0 && (
          <div className="rounded border border-border divide-y divide-border/50 max-h-48 overflow-auto">
            {history.map(e => (
              <button key={e.id} onClick={() => void openHist(e)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-accent/20">
                <span className="text-muted-foreground">{new Date(e.ranAt).toLocaleString('de-DE')}</span>
                <span className="text-foreground">{e.pcs} PC(s)</span>
                <span className="ml-auto text-red-300">{e.auffaellig} auffällig</span>
              </button>
            ))}
          </div>
        )}
        {fixHistOpen && (
          <div className="rounded border border-border divide-y divide-border/50 max-h-48 overflow-auto">
            {fixHistory.length === 0 ? <div className="px-2.5 py-1.5 text-xs text-muted-foreground">Noch keine Fix-Protokolle.</div> : fixHistory.map(e => (
              <button key={e.id} onClick={() => void openFixReport(e)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-accent/20">
                <Check size={12} className="text-emerald-400" />
                <span className="text-muted-foreground">{new Date(e.ranAt).toLocaleString('de-DE')}</span>
                <span className="text-foreground">{e.changes} Änderung(en) · {e.pcs} PC(s)</span>
                <span className="ml-auto text-muted-foreground">{e.ranBy}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cluster: gemeinsamer Nenner */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-300 mb-1"><ShieldAlert size={15} />Gemeinsamer Nenner der {cluster.auffaellig} auffälligen Laptops</div>
          {cluster.auffaellig === 0 ? (
            <p className="text-[11px] text-muted-foreground">Keine auffälligen Laptops (viele Trennungen / 802.1X-Fehler / HOCH-Befunde) in dieser Auswahl.</p>
          ) : cluster.attrs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Kein eindeutiges gemeinsames Merkmal — die Auffälligen unterscheiden sich in Adapter/Treiber/Einstellungen.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {cluster.attrs.map(a => (
                <span key={a.label} className="text-[11px] px-2 py-1 rounded-md border border-amber-500/40 bg-background text-foreground">
                  {a.label}: <b>{a.wert}</b> <span className="text-muted-foreground">({a.anteil}/{a.gesamt})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabelle */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
            <span className="text-xs text-muted-foreground">{rows.length} Laptop(s) · {auffCount} auffällig</span>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-[11px] text-muted-foreground">Sortieren:
                <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className="ml-1 px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[11px]">
                  <option value="disconnects">Trennungen</option>
                  <option value="authFehler">Auth-Fehler</option>
                  <option value="driverVersion">Treiber</option>
                  <option value="pc">Name</option>
                </select>
              </label>
              {!loadedRows && (
                <button onClick={() => setConfirmFix(true)} disabled={fixing || sel.size === 0}
                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50">
                  {fixing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Auswahl beheben ({sel.size})
                </button>
              )}
            </div>
          </div>
          {confirmFix && (
            <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-2 flex-wrap">
              <ShieldAlert size={13} />Standard-WLAN-Fixes (Energiesparen aus · Abschaltung aus · Roaming Mittel · U-APSD aus) auf {sel.size} PC(s) anwenden? Wirkt nach WLAN-Neuverbindung/Neustart; Altwerte werden je PC gesichert (Rückgängig im Geräte-„i").
              <button onClick={() => void fixSelected()} className="px-2 py-1 rounded bg-primary text-primary-foreground font-semibold">Ja, anwenden</button>
              <button onClick={() => setConfirmFix(false)} className="px-2 py-1 rounded border border-border text-muted-foreground">Abbrechen</button>
            </div>
          )}
          {fixMsg && <div className="px-3 py-1.5 text-[11px] text-foreground bg-muted/30 border-b border-border">{fixMsg}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-muted/20 text-muted-foreground">
                <tr className="text-left">
                  {!loadedRows && <th className="px-2 py-1.5 w-6"></th>}
                  <th className="px-2 py-1.5">PC</th>
                  <th className="px-2 py-1.5">WLAN-Adapter</th>
                  <th className="px-2 py-1.5">Treiber</th>
                  <th className="px-2 py-1.5" title="WLAN-Energiesparen Netz/Akku (0=Höchstleistung)">Energie</th>
                  <th className="px-2 py-1.5" title="Adapter abschaltbar">Ab.</th>
                  <th className="px-2 py-1.5">Roaming</th>
                  <th className="px-2 py-1.5">U-APSD</th>
                  <th className="px-2 py-1.5 text-right" title="WLAN-Trennungen 14 Tage">Trenn.</th>
                  <th className="px-2 py-1.5 text-right" title="802.1X-Auth-Fehler">Auth</th>
                  <th className="px-2 py-1.5 text-right" title="HOCH-Befunde">!</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(r => {
                  const auff = istAuffaellig(r)
                  const lauf = laeufeByPc.get(r.pc)
                  return (
                    <tr key={r.pc} className={`border-t border-border/40 ${auff ? 'bg-red-500/5' : ''} hover:bg-accent/10`}>
                      {!loadedRows && <td className="px-2 py-1"><input type="checkbox" checked={sel.has(r.pc)} onChange={() => toggleSel(r.pc)} className="accent-primary" /></td>}
                      <td className="px-2 py-1 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {lauf ? <button onClick={() => onOpenAnalyse(lauf)} className="font-mono text-foreground hover:text-primary hover:underline">{r.pc}</button> : <span className="font-mono text-foreground">{r.pc}</span>}
                          <DeviceInfoButton hostname={r.pc} />
                        </span>
                      </td>
                      <td className="px-2 py-1 max-w-[180px] truncate" title={r.adapter}>{r.fehler ? <span className="text-red-400">{r.fehler}</span> : r.adapter}</td>
                      <td className="px-2 py-1 font-mono whitespace-nowrap">{r.driverVersion || '—'}</td>
                      <td className="px-2 py-1 font-mono">{r.wlanSpar}</td>
                      <td className="px-2 py-1">{r.turnOff == null ? '—' : (r.turnOff ? <span className="text-amber-300">ja</span> : 'nein')}</td>
                      <td className="px-2 py-1 max-w-[100px] truncate" title={r.roaming}>{r.roaming || '—'}</td>
                      <td className="px-2 py-1">{r.uapsd || '—'}</td>
                      <td className={`px-2 py-1 text-right font-semibold ${r.disconnects >= 8 ? 'text-red-400' : r.disconnects >= 5 ? 'text-amber-300' : 'text-muted-foreground'}`}>{r.disconnects}</td>
                      <td className={`px-2 py-1 text-right font-semibold ${r.authFehler >= 3 ? 'text-red-400' : 'text-muted-foreground'}`}>{r.authFehler}</td>
                      <td className={`px-2 py-1 text-right ${r.hochBefunde > 0 ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>{r.hochBefunde}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fix-Protokoll: WAS wurde je PC geändert (+ PDF) */}
      {fixReport && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Check size={15} className="text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-300">Fix-Protokoll · {new Date(fixReport.ranAt).toLocaleString('de-DE')}</span>
            <span className="text-[11px] text-muted-foreground">{fixReport.berichte.reduce((n, b) => n + b.ok, 0)} Änderung(en) auf {fixReport.berichte.length} PC(s) · {fixReport.ranBy}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => void savePdf(buildFleetFixPdf(fixReport.berichte, fixReport.ranAt, fixReport.ranBy), `WLAN-Flotten-Fix_${fixReport.ranAt.slice(0, 10)}.pdf`)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"><FileDown size={13} />Als PDF</button>
              <button onClick={() => setFixReport(null)} className="p-1 rounded hover:bg-accent text-muted-foreground"><X size={14} /></button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-auto">
            {fixReport.berichte.map(b => (
              <div key={b.host} className="rounded border border-border/60 p-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-flex items-center gap-1"><span className="font-mono text-sm font-semibold text-foreground">{b.host}</span><DeviceInfoButton hostname={b.host} /></span>
                  <span className="text-[11px] text-muted-foreground">{b.ok}/{b.gesamt} geändert{b.neustartNoetig ? ' · Neustart nötig' : ''}</span>
                </div>
                {b.eintraege.length === 0 ? <div className="text-[11px] text-muted-foreground italic pl-1">nichts geändert</div>
                  : b.eintraege.map((e, i) => (
                    <div key={i} className="text-[11px] pl-1">
                      <span className={e.ok ? 'text-emerald-400' : 'text-red-400'}>{e.ok ? '✓' : '✕'}</span>{' '}
                      <span className="text-foreground">{e.titel}</span>{' '}
                      <span className="font-mono text-muted-foreground">{e.alt} → {e.neu}</span>
                      {e.fehler && <span className="text-red-400"> ({e.fehler})</span>}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Protokoll */}
      {runLog.length > 0 && (
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          {runLog.filter(r => !r.ok).slice(0, 20).map((r, i) => <div key={i}><span className="text-red-400">✕</span> <span className="font-mono">{r.pc}</span> — {r.text}</div>)}
        </div>
      )}
    </div>
  )
}
