// ── \\W3172\SKF Marine (Laufwerk I:): welcher Ordner hängt an welcher AD-Gruppe? ─────────────
// Quelle: Berechtigungs-Abzug vom 08.11.2026 (Einstellungen → Berechtigungs-Abzug, Ordner-ACLs bis Ebene 2,
// Gruppen über die Beschreibung „RW/RO access to \\w3172\…“). Nur Gruppen- und Ordnernamen – keine Personen.
// Regeln auf dem Server:
//   • „SKF Marine“ selbst: alle Benutzer lesen.
//   • Bereichsordner (Ebene 1, z. B. „0200 Products“): Domain Users lesen, niemand schreibt.
//   • Unterordner (Ebene 2): Vererbung ist aus – Zugriff NUR über die eigene Gruppe (…-RW ändern, …-RO lesen).
//     Ausnahme „jederLesen“: Vererbung an, Domain Users lesen mit.
// Das Tool ändert NIE Berechtigungen – es nennt nur die Gruppe und den ServiceNow-Antrag.

export const W3172_STAND = '08.11.2026'
export const W3172_ANTRAG = 'Fileshare Access Request'
const P = 'DEHAM-W3172_'

export interface W3172Ordner {
  /** Bereich + Ordner (+ Unterordner), wie auf dem Server */
  segmente: string[]
  /** Gruppen mit Ändern (Modify) */
  rw: string[]
  /** Gruppen mit Lesen */
  ro: string[]
  /** Vererbung an: Domain Users dürfen lesen */
  jederLesen?: boolean
  /** Domain Users dürfen ändern */
  jederSchreiben?: boolean
  /** Im ACL stehen Einträge gelöschter Gruppen (nur SID) */
  verwaist?: boolean
  /** Im ACL stehen zusätzlich einzelne Benutzerkonten */
  einzelkonten?: boolean
  hinweis?: string
}

type Z = [string, string, string[], string[], string?, string?]
// Flags: J = jeder lesen · S = jeder schreiben · V = verwaiste Einträge · E = Einzelkonten
const g = (s: string) => (s.startsWith('!') ? s.slice(1) : P + s)

const ZEILEN: Z[] = [
  // 000 Executive Office
  ['000 Executive Office', '000 general', ['000 Executive Office_000 general-RW'], []],
  ['000 Executive Office', '001 Marketing  Comms', [], [], '', 'Keine Gruppe im ACL – nur Administratoren/HCL haben Zugriff.'],
  ['000 Executive Office', '002 EHS Site Manager', ['000 Executive Office_002 EHS Site Manager-RW'], []],
  ['000 Executive Office', '003 Workers Council', ['000 Executive Office_003 Workers Council-RW'], []],
  ['000 Executive Office', '004 YaA represativ Council', ['000 Executive Office_004 YaA represativ Council-RW'], []],
  ['000 Executive Office', '050 management circle', ['000 Executive Office_050 management circle-RW'], []],
  ['000 Executive Office', '051 management circle (Hanstedt)', ['000 Executive Office_051 Mgmt circle-Hanstedt-RW'], []],
  ['000 Executive Office', '052 Budgeting', ['000 Executive Office_052 Budgeting-RW'], [], 'J'],
  ['000 Executive Office', '053 SCM projekt', ['000 Executive Office_053 SCM projekt-RW'], []],
  ['000 Executive Office', '054 Internal', ['000 Executive Office_054 Internal-RW'], []],
  ['000 Executive Office', '055 Internal department goals', ['000 Executive Office_055 Internal dept goals-RW'], []],
  ['000 Executive Office', '056 non-disclosure agreement', ['000 Executive Office_056 non-disclosure agreement-RW'], ['000 Executive Office_056 non-disclosure agreement-RO']],
  ['000 Executive Office', '057 Internal report portfolio', ['000 Executive Office_057 InternalReport portfolio-RW'], []],
  ['000 Executive Office', '058 patents & brands', ['000 Executive Office_058 patents  & brands-RW'], []],
  ['000 Executive Office', '059 Contract original', ['000 Executive Office_059 Contract original-RW'], ['000 Executive Office_059 Contract original-RO']],
  ['000 Executive Office', '061 Budget evalution', ['000 Executive Office_061 Budget evalution-RW'], []],
  ['000 Executive Office', '062 Privacy protection', ['000 Executive Office_062 Privacy protection-RW'], []],
  // 0100 Sales
  ['0100 Sales', '100 Sales general', [], [], 'V', 'Nur Einträge gelöschter Gruppen im ACL – es gibt keine gültige Gruppe. Ordnerverantwortlichen bitten, über ServiceNow eine Gruppe anlegen zu lassen.'],
  ['0100 Sales', '101 Hamburg', ['0100 Sales_101 Hamburg-RW'], []],
  ['0100 Sales', '102 New Building Sales manager', ['0100 Sales_102 New Building  Sales manager-RW'], []],
  ['0100 Sales', '103 After Sales manager', ['0100 Sales_103 After Sales manager-RW'], []],
  ['0100 Sales', '104 Shaft  Stabi Steering gear', ['0100 Sales_104-Shaft-Stabi-Steering-gear-RW'], [], '', 'Es gibt daneben einen fast gleich heißenden Ordner „104 Shaft Stabi Steering gear“ (ein Leerzeichen) ohne eigene Gruppe – auf den richtigen Ordner achten.'],
  ['0100 Sales', '105 GL', [], [], 'V', 'Nur Eintrag einer gelöschten Gruppe im ACL – keine gültige Gruppe vorhanden.'],
  ['0100 Sales', '107 Yacht Account', [], [], 'V', 'Nur Eintrag einer gelöschten Gruppe im ACL – keine gültige Gruppe vorhanden.'],
  ['0100 Sales', '108 Cruise Account', [], [], 'V', 'Nur Eintrag einer gelöschten Gruppe im ACL – keine gültige Gruppe vorhanden.'],
  ['0100 Sales', '109 OEM Account', ['0100 Sales_109 OEM Account-RW'], [], 'J'],
  ['0100 Sales', '110 Reg. Mgr EMEA North', [], [], 'V', 'Nur Eintrag einer gelöschten Gruppe im ACL – keine gültige Gruppe vorhanden.'],
  // 0200 Products
  ['0200 Products', '200 Products general', ['0200 Products_200 Products general-RW'], []],
  ['0200 Products', '210 Products Shafts', ['0200 Products_210 Products Shafts-RW'], []],
  ['0200 Products', '211 Navy Shafts', ['0200 Products_211 Navy Shafts-RW'], []],
  ['0200 Products', '212 Shaft Components Mngt', ['0200 Products_212 Shaft Components Mngt-RW'], []],
  ['0200 Products', '213 Shaft Components Engineering', ['0200 Products_213 Shaft Components Engineering-RW'], [], 'E'],
  ['0200 Products', '214 Design Internal', ['0200 Products_214 Design Internal-RW'], []],
  ['0200 Products', '215 R&D Internal', ['0200 Products_215 R&D Internal-RW'], [], 'E'],
  ['0200 Products', '216 Sales Information', [], [], 'JV', 'Lesen darf jeder; Schreiben nur über eine gelöschte Gruppe – keine gültige Schreibgruppe vorhanden.'],
  ['0200 Products', '220 Stabilizer', ['0200 Products_220 Stabilizer-RW'], []],
  ['0200 Products', '221 Control & Drive', ['0200 Products_221 Control & Drivel-RW'], [], 'E'],
  ['0200 Products', '222 R&D', ['0200 Products_222 R&D-RW'], []],
  ['0200 Products', '223 ID', ['0200 Products_223 ID-RW'], []],
  ['0200 Products', '225 Management', ['0200 Products_225 Management-RW'], []],
  ['0200 Products', '226 Management departments', ['0200 Products_226 Management departments-RW'], []],
  ['0200 Products', '230 1 OWS & BWMS Leitung', ['0200 Products_230 1 OWS & BWMS Leitung-RW'], []],
  ['0200 Products', '230 OWS & BWMS', ['0200 Products_230 OWS & BWMS-RW'], ['0200 Products_230 OWS & BWMS-RO']],
  ['0200 Products', '231 1 OWS Order Processing', ['0200 Products_231 1 OWS Order Processing-RW'], ['0200 Products_231 1 OWS Order Processing-RO'], 'E'],
  ['0200 Products', '232 Documentation', ['0200 Products_232 Documentation-RW'], ['0200 Products_232 Documentation-RO']],
  ['0200 Products', '233 5 Design internal', ['0200 Products_233 5 Design internal-RW'], []],
  ['0200 Products', '233 6 Design_SpecialCustomerProjects', ['0200 Products_233 6 Design_SplCustomerProjects-RW'], []],
  ['0200 Products', '233 Design', ['0200 Products_233 Design-RW'], ['0200 Products_233 Design-RO']],
  ['0200 Products', '234 Service', ['0200 Products_234 Service-RW'], ['0200 Products_234 Service-RO']],
  ['0200 Products', '235 Approvals', ['0200 Products_235 Approvals-RW'], ['0200 Products_235 Approvals-RO']],
  ['0200 Products', '240 BWMS', ['0200 Products_240 BWMS-RW'], ['0200 Products_240 BWMS-RO']],
  ['0200 Products', '270 Manufacturing', ['0200 Products_270 Manufacturing-RW'], []],
  ['0200 Products', '271 Production management', ['0200 Products_271 Production management-RW'], []],
  ['0200 Products', '272 Production Support', ['0200 Products_272 Production Support-RW'], []],
  ['0200 Products', '273 Shaft Components', ['0200 Products_273 Shaft Components-RW'], []],
  ['0200 Products', '274 Stabilizer Steer G', ['0200 Products_274 Stabilizer Steer G-RW'], []],
  ['0200 Products', '275 Lichtpauserei', ['SKF Marine2_0200 Products_275 Lichtpauserei-RW'], [], '', 'Wirksam ist nur die Gruppe „…SKF Marine2_0200 Products_275 Lichtpauserei-RW“. Die gleichnamige Gruppe ohne „SKF Marine2“ steht NICHT im ACL – Mitgliedschaft dort bringt keinen Zugriff.'],
  // 300 / 400
  ['300 Finance', '300 Finance', ['300 Finance _300 Finance-RW'], []],
  ['300 Finance', '301 Finance Management', ['300 Finance _301 Finance Management-RW'], []],
  ['400 Human Ressources', '400 Human Ressources', ['400 Human Ressources_400 Human Ressources-RW'], []],
  ['400 Human Ressources', '401 HR Management', ['400 Human Ressources_401 HR Management-RW'], []],
  ['400 Human Ressources', '402 Trainee', ['400 Human Ressources_402 Trainee-RW'], []],
  // 500 Supply Chain Mgmt
  ['500 Supply Chain Mgmt', '500 Supply Chain Mgmt', ['500 Supply Chain Mgmt _500 Supply Chain Mgmt-RW'], []],
  ['500 Supply Chain Mgmt', '510 Procurement', ['500 Supply Chain Mgmt _510 Procurement-RW'], []],
  ['500 Supply Chain Mgmt', '511 Procurement SAP', ['500 Supply Chain Mgmt _511 Procurement SAP-RW'], ['500 Supply Chain Mgmt_511 Procurement SAP-RO']],
  ['500 Supply Chain Mgmt', '520 Production Services general', ['500 Supply Chain Mgmt _520 Prod Services general-RW'], []],
  ['500 Supply Chain Mgmt', '521 Production Services key data', ['500 Supply Chain Mgmt _521 Prod Services key data-RW'], []],
  ['500 Supply Chain Mgmt', '522 Material Logistics', ['500 Supply Chain Mgmt _522 Material Logistics-RW'], []],
  ['500 Supply Chain Mgmt', '522 Material Logistics manag', ['500 Supply Chain Mgmt _522 Material Logisticmanag-RW'], []],
  ['500 Supply Chain Mgmt', '523 Dispatchment', ['500 Supply Chain Mgmt _523 Dispatchment-RW'], []],
  ['500 Supply Chain Mgmt', '523 Dispatchment manag', ['500 Supply Chain Mgmt _523 Dispatchment manag-RW'], []],
  ['500 Supply Chain Mgmt', '524 Central Disposition', ['500 Supply Chain Mgmt _524 Central Disposition-RW'], []],
  ['500 Supply Chain Mgmt', '524 Central Disposition manag', ['500 Supply Chain Mgmt _524 Cent Disposition manag-RW'], []],
  ['500 Supply Chain Mgmt', '525 Maintenance', ['500 Supply Chain Mgmt _525 Maintenance-RW'], [], 'E'],
  ['500 Supply Chain Mgmt', '525 Maintenance manag', ['500 Supply Chain Mgmt _525 Maintenance manag-RW'], []],
  ['500 Supply Chain Mgmt', '526 Office Management', ['500 Supply Chain Mgmt _526 Office Management-RW'], []],
  ['500 Supply Chain Mgmt', '526 Office Management manag', ['500 Supply Chain Mgmt _526 Office Mgmt manag-RW'], []],
  ['500 Supply Chain Mgmt', '530 10 Klassenfreigaben Lieferanten', ['500 Supply Chain Mgmt _530 10 Klass Lieferanten-RW'], ['500 Supply Chain Mgmt_530 10 Klassen Lieferanten-RO'], '', 'Auffällig: die …-RO-Gruppe hat hier zusätzlich Schreibrecht.'],
  ['500 Supply Chain Mgmt', '530 11 QS-Runde', ['500 Supply Chain Mgmt _530 11 QS-Runde-RW'], []],
  ['500 Supply Chain Mgmt', '530 12 Prufplanung', ['500 Supply Chain Mgmt _530 12 Prufplanung-RW'], []],
  ['500 Supply Chain Mgmt', '530 13 Kundenclaim Runde S20', ['500 Supply Chain Mgmt _530 13 Kundenclaim Runde-RW'], []],
  ['500 Supply Chain Mgmt', '530 2 Probelieferung Lieferantendoku', ['500 Supply Chain Mgmt _530 2Prob-ferung Liefedoku-RW'], ['500 Supply Chain Mgmt _530 2 Prob Lieferantendoku-RO']],
  ['500 Supply Chain Mgmt', '530 3 Technische Spezifikation', ['500 Supply Chain Mgmt _530 3 Tech Spezifikation-RW'], ['500 Supply Chain Mgmt _530 3 Techni Spezifikation-RO']],
  ['500 Supply Chain Mgmt', '530 4 Probe Serienlieferung', ['500 Supply Chain Mgmt _530 4 Prob Serienlieferung-RW'], ['500 Supply Chain Mgmt _530 4 Prob Serienlieferung-RO']],
  ['500 Supply Chain Mgmt', '530 5 Serienlieferung Lieferantendoku', ['500 Supply Chain Mgmt _530 5 Serien Lieferanten-RW'], ['500 Supply Chain Mgmt _530 5 Serienlie Lieferante-RO']],
  ['500 Supply Chain Mgmt', '530 6 Wareneingang Prufprotokolle', ['500 Supply Chain Mgmt_530 6 Waren Prufprotokolle-RW'], ['500 Supply Chain Mgmt_530 6 Waren Prufprotokolle-RO']],
  ['500 Supply Chain Mgmt', '530 7 Produktion Prufprotokolle', ['500 Supply Chain Mgmt_530 7 Prod Prufprotokolle-RW'], ['500 Supply Chain Mgmt_530 7 Produ Prufprotokolle-RO']],
  ['500 Supply Chain Mgmt', '530 8 Produktabnahmen', ['500 Supply Chain Mgmt _530 8 Produktabnahmen-RW'], ['500 Supply Chain Mgmt _530 8 Produktabnahmen-RO'], 'V'],
  ['500 Supply Chain Mgmt', '530 9 Vorlagen zum Umstempeln', ['500 Supply Chain Mgmt _530 9 Vorlagen zum Umst-RW'], ['500 Supply Chain Mgmt _530 9 V Z Umstempeln-RO']],
  ['500 Supply Chain Mgmt', '530 Process and Quality Mgmt', ['500 Supply Chain Mgmt _530 Process Quality Mgmt-RW'], []],
  ['500 Supply Chain Mgmt', '532 AWG', ['SKF Marine_500 Supply Chain Mgmt_532 AWG-RW'], []],
  ['500 Supply Chain Mgmt', '533 AWG LTG', ['SKF Marine_500 Supply Chain Mgmt_533 AWG LTG-RW'], []],
  // 600 Projects
  ['600 Projects', '601 Airspace claim', ['600 Projects _601 Airspace claim-RW'], ['600 Projects _601 Airspace claim-RO']],
  ['600 Projects', '602 Asia', ['600 Projects _602 Asia-RW'], []],
  ['600 Projects', '603 Idee', ['600 Projects _603 Idee-RW'], ['600 Projects _603 Idee-RO']],
  ['600 Projects', '604 Six Sigma co-ordinate measure', ['600 Projects _604 Six Sigma co-ordinate measure-RW'], []],
  ['600 Projects', '605 Six Sigma Liner', ['600 Projects _605 Six Sigma Liner-RW'], []],
  ['600 Projects', '606 Six Sigma grinding process', ['600 Projects _606 Six Sigma grinding process-RW'], ['600 Projects _606 Six Sigma grinding process-RO']],
  ['600 Projects', '607 Tidal turbine', [], [], 'V', 'Nur Eintrag einer gelöschten Gruppe im ACL – keine gültige Gruppe vorhanden.'],
  ['600 Projects', '608 Initial sampling', ['600 Projects _608 Initial sampling-RW'], ['600 Projects _608 Initial sampling-RO']],
  ['600 Projects', '609 SCM', ['600 Projects _609 SCM-RW'], []],
  ['600 Projects', '610 Forecast Club', ['600 Projects _610 Forecast Club-RW'], ['600 Projects _610 Forecast Club-RO']],
  ['600 Projects', '611 WK R&D SC3', ['600 Projects _611 WK R&D SC3-RW'], []],
  ['600 Projects', '612 Documentation', ['600 Projects _612 Documentation-RW'], ['600 Projects _612 Documentation-RO'], 'E', 'Auffällig: die …-RO-Gruppe hat hier Vollzugriff (FullControl) statt nur Lesen.'],
  ['600 Projects', '613 BlueRun', ['600 Projects _613 BlueRun-RW'], []],
  ['600 Projects', '614 Intermediate shaft bearing NG', ['600 Projects _614 Intermediate shaft bearing NG-RW'], []],
  ['600 Projects', '615 SKF Marine Academy', [], ['600 Projects _615 SKF Marine Academy-RO'], '', 'Auffällig: Die Gruppe „DEHAM-W3172_600 Projects_615 SKF Marine Academy-RW“ existiert und hat Mitglieder, steht aber NICHT im ACL – sie bringt keinen Schreibzugriff. Fileserver-Team muss die RW-Gruppe im ACL eintragen.'],
  ['600 Projects', '616 Blue Sonic', ['600 Projects _616 Blue Sonic-RW'], []],
  ['600 Projects', '617 approved  exporter', ['600 Projects _617 approved exporter-RW'], []],
  ['600 Projects', '618 Project landscape', ['600 Projects _618 Project landscape-RW'], []],
  ['600 Projects', '619 Production Services Elektrics', ['600 Projects _619 Prod Services Elektrics-RW'], []],
  // 700 Application
  ['700 Application', '701 Eplan', ['700 Application_701 Eplan-RW'], []],
  ['700 Application', '702 Cashline', ['700 Application_702 Cashline-RW'], []],
  ['700 Application', '703 Holiday plans', ['700 Application_703 Holday plans-RW'], []],
  ['700 Application', '704 3D CAD', ['700 Application_704 3D CAD-RW'], ['700 Application_704 3D CAD-RO']],
  ['700 Application', '705 Lloyds Data', [], [], 'V', 'Nur Eintrag einer gelöschten Gruppe im ACL – keine gültige Gruppe vorhanden.'],
  ['700 Application', '706 Nautos', ['700 Application_706 Nautos-RW'], ['700 Application_706 Nautos-RO']],
  ['700 Application', '707 Babtec.Q', ['700 Application_707 Babtec.Q-RW'], [], 'J'],
  ['700 Application', '708 CNC Programmierung', ['700 Application_708 CNC Programmierung-RW', '!Marine_FS_NC_Programmer', '!Marine_FS_Coscom_Admin'], ['!Marine_FS_NCDNC_read'], 'J'],
  ['700 Application', '709 Siemens NX', ['700 Application_709 Siemens NX-RW'], [], 'J'],
  ['700 Application', '710 SolidCAM', ['700 Application_710 SolidCAM-RW'], [], 'J'],
  ['700 Application', '711 IT Allgemein', ['700 Application_711 IT Allgemein-RW'], ['700 Application_711 IT Allgemein-RO'], 'E'],
  ['700 Application', '712 PortaX', ['700 Application_712 PortaX-RW'], [], 'E'],
  ['700 Application', '713 Docuglobe', ['700 Application_713 Docuglobe-RW'], [], 'E'],
  ['700 Application', '714 Office', ['700 Application_714 Office-RW', '!Marine_Support'], []],
  // 800 Groups
  ['800 Groups', '801 Workers Council HR', ['800 Groups_801 Workers Council HR-RW'], []],
  ['800 Groups', '802 Copy Shop', ['800 Groups_802 Copy Shop-RW'], ['800 Groups_802 Copy Shop-RO']],
  ['800 Groups', '803 Supplier management', ['800 Groups_803 Supplier management-RW'], ['800 Groups_803 Supplier management-RO']],
  ['800 Groups', '804 Bulk material', ['800 Groups_804 Bulk material-RW'], []],
  // 900 Archiv
  ['900 Archiv', '901 BWMS', ['900 Archiv_901 BWMS-RW'], ['900 Archiv_901 BWMS-RO']],
  ['900 Archiv', '902 OWS', ['900 Archiv_902 OWS-RW'], []],
  ['900 Archiv', '903 BlueMon', ['900 Archiv_903 BlueMon-RW'], []],
  ['900 Archiv', '904 WK Management', ['900 Archiv_904 WK Management-RW'], []],
  ['900 Archiv', '905 WK data', ['900 Archiv_905 WK data-RW'], [], '', 'Auffällig: Die Gruppe „DEHAM-W3172_900 Archiv_905 WK data-RO“ existiert, steht aber NICHT im ACL – sie bringt keinen Lesezugriff.'],
  ['900 Archiv', '906 WK production', ['900 Archiv_906 WK production-RW'], []],
  ['900 Archiv', '907 WK R&D', ['900 Archiv_907 WK R&D-RW'], ['900 Archiv_907 WK R&D-RO']],
  ['900 Archiv', '908 WK design flexi', ['900 Archiv_908 WK design flexi-RW'], []],
  ['900 Archiv', '910 Proj BVI general', ['900 Archiv_910 Proj BVI general-RW'], []],
  ['900 Archiv', '911 Proj BVI KQ', ['900 Archiv_911 Proj BVI KQ-RW'], []],
  ['900 Archiv', '912 GF', ['900 Archiv_912 GF-RW'], []],
  ['900 Archiv', '913 audit costs FHH', ['900 Archiv_913 audit costs FHH-RW'], []],
  ['900 Archiv', '914  Russia embargo', ['900 Archiv_914  Russia embargo-RW'], []],
  ['900 Archiv', '915 StabiRuder control', ['900 Archiv_915 StabiRuder control-RW'], []],
  ['900 Archiv', '916 StabiRuder training', ['900 Archiv_916 StabiRuder training-RW'], ['900 Archiv_916 StabiRuder training-RO']],
  ['900 Archiv', '917 StabiRuder', ['900 Archiv_917 StabiRuder-RW'], []],
  ['900 Archiv', '918 ProductionService', ['900 Archiv_918 ProductionService-RW'], []],
  ['900 Archiv', '919 Test Facility', ['900 Archiv_919 Test Facility-RW'], []],
  ['900 Archiv', '920 FAS', ['900 Archiv_920 FAS-RW'], []],
  ['900 Archiv', '921 ProE', ['900 Archiv_921 ProE-RW'], []],
  ['900 Archiv', '922 Finance', ['900 Archiv_922 Finance-RW'], []],
  ['900 Archiv', '923 IT', ['900 Archiv_923 IT-RW'], []],
  // Public
  ['Public', 'Public', ['Public_Public-RW'], [], 'S'],
]

/** Bereichsordner (Ebene 1): Domain Users lesen, niemand schreibt. */
export const W3172_BEREICHE = ['000 Executive Office', '0100 Sales', '0200 Products', '300 Finance', '400 Human Ressources', '500 Supply Chain Mgmt', '600 Projects', '700 Application', '800 Groups', '900 Archiv', 'Public']

/** Unterordner von „210 Products Shafts“ mit eigener Gruppe (aus den Gruppenbeschreibungen). */
const TIEFER: Array<[string, string]> = [
  ['210 11 Service Techn Mgmt', '0200 Products_210 11 Service Techn Mgmt-RW'],
  ['210 12 Design Seals Mgmt', '0200 Products_210 12 Design Seals Mgmt-RW'],
  ['210 13 Design Bearings Mgmt', '0200 Products_210 13 Design Bearings Mgmt-RW'],
  ['210 14 DV Calculation', '0200 Products_210 14 DV Calculation-RW'],
  ['210 15 Order Management Mgmt', '0200 Products_210 15 Order Management Mgmt-RW'],
]

export const W3172_ORDNER: W3172Ordner[] = [
  ...ZEILEN.map(([b, o, rw, ro, fl = '', hinweis]) => ({
    segmente: [b, o], rw: rw.map(g), ro: ro.map(g),
    jederLesen: fl.includes('J') || fl.includes('S') || undefined, jederSchreiben: fl.includes('S') || undefined,
    verwaist: fl.includes('V') || undefined, einzelkonten: fl.includes('E') || undefined, hinweis,
  })),
  ...TIEFER.map(([o, grp]) => ({ segmente: ['0200 Products', '210 Products Shafts', o], rw: [g(grp)], ro: [] })),
]

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Pfad (\\w3172\SKF Marine\…, \\w3172.corp.skf.net\…, I:\…) → Ordner-Segmente unterhalb von „SKF Marine“; sonst null. */
export function w3172Segmente(pfad: string): string[] | null {
  const p = pfad.trim().replace(/^["']|["']$/g, '').replace(/\//g, '\\')
  let rest: string | null = null
  const unc = p.match(/^\\\\w3172(?:\.[^\\]+)?\\skf marine(?:\\(.*))?$/i)
  if (unc) rest = unc[1] || ''
  else { const lw = p.match(/^i:(?:\\(.*))?$/i); if (lw) rest = lw[1] || '' }
  if (rest === null) return null
  return rest.split('\\').map(s => s.trim()).filter(Boolean)
}

export interface W3172Auskunft {
  /** null = kein Pfad auf \\W3172\SKF Marine */
  segmente: string[] | null
  ordner: W3172Ordner | null
  /** 'wurzel' | 'bereich' | 'ordner' | 'unbekannt' */
  art: 'wurzel' | 'bereich' | 'ordner' | 'unbekannt' | 'fremd'
}

/** Welcher Eintrag regelt die Rechte für diesen Pfad? (tiefster passender Ordner) */
export function w3172Fuer(pfad: string): W3172Auskunft {
  const seg = w3172Segmente(pfad)
  if (!seg) return { segmente: null, ordner: null, art: 'fremd' }
  if (!seg.length) return { segmente: seg, ordner: null, art: 'wurzel' }
  const n = seg.map(norm)
  let best: W3172Ordner | null = null
  for (const o of W3172_ORDNER) {
    if (o.segmente.length > n.length) continue
    if (o.segmente.every((s, i) => norm(s) === n[i]) && (!best || o.segmente.length > best.segmente.length)) best = o
  }
  if (best) return { segmente: seg, ordner: best, art: 'ordner' }
  if (seg.length === 1 && W3172_BEREICHE.some(b => norm(b) === n[0])) return { segmente: seg, ordner: null, art: 'bereich' }
  return { segmente: seg, ordner: null, art: 'unbekannt' }
}

/** Gruppe → Ordner (für Befundtexte: „Gruppe X fehlt“ → welcher Ordner). */
export function w3172OrdnerZuGruppe(cn: string): { ordner: W3172Ordner; schreiben: boolean } | null {
  const c = norm(cn)
  for (const o of W3172_ORDNER) {
    if (o.rw.some(x => norm(x) === c)) return { ordner: o, schreiben: true }
    if (o.ro.some(x => norm(x) === c)) return { ordner: o, schreiben: false }
  }
  return null
}

export const w3172Pfad = (o: W3172Ordner) => '\\\\W3172\\SKF Marine\\' + o.segmente.join('\\')

/** Verständliche Auskunft (Zeilen) für einen Pfad. */
export function w3172AuskunftText(pfad: string): string[] {
  const a = w3172Fuer(pfad)
  const z: string[] = []
  if (a.art === 'fremd') return [`„${pfad.trim()}“ liegt nicht auf \\\\W3172\\SKF Marine (Laufwerk I:) – dafür liegt keine Ordnertabelle vor. Den Rechte-Check mit diesem Pfad ausführen (prüft live).`]
  if (a.art === 'wurzel') return ['\\\\W3172\\SKF Marine (I:): Alle Benutzer dürfen lesen. Ob I: verbunden wird, hängt an der Gruppe „GL_MapDrive_W3172_SKF Marine_I“ (enthält alle Ordnergruppen – wer in einer Ordnergruppe ist, bekommt I:).']
  if (a.art === 'bereich') return [`Bereichsordner „${a.segmente![0]}“: jeder darf lesen, ändern darf hier niemand – Dateien gehören in einen Unterordner mit eigener Gruppe.`]
  if (a.art === 'unbekannt') return [`Für „${a.segmente!.join('\\')}“ ist im Abzug vom ${W3172_STAND} kein Ordner mit eigener Gruppe bekannt. Den Rechte-Check mit diesem Pfad ausführen (prüft live).`]
  const o = a.ordner!
  const unter = a.segmente!.length > o.segmente.length
  z.push(`Ordner: ${w3172Pfad(o)}${unter ? ` (gilt auch für „${a.segmente!.slice(o.segmente.length).join('\\')}“ – Unterordner erben die Rechte)` : ''}`)
  if (o.jederSchreiben) z.push('Ändern: alle Mitarbeiter (Domain Users) – hier ist keine Gruppe nötig.')
  else if (o.rw.length) z.push(`Ändern (lesen + schreiben): ${o.rw.join(' oder ')}`)
  else z.push('Ändern: KEINE gültige Gruppe vorhanden.')
  if (o.jederLesen) z.push('Lesen: alle Mitarbeiter (Domain Users).')
  else if (o.ro.length) z.push(`Nur lesen: ${o.ro.join(' oder ')}`)
  else if (o.rw.length) z.push('Nur lesen: keine eigene Lesegruppe – wer lesen soll, braucht die Ändern-Gruppe.')
  if (o.hinweis) z.push('⚠ ' + o.hinweis)
  if (o.verwaist && !o.hinweis) z.push('⚠ Im ACL stehen zusätzlich Einträge gelöschter Gruppen.')
  if (o.einzelkonten) z.push('Hinweis: Im ACL stehen zusätzlich einzelne Benutzerkonten (nicht über Gruppen) – das ist kein Weg für neue Berechtigungen.')
  if (!o.jederSchreiben && (o.rw.length || o.ro.length)) z.push(`Antrag: ServiceNow „${W3172_ANTRAG}“ – Gruppe genau so angeben; der Gruppenverantwortliche genehmigt. Nach der Aufnahme ab- und wieder anmelden (oder Kerberos erneuern).`)
  return z
}
