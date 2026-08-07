// ── Onboarding: Dashboard erstellen & verteilen ───────────────────────────────
// Person waehlen (neuer Mitarbeiter aus der Mitarbeiterverwaltung ODER
// bestehender Mitarbeiter per AD-Suche) → zugewiesene Rechner werden angezeigt
// und per Checkbox ausgewaehlt (mehrere moeglich, manuelle Eingabe zusaetzlich)
// → Begruessungsvariante waehlen ("Neuer Mitarbeiter" = Willkommen an Bord,
// "Bestehender Mitarbeiter" = allgemeine Begruessung) → Pipeline pro Rechner:
// DNS-Check → Erreichbarkeit → WinRM (wie Remote Doc) → HTML generieren →
// auf \\host\c$\Users\Public\Desktop kopieren → verifizieren.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2, Rocket, Download, CheckCircle2, XCircle, AlertTriangle, Circle,
  Monitor, User, RefreshCw, FileCode2, Search, Plus, UserPlus, Users,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import { api } from '../../electronAPI'
import { listEmployees, formatGermanDate, type Employee } from '../../services/employees'
import { resolveSamByName, findAssignedHardware } from '../../services/personMasterData'
import { readCentralAdUsers, buildNameIndex, lookupUserByName } from '../../services/adUserDirectory'
import type { AdUserListItem } from '../../services/adUsersList'
import { loadOnboardingSettings, loadOnboardingMarkers, addDeployment } from '../../services/onboarding'
import { buildOnboardingHtml, collectNeededPages, type OnboardingContactData, type GreetingMode } from '../../services/onboardingHtml'
import { renderPlanPages, getLogoDataUri, getRoomPhotoDataUri, findRoomOnPlans, getPdfJsSources, getPlanPdfsBase64, type RoomHit } from '../../services/onboardingAssets'
import type { PlanId } from '../../services/onboarding'
import {
  checkDns, checkReachability, enableWinRM, writeTempHtml, writeTempFile, writeTempFileUtf16, writeTempBinary,
  copyToPublicDesktop, copyDashboardFiles, verifyDeployed, cleanupTemp,
  buildDriveMappingBat, buildShortcutUrlFile, buildOpenFolderVbs, registerFolderProtocol, targetDirPath,
  DESKTOP_FILENAME, BAT_FILENAME, SHORTCUT_FILENAME,
} from '../../services/onboardingDeploy'
import type { FolderLink } from '../../services/onboarding'
import { isValidRemoteTarget } from '../../utils/remoteTarget'
import { createLogger } from '../../utils/activityLogger'
import { logDossierAction } from '../../services/personDossier'

const log = createLogger('onboarding')

type StepId = 'dns' | 'reach' | 'winrm' | 'copy' | 'handler' | 'verify'
type StepStatus = 'pending' | 'running' | 'ok' | 'warn' | 'fail'
interface StepState { status: StepStatus; message?: string }

const STEP_LABELS: Record<StepId, string> = {
  dns: 'DNS-Check',
  reach: 'Erreichbarkeit',
  winrm: 'WinRM',
  copy: 'Kopieren',
  handler: 'Explorer-Handler',
  verify: 'Verifizieren',
}
const STEP_ORDER: StepId[] = ['dns', 'reach', 'winrm', 'copy', 'handler', 'verify']

function freshSteps(): Record<StepId, StepState> {
  return { dns: { status: 'pending' }, reach: { status: 'pending' }, winrm: { status: 'pending' }, copy: { status: 'pending' }, handler: { status: 'pending' }, verify: { status: 'pending' } }
}

type PersonSource = 'employee' | 'ad'

/** Ausgewaehlte Person, egal aus welcher Quelle. */
interface PersonSel {
  vorname: string
  nachname: string
  displayName: string
  sam?: string
  startDate: string
  roomNumber: string
  manager: string
  employeeId?: string
}

function personFromEmployee(e: Employee): PersonSel {
  return {
    vorname: e.vorname, nachname: e.name,
    displayName: `${e.vorname} ${e.name}`.trim(),
    sam: (e.globalId || '').trim() || undefined,
    startDate: e.startDate, roomNumber: e.roomNumber, manager: e.manager,
    employeeId: e.id,
  }
}

function personFromAd(u: AdUserListItem): PersonSel {
  const parts = (u.displayName || '').trim().split(/\s+/)
  return {
    vorname: parts[0] ?? '', nachname: parts.slice(1).join(' '),
    displayName: u.displayName || u.sam, sam: u.sam,
    startDate: '', roomNumber: '', manager: u.managerName || '',
  }
}

export default function DeployPanel({ initialSource }: { initialSource?: PersonSource }) {
  const authUser = useAuthStore(s => s.session?.user)
  const currentUser = authUser?.displayName || authUser?.username || 'unbekannt'
  const preselectId = useAppStore(s => s.onboardingPreselectId)
  const setPreselectId = useAppStore(s => s.setOnboardingPreselectId)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [adUsers, setAdUsers] = useState<AdUserListItem[]>([])
  const [loading, setLoading] = useState(true)

  const [source, setSource] = useState<PersonSource>(initialSource ?? 'employee')
  const [empId, setEmpId] = useState('')
  const [adSearch, setAdSearch] = useState('')
  const [adPick, setAdPick] = useState<AdUserListItem | null>(null)

  const [person, setPerson] = useState<PersonSel | null>(null)
  const [mode, setMode] = useState<GreetingMode>('new')

  // Rechner-Auswahl
  const [hosts, setHosts] = useState<{ name: string; checked: boolean; source: string }[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [manualHost, setManualHost] = useState('')

  // Ansprechpartner
  const [cName, setCName] = useState('')
  const [cRole, setCRole] = useState('')
  const [cMail, setCMail] = useState('')
  const [cPhone, setCPhone] = useState('')

  // Lauf-Status pro Host
  const [runState, setRunState] = useState<Record<string, Record<StepId, StepState>>>({})
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [genProgress, setGenProgress] = useState('')
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // Laufwerk-I-Befehl aus den zuletzt geladenen Einstellungen (fuer die Desktop-Bat)
  const driveCmdRef = useRef('')
  // Ordner-Links aus den zuletzt geladenen Einstellungen (fuer den skf-ordner:-Handler)
  const folderLinksRef = useRef<FolderLink[]>([])

  // ── Daten laden ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [emps, dir] = await Promise.all([
          listEmployees(),
          readCentralAdUsers().catch(() => null),
        ])
        if (cancelled) return
        setEmployees(emps)
        setAdUsers(dir?.users ?? [])
        if (preselectId && emps.some(e => e.id === preselectId)) {
          setSource('employee')
          setEmpId(preselectId)
          setPreselectId(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Personenauswahl zusammenfuehren ─────────────────────────────────────────
  useEffect(() => {
    if (source === 'employee') {
      const e = employees.find(x => x.id === empId)
      setPerson(e ? personFromEmployee(e) : null)
      setMode('new')
    } else {
      setPerson(adPick ? personFromAd(adPick) : null)
      setMode('existing')
    }
  }, [source, empId, adPick, employees])

  // Bei Personen-Wechsel: Rechner-Vorschlaege + Ansprechpartner-Defaults
  const loadSuggestions = useCallback(async (p: PersonSel) => {
    setSuggesting(true)
    setHosts([])
    try {
      const sam = p.sam || await resolveSamByName(p.displayName) || ''
      const hw = await findAssignedHardware(p.displayName, sam || undefined)
      const list: { name: string; checked: boolean; source: string }[] = []
      const seen = new Set<string>()
      for (const i of hw.inventory) {
        const n = (i.name || '').trim().toUpperCase()
        if (n && !seen.has(n)) { seen.add(n); list.push({ name: n, checked: false, source: 'Inventar' }) }
      }
      for (const d of hw.endpoint) {
        const n = (d.hostname || d.serial || '').trim().toUpperCase()
        if (n && !seen.has(n)) { seen.add(n); list.push({ name: n, checked: false, source: 'Endgeräte' }) }
      }
      if (list.length === 1) list[0].checked = true
      setHosts(list)
    } finally {
      setSuggesting(false)
    }
  }, [])

  useEffect(() => {
    setRunState({}); setResultMsg(null); setManualHost('')
    setCName(person?.manager || ''); setCRole(person?.manager ? 'Dein Manager' : ''); setCMail(''); setCPhone('')
    if (person) {
      loadSuggestions(person)
      if (person.manager) {
        try {
          const idx = buildNameIndex(adUsers)
          const hit = lookupUserByName(idx, person.manager)
          if (hit?.email) setCMail(hit.email)
        } catch { /* optional */ }
      }
    } else {
      setHosts([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.displayName])

  const adResults = useMemo(() => {
    const q = adSearch.trim().toLowerCase()
    if (q.length < 2) return []
    return adUsers
      .filter(u => u.enabled && (u.displayName.toLowerCase().includes(q) || u.sam.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [adSearch, adUsers])

  const selectedHosts = hosts.filter(h => h.checked).map(h => h.name)

  function addManualHost() {
    const h = manualHost.trim().toUpperCase()
    if (!h || !isValidRemoteTarget(h)) return
    setHosts(prev => prev.some(x => x.name === h) ? prev.map(x => x.name === h ? { ...x, checked: true } : x) : [...prev, { name: h, checked: true, source: 'manuell' }])
    setManualHost('')
  }

  function setStep(host: string, id: StepId, st: StepState) {
    setRunState(prev => ({ ...prev, [host]: { ...(prev[host] ?? freshSteps()), [id]: st } }))
  }

  // ── HTML generieren ─────────────────────────────────────────────────────────
  async function generateHtml(p: PersonSel): Promise<string> {
    setGenProgress('Lade Konfiguration…')
    const [settings, markers, logo] = await Promise.all([
      loadOnboardingSettings(), loadOnboardingMarkers(), getLogoDataUri(),
    ])
    driveCmdRef.current = settings.driveMapping.manualCommand
    folderLinksRef.current = settings.folderLinks

    // Raum des Mitarbeiters automatisch in der Plan-Textebene suchen ("Dein Büro")
    let autoRoomPin: RoomHit | null = null
    if (p.roomNumber.trim()) {
      setGenProgress(`Suche Raum ${p.roomNumber.trim()} in den Lageplänen…`)
      autoRoomPin = await findRoomOnPlans(p.roomNumber)
    }

    const pages = collectNeededPages(markers, autoRoomPin ? [autoRoomPin] : undefined)
    const images = await renderPlanPages(pages, (done, total) => setGenProgress(`Rendere Lageplan ${done}/${total}…`))

    // Fuer die scharfe Live-Karte: pdf.js + rohe PDFs der benoetigten Plaene
    // einbetten (best effort — ohne fallen die Bilder als Fallback zurueck).
    setGenProgress('Bette scharfe Lagepläne ein…')
    const neededPlanIds = [...new Set(pages.map(p => p.planId))] as PlanId[]
    const [pdfJs, planPdfs] = await Promise.all([
      getPdfJsSources().catch(() => null),
      getPlanPdfsBase64(neededPlanIds).catch(() => ({})),
    ])

    setGenProgress('Lade Raumfotos…')
    const roomPhotos: Record<string, string> = {}
    for (const r of settings.rooms) roomPhotos[r.id] = await getRoomPhotoDataUri(r.photo)
    setGenProgress('Baue HTML…')
    const contact: OnboardingContactData = { name: cName.trim(), role: cRole.trim(), email: cMail.trim(), phone: cPhone.trim() }
    const html = buildOnboardingHtml({
      employee: { vorname: p.vorname, nachname: p.nachname, startDate: p.startDate, roomNumber: p.roomNumber },
      contact, settings, markers,
      logoDataUri: logo,
      planImages: Object.fromEntries(images),
      roomPhotos,
      mode,
      autoRoomPin,
      pdfJs,
      planPdfs,
    })
    setGenProgress('')
    return html
  }

  // ── Verteilen (sequenziell pro Rechner) ─────────────────────────────────────
  async function deploy() {
    if (!person || selectedHosts.length === 0 || running) return
    setRunning(true)
    setResultMsg(null)
    setRunState(Object.fromEntries(selectedHosts.map(h => [h, freshSteps()])))
    const temps: string[] = []
    const okHosts: string[] = []
    const failHosts: string[] = []
    try {
      // HTML EINMAL generieren (fuer alle Rechner identisch)
      const html = await generateHtml(person)
      const tmp = await writeTempHtml(html, person.sam || person.nachname)
      if (!tmp.ok || !tmp.path) {
        setResultMsg({ ok: false, text: 'HTML konnte nicht erzeugt werden: ' + (tmp.error || '') })
        return
      }
      temps.push(tmp.path)

      // Desktop-Verknuepfung (.url) mit SKF-Logo-Icon — eine .html auf dem
      // Desktop haette immer das Edge-Symbol
      const tmpUrl = await writeTempFile(buildShortcutUrlFile(), 'shortcut', 'url')
      if (!tmpUrl.ok || !tmpUrl.path) {
        setResultMsg({ ok: false, text: 'Verknüpfung konnte nicht erzeugt werden: ' + (tmpUrl.error || '') })
        return
      }
      temps.push(tmpUrl.path)

      let icoTempPath = ''
      try {
        const ico = await api().readAsset('onboarding/skf.ico')
        if (ico.success && ico.data) {
          const t = await writeTempBinary(ico.data, 'skf_icon', 'ico')
          if (t.ok && t.path) { icoTempPath = t.path; temps.push(t.path) }
        }
      } catch { /* ohne Icon weiter — Verknuepfung zeigt dann Standard-Symbol */ }

      // Laufwerk-I-Bat kommt MIT auf den Desktop (Browser fuehren .bat nicht aus)
      let batTempPath = ''
      const tmpBat = await writeTempFile(buildDriveMappingBat(driveCmdRef.current), 'laufwerk_i', 'bat')
      if (tmpBat.ok && tmpBat.path) { batTempPath = tmpBat.path; temps.push(tmpBat.path) }

      // Handler-VBS fuer "Ordner im Explorer oeffnen" (nur wenn Links gepflegt)
      let vbsTempPath = ''
      if (folderLinksRef.current.length > 0) {
        const tmpVbs = await writeTempFileUtf16(buildOpenFolderVbs(folderLinksRef.current), 'open_folder', 'vbs')
        if (tmpVbs.ok && tmpVbs.path) { vbsTempPath = tmpVbs.path; temps.push(tmpVbs.path) }
      }

      for (const host of selectedHosts) {
        const failed = await deployToHost(host, {
          html: tmp.path, url: tmpUrl.path,
          ico: icoTempPath || undefined, bat: batTempPath || undefined, vbs: vbsTempPath || undefined,
        })
        if (failed) failHosts.push(host)
        else okHosts.push(host)
      }

      if (okHosts.length > 0) {
        log('Onboarding-Dashboard verteilt', `${person.displayName} → ${okHosts.join(', ')} (${mode === 'new' ? 'neuer MA' : 'bestehender MA'})`)
        void logDossierAction(person.displayName, person.sam,
          `Onboarding-Dashboard „${DESKTOP_FILENAME}“ (${mode === 'new' ? 'Willkommens-Begrüßung' : 'allgemeine Begrüßung'}) verteilt auf: ${okHosts.join(', ')} (verifiziert).`,
          currentUser, 'Onboarding')
      }
      setResultMsg(failHosts.length === 0
        ? { ok: true, text: `Dashboard für ${person.displayName} liegt auf ${okHosts.length} Rechner${okHosts.length === 1 ? '' : 'n'} auf dem Public Desktop.` }
        : { ok: false, text: `${okHosts.length} von ${selectedHosts.length} Rechnern erfolgreich. Fehlgeschlagen: ${failHosts.join(', ')} — Details in der Liste.` })
    } finally {
      for (const t of temps) void cleanupTemp(t)
      setRunning(false)
      setGenProgress('')
    }
  }

  /** Liefert true bei Fehlschlag. */
  async function deployToHost(host: string, temps: { html: string; url: string; ico?: string; bat?: string; vbs?: string }): Promise<boolean> {
    // 1) DNS
    setStep(host, 'dns', { status: 'running' })
    const dns = await checkDns(host)
    if (!dns.ok) { setStep(host, 'dns', { status: 'fail', message: dns.error }); return true }
    setStep(host, 'dns', dns.mismatch
      ? { status: 'warn', message: `IP ${dns.ip} — Reverse-DNS zeigt auf „${dns.reverse}“ (evtl. veralteter Eintrag)!` }
      : { status: 'ok', message: `IP ${dns.ip}` })

    // 2) Erreichbarkeit
    setStep(host, 'reach', { status: 'running' })
    const reach = await checkReachability(host)
    if (!reach.online) { setStep(host, 'reach', { status: 'fail', message: 'Nicht erreichbar (Ping/SMB/RPC)' }); return true }
    setStep(host, 'reach', { status: 'ok', message: `via ${reach.method}` })

    // 3) WinRM (nicht fatal)
    setStep(host, 'winrm', { status: 'running' })
    const winrm = await enableWinRM(host)
    setStep(host, 'winrm', winrm.ok
      ? { status: 'ok', message: 'aktiv' }
      : { status: 'warn', message: (winrm.message || 'nicht aktivierbar') + ' — Kopie läuft über SMB' })

    // 4) Kopieren: HTML+Icon+Handler in den Ordner, Verknuepfung (SKF-Icon) + Bat auf den Desktop
    setStep(host, 'copy', { status: 'running' })
    const copy = await copyDashboardFiles(host, { html: temps.html, ico: temps.ico, url: temps.url, vbs: temps.vbs })
    if (!copy.ok) { setStep(host, 'copy', { status: 'fail', message: copy.error }); return true }
    if (temps.bat) {
      const batCopy = await copyToPublicDesktop(host, temps.bat, BAT_FILENAME)
      setStep(host, 'copy', batCopy.ok
        ? { status: 'ok', message: `Verknüpfung „${SHORTCUT_FILENAME}“ + „${BAT_FILENAME}“ auf dem Desktop · HTML in ${targetDirPath(host)}` }
        : { status: 'warn', message: `Dashboard kopiert, aber Bat fehlgeschlagen: ${batCopy.error || ''}` })
    } else {
      setStep(host, 'copy', { status: 'ok', message: `Verknüpfung auf dem Desktop · HTML in ${targetDirPath(host)}` })
    }

    // 5) Explorer-Handler registrieren (skf-ordner:) — nicht fatal
    if (temps.vbs) {
      setStep(host, 'handler', { status: 'running' })
      const reg = await registerFolderProtocol(host)
      setStep(host, 'handler', reg.ok
        ? { status: 'ok', message: `Protokoll skf-ordner: registriert (${folderLinksRef.current.length} Ordner freigegeben)` }
        : { status: 'warn', message: (reg.message || 'Registrierung fehlgeschlagen') + ' — Ordner-Links öffnen im Browser statt im Explorer.' })
    } else {
      setStep(host, 'handler', { status: 'ok', message: 'Keine Ordner-Links konfiguriert — übersprungen.' })
    }

    // 6) Verifizieren
    setStep(host, 'verify', { status: 'running' })
    const verify = await verifyDeployed(host)
    if (!verify.ok) { setStep(host, 'verify', { status: 'fail', message: verify.error }); return true }
    setStep(host, 'verify', { status: 'ok', message: `liegt auf dem Desktop (${verify.sizeKb ?? '?'} KB)` })

    await addDeployment({
      personName: person!.displayName,
      employeeId: person!.employeeId,
      hostname: host,
      mode,
      deployedAt: new Date().toISOString(),
      deployedBy: currentUser,
    })
    return false
  }

  // ── Lokal exportieren ───────────────────────────────────────────────────────
  async function exportLocal() {
    if (!person || exporting) return
    setExporting(true)
    setResultMsg(null)
    try {
      const html = await generateHtml(person)
      const target = await api().saveFileDialog(DESKTOP_FILENAME, [{ name: 'HTML', extensions: ['html'] }])
      if (!target) return
      const bytes = new TextEncoder().encode(html)
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const r = await api().writeFile(target, btoa(bin))
      setResultMsg(r.success ? { ok: true, text: `HTML exportiert: ${target}` } : { ok: false, text: r.error || 'Export fehlgeschlagen.' })
      if (r.success) log('Onboarding-Dashboard lokal exportiert', person.displayName)
    } catch (e) {
      setResultMsg({ ok: false, text: e instanceof Error ? e.message : 'Export fehlgeschlagen.' })
    } finally {
      setExporting(false)
      setGenProgress('')
    }
  }

  const inputCls = 'px-2.5 py-1.5 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary'

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade Daten…</div>
  }

  return (
    <div className="max-w-3xl space-y-4 pb-8">
      {/* 1. Person */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><User size={14} className="text-blue-400" />1. Person wählen</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setSource('employee')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border ${source === 'employee' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground'}`}>
            <UserPlus size={12} />Neuer Mitarbeiter (Mitarbeiterverwaltung)
          </button>
          <button onClick={() => setSource('ad')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border ${source === 'ad' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground'}`}>
            <Users size={12} />Bestehender Mitarbeiter (AD-Suche)
          </button>
        </div>

        {source === 'employee' ? (
          <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inputCls} w-full`}>
            <option value="">Mitarbeiter wählen…</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.vorname} {e.name}{e.globalId ? ` (${e.globalId})` : ''}{e.startDate ? ` – Start ${formatGermanDate(e.startDate)}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-1.5">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={adPick ? adPick.displayName : adSearch}
                onChange={e => { setAdPick(null); setAdSearch(e.target.value) }}
                placeholder="Name oder Corp-ID suchen (min. 2 Zeichen)…"
                className={`${inputCls} w-full pl-8`} />
            </div>
            {!adPick && adResults.length > 0 && (
              <div className="rounded-md border border-border bg-background divide-y divide-border overflow-hidden">
                {adResults.map(u => (
                  <button key={u.sam} onClick={() => { setAdPick(u); setAdSearch('') }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/30">
                    <span className="text-xs text-foreground">{u.displayName}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{u.sam}</span>
                    {u.department && <span className="text-[10px] text-muted-foreground ml-auto truncate">{u.department}</span>}
                  </button>
                ))}
              </div>
            )}
            {!adPick && adSearch.trim().length >= 2 && adResults.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Keine Treffer im zentralen AD-Verzeichnis{adUsers.length === 0 ? ' (Verzeichnis noch nicht geladen — einmal die Benutzer-Übersicht öffnen)' : ''}.</p>
            )}
          </div>
        )}
        {person && source === 'employee' && (
          <p className="text-[11px] text-muted-foreground">
            {person.roomNumber ? <>Raum/Arbeitsplatz: <span className="text-foreground">{person.roomNumber}</span></> : <span className="text-amber-300">Keine Raumnummer hinterlegt — die Map zeigt keinen „Dein Platz“-Pin.</span>}
          </p>
        )}
      </section>

      {/* 2. Rechner */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Monitor size={14} className="text-blue-400" />2. Rechner auswählen <span className="font-normal text-muted-foreground">(Mehrfachauswahl)</span></h3>
        {!person && <p className="text-[11px] text-muted-foreground">Zuerst eine Person wählen.</p>}
        {person && (
          <>
            {suggesting && <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 size={11} className="animate-spin" />Suche zugewiesene Geräte…</span>}
            {!suggesting && hosts.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Kein zugewiesenes Gerät gefunden — Hostname unten manuell hinzufügen.</p>
            )}
            {hosts.map(h => (
              <label key={h.name} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input type="checkbox" checked={h.checked}
                  onChange={() => setHosts(prev => prev.map(x => x.name === h.name ? { ...x, checked: !x.checked } : x))}
                  className="accent-primary" />
                <span className="font-mono">{h.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border">{h.source}</span>
              </label>
            ))}
            <div className="flex items-center gap-2">
              <input value={manualHost} onChange={e => setManualHost(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addManualHost() }}
                placeholder="Hostname manuell (z. B. DEHAM12345678)…"
                className={`${inputCls} flex-1 font-mono uppercase`} />
              <button onClick={addManualHost} disabled={!isValidRemoteTarget(manualHost.trim())}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                <Plus size={12} />Hinzufügen
              </button>
              {!suggesting && (
                <button onClick={() => person && loadSuggestions(person)} title="Vorschläge neu laden"
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground"><RefreshCw size={12} /></button>
              )}
            </div>
          </>
        )}
      </section>

      {/* 3. Begruessung */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-bold text-foreground">3. Begrüßung</h3>
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input type="radio" name="greet" checked={mode === 'new'} onChange={() => setMode('new')} className="accent-primary mt-0.5" />
          <span><strong>Neuer Mitarbeiter</strong> — „Herzlich willkommen an Bord, {person?.vorname || 'Vorname'}!“<br />
            <span className="text-muted-foreground">Wechselt 10 Tage nach dem Startdatum automatisch zur allgemeinen Begrüßung.</span></span>
        </label>
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input type="radio" name="greet" checked={mode === 'existing'} onChange={() => setMode('existing')} className="accent-primary mt-0.5" />
          <span><strong>Bestehender Mitarbeiter</strong> — allgemeine Begrüßung „Schön, dass du da bist, {person?.vorname || 'Vorname'}!“<br />
            <span className="text-muted-foreground">Ohne „Willkommen an Bord“ — für alle, die schon länger dabei sind.</span></span>
        </label>
        {mode === 'new' && !person?.startDate && person && (
          <p className="text-[11px] text-amber-300">Kein Startdatum bekannt — die Willkommens-Begrüßung würde dauerhaft angezeigt.</p>
        )}
      </section>

      {/* 4. Ansprechpartner */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-bold text-foreground">4. Kachel „Ihr Ansprechpartner“ <span className="font-normal text-muted-foreground">(leer = IT-Kontakt aus den Einstellungen)</span></h3>
        <div className="grid grid-cols-2 gap-2">
          <input value={cName} onChange={e => setCName(e.target.value)} placeholder="Name" className={inputCls} />
          <input value={cRole} onChange={e => setCRole(e.target.value)} placeholder="Rolle (z. B. Dein Manager)" className={inputCls} />
          <input value={cMail} onChange={e => setCMail(e.target.value)} placeholder="E-Mail" className={inputCls} />
          <input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="Telefon" className={inputCls} />
        </div>
      </section>

      {/* Aktionen */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={deploy} disabled={!person || selectedHosts.length === 0 || running || exporting}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
          {running ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
          Auf {selectedHosts.length || '…'} Rechner verteilen
        </button>
        <button onClick={exportLocal} disabled={!person || running || exporting}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Nur lokal exportieren
        </button>
        {genProgress && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><FileCode2 size={12} />{genProgress}</span>}
      </div>

      {/* Fortschritt pro Rechner */}
      {Object.keys(runState).length > 0 && (
        <section className="space-y-2">
          {Object.entries(runState).map(([host, steps]) => (
            <div key={host} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-bold font-mono text-foreground mb-2">{host}</p>
              <div className="flex items-start gap-4 flex-wrap">
                {STEP_ORDER.map(id => {
                  const st = steps[id]
                  return (
                    <div key={id} className="flex items-start gap-1.5 min-w-[110px] max-w-full">
                      <span className="mt-0.5 shrink-0">
                        {st.status === 'pending' && <Circle size={13} className="text-muted-foreground/40" />}
                        {st.status === 'running' && <Loader2 size={13} className="animate-spin text-blue-400" />}
                        {st.status === 'ok' && <CheckCircle2 size={13} className="text-green-400" />}
                        {st.status === 'warn' && <AlertTriangle size={13} className="text-amber-400" />}
                        {st.status === 'fail' && <XCircle size={13} className="text-red-400" />}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-[11px] font-semibold ${st.status === 'pending' ? 'text-muted-foreground/60' : 'text-foreground'}`}>{STEP_LABELS[id]}</p>
                        {st.message && <p className={`text-[10px] break-all ${st.status === 'fail' ? 'text-red-400' : st.status === 'warn' ? 'text-amber-300' : 'text-muted-foreground'}`}>{st.message}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {resultMsg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${resultMsg.ok ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
          {resultMsg.text}
        </div>
      )}
    </div>
  )
}
