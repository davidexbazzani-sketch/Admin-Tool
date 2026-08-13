// ── Drucker-Dossier: Tab „Verbundene Geräte" ─────────────────────────────────
// Zeigt alle Computer + Personen, die aktuell mit DIESEM Drucker verbunden sind
// (aus dem Verbindungs-Scan, der alle 2 Wochen Fr 14:00 im Hintergrund läuft).
// „Jetzt aktualisieren" stößt einen sofortigen (globalen) Scan an.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Monitor, Star, Wifi, WifiOff, Users } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { PersonInfoButton } from '../person/PersonDossier'
import {
  loadConnData, forPrinter, runConnectionScanManual,
  type ConnScanData, type ConnFlat,
} from '../../services/printerConnections'

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function PrinterConnections({ printerName }: { printerName: string }) {
  const user = useAuthStore(s => s.session?.user)
  const [data, setData] = useState<ConnScanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await loadConnData()) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function rescan() {
    if (scanning) return
    if (!window.confirm('Alle Computer nach verbundenen Druckern durchsuchen? Das kann je nach Anzahl der PCs einige Minuten dauern (läuft im Hintergrund).')) return
    setScanning(true); setScanMsg('Scan läuft… (Online-Prüfung + WinRM je Computer)')
    try {
      // Gated: bricht ab, wenn bereits ein Scan läuft; setzt sonst selbst einen
      // Claim und schreibt den Zeitplan fort (verhindert Doppel-Scans).
      const res = await runConnectionScanManual(user?.username)
      if (res.ok) {
        setScanMsg(`Fertig: ${res.online} online · ${res.withPrinters} PCs mit Druckern`)
        await load()
      } else {
        setScanMsg(res.reason || 'Fehler')
      }
    } catch (e) {
      setScanMsg(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setScanning(false) }
  }

  const rows: ConnFlat[] = forPrinter(data, printerName)
  // je Computer nur einmal (falls mehrere Hives dieselbe Verbindung liefern)
  const seen = new Set<string>()
  const uniqueRows = rows.filter(r => { const k = `${r.hostname}|${r.sam}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Computer & Personen, die mit <span className="font-mono text-foreground">{printerName}</span> verbunden sind.
          {data?.scanDate && <> · Letzter Scan: {fmtDate(data.scanDate)}</>}
        </p>
        <button onClick={rescan} disabled={scanning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent/30 disabled:opacity-40">
          {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Jetzt aktualisieren
        </button>
      </div>
      {scanMsg && <p className="text-[11px] text-muted-foreground">{scanMsg}</p>}
      <p className="text-[11px] text-muted-foreground">Automatischer Scan alle 2 Wochen · freitags 14:00 (Hintergrund).</p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-16"><Loader2 size={14} className="animate-spin" />Lade Verbindungsdaten…</div>
      ) : uniqueRows.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          <Users size={36} className="mx-auto mb-2 opacity-30" />
          {data ? 'Kein Computer mit diesem Drucker gefunden (im letzten Scan).' : 'Noch kein Scan vorhanden — „Jetzt aktualisieren" starten.'}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-semibold px-2 py-2">Status</th>
              <th className="text-left font-semibold px-2 py-2">Computer</th>
              <th className="text-left font-semibold px-2 py-2">Person / Benutzer</th>
              <th className="text-left font-semibold px-2 py-2">Standard</th>
            </tr>
          </thead>
          <tbody>
            {uniqueRows.map(r => (
              <tr key={`${r.hostname}|${r.sam}`} className="border-b border-border/40 hover:bg-accent/10">
                <td className="px-2 py-1.5">
                  {r.online
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-green-300"><Wifi size={12} />online</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><WifiOff size={12} />offline</span>}
                </td>
                <td className="px-2 py-1.5 text-foreground">
                  <span className="inline-flex items-center gap-1 font-mono"><Monitor size={12} className="text-muted-foreground" />{r.hostname}<DeviceInfoButton hostname={r.hostname} /></span>
                </td>
                <td className="px-2 py-1.5 text-foreground">
                  {r.sam ? <span className="inline-flex items-center gap-1">{r.display || r.sam}<PersonInfoButton name={r.display || r.sam} sam={r.sam} /></span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-2 py-1.5">
                  {r.isDefault && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"><Star size={9} />Standard</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
