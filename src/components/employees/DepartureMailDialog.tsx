// ── Austritts-Mail-Dialog (Vorschau + manueller Versand / Nachfassen) ────────
// Zeigt die Vorschau der Reminder-Mail an den Manager (editierbar), erlaubt den
// manuellen Sofort-Versand, und – ab 1 Tag nach Austritt mit noch offenen Geräten
// – das Öffnen einer editierbaren Nachfass-Mail in Outlook (nach ServiceNow-Rückfrage).

import { useEffect, useState } from 'react'
import { Loader2, Mail, X, Check, AlertTriangle, Send, ExternalLink, Factory, Info } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../electronAPI'
import { daysUntil, formatGermanDate, type Departure } from '../../services/employees'
import {
  buildDepartureReminder, buildDepartureDunning, markReminderSent, SUPPORT_CC,
  type BuiltMail, type ReminderState,
} from '../../services/departureReminder'

const DAY = 24 * 60 * 60 * 1000

function Field({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} className={`w-full mt-0.5 px-2 py-1.5 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary ${mono ? 'font-mono' : ''}`} />
    </label>
  )
}

export default function DepartureMailDialog({ dep, reminderState, hasOpenDevices, startDunning = false, onClose, onSent }: {
  dep: Departure
  reminderState?: ReminderState
  hasOpenDevices: boolean
  startDunning?: boolean
  onClose: () => void
  onSent: () => void
}) {
  const user = useAuthStore(s => s.session?.user)
  const by = user?.displayName || user?.username || 'unbekannt'
  const days = daysUntil(dep.exitDate)
  const departed = !isNaN(days) && days < 0

  const [loading, setLoading] = useState(true)
  const [built, setBuilt] = useState<BuiltMail | null>(null)
  const [to, setTo] = useState('')
  const [cc, setCc] = useState(SUPPORT_CC)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  // Nachfass (Teil C)
  const [dunning, setDunning] = useState<BuiltMail | null>(null)
  const [snConfirm, setSnConfirm] = useState(false)
  const [composing, setComposing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    buildDepartureReminder(dep).then(m => {
      if (cancelled) return
      setBuilt(m)
      setTo(m.to || ''); setCc(m.cc); setSubject(m.subject); setBody(m.body)
      setLoading(false)
    }).catch(e => { if (!cancelled) { setError('Vorschau fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))); setLoading(false) } })
    if (departed && hasOpenDevices) {
      buildDepartureDunning(dep).then(m => { if (!cancelled) setDunning(m) }).catch(() => {})
      if (startDunning) setSnConfirm(true)
    }
    return () => { cancelled = true }
  }, [dep, departed, hasOpenDevices, startDunning])

  const statusLine = (() => {
    if (reminderState?.sentAt) return `Automatisch/manuell gesendet am ${formatGermanDate(reminderState.sentAt.slice(0, 10))}${reminderState.sentBy ? ` · ${reminderState.sentBy}` : ''}`
    if (reminderState?.preexisting) return 'Bestandsaustritt – kein automatischer Versand (nur manuell)'
    if (reminderState?.sendAt) {
      const d = Math.ceil((Date.parse(reminderState.sendAt) - Date.now()) / DAY)
      return d <= 0 ? 'Automatischer Versand steht unmittelbar an' : `Automatischer Versand geplant in ${d} Tag(en) (am ${formatGermanDate(reminderState.sendAt.slice(0, 10))})`
    }
    return 'Noch nicht terminiert'
  })()

  async function sendNow() {
    if (sending || !to.trim()) return
    setSending(true); setError(''); setResult('')
    try {
      const res = await api().sendEmailRaw({ to: to.trim(), cc: cc.trim(), subject, body, smtp: '', port: 587 })
      if (res.success) {
        await markReminderSent(dep.id, by)
        setResult('Reminder gesendet.')
        onSent()
        setTimeout(onClose, 900)
      } else {
        setError('Versand fehlgeschlagen: ' + (res.error || 'unbekannt'))
      }
    } catch (e) { setError('Versand fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setSending(false) }
  }

  async function openDunning() {
    if (!dunning) return
    setComposing(true); setError('')
    try {
      const r = await api().composeEmail({ to: dunning.to || '', cc: dunning.cc, subject: dunning.subject, body: dunning.body })
      if (!r.success) setError('Outlook-Entwurf konnte nicht geöffnet werden.')
      else { setSnConfirm(false); setResult('Entwurf in Outlook geöffnet – bitte prüfen und senden.') }
    } catch (e) { setError('Fehler: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setComposing(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-[640px] max-w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center gap-2">
          <Mail size={18} className="text-primary" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Reminder an Manager · {dep.name}</h2>
            <p className="text-[11px] text-muted-foreground">{statusLine}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 size={16} className="animate-spin" />Vorschau wird erstellt…</div>
          ) : (
            <>
              {departed && (
                <div className="px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/40 text-amber-100 text-xs flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span><b>{dep.name} ist bereits ausgetreten</b> (Austritt {formatGermanDate(dep.exitDate)}). Der Vorab-Reminder ist deshalb in der Vergangenheitsform formuliert – meist ist hier die <b>Nachfass-Mail</b> (unten „Rückgabe anmahnen") sinnvoller.</span>
                </div>
              )}

              {built && !built.ok && (
                <div className="px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                  <AlertTriangle size={13} />Keine Manager-E-Mail in AD gefunden (Manager: „{dep.manager}"). Bitte „An" manuell eintragen.
                </div>
              )}

              {/* Halle-Gruppen-PC-Hinweis */}
              {built && built.hallHints.length > 0 && (
                <div className="px-3 py-2 rounded-md bg-blue-500/5 border border-blue-500/20 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1 font-medium text-blue-300 mb-1"><Factory size={12} />Gruppen-PC(s) in der Halle – NICHT in der Mail:</div>
                  {built.hallHints.map((h, i) => (
                    <div key={i} className="font-mono">{h.hostname} ({h.model}) → Gruppen-PC, Name auf Manager umändern</div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Field label="An (Manager)" value={to} onChange={setTo} mono />
                <Field label="CC" value={cc} onChange={setCc} mono />
              </div>
              <Field label="Betreff" value={subject} onChange={setSubject} />
              <label className="block">
                <span className="text-[11px] text-muted-foreground">Nachricht (vor dem Senden anpassbar)</span>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="w-full mt-0.5 px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary leading-relaxed" />
              </label>

              {result && <div className="px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2"><Check size={13} />{result}</div>}
              {error && <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2"><AlertTriangle size={13} />{error}</div>}

              <div className="flex items-center gap-2">
                <button onClick={sendNow} disabled={sending || !to.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Reminder jetzt senden
                </button>
                <span className="text-[11px] text-muted-foreground">geht sofort raus (CC {SUPPORT_CC})</span>
              </div>

              {/* Teil C: Nachfass nach Austritt */}
              {departed && hasOpenDevices && (
                <div className="mt-2 pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-1"><AlertTriangle size={13} className="text-red-400" /><h3 className="text-sm font-semibold text-foreground">Nachfassen – Geräte noch nicht abgegeben</h3></div>
                  <p className="text-[11px] text-muted-foreground mb-2">Öffnet eine editierbare Mail in Outlook (kein Auto-Versand). Bitte vorher bestätigen, dass die Endgeräte-Übersicht aktuell ist.</p>
                  {!snConfirm ? (
                    <button onClick={() => setSnConfirm(true)} disabled={!dunning}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                      <ExternalLink size={13} />Rückgabe anmahnen (Outlook-Entwurf)
                    </button>
                  ) : (
                    <div className="px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
                      <div className="flex items-start gap-2 text-xs text-amber-100"><Info size={13} className="mt-0.5 shrink-0" />Ist die aktuelle ServiceNow-Bestandsliste in die Endgeräte-Übersicht hochgeladen?</div>
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={openDunning} disabled={composing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                          {composing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Ja – Entwurf öffnen
                        </button>
                        <button onClick={() => setSnConfirm(false)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent/40">Abbrechen</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
