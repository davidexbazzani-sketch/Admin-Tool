// ── Bericht eines Backup-Laufs: Grund (deutsch) + Abhilfe + Details aufklappbar ──
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileText, XCircle } from 'lucide-react'
import type { LaufBericht } from '../../services/backupBericht'
import { fmtBytes, fmtDauer, rcText } from '../../services/backupBericht'
import { api } from '../../electronAPI'

export function stufeFarbe(stufe: LaufBericht['stufe']): { text: string; rand: string; grund: string } {
  if (stufe === 'ok') return { text: 'text-emerald-500', rand: 'border-emerald-500/30', grund: 'bg-emerald-500/5' }
  if (stufe === 'warnung') return { text: 'text-amber-500', rand: 'border-amber-500/40', grund: 'bg-amber-500/5' }
  return { text: 'text-red-500', rand: 'border-red-500/40', grund: 'bg-red-500/5' }
}

export default function BackupBerichtBox({ bericht, oeffnePfad, kompakt = false }: {
  bericht: LaufBericht
  /** wandelt einen Protokollpfad des ausführenden PCs in einen hier öffenbaren Pfad */
  oeffnePfad?: (pfad: string) => string
  kompakt?: boolean
}) {
  const [details, setDetails] = useState(false)
  const [oeffnenFehler, setOeffnenFehler] = useState('')
  const f = stufeFarbe(bericht.stufe)
  const Icon = bericht.stufe === 'ok' ? CheckCircle2 : bericht.stufe === 'warnung' ? AlertTriangle : XCircle

  async function oeffne(pfad?: string) {
    if (!pfad) return
    setOeffnenFehler('')
    const p = oeffnePfad ? oeffnePfad(pfad) : pfad
    try {
      const r = await api().openPath(p)
      if (!r.success) setOeffnenFehler(`Protokoll nicht erreichbar: ${p}${r.error ? ` (${r.error})` : ''}`)
    } catch (e) { setOeffnenFehler(e instanceof Error ? e.message : String(e)) }
  }

  if (bericht.stufe === 'ok' && kompakt) {
    return <p className={`text-[11px] mt-1 flex items-center gap-1 ${f.text}`}><Icon size={12} className="shrink-0" />{bericht.titel}{bericht.dauerSek != null ? <span className="text-muted-foreground"> · {fmtDauer(bericht.dauerSek)}</span> : null}</p>
  }

  const ersterLog = bericht.ordner.find(o => (o.rc ?? 0) >= 8 && o.log)?.log || bericht.ordner.find(o => o.log)?.log

  return (
    <div className={`mt-2 rounded-md border ${f.rand} ${f.grund} p-2`}>
      <p className={`text-xs font-medium flex items-start gap-1.5 ${f.text}`}><Icon size={13} className="shrink-0 mt-0.5" /><span>{bericht.titel}</span></p>
      {bericht.gruende.length > 0 && bericht.stufe !== 'ok' && (
        <ul className="mt-1.5 space-y-1.5">
          {bericht.gruende.map((g, i) => (
            <li key={i} className="text-[11px] text-foreground">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-medium">{g.titel}</span>
                {g.anzahl > 1 && <span className="text-muted-foreground">{g.anzahl.toLocaleString('de-DE')}×</span>}
                {g.code > 0 && <span className="text-[10px] text-muted-foreground font-mono">Code {g.code}</span>}
              </div>
              {g.hilfe && <p className="text-muted-foreground mt-0.5">{g.hilfe}</p>}
              {g.beispiele.length > 0 && (
                <ul className="mt-0.5">
                  {g.beispiele.map(b => <li key={b} className="font-mono text-[10px] text-muted-foreground break-all">{b}</li>)}
                </ul>
              )}
              {details && g.meldung && <p className="text-[10px] text-muted-foreground mt-0.5">Windows: „{g.meldung}"</p>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <button onClick={() => setDetails(v => !v)} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
          {details ? <ChevronDown size={11} /> : <ChevronRight size={11} />}Details
        </button>
        {ersterLog && (
          <button onClick={() => oeffne(ersterLog)} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
            <FileText size={11} />Protokoll öffnen
          </button>
        )}
      </div>
      {details && (
        <div className="mt-1.5 text-[10px] text-muted-foreground space-y-0.5">
          <p>
            {bericht.kopiert.toLocaleString('de-DE')} kopiert ({fmtBytes(bericht.bytesKopiert)}) · {bericht.uebersprungen.toLocaleString('de-DE')} unverändert übersprungen
            {bericht.fehlgeschlagen > 0 && <> · {bericht.fehlgeschlagen.toLocaleString('de-DE')} fehlgeschlagen</>}
            {bericht.extra > 0 && <> · {bericht.extra.toLocaleString('de-DE')} nur im Ziel</>}
            {bericht.dauerSek != null && <> · Dauer {fmtDauer(bericht.dauerSek)}</>}
            {bericht.rechner && <> · ausgeführt auf {bericht.rechner}</>}
          </p>
          {bericht.ordner.map((o, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className={`font-mono ${(o.rc ?? 16) >= 8 ? 'text-red-500' : ''}`}>rc {o.rc ?? '–'}</span>
              <span className="break-all flex-1">{o.quelle} → {o.ziel} <span className="text-muted-foreground/80">({rcText(o.rc)}{o.kopiert ? `, ${o.kopiert.toLocaleString('de-DE')} kopiert` : ''}{o.fehlgeschlagen ? `, ${o.fehlgeschlagen} fehlgeschlagen` : ''})</span></span>
              {o.log && <button onClick={() => oeffne(o.log)} className="text-primary hover:underline shrink-0">Protokoll</button>}
            </div>
          ))}
        </div>
      )}
      {oeffnenFehler && <p className="text-[10px] text-amber-500 mt-1 break-all">{oeffnenFehler}</p>}
    </div>
  )
}
