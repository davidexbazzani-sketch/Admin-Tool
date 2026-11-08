// ── Problem-Assistent: intelligente Suche + Erkennung (rein, ohne UI — testbar) ──
// Führt von einer freien Eingabe („laufw“, „teams spinnt“, „druckt nicht“, „0x80070005“,
// „i: weg“, „mein Kollege kann seit heute in Outlook keine Mails mehr senden“) zum richtigen
// Problem — und erkennt, wann die Lösung eindeutig ist (→ „Vorgeschlagene Lösung“):
//   • Wortanfang („laufw“ → laufwerk), Wortstamm („druckt“ → drucken), Teilwort („anmeldeschleife“)
//   • Synonyme und Begriffsgruppen („wifi“ → wlan, „verschicken“ → senden, „lahm“ → langsam)
//   • Tippfehler („temas“ → teams, Abstand 1 bzw. 2 bei langen Wörtern)
//   • Gewicht nach Seltenheit: „signatur“ zählt mehr als „outlook“; Füllwörter („kollege“,
//     „heute“) und unbekannte Wörter stören nicht
//   • Satzbausteine: passen alle Begriffe eines Stichworts („kein ton“, „verbunden aber kein
//     internet“) in beliebiger Reihenfolge → starker Hinweis
//   • Fehlercodes (0x80070005, caa70004, KB5034441, err_cert_…) → fast sicher
//   • Produktwort im Text → passender Bereich wird bevorzugt
//   • Gerätekontext: Desktop ohne Akku → Akku-Themen nach hinten, ohne WLAN → WLAN nach hinten
//   • Gelernt: was Kollegen bei ähnlicher Eingabe tatsächlich ausgeführt haben, rückt nach vorn
//   • Mehrere Probleme in einer Eingabe („teams startet nicht und drucker druckt nicht“)

import type { PaBereich, PaProblem } from './types'

const UML: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }
export function falte(s: string): string {
  return (s || '').toLowerCase()
    .replace(/[äöüß]/g, c => UML[c])
    .replace(/[„“"'`´()[\]{}!?,;]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

const STOPP = new Set(('der die das den dem des ein eine einen einem einer und oder mit von bei im in am an auf zu zum zur ich mein meine meinen meinem meiner mir mich er sie es wir ihr ihm ihn man kann kannst koennen konnte koennte ' +
  'ist sind war wird werden wurde hat haben hatte auch noch schon mehr sehr immer wieder nur so wie was wenn dass als beim vom bitte hallo da dann jetzt gerade seit mal ' +
  'kollege kollegin kollegen anwender anwenderin mitarbeiter mitarbeiterin chef chefin heute gestern ploetzlich irgendwie leider einfach trotzdem aber denn weil hier dort ganz total komplett ' +
  'nach fuer ueber um durch extrem mega richtig echt ziemlich furchtbar unglaublich wahnsinnig super krass arg ' +
  'sich wohl eben halt ja doch rum herum irgendwas etwas alles gar uns unser unsere sein seine seinem seiner ihre ihren ihrem welche welcher welches wieso warum weshalb hilfe brauche dringend schnell bekomme bekommt ' +
  'the a an is to of and on for my it not does can cannot i me').split(' '))
const SCHWACH = new Set(['nicht', 'kein', 'keine', 'keinen', 'geht', 'gehen', 'funktioniert', 'problem', 'probleme', 'fehler', 'error', 'pc', 'rechner', 'computer', 'laptop', 'notebook',
  'nichts', 'nie', 'meldung', 'fehlermeldung', 'kommt', 'bleibt', 'working', 'works', 'work', 'issue', 'issues', 'zeigt', 'steht', 'macht', 'tut', 'klappt'])

/** Begriffsgruppen (erstes Wort = Hauptbegriff). Ein Wort darf in mehreren Gruppen stehen. */
const GRUPPEN: string[][] = [
  ['laufwerk', 'netzlaufwerk', 'share', 'freigabe', 'netzwerkpfad', 'mapping', 'gemappt', 'mappen', 'drive', 'unc'],
  ['drucker', 'printer', 'drucken', 'druckt', 'druck', 'ausdruck', 'druckauftrag', 'print', 'spooler', 'drucer', 'durcker', 'drukcer'],
  ['scannen', 'scanner', 'scan', 'einscannen'],
  ['langsam', 'traege', 'lahm', 'ruckelt', 'ruckeln', 'performance', 'zaeh', 'dauert', 'slow', 'laggt'],
  ['haengt', 'eingefroren', 'friert', 'einfrieren', 'reagiert', 'rueckmeldung', 'freeze', 'hang', 'blockiert'],
  ['absturz', 'abgestuerzt', 'stuerzt', 'crash', 'crasht', 'schliesst', 'beendet', 'abstuerzen'],
  ['wlan', 'wifi', 'wi-fi', 'wireless', 'w-lan', 'funk', 'wlam', 'hotspot'],
  ['internet', 'web', 'webseite', 'seite', 'website', 'online', 'surfen'],
  ['netzwerk', 'netz', 'lan', 'ethernet', 'kabel', 'verbindung', 'network'],
  ['mail', 'email', 'e-mail', 'mails', 'emails', 'postfach', 'nachricht'],
  ['outlook', 'outlok', 'otlook', 'ol', 'otulook', 'outlock', 'outllok', 'oulook', 'outloock'],
  ['teams', 'msteams', 'temas', 'team', 'ms-teams', 'tesm', 'teasm', 'taems', 'tems'],
  ['anmeldung', 'anmelden', 'login', 'einloggen', 'logon', 'signin', 'sso', 'anmeldeschleife', 'reinkommen', 'reinkomme', 'reinkommt', 'reinlassen'],
  ['kennwort', 'passwort', 'password', 'pw', 'pin'],
  ['gesperrt', 'sperre', 'locked', 'lockout', 'gesperrtes'],
  ['bildschirm', 'monitor', 'display', 'screen', 'anzeige'],
  ['ton', 'sound', 'audio', 'lautsprecher', 'lautstaerke', 'speaker'],
  ['headset', 'kopfhoerer', 'jabra', 'headseat', 'hoerer'],
  ['mikrofon', 'mikro', 'mic', 'microphone'],
  ['kamera', 'webcam', 'cam', 'camera'],
  ['akku', 'batterie', 'battery'],
  ['laden', 'laedt', 'aufladen', 'ladekabel', 'netzteil', 'ladegeraet', 'charging'],
  ['sap', 'sapgui', 'saplogon', 'sap-gui'],
  ['solidworks', 'sldworks', 'solidwork', 'cad', 'swx'],
  ['onedrive', 'one-drive', 'odfb'],
  ['synchronisieren', 'synchronisierung', 'sync', 'synchronisiert', 'synchron', 'abgleich'],
  ['sharepoint', 'bibliothek', 'teamsite'],
  ['excel', 'exel', 'excell', 'exce', 'xls', 'xlsx', 'tabelle', 'tabellen'],
  ['word', 'docx', 'winword', 'dokument'],
  ['powerpoint', 'pptx', 'praesentation', 'folien', 'ppt'],
  ['office', 'm365', 'microsoft365', 'o365'],
  ['update', 'updates', 'aktualisierung', 'aktualisieren', 'patch', 'windowsupdate'],
  ['virus', 'viren', 'schadsoftware', 'malware', 'trojaner', 'defender'],
  ['zertifikat', 'certificate', 'cert', 'zertifikate'],
  ['vpn', 'cisco', 'anyconnect'],
  ['zscaler', 'zcc', 'zia', 'zpa'],
  ['homeoffice', 'zuhause', 'daheim', 'heimarbeit'],
  ['browser', 'edge', 'chrome', 'firefox'],
  ['startmenue', 'startmenu', 'startbutton', 'startknopf'],
  ['taskleiste', 'taskbar', 'infobereich', 'tray'],
  ['speicher', 'speicherplatz', 'festplatte', 'voll', 'platz', 'disk', 'ssd'],
  ['arbeitsspeicher', 'ram', 'memory'],
  ['bluescreen', 'bsod', 'blau', 'stopcode'],
  ['neustart', 'reboot', 'restart', 'neustarten', 'neugestartet'],
  ['starten', 'startet', 'gestartet', 'launch'],
  ['dock', 'dockingstation', 'docking', 'usb-c', 'thunderbolt'],
  ['maus', 'mouse', 'tastatur', 'keyboard'],
  ['bluetooth', 'bt', 'koppeln', 'pairing'],
  ['profil', 'temporaer', 'tempprofil'],
  ['uhr', 'uhrzeit', 'zeit', 'datum'],
  ['installieren', 'installation', 'install', 'softwarecenter', 'setup'],
  ['enaio', 'dms', 'archiv'],
  ['xelion', 'telefon', 'telefonie', 'softphone', 'anruf'],
  ['explorer', 'datei-explorer', 'dateiexplorer', 'windows-explorer'],
  ['datei', 'dateien', 'file', 'files'],
  ['ordner', 'folder', 'verzeichnis', 'unterordner'],
  ['weg', 'fehlt', 'verschwunden', 'verloren', 'nicht da', 'missing'],
  // Tätigkeiten und Symptome
  ['nicht', 'kein', 'keine', 'keinen', 'nichts', 'nie', 'no', 'nimmer'],
  ['einrichten', 'einschalten', 'anschalten', 'aktivieren', 'anlegen', 'erstellen', 'konfigurieren', 'enable'],
  ['ausschalten', 'abschalten', 'deaktivieren', 'disable', 'abstellen'],
  ['senden', 'sendet', 'verschicken', 'verschickt', 'schicken', 'abschicken', 'versenden', 'rausgehen', 'postausgang', 'send'],
  ['empfangen', 'empfaengt', 'ankommen', 'erhalten', 'posteingang', 'receive', 'eingehen'],
  ['oeffnen', 'oeffnet', 'aufmachen', 'open', 'aufrufen'],
  ['speichern', 'abspeichern', 'save', 'gespeichert', 'sichern'],
  ['loeschen', 'geloescht', 'entfernen', 'delete', 'weggeloescht'],
  ['verbinden', 'verbindet', 'connect', 'einbinden', 'hinzufuegen', 'verknuepfen'],
  ['trennen', 'trennt', 'getrennt', 'disconnect', 'abbrechen', 'bricht', 'abbruch', 'abgebrochen', 'verliert'],
  ['leise', 'leiser', 'quiet', 'kaum'],
  ['schwarz', 'dunkel', 'black', 'schwarzes', 'schwarzer'],
  ['flackert', 'flackern', 'flimmert', 'flimmern', 'flicker', 'flickering'],
  ['unscharf', 'verschwommen', 'pixelig', 'verpixelt', 'blurry'],
  ['echo', 'hall', 'widerhall'],
  ['rauscht', 'rauschen', 'knackt', 'knistert', 'brummt', 'stoergeraeusch', 'stoergeraeusche', 'krach'],
  ['abgelaufen', 'expired', 'ablaufen', 'ablauf'],
  ['vergessen', 'forgot', 'vergesse'],
  ['zugriff', 'berechtigung', 'berechtigungen', 'rechte', 'access', 'verweigert', 'denied', 'permission'],
  ['heiss', 'ueberhitzt', 'hitze', 'overheat', 'ueberhitzung'],
  ['einstellung', 'einstellungen', 'settings', 'konfiguration', 'optionen'],
  ['kalender', 'calendar', 'termin', 'termine', 'terminanfrage'],
  ['besprechung', 'meeting', 'konferenz', 'videokonferenz', 'videocall', 'call'],
  ['signatur', 'signature', 'unterschrift'],
  ['abwesenheit', 'abwesenheitsnotiz', 'urlaub', 'autoreply', 'ooo'],
  ['anhang', 'anhaenge', 'attachment', 'anlage', 'anlagen'],
  ['suche', 'suchen', 'sucht', 'findet', 'finden', 'search', 'durchsuchen'],
  ['weiterleitung', 'weiterleiten', 'umleiten', 'umleitung', 'forward'],
  ['kopieren', 'einfuegen', 'zwischenablage', 'copy', 'paste', 'clipboard'],
  ['screenshot', 'bildschirmfoto', 'snipping', 'ausschneiden'],
  ['sprache', 'language', 'englisch', 'deutsch'],
  ['bitlocker', 'wiederherstellungsschluessel', 'recovery', 'recoverykey'],
  ['pdf', 'acrobat', 'reader', 'adobe'],
  ['usb', 'usb-stick', 'stick', 'wechseldatentraeger'],
  ['adminrechte', 'administrator', 'admin', 'adminrecht', 'erhoehte'],
  ['abmelden', 'abmeldung', 'logout', 'ausloggen'],
  ['wiederherstellen', 'restore', 'zurueckholen', 'versehentlich'],
  // Umgangssprache, wie Anwender es am Telefon sagen
  ['kaputt', 'defekt', 'tot', 'broken', 'hinueber', 'hinueberr'],
  ['spinnt', 'zickt', 'streikt', 'buggt', 'spinnen', 'rumzicken', 'faxen', 'macken'],
  ['sanduhr', 'kreisel', 'ladekreis', 'dreht', 'drehen', 'spinning', 'ewig'],
  ['weiss', 'weisses', 'weisser', 'white'],
  ['leer', 'leeres', 'leerer', 'empty', 'blank'],
  ['piept', 'piepst', 'pfeift', 'beep', 'piepen', 'piepton'],
  ['doppelt', 'zweimal', 'mehrfach', 'duplikat', 'dupliziert', 'duplicate'],
  ['falsch', 'falsche', 'falscher', 'falsches', 'wrong', 'verkehrt'],
  ['veraltet', 'outdated', 'uralt', 'zu alt'],
  ['ausgegraut', 'grau', 'inaktiv', 'greyed', 'deaktiviert'],
  ['blinkt', 'blinken', 'leuchtet', 'led', 'lampe', 'laempchen'],
  ['zeichensalat', 'hieroglyphen', 'kryptisch', 'kauderwelsch', 'sonderzeichen', 'umlaute'],
  ['handy', 'smartphone', 'iphone', 'android', 'mobiltelefon', 'diensthandy'],
  ['authenticator', 'mfa', '2fa', 'zweifaktor', 'zwei-faktor', 'push', 'bestaetigungscode'],
  ['citrix', 'workspace', 'receiver', 'ica'],
  ['remotedesktop', 'rdp', 'mstsc', 'fernzugriff', 'fernwartung'],
  ['entpacken', 'zip', '7zip', '7-zip', 'winrar', 'rar', 'gezippt'],
  ['schriftart', 'schrift', 'font', 'fonts', 'schriftgroesse'],
  ['symbol', 'symbole', 'icon', 'icons', 'verknuepfung', 'verknuepfungen', 'shortcut'],
  ['link', 'links', 'hyperlink', 'url'],
  ['herunterladen', 'download', 'downloaden', 'runterladen', 'downloads'],
  ['hochladen', 'upload', 'uploaden', 'raufladen'],
  ['teilen', 'geteilt', 'sharing', 'bildschirmfreigabe', 'screensharing'],
  ['heiss', 'warm', 'gluehend'],
  ['laut', 'lauter', 'brummt', 'surrt', 'rattert'],
]
const SYNONYM = new Map<string, string[]>()
for (const g of GRUPPEN) for (const w of g) SYNONYM.set(w, Array.from(new Set([...(SYNONYM.get(w) || []), ...g.filter(x => x !== w)])))

/** Produktwörter → Bereich (für die Bevorzugung). */
const PRODUKT_BEREICH: [RegExp, PaBereich][] = [
  [/^(teams|msteams|temas|tesm|teasm|taems|tems)$/, 'Teams'], [/^(outlook|outlok|otlook|otulook|outlock|oulook|postfach|ost|pst)$/, 'Outlook & E-Mail'],
  [/^(excel|exel|excell|word|winword|powerpoint|office)$/, 'Office (Word/Excel/PowerPoint)'], [/^(onedrive|sharepoint)$/, 'OneDrive & SharePoint'],
  [/^(edge|chrome|firefox|browser)$/, 'Browser'], [/^(wlan|wifi|w-lan|wlam)$/, 'WLAN'], [/^(vpn|zscaler)$/, 'VPN & Zscaler'],
  [/^(laufwerk|netzlaufwerk|freigabe|share)$/, 'Netzlaufwerke & Dateien'], [/^(drucker|printer|drucken|scanner|scannen)$/, 'Drucker & Scannen'],
  [/^(headset|ton|sound|audio|jabra|lautsprecher|mikrofon|mikro)$/, 'Audio & Headset'], [/^(bildschirm|monitor|display)$/, 'Bildschirm & Grafik'],
  [/^(kamera|webcam|mikrofon)$/, 'Kamera & Mikrofon'], [/^(akku|batterie)$/, 'Akku & Energie'], [/^(sap|sapgui|saplogon)$/, 'SAP'],
  [/^(solidworks|sldworks|cad)$/, 'SolidWorks & CAD'], [/^(xelion|telefon|softphone)$/, 'Telefonie & Sonstiges'],
  [/^(handy|smartphone|iphone|android|authenticator|mfa|2fa)$/, 'Smartphone & MFA'],
  [/^(acrobat|adobe|citrix|7zip|7-zip|notepad|java|powerbi|webex|vlc|rdp|remotedesktop)$/, 'Weitere Programme'],
]

/** Grobe Stammform (deutsch): gleiche Stämme matchen („druckt“/„drucken“/„drucker“). */
const STAMM = new Map<string, string>()
export function stamm(w: string): string {
  let x = STAMM.get(w)
  if (x === undefined) { x = stammRoh(w); STAMM.set(w, x) }
  return x
}
function stammRoh(w: string): string {
  if (w.length <= 4 || /\d/.test(w) || w.includes(':')) return w
  if (w.length >= 7 && w.startsWith('ge') && !/^ge(rae|nau|nug|neh|samt|wicht|haeuse|fahr)/.test(w)) w = w.slice(2)
  for (const s of ['ungen', 'ungs', 'ung', 'ieren', 'iert', 'ern', 'en', 'er', 'es', 'et', 'st', 'e', 'n', 's', 't']) {
    if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length)
  }
  return w
}

export function woerter(s: string): string[] {
  return falte(s).split(/\s+|[/\\|+]+|\.(?!\d)/).flatMap(w => w.split(/(?<=\D)-(?=\D)/).concat(w.includes('-') ? [w] : []))
    .map(w => w.replace(/^[^a-z0-9:]+|[^a-z0-9:]+$/g, '')).filter(w => w.length >= 2 || /^[a-z]:$/.test(w))
}

/** Hauptbegriff eines Wortes (Synonymgruppe → Stamm des ersten Wortes). */
const KANON = new Map<string, string>()
const KOPF = new Map<string, string>()
for (const g of GRUPPEN) { const k = stamm(g[0]); if (!KOPF.has(k)) KOPF.set(k, g[0]); for (const w of g) { if (!KANON.has(w)) KANON.set(w, k); const s = stamm(w); if (!KANON.has(s)) KANON.set(s, k) } }
const KONZEPT = new Map<string, string>()
export const konzept = (w: string): string => {
  let x = KONZEPT.get(w)
  if (x === undefined) { x = KANON.get(w) ?? KANON.get(stamm(w)) ?? stamm(w); KONZEPT.set(w, x) }
  return x
}
const SCHWACH_K = new Set([...SCHWACH].map(konzept))
const NEIN = konzept('nicht')

/** Fehlercodes: Hex (0x80070005, caa70004), KB-Nummern, err_…-Kennungen, 12345-6. */
export function istCode(w: string): boolean {
  return (/^(0x)?[0-9a-f]{6,10}$/.test(w) && /\d{3}/.test(w)) || /^kb\d{6,8}$/.test(w) || /^\d{4,6}-\d{1,4}$/.test(w)
    || (/^[a-z]+(_[a-z0-9]+){2,}$/.test(w) && w.length >= 12)
}
export const codeNorm = (w: string) => w.replace(/^0x/, '').replace(/^0+(?=[0-9a-f])/, '')
/** Kurze Zahlen (Fehler 53, Code 43, 1603) — schwächer als echte Codes. */
const istZahl = (w: string) => /^\d{2,5}$/.test(w) && w !== '365' && !/^(19|20)\d\d$/.test(w)

/** Tippfehler-Abstand (Damerau: auch vertauschte Nachbarbuchstaben „tesm“/„teams“ = 1). */
const Z0 = new Int32Array(64), Z1 = new Int32Array(64), Z2 = new Int32Array(64)
function abstand(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max || b.length >= 63 || a.length >= 63) return max + 1
  let vv = Z0, v = Z1, n = Z2
  for (let j = 0; j <= b.length; j++) v[j] = j
  for (let i = 1; i <= a.length; i++) {
    n[0] = i; let zeilenMin = i
    const ai = a.charCodeAt(i - 1), ai1 = i > 1 ? a.charCodeAt(i - 2) : -1
    for (let j = 1; j <= b.length; j++) {
      const bj = b.charCodeAt(j - 1)
      let x = Math.min(v[j] + 1, n[j - 1] + 1, v[j - 1] + (ai === bj ? 0 : 1))
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && ai1 === bj) x = Math.min(x, vv[j - 2] + 1)
      n[j] = x; if (x < zeilenMin) zeilenMin = x
    }
    if (zeilenMin > max) return max + 1
    const t = vv; vv = v; v = n; n = t
  }
  return v[b.length]
}

/** Begriffe eines Satzbausteins als Hauptbegriffe (ohne Füllwörter). */
function konzepte(text: string): string[] { return konzepteAus(woerter(text)) }
function konzepteAus(ws: string[]): string[] { return Array.from(new Set(ws.filter(w => !STOPP.has(w)).map(konzept))) }

interface Phrase { k: string[]; text: string; satz?: boolean }
interface Eintrag { p: PaProblem; titelW: Set<string>; titelA: string[]; titelS: Set<string>; titelK: string[]; titelF: string; phrasen: Phrase[] }

export interface PaIndex {
  eintraege: Eintrag[]
  /** Eindeutige Wörter (für Wortanfang und Tippfehler). */
  vokabular: string[]
  /** Wort bzw. Stamm → (Eintrag → bestes Feldgewicht). */
  post: Map<string, Map<number, number>>
  codes: Map<string, Set<number>>
  zahlen: Map<string, Set<number>>
  idNach: Map<string, number>
  /** Hauptbegriff → Anzahl Titel, die ihn enthalten (selten = Spezialfall wie „Gruppenpostfach“). */
  titelDf: Map<string, number>
}

/** Baut den Index Problem für Problem auf (für den schrittweisen Aufbau im Hintergrund). */
function neuerBauer(probleme: PaProblem[], aktionTitel: (id: string) => string) {
  const vok = new Set<string>()
  const post = new Map<string, Map<number, number>>()
  const codes = new Map<string, Set<number>>(), zahlen = new Map<string, Set<number>>()
  const eintraege: Eintrag[] = []
  const bereichW = new Map<string, string[]>(), schrittW = new Map<string, string[]>()
  const titelDf = new Map<string, number>()
  const add = (t: string, i: number, g: number) => { let m = post.get(t); if (!m) post.set(t, m = new Map()); if ((m.get(i) || 0) < g) m.set(i, g) }
  const merke = (m: Map<string, Set<number>>, k: string, i: number) => { let x = m.get(k); if (!x) m.set(k, x = new Set()); x.add(i) }
  const feld = (ws: string[], i: number, g: number, mitCodes: boolean) => {
    const gesehen = new Set<string>()
    for (const w of ws) {
      if (gesehen.has(w)) continue
      gesehen.add(w); vok.add(w); add(w, i, g); add(stamm(w), i, g)
      if (mitCodes && istCode(w)) merke(codes, codeNorm(w), i)
      if (mitCodes && g >= 2 && istZahl(w)) merke(zahlen, w, i)
    }
  }
  return {
    add(p: PaProblem, i: number) {
      const wTitel = woerter(p.titel)
      const wStich = p.stichworte.map(woerter)
      const besch = p.beschreibungen || []
      const wBesch = besch.map(woerter)
      let wb = bereichW.get(p.bereich); if (!wb) bereichW.set(p.bereich, wb = woerter(p.bereich))
      const wSchritte: string[] = []
      for (const x of p.schritte) { let ws = schrittW.get(x.aktion); if (!ws) schrittW.set(x.aktion, ws = woerter(aktionTitel(x.aktion))); wSchritte.push(...ws) }
      feld(wTitel, i, 3, true)
      feld(wStich.flat(), i, 2.6, true)
      feld(wBesch.flat(), i, 2.2, true)
      feld(wb, i, 1.6, false)
      feld(woerter(p.ursache), i, 0.6, true)
      feld(woerter(p.loesung), i, 0.45, true)
      feld(wSchritte, i, 0.3, false)
      const phrasen: Phrase[] = []
      const nimm = (ws: string[], text: string, satz: boolean) => {
        // schwache Füllwörter („geht“, „problem“, „pc“) zählen im Satzbaustein nicht — die Verneinung schon
        const k = konzepteAus(ws).filter(x => x === NEIN || !SCHWACH_K.has(x))
        if (k.length >= 2 && k.some(x => !SCHWACH_K.has(x))) phrasen.push({ k, text, satz })
      }
      p.stichworte.forEach((x, j) => nimm(wStich[j], x, false))
      nimm(wTitel, p.titel, false)
      besch.forEach((x, j) => nimm(wBesch[j], x, true))
      const titelK = konzepteAus(wTitel).filter(x => !SCHWACH_K.has(x) && x.length >= 3)
      for (const x of titelK) titelDf.set(x, (titelDf.get(x) || 0) + 1)
      eintraege[i] = { p, titelW: new Set(wTitel), titelA: wTitel, titelS: new Set(wTitel.map(stamm)), titelK, titelF: falte(p.titel), phrasen }
    },
    fertig(): PaIndex {
      return { eintraege, vokabular: [...vok], post, codes, zahlen, idNach: new Map(probleme.map((p, i) => [p.id, i])), titelDf }
    },
  }
}

export function baueIndex(probleme: PaProblem[], aktionTitel: (id: string) => string = () => ''): PaIndex {
  const b = neuerBauer(probleme, aktionTitel)
  probleme.forEach((p, i) => b.add(p, i))
  return b.fertig()
}

/** Wie baueIndex, gibt aber alle `happen` Probleme den Hauptthread frei — die Oberfläche bleibt bedienbar. */
export async function baueIndexAsync(probleme: PaProblem[], aktionTitel: (id: string) => string = () => '', happen = 120): Promise<PaIndex> {
  const b = neuerBauer(probleme, aktionTitel)
  for (let i = 0; i < probleme.length; i++) {
    b.add(probleme[i], i)
    if (i % happen === happen - 1) await new Promise(res => setTimeout(res, 0))
  }
  return b.fertig()
}

/** Was Kollegen bei einer Eingabe tatsächlich ausgeführt haben (gefaltete Eingabe → Problem). */
export interface PaGelernt { q: string; id: string; n: number }
/** Gerätekontext des Ziel-PCs (undefined = unbekannt). */
export interface PaKontext { akku?: boolean; wlan?: boolean }
/** kern = Grundprobleme, die bei sehr kurzer Eingabe („laufw“, „teams“) zuerst kommen. */
export interface PaSuchOptionen { bereich?: PaBereich | null; kontext?: PaKontext | null; gelernt?: PaGelernt[] | null; kern?: Set<string> | null }

export interface PaTreffer {
  p: PaProblem
  punkte: number
  getroffen: string[]
  /** 0…1: wie viel der bedeutsamen Suchbegriffe dieses Problem abdeckt (gewichtet). */
  abdeckung: number
  /** Satzbaustein (Stichwort/Titel), dessen Begriffe alle in der Eingabe stehen. */
  phrase?: string
  code?: string
  /** So oft bei ähnlicher bzw. genau dieser Eingabe ausgeführt. */
  gelernt?: number
  gelerntGenau?: number
  /** Seltene Begriffe im Titel, die in der Eingabe fehlen („Gruppenpostfach“, „Homeoffice“). */
  spezial?: number
}

/** Unbekanntes langes Wort in zwei bekannte Teile zerlegen (mit Fugen-s/-n/-e). */
function zerlege(w: string, ix: PaIndex): string[] {
  if (w.length < 8 || /\d|:/.test(w) || ix.post.has(w) || ix.post.has(stamm(w)) || SYNONYM.has(w)) return [w]
  const bekannt = (x: string) => x.length >= 3 && !STOPP.has(x) && (ix.post.has(x) || ix.post.has(stamm(x)) || SYNONYM.has(x))
  let best: string[] | null = null, wert = 0
  for (let i = 3; i <= w.length - 3; i++) {
    const a = w.slice(0, i)
    if (!bekannt(a)) continue
    for (const b of [w.slice(i), ...(/^[sne]/.test(w.slice(i)) ? [w.slice(i + 1)] : []), ...(w.slice(i).startsWith('es') ? [w.slice(i + 2)] : [])]) {
      if (b.length < 3 || !bekannt(b)) continue
      const m = Math.min(a.length, b.length)
      if (m > wert) { wert = m; best = [a, b] }
    }
  }
  return best || [w]
}

/** Begriff → Varianten mit Gewicht (selbst, Stamm, Synonyme, Wortanfang, Tippfehler). */
function varianten(q: string, ix: PaIndex): { w: string; g: number; vorsilbe?: boolean; tipp?: boolean }[] {
  const out: { w: string; g: number; vorsilbe?: boolean; tipp?: boolean }[] = [{ w: q, g: 1 }, { w: stamm(q), g: 0.95 }]
  for (const s of SYNONYM.get(q) || SYNONYM.get(stamm(q)) || []) out.push({ w: s, g: 0.75 }, { w: stamm(s), g: 0.7 })
  if (q.length >= 3 && !/^\d+$/.test(q)) out.push({ w: q, g: 0.85, vorsilbe: true })
  if (!ix.post.has(q) && /[aou]/.test(q)) for (let i = 0; i < q.length; i++) {
    if (!'aou'.includes(q[i]) || q[i + 1] === 'e') continue
    const u = q.slice(0, i + 1) + 'e' + q.slice(i + 1)
    if (ix.post.has(u)) out.push({ w: u, g: 0.95, tipp: true }, { w: stamm(u), g: 0.9 })
  }
  const unbekannt = !ix.post.has(q) && !ix.post.has(stamm(q)) && !SYNONYM.has(q)
  if (unbekannt && q.length >= 5 && !/\d/.test(q)) {
    const max = q.length >= 8 ? 2 : 1
    const sortiert = q.split('').sort().join('')
    const suche = (ersterGleich: boolean) => {
      let n = 0
      for (const v of ix.vokabular) {
        if (v === q || Math.abs(v.length - q.length) > max || (ersterGleich ? v[0] !== q[0] : v[0] === q[0])) continue
        if (abstand(q, v, max) > max) continue
        const dreher = v.length === q.length && v.split('').sort().join('') === sortiert
        out.push({ w: v, g: dreher ? 0.8 : 0.6, tipp: true })
        for (const s of SYNONYM.get(v) || []) out.push({ w: s, g: 0.5 })
        n++
      }
      return n
    }
    if (!suche(true) && q.length >= 6) suche(false)
  }
  return out
}

interface Begriff { w: string; schwach: boolean; bekannt: boolean; gewicht: number; best: Float32Array; konzepte: Set<string>; als: string; korrigiert: string[] }

interface Analyse { treffer: PaTreffer[]; begriffe: Begriff[]; codes: string[]; produkt: Set<PaBereich>; kontextHinweis?: string; parameter: string[] }

/** Angaben statt Symptome: Druckername (PMD634), Server (w3149), PC-Name (DE1HF5480SLL) — zählen nicht für die Erkennung. */
const PARAMETER = /^(pmd\d{2,5}|w\d{4,5}|[a-z]{2}\d[a-z0-9]{6,12})$/
/** Wie oft wurde ein Problem insgesamt gelöst (für „beliebt zuerst“ bei kurzer Eingabe). */
const BELIEBT = new WeakMap<PaGelernt[], Map<string, number>>()
function beliebt(g: PaGelernt[]): Map<string, number> {
  let m = BELIEBT.get(g)
  if (!m) { m = new Map(); for (const x of g) m.set(x.id, (m.get(x.id) || 0) + x.n); BELIEBT.set(g, m) }
  return m
}

function analysiere(ix: PaIndex, eingabe: string, opt: PaSuchOptionen): Analyse {
  const N = ix.eintraege.length
  const bereich = opt.bereich || null
  const alleW = woerter(eingabe)
  const parameter = alleW.filter(w => PARAMETER.test(w) && !istCode(w))
  const roh = Array.from(new Set(alleW.filter(w => !STOPP.has(w) && !parameter.includes(w)).flatMap(w => zerlege(w, ix)).filter(w => !STOPP.has(w))))
  const leer: Analyse = { treffer: [], begriffe: [], codes: [], produkt: new Set(), parameter }
  if (!roh.length) return bereich ? { ...leer, treffer: ix.eintraege.filter(e => e.p.bereich === bereich).map(e => ({ p: e.p, punkte: 0, getroffen: [], abdeckung: 0 })) } : leer

  // 1) je Suchbegriff: bestes Feldgewicht je Problem
  const begriffe: Begriff[] = roh.map(w => {
    const best = new Float32Array(N)
    const merge = (t: string, g: number) => { const m = ix.post.get(t); if (!m) return; for (const [e, fw] of m) { const v = fw * g; if (v > best[e]) best[e] = v } }
    const vars = varianten(w, ix)
    const ks = new Set<string>([konzept(w)])
    for (const v of vars) {
      if (v.vorsilbe) {
        for (const x of ix.vokabular) {
          if (x.length <= v.w.length) continue
          if (x.startsWith(v.w)) merge(x, v.g)
          else if (v.w.length >= 4 && x.includes(v.w)) merge(x, Math.min(v.g, 0.7))
        }
      } else { merge(v.w, v.g); if ((v.g <= 0.6 || v.tipp) && ix.post.has(v.w)) ks.add(konzept(v.w)) }
    }
    const k = konzept(w)
    const kopf = KOPF.get(k)
    const als = istCode(w) ? 'Fehlercode' : kopf && stamm(kopf) !== stamm(w) && kopf.slice(0, 3) !== w.slice(0, 3) ? kopf : ''
    return { w, schwach: SCHWACH.has(w), bekannt: false, gewicht: 0, best, konzepte: ks, als, korrigiert: vars.filter(v => v.tipp).map(v => v.w) }
  })
  // 2) Gewicht nach Seltenheit (nur Treffer in Titel/Stichworten zählen als „bekannt“)
  const df = (b: Begriff, ab: number) => { let n = 0; for (let e = 0; e < N; e++) if (b.best[e] >= ab) n++; return n }
  const lnN = Math.log(Math.max(2, N))
  const stark = begriffe.filter(b => !b.schwach)
  const dfStark = stark.map(b => df(b, 1))
  const irgendwoBekannt = dfStark.some(n => n > 0)
  stark.forEach((b, i) => {
    const n = irgendwoBekannt ? dfStark[i] : df(b, 0.0001)
    b.bekannt = n > 0
    b.gewicht = b.bekannt ? 0.65 + 0.9 * Math.log(N / n) / lnN : 0.1
  })
  for (const b of begriffe) if (b.schwach) b.gewicht = 0.25
  const bedeutsam = begriffe.filter(b => !b.schwach && b.bekannt)
  const codes = roh.filter(istCode).map(codeNorm).filter(c => ix.codes.has(c))
  const zahlen = roh.filter(w => istZahl(w) && ix.zahlen.has(w))
  // 5) Gelerntes: ähnliche frühere Eingaben (Jaccard über Hauptbegriffe)
  const qk = new Set(stark.flatMap(b => [...b.konzepte]).filter(x => !SCHWACH_K.has(x)))
  const lernBonus = new Map<number, { bonus: number; n: number; genau: number }>()
  if (opt.gelernt?.length && qk.size) {
    const qf = falte(eingabe)
    for (const g of opt.gelernt) {
      const e = ix.idNach.get(g.id); if (e === undefined) continue
      const gk = new Set(konzepte(g.q).filter(x => !SCHWACH_K.has(x)))
      let schnitt = 0; for (const x of gk) if (qk.has(x)) schnitt++
      const sim = schnitt / (qk.size + gk.size - schnitt || 1)
      if (sim < 0.5) continue
      const alt = lernBonus.get(e) || { bonus: 0, n: 0, genau: 0 }
      const genau = g.q === qf || sim === 1
      alt.n += g.n
      if (genau) alt.genau += g.n
      // genau diese Eingabe: kräftig (2× gelöst → vorn); nur ähnlich: sanft
      alt.bonus = Math.max(alt.bonus, alt.genau ? 2.5 * Math.min(2, alt.genau) : 0, Math.min(2, (alt.genau ? 0 : alt.bonus) + 1.3 * sim * Math.min(1.6, Math.sqrt(g.n))))
      lernBonus.set(e, alt)
    }
  }
  if (!bedeutsam.length && !codes.length && !lernBonus.size) return { ...leer, begriffe }

  // 3) Produktwort → Bereich
  const produkt = new Set<PaBereich>()
  for (const w of [...roh, ...begriffe.flatMap(b => b.korrigiert)]) for (const [re, b] of PRODUKT_BEREICH) {
    if (re.test(w) || re.test(stamm(w))) { produkt.add(b); continue }
    if (w.length >= 4) for (const alt of re.source.replace(/^\^\(|\)\$$/g, '').split('|')) if (alt.startsWith(w)) { produkt.add(b); break }
  }
  // 4) Gerätekontext
  const k = opt.kontext || {}
  const ohneAkku = k.akku === false && !produkt.has('Akku & Energie')
  const ohneWlan = k.wlan === false && !produkt.has('WLAN')
  const kontextHinweis = ohneAkku || ohneWlan ? `${[ohneAkku && 'Akku', ohneWlan && 'WLAN'].filter(Boolean).join(' und ')}-Themen nach hinten — der Ziel-PC hat ${[ohneAkku && 'keinen Akku', ohneWlan && 'kein WLAN'].filter(Boolean).join(' und ')}` : undefined
  // Begriffe der Eingabe für Satzbausteine (inkl. „kein“, „nicht“)
  const alleK = new Set(begriffe.flatMap(b => [...b.konzepte]))
  const starkK = new Set(bedeutsam.map(b => konzept(b.w)))
  const stoebern = starkK.size <= 1 && !codes.length
  const beliebtM = stoebern && opt.gelernt?.length ? beliebt(opt.gelernt) : null
  const eingabeF = falte(eingabe)

  // 6) Bewertung je Problem
  const out: PaTreffer[] = []
  for (let e = 0; e < N; e++) {
    const en = ix.eintraege[e]
    if (bereich && en.p.bereich !== bereich) continue
    let punkte = 0, deck = 0, deckMax = 0, starkGetroffen = false
    const getroffen: string[] = []
    for (const b of begriffe) {
      const x = b.best[e]
      if (!b.schwach && b.bekannt) { deckMax += b.gewicht; if (x > 0) { deck += b.gewicht * Math.min(1, x / 1.5); starkGetroffen = true } }
      if (x > 0) { punkte += x * b.gewicht; getroffen.push(b.w) }
    }
    let code: string | undefined
    for (const c of codes) if (ix.codes.get(c)!.has(e)) { punkte += 3.5; code = c }
    for (const z of zahlen) if (ix.zahlen.get(z)!.has(e)) punkte += 1.2
    const lb = lernBonus.get(e)
    if (!punkte && !lb) continue
    if (deckMax && !starkGetroffen && !code && !lb) continue                // nur schwache/unbekannte Wörter getroffen
    const abdeckung = deckMax ? deck / deckMax : (code ? 1 : 0)
    punkte *= 0.45 + 0.55 * abdeckung * abdeckung
    if (produkt.size && produkt.has(en.p.bereich)) punkte *= 1.35
    else if (produkt.size) punkte *= 0.8
    // Suchwörter direkt im Titel (auch „pc“, „nicht“)
    for (const b of begriffe) if (en.titelW.has(b.w) || en.titelS.has(stamm(b.w)) || en.titelK.includes(konzept(b.w)) || (b.w.length >= 3 && en.titelA.some(x => x.startsWith(b.w)))) punkte += 0.35
    // exakte Phrase im Titel
    if (eingabeF.length >= 6 && en.titelF.includes(eingabeF)) punkte += 2
    // Satzbaustein: alle Begriffe eines Stichworts/des Titels stehen in der Eingabe
    let phrase: string | undefined, pb = 0
    for (const ph of en.phrasen) {
      // ganz enthalten — oder bei längeren Sätzen (Beschreibungen, ≥ 4 Begriffe) zum größten Teil
      let n = 0; for (const x of ph.k) if (alleK.has(x)) n++
      if (n < 2 && n !== ph.k.length) continue
      const drin = n === ph.k.length ? ph.k : ph.k.filter(x => alleK.has(x))
      const voll = drin.length === ph.k.length
      if (!voll && !((ph.satz || ph.k.length >= 4) && drin.length >= 2 && drin.length / ph.k.length >= 0.6 && drin.some(x => !SCHWACH_K.has(x)))) continue
      const anteil = starkK.size ? Math.min(1, drin.filter(x => starkK.has(x)).length / starkK.size) : 0.5
      let b = Math.min(2.6, 0.9 + 0.55 * (drin.length - 2) + (drin.filter(x => !SCHWACH_K.has(x)).length >= 2 ? 0.3 : 0)) * (0.6 + 0.4 * anteil)
      if (!voll) b *= 0.85 * drin.length / ph.k.length
      if (b > pb) { pb = b; phrase = ph.text }
    }
    punkte += pb
    // Spezialfälle (Titel nennt Dinge, die in der Eingabe fehlen: „Gruppenpostfach“, „S/MIME“) leicht nach hinten — das Allgemeine zuerst
    let spezial = 0
    if (starkK.size >= 2) { let fremd = 0; for (const x of en.titelK) if (!alleK.has(x)) { fremd++; if ((ix.titelDf.get(x) || 0) <= 40) spezial++ }; punkte -= Math.min(1.2, 0.3 * fremd) }
    // Sehr kurze Eingabe (ein Begriff): Grundprobleme und oft Gelöstes zuerst
    if (!stoebern && starkK.size <= 2 && opt.kern?.has(en.p.id)) punkte += 0.4   // kurze Eingabe: Grundfall vor Sonderfall
    if (stoebern) { if (opt.kern?.has(en.p.id)) punkte += 0.9; const n = beliebtM?.get(en.p.id); if (n) punkte += Math.min(0.8, 0.3 * Math.log2(1 + n)) }
    if (lb) punkte += lb.bonus
    if ((ohneAkku && en.p.bereich === 'Akku & Energie') || (ohneWlan && en.p.bereich === 'WLAN')) punkte *= 0.5
    out.push({ p: en.p, punkte, getroffen, abdeckung, phrase, code, gelernt: lb?.n, gelerntGenau: lb?.genau, spezial })
  }
  out.sort((a, b) => b.punkte - a.punkte || a.p.titel.length - b.p.titel.length || a.p.titel.localeCompare(b.p.titel, 'de'))
  return { treffer: out, begriffe, codes, produkt, kontextHinweis, parameter }
}

/** Trefferliste (beste zuerst). Viertes Argument: Bereich (alt) oder Optionen. */
export function suche(ix: PaIndex, eingabe: string, max = 30, bereichOderOpt?: PaBereich | null | PaSuchOptionen): PaTreffer[] {
  const opt: PaSuchOptionen = bereichOderOpt && typeof bereichOderOpt === 'object' ? bereichOderOpt : { bereich: (bereichOderOpt as PaBereich | null | undefined) ?? null }
  return analysiere(ix, eingabe, opt).treffer.slice(0, max)
}

export type PaSicherheit = 'hoch' | 'mittel' | 'keine'
export interface PaErkennung {
  treffer: PaTreffer[]
  sicherheit: PaSicherheit
  /** Die erkannte Lösung (bei Sicherheit hoch/mittel). */
  vorschlag?: PaTreffer
  /** Warum erkannt (für die Oberfläche). */
  gruende: string[]
  /** Verstandene Begriffe (Chips); `als` = Hauptbegriff bzw. „Fehlercode“. */
  erkannt: { wort: string; als?: string }[]
  /** Wörter, die das Tool nicht zuordnen konnte (stören nicht). */
  unbekannt: string[]
  /** Angaben in der Eingabe (Druckername, Server, PC) — z. B. zum Vorbelegen der Eingabe. */
  parameter: string[]
  /** Mehrere Probleme in einer Eingabe („… und …“). */
  mehrere?: { teil: string; vorschlag: PaTreffer; sicherheit: PaSicherheit }[]
  kontextHinweis?: string
}

function bewerte(a: Analyse): { sicherheit: PaSicherheit; vorschlag?: PaTreffer; gruende: string[] } {
  const [t1, t2] = a.treffer
  if (!t1) return { sicherheit: 'keine', gruende: [] }
  const marge = t2 ? (t1.punkte - t2.punkte) / t1.punkte : 1
  const n = a.begriffe.filter(b => !b.schwach && b.bekannt).length
  const gruende: string[] = []
  if (t1.code) gruende.push(`Fehlercode ${t1.code}`)
  if (t1.phrase) gruende.push(`passt zu „${t1.phrase}“`)
  if (t1.gelerntGenau) gruende.push(`von Kollegen schon ${t1.gelerntGenau}× so gelöst`)
  else if (t1.gelernt) gruende.push(`bei ähnlicher Eingabe ${t1.gelernt}× gewählt`)
  if (t1.abdeckung >= 0.9 && n >= 2) gruende.push('alle Begriffe getroffen')
  let s: PaSicherheit = 'keine'
  if (t1.code && (t2?.code !== t1.code || marge >= 0.25)) s = 'hoch'
  else if (t1.code) s = 'mittel'
  else if ((t1.gelerntGenau || 0) >= 2 && marge >= 0) s = 'hoch'
  else if (n >= 2 && t1.abdeckung >= 0.9 && marge >= (t1.phrase ? 0.04 : 0.15)) s = 'hoch'
  else if (n >= 2 && t1.abdeckung >= 0.7 && marge >= 0.05) s = 'mittel'
  else if (n >= 2 && t1.abdeckung >= 0.9 && (marge >= 0.03 || (t1.phrase && !t2?.phrase && marge > 0))) s = 'mittel'
  else if (n >= 1 && t1.phrase && t1.abdeckung >= 0.9 && marge >= 0.1) s = 'mittel'
  else if ((t1.gelerntGenau || 0) >= 1 && marge >= 0) s = 'mittel'
  if (s === 'hoch' && !t1.code && !t1.gelerntGenau && (t1.spezial || 0) > 0 && a.treffer.slice(1, 4).some(t => t.abdeckung >= 0.9 && (t.spezial || 0) < (t1.spezial || 0))) { s = 'mittel'; gruende.push('es gibt auch einen allgemeineren Fall') }
  return s === 'keine' ? { sicherheit: s, gruende: [] } : { sicherheit: s, vorschlag: t1, gruende }
}

/** Teilt „A und B“, „A, B“, „A. B“ in einzelne Probleme. */
function teile(eingabe: string): string[] {
  return eingabe.toLowerCase().split(/\s+(?:und|sowie|außerdem|ausserdem|zusätzlich|zusaetzlich|dazu|plus|weiterhin|auch noch)\s+|[,;]+|\s\+\s|[.!?]\s+/).map(x => x.trim()).filter(Boolean)
}

/** Suche + Erkennung: weiß das Tool, welche Lösung gemeint ist? */
export function erkenne(ix: PaIndex, eingabe: string, opt: PaSuchOptionen = {}): PaErkennung {
  const a = analysiere(ix, eingabe, opt)
  const b = bewerte(a)
  const erkannt = a.begriffe.filter(x => x.bekannt || istCode(x.w)).map(x => ({ wort: x.w, als: x.als || undefined }))
  const unbekannt = a.begriffe.filter(x => !x.schwach && !x.bekannt && !istCode(x.w)).map(x => x.w)
  const erg: PaErkennung = { treffer: a.treffer, sicherheit: b.sicherheit, vorschlag: b.vorschlag, gruende: b.gruende, erkannt, unbekannt, parameter: a.parameter, kontextHinweis: a.kontextHinweis }
  // Mehrere Probleme? Nur wenn jeder Teil für sich genug sagt und das Ganze nicht schon eindeutig ist.
  const teileListe = teile(eingabe)
  if (teileListe.length >= 2 && !(b.sicherheit === 'hoch' && (b.vorschlag?.abdeckung || 0) >= 0.95)) {
    const mehrere: NonNullable<PaErkennung['mehrere']> = []
    for (const t of teileListe) {
      const ta = analysiere(ix, t, opt)
      const sinnvoll = ta.begriffe.filter(x => !x.schwach && x.bekannt).length >= 2 || ta.codes.length > 0
      if (!sinnvoll) continue
      const tb = bewerte(ta)
      if (tb.vorschlag && !mehrere.some(m => m.vorschlag.p.id === tb.vorschlag!.p.id)) mehrere.push({ teil: t, vorschlag: tb.vorschlag, sicherheit: tb.sicherheit })
    }
    if (mehrere.length >= 2) erg.mehrere = mehrere
  }
  return erg
}
