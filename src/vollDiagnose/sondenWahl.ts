// ── PC-Volldiagnose: welche Sonden der geführten Diagnose im Rundumscan laufen ──
// Jede Sonde ist eingeordnet (Test verlangt das): „beide“ = PC und Server, „pc“ = nur PC,
// „aus“ = nie in der Volldiagnose (AD-/Berechtigungsvergleiche am Admin-PC, keine Gerätediagnose).
// Sonden der Art „benutzer“ laufen in Stufe 1 NIE — sie legen kurz eine geplante Aufgabe an.

import { DG_SONDEN } from '../problemAssistent/diagnose/index'
import type { DgSonde } from '../problemAssistent/diagnose/types'
import type { VdGeraet } from './typen'

export type SondenEinsatz = 'beide' | 'pc' | 'aus'

const BEIDE = ['sys', 'net', 'ko', 'sec', 'pf', 'pfplatz', 'pfstart', 'pfdisk', 'upwu', 'upsw', 'stbs', 'stpw', 'stboot', 'stapp', 'sthang', 'hwgeraet', 'lan', 'dnsweb', 'dr']
const AUS = ['zpa', 'rechte', 'lwr']

export function einsatzVon(s: DgSonde): SondenEinsatz {
  if (AUS.includes(s.id)) return 'aus'
  if (BEIDE.includes(s.id)) return 'beide'
  return 'pc'
}

export interface SondenWahl {
  laufen: DgSonde[]
  /** nicht gelaufen, mit Grund (für „Was wurde geprüft“) */
  aus: { s: DgSonde; grund: string }[]
}

/** Sonden für dieses Gerät; Themen der Richtung zuerst. */
export function waehleSonden(geraet: VdGeraet, mitBenutzer: boolean, zuerst: Set<string> = new Set()): SondenWahl {
  const laufen: DgSonde[] = []
  const aus: SondenWahl['aus'] = []
  for (const s of DG_SONDEN) {
    const e = einsatzVon(s)
    if (s.modus === 'benutzer') { aus.push({ s, grund: 'liest in der Sitzung des Benutzers (legt kurz eine Aufgabe an) – nicht im Lese-Schritt' }); continue }
    if (e === 'aus') { aus.push({ s, grund: 'Berechtigungs-/AD-Vergleich – nicht Teil der Gerätediagnose' }); continue }
    if (geraet === 'server' && e !== 'beide') { aus.push({ s, grund: 'nur für Arbeitsplatz-PCs' }); continue }
    if (s.modus === 'profil' && !mitBenutzer) { aus.push({ s, grund: 'kein Benutzer angemeldet' }); continue }
    laufen.push(s)
  }
  laufen.sort((a, b) => (zuerst.has(b.id) ? 1 : 0) - (zuerst.has(a.id) ? 1 : 0))
  return { laufen, aus }
}
