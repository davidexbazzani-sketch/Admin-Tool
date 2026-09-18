// ── Geräte-Stammdaten: "Stammbaum"-Ansicht im Geräte-Dossier ─────────────────
// Zeigt ALLE im Tool bekannten Infos zu einem PC/Gerät als aufklappbaren Baum:
// AD-Computer, Inventar/Endgeräte, installierte Software, ServiceNow.
// Jede Datenquelle laedt unabhaengig — die UI blockiert nie.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ChevronDown, ChevronRight, Loader2, MonitorSmartphone, Boxes, Package, Ticket,
  AlertTriangle, ExternalLink, Printer, Plus, Link2, CheckCircle2, XCircle, MapPin, Star, RefreshCw,
  HardDrive, Trash2,
} from 'lucide-react'
import { api } from '../../electronAPI'
import {
  fetchAdComputerInfo, findInventoryItem, findEndpointDevice, findInstalledSoftware,
  fetchDeviceServiceNow, snRecordUrl, serialFromHostname,
  type AdComputerInfo, type SoftwareResult, type DeviceServiceNow,
} from '../../services/deviceMasterData'
import { modelTypeDisplay, type EndpointDevice } from '../../services/endpointDevices'
import { findDeviceLocation, type FoundLocation } from '../../services/deviceMaps'
import type { Screen } from '../../types'
import type { InventoryItem } from '../../types/auth'
import { PersonInfoButton } from '../person/PersonDossier'
import {
  loadConnData, forComputer, connectPrinterViaSeal, setDefaultPrinterLocal, setDefaultPrinter,
  type ConnFlat,
} from '../../services/printerConnections'
import { queryLivePrinters, type LivePrintersResult } from '../../services/livePrinters'
import {
  loadStoredNetworkDrives, refreshNetworkDrivesLive, connectNetworkDrive, disconnectNetworkDrive,
  type StoredNetworkDrives,
} from '../../services/deviceNetworkDrives'
import { logPrinterAction } from '../../services/printerDossier'
import { useCurrentUser } from '../../store/authStore'

// ── kleine Bausteine (analog PersonMasterData) ────────────────────────────────

function Row({ label, value, source, children }: { label: string; value?: ReactNode; source?: string; children?: ReactNode }) {
  if (value === undefined && !children) return null
  return (
    <div className="flex items-start gap-2 py-1 pl-1">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-px">{label}</span>
      <span className="text-sm text-foreground min-w-0 flex-1 break-words">{value ?? children}</span>
      {source && <span className="text-[10px] text-muted-foreground/60 shrink-0 pt-0.5" title={`Quelle: ${source}`}>{source}</span>}
    </div>
  )
}

function TreeSection({ icon, title, badge, loading, defaultOpen = true, children }: {
  icon: ReactNode; title: string; badge?: string; loading?: boolean; defaultOpen?: boolean; children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="relative pl-5">
      <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
      <div className="absolute left-1.5 top-4 w-3 h-px bg-border" />
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-accent/20 text-left">
          {open ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
          <span className="text-blue-400 shrink-0">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/25">{badge}</span>}
          {loading && <Loader2 size={12} className="animate-spin text-muted-foreground ml-auto" />}
        </button>
        {open && <div className="px-3 py-2 border-t border-border">{children}</div>}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground italic py-1">{text}</p>
}

// ── Drucker mit diesem PC verbinden ───────────────────────────────────────────
// Zeigt die Freigaben des Druckservers und verbindet den gewählten Drucker mit
// EINEM Klick für den am Ziel-PC angemeldeten Benutzer (User-Kontext, kein WinRM).
export function ConnectPrinterPicker({ hostname, onConnected }: { hostname: string; onConnected?: () => void }) {
  const currentUser = useCurrentUser()?.username || ''
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')                    // SEAL/PLOSSYS-Druckername (Queue)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ name: string; ok: boolean; text?: string } | null>(null)

  // Verbindet einen SEAL/PLOSSYS-Drucker über die SEAL Add Printer Wizard CLI
  // (`sealapw -queue <name>`) im Kontext des am Ziel-PC angemeldeten Benutzers —
  // exakt wie „Rechtsklick → Einrichten" im SEAL-Assistenten.
  async function connectByName() {
    const nm = name.trim()
    if (!nm || busy) return
    setBusy(true); setResult(null)
    try {
      const r = await connectPrinterViaSeal(hostname, nm)
      setResult({ name: nm, ok: r.ok, text: r.text })
      void logPrinterAction(nm, `SEAL-Verbinden → ${r.ok ? 'OK' : 'Fehler'} auf ${hostname}${r.text ? ' — ' + r.text.slice(0, 200) : ''}`, currentUser, 'Client-Verbindung')
      if (r.ok) { setName(''); onConnected?.() }
    } catch (e) {
      setResult({ name: nm, ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
        <Plus size={13} />Drucker verbinden
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border bg-background p-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Installiert den SEAL-Drucker (PLOSSYS) über <span className="font-mono text-foreground">sealapw&nbsp;-queue</span> für den am PC{' '}
            <span className="font-mono text-foreground">{hostname}</span> angemeldeten Benutzer — wie „Rechtsklick → Einrichten" im SEAL-Assistenten.
          </p>
          <div className="flex items-center gap-2">
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') void connectByName() }}
              placeholder="Druckername (z. B. PMD583)"
              className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-card text-foreground focus:outline-none focus:border-primary font-mono" />
            <button type="button" onClick={() => void connectByName()} disabled={busy || !name.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 shrink-0">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}Verbinden
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Den genauen Druckernamen findest du im SEAL-Assistenten (Liste der einrichtbaren Drucker). Das Verbinden kann einige Sekunden dauern.
          </p>
          {result && (
            <div className={`flex items-start gap-1.5 text-[11px] rounded px-2 py-1.5 ${result.ok ? 'bg-green-500/10 text-green-300 border border-green-500/25' : 'bg-red-500/10 text-red-300 border border-red-500/25'}`}>
              {result.ok ? <CheckCircle2 size={12} className="shrink-0 mt-px" /> : <XCircle size={12} className="shrink-0 mt-px" />}
              <span>{result.name}: {result.text || (result.ok ? 'verbunden' : 'Fehler')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Verbundene Netzlaufwerke (LIVE nur auf Klick; Ergebnis zentral gespeichert) ──
// Zeigt den zuletzt gespeicherten Stand sofort (für alle Nutzer), aktualisiert live
// nur per „Live aktualisieren". Verbinden/Trennen läuft im Benutzerkontext des PCs.
function ConnectedNetworkDrives({ hostname }: { hostname: string }) {
  const currentUser = useCurrentUser()?.username || ''
  const [data, setData] = useState<StoredNetworkDrives | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState(false)
  const [letter, setLetter] = useState('')
  const [unc, setUnc] = useState('')
  const [busy, setBusy] = useState('')                    // '' | 'connect' | '<Letter>'
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const hostRef = useRef(hostname)

  useEffect(() => {
    hostRef.current = hostname
    setLoading(true); setData(null); setMsg(null); setOpen(false); setLetter(''); setUnc('')
    loadStoredNetworkDrives(hostname)
      .then(d => { if (hostRef.current === hostname) { setData(d); setLoading(false) } })
      .catch(() => { if (hostRef.current === hostname) setLoading(false) })
  }, [hostname])

  const refreshLive = useCallback(() => {
    const h = hostname
    setRefreshing(true); setMsg(null)
    refreshNetworkDrivesLive(h, currentUser)
      .then(r => { if (hostRef.current === h) setData(r) })
      .finally(() => { if (hostRef.current === h) setRefreshing(false) })
  }, [hostname, currentUser])

  async function doConnect() {
    const l = letter.trim(); const u = unc.trim()
    if (!l || !u || busy) return
    setBusy('connect'); setMsg(null)
    try {
      const r = await connectNetworkDrive(hostname, l, u)
      setMsg({ ok: r.ok, text: r.ok ? `${l.toUpperCase()}: verbunden` : (r.text || 'Verbinden fehlgeschlagen') })
      if (r.ok) { setUnc(''); setLetter(''); setOpen(false); refreshLive() }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }) }
    finally { setBusy('') }
  }

  async function doDisconnect(l: string) {
    if (busy) return
    setBusy(l); setMsg(null)
    try {
      const r = await disconnectNetworkDrive(hostname, l)
      if (r.ok) {
        // Deterministisch aus der Anzeige entfernen (kein Live-Rescan → taucht nicht wieder auf).
        if (r.stored) setData(r.stored)
        else setData(prev => prev ? { ...prev, drives: prev.drives.filter(d => d.letter !== l) } : prev)
        setMsg({ ok: true, text: `${l}: getrennt` })
      } else {
        setMsg({ ok: false, text: r.text || 'Trennen fehlgeschlagen' })
      }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }) }
    finally { setBusy('') }
  }

  const drives = data?.drives || []
  return (
    <div>
      {/* Kopf: Quelle/Datum + „Live aktualisieren" */}
      <div className="flex items-center gap-2 flex-wrap pb-1.5 mb-1 border-b border-border/50">
        {refreshing ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 size={11} className="animate-spin" />live wird abgefragt…</span>
        ) : data?.ok ? (
          <span className="text-[11px] text-green-500 font-medium">● live (WinRM){data.scannedAt ? ' · ' + fmtLastSeen(data.scannedAt) : ''}</span>
        ) : data ? (
          <span className="text-[11px] text-muted-foreground">gespeichert{data.scannedAt ? ' · ' + fmtLastSeen(data.scannedAt) : ''}{data.reason ? ' · live: ' + data.reason : ''}</span>
        ) : loading ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 size={11} className="animate-spin" />lädt…</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">noch nicht abgefragt</span>
        )}
        <button type="button" onClick={() => refreshLive()} disabled={refreshing}
          className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border hover:bg-accent/20 disabled:opacity-50">
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />Live aktualisieren
        </button>
      </div>

      {/* Liste */}
      {drives.length > 0 ? drives.map(d => (
        <Row key={d.letter} label={`${d.letter}:`} source={data?.scannedBy || undefined}>
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground break-all">{d.unc}</span>
            <button type="button" onClick={() => void doDisconnect(d.letter)} disabled={!!busy}
              title="Netzlaufwerk trennen (net use /delete)"
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-red-500/40 text-foreground hover:bg-red-500/10 disabled:opacity-50">
              {busy === d.letter ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} className="text-red-400" />}trennen
            </button>
          </span>
        </Row>
      )) : (
        <Empty text={loading ? 'lädt…' : (data && !data.ok ? `Nicht erreichbar (${data.reason || 'WinRM'}) und kein gespeicherter Stand.` : 'Noch keine Netzlaufwerke geladen — auf „Live aktualisieren" klicken.')} />
      )}

      {msg && (
        <div className={`mt-1.5 flex items-start gap-1.5 text-[11px] rounded px-2 py-1.5 ${msg.ok ? 'bg-green-500/10 text-green-300 border border-green-500/25' : 'bg-red-500/10 text-red-300 border border-red-500/25'}`}>
          {msg.ok ? <CheckCircle2 size={12} className="shrink-0 mt-px" /> : <XCircle size={12} className="shrink-0 mt-px" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Neues Netzlaufwerk verbinden */}
      <div className="mt-2 pt-2 border-t border-border">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus size={13} />Netzlaufwerk verbinden
        </button>
        {open && (
          <div className="mt-2 rounded-md border border-border bg-background p-2 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Verbindet ein Netzlaufwerk für den am PC <span className="font-mono text-foreground">{hostname}</span> angemeldeten Benutzer (persistent, Benutzerkontext).
            </p>
            <div className="flex items-center gap-2">
              <select value={letter} onChange={e => setLetter(e.target.value)}
                className="px-2 py-1 text-sm rounded border border-border bg-card text-foreground focus:outline-none focus:border-primary font-mono">
                <option value="">Buchst.</option>
                {'GHIJKLMNOPQRSTUVWXYZ'.split('').map(L => <option key={L} value={L}>{L}:</option>)}
              </select>
              <input value={unc} onChange={e => setUnc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void doConnect() }}
                placeholder="\\Server\Freigabe" spellCheck={false}
                className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-card text-foreground focus:outline-none focus:border-primary font-mono" />
              <button type="button" onClick={() => void doConnect()} disabled={busy === 'connect' || !letter.trim() || !unc.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 shrink-0">
                {busy === 'connect' ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}Verbinden
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">Läuft im Benutzerkontext (Scheduled-Task) und aktualisiert danach automatisch den Stand.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── „Als Standard setzen" für einen verbundenen Drucker (User-Kontext) ────────
// Setzt den Drucker für den am Ziel-PC angemeldeten Benutzer als Standard. Nutzt bei
// vorhandener UNC den Direktweg, sonst die selbstheilende Namensauflösung.
export function SetDefaultButton({ hostname, printerName, unc, onDone }: {
  hostname: string; printerName: string; unc?: string; onDone?: () => void
}) {
  const currentUser = useCurrentUser()?.username || ''
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ ok: boolean; text?: string } | null>(null)
  async function run() {
    setBusy(true); setRes(null)
    try {
      // Live-Zeilen liefern den EXAKTEN installierten Namen (p.name) → per Name setzen
      // (funktioniert für SEAL/PrinterLogic-PLS-Drucker). Scan-Zeilen haben eine UNC.
      const r = unc
        ? await setDefaultPrinter(hostname, unc)
        : await setDefaultPrinterLocal(hostname, printerName)
      setRes({ ok: r.ok, text: r.text })
      void logPrinterAction(printerName, `Als Standard setzen → ${r.ok ? 'OK' : 'Fehler'} auf ${hostname}${r.text ? ' — ' + r.text.slice(0, 200) : ''}`, currentUser, 'Client-Verbindung')
      if (r.ok) onDone?.()
    } catch (e) {
      setRes({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={() => void run()} disabled={busy}
        title="Für den am PC angemeldeten Benutzer als Standarddrucker setzen"
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/40 text-foreground hover:bg-amber-500/10 disabled:opacity-50">
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Star size={11} className="text-amber-500" />}Als Standard
      </button>
      {res && (res.ok
        ? <CheckCircle2 size={11} className="text-green-500" />
        : <XCircle size={11} className="text-red-400" />)}
    </span>
  )
}

function fmtLastSeen(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const abs = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  let rel: string
  if (mins < 2) rel = 'gerade eben'
  else if (mins < 60) rel = `vor ${mins} Min.`
  else if (mins < 60 * 24) rel = `vor ${Math.floor(mins / 60)} Std.`
  else { const days = Math.floor(mins / (60 * 24)); rel = days === 1 ? 'gestern' : `vor ${days} Tagen` }
  return `${rel} (${abs})`
}

/** "DOMAIN\\user" → "user" für den Personen-Dossier-Button. */
function bareUser(u?: string): string {
  if (!u) return ''
  const p = u.split('\\')
  return (p[p.length - 1] || '').trim()
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export function DeviceMasterData({ hostname, serial, onOpenPerson, onShowLocation }: {
  hostname: string
  serial?: string
  onOpenPerson?: (name: string, sam?: string) => void
  onShowLocation?: (screen: Screen, hostname: string) => void
}) {
  const [ad, setAd] = useState<AdComputerInfo | null>(null)
  const [adLoading, setAdLoading] = useState(true)
  const [inv, setInv] = useState<InventoryItem | null>(null)
  const [invLoading, setInvLoading] = useState(true)
  const [ep, setEp] = useState<EndpointDevice | null>(null)
  const [epLoading, setEpLoading] = useState(true)
  const [sw, setSw] = useState<SoftwareResult | null>(null)
  const [swLoading, setSwLoading] = useState(true)
  const [sn, setSn] = useState<DeviceServiceNow | null>(null)
  const [snLoading, setSnLoading] = useState(true)
  const [conn, setConn] = useState<ConnFlat[] | null>(null)
  const [connLoading, setConnLoading] = useState(true)
  const [livePr, setLivePr] = useState<LivePrintersResult | null>(null)
  const [livePrLoading, setLivePrLoading] = useState(false)          // Live NUR auf Klick — nicht automatisch
  const [mapLoc, setMapLoc] = useState<FoundLocation | null>(null)   // Standort auf einer der 3 Karten (falls verortet)
  const curHostRef = useRef(hostname)
  useEffect(() => { curHostRef.current = hostname; setLivePr(null); setLivePrLoading(false) }, [hostname])
  // Live-Abfrage (WinRM) — wird NUR durch „Live aktualisieren" bzw. nach Verbinden/Standard ausgelöst.
  const refreshLive = useCallback(() => {
    const h = hostname
    setLivePrLoading(true); setLivePr(null)
    queryLivePrinters(h, { force: true })
      .then(r => { if (curHostRef.current === h) setLivePr(r) })
      .finally(() => { if (curHostRef.current === h) setLivePrLoading(false) })
  }, [hostname])

  useEffect(() => {
    let cancelled = false
    // Alle Quellen UNABHAENGIG laden — jeder Block erscheint, sobald er da ist.
    setAdLoading(true); setInvLoading(true); setEpLoading(true); setSwLoading(true); setSnLoading(true)
    fetchAdComputerInfo(hostname).then(r => { if (!cancelled) { setAd(r); setAdLoading(false) } })
    findInventoryItem(hostname).then(r => { if (!cancelled) { setInv(r); setInvLoading(false) } })
    findEndpointDevice(hostname, serial).then(r => { if (!cancelled) { setEp(r); setEpLoading(false) } })
    findInstalledSoftware(hostname).then(r => { if (!cancelled) { setSw(r); setSwLoading(false) } })
    const effSerial = serial || serialFromHostname(hostname) || undefined
    fetchDeviceServiceNow(hostname, effSerial).then(r => { if (!cancelled) { setSn(r); setSnLoading(false) } })
    // OT-Geräte: ist dieses Gerät auf dem Hallenplan verortet?
    setMapLoc(null)
    findDeviceLocation(hostname, serial).then(loc => { if (!cancelled) setMapLoc(loc) }).catch(() => {})
    return () => { cancelled = true }
  }, [hostname, serial])

  // Verbundene Drucker aus dem GESPEICHERTEN Verbindungs-Scan laden — erscheinen sofort.
  // Die Live-Abfrage (WinRM) läuft NICHT automatisch, sondern nur über „Live aktualisieren"
  // (refreshLive) bzw. nach Verbinden/Standard-Setzen.
  useEffect(() => {
    let cancelled = false
    setConnLoading(true)
    loadConnData().then(d => { if (!cancelled) { setConn(forComputer(d, hostname)); setConnLoading(false) } })
    return () => { cancelled = true }
  }, [hostname])

  const effSerial = serial || ep?.serial || serialFromHostname(hostname) || sn?.ci?.serial
  const assignedUser = inv?.assignedTo || ep?.assignedTo || ad?.managedBy || sn?.ci?.assignedTo
  const curUser = bareUser(ad?.currentUser)

  return (
    <div className="space-y-3">
      {/* Wurzelknoten + Online-Status */}
      <div className="flex items-center gap-2 pl-1 flex-wrap">
        <MonitorSmartphone size={16} className="text-blue-400" />
        <span className="text-sm font-semibold text-foreground font-mono">{hostname}</span>
        {effSerial && <span className="text-xs text-muted-foreground">· SN <span className="font-mono">{effSerial}</span></span>}
        {ad && !ad.found && !adLoading && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle size={9} />{ad.error || 'Kein AD-Computerobjekt'}
          </span>
        )}
        {ad?.found && ad.enabled === false && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">AD-Konto deaktiviert</span>
        )}
      </div>

      {/* Live-Online-Status */}
      <div className="flex items-center gap-2 pl-1 flex-wrap">
        {adLoading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" />Prüfe Online-Status…</span>
        ) : ad?.online ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-green-500/15 text-green-300 border border-green-500/30">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span></span>
            Online{ad.onlineMethod ? ` (${ad.onlineMethod})` : ''}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-muted/30 text-muted-foreground border border-border">Offline</span>
        )}
        {curUser && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            angemeldet: <span className="text-foreground">{curUser}</span>
            {onOpenPerson && <PersonInfoButton name={curUser} sam={curUser} />}
          </span>
        )}
        {ad?.lastLogon && !ad.online && (
          <span className="text-xs text-muted-foreground">Zuletzt: <span className="text-foreground">{fmtLastSeen(ad.lastLogon)}</span></span>
        )}
      </div>

      {/* AD-Computer */}
      <TreeSection icon={<MonitorSmartphone size={14} />} title="Active Directory (Computer)" loading={adLoading}>
        {(() => {
          if (adLoading && !ad) return <Empty text="Wird geladen…" />
          if (!ad?.found) return <Empty text={ad?.error || 'Kein AD-Computerobjekt gefunden.'} />
          const rows: ReactNode[] = []
          if (ad.os) rows.push(<Row key="os" label="Betriebssystem" value={[ad.os, ad.osVersion].filter(Boolean).join(' · ')} source="AD" />)
          rows.push(<Row key="en" label="Status" value={ad.enabled === false ? <span className="text-red-300">deaktiviert</span> : 'aktiviert'} source="AD" />)
          if (ad.description) rows.push(<Row key="d" label="Beschreibung" value={ad.description} source="AD" />)
          if (ad.managedBy) rows.push(<Row key="mb" label="Verwaltet von" source="AD">
            <span className="inline-flex items-center gap-1">{ad.managedBy}{onOpenPerson && <PersonInfoButton name={ad.managedBy} />}</span>
          </Row>)
          if (ad.ipv4) rows.push(<Row key="ip" label="IP (AD)" value={<span className="font-mono">{ad.ipv4}</span>} source="AD" />)
          if (ad.ou) rows.push(<Row key="ou" label="OU" value={<span className="text-xs break-all">{ad.ou}</span>} source="AD" />)
          if (ad.lastLogon) rows.push(<Row key="ll" label="Letzte Anmeldung" value={fmtLastSeen(ad.lastLogon)} source="AD" />)
          if (ad.whenCreated) { const d = new Date(ad.whenCreated); if (!isNaN(d.getTime())) rows.push(<Row key="wc" label="Im AD angelegt" value={d.toLocaleDateString('de-DE')} source="AD" />) }
          return rows
        })()}
      </TreeSection>

      {/* Inventar / Endgeräte */}
      <TreeSection icon={<Boxes size={14} />} title="Inventar & Endgerät" loading={invLoading || epLoading}>
        {(() => {
          if ((invLoading || epLoading) && !inv && !ep) return <Empty text="Wird geladen…" />
          const rows: ReactNode[] = []
          if (assignedUser) rows.push(<Row key="au" label="Zugewiesen an" source={inv?.assignedTo ? 'Inventar' : (ep?.assignedTo ? 'Endgeräte' : 'AD')}>
            <span className="inline-flex items-center gap-1">{assignedUser}{onOpenPerson && <PersonInfoButton name={assignedUser} sam={inv?.corpId} />}</span>
          </Row>)
          if (inv?.ip) rows.push(<Row key="iip" label="IP-Adresse" value={<span className="font-mono">{inv.ip}</span>} source="Inventar" />)
          if (inv?.mac) rows.push(<Row key="imac" label="MAC-Adresse" value={<span className="font-mono">{inv.mac}</span>} source="Inventar (Scan)" />)
          if (inv?.serial) rows.push(<Row key="isn" label="Seriennummer" value={<span className="font-mono">{inv.serial}</span>} source="Inventar (Scan)" />)
          if (inv?.category) rows.push(<Row key="cat" label="Kategorie" value={inv.category} source="Inventar" />)
          if (inv?.description) rows.push(<Row key="idesc" label="Standort/Notiz" value={inv.description} source="Inventar" />)
          if (inv?.department) rows.push(<Row key="dep" label="Abteilung (Nutzer)" value={inv.department} source="Inventar/AD" />)
          if (ep?.serial) rows.push(<Row key="sn" label="Seriennummer" value={<span className="font-mono">{ep.serial}</span>} source="Endgeräte" />)
          if (ep?.model) rows.push(<Row key="mod" label="Modell" value={`${ep.model}${modelTypeDisplay(ep.model) !== '—' ? ' · ' + modelTypeDisplay(ep.model) : ''}`} source="Endgeräte" />)
          if (ep?.state) rows.push(<Row key="st" label="Status" value={[ep.state, ep.substate].filter(Boolean).join(' · ')} source="Endgeräte" />)
          if (ep?.retiredDate) rows.push(<Row key="rd" label="Leasingende" value={ep.retiredDate} source="Endgeräte" />)
          if (ep?.company) rows.push(<Row key="co" label="Unternehmen" value={ep.company} source="Endgeräte" />)
          if (ep?.comments) rows.push(<Row key="cm" label="Kommentar" value={ep.comments} source="Endgeräte" />)
          // „Standort" nur, wenn das Gerät auf einer der drei Karten verortet ist.
          if (mapLoc) rows.push(<Row key="ot" label="Standort" source={mapLoc.label}>
            <span className="inline-flex items-center gap-2 flex-wrap">
              <span>{mapLoc.device.arbeitsplatz ? `${mapLoc.roomLabel}: ${mapLoc.device.arbeitsplatz}` : 'auf der Karte verortet'}</span>
              <button onClick={() => onShowLocation?.(mapLoc.mapId, hostname)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10 text-xs">
                <MapPin size={12} />Standort anzeigen
              </button>
            </span>
          </Row>)
          return rows.length > 0 ? rows : <Empty text="Kein Eintrag im Inventar oder in der Endgeräte-Übersicht." />
        })()}
      </TreeSection>

      {/* Verbundene Netzlaufwerke – LIVE nur auf Klick, Ergebnis zentral gespeichert */}
      <TreeSection icon={<HardDrive size={14} />} title="Verbundene Netzlaufwerke">
        <ConnectedNetworkDrives hostname={hostname} />
      </TreeSection>

      {/* Verbundene Drucker – LIVE (WinRM), Verbindungs-Scan als Fallback */}
      <TreeSection icon={<Printer size={14} />} title="Verbundene Drucker" loading={livePrLoading && !livePr}
        badge={livePr?.ok && livePr.printers.length > 0
          ? String(livePr.printers.length)
          : (conn && conn.length > 0 ? `${new Set(conn.map(c => c.printerName.toUpperCase())).size}` : undefined)}>
        {(() => {
          const showLive = !!(livePr?.ok && livePr.printers.length > 0)
          const stored: ConnFlat[] = (() => {
            if (!conn || conn.length === 0) return []
            const seen = new Set<string>()
            return conn.filter(c => { const k = c.printerName.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true })
          })()
          const DEFBADGE = <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-black border border-amber-600 font-semibold inline-flex items-center gap-1">★ Standarddrucker</span>
          const rows: ReactNode[] = []

          // Kopf: Quelle/Datum + „Live aktualisieren". Gespeicherte Drucker werden SOFORT
          // gezeigt (auch offline), Live-Abfrage aktualisiert sie, sobald der PC erreichbar ist.
          rows.push(
            <div key="hdr" className="flex items-center gap-2 flex-wrap pb-1.5 mb-1 border-b border-border/50">
              {livePrLoading ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 size={11} className="animate-spin" />live wird abgefragt…</span>
              ) : showLive ? (
                <span className="text-[11px] text-green-500 font-medium">● live (WinRM)</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {stored.length > 0
                    ? `gespeichert${stored[0].scannedAt ? ' · Scan ' + fmtLastSeen(stored[0].scannedAt) : ''}${livePr && !livePr.ok ? ' · live nicht erreichbar' : ''}`
                    : (livePr && !livePr.ok ? `offline (${livePr.reason || 'WinRM'})` : '')}
                </span>
              )}
              <button type="button" onClick={() => refreshLive()} disabled={livePrLoading}
                className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border hover:bg-accent/20 disabled:opacity-50">
                <RefreshCw size={11} className={livePrLoading ? 'animate-spin' : ''} />Live aktualisieren
              </button>
            </div>
          )

          if (showLive) {
            const sorted = [...livePr!.printers].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name, 'de'))
            sorted.forEach((p, i) => rows.push(
              <Row key={`lp${i}`} label={p.name} source="Live (WinRM)">
                <span className="inline-flex items-center gap-2 flex-wrap">
                  {p.port && <span className="font-mono text-xs text-muted-foreground">{p.port}</span>}
                  {p.isDefault ? DEFBADGE : <SetDefaultButton hostname={hostname} printerName={p.name} onDone={refreshLive} />}
                </span>
              </Row>
            ))
          } else if (stored.length > 0) {
            const sorted = [...stored].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.printerName.localeCompare(b.printerName, 'de'))
            sorted.forEach((c, i) => rows.push(
              <Row key={`st${i}`} label={c.printerName} source="gespeichert">
                <span className="inline-flex items-center gap-2 flex-wrap">
                  {(c.connection || c.port) && <span className="font-mono text-xs text-muted-foreground">{c.connection || c.port}</span>}
                  {c.isDefault ? DEFBADGE : <SetDefaultButton hostname={hostname} printerName={c.printerName} unc={c.connection || undefined} onDone={refreshLive} />}
                </span>
              </Row>
            ))
          } else if (livePrLoading) {
            rows.push(<Empty key="ld" text="Drucker werden live abgefragt (WinRM)…" />)
          } else {
            rows.push(<Empty key="e" text={livePr && !livePr.ok
              ? `Offline/WinRM (${livePr.reason || '—'}) und kein gespeicherter Scan vorhanden.`
              : 'Kein gespeicherter Drucker-Scan für dieses Gerät — für den aktuellen Stand auf „Live aktualisieren" klicken.'} />)
          }
          return rows
        })()}
        <ConnectPrinterPicker hostname={hostname} onConnected={refreshLive} />
      </TreeSection>

      {/* Software-Inventar */}
      <TreeSection icon={<Package size={14} />} title="Installierte Software" loading={swLoading}
        badge={sw?.found ? `${sw.software.length}` : undefined}>
        {(() => {
          if (swLoading && !sw) return <Empty text="Wird geladen…" />
          if (!sw?.found) return <Empty text="Für dieses Gerät liegt kein Software-Scan vor (Software-Inventar)." />
          return (
            <div>
              {(sw.scannedAt || sw.method) && (
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  {sw.scannedAt && <>Scan: {fmtLastSeen(sw.scannedAt)}</>}
                  {sw.method && <> · Methode: {sw.method === 1 ? 'WinRM' : sw.method === 2 ? 'Registry' : 'PsExec'}</>}
                </p>
              )}
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {sw.software.map((s, i) => (
                  <div key={i} className="flex items-baseline gap-2 py-0.5 border-b border-border/40 last:border-0">
                    <span className="text-xs text-foreground flex-1 min-w-0 break-words">{s.DisplayName}</span>
                    {s.DisplayVersion && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{s.DisplayVersion}</span>}
                    {s.Publisher && <span className="text-[10px] text-muted-foreground/70 shrink-0 max-w-[38%] truncate" title={s.Publisher}>{s.Publisher}</span>}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </TreeSection>

      {/* ServiceNow */}
      <TreeSection icon={<Ticket size={14} />} title="ServiceNow" loading={snLoading}
        badge={sn?.tickets && sn.tickets.length > 0 ? `${sn.tickets.length} Ticket(s)` : undefined}>
        {(() => {
          if (snLoading && !sn) return <Empty text="Wird geladen…" />
          if (!sn?.configured) return <Empty text="ServiceNow ist nicht konfiguriert (Zugang im ServiceNow-Screen einrichten)." />
          if (sn.needsLogin) return <Empty text="ServiceNow-Anmeldung erforderlich (im ServiceNow-Screen anmelden)." />
          const rows: ReactNode[] = []
          const ci = sn.ci
          if (ci) {
            if (ci.assetTag) rows.push(<Row key="at" label="Asset-Tag" value={<span className="font-mono">{ci.assetTag}</span>} source="ServiceNow" />)
            if (ci.model) rows.push(<Row key="cm" label="Modell" value={[ci.manufacturer, ci.model].filter(Boolean).join(' ')} source="ServiceNow" />)
            if (ci.os) rows.push(<Row key="cos" label="OS" value={ci.os} source="ServiceNow" />)
            if (ci.ip) rows.push(<Row key="cip" label="IP" value={<span className="font-mono">{ci.ip}</span>} source="ServiceNow" />)
            if (ci.assignedTo) rows.push(<Row key="ca" label="Zugewiesen an" value={ci.assignedTo} source="ServiceNow" />)
            if (ci.location) rows.push(<Row key="cl" label="Standort" value={ci.location} source="ServiceNow" />)
            if (ci.installStatus) rows.push(<Row key="cis" label="Status" value={ci.installStatus} source="ServiceNow" />)
            if (ci.warrantyExpiration) rows.push(<Row key="cw" label="Garantie bis" value={ci.warrantyExpiration} source="ServiceNow" />)
            if (ci.lastDiscovered) rows.push(<Row key="cld" label="Zuletzt erkannt" value={ci.lastDiscovered} source="ServiceNow" />)
            if (ci.sysId && sn.instanceUrl) rows.push(
              <div key="cilink" className="py-1 pl-1">
                <button onClick={() => api().openExternal(snRecordUrl(sn.instanceUrl!, 'cmdb_ci_computer', ci.sysId!))}
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"><ExternalLink size={11} />CI in ServiceNow öffnen</button>
              </div>)
          } else {
            rows.push(<Empty key="noci" text="Kein CMDB-Eintrag (cmdb_ci_computer) zu diesem Gerät gefunden." />)
          }
          if (sn.tickets.length > 0) {
            rows.push(
              <div key="tk" className="mt-2 pt-2 border-t border-border space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Tickets zum Gerät</p>
                {sn.tickets.map(t => (
                  <button key={t.sysId} onClick={() => sn.instanceUrl && api().openExternal(snRecordUrl(sn.instanceUrl, t.table, t.sysId))}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-md border border-border bg-background hover:bg-accent/30 text-left">
                    <span className="text-[11px] font-mono text-blue-400 shrink-0">{t.number}</span>
                    <span className="text-xs text-foreground flex-1 min-w-0 truncate" title={t.shortDescription}>{t.shortDescription}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{t.state}</span>
                    <ExternalLink size={11} className="text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>)
          }
          if (sn.error) rows.push(<Empty key="err" text={`Hinweis: ${sn.error}`} />)
          return rows.length > 0 ? rows : <Empty text="Keine ServiceNow-Daten zu diesem Gerät." />
        })()}
      </TreeSection>
    </div>
  )
}
