// ── Drucker-Stammdaten (Tab "Stammdaten" im Drucker-Dossier) ─────────────────
// Zeigt die Basis-Stammdaten aus dem SEAL-Wizard-Seed (Duplex/Farbe/Format/
// Standort) + frei editierbare Zusatzfelder (IP, Modell, Tonerart, Druckserver,
// SNMP-Community …). Ein "Gerät scannen"-Button liest live per SNMP Modell,
// Status, Seitenzähler und Toner-Füllstände + Warteschlangen-Status und bietet
// an, erkannte Werte (IP, Modell) zu übernehmen. Zusätzlich werden Inventar-
// und ServiceNow-Daten (falls vorhanden) schreibgeschützt angezeigt.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown, ChevronRight, Loader2, Printer, Save, Plus, Trash2, RefreshCw,
  Boxes, Ticket, ExternalLink, Wifi, WifiOff, Droplet, FileStack,
} from 'lucide-react'
import { api } from '../../electronAPI'
import { seedForPrinter } from '../../data/printerSeed'
import type { PrinterMasterData, PrinterCustomField } from '../../services/printerDossier'
import {
  resolvePrinterIp, pingPrinter, queueStatus, snmpPrinterStatus, type SnmpPrinterStatus,
} from '../../services/printerActions'
import { findInventoryItem, fetchDeviceServiceNow, snRecordUrl, type DeviceServiceNow } from '../../services/deviceMasterData'
import type { InventoryItem } from '../../types/auth'

function Section({ icon, title, badge, defaultOpen = true, children }: {
  icon: ReactNode; title: string; badge?: string; defaultOpen?: boolean; children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-accent/20 text-left">
        {open ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
        <span className="text-blue-400 shrink-0">{icon}</span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/25">{badge}</span>}
      </button>
      {open && <div className="px-3 py-2.5 border-t border-border space-y-2">{children}</div>}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, mono, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string
}) {
  return (
    <label className="flex items-start gap-2 py-0.5">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-1.5">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary ${mono ? 'font-mono' : ''}`} />
    </label>
  )
}

function ReadRow({ label, value, source }: { label: string; value?: ReactNode; source?: string }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex items-start gap-2 py-1 pl-1">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-px">{label}</span>
      <span className="text-sm text-foreground min-w-0 flex-1 break-words">{value}</span>
      {source && <span className="text-[10px] text-muted-foreground/60 shrink-0 pt-0.5">{source}</span>}
    </div>
  )
}

export function PrinterMasterData({ printerName, master, onSave }: {
  printerName: string
  master?: PrinterMasterData
  onSave: (m: PrinterMasterData) => Promise<void>
}) {
  const seed = useMemo(() => seedForPrinter(printerName), [printerName])

  // Editierbare Felder (lokaler Formzustand)
  const [duplex, setDuplex] = useState('')
  const [color, setColor] = useState('')
  const [paperFormats, setPaperFormats] = useState('')
  const [location, setLocation] = useState('')
  const [ip, setIp] = useState('')
  const [model, setModel] = useState('')
  const [serial, setSerial] = useState('')
  const [assetTag, setAssetTag] = useState('')
  const [printServer, setPrintServer] = useState('')
  const [snmpCommunity, setSnmpCommunity] = useState('')
  const [snmpWriteCommunity, setSnmpWriteCommunity] = useState('')
  const [tonerType, setTonerType] = useState('')
  const [info, setInfo] = useState('')
  const [custom, setCustom] = useState<PrinterCustomField[]>([])
  const [saving, setSaving] = useState(false)
  const [savedTick, setSavedTick] = useState(false)

  // master → Formzustand (bei Wechsel des Druckers/Dossiers)
  useEffect(() => {
    const m = master || {}
    setDuplex(m.duplex ?? ''); setColor(m.color ?? ''); setPaperFormats(m.paperFormats ?? '')
    setLocation(m.location ?? ''); setIp(m.ip ?? ''); setModel(m.model ?? ''); setSerial(m.serial ?? '')
    setAssetTag(m.assetTag ?? ''); setPrintServer(m.printServer ?? ''); setSnmpCommunity(m.snmpCommunity ?? '')
    setSnmpWriteCommunity(m.snmpWriteCommunity ?? ''); setTonerType(m.tonerType ?? ''); setInfo(m.info ?? '')
    setCustom(Array.isArray(m.custom) ? m.custom : [])
  }, [master, printerName])

  function collect(): PrinterMasterData {
    const clean = (s: string) => (s.trim() ? s.trim() : undefined)
    return {
      duplex: clean(duplex), color: clean(color), paperFormats: clean(paperFormats), location: clean(location),
      ip: clean(ip), model: clean(model), serial: clean(serial), assetTag: clean(assetTag),
      printServer: clean(printServer), snmpCommunity: clean(snmpCommunity), snmpWriteCommunity: clean(snmpWriteCommunity),
      tonerType: clean(tonerType), info: clean(info),
      custom: custom.filter(c => c.label.trim() || c.value.trim()),
    }
  }

  async function save() {
    setSaving(true)
    try { await onSave(collect()); setSavedTick(true); setTimeout(() => setSavedTick(false), 1800) }
    finally { setSaving(false) }
  }

  // ── Scan (SNMP + Warteschlange + Erreichbarkeit) ──────────────────────────
  const [scanning, setScanning] = useState(false)
  const [snmp, setSnmp] = useState<SnmpPrinterStatus | null>(null)
  const [reach, setReach] = useState<string>('')
  const [queue, setQueue] = useState<string>('')
  const [scanIp, setScanIp] = useState<string>('')

  async function scan() {
    setScanning(true); setSnmp(null); setReach(''); setQueue('')
    try {
      let effIp = ip.trim()
      if (!effIp) { effIp = await resolvePrinterIp(printerName); if (effIp) setScanIp(effIp) }
      else setScanIp(effIp)
      const tasks: Promise<void>[] = []
      if (effIp) {
        tasks.push(pingPrinter(effIp).then(r => setReach(r.text)))
        tasks.push(snmpPrinterStatus(effIp, snmpCommunity || 'public').then(s => setSnmp(s)))
      } else {
        setReach('Keine IP — in Stammdaten eintragen oder Name ist nicht per DNS auflösbar.')
      }
      tasks.push(queueStatus(printerName, printServer || undefined).then(r => setQueue(r.ok ? r.text : `Fehler: ${r.text}`)))
      await Promise.all(tasks)
    } finally { setScanning(false) }
  }

  function applyScan() {
    if (scanIp && !ip.trim()) setIp(scanIp)
    if (snmp?.sysDescr && !model.trim()) setModel(snmp.sysDescr)
  }

  // ── Inventar + ServiceNow (schreibgeschützt) ──────────────────────────────
  const [inv, setInv] = useState<InventoryItem | null>(null)
  const [sn, setSn] = useState<DeviceServiceNow | null>(null)
  // Abhängig von der GESPEICHERTEN Seriennummer (master?.serial), NICHT vom
  // editierbaren Feld `serial` — sonst würde jeder Tastendruck im Serial-Feld
  // Inventar + ServiceNow neu abfragen.
  useEffect(() => {
    let cancelled = false
    findInventoryItem(printerName).then(r => { if (!cancelled) setInv(r) })
    fetchDeviceServiceNow(printerName, master?.serial || undefined).then(r => { if (!cancelled) setSn(r) }).catch(() => {})
    return () => { cancelled = true }
  }, [printerName, master?.serial])

  return (
    <div className="space-y-3">
      {/* Basis aus dem Wizard-Seed */}
      <Section icon={<Printer size={14} />} title="Basis-Stammdaten" badge={seed ? 'SEAL-Wizard' : 'unbekannt'}>
        {seed ? (
          <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div><span className="text-muted-foreground">Duplex: </span><span className="text-foreground">{seed.duplex}</span></div>
            <div><span className="text-muted-foreground">Farbe: </span><span className="text-foreground">{seed.color}</span></div>
            <div><span className="text-muted-foreground">Papierformat: </span><span className="text-foreground">{seed.paperFormats.join(', ')}</span></div>
            <div><span className="text-muted-foreground">Standort: </span><span className="text-foreground">{seed.location}</span></div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic mb-2">Kein Wizard-Seed für diesen Drucker — Felder frei ausfüllen.</p>
        )}
        <p className="text-[11px] text-muted-foreground mb-1">Überschreibungen (leer = Wizard-Wert gilt):</p>
        <Field label="Duplex" value={duplex} onChange={setDuplex} placeholder={seed?.duplex} />
        <Field label="Farbe" value={color} onChange={setColor} placeholder={seed?.color} />
        <Field label="Papierformat" value={paperFormats} onChange={setPaperFormats} placeholder={seed?.paperFormats.join(', ')} />
        <Field label="Standort" value={location} onChange={setLocation} placeholder={seed?.location} />
      </Section>

      {/* Netzwerk & Verwaltung (frei editierbar) */}
      <Section icon={<Boxes size={14} />} title="Netzwerk & Verwaltung">
        <Field label="IP-Adresse" value={ip} onChange={setIp} placeholder="z. B. 10.20.30.40" mono />
        <Field label="Modell" value={model} onChange={setModel} placeholder="z. B. Kyocera TASKalfa 3253ci" />
        <Field label="Seriennummer" value={serial} onChange={setSerial} mono />
        <Field label="Asset-Tag" value={assetTag} onChange={setAssetTag} mono />
        <Field label="Tonerart / Material" value={tonerType} onChange={setTonerType} placeholder="z. B. TK-8365K / CMYK" />
        <Field label="Druckserver" value={printServer} onChange={setPrintServer} placeholder="w3149 (Standard) · leer = w3149" mono />
        <Field label="SNMP-Community (lesen)" value={snmpCommunity} onChange={setSnmpCommunity} placeholder="public" mono />
        <Field label="SNMP-Community (schreiben)" value={snmpWriteCommunity} onChange={setSnmpWriteCommunity} placeholder="für Geräte-Neustart (meist deaktiviert)" mono />
      </Section>

      {/* Weitere freie Felder */}
      <Section icon={<Plus size={14} />} title="Weitere Felder" defaultOpen={custom.length > 0}>
        {custom.length === 0 && <p className="text-xs text-muted-foreground italic">Noch keine Zusatzfelder.</p>}
        {custom.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2">
            <input value={c.label} onChange={e => setCustom(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
              placeholder="Bezeichnung" className="w-40 shrink-0 px-2 py-1 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            <input value={c.value} onChange={e => setCustom(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
              placeholder="Wert" className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            <button onClick={() => setCustom(prev => prev.filter((_, j) => j !== i))} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 shrink-0"><Trash2 size={13} /></button>
          </div>
        ))}
        <button onClick={() => setCustom(prev => [...prev, { id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: '', value: '' }])}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"><Plus size={12} />Feld hinzufügen</button>
      </Section>

      {/* Freie Notiz */}
      <Section icon={<FileStack size={14} />} title="Freie Info (Stammdaten)" defaultOpen={!!info}>
        <textarea value={info} onChange={e => setInfo(e.target.value)} rows={3} placeholder="Beliebige Notizen zu diesem Drucker…"
          className="w-full px-3 py-2 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary leading-relaxed" />
      </Section>

      {/* Speichern */}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Stammdaten speichern
        </button>
        {savedTick && <span className="text-xs text-green-400">Gespeichert ✓</span>}
      </div>

      {/* Live-Scan */}
      <Section icon={<RefreshCw size={14} />} title="Gerät scannen (SNMP + Warteschlange)">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={scan} disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent/30 disabled:opacity-40">
            {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Jetzt scannen
          </button>
          {(scanIp || snmp?.sysDescr) && (
            <button onClick={applyScan} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
              Erkannte Werte übernehmen
            </button>
          )}
          <span className="text-[11px] text-muted-foreground">liest Modell, Status, Seitenzähler & Toner-Füllstände</span>
        </div>

        {reach && (
          <div className="flex items-center gap-2 text-xs mt-1">
            {reach.startsWith('ONLINE') ? <Wifi size={13} className="text-green-400" /> : <WifiOff size={13} className="text-muted-foreground" />}
            <span className={reach.startsWith('ONLINE') ? 'text-green-300' : 'text-muted-foreground'}>{reach}{scanIp ? ` · ${scanIp}` : ''}</span>
          </div>
        )}

        {snmp && (
          <div className="mt-2 space-y-1.5">
            {snmp.error && <p className="text-xs text-amber-300">SNMP: {snmp.error}</p>}
            {snmp.sysDescr && <ReadRow label="Modell (SNMP)" value={snmp.sysDescr} source="SNMP" />}
            {snmp.printerStatus && <ReadRow label="Gerätestatus" value={snmp.printerStatus} source="SNMP" />}
            {typeof snmp.pageCount === 'number' && <ReadRow label="Seitenzähler" value={snmp.pageCount.toLocaleString('de-DE')} source="SNMP" />}
            {snmp.supplies.length > 0 && (
              <div className="pl-1 pt-1">
                <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1"><Droplet size={11} />Verbrauchsmaterial</p>
                <div className="space-y-1.5">
                  {snmp.supplies.map((s, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-foreground truncate" title={s.name}>{s.name}</span>
                        <span className="text-muted-foreground shrink-0">{s.percent != null ? `${s.percent}%` : (s.level === -3 ? 'OK' : '—')}</span>
                      </div>
                      {s.percent != null && (
                        <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden mt-0.5">
                          <div className={`h-full rounded-full ${s.percent <= 10 ? 'bg-red-500' : s.percent <= 25 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${s.percent}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {queue && (
          <div className="mt-2">
            <p className="text-[11px] text-muted-foreground mb-0.5">Warteschlange</p>
            <pre className="text-[11px] whitespace-pre-wrap text-foreground bg-muted/20 rounded p-2">{queue}</pre>
          </div>
        )}
      </Section>

      {/* Inventar (schreibgeschützt) */}
      {inv && (
        <Section icon={<Boxes size={14} />} title="Standort-Inventar" defaultOpen={false}>
          <ReadRow label="Name" value={inv.name} source="Inventar" />
          {inv.ip && <ReadRow label="IP" value={<span className="font-mono">{inv.ip}</span>} source="Inventar" />}
          {inv.description && <ReadRow label="Standort/Notiz" value={inv.description} source="Inventar" />}
          {inv.assignedTo && <ReadRow label="Zugewiesen an" value={inv.assignedTo} source="Inventar" />}
        </Section>
      )}

      {/* ServiceNow (schreibgeschützt) */}
      {sn?.configured && (
        <Section icon={<Ticket size={14} />} title="ServiceNow" defaultOpen={false}
          badge={sn.tickets.length > 0 ? `${sn.tickets.length} Ticket(s)` : undefined}>
          {sn.ci ? (
            <>
              {sn.ci.model && <ReadRow label="Modell" value={[sn.ci.manufacturer, sn.ci.model].filter(Boolean).join(' ')} source="ServiceNow" />}
              {sn.ci.assetTag && <ReadRow label="Asset-Tag" value={<span className="font-mono">{sn.ci.assetTag}</span>} source="ServiceNow" />}
              {sn.ci.location && <ReadRow label="Standort" value={sn.ci.location} source="ServiceNow" />}
              {sn.ci.ip && <ReadRow label="IP" value={<span className="font-mono">{sn.ci.ip}</span>} source="ServiceNow" />}
              {sn.ci.sysId && sn.instanceUrl && (
                <button onClick={() => api().openExternal(snRecordUrl(sn.instanceUrl!, 'cmdb_ci', sn.ci!.sysId!))}
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline mt-1"><ExternalLink size={11} />CI in ServiceNow öffnen</button>
              )}
            </>
          ) : <p className="text-xs text-muted-foreground italic">Kein CMDB-Eintrag zu diesem Drucker gefunden.</p>}
          {sn.tickets.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border space-y-1">
              {sn.tickets.map(t => (
                <button key={t.sysId} onClick={() => sn.instanceUrl && api().openExternal(snRecordUrl(sn.instanceUrl, t.table, t.sysId))}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-md border border-border bg-background hover:bg-accent/30 text-left">
                  <span className="text-[11px] font-mono text-blue-400 shrink-0">{t.number}</span>
                  <span className="text-xs text-foreground flex-1 min-w-0 truncate" title={t.shortDescription}>{t.shortDescription}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{t.state}</span>
                </button>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
