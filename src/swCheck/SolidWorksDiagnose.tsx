// ── SolidWorks-Diagnose: Kachel-Inhalt der PC-Diagnose ───────────────────────
// Mehrere PCs (Endgeräte-Übersicht, Filter Typ/Status wie in der GPU-Verwaltung)
// ODER Einzel-Host/IP. Gewählte Skripte remote ausführen, Ergebnis je PC ablegen,
// Verlauf/Vergleich, und „Alles exportieren" als einer Sammel-.md/.json.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Wrench, Play, Square, Loader, ListChecks, Server, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, HelpCircle, Copy, Check, FileDown, GitCompareArrows, Star, RotateCcw, Trash2,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import { useSwScanStore } from '../store/swScanStore'
import { loadDevices, classifyModel, MODEL_CATEGORIES, type EndpointDevice } from '../services/endpointDevices'
import { SW_SKRIPTE } from './scripts'
import { listLaeufe, loadLauf, setReferenz, deleteLauf, loadForExport, loadRecentHosts } from './store'
import { buildExport } from './export'
import { buildLaufPdf, buildSammelPdf, savePdf, pdfBase64, laufDateiStamm, type BesitzerMap } from './pdf'
import { probeHosts, type HostStatus } from './statusProbe'
import type { SwLauf, SwLaufIndexItem, SwKennwerte } from './swCheck.types'

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
function fmt(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE') }

// SolidWorks-Prozess-Abzeichen: läuft (grün) / läuft nicht (gedämpft) / nicht abfragbar.
function SwBadge({ state }: { state: HostStatus['sw'] }) {
  if (state === 'running') return <span title="SolidWorks läuft gerade (idealer Scan-Zeitpunkt)" className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />SW</span>
  if (state === 'idle') return <span title="SolidWorks läuft nicht" className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-muted/40 text-muted-foreground border border-border">SW</span>
  return <span title="SolidWorks-Status nicht abfragbar (DCOM/Firewall)" className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] text-muted-foreground/60 border border-border/60">SW?</span>
}

// ── Einzelergebnis eines Laufs ────────────────────────────────────────────────
function LaufErgebnis({ lauf, besitzerMap }: { lauf: SwLauf; besitzerMap?: BesitzerMap }) {
  const [copied, setCopied] = useState('')
  const copy = (id: string, text: string) => { navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(''), 1500) }) }
  const stem = laufDateiStamm(lauf, besitzerMap)   // SWDiagnose_<PC>_<Anwender>_<Zeit>
  async function exportTxt() {
    const kopf = `SolidWorks-Diagnose ${lauf.pc} (IP ${lauf.kennwerte?.ip || '—'}) · ${fmt(lauf.ranAt)} · ${lauf.ranBy}\nAuffälligkeiten (${lauf.auffaelligkeiten.length}):\n${lauf.auffaelligkeiten.map(a => '  - ' + a).join('\n') || '  (keine)'}\n`
    const text = kopf + '\n' + lauf.skripte.map(s => `${'='.repeat(70)}\n${s.titel}\n${'='.repeat(70)}\n${s.ok ? s.textBericht : 'FEHLER: ' + (s.fehler || '')}`).join('\n\n')
    const path = await api().saveFileDialog(`${stem}.txt`, [{ name: 'Text', extensions: ['txt'] }])
    if (path) await api().writeFile(path, utf8ToBase64(text))
  }
  async function exportPdf() { await savePdf(buildLaufPdf(lauf, besitzerMap), `${stem}.pdf`) }
  const alleText = lauf.skripte.map(s => s.textBericht).join('\n\n')
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap bg-card border border-border rounded-lg p-3">
        <span className="text-sm font-semibold text-foreground font-mono">{lauf.pc}</span>
        <span className="text-[11px] text-muted-foreground">{fmt(lauf.ranAt)} · {(lauf.dauerMs / 1000).toFixed(0)}s</span>
        <span className={`text-xs ${lauf.auffaelligkeiten.length ? 'text-amber-400' : 'text-emerald-400'}`}>{lauf.auffaelligkeiten.length} Auffälligkeiten</span>
        <button onClick={() => copy('all', alleText)} className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground">{copied === 'all' ? <Check size={11} /> : <Copy size={11} />}Bericht kopieren</button>
        <button onClick={exportPdf} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground"><FileDown size={11} />PDF</button>
        <button onClick={exportTxt} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground"><FileDown size={11} />TXT</button>
      </div>

      {lauf.auffaelligkeiten.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1"><AlertTriangle size={12} />Auffälligkeiten ({lauf.auffaelligkeiten.length})</p>
          <ul className="text-[11px] text-foreground list-disc pl-4 space-y-0.5">{lauf.auffaelligkeiten.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      {lauf.skripte.map(s => (
        <div key={s.id} className={`rounded-lg border p-3 ${s.ok ? 'border-border bg-card' : 'border-red-500/40 bg-red-500/5'}`}>
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            {s.ok ? <CheckCircle size={13} className="text-emerald-400" /> : <XCircle size={13} className="text-red-400" />}
            {s.titel} <span className="text-[10px] text-muted-foreground">· {s.ziel}</span>
            {!s.ok && <span className="text-[11px] text-red-300">— {s.fehler}</span>}
          </p>
          {s.ok && s.textBericht && (
            <details className="mt-1.5" open>
              <summary className="text-[10px] text-muted-foreground cursor-pointer">Textbericht</summary>
              <pre className="mt-1 text-[10px] bg-muted/30 rounded p-2 overflow-x-auto max-h-96 whitespace-pre-wrap">{s.textBericht}</pre>
            </details>
          )}
          {s.ok && s.daten && (
            <details className="mt-1">
              <summary className="text-[10px] text-muted-foreground cursor-pointer">Rohdaten (JSON)</summary>
              <pre className="mt-1 text-[10px] bg-muted/30 rounded p-2 overflow-x-auto max-h-72 whitespace-pre-wrap">{JSON.stringify(s.daten, null, 2)}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Vergleich zweier Läufe ────────────────────────────────────────────────────
const KENN_LABELS: [keyof SwKennwerte, string][] = [
  ['swVersion', 'SW-Version'], ['benutzer', 'Benutzer'], ['toolboxPfad', 'Toolbox'], ['autoRecover', 'AutoRecover'],
  ['backupPfad', 'Backup'], ['defenderSw', 'Defender SW'], ['defenderPortaX', 'Defender C:\\PortaX'],
  ['energieplan', 'Energieplan'], ['adapterEnergie', 'Adapter-Energie'], ['latenzW3143', 'Latenz w3143'],
  ['cFreiPct', 'C: frei %'], ['gpu', 'GPU'], ['uptimeTage', 'Uptime'], ['abstuerze30d', 'Abstürze 30T'],
]
function VergleichAnsicht({ a, b }: { a: SwLauf; b: SwLauf }) {
  const ka = a.kennwerte ?? {}, kb = b.kennwerte ?? {}
  const rows = KENN_LABELS.map(([key, label]) => ({ label, va: ka[key], vb: kb[key], diff: String(ka[key] ?? '') !== String(kb[key] ?? '') }))
  const nurNeu = b.auffaelligkeiten.filter(x => !a.auffaelligkeiten.includes(x))
  const behoben = a.auffaelligkeiten.filter(x => !b.auffaelligkeiten.includes(x))
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        Vergleich <span className="font-mono text-foreground">{a.pc}</span> {fmt(a.ranAt)} ↔ {fmt(b.ranAt)}
      </div>
      {(nurNeu.length > 0 || behoben.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <p className="text-xs font-semibold text-red-300 mb-1">Neu ({nurNeu.length})</p>
            <ul className="text-[11px] text-foreground list-disc pl-4">{nurNeu.map((x, i) => <li key={i}>{x}</li>)}{!nurNeu.length && <li className="list-none text-muted-foreground">—</li>}</ul>
          </div>
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
            <p className="text-xs font-semibold text-emerald-300 mb-1">Behoben ({behoben.length})</p>
            <ul className="text-[11px] text-foreground list-disc pl-4">{behoben.map((x, i) => <li key={i}>{x}</li>)}{!behoben.length && <li className="list-none text-muted-foreground">—</li>}</ul>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-[10px] uppercase text-muted-foreground border-b border-border"><th className="text-left py-1.5 pr-2">Kennwert</th><th className="text-left px-2">{fmt(a.ranAt)}</th><th className="text-left px-2">{fmt(b.ranAt)}</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className={`border-b border-border/40 ${r.diff ? 'bg-amber-500/5' : ''}`}>
                <td className="py-1.5 pr-2 text-foreground">{r.label}</td>
                <td className="px-2 text-muted-foreground">{String(r.va ?? '—')}</td>
                <td className="px-2 text-muted-foreground">{String(r.vb ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function SolidWorksDiagnose({ onBack }: { onBack: () => void }) {
  const session = useAuthStore(s => s.session)
  const by = session?.user.displayName || session?.user.username || 'unbekannt'

  const [mode, setMode] = useState<'endpoint' | 'manual'>('endpoint')
  const [devices, setDevices] = useState<EndpointDevice[]>([])
  const [modelFilter, setModelFilter] = useState<string>('Desktop Workstation')
  const [stateFilter, setStateFilter] = useState('')
  const [substateFilter, setSubstateFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualInput, setManualInput] = useState('')

  const [skriptSel, setSkriptSel] = useState<Set<string>>(new Set(SW_SKRIPTE.filter(s => s.standard).map(s => s.id)))
  const [server, setServer] = useState('w3143')

  // Scan-Zustand kommt aus dem Hintergrund-Store (läuft bei Menüwechsel weiter).
  const running = useSwScanStore(s => s.running)
  const prog = useSwScanStore(s => s.prog)
  const ergebnisse = useSwScanStore(s => s.ergebnisse)
  const runLog = useSwScanStore(s => s.runLog)
  const scanError = useSwScanStore(s => s.error)
  const finishedTick = useSwScanStore(s => s.finishedTick)
  const startScan = useSwScanStore(s => s.run)
  const cancelScan = useSwScanStore(s => s.cancel)
  const [offenPc, setOffenPc] = useState<string>('')
  const [historyLauf, setHistoryLauf] = useState<SwLauf | null>(null)  // aus Verlauf geöffneter Lauf
  const [error, setError] = useState('')          // nur Export-/UI-Fehler
  const [notice, setNotice] = useState('')        // Export-Erfolgsmeldung (grün)
  const prevRunning = useRef(false)

  const [history, setHistory] = useState<SwLaufIndexItem[]>([])
  const [vergleich, setVergleich] = useState<{ a: SwLauf; b: SwLauf } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [mitEinzel, setMitEinzel] = useState(true)
  const [nurLetzter, setNurLetzter] = useState(true)
  const [nurAusgewaehlte, setNurAusgewaehlte] = useState(false)

  // Live-Status der PC-Auswahl (Ping + SolidWorks-Prozess), Key = hostname.toLowerCase().
  const [statusMap, setStatusMap] = useState<Map<string, HostStatus>>(new Map())
  const [probing, setProbing] = useState(false)
  const [statusAt, setStatusAt] = useState('')
  const probingRef = useRef(false)   // läuft gerade eine Prüfung? (stale-closure-sicher, kein Overlap)
  const rerunRef = useRef(false)     // Filter änderte sich während der Prüfung → danach einmal neu prüfen

  useEffect(() => { loadDevices().then(setDevices).catch(() => {}); setHistory([]) }, [])
  const recent = useMemo(() => loadRecentHosts(), [ergebnisse])
  // PC → zugewiesener Besitzer (Fallback-Anwender im Dateinamen/Kopf/Inhaltsverz., falls kein angemeldeter Benutzer).
  const besitzerMap = useMemo<BesitzerMap>(() => new Map(devices.map(d => [d.hostname.toLowerCase(), d.assignedTo || ''])), [devices])

  const endpointCandidates = useMemo(() => devices
    .filter(d => d.hostname.trim())
    .filter(d => !modelFilter || classifyModel(d.model) === modelFilter)
    .filter(d => !stateFilter || d.state === stateFilter)
    .filter(d => !substateFilter || d.substate === substateFilter)
    .sort((a, b) => a.hostname.localeCompare(b.hostname)), [devices, modelFilter, stateFilter, substateFilter])
  const distinctStates = useMemo(() => Array.from(new Set(devices.map(d => d.state).filter(Boolean))).sort(), [devices])
  const distinctSubstates = useMemo(() => Array.from(new Set(devices.map(d => d.substate).filter(Boolean))).sort(), [devices])

  const manualHosts = useMemo(() => Array.from(new Set(manualInput.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))), [manualInput])
  const hostsToScan = useMemo(() => mode === 'manual' ? manualHosts : endpointCandidates.filter(d => selected.has(d.hostname)).map(d => d.hostname), [mode, manualHosts, endpointCandidates, selected])

  function toggle(host: string) { setSelected(prev => { const n = new Set(prev); n.has(host) ? n.delete(host) : n.add(host); return n }) }
  function toggleSkript(id: string) { setSkriptSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  // Erreichbarkeit + SolidWorks-Prozess der gefilterten PCs prüfen (read-only, kein WinRM).
  // Es läuft nie mehr als eine Prüfung gleichzeitig (Leistungsregel ≤10 parallel);
  // ändert sich der Filter währenddessen, wird danach genau einmal neu geprüft.
  const mergeStatus = (part: Map<string, HostStatus>) =>
    setStatusMap(prev => { const next = new Map(prev); for (const [k, v] of part) next.set(k, v); return next })
  async function checkStatus() {
    const hosts = endpointCandidates.map(d => d.hostname).filter(Boolean)
    if (!hosts.length) return
    if (probingRef.current) { rerunRef.current = true; return }
    probingRef.current = true; setProbing(true); setError('')
    try {
      const full = await probeHosts(hosts, mergeStatus)   // Zwischenstände fortlaufend anzeigen
      mergeStatus(full); setStatusAt(new Date().toISOString())
    } catch (e) { setError('Statusprüfung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))) }
    finally {
      probingRef.current = false; setProbing(false)
      if (rerunRef.current) { rerunRef.current = false; void checkStatusRef.current() }
    }
  }
  // Stabiler Zugriff auf die jeweils aktuelle checkStatus-Closure (für die Auto-Prüfung).
  const checkStatusRef = useRef(checkStatus)
  checkStatusRef.current = checkStatus
  // Automatisch prüfen, sobald die (gefilterte) Geräteliste steht bzw. sich ändert –
  // damit man den Status ohne Klick sieht. 500 ms Entprellung gegen schnelle Filterwechsel.
  const candidateKey = useMemo(() => endpointCandidates.map(d => d.hostname).join(','), [endpointCandidates])
  useEffect(() => {
    if (mode !== 'endpoint' || !candidateKey) return
    const t = setTimeout(() => { void checkStatusRef.current() }, 500)
    return () => clearTimeout(t)
  }, [mode, candidateKey])

  const refreshHistory = useCallback(async (pc: string) => { if (pc.trim()) setHistory(await listLaeufe(pc.trim())) }, [])

  // Scan im Hintergrund starten (läuft weiter bei Menüwechsel).
  function start() {
    setError(''); setVergleich(null); setOffenPc('')
    void startScan(hostsToScan, by, { skripte: Array.from(skriptSel), server })
  }
  // Nach Abschluss (running true→false): bei Einzel-PC öffnen + Verlauf aktualisieren.
  useEffect(() => {
    if (prevRunning.current && !running && ergebnisse.length === 1) {
      setOffenPc(ergebnisse[0].pc); void refreshHistory(ergebnisse[0].pc)
    }
    prevRunning.current = running
  }, [running, ergebnisse, refreshHistory])
  // Verlauf laden: offener PC, sonst der einzeln gewählte PC (auch ohne Scan → jederzeit löschbar).
  useEffect(() => {
    if (running) return
    const pc = offenPc || (hostsToScan.length === 1 ? hostsToScan[0] : '')
    if (pc) void refreshHistory(pc); else setHistory([])
  }, [offenPc, hostsToScan, running, finishedTick, refreshHistory])

  async function openVergleich(item: SwLaufIndexItem) {
    const base = ergebnisse.find(e => e.pc === item.pc) ?? await loadLauf(item)
    const other = await loadLauf(item)
    if (base && other && base.id !== other.id) setVergleich({ a: other, b: base })
    else if (other) { const cur = ergebnisse.find(e => e.pc === item.pc); if (cur) setVergleich({ a: other, b: cur }) }
  }
  async function openHistoryLauf(item: SwLaufIndexItem) {
    const l = await loadLauf(item); if (l) { setHistoryLauf(l); setOffenPc(l.pc); setVergleich(null) }
  }
  async function removeHistory(item: SwLaufIndexItem) {
    if (!window.confirm(`Bericht vom ${fmt(item.ranAt)} für ${item.pc} löschen?`)) return
    await deleteLauf(item)
    if (historyLauf?.id === item.id) setHistoryLauf(null)
    void refreshHistory(item.pc)
  }

  async function exportAll(format: 'pdf-sammel' | 'pdf-einzeln' | 'mdjson') {
    if (exporting) return
    setExporting(true); setError(''); setNotice('')
    try {
      const pcs = nurAusgewaehlte ? Array.from(new Set([...ergebnisse.map(e => e.pc), ...hostsToScan])) : undefined
      const laeufe = await loadForExport({ nurLetzter, pcs })
      if (!laeufe.length) { setError('Keine gespeicherten Läufe zum Exportieren gefunden.'); return }
      const tag = new Date().toISOString().slice(0, 10)
      if (format === 'pdf-sammel') {
        // Ein Sammel-PDF: Seite 1 = Inhaltsverzeichnis, danach je PC ein Abschnitt (PC + Anwender).
        const ok = await savePdf(buildSammelPdf(laeufe, { mitEinzelberichten: mitEinzel }, besitzerMap), `SolidWorks-Sammelbericht_${tag}.pdf`)
        if (ok) setNotice(`Sammelbericht mit ${laeufe.length} PC(s) gespeichert.`)
      } else if (format === 'pdf-einzeln') {
        // Je PC eine eigene PDF. Ein PC → Dialog; mehrere → Zielordner wählen, alle hineinschreiben.
        if (laeufe.length === 1) {
          const ok = await savePdf(buildLaufPdf(laeufe[0], besitzerMap), `${laufDateiStamm(laeufe[0], besitzerMap)}.pdf`)
          if (ok) setNotice('1 PDF gespeichert.')
        } else {
          const dir = await api().selectDirectory()
          if (!dir) return
          let ok = 0
          for (const l of laeufe) {
            const r = await api().writeFile(`${dir}\\${laufDateiStamm(l, besitzerMap)}.pdf`, pdfBase64(buildLaufPdf(l, besitzerMap)))
            if (r.success) ok++
          }
          if (ok < laeufe.length) setError(`${ok}/${laeufe.length} PDFs gespeichert — ${laeufe.length - ok} fehlgeschlagen.`)
          else setNotice(`${ok} PDF(s) in „${dir}" gespeichert.`)
        }
      } else {
        const { md, json, name } = buildExport(laeufe, { mitEinzelberichten: mitEinzel })
        const path = await api().saveFileDialog(`${name}.md`, [{ name: 'Markdown', extensions: ['md'] }])
        if (path) {
          await api().writeFile(path, utf8ToBase64(md))
          await api().writeFile(path.replace(/\.md$/i, '.json'), utf8ToBase64(JSON.stringify(json, null, 2)))
          setNotice('Markdown + JSON gespeichert.')
        }
      }
    } catch (e) { setError('Export fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setExporting(false) }
  }

  const offenerLauf = historyLauf ?? ergebnisse.find(e => e.pc === offenPc) ?? ergebnisse[0]

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />Zurück</button>
        <Wrench size={18} className="text-primary" /><h2 className="text-base font-bold text-foreground">SolidWorks Diagnose</h2>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => exportAll('pdf-sammel')} disabled={exporting} title="Ein Sammel-PDF über alle PCs — Seite 1 mit klickbarem Inhaltsverzeichnis, danach je PC ein Abschnitt (PC + Anwender)" className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
            {exporting ? <Loader size={12} className="animate-spin" /> : <FileDown size={12} />}Sammel-PDF
          </button>
          <button onClick={() => exportAll('pdf-einzeln')} disabled={exporting} title="Je PC eine eigene PDF (Dateiname = PC + Anwender). Bei mehreren PCs: Zielordner wählen." className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
            <FileDown size={12} />Je PC eine PDF
          </button>
          <button onClick={() => exportAll('mdjson')} disabled={exporting} title="Alle Berichte als Markdown + JSON" className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-40">
            <FileDown size={12} />MD+JSON
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* 1 · Geräteauswahl */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-3 max-w-3xl">
          <div className="flex items-center gap-2"><ListChecks size={15} className="text-primary" /><h3 className="text-sm font-bold text-foreground">1 · PCs auswählen</h3></div>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button onClick={() => setMode('endpoint')} className={`px-3 py-1.5 ${mode === 'endpoint' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Aus Endgeräte-Übersicht</button>
            <button onClick={() => setMode('manual')} className={`px-3 py-1.5 border-l border-border ${mode === 'manual' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Einzeln (Hostname/IP)</button>
          </div>

          {mode === 'endpoint' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Typ:</span>
                {(['', ...MODEL_CATEGORIES] as string[]).map(cat => (
                  <button key={cat || 'all'} onClick={() => setModelFilter(cat)} className={`text-[11px] px-2 py-1 rounded-full border ${modelFilter === cat ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted-foreground border-border hover:text-foreground'}`}>{cat || 'Alle'}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <label className="flex items-center gap-1.5"><span className="text-muted-foreground">Status:</span>
                  <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground"><option value="">Alle</option>{distinctStates.map(s => <option key={s} value={s}>{s}</option>)}</select>
                </label>
                <label className="flex items-center gap-1.5"><span className="text-muted-foreground">Verwendung:</span>
                  <select value={substateFilter} onChange={e => setSubstateFilter(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground"><option value="">Alle</option>{distinctSubstates.map(s => <option key={s} value={s}>{s}</option>)}</select>
                </label>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button onClick={() => setSelected(new Set(endpointCandidates.map(d => d.hostname)))} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Alle auswählen</button>
                <button onClick={() => setSelected(new Set())} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Keine</button>
                <span className="text-muted-foreground ml-1">{selected.size} von {endpointCandidates.length} ausgewählt</span>
                <button onClick={checkStatus} disabled={probing || endpointCandidates.length === 0} title="Erreichbarkeit (Ping) und ob SolidWorks gerade läuft für die gefilterten PCs prüfen" className="ml-auto flex items-center gap-1 px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                  {probing ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}Status prüfen
                </button>
                {statusAt && !probing && <span className="text-muted-foreground/70 shrink-0">geprüft {new Date(statusAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                {endpointCandidates.length === 0 && <div className="p-3 text-[12px] text-muted-foreground">Keine Geräte für diesen Filter.</div>}
                {endpointCandidates.map(d => {
                  const st = statusMap.get(d.hostname.toLowerCase())
                  return (
                  <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-muted/20 cursor-pointer">
                    <input type="checkbox" checked={selected.has(d.hostname)} onChange={() => toggle(d.hostname)} className="accent-primary" />
                    <span title={st ? (st.online ? 'Online' : 'Offline') : 'nicht geprüft'} className={`w-2.5 h-2.5 rounded-full shrink-0 ${st ? (st.online ? 'bg-emerald-400' : 'bg-red-500') : 'bg-muted-foreground/40'}`} />
                    <Server size={12} className="text-muted-foreground shrink-0" />
                    <span className="font-mono text-foreground">{d.hostname}</span>
                    <span className="text-muted-foreground truncate">· {d.assignedTo || 'nicht zugewiesen'}</span>
                    {st?.online && <SwBadge state={st.sw} />}
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{d.state || '—'}{d.substate ? ` / ${d.substate}` : ''}</span>
                  </label>
                )})}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <textarea value={manualInput} onChange={e => setManualInput(e.target.value)} rows={3}
                placeholder={'Hostname oder IP — je Zeile oder mit Komma getrennt\nz. B. DEHAM12345678'}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground font-mono resize-y focus:outline-none focus:border-primary" />
              <p className="text-[11px] text-muted-foreground">{manualHosts.length} PC(s) erkannt · zuletzt: {recent.slice(0, 3).join(', ') || '—'}</p>
            </div>
          )}
        </div>

        {/* 2 · Skripte + Server */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-2 max-w-3xl">
          <div className="flex items-center gap-2"><ListChecks size={15} className="text-primary" /><h3 className="text-sm font-bold text-foreground">2 · Skripte</h3></div>
          <div className="flex flex-wrap gap-3">
            {SW_SKRIPTE.map(s => (
              <label key={s.id} className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={skriptSel.has(s.id)} onChange={() => toggleSkript(s.id)} className="accent-primary" />
                {s.titel} <span className="text-[10px] opacity-60">({s.ziel})</span>
                {s.id === 'tiefenanalyse' && <span className="text-[10px] text-amber-400/80">· optional, langsam</span>}
              </label>
            ))}
            {skriptSel.has('server') && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Zielserver:
                <input value={server} onChange={e => setServer(e.target.value)} className="w-28 px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground font-mono" />
              </label>
            )}
          </div>
          <div className="flex items-center gap-3 pt-1">
            {!running ? (
              <button onClick={start} disabled={hostsToScan.length === 0 || skriptSel.size === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                <Play size={14} />Diagnose starten ({hostsToScan.length})
              </button>
            ) : (
              <button onClick={cancelScan} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"><Square size={14} />Abbrechen</button>
            )}
            {running && <span className="text-[11px] text-muted-foreground">läuft im Hintergrund — Menüpunkt kann gewechselt werden.</span>}
          </div>
          {(scanError || error) && <p className="text-xs text-red-400 flex items-center gap-1"><XCircle size={12} />{scanError || error}</p>}
          {notice && <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={12} />{notice}</p>}
          {/* Export-Optionen */}
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground border-t border-border/60 mt-1">
            <span>Export:</span>
            <label className="flex items-center gap-1"><input type="checkbox" checked={nurLetzter} onChange={e => setNurLetzter(e.target.checked)} className="accent-primary" />nur letzter Lauf je PC</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={mitEinzel} onChange={e => setMitEinzel(e.target.checked)} className="accent-primary" />mit Einzelberichten</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={nurAusgewaehlte} onChange={e => setNurAusgewaehlte(e.target.checked)} className="accent-primary" />nur gewählte/gescannte PCs</label>
          </div>
        </div>

        {/* Fortschritt */}
        {running && prog && (
          <div className="max-w-3xl bg-card border border-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1"><Loader size={12} className="animate-spin text-blue-400" />PC {prog.done + 1}/{prog.total} · <span className="font-mono">{prog.pc}</span></p>
            <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} /></div>
            <div className="space-y-1">
              {Object.values(prog.skripte).map(p => (
                <div key={p.id} className="flex items-center gap-2 text-[11px]">
                  {p.status === 'läuft' ? <Loader size={10} className="animate-spin text-blue-400" /> : p.status === 'fertig' ? <CheckCircle size={10} className="text-emerald-400" /> : p.status === 'fehler' ? <XCircle size={10} className="text-red-400" /> : <span className="w-2.5" />}
                  <span className="text-muted-foreground">{p.titel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lauf-Protokoll (mehrere PCs) */}
        {runLog.length > 0 && (
          <div className="max-w-3xl bg-card border border-border rounded-lg p-3">
            <p className="text-xs font-semibold text-foreground mb-2">Protokoll ({runLog.filter(r => r.ok).length}/{runLog.length} erfolgreich)</p>
            <div className="space-y-1">
              {runLog.map((r, i) => (
                <button key={i} onClick={() => { const l = ergebnisse.find(e => e.pc === r.pc); if (l) { setHistoryLauf(null); setOffenPc(r.pc); void refreshHistory(r.pc) } }}
                  className={`w-full text-left flex items-center gap-2 text-[11px] px-2 py-1 rounded ${offenPc === r.pc ? 'bg-accent/40' : 'hover:bg-accent/20'}`}>
                  {r.ok ? <CheckCircle size={11} className="text-emerald-400" /> : <XCircle size={11} className="text-red-400" />}
                  <span className="font-mono text-foreground">{r.pc}</span>
                  <span className={r.ok ? 'text-muted-foreground' : 'text-red-300'}>· {r.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ergebnis / Vergleich */}
        {!running && vergleich && (
          <div className="space-y-2">
            <button onClick={() => setVergleich(null)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft size={12} />zurück zum Ergebnis</button>
            <VergleichAnsicht a={vergleich.a} b={vergleich.b} />
          </div>
        )}
        {!running && !vergleich && offenerLauf && <LaufErgebnis lauf={offenerLauf} besitzerMap={besitzerMap} />}

        {/* Verlauf (offener bzw. einzeln gewählter PC) — jederzeit einsehbar/löschbar */}
        {!running && !vergleich && history.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-3 max-w-3xl">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1"><RefreshCw size={11} />Verlauf ({history[0].pc})</p>
            <div className="space-y-1">
              {history.map(h => (
                <div key={h.id} className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground flex-1">{fmt(h.ranAt)} · {h.auffaelligkeiten} Auffälligkeiten {h.isReferenz && <Star size={9} className="inline text-amber-400" />}</span>
                  <button onClick={() => openVergleich(h)} title="Mit aktuellem Ergebnis vergleichen" className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent"><GitCompareArrows size={10} /></button>
                  <button onClick={() => openHistoryLauf(h)} title="Diesen Lauf öffnen" className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent"><RotateCcw size={10} /></button>
                  <button onClick={() => { void setReferenz(h.id, !h.isReferenz).then(() => refreshHistory(h.pc)) }} title="Als Referenz markieren" className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent"><Star size={10} /></button>
                  <button onClick={() => removeHistory(h)} title="Bericht löschen" className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-red-400 hover:bg-red-500/10"><Trash2 size={10} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
