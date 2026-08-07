import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MonitorSmartphone, Search, RefreshCw, Upload, Loader2, Filter, ListFilter,
  Building2, Cpu, Wallet, Activity, X, FileDown, Users, Mail, Send, CheckCircle2, AlertTriangle, ChevronRight, CheckSquare,
  History, Wifi, WifiOff, Save, FolderOpen, FileText, Trash2, Pencil, ArrowLeft,
  Paperclip, ClipboardCheck, ExternalLink,
} from 'lucide-react'
import { useAuthStore, useIsMasterAdmin } from '../store/authStore'
import { api } from '../electronAPI'
import { openFileForImport, parseExcelSheet } from '../utils/fileImport'
import {
  loadDevices, loadMeta, saveDevices, mapRowsToDevices, classifyModel, modelCost, formatEuro,
  type EndpointDevice,
} from '../services/endpointDevices'
import { exportEndpointDevices, type EndpointExportFormat } from '../services/endpointDevicesExport'
import { scanLastOnline, monthsSince, type LastOnlineRow } from '../services/endpointLastOnline'
import {
  listReports, saveReport, deleteReport, createReportId,
  type EndpointReport, type ReportMode,
} from '../services/endpointReports'
import {
  listFollowups, saveFollowup, emptyFollowup, followupKey,
  pickAndStoreFiles, openFollowupFile, deleteFollowupFile, formatFileSize,
  type PersonFollowup,
} from '../services/endpointFollowup'
import { batchAdLookup, type AdLookupResult } from '../services/adUserLookup'
import { ensureDailyAdUsers, buildNameIndex, lookupUserByName, reverseCommaName } from '../services/adUserDirectory'
import type { AdUserListItem } from '../services/adUsersList'
import { ColumnFilter } from './UserOverview'
import { PersonInfoButton } from '../components/person/PersonDossier'

// Benutzer aus der zentralen Benutzer-Uebersicht in das AD-Lookup-Format bringen.
function userToLookup(name: string, u?: AdUserListItem): AdLookupResult {
  if (!u) return { identity: name, found: false }
  return {
    identity: name,
    found: true,
    displayName: u.displayName,
    email: u.email,
    department: u.department,
    title: u.title,
    reportsCount: u.reportsCount ?? 0,
    sam: u.sam,
  }
}

interface UserGroup {
  name: string                 // assignedTo (roh)
  devices: EndpointDevice[]
  ad?: AdLookupResult
}

// Laptop-Model-Typen (persoenliche Arbeitsgeraete). Mehrere davon bei EINER
// Person = Warnsignal. Mini-/Desktops zaehlen NICHT (die stehen z. B. an
// Maschinen und sind zu Recht mehrfach dem Abteilungsleiter zugewiesen).
const LAPTOP_CATS = new Set(['Laptop Standard', 'Laptop light', 'Laptop Workstation'])
function isLaptop(model: string): boolean { return LAPTOP_CATS.has(classifyModel(model)) }
function laptopCount(g: UserGroup): number { return g.devices.filter(d => isLaptop(d.model)).length }
function isFlagged(g: UserGroup): boolean { return laptopCount(g) >= 2 }
function isLeader(g: UserGroup): boolean { return (g.ad?.reportsCount ?? 0) > 0 }

// Vornamen aus einem Namen ziehen — versteht "Vorname Nachname" UND
// "Nachname, Vorname". In den Mails wird nur mit dem Vornamen angesprochen.
function firstNameOf(name: string): string {
  const n = (name || '').trim()
  if (!n) return ''
  if (n.includes(',')) {
    const after = n.split(',')[1]?.trim()
    if (after) return after.split(/\s+/)[0]
  }
  return n.split(/\s+/)[0]
}

function fmtDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function modeLabel(m: ReportMode): string {
  return m === 'multi' ? 'Mehrfach-Geräte-Nutzer' : m === 'offline' ? 'Zuletzt online' : 'Tabelle'
}

export default function EndpointDevices() {
  const user = useAuthStore(s => s.session?.user)
  const currentUser = user?.displayName || user?.username || 'unbekannt'
  const isMaster = useIsMasterAdmin()

  const [devices, setDevices] = useState<EndpointDevice[]>([])
  const [meta, setMeta] = useState<{ importedAt?: string; importedBy?: string; importedFilename?: string }>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [exporting, setExporting] = useState<EndpointExportFormat | null>(null)

  // Mehrfach-Geräte-Nutzer
  const [multiMode, setMultiMode] = useState(false)
  const [minDevices, setMinDevices] = useState(2)   // Nutzer mit >= N Geraeten
  const [adMap, setAdMap] = useState<Map<string, AdLookupResult>>(new Map())
  const [dirUsers, setDirUsers] = useState<AdUserListItem[] | null>(null)  // zentrale Benutzerliste (null = noch nicht geladen)
  const [lookingUp, setLookingUp] = useState(false)
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set())
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [mailing, setMailing] = useState(false)
  const [mailStatus, setMailStatus] = useState<{ name: string; ok: boolean; msg: string }[]>([])
  const lookedUpRef = useRef<Set<string>>(new Set())
  const [onlyFlagged, setOnlyFlagged] = useState(false)         // nur Personen mit mehreren Laptops
  const [selDeviceIds, setSelDeviceIds] = useState<Set<string>>(new Set())  // fuer die Mail bestätigte Geräte
  const deviceInitRef = useRef<Set<string>>(new Set())          // Personen, deren Laptops schon vorausgewählt wurden
  // Eigenes Mailfenster (Freitext) pro Person
  const [customMail, setCustomMail] = useState<{ to: string; name: string; subject: string; body: string } | null>(null)
  const [customSending, setCustomSending] = useState(false)

  // ── "Zuletzt online" / ungenutzte Geraete ──────────────────────────────────
  const [offlineMode, setOfflineMode] = useState(false)
  const [loMap, setLoMap] = useState<Map<string, LastOnlineRow>>(new Map())
  const [loScanning, setLoScanning] = useState(false)
  const [loProgress, setLoProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [loScannedAt, setLoScannedAt] = useState<string | null>(null)
  const [offlineMonths, setOfflineMonths] = useState(3)          // Schwelle in Monaten (Standard 3)
  const [onlyOffline, setOnlyOffline] = useState(true)           // nur Geraete >= Schwelle offline zeigen
  const [selOffline, setSelOffline] = useState<Set<string>>(new Set())  // Device-IDs fuer die Mail
  const [offMailing, setOffMailing] = useState(false)
  const [offMailStatus, setOffMailStatus] = useState<{ name: string; ok: boolean; msg: string }[]>([])
  // Review-Fenster: Mails vor dem Versand bearbeiten + Versandart waehlen
  const [reviewMails, setReviewMails] = useState<{ name: string; to: string; subject: string; body: string }[] | null>(null)
  const [reviewSending, setReviewSending] = useState<'draft' | 'send' | null>(null)

  // ── Berichte (gespeicherte Ansichten) ──────────────────────────────────────
  const [reports, setReports] = useState<EndpointReport[]>([])
  const [reportsMode, setReportsMode] = useState(false)           // Berichtsliste anzeigen
  const [reportsLoading, setReportsLoading] = useState(false)
  const [openReport, setOpenReport] = useState<EndpointReport | null>(null)  // geoeffneter Bericht (Arbeitsansicht)
  const [reportNote, setReportNote] = useState('')                // Notiz im geoeffneten Bericht
  const [saveDialog, setSaveDialog] = useState<{ name: string } | null>(null)
  const [savingReport, setSavingReport] = useState(false)
  const [renameReport, setRenameReport] = useState<{ id: string; name: string } | null>(null)

  // ── Nachverfolgung je Person (Nachgefragt / Erledigt + Nachweise) ───────────
  const [followups, setFollowups] = useState<Map<string, PersonFollowup>>(new Map())
  const [followupDialog, setFollowupDialog] = useState<PersonFollowup | null>(null)  // Arbeitskopie im Info-Fenster
  const [followupBusy, setFollowupBusy] = useState(false)

  // Spaltenfilter (leeres Set = kein Filter)
  const [fModel, setFModel] = useState<Set<string>>(new Set())
  const [fState, setFState] = useState<Set<string>>(new Set())
  const [fSubstate, setFSubstate] = useState<Set<string>>(new Set())
  const [fCompany, setFCompany] = useState<Set<string>>(new Set())
  const [fOwner, setFOwner] = useState<Set<string>>(new Set())

  async function reload() {
    setLoading(true)
    try {
      const [list, m] = await Promise.all([loadDevices(), loadMeta()])
      setDevices(list); setMeta(m)
    } finally { setLoading(false) }
  }
  async function reloadReports() {
    setReportsLoading(true)
    try { setReports(await listReports()) } finally { setReportsLoading(false) }
  }
  async function reloadFollowups() { try { setFollowups(await listFollowups()) } catch { /* leer */ } }
  useEffect(() => { reload(); reloadReports(); reloadFollowups() }, [])

  // Datenbasis: entweder die Live-Geraete ODER der Schnappschuss des geoeffneten
  // Berichts (dann arbeitet man "im Bericht").
  const baseDevices = openReport ? openReport.devices : devices

  // Distinct-Werte je Filterspalte (Wert -> Anzahl)
  function distinct(sel: (d: EndpointDevice) => string): Map<string, number> {
    const m = new Map<string, number>()
    for (const d of baseDevices) { const v = sel(d); m.set(v, (m.get(v) ?? 0) + 1) }
    return m
  }
  const dModel = useMemo(() => distinct(d => classifyModel(d.model)), [baseDevices])
  const dState = useMemo(() => distinct(d => d.state), [baseDevices])
  const dSubstate = useMemo(() => distinct(d => d.substate), [baseDevices])
  const dCompany = useMemo(() => distinct(d => d.company), [baseDevices])
  const dOwner = useMemo(() => distinct(d => d.assetOwnership), [baseDevices])

  const anyFilter = fModel.size || fState.size || fSubstate.size || fCompany.size || fOwner.size || search.trim()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return baseDevices.filter(d => {
      if (q && !([d.serial, d.hostname, d.assignedTo, d.model, d.comments].some(v => v.toLowerCase().includes(q)))) return false
      if (fModel.size && !fModel.has(classifyModel(d.model))) return false
      if (fState.size && !fState.has(d.state)) return false
      if (fSubstate.size && !fSubstate.has(d.substate)) return false
      if (fCompany.size && !fCompany.has(d.company)) return false
      if (fOwner.size && !fOwner.has(d.assetOwnership)) return false
      return true
    })
  }, [baseDevices, search, fModel, fState, fSubstate, fCompany, fOwner])

  function resetFilters() {
    setSearch(''); setFModel(new Set()); setFState(new Set()); setFSubstate(new Set()); setFCompany(new Set()); setFOwner(new Set())
  }

  // Kostensumme der aktuell gefilterten Auswahl (nur Geräte mit bekanntem Model-Typ)
  const costTotals = useMemo(() => {
    let monthly = 0, known = 0
    for (const d of filtered) { const c = modelCost(d.model); if (c !== null) { monthly += c; known++ } }
    return { monthly, yearly: monthly * 12, known }
  }, [filtered])

  // ── "Zuletzt online": Zeilen der aktuell gefilterten Geraete mit Scan-Ergebnis ─
  const offlineRows = useMemo(() => {
    const rows = filtered
      .filter(d => d.hostname.trim())
      .map(d => {
        const lo = loMap.get(d.hostname.trim().toLowerCase())
        const months = lo && !lo.online ? monthsSince(lo.lastOnline) : null
        return { d, lo, months }
      })
    const shown = onlyOffline
      ? rows.filter(r => r.lo && !r.lo.online && (r.months === null || r.months >= offlineMonths))
      : rows
    return shown.sort((a, b) => {
      const ao = a.lo?.online ? 1 : 0, bo = b.lo?.online ? 1 : 0
      if (ao !== bo) return ao - bo                       // aktuell online nach unten
      const am = a.months, bm = b.months
      if (am === null && bm === null) return a.d.hostname.localeCompare(b.d.hostname, 'de')
      if (am === null) return 1                            // unbekannt nach unten
      if (bm === null) return -1
      return bm - am                                       // laengste Offline-Zeit zuerst
    })
  }, [filtered, loMap, onlyOffline, offlineMonths])

  // Live-Scan auf der aktuell gefilterten Geraeteauswahl
  async function runLastOnlineScan() {
    const queries = filtered
      .filter(d => d.hostname.trim())
      .map(d => ({ hostname: d.hostname.trim(), serial: d.serial.trim() }))
    if (queries.length === 0) return
    setLoScanning(true); setLoProgress({ done: 0, total: queries.length }); setOffMailStatus([])
    try {
      const res = await scanLastOnline(queries, (done, total) => setLoProgress({ done, total }))
      setLoMap(res); setLoScannedAt(new Date().toISOString())
    } finally { setLoScanning(false) }
  }

  function toggleOfflineDevice(id: string) {
    setSelOffline(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // E-Mail-Adressen fuer eine Namensliste aufloesen — erst aus der zentralen
  // Benutzerliste (Benutzer-Uebersicht), dann als Fallback live aus AD.
  async function resolveEmails(names: string[]): Promise<Map<string, AdLookupResult>> {
    const out = new Map<string, AdLookupResult>()
    const missing: string[] = []
    for (const n of names) {
      const cached = adMap.get(n)
      if (cached?.email) { out.set(n, cached); continue }
      const u = lookupUserByName(dirIndex, n)
      if (u?.email) { out.set(n, userToLookup(n, u)); continue }
      missing.push(n)
    }
    if (missing.length) {
      const q = new Set<string>()
      for (const n of missing) { q.add(n); const rev = reverseCommaName(n); if (rev) q.add(rev) }
      const res = await batchAdLookup([...q])
      for (const n of missing) {
        let r = res.get(n)
        const rev = reverseCommaName(n)
        if (rev && (!r || !r.email)) { const r2 = res.get(rev); if (r2 && (r2.email || (r2.found && !r?.found))) r = r2 }
        if (r) out.set(n, r)
      }
    }
    return out
  }

  // Geraetezeile fuer die Offline-Mail (mit "zuletzt online")
  function fmtOfflineDev(d: EndpointDevice, lo?: LastOnlineRow): string {
    const parts = [`PC-Name: ${d.hostname || 'unbekannt'}`, d.model || 'Gerät']
    if (d.serial) parts.push(`SN: ${d.serial}`)
    parts.push(lo?.online ? 'aktuell online' : (lo?.lastOnline ? `zuletzt online: ${fmtDate(lo.lastOnline)}` : 'zuletzt online: unbekannt'))
    return '- ' + parts.join(' · ')
  }

  function buildOfflineMail(displayName: string, items: { d: EndpointDevice; lo?: LastOnlineRow }[]): { subject: string; body: string } {
    const greet = firstNameOf(displayName)
    const one = items.length === 1
    const list = items.map(it => fmtOfflineDev(it.d, it.lo)).join('\n')
    const subject = one
      ? 'IT Marine: Gerät seit längerem nicht online – kurze Rückfrage'
      : `IT Marine: ${items.length} Geräte seit längerem nicht online – kurze Rückfrage`
    const intro = one
      ? 'in unserem System wird folgendes dir zugewiesene Gerät seit längerer Zeit als offline angezeigt:'
      : 'in unserem System werden folgende dir zugewiesene Geräte seit längerer Zeit als offline angezeigt:'
    const body =
`Moin ${greet},

${intro}

${list}

Kurze Rückfrage dazu:

- Nutzt du ${one ? 'dieses Gerät' : 'die Geräte'} ausschließlich im Homeoffice? Dann ${one ? 'ist es' : 'sind sie'} bei uns oft nicht erreichbar und ${one ? 'wird' : 'werden'} fälschlich als offline geführt – kurze Rückmeldung genügt, dann ist alles geklärt.
- Wird ${one ? 'das Gerät' : 'ein Gerät'} nicht mehr benötigt? Dann nehme ich es gerne zurück – melde dich einfach kurz bei mir.
- Gehört ${one ? 'das Gerät' : 'ein Gerät'} inzwischen jemand anderem? Bitte nenne mir kurz den Namen, damit ich es korrekt zuweisen kann.

Vielen Dank und viele Grüße
${currentUser}
IT Support Marine`
    return { subject, body }
  }

  // Mails vorbereiten (eine pro Person, mehrere Offline-Geraete gebuendelt) und
  // im Review-Fenster zur Bearbeitung/Versandwahl oeffnen — NICHT sofort senden.
  async function prepareOfflineMails() {
    const chosen = offlineRows.filter(r => selOffline.has(r.d.id))
    if (chosen.length === 0) return
    const byUser = new Map<string, { d: EndpointDevice; lo?: LastOnlineRow }[]>()
    for (const r of chosen) {
      const nm = r.d.assignedTo.trim()
      if (!nm) continue
      if (!byUser.has(nm)) byUser.set(nm, [])
      byUser.get(nm)!.push({ d: r.d, lo: r.lo })
    }
    if (byUser.size === 0) return
    setOffMailing(true); setOffMailStatus([])
    try {
      const emails = await resolveEmails([...byUser.keys()])
      const mails: { name: string; to: string; subject: string; body: string }[] = []
      for (const [name, items] of byUser) {
        const ad = emails.get(name)
        const { subject, body } = buildOfflineMail(ad?.displayName || name, items)
        mails.push({ name: ad?.displayName || name, to: ad?.email?.trim() || '', subject, body })
      }
      setReviewMails(mails)
    } finally { setOffMailing(false) }
  }

  // Versand aus dem Review-Fenster: entweder direkt aus dem Tool (Outlook-Versand)
  // oder als Outlook-Entwurf zum selbst Verschicken.
  async function runReview(mode: 'draft' | 'send') {
    if (!reviewMails) return
    setReviewSending(mode)
    const results: { name: string; ok: boolean; msg: string }[] = []
    for (const m of reviewMails) {
      const to = m.to.trim()
      if (!to) { results.push({ name: m.name, ok: false, msg: 'Keine E-Mail angegeben' }); setOffMailStatus([...results]); continue }
      try {
        if (mode === 'draft') {
          await api().composeEmail({ to, cc: '', subject: m.subject, body: m.body })
          results.push({ name: m.name, ok: true, msg: `Outlook-Fenster geöffnet (${to})` })
        } else {
          const r = await api().sendEmailRaw({ to, subject: m.subject, body: m.body, smtp: '', port: 0, method: 'outlook' })
          results.push({ name: m.name, ok: !!r.success, msg: r.success ? `gesendet an ${to}` : (r.error || 'Versand fehlgeschlagen') })
        }
      } catch (e) {
        results.push({ name: m.name, ok: false, msg: e instanceof Error ? e.message : String(e) })
      }
      setOffMailStatus([...results])
    }
    setReviewSending(null)
    setReviewMails(null)
  }

  // ── Mehrfach-Geräte-Nutzer: nach "Zugewiesen an" gruppieren (aus der aktuell
  //    gefilterten Liste, damit man vorher/nachher filtern kann) ───────────────
  const userGroups = useMemo<UserGroup[]>(() => {
    const byUser = new Map<string, EndpointDevice[]>()
    for (const d of filtered) {
      const name = d.assignedTo.trim()
      if (!name) continue
      if (!byUser.has(name)) byUser.set(name, [])
      byUser.get(name)!.push(d)
    }
    let groups: UserGroup[] = [...byUser.entries()]
      .filter(([, devs]) => devs.length >= minDevices)
      .map(([name, devs]) => ({ name, devices: devs, ad: adMap.get(name) }))
    if (onlyFlagged) groups = groups.filter(isFlagged)
    // Markierte (mehrere Laptops) zuerst, dann nach Laptop-Anzahl, dann Gesamtzahl
    return groups.sort((a, b) =>
      (Number(isFlagged(b)) - Number(isFlagged(a)))
      || (laptopCount(b) - laptopCount(a))
      || (b.devices.length - a.devices.length)
      || a.name.localeCompare(b.name, 'de'))
  }, [filtered, minDevices, adMap, onlyFlagged])

  // Zentrale Benutzerliste (aus der Benutzer-Uebersicht) einmalig laden. Daraus
  // ziehen wir die E-Mail-Adressen — dieselbe Quelle wie die Benutzer-Uebersicht,
  // damit fuer alle immer derselbe Stand gilt.
  useEffect(() => {
    let c = false
    ensureDailyAdUsers().then(r => { if (!c) setDirUsers(r.dir?.users ?? []) }).catch(() => { if (!c) setDirUsers([]) })
    return () => { c = true }
  }, [])
  const dirReady = dirUsers !== null
  const dirIndex = useMemo(() => buildNameIndex(dirUsers ?? []), [dirUsers])

  // AD-Daten (E-Mail/Abteilung/Abteilungsleiter) fuer die angezeigten Nutzer
  // aufloesen. Zuerst aus der zentralen Benutzerliste (schnell, zuverlaessig);
  // nur Namen, die dort NICHT gefunden werden (z. B. Personen anderer Gesell-
  // schaften), werden zusaetzlich live in AD nachgeschlagen. Der Name aus der
  // Excel ("Zugewiesen an") kann als "Nachname, Vorname" vorliegen — die
  // Umkehrung wird jeweils mitgeprueft.
  useEffect(() => {
    if (!multiMode || !dirReady) return
    const names = userGroups.map(g => g.name).filter(n => !lookedUpRef.current.has(n))
    if (names.length === 0) return
    let cancelled = false
    ;(async () => {
      setLookingUp(true)
      try {
        const resolved = new Map<string, AdLookupResult>()
        const missing: string[] = []
        for (const n of names) {
          const u = lookupUserByName(dirIndex, n)
          if (u && (u.email || u.reportsCount !== undefined)) resolved.set(n, userToLookup(n, u))
          else missing.push(n)
        }
        // Directory-Treffer sofort uebernehmen
        if (resolved.size > 0 && !cancelled) {
          setAdMap(prev => {
            const next = new Map(prev)
            for (const [n, r] of resolved) { next.set(n, r); lookedUpRef.current.add(n) }
            return next
          })
        }
        // Rest live in AD nachschlagen (Fallback)
        if (missing.length > 0) {
          const queries = new Set<string>()
          for (const n of missing) { queries.add(n); const rev = reverseCommaName(n); if (rev) queries.add(rev) }
          const res = await batchAdLookup([...queries])
          if (cancelled) return
          setAdMap(prev => {
            const next = new Map(prev)
            for (const n of missing) {
              lookedUpRef.current.add(n)
              let r = res.get(n)
              const rev = reverseCommaName(n)
              if (rev && (!r || !r.email)) { const r2 = res.get(rev); if (r2 && (r2.email || (r2.found && !r?.found))) r = r2 }
              if (r) next.set(n, r)
            }
            return next
          })
        }
      } finally { if (!cancelled) setLookingUp(false) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiMode, dirReady, userGroups.map(g => g.name).join('|')])

  function toggleUser(name: string) {
    setSelUsers(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }
  function toggleDevice(id: string) {
    setSelDeviceIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // Bei markierten Personen (>=2 Laptops) die Laptop-Geräte einmalig für die
  // Mail vorauswählen (danach frei an-/abwählbar).
  useEffect(() => {
    if (!multiMode) return
    setSelDeviceIds(prev => {
      let changed = false
      const next = new Set(prev)
      for (const g of userGroups) {
        if (!isFlagged(g) || deviceInitRef.current.has(g.name)) continue
        deviceInitRef.current.add(g.name)
        for (const d of g.devices) if (isLaptop(d.model) && !next.has(d.id)) { next.add(d.id); changed = true }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiMode, userGroups.map(g => g.name).join('|')])

  function fmtDev(d: EndpointDevice): string {
    const cat = classifyModel(d.model)
    // PC-Name zuerst — dieser steht als Label vorne auf dem Gerät.
    return '- ' + [
      `PC-Name: ${d.hostname || 'unbekannt'}`,
      d.model || 'Gerät',
      d.serial && `SN: ${d.serial}`,
      cat && `Typ: ${cat}`,
    ].filter(Boolean).join(' · ')
  }

  function buildMail(g: UserGroup): { subject: string; body: string } {
    const greetName = firstNameOf(g.ad?.displayName || g.name)

    // Markierte Person (mehrere Laptops): gezielt nach den bestätigten Geräten
    // fragen — nutzt du die? wenn nicht, wem gehören sie (Name zur Neuzuweisung)?
    if (isFlagged(g)) {
      const chosen = g.devices.filter(d => selDeviceIds.has(d.id))
      const devs = chosen.length ? chosen : g.devices.filter(d => isLaptop(d.model))
      const list = devs.map(fmtDev).join('\n')
      const subject = 'IT Marine: Mehrere Arbeitslaptops auf dich zugewiesen'
      const body =
`Moin ${greetName},

in unserem System sind dir aktuell mehrere Arbeitslaptops zugewiesen:

${list}

Kurze Rückfrage: Nutzt du diese Geräte wirklich alle selbst?

- Ja: Bitte gib mir kurz den Grund an, warum du die Geräte benötigst (z. B. besondere Aufgabe/Rolle) – dann ist für mich alles geklärt.
- Nein / ein Gerät gehört jemand anderem: Bitte nenne mir kurz den Namen der Person, der das jeweilige Gerät gehört, damit ich es korrekt zuweisen kann. Nicht mehr benötigte Geräte nehme ich gerne zurück.

Vielen Dank und viele Grüße
${currentUser}
IT Support Marine`
      return { subject, body }
    }

    // Generisch: viele Geräte insgesamt
    const n = g.devices.length
    const list = g.devices.map(fmtDev).join('\n')
    const subject = `IT Marine: Mehrere Endgeräte auf dich zugewiesen (${n})`
    const body =
`Moin ${greetName},

im System sind dir aktuell ${n} Endgeräte zugewiesen:

${list}

Benötigst du wirklich alle ${n} Geräte für deine Arbeit, oder kann eines davon abgegeben werden? Falls ein Gerät nicht mehr gebraucht wird, melde dich bitte kurz bei mir – ich kümmere mich dann um die Rücknahme.

Vielen Dank und viele Grüße
${currentUser}
IT Support Marine`
    return { subject, body }
  }

  // Eigenes Mailfenster oeffnen (mit dem passenden Template vorbefuellt)
  function openCustomMail(g: UserGroup) {
    const { subject, body } = buildMail(g)
    setCustomMail({ to: g.ad?.email?.trim() || '', name: g.ad?.displayName || g.name, subject, body })
  }
  // Freitext-Mail: als Outlook-Entwurf oeffnen ODER direkt senden
  async function sendCustomMail(mode: 'draft' | 'send') {
    if (!customMail) return
    const to = customMail.to.trim()
    setCustomSending(true)
    try {
      if (mode === 'draft') {
        await api().composeEmail({ to, cc: '', subject: customMail.subject, body: customMail.body })
      } else {
        await api().sendEmailRaw({ to, subject: customMail.subject, body: customMail.body, smtp: '', port: 0, method: 'outlook' })
      }
      setCustomMail(null)
    } finally { setCustomSending(false) }
  }

  async function sendMails() {
    const targets = userGroups.filter(g => selUsers.has(g.name))
    if (targets.length === 0) return
    setMailing(true)
    const results: { name: string; ok: boolean; msg: string }[] = []
    for (const g of targets) {
      const to = g.ad?.email?.trim()
      if (!to) { results.push({ name: g.name, ok: false, msg: 'Keine E-Mail in AD gefunden' }); setMailStatus([...results]); continue }
      const { subject, body } = buildMail(g)
      try {
        const r = await api().sendEmailRaw({ to, subject, body, smtp: '', port: 0, method: 'outlook' })
        results.push({ name: g.name, ok: !!r.success, msg: r.success ? `gesendet an ${to}` : (r.error || 'Versand fehlgeschlagen') })
      } catch (e) {
        results.push({ name: g.name, ok: false, msg: e instanceof Error ? e.message : String(e) })
      }
      setMailStatus([...results])
    }
    setMailing(false)
  }

  async function handleExport(format: EndpointExportFormat) {
    setExporting(format)
    try {
      // Immer die AKTUELL sichtbare Ansicht exportieren. Im "Zuletzt online"-Modus
      // sind das die angezeigten Offline-Zeilen inkl. der Zuletzt-online-Daten.
      const devicesToExport = offlineMode ? offlineRows.map(r => r.d) : filtered
      const res = await exportEndpointDevices(devicesToExport, format, {
        title: openReport ? `Endgeräte-Übersicht – ${openReport.name}` : undefined,
        lastOnline: offlineMode ? loMapToObject() : undefined,
      })
      if (!res.ok && !res.cancelled) setImportStatus(res.error || 'Export fehlgeschlagen.')
    } finally { setExporting(null) }
  }

  async function handleImport() {
    setImporting(true); setImportStatus('')
    try {
      const file = await openFileForImport()
      if (!file) { setImporting(false); return }
      if (!['xlsx', 'xls', 'csv'].includes(file.ext)) { setImportStatus('Bitte eine Excel-/CSV-Datei wählen.'); setImporting(false); return }
      const sheet = parseExcelSheet(file.bytes)
      const mapped = mapRowsToDevices(sheet.rows)
      if (mapped.length === 0) {
        setImportStatus('Keine Geräte erkannt. Prüfe die Spaltenüberschriften (Seriennummer, Hostname, Model Type …).')
        setImporting(false); return
      }
      if (devices.length > 0 && !window.confirm(`Die Übersicht enthält bereits ${devices.length} Geräte. Beim Import wird die komplette Liste durch den Excel-Inhalt (${mapped.length} Geräte) ERSETZT. Fortfahren?`)) {
        setImporting(false); return
      }
      const filename = file.filePath.split(/[\\/]/).pop() || 'Import.xlsx'
      const ok = await saveDevices(mapped, { importedBy: currentUser, importedFilename: filename })
      if (!ok) { setImportStatus('Speichern auf dem Netzlaufwerk fehlgeschlagen.'); setImporting(false); return }
      setImportStatus(`${mapped.length} Geräte importiert.`)
      await reload()
    } catch (e) {
      setImportStatus('Fehler beim Import: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setImporting(false) }
  }

  // ── Berichte: aktueller Modus + Snapshot-Aufbau ────────────────────────────
  function currentMode(): ReportMode {
    return offlineMode ? 'offline' : multiMode ? 'multi' : 'table'
  }
  function loMapToObject(): Record<string, LastOnlineRow> {
    const o: Record<string, LastOnlineRow> = {}
    for (const [k, v] of loMap) o[k] = v
    return o
  }

  async function doSaveNewReport() {
    if (!saveDialog) return
    const name = saveDialog.name.trim()
    if (!name) return
    setSavingReport(true)
    try {
      const mode = currentMode()
      const r: EndpointReport = {
        id: createReportId(),
        name,
        createdAt: new Date().toISOString(),
        createdBy: currentUser,
        mode,
        devices: filtered.map(d => ({ ...d })),   // aktueller (gefilterter) Ausschnitt
        note: reportNote || undefined,
        minDevices: mode === 'multi' ? minDevices : undefined,
        onlyFlagged: mode === 'multi' ? onlyFlagged : undefined,
        offlineMonths: mode === 'offline' ? offlineMonths : undefined,
        onlyOffline: mode === 'offline' ? onlyOffline : undefined,
        lastOnline: mode === 'offline' ? loMapToObject() : undefined,
        scannedAt: mode === 'offline' ? (loScannedAt ?? undefined) : undefined,
      }
      const ok = await saveReport(r)
      if (ok) { setSaveDialog(null); await reloadReports(); setImportStatus(`Bericht „${name}" gespeichert (${r.devices.length} Geräte).`) }
      else setImportStatus('Bericht konnte nicht gespeichert werden.')
    } finally { setSavingReport(false) }
  }

  async function saveOpenReportChanges() {
    if (!openReport) return
    setSavingReport(true)
    try {
      const mode = currentMode()
      const lo = loMapToObject()
      const updated: EndpointReport = {
        ...openReport,
        mode,
        note: reportNote || undefined,
        minDevices: mode === 'multi' ? minDevices : openReport.minDevices,
        onlyFlagged: mode === 'multi' ? onlyFlagged : openReport.onlyFlagged,
        offlineMonths: mode === 'offline' ? offlineMonths : openReport.offlineMonths,
        onlyOffline: mode === 'offline' ? onlyOffline : openReport.onlyOffline,
        lastOnline: Object.keys(lo).length ? lo : openReport.lastOnline,
        scannedAt: loScannedAt ?? openReport.scannedAt,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser,
      }
      const ok = await saveReport(updated)
      if (ok) { setOpenReport(updated); await reloadReports(); setImportStatus('Änderungen am Bericht gespeichert.') }
      else setImportStatus('Bericht konnte nicht gespeichert werden.')
    } finally { setSavingReport(false) }
  }

  function openReportView(r: EndpointReport) {
    setOpenReport(r)
    setReportsMode(false)
    setReportNote(r.note ?? '')
    setMultiMode(r.mode === 'multi')
    setOfflineMode(r.mode === 'offline')
    setMinDevices(r.minDevices ?? 2)
    setOnlyFlagged(!!r.onlyFlagged)
    setOfflineMonths(r.offlineMonths ?? 3)
    setOnlyOffline(r.onlyOffline ?? true)
    setLoMap(r.lastOnline ? new Map(Object.entries(r.lastOnline)) : new Map())
    setLoScannedAt(r.scannedAt ?? null)
    resetFilters()
    setSelUsers(new Set()); setSelDeviceIds(new Set()); setSelOffline(new Set())
    lookedUpRef.current = new Set(); deviceInitRef.current = new Set()
    setMailStatus([]); setOffMailStatus([])
  }

  function closeReport() {
    setOpenReport(null)
    setReportNote('')
    setLoMap(new Map()); setLoScannedAt(null)
    setMultiMode(false); setOfflineMode(false)
    resetFilters()
    setSelUsers(new Set()); setSelDeviceIds(new Set()); setSelOffline(new Set())
    lookedUpRef.current = new Set(); deviceInitRef.current = new Set()
  }

  async function doDeleteReport(id: string, name: string) {
    if (!window.confirm(`Bericht „${name}" wirklich löschen?`)) return
    await deleteReport(id)
    if (openReport?.id === id) closeReport()
    await reloadReports()
  }

  async function doRename() {
    if (!renameReport) return
    const name = renameReport.name.trim()
    if (!name) { setRenameReport(null); return }
    const rep = reports.find(r => r.id === renameReport.id)
    if (rep) {
      const updated: EndpointReport = { ...rep, name, updatedAt: new Date().toISOString(), updatedBy: currentUser }
      await saveReport(updated)
      if (openReport?.id === rep.id) setOpenReport(updated)
      await reloadReports()
    }
    setRenameReport(null)
  }

  // ── Nachverfolgung: Nachgefragt / Erledigt + Info-Fenster ──────────────────
  function getFollowup(name: string): PersonFollowup {
    return followups.get(followupKey(name)) ?? emptyFollowup(name)
  }
  async function persistFollowup(fu: PersonFollowup) {
    const saved: PersonFollowup = { ...fu, personName: fu.personName, updatedBy: currentUser, updatedAt: new Date().toISOString() }
    await saveFollowup(saved)
    setFollowups(prev => { const n = new Map(prev); n.set(saved.key, saved); return n })
    return saved
  }
  async function toggleNachgefragt(name: string) {
    const fu = getFollowup(name)
    const nv = !fu.nachgefragt
    await persistFollowup({ ...fu, nachgefragt: nv, nachgefragtAt: nv ? new Date().toISOString() : fu.nachgefragtAt, nachgefragtBy: nv ? currentUser : fu.nachgefragtBy })
  }
  async function toggleErledigt(name: string) {
    const fu = getFollowup(name)
    const nv = !fu.erledigt
    const saved = await persistFollowup({ ...fu, erledigt: nv, erledigtAt: nv ? new Date().toISOString() : fu.erledigtAt, erledigtBy: nv ? currentUser : fu.erledigtBy })
    if (nv) setFollowupDialog(saved)   // beim Erledigt-Setzen das Info-Fenster oeffnen
  }
  function openFollowupDialog(name: string) { setFollowupDialog(getFollowup(name)) }

  async function addFollowupFiles() {
    if (!followupDialog) return
    setFollowupBusy(true)
    try {
      const added = await pickAndStoreFiles(followupDialog.key, currentUser)
      if (added.length) {
        setFollowupDialog(d => d ? { ...d, files: [...d.files, ...added] } : d)
        await persistFollowup({ ...followupDialog, files: [...followupDialog.files, ...added] })
      }
    } finally { setFollowupBusy(false) }
  }
  async function removeFollowupFile(fileId: string) {
    if (!followupDialog) return
    const file = followupDialog.files.find(f => f.id === fileId)
    if (file) await deleteFollowupFile(file.path)
    const files = followupDialog.files.filter(f => f.id !== fileId)
    setFollowupDialog(d => d ? { ...d, files } : d)
    await persistFollowup({ ...followupDialog, files })
  }
  async function saveFollowupDialog() {
    if (!followupDialog) return
    setFollowupBusy(true)
    try { await persistFollowup(followupDialog); setFollowupDialog(null) }
    finally { setFollowupBusy(false) }
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <MonitorSmartphone size={22} className="text-primary" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Endgeräte-Übersicht</h1>
          <p className="text-xs text-muted-foreground">
            Alle Endarbeitsgeräte (PCs & Laptops) am Standort
            {meta.importedAt && <span> · zuletzt importiert {fmtDateTime(meta.importedAt)}{meta.importedBy ? ` von ${meta.importedBy}` : ''}</span>}
          </p>
        </div>
        <button onClick={reload} title="Aktualisieren" className="p-2 rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
        {/* Berichte exportieren (aktuelle, gefilterte Ansicht) */}
        <div className="flex items-center gap-1">
          <button onClick={() => handleExport('pdf')} disabled={exporting !== null || baseDevices.length === 0} title="Als PDF exportieren"
            className="flex items-center gap-1 px-2.5 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
            {exporting === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} className="text-red-400" />}PDF
          </button>
          <button onClick={() => handleExport('word')} disabled={exporting !== null || baseDevices.length === 0} title="Als Word exportieren"
            className="flex items-center gap-1 px-2.5 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
            {exporting === 'word' ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} className="text-blue-400" />}Word
          </button>
          <button onClick={() => handleExport('excel')} disabled={exporting !== null || baseDevices.length === 0} title="Als Excel exportieren"
            className="flex items-center gap-1 px-2.5 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
            {exporting === 'excel' ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} className="text-emerald-400" />}Excel
          </button>
        </div>
        {isMaster && (
          <button onClick={handleImport} disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Excel importieren
          </button>
        )}
      </div>

      {importStatus && (
        <div className="shrink-0 px-6 py-2 border-b border-border text-xs text-muted-foreground bg-card/50 flex items-center gap-2">
          <span>{importStatus}</span>
          <button onClick={() => setImportStatus('')} className="ml-auto text-muted-foreground hover:text-foreground"><X size={13} /></button>
        </div>
      )}

      {/* Bericht geöffnet: Arbeitsleiste (Notiz + Speichern + zurück) */}
      {openReport && !reportsMode && (
        <div className="shrink-0 px-6 py-2 border-b border-border bg-primary/5 flex items-center gap-3 flex-wrap">
          <button onClick={closeReport} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
            <ArrowLeft size={12} />Zur Live-Ansicht
          </button>
          <FileText size={15} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{openReport.name}</p>
            <p className="text-[10px] text-muted-foreground">
              Bericht · {openReport.devices.length} Geräte · erstellt {fmtDateTime(openReport.createdAt)}{openReport.createdBy ? ` von ${openReport.createdBy}` : ''}
              {openReport.updatedAt && ` · geändert ${fmtDateTime(openReport.updatedAt)}`}
            </p>
          </div>
          <input value={reportNote} onChange={e => setReportNote(e.target.value)} placeholder="Notiz zum Bericht…"
            className="flex-1 min-w-[160px] px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
          <button onClick={saveOpenReportChanges} disabled={savingReport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40">
            {savingReport ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Änderungen speichern
          </button>
        </div>
      )}

      {/* Filterleiste */}
      <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-muted/5">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Seriennummer, PC-Name, Benutzer…"
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        </div>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mx-1">
          <Filter size={11} />Filter
        </span>
        <ColumnFilter label="Model Type" icon={<Cpu size={11} />}     values={dModel}    selected={fModel}    onChange={setFModel} />
        <ColumnFilter label="Status"     icon={<Activity size={11} />} values={dState}    selected={fState}    onChange={setFState} />
        <ColumnFilter label="Verwendung" icon={<ListFilter size={11} />} values={dSubstate} selected={fSubstate} onChange={setFSubstate} />
        <ColumnFilter label="Unternehmen" icon={<Building2 size={11} />} values={dCompany}  selected={fCompany}  onChange={setFCompany} />
        <ColumnFilter label="Wer bezahlt?" icon={<Wallet size={11} />}  values={dOwner}    selected={fOwner}    onChange={setFOwner} />
        {anyFilter ? (
          <button onClick={resetFilters} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
            <X size={11} />Filter zurücksetzen
          </button>
        ) : null}
        {/* Mehrfach-Geräte-Nutzer umschalten */}
        <button onClick={() => { setMultiMode(v => !v); setOfflineMode(false); setMailStatus([]) }}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border transition-colors ${multiMode ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
          <Users size={12} />Mehrfach-Geräte-Nutzer
        </button>
        {/* Zuletzt online / ungenutzte Geräte umschalten */}
        <button onClick={() => { setOfflineMode(v => !v); setMultiMode(false); setOffMailStatus([]) }}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border transition-colors ${offlineMode ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
          <History size={12} />Zuletzt online
        </button>
        {/* Aktuelle Ansicht als Bericht speichern */}
        <button onClick={() => setSaveDialog({ name: '' })} disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed">
          <Save size={12} />Bericht speichern
        </button>
        {/* Gespeicherte Berichte anzeigen */}
        <button onClick={() => setReportsMode(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border transition-colors ${reportsMode ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
          <FolderOpen size={12} />Berichte{reports.length > 0 && <span className="text-[10px] px-1 rounded-full bg-primary/20 text-primary">{reports.length}</span>}
        </button>
        {multiMode && (
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            ab
            <select value={minDevices} onChange={e => setMinDevices(Number(e.target.value))}
              className="px-1.5 py-1 rounded-md border border-border bg-background text-foreground focus:outline-none">
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
            Geräten
          </label>
        )}
        {multiMode && (
          <label className="flex items-center gap-1.5 text-[11px] text-amber-300 cursor-pointer">
            <input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} className="accent-amber-500" />
            nur mit mehreren Laptops
          </label>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-muted-foreground" title={`Summe der monatlichen Kosten über ${costTotals.known} Gerät(e) mit bekanntem Model-Typ (aktuelle Auswahl)`}>
            <span className="text-foreground font-semibold">{formatEuro(costTotals.monthly)}</span>/Monat
            <span className="mx-1 opacity-50">·</span>
            <span className="text-foreground font-semibold">{formatEuro(costTotals.yearly)}</span>/Jahr
          </span>
          <span className="text-muted-foreground border-l border-border pl-3">
            {multiMode ? `${userGroups.length} Nutzer` : offlineMode ? `${offlineRows.length} Geräte` : `${filtered.length} von ${devices.length}`}
          </span>
        </div>
      </div>

      {/* Tabelle */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={14} className="animate-spin" />Lade Geräte…
        </div>
      ) : reportsMode ? (
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Gespeicherte Berichte</h3>
            {reportsLoading && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
            <button onClick={reloadReports} title="Aktualisieren" className="ml-auto p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"><RefreshCw size={13} /></button>
          </div>
          {reports.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <FileText size={36} className="mx-auto mb-2 opacity-30" />
              Noch keine Berichte. Filtere/wähle eine Ansicht (Tabelle, Mehrfach-Geräte-Nutzer oder Zuletzt online) und klicke oben auf „Bericht speichern".
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/10">
                  <FileText size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {modeLabel(r.mode)} · {r.devices.length} Geräte · {fmtDateTime(r.createdAt)}{r.createdBy ? ` · ${r.createdBy}` : ''}
                      {r.note && <span className="text-muted-foreground/80"> · {r.note}</span>}
                    </p>
                  </div>
                  <button onClick={() => openReportView(r)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"><FolderOpen size={12} />Öffnen</button>
                  <button onClick={() => setRenameReport({ id: r.id, name: r.name })} title="Umbenennen" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"><Pencil size={13} /></button>
                  <button onClick={() => doDeleteReport(r.id, r.name)} title="Löschen" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-red-300 hover:bg-red-500/10"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : baseDevices.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center px-6">
          <div>
            <MonitorSmartphone size={40} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-foreground">Noch keine Geräte importiert</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isMaster ? 'Klick oben rechts auf „Excel importieren", um die Geräteliste einzuspielen.' : 'Ein Master-Admin muss die Geräteliste zunächst importieren.'}
            </p>
          </div>
        </div>
      ) : offlineMode ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Aktionsleiste */}
          <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-2 flex-wrap">
            <button onClick={runLastOnlineScan} disabled={loScanning || filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
              {loScanning ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
              {loScanning ? `Prüfe… ${loProgress.done}/${loProgress.total}` : `Zuletzt-online prüfen (${filtered.length})`}
            </button>
            {loScannedAt && !loScanning && <span className="text-[11px] text-muted-foreground">Stand: {fmtDateTime(loScannedAt)}</span>}
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground ml-1">
              ab
              <select value={offlineMonths} onChange={e => setOfflineMonths(Number(e.target.value))}
                className="px-1.5 py-1 rounded-md border border-border bg-background text-foreground focus:outline-none">
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
                <option value={6}>6</option>
              </select>
              Monaten offline
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={onlyOffline} onChange={e => setOnlyOffline(e.target.checked)} className="accent-primary" />
              nur ungenutzte zeigen
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setSelOffline(new Set(offlineRows.map(r => r.d.id)))} className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">Alle auswählen</button>
              <button onClick={() => setSelOffline(new Set())} className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">Keine</button>
              <button onClick={prepareOfflineMails} disabled={selOffline.size === 0 || offMailing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed">
                {offMailing ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}Zugewiesene anschreiben ({selOffline.size})
              </button>
            </div>
          </div>

          {/* Hinweis / Versand-Ergebnis */}
          <div className="shrink-0 px-6 py-1.5 border-b border-border text-[11px] text-muted-foreground bg-muted/5">
            „Zuletzt online" wird aus Live-Ping (aktuell erreichbar) und dem AD-Anmeldezeitpunkt (forestweite Suche über alle Domänen, per Seriennummer & PC-Name) ermittelt. Der Scan läuft auf die aktuell gefilterte Auswahl ({filtered.length} Geräte).
          </div>
          {offMailStatus.length > 0 && (
            <div className="shrink-0 px-6 py-2 border-b border-border bg-card/50 max-h-28 overflow-y-auto">
              {offMailStatus.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {r.ok ? <CheckCircle2 size={12} className="text-green-400 shrink-0" /> : <AlertTriangle size={12} className="text-amber-400 shrink-0" />}
                  <span className="text-foreground">{r.name}</span>
                  <span className={r.ok ? 'text-muted-foreground' : 'text-amber-300'}>— {r.msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tabelle */}
          <div className="flex-1 overflow-auto">
            {offlineRows.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">
                <History size={36} className="mx-auto mb-2 opacity-30" />
                {loMap.size === 0
                  ? 'Klick auf „Zuletzt-online prüfen", um die aktuelle Auswahl zu scannen.'
                  : onlyOffline
                    ? `Keine Geräte, die seit ${offlineMonths}+ Monaten offline sind (in der aktuellen Auswahl).`
                    : 'Keine Geräte in der aktuellen Auswahl.'}
              </div>
            ) : (
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="sticky top-0 bg-background border-b border-border z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 w-8"><CheckSquare size={11} /></th>
                    <th className="px-3 py-2">PC-Name</th>
                    <th className="px-3 py-2">Zugewiesen an</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Zuletzt online</th>
                    <th className="px-3 py-2">Offline seit</th>
                  </tr>
                </thead>
                <tbody>
                  {offlineRows.map(({ d, lo, months }) => {
                    const sel = selOffline.has(d.id)
                    return (
                      <tr key={d.id} className={`border-b border-border/40 hover:bg-accent/10 ${sel ? 'bg-primary/5' : ''}`}>
                        <td className="px-3 py-2"><input type="checkbox" checked={sel} onChange={() => toggleOfflineDevice(d.id)} className="accent-primary" /></td>
                        <td className="px-3 py-2 font-mono text-foreground">{d.hostname || '—'}</td>
                        <td className="px-3 py-2 text-foreground">{d.assignedTo || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[16rem] truncate" title={d.model || undefined}>{d.model || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.state || '—'}</td>
                        <td className="px-3 py-2">
                          {!lo ? <span className="text-muted-foreground/50 italic">noch nicht geprüft</span>
                            : lo.online ? <span className="inline-flex items-center gap-1 text-emerald-300"><Wifi size={11} />aktuell online</span>
                            : lo.lastOnline ? <span className="inline-flex items-center gap-1 text-foreground"><WifiOff size={11} className="text-muted-foreground" />{fmtDate(lo.lastOnline)}</span>
                            : <span className="text-amber-300">{lo.inAd ? 'kein Anmeldedatum' : 'nicht in AD'}</span>}
                        </td>
                        <td className="px-3 py-2">
                          {months === null
                            ? <span className="text-muted-foreground/50">—</span>
                            : <span className={months >= offlineMonths ? 'text-amber-300 font-semibold' : 'text-muted-foreground'}>{Math.floor(months)} Mon.</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : multiMode ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Aktionsleiste */}
          <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">Nutzer mit mindestens {minDevices} zugewiesenen Geräten — auswählen und direkt anschreiben.</p>
            {lookingUp && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 size={11} className="animate-spin" />AD-Daten laden…</span>}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setSelUsers(new Set(userGroups.filter(g => g.ad?.email).map(g => g.name)))} className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">Alle mit E-Mail</button>
              <button onClick={() => setSelUsers(new Set())} className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">Keine</button>
              <button onClick={sendMails} disabled={selUsers.size === 0 || mailing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed">
                {mailing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Ausgewählte anschreiben ({selUsers.size})
              </button>
            </div>
          </div>

          {/* Versand-Ergebnis */}
          {mailStatus.length > 0 && (
            <div className="shrink-0 px-6 py-2 border-b border-border bg-card/50 max-h-28 overflow-y-auto">
              {mailStatus.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {r.ok ? <CheckCircle2 size={12} className="text-green-400 shrink-0" /> : <AlertTriangle size={12} className="text-amber-400 shrink-0" />}
                  <span className="text-foreground">{r.name}</span>
                  <span className={r.ok ? 'text-muted-foreground' : 'text-amber-300'}>— {r.msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Nutzerliste */}
          <div className="flex-1 overflow-auto px-6 py-3 space-y-2">
            {userGroups.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">
                <Users size={36} className="mx-auto mb-2 opacity-30" />
                Keine Nutzer mit mindestens {minDevices} Geräten (in der aktuellen Auswahl).
              </div>
            ) : userGroups.map(g => {
              const open = expandedUser === g.name
              const email = g.ad?.email?.trim()
              const flagged = isFlagged(g)
              const lc = laptopCount(g)
              const adFound = g.ad?.found === true
              const leader = isLeader(g)
              const fu = getFollowup(g.name)
              return (
                <div key={g.name} className={`rounded-lg border bg-card overflow-hidden ${flagged ? 'border-amber-500/50' : 'border-border'}`}>
                  <div className={`flex items-center gap-3 px-3 py-2.5 ${open ? 'bg-accent/10' : ''}`}>
                    <input type="checkbox" checked={selUsers.has(g.name)} onChange={() => toggleUser(g.name)} className="accent-primary shrink-0 w-4 h-4" title={email ? `Mail an ${email}` : 'Keine E-Mail in AD gefunden — Versand nicht möglich'} />
                    <div role="button" tabIndex={0} onClick={() => setExpandedUser(open ? null : g.name)} className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer">
                      <ChevronRight size={14} className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1">{g.ad?.displayName || g.name}<PersonInfoButton name={g.ad?.displayName || g.name} sam={g.ad?.sam} /></span>
                          {flagged && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold"><AlertTriangle size={9} />{lc} Laptops</span>}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">{g.devices.length} Geräte</span>
                          {adFound && (leader
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600" title={`${g.ad?.reportsCount} unterstellte Mitarbeiter`}>Abteilungsleiter</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30">kein Abteilungsleiter</span>)}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {email ? <span className="inline-flex items-center gap-1"><Mail size={10} />{email}</span> : <span className="text-amber-300">keine E-Mail in AD</span>}
                          {g.ad?.department && <span> · {g.ad.department}</span>}
                          {g.ad?.title && <span> · {g.ad.title}</span>}
                          {g.name !== (g.ad?.displayName || g.name) && <span> · zugew.: {g.name}</span>}
                        </p>
                      </div>
                    </div>
                    {/* Nachverfolgung (schwarz): Nachgefragt / Erledigt + Verlauf */}
                    <div className="shrink-0 flex items-center gap-2 mr-1 rounded-md bg-black/50 border border-neutral-700 px-2 py-1">
                      <label className="flex items-center gap-1 text-[11px] text-neutral-100 cursor-pointer" title="Person wurde kontaktiert">
                        <input type="checkbox" checked={fu.nachgefragt} onChange={() => toggleNachgefragt(g.name)} className="accent-black w-3.5 h-3.5" />
                        Nachgefragt
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-neutral-100 cursor-pointer" title="Erledigt — öffnet das Info-/Nachweis-Fenster">
                        <input type="checkbox" checked={fu.erledigt} onChange={() => toggleErledigt(g.name)} className="accent-black w-3.5 h-3.5" />
                        Erledigt
                      </label>
                      <button onClick={() => openFollowupDialog(g.name)} title="Kontakt-Verlauf & Nachweise ansehen"
                        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-black text-white border border-neutral-700 hover:bg-neutral-800">
                        <ClipboardCheck size={12} />Verlauf
                        {(fu.files.length > 0 || (fu.note && fu.note.trim())) && <span className="text-[9px] px-1 rounded-full bg-neutral-700 text-white">{fu.files.length}</span>}
                      </button>
                    </div>
                    <button onClick={() => openCustomMail(g)} title="Eigene Mail an diese Person schreiben"
                      className="shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                      <Mail size={12} />Mail schreiben
                    </button>
                    {!email && <span title="Keine E-Mail in AD" className="shrink-0"><AlertTriangle size={14} className="text-amber-400" /></span>}
                  </div>
                  {open && (
                    <div className="border-t border-border overflow-x-auto">
                      {flagged && <p className="px-3 py-1.5 text-[11px] text-amber-300 bg-amber-500/[0.06]">Diese Person hat mehrere Arbeitslaptops. Die Laptops sind vorausgewählt — hake die Geräte an, die in der Mail abgefragt werden sollen.</p>}
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-1.5 w-8" title="Für die Mail auswählen"><CheckSquare size={11} /></th>
                            <th className="text-left px-3 py-1.5">PC-Name</th>
                            <th className="text-left px-3 py-1.5">Seriennummer</th>
                            <th className="text-left px-3 py-1.5">Model</th>
                            <th className="text-left px-3 py-1.5">Model-Typ</th>
                            <th className="text-left px-3 py-1.5">Status</th>
                            <th className="text-left px-3 py-1.5">Verwendung</th>
                            <th className="text-left px-3 py-1.5">Unternehmen</th>
                            <th className="text-left px-3 py-1.5">Wer bezahlt?</th>
                            <th className="text-left px-3 py-1.5">Leasingende</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.devices.map(d => {
                            const lap = isLaptop(d.model)
                            return (
                              <tr key={d.id} className={`border-t border-border/40 ${lap ? 'bg-amber-500/[0.05]' : ''}`}>
                                <td className="px-3 py-1.5"><input type="checkbox" checked={selDeviceIds.has(d.id)} onChange={() => toggleDevice(d.id)} className="accent-amber-500" title="Für die Mail auswählen" /></td>
                                <td className="px-3 py-1.5 font-mono text-foreground">{d.hostname || '—'}</td>
                                <td className="px-3 py-1.5 font-mono text-muted-foreground">{d.serial || '—'}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{d.model || '—'}</td>
                                <td className="px-3 py-1.5 text-foreground">{classifyModel(d.model) || '—'}{lap && <span className="ml-1 text-[9px] text-amber-300">Laptop</span>}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{d.state || '—'}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{d.substate || '—'}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{d.company || '—'}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{d.assetOwnership || '—'}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{d.retiredDate || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Seriennummer</th>
                <th className="px-3 py-2">PC-Name</th>
                <th className="px-3 py-2">Zugewiesen an</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Model-Typ</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Verwendung</th>
                <th className="px-3 py-2">Kommentar zum Asset</th>
                <th className="px-3 py-2">Leasingende</th>
                <th className="px-3 py-2">Unternehmen</th>
                <th className="px-3 py-2">Wer bezahlt?</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const cat = classifyModel(d.model)
                const cost = modelCost(d.model)
                return (
                  <tr key={d.id} className="border-b border-border/40 hover:bg-accent/10">
                    <td className="px-3 py-2 font-mono text-foreground">{d.serial || '—'}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{d.hostname || '—'}</td>
                    <td className="px-3 py-2 text-foreground">{d.assignedTo || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[18rem] truncate" title={d.model || undefined}>{d.model || '—'}</td>
                    <td className="px-3 py-2 text-foreground">
                      {cat || <span className="text-muted-foreground">—</span>}
                      {cost !== null && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground">{formatEuro(cost)}/Monat</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.state || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.substate || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[22rem] truncate" title={d.comments || undefined}>{d.comments || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.retiredDate || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.company || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.assetOwnership || '—'}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">Keine Geräte entsprechen den Filtern.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Eigenes Mailfenster (Freitext) — Outlook-Entwurf öffnen oder direkt senden */}
      {customMail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => !customSending && setCustomMail(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Mail size={16} className="text-blue-400" />
              <h3 className="text-base font-semibold text-foreground">Mail an {customMail.name}</h3>
              <button onClick={() => setCustomMail(null)} disabled={customSending} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground">An</label>
                <input value={customMail.to} onChange={e => setCustomMail(m => m ? { ...m, to: e.target.value } : m)} placeholder="empfaenger@skf.com"
                  className="w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                {!customMail.to.trim() && <p className="text-[11px] text-amber-300 mt-1">Keine E-Mail aus AD gefunden — bitte manuell eintragen.</p>}
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Betreff</label>
                <input value={customMail.subject} onChange={e => setCustomMail(m => m ? { ...m, subject: e.target.value } : m)}
                  className="w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Text (frei bearbeitbar)</label>
                <textarea value={customMail.body} onChange={e => setCustomMail(m => m ? { ...m, body: e.target.value } : m)} rows={12}
                  className="w-full mt-0.5 px-2.5 py-2 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono leading-relaxed" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center gap-2">
              <p className="text-[11px] text-muted-foreground flex-1">„In Outlook öffnen" erstellt einen Entwurf zum Prüfen/Senden. „Direkt senden" verschickt sofort über Outlook.</p>
              <button onClick={() => sendCustomMail('draft')} disabled={customSending || !customMail.to.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
                <Mail size={13} />In Outlook öffnen
              </button>
              <button onClick={() => sendCustomMail('send')} disabled={customSending || !customMail.to.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40">
                {customSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Direkt senden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review-Fenster: Offline-Mails bearbeiten + Versandart waehlen */}
      {reviewMails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => !reviewSending && setReviewMails(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Mail size={16} className="text-blue-400" />
              <h3 className="text-base font-semibold text-foreground">Mails prüfen & versenden</h3>
              <span className="text-xs text-muted-foreground">{reviewMails.length} Empfänger</span>
              <button onClick={() => setReviewMails(null)} disabled={!!reviewSending} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {reviewMails.map((m, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-muted/5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{m.name}</span>
                    <button onClick={() => setReviewMails(list => list ? list.filter((_, j) => j !== i) : list)} disabled={!!reviewSending}
                      className="ml-auto text-[11px] text-muted-foreground hover:text-red-300 disabled:opacity-40">entfernen</button>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">An</label>
                    <input value={m.to} onChange={e => setReviewMails(list => list ? list.map((x, j) => j === i ? { ...x, to: e.target.value } : x) : list)}
                      placeholder="empfaenger@skf.com"
                      className="w-full mt-0.5 px-2 py-1 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
                    {!m.to.trim() && <p className="text-[10px] text-amber-300 mt-0.5">Keine E-Mail gefunden — bitte eintragen.</p>}
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Betreff</label>
                    <input value={m.subject} onChange={e => setReviewMails(list => list ? list.map((x, j) => j === i ? { ...x, subject: e.target.value } : x) : list)}
                      className="w-full mt-0.5 px-2 py-1 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Text (frei bearbeitbar)</label>
                    <textarea value={m.body} onChange={e => setReviewMails(list => list ? list.map((x, j) => j === i ? { ...x, body: e.target.value } : x) : list)} rows={8}
                      className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary font-mono leading-relaxed" />
                  </div>
                </div>
              ))}
              {reviewMails.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Keine Mails mehr — alle entfernt.</p>}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center gap-2">
              <p className="text-[11px] text-muted-foreground flex-1">„In Outlook öffnen" erstellt pro Empfänger ein Outlook-Fenster zum selbst Senden. „Direkt senden" verschickt sofort über Outlook.</p>
              <button onClick={() => setReviewMails(null)} disabled={!!reviewSending}
                className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">Abbrechen</button>
              <button onClick={() => runReview('draft')} disabled={!!reviewSending || reviewMails.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
                {reviewSending === 'draft' ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}In Outlook öffnen
              </button>
              <button onClick={() => runReview('send')} disabled={!!reviewSending || reviewMails.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40">
                {reviewSending === 'send' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Direkt senden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: aktuelle Ansicht als neuen Bericht speichern */}
      {saveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => !savingReport && setSaveDialog(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Save size={16} className="text-emerald-400" />
              <h3 className="text-base font-semibold text-foreground">Bericht speichern</h3>
              <button onClick={() => setSaveDialog(null)} disabled={savingReport} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Gespeichert wird die <strong className="text-foreground">aktuelle Ansicht</strong>: {modeLabel(currentMode())} · {filtered.length} Geräte{currentMode() === 'offline' && loMap.size > 0 ? ' (inkl. Zuletzt-online-Ergebnissen)' : ''}. Das Datum wird automatisch gesetzt.
              </p>
              <div>
                <label className="text-[11px] text-muted-foreground">Berichtsname</label>
                <input autoFocus value={saveDialog.name} onChange={e => setSaveDialog({ name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') doSaveNewReport() }}
                  placeholder={`z. B. In-Use ${fmtDate(new Date().toISOString())}`}
                  className="w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button onClick={() => setSaveDialog(null)} disabled={savingReport} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">Abbrechen</button>
              <button onClick={doSaveNewReport} disabled={savingReport || !saveDialog.name.trim()} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40">
                {savingReport ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Bericht umbenennen */}
      {renameReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setRenameReport(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Pencil size={16} className="text-primary" />
              <h3 className="text-base font-semibold text-foreground">Bericht umbenennen</h3>
              <button onClick={() => setRenameReport(null)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="p-5">
              <input autoFocus value={renameReport.name} onChange={e => setRenameReport(r => r ? { ...r, name: e.target.value } : r)}
                onKeyDown={e => { if (e.key === 'Enter') doRename() }}
                className="w-full px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button onClick={() => setRenameReport(null)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">Abbrechen</button>
              <button onClick={doRename} disabled={!renameReport.name.trim()} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* Info-Fenster (schwarz): Kontakt-Verlauf + Nachweise je Person */}
      {followupDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={() => !followupBusy && setFollowupDialog(null)}>
          <div className="bg-black border border-neutral-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-neutral-100" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-neutral-800 flex items-center gap-2">
              <ClipboardCheck size={16} className="text-white" />
              <h3 className="text-base font-semibold">Kontakt &amp; Nachweise — {followupDialog.personName}</h3>
              <button onClick={() => setFollowupDialog(null)} disabled={followupBusy} className="ml-auto p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-40"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Status / Verlauf */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-1 rounded-md border border-neutral-700 bg-neutral-900">
                  Nachgefragt: {followupDialog.nachgefragt ? `ja${followupDialog.nachgefragtAt ? ` · ${fmtDateTime(followupDialog.nachgefragtAt)}` : ''}${followupDialog.nachgefragtBy ? ` · ${followupDialog.nachgefragtBy}` : ''}` : 'nein'}
                </span>
                <span className="px-2 py-1 rounded-md border border-neutral-700 bg-neutral-900">
                  Erledigt: {followupDialog.erledigt ? `ja${followupDialog.erledigtAt ? ` · ${fmtDateTime(followupDialog.erledigtAt)}` : ''}${followupDialog.erledigtBy ? ` · ${followupDialog.erledigtBy}` : ''}` : 'nein'}
                </span>
              </div>
              {/* Notiz / Rueckmeldung */}
              <div>
                <label className="text-[11px] text-neutral-400">Rückmeldung / Notiz (was wurde besprochen?)</label>
                <textarea value={followupDialog.note ?? ''} onChange={e => setFollowupDialog(d => d ? { ...d, note: e.target.value } : d)} rows={6}
                  placeholder="z. B. Antwort der Person, Zusagen, offene Punkte…"
                  className="w-full mt-1 px-2.5 py-2 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-500 leading-relaxed" />
              </div>
              {/* Dateien / Nachweise */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[11px] text-neutral-400 flex items-center gap-1"><Paperclip size={12} />Nachweise ({followupDialog.files.length})</p>
                  <button onClick={addFollowupFiles} disabled={followupBusy}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-black text-white border border-neutral-700 hover:bg-neutral-800 disabled:opacity-40">
                    {followupBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}Dateien hinzufügen
                  </button>
                </div>
                <p className="text-[10px] text-neutral-500 mb-2">Outlook-Nachrichten (.msg/.eml), PDF, Bilder, Office-Dateien … werden zentral gespeichert.</p>
                {followupDialog.files.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic py-2">Noch keine Nachweise hinterlegt.</p>
                ) : (
                  <div className="space-y-1">
                    {followupDialog.files.map(f => (
                      <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-950">
                        <FileText size={13} className="text-neutral-400 shrink-0" />
                        <span className="text-xs text-neutral-100 truncate flex-1" title={f.name}>{f.name}</span>
                        <span className="text-[10px] text-neutral-500 shrink-0">{formatFileSize(f.size)} · {fmtDate(f.addedAt)}</span>
                        <button onClick={() => openFollowupFile(f.path)} title="Öffnen" className="p-1 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white"><ExternalLink size={13} /></button>
                        <button onClick={() => removeFollowupFile(f.id)} title="Entfernen" className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-red-400"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-end gap-2">
              <button onClick={() => setFollowupDialog(null)} disabled={followupBusy} className="px-3 py-1.5 text-xs rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40">Schließen</button>
              <button onClick={saveFollowupDialog} disabled={followupBusy} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-white text-black hover:bg-neutral-200 disabled:opacity-40">
                {followupBusy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
