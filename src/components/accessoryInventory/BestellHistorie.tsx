// ── Bestellungen (Historie) ───────────────────────────────────────────────────
// Je Bestellung: wer, wann, an wen, Positionen. „Angekommen" bucht Lager-Artikel direkt in
// den Bestand (Abhaken rückgängig = wieder ausbuchen). In Outlook geöffnete Bestellungen
// werden nach dem Senden von Hand als gesendet abgehakt — erst dann gelten sie als unterwegs.
import { useState } from 'react'
import { History, ChevronDown, ChevronRight, ExternalLink, Trash2, CheckCircle2, Mail, Loader2, ClipboardList } from 'lucide-react'
import { api } from '../../electronAPI'
import type { AccessoryHistoryEntry } from '../../services/accessoryInventory'
import { linkHref } from '../../services/zubehoerBestellung'

const fmt = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function BestellHistorie({ history, busy, onArrived, onGesendet, onLoeschen }: {
  history: AccessoryHistoryEntry[]
  busy: string                                        // `${id}:${idx}` bzw. `${id}:gesendet` / `${id}:del`
  onArrived: (id: string, idx: number, wert: boolean) => void
  onGesendet: (id: string, wert: boolean) => void
  onLoeschen: (id: string) => void
}) {
  const [offen, setOffen] = useState(true)
  const [auf, setAuf] = useState<string | null>(null)
  const [loeschen, setLoeschen] = useState<string | null>(null)
  const offeneBestellungen = history.filter(h => h.sentToSascha && h.lines.some(l => !l.arrived)).length

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <button onClick={() => setOffen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-accent/20">
        <History size={15} className="text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Bestellungen</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{history.length}</span>
        {offeneBestellungen > 0 && <span className="text-[11px] text-blue-500">{offeneBestellungen} noch nicht vollständig angekommen</span>}
        <ChevronDown size={15} className={`ml-auto text-muted-foreground transition-transform ${offen ? 'rotate-180' : ''}`} />
      </button>
      {offen && (
        <div className="border-t border-border">
          {history.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">Noch keine Bestellung verschickt.</div>}
          {history.map(h => {
            const istAuf = auf === h.id
            const angekommen = h.lines.filter(l => l.arrived).length
            const badge = h.art === 'gesendet'
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 inline-flex items-center gap-1"><CheckCircle2 size={10} />gesendet{h.an ? ` an ${h.an}` : ''}</span>
              : h.art === 'outlook'
                ? (h.sentToSascha
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 inline-flex items-center gap-1"><CheckCircle2 size={10} />über Outlook gesendet</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 inline-flex items-center gap-1"><Mail size={10} />in Outlook geöffnet — gesendet?</span>)
                : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground inline-flex items-center gap-1"><ClipboardList size={10} />Inventur (alt){h.sentToSascha ? ' · an Sascha' : ''}</span>
            return (
              <div key={h.id} className="border-b border-border last:border-b-0">
                <div className={`flex items-center gap-2 px-3 py-2 hover:bg-accent/10 ${istAuf ? 'bg-accent/10' : ''}`}>
                  <button onClick={() => setAuf(istAuf ? null : h.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <ChevronRight size={14} className={`text-muted-foreground shrink-0 transition-transform ${istAuf ? 'rotate-90' : ''}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground flex items-center gap-2 flex-wrap">{fmt(h.timestamp)}<span className="text-muted-foreground">· {h.by}</span>{badge}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {h.reorderCount} Position{h.reorderCount === 1 ? '' : 'en'} · {h.totalUnits} Stück
                        {h.reorderCount > 0 && <> · <span className={angekommen === h.reorderCount ? 'text-emerald-500' : ''}>{angekommen}/{h.reorderCount} angekommen</span></>}
                      </p>
                    </div>
                  </button>
                  {loeschen === h.id ? (
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <button onClick={() => { setLoeschen(null); onLoeschen(h.id) }} className="px-2 py-1 rounded bg-red-500/15 text-red-500 text-[11px]">Eintrag löschen</button>
                      <button onClick={() => setLoeschen(null)} className="px-1.5 py-1 rounded text-muted-foreground hover:bg-accent text-[11px]">Abbruch</button>
                    </span>
                  ) : (
                    <button onClick={() => setLoeschen(h.id)} disabled={busy === `${h.id}:del`} title="Eintrag löschen (Bestand bleibt, wie er ist)" className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0"><Trash2 size={12} /></button>
                  )}
                </div>
                {istAuf && (
                  <div className="px-3 pb-3 pt-1 space-y-2">
                    {(h.an || h.cc || h.anmerkung) && (
                      <p className="text-[11px] text-muted-foreground">{h.an ? `An ${h.an}` : ''}{h.cc ? ` · CC ${h.cc}` : ''}{h.anmerkung ? ` · Anmerkung: ${h.anmerkung}` : ''}</p>
                    )}
                    {h.art === 'outlook' && (
                      <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border cursor-pointer select-none">
                        <input type="checkbox" checked={h.sentToSascha} onChange={e => onGesendet(h.id, e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                        <span className="text-xs text-foreground">In Outlook gesendet</span>
                        {busy === `${h.id}:gesendet` && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                        {h.sentToSascha && h.sentToSaschaAt && <span className="text-[10px] text-muted-foreground ml-auto">abgehakt am {fmt(h.sentToSaschaAt)}</span>}
                      </label>
                    )}
                    {h.lines.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1">Bei dieser Inventur musste nichts bestellt werden.</p>
                    ) : (
                      <div className="rounded-md border border-border divide-y divide-border">
                        {h.lines.map((l, idx) => {
                          const laeuft = busy === `${h.id}:${idx}`
                          return (
                            <label key={idx} className="flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer select-none hover:bg-accent/10">
                              <input type="checkbox" checked={l.arrived} disabled={laeuft} onChange={e => onArrived(h.id, idx, e.target.checked)} className="w-4 h-4 accent-emerald-500 shrink-0" />
                              <span className={`flex-1 min-w-0 text-sm truncate ${l.arrived ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{l.name} <span className="text-primary font-medium">({l.quantity})</span></span>
                              {laeuft && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                              {l.arrived && l.gebucht ? <span className="text-[10px] text-emerald-500 shrink-0">+{l.gebucht} eingebucht</span>
                                : !l.arrived && l.itemId ? <span className="text-[10px] text-muted-foreground shrink-0">bucht beim Haken +{l.quantity} ein</span> : null}
                              {linkHref(l.amazonLink) && (
                                <button type="button" onClick={e => { e.preventDefault(); try { void api().openExternal(linkHref(l.amazonLink)) } catch { /* ignore */ } }} title="Bestelllink öffnen"
                                  className="p-1 rounded text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 shrink-0"><ExternalLink size={13} /></button>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${l.arrived ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>{l.arrived ? 'angekommen' : 'offen'}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
