// ── Proaktives Radar → Reiter „Wochenend-Check" ──────────────────────────────
// Alle genutzten PCs (Endgeräte-Übersicht: In use + Active) mit einer Spalte je
// Messtag (Standard So 12:00): war der PC an? Die Messung selbst macht WeekendCheckController;
// dieser Reiter zeigt nur an (Daten: services/weekendCheck.ts).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Download, Search, Power, Info, User, AlertTriangle, Check } from 'lucide-react'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { PersonInfoButton } from '../person/PersonDossier'
import { KopfFilter } from '../KopfFilter'
import { foldName } from '../../utils/nameMatch'
import {
  listWeekendDevices, loadWeekendResults, messtageSince, hostKey, wochentag,
  type WeekendDevice, type WeekendResults, type HostResult, type WeekendAnmeldung,
} from '../../services/weekendCheck'
import { benutzerText } from '../../services/anmeldeAbgleichLogik'
import { getScanSchedule, describeSchedule } from '../../services/scanSchedules'

/** Erster Messtag der Tabelle (Start der Dokumentation: Sonntag 11.10.26). */
const START_TAG = '2026-10-11'

type Zelle = 'an' | 'aus' | 'nicht gemessen'
type FilterId = 'model' | 'assignedTo' | 'zuletzt' | 'angemeldet'

const LEER = new Set<string>()

/** Kategorie für den Spaltenfilter „Angemeldet". */
function anmeldeKategorie(c: { z: Zelle; r?: HostResult }): string {
  if (c.z !== 'an') return c.z === 'aus' ? 'PC aus' : 'nicht gemessen'
  const a = c.r?.anmeldung
  if (!a) return 'nicht ausgelesen'
  switch (a.stufe) {
    case 'passt': return 'zugewiesene Person'
    case 'fremd': return 'andere Person'
    case 'ohne-zuweisung': return 'angemeldet (Gerät ohne Zuweisung)'
    case 'niemand': return 'niemand angemeldet'
    default: return 'nicht ermittelbar'
  }
}

/** Ein Satz für Tooltip/Export: wer war angemeldet? */
function anmeldeText(a: WeekendAnmeldung | undefined, mitFehler = true): string {
  if (!a) return 'nicht ausgelesen'
  if (a.benutzer.length) return a.benutzer.map(b => benutzerText(b)).join(', ')
  return a.stufe === 'unbekannt' ? `nicht ermittelbar${mitFehler && a.fehler ? ` (${a.fehler})` : ''}` : 'niemand angemeldet'
}

function kurz(key: string): string {
  const [, m, d] = key.split('-')
  return `${d}.${m}.`
}
function lang(key: string): string {
  const [y, m, d] = key.split('-')
  return `${d}.${m}.${y.slice(2)}`
}

export default function WeekendCheckTab({ onCount, exportCsv }: {
  onCount?: (n: number) => void
  exportCsv: (filename: string, header: string[], rows: string[][]) => Promise<void>
}) {
  const [devices, setDevices] = useState<WeekendDevice[]>([])
  const [results, setResults] = useState<WeekendResults>({ messungen: {} })
  const [plan, setPlan] = useState('')
  const [planTage, setPlanTage] = useState<number[]>([0])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [aus, setAus] = useState<Partial<Record<FilterId, Set<string>>>>({})
  const [sortHaeufig, setSortHaeufig] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancel = false
    void (async () => {
      setLoading(true)
      const [d, r, cfg] = await Promise.all([
        listWeekendDevices(),
        loadWeekendResults(),
        getScanSchedule('weekend-check').catch(() => null),
      ])
      if (cancel) return
      setDevices(d); setResults(r); setPlan(cfg ? describeSchedule(cfg) : '')
      if (cfg) setPlanTage(cfg.days)
      onCount?.(d.length)
      setLoading(false)
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Spalten: alle geplanten Messtage ab Start (bzw. ab der ältesten Messung) bis heute,
  // plus jeder Tag, an dem tatsächlich gemessen wurde (falls der Zeitplan mal geändert wurde).
  const tage = useMemo(() => {
    const keys = Object.keys(results.messungen).sort()
    const ab = keys.length && keys[0] < START_TAG ? keys[0] : START_TAG
    return [...new Set([...messtageSince(ab, planTage), ...keys])].sort()
  }, [results, planTage])
  const gemessen = useMemo(() => tage.filter(k => results.messungen[k]), [tage, results])
  const letzter = gemessen.length ? gemessen[gemessen.length - 1] : ''

  function zelle(dev: WeekendDevice, key: string): { z: Zelle; r?: HostResult } {
    const s = results.messungen[key]
    if (!s) return { z: 'nicht gemessen' }
    const r = s.hosts[hostKey(dev.hostname)]
    if (!r) return { z: 'nicht gemessen' }
    return { z: r.online ? 'an' : 'aus', r }
  }
  const wieOft = (dev: WeekendDevice) => gemessen.filter(k => zelle(dev, k).z === 'an').length

  // Filter (Excel-Art: ausgeblendete Werte; Zählwerte über alle ANDEREN Filter)
  const filterDefs: { id: FilterId; titel: string; wert: (d: WeekendDevice) => string; leerText?: string }[] = [
    { id: 'model', titel: 'Modell', wert: d => d.model, leerText: '(ohne)' },
    { id: 'assignedTo', titel: 'Zugewiesen an', wert: d => d.assignedTo, leerText: '(niemand)' },
    { id: 'zuletzt', titel: letzter ? `Zuletzt (${kurz(letzter)})` : 'Zuletzt', wert: d => (letzter ? zelle(d, letzter).z : 'nicht gemessen') },
    { id: 'angemeldet', titel: letzter ? `Angemeldet (${kurz(letzter)})` : 'Angemeldet', wert: d => anmeldeKategorie(letzter ? zelle(d, letzter) : { z: 'nicht gemessen' }) },
  ]
  /** Angemeldete Benutzer der letzten Messung (nur bei PCs, die an waren). */
  const letzteAnmeldung = (d: WeekendDevice): WeekendAnmeldung | undefined => {
    if (!letzter) return undefined
    const c = zelle(d, letzter)
    return c.z === 'an' ? c.r?.anmeldung : undefined
  }
  // Wortweise: jedes eingegebene Wort muss in IRGENDEINER Spalte vorkommen — Reihenfolge,
  // Komma und Umlaut-Schreibweise egal („Davide Bazzani" findet „Bazzani, Davide").
  const suchWoerter = foldName(q).split(/[\s,;]+/).filter(Boolean)
  const trifftSuche = (d: WeekendDevice) => {
    if (!suchWoerter.length) return true
    const angemeldet = (letzteAnmeldung(d)?.benutzer ?? []).map(b => `${b.name ?? ''} ${b.sam}`).join(' ')
    const text = foldName([d.hostname, d.serial, d.model, d.assignedTo, angemeldet].join(' '))
    return suchWoerter.every(w => text.includes(w))
  }
  const passt = (f: typeof filterDefs[number], d: WeekendDevice) => !(aus[f.id]?.has(f.wert(d)))

  const { zeilen, werte } = useMemo(() => {
    const werte: Record<FilterId, Map<string, number>> = { model: new Map(), assignedTo: new Map(), zuletzt: new Map(), angemeldet: new Map() }
    for (const f of filterDefs) for (const d of devices) werte[f.id].set(f.wert(d), 0)
    for (const f of filterDefs) {
      for (const d of devices) {
        if (!trifftSuche(d) || !filterDefs.every(x => x.id === f.id || passt(x, d))) continue
        const v = f.wert(d); werte[f.id].set(v, (werte[f.id].get(v) ?? 0) + 1)
      }
    }
    let zeilen = devices.filter(d => trifftSuche(d) && filterDefs.every(f => passt(f, d)))
    if (sortHaeufig) zeilen = [...zeilen].sort((a, b) => wieOft(b) - wieOft(a) || a.hostname.localeCompare(b.hostname))
    return { zeilen, werte }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, results, q, aus, sortHaeufig, letzter])

  // Beim Laden ans rechte Ende scrollen — dort steht der neueste Messtag.
  useEffect(() => {
    if (!loading && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
  }, [loading])

  const zuletztAn = letzter ? devices.filter(d => zelle(d, letzter).z === 'an').length : 0
  const zuletztMitBenutzer = devices.filter(d => (letzteAnmeldung(d)?.benutzer.length ?? 0) > 0).length
  const zuletztFremd = devices.filter(d => letzteAnmeldung(d)?.stufe === 'fremd').length

  async function exportieren() {
    const header = ['Hostname', 'Seriennummer', 'Modell', 'Zugewiesen an', letzter ? `Angemeldet am ${lang(letzter)}` : 'Angemeldet', ...tage.map(lang), 'Wie oft an']
    const exportZelle = (d: WeekendDevice, k: string) => {
      const c = zelle(d, k)
      return c.z === 'an' && c.r?.anmeldung ? `an (${anmeldeText(c.r.anmeldung, false)})` : c.z
    }
    const rows = zeilen.map(d => {
      const c = letzter ? zelle(d, letzter) : { z: 'nicht gemessen' as Zelle }
      const angemeldet = c.z === 'an' ? anmeldeText(c.r?.anmeldung) : ''
      return [d.hostname, d.serial, d.model, d.assignedTo, angemeldet, ...tage.map(k => exportZelle(d, k)), String(wieOft(d))]
    })
    await exportCsv(`Wochenend-Check_${new Date().toISOString().slice(0, 10)}.csv`, header, rows)
  }

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade Wochenend-Check…</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground max-w-3xl">
          <Info size={14} className="mt-0.5 shrink-0 text-primary" />
          <div>
            Alle genutzten PCs (Endgeräte-Übersicht: Status <b>In use</b> + Verwendung <b>Active</b>). Gemessen wird
            {plan ? <> <b>{plan}</b></> : ' sonntags'} per Ping — aber nur, wenn das Tool dann (bis 2 Std. danach) bei einem
            Admin geöffnet ist. Verpasste Messtage werden nicht nachgeholt und bleiben „nicht gemessen".
            Bei PCs, die an sind, wird dabei auch ausgelesen, wer angemeldet ist und ob das die zugewiesene Person ist.
            {letzter && <> Letzte Messung: <b>{lang(letzter)}</b> — <b className="text-red-300">{zuletztAn}</b> von {devices.length} PCs waren an
              {zuletztMitBenutzer > 0 && <>, bei <b>{zuletztMitBenutzer}</b> war jemand angemeldet</>}
              {zuletztFremd > 0 && <> (<b className="text-amber-500">{zuletztFremd}× nicht die zugewiesene Person</b>)</>}.</>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Suchen…" title="Hostname, Seriennummer, Modell oder Name — mehrere Wörter in beliebiger Reihenfolge"
              className="pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background w-52 focus:outline-none focus:border-primary" />
          </div>
          <button onClick={() => setSortHaeufig(v => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border ${sortHaeufig ? 'bg-primary/15 border-primary/50 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            <Power size={13} />Häufigste zuerst
          </button>
          <button onClick={exportieren} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">
            <Download size={13} />Export
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">{zeilen.length} von {devices.length} PCs · {gemessen.length} von {tage.length} Messtagen gemessen</p>

      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-6">Keine genutzten PCs (In use + Active) in der Endgeräte-Übersicht gefunden.</p>
      ) : (
        <div ref={scrollRef} className="overflow-auto rounded-lg border border-border max-h-[calc(100vh-260px)]">
          <table className="text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="bg-card text-muted-foreground">
                <th className="sticky left-0 z-30 bg-card text-left font-semibold px-2.5 py-2 border-b border-r border-border whitespace-nowrap">Hostname</th>
                <th className="bg-card text-left font-semibold px-2.5 py-2 border-b border-border whitespace-nowrap">Seriennummer</th>
                {filterDefs.slice(0, 2).map(f => (
                  <th key={f.id} className="bg-card text-left font-semibold px-2.5 py-2 border-b border-border whitespace-nowrap">
                    <KopfFilter titel={f.titel} werte={werte[f.id]} ausgeblendet={aus[f.id] ?? LEER} leerText={f.leerText}
                      onChange={neu => setAus(a => ({ ...a, [f.id]: neu }))} />
                  </th>
                ))}
                <th className="bg-card text-center font-semibold px-2.5 py-2 border-b border-border whitespace-nowrap">
                  <KopfFilter titel={filterDefs[2].titel} werte={werte.zuletzt} ausgeblendet={aus.zuletzt ?? LEER}
                    onChange={neu => setAus(a => ({ ...a, zuletzt: neu }))} />
                </th>
                <th className="bg-card text-left font-semibold px-2.5 py-2 border-b border-r border-border whitespace-nowrap"
                  title="Wer war bei der letzten Messung am PC angemeldet? (nur bei PCs, die an waren)">
                  <KopfFilter titel={filterDefs[3].titel} werte={werte.angemeldet} ausgeblendet={aus.angemeldet ?? LEER}
                    onChange={neu => setAus(a => ({ ...a, angemeldet: neu }))} />
                </th>
                <th className="bg-card text-center font-semibold px-2.5 py-2 border-b border-r border-border whitespace-nowrap" title="Wie oft war der PC an einem gemessenen Messtag an?">Wie oft an</th>
                {tage.map(k => (
                  <th key={k} title={results.messungen[k] ? `Gemessen ${new Date(results.messungen[k].checkedAt).toLocaleString('de-DE')} · ${results.messungen[k].by}` : 'Nicht gemessen'}
                    className={`bg-card text-center font-semibold px-2 py-2 border-b border-border whitespace-nowrap ${results.messungen[k] ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                    {wochentag(k).slice(0, 2)} {kurz(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map(d => {
                const n = wieOft(d)
                return (
                  <tr key={d.hostname} className="hover:bg-accent/10">
                    <td className="sticky left-0 z-10 bg-background px-2.5 py-1.5 border-b border-r border-border whitespace-nowrap font-medium text-foreground">
                      <span className="inline-flex items-center gap-1">{d.hostname}<DeviceInfoButton hostname={d.hostname} serial={d.serial} /></span>
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-border whitespace-nowrap font-mono text-foreground/90">{d.serial || '—'}</td>
                    <td className="px-2.5 py-1.5 border-b border-border whitespace-nowrap text-foreground/90">{d.model || '—'}</td>
                    <td className="px-2.5 py-1.5 border-b border-border whitespace-nowrap text-foreground/90">
                      {d.assignedTo ? <span className="inline-flex items-center gap-1">{d.assignedTo}<PersonInfoButton name={d.assignedTo} /></span> : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-border text-center"><ZellenBadge {...(letzter ? zelle(d, letzter) : { z: 'nicht gemessen' as Zelle })} /></td>
                    <td className="px-2.5 py-1.5 border-b border-r border-border whitespace-nowrap"><AnmeldeZelle {...(letzter ? zelle(d, letzter) : { z: 'nicht gemessen' as Zelle })} /></td>
                    <td className={`px-2.5 py-1.5 border-b border-r border-border text-center font-semibold ${n > 0 ? 'text-red-300' : 'text-muted-foreground'}`}>{gemessen.length ? `${n}×` : '—'}</td>
                    {tage.map(k => (
                      <td key={k} className="px-2 py-1.5 border-b border-border text-center"><ZellenBadge {...zelle(d, k)} /></td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const STATUS_KURZ: Record<string, string> = { aktiv: 'aktiv', gesperrt: 'gesperrt', getrennt: 'getrennt' }

/** Spalte „Angemeldet": wer war bei der letzten Messung angemeldet? */
function AnmeldeZelle({ z, r }: { z: Zelle; r?: HostResult }) {
  if (z !== 'an') return <span className="text-muted-foreground/40">–</span>
  const a = r?.anmeldung
  if (!a) {
    return <span className="text-[11px] italic text-muted-foreground" title="Bei dieser Messung wurde der angemeldete Benutzer noch nicht ausgelesen (ältere Messung).">nicht ausgelesen</span>
  }
  const geprueft = `Ausgelesen ${new Date(a.am).toLocaleString('de-DE')}${a.weg ? ` über ${a.weg}` : ''}`
  if (a.benutzer.length === 0) {
    return a.stufe === 'unbekannt'
      ? <span className="text-[11px] text-muted-foreground" title={`${a.fehler || 'Nicht ermittelbar.'}\n${geprueft}`}>nicht ermittelbar</span>
      : <span className="text-[11px] text-muted-foreground" title={geprueft}>niemand angemeldet</span>
  }
  const fremd = a.stufe === 'fremd'
  const titel = [
    fremd ? 'Nicht die zugewiesene Person' : a.stufe === 'passt' ? 'Die zugewiesene Person' : 'Gerät ist niemandem zugewiesen',
    `Zugewiesen: ${a.zugewiesen || 'niemandem'}`,
    geprueft,
  ].join('\n')
  return (
    <span data-anmelde-stufe={a.stufe} title={titel} className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${fremd ? 'text-amber-500' : 'text-foreground/90'}`}>
      {fremd ? <AlertTriangle size={11} className="shrink-0" /> : a.stufe === 'passt' ? <Check size={11} className="shrink-0 text-emerald-500" /> : <User size={11} className="shrink-0 text-muted-foreground" />}
      {a.benutzer.map(b => (
        <span key={b.konto || b.sam} className="inline-flex items-center gap-1">
          <span className={fremd ? 'font-semibold' : ''}>{b.name || b.konto || b.sam}</span>
          {b.name && <span className="text-muted-foreground">({b.sam})</span>}
          {STATUS_KURZ[b.status] && <span className="rounded px-1 text-[10px] bg-muted/40 text-muted-foreground">{STATUS_KURZ[b.status]}</span>}
          {b.name && <PersonInfoButton name={b.name} sam={b.sam} />}
        </span>
      ))}
    </span>
  )
}

function ZellenBadge({ z, r }: { z: Zelle; r?: HostResult }) {
  if (z === 'an') {
    const a = r?.anmeldung
    const titel = [`Online (${r?.method || 'Ping'}) — PC war nicht ausgeschaltet`]
    if (a) {
      titel.push(`Angemeldet: ${anmeldeText(a)}`)
      if (a.stufe === 'fremd') titel.push(`Zugewiesen: ${a.zugewiesen || '—'} — nicht dieselbe Person`)
    }
    return <span title={titel.join('\n')}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-300 border border-red-500/40">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />an
      {a && a.benutzer.length > 0 && <User size={9} className={a.stufe === 'fremd' ? 'text-amber-500' : ''} />}
    </span>
  }
  if (z === 'aus') {
    return <span title="Nicht erreichbar — PC war aus"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />aus</span>
  }
  return <span title="An diesem Tag nicht gemessen" className="text-muted-foreground/40">–</span>
}
