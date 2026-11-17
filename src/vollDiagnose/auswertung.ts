// ── PC-Volldiagnose: Rohdaten → Rohbefunde → Befunde mit Lösungswegen (reine Logik) ──
// Testbar ohne Electron (.tmp-test/vd/). Keine Ein-/Ausgabe hier.

import { TYPEN, L } from './katalog'
import { ALLE_REGELN, RAUSCHEN, ABGEDECKT, type VdEreignisRegel } from './lexikon'
import { leseGruppen } from '../pcFehler/auswertung'
import type { FehlerGruppe, Schwere as PfSchwere } from '../pcFehler/katalog'
import { PROBLEME } from '../problemAssistent/katalog'
import { aktion as paAktion, WERKZEUGE } from '../problemAssistent/aktionen'
import { DG_THEMEN, ZSCALER_REGELN } from '../problemAssistent/diagnose/index'
import type { DgFakten, DgRegel, DgWert } from '../problemAssistent/diagnose/types'
import type { PaProblem } from '../problemAssistent/types'
import { DISM_FEHLER, bereinigeAusgabe } from '../services/serverDism'
import { fachVonBereich, type RichtungsUmfang } from './richtung'
import { DATENTRAEGER_QUELLE, leseGeraete, lerneVolumes, ordneDatentraeger, type DatentraegerInfo } from './datentraeger'
export { lwAusText, ordneDatentraeger, leseGeraete, type DatentraegerInfo, type DtZiel } from './datentraeger'
import {
  SCHWERE_RANG, type VdBefund, type VdBereich, type VdFachdiagnose, type VdGeraet, type VdLoesung, type VdPhase, type VdRoh, type VdSchwere,
} from './typen'

const PROBLEM = new Map(PROBLEME.map(p => [p.id, p]))
export const problemVon = (id?: string): PaProblem | undefined => (id ? PROBLEM.get(id) : undefined)
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : v == null || v === '' ? [] : [v as T])
const s = (v: unknown) => (v == null ? '' : String(v))
const schwerer = (a?: VdSchwere, b?: VdSchwere): VdSchwere | undefined => (!a ? b : !b ? a : SCHWERE_RANG[a] <= SCHWERE_RANG[b] ? a : b)
export const datumText = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d.getTime()) ? d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }

// ── Lösungen aus dem Problem-Katalog ─────────────────────────────────────────
export function phaseVon(ids: string[]): VdPhase {
  const t = ids.join(' ')
  if (/(^|\s)dism(\s|$)/.test(t)) return 'komponenten'
  if (/(^|\s)sfc(\s|$)/.test(t)) return 'systemdateien'
  if (/chkdsk/.test(t)) return 'dateisystem'
  if (/(^|\s)(wu-|update-)/.test(t)) return 'updates'
  if (/bereinig|temp-leeren|speicher-bereinig|platz/.test(t)) return 'platz'
  if (/treiber|geraet|hw4-|hw-|bild4-|bluetooth|kamera|audio-treiber|dock/.test(t)) return 'treiber'
  if (/dienst|spooler/.test(t)) return 'dienste'
  if (/office|intune|(^|\s)ol-|outlook|teams|(^|\s)od-|onedrive|edge|programm|sap|solidworks|sapcad|xelion|enaio|coscom|browser|web-|excel|word/.test(t)) return 'programme'
  return 'konfiguration'
}
/**
 * Bausteine, die auf Servern nicht angeboten werden: Benutzerprofil/-sitzung; chkdsk beim Start (nur im
 * Wartungsfenster); Zeitquelle „Domäne“ (der PDC-Emulator synchronisiert extern); alles, was die
 * Netzverbindung trennt (Adapter/IP/Winsock/WLAN-Dienst) — der Server wäre danach evtl. nicht erreichbar.
 */
const NUR_PC = new Set(['chkdsk-beim-start', 'konto-zeitquelle-domaene', 'winsock-reset'])
const NETZ_TRENNT = /Restart-NetAdapter|Disable-NetAdapter|winsock\s+reset|int(?:erface)?\s+ip(?:v4)?\s+reset|ipconfig(?:\.exe)?['"]?\)?\s+\/release/i
export const nurPcModus = (id: string) => { const a = paAktion(id); return NUR_PC.has(id) || (!!a && (a.modus === 'profil' || a.modus === 'benutzer' || !!a.trenntVerbindung || NETZ_TRENNT.test(a.ps || ''))) }

export function loesungenAusProblem(p: PaProblem, geraet: VdGeraet): VdLoesung[] {
  const out: VdLoesung[] = []
  const schritte = p.schritte
    .filter(x => !x.aktion.startsWith('werkzeug:'))
    .map(x => ({ x, a: paAktion(x.aktion) }))
    .filter(y => y.a && y.a.risiko !== 'lesen' && !(geraet === 'server' && (y.a.modus === 'profil' || y.a.modus === 'benutzer')))
  const neustart = schritte.some(y => y.x.aktion === 'neustart-countdown')
  const ohneNeustart = schritte.filter(y => y.x.aktion !== 'neustart-countdown')
  if (ohneNeustart.length) {
    out.push({
      id: 'p-' + p.id, titel: p.titel, art: 'problem', problem: p.id,
      schritte: ohneNeustart.map(y => ({ aktion: y.x.aktion, param: y.x.param, titel: y.x.titel, optional: y.x.optional })),
      phase: phaseVon(ohneNeustart.map(y => y.x.aktion)), wirkung: p.loesung, neustart: neustart || undefined,
      frage: p.frage ? { label: p.frage.label, platzhalter: p.frage.platzhalter } : undefined,
    })
  }
  for (const w of p.schritte.filter(x => x.aktion.startsWith('werkzeug:'))) {
    const id = w.aktion.slice(9)
    if (geraet === 'server' && (id === 'netzdiagnose' || id === 'sap-fehlersuche' || id === 'solidworks-diagnose')) continue
    const wd = WERKZEUGE[id]
    out.push({ id: 'wz-' + id, titel: wd?.titel || id, art: 'werkzeug', werkzeug: id, phase: 'konfiguration', wirkung: wd?.beschreibung || '' })
  }
  if (p.hinweis) out.push({ id: 'hin-p-' + p.id, titel: 'Hinweis', art: 'hinweis', hinweis: p.hinweis, phase: 'konfiguration', wirkung: p.hinweis })
  if (!out.length) out.push({ id: 'hin-p-' + p.id, titel: 'Vorgehen', art: 'hinweis', hinweis: p.loesung, phase: 'konfiguration', wirkung: p.loesung })
  return out
}

/** Befund-Typ → Bereich aus dem Problem-Bereich des Katalogs. */
export function bereichVonProblem(p?: PaProblem): VdBereich {
  switch (p?.bereich) {
    case 'Netzwerk & Internet': case 'WLAN': case 'VPN & Zscaler': return 'netz'
    case 'Drucker & Scannen': return 'drucken'
    case 'Hardware & Geräte': case 'Audio & Headset': case 'Bildschirm & Grafik': case 'Kamera & Mikrofon': case 'Akku & Energie': return 'hardware'
    case 'Leistung & Speicher': return 'leistung'
    case 'Updates & Software': return 'updates'
    case 'Anmeldung & Konto': case 'Netzlaufwerke & Dateien': return 'profil'
    case 'Sicherheit': return 'sicherheit'
    case 'Windows & Oberfläche': return 'stabilitaet'
    case 'Server': return 'server'
    case undefined: return 'sonstiges'
    default: return 'programme'
  }
}

// ── Befund bauen ─────────────────────────────────────────────────────────────
export interface BauKontext { geraet: VdGeraet; quelle: string; eltern?: string; zaehler: { n: number } }

export function baueBefund(roh: VdRoh, ctx: BauKontext): VdBefund {
  const typ = TYPEN[roh.typ]
  const problem = problemVon(roh.problem || typ?.problem)
  let loesungen: VdLoesung[] = [...(roh.loesungen || [])]
  if (typ) loesungen.push(...typ.loesungen)
  if (problem) for (const l of loesungenAusProblem(problem, ctx.geraet)) if (!loesungen.some(x => x.id === l.id)) loesungen.push(l)
  // Nur für den anderen Gerätetyp gedachte Wege weg (Server-Hinweise am PC)
  loesungen = loesungen.filter(l => !l.nur || l.nur === ctx.geraet)
  // Server: keine Bausteine im Benutzerprofil/der Sitzung, keine PC-Fachdiagnosen
  if (ctx.geraet === 'server') loesungen = loesungen.filter(l => !(l.schritte || []).some(x => nurPcModus(x.aktion)) && !(l.art === 'werkzeug' && ['netzdiagnose', 'sap-fehlersuche', 'solidworks-diagnose', 'vc-redist'].includes(l.werkzeug || '')))
  if (!loesungen.length) {
    loesungen = [
      { id: 'hin-suche', titel: 'Im Problem-Katalog nachschlagen', art: 'hinweis', phase: 'konfiguration',
        hinweis: `In „Gib dein Problem ein“ nach „${(roh.suche || roh.titel || roh.text).slice(0, 80)}“ suchen bzw. den Ereignistext prüfen.`, wirkung: 'Kein fester Lösungsweg hinterlegt.' },
      L.ueberwachung,
    ]
  }
  // Eingabe (z. B. Dienstname) in Lösungen mit Frage vorbelegen
  if (roh.eingabe) loesungen = loesungen.map(l => (l.frage ? { ...l, frage: { ...l.frage, vorbelegt: roh.eingabe } } : l))
  const fach: VdFachdiagnose | undefined = ctx.geraet === 'server' ? undefined : (roh.fachdiagnose || typ?.fachdiagnose || (problem ? fachVonBereich(problem.bereich) : undefined))
  const schwere = roh.schwereFest || schwerer(roh.schwere, typ?.schwere) || 'hinweis'
  return {
    id: `${ctx.quelle}#${++ctx.zaehler.n}`,
    typ: roh.typ, schwere,
    bereich: roh.bereich || typ?.bereich || bereichVonProblem(problem),
    titel: roh.titel || typ?.titel || problem?.titel || roh.text.slice(0, 80),
    text: roh.text, belege: roh.belege || [], quelle: ctx.quelle,
    ursacheOffen: roh.ursacheOffen ?? typ?.ursacheOffen ?? false,
    vertiefungen: roh.vertiefungen ?? typ?.vertiefungen ?? [],
    fachdiagnose: fach, loesungen, problem: problem?.id, eltern: ctx.eltern, sonden: roh.sonden,
    anzahl: roh.anzahl, zuerst: roh.zuerst, zuletzt: roh.zuletzt, passend: roh.passend,
  }
}

// ── Ereignisse ───────────────────────────────────────────────────────────────
export interface Absturz { app: string; appVer: string; modul: string; modVer: string; code: string; offset: string; appPfad: string; modPfad: string; t: string }
export interface EreignisDaten {
  tage: number
  gruppen: FehlerGruppe[]
  crashes: Absturz[]
  bugchecks: { t: string; text: string }[]
  kp41: { t: string; code: string; taste: string; schlaf: string; standby: string }[]
  wer: { typ: string; app: string; modul: string; code: string; t: string }[]
  /** Vorhandene Datenträger beim Scan (Zuordnung der Datenträger-Ereignisse) */
  geraete?: DatentraegerInfo
}
const PF_SCHWERE: Record<PfSchwere, VdSchwere> = { hoch: 'kritisch', mittel: 'warnung', niedrig: 'hinweis' }
const HOEHER: Record<PfSchwere, PfSchwere> = { niedrig: 'mittel', mittel: 'hoch', hoch: 'hoch' }

function trifft(r: VdEreignisRegel, g: FehlerGruppe): boolean {
  const w = r.wenn
  if (w.quelle && !w.quelle.test(g.quelle)) return false
  if (w.log && !w.log.test(g.log)) return false
  if (w.ids && !w.ids.includes(g.id)) return false
  if (w.app && !w.app.test(g.app.split('|')[0] || '')) return false
  if (w.text && !w.text.test(g.text)) return false
  if (w.nichtText && w.nichtText.test(g.text)) return false
  return true
}
const wert = <T,>(v: T | ((g: FehlerGruppe) => T), g: FehlerGruppe): T => (typeof v === 'function' ? (v as (g: FehlerGruppe) => T)(g) : v)
const SAP_APP = /^(saplogon|sapgui|saplgpad|nwbc|sapgui\w*)\.exe$/i
const SW_APP = /^sldworks\.exe$/i

export function leseEreignisDaten(d: Record<string, unknown>): EreignisDaten {
  return {
    tage: Number(d.tage) || 7,
    gruppen: leseGruppen(arr<string>(d.gruppen)) || [],
    crashes: arr<Absturz>(d.crashes).map(c => ({ app: s(c.app), appVer: s(c.appVer), modul: s(c.modul), modVer: s(c.modVer), code: s(c.code).toLowerCase(), offset: s(c.offset), appPfad: s(c.appPfad), modPfad: s(c.modPfad), t: s(c.t) })),
    bugchecks: arr<{ t: string; text: string }>(d.bugchecks).map(b => ({ t: s(b.t), text: s(b.text) })),
    kp41: arr<EreignisDaten['kp41'][number]>(d.kp41).map(k => ({ t: s(k.t), code: s(k.code), taste: s(k.taste), schlaf: s(k.schlaf), standby: s(k.standby) })),
    wer: arr<EreignisDaten['wer'][number]>(d.wer).map(w => ({ typ: s(w.typ), app: s(w.app), modul: s(w.modul), code: s(w.code), t: s(w.t) })),
    geraete: leseGeraete(d.geraete),
  }
}
/** Zusatz „@…“ der Gruppe (Datenträger bzw. LiveKernel-Code) statt Programmname. */
export const zusatzVon = (g: FehlerGruppe) => (g.app.startsWith('@') ? g.app.slice(1) : '')
const REGEL_EXTERN = ALLE_REGELN.find(r => r.id === 'platte-extern')!
const REGEL_INTERN = ALLE_REGELN.find(r => r.id === 'platte-intern')!

export function werteEreignisse(daten: EreignisDaten, geraet: VdGeraet, umfang?: RichtungsUmfang): { roh: VdRoh[]; rauschen: number; unbekannt: FehlerGruppe[] } {
  const sammel = new Map<string, { r: VdEreignisRegel; g: FehlerGruppe; anzahl: number; zuerst: string; zuletzt: string; eingabe: string }>()
  const unbekannt: FehlerGruppe[] = []
  let rauschen = 0
  // Volume ↔ Laufwerk auch aus den Ereignistexten selbst (NTFS 140 nennt beides)
  const geraete = lerneVolumes(daten.gruppen.filter(g => DATENTRAEGER_QUELLE.test(g.quelle)).map(g => `${zusatzVon(g)} ${g.text}`), daten.geraete)
  for (const g of daten.gruppen) {
    // Datenträger-Ereignisse dem Gerät zuordnen: USB-Stick bzw. abgezogener Wechseldatenträger ist
    // kein Fehler der eingebauten Platte (sonst chkdsk/Plattentausch für einen Stick)
    const ort = DATENTRAEGER_QUELLE.test(g.quelle) ? ordneDatentraeger(zusatzVon(g) || g.text, geraete, geraet) : 'unklar'
    let r = ort === 'wechsel' ? REGEL_EXTERN : ALLE_REGELN.find(x => trifft(x, g) && !(x.nurServer && geraet !== 'server'))
    if (ort === 'intern' && r === REGEL_EXTERN) r = REGEL_INTERN
    if (!r) { if (RAUSCHEN.test(g.quelle) || RAUSCHEN.test(g.log)) rauschen++; else unbekannt.push(g); continue }
    if (ABGEDECKT.has(r.id)) continue
    const eingabe = r.eingabe ? r.eingabe(g, geraete) : ''
    const key = r.jeProgramm ? `${r.id}|${(g.app.split('|')[0] || '').toLowerCase()}` : r.jeEingabe ? `${r.id}|${eingabe.toLowerCase()}` : r.id
    const x = sammel.get(key)
    if (!x) sammel.set(key, { r, g, anzahl: g.anzahl, zuerst: g.zuerst, zuletzt: g.zuletzt, eingabe })
    else { x.anzahl += g.anzahl; if (g.zuerst < x.zuerst) x.zuerst = g.zuerst; if (g.zuletzt > x.zuletzt) { x.zuletzt = g.zuletzt; x.g = g } }
  }
  const roh: VdRoh[] = []
  for (const x of sammel.values()) {
    if (x.anzahl < (x.r.ab ?? 1)) continue
    const pf = x.r.schwererAb && x.anzahl >= x.r.schwererAb ? HOEHER[x.r.schwere] : x.r.schwere
    const zusatz = zusatzVon(x.g)
    const exe = zusatz ? '' : (x.g.app.split('|')[0] || '').trim()
    const fach: VdFachdiagnose | undefined = SAP_APP.test(exe) ? 'sap-fehlersuche' : SW_APP.test(exe) ? 'solidworks-diagnose' : undefined
    const titel0 = wert(x.r.titel, x.g)
    // Je Eingabe getrennte Befunde mit festem Titel unterscheidbar machen (z. B. Laufwerk C: / D:)
    const titel = x.r.jeEingabe && x.eingabe && typeof x.r.titel === 'string' ? `${titel0} – ${x.eingabe}` : titel0
    roh.push({
      typ: x.r.typ || `evt:${x.r.id}`, titel, text: `${titel}: ${x.r.bedeutung}`, schwere: PF_SCHWERE[pf],
      belege: [
        `${x.anzahl}× in ${daten.tage} Tagen · erstmals ${datumText(x.zuerst)} · zuletzt ${datumText(x.zuletzt)}`,
        `Quelle: ${x.g.quelle} · Ereignis ${x.g.id} · Protokoll ${x.g.log}`,
        ...(zusatz ? [`Betrifft: ${zusatz}`] : []),
        ...(exe ? [`Programm: ${exe}${x.g.app.split('|')[1] ? ` · Modul ${x.g.app.split('|')[1]}` : ''}${x.g.app.split('|')[2] ? ` · Code ${x.g.app.split('|')[2]}` : ''}`] : []),
        `Beispiel: ${x.g.text.slice(0, 260)}`,
      ],
      anzahl: x.anzahl, zuerst: x.zuerst, zuletzt: x.zuletzt, eingabe: x.eingabe || undefined, suche: wert(x.r.suche, x.g), fachdiagnose: fach,
      passend: umfang ? passtZurRichtung(x.r.typ || `evt:${x.r.id}`, umfang) : undefined,
    })
  }
  // Nicht zugeordnete Fehler: nur häufige bzw. kritische zeigen; Lösung über den Problem-Katalog
  unbekannt.sort((a, b) => b.anzahl - a.anzahl)
  for (const g of unbekannt.filter(u => u.anzahl >= 5 || u.stufe === 1).slice(0, 8)) {
    roh.push({
      typ: 'evt-unbekannt', titel: `${g.quelle} (Ereignis ${g.id}) ${g.anzahl}× protokolliert`, text: g.text.slice(0, 260), schwere: g.stufe === 1 ? 'warnung' : 'hinweis',
      belege: [`${g.anzahl}× in ${daten.tage} Tagen · erstmals ${datumText(g.zuerst)} · zuletzt ${datumText(g.zuletzt)}`, `Protokoll ${g.log}`, `Text: ${g.text.slice(0, 260)}`],
      anzahl: g.anzahl, zuerst: g.zuerst, zuletzt: g.zuletzt, suche: `${g.quelle} ${g.text}`.slice(0, 160), bereich: 'sonstiges',
    })
  }
  return { roh, rauschen, unbekannt }
}

/** Ereignis-Befund passt zur Richtung? (grob über die Bereiche der Katalogprobleme) */
const TYP_BEREICH: Record<string, string[]> = {
  'evt:bluescreen': ['Leistung & Speicher', 'Windows & Oberfläche', 'Hardware & Geräte'], 'evt:hart-aus': ['Leistung & Speicher', 'Akku & Energie', 'Hardware & Geräte'],
  'evt:hardware-whea': ['Hardware & Geräte', 'Leistung & Speicher'], 'evt:grafik-haengt': ['Bildschirm & Grafik'], 'evt:lx-livekernel': ['Bildschirm & Grafik'],
  'evt:lx-livekernel-usb': ['Hardware & Geräte', 'Audio & Headset'], 'evt:lx-livekernel-sonst': ['Hardware & Geräte'], 'evt:platte-extern': ['Hardware & Geräte'],
  'evt:platte-intern': ['Leistung & Speicher'], 'evt:lx-dateisystem': ['Leistung & Speicher'], 'evt:wlan-adapter': ['WLAN'], 'evt:wlan-verbindung': ['WLAN'],
  'evt:lx-kein-dc': ['Netzwerk & Internet', 'Anmeldung & Konto', 'Netzlaufwerke & Dateien'], 'evt:lx-dns': ['Netzwerk & Internet'], 'evt:lx-dhcp': ['Netzwerk & Internet'],
  'evt:lx-lan': ['Netzwerk & Internet'], 'evt:lx-ip-konflikt': ['Netzwerk & Internet'], 'evt:lx-zeit': ['Anmeldung & Konto'], 'evt:lx-kerberos': ['Anmeldung & Konto', 'Netzlaufwerke & Dateien'],
  'evt:lx-drosselung': ['Leistung & Speicher', 'Akku & Energie'], 'evt:lx-suchindex': ['Outlook & E-Mail', 'Windows & Oberfläche'],
}
export function passtZurRichtung(typ: string, u: RichtungsUmfang): boolean {
  if (!u.bereiche.size) return false
  return (TYP_BEREICH[typ] || []).some(b => u.bereiche.has(b))
}

// ── Windows Update: was ist wirklich ein Update-Problem? ─────────────────────
/** Dienst-Kennung des Microsoft Store (Store-App-Updates laufen über den WU-Client, sind aber kein Windows-Update). */
export const STORE_DIENST = '855e8a7c-ecb4-4ca3-b045-1dfa50104289'
/** Store-Apps („9NBLGGH…-Name“) und Defender-Signaturen/-Plattform: eigene Wege, eigene Prüfungen. */
export const WU_RAUSCHEN = /^9[A-Z0-9]{11}-|Security Intelligence|Sicherheitsinformationsupdate|Definition Update|Definitionsupdate|KB2267602|KB4052623|Antimalware Platform|Antischadsoftwareplattform/i
export interface WuFehler { t: string; id: number; code: string; kb: string; titel?: string; guid?: string; dienst?: string; text: string }
export interface WuOk { t: string; titel: string; guid: string }
/**
 * Nur echte Update-Probleme: ohne Store-Apps und Defender-Signaturen, ohne Updates, die danach doch
 * installiert wurden (gleiche Update-Kennung bzw. gleicher Titel, späterer Erfolg).
 */
export function wuRelevant(fehler: WuFehler[], ok: WuOk[]): { relevant: WuFehler[]; store: number; spaeterOk: number } {
  let store = 0, spaeterOk = 0
  const relevant: WuFehler[] = []
  for (const f of fehler) {
    const titel = s(f.titel), text = s(f.text)
    if (s(f.dienst).toLowerCase() === STORE_DIENST || WU_RAUSCHEN.test(titel) || (!titel && WU_RAUSCHEN.test(text.replace(/^.*?:\s*(?=9[A-Z0-9]{11}-)/, '')))) { store++; continue }
    const spaeter = ok.some(o => o.t > f.t && ((f.guid && o.guid === f.guid) || (titel && o.titel === titel)))
    if (spaeter) { spaeterOk++; continue }
    relevant.push(f)
  }
  return { relevant, store, spaeterOk }
}

// ── Windows-Integrität ───────────────────────────────────────────────────────
export function werteIntegritaet(d: Record<string, unknown>, umfang?: RichtungsUmfang): VdRoh[] {
  const roh: VdRoh[] = []
  const passend = umfang ? umfang.unter.has('up-wu') || umfang.unter.has('up-neustart') || umfang.bereiche.has('Updates & Software') : undefined
  const check = arr<string>(d.check).map(s)
  if (check[0] !== '@@LAEUFT@@' && check.length) {
    const aus = bereinigeAusgabe(check)
    const text = aus.join('\n')
    const zeile = (re: RegExp) => aus.find(z => re.test(z))?.trim()
    const fehler = /^\s*(?:Error|Fehler)\s*:\s*(\S+)/im.exec(text)?.[1]?.toLowerCase()
    if (zeile(/component store is repairable|kann repariert werden/i)) roh.push({ typ: 'integ-speicher-reparierbar', text: 'DISM /CheckHealth: „The component store is repairable.“', belege: aus.slice(-4), passend })
    else if (zeile(/cannot be repaired|kann nicht repariert werden/i)) roh.push({ typ: 'integ-speicher-nicht-reparierbar', text: 'DISM /CheckHealth: „The component store cannot be repaired.“', belege: aus.slice(-4), passend })
    else if (fehler) roh.push({ typ: 'integ-checkhealth-fehler', text: `DISM /CheckHealth endete mit Fehler ${fehler}${DISM_FEHLER[fehler] ? ' – ' + DISM_FEHLER[fehler] : ''}`, belege: aus.slice(-6), passend })
  }
  const flags = [d.rebootPending && 'Wartungsstapel wartet auf Neustart (RebootPending)', d.wuReboot && 'Windows Update verlangt Neustart (RebootRequired)', d.pendingXml && 'Ausstehende Komponentenänderungen (pending.xml)', d.packagesPending && 'Pakete warten auf Abschluss (PackagesPending)'].filter(Boolean) as string[]
  if (flags.length) roh.push({ typ: 'integ-neustart-ausstehend', text: `Neustart steht aus – ${flags.length} Hinweis(e)`, belege: [...flags, ...(d.boot ? [`Letzter Start: ${datumText(s(d.boot))}`] : [])], passend })
  const spuren = Number(d.cbsSpuren) || 0
  if (spuren > 0 && !roh.some(r => r.typ.startsWith('integ-speicher'))) {
    roh.push({ typ: 'integ-cbs-spuren', text: `${spuren} Einträge zu beschädigten Komponenten im CBS-Protokoll (30 Tage)`, belege: [...arr<string>(d.cbsZusammenfassung).slice(-4), ...arr<string>(d.cbsZeilen).slice(0, 5)].map(z => s(z).slice(0, 220)), passend })
  }
  for (const x of arr<{ n: string; d: string; st: string; s: string }>(d.dienste)) {
    if (s(x.st) === 'Disabled') roh.push({ typ: 'integ-wartungsdienst-aus', titel: `Wartungsdienst „${x.d}“ ist deaktiviert`, text: `Dienst ${x.n} (${x.d}) hat den Starttyp „Deaktiviert“.`, eingabe: x.n, belege: [`Status: ${x.s}`], passend })
  }
  const frei = Number(d.freiGB), gr = Number(d.groesseGB)
  if (isFinite(frei) && isFinite(gr) && gr > 0) {
    const anteil = frei / gr
    if (frei < 5 || anteil < 0.05 || frei < 15 || anteil < 0.1) {
      roh.push({ typ: 'integ-platz-knapp', schwere: frei < 5 || anteil < 0.05 ? 'kritisch' : 'warnung', text: `${s(d.lw) || 'Systemlaufwerk'} hat nur noch ${frei.toLocaleString('de-DE')} GB frei (${Math.round(anteil * 100)} % von ${gr.toLocaleString('de-DE')} GB)`,
        belege: [...(Number(d.sdDownloadGB) > 0.5 ? [`Update-Downloads belegen ${Number(d.sdDownloadGB).toLocaleString('de-DE')} GB`] : [])], passend: umfang ? umfang.unter.has('pf-cvoll') || umfang.bereiche.has('Leistung & Speicher') : undefined })
    }
  }
  const wuAlle = arr<WuFehler>(d.wuFehler).filter(x => x.id === 20 || x.id === 25 || x.id === 31)
  const { relevant: wu, store, spaeterOk } = wuRelevant(wuAlle, arr<WuOk>(d.wuOk))
  const setup = arr<WuFehler>(d.setupFehler)
  if (wu.length >= 2 || (wu.length && setup.length)) {
    const jeCode = new Map<string, { n: number; kb: Set<string>; titel: Set<string>; t: string }>()
    for (const x of [...wu, ...setup]) { const k = x.code || '(ohne Code)'; const e = jeCode.get(k) || { n: 0, kb: new Set<string>(), titel: new Set<string>(), t: '' }; e.n++; if (x.kb) e.kb.add(x.kb); else if (x.titel) e.titel.add(s(x.titel).slice(0, 60)); if (x.t > e.t) e.t = x.t; jeCode.set(k, e) }
    roh.push({ typ: 'integ-wu-fehler', text: `${wu.length} fehlgeschlagene Update-Vorgänge in 30 Tagen (${[...jeCode.keys()].filter(k => k.startsWith('0x')).slice(0, 4).join(', ') || 'ohne Code'})`,
      belege: [
        ...[...jeCode.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([k, e]) => `${k}: ${e.n}×${e.kb.size ? ' · ' + [...e.kb].slice(0, 3).join(', ') : e.titel.size ? ' · ' + [...e.titel].slice(0, 2).join(', ') : ''} · zuletzt ${datumText(e.t)}`),
        ...(store || spaeterOk ? [`Nicht mitgezählt: ${[store && `${store}× Store-App bzw. Virensignatur`, spaeterOk && `${spaeterOk}× später doch installiert`].filter(Boolean).join(', ')}`] : []),
      ],
      anzahl: wu.length, passend })
  }
  return roh
}

// ── Zusatzprüfungen (gestoppte Dienste, Aufgaben) ────────────────────────────
const WICHTIGE_DIENSTE = /^(Spooler|AudioSrv|AudioEndpointBuilder|Dnscache|LanmanWorkstation|LanmanServer|Netlogon|W32Time|Winmgmt|EventLog|Schedule|ProfSvc|gpsvc|mpssvc|BFE|WinDefend|CryptSvc|ZSAService|ZSATunnel|IntuneManagementExtension|TermService|SENS|Themes|nsi|Dhcp|WlanSvc|Wcmsvc|NlaSvc|W3SVC|WAS|MSSQLSERVER|SQLSERVERAGENT|MSSQL\$\w+|DFSR|DNS|NTDS|IISADMIN|WSearch|LxpSvc|Appinfo|PlugPlay|Power|RpcSs|SamSs|KeyIso|VaultSvc|CertPropSvc|iphlpsvc|DPS|WdiServiceHost|FontCache|ShellHWDetection)$/i
const HARMLOS = /^(sppsvc|MapsBroker|gupdate|gupdatem|edgeupdate|edgeupdatem|MicrosoftEdgeElevationService|RemoteRegistry|WbioSrvc|TrustedInstaller|wuauserv|UsoSvc|WaaSMedicSvc|tzautoupdate|stisvc|Wmiapsrv|DoSvc|BITS|CDPSvc|InstallService|uhssvc|GoogleChromeElevationService|AdobeARMservice|ClickToRunSvc|sedsvc|TabletInputService|wscsvc|ShellHWDetection|IntelAudioService|clr_optimization_v\d.*|SysMain|ose64|SSDPSRV)$/i

export function werteZusatz(d: Record<string, unknown>, geraet: VdGeraet): VdRoh[] {
  const roh: VdRoh[] = []
  const dienste = arr<{ n: string; d: string; exit: number; verz: boolean; trig: boolean; pfad: string }>(d.dienste)
  const weitere: string[] = []
  for (const x of dienste) {
    if (WICHTIGE_DIENSTE.test(x.n) && !HARMLOS.test(x.n)) {
      if (geraet === 'pc' && /^(W3SVC|WAS|MSSQL|SQLSERVERAGENT|DFSR|DNS|NTDS|IISADMIN|TermService|LanmanServer)/i.test(x.n)) continue
      roh.push({ typ: 'zus-dienst-gestoppt', titel: `Dienst „${x.d || x.n}“ läuft nicht`, text: `Der Dienst ${x.n} (${x.d}) steht auf „Automatisch“, läuft aber nicht.`, eingabe: x.n,
        belege: [`Beendigungscode: ${x.exit}`, ...(x.pfad ? [`Programm: ${x.pfad.slice(0, 160)}`] : [])] })
    } else if (!HARMLOS.test(x.n) && !x.verz && !x.trig && x.exit !== 0) weitere.push(`${x.d || x.n} (${x.n}, Code ${x.exit})`)
  }
  if (weitere.length) roh.push({ typ: 'zus-dienste-gestoppt-weitere', text: `${weitere.length} weitere automatische Dienste sind mit Fehlercode beendet`, belege: weitere.slice(0, 15), eingabe: weitere[0].replace(/.*\((\S+), Code.*/, '$1') })
  const aufg = arr<{ n: string; p: string; code: string; zuletzt: string }>(d.aufgaben)
  if (aufg.length) {
    const BEDEUTUNG: Record<string, string> = { '0x8007010b': '„Starten in“-Ordner fehlt', '0x80070002': 'Datei nicht gefunden', '0x8007052e': 'Anmeldung fehlgeschlagen (Kennwort)', '0x80070005': 'Zugriff verweigert', '0x00000001': 'Programm meldet Fehler (Code 1)', '0x800710e0': 'Aufgabe abgelehnt (Bedingungen/Konto)', '0x00041306': 'vom Benutzer abgebrochen' }
    roh.push({ typ: 'zus-aufgabe-fehler', text: `${aufg.length} geplante Aufgabe(n) enden mit Fehler`, belege: aufg.slice(0, 12).map(a => `${a.p}${a.n} → ${a.code}${BEDEUTUNG[a.code.toLowerCase()] ? ' (' + BEDEUTUNG[a.code.toLowerCase()] + ')' : ''}${a.zuletzt ? ' · zuletzt ' + datumText(a.zuletzt) : ''}`) })
  }
  return roh
}

// ── Server ───────────────────────────────────────────────────────────────────
const WRITER_DIENST: [RegExp, string][] = [
  [/SqlServerWriter/i, 'SQLWriter'], [/IIS (Metabase|Config) Writer/i, 'AppHostSvc'], [/WMI Writer/i, 'Winmgmt'], [/System Writer/i, 'CryptSvc'],
  [/BITS Writer/i, 'BITS'], [/Task Scheduler Writer/i, 'Schedule'], [/DFS Replication/i, 'DFSR'], [/NTDS/i, 'NTDS'], [/Dhcp Jet Writer/i, 'DHCPServer'],
  [/MSSearch|Search Service Writer/i, 'WSearch'], [/Registry Writer|COM\+ REGDB Writer|ASR Writer|Shadow Copy Optimization Writer/i, 'VSS'], [/Exchange/i, 'MSExchangeIS'],
  [/FRS Writer/i, 'NtFrs'], [/Cluster/i, 'ClusSvc'], [/WIDWriter/i, 'WIDWriter'], [/Hyper-V/i, 'vmms'],
]
export function leseVssWriter(text: string): { name: string; zustand: string; fehler: string }[] {
  const aus: { name: string; zustand: string; fehler: string }[] = []
  for (const block of (text || '').split(/\r?\n\s*\r?\n/)) {
    const name = /(?:Writer name|Verfassername):\s*'([^']+)'/i.exec(block)?.[1]
    if (!name) continue
    const zustand = /(?:State|Status):\s*\[\d+\]\s*(.+)/i.exec(block)?.[1]?.trim() || ''
    const fehler = /(?:Last error|Letzter Fehler):\s*(.+)/i.exec(block)?.[1]?.trim() || ''
    aus.push({ name, zustand, fehler })
  }
  return aus
}
export interface ServerStand { pruefungProbleme?: number; pruefungText?: string; zertKritisch?: number; zertWarnung?: number; zertNaechstes?: string; dismZustand?: string; dismText?: string; dismAm?: string }
export function werteServer(d: Record<string, unknown>, stand: ServerStand): VdRoh[] {
  const roh: VdRoh[] = []
  for (const w of leseVssWriter(s(d.vss))) {
    const stabil = /^(Stable|Stabil)/i.test(w.zustand)
    const ohneFehler = !w.fehler || /^(No error|Kein Fehler)/i.test(w.fehler)
    if (stabil && ohneFehler) continue
    const dienst = WRITER_DIENST.find(([re]) => re.test(w.name))?.[1] || 'VSS'
    roh.push({ typ: 'srv-vss-writer', titel: `VSS-Writer „${w.name}“: ${w.zustand || '?'}`, text: `Writer ${w.name} ist im Zustand „${w.zustand}“, letzter Fehler: ${w.fehler || '—'}`, eingabe: dienst, belege: [`zugehöriger Dienst: ${dienst}`] })
  }
  if ((stand.pruefungProbleme || 0) > 0) roh.push({ typ: 'srv-zustand-probleme', text: `${stand.pruefungProbleme} Problem(e) in „Dienste & Prüfungen“`, belege: stand.pruefungText ? [stand.pruefungText] : [] })
  if ((stand.zertKritisch || 0) + (stand.zertWarnung || 0) > 0) roh.push({ typ: 'srv-zertifikat', schwere: (stand.zertKritisch || 0) > 0 ? 'kritisch' : 'warnung', text: `${(stand.zertKritisch || 0) + (stand.zertWarnung || 0)} Zertifikat(e) laufen ab bzw. sind abgelaufen`, belege: stand.zertNaechstes ? [stand.zertNaechstes] : [] })
  if (stand.dismZustand && /reparierbar|nicht_reparierbar|fehler|unklar/.test(stand.dismZustand)) roh.push({ typ: 'srv-dism-auffaellig', schwere: stand.dismZustand === 'nicht_reparierbar' ? 'kritisch' : 'warnung', text: `Letzter DISM-Scan (${datumText(stand.dismAm)}): ${stand.dismText || stand.dismZustand}` })
  return roh
}

// ── Regeln der geführten Diagnose (alle Themen) ──────────────────────────────
const PC_BEREICHE = new Set(['Teams', 'Outlook & E-Mail', 'Office (Word/Excel/PowerPoint)', 'OneDrive & SharePoint', 'Browser', 'WLAN', 'VPN & Zscaler', 'Audio & Headset', 'Bildschirm & Grafik', 'Kamera & Mikrofon', 'Akku & Energie', 'SAP', 'SolidWorks & CAD', 'Smartphone & MFA', 'Telefonie & Sonstiges', 'Netzlaufwerke & Dateien'])
const ZS_IDS = new Set(ZSCALER_REGELN.map(r => r.id))
const KRITISCH_PROBLEM = /bluescreen|absturz|platte|ssd|festplatte|datentraeger|smart|virus|bedrohung|malware|ransom|bitlocker-wiederherstell|whea|hardwarefehler/i

/** Fakten-Zugriffe einer Regel mitschreiben (für die Nachprüfung: welche Sonden?). */
function mitProtokoll(f: DgFakten): { f: DgFakten; keys: Set<string> } {
  const keys = new Set<string>()
  const p = new Proxy(f, { get(t, k: string | symbol) { if (typeof k === 'string') keys.add(k); return (t as Record<string, DgWert>)[k as string] } })
  return { f: p, keys }
}
const fmtWert = (v: DgWert | undefined) => (Array.isArray(v) ? v.slice(0, 4).join(', ') + (v.length > 4 ? ' …' : '') : v === true ? 'ja' : v === false ? 'nein' : v == null ? '—' : String(v)).slice(0, 120)

export function werteSonden(fakten: DgFakten, geraet: VdGeraet, umfang?: RichtungsUmfang): VdRoh[] {
  type Treffer = { problem: string; text: string; schwere: 1 | 2 | 3; passend: boolean; keys: Set<string> }
  const treffer: Treffer[] = []
  for (const o of DG_THEMEN) for (const u of o.unter) {
    const direkt = !!umfang?.unter.has(u.id)
    for (const r of u.regeln as DgRegel[]) {
      if (geraet === 'server') {
        if (ZS_IDS.has(r.id)) continue
        const pb = problemVon(r.problem)
        if (pb && PC_BEREICHE.has(pb.bereich)) continue
      }
      const pr = mitProtokoll(fakten)
      let an = false
      try { an = r.wenn(pr.f) === true && (direkt || !r.imBereich || r.imBereich(pr.f) === true) } catch { an = false }
      if (!an) continue
      if (r.viele) {
        let teile: ReturnType<NonNullable<DgRegel['viele']>> = []
        try { teile = r.viele(pr.f) } catch { teile = [] }
        for (const t of teile) treffer.push({ problem: t.problem, text: t.text, schwere: r.schwere, passend: direkt, keys: pr.keys })
        continue
      }
      let text = ''
      try { text = r.befund(pr.f) } catch { text = '' }
      treffer.push({ problem: r.problem, text: text || r.id, schwere: r.schwere, passend: direkt, keys: pr.keys })
    }
  }
  // je Problem einmal: stärkste Regel, „passend“ wenn irgendeine passende Regel traf
  const je = new Map<string, Treffer & { texte: string[] }>()
  for (const t of treffer.sort((a, b) => b.schwere - a.schwere)) {
    const x = je.get(t.problem)
    if (!x) je.set(t.problem, { ...t, texte: [t.text] })
    else { x.passend = x.passend || t.passend; if (!x.texte.includes(t.text)) x.texte.push(t.text); for (const k of t.keys) x.keys.add(k) }
  }
  const roh: VdRoh[] = []
  for (const t of je.values()) {
    const p = problemVon(t.problem)
    const sonden = [...new Set([...t.keys].map(k => k.split('.')[0]).filter(k => k && k !== 'frage' && k !== 'pc'))]
    const messwerte = [...t.keys].filter(k => k.includes('.') && !k.startsWith('frage.') && !k.endsWith('._ok') && fakten[k] !== undefined).slice(0, 6).map(k => `${k} = ${fmtWert(fakten[k])}`)
    roh.push({
      typ: 'dg:' + t.problem, problem: t.problem, titel: p?.titel, text: t.texte.slice(0, 3).join(' · '),
      schwere: t.schwere === 3 ? (KRITISCH_PROBLEM.test(t.problem + ' ' + (p?.titel || '')) ? 'kritisch' : 'warnung') : t.schwere === 2 ? 'warnung' : 'hinweis',
      belege: [...t.texte.slice(0, 4), ...(messwerte.length ? ['Messwerte: ' + messwerte.join(' · ')] : [])],
      sonden, passend: t.passend || undefined,
    })
  }
  return roh
}
