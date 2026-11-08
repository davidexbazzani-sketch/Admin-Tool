// ── Einstellungen → „Befehls-Test“: alle Befehle einmal echt auf einem Test-PC ──
import { useEffect, useMemo, useState } from 'react'
import { FlaskConical, Play, Pause, Square, RotateCcw, Download, CheckCircle2, XCircle, AlertTriangle, Loader2, ChevronDown, ChevronRight, Search, Trash2, ShieldAlert, Clock, MinusCircle, Ban, WifiOff } from 'lucide-react'
import Card from '../components/Card'
import PcSuche from '../components/PcSuche'
import { api } from '../electronAPI'
import { useBefehlsTest } from './store'
import { BT_PHASEN, BT_STATUS, type BtEintrag, type BtErgebnis, type BtPhase, type BtStatus } from './types'

const TON: Record<'ok' | 'warn' | 'fehler' | 'neutral', string> = {
  ok: 'text-emerald-500', warn: 'text-amber-500', fehler: 'text-red-500', neutral: 'text-muted-foreground',
}
const CHIP: Record<'ok' | 'warn' | 'fehler' | 'neutral', string> = {
  ok: 'border-emerald-500/40 bg-emerald-500/10', warn: 'border-amber-500/40 bg-amber-500/10', fehler: 'border-red-500/40 bg-red-500/10', neutral: 'border-border bg-muted/40',
}
function StatusIcon({ s, size = 14 }: { s: BtStatus; size?: number }) {
  const c = TON[BT_STATUS[s].ton]
  if (s === 'ok') return <CheckCircle2 size={size} className={c} />
  if (s === 'fehler') return <XCircle size={size} className={c} />
  if (s === 'zeit') return <Clock size={size} className={c} />
  if (s === 'weg') return <WifiOff size={size} className={c} />
  if (s === 'meldung' || s === 'na') return <AlertTriangle size={size} className={c} />
  if (s === 'laeuft') return <Loader2 size={size} className="animate-spin text-primary" />
  if (s === 'gesperrt') return <Ban size={size} className={c} />
  if (s === 'skip') return <MinusCircle size={size} className={c} />
  return <span className="inline-block w-3 h-3 rounded-full border border-border" />
}

const dauer = (ms: number) => ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
const uhr = (iso?: string) => iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

function useTakt(aktiv: boolean) {
  const [, setT] = useState(0)
  useEffect(() => { if (!aktiv) return; const i = setInterval(() => setT(t => t + 1), 1000); return () => clearInterval(i) }, [aktiv])
}

export default function BefehlsTestKarte() {
  const st = useBefehlsTest()
  const { katalog, lauf, arbeitet } = st
  useEffect(() => { void st.laden() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useTakt(arbeitet)
  const map = useMemo(() => new Map(katalog.map(e => [e.key, e])), [katalog])

  return (
    <Card title="Befehls-Test auf einem Test-PC" icon={<FlaskConical size={15} />} subtitle="Probiert alle Befehle des Tools nacheinander einmal echt aus und hält genau fest, welche funktionieren">
      {lauf ? <LaufAnsicht map={map} /> : <Einrichten />}
      {lauf && !arbeitet && (lauf.zustand === 'fertig' || lauf.zustand === 'abgebrochen') && (
        <div className="border-t border-border pt-3">
          <button onClick={st.verwerfen} className="text-xs text-primary hover:underline">Neuen Testlauf einrichten</button>
        </div>
      )}
    </Card>
  )
}

// ── Vor dem Start ────────────────────────────────────────────────────────────
function Einrichten() {
  const st = useBefehlsTest()
  const { einstellung, katalog, katalogLaedt, pc, pcPrueft } = st
  const [bestaetigen, setBestaetigen] = useState(false)
  const [fehler, setFehler] = useState('')
  const [werteOffen, setWerteOffen] = useState(false)
  const [gesperrtOffen, setGesperrtOffen] = useState(false)

  const zahlen = useMemo(() => {
    const je: Record<string, number> = {}
    for (const e of katalog) je[e.phase] = (je[e.phase] || 0) + 1
    return { je, gesperrt: katalog.filter(e => e.sperre), fehlt: katalog.filter(e => e.fehlt && !e.sperre), drucker: katalog.filter(e => (e.wert || '').includes('{drucker}')).length }
  }, [katalog])

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 leading-relaxed">
        <b className="text-foreground">Achtung: Der Test-PC wird wirklich verändert.</b> Caches werden geleert, Einstellungen gesetzt, gespeicherte Anmeldungen
        gelöscht, OneDrive getrennt, der Hello-PIN zurückgesetzt, Programme beendet und der PC mehrfach neu gestartet. Nimm einen PC, auf dem nichts Wichtiges offen ist.
        Testordner, Testkonto, Testaufgabe und WLAN-Testprofile legt das Tool selbst an und entfernt sie am Ende. Proxy, RDP, UAC, Zeitserver, Zeitzone, Energie,
        Sperrzeit, Standarddrucker, Design und Skalierung werden vorher gesichert und am Ende zurückgestellt. Server und dieser PC selbst sind gesperrt.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">Test-PC</label>
          <PcSuche kompakt wert={einstellung.pc ? { host: einstellung.pc } : null} onWahl={w => { st.setzeEinstellung({ pc: w?.host || '' }); useBefehlsTest.setState({ pc: null }) }} placeholder="Hostname, Seriennummer oder Person" />
          <div className="flex items-center gap-2">
            <button disabled={!einstellung.pc || pcPrueft} onClick={() => { void st.pruefePc(einstellung.pc) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted disabled:opacity-50">
              {pcPrueft ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Test-PC prüfen
            </button>
            {pc && (pc.ok
              ? <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 size={12} /> erreichbar · {pc.system || 'Windows'} · {pc.benutzer ? <>angemeldet: {pc.benutzer}{pc.gesperrt ? ' (gesperrt)' : ''}</> : <span className="text-amber-500">niemand angemeldet – Benutzer-Befehle werden übersprungen</span>}</span>
              : <span className="text-xs text-red-500 flex items-center gap-1"><XCircle size={12} /> {pc.fehler}</span>)}
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">Optionen</label>
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5 accent-primary" checked={einstellung.optionen.remoteDoc} onChange={e => st.setzeEinstellung({ optionen: { ...einstellung.optionen, remoteDoc: e.target.checked } })} />
            Auch alle Remote-Doc-Befehle testen
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5 accent-primary" checked={einstellung.optionen.herunterfahren} onChange={e => st.setzeEinstellung({ optionen: { ...einstellung.optionen, herunterfahren: e.target.checked } })} />
            Ganz am Ende „Herunterfahren“ testen (PC ist danach aus)
          </label>
          <div>
            <input value={einstellung.optionen.drucker} onChange={e => st.setzeEinstellung({ optionen: { ...einstellung.optionen, drucker: e.target.value.trim() } })}
              placeholder="Testdrucker, z. B. PMD634 (leer = Drucker-Befehle überspringen)"
              className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
            <p className="text-[10px] text-muted-foreground mt-1">Wird für {zahlen.drucker || 'die'} Drucker-Befehle verbunden, als Standard gesetzt, eine Testseite gedruckt, Aufträge gelöscht und am Ende wieder entfernt. Nimm einen Drucker, den du auf dem Test-PC nicht brauchst.</p>
          </div>
        </div>
      </div>

      {!katalog.length ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-bt-laedt><Loader2 size={13} className="animate-spin" /> Befehle werden geladen …</div>
      ) : <>
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1.5">Reihenfolge {katalogLaedt && <Loader2 size={11} className="inline animate-spin ml-1" />}</div>
        <div className="flex flex-wrap gap-1.5">
          {BT_PHASEN.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground text-[10px]">→</span>}
              <span className="px-2 py-1 rounded-md border border-border text-[11px]" title={p.info}><b>{zahlen.je[p.id] || 0}</b> {p.titel}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {katalog.length} Befehle insgesamt. Vor Abmelden und Neustarts wird aufgeräumt und zurückgestellt. Nach Befehlen, die das Netz kurz trennen oder neu starten, wartet der Lauf, bis der PC wieder antwortet.
        </p>
      </div>

      <div className="space-y-2">
        <button onClick={() => setGesperrtOffen(!gesperrtOffen)} className="flex items-center gap-1 text-xs text-foreground">
          {gesperrtOffen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} <ShieldAlert size={13} className="text-muted-foreground" /> {zahlen.gesperrt.length} Befehle laufen nie automatisch (nur Syntaxprüfung)
        </button>
        {gesperrtOffen && (
          <div className="ml-5 space-y-1 max-h-64 overflow-y-auto">
            {zahlen.gesperrt.map(e => <div key={e.key} className="text-[11px]"><b className="text-foreground">{e.titel}</b> <span className="text-muted-foreground">· {e.gruppe} — {e.sperre}</span></div>)}
          </div>
        )}
        <button onClick={() => setWerteOffen(!werteOffen)} className="flex items-center gap-1 text-xs text-foreground">
          {werteOffen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Testwerte {zahlen.fehlt.length > 0 && <span className="text-amber-500">· {zahlen.fehlt.length} ohne Testwert (werden übersprungen)</span>}
        </button>
        {werteOffen && <Testwerte />}
      </div>
      </>}

      {fehler && <div className="text-xs text-red-500">{fehler}</div>}
      <div className="flex items-center gap-2">
        <button disabled={!einstellung.pc || katalogLaedt || !katalog.length} onClick={() => { setFehler(''); setBestaetigen(true) }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50">
          <Play size={14} /> Testlauf starten
        </button>
        <span className="text-[11px] text-muted-foreground">Läuft im Hintergrund weiter, auch wenn du die Seite wechselst. Das Tool muss geöffnet bleiben.</span>
      </div>
      {bestaetigen && <Bestaetigung onAbbruch={() => setBestaetigen(false)} onFehler={f => { setFehler(f); setBestaetigen(false) }} />}
    </div>
  )
}

function Testwerte() {
  const st = useBefehlsTest()
  const [nurFehlt, setNurFehlt] = useState(true)
  const [q, setQ] = useState('')
  const zeilen = st.katalog.filter(e => e.paramLabel && !e.sperre && (!nurFehlt || e.fehlt || e.herkunft === 'eigen') &&
    (!q || (e.titel + ' ' + e.gruppe + ' ' + (e.paramLabel || '')).toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="ml-5 space-y-2">
      <div className="flex items-center gap-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Suchen …" className="px-2 py-1 text-xs rounded-md border border-border bg-background w-48 focus:outline-none focus:border-primary" />
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer"><input type="checkbox" className="accent-primary" checked={nurFehlt} onChange={e => setNurFehlt(e.target.checked)} /> nur fehlende und eigene</label>
        <span className="text-[10px] text-muted-foreground">{zeilen.length} Befehle</span>
      </div>
      <div className="max-h-80 overflow-y-auto border border-border rounded-md divide-y divide-border">
        {zeilen.map(e => (
          <div key={e.key} className="grid grid-cols-[1fr_1fr] gap-2 px-2 py-1.5 items-center">
            <div className="min-w-0">
              <div className="text-[11px] text-foreground truncate" title={e.titel}>{e.titel}</div>
              <div className="text-[10px] text-muted-foreground truncate">{e.gruppe} · {e.paramLabel}</div>
            </div>
            <input defaultValue={st.einstellung.eigeneWerte[e.key] || ''} onBlur={ev => st.setzeWert(e.key, ev.target.value)}
              placeholder={e.fehlt ? (e.fehlt) : `automatisch: ${e.wert || '(leer)'}`}
              className={`px-2 py-1 text-[11px] rounded border bg-background focus:outline-none focus:border-primary ${e.fehlt ? 'border-amber-500/50' : 'border-border'}`} />
          </div>
        ))}
        {!zeilen.length && <div className="text-[11px] text-muted-foreground p-2">Nichts zu tun — alle Befehle haben einen Testwert.</div>}
      </div>
      <p className="text-[10px] text-muted-foreground">Eigene Werte werden gespeichert und bei jedem weiteren Testlauf verwendet. Platzhalter wie {'{drucker}'} setzt das Tool zur Laufzeit ein.</p>
    </div>
  )
}

function Bestaetigung({ onAbbruch, onFehler }: { onAbbruch: () => void; onFehler: (f: string) => void }) {
  const st = useBefehlsTest()
  const [eingabe, setEingabe] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const pcName = st.einstellung.pc.trim()
  const passt = eingabe.trim().toUpperCase() === pcName.toUpperCase()
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onAbbruch}>
      <div className="bg-card border border-border rounded-xl p-5 max-w-lg w-full space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><AlertTriangle size={15} className="text-amber-500" /> Testlauf auf {pcName} starten?</h3>
        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li>Alle {st.katalog.filter(e => !e.sperre).length} Befehle laufen <b className="text-foreground">wirklich</b> — auch die kritischen.</li>
          <li>Der Benutzer auf {pcName} wird am Ende abgemeldet, der PC mehrfach neu gestartet{st.einstellung.optionen.herunterfahren ? ' und zuletzt heruntergefahren' : ''}.</li>
          <li>Gespeicherte Anmeldungen, OneDrive-Verbindung, Hello-PIN und Outlook-Profil müssen danach ggf. neu eingerichtet werden.</li>
          <li>Dauer: mehrere Stunden (Reparaturen, Virenscan und Updates sind dabei).</li>
        </ul>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Zur Bestätigung den PC-Namen eintippen:</label>
          <input autoFocus value={eingabe} onChange={e => setEingabe(e.target.value)} placeholder={pcName}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onAbbruch} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted">Abbrechen</button>
          <button disabled={!passt || laeuft} onClick={async () => { setLaeuft(true); const f = await st.starte(); setLaeuft(false); if (f) onFehler(f); else onAbbruch() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50">
            {laeuft ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Jetzt starten
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Während / nach dem Lauf ──────────────────────────────────────────────────
const ENDE: BtStatus[] = ['ok', 'meldung', 'na', 'fehler', 'zeit', 'weg', 'skip', 'gesperrt']
const ZUSTAND: Record<string, { t: string; c: string }> = {
  vorbereitung: { t: 'Vorbereitung', c: 'text-primary' }, laeuft: { t: 'läuft', c: 'text-primary' }, wartet: { t: 'wartet auf den Test-PC', c: 'text-amber-500' },
  pausiert: { t: 'angehalten', c: 'text-amber-500' }, fertig: { t: 'fertig', c: 'text-emerald-500' }, abgebrochen: { t: 'abgebrochen', c: 'text-muted-foreground' },
}

function LaufAnsicht({ map }: { map: Map<string, BtEintrag> }) {
  const st = useBefehlsTest()
  const { lauf, aktuell, status, arbeitet } = st
  const [filter, setFilter] = useState<BtStatus | 'alle' | 'probleme'>('probleme')
  const [q, setQ] = useState('')
  const [quelle, setQuelle] = useState<'alle' | 'baustein' | 'remotedoc'>('alle')
  const [offen, setOffen] = useState<string | null>(null)
  const [mehr, setMehr] = useState(200)
  const [protokoll, setProtokoll] = useState(false)
  if (!lauf) return null

  const erg = lauf.ergebnisse
  const zaehl: Record<string, number> = {}
  for (const k of lauf.reihenfolge) { const s = erg[k]?.status || 'offen'; zaehl[s] = (zaehl[s] || 0) + 1 }
  const gesamt = lauf.reihenfolge.length
  const erledigt = lauf.reihenfolge.filter(k => ENDE.includes(erg[k]?.status)).length
  const gelaufen = lauf.reihenfolge.map(k => erg[k]).filter(r => r && ['ok', 'meldung', 'na', 'fehler'].includes(r.status) && r.dauerMs > 0 && r.dauerMs < 120_000)
  const schnitt = gelaufen.length ? gelaufen.reduce((s, r) => s + r.dauerMs, 0) / gelaufen.length : 8000
  const rest = (zaehl.offen || 0) + (zaehl.laeuft || 0)
  const akt = aktuell ? map.get(aktuell.key) : null
  const phaseJetzt: BtPhase | undefined = akt?.phase || (lauf.reihenfolge.map(k => map.get(k)).find(e => e && (erg[e.key]?.status || 'offen') === 'offen')?.phase)
  const probleme: BtStatus[] = ['fehler', 'zeit', 'weg', 'meldung']

  const liste = lauf.reihenfolge.filter(k => {
    const s = erg[k]?.status || 'offen'
    if (filter === 'probleme' && !probleme.includes(s)) return false
    if (filter !== 'alle' && filter !== 'probleme' && s !== filter) return false
    const e = map.get(k)
    if (quelle !== 'alle' && e?.quelle !== quelle) return false
    if (q && !((e?.titel || k) + ' ' + (e?.gruppe || '') + ' ' + (erg[k]?.text || '')).toLowerCase().includes(q.toLowerCase())) return false
    return true
  })
  const fehlgeschlagen = lauf.reihenfolge.filter(k => probleme.includes(erg[k]?.status))
  const z = ZUSTAND[lauf.zustand] || ZUSTAND.pausiert

  async function exportiere() {
    if (!lauf) return
    const sp = (s: unknown) => '"' + String(s ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"'
    const kopf = ['Nr', 'Quelle', 'Gruppe', 'Befehl', 'Phase', 'Risiko', 'Status', 'Befund', 'Testwert', 'Dauer (s)', 'Zeitpunkt', 'Syntax']
    const zeilen = lauf.reihenfolge.map((k, i) => {
      const e = map.get(k); const r = erg[k]
      return [i + 1, e?.quelle === 'remotedoc' ? 'Remote Doc' : 'Baustein', e?.gruppe, e?.titel || k, BT_PHASEN.find(p => p.id === e?.phase)?.titel, e?.risiko, BT_STATUS[r?.status || 'offen'].titel, r?.text, r?.param, r ? Math.round(r.dauerMs / 1000) : '', r?.am ? new Date(r.am).toLocaleString('de-DE') : '', r?.syntax || ''].map(sp).join(';')
    })
    const csv = '﻿' + [kopf.map(sp).join(';'), ...zeilen].join('\r\n')
    const pfad = await api().saveFileDialog(`Befehls-Test_${lauf.pc}_${lauf.start.slice(0, 10)}.csv`, [{ name: 'CSV (Excel)', extensions: ['csv'] }])
    if (pfad) await api().writeFile(pfad, btoa(unescape(encodeURIComponent(csv))))
  }

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Test-PC <b className="text-foreground">{lauf.pc}</b> · gestartet {uhr(lauf.start)} von {lauf.von}{lauf.ende ? ` · beendet ${uhr(lauf.ende)}` : ''} · <span className={`font-semibold ${z.c}`}>{z.t}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {arbeitet && lauf.zustand !== 'vorbereitung' && <Knopf onClick={st.pause} icon={<Pause size={12} />}>Anhalten</Knopf>}
          {!arbeitet && (lauf.zustand === 'pausiert' || lauf.zustand === 'wartet') && <Knopf onClick={st.fortsetzen} icon={<Play size={12} />} primaer>Fortsetzen</Knopf>}
          {lauf.zustand !== 'fertig' && lauf.zustand !== 'abgebrochen' && <Knopf onClick={st.abbrechen} icon={<Square size={12} />}>Abbrechen & aufräumen</Knopf>}
          {!arbeitet && lauf.vorbereitet && !lauf.aufgeraeumt && <Knopf onClick={() => { void st.aufraeumen() }} icon={<Trash2 size={12} />}>Aufräumen</Knopf>}
          {!arbeitet && fehlgeschlagen.length > 0 && <Knopf onClick={() => st.wiederhole(fehlgeschlagen)} icon={<RotateCcw size={12} />}>{fehlgeschlagen.length} Fehlgeschlagene erneut testen</Knopf>}
          <Knopf onClick={() => { void exportiere() }} icon={<Download size={12} />}>Excel (CSV)</Knopf>
        </div>
      </div>
      {lauf.hinweis && <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 text-foreground">{lauf.hinweis}</div>}

      {/* Fortschritt + Live */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground font-medium">{erledigt} von {gesamt} erledigt ({Math.round(erledigt / Math.max(1, gesamt) * 100)} %)</span>
          {rest > 0 && <span className="text-muted-foreground">noch ca. {Math.max(1, Math.round(rest * schnitt / 60_000))} min (ohne lange Reparaturen und Neustarts)</span>}
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
          {(['ok', 'meldung', 'na', 'fehler', 'zeit', 'weg', 'skip', 'gesperrt'] as BtStatus[]).map(s => {
            const n = zaehl[s] || 0
            if (!n) return null
            const t = BT_STATUS[s].ton
            const farbe = t === 'ok' ? 'bg-emerald-500' : t === 'warn' ? 'bg-amber-500' : t === 'fehler' ? 'bg-red-500' : 'bg-muted-foreground/40'
            return <div key={s} className={`${farbe} h-full border-r-2 border-card last:border-r-0`} style={{ width: `${n / gesamt * 100}%` }} title={`${BT_STATUS[s].titel}: ${n}`} />
          })}
        </div>
        <div className="flex flex-wrap gap-1">
          {BT_PHASEN.map(p => {
            const keys = lauf.reihenfolge.filter(k => map.get(k)?.phase === p.id)
            if (!keys.length) return null
            const fertig = keys.filter(k => ENDE.includes(erg[k]?.status)).length
            const jetzt = phaseJetzt === p.id && lauf.zustand !== 'fertig'
            return <span key={p.id} className={`px-2 py-0.5 rounded text-[10px] border ${jetzt ? 'border-primary text-primary' : fertig === keys.length ? 'border-emerald-500/40 text-emerald-500' : 'border-border text-muted-foreground'}`}>{p.titel} {fertig}/{keys.length}</span>
          })}
        </div>
        {(arbeitet || akt) && (
          <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs flex items-start gap-2">
            <Loader2 size={14} className="animate-spin text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              {akt ? <>
                <div className="text-foreground font-medium truncate">{akt.titel}</div>
                <div className="text-muted-foreground text-[11px]">{akt.gruppe} · {BT_PHASEN.find(p => p.id === akt.phase)?.titel} · läuft seit {dauer(Date.now() - (aktuell?.seit || Date.now()))}{erg[akt.key]?.param ? ` · Testwert: ${erg[akt.key]?.param}` : ''}</div>
              </> : <div className="text-foreground">{status || 'Arbeitet …'}</div>}
              {akt && status && <div className="text-amber-500 text-[11px]">{status}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip an={filter === 'probleme'} onClick={() => setFilter('probleme')} ton="fehler">Probleme {(zaehl.fehler || 0) + (zaehl.zeit || 0) + (zaehl.weg || 0) + (zaehl.meldung || 0)}</FilterChip>
        {(['ok', 'meldung', 'na', 'fehler', 'zeit', 'weg', 'skip', 'gesperrt', 'offen'] as BtStatus[]).map(s => (zaehl[s] ? <FilterChip key={s} an={filter === s} onClick={() => setFilter(s)} ton={BT_STATUS[s].ton}><StatusIcon s={s} size={11} /> {BT_STATUS[s].titel} {zaehl[s]}</FilterChip> : null))}
        <FilterChip an={filter === 'alle'} onClick={() => setFilter('alle')} ton="neutral">Alle {gesamt}</FilterChip>
        <select value={quelle} onChange={e => setQuelle(e.target.value as typeof quelle)} className="ml-auto px-2 py-1 text-[11px] rounded-md border border-border bg-background">
          <option value="alle">Bausteine + Remote Doc</option><option value="baustein">nur Lösungsbausteine</option><option value="remotedoc">nur Remote Doc</option>
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Suchen …" className="px-2 py-1 text-[11px] rounded-md border border-border bg-background w-40 focus:outline-none focus:border-primary" />
      </div>

      {/* Liste */}
      <div className="border border-border rounded-md divide-y divide-border max-h-[520px] overflow-y-auto">
        {liste.slice(0, mehr).map(k => <Zeile key={k} k={k} e={map.get(k)} r={erg[k]} nr={lauf.reihenfolge.indexOf(k) + 1} offen={offen === k} onToggle={() => setOffen(offen === k ? null : k)} onWiederhole={!arbeitet ? () => st.wiederhole([k]) : undefined} />)}
        {!liste.length && <div className="text-xs text-muted-foreground p-3">{filter === 'probleme' ? (erledigt ? 'Bisher keine Probleme.' : 'Noch nichts gelaufen.') : 'Keine Einträge.'}</div>}
        {liste.length > mehr && <button onClick={() => setMehr(mehr + 300)} className="w-full text-xs text-primary py-2 hover:bg-muted">{liste.length - mehr} weitere anzeigen</button>}
      </div>

      {/* Vorbereitung/Aufräumen */}
      {lauf.aufraeumZeilen?.length ? (
        <div>
          <button onClick={() => setProtokoll(!protokoll)} className="flex items-center gap-1 text-xs text-muted-foreground">{protokoll ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {lauf.aufgeraeumt ? 'Aufräumen' : 'Vorbereitung'} ({lauf.aufraeumZeilen.length} Einträge)</button>
          {protokoll && <ul className="ml-5 mt-1 text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">{lauf.aufraeumZeilen.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </div>
      ) : null}
    </div>
  )
}

function Zeile({ k, e, r, nr, offen, onToggle, onWiederhole }: { k: string; e?: BtEintrag; r?: BtErgebnis; nr: number; offen: boolean; onToggle: () => void; onWiederhole?: () => void }) {
  const s = r?.status || 'offen'
  return (
    <div className="text-xs">
      <button onClick={onToggle} className="w-full grid grid-cols-[2.5rem_1rem_minmax(0,1.4fr)_minmax(0,2fr)_4rem] gap-2 items-center px-2 py-1.5 text-left hover:bg-muted/50">
        <span className="text-[10px] text-muted-foreground tabular-nums">{nr}</span>
        <StatusIcon s={s} />
        <span className="min-w-0">
          <span className="block truncate text-foreground" title={e?.titel}>{e?.titel || k}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{e?.gruppe} · {BT_PHASEN.find(p => p.id === e?.phase)?.titel}</span>
        </span>
        <span className={`truncate text-[11px] ${TON[BT_STATUS[s].ton]}`} title={r?.text}>{s === 'offen' ? '' : (r?.text || BT_STATUS[s].titel)}{r?.syntax && s === 'offen' ? <span className="text-red-500">Syntax: {r.syntax}</span> : null}</span>
        <span className="text-[10px] text-muted-foreground text-right tabular-nums">{r && r.dauerMs ? dauer(r.dauerMs) : ''}</span>
      </button>
      {offen && (
        <div className="px-3 pb-2 pl-14 space-y-1">
          <div className="text-[11px] text-muted-foreground">Status: <b className={TON[BT_STATUS[s].ton]}>{BT_STATUS[s].titel}</b>{r?.am ? ` · ${new Date(r.am).toLocaleString('de-DE')}` : ''} · Art: {e?.art} · Risiko: {e?.risiko}{r?.param !== undefined ? ` · Testwert: ${r.param || '(leer)'}` : ''}</div>
          {r?.syntax ? <div className="text-[11px] text-red-500">Syntaxprüfung: {r.syntax}</div> : r && s !== 'offen' && s !== 'gesperrt' ? <div className="text-[11px] text-emerald-500">Syntaxprüfung: in Ordnung</div> : null}
          {e?.sperre && <div className="text-[11px] text-muted-foreground">Nicht automatisch: {e.sperre}</div>}
          {r?.text && <div className="text-[11px] text-foreground whitespace-pre-wrap">{r.text}</div>}
          {r?.zeilen?.length ? <pre className="text-[10px] bg-muted/50 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap">{r.zeilen.join('\n')}</pre> : null}
          {onWiederhole && s !== 'gesperrt' && s !== 'offen' && <button onClick={onWiederhole} className="text-[11px] text-primary hover:underline flex items-center gap-1"><RotateCcw size={11} /> Diesen Befehl erneut testen</button>}
        </div>
      )}
    </div>
  )
}

function Knopf({ onClick, icon, children, primaer }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; primaer?: boolean }) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md ${primaer ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border hover:bg-muted'}`}>{icon}{children}</button>
}
function FilterChip({ an, onClick, ton, children }: { an: boolean; onClick: () => void; ton: 'ok' | 'warn' | 'fehler' | 'neutral'; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${an ? CHIP[ton] + ' text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-muted'}`}>{children}</button>
}
