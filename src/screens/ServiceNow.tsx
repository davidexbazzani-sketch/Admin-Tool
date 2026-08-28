import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Ticket, RefreshCw, Loader2, Search, ExternalLink, Settings as SettingsIcon,
  CheckCircle2, AlertTriangle, Filter, ListFilter, Flag, Users2, X, Save,
  LogIn, LogOut, ShieldCheck, KeyRound, Trash2, Eye, EyeOff, Plus,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import { ColumnFilter } from './UserOverview'
import { PersonInfoButton } from '../components/person/PersonDossier'
import { logDossierAction } from '../services/personDossier'
import {
  loadConfig, saveConfig, isConfigured, listTickets, recordUrl, certDiag,
  login, logout, loadIntegrationAccount, saveIntegrationAccount, testConnection,
  instanceHost, isDevInstance,
  createIncident, closeIncident, resolveSysUserSysId, resolveGroupSysId,
  CLOSE_CODES, DEFAULT_ASSIGNMENT_GROUPS,
  DEFAULT_INSTANCE, type ServiceNowConfig, type SnTable, type SnTicket, type CertDiag, type CloseState,
} from '../services/servicenow'

const TABLE_LABEL: Record<SnTable, string> = { incident: 'Incidents', task: 'Tasks' }

/** Assignment-Group-Eingabe (Komma/Semikolon/Zeilenumbruch getrennt) → Liste. */
function parseGroups(s: string): string[] {
  return s.split(/[,;\n]/).map(g => g.trim()).filter(Boolean)
}

export default function ServiceNow() {
  const authUser = useAuthStore(s => s.session?.user)
  const currentUser = authUser?.displayName || authUser?.username || 'unbekannt'
  const [cfg, setCfg] = useState<ServiceNowConfig | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [form, setForm] = useState<ServiceNowConfig>({ instanceUrl: DEFAULT_INSTANCE })
  const [groupsText, setGroupsText] = useState('')   // Assignment Groups (kommagetrennt, leer = alle)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [diag, setDiag] = useState<CertDiag | null>(null)
  // Integrationskonto (Basic Auth, zentral fuer alle App-User)
  const [intUser, setIntUser] = useState('')
  const [intPass, setIntPass] = useState('')
  const [intShowPass, setIntShowPass] = useState(false)
  const [intActive, setIntActive] = useState(false)
  const [intBusy, setIntBusy] = useState(false)
  // SSO-Anmeldestatus (Fallback ohne Integrationskonto)
  const [signedIn, setSignedIn] = useState(false)
  const [snUser, setSnUser] = useState<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

  const [table, setTable] = useState<SnTable>('incident')
  const [tickets, setTickets] = useState<SnTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(100)
  const [onlyActive, setOnlyActive] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [fState, setFState] = useState<Set<string>>(new Set())
  const [fPrio, setFPrio] = useState<Set<string>>(new Set())
  const [fGroup, setFGroup] = useState<Set<string>>(new Set())

  useEffect(() => {
    void (async () => {
      const [c, acc] = await Promise.all([loadConfig(), loadIntegrationAccount(true)])
      setCfg(c); setForm(c); setGroupsText((c.assignmentGroups ?? []).join(', '))
      if (acc) { setIntUser(acc.user); setIntPass(acc.pass); setIntActive(true) }
    })()
  }, [])

  // Integrationskonto speichern (zentral) + sofort testen
  async function saveIntegration() {
    setIntBusy(true); setTestResult(null)
    try {
      const u = intUser.trim()
      if (!u || !intPass) { setTestResult({ ok: false, msg: 'Benutzername und Passwort des Integrationskontos eingeben.' }); return }
      const test = await testConnection(form, { user: u, pass: intPass })
      if (!test.ok) { setTestResult({ ok: false, msg: 'Test fehlgeschlagen: ' + (test.error || 'unbekannt') + ' — Hinweis: Das Konto muss auf GENAU dieser Instanz existieren (dev/prod sind getrennte Konten!).' }); return }
      const groups = parseGroups(groupsText)
      const next = { ...form, assignmentGroups: groups }
      const ok = await saveIntegrationAccount(u, intPass, currentUser, form.instanceUrl, groups)
      if (!ok) { setTestResult({ ok: false, msg: 'Test OK, aber Speichern auf dem Netzlaufwerk fehlgeschlagen.' }); return }
      await saveConfig(next); setForm(next); setCfg(next)
      setIntActive(true); setNeedsLogin(false)
      setTestResult({ ok: true, msg: `Integrationskonto „${u}“ getestet & zentral gespeichert (Instanz ${instanceHost(form)}) — gilt ab jetzt für alle App-Nutzer.` })
      void load()
    } finally { setIntBusy(false) }
  }

  async function removeIntegration() {
    if (!window.confirm('Integrationskonto entfernen? Alle App-Nutzer fallen dann auf die SSO-Anmeldung zurück.')) return
    setIntBusy(true)
    try {
      await saveIntegrationAccount('', '', currentUser)
      setIntUser(''); setIntPass(''); setIntActive(false)
      setTestResult({ ok: true, msg: 'Integrationskonto entfernt — SSO-Anmeldung ist wieder aktiv.' })
    } finally { setIntBusy(false) }
  }

  async function load() {
    if (!cfg || !isConfigured(cfg)) { setShowConfig(true); return }
    setLoading(true); setError(null)
    const r = await listTickets(table, cfg, { limit, onlyActive })
    if (r.ok) { setTickets(r.tickets); setLoadedAt(new Date().toISOString()); setSignedIn(true); setNeedsLogin(false) }
    else {
      setTickets([])
      if (r.needsLogin) { setNeedsLogin(true); setSignedIn(false); setError(null) }
      else setError(r.error || 'Unbekannter Fehler')
    }
    setLoading(false)
  }
  // Neu laden bei Config/Tab/Limit/Active-Wechsel
  useEffect(() => { if (cfg && isConfigured(cfg)) void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cfg, table, limit, onlyActive])

  // Instanz-URL speichern (kein Passwort — Anmeldung erfolgt per SSO).
  async function saveInstance() {
    setTesting(true); setTestResult(null); setDiag(null)
    const next = { ...form, assignmentGroups: parseGroups(groupsText) }
    await saveConfig(next)
    setForm(next); setCfg(next)
    setTestResult({ ok: true, msg: 'Instanz-URL & Gruppenfilter gespeichert. Jetzt bei ServiceNow anmelden.' })
    setTesting(false)
  }

  // SSO-Anmeldung: öffnet das ServiceNow-Fenster; danach Tickets laden.
  async function doLogin() {
    setLoggingIn(true); setTestResult(null); setDiag(null)
    await saveConfig(form); setCfg(form)
    const r = await login(form)
    setLoggingIn(false)
    if (r.ok) {
      setSignedIn(true); setSnUser(r.user ?? null); setNeedsLogin(false)
      setTestResult({ ok: true, msg: r.user ? `Angemeldet als ${r.user}.` : 'Angemeldet.' })
      setShowConfig(false)
      void load()
    } else {
      setTestResult({ ok: false, msg: r.error || 'Anmeldung fehlgeschlagen.' })
      setDiag(await certDiag())
    }
  }

  async function doLogout() {
    await logout()
    setSignedIn(false); setSnUser(null); setNeedsLogin(true); setTickets([])
    setTestResult({ ok: true, msg: 'Abgemeldet.' })
  }
  async function refreshDiag() { setDiag(await certDiag()) }

  function fmtDiagTime(iso: string): string {
    const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function distinct(sel: (t: SnTicket) => string): Map<string, number> {
    const m = new Map<string, number>()
    for (const t of tickets) { const v = sel(t) || '(leer)'; m.set(v, (m.get(v) ?? 0) + 1) }
    return m
  }
  const dState = useMemo(() => distinct(t => t.state), [tickets])
  const dPrio = useMemo(() => distinct(t => t.priority), [tickets])
  const dGroup = useMemo(() => distinct(t => t.assignmentGroup), [tickets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter(t => {
      if (q && !([t.number, t.shortDescription, t.assignedTo, t.assignmentGroup, t.caller].some(v => v.toLowerCase().includes(q)))) return false
      if (fState.size && !fState.has(t.state || '(leer)')) return false
      if (fPrio.size && !fPrio.has(t.priority || '(leer)')) return false
      if (fGroup.size && !fGroup.has(t.assignmentGroup || '(leer)')) return false
      return true
    })
  }, [tickets, search, fState, fPrio, fGroup])

  const anyFilter = fState.size || fPrio.size || fGroup.size || search.trim()
  function resetFilters() { setSearch(''); setFState(new Set()); setFPrio(new Set()); setFGroup(new Set()) }

  function fmtRel(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso); if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }
  function openInSn(t: SnTicket) { if (cfg) void api().openExternal(recordUrl(cfg, t.table, t.sysId)) }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <Ticket size={22} className="text-primary" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            ServiceNow / Tickets
            {cfg && (
              <span className="text-[10px] font-mono font-normal px-1.5 py-0.5 rounded-full border bg-muted/30 text-muted-foreground border-border"
                title={isDevInstance(cfg) ? 'Dev-/Test-Instanz (von HCL für die Anbindung bereitgestellt)' : 'Aktive ServiceNow-Instanz'}>
                {instanceHost(cfg)}{isDevInstance(cfg) ? ' · DEV' : ''}
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            Incidents &amp; Tasks aus ServiceNow ansehen und filtern.
            {loadedAt && !loading && <> · zuletzt geladen {fmtRel(loadedAt)}</>}
          </p>
        </div>
        <button onClick={() => setShowConfig(v => !v)} title="ServiceNow-Zugang konfigurieren"
          className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground">
          <SettingsIcon size={14} />Zugang
        </button>
        <button onClick={load} disabled={loading || !isConfigured(cfg)} title="Neu laden"
          className="p-2 rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Zugang / Konfiguration */}
      {showConfig && (
        <div className="shrink-0 px-6 py-4 border-b border-border bg-muted/5">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs text-muted-foreground">
              Empfohlen: das <strong className="text-foreground">Integrationskonto</strong> (Basic Auth, vom ServiceNow-Support bereitgestellt) — wird zentral gespeichert und gilt für alle App-Nutzer, ohne Anmeldung.
              Ohne Integrationskonto greift der <strong className="text-foreground">SSO-Fallback</strong> (Anmeldung wie im Browser, Sitzung bleibt lokal).
            </p>
            <div className="grid grid-cols-1 gap-2">
              <label className="text-[11px] text-muted-foreground">Instanz-URL
                <div className="flex gap-2 mt-0.5">
                  <input value={form.instanceUrl} onChange={e => setForm(f => ({ ...f, instanceUrl: e.target.value }))} placeholder={DEFAULT_INSTANCE}
                    className="flex-1 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
                  <button onClick={saveInstance} disabled={testing || !form.instanceUrl.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">
                    {testing ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Speichern
                  </button>
                </div>
              </label>
              <label className="text-[11px] text-muted-foreground">Assignment Groups (nur diese Tickets laden — kommagetrennt, leer = alle)
                <input value={groupsText} onChange={e => setGroupsText(e.target.value)} placeholder="FS DE Hamburg, Marine infrastructure support"
                  className="w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
                <span className="block mt-0.5 text-[10px] text-muted-foreground/80">Serverseitiger Filter: es werden gezielt die Tickets dieser Gruppen geladen (behebt „falsche/leere" Liste). Über „Speichern" (Instanz) oder „Testen &amp; speichern" (Konto) übernehmen.</span>
              </label>
            </div>

            {/* Integrationskonto (Basic Auth, zentral) */}
            <div className="rounded-md border border-border bg-background/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <KeyRound size={14} className="text-blue-400" />
                <span className="text-xs font-semibold text-foreground">Integrationskonto (Basic Auth)</span>
                {intActive && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><ShieldCheck size={12} />aktiv — gilt für alle App-Nutzer</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <input value={intUser} onChange={e => setIntUser(e.target.value)} placeholder="Benutzer (z. B. automated_user)"
                  autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  className="w-56 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground font-mono focus:outline-none focus:border-primary" />
                <div className="relative flex-1 min-w-[220px]">
                  <input value={intPass} onChange={e => setIntPass(e.target.value)} placeholder="Passwort"
                    type={intShowPass ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                    className="w-full px-2.5 py-1.5 pr-8 text-sm rounded-md bg-background border border-border text-foreground font-mono focus:outline-none focus:border-primary" />
                  <button type="button" onClick={() => setIntShowPass(v => !v)} title={intShowPass ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground">
                    {intShowPass ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <button onClick={saveIntegration} disabled={intBusy || !intUser.trim() || !intPass}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                  {intBusy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Testen &amp; speichern
                </button>
                {intActive && (
                  <button onClick={removeIntegration} disabled={intBusy} title="Integrationskonto entfernen (zurück zu SSO)"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/40 disabled:opacity-40">
                    <Trash2 size={13} />Entfernen
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Wird beim Speichern getestet und zentral auf dem IT-Netzlaufwerk abgelegt (nur für die IT erreichbar). Passwort einfach per Copy&nbsp;&amp;&nbsp;Paste aus dem Support-Chat einfügen — Sonderzeichen sind kein Problem.
              </p>
            </div>

            {/* Anmeldestatus + SSO-Buttons (Fallback ohne Integrationskonto) */}
            {!intActive && <div className="flex items-center gap-2 flex-wrap">
              {signedIn ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300"><ShieldCheck size={14} />Angemeldet{snUser ? ` als ${snUser}` : ''}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-amber-300"><AlertTriangle size={14} />Nicht angemeldet</span>
              )}
              <button onClick={doLogin} disabled={loggingIn || !form.instanceUrl.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                {loggingIn ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}Bei ServiceNow anmelden (SSO)
              </button>
              {signedIn && (
                <button onClick={doLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent"><LogOut size={13} />Abmelden</button>
              )}
            </div>}
            {testResult && (
              <div className={`flex items-center gap-2 text-xs ${testResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {testResult.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{testResult.msg}
              </div>
            )}
            {/* Zertifikats-Diagnose (bei Client-Zertifikats-/Verbindungsproblemen) */}
            {diag !== null && (
              <div className="text-[11px] rounded-md border border-border bg-background/60 p-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-semibold text-foreground">Zertifikat-Diagnose</span>
                  <button onClick={refreshDiag} className="text-blue-400 hover:underline">aktualisieren</button>
                </div>
                {diag ? (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-muted-foreground">Client-Zertifikat-Anfrage zuletzt {fmtDiagTime(diag.at)} · <span className={diag.count > 0 ? 'text-emerald-300' : 'text-red-300'}>{diag.count} Zertifikat(e) sichtbar</span></p>
                    {diag.certs.map((c, i) => (
                      <p key={i} className="text-muted-foreground/80 font-mono truncate" title={`Aussteller: ${c.issuerName}`}>• {c.subjectName || '(kein Betreff)'} <span className="opacity-60">— {c.issuerName}</span></p>
                    ))}
                    {diag.count === 0 && <p className="text-amber-300">Kein Client-Zertifikat sichtbar → auf diesem Rechner ist keins im erreichbaren Speicher (mit IT/Zscaler klären).</p>}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">Bisher wurde keine Client-Zertifikat-Anfrage registriert (Handshake evtl. gar nicht bis dahin gekommen).</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => { setForm(cfg ?? form); setShowConfig(false); setTestResult(null) }}
                className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs + Filter */}
      <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-muted/5">
        <div className="flex items-center gap-1 mr-1">
          {(['incident', 'task'] as SnTable[]).map(t => (
            <button key={t} onClick={() => setTable(t)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${table === t ? 'border-primary/60 bg-primary/10 text-foreground font-semibold' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
              {TABLE_LABEL[t]}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(v => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold border ${showCreate ? 'border-primary bg-primary/10 text-foreground' : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'}`}>
          <Plus size={13} />Neues Ticket
        </button>
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nummer, Beschreibung, Bearbeiter…"
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        </div>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mx-1"><Filter size={11} />Filter</span>
        <ColumnFilter label="Status" icon={<ListFilter size={11} />} values={dState} selected={fState} onChange={setFState} />
        <ColumnFilter label="Priorität" icon={<Flag size={11} />} values={dPrio} selected={fPrio} onChange={setFPrio} />
        <ColumnFilter label="Gruppe" icon={<Users2 size={11} />} values={dGroup} selected={fGroup} onChange={setFGroup} />
        {anyFilter ? (
          <button onClick={resetFilters} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"><X size={11} />Filter zurücksetzen</button>
        ) : null}
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer ml-1">
          <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} className="accent-primary" />nur offene
        </label>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          max
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="px-1.5 py-1 rounded-md border border-border bg-background text-foreground focus:outline-none">
            <option value={50}>50</option><option value={100}>100</option><option value={250}>250</option><option value={500}>500</option>
          </select>
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} von {tickets.length}</span>
      </div>

      {/* Ticket erstellen (& schließen) */}
      {showCreate && cfg && (
        <CreateTicketPanel
          cfg={cfg} currentUser={currentUser}
          groups={cfg.assignmentGroups?.length ? cfg.assignmentGroups : [...DEFAULT_ASSIGNMENT_GROUPS]}
          onClose={() => setShowCreate(false)}
          onDone={() => { void load() }}
        />
      )}

      {/* Inhalt */}
      {needsLogin && !loading ? (
        <div className="flex flex-1 items-center justify-center text-center px-6">
          <div>
            <ShieldCheck size={40} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-foreground">Nicht bei ServiceNow angemeldet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">Melde dich per SSO an (wie im Browser). Die Sitzung bleibt danach lokal bestehen — kein Passwort nötig.</p>
            <button onClick={doLogin} disabled={loggingIn}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {loggingIn ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}Bei ServiceNow anmelden (SSO)
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm"><Loader2 size={14} className="animate-spin" />Lade Tickets aus ServiceNow…</div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-center px-6">
          <div>
            <AlertTriangle size={36} className="text-amber-400/70 mx-auto mb-3" />
            <p className="text-sm text-foreground">Tickets konnten nicht geladen werden</p>
            <p className="text-xs text-red-300 mt-1 max-w-lg">{error}</p>
            <button onClick={load} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">Erneut versuchen</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Nummer</th>
                <th className="px-3 py-2">Kurzbeschreibung</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Priorität</th>
                <th className="px-3 py-2">Bearbeiter</th>
                <th className="px-3 py-2">Gruppe</th>
                <th className="px-3 py-2">Melder</th>
                <th className="px-3 py-2">Geöffnet</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.sysId} className="border-b border-border/40 hover:bg-accent/10">
                  <td className="px-3 py-2 font-mono text-foreground">{t.number || '—'}</td>
                  <td className="px-3 py-2 text-foreground max-w-[28rem] truncate" title={t.shortDescription}>{t.shortDescription || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.state || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.priority || '—'}</td>
                  <td className="px-3 py-2 text-foreground">
                    {t.assignedTo ? <span className="inline-flex items-center gap-1">{t.assignedTo}<PersonInfoButton name={t.assignedTo} /></span> : <span className="text-muted-foreground/50 italic">nicht zugewiesen</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{t.assignmentGroup || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.caller ? <span className="inline-flex items-center gap-1">{t.caller}<PersonInfoButton name={t.caller} /></span> : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{t.openedAt || '—'}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => openInSn(t)} title="In ServiceNow öffnen" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/30"><ExternalLink size={13} /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                  Keine Tickets{anyFilter ? ` für die aktuellen Filter (durchsucht werden nur die ${tickets.length} geladenen Tickets)` : ''} — Instanz: <span className="font-mono">{instanceHost(cfg)}</span>{isDevInstance(cfg) ? ' (Dev-Instanz)' : ''}. Tipp: bei leerer Liste das Feld „Assignment Groups" (Zugang) leeren = alle Gruppen.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Panel: Incident erstellen (& schließen) ───────────────────────────────────
function CreateTicketPanel({ cfg, currentUser, groups, onClose, onDone }: {
  cfg: ServiceNowConfig; currentUser: string; groups: string[]; onClose: () => void; onDone: () => void
}) {
  const [caller, setCaller] = useState('')
  const [shortDesc, setShortDesc] = useState('')
  const [description, setDescription] = useState('')
  const [group, setGroup] = useState(groups[0] ?? '')
  const [assignee, setAssignee] = useState(currentUser)
  const [closeState, setCloseState] = useState<CloseState>('Resolved')
  const [closeCode, setCloseCode] = useState<string>(CLOSE_CODES[0])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: ReactNode } | null>(null)

  async function submit(close: boolean) {
    if (!shortDesc.trim()) { setResult({ ok: false, text: 'Bitte eine Kurzbeschreibung eingeben.' }); return }
    setBusy(true); setResult(null)
    try {
      const warn: string[] = []
      let callerSysId: string | undefined
      if (caller.trim()) {
        const r = await resolveSysUserSysId(cfg, caller)
        if (r.error) { setResult({ ok: false, text: r.error }); return }
        callerSysId = r.sysId
      }
      let assignmentGroupSysId: string | undefined
      if (group.trim()) {
        const r = await resolveGroupSysId(cfg, group)
        if (r.error) warn.push(r.error); else assignmentGroupSysId = r.sysId
      }
      let assignedToSysId: string | undefined
      if (assignee.trim()) {
        const r = await resolveSysUserSysId(cfg, assignee)
        if (r.error) warn.push(`Bearbeiter: ${r.error}`); else assignedToSysId = r.sysId
      }
      const created = await createIncident(cfg, { shortDescription: shortDesc, description, callerSysId, assignmentGroupSysId, assignedToSysId })
      if (!created.ok) { setResult({ ok: false, text: created.error || 'Erstellen fehlgeschlagen.' }); return }
      let closedNote = ''
      if (close && created.sysId) {
        const c = await closeIncident(cfg, created.sysId, { state: closeState, closeCode, closeNotes: description || shortDesc })
        closedNote = c.ok ? ` · ${closeState === 'Closed' ? 'geschlossen' : 'gelöst'}` : ` · Schließen fehlgeschlagen: ${c.error}`
      }
      if (caller.trim() && !caller.includes('@')) {
        void logDossierAction(caller.trim(), undefined, `ServiceNow-Ticket ${created.number ?? ''} erstellt${close ? ' & geschlossen' : ''} — ${shortDesc.trim()}`, currentUser, 'ServiceNow')
      }
      const link = created.sysId ? recordUrl(cfg, 'incident', created.sysId) : ''
      setResult({
        ok: true,
        text: (
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span>Ticket <strong>{created.number ?? '(ohne Nr.)'}</strong> erstellt{closedNote}.</span>
            {link && <button onClick={() => api().openExternal(link)} className="inline-flex items-center gap-1 text-blue-400 hover:underline"><ExternalLink size={12} />in ServiceNow öffnen</button>}
            {warn.length > 0 && <span className="text-amber-300">· {warn.join(' · ')}</span>}
          </span>
        ),
      })
      setShortDesc(''); setDescription('')
      onDone()
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary'

  return (
    <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/5">
      <div className="flex items-center gap-2 mb-2">
        <Ticket size={14} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Neues Incident (im Namen des Users)</h3>
        <button onClick={onClose} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground"><X size={15} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-foreground">Betroffener Benutzer (Name oder E-Mail)
          <input value={caller} onChange={e => setCaller(e.target.value)} placeholder="z. B. Max Mustermann / max@…" className={inputCls} />
        </label>
        <label className="text-[11px] text-muted-foreground">Bearbeiter (assigned_to)
          <input value={assignee} onChange={e => setAssignee(e.target.value)} className={inputCls} />
        </label>
        <label className="text-[11px] text-muted-foreground md:col-span-2">Kurzbeschreibung *
          <input value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder="Kurz, was das Problem war" className={inputCls} />
        </label>
        <label className="text-[11px] text-muted-foreground md:col-span-2">Beschreibung / Arbeitsnotiz (auch Abschlussnotiz)
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Was wurde gemacht?" className={inputCls} />
        </label>
        <label className="text-[11px] text-muted-foreground">Assignment Group
          <select value={group} onChange={e => setGroup(e.target.value)} className={inputCls}>
            <option value="">— keine —</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted-foreground">Abschluss
            <select value={closeState} onChange={e => setCloseState(e.target.value as CloseState)} className={inputCls}>
              <option value="Resolved">Resolved (gelöst)</option>
              <option value="Closed">Closed (geschlossen)</option>
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground">Close Code
            <select value={closeCode} onChange={e => setCloseCode(e.target.value)} className={inputCls}>
              {CLOSE_CODES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button onClick={() => submit(true)} disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Erstellen &amp; schließen
        </button>
        <button onClick={() => submit(false)} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
          <Plus size={14} />Nur erstellen
        </button>
        {result && <span className={`text-xs ${result.ok ? 'text-emerald-300' : 'text-red-300'}`}>{result.text}</span>}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">Läuft gegen die konfigurierte Instanz ({instanceHost(cfg) || cfg.instanceUrl}). Bei <strong>403</strong> fehlen dem Integrationskonto die Create/Update-Rechte auf incident (→ HCL).</p>
    </div>
  )
}
