// ── Netzwerk-Diagnose: Einstiegs-/Scan-UI (Multi-PC, Problem vs. Referenz) ───

import { useEffect, useMemo, useState } from 'react'
import {
  Wifi, ArrowLeft, Search, Loader2, X, FileDown, Layers, Trash2, Clock, AlertTriangle, ShieldCheck,
  UserSearch, Plus, Laptop, ChevronRight,
} from 'lucide-react'
import { useNetScanStore, type NetScanEntry } from '../store/netScanStore'
import { analysiere, vergleiche } from './analyse'
import { buildVergleichPdf, savePdf } from './pdf'
import { listLaeufe, loadLauf, deleteLauf, loadRecentHosts, type NetIndexEintrag } from './store'
import { ladeBenutzerPCs, type UserPc } from './userPcs'
import UserPicker from '../components/UserPicker'
import type { AdUserListItem } from '../services/adUsersList'
import { useAuthStore } from '../store/authStore'
import type { NetLauf } from './types'
import NetAnalyse from './NetAnalyse'
import NetFleet from './NetFleetView'
import { DeviceInfoButton } from '../components/device/DeviceDossier'

function parseHosts(s: string): string[] {
  return [...new Set((s || '').split(/[\s,;]+/).map(t => t.trim()).filter(Boolean))]
}

/** Hostnamen eindeutig an ein Textfeld anhängen (bestehende bleiben erhalten). */
function appendHosts(current: string, hosts: string[]): string {
  const have = new Set(parseHosts(current).map(h => h.toLowerCase()))
  const neu = hosts.map(h => h.trim()).filter(h => h && !have.has(h.toLowerCase()))
  if (!neu.length) return current
  return (current.trim() ? current.trim() + '\n' : '') + neu.join('\n')
}

export default function NetzwerkDiagnose({ onBack }: { onBack: () => void }) {
  const authUser = useAuthStore(s => s.session?.user)
  const by = authUser?.displayName || authUser?.username || 'unbekannt'
  const { running, done, total, current, ergebnisse, runLog, error, finishedTick, run, cancel, clear } = useNetScanStore()

  const [problemInput, setProblemInput] = useState('')
  const [referenzInput, setReferenzInput] = useState('')
  const [recent] = useState<string[]>(() => loadRecentHosts())
  const [analyse, setAnalyse] = useState<NetLauf | null>(null)
  const [vergleichOffen, setVergleichOffen] = useState(false)
  const [verlauf, setVerlauf] = useState<NetIndexEintrag[]>([])
  const [verlaufOffen, setVerlaufOffen] = useState(false)

  // Benutzer-Suche → zugewiesene PCs (Sofortsuche über UserPicker)
  const [userLoading, setUserLoading] = useState(false)
  const [userMsg, setUserMsg] = useState('')
  const [gewaehlt, setGewaehlt] = useState<AdUserListItem | null>(null)
  const [userPCs, setUserPCs] = useState<UserPc[]>([])
  const [view, setView] = useState<'single' | 'fleet'>('single')

  useEffect(() => { listLaeufe().then(setVerlauf) }, [finishedTick])

  async function benutzerWaehlen(u: AdUserListItem) {
    setGewaehlt(u); setUserLoading(true); setUserMsg(''); setUserPCs([])
    const pcs = await ladeBenutzerPCs(u.sam, u.displayName)
    setUserPCs(pcs)
    setUserMsg(pcs.length ? '' : `Keine zugewiesenen PCs für ${u.displayName} gefunden (weder in AD noch im Inventar).`)
    setUserLoading(false)
  }

  const problemHosts = parseHosts(problemInput)
  const referenzHosts = parseHosts(referenzInput).filter(h => !problemHosts.some(p => p.toLowerCase() === h.toLowerCase()))
  const gesamt = problemHosts.length + referenzHosts.length

  function starten() {
    const entries: NetScanEntry[] = [
      ...problemHosts.map(h => ({ host: h, rolle: 'problem' as const })),
      ...referenzHosts.map(h => ({ host: h, rolle: 'referenz' as const })),
    ]
    void run(entries, by)
  }

  const befundMap = useMemo(() => {
    const m = new Map<string, { anz: number; hoch: number }>()
    for (const l of ergebnisse) { const b = l.ok ? analysiere(l) : []; m.set(l.pc, { anz: b.length, hoch: b.filter(x => x.gewicht === 'HOCH').length }) }
    return m
  }, [ergebnisse])

  async function verlaufOeffnen(e: NetIndexEintrag) {
    const l = await loadLauf(e.pfad)
    if (l) setAnalyse(l)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Kopf */}
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
          <ArrowLeft size={12} />Zurück
        </button>
        <Wifi size={18} className="text-primary" />
        <div>
          <div className="text-sm font-semibold text-foreground">Netzwerk Probleme (WLAN-Diagnose)</div>
          <div className="text-[11px] text-muted-foreground">Einzeln/Vergleich beheben — oder die ganze Laptop-Flotte auf WLAN-Probleme analysieren.</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button onClick={() => setView('single')} className={`px-3 py-1.5 ${view === 'single' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>Einzel &amp; Vergleich</button>
            <button onClick={() => setView('fleet')} className={`px-3 py-1.5 border-l border-border ${view === 'fleet' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>Flotten-Analyse</button>
          </div>
          {view === 'single' && (
            <button onClick={() => setVerlaufOffen(o => !o)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground">
              <Clock size={13} />Verlauf ({verlauf.length})
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {view === 'fleet' && <NetFleet by={by} onOpenAnalyse={setAnalyse} />}
        {view === 'single' && (<>
        {/* Benutzer-Suche → zugewiesene PCs */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-primary mb-1"><UserSearch size={14} />Nach Benutzer suchen</div>
          <p className="text-[11px] text-muted-foreground mb-2">Namen (Vor-/Nachname), Corp-ID oder Abteilung eingeben — Treffer erscheinen sofort; die zugewiesenen PCs lassen sich direkt in den Scan übernehmen.</p>

          {!gewaehlt && <UserPicker onPick={benutzerWaehlen} placeholder="Benutzer suchen (Name, Corp-ID, Abteilung)…" />}
          {userMsg && <div className="mt-2 text-[11px] text-muted-foreground">{userMsg}</div>}

          {/* Gewählter Benutzer + seine PCs */}
          {gewaehlt && (
            <div className="mt-2">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-xs text-foreground"><b>{gewaehlt.displayName}</b> <span className="font-mono text-muted-foreground">({gewaehlt.sam})</span>{userPCs.length ? ` — ${userPCs.length} PC(s)` : ''}</span>
                <button onClick={() => { setGewaehlt(null); setUserPCs([]); setUserMsg('') }} className="text-[11px] text-muted-foreground hover:text-foreground">andere Auswahl</button>
                {userPCs.length > 0 && (
                  <div className="ml-auto flex items-center gap-1.5">
                    <button onClick={() => setProblemInput(v => appendHosts(v, userPCs.map(p => p.hostname)))}
                      className="text-[11px] px-2 py-1 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10">alle → Problem</button>
                    <button onClick={() => setReferenzInput(v => appendHosts(v, userPCs.map(p => p.hostname)))}
                      className="text-[11px] px-2 py-1 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10">alle → Referenz</button>
                  </div>
                )}
              </div>
              {userLoading ? (
                <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />PCs werden ermittelt…</p>
              ) : (
              <div className="space-y-1">
                {userPCs.map(p => (
                  <div key={p.hostname} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border bg-background">
                    <Laptop size={14} className="text-muted-foreground shrink-0" />
                    <span className="inline-flex items-center gap-1"><span className="text-sm font-mono font-semibold text-foreground">{p.hostname}</span><DeviceInfoButton hostname={p.hostname} /></span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border">{p.quelle}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{[p.model, p.os, p.status, p.lastLogon ? 'zuletzt ' + p.lastLogon : ''].filter(Boolean).join(' · ')}</span>
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      <button onClick={() => setProblemInput(v => appendHosts(v, [p.hostname]))}
                        className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-1 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10" title="als Problem-PC übernehmen"><Plus size={11} />Problem</button>
                      <button onClick={() => setReferenzInput(v => appendHosts(v, [p.hostname]))}
                        className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-1 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" title="als Referenz-PC übernehmen"><Plus size={11} />Referenz</button>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}
        </div>

        {/* Eingabe */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-red-300 mb-1"><AlertTriangle size={14} />Problem-PCs</div>
            <p className="text-[11px] text-muted-foreground mb-2">Geräte mit WLAN-Aussetzern — Hostname oder IP, mehrere durch Leerzeichen/Komma/Zeilen.</p>
            <textarea value={problemInput} onChange={e => setProblemInput(e.target.value)} rows={4}
              placeholder="z. B. DE5CG… oder 10.170.33.60" spellCheck={false}
              className="w-full px-2 py-1.5 text-xs font-mono rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            <div className="text-[10px] text-muted-foreground mt-1">{problemHosts.length} PC(s)</div>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300 mb-1"><ShieldCheck size={14} />Referenz-PCs (laufen fehlerfrei)</div>
            <p className="text-[11px] text-muted-foreground mb-2">Vergleichsgeräte ohne Probleme — zum Aufdecken der Unterschiede.</p>
            <textarea value={referenzInput} onChange={e => setReferenzInput(e.target.value)} rows={4}
              placeholder="optional — z. B. Kollegen-PCs ohne Aussetzer" spellCheck={false}
              className="w-full px-2 py-1.5 text-xs font-mono rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            <div className="text-[10px] text-muted-foreground mt-1">{referenzHosts.length} PC(s)</div>
          </div>
        </div>

        {recent.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">Zuletzt:</span>
            {recent.slice(0, 12).map(h => (
              <button key={h} onClick={() => setProblemInput(v => (v.trim() ? v.trim() + '\n' : '') + h)}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary">{h}</button>
            ))}
          </div>
        )}

        {/* Aktionen */}
        <div className="flex items-center gap-2 flex-wrap">
          {!running ? (
            <button onClick={starten} disabled={gesamt === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              <Search size={15} />{gesamt} PC(s) scannen
            </button>
          ) : (
            <button onClick={cancel} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-red-500/40 text-red-300 text-sm hover:bg-red-500/10">
              <X size={15} />Abbrechen
            </button>
          )}
          {ergebnisse.length >= 2 && !running && (
            <button onClick={() => setVergleichOffen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary/40 text-primary text-sm hover:bg-primary/10">
              <Layers size={15} />Vergleich öffnen
            </button>
          )}
          {ergebnisse.length > 0 && !running && (
            <button onClick={clear} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-border text-muted-foreground text-sm hover:text-foreground">
              <Trash2 size={14} />Leeren
            </button>
          )}
        </div>

        {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</div>}

        {/* Fortschritt */}
        {running && (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-sm text-foreground"><Loader2 size={14} className="animate-spin text-primary" />Scanne {current}… ({done}/{total})</div>
            <div className="mt-2 h-1.5 rounded bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
          </div>
        )}

        {/* Ergebnisse */}
        {ergebnisse.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ergebnisse</div>
            {ergebnisse.map(l => {
              const bm = befundMap.get(l.pc)
              return (
                <div key={l.pc} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${l.rolle === 'problem' ? 'bg-red-500/15 text-red-300 border-red-500/40' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'}`}>
                    {l.rolle === 'problem' ? 'Problem' : 'Referenz'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-mono font-semibold text-foreground"><span className="inline-flex items-center gap-1">{l.pc}{l.pc && <DeviceInfoButton hostname={l.pc} />}</span></div>
                    <div className="text-[11px] text-muted-foreground truncate">{l.daten.adapter?.ifDesc || 'kein WLAN-Adapter'} · Treiber {l.daten.adapter?.driverVersion || '—'} · {l.daten.ereignisse?.disconnects ?? 0} Aussetzer/14T</div>
                  </div>
                  {bm && bm.hoch > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">{bm.hoch}× hoch</span>}
                  <span className="text-xs text-muted-foreground">{bm?.anz ?? 0} Befunde</span>
                  <button onClick={() => setAnalyse(l)} className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90">Analyse öffnen</button>
                </div>
              )
            })}
          </div>
        )}

        {/* Protokoll */}
        {runLog.length > 0 && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            {runLog.map((r, i) => <div key={i}><span className={r.ok ? 'text-emerald-400' : 'text-red-400'}>{r.ok ? '✓' : '✕'}</span> <span className="inline-flex items-center gap-1"><span className="font-mono">{r.pc}</span>{r.pc && <DeviceInfoButton hostname={r.pc} />}</span> — {r.text}</div>)}
          </div>
        )}

        {/* Verlauf */}
        {verlaufOffen && (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Verlauf (gespeicherte Läufe)</div>
            {verlauf.length === 0 && <div className="text-xs text-muted-foreground">Noch keine gespeicherten Läufe.</div>}
            <div className="max-h-72 overflow-auto divide-y divide-border/50">
              {verlauf.map(e => (
                <div key={e.pfad} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className={`text-[9px] px-1 py-0.5 rounded border ${e.rolle === 'problem' ? 'text-red-300 border-red-500/40' : 'text-emerald-300 border-emerald-500/40'}`}>{e.rolle === 'problem' ? 'P' : 'R'}</span>
                  <span className="inline-flex items-center gap-1"><span className="font-mono text-foreground">{e.pc}</span>{e.pc && <DeviceInfoButton hostname={e.pc} />}</span>
                  <span className="text-muted-foreground">{new Date(e.ranAt).toLocaleString('de-DE')}</span>
                  <span className="text-muted-foreground">{e.befunde} Bef. · {e.disconnects} Auss.</span>
                  <button onClick={() => verlaufOeffnen(e)} className="ml-auto text-primary hover:underline">öffnen</button>
                  <button onClick={() => deleteLauf(e.pfad).then(() => listLaeufe().then(setVerlauf))} className="text-muted-foreground hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        </>)}
      </div>

      {analyse && <NetAnalyse lauf={analyse} onClose={() => setAnalyse(null)} />}
      {vergleichOffen && <VergleichModal laeufe={ergebnisse} onClose={() => setVergleichOffen(false)} />}
    </div>
  )
}

// ── Vergleichs-Ansicht ───────────────────────────────────────────────────────
function VergleichModal({ laeufe, onClose }: { laeufe: NetLauf[]; onClose: () => void }) {
  const zeilen = useMemo(() => vergleiche(laeufe), [laeufe])
  const [nurAbw, setNurAbw] = useState(true)
  const gefiltert = nurAbw ? zeilen.filter(z => z.unterschiedlich || z.auffaellig) : zeilen
  const auffCount = zeilen.filter(z => z.auffaellig).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
          <Layers size={18} className="text-primary" />
          <div className="text-sm font-semibold text-foreground">Vergleich — {laeufe.length} PCs</div>
          <span className="text-[11px] text-red-300">{auffCount} auffällige Abweichung(en)</span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={nurAbw} onChange={e => setNurAbw(e.target.checked)} className="accent-primary" />nur Unterschiede
          </label>
          <button onClick={() => savePdf(buildVergleichPdf(laeufe, zeilen), 'Netzwerk_Vergleich.pdf')}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><FileDown size={13} />PDF</button>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="px-5 py-2 text-[11px] text-muted-foreground border-b border-border shrink-0">
          Rot markiert = Wert, den <b className="text-red-300">nur Problem-PCs</b> haben und <b className="text-emerald-300">kein Referenz-PC</b> → wahrscheinliche Ursache.
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 whitespace-nowrap">Einstellung</th>
                {laeufe.map(l => (
                  <th key={l.pc} className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1"><span className={l.rolle === 'problem' ? 'text-red-300' : 'text-emerald-300'}>{l.rolle === 'problem' ? '⚠ ' : '✓ '}{l.pc}</span>{l.pc && <DeviceInfoButton hostname={l.pc} />}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gefiltert.map(z => {
                const problemV = new Set(laeufe.filter(l => l.rolle === 'problem').map(l => z.werte[l.pc]))
                const refV = new Set(laeufe.filter(l => l.rolle === 'referenz').map(l => z.werte[l.pc]))
                return (
                  <tr key={z.key} className={`border-b border-border/40 ${z.auffaellig ? 'bg-red-500/5' : ''}`}>
                    <td className={`px-3 py-1.5 whitespace-nowrap ${z.auffaellig ? 'border-l-2 border-l-red-500 font-semibold text-foreground' : 'text-muted-foreground'}`}>{z.label}<span className="text-[9px] text-muted-foreground/60 ml-1">{z.gruppe}</span></td>
                    {laeufe.map(l => {
                      const v = z.werte[l.pc]
                      const auff = z.auffaellig && l.rolle === 'problem' && !refV.has(v) && v !== '—' && problemV.has(v)
                      return <td key={l.pc} className={`px-3 py-1.5 font-mono ${auff ? 'text-red-300 font-semibold' : (z.unterschiedlich ? 'text-foreground' : 'text-muted-foreground')}`}>{v}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
