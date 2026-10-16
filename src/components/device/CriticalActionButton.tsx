// ── „Kritisch"-Aktion im Geräte-Dossier (neben „Abfrage") ────────────────────
// Button in der Aktionsleiste. Klick → Bestätigungsdialog: Gerät auf kritisch
// setzen (nur wenn etwas nicht stimmt). Ist das Gerät bereits kritisch, zeigt
// der Dialog Status/Notiz + „Enttaggen" (nur Davide). Taggen: alle Admins.

import { useEffect, useState } from 'react'
import { AlertOctagon, Loader2, X, Check, MapPin } from 'lucide-react'
import { useAuthStore, useIsAdmin, useIsFounder } from '../../store/authStore'
import { getEntry, setCritical, clearCritical, type CriticalEntry } from '../../services/deviceTags'
import { findEndpointDevice } from '../../services/deviceMasterData'
import { classifyModel } from '../../services/endpointDevices'

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CriticalActionButton({ hostname, serial, model, assignedTo }: {
  hostname: string
  serial?: string
  model?: string
  assignedTo?: string
}) {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const by = user?.displayName || username || 'unbekannt'
  const isAdmin = useIsAdmin()
  const canClear = useIsFounder() || ['davidxe', 'bq8069'].includes(username.toLowerCase())

  const [entry, setEntry] = useState<CriticalEntry | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // Nur Mini-PC / Tower (Desktop*) werden durch Karten-Standort unkritisch; Laptops nur manuell.
  const [stationary, setStationary] = useState<boolean | null>(null)

  async function reload() {
    try { setEntry((await getEntry(hostname, serial)) ?? null) } catch { setEntry(null) }
  }
  useEffect(() => { void reload() }, [hostname, serial])
  useEffect(() => {
    const cat = classifyModel(model || '')
    if (cat) { setStationary(cat.startsWith('Desktop')); return }
    let cancel = false
    void findEndpointDevice(hostname, serial).then(d => { if (!cancel) setStationary(d ? classifyModel(d.model).startsWith('Desktop') : null) }).catch(() => { if (!cancel) setStationary(null) })
    return () => { cancel = true }
  }, [hostname, serial, model])
  const active = entry?.status === 'active'

  async function markCritical() {
    setBusy(true)
    try { await setCritical({ hostname, serial, model, assignedTo }, note.trim(), by, 'manual'); setNote(''); await reload(); setOpen(false) }
    finally { setBusy(false) }
  }
  async function freigeben() {
    if (!canClear || !entry) return
    setBusy(true)
    try { await clearCritical(entry.key, by, 'manuell freigegeben'); await reload(); setOpen(false) }
    finally { setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        title="Gerät als kritisch markieren / beobachten"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-semibold ${active ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
        <AlertOctagon size={13} className={active ? 'text-red-400' : 'text-red-400/70'} />Kritisch{active ? ' ●' : ''}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-xl w-[460px] max-w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <AlertOctagon size={18} className="text-red-400" />
              <h2 className="text-sm font-semibold text-foreground">Kritisches Gerät · <span className="font-mono">{hostname}</span></h2>
              <button onClick={() => setOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-3">
              {active ? (
                <>
                  <div className="px-3 py-2 rounded-md border border-red-500/40 bg-red-500/5 text-xs space-y-1">
                    <div className="flex items-center gap-1.5"><AlertOctagon size={13} className="text-red-400" /><span className="font-semibold text-red-300">Als kritisch markiert</span>
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border ${entry!.source === 'auto' ? 'border-amber-500/30 text-amber-300' : 'border-blue-500/30 text-blue-300'}`}>{entry!.source === 'auto' ? 'automatisch' : 'manuell'}</span>
                    </div>
                    {entry!.note && <p className="text-foreground/90">{entry!.note}</p>}
                    <p className="text-[10px] text-muted-foreground">getaggt am {fmtDate(entry!.at)} von {entry!.by}</p>
                  </div>
                  {stationary === true
                    ? <p className="text-[11px] text-foreground">Bleibt in der Übersicht „Kritische Geräte", bis der genaue <b>Standort in einer der 3 Karten</b> eingetragen ist — oder bis es manuell freigegeben wird.</p>
                    : <p className="text-[11px] text-foreground">Bleibt in der Übersicht „Kritische Geräte", bis alle offenen Fragen geklärt sind und es <b>manuell freigegeben</b> wird.</p>}
                  {canClear ? (
                    <button onClick={() => void freigeben()} disabled={busy}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Enttaggen (freigeben)
                    </button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><MapPin size={11} />Freigeben kann nur Davide.</p>
                  )}
                </>
              ) : isAdmin ? (
                <>
                  <p className="text-sm text-foreground">Dieses Gerät wirklich als <b>kritisch</b> markieren?</p>
                  <p className="text-[11px] text-muted-foreground">
                    Nutze das nur, wenn mit dem Gerät etwas nicht stimmt — z. B. es ist derzeit <b>nicht auffindbar</b>, der <b>Status ist falsch</b> oder die <b>Zuweisung passt nicht</b>. Das Gerät erscheint dann in der zentralen Übersicht <b>„Kritische Geräte"</b> (Infrastruktur) und wird dort beobachtet, bis alle offenen Fragen geklärt sind.
                  </p>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Grund / Notiz (optional)"
                    className="w-full px-2.5 py-1.5 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                  <div className="flex items-center gap-2">
                    <button onClick={() => void markCritical()} disabled={busy}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <AlertOctagon size={14} />}Auf kritisch setzen
                    </button>
                    <button onClick={() => setOpen(false)} className="px-3 py-2 rounded-md text-sm border border-border text-muted-foreground hover:bg-accent/40">Abbrechen</button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Dieses Gerät ist nicht als kritisch markiert. Zum Markieren sind Admin-Rechte nötig.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
