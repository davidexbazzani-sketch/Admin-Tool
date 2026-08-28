// ── SAP-Fehlersuche: Vergleich zweier Scans ──────────────────────────────────
import type { SapScan, SapVergleich, SapVergleichZeile, SapBewertung } from './sapCheck.types'
import { BEWERTUNG_RANG } from './sapCheck.types'

const auffaellig = (b: SapBewertung) => b === 'fehler' || b === 'warnung' || b === 'hinweis'

export function compareScans(a: SapScan, b: SapScan): SapVergleich {
  const mapA = new Map(a.befunde.map(x => [x.id, x]))
  const mapB = new Map(b.befunde.map(x => [x.id, x]))
  const ids = [...new Set([...mapA.keys(), ...mapB.keys()])]

  const zeilen: SapVergleichZeile[] = ids.map(id => {
    const x = mapA.get(id), y = mapB.get(id)
    const base = (x ?? y)!
    const bewA: SapBewertung = x?.bewertung ?? 'unbekannt'
    const bewB: SapBewertung = y?.bewertung ?? 'unbekannt'
    const nichtVergleichbar = !x || !y || !x.vergleichbar || !y.vergleichbar || bewA === 'unbekannt' || bewB === 'unbekannt'
    const unterschied = !nichtVergleichbar && x!.wert !== y!.wert
    const beideAuffaellig = auffaellig(bewA) && auffaellig(bewB)
    return {
      id, kategorie: base.kategorie, titel: base.titel,
      wertA: x?.wert ?? '—', wertB: y?.wert ?? '—', bewertungA: bewA, bewertungB: bewB,
      unterschied, nichtVergleichbar, beideAuffaellig,
    }
  })

  // Unterschiede zuerst, dann gemeinsame Auffälligkeiten, dann nach Schwere.
  zeilen.sort((p, q) => {
    if (p.unterschied !== q.unterschied) return p.unterschied ? -1 : 1
    if (p.beideAuffaellig !== q.beideAuffaellig) return p.beideAuffaellig ? -1 : 1
    const rp = Math.min(BEWERTUNG_RANG[p.bewertungA], BEWERTUNG_RANG[p.bewertungB])
    const rq = Math.min(BEWERTUNG_RANG[q.bewertungA], BEWERTUNG_RANG[q.bewertungB])
    return rp - rq
  })

  // Massenereignis: gleiches Symptom auf BEIDEN Clients bei Kerberos/SNC/DNS/Config-Freigabe.
  const KERN = ['anmeldung.ticket', 'net.kerberos', 'net.ziel.', 'config.share', 'config.central', 'config.compare']
  const massenereignis = zeilen.filter(z => z.beideAuffaellig && KERN.some(k => z.id.startsWith(k)))

  return { a: { pc: a.pc, ranAt: a.ranAt }, b: { pc: b.pc, ranAt: b.ranAt }, zeilen, massenereignis }
}
