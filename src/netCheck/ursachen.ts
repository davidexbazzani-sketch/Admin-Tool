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
export type GrundKat = 'benutzer' | 'neueVerbindung' | 'treiber' | 'profil' | 'energie' | 'funk' | 'nichtVerfuegbar' | 'sicherheit' | 'adapter' | 'sonst' | 'unbekannt'
export const GRUND_TEXT: Record<GrundKat, string> = {
  benutzer: 'vom Benutzer bzw. einem Programm getrennt',
  neueVerbindung: 'Benutzer wollte ein anderes Netz',
  treiber: 'vom Treiber getrennt',
  profil: 'WLAN-Profil geändert oder gelöscht',
  energie: 'Energie / Standby',
  funk: 'Funk ausgeschaltet',
  nichtVerfuegbar: 'Netz nicht mehr verfügbar',
  sicherheit: 'Sicherheit / Anmeldung',
  adapter: 'Adapter kurz zurückgesetzt (Betriebszustand geändert)',
  sonst: 'sonstiger Grund',
  unbekannt: 'kein Grund protokolliert',
}
/** Reason-Text (deutsch/englisch) → Kategorie. */
export function grundKategorie(grund?: string): GrundKat {
  const g = (grund || '').toLowerCase()
  if (!g.trim()) return 'unbekannt'
  if (/neue verbindung|new connection/.test(g)) return 'neueVerbindung'
  // Code 11: Windows selbst setzt die Schnittstelle zurück (z. B. neue zufällige Hardwareadresse, Adapter-Neustart)
  if (/vorgangsstatus|betriebsstatus|operational state|operation state/.test(g)) return 'adapter'
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
  if (/Service Control Manager/i.test(q)) return e.id === 7040 || /Background Intelligent|\bBITS\b|Intelligenter Hintergrund|Windows Update|Übermittlungsoptimierung|Delivery Optimization/i.test(txt) ? null : 'dienst'
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
/** Windows-eigene Aufgaben: alles unter \Microsoft\ und die pro Benutzer angelegten „SoftLanding“-Aufgaben
 *  (\SoftLanding\<SID>\SoftLandingCreativeManagementTask – Windows-Tipps/Hinweise; als WLAN-Auslöser praktisch
 *  ausgeschlossen und von SYSTEM oft nicht abschaltbar). */
const istMicrosoft = (a: AufgabeInfo) => /^\\(Microsoft|SoftLanding)\\/i.test(a.pfad || '')
const istWindowsTipps = (a: AufgabeInfo) => /^\\SoftLanding\\/i.test(a.pfad || '')
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
  // Trennungen beim Ein-/Aufwachen aus dem Standby zählen hier nicht: Der PC schläft dann, die
  // „Zeit bis zur Neuverbindung" wäre nur die Schlafdauer und kein Zeichen für ein Problem.
  const mitNeu = r.filter(x => imStandby(x, t) !== 'ein').filter(x => x.neu || Date.parse(lauf.ranAt) - x.t > 15 * MIN)
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
      wirkung: 'Ein Funkloch oder ein Access-Point-Problem kommt nicht jeden Tag zur gleichen Minute. Fast immer löst dann etwas Zeitgesteuertes die Trennung aus: eine geplante Aufgabe, eine Softwareverteilung (Intune), eine Gruppenrichtlinie, ein VPN- oder Netzzugangs-Client — oder das Aufwachen aus dem Standby, wenn der PC morgens benutzt wird.',
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
  // Windows-Tipps (\SoftLanding\<SID>\…): kein WLAN-Auslöser, aber auf Wunsch abschaltbar (gehört dem Benutzer → Tool schaltet notfalls als SYSTEM)
  const tipps = a.aufgaben.filter(y => istWindowsTipps(y.aufgabe))
  for (const x of tipps.slice(0, 3)) {
    const voll = `${x.aufgabe.pfad}${x.aufgabe.name}`
    out.push(bef({ id: `aufgabe-${voll.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`, titel: `Windows-Tipps-Aufgabe zur Trennungszeit: ${x.aufgabe.name}`, gewicht: 'GERING', standardAus: true,
      ist: x.warum, soll: 'optional deaktivieren',
      wirkung: `Windows-eigene Aufgabe für Tipps und Hinweise („SoftLanding“) des Benutzers — als WLAN-Auslöser praktisch ausgeschlossen. Abschalten ist harmlos (es fehlen danach nur Windows-Tipps) und schließt sie beim Test sicher aus.${verlaufHinweis}`,
      fundort: `Aufgabenplanung → ${voll}`, kategorie: 'aufgabe', fixbar: true, fix: { art: 'aufgabe-aus', aufgabePfad: x.aufgabe.pfad, aufgabeName: x.aufgabe.name },
      hinweis: 'Die Aufgabe gehört dem Benutzer; Administratoren dürfen sie nur lesen — das Tool schaltet sie deshalb kurz als SYSTEM um. „Rückgängig“ schaltet sie wieder ein.' }))
  }
  const msAuf = a.aufgaben.filter(y => y.microsoft && !istWindowsTipps(y.aufgabe))
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
  return mitLoesungen(lauf, a, out)
}

// ── Lösung zu JEDER Ursache ──────────────────────────────────────────────────
// Jede Ursache bekommt einen Lösungstext. Wo sich etwas am PC einstellen lässt, kommt ein
// eigener, anwählbarer Befund „Lösung: …" dazu (mit Rückgängig). Was nur außerhalb des PCs
// änderbar ist (Gruppenrichtlinie, Intune, Access Point, RADIUS, BIOS, Kabel), nennt klar,
// wer es wo ändert — das kann das Tool nicht per Knopfdruck.

const alle0 = (a: NetBefund[], b: NetBefund[]) => [...a, ...b]
const unten0 = (alle: NetBefund[], rx: RegExp) => { const f = alle.filter(b => b.fixbar && b.fix && rx.test(b.id)).map(b => `„${b.titel.replace(/^Lösung: /, '')}“`); return f.length ? `Im Tool behebbar – unten anhaken: ${f.join(' und ')}.` : 'Am Adapter ist sonst nichts falsch eingestellt.' }
const advWert = (lauf: NetLauf, rx: RegExp) => (lauf.daten?.advanced || []).find(p => rx.test(p.name || '') || rx.test(p.keyword || ''))

function mitLoesungen(lauf: NetLauf, a: UrsachenAuswertung, out: NetBefund[]): NetBefund[] {
  const d = lauf.daten, t = d.tiefe!
  const hat = (id: string) => out.some(b => b.id === id)
  const r = relevante(a.det)
  const standby = r.filter(x => imStandby(x, t)).length   // Einschlafen UND Aufwachen: beides betrifft dieselbe Einstellung
  const standbyDominant = r.length > 0 && standby >= Math.ceil(r.length * 0.5)
  const standbyThema = standby > 0 || a.umfeld.some(u => u.kat === 'standby-aufwachen' || u.kat === 'standby-einschlafen') || a.kats[0]?.kat === 'energie'
  const neu: NetBefund[] = []

  // L1) WLAN im Standby verbunden lassen — Netz- UND Akkubetrieb
  const sb = t.standbyNetz
  const acOffen = sb?.ac !== 1 && sb?.richtlinieAc == null
  const dcOffen = sb?.dc !== 1 && sb?.richtlinieDc == null
  const sbMoeglich = !!d.powercfg?.modernStandby && (acOffen || dcOffen)
  if (standbyThema && sbMoeglich && !out.some(b => b.fix?.art === 'standby-netz')) {
    neu.push(bef({ id: 'loesung-standby-netz', titel: 'Lösung: WLAN im Standby verbunden lassen (Netz- und Akkubetrieb)', gewicht: standbyDominant ? 'HOCH' : 'MITTEL', standardAus: !standbyDominant,
      ist: `Netzbetrieb: ${sbText(sb?.ac)} · Akku: ${sbText(sb?.dc)}`, soll: 'Aktivieren / Aktivieren',
      wirkung: 'Bisher darf Windows das WLAN im Standby selbst trennen („Von Windows verwaltet“ bzw. „Deaktivieren“). Beim Aufwachen muss die Verbindung dann jedes Mal neu aufgebaut und neu angemeldet werden (802.1X) — das ist der Moment, in dem es hakt. Mit „Aktivieren“ bleibt das WLAN im Standby verbunden.',
      fundort: 'powercfg → Netzwerkverbindung im Standbymodus (CONNECTIVITYINSTANDBY)', kategorie: 'powercfg-wifi', fixbar: true, fix: { art: 'standby-netz', akku: dcOffen },
      erklaerung: { wirkung: 'Der PC trennt das WLAN beim Einschlafen und baut es beim Aufwachen neu auf.', aenderung: `„Netzwerkverbindung im Standbymodus“ wird ${acOffen && dcOffen ? 'für Netz- und Akkubetrieb' : dcOffen ? 'für den Akkubetrieb' : 'für den Netzbetrieb'} auf „Aktivieren“ gestellt.`, vorteil: 'Nach dem Aufklappen ist das WLAN sofort da; keine Trennung mehr beim Ein- und Aufwachen.', nachteil: 'Im Standby verbraucht der PC etwas mehr Akku, weil das WLAN an bleibt.', wannNicht: 'Wenn das Notebook oft tagelang ohne Netzteil im Standby liegt und die Akkulaufzeit wichtiger ist.' },
      loesung: 'Unten anhaken und anwenden – lässt sich mit „Änderungen rückgängig“ zurücknehmen.' }))
  }
  // L2) Nach Trennung/Aufwachen automatisch neu verbinden (falls noch nicht angeboten)
  const nachAufwachen = r.some(x => imStandby(x, t) === 'auf' && (!x.neu || x.neu.manuell || x.neu.nachSek > 120))
  if (!hat('reconnect-task') && a.profil?.name && r.length >= 2 && (a.ohneAutoNeu.anzahl >= 1 || nachAufwachen)) {
    neu.push(bef({ id: 'reconnect-task', titel: `Lösung: „${a.profil.name}“ nach Trennung und nach dem Aufwachen automatisch neu verbinden`, gewicht: 'MITTEL', standardAus: true,
      ist: 'keine automatische Neuverbindung', soll: 'neu verbinden: 20 s nach einer Trennung, 15 s nach dem Aufwachen',
      wirkung: 'Legt auf dem PC eine geplante Aufgabe an: Meldet Windows eine Trennung dieses Profils oder wacht der PC aus dem Standby auf, wird kurz danach neu verbunden — für den angemeldeten Benutzer. Übersprungen wird, wenn schon eine WLAN-Verbindung steht, ein LAN-Kabel verbunden ist oder der Benutzer selbst ein anderes Netz gewählt hat.',
      fundort: 'Aufgabenplanung → „ITAdminTool WLAN-Neuverbindung“', kategorie: 'aufgabe', fixbar: true, fix: { art: 'reconnect-task', profil: a.profil.name, beiAufwachen: true },
      hinweis: 'Fängt die Folgen ab, nicht die Ursache. „Rückgängig“ entfernt die Aufgabe wieder.',
      loesung: 'Unten anhaken und anwenden.' }))
  }
  for (const b of out) if (b.id === 'reconnect-task' && b.fix) { b.fix.beiAufwachen = true; b.loesung = 'Unten anhaken und anwenden.' }
  // L3) Treiber trennt: Energiesparen der Antennen abschalten (falls der Adapter die Einstellung hat)
  const treiberThema = a.kats[0]?.kat === 'treiber' || a.umfeld.some(u => u.kat === 'treiber')
  const mimo = advWert(lauf, /mimo.*(power|energie|strom)|MIMOPowerSaveMode/i)
  if (treiberThema && mimo && !/no smps|kein smps|^3$/i.test(`${mimo.value} ${mimo.regValue}`)) {
    neu.push(bef({ id: 'loesung-mimo', titel: 'Lösung: Antennen-Energiesparen des WLAN-Adapters abschalten (MIMO)', gewicht: 'MITTEL', standardAus: true,
      ist: mimo.value || mimo.regValue || '—', soll: 'Kein SMPS',
      wirkung: 'Im Energiesparmodus schaltet der Adapter Antennen ab und muss sie bei Datenverkehr wieder zuschalten. An manchen Access Points führt genau das zu Trennungen durch den Treiber.',
      fundort: `Adapter-Advanced → ${mimo.name} (${mimo.keyword})`, kategorie: 'netadv', fixbar: true, fix: { art: 'advanced', keyword: mimo.keyword, displayName: mimo.name, zielRegValue: '3', zielDisplay: 'No SMPS' },
      loesung: 'Unten anhaken und anwenden (wirkt nach dem nächsten Neuverbinden des WLANs).' }))
  }
  // L4) Netz nicht verfügbar: 5 GHz bevorzugen (stabiler, weniger Störungen)
  const band = advWert(lauf, /preferred band|bevorzugtes band|RoamingPreferredBandType/i)
  if (a.kats[0]?.kat === 'nichtVerfuegbar' && band && !/5\s*ghz|^2$/i.test(`${band.value} ${band.regValue}`)) {
    neu.push(bef({ id: 'loesung-band', titel: 'Lösung: 5-GHz-Band bevorzugen', gewicht: 'MITTEL', standardAus: true, ist: band.value || band.regValue || '—', soll: '5 GHz bevorzugen',
      wirkung: 'Im 2,4-GHz-Band stören sich viele Geräte gegenseitig; die Verbindung reißt dort eher ab. Mit „5 GHz bevorzugen“ wählt der Adapter das stabilere Band, wenn es verfügbar ist.',
      fundort: `Adapter-Advanced → ${band.name} (${band.keyword})`, kategorie: 'netadv', fixbar: true, fix: { art: 'advanced', keyword: band.keyword, displayName: band.name, zielRegValue: '2', zielDisplay: 'Prefer 5GHz band' },
      loesung: 'Unten anhaken und anwenden.' }))
  }

  // L5) 24-Stunden-Takt: zufällige Hardwareadresse (täglich neu) oder Sitzungsdauer des WLANs
  const takt = tagesTakt(a.det)
  const p = a.profil
  const gpoProfil = /gruppenrichtlinie/i.test(p?.quelle || '')
  const macAn = macZufall(p)
  if (takt) {
    neu.push(bef({ id: 'takt-24h', titel: 'WLAN trennt sich im 24-Stunden-Takt', gewicht: 'HOCH',
      ist: `${takt.treffer} von ${takt.abstaende} Abständen zwischen den Trennungen sind fast genau 24 Stunden`, soll: 'keine Trennung nach festem Takt',
      wirkung: 'Die Trennungen wandern jeden Tag um ein, zwei Minuten weiter – das ist kein Wecker zu einer festen Uhrzeit, sondern ein Zähler, der nach 24 Stunden abläuft. Dafür gibt es zwei typische Ursachen: (1) Für das WLAN ist eine zufällige Hardwareadresse eingestellt, die Windows täglich wechselt – dafür setzt Windows den Adapter kurz zurück. (2) Der WLAN-Controller bzw. die Anmeldung (RADIUS) beendet jede Sitzung nach 24 Stunden und verlangt eine neue Anmeldung.',
      fundort: 'Abstände der Trennungen (Event 8003)', kategorie: 'ursache', fixbar: false,
      loesung: macAn && p && !gpoProfil ? `Im Tool behebbar – unten anhaken: „Feste Hardwareadresse für ${p.name}“.`
        : macAn ? 'Die zufällige Hardwareadresse ist im WLAN-Profil der Gruppenrichtlinie eingeschaltet – dort abschalten (Domänen-Administration).'
          : 'Am PC ist keine zufällige Hardwareadresse eingestellt. Dann beendet sehr wahrscheinlich das WLAN selbst die Sitzung nach 24 Stunden: Netzwerk-Team bitten, am WLAN-Controller bzw. RADIUS die Sitzungsdauer (Session-Timeout / Reauthentifizierung) für dieses WLAN zu prüfen. Das lässt sich am PC nicht ändern.' }))
  }
  if (macAn && p) {
    neu.push(bef({ id: 'zufalls-mac', titel: `Zufällige Hardwareadresse für „${p.name}“ eingeschaltet`, gewicht: takt ? 'HOCH' : 'MITTEL', standardAus: !takt,
      ist: p.zufallsMac || 'aktiviert', soll: 'Deaktiviert (feste Adresse)',
      wirkung: 'Mit zufälliger Hardwareadresse meldet sich der PC unter wechselnden Adressen am WLAN an. Bei „täglich ändern“ setzt Windows den Adapter einmal am Tag zurück und verbindet neu. In einem Firmen-WLAN mit 802.1X bringt die Zufallsadresse keinen Vorteil, stört aber DHCP-Reservierungen und die Zuordnung am Access Point.',
      fundort: `netsh wlan show profiles name="${p.name}" → MAC-Randomisierung`, kategorie: gpoProfil ? 'ursache' : 'netadv', fixbar: !gpoProfil, fix: gpoProfil ? undefined : { art: 'mac-fest', profil: p.name },
      hinweis: gpoProfil ? 'Profil kommt per Gruppenrichtlinie (schreibgeschützt).' : 'Beim Umstellen verbindet sich das WLAN einmal kurz neu.',
      loesung: gpoProfil ? 'In der WLAN-Richtlinie abschalten (Domänen-Administration).' : 'Unten anhaken und anwenden – „Rückgängig“ stellt die Zufallsadresse wieder ein.' }))
  }
  // L6) Windows setzt den Adapter zurück (Code 11), ohne 24-Stunden-Takt
  if (a.kats[0]?.kat === 'adapter') {
    neu.push(bef({ id: 'grund-adapter', titel: 'Windows setzt den WLAN-Adapter kurz zurück', gewicht: 'MITTEL',
      ist: a.kats.map(k => `${k.anzahl}× ${GRUND_TEXT[k.kat]}`).join(' · '), soll: 'kein Zurücksetzen',
      wirkung: 'Windows meldet „Änderungsanforderung des Vorgangsstatus“ (Code 11): Nicht der Access Point und nicht der Benutzer trennt, sondern der Adapter wird von Windows bzw. dem Treiber kurz ab- und wieder angeschaltet – etwa für eine neue Hardwareadresse, durch einen Treiber-Neustart oder eine Energiesparfunktion.',
      fundort: 'Event 8003 → Reason (Code 11)', kategorie: 'ursache', fixbar: false,
      loesung: takt ? 'Siehe „WLAN trennt sich im 24-Stunden-Takt“ – dort steht die Lösung.' : `Treiber prüfen (Kasten „Netzwerk-Treiber“ oben). ${unten0(alle0(out, neu), /^zufalls-mac$|^loesung-mimo$|^loesung-standby-netz$|^powermgmt-turnoff$/)}` }))
  }

  const alle = [...out, ...neu]
  const fixTitel = (rx: RegExp) => alle.filter(b => b.fixbar && b.fix && rx.test(b.id)).map(b => `„${b.titel.replace(/^Lösung: /, '')}“`)
  const unten = (rx: RegExp, sonst: string) => { const f = fixTitel(rx); return f.length ? `Im Tool behebbar – unten anhaken: ${f.join(' und ')}.` : sonst }
  const sbSonst = sb?.richtlinieAc != null || sb?.richtlinieDc != null
    ? 'Das WLAN im Standby ist per Gruppenrichtlinie festgelegt – dort „Netzwerkkonnektivität während des verbundenen Standbys zulassen“ für Netz- und Akkubetrieb aktivieren (Domänen-Administration).'
    : 'Das WLAN bleibt im Standby schon verbunden (Aktivieren). Dann ist diese Trennung kein Fehler; hakt es nach dem Aufwachen trotzdem, hilft die automatische Neuverbindung.'
  const LOESUNG: [RegExp, () => string][] = [
    [/^umfeld-standby-(aufwachen|einschlafen)$|^grund-energie$|^standby-netz-aus$/, () => unten(/^loesung-standby-netz$|^umfeld-standby-aufwachen$|^standby-netz-aus$|^reconnect-task$/, sbSonst)],
    [/^umfeld-treiber$|^grund-treiber$|^treiber-alter$|^treiber-alt$/, () => `Zuerst den Treiber: Im Kasten „Netzwerk-Treiber“ oben wird ein neuerer Treiber angeboten, sobald HP einen hat. ${unten(/^loesung-mimo$|^powercfg-wlan$|^powermgmt-turnoff$|^uapsd$|^roaming-aggressiv$|^loesung-standby-netz$/, 'Die Energie-Einstellungen des Adapters stehen hier schon richtig; bleibt es beim Treiber, hilft nur ein neuerer Treiber oder ein Tausch des WLAN-Moduls.')}`],
    [/^umfeld-verbindungsmanager$|^umfeld-lan$|^wcm-minimize$|^bios-lan-wlan$/, () => 'Am Platz prüfen: Steckt ein LAN-Kabel oder eine Dockingstation an einem wackligen oder toten Port, schaltet Windows ständig zwischen LAN und WLAN um – Kabel ziehen oder Port sauber patchen. Die Umschaltung selbst kommt aus der Richtlinie „Gleichzeitige Verbindungen minimieren“ bzw. der BIOS-Option „LAN/WLAN Auto Switching“; beides lässt sich nicht aus dem Tool ändern (Richtlinie: Domänen-Administration, BIOS: am Gerät).'],
    [/^umfeld-(wlan-)?richtlinie$|^umfeld-mdm$|^grund-profil$|^profil-8021x-user$/, () => 'Nicht am PC lösbar: Das WLAN-Profil wird von einer Gruppenrichtlinie bzw. Intune neu geschrieben. Dort einstellen: Profil nur bei Änderungen verteilen, 802.1X auf Computer-Authentifizierung (Domänen-Administration / DXC).'],
    [/^umfeld-aufgabe$|^aufgabe-/, () => unten(/^aufgabe-(?!windows)/, 'Die Aufgabe gehört zu Windows und ist selten der Auslöser – kein Handlungsbedarf.')],
    [/^umfeld-installation$/, () => 'Kein Dauerproblem: Während einer Installation oder eines Updates werden Netzwerk-Komponenten kurz neu gestartet. Tritt es nur zu diesen Zeiten auf, ist nichts zu tun.'],
    [/^umfeld-dienst$|^grund-benutzer$|^netz-software$/, () => `Ein Programm trennt das WLAN gezielt. Kandidaten stehen im Befund „Software, die Verbindungen steuern kann“ (VPN-/Netzzugangs-Client, Verbindungs-Optimierer) – dort die automatische Netzwerk-Umschaltung abschalten oder das Programm entfernen. ${unten(/^aufgabe-(?!windows)|^reconnect-task$/, '')}`.trim()],
    [/^grund-netz$|^bssid-cluster$/, () => `Die Ursache liegt beim Funk bzw. Access Point: Standort und Signal prüfen, den Access Point in der Standort-Übersicht ansehen (Neustarts, Auslastung). ${unten(/^loesung-band$|^roaming-aggressiv$/, '')}`.trim()],
    [/^grund-sicherheit$|^auth-8021x$/, () => 'Die Anmeldung am WLAN (802.1X) schlägt fehl: Computer-Zertifikat des PCs prüfen (abgelaufen?) und die RADIUS-/NPS-Seite ansehen – das lässt sich nicht aus dem Tool beheben (Domänen-Administration).'],
    [/^zeitmuster$|^beginn$/, () => 'Das ist ein Hinweis, keine eigene Ursache: Die Lösung steht bei der Ursache, die zur selben Zeit auftritt (siehe die Befunde „Zeitgleich: …“ und das Aussetzer-Protokoll oben).'],
    [/^kein-auto-neu$|^profil-manuell$/, () => unten(/^reconnect-task$|^profil-manuell$/, 'Verbindungsmodus des Profils in der WLAN-Richtlinie auf „automatisch verbinden“ stellen (Domänen-Administration).')],
  ]
  for (const b of alle) {
    if (b.loesung) continue
    const treffer = LOESUNG.find(([rx]) => rx.test(b.id))
    if (treffer) b.loesung = treffer[1]()
    else if (b.fixbar && b.fix) b.loesung = 'Im Tool behebbar – anhaken und anwenden.'
  }
  return alle
}

/** Trennt es im 24-Stunden-Takt? Zählt aufeinanderfolgende Abstände von 24 h ± 20 min. */
export function tagesTakt(det: TrennungDetail[]): { treffer: number; abstaende: number } | null {
  const r = relevante(det)
  const gezielt = r.filter(x => x.kat === 'benutzer' || x.kat === 'profil').length
  if (gezielt >= Math.ceil(r.length * 0.5)) return null
  const z = r.map(x => x.t).sort((a, b) => a - b)
  if (z.length < 4) return null
  let treffer = 0
  for (let i = 1; i < z.length; i++) if (Math.abs(z[i] - z[i - 1] - TAG) <= 20 * MIN) treffer++
  return treffer >= 3 ? { treffer, abstaende: z.length - 1 } : null
}
const macZufall = (p?: WlanProfil) => !!p?.zufallsMac && !/deaktiv|disabled|^aus$|^off$|nicht verf/i.test(p.zufallsMac)

const sbText = (v?: number | null) => (v == null ? '—' : (['Deaktivieren', 'Aktivieren', 'Von Windows verwaltet'][v] ?? String(v)))

// ── Aussetzer-Protokoll: Tag, Uhrzeit, wieso, Lösung — je Trennung ───────────
export type AussetzerArt = 'standby' | 'lan' | 'richtlinie' | 'aufgabe' | 'installation' | 'treiber' | 'dienst' | 'benutzer' | 'profil' | 'funk' | 'sicherheit' | 'anderesNetz' | 'unklar'

/** Umfeld-Fenster dieser Trennung (falls sie zu den untersuchten gehört). */
function fensterVon(x: { t: number }, t?: NetTiefe) {
  return (t?.umfeld || []).find(f => Math.abs(ms(f.trennung) - x.t) < 3000)
}
/**
 * Fällt die Trennung mit dem Standby zusammen?
 *   'ein' = der PC schlief ein bzw. war im Standby — Windows trennt dann selbst (kein Ausfall).
 *   'auf' = der PC war gerade aufgewacht — das ist ein echter Aussetzer (WLAN kommt nicht sauber wieder).
 * Meldet Windows „vom Benutzer/Programm getrennt", ein geändertes Profil oder die Anmeldung als
 * Grund, ist es NIE der normale Standby — dann trennt etwas gezielt.
 */
export function imStandby(x: TrennungDetail, t?: NetTiefe): 'ein' | 'auf' | null {
  if (x.kat === 'energie') return 'ein'
  const gezielt = x.kat === 'benutzer' || x.kat === 'profil' || x.kat === 'sicherheit' || x.kat === 'neueVerbindung'
  const f = fensterVon(x, t)
  if (!f) return null
  let ein = false, auf = false
  for (const e of f.ereignisse || []) {
    const k = umfeldKategorie(e), off = (ms(e.zeit) - x.t) / 1000
    if (k === 'standby-einschlafen' && off >= -300 && off <= 10) ein = true
    if (k === 'standby-aufwachen' && off >= -120 && off <= 120) auf = true
    // Kernel-Power 172: „Verbindungsstatus im Standbymodus: Disconnected" — Windows trennt selbst
    if (/Kernel-Power/i.test(e.quelle || '') && e.id === 172 && off >= -300 && off <= 30) ein = true
  }
  return ein && !gezielt ? 'ein' : auf || ein ? 'auf' : null
}

export interface AussetzerZeile {
  t: number
  /** „Mo 10.11." */
  tag: string
  /** „15:13" */
  uhr: string
  verbindung: 'WLAN' | 'LAN'
  art: AussetzerArt
  /** Warum — in einem Satz. */
  wieso: string
  /** Kein Ausfall während der Arbeit (Standby, bewusster Netzwechsel). */
  normal: boolean
  /** Wurde das Umfeld dieser Trennung untersucht? (nur die letzten 12) */
  untersucht: boolean
  wieder: string
  loesung: string
}

const UMFELD_RANG: UmfeldKat[] = ['lan', 'wlan-richtlinie', 'richtlinie', 'mdm', 'aufgabe', 'installation', 'treiber', 'verbindungsmanager', 'dienst']

export function aussetzerProtokoll(lauf: NetLauf, a: UrsachenAuswertung | null = werteAus(lauf), befunde: NetBefund[] = []): AussetzerZeile[] {
  const d = lauf.daten, t = d?.tiefe
  const zeilen: AussetzerZeile[] = []
  const tagUhr = (ts: number) => { const x = new Date(ts); return { tag: `${TAGNAME[x.getDay()]} ${z2(x.getDate())}.${z2(x.getMonth() + 1)}.`, uhr: `${z2(x.getHours())}:${z2(x.getMinutes())}` } }
  const fix = (rx: RegExp) => befunde.find(b => b.fixbar && b.fix && rx.test(b.id))
  const sbLoesung = fix(/^loesung-standby-netz$|^umfeld-standby-aufwachen$|^standby-netz-aus$/) ? 'Im Tool: WLAN im Standby verbunden lassen' : 'kein Handlungsbedarf (Standby)'
  for (const x of a?.det || []) {
    const f = fensterVon(x, t)
    const sb = imStandby(x, t)
    let art: AussetzerArt = 'unklar', wieso = '', loesung = '', normal = false
    const kats = new Set((f?.ereignisse || []).map(e => ({ k: umfeldKategorie(e), off: (ms(e.zeit) - x.t) / 1000 })).filter(e => e.k && e.off <= 30).map(e => e.k as UmfeldKat))
    const erste = UMFELD_RANG.find(k => kats.has(k))
    const aufgabe = (f?.ereignisse || []).find(e => e.log === 'Aufgabe' && (ms(e.zeit) - x.t) / 1000 <= 30)
    if (x.kat === 'neueVerbindung') { art = 'anderesNetz'; normal = true; wieso = 'Der Benutzer hat selbst ein anderes Netz gewählt.'; loesung = 'kein Handlungsbedarf' }
    else if (sb === 'ein') { art = 'standby'; normal = true; wieso = 'PC ging in den Standby – Windows trennt das WLAN dabei selbst.'; loesung = sbLoesung }
    else if (erste === 'lan' || (erste === 'verbindungsmanager' && !!d?.lan)) { art = 'lan'; wieso = 'LAN-Kabel oder Dockingstation wurde verbunden bzw. getrennt – Windows schaltet zwischen LAN und WLAN um.'; loesung = 'Kabel/Dock und Port prüfen' }
    else if (erste === 'wlan-richtlinie' || erste === 'richtlinie' || erste === 'mdm' || x.kat === 'profil') { art = x.kat === 'profil' && !erste ? 'profil' : 'richtlinie'; wieso = erste === 'mdm' ? 'Intune hat zur selben Zeit synchronisiert und das WLAN-Profil neu geschrieben.' : 'Eine Gruppenrichtlinie hat das WLAN-Profil neu geschrieben.'; loesung = 'Richtlinie ändern (Domänen-Administration)' }
    else if (erste === 'aufgabe') { art = 'aufgabe'; wieso = `Geplante Aufgabe lief zur selben Zeit${aufgabe?.extra ? `: ${aufgabe.extra}` : ''}.`; loesung = fix(/^aufgabe-(?!windows)/) ? 'Im Tool: Aufgabe zum Test abschalten' : 'Aufgabe prüfen' }
    else if (erste === 'installation') { art = 'installation'; normal = true; wieso = 'Zur selben Zeit lief eine Installation bzw. ein Update.'; loesung = 'kein Handlungsbedarf (einmalig)' }
    else if (x.kat === 'benutzer') { art = 'benutzer'; wieso = 'Vom Benutzer oder einem Programm (VPN-/Netzzugangs-Client) bewusst getrennt.'; loesung = fix(/^reconnect-task$/) ? 'Programm finden; im Tool: automatisch neu verbinden' : 'Programm finden, das trennt' }
    else if (x.kat === 'nichtVerfuegbar' || x.kat === 'funk') { art = 'funk'; wieso = x.kat === 'funk' ? 'Der Funk wurde ausgeschaltet (Flugmodus/Taste).' : 'Das Netz war nicht mehr erreichbar (Reichweite, Access Point).'; loesung = fix(/^loesung-band$|^roaming-aggressiv$/) ? 'Im Tool: Adapter-Einstellung; sonst Access Point prüfen' : 'Standort/Access Point prüfen' }
    else if (x.kat === 'sicherheit') { art = 'sicherheit'; wieso = 'Die WLAN-Anmeldung (802.1X) hat die Verbindung beendet.'; loesung = 'Zertifikat/RADIUS prüfen' }
    else if (x.kat === 'adapter') { art = 'treiber'; wieso = 'Windows hat den WLAN-Adapter kurz zurückgesetzt (Betriebszustand geändert, Code 11).'; loesung = fix(/^zufalls-mac$/) ? 'Im Tool: feste Hardwareadresse' : befunde.some(b => b.id === 'takt-24h') ? '24-Stunden-Takt: Sitzungsdauer des WLANs (Netzwerk-Team)' : 'Treiber/Adapter prüfen' }
    else if (sb === 'auf') { art = 'standby'; wieso = 'Direkt nach dem Aufwachen aus dem Standby getrennt – das WLAN kam nicht sauber wieder.'; loesung = fix(/^loesung-standby-netz$|^umfeld-standby-aufwachen$|^standby-netz-aus$/) ? 'Im Tool: WLAN im Standby verbunden lassen' : fix(/^reconnect-task$/) ? 'Im Tool: nach dem Aufwachen automatisch neu verbinden' : 'Standby-Einstellung prüfen' }
    else if (erste === 'treiber' || x.kat === 'treiber') { art = 'treiber'; wieso = erste === 'treiber' ? 'Der WLAN-Adapter bzw. Treiber wurde neu geladen.' : 'Der WLAN-Treiber hat die Verbindung getrennt.'; loesung = fix(/^loesung-mimo$|^powercfg-wlan$|^powermgmt-turnoff$|^uapsd$/) ? 'Im Tool: Energiesparen des Adapters abschalten; Treiber prüfen' : 'Treiber prüfen (Kasten oben)' }
    else if (erste === 'dienst' || erste === 'verbindungsmanager') { art = 'dienst'; wieso = 'Ein Netzwerk-Dienst bzw. der Verbindungs-Manager hat eingegriffen.'; loesung = 'siehe Befund „Zeitgleich: …“' }
    else { wieso = x.grund ? `Windows meldet: ${x.grund}` : 'Windows hat keinen Grund protokolliert.'; loesung = f ? 'Ursache nicht eindeutig' : 'nicht näher untersucht (nur die letzten 12)' }
    const nach = x.neu ? (x.neu.nachSek < 90 ? `${x.neu.nachSek} s` : x.neu.nachSek < 5400 ? `${Math.round(x.neu.nachSek / 60)} min` : `${Math.round(x.neu.nachSek / 3600)} Std.`) : ''
    const wieder = !x.neu ? 'nicht wieder verbunden' : sb === 'ein' && art === 'standby' ? `nach ${nach} (so lange im Standby)` : `${x.neu.manuell ? 'von Hand' : 'automatisch'} nach ${nach}`
    zeilen.push({ t: x.t, ...tagUhr(x.t), verbindung: 'WLAN', art, wieso, normal, untersucht: !!f, wieder, loesung })
  }
  // LAN-Trennungen, die nicht nur das Spiegelbild einer WLAN-Trennung sind
  const mitWlan = d ? lanZeitgleichMitWlan(d) : []
  ;(d?.lanEreignisse?.letzte || []).forEach((e, i) => {
    const ts = ms(e.zeit)
    if (isNaN(ts) || mitWlan[i] || (e.id !== 27 && !/getrennt|disconnect|link.*(down|verloren)|nicht verbunden/i.test(e.grund || ''))) return
    zeilen.push({ t: ts, ...tagUhr(ts), verbindung: 'LAN', art: 'lan', wieso: e.grund ? `LAN-Verbindung getrennt: ${e.grund}` : 'LAN-Verbindung getrennt.', normal: false, untersucht: false, wieder: '', loesung: fix(/^lan-(eee|turnoff|duplex)$/) ? 'Im Tool: LAN-Adapter-Einstellung' : 'Kabel/Dock und Port prüfen' })
  })
  return zeilen.sort((x, y) => y.t - x.t)
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
  // Wie viele Trennungen sind nur das Ein-/Aufwachen aus dem Standby?
  const imSb = r.filter(x => imStandby(x, t) === 'ein').length
  const arbeit = r.length - imSb
  if (imSb >= Math.ceil(r.length * 0.6)) titel = arbeit === 0
    ? `Kein Ausfall während der Arbeit: Alle ${r.length} Trennungen fallen mit dem Standby zusammen.`
    : `Die meisten Trennungen sind der Standby (${imSb} von ${r.length}) – während der Arbeit waren es ${arbeit}.`
  else if (tagesTakt(a.det)) titel = 'Kein Funkproblem: Das WLAN wird im 24-Stunden-Takt kurz getrennt.'
  else if (a.muster) titel = `Kein Funkproblem: Etwas trennt das WLAN gezielt jeden Tag um ≈ ${a.muster.uhr} Uhr.`
  else if (top?.kat === 'benutzer' || top?.kat === 'profil') titel = `Das WLAN wird bewusst getrennt (${GRUND_TEXT[top.kat]}).`
  else if (top?.kat === 'nichtVerfuegbar') titel = 'Das Netz ist zeitweise nicht erreichbar — eher Access Point oder Funk.'
  else if (top?.kat === 'treiber') titel = 'Der Treiber trennt die Verbindung — Adapter, Treiber und Energie prüfen.'
  else titel = `${r.length} Trennung${r.length === 1 ? '' : 'en'} in 14 Tagen — Ursache noch nicht eindeutig.`

  if (imSb > 0) punkte.push(`${imSb} von ${r.length} Trennungen, weil der PC in den Standby ging (Windows trennt das WLAN dabei selbst), ${arbeit} während der Arbeit bzw. direkt nach dem Aufwachen.`)
  if (a.muster) punkte.push(`${a.muster.treffer} von ${a.muster.gesamt} Trennungen zwischen ${a.muster.von} und ${a.muster.bis} Uhr, an ${a.muster.tage} Tagen (${a.muster.wochentage}).`)
  const dauern = r.map(x => x.neu && !x.neu.manuell ? x.neu.nachSek : null)
  if (r.length >= 2 && dauern.every(s => s != null && s <= 60)) punkte.push(`Jede Trennung dauerte nur ${Math.min(...(dauern as number[]))}–${Math.max(...(dauern as number[]))} Sekunden – Windows hat jedes Mal von selbst neu verbunden.`)
  if (tagesTakt(a.det)) schritte.push(macZufall(a.profil) ? 'Zufällige Hardwareadresse des WLAN-Profils abschalten – unten anhaken.' : 'Netzwerk-Team: Sitzungsdauer (Session-Timeout / Reauthentifizierung) dieses WLANs am Controller bzw. RADIUS prüfen – 24 Stunden passen genau zum Muster.')
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
  if (imSb > 0 || a.umfeld.some(u => u.kat === 'standby-aufwachen')) {
    const sb = t.standbyNetz
    const offen = !!d.powercfg?.modernStandby && ((sb?.ac !== 1 && sb?.richtlinieAc == null) || (sb?.dc !== 1 && sb?.richtlinieDc == null))
    schritte.push(offen
      ? 'Standby: „WLAN im Standby verbunden lassen (Netz- und Akkubetrieb)“ unten anhaken und anwenden – dann trennt Windows beim Einschlafen nicht mehr.'
      : sb?.richtlinieAc != null || sb?.richtlinieDc != null
        ? 'Standby: Das WLAN im Standby ist per Gruppenrichtlinie festgelegt – dort für Netz- und Akkubetrieb aktivieren (Domänen-Administration).'
        : 'Standby: Das WLAN bleibt im Standby schon verbunden. Hakt es nach dem Aufwachen, unten „automatisch neu verbinden“ anhaken.')
  }
  if (a.profil?.modus && /manuell|manual/i.test(a.profil.modus)) schritte.push(/gruppenrichtlinie/i.test(a.profil.quelle || '') ? `Profil „${a.profil.name}“ kommt per Richtlinie — dort auf „automatisch verbinden“ stellen.` : `Profil „${a.profil.name}“ auf „automatisch verbinden“ stellen — unten per Häkchen.`)
  if (a.umfeld.some(u => u.kat === 'lan' || u.kat === 'verbindungsmanager')) schritte.push('LAN/WLAN-Umschaltung: Kabel abziehen oder Port sauber patchen, BIOS „LAN/WLAN Auto Switching“ und „Verbindungen minimieren“ prüfen.')
  if (a.umfeld.some(u => u.kat === 'treiber') || top?.kat === 'treiber') schritte.push('Treiber aktualisieren (Menü „Treiber-Installation“) und den Updater suchen, der den Adapter neu lädt.')
  if (top?.kat === 'benutzer' && !fremd.length) schritte.push('Wer trennt? VPN-/NAC-Client und Verbindungs-Tools prüfen (siehe Software-Befund); ggf. kurz vor der Uhrzeit am PC zusehen.')
  if (a.muster && !t.taskLogAktiv) schritte.push('Für einen eindeutigen Nachweis den Verlauf der Aufgabenplanung aktivieren und am nächsten Tag direkt nach der Trennung erneut scannen.')
  else if (a.muster) schritte.push('Am nächsten Tag direkt nach der Trennung erneut scannen — dann sind die Spuren frisch.')
  if (d.lan && !d.aktiv?.lan && /desktop|mini|tower|sff|workstation/i.test(d.system?.modell || '')) schritte.push('Am Platz ein LAN-Kabel nutzen, falls eine Dose da ist — bei einem Desktop die robusteste Lösung.')
  if (r.length >= 2 && a.profil?.name && (a.ohneAutoNeu.anzahl >= 1 || r.some(x => imStandby(x, t) === 'auf' && (!x.neu || x.neu.manuell || x.neu.nachSek > 120)))) schritte.push('Zur Absicherung: „nach Trennung und nach dem Aufwachen automatisch neu verbinden“ (unten auswählbar).')
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
