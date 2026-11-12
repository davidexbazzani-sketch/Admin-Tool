// ── Diagnose: alle Themen und Sonden (Reihenfolge = Anzeige) ──
import type { DgFakten, DgOber, DgRegel, DgSonde } from './types'
import { ja, nein, txt } from './motor'
import { SONDEN_GEMEINSAM } from './themen/gemeinsam'
import { SONDEN_OUTLOOK, THEMEN_OUTLOOK } from './themen/outlook'
import { SONDEN_NETZ, THEMEN_NETZ } from './themen/netz'
import { SONDEN_WLAN, THEMEN_WLAN } from './themen/wlan'
import { SONDEN_VPN, THEMEN_VPN } from './themen/vpn'
import { SONDEN_LAUFWERKE, THEMEN_LAUFWERKE } from './themen/laufwerke'
import { SONDEN_DRUCKER, THEMEN_DRUCKER } from './themen/drucker'
import { SONDEN_BROWSER, THEMEN_BROWSER } from './themen/browser'
import { SONDEN_TEAMS, THEMEN_TEAMS } from './themen/teams'
import { SONDEN_OFFICE, THEMEN_OFFICE } from './themen/office'
import { SONDEN_ONEDRIVE, THEMEN_ONEDRIVE } from './themen/onedrive'
import { SONDEN_KONTO, THEMEN_KONTO } from './themen/konto'
import { SONDEN_SOFTWARE, THEMEN_SOFTWARE } from './themen/software'
import { SONDEN_WINDOWS, THEMEN_WINDOWS } from './themen/windows'
import { SONDEN_LEISTUNG, THEMEN_LEISTUNG } from './themen/leistung'
import { SONDEN_STABILITAET, THEMEN_STABILITAET } from './themen/stabilitaet'
import { SONDEN_HARDWARE, THEMEN_HARDWARE } from './themen/hardware'
import { SONDEN_AUDIO, THEMEN_AUDIO } from './themen/audio'
import { SONDEN_BILDSCHIRM, THEMEN_BILDSCHIRM } from './themen/bildschirm'
import { SONDEN_TELEFONIE, THEMEN_TELEFONIE } from './themen/telefonie'
import { SONDEN_FACHPROGRAMME, THEMEN_FACHPROGRAMME } from './themen/fachprogramme'

// ── Zscaler wird bei JEDEM Netzwerk-/Internetproblem mitgeprüft (Vorgabe IT Marine) ──
// Sonde „net“ misst Dienst, Tunnel, App und ob das Internet wirklich über Zscaler läuft (ip.zscaler.com).
const zsLaeuft = (f: DgFakten) => ja(f['net.zscalerInstalliert']) && txt(f['net.zscalerDienst']) === 'Running'
export const ZSCALER_REGELN: DgRegel[] = [
  { id: 'zsc-fehlt', wenn: f => nein(f['net.zscalerInstalliert']), befund: () => 'Zscaler ist auf dem PC nicht installiert – ohne Zscaler kein Internet bzw. Intranet über SKF', problem: 'vpn-zscaler-nicht-installiert', schwere: 2 },
  { id: 'zsc-dienst', wenn: f => ja(f['net.zscalerInstalliert']) && txt(f['net.zscalerDienst']) !== '' && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler ist ausgeschaltet: Dienst ZSAService steht auf „${txt(f['net.zscalerDienst'])}“`, problem: 'vpn-zscaler-symbol-fehlt', schwere: 3 },
  { id: 'zsc-tunnel', wenn: f => zsLaeuft(f) && nein(f['net.zscalerTunnel']), befund: () => 'Zscaler-Dienst läuft, aber kein Tunnel (ZSATunnel) – Zscaler ist nicht verbunden bzw. wurde ausgeschaltet', problem: 'vpn-zscaler-verbindung-haengt', schwere: 3 },
  { id: 'zsc-internet-aus', wenn: f => zsLaeuft(f) && ja(f['net.zscalerTunnel']) && nein(f['net.zscalerInternet']), befund: () => 'Das Internet läuft NICHT über Zscaler (Prüfseite ip.zscaler.com) – „Internet Security“ ist in der Zscaler-App vermutlich ausgeschaltet', problem: 'vpn-zscaler-internet-security-aus', schwere: 2 },
  { id: 'zsc-app', wenn: f => zsLaeuft(f) && ja(f['net.zscalerTunnel']) && nein(f['net.zscalerApp']), befund: () => 'Zscaler läuft im Hintergrund, aber die App (Symbol im Infobereich) ist nicht gestartet – Anwender kann sich nicht anmelden', problem: 'vpn-zscaler-symbol-fehlt', schwere: 1 },
]
const ZS_OBER = new Set(['netz', 'wlan', 'vpn'])
const ZS_UNTER = new Set(['web-laedt', 'web-gesperrt', 'web-anmeldung'])
function mitZscaler(themen: DgOber[]): DgOber[] {
  return themen.map(o => ({
    ...o,
    unter: o.unter.map(u => {
      if (!ZS_OBER.has(o.id) && !ZS_UNTER.has(u.id)) return u
      const ids = new Set(u.regeln.map(r => r.id))
      return { ...u, sonden: u.sonden.includes('net') ? u.sonden : [...u.sonden, 'net'], regeln: [...u.regeln, ...ZSCALER_REGELN.filter(r => !ids.has(r.id))] }
    }),
  }))
}

export const DG_THEMEN: DgOber[] = mitZscaler([
  ...THEMEN_NETZ, ...THEMEN_WLAN, ...THEMEN_VPN, ...THEMEN_LAUFWERKE, ...THEMEN_DRUCKER, ...THEMEN_OUTLOOK, ...THEMEN_TEAMS, ...THEMEN_OFFICE, ...THEMEN_ONEDRIVE, ...THEMEN_BROWSER,
  ...THEMEN_KONTO, ...THEMEN_LEISTUNG, ...THEMEN_STABILITAET, ...THEMEN_WINDOWS, ...THEMEN_SOFTWARE, ...THEMEN_AUDIO, ...THEMEN_BILDSCHIRM, ...THEMEN_HARDWARE, ...THEMEN_TELEFONIE, ...THEMEN_FACHPROGRAMME,
])

export const DG_SONDEN: DgSonde[] = [
  ...SONDEN_GEMEINSAM, ...SONDEN_OUTLOOK, ...SONDEN_NETZ, ...SONDEN_WLAN, ...SONDEN_VPN, ...SONDEN_LAUFWERKE, ...SONDEN_DRUCKER, ...SONDEN_BROWSER, ...SONDEN_TEAMS, ...SONDEN_OFFICE, ...SONDEN_ONEDRIVE,
  ...SONDEN_KONTO, ...SONDEN_SOFTWARE, ...SONDEN_WINDOWS, ...SONDEN_LEISTUNG, ...SONDEN_STABILITAET, ...SONDEN_HARDWARE, ...SONDEN_AUDIO, ...SONDEN_BILDSCHIRM, ...SONDEN_TELEFONIE, ...SONDEN_FACHPROGRAMME,
]

export const DG_SONDEN_MAP = new Map(DG_SONDEN.map(s => [s.id, s]))
