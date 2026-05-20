import { useState, useMemo } from 'react'
import {
  AlertTriangle, ExternalLink, Search, X, Send, ChevronDown, ChevronUp,
  Clock, Phone, Mail, Server, Wifi, Monitor, Zap, Building2, Eye, Shield,
  FileText, Users, Crown, CheckCircle, Info, Edit3, ArrowLeft,
} from 'lucide-react'
import { useAuthStore, useCanAccess, useIsMasterAdmin } from '../../store/authStore'
import ContactEditor from './ContactEditor'
import { api } from '../../electronAPI'
import { createLogger } from '../../utils/activityLogger'
import Card from '../Card'
import {
  DOC_META, ROLES, LEGAL_BASES, MELDEWEG_STEPS, ESCALATION_LEVELS,
  BSI_DEADLINES, CRISIS_SCENARIOS, PRIMARY_CHANNELS, EMERGENCY_COMM_LEVELS,
  CONTACT_TABS, type ContactEntry,
} from '../../data/incidentResponseData'

const log = createLogger('infra-marine')
const SHAREPOINT_URL = 'https://skfgroup.sharepoint.com/sites/cs-marine-it'

const ICON_MAP: Record<string, React.ReactNode> = {
  Server: <Server size={16} />, Wifi: <Wifi size={16} />, Monitor: <Monitor size={16} />,
  Zap: <Zap size={16} />, Building2: <Building2 size={16} />, Phone: <Phone size={16} />,
  Shield: <Shield size={16} />, Crown: <Crown size={16} />, Users: <Users size={16} />,
}

// ── E-Mail-Vorlagen pro Bereich ──────────────────────────────────────────────

interface ContextMailTemplate {
  id: string
  label: string
  subject: string
  body: string
  contactGroups: string[] // which contact tab IDs are relevant
}

const MELDEWEG_MAIL_TEMPLATES: ContextMailTemplate[] = [
  {
    id: 'ausfallzeit-info',
    label: 'Manager ueber Ausfallzeit informieren',
    subject: 'IT-Stoerung: Geschaetzte Ausfallzeit {ausfallzeit} - {betroffeneSysteme}',
    body: `Sehr geehrte Damen und Herren,

wir haben aktuell eine IT-Stoerung, die folgende Systeme/Dienste betrifft:

Betroffene Systeme: {betroffeneSysteme}
Betroffene Mitarbeiter: ca. {anzahlUser}
Stoerung seit: {stoerungSeit}
Geschaetzte Ausfallzeit: {ausfallzeit}

Aktueller Stand:
{aktuellerStand}

Wir arbeiten an der Behebung und halten Sie auf dem Laufenden.

Mit freundlichen Gruessen
{absender}
IT-Abteilung - SKF Marine GmbH`,
    contactGroups: ['management', 'managers'],
  },
  {
    id: 'eskalation-support',
    label: 'Problem an Support eskalieren (Ticket + Info)',
    subject: '[INCIDENT] SKF Marine Hamburg - {betroffeneSysteme} - Sofortige Unterstuetzung erforderlich',
    body: `Dear Support Team,

We are currently experiencing a service disruption at SKF Marine Hamburg.

Affected systems: {betroffeneSysteme}
Affected users: approximately {anzahlUser}
Issue started: {stoerungSeit}
Initial analysis: {aktuellerStand}

Please investigate and provide an ETA for resolution.

Best regards,
{absender}
IT Department - SKF Marine GmbH`,
    contactGroups: ['server', 'network', 'client'],
  },
  {
    id: 'intranet-meldung',
    label: 'Intranet-Update fuer Mitarbeiter',
    subject: 'IT-Info: {betroffeneSysteme} - Update {stoerungSeit}',
    body: `Liebe Kolleginnen und Kollegen,

wir moechten Sie ueber den aktuellen Stand der IT-Stoerung informieren:

Betroffene Systeme: {betroffeneSysteme}
Status: {aktuellerStand}
Geschaetzte Wiederherstellung: {ausfallzeit}

Wir halten Sie auf dem Laufenden.

Ihr IT-Team
SKF Marine GmbH`,
    contactGroups: ['management', 'managers'],
  },
]

const ESKALATION_MAIL_TEMPLATES: ContextMailTemplate[] = [
  {
    id: 'bsi-abstimmung',
    label: 'Standortuebergreifende Abstimmung vor BSI-Meldung',
    subject: '[NIS2] SKF Marine Hamburg - Abstimmung vor BSI-Meldung erforderlich',
    body: `Sehr geehrte Kolleginnen und Kollegen,

bei SKF Marine Hamburg wurde ein potenziell NIS2-relevanter Sicherheitsvorfall erkannt. Vor einer Erstmeldung an das BSI ist eine standortuebergreifende Abstimmung erforderlich.

Vorfallsbeschreibung: {aktuellerStand}
Betroffene Systeme: {betroffeneSysteme}
Erkennungszeitpunkt: {stoerungSeit}

Bitte um Rueckmeldung:
1. Bewertung der Meldepflicht
2. Einheitliche Darstellung gegenueber dem BSI
3. Juristische Einschaetzung
4. Festlegung meldepflichtiger Rechtseinheiten

Die 24-Stunden-Frist laeuft ab {stoerungSeit}. Bitte zeitnah Rueckmeldung.

Mit freundlichen Gruessen
{absender}
OT-Security - SKF Marine GmbH`,
    contactGroups: ['nis2-de'],
  },
  {
    id: 'bsi-fruehwarnung',
    label: 'BSI-Fruehwarnmeldung (24h)',
    subject: '[BSI FRUEHWARNUNG] SKF Marine Hamburg - Sicherheitsvorfall',
    body: `Sehr geehrte Damen und Herren,

hiermit melden wir gemaess Art. 23 NIS2-RL / \u00a735 BSIG einen potenziellen Sicherheitsvorfall:

Betroffene Einrichtung: SKF Marine GmbH, Hamburg
Art des Vorfalls: {aktuellerStand}
Betroffene Systeme: {betroffeneSysteme}
Erkennungszeitpunkt: {stoerungSeit}
Geschaetzte Auswirkung: {ausfallzeit}

Erste Gegenmassnahmen wurden eingeleitet. Eine detaillierte Vorfallsmitteilung folgt innerhalb von 72 Stunden.

Mit freundlichen Gruessen
{absender}
OT-Security-Koordinator - SKF Marine GmbH`,
    contactGroups: ['bsi-external'],
  },
  {
    id: 'management-eskalation',
    label: 'Management-Eskalation (kritischer Vorfall)',
    subject: '[KRITISCH] IT-/OT-Sicherheitsvorfall - Sofortige Management-Entscheidung erforderlich',
    body: `Sehr geehrte Geschaeftsleitung,

es liegt ein kritischer IT-/OT-Sicherheitsvorfall vor, der eine sofortige Management-Entscheidung erfordert:

Beschreibung: {aktuellerStand}
Betroffene Systeme: {betroffeneSysteme}
Seit: {stoerungSeit}
Produktionsauswirkung: {ausfallzeit}

Erforderliche Entscheidungen:
- Freigabe von Sofortmassnahmen
- Ggf. externe Meldung (BSI) erforderlich
- Kommunikationsstrategie

Bitte um sofortige Rueckmeldung.

{absender}
OT-Security - SKF Marine GmbH`,
    contactGroups: ['management'],
  },
]

const NOTFALL_MAIL_TEMPLATES: ContextMailTemplate[] = [
  {
    id: 'notfall-mobilruf',
    label: 'Notfall-Alarmierung IT-Team (Mobilnummern)',
    subject: '[NOTFALL] IT-Ausfall SKF Marine - Sofortige Reaktion erforderlich',
    body: `NOTFALL - IT/OT-Ausfall

Beschreibung: {aktuellerStand}
Betroffene Systeme: {betroffeneSysteme}
Seit: {stoerungSeit}

Bitte sofortige Rueckmeldung ueber Mobiltelefon.
Treffpunkt: {treffpunkt}

{absender}`,
    contactGroups: ['it-emergency'],
  },
  {
    id: 'krisenstab-einberufung',
    label: 'Krisenstab einberufen',
    subject: '[KRISENSTAB] SKF Marine Hamburg - Sofortige Einberufung',
    body: `Krisenstab-Einberufung

Aufgrund des folgenden Vorfalls wird der Krisenstab einberufen:

Vorfall: {aktuellerStand}
Betroffene Systeme: {betroffeneSysteme}
Seit: {stoerungSeit}

Treffpunkt: {treffpunkt}
Zeitpunkt: sofort

Bitte um sofortige Bestaetigung der Teilnahme.

{absender}
OT-Security - SKF Marine GmbH`,
    contactGroups: ['it-emergency', 'management'],
  },
]

// Placeholders for all templates
const INCIDENT_PLACEHOLDERS: Record<string, { label: string; type: 'text' | 'textarea' }> = {
  '{betroffeneSysteme}': { label: 'Betroffene Systeme/Dienste', type: 'text' },
  '{anzahlUser}': { label: 'Anzahl betroffener Mitarbeiter', type: 'text' },
  '{stoerungSeit}': { label: 'Stoerung seit (Datum/Uhrzeit)', type: 'text' },
  '{ausfallzeit}': { label: 'Geschaetzte Ausfallzeit', type: 'text' },
  '{aktuellerStand}': { label: 'Aktueller Stand / Beschreibung', type: 'textarea' },
  '{treffpunkt}': { label: 'Treffpunkt (z.B. IT-Raum, Buero GL)', type: 'text' },
  '{absender}': { label: 'Absender', type: 'text' },
}

// ── Contact Table Component ──────────────────────────────────────────────────

function ContactTable({ contacts, showFunction, selectable, selected, onToggle }: {
  contacts: ContactEntry[]; showFunction?: boolean
  selectable?: boolean; selected?: Set<string>; onToggle?: (email: string) => void
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead><tr className="bg-muted/30 text-muted-foreground">
          {selectable && <th className="w-8 px-2 py-2"></th>}
          <th className="text-left px-3 py-2 font-medium">Name</th>
          {showFunction && <th className="text-left px-3 py-2 font-medium">Funktion</th>}
          <th className="text-left px-3 py-2 font-medium">E-Mail</th>
          <th className="text-left px-3 py-2 font-medium">Telefon</th>
        </tr></thead>
        <tbody>
          {contacts.map((c, i) => (
            <tr key={`${c.name}-${i}`} className={`${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20 transition-colors`}>
              {selectable && (
                <td className="px-2 py-2 text-center">
                  {c.email ? (
                    <input type="checkbox" checked={selected?.has(c.email) ?? false} onChange={() => onToggle?.(c.email!)}
                      className="rounded border-border accent-primary cursor-pointer" />
                  ) : (
                    <input type="checkbox" disabled className="rounded opacity-30 cursor-not-allowed" title="Keine E-Mail" />
                  )}
                </td>
              )}
              <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
              {showFunction && <td className="px-3 py-2 text-muted-foreground text-[11px]">{c.function || '\u2014'}</td>}
              <td className="px-3 py-2">
                {c.email ? <a href={`mailto:${c.email}`} className="text-blue-400 hover:underline">{c.email}</a> : <span className="text-muted-foreground">\u2014</span>}
              </td>
              <td className="px-3 py-2">
                {c.phone ? <a href={`tel:${c.phone.split('/')[0].trim()}`} className="text-blue-400 hover:underline">{c.phone}</a> : <span className="text-muted-foreground">\u2014</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Mail Compose Section ─────────────────────────────────────────────────────

function MailCompose({ templates, allContacts, senderName }: {
  templates: ContextMailTemplate[]
  allContacts: { id: string; label: string; contacts: ContactEntry[] }[]
  senderName: string
}) {
  const canSend = useCanAccess('infra-marine.send-email')
  const [templateId, setTemplateId] = useState('')
  const [placeholders, setPlaceholders] = useState<Record<string, string>>({ '{absender}': senderName })
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)

  const template = templates.find(t => t.id === templateId)

  // Extract placeholders used in current template
  const usedPlaceholders = useMemo(() => {
    if (!template) return []
    const all = (template.subject + template.body).match(/\{[a-zA-Z]+\}/g) || []
    return [...new Set(all)]
  }, [template])

  function replacePH(text: string): string {
    let r = text
    for (const [k, v] of Object.entries(placeholders)) r = r.replaceAll(k, v || k)
    return r
  }

  function selectTemplate(id: string) {
    setTemplateId(id)
    setEditSubject('')
    setEditBody('')
    const tpl = templates.find(t => t.id === id)
    if (tpl) {
      // Auto-select contacts from relevant groups
      const emails = new Set<string>()
      for (const gid of tpl.contactGroups) {
        const group = allContacts.find(g => g.id === gid)
        if (group) group.contacts.forEach(c => { if (c.email) emails.add(c.email) })
      }
      setSelectedEmails(emails)
    }
  }

  function toggleEmail(email: string) {
    setSelectedEmails(prev => { const n = new Set(prev); n.has(email) ? n.delete(email) : n.add(email); return n })
  }

  const finalSubject = editSubject || (template ? replacePH(template.subject) : '')
  const finalBody = editBody || (template ? replacePH(template.body) : '')

  async function handleSend() {
    setShowConfirm(false); setSending(true); setToast(null)
    try {
      const res = await api().sendEmailRaw({
        to: Array.from(selectedEmails).join(';'), subject: finalSubject, body: finalBody,
        html: false, smtp: '', port: 0, method: 'outlook',
      })
      if (res.success) {
        setToast({ type: 'ok', msg: `E-Mail an ${selectedEmails.size} Empfaenger gesendet` })
        log('Incident-Mail gesendet', `${selectedEmails.size} Empfaenger, Vorlage: ${templateId}`)
      } else setToast({ type: 'error', msg: res.error || 'Fehler' })
    } catch (e) { setToast({ type: 'error', msg: String(e) }) }
    finally { setSending(false) }
  }

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-border">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2"><Mail size={14} className="text-blue-400" /> E-Mail versenden</h4>

      {/* Template selection */}
      <div>
        <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Vorlage auswaehlen</label>
        <select value={templateId} onChange={e => selectTemplate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground">
          <option value="">-- Vorlage waehlen --</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {template && (
        <>
          {/* Placeholders */}
          {usedPlaceholders.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 rounded-lg bg-muted/10 border border-border">
              {usedPlaceholders.map(ph => {
                const meta = INCIDENT_PLACEHOLDERS[ph]
                if (!meta) return null
                return meta.type === 'textarea' ? (
                  <div key={ph} className="md:col-span-2">
                    <label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">{meta.label}</label>
                    <textarea value={placeholders[ph] || ''} onChange={e => setPlaceholders(p => ({ ...p, [ph]: e.target.value }))} rows={2}
                      className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground resize-y" />
                  </div>
                ) : (
                  <div key={ph}>
                    <label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">{meta.label}</label>
                    <input value={placeholders[ph] || ''} onChange={e => setPlaceholders(p => ({ ...p, [ph]: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" />
                  </div>
                )
              })}
            </div>
          )}

          {/* Recipients from relevant contact groups */}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium mb-1 block">
              Empfaenger ({selectedEmails.size} ausgewaehlt)
            </label>
            {template.contactGroups.map(gid => {
              const group = allContacts.find(g => g.id === gid)
              if (!group) return null
              return (
                <div key={gid} className="mb-2">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{group.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {group.contacts.filter(c => c.email).map(c => (
                      <button key={c.email} onClick={() => toggleEmail(c.email!)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                          selectedEmails.has(c.email!) ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'text-muted-foreground border-border hover:text-foreground'
                        }`}>
                        {c.name}
                        {selectedEmails.has(c.email!) && <X size={10} />}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Subject + Body */}
          <div>
            <label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">Betreff</label>
            <input value={editSubject || replacePH(template.subject)} onChange={e => setEditSubject(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">Nachricht</label>
            <textarea value={editBody || replacePH(template.body)} onChange={e => setEditBody(e.target.value)} rows={8}
              className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground font-mono resize-y" />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => canSend && selectedEmails.size > 0 ? setShowConfirm(true) : null}
              disabled={!canSend || sending || selectedEmails.size === 0 || !finalSubject}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${canSend && selectedEmails.size > 0 && finalSubject ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
              <Send size={14} />{sending ? 'Sende...' : 'E-Mail senden'}
            </button>
            {!canSend && <span className="text-[11px] text-yellow-400">Admin-Login erforderlich</span>}
            {toast && <span className={`text-xs ${toast.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{toast.msg}</span>}
          </div>
        </>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowConfirm(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3"><AlertTriangle size={18} className="text-yellow-400" /><h3 className="font-bold text-foreground">E-Mail senden?</h3></div>
            <p className="text-sm text-foreground mb-2">An <strong>{selectedEmails.size}</strong> Empfaenger senden:</p>
            <div className="text-xs text-muted-foreground bg-muted/20 rounded px-3 py-2 mb-3 max-h-20 overflow-y-auto">{Array.from(selectedEmails).join(', ')}</div>
            <div className="text-xs text-muted-foreground bg-muted/20 rounded px-3 py-2 mb-3"><strong>Betreff:</strong> {finalSubject}</div>
            <p className="text-[11px] text-yellow-400 mb-3">Diese Aktion wird protokolliert.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-3 py-1.5 rounded text-sm text-muted-foreground border border-border">Abbrechen</button>
              <button onClick={handleSend} className="px-3 py-1.5 rounded text-sm font-semibold bg-red-600 hover:bg-red-500 text-white">Senden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── InfoBox ──────────────────────────────────────────────────────────────────

function InfoBox({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warning' | 'success' }) {
  const s = { info: 'bg-blue-500/10 border-blue-500/20 text-blue-300', warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300', success: 'bg-green-500/10 border-green-500/20 text-green-300' }
  const ic = { info: <Info size={14} />, warning: <AlertTriangle size={14} />, success: <CheckCircle size={14} /> }
  return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${s[variant]}`}><span className="mt-0.5 shrink-0">{ic[variant]}</span><div>{children}</div></div>
}

// ── Main Component ───────────────────────────────────────────────────────────

type SubArea = 'overview' | 'meldeweg' | 'eskalation' | 'notfall'

export default function IncidentResponse() {
  const session = useAuthStore(s => s.session)
  const isMaster = useIsMasterAdmin()
  const displayName = session?.user.displayName ?? ''
  const [area, setArea] = useState<SubArea>('overview')
  const [showContactEditor, setShowContactEditor] = useState(false)

  // Build contact groups for mail compose
  const allContactGroups = CONTACT_TABS.map(t => ({ id: t.id, label: t.label, contacts: t.contacts }))

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground">{DOC_META.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{DOC_META.subtitle}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{DOC_META.legalBasis}</p>
          </div>
          <div className="flex items-center gap-2">
            {isMaster && (
              <button onClick={() => setShowContactEditor(true)} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-primary border border-primary/30 hover:bg-primary/10">
                <Edit3 size={12} />Kontakte verwalten
              </button>
            )}
            <span className="px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold">{DOC_META.status}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[11px] text-muted-foreground">
          <span>Version: <strong className="text-foreground">{DOC_META.version}</strong></span>
          <span>Datum: <strong className="text-foreground">{DOC_META.date}</strong></span>
          <span>OT-Security-Koordinator: <strong className="text-foreground">{DOC_META.otSecurityCoordinator}</strong></span>
          <span>OT-Security-Officer: <strong className="text-foreground">{DOC_META.otSecurityOfficer}</strong></span>
        </div>
      </div>

      {/* Warning Banner */}
      <InfoBox variant="warning">
        <strong>WICHTIG:</strong> Dieses Dokument muss ausgedruckt vorliegen und auf einem PC hinterlegt sein, bei dem das lokale Administratorpasswort bekannt ist. Bei NIS2-relevanten Vorfaellen gelten gesetzliche Meldefristen!
      </InfoBox>

      {/* ── Contact Editor ──────────────────────────────────────────────── */}
      {showContactEditor && <ContactEditor onClose={() => setShowContactEditor(false)} onSaved={() => setShowContactEditor(false)} />}

      {/* ── Navigation: 3 Hauptbereiche ─────────────────────────────────── */}
      {area === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'meldeweg' as SubArea, icon: <Clock size={24} className="text-blue-400" />, title: 'Interner Meldeweg', subtitle: '5-Schritte-Prozess', desc: 'Strukturierter Prozess fuer die Erstreaktion auf IT-/OT-Stoerungen, die mehr als 10 Anwender betreffen. Manager informieren, Ausfallzeit kommunizieren.', badge: '5 Schritte', color: 'border-blue-500/30 hover:border-blue-500/50' },
            { id: 'eskalation' as SubArea, icon: <AlertTriangle size={24} className="text-orange-400" />, title: 'Eskalationsprozess', subtitle: 'NIS2-Meldeweg', desc: 'Sechsstufiger Eskalationsweg fuer NIS2-relevante Sicherheitsvorfaelle inklusive gesetzlicher BSI-Meldefristen und standortuebergreifender Abstimmung.', badge: '6 Stufen', color: 'border-orange-500/30 hover:border-orange-500/50' },
            { id: 'notfall' as SubArea, icon: <Phone size={24} className="text-red-400" />, title: 'Notfallkommunikation', subtitle: 'Krisenmanagement', desc: 'Gesicherte Kommunikationskanaele und Eskalationsstufen bei Ausfall zentraler Kommunikationssysteme wie E-Mail oder Teams.', badge: '3 Stufen', color: 'border-red-500/30 hover:border-red-500/50' },
          ].map(item => (
            <button key={item.id} onClick={() => setArea(item.id)}
              className={`flex flex-col items-start gap-3 p-5 rounded-xl bg-card border ${item.color} transition-all text-left hover:shadow-lg`}>
              {item.icon}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{item.title}</h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted/50 text-muted-foreground">{item.badge}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{item.subtitle}</p>
                <p className="text-xs text-muted-foreground mt-2">{item.desc}</p>
              </div>
              <span className="text-xs text-primary font-medium mt-auto">Oeffnen &rarr;</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Back button ─────────────────────────────────────────────────── */}
      {area !== 'overview' && (
        <button onClick={() => setArea('overview')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground self-start">
          <ArrowLeft size={14} />Zurueck zur Uebersicht
        </button>
      )}

      {/* ══ INTERNER MELDEWEG ═══════════════════════════════════════════ */}
      {area === 'meldeweg' && (
        <>
          <Card title="Interner Meldeweg \u2014 5-Schritte-Prozess" icon={<Clock size={15} />} subtitle="Strukturierter Prozess fuer IT-/OT-Stoerungen die mehr als 10 Anwender betreffen">
            <div className="relative pl-8 space-y-5">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
              {MELDEWEG_STEPS.map(step => (
                <div key={step.step} className="relative">
                  <div className="absolute -left-8 top-0.5 w-[30px] h-[30px] rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary">{step.step}</div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-foreground text-sm">{step.title}</h4>
                      {step.timeLimit && <span className="px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 text-[10px] font-semibold">{step.timeLimit}</span>}
                      {step.nis2 && <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-[10px] font-semibold flex items-center gap-1"><Shield size={10} /> NIS2</span>}
                    </div>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground list-disc ml-4">
                      {step.bullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                    {step.sharepointLink && (
                      <button onClick={() => api().openExternal(SHAREPOINT_URL)} className="inline-flex items-center gap-1 mt-1 text-xs text-blue-400 hover:underline">
                        SharePoint <ExternalLink size={10} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Relevante Kontakte */}
          <Card title="Relevante Ansprechpartner" icon={<Users size={15} />}>
            <div className="space-y-3">
              {['management', 'managers', 'server', 'network', 'client', 'power'].map(gid => {
                const group = CONTACT_TABS.find(t => t.id === gid)
                if (!group) return null
                return (
                  <details key={gid}>
                    <summary className="text-xs font-semibold text-foreground cursor-pointer hover:text-primary flex items-center gap-1.5">
                      <span className={group.color}>{ICON_MAP[group.icon] || <FileText size={14} />}</span>
                      {group.label} ({group.contacts.length})
                    </summary>
                    <div className="mt-2 ml-5">
                      <ContactTable contacts={group.contacts} showFunction={gid === 'management' || gid === 'managers'} />
                    </div>
                  </details>
                )
              })}
            </div>
          </Card>

          {/* E-Mail */}
          <Card title="Incident-E-Mail versenden" icon={<Mail size={15} />}>
            <MailCompose templates={MELDEWEG_MAIL_TEMPLATES} allContacts={allContactGroups} senderName={displayName} />
          </Card>
        </>
      )}

      {/* ══ ESKALATIONSPROZESS ════════════════════════════════════════════ */}
      {area === 'eskalation' && (
        <>
          <Card title="Eskalationsweg \u2014 6 Stufen" icon={<AlertTriangle size={15} />}>
            <div className="space-y-3">
              {ESCALATION_LEVELS.map(lvl => (
                <div key={lvl.level} className="flex gap-3 p-3 rounded-lg bg-muted/10 border border-border">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0 ${lvl.color} border-current/30`}>{lvl.level}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-foreground text-sm">{lvl.title}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${lvl.color} border-current/30 bg-current/10`}>{lvl.deadline}</span>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground list-disc ml-4">
                      {lvl.details.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3"><InfoBox variant="warning"><strong>Die 24-Stunden-Regel:</strong> Sollte innerhalb von 24 Stunden keine Einigung erzielt werden, wird im Zweifel IMMER an das BSI gemeldet. Grundsatz: Im Zweifel melden.</InfoBox></div>
          </Card>

          {/* BSI-Meldefristen */}
          <Card title="BSI-Meldefristen" icon={<Clock size={15} />}>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/30 text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Stufe</th>
                  <th className="text-left px-3 py-2 font-medium w-28">Frist</th>
                  <th className="text-left px-3 py-2 font-medium">Inhalt</th>
                </tr></thead>
                <tbody>
                  {BSI_DEADLINES.map((d, i) => (
                    <tr key={d.stage} className={`${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20`}>
                      <td className="px-3 py-2 font-medium text-foreground">{d.stage}</td>
                      <td className="px-3 py-2"><span className={`font-bold ${d.color}`}>{d.deadline}</span></td>
                      <td className="px-3 py-2 text-muted-foreground">{d.content}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><InfoBox variant="warning">Das BSI bestraft nicht die Meldung, sondern das Nicht-Melden. Dokumentation von Beginn an fuehren!</InfoBox></div>
          </Card>

          {/* Relevante Kontakte */}
          <Card title="Eskalations-Ansprechpartner" icon={<Users size={15} />}>
            <div className="space-y-3">
              {['nis2-de', 'bsi-external', 'management', 'it-emergency'].map(gid => {
                const group = CONTACT_TABS.find(t => t.id === gid)
                if (!group) return null
                return (
                  <details key={gid} open={gid === 'nis2-de'}>
                    <summary className="text-xs font-semibold text-foreground cursor-pointer hover:text-primary flex items-center gap-1.5">
                      <span className={group.color}>{ICON_MAP[group.icon] || <FileText size={14} />}</span>
                      {group.label} ({group.contacts.length})
                    </summary>
                    {group.infoText && <div className="ml-5 mt-1"><InfoBox variant="warning">{group.infoText}</InfoBox></div>}
                    <div className="mt-2 ml-5">
                      <ContactTable contacts={group.contacts} />
                    </div>
                  </details>
                )
              })}
            </div>
          </Card>

          {/* E-Mail */}
          <Card title="Eskalations-E-Mail versenden" icon={<Mail size={15} />}>
            <MailCompose templates={ESKALATION_MAIL_TEMPLATES} allContacts={allContactGroups} senderName={displayName} />
          </Card>
        </>
      )}

      {/* ══ NOTFALLKOMMUNIKATION ═════════════════════════════════════════ */}
      {area === 'notfall' && (
        <>
          {/* Krisenszenarien */}
          <Card title="Krisenszenarien" icon={<AlertTriangle size={15} />}>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/30 text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Szenario</th>
                  <th className="text-left px-3 py-2 font-medium">Dauer</th>
                  <th className="text-left px-3 py-2 font-medium">Auswirkung</th>
                </tr></thead>
                <tbody>
                  {CRISIS_SCENARIOS.map((s, i) => (
                    <tr key={s.scenario} className={`${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20`}>
                      <td className="px-3 py-2 font-medium text-foreground">{s.scenario}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.duration}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.impact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Kommunikationskanaele */}
          <Card title="Kommunikationskanaele" icon={<Phone size={15} />}>
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Primaere Kanaele im Normalbetrieb</h4>
                <ul className="text-xs text-muted-foreground list-disc ml-4 space-y-0.5">
                  {PRIMARY_CHANNELS.map(c => <li key={c}>{c}</li>)}
                </ul>
              </div>
              <div className="space-y-2">
                <div className="p-2 rounded bg-muted/10 border border-border text-xs text-muted-foreground">
                  <strong className="text-foreground">Mobiltelefone:</strong> Krisenmanagement-Team ueber private Mobilnummern erreichbar. Auf separate Notfall-SIMs wird bewusst verzichtet.
                </div>
                <div className="p-2 rounded bg-muted/10 border border-border text-xs text-muted-foreground">
                  <strong className="text-foreground">Signal / Threema (optional):</strong> Gruppe "SKF_Notfall_Team". Funktioniert ueber Datenverbindungen/WLAN.
                </div>
              </div>
            </div>
          </Card>

          {/* Eskalationsstufen der Notfallkommunikation */}
          <Card title="Eskalationsstufen" icon={<Shield size={15} />}>
            <div className="space-y-2">
              {EMERGENCY_COMM_LEVELS.map(lvl => (
                <div key={lvl.level} className="flex gap-3 p-3 rounded-lg bg-muted/10 border border-border">
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary shrink-0">{lvl.level}</div>
                  <div className="text-xs">
                    <h5 className="font-semibold text-foreground">Stufe {lvl.level}: {lvl.title}</h5>
                    <p className="text-muted-foreground mt-0.5"><strong>Teilnehmer:</strong> {lvl.participants}</p>
                    {lvl.trigger && <p className="text-muted-foreground"><strong>Trigger:</strong> {lvl.trigger}</p>}
                    <p className="text-muted-foreground"><strong>Kanal:</strong> {lvl.channel}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* IT-Notfallkontakte */}
          <Card title="Notfall-Kontakte" icon={<Phone size={15} />}>
            <div className="space-y-3">
              {['it-emergency', 'management', 'bsi-external'].map(gid => {
                const group = CONTACT_TABS.find(t => t.id === gid)
                if (!group) return null
                return (
                  <details key={gid} open={gid === 'it-emergency'}>
                    <summary className="text-xs font-semibold text-foreground cursor-pointer hover:text-primary flex items-center gap-1.5">
                      <span className={group.color}>{ICON_MAP[group.icon] || <FileText size={14} />}</span>
                      {group.label} ({group.contacts.length})
                    </summary>
                    <div className="mt-2 ml-5">
                      <ContactTable contacts={group.contacts} />
                    </div>
                  </details>
                )
              })}
            </div>
          </Card>

          {/* Notfall-E-Mail */}
          <Card title="Notfall-E-Mail versenden" icon={<Mail size={15} />}>
            <MailCompose templates={NOTFALL_MAIL_TEMPLATES} allContacts={allContactGroups} senderName={displayName} />
          </Card>

          {/* Tests */}
          <Card title="Tests und Uebungen" icon={<CheckCircle size={15} />}>
            <ul className="text-xs text-muted-foreground list-disc ml-4 space-y-0.5">
              <li><strong>Frequenz:</strong> Halbjaehrlich (April und Oktober)</li>
              <li><strong>Test-Szenarien:</strong> E-Mail-Ausfall, Internet-Ausfall, Ransomware</li>
              <li><strong>Dokumentation:</strong> Testprotokoll wird archiviert</li>
              <li><strong>Optimierung:</strong> Schwachstellen werden dokumentiert und behoben</li>
            </ul>
          </Card>

          <InfoBox variant="info">
            Dieses Dokument wurde mehrfach ausgedruckt und an alle verantwortlichen Personen persoenlich ausgehaendigt. Exemplare an zentralen Orten hinterlegt (Buero GL, IT-Raum, Empfang).
          </InfoBox>
        </>
      )}

      {/* ── Grundlagen + Status (immer sichtbar in overview) ─────────── */}
      {area === 'overview' && (
        <>
          {/* Rollen */}
          <Card title="Rollen und Verantwortlichkeiten" icon={<Users size={15} />}>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/30 text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Rolle</th>
                  <th className="text-left px-3 py-2 font-medium">Verantwortlichkeit</th>
                </tr></thead>
                <tbody>
                  {ROLES.map((r, i) => (
                    <tr key={r.role} className={`${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20`}>
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{r.role}{r.person && <span className="text-muted-foreground font-normal"> ({r.person})</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.responsibility}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Gesetzliche Grundlagen */}
          <Card title="Gesetzliche Grundlage" icon={<FileText size={15} />}>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              {LEGAL_BASES.map(l => <li key={l.ref}><strong className="text-foreground">{l.ref}:</strong> {l.text}</li>)}
            </ul>
            <div className="mt-3"><InfoBox variant="warning"><strong>Merksatz:</strong> Das BSI bestraft nicht die Meldung, sondern das Nicht-Melden. Im Zweifel stets melden.</InfoBox></div>
          </Card>

          {/* Status */}
          <Card title="Status und Freigabe" icon={<CheckCircle size={15} />}>
            <div className="text-xs text-muted-foreground space-y-2">
              <p>Jaehrliche Ueberpruefung durch OT-Security-Koordinator. Anlassbezogene Ueberarbeitungen bei personellen Aenderungen, Sicherheitsvorfaellen, regulatorischen Aenderungen, Audit-Findings oder Drills (April/Oktober).</p>
              <div className="pt-2 border-t border-border flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
                <span>Version: {DOC_META.version} \u2014 {DOC_META.date}</span>
                <span>Erstellt von: {DOC_META.otSecurityCoordinator}</span>
                <span>Freigabe: SKF Marine Geschaeftsleitung</span>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
