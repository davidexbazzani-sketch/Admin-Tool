// ── Standort → „Drucker Übersicht“: Drucker auf den Lageplänen ───────────────
// Grundlage: die Pläne von „Halle & Zoll“ und „Verwaltungsgebäude“ — OHNE deren
// Geräte-Einträge. Gleiches Prinzip wie dort: platzieren, ziehen, Liste → Aufleuchten,
// Details rechts. Zusätzlich: Drucker aus dem Bestand, die noch nicht eingezeichnet sind.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Printer, Search, RefreshCw, Loader2, X, Trash2, MapPin, Crosshair, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import { useMapIntentStore } from '../store/mapIntentStore'
import { PrinterInfoButton } from '../components/printer/PrinterDossier'
import PlanViewer from '../components/otDevices/PlanViewer'
import { ladeDruckerListe, type DruckerZiel } from '../services/druckerFlotte'
import {
  DRUCKER_PLAENE, ladeDrucker, legeDruckerAn, aendereDrucker, loescheDrucker, sucheDrucker, gleicherDrucker,
  type DruckerMarker, type DruckerPlanId,
} from '../services/druckerUebersicht'

export default function DruckerUebersicht() {
  const user = useAuthStore(s => s.session?.user)
  const ich = user?.displayName || user?.username || 'unbekannt'

  const [plan, setPlan] = useState<DruckerPlanId>('halle')
  const [pdfs, setPdfs] = useState<Partial<Record<DruckerPlanId, string>>>({})
  const [planFehler, setPlanFehler] = useState('')
  const [seiten, setSeiten] = useState<Partial<Record<DruckerPlanId, number>>>({})
  const [seite, setSeite] = useState<Record<DruckerPlanId, number>>({ halle: 0, verwaltung: 0 })
  const [marker, setMarker] = useState<DruckerMarker[]>([])
  const [bestand, setBestand] = useState<DruckerZiel[] | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState('')
  const [suche, setSuche] = useState('')
  const [platzieren, setPlatzieren] = useState(false)
  const [gewaehltId, setGewaehltId] = useState<string | null>(null)
  const [blinktId, setBlinktId] = useState<string | null>(null)
  const [offenFehlend, setOffenFehlend] = useState(true)
  const vorbelegt = useRef<DruckerZiel | null>(null)
  const planDef = DRUCKER_PLAENE.find(p => p.id === plan)!

  // Pläne (gebündelte Assets) laden — ohne die Geräte-Einträge der anderen Karten
  useEffect(() => {
    let weg = false
    for (const p of DRUCKER_PLAENE) {
      api().readAsset(p.asset)
        .then(r => { if (weg) return; if (r.success && r.data) setPdfs(x => ({ ...x, [p.id]: r.data! })); else setPlanFehler(r.error || `Lageplan „${p.titel}“ nicht gefunden.`) })
        .catch(e => { if (!weg) setPlanFehler(e instanceof Error ? e.message : String(e)) })
    }
    return () => { weg = true }
  }, [])

  const laden = useCallback(async () => {
    setLaedt(true)
    try { setMarker(await ladeDrucker()); setFehler('') }
    catch { setFehler('Liste konnte nicht geladen werden. Netzlaufwerk erreichbar?') }
    finally { setLaedt(false) }
  }, [])
  useEffect(() => { void laden() }, [laden])
  useEffect(() => { ladeDruckerListe().then(setBestand).catch(() => setBestand([])) }, [])
  useEffect(() => { const f = () => { void laden() }; window.addEventListener('focus', f); return () => window.removeEventListener('focus', f) }, [laden])

  // Sprung vom Standort-Knopf hinter dem Drucker-„i“: eingezeichnet → aufleuchten, sonst → einzeichnen
  const intent = useMapIntentStore(st => st.intent)
  const clearIntent = useMapIntentStore(st => st.clear)
  useEffect(() => {
    if (!intent || intent.screen !== 'drucker-uebersicht' || laedt) return
    const m = marker.find(x => gleicherDrucker(x.hostname, intent.hostname))
    if (m && intent.mode === 'focus') {
      setPlan(m.plan); setSeite(st => ({ ...st, [m.plan]: m.page - 1 })); setGewaehltId(null); setBlinktId(m.id); setSuche('')
      clearIntent()
      return
    }
    if (bestand === null) return   // Bestand noch nicht geladen → IP/Standort gleich mit vorbelegen
    vorbelegt.current = bestand.find(x => gleicherDrucker(x.name, intent.hostname)) || { name: intent.hostname, ip: '', community: 'public' }
    setGewaehltId(null); setBlinktId(null); setPlatzieren(true)
    clearIntent()
  }, [intent, marker, laedt, bestand, clearIntent])

  const imPlan = useMemo(() => marker.filter(m => m.plan === plan), [marker, plan])
  const gefiltert = useMemo(() => sucheDrucker(marker, suche), [marker, suche])
  const fehlend = useMemo(() => {
    const t = suche.trim().toLowerCase()
    return (bestand || []).filter(b => !marker.some(m => gleicherDrucker(m.hostname, b.name)))
      .filter(b => !t || [b.name, b.ip, b.standort || ''].some(x => x.toLowerCase().includes(t)))
  }, [bestand, marker, suche])
  const gewaehlt = useMemo(() => marker.find(m => m.id === gewaehltId) || null, [marker, gewaehltId])
  const zahl = (p: DruckerPlanId) => marker.filter(m => m.plan === p).length

  // Verschieben (optimistisch, entprellt speichern)
  const zug = useRef<number | null>(null)
  const zugWert = useRef<{ id: string; x: number; y: number } | null>(null)
  function verschiebe(id: string, x: number, y: number) {
    setMarker(prev => prev.map(m => (m.id === id ? { ...m, x, y } : m)))
    zugWert.current = { id, x, y }
    if (zug.current) window.clearTimeout(zug.current)
    zug.current = window.setTimeout(() => { const p = zugWert.current; if (p) void aendereDrucker(p.id, { x: p.x, y: p.y }, ich) }, 350)
  }

  async function setze(x: number, y: number) {
    const v = vorbelegt.current
    const m = await legeDruckerAn({ plan, page: seite[plan] + 1, x, y, name: v?.name, ip: v?.ip, raum: v?.standort, von: ich })
    vorbelegt.current = null
    setMarker(prev => [...prev, m])
    setGewaehltId(m.id); setBlinktId(v ? m.id : null)
    setPlatzieren(false)
  }
  function zeige(m: DruckerMarker) { setPlan(m.plan); setSeite(s => ({ ...s, [m.plan]: m.page - 1 })); setBlinktId(m.id); setGewaehltId(null) }
  function platziereAusBestand(b: DruckerZiel) { vorbelegt.current = b; setPlatzieren(true); setGewaehltId(null) }

  function lokal(id: string, patch: Partial<DruckerMarker>) { setMarker(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m))) }
  async function sichere(id: string, patch: Partial<Pick<DruckerMarker, 'hostname' | 'arbeitsplatz' | 'notes' | 'ip'>>) { if (!(await aendereDrucker(id, patch, ich))) setFehler('Speichern fehlgeschlagen — Netzlaufwerk erreichbar?') }
  async function entferne() {
    if (!gewaehlt) return
    const id = gewaehlt.id
    setGewaehltId(null); setBlinktId(null)
    setMarker(prev => prev.filter(m => m.id !== id))
    await loescheDrucker(id)
  }
  function nameGewaehlt(id: string, name: string) {
    const b = (bestand || []).find(x => gleicherDrucker(x.name, name))
    const patch: Partial<DruckerMarker> = { hostname: name.trim() }
    if (b) { patch.ip = b.ip || undefined; const m = marker.find(x => x.id === id); if (m && !m.arbeitsplatz.trim() && b.standort) patch.arbeitsplatz = b.standort }
    lokal(id, patch)
    void sichere(id, patch as Partial<Pick<DruckerMarker, 'hostname' | 'arbeitsplatz' | 'ip'>>)
  }

  const anzahlSeiten = seiten[plan] || 1
  return (
    <div className="flex flex-col h-full bg-background" data-drucker-uebersicht>
      {/* Kopf */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0 flex-wrap">
        <Printer className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Drucker Übersicht</h1>
          <p className="text-[11px] text-muted-foreground">{marker.length} Drucker eingezeichnet{bestand ? ` · ${fehlend.length} aus dem Bestand noch nicht` : ''}</p>
        </div>
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs ml-2" data-plan-umschalter>
          {DRUCKER_PLAENE.map(p => (
            <button key={p.id} onClick={() => { setPlan(p.id); setGewaehltId(null); setBlinktId(null) }}
              className={`px-3 py-1.5 ${plan === p.id ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>{p.titel} <span className="opacity-60">{zahl(p.id)}</span></button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void laden()} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border" title="Aktualisieren">
            <RefreshCw size={13} className={laedt ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { vorbelegt.current = null; setPlatzieren(p => !p) }} data-drucker-platzieren
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border ${platzieren ? 'bg-amber-400 text-black border-amber-500' : 'bg-primary text-primary-foreground border-transparent hover:opacity-90'}`}
            title="Einen Drucker auf dem Plan platzieren">
            {platzieren ? <Crosshair size={14} /> : <MapPin size={14} />}{platzieren ? `Platzieren aktiv${vorbelegt.current ? ` (${vorbelegt.current.name})` : ''} – Plan anklicken` : 'Drucker platzieren'}
          </button>
        </div>
      </div>

      {(fehler || planFehler) && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-xs shrink-0"><AlertTriangle size={14} />{planFehler || fehler}</div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Liste */}
        <aside className="w-72 shrink-0 border-r border-border flex flex-col">
          <div className="p-2.5 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Drucker, IP oder Raum suchen…"
                className="w-full pl-8 pr-2 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Eingezeichnet ({gefiltert.length})</p>
            {gefiltert.length === 0 && <p className="px-3 pb-3 text-xs text-muted-foreground">{marker.length === 0 ? 'Noch keine Drucker eingezeichnet. Unten einen Drucker aus dem Bestand wählen oder „Drucker platzieren“.' : 'Keine Treffer.'}</p>}
            {gefiltert.map(m => {
              const aktiv = m.id === blinktId || m.id === gewaehltId
              return (
                <div key={m.id} onClick={() => zeige(m)} onDoubleClick={() => { setBlinktId(null); setGewaehltId(m.id) }} data-drucker-zeile
                  title="Klick: im Plan zeigen · Doppelklick: Details"
                  className={`flex items-center gap-2 px-3 py-2 border-b border-border/50 cursor-pointer ${aktiv ? 'bg-primary/10' : 'hover:bg-accent/20'}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 self-start ${aktiv ? 'bg-green-400' : 'bg-blue-500'}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-foreground font-mono truncate">{m.hostname || <span className="italic text-muted-foreground">ohne Namen</span>}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{[DRUCKER_PLAENE.find(p => p.id === m.plan)?.titel, m.arbeitsplatz, m.ip].filter(Boolean).join(' · ')}</span>
                  </span>
                  {m.hostname && <PrinterInfoButton printerName={m.hostname} ohneStandort />}
                </div>
              )
            })}
            {bestand && (
              <>
                <button onClick={() => setOffenFehlend(o => !o)} className="w-full flex items-center gap-1 px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                  <ChevronDown size={12} className={offenFehlend ? '' : '-rotate-90'} />Noch nicht eingezeichnet ({fehlend.length})
                </button>
                {offenFehlend && fehlend.slice(0, 300).map(b => (
                  <div key={b.name} onClick={() => platziereAusBestand(b)} data-drucker-fehlend title="Klicken, dann auf den Plan tippen"
                    className={`flex items-center gap-2 px-3 py-1.5 border-b border-border/40 cursor-pointer hover:bg-accent/20 ${platzieren && vorbelegt.current?.name === b.name ? 'bg-amber-400/15' : ''}`}>
                    <MapPin size={12} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-foreground font-mono truncate">{b.name}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">{[b.ip, b.standort].filter(Boolean).join(' · ') || '—'}</span>
                    </span>
                    <PrinterInfoButton printerName={b.name} ohneStandort />
                  </div>
                ))}
              </>
            )}
            {bestand === null && <p className="px-3 py-2 text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />Drucker-Bestand wird geladen …</p>}
          </div>
        </aside>

        {/* Plan */}
        <main className="flex-1 min-w-0 relative">
          <PlanViewer
            key={plan}
            pdfBase64={pdfs[plan] || null}
            pageIndex={seite[plan]}
            devices={imPlan}
            selectedId={gewaehltId}
            blinkingId={blinktId}
            placementMode={platzieren}
            onPlace={(x, y) => void setze(x, y)}
            onDeviceClick={id => { setBlinktId(null); setGewaehltId(id) }}
            onDeviceMove={verschiebe}
            onEmptyClick={() => setBlinktId(null)}
            onPageCountKnown={n => setSeiten(s => ({ ...s, [plan]: n }))}
            resetSignal={0}
            placeHint={vorbelegt.current ? `Klicke auf den Plan, wo „${vorbelegt.current.name}“ steht` : 'Klicke auf den Plan, um einen Drucker zu platzieren'}
          />
          {anzahlSeiten > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/90 border border-border rounded-full px-3 py-1 text-xs shadow">
              <button onClick={() => setSeite(s => ({ ...s, [plan]: Math.max(0, s[plan] - 1) }))} disabled={seite[plan] === 0} className="disabled:opacity-30"><ChevronLeft size={14} /></button>
              Seite {seite[plan] + 1} / {anzahlSeiten}
              <button onClick={() => setSeite(s => ({ ...s, [plan]: Math.min(anzahlSeiten - 1, s[plan] + 1) }))} disabled={seite[plan] >= anzahlSeiten - 1} className="disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          )}
        </main>

        {/* Details */}
        {gewaehlt && (
          <aside className="w-72 shrink-0 border-l border-border flex flex-col" data-drucker-detail>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="text-sm font-semibold text-foreground">Drucker-Details</span>
              <button onClick={() => setGewaehltId(null)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={15} /></button>
            </div>
            <div className="p-3 space-y-3 overflow-y-auto">
              <div>
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">Drucker (Warteschlange)</label>
                <div className="flex items-center gap-1">
                  <input autoFocus list="drucker-bestand" value={gewaehlt.hostname} data-drucker-name
                    onChange={e => { const v = e.target.value; lokal(gewaehlt.id, { hostname: v }); if ((bestand || []).some(b => gleicherDrucker(b.name, v))) nameGewaehlt(gewaehlt.id, v) }}
                    onBlur={() => nameGewaehlt(gewaehlt.id, gewaehlt.hostname)}
                    placeholder="z. B. PMD634"
                    className="flex-1 min-w-0 px-2.5 py-2 rounded-md bg-background border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  {gewaehlt.hostname.trim() && <PrinterInfoButton printerName={gewaehlt.hostname.trim()} ohneStandort />}
                </div>
                <datalist id="drucker-bestand">{(bestand || []).map(b => <option key={b.name} value={b.name}>{[b.ip, b.standort].filter(Boolean).join(' · ')}</option>)}</datalist>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">IP-Adresse</label>
                <input value={gewaehlt.ip || ''} onChange={e => lokal(gewaehlt.id, { ip: e.target.value })} onBlur={() => void sichere(gewaehlt.id, { ip: (gewaehlt.ip || '').trim() || undefined })}
                  placeholder="wird aus dem Bestand übernommen" className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground/60" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">{DRUCKER_PLAENE.find(p => p.id === gewaehlt.plan)?.raumLabel}</label>
                <input value={gewaehlt.arbeitsplatz} onChange={e => lokal(gewaehlt.id, { arbeitsplatz: e.target.value })} onBlur={() => void sichere(gewaehlt.id, { arbeitsplatz: gewaehlt.arbeitsplatz.trim() })}
                  placeholder={gewaehlt.plan === 'verwaltung' ? 'z. B. 2.14' : 'z. B. Halle 4, Prüffeld'} className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">Notiz</label>
                <textarea value={gewaehlt.notes} onChange={e => lokal(gewaehlt.id, { notes: e.target.value })} onBlur={() => void sichere(gewaehlt.id, { notes: gewaehlt.notes })} rows={4} placeholder="optional"
                  className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60" />
              </div>
              {gewaehlt.placedAt && <p className="text-[10px] text-muted-foreground border-t border-border pt-2">📍 Eingezeichnet von <span className="text-foreground">{gewaehlt.placedBy || '—'}</span> am {new Date(gewaehlt.placedAt).toLocaleDateString('de-DE')}</p>}
              <p className="text-[10px] text-muted-foreground">Zum Verschieben den Punkt auf dem Plan ziehen.</p>
              <button onClick={() => void entferne()} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-red-500/40 text-red-600 dark:text-red-300 hover:bg-red-500/10 text-sm"><Trash2 size={14} />Drucker entfernen</button>
            </div>
          </aside>
        )}
      </div>
      {laedt && !marker.length && <div className="absolute top-20 right-6 text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />lädt …</div>}
    </div>
  )
}
