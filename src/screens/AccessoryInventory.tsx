// ── Zubehör-Inventur (Kleinteile-Lager) ───────────────────────────────────────
// Lagerbestand nach Kategorien: je Artikel Bestand (IST) und Soll direkt eintragen
// (Enter springt zum nächsten Artikel). „Bestellung verfassen" macht aus allem unter Soll
// eine Bestellliste für Sascha Herges (direkt senden oder im Outlook-Fenster mit PDF).
// Änderungen werden gesammelt und nach kurzer Pause gespeichert — nur die geänderten
// Felder, damit gleichzeitig zählende Kollegen sich nicht überschreiben.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Cable, Plus, Minus, Search, Trash2, Edit3, Loader2, AlertTriangle, ShoppingCart, Link2, Link2Off,
  RefreshCw, Check, X, ChevronDown, CheckCircle2, Truck, Info, CircleDashed, ExternalLink, Headphones,
} from 'lucide-react'
import HeadsetVergabe from '../components/accessoryInventory/HeadsetVergabe'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import {
  ladeLager, aendereLager, patchesAnwenden, neuerArtikel, loadHistory, bestellVorschlag, unterwegsJeArtikel,
  setHistoryLineArrived, setHistorySentToSascha, deleteHistoryEntry,
  type AccessoryItem, type AccessoryHistoryEntry, type ArtikelPatch,
} from '../services/accessoryInventory'
import { KATEGORIEN, kategorieName, rateKategorie, normName, amazonSuche } from '../services/zubehoerKatalog'
import { linkHref, kurzLink } from '../services/zubehoerBestellung'
import BestellDialog from '../components/accessoryInventory/BestellDialog'
import BestellHistorie from '../components/accessoryInventory/BestellHistorie'

type Filter = 'alle' | 'unter' | 'ungezaehlt' | 'ohneLink'

const fmt = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function oeffne(url: string) { const h = linkHref(url); if (h) { try { void api().openExternal(h) } catch { /* ignore */ } } }

const ZU_KEY = 'zubehoer.zugeklappt'
function ladeZu(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(ZU_KEY) || '[]')) } catch { return new Set() } }
function merkeZu(s: Set<string>) { try { localStorage.setItem(ZU_KEY, JSON.stringify([...s])) } catch { /* egal */ } }

interface Status { art: 'ungezaehlt' | 'ohneSoll' | 'ok' | 'fehlt' | 'leer'; fehlt: number }
function statusVon(it: AccessoryItem): Status {
  if (!it.gezaehltAm) return { art: 'ungezaehlt', fehlt: Math.max(0, it.target - it.current) }
  if (it.target === 0) return { art: 'ohneSoll', fehlt: 0 }
  if (it.current >= it.target) return { art: 'ok', fehlt: 0 }
  return { art: it.current === 0 ? 'leer' : 'fehlt', fehlt: it.target - it.current }
}

type Reiter = 'bestand' | 'headsets'
const REITER_KEY = 'zubehoer.reiter'

// Reiter „Bestand" (Kleinteile-Lager) und „Headset Vergabe". Der Bestand bleibt beim Wechsel
// eingehängt (nur versteckt), damit gesammelte, noch nicht gespeicherte Zählungen nicht verloren gehen.
export default function AccessoryInventory() {
  const user = useAuthStore(s => s.session?.user)
  const von = user?.displayName || user?.username || 'unbekannt'
  const [reiter, setReiter] = useState<Reiter>(() => { try { return localStorage.getItem(REITER_KEY) === 'headsets' ? 'headsets' : 'bestand' } catch { return 'bestand' } })
  const [headsetsGeladen, setHeadsetsGeladen] = useState(reiter === 'headsets')
  const wechsel = (r: Reiter) => { setReiter(r); if (r === 'headsets') setHeadsetsGeladen(true); try { localStorage.setItem(REITER_KEY, r) } catch { /* egal */ } }
  const REITER: { id: Reiter; label: string; icon: JSX.Element }[] = [
    { id: 'bestand', label: 'Bestand', icon: <Cable size={14} /> },
    { id: 'headsets', label: 'Headset Vergabe', icon: <Headphones size={14} /> },
  ]
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex gap-1 border-b border-border px-5 pt-1.5 shrink-0" data-zubehoer-reiter>
        {REITER.map(r => (
          <button key={r.id} onClick={() => wechsel(r.id)} data-reiter={r.id}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${reiter === r.id ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {r.icon}{r.label}
          </button>
        ))}
      </div>
      <div className={reiter === 'bestand' ? 'flex-1 min-h-0' : 'hidden'}><BestandAnsicht von={von} /></div>
      {headsetsGeladen && <div className={reiter === 'headsets' ? 'flex-1 min-h-0' : 'hidden'}><HeadsetVergabe von={von} /></div>}
    </div>
  )
}

function BestandAnsicht({ von }: { von: string }) {
  const [items, setItems] = useState<AccessoryItem[]>([])
  const [history, setHistory] = useState<AccessoryHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState('')
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'info'; text: string } | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [suche, setSuche] = useState('')
  const [filter, setFilter] = useState<Filter>('alle')
  const [zu, setZu] = useState<Set<string>>(ladeZu)
  const [editor, setEditor] = useState<EditorDaten | null>(null)
  const [loeschId, setLoeschId] = useState<string | null>(null)
  const [bestellung, setBestellung] = useState(false)
  const [histBusy, setHistBusy] = useState('')

  // ── Gesammelte Änderungen (Patch je Artikel) ──
  const ausstehend = useRef(new Map<string, ArtikelPatch>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kette = useRef<Promise<void>>(Promise.resolve())

  const flush = useCallback((): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    kette.current = kette.current.then(async () => {
      if (!ausstehend.current.size) return
      const patches = new Map(ausstehend.current)
      ausstehend.current.clear()
      setSpeichert(true)
      try {
        const neu = await aendereLager(list => patchesAnwenden(list, patches), von)
        setItems(patchesAnwenden(neu, ausstehend.current))
        setFehler('')
      } catch (e) {
        // nicht verlieren: zurück in die Warteschlange (neuere Werte gehen vor)
        for (const [id, p] of patches) ausstehend.current.set(id, { ...p, ...ausstehend.current.get(id) })
        setFehler(`${e instanceof Error ? e.message : String(e)} Die Änderungen bleiben vorgemerkt.`)
      } finally { setSpeichert(false) }
    })
    return kette.current
  }, [von])

  const aendere = useCallback((id: string, p: ArtikelPatch) => {
    ausstehend.current.set(id, { ...ausstehend.current.get(id), ...p })
    setItems(list => patchesAnwenden(list, new Map([[id, p]])))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, 700)
  }, [flush])

  useEffect(() => () => { void flush() }, [flush])

  const laden = useCallback(async (still = false) => {
    if (!still) setLoading(true)
    try {
      await flush()
      const [lager, hist] = await Promise.all([ladeLager(von), loadHistory()])
      setItems(patchesAnwenden(lager.items, ausstehend.current))
      setHistory(hist)
      setFehler('')
      if (lager.neuAufgenommen.length) setMeldung({ art: 'info', text: `${lager.neuAufgenommen.length} übliche Büro-Artikel neu in die Liste aufgenommen (Bestand „nicht gezählt"). Bitte zählen — erst dann kommen sie in eine Bestellung. Nicht benötigte Artikel einfach löschen.` })
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Liste konnte nicht geladen werden. Netzlaufwerk erreichbar?')
    } finally { setLoading(false) }
  }, [flush, von])
  useEffect(() => { void laden() }, [laden])
  // Stand anderer Admins alle 2 Minuten nachladen — nicht, während jemand tippt
  useEffect(() => {
    const t = setInterval(() => {
      const a = document.activeElement
      if (bestellung || editor || ausstehend.current.size || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) return
      void laden(true)
    }, 120_000)
    return () => clearInterval(t)
  }, [laden, bestellung, editor])

  // ── Ableitungen ──
  const unterwegs = useMemo(() => unterwegsJeArtikel(history), [history])
  const vorschlag = useMemo(() => bestellVorschlag(items, history), [items, history])
  const zaehler = useMemo(() => ({
    alle: items.length,
    unter: items.filter(it => it.gezaehltAm && it.current < it.target).length,
    ungezaehlt: items.filter(it => !it.gezaehltAm).length,
    ohneLink: items.filter(it => !linkHref(it.amazonLink)).length,
  }), [items])
  const sichtbar = useMemo(() => {
    const q = normName(suche)
    return items.filter(it => {
      if (q && !normName(`${it.name} ${it.notiz || ''}`).includes(q)) return false
      if (filter === 'unter') return !!it.gezaehltAm && it.current < it.target
      if (filter === 'ungezaehlt') return !it.gezaehltAm
      if (filter === 'ohneLink') return !linkHref(it.amazonLink)
      return true
    })
  }, [items, suche, filter])
  const gruppen = useMemo(() => {
    const ids = [...KATEGORIEN.map(k => k.id), ...new Set(sichtbar.map(it => it.kategorie).filter(k => !KATEGORIEN.some(x => x.id === k)))]
    return ids.map(id => ({ id, name: kategorieName(id), items: sichtbar.filter(it => it.kategorie === id) })).filter(g => g.items.length)
  }, [sichtbar])
  // Reihenfolge der Eingabefelder für „Enter → nächster Artikel" (nur aufgeklappte Gruppen)
  const reihenfolge = useMemo(() => gruppen.filter(g => !zu.has(g.id) || !!suche).flatMap(g => g.items.map(it => it.id)), [gruppen, zu, suche])

  function klappe(id: string) { setZu(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); merkeZu(n); return n }) }

  async function mitLager(fn: (l: AccessoryItem[]) => AccessoryItem[]) {
    await flush()
    setSpeichert(true)
    try { const neu = await aendereLager(fn, von); setItems(patchesAnwenden(neu, ausstehend.current)); setFehler(''); return true }
    catch (e) { setFehler(e instanceof Error ? e.message : String(e)); return false }
    finally { setSpeichert(false) }
  }

  async function speichereEditor(d: EditorDaten): Promise<string | null> {
    const name = d.name.trim()
    const dublette = items.find(it => it.id !== d.id && normName(it.name) === normName(name))
    if (dublette) return `„${dublette.name}" gibt es schon (${kategorieName(dublette.kategorie)}).`
    const ist = d.current.trim() === '' ? null : Math.max(0, parseInt(d.current, 10) || 0)
    const soll = Math.max(0, parseInt(d.target, 10) || 0)
    if (d.id) {
      const alt = items.find(it => it.id === d.id)
      const patch: ArtikelPatch = { name, kategorie: d.kategorie, target: soll, amazonLink: d.amazonLink, notiz: d.notiz }
      if (ist != null && (ist !== alt?.current || !alt?.gezaehltAm)) Object.assign(patch, { current: ist, gezaehltAm: new Date().toISOString(), gezaehltVon: von })
      ausstehend.current.delete(d.id)
      return (await mitLager(l => patchesAnwenden(l, new Map([[d.id!, patch]])))) ? null : 'Speichern fehlgeschlagen.'
    }
    const neu = neuerArtikel({ name, kategorie: d.kategorie, current: ist, target: soll, amazonLink: d.amazonLink, notiz: d.notiz, von })
    return (await mitLager(l => [...l, neu])) ? null : 'Speichern fehlgeschlagen.'
  }

  async function loesche(id: string) {
    setLoeschId(null)
    ausstehend.current.delete(id)
    await mitLager(l => l.filter(it => it.id !== id))
  }

  // ── Historie ──
  async function arrived(id: string, idx: number, wert: boolean) {
    setHistBusy(`${id}:${idx}`)
    try {
      await flush()
      const r = await setHistoryLineArrived(id, idx, wert, von)
      setHistory(r.history)
      if (r.items) setItems(patchesAnwenden(r.items, ausstehend.current))
      const l = r.history.find(e => e.id === id)?.lines[idx]
      if (l && r.gebucht) setMeldung({ art: 'ok', text: r.gebucht > 0 ? `${l.name}: +${r.gebucht} in den Bestand gebucht.` : `${l.name}: ${-r.gebucht} wieder aus dem Bestand genommen.` })
    } catch (e) { setFehler(e instanceof Error ? e.message : String(e)) }
    finally { setHistBusy('') }
  }
  async function gesendet(id: string, wert: boolean) {
    setHistBusy(`${id}:gesendet`)
    try { setHistory(await setHistorySentToSascha(id, wert)) } catch (e) { setFehler(e instanceof Error ? e.message : String(e)) } finally { setHistBusy('') }
  }
  async function histLoeschen(id: string) {
    setHistBusy(`${id}:del`)
    try { setHistory(await deleteHistoryEntry(id)) } catch (e) { setFehler(e instanceof Error ? e.message : String(e)) } finally { setHistBusy('') }
  }

  const chips: { f: Filter; label: string; n: number; ton?: string }[] = [
    { f: 'alle', label: 'Alle', n: zaehler.alle },
    { f: 'unter', label: 'Unter Soll', n: zaehler.unter, ton: 'text-amber-500' },
    { f: 'ungezaehlt', label: 'Nicht gezählt', n: zaehler.ungezaehlt, ton: 'text-blue-500' },
    { f: 'ohneLink', label: 'Ohne Bestelllink', n: zaehler.ohneLink },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <Cable className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Zubehör Inventur</h1>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
            Kleinteile-Lager · {items.length} Artikel · <span className={zaehler.unter ? 'text-amber-500' : ''}>{zaehler.unter} unter Soll</span>
            {zaehler.ungezaehlt > 0 && <> · <span className="text-blue-500">{zaehler.ungezaehlt} nicht gezählt</span></>}
            {speichert ? <span className="inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" />speichert…</span> : null}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void laden()} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent border border-border" title="Neu laden (Stand der Kollegen)">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setEditor({ name: '', kategorie: 'sonstiges', current: '', target: '1', amazonLink: '', notiz: '' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border text-foreground hover:bg-accent"><Plus size={14} />Artikel hinzufügen</button>
          <button onClick={() => { void flush().then(() => setBestellung(true)) }} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <ShoppingCart size={14} />Bestellung verfassen
            {vorschlag.positionen.length > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-white/25 text-[10px]">{vorschlag.positionen.length}</span>}
          </button>
        </div>
      </div>

      {/* Suche + Filter */}
      <div className="flex items-center gap-2 px-5 py-2.5 shrink-0 flex-wrap">
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Artikel suchen…"
            className="w-full pl-8 pr-2 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50" />
        </div>
        {chips.map(c => (
          <button key={c.f} onClick={() => setFilter(c.f)}
            className={`px-2.5 py-1 rounded-full text-[11px] border ${filter === c.f ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-accent'}`}>
            {c.label} <span className={filter === c.f ? '' : c.ton}>{c.n}</span>
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground hidden lg:inline">Bestand eintragen · Enter = nächster Artikel · +/− zählt direkt</span>
      </div>

      {(fehler || meldung) && (
        <div className="px-5 space-y-1.5 shrink-0">
          {fehler && <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-xs"><AlertTriangle size={14} className="shrink-0 mt-0.5" /><span className="flex-1">{fehler}</span><button onClick={() => setFehler('')}><X size={12} /></button></div>}
          {meldung && <div className={`flex items-start gap-2 px-3 py-2 rounded-md text-xs border ${meldung.art === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-blue-500/10 border-blue-500/30 text-blue-500'}`}>
            {meldung.art === 'ok' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <Info size={14} className="shrink-0 mt-0.5" />}<span className="flex-1">{meldung.text}</span><button onClick={() => setMeldung(null)}><X size={12} /></button></div>}
        </div>
      )}

      {/* Liste */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2.5 space-y-4">
        {loading && !items.length ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Lade Lagerliste…</div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_120px_168px_64px] items-center gap-3 px-3 py-2 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Artikel</span><span className="text-center">Bestand (Ist)</span><span className="text-center">Soll</span><span>Status</span><span />
            </div>
            {gruppen.length === 0 && <div className="px-3 py-8 text-center text-xs text-muted-foreground">{items.length ? 'Kein Artikel passt zu Suche/Filter.' : 'Noch keine Artikel.'}</div>}
            {gruppen.map(g => {
              const geschlossen = zu.has(g.id) && !suche
              const unter = g.items.filter(it => it.gezaehltAm && it.current < it.target).length
              const offenZ = g.items.filter(it => !it.gezaehltAm).length
              return (
                <div key={g.id}>
                  <button onClick={() => klappe(g.id)} className="w-full flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted/10 hover:bg-accent/30 text-left">
                    <ChevronDown size={13} className={`text-muted-foreground transition-transform ${geschlossen ? '-rotate-90' : ''}`} />
                    <span className="text-xs font-semibold text-foreground">{g.name}</span>
                    <span className="text-[10px] text-muted-foreground">{g.items.length} Artikel</span>
                    {unter > 0 && <span className="text-[10px] text-amber-500">· {unter} unter Soll</span>}
                    {offenZ > 0 && <span className="text-[10px] text-blue-500">· {offenZ} nicht gezählt</span>}
                  </button>
                  {!geschlossen && g.items.map(it => (
                    <ArtikelZeile key={it.id} it={it} index={reihenfolge.indexOf(it.id)} unterwegs={unterwegs.get(it.id)?.menge ?? 0}
                      loeschFrage={loeschId === it.id}
                      onIst={n => aendere(it.id, { current: n, gezaehltAm: new Date().toISOString(), gezaehltVon: von })}
                      onSoll={n => aendere(it.id, { target: n })}
                      onEdit={() => setEditor({ id: it.id, name: it.name, kategorie: it.kategorie, current: it.gezaehltAm ? String(it.current) : '', target: String(it.target), amazonLink: it.amazonLink, notiz: it.notiz || '', gezaehlt: it.gezaehltAm ? `${fmt(it.gezaehltAm)}${it.gezaehltVon ? ` von ${it.gezaehltVon}` : ''}` : undefined })}
                      onLoeschFrage={v => setLoeschId(v ? it.id : null)} onLoeschen={() => void loesche(it.id)} />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <BestellHistorie history={history} busy={histBusy} onArrived={(id, i, w) => void arrived(id, i, w)} onGesendet={(id, w) => void gesendet(id, w)} onLoeschen={id => void histLoeschen(id)} />
      </div>

      {editor && <ArtikelDialog daten={editor} onClose={() => setEditor(null)} onSpeichern={async d => { const f = await speichereEditor(d); if (!f) setEditor(null); return f }} />}
      {bestellung && (
        <BestellDialog items={items} history={history} von={von} onClose={() => setBestellung(false)}
          onFertig={({ meldung: m, items: neu, eintrag }) => {
            setBestellung(false)
            setMeldung({ art: 'ok', text: m })
            setHistory(h => [eintrag, ...h.filter(e => e.id !== eintrag.id)])
            if (neu) setItems(patchesAnwenden(neu, ausstehend.current))
          }} />
      )}
    </div>
  )
}

// ── Zahlfeld mit −/+ ─────────────────────────────────────────────────────────
function ZahlFeld({ wert, leer, onCommit, art, index, titel }: { wert: number; leer?: boolean; onCommit: (n: number) => void; art: 'ist' | 'soll'; index: number; titel: string }) {
  // Entwurf zusätzlich im Ref: Enter übernimmt SOFORT (nicht erst über blur), und das
  // anschließende blur übernimmt nicht ein zweites Mal.
  const [draft, setDraftState] = useState<string | null>(null)
  const draftRef = useRef<string | null>(null)
  const setDraft = (v: string | null) => { draftRef.current = v; setDraftState(v) }
  const commit = () => {
    const d = draftRef.current
    if (d === null) return
    setDraft(null)
    const s = d.trim()
    if (s === '') return
    const n = Math.min(9999, Math.max(0, parseInt(s, 10) || 0))
    if (n !== wert || leer) onCommit(n)
  }
  const springe = (dir: number) => {
    const el = document.querySelector<HTMLInputElement>(`input[data-zahl="${art}"][data-index="${index + dir}"]`)
    if (el) { el.focus(); el.select() }
  }
  const knopf = 'w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30'
  return (
    <div className="flex justify-center">
      <div className={`inline-flex items-center rounded-md border bg-background overflow-hidden ${leer ? 'border-dashed border-blue-500/50' : 'border-border'}`} title={titel}>
        <button tabIndex={-1} onClick={() => onCommit(leer ? 0 : Math.max(0, wert - 1))} disabled={!leer && wert <= 0} className={knopf} aria-label="weniger"><Minus size={12} /></button>
        <input value={draft ?? (leer ? '' : String(wert))} placeholder={leer ? '?' : '0'} inputMode="numeric" data-zahl={art} data-index={index}
          onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onFocus={e => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); springe(e.shiftKey ? -1 : 1) }
            else if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
            else if (e.key === 'ArrowDown') { e.preventDefault(); commit(); springe(1) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); commit(); springe(-1) }
          }}
          className="w-11 h-7 text-center text-sm font-semibold bg-transparent text-foreground placeholder:text-blue-500/70 focus:outline-none focus:bg-primary/10" />
        <button tabIndex={-1} onClick={() => onCommit(leer ? 1 : wert + 1)} className={knopf} aria-label="mehr"><Plus size={12} /></button>
      </div>
    </div>
  )
}

// ── Eine Zeile ────────────────────────────────────────────────────────────────
function ArtikelZeile({ it, index, unterwegs, loeschFrage, onIst, onSoll, onEdit, onLoeschFrage, onLoeschen }: {
  it: AccessoryItem; index: number; unterwegs: number; loeschFrage: boolean
  onIst: (n: number) => void; onSoll: (n: number) => void; onEdit: () => void
  onLoeschFrage: (v: boolean) => void; onLoeschen: () => void
}) {
  const st = statusVon(it)
  const link = linkHref(it.amazonLink)
  const badge = st.art === 'ungezaehlt'
    ? <span className="inline-flex items-center gap-1 text-[11px] text-blue-500"><CircleDashed size={12} />nicht gezählt</span>
    : st.art === 'ohneSoll' ? <span className="text-[11px] text-muted-foreground">kein Soll</span>
    : st.art === 'ok' ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500"><Check size={12} />Soll erfüllt</span>
    : <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${st.art === 'leer' ? 'text-red-500' : 'text-amber-500'}`}><AlertTriangle size={12} />{st.art === 'leer' ? 'leer · ' : ''}{st.fehlt} fehlen</span>
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px_120px_168px_64px] items-center gap-3 px-3 py-1 border-t border-border hover:bg-accent/20">
      <div className="min-w-0 pl-5">
        <div className="flex items-center gap-1.5 min-w-0">
          <button onClick={onEdit} className="text-sm text-foreground truncate text-left hover:text-primary" title={`${it.name} — bearbeiten`}>{it.name}</button>
          {link
            ? <button onClick={() => oeffne(it.amazonLink)} title={`Bestelllink öffnen: ${kurzLink(it.amazonLink)}`} className="shrink-0 text-emerald-500 hover:text-emerald-400"><Link2 size={12} /></button>
            : <span title="Kein Bestelllink hinterlegt" className="shrink-0 text-muted-foreground/60"><Link2Off size={12} /></span>}
        </div>
        {it.notiz && <p className="text-[10px] text-muted-foreground truncate">{it.notiz}</p>}
      </div>
      <ZahlFeld art="ist" index={index} wert={it.current} leer={!it.gezaehltAm} onCommit={onIst}
        titel={it.gezaehltAm ? `Bestand — gezählt ${fmt(it.gezaehltAm)}${it.gezaehltVon ? ` von ${it.gezaehltVon}` : ''}` : 'Noch nicht gezählt — Bestand eintragen'} />
      <ZahlFeld art="soll" index={index} wert={it.target} onCommit={onSoll} titel="Soll-Bestand" />
      <div className="min-w-0 leading-tight">
        {badge}
        {unterwegs > 0 && <p className="text-[10px] text-blue-500 inline-flex items-center gap-1"><Truck size={10} />{unterwegs} bestellt, unterwegs</p>}
      </div>
      <div className="flex items-center justify-end gap-0.5">
        {loeschFrage ? (
          <span className="inline-flex items-center gap-0.5">
            <button onClick={onLoeschen} className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 text-[10px]">Löschen</button>
            <button onClick={() => onLoeschFrage(false)} className="p-0.5 rounded text-muted-foreground hover:bg-accent"><X size={12} /></button>
          </span>
        ) : (<>
          <button onClick={onEdit} title="Bearbeiten" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"><Edit3 size={13} /></button>
          <button onClick={() => onLoeschFrage(true)} title="Löschen" className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><Trash2 size={13} /></button>
        </>)}
      </div>
    </div>
  )
}

// ── Artikel anlegen / bearbeiten ─────────────────────────────────────────────
interface EditorDaten { id?: string; name: string; kategorie: string; current: string; target: string; amazonLink: string; notiz: string; gezaehlt?: string }

function ArtikelDialog({ daten, onClose, onSpeichern }: { daten: EditorDaten; onClose: () => void; onSpeichern: (d: EditorDaten) => Promise<string | null> }) {
  const [d, setD] = useState(daten)
  const [kategorieGewaehlt, setKategorieGewaehlt] = useState(!!daten.id)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')
  const set = (p: Partial<EditorDaten>) => { setD(x => ({ ...x, ...p })); setFehler('') }
  const inp = 'w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50'
  async function speichern() {
    if (!d.name.trim() || busy) return
    setBusy(true)
    const f = await onSpeichern(d)
    setBusy(false)
    if (f) setFehler(f)
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          {d.id ? <Edit3 size={18} className="text-primary" /> : <Plus size={18} className="text-primary" />}
          <h3 className="text-base font-semibold text-foreground">{d.id ? 'Artikel bearbeiten' : 'Neuer Artikel'}</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground font-medium block mb-1">Name</label>
            <input autoFocus value={d.name} placeholder="z. B. HDMI-Kabel 5 m" className={inp}
              onChange={e => set({ name: e.target.value, ...(kategorieGewaehlt ? {} : { kategorie: rateKategorie(e.target.value) }) })}
              onKeyDown={e => { if (e.key === 'Enter') void speichern() }} />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground font-medium block mb-1">Kategorie</label>
            <select value={d.kategorie} onChange={e => { set({ kategorie: e.target.value }); setKategorieGewaehlt(true) }} className={inp}>
              {KATEGORIEN.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground font-medium block mb-1">Bestand (Ist)</label>
              <input value={d.current} onChange={e => set({ current: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" placeholder="leer = noch nicht gezählt" className={inp} />
              {d.gezaehlt && <p className="text-[10px] text-muted-foreground mt-0.5">zuletzt gezählt {d.gezaehlt}</p>}
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-medium block mb-1">Soll</label>
              <input value={d.target} onChange={e => set({ target: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" className={inp} />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground font-medium block mb-1">Bestelllink (Amazon, optional)</label>
            <div className="flex items-center gap-2">
              <input value={d.amazonLink} onChange={e => set({ amazonLink: e.target.value })} placeholder="https://www.amazon.de/…" className={inp} />
              <button onClick={() => { try { void api().openExternal(linkHref(d.amazonLink) || amazonSuche(d.name || 'IT Zubehör')) } catch { /* ignore */ } }} disabled={!d.name.trim() && !d.amazonLink.trim()}
                title={linkHref(d.amazonLink) ? 'Link öffnen' : `Bei Amazon nach „${d.name}" suchen — Link dann hier einfügen`}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 disabled:opacity-40">
                {linkHref(d.amazonLink) ? <><ExternalLink size={13} />Öffnen</> : <><Search size={13} />Suchen</>}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground font-medium block mb-1">Notiz (optional)</label>
            <input value={d.notiz} onChange={e => set({ notiz: e.target.value })} placeholder="z. B. Modell, Lagerort, für wen" className={inp} />
          </div>
          {fehler && <p className="text-xs text-red-500 flex items-start gap-1"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{fehler}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-2 rounded-md text-sm text-muted-foreground border border-border hover:bg-accent">Abbrechen</button>
          <button onClick={() => void speichern()} disabled={!d.name.trim() || busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Speichern
          </button>
        </div>
      </div>
    </div>
  )
}
