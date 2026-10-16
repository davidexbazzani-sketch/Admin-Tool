// ── Kritisch-Tag im Geräte-„i" ───────────────────────────────────────────────
// Zeigt/steuert den „Kritisch"-Status eines Geräts. Taggen: alle Admins.
// Enttaggen/Freigeben: nur Davide. Geräte mit Karten-Standort gelten nicht als kritisch.

import { useEffect, useState } from 'react'
import { AlertOctagon, Check, Loader2, MapPin, Star } from 'lucide-react'
import { useAuthStore, useIsAdmin, useIsFounder } from '../../store/authStore'
import { getEntry, setCritical, clearCritical, type CriticalEntry } from '../../services/deviceTags'

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CriticalTag({ hostname, serial, model, assignedTo, onMap }: {
  hostname: string
  serial?: string
  model?: string
  assignedTo?: string
  onMap: boolean
}) {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const by = user?.displayName || username || 'unbekannt'
  const isAdmin = useIsAdmin()
  const canClear = useIsFounder() || ['davidxe', 'bq8069'].includes(username.toLowerCase())

  const [entry, setEntry] = useState<CriticalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function reload() {
    setLoading(true)
    try { setEntry((await getEntry(hostname, serial)) ?? null) } catch { setEntry(null) }
    finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [hostname, serial])

  const active = entry?.status === 'active'

  async function markCritical() {
    setBusy(true)
    try { await setCritical({ hostname, serial, model, assignedTo }, note.trim(), by, 'manual'); setNote(''); await reload() }
    finally { setBusy(false) }
  }
  async function freigeben() {
    if (!canClear || !entry) return
    setBusy(true)
    try { await clearCritical(entry.key, by, 'manuell freigegeben'); await reload() }
    finally { setBusy(false) }
  }

  if (loading) return <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />lädt…</div>

  return (
    <div className="space-y-2">
      {active ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <AlertOctagon size={13} className="text-red-400" />
            <span className="text-xs font-semibold text-red-300">Als KRITISCH markiert</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border ${entry!.source === 'auto' ? 'border-amber-500/30 text-amber-300' : 'border-blue-500/30 text-blue-300'}`}>{entry!.source === 'auto' ? 'automatisch' : 'manuell'}</span>
          </div>
          {entry!.note && <p className="text-[11px] text-foreground/90">{entry!.note}</p>}
          <p className="text-[10px] text-muted-foreground">getaggt am {fmtDate(entry!.at)} von {entry!.by}</p>
          {onMap
            ? <p className="text-[10px] text-emerald-300 inline-flex items-center gap-1"><MapPin size={10} />Auf einer Karte verortet — wird beim nächsten Abgleich automatisch freigegeben.</p>
            : <p className="text-[10px] text-amber-300">Wird erst unkritisch, wenn der genaue Standort in einer der 3 Karten eingetragen wird.</p>}
          {canClear ? (
            <button onClick={() => void freigeben()} disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}Enttaggen (freigeben)
            </button>
          ) : (
            <p className="text-[10px] text-muted-foreground/70 inline-flex items-center gap-1"><MapPin size={10} />Freigeben kann nur Davide.</p>
          )}
        </div>
      ) : onMap ? (
        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><MapPin size={12} className="text-emerald-400" />Auf einer Karte verortet — gilt nicht als kritisch.</p>
      ) : isAdmin ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Nicht als kritisch markiert.</p>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Grund / Notiz (optional)"
            className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
          <button onClick={() => void markCritical()} disabled={busy}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Star size={11} />}Als kritisch markieren
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Nicht als kritisch markiert.</p>
      )}
    </div>
  )
}
