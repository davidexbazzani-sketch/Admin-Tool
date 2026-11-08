// ── ServiceNow Welt: alle Bestellungen, Anträge und Ticket-Formulare aus skfprod ──
// Grundstand: katalog.json (Service-Portal skfprod, 1301 Einträge, die SKF-Mitarbeiter sehen,
// gelesen am 07.11.2026). Gesucht wird auf Deutsch: deutsche Begriffe werden auf die englischen
// ServiceNow-Namen übersetzt (Berechtigung → access, Handy → mobile …). Rein, ohne Electron.

export interface SnEintrag {
  id: string
  n: string            // Name
  k: string            // Kategorie
  kat: string[]        // Kataloge
  typ: string          // catalog_item | record_producer | order_guide | content_item | portal
  cls?: string
  b: string            // Kurzbeschreibung
  d: string            // Beschreibung (gekürzt)
  url?: string
}
export interface SnKatalog { instanz: string; stand: string; anzahl: number; eintraege: SnEintrag[] }

export const SN_ART: Record<string, { titel: string; kurz: string }> = {
  catalog_item: { titel: 'Bestellen / Beantragen', kurz: 'Antrag' },
  order_guide: { titel: 'Bestell-Assistent', kurz: 'Assistent' },
  record_producer: { titel: 'Ticket / Meldung', kurz: 'Ticket' },
  content_item: { titel: 'Link', kurz: 'Link' },
  portal: { titel: 'Portalseite', kurz: 'Portal' },
}

/** Feste Portalseiten (am 07.11.2026 auf skfprod geprüft). */
export const PORTAL_SEITEN: SnEintrag[] = [
  { id: 'requests', n: 'Meine Anfragen und Tickets', k: 'Portal', kat: [], typ: 'portal', b: 'Alle eigenen offenen und geschlossenen Anfragen, Bestellungen und Tickets ansehen – Status, Rückfragen, Kommentare.', d: 'my requests tickets status meine anfragen bestellstatus offene tickets' },
  { id: 'approvals', n: 'Meine Genehmigungen', k: 'Portal', kat: [], typ: 'portal', b: 'Anträge, die auf deine Genehmigung warten (genehmigen oder ablehnen).', d: 'approvals approve reject genehmigen freigeben ablehnen manager' },
  { id: 'sc_home', n: 'Service-Katalog (Startseite)', k: 'Portal', kat: [], typ: 'portal', b: 'Alle Kataloge und Kategorien im Überblick.', d: 'catalog home katalog bestellen uebersicht' },
  { id: 'kb_home', n: 'Wissensdatenbank (Knowledge)', k: 'Portal', kat: [], typ: 'portal', b: 'Anleitungen und Knowledge-Artikel.', d: 'knowledge base kb artikel anleitung howto wiki' },
  { id: 'ec_dashboard_esc', n: 'ServiceNow-Portal Startseite', k: 'Portal', kat: [], typ: 'portal', b: 'Einstieg ins SKF ServiceNow-Portal.', d: 'portal home dashboard startseite' },
  { id: 'ec_requests', n: 'Anfragen (Übersicht)', k: 'Portal', kat: [], typ: 'portal', b: 'Übersicht der Anfragen im Portal.', d: 'requests overview anfragen' },
]

export function snLink(instanz: string, e: SnEintrag): string {
  const base = instanz.replace(/\/+$/, '')
  if (e.typ === 'portal') return `${base}/sp?id=${e.id}`
  if (e.url) return /^https?:\/\//i.test(e.url) ? e.url : base + (e.url.startsWith('/') ? '' : '/') + e.url
  if (e.typ === 'order_guide') return `${base}/sp?id=sc_cat_item_guide&sys_id=${e.id}`
  return `${base}/sp?id=sc_cat_item&sys_id=${e.id}`
}
export function snPortalSuche(instanz: string, q: string): string {
  return `${instanz.replace(/\/+$/, '')}/sp?id=search&q=${encodeURIComponent(q.trim())}`
}

// ── Deutsch → ServiceNow-Begriffe ────────────────────────────────────────────
// Schlüssel = gefaltetes deutsches Wort (Wortanfang genügt ab 4 Zeichen), Wert = Suchbegriffe.
const DE: [string[], string[]][] = [
  [['berechtigung', 'berechtigungen', 'zugriff', 'zugriffsrecht', 'rechte', 'recht', 'zugang'], ['access', 'permission', 'rights', 'authorization', 'role']],
  [['aktivieren', 'aktivierung', 'freischalten', 'freischaltung', 'einschalten', 'deaktivieren', 'abschalten', 'sperren'], ['activation', 'activate', 'deactivation', 'enable', 'disable']],
  [['lizenz', 'lizenzen', 'lizens'], ['license', 'licence', 'subscription']],
  [['bestellen', 'bestellung', 'beantragen', 'antrag', 'anfordern', 'anforderung', 'brauche', 'benoetige', 'haben'], ['request', 'order']],
  [['neu', 'neue', 'neuer', 'neues', 'anlegen', 'erstellen', 'einrichten'], ['new', 'create', 'creation', 'setup', 'add']],
  [['entfernen', 'loeschen', 'wegnehmen', 'entziehen', 'abmelden'], ['remove', 'removal', 'delete', 'deletion', 'revoke']],
  [['aendern', 'aenderung', 'anpassen', 'umstellen', 'wechseln', 'modifizieren'], ['change', 'modify', 'update']],
  [['verlaengern', 'verlaengerung'], ['extend', 'extension', 'renew', 'renewal']],
  [['laptop', 'notebook', 'rechner', 'computer', 'pc', 'arbeitsplatz', 'geraet', 'hardware'], ['laptop', 'notebook', 'desktop', 'pc', 'computer', 'hardware', 'device']],
  [['bildschirm', 'monitor'], ['monitor', 'display', 'screen']],
  [['dockingstation', 'docking', 'dock'], ['docking', 'dock']],
  [['maus', 'tastatur', 'zubehoer', 'headset', 'kopfhoerer', 'webcam', 'kabel', 'adapter'], ['accessory', 'accessories', 'peripheral', 'mouse', 'keyboard', 'headset']],
  [['handy', 'smartphone', 'mobiltelefon', 'diensthandy', 'iphone', 'mobil', 'tablet', 'ipad'], ['mobile', 'phone', 'smartphone', 'iphone', 'mobility', 'tablet']],
  [['sim', 'simkarte', 'esim', 'rufnummer', 'mobilfunk', 'datenvolumen', 'roaming'], ['sim', 'mobile', 'subscription', 'mobility', 'roaming']],
  [['telefon', 'festnetz', 'telefonie', 'durchwahl', 'telefonnummer', 'xelion'], ['telephony', 'phone', 'telephone', 'extension']],
  [['drucker', 'drucken', 'druck', 'scanner', 'scannen', 'multifunktionsdrucker'], ['printer', 'print', 'printing', 'scanner', 'mfp']],
  [['netzwerk', 'lan', 'netz', 'kabelnetz'], ['network', 'lan']],
  [['netzwerkdose', 'dose', 'netzwerkanschluss', 'anschluss', 'port', 'switchport', 'switch'], ['switch', 'port', 'lan', 'network']],
  [['wlan', 'wifi', 'funknetz'], ['wifi', 'wireless', 'wlan']],
  [['fernzugriff', 'homeoffice', 'remote', 'fernwartung'], ['remote', 'zpa']],        // bei SKF: Fernzugriff = ZPA
  [['vpn'], ['vpn', 'zpa', 'remote']],
  [['zscaler', 'zpa', 'zia'], ['zscaler', 'zpa', 'zia']],
  [['firewall', 'freigabe', 'portfreigabe'], ['firewall', 'rule', 'whitelist']],
  [['website', 'webseite', 'internetseite', 'url', 'seite', 'gesperrt', 'blockiert'], ['website', 'url', 'whitelist', 'proxy', 'zscaler', 'site']],
  [['postfach', 'mailbox', 'email', 'mail', 'outlook'], ['mailbox', 'email', 'mail', 'outlook', 'exchange']],
  [['gruppenpostfach', 'funktionspostfach', 'sammelpostfach', 'teampostfach'], ['shared', 'functional', 'mailbox']],
  [['verteiler', 'verteilerliste', 'mailverteiler'], ['distribution', 'list', 'dl']],
  [['stellvertreter', 'stellvertretung', 'vertretung', 'delegation', 'delegieren'], ['delegation', 'delegate', 'delegates']],
  [['kalender', 'termin', 'raum', 'besprechungsraum', 'meetingraum'], ['calendar', 'room', 'meeting', 'resource']],
  [['gruppe', 'gruppen', 'adgruppe', 'sicherheitsgruppe'], ['group', 'groups', 'security']],
  [['konto', 'benutzerkonto', 'account', 'benutzer', 'kennung', 'userid'], ['account', 'user', 'id', 'identity']],
  [['passwort', 'kennwort', 'pin', 'gesperrt', 'entsperren'], ['password', 'reset', 'unlock', 'locked']],
  [['mfa', 'authenticator', 'zweifaktor', '2fa'], ['mfa', 'authenticator', 'multi', 'factor']],
  [['software', 'programm', 'anwendung', 'app', 'installieren', 'installation', 'tool'], ['software', 'install', 'installation', 'application', 'app']],
  [['deinstallieren', 'deinstallation'], ['uninstall', 'uninstallation', 'removal']],
  [['ordner', 'netzlaufwerk', 'laufwerk', 'share', 'freigabeordner', 'verzeichnis'], ['folder', 'share', 'shared', 'drive', 'network']],
  [['teams'], ['teams']],
  [['kanal'], ['channel', 'teams']],
  [['sharepoint', 'seite', 'teamseite', 'intranet'], ['sharepoint', 'site']],
  [['onedrive', 'speicher', 'speicherplatz', 'kontingent'], ['onedrive', 'storage', 'quota']],
  [['zertifikat', 'zertifikate', 'ssl'], ['certificate', 'certificates', 'ssl', 'sectigo']],
  [['adminrechte', 'administrator', 'admin', 'lokaleadminrechte', 'erhoehte'], ['admin', 'administrator', 'local', 'elevated', 'privileged']],
  [['ki', 'kuenstliche', 'copilot', 'chatgpt', 'ai'], ['copilot', 'ai', 'gpt']],
  [['mitarbeiter', 'eintritt', 'neuermitarbeiter', 'neueinstellung', 'onboarding', 'einstellung'], ['new', 'hire', 'onboarding', 'joiner', 'employee']],
  [['austritt', 'ausscheiden', 'kuendigung', 'verlassen', 'offboarding'], ['leaver', 'leaving', 'offboarding', 'termination', 'exit']],
  [['versetzung', 'abteilungswechsel', 'umzug'], ['mover', 'transfer', 'move', 'moving', 'relocation']],
  [['stoerung', 'problem', 'fehler', 'kaputt', 'defekt', 'geht', 'funktioniert', 'ticket', 'melden', 'hilfe', 'incident'], ['incident', 'issue', 'problem', 'broken', 'help', 'support', 'case']],
  [['server', 'vm', 'virtuell', 'hosting'], ['server', 'virtual', 'machine', 'vm', 'hosting']],
  [['datenbank', 'sql'], ['database', 'sql']],
  [['sicherung', 'backup', 'wiederherstellen', 'wiederherstellung'], ['backup', 'restore', 'recovery']],
  [['sap'], ['sap']],
  [['rolle', 'rollen'], ['role', 'roles']],
  [['reise', 'reisekosten', 'spesen'], ['travel', 'expense', 'concur']],
  [['kostenstelle', 'kosten', 'rechnung'], ['cost', 'center', 'invoice', 'finance']],
  [['ausweis', 'badge', 'zutritt', 'zutrittskarte', 'schluessel', 'zugangskarte'], ['badge', 'badges', 'access', 'key', 'card']],
  [['moebel', 'stuhl', 'schreibtisch', 'buero'], ['furniture', 'desk', 'chair', 'office']],
  [['reinigung', 'putzen'], ['cleaning']],
  [['haustechnik', 'gebaeude', 'facility', 'facilities', 'hausmeister', 'reparatur', 'instandhaltung'], ['facilities', 'facility', 'building', 'maintenance', 'repair']],
  [['sicherheit', 'arbeitssicherheit', 'unfall'], ['safety', 'security']],
  [['idee', 'vorschlag', 'feedback'], ['idea', 'thoughts', 'feedback']],
  [['urlaub', 'abwesenheit', 'teilzeit', 'arbeitszeit', 'elternzeit', 'nebentaetigkeit'], ['leave', 'absence', 'working', 'hours', 'part', 'secondary', 'employment']],
  [['persoenlich', 'adresse', 'bankverbindung', 'name'], ['personal', 'details', 'data']],
  [['powerbi', 'bericht', 'report', 'reports', 'auswertung'], ['power', 'bi', 'report', 'reports', 'dashboard']],
  [['powerapps', 'powerautomate', 'flow'], ['power', 'platform', 'apps', 'automate']],
  [['github', 'git', 'devops', 'entwickler'], ['github', 'devops', 'git', 'developer']],
  [['azure', 'cloud', 'entra'], ['azure', 'cloud', 'entra']],
  [['usb', 'stick', 'speichermedium'], ['usb', 'removable', 'storage']],
  [['fabrik', 'fertigung', 'produktion', 'maschine', 'anlage', 'shopfloor', 'ot'], ['factory', 'shopfloor', 'machine', 'production', 'mes', 'ot']],
  [['termin', 'vorortservice', 'walkup', 'vorbeikommen'], ['walk', 'appointment']],
  [['aenderungsantrag', 'change'], ['change', 'standard', 'normal']],
  [['solidworks', 'cad', 'pdm'], ['solidworks', 'cad', 'pdm']],
  [['adobe', 'acrobat', 'pdf'], ['adobe', 'acrobat', 'pdf']],
  [['visio', 'project', 'msproject'], ['visio', 'project']],
]

const UML: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }
export function falteSn(s: string): string {
  return (s || '').toLowerCase().replace(/[äöüß]/g, c => UML[c]).replace(/[^a-z0-9]+/g, ' ').trim()
}
const STOPP = new Set('der die das den dem des ein eine einen einem einer und oder mit von bei im in am an auf zu zum zur ich mein meine meinen mir mich wir fuer ueber nach wie was wo wer bitte hallo mal noch auch kann koennen moechte will soll muss neuen the a an of and to for in on with my i'.split(' '))
const GENERISCH = new Set(['request', 'order', 'new', 'create', 'add', 'change', 'modify', 'update', 'remove', 'access', 'service', 'services', 'form', 'support', 'help'])

/** Deutsche Wörter → Suchbegriffe mit Gewicht: getipptes Wort 1 · Übersetzung 0,8 · Teil eines zusammengesetzten Worts 0,45. */
export function erweitereGewichtet(wort: string): Map<string, number> {
  const w = falteSn(wort)
  const aus = new Map<string, number>([[w, 1]])
  const plus = (t: string, g: number) => { if ((aus.get(t) || 0) < g) aus.set(t, g) }
  for (const [de, en] of DE) {
    if (de.some(d => d === w || (w.length >= 5 && (w.startsWith(d) || (d.length >= 5 && d.startsWith(w)))))) for (const e of en) plus(e, 0.8)
  }
  // zusammengesetzte Wörter: „druckerberechtigung“, „postfachzugriff“
  if (w.length >= 9) for (const [de, en] of DE) for (const d of de) if (d.length >= 4 && w.includes(d) && w !== d) for (const e of en) plus(e, 0.45)
  return aus
}
export function erweitere(wort: string): string[] { return [...erweitereGewichtet(wort).keys()] }

interface Doku { e: SnEintrag; n: string[]; k: string[]; b: string[]; d: string[]; alle: Set<string> }
export interface SnIndex { doks: Doku[]; df: Map<string, number>; vokabular: string[]; instanz: string; stand: string }
export interface SnTreffer { e: SnEintrag; punkte: number; link: string }

const worte = (s: string) => falteSn(s).split(' ').filter(x => x.length > 1)

export function baueSnIndex(k: SnKatalog): SnIndex {
  // doppelte Einträge (gleicher Name + Kategorie + Text) nur einmal
  const gesehen = new Set<string>()
  const liste = [...PORTAL_SEITEN, ...k.eintraege].filter(e => { const s = (e.n + '|' + e.k + '|' + e.b).toLowerCase(); if (gesehen.has(s)) return false; gesehen.add(s); return true })
  const doks: Doku[] = liste.map(e => {
    const n = worte(e.n), kk = worte(e.k), b = worte(e.b), d = worte(e.d)
    return { e, n, k: kk, b, d, alle: new Set([...n, ...kk, ...b, ...d]) }
  })
  const df = new Map<string, number>()
  for (const x of doks) for (const w of x.alle) df.set(w, (df.get(w) || 0) + 1)
  return { doks, df, vokabular: [...df.keys()], instanz: k.instanz, stand: k.stand }
}

function abstand(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 9
  const m = a.length, n = b.length
  let vor = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const jetzt = [i]
    for (let j = 1; j <= n; j++) jetzt[j] = Math.min(vor[j] + 1, jetzt[j - 1] + 1, vor[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    vor = jetzt
  }
  return vor[n]
}

/** Passt ein Suchbegriff auf ein Wort? exakt 1 · Wortanfang 0.8 · Vertipper 0.6 */
function passt(begriff: string, wort: string): number {
  if (wort === begriff) return 1
  if (begriff.length >= 3 && wort.startsWith(begriff)) return 0.8
  if (wort.length >= 5 && begriff.length >= 5 && begriff.startsWith(wort)) return 0.7
  return 0
}

export function snSuche(ix: SnIndex, q: string, opt: { art?: string; max?: number } = {}): SnTreffer[] {
  const roh = falteSn(q).split(' ').filter(w => w && !STOPP.has(w))
  if (!roh.length) return []
  const N = ix.doks.length
  // Je eingegebenem Wort ein „Konzept“ mit seinen Suchbegriffen (+ Vertipper aus dem Vokabular)
  const konzepte = roh.map(w => {
    const begriffe = erweitereGewichtet(w)
    if (w.length >= 5 && !ix.df.has(w) && begriffe.size === 1) {
      for (const v of ix.vokabular) if (v.length >= 4 && abstand(w, v) === 1) begriffe.set(v, 0.7)
    }
    const liste = [...begriffe.keys()]
    const generisch = liste.every(b => GENERISCH.has(b) || b === w) && liste.some(b => GENERISCH.has(b))
    return { w, begriffe, gewicht: generisch ? 0.35 : 1 }
  })
  const out: SnTreffer[] = []
  for (const x of ix.doks) {
    if (opt.art && x.e.typ !== opt.art) continue
    let punkte = 0, getroffen = 0, gesamt = 0
    for (const k of konzepte) {
      gesamt += k.gewicht
      let best = 0
      for (const [b, bg] of k.begriffe) {
        // seltene Wörter zählen mehr — aber gedeckelt, sonst gewinnt ein zufälliges Nebenwort
        const idf = Math.log(1 + N / (1 + Math.max(8, ix.df.get(b) || 1)))
        for (const [feld, fw] of [[x.n, 5], [x.k, 2.5], [x.b, 2], [x.d, 0.8]] as [string[], number][]) {
          let p = 0
          for (const w of feld) { const s = passt(b, w); if (s > p) p = s; if (p === 1) break }
          if (p) best = Math.max(best, p * fw * idf * bg)
        }
      }
      if (best > 0) { getroffen += k.gewicht; punkte += best * k.gewicht }
    }
    if (!punkte) continue
    const abdeckung = getroffen / gesamt
    // ganze Eingabe als Phrase im Namen
    const phrase = roh.length > 1 && falteSn(x.e.n).includes(roh.join(' ')) ? 4 : 0
    let p = punkte * (0.4 + abdeckung * abdeckung) + phrase
    if (x.e.typ === 'portal') p *= 1.15
    out.push({ e: x.e, punkte: p, link: snLink(ix.instanz, x.e) })
  }
  out.sort((a, b) => b.punkte - a.punkte || a.e.n.localeCompare(b.e.n))
  // nur Treffer, die gegenüber dem besten nicht völlig abfallen
  const top = out[0]?.punkte || 0
  return out.filter(t => t.punkte >= top * 0.12).slice(0, opt.max ?? 60)
}

/** Häufig gebraucht (Startansicht ohne Eingabe) — per Name im Katalog gefunden. */
export const HAEUFIG: { titel: string; muster: RegExp }[] = [
  { titel: 'Störung melden (Ticket)', muster: /^Submit a Support Case \(Incident\)$|^Submit a Quick Incident$/i },
  { titel: 'Field-Service-Ticket', muster: /^Create Incident - Field Service$/i },
  { titel: 'Copilot-Lizenz', muster: /^M365 Copilot License Request$/i },
  { titel: 'Postfach-Stellvertretung', muster: /^Delegation Rights to Person's Mailbox/i },
  { titel: 'Switchport (LAN)', muster: /^Switch port activation\/deactivation$/i },
  { titel: 'Neue PC-Hardware einrichten', muster: /^Engage Field Service Team for New PC/i },
  { titel: 'Fernzugriff (ZPA)', muster: /^ZPA Client Role/i },
  { titel: 'Firewall / LAN', muster: /^Service Request for updating the Azure firewall, LAN or Perimeter firewall$/i },
]
