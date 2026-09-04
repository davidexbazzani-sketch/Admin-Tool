// ── Onboarding: Dashboard direkt verteilen (aus der Übersicht) ───────────────
// Kapselt „HTML personalisieren → Temp-Dateien → auf den PC kopieren → verifizieren
// → protokollieren" für EINEN Rechner, damit die Onboarding-Übersicht mit einem Klick
// verteilen kann. Nutzt DIESELBEN Bausteine wie der Verteilen-Tab (onboardingAssets,
// onboardingHtml, onboardingDeploy-Primitive) — das Dashboard ist also identisch.
// Kontakte kommen hier aus den Onboarding-Einstellungen (generalInfo.contacts), da die
// Übersicht keinen Kontakt-Editor hat. WinRM wird wie im Verteilen-Tab per enableWinRM
// (= ensureWinRM / Remote-Doc-Basis) aktiviert; die Kopie läuft über SMB (nicht fatal).

import {
  loadOnboardingSettings, loadOnboardingMarkers, addDeployment,
  type PlanId,
} from './onboarding'
import { buildOnboardingHtml, collectNeededPages, type OnboardingContactData, type GreetingMode } from './onboardingHtml'
import { renderPlanPages, getLogoDataUri, getRoomPhotoDataUri, findRoomOnPlans, getPdfJsSources, getPlanPdfsBase64, type RoomHit } from './onboardingAssets'
import { api } from '../electronAPI'
import {
  checkDns, checkReachability, enableWinRM, writeTempHtml, writeTempFile, writeTempFileUtf16, writeTempBinary,
  copyDashboardFiles, verifyDeployed, cleanupTemp, buildShortcutUrlFile, buildOpenFolderVbs, registerFolderProtocol,
  buildSelfServiceVbs, registerSelfServiceProtocol, DESKTOP_FILENAME,
} from './onboardingDeploy'
import { logDossierAction } from './personDossier'

export interface OnbDeployPerson {
  vorname: string
  nachname: string
  startDate: string
  roomNumber: string
  department: string
  displayName: string
  sam?: string
  employeeId?: string
}

export type OnbStepStatus = 'running' | 'ok' | 'warn' | 'fail'
export interface OnbDeployResult { ok: boolean; message: string; step?: string }

/** Personalisiertes HTML + alle Temp-Dateien bauen (wie DeployPanel.generateHtml). */
async function buildTemps(
  person: OnbDeployPerson, mode: GreetingMode, onProgress?: (msg: string) => void,
): Promise<{
  html: string; url: string; ico?: string; vbs?: string; ssvbs?: string; filmSrc?: string
  all: string[]
}> {
  const say = (m: string) => onProgress?.(m)
  say('Lade Konfiguration…')
  const [settings, markers, logo] = await Promise.all([
    loadOnboardingSettings(), loadOnboardingMarkers(), getLogoDataUri(),
  ])

  let autoRoomPin: RoomHit | null = null
  if (person.roomNumber.trim()) {
    say(`Suche Raum ${person.roomNumber.trim()} in den Lageplänen…`)
    autoRoomPin = await findRoomOnPlans(person.roomNumber)
  }

  const pages = collectNeededPages(markers, autoRoomPin ? [autoRoomPin] : undefined)
  const images = await renderPlanPages(pages, (done, total) => say(`Rendere Lageplan ${done}/${total}…`))

  say('Bette scharfe Lagepläne ein…')
  const neededPlanIds = [...new Set(pages.map(p => p.planId))] as PlanId[]
  const [pdfJs, planPdfs] = await Promise.all([
    getPdfJsSources().catch(() => null),
    getPlanPdfsBase64(neededPlanIds).catch(() => ({})),
  ])

  say('Lade Raumfotos…')
  const roomPhotos: Record<string, string> = {}
  for (const r of settings.rooms) roomPhotos[r.id] = await getRoomPhotoDataUri(r.photo)

  say('Baue HTML…')
  // Kontakte aus den Einstellungen (die Übersicht hat keinen Kontakt-Editor).
  const contactList: OnboardingContactData[] = (settings.generalInfo?.contacts ?? [])
    .map(c => ({ name: (c.name || '').trim(), role: (c.role || '').trim(), email: (c.email || '').trim(), phone: (c.phone || '').trim() }))
    .filter(c => c.name || c.email || c.phone)

  const html = buildOnboardingHtml({
    employee: { vorname: person.vorname, nachname: person.nachname, startDate: person.startDate, roomNumber: person.roomNumber, department: person.department },
    contact: contactList[0] ?? { name: '', role: '', email: '', phone: '' },
    contacts: contactList,
    settings, markers,
    logoDataUri: logo,
    planImages: Object.fromEntries(images),
    roomPhotos,
    mode,
    autoRoomPin,
    pdfJs,
    planPdfs,
  })

  const all: string[] = []
  const tmp = await writeTempHtml(html, person.sam || person.nachname)
  if (!tmp.ok || !tmp.path) throw new Error('HTML konnte nicht erzeugt werden: ' + (tmp.error || ''))
  all.push(tmp.path)

  const tmpUrl = await writeTempFile(buildShortcutUrlFile(), 'shortcut', 'url')
  if (!tmpUrl.ok || !tmpUrl.path) throw new Error('Verknüpfung konnte nicht erzeugt werden: ' + (tmpUrl.error || ''))
  all.push(tmpUrl.path)

  let icoPath: string | undefined
  try {
    const ico = await api().readAsset('onboarding/skf.ico')
    if (ico.success && ico.data) { const t = await writeTempBinary(ico.data, 'skf_icon', 'ico'); if (t.ok && t.path) { icoPath = t.path; all.push(t.path) } }
  } catch { /* ohne Icon weiter */ }

  let vbsPath: string | undefined
  const folderLinks = settings.folderLinks ?? []
  if (folderLinks.length > 0) {
    const t = await writeTempFileUtf16(buildOpenFolderVbs(folderLinks), 'open_folder', 'vbs')
    if (t.ok && t.path) { vbsPath = t.path; all.push(t.path) }
  }

  let ssvbsPath: string | undefined
  const tiles = settings.selfHelpTiles ?? []
  const runnable = tiles.filter(t => (t.type === 'skript' || t.type === 'programm') && (t.path || '').trim())
  if (runnable.length > 0) {
    const t = await writeTempFileUtf16(buildSelfServiceVbs(tiles), 'selfhelp', 'vbs')
    if (t.ok && t.path) { ssvbsPath = t.path; all.push(t.path) }
  }

  // Ausgeblendeter Film (Einstellungen → Auge) wird NICHT mitkopiert.
  const filmSrc = settings.hidden?.film ? undefined : ((settings.filmPath || '').trim().replace(/^"+|"+$/g, '').trim() || undefined)
  return { html: tmp.path, url: tmpUrl.path, ico: icoPath, vbs: vbsPath, ssvbs: ssvbsPath, filmSrc, all }
}

/**
 * Dashboard für EINE Person auf EINEN Rechner verteilen (DNS → Erreichbarkeit → WinRM →
 * Kopieren → Handler/Selbsthilfe → Verifizieren → Protokoll). Gleiche Pipeline wie der
 * Verteilen-Tab. onStep meldet je Schritt; wirft NICHT (Fehler steht im Ergebnis).
 */
export async function deployOnboardingDashboard(
  person: OnbDeployPerson, host: string, mode: GreetingMode, by: string,
  onStep?: (step: string, status: OnbStepStatus, message?: string) => void,
  onProgress?: (msg: string) => void,
): Promise<OnbDeployResult> {
  const step = (s: string, st: OnbStepStatus, m?: string) => onStep?.(s, st, m)
  let temps: Awaited<ReturnType<typeof buildTemps>> | null = null
  try {
    // 0) HTML + Temp-Dateien
    step('HTML', 'running', 'personalisiere Dashboard…')
    temps = await buildTemps(person, mode, onProgress)
    step('HTML', 'ok')

    // 1) DNS
    step('DNS', 'running')
    const dns = await checkDns(host)
    if (!dns.ok) { step('DNS', 'fail', dns.error); return { ok: false, step: 'DNS', message: `DNS fehlgeschlagen: ${dns.error || host}` } }
    step('DNS', dns.mismatch ? 'warn' : 'ok', dns.mismatch ? `IP ${dns.ip} — Reverse-DNS „${dns.reverse}“` : `IP ${dns.ip}`)

    // 2) Erreichbarkeit
    step('Erreichbarkeit', 'running')
    const reach = await checkReachability(host)
    if (!reach.online) { step('Erreichbarkeit', 'fail'); return { ok: false, step: 'Erreichbarkeit', message: 'Nicht erreichbar (Ping/SMB/RPC).' } }
    step('Erreichbarkeit', 'ok', `via ${reach.method}`)

    // 3) WinRM (wie Remote Doc — nicht fatal, Kopie läuft über SMB)
    step('WinRM', 'running')
    const winrm = await enableWinRM(host)
    step('WinRM', winrm.ok ? 'ok' : 'warn', winrm.ok ? 'aktiv' : (winrm.message || 'nicht aktivierbar') + ' — Kopie über SMB')

    // 4) Kopieren
    step('Kopieren', 'running')
    const copy = await copyDashboardFiles(host, { html: temps.html, ico: temps.ico, url: temps.url, vbs: temps.vbs, ssvbs: temps.ssvbs, filmSrc: temps.filmSrc })
    if (!copy.ok) { step('Kopieren', 'fail', copy.error); return { ok: false, step: 'Kopieren', message: `Kopieren fehlgeschlagen: ${copy.error || 'Adminrechte auf c$?'}` } }
    step('Kopieren', 'ok')

    // 5) Explorer-Handler + Selbsthilfe registrieren (nicht fatal)
    if (temps.vbs) { step('Handler', 'running'); const r = await registerFolderProtocol(host); step('Handler', r.ok ? 'ok' : 'warn', r.ok ? 'skf-ordner: registriert' : r.message) }
    if (temps.ssvbs) { step('Selbsthilfe', 'running'); const r = await registerSelfServiceProtocol(host); step('Selbsthilfe', r.ok ? 'ok' : 'warn', r.ok ? 'skf-fix: registriert' : r.message) }

    // 6) Verifizieren
    step('Verifizieren', 'running')
    const verify = await verifyDeployed(host)
    if (!verify.ok) { step('Verifizieren', 'fail', verify.error); return { ok: false, step: 'Verifizieren', message: `Nicht verifizierbar: ${verify.error || ''}` } }
    step('Verifizieren', 'ok', `liegt auf dem Desktop (${verify.sizeKb ?? '?'} KB)`)

    // 7) Protokoll (Verteil-Marker) + Dossier-Notiz
    await addDeployment({ personName: person.displayName, employeeId: person.employeeId, hostname: host, mode, deployedAt: new Date().toISOString(), deployedBy: by })
    void logDossierAction(person.displayName, person.sam,
      `Onboarding-Dashboard „${DESKTOP_FILENAME}“ (${mode === 'new' ? 'Willkommen' : 'allgemein'}) aus der Übersicht verteilt auf ${host} (verifiziert).`,
      by, 'Onboarding')

    return { ok: true, message: `Dashboard liegt auf ${host} (${verify.sizeKb ?? '?'} KB).` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  } finally {
    if (temps) for (const t of temps.all) void cleanupTemp(t)
  }
}
