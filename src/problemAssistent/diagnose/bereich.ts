// ── Komplette Bereichsdiagnose: alle Prüfungen und Regeln eines Problembereichs ──
// „Problem nicht behoben“ → alles im Bereich auslesen (Ereignisanzeige, Abstürze, Einstellungen,
// Dienste, Treiber, Netz …) und jeden Befund mit seiner Lösung zeigen.
import type { PaBereich } from '../types'
import { DG_THEMEN } from './index'
import type { DgOber, DgUnter } from './types'

/** Problembereich → Diagnose-Oberthemen (erstes = Hauptthema). */
export const BEREICH_DIAGNOSE: Record<PaBereich, string[]> = {
  'Teams': ['teams'],
  'Outlook & E-Mail': ['outlook'],
  'Office (Word/Excel/PowerPoint)': ['office'],
  'OneDrive & SharePoint': ['onedrive'],
  'Browser': ['browser'],
  'Netzwerk & Internet': ['netz'],
  'WLAN': ['wlan', 'netz'],
  'VPN & Zscaler': ['vpn'],
  'Netzlaufwerke & Dateien': ['laufwerke'],
  'Drucker & Scannen': ['drucker'],
  'Hardware & Geräte': ['hardware'],
  'Audio & Headset': ['audio'],
  'Bildschirm & Grafik': ['bildschirm'],
  'Kamera & Mikrofon': ['audio'],
  'Akku & Energie': ['hardware'],
  'Windows & Oberfläche': ['windows'],
  'Leistung & Speicher': ['leistung', 'stabilitaet'],
  'Updates & Software': ['software'],
  'Anmeldung & Konto': ['konto'],
  'Sicherheit': ['konto'],
  'SAP': ['sap'],
  'SolidWorks & CAD': ['fachprogramme'],
  'Smartphone & MFA': ['telefonie', 'konto'],
  'Weitere Programme': ['fachprogramme'],
  'Telefonie & Sonstiges': ['telefonie'],
}

export function diagnoseThemen(bereich: PaBereich): DgOber[] {
  return (BEREICH_DIAGNOSE[bereich] || []).map(id => DG_THEMEN.find(o => o.id === id)).filter((o): o is DgOber => !!o)
}

/** Alle Unterthemen der Oberthemen zu EINEM Diagnose-Lauf zusammenführen. */
export function bereichsDiagnose(bereich: PaBereich): DgUnter | null {
  const themen = diagnoseThemen(bereich)
  if (!themen.length) return null
  const sonden: string[] = []
  const regeln: DgUnter['regeln'] = []
  const ohneBefund: string[] = []
  for (const o of themen) for (const u of o.unter) {
    for (const s of u.sonden) if (!sonden.includes(s)) sonden.push(s)
    for (const r of u.regeln) {
      const zusatz = r.imBereich
      regeln.push({ ...r, id: u.id + '/' + r.id, wenn: zusatz ? f => r.wenn(f) && zusatz(f) : r.wenn })
    }
    for (const p of u.ohneBefund.slice(0, 1)) if (!ohneBefund.includes(p)) ohneBefund.push(p)
  }
  return {
    id: 'bereich-' + themen.map(o => o.id).join('-'),
    titel: 'Komplette Diagnose: ' + themen.map(o => o.titel).join(' + '),
    beschreibung: `Liest alles zu diesem Bereich aus (${sonden.length} Prüfungen: Ereignisanzeige, Abstürze, Einstellungen, Dienste, Treiber, Netz …) und zeigt zu jedem Befund die passende Lösung. Ändert nichts.`,
    sonden, regeln, ohneBefund: ohneBefund.slice(0, 5),
  }
}
