import { useState, useEffect, useRef } from 'react'
import {
  Search, Loader, CheckSquare, Square, CheckCircle2, XCircle, Info,
  Mail, FileSpreadsheet, FileText, File, X, ChevronDown, Users2,
} from 'lucide-react'
import type { UserProfileData } from '../types'
import { api } from '../electronAPI'
import {
  exportExcelPermissions,
  exportWordPermissions,
  exportPdfPermissions,
} from '../utils/exportUtils'
import {
  buildLightSearchQuery, parseLightSearchResult,
  getCached, setCached,
  type CandidateUser,
} from '../utils/adSearchUtils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CompUser {
  SamAccountName: string
  DisplayName: string
  EmployeeID: string
  Department: string
  Title: string
}

interface CompResult {
  shared: string[]
  missing: string[]  // only comp user has → user needs these
  extra: string[]    // only current user has
  compUser: CompUser
}

interface Props {
  userData: UserProfileData  // current user's full data
  userGroups: string[]       // already-parsed group list
}

// ── PS helpers ────────────────────────────────────────────────────────────────

function buildCompareQuery(input: string): string {
  const e = input.replace(/'/g, "''")
  return [
    `try {`,
    `  $u=$null`,
    `  try{$u=Get-ADUser -Identity '${e}' -Properties MemberOf,DisplayName,EmployeeID,Department,Title -EA Stop}catch{}`,
    `  if(!$u){$u=Get-ADUser -Filter "EmployeeID -eq '${e}'" -Properties MemberOf,DisplayName,EmployeeID,Department,Title -EA Stop|Select-Object -First 1}`,
    `  if(!$u){throw "Benutzer nicht gefunden: ${e}"}`,
    `  $gr=($u.MemberOf|ForEach-Object{($_ -split ',')[0]-replace '^CN='}|Sort-Object)-join';'`,
    `  @{SamAccountName=$u.SamAccountName;DisplayName=$u.DisplayName;EmployeeID=$u.EmployeeID;Department=$u.Department;Title=$u.Title;Groups=$gr}|ConvertTo-Json -Compress`,
    `}catch{Write-Output "ERR:$($_.Exception.Message)"}`,
  ].join('\n')
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GroupComparisonPanel({ userData, userGroups }: Props) {
  const [searchTerm, setSearchTerm]           = useState('')
  const [suggestions, setSuggestions]         = useState<CandidateUser[]>([])
  const [sugLoading, setSugLoading]           = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedComp, setSelectedComp]       = useState<CompUser | null>(null)
  const [comparing, setComparing]             = useState(false)
  const [compareError, setCompareError]       = useState('')
  const [result, setResult]                   = useState<CompResult | null>(null)
  const [filterQuery, setFilterQuery]         = useState('')
  const [selectedMissing, setSelectedMissing] = useState<Set<string>>(new Set())
  const [exportMenuOpen, setExportMenuOpen]   = useState(false)
  const [exportLoading, setExportLoading]     = useState(false)
  const [lastExportPath, setLastExportPath]   = useState('')
  const [showEmail, setShowEmail]             = useState(false)
  const [emailTo, setEmailTo]                 = useState('')
  const [emailSubject, setEmailSubject]       = useState('')
  const [emailBody, setEmailBody]             = useState('')
  const [attachExport, setAttachExport]       = useState(false)
  const [emailSending, setEmailSending]       = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Autocomplete ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (selectedComp) return
    const term = searchTerm.trim()
    if (term.length < 3) { setSuggestions([]); setShowSuggestions(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      // Check session cache first
      const cached = getCached(term)
      if (cached) { setSuggestions(cached); setShowSuggestions(cached.length > 0); return }
      setSugLoading(true)
      try {
        const r = await api().runPowerShell(buildLightSearchQuery(term), 12000)
        const { candidates, tooMany, error } = parseLightSearchResult(r.stdout)
        if (tooMany) {
          setSuggestions([])
          setCompareError('Zu viele Treffer – bitte Suche eingrenzen.')
        } else if (error) {
          setSuggestions([])
          setCompareError(`Suche fehlgeschlagen: ${error}`)
        } else {
          setCached(term, candidates)
          setSuggestions(candidates)
          setShowSuggestions(candidates.length > 0)
        }
      } catch { setSuggestions([]) }
      finally { setSugLoading(false) }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchTerm, selectedComp])

  function selectSuggestion(c: CandidateUser) {
    const comp: CompUser = {
      SamAccountName: c.Sam, DisplayName: c.Name,
      EmployeeID: c.EmpID, Department: c.Dept, Title: c.Title,
    }
    setSelectedComp(comp)
    setSearchTerm(c.Name || c.Sam)
    setSuggestions([])
    setShowSuggestions(false)
    setCompareError('')
  }

  function clearSelection() {
    setSelectedComp(null)
    setSearchTerm('')
    setSuggestions([])
    setResult(null)
    setCompareError('')
    setSelectedMissing(new Set())
    setLastExportPath('')
  }

  // ── Compare ─────────────────────────────────────────────────────────────────

  async function runComparison() {
    const term = searchTerm.trim()
    if (!term) return
    setComparing(true); setCompareError(''); setResult(null)
    try {
      // If no SAM known yet, search first
      let sam = selectedComp?.SamAccountName
      if (!sam) {
        const cached = getCached(term)
        let cands = cached
        if (!cands) {
          const sr = await api().runPowerShell(buildLightSearchQuery(term), 12000)
          const { candidates, tooMany, error } = parseLightSearchResult(sr.stdout)
          if (tooMany) { setCompareError('Zu viele Treffer – bitte Suche eingrenzen.'); return }
          if (error) { setCompareError(`AD-Suche fehlgeschlagen: ${error}`); return }
          cands = candidates
          if (candidates.length > 0) setCached(term, candidates)
        }
        if (cands.length === 0) { setCompareError(`Benutzer „${term}" wurde im AD nicht gefunden. Bitte Corp ID oder exakten SAMAccountName verwenden.`); return }
        if (cands.length === 1) {
          sam = cands[0].Sam
          setSelectedComp({ SamAccountName: cands[0].Sam, DisplayName: cands[0].Name, EmployeeID: cands[0].EmpID, Department: cands[0].Dept, Title: cands[0].Title })
          setSearchTerm(cands[0].Name || cands[0].Sam)
        } else {
          // Show disambiguation in dropdown
          setSuggestions(cands); setShowSuggestions(true)
          setCompareError('Mehrere Benutzer gefunden – bitte aus der Liste auswählen.')
          return
        }
      }
      const r = await api().runPowerShell(buildCompareQuery(sam), 30000)
      const out = r.stdout.trim()
      if (out.startsWith('ERR:')) { setCompareError(out.slice(4)); return }
      if (!out) { setCompareError('Leere Antwort vom AD-Server.'); return }
      let cd: CompUser & { Groups: string }
      try { cd = JSON.parse(out) as CompUser & { Groups: string } }
      catch (parseErr) {
        api().log(`[${new Date().toISOString()}] Vergleich JSON-Fehler für "${sam}"\nRohe PS-Ausgabe:\n${out}\n\n`)
        setCompareError(`AD-Abfrage hat ungültiges Format zurückgegeben. Details in der Log-Datei.`)
        return
      }
      const cGroups = cd.Groups ? cd.Groups.split(';').filter(Boolean) : []
      const uSet = new Set(userGroups.map((g) => g.toLowerCase()))
      const cSet = new Set(cGroups.map((g) => g.toLowerCase()))
      const shared  = userGroups.filter((g) => cSet.has(g.toLowerCase())).sort()
      const missing = cGroups.filter((g) => !uSet.has(g.toLowerCase())).sort()
      const extra   = userGroups.filter((g) => !cSet.has(g.toLowerCase())).sort()
      const compUser: CompUser = { SamAccountName: cd.SamAccountName, DisplayName: cd.DisplayName, EmployeeID: cd.EmployeeID, Department: cd.Department, Title: cd.Title }
      setResult({ shared, missing, extra, compUser })
      setSelectedMissing(new Set(missing))
      if (!selectedComp) setSelectedComp(compUser)
    } catch (err) { setCompareError(String(err)) }
    finally { setComparing(false) }
  }

  // ── Selection helpers ───────────────────────────────────────────────────────

  function toggleMissing(g: string) {
    setSelectedMissing((p) => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n })
  }
  function toggleAllMissing() {
    if (!result) return
    const vis = filteredMissing()
    const allSel = vis.every((g) => selectedMissing.has(g))
    setSelectedMissing((p) => {
      const n = new Set(p)
      vis.forEach((g) => allSel ? n.delete(g) : n.add(g))
      return n
    })
  }

  const fq = filterQuery.toLowerCase()
  function filteredMissing()  { return result?.missing.filter((g) => !fq || g.toLowerCase().includes(fq)) ?? [] }
  function filteredShared()   { return result?.shared.filter((g)  => !fq || g.toLowerCase().includes(fq)) ?? [] }
  function filteredExtra()    { return result?.extra.filter((g)   => !fq || g.toLowerCase().includes(fq)) ?? [] }

  // ── Export ──────────────────────────────────────────────────────────────────

  async function handleExport(format: 'excel' | 'word' | 'pdf') {
    setExportMenuOpen(false)
    const sel = Array.from(selectedMissing)
    if (!sel.length || !result) return
    const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : 'pdf'
    const defName = `Berechtigungsanfrage_${userData.Sam}_${new Date().toLocaleDateString('de-DE').replace(/\./g, '-')}.${ext}`
    const savePath = await api().saveFileDialog(defName, [{ name: ext.toUpperCase(), extensions: [ext] }])
    if (!savePath) return
    setExportLoading(true)
    try {
      const info = { user: userData, compUser: result.compUser, missingGroups: sel }
      if (format === 'excel') await exportExcelPermissions(info, savePath)
      else if (format === 'word') await exportWordPermissions(info, savePath)
      else await exportPdfPermissions(info, savePath)
      setLastExportPath(savePath)
    } catch (err) { console.error(err) }
    finally { setExportLoading(false) }
  }

  // ── Email ────────────────────────────────────────────────────────────────────

  async function openEmailModal() {
    if (!result || selectedMissing.size === 0) return
    // Get current Windows user name for signature
    let adminName = 'Admin'
    try {
      const r = await api().runPowerShell(`try{(Get-ADUser -Identity $env:USERNAME -Properties DisplayName -EA Stop).DisplayName}catch{$env:USERNAME}`, 5000)
      adminName = r.stdout.trim() || 'Admin'
    } catch { /* ignore */ }

    const groupList = Array.from(selectedMissing).map((g) => `  - ${g}`).join('\n')
    const subject = `Permission Request – ${userData.EmpID || userData.Sam} / ${userData.GivenName || ''} ${userData.Surname || ''}`.trim()
    const body = `Dear Team,

Could you please assign the following permissions/group memberships to the user listed below:

User: ${userData.EmpID ? `${userData.EmpID} / ` : ''}${userData.Name || userData.Sam}
Department: ${userData.Dept || '–'}
Location: ${userData.Office || '–'}

Permissions to be assigned:
${groupList}

These permissions are based on a comparison with the role profile of ${result.compUser.EmployeeID ? `${result.compUser.EmployeeID} / ` : ''}${result.compUser.DisplayName}${result.compUser.Title ? ` (${result.compUser.Title}` : ''}${result.compUser.Department ? `${result.compUser.Title ? ', ' : ' ('}${result.compUser.Department}` : ''}${(result.compUser.Title || result.compUser.Department) ? ')' : ''}.

Please let me know if any further information or approval is needed.

Kind regards,
${adminName}`

    setEmailSubject(subject)
    setEmailBody(body)
    setShowEmail(true)
  }

  async function sendEmail() {
    setEmailSending(true)
    try {
      await api().composeEmail({
        to: emailTo,
        cc: '',
        subject: emailSubject,
        body: emailBody,
        attachmentPath: attachExport && lastExportPath ? lastExportPath : undefined,
      })
      setShowEmail(false)
    } catch { /* ignore */ }
    finally { setEmailSending(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const fmiss = filteredMissing()
  const allVisSelected = fmiss.length > 0 && fmiss.every((g) => selectedMissing.has(g))

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20">
        <Users2 size={13} className="text-primary shrink-0" />
        <p className="text-xs font-semibold text-primary flex-1">Berechtigungsvergleich</p>
      </div>

      {/* Input row */}
      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              placeholder="Vergleichs-Benutzer: Name, SAM oder Corp ID…"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); if (selectedComp) setSelectedComp(null) }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => { if (e.key === 'Enter') runComparison() }}
              className="w-full px-3 py-1.5 pr-8 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            {sugLoading && <Loader size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
            {selectedComp && (
              <button onClick={clearSelection} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 top-full mt-1 z-50 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                {suggestions.map((c, i) => (
                  <button
                    key={i}
                    onMouseDown={() => selectSuggestion(c)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <Users2 size={11} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{c.Name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{c.Sam}{c.EmpID ? ` · ${c.EmpID}` : ''}{c.Dept ? ` · ${c.Dept}` : ''}</p>
                    </div>
                    {c.Title && <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[100px]">{c.Title}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={runComparison}
            disabled={(!searchTerm.trim() && !selectedComp) || comparing}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {comparing ? <Loader size={13} className="animate-spin" /> : <Search size={13} />}
            Vergleichen
          </button>
        </div>

        {compareError && <p className="text-[11px] text-destructive">{compareError}</p>}
      </div>

      {/* Results */}
      {result && (
        <div className="px-3 pb-3 space-y-3">
          {/* Filter */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Gruppen filtern…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Missing permissions (most important) */}
          <div className="rounded-lg border border-amber-500/30 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10">
              <button onClick={toggleAllMissing} className="text-amber-400 shrink-0">
                {allVisSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
              <XCircle size={13} className="text-amber-400 shrink-0" />
              <p className="text-xs font-semibold text-amber-300 flex-1 truncate">
                Fehlende Berechtigungen – nur bei <span className="font-bold">{result.compUser.DisplayName || result.compUser.SamAccountName}</span>
                {result.compUser.EmployeeID && <span className="font-normal text-amber-400/80"> ({result.compUser.EmployeeID})</span>}
                <span className="ml-1.5 text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded-full font-mono">{result.missing.length}</span>
              </p>
            </div>
            {fmiss.length > 0 ? (
              <div className="p-2 flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                {fmiss.map((g, i) => (
                  <button
                    key={i}
                    onClick={() => toggleMissing(g)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border font-mono transition-colors ${
                      selectedMissing.has(g)
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-muted text-muted-foreground border-border opacity-50'
                    }`}
                    title={g}
                  >
                    {selectedMissing.has(g) ? <CheckSquare size={9} /> : <Square size={9} />}
                    {g}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-[11px] text-muted-foreground italic">
                {filterQuery ? 'Keine Treffer.' : 'Keine fehlenden Berechtigungen.'}
              </p>
            )}
          </div>

          {/* Shared */}
          <div className="rounded-lg border border-emerald-500/30 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10">
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
              <p className="text-xs font-semibold text-emerald-300 flex-1 truncate">
                Gemeinsame Berechtigungen – <span className="font-bold">{userData.Name || userData.Sam}</span>
                <span className="font-normal text-emerald-400/70"> & </span>
                <span className="font-bold">{result.compUser.DisplayName || result.compUser.SamAccountName}</span>
                <span className="ml-1.5 text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded-full font-mono">{result.shared.length}</span>
              </p>
            </div>
            <div className="p-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {filteredShared().map((g, i) => (
                <span key={i} className="px-2 py-0.5 text-[11px] rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-mono">{g}</span>
              ))}
              {filteredShared().length === 0 && <p className="text-[11px] text-muted-foreground italic">{filterQuery ? 'Keine Treffer.' : 'Keine gemeinsamen Gruppen.'}</p>}
            </div>
          </div>

          {/* Extra */}
          <div className="rounded-lg border border-blue-500/30 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10">
              <Info size={13} className="text-blue-400 shrink-0" />
              <p className="text-xs font-semibold text-blue-300 flex-1 truncate">
                Zusätzliche Berechtigungen – nur bei <span className="font-bold">{userData.Name || userData.Sam}</span>
                {userData.EmpID && <span className="font-normal text-blue-400/80"> ({userData.EmpID})</span>}
                <span className="ml-1.5 text-[10px] bg-blue-500/20 px-1.5 py-0.5 rounded-full font-mono">{result.extra.length}</span>
              </p>
            </div>
            <div className="p-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {filteredExtra().map((g, i) => (
                <span key={i} className="px-2 py-0.5 text-[11px] rounded border border-blue-500/30 bg-blue-500/10 text-blue-300 font-mono">{g}</span>
              ))}
              {filteredExtra().length === 0 && <p className="text-[11px] text-muted-foreground italic">{filterQuery ? 'Keine Treffer.' : 'Keine zusätzlichen Gruppen.'}</p>}
            </div>
          </div>

          {/* Action bar */}
          {selectedMissing.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <p className="text-[11px] text-muted-foreground flex-1">{selectedMissing.size} Berechtigung(en) ausgewählt</p>

              {/* Export dropdown */}
              <div className="relative">
                <button
                  onClick={() => setExportMenuOpen((p) => !p)}
                  disabled={exportLoading}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50"
                >
                  {exportLoading ? <Loader size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
                  Exportieren <ChevronDown size={11} />
                </button>
                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl overflow-hidden w-44">
                      <button onClick={() => handleExport('excel')} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors">
                        <FileSpreadsheet size={12} className="text-emerald-400" /> Excel (.xlsx)
                      </button>
                      <button onClick={() => handleExport('word')} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors">
                        <FileText size={12} className="text-blue-400" /> Word (.docx)
                      </button>
                      <button onClick={() => handleExport('pdf')} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors">
                        <File size={12} className="text-red-400" /> PDF
                      </button>
                    </div>
                  </>
                )}
              </div>

              {lastExportPath && (
                <button onClick={() => api().openPath(lastExportPath)} className="text-xs text-primary hover:text-primary/80 transition-colors">
                  Datei öffnen
                </button>
              )}

              {/* Email button */}
              <button
                onClick={openEmailModal}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Mail size={12} /> Per E-Mail versenden
              </button>
            </div>
          )}
        </div>
      )}

      {/* Email modal */}
      {showEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-[640px] max-h-[85vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                <Mail size={15} className="text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">E-Mail Berechtigungsanfrage</h2>
                  <p className="text-[11px] text-muted-foreground">Vorschau und Bearbeitung vor dem Versenden</p>
                </div>
              </div>
              <button onClick={() => setShowEmail(false)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Recipients */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Empfänger (An:)</label>
                <input
                  type="text"
                  placeholder="e.g. it-permissions@company.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Betreff (Subject)</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary transition-colors font-medium"
                />
              </div>
              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">E-Mail-Text (bearbeitbar)</label>
                <textarea
                  rows={16}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary transition-colors font-mono resize-y"
                />
              </div>
              {/* Attach export */}
              {lastExportPath && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <button onClick={() => setAttachExport((p) => !p)} className="text-muted-foreground hover:text-primary transition-colors">
                    {attachExport ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}
                  </button>
                  <span className="text-sm text-foreground">Exportierte Datei als Anhang beifügen</span>
                  <span className="text-[11px] text-muted-foreground font-mono truncate max-w-xs">{lastExportPath.split(/[\\/]/).pop()}</span>
                </label>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-border shrink-0">
              <button onClick={() => setShowEmail(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors">
                Abbrechen
              </button>
              <button
                onClick={sendEmail}
                disabled={!emailTo.trim() || emailSending}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {emailSending ? <Loader size={13} className="animate-spin" /> : <Mail size={13} />}
                Senden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
