// ── Software-Inventar → „Software suchen" ─────────────────────────────────────
// Software suchen und auswählen (auch mehrere, z. B. zwei Schreibweisen derselben
// Software) → je PC: Hostname · Corp-ID · Name · Modell · Kommentar · Standort.
// Export als PDF (mit klickbaren Kartenseiten) und Excel (mit Kartenblättern).

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Search, Package, Loader2, FileText, FileSpreadsheet, MapPin, X, CheckSquare, Square, RefreshCw } from 'lucide-react'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { PersonInfoButton } from '../person/PersonDossier'
import { useAppStore } from '../../store/appStore'
import { useMapIntentStore } from '../../store/mapIntentStore'
import { foldName } from '../../utils/nameMatch'
import { ladeSoftwareIndex, baueErgebnis, ergaenzeCorpIds, type SoftwareIndex, type SoftwareTreffer, type SucheZeile } from '../../services/softwareSuche'
import { exportSuchePdf, exportSucheExcel } from '../../services/softwareSucheExport'
import type { Screen } from '../../types'

const MAX_LISTE = 200

function fmt(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function SoftwareSuche({ onBack }: { onBack: () => void }) {
  const [index, setIndex] = useState<SoftwareIndex | null>(null)
  const [laden, setLaden] = useState(true)
  const [suche, setSuche] = useState('')
  const [gewaehlt, setGewaehlt] = useState<SoftwareTreffer[]>([])
  const [zeilen, setZeilen] = useState<SucheZeile[] | null>(null)
  const [baut, setBaut] = useState(false)
  const [ad, setAd] = useState<{ d: number; t: number } | null>(null)
  const [exportiert, setExportiert] = useState<'' | 'pdf' | 'xlsx'>('')
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => { void ladeSoftwareIndex().then(i => { setIndex(i); setLaden(false) }) }, [])

  // Trefferliste: jedes Suchwort muss im Namen oder Hersteller vorkommen
  const treffer = useMemo(() => {
    const w = foldName(suche).split(/\s+/).filter(Boolean)
    if (!index || !w.length) return []
    return index.eintraege.filter(e => { const t = foldName(`${e.name} ${e.publisher}`); return w.every(x => t.includes(x)) })
  }, [index, suche])

  const istGewaehlt = (t: SoftwareTreffer) => gewaehlt.some(g => g.key === t.key)
  function umschalten(t: SoftwareTreffer) {
    setGewaehlt(g => (g.some(x => x.key === t.key) ? g.filter(x => x.key !== t.key) : [...g, t]))
  }

  // Ergebnis neu bauen, sobald sich die Auswahl ändert; fehlende Corp-IDs danach aus dem AD
  useEffect(() => {
    if (!gewaehlt.length) { setZeilen(null); return }
    let abbruch = false
    setBaut(true)
    void baueErgebnis(gewaehlt).then(async z => {
      if (abbruch) return
      setZeilen(z); setBaut(false)
      if (z.some(x => !x.corpId && x.name)) {
        setAd({ d: 0, t: 0 })
        try {
          const mit = await ergaenzeCorpIds(z, (d, t) => { if (!abbruch) setAd({ d, t }) })
          if (!abbruch) setZeilen(mit)
        } finally { if (!abbruch) setAd(null) }
      }
    })
    return () => { abbruch = true }
  }, [gewaehlt])

  const sichtbar = useMemo(() => {
    const w = foldName(filter).split(/\s+/).filter(Boolean)
    if (!zeilen || !w.length) return zeilen ?? []
    return zeilen.filter(z => { const t = foldName([z.hostname, z.corpId, z.name, z.modell, z.kommentar, z.standort?.label, z.standort?.arbeitsplatz].join(' ')); return w.every(x => t.includes(x)) })
  }, [zeilen, filter])

  const titel = gewaehlt.length === 1 ? `Software-Suche: ${gewaehlt[0].name}` : `Software-Suche: ${gewaehlt.length} Programme`
  async function exportieren(art: 'pdf' | 'xlsx') {
    if (!sichtbar.length) return
    setExportiert(art); setMeldung(null)
    const kopf = { titel, software: gewaehlt.map(g => g.name), scanStand: fmt(index?.stand) }
    const r = art === 'pdf' ? await exportSuchePdf(sichtbar, kopf) : await exportSucheExcel(sichtbar, kopf)
    setExportiert('')
    if (r.cancelled) return
    setMeldung(r.ok ? { ok: true, text: `${art === 'pdf' ? 'PDF' : 'Excel'} gespeichert und geöffnet.` } : { ok: false, text: 'Export fehlgeschlagen: ' + (r.error || 'unbekannt') })
  }

  function zurKarte(z: SucheZeile) {
    if (!z.standort) return
    useMapIntentStore.getState().setIntent({ screen: z.standort.mapId as Screen, hostname: z.hostname, mode: 'focus' })
    useAppStore.getState().setScreen(z.standort.mapId as Screen)
  }

  const mitStandort = (zeilen ?? []).filter(z => z.standort).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-6 py-4 border-b border-border flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"><ChevronLeft size={18} /></button>
        <Search size={22} className="text-primary" />
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-lg font-bold text-foreground">Software suchen</h1>
          <p className="text-xs text-muted-foreground">
            {index ? <>{index.eintraege.length} Programme auf {index.pcAnzahl} gescannten PCs{index.stand && <> · Scan-Stand {fmt(index.stand)}</>}</> : 'Lade Scan-Daten…'}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_1fr]">
        {/* Links: Suche + Auswahl */}
        <div className="min-h-0 flex flex-col border-r border-border">
          <div className="p-3 space-y-2 border-b border-border">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={suche} onChange={e => setSuche(e.target.value)} autoFocus placeholder="Software suchen, z. B. „acrobat“, „solidworks 2024“"
                className="w-full pl-8 pr-2 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:border-primary" />
            </div>
            {gewaehlt.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {gewaehlt.map(g => (
                  <span key={g.key} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] bg-primary/15 border border-primary/40 text-foreground">
                    {g.name}<button onClick={() => umschalten(g)} className="p-0.5 rounded-full hover:bg-primary/20"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {laden ? <p className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Lade…</p>
              : !index?.eintraege.length ? <p className="p-4 text-xs text-muted-foreground">Noch keine Software-Scans vorhanden — erst im Software-Inventar scannen.</p>
              : !suche.trim() ? <p className="p-4 text-xs text-muted-foreground">Suchbegriff eingeben. Du kannst mehrere Einträge anhaken (z. B. verschiedene Schreibweisen oder Versionen derselben Software).</p>
              : !treffer.length ? <p className="p-4 text-xs text-muted-foreground">Keine Software gefunden.</p>
              : (
                <>
                  {treffer.slice(0, MAX_LISTE).map(t => {
                    const an = istGewaehlt(t)
                    return (
                      <button key={t.key} onClick={() => umschalten(t)}
                        className={`w-full text-left px-3 py-2 border-b border-border/60 flex items-start gap-2 hover:bg-accent/30 ${an ? 'bg-primary/10' : ''}`}>
                        {an ? <CheckSquare size={15} className="mt-0.5 text-primary shrink-0" /> : <Square size={15} className="mt-0.5 text-muted-foreground shrink-0" />}
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-foreground truncate">{t.name}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">{t.publisher || '—'} · {t.versionen.length > 1 ? `${t.versionen.length} Versionen` : t.versionen[0] || 'ohne Version'}</span>
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold text-foreground">{t.pcs.length} PC{t.pcs.length === 1 ? '' : 's'}</span>
                      </button>
                    )
                  })}
                  {treffer.length > MAX_LISTE && <p className="p-3 text-[11px] text-muted-foreground">… {treffer.length - MAX_LISTE} weitere — Suche genauer eingrenzen.</p>}
                </>
              )}
          </div>
        </div>

        {/* Rechts: Ergebnis */}
        <div className="min-h-0 flex flex-col">
          {!gewaehlt.length ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div className="max-w-sm space-y-2">
                <Package size={34} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-foreground">Links eine Software suchen und anhaken.</p>
                <p className="text-xs text-muted-foreground">Dann erscheinen hier alle PCs mit Hostname, Corp-ID, Name, Modell, Kommentar und Standort — exportierbar als PDF und Excel, jeweils mit Karte.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="shrink-0 px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{baut ? 'Lade…' : `${sichtbar.length}${filter.trim() ? ` von ${zeilen?.length ?? 0}` : ''} PC(s)`}</span>
                {!baut && zeilen && <span className="text-[11px] text-muted-foreground">· {mitStandort} mit Standort auf einer Karte</span>}
                {ad && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><RefreshCw size={11} className="animate-spin" />Corp-IDs aus AD{ad.t ? ` ${ad.d}/${ad.t}` : ''}…</span>}
                <div className="relative ml-auto">
                  <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Ergebnis filtern…"
                    className="pl-6 pr-2 py-1.5 text-xs rounded-md border border-border bg-background w-44 focus:outline-none focus:border-primary" />
                </div>
                <button onClick={() => void exportieren('pdf')} disabled={!!exportiert || baut || !sichtbar.length}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
                  {exportiert === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}PDF
                </button>
                <button onClick={() => void exportieren('xlsx')} disabled={!!exportiert || baut || !sichtbar.length}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
                  {exportiert === 'xlsx' ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}Excel
                </button>
              </div>
              {meldung && <div className={`mx-4 mt-2 rounded-md border px-3 py-1.5 text-xs ${meldung.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>{meldung.text}</div>}
              <div className="flex-1 min-h-0 overflow-auto m-4 mt-2 rounded-lg border border-border">
                <table className="w-full text-xs border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
                    <tr>{['Hostname', 'Corp-ID', 'Name', 'Modell', 'Kommentar', 'Standort', ...(gewaehlt.length > 1 ? ['Software'] : ['Version'])].map(h => <th key={h} className="text-left font-semibold px-2.5 py-2 border-b border-border whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {sichtbar.map(z => (
                      <tr key={z.hostname} className="hover:bg-accent/10">
                        <td className="px-2.5 py-1.5 border-b border-border whitespace-nowrap"><span className="inline-flex items-center gap-1 font-medium text-foreground">{z.hostname}<DeviceInfoButton hostname={z.hostname} serial={z.serial} /></span></td>
                        <td className="px-2.5 py-1.5 border-b border-border font-mono text-foreground/90">{z.corpId || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2.5 py-1.5 border-b border-border text-foreground/90">{z.name ? <span className="inline-flex items-center gap-1">{z.name}<PersonInfoButton name={z.name} sam={z.corpId || undefined} /></span> : '—'}</td>
                        <td className="px-2.5 py-1.5 border-b border-border text-foreground/90">{z.modell || '—'}</td>
                        <td className="px-2.5 py-1.5 border-b border-border text-muted-foreground max-w-[260px] truncate" title={z.kommentar}>{z.kommentar}</td>
                        <td className="px-2.5 py-1.5 border-b border-border whitespace-nowrap">
                          {z.standort
                            ? <button onClick={() => zurKarte(z)} title="Auf der Karte zeigen" className="inline-flex items-center gap-1 text-primary hover:underline"><MapPin size={12} />{z.standort.label}{z.standort.arbeitsplatz ? ` · ${z.standort.arbeitsplatz}` : ''}</button>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2.5 py-1.5 border-b border-border text-muted-foreground">{gewaehlt.length > 1 ? z.software : z.software.replace(gewaehlt[0].name, '').trim() || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
