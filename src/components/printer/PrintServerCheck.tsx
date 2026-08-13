// ── „Druckserver prüfen"-Diagnose ─────────────────────────────────────────────
// Kompaktes Ausklapp-Panel: probt die bekannten Druckserver (Get-Printer +
// Win32_Printer-Fallback), zeigt welche Server Clients laut Scan real nutzen und
// — falls ein Druckername übergeben wird — die aufgelöste echte \\Server\Freigabe.

import { useState } from 'react'
import { Loader2, ServerCog, CheckCircle2, XCircle } from 'lucide-react'
import { diagnosePrintServers, type PrintServerDiagnosis } from '../../services/printerConnections'

export function PrintServerCheck({ printerName }: { printerName?: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [diag, setDiag] = useState<PrintServerDiagnosis | null>(null)

  async function run() {
    setOpen(true); setLoading(true); setDiag(null)
    try { setDiag(await diagnosePrintServers(printerName)) }
    finally { setLoading(false) }
  }

  return (
    <div className="mt-1.5">
      <button type="button" onClick={run} disabled={loading}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin" /> : <ServerCog size={12} />}Druckserver prüfen
      </button>
      {open && (loading || diag) && (
        <div className="mt-1.5 rounded-md border border-border bg-background p-2 space-y-1.5 text-[11px]">
          {loading && !diag && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 size={11} className="animate-spin" />Server werden geprüft…</span>
          )}
          {diag?.probes.map(p => (
            <div key={p.host} className="flex items-start gap-1.5">
              {p.reachable ? <CheckCircle2 size={12} className="text-green-400 mt-px shrink-0" /> : <XCircle size={12} className="text-red-400 mt-px shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className="font-mono text-foreground">{p.host}</span> <span className="text-muted-foreground">· {p.role}</span><br />
                {p.reachable
                  ? <span className="text-muted-foreground">erreichbar via {p.method} · {p.shareCount} Freigaben</span>
                  : <span className="text-red-300 break-words">nicht abrufbar — {p.error}</span>}
              </span>
            </div>
          ))}
          {diag && diag.scanServers.length > 0 && (
            <p className="text-muted-foreground pt-1 border-t border-border">
              Laut Scan von Clients genutzt: {diag.scanServers.map(s => `${s.server} (${s.count})`).join(', ')}
            </p>
          )}
          {diag?.resolved && (() => {
            const r = diag.resolved
            const amber = !r.ok || r.unconfirmed
            return (
              <p className={`pt-1 border-t border-border break-words ${amber ? 'text-amber-300' : 'text-green-300'}`}>
                {printerName}: {r.ok
                  ? (r.unconfirmed
                      ? <>Direktversuch <span className="font-mono">{r.unc}</span> — Freigabe unbestätigt (Server nicht abfragbar)</>
                      : <>echte Freigabe <span className="font-mono">{r.unc}</span> ({r.source})</>)
                  : <>nicht auflösbar — {r.error}</>}
              </p>
            )
          })()}
        </div>
      )}
    </div>
  )
}
