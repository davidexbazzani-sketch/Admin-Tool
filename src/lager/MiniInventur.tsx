// „Lager einsehen“ — Mini-Inventur: ServiceNow-Liste importieren → Soll je Fach → Fächer durchgehen
// („stimmt“ oder gezählte Stückzahl) → Abweichungen rot im Raum → abschließen.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, ChevronRight, ClipboardCheck, FileSpreadsheet, Loader2, RotateCcw, X } from 'lucide-react'
import { openFileForImport, parseExcelSheet } from '../utils/fileImport'
import { ortName } from './aufbau'
import type { LagerModell } from './bestand'
import { TypPunkt, type InventurInfo } from './FachDetails'
import {
  ZAEHL_ORTE, abgleich, berechneSoll, erkenneSpalten, summe, unterschied, zeilenAusTabelle,
  type MiniInventurDatei, type Stueck,
} from './inventur'
import { ladeInventur, ladeZeiger, letzteAusblenden, schliesseAb, speichereZaehlung, starteInventur, type Zeiger } from './inventurSpeicher'
import { TYP_LABEL, TYP_REIHE, type OrtId, type RohGeraet } from './typen'

interface Props {
  modell: LagerModell
  currentUser: string
  auswahl: OrtId | null
  onZeige: (ort: OrtId) => void
  onMarkierungen: (m: Map<OrtId, InventurInfo> | null) => void
  onSchliessen: () => void
  onLagerlisteNeu: () => void
}

interface Vorschau { datei: string; zeilen: RohGeraet[]; fehlt: string[]; soll: ReturnType<typeof berechneSoll> }

const zeit = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

export default function MiniInventur({ currentUser, auswahl, onZeige, onMarkierungen, onSchliessen, onLagerlisteNeu }: Props) {
  const [zeiger, setZeiger] = useState<Zeiger | null>(null)
  const [inv, setInv] = useState<MiniInventurDatei | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState('')
  const [vorschau, setVorschau] = useState<Vorschau | null>(null)
  const [arbeitet, setArbeitet] = useState('')
  const [ist, setIst] = useState<Stueck>({})
  const [notiz, setNotiz] = useState('')
  const [sicher, setSicher] = useState<'' | 'abschliessen' | 'verwerfen'>('')
  const [zeigeLetzte, setZeigeLetzte] = useState(true)

  const neuLaden = useCallback(async () => {
    const z = await ladeZeiger()
    if (!z) { setFehler('Netzlaufwerk nicht erreichbar.'); setLaedt(false); return }
    setZeiger(z)
    setInv(z.aktiv ? await ladeInventur(z.aktiv.id) : null)
    setLaedt(false)
  }, [])
  useEffect(() => { void neuLaden() }, [neuLaden])

  // Mitzählen anderer: alle 20 s nachsehen (nur bei offener Inventur und aktivem Fenster)
  useEffect(() => {
    if (!inv || inv.status !== 'offen') return
    const t = setInterval(() => {
      if (!document.hasFocus()) return
      void ladeInventur(inv.id).then(f => { if (f && JSON.stringify(f.zaehlung) !== JSON.stringify(inv.zaehlung)) setInv(f) })
    }, 20000)
    return () => clearInterval(t)
  }, [inv])

  const stand = useMemo(() => (inv ? abgleich(inv) : null), [inv])
  useEffect(() => {
    if (stand) onMarkierungen(stand)
    else if (zeiger?.letzte && zeigeLetzte) onMarkierungen(new Map(zeiger.letzte.abweichungen.map(a => [a.ort, { zustand: 'abweichung' as const, text: a.text.replace(/^[^:]+:\s*/, '') }])))
    else onMarkierungen(null)
  }, [stand, zeiger, zeigeLetzte, onMarkierungen])
  useEffect(() => () => onMarkierungen(null), [onMarkierungen])

  // aktueller Ort: Auswahl im Raum, sonst der erste offene
  const ort: OrtId | null = useMemo(() => {
    if (!inv) return null
    if (auswahl && ZAEHL_ORTE.includes(auswahl)) return auswahl
    return ZAEHL_ORTE.find(o => !inv.zaehlung[o]) ?? null
  }, [inv, auswahl])
  useEffect(() => {
    if (!inv || !ort) return
    const z = inv.zaehlung[ort]
    setIst(z ? { ...z.ist } : { ...(inv.soll[ort] || {}) })
    setNotiz(z?.notiz || '')
  }, [inv, ort])

  async function listeWaehlen() {
    setFehler('')
    try {
      const f = await openFileForImport()
      if (!f) return
      if (!['xlsx', 'xls', 'csv'].includes(f.ext)) { setFehler('Bitte eine Excel- oder CSV-Datei aus ServiceNow wählen.'); return }
      const sheet = parseExcelSheet(f.bytes)
      const spalten = erkenneSpalten(sheet.columns.map(c => c.name))
      const fehlt = [!spalten.serial && 'Serial number', !spalten.kommentar && 'Comments', !spalten.state && 'State'].filter(Boolean) as string[]
      const zeilen = zeilenAusTabelle(sheet.rows, spalten)
      const datei = f.filePath.split(/[\\/]/).pop() || f.filePath
      setVorschau({ datei, zeilen, fehlt, soll: berechneSoll(zeilen) })
    } catch (e) { setFehler(`Datei nicht lesbar: ${e instanceof Error ? e.message : String(e)}`) }
  }

  async function starten() {
    if (!vorschau) return
    setArbeitet('start'); setFehler('')
    const r = await starteInventur(vorschau.zeilen, vorschau.datei, currentUser)
    setArbeitet('')
    if (!r.ok) { setFehler(r.fehler || 'Fehler'); void neuLaden(); return }
    setVorschau(null)
    setInv(r.inventur!)
    setZeiger(await ladeZeiger())
    onLagerlisteNeu()
    const erster = ZAEHL_ORTE[0]
    onZeige(erster)
  }

  async function speichern(alsStimmt: boolean) {
    if (!inv || !ort) return
    setArbeitet('zaehlen'); setFehler('')
    const soll = inv.soll[ort] || {}
    const werte: Stueck = alsStimmt ? { ...soll } : ist
    const gleich = !unterschied(soll, werte)
    const r = await speichereZaehlung(inv.id, ort, { status: gleich ? 'stimmt' : 'abweichung', ist: werte, notiz: notiz.trim() || undefined, am: new Date().toISOString(), von: currentUser })
    setArbeitet('')
    if (!r.ok) { setFehler(r.fehler || 'Fehler'); if (r.inventur) setInv(r.inventur); return }
    setInv(r.inventur!)
    const i = ZAEHL_ORTE.indexOf(ort)
    const naechster = [...ZAEHL_ORTE.slice(i + 1), ...ZAEHL_ORTE.slice(0, i)].find(o => !r.inventur!.zaehlung[o])
    if (naechster) onZeige(naechster)
  }

  async function zuruecknehmen() {
    if (!inv || !ort) return
    setArbeitet('zaehlen')
    const r = await speichereZaehlung(inv.id, ort, null)
    setArbeitet('')
    if (!r.ok) { setFehler(r.fehler || 'Fehler'); return }
    setInv(r.inventur!)
  }

  async function beenden(verwerfen: boolean) {
    if (!inv) return
    setArbeitet('ende'); setFehler('')
    const r = await schliesseAb(inv.id, currentUser, verwerfen)
    setArbeitet(''); setSicher('')
    if (!r.ok) { setFehler(r.fehler || 'Fehler'); return }
    setInv(null)
    setZeigeLetzte(true)
    setZeiger(await ladeZeiger())
  }

  const gezaehlt = inv ? ZAEHL_ORTE.filter(o => inv.zaehlung[o]).length : 0
  const abw = stand ? [...stand.values()].filter(z => z.zustand === 'abweichung').length : 0

  return (
    <div className="flex flex-col h-full text-xs" data-lager-mini>
      <div className="px-3 py-2.5 border-b border-border flex items-start gap-2">
        <ClipboardCheck size={16} className="text-primary mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground leading-tight">Mini-Inventur</h2>
          <p className="text-[11px] text-muted-foreground">{inv ? `${inv.titel} · gestartet von ${inv.gestartetVon}, ${zeit(inv.gestartetAm)}` : 'Fächer gegen die ServiceNow-Liste zählen'}</p>
        </div>
        <button onClick={onSchliessen} className="ml-auto p-1 rounded hover:bg-accent/40 text-muted-foreground" title="Schließen (eine laufende Inventur bleibt offen)"><X size={14} /></button>
      </div>

      {fehler && <div className="mx-3 mt-2 rounded-md border border-red-600/40 bg-red-600/10 px-2.5 py-1.5 text-red-600 flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{fehler}</div>}
      {laedt && <div className="p-4 text-muted-foreground flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Lädt …</div>}

      {!laedt && !inv && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {!vorschau && (
            <>
              <p className="text-muted-foreground">Exportiere in ServiceNow die Hardware-Liste des Lagers (mit den Spalten Serial number, Model, State, Substate, Comments) als Excel und wähle sie hier. Das Tool rechnet aus, was in jedem Fach liegen soll — dann gehst du die Fächer durch.</p>
              <button onClick={() => void listeWaehlen()} data-lager-liste-waehlen className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"><FileSpreadsheet size={13} />ServiceNow-Liste wählen …</button>
            </>
          )}
          {vorschau && (
            <div className="rounded-md border border-border p-2.5 space-y-2" data-lager-vorschau>
              <div className="font-semibold text-foreground">{vorschau.datei}</div>
              {vorschau.fehlt.length > 0 ? (
                <div className="text-red-600">Spalte(n) nicht gefunden: {vorschau.fehlt.join(', ')}. Bitte in ServiceNow mit diesen Spalten exportieren.</div>
              ) : (
                <>
                  <div className="text-muted-foreground">{vorschau.zeilen.length} Zeilen · <span className="text-foreground font-semibold">{vorschau.soll.sollGeraete.length} Geräte in Fächern/Bereichen</span> · {vorschau.soll.ohne.length} ohne Fach · {vorschau.soll.nichtImLager} nicht im Lager (Status)</div>
                  <div className="grid grid-cols-2 gap-1">
                    {TYP_REIHE.map(t => { const n = vorschau.soll.sollGeraete.filter(g => g.typ === t).length; return n ? <span key={t} className="inline-flex items-center gap-1"><TypPunkt typ={t} />{n} {TYP_LABEL[t]}</span> : null })}
                  </div>
                  {vorschau.soll.ohne.length > 0 && (
                    <details className="text-muted-foreground"><summary className="cursor-pointer text-amber-600">{vorschau.soll.ohne.length} Gerät(e) ohne erkennbares Fach</summary>
                      <ul className="mt-1 space-y-0.5">{vorschau.soll.ohne.map(o => <li key={o.serial}><span className="font-mono">{o.serial}</span> · {o.modell} · „{o.kommentar.replace(/\s+/g, ' ').slice(0, 60) || 'kein Kommentar'}“</li>)}</ul>
                    </details>
                  )}
                  <p className="text-[11px] text-muted-foreground">Mit dem Start wird die Liste auch die neue Lagerliste der Ansicht (Kommentare und Status von heute).</p>
                </>
              )}
              <div className="flex gap-2">
                <button onClick={() => void starten()} disabled={!!vorschau.fehlt.length || arbeitet === 'start'} data-lager-starten className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50">{arbeitet === 'start' ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}Mini-Inventur starten</button>
                <button onClick={() => setVorschau(null)} className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent/40">Abbrechen</button>
              </div>
            </div>
          )}
          {zeiger?.letzte && (
            <div className="rounded-md border border-border p-2.5 space-y-1.5">
              <div className="font-semibold text-foreground">Letzte: {zeiger.letzte.titel} · {zeit(zeiger.letzte.abgeschlossenAm)}</div>
              {zeiger.letzte.abweichungen.length ? (
                <>
                  <div className="text-red-600">{zeiger.letzte.abweichungen.length} Abweichung(en):</div>
                  <ul className="space-y-0.5">{zeiger.letzte.abweichungen.map(a => <li key={a.ort}><button onClick={() => onZeige(a.ort)} className="text-left hover:underline">{a.text}</button></li>)}</ul>
                  <div className="flex gap-2 pt-1">
                    <label className="inline-flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" checked={zeigeLetzte} onChange={e => setZeigeLetzte(e.target.checked)} />im Raum zeigen</label>
                    <button onClick={() => void letzteAusblenden().then(neuLaden)} className="ml-auto text-muted-foreground hover:text-foreground hover:underline">erledigt – ausblenden</button>
                  </div>
                </>
              ) : <div className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 size={12} />Alles stimmte.</div>}
            </div>
          )}
          {!!zeiger?.verlauf.length && (
            <div>
              <div className="font-semibold text-foreground mb-1">Verlauf</div>
              <ul className="space-y-0.5 text-muted-foreground">{zeiger.verlauf.slice(0, 12).map(v => <li key={v.id}>{v.titel} · {zeit(v.abgeschlossenAm || v.gestartetAm)} · {v.verworfen ? 'verworfen' : v.abweichungen ? `${v.abweichungen} Abweichung(en)` : 'alles stimmte'}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {!laedt && inv && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 pt-2">
            <div className="flex items-center justify-between text-muted-foreground"><span>{gezaehlt} von {ZAEHL_ORTE.length} Plätzen gezählt</span>{abw > 0 && <span className="text-red-600 font-semibold">{abw} Abweichung(en)</span>}</div>
            <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${(gezaehlt / ZAEHL_ORTE.length) * 100}%` }} /></div>
          </div>

          {ort ? (
            <div className="m-3 rounded-md border-2 border-primary/50 p-2.5 space-y-2" data-lager-zaehlort={ort}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{ortName(ort)}</span>
                {inv.zaehlung[ort] && <span className={`ml-auto text-[11px] ${stand?.get(ort)?.zustand === 'abweichung' ? 'text-red-600' : 'text-green-600'}`}>gezählt von {inv.zaehlung[ort]!.von}</span>}
              </div>
              <div className="text-muted-foreground">Soll laut Liste: {summe(inv.soll[ort]) ? TYP_REIHE.filter(t => inv.soll[ort]?.[t]).map(t => `${inv.soll[ort]![t]} ${TYP_LABEL[t]}`).join(' · ') : 'leer'}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {TYP_REIHE.map(t => (
                  <label key={t} className="flex items-center gap-1.5 rounded border border-border px-1.5 py-1">
                    <TypPunkt typ={t} /><span className="text-foreground">{TYP_LABEL[t]}</span>
                    <input type="number" min={0} value={ist[t] ?? 0} data-lager-ist={t}
                      onChange={e => setIst(v => ({ ...v, [t]: Math.max(0, Number(e.target.value) || 0) }))}
                      className="ml-auto w-12 px-1 py-0.5 rounded border border-border bg-background text-right" />
                  </label>
                ))}
              </div>
              <input value={notiz} onChange={e => setNotiz(e.target.value)} placeholder="Notiz (optional), z. B. „5CG… liegt in Fach D“" className="w-full px-2 py-1 rounded border border-border bg-background" />
              {unterschied(inv.soll[ort], ist) && <div className="text-red-600">Abweichung: {unterschied(inv.soll[ort], ist)}</div>}
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => void speichern(true)} disabled={!!arbeitet} data-lager-stimmt className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-green-600 text-white font-medium disabled:opacity-50"><Check size={12} />Stimmt</button>
                <button onClick={() => void speichern(false)} disabled={!!arbeitet} data-lager-gezaehlt className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-accent/40 disabled:opacity-50">Gezählt speichern</button>
                {inv.zaehlung[ort] && <button onClick={() => void zuruecknehmen()} disabled={!!arbeitet} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground"><RotateCcw size={11} />zurücknehmen</button>}
                {arbeitet === 'zaehlen' && <Loader2 size={13} className="animate-spin text-muted-foreground self-center" />}
              </div>
              {inv.sollGeraete.some(g => g.ort === ort) && (
                <details className="text-muted-foreground"><summary className="cursor-pointer">Laut Liste hier ({inv.sollGeraete.filter(g => g.ort === ort).length})</summary>
                  <ul className="mt-1 space-y-0.5">{inv.sollGeraete.filter(g => g.ort === ort).map(g => <li key={g.serial} className="flex items-center gap-1"><TypPunkt typ={g.typ} /><span className="font-mono">{g.serial}</span> <span className="truncate">{g.modell}</span></li>)}</ul>
                </details>
              )}
            </div>
          ) : (
            <div className="m-3 rounded-md border border-green-600/40 bg-green-600/10 p-2.5 text-green-700">Alle Plätze gezählt — jetzt abschließen.</div>
          )}

          <div className="flex-1 overflow-y-auto px-3 space-y-0.5">
            {ZAEHL_ORTE.map(o => {
              const z = stand?.get(o)
              return (
                <button key={o} onClick={() => onZeige(o)} data-lager-zaehlzeile={o} data-zustand={z?.zustand}
                  className={`w-full text-left flex items-center gap-2 rounded px-1.5 py-1 ${o === ort ? 'bg-primary/10' : 'hover:bg-accent/40'}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${z?.zustand === 'stimmt' ? 'bg-green-600' : z?.zustand === 'abweichung' ? 'bg-red-600' : 'bg-muted-foreground/40'}`} />
                  <span className="truncate text-foreground">{ortName(o)}</span>
                  <span className="ml-auto text-muted-foreground">{z?.zustand === 'abweichung' ? <span className="text-red-600">{z.text}</span> : `Soll ${summe(inv.soll[o])}`}</span>
                </button>
              )
            })}
            {inv.ohne.length > 0 && <div className="text-amber-600 pt-2">{inv.ohne.length} Gerät(e) der Liste ohne erkennbares Fach — nicht zählbar, siehe „Erkennung prüfen“.</div>}
          </div>

          <div className="p-3 border-t border-border space-y-2">
            {sicher ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-1.5">
                <div className="text-amber-700">{sicher === 'verwerfen' ? 'Mini-Inventur verwerfen? Die Zählungen bleiben im Verlauf, aber ohne Ergebnis.' : ZAEHL_ORTE.length - gezaehlt > 0 ? `Noch ${ZAEHL_ORTE.length - gezaehlt} Platz/Plätze offen. Trotzdem abschließen?` : 'Mini-Inventur abschließen?'}</div>
                <div className="flex gap-2">
                  <button onClick={() => void beenden(sicher === 'verwerfen')} disabled={!!arbeitet} data-lager-ende-ja className="px-3 py-1 rounded-md bg-primary text-primary-foreground font-medium">Ja</button>
                  <button onClick={() => setSicher('')} className="px-3 py-1 rounded-md border border-border text-muted-foreground">Nein</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setSicher('abschliessen')} data-lager-abschliessen className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium"><CheckCircle2 size={13} />Abschließen</button>
                <button onClick={() => setSicher('verwerfen')} className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent/40">Verwerfen</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
