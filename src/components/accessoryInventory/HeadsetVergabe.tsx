// ── Zubehör Inventur → Reiter „Headset Vergabe" ──────────────────────────────
// Wer hat wann ein Headset bekommen, von wem und warum. Quellen: Checkliste (neuer
// Mitarbeiter, Haken „Headset übergeben", erledigt), ServiceNow-Excel-Export, einmaliger
// Nachtrag erledigter Checklisten, von Hand. Löschen nur mit PIN. Bestand wird NICHT abgebucht.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Headphones, Plus, Upload, RefreshCw, Search, Trash2, Loader2, AlertTriangle, CheckCircle2, X, Info, Users, LineChart } from 'lucide-react'
import KopfFilter from '../KopfFilter'
import HeadsetChartDialog from './HeadsetChartDialog'
import { PersonInfoButton } from '../person/PersonDossier'
import { usePinSperre } from '../netzwerkgeraete/zugang'
import { openFileForImport } from '../../utils/fileImport'
import { foldName } from '../../utils/nameMatch'
import { formatGermanDate, listEmployees } from '../../services/employees'
import { listChecklists } from '../../services/checklists'
import {
  ladeHeadsets, importiereExport, fuegeManuellHinzu, loescheEintrag, nachtragEinmalig, anzahlJePerson, pruefeManuell,
  GRUENDE, grundText, brauchtBegruendung, heuteIso, QUELLE_TEXT,
  type HeadsetVergabe as Eintrag, type HeadsetGrund, type ManuellerEintrag,
} from '../../services/headsetVergabe'

type FilterId = 'name' | 'grund' | 'von' | 'quelle'
const LEER = new Set<string>()

export default function HeadsetVergabe({ von }: { von: string }) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [laedt, setLaedt] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')
  const [meldung, setMeldung] = useState('')
  const [suche, setSuche] = useState('')
  const [nurMehrfach, setNurMehrfach] = useState(false)
  const [aus, setAus] = useState<Partial<Record<FilterId, Set<string>>>>({})
  const [neu, setNeu] = useState(false)
  const [chart, setChart] = useState(false)
  const [loeschFrage, setLoeschFrage] = useState<Eintrag | null>(null)
  const { mitPin, pinDialog } = usePinSperre('Einträge der Headset-Vergabe löschen — nur mit PIN.')

  const laden = useCallback(async () => {
    setLaedt(true); setFehler('')
    try {
      const d = await ladeHeadsets()
      setEintraege(d.eintraege)
      // Einmalig: erledigte Checklisten neuer Mitarbeiter (Start ≤ 6 Monate) übernehmen
      if (!d.checklistenNachgetragen) {
        const [cls, emps] = await Promise.all([listChecklists(), listEmployees()])
        const r = await nachtragEinmalig(cls, emps, von)
        if (r) { setEintraege(r.datei.eintraege); if (r.neu) setMeldung(`${r.neu} Headset-Übergabe(n) aus erledigten Checklisten neuer Mitarbeiter nachgetragen.`) }
      }
    } catch (e) { setFehler(e instanceof Error ? e.message : String(e)) }
    finally { setLaedt(false) }
  }, [von])
  useEffect(() => { void laden() }, [laden])

  async function importieren() {
    setFehler(''); setMeldung('')
    const f = await openFileForImport()
    if (!f) return
    if (!['xlsx', 'xls'].includes(f.ext)) { setFehler('Bitte den Excel-Export der Headset-TASKs aus ServiceNow (.xlsx) wählen.'); return }
    setBusy(true)
    try {
      const r = await importiereExport(f.bytes, von)
      if (r.fehler) { setFehler(r.fehler); return }
      if (r.datei) setEintraege(r.datei.eintraege)
      const sk = r.uebersprungen.map(u => `${u.anzahl}× ${u.grund}`).join(', ')
      setMeldung(`Import: ${r.neu} neu übernommen, ${r.vorhanden} schon vorhanden${sk ? `, übersprungen: ${sk}` : ''}. Grund bei importierten Tickets: unbekannt.`)
    } catch (e) { setFehler(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  async function loeschen(e: Eintrag) {
    setLoeschFrage(null); setBusy(true)
    try { setEintraege((await loescheEintrag(e.id, von)).eintraege); setMeldung(`Eintrag „${e.name}“ vom ${formatGermanDate(e.datum)} gelöscht.`) }
    catch (x) { setFehler(x instanceof Error ? x.message : String(x)) }
    finally { setBusy(false) }
  }

  // ── Zählung je Person + Filter (Excel-Art: Zählwerte über alle ANDEREN Filter) ──
  const { key, anzahl } = useMemo(() => anzahlJePerson(eintraege), [eintraege])
  const mehrfachPersonen = useMemo(() => [...anzahl.values()].filter(n => n > 1).length, [anzahl])
  const defs: { id: FilterId; titel: string; wert: (e: Eintrag) => string; leerText?: string }[] = [
    { id: 'name', titel: 'Name', wert: e => e.name },
    { id: 'grund', titel: 'Grund', wert: e => grundText(e.grund) },
    { id: 'von', titel: 'Übergeben von', wert: e => e.uebergebenVon, leerText: '(unbekannt)' },
    { id: 'quelle', titel: 'Quelle', wert: e => QUELLE_TEXT[e.quelle] },
  ]
  const woerter = foldName(suche).split(/[\s,;]+/).filter(Boolean)
  const trifft = (e: Eintrag) => {
    if (nurMehrfach && (anzahl.get(key(e)) || 0) < 2) return false
    if (!woerter.length) return true
    const t = foldName([e.name, e.kennung, e.email, e.ticket, e.uebergebenVon, e.begruendung, e.sonstiges].join(' '))
    return woerter.every(w => t.includes(w))
  }
  const passt = (f: typeof defs[number], e: Eintrag) => !(aus[f.id]?.has(f.wert(e)))
  const { zeilen, werte } = useMemo(() => {
    const werte = { name: new Map(), grund: new Map(), von: new Map(), quelle: new Map() } as Record<FilterId, Map<string, number>>
    for (const f of defs) for (const e of eintraege) werte[f.id].set(f.wert(e), 0)
    for (const f of defs) for (const e of eintraege) {
      if (!trifft(e) || !defs.every(x => x.id === f.id || passt(x, e))) continue
      werte[f.id].set(f.wert(e), (werte[f.id].get(f.wert(e)) ?? 0) + 1)
    }
    const zeilen = eintraege.filter(e => trifft(e) && defs.every(f => passt(f, e)))
      .sort((a, b) => b.datum.localeCompare(a.datum) || a.name.localeCompare(b.name))
    return { zeilen, werte }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eintraege, suche, aus, nurMehrfach, key, anzahl])
  const personen = anzahl.size
  const filterAktiv = !!suche || nurMehrfach || Object.values(aus).some(s => s && s.size)

  return (
    <div className="flex flex-col h-full" data-headset-vergabe>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <Headphones className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Headset Vergabe</h1>
          <p className="text-[11px] text-muted-foreground">
            {eintraege.length} Headsets · {personen} Personen · <span className={mehrfachPersonen ? 'text-amber-500' : ''}>{mehrfachPersonen} mit mehr als 1 Headset</span> · nur Übersicht, der Bestand wird nicht abgebucht
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void laden()} title="Neu laden" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent border border-border">
            <RefreshCw size={13} className={laedt ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setChart(true)} disabled={!eintraege.length} data-headset-chart-knopf
            title="Verlauf je Monat/Quartal mit Trendlinie — gilt für die aktuelle Auswahl (Suche/Filter)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border text-foreground hover:bg-accent disabled:opacity-50">
            <LineChart size={14} />Chart anzeigen
          </button>
          <button onClick={() => void importieren()} disabled={busy} data-headset-import
            title="ServiceNow → Liste der Headset-TASKs als Excel exportieren (Spalten u. a. Number, State, Description, Closed by, Actual End date)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border text-foreground hover:bg-accent disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Excel-Export aus ServiceNow importieren
          </button>
          <button onClick={() => setNeu(true)} data-headset-neu
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90">
            <Plus size={14} />Eintrag hinzufügen
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 py-2.5 shrink-0 flex-wrap">
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Name, Kennung, Ticket … suchen"
            className="w-full pl-8 pr-2 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50" />
        </div>
        <button onClick={() => setNurMehrfach(v => !v)} data-headset-mehrfach
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border ${nurMehrfach ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-accent'}`}>
          <Users size={12} />Nur Personen mit mehr als 1 Headset <span className={nurMehrfach ? '' : 'text-amber-500'}>{mehrfachPersonen}</span>
        </button>
        {filterAktiv && <button onClick={() => { setSuche(''); setNurMehrfach(false); setAus({}) }} className="text-[11px] text-muted-foreground hover:text-foreground underline">Filter zurücksetzen</button>}
        <span className="ml-auto text-[11px] text-muted-foreground">{zeilen.length} von {eintraege.length} Einträgen</span>
      </div>

      {(fehler || meldung) && (
        <div className="px-5 space-y-1.5 shrink-0">
          {fehler && <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-xs"><AlertTriangle size={14} className="shrink-0 mt-0.5" /><span className="flex-1">{fehler}</span><button onClick={() => setFehler('')}><X size={12} /></button></div>}
          {meldung && <div className="flex items-start gap-2 px-3 py-2 rounded-md text-xs border bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} className="shrink-0 mt-0.5" /><span className="flex-1">{meldung}</span><button onClick={() => setMeldung('')}><X size={12} /></button></div>}
        </div>
      )}

      <div className="flex-1 overflow-auto px-5 pb-5 pt-2.5">
        {laedt && !eintraege.length ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Lade Headset-Liste…</div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-xs" data-headset-tabelle>
              <thead className="bg-muted/30 text-[11px] text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Übergabedatum</th>
                  <th className="px-3 py-2 font-semibold"><KopfFilter titel="Name" werte={werte.name} ausgeblendet={aus.name ?? LEER} onChange={n => setAus(a => ({ ...a, name: n }))} /></th>
                  <th className="px-3 py-2 font-semibold">Kennung</th>
                  <th className="px-3 py-2 font-semibold"><KopfFilter titel="Grund" werte={werte.grund} ausgeblendet={aus.grund ?? LEER} onChange={n => setAus(a => ({ ...a, grund: n }))} /></th>
                  <th className="px-3 py-2 font-semibold min-w-[200px]">Begründung (was wurde versucht?)</th>
                  <th className="px-3 py-2 font-semibold"><KopfFilter titel="Übergeben von" werte={werte.von} ausgeblendet={aus.von ?? LEER} leerText="(unbekannt)" onChange={n => setAus(a => ({ ...a, von: n }))} /></th>
                  <th className="px-3 py-2 font-semibold"><KopfFilter titel="Quelle" werte={werte.quelle} ausgeblendet={aus.quelle ?? LEER} onChange={n => setAus(a => ({ ...a, quelle: n }))} /></th>
                  <th className="px-3 py-2 font-semibold">Sonstiges</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {zeilen.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{eintraege.length ? 'Kein Eintrag passt zu Suche/Filter.' : 'Noch keine Headset-Übergaben erfasst — Excel-Export importieren oder Eintrag hinzufügen.'}</td></tr>}
                {zeilen.map(e => {
                  const n = anzahl.get(key(e)) || 1
                  return (
                    <tr key={e.id} className="border-t border-border/50 hover:bg-accent/20 align-top" data-headset-zeile={e.id}>
                      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-foreground">{formatGermanDate(e.datum)}</td>
                      <td className="px-3 py-1.5 text-foreground">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">{e.name}<PersonInfoButton name={e.name} sam={e.kennung} />
                          {n > 1 && <button onClick={() => { setSuche(e.kennung || e.name); setNurMehrfach(false) }} title="Alle Headsets dieser Person zeigen"
                            className="px-1.5 rounded-full border border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px] font-semibold" data-mehrfach>{n}×</button>}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{e.kennung || '—'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{e.grund ? <span className="text-foreground">{grundText(e.grund)}</span> : <span className="text-muted-foreground italic">unbekannt</span>}</td>
                      <td className="px-3 py-1.5 text-foreground whitespace-pre-wrap">{e.begruendung || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-foreground">{e.uebergebenVon || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{QUELLE_TEXT[e.quelle]}{e.ticket ? <span className="font-mono"> · {e.ticket}</span> : null}</td>
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-pre-wrap">{e.sonstiges || ''}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button onClick={() => mitPin(() => setLoeschFrage(e))} disabled={busy} title="Eintrag löschen (PIN)" data-headset-loeschen
                          className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-40"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loeschFrage && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setLoeschFrage(null)}>
          <div className="bg-card border border-red-500/40 rounded-xl p-5 max-w-md w-full space-y-3" onClick={e => e.stopPropagation()} data-headset-loeschfrage>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Trash2 size={15} className="text-red-500" />Eintrag löschen?</h3>
            <p className="text-sm text-muted-foreground">Headset-Übergabe an <b className="text-foreground">{loeschFrage.name}</b> vom <b className="text-foreground">{formatGermanDate(loeschFrage.datum)}</b> ({grundText(loeschFrage.grund)}) wirklich löschen?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setLoeschFrage(null)} className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent/30">Abbrechen</button>
              <button onClick={() => void loeschen(loeschFrage)} className="px-3 py-1.5 text-sm rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold">Ja, löschen</button>
            </div>
          </div>
        </div>
      )}
      {neu && <NeuDialog von={von} onClose={() => setNeu(false)} onGespeichert={(liste, name) => { setEintraege(liste); setNeu(false); setMeldung(`Headset-Übergabe an „${name}“ erfasst.`) }} />}
      {chart && <HeadsetChartDialog eintraege={zeilen} gesamt={eintraege.length} gefiltert={filterAktiv} onClose={() => setChart(false)} />}
      {pinDialog}
    </div>
  )
}

function NeuDialog({ von, onClose, onGespeichert }: { von: string; onClose: () => void; onGespeichert: (liste: Eintrag[], name: string) => void }) {
  const [x, setX] = useState<ManuellerEintrag>({ name: '', kennung: '', datum: heuteIso(), uebergebenVon: von, grund: undefined, begruendung: '', sonstiges: '' })
  const [versucht, setVersucht] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')
  const fehlt = pruefeManuell(x)
  const set = (p: Partial<ManuellerEintrag>) => setX(v => ({ ...v, ...p }))
  const rot = (feld: string) => versucht && fehlt.some(f => f.startsWith(feld)) ? 'border-red-500' : 'border-border'
  const feldCls = 'w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-md bg-background border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary'

  async function speichern() {
    setVersucht(true)
    if (fehlt.length) return
    setBusy(true); setFehler('')
    try { const d = await fuegeManuellHinzu(x, von); onGespeichert(d.eintraege, x.name.trim()) }
    catch (e) { setFehler(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()} data-headset-dialog>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Headphones size={16} className="text-primary" />Headset-Übergabe erfassen</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[11px] text-muted-foreground col-span-2 sm:col-span-1">Name *
            <input value={x.name} onChange={e => set({ name: e.target.value })} placeholder="Vorname Nachname" autoFocus className={`${feldCls} ${rot('Name')}`} data-feld="name" />
          </label>
          <label className="block text-[11px] text-muted-foreground col-span-2 sm:col-span-1">Kennung (Corp-ID)
            <input value={x.kennung} onChange={e => set({ kennung: e.target.value })} placeholder="z. B. AB1234" className={`${feldCls} border-border font-mono`} />
          </label>
          <label className="block text-[11px] text-muted-foreground">Übergabedatum *
            <input type="date" value={x.datum} onChange={e => set({ datum: e.target.value })} className={`${feldCls} ${rot('Übergabedatum')}`} data-feld="datum" />
          </label>
          <label className="block text-[11px] text-muted-foreground">Übergeben von
            <input value={x.uebergebenVon} onChange={e => set({ uebergebenVon: e.target.value })} className={`${feldCls} border-border`} />
          </label>
          <label className="block text-[11px] text-muted-foreground col-span-2">Grund *
            <select value={x.grund || ''} onChange={e => set({ grund: (e.target.value || undefined) as HeadsetGrund | undefined })} className={`${feldCls} ${rot('Grund')}`} data-feld="grund">
              <option value="">— bitte wählen —</option>
              {GRUENDE.map(g => <option key={g.id} value={g.id}>{g.text}</option>)}
            </select>
          </label>
          {brauchtBegruendung(x.grund) && (
            <label className="block text-[11px] text-muted-foreground col-span-2">Begründung — was wurde gemacht, um den Austausch zu vermeiden? *
              <textarea value={x.begruendung} onChange={e => set({ begruendung: e.target.value })} rows={3}
                placeholder="z. B. Headset war kaputt (Mikrofon ohne Funktion), Treiber/Jabra Direct neu installiert, Sound-Dienst zurückgesetzt, anderer USB-Port getestet"
                className={`${feldCls} ${rot('Begründung')}`} data-feld="begruendung" />
            </label>
          )}
          <label className="block text-[11px] text-muted-foreground col-span-2">Sonstiges
            <input value={x.sonstiges} onChange={e => set({ sonstiges: e.target.value })} placeholder="z. B. kein Jabra-Headset, sondern …" className={`${feldCls} border-border`} data-feld="sonstiges" />
          </label>
        </div>
        {versucht && fehlt.length > 0 && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />Bitte ausfüllen: {fehlt.join(', ')}</p>}
        {fehler && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{fehler}</p>}
        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Info size={11} />Nur Übersicht — der Headset-Bestand der Zubehör Inventur wird nicht abgebucht.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent/30">Abbrechen</button>
          <button onClick={() => void speichern()} disabled={busy} data-headset-speichern
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 size={13} className="animate-spin" />}Speichern
          </button>
        </div>
      </div>
    </div>
  )
}
