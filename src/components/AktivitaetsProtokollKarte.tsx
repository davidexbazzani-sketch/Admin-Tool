// ── Einstellungen → „Aktivitätsprotokoll“ (Admin) ─────────────────────────────
// Wer/was hat wann welchen Eingriff ausgelöst – per Klick oder automatisch (Komplett-Einrichtung,
// Treiber-Rollout, Austritts-Reminder …)? Liest das Protokoll aus services/aktivitaet.ts und zeigt
// zusätzlich einen RÜCKBLICK aus vorhandenen Daten (Komplett-Einrichtungen der Checklisten,
// Treiber-Rollouts), damit auch Vorgänge vor Einführung des Protokolls nachvollziehbar sind.
import { useEffect, useMemo, useState } from 'react'
import { ScrollText, Loader2, RefreshCw, Search, ChevronDown, ChevronRight, Bot, MousePointerClick } from 'lucide-react'
import Card from './Card'
import { ladeAktivitaet, type AktEintrag } from '../services/aktivitaet'

interface Rueck { zeit: string; art: 'automatisch' | 'manuell' | 'unbekannt'; quelle: string; aktion: string; ziel: string; grund?: string; von?: string; details?: string[] }

async function ladeRueckblick(): Promise<Rueck[]> {
  const out: Rueck[] = []
  try {
    const [{ listChecklists }, { loadDeviceSetupState }, { hostFromSerial }] = await Promise.all([
      import('../services/checklists'), import('../services/deviceSetup'), import('../services/deviceMasterData'),
    ])
    const [alle, st] = await Promise.all([listChecklists().catch(() => []), loadDeviceSetupState().catch(() => ({} as Record<string, never>))])
    for (const c of alle) {
      const s = (st as Record<string, { autoSetupDoneAt?: string; autoSetupPingAt?: string; autoSetupOk?: boolean; autoSetupArt?: 'automatisch' | 'manuell'; autoSetupVon?: string; autoSetupAutomatikAus?: boolean; autoSetupSteps?: { label: string; status: string; text?: string }[]; newHostname?: string }>)[c.id]
      if (!s?.autoSetupDoneAt) continue
      const host = (hostFromSerial((c.newDeviceSerial || '').trim()) || '').toUpperCase()
      out.push({
        zeit: s.autoSetupDoneAt, art: s.autoSetupArt || 'unbekannt', quelle: 'Komplett-Einrichtung (Checkliste)',
        aktion: `Komplett-Einrichtung ${s.autoSetupOk ? 'ohne Fehler' : 'mit Fehlern'} beendet`, ziel: host || c.newDeviceSerial || '',
        grund: `Checkliste „${c.name}“ (${c.deviceType === 'refresh' ? 'Refresh' : c.deviceType === 'new' ? 'Neugerät' : c.deviceType})${s.autoSetupArt ? '' : ' – Auslöser wurde vor Einführung des Protokolls nicht gespeichert; die stündliche Automatik richtet neue PCs ein, sobald sie erreichbar sind'}`,
        von: s.autoSetupVon,
        details: (s.autoSetupSteps || []).map(x => `${x.status === 'ok' ? '✓' : x.status === 'fehler' ? '✗' : '–'} ${x.label}${x.text ? ': ' + x.text : ''}`),
      })
    }
  } catch { /* Rückblick ist optional */ }
  try {
    const { loadRollouts } = await import('../services/driverRollout')
    for (const r of await loadRollouts().catch(() => [])) {
      for (const t of Object.values(r.targets)) {
        if (!t.lastAttemptAt) continue
        out.push({ zeit: t.doneAt || t.lastAttemptAt, art: 'unbekannt', quelle: 'Treiber-Rollout', aktion: `Rollout-Ziel ${t.status}`, ziel: t.hostname, grund: `Rollout „${r.name}“ von ${r.createdBy}`, details: t.result?.perItem.map(p => `${p.ok ? '✓' : '✗'} ${p.name}`) || (t.message ? [t.message] : []) })
      }
    }
  } catch { /* optional */ }
  return out.sort((a, b) => b.zeit.localeCompare(a.zeit))
}

const fmt = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) }

function Badge({ art }: { art: string }) {
  if (art === 'automatisch') return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-px rounded bg-violet-600 text-white font-semibold shrink-0"><Bot size={10} />automatisch</span>
  if (art === 'manuell') return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-px rounded bg-muted text-foreground font-semibold shrink-0"><MousePointerClick size={10} />per Klick</span>
  return <span className="text-[10px] px-1.5 py-px rounded border border-border text-muted-foreground shrink-0">Auslöser unbekannt</span>
}

function Zeile({ zeit, art, quelle, aktion, ziel, grund, wer, ergebnis, details }: { zeit: string; art: string; quelle: string; aktion: string; ziel?: string; grund?: string; wer?: string; ergebnis?: string; details?: string[] }) {
  const [offen, setOffen] = useState(false)
  return (
    <div className="px-3 py-2 text-xs" data-akt-zeile>
      <button onClick={() => setOffen(!offen)} className="w-full text-left flex items-start gap-2">
        {details?.length ? (offen ? <ChevronDown size={13} className="mt-0.5 shrink-0" /> : <ChevronRight size={13} className="mt-0.5 shrink-0" />) : <span className="w-[13px] shrink-0" />}
        <span className="font-mono text-muted-foreground shrink-0">{fmt(zeit).slice(11)}</span>
        <Badge art={art} />
        <span className="min-w-0">
          <span className="text-foreground font-medium">{aktion}</span>
          {ziel && <span className="text-foreground"> → {ziel}</span>}
          <span className="block text-[11px] text-muted-foreground">{quelle}{grund ? ` · ${grund}` : ''}</span>
          {(wer || ergebnis) && <span className="block text-[11px] text-muted-foreground">{wer}{wer && ergebnis ? ' · ' : ''}{ergebnis ? `Ergebnis: ${ergebnis}` : ''}</span>}
        </span>
      </button>
      {offen && details?.length ? <ul className="mt-1 ml-7 space-y-0.5 text-[11px] text-foreground/80 font-mono break-all">{details.map((d, i) => <li key={i}>{d}</li>)}</ul> : null}
    </div>
  )
}

export default function AktivitaetsProtokollKarte() {
  const [tage, setTage] = useState(7)
  const [art, setArt] = useState<'alle' | 'automatisch' | 'manuell'>('alle')
  const [suche, setSuche] = useState('')
  const [eintraege, setEintraege] = useState<AktEintrag[] | null>(null)
  const [rueck, setRueck] = useState<Rueck[] | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [rueckOffen, setRueckOffen] = useState(false)

  async function lade() {
    setLaedt(true)
    const [e, r] = await Promise.all([ladeAktivitaet(tage).catch(() => []), ladeRueckblick()])
    setEintraege(e); setRueck(r); setLaedt(false)
  }
  useEffect(() => { void lade() }, [tage]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = suche.trim().toLowerCase()
  const passt = (t: string) => !q || t.toLowerCase().includes(q)
  const gefiltert = useMemo(() => (eintraege || []).filter(e => (art === 'alle' || e.art === art) && passt([e.quelle, e.aktion, e.ziel, e.grund, e.rechner, e.benutzer, e.ergebnis, ...(e.details || [])].join(' '))), [eintraege, art, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const rueckGef = useMemo(() => (rueck || []).filter(r => (art === 'alle' || r.art === art || r.art === 'unbekannt') && passt([r.quelle, r.aktion, r.ziel, r.grund, r.von, ...(r.details || [])].join(' '))), [rueck, art, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const proTag = useMemo(() => {
    const m = new Map<string, AktEintrag[]>()
    for (const e of gefiltert) { const k = fmt(e.zeit).slice(0, 10); m.set(k, [...(m.get(k) || []), e]) }
    return [...m.entries()]
  }, [gefiltert])

  return (
    <Card title="Aktivitätsprotokoll" icon={<ScrollText size={15} />} subtitle="Was hat das Tool wann auf welchem PC gemacht – per Klick oder automatisch, mit Grund, Admin-PC und Konto">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="PC, Funktion, SoftPaq (z. B. sp172533), Empfänger …" className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:border-primary" data-akt-suche />
        </div>
        <select value={tage} onChange={e => setTage(Number(e.target.value))} className="text-xs rounded-md border border-border bg-background px-2 py-1.5">
          <option value={1}>heute</option><option value={7}>7 Tage</option><option value={30}>30 Tage</option><option value={90}>90 Tage</option>
        </select>
        <select value={art} onChange={e => setArt(e.target.value as typeof art)} className="text-xs rounded-md border border-border bg-background px-2 py-1.5">
          <option value="alle">alle</option><option value="automatisch">nur automatisch</option><option value="manuell">nur per Klick</option>
        </select>
        <button onClick={() => { void lade() }} disabled={laedt} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-50">{laedt ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Neu laden</button>
      </div>

      {eintraege === null ? <p className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Protokoll wird geladen …</p>
        : !proTag.length ? <p className="text-xs text-muted-foreground">Keine Einträge im gewählten Zeitraum. Protokolliert wird ab dieser Version: Treiberinstallationen (mit SoftPaq-Nummern), Komplett-Einrichtungen, Treiber-Rollouts, ausgeführte Lösungen aus „Gib dein Problem ein“, Befehls-Tests und Mailversand.</p>
          : (
            <div className="space-y-2 max-h-[32rem] overflow-y-auto" data-akt-liste>
              {proTag.map(([t, l]) => (
                <div key={t}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{t} · {l.length} Einträge</p>
                  <div className="rounded-md border border-border divide-y divide-border/60">
                    {l.map(e => <Zeile key={e.id} zeit={e.zeit} art={e.art} quelle={e.quelle} aktion={e.aktion} ziel={e.ziel} grund={e.grund} wer={`Admin-PC ${e.rechner} · ${e.benutzer}`} ergebnis={e.ergebnis} details={e.details} />)}
                  </div>
                </div>
              ))}
            </div>
          )}

      <div className="border-t border-border pt-3 space-y-2">
        <button onClick={() => setRueckOffen(!rueckOffen)} className="text-xs font-semibold text-foreground inline-flex items-center gap-1">{rueckOffen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Rückblick aus vorhandenen Daten (Komplett-Einrichtungen, Treiber-Rollouts){rueck ? ` · ${rueckGef.length}` : ''}</button>
        {rueckOffen && (
          rueck === null ? <p className="text-xs text-muted-foreground">wird geladen …</p>
            : !rueckGef.length ? <p className="text-xs text-muted-foreground">Nichts gefunden.</p>
              : <div className="rounded-md border border-border divide-y divide-border/60 max-h-[24rem] overflow-y-auto" data-akt-rueckblick>
                {rueckGef.map((r, i) => <Zeile key={i} zeit={r.zeit} art={r.art} quelle={r.quelle} aktion={`${fmt(r.zeit).slice(0, 10)}: ${r.aktion}`} ziel={r.ziel} grund={r.grund} wer={r.von ? `ausgeführt von ${r.von}` : undefined} details={r.details} />)}
              </div>
        )}
      </div>
    </Card>
  )
}
