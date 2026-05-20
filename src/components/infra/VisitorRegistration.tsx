import { useState, useEffect, useMemo } from 'react'
import {
  UserPlus, Send, RotateCcw, Eye, Info, AlertTriangle, CheckCircle,
  XCircle, Clock, ChevronDown, RefreshCw, Mail,
} from 'lucide-react'
import { useAuthStore, useIsMasterAdmin, useIsAdmin } from '../../store/authStore'
import { api } from '../../electronAPI'
import { createLogger } from '../../utils/activityLogger'
import Card from '../Card'

const log = createLogger('infra-marine')

const CONFIG_PATH = 'config/besucher_anmeldung.json'
const HISTORY_PATH = 'logs/besucher_anmeldungen.json'

interface VisitorConfig {
  recipientEmail: string
  subjectPrefix: string
  defaultTimeFrom: string
  defaultTimeTo: string
  quickReasons: string[]
}

interface HistoryEntry {
  timestamp: string
  user: string
  userId: string
  visitorName: string
  company: string
  reason: string
  period: string
  status: 'gesendet' | 'fehlgeschlagen'
}

const DEFAULT_CONFIG: VisitorConfig = {
  recipientEmail: 'power.ext.marine@skf.com',
  subjectPrefix: 'Anmeldung externer Besucher',
  defaultTimeFrom: '08:00',
  defaultTimeTo: '17:00',
  quickReasons: ['Wartung', 'Audit', 'Lieferantengespraech', 'Schulung'],
}

function fmtDate(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildEmailBody(p: {
  firstName: string; lastName: string; company: string
  companions: number; companionNames: string
  reason: string; mode: 'single' | 'range'
  date: string; dateEnd: string; timeFrom: string; timeTo: string
  note: string; hostName: string; hostPhone: string; hostEmail: string
  senderName: string
}): string {
  const lines: string[] = [
    'Guten Tag,',
    '',
    'hiermit moechte ich folgenden externen Besucher anmelden:',
    '',
    `Name:        ${p.firstName} ${p.lastName}`,
    `Firma:       ${p.company}`,
  ]

  if (p.companions > 0) {
    const names = p.companionNames.trim()
    lines.push(`Begleitung:  ${p.companions} Person(en)${names ? ' - ' + names : ''}`)
  }

  lines.push('', `Anlass:      ${p.reason}`, '')

  if (p.mode === 'single') {
    lines.push(`Datum:       ${fmtDate(p.date)}`)
    lines.push(`Uhrzeit:     von ${p.timeFrom} bis ${p.timeTo} Uhr`)
    lines.push('', 'Bitte fuer den genannten Zeitraum einen Besucherausweis bereitstellen.')
  } else {
    lines.push(`Zeitraum:    ${fmtDate(p.date)} bis ${fmtDate(p.dateEnd)}`)
    lines.push(`Uhrzeit:     taeglich von ${p.timeFrom} bis ${p.timeTo} Uhr`)
    lines.push('', 'Bitte fuer den gesamten Zeitraum einen Besucherausweis bereitstellen.')
  }

  if (p.note.trim()) {
    lines.push('', `Anmerkung:   ${p.note.trim()}`)
  }

  lines.push('', 'Interner Ansprechpartner / Gastgeber:', p.hostName)
  if (p.hostPhone.trim()) lines.push(`Tel.: ${p.hostPhone.trim()}`)
  if (p.hostEmail.trim()) lines.push(`E-Mail: ${p.hostEmail.trim()}`)

  lines.push('', 'Vielen Dank!', '', 'Mit freundlichen Gruessen', p.senderName)
  return lines.join('\n')
}

export default function VisitorRegistration() {
  const session = useAuthStore(s => s.session)
  const isMaster = useIsMasterAdmin()
  const isAdmin = useIsAdmin()
  const displayName = session?.user.displayName ?? ''
  const userId = session?.user.id ?? ''

  const [config, setConfig] = useState<VisitorConfig>(DEFAULT_CONFIG)

  // Form fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [company, setCompany] = useState('')
  const [companions, setCompanions] = useState(0)
  const [companionNames, setCompanionNames] = useState('')
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState<'single' | 'range'>('single')
  const [date, setDate] = useState(todayStr())
  const [dateEnd, setDateEnd] = useState(todayStr())
  const [timeFrom, setTimeFrom] = useState(DEFAULT_CONFIG.defaultTimeFrom)
  const [timeTo, setTimeTo] = useState(DEFAULT_CONFIG.defaultTimeTo)
  const [hostName, setHostName] = useState(displayName)
  const [hostPhone, setHostPhone] = useState('')
  const [hostEmail, setHostEmail] = useState('')
  const [note, setNote] = useState('')
  const [subjectOverride, setSubjectOverride] = useState('')

  // State
  const [sending, setSending] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showConfig, setShowConfig] = useState(false)

  // Load config
  useEffect(() => {
    ;(async () => {
      try {
        const data = await api().netReadJson<VisitorConfig>(CONFIG_PATH)
        if (data) {
          setConfig(data)
          setTimeFrom(data.defaultTimeFrom || '08:00')
          setTimeTo(data.defaultTimeTo || '17:00')
        }
      } catch { /* defaults */ }
    })()
  }, [])

  // Load history
  useEffect(() => {
    ;(async () => {
      try {
        const data = await api().netReadJson<HistoryEntry[]>(HISTORY_PATH)
        if (Array.isArray(data)) setHistory(data)
      } catch { /* none yet */ }
    })()
  }, [])

  // Cooldown
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  // Dynamic subject
  const autoSubject = useMemo(() => {
    const parts = [config.subjectPrefix]
    if (firstName || lastName) parts.push(`: ${firstName} ${lastName}`.trim())
    if (company) parts.push(` (${company})`)
    if (date) parts.push(` am ${fmtDate(date)}`)
    return parts.join('')
  }, [firstName, lastName, company, date, config.subjectPrefix])

  const subject = subjectOverride || autoSubject

  const emailBody = useMemo(() => buildEmailBody({
    firstName: firstName || '???', lastName: lastName || '???', company: company || '???',
    companions, companionNames, reason: reason || '???', mode, date, dateEnd, timeFrom, timeTo,
    note, hostName, hostPhone, hostEmail, senderName: displayName,
  }), [firstName, lastName, company, companions, companionNames, reason, mode, date, dateEnd, timeFrom, timeTo, note, hostName, hostPhone, hostEmail, displayName])

  const timeValid = mode === 'single' ? timeFrom < timeTo : true
  const dateValid = mode === 'range' ? date <= dateEnd : true
  const canSend = firstName.trim() && lastName.trim() && company.trim() && reason.trim() && hostName.trim() && date && timeValid && dateValid && !sending && cooldown === 0

  function resetForm() {
    setFirstName(''); setLastName(''); setCompany(''); setCompanions(0); setCompanionNames('')
    setReason(''); setMode('single'); setDate(todayStr()); setDateEnd(todayStr())
    setTimeFrom(config.defaultTimeFrom); setTimeTo(config.defaultTimeTo)
    setHostName(displayName); setHostPhone(''); setHostEmail(''); setNote(''); setSubjectOverride('')
    setToast(null)
  }

  async function handleSend() {
    setShowConfirm(false); setSending(true); setToast(null)
    const body = buildEmailBody({ firstName, lastName, company, companions, companionNames, reason, mode, date, dateEnd, timeFrom, timeTo, note, hostName, hostPhone, hostEmail, senderName: displayName })
    const periodStr = mode === 'single' ? `${fmtDate(date)} ${timeFrom}-${timeTo}` : `${fmtDate(date)} bis ${fmtDate(dateEnd)}`
    const entry: HistoryEntry = { timestamp: new Date().toISOString(), user: displayName, userId, visitorName: `${firstName} ${lastName}`, company, reason, period: periodStr, status: 'gesendet' }

    try {
      const res = await api().sendEmailRaw({ to: config.recipientEmail, subject, body, html: false, smtp: '', port: 0, method: 'outlook' })
      if (res.success) {
        setToast({ type: 'ok', msg: 'Besucheranmeldung erfolgreich an den Empfang gesendet' })
        log('Externe Besucheranmeldung gesendet', `${firstName} ${lastName} (${company}) - ${periodStr}`)
        setCooldown(60)
      } else {
        entry.status = 'fehlgeschlagen'
        setToast({ type: 'error', msg: res.error || 'Unbekannter Fehler' })
      }
    } catch (e) {
      entry.status = 'fehlgeschlagen'
      setToast({ type: 'error', msg: String(e) })
    } finally {
      setSending(false)
      const updated = [entry, ...history].slice(0, 100)
      setHistory(updated)
      try { await api().netWriteJson(HISTORY_PATH, updated) } catch { /* ok */ }
    }
  }

  async function handleCompose() {
    const body = buildEmailBody({ firstName, lastName, company, companions, companionNames, reason, mode, date, dateEnd, timeFrom, timeTo, note, hostName, hostPhone, hostEmail, senderName: displayName })
    await api().composeEmail({ to: config.recipientEmail, cc: '', subject, body })
  }

  async function saveConfig() {
    try {
      await api().netWriteJson(CONFIG_PATH, config)
      setToast({ type: 'ok', msg: 'Konfiguration gespeichert' })
    } catch (e) { setToast({ type: 'error', msg: String(e) }) }
  }

  const visibleHistory = isAdmin ? history : history.filter(h => h.userId === userId)

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <UserPlus size={22} className="text-blue-400" />
          <h2 className="text-lg font-bold text-foreground">Externe Besucher anmelden</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Anmeldung externer Besucher beim Empfang/Pforte ({config.recipientEmail})</p>
      </div>

      <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
        <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300">
          Mit diesem Formular wird der externe Besucher beim zustaendigen Empfang angemeldet. Die Anmeldung wird automatisch an {config.recipientEmail} gesendet. Fuer den angegebenen Zeitraum wird vom Empfang ein Besucherausweis vorbereitet.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Form */}
        <Card title="Anmeldeformular" icon={<Mail size={15} />}>
          <div className="space-y-4">
            {/* Recipient */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Empfaenger</label>
              <input value={config.recipientEmail} disabled className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-muted-foreground cursor-not-allowed" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Empfaenger ist fest hinterlegt</p>
            </div>

            {/* Subject */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Betreff</label>
              <input value={subjectOverride || autoSubject} onChange={e => setSubjectOverride(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>

            {/* Visitor block */}
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground font-medium block">Besucher *</label>
              <div className="grid grid-cols-2 gap-2">
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname *"
                  className="px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname *"
                  className="px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Firma *"
                className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-muted-foreground">Begleitpersonen:</label>
                <input type="number" min={0} max={20} value={companions} onChange={e => setCompanions(Math.max(0, Number(e.target.value) || 0))}
                  className="w-16 px-2 py-1 rounded-lg bg-background border border-border text-xs text-foreground" />
              </div>
              {companions > 0 && (
                <textarea value={companionNames} onChange={e => setCompanionNames(e.target.value)} rows={2} placeholder="Namen der Begleitpersonen"
                  className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary/50" />
              )}
            </div>

            {/* Reason + quick chips */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Anlass / Grund *</label>
              {config.quickReasons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {config.quickReasons.map(r => (
                    <button key={r} onClick={() => setReason(r)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${reason === r ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-muted/20 text-muted-foreground border-border hover:text-foreground'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              )}
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="z.B. Wartung Maschine S52, Audit, Lieferantengespraech"
                className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>

            {/* Date/Time */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Datum / Zeitraum *</label>
              <div className="flex gap-2 mb-2">
                {(['single', 'range'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${mode === m ? 'bg-primary/20 text-primary border-primary/40' : 'bg-muted/20 text-muted-foreground border-border hover:text-foreground'}`}>
                    {m === 'single' ? 'Einzelner Tag' : 'Zeitspanne'}
                  </button>
                ))}
              </div>

              {/* Time quick chips */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[{ l: 'Vormittag', f: '08:00', t: '12:00' }, { l: 'Nachmittag', f: '13:00', t: '17:00' }, { l: 'Ganztags', f: '08:00', t: '17:00' }].map(c => (
                  <button key={c.l} onClick={() => { setTimeFrom(c.f); setTimeTo(c.t) }}
                    className="px-2 py-0.5 rounded-full text-[10px] text-muted-foreground border border-border hover:text-foreground hover:bg-muted/20 transition-colors">
                    {c.l} ({c.f}-{c.t})
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">{mode === 'single' ? 'Datum' : 'Von'}</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                </div>
                {mode === 'range' && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">Bis</label>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-muted-foreground">Von (Uhr)</label>
                  <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Bis (Uhr)</label>
                  <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                </div>
              </div>
              {!timeValid && <p className="text-[10px] text-red-400 mt-1">Endzeit muss nach Startzeit liegen</p>}
              {!dateValid && <p className="text-[10px] text-red-400 mt-1">Enddatum darf nicht vor Startdatum liegen</p>}
              {mode === 'range' && <p className="text-[10px] text-muted-foreground mt-1">Der Besucherausweis wird fuer den gesamten Zeitraum benoetigt.</p>}
            </div>

            {/* Host */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Interner Ansprechpartner / Gastgeber *</label>
              <input value={hostName} onChange={e => setHostName(e.target.value)} placeholder="Name"
                className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground mb-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50" />
              <div className="grid grid-cols-2 gap-2">
                <input value={hostPhone} onChange={e => setHostPhone(e.target.value)} placeholder="Telefon (optional)"
                  className="px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                <input value={hostEmail} onChange={e => setHostEmail(e.target.value)} placeholder="E-Mail (optional)"
                  className="px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Anmerkung (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="z.B. Zugangsbereich Halle 5, Parkplatzbedarf"
                className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
              <button onClick={() => canSend ? setShowConfirm(true) : null} disabled={!canSend}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${canSend ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                <Send size={14} />{sending ? 'Sende...' : cooldown > 0 ? `Warten (${cooldown}s)` : 'Anmeldung senden'}
              </button>
              <button onClick={handleCompose} disabled={!firstName.trim() || !lastName.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-foreground hover:bg-muted/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Eye size={14} />In Outlook oeffnen
              </button>
              <button onClick={resetForm} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:text-foreground hover:bg-muted/20 transition-colors">
                <RotateCcw size={14} />Zuruecksetzen
              </button>
            </div>

            {toast && (
              <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${toast.type === 'ok' ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                {toast.type === 'ok' ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
                <div>
                  <p>{toast.msg}</p>
                  {toast.type === 'error' && (
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => setShowConfirm(true)} className="text-blue-400 underline text-[11px]">Erneut versuchen</button>
                      <button onClick={handleCompose} className="text-blue-400 underline text-[11px]">Als Entwurf oeffnen</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Preview */}
        <Card title="Vorschau der E-Mail" icon={<Eye size={15} />}>
          <div className="space-y-2 text-xs">
            <div><span className="text-muted-foreground font-medium">An: </span><span className="text-foreground">{config.recipientEmail}</span></div>
            <div><span className="text-muted-foreground font-medium">Betreff: </span><span className="text-foreground font-semibold">{subject}</span></div>
            <div className="pt-2 border-t border-border">
              <pre className="text-foreground whitespace-pre-wrap font-sans text-xs leading-relaxed">{emailBody}</pre>
            </div>
          </div>
        </Card>
      </div>

      {/* History */}
      <Card title="Letzte Anmeldungen" icon={<Clock size={15} />}
        actions={<button onClick={() => setShowHistory(p => !p)} className="text-muted-foreground hover:text-foreground"><ChevronDown size={16} className={showHistory ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>}>
        {showHistory && (
          visibleHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">Keine Anmeldungen vorhanden</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/30 text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Datum</th>
                  <th className="text-left px-3 py-2 font-medium">Anmelder</th>
                  <th className="text-left px-3 py-2 font-medium">Besucher</th>
                  <th className="text-left px-3 py-2 font-medium">Firma</th>
                  <th className="text-left px-3 py-2 font-medium">Zeitraum</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {visibleHistory.slice(0, 10).map((h, i) => (
                    <tr key={`${h.timestamp}-${i}`} className={`${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20`}>
                      <td className="px-3 py-2 text-muted-foreground">{new Date(h.timestamp).toLocaleString('de-DE')}</td>
                      <td className="px-3 py-2 text-foreground">{h.user}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{h.visitorName}</td>
                      <td className="px-3 py-2">{h.company}</td>
                      <td className="px-3 py-2">{h.period}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${h.status === 'gesendet' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{h.status}</span>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => {
                          const [fn, ...ln] = h.visitorName.split(' ')
                          setFirstName(fn || ''); setLastName(ln.join(' ') || '')
                          setCompany(h.company); setReason(h.reason); setDate(todayStr())
                        }} className="text-blue-400 hover:text-blue-300" title="Anmeldung wiederholen">
                          <RefreshCw size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

      {/* Master Admin Config */}
      {isMaster && (
        <Card title="Konfiguration (Master Admin)" icon={<UserPlus size={15} />}
          actions={<button onClick={() => setShowConfig(p => !p)} className="text-muted-foreground hover:text-foreground"><ChevronDown size={16} className={showConfig ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>}>
          {showConfig && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Empfaenger-E-Mail</label>
                <input value={config.recipientEmail} onChange={e => setConfig(c => ({ ...c, recipientEmail: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Standardzeit von</label>
                  <input type="time" value={config.defaultTimeFrom} onChange={e => setConfig(c => ({ ...c, defaultTimeFrom: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Standardzeit bis</label>
                  <input type="time" value={config.defaultTimeTo} onChange={e => setConfig(c => ({ ...c, defaultTimeTo: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Quick-Anlaesse (kommagetrennt)</label>
                <input value={config.quickReasons.join(', ')} onChange={e => setConfig(c => ({ ...c, quickReasons: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground" />
              </div>
              <button onClick={saveConfig} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                Konfiguration speichern
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowConfirm(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={20} className="text-yellow-400" />
              <h3 className="text-lg font-bold text-foreground">Anmeldung senden?</h3>
            </div>
            <p className="text-sm text-foreground mb-3">
              Moechtest du die Besucheranmeldung an <strong>{config.recipientEmail}</strong> wirklich senden?
            </p>
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 mb-4 space-y-1">
              <p><strong>Besucher:</strong> {firstName} {lastName} ({company})</p>
              <p><strong>Anlass:</strong> {reason}</p>
              <p><strong>Zeitraum:</strong> {mode === 'single' ? `${fmtDate(date)}, ${timeFrom}-${timeTo}` : `${fmtDate(date)} bis ${fmtDate(dateEnd)}, ${timeFrom}-${timeTo}`}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:bg-muted/20">Abbrechen</button>
              <button onClick={handleSend} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Anmeldung senden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
