// ── Drucker → Drucker verbinden ───────────────────────────────────────────────
// PC über Person (Name/Kürzel/E-Mail → zugewiesene Geräte), Hostname oder IP wählen, sehen wem
// er zugewiesen ist und welche Drucker schon eingerichtet sind, dann einen Drucker verbinden
// (SEAL Add Printer Wizard im Benutzerkontext, wie im Geräte-„i") und optional als Standard.

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, Loader2, Monitor, Printer, Search, Star, UserSearch, Link2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import UserPcSearch from '../UserPcSearch'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { PersonInfoButton } from '../person/PersonDossier'
import { PrinterInfoButton } from '../printer/PrinterDossier'
import { isValidRemoteTarget, isIpv4 } from '../../utils/remoteTarget'
import { api } from '../../electronAPI'
import { findEndpointDevice } from '../../services/deviceMasterData'
import { logDeviceAction } from '../../services/deviceDossier'
import { logPrinterAction } from '../../services/printerDossier'
import { CONN_DATA_PATH, connectPrinterViaSeal, setDefaultPrinterLocal, type ConnScanData } from '../../services/printerConnections'
import type { DruckerDaten } from '../../screens/Drucker'

interface Ziel { host: string; serial?: string; ip?: string; zugewiesen?: string; eingerichtet: { name: string; standard: boolean }[]; scanAm?: string }

async function hostAusIp(ip: string): Promise<string> {
  const r = await api().runPowerShell(`try { ([System.Net.Dns]::GetHostEntry('${ip.replace(/'/g, '')}').HostName -split '\\.')[0] } catch { '' }`, 15000).catch(() => null)
  return (r?.stdout || '').trim().split(/\r?\n/).pop()?.trim() || ''
}

export default function DruckerVerbinden({ daten }: { daten: DruckerDaten | null }) {
  const u = useAuthStore(s => s.session?.user)
  const wer = u?.displayName || u?.username || 'Tool'
  const [eingabe, setEingabe] = useState('')
  const [ziel, setZiel] = useState<Ziel | null>(null)
  const [laedt, setLaedt] = useState('')
  const [suche, setSuche] = useState('')
  const [drucker, setDrucker] = useState('')
  const [standard, setStandard] = useState(false)
  const [laeuft, setLaeuft] = useState('')
  const [ergebnis, setErgebnis] = useState<{ ok: boolean; text: string } | null>(null)

  async function waehle(rohHost: string, serial?: string) {
    const roh = rohHost.trim()
    if (!roh) return
    setZiel(null); setErgebnis(null); setLaedt('PC wird nachgeschlagen …')
    let host = roh, ip: string | undefined
    if (isIpv4(roh)) { ip = roh; host = (await hostAusIp(roh)) || roh }
    const [geraet, conn] = await Promise.all([
      findEndpointDevice(host, serial).catch(() => null),
      api().netReadJsonAsync<ConnScanData>(CONN_DATA_PATH).catch(() => null),
    ])
    const kurz = host.split('.')[0].toUpperCase()
    const pc = (conn?.computers || []).find(c => (c.hostname || '').split('.')[0].toUpperCase() === kurz)
    setZiel({
      host, serial: serial || geraet?.serial, ip, zugewiesen: geraet?.assignedTo || undefined,
      eingerichtet: (pc?.printers || []).map(p => ({ name: p.name || (p.connection || '').split('\\').pop() || '?', standard: !!p.isDefault })),
      scanAm: pc?.scannedAt,
    })
    setLaedt('')
  }

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return (daten?.drucker || []).filter(d => !q || d.name.toLowerCase().includes(q) || (d.standort || '').toLowerCase().includes(q) || d.ip.includes(q)).slice(0, 60)
  }, [daten, suche])
  useEffect(() => { setErgebnis(null) }, [drucker, ziel?.host])

  async function verbinden() {
    if (!ziel || !drucker) return
    setErgebnis(null); setLaeuft('Drucker wird auf dem PC eingerichtet (SEAL) — bis zu 1–2 Minuten …')
    const r = await connectPrinterViaSeal(ziel.host, drucker)
    let text = r.ok ? `${drucker} ist auf ${ziel.host} eingerichtet.` : `Verbinden fehlgeschlagen: ${r.text}`
    let ok = r.ok
    if (r.ok && standard) {
      setLaeuft('Wird als Standarddrucker gesetzt …')
      const d = await setDefaultPrinterLocal(ziel.host, drucker)
      text += d.ok ? ' Als Standarddrucker gesetzt.' : ` Standarddrucker konnte nicht gesetzt werden: ${d.text}`
      ok = ok && d.ok
    }
    setLaeuft(''); setErgebnis({ ok, text })
    if (r.ok) {
      void logDeviceAction(ziel.host, ziel.serial, `Drucker ${drucker} verbunden${standard ? ' und als Standard gesetzt' : ''} (Menü Drucker → Drucker verbinden)`, wer, 'Drucker')
      void logPrinterAction(drucker, `Auf ${ziel.host}${ziel.zugewiesen ? ` (${ziel.zugewiesen})` : ''} eingerichtet${standard ? ', als Standard' : ''}`, wer, 'Drucker verbinden')
      setZiel(z => z ? { ...z, eingerichtet: [...z.eingerichtet.filter(e => e.name.toUpperCase() !== drucker.toUpperCase()).map(e => ({ ...e, standard: standard ? false : e.standard })), { name: drucker, standard }] } : z)
    }
  }

  const eingabeOk = isValidRemoteTarget(eingabe.trim())

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold"><UserSearch size={12} />1 · PC wählen</p>
        <p className="text-[11px] text-muted-foreground">Nach Person suchen (Name, Kürzel, E-Mail) und eins der zugewiesenen Geräte ankreuzen — oder direkt Hostname bzw. IP-Adresse eingeben.</p>
        <UserPcSearch onPick={(h, s) => void waehle(h, s)} mitOnlineStatus mitCheckbox placeholder="Benutzername, Name oder E-Mail …" />
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <Monitor size={13} className="text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground shrink-0">oder direkt:</span>
          <input value={eingabe} onChange={e => setEingabe(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && eingabeOk) void waehle(eingabe) }}
            placeholder="Hostname (DE…) oder IP-Adresse" className="flex-1 min-w-0 px-2 py-1 text-xs font-mono rounded-md border border-border bg-background text-foreground" />
          <button onClick={() => void waehle(eingabe)} disabled={!eingabeOk} className="shrink-0 px-2.5 py-1 text-[11px] rounded-md font-semibold bg-primary text-primary-foreground disabled:opacity-40">Übernehmen</button>
        </div>
        {laedt && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" />{laedt}</p>}
        {ziel && (
          <div className="rounded-md border border-border bg-background p-3 space-y-1.5 text-xs">
            <p className="flex items-center gap-1.5 text-foreground"><Monitor size={13} /><b className="font-mono">{ziel.host}</b><DeviceInfoButton hostname={ziel.host} serial={ziel.serial} />{ziel.ip && <span className="text-muted-foreground font-mono">({ziel.ip})</span>}</p>
            <p className="text-foreground">Zugewiesen an: {ziel.zugewiesen ? <span className="inline-flex items-center gap-1 font-semibold">{ziel.zugewiesen}<PersonInfoButton name={ziel.zugewiesen} /></span> : <span className="text-muted-foreground">niemandem (laut Endgeräte-Übersicht)</span>}</p>
            <div>
              <p className="text-muted-foreground">Eingerichtete Drucker {ziel.scanAm ? `(Scan vom ${new Date(ziel.scanAm).toLocaleDateString('de-DE')})` : '(noch nicht gescannt)'}:</p>
              {ziel.eingerichtet.length ? (
                <ul className="mt-1 space-y-0.5">
                  {ziel.eingerichtet.map(e => (
                    <li key={e.name} className="flex items-center gap-1.5 text-foreground">
                      <Printer size={11} className="text-muted-foreground" />{e.name}<PrinterInfoButton printerName={e.name} />
                      {e.standard && <span className="inline-flex items-center gap-0.5 px-1.5 rounded bg-amber-400 text-black text-[10px] font-semibold"><Star size={9} />Standard</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted-foreground italic">keine bekannt</p>}
            </div>
          </div>
        )}
      </div>

      <div className={`rounded-xl border border-border bg-card p-4 space-y-3 ${ziel ? '' : 'opacity-60'}`}>
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold"><Printer size={12} />2 · Drucker wählen und verbinden</p>
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} disabled={!ziel} placeholder="Drucker, Standort oder IP suchen …"
            className="w-full pl-7 pr-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground" />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {liste.map(d => (
            <label key={d.name} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer ${drucker === d.name ? 'bg-primary/15' : 'hover:bg-accent/30'}`}>
              <input type="radio" name="drucker-wahl" className="accent-primary" disabled={!ziel} checked={drucker === d.name} onChange={() => setDrucker(d.name)} />
              <span className="font-semibold text-foreground w-24 shrink-0">{d.name}</span>
              <span className="flex-1 min-w-0 truncate text-muted-foreground">{d.standort || '—'}</span>
              <PrinterInfoButton printerName={d.name} />
            </label>
          ))}
          {!liste.length && <p className="px-3 py-4 text-center text-xs text-muted-foreground">Kein Drucker gefunden.</p>}
        </div>
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" className="accent-primary" checked={standard} disabled={!ziel} onChange={e => setStandard(e.target.checked)} />
          zusätzlich als Standarddrucker einstellen
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => void verbinden()} disabled={!ziel || !drucker || !!laeuft}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40">
            {laeuft ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
            {drucker && ziel ? `${drucker} mit ${ziel.host} verbinden` : 'Verbinden'}
          </button>
          {laeuft && <span className="text-[11px] text-muted-foreground">{laeuft}</span>}
        </div>
        <p className="text-[11px] text-muted-foreground">Läuft im Konto des angemeldeten Benutzers — am PC muss jemand angemeldet sein. Eingerichtet wird über den SEAL Add Printer Wizard (wie im Geräte-„i").</p>
        {ergebnis && (
          <p className={`flex items-start gap-1.5 text-xs text-foreground rounded-md border px-3 py-2 ${ergebnis.ok ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
            {ergebnis.ok ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-px" /> : <AlertTriangle size={13} className="text-red-500 shrink-0 mt-px" />}{ergebnis.text}
          </p>
        )}
      </div>
    </div>
  )
}
