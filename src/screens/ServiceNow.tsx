import { useEffect, useMemo, useState } from 'react'
import {
  Ticket, RefreshCw, Loader2, Search, ExternalLink, Settings as SettingsIcon,
  CheckCircle2, AlertTriangle, Filter, ListFilter, Flag, Users2, X, Save,
  LogIn, LogOut, ShieldCheck, KeyRound, Trash2, Eye, EyeOff,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import { ColumnFilter } from './UserOverview'
import { PersonInfoButton } from '../components/person/PersonDossier'
import {
  loadConfig, saveConfig, isConfigured, listTickets, recordUrl, certDiag,
  login, logout, loadIntegrationAccount, saveIntegrationAccount, testConnection,
  instanceHost, isDevInstance,
  DEFAULT_INSTANCE, type ServiceNowConfig, type SnTable, type SnTicket, type CertDiag,
} from '../services/servicenow'

const TABLE_LABEL: Record<SnTable, string> = { incident: 'Incidents', task: 'Tasks' }

export default function ServiceNow() {
  const authUser = useAuthStore(s => s.session?.user)
  const currentUser = authUser?.displayName || authUser?.username || 'unbekannt'
  const [cfg, setCfg] = useState<ServiceNowConfig | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [form, setForm] = useState<ServiceNowConfig>({ instanceUrl: DEFAULT_INSTANCE })
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
  const [fState, setFState] = useState<Set<string>>(new Set())
  const [fPrio, setFPrio] = useState<Set<string>>(new Set())
  const [fGroup, setFGroup] = useState<Set<string>>(new Set())

  useEffect(() => {
    void (async () => {
      const [c, acc] = await Promise.all([loadConfig(), loadIntegrationAccount(true)])
      setCfg(c); setForm(c)
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
      const ok = await saveIntegrationAccount(u, intPass, currentUser, form.instanceUrl)
      if (!ok) { setTestResult({ ok: false, msg: 'Test OK, aber Speichern auf dem Netzlaufwerk fehlgeschlagen.' }); return }
      await saveConfig(form); setCfg(form)
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
    await saveConfig(form)
    setCfg(form)
    setTestResult({ ok: true, msg: 'Instanz-URL gespeichert. Jetzt bei ServiceNow anmelden.' })
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
              <span className={`text-[10px] font-mono font-normal px-1.5 py-0.5 rounded-full border ${isDevInstance(cfg) ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-muted/30 text-muted-foreground border-border'}`}
                title={isDevInstance(cfg) ? 'Achtung: Dev-/Test-Instanz — hier liegen NICHT die echten Tickets!' : 'Aktive ServiceNow-Instanz'}>
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
                  Keine Tickets{anyFilter ? ` für die aktuellen Filter (durchsucht werden nur die ${tickets.length} geladenen Tickets)` : ''} — Instanz: <span className="font-mono">{instanceHost(cfg)}</span>{isDevInstance(cfg) ? ' (DEV — die echten Tickets liegen auf der Prod-Instanz!)' : ''}.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
