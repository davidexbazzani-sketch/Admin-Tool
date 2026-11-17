// ── Proaktives Radar → PC-Fehler → „Alle Fehler exportieren“ ──────────────────
// Liest die Fehlerdaten ALLER gelesenen PCs vom Netzlaufwerk (asynchron, Oberfläche bleibt
// bedienbar), fasst sie zu Fehlerarten zusammen (src/pcFehler/export.ts) und speichert sie als
// Markdown. Die Datei ist für die Auswertung gedacht: Daraus werden Regeln und Lösungen gebaut,
// die mit dem nächsten Update im Tool stehen. Es wird nichts an PCs gelesen oder geändert.
import { useEffect, useState } from 'react'
import { FileDown, Loader2, X, Copy, Check, AlertTriangle, Info } from 'lucide-react'
import { api } from '../../electronAPI'
import { ladeAllePcDateien } from '../../pcFehler/speicher'
import { sammleExport, exportMarkdown, type ExportDaten, type LoesungsInfo } from '../../pcFehler/export'
import type { Befund } from '../../pcFehler/auswertung'
import { planeFix } from '../../pcFehler/beheben'
import { ladeIndex } from '../../problemAssistent/ProblemAssistent'
import { erkenne } from '../../problemAssistent/suche'
import { KERNPROBLEME } from '../../problemAssistent/katalog'
import { ladeTestStand } from '../../befehlsTest/stand'
import type { BtStand } from '../../befehlsTest/types'

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))
const d2 = (n: number) => String(n).padStart(2, '0')

export default function PcFehlerExport({ von, modell, onClose }: { von: string; modell: (host: string) => string; onClose: () => void }) {
  const [phase, setPhase] = useState<'laden' | 'auswerten' | 'fertig' | 'fehler'>('laden')
  const [fortschritt, setFortschritt] = useState({ f: 0, g: 0 })
  const [daten, setDaten] = useState<ExportDaten | null>(null)
  const [md, setMd] = useState('')
  const [fehler, setFehler] = useState('')
  const [meldung, setMeldung] = useState('')
  const [kopiert, setKopiert] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  useEffect(() => {
    let weg = false
    ;(async () => {
      const dateien = await ladeAllePcDateien((f, g) => { if (!weg) setFortschritt({ f, g }) })
      if (weg) return
      if (!dateien) { setFehler('Das Netzlaufwerk ist nicht erreichbar – die Fehlerdaten konnten nicht gelesen werden.'); setPhase('fehler'); return }
      setPhase('auswerten')
      const [index, test] = await Promise.all([ladeIndex(), ladeTestStand().catch((): BtStand => ({}))])
      if (weg) return
      await new Promise(r => setTimeout(r, 30))   // Oberfläche „wird ausgewertet“ zeichnen lassen
      const d = sammleExport(dateien)
      // Lösungsweg je Suchtext: dieselbe Erkennung wie „Gib dein Problem ein“ und „Lösung öffnen“
      const cache = new Map<string, LoesungsInfo>()
      const loesung = (suche: string, befund: Befund): LoesungsInfo => {
        const k = `${befund.regel}|${suche}`
        const alt = cache.get(k)
        if (alt) return alt
        const e = erkenne(index, suche, { kern: KERNPROBLEME })
        const p = e.vorschlag?.p || e.treffer[0]?.p || null
        let info: LoesungsInfo = { sicherheit: e.sicherheit, sicher: false, schritte: 0 }
        if (p) {
          // wie im Radar: Vorschlag, sonst bester Treffer (der wird im Export als unsicher markiert)
          const plan = planeFix('PC', undefined, befund, p, test)
          info = {
            problemId: p.id, problemTitel: p.titel, sicherheit: e.sicherheit, sicher: !!e.vorschlag,
            loesung: p.loesung.split(/(?<=[.!?])\s/)[0], schritte: p.schritte.length,
            unbemerkt: plan.schritte.filter(s => !s.liest).map(s => s.titel), grund: plan.grund,
          }
        }
        cache.set(k, info)
        return info
      }
      const text = exportMarkdown(d, { von, loesung, modell })
      if (weg) return
      setDaten(d); setMd(text); setPhase('fertig')
    })().catch(e => { if (!weg) { setFehler(`Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`); setPhase('fehler') } })
    return () => { weg = true }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function speichern() {
    setMeldung('')
    try {
      const j = new Date()
      const ziel = await api().saveFileDialog(`PC-Fehler_alle_${j.getFullYear()}-${d2(j.getMonth() + 1)}-${d2(j.getDate())}.md`, [{ name: 'Markdown', extensions: ['md'] }])
      if (!ziel) return
      const pfad = /\.md$/i.test(ziel) ? ziel : `${ziel}.md`
      const r = await api().writeFile(pfad, b64(md))
      setMeldung(r?.success ? `Gespeichert: ${pfad}` : `Speichern fehlgeschlagen${r?.error ? `: ${r.error}` : ''}`)
    } catch (e) { setMeldung(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`) }
  }
  async function kopieren() {
    try { await navigator.clipboard.writeText(md); setKopiert(true); setTimeout(() => setKopiert(false), 2000) }
    catch { setMeldung('Kopieren nicht möglich – bitte „Speichern unter …“ nehmen.') }
  }

  const kb = Math.max(1, Math.round(new Blob([md]).size / 1024))
  const kachel = (zahl: number, text: string, art: string, ton = 'text-foreground') => (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2" data-export-zahl={art}>
      <p className={`text-lg font-semibold tabular-nums ${ton}`}>{zahl.toLocaleString('de-DE')}</p>
      <p className="text-[11px] text-muted-foreground leading-tight">{text}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[55] bg-black/60 flex items-center justify-center p-6" onClick={onClose} data-fehler-export data-export-phase={phase}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <FileDown size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Alle Fehler exportieren</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent" title="Schließen"><X size={16} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3 text-xs">
          {(phase === 'laden' || phase === 'auswerten') && (
            <div className="py-8 space-y-3">
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={15} className="animate-spin" />
                {phase === 'laden' ? `Lese die Fehlerdaten der PCs … ${fortschritt.g ? `${fortschritt.f} / ${fortschritt.g}` : ''}` : 'Fasse zusammen und suche die Lösungswege …'}
              </p>
              {phase === 'laden' && fortschritt.g > 0 && (
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mx-auto max-w-sm"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round((fortschritt.f / fortschritt.g) * 100)}%` }} /></div>
              )}
              <p className="text-center text-[11px] text-muted-foreground">Gelesen wird nur die Ablage auf dem Netzlaufwerk – an den PCs passiert nichts.</p>
            </div>
          )}

          {phase === 'fehler' && <p className="text-red-500 flex gap-1.5 py-6" data-export-fehler><AlertTriangle size={14} className="mt-0.5 shrink-0" />{fehler}</p>}

          {phase === 'fertig' && daten && (
            <>
              <div className="grid grid-cols-4 gap-2">
                {kachel(daten.pcsMitDaten, 'PCs mit Daten', 'pcs')}
                {kachel(daten.bekannt.length, 'bekannte Fehlerbilder (mit Lösungsweg)', 'bekannt')}
                {kachel(daten.unbekannt.length, 'nicht zugeordnet (noch ohne Lösung)', 'unbekannt', daten.unbekannt.length ? 'text-amber-500' : 'text-foreground')}
                {kachel(daten.rauschen.length, 'als harmlos ausgeblendet', 'rauschen')}
              </div>
              {daten.pcsMitDaten > 0 && (
                <p className="text-muted-foreground">
                  Gelesen zwischen {new Date(daten.vonAm).toLocaleDateString('de-DE')} und {new Date(daten.bisAm).toLocaleDateString('de-DE')} · je PC die Fehler der 7 Tage davor · {daten.pcsMitBefund} PCs mit Befund
                  {daten.pcsVeraltet ? ` · ${daten.pcsVeraltet} PCs mit einem Stand älter als ${daten.maxAlterTage} Tage nicht berücksichtigt` : ''}
                </p>
              )}
              {daten.pcsTeilweise > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 flex gap-2" data-export-teilweise>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                  <span className="text-foreground">
                    Von {daten.pcsTeilweise === daten.pcsMitDaten ? 'allen' : daten.pcsTeilweise} PCs liegen nur Daten der älteren Version vor: bekannte Fehlerbilder und die 40 häufigsten nicht zugeordneten Fehler, kein Rauschen.
                    Ab dieser Version speichert die Fehlersuche alle Fehler je PC – <b>nach dem nächsten Lauf ist der Export vollständig</b>.
                  </span>
                </div>
              )}
              {daten.pcsMitDaten === 0 && <p className="text-muted-foreground py-2">Es liegen noch keine Fehlerdaten vor – der erste Lauf der Proaktiven Fehlersuche steht noch aus.</p>}

              {daten.unbekannt.length > 0 && (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Häufigste Fehler ohne Zuordnung</p>
                  <ul className="rounded-md border border-border divide-y divide-border/60">
                    {daten.unbekannt.slice(0, 8).map(a => (
                      <li key={a.schluessel} className="px-2.5 py-1.5 flex items-center gap-2" data-export-vorschau={a.nr}>
                        <span className="font-mono text-muted-foreground w-10 shrink-0">{a.nr}</span>
                        <span className="text-foreground truncate min-w-0" title={a.schluessel}>{a.titel}</span>
                        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{a.pcs.size} PC{a.pcs.size === 1 ? '' : 's'} · {a.ereignisse.toLocaleString('de-DE')}×</span>
                      </li>
                    ))}
                  </ul>
                  {daten.unbekannt.length > 8 && <p className="text-[11px] text-muted-foreground">… und {daten.unbekannt.length - 8} weitere in der Datei.</p>}
                </div>
              )}

              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 flex gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                  <span className="text-foreground">Gib diese Datei an Claude weiter.</span> Für jede Fehlerart ohne Lösung entstehen dann eine Erkennung und ein Lösungsweg – nach dem nächsten Update stehen sie hier im Radar.
                  Personennamen sind nicht enthalten; Benutzernamen, Mailadressen und Dokumentnamen in den Fehlertexten sind unkenntlich gemacht.
                </span>
              </div>
              {meldung && <p className="text-[11px] text-muted-foreground break-all" data-export-meldung>{meldung}</p>}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{phase === 'fertig' ? `Markdown · ${kb} KB` : ''}</span>
          <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground">Schließen</button>
          {phase === 'fertig' && (
            <>
              <button onClick={() => void kopieren()} data-export-kopieren className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-accent">
                {kopiert ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}{kopiert ? 'Kopiert' : 'Als Text kopieren'}
              </button>
              <button onClick={() => void speichern()} data-export-speichern className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold">
                <FileDown size={13} />Speichern unter …
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
