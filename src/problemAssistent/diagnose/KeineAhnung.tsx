// ── „Keine Ahnung, was das Problem ist?“ — geführte Diagnose ─────────────────
// Oberthema wählen → Unterthema wählen → Prüfungen laufen (nur lesend) → Befunde mit Begründung
// → „Lösung öffnen“ springt in das passende Problem mit seinen ausführbaren Schritten.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Play, Loader2, CheckCircle2, XCircle, AlertTriangle, Info, ChevronDown, ChevronRight, RotateCcw, Search, Stethoscope,
  Wifi, Network, Globe, ShieldCheck, HardDrive, Printer, Mail, Users, FileText, Cloud, KeyRound, Gauge, Bug, Monitor, Package,
  Headphones, MonitorSmartphone, Usb, Phone, Factory, Battery, Lock, Settings, Camera, Laptop,
} from 'lucide-react'
import { PROBLEME } from '../katalog'
import type { PaVerbindung } from '../motor'
import { DG_THEMEN, DG_SONDEN_MAP } from './index'
import { fuehreDiagnose } from './motor'
import type { DgBefund, DgOber, DgSondenErgebnis, DgUnter } from './types'

const SYMBOLE: Record<string, typeof Wifi> = {
  Wifi, Network, Globe, ShieldCheck, HardDrive, Printer, Mail, Users, FileText, Cloud, KeyRound, Gauge, Bug, Monitor, Package,
  Headphones, MonitorSmartphone, Usb, Phone, Factory, Battery, Lock, Settings, Camera, Laptop,
}
const SCHWERE = {
  3: { text: 'Ursache gefunden', cls: 'border-red-500/50 bg-red-500/[0.06]', badge: 'bg-red-600 text-white' },
  2: { text: 'sehr wahrscheinlich', cls: 'border-amber-500/50 bg-amber-500/[0.06]', badge: 'bg-amber-500 text-white' },
  1: { text: 'möglicher Grund', cls: 'border-border bg-muted/30', badge: 'bg-muted text-foreground' },
} as const

interface Lauf { laeuft: boolean; aktiv: string[]; ergebnisse: DgSondenErgebnis[]; befunde: DgBefund[] | null; dauerMs?: number }

export default function KeineAhnung({ host, verb, onLoesung, onSchliessen, ersatz }: {
  host: string; verb: PaVerbindung | null; onLoesung: (problemId: string) => void; onSchliessen: () => void; ersatz?: DgErsatzBenutzer | null
}) {
  const [ober, setOber] = useState<DgOber | null>(null)
  const [unter, setUnter] = useState<DgUnter | null>(null)
  const [filter, setFilter] = useState('')
  const titel = useMemo(() => new Map(PROBLEME.map(p => [p.id, p])), [])
  const themen = useMemo(() => DG_THEMEN.filter(o => o.unter.length), [])

  // Suche über alle Unterthemen („wo gehört mein Problem hin?“)
  const treffer = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return []
    return themen.flatMap(o => o.unter.map(u => ({ o, u }))).filter(({ o, u }) => (o.titel + ' ' + u.titel + ' ' + u.beschreibung).toLowerCase().includes(q)).slice(0, 12)
  }, [filter, themen])

  return (
    <div className="rounded-xl border-2 border-violet-500/30 bg-violet-500/[0.03] p-4 space-y-3" data-keine-ahnung>
      <div className="flex items-center gap-2">
        {(ober || unter) && <button onClick={() => (unter ? setUnter(null) : setOber(null))} className="p-1 rounded hover:bg-accent text-muted-foreground" title="zurück"><ArrowLeft size={16} /></button>}
        <Stethoscope size={18} className="text-violet-600 dark:text-violet-400" />
        <p className="text-sm font-semibold text-foreground">{unter ? unter.titel : ober ? ober.titel : 'Keine Ahnung, was das Problem ist? Wir finden es zusammen heraus.'}</p>
        <button onClick={onSchliessen} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline">zur Suche</button>
      </div>

      {!ober && !unter && (
        <>
          <p className="text-xs text-muted-foreground">Wähle, worum es ungefähr geht. Danach prüft das Tool den PC gezielt (es ändert dabei nichts) und schlägt die passende Lösung vor.</p>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Stichwort, z. B. „langsam“, „Ton“, „Drucker“ …" className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:border-violet-500" />
          </div>
          {treffer.length > 0 ? (
            <div className="space-y-1">
              {treffer.map(({ o, u }) => (
                <button key={u.id} onClick={() => { setOber(o); setUnter(u) }} className="w-full text-left rounded-md border border-border bg-card px-3 py-2 hover:border-violet-500/50">
                  <span className="block text-sm text-foreground">{u.titel}</span>
                  <span className="block text-[11px] text-muted-foreground">{o.titel} · {u.beschreibung}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-dg-themen>
              {themen.map(o => {
                const S = SYMBOLE[o.symbol] || Settings
                return (
                  <button key={o.id} onClick={() => setOber(o)} className="text-left rounded-lg border border-border bg-card p-3 hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors">
                    <S size={18} className="text-violet-600 dark:text-violet-400 mb-1.5" />
                    <span className="block text-sm font-medium text-foreground leading-tight">{o.titel}</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{o.beschreibung}</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {ober && !unter && (
        <div className="space-y-1.5" data-dg-unter>
          <p className="text-xs text-muted-foreground">{ober.beschreibung}. Was trifft am ehesten zu?</p>
          {ober.unter.map(u => (
            <button key={u.id} onClick={() => setUnter(u)} className="w-full text-left rounded-md border border-border bg-card px-3 py-2.5 hover:border-violet-500/50 hover:bg-violet-500/5 flex items-start gap-2">
              <ChevronRight size={15} className="mt-0.5 text-violet-500 shrink-0" />
              <span className="min-w-0"><span className="block text-sm text-foreground">{u.titel}</span><span className="block text-[11px] text-muted-foreground">{u.beschreibung}</span></span>
            </button>
          ))}
        </div>
      )}

      {unter && <Diagnose key={unter.id} unter={unter} host={host} verb={verb} titel={titel} onLoesung={onLoesung} ersatz={ersatz} />}
    </div>
  )
}

/** Zugewiesene Person des PCs (Endgeräte/Inventar → AD) — wenn niemand angemeldet bzw. der PC nicht erreichbar ist. */
export interface DgErsatzBenutzer { sam: string; name: string }

/** Diagnose eines Unterthemas (bzw. eines ganzen Bereichs). autoStart = sofort loslegen, versucht = schon ausgeführte Lösungen markieren. */
export function Diagnose({ unter, host, verb, titel, onLoesung, autoStart, versucht, ersatz }: {
  unter: DgUnter; host: string; verb: PaVerbindung | null; titel: Map<string, { titel: string; bereich: string }>; onLoesung: (id: string) => void
  autoStart?: boolean; versucht?: string[]; ersatz?: DgErsatzBenutzer | null
}) {
  const [antworten, setAntworten] = useState<Record<string, 'ja' | 'nein'>>({})
  const [lauf, setLauf] = useState<Lauf | null>(null)
  const [offen, setOffen] = useState(false)
  const sonden = unter.sonden.map(id => DG_SONDEN_MAP.get(id)).filter(Boolean)
  const online = !!verb?.ok
  // Benutzer für die AD-Prüfungen: angemeldeter Benutzer, sonst die zugewiesene Person
  const sam = verb?.benutzer || (ersatz ? ersatz.sam : '')
  const ersatzAktiv = !verb?.benutzer && !!ersatz
  const lokale = sonden.filter(s => s!.modus === 'lokal').length
  // PC nicht erreichbar (Verbindungsversuch abgeschlossen): nur AD-Prüfungen, wenn das Thema welche hat
  const nurLokal = !online && !!verb && lokale > 0 && !!sam
  const bereit = !!host && (online || nurLokal)
  const gestartet = useRef(false)
  useEffect(() => { if (autoStart && bereit && !gestartet.current) { gestartet.current = true; void starte() } }) // eslint-disable-line react-hooks/exhaustive-deps

  async function starte() {
    const t0 = Date.now()
    const ergebnisse: DgSondenErgebnis[] = []
    setLauf({ laeuft: true, aktiv: [], ergebnisse: [], befunde: null })
    const r = await fuehreDiagnose(host, unter, DG_SONDEN_MAP, antworten, (e, aktiv) => {
      if (e.dauerMs || !e.ok || e.punkte.length) { const i = ergebnisse.findIndex(x => x.id === e.id); if (i >= 0) ergebnisse[i] = e; else ergebnisse.push(e) }
      setLauf({ laeuft: true, aktiv, ergebnisse: [...ergebnisse], befunde: null })
    }, { sam, nurLokal })
    setLauf({ laeuft: false, aktiv: [], ergebnisse: r.ergebnisse, befunde: r.befunde, dauerMs: Date.now() - t0 })
    setOffen(r.befunde.length === 0)
  }

  const punkteAlle = (lauf?.ergebnisse || []).flatMap(e => e.punkte)
  const zaehl = { fehler: punkteAlle.filter(p => p.s === 'fehler').length, warn: punkteAlle.filter(p => p.s === 'warn').length, ok: punkteAlle.filter(p => p.s === 'ok').length }

  return (
    <div className="space-y-3" data-dg-diagnose>
      <p className="text-xs text-muted-foreground">{unter.beschreibung}</p>
      {unter.fragen?.length ? (
        <div className="space-y-1.5">
          {unter.fragen.map(f => (
            <div key={f.id} className="flex items-center gap-2 text-xs">
              <span className="text-foreground">{f.text}</span>
              {(['ja', 'nein'] as const).map(a => (
                <button key={a} disabled={lauf?.laeuft} onClick={() => setAntworten(x => (x[f.id] === a ? (({ [f.id]: _, ...r }) => r)(x) : { ...x, [f.id]: a }))}
                  className={`px-2 py-0.5 rounded-full border ${antworten[f.id] === a ? 'bg-violet-600 text-white border-violet-600' : 'border-border text-muted-foreground hover:text-foreground'}`}>{a}</button>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {!lauf && (
        <div className="flex items-center gap-3 flex-wrap">
          <button disabled={!bereit} onClick={() => { void starte() }} data-dg-start
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50">
            <Play size={14} />Diagnose starten
          </button>
          <span className="text-[11px] text-muted-foreground">{
            !host ? 'Erst oben den Ziel-PC wählen.'
              : nurLokal ? `${host} ist nicht erreichbar – es laufen nur die ${lokale} AD-Prüfung(en) (Berechtigungen) für ${ersatzAktiv ? ersatz!.name + ' (zugewiesen)' : sam}. Liest nur.`
                : online ? `${sonden.length} Prüfung(en) auf ${host} — liest nur, ändert nichts`
                  : !verb ? 'Der Ziel-PC wird noch verbunden …'
                    : lokale ? 'Der Ziel-PC ist nicht erreichbar und ihm ist keine Person zugeordnet – Berechtigungen nicht prüfbar.'
                      : 'Der Ziel-PC ist nicht erreichbar – für dieses Thema braucht die Diagnose den PC.'
          }</span>
        </div>
      )}
      {!lauf && online && ersatzAktiv && lokale > 0 && (
        <p className="text-[11px] text-muted-foreground">Niemand angemeldet – die Berechtigungen werden für die zugewiesene Person {ersatz!.name} geprüft.</p>
      )}

      {lauf && (
        <div className="space-y-3">
          <div className="space-y-1">
            {sonden.map(s => {
              const e = lauf.ergebnisse.find(x => x.id === s!.id)
              const aktiv = lauf.aktiv.includes(s!.id)
              const n = e ? { f: e.punkte.filter(p => p.s === 'fehler').length, w: e.punkte.filter(p => p.s === 'warn').length } : null
              return (
                <div key={s!.id} className="flex items-center gap-2 text-xs">
                  {aktiv ? <Loader2 size={13} className="animate-spin text-violet-500" /> : !e ? <span className="w-[13px] h-[13px] rounded-full border border-border inline-block" /> : !e.ok ? <XCircle size={13} className="text-red-500" /> : n!.f ? <XCircle size={13} className="text-red-500" /> : n!.w ? <AlertTriangle size={13} className="text-amber-500" /> : <CheckCircle2 size={13} className="text-emerald-500" />}
                  <span className="text-foreground">{s!.titel}</span>
                  {e && !aktiv && <span className="text-muted-foreground">{e.ok ? `${e.punkte.length} Punkte${n!.f ? ` · ${n!.f} Fehler` : ''}${n!.w ? ` · ${n!.w} Auffälligkeit(en)` : ''}` : `nicht möglich: ${e.fehler}`}</span>}
                </div>
              )
            })}
          </div>

          {!lauf.laeuft && lauf.befunde && (
            lauf.befunde.length ? (
              <div className="space-y-2" data-dg-befunde>
                <p className="text-xs font-semibold text-foreground">Ergebnis: {lauf.befunde.length === 1 ? 'eine Ursache' : `${lauf.befunde.length} mögliche Ursachen`} gefunden</p>
                {lauf.befunde.map(b => {
                  const p = titel.get(b.problem)
                  const sw = SCHWERE[b.schwere]
                  return (
                    <div key={b.regel} className={`rounded-lg border-2 p-3 ${sw.cls}`}>
                      <div className="flex items-start gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${sw.badge}`}>{sw.text}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{b.text}</p>
                          {b.fehlerbild && <p className="text-[11px] text-foreground/80 mt-0.5">Fehlerbild ohne diese Berechtigung: {b.fehlerbild}</p>}
                          {b.antrag && <p className="text-[11px] text-muted-foreground mt-0.5">Antrag: {b.antrag}</p>}
                          {p && <p className="text-[11px] text-muted-foreground mt-0.5">Lösung: {p.titel}{versucht?.includes(b.problem) ? <span className="ml-1.5 px-1.5 py-px rounded bg-muted text-foreground">schon versucht</span> : null}</p>}
                        </div>
                        <div className="shrink-0 flex flex-col gap-1 items-end">
                          {b.antrag && <button onClick={() => { void import('../../serviceNowWelt/oeffnen').then(m => m.oeffneSnEintrag(b.antrag!)) }} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10">Antrag öffnen</button>}
                          {p && <button onClick={() => onLoesung(b.problem)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Lösung öffnen</button>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-3 space-y-2" data-dg-ohne-befund>
                <p className="text-sm text-foreground flex items-center gap-1.5"><Info size={14} className="text-sky-500" />{nurLokal
                  ? <>Die Berechtigungen sind unauffällig ({zaehl.ok} in Ordnung{zaehl.warn ? `, ${zaehl.warn} Hinweise` : ''}). Den PC selbst konnte die Diagnose nicht prüfen, weil er nicht erreichbar ist.</>
                  : <>Keine eindeutige Ursache gefunden — die Prüfungen sind unauffällig ({zaehl.ok} in Ordnung{zaehl.warn ? `, ${zaehl.warn} Hinweise` : ''}).</>}</p>
                <p className="text-[11px] text-muted-foreground">Am häufigsten hilft bei diesem Thema:</p>
                {unter.ohneBefund.map(id => { const p = titel.get(id); return p ? (
                  <button key={id} onClick={() => onLoesung(id)} className="w-full text-left rounded-md border border-border px-3 py-1.5 hover:bg-accent/30 text-xs text-foreground flex items-center gap-2"><ChevronRight size={13} className="text-primary" />{p.titel}</button>
                ) : null })}
              </div>
            )
          )}

          {!lauf.laeuft && (
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <button onClick={() => setOffen(!offen)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">{offen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Alle Prüfpunkte ({punkteAlle.length}: {zaehl.fehler} Fehler, {zaehl.warn} Hinweise, {zaehl.ok} ok)</button>
                <button onClick={() => { void starte() }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 ml-auto"><RotateCcw size={12} />erneut prüfen</button>
              </div>
              {offen && (
                <div className="rounded-md border border-border divide-y divide-border/60" data-dg-punkte>
                  {lauf.ergebnisse.map(e => (
                    <div key={e.id} className="px-3 py-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{e.titel}</p>
                      {!e.ok && <p className="text-xs text-red-500">Prüfung nicht möglich: {e.fehler}</p>}
                      {e.punkte.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                          {p.s === 'ok' ? <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" /> : p.s === 'warn' ? <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" /> : p.s === 'fehler' ? <XCircle size={12} className="text-red-500 mt-0.5 shrink-0" /> : <Info size={12} className="text-sky-500 mt-0.5 shrink-0" />}
                          <span className="text-foreground shrink-0">{p.t}</span>
                          {p.x && <span className="text-muted-foreground">— {p.x}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
