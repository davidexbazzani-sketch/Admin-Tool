import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, Truck, RefreshCw, Plus, Loader2, Search, AlertTriangle, CheckCircle2, X, Check, Upload,
  FileText, Image as ImageIcon, FileSpreadsheet, Trash2, Pencil, ChevronDown, ChevronRight, ScanBarcode, HelpCircle,
} from 'lucide-react'
import { api } from '../../electronAPI'
import { DeviceInfoButton } from '../device/DeviceDossier'
import {
  ladePickups, speicherePickup, speichereBeleg, oeffneBeleg, neueId, ladeGeraeteIndex, alsPickupGeraet,
  ladeStatus, pruefeStatus, istErledigt, offeneGeraete,
  type Pickup, type PickupGeraet, type GeraeteStatus, type GeraeteIndex,
} from '../../services/pickups'
import { erkenneBeleg, BELEG_ENDUNGEN, type Kandidat } from '../../services/pickupErkennung'

interface Props { currentUser: string; onBack: () => void }

const fmtTag = (iso: string) => { const [j, m, t] = (iso || '').split('-'); return j ? `${t}.${m}.${j}` : '' }
const fmtZeit = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
const heuteIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function StateBadge({ st }: { st?: GeraeteStatus }) {
  if (!st?.state) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300" title="Gerät weder in ServiceNow noch in der Endgeräte-Übersicht gefunden"><HelpCircle size={10} />unbekannt</span>
  const ok = istErledigt(st.state)
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}
      title={`${st.state}${st.substate ? ' / ' + st.substate : ''} · Quelle: ${st.quelle === 'servicenow' ? 'ServiceNow' : 'Endgeräte-Übersicht'} · ${fmtZeit(st.am)}`}>
      {ok ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}{st.state}{st.substate ? ` · ${st.substate}` : ''}
    </span>
  )
}

function ErkanntBadge({ g }: { g: PickupGeraet & { herkunft?: string; ausgewaehlt?: boolean } }) {
  const t = g.erkannt === 'endgeraete' ? ['in Endgeräte-Übersicht', 'bg-emerald-500/10 text-emerald-300']
    : g.erkannt === 'korrigiert' && g.ausgewaehlt === false ? [`unsicher — bitte prüfen${g.roh ? ` (gelesen: ${g.roh})` : ''}`, 'bg-amber-500/10 text-amber-300']
    : g.erkannt === 'korrigiert' ? [`korrigiert${g.roh ? ` (gelesen: ${g.roh})` : ''}`, 'bg-blue-500/10 text-blue-300']
    : g.erkannt === 'manuell' ? ['von Hand', 'bg-accent text-muted-foreground']
    : ['nicht in Endgeräte-Übersicht', 'bg-amber-500/10 text-amber-300']
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${t[1]}`}>
      {g.herkunft === 'barcode' && <ScanBarcode size={10} />}{t[0]}
    </span>
  )
}

export default function PickupsView({ currentUser, onBack }: Props) {
  const [pickups, setPickups] = useState<Pickup[]>([])
  const [status, setStatus] = useState<Record<string, GeraeteStatus>>({})
  const [statusInfo, setStatusInfo] = useState<{ quelle?: string; hinweis?: string; am?: string }>({})
  const [laden, setLaden] = useState(true)
  const [prueft, setPrueft] = useState(false)
  const [fehler, setFehler] = useState('')
  const [suche, setSuche] = useState('')
  const [nurOffen, setNurOffen] = useState(false)
  const [offenIds, setOffenIds] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<Pickup | 'neu' | null>(null)
  const geprueft = useRef(false)

  const pruefe = useCallback(async (liste: Pickup[], cache: Record<string, GeraeteStatus>, alle = false) => {
    // Nur Geräte, die noch nicht erledigt sind (in transit/ausgemustert ändert sich nicht zurück)
    const serials = liste.flatMap(p => p.geraete.map(g => g.serial)).filter(s => alle || !istErledigt(cache[s]?.state))
    if (!serials.length) return
    setPrueft(true)
    try {
      const r = await pruefeStatus(serials)
      setStatus(r.status); setStatusInfo({ quelle: r.quelle, hinweis: r.hinweis, am: new Date().toISOString() })
    } catch { /* Anzeige mit altem Stand */ } finally { setPrueft(false) }
  }, [])

  const neuLaden = useCallback(async (mitPruefung: boolean) => {
    setLaden(true)
    try {
      const [p, st] = await Promise.all([ladePickups(), ladeStatus()])
      setPickups(p); setStatus(st.status); setStatusInfo({ quelle: st.quelle, hinweis: st.hinweis, am: st.geprueftAm }); setFehler('')
      if (mitPruefung) void pruefe(p, st.status)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Abholungen konnten nicht geladen werden.')
    } finally { setLaden(false) }
  }, [pruefe])

  useEffect(() => { if (!geprueft.current) { geprueft.current = true; void neuLaden(true) } }, [neuLaden])

  const gefiltert = useMemo(() => {
    const q = suche.trim().toUpperCase()
    return pickups.filter(p => {
      if (nurOffen && offeneGeraete(p, status).offen === 0) return false
      if (!q) return true
      return p.lieferant.toUpperCase().includes(q) || p.notiz.toUpperCase().includes(q) || fmtTag(p.datum).includes(q)
        || p.geraete.some(g => g.serial.includes(q) || g.hostname.includes(q) || (g.zugewiesen || '').toUpperCase().includes(q) || (g.modell || '').toUpperCase().includes(q))
    })
  }, [pickups, suche, nurOffen, status])

  const summe = useMemo(() => {
    let geraete = 0, offen = 0, abholungenOffen = 0
    for (const p of pickups) { const o = offeneGeraete(p, status); geraete += p.geraete.length; offen += o.offen; if (o.offen) abholungenOffen++ }
    return { geraete, offen, abholungenOffen }
  }, [pickups, status])

  if (editor) {
    return (
      <PickupEditor
        vorlage={editor === 'neu' ? null : editor}
        alle={pickups}
        currentUser={currentUser}
        onAbbruch={() => setEditor(null)}
        onGespeichert={async (p) => {
          setEditor(null)
          await neuLaden(false)
          void pruefe([p], {}, true)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="p-1 rounded text-muted-foreground hover:bg-accent/40"><ChevronLeft size={16} /></button>
        <Truck className="text-sky-400" size={20} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Pick-Ups</h1>
          <p className="text-[11px] text-muted-foreground">
            {pickups.length} Abholungen · {summe.geraete} Geräte
            {summe.offen > 0 && <span className="text-red-300"> · {summe.offen} Geräte noch nicht „In transit" ({summe.abholungenOffen} Abholungen)</span>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void pruefe(pickups, status, true)} disabled={prueft || !pickups.length}
            title="State aller abgeholten Geräte jetzt prüfen (ServiceNow live, sonst Endgeräte-Übersicht)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-50">
            {prueft ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}State prüfen
          </button>
          <button onClick={() => setEditor('neu')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
            <Plus size={14} />Abholung erfassen
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-2 border-b border-border shrink-0 text-[11px]">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Seriennummer, Hostname, Lieferant, Datum …" className="w-72 pl-6 pr-2 py-1 rounded-md bg-card border border-border text-xs" />
        </div>
        <label className="flex items-center gap-1.5 text-red-300 cursor-pointer">
          <input type="checkbox" className="accent-red-500" checked={nurOffen} onChange={e => setNurOffen(e.target.checked)} />nur Abholungen mit Geräten ohne „In transit"
        </label>
        <span className="ml-auto text-muted-foreground">
          {prueft ? 'State wird geprüft …' : statusInfo.am ? `State-Stand ${fmtZeit(statusInfo.am)} · ${statusInfo.quelle || ''}` : ''}
          {statusInfo.hinweis && <span className="text-amber-300"> · {statusInfo.hinweis}</span>}
        </span>
      </div>

      {fehler && <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs"><AlertTriangle size={14} />{fehler}</div>}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {laden && !pickups.length && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />Lade Abholungen …</p>}
        {!laden && !pickups.length && !fehler && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Truck size={44} className="opacity-30" />
            <p className="text-sm">Noch keine Abholungen erfasst.</p>
            <p className="text-xs opacity-70 max-w-md text-center">Foto, PDF oder Excel des Abholscheins hochladen — das Tool erkennt die Seriennummern bzw. Hostnamen und legt die Abholung dauerhaft ab.</p>
          </div>
        )}
        {gefiltert.map(p => {
          const o = offeneGeraete(p, status)
          const auf = offenIds.has(p.id) || (!!suche.trim() && gefiltert.length <= 3)
          const toggle = () => setOffenIds(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })
          return (
            <div key={p.id} className={`rounded-lg border-l-4 ${o.offen ? 'border-l-red-500 bg-red-500/[0.04]' : o.unbekannt ? 'border-l-amber-500' : 'border-l-emerald-500'} border-y border-r border-border bg-card`}>
              <button onClick={toggle} className="w-full text-left px-3 py-2.5 hover:bg-accent/20 flex items-start gap-3">
                <span className="mt-0.5 text-muted-foreground">{auf ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{fmtTag(p.datum)} · {p.lieferant}</h3>
                    <span className="text-[11px] text-muted-foreground">{p.geraete.length} Geräte</span>
                    {o.offen > 0
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-500 text-white">{o.offen} nicht „In transit"</span>
                      : o.unbekannt > 0
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-200">{o.unbekannt} State unbekannt</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">alle „In transit"</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {p.notiz && <span className="text-foreground/80">{p.notiz} · </span>}
                    erfasst {fmtZeit(p.angelegtAm)} von {p.angelegtVon}{p.geaendert?.length ? ` · ${p.geaendert.length}× geändert` : ''}
                  </p>
                </div>
              </button>
              {auf && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(p.belege || []).map(b => (
                      <button key={b.pfad} onClick={async () => { const f = await oeffneBeleg(b.pfad); if (f) setFehler(f) }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-foreground hover:bg-accent/40">
                        <BelegIcon name={b.name} />{b.name}
                      </button>
                    ))}
                    <button onClick={() => setEditor(p)} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/40"><Pencil size={11} />Bearbeiten</button>
                  </div>
                  <GeraeteTabelle geraete={p.geraete} status={status} markiere={suche.trim().toUpperCase()} />
                  {p.geaendert?.length ? (
                    <p className="text-[10px] text-muted-foreground">Änderungen: {p.geaendert.map(a => `${fmtZeit(a.am)} ${a.von} (${a.was})`).join(' · ')}</p>
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BelegIcon({ name }: { name: string }) {
  const e = (name.split('.').pop() || '').toLowerCase()
  if (e === 'pdf') return <FileText size={12} className="text-red-300" />
  if (['xlsx', 'xls', 'csv'].includes(e)) return <FileSpreadsheet size={12} className="text-emerald-300" />
  return <ImageIcon size={12} className="text-sky-300" />
}

function GeraeteTabelle({ geraete, status, markiere }: { geraete: PickupGeraet[]; status: Record<string, GeraeteStatus>; markiere: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-[11px]">
        <thead><tr className="bg-accent/30 text-muted-foreground text-left">
          <th className="px-2 py-1.5 font-medium">Seriennummer</th><th className="px-2 py-1.5 font-medium">Hostname</th>
          <th className="px-2 py-1.5 font-medium">Modell</th><th className="px-2 py-1.5 font-medium">Zugewiesen an</th>
          <th className="px-2 py-1.5 font-medium">State</th><th className="px-2 py-1.5 font-medium">Erfasst über</th>
        </tr></thead>
        <tbody>
          {geraete.map(g => {
            const st = status[g.serial]
            const rot = !!st?.state && !istErledigt(st.state)
            const treffer = !!markiere && (g.serial.includes(markiere) || g.hostname.includes(markiere))
            return (
              <tr key={g.serial} className={`border-t border-border ${rot ? 'bg-red-500/10' : ''} ${treffer ? 'outline outline-1 outline-primary/60' : ''}`}>
                <td className="px-2 py-1 font-mono text-foreground"><span className="inline-flex items-center gap-1">{g.serial}<DeviceInfoButton hostname={g.hostname || `DE${g.serial}`} serial={g.serial} /></span></td>
                <td className="px-2 py-1 font-mono text-muted-foreground">{g.hostname || '—'}</td>
                <td className="px-2 py-1 text-muted-foreground">{g.modell || '—'}</td>
                <td className="px-2 py-1 text-muted-foreground">{g.zugewiesen || '—'}</td>
                <td className="px-2 py-1"><StateBadge st={st} /></td>
                <td className="px-2 py-1"><ErkanntBadge g={g} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Erfassen / Bearbeiten ─────────────────────────────────────────────────────

interface NeuerBeleg { name: string; base64: string; vorschau?: string }

function PickupEditor({ vorlage, alle, currentUser, onAbbruch, onGespeichert }: {
  vorlage: Pickup | null; alle: Pickup[]; currentUser: string; onAbbruch: () => void; onGespeichert: (p: Pickup) => void
}) {
  const [idx, setIdx] = useState<GeraeteIndex | null>(null)
  const [zeilen, setZeilen] = useState<Kandidat[]>(() => (vorlage?.geraete || []).map(g => ({ ...g, ausgewaehlt: true, herkunft: 'text' as const })))
  const [datum, setDatum] = useState(vorlage?.datum || '')
  const [datumErkannt, setDatumErkannt] = useState<'' | 'beleg' | 'foto'>('')
  const [lieferant, setLieferant] = useState(vorlage?.lieferant || '')
  const [notiz, setNotiz] = useState(vorlage?.notiz || '')
  const [belege, setBelege] = useState<NeuerBeleg[]>([])
  const [laeuft, setLaeuft] = useState('')
  const [anteil, setAnteil] = useState<number | undefined>()
  const [fehler, setFehler] = useState('')
  const [hinweise, setHinweise] = useState<string[]>([])
  const [eingabe, setEingabe] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [textAuf, setTextAuf] = useState(false)
  const [erkannterText, setErkannterText] = useState('')

  useEffect(() => { void ladeGeraeteIndex().then(setIdx).catch(() => setIdx({ geraete: [], perSerial: new Map(), perHost: new Map() })) }, [])
  useEffect(() => () => { belege.forEach(b => b.vorschau && URL.revokeObjectURL(b.vorschau)) }, [belege])

  const lieferanten = useMemo(() => [...new Set(alle.map(p => p.lieferant).filter(Boolean))].sort(), [alle])
  // Seriennummer schon in einer früheren Abholung?
  const frueher = useMemo(() => {
    const m = new Map<string, Pickup>()
    for (const p of alle) if (p.id !== vorlage?.id) for (const g of p.geraete) m.set(g.serial, p)
    return m
  }, [alle, vorlage?.id])

  const uebernehme = (neu: Kandidat[]) => setZeilen(alt => {
    const m = new Map(alt.map(z => [z.serial, z]))
    for (const k of neu) if (!m.has(k.serial)) m.set(k.serial, k)
    return [...m.values()]
  })

  async function belegHochladen() {
    setFehler('')
    const pfad = await api().openFileDialog([{ name: 'Beleg (Foto, PDF, Excel)', extensions: BELEG_ENDUNGEN }])
    if (!pfad || !idx) return
    const name = pfad.split(/[\\/]/).pop() || 'beleg'
    const r = await api().readFile(pfad)
    if (!r.success || !r.data) { setFehler(r.error || 'Datei konnte nicht gelesen werden.'); return }
    const bin = atob(r.data), bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const ext = (name.split('.').pop() || '').toLowerCase()
    const vorschau = ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'gif'].includes(ext) ? URL.createObjectURL(new Blob([bytes], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` })) : undefined
    setBelege(b => [...b, { name, base64: r.data!, vorschau }])
    setLaeuft('Beleg wird erkannt …'); setAnteil(undefined)
    try {
      const e = await erkenneBeleg(name, bytes, idx, (t, a) => { setLaeuft(t); setAnteil(a) })
      uebernehme(e.kandidaten)
      if (e.datum && !datum) { setDatum(e.datum); setDatumErkannt(e.datumQuelle) }
      if (!lieferant) { const l = lieferanten.find(x => e.text.toUpperCase().includes(x.toUpperCase())); if (l) setLieferant(l) }
      setErkannterText(t => (t ? t + '\n\n' : '') + `── ${name} ──\n` + (e.barcodes.length ? `Barcodes: ${e.barcodes.join(' · ')}\n` : '') + e.text)
      const sicher = e.kandidaten.filter(k => k.ausgewaehlt).length
      setHinweise(h => [...h, `${name}: ${sicher} Geräte erkannt${e.kandidaten.length > sicher ? `, ${e.kandidaten.length - sicher} weitere mögliche (nicht angehakt — bitte prüfen)` : ''}${e.barcodes.length ? ` · ${e.barcodes.length} Barcodes gelesen` : ''}${e.hinweis ? ` · ${e.hinweis}` : ''}`])
    } catch (err) {
      setFehler(`Erkennung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)} — der Beleg wird trotzdem gespeichert, Geräte bitte von Hand eintragen.`)
    } finally { setLaeuft(''); setAnteil(undefined) }
  }

  function vonHand() {
    if (!idx) return
    const teile = eingabe.toUpperCase().split(/[\s,;]+/).map(s => s.replace(/[^A-Z0-9]/g, '')).filter(s => s.length >= 5)
    if (!teile.length) return
    uebernehme(teile.map(t => ({ ...alsPickupGeraet(t, idx, 'manuell'), ausgewaehlt: true, herkunft: 'text' as const })))
    setZeilen(z => z.map(x => teile.some(t => t === x.serial || t === x.hostname) ? { ...x, ausgewaehlt: true } : x))
    setEingabe('')
  }

  function aendereSerial(alt: string, neu: string) {
    if (!idx) return
    const g = alsPickupGeraet(neu, idx, 'manuell')
    setZeilen(z => z.map(x => x.serial === alt ? { ...g, erkannt: g.erkannt === 'unbekannt' ? 'manuell' : g.erkannt, ausgewaehlt: true, herkunft: x.herkunft } : x))
  }

  const gewaehlt = zeilen.filter(z => z.ausgewaehlt)
  const hatBeleg = belege.length > 0 || (vorlage?.belege?.length || 0) > 0
  const fehlt = [
    !hatBeleg && 'Beleg (Foto/PDF/Excel)',
    !datum && 'Datum',
    !lieferant.trim() && 'Lieferant',
    !gewaehlt.length && 'mindestens ein Gerät',
  ].filter(Boolean) as string[]

  async function speichern() {
    if (fehlt.length || speichert) return
    setSpeichert(true); setFehler('')
    const id = vorlage?.id || neueId()
    // Erst die Belege — ohne gespeicherten Nachweis wird die Abholung NICHT angelegt
    const neueBelege: { name: string; pfad: string }[] = []
    for (const b of belege) {
      const pfad = await speichereBeleg(id, b.name, b.base64)
      if (!pfad) { setFehler(`Beleg „${b.name}" konnte nicht auf dem Netzlaufwerk gespeichert werden — Abholung wurde nicht angelegt.`); setSpeichert(false); return }
      neueBelege.push({ name: b.name, pfad })
    }
    const p: Pickup = {
      id, datum, lieferant: lieferant.trim(), notiz: notiz.trim(),
      geraete: gewaehlt.map(({ ausgewaehlt: _a, herkunft: _h, ...g }) => g),
      belege: [...(vorlage?.belege || []), ...neueBelege],
      angelegtAm: vorlage?.angelegtAm || new Date().toISOString(), angelegtVon: vorlage?.angelegtVon || currentUser,
    }
    const r = await speicherePickup(p, currentUser, vorlage ? `${p.geraete.length} Geräte${neueBelege.length ? `, +${neueBelege.length} Beleg` : ''}` : '')
    setSpeichert(false)
    if (!r.ok) { setFehler(r.error || 'Speichern fehlgeschlagen.'); return }
    onGespeichert(p)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <button onClick={onAbbruch} className="p-1 rounded text-muted-foreground hover:bg-accent/40"><ChevronLeft size={16} /></button>
        <Truck className="text-sky-400" size={20} />
        <h1 className="text-base font-semibold text-foreground">{vorlage ? `Abholung vom ${fmtTag(vorlage.datum)} bearbeiten` : 'Abholung erfassen'}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Beleg */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-foreground">1. Beleg hochladen <span className="font-normal text-muted-foreground">— Foto, PDF oder Excel des Abholscheins (Pflicht, wird dauerhaft gespeichert)</span></p>
            <button onClick={() => void belegHochladen()} disabled={!!laeuft || !idx}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {laeuft || !idx ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}{belege.length || vorlage?.belege?.length ? 'Weiteren Beleg hinzufügen' : 'Beleg hochladen'}
            </button>
          </div>
          {laeuft && (
            <div className="space-y-1">
              <p className="text-[11px] text-blue-300">{laeuft}</p>
              <div className="h-1 rounded bg-accent overflow-hidden"><div className="h-full bg-blue-400 transition-all" style={{ width: `${Math.round((anteil ?? 0.05) * 100)}%` }} /></div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {(vorlage?.belege || []).map(b => (
              <button key={b.pfad} onClick={() => void oeffneBeleg(b.pfad)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-foreground hover:bg-accent/40"><BelegIcon name={b.name} />{b.name}</button>
            ))}
            {belege.map((b, i) => (
              <div key={i} className="relative rounded-md border border-border overflow-hidden">
                {b.vorschau ? <img src={b.vorschau} alt={b.name} className="h-28 max-w-[220px] object-contain bg-black/30" /> : <div className="h-28 w-40 flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"><BelegIcon name={b.name} />{b.name}</div>}
                <span className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 bg-black/60 text-[10px] text-white truncate">{b.name}</span>
                <button onClick={() => setBelege(x => x.filter((_, j) => j !== i))} className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white hover:bg-red-600" title="Beleg entfernen"><X size={11} /></button>
              </div>
            ))}
          </div>
          {hinweise.map((h, i) => <p key={i} className="text-[11px] text-emerald-300">{h}</p>)}
          {erkannterText && (
            <div>
              <button onClick={() => setTextAuf(x => !x)} className="text-[10px] text-muted-foreground hover:text-foreground underline">{textAuf ? 'Erkannten Text ausblenden' : 'Erkannten Text anzeigen (zur Kontrolle)'}</button>
              {textAuf && <pre className="mt-1 max-h-48 overflow-auto rounded border border-border bg-background p-2 text-[10px] text-muted-foreground whitespace-pre-wrap">{erkannterText}</pre>}
            </div>
          )}
        </div>

        {/* Geräte */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-foreground">2. Geräte prüfen <span className="font-normal text-muted-foreground">— {gewaehlt.length} von {zeilen.length} angehakt</span></p>
            <div className="ml-auto flex items-center gap-1.5">
              <input value={eingabe} onChange={e => setEingabe(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') vonHand() }}
                placeholder="Seriennummer oder Hostname (mehrere mit Leerzeichen)" className="w-80 px-2 py-1 rounded-md bg-background border border-border text-xs font-mono" />
              <button onClick={vonHand} disabled={!eingabe.trim() || !idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-border text-foreground hover:bg-accent/40 disabled:opacity-50"><Plus size={12} />Hinzufügen</button>
            </div>
          </div>
          {zeilen.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Noch keine Geräte — Beleg hochladen oder oben von Hand eintragen.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[11px]">
                <thead><tr className="bg-accent/30 text-muted-foreground text-left">
                  <th className="px-2 py-1.5 w-6"><input type="checkbox" className="accent-primary" checked={gewaehlt.length === zeilen.length} onChange={e => setZeilen(z => z.map(x => ({ ...x, ausgewaehlt: e.target.checked })))} /></th>
                  <th className="px-2 py-1.5 font-medium">Seriennummer</th><th className="px-2 py-1.5 font-medium">Hostname</th>
                  <th className="px-2 py-1.5 font-medium">Modell</th><th className="px-2 py-1.5 font-medium">Zugewiesen an</th>
                  <th className="px-2 py-1.5 font-medium">Erkennung</th><th className="px-2 py-1.5 w-6" />
                </tr></thead>
                <tbody>
                  {zeilen.map(z => {
                    const vor = frueher.get(z.serial)
                    return (
                      <tr key={z.serial} className={`border-t border-border ${z.ausgewaehlt ? '' : 'opacity-50'} ${z.erkannt === 'unbekannt' ? 'bg-amber-500/5' : ''}`}>
                        <td className="px-2 py-1"><input type="checkbox" className="accent-primary" checked={z.ausgewaehlt} onChange={e => setZeilen(x => x.map(y => y.serial === z.serial ? { ...y, ausgewaehlt: e.target.checked } : y))} /></td>
                        <td className="px-2 py-1">
                          <input defaultValue={z.serial} onBlur={e => { const v = e.target.value.trim().toUpperCase(); if (v && v !== z.serial) aendereSerial(z.serial, v) }}
                            className="w-36 px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[11px]" />
                          {vor && <span className="block text-[10px] text-amber-300">schon abgeholt am {fmtTag(vor.datum)} ({vor.lieferant})</span>}
                        </td>
                        <td className="px-2 py-1 font-mono text-muted-foreground"><span className="inline-flex items-center gap-1">{z.hostname || '—'}{z.hostname && <DeviceInfoButton hostname={z.hostname} serial={z.serial} />}</span></td>
                        <td className="px-2 py-1 text-muted-foreground">{z.modell || '—'}</td>
                        <td className="px-2 py-1 text-muted-foreground">{z.zugewiesen || '—'}</td>
                        <td className="px-2 py-1"><ErkanntBadge g={z} /></td>
                        <td className="px-2 py-1"><button onClick={() => setZeilen(x => x.filter(y => y.serial !== z.serial))} className="p-0.5 rounded text-muted-foreground hover:text-red-300" title="Zeile entfernen"><Trash2 size={11} /></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Angaben */}
        <div className="rounded-lg border border-border bg-card p-3 grid grid-cols-3 gap-3">
          <label className="text-[11px] text-muted-foreground space-y-1">
            <span className="block font-semibold text-foreground">3. Datum der Abholung</span>
            <input type="date" value={datum} max={heuteIso()} onChange={e => { setDatum(e.target.value); setDatumErkannt('') }} className="w-full px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground" />
            <span className={datum ? (datumErkannt ? 'text-emerald-300' : '') : 'text-amber-300'}>{datum ? (datumErkannt === 'beleg' ? 'aus dem Beleg erkannt — bitte prüfen' : datumErkannt === 'foto' ? 'Aufnahmedatum des Fotos — bitte prüfen' : '') : 'nicht erkannt — bitte eintragen'}</span>
            {!datum && <button onClick={() => setDatum(heuteIso())} className="ml-2 underline">heute</button>}
          </label>
          <label className="text-[11px] text-muted-foreground space-y-1">
            <span className="block font-semibold text-foreground">Lieferant</span>
            <input value={lieferant} onChange={e => setLieferant(e.target.value)} list="pickup-lieferanten" placeholder="z. B. Everphone, Bechtle …" className="w-full px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground" />
            <datalist id="pickup-lieferanten">{lieferanten.map(l => <option key={l} value={l} />)}</datalist>
          </label>
          <label className="text-[11px] text-muted-foreground space-y-1">
            <span className="block font-semibold text-foreground">Notiz (optional)</span>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} className="w-full px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground resize-y" />
          </label>
        </div>

        <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-sky-500/30 bg-sky-500/5 text-[11px] text-sky-200">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          Nach dem Eintragen alle Geräte in ServiceNow auf State <b className="mx-1">„In transit"</b> setzen. Das Tool prüft das und markiert Abholungen rot, solange es noch fehlt.
        </div>

        {fehler && <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs"><AlertTriangle size={14} />{fehler}</div>}
      </div>

      <div className="flex items-center gap-2 px-5 py-3 border-t border-border shrink-0">
        {fehlt.length > 0 && <span className="text-[11px] text-amber-300">Es fehlt: {fehlt.join(', ')}</span>}
        <button onClick={onAbbruch} disabled={speichert} className="ml-auto px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
        <button onClick={() => void speichern()} disabled={!!fehlt.length || speichert || !!laeuft}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {speichert ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}{vorlage ? 'Änderungen speichern' : `Abholung eintragen (${gewaehlt.length} Geräte)`}
        </button>
      </div>
    </div>
  )
}
