// ── Diagnose: alle Themen und Sonden (Reihenfolge = Anzeige) ──
import type { DgOber, DgSonde } from './types'
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

export const DG_THEMEN: DgOber[] = [
  ...THEMEN_NETZ, ...THEMEN_WLAN, ...THEMEN_VPN, ...THEMEN_LAUFWERKE, ...THEMEN_DRUCKER, ...THEMEN_OUTLOOK, ...THEMEN_TEAMS, ...THEMEN_OFFICE, ...THEMEN_ONEDRIVE, ...THEMEN_BROWSER,
  ...THEMEN_KONTO, ...THEMEN_LEISTUNG, ...THEMEN_STABILITAET, ...THEMEN_WINDOWS, ...THEMEN_SOFTWARE, ...THEMEN_AUDIO, ...THEMEN_BILDSCHIRM, ...THEMEN_HARDWARE, ...THEMEN_TELEFONIE, ...THEMEN_FACHPROGRAMME,
]

export const DG_SONDEN: DgSonde[] = [
  ...SONDEN_GEMEINSAM, ...SONDEN_OUTLOOK, ...SONDEN_NETZ, ...SONDEN_WLAN, ...SONDEN_VPN, ...SONDEN_LAUFWERKE, ...SONDEN_DRUCKER, ...SONDEN_BROWSER, ...SONDEN_TEAMS, ...SONDEN_OFFICE, ...SONDEN_ONEDRIVE,
  ...SONDEN_KONTO, ...SONDEN_SOFTWARE, ...SONDEN_WINDOWS, ...SONDEN_LEISTUNG, ...SONDEN_STABILITAET, ...SONDEN_HARDWARE, ...SONDEN_AUDIO, ...SONDEN_BILDSCHIRM, ...SONDEN_TELEFONIE, ...SONDEN_FACHPROGRAMME,
]

export const DG_SONDEN_MAP = new Map(DG_SONDEN.map(s => [s.id, s]))
