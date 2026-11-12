// ── Berechtigungs-Katalog: AD-Gruppe → Art, ServiceNow-Antrag, Fehlerbild, Lösung ──────────────────
// Ordnet eine AD-Gruppe (Name + Beschreibung) einer Berechtigungsart zu. Jede Art sagt:
//   wofür die Gruppe gut ist · welches Fehlerbild der Anwender sieht, wenn sie fehlt · welcher
//   ServiceNow-Antrag sie bringt · welches Problem im Katalog die Lösung beschreibt.
// Genutzt von der Diagnose (Sonde „rechte“: Vergleich mit den Kollegen) und dem Baustein
// „rechte-alle-vergleich“. Das Tool vergibt NIE selbst Berechtigungen – es zeigt nur den Antrag.
// Muster bewusst einfach (auch als .NET-Regex in PowerShell nutzbar: siehe BER_PS_TABELLE).
import { SN_SOFTWARE, SN_ZUGRIFF } from './snAntraege'
import { W3172_ANTRAG, w3172OrdnerZuGruppe, w3172Pfad } from './w3172Ordner'

export interface BerArt {
  id: string
  titel: string
  /** Muster auf Gruppenname (cn) */
  name?: RegExp
  /** Muster auf die AD-Beschreibung */
  beschreibung?: RegExp
  wofuer: string
  fehlerbild: string
  /** Name des ServiceNow-Eintrags (siehe ServiceNow Welt) */
  antrag: string
  /** Problem-ID im Katalog „Gib dein Problem ein“ */
  problem: string
}

const ZPA = 'ZPA Client Role: Request or Check or Change Remote Access for a User'
/** Anwendungs-Rollen im Homeoffice (EAA_…) — ein Antrag für bis zu 4 Anwendungen. */
const APP = 'Add/Remove Remote Access to Applications for a User'

/** Reihenfolge = Vorrang (erste passende Art gewinnt). */
export const BER_ARTEN: BerArt[] = [
  // ── Fernzugriff (Zscaler Private Access / Akamai EAA) ──
  { id: 'zpa-fileserver', titel: 'Homeoffice: Marine-Fileserver', name: /^EAA_File_Servers/i, wofuer: 'Netzlaufwerke (I:, Abteilungslaufwerke) aus dem Homeoffice', fehlerbild: 'Im Homeoffice fehlen I: und die Abteilungslaufwerke bzw. haben ein rotes X – im Büro geht alles', antrag: APP, problem: 'laufwerk-homeoffice-berechtigung-fehlt' },
  { id: 'zpa-sap', titel: 'Homeoffice: SAP', name: /^EAA_SAP/i, wofuer: 'SAP aus dem Homeoffice (Rollen „Marine Production“/„Marine Non Production“)', fehlerbild: 'SAP Logon meldet im Homeoffice „Partner nicht erreicht“ bzw. hängt beim Verbinden – im Büro geht es', antrag: APP, problem: 'sap-homeoffice-geht-nicht' },
  { id: 'zpa-enaio', titel: 'Homeoffice: enaio', name: /^EAA_Ena/i, wofuer: 'enaio aus dem Homeoffice (Rolle „Marine enaio“)', fehlerbild: 'enaio findet im Homeoffice keinen Server, im Büro geht es', antrag: APP, problem: 'vpn-enaio-homeoffice' },
  { id: 'zpa-babtec', titel: 'Homeoffice: Babtec', name: /^EAA_Babtec/i, wofuer: 'Babtec aus dem Homeoffice (Rolle „Marine Babtec“)', fehlerbild: 'Babtec verbindet im Homeoffice nicht, im Büro schon', antrag: APP, problem: 'vpn-babtec-homeoffice' },
  { id: 'zpa-solidworks', titel: 'Homeoffice: SolidWorks/Lizenzserver', name: /^EAA_Solid/i, wofuer: 'SolidWorks-Lizenz bzw. -Daten aus dem Homeoffice', fehlerbild: 'SolidWorks meldet im Homeoffice „Lizenzserver nicht erreichbar“ (-15/-96), im Büro geht es', antrag: APP, problem: 'cad-solidworks-lizenz-nicht-verfuegbar' },
  { id: 'zpa-basis', titel: 'Fernzugriff (Grundrolle)', name: /^Azure_AD_SSO_Akamai_EAA_Client$/i, wofuer: 'Grundrolle für den Fernzugriff auf interne Anwendungen', fehlerbild: 'Zscaler ist angemeldet, aber keine interne Anwendung und kein Laufwerk ist von zu Hause erreichbar', antrag: ZPA, problem: 'vpn-zscaler-neuer-mitarbeiter-zpa' },
  { id: 'zpa-druck', titel: 'Homeoffice: Drucken (Plossys)', name: /^EAA_(Plossys|Printers?_)/i, wofuer: 'Drucken aus dem Homeoffice über Plossys/Druckserver', fehlerbild: 'Aus dem Homeoffice kommt kein Ausdruck an bzw. der Drucker ist offline – im Büro geht es', antrag: APP, problem: 'drucker-homeoffice' },
  { id: 'zpa-andere', titel: 'Homeoffice: Fachanwendung', name: /^EAA_/i, wofuer: 'Fachanwendung aus dem Homeoffice (ZPA-Rolle)', fehlerbild: 'Die Anwendung geht im Homeoffice nicht (keine Verbindung), im Büro schon', antrag: APP, problem: 'vpn-fernzugriff-beantragen' },
  // ── Dateien & Postfächer ──
  { id: 'laufwerk-zuordnung', titel: 'Laufwerkszuordnung', name: /^_?GL_MapDrive_/i, wofuer: 'Verbindet ein Netzlaufwerk (Buchstabe am Ende des Namens) bei der Anmeldung', fehlerbild: 'Das Laufwerk (z. B. I:) erscheint nach der Anmeldung nicht – Kollegen haben es', antrag: 'Fileshare Access Request', problem: 'laufwerk-i-fehlt' },
  { id: 'freigabe', titel: 'Ordnerfreigabe', name: /^[A-Z]{5}-W\d{4}[_-]/i, beschreibung: /access to \\\\|\\\\W3172|SKF Marine\\/i, wofuer: 'Lese-/Schreibrechte auf einen Ordner im Netzlaufwerk', fehlerbild: 'Ordner ist nicht zu sehen, leer oder meldet „Zugriff verweigert“ – Kollegen kommen hinein', antrag: 'Fileshare Access Request', problem: 'laufwerk-abteilungsordner-keine-berechtigung' },
  { id: 'postfach', titel: 'Gruppenpostfach', name: /mailbox|postfach|_MBX|MBX_|SharedMB|_SM_|FullAccess|SendAs/i, beschreibung: /mailbox|postfach|send as|full access|vollzugriff/i, wofuer: 'Zugriff auf ein Gruppenpostfach (Vollzugriff / Senden als)', fehlerbild: 'Gruppenpostfach erscheint nicht in Outlook bzw. „Sie haben keine Berechtigung, im Auftrag dieses Benutzers zu senden“', antrag: 'Delegation Rights for Non-user Mailbox (NIDD account) - Add or Modify', problem: 'outlook-gruppenpostfach-fehlt' },
  // ── Lizenzen ──
  { id: 'copilot', titel: 'Microsoft 365 Copilot', name: /copilot/i, wofuer: 'Lizenz für Microsoft 365 Copilot', fehlerbild: 'Copilot-Symbol fehlt in Word, Outlook und Teams', antrag: 'M365 Copilot License Request', problem: 'office-copilot-fehlt' },
  { id: 'powerbi', titel: 'Power BI Pro', name: /power.?bi|_PBI|PBI_/i, wofuer: 'Lizenz für Power BI Pro (Teilen, Arbeitsbereiche)', fehlerbild: 'Power BI meldet „Sie benötigen eine Power BI Pro-Lizenz“ bzw. Bericht lässt sich nicht öffnen/teilen', antrag: 'Request Power BI Pro license', problem: 'programm-powerbi-bericht-keine-berechtigung' },
  { id: 'visio-project', titel: 'Visio / Project', name: /visio|msproject|ms_project|project.?plan/i, wofuer: 'Lizenz für Visio bzw. Project', fehlerbild: 'Visio/Project startet nur als Viewer oder meldet „Nicht lizenziertes Produkt“', antrag: 'Change Office 365 License', problem: 'office-visio-project-nicht-lizenziert' },
  { id: 'teams-telefonie', titel: 'Teams-Telefonie', name: /^O365_Licensed_Users_Teams_(Phone|Audio|Calling)/i, wofuer: 'Telefonieren mit Teams bzw. Einwahlnummer für Besprechungen', fehlerbild: 'In Teams fehlt die Wähltastatur „Anrufe“ bzw. Besprechungen haben keine Einwahlnummer', antrag: 'Change Office 365 License', problem: 'teams-telefon-fehlt' },
  { id: 'sspr', titel: 'Kennwort selbst zurücksetzen', name: /SSPR/i, wofuer: 'Kennwort selbst zurücksetzen (aka.ms/sspr)', fehlerbild: 'Beim Kennwort-Zurücksetzen kommt „Sie sind nicht berechtigt“ bzw. die Registrierung fehlt', antrag: 'Password Reset Enrollment', problem: 'konto-sspr-nicht-registriert' },
  { id: 'm365-sync', titel: 'Microsoft-365-Synchronisierung', name: /^Azure_Synced_Users$/i, wofuer: 'Konto wird nach Microsoft 365 (Entra ID) synchronisiert – Grundlage für Outlook, Teams, OneDrive', fehlerbild: 'Kein Postfach, Teams/OneDrive melden „Konto nicht gefunden“ – Kollegen gehen', antrag: 'IT Onboarding of Personal Accounts', problem: 'neuer-mitarbeiter-berechtigungen-pruefen' },
  { id: 'm365', titel: 'Microsoft-365-Lizenz', name: /\b(M365|O365|Office.?365)\b|_E3\b|_E5\b|_F3\b|licen[cs]e/i, wofuer: 'Microsoft-365-Lizenz (Office, Outlook, Teams)', fehlerbild: 'Office meldet „Nicht lizenziertes Produkt“, Outlook/Teams nur im Browser', antrag: 'Change Office 365 License', problem: 'office-nicht-lizenziert' },
  // ── PC & Anwendungen ──
  { id: 'wlan', titel: 'Firmen-WLAN', name: /^WLAN_Access$/i, wofuer: 'Anmeldung am Firmen-WLAN', fehlerbild: 'Firmen-WLAN lehnt die Anmeldung ab bzw. hängt bei „Identität wird überprüft“ – Kollegen kommen hinein', antrag: 'Manage My AD Security Groups', problem: 'wlan-identitaet-wird-ueberprueft' },
  { id: 'sap-bo', titel: 'SAP BusinessObjects-Berichte', name: /^SAP_BO_/i, wofuer: 'Lesen von BI-Berichten (BusinessObjects) eines Fachbereichs', fehlerbild: 'BI-Bericht bzw. Berichtsordner fehlt oder meldet „keine Berechtigung“', antrag: 'Manage My AD Security Groups', problem: 'sap-keine-berechtigung-transaktion' },
  { id: 'lokaladmin', titel: 'Lokale Adminrechte', name: /local.?admin|LocalAdm|_LA_|Workstation.?Admin|PC.?Admin/i, wofuer: 'Dauerhafte Administratorrechte am Windows-PC', fehlerbild: 'Installation oder Treiber-Update fragt nach Administrator-Kennwort', antrag: 'Permanent Admin Access on Windows 11 machines', problem: 'sicherheit-programm-verlangt-adminrechte' },
  { id: 'citrix', titel: 'Citrix', name: /citrix|^CTX_|_CTX_|XenApp/i, wofuer: 'Citrix-Anwendungen bzw. -Desktop', fehlerbild: 'Citrix Workspace zeigt die Anwendung nicht an bzw. „keine Apps verfügbar“', antrag: 'Citrix Services Access Request', problem: 'programm-citrix-app-startet-nicht' },
  { id: 'mdesign', titel: 'MDesign', name: /mdesign/i, wofuer: 'Berechnungsprogramm MDesign', fehlerbild: 'MDesign fehlt im Startmenü bzw. meldet „keine Lizenz“', antrag: 'MDesign Marine Access Request', problem: 'update-programm-installieren' },
  { id: 'docuglobe', titel: 'Docuglobe', name: /docuglobe/i, wofuer: 'Dokumentationssystem Docuglobe', fehlerbild: 'Docuglobe-Anmeldung wird abgelehnt bzw. Projekt nicht sichtbar', antrag: 'DOCUGLOBE Access Request', problem: 'vpn-fernzugriff-beantragen' },
  { id: 'idprove', titel: 'ID.prove', name: /id.?prove/i, wofuer: 'ID.prove', fehlerbild: 'ID.prove meldet „keine Berechtigung“', antrag: 'ID.prove Access Request', problem: 'vpn-fernzugriff-beantragen' },
]

/** Fallback für Software-Verteilgruppen (SCCM/Intune). */
const SOFTWARE_GRUPPE = /^(SW|APP|APPL|SCCM|MECM|INT|INTUNE|PKG|DEPLOY)[_-]|[_-](SW|APP|Install|Deploy)[_-]|Software/i
const FUELL = new Set(['marine', 'skf', 'install', 'deploy', 'users', 'user', 'group', 'gruppe', 'access', 'prod', 'test', 'global', 'germany', 'hamburg', 'app', 'apps', 'software', 'intune', 'sccm', 'mecm', 'sw', 'pkg', 'latest', 'current', 'available', 'required', 'win', 'win10', 'win11', 'x64', 'x86', 'de', 'en'])

const worte = (s: string) => s.toLowerCase().split(/[^a-z0-9äöüß]+/).filter(w => w.length >= 3 && !FUELL.has(w) && !/^\d+$/.test(w))
/** Bester Eintrag aus einer Antragsliste nach gemeinsamen Wörtern (mind. ein „seltenes“ Wort ab 4 Zeichen). */
function besterAntrag(text: string, liste: string[]): string | null {
  const w = new Set(worte(text))
  if (!w.size) return null
  let best: string | null = null, punkte = 0
  for (const n of liste) {
    const nw = worte(n)
    const p = nw.filter(x => w.has(x)).reduce((s, x) => s + (x.length >= 4 ? 2 : 1), 0)
    if (p > punkte && nw.some(x => x.length >= 4 && w.has(x))) { punkte = p; best = n }
  }
  return best
}

export interface BerZuordnung { art: BerArt; antrag: string; sicher: boolean }

const ALLGEMEIN: BerArt = { id: 'allgemein', titel: 'AD-Berechtigung', wofuer: 'Berechtigung über eine AD-Gruppe', fehlerbild: 'Funktion/Anwendung/Ordner geht beim Benutzer nicht, bei den Kollegen schon', antrag: 'Manage My AD Security Groups', problem: 'berechtigung-fehlt-kollegen-vergleich' }
const SOFTWARE: BerArt = { id: 'software', titel: 'Software-Verteilung (Intune)', wofuer: 'Installation eines Programms über Intune (Unternehmensportal bzw. Pflicht-App)', fehlerbild: 'Programm fehlt im Startmenü bzw. im Unternehmensportal, Kollegen haben es', antrag: 'Creation of Software Package', problem: 'update-unternehmensportal-app' }
const SSO_ART: BerArt = { id: 'sso-app', titel: 'Web-Anwendung (Anmeldung über Microsoft)', wofuer: 'Zugang zu einer Web-Anwendung mit Microsoft-Anmeldung (z. B. Snowflake, Concur, DocuSign, Miro)', fehlerbild: 'Anmeldung an der Web-Anwendung scheitert: „AADSTS50105 – Ihr Konto ist dieser Anwendung nicht zugewiesen“', antrag: 'Manage My AD Security Groups', problem: 'konto-aadsts50105-app-nicht-zugewiesen' }
/** Ausgemusterte Verteil- und Deinstallationsgruppen: fehlen sie, ist das KEIN Problem (nicht melden). */
const AUSGEMUSTERT = /\bRETIRED\b|Retired Group|DO NOT (ADD|USE)|Need to delete|OBSOLETE|No longer used|ENG-U(_|\b)|-U_Win|_U$|Uninstall|Exclusion/i
export const AUSGEMUSTERT_ART: BerArt = { id: 'ignorieren', titel: 'Ausgemusterte Gruppe', wofuer: 'Alte Verteil-/Deinstallationsgruppe', fehlerbild: '', antrag: '', problem: '' }
/** Intune-Verteilgruppen (OU „SCCM“ heißt nur noch so): „Hersteller Produkt Version (n) ENG_Win10“, Beschreibung „INTUNE - PROD“. */
const INTUNE_GRUPPE = /INTUNE|\bENG(_Win1[01])?\b|_Win1[01]\b|Win7; ?Win10|Win10 ?- ?PROD/i

/** AD-Gruppe einer Berechtigungsart zuordnen. Ohne Treffer: „allgemein“ (Gruppenverantwortlicher → „Manage My AD Security Groups“). */
export function ordneGruppeZu(cn: string, beschreibung = ''): BerZuordnung {
  for (const a of BER_ARTEN) {
    if ((a.name && a.name.test(cn)) || (a.beschreibung && a.beschreibung.test(beschreibung))) return { art: a, antrag: a.antrag, sicher: true }
  }
  const text = cn + ' ' + beschreibung
  if (AUSGEMUSTERT.test(text)) return { art: AUSGEMUSTERT_ART, antrag: '', sicher: true }
  if (/^Azure_AD_SSO_/i.test(cn)) {
    const zu = besterAntrag(cn.replace(/^Azure_AD_SSO_/i, '').replace(/_/g, ' ') + ' ' + beschreibung, SN_ZUGRIFF)
    return { art: SSO_ART, antrag: zu || SSO_ART.antrag, sicher: !!zu }
  }
  if (INTUNE_GRUPPE.test(text)) {
    const sw = besterAntrag(text, SN_SOFTWARE)
    return { art: SOFTWARE, antrag: sw || SOFTWARE.antrag, sicher: !!sw }
  }
  if (SOFTWARE_GRUPPE.test(text)) {
    const sw = besterAntrag(text, SN_SOFTWARE)
    return { art: SOFTWARE, antrag: sw || SOFTWARE.antrag, sicher: !!sw }
  }
  const zu = besterAntrag(text, SN_ZUGRIFF)
  if (zu) return { art: { ...ALLGEMEIN, id: 'anwendung', titel: 'Anwendungszugriff', wofuer: 'Zugriff auf eine Fachanwendung' }, antrag: zu, sicher: false }
  return { art: ALLGEMEIN, antrag: ALLGEMEIN.antrag, sicher: false }
}

/** Kurzer Befundtext für eine fehlende Gruppe. */
export function berText(cn: string, beschreibung: string, anz: number, von: number): { text: string; antrag: string; problem: string; fehlerbild: string } {
  const z = ordneGruppeZu(cn, beschreibung)
  const w = w3172OrdnerZuGruppe(cn)
  if (w) {
    const pfad = w3172Pfad(w.ordner)
    return {
      text: `Ordnerfreigabe ${pfad} (${w.schreiben ? 'ändern' : 'lesen'}): Gruppe ${cn} fehlt (${anz} von ${von} Kollegen haben sie)`,
      antrag: W3172_ANTRAG, problem: 'laufwerk-abteilungsordner-keine-berechtigung',
      fehlerbild: `Ordner „${w.ordner.segmente[w.ordner.segmente.length - 1]}“ auf I: meldet „Zugriff verweigert“ bzw. ist leer${w.schreiben ? ' oder nur lesbar' : ''} – Kollegen kommen hinein`,
    }
  }
  return {
    text: `${z.art.titel}: Gruppe ${cn} fehlt (${anz} von ${von} Kollegen haben sie)${beschreibung ? ` – „${beschreibung}“` : ''}`,
    antrag: z.antrag, problem: z.art.problem, fehlerbild: z.art.fehlerbild,
  }
}

/** Zuordnungstabelle für PowerShell (Baustein-Ausgabe): Muster als .NET-Regex. */
export function berPsTabelle(): string {
  const zeilen = BER_ARTEN.map(a => ({ n: a.name ? '(?i)' + a.name.source : '', b: a.beschreibung ? '(?i)' + a.beschreibung.source : '', t: a.titel, a: a.antrag, f: a.fehlerbild }))
  zeilen.push({ n: '(?i)^Azure_AD_SSO_', b: '', t: SSO_ART.titel, a: 'passender Zugriffsantrag der Anwendung (ServiceNow Welt) bzw. „Manage My AD Security Groups“', f: SSO_ART.fehlerbild })
  zeilen.push({ n: '(?i)' + INTUNE_GRUPPE.source, b: '(?i)' + INTUNE_GRUPPE.source, t: SOFTWARE.titel, a: 'im Unternehmensportal installieren bzw. Softwareantrag in der ServiceNow Welt', f: SOFTWARE.fehlerbild })
  return JSON.stringify(zeilen)
}

/** .NET-Regex: ausgemusterte Gruppen (fehlen ist kein Problem). */
export function berPsAusgemustert(): string {
  return '(?i)' + AUSGEMUSTERT.source
}
