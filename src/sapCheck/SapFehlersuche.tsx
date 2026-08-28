// ── SAP-Fehlersuche: Oberfläche (Kachel-Inhalt der PC-Diagnose) ───────────────
// Einzelscan + Vergleich (2 PCs / gegen Baseline) + Verlauf + Export + Ticket.
// Ergebnis-/Vergleichsansicht sind interne Unterkomponenten (bewusst eine Datei).

import { useCallback, useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import {
  ArrowLeft, Play, Square, Loader, Boxes, XCircle, AlertTriangle, Info, CheckCircle, HelpCircle,
  Copy, Check, FileDown, GitCompareArrows, Star, RotateCcw,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import type { InventoryItem } from '../types/auth'
import { runSapScan, type SapScanProgress } from './runScan'
import { compareScans } from './compare'
import { aktiveWartungsfenster } from './rules'
import { saveScan, listScans, loadScan, loadBaseline, setBaseline, loadRecentHosts, pushRecentHost } from './store'
import { ampelOf, sortBefunde, istKernursache, type SapScan, type SapBefund, type SapBewertung, type SapScanIndexItem, type SapVergleich } from './sapCheck.types'

const SEV_ICON: Record<SapBewertung, ReactNode> = {
  fehler: <XCircle size={14} className="text-red-400" />,
  warnung: <AlertTriangle size={14} className="text-amber-400" />,
  hinweis: <Info size={14} className="text-blue-400" />,
  ok: <CheckCircle size={14} className="text-emerald-400" />,
  unbekannt: <HelpCircle size={14} className="text-muted-foreground" />,
}
const SEV_LABEL: Record<SapBewertung, string> = { fehler: 'Fehler', warnung: 'Warnung', hinweis: 'Hinweis', ok: 'OK', unbekannt: 'Unbekannt' }

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
function fmt(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE') }

function scanToMarkdown(scan: SapScan): string {
  const a = ampelOf(scan.befunde)
  const lines = [
    `# SAP-Fehlersuche — ${scan.pc}`,
    `Zeitpunkt: ${fmt(scan.ranAt)} · Bearbeiter: ${scan.ranBy}`,
    `Ampel: ${a.fehler} Fehler · ${a.warnung} Warnungen · ${a.hinweis} Hinweise · ${a.ok} ok · ${a.unbekannt} unbekannt`, '',
  ]
  const sorted = sortBefunde(scan.befunde)
  for (const b of sorted) {
    lines.push(`## [${SEV_LABEL[b.bewertung]}] ${b.kategorie} — ${b.titel}`)
    lines.push(`- Messwert: ${b.wert}`)
    lines.push(`- Erwartung: ${b.erwartung}`)
    if (b.begruendung) lines.push(`- Begründung: ${b.begruendung}`)
    if (b.empfehlung) lines.push(`- Empfehlung: ${b.empfehlung}`)
    if (b.belege?.length) lines.push(`- Bekannt aus: ${b.belege.join(', ')}`)
    lines.push('')
  }
  return lines.join('\n')
}
function scanToTicket(scan: SapScan): string {
  const rel = sortBefunde(scan.befunde.filter(b => b.bewertung === 'fehler' || b.bewertung === 'warnung' || b.bewertung === 'hinweis'))
  const lines = [`SAP-Fehlersuche ${scan.pc} (${fmt(scan.ranAt)})`, '']
  for (const b of rel) lines.push(`- [${SEV_LABEL[b.bewertung]}] ${b.titel}: ${b.wert} (erwartet: ${b.erwartung})${b.empfehlung ? ' → ' + b.empfehlung : ''}${b.belege?.length ? ` [Bekannt aus: ${b.belege.join(', ')}]` : ''}`)
  if (!rel.length) lines.push('Keine Auffälligkeiten.')
  return lines.join('\n')
}

// ── Einzelergebnis ────────────────────────────────────────────────────────────
function ScanErgebnis({ scan }: { scan: SapScan }) {
  const [copied, setCopied] = useState('')
  const a = ampelOf(scan.befunde)
  const sorted = sortBefunde(scan.befunde)
  const folgefehler = scan.befunde.some(b => b.bewertung === 'fehler' && istKernursache(b))
  const copy = (id: string, text: string) => { navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(''), 1500) }) }
  async function exportFile(kind: 'md' | 'json') {
    const content = kind === 'md' ? scanToMarkdown(scan) : JSON.stringify(scan, null, 2)
    const name = `sapscan_${scan.pc}_${scan.ranAt.slice(0, 16).replace(/[:T]/g, '-')}.${kind}`
    const path = await api().saveFileDialog(name, [{ name: kind.toUpperCase(), extensions: [kind] }])
    if (path) await api().writeFile(path, utf8ToBase64(content))
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap bg-card border border-border rounded-lg p-3">
        <span className="text-sm font-semibold text-foreground">{scan.pc}</span>
        <span className="text-[11px] text-muted-foreground">{fmt(scan.ranAt)} · {(scan.meta.dauerMs / 1000).toFixed(0)}s</span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-red-400">{a.fehler} Fehler</span>·<span className="text-amber-400">{a.warnung} Warn.</span>·
          <span className="text-blue-400">{a.hinweis} Hinweise</span>·<span className="text-emerald-400">{a.ok} ok</span>·
          <span className="text-muted-foreground">{a.unbekannt} unbek.</span>
        </span>
        <button onClick={() => copy('ticket', scanToTicket(scan))} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground">
          {copied === 'ticket' ? <Check size={11} /> : <Copy size={11} />}Für Ticket
        </button>
        <button onClick={() => exportFile('md')} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground"><FileDown size={11} />MD</button>
        <button onClick={() => exportFile('json')} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground"><FileDown size={11} />JSON</button>
      </div>
      {folgefehler && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-2.5 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground">Ein <span className="text-red-300 font-medium">Fehler in einer Kernursache</span> (Kerberos/SNC · Zscaler-Anmeldung · Konfigurationsfreigabe) liegt vor — die übrigen Befunde sind vermutlich Folgefehler. Zuerst diesen beheben.</p>
        </div>
      )}
      {sorted.map(b => (
        <div key={b.id} className={`rounded-lg border p-3 ${b.bewertung === 'fehler' ? 'border-red-500/40 bg-red-500/5' : b.bewertung === 'warnung' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-card'}`}>
          <div className="flex items-start gap-2">
            {SEV_ICON[b.bewertung]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{b.titel} <span className="text-[10px] text-muted-foreground">· {b.kategorie}</span></p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Messwert: <span className="text-foreground">{b.wert}</span> · Erwartung: {b.erwartung}</p>
              {b.begruendung && <p className="text-[11px] text-muted-foreground mt-1">{b.begruendung}</p>}
              {b.empfehlung && <p className="text-[11px] text-blue-300 mt-1">Empfehlung: {b.empfehlung}</p>}
              {b.belege?.length ? <p className="text-[10px] text-amber-300/80 mt-1">Bekannt aus: {b.belege.join(', ')}</p> : null}
              {b.rawData && <details className="mt-1"><summary className="text-[10px] text-muted-foreground cursor-pointer">Rohdaten</summary><pre className="mt-1 text-[10px] bg-muted/30 rounded p-2 overflow-x-auto max-h-60 whitespace-pre-wrap">{b.rawData}</pre></details>}
            </div>
            <button onClick={() => copy(b.id, `${b.titel}: ${b.wert} (erwartet ${b.erwartung})${b.empfehlung ? ' → ' + b.empfehlung : ''}`)} className="shrink-0 p-1 rounded text-muted-foreground/60 hover:text-foreground">
              {copied === b.id ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Vergleich ─────────────────────────────────────────────────────────────────
function VergleichsAnsicht({ v }: { v: SapVergleich }) {
  const [filter, setFilter] = useState<'diff' | 'auff' | 'alle'>('diff')
  const rows = v.zeilen.filter(z => filter === 'alle' ? true : filter === 'diff' ? z.unterschied : z.beideAuffaellig || z.unterschied)
  const gemeinsam = v.zeilen.filter(z => z.beideAuffaellig && !z.unterschied)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Filter:</span>
        {([['diff', 'Nur Unterschiede'], ['auff', 'Nur Auffälligkeiten'], ['alle', 'Alle']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-2 py-1 rounded-md border ${filter === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>{l}</button>
        ))}
      </div>
      {v.massenereignis.length > 0 && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <p className="text-xs font-semibold text-red-300 mb-1 flex items-center gap-1"><AlertTriangle size={12} />Muster eines Massenereignisses ({v.massenereignis.length})</p>
          <p className="text-[11px] text-muted-foreground">Gleiches Symptom auf beiden Clients bei Kerberos/SNC/DNS/Konfigurationsfreigabe. Historisches Beispiel: 27.04.–26.05.2026, rund 50 Clients, Ursache SNC-Umstellung an P47/P57. Nicht als Einzelfall behandeln.</p>
          <ul className="mt-1 text-[11px] text-foreground list-disc pl-4">{v.massenereignis.slice(0, 8).map(z => <li key={z.id}>{z.titel}: {z.wertA}</li>)}</ul>
        </div>
      )}
      {gemeinsam.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold text-amber-300 mb-1">Gemeinsamer Nenner ({gemeinsam.length}) — auf beiden PCs auffällig</p>
          <p className="text-[11px] text-muted-foreground">Gleiches Symptom auf beiden Clients → Ursache liegt eher im Netz oder im SAP-System als am einzelnen PC.</p>
          <ul className="mt-1 text-[11px] text-foreground list-disc pl-4">{gemeinsam.slice(0, 8).map(z => <li key={z.id}>{z.titel}: {z.wertA}</li>)}</ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
            <th className="text-left py-1.5 pr-2">Prüfpunkt</th><th className="text-left px-2">{v.a.pc}</th><th className="text-left px-2">{v.b.pc}</th>
          </tr></thead>
          <tbody>
            {rows.map(z => (
              <tr key={z.id} className={`border-b border-border/40 ${z.unterschied ? 'bg-amber-500/5' : ''}`}>
                <td className="py-1.5 pr-2 text-foreground">{z.titel}<span className="block text-[9px] text-muted-foreground">{z.kategorie}{z.nichtVergleichbar ? ' · nicht vergleichbar' : ''}</span></td>
                <td className="px-2"><span className="inline-flex items-center gap-1">{SEV_ICON[z.bewertungA]}{z.wertA}</span></td>
                <td className="px-2"><span className="inline-flex items-center gap-1">{SEV_ICON[z.bewertungB]}{z.wertB}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-muted-foreground">Keine Zeilen für diesen Filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function SapFehlersuche({ onBack }: { onBack: () => void }) {
  const session = useAuthStore(s => s.session)
  const by = session?.user.displayName || session?.user.username || 'unbekannt'
  const [hostA, setHostA] = useState('')
  const [hostB, setHostB] = useState('')
  const [compareMode, setCompareMode] = useState(false)
  const [days, setDays] = useState(7)
  const [scanning, setScanning] = useState(false)
  const [progA, setProgA] = useState<Record<string, SapScanProgress>>({})
  const [progB, setProgB] = useState<Record<string, SapScanProgress>>({})
  const [scanA, setScanA] = useState<SapScan | null>(null)
  const [scanB, setScanB] = useState<SapScan | null>(null)
  const [error, setError] = useState('')
  const [names, setNames] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>(loadRecentHosts())
  const [history, setHistory] = useState<SapScanIndexItem[]>([])
  const abortRef = useRef(false)

  useEffect(() => {
    (async () => {
      try { const inv = await api().netReadJson<InventoryItem[]>('inventory/inventory.json'); setNames((Array.isArray(inv) ? inv : []).map(i => i.name).filter(Boolean)) } catch { /* egal */ }
    })()
  }, [])
  const refreshHistory = useCallback(async (pc: string) => { if (pc.trim()) setHistory(await listScans(pc.trim())) }, [])
  useEffect(() => { void refreshHistory(hostA) }, [hostA, refreshHistory])

  const vergleich = scanA && scanB ? compareScans(scanA, scanB) : null

  async function start() {
    if (scanning) return
    setError(''); setScanA(null); setScanB(null); setProgA({}); setProgB({})
    setScanning(true); abortRef.current = false
    const onProg = (set: Dispatch<SetStateAction<Record<string, SapScanProgress>>>) => (p: SapScanProgress) => set(prev => ({ ...prev, [p.id]: p }))
    try {
      const tasks = [runSapScan(hostA, by, { days, onProgress: onProg(setProgA), isAborted: () => abortRef.current })]
      if (compareMode && hostB.trim()) tasks.push(runSapScan(hostB, by, { days, onProgress: onProg(setProgB), isAborted: () => abortRef.current }))
      const [ra, rb] = await Promise.all(tasks)
      if (ra.ok && ra.scan) { setScanA(ra.scan); pushRecentHost(hostA); setRecent(loadRecentHosts()); void saveScan(ra.scan) }
      else if (!abortRef.current) setError(ra.error || 'Scan fehlgeschlagen.')
      if (rb) { if (rb.ok && rb.scan) { setScanB(rb.scan); pushRecentHost(hostB); void saveScan(rb.scan) } else if (!ra.error && !abortRef.current) setError(rb.error || 'Vergleichs-Scan fehlgeschlagen.') }
      await refreshHistory(hostA)
    } finally { setScanning(false) }
  }
  function cancel() { abortRef.current = true; void api().cancelAll(); setScanning(false) }

  async function compareWithBaseline() {
    const base = await loadBaseline(hostA.trim())
    if (!base) { setError('Keine Baseline für diesen PC gesetzt.'); return }
    if (scanA) setScanB(base)
  }
  async function openHistory(id: string, asB: boolean) {
    const sc = await loadScan(id); if (!sc) return
    if (asB) setScanB(sc); else { setScanA(sc); setScanB(null) }
  }

  const progList = (rec: Record<string, SapScanProgress>) => Object.values(rec)
  const dl = 'sap-hosts'

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />Zurück</button>
        <Boxes size={18} className="text-primary" /><h2 className="text-base font-bold text-foreground">SAP Fehlersuche</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Eingabe */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-3 max-w-2xl">
          <datalist id={dl}>{[...new Set([...recent, ...names])].slice(0, 200).map(n => <option key={n} value={n} />)}</datalist>
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-muted-foreground mb-1">PC-Name / IP {compareMode && '(A)'}</label>
              <input list={dl} value={hostA} onChange={e => setHostA(e.target.value)} placeholder="z. B. DEHAM12345678"
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:border-primary" />
            </div>
            {compareMode && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-muted-foreground mb-1">PC-Name / IP (B)</label>
                <input list={dl} value={hostB} onChange={e => setHostB(e.target.value)} placeholder="zweiter PC"
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:border-primary" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} className="rounded accent-primary" />Zweiten PC vergleichen
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Ereignis-Zeitraum:
              <select value={days} onChange={e => setDays(Number(e.target.value))} className="rounded-md border border-border bg-background text-foreground px-1.5 py-1 text-xs">
                <option value={1}>1 Tag</option><option value={7}>7 Tage</option><option value={30}>30 Tage</option>
              </select>
            </label>
            {!scanning ? (
              <button onClick={start} disabled={!hostA.trim() || (compareMode && !hostB.trim())}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                {compareMode ? <GitCompareArrows size={14} /> : <Play size={14} />}{compareMode ? 'Vergleichen' : 'Prüfen'}
              </button>
            ) : (
              <button onClick={cancel} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"><Square size={14} />Abbrechen</button>
            )}
            {scanA && !scanning && <button onClick={compareWithBaseline} className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent"><GitCompareArrows size={12} />Gegen Baseline</button>}
          </div>
          {error && <p className="text-xs text-red-400 flex items-center gap-1"><XCircle size={12} />{error}</p>}
        </div>

        {/* Fortschritt */}
        {scanning && (
          <div className="max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[['A', hostA, progList(progA)], ['B', hostB, progList(progB)]].filter((_, i) => i === 0 || compareMode).map(([lbl, host, list]) => (
              <div key={lbl as string} className="bg-card border border-border rounded-lg p-3">
                <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1"><Loader size={12} className="animate-spin text-blue-400" />{host as string}</p>
                <div className="space-y-1">
                  {(list as SapScanProgress[]).map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-[11px]">
                      {p.status === 'läuft' ? <Loader size={10} className="animate-spin text-blue-400" /> : p.status === 'fertig' ? <CheckCircle size={10} className="text-emerald-400" /> : p.status === 'fehler' ? <HelpCircle size={10} className="text-muted-foreground" /> : <span className="w-2.5" />}
                      <span className="text-muted-foreground">{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Regel 15 — Wartungsfenster-Banner */}
        {!scanning && (scanA || vergleich) && aktiveWartungsfenster().length > 0 && (
          <div className="max-w-2xl rounded-lg border border-blue-500/40 bg-blue-500/5 p-3 flex items-start gap-2">
            <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground">Aktuell läuft ein gepflegtes SAP-Wartungsfenster ({aktiveWartungsfenster().map(w => `${w.system}: ${w.text}`).join(' · ')}) — Symptome können daran liegen, nicht am Client.</p>
          </div>
        )}

        {/* Ergebnis / Vergleich */}
        {!scanning && vergleich && <VergleichsAnsicht v={vergleich} />}
        {!scanning && !vergleich && scanA && (
          <>
            <ScanErgebnis scan={scanA} />
            {history.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Verlauf ({hostA})</p>
                <div className="space-y-1">
                  {history.map(h => (
                    <div key={h.id} className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground flex-1">{fmt(h.ranAt)} · {h.ampel.fehler}F/{h.ampel.warnung}W {h.isBaseline && <Star size={9} className="inline text-amber-400" />}</span>
                      <button onClick={() => openHistory(h.id, true)} className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent">vergleichen</button>
                      <button onClick={() => openHistory(h.id, false)} className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent"><RotateCcw size={10} /></button>
                      <button onClick={() => { void setBaseline(h.id, !h.isBaseline).then(() => refreshHistory(hostA)) }} title="Als Baseline markieren" className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent"><Star size={10} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
