// ── „Gib dein Problem ein“ → Umschaltung „ServiceNow Welt“ ───────────────────
// Alle Bestellungen, Anträge, Ticket-Formulare und Portalseiten aus skfprod — auf Deutsch suchbar,
// mit Direktlink. Katalog wird erst beim Umschalten geladen (Lazy Loading).
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, ExternalLink, Copy, Check, Loader2, Globe, Ticket, ShoppingCart, Link2, Compass, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../electronAPI'
import { baueSnIndex, snSuche, snLink, snPortalSuche, HAEUFIG, PORTAL_SEITEN, SN_ART, type SnIndex, type SnKatalog, type SnTreffer } from './welt'

let indexCache: Promise<SnIndex> | null = null
function ladeIndex(): Promise<SnIndex> {
  if (!indexCache) {
    indexCache = (async () => {
      const eingebaut = (await import('./katalog.json')).default as SnKatalog
      // neuerer Stand auf dem Netzlaufwerk hat Vorrang (servicenow-welt/katalog.json)
      let k: SnKatalog = eingebaut
      try {
        const netz = await api().netReadJsonAsync<SnKatalog>('servicenow-welt/katalog.json')
        if (netz?.eintraege?.length && netz.stand > eingebaut.stand) k = netz
      } catch { /* Netzlaufwerk fehlt — eingebauter Stand */ }
      return baueSnIndex(k)
    })()
  }
  return indexCache
}

const ARTEN: { id: string; titel: string; icon: React.ReactNode }[] = [
  { id: '', titel: 'Alles', icon: <Globe size={12} /> },
  { id: 'catalog_item', titel: 'Bestellen & Beantragen', icon: <ShoppingCart size={12} /> },
  { id: 'record_producer', titel: 'Ticket / Meldung', icon: <Ticket size={12} /> },
  { id: 'order_guide', titel: 'Bestell-Assistenten', icon: <Compass size={12} /> },
  { id: 'content_item', titel: 'Links', icon: <Link2 size={12} /> },
  { id: 'portal', titel: 'Portalseiten', icon: <Globe size={12} /> },
]
const ART_FARBE: Record<string, string> = {
  record_producer: 'border-red-500/40 text-red-600 dark:text-red-400',
  order_guide: 'border-violet-500/40 text-violet-600 dark:text-violet-400',
  portal: 'border-sky-500/40 text-sky-600 dark:text-sky-400',
  content_item: 'border-border text-muted-foreground',
  catalog_item: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
}

export default function ServiceNowWelt({ q, setQ }: { q: string; setQ: (s: string) => void }) {
  const [ix, setIx] = useState<SnIndex | null>(null)
  const [art, setArt] = useState('')
  const [markiert, setMarkiert] = useState(0)
  const [offen, setOffen] = useState<string | null>(null)
  const [kopiert, setKopiert] = useState<string | null>(null)
  const eingabe = useRef<HTMLInputElement>(null)
  useEffect(() => { let an = true; void ladeIndex().then(x => { if (an) setIx(x) }); setTimeout(() => eingabe.current?.focus(), 0); return () => { an = false } }, [])
  const qs = useDeferredValue(q)
  const treffer = useMemo<SnTreffer[]>(() => {
    if (!ix) return []
    if (qs.trim()) return snSuche(ix, qs, { art: art || undefined })
    if (art) return ix.doks.filter(d => d.e.typ === art).slice(0, 200).map(d => ({ e: d.e, punkte: 0, link: snLink(ix.instanz, d.e) }))
    return []
  }, [ix, qs, art])
  const haeufig = useMemo(() => (ix ? HAEUFIG.map(h => { const d = ix.doks.find(x => h.muster.test(x.e.n)); return d ? { titel: h.titel, t: { e: d.e, punkte: 0, link: snLink(ix.instanz, d.e) } } : null }).filter(Boolean) as { titel: string; t: SnTreffer }[] : []), [ix])
  const zaehl = useMemo(() => { const z: Record<string, number> = {}; for (const d of ix?.doks || []) z[d.e.typ] = (z[d.e.typ] || 0) + 1; return z }, [ix])
  useEffect(() => { setMarkiert(0) }, [qs, art])

  const oeffne = (t: SnTreffer) => { void api().openExternal(t.link) }
  const kopiere = (t: SnTreffer) => { void navigator.clipboard.writeText(t.link).then(() => { setKopiert(t.e.id); setTimeout(() => setKopiert(null), 1500) }) }

  return (
    <div className="space-y-3" data-sn-welt>
      <div className="relative">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input ref={eingabe} value={q} onChange={e => setQ(e.target.value)} spellCheck={false} data-sn-eingabe
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMarkiert(m => Math.min(m + 1, treffer.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setMarkiert(m => Math.max(m - 1, 0)) }
            else if (e.key === 'Enter' && treffer[markiert]) { e.preventDefault(); oeffne(treffer[markiert]) }
            else if (e.key === 'Escape') setQ('')
          }}
          placeholder="Was brauchst du? z. B. „Copilot Lizenz“, „Netzwerkdose freischalten“, „Postfach Stellvertretung“, „Störung melden“ …"
          className="w-full pl-11 pr-10 py-3.5 text-base rounded-xl border-2 border-sky-500/40 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-sky-500 shadow-sm" />
        {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent text-muted-foreground"><X size={15} /></button>}
      </div>

      <div className="flex flex-wrap gap-1.5 justify-center">
        {ARTEN.map(a => (
          <button key={a.id} onClick={() => setArt(a.id)}
            className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${art === a.id ? 'bg-sky-600 text-white border-sky-600' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
            {a.icon}{a.titel}{a.id && zaehl[a.id] ? <span className="opacity-60">{zaehl[a.id]}</span> : null}
          </button>
        ))}
      </div>

      {!ix && <p className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" />ServiceNow-Katalog wird geladen …</p>}

      {ix && !q.trim() && !art && (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Häufig gebraucht</p>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {haeufig.map(h => (
                <button key={h.t.e.id} onClick={() => oeffne(h.t)} className="text-left rounded-lg border border-border bg-card px-3 py-2 hover:border-sky-500/50 hover:bg-sky-500/5">
                  <span className="block text-sm font-medium text-foreground">{h.titel}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{h.t.e.n}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Portal</p>
            <div className="flex flex-wrap gap-1.5">
              {PORTAL_SEITEN.map(p => (
                <button key={p.id} onClick={() => void api().openExternal(snLink(ix.instanz, p))} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10"><ExternalLink size={11} />{p.n}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {ix && (q.trim() || art) && (
        <div className="rounded-xl border border-border bg-card divide-y divide-border/60 max-h-[480px] overflow-y-auto shadow-sm" data-sn-treffer>
          {!treffer.length && <p className="px-4 py-3 text-sm text-muted-foreground">Nichts gefunden — anders beschreiben oder unten in der ServiceNow-Portalsuche nachsehen.</p>}
          {treffer.map((t, i) => {
            const a = SN_ART[t.e.typ] || { kurz: t.e.typ }
            const auf = offen === t.e.id
            return (
              <div key={t.e.id + i} onMouseEnter={() => setMarkiert(i)} className={i === markiert ? 'bg-sky-500/10' : ''}>
                <div className="px-4 py-2.5 flex items-start gap-3">
                  <button onClick={() => setOffen(auf ? null : t.e.id)} className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0" title="Beschreibung">{auf ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                  <button onClick={() => oeffne(t)} className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-medium text-foreground">{t.e.n}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{[t.e.k, t.e.b !== t.e.n ? t.e.b : ''].filter(Boolean).join(' · ')}</span>
                  </button>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${ART_FARBE[t.e.typ] || 'border-border text-muted-foreground'}`}>{a.kurz}</span>
                  <button onClick={() => kopiere(t)} title="Link kopieren" className="p-1 rounded hover:bg-accent text-muted-foreground shrink-0">{kopiert === t.e.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}</button>
                  <button onClick={() => oeffne(t)} title="In ServiceNow öffnen" className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 shrink-0"><ExternalLink size={12} />öffnen</button>
                </div>
                {auf && (
                  <div className="px-11 pb-3 text-[12px] text-muted-foreground space-y-1">
                    {t.e.d ? <p className="text-foreground/80">{t.e.d}</p> : <p>Keine weitere Beschreibung.</p>}
                    <p className="font-mono text-[10px] break-all">{t.link}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {ix && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>ServiceNow skfprod · {ix.doks.length} Einträge · Stand {new Date(ix.stand).toLocaleDateString('de-DE')}</span>
          {q.trim() && <button onClick={() => void api().openExternal(snPortalSuche(ix.instanz, q))} className="inline-flex items-center gap-1 underline hover:text-foreground"><ExternalLink size={11} />„{q.trim()}“ in der Portalsuche</button>}
        </div>
      )}
    </div>
  )
}
