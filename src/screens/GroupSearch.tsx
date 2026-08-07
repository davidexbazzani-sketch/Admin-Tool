import { useMemo, useState } from 'react'
import {
  ScanSearch, Users, Server, Search, Loader2, AlertTriangle, Layers,
  FileDown, FileText, FileSpreadsheet, ChevronDown, CheckCircle2, XCircle,
  ChevronRight, Info, Network,
} from 'lucide-react'
import { searchByGroup, tokenize, type SearchMode, type GroupSearchResponse, type GroupSearchResult } from '../services/adGroupSearch'
import { exportGroupSearch, type GroupExportFormat } from '../services/adGroupSearchExport'
import { PersonInfoButton } from '../components/person/PersonDossier'

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Hebt die Tokens innerhalb eines Gruppennamens hervor. */
function HighlightGroup({ name, tokens }: { name: string; tokens: string[] }) {
  if (tokens.length === 0) return <>{name}</>
  // Alle Token-Vorkommen finden und markieren
  const ranges: { start: number; end: number }[] = []
  const lower = name.toLowerCase()
  for (const t of tokens) {
    const tl = t.toLowerCase()
    let from = 0
    while (true) {
      const idx = lower.indexOf(tl, from)
      if (idx === -1) break
      ranges.push({ start: idx, end: idx + tl.length })
      from = idx + tl.length
    }
  }
  if (ranges.length === 0) return <>{name}</>
  ranges.sort((a, b) => a.start - b.start)
  // Überlappungen zusammenführen
  const merged: { start: number; end: number }[] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else merged.push({ ...r })
  }
  const parts: React.ReactNode[] = []
  let pos = 0
  merged.forEach((r, i) => {
    if (r.start > pos) parts.push(<span key={`n${i}`}>{name.slice(pos, r.start)}</span>)
    parts.push(<mark key={`m${i}`} className="bg-amber-300 text-black rounded px-0.5">{name.slice(r.start, r.end)}</mark>)
    pos = r.end
  })
  if (pos < name.length) parts.push(<span key="end">{name.slice(pos)}</span>)
  return <>{parts}</>
}

export default function GroupSearch() {
  const [mode, setMode] = useState<SearchMode>('computer')
  const [query, setQuery] = useState('')
  const [recursive, setRecursive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resp, setResp] = useState<GroupSearchResponse | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const tokens = useMemo(() => tokenize(query), [query])

  async function runSearch() {
    if (tokens.length === 0) { setError('Bitte einen Suchbegriff eingeben.'); return }
    setLoading(true); setError(''); setResp(null); setExpanded(new Set())
    const r = await searchByGroup(mode, query, recursive)
    setLoading(false)
    if (!r.ok) { setError(r.error || 'Suche fehlgeschlagen.'); return }
    setResp(r)
  }

  async function doExport(format: GroupExportFormat) {
    setExportOpen(false)
    if (!resp) return
    setExporting(true)
    const r = await exportGroupSearch(resp, format)
    setExporting(false)
    if (!r.ok && !r.cancelled) setError(r.error || 'Export fehlgeschlagen.')
  }

  function toggleExpand(sam: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(sam)) next.delete(sam); else next.add(sam)
      return next
    })
  }

  const isUser = mode === 'user'

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <ScanSearch className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Gruppen-Suche</h1>
          <p className="text-[11px] text-muted-foreground">
            Findet Benutzer oder Computer anhand ihrer AD-Gruppen („Mitglied von")
          </p>
        </div>
      </div>

      {/* Suchbereich */}
      <div className="px-5 py-4 border-b border-border shrink-0 space-y-3">
        {/* Modus-Auswahl */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-20 shrink-0">Suche nach:</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setMode('computer')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${!isUser ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}
            >
              <Server size={14} />Geräte / Computer
            </button>
            <button
              onClick={() => setMode('user')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${isUser ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}
            >
              <Users size={14} />Benutzer / User
            </button>
          </div>
        </div>

        {/* Suchfeld */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-20 shrink-0">Suchbegriff:</span>
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !loading) runSearch() }}
              placeholder='z. B. "marine" oder "marine servers"'
              className="w-full pl-8 pr-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={runSearch}
            disabled={loading || tokens.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? 'Suche läuft…' : 'Suchen'}
          </button>
        </div>

        {/* Optionen + Token-Vorschau */}
        <div className="flex items-center gap-4 flex-wrap pl-[88px]">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={recursive}
              onChange={e => setRecursive(e.target.checked)}
              className="accent-primary w-3.5 h-3.5"
            />
            <Layers size={13} />
            Verschachtelte Gruppen einbeziehen (transitive Mitgliedschaft)
          </label>
          {tokens.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info size={12} />
              Es zählen Gruppen, deren Name {tokens.length === 1 ? 'enthält' : 'ALLE enthält:'}
              {tokens.map(t => (
                <code key={t} className="px-1.5 py-0.5 rounded bg-accent/40 text-foreground">{t}</code>
              ))}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
          <AlertTriangle size={14} />{error}
        </div>
      )}

      {/* Ergebnis-Kopfzeile */}
      {resp && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0">
          <div className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">{resp.results.length}</span> {isUser ? 'Benutzer' : 'Geräte'} gefunden
            <span className="mx-2">·</span>
            <span className="text-foreground font-medium">{resp.matchingGroups.length}</span> passende Gruppen
            {resp.recursive && <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-300 text-black"><Layers size={11} />inkl. verschachtelt</span>}
            <span className="ml-2 opacity-60">({(resp.durationMs / 1000).toFixed(1)}s)</span>
            {resp.capped && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-300 text-black">Liste gekürzt (Limit erreicht)</span>}
          </div>
          <div className="ml-auto relative">
            <button
              onClick={() => setExportOpen(o => !o)}
              disabled={exporting || resp.results.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border disabled:opacity-50"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
              Exportieren<ChevronDown size={12} />
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-1 z-20 w-40 rounded-md border border-border bg-popover shadow-xl py-1">
                  <button onClick={() => doExport('pdf')} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><FileText size={13} className="text-red-400" />Als PDF</button>
                  <button onClick={() => doExport('word')} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><FileText size={13} className="text-blue-400" />Als Word</button>
                  <button onClick={() => doExport('excel')} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><FileSpreadsheet size={13} className="text-emerald-400" />Als Excel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Inhalt */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Loader2 size={36} className="animate-spin text-primary" />
            <p className="text-sm">Active Directory wird durchsucht…</p>
            <p className="text-xs opacity-70">{recursive ? 'Verschachtelte Mitgliedschaften werden mit aufgelöst.' : 'Direkte Mitgliedschaften werden geprüft.'}</p>
          </div>
        )}

        {!loading && !resp && !error && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <ScanSearch size={48} className="opacity-30" />
            <p className="text-sm">Modus wählen, Suchbegriff eingeben und „Suchen" klicken.</p>
            <p className="text-xs opacity-70 max-w-md text-center">
              Beispiel: „marine" findet alle {isUser ? 'Benutzer' : 'Geräte'} mit irgendeiner Gruppe, die „marine" enthält.
              „marine servers" nur die, die eine Gruppe mit beiden Begriffen haben (z. B. <code className="px-1 rounded bg-accent/40">Application_Marine_Servers</code>).
            </p>
          </div>
        )}

        {!loading && resp && resp.results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <XCircle size={42} className="opacity-40" />
            <p className="text-sm">Keine {isUser ? 'Benutzer' : 'Geräte'} gefunden.</p>
            {resp.matchingGroups.length > 0
              ? <p className="text-xs opacity-70">{resp.matchingGroups.length} passende Gruppe(n), aber ohne {isUser ? 'Benutzer' : 'Computer'} als {resp.recursive ? '' : 'direkte '}Mitglieder. Tipp: „Verschachtelte Gruppen" aktivieren.</p>
              : <p className="text-xs opacity-70">Keine Gruppe gefunden, deren Name alle Suchbegriffe enthält.</p>}
          </div>
        )}

        {!loading && resp && resp.results.length > 0 && (
          <div className="p-4 space-y-2">
            {/* passende Gruppen als Übersicht */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-1 inline-flex items-center gap-1"><Network size={12} />Passende Gruppen:</span>
              {resp.matchingGroups.map(g => (
                <span key={g} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-foreground">
                  <HighlightGroup name={g} tokens={resp.tokens} />
                </span>
              ))}
            </div>

            {resp.results.map(r => (
              <ResultRow
                key={r.sam + r.name}
                r={r}
                isUser={isUser}
                tokens={resp.tokens}
                expanded={expanded.has(r.sam + r.name)}
                onToggle={() => toggleExpand(r.sam + r.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ResultRow({ r, isUser, tokens, expanded, onToggle }: {
  r: GroupSearchResult
  isUser: boolean
  tokens: string[]
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div role="button" tabIndex={0} onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/20 rounded-lg cursor-pointer">
        <ChevronRight size={15} className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        {isUser ? <Users size={16} className="shrink-0 text-blue-400" /> : <Server size={16} className="shrink-0 text-emerald-400" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
            {isUser && <PersonInfoButton name={r.name} sam={r.sam} />}
            <span className="text-[11px] text-muted-foreground">{r.sam}</span>
            {r.enabled
              ? <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 size={11} />aktiv</span>
              : <span className="inline-flex items-center gap-1 text-[10px] text-red-400"><XCircle size={11} />deaktiviert</span>}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {isUser
              ? [r.col1, r.col2, r.col3].filter(Boolean).join(' · ') || '—'
              : [r.col1, r.col2].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        {/* Treffer-Gruppen kompakt */}
        <div className="hidden md:flex items-center gap-1 shrink-0 max-w-[40%] overflow-hidden">
          {r.matchedGroups.slice(0, 2).map(g => (
            <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black truncate max-w-[160px]">
              <HighlightGroup name={g} tokens={tokens} />
            </span>
          ))}
          {r.matchedGroups.length > 2 && <span className="text-[10px] text-muted-foreground">+{r.matchedGroups.length - 2}</span>}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border/60 space-y-3">
          {/* Detail-Felder */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] pt-2">
            <Detail label={isUser ? 'Corp-ID' : 'Computername'} value={r.sam} />
            <Detail label={isUser ? 'Name' : 'DNS-Hostname'} value={isUser ? r.name : r.col1} />
            <Detail label={isUser ? 'Titel' : 'Betriebssystem'} value={isUser ? r.col1 : r.col2} />
            <Detail label={isUser ? 'Abteilung' : 'Beschreibung'} value={isUser ? r.col2 : r.col3} />
            {isUser && <Detail label="E-Mail" value={r.col3} />}
            <Detail label="Letzter Logon" value={fmtDate(r.lastLogon)} />
          </div>

          {/* Treffer-Begründung */}
          <div>
            <p className="text-[11px] font-semibold mb-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-300 text-black w-fit">
              <ScanSearch size={12} />Treffer wegen dieser Gruppe(n):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {r.matchedGroups.map(g => (
                <span key={g} className="text-[11px] px-2 py-0.5 rounded-md bg-amber-300 border border-amber-500 text-black">
                  <HighlightGroup name={g} tokens={tokens} />
                </span>
              ))}
            </div>
          </div>

          {/* Alle Gruppen */}
          {r.allGroups.length > 0 && (
            <details className="group">
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground inline-flex items-center gap-1">
                <Network size={12} />Alle Gruppen („Mitglied von") · {r.allGroups.length}
              </summary>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {r.allGroups.map(g => {
                  const isMatch = r.matchedGroups.includes(g)
                  return (
                    <span key={g} className={`text-[10px] px-1.5 py-0.5 rounded ${isMatch ? 'bg-amber-300 text-black' : 'bg-accent/30 text-muted-foreground'}`}>
                      {isMatch ? <HighlightGroup name={g} tokens={tokens} /> : g}
                    </span>
                  )
                })}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0 w-28">{label}:</span>
      <span className="text-foreground break-words">{value || '—'}</span>
    </div>
  )
}
