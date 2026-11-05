// ── Logbuch der Software-Installationen ──────────────────────────────────────
// Wer hat wann was auf welchem PC installiert, mit welchem Ergebnis. In jeder Kachel
// (gefiltert auf deren Software) und auf der Übersicht (alle).

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BookOpen, CheckCircle2, CircleSlash, Clock, Loader2, RefreshCw, Search, XCircle } from 'lucide-react'
import { DeviceInfoButton } from '../device/DeviceDossier'
import {
  ladeInstallLogbuch, ohneRueckmeldung, useInstallLogVersion, OHNE_RUECKMELDUNG_STUNDEN,
  type InstallLogEintrag, type InstallSoftware,
} from '../../services/softwareInstallLog'

type Filter = 'alle' | 'ok' | 'fehler' | 'offen'

const SEITE = 50

function zeit(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function dauer(e: InstallLogEintrag): string {
  if (!e.ende) return ''
  const s = Math.max(0, Math.round((Date.parse(e.ende) - Date.parse(e.start)) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

function Ergebnis({ e }: { e: InstallLogEintrag }) {
  const stumm = ohneRueckmeldung(e)
  const [Icon, text, farbe] =
    e.status === 'ok' ? [CheckCircle2, 'erfolgreich', 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10']
    : e.status === 'fehler' ? [XCircle, 'Fehler', 'text-red-300 border-red-500/40 bg-red-500/10']
    : e.status === 'abgebrochen' ? [CircleSlash, 'abgebrochen', 'text-muted-foreground border-border bg-muted/30']
    : stumm ? [AlertTriangle, 'ohne Rückmeldung', 'text-amber-300 border-amber-500/40 bg-amber-500/10']
    : [Loader2, 'läuft', 'text-blue-300 border-blue-500/40 bg-blue-500/10']
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] whitespace-nowrap ${farbe}`}
      title={stumm ? `Seit über ${OHNE_RUECKMELDUNG_STUNDEN} Stunden kein Abschluss — das Tool wurde während des Laufs vermutlich geschlossen.` : undefined}>
      <Icon size={10} className={e.status === 'laeuft' && !stumm ? 'animate-spin' : ''} />{text}
    </span>
  )
}

export default function InstallLogbuch({ software, titel }: { software?: InstallSoftware; titel?: string }) {
  const version = useInstallLogVersion(s => s.v)
  const [alle, setAlle] = useState<InstallLogEintrag[] | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [suche, setSuche] = useState('')
  const [filter, setFilter] = useState<Filter>('alle')
  const [anzahl, setAnzahl] = useState(SEITE)

  async function laden() {
    setLaedt(true)
    setAlle(await ladeInstallLogbuch())
    setLaedt(false)
  }
  useEffect(() => { void laden() }, [version])

  const eigene = useMemo(() => (alle ?? []).filter(e => !software || e.software === software), [alle, software])
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return eigene.filter(e => {
      if (filter === 'ok' && e.status !== 'ok') return false
      if (filter === 'fehler' && e.status !== 'fehler') return false
      if (filter === 'offen' && e.status !== 'laeuft') return false
      if (!q) return true
      return [e.host, e.von, e.software, e.text, e.details || ''].some(x => x.toLowerCase().includes(q))
    })
  }, [eigene, suche, filter])
  const zahl = (f: Filter) => f === 'alle' ? eigene.length : eigene.filter(e => f === 'ok' ? e.status === 'ok' : f === 'fehler' ? e.status === 'fehler' : e.status === 'laeuft').length

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <BookOpen size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">{titel || 'Logbuch'}</span>
        <span className="text-[10px] text-muted-foreground">wer · wann · auf welchem PC · Ergebnis — für alle Admins sichtbar</span>
        <button onClick={() => void laden()} disabled={laedt} title="Neu laden"
          className="ml-auto p-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40">
          <RefreshCw size={11} className={laedt ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => { setSuche(e.target.value); setAnzahl(SEITE) }} placeholder="PC, Person, Meldung …"
            className="pl-6 pr-2 py-1 w-52 text-[11px] rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        </div>
        {(['alle', 'ok', 'fehler', 'offen'] as Filter[]).map(f => (
          <button key={f} onClick={() => { setFilter(f); setAnzahl(SEITE) }}
            className={`px-2 py-0.5 text-[11px] rounded-full border ${filter === f ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {f === 'alle' ? 'Alle' : f === 'ok' ? 'Erfolgreich' : f === 'fehler' ? 'Fehler' : 'Läuft / offen'} ({zahl(f)})
          </button>
        ))}
      </div>

      {alle === null ? (
        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />Logbuch wird geladen …</p>
      ) : !gefiltert.length ? (
        <p className="text-[11px] text-muted-foreground italic">
          {eigene.length ? 'Kein Eintrag passt zum Filter.' : 'Noch keine Installation protokolliert — das Logbuch füllt sich ab jetzt mit jedem Lauf.'}
        </p>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/20 text-muted-foreground">
              <tr className="text-left">
                <th className="px-2 py-1.5 font-medium">Wann</th>
                {!software && <th className="px-2 py-1.5 font-medium">Software</th>}
                <th className="px-2 py-1.5 font-medium">PC</th>
                <th className="px-2 py-1.5 font-medium">Wer</th>
                <th className="px-2 py-1.5 font-medium">Ergebnis</th>
                <th className="px-2 py-1.5 font-medium">Dauer</th>
                <th className="px-2 py-1.5 font-medium">Meldung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {gefiltert.slice(0, anzahl).map(e => (
                <tr key={e.id} className="align-top">
                  <td className="px-2 py-1.5 whitespace-nowrap text-foreground">
                    <span className="inline-flex items-center gap-1"><Clock size={10} className="text-muted-foreground" />{zeit(e.start)}</span>
                  </td>
                  {!software && <td className="px-2 py-1.5 whitespace-nowrap text-foreground">{e.software}</td>}
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 font-mono text-foreground">{e.host}<DeviceInfoButton hostname={e.host} size={10} /></span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-foreground">{e.von}</td>
                  <td className="px-2 py-1.5"><Ergebnis e={e} /></td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums">{dauer(e)}</td>
                  <td className="px-2 py-1.5 text-foreground min-w-[16rem]">
                    <span className="line-clamp-2" title={e.text}>{e.text}</span>
                    {e.details && <span className="block text-[10px] text-muted-foreground">{e.details}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {gefiltert.length > anzahl && (
        <button onClick={() => setAnzahl(a => a + SEITE)} className="text-[11px] text-muted-foreground hover:text-foreground underline">
          weitere {Math.min(SEITE, gefiltert.length - anzahl)} von {gefiltert.length - anzahl} anzeigen
        </button>
      )}
    </div>
  )
}
