import { useState, useEffect, useMemo } from 'react'
import {
  Printer, Send, RotateCcw, Mail, Info, AlertTriangle, CheckCircle,
  XCircle, Eye, ChevronDown, ChevronUp, RefreshCw, Clock,
} from 'lucide-react'
import { useAuthStore, useIsMasterAdmin, useIsAdmin } from '../../store/authStore'
import { api } from '../../electronAPI'
import { createLogger } from '../../utils/activityLogger'
import Card from '../Card'

const log = createLogger('infra-marine')

const CONFIG_PATH = 'config/tonerbestellung.json'
const HISTORY_PATH = 'logs/tonerbestellungen.json'

interface TonerConfig {
  recipientEmail: string
  defaultSubject: string
  company: string
  street: string
  zip: string
  city: string
  quickModels: string[]
}

interface OrderHistoryEntry {
  timestamp: string
  user: string
  userId: string
  toner: string
  quantity: number
  address: string
  status: 'gesendet' | 'fehlgeschlagen'
}

const DEFAULT_CONFIG: TonerConfig = {
  recipientEmail: 'tonerbestellung@hilkerundpahl.de',
  defaultSubject: 'Nachbestellung Toner',
  company: 'SKF Marine GmbH',
  street: 'Hermann-Blohm-Str. 5',
  zip: '20457',
  city: 'Hamburg',
  quickModels: ['TK3160', 'TK3170'],
}

function buildEmailBody(toner: string, qty: number, note: string, company: string, attn: string, street: string, zip: string, city: string, senderName: string): string {
  const qtyText = qty <= 1
    ? `wir bitten moeglichst zeitnah einmal die Druckerpatrone ${toner} nachzubestellen.`
    : `wir bitten moeglichst zeitnah einmal die Druckerpatrone ${toner} in der Menge von ${qty} Stueck nachzubestellen.`

  const parts = [
    'Guten Tag,',
    '',
    qtyText,
  ]

  if (note.trim()) {
    parts.push('', note.trim())
  }

  parts.push(
    '',
    company,
    `z.H.: ${attn}`,
    street,
    `${zip} ${city}`,
    '',
    '',
    'Vielen Dank!',
    '',
    'Mit freundlichen Gruessen',
    senderName,
  )

  return parts.join('\n')
}

export default function TonerOrder() {
  const session = useAuthStore(s => s.session)
  const isMaster = useIsMasterAdmin()
  const isAdmin = useIsAdmin()
  const displayName = session?.user.displayName ?? ''
  const userId = session?.user.id ?? ''

  // Config
  const [config, setConfig] = useState<TonerConfig>(DEFAULT_CONFIG)
  const [configLoaded, setConfigLoaded] = useState(false)

  // Form
  const [subject, setSubject] = useState(DEFAULT_CONFIG.defaultSubject)
  const [toner, setToner] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [attn, setAttn] = useState(displayName)
  const [company, setCompany] = useState(DEFAULT_CONFIG.company)
  const [street, setStreet] = useState(DEFAULT_CONFIG.street)
  const [zip, setZip] = useState(DEFAULT_CONFIG.zip)
  const [city, setCity] = useState(DEFAULT_CONFIG.city)

  // State
  const [sending, setSending] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [showPreview, setShowPreview] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<OrderHistoryEntry[]>([])
  const [showConfig, setShowConfig] = useState(false)

  // Load config from network
  useEffect(() => {
    ;(async () => {
      try {
        const data = await api().netReadJson<TonerConfig>(CONFIG_PATH)
        if (data) {
          setConfig(data)
          setSubject(data.defaultSubject || DEFAULT_CONFIG.defaultSubject)
          setCompany(data.company || DEFAULT_CONFIG.company)
          setStreet(data.street || DEFAULT_CONFIG.street)
          setZip(data.zip || DEFAULT_CONFIG.zip)
          setCity(data.city || DEFAULT_CONFIG.city)
        }
      } catch { /* use defaults */ }
      setConfigLoaded(true)
    })()
  }, [])

  // Load history
  useEffect(() => {
    ;(async () => {
      try {
        const data = await api().netReadJson<OrderHistoryEntry[]>(HISTORY_PATH)
        if (Array.isArray(data)) setHistory(data)
      } catch { /* no history yet */ }
    })()
  }, [])

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const emailBody = useMemo(() =>
    buildEmailBody(toner || '???', quantity, note, company, attn, street, zip, city, displayName),
    [toner, quantity, note, company, attn, street, zip, city, displayName]
  )

  const canSend = toner.trim() && quantity >= 1 && !sending && cooldown === 0

  function resetForm() {
    setSubject(config.defaultSubject)
    setToner('')
    setQuantity(1)
    setNote('')
    setAttn(displayName)
    setCompany(config.company)
    setStreet(config.street)
    setZip(config.zip)
    setCity(config.city)
    setToast(null)
  }

  async function handleSend() {
    setShowConfirm(false)
    setSending(true)
    setToast(null)

    const body = buildEmailBody(toner, quantity, note, company, attn, street, zip, city, displayName)
    const entry: OrderHistoryEntry = {
      timestamp: new Date().toISOString(),
      user: displayName,
      userId,
      toner,
      quantity,
      address: `${company}, ${attn}, ${street}, ${zip} ${city}`,
      status: 'gesendet',
    }

    try {
      const res = await api().sendEmailRaw({
        to: config.recipientEmail,
        subject,
        body,
        html: false,
        smtp: '',
        port: 0,
        method: 'outlook',
      })

      if (res.success) {
        setToast({ type: 'ok', msg: 'Bestellung erfolgreich an Hilker & Pahl gesendet' })
        log('Tonerbestellung gesendet', `${toner} x${quantity} an ${config.recipientEmail}`)
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
      // Save to history
      const updated = [entry, ...history].slice(0, 100)
      setHistory(updated)
      try { await api().netWriteJson(HISTORY_PATH, updated) } catch { /* ok */ }
    }
  }

  async function handleCompose() {
    const body = buildEmailBody(toner, quantity, note, company, attn, street, zip, city, displayName)
    await api().composeEmail({ to: config.recipientEmail, cc: '', subject, body })
  }

  async function saveConfig() {
    const newCfg: TonerConfig = { ...config, defaultSubject: subject, company, street, zip, city }
    try {
      await api().netWriteJson(CONFIG_PATH, newCfg)
      setConfig(newCfg)
      setToast({ type: 'ok', msg: 'Konfiguration gespeichert' })
    } catch (e) {
      setToast({ type: 'error', msg: String(e) })
    }
  }

  // Filter history for current user (non-admins only see own)
  const visibleHistory = isAdmin ? history : history.filter(h => h.userId === userId)

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Printer size={22} className="text-blue-400" />
          <h2 className="text-lg font-bold text-foreground">Tonerbestellung</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Druckerpatronen ueber Hilker & Pahl nachbestellen</p>
      </div>

      <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
        <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300">
          Der Lieferant Hilker & Pahl ist der feste Ansprechpartner fuer Toner- und Druckerpatronen-Nachbestellungen. Die Bestellanfrage wird automatisch an {config.recipientEmail} gesendet.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Form */}
        <Card title="Bestellformular" icon={<Mail size={15} />}>
          <div className="space-y-4">
            {/* Recipient (read-only) */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Empfaenger</label>
              <input value={config.recipientEmail} disabled className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-muted-foreground cursor-not-allowed" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Empfaenger ist fest hinterlegt</p>
            </div>

            {/* Subject */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Betreff *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>

            {/* Quick models */}
            {config.quickModels.length > 0 && (
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Schnellauswahl</label>
                <div className="flex flex-wrap gap-1.5">
                  {config.quickModels.map(m => (
                    <button key={m} onClick={() => setToner(m)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${toner === m ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-muted/20 text-muted-foreground border-border hover:text-foreground hover:bg-muted/30'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Toner designation */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Tonerbezeichnung / Druckerpatrone *</label>
              <input value={toner} onChange={e => setToner(e.target.value)} placeholder="z.B. TK3160"
                className={`w-full px-3 py-2 rounded-lg bg-background border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 ${!toner.trim() && configLoaded ? 'border-red-500/50' : 'border-border'}`} />
            </div>

            {/* Quantity */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Anzahl *</label>
              <input type="number" min={1} max={99} value={quantity} onChange={e => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                className="w-24 px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>

            {/* Note */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Anmerkung (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="z.B. dringend bis Freitag noetig"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>

            {/* Delivery address */}
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Lieferadresse</label>
              <div className="grid grid-cols-2 gap-2">
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Firma" className="col-span-2 px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                <input value={attn} onChange={e => setAttn(e.target.value)} placeholder="z.H. Name" className="col-span-2 px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Strasse" className="col-span-2 px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                <input value={zip} onChange={e => setZip(e.target.value)} placeholder="PLZ" className="px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ort" className="px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
              <button onClick={() => canSend ? setShowConfirm(true) : null} disabled={!canSend}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${canSend ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                <Send size={14} />{sending ? 'Sende...' : cooldown > 0 ? `Warten (${cooldown}s)` : 'Bestellung senden'}
              </button>
              <button onClick={() => handleCompose()} disabled={!toner.trim()}
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
      <Card title="Letzte Bestellungen" icon={<Clock size={15} />}
        actions={<button onClick={() => setShowHistory(p => !p)} className="text-muted-foreground hover:text-foreground"><ChevronDown size={16} className={showHistory ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>}>
        {showHistory && (
          visibleHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">Keine Bestellungen vorhanden</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/30 text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Datum</th>
                  <th className="text-left px-3 py-2 font-medium">Besteller</th>
                  <th className="text-left px-3 py-2 font-medium">Toner</th>
                  <th className="text-left px-3 py-2 font-medium">Menge</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {visibleHistory.slice(0, 10).map((h, i) => (
                    <tr key={`${h.timestamp}-${i}`} className={`${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20`}>
                      <td className="px-3 py-2 text-muted-foreground">{new Date(h.timestamp).toLocaleString('de-DE')}</td>
                      <td className="px-3 py-2 text-foreground">{h.user}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{h.toner}</td>
                      <td className="px-3 py-2">{h.quantity}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${h.status === 'gesendet' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{h.status}</span>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => { setToner(h.toner); setQuantity(h.quantity) }}
                          className="text-blue-400 hover:text-blue-300 text-[11px]" title="Bestellung wiederholen">
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
        <Card title="Konfiguration (Master Admin)" icon={<Printer size={15} />}
          actions={<button onClick={() => setShowConfig(p => !p)} className="text-muted-foreground hover:text-foreground"><ChevronDown size={16} className={showConfig ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>}>
          {showConfig && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Empfaenger-E-Mail</label>
                <input value={config.recipientEmail} onChange={e => setConfig(c => ({ ...c, recipientEmail: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Haeufig bestellte Toner (kommagetrennt)</label>
                <input value={config.quickModels.join(', ')} onChange={e => setConfig(c => ({ ...c, quickModels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
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
              <h3 className="text-lg font-bold text-foreground">Bestellung senden?</h3>
            </div>
            <p className="text-sm text-foreground mb-3">
              Moechtest du die Bestellung an <strong>{config.recipientEmail}</strong> wirklich senden?
            </p>
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 mb-4 space-y-1">
              <p><strong>Toner:</strong> {toner}</p>
              <p><strong>Menge:</strong> {quantity}</p>
              <p><strong>Lieferadresse:</strong> {company}, z.H. {attn}, {street}, {zip} {city}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:bg-muted/20">Abbrechen</button>
              <button onClick={handleSend} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Bestellung senden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
