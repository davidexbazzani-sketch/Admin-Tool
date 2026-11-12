// ── Problem-Assistent: Gesamtkatalog ─────────────────────────────────────────
import type { PaProblem } from '../types'
import { PROBLEME_KOMMUNIKATION } from './kommunikation'
import { PROBLEME_OFFICE } from './office'
import { PROBLEME_NETZ } from './netz'
import { PROBLEME_ARBEITSPLATZ } from './arbeitsplatz'
import { PROBLEME_SYSTEM } from './system'
import { PROBLEME_KOMMUNIKATION2 } from './kommunikation2'
import { PROBLEME_OFFICE2 } from './office2'
import { PROBLEME_NETZ2 } from './netz2'
import { PROBLEME_ARBEITSPLATZ2 } from './arbeitsplatz2'
import { PROBLEME_SYSTEM2 } from './system2'

import { PROBLEME_TEAMS3 } from './teams3'
import { PROBLEME_OUTLOOK3 } from './outlook3'
import { PROBLEME_OFFICE3 } from './office3'
import { PROBLEME_CLOUD3 } from './cloud3'
import { PROBLEME_NETZ3 } from './netz3'
import { PROBLEME_ZUGANG3 } from './zugang3'
import { PROBLEME_DRUCKER3 } from './drucker3'
import { PROBLEME_PERIPHERIE3 } from './peripherie3'
import { PROBLEME_WINDOWS3 } from './windows3'
import { PROBLEME_KONTO3 } from './konto3'
import { PROBLEME_TMEET4 } from './tmeet4'
import { PROBLEME_TCHAT4 } from './tchat4'
import { PROBLEME_OLMAIL4 } from './olmail4'
import { PROBLEME_OLORG4 } from './olorg4'
import { PROBLEME_EXCEL4 } from './excel4'
import { PROBLEME_WORD4 } from './word4'
import { PROBLEME_CLOUD4 } from './cloud4'
import { PROBLEME_WEB4 } from './web4'
import { PROBLEME_NETZ4 } from './netz4'
import { PROBLEME_WLAN4 } from './wlan4'
import { PROBLEME_LW4 } from './lw4'
import { PROBLEME_DRUCK4 } from './druck4'
import { PROBLEME_HW4 } from './hw4'
import { PROBLEME_AV4 } from './av4'
import { PROBLEME_BILD4 } from './bild4'
import { PROBLEME_WIN4 } from './win4'
import { PROBLEME_LEIST4 } from './leist4'
import { PROBLEME_PROG4 } from './prog4'
import { PROBLEME_KONTO4 } from './konto4'
import { PROBLEME_SAPCAD4 } from './sapcad4'
import { PROBLEME_TICKETS5 } from './tickets5'
import { VARIANTEN_TEAMS } from './varianten/teams'
import { VARIANTEN_OUTLOOK } from './varianten/outlook'
import { VARIANTEN_OFFICE } from './varianten/office'
import { VARIANTEN_CLOUD } from './varianten/cloud'
import { VARIANTEN_NETZ } from './varianten/netz'
import { VARIANTEN_ZUGANG } from './varianten/zugang'
import { VARIANTEN_DRUCKER } from './varianten/drucker'
import { VARIANTEN_PERIPHERIE } from './varianten/peripherie'
import { VARIANTEN_WINDOWS } from './varianten/windows'
import { VARIANTEN_KONTO } from './varianten/konto'
import { VARIANTEN_TICKETS } from './varianten/tickets'

/** Zusätzliche Beschreibungen bestehender Probleme (aus varianten/*.ts), je Problem-ID zusammengeführt. */
export const VARIANTEN: Record<string, string[]> = {}
for (const v of [VARIANTEN_TEAMS, VARIANTEN_OUTLOOK, VARIANTEN_OFFICE, VARIANTEN_CLOUD, VARIANTEN_NETZ, VARIANTEN_ZUGANG, VARIANTEN_DRUCKER, VARIANTEN_PERIPHERIE, VARIANTEN_WINDOWS, VARIANTEN_KONTO, VARIANTEN_TICKETS]) for (const [id, l] of Object.entries(v)) VARIANTEN[id] = [...(VARIANTEN[id] || []), ...l]

const ROH: PaProblem[] = [
  ...PROBLEME_KOMMUNIKATION, ...PROBLEME_OFFICE, ...PROBLEME_NETZ, ...PROBLEME_ARBEITSPLATZ, ...PROBLEME_SYSTEM,
  ...PROBLEME_KOMMUNIKATION2, ...PROBLEME_OFFICE2, ...PROBLEME_NETZ2, ...PROBLEME_ARBEITSPLATZ2, ...PROBLEME_SYSTEM2,
  ...PROBLEME_TEAMS3, ...PROBLEME_OUTLOOK3, ...PROBLEME_OFFICE3, ...PROBLEME_CLOUD3, ...PROBLEME_NETZ3, ...PROBLEME_ZUGANG3, ...PROBLEME_DRUCKER3, ...PROBLEME_PERIPHERIE3, ...PROBLEME_WINDOWS3, ...PROBLEME_KONTO3,
  // Runde 4
  ...PROBLEME_TMEET4, ...PROBLEME_TCHAT4, ...PROBLEME_OLMAIL4, ...PROBLEME_OLORG4, ...PROBLEME_EXCEL4, ...PROBLEME_WORD4, ...PROBLEME_CLOUD4, ...PROBLEME_WEB4, ...PROBLEME_NETZ4, ...PROBLEME_WLAN4, ...PROBLEME_LW4, ...PROBLEME_DRUCK4, ...PROBLEME_HW4, ...PROBLEME_AV4, ...PROBLEME_BILD4, ...PROBLEME_WIN4, ...PROBLEME_LEIST4, ...PROBLEME_PROG4, ...PROBLEME_KONTO4, ...PROBLEME_SAPCAD4, ...PROBLEME_TICKETS5,
]

/** Grundprobleme: die ersten sechs je Bereich aus den Grundkatalogen — bei sehr kurzer Eingabe zuerst. */
export const KERNPROBLEME = new Set<string>()
{
  const n = new Map<string, number>()
  for (const p of [...PROBLEME_KOMMUNIKATION, ...PROBLEME_OFFICE, ...PROBLEME_NETZ, ...PROBLEME_ARBEITSPLATZ, ...PROBLEME_SYSTEM]) {
    const k = n.get(p.bereich) || 0
    if (k < 6) { KERNPROBLEME.add(p.id); n.set(p.bereich, k + 1) }
  }
}

/** Bei jedem Netzwerk-/Internetproblem wird ZUERST geprüft, ob Zscaler eingeschaltet ist (Vorgabe IT Marine). */
const ZS_BEREICHE = new Set<string>(['Netzwerk & Internet', 'WLAN', 'VPN & Zscaler'])
const ZS_BROWSER = /internet|l(ae|ä)dt nicht|nicht erreichbar|keine verbindung|offline|proxy|zertifikat|err_|dns|zscaler|seite.*(geht|kommt) nicht/i
export function mitZscalerSchritt(p: PaProblem): PaProblem {
  const passt = ZS_BEREICHE.has(p.bereich) || (p.bereich === 'Browser' && ZS_BROWSER.test(p.titel + ' ' + p.stichworte.join(' ')))
  if (!passt || p.schritte.some(s => s.aktion === 'zscaler-status')) return p
  return { ...p, schritte: [{ aktion: 'zscaler-status' }, ...p.schritte] }
}

/** Browser-Probleme: Cache von Edge UND Chrome hilft oft (Vorgabe IT Marine) – „nur Edge“ wird zu „alle Browser“,
 *  fehlt ein Cache-Schritt, wird er angeboten (bei SAP-Web/Fiori angehakt, sonst optional). */
const WEB_SAP = /fiori|webgui|web-?gui|launchpad/i
export function mitBrowserCache(p: PaProblem): PaProblem {
  const text = p.id + ' ' + p.titel
  const sapWeb = WEB_SAP.test(text)
  if (p.bereich !== 'Browser' && !sapWeb) return p
  let schritte = p.schritte.map(s => (s.aktion === 'edge-cache' ? { ...s, aktion: 'browser-cache-alle', titel: s.titel ? s.titel.replace(/Edge-Cache/g, 'Browser-Cache (Edge, Chrome, Firefox)') : undefined } : s))
  if (!schritte.some(s => s.aktion === 'browser-cache-alle')) schritte = [...schritte, sapWeb ? { aktion: 'browser-cache-alle' } : { aktion: 'browser-cache-alle', optional: true }]
  return { ...p, schritte }
}

/** SAP im Browser (Fiori/WebGUI): im Homeoffice braucht es die ZPA-Rolle für SAP – wird nach Zscaler geprüft (liest nur, im AD). */
export function mitSapHomeoffice(p: PaProblem): PaProblem {
  if (!WEB_SAP.test(p.id + ' ' + p.titel) || p.schritte.some(s => s.aktion === 'zpa-rollen-pruefen')) return p
  // Reihenfolge: Zscaler an? → im Homeoffice SAP-Rolle da? → dann erst Tickets/Cache
  const zs = p.schritte.find(s => s.aktion === 'zscaler-status') || { aktion: 'zscaler-status' }
  const schritte = [zs, { aktion: 'zpa-rollen-pruefen', param: 'SAP', titel: 'Im Homeoffice: SAP-Fernzugriff (ZPA-Rolle „Marine Production“) prüfen' }, ...p.schritte.filter(s => s.aktion !== 'zscaler-status')]
  return { ...p, schritte }
}

/** Zusätzliche Anwender-Formulierungen (Suche), zentral gepflegt. */
const ZUSATZ_BESCHREIBUNGEN: Record<string, string[]> = {
  'sap-fiori-browser': ['Ich komme nicht in Fiori rein', 'Kommt nicht ins Fiori-Launchpad rein', 'Fiori geht nicht auf', 'Fiori lädt nicht im Homeoffice', 'Anmeldung an Fiori klappt nicht', 'Fiori-Seite bleibt weiß oder dreht sich nur'],
  'browser-sap-fiori': ['Fiori fragt nach Benutzer und Kennwort', 'Ich komme nicht in Fiori rein, es kommt eine Anmeldemaske', 'Fiori Anmeldung schlägt fehl'],
}

export const PROBLEME: PaProblem[] = ROH.map(p => {
  const extra = [...(VARIANTEN[p.id] || []), ...(ZUSATZ_BESCHREIBUNGEN[p.id] || [])]
  const mit = extra.length ? { ...p, beschreibungen: [...(p.beschreibungen || []), ...extra] } : p
  return mitSapHomeoffice(mitBrowserCache(mitZscalerSchritt(mit)))
})
