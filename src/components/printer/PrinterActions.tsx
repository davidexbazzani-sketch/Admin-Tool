// ── Drucker-Aktionen (Tab "Aktionen" im Drucker-Dossier) ─────────────────────
// Über das Netzwerk ausführbare Aktionen — zwei Gruppen:
//   • Warteschlange (Windows-Druckserver, PowerShell): anzeigen, leeren,
//     pausieren/fortsetzen, Testseite, Spooler neu starten.
//   • Gerät (SNMP/HTTP): Erreichbarkeit, Status/Toner lesen, Web-Interface
//     öffnen, physischer Neustart (prtGeneralReset).
// Schreibende/gefährliche Aktionen sind rot, verlangen Bestätigung und werden im
// Dossier protokolliert (logPrinterAction).

import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Loader2, Play, ListChecks, Trash2, Pause,
  PlayCircle, FileText, RotateCcw, Wifi, Globe, Power, Droplet, AlertTriangle,
  Monitor, Link2, Star, Unplug,
} from 'lucide-react'
import type { PrinterMasterData } from '../../services/printerDossier'
import { logPrinterAction, effectivePrintServer } from '../../services/printerDossier'
import {
  queueStatus, listJobs, clearJobs, pausePrinter, resumePrinter, printTestPage, restartSpooler,
  pingPrinter, openPrinterWeb, snmpPrinterStatus, snmpRestartDevice, resolvePrinterIp, type ActionResult,
} from '../../services/printerActions'
import {
  connectPrinterByName, setDefaultPrinterByName, removePrinterConnectionByName, type ClientActionResult,
} from '../../services/printerConnections'
import { PrintServerCheck } from './PrintServerCheck'

type Severity = 'read' | 'write' | 'critical'

interface ActionDef {
  id: string
  label: string
  info: string
  icon: React.ReactNode
  severity: Severity
  run: () => Promise<ActionResult>
}

function ActionRow({ a, currentUser, printerName, group }: { a: ActionDef; currentUser: string; printerName: string; group: string }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [open, setOpen] = useState(false)
  const isWrite = a.severity !== 'read'

  async function run() {
    if (running) return
    if (a.severity === 'critical' && !window.confirm(`ACHTUNG: „${a.label}" wirklich ausführen?\n\n${a.info}`)) return
    if (a.severity === 'write' && !window.confirm(`Aktion „${a.label}" auf ${printerName} ausführen?`)) return
    setRunning(true); setResult(null); setOpen(true)
    try {
      const r = await a.run()
      setResult(r)
      if (isWrite) void logPrinterAction(printerName, `${a.label} → ${r.ok ? 'OK' : 'Fehler'}${r.text ? ' — ' + r.text.slice(0, 200) : ''}`, currentUser, group)
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setRunning(false) }
  }

  return (
    <div className={`rounded-md border ${a.severity === 'critical' ? 'border-red-500/40' : a.severity === 'write' ? 'border-amber-500/25' : 'border-border'} bg-background overflow-hidden`}>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground shrink-0">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className={`shrink-0 ${a.severity === 'critical' ? 'text-red-400' : a.severity === 'write' ? 'text-amber-400' : 'text-blue-400'}`}>{a.icon}</span>
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-semibold ${a.severity === 'critical' ? 'text-red-300' : 'text-foreground'}`}>{a.label}</span>
          <span className="block text-[10px] text-muted-foreground truncate" title={a.info}>{a.info}</span>
        </div>
        <button onClick={run} disabled={running}
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md font-semibold shrink-0 disabled:opacity-40 ${a.severity === 'critical' ? 'bg-red-500/90 text-white hover:bg-red-500' : a.severity === 'write' ? 'bg-amber-500/90 text-white hover:bg-amber-500' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
          {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}Ausführen
        </button>
      </div>
      {open && (
        <div className="px-3 pb-2 border-t border-border/50 pt-1.5">
          {result ? (
            <pre className={`text-[11px] whitespace-pre-wrap break-words max-h-56 overflow-y-auto rounded p-2 ${result.ok ? 'bg-muted/20 text-foreground' : 'bg-red-500/10 text-red-300'}`}>{result.text || (result.ok ? 'OK' : 'Fehler')}</pre>
          ) : (!running && <p className="text-[10px] text-muted-foreground italic">Noch nicht ausgeführt.</p>)}
        </div>
      )}
    </div>
  )
}

/** Ermittelt die effektive Geräte-IP: Stammdaten-IP, sonst per DNS auflösen. */
async function effectiveIp(printerName: string, master?: PrinterMasterData): Promise<string> {
  const ip = (master?.ip || '').trim()
  if (ip) return ip
  return resolvePrinterIp(printerName)
}

export function PrinterActions({ printerName, master, currentUser }: {
  printerName: string
  master?: PrinterMasterData
  currentUser: string
}) {
  const server = effectivePrintServer(master)   // Stammdaten-Override, sonst zentraler Standard (w3149)
  const community = (master?.snmpCommunity || 'public').trim() || 'public'
  const writeCommunity = (master?.snmpWriteCommunity || '').trim()
  const hasIp = !!(master?.ip || '').trim()

  const queueActions: ActionDef[] = [
    { id: 'qstatus', label: 'Warteschlangen-Status', info: 'Status, Auftragszahl, Port & Treiber anzeigen', icon: <ListChecks size={13} />, severity: 'read', run: () => queueStatus(printerName, server) },
    { id: 'jobs', label: 'Aufträge anzeigen', info: 'Aktuelle Druckaufträge in der Warteschlange', icon: <FileText size={13} />, severity: 'read', run: () => listJobs(printerName, server) },
    { id: 'clear', label: 'Warteschlange leeren', info: 'Alle Aufträge dieses Druckers löschen', icon: <Trash2 size={13} />, severity: 'write', run: () => clearJobs(printerName, server) },
    { id: 'pause', label: 'Warteschlange pausieren', info: 'Drucker anhalten (Aufträge sammeln sich an)', icon: <Pause size={13} />, severity: 'write', run: () => pausePrinter(printerName, server) },
    { id: 'resume', label: 'Warteschlange fortsetzen', info: 'Angehaltenen Drucker wieder freigeben', icon: <PlayCircle size={13} />, severity: 'write', run: () => resumePrinter(printerName, server) },
    { id: 'testpage', label: 'Testseite drucken', info: 'Windows-Testseite senden (Ende-zu-Ende-Test)', icon: <FileText size={13} />, severity: 'write', run: () => printTestPage(printerName, server) },
    { id: 'spooler', label: 'Druckspooler neu starten', info: 'ACHTUNG: betrifft ALLE Drucker des Servers/PCs — kurze Unterbrechung für alle', icon: <RotateCcw size={13} />, severity: 'critical', run: () => restartSpooler(server) },
  ]

  const deviceActions: ActionDef[] = [
    { id: 'ping', label: 'Erreichbarkeit prüfen', info: 'Ping / RAW-9100 / HTTP', icon: <Wifi size={13} />, severity: 'read', run: async () => { const ip = await effectiveIp(printerName, master); return ip ? pingPrinter(ip) : { ok: false, text: 'Keine IP — in Stammdaten eintragen.' } } },
    { id: 'snmp', label: 'Status & Toner (SNMP)', info: 'Modell, Gerätestatus, Seitenzähler, Füllstände', icon: <Droplet size={13} />, severity: 'read', run: async () => {
      const ip = await effectiveIp(printerName, master); if (!ip) return { ok: false, text: 'Keine IP — in Stammdaten eintragen.' }
      const s = await snmpPrinterStatus(ip, community)
      if (!s.reachable) return { ok: false, text: s.error || 'SNMP nicht erreichbar' }
      const lines = [
        s.sysDescr ? `Modell: ${s.sysDescr}` : '',
        s.printerStatus ? `Status: ${s.printerStatus}` : '',
        typeof s.pageCount === 'number' ? `Seitenzähler: ${s.pageCount.toLocaleString('de-DE')}` : '',
        ...s.supplies.map(x => `  ${x.name}: ${x.percent != null ? x.percent + '%' : (x.level === -3 ? 'OK' : '—')}`),
      ].filter(Boolean)
      return { ok: true, text: lines.join('\n') || 'Keine SNMP-Daten' }
    } },
    { id: 'web', label: 'Web-Interface öffnen', info: 'Eingebettete Geräteseite (EWS) im Browser', icon: <Globe size={13} />, severity: 'read', run: async () => { const ip = await effectiveIp(printerName, master); return openPrinterWeb(ip || printerName) } },
    { id: 'reset', label: 'Gerät physisch neu starten (SNMP)', info: 'powerCycleReset — Gerät ~1–3 min offline. Benötigt SNMP-Write-Community (oft deaktiviert). Fallback: Web-Interface.', icon: <Power size={13} />, severity: 'critical', run: async () => { const ip = await effectiveIp(printerName, master); if (!ip) return { ok: false, text: 'Keine IP — in Stammdaten eintragen.' }; return snmpRestartDevice(ip, writeCommunity) } },
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Aktionen für <span className="font-mono text-foreground">{printerName}</span>.
        {server ? <> Warteschlange über Druckserver <span className="font-mono text-foreground">{server}</span>.</> : <> Warteschlange über den lokalen Spooler (Druckserver in den Stammdaten hinterlegen, um einen Server anzusteuern).</>}
      </p>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Warteschlange (Druckserver)</p>
        <div className="space-y-1.5">
          {queueActions.map(a => <ActionRow key={a.id} a={a} currentUser={currentUser} printerName={printerName} group="Warteschlange" />)}
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Gerät (SNMP / Web)</p>
        {!hasIp && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-md px-2 py-1 mb-1.5">
            <AlertTriangle size={12} className="shrink-0 mt-px" />
            Keine IP in den Stammdaten — Geräte-Aktionen versuchen, den Namen per DNS aufzulösen. Für zuverlässige SNMP-/Web-Aktionen bitte die IP eintragen.
          </div>
        )}
        <div className="space-y-1.5">
          {deviceActions.map(a => <ActionRow key={a.id} a={a} currentUser={currentUser} printerName={printerName} group="Gerät" />)}
        </div>
      </div>

      <ClientConnectionGroup printerName={printerName} master={master} currentUser={currentUser} />
    </div>
  )
}

// ── Gruppe „Client-Verbindung" — Drucker auf einem Computer für den angemeldeten
//    Benutzer verbinden / als Standard setzen / entfernen (läuft im User-Kontext).
function ClientConnectionGroup({ printerName, master, currentUser }: { printerName: string; master?: PrinterMasterData; currentUser: string }) {
  const [host, setHost] = useState('')
  const [busy, setBusy] = useState<'connect' | 'default' | 'remove' | null>(null)
  const [result, setResult] = useState<ClientActionResult | null>(null)
  const server = effectivePrintServer(master)   // Standard-Druckserver w3149 (oder Override) — echte Freigabe wird beim Ausführen aufgelöst

  async function run(kind: 'connect' | 'default' | 'remove', fn: () => Promise<ClientActionResult>, label: string, confirmMsg?: string) {
    const h = host.trim()
    if (!h) { setResult({ ok: false, text: 'Bitte Ziel-Computer (Hostname) eingeben.' }); return }
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(kind); setResult(null)
    try {
      const r = await fn()
      setResult(r)
      void logPrinterAction(printerName, `${label} → ${r.ok ? 'OK' : 'Fehler'} auf ${h}${r.text ? ' — ' + r.text.slice(0, 200) : ''}`, currentUser, 'Client-Verbindung')
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(null) }
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Client-Verbindung (angemeldeter Benutzer)</p>
      <p className="text-[11px] text-muted-foreground mb-1.5">Verbindet <span className="font-mono text-foreground">{printerName}</span> über Druckserver <span className="font-mono text-foreground">{server}</span> für den aktuell am Ziel-PC angemeldeten Benutzer (die echte Freigabe wird automatisch aufgelöst).</p>
      <div className="rounded-md border border-border bg-background p-2 space-y-2">
        <div className="flex items-center gap-2">
          <Monitor size={13} className="text-muted-foreground shrink-0" />
          <input value={host} onChange={e => setHost(e.target.value)} placeholder="Ziel-Computer (Hostname)"
            className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-card text-foreground focus:outline-none focus:border-primary font-mono" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => run('connect', () => connectPrinterByName(host.trim(), server, printerName), 'Verbinden')} disabled={!!busy || !server}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {busy === 'connect' ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}Verbinden
          </button>
          <button onClick={() => run('default', () => setDefaultPrinterByName(host.trim(), server, printerName), 'Als Standard setzen')} disabled={!!busy || !server}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-amber-500/90 text-white hover:bg-amber-500 disabled:opacity-40">
            {busy === 'default' ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}Als Standard
          </button>
          <button onClick={() => run('remove', () => removePrinterConnectionByName(host.trim(), server, printerName), 'Entfernen', `Drucker ${printerName} auf ${host.trim() || '?'} für den angemeldeten Benutzer entfernen?`)} disabled={!!busy || !server}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-40">
            {busy === 'remove' ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />}Entfernen
          </button>
        </div>
        {result && (
          <pre className={`text-[11px] whitespace-pre-wrap break-words rounded p-2 ${result.ok ? 'bg-muted/20 text-foreground' : 'bg-red-500/10 text-red-300'}`}>{result.text || (result.ok ? 'OK' : 'Fehler')}</pre>
        )}
        <PrintServerCheck printerName={printerName} />
      </div>
    </div>
  )
}
