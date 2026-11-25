// HCI-Fragebogen: aus den gelesenen Rohdaten die zwölf Antworten formulieren.
//
// Grundsätze:
//  • Die Antworten sind englisch (der Fragebogen ist englisch und geht an den Dienstleister).
//  • Jede Aussage nennt, WORAUF sie sich stützt (Anzahl geprüfter Aufgaben, Zeitraum der Protokolle …).
//  • Was sich am Server nicht messen lässt (Herstelleraussagen, Ansprechpartner), wird nicht erfunden:
//    Urteil „Unknown“ + die Fakten, die der Hersteller für seine Aussage braucht; `manuell: true`.
//  • Grenzen stehen dabei (z. B. „in Programmdateien einkompilierte Neustart-Aufrufe sind nicht erkennbar“).
// Reine Funktionen ohne Abhängigkeit zum Tool → testbar mit Beispieldaten.
import type { HciAntwort, HciEinstellungen, HciRoh, RohAufgabe, RohDienst, RohEreignis, RohNeustart, RohSoftware, RohTreiber, RohUnerwartet, Urteil } from './typen'

/** Angaben aus der SKFM-Serverliste (falls der Server dort steht) */
export interface Steckbrief {
  anwendungen: { titel: string; alias?: string; umgebung?: string[] }[]
  zustaendig: string[]
  plattform?: string
  /** Stand der Liste, z. B. „05.11.2026“ */
  stand?: string
}

export const STANDARD_EINSTELLUNGEN: HciEinstellungen = { problemSeit: '2025-11-26', tage: 365, vorMin: 30 }

// ── Einordnung der installierten Software ─────────────────────────────────────
export type SwArt = 'anwendung' | 'datenbank' | 'laufzeit' | 'agent' | 'werkzeug' | 'system'

const AGENT = /CrowdStrike|Falcon Sensor|SentinelOne|Sentinel Agent|Trellix|McAfee|Symantec|Sophos|Trend Micro|Deep Security|Apex One|Qualys|Tanium|Rapid7|Nessus|Zscaler|Microsoft Defender|Windows Defender|Sysmon|Splunk|Elastic (Agent|Endpoint)|Winlogbeat|Zabbix|Nagios|NSClient|PRTG|SolarWinds|Dynatrace|AppDynamics|New Relic|Datadog|Monitoring Agent|Operations Manager|Azure (Connected Machine|Monitor|Arc)|AzureConnectedMachine|Log Analytics|Dependency Agent|Configuration Manager|SCCM|CcmExec|Veeam|Commvault|NetBackup|Backup Exec|Rubrik|Cohesity|Avamar|NetWorker|Spectrum Protect|Tivoli Storage|BeyondTrust|CyberArk|Snow (Inventory|Agent)|Flexera|BigFix|Ivanti|LANDesk|ManageEngine|Bitdefender|Kaspersky|ESET|Carbon Black|Cylance|FireEye|Guest Agent|Guest Configuration|\bLAPS\b|Local Administrator Password|Windows Admin Center|Arcserve|Acronis|Lansweeper|Nexthink|1E Client|Automox|Puppet|Salt Minion/i
const SICHERUNG = /Veeam|Commvault|NetBackup|Backup Exec|Rubrik|Cohesity|Avamar|NetWorker|Spectrum Protect|Tivoli Storage|Arcserve|Acronis/i
const LAUFZEIT = /Visual C\+\+|Microsoft \.NET|\.NET (Core|Framework|Runtime|Desktop|SDK|Host)|ASP\.NET|\bJava\b|\bJRE\b|\bJDK\b|OpenJDK|Temurin|Corretto|Zulu|ODBC|OLE ?DB|Native Client|MSXML|Windows SDK|Redistributable|Runtime\b|Python \d|PowerShell \d|Node\.js|Access database engine|CLR Types|Report ?Viewer|Shared Management Objects|T-SQL Language|VSS Writer|Web Deploy|WebView2|URL Rewrite|Application Request Routing|Windows Software Development Kit|Universal CRT|Windows Desktop Runtime|Help Viewer|^Update for |^Security Update for |^Hotfix for /i
const WERKZEUG = /7-Zip|Notepad\+\+|WinSCP|PuTTY|Google Chrome|Mozilla Firefox|Microsoft Edge|Adobe (Acrobat|Reader)|WinRAR|TeamViewer|FileZilla|Wireshark|Npcap|WinPcap|Sysinternals|TreeSize|WinMerge|KeePass|Total Commander|Visual Studio Code|^Git\b|\bVLC\b|Greenshot|BGInfo|Remote Desktop Connection Manager|SQL Server Management Studio|Microsoft 365|Microsoft Office|OneDrive|Microsoft Teams|Copilot|\bGIMP\b|LibreOffice|mRemoteNG|Azure Data Studio|Report Builder|WinDirStat|Process (Explorer|Monitor)/i
const DATENBANK = /^Microsoft SQL Server \d{4}( R2)?( \((64|32)-bit\))?$|^SQL Server \d{4} Database Engine|Oracle Database|PostgreSQL \d|MySQL Server|MariaDB|MongoDB \d|Firebird \d|IBM Db2|SAP (MaxDB|HANA)|SQL Anywhere/i

export function swArt(s: Pick<RohSoftware, 'n' | 'h'>): SwArt {
  const n = s.n || ''
  if (DATENBANK.test(n)) return 'datenbank'
  if (AGENT.test(n) || AGENT.test(s.h || '')) return 'agent'
  if (LAUFZEIT.test(n)) return 'laufzeit'
  if (WERKZEUG.test(n)) return 'werkzeug'
  if (/Microsoft/i.test(s.h || '') || /^Microsoft /i.test(n)) return 'system'
  return 'anwendung'
}

// ── Dienste ───────────────────────────────────────────────────────────────────
export type DienstArt = 'windows' | 'agent' | 'werkzeug' | 'anwendung'
const WINDOWS_ZUSATZ = /\\Windows Defender|\\Microsoft\\(Edge|EdgeUpdate|EdgeWebView|EdgeCore)|\\Common Files\\Microsoft Shared|\\dotnet\\|\\Microsoft\.NET\\|\\Windows Kits\\|\\WindowsApps\\/i
/** Hilfsdienste allgemeiner Programme (Browser-Updater u. Ä.) — keine Dienste der Fachanwendung */
const HILFSDIENST = /\b(Updater?|Elevation|Maintenance)\b.*\bService\b|Google(Update|Chrome)|MozillaMaintenance|AdobeARM|ClickToRun/i
export function dienstArt(d: Pick<RohDienst, 'n' | 'd' | 'p'>): DienstArt {
  const p = d.p || ''
  if (!p || /\\windows\\/i.test(p) || WINDOWS_ZUSATZ.test(p)) return 'windows'
  if (AGENT.test(d.d || '') || AGENT.test(d.n || '') || AGENT.test(p)) return 'agent'
  if (WERKZEUG.test(d.d || '') || WERKZEUG.test(p) || HILFSDIENST.test(d.d || '') || HILFSDIENST.test(d.n || '')) return 'werkzeug'
  return 'anwendung'
}

// ── Treiber ───────────────────────────────────────────────────────────────────
export type TreiberArt = 'anwendung' | 'agent' | 'hardware' | 'sonst'
const HARDWARE = /Mellanox|NVIDIA|Intel|Broadcom|QLogic|Chelsio|Marvell|Emulex|Hewlett|\bHPE?\b|Dell|VMware|Red Hat|Citrix|Realtek|Advanced Micro|\bAMD\b|LSI|Avago|Microchip|Synaptics|Qualcomm|MediaTek/i
const norm = (s: string) => (s || '').toLowerCase().replace(/\b(gmbh|ag|inc|ltd|llc|corp|corporation|co|kg|se|sa|bv|ab|company|software|technologies|systems|datensysteme)\b|[^a-z0-9]/g, '')

/** Liegt der Treiber Windows bei? (Katalog-Signatur „Microsoft Windows“) — dann ist er nicht nachinstalliert. */
export const liegtWindowsBei = (t: Pick<RohTreiber, 'sig'>) => (t.sig || '') === 'Microsoft Windows'

export function treiberArt(t: RohTreiber, anwendungen: RohSoftware[]): { art: TreiberArt; zu?: string } {
  const text = `${t.h} ${t.b} ${t.d} ${t.n} ${t.p}`
  if (AGENT.test(text)) return { art: 'agent' }
  const pfad = (t.p || '').toLowerCase()
  for (const a of anwendungen) {
    const ort = (a.o || '').toLowerCase().replace(/[\\/]+$/, '')
    if (ort.length > 6 && pfad.startsWith(ort)) return { art: 'anwendung', zu: a.n }
    if (t.h && norm(t.h).length > 3 && norm(t.h) === norm(a.h)) return { art: 'anwendung', zu: a.n }
  }
  if (HARDWARE.test(t.h || '')) return { art: 'hardware' }
  return { art: 'sonst' }
}

/** Ladereihenfolge-Gruppe eines Dateisystem-Filters aus seiner „Altitude“ (Vergabe durch Microsoft). */
export function filterKlasse(hoehe: string): string {
  const a = parseFloat(hoehe)
  if (!isFinite(a)) return 'legacy filter'
  const g: [number, number, string][] = [
    [400000, 409999, 'top'], [360000, 389999, 'activity monitor'], [340000, 349999, 'undelete'], [320000, 329999, 'anti-virus'],
    [300000, 309999, 'replication'], [280000, 289999, 'continuous backup'], [260000, 269999, 'content screener'], [240000, 249999, 'quota management'],
    [220000, 229999, 'system recovery'], [200000, 209999, 'cluster file system'], [180000, 189999, 'HSM'], [170000, 174999, 'imaging'],
    [160000, 169999, 'compression'], [140000, 149999, 'encryption'], [130000, 139999, 'virtualization'], [120000, 129999, 'physical quota'],
    [100000, 109999, 'open file'], [80000, 89999, 'security enhancer'], [60000, 69999, 'copy protection'], [40000, 49999, 'bottom'], [20000, 29999, 'system'],
  ]
  return g.find(([von, bis]) => a >= von && a <= bis)?.[2] ?? 'other'
}

// ── Neustarts (Ereignis 1074): wer hat ausgelöst? ─────────────────────────────
export type NeustartArt = 'update' | 'admin' | 'fern' | 'host' | 'installer' | 'skript' | 'anwendung'
const istSystemKonto = (wer: string) => /SYSTEM\s*$/i.test(wer || '') || /^(NT[ -]AUT\S+\\)?(SYSTEM|LOKALER DIENST|LOCAL SERVICE|NETZWERKDIENST|NETWORK SERVICE)$/i.test((wer || '').trim())
export const neustartProgramm = (proz: string) => ((proz || '').replace(/\s*\([^)]*\)\s*$/, '').split(/[\\/]/).pop() || '').toLowerCase()

export function neustartArt(n: RohNeustart): NeustartArt {
  const exe = neustartProgramm(n.proz)
  const pfad = (n.proz || '').toLowerCase()
  if (/^(trustedinstaller|mousocoreworker|usoclient|wuauclt|tiworker|musnotif\w*|wusa|dism|setuphost)\.exe$/.test(exe)) return 'update'
  if (/^(vmicsvc|vmicshutdown)\.exe$/.test(exe) || /vmic/.test(exe)) return 'host'
  if (/^(msiexec|setup|install\w*)\.exe$/.test(exe)) return 'installer'
  if (/^(wmiprvse|ccmexec|ccmrestart|svchost|services|lsass|wsmprovhost|winrshost)\.exe$/.test(exe)) return /update|aktualisier|service pack|patch/i.test(n.grund || '') ? 'update' : 'fern'
  if (/^(explorer|startmenuexperiencehost|runtimebroker|winlogon|logonui|shellexperiencehost|wininit|slui|taskmgr|sihost|systemsettings)\.exe$/.test(exe)) return 'admin'
  if (/^(shutdown|powershell|pwsh|cmd|cscript|wscript|psshutdown\w*)\.exe$/.test(exe)) return istSystemKonto(n.wer) ? 'skript' : 'admin'
  if (/\\windows\\/.test(pfad)) return istSystemKonto(n.wer) ? 'fern' : 'admin'
  return 'anwendung'
}

// ── Hilfen ────────────────────────────────────────────────────────────────────
const tag = (iso: string) => (iso || '').slice(0, 10)
const minute = (iso: string) => (iso || '').slice(0, 16).replace('T', ' ')
const ms = (iso: string) => { const t = Date.parse(iso); return isNaN(t) ? 0 : t }
const TAG_MS = 86_400_000
const ausJjjjmmtt = (s: string) => (/^\d{8}$/.test(s || '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '')
const mehr = (zeilen: string[], max: number): string[] => (zeilen.length <= max ? zeilen : [...zeilen.slice(0, max), `… and ${zeilen.length - max} more (see detail sheet)`])
const punkte = (zeilen: string[]) => zeilen.map(z => `• ${z}`).join('\n')
/** Unterpunkte (eine Ebene tiefer, damit Listen in Listen lesbar bleiben) */
const unter = (zeilen: string[]) => zeilen.map(z => `   – ${z}`).join('\n')
/** Beginn des ausgewerteten Zeitraums: Abfragefenster oder Beginn des Protokolls, je nachdem, was später liegt */
export const zeitraumAb = (r: HciRoh, protokoll: 'system' | 'anwendung' = 'system'): string => {
  const fenster = ms(r.am) - r.tage * 86_400_000
  const log = ms(r.protokollAb[protokoll])
  const t = Math.max(fenster, log)
  return t > 0 ? new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : ''
}
const mz = (n: number, ein: string, viele = ein + 's') => `${n} ${n === 1 ? ein : viele}`
const einmal = <T,>(l: T[]) => Array.from(new Set(l))

const SQL_JAHR: Record<string, string> = { '16': '2022', '15': '2019', '14': '2017', '13': '2016', '12': '2014', '11': '2012', '10': '2008' }
export const sqlText = (s: HciRoh['sql'][number]) => {
  const v = s.pl || s.v || ''
  const jahr = SQL_JAHR[v.split('.')[0]] || ''
  return `Microsoft SQL Server${jahr ? ' ' + jahr : ''}${s.e ? ' ' + s.e : ''}, version ${v || 'unknown'}, instance ${s.n}`
}
export const osText = (r: HciRoh) => `${r.system.os}${r.system.anzeige ? `, version ${r.system.anzeige}` : ''}, build ${r.system.build}.${r.system.ubr}`
export const istHyperVGast = (r: HciRoh) => /Virtual Machine/i.test(r.system.modell || '') && /Microsoft/i.test(r.system.hersteller || '')

/** .NET-Framework-Version aus der Release-Nummer der Registry */
export function dotnetFramework(release: number, version: string): string {
  const stufen: [number, string][] = [[533320, '4.8.1'], [528040, '4.8'], [461808, '4.7.2'], [461308, '4.7.1'], [460798, '4.7'], [394802, '4.6.2'], [394254, '4.6.1'], [393295, '4.6'], [379893, '4.5.2'], [378675, '4.5.1'], [378389, '4.5']]
  const s = stufen.find(([ab]) => release >= ab)?.[1]
  return s ? `.NET Framework ${s}` : version ? `.NET Framework ${version}` : ''
}

// ── Abgeleitete Listen (für Antworten, Belege und Detail-Blatt) ───────────────
export interface Ableitung {
  software: (RohSoftware & { art: SwArt })[]
  anwendungen: RohSoftware[]
  datenbanken: string[]
  laufzeiten: RohSoftware[]
  agenten: RohSoftware[]
  werkzeuge: RohSoftware[]
  dienste: (RohDienst & { art: DienstArt })[]
  anwDienste: RohDienst[]
  agentDienste: RohDienst[]
  /** nachinstallierte Treiber (liegen Windows nicht bei) mit Zuordnung */
  treiber: (RohTreiber & { art: TreiberArt; zu?: string })[]
  treiberBeiliegend: number
  /** Dateisystem-Filter, die zu einem nachinstallierten Treiber gehören */
  filterFremd: (HciRoh['filter'][number] & { klasse: string; firma: string })[]
  filterMicrosoft: number
  aufgabenMitNeustart: RohAufgabe[]
  skripteGelesen: number
  skripteNichtLesbar: number
  dienstNeustartAnwendung: RohDienst[]
  dienstNeustartWindows: number
  neustarts: (RohNeustart & { klasse: NeustartArt })[]
  /** lauschende Ports, die nicht zu Windows-Prozessen gehören */
  anwPorts: HciRoh['ports']
}

const WINDOWS_PROZESS = /^(system|svchost|lsass|services|wininit|spoolsv|dns|dfsrs|dfssvc|ismserv|ntfrs|termsrv|winlogon|csrss|smss|msdtc|wmiprvse|w3wp|inetinfo|vmms|vmwp|clussvc|rhs|microsoft\.activedirectory\.webservices|snmp|lsm|idle|unknown|)$/i

export function leiteAb(r: HciRoh): Ableitung {
  const software = r.software.map(s => ({ ...s, art: swArt(s) }))
  const anwendungen = software.filter(s => s.art === 'anwendung')
  const dienste = r.dienste.map(d => ({ ...d, art: dienstArt(d) }))
  const nach = r.treiber.filter(t => !liegtWindowsBei(t))
  const treiber = nach.map(t => ({ ...t, ...treiberArt(t, anwendungen) }))
  const filterFremd = r.filter
    .map(f => ({ f, t: nach.find(t => t.n.toLowerCase() === f.n.toLowerCase()) }))
    .filter(x => x.t)
    .map(x => ({ ...x.f, klasse: filterKlasse(x.f.h), firma: x.t!.h || x.t!.sig || '' }))
  const aufgabenMitNeustart = r.aufgaben.filter(a => a.tok.length || a.sk.some(s => s.tok.length))
  const skripte = r.aufgaben.flatMap(a => a.sk)
  const dn = r.dienstNeustart.map(n => dienste.find(d => d.n.toLowerCase() === n.toLowerCase())).filter((d): d is RohDienst & { art: DienstArt } => !!d)
  return {
    software, anwendungen,
    datenbanken: [...r.sql.map(sqlText), ...software.filter(s => s.art === 'datenbank' && !/SQL Server/i.test(s.n)).map(s => `${s.n}${s.v ? ' ' + s.v : ''}${s.h ? ` (${s.h})` : ''}`)],
    laufzeiten: software.filter(s => s.art === 'laufzeit'), agenten: software.filter(s => s.art === 'agent'), werkzeuge: software.filter(s => s.art === 'werkzeug'),
    dienste, anwDienste: dienste.filter(d => d.art === 'anwendung'), agentDienste: dienste.filter(d => d.art === 'agent'),
    treiber, treiberBeiliegend: r.treiber.length - nach.length,
    filterFremd, filterMicrosoft: r.filter.length - filterFremd.length,
    aufgabenMitNeustart, skripteGelesen: skripte.filter(s => s.lesbar).length, skripteNichtLesbar: skripte.filter(s => !s.lesbar).length,
    dienstNeustartAnwendung: dn.filter(d => d.art !== 'windows'), dienstNeustartWindows: r.dienstNeustart.length - dn.filter(d => d.art !== 'windows').length,
    neustarts: r.neustarts.map(n => ({ ...n, klasse: neustartArt(n) })),
    anwPorts: r.ports.filter(p => !WINDOWS_PROZESS.test(p.proc || '')),
  }
}

const swZeile = (s: RohSoftware) => `${s.n}${s.v && !s.n.includes(s.v) ? ' ' + s.v : ''}${s.h ? ` — ${s.h}` : ''}`
const treiberZeile = (t: RohTreiber & { art?: TreiberArt; zu?: string }) =>
  `${t.n} — ${t.b || t.d || 'driver'} (${t.h || t.sig || 'vendor unknown'}${t.v ? ', ' + t.v.split(' ')[0] : ''}, ${/running/i.test(t.s) ? 'loaded' : 'not loaded'})`

// ── Ereignisse vor einem Ausfall ──────────────────────────────────────────────
/** Meldungen, die auf jedem Windows-Server laufend vorkommen und nichts über die Anwendung sagen */
const ROUTINE = /DistributedCOM|Schannel|Win32k|Time-Service|DNS Client|GroupPolicy|Kernel-General|\bTPM\b|BitLocker|WindowsUpdateClient|Security-SPP|UserPnp|LsaSrv|Wininit|Winlogon|Perflib|PerfNet|WMI\b|Kernel-PnP|Kernel-Boot|Kernel-Power|EventLog|User Profile|Windows Search|CertificateServicesClient|Security-Kerberos|NETLOGON|TerminalServices|DeviceSetupManager|Kernel-Processor-Power/i
const SPEICHER_QUELLE = /^(disk|storvsc|Ntfs|volmgr|stornvme|iScsiPrt|vhdmp|Microsoft-Windows-Ntfs|volsnap|Volsnap|storahci|mpio|partmgr)$/i

export interface AusfallBefund {
  u: RohUnerwartet
  /** Meldungen bis kurz nach dem letzten Lebenszeichen (alles Spätere gehört schon zum Neustart) */
  davor: RohEreignis[]
  anwendung: RohEreignis[]
  speicher: RohEreignis[]
  system: RohEreignis[]
}

export function ausfallBefund(u: RohUnerwartet): AusfallBefund {
  const grenze = ms(u.aus) + 5 * 60_000
  const davor = u.davor.filter(e => !u.aus || ms(e.t) <= grenze)
  const speicher = davor.filter(e => SPEICHER_QUELLE.test(e.q))
  const rest = davor.filter(e => !SPEICHER_QUELLE.test(e.q) && !ROUTINE.test(e.q))
  return { u, davor, speicher, anwendung: rest.filter(e => e.l === 'Application' && e.st <= 2), system: rest.filter(e => !(e.l === 'Application' && e.st <= 2)) }
}

const ereignisKurz = (l: RohEreignis[], max = 3) => {
  const g = new Map<string, { n: number; m: string }>()
  for (const e of l) { const k = `${e.q} ${e.id}`; const x = g.get(k) || { n: 0, m: e.m }; x.n++; g.set(k, x) }
  return [...g.entries()].slice(0, max).map(([k, x]) => `${k}${x.n > 1 ? ` ×${x.n}` : ''} (“${x.m.slice(0, 90)}${x.m.length > 90 ? '…' : ''}”)`).join('; ') + (g.size > max ? `; +${g.size - max} more` : '')
}

/** Ein Ausfall in einem Satz. Bugcheck 0 = die VM wurde von außen hart beendet (kein Absturz IM Gast). */
export function ausfallSatz(b: AusfallBefund): string {
  const u = b.u
  const art = u.ids.includes(41)
    ? (u.bug ? `Kernel-Power 41 with bugcheck code ${u.bug} (the guest OS itself crashed)` : 'Kernel-Power 41 with bugcheck code 0 (no crash inside the guest OS: it lost power or was reset from outside, or it hung)')
    : 'EventLog 6008 (previous shutdown was unexpected)'
  const wann = u.aus ? `${minute(u.aus)} last sign of life${u.ausQuelle === 'letzter Eintrag' ? ' (last log entry)' : ''}, OS started again ${minute(u.start)}` : `OS started ${minute(u.start)} after an unexpected stop`
  const teile: string[] = []
  teile.push(b.anwendung.length ? `application errors before the stop: ${ereignisKurz(b.anwendung)}` : 'no application errors or crashes logged before the stop')
  if (b.speicher.length) teile.push(`storage warnings/errors: ${ereignisKurz(b.speicher)}`)
  if (b.system.length) teile.push(`other system events: ${ereignisKurz(b.system, 2)}`)
  return `${wann} — ${art}; ${teile.join('; ')}`
}

// ── Die zwölf Antworten ───────────────────────────────────────────────────────
function mitUrteil(urteil: Urteil, text: string): string {
  return urteil ? `${urteil}${text ? (/^[.,;:–-]/.test(text) ? '' : '. ') + text : '.'}` : text
}

export function antworten(r: HciRoh, st: Steckbrief | null | undefined, e: HciEinstellungen): HciAntwort[] {
  const a = leiteAb(r)
  const am = tag(r.am)
  const aus: HciAntwort[] = []
  const add = (nr: number, urteil: Urteil, text: string, manuell = false, hinweis?: string) => aus.push({ nr, urteil, text: mitUrteil(urteil, text.trim()), manuell, hinweis })
  const gast = istHyperVGast(r)
  const knoten = r.system.gast.PhysicalHostName || r.system.gast.HostName || ''
  const iis = r.rollen.some(x => /IIS/i.test(x))
  const anwName = st?.anwendungen.length ? st.anwendungen.map(x => x.titel).filter(Boolean).join(', ') : a.anwendungen.slice(0, 3).map(x => x.n).join(', ')

  // 1 ── Anwendung, Version, Hersteller
  {
    const z: string[] = []
    if (st?.anwendungen.length) z.push(`Application(s) on this server per SKFM server list${st.stand ? ` (as of ${st.stand})` : ''}: ${st.anwendungen.map(x => `${x.titel}${x.alias ? ` (${x.alias})` : ''}${x.umgebung?.length ? ` [${x.umgebung.join('/')}]` : ''}`).join('; ')}`)
    if (a.anwendungen.length) z.push(`Installed application software (read from the server on ${am}):\n${punkte(mehr(a.anwendungen.map(swZeile), 25))}`)
    else z.push(`No application software with its own installer entry was found on the server (read on ${am}).`)
    if (a.datenbanken.length) z.push(`Database engine: ${a.datenbanken.join('; ')}`)
    const dienste = a.anwDienste.filter(d => /running/i.test(d.s))
    if (dienste.length) z.push(`Application services running (not part of Windows):\n${punkte(mehr(dienste.map(d => d.d || d.n), 15))}`)
    if (r.rollen.length) z.push(`Windows server roles: ${r.rollen.join(', ')}`)
    const rest = [a.laufzeiten.length && `${mz(a.laufzeiten.length, 'runtime/prerequisite package')} (question 4)`, a.agenten.length && `${mz(a.agenten.length, 'management/security agent')} (question 5)`, a.werkzeuge.length && mz(a.werkzeuge.length, 'general tool')].filter(Boolean)
    if (rest.length) z.push(`Not listed above: ${rest.join(', ')}.`)
    add(1, '', z.join('\n'), false, 'Bitte prüfen, welche Einträge die eigentliche Anwendung sind, und Überflüssiges streichen.')
  }

  // 2 ── Verantwortlich
  add(2, '', st?.zustaendig.length ? `${st.zustaendig.join('; ')}${st.stand ? ` (per SKFM server list, as of ${st.stand})` : ''}` : '', !st?.zustaendig.length,
    st?.zustaendig.length ? 'Aus der Serverliste übernommen – bitte prüfen und E-Mail-Adresse ergänzen.' : 'Ansprechpartner eintragen (Name und E-Mail). Der Server steht nicht in der Serverliste oder hat dort keinen Zuständigen.')

  // 3 ── Vom Hersteller unterstützt?
  {
    const z: string[] = ['Vendor statement not yet obtained. Facts for the vendor:']
    const f: string[] = [`Guest OS: ${osText(r)} (installed ${tag(r.system.installiert)})${/2019/.test(r.system.os) ? '' : ' — note: this is not Windows Server 2019'}`]
    if (anwName) f.push(`Application: ${anwName}${a.datenbanken.length ? `; database: ${a.datenbanken.join('; ')}` : ''}`)
    if (gast) f.push(`The application runs inside a Hyper-V guest VM${knoten ? ` (currently on host ${knoten})` : ''} and is installed only inside this VM; from inside the guest it sees the virtual hardware presented by Hyper-V, not the HCI host OS.`)
    z.push(punkte(f))
    add(3, 'Unknown', z.join('\n'), true, 'Herstelleraussage eintragen, falls bekannt (Yes/No). Das Tool liefert nur die Fakten, die der Hersteller dafür braucht.')
  }

  // 4 ── Besondere Anforderungen
  {
    const k: string[] = []
    const fw = dotnetFramework(r.dotnet.release, r.dotnet.version)
    if (r.sql.length) k.push(...r.sql.map(sqlText))
    if (r.dotnet.core.length) {
      const fam = new Map<string, string[]>()
      for (const c of r.dotnet.core) { const [f, v] = c.split(' '); fam.set(f, [...(fam.get(f) || []), v]) }
      k.push(`.NET runtimes: ${[...fam.entries()].map(([f, v]) => `${f.replace('Microsoft.', '').replace('.App', '')} ${v.join(', ')}`).join('; ')}`)
    }
    const javaReg = einmal(r.java.filter(j => j.q === 'registry').map(j => j.v)).filter(Boolean)
    const javaProz = r.java.filter(j => j.q === 'prozess')
    if (javaReg.length) k.push(`Java (installed): ${javaReg.join(', ')}`)
    if (javaProz.length) k.push(`Java (in use, bundled with the application): ${javaProz.map(j => `${j.v}${j.h ? ` ${j.h}` : ''} at ${j.o}`).join('; ')}`)
    if (iis) k.push('Windows role Web Server (IIS)')
    const vc = a.laufzeiten.filter(s => /Visual C\+\+/i.test(s.n))
    if (vc.length) k.push(`Microsoft Visual C++ runtimes: ${einmal(vc.map(s => (s.n.match(/20\d\d(-20\d\d)?/) || [''])[0]).filter(Boolean)).join(', ') || vc.length + ' packages'}`)
    const eigeneTreiber = a.treiber.filter(t => t.art === 'anwendung')
    if (eigeneTreiber.length) k.push(`${mz(eigeneTreiber.length, 'driver')} installed by the application (question 5)`)
    if (r.geraete.length) k.push(`Hardware devices attached to the ${gast ? 'VM' : 'server'}: ${r.geraete.map(g => `${g.n} (${g.h || g.k})`).join('; ')}`)
    const groesse = `${r.system.kerne} vCPU, ${r.system.ramGB} GB RAM, disks ${r.system.platten.map(p => `${p.n} ${p.g} GB`).join(', ') || 'n/a'}`
    const basis = [fw && `${fw} (part of Windows)`, `current sizing: ${groesse}`, gast ? `virtualization: Hyper-V guest (${r.system.modell}${r.system.integration ? `, integration services ${r.system.integration}` : ''})` : `hardware: ${r.system.hersteller} ${r.system.modell}`].filter(Boolean) as string[]
    if (k.length) add(4, 'Yes', `The installed application stack depends on these components (detected on the server on ${am}; the vendor's formal minimum requirements are not stored on the server):\n${punkte(k)}\nPlatform as found: ${basis.join('; ')}.`, false, 'Falls der Hersteller Mindestanforderungen nennt (z. B. Patch-Stand, CPU, RAM), hier ergänzen.')
    else add(4, 'No', `No special requirements detected: no additional runtime (Java, .NET runtime), no database engine, no application driver and no attached hardware device were found on the server (${am}). Platform as found: ${basis.join('; ')}.`, false, 'Falls der Hersteller Mindestanforderungen nennt (z. B. Patch-Stand, CPU, RAM), hier ergänzen.')
  }

  // 5 ── Treiber / Filter / Sicherheitssoftware
  {
    const eigene = a.treiber.filter(t => t.art === 'anwendung')
    const agent = a.treiber.filter(t => t.art === 'agent')
    const hw = a.treiber.filter(t => t.art === 'hardware')
    const sonst = a.treiber.filter(t => t.art === 'sonst')
    const z: string[] = []
    const geprueft = `${r.treiberGesamt} kernel/file-system drivers checked on ${am}: ${r.treiberMicrosoft} from Microsoft, ${a.treiberBeiliegend} third-party in-box drivers that ship with Windows, ${a.treiber.length} installed additionally`
    if (eigene.length) z.push(`The application installs ${mz(eigene.length, 'driver')}:\n${punkte(eigene.map(t => `${treiberZeile(t)}${t.zu ? ` → ${t.zu}` : ''}`))}`)
    else z.push(`The application does not install or use kernel-mode, filter, storage or network drivers of its own (${geprueft}).`)
    if (sonst.length) z.push(`Additionally installed drivers that could not be assigned to a product (please check):\n${punkte(mehr(sonst.map(treiberZeile), 10))}`)
    if (agent.length) z.push(`Server-wide security/management agents with drivers (not part of the application):\n${punkte(mehr(agent.map(treiberZeile), 10))}`)
    if (hw.length) z.push(`Hardware/virtual-device drivers installed additionally: ${mehr(hw.map(t => `${t.n} (${t.h})`), 8).join(', ')}`)
    if (r.filterFehlt) z.push('File-system filter list could not be read (insufficient rights for fltmc).')
    else z.push(a.filterFremd.length
      ? `File-system minifilters not from Microsoft: ${a.filterFremd.map(f => `${f.n} (altitude ${f.h}, ${f.klasse}${f.firma ? ', ' + f.firma : ''})`).join('; ')}; plus ${a.filterMicrosoft} Microsoft filters.`
      : `File-system minifilters: ${r.filter.length} loaded, all from Microsoft.`)
    if (r.bindungen.length) z.push(`Network filter/protocol bindings not from Microsoft: ${einmal(r.bindungen.map(b => `${b.d} (${b.k})`)).join('; ')}`)
    const sicher: string[] = []
    if (r.defender) sicher.push(`Microsoft Defender Antivirus (${r.defender.modus || 'mode unknown'}, real-time protection ${r.defender.echtzeit ? 'on' : 'off'})`)
    sicher.push(...einmal(a.agenten.map(s => s.n)))
    if (sicher.length) z.push(`Antivirus/security and management software on the server: ${mehr(sicher, 10).join('; ')}`)
    if (!eigene.length && sonst.length) add(5, 'Unknown', z.join('\n'), true, 'Es gibt nachinstallierte Treiber, die das Tool keinem Produkt zuordnen konnte. Bitte prüfen, ob sie zur Anwendung gehören, und Yes/No setzen.')
    else add(5, eigene.length ? 'Yes' : 'No', z.join('\n'))
  }

  // 6 ── Direkter Zugriff
  {
    const eigene = a.treiber.filter(t => t.art === 'anwendung')
    const vssFremd = r.vss.filter(v => !/Microsoft/i.test(v))
    const sicherung = a.agenten.filter(s => SICHERUNG.test(s.n))
    const cluster = r.merkmale.includes('Failover-Clustering') || r.dienste.some(d => /^ClusSvc$/i.test(d.n) && /running/i.test(d.s))
    const hyperv = r.merkmale.includes('Hyper-V') || r.dienste.some(d => /^vmms$/i.test(d.n))
    const systemKonto = a.anwDienste.filter(d => /LocalSystem/i.test(d.u))
    const z: string[] = []
    z.push(`Storage: ${[r.sql.length && 'database engine performs file I/O through the standard Windows storage stack (no storage driver of its own)', vssFremd.length && `third-party VSS provider: ${vssFremd.join(', ')}`, sicherung.length && `backup agent: ${sicherung.map(s => s.n).join(', ')}`, r.iscsi > 0 && `${mz(r.iscsi, 'iSCSI session')} from inside the VM`, eigene.some(t => /File System/i.test(t.a)) && 'application file-system driver (question 5)'].filter(Boolean).join('; ') || 'standard file access only; no VSS provider, iSCSI session or storage driver from the application'}`)
    z.push(`Network adapters: ${[r.bindungen.length && `third-party filter/protocol bound to the adapter: ${einmal(r.bindungen.map(b => b.d)).join(', ')}`, a.anwPorts.length && `application listens on TCP ${mehr(a.anwPorts.map(p => `${p.port} (${p.proc})`), 12).join(', ')}`].filter(Boolean).join('; ') || 'no filter or protocol driver from the application; no application listening port found'}`)
    z.push(`Clustering: ${cluster ? 'Failover Clustering is installed/active inside this VM' : 'none (Failover Clustering is not installed in the guest)'}`)
    z.push(`Hyper-V: ${hyperv ? 'the Hyper-V role is installed inside this VM' : gast ? 'only the standard guest integration services; the application does not address the hypervisor' : 'not installed'}`)
    z.push(`Hardware devices: ${r.geraete.length ? r.geraete.map(g => `${g.n} (${g.h || g.k})`).join('; ') : 'none attached (no USB dongle, serial or smart-card device present)'}`)
    z.push(`System services: ${a.anwDienste.length ? `${mz(a.anwDienste.length, 'application service')}${systemKonto.length ? `, ${systemKonto.length} of them running as LocalSystem (${mehr(systemKonto.map(d => d.d || d.n), 6).join(', ')})` : ', none running as LocalSystem'}` : 'the application registers no Windows services of its own'}`)
    const ja = eigene.length > 0 || vssFremd.length > 0 || cluster || hyperv || r.geraete.length > 0 || r.bindungen.length > 0 || r.iscsi > 0
    add(6, ja ? 'Yes' : 'No', `${ja ? 'See the marked points' : 'No direct or low-level interaction found; standard Windows interfaces only'} (checked on ${am}):\n${punkte(z)}`)
  }

  // 7 ── Kann einen Neustart auslösen?
  {
    const z: string[] = []
    const skripte = a.skripteGelesen + a.skripteNichtLesbar
    if (a.aufgabenMitNeustart.length) z.push(`Scheduled tasks that contain a shutdown/restart command:\n${unter(a.aufgabenMitNeustart.map(t => `${t.pf}${t.n} (${t.s}, runs as ${t.u || 'n/a'}${t.l ? `, last run ${minute(t.l)}` : ''}): ${einmal([...t.tok, ...t.sk.flatMap(s => s.tok.map(x => `${x} in ${s.p}`))]).join(', ')}`))}`)
    else z.push(`Scheduled tasks: none of the ${mz(r.aufgaben.length, 'non-Microsoft task')} calls a shutdown/restart command${skripte ? ` (${mz(a.skripteGelesen, 'referenced script')} inspected${a.skripteNichtLesbar ? `, ${a.skripteNichtLesbar} not readable` : ''})` : ''}.`)
    if (a.dienstNeustartAnwendung.length) z.push(`Services with the recovery action “Restart the computer”: ${a.dienstNeustartAnwendung.map(d => d.d || d.n).join(', ')}`)
    else z.push(`Service recovery: no application service uses the recovery action “Restart the computer”${a.dienstNeustartWindows ? ` (only ${a.dienstNeustartWindows} core Windows services, which is the Windows default)` : ''}.`)
    const g = (k: NeustartArt) => a.neustarts.filter(n => n.klasse === k)
    const fremd = [...g('anwendung'), ...g('skript')]
    if (a.neustarts.length) {
      const teile = [g('update').length && `${g('update').length} by Windows Update/servicing`, g('admin').length && `${g('admin').length} by an administrator`, g('fern').length && `${g('fern').length} through Windows remote management (WMI/RPC, e.g. patch tooling)`, g('host').length && `${g('host').length} requested by the Hyper-V host`, g('installer').length && `${g('installer').length} by an installer`, g('skript').length && `${g('skript').length} by a script/command line running as SYSTEM`, g('anwendung').length && `${g('anwendung').length} by a non-Windows process`].filter(Boolean)
      z.push(`Planned restarts/shutdowns in the System log since ${zeitraumAb(r)}: ${a.neustarts.length} — ${teile.join(', ')}.`)
      if (fremd.length) z.push(`Initiated by non-Windows processes or scripts:\n${unter(mehr(fremd.map(n => `${minute(n.t)} ${neustartProgramm(n.proz)} (${n.art || 'restart'}${n.grund ? `, reason: ${n.grund}` : ''})`), 8))}`)
    } else z.push(`Planned restarts/shutdowns: none recorded in the System log since ${zeitraumAb(r) || 'n/a'}.`)
    if (r.wu.richtlinie) z.push(`Windows Update is controlled by policy (${r.wu.wsus ? 'WSUS, ' : ''}AUOptions ${r.wu.auOptions}${r.wu.keinNeustartAngemeldet ? ', no automatic restart while users are logged on' : ''}).`)
    z.push('Not detectable from outside: restart calls compiled into application binaries.')
    const ja = a.aufgabenMitNeustart.length > 0 || a.dienstNeustartAnwendung.length > 0 || fremd.length > 0
    add(7, ja ? 'Yes' : 'No', `${ja ? 'A restart can be triggered by the items marked below' : 'Nothing was found that lets the application restart or shut down the OS'} (checked on ${am}):\n${punkte(z)}`, false,
      ja ? 'Bitte prüfen, ob die gefundenen Aufgaben/Skripte wirklich zur Anwendung gehören und ob der Neustart gewollt ist.' : undefined)
  }

  // 8 ── Änderungen rund um den Problembeginn
  {
    const bezug = ms(`${e.problemSeit}T00:00:00`)
    const von = bezug - 30 * TAG_MS, bis = bezug + 30 * TAG_MS
    const im = (t: number) => t >= von && t <= bis
    const swNeu = a.software.filter(s => { const d = ausJjjjmmtt(s.d); return d && im(ms(d + 'T12:00:00')) })
    const relevant = swNeu.filter(s => s.art === 'anwendung' || s.art === 'datenbank' || s.art === 'agent')
    const msi = r.msi.filter(m => im(ms(m.t)))
    const msiRel = msi.filter(m => ['anwendung', 'datenbank', 'agent'].includes(swArt({ n: m.n, h: '' })))
    const hf = r.hotfix.filter(h => h.d && im(ms(h.d + 'T12:00:00')))
    // nur echte Windows-Updates (mit KB-Nummer) — Store-Apps u. Ä. sind keine Patches
    const upd = r.updates.filter(u => im(ms(u.t)) && /KB\d{6,}/.test(u.n))
    const nd = r.neueDienste.filter(d => im(ms(d.t)))
    const deckt = ms(r.protokollAb.system) > 0 && ms(r.protokollAb.system) <= von
    const z: string[] = []
    z.push(relevant.length || msiRel.length
      ? `Application/agent software installed or updated:\n${unter(mehr(einmal([...relevant.map(s => `${ausJjjjmmtt(s.d)} ${swZeile(s)}`), ...msiRel.map(m => `${tag(m.t)} ${m.n} ${m.v} (${m.id === 1034 ? 'removed' : m.id === 1036 ? 'update' : 'installed'})`)]), 15))}`
      : 'Application/agent software installed or updated: none (by install date and installer events).')
    const patches = einmal([...hf.map(h => `${h.id} (${h.d})`), ...upd.map(u => `${u.n.match(/KB\d+/)?.[0] || u.n.slice(0, 60)} (${tag(u.t)})`)])
    z.push(`Windows updates (OS patching): ${patches.length ? mehr(patches, 10).join(', ') : 'none recorded'}`)
    z.push(`New services or drivers registered: ${nd.length ? mehr(einmal(nd.map(d => `${tag(d.t)} ${d.n}${d.datei ? ` (${d.datei})` : ''}`)), 8).join('; ') : deckt ? 'none' : 'not available for that period'}`)
    const andere = swNeu.filter(s => !relevant.includes(s))
    if (andere.length) z.push(`Other packages (runtimes, tools, Microsoft components): ${mehr(andere.map(s => `${s.n} (${ausJjjjmmtt(s.d)})`), 8).join('; ')}`)
    z.push(deckt ? `Coverage: event logs on this server go back to ${tag(r.protokollAb.system)}.`
      : `Coverage: the event logs on this server only go back to ${tag(r.protokollAb.system) || 'an unknown date'} (System) / ${tag(r.protokollAb.anwendung) || 'unknown'} (Application); for the earlier period only the install dates of software and updates are available.`)
    z.push('Configuration changes made without an installer are not recorded by Windows and are not covered.')
    // Änderungen kurz vor den Ausfällen DIESER VM
    const vorAusfall = r.unerwartet.map(u => {
      const t = ms(u.aus || u.start), ab = t - 14 * TAG_MS
      const l = einmal([...a.software.filter(s => { const d = ausJjjjmmtt(s.d); const x = d ? ms(d + 'T12:00:00') : 0; return x >= ab && x <= t && s.art !== 'system' }).map(s => `${s.n} (${ausJjjjmmtt(s.d)})`), ...r.hotfix.filter(h => { const x = h.d ? ms(h.d + 'T12:00:00') : 0; return x >= ab && x <= t }).map(h => `${h.id} (${h.d})`)])
      return l.length ? `${tag(u.aus || u.start)}: ${mehr(l, 6).join(', ')}` : ''
    }).filter(Boolean)
    if (vorAusfall.length) z.push(`Installed in the 14 days before an unexpected restart of this server:\n${unter(vorAusfall)}`)
    const ja = relevant.length > 0 || msiRel.length > 0
    add(8, ja ? 'Yes' : 'No', `${ja ? 'Changes were made' : 'No application changes found'} around the start of the issue (reference date ${e.problemSeit}, ±30 days; read on ${am}):\n${punkte(z)}`, false,
      'Bezugsdatum prüfen (Einstellung „Problem begann am“). Konfigurationsänderungen ohne Installation erkennt das Tool nicht – bitte von Hand ergänzen.')
  }

  // 9 ── Auffälligkeiten vor dem Ausfall
  {
    const befunde = r.unerwartet.map(ausfallBefund)
    const zeitraum = `${zeitraumAb(r) || `${r.tage} days back`} to ${am}`
    const hinweis = 'Das Tool liest nur die Windows-Ereignisanzeige (System, Anwendung). Hat die Anwendung eigene Logdateien, dort gegenprüfen.'
    const ding = gast ? 'VM' : 'server'
    if (!befunde.length) {
      add(9, 'No', `No unexpected shutdown or restart of this ${ding} is recorded in its System event log (${zeitraum}); there is therefore no “before the reboot” period to analyse on this server.${r.bugcheck.length ? '' : ' No bugcheck (blue screen) is recorded either.'}\nChecked: Windows System and Application event logs. Application-specific log files were not analysed.`, false, hinweis)
    } else {
      const mitFehler = befunde.filter(b => b.anwendung.length)
      const mitSpeicher = befunde.filter(b => b.speicher.length)
      const kopf = `${mz(befunde.length, 'unexpected stop')} of this ${ding} recorded (${zeitraum}); events in the ${r.vorMin} minutes before each stop:`
      const fazit = mitFehler.length
        ? `Application errors were logged before ${mitFehler.length} of ${befunde.length} stops (see above).`
        : `No application error, crash, hang or resource-exhaustion event was logged before any of these stops${mitSpeicher.length ? `; storage warnings/errors were logged before ${mitSpeicher.length} of them` : ''}.`
      add(9, mitFehler.length ? 'Yes' : 'No', `${kopf}\n${punkte(mehr(befunde.slice().reverse().map(ausfallSatz), 8))}\n${fazit}\nChecked: Windows System and Application event logs. Application-specific log files were not analysed.`, false, hinweis)
    }
  }

  // 10 ── Hersteller kennt ähnliche Fälle?
  add(10, 'Unknown', `No vendor notice about unexpected reboots is known to us for this application/OS combination; the vendor has not been asked specifically yet.${anwName ? ` Application: ${anwName}.` : ''} OS: ${osText(r)}.`, true,
    'Beim Hersteller nachfragen. Wenn sicher nichts bekannt ist, „No“ eintragen.')

  // 11 ── Bekannte Unverträglichkeiten
  add(11, '', `No compatibility issues are known to us with the current guest OS (${osText(r)}). A vendor statement for a planned Windows Server or cluster OS version has not been requested yet.`, true,
    'Falls ein Betriebssystem-Wechsel geplant ist oder der Hersteller Einschränkungen nennt, hier eintragen.')

  // 12 ── Weitere Abhängigkeiten / Risiken
  {
    const f: string[] = []   // Auffälliges
    const ok: string[] = []  // geprüft und unauffällig
    const eng = r.system.platten.filter(p => p.g > 0 && p.f / p.g < 0.1)
    if (eng.length) f.push(`Low disk space: ${eng.map(p => `${p.n} ${p.f} GB free of ${p.g} GB`).join(', ')}`)
    else if (r.system.platten.length) ok.push(`disk space (${r.system.platten.map(p => `${p.n} ${Math.round((p.f / Math.max(p.g, 0.1)) * 100)} % free`).join(', ')})`)
    const ramFrei = r.system.ramGB ? r.system.ramFreiGB / r.system.ramGB : 1
    const commitFrei = r.system.commitGB ? r.system.commitFreiGB / r.system.commitGB : 1
    if (ramFrei < 0.08 || commitFrei < 0.1) f.push(`Memory pressure at the time of the check: ${r.system.ramFreiGB} GB of ${r.system.ramGB} GB RAM free, ${r.system.commitFreiGB} GB of ${r.system.commitGB} GB commit limit free`)
    else ok.push(`memory (${r.system.ramFreiGB} of ${r.system.ramGB} GB RAM free)`)
    if (r.ressourcen.length) f.push(`Windows reported resource exhaustion ${mz(r.ressourcen.length, 'time')} (last ${minute(r.ressourcen[0].t)}): “${r.ressourcen[0].m.slice(0, 140)}”`)
    else ok.push('no resource-exhaustion events')
    // Beobachtungen an der Plattform: nicht der Anwendung zuzuschreiben, aber für die Cluster-Analyse wichtig
    const plattform: string[] = []
    if (r.whea.length) plattform.push(`hardware error events (WHEA) inside the ${gast ? 'VM' : 'server'}: ${r.whea.length} (last ${minute(r.whea[0].t)})`)
    if (r.speicherEreignisse.length) plattform.push(`storage warnings/errors in the System log: ${mehr(r.speicherEreignisse.map(s => `${s.q} ${s.id} ×${s.n} (last ${tag(s.l)})`), 6).join('; ')}`)
    else ok.push('no storage warnings or errors in the System log')
    const abbilder = [r.system.abbild.voll && `MEMORY.DMP from ${minute(r.system.abbild.voll)}`, r.system.abbild.klein.length && `${mz(r.system.abbild.klein.length, 'minidump')} (latest ${minute(r.system.abbild.klein[0])})`].filter(Boolean)
    if (abbilder.length || r.bugcheck.length) plattform.push(`crash dumps of the OS exist: ${[...abbilder, r.bugcheck.length && `${mz(r.bugcheck.length, 'bugcheck event')} (last ${minute(r.bugcheck[0].t)})`].filter(Boolean).join(', ')}`)
    else ok.push('no crash dumps or bugcheck events of the OS')
    const abst = r.abstuerze.filter(x => x.n >= 3)
    if (abst.length) f.push(`Repeated application crashes/hangs (${r.tage} days): ${mehr(abst.map(x => `${x.app} ×${x.n} (${x.art}${x.modul ? ', ' + x.modul : ''}, last ${tag(x.l)})`), 6).join('; ')}`)
    else ok.push('no repeated application crashes')
    if (r.griffe.length) f.push(`Processes with an unusually high handle count: ${r.griffe.map(p => `${p.n} (${p.hd} handles)`).join(', ')}`)
    if (r.system.neustartAusstehend) f.push('A restart is pending on the server (updates installed, not yet restarted).')
    const abh: string[] = []
    if (r.sql.length) abh.push('local SQL Server instance')
    if (a.agentDienste.length) abh.push(`${mz(einmal(a.agentDienste.map(d => d.d || d.n)).length, 'management/security agent service')} running in the VM`)
    if (r.geraete.length) abh.push('attached hardware device (see question 6)')
    const z = [
      f.length ? `Findings on the application side:\n${punkte(f)}` : '',
      plattform.length ? `Observations on the platform (not attributable to the application, listed for the cluster analysis):\n${punkte(plattform)}` : '',
      ok.length ? `Checked and unremarkable: ${ok.join('; ')}.` : '',
      abh.length ? `Dependencies inside the ${gast ? 'VM' : 'server'}: ${abh.join('; ')}.` : '',
      'External dependencies (other servers, interfaces, licence servers) cannot be read from the server and are not covered.',
    ].filter(Boolean)
    add(12, f.length ? 'Yes' : 'No', `${f.length ? 'The following points should be looked at' : 'No additional application-side risks found on the server'} (read on ${am}):\n${z.join('\n')}`, false,
      'Bekannte Abhängigkeiten zu anderen Systemen (Schnittstellen, Lizenzserver, Datenbanken auf anderen Servern) von Hand ergänzen.')
  }

  return aus.sort((x, y) => x.nr - y.nr)
}

/** Endgültiger Text einer Antwort: eigene Fassung, sonst der Vorschlag. */
export const endText = (vorschlag: HciAntwort, eigene: Record<string, string> | undefined) => {
  const e = eigene?.[String(vorschlag.nr)]
  return e !== undefined ? e : vorschlag.text
}
