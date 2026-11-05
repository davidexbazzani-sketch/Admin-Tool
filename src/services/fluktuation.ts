// ── Mitarbeiterverwaltung – Ein-/Austritte im Zeitverlauf + Prognose ──────────
// Quelle: Eintrittsdatum der neuen Mitarbeiter, Austrittsdatum der Austritte
// (inkl. bereits eingetragener künftiger Termine). Gelöschte Datensätze fehlen.
//
// Prognose (bewusst einfach und nachvollziehbar):
//   Grundwert = Durchschnitt der letzten 12 abgeschlossenen Monate
//   Saison    = Durchschnitt desselben Kalendermonats in den Vorjahren (falls ≥ 1 Vorjahr da)
//   Prognose  = ½ Grundwert + ½ Saison  (ohne Vorjahr: nur Grundwert)
// Bereits eingetragene Termine sind eine Untergrenze: Prognose ≥ geplant.

import type { Employee, Departure } from './employees'

export interface MonatsWert {
  monat: string              // YYYY-MM
  ein: number                // tatsächlich (vergangen/heute) bzw. eingetragen (Zukunft)
  aus: number
  zukunft: boolean
  prognoseEin?: number       // nur Zukunft
  prognoseAus?: number
  namenEin: string[]
  namenAus: string[]
  saldo: number              // ein − aus (Zukunft: eingetragene Termine)
  saldo12: number            // gleitend: Summe der letzten 12 Monate bis hier
  saldoKum: number           // kumuliert seit erstem Monat
}

export interface Auswertung {
  monate: MonatsWert[]
  letzte12: { ein: number; aus: number }
  vorige12: { ein: number; aus: number }
  schnitt12: { ein: number; aus: number }      // Ø je Monat, letzte 12
  naechste90: { ein: number; aus: number }     // bereits eingetragen
  saisonEin: { monat: number; schnitt: number }[]  // Top-Monate (1–12), nur mit ≥ 12 Monaten Historie
  saisonAus: { monat: number; schnitt: number }[]
  abteilungen: { name: string; anzahl: number }[]  // Eintritte letzte 12 Monate
  ersterMonat: string
  ohneDatum: number
  trend: {
    saldo12: number                // letzte 12 abgeschlossene Monate
    saldo12VorHalbjahr: number | null  // derselbe Wert vor 6 Monaten (Richtung)
    richtung: 'steigend' | 'fallend' | 'gleich' | 'unklar'
  }
}

export const MONATSNAMEN = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

const gueltig = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && !isNaN(new Date(iso).getTime())
const monatVon = (iso: string) => iso.slice(0, 7)
function plusMonate(ym: string, n: number): string {
  const [j, m] = ym.split('-').map(Number)
  const d = new Date(j, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const heuteYm = (h: Date) => `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`
const rund1 = (n: number) => Math.round(n * 10) / 10

export function werteAus(employees: Employee[], departures: Departure[], horizont = 6, heute = new Date()): Auswertung {
  const ein = new Map<string, string[]>(), aus = new Map<string, string[]>()
  let ohneDatum = 0
  for (const e of employees) {
    if (!gueltig(e.startDate)) { ohneDatum++; continue }
    const k = monatVon(e.startDate); (ein.get(k) || ein.set(k, []).get(k)!).push(`${e.vorname} ${e.name}`.trim())
  }
  for (const d of departures) {
    if (!gueltig(d.exitDate)) { ohneDatum++; continue }
    const k = monatVon(d.exitDate); (aus.get(k) || aus.set(k, []).get(k)!).push(d.name)
  }
  const jetzt = heuteYm(heute)
  const alle = [...ein.keys(), ...aus.keys()].sort()
  const ersterMonat = alle[0] && alle[0] < jetzt ? alle[0] : jetzt
  const letzterBekannt = alle.length ? alle[alle.length - 1] : jetzt
  const ende = [plusMonate(jetzt, horizont), letzterBekannt].sort()[1]

  const anz = (m: Map<string, string[]>, k: string) => m.get(k)?.length || 0
  // Abgeschlossene Monate: bis Vormonat
  const abgeschlossen: string[] = []
  for (let k = ersterMonat; k < jetzt; k = plusMonate(k, 1)) abgeschlossen.push(k)
  const letzte = abgeschlossen.slice(-12), davor = abgeschlossen.slice(-24, -12)
  const summe = (m: Map<string, string[]>, ks: string[]) => ks.reduce((s, k) => s + anz(m, k), 0)
  const grundEin = letzte.length ? summe(ein, letzte) / letzte.length : 0
  const grundAus = letzte.length ? summe(aus, letzte) / letzte.length : 0

  // Saison je Kalendermonat aus abgeschlossenen Monaten
  const saison = (m: Map<string, string[]>) => {
    const s = Array.from({ length: 12 }, () => ({ summe: 0, n: 0 }))
    for (const k of abgeschlossen) { const i = Number(k.slice(5)) - 1; s[i].summe += anz(m, k); s[i].n++ }
    return s.map(x => (x.n ? x.summe / x.n : NaN))
  }
  const saisonE = saison(ein), saisonA = saison(aus)
  const vorjahre = (monatIdx: number) => abgeschlossen.filter(k => Number(k.slice(5)) - 1 === monatIdx).length
  const prognose = (grund: number, s: number[], k: string, geplant: number) => {
    const i = Number(k.slice(5)) - 1
    const wert = vorjahre(i) >= 1 && !isNaN(s[i]) ? (grund + s[i]) / 2 : grund
    return Math.max(rund1(wert), geplant)
  }

  const monate: MonatsWert[] = []
  for (let k = ersterMonat; k <= ende; k = plusMonate(k, 1)) {
    const zukunft = k > jetzt
    const w: MonatsWert = { monat: k, ein: anz(ein, k), aus: anz(aus, k), zukunft, namenEin: ein.get(k) || [], namenAus: aus.get(k) || [], saldo: anz(ein, k) - anz(aus, k), saldo12: 0, saldoKum: 0 }
    if (zukunft && k <= plusMonate(jetzt, horizont) && letzte.length >= 3) {
      w.prognoseEin = prognose(grundEin, saisonE, k, w.ein)
      w.prognoseAus = prognose(grundAus, saisonA, k, w.aus)
    }
    monate.push(w)
  }

  // Saldo: kumuliert und gleitend über 12 Monate
  let kum = 0
  monate.forEach((w, i) => {
    kum += w.saldo; w.saldoKum = kum
    w.saldo12 = monate.slice(Math.max(0, i - 11), i + 1).reduce((s, x) => s + x.saldo, 0)
  })
  const idxVormonat = monate.findIndex(w => w.monat === plusMonate(jetzt, -1))
  const s12 = idxVormonat >= 0 ? monate[idxVormonat].saldo12 : 0
  const s12alt = idxVormonat >= 6 + 11 ? monate[idxVormonat - 6].saldo12 : null
  // Erst ab spürbarer Änderung (≥ 2 Personen bzw. ≥ 15 %) von einer Richtung sprechen — sonst Rauschen
  const schwelle = s12alt === null ? 0 : Math.max(2, Math.abs(s12alt) * 0.15)
  const richtung = s12alt === null ? 'unklar' : s12 - s12alt >= schwelle ? 'steigend' : s12alt - s12 >= schwelle ? 'fallend' : 'gleich'

  const heuteIso = heute.toISOString().slice(0, 10)
  const in90 = new Date(heute.getTime() + 90 * 86400000).toISOString().slice(0, 10)
  const top = (s: number[]) => abgeschlossen.length >= 12
    ? s.map((v, i) => ({ monat: i + 1, schnitt: rund1(v) })).filter(x => !isNaN(x.schnitt) && x.schnitt > 0).sort((a, b) => b.schnitt - a.schnitt).slice(0, 3)
    : []

  const vor12 = new Date(heute); vor12.setFullYear(vor12.getFullYear() - 1)
  const abt = new Map<string, number>()
  for (const e of employees) {
    if (!gueltig(e.startDate) || e.startDate > heuteIso || new Date(e.startDate) < vor12) continue
    const n = (e.department || '').trim() || 'ohne Abteilung'
    abt.set(n, (abt.get(n) || 0) + 1)
  }

  return {
    monate,
    letzte12: { ein: summe(ein, letzte), aus: summe(aus, letzte) },
    vorige12: { ein: summe(ein, davor), aus: summe(aus, davor) },
    schnitt12: { ein: rund1(grundEin), aus: rund1(grundAus) },
    naechste90: {
      ein: employees.filter(e => gueltig(e.startDate) && e.startDate > heuteIso && e.startDate <= in90).length,
      aus: departures.filter(d => gueltig(d.exitDate) && d.exitDate > heuteIso && d.exitDate <= in90).length,
    },
    saisonEin: top(saisonE), saisonAus: top(saisonA),
    abteilungen: [...abt.entries()].map(([name, anzahl]) => ({ name, anzahl })).sort((a, b) => b.anzahl - a.anzahl).slice(0, 6),
    ersterMonat, ohneDatum,
    trend: { saldo12: s12, saldo12VorHalbjahr: s12alt, richtung },
  }
}
