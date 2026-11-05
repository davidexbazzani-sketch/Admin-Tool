// ── Standort-Übersicht → Computer: Herkunft der Liste + „Jetzt abgleichen" ────
import { useEffect, useState } from 'react'
import { RefreshCw, Loader, Link2 } from 'lucide-react'
import { loadDevices, loadMeta } from '../../services/endpointDevices'
import { ladeSyncProtokoll, synchronisiereComputer, aktualisiereAdDaten, protokollText, type SyncProtokoll } from '../../services/standortSync'

const fmt = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

export default function ComputerSyncHinweis({ darfAbgleichen, von, onFertig }: { darfAbgleichen: boolean; von: string; onFertig: () => void }) {
  const [p, setP] = useState<SyncProtokoll | null>(null)
  const [laeuft, setLaeuft] = useState('')
  const [meldung, setMeldung] = useState('')

  useEffect(() => { void ladeSyncProtokoll().then(setP) }, [])

  async function abgleichen() {
    setLaeuft('Endgeräte-Übersicht wird gelesen …'); setMeldung('')
    try {
      const [devices, meta] = await Promise.all([loadDevices(), loadMeta()])
      const s = await synchronisiereComputer(devices, von, meta.importedFilename || 'Endgeräte-Übersicht')
      if (!s.ok || !s.protokoll) { setMeldung(s.fehler || 'Abgleich fehlgeschlagen.'); return }
      onFertig()
      setP(s.protokoll); setMeldung(protokollText(s.protokoll))
      setLaeuft('AD-Daten werden geholt …')
      const ad = await aktualisiereAdDaten((f, g) => setLaeuft(`AD-Daten ${f}/${g} …`))
      onFertig()
      setMeldung(`${protokollText(s.protokoll)} · AD: ${ad.ok ? `${ad.aufgeloest} aktualisiert${ad.nichtGefunden ? `, ${ad.nichtGefunden} nicht gefunden` : ''}` : ad.fehler}`)
      setP(await ladeSyncProtokoll())
    } catch (e) {
      setMeldung(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setLaeuft('') }
  }

  return (
    <div className="shrink-0 mx-4 mt-2 px-3 py-2 rounded-md border border-sky-500/40 bg-sky-500/10 text-[11px] text-foreground flex items-start gap-2">
      <Link2 size={13} className="shrink-0 mt-0.5 text-sky-500" />
      <div className="flex-1 min-w-0">
        <p>
          Die Computer-Liste kommt automatisch aus der <b>Endgeräte-Übersicht</b> (nur Hostnamen mit „DE…“ und Status „In use“) — nach jedem Import dort wird sie abgeglichen und die AD-Daten werden nachgeholt.
          {p ? <> Letzter Abgleich: {fmt(p.am)} ({p.von}{p.quelle ? `, ${p.quelle}` : ''}){p.ad ? ` · AD ${fmt(p.ad.am)}` : ''}.</> : ' Noch kein Abgleich gelaufen.'}
        </p>
        {laeuft && <p className="flex items-center gap-1 text-muted-foreground mt-0.5"><Loader size={11} className="animate-spin" />{laeuft}</p>}
        {meldung && <p className="text-foreground mt-0.5">{meldung}</p>}
      </div>
      {darfAbgleichen && (
        <button onClick={() => void abgleichen()} disabled={!!laeuft}
          title="Computer-Liste jetzt aus dem letzten Endgeräte-Import abgleichen und fehlende AD-Daten holen"
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-sky-500/50 text-foreground hover:bg-sky-500/15 disabled:opacity-50">
          <RefreshCw size={11} className={laeuft ? 'animate-spin' : ''} />Jetzt abgleichen
        </button>
      )}
    </div>
  )
}
