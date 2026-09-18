// ── NIS2 (Infrastruktur) ──────────────────────────────────────────────────────
// Sammel-Menüpunkt für NIS2-Themen. Erste Kachel: „Zugänge-Check" – zeigt alle
// Nutzer mit lokalen Adminrechten auf PCs (WinRM-Scan, täglich 11:00) und markiert
// anhand einer importierten „genehmigt"-Liste (Excel-Namensspalte), wer weiterhin
// lokale Adminrechte behalten darf.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, KeyRound, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Loader2,
  FileSpreadsheet, Search, AlertTriangle, Check, X, Monitor, Users, Clock,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { PersonInfoButton } from '../components/person/PersonDossier'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import { openFileForImport, parseExcelSheet, type ExcelSheetData } from '../utils/fileImport'
import ApprovedImportDialog, { type ColumnMap } from '../components/nis2/ApprovedImportDialog'
import {
  loadAccessResult, loadApprovedList, saveApprovedEntries, approvalFor, statusApproved, runAccessCheckScanOnce, isStandardAdminGroup,
  type AccessCheckResult, type ApprovedList, type ApprovedEntry, type AdminUser,
} from '../services/nis2Access'

function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Zugänge eines Nutzers je PC bündeln (ein PC, alle Herkünfte: direkt / über Gruppe X). */
function groupAccessByPc(u: AdminUser): { pc: string; vias: string[] }[] {
  const access = u.access && u.access.length ? u.access : (u.pcs || []).map(pc => ({ pc, via: 'direkt' }))
  const m = new Map<string, Set<string>>()
  for (const a of access) { if (!m.has(a.pc)) m.set(a.pc, new Set()); m.get(a.pc)!.add(a.via) }
  return [...m.entries()]
    .map(([pc, vias]) => ({ pc, vias: [...vias].sort((a, b) => (a === 'direkt' ? -1 : b === 'direkt' ? 1 : a.localeCompare(b))) }))
    .sort((x, y) => x.pc.localeCompare(y.pc))
}

export default function Nis2() {
  const [view, setView] = useState<'hub' | 'access'>('hub')
  if (view === 'access') return <AccessCheckView onBack={() => setView('hub')} />

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <ShieldCheck size={22} className="text-primary" />
        <div>
          <h1 className="text-lg font-bold text-foreground">NIS2</h1>
          <p className="text-xs text-muted-foreground">NIS2-Themen &amp; Prüfungen · weitere Kacheln folgen</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          <button onClick={() => setView('access')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:bg-accent/20 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center mb-3"><KeyRound size={20} className="text-blue-400" /></div>
            <h3 className="font-semibold text-foreground">Zugänge-Check</h3>
            <p className="text-xs text-muted-foreground mt-1">Alle PCs scannen: wer hat lokale Adminrechte? Abgleich mit der Liste genehmigter Admins.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary font-medium">Öffnen <ChevronRight size={13} /></span>
          </button>
          <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-5 flex items-center justify-center text-center">
            <p className="text-xs text-muted-foreground/70">Weitere NIS2-Kacheln folgen …</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Zugänge-Check ─────────────────────────────────────────────────────────────
function AccessCheckView({ onBack }: { onBack: () => void }) {
  const user = useAuthStore(s => s.session?.user)
  const currentUser = user?.displayName || user?.username || 'unbekannt'

  const [result, setResult] = useState<AccessCheckResult | null>(null)
  const [approved, setApproved] = useState<ApprovedList>({ entries: [] })
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [onlyUnapproved, setOnlyUnapproved] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [pending, setPending] = useState<{ sheet: ExcelSheetData; filename: string } | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [r, a] = await Promise.all([loadAccessResult(), loadApprovedList()])
      setResult(r); setApproved(a); setError('')
    } catch { setError('Daten konnten nicht geladen werden. Netzlaufwerk erreichbar?') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const rows = useMemo(() => {
    const users = (result?.users ?? []).map(u => { const a = approvalFor(u, approved.entries); return { ...u, state: a.state, entry: a.entry } })
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      if (onlyUnapproved && u.state === 'genehmigt') return false
      if (!q) return true
      return u.displayName.toLowerCase().includes(q) || u.sam.toLowerCase().includes(q) || (u.department || '').toLowerCase().includes(q) || u.pcs.some(p => p.toLowerCase().includes(q))
    })
  }, [result, approved, search, onlyUnapproved])

  const counts = useMemo(() => {
    const c = { genehmigt: 0, beantragt: 0, nicht: 0 }
    for (const u of result?.users ?? []) c[approvalFor(u, approved.entries).state]++
    return c
  }, [result, approved])

  async function doScan() {
    if (scanning) return
    setScanning(true); setError(''); setMsg('')
    try {
      const r = await runAccessCheckScanOnce(currentUser)
      await reload()
      setMsg(`Scan fertig: ${r.summary}`)
    } catch (e) {
      setError('Scan fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setScanning(false) }
  }

  async function importApproved() {
    setError(''); setMsg('')
    try {
      const file = await openFileForImport()
      if (!file) return
      if (!['xlsx', 'xls', 'csv'].includes(file.ext)) { setError('Bitte eine Excel-/CSV-Datei wählen.'); return }
      const sheet = parseExcelSheet(file.bytes)
      if (sheet.columns.length === 0) { setError('Keine Spalten in der Datei gefunden.'); return }
      const filename = file.filePath.split(/[\\/]/).pop() || 'Liste.xlsx'
      setPending({ sheet, filename })
    } catch (e) {
      setError('Import fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  async function applyEntries(sheet: ExcelSheetData, map: ColumnMap, filename: string) {
    const entries: ApprovedEntry[] = sheet.rows.map(r => ({
      name: String(r[map.name] ?? '').trim(),
      status: map.status ? String(r[map.status] ?? '').trim() : undefined,
      ritm: map.ritm ? String(r[map.ritm] ?? '').trim() : undefined,
      req: map.req ? String(r[map.req] ?? '').trim() : undefined,
    })).filter(e => e.name)
    if (entries.length === 0) { setError('In der gewählten Namensspalte wurden keine Einträge gefunden.'); return }
    await saveApprovedEntries(entries, currentUser, filename)
    await reload()
    const genehmigt = entries.filter(e => statusApproved(e.status)).length
    setMsg(`${entries.length} Anträge übernommen · ${genehmigt} genehmigt (Completed) · ${entries.length - genehmigt} offen · aus „${filename}".`)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="p-1 rounded text-muted-foreground hover:bg-accent/40"><ChevronLeft size={16} /></button>
        <KeyRound className="text-blue-400" size={20} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Zugänge-Check · Lokale Adminrechte</h1>
          <p className="text-[11px] text-muted-foreground">
            {result ? <>Letzter Scan: {fmtDateTime(result.scannedAt)} · {result.scannedPCs}/{result.totalPCs} PCs erreicht · {result.users.length} Nutzer mit lokalem Admin · <span className="text-emerald-400">{counts.genehmigt} genehmigt</span>{counts.beantragt ? <> · <span className="text-amber-600">{counts.beantragt} beantragt</span></> : ''}{counts.nicht ? <> · <span className="text-red-400 font-medium">{counts.nicht} ohne Antrag</span></> : ''}</> : 'Noch kein Scan durchgeführt.'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void reload()} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border" title="Aktualisieren"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={importApproved} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-foreground hover:bg-accent/40" title="Antrags-Liste importieren (Spalten Name/Status/RITM/REQ zuordnen). Stage = Completed gilt als genehmigt.">
            <FileSpreadsheet size={14} />Genehmigte importieren
          </button>
          <button onClick={doScan} disabled={scanning}
            title="Alle Computer jetzt per WinRM auf lokale Adminrechte scannen (läuft sonst automatisch täglich 11:00)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Jetzt scannen
          </button>
        </div>
      </div>

      {/* Info-/Filterzeile */}
      <div className="shrink-0 flex items-center gap-2 px-5 py-2 border-b border-border bg-muted/5 flex-wrap">
        <div className="relative w-64">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, Corp-ID, PC…" className="w-full pl-6 pr-2 py-1 rounded-md bg-card border border-border text-xs" />
        </div>
        <button onClick={() => setOnlyUnapproved(v => !v)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border ${onlyUnapproved ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-border text-muted-foreground hover:bg-accent/30'}`}>
          <AlertTriangle size={12} />Nur „nicht genehmigt"
        </button>
        <span className="text-[11px] text-muted-foreground ml-1">
          <Users size={11} className="inline mr-1" />Antrags-Liste: {approved.entries.length} Anträge{approved.importedFilename ? ` · „${approved.importedFilename}"` : ' · noch nicht importiert'}
        </span>
      </div>

      {msg && <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs shrink-0 flex items-center gap-2"><Check size={13} />{msg}<button onClick={() => setMsg('')} className="ml-auto text-muted-foreground hover:text-foreground"><X size={12} /></button></div>}
      {error && <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0 flex items-center gap-2"><AlertTriangle size={13} />{error}</div>}
      {scanning && <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs shrink-0 flex items-center gap-2"><Loader2 size={12} className="animate-spin" />Scan läuft… je nach Anzahl der PCs kann das einige Minuten dauern.</div>}

      {/* Tabelle */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && !result ? (
          <div className="flex items-center justify-center h-full text-muted-foreground gap-2"><Loader2 size={16} className="animate-spin" />Wird geladen…</div>
        ) : !result || result.users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
            <KeyRound size={44} className="opacity-30" />
            <p className="text-sm">{result ? 'Keine Nutzer mit lokalen Adminrechten gefunden.' : 'Noch kein Scan. „Jetzt scannen" starten (oder täglich automatisch 11:00).'}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground py-16 text-sm">Keine Treffer für den Filter.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Corp-ID</th>
                <th className="px-2 py-2">Abteilung</th>
                <th className="px-2 py-2">PCs (lokaler Admin)</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(u => {
                const open = !!expanded[u.sam]
                return (
                  <tr key={u.sam} className={`border-b border-border/40 hover:bg-accent/10 ${u.state === 'nicht' ? 'bg-red-500/10' : u.state === 'beantragt' ? 'bg-amber-500/10' : ''}`}>
                    <td className="px-2 py-1.5 text-foreground"><span className="inline-flex items-center gap-1">{u.displayName}<PersonInfoButton name={u.displayName} sam={u.sam} /></span></td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{u.sam}</td>
                    <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[16rem]" title={u.department || undefined}>{u.department || '—'}</td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => setExpanded(p => ({ ...p, [u.sam]: !p[u.sam] }))} className="inline-flex items-center gap-1 text-foreground hover:text-primary">
                        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <Monitor size={12} className="text-muted-foreground" /><span className="font-semibold">{u.pcs.length}</span> PC(s)
                      </button>
                      {open && (
                        <div className="mt-1 pl-5 flex flex-col gap-1">
                          {groupAccessByPc(u).map(({ pc, vias }) => (
                            <div key={pc} className="flex items-center gap-1.5 flex-wrap text-[11px]">
                              <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">{pc}<DeviceInfoButton hostname={pc} /></span>
                              {vias.map(v => (
                                <span key={v} title={v === 'direkt' ? 'Direkt in der lokalen Administratoren-Gruppe' : `Mitglied der Gruppe ${v}`}
                                  className={`px-1.5 py-0.5 rounded ${v === 'direkt' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'}`}>
                                  {v === 'direkt' ? 'direkt' : `über ${v}`}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {u.state === 'genehmigt' ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 w-fit"><Check size={11} />genehmigt</span>
                          {(u.entry?.ritm || u.entry?.req) && <span className="text-[10px] text-muted-foreground font-mono">{[u.entry?.ritm, u.entry?.req].filter(Boolean).join(' · ')}</span>}
                        </div>
                      ) : u.state === 'beantragt' ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-foreground border border-amber-500/40 w-fit"><Clock size={11} className="text-amber-600" />beantragt</span>
                          <span className="text-[10px] text-muted-foreground">{u.entry?.status || 'offen'}{u.entry?.ritm ? ` · ${u.entry.ritm}` : ''}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-red-500 text-white border border-red-600 font-semibold"><AlertTriangle size={11} />nicht genehmigt</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {result && result.standardGroups && result.standardGroups.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <ShieldCheck size={14} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-foreground">Gruppen mit lokalem Admin</h2>
              <span className="text-[11px] text-muted-foreground">— Gruppen (z. B. Domain Admins, EDS_WorkstationAdmins_EMEA), die auf den PCs lokaler Admin sind. Werden separat gezeigt und NICHT je PC in die Nutzerliste ausgerollt (dort nur direkt eingetragene Einzelbenutzer).</span>
            </div>
            <div className="flex flex-col gap-2">
              {result.standardGroups.map(g => {
                const gk = `grp:${g.group}`
                const gopen = !!expanded[gk]
                return (
                  <div key={g.group} className="rounded-lg border border-blue-500/20 bg-blue-500/5">
                    <button onClick={() => setExpanded(p => ({ ...p, [gk]: !p[gk] }))} className="w-full flex items-center gap-2 px-3 py-2 text-left">
                      {gopen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <Users size={13} className="text-blue-400" />
                      <span className="text-sm font-medium text-foreground">{g.group}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">{isStandardAdminGroup(g.group) ? 'IT-Standard' : 'Gruppe'}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">{g.members.length} Mitglied(er) · lokaler Admin auf {g.pcCount} PC(s)</span>
                    </button>
                    {gopen && (
                      <div className="px-3 pb-2 pl-8 flex flex-col gap-0.5">
                        {g.members.length === 0
                          ? <span className="text-[11px] text-muted-foreground">Keine Benutzer-Mitglieder aufgelöst (AD-Modul am Admin-PC verfügbar?).</span>
                          : g.members.map(m => (
                            <span key={m.sam} className="inline-flex items-center gap-1 text-[12px] text-foreground/90">
                              {m.displayName}<PersonInfoButton name={m.displayName} sam={m.sam} />
                              <span className="text-[11px] text-muted-foreground font-mono">({m.sam}{m.department ? ` · ${m.department}` : ''})</span>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {pending && (
        <ApprovedImportDialog columns={pending.sheet.columns} rows={pending.sheet.rows}
          onCancel={() => setPending(null)}
          onConfirm={map => { const p = pending; setPending(null); if (p) void applyEntries(p.sheet, map, p.filename) }} />
      )}
    </div>
  )
}
