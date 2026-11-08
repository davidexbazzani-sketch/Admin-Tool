// ── Netzwerk-Diagnose: Ursachen-Analyse („wer oder was trennt?") ──────────────
// Wertet die Tiefenanalyse (tiefe.ts) aus — rein, ohne Netz, damit sie sich testen lässt:
//   • Grund jeder Trennung (Reason aus Event 8003, nicht die erste Meldungszeile)
//   • Zeitmuster (jeden Tag zur gleichen Uhrzeit?) und Beginn (erst seit Datum X?)
//   • Neuverbindung: automatisch oder von Hand? (Event 8001 „Manuelle Verbindung …")
//   • Umfeld: was lief in den Minuten davor (Standby, Richtlinie, Intune, Aufgabe,
//     Treiber, Installation, LAN)? Gezählt wird, wie viele Trennungen dasselbe Umfeld haben.
//   • geplante Aufgaben mit passender Startzeit / passendem letzten Lauf
//   • Profil (manuell? 802.1X mit Benutzeranmeldung?), Richtlinien, BIOS, Software
// Ergebnis: Befunde (Kategorie „ursache") + eine Klartext-Diagnose mit nächsten Schritten.
//
// Anlass (06.11.2026, DE1HF5480SLL): 5 Trennungen Mo–Fr jeweils 09:00–09:05, erst seit
// 02.11., danach nur von Hand wieder verbunden. Die alte Analyse zeigte nur „5 Aussetzer".

import type { NetDaten, NetLauf, NetBefund, NetTiefe, UmfeldEreignis, AufgabeInfo, Aenderung, WlanProfil } from './types'

const MIN = 60_000, TAG = 86_400_000
const ms = (iso?: string) => { const t = iso ? Date.parse(iso) : NaN; return isNaN(t) ? NaN : t }
const z2 = (n: number) => String(n).padStart(2, '0')
const uhrVon = (min: number) => `${z2(Math.floor(min / 60) % 24)}:${z2(Math.round(min) % 60)}`
export const datumKurz = (t: number) => { const d = new Date(t); return `${z2(d.getDate())}.${z2(d.getMonth() + 1)}.` }
export const zeitKurz = (t: number) => { const d = new Date(t); return `${z2(d.getDate())}.${z2(d.getMonth() + 1)}. ${z2(d.getHours())}:${z2(d.getMinutes())}` }
const minuteDesTages = (t: number) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 }
const TAGNAME = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// ── Grund der Trennung ───────────────────────────────────────────────────────
export type GrundKat = 'benutzer' | 'neueVerbindung' | 'treiber' | 'profil' | 'energie' | 'funk' | 'nichtVerfuegbar' | 'sicherheit' | 'sonst' | 'unbekannt'
export const GRUND_TEXT: Record<GrundKat, string> = {
  benutzer: 'vom Benutzer bzw. einem Programm getrennt',
  neueVerbindung: 'Benutzer wollte ein anderes Netz',
  treiber: 'vom Treiber getrennt',
  profil: 'WLAN-Profil geändert oder gelöscht',
  energie: 'Energie / Standby',
  funk: 'Funk ausgeschaltet',
  nichtVerfuegbar: 'Netz nicht mehr verfügbar',
  sicherheit: 'Sicherheit / Anmeldung',
  sonst: 'sonstiger Grund',
  unbekannt: 'kein Grund protokolliert',
}
/** Reason-Text (deutsch/englisch) → Kategorie. */
export function grundKategorie(grund?: string): GrundKat {
  const g = (grund || '').toLowerCase()
  if (!g.trim()) return 'unbekannt'
  if (/neue verbindung|new connection/.test(g)) return 'neueVerbindung'
  if (/vom benutzer|by the user|benutzer getrennt|user (has )?disconnect/.test(g)) return 'benutzer'
  if (/profil|profile/.test(g)) return 'profil'
  if (/treiber|driver/.test(g)) return 'treiber'
  if (/standby|ruhezustand|energie|sleep|hibernat|power/.test(g)) return 'energie'
  if (/funk.*aus|radio|ausgeschaltet|turned off|switched off/.test(g)) return 'funk'
  if (/nicht (mehr )?verfügbar|not available|reichweite|out of range|nicht gefunden|not found|nicht mehr sichtbar/.test(g)) return 'nichtVerfuegbar'
  if (/sicherheit|security|authent|schlüssel|\bkey\b/.test(g)) return 'sicherheit'
  return 'sonst'
}

export interface TrennungDetail {
  zeit: string; t: number; grund: string; kat: GrundKat; code?: string; modus?: string; profil?: string; ssid?: string
  /** nächste Verbindung danach (innerhalb von 24 h) */
  neu?: { nachSek: number; modus?: string; manuell: boolean; profil?: string }
}

/** Trennungen mit Grund und der jeweils nächsten Verbindung — neueste zuerst. */
export function trennungsDetails(t?: NetTiefe): TrennungDetail[] {
  if (!t) return []
  const vb = (t.verbindungen || []).map(v => ({ ...v, t: ms(v.zeit) })).filter(v => !isNaN(v.t)).sort((a, b) => a.t - b.t)
  const out: TrennungDetail[] = []
  for (const x of t.trennungen || []) {
    const tt = ms(x.zeit)
    if (isNaN(tt)) continue
    const n = vb.find(v => v.t > tt && v.t - tt < TAG)
    out.push({
      zeit: x.zeit, t: tt, grund: x.grund || '', kat: grundKategorie(x.grund), code: x.code, modus: x.modus, profil: x.profil, ssid: x.ssid,
      neu: n ? { nachSek: Math.round((n.t - tt) / 1000), modus: n.modus, manuell: /manuell|manual/i.test(n.modus || ''), profil: n.profil } : undefined,
    })
  }
  return out.sort((a, b) => b.t - a.t)
}
/** Trennungen, die zählen: „Benutzer wollte ein anderes Netz" ist gewollt und kein Fehler. */
export const relevante = (d: TrennungDetail[]) => d.filter(x => x.kat !== 'neueVerbindung')

// ── Zeitmuster + Beginn ──────────────────────────────────────────────────────
export interface Zeitmuster { uhr: string; von: string; bis: string; vonMin: number; bisMin: number; tage: number; treffer: number; gesamt: number; wochentage: string }

export function wochentageText(tage: number[]): string {
  const s = [...new Set(tage)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
  const key = s.join(',')
  if (key === '1,2,3,4,5') return 'Mo–Fr'
  if (s.length === 7) return 'täglich'
  return s.map(i => TAGNAME[i]).join(', ')
}

/** Häufen sich die Trennungen an verschiedenen Tagen zur gleichen Uhrzeit (Fenster 20 min)? */
export function zeitmuster(det: TrennungDetail[], fensterMin = 20): Zeitmuster | null {
  const r = relevante(det)
  if (r.length < 3) return null
  let best: { m: number; tage: Set<string>; treffer: TrennungDetail[] } | null = null
  for (const a of r) {
    const m = minuteDesTages(a.t)
    const drin = r.filter(x => { const mm = minuteDesTages(x.t); return mm >= m && mm < m + fensterMin })
    const tage = new Set(drin.map(x => new Date(x.t).toDateString()))
    if (!best || tage.size > best.tage.size || (tage.size === best.tage.size && drin.length > best.treffer.length)) best = { m, tage, treffer: drin }
  }
  if (!best) return null
  const anteil = best.treffer.length / r.length
  if (best.tage.size < 3 || (anteil < 0.6 && best.tage.size < 4)) return null
  const mins = best.treffer.map(x => minuteDesTages(x.t)).sort((a, b) => a - b)
  const median = mins[Math.floor(mins.length / 2)]
  return {
    uhr: uhrVon(median), von: uhrVon(Math.floor(mins[0])), bis: uhrVon(Math.floor(mins[mins.length - 1])),
    vonMin: mins[0], bisMin: mins[mins.length - 1], tage: best.tage.size, treffer: best.treffer.length, gesamt: r.length,
    wochentage: wochentageText(best.treffer.map(x => new Date(x.t).getDay())),
  }
}

/** Erst seit Tag X? (≥ 4 ruhige Tage am Anfang des 14-Tage-Fensters) */
export function beginn(det: TrennungDetail[], scanIso: string, tage = 14): { erste: number; ruhigeTage: number } | null {
  const r = relevante(det)
  const scan = ms(scanIso)
  if (!r.length || isNaN(scan)) return null
  const erste = Math.min(...r.map(x => x.t))
  const ruhigeTage = Math.floor((erste - (scan - tage * TAG)) / TAG)
  return ruhigeTage >= 4 ? { erste, ruhigeTage } : null
}

// ── Umfeld der Trennungen ────────────────────────────────────────────────────
export type UmfeldKat = 'standby-aufwachen' | 'standby-einschlafen' | 'richtlinie' | 'wlan-richtlinie' | 'mdm' | 'aufgabe' | 'treiber' | 'installation' | 'lan' | 'dienst' | 'verbindungsmanager'
export const UMFELD_TEXT: Record<UmfeldKat, string> = {
  'standby-aufwachen': 'PC wacht aus dem Standby auf',
  'standby-einschlafen': 'PC geht in den Standby',
  'richtlinie': 'Gruppenrichtlinie wird angewendet',
  'wlan-richtlinie': 'WLAN-Gruppenrichtlinie wird angewendet',
  'mdm': 'Intune/MDM-Synchronisierung',
  'aufgabe': 'Geplante Aufgabe startet',
  'treiber': 'Adapter/Treiber wird neu initialisiert',
  'installation': 'Installation oder Update',
  'lan': 'LAN-Verbindung ändert sich',
  'dienst': 'Netzwerk-Dienst startet/stoppt',
  'verbindungsmanager': 'Verbindungs-Manager (WcmSvc) greift ein',
}

/** Ein Umfeld-Ereignis → Kategorie (oder null = nur in der Zeitleiste zeigen). */
export function umfeldKategorie(e: UmfeldEreignis): UmfeldKat | null {
  const q = e.quelle || '', txt = `${e.text || ''} ${e.extra || ''}`
  if (e.log === 'Aufgabe') return 'aufgabe'
  if (e.log === 'MDM') return 'mdm'
  if (e.log === 'Verbindungsmanager') return 'verbindungsmanager'
  if (e.log === 'Richtlinie') return /wireless|drahtlos|wlan|802\.11|wi-?fi/i.test(txt) ? 'wlan-richtlinie' : 'richtlinie'
  if (e.log === 'Anwendung') return /msiinstaller/i.test(q) ? 'installation' : null
  if (e.log !== 'System') return null
  if (/Kernel-Power/i.test(q)) { if ([507, 107].includes(e.id)) return 'standby-aufwachen'; if ([506, 42].includes(e.id)) return 'standby-einschlafen'; return null }
  if (/Power-Troubleshooter/i.test(q) && e.id === 1) return 'standby-aufwachen'
  if (/WindowsUpdateClient/i.test(q)) return 'installation'
  if (/e1d|e1i|e1r|e2f|Ethernet|GbE|I219|I225|I226/i.test(q + ' ' + txt) && /link|verbindung|getrennt|hergestellt|disconnect|connect/i.test(txt)) return 'lan'
  if (/UserPnp|Kernel-PnP|Netwtw|rtw|RTWlan|Realtek|NDIS|NetAdapter/i.test(q)) return 'treiber'
  if (/Service Control Manager/i.test(q)) return 'dienst'
  return null
}

export interface UmfeldTreffer { kat: UmfeldKat; label: string; anzahl: number; fenster: number; belege: { zeit: string; offsetSek: number; text: string }[] }

/** Welche Umfeld-Kategorien tauchen bei MEHREREN Trennungen kurz davor auf? */
export function umfeldTreffer(t?: NetTiefe): UmfeldTreffer[] {
  const fenster = (t?.umfeld || []).filter(f => !isNaN(ms(f.trennung)))
  if (!fenster.length) return []
  const je = new Map<UmfeldKat, { anzahl: number; belege: UmfeldTreffer['belege'] }>()
  for (const f of fenster) {
    const tt = ms(f.trennung)
    const gesehen = new Set<UmfeldKat>()
    for (const e of f.ereignisse || []) {
      const k = umfeldKategorie(e)
      if (!k) continue
      const off = Math.round((ms(e.zeit) - tt) / 1000)
      // Das Umfeld soll VOR der Trennung liegen (bis 30 s danach zählt noch mit)
      if (isNaN(off) || off > 30) continue
      const eintrag = je.get(k) ?? { anzahl: 0, belege: [] }
      if (!gesehen.has(k)) { eintrag.anzahl++; gesehen.add(k); if (eintrag.belege.length < 3) eintrag.belege.push({ zeit: e.zeit, offsetSek: off, text: `${e.quelle.replace(/^Microsoft-Windows-/, '')} ${e.id}: ${e.extra || e.text}`.slice(0, 160) }) }
      je.set(k, eintrag)
    }
  }
  const n = fenster.length
  return [...je.entries()]
    .filter(([, v]) => v.anzahl >= Math.max(2, Math.ceil(n * 0.5)) || (n === 1 && v.anzahl === 1))
    .map(([kat, v]) => ({ kat, label: UMFELD_TEXT[kat], anzahl: v.anzahl, fenster: n, belege: v.belege }))
    .sort((a, b) => b.anzahl - a.anzahl)
}

export const offsetText = (sek: number) => {
  const s = Math.abs(sek), v = sek < 0 ? '−' : sek > 0 ? '+' : '±'
  return `${v}${Math.floor(s / 60)}:${z2(s % 60)} min`
}

// ── Geplante Aufgaben ────────────────────────────────────────────────────────
export interface AufgabenTreffer { aufgabe: AufgabeInfo; warum: string; microsoft: boolean; lauf: boolean }
const istMicrosoft = (a: AufgabeInfo) => /^\\Microsoft\\/i.test(a.pfad || '')
const triggerMinute = (start?: string) => { const m = /T(\d{2}):(\d{2})/.exec(start || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN }

/** Aufgaben, deren Startzeit zum Zeitmuster passt oder die kurz vor einer Trennung zuletzt liefen. */
export function aufgabenTreffer(t: NetTiefe | undefined, det: TrennungDetail[], muster: Zeitmuster | null): AufgabenTreffer[] {
  if (!t) return []
  const r = relevante(det)
  const out: AufgabenTreffer[] = []
  for (const a of t.aufgaben || []) {
    if (/ITAdminTool WLAN-Neuverbindung/i.test(a.name)) continue
    const gruende: string[] = []
    let lauf = false
    if (muster) {
      for (const g of a.trigger || []) {
        if (g.aktiv === false || !/time|daily|weekly|monthly|calendar/i.test(g.typ)) continue
        const m = triggerMinute(g.start)
        if (!isNaN(m) && m >= muster.vonMin - 15 && m <= muster.bisMin + 5) { gruende.push(`startet ${/daily/i.test(g.typ) ? 'täglich' : /weekly/i.test(g.typ) ? 'wöchentlich' : 'zeitgesteuert'} um ${uhrVon(m)}${g.wdh ? ` (Wiederholung ${g.wdh})` : ''}`); break }
      }
    }
    const lr = ms(a.letzterLauf)
    if (!isNaN(lr)) {
      const nah = r.find(x => lr <= x.t + 60_000 && lr >= x.t - 10 * MIN)
      if (nah) { lauf = true; gruende.push(`lief zuletzt ${zeitKurz(lr)} — ${offsetText(Math.round((lr - nah.t) / 1000))} vor der Trennung`) }
    }
    if (gruende.length) out.push({ aufgabe: a, warum: gruende.join(' · '), microsoft: istMicrosoft(a), lauf })
  }
  return out.sort((x, y) => Number(x.microsoft) - Number(y.microsoft) || Number(y.lauf) - Number(x.lauf)).slice(0, 8)
}

// ── Änderungen kurz vor dem Beginn ───────────────────────────────────────────
const RAUSCHEN = /security intelligence|kb2267602|defender antivirus|definitionsupdate|definition update/i
export function aenderungenVor(t: NetTiefe | undefined, bis: number, vorTage = 10, nachTage = 1): Aenderung[] {
  if (!t) return []
  const seen = new Set<string>()
  return (t.aenderungen || [])
    .filter(a => { const x = ms(a.zeit); return !isNaN(x) && x >= bis - vorTage * TAG && x <= bis + nachTage * TAG && !RAUSCHEN.test(a.text) })
    .filter(a => { const k = `${a.art}|${a.text}|${(a.zeit || '').slice(0, 10)}`; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => ms(b.zeit) - ms(a.zeit))
    .slice(0, 15)
}

/** Das Profil, das am häufigsten getrennt wurde (ohne gewollte Netzwechsel). */
export function genutztesProfil(t: NetTiefe | undefined, det: TrennungDetail[]): WlanProfil | undefined {
  const zaehl = new Map<string, number>()
  for (const x of relevante(det)) if (x.profil) zaehl.set(x.profil, (zaehl.get(x.profil) || 0) + 1)
  const name = [...zaehl.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!name) return undefined
  return (t?.profile || []).find(p => p.name === name) ?? { name }
}

/** LAN-„Trennungen" aus dem Netzwerkprofil-Protokoll, die in Wahrheit zur WLAN-Trennung gehören (gleiche Minute). */
/** Je Eintrag von lanEreignisse.letzte: liegt er in derselben Minute (±1) wie eine WLAN-Trennung?
 *  (NetworkProfile 10001 meldet das NETZ, nicht den Adapter → das ist dann die WLAN-Trennung.) */
export function lanZeitgleichMitWlan(d: NetDaten): boolean[] {
  const le = d.lanEreignisse
  if (!le) return []
  const wl = new Set<number>()
  for (const x of d.tiefe?.trennungen || []) { const t = ms(x.zeit); if (!isNaN(t)) wl.add(Math.floor(t / MIN)) }
  const wEv = d.ereignisse?.letzte
  for (const x of (Array.isArray(wEv) ? wEv : wEv ? [wEv as never] : [])) { const t = ms(((x as { zeit?: string }).zeit || '').replace(' ', 'T')); if (!isNaN(t)) wl.add(Math.floor(t / MIN)) }
  const liste = Array.isArray(le.letzte) ? le.letzte : le.letzte ? [le.letzte as never] : []
  return liste.map(x => {
    const t = ms(((x as { zeit?: string }).zeit || '').replace(' ', 'T'))
    if (isNaN(t)) return false
    const m = Math.floor(t / MIN)
    return wl.has(m) || wl.has(m - 1) || wl.has(m + 1)
  })
}

export function lanTrennungenEigen(d: NetDaten): { eigene: number; gemeinsam: number } {
  const le = d.lanEreignisse
  if (!le) return { eigene: 0, gemeinsam: 0 }
  const gemeinsam = lanZeitgleichMitWlan(d).filter(Boolean).length
  return { eigene: Math.max(0, le.disconnects - gemeinsam), gemeinsam }
}

// ── Befunde ──────────────────────────────────────────────────────────────────
type B = Omit<NetBefund, 'verbindung'>
const bef = (b: B): NetBefund => ({ ...b, verbindung: 'WLAN' })

export interface UrsachenAuswertung {
  det: TrennungDetail[]
  muster: Zeitmuster | null
  start: { erste: number; ruhigeTage: number } | null
  umfeld: UmfeldTreffer[]
  aufgaben: AufgabenTreffer[]
  aenderungen: Aenderung[]
  profil?: WlanProfil
  kats: { kat: GrundKat; anzahl: number }[]
  ohneAutoNeu: { anzahl: number; von: number; schnittMin?: number }
}

export function werteAus(lauf: NetLauf): UrsachenAuswertung | null {
  const t = lauf.daten?.tiefe
  if (!t || t.ok === false) return null
  const det = trennungsDetails(t)
  const r = relevante(det)
  const muster = zeitmuster(det)
  const start = beginn(det, lauf.ranAt)
  const zaehl = new Map<GrundKat, number>()
  for (const x of r) zaehl.set(x.kat, (zaehl.get(x.kat) || 0) + 1)
  const mitNeu = r.filter(x => x.neu || Date.parse(lauf.ranAt) - x.t > 15 * MIN)
  const ohne = mitNeu.filter(x => !x.neu || x.neu.manuell || x.neu.nachSek > 10 * 60)
  const dauer = ohne.map(x => x.neu?.nachSek).filter((s): s is number => s != null)
  return {
    det, muster, start,
    umfeld: umfeldTreffer(t),
    aufgaben: aufgabenTreffer(t, det, muster),
    aenderungen: start ? aenderungenVor(t, start.erste) : [],
    profil: genutztesProfil(t, det),
    kats: [...zaehl.entries()].map(([kat, anzahl]) => ({ kat, anzahl })).sort((a, b) => b.anzahl - a.anzahl),
    ohneAutoNeu: { anzahl: ohne.length, von: mitNeu.length, schnittMin: dauer.length ? Math.round(dauer.reduce((s, x) => s + x, 0) / dauer.length / 60) : undefined },
  }
}

export function ursachenBefunde(lauf: NetLauf, a: UrsachenAuswertung | null = werteAus(lauf)): NetBefund[] {
  const d = lauf.daten, t = d?.tiefe
  const out: NetBefund[] = []
  if (!t) return out
  if (t.ok === false) {
    out.push(bef({ id: 'tiefe-fehler', titel: 'Tiefenanalyse nicht möglich', gewicht: 'INFO', ist: t.fehler || '—', soll: '—',
      wirkung: 'Der zweite Lesedurchgang (Grund und Umfeld der Trennungen, Aufgaben, Richtlinien) lief nicht durch. Die übrigen Befunde gelten trotzdem.',
      fundort: 'Tiefenanalyse', kategorie: 'info', fixbar: false }))
    return out
  }
  if (!a) return out
  const r = relevante(a.det)

  // 1) Zeitmuster
  if (a.muster) {
    const m = a.muster
    out.push(bef({ id: 'zeitmuster', titel: `WLAN trennt sich jeden Tag um ≈ ${m.uhr} Uhr (${m.tage} Tage)`, gewicht: 'HOCH',
      ist: `${m.treffer} von ${m.gesamt} Trennungen zwischen ${m.von} und ${m.bis} Uhr · ${m.wochentage}`, soll: 'keine Trennung zur festen Uhrzeit',
      wirkung: 'Ein Funkloch oder ein Access-Point-Problem kommt nicht jeden Tag zur gleichen Minute. Fast immer löst dann etwas Zeitgesteuertes die Trennung aus: eine geplante Aufgabe, eine Softwareverteilung (SCCM/Intune), eine Gruppenrichtlinie, ein VPN- oder Netzzugangs-Client — oder das Aufwachen aus dem Standby, wenn der PC morgens benutzt wird.',
      fundort: 'WLAN-AutoConfig Event 8003 (Uhrzeiten)', kategorie: 'ursache', fixbar: false }))
  }
  // 2) Beginn
  if (a.start) {
    const lst = a.aenderungen.slice(0, 6).map(x => `${datumKurz(ms(x.zeit))} ${x.art}: ${x.text}`)
    out.push(bef({ id: 'beginn', titel: `Trennungen erst seit ${datumKurz(a.start.erste)}`, gewicht: a.muster ? 'MITTEL' : 'INFO',
      ist: `davor ${a.start.ruhigeTage} Tage ohne Trennung`, soll: '—',
      wirkung: `Kurz vor diesem Tag hat sich vermutlich etwas geändert: ein Update, eine neue Richtlinie, neue Software, eine neue Aufgabe — oder der PC läuft seitdem über WLAN statt Kabel.${lst.length ? ` Änderungen in den Tagen davor: ${lst.join(' · ')}` : ' In den 10 Tagen davor ist auf dem PC keine Installation protokolliert.'}`,
      fundort: 'Event 8003 + Updates/Treiber/Software/Aufgaben der letzten 30 Tage', kategorie: 'ursache', fixbar: false }))
  }
  // 3) Gemeldeter Grund
  const top = a.kats[0]
  if (top && r.length) {
    const anteil = top.anzahl / r.length
    const vert = a.kats.map(k => `${k.anzahl}× ${GRUND_TEXT[k.kat]}`).join(' · ')
    const regel: Partial<Record<GrundKat, B>> = {
      benutzer: { id: 'grund-benutzer', titel: 'Windows meldet: Trennung „vom Benutzer“ ausgelöst', gewicht: 'HOCH', ist: vert, soll: 'keine bewusste Trennung',
        wirkung: 'Für Windows ist die Trennung bewusst ausgelöst worden — durch den Benutzer oder, viel häufiger, durch ein Programm oder Skript (netsh, VPN-/NAC-Client wie Cisco Network Access Manager, Verbindungs-Optimierer, Softwareverteilung). Ein so getrenntes Netz verbindet Windows absichtlich NICHT automatisch neu, bis jemand es von Hand tut — genau das Bild „lässt sich nur manuell wieder verbinden“.',
        fundort: 'Event 8003 → Reason', kategorie: 'ursache', fixbar: false },
      profil: { id: 'grund-profil', titel: 'WLAN-Profil wird geändert oder neu geschrieben', gewicht: 'HOCH', ist: vert, soll: 'Profil bleibt unverändert',
        wirkung: 'Windows trennt, wenn das WLAN-Profil geändert, gelöscht oder neu ausgerollt wird — typisch für eine Gruppenrichtlinie oder Intune, die das Profil regelmäßig neu schreibt. Bei 802.1X mit Benutzeranmeldung braucht es danach oft einen Klick.',
        fundort: 'Event 8003 → Reason', kategorie: 'ursache', fixbar: false },
      treiber: { id: 'grund-treiber', titel: 'Der WLAN-Treiber trennt die Verbindung', gewicht: 'MITTEL', ist: vert, soll: 'keine Treiber-Trennung',
        wirkung: 'Der Treiber hat selbst getrennt — Auslöser sind meist Energiesparfunktionen, ein Neustart des Adapters, Firmware-/Treiberfehler oder ein abreißendes Signal. Treiber aktualisieren und die Energie-Einstellungen prüfen.',
        fundort: 'Event 8003 → Reason', kategorie: 'ursache', fixbar: false },
      energie: { id: 'grund-energie', titel: 'Trennung wegen Energie/Standby', gewicht: 'MITTEL', ist: vert, soll: '—',
        wirkung: 'Windows trennt beim Wechsel in den Standby bzw. bei Energiesparmaßnahmen. Beim Aufwachen sollte automatisch neu verbunden werden — passiert das nicht, Netzwerk im Standby und Treiber prüfen.',
        fundort: 'Event 8003 → Reason', kategorie: 'ursache', fixbar: false },
      nichtVerfuegbar: { id: 'grund-netz', titel: 'Das Netz war nicht mehr erreichbar', gewicht: 'MITTEL', ist: vert, soll: '—',
        wirkung: 'Der PC hat das Netz verloren (außer Reichweite, Access Point weg/neu gestartet). Das spricht eher für eine Funk-/AP-Ursache — Standort, Signal und die Access-Point-Seite prüfen.',
        fundort: 'Event 8003 → Reason', kategorie: 'netzwerk', fixbar: false },
      sicherheit: { id: 'grund-sicherheit', titel: 'Trennung bei der Sicherheit/Anmeldung', gewicht: 'MITTEL', ist: vert, soll: '—',
        wirkung: 'Die WLAN-Sicherheit bzw. 802.1X-Anmeldung hat die Verbindung beendet (z. B. Neu-Authentifizierung schlägt fehl, Zertifikat). RADIUS/NPS und Client-Zertifikat prüfen.',
        fundort: 'Event 8003 → Reason', kategorie: 'netzwerk', fixbar: false },
    }
    const b = regel[top.kat]
    if (b && anteil >= 0.5) out.push(bef(b))
  }
  // 4) Kein automatisches Neuverbinden
  const oa = a.ohneAutoNeu
  if (oa.anzahl >= 2 && oa.anzahl >= Math.ceil(oa.von * 0.5)) {
    const p = a.profil
    const warum = [
      a.kats[0]?.kat === 'benutzer' ? 'die Trennung gilt als „vom Benutzer“ — Windows verbindet dann bewusst nicht von selbst neu' : '',
      p?.modus && /manuell|manual/i.test(p.modus) ? `das Profil „${p.name}“ steht auf „${p.modus}“` : '',
      p?.authMode && /^user$/i.test(p.authMode) ? '802.1X mit Benutzeranmeldung braucht nach einer Trennung oft eine Bestätigung' : '',
    ].filter(Boolean)
    out.push(bef({ id: 'kein-auto-neu', titel: 'Nach der Trennung verbindet Windows nicht automatisch neu', gewicht: 'HOCH',
      ist: `${oa.anzahl} von ${oa.von} Trennungen: erst von Hand bzw. nach mehr als 10 min neu verbunden${oa.schnittMin != null ? ` (Ø nach ${oa.schnittMin} min)` : ''}`, soll: 'automatisch nach wenigen Sekunden',
      wirkung: `Das bestätigt die Beschreibung „lässt sich nur manuell verbinden“.${warum.length ? ' Wahrscheinlicher Grund: ' + warum.join('; ') + '.' : ''} Event 8001 zeigt dazu „Manuelle Verbindung mit einem Profil“.`,
      fundort: 'Event 8001 → ConnectionMode', kategorie: 'ursache', fixbar: false }))
    // Notlösung (opt-in)
    if (p?.name) {
      out.push(bef({ id: 'reconnect-task', titel: `Notlösung: „${p.name}“ nach einer Trennung automatisch neu verbinden`, gewicht: 'MITTEL', standardAus: true,
        ist: 'keine automatische Neuverbindung', soll: '20 s nach jeder Trennung neu verbinden',
        wirkung: 'Legt auf dem PC eine geplante Aufgabe an: Sobald Windows eine Trennung dieses Profils meldet (Event 8003), wird nach 20 Sekunden neu verbunden — für den angemeldeten Benutzer (wichtig bei 802.1X mit Benutzeranmeldung). Übersprungen wird, wenn der Benutzer selbst ein anderes Netz gewählt hat, wenn schon eine WLAN-Verbindung steht oder ein LAN-Kabel verbunden ist.',
        fundort: `Aufgabenplanung → „ITAdminTool WLAN-Neuverbindung“`, kategorie: 'aufgabe', fixbar: true, fix: { art: 'reconnect-task', profil: p.name },
        hinweis: 'Behebt nicht die Ursache — nur bis die Ursache gefunden ist. „Rückgängig“ entfernt die Aufgabe wieder.' }))
    }
  }
  // 5) Umfeld
  const gewU: Partial<Record<UmfeldKat, NetBefund['gewicht']>> = { 'standby-aufwachen': 'HOCH', 'wlan-richtlinie': 'HOCH', 'richtlinie': 'HOCH', mdm: 'HOCH', aufgabe: 'HOCH', treiber: 'HOCH', lan: 'HOCH' }
  const sbAus = t.standbyNetz?.ac === 0 || t.standbyNetz?.richtlinieAc === 0
  const wirkU: Record<UmfeldKat, string> = {
    'standby-aufwachen': `Direkt vor den Trennungen wacht der PC aus dem (Modern) Standby auf. Beim Aufwachen baut Windows das WLAN neu auf — hängt das, bleibt der PC getrennt.${sbAus ? ' „Netzwerkverbindung im Standbymodus“ steht hier auf „Deaktivieren“, das WLAN ist im Standby also aus.' : ''} Abhilfe: Richtlinie „Netzwerkkonnektivität während des verbundenen Standbys zulassen (Netzbetrieb)“ aktivieren bzw. powercfg CONNECTIVITYINSTANDBY auf „Aktivieren“.`,
    'standby-einschlafen': 'Kurz vor den Trennungen geht der PC in den Standby — dann ist die Trennung normal. Auffällig ist nur, wenn danach nicht automatisch neu verbunden wird.',
    'richtlinie': 'Genau zur Trennungszeit wird eine Gruppenrichtlinie angewendet. Wird dabei das WLAN-Profil neu geschrieben, trennt Windows. Richtlinie (WLAN-Profil, 802.1X) mit der Domänen-Administration prüfen; 802.1X besser auf Computer-Authentifizierung.',
    'wlan-richtlinie': 'Genau zur Trennungszeit wird die WLAN-Gruppenrichtlinie (Drahtlos-Erweiterung) angewendet — sie schreibt das Profil neu, Windows trennt. Richtlinie prüfen: Profil nur bei Änderungen verteilen, 802.1X auf Computer-Authentifizierung.',
    'mdm': 'Zur Trennungszeit synchronisiert Intune/MDM. Eine Wi-Fi-Konfiguration, die bei jeder Synchronisierung neu geschrieben wird, trennt das WLAN. Intune-Profil prüfen.',
    'aufgabe': 'Laut Aufgabenverlauf startet zur Trennungszeit eine geplante Aufgabe. Prüfen, was sie tut.',
    'treiber': 'Zur Trennungszeit wird der Netzwerkadapter neu initialisiert oder ein Treiber (neu) geladen — z. B. durch einen Updater oder eine Energiesparfunktion.',
    'installation': 'Zur Trennungszeit läuft eine Installation oder ein Update — manche Pakete starten dabei Netzwerk-Komponenten neu.',
    'lan': 'Gleichzeitig ändert sich die LAN-Verbindung. Windows trennt das WLAN, wenn ein Kabel verbunden wird (Richtlinie „Verbindungen minimieren“, BIOS „LAN/WLAN Auto Switching“) — ein wackliger oder inaktiver Port erzeugt so ständige Umschaltungen.',
    'dienst': 'Zur Trennungszeit startet oder stoppt ein Netzwerk-Dienst (z. B. VPN-/NAC-Client, WLAN-Dienst).',
    'verbindungsmanager': 'Der Windows-Verbindungs-Manager (WcmSvc) hat zur Trennungszeit eingegriffen — typischerweise wegen „Verbindungen minimieren“ (LAN vorhanden) oder einer Richtlinie.',
  }
  // „Netzwerk im Standby" lässt sich am PC einschalten — außer eine Richtlinie legt es fest
  const sbPerRichtlinie = t.standbyNetz?.richtlinieAc != null
  const sbFixbar = !!d.powercfg?.modernStandby && t.standbyNetz?.ac !== 1 && !sbPerRichtlinie
  for (const u of a.umfeld) {
    const mitSbFix = u.kat === 'standby-aufwachen' && sbFixbar
    out.push(bef({ id: `umfeld-${u.kat}`, titel: `Zeitgleich: ${u.label}`, gewicht: gewU[u.kat] ?? 'MITTEL',
      ist: `bei ${u.anzahl} von ${u.fenster} untersuchten Trennungen kurz davor · ${u.belege.map(b => `${zeitKurz(ms(b.zeit))} (${offsetText(b.offsetSek)}) ${b.text}`).join(' | ')}`,
      soll: mitSbFix ? 'Netzwerk im Standby (Netzbetrieb): Aktivieren' : '—', wirkung: wirkU[u.kat], fundort: 'Ereignisprotokolle −5 … +2 min um die Trennung',
      kategorie: mitSbFix ? 'powercfg-wifi' : 'ursache', fixbar: mitSbFix, fix: mitSbFix ? { art: 'standby-netz' } : undefined,
      hinweis: u.kat === 'standby-aufwachen' && sbPerRichtlinie ? 'Per Gruppenrichtlinie festgelegt — nur über die Richtlinie änderbar.' : undefined }))
  }
  // 6) Geplante Aufgaben — fremde einzeln (abschaltbar, Rückgängig), Windows-Aufgaben gesammelt
  const verlaufHinweis = t.taskLogAktiv ? '' : ' (Der Aufgabenverlauf ist auf dem PC aus — ausgewertet wurden Startzeit und letzter Lauf.)'
  for (const x of a.aufgaben.filter(y => !y.microsoft).slice(0, 3)) {
    const voll = `${x.aufgabe.pfad}${x.aufgabe.name}`
    out.push(bef({ id: `aufgabe-${voll.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`, titel: `Geplante Aufgabe zur Trennungszeit: ${voll}`, gewicht: 'HOCH', standardAus: true,
      ist: `${x.warum}${x.aufgabe.aktion ? ` · Aktion: ${x.aufgabe.aktion}` : ''}${x.aufgabe.autor ? ` · Autor: ${x.aufgabe.autor}` : ''}`, soll: 'zum Test deaktivieren',
      wirkung: `Diese Aufgabe läuft genau dann, wenn das WLAN getrennt wird. Prüfen, was die Aktion tut — Softwareverteilung, VPN-/NAC-Client, HP-Tools oder Skripte mit „netsh wlan disconnect“ sind typische Auslöser. Zum Test lässt sie sich hier deaktivieren: bleibt die Trennung am nächsten Tag aus, ist der Auslöser gefunden.${verlaufHinweis}`,
      fundort: `Aufgabenplanung → ${voll}`, kategorie: 'aufgabe', fixbar: true, fix: { art: 'aufgabe-aus', aufgabePfad: x.aufgabe.pfad, aufgabeName: x.aufgabe.name },
      hinweis: 'Gehört die Aufgabe zu einer Firmen-Software (Softwareverteilung, Sicherheit), vorher mit DXC abstimmen. „Rückgängig“ schaltet sie wieder ein.' }))
  }
  const msAuf = a.aufgaben.filter(y => y.microsoft)
  if (msAuf.length) {
    out.push(bef({ id: 'aufgabe-windows', titel: `Windows-Aufgaben zur Trennungszeit (${msAuf.length})`, gewicht: 'INFO',
      ist: msAuf.slice(0, 4).map(x => `${x.aufgabe.pfad}${x.aufgabe.name}: ${x.warum}`).join(' | '), soll: '—',
      wirkung: `Aufgaben von Windows selbst — selten die Ursache, aber zur Einordnung nützlich.${verlaufHinweis}`,
      fundort: 'Aufgabenplanung (Trigger, letzter Lauf)', kategorie: 'info', fixbar: false }))
  }
  // 7) Profil
  const p = a.profil
  if (p && r.length) {
    if (p.modus && /manuell|manual/i.test(p.modus)) {
      const gpo = /gruppenrichtlinie/i.test(p.quelle || '')
      out.push(bef({ id: 'profil-manuell', titel: `WLAN-Profil „${p.name}“ verbindet nicht automatisch`, gewicht: 'HOCH', ist: p.modus, soll: 'Automatisch verbinden',
        wirkung: 'Das Profil ist auf „Manuell verbinden“ gestellt — nach jeder Trennung muss der Benutzer selbst neu verbinden.', fundort: `netsh wlan show profiles name="${p.name}"`,
        kategorie: gpo ? 'ursache' : 'netadv', fixbar: !gpo, fix: gpo ? undefined : { art: 'profil-auto', profil: p.name },
        hinweis: gpo ? 'Profil kommt per Gruppenrichtlinie (schreibgeschützt) — Verbindungsmodus in der WLAN-Richtlinie ändern.' : undefined }))
    }
    if (p.authMode && /^user$/i.test(p.authMode)) {
      out.push(bef({ id: 'profil-8021x-user', titel: '802.1X mit reiner Benutzeranmeldung', gewicht: 'MITTEL', ist: `authMode = ${p.authMode}${p.quelle ? ` · ${p.quelle}` : ''}`, soll: 'machine oder machineOrUser',
        wirkung: 'Das WLAN meldet sich nur mit dem Benutzerkonto an. Nach einer Trennung (oder vor der Anmeldung) fehlt dann die Anmeldung, und Windows wartet auf den Benutzer. Mit Computer- bzw. Computer-oder-Benutzer-Authentifizierung verbindet der PC selbstständig — das wird in der WLAN-Richtlinie eingestellt.',
        fundort: 'WLAN-Profil (XML) → OneX authMode', kategorie: 'netzwerk', fixbar: false }))
    }
  }
  // 8) Richtlinien / BIOS / Standby
  const lanVorh = !!d.lan
  const umfeldLan = a.umfeld.some(u => u.kat === 'lan' || u.kat === 'verbindungsmanager')
  const minimize = t.wcm?.minimize
  if (minimize != null && minimize > 0 && lanVorh) {
    out.push(bef({ id: 'wcm-minimize', titel: 'Richtlinie „Gleichzeitige Verbindungen minimieren“ aktiv', gewicht: umfeldLan ? 'HOCH' : 'INFO', ist: `fMinimizeConnections = ${minimize}`, soll: '—',
      wirkung: 'Windows trennt das WLAN, sobald ein LAN-Kabel verbunden ist. Steckt ein Kabel an einem wackligen oder inaktiven Port, wechselt der PC ständig zwischen LAN und WLAN.', fundort: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WcmSvc\\GroupPolicy', kategorie: 'ursache', fixbar: false }))
  }
  const sw = (t.bios || []).find(x => /lan.*wlan|wlan.*lan|auto.?switch/i.test(x.name))
  if (sw && /enable|aktiv|^on$/i.test(sw.wert) && lanVorh) {
    out.push(bef({ id: 'bios-lan-wlan', titel: 'BIOS: LAN/WLAN-Umschaltung aktiv', gewicht: umfeldLan ? 'HOCH' : 'MITTEL', ist: `${sw.name} = ${sw.wert}`, soll: 'nur wenn gewollt',
      wirkung: 'Das BIOS schaltet das WLAN ab, sobald am LAN-Port ein Link anliegt. Bei einem Kabel an einem inaktiven/wackligen Port kommt es so zu Trennungen. Kabel entfernen oder Port sauber patchen — oder die Option im BIOS abschalten.', fundort: 'HP BIOS (root\\HP\\InstrumentedBIOS)', kategorie: 'ursache', fixbar: false }))
  }
  if (d.powercfg?.modernStandby && sbAus && !a.umfeld.some(u => u.kat === 'standby-aufwachen')) {
    out.push(bef({ id: 'standby-netz-aus', titel: 'Kein Netzwerk im Standby', gewicht: 'INFO', standardAus: true, ist: `Netzbetrieb: ${t.standbyNetz?.ac ?? '—'} · Akku: ${t.standbyNetz?.dc ?? '—'} (0 = Deaktivieren)`, soll: '1 = Aktivieren (Netzbetrieb)',
      wirkung: 'Im Modern Standby ist das WLAN aus. Beim Aufwachen wird neu verbunden — klappt das nicht zuverlässig, „Netzwerkverbindung im Standbymodus“ für den Netzbetrieb aktivieren.', fundort: 'powercfg /qh SUB_NONE CONNECTIVITYINSTANDBY',
      kategorie: sbFixbar ? 'powercfg-wifi' : 'info', fixbar: sbFixbar, fix: sbFixbar ? { art: 'standby-netz' } : undefined,
      hinweis: sbPerRichtlinie ? 'Per Gruppenrichtlinie festgelegt — nur über die Richtlinie änderbar.' : undefined }))
  }
  // 9) Netzwerk-Software
  if (t.software?.length) {
    const verdacht = !!a.muster || a.kats[0]?.kat === 'benutzer'
    out.push(bef({ id: 'netz-software', titel: `Software, die Verbindungen steuern kann (${t.software.length})`, gewicht: verdacht ? 'MITTEL' : 'INFO',
      ist: t.software.map(s => `${s.name}${s.version ? ' ' + s.version : ''}${s.datum ? ` (seit ${s.datum})` : ''}`).join(' · '), soll: '—',
      wirkung: 'VPN-/Netzzugangs-Clients (z. B. Cisco Secure Client mit Network Access Manager), Verbindungs-Optimierer (z. B. HP Connection Optimizer) und Hersteller-Tools können WLAN-Verbindungen selbst trennen und wechseln. Ist eine davon neu oder läuft sie zur Trennungszeit, ist sie ein heißer Kandidat.',
      fundort: 'Installierte Programme', kategorie: 'ursache', fixbar: false }))
  }
  // 10) netsh blockiert
  if (t.netshBlockiert) {
    out.push(bef({ id: 'netsh-standort', titel: 'Live-WLAN-Daten nicht lesbar (Standortdienste aus)', gewicht: 'INFO', ist: 'netsh wlan show interfaces verweigert', soll: '—',
      wirkung: 'Seit Windows 11 24H2 brauchen WLAN-Abfragen die Standortberechtigung. Ohne sie bleiben aktueller Access Point und Signal leer — die übrigen Daten sind davon nicht betroffen.', fundort: 'netsh wlan show interfaces', kategorie: 'info', fixbar: false }))
  }
  // 11) Treiber-Alter (Intel hat eine eigene Regel)
  const dd = ms(d.adapter?.driverDate), scan = ms(lauf.ranAt)
  if (!isNaN(dd) && !isNaN(scan) && scan - dd > 365 * TAG && !/intel/i.test(d.adapter?.ifDesc || '')) {
    out.push(bef({ id: 'treiber-alter', titel: 'WLAN-Treiber älter als ein Jahr', gewicht: 'GERING', ist: `${d.adapter?.driverVersion} vom ${d.adapter?.driverDate}`, soll: 'aktueller Hersteller-Treiber',
      wirkung: 'Neuere Treiber enthalten oft Fehlerbehebungen für Trennungen an Enterprise-Access-Points. Über „Treiber-Installation“ (HP SoftPaq) aktualisieren — erklärt aber keine Trennung zur festen Uhrzeit.', fundort: `Get-NetAdapter → DriverDate (${d.adapter?.ifDesc})`, kategorie: 'treiber', fixbar: false,
      hinweis: 'Update läuft über „Treiber-Installation“, nicht über diese Kachel.' }))
  }
  return out
}

// ── Klartext-Diagnose ────────────────────────────────────────────────────────
export interface Diagnose { titel: string; punkte: string[]; schritte: string[] }

export function diagnose(lauf: NetLauf, a: UrsachenAuswertung | null = werteAus(lauf)): Diagnose | null {
  if (!a) return null
  const d = lauf.daten, t = d.tiefe!
  const r = relevante(a.det)
  if (!r.length) return null
  const punkte: string[] = [], schritte: string[] = []
  const top = a.kats[0]
  let titel: string
  if (a.muster) titel = `Kein Funkproblem: Etwas trennt das WLAN gezielt jeden Tag um ≈ ${a.muster.uhr} Uhr.`
  else if (top?.kat === 'benutzer' || top?.kat === 'profil') titel = `Das WLAN wird bewusst getrennt (${GRUND_TEXT[top.kat]}).`
  else if (top?.kat === 'nichtVerfuegbar') titel = 'Das Netz ist zeitweise nicht erreichbar — eher Access Point oder Funk.'
  else if (top?.kat === 'treiber') titel = 'Der Treiber trennt die Verbindung — Adapter, Treiber und Energie prüfen.'
  else titel = `${r.length} Trennung${r.length === 1 ? '' : 'en'} in 14 Tagen — Ursache noch nicht eindeutig.`

  if (a.muster) punkte.push(`${a.muster.treffer} von ${a.muster.gesamt} Trennungen zwischen ${a.muster.von} und ${a.muster.bis} Uhr, an ${a.muster.tage} Tagen (${a.muster.wochentage}).`)
  if (a.start) punkte.push(`Erst seit ${datumKurz(a.start.erste)} — davor ${a.start.ruhigeTage} Tage ohne Trennung.`)
  if (top) punkte.push(`Gemeldeter Grund: ${a.kats.map(k => `${k.anzahl}× „${GRUND_TEXT[k.kat]}“`).join(', ')}.`)
  if (a.ohneAutoNeu.anzahl > 0) punkte.push(`Danach ${a.ohneAutoNeu.anzahl} von ${a.ohneAutoNeu.von}× nicht automatisch neu verbunden${a.ohneAutoNeu.schnittMin != null ? ` (Ø nach ${a.ohneAutoNeu.schnittMin} min, von Hand)` : ''}.`)
  for (const u of a.umfeld.slice(0, 3)) punkte.push(`Zeitgleich bei ${u.anzahl} von ${u.fenster}: ${u.label}.`)
  if (a.aufgaben.length) punkte.push(`Aufgabe zur Trennungszeit: ${a.aufgaben.slice(0, 2).map(x => `${x.aufgabe.pfad}${x.aufgabe.name} (${x.warum})`).join('; ')}.`)
  if (a.profil) punkte.push(`Profil „${a.profil.name}“${a.profil.quelle ? ` (${a.profil.quelle})` : ''}${a.profil.modus ? ` · ${a.profil.modus}` : ''}${a.profil.authMode ? ` · 802.1X ${a.profil.authMode}` : ''}.`)

  // Nächste Schritte — die stärksten Spuren zuerst
  const fremd = a.aufgaben.filter(x => !x.microsoft)
  if (fremd.length) schritte.push(`Aufgabe „${fremd[0].aufgabe.pfad}${fremd[0].aufgabe.name}“ prüfen${fremd[0].aufgabe.aktion ? ` (Aktion: ${fremd[0].aufgabe.aktion})` : ''} — zum Test unten deaktivieren; bleibt die Trennung aus, ist der Auslöser gefunden. Firmen-Software vorher mit DXC abstimmen.`)
  if (a.umfeld.some(u => u.kat === 'wlan-richtlinie' || u.kat === 'richtlinie' || u.kat === 'mdm') || top?.kat === 'profil') schritte.push('WLAN-Profil-Verteilung (Gruppenrichtlinie/Intune) prüfen: Profil nicht täglich neu schreiben, 802.1X auf Computer-Authentifizierung.')
  if (a.umfeld.some(u => u.kat === 'standby-aufwachen')) schritte.push(d.powercfg?.modernStandby && t.standbyNetz?.ac !== 1 && t.standbyNetz?.richtlinieAc == null
    ? 'Standby: „Netzwerkverbindung im Standbymodus“ (Netzbetrieb) aktivieren — unten per Häkchen.'
    : 'Standby: Richtlinie „Netzwerkkonnektivität während des verbundenen Standbys zulassen (Netzbetrieb)“ aktivieren.')
  if (a.profil?.modus && /manuell|manual/i.test(a.profil.modus)) schritte.push(/gruppenrichtlinie/i.test(a.profil.quelle || '') ? `Profil „${a.profil.name}“ kommt per Richtlinie — dort auf „automatisch verbinden“ stellen.` : `Profil „${a.profil.name}“ auf „automatisch verbinden“ stellen — unten per Häkchen.`)
  if (a.umfeld.some(u => u.kat === 'lan' || u.kat === 'verbindungsmanager')) schritte.push('LAN/WLAN-Umschaltung: Kabel abziehen oder Port sauber patchen, BIOS „LAN/WLAN Auto Switching“ und „Verbindungen minimieren“ prüfen.')
  if (a.umfeld.some(u => u.kat === 'treiber') || top?.kat === 'treiber') schritte.push('Treiber aktualisieren (Menü „Treiber-Installation“) und den Updater suchen, der den Adapter neu lädt.')
  if (top?.kat === 'benutzer' && !fremd.length) schritte.push('Wer trennt? VPN-/NAC-Client und Verbindungs-Tools prüfen (siehe Software-Befund); ggf. kurz vor der Uhrzeit am PC zusehen.')
  if (a.muster && !t.taskLogAktiv) schritte.push('Für einen eindeutigen Nachweis den Verlauf der Aufgabenplanung aktivieren und am nächsten Tag direkt nach der Trennung erneut scannen.')
  else if (a.muster) schritte.push('Am nächsten Tag direkt nach der Trennung erneut scannen — dann sind die Spuren frisch.')
  if (d.lan && !d.aktiv?.lan && /desktop|mini|tower|sff|workstation/i.test(d.system?.modell || '')) schritte.push('Am Platz ein LAN-Kabel nutzen, falls eine Dose da ist — bei einem Desktop die robusteste Lösung.')
  if (a.ohneAutoNeu.anzahl >= 2 && a.profil?.name) schritte.push(`Bis die Ursache behoben ist: Notlösung „automatisch neu verbinden“ (unten auswählbar).`)
  return { titel, punkte, schritte: [...new Set(schritte)] }
}

// ── Zeitleiste (Anzeige) ─────────────────────────────────────────────────────
export interface ZeitleisteEintrag { zeit: string; offsetSek: number; log: string; quelle: string; id: number; text: string; kat: UmfeldKat | null; istTrennung: boolean }
export function zeitleiste(t: NetTiefe | undefined, index = 0): { trennung: string; eintraege: ZeitleisteEintrag[] } | null {
  const f = t?.umfeld?.[index]
  if (!f) return null
  const tt = ms(f.trennung)
  const eintraege = (f.ereignisse || [])
    .map(e => ({ zeit: e.zeit, offsetSek: Math.round((ms(e.zeit) - tt) / 1000), log: e.log, quelle: (e.quelle || '').replace(/^Microsoft-Windows-/, ''), id: e.id, text: e.extra ? `${e.text} — ${e.extra}` : e.text, kat: umfeldKategorie(e), istTrennung: e.log === 'WLAN' && e.id === 8003 }))
    .filter(e => !isNaN(e.offsetSek))
    .sort((a, b) => a.offsetSek - b.offsetSek)
  return { trennung: f.trennung, eintraege }
}
