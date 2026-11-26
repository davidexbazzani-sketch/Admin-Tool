// ── NIS2 Zugänge-Check: Mails an Nutzer mit lokalem Admin-Zugang ohne Antrag ──
import { useState } from 'react'
import { AlertTriangle, ExternalLink, Loader2, Mail, Send, Settings2, X } from 'lucide-react'
import { api } from '../../electronAPI'
import { logDossierAction } from '../../services/personDossier'
import {
  ANTRAG_LINK, LINK_TEXT, adminMailHtml, antragsLink, baueAdminMail, protokolliereAccessMail,
  type AccessMailEinstellungen, type AccessMailKontakt, type Kontaktiert,
} from '../../services/nis2AccessMail'

export interface MailZiel { sam: string; name: string; pcs: string[]; mail: string; kontakte: AccessMailKontakt[]; kontaktiert?: Kontaktiert }

const GRUPPE = 10   // Sammelversand in 10er-Gruppen (Projektregel Bulk-Ops)

async function protokolliere(z: MailZiel, art: AccessMailKontakt['art'], ich: string, mail: string): Promise<void> {
  await protokolliereAccessMail({ at: new Date().toISOString(), by: ich, sam: z.sam, name: z.name, mail, pcs: z.pcs, art })
  if (art === 'gesendet') void logDossierAction(z.name, z.sam, `NIS2 Zugänge-Check: Mail wegen lokalem Admin-Zugang ohne Antrag (PC ${z.pcs.join(', ')}) – Bitte um Antrag „Permanent Admin Access“`, ich, 'NIS2')
}

export function AdminMailDialog({ ziel, einst, ich, onClose, onErledigt }: {
  ziel: MailZiel; einst: AccessMailEinstellungen; ich: string; onClose: () => void; onErledigt: () => void
}) {
  const vorschlag = baueAdminMail({ name: ziel.name, sam: ziel.sam, pcs: ziel.pcs, absender: ich })
  const link = antragsLink(einst)
  const [to, setTo] = useState(ziel.mail)
  const [cc, setCc] = useState(einst.cc ?? '')
  const [subject, setSubject] = useState(vorschlag.subject)
  const [body, setBody] = useState(vorschlag.body)
  const [busy, setBusy] = useState<'' | 'senden' | 'outlook'>('')
  const [fehler, setFehler] = useState('')

  async function senden() {
    setBusy('senden'); setFehler('')
    try {
      const r = await api().sendEmailRaw({ to: to.trim(), cc: cc.trim(), subject, body: adminMailHtml(body, link), html: true, smtp: '', port: 587, protokoll: { art: 'manuell', quelle: 'NIS2 Zugänge-Check' } })
      if (!r.success) { setFehler(r.error || 'Senden fehlgeschlagen.'); return }
      await protokolliere(ziel, 'gesendet', ich, to.trim()); onErledigt()
    } finally { setBusy('') }
  }
  async function outlook() {
    setBusy('outlook'); setFehler('')
    try {
      await api().composeEmail({ to: to.trim(), cc: cc.trim(), subject, body: adminMailHtml(body, link), html: true })
      await protokolliere(ziel, 'entwurf', ich, to.trim()); onErledigt()
    } finally { setBusy('') }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()} data-nis2-mail>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Mail size={16} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">Mail an {ziel.name}</h3>
          <span className="text-[11px] text-muted-foreground">{ziel.sam} · {ziel.pcs.join(', ')}</span>
          <button onClick={onClose} disabled={!!busy} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-2 overflow-auto">
          <Feld label="An" value={to} onChange={setTo} placeholder="keine Mail-Adresse im AD – bitte eintragen" />
          <Feld label="CC" value={cc} onChange={setCc} />
          <Feld label="Betreff" value={subject} onChange={setSubject} />
          <label className="block text-[11px] text-muted-foreground">Text
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={17}
              className="w-full mt-0.5 px-2.5 py-2 text-xs rounded-md bg-background border border-border text-foreground font-mono leading-relaxed focus:outline-none focus:border-primary" />
          </label>
          <p className="text-[10px] text-muted-foreground">„{LINK_TEXT}“ wird in der Mail zum <b>Link auf den Antrag</b> ({link}){body.includes(LINK_TEXT) ? '' : ' – der Satz fehlt im Text und wird automatisch eingefügt'}.</p>
          {fehler && <p className="text-xs text-red-300 flex items-center gap-1"><AlertTriangle size={13} />{fehler}</p>}
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground flex-1">Beide Wege werden protokolliert. „In Outlook öffnen“ zählt als angeschrieben, sobald das Fenster offen ist – dort bitte absenden.</p>
          <button onClick={() => void outlook()} disabled={!!busy || !to.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
            {busy === 'outlook' ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}In Outlook öffnen
          </button>
          <button onClick={() => void senden()} disabled={!!busy || !to.trim()} data-nis2-mail-senden
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {busy === 'senden' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Direkt senden
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdminSammelDialog({ ziele, einst, ich, onClose, onFertig }: {
  ziele: MailZiel[]; einst: AccessMailEinstellungen; ich: string; onClose: () => void; onFertig: (n: number, fehler: number) => void
}) {
  const [nurNeue, setNurNeue] = useState(true)
  const [lauf, setLauf] = useState<{ done: number; total: number; fehler: number } | null>(null)
  const mitMail = ziele.filter(z => z.mail)
  const ziel = mitMail.filter(z => !nurNeue || !z.kontaktiert)
  const ohneMail = ziele.length - mitMail.length
  const link = antragsLink(einst)

  async function los() {
    let done = 0, fehler = 0
    setLauf({ done, total: ziel.length, fehler })
    for (let i = 0; i < ziel.length; i += GRUPPE) {
      for (const z of ziel.slice(i, i + GRUPPE)) {
        const m = baueAdminMail({ name: z.name, sam: z.sam, pcs: z.pcs, absender: ich })
        try {
          const r = await api().sendEmailRaw({ to: z.mail, cc: einst.cc ?? '', subject: m.subject, body: adminMailHtml(m.body, link), html: true, smtp: '', port: 587, protokoll: { art: 'manuell', quelle: 'NIS2 Zugänge-Check' } })
          if (r.success) await protokolliere(z, 'gesendet', ich, z.mail); else fehler++
        } catch { fehler++ }
        done++
        setLauf({ done, total: ziel.length, fehler })
      }
    }
    onFertig(done - fehler, fehler)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !lauf && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Send size={16} className="text-blue-400" />Alle ohne Antrag anschreiben</h3>
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" checked={nurNeue} onChange={e => setNurNeue(e.target.checked)} disabled={!!lauf} className="accent-primary" />
          nur Personen, die noch <b>nicht</b> kontaktiert sind (ohne Haken)
        </label>
        <p className="text-xs text-muted-foreground">Es werden <b className="text-foreground">{ziel.length} Mails</b> direkt über Outlook gesendet (je Person eine, mit Link zum Antrag), CC: {einst.cc || '—'}. Jede Mail wird protokolliert.</p>
        {ohneMail > 0 && <p className="text-[11px] text-amber-500 flex items-start gap-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{ohneMail} Person(en) ohne Mail-Adresse im AD – bitte einzeln über den Mail-Knopf anschreiben.</p>}
        {lauf && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-muted/40 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${lauf.total ? (lauf.done / lauf.total) * 100 : 0}%` }} /></div>
            <p className="text-[11px] text-muted-foreground">{lauf.done} / {lauf.total}{lauf.fehler ? ` · ${lauf.fehler} fehlgeschlagen` : ''}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={!!lauf} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40">Abbrechen</button>
          <button onClick={() => void los()} disabled={!!lauf || !ziel.length}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {lauf ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}{ziel.length} Mails senden
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdminMailEinstellungen({ einst, onClose, onSpeichern }: { einst: AccessMailEinstellungen; onClose: () => void; onSpeichern: (e: AccessMailEinstellungen) => Promise<void> }) {
  const [link, setLink] = useState(einst.link ?? '')
  const [cc, setCc] = useState(einst.cc ?? '')
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-5 space-y-2" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Settings2 size={16} className="text-blue-400" />Mail-Einstellungen (für alle Admins)</h3>
        <Feld label={`Link zum Antrag (leer = Standard: „Permanent Admin Access on Windows 11 machines“)`} value={link} onChange={setLink} placeholder={ANTRAG_LINK} />
        <Feld label="CC (optional)" value={cc} onChange={setCc} />
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
          <button disabled={busy} onClick={async () => { setBusy(true); try { await onSpeichern({ link: link.trim(), cc: cc.trim() }) } finally { setBusy(false) } }}
            className="ml-auto px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Speichern</button>
        </div>
      </div>
    </div>
  )
}

function Feld({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-[11px] text-muted-foreground">{label}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
    </label>
  )
}
