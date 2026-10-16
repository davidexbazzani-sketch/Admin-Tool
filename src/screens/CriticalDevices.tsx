// ── Kritische Geräte (Infrastruktur) ─────────────────────────────────────────
// Rückhol-Watchlist: Geräte, die einem ausgetretenen Mitarbeiter noch zugewiesen
// sind und keinen Karten-Standort haben (automatisch getaggt), plus manuell im
// Geräte-„i" markierte Geräte. Freigeben (enttaggen) darf nur Davide.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertOctagon, RefreshCw, Loader2, Search, Check, Info, MapPin, User } from 'lucide-react'
import { useAuthStore, useIsFounder } from '../store/authStore'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import { hostFromSerial } from '../services/deviceMasterData'
import { loadDevices, type EndpointDevice } from '../services/endpointDevices'
import {
  listActive, reconcileCriticalDevices, clearCritical, tagKey, type CriticalEntry,
} from '../services/deviceTags'

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CriticalDevices() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const by = user?.displayName || username || 'unbekannt'
  const canClear = useIsFounder() || ['davidxe', 'bq8069'].includes(username.toLowerCase())

  const [entries, setEntries] = useState<CriticalEntry[]>([])
  const [devByKey, setDevByKey] = useState<Map<string, EndpointDevice>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const reload = useCallback(async (reconcile: boolean) => {
    setBusy(true); setError('')
    try {
      if (reconcile) await reconcileCriticalDevices(by)
      const [list, devs] = await Promise.all([listActive(), loadDevices().catch(() => [] as EndpointDevice[])])
      const m = new Map<string, EndpointDevice>()
      for (const d of devs) { const k = tagKey(d.hostname, d.serial); if (k) m.set(k, d) }
      setEntries(list); setDevByKey(m)
    } catch { setError('Konnte nicht geladen werden (Netzlaufwerk?).') }
    finally { setBusy(false); setLoading(false) }
  }, [by])

  useEffect(() => { void reload(true) }, [reload])

  async function enttaggen(e: CriticalEntry) {
    if (!canClear) return
    setBusy(true)
    try { await clearCritical(e.key, by, 'manuell freigegeben'); await reload(false) }
    finally { setBusy(false) }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(e => {
      const dev = devByKey.get(e.key)
      return (e.hostname || '').toLowerCase().includes(q)
        || (e.serial || '').toLowerCase().includes(q)
        || (e.model || dev?.model || '').toLowerCase().includes(q)
        || (dev?.assignedTo || e.assignedTo || '').toLowerCase().includes(q)
        || (e.note || '').toLowerCase().includes(q)
    })
  }, [entries, devByKey, search])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <AlertOctagon size={22} className="text-red-400" />
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground">Kritische Geräte</h1>
          <p className="text-xs text-muted-foreground">{entries.length} Geräte auf der Watchlist · noch zugewiesen an Ausgetretene / manuell markiert</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hostname, Serial, Modell, Zuweisung…" className="w-64 pl-7 pr-2 py-1.5 rounded-md bg-card border border-border text-xs" />
          </div>
          <button onClick={() => void reload(true)} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-foreground hover:bg-accent/40 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Aktualisieren
          </button>
        </div>
      </div>

      {/* Regel-Hinweis */}
      <div className="mx-6 mt-3 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-100 text-[11px] flex items-start gap-2 shrink-0">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>Ein Gerät wird <b>erst als unkritisch</b> angesehen, wenn sein genauer <b>Standort in einer der 3 Karten</b> (OT-Geräte, Halle &amp; Zoll, Verwaltungsgebäude) eingetragen wurde — dann verschwindet es hier automatisch. Mobile Geräte (Laptops) stehen nicht auf Karten und werden nur durch <b>manuelles Enttaggen</b> freigegeben{canClear ? '.' : ' (nur durch Davide).'}</span>
      </div>

      {error && <div className="mx-6 mt-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">{error}</div>}

      {/* Tabelle */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground gap-2"><Loader2 size={16} className="animate-spin" />Wird geladen…</div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
            <Check size={40} className="opacity-30 text-emerald-400" />
            <p className="text-sm">Keine kritischen Geräte. 🎉</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="px-2 py-2">Gerät</th>
                <th className="px-2 py-2">Modell</th>
                <th className="px-2 py-2">Aktuell zugewiesen</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Quelle</th>
                <th className="px-2 py-2">Grund / Notiz</th>
                <th className="px-2 py-2">Getaggt</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => {
                const dev = devByKey.get(e.key)
                const host = e.hostname || (e.serial ? hostFromSerial(e.serial) : '')
                const state = [dev?.state, dev?.substate].filter(Boolean).join(' · ')
                return (
                  <tr key={e.key} className="border-b border-border/40 hover:bg-accent/10">
                    <td className="px-2 py-1.5 font-mono text-foreground">
                      <span className="inline-flex items-center gap-1">{host || e.serial || '—'}<DeviceInfoButton hostname={host || undefined} serial={e.serial || undefined} /></span>
                      {e.serial && host && <div className="text-[10px] text-muted-foreground/70">SN {e.serial}</div>}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{e.model || dev?.model || '—'}</td>
                    <td className="px-2 py-1.5 text-muted-foreground"><span className="inline-flex items-center gap-1">{(dev?.assignedTo || e.assignedTo) ? <><User size={11} />{dev?.assignedTo || e.assignedTo}</> : '—'}</span></td>
                    <td className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[10px] ${/in use/i.test(dev?.state || '') ? 'bg-red-500/15 text-red-300' : /stock/i.test(dev?.state || '') ? 'bg-emerald-500/15 text-emerald-300' : 'bg-accent text-muted-foreground'}`}>{state || '—'}</span></td>
                    <td className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[10px] border ${e.source === 'auto' ? 'border-amber-500/30 text-amber-300' : 'border-blue-500/30 text-blue-300'}`}>{e.source === 'auto' ? 'automatisch' : 'manuell'}</span></td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[22rem]"><span title={e.note}>{e.note || '—'}</span></td>
                    <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{fmtDate(e.at)}<div className="text-[10px] text-muted-foreground/70">{e.by}</div></td>
                    <td className="px-2 py-1.5 text-right">
                      {canClear ? (
                        <button onClick={() => void enttaggen(e)} disabled={busy}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
                          <Check size={12} />Enttaggen
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 inline-flex items-center gap-1"><MapPin size={10} />nur Davide</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">Kein Treffer für den Filter.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
