// ── Änderungsverlauf: Welche Änderung kann zum eingegebenen Problem führen? ──
// Reine Regeln — kein Raten: Eine Änderung wird nur genannt, wenn sie fachlich zum Bereich
// des Problems passt (z. B. neuer Grafiktreiber ↔ Bildschirm, Browser, SolidWorks) oder das
// genannte Programm selbst betrifft. Das ist ein HINWEIS, kein Beweis — so steht es auch da.

import type { PaBereich } from '../problemAssistent/types'
import type { Aenderung, Kat } from './typen'

export type Stufe = 'wahrscheinlich' | 'moeglich'
export interface Bezug { stufe: Stufe; grund: string }
export interface BezugKontext {
  /** Bereich(e) des gewählten bzw. erkannten Problems. */
  bereiche: PaBereich[]
  /** Eingetippter Text + Titel des Problems (für „betrifft genau dieses Programm"). */
  text: string
}

interface Regel { kat: Kat[]; muster?: RegExp; stufe: Stufe; grund: string }

const PROG: Kat[] = ['software', 'app']
const ALLES_TECH: Kat[] = ['software', 'app', 'treiber', 'dienst']

const AUDIO = /audio|sound|realtek|conexant|jabra|headset|plantronics|poly\b|sennheiser|epos|logitech|dolby|waves|nahimic|smart sound|bluetooth|mikrofon|microphone|lautsprecher|speaker|audiosrv|audioendpoint|bthserv|btag/
const KAMERA = /camera|kamera|webcam|ir cam|imaging|logitech|mikrofon|microphone|frameserver/
const GRAFIK = /nvidia|geforce|quadro|rtx|radeon|\bamd\b|intel.*(graphics|uhd|iris|arc)|display|grafik|graphics|displaylink|monitor|dock|thunderbolt/
const NETZ = /wi-?fi|wlan|wireless|ethernet|\bgbe\b|network|netzwerk|killer|i219|i225|ax2\d\d|vpn|zscaler|anyconnect|globalprotect|forticlient|akamai|\beaa\b|npcap|proxy|\btap\b|wintun|wlansvc|dnscache|\bdhcp\b|nlasvc|netprofm|wcmsvc|iphlpsvc|\bzsa/
const DRUCK = /print|druck|spool|\bhp\b|hewlett|canon|kyocera|ricoh|konica|lexmark|brother|epson|xerox|seal|plossys|scan|papercut|stisvc/
const OFFICE = /office|microsoft 365|outlook|\bword\b|excel|powerpoint|onenote|add-?in|plug-?in|teams meeting|enaio|adobe|acrobat|\bpdf|\bsap\b|grammarly|dymo|vsto|tools for office/
const SICHER = /defender|antivirus|antischad|endpoint protection|crowdstrike|sentinel|sophos|trend micro|bitdefender|zscaler|bitlocker|firewall|security|windefend|\bsense\b|mpssvc|wscsvc/
const BESPRECHUNG = /teams|zoom|webex|xelion|skype/
const LAUFZEIT = /\.net\b|visual c\+\+|redistributable|java|webview/

const REGELN: Partial<Record<PaBereich, Regel[]>> = {
  'Audio & Headset': [
    { kat: ALLES_TECH, muster: AUDIO, stufe: 'wahrscheinlich', grund: 'Audio-Treiber bzw. Headset-Software wurde geändert' },
    { kat: PROG, muster: BESPRECHUNG, stufe: 'moeglich', grund: 'Besprechungsprogramm aktualisiert – das stellt öfter das Standard-Audiogerät um' },
  ],
  'Telefonie & Sonstiges': [
    { kat: ALLES_TECH, muster: /xelion|jabra|headset|telefon|softphone/, stufe: 'wahrscheinlich', grund: 'Telefonie-Software bzw. Headset-Software wurde geändert' },
    { kat: ALLES_TECH, muster: AUDIO, stufe: 'moeglich', grund: 'Audio-Treiber geändert – betrifft auch das Telefonieren' },
  ],
  'Kamera & Mikrofon': [
    { kat: ALLES_TECH, muster: KAMERA, stufe: 'wahrscheinlich', grund: 'Kamera- bzw. Mikrofon-Treiber wurde geändert' },
    { kat: ALLES_TECH, muster: AUDIO, stufe: 'moeglich', grund: 'Audio-Treiber geändert – betrifft auch das Mikrofon' },
    { kat: PROG, muster: BESPRECHUNG, stufe: 'moeglich', grund: 'Besprechungsprogramm aktualisiert' },
  ],
  'Bildschirm & Grafik': [
    { kat: ALLES_TECH, muster: GRAFIK, stufe: 'wahrscheinlich', grund: 'Grafik-, Dock- oder Bildschirmtreiber wurde geändert' },
  ],
  Browser: [
    { kat: PROG, muster: /chrome|edge|firefox|webview|browser/, stufe: 'wahrscheinlich', grund: 'Der Browser selbst wurde aktualisiert' },
    { kat: ALLES_TECH, muster: GRAFIK, stufe: 'moeglich', grund: 'Grafiktreiber bzw. Grafiksoftware geändert – stört Browser über die Hardwarebeschleunigung' },
    { kat: ALLES_TECH, muster: /zscaler|proxy/, stufe: 'moeglich', grund: 'Zscaler/Proxy geändert – darüber läuft der gesamte Internetverkehr' },
    { kat: ALLES_TECH, muster: SICHER, stufe: 'moeglich', grund: 'Sicherheitssoftware geändert – sie prüft den Internetverkehr mit' },
  ],
  'Netzwerk & Internet': [
    { kat: ALLES_TECH, muster: NETZ, stufe: 'wahrscheinlich', grund: 'Netzwerktreiber, VPN oder Zscaler wurde geändert' },
    { kat: ['netz'], stufe: 'wahrscheinlich', grund: 'Netzwerkeinstellung am PC wurde geändert' },
    { kat: ALLES_TECH, muster: SICHER, stufe: 'moeglich', grund: 'Sicherheitssoftware geändert – sie kann Verbindungen blockieren' },
  ],
  WLAN: [
    { kat: ALLES_TECH, muster: NETZ, stufe: 'wahrscheinlich', grund: 'WLAN-/Netzwerktreiber oder Zscaler wurde geändert' },
    { kat: ['netz'], stufe: 'wahrscheinlich', grund: 'Netzwerkeinstellung am PC wurde geändert' },
  ],
  'VPN & Zscaler': [
    { kat: ALLES_TECH, muster: NETZ, stufe: 'wahrscheinlich', grund: 'Zscaler, VPN oder Netzwerktreiber wurde geändert' },
    { kat: ['netz'], stufe: 'wahrscheinlich', grund: 'Netzwerkeinstellung am PC wurde geändert' },
  ],
  'Netzlaufwerke & Dateien': [
    { kat: ALLES_TECH, muster: /zscaler|akamai|\beaa\b|vpn|lanmanworkstation|workstation|webclient|cscservice|dnscache/, stufe: 'wahrscheinlich', grund: 'Zugangssoftware bzw. Dienst für Netzlaufwerke wurde geändert' },
    { kat: ['netz'], stufe: 'wahrscheinlich', grund: 'Netzwerkeinstellung geändert – Server werden evtl. nicht mehr gefunden' },
    { kat: ALLES_TECH, muster: NETZ, stufe: 'moeglich', grund: 'Netzwerktreiber geändert' },
  ],
  'Drucker & Scannen': [
    { kat: ALLES_TECH, muster: DRUCK, stufe: 'wahrscheinlich', grund: 'Druckertreiber, Drucksoftware oder Druckdienst wurde geändert' },
  ],
  Teams: [
    { kat: PROG, muster: /teams|webview/, stufe: 'wahrscheinlich', grund: 'Teams bzw. dessen Laufzeit (WebView2) wurde aktualisiert' },
    { kat: PROG, muster: /office|microsoft 365/, stufe: 'moeglich', grund: 'Office aktualisiert – Teams hängt daran (Besprechungs-Add-in, Anmeldung)' },
    { kat: ALLES_TECH, muster: AUDIO, stufe: 'moeglich', grund: 'Audio-Treiber geändert – betrifft Ton in Besprechungen' },
    { kat: ALLES_TECH, muster: KAMERA, stufe: 'moeglich', grund: 'Kamera-Treiber geändert' },
    { kat: ALLES_TECH, muster: GRAFIK, stufe: 'moeglich', grund: 'Grafiktreiber geändert – betrifft Bildschirmfreigabe und Video' },
  ],
  'Outlook & E-Mail': [
    { kat: PROG, muster: OFFICE, stufe: 'wahrscheinlich', grund: 'Office/Outlook oder ein Add-in wurde geändert' },
    { kat: ALLES_TECH, muster: SICHER, stufe: 'moeglich', grund: 'Sicherheitssoftware geändert – sie prüft E-Mails und Anhänge mit' },
  ],
  'Office (Word/Excel/PowerPoint)': [
    { kat: PROG, muster: OFFICE, stufe: 'wahrscheinlich', grund: 'Office oder ein Add-in wurde geändert' },
    { kat: ALLES_TECH, muster: DRUCK, stufe: 'moeglich', grund: 'Druckertreiber geändert – Office hängt beim Start am Standarddrucker' },
    { kat: ALLES_TECH, muster: SICHER, stufe: 'moeglich', grund: 'Sicherheitssoftware geändert – sie prüft Dokumente beim Öffnen' },
  ],
  'OneDrive & SharePoint': [
    { kat: PROG, muster: /onedrive|sharepoint|office|microsoft 365/, stufe: 'wahrscheinlich', grund: 'OneDrive bzw. Office wurde aktualisiert' },
  ],
  'Hardware & Geräte': [
    { kat: ALLES_TECH, muster: /usb|dock|thunderbolt|bluetooth|touchpad|synaptics|elan|\bhid\b|keyboard|tastatur|mouse|maus|chipset|serial io|hotkey/, stufe: 'wahrscheinlich', grund: 'Treiber für Anschlüsse bzw. Eingabegeräte wurde geändert' },
    { kat: ['treiber'], stufe: 'moeglich', grund: 'Treiber wurde geändert' },
  ],
  'Akku & Energie': [
    { kat: ALLES_TECH, muster: /battery|akku|power|energie|thermal|dptf|dynamic tuning|chipset|management engine|hotkey|vantage|command/, stufe: 'wahrscheinlich', grund: 'Energie- bzw. Chipsatz-Treiber wurde geändert' },
    { kat: ['autostart', 'dienst', 'aufgabe'], stufe: 'moeglich', grund: 'Läuft seitdem im Hintergrund mit und kann den Akku belasten' },
  ],
  'Windows & Oberfläche': [
    { kat: PROG, muster: /shell|explorer|startallback|powertoys|rtx desktop|nvidia|displayfusion|menu/, stufe: 'wahrscheinlich', grund: 'Programm greift in die Windows-Oberfläche ein' },
    { kat: ['autostart'], stufe: 'moeglich', grund: 'Startet seitdem bei jeder Anmeldung mit' },
  ],
  'Leistung & Speicher': [
    { kat: ['autostart', 'dienst', 'aufgabe'], stufe: 'wahrscheinlich', grund: 'Läuft seitdem automatisch im Hintergrund mit' },
    { kat: ALLES_TECH, muster: SICHER, stufe: 'wahrscheinlich', grund: 'Sicherheitssoftware geändert – sie prüft jeden Dateizugriff' },
    { kat: PROG, stufe: 'moeglich', grund: 'Programm kam neu dazu bzw. wurde aktualisiert' },
    { kat: ['treiber'], stufe: 'moeglich', grund: 'Treiber wurde geändert' },
  ],
  'Updates & Software': [
    { kat: PROG, muster: /intune|company ?portal|unternehmensportal|installer|redistributable/, stufe: 'wahrscheinlich', grund: 'Installations- bzw. Verteilsoftware wurde geändert' },
    { kat: ['dienst'], muster: /wuauserv|\bbits\b|intunemanagement|msiserver|trustedinstaller|usosvc|windows update/, stufe: 'wahrscheinlich', grund: 'Dienst für Updates/Installationen wurde geändert' },
    { kat: PROG, muster: LAUFZEIT, stufe: 'moeglich', grund: 'Laufzeit geändert, die viele Installationen voraussetzen' },
  ],
  'Anmeldung & Konto': [
    { kat: ALLES_TECH, muster: /fingerprint|fingerabdruck|biometr|smart ?card|\btpm\b|hello|credential|yubi/, stufe: 'wahrscheinlich', grund: 'Treiber bzw. Software für die Anmeldung wurde geändert' },
    { kat: ALLES_TECH, muster: /zscaler|vpn/, stufe: 'moeglich', grund: 'Zscaler/VPN geändert – ohne Verbindung zur Domäne scheitert die Anmeldung' },
  ],
  Sicherheit: [
    { kat: [...ALLES_TECH, 'update'], muster: SICHER, stufe: 'wahrscheinlich', grund: 'Sicherheitssoftware wurde geändert' },
  ],
  SAP: [
    { kat: PROG, muster: /\bsap\b|business client|sapgui|sap gui/, stufe: 'wahrscheinlich', grund: 'SAP-Software wurde geändert' },
    { kat: PROG, muster: LAUFZEIT, stufe: 'moeglich', grund: 'Laufzeit geändert, die SAP braucht' },
    { kat: PROG, muster: /office|microsoft 365|adobe|acrobat/, stufe: 'moeglich', grund: 'Office/Adobe geändert – SAP nutzt beides für Export und Anzeige' },
    { kat: ALLES_TECH, muster: DRUCK, stufe: 'moeglich', grund: 'Druckertreiber geändert – betrifft den SAP-Druck' },
  ],
  'SolidWorks & CAD': [
    { kat: PROG, muster: /solidworks|edrawings|freecad|autocad|\bpdm\b|3dconnexion|dassault/, stufe: 'wahrscheinlich', grund: 'CAD-Software wurde geändert' },
    { kat: ALLES_TECH, muster: GRAFIK, stufe: 'wahrscheinlich', grund: 'Grafiktreiber bzw. Grafiksoftware geändert – SolidWorks läuft nur mit freigegebenen Treibern stabil' },
    { kat: ALLES_TECH, muster: /3dconnexion|spacemouse/, stufe: 'wahrscheinlich', grund: 'Treiber der 3D-Maus wurde geändert' },
    { kat: PROG, muster: LAUFZEIT, stufe: 'moeglich', grund: 'Laufzeit geändert, die SolidWorks voraussetzt' },
  ],
}

/** Hier schon einmal als Ursache aufgefallen — steht dann ausdrücklich dabei. */
const BEKANNT: { muster: RegExp; bereiche: PaBereich[]; grund: string }[] = [
  {
    muster: /rtx desktop manager/,
    bereiche: ['Browser', 'Bildschirm & Grafik', 'Windows & Oberfläche', 'Teams'],
    grund: 'Bei uns bekannt: Der RTX Desktop Manager kommt mit dem NVIDIA-Treiber mit und bringt Edge und Chrome durcheinander – entfernen',
  },
]

/** Wörter aus der Eingabe, die kein Programm bezeichnen. */
const FUELL = new Set(('nicht geht gehen ging startet starten keine kein keinen fehler fehlermeldung problem probleme windows microsoft update updates treiber driver service dienst programm programme software datei dateien neue neuer neues version error install installation installiert system benutzer user langsam oeffnet öffnet funktioniert mehr beim nach seit wird werden kann lässt laesst sich über ueber oder und der die das mit von auf für fuer ist sind ein eine einen app apps client desktop immer wieder ständig staendig plötzlich ploetzlich heute gestern morgen hängt haengt stürzt stuerzt absturz bleibt stehen lädt laedt zeigt anzeige meldung verbindung verbinden verbunden rechner computer laptop notebook gerät geraet bildschirm schwarz weiß weiss keinen keiner zugriff möglich moeglich').split(' '))

const worte = (s: string) => (s || '').toLowerCase().split(/[^a-z0-9äöüß+#.]+/).map(w => w.replace(/^[.]+|[.]+$/g, '')).filter(w => w.length >= 4 && !FUELL.has(w) && !/^\d+$/.test(w))

/** Kann diese Änderung zum Problem führen? null = kein fachlicher Zusammenhang. */
export function bewerte(a: Aenderung, k: BezugKontext | null | undefined): Bezug | null {
  if (!k || (!k.bereiche.length && !k.text.trim())) return null
  const t = `${a.name} ${a.key || ''} ${a.zusatz || ''}`.toLowerCase()
  let bestes: Bezug | null = null
  const nimm = (b: Bezug) => { if (!bestes || (b.stufe === 'wahrscheinlich' && bestes.stufe !== 'wahrscheinlich')) bestes = b }

  // 1) Die Änderung betrifft genau das Programm, das im Problem genannt ist
  if (a.kat === 'software' || a.kat === 'app' || a.kat === 'treiber' || a.kat === 'dienst') {
    const name = a.name.toLowerCase()
    const treffer = worte(k.text).find(w => new RegExp(`(^|[^a-z0-9äöüß])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name))
    if (treffer) nimm({ stufe: 'wahrscheinlich', grund: `Betrifft genau „${treffer}“, das im Problem genannt ist` })
  }
  for (const b of BEKANNT) if (b.muster.test(t) && k.bereiche.some(x => b.bereiche.includes(x))) return { stufe: 'wahrscheinlich', grund: b.grund }
  // 2) Fachlicher Zusammenhang über den Bereich des Problems
  for (const b of k.bereiche) {
    for (const r of REGELN[b] || []) {
      if (!r.kat.includes(a.kat)) continue
      if (r.muster && !r.muster.test(t)) continue
      nimm({ stufe: r.stufe, grund: r.grund })
    }
  }
  // 3) Allgemein: Windows-Update, neuer Windows-Stand oder BIOS kurz vor dem Problem
  if (k.bereiche.length && !k.bereiche.every(b => b === 'Smartphone & MFA')) {
    const stark = k.bereiche.some(b => b === 'Windows & Oberfläche' || b === 'Updates & Software')
    if (a.kat === 'update' && !/defender|antischad|security platform|sicherheitsplattform/i.test(a.name)) {
      nimm({ stufe: stark ? 'wahrscheinlich' : 'moeglich', grund: 'Windows-Update kurz vor dem Problem – Updates ändern Treiber und Einstellungen mit' })
    }
    if (a.kat === 'system' && /^BIOS/i.test(a.name)) {
      const hart = k.bereiche.some(b => b === 'Anmeldung & Konto' || b === 'Akku & Energie' || b === 'Hardware & Geräte')
      nimm({ stufe: hart ? 'wahrscheinlich' : 'moeglich', grund: hart ? 'BIOS wurde geändert – das kann TPM/Windows Hello, Energieverwaltung und Anschlüsse zurücksetzen' : 'BIOS wurde geändert' })
    }
    if (a.kat === 'system' && /^Windows-(Build|Version)/i.test(a.name)) nimm({ stufe: stark ? 'wahrscheinlich' : 'moeglich', grund: 'Windows hat einen neuen Stand bekommen' })
  }
  return bestes
}
