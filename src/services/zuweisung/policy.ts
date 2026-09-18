// ── Zusatz-Regel des Verteilerteams (über der Engine, damit die 303er-Parität bleibt) ─
// Davide Bazzani soll nur GRÖSSERE Infrastruktur-Themen bekommen, die MEHRERE Nutzer
// betreffen. Einzelprobleme (ein Rechner / eine Person) gehen an das Vor-Ort-Team
// Timo Jost / Tim Voelkl. Wird NACH der Engine angewandt (nicht Teil des Regelwerks/
// Paritätstests), damit die Referenz-Parität unberührt bleibt.

import type { Ergebnis, Eingabe } from './types'
import type { Engine } from './engine'

const BAZZANI = 'Davide Bazzani'
const JOST = 'Timo Jost'
const VOELKL = 'Tim Voelkl'

// Hinweise auf ein größeres / mehrere Nutzer betreffendes Problem (dann bleibt Bazzani).
const MAJOR_RE = /\b(mehrere|viele|alle|sämtliche|saemtliche|gesamte[nrs]?|ganze[nrs]?|komplette[nrs]?|niemand|keiner|flächendeckend|flaechendeckend|massen|standort(weit)?|abteilung|halle|produktion(\s+steht)?|ausfall|totalausfall|störung|stoerung|outage|nicht erreichbar|down|serverraum|netzwerk(ausfall|störung|stoerung|problem)?|switch|vlan|firewall)\b/i

/**
 * Wendet die Verteilerteam-Regel an: Ist Bazzani der Hauptbearbeiter und liegt KEIN
 * Groß-/Mehrbenutzer-Signal vor → auf Jost/Voelkl umleiten (Bazzani bleibt als letzte
 * Vertretung). Sonst Bazzani mit erklärendem Vermerk. Alle anderen Ergebnisse unverändert.
 */
// Eindeutige Client-/Endgerät-Themen, die NIE zu SAP gehören. Steht im Ticket ein
// widersprechendes SAP-CI (z. B. „BC - Berechtigungen"), obwohl der Text klar BitLocker/
// BIOS/Intune meint, schlägt der Text das CI → Vor-Ort-Team (Regel INF-BITLOCKER).
const CLIENT_OVERRIDE_RE = /\bbitlocker\b|wiederherstellungsschlüssel|wiederherstellungsschluessel|recovery key|\bbios\b|\bintune\b|autopilot/i

/**
 * Wenn der Text ein eindeutiges Client-Thema enthält, das Engine-Ergebnis aber NICHT die
 * passende Vor-Ort-Regel ist (weil ein SAP-CI zuerst gegriffen hat), das Ergebnis über die
 * Engine NUR mit Text (CI ignoriert) neu bestimmen und übernehmen, sofern es eine
 * Client-/Infra-Regel wird. Reine Zusatzschicht → Referenz-Parität bleibt unberührt.
 */
export function applyClientOverride(pred: Ergebnis, eingabe: Eingabe, engine: Engine, dept: string): Ergebnis {
  const text = `${eingabe.short || ''} ${eingabe.desc || ''}`
  if (!CLIENT_OVERRIDE_RE.test(text)) return pred
  if (pred.regel === 'INF-BITLOCKER') return pred
  const textOnly = engine.zuweisen({ ...eingabe, ci: '' }, { dept })
  if (textOnly.regel === 'INF-BITLOCKER') {
    return { ...textOnly, grund: (textOnly.grund ? textOnly.grund + ' ' : '') + 'Text-Override: eindeutiges Client-Thema (z. B. BitLocker/BIOS/Intune) → Vor-Ort-Team, obwohl im Ticket ein SAP-CI hinterlegt ist.' }
  }
  return pred
}

export function applyVerteilerPolicy(pred: Ergebnis, eingabe: Eingabe): Ergebnis {
  if (pred.primary !== BAZZANI) return pred
  const text = `${eingabe.short || ''} ${eingabe.desc || ''}`
  const gross = MAJOR_RE.test(text)
  if (gross) {
    return { ...pred, grund: (pred.grund ? pred.grund + ' ' : '') + '[Verteiler-Regel: größeres/mehrere Nutzer betreffendes Infrastruktur-Problem → Bazzani.]' }
  }
  const vertretung = [VOELKL, ...(pred.vertretung || []).filter(v => v !== BAZZANI && v !== VOELKL && v !== JOST), BAZZANI]
  return {
    ...pred,
    primary: JOST,
    vertretung,
    pool: true,
    grund: (pred.grund ? pred.grund + ' ' : '') + 'Verteiler-Regel: Einzelproblem → Vor-Ort-Team (Timo Jost / Tim Voelkl). Davide Bazzani nur bei größeren Infrastruktur-Problemen, die mehrere Nutzer betreffen.',
  }
}
