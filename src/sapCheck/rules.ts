// ── SAP-Fehlersuche: Schwellwerte + bekannte Fälle (zentral konfigurierbar) ───
// Die 15 bekannten Fälle aus dem Prompt (Phase 4). Schwellwerte hier an EINER
// Stelle ändern. Die eigentliche Anwendung passiert in collectors.ts (build) bzw.
// in applyKnownCases() unten (kategorieübergreifende Fälle).

import type { SapBefund, SapBewertung } from './sapCheck.types'

export const THRESHOLDS = {
  uptimeHinweisTage: 7,        // > 7 Tage → hinweis
  uptimeWarnungTage: 21,       // > 21 Tage → warnung
  diskWarnPct: 10,             // < 10 % frei → warnung
  diskFehlerPct: 5,            // < 5 % frei → fehler
  diskWarnGB: 10,              // < 10 GB frei → warnung
  netLatenzWarnMs: 60,         // Latenz zum SAP-Host > 60 ms → warnung
  kerberosSkewFehlerMin: 5,    // Zeitabweichung zum DC > 5 min → fehler (Kerberos tot)
  wlanSignalWarnPct: 60,       // WLAN-Signal < 60 % → warnung
  // Edge-Vorschaufenster-Bug (SAP GUI): betroffen ab 144.x, behoben ab dieser Version
  edgeBrokenPreviewFrom: '144.0.0.0',
  edgeBrokenPreviewFixed: '144.0.3719.92',
  // Zentrale SAP-Konfigurationsfreigabe (Azure NetApp, mehrere Hops): gesund ~22 ms.
  configShareLatWarnMs: 60,    // Latenz zur Config-Freigabe > 60 ms → warnung (Regel 18)
  configCacheAgeWarnTage: 7,   // lokaler Cache älter als 7 Tage → warnung (Regel 17)
}

// ── Regeln 16–19: zentrale SAP-Konfigurationsverteilung (Kategorie B/D) ────────
//  16 Zentrale Config-Freigabe nicht erreichbar → SAP Logon startet verzögert / mit
//     veralteter Systemliste. warnung; bei fehlendem/leerem Cache → fehler.
//  17 Lokaler Cache weicht von der zentralen Datei ab → hinweis (mit Cache-Alter);
//     Cache älter als configCacheAgeWarnTage → warnung.
//  18 Cache-Modus „bei jedem Start aktualisieren" UND Latenz > configShareLatWarnMs →
//     warnung; Empfehlung (nur Vorschlag, Entscheidung SAP Basis): Update-Intervall.
//  19 Eingebundene Landschaftsdatei fehlt/nicht auflösbar → warnung (mit Dateiname).
//  (Umgesetzt in configShare.ts, weil sie Admin-lokale + Client-Messwerte kombinieren.)

/** Bekannte Wartungsfenster (frei pflegbar) — Banner „läuft evtl. eine Wartung". */
export interface Wartungsfenster { system: string; von: string; bis: string; text: string }
export const WARTUNGSFENSTER: Wartungsfenster[] = [
  // Beispiel: { system: 'P57', von: '2026-08-30T18:00', bis: '2026-08-30T23:59', text: 'P57 Patch' },
]

/** Regel 15 — läuft zum Zeitpunkt ein gepflegtes Wartungsfenster? (für Banner) */
export function aktiveWartungsfenster(zeitpunkt: Date = new Date()): Wartungsfenster[] {
  const t = zeitpunkt.getTime()
  return WARTUNGSFENSTER.filter(w => {
    const v = Date.parse(w.von), b = Date.parse(w.bis)
    return !Number.isNaN(v) && !Number.isNaN(b) && t >= v && t <= b
  })
}

// ── Regelwerk „bekannte Fälle" (Phase 4) als Datentabelle ─────────────────────
// Jede Regel trägt Belege (Ticketnummern), die im passenden Befund als „Bekannt aus
// INC…" mit ausgegeben werden — damit ist der Befund im ServiceNow-Ticket sofort
// belastbar. `matchIds` = Befund-ID-Präfixe, an die die Belege gehängt werden (nur
// wenn der Befund auffällig ist). Neue Regel = ein Objekt ergänzen.
export interface KnownCase {
  nr: number
  titel: string
  bedingung: string            // menschenlesbare Beschreibung (Doku)
  bewertung: SapBewertung      // Zielbewertung laut Prompt
  begruendung: string
  empfehlung?: string
  belege: string[]             // INC-Nummern
  matchIds: string[]           // Befund-IDs (Präfix), an die Belege angehängt werden
}

export const KNOWN_CASES: KnownCase[] = [
  { nr: 1, titel: 'Edge-Vorschaufenster-Bug (SAP GUI)', bedingung: `Edge ≥ ${THRESHOLDS.edgeBrokenPreviewFrom} und < ${THRESHOLDS.edgeBrokenPreviewFixed}`, bewertung: 'warnung',
    begruendung: 'SAP-GUI-Vorschaufenster (AFI Direct Invoice Monitor, Objektnavigator) kaputt.',
    empfehlung: 'ALT+F12 → Interaktionsdesign auf Internet Explorer — außer bei ShipManager/ZHIP.', belege: [], matchIds: ['browser.edge.previewbug'] },
  { nr: 2, titel: 'Interaktionsdesign auf IE trotz aktuellem Edge', bedingung: 'Rendering=IE, Edge aktuell', bewertung: 'hinweis',
    begruendung: 'Rückstellung nach dem Edge-Fix vergessen.', belege: [], matchIds: ['config.design'] },
  { nr: 3, titel: 'SSO-Probleme + Zscaler Internet Security', bedingung: 'Kerberos/SNC-Muster im Homeoffice', bewertung: 'warnung',
    begruendung: 'Bekanntes Kerberos-/SNC-Muster; Dauerlösung war die SNC-Umstellung (P47 05.05., P57 13.05.2026).',
    empfehlung: 'Neustart, Zscaler Internet Security kurz aus, klist purge.', belege: [], matchIds: ['anmeldung.ticket', 'net.kerberos'] },
  { nr: 4, titel: 'Zeitabweichung zum DC > 5 min', bedingung: `|Skew| > ${THRESHOLDS.kerberosSkewFehlerMin} min`, bewertung: 'fehler',
    begruendung: 'Kerberos scheitert, SSO tot — praktisch immer die Ursache, wenn es auftritt.', belege: [], matchIds: ['net.kerberos'] },
  { nr: 5, titel: 'Kein Antimalware-Ausschluss für SAP', bedingung: 'Echtzeitschutz aktiv, keine SAP-Ausnahme', bewertung: 'hinweis',
    begruendung: 'Bei Babtec war eine fehlende Antimalware-Ausnahme die Ursache massiver Trägheit.', belege: [], matchIds: ['res.avexcl'] },
  { nr: 6, titel: 'WLAN statt LAN / schwaches Signal', bedingung: `WLAN, Signal < ${THRESHOLDS.wlanSignalWarnPct}% oder 2,4 GHz`, bewertung: 'warnung',
    begruendung: '„SAP ist langsam" ist bei uns oft schlicht ein schwaches WLAN.', belege: [], matchIds: ['net.adapter'] },
  { nr: 7, titel: 'Lange Betriebsdauer', bedingung: `> ${THRESHOLDS.uptimeHinweisTage} d Hinweis, > ${THRESHOLDS.uptimeWarnungTage} d Warnung`, bewertung: 'warnung',
    begruendung: 'Lange Uptime ist eine der häufigsten Ursachen für SAP-Trägheit.', empfehlung: 'Neustart.', belege: [], matchIds: ['res.uptime'] },
  { nr: 8, titel: 'Energiesparplan / Akkubetrieb', bedingung: 'Energiesparmodus oder gedrosselte CPU', bewertung: 'warnung',
    begruendung: 'Energiesparmodus drosselt die CPU — SAP spürbar langsamer.', belege: [], matchIds: ['res.power'] },
  { nr: 9, titel: 'Wenig freier Systemplatz', bedingung: `< ${THRESHOLDS.diskWarnPct}% / < ${THRESHOLDS.diskWarnGB} GB Warnung, < ${THRESHOLDS.diskFehlerPct}% Fehler`, bewertung: 'warnung',
    begruendung: 'Wenig Platz blockiert SAP-GUI/Traces/Temp.', belege: [], matchIds: ['res.disk'] },
  { nr: 10, titel: 'SAP-GUI-Trace dauerhaft aktiv', bedingung: 'Trace-Level > 0', bewertung: 'warnung',
    begruendung: 'Dauer-Trace bremst das GUI und füllt die Platte.', belege: [], matchIds: ['config.trace', 'traces.files'] },
  { nr: 11, titel: 'SAPUILandscape.xml lokal statt zentral / Hash weicht ab', bedingung: 'Hash ≠ Referenz', bewertung: 'hinweis',
    begruendung: 'Veraltete/abweichende Systemliste.', belege: [], matchIds: ['config.compare', 'config.landscape'] },
  { nr: 12, titel: 'SAP-GUI-Patchlevel weicht ab', bedingung: 'Version ≠ Baseline', bewertung: 'hinweis',
    begruendung: 'Unterschiedlicher Frontend-Stand.', belege: [], matchIds: ['install.sapgui'] },
  { nr: 13, titel: '%APPDATA%\\SAP unter OneDrive', bedingung: 'Pfad enthält OneDrive', bewertung: 'warnung',
    begruendung: 'Startverzögerung durch Roaming/OneDrive.', belege: [], matchIds: ['config.onedrive'] },
  { nr: 14, titel: 'Latenz/Paketverlust zum SAP-Host', bedingung: `> ${THRESHOLDS.netLatenzWarnMs} ms oder Verlust > 0`, bewertung: 'warnung',
    begruendung: 'Hohe Latenz/Verlust auf der SAP-Strecke.', belege: [], matchIds: ['net.ziel.'] },
  { nr: 15, titel: 'SAP-Wartungsfenster aktiv', bedingung: 'Scan-Zeit in gepflegtem Fenster', bewertung: 'hinweis',
    begruendung: 'Symptome können an einer laufenden Wartung liegen.', belege: [], matchIds: [] },
  { nr: 16, titel: 'Zentrale Konfigurationsfreigabe nicht erreichbar', bedingung: 'Freigabe weg; leerer Cache → fehler', bewertung: 'warnung',
    begruendung: 'SAP Logon startet verzögert oder mit veralteter Systemliste.', belege: [], matchIds: ['config.share.reach'] },
  { nr: 17, titel: 'Lokaler Cache weicht von zentraler Datei ab', bedingung: `Hash ≠; Cache > ${THRESHOLDS.configCacheAgeWarnTage} d → warnung`, bewertung: 'hinweis',
    begruendung: 'Anwender arbeitet mit veralteter Systemliste.', belege: [], matchIds: ['config.compare'] },
  { nr: 18, titel: 'Cache „bei jedem Start" + hohe Latenz', bedingung: `everyStart + > ${THRESHOLDS.configShareLatWarnMs} ms`, bewertung: 'warnung',
    begruendung: 'Jeder SAP-Logon-Start wartet auf die langsame Strecke.', empfehlung: 'Update-Intervall statt „bei jedem Start" (Entscheidung SAP Basis).', belege: [], matchIds: ['config.share.latmode'] },
  { nr: 19, titel: 'Eingebundene Landschaftsdatei nicht auflösbar', bedingung: 'Include fehlt', bewertung: 'warnung',
    begruendung: 'Systeme aus dieser Datei fehlen in der Auswahl.', belege: [], matchIds: ['config.include'] },
  { nr: 20, titel: 'Kein gültiges Kerberos-Ticket für SAP-SNC', bedingung: 'Kein TGT / kein SAP-Serviceticket', bewertung: 'fehler',
    begruendung: 'Häufigste Ursache überhaupt (SNC-Umstellung 27.04.–26.05.2026, ~50 Fälle).',
    empfehlung: 'Am Client behebbar: kinit, sonst klist purge + Neustart.',
    belege: ['INC2812687', 'INC2814708', 'INC2816173', 'INC2824071 ff.', 'INC2825661', 'INC2827183', 'INC2849303 ff.'], matchIds: ['anmeldung.ticket'] },
  { nr: 21, titel: 'Windows-Hello-Anmeldung ohne SAP-Ticket', bedingung: 'Hello-Login + kein Ticket', bewertung: 'warnung',
    begruendung: '„Windows Hello Problem. Mit Passwort funktioniert alles."', empfehlung: 'Testweise mit Passwort anmelden.', belege: ['INC2814275'], matchIds: ['anmeldung.hello'] },
  { nr: 22, titel: 'Aggressives Energiesparen', bedingung: 'Niedrige Platten-Abschaltzeit, USB-Selective-Suspend, Adapter-Energiesparen', bewertung: 'warnung',
    begruendung: 'Kann Abstürze auslösen, nicht nur Trägheit (Festplatten-Timeout).', empfehlung: 'Festplatten-Abschaltzeit hochsetzen.', belege: ['INC2918873'], matchIds: ['res.power.detail'] },
  { nr: 23, titel: 'Windows-Update in den letzten 14 Tagen + SAP-Befunde', bedingung: 'KB < 14 d und SAP-GUI-Befund', bewertung: 'hinweis',
    begruendung: 'Windows-Update kann SAP GUI brechen (Workaround Edge→IE).', belege: ['INC2699970', 'INC2769864'], matchIds: ['res.updates'] },
  { nr: 24, titel: 'PERSONAL.XLSB vorhanden', bedingung: 'XLSTART-Datei existiert', bewertung: 'hinweis',
    begruendung: 'Ein Makro darin legte den kompletten Excel-Export aus SAP lahm.', belege: ['INC2716663'], matchIds: ['print.personalxlsb'] },
  { nr: 25, titel: 'enaiocore.skf.net nicht per TLS erreichbar / Zertifikat ungültig', bedingung: 'TLS-Aufbau scheitert / Cert ungültig', bewertung: 'fehler',
    begruendung: 'Dokumentenablage/-anzeige aus SAP hängt daran, nicht SAP selbst.', belege: ['INC2658409', 'INC2420887', 'INC2825516', 'INC2791504'], matchIds: ['browser.enaio'] },
]

/** Belege aus KNOWN_CASES an passende, auffällige Befunde hängen („Bekannt aus INC…"). */
function stampBelege(befunde: SapBefund[]): void {
  for (const b of befunde) {
    if (b.bewertung === 'ok' || b.bewertung === 'unbekannt') continue
    const treffer = KNOWN_CASES.filter(k => k.belege.length && k.matchIds.some(m => b.id.startsWith(m)))
    if (!treffer.length) continue
    const belege = Array.from(new Set(treffer.flatMap(k => k.belege)))
    b.belege = Array.from(new Set([...(b.belege ?? []), ...belege]))
  }
}

/** Semver-artiger Vergleich für Versionsstrings (z. B. Edge/SAP-GUI). */
export function cmpVersion(a: string, b: string): number {
  const pa = (a || '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = (b || '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * Kategorieübergreifende „bekannte Fälle", die mehrere Befunde brauchen
 * (z. B. Edge-Bug nur ohne ShipManager/ZHIP). Wird nach dem Sammeln aufgerufen
 * und darf bestehende Befunde nachjustieren.
 */
export function applyKnownCases(befunde: SapBefund[]): SapBefund[] {
  const byId = new Map(befunde.map(b => [b.id, b]))
  // Fall 1: Edge-Vorschau-Bug abschwächen, wenn ZHIP/ShipManager genutzt wird (braucht Edge).
  const zhip = byId.get('browser.zhip')
  const edgeBug = byId.get('browser.edge.previewbug')
  if (edgeBug && zhip && /ja|genutzt|vorhanden/i.test(zhip.wert)) {
    edgeBug.bewertung = 'hinweis'
    edgeBug.begruendung += ' — ABER ShipManager/ZHIP erkannt: Edge ist hier zwingend, nicht auf Internet-Explorer-Modus umstellen.'
  }
  // Fall 21: Windows-Hello-Anmeldung mit fehlendem SAP-Ticket zusammen bewerten.
  const hello = byId.get('anmeldung.hello')
  const ticket = byId.get('anmeldung.ticket')
  if (hello && ticket && /hello|pin|biometr/i.test(hello.wert) && ticket.bewertung === 'fehler') {
    hello.bewertung = 'warnung'
    hello.begruendung += ' — kein SAP-Ticket bei Hello-Anmeldung: testweise mit Passwort anmelden.'
  }
  // Belege (Ticketnummern) an die auffälligen Befunde hängen.
  stampBelege(befunde)
  return befunde
}
