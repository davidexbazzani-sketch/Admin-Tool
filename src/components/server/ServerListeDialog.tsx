// ── Dialog „Serverliste": Stand ansehen, neue Excel importieren, fehlende Server übernehmen ──
// Eigenständig (lädt Liste, Standort-Übersicht und Server-Kacheln selbst) — so lässt er sich
// aus dem Menü „Server" UND aus der Standort-Übersicht öffnen.
//
// Übernehmen schreibt nur Ergänzungen, nie Änderungen an vorhandenen Einträgen:
//   • Standort-Übersicht: neue Einträge (Kategorie „Server"), gegen den frisch gelesenen Stand
//   • Server-Kacheln: neue Kacheln; Mail-Meldungen nur für Server, die gerade auf Ping antworten
// Gelöschte/Offline-Einträge der Liste werden nie übernommen.

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, MapPin, Save, Server, Upload, Wifi, WifiOff, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { api } from '../../electronAPI'
import type { InventoryItem } from '../../types/auth'
import { loadServerConfig, saveServerConfig, meldeStandard, type ServerTile } from '../../services/serverMonitor'
import { pingBatch } from '../../services/userPresenceScan'
import {
  ladeServerListe, speichereServerListe, parseServerListeExcel, gleicheAb, inventarErgaenzen, neueKacheln,
  standText, type ServerListe,
} from '../../services/serverListe'
import { PlattformBadge, UmgebungBadge } from './ServerSteckbrief'

const datumText = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  return isNaN(d.getTime()) ? iso : (iso.length === 10 ? standText(iso) : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
}

interface Auswahl { inv: boolean; kachel: boolean }

export default function ServerListeDialog({ by, onClose, onGeaendert }: { by: string; onClose: () => void; onGeaendert?: () => void }) {
  const [laedt, setLaedt] = useState(true)
  const [geltend, setGeltend] = useState<{ liste: ServerListe | null; herkunft: 'zentral' | 'eingebaut' | 'keine'; zentral: ServerListe | null } | null>(null)
  const [vorschau, setVorschau] = useState<ServerListe | null>(null)
  const [inventar, setInventar] = useState<InventoryItem[] | null>(null)
  const [tiles, setTiles] = useState<ServerTile[]>([])
  const [auswahl, setAuswahl] = useState<Record<string, Auswahl>>({})
  const [erreichbar, setErreichbar] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [zeigeRest, setZeigeRest] = useState(false)

  const liste = vorschau ?? geltend?.liste ?? null

  async function laden() {
    setLaedt(true)
    const [g, inv, cfg] = await Promise.all([
      ladeServerListe(true),
      api().netReadJsonAsync<InventoryItem[]>('inventory/inventory.json').catch(() => null),
      loadServerConfig().catch(() => ({ tiles: [] as ServerTile[] })),
    ])
    setGeltend(g); setInventar(Array.isArray(inv) ? inv : []); setTiles(cfg.tiles)
    setLaedt(false)
  }
  useEffect(() => { void laden() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const abgleich = useMemo(() => (liste && inventar ? gleicheAb(liste, inventar, tiles) : null), [liste, inventar, tiles])

  // Auswahl vorbelegen: alles Fehlende angehakt
  useEffect(() => {
    if (!abgleich) return
    const a: Record<string, Auswahl> = {}
    for (const z of abgleich.zeilen) a[z.host] = { inv: z.fehltImInventar && !z.andereKategorie, kachel: z.fehltAlsKachel }
    setAuswahl(a)
  }, [abgleich])

  // Erreichbarkeit der Server, für die eine Kachel fehlt (nur Ping, ändert nichts)
  useEffect(() => {
    if (!abgleich) return
    const hosts = abgleich.zeilen.filter(z => z.fehltAlsKachel).map(z => z.host)
    if (!hosts.length) { setErreichbar(new Set()); return }
    let weg = false
    setErreichbar(null)
    pingBatch(hosts, 1200).then(r => { if (!weg) setErreichbar(new Set(r.up.map(h => h.toUpperCase()))) }).catch(() => { if (!weg) setErreichbar(new Set()) })
    return () => { weg = true }
  }, [abgleich])

  async function importieren() {
    setMeldung(null)
    const p = await api().openFileDialog([{ name: 'Excel (SKFM Server List)', extensions: ['xlsx', 'xls'] }])
    if (!p) return
    const r = await api().readFile(p)
    if (!r.success || !r.data) { setMeldung({ ok: false, text: `Datei nicht lesbar: ${r.error || p}` }); return }
    const name = p.split(/[\\/]/).pop() || 'Serverliste.xlsx'
    const res = parseServerListeExcel(r.data, name)
    if (!res.liste) { setMeldung({ ok: false, text: res.fehler || 'Keine Serverliste erkannt.' }); return }
    setVorschau(res.liste)
  }

  async function zentralSpeichern(l: ServerListe): Promise<boolean> {
    const ok = await speichereServerListe(l, by)
    if (!ok) setMeldung({ ok: false, text: 'Die Serverliste konnte nicht auf dem Netzlaufwerk gespeichert werden.' })
    return ok
  }

  async function vorschauUebernehmen() {
    if (!vorschau) return
    setBusy(true)
    try {
      if (await zentralSpeichern(vorschau)) {
        setMeldung({ ok: true, text: `Serverliste vom ${datumText(vorschau.stand)} gespeichert — gilt jetzt für alle Admins.` })
        setVorschau(null); await laden(); onGeaendert?.()
      }
    } finally { setBusy(false) }
  }

  const invHosts = Object.entries(auswahl).filter(([, a]) => a.inv).map(([h]) => h)
  const kachelHosts = Object.entries(auswahl).filter(([, a]) => a.kachel).map(([h]) => h)

  async function uebernehmen() {
    if (!liste || (!invHosts.length && !kachelHosts.length)) return
    setBusy(true); setMeldung(null)
    const teile: string[] = []
    let fehler = ''
    try {
      // Liste zentral ablegen (neu importierte oder bisher nur im Programm hinterlegte) — damit alle
      // Admins denselben Stand sehen, auf dem diese Übernahme beruht
      if (vorschau || geltend?.herkunft !== 'zentral') {
        if (await zentralSpeichern(liste)) setVorschau(null)
      }
      if (invHosts.length) {
        const r = await inventarErgaenzen(liste, invHosts, by)
        if (r.ok) teile.push(`${r.hinzu.length} Server in die Standort-Übersicht eingetragen`)
        else fehler = r.fehler || 'Standort-Übersicht nicht gespeichert.'
      }
      if (kachelHosts.length && !fehler) {
        // frisch lesen — und NIE mit einer leeren Liste überschreiben, wenn die Datei nur gerade nicht lesbar war
        const cfg = await loadServerConfig()
        if (!cfg.tiles.length) {
          const da = (await api().netListDirAsync('server_monitor').catch(() => ['config.json'])).some(f => f.toLowerCase() === 'config.json')
          if (da) fehler = 'Die Server-Kacheln sind gerade nicht lesbar — keine Kacheln angelegt, bitte gleich noch einmal.'
        }
        if (!fehler) {
          const neu = neueKacheln(cfg.tiles, liste, kachelHosts, erreichbar ?? new Set(), meldeStandard(cfg.tiles))
          if (neu.length) {
            const ok = await saveServerConfig({ tiles: [...cfg.tiles, ...neu] })
            if (!ok) fehler = 'Server-Kacheln konnten nicht gespeichert werden.'
            else {
              const mitMail = neu.filter(t => t.notifyEnabled).length
              teile.push(`${neu.length} Server-Kachel${neu.length === 1 ? '' : 'n'} angelegt${mitMail < neu.length ? ` (Mail-Meldungen für ${neu.length - mitMail} nicht erreichbare aus)` : ''}`)
            }
          }
        }
      }
      setMeldung(fehler ? { ok: false, text: [teile.join(' · '), fehler].filter(Boolean).join(' — ') } : { ok: true, text: (teile.join(' · ') || 'Nichts zu tun') + '.' })
      await laden(); onGeaendert?.()
    } finally { setBusy(false) }
  }

  const alleInv = abgleich?.zeilen.filter(z => z.fehltImInventar && !z.andereKategorie) ?? []
  const alleKachel = abgleich?.zeilen.filter(z => z.fehltAlsKachel) ?? []
  const setAlle = (feld: keyof Auswahl, wert: boolean) => setAuswahl(prev => {
    const n = { ...prev }
    for (const z of feld === 'inv' ? alleInv : alleKachel) n[z.host] = { ...n[z.host], [feld]: wert }
    return n
  })
  const neueHosts = vorschau && geltend?.liste ? vorschau.server.filter(x => !geltend.liste!.server.some(y => y.host === x.host)).length : 0
  const wegHosts = vorschau && geltend?.liste ? geltend.liste.server.filter(x => !vorschau.server.some(y => y.host === x.host)).length : 0

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl h-[86vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-serverliste-dialog>
        {/* Kopf */}
        <div className="shrink-0 px-5 py-3.5 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0"><FileSpreadsheet size={20} className="text-primary" /></div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground">Serverliste</h2>
            <p className="text-xs text-muted-foreground">SKFM Server List — Anwendungen, Umgebung und Zuständige je Server. Steht hinter dem „i" jedes Servers und auf den Server-Kacheln.</p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {laedt ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />Wird geladen …</div>
          ) : (<>
            {/* Stand */}
            <div className="rounded-lg border border-border bg-background p-3 flex items-start gap-3 flex-wrap" data-stand>
              <div className="flex-1 min-w-[16rem] text-xs space-y-0.5">
                {geltend?.liste ? (<>
                  <p className="text-sm text-foreground"><b>Stand {datumText(geltend.liste.stand)}</b> · {geltend.liste.server.filter(x => x.zustand === 'aktiv').length} aktive Server · {geltend.liste.zeilen} Einträge</p>
                  <p className="text-muted-foreground">
                    {geltend.herkunft === 'zentral'
                      ? <>Zentral gespeichert{geltend.liste.importiertVon ? ` von ${geltend.liste.importiertVon}` : ''}{geltend.liste.importiertAm ? ` am ${datumText(geltend.liste.importiertAm)}` : ''} · Datei {geltend.liste.quelle}</>
                      : <>Im Programm hinterlegt ({geltend.liste.quelle}) — noch nicht zentral gespeichert. Wird beim Übernehmen mitgespeichert.</>}
                  </p>
                </>) : <p className="text-foreground">Noch keine Serverliste vorhanden.</p>}
              </div>
              <div className="flex items-center gap-2">
                {geltend?.liste && geltend.herkunft === 'eingebaut' && (
                  <button onClick={async () => { setBusy(true); try { if (await zentralSpeichern(geltend.liste!)) { setMeldung({ ok: true, text: 'Serverliste zentral gespeichert.' }); await laden() } } finally { setBusy(false) } }} disabled={busy}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
                    <Save size={12} />Zentral speichern
                  </button>
                )}
                <button onClick={() => void importieren()} disabled={busy} data-knopf="import"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                  <Upload size={12} />Neue Excel importieren …
                </button>
              </div>
            </div>

            {vorschau && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2" data-vorschau>
                <p className="text-sm text-foreground"><b>{vorschau.quelle}</b> · Stand {datumText(vorschau.stand)} · {vorschau.zeilen} Einträge → {vorschau.server.length} Server ({vorschau.server.filter(x => x.zustand === 'aktiv').length} aktiv)</p>
                {geltend?.liste && <p className="text-xs text-muted-foreground">Gegenüber dem bisherigen Stand ({datumText(geltend.liste.stand)}): {neueHosts} neu · {wegHosts} nicht mehr in der Liste</p>}
                {geltend?.liste && vorschau.stand < geltend.liste.stand && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-500"><AlertTriangle size={12} />Achtung: Diese Liste ist ÄLTER als der bisherige Stand — beim Speichern ersetzt sie ihn.</p>
                )}
                <p className="text-xs text-muted-foreground">Der Abgleich unten zeigt schon den Stand dieser Datei.</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => void vorschauUebernehmen()} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"><Save size={12} />Diese Liste speichern</button>
                  <button onClick={() => setVorschau(null)} disabled={busy} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Verwerfen</button>
                </div>
              </div>
            )}

            {meldung && (
              <div className={`flex items-start gap-2 px-3 py-2 rounded-md text-xs border text-foreground ${meldung.ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10'}`} data-meldung={meldung.ok ? 'ok' : 'fehler'}>
                {meldung.ok ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-px" /> : <AlertTriangle size={13} className="text-red-500 shrink-0 mt-px" />}
                <span className="flex-1">{meldung.text}</span>
                <button onClick={() => setMeldung(null)} className="text-muted-foreground hover:text-foreground">×</button>
              </div>
            )}

            {/* Abgleich */}
            {liste && abgleich && (
              <div className="space-y-2">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[16rem]">
                    <h3 className="text-sm font-semibold text-foreground">Fehlende Server</h3>
                    <p className="text-xs text-muted-foreground">
                      {abgleich.zeilen.length === 0
                        ? 'Alle aktiven Server der Liste stehen schon in der Standort-Übersicht und als Kachel.'
                        : `${alleInv.length} fehlen in der Standort-Übersicht · ${alleKachel.length} fehlen als Server-Kachel. Vorhandene Einträge werden nicht verändert.`}
                    </p>
                  </div>
                  {abgleich.zeilen.length > 0 && (
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>alle:</span>
                      <button onClick={() => setAlle('inv', true)} className="hover:text-foreground underline">Standort an</button>
                      <button onClick={() => setAlle('inv', false)} className="hover:text-foreground underline">aus</button>
                      <span className="text-border">|</span>
                      <button onClick={() => setAlle('kachel', true)} className="hover:text-foreground underline">Kachel an</button>
                      <button onClick={() => setAlle('kachel', false)} className="hover:text-foreground underline">aus</button>
                    </div>
                  )}
                </div>
                {abgleich.zeilen.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs" data-abgleich>
                      <thead className="bg-muted/20 text-muted-foreground">
                        <tr>
                          <th className="px-2.5 py-1.5 text-left font-medium w-24"><span className="inline-flex items-center gap-1"><MapPin size={11} />Standort</span></th>
                          <th className="px-2.5 py-1.5 text-left font-medium w-20"><span className="inline-flex items-center gap-1"><Server size={11} />Kachel</span></th>
                          <th className="px-2.5 py-1.5 text-left font-medium">Server</th>
                          <th className="px-2.5 py-1.5 text-left font-medium">Anwendung</th>
                          <th className="px-2.5 py-1.5 text-left font-medium">Plattform / Umgebung</th>
                          <th className="px-2.5 py-1.5 text-left font-medium w-32">Ping</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {abgleich.zeilen.map(z => {
                          const a = auswahl[z.host] ?? { inv: false, kachel: false }
                          const up = erreichbar?.has(z.host)
                          return (
                            <tr key={z.host} className="align-top" data-zeile={z.host}>
                              <td className="px-2.5 py-1.5">
                                {z.fehltImInventar && !z.andereKategorie
                                  ? <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-primary" checked={a.inv} data-feld="inv" onChange={e => setAuswahl(p => ({ ...p, [z.host]: { ...a, inv: e.target.checked } }))} />eintragen</label>
                                  : z.andereKategorie ? <span className="text-amber-500" title="Steht in der Standort-Übersicht unter einer anderen Kategorie — wird nicht doppelt angelegt">unter „{z.andereKategorie}"</span>
                                    : <span className="text-muted-foreground">vorhanden</span>}
                              </td>
                              <td className="px-2.5 py-1.5">
                                {z.fehltAlsKachel
                                  ? <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-primary" checked={a.kachel} data-feld="kachel" onChange={e => setAuswahl(p => ({ ...p, [z.host]: { ...a, kachel: e.target.checked } }))} />anlegen</label>
                                  : <span className="text-muted-foreground">vorhanden</span>}
                              </td>
                              <td className="px-2.5 py-1.5 font-mono font-semibold text-foreground">{z.host}</td>
                              <td className="px-2.5 py-1.5 text-foreground">{z.titel || <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-2.5 py-1.5"><span className="inline-flex flex-wrap gap-1"><PlattformBadge p={z.plattform} />{z.umgebungen.map(u => <UmgebungBadge key={u} u={u} />)}</span></td>
                              <td className="px-2.5 py-1.5 whitespace-nowrap">
                                {!z.fehltAlsKachel ? null : erreichbar === null
                                  ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 size={11} className="animate-spin" />prüft</span>
                                  : up ? <span className="inline-flex items-center gap-1 text-emerald-500" data-ping="ja"><Wifi size={11} />antwortet</span>
                                    : <span className="inline-flex items-center gap-1 text-muted-foreground" data-ping="nein" title="Antwortet nicht auf Ping (z. B. Azure oder Firewall) — Kachel bekommt keine Mail-Meldungen, bis du sie einschaltest"><WifiOff size={11} />keine Antwort</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {alleKachel.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Neue Kacheln bekommen die Mail-Meldungen wie die übrigen Server — aber nur, wenn der Server gerade auf Ping antwortet. Sonst kämen sofort Offline-Mails für Server, die von hier aus nicht erreichbar sind.</p>
                )}
              </div>
            )}

            {/* Nicht übernommen */}
            {abgleich && abgleich.nichtUebernommen.length > 0 && (
              <div className="rounded-lg border border-border">
                <button onClick={() => setZeigeRest(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                  {zeigeRest ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {abgleich.nichtUebernommen.length} Einträge werden nicht übernommen (gelöscht, offline oder kein Rechnername) — stehen trotzdem im Steckbrief
                </button>
                {zeigeRest && (
                  <div className="px-3 pb-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                    {abgleich.nichtUebernommen.map(n => <div key={n.host} className="flex gap-2"><span className="font-mono text-foreground">{n.host}</span><span className="text-muted-foreground">{n.grund}</span></div>)}
                  </div>
                )}
              </div>
            )}
          </>)}
        </div>

        {/* Fuß */}
        <div className="shrink-0 px-5 py-3 border-t border-border flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{invHosts.length} in die Standort-Übersicht · {kachelHosts.length} Kachel{kachelHosts.length === 1 ? '' : 'n'}</span>
          <button onClick={onClose} disabled={busy} className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Schließen</button>
          <button onClick={() => void uebernehmen()} disabled={busy || laedt || (!invHosts.length && !kachelHosts.length) || (kachelHosts.length > 0 && erreichbar === null)} data-knopf="uebernehmen"
            title={kachelHosts.length > 0 && erreichbar === null ? 'Ping läuft noch …' : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}Übernehmen
          </button>
        </div>
      </div>
    </div>
  )
}
