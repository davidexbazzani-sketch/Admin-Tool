// ── Server-Lasche → Reiter „Zertifikate" ─────────────────────────────────────
// Zeigt die Zertifikate des Servers (verwendete zuerst) mit Ablaufdatum und Resttagen,
// die geprüften TLS-Ports und erlaubt, weitere TLS-Ports einzutragen. „Jetzt prüfen"
// liest nur (WinRM) und löst bei erreichter Schwelle dieselben Meldungen aus wie der
// tägliche Scan (je Zertifikat und Schwelle nur einmal).

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, XCircle, Save, ChevronDown, ChevronRight, Info } from 'lucide-react'
import {
  ladeZertStand, ladeExtraPorts, speichereExtraPorts, parsePorts, runZertifikatsScan, fasseZertZusammen,
  tageBis, zertStufe, zertRelevant, verwendungText, vorlageName, TLS_STANDARD_PORTS, SCHWELLE_WARNUNG, SCHWELLE_KRITISCH,
  type ZertStand, type Zertifikat,
} from '../../services/serverZertifikate'

const datum = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
const zeit = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

export default function ZertifikateReiter({ host, by, onGeaendert }: { host: string; by: string; onGeaendert: () => void }) {
  const [stand, setStand] = useState<ZertStand | null>(null)
  const [laden, setLaden] = useState(true)
  const [pruefend, setPruefend] = useState(false)
  const [hinweis, setHinweis] = useState('')
  const [portText, setPortText] = useState('')
  const [portGespeichert, setPortGespeichert] = useState('')
  const [nurSpeicherOffen, setNurSpeicherOffen] = useState(false)

  useEffect(() => {
    let weg = false
    void Promise.all([ladeZertStand(host), ladeExtraPorts(host)]).then(([s, p]) => {
      if (weg) return
      setStand(s); const t = p.join(', '); setPortText(t); setPortGespeichert(t); setLaden(false)
    })
    return () => { weg = true }
  }, [host])

  const pruefen = useCallback(async () => {
    setPruefend(true); setHinweis('')
    try {
      const r = await runZertifikatsScan(by, [host])
      if (!r.geprueft) setHinweis('Der Server ist laut Ping gerade nicht erreichbar — Prüfung übersprungen.')
      setStand(await ladeZertStand(host))
      onGeaendert()
    } finally { setPruefend(false) }
  }, [host, by, onGeaendert])

  async function portsSpeichern() {
    const p = parsePorts(portText)
    if (await speichereExtraPorts(host, p, by)) { const t = p.join(', '); setPortText(t); setPortGespeichert(t); setHinweis(p.length ? `Gespeichert — Ports ${t} werden ab der nächsten Prüfung mit gelesen.` : 'Keine zusätzlichen Ports mehr.') }
  }

  if (laden) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />Lade…</div>

  const z = stand ? fasseZertZusammen(stand) : null
  const verwendet = (stand?.zertifikate || []).filter(x => x.verwendung.length > 0)
  const nurSpeicher = (stand?.zertifikate || []).filter(x => x.verwendung.length === 0)

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {z && <>
          {z.verwendet - z.warnung - z.kritisch > 0 && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-600 text-white">{z.verwendet - z.warnung - z.kritisch} OK</span>}
          {z.warnung > 0 && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-400 text-black">{z.warnung} ≤ {SCHWELLE_WARNUNG} Tage</span>}
          {z.kritisch > 0 && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-600 text-white">{z.kritisch} ≤ {SCHWELLE_KRITISCH} Tage / abgelaufen</span>}
        </>}
        <span className="text-[11px] text-muted-foreground">{stand ? `geprüft ${zeit(stand.am)}` : 'noch nicht geprüft'}</span>
        <button onClick={() => void pruefen()} disabled={pruefend}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {pruefend ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}{pruefend ? 'Prüfe… (bis 1 Min.)' : 'Jetzt prüfen'}
        </button>
      </div>
      {hinweis && <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-primary/50 bg-primary/10 text-xs text-foreground"><Info size={14} className="text-primary shrink-0 mt-0.5" /><span>{hinweis}</span></div>}
      {stand && !stand.erreichbar && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-red-500/50 bg-red-500/10 text-xs text-foreground">
          <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" /><span>Zertifikate nicht lesbar: {stand.fehler}{stand.zertifikate.length ? ' — angezeigt wird der letzte gelesene Stand.' : ''}</span>
        </div>
      )}
      {!stand && <p className="text-xs text-muted-foreground">Noch keine Daten. „Jetzt prüfen" liest die Zertifikate nur aus (nichts wird am Server geändert); danach automatisch jeden Morgen um 07:00.</p>}

      {stand && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Verwendete Zertifikate ({verwendet.length})</h3>
          <div className="rounded-lg border border-border divide-y divide-border">
            {verwendet.map(c => <ZertZeile key={c.thumb} c={c} />)}
            {!verwendet.length && <div className="px-3 py-2 text-[11px] text-muted-foreground">Kein verwendetes Zertifikat gefunden (keine HTTPS-/RDP-/SQL-Bindung und kein TLS-Port).</div>}
          </div>
        </section>
      )}

      {nurSpeicher.length > 0 && (
        <section>
          <button onClick={() => setNurSpeicherOffen(v => !v)} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground mb-1.5">
            {nurSpeicherOffen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}Nur im Zertifikatsspeicher ({nurSpeicher.length}) — keine Meldung
          </button>
          {nurSpeicherOffen && (
            <div className="rounded-lg border border-border divide-y divide-border">
              {nurSpeicher.map(c => <ZertZeile key={c.thumb} c={c} />)}
            </div>
          )}
        </section>
      )}

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">TLS-Ports</h3>
        {stand?.ports.length ? (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {stand.ports.map(p => (
              <span key={p.port} title={p.fehler || ''} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${p.ok ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-black'}`}>
                {p.port} {p.ok ? '✓' : `✗ ${p.fehler ? p.fehler.slice(0, 50) : ''}`}
              </span>
            ))}
          </div>
        ) : <p className="text-[11px] text-muted-foreground mb-2">{stand ? 'Keiner der geprüften TLS-Ports lauscht auf diesem Server.' : ''}</p>}
        <div className="flex items-center gap-2">
          <input value={portText} onChange={e => setPortText(e.target.value)} placeholder="weitere TLS-Ports, z. B. 8444, 9200"
            className="flex-1 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground" />
          <button onClick={() => void portsSpeichern()} disabled={portText === portGespeichert}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs border border-border text-foreground hover:bg-accent disabled:opacity-40"><Save size={12} />Speichern</button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Immer geprüft (wenn sie lauschen): {TLS_STANDARD_PORTS.join(', ')}, alle HTTPS-Bindungen und SEAL-„Secure URL"-Ports. Hier nur Ports eintragen, die wirklich TLS/HTTPS sprechen.</p>
      </section>

      <p className="text-[10px] text-muted-foreground">Automatisch jeden Morgen um 07:00 (Einstellungen → Automatische Scans). Meldung {SCHWELLE_WARNUNG} und {SCHWELLE_KRITISCH} Tage vor Ablauf sowie bei Ablauf — Popup für alle Admins, Mail laut Haken „bei Zertifikat-Ablauf" an der Kachel. Nur lesend.</p>
    </div>
  )
}

function ZertZeile({ c }: { c: Zertifikat }) {
  const tage = tageBis(c.bis)
  const st = zertStufe(tage)
  const relevant = zertRelevant(c)
  const chip = !relevant && c.verwendung.length === 0 ? 'bg-muted text-foreground'
    : st === 'ok' ? 'bg-emerald-600 text-white' : st === 'warnung' ? 'bg-amber-400 text-black' : 'bg-red-600 text-white'
  const Icon = st === 'ok' ? ShieldCheck : st === 'warnung' ? ShieldAlert : ShieldX
  const farbe = st === 'ok' ? 'text-emerald-500' : st === 'warnung' ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="px-3 py-2 flex items-start gap-2.5">
      <Icon size={15} className={`mt-0.5 shrink-0 ${c.verwendung.length ? farbe : 'text-muted-foreground'}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground break-words">{c.cn || c.subject || c.thumb}</div>
        {c.san.length > 0 && <div className="text-[10px] text-muted-foreground break-words">{c.san.slice(0, 8).join(', ')}{c.san.length > 8 ? ` … (+${c.san.length - 8})` : ''}</div>}
        {c.verwendung.length > 0 && <div className="text-[10px] text-foreground break-words"><span className="font-semibold">verwendet:</span> {verwendungText(c)}</div>}
        <div className="text-[10px] text-muted-foreground break-words flex flex-wrap items-center gap-x-1.5">
          <span>Aussteller: {c.aussteller || '—'}</span>
          <span>· {c.speicher ? `Speicher ${c.speicher}` : 'Datei-Zertifikat (nur am Port gesehen, z. B. Apache/Tomcat)'}</span>
          {c.selbst && <span className="px-1 rounded bg-muted text-foreground">selbstsigniert</span>}
          {c.vorlage && <span className="px-1 rounded bg-muted text-foreground break-all" title={`Aus einer AD-Zertifikatsvorlage — kann automatisch erneuert werden\n${c.vorlage}`}>AD-Vorlage {vorlageName(c.vorlage)}</span>}
        </div>
        {c.selbst && c.verwendung.length > 0 && c.verwendung.every(v => v.art === 'rdp') && (
          <div className="text-[10px] text-muted-foreground">Selbstsigniertes RDP-Zertifikat — Windows erneuert es selbst, daher keine Meldung.</div>
        )}
        <div className="text-[9px] text-muted-foreground font-mono break-all">{c.thumb}</div>
      </div>
      <div className="shrink-0 text-right">
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${chip}`}>
          {isNaN(tage) ? '?' : tage < 0 ? 'abgelaufen' : tage === 0 ? 'läuft heute ab' : tage === 1 ? 'läuft morgen ab' : `noch ${tage} Tage`}
        </span>
        <div className="text-[10px] text-muted-foreground mt-0.5">bis {datum(c.bis)}</div>
      </div>
    </div>
  )
}
