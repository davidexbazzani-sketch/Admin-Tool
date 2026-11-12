// ── „Gib dein Problem ein“ → Berechtigungscheck ──────────────────────────────
// Gebiete wählen (Homeoffice, SolidWorks, Ordner auf Laufwerk I:, Grundausstattung, Lizenzen),
// eine AD-Abfrage — Ergebnis wie beim „Homeoffice fit?“ der Mitarbeiterverwaltung:
// grüner Haken = vorhanden, gelbes Dreieck = fehlt, dazu direkt der ServiceNow-Antrag.
// Nur lesend; Berechtigungen ändert das Tool nie.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ShieldCheck, Loader2, CheckCircle2, AlertTriangle, MinusCircle, ExternalLink, X, RotateCw } from 'lucide-react'
import { BC_GEBIETE, W3172_BEREICHE, deuteEingabe, leseAlleGruppen, pruefeGebiet, type BcGebiet, type BcGruppen, type BcZeile } from '../services/berechtigungsCheck'

const api = () => (window as unknown as { electronAPI: { openExternal(u: string): Promise<void> } }).electronAPI

export default function BerechtigungsCheck({ sam, name, onSchliessen }: {
  /** Kennung der angemeldeten bzw. zugewiesenen Person des gewählten PCs (falls bekannt) */
  sam?: string
  name?: string
  onSchliessen: () => void
}) {
  const [eingabe, setEingabe] = useState(sam || name || '')
  const [gebiete, setGebiete] = useState<Set<BcGebiet>>(new Set(['homeoffice']))
  const [bereich, setBereich] = useState('')
  const [nurFehlend, setNurFehlend] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [erg, setErg] = useState<(BcGruppen & { fuer: string; am: string; dauer: number; gemerkt?: boolean }) | null>(null)
  const lauf = useRef(0)

  // Die AD-Abfrage holt ALLE Gruppen auf einmal – die Gebiete werden danach nur noch ausgewertet,
  // Umschalten kostet also keine weitere Abfrage.
  const pruefe = async (frisch = false, fuer = eingabe) => {
    const t = fuer.trim()
    if (!t) return
    const nr = ++lauf.current
    setLaeuft(true); setErg(null)
    const t0 = Date.now()
    const r = await leseAlleGruppen(deuteEingabe(t), frisch)
    if (nr !== lauf.current) return   // inzwischen neu gestartet
    setErg({ ...r, fuer: t, am: new Date().toISOString(), dauer: Date.now() - t0 })
    setLaeuft(false)
    if (!r.gemerkt) void import('../services/aktivitaet').then(m => m.protokolliere({ art: 'manuell', quelle: 'Gib dein Problem ein · Berechtigungscheck', aktion: 'Berechtigungen im AD geprüft (nur gelesen)', ziel: r.konto || t, ergebnis: r.ok ? `${r.gruppen.length} Gruppen` : r.fehler })).catch(() => {})
  }
  // Person des gewählten PCs ist bekannt → sofort beim Öffnen prüfen
  useEffect(() => { if ((sam || name || '').trim()) void pruefe(false, sam || name || '') }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const oeffne = (a: NonNullable<BcZeile['antrag']>) => {
    if (a.link) void api().openExternal(a.link)
    else void import('../serviceNowWelt/oeffnen').then(m => m.oeffneSnEintrag(a.name))
  }
  const teile = useMemo(() => (erg?.ok ? BC_GEBIETE.filter(x => gebiete.has(x.id)).map(x => ({ ...x, zeilen: pruefeGebiet(x.id, erg.gruppen, x.id === 'ordner' ? bereich : '') })) : []), [erg, gebiete, bereich])
  const fehlen = teile.reduce((s, t) => s + t.zeilen.filter(z => z.status === 'fehlt').length, 0)

  return (
    <div className="rounded-xl border-2 border-emerald-500/40 bg-card shadow-sm" data-berechtigungscheck>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <ShieldCheck size={16} className="text-emerald-500" />
        <span className="text-sm font-semibold text-foreground">Berechtigungscheck</span>
        <span className="text-[11px] text-muted-foreground">prüft im AD, auch verschachtelte Gruppen – nur lesend</span>
        <button onClick={onSchliessen} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground"><X size={14} /></button>
      </div>
      <div className="p-4 space-y-3 text-xs">
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-muted-foreground">Für wen?</label>
          <input value={eingabe} onChange={e => setEingabe(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void pruefe() }} spellCheck={false} data-bc-person
            placeholder="Kennung, „Vorname Nachname“ oder E-Mail" className="flex-1 min-w-[14rem] px-3 py-1.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
          {sam && eingabe.trim() !== sam && <button onClick={() => setEingabe(sam)} className="text-[11px] underline text-muted-foreground hover:text-foreground">Person am gewählten PC ({name || sam})</button>}
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">Was soll geprüft werden?</p>
          <div className="flex flex-wrap gap-1.5" data-bc-gebiete>
            {BC_GEBIETE.map(x => (
              <button key={x.id} title={x.wozu} data-bc-gebiet={x.id}
                onClick={() => setGebiete(s => { const n = new Set(s); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n })}
                className={`px-2.5 py-1 rounded-full border ${gebiete.has(x.id) ? 'bg-emerald-600 text-white border-emerald-600' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>{x.titel}</button>
            ))}
            <button onClick={() => setGebiete(new Set(BC_GEBIETE.map(x => x.id)))} className="px-2 py-1 text-[11px] underline text-muted-foreground hover:text-foreground">alle</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => void pruefe(!!erg)} disabled={laeuft || !eingabe.trim() || !gebiete.size} data-bc-start
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40">
            {laeuft ? <Loader2 size={15} className="animate-spin" /> : erg ? <RotateCw size={15} /> : <ShieldCheck size={15} />}{laeuft ? 'Prüfe im AD …' : erg ? 'Neu prüfen' : 'Berechtigungen prüfen'}
          </button>
          {erg?.ok && <label className="inline-flex items-center gap-1 text-muted-foreground cursor-pointer"><input type="checkbox" checked={nurFehlend} onChange={e => setNurFehlend(e.target.checked)} className="accent-primary" />nur Fehlendes zeigen</label>}
        </div>

        {erg && !erg.ok && <p className="text-amber-600 flex gap-1.5" data-bc-fehler><AlertTriangle size={13} className="mt-0.5 shrink-0" />{erg.fehler}</p>}
        {erg?.ok && (
          <div className="space-y-3" data-bc-ergebnis>
            <p className="text-foreground">
              <b>{erg.anzeige || erg.fuer}</b>{erg.konto ? <span className="font-mono text-muted-foreground"> · {erg.konto}</span> : null} · {erg.gruppen.length} Gruppen ·{' '}
              {fehlen ? <span className="text-amber-600 font-semibold">{fehlen} Berechtigung{fehlen === 1 ? '' : 'en'} fehl{fehlen === 1 ? 't' : 'en'}</span> : <span className="text-emerald-600 font-semibold">nichts fehlt in den gewählten Gebieten</span>}
              {erg.mehrdeutig && <span className="text-amber-600"> · mehrere Konten passen – geprüft wurde das erste</span>}
            </p>
            {teile.map(t => {
              const zeilen = nurFehlend ? t.zeilen.filter(z => z.status !== 'ok') : t.zeilen
              const n = t.zeilen.filter(z => z.status === 'fehlt').length
              const zugriff = t.zeilen.filter(z => z.status === 'ok').length
              // Mehrere Fehlende über DENSELBEN Antrag (z. B. Homeoffice: Fileserver, SAP, enaio) → ein Knopf für alle
              const gemeinsam = (() => {
                const m = new Map<string, { a: NonNullable<BcZeile['antrag']>; titel: string[] }>()
                for (const z of t.zeilen) if (z.status === 'fehlt' && z.antrag) { const k = z.antrag.link || z.antrag.name; const e = m.get(k) || { a: z.antrag, titel: [] }; e.titel.push(z.titel); m.set(k, e) }
                return [...m.values()].filter(e => e.titel.length > 1)
              })()
              return (
                <div key={t.id} className="rounded-lg border border-border" data-bc-teil={t.id}>
                  <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{t.titel}</span>
                    {t.id === 'ordner'
                      ? <span className="text-muted-foreground">Zugriff auf {zugriff} von {t.zeilen.length} Ordnern</span>
                      : <span className={n ? 'text-amber-600' : 'text-emerald-600'}>{n ? `${n} fehl${n === 1 ? 't' : 'en'}` : 'vollständig'}</span>}
                    {gemeinsam.map(e => (
                      <button key={e.a.name} onClick={() => oeffne(e.a)} data-bc-antrag-gemeinsam title={`Ein Antrag für: ${e.titel.join(', ')}${e.titel.length > 4 ? ' – höchstens 4 je Formular, also zweimal ausfüllen' : ''}`}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-sky-500/50 text-sky-600 hover:bg-sky-500/10 text-[11px] font-semibold">
                        <ExternalLink size={11} />Alle {e.titel.length} in einem Antrag: {e.a.name.length > 40 ? e.a.name.slice(0, 38) + ' …' : e.a.name}
                      </button>
                    ))}
                    {t.id === 'ordner' && (
                      <select value={bereich} onChange={e => setBereich(e.target.value)} data-bc-bereich className="ml-auto px-2 py-0.5 rounded border border-border bg-background text-foreground">
                        <option value="">alle Bereiche ({t.zeilen.length} Ordner)</option>
                        {W3172_BEREICHE.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    )}
                  </div>
                  <ul className="divide-y divide-border/50 max-h-72 overflow-y-auto">
                    {zeilen.map((z, i) => (
                      <li key={i} className="px-3 py-1.5 flex items-start gap-2" data-bc-status={z.status}>
                        {z.status === 'ok' ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> : z.status === 'fehlt' ? <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" /> : <MinusCircle size={13} className="text-muted-foreground/60 shrink-0 mt-0.5" />}
                        <span className="min-w-0 flex-1">
                          <span className={z.status === 'fehlt' ? 'font-semibold text-foreground' : 'text-foreground'}>{z.titel}</span>
                          {z.status === 'fehlt' && <span className="text-amber-600"> · fehlt</span>}
                          {z.status === 'offen' && t.id !== 'ordner' && <span className="text-muted-foreground"> · nicht vorhanden</span>}
                          {z.detail && <span className="block text-[11px] text-muted-foreground break-words">{z.detail}</span>}
                        </span>
                        {z.antrag && (
                          <button onClick={() => oeffne(z.antrag!)} title={`In ServiceNow öffnen: ${z.antrag.name}`} data-bc-antrag
                            className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${z.status === 'fehlt' || (t.id === 'ordner' && z.status === 'offen') ? 'border-sky-500/50 text-sky-600 hover:bg-sky-500/10 font-semibold' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                            <ExternalLink size={11} />{z.status === 'ok' ? 'Ändern beantragen' : z.antrag.name.length > 34 ? z.antrag.name.slice(0, 32) + ' …' : z.antrag.name}
                          </button>
                        )}
                      </li>
                    ))}
                    {!zeilen.length && <li className="px-3 py-2 text-muted-foreground">Hier fehlt nichts.</li>}
                  </ul>
                </div>
              )
            })}
            <p className="text-[10px] text-muted-foreground">geprüft {new Date(erg.am).toLocaleString('de-DE')}{erg.gemerkt ? ' (gemerktes Ergebnis der letzten 10 Minuten – „Neu prüfen“ fragt das AD erneut)' : ` in ${(erg.dauer / 1000).toFixed(1)} s`} · Das Tool ändert keine Berechtigungen – der Knopf öffnet nur den passenden Antrag in ServiceNow.</p>
          </div>
        )}
      </div>
    </div>
  )
}
