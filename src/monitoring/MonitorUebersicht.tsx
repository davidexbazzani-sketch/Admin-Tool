// ── PC-Diagnose → „Überwachung über Zeit“: alle Überwachungen ────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowLeft, Plus, RefreshCw, Loader2, ChevronDown, Square, Trash2, Clock, Wifi, CheckCircle2, AlertTriangle, Mail, MessageCircle, Server } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useMonitorDialog } from '../store/monitorDialogStore'
import { onAppFocus } from '../utils/appFocus'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import { PersonInfoButton } from '../components/person/PersonDossier'
import { auswahlText } from './kontrollen'
import { dauerText, zeitText } from './auswertung'
import { effektivesEnde, NACHLAUF_MS } from './runner'
import { ladeAuftraege, ladeZustand, leseSperre, loescheUeberwachung, speichereAuftrag, SPERRE_MS, type Sperre } from './store'
import { pruefeJetzt } from './MonitorController'
import type { MonAuftrag, MonZustand } from './types'
import type { NetLauf } from '../netCheck/types'
import NetAnalyse from '../netCheck/NetAnalyse'

type Status = 'laeuft' | 'wartet' | 'abschluss' | 'beendet' | 'abgebrochen'
function statusVon(a: MonAuftrag, z: MonZustand | undefined): Status {
  if (z?.abschluss) return a.abgebrochenAm ? 'abgebrochen' : 'beendet'
  if (Date.now() >= effektivesEnde(a)) return 'abschluss'
  return z?.erreichbar.nichtSeit ? 'wartet' : 'laeuft'
}
const STATUS: Record<Status, { text: string; cls: string }> = {
  laeuft: { text: 'läuft', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40' },
  wartet: { text: 'PC nicht erreichbar', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/40' },
  abschluss: { text: 'Abschluss folgt', cls: 'bg-sky-500/15 text-sky-600 border-sky-500/40' },
  beendet: { text: 'beendet', cls: 'bg-muted/50 text-muted-foreground border-border' },
  abgebrochen: { text: 'vorzeitig beendet', cls: 'bg-muted/50 text-muted-foreground border-border' },
}

export default function MonitorUebersicht({ onBack }: { onBack?: () => void }) {
  const user = useAuthStore(s => s.session?.user)
  const oeffne = useMonitorDialog(s => s.oeffne)
  const dialogOffen = useMonitorDialog(s => s.offen)
  const [auftraege, setAuftraege] = useState<MonAuftrag[]>([])
  const [zustaende, setZustaende] = useState<Record<string, MonZustand>>({})
  const [sperre, setSperre] = useState<Sperre | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [nurMeine, setNurMeine] = useState(true)
  const [offen, setOffen] = useState<Set<string>>(new Set())
  const [meldung, setMeldung] = useState('')
  const [netLauf, setNetLauf] = useState<NetLauf | null>(null)

  const laden = useCallback(async () => {
    const [a, s] = await Promise.all([ladeAuftraege(), leseSperre()])
    const z: Record<string, MonZustand> = {}
    for (const x of a) z[x.id] = await ladeZustand(x.id)
    setAuftraege(a); setZustaende(z); setSperre(s); setLaedt(false)
  }, [])

  useEffect(() => {
    void laden()
    const t = setInterval(() => { if (document.hasFocus()) void laden() }, 30_000)
    const ab = onAppFocus(() => void laden(), 20_000)
    return () => { clearInterval(t); ab() }
  }, [laden])
  useEffect(() => { if (!dialogOffen) void laden() }, [dialogOffen, laden])

  const ich = (user?.username || '').toLowerCase()
  const darf = (a: MonAuftrag) => a.erstelltVon.username.toLowerCase() === ich || user?.role === 'master_admin'
  const liste = useMemo(() => {
    const l = auftraege.filter(a => !nurMeine || a.erstelltVon.username.toLowerCase() === ich)
    const rang: Record<Status, number> = { wartet: 0, laeuft: 1, abschluss: 2, beendet: 3, abgebrochen: 4 }
    return l.sort((a, b) => rang[statusVon(a, zustaende[a.id])] - rang[statusVon(b, zustaende[b.id])] || b.erstelltAm.localeCompare(a.erstelltAm))
  }, [auftraege, zustaende, nurMeine, ich])

  const sperreFrisch = sperre && Date.now() - Date.parse(sperre.am) < SPERRE_MS
  const toggle = (id: string) => setOffen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function jetzt(a: MonAuftrag) { setMeldung(`${a.host}: wird geprüft …`); setMeldung(`${a.host}: ${await pruefeJetzt(a.id)}`); void laden() }
  async function beenden(a: MonAuftrag) { await speichereAuftrag({ ...a, abgebrochenAm: new Date().toISOString(), abgebrochenVon: user?.displayName || user?.username }); setMeldung(`${a.host}: wird beendet — die Zusammenfassung kommt mit der nächsten Prüfung.`); void pruefeJetzt(a.id).then(() => laden()) }
  async function verlaengern(a: MonAuftrag, tage: number) { const neu = new Date(Math.max(Date.parse(a.bis), Date.now()) + tage * 86400_000); await speichereAuftrag({ ...a, bis: neu.toISOString() }); setMeldung(`${a.host}: verlängert bis ${zeitText(neu.toISOString())}.`); void laden() }
  async function loeschen(a: MonAuftrag) { await loescheUeberwachung(a.id); setMeldung(`${a.host}: Überwachung gelöscht.`); void laden() }
  async function wlanAnalyse(pfad: string) { const { loadLauf } = await import('../netCheck/store'); const l = await loadLauf(pfad); if (l) setNetLauf(l); else setMeldung('Die gespeicherte WLAN-Analyse wurde nicht gefunden.') }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto p-6" data-monitor-uebersicht>
      <div className="flex items-center gap-3 flex-wrap">
        {onBack && <button onClick={onBack} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground" title="Zurück"><ArrowLeft size={18} /></button>}
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Activity size={22} className="text-primary" />Überwachung über Zeit</h1>
        <button onClick={() => oeffne()} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold"><Plus size={15} />Neue Überwachung</button>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Server size={13} />{sperreFrisch ? <>Geprüft wird gerade von <b className="text-foreground">{sperre!.von}</b>{sperre!.rechner ? ` (${sperre!.rechner})` : ''}</> : 'Gerade prüft kein Rechner — die Überwachung läuft, sobald das Tool irgendwo offen ist, und holt die Zeit dann nach.'}</span>
        <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={nurMeine} onChange={e => setNurMeine(e.target.checked)} className="accent-primary" />nur meine</label>
        <button onClick={() => void laden()} className="inline-flex items-center gap-1 hover:text-foreground"><RefreshCw size={12} />aktualisieren</button>
      </div>
      {meldung && <div className="text-xs text-foreground bg-muted/30 border border-border rounded px-3 py-2">{meldung}</div>}
      {laedt ? <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Lade Überwachungen …</p>
        : !liste.length ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
            <Activity size={28} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-foreground">{nurMeine ? 'Du hast noch keine Überwachung angelegt.' : 'Noch keine Überwachungen.'}</p>
            <p className="text-xs text-muted-foreground">Beispiel: PC mit WLAN-Aussetzern bis Montag 18:00 beobachten — bei jedem Aussetzer kommt eine Meldung, am Ende die Ursachen-Analyse.</p>
            <button onClick={() => oeffne()} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 text-primary text-xs"><Plus size={13} />Überwachung einrichten</button>
          </div>
        ) : (
          <div className="space-y-3">
            {liste.map(a => {
              const z = zustaende[a.id]
              const st = statusVon(a, z)
              const v = Date.parse(a.von), e = effektivesEnde(a)
              const anteil = Math.max(0, Math.min(1, (Date.now() - v) / Math.max(1, e - v)))
              const probleme = (z?.treffer || []).filter(t => t.schwere !== 'info')
              const ist = offen.has(a.id)
              return (
                <div key={a.id} className="rounded-lg border border-border bg-card" data-monitor-karte>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-foreground">{a.host}</span><DeviceInfoButton hostname={a.host} serial={a.serial} />
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS[st].cls}`}>{STATUS[st].text}</span>
                      {probleme.length > 0 ? <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle size={12} />{probleme.length} Treffer</span>
                        : z && z.erfolgreich > 0 && <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={12} />bisher unauffällig</span>}
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">von {a.erstelltVon.displayName}<PersonInfoButton name={a.erstelltVon.displayName} /></span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock size={12} />{zeitText(a.von)} – {zeitText(new Date(e).toISOString())}
                      {st === 'laeuft' || st === 'wartet' ? <span>· noch {dauerText(e - Date.now())}</span> : null}
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[80px]"><div className={`h-full ${st === 'beendet' || st === 'abgebrochen' ? 'bg-muted-foreground/40' : 'bg-primary'}`} style={{ width: `${Math.round(anteil * 100)}%` }} /></div>
                    </div>
                    <div className="flex flex-wrap gap-1">{a.kontrollen.map(k => <span key={k.id + (k.param || '')} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 border border-border text-muted-foreground">{auswahlText(k)}</span>)}</div>
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                      <span>{z?.erfolgreich || 0} von {z?.pruefungen || 0} Prüfungen gelesen</span>
                      {z?.letztePruefung && <span>zuletzt {zeitText(z.letztePruefung)}</span>}
                      {z?.naechstePruefung && !z.abschluss && <span>nächste {zeitText(z.naechstePruefung)}</span>}
                      {z?.erreichbar.nichtSeit && <span className="text-amber-600">nicht erreichbar seit {zeitText(z.erreichbar.nichtSeit)}</span>}
                      {z?.letzterFehler && <span className="text-red-500">Fehler: {z.letzterFehler.slice(0, 120)}</span>}
                      {a.anlass && <span>Anlass: {a.anlass}</span>}
                      <span className="inline-flex items-center gap-1"><MessageCircle size={11} />Chat{a.mail ? <> + <Mail size={11} />{a.mailAn}</> : ''}</span>
                    </div>
                    {z?.abschluss && (
                      <div className={`rounded-md border p-2.5 text-xs ${z.abschluss.titel.includes('keine Probleme') ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'}`} data-monitor-abschluss>
                        <p className="font-semibold text-foreground">{z.abschluss.titel}</p>
                        {z.abschluss.ursachen.slice(0, 4).map((u, i) => <p key={i} className="text-muted-foreground">• {u}</p>)}
                        {z.abschluss.netLaufPfad && <button onClick={() => void wlanAnalyse(z.abschluss!.netLaufPfad!)} className="mt-1.5 inline-flex items-center gap-1 text-primary hover:underline"><Wifi size={12} />WLAN-Ursachen-Analyse öffnen</button>}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => toggle(a.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronDown size={13} className={ist ? 'rotate-180' : ''} />Verlauf{z ? ` (${z.treffer.length} Ereignisse, ${z.meldungen.length} Meldungen)` : ''}</button>
                      {!z?.abschluss && <button onClick={() => void jetzt(a)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent/30"><RefreshCw size={12} />Jetzt prüfen</button>}
                      {!z?.abschluss && darf(a) && <button onClick={() => void verlaengern(a, 1)} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent/30">+1 Tag</button>}
                      {!z?.abschluss && !a.abgebrochenAm && darf(a) && <button onClick={() => void beenden(a)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent/30"><Square size={11} />Beenden</button>}
                      {z?.abschluss && darf(a) && <button onClick={() => void loeschen(a)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-red-500"><Trash2 size={12} />Löschen</button>}
                      {st === 'abschluss' && z?.endeGemeldet && <span className="text-[11px] text-muted-foreground">wartet bis {zeitText(new Date(e + NACHLAUF_MS).toISOString())} auf den PC</span>}
                    </div>
                  </div>
                  {ist && z && (
                    <div className="border-t border-border p-3 space-y-3 text-xs">
                      {z.abschluss && <pre className="whitespace-pre-wrap font-sans text-foreground bg-muted/20 rounded p-2 max-h-72 overflow-auto">{z.abschluss.langtext}</pre>}
                      <div>
                        <p className="font-semibold text-foreground mb-1">Ereignisse ({z.treffer.length})</p>
                        {!z.treffer.length ? <p className="text-muted-foreground">Bisher nichts aufgefallen.</p> : (
                          <div className="max-h-64 overflow-auto space-y-0.5">
                            {[...z.treffer].reverse().slice(0, 150).map(t => (
                              <div key={t.key} className="flex gap-2"><span className="font-mono text-muted-foreground shrink-0">{zeitText(t.zeit)}</span>
                                <span className={t.schwere === 'kritisch' ? 'text-red-500' : t.schwere === 'warnung' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>{t.titel}</span>
                                {t.detail && <span className="text-muted-foreground truncate">— {t.detail}</span>}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      {z.erreichbar.ausfaelle.length > 0 && <div><p className="font-semibold text-foreground mb-1">Nicht erreichbar</p>{z.erreichbar.ausfaelle.map((x, i) => <p key={i} className="text-muted-foreground">{zeitText(x.von)} bis {x.bis ? zeitText(x.bis) : '…'} — {x.grund}</p>)}</div>}
                      {z.meldungen.length > 0 && <div><p className="font-semibold text-foreground mb-1">Gesendete Meldungen</p>{[...z.meldungen].reverse().slice(0, 30).map((m, i) => <p key={i} className="text-muted-foreground">{zeitText(m.at)} · {m.text}{m.mail === 'ok' ? ' · Mail gesendet' : m.mail === 'fehler' ? ` · Mail fehlgeschlagen (${m.mailFehler})` : ''}</p>)}</div>}
                      {z.hinweise?.length ? <div><p className="font-semibold text-foreground mb-1">Hinweise</p>{z.hinweise.map((h, i) => <p key={i} className="text-muted-foreground">{h}</p>)}</div> : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      {netLauf && <NetAnalyse lauf={netLauf} onClose={() => setNetLauf(null)} />}
    </div>
  )
}
