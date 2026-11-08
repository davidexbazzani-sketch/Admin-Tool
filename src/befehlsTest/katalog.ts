// ── Befehls-Test: Katalog aller Befehle mit Phase, Testwert und Sperren ───────
// Grundsätze (Nutzer: „erst die harmlosen, am Ende die kritischen und die mit Neustart
// ganz am Ende, damit die Tests weitgehend alleine durchlaufen können“):
//   · Reihenfolge: lesend → ändernd → kritisch → Netz kurz weg → abmelden → Neustart → aus
//   · Testwerte zeigen auf eigene Testobjekte (Ordner C:\ITAdminToolTest, Aufgabe, Konto
//     „ITAdminTest“, WLAN-Profil …), die die Vorbereitung anlegt und das Aufräumen entfernt.
//   · NIE automatisch: was über den Test-PC hinaus wirkt (AD, Entra ID), Datenträger
//     umbaut, Passwörter im Klartext ablegt, Ereignisprotokolle löscht (Sicherheitsalarm),
//     BIOS/Firmware einspielen kann oder nur ein Fenster auf DEINEM PC öffnet.
// Rein (ohne Electron) — testbar in .tmp-test/bt_katalog_test.ts.

import type { BtEintrag, BtNachher, BtPhase, BtRisiko } from './types'

/** Minimale Form der Bausteine (src/problemAssistent/motor.ts → PaAktion). */
export interface BtBaustein {
  id: string; titel: string; modus: string; risiko: BtRisiko; timeoutMs?: number; trenntVerbindung?: boolean
  param?: { label: string; platzhalter: string; pflicht?: boolean; optionen?: string[]; vorlagen?: string[] }
}
/** Minimale Form der Remote-Doc-Befehle (src/utils/remoteCommands.ts → CmdDef/Category). */
export interface BtRdBefehl {
  id: string; func: string; action: 'read' | 'write' | 'critical'; local?: boolean; longRunning?: boolean; privacyConsent?: boolean; fileAction?: string
  input?: { type: string; placeholder?: string; options?: string[]; examples?: string[] }
  templates?: { label: string; value: string }[]
}
export interface BtRdKategorie { id: string; label: string; commands: BtRdBefehl[] }

// ── Testobjekte (Vorbereitung legt sie an, Aufräumen entfernt sie) ───────────
export const TEST_ORDNER = 'C:\\ITAdminToolTest'
export const TEST_KONTO = 'ITAdminTest'
export const TEST_AUFGABE = 'ITAdminToolTest'
export const TEST_WLAN = 'ITAdminToolTest'
export const TEST_WLAN2 = 'ITAdminToolTest2'
export const TEST_VAR = 'ITADMINTOOL_TEST'
export const TEST_LW = 'X'

// ── Sperrgründe ──────────────────────────────────────────────────────────────
const S = {
  ad: 'Ändert das Computerkonto im Active Directory (Server) — im Test nie.',
  entra: 'Trennt den PC von Entra ID/Intune (Cloud-Gerätekonto) — danach fehlen Anmeldung und Richtlinien. Im Test nie.',
  disk: 'Baut Datenträger/Partitionen um — ohne eigenen Testdatenträger droht Datenverlust.',
  log: 'Löschen von Ereignisprotokollen gilt als Angriffsmuster und kann einen Sicherheitsalarm auslösen; außerdem gingen die Protokolle des Testlaufs verloren.',
  autologon: 'Legt ein Passwort im Klartext in der Registry ab und meldet den PC automatisch an.',
  firmware: 'Kann über Windows Update auch BIOS/Firmware einspielen (Grundsatz: kein automatisches BIOS).',
  setup: 'Braucht eine Setup-Datei, die du im Dialog auswählst — im Testlauf nicht sinnvoll.',
  gui: 'Öffnet nur ein Fenster bzw. spielt einen Ton auf DEINEM PC — testet nicht den Test-PC.',
  einwilligung: 'Bildschirmfoto braucht die Einwilligung des angemeldeten Benutzers im Dialog.',
}

interface Test {
  wert?: string
  fehlt?: string
  sperre?: string
  phase?: BtPhase
  prio?: number
  nachher?: BtNachher
  geheim?: boolean
  timeoutMs?: number
}

// ── Remote Doc: Testwerte und Sonderfälle je Befehls-ID ──────────────────────
const RD: Record<string, Test> = {
  // Netzwerk
  nslookup: { wert: 'login.microsoftonline.com' },
  adapter_toggle: { wert: '{adapter}|Enable' },             // nur EINschalten — Ausschalten würde den PC vom Netz nehmen
  testport: { wert: 'login.microsoftonline.com:443' },
  ipreset: { phase: 'trennt', nachher: 'trennt' },
  winsock: { phase: 'trennt', nachher: 'trennt' },
  tcpreset: { phase: 'trennt', nachher: 'trennt' },
  netreset: { phase: 'trennt', nachher: 'trennt' },
  // Updates
  hotfixid: { wert: 'KB5034441' },
  // Reparatur / Protokolle
  evtclear: { sperre: S.log },
  'log-clear': { sperre: S.log },
  'log-timerange': { wert: '24' },
  'log-source': { wert: 'Microsoft-Windows-Kernel-General' },
  'log-id': { wert: '6005' },
  // Prozesse & Dienste (Editor wird zuerst gestartet, dann auf alle Arten beendet)
  runexeuser: { wert: 'C:\\Windows\\System32\\notepad.exe', prio: 10 },
  killpid: { wert: '{pidNotepad}', prio: 11 },
  apprestartuser: { wert: 'notepad', prio: 12 },
  killname: { wert: 'notepad', prio: 13 },
  'svc-stop': { wert: 'Spooler', prio: 20 },
  'svc-start': { wert: 'Spooler', prio: 21 },
  'svc-restart': { wert: 'Spooler', prio: 22 },
  // Sitzungen
  logoff: { wert: '{sitzung}', phase: 'abmelden' },
  msg: { wert: 'Testlauf IT Admin Tool – bitte ignorieren.' },
  // Software
  swuninstall: { fehlt: 'Name eines Programms, das auf dem Test-PC deinstalliert werden darf' },
  removeapp: { fehlt: 'Name einer Store-App, die auf dem Test-PC entfernt werden darf' },
  wingetinstall: { fehlt: 'Winget-Paket-ID, die auf dem Test-PC installiert werden darf' },
  wingsearch: { wert: 'Firefox' },
  fileinstall: { sperre: S.setup },
  driverinf: { sperre: S.setup },
  driverupdateall: { sperre: S.firmware },
  // Drucker (Testdrucker aus den Optionen; Reihenfolge: verbinden → … → wieder entfernen)
  printjobs: { wert: '' },
  clearjobs: { wert: '{drucker}', prio: 64 },
  deljob: { wert: '{drucker}|999999' },
  removeprinter: { wert: '{drucker}', prio: 65 },
  addprinter: { wert: '\\\\w3149\\{drucker}', prio: 66 },
  // Datenträger
  partshrink: { sperre: S.disk }, partgrow: { sperre: S.disk }, newvol: { sperre: S.disk },
  diskinit: { sperre: S.disk }, changeletter: { sperre: S.disk },
  chkdskrun: { wert: 'C' }, trimssd: { wert: 'C' }, defraghdd: { wert: 'C' },
  top10big: { wert: 'C:\\Windows\\Logs' },
  // Neustart & Herunterfahren (ganz am Ende)
  rebootcount: { wert: '120|Testlauf IT Admin Tool – dieser Neustart wird gleich wieder abgebrochen.', phase: 'neustart', prio: 1 },
  shutdownabort: { phase: 'neustart', prio: 2, nachher: 'kein-neustart' },
  rebootnow: { phase: 'neustart', prio: 3, nachher: 'neustart' },
  rebootforce: { phase: 'neustart', prio: 4, nachher: 'neustart' },
  'netreset-restart': { phase: 'neustart', prio: 5, nachher: 'neustart' },
  shutdown: { phase: 'aus', nachher: 'aus' },
  // Sicherheit
  defexcadd: { wert: TEST_ORDNER + '\\Ausnahme', prio: 42 },
  defexcrem: { wert: TEST_ORDNER + '\\Ausnahme', prio: 43 },
  bitlockerkey: { geheim: true },
  actkey: { geheim: true },
  // Freigaben
  closesmb: { wert: '999999' },
  // Aufgaben (Vorbereitung legt „ITAdminToolTest“ an)
  rtaskcreate: { wert: TEST_AUFGABE + '2|C:\\Windows\\System32\\whoami.exe|23:59', prio: 40 },
  rtaskrun: { wert: TEST_AUFGABE, prio: 41 },
  taskstart: { wert: TEST_AUFGABE, prio: 41 },
  taskstop: { wert: TEST_AUFGABE, prio: 42 },
  taskdisable: { wert: TEST_AUFGABE, prio: 43 },
  rtaskdisable: { wert: TEST_AUFGABE, prio: 44 },
  rtaskenable: { wert: TEST_AUFGABE, prio: 45 },
  rtaskdetail: { wert: TEST_AUFGABE },
  rtaskdelete: { wert: TEST_AUFGABE + '2' },
  // RDP (Zustand wird am Ende wiederhergestellt)
  rdpopen: { sperre: S.gui }, msra: { sperre: S.gui },
  rdpoff: { prio: 48 }, rdpon: { prio: 49 },
  // Domäne
  resetpwd: { sperre: S.ad },
  aadleave: { sperre: S.entra },
  // WLAN (Vorbereitung legt zwei Test-Profile an)
  wlandardel: { wert: TEST_WLAN2 },
  wlanpwd: { wert: TEST_WLAN, geheim: true },
  // Bildschirmfoto, Dateien
  screencap: { sperre: S.einwilligung },
  copyfiles: { wert: '{testdatei}' },
  opentemp: { sperre: S.gui },
  // Netzlaufwerk (Testbuchstabe X)
  mapdriveadd: { wert: TEST_LW + '|\\\\w3172\\skf Marine', prio: 56 },
  mapdriverem: { wert: TEST_LW, prio: 57 },
  // Energie (Zustand wird am Ende wiederhergestellt)
  wol: { wert: 'AA:BB:CC:DD:EE:FF' },
  monitortime: { wert: '15' }, standbytime: { wert: '30' }, locktime: { wert: '10' },
  powerhigh: { prio: 50 }, powerbal: { prio: 51 },
  // Cache & Apps
  outlookrepair: { wert: '/resetnavpane' },
  credclear: { wert: 'Office' },
  // enaio
  enaioserver: { fehlt: 'Hostname des enaio-Servers' },
  // Umgebungsvariablen (eigene Testvariable)
  'env-single': { wert: 'PATH' },
  'env-set-system': { wert: TEST_VAR + '=1', prio: 46 },
  'env-set-user': { wert: TEST_VAR + '=1', prio: 46 },
  'env-path-add': { wert: TEST_ORDNER + '\\bin', prio: 46 },
  'env-path-remove': { wert: TEST_ORDNER + '\\bin' },
  'env-delete-system': { wert: TEST_VAR },
  'env-delete-user': { wert: TEST_VAR },
  // Geräte
  devdisable: { fehlt: 'InstanceId eines Geräts, das auf dem Test-PC kurz abgeschaltet werden darf' },
  devenable: { fehlt: 'InstanceId eines Testgeräts' },
  devrestart: { fehlt: 'InstanceId eines Testgeräts' },
  devuninstall: { fehlt: 'InstanceId eines Geräts, das deinstalliert werden darf' },
  devunknown: { fehlt: 'InstanceId eines unbekannten Geräts' },
  drvdelete: { fehlt: 'OEM-INF eines Treibers, der entfernt werden darf (z. B. oem42.inf)' },
  devclass: { wert: 'Camera' },
  // Systemeinstellungen (Zustand wird am Ende wiederhergestellt)
  uacset: { wert: '5 - Secure Desktop' },
  timeset: { wert: '{jetzt}' },
  tzset: { wert: '{zeitzone}' },
  ntpset: { wert: 'time.windows.com' },
  proxyset: { wert: 'proxy.itadmintool-test.invalid:8080', prio: 44 },
  proxyclear: { prio: 45 },
  // Töne
  'melodie-lokal': { sperre: S.gui }, 'beep-lokal': { sperre: S.gui },
  'melodie-remote': { wert: 'tod' }, 'beep-remote': { wert: '300|400' },
  // Audio & Anzeige
  volset: { wert: '30' }, volmute: { wert: 'an' }, brightset: { wert: '80' }, nightmode: { wert: 'aus' },
  displayswitch: { wert: 'Erweitern' },
  audiodisable: { wert: 'Display Audio', prio: 52 },
  audioenable: { wert: 'Display Audio', prio: 53 },
  audiovolume: { wert: 'Speaker=30' }, audiomute: { wert: 'Speaker=aus' },
  // Dateien (alles im Testordner)
  openexplorer: { sperre: S.gui }, openexplorerpath: { sperre: S.gui },
  dirlist: { wert: TEST_ORDNER },
  filedetail: { wert: 'C:\\Windows\\win.ini' },
  filecopyto: { wert: '{testdatei}' },
  filecopyfrom: { wert: TEST_ORDNER + '\\ITAdminTool-Testlauf.txt' },
  mkdir: { wert: TEST_ORDNER + '\\Neu', prio: 30 },
  filerename: { wert: TEST_ORDNER + '\\umbenennen.txt|umbenannt.txt', prio: 31 },
  filemove: { wert: TEST_ORDNER + '\\verschieben.txt|' + TEST_ORDNER + '\\Neu\\verschieben.txt', prio: 32 },
  filedelete: { wert: TEST_ORDNER + '\\loeschen.txt' },
  rmdir: { wert: TEST_ORDNER + '\\Neu' },
  runexesystem: { wert: 'C:\\Windows\\System32\\whoami.exe' },
  runbat: { wert: TEST_ORDNER + '\\test.cmd' },
  runps: { wert: TEST_ORDNER + '\\test.ps1' },
  aclshow: { wert: TEST_ORDNER },
  hostsadd: { wert: '127.0.0.1 itadmintool-test.invalid', prio: 47 },
  sharecreate: { wert: 'ITAdminToolTest$|' + TEST_ORDNER },
  // Benutzer & Gruppen (eigenes Testkonto; Passwort wird zur Laufzeit erzeugt und nie gespeichert)
  adduserbyid: { fehlt: 'Domänen-Benutzer, der testweise in eine lokale Gruppe darf' },
  useradd: { wert: '{testkonto}', prio: 35, geheim: true },
  userpwset: { wert: '{testkonto}', prio: 36, geheim: true },
  usergroupadd: { wert: TEST_KONTO + '|{gruppeBenutzer}', prio: 37 },
  usergrouprem: { wert: TEST_KONTO + '|{gruppeBenutzer}', prio: 38 },
  userdel: { wert: TEST_KONTO },
  autologon: { sperre: S.autologon },
  profiledel: { wert: TEST_KONTO },
  // Wiederherstellung, Registry
  restcreate: { wert: 'Testlauf IT Admin Tool' },
  regread: { wert: 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion | ProductName' },
  regwrite: { wert: 'HKLM:\\SOFTWARE\\ITAdminToolTest | Test | 1' },
  regeditlocal: { sperre: S.gui },
}

// ── Lösungsbausteine: Testwerte, wo der automatische Wert ungeeignet wäre ─────
const PA: Record<string, Test> = {
  'neustart-countdown': { wert: '1', phase: 'neustart', prio: 6, nachher: 'neustart' },
  'wlan-profil-loeschen': { wert: TEST_WLAN },
  'netz-wlan-zufalls-mac-aus': { wert: TEST_WLAN },
  'lw-verbinden': { wert: TEST_LW + ': \\\\w3172\\skf Marine', prio: 54 },
  'lw-trennen': { wert: TEST_LW, prio: 55 },
  'lw-anmeldedaten-loeschen': { wert: 'itadmintool-test.invalid' },
  'dr-verbinden': { wert: '{drucker}', prio: 60, phase: 'aendern' },   // eigentlich „lang“ (3 min) — muss aber vor dem Entfernen laufen
  'dr-standard': { wert: '{drucker}', prio: 61 },
  'dr-offline-fortsetzen': { wert: '{drucker}', prio: 62 },
  'dr-testseite': { wert: '{drucker}', prio: 63 },
  'dr-entfernen': { wert: '{drucker}', prio: 67 },
  'dr-auftraege-loeschen': { wert: '{drucker}' },
  'druck-details': { wert: '{drucker}' },
  'druck-eigenschaft': { wert: 'Erweiterte Druckfunktionen an|{drucker}' },
  'office-addin-aus': { wert: 'Excel: ITAdminTool.Test' },
  'prozess-beenden': { wert: 'notepad', prio: 14 },
  'dienst-neustart': { wert: 'Spooler' },
  'software-suchen': { wert: 'Adobe' },
  'geraet-neustart': { wert: 'Kamera' },
  'geraet-aktivieren': { wert: 'Kamera' },
  'intranetzone-server': { wert: 'w3172' },
  'update-deinstallieren': { wert: 'KB0000001' },
  'autostart-entfernen': { wert: 'ITAdminToolTest' },
  'konto-sitzung-abmelden': { wert: 'itadmintest-keiner' },
  'od-speicher-freigeben': { wert: 'ITAdminToolTest' },
  'od-immer-behalten': { wert: 'ITAdminToolTest' },
  'edge-hsts-loeschen': { wert: 'itadmintool-test.invalid' },
  'zg-datei-gesperrt-wer': { wert: TEST_ORDNER + '\\test.txt' },
  'zg-lw-vorgaengerversionen': { wert: TEST_ORDNER + '\\test.txt' },
  'zg-lw-version-holen': { wert: TEST_ORDNER + '\\test.txt' },
  'hw-bt-kopplung-entfernen': { wert: 'ITAdminToolTest' },
  'hw4-geraet-neu-erkennen': { wert: 'ITAdminToolTest' },
  'hw4-geraet-deaktivieren': { wert: 'ITAdminToolTest' },
  'hw4-com-port-setzen': { wert: 'COM97 > COM98' },
  'netz4-route-entfernen': { wert: '10.254.254.0/24' },
  'olmail-kopfzeilen': { wert: 'ITAdminToolTest' },
  'excel-addin-austragen': { wert: 'ITAdminToolTest.xlam' },
  'lw4-pfad-zugriff': { wert: TEST_ORDNER },
  'lw4-namen-pruefen': { wert: TEST_ORDNER },
  'lw4-dateien-freigeben': { wert: TEST_ORDNER + ' | Markierung' },
  'lw4-datei-finden': { wert: 'test | ' + TEST_ORDNER },
  'lw4-verknuepfung-anlegen': { wert: TEST_ORDNER + ' | Desktop' },
  'konto4-datei-pruefen': { wert: TEST_ORDNER + '\\test.txt' },
  'konto4-datei-entsperren': { wert: 'Desktop\\ITAdminToolTest.pdf' },
}

const LANG_AB = 120_000

/** Erstes Beispiel aus „z. B. X, Y“ bzw. „(z.B. X)“. */
export function beispielAus(platzhalter?: string): string {
  const m = /z\.\s?B\.?\s*([^,()|]+?)(?:\s+oder\s|\s*[,)|]|$)/i.exec(platzhalter || '')
  return m ? m[1].trim().replace(/^["„“]|["„“]$/g, '') : ''
}

function sortiere(liste: BtEintrag[]): BtEintrag[] {
  const ord = new Map<BtPhase, number>([['lesen', 0], ['lesen-lang', 1], ['aendern', 2], ['aendern-lang', 3], ['kritisch', 4], ['trennt', 5], ['abmelden', 6], ['neustart', 7], ['aus', 8]])
  return liste.map((e, i) => ({ e, i })).sort((a, b) => (ord.get(a.e.phase)! - ord.get(b.e.phase)!) || (a.e.prio - b.e.prio) || (a.i - b.i)).map(x => x.e)
}

function phaseFuer(risiko: BtRisiko, lang: boolean): BtPhase {
  if (risiko === 'lesen') return lang ? 'lesen-lang' : 'lesen'
  if (risiko === 'aendern') return lang ? 'aendern-lang' : 'aendern'
  return 'kritisch'
}

export function bausteinEintraege(aktionen: BtBaustein[]): BtEintrag[] {
  return aktionen.map(a => {
    const t = PA[a.id] || {}
    const timeoutMs = (a.timeoutMs ?? 60_000) + 30_000
    let phase = t.phase || phaseFuer(a.risiko, (a.timeoutMs ?? 60_000) > LANG_AB)
    let nachher = t.nachher
    if (a.trenntVerbindung && !t.phase) { phase = 'trennt'; nachher = nachher || 'trennt' }
    const e: BtEintrag = {
      key: 'pa:' + a.id, quelle: 'baustein', id: a.id, titel: a.titel, gruppe: 'Lösungsbaustein',
      risiko: a.risiko, phase, prio: t.prio ?? 50, art: a.modus, timeoutMs, nachher, geheim: t.geheim,
    }
    const p = a.param
    if (p) {
      e.paramLabel = p.label
      if (t.wert !== undefined) { e.wert = t.wert; e.herkunft = 'fest' }
      else if (p.optionen?.length) { e.wert = p.optionen[0]; e.herkunft = 'auto' }
      else if (p.vorlagen?.length) { e.wert = p.vorlagen[0]; e.herkunft = 'auto' }
      else if (a.risiko !== 'kritisch' && beispielAus(p.platzhalter)) { e.wert = beispielAus(p.platzhalter); e.herkunft = 'auto' }
      else if (!p.pflicht) { e.wert = ''; e.herkunft = 'leer' }
      else e.fehlt = t.fehlt || `Testwert für „${p.label}“`
    }
    return e
  })
}

/** Eindeutige Schlüssel der Remote-Doc-Befehle (Kategorie-IDs kommen doppelt vor). */
export function rdSchluessel<K extends BtRdKategorie>(kategorien: K[]): { key: string; k: K; c: K['commands'][number] }[] {
  const out: { key: string; k: K; c: K['commands'][number] }[] = []
  const gesehen = new Set<string>()
  for (const k of kategorien) {
    for (const c of k.commands) {
      let key = `rd:${k.id}:${c.id}`
      for (let n = 2; gesehen.has(key); n++) key = `rd:${k.id}:${c.id}#${n}`
      gesehen.add(key)
      out.push({ key, k, c })
    }
  }
  return out
}

export function remoteDocEintraege(kategorien: BtRdKategorie[]): BtEintrag[] {
  const out: BtEintrag[] = []
  {
    for (const { key, k, c } of rdSchluessel(kategorien)) {
      const t = RD[c.id] || {}
      const risiko: BtRisiko = c.action === 'read' ? 'lesen' : c.action === 'write' ? 'aendern' : 'kritisch'
      const lang = !!c.longRunning
      const e: BtEintrag = {
        key, quelle: 'remotedoc', id: c.id, titel: c.func, gruppe: 'Remote Doc · ' + k.label,
        risiko, phase: t.phase || phaseFuer(risiko, lang), prio: t.prio ?? 50, art: c.local ? 'admin-pc' : 'fern',
        timeoutMs: t.timeoutMs ?? (lang ? 2 * 3600_000 : c.action === 'read' ? 120_000 : 300_000),
        nachher: t.nachher, geheim: t.geheim,
      }
      if (t.sperre) e.sperre = t.sperre
      else if (c.privacyConsent) e.sperre = S.einwilligung
      else if (c.fileAction === 'install') e.sperre = S.setup
      if (c.input) {
        e.paramLabel = c.input.placeholder || c.input.type
        const vorlage = (c.templates || []).map(x => x.value).find(v => v)
        if (t.wert !== undefined) { e.wert = t.wert; e.herkunft = 'fest' }
        else if (t.fehlt) e.fehlt = t.fehlt
        else if (c.input.options?.length) { e.wert = c.input.options[0]; e.herkunft = 'auto' }
        else if (risiko !== 'kritisch' && vorlage) { e.wert = vorlage; e.herkunft = 'auto' }
        else if (risiko !== 'kritisch' && c.input.examples?.length) { e.wert = c.input.examples[0]; e.herkunft = 'auto' }
        else if (risiko !== 'kritisch' && beispielAus(c.input.placeholder)) { e.wert = beispielAus(c.input.placeholder); e.herkunft = 'auto' }
        else e.fehlt = `Testwert für „${e.paramLabel}“`
      } else if (t.wert !== undefined) { e.wert = t.wert; e.herkunft = 'fest' }
      out.push(e)
    }
  }
  return out
}

/** Alle Einträge in Ausführungsreihenfolge. Eigene Testwerte (Schlüssel → Wert) haben Vorrang. */
export function baueKatalog(aktionen: BtBaustein[], kategorien: BtRdKategorie[] | null, eigene: Record<string, string> = {}): BtEintrag[] {
  const alle = [...bausteinEintraege(aktionen), ...(kategorien ? remoteDocEintraege(kategorien) : [])]
  for (const e of alle) {
    const w = eigene[e.key]
    if (w !== undefined && w.trim() !== '' && !e.sperre) { e.wert = w.trim(); e.herkunft = 'eigen'; delete e.fehlt }
  }
  return sortiere(alle)
}

/** Platzhalter, die ein Testwert enthalten kann. */
export const PLATZHALTER = ['drucker', 'testdatei', 'jetzt', 'zeitzone', 'sitzung', 'pidNotepad', 'adapter', 'gruppeBenutzer', 'testkonto'] as const
export type BtPlatzhalter = typeof PLATZHALTER[number]

/** Setzt Platzhalter ein. Fehlt ein Wert → null (Befehl wird mit Grund übersprungen). */
export function setzeEin(wert: string, werte: Partial<Record<BtPlatzhalter, string>>): { text: string } | { fehlt: BtPlatzhalter } {
  let fehlt: BtPlatzhalter | null = null
  const text = wert.replace(/\{(\w+)\}/g, (m, n: string) => {
    if (!(PLATZHALTER as readonly string[]).includes(n)) return m
    const v = werte[n as BtPlatzhalter]
    if (!v) { fehlt = fehlt || (n as BtPlatzhalter); return m }
    return v
  })
  return fehlt ? { fehlt } : { text }
}

export function platzhalterIn(wert?: string): BtPlatzhalter[] {
  return [...(wert || '').matchAll(/\{(\w+)\}/g)].map(m => m[1]).filter(n => (PLATZHALTER as readonly string[]).includes(n)) as BtPlatzhalter[]
}

export const PLATZHALTER_TEXT: Record<BtPlatzhalter, string> = {
  drucker: 'Testdrucker (in den Optionen eintragen)',
  testdatei: 'Testdatei auf deinem PC',
  jetzt: 'aktuelle Uhrzeit des Test-PCs',
  zeitzone: 'aktuelle Zeitzone des Test-PCs',
  sitzung: 'Sitzungs-ID des angemeldeten Benutzers',
  pidNotepad: 'Prozess-ID des gestarteten Editors',
  adapter: 'Name des aktiven Netzwerkadapters',
  gruppeBenutzer: 'Name der lokalen Gruppe „Benutzer“',
  testkonto: 'Testkonto mit zufälligem Passwort',
}

// ── Auswertung ───────────────────────────────────────────────────────────────

/** „Trifft nicht zu“: Programm/Gerät/Objekt fehlt auf dem Test-PC — der Befehl selbst lief. */
const NA = /nicht (installiert|vorhanden|gefunden|eingerichtet|verbunden|angeschlossen|aktiviert|konfiguriert|zutreffend)|kein(e|en|er)?\s[^.]{0,60}?(gefunden|vorhanden|installiert|eingerichtet|verbunden|hinterlegt|angeschlossen|gespeichert)|wurde nicht gefunden|existiert nicht|gibt es (hier )?nicht|trifft .{0,30}nicht zu|nichts zu tun|not (be )?found|cannot find|could not find|does not exist|no (matching )?\w+( \w+)? (was |were )?found|no msft_\w+ objects found|kein akku|ohne akku|kein wlan/i

/** Verbindungsabbruch (WinRM). */
const WEG = /WinRM cannot complete|WinRM kann den Vorgang nicht|connecting to remote server .* failed|Verbindung mit dem Remoteserver .* fehlgeschlagen|The WS-Management service cannot process|the client cannot connect|server name cannot be resolved|Der Servername kann nicht aufgelöst|Der WinRM-Client kann/i

export function istNa(text: string): boolean { return NA.test(text || '') }
export function istVerbindungWeg(text: string): boolean { return WEG.test(text || '') }

/** Geheimnisse aus Ausgaben entfernen (BitLocker-Schlüssel, WLAN-Schlüssel, Produktschlüssel, Passwörter). */
export function schwaerze(s: string): string {
  return (s || '')
    .replace(/\b\d{6}(?:-\d{6}){7}\b/g, '[BitLocker-Schlüssel entfernt]')
    .replace(/\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}\b/g, '[Produktschlüssel entfernt]')
    .replace(/((?:Key Content|Schlüsselinhalt|Kennwort|Passwort|Password|pwd|DefaultPassword)\s*[:=]\s*)\S.*$/gim, '$1[entfernt]')
}

/** Parameter für Anzeige/Speicherung: Passwörter (Teil nach „|“ bei Testkonto) nie zeigen. */
export function paramAnzeige(e: BtEintrag, eingesetzt: string): string {
  if (e.geheim && eingesetzt.includes('|')) return eingesetzt.split('|')[0] + '|••••••'
  return schwaerze(eingesetzt)
}
