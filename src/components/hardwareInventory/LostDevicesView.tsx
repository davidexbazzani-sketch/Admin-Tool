import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, PackageX, PackageCheck, RefreshCw, Plus, FileSpreadsheet, Search,
  Loader2, X, Check, MapPin, Trash2, AlertTriangle,
} from 'lucide-react'
import {
  loadLostData, addLostSerials, markRecovered, removeLost, removeRecovered,
  type LostDevice, type RecoveredDevice,
} from '../../services/lostDevices'
import LostImportDialog from './LostImportDialog'

interface Props {
  currentUser: string
  onBack: () => void
}

type Tab = 'lost' | 'recovered'

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function LostDevicesView({ currentUser, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('lost')
  const [lost, setLost] = useState<LostDevice[]>([])
  const [recovered, setRecovered] = useState<RecoveredDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [recoverFor, setRecoverFor] = useState<LostDevice | null>(null)
  const [flash, setFlash] = useState('')

  const reload = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true)
    try {
      const d = await loadLostData()
      setLost(d.lost); setRecovered(d.recovered); setError('')
    } catch {
      setError('Liste konnte nicht geladen werden. Netzlaufwerk erreichbar?')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { reload(true) }, [reload])

  const filteredLost = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return lost
    return lost.filter(d => d.serial.toLowerCase().includes(q) || (d.deviceType || '').toLowerCase().includes(q) || (d.comment || '').toLowerCase().includes(q) || (d.source || '').toLowerCase().includes(q))
  }, [lost, search])
  const filteredRecovered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recovered
    return recovered.filter(d => d.serial.toLowerCase().includes(q) || (d.foundLocation || '').toLowerCase().includes(q))
  }, [recovered, search])

  async function doRemoveLost(serial: string) {
    await removeLost(serial); await reload(false)
  }
  async function doRemoveRecovered(serial: string) {
    await removeRecovered(serial); await reload(false)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="p-1 rounded text-muted-foreground hover:bg-accent/40"><ChevronLeft size={16} /></button>
        <PackageX className="text-amber-400" size={20} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Verlorene Geräte</h1>
          <p className="text-[11px] text-muted-foreground">{lost.length} verloren gemeldet · {recovered.length} wieder aufgefunden</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => reload(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border" title="Aktualisieren"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          {tab === 'lost' && (
            <>
              <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-foreground hover:bg-accent/40"><Plus size={14} />Gerät hinzufügen</button>
              <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"><FileSpreadsheet size={14} />Liste importieren</button>
            </>
          )}
        </div>
      </div>

      {/* Reiter */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border shrink-0">
        <div className="flex rounded-md border border-border overflow-hidden">
          <TabBtn active={tab === 'lost'} onClick={() => setTab('lost')} label={`Verloren gemeldet (${lost.length})`} />
          <TabBtn active={tab === 'recovered'} onClick={() => setTab('recovered')} label={`Wieder aufgefunden (${recovered.length})`} />
        </div>
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtern…" className="w-56 pl-6 pr-2 py-1 rounded-md bg-card border border-border text-xs" />
        </div>
      </div>

      {flash && <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs shrink-0 flex items-center gap-2"><Check size={13} />{flash}<button onClick={() => setFlash('')} className="ml-auto text-muted-foreground hover:text-foreground"><X size={12} /></button></div>}
      {error && <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0 flex items-center gap-2"><AlertTriangle size={13} />{error}</div>}

      {/* Inhalt */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'lost' ? (
          filteredLost.length === 0 ? (
            <Empty icon={<PackageX size={44} className="opacity-30" />} text={lost.length === 0 ? 'Keine verloren gemeldeten Geräte.' : 'Keine Treffer für den Filter.'} />
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-2 py-2">Seriennummer</th>
                  <th className="px-2 py-2">Gerätetyp</th>
                  <th className="px-2 py-2">Kommentar</th>
                  <th className="px-2 py-2">Quelle</th>
                  <th className="px-2 py-2">Gemeldet</th>
                  <th className="px-2 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredLost.map(d => (
                  <tr key={d.serial} className="border-b border-border/40 hover:bg-accent/10">
                    <td className="px-2 py-1.5 font-mono text-foreground">{d.serial}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{d.deviceType || '—'}</td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[16rem] truncate" title={d.comment || undefined}>{d.comment || '—'}</td>
                    <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[12rem]" title={d.source}>{d.source || '—'}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{fmtDate(d.addedAt)}<span className="opacity-70"> · {d.addedBy}</span></td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => setRecoverFor(d)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-emerald-500 text-black border border-emerald-600 hover:bg-emerald-500/25"><PackageCheck size={12} />Aufgefunden</button>
                        <button onClick={() => doRemoveLost(d.serial)} title="Aus der Liste entfernen" className="p-1 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/10"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          filteredRecovered.length === 0 ? (
            <Empty icon={<PackageCheck size={44} className="opacity-30" />} text={recovered.length === 0 ? 'Noch keine wieder aufgefundenen Geräte.' : 'Keine Treffer für den Filter.'} />
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-2 py-2">Seriennummer</th>
                  <th className="px-2 py-2">Gefunden am</th>
                  <th className="px-2 py-2">Von</th>
                  <th className="px-2 py-2">Wo / Info</th>
                  <th className="px-2 py-2">Art</th>
                  <th className="px-2 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecovered.map(d => (
                  <tr key={d.serial + d.foundAt} className="border-b border-border/40 hover:bg-accent/10">
                    <td className="px-2 py-1.5 font-mono text-foreground">{d.serial}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{fmtDate(d.foundAt)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{d.foundBy || '—'}</td>
                    <td className="px-2 py-1.5 text-foreground max-w-[22rem] truncate" title={d.foundLocation}>{d.foundLocation || '—'}</td>
                    <td className="px-2 py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${d.foundVia === 'inventur' ? 'bg-blue-500/15 text-blue-200' : 'bg-emerald-500 text-black'}`}>{d.foundVia === 'inventur' ? 'Inventur' : 'Manuell'}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => doRemoveRecovered(d.serial)} title="Eintrag entfernen" className="p-1 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/10"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {importOpen && (
        <LostImportDialog currentUser={currentUser} onClose={() => setImportOpen(false)}
          onImported={(added, skipped) => { setImportOpen(false); setFlash(`${added} hinzugefügt${skipped > 0 ? `, ${skipped} bereits vorhanden (übersprungen)` : ''}.`); reload(false) }} />
      )}
      {addOpen && (
        <ManualAddDialog currentUser={currentUser} onClose={() => setAddOpen(false)}
          onAdded={(added, skipped) => { setAddOpen(false); setFlash(added > 0 ? 'Gerät zur Verlust-Liste hinzugefügt.' : (skipped > 0 ? 'Seriennummer war bereits als verloren gemeldet.' : '')); reload(false) }} />
      )}
      {recoverFor && (
        <RecoverDialog device={recoverFor} currentUser={currentUser} onClose={() => setRecoverFor(null)}
          onDone={() => { const s = recoverFor.serial; setRecoverFor(null); setFlash(`${s} als wieder aufgefunden markiert.`); setTab('recovered'); reload(false) }} />
      )}
    </div>
  )
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`px-3 py-1 text-[11px] ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}>{label}</button>
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">{icon}<p className="text-sm">{text}</p></div>
}

// ── Manuell hinzufügen ────────────────────────────────────────────────────────
function ManualAddDialog({ currentUser, onClose, onAdded }: { currentUser: string; onClose: () => void; onAdded: (added: number, skipped: number) => void }) {
  const [serial, setSerial] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!serial.trim()) { setError('Bitte eine Seriennummer eingeben.'); return }
    setSaving(true); setError('')
    const res = await addLostSerials([{ serial, deviceType, comment }], 'Manuell', currentUser)
    setSaving(false)
    if (!res.ok) { setError(res.error || 'Speichern fehlgeschlagen.'); return }
    onAdded(res.added, res.skipped)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border"><Plus size={16} className="text-amber-400" /><h2 className="text-sm font-semibold text-foreground flex-1">Gerät als verloren melden</h2><button onClick={onClose} className="p-1 rounded hover:bg-accent/40 text-muted-foreground"><X size={16} /></button></div>
        <div className="px-5 py-4 space-y-3">
          {error && <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2"><AlertTriangle size={13} />{error}</div>}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Seriennummer <span className="text-red-300">*</span></label>
            <input autoFocus value={serial} onChange={e => setSerial(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} placeholder="z. B. CND2201VT5" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm font-mono tracking-wider text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] font-medium text-muted-foreground mb-1">Gerätetyp (optional)</label><input value={deviceType} onChange={e => setDeviceType(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" /></div>
            <div><label className="block text-[11px] font-medium text-muted-foreground mb-1">Kommentar (optional)</label><input value={comment} onChange={e => setComment(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" /></div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
          <button onClick={save} disabled={saving || !serial.trim()} className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Hinzufügen</button>
        </div>
      </div>
    </div>
  )
}

// ── Aufgefunden-Dialog (Fundort erfassen) ─────────────────────────────────────
function RecoverDialog({ device, currentUser, onClose, onDone }: { device: LostDevice; currentUser: string; onClose: () => void; onDone: () => void }) {
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!location.trim()) { setError('Bitte angeben, wo das Gerät gefunden wurde.'); return }
    setSaving(true); setError('')
    const res = await markRecovered(device.serial, location, currentUser, 'manuell')
    setSaving(false)
    if (!res.ok) { setError(res.error || 'Speichern fehlgeschlagen.'); return }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-emerald-500/40 bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border"><PackageCheck size={16} className="text-emerald-400" /><h2 className="text-sm font-semibold text-foreground flex-1">Gerät wieder aufgefunden</h2><button onClick={onClose} className="p-1 rounded hover:bg-accent/40 text-muted-foreground"><X size={16} /></button></div>
        <div className="px-5 py-4 space-y-3">
          {error && <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2"><AlertTriangle size={13} />{error}</div>}
          <p className="text-xs text-muted-foreground">Seriennummer: <span className="font-mono text-foreground">{device.serial}</span></p>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1"><MapPin size={11} />Wo wurde das Gerät gefunden? <span className="text-red-300">*</span></label>
            <textarea autoFocus value={location} onChange={e => setLocation(e.target.value)} rows={3} placeholder="z. B. im Lager Regal 3 / bei Mitarbeiter XY / im Serverraum …" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
          <button onClick={save} disabled={saving || !location.trim()} className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Als aufgefunden speichern</button>
        </div>
      </div>
    </div>
  )
}
