// ── „Gib dein Problem ein“ → optional: Treiber prüfen (HP-Katalog) und passende empfehlen ──
// Nutzt die vorhandene Treiber-Installation (src/services/hpDrivers.ts: HP CMSL am Admin-PC,
// installierte Treiber per WinRM). BIOS und Firmware werden NIE angeboten. Läuft nur auf Klick
// (dauert einige Minuten) und installiert nur, was der Admin ausdrücklich bestätigt.
import { useMemo, useState } from 'react'
import { Cpu, Loader2, CheckCircle2, XCircle, AlertTriangle, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { installierbar, type DriverItem, type HpHostReport } from '../services/hpDrivers'
import type { PaBereich, PaProblem } from './types'

/** Passende HP-Treiberkategorien je Problem (Kategorie bzw. Name des SoftPaqs). */
function themaMuster(p: PaProblem): { muster: RegExp; text: string } | null {
  const t = (p.titel + ' ' + p.stichworte.join(' ')).toLowerCase()
  const b: PaBereich = p.bereich
  if (b === 'WLAN' || /wlan|wifi|wi-fi|wireless/.test(t)) return { muster: /network|wireless|wlan|wi-?fi|bluetooth/i, text: 'WLAN/Netzwerk' }
  if (b === 'Netzwerk & Internet' || /lan-|ethernet|netzwerkkarte|netzwerkadapter/.test(t)) return { muster: /network|ethernet|lan|nic|wireless/i, text: 'Netzwerk' }
  if (b === 'Audio & Headset' || b === 'Kamera & Mikrofon' || /headset|mikrofon|kamera|webcam|lautsprecher|kein ton/.test(t)) return { muster: /audio|sound|camera|webcam|video|realtek|conexant|bluetooth|usb/i, text: 'Audio/Kamera' }
  if (b === 'Bildschirm & Grafik' || /bildschirm|monitor|grafik|dock|beamer|display/.test(t)) return { muster: /graphic|display|video|thunderbolt|dock|usb/i, text: 'Grafik/Dock' }
  if (b === 'Hardware & Geräte' || b === 'Akku & Energie' || /bluetooth|usb|maus|tastatur|touchpad|akku|dock/.test(t)) return { muster: /chipset|usb|thunderbolt|dock|keyboard|mouse|input|touchpad|bluetooth|serial|battery|power|wireless/i, text: 'Hardware' }
  return null
}

/** Soll die Treiberprüfung bei diesem Problem angeboten werden? */
export function treiberRelevant(p: PaProblem): boolean { return !!themaMuster(p) }

const anbietbar = (i: DriverItem) => i.klasse !== 'bios' && i.klasse !== 'firmware' && !i.ohneHardwareBezug && installierbar(i).ok

export default function TreiberCheck({ host, problem, by }: { host: string; problem: PaProblem; by: string }) {
  const thema = useMemo(() => themaMuster(problem), [problem])
  const [offen, setOffen] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [bericht, setBericht] = useState<HpHostReport | null>(null)
  const [fehler, setFehler] = useState('')
  const [wahl, setWahl] = useState<Set<string>>(new Set())
  const [weitereOffen, setWeitereOffen] = useState(false)
  const [installiert, setInstalliert] = useState<{ laeuft: boolean; text: string; ok?: boolean } | null>(null)

  const { passend, weitere } = useMemo(() => {
    const alle = (bericht?.items || []).filter(anbietbar)
    const pass = alle.filter(i => thema && thema.muster.test(i.category + ' ' + i.name))
    return { passend: pass, weitere: alle.filter(i => !pass.includes(i)) }
  }, [bericht, thema])

  async function pruefe() {
    setLaeuft(true); setFehler(''); setBericht(null); setInstalliert(null)
    try {
      const { scanOneHost } = await import('../services/hpDrivers')
      const r = await scanOneHost(host)
      if (r.error && !r.items.length) setFehler(r.error)
      setBericht(r)
      // Empfehlung: passende, sicher zugeordnete, veraltete Treiber vorauswählen
      const vor = r.items.filter(anbietbar).filter(i => thema && thema.muster.test(i.category + ' ' + i.name) && i.status === 'veraltet' && !i.matchUnsicher)
      setWahl(new Set(vor.map(i => i.softpaqId)))
    } catch (e) { setFehler(e instanceof Error ? e.message : String(e)) }
    setLaeuft(false)
  }

  async function installiere() {
    if (!bericht) return
    const items = bericht.items.filter(i => wahl.has(i.softpaqId) && anbietbar(i))
    if (!items.length) return
    if (!window.confirm(`${items.length} Treiber auf ${host} installieren?\n\n${items.map(i => '• ' + i.name + ' ' + i.latestVersion).join('\n')}\n\nDer Benutzer bekommt vorher und nachher eine Nachricht. Bild, Ton oder Netz können kurz aussetzen. BIOS/Firmware werden nicht angefasst.`)) return
    setInstalliert({ laeuft: true, text: 'Treiber werden geladen und installiert …' })
    try {
      const { deployOneHost } = await import('../services/hpDrivers')
      const r = await deployOneHost(host, items, { rebootMode: 'notify', by, notifyUser: true, ausloeser: { art: 'manuell', quelle: 'Gib dein Problem ein → Treiber prüfen', grund: `Problem „${problem.titel}“` } }, s => setInstalliert({ laeuft: true, text: s.phase }))
      const ok = r.ergebnisse?.length ? r.ergebnisse.filter(e => e.verifiziert).length : r.perItem.filter(e => e.ok).length
      setInstalliert({ laeuft: false, ok: ok === items.length, text: `${ok} von ${items.length} Treiber(n) installiert${r.needsReboot ? ' – Neustart nötig (Benutzer wurde informiert)' : ''}.` })
    } catch (e) { setInstalliert({ laeuft: false, ok: false, text: e instanceof Error ? e.message : String(e) }) }
  }

  if (!thema) return null
  const zeile = (i: DriverItem) => (
    <label key={i.softpaqId} className="flex items-start gap-2 text-xs py-0.5 cursor-pointer">
      <input type="checkbox" className="mt-0.5 accent-primary" checked={wahl.has(i.softpaqId)} onChange={() => setWahl(w => { const n = new Set(w); n.has(i.softpaqId) ? n.delete(i.softpaqId) : n.add(i.softpaqId); return n })} />
      <span className="min-w-0">
        <span className="text-foreground">{i.name}</span>
        <span className="text-muted-foreground"> · installiert {i.installedVersion || 'unbekannt'} → neu {i.latestVersion}{i.releaseDate ? ` (${i.releaseDate})` : ''}</span>
        {i.klasse === 'kritisch' && <span className="ml-1 text-amber-600 dark:text-amber-400">· kritisch (Bild/Ton/Netz setzen kurz aus)</span>}
        {i.matchUnsicher && <span className="ml-1 text-muted-foreground">· Zuordnung unsicher</span>}
      </span>
    </label>
  )

  return (
    <div className="rounded-md border border-dashed border-primary/40 px-3 py-2 space-y-2" data-treiber-check>
      <button onClick={() => setOffen(!offen)} className="w-full flex items-center gap-2 text-left">
        <Cpu size={14} className="text-primary shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-foreground">Optional: Treiber prüfen ({thema.text}) – dauert einige Minuten</span>
          <span className="block text-[11px] text-muted-foreground">Veraltete Treiber sind oft die Ursache. Vergleicht die installierten Treiber mit dem HP-Katalog dieses Modells und empfiehlt, welche aktualisiert werden sollten (ohne BIOS/Firmware).</span>
        </span>
        {offen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {offen && (
        <div className="space-y-2 pl-6">
          {!bericht && !laeuft && (
            <button onClick={() => { void pruefe() }} disabled={!host} data-treiber-pruefen className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/10 disabled:opacity-50">
              <Cpu size={13} />Treiber auf {host || '…'} prüfen
            </button>
          )}
          {laeuft && <p className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Treiber werden mit dem HP-Katalog verglichen (einige Minuten) …</p>}
          {fehler && <p className="text-xs text-red-600 dark:text-red-400 inline-flex items-center gap-1.5"><XCircle size={13} />{fehler}</p>}
          {bericht && !laeuft && (
            <>
              <p className="text-[11px] text-muted-foreground">{bericht.model} · {bericht.items.length} Treiber im HP-Katalog geprüft{bericht.catalogStale ? ' · Katalog veraltet (HP nicht erreichbar)' : ''}</p>
              {passend.length ? (
                <div>
                  <p className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5"><AlertTriangle size={13} className="text-amber-500" />Empfohlen für dieses Problem ({passend.length})</p>
                  {passend.map(zeile)}
                </div>
              ) : <p className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5"><CheckCircle2 size={13} />Die zum Problem passenden Treiber ({thema.text}) sind aktuell – an ihnen liegt es nicht.</p>}
              {weitere.length > 0 && (
                <div>
                  <button onClick={() => setWeitereOffen(!weitereOffen)} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">{weitereOffen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{weitere.length} weitere veraltete Treiber (nicht zum Problem)</button>
                  {weitereOffen && <div className="pl-3">{weitere.map(zeile)}</div>}
                </div>
              )}
              {(passend.length > 0 || weitere.length > 0) && !installiert?.laeuft && (
                <button onClick={() => { void installiere() }} disabled={!wahl.size} data-treiber-installieren className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40">
                  <Download size={13} />{wahl.size} ausgewählte(n) Treiber installieren
                </button>
              )}
              {installiert && <p className={`text-xs inline-flex items-center gap-1.5 ${installiert.laeuft ? 'text-muted-foreground' : installiert.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{installiert.laeuft ? <Loader2 size={13} className="animate-spin" /> : installiert.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{installiert.text}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
