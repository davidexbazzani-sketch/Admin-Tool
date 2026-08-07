import { useEffect, useMemo, useState } from 'react'
import {
  Phone, Search, Mail, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Trash2, Settings2, Send, UserPlus, Database, Upload, HardDriveDownload,
} from 'lucide-react'
import { api } from '../electronAPI'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import { createLogger } from '../utils/activityLogger'
import {
  loadPhoneConfig, savePhoneConfig, loadPhoneList, assignNumber, releaseNumber,
  resolveTemplate, sendAssignmentMail, phoneDbExists, importPhoneDb, getPhoneDbDisplayPath,
  DEFAULT_PHONE_CONFIG,
  type PhoneAssignConfig, type PhoneListData, type PhoneEntry,
} from '../services/phoneAssignment'

const log = createLogger('rufnummer-vergabe')

interface ExtraRecipient {
  email: string
  enabled: boolean
}

interface AssignedInfo {
  name: string
  nummer: number
}

export default function PhoneAssignment() {
  const [cfg, setCfg] = useState<PhoneAssignConfig>(DEFAULT_PHONE_CONFIG)
  const [dbExists, setDbExists] = useState<boolean | null>(null)
  const [dbPath, setDbPath] = useState('')
  const [data, setData] = useState<PhoneListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // ── Import (Ersteinrichtung / Neu-Import) ──
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  // ── Vergabe ──
  const [name, setName] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState('')
  const [duplicateInfo, setDuplicateInfo] = useState<{ name: string; nummer: number | null } | null>(null)
  const [assigned, setAssigned] = useState<AssignedInfo | null>(null)

  // ── Mail ──
  const [hrChecked, setHrChecked] = useState(true)
  const [extras, setExtras] = useState<ExtraRecipient[]>([
    { email: '', enabled: false }, { email: '', enabled: false }, { email: '', enabled: false },
  ])
  const [mailSubject, setMailSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [sending, setSending] = useState(false)
  const [mailResult, setMailResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // ── Datenbank-Übersicht ──
  const [search, setSearch] = useState('')
  const [releaseTarget, setReleaseTarget] = useState<PhoneEntry | null>(null)
  const [releasing, setReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState('')

  // ── Einstellungen ──
  const [showSettings, setShowSettings] = useState(false)
  const [cfgDraft, setCfgDraft] = useState<PhoneAssignConfig>(DEFAULT_PHONE_CONFIG)
  const [cfgSaved, setCfgSaved] = useState(false)

  async function reload() {
    setLoading(true)
    setLoadError('')
    try {
      const exists = await phoneDbExists()
      setDbExists(exists)
      setData(exists ? await loadPhoneList() : null)
    } catch (err) {
      setData(null)
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [c, p] = await Promise.all([loadPhoneConfig(), getPhoneDbDisplayPath()])
      if (cancelled) return
      setCfg(c)
      setCfgDraft(c)
      setDbPath(p)
      await reload()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doImport() {
    const path = await api().openFileDialog([{ name: 'Excel', extensions: ['xlsx'] }])
    if (!path) return
    setImporting(true)
    setImportMsg(null)
    try {
      const stats = await importPhoneDb(path)
      setImportMsg({ ok: true, msg: `Import erfolgreich: ${stats.gesamt} Durchwahlen (${stats.vergeben} vergeben, ${stats.frei} frei).` })
      log('Durchwahlliste importiert', `${stats.gesamt} Einträge`)
      await reload()
    } catch (err) {
      setImportMsg({ ok: false, msg: err instanceof Error ? err.message : String(err) })
    } finally {
      setImporting(false)
    }
  }

  async function doAssign() {
    const cleanName = name.trim().replace(/\s+/g, ' ')
    if (!cleanName) return
    setAssigning(true)
    setAssignError('')
    setDuplicateInfo(null)
    setAssigned(null)
    setMailResult(null)
    try {
      const result = await assignNumber(cleanName)
      if (result.status === 'exists') {
        setDuplicateInfo({ name: cleanName, nummer: result.nummer })
      } else {
        setAssigned({ name: cleanName, nummer: result.nummer })
        setMailSubject(resolveTemplate(cfg.subjectTemplate, cleanName, result.nummer))
        setMailBody(resolveTemplate(cfg.bodyTemplate, cleanName, result.nummer))
        setHrChecked(true)
        log('Durchwahl vergeben', `${cleanName} → ${result.nummer}`)
        await reload()
      }
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : String(err))
    } finally {
      setAssigning(false)
    }
  }

  async function doSendMail() {
    if (!assigned) return
    const recipients: string[] = []
    if (hrChecked && cfg.hrEmail.trim()) recipients.push(cfg.hrEmail.trim())
    for (const ex of extras) {
      if (ex.enabled && ex.email.trim()) recipients.push(ex.email.trim())
    }
    setSending(true)
    setMailResult(null)
    try {
      await sendAssignmentMail(recipients, mailSubject, mailBody)
      setMailResult({ ok: true, msg: `Mail an ${recipients.join(', ')} versendet.` })
      log('Vergabe-Mail versendet', `${assigned.name} (${assigned.nummer}) → ${recipients.join(', ')}`)
    } catch (err) {
      setMailResult({ ok: false, msg: err instanceof Error ? err.message : String(err) })
    } finally {
      setSending(false)
    }
  }

  async function doRelease() {
    if (!releaseTarget) return
    setReleasing(true)
    setReleaseError('')
    try {
      await releaseNumber(releaseTarget)
      log('Durchwahl freigegeben', `${releaseTarget.user} (${releaseTarget.nummer})`)
      setReleaseTarget(null)
      await reload()
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : String(err))
    } finally {
      setReleasing(false)
    }
  }

  async function doSaveConfig() {
    await savePhoneConfig(cfgDraft)
    setCfg(cfgDraft)
    setCfgSaved(true)
    setTimeout(() => setCfgSaved(false), 2500)
  }

  const filteredEntries = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.entries
    return data.entries.filter(e =>
      (e.nummer !== null && String(e.nummer).includes(q)) ||
      e.user.toLowerCase().includes(q) ||
      e.abt.toLowerCase().includes(q) ||
      e.bemerkung.toLowerCase().includes(q)
    )
  }, [data, search])

  const inputCls = 'w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary'

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">📞 Rufnummer Vergabe</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Nächste freie Xelion-Durchwahl aus der zentralen Durchwahlliste vergeben — mit automatischer HR-Benachrichtigung
          </p>
        </div>
        <button
          onClick={() => setShowSettings(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors"
        >
          <Settings2 size={13} /> Einstellungen
        </button>
      </div>

      {/* ── Einstellungen ── */}
      {showSettings && (
        <Card title="Einstellungen">
          <div className="space-y-3 max-w-2xl">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Zentrale Datenbank (Netzwerk-Speicher des Admin Tools)</label>
              <div className="flex gap-2 items-center">
                <input type="text" value={dbPath} readOnly className={`${inputCls} font-mono text-xs opacity-70`} />
                <button
                  onClick={doImport}
                  disabled={importing}
                  title="Eine Durchwahlliste.xlsx auswählen und als zentrale Datenbank hochladen (bestehende wird vorher gesichert)"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors shrink-0 disabled:opacity-50"
                >
                  {importing ? <Spinner size={13} /> : <Upload size={13} />} Excel neu importieren
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">HR-E-Mail (Standard-Empfänger)</label>
              <input
                type="text"
                value={cfgDraft.hrEmail}
                onChange={e => setCfgDraft(d => ({ ...d, hrEmail: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Betreff-Vorlage</label>
              <input
                type="text"
                value={cfgDraft.subjectTemplate}
                onChange={e => setCfgDraft(d => ({ ...d, subjectTemplate: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Text-Vorlage — Platzhalter: {'{name}'}, {'{durchwahl}'}, {'{rufnummer}'}
              </label>
              <textarea
                value={cfgDraft.bodyTemplate}
                onChange={e => setCfgDraft(d => ({ ...d, bodyTemplate: e.target.value }))}
                rows={8}
                className={`${inputCls} resize-none font-mono text-xs`}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={doSaveConfig}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Speichern
              </button>
              {cfgSaved && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> Gespeichert (gilt für alle Benutzer)</span>}
            </div>
          </div>
        </Card>
      )}

      {/* ── Import-Feedback ── */}
      {importMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${importMsg.ok ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-destructive/10 border-destructive/20'}`}>
          {importMsg.ok
            ? <CheckCircle size={14} className="text-emerald-400 shrink-0" />
            : <XCircle size={14} className="text-destructive shrink-0" />}
          <span className={`text-sm flex-1 ${importMsg.ok ? 'text-emerald-400' : 'text-destructive'}`}>{importMsg.msg}</span>
          <button onClick={() => setImportMsg(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
        </div>
      )}

      {/* ── Lade-Fehler (z. B. Netzlaufwerk nicht erreichbar) ── */}
      {loadError && (
        <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-xl">
          <XCircle size={14} className="text-destructive shrink-0" />
          <span className="text-sm text-destructive flex-1">{loadError}</span>
          <button
            onClick={reload}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          >
            <RefreshCw size={12} /> Erneut versuchen
          </button>
        </div>
      )}

      {/* ── Ersteinrichtung: Excel-Liste importieren ── */}
      {dbExists === false && !loading && (
        <Card title="Ersteinrichtung — Durchwahlliste importieren">
          <div className="flex flex-col items-start gap-3 max-w-2xl">
            <p className="text-sm text-muted-foreground">
              Auf dem zentralen Netzwerk-Speicher des Admin Tools wurde noch keine Durchwahl-Datenbank gefunden.
              Importiere einmalig die bestehende <span className="font-mono text-xs">Durchwahlliste.xlsx</span> —
              sie wird dann unter <span className="font-mono text-xs">{dbPath}</span> abgelegt und ist ab sofort
              für alle Benutzer des Tools die gemeinsame Datenquelle.
            </p>
            <button
              onClick={doImport}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importing ? <Spinner size={14} /> : <HardDriveDownload size={14} />}
              Durchwahlliste.xlsx auswählen und importieren
            </button>
          </div>
        </Card>
      )}

      {/* ── Neue Durchwahl vergeben ── */}
      {dbExists && (
        <Card title="Neue Durchwahl vergeben">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px] max-w-sm">
              <label className="block text-xs text-muted-foreground mb-1">Vor- und Nachname des neuen Mitarbeiters</label>
              <input
                type="text"
                placeholder="z. B. Max Mustermann"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !assigning) doAssign() }}
                className={inputCls}
              />
            </div>
            <button
              onClick={doAssign}
              disabled={assigning || !name.trim() || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {assigning ? <Spinner size={14} /> : <UserPlus size={14} />}
              Durchwahl vergeben
            </button>
            {data?.nextFree && (
              <span className="text-xs text-muted-foreground pb-2.5">
                Nächste freie Durchwahl: <span className="font-mono font-semibold text-emerald-400">{data.nextFree.nummer}</span>
              </span>
            )}
          </div>

          {assignError && (
            <div className="flex items-center gap-2 px-3 py-2 mt-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <XCircle size={13} className="text-destructive shrink-0" />
              <span className="text-xs text-destructive">{assignError}</span>
            </div>
          )}

          {duplicateInfo && (
            <div className="flex items-center gap-2 px-3 py-2 mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              <span className="text-xs text-amber-400">
                {duplicateInfo.name} besitzt bereits {duplicateInfo.nummer !== null ? `die Durchwahl ${duplicateInfo.nummer}` : 'eine Durchwahl'}. Es wurde nichts geändert.
              </span>
              <button onClick={() => setDuplicateInfo(null)} className="ml-auto text-amber-400/60 hover:text-amber-400 text-xs">✕</button>
            </div>
          )}

          {assigned && (
            <div className="flex items-center gap-2 px-3 py-2 mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <CheckCircle size={13} className="text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-400">
                <span className="font-semibold">{assigned.name}</span> wurde die Durchwahl{' '}
                <span className="font-mono font-semibold">{assigned.nummer}</span> (+49 40 3011 {assigned.nummer}) zugewiesen und in der zentralen Liste eingetragen.
              </span>
            </div>
          )}
        </Card>
      )}

      {/* ── E-Mail-Benachrichtigung (nach erfolgreicher Vergabe) ── */}
      {assigned && (
        <Card title="E-Mail-Benachrichtigung">
          <div className="space-y-3 max-w-2xl">
            <p className="text-xs text-muted-foreground">Empfänger auswählen:</p>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hrChecked}
                onChange={e => setHrChecked(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">HR</span>
              <span className="text-xs text-muted-foreground font-mono">{cfg.hrEmail}</span>
            </label>

            {extras.map((ex, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={ex.enabled}
                  onChange={e => setExtras(list => list.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))}
                  className="accent-primary shrink-0"
                />
                <input
                  type="text"
                  placeholder={`Weiterer Empfänger ${i + 1} (optional)`}
                  value={ex.email}
                  onChange={e => {
                    const v = e.target.value
                    setExtras(list => list.map((x, j) => j === i ? { email: v, enabled: v.trim() ? x.enabled || ex.email.trim() === '' : false } : x))
                  }}
                  className={`${inputCls} max-w-sm`}
                />
              </div>
            ))}

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Betreff</label>
              <input
                type="text"
                value={mailSubject}
                onChange={e => setMailSubject(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nachricht (anpassbar)</label>
              <textarea
                value={mailBody}
                onChange={e => setMailBody(e.target.value)}
                rows={9}
                className={`${inputCls} resize-none`}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={doSendMail}
                disabled={sending || (!hrChecked && !extras.some(x => x.enabled && x.email.trim()))}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {sending ? <Spinner size={14} /> : <Send size={14} />}
                Mail senden
              </button>
              <button
                onClick={() => { setAssigned(null); setMailResult(null); setName('') }}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors"
              >
                Fertig / Ohne Mail abschließen
              </button>
            </div>

            {mailResult && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${mailResult.ok ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-destructive/10 border-destructive/20'}`}>
                {mailResult.ok
                  ? <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                  : <XCircle size={13} className="text-destructive shrink-0" />}
                <span className={`text-xs ${mailResult.ok ? 'text-emerald-400' : 'text-destructive'}`}>{mailResult.msg}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Datenbank-Übersicht ── */}
      {dbExists && (
        <Card
          title="Datenbank-Übersicht"
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Suchen (Name, Nummer, Abt.)..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-56"
                />
              </div>
              <button
                onClick={reload}
                disabled={loading}
                title="Liste neu vom Netzwerk laden"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Aktualisieren
              </button>
            </div>
          }
        >
          {/* Statistik */}
          {data && (
            <div className="flex flex-wrap gap-3 mb-4">
              {[
                { label: 'Durchwahlen gesamt', value: data.stats.gesamt, cls: 'text-foreground' },
                { label: 'Vergeben', value: data.stats.vergeben, cls: 'text-blue-400' },
                { label: 'Frei', value: data.stats.frei, cls: 'text-emerald-400' },
                { label: 'Mit Bemerkung (gesperrt)', value: data.stats.gesperrt, cls: 'text-amber-400' },
              ].map(s => (
                <div key={s.label} className="px-4 py-2.5 rounded-lg bg-muted/30 border border-border min-w-[120px]">
                  <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {releaseError && (
            <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <XCircle size={13} className="text-destructive shrink-0" />
              <span className="text-xs text-destructive flex-1">{releaseError}</span>
              <button onClick={() => setReleaseError('')} className="text-destructive/60 hover:text-destructive text-xs">✕</button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm">
              <Spinner size={16} /> Durchwahlliste wird vom Netzwerk geladen...
            </div>
          ) : data ? (
            <div className="overflow-x-auto overflow-y-auto max-h-[55vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1"><Phone size={11} /> Durchwahl</span>
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Abt.</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Mitarbeiter</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Bemerkung</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredEntries.map(e => (
                    <tr key={e.row} className="hover:bg-accent/20 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs text-foreground">{e.nummer ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{e.abt || '—'}</td>
                      <td className="px-3 py-2 text-foreground">{e.user || '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[260px] truncate" title={e.bemerkung}>{e.bemerkung || '—'}</td>
                      <td className="px-3 py-2">
                        {e.status === 'vergeben' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">Vergeben</span>
                        ) : e.status === 'gesperrt' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">Gesperrt</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500 text-black border border-emerald-500/20">Frei</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {e.status !== 'frei' && (
                          <button
                            onClick={() => { setReleaseError(''); setReleaseTarget(e) }}
                            title="Eintrag löschen und Durchwahl wieder freigeben"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                          >
                            <Trash2 size={11} /> Freigeben
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">Keine Einträge gefunden.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
              <Database size={15} /> Durchwahlliste konnte nicht geladen werden.
            </div>
          )}
        </Card>
      )}

      {/* ── Freigeben-Bestätigung ── */}
      {releaseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-[440px] space-y-4 shadow-2xl">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" /> Durchwahl freigeben?
            </h2>
            <p className="text-sm text-muted-foreground">
              Die Durchwahl <span className="font-mono font-semibold text-foreground">{releaseTarget.nummer}</span>
              {releaseTarget.user && <> von <span className="font-semibold text-foreground">{releaseTarget.user}</span></>} wird freigegeben.
              Mitarbeiter, Abteilung und Bemerkung werden aus der zentralen Liste entfernt — die Nummer steht danach für alle wieder zur Vergabe bereit.
              Vor dem Speichern wird automatisch ein Backup angelegt.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setReleaseTarget(null)}
                disabled={releasing}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={doRelease}
                disabled={releasing}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {releasing ? <Spinner size={13} /> : <Trash2 size={13} />}
                Freigeben
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Mail size={11} />
        <span>Mailversand erfolgt über Outlook. Zentrale Datenbank: <span className="font-mono">{dbPath}</span></span>
      </div>
    </div>
  )
}
