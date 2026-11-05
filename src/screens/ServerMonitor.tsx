// ── Infrastruktur → Server: Kachel-Monitor ───────────────────────────────────
// Alle Server als Kacheln (Ping-Status, letzter Reboot), per Drag umsortierbar,
// hinzufügbar/löschbar, mit optionaler Offline-Mail je Kachel. Live-Status kommt
// aus dem geteilten server_monitor/status.json (vom Hintergrund-Controller gepflegt).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Server, RefreshCw, Loader, Plus, Trash2, ServerOff, ServerCog, Mail, Check, X, Download,
  History, Clock, Send, Pin, FileText, HardDrive, MemoryStick, ListChecks, ShieldAlert, ShieldCheck,
} from 'lucide-react'
import ServerZustandPanel from '../components/server/ServerZustandPanel'
import { runZertifikatsScan } from '../services/serverZertifikate'
import { useServerEreignisStore } from '../store/serverEreignisStore'
import { useAuthStore } from '../store/authStore'
import {
  loadServerConfig, saveServerConfig, loadInventoryServers, mergeInventoryServers,
  loadServerStatus, runPingCycle, runRebootCheck, runZustandsPruefung, hostKey, removeHostState, runServerMetricsScan,
  zerlegeAdressen, meldeAn, meldeStandard, haeufigsteMeldeAdresse,
  type ServerTile, type ServerMonitorStatus,
} from '../services/serverMonitor'
import {
  loadHistoryFor, addHistoryEntry, deleteHistoryEntry, ensureSteckbriefeSeeded,
  type ServerHistoryEntry,
} from '../services/serverHistory'
import { DeviceInfoButton } from '../components/device/DeviceDossier'

// ── Historie-Dialog je Server (frei beschreibbar, automatischer Zeitstempel) ──
function fmtStamp(iso: string, dateOnly?: boolean): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return dateOnly ? d.toLocaleDateString('de-DE') : d.toLocaleString('de-DE')
}

// GB hübsch formatieren (bis 100 mit einer Nachkommastelle, darüber gerundet).
function fmtGB(n: number): string {
  const v = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10
  return v.toLocaleString('de-DE', { maximumFractionDigits: 1 })
}

// Auslastungsbalken (RAM/Festplatte): Farbe nach Schwellwert, Wert rechts.
function MetricBar({ icon, label, pct, sub }: { icon: React.ReactNode; label: string; pct: number; sub: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const tone = p >= 90 ? 'bg-red-500' : p >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
  const txt = p >= 90 ? 'text-red-400' : p >= 75 ? 'text-amber-400' : 'text-emerald-400'
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="shrink-0 text-muted-foreground/70">{icon}</span>
        <span className="font-medium text-foreground/80">{label}</span>
        <span className={`ml-auto tabular-nums font-semibold ${txt}`}>{p}%</span>
        <span className="tabular-nums">{sub}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}

function kurzZeit(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Letzter Reboot + wann zuletzt erfolgreich gelesen. Scheiterte die letzte Abfrage,
// steht das sichtbar da (Wert evtl. veraltet) — statt still einen alten Wert zu zeigen.
function RebootZeile({ st }: { st?: ServerMonitorStatus['servers'][string] }) {
  const boot = st?.lastReboot ? new Date(st.lastReboot.replace(' ', 'T')) : null
  const stunden = boot && !isNaN(boot.getTime()) ? (Date.now() - boot.getTime()) / 3600000 : null
  const tryT = st?.lastRebootTryAt ? new Date(st.lastRebootTryAt).getTime() : 0
  const okT = st?.lastRebootCheckAt ? new Date(st.lastRebootCheckAt).getTime() : 0
  const gescheitert = !!st?.lastRebootError && tryT >= okT
  return (
    <div className="mt-1.5 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span>Letzter Reboot: <span className="text-foreground">{st?.lastReboot || '—'}</span></span>
        {stunden !== null && stunden >= 0 && stunden < 48 && (
          <span className="px-1.5 rounded bg-amber-400 text-black text-[10px] font-medium" title="Der Server wurde in den letzten 48 Stunden neu gestartet">
            Neustart vor {stunden < 1 ? `${Math.max(1, Math.round(stunden * 60))} min` : `${Math.round(stunden)} h`}
          </span>
        )}
      </div>
      {gescheitert ? (
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-500" title={st?.lastRebootError}>
          <Clock size={10} className="shrink-0" />
          <span className="truncate">Abfrage {kurzZeit(st?.lastRebootTryAt)} fehlgeschlagen — Wert evtl. veraltet{okT ? ` (zuletzt gelesen ${kurzZeit(st?.lastRebootCheckAt)})` : ''}</span>
        </div>
      ) : okT ? (
        <div className="mt-0.5 text-[10px] text-muted-foreground/70" title={st?.rebootQuelle === 'dcom' ? 'per DCOM gelesen (WinRM war nicht erreichbar)' : 'per WinRM gelesen'}>
          gelesen {kurzZeit(st?.lastRebootCheckAt)}{st?.rebootQuelle === 'dcom' ? ' (DCOM)' : ''}
        </div>
      ) : null}
    </div>
  )
}

// Kurzfassung der Dienst-/Einstellungs-Prüfung auf der Kachel — Klick öffnet die Lasche.
function PruefChip({ st, onClick }: { st?: ServerMonitorStatus['servers'][string]; onClick: () => void }) {
  const z = st?.pruefung
  if (!z) return (
    <button onClick={onClick} className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent">
      <ListChecks size={11} />Dienste &amp; Prüfungen einrichten
    </button>
  )
  const ok = z.gesamt - z.probleme - z.hinweise
  const [farbe, text] = !z.erreichbar ? ['bg-muted text-foreground', 'Prüfung: nicht erreichbar (WinRM)']
    : z.probleme > 0 ? ['bg-red-600 text-white', `${z.probleme} Problem${z.probleme === 1 ? '' : 'e'} · ${ok}/${z.gesamt} OK`]
    : z.startetNoch ? ['bg-amber-400 text-black', 'Dienste starten noch …']
    : z.hinweise > 0 ? ['bg-amber-400 text-black', `${ok}/${z.gesamt} OK · ${z.hinweise} Hinweis${z.hinweise === 1 ? '' : 'e'}`]
    : ['bg-emerald-600 text-white', `alle ${z.gesamt} Prüfpunkte OK`]
  return (
    <button onClick={onClick} title={`Dienste & Prüfungen öffnen · geprüft ${new Date(z.am).toLocaleString('de-DE')}`}
      className={`mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold hover:opacity-90 ${farbe}`}>
      <ListChecks size={11} />{text}
    </button>
  )
}

/** Kachel: nächster Zertifikats-Ablauf (rot ≤ 5 Tage/abgelaufen, gelb ≤ 30 Tage, sonst unauffällig). */
function ZertChip({ st, onClick, onPruefen, pruefend }: { st?: ServerMonitorStatus['servers'][string]; onClick: () => void; onPruefen: () => void; pruefend: boolean }) {
  const z = st?.zertifikate
  // Manuell je Server: Zertifikate dieses einen Servers jetzt lesen (nur lesend)
  const pruefKnopf = (
    <button onClick={e => { e.stopPropagation(); onPruefen() }} disabled={pruefend} title="Zertifikate nur dieses Servers jetzt prüfen (nur lesend)"
      className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50">
      {pruefend ? <Loader size={10} className="animate-spin" /> : <RefreshCw size={10} />}{pruefend ? 'prüft…' : 'prüfen'}
    </button>
  )
  if (!z || !z.naechstes) return (
    <div className="mt-1 flex items-center">
      <button onClick={onClick} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent">
        <ShieldCheck size={11} />{z ? (z.erreichbar ? 'kein verwendetes Zertifikat gefunden' : 'Zertifikate: nicht lesbar (WinRM)') : 'Zertifikate noch nicht geprüft'}
      </button>
      {pruefKnopf}
    </div>
  )
  const n = z.naechstes
  const bis = new Date(n.bis).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const frist = n.tage < 0 ? 'abgelaufen' : n.tage === 0 ? 'läuft heute ab' : n.tage === 1 ? 'läuft morgen ab' : `noch ${n.tage} T`
  const titel = `Zertifikate öffnen · ${n.cn} (${n.verwendung}) gültig bis ${bis} · geprüft ${new Date(z.am).toLocaleString('de-DE')}`
  if (z.kritisch > 0 || z.warnung > 0) return (
    <div className="mt-1 flex items-center flex-wrap">
      <button onClick={onClick} title={titel}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold hover:opacity-90 ${z.kritisch > 0 ? 'bg-red-600 text-white' : 'bg-amber-400 text-black'}`}>
        <ShieldAlert size={11} />Zertifikat {frist}: {n.cn.length > 22 ? n.cn.slice(0, 22) + '…' : n.cn}{z.kritisch + z.warnung > 1 ? ` (+${z.kritisch + z.warnung - 1})` : ''}
      </button>
      {pruefKnopf}
    </div>
  )
  return (
    <div className="mt-1 flex items-center">
      <button onClick={onClick} title={titel} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
        <ShieldCheck size={11} className="shrink-0" /><span className="whitespace-nowrap">Zertifikate OK · bis {bis}</span>
      </button>
      {pruefKnopf}
    </div>
  )
}

function HistoryDialog({ tile, by, onClose }: { tile: ServerTile; by: string; onClose: () => void }) {
  const [entries, setEntries] = useState<ServerHistoryEntry[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void loadHistoryFor(tile.hostname).then(setEntries) }, [tile.hostname])

  async function add() {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try { setEntries(await addHistoryEntry(tile.hostname, t, by)); setText('') }
    finally { setBusy(false) }
  }
  async function remove(id: string) {
    setEntries(await deleteHistoryEntry(tile.hostname, id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-4 py-3 border-b border-border flex items-center gap-2">
          <History size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Historie <span className="inline-flex items-center gap-1"><span className="font-mono">{tile.hostname}</span>{tile.hostname && <DeviceInfoButton hostname={tile.hostname} />}</span>{tile.description && <span className="text-muted-foreground font-normal"> · {tile.description}</span>}</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"><X size={16} /></button>
        </div>

        {/* Neuer Eintrag */}
        <div className="shrink-0 px-4 py-3 border-b border-border">
          <div className="flex gap-2 items-end">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
              onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { void add() } }}
              placeholder="Neuer Eintrag (Ausfall, Einsatz, Change, Notiz …) — wird automatisch mit Zeitstempel versehen"
              className="flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground resize-none focus:outline-none focus:border-primary" />
            <button onClick={add} disabled={!text.trim() || busy}
              className="flex items-center gap-1 px-3 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {busy ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}Eintragen
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Tipp: Strg+Enter trägt ein. Eintrag von <span className="text-foreground">{by}</span>.</p>
        </div>

        {/* Verlauf */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {entries === null ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><Loader size={14} className="animate-spin" />Verlauf wird geladen…</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">Noch keine Einträge.</div>
          ) : entries.map(e => (
            <div key={e.id} className={`rounded-lg border p-2.5 ${e.pinned ? 'border-primary/40 bg-primary/5' : 'border-border bg-background'}`}>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {e.pinned ? <Pin size={10} className="text-primary" /> : e.seed ? <FileText size={10} /> : <Clock size={10} />}
                <span>{e.pinned ? 'Stammdaten' : fmtStamp(e.at, e.dateOnly)}</span>
                <span>· {e.by}</span>
                {e.source && <span className="italic">· {e.source}</span>}
                {!e.seed && (
                  <button onClick={() => remove(e.id)} title="Eintrag löschen" className="ml-auto p-0.5 rounded text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={11} /></button>
                )}
              </div>
              <p className="mt-1 text-xs text-foreground whitespace-pre-wrap">{e.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Melde-Adressen: je Empfänger ein eigenes Feld ─────────────────────────────
// Gespeichert wird weiter als „a@x; b@y" in notifyEmail — so bleiben bestehende Einträge gültig
// und der Versand (eine Mail an alle Empfänger) ändert sich nicht.
/** Gültige Adressen aller Felder (ohne Dubletten) + Zahl der ungültigen Felder. */
function sammleAdressen(felder: string[]): { gueltig: string[]; ungueltig: number } {
  const z = zerlegeAdressen(felder.join('; '))
  return { gueltig: z.gueltig, ungueltig: felder.filter(f => f.trim() && zerlegeAdressen(f).ungueltig.length > 0).length }
}
function AdressListe({ wert, onSpeichern, onAendern, klein = true }: {
  wert?: string
  /** beim Verlassen eines Feldes / Entfernen: gültige Adressen als „a; b" */
  onSpeichern: (v: string) => void
  /** bei jeder Eingabe (für „für alle übernehmen") */
  onAendern?: (gueltig: string[], ungueltig: number) => void
  klein?: boolean
}) {
  const ausWert = (w?: string) => { const g = zerlegeAdressen(w).gueltig; return g.length ? g : [''] }
  const [felder, setFelder] = useState<string[]>(() => ausWert(wert))
  const [neuFokus, setNeuFokus] = useState<number | null>(null)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const zuletzt = useRef(meldeAn(wert))
  // von außen geändert (z. B. „für alle übernehmen") → Felder neu aufbauen; eigene Änderungen nicht
  useEffect(() => {
    const w = meldeAn(wert)
    if (w !== zuletzt.current) { zuletzt.current = w; setFelder(ausWert(wert)) }
  }, [wert])
  useEffect(() => { if (neuFokus !== null) { refs.current[neuFokus]?.focus(); setNeuFokus(null) } }, [neuFokus, felder.length])

  const melde = (liste: string[]) => { const s = sammleAdressen(liste); zuletzt.current = s.gueltig.join('; '); onAendern?.(s.gueltig, s.ungueltig); return zuletzt.current }
  const speichern = (liste: string[]) => { const v = melde(liste); if (v !== meldeAn(wert)) onSpeichern(v) }
  const setze = (i: number, v: string) => { const n = felder.map((f, j) => (j === i ? v : f)); setFelder(n); melde(n) }
  const verlassen = (i: number) => {
    // eingefügte Liste („a; b") auf eigene Felder verteilen
    const teile = felder[i].split(/[;,\s]+/).map(t => t.trim()).filter(Boolean)
    const n = teile.length > 1 ? [...felder.slice(0, i), ...teile, ...felder.slice(i + 1)] : felder
    if (n !== felder) setFelder(n)
    speichern(n)
  }
  const entfernen = (i: number) => { const n = felder.filter((_, j) => j !== i); const m = n.length ? n : ['']; setFelder(m); speichern(m) }
  const hinzufuegen = () => { setFelder([...felder, '']); setNeuFokus(felder.length) }

  const gross = klein ? 'text-[11px]' : 'text-xs'
  const zahl = sammleAdressen(felder).gueltig.length
  return (
    <div className="mt-1 space-y-1">
      {felder.map((f, i) => {
        const z = f.trim() ? zerlegeAdressen(f) : null
        const kaputt = !!z && z.ungueltig.length > 0
        const doppelt = !kaputt && !!f.trim() && felder.slice(0, i).some(g => g.trim().toLowerCase() === f.trim().toLowerCase())
        return (
          <div key={i}>
            <div className="flex items-center gap-1">
              <input ref={el => { refs.current[i] = el }} type="email" value={f}
                onChange={e => setze(i, e.target.value)} onBlur={() => verlassen(i)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                placeholder={i === 0 ? 'mail@firma.de' : 'weitere Adresse'}
                className={`flex-1 min-w-0 px-2 py-1 ${gross} rounded-md border ${kaputt ? 'border-amber-500' : 'border-border'} bg-background text-foreground focus:outline-none focus:border-primary`} />
              {(felder.length > 1 || f) && (
                <button onClick={() => entfernen(i)} title="Adresse entfernen"
                  className="shrink-0 p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><X size={11} /></button>
              )}
            </div>
            {kaputt && <div className="mt-0.5 text-[10px]"><span className="px-1 rounded font-semibold bg-amber-400 text-black">ungültig — wird nicht gespeichert</span></div>}
            {doppelt && <div className="mt-0.5 text-[10px] text-muted-foreground">steht schon weiter oben — wird nur einmal angeschrieben</div>}
          </div>
        )
      })}
      <div className="flex items-center gap-2">
        <button onClick={hinzufuegen} className={`inline-flex items-center gap-1 ${klein ? 'text-[10px]' : 'text-[11px]'} text-primary hover:underline`}>
          <Plus size={klein ? 10 : 11} />weitere Adresse
        </button>
        {zahl > 1 && <span className="text-[10px] text-muted-foreground">{zahl} Empfänger</span>}
      </div>
    </div>
  )
}

/** „Mail-Meldungen für alle Server": Adressen + Arten auf einen Schlag setzen. */
function MeldungenFuerAlle({ tiles, onUebernehmen, onSchliessen }: {
  tiles: ServerTile[]; onUebernehmen: (patch: (t: ServerTile) => ServerTile, text: string) => void; onSchliessen: () => void
}) {
  const [adressen, setAdressen] = useState(() => haeufigsteMeldeAdresse(tiles))
  const [offline, setOffline] = useState(true)
  const [neustart, setNeustart] = useState(true)
  const [probleme, setProbleme] = useState(true)
  const [zertifikat, setZertifikat] = useState(true)
  const [ergaenzen, setErgaenzen] = useState(true)
  const [ungueltig, setUngueltig] = useState(0)
  const z = zerlegeAdressen(adressen)
  const ohne = tiles.filter(t => !meldeAn(t.notifyEmail) || !(t.notifyEnabled && (t.notifyReboot ?? t.notifyEnabled))).length
  const geht = z.gueltig.length > 0 && ungueltig === 0
  return (
    <div className="shrink-0 mx-4 mt-2 px-3 py-2.5 rounded-md bg-card border border-border space-y-2">
      <div className="flex items-center gap-2">
        <Mail size={13} className="text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground">Mail-Meldungen für alle {tiles.length} Server</span>
        <span className="text-[11px] text-muted-foreground">{ohne ? `${ohne} Server melden aktuell nicht alles per Mail` : 'alle Server melden per Mail'}</span>
        <button onClick={onSchliessen} className="ml-auto p-0.5 rounded text-muted-foreground hover:text-foreground"><X size={13} /></button>
      </div>
      <AdressListe wert={adressen} onSpeichern={setAdressen} onAendern={(g, u) => { setAdressen(g.join('; ')); setUngueltig(u) }} klein={false} />
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-foreground">
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="rounded accent-primary" checked={offline} onChange={e => setOffline(e.target.checked)} />bei Offline</label>
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="rounded accent-primary" checked={neustart} onChange={e => setNeustart(e.target.checked)} />bei Neustart / Herunterfahren</label>
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="rounded accent-primary" checked={probleme} onChange={e => setProbleme(e.target.checked)} />bei Problemen</label>
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="rounded accent-primary" checked={zertifikat} onChange={e => setZertifikat(e.target.checked)} />bei Zertifikat-Ablauf (30 / 5 Tage)</label>
        <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground" title="Aus = die Adressen an allen Kacheln werden durch diese ersetzt">
          <input type="checkbox" className="rounded accent-primary" checked={ergaenzen} onChange={e => setErgaenzen(e.target.checked)} />vorhandene Adressen behalten (nur ergänzen)
        </label>
        <button disabled={!geht}
          onClick={() => onUebernehmen(
            t => ({ ...t, notifyEnabled: offline, notifyReboot: neustart, notifyPruefung: probleme, notifyZertifikat: zertifikat,
              notifyEmail: ergaenzen ? zerlegeAdressen(`${t.notifyEmail || ''}; ${z.gueltig.join('; ')}`).gueltig.join('; ') : z.gueltig.join('; ') }),
            `Mail-Meldungen für alle ${tiles.length} Server gesetzt: ${[offline && 'Offline', neustart && 'Neustart/Herunterfahren', probleme && 'Probleme', zertifikat && 'Zertifikat-Ablauf'].filter(Boolean).join(', ') || 'keine'} an ${z.gueltig.join(', ')}${ergaenzen ? ' (ergänzt)' : ''}.`)}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40">
          <Check size={12} />Für alle {tiles.length} Server übernehmen
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">Neu hinzugefügte Server bekommen automatisch alle Meldungen an die meistgenutzte Adresse.</p>
    </div>
  )
}

export default function ServerMonitor() {
  const session = useAuthStore(s => s.session)
  const by = session?.user.displayName || session?.user.username || 'manuell'

  const [tiles, setTiles] = useState<ServerTile[]>([])
  const [status, setStatus] = useState<ServerMonitorStatus>({ pingRunAt: null, rebootRunAt: null, servers: {} })
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [msg, setMsg] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showMeldungen, setShowMeldungen] = useState(false)
  const [newHost, setNewHost] = useState('')
  const [newIp, setNewIp] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [historyTile, setHistoryTile] = useState<ServerTile | null>(null)
  const [zustandTile, setZustandTile] = useState<ServerTile | null>(null)
  const [zustandReiter, setZustandReiter] = useState<'status' | 'zertifikate' | undefined>(undefined)
  const oeffne = (t: ServerTile, reiter?: 'status' | 'zertifikate') => { setZustandReiter(reiter); setZustandTile(t) }
  // Popup „Status öffnen" / „Zertifikate öffnen" → Lasche dieses Servers direkt öffnen
  const oeffneHost = useServerEreignisStore(s => s.oeffneHost)
  const oeffneReiter = useServerEreignisStore(s => s.oeffneReiter)
  const setOeffneHost = useServerEreignisStore(s => s.setOeffneHost)
  useEffect(() => {
    if (!oeffneHost || !tiles.length) return
    const t = tiles.find(x => hostKey(x.hostname) === hostKey(oeffneHost))
    if (t) oeffne(t, oeffneReiter || undefined)
    setOeffneHost(null)
  }, [oeffneHost, oeffneReiter, tiles, setOeffneHost])

  const refreshStatus = useCallback(async () => {
    try { setStatus(await loadServerStatus()) } catch { /* offline */ }
  }, [])

  // Initial: Config laden (bei leer → aus Inventar befüllen) + Status + Polling.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      let cfg = await loadServerConfig()
      if (cfg.tiles.length === 0) {
        const inv = await loadInventoryServers()
        if (inv.length) { const m = mergeInventoryServers([], inv); cfg = { tiles: m.tiles }; await saveServerConfig(cfg) }
      }
      if (!cancelled) { setTiles(cfg.tiles.slice().sort((a, b) => a.position - b.position)); setLoading(false) }
      await refreshStatus()
      // Steckbrief-Historie einmalig importieren (idempotent, geteilt für alle Admins).
      try { await ensureSteckbriefeSeeded() } catch { /* offline */ }
    })()
    const t = setInterval(() => { void refreshStatus() }, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [refreshStatus])

  async function persist(next: ServerTile[]) {
    setTiles(next)
    await saveServerConfig({ tiles: next })
  }

  async function addFromInventory() {
    const inv = await loadInventoryServers()
    const m = mergeInventoryServers(tiles, inv)
    if (m.added > 0) { await persist(m.tiles.slice().sort((a, b) => a.position - b.position)); setMsg(`${m.added} Server aus der Standort-Übersicht ergänzt.`) }
    else setMsg('Keine neuen Server in der Standort-Übersicht gefunden.')
  }

  async function addManual() {
    const host = newHost.trim()
    if (!host) return
    const pos = tiles.reduce((mx, t) => Math.max(mx, t.position), -1) + 1
    const tile: ServerTile = { id: `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, hostname: host, ip: newIp.trim() || undefined, ...meldeStandard(tiles), position: pos }
    await persist([...tiles, tile])
    setNewHost(''); setNewIp(''); setShowAdd(false)
  }

  async function removeTile(id: string) {
    const gone = tiles.find(t => t.id === id)
    const next = tiles.filter(t => t.id !== id).map((t, i) => ({ ...t, position: i }))
    await persist(next)
    // Offline-Status/Alarm des gelöschten Servers sofort aufräumen.
    if (gone) { await removeHostState(gone.hostname); await refreshStatus() }
  }
  function patchTile(id: string, patch: Partial<ServerTile>) {
    void persist(tiles.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  async function checkNow() {
    if (checking) return
    setChecking(true); setMsg('')
    try {
      const r = await runPingCycle(by)
      await refreshStatus()
      setMsg(`Ping fertig: ${r.online} online · ${r.offline} offline — Reboot-Zeiten werden gelesen …`)
      const rb = await runRebootCheck(by)
      await refreshStatus()
      setMsg(`Ping + Reboot fertig — Dienste & Einstellungen werden geprüft …`)
      const zp = await runZustandsPruefung(by)
      await refreshStatus()
      setMsg(`Prüfung fertig: ${r.online} online · ${r.offline} offline · Reboot-Zeit von ${rb.updated} Servern gelesen${rb.fehler ? ` (${rb.fehler} nicht abfragbar — siehe Kachel)` : ''}${rb.neustarts ? ` · ${rb.neustarts} Neustart(s) erkannt` : ''}${zp.geprueft ? ` · ${zp.geprueft} Server geprüft, ${zp.probleme} Problem(e)` : ''}.`)
    } catch (e) {
      setMsg('Prüfung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setChecking(false) }
  }

  // Zertifikate EINES Servers manuell prüfen (nur lesend) — Meldungen wie beim täglichen Scan
  const [zertPruefend, setZertPruefend] = useState<Set<string>>(new Set())
  async function zertJetzt(tile: ServerTile) {
    const k = hostKey(tile.hostname)
    if (zertPruefend.has(k)) return
    setZertPruefend(prev => new Set(prev).add(k))
    try {
      const r = await runZertifikatsScan(by, [tile.hostname])
      await refreshStatus()
      setMsg(r.geprueft ? `Zertifikate ${tile.hostname}: ${r.summary.replace(/^1 Server geprüft · /, '')}.` : `Zertifikate ${tile.hostname}: Server laut Ping nicht erreichbar — übersprungen.`)
    } catch (e) {
      setMsg(`Zertifikate ${tile.hostname}: fehlgeschlagen — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setZertPruefend(prev => { const n = new Set(prev); n.delete(k); return n })
    }
  }

  async function measureNow() {
    if (measuring) return
    setMeasuring(true); setMsg('')
    try {
      const r = await runServerMetricsScan(by)
      await refreshStatus()
      setMsg(`Auslastung gemessen: ${r.summary}.`)
    } catch (e) {
      setMsg('Auslastungs-Messung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setMeasuring(false) }
  }

  // ── Drag & Drop (Raster-Umsortieren, wie im Dashboard) ──
  function onDragStart(e: React.DragEvent, id: string) {
    // Kein Drag, wenn man in einem Bedienelement (Eingabe/Checkbox/Button) startet.
    if ((e.target as HTMLElement).closest('input,textarea,button,label')) { e.preventDefault(); return }
    setDragId(id); e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const next = [...tiles]
    const from = next.findIndex(t => t.id === dragId)
    const to = next.findIndex(t => t.id === targetId)
    if (from < 0 || to < 0) { setDragId(null); return }
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    next.forEach((t, i) => { t.position = i })
    void persist(next)
    setDragId(null)
  }

  const onlineCount = tiles.filter(t => status.servers[hostKey(t.hostname)]?.online === true).length
  const offlineCount = tiles.filter(t => status.servers[hostKey(t.hostname)]?.online === false).length

  if (loading) {
    return <div className="flex items-center justify-center h-full gap-2 text-muted-foreground"><Loader size={16} className="animate-spin" /> Server werden geladen…</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <Server size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Server</h1>
        <span className="text-xs text-muted-foreground">{onlineCount} online · {offlineCount > 0 ? <span className="text-red-400 font-medium">{offlineCount} offline</span> : '0 offline'}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={checkNow} disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
            {checking ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}Jetzt prüfen
          </button>
          <button onClick={measureNow} disabled={measuring} title="Arbeitsspeicher- & Festplatten-Auslastung jetzt messen (läuft sonst automatisch täglich 11:00)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-40">
            {measuring ? <Loader size={12} className="animate-spin" /> : <MemoryStick size={12} />}Auslastung messen
          </button>
          <button onClick={() => setShowMeldungen(v => !v)} title="Mail-Meldungen (Offline, Neustart/Herunterfahren, Probleme) für alle Server auf einmal setzen — auch mehrere Empfänger"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground">
            <Mail size={12} />Mail-Meldungen für alle
          </button>
          <button onClick={addFromInventory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground">
            <Download size={12} />Aus Standort-Übersicht laden
          </button>
          <button onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
            <Plus size={12} />Kachel hinzufügen
          </button>
        </div>
      </div>

      {msg && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 text-xs rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-2">
          <span className="flex-1">{msg}</span>
          <button onClick={() => setMsg('')} className="text-blue-300/70 hover:text-blue-200 text-sm leading-none">×</button>
        </div>
      )}

      {showMeldungen && (
        <MeldungenFuerAlle tiles={tiles} onSchliessen={() => setShowMeldungen(false)}
          onUebernehmen={(patch, text) => { void persist(tiles.map(patch)); setMsg(text); setShowMeldungen(false) }} />
      )}

      {showAdd && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 rounded-md bg-card border border-border flex items-center gap-2 flex-wrap">
          <input value={newHost} onChange={e => setNewHost(e.target.value)} placeholder="Hostname (z. B. W3172)"
            className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground w-48 focus:outline-none focus:border-primary" />
          <input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="IP (optional)"
            className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground w-36 focus:outline-none focus:border-primary" />
          <button onClick={addManual} disabled={!newHost.trim()} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground disabled:opacity-40"><Check size={12} />Hinzufügen</button>
          <button onClick={() => { setShowAdd(false); setNewHost(''); setNewIp('') }} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md border border-border text-muted-foreground"><X size={12} /></button>
        </div>
      )}

      {/* Kacheln */}
      <div className="flex-1 overflow-y-auto p-4">
        {tiles.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Server size={48} className="mx-auto opacity-20 mb-3" />
            <p className="text-sm">Noch keine Server-Kacheln.</p>
            <p className="text-xs opacity-60 mt-1">„Aus Standort-Übersicht laden" oder „Kachel hinzufügen".</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {tiles.map(tile => {
              const st = status.servers[hostKey(tile.hostname)]
              const state: 'online' | 'offline' | 'unknown' = st?.online === true ? 'online' : st?.online === false ? 'offline' : 'unknown'
              const border = state === 'offline' ? 'border-red-500/60' : state === 'online' ? 'border-emerald-500/40' : 'border-border'
              return (
                <div key={tile.id} draggable
                  onDragStart={e => onDragStart(e, tile.id)} onDragOver={onDragOver} onDrop={e => onDrop(e, tile.id)}
                  className={`rounded-xl border ${border} bg-card p-3 cursor-grab active:cursor-grabbing ${state === 'offline' ? 'animate-pulse bg-red-500/5' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${state === 'online' ? 'bg-emerald-400' : state === 'offline' ? 'bg-red-500' : 'bg-muted-foreground/40'}`} />
                    <span className="text-sm font-semibold text-foreground truncate flex-1" title={`${tile.hostname}${tile.description ? ' · ' + tile.description : ''}`}>
                      <span className="inline-flex items-center gap-1"><span className="font-mono">{tile.hostname}</span>{tile.hostname && <DeviceInfoButton hostname={tile.hostname} />}</span>
                      {tile.description && <span className="text-muted-foreground font-normal"> · {tile.description}</span>}
                    </span>
                    {state === 'offline' ? <ServerOff size={14} className="text-red-400 shrink-0" /> : <ServerCog size={14} className="text-muted-foreground shrink-0" />}
                    <button onClick={() => oeffne(tile)} title="Dienste & Prüfungen" className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-primary hover:bg-primary/10"><ListChecks size={13} /></button>
                    <button onClick={() => setHistoryTile(tile)} title="Historie öffnen" className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-primary hover:bg-primary/10"><History size={13} /></button>
                    <button onClick={() => removeTile(tile.id)} title="Kachel entfernen" className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={12} /></button>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    {tile.ip && <span className="font-mono">{tile.ip}</span>}
                    <span className={state === 'offline' ? 'text-red-400 font-medium' : state === 'online' ? 'text-emerald-400' : ''}>
                      {state === 'online' ? 'online' : state === 'offline' ? `offline${st?.consecutiveFailures ? ` (${st.consecutiveFailures}×)` : ''}` : 'noch nicht geprüft'}
                    </span>
                  </div>
                  <RebootZeile st={st} />
                  <PruefChip st={st} onClick={() => oeffne(tile)} />
                  <ZertChip st={st} onClick={() => oeffne(tile, 'zertifikate')} pruefend={zertPruefend.has(hostKey(tile.hostname))}
                    onPruefen={() => void zertJetzt(tile)} />
                  {st?.metrics ? (
                    <div className="mt-2 space-y-1.5">
                      <MetricBar icon={<MemoryStick size={11} />} label="RAM" pct={st.metrics.ramUsedPct}
                        sub={`${fmtGB(st.metrics.ramUsedGB)} / ${fmtGB(st.metrics.ramTotalGB)} GB`} />
                      {st.metrics.disks.map(d => (
                        <MetricBar key={d.drive} icon={<HardDrive size={11} />} label={d.drive} pct={d.usedPct}
                          sub={`${fmtGB(d.freeGB)} GB frei / ${fmtGB(d.sizeGB)} GB`} />
                      ))}
                      <div className="text-[9px] text-muted-foreground/60">Auslastung: {fmtStamp(st.metrics.at)}</div>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[10px] text-muted-foreground/60">Auslastung: noch nicht gemessen (täglich 11:00)</div>
                  )}
                  <textarea defaultValue={tile.note || ''} placeholder="Info / Notiz zum Server…" rows={2}
                    onBlur={e => patchTile(tile.id, { note: e.target.value.trim() })}
                    className="mt-2 w-full px-2 py-1 text-[11px] rounded-md border border-border bg-background text-foreground resize-none focus:outline-none focus:border-primary" />
                  <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                    <Mail size={11} className="shrink-0" />
                    <label className="flex items-center gap-1.5 cursor-pointer" title="Mail, wenn der Server 3× nicht auf Ping antwortet (und wenn er wieder erreichbar ist)">
                      <input type="checkbox" className="rounded accent-primary" checked={tile.notifyEnabled}
                        onChange={e => patchTile(tile.id, { notifyEnabled: e.target.checked })} />
                      bei Offline
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer" title="Mail, wenn der Server heruntergefahren/neu gestartet wurde — geplant (mit Benutzer und Grund) oder unerwartet">
                      <input type="checkbox" className="rounded accent-primary" checked={tile.notifyReboot ?? tile.notifyEnabled}
                        onChange={e => patchTile(tile.id, { notifyReboot: e.target.checked })} />
                      bei Neustart / Herunterfahren
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer" title="Mail, wenn bei der Dienst-/Einstellungs-Prüfung ein kritischer Punkt ausfällt">
                      <input type="checkbox" className="rounded accent-primary" checked={tile.notifyPruefung ?? (tile.notifyReboot ?? tile.notifyEnabled)}
                        onChange={e => patchTile(tile.id, { notifyPruefung: e.target.checked })} />
                      bei Problemen
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer" title="Mail, wenn ein verwendetes Zertifikat in 30 bzw. 5 Tagen abläuft oder abgelaufen ist">
                      <input type="checkbox" className="rounded accent-primary" checked={tile.notifyZertifikat ?? (tile.notifyPruefung ?? (tile.notifyReboot ?? tile.notifyEnabled))}
                        onChange={e => patchTile(tile.id, { notifyZertifikat: e.target.checked })} />
                      bei Zertifikat-Ablauf
                    </label>
                  </div>
                  {(tile.notifyEnabled || (tile.notifyReboot ?? tile.notifyEnabled) || (tile.notifyPruefung ?? (tile.notifyReboot ?? tile.notifyEnabled)) || (tile.notifyZertifikat ?? (tile.notifyPruefung ?? (tile.notifyReboot ?? tile.notifyEnabled)))) && (
                    <AdressListe wert={tile.notifyEmail} onSpeichern={v => patchTile(tile.id, { notifyEmail: v })} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {historyTile && <HistoryDialog tile={historyTile} by={by} onClose={() => setHistoryTile(null)} />}
      {zustandTile && <ServerZustandPanel host={zustandTile.hostname} bezeichnung={zustandTile.description} by={by} startReiter={zustandReiter}
        onClose={() => setZustandTile(null)} onGeaendert={() => void refreshStatus()} />}
    </div>
  )
}
