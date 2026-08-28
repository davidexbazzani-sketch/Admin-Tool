// ── Geräte-Stammdaten: "Stammbaum"-Ansicht im Geräte-Dossier ─────────────────
// Zeigt ALLE im Tool bekannten Infos zu einem PC/Gerät als aufklappbaren Baum:
// AD-Computer, Inventar/Endgeräte, installierte Software, ServiceNow.
// Jede Datenquelle laedt unabhaengig — die UI blockiert nie.

import { useEffect, useState, type ReactNode } from 'react'
import {
  ChevronDown, ChevronRight, Loader2, MonitorSmartphone, Boxes, Package, Ticket,
  AlertTriangle, ExternalLink, Printer, Plus, Search, Link2, CheckCircle2, XCircle,
} from 'lucide-react'
import { api } from '../../electronAPI'
import {
  fetchAdComputerInfo, findInventoryItem, findEndpointDevice, findInstalledSoftware,
  fetchDeviceServiceNow, snRecordUrl, serialFromHostname,
  type AdComputerInfo, type SoftwareResult, type DeviceServiceNow,
} from '../../services/deviceMasterData'
import { modelTypeDisplay, type EndpointDevice } from '../../services/endpointDevices'
import type { InventoryItem } from '../../types/auth'
import { PersonInfoButton } from '../person/PersonDossier'
import {
  loadConnData, forComputer, listServerPrinters, serverConnection, connectPrinter,
  type ConnFlat, type ServerPrinter,
} from '../../services/printerConnections'
import { DEFAULT_PRINT_SERVER, logPrinterAction } from '../../services/printerDossier'
import { PrintServerCheck } from '../printer/PrintServerCheck'
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
function ConnectPrinterPicker({ hostname, onConnected }: { hostname: string; onConnected?: () => void }) {
  const currentUser = useCurrentUser()?.username || ''
  const server = DEFAULT_PRINT_SERVER
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [printers, setPrinters] = useState<ServerPrinter[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)   // shareName des laufenden Verbindens
  const [result, setResult] = useState<{ name: string; ok: boolean; text?: string } | null>(null)

  async function loadList() {
    setLoading(true); setLoadError(null)
    const r = await listServerPrinters(server)
    setLoading(false)
    if (!r.ok) { setLoadError(r.error || 'Druckerliste konnte nicht geladen werden.'); return }
    setPrinters(r.printers)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && printers === null && !loading) void loadList()
  }

  async function connect(sp: ServerPrinter) {
    setBusy(sp.shareName || sp.name); setResult(null)
    try {
      const r = await connectPrinter(hostname, serverConnection(server, sp))
      setResult({ name: sp.name, ok: r.ok, text: r.text })
      void logPrinterAction(sp.name, `Verbinden → ${r.ok ? 'OK' : 'Fehler'} auf ${hostname}${r.text ? ' — ' + r.text.slice(0, 200) : ''}`, currentUser, 'Client-Verbindung')
      if (r.ok) onConnected?.()
    } catch (e) {
      setResult({ name: sp.name, ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(null) }
  }

  const list = (printers ?? []).filter(p => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return p.name.toLowerCase().includes(q) || (p.shareName || '').toLowerCase().includes(q) || (p.location || '').toLowerCase().includes(q)
  })

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <button type="button" onClick={toggle}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
        <Plus size={13} />Drucker verbinden
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border bg-background p-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Freigaben von <span className="font-mono text-foreground">{server}</span> — verbindet für den am PC{' '}
            <span className="font-mono text-foreground">{hostname}</span> angemeldeten Benutzer.
          </p>
          {loading ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-2"><Loader2 size={12} className="animate-spin" />Druckerliste wird geladen…</div>
          ) : loadError ? (
            <div className="flex items-start gap-1.5 text-[11px] text-red-300 bg-red-500/10 border border-red-500/25 rounded px-2 py-1.5">
              <XCircle size={12} className="shrink-0 mt-px" />
              <span className="flex-1">{loadError}</span>
              <button onClick={() => void loadList()} className="shrink-0 underline hover:no-underline">Erneut</button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Search size={13} className="text-muted-foreground shrink-0" />
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Drucker suchen…" autoFocus
                  className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-card text-foreground focus:outline-none focus:border-primary" />
                <span className="text-[10px] text-muted-foreground shrink-0">{list.length}</span>
              </div>
              <div className="max-h-56 overflow-y-auto rounded border border-border divide-y divide-border">
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-2 py-2">Keine passende Freigabe.</p>
                ) : list.map(sp => {
                  const key = sp.shareName || sp.name
                  return (
                    <button key={key} type="button" onClick={() => connect(sp)} disabled={!!busy}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-accent/20 disabled:opacity-50">
                      <Printer size={13} className="text-blue-400 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground truncate">{sp.name}</span>
                        {sp.location && <span className="block text-[10px] text-muted-foreground truncate">{sp.location}</span>}
                      </span>
                      {busy === key ? <Loader2 size={13} className="animate-spin text-muted-foreground shrink-0" /> : <Link2 size={13} className="text-muted-foreground shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {result && (
            <div className={`flex items-start gap-1.5 text-[11px] rounded px-2 py-1.5 ${result.ok ? 'bg-green-500/10 text-green-300 border border-green-500/25' : 'bg-red-500/10 text-red-300 border border-red-500/25'}`}>
              {result.ok ? <CheckCircle2 size={12} className="shrink-0 mt-px" /> : <XCircle size={12} className="shrink-0 mt-px" />}
              <span>{result.name}: {result.text || (result.ok ? 'verbunden' : 'Fehler')}</span>
            </div>
          )}
          <PrintServerCheck />
        </div>
      )}
    </div>
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

export function DeviceMasterData({ hostname, serial, onOpenPerson }: {
  hostname: string
  serial?: string
  onOpenPerson?: (name: string, sam?: string) => void
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
  const [connReload, setConnReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Alle Quellen UNABHAENGIG laden — jeder Block erscheint, sobald er da ist.
    setAdLoading(true); setInvLoading(true); setEpLoading(true); setSwLoading(true); setSnLoading(true)
    fetchAdComputerInfo(hostname).then(r => { if (!cancelled) { setAd(r); setAdLoading(false) } })
    findInventoryItem(hostname).then(r => { if (!cancelled) { setInv(r); setInvLoading(false) } })
    findEndpointDevice(hostname).then(r => { if (!cancelled) { setEp(r); setEpLoading(false) } })
    findInstalledSoftware(hostname).then(r => { if (!cancelled) { setSw(r); setSwLoading(false) } })
    const effSerial = serial || serialFromHostname(hostname) || undefined
    fetchDeviceServiceNow(hostname, effSerial).then(r => { if (!cancelled) { setSn(r); setSnLoading(false) } })
    return () => { cancelled = true }
  }, [hostname, serial])

  // Verbundene Drucker separat laden — damit ein manuelles Neuladen (nach dem
  // Verbinden) nicht alle anderen Blöcke zurück in den Ladezustand versetzt.
  useEffect(() => {
    let cancelled = false
    setConnLoading(true)
    loadConnData().then(d => { if (!cancelled) { setConn(forComputer(d, hostname)); setConnLoading(false) } })
    return () => { cancelled = true }
  }, [hostname, connReload])

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
          return rows.length > 0 ? rows : <Empty text="Kein Eintrag im Inventar oder in der Endgeräte-Übersicht." />
        })()}
      </TreeSection>

      {/* Verbundene Drucker (aus dem Verbindungs-Scan) */}
      <TreeSection icon={<Printer size={14} />} title="Verbundene Drucker" loading={connLoading}
        badge={conn && conn.length > 0 ? `${new Set(conn.map(c => c.printerName.toUpperCase())).size}` : undefined}>
        {(() => {
          if (connLoading && !conn) return <Empty text="Wird geladen…" />
          if (!conn || conn.length === 0) return <Empty text="Keine verbundenen Drucker im letzten Scan (oder Rechner war beim Scan offline / kein Benutzer angemeldet)." />
          const seen = new Set<string>()
          const uniq = conn.filter(c => { const k = c.printerName.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true })
          return uniq.map((c, i) => (
            <Row key={i} label={c.printerName} source="Verbindungs-Scan">
              <span className="inline-flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs">{c.connection}</span>
                {c.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">Standard</span>}
              </span>
            </Row>
          ))
        })()}
        <ConnectPrinterPicker hostname={hostname} onConnected={() => setConnReload(n => n + 1)} />
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
