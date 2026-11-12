// Knopf „Homeoffice fit?" auf den Mitarbeiter-Kacheln: prüft im AD (nur lesend) Grundrolle,
// Fileshare, SAP Prod/Non Prod und Marine enaio. Fehlt etwas → gelbes Warndreieck, Klick zeigt
// was fehlt + passenden ServiceNow-Bestelllink. Das kleine „i" erklärt, warum.
import { useEffect, useRef, useState } from 'react'
import { Home, Loader2, AlertTriangle, CheckCircle2, Info, ExternalLink, RotateCw, X } from 'lucide-react'
import { useHomeofficeFit, HO_INFO, HO_ROLLEN, antraegeFuer } from '../../services/homeofficeFit'

const api = () => (window as unknown as { electronAPI: { openExternal(u: string): Promise<void> } }).electronAPI

export default function HomeofficeFit({ schluessel, globalId, upn, vorname, name }: {
  schluessel: string; globalId?: string; upn?: string; vorname?: string; name?: string
}) {
  const erg = useHomeofficeFit(s => s.ergebnis[schluessel])
  const laeuft = useHomeofficeFit(s => !!s.laeuft[schluessel])
  const pruefe = useHomeofficeFit(s => s.pruefe)
  const [offen, setOffen] = useState<'' | 'details' | 'info'>('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!offen) return
    const zu = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOffen('') }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen('') }
    document.addEventListener('mousedown', zu); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', zu); document.removeEventListener('keydown', esc) }
  }, [offen])

  const start = () => { void pruefe(schluessel, { globalId, upn, vorname, name }) }
  const fehlt = erg?.ok ? erg.fehlt : []
  const fit = !!erg?.ok && fehlt.length === 0

  return (
    <div ref={box} className="relative shrink-0 flex items-center gap-0.5" data-homeoffice-fit>
      <button onClick={() => (erg && !laeuft ? setOffen(offen === 'details' ? '' : 'details') : start())} disabled={laeuft}
        title={laeuft ? 'Prüfe im AD …' : erg ? 'Ergebnis anzeigen' : 'Im AD prüfen, ob alle Homeoffice-Berechtigungen da sind'}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors ${
          fit ? 'border-green-500/40 text-green-500 hover:bg-green-500/10'
            : fehlt.length ? 'border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'}`}>
        {laeuft ? <Loader2 size={12} className="animate-spin" />
          : fit ? <CheckCircle2 size={12} />
            : fehlt.length ? <AlertTriangle size={13} className="text-yellow-500" data-ho-warnung />
              : erg && !erg.ok ? <AlertTriangle size={12} className="text-muted-foreground" />
                : <Home size={12} />}
        {fit ? 'Homeoffice fit' : fehlt.length ? `Homeoffice: ${fehlt.length} ${fehlt.length === 1 ? 'fehlt' : 'fehlen'}` : 'Homeoffice fit?'}
      </button>
      <button onClick={() => setOffen(offen === 'info' ? '' : 'info')} title={HO_INFO} aria-label="Warum diese Berechtigungen?"
        className="p-0.5 rounded-full text-muted-foreground hover:text-foreground">
        <Info size={12} />
      </button>

      {offen === 'info' && (
        <div className="absolute right-0 top-full mt-1 z-40 w-80 rounded-lg border border-border bg-card shadow-xl p-3 text-[11px] text-foreground" data-ho-info>
          <p className="font-semibold mb-1 flex items-center gap-1"><Info size={12} className="text-blue-400" />Grundvoraussetzung fürs Homeoffice</p>
          <p className="text-muted-foreground mb-2">{HO_INFO}</p>
          <ul className="space-y-0.5">
            {HO_ROLLEN.map(r => <li key={r.id}>• {r.titel} <span className="font-mono text-[10px] text-muted-foreground">({r.gruppen[0]})</span></li>)}
          </ul>
        </div>
      )}

      {offen === 'details' && erg && (
        <div className="absolute right-0 top-full mt-1 z-40 w-96 rounded-lg border border-border bg-card shadow-xl p-3 text-[11px] text-foreground" data-ho-details>
          <div className="flex items-center gap-1 mb-2">
            <p className="font-semibold">Homeoffice-Berechtigungen{erg.konto ? ` · ${erg.konto}` : ''}</p>
            <button onClick={() => setOffen('')} className="ml-auto p-0.5 text-muted-foreground hover:text-foreground"><X size={12} /></button>
          </div>
          {!erg.ok ? (
            <p className="text-muted-foreground flex items-start gap-1"><AlertTriangle size={12} className="text-yellow-500 shrink-0 mt-0.5" />{erg.fehler}</p>
          ) : (
            <>
              <ul className="space-y-0.5 mb-2">
                {HO_ROLLEN.map(r => {
                  const da = erg.vorhanden.some(v => v.id === r.id)
                  return (
                    <li key={r.id} className="flex items-center gap-1.5">
                      {da ? <CheckCircle2 size={12} className="text-green-500 shrink-0" /> : <AlertTriangle size={12} className="text-yellow-500 shrink-0" />}
                      <span className={da ? 'text-muted-foreground' : 'font-medium'}>{r.titel}</span>
                      {!da && <span className="text-yellow-600 dark:text-yellow-400">fehlt</span>}
                    </li>
                  )
                })}
              </ul>
              {fehlt.length > 0 ? (
                <div className="space-y-1.5 border-t border-border pt-2">
                  <p className="text-muted-foreground">Bestellen in ServiceNow:</p>
                  {antraegeFuer(fehlt).map(a => (
                    <button key={a.link} onClick={() => void api().openExternal(a.link)}
                      className="w-full text-left flex items-start gap-1.5 px-2 py-1.5 rounded-md border border-border hover:bg-accent">
                      <ExternalLink size={12} className="text-blue-400 shrink-0 mt-0.5" />
                      <span><span className="text-blue-400 underline">{a.antrag}</span><br /><span className="text-muted-foreground">für: {a.rollen.join(', ')}</span></span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-green-500">Alle Grundvoraussetzungen fürs Homeoffice sind da.</p>}
              {erg.fehler && <p className="text-muted-foreground mt-1.5">{erg.fehler}</p>}
            </>
          )}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
            <span className="text-[10px] text-muted-foreground">geprüft {new Date(erg.geprueftAm).toLocaleString('de-DE')} · nur lesend</span>
            <button onClick={() => { setOffen(''); start() }} className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:bg-accent">
              <RotateCw size={11} />Neu prüfen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
