// ── Dialog „Überwachung einrichten“ (global über useMonitorDialog) ───────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, X, Search, Plus, Check, Clock, Mail, MessageCircle, Loader2, Info } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useMonitorDialog } from '../store/monitorDialogStore'
import { ensureDailyAdUsers } from '../services/adUserDirectory'
import PcSuche, { type PcWahl } from '../components/PcSuche'
import { KONTROLLEN, SCHNELLWAHL, kontrolle, sucheKontrollen } from './kontrollen'
import { zeitVorschlaege, standardBis, bisText, alsLokal, MAX_LAUFZEIT_TAGE } from './zeitraum'
import { dauerText } from './auswertung'
import { neueId, speichereAuftrag } from './store'
import { pruefeJetzt } from './MonitorController'
import type { MonAuftrag, MonAuswahl, MonKontrolle } from './types'

const SCHWERE_FARBE: Record<string, string> = { kritisch: 'text-red-500', warnung: 'text-amber-500', info: 'text-sky-500' }

export function MonitorDialogSlot() {
  const offen = useMonitorDialog(s => s.offen)
  if (!offen) return null
  return <MonitorDialog />
}

function MonitorDialog() {
  const vorlage = useMonitorDialog(s => s.vorlage)
  const schliesse = useMonitorDialog(s => s.schliesse)
  const user = useAuthStore(s => s.session?.user)
  const [pc, setPc] = useState<PcWahl | null>(vorlage?.host ? { host: vorlage.host, serial: vorlage.serial, person: vorlage.person } : null)
  const [auswahl, setAuswahl] = useState<MonAuswahl[]>(() => (vorlage?.kontrollen || []).filter(id => kontrolle(id)).map(id => ({ id })))
  const [suche, setSuche] = useState('')
  const [bis, setBis] = useState<Date>(() => vorlage?.anlass ? standardBis() : zeitVorschlaege()[2]?.bis || standardBis())
  const [intervall, setIntervall] = useState(5)
  const [mail, setMail] = useState(false)
  const [mailAn, setMailAn] = useState('')
  const [anlass, setAnlass] = useState(vorlage?.anlass || '')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState('')
  const [fertig, setFertig] = useState<MonAuftrag | null>(null)
  const sucheRef = useRef<HTMLInputElement>(null)

  // eigene Mail-Adresse aus dem AD-Verzeichnis
  useEffect(() => {
    const ids = [user?.windowsUsername, user?.corpId, user?.username].filter(Boolean).map(s => String(s).toLowerCase().split('\\').pop())
    ensureDailyAdUsers().then(r => { const u = r.dir?.users.find(x => ids.includes(x.sam.toLowerCase())); if (u?.email) setMailAn(a => a || u.email!) }).catch(() => {})
  }, [user?.windowsUsername, user?.corpId, user?.username])

  const vorschlaege = useMemo(() => zeitVorschlaege(), [])
  const treffer = useMemo(() => sucheKontrollen(suche, 14), [suche])
  const gewaehlt = new Set(auswahl.map(a => a.id))
  const toggle = (k: MonKontrolle) => setAuswahl(a => (a.some(x => x.id === k.id) ? a.filter(x => x.id !== k.id) : [...a, { id: k.id }]))
  const setParam = (id: string, param: string) => setAuswahl(a => a.map(x => (x.id === id ? { ...x, param } : x)))

  const dauer = bis.getTime() - Date.now()
  const fehltParam = auswahl.find(a => kontrolle(a.id)?.param?.pflicht && !a.param?.trim())
  const grund = !pc?.host ? 'Bitte den Ziel-PC wählen.' : !auswahl.length ? 'Bitte mindestens eine Kontrolle wählen.' : fehltParam ? `Bitte bei „${kontrolle(fehltParam.id)!.titel}“ den Wert angeben.`
    : dauer < 15 * 60_000 ? 'Das Ende muss mindestens 15 Minuten in der Zukunft liegen.' : dauer > MAX_LAUFZEIT_TAGE * 86400_000 ? `Höchstens ${MAX_LAUFZEIT_TAGE} Tage.` : mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailAn.trim()) ? 'Bitte eine gültige Mail-Adresse angeben.' : ''

  async function starten() {
    if (grund || !user) return
    setSpeichert(true); setFehler('')
    const a: MonAuftrag = {
      version: 1, id: neueId(), host: pc!.host.trim().toUpperCase(), serial: pc!.serial,
      erstelltVon: { username: user.username, displayName: user.displayName || user.username }, erstelltAm: new Date().toISOString(),
      von: new Date().toISOString(), bis: bis.toISOString(), kontrollen: auswahl, intervallMin: intervall,
      mail, mailAn: mail ? mailAn.trim() : undefined, anlass: anlass.trim() || undefined,
    }
    const ok = await speichereAuftrag(a)
    setSpeichert(false)
    if (!ok) { setFehler('Konnte nicht gespeichert werden — Netzlaufwerk erreichbar?'); return }
    setFertig(a)
    void pruefeJetzt(a.id)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={schliesse}>
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()} data-monitor-dialog>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
          <Activity size={18} className="text-primary" />
          <h2 className="text-base font-bold text-foreground">Überwachung über Zeit einrichten</h2>
          <button onClick={schliesse} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={16} /></button>
        </div>

        {fertig ? (
          <div className="p-6 space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
              <Check size={18} className="text-emerald-500 mt-0.5" />
              <div className="text-sm text-foreground space-y-1">
                <p className="font-semibold">Überwachung von {fertig.host} läuft bis {bisText(new Date(fertig.bis))}.</p>
                <p className="text-muted-foreground">Immer wenn etwas auffällt, bekommst nur du eine Chat-Nachricht von „PC-Überwachung“{fertig.mail ? ` und eine Mail an ${fertig.mailAn}` : ''}. Am Ende kommt eine Zusammenfassung mit Ursachen-Analyse — auch wenn nichts passiert ist.</p>
                <p className="text-muted-foreground text-xs">Geprüft wird von dem Rechner, auf dem das Tool gerade offen ist (einer für alle). Ist das Tool nirgends offen, holt die Überwachung die Zeit nach, sobald es wieder läuft — Ereignisprotokolle gehen nicht verloren.</p>
              </div>
            </div>
            <div className="flex justify-end"><button onClick={schliesse} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold">Schließen</button></div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* 1. Ziel-PC */}
              <section className="space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Ziel-PC</h3>
                <PcSuche wert={pc} onWahl={setPc} autoFocus={!pc} />
              </section>

              {/* 2. Was soll kontrolliert werden */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Was soll kontrolliert werden?</h3>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input ref={sucheRef} value={suche} onChange={e => setSuche(e.target.value)} placeholder="z. B. wlan, absturz, bluescreen, sap, drucker, langsam …" data-kontroll-suche
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
                {suche.trim() ? (
                  <div className="rounded-md border border-border divide-y divide-border/60 max-h-64 overflow-y-auto" data-kontroll-vorschlaege>
                    {treffer.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Keine passende Kontrolle — anderen Begriff versuchen.</p>}
                    {treffer.map(k => (
                      <button key={k.id} onClick={() => toggle(k)} className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent/30 ${gewaehlt.has(k.id) ? 'bg-primary/5' : ''}`}>
                        <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${gewaehlt.has(k.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>{gewaehlt.has(k.id) && <Check size={11} />}</span>
                        <span className="min-w-0">
                          <span className="block text-sm text-foreground">{k.titel} <span className="text-[10px] text-muted-foreground">· {k.bereich}</span></span>
                          <span className="block text-[11px] text-muted-foreground">{k.beschreibung}</span>
                        </span>
                        <span className={`ml-auto text-[10px] shrink-0 ${SCHWERE_FARBE[k.schwere]}`}>{k.schwere}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {SCHNELLWAHL.map(s => (
                      <button key={s.titel} onClick={() => setAuswahl(a => { const neu = s.ids.filter(id => !a.some(x => x.id === id)).map(id => ({ id })); return [...a, ...neu] })}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary/50 hover:bg-accent/30 text-foreground"><Plus size={11} />{s.titel}</button>
                    ))}
                  </div>
                )}
                {auswahl.length > 0 && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1" data-kontroll-auswahl>
                    <p className="text-[11px] text-muted-foreground">{auswahl.length} Kontrolle{auswahl.length === 1 ? '' : 'n'} gewählt</p>
                    {auswahl.map(a => { const k = kontrolle(a.id)!; return (
                      <div key={a.id} className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-foreground">{k.titel}</span>
                        <span className="text-[10px] text-muted-foreground">· {k.bereich}</span>
                        {k.param && <input value={a.param || ''} onChange={e => setParam(a.id, e.target.value)} placeholder={k.param.platzhalter}
                          className={`text-xs px-2 py-0.5 rounded border bg-background ${k.param.pflicht && !a.param?.trim() ? 'border-amber-500' : 'border-border'} min-w-[220px]`} />}
                        <button onClick={() => toggle(k)} className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground" title="Entfernen"><X size={12} /></button>
                      </div>
                    ) })}
                  </div>
                )}
              </section>

              {/* 3. Zeitraum */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Wie lange?</h3>
                <div className="flex flex-wrap gap-1.5">
                  {vorschlaege.map(v => (
                    <button key={v.id} onClick={() => setBis(v.bis)}
                      className={`text-xs px-2.5 py-1 rounded-md border ${Math.abs(v.bis.getTime() - bis.getTime()) < 60_000 ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-accent/30'}`}>{v.titel}</button>
                  ))}
                  <input type="datetime-local" value={alsLokal(bis)} onChange={e => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setBis(d) }}
                    className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground" />
                </div>
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Clock size={12} />Läuft ab jetzt bis <span className="text-foreground font-medium">{bisText(bis)}</span>{dauer > 0 && <> ({dauerText(dauer)})</>} · Prüfung alle
                  <select value={intervall} onChange={e => setIntervall(Number(e.target.value))} className="text-xs px-1 py-0.5 rounded border border-border bg-background text-foreground">
                    {[2, 5, 10, 15, 30].map(n => <option key={n} value={n}>{n} min</option>)}
                  </select>
                </p>
              </section>

              {/* 4. Meldung */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">4 · Meldung — nur an dich</h3>
                <p className="text-xs text-foreground inline-flex items-center gap-1.5"><MessageCircle size={13} className="text-primary" />Chat-Nachricht an <b>{user?.displayName || user?.username}</b> (Popup im Tool bzw. Windows-Benachrichtigung) — bei jedem Treffer und am Ende.</p>
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={mail} onChange={e => setMail(e.target.checked)} className="accent-primary" />
                  <Mail size={13} className="text-primary" />zusätzlich per E-Mail an
                  <input value={mailAn} onChange={e => setMailAn(e.target.value)} disabled={!mail} placeholder="vorname.nachname@firma.com"
                    className="flex-1 min-w-[220px] text-xs px-2 py-1 rounded border border-border bg-background disabled:opacity-50" />
                </label>
                {mail && <p className="text-[11px] text-muted-foreground pl-6">Die Mail geht über das Outlook des Rechners, der gerade prüft.</p>}
                <input value={anlass} onChange={e => setAnlass(e.target.value)} placeholder="Anlass (optional), z. B. „Nach Behebung: Netzwerk im Standby eingeschaltet“"
                  className="w-full text-xs px-2.5 py-1.5 rounded border border-border bg-background text-foreground" />
              </section>
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" />Rein lesend: Die Überwachung liest Ereignisprotokolle, Dienst-Zustände und Messwerte des PCs — sie ändert nichts. Verpasste Zeiträume (Tool nirgends offen, PC aus) werden aus den Protokollen nachgeholt.</p>
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground">{fehler || grund || `${KONTROLLEN.length} Kontrollen verfügbar`}</span>
              <button onClick={() => void starten()} disabled={!!grund || speichert} data-monitor-starten
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40">
                {speichert ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}Überwachung starten
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
