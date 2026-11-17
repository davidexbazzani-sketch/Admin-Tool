// ── PC-Volldiagnose: Oberfläche (Start mit Richtung → Lauf → Ergebnis → Maßnahmenplan) ──
import { useEffect, useMemo, useState } from 'react'
import {
  Stethoscope, Play, Loader, CheckCircle, XCircle, AlertTriangle, Info, ChevronDown, ChevronRight, X, Zap, FileText, Download,
  Server, Monitor, ArrowRight, Lock, Layers, Search, ShieldCheck, Wifi, Network, Globe, HardDrive, Printer, Mail, Users, Cloud, KeyRound,
  Gauge, Bug, Package, Headphones, MonitorSmartphone, Usb, Phone, Factory, Battery, Settings, Camera, Laptop, RefreshCw, Square,
} from 'lucide-react'
import PcSuche, { type PcWahl } from '../components/PcSuche'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import MonitorAngebot from '../monitoring/MonitorAngebot'
import { vorschlaegeFuerDiagnose } from '../monitoring/kontrollen'
import { useAuthStore } from '../store/authStore'
import { useVollDiagnoseStore } from './store'
import { VERTIEFUNGEN } from './vertiefungen'
import { RICHTUNG_THEMEN, passendeUnter, problemVorschlaege, fachVonRichtung, fachVonText, richtungText } from './richtung'
import { ausfuehrbar, risikoVon, fehlendeEingabe } from './plan'
import { problemVon } from './auswertung'
import { speicherePdf, speichereKiBericht } from './bericht'
import { VollDiagnoseInfo, VOLLDIAGNOSE_DAUER } from './VollDiagnoseInfo'
import { BEREICH_TEXT, FACH_TEXT, PHASE_TEXT, SCHWERE_RANG, type VdBefund, type VdFachdiagnose, type VdLauf, type VdMassnahme, type VdRichtung, type VdSchwere } from './typen'

const SYMBOLE: Record<string, typeof Wifi> = { Wifi, Network, Globe, ShieldCheck, HardDrive, Printer, Mail, Users, FileText, Cloud, KeyRound, Gauge, Bug, Monitor, Package, Headphones, MonitorSmartphone, Usb, Phone, Factory, Battery, Lock, Settings, Camera, Laptop }
const SCHWERE_ICON = (s: VdSchwere, gross = false) => s === 'kritisch' ? <XCircle size={gross ? 18 : 15} className="text-red-500 shrink-0" /> : s === 'warnung' ? <AlertTriangle size={gross ? 18 : 15} className="text-amber-500 shrink-0" /> : <Info size={gross ? 18 : 15} className="text-sky-500 shrink-0" />
const datum = (t?: number | string) => { const d = t ? new Date(t) : null; return d && !isNaN(d.getTime()) ? d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }

export interface VollDiagnoseProps {
  startHost?: string
  startText?: string
  onWerkzeug: (id: string, host: string) => void
}

export default function VollDiagnose({ startHost, startText, onWerkzeug }: VollDiagnoseProps) {
  const aktiv = useVollDiagnoseStore(s => s.aktiv)
  const laeufe = useVollDiagnoseStore(s => s.laeufe)
  const lauf = aktiv ? laeufe[aktiv] : undefined
  const andere = Object.values(laeufe).filter(l => l.host.toUpperCase() !== aktiv)
  return (
    <div className="space-y-3" data-volldiagnose>
      {andere.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="text-muted-foreground">Weitere Diagnosen:</span>
          {andere.map(l => (
            <button key={l.host} onClick={() => useVollDiagnoseStore.getState().zeige(l.host)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border hover:bg-accent">
              {['verbinden', 'rundum', 'vertiefen'].includes(l.phase) || l.ausfuehrung?.laeuft ? <Loader size={10} className="animate-spin" /> : <CheckCircle size={10} className="text-emerald-500" />}
              <span className="font-mono">{l.host.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
      {lauf ? <LaufAnsicht lauf={lauf} onWerkzeug={onWerkzeug} /> : <StartFormular startHost={startHost} startText={startText} onWerkzeug={onWerkzeug} />}
    </div>
  )
}

// ══ Start: Ziel, Zeitraum, Richtung ══════════════════════════════════════════
function StartFormular({ startHost, startText, onWerkzeug }: VollDiagnoseProps) {
  const session = useAuthStore(s => s.session)
  const von = session?.user.displayName || session?.user.username || 'unbekannt'
  const [pc, setPc] = useState<PcWahl | null>(startHost ? { host: startHost } : null)
  const [tage, setTage] = useState(7)
  const [richtungAn, setRichtungAn] = useState<boolean | null>(startText ? true : null)
  const [text, setText] = useState(startText || '')
  const [themen, setThemen] = useState<string[]>([])
  const [unter, setUnter] = useState<string[]>([])
  const [problem, setProblem] = useState<string | undefined>()
  const [offenesThema, setOffenesThema] = useState<string | null>(null)
  const [vorschlaege, setVorschlaege] = useState<{ id: string; titel: string; bereich: string; sicher: boolean }[]>([])
  const [auto, setAuto] = useState(true)
  const unterTreffer = useMemo(() => (richtungAn && text.trim().length >= 3 ? passendeUnter(text, 4) : []), [text, richtungAn])
  useEffect(() => {
    if (!richtungAn || text.trim().length < 3) { setVorschlaege([]); return }
    let weg = false
    const t = setTimeout(() => { void problemVorschlaege(text, 5).then(v => { if (!weg) setVorschlaege(v) }) }, 220)
    return () => { weg = true; clearTimeout(t) }
  }, [text, richtungAn])
  const richtung: VdRichtung | undefined = richtungAn && (text.trim() || themen.length || unter.length || problem) ? { text: text.trim() || undefined, themen, unter, problem } : undefined
  const fach = fachVonRichtung(richtung) || (richtungAn ? fachVonText(unterTreffer, vorschlaege) : undefined)
  const host = pc?.host?.trim() || ''
  const umschalten = <T,>(liste: T[], x: T) => (liste.includes(x) ? liste.filter(y => y !== x) : [...liste, x])

  return (
    <div className="bg-card rounded-lg border border-primary/40 p-5 space-y-4 max-w-3xl" data-volldiagnose-start>
      <div className="flex items-center gap-2">
        <Stethoscope size={18} className="text-primary" />
        <p className="text-sm font-semibold text-foreground">Komplett-Diagnose</p>
        <VollDiagnoseInfo />
        <span className="text-[11px] text-muted-foreground ml-1">{VOLLDIAGNOSE_DAUER} · liest zuerst nur, ändert nichts</span>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Ziel-PC oder Server <span className="font-normal">— Hostname, IP, Seriennummer oder Name</span></label>
        <PcSuche wert={pc} onWahl={setPc} autoFocus={!pc} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Ereignisse der letzten</span>
        {[1, 7, 30].map(t => (
          <button key={t} onClick={() => setTage(t)} className={`px-3 py-1 text-xs rounded-md border ${tage === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>{t === 1 ? '24 Stunden' : `${t} Tage`}</button>
        ))}
      </div>

      {/* Richtung */}
      <div className="rounded-md border border-border p-3 space-y-2.5" data-volldiagnose-richtung>
        <p className="text-xs font-semibold text-foreground">Ist ungefähr bekannt, worum es geht?</p>
        <div className="flex gap-2">
          <button onClick={() => setRichtungAn(false)} data-richtung-nein className={`px-3 py-1.5 text-xs rounded-md border ${richtungAn === false ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}>Nein – alles prüfen</button>
          <button onClick={() => setRichtungAn(true)} data-richtung-ja className={`px-3 py-1.5 text-xs rounded-md border ${richtungAn ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}>Ja – Richtung angeben</button>
        </div>
        {richtungAn && (
          <div className="space-y-2.5">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={text} onChange={e => setText(e.target.value)} autoFocus data-richtung-text spellCheck={false}
                placeholder="In eigenen Worten, z. B. „Outlook hängt“, „PC friert ein“, „Akku hält nicht“, „0x80070005“ …"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:border-primary" />
            </div>
            {(unterTreffer.length > 0 || vorschlaege.length > 0) && (
              <div className="space-y-1.5" data-richtung-vorschlaege>
                <p className="text-[11px] text-muted-foreground">Kann es das sein?</p>
                <div className="flex flex-wrap gap-1.5">
                  {unterTreffer.map(t => (
                    <button key={t.u.id} onClick={() => setUnter(u => umschalten(u, t.u.id))} title={t.u.beschreibung}
                      className={`text-[11px] px-2 py-1 rounded-full border ${unter.includes(t.u.id) ? 'bg-violet-600 text-white border-violet-600' : 'border-violet-500/40 text-foreground hover:bg-violet-500/10'}`}>{t.o.titel}: {t.u.titel}</button>
                  ))}
                </div>
                {vorschlaege.length > 0 && (
                  <div className="rounded-md border border-border divide-y divide-border/60">
                    {vorschlaege.map(v => (
                      <button key={v.id} onClick={() => setProblem(p => (p === v.id ? undefined : v.id))} data-richtung-problem={v.id}
                        className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 ${problem === v.id ? 'bg-primary/10' : 'hover:bg-accent/40'}`}>
                        {problem === v.id ? <CheckCircle size={12} className="text-primary shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
                        <span className="flex-1 text-foreground">{v.titel}</span><span className="text-[10px] text-muted-foreground">{v.bereich}</span>
                        {v.sicher && <span className="text-[10px] px-1.5 rounded bg-emerald-600 text-white">passt gut</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">Oder Kategorie wählen (mehrere möglich):</p>
              <div className="flex flex-wrap gap-1.5" data-richtung-kategorien>
                {RICHTUNG_THEMEN.map(o => {
                  const S = SYMBOLE[o.symbol] || Settings
                  const gewaehlt = themen.includes(o.id) || o.unter.some(u => unter.includes(u.id))
                  return (
                    <button key={o.id} onClick={() => setOffenesThema(x => (x === o.id ? null : o.id))} data-kategorie={o.id}
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border ${gewaehlt ? 'bg-primary/15 border-primary text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                      <S size={12} />{o.titel}{offenesThema === o.id ? <ChevronDown size={11} /> : null}
                    </button>
                  )
                })}
              </div>
              {offenesThema && (() => {
                const o = RICHTUNG_THEMEN.find(x => x.id === offenesThema)!
                return (
                  <div className="rounded-md border border-border p-2 flex flex-wrap gap-1.5" data-richtung-unter>
                    <button onClick={() => setThemen(t => umschalten(t, o.id))} className={`text-[11px] px-2 py-1 rounded-full border ${themen.includes(o.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}>ganzer Bereich „{o.titel}“</button>
                    {o.unter.map(u => (
                      <button key={u.id} onClick={() => setUnter(x => umschalten(x, u.id))} title={u.beschreibung} data-unter={u.id}
                        className={`text-[11px] px-2 py-1 rounded-full border ${unter.includes(u.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}>{u.titel}</button>
                    ))}
                  </div>
                )
              })()}
            </div>
            {richtung && <p className="text-[11px] text-foreground"><span className="text-muted-foreground">Richtung:</span> {richtungText(richtung)}</p>}
            {fach && (
              <div className="flex items-center gap-2 flex-wrap text-xs rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-2" data-richtung-fach>
                <Layers size={14} className="text-sky-600 shrink-0" />
                <span className="flex-1">Für dieses Thema gibt es die <b>{FACH_TEXT[fach]}</b> – sie geht hier tiefer als die Komplett-Diagnose.</span>
                <button disabled={!host} onClick={() => onWerkzeug(fach, host)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-40">Direkt zur {FACH_TEXT[fach]}<ArrowRight size={12} /></button>
              </div>
            )}
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
        Leichte Vertiefungen automatisch nachschieben, bis die Ursache klar ist (nur lesend, je 20–60 s)
      </label>
      <button disabled={!host} data-volldiagnose-starten
        onClick={() => useVollDiagnoseStore.getState().starte(host, { tage, autoVertiefen: auto, richtung, von, serial: pc?.serial, person: pc?.person })}
        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm ${host ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
        <Play size={16} /> Komplett-Diagnose starten
      </button>
    </div>
  )
}

// ══ Lauf / Ergebnis ═══════════════════════════════════════════════════════════
function LaufAnsicht({ lauf, onWerkzeug }: { lauf: VdLauf; onWerkzeug: (id: string, host: string) => void }) {
  const st = useVollDiagnoseStore.getState()
  const session = useAuthStore(s => s.session)
  const von = session?.user.displayName || session?.user.username || 'unbekannt'
  const z = lauf.ziel
  const laeuft = lauf.phase === 'verbinden' || lauf.phase === 'rundum' || lauf.phase === 'vertiefen'
  const fertig = lauf.pruefungen.filter(p => p.status !== 'wartet' && p.status !== 'laeuft').length
  const gesamt = lauf.pruefungen.length
  const aktivP = lauf.pruefungen.filter(p => p.status === 'laeuft')
  const [meldung, setMeldung] = useState('')
  const [geprueftOffen, setGeprueftOffen] = useState(false)
  const server = z?.geraet === 'server'
  const sortiert = [...lauf.befunde].sort((a, b) => (a.folgeVon ? 1 : 0) - (b.folgeVon ? 1 : 0) || SCHWERE_RANG[a.schwere] - SCHWERE_RANG[b.schwere])
  const wurzeln = sortiert.filter(b => !b.eltern || !lauf.befunde.some(x => x.id === b.eltern))
  const passend = wurzeln.filter(b => b.passend)
  const weitere = wurzeln.filter(b => !b.passend)
  const kinder = (id: string) => sortiert.filter(b => b.eltern === id)
  const zahl = (s: VdSchwere) => lauf.befunde.filter(b => b.schwere === s).length
  const fachListe = [...new Set(lauf.befunde.map(b => b.fachdiagnose).filter(Boolean))] as VdFachdiagnose[]
  const monitorVorschlag = [...new Set([...vorschlaegeFuerDiagnose(lauf.befunde.map(b => b.typ)), ...lauf.befunde.flatMap(b => problemVon(b.problem)?.ueberwachen || [])])].slice(0, 8)

  async function export_(art: 'pdf' | 'ki') {
    try { const p = art === 'pdf' ? await speicherePdf(lauf) : await speichereKiBericht(lauf); if (p) setMeldung(`Gespeichert: ${p}${art === 'ki' ? ' (+ .json)' : ''}`) }
    catch (e) { setMeldung('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))) }
  }

  return (
    <div className="space-y-3" data-volldiagnose-lauf>
      {/* Kopf */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {server ? <Server size={18} className="text-primary" /> : <Monitor size={18} className="text-primary" />}
          <span className="font-mono text-base font-bold text-foreground">{lauf.host.toUpperCase()}</span>
          <DeviceInfoButton hostname={lauf.host} />
          {z && <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${server ? 'bg-violet-600 text-white' : 'bg-primary/15 text-primary'}`}>{server ? 'Server' : 'Arbeitsplatz-PC'}</span>}
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/50 text-emerald-600 font-semibold" title="Rundumscan und Vertiefungen lesen nur – eingegriffen wird erst im Maßnahmenplan nach Bestätigung">Lese-Schritt · ändert nichts</span>
          <VollDiagnoseInfo klein />
          <div className="ml-auto flex items-center gap-1.5">
            {laeuft && <button onClick={() => st.abbrechen(lauf.host)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-border hover:bg-accent"><Square size={11} />Abbrechen</button>}
            {!laeuft && <button onClick={() => void export_('pdf')} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-primary/40 text-primary hover:bg-primary/10"><Download size={12} />PDF</button>}
            {!laeuft && <button onClick={() => void export_('ki')} title="Markdown + JSON – zum Auswerten mit KI" className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-border hover:bg-accent"><FileText size={12} />Bericht (MD/JSON)</button>}
            {!laeuft && !lauf.ausfuehrung?.laeuft && <button onClick={() => st.zeige(null)} data-volldiagnose-neu className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-border hover:bg-accent"><RefreshCw size={12} />Neue Diagnose</button>}
          </div>
        </div>
        {z && <p className="text-[11px] text-muted-foreground">{z.os || '?'}{z.build ? ` · Build ${z.build}` : ''}{z.modell ? ` · ${z.modell}` : ''} · angemeldet: <span className="text-foreground">{z.benutzer || '—'}</span>{z.sitzung ? ` (${z.sitzung}${z.gesperrt ? ', gesperrt' : ''})` : ''}{z.boot ? ` · letzter Start ${datum(z.boot)}` : ''}</p>}
        <p className="text-[11px] text-muted-foreground">Gestartet {datum(lauf.start)} von {lauf.von} · Ereignisse {lauf.tage === 1 ? '24 Stunden' : `${lauf.tage} Tage`}{lauf.richtung ? <> · Richtung: <span className="text-foreground">{richtungText(lauf.richtung)}</span></> : null}</p>
        {meldung && <p className="text-[11px] text-foreground">{meldung}</p>}
      </div>

      {/* Fehler / WinRM */}
      {lauf.phase === 'fehler' && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm space-y-2">
          <p className="text-foreground">{lauf.fehler || 'Diagnose fehlgeschlagen.'}</p>
          {z?.online && !z.winrm && !server && (
            <WinrmKnopf host={lauf.host} onFertig={f => { if (f) setMeldung('WinRM: ' + f); else st.starte(lauf.host, { tage: lauf.tage, autoVertiefen: lauf.autoVertiefen, richtung: lauf.richtung, von, serial: lauf.serial, person: lauf.person }) }} von={von} />
          )}
          {z?.online && !z.winrm && server && <p className="text-xs text-muted-foreground">Auf Servern schaltet die Volldiagnose WinRM nie ein – bitte WinRM am Server selbst prüfen.</p>}
        </div>
      )}

      {/* Fortschritt */}
      {laeuft && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2" data-volldiagnose-fortschritt>
          <div className="flex items-center gap-2 text-sm text-foreground"><Loader size={16} className="animate-spin text-primary" />
            {lauf.phase === 'verbinden' ? 'Ziel wird gelesen …' : lauf.phase === 'rundum' ? `Rundumscan: ${fertig} von ${gesamt} Prüfungen fertig` : `Vertiefung läuft: ${lauf.vertiefungLaeuft.map(v => VERTIEFUNGEN[v]?.titel || v).join(', ')}`}</div>
          {gesamt > 0 && <div className="h-2 rounded-full bg-muted/40 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(fertig / gesamt * 100)}%` }} /></div>}
          {aktivP.length > 0 && <p className="text-[11px] text-muted-foreground truncate">läuft: {aktivP.map(p => p.titel).join(' · ')}</p>}
          <p className="text-[10px] text-muted-foreground">Du kannst das Menü wechseln – die Diagnose läuft im Hintergrund weiter.</p>
        </div>
      )}

      {/* Zusammenfassung */}
      {(lauf.befunde.length > 0 || lauf.phase === 'fertig') && (
        <div className={`rounded-lg border p-4 flex items-center gap-3 flex-wrap ${zahl('kritisch') ? 'border-red-500/40 bg-red-500/10' : zahl('warnung') ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/40 bg-emerald-500/10'}`} data-volldiagnose-zusammenfassung>
          {zahl('kritisch') ? <XCircle size={30} className="text-red-500" /> : zahl('warnung') ? <AlertTriangle size={30} className="text-amber-500" /> : <CheckCircle size={30} className="text-emerald-500" />}
          <div>
            <p className="text-base font-bold text-foreground">{!zahl('kritisch') && !zahl('warnung') ? (lauf.phase === 'fertig' ? 'Keine Probleme gefunden' : 'Bisher nichts Kritisches') : `${zahl('kritisch')} kritisch · ${zahl('warnung')} Warnungen`}{zahl('hinweis') ? ` · ${zahl('hinweis')} Hinweise` : ''}</p>
            <p className="text-xs text-muted-foreground">{gesamt} Prüfungen{lauf.vertiefungFertig.length ? ` · ${lauf.vertiefungFertig.length} Vertiefung(en)` : ''}{lauf.kontext?.vorher ? ` · letzte Diagnose ${datum(lauf.kontext.vorher.am)}: ${lauf.befunde.filter(b => b.neu).length} Befund(e) neu` : ''}</p>
          </div>
          {lauf.phase === 'fertig' && monitorVorschlag.length > 0 && <div className="ml-auto"><MonitorAngebot klein host={lauf.host} serial={lauf.serial} person={lauf.person} vorschlag={monitorVorschlag} anlass={`Nach Volldiagnose vom ${new Date(lauf.start).toLocaleDateString('de-DE')}`} /></div>}
        </div>
      )}

      {/* Fachdiagnosen */}
      {!server && fachListe.length > 0 && (
        <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 flex items-center gap-2 flex-wrap text-xs" data-volldiagnose-fach>
          <Layers size={15} className="text-sky-600" /><span className="text-foreground">Für einige Befunde gibt es eine Fachdiagnose, die tiefer geht:</span>
          {fachListe.map(f => <button key={f} onClick={() => onWerkzeug(f, lauf.host)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 text-white font-semibold hover:bg-sky-700">{FACH_TEXT[f]}<ArrowRight size={12} /></button>)}
        </div>
      )}

      {/* Ursachenbild */}
      {lauf.ursachen.length > 0 && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2" data-volldiagnose-ursachen>
          <p className="text-sm font-bold text-foreground flex items-center gap-2"><Zap size={15} className="text-primary" />Ursachenbild</p>
          {lauf.ursachen.map((u, i) => (
            <div key={u.id} className="text-sm">
              <p className="font-semibold text-foreground">{i + 1}. {u.titel}</p>
              <p className="text-xs text-muted-foreground">{u.text}</p>
              {u.belege.length > 1 && <p className="text-[11px] text-muted-foreground mt-0.5">erklärt: {u.belege.slice(1).join(' · ')}</p>}
              {u.sperrt?.length ? <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5"><Lock size={11} />Gesperrt, bis die Ursache behoben ist: {u.sperrt.map(p => PHASE_TEXT[p]).join(', ')}</p> : null}
            </div>
          ))}
        </div>
      )}

      {/* Befunde */}
      {passend.length > 0 && <BefundListe titel={`Passend zu: ${richtungText(lauf.richtung)}`} liste={passend} kinder={kinder} lauf={lauf} onWerkzeug={onWerkzeug} />}
      {weitere.length > 0 && <BefundListe titel={passend.length ? 'Weitere Auffälligkeiten' : 'Befunde'} liste={weitere} kinder={kinder} lauf={lauf} onWerkzeug={onWerkzeug} />}
      {lauf.phase === 'fertig' && !lauf.befunde.length && <p className="text-sm text-muted-foreground">Alle Prüfungen ohne Befund.</p>}

      {/* Schritt 2: Maßnahmenplan */}
      {lauf.massnahmen.length > 0 && !laeuft && <Massnahmenplan lauf={lauf} von={von} onWerkzeug={onWerkzeug} />}

      {/* Was wurde geprüft */}
      {gesamt > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <button onClick={() => setGeprueftOffen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-foreground">
            {geprueftOffen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Was wurde geprüft ({gesamt})
            <span className="ml-auto font-normal text-muted-foreground">{lauf.pruefungen.filter(p => p.status === 'ok').length} ohne Befund · {lauf.pruefungen.filter(p => p.status === 'auffaellig').length} auffällig · {lauf.pruefungen.filter(p => p.status === 'fehler').length} Fehler · {lauf.pruefungen.filter(p => p.status === 'uebersprungen').length} übersprungen</span>
          </button>
          {geprueftOffen && (
            <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-1" data-volldiagnose-geprueft>
              {lauf.pruefungen.map(p => (
                <div key={p.id} className="flex items-start gap-1.5 text-[11px]" title={p.punkte?.map(x => `${x.t}: ${x.x || x.s}`).join('\n')}>
                  {p.status === 'ok' ? <CheckCircle size={12} className="text-emerald-500 mt-px" /> : p.status === 'auffaellig' ? <AlertTriangle size={12} className="text-amber-500 mt-px" /> : p.status === 'fehler' ? <XCircle size={12} className="text-red-500 mt-px" /> : p.status === 'laeuft' ? <Loader size={12} className="animate-spin mt-px" /> : <span className="w-3 h-3 rounded-full border border-muted-foreground/40 mt-px" />}
                  <span className="text-foreground">{p.titel}</span>
                  <span className="text-muted-foreground">{p.grund ? `– ${p.grund}` : p.dauerMs ? `${Math.round(p.dauerMs / 1000)} s` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function WinrmKnopf({ host, von, onFertig }: { host: string; von: string; onFertig: (fehler: string) => void }) {
  const [frage, setFrage] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  if (!frage) return <button onClick={() => setFrage(true)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-semibold">WinRM am PC einschalten …</button>
  return (
    <div className="text-xs space-y-1.5">
      <p className="text-foreground">Das ist ein <b>Eingriff</b>: Der Dienst WinRM (Fernverwaltung) wird auf {host.toUpperCase()} gestartet bzw. eingeschaltet. Danach startet die Diagnose neu.</p>
      <div className="flex gap-2">
        <button onClick={() => setFrage(false)} className="px-3 py-1 rounded-md border border-border">Abbrechen</button>
        <button disabled={laeuft} onClick={async () => { setLaeuft(true); const f = await useVollDiagnoseStore.getState().winrmAn(host, von); setLaeuft(false); onFertig(f) }} className="px-3 py-1 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50">{laeuft ? 'wird eingeschaltet …' : 'Ja, einschalten'}</button>
      </div>
    </div>
  )
}

function BefundListe({ titel, liste, kinder, lauf, onWerkzeug }: { titel: string; liste: VdBefund[]; kinder: (id: string) => VdBefund[]; lauf: VdLauf; onWerkzeug: (id: string, host: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden" data-volldiagnose-befunde>
      <div className="px-4 py-2.5 border-b border-border bg-muted/20 text-sm font-semibold text-foreground">{titel} ({liste.length})</div>
      <div className="divide-y divide-border/60">
        {liste.map(b => <BefundKarte key={b.id} b={b} kinder={kinder} lauf={lauf} onWerkzeug={onWerkzeug} tiefe={0} />)}
      </div>
    </div>
  )
}

function BefundKarte({ b, kinder, lauf, onWerkzeug, tiefe }: { b: VdBefund; kinder: (id: string) => VdBefund[]; lauf: VdLauf; onWerkzeug: (id: string, host: string) => void; tiefe: number }) {
  const [offen, setOffen] = useState(b.schwere !== 'hinweis' && tiefe === 0)
  const k = kinder(b.id)
  const ursache = b.folgeVon ? lauf.ursachen.find(u => u.id === b.folgeVon) : undefined
  const server = lauf.ziel?.geraet === 'server'
  return (
    <div className={`px-4 py-2.5 ${tiefe ? 'ml-5 border-l-2 border-primary/30 pl-3' : ''}`} data-befund={b.typ}>
      <div className="flex items-start gap-2">
        {SCHWERE_ICON(b.schwere)}
        <button onClick={() => setOffen(o => !o)} className="flex-1 min-w-0 text-left">
          <span className="text-sm font-medium text-foreground">{b.titel}</span>
          <span className="ml-2 inline-flex gap-1 align-middle flex-wrap">
            <span className="text-[10px] px-1.5 rounded bg-muted text-muted-foreground">{BEREICH_TEXT[b.bereich]}</span>
            {b.neu && <span className="text-[10px] px-1.5 rounded bg-sky-600 text-white">neu</span>}
            {b.ursacheOffen && <span className="text-[10px] px-1.5 rounded border border-amber-500/50 text-amber-600">Ursache offen</span>}
            {ursache && <span className="text-[10px] px-1.5 rounded border border-border text-muted-foreground" title={ursache.titel}>Folge: {ursache.titel}</span>}
            {b.nach === 'behoben' && <span className="text-[10px] px-1.5 rounded bg-emerald-600 text-white">behoben</span>}
            {b.nach === 'offen' && <span className="text-[10px] px-1.5 rounded bg-red-600 text-white">noch vorhanden</span>}
          </span>
        </button>
        {offen ? <ChevronDown size={14} className="text-muted-foreground mt-0.5" /> : <ChevronRight size={14} className="text-muted-foreground mt-0.5" />}
      </div>
      {offen && (
        <div className="mt-1.5 ml-6 space-y-2 text-xs">
          <p className="text-foreground">{b.text}</p>
          {b.belege.length > 0 && <ul className="list-disc ml-4 text-muted-foreground space-y-0.5">{b.belege.slice(0, 8).map((x, i) => <li key={i} className="break-words">{x}</li>)}</ul>}
          {/* Vertiefen / Fachdiagnose */}
          {(b.vertiefungen.length > 0 || (b.fachdiagnose && !server)) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {b.vertiefungen.map(v => {
                const d = VERTIEFUNGEN[v]
                if (!d) return null
                const laeuft = lauf.vertiefungLaeuft.includes(v)
                const fertig = lauf.vertiefungFertig.includes(v)
                return (
                  <button key={v} disabled={laeuft || !!lauf.ausfuehrung?.laeuft} onClick={() => void useVollDiagnoseStore.getState().vertiefe(lauf.host, v)} data-vertiefen={v}
                    title={`${d.beschreibung} (${d.dauer}, liest nur)`}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium ${d.last === 'schwer' ? 'border-amber-500/50 text-amber-700 hover:bg-amber-500/10' : 'border-primary/40 text-primary hover:bg-primary/10'} disabled:opacity-50`}>
                    {laeuft ? <Loader size={11} className="animate-spin" /> : fertig ? <CheckCircle size={11} /> : <Search size={11} />}
                    {fertig ? 'Erneut: ' : 'Vertiefen: '}{d.titel} <span className="text-muted-foreground font-normal">({d.dauer})</span>
                  </button>
                )
              })}
              {b.fachdiagnose && !server && (
                <button onClick={() => onWerkzeug(b.fachdiagnose!, lauf.host)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-600 text-white text-[11px] font-semibold hover:bg-sky-700">In der {FACH_TEXT[b.fachdiagnose]} weiter untersuchen<ArrowRight size={11} /></button>
              )}
            </div>
          )}
          {/* Lösungswege */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Lösungsweg{b.loesungen.length > 1 ? 'e' : ''}</p>
            {b.loesungen.map((l, i) => (
              <div key={l.id + i} className="flex items-start gap-1.5">
                <span className={`text-[10px] px-1.5 rounded shrink-0 mt-px ${ausfuehrbar(l) ? 'bg-primary/15 text-primary' : l.art === 'werkzeug' ? 'bg-sky-500/15 text-sky-700' : 'bg-muted text-muted-foreground'}`}>{ausfuehrbar(l) ? 'im Tool' : l.art === 'werkzeug' ? 'Werkzeug' : 'Handarbeit'}</span>
                <div className="flex-1 min-w-0"><span className="text-foreground font-medium">{l.titel}</span>{l.wirkung ? <span className="text-muted-foreground"> – {l.wirkung}</span> : null}</div>
                {l.art === 'werkzeug' && l.werkzeug && <button onClick={() => onWerkzeug(l.werkzeug!, lauf.host)} className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-sky-500/40 text-sky-700 hover:bg-sky-500/10 text-[11px]">öffnen<ArrowRight size={10} /></button>}
              </div>
            ))}
            {b.loesungen.some(ausfuehrbar) && <p className="text-[10px] text-muted-foreground">Ausführen über den Maßnahmenplan unten – erst nach deiner Bestätigung.</p>}
          </div>
        </div>
      )}
      {k.map(c => <BefundKarte key={c.id} b={c} kinder={kinder} lauf={lauf} onWerkzeug={onWerkzeug} tiefe={tiefe + 1} />)}
    </div>
  )
}

// ══ Schritt 2: Maßnahmenplan ══════════════════════════════════════════════════
function Massnahmenplan({ lauf, von, onWerkzeug }: { lauf: VdLauf; von: string; onWerkzeug: (id: string, host: string) => void }) {
  const st = useVollDiagnoseStore.getState()
  const [bestaetigen, setBestaetigen] = useState(false)
  const server = lauf.ziel?.geraet === 'server'
  const ausf = lauf.massnahmen.filter(m => ausfuehrbar(m.loesung))
  const hand = lauf.massnahmen.filter(m => !ausfuehrbar(m.loesung))
  const gewaehlt = ausf.filter(m => m.gewaehlt && !m.gesperrt && m.status !== 'ok')
  const fehlend = gewaehlt.map(m => ({ m, f: fehlendeEingabe(m) })).filter(x => x.f)
  const laeuft = !!lauf.ausfuehrung?.laeuft
  const befundTitel = (m: VdMassnahme) => lauf.befunde.filter(b => m.befunde.includes(b.id)).map(b => b.titel)
  return (
    <div className="rounded-lg border-2 border-primary/40 bg-card" data-volldiagnose-plan>
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-bold text-foreground">Schritt 2: Maßnahmenplan</p>
        <p className="text-[11px] text-muted-foreground">Empfehlungen in sinnvoller Reihenfolge. Vorab angehakt sind nur unkritische, empfohlene Schritte{server ? ' – auf Servern nichts' : ''}. <b className="text-foreground">Ausgeführt wird erst nach deiner Bestätigung.</b> Danach prüft das Tool nach.</p>
      </div>
      <div className="divide-y divide-border/60">
        {ausf.map(m => {
          const risiko = risikoVon(m.loesung)
          const brauchtEingabe = !!m.loesung.frage || (m.loesung.schritte || []).some(s => (s.param || '').includes('{eingabe}'))
          return (
            <div key={m.id} className={`px-4 py-2.5 ${m.gesperrt ? 'opacity-60' : ''}`} data-massnahme={m.loesung.id}>
              <div className="flex items-start gap-2">
                <input type="checkbox" checked={m.gewaehlt && !m.gesperrt} disabled={!!m.gesperrt || laeuft || m.status === 'ok'} onChange={e => st.setzeMassnahme(lauf.host, m.id, { gewaehlt: e.target.checked })} className="mt-0.5 w-3.5 h-3.5 accent-primary" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-1.5 rounded bg-muted text-muted-foreground">{PHASE_TEXT[m.loesung.phase]}</span>
                    <span className="text-sm font-medium text-foreground">{m.loesung.titel}</span>
                    {risiko === 'kritisch' && <span className="text-[10px] px-1.5 rounded bg-red-600 text-white">kritisch</span>}
                    {m.loesung.neustart && <span className="text-[10px] px-1.5 rounded border border-amber-500/50 text-amber-700">braucht Neustart</span>}
                    {m.loesung.dauer && <span className="text-[10px] text-muted-foreground">{m.loesung.dauer}</span>}
                    {m.empfohlen && !m.gesperrt && <span className="text-[10px] px-1.5 rounded bg-emerald-600 text-white">empfohlen</span>}
                    {m.status === 'laeuft' && <Loader size={12} className="animate-spin text-primary" />}
                    {m.status === 'ok' && <CheckCircle size={13} className="text-emerald-500" />}
                    {m.status === 'fehler' && <XCircle size={13} className="text-red-500" />}
                    {m.nachpruefung === 'behoben' && <span className="text-[10px] px-1.5 rounded bg-emerald-600 text-white">behoben</span>}
                    {m.nachpruefung === 'offen' && <span className="text-[10px] px-1.5 rounded bg-red-600 text-white">noch vorhanden</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{m.loesung.wirkung}</p>
                  <p className="text-[10px] text-muted-foreground">wegen: {befundTitel(m).slice(0, 3).join(' · ')}{befundTitel(m).length > 3 ? ` +${befundTitel(m).length - 3}` : ''}</p>
                  {m.gesperrt && <p className="text-[11px] text-amber-600 flex items-center gap-1"><Lock size={11} />{m.gesperrt}</p>}
                  {brauchtEingabe && !m.gesperrt && (
                    <input value={m.eingabe || ''} disabled={laeuft || m.status === 'ok'} onChange={e => st.setzeMassnahme(lauf.host, m.id, { eingabe: e.target.value })} placeholder={m.loesung.frage?.platzhalter || 'Eingabe'}
                      className={`mt-1 w-72 max-w-full px-2 py-1 text-xs rounded border bg-background ${m.gewaehlt && !(m.eingabe || '').trim() ? 'border-amber-500' : 'border-border'}`} title={m.loesung.frage?.label} />
                  )}
                  {m.fehler && <p className="text-[11px] text-red-500">{m.fehler}</p>}
                  {m.nachText && <p className="text-[11px] text-muted-foreground">{m.nachText}</p>}
                  {m.zeilen && m.zeilen.length > 0 && <pre className="mt-1 p-2 rounded bg-muted/30 text-[10px] text-muted-foreground max-h-32 overflow-auto whitespace-pre-wrap font-mono">{m.zeilen.join('\n')}</pre>}
                </div>
              </div>
            </div>
          )
        })}
        {hand.length > 0 && (
          <div className="px-4 py-2.5 space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Werkzeuge und Handarbeit</p>
            {hand.map(m => (
              <div key={m.id} className="flex items-start gap-2 text-xs">
                <span className={`text-[10px] px-1.5 rounded shrink-0 ${m.loesung.art === 'werkzeug' ? 'bg-sky-500/15 text-sky-700' : 'bg-muted text-muted-foreground'}`}>{m.loesung.art === 'werkzeug' ? 'Werkzeug' : 'Handarbeit'}</span>
                <div className="flex-1 min-w-0"><span className="font-medium text-foreground">{m.loesung.titel}</span><span className="text-muted-foreground"> – {m.loesung.hinweis || m.loesung.wirkung}</span></div>
                {m.loesung.art === 'werkzeug' && m.loesung.werkzeug && <button onClick={() => onWerkzeug(m.loesung.werkzeug!, lauf.host)} className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-sky-500/40 text-sky-700 hover:bg-sky-500/10 text-[11px]">öffnen<ArrowRight size={10} /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-border flex items-center gap-2 flex-wrap">
        {fehlend.length > 0 && <span className="text-[11px] text-amber-600">Eingabe fehlt: {fehlend.map(x => `${x.m.loesung.titel} (${x.f})`).join(', ')}</span>}
        {lauf.ausfuehrung?.nachpruefung === 'laeuft' && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Loader size={11} className="animate-spin" />Nachprüfung läuft …</span>}
        {lauf.ausfuehrung?.neustartAusgeloest && <span className="text-[11px] text-amber-600">Neustart angekündigt – nach dem Neustart bitte eine neue Diagnose starten (Nachprüfung).</span>}
        <button disabled={!gewaehlt.length || !!fehlend.length || laeuft} onClick={() => setBestaetigen(true)} data-massnahmen-ausfuehren
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
          {laeuft ? <Loader size={14} className="animate-spin" /> : <Zap size={14} />}{laeuft ? 'Maßnahmen laufen …' : `Ausgewählte Maßnahmen ausführen (${gewaehlt.length}) …`}
        </button>
      </div>
      {bestaetigen && <Bestaetigung lauf={lauf} auswahl={gewaehlt} onAbbruch={() => setBestaetigen(false)} onJa={() => { setBestaetigen(false); void st.ausfuehren(lauf.host, von) }} />}
    </div>
  )
}

function Bestaetigung({ lauf, auswahl, onAbbruch, onJa }: { lauf: VdLauf; auswahl: VdMassnahme[]; onAbbruch: () => void; onJa: () => void }) {
  const server = lauf.ziel?.geraet === 'server'
  const [name, setName] = useState('')
  const kurzHost = lauf.host.toUpperCase().split('.')[0]
  const ok = !server || name.trim().toUpperCase() === kurzHost || name.trim().toUpperCase() === lauf.host.toUpperCase()
  const neustart = auswahl.some(m => m.loesung.id === 'neustart' || m.loesung.neustart)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onAbbruch}>
      <div className="bg-card border border-border rounded-xl p-5 w-[560px] max-w-full max-h-[85vh] overflow-y-auto shadow-2xl space-y-3" onClick={e => e.stopPropagation()} data-volldiagnose-bestaetigung>
        <div className="flex items-center gap-2"><Zap size={16} className="text-primary" /><h3 className="text-sm font-bold text-foreground">Eingriff bestätigen</h3></div>
        <p className="text-xs text-foreground">Diese {auswahl.length} Maßnahme(n) werden auf <b className="font-mono">{lauf.host.toUpperCase()}</b>{server ? ' (Server)' : ''} nacheinander ausgeführt. Jede wird protokolliert (Aktivitätsprotokoll und Geräte-Dossier).</p>
        <ol className="list-decimal ml-5 space-y-1 text-xs">
          {auswahl.map(m => (
            <li key={m.id}><span className="font-medium text-foreground">{m.loesung.titel}{m.eingabe ? ` (${m.eingabe})` : ''}</span>{risikoVon(m.loesung) === 'kritisch' && <span className="ml-1 text-[10px] px-1 rounded bg-red-600 text-white">kritisch</span>}<br /><span className="text-muted-foreground">{m.loesung.wirkung}{m.loesung.dauer ? ` · ${m.loesung.dauer}` : ''}</span></li>
          ))}
        </ol>
        <p className="text-[11px] text-muted-foreground">Angemeldet: {lauf.ziel?.benutzer || 'niemand'}{neustart ? ' · Achtung: Neustart enthalten bzw. danach nötig – angemeldete Benutzer bekommen 5 Minuten Vorwarnung.' : ''}</p>
        {server && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Server: zum Bestätigen den Namen eintippen</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder={kurzHost} data-server-bestaetigung className={`w-full px-2.5 py-1.5 text-sm rounded-md border bg-background font-mono ${ok ? 'border-emerald-500' : 'border-border'}`} />
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onAbbruch} className="flex-1 py-2 text-xs rounded-md border border-border hover:bg-accent">Abbrechen</button>
          <button disabled={!ok} onClick={onJa} data-bestaetigen-ja className="flex-1 py-2 text-xs rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-40">Jetzt ausführen</button>
        </div>
      </div>
    </div>
  )
}

