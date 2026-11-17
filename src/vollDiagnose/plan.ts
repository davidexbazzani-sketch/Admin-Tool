// ── PC-Volldiagnose Schritt 2: Maßnahmenplan (reine Logik) ───────────────────
// Aus den Lösungswegen aller Befunde: ohne Doppelte, in fester Reihenfolge (Sicherung →
// Platz → Dateisystem → Komponentenspeicher → Systemdateien → Updates → Treiber → Dienste
// → Einstellungen → Programme → EIN Neustart am Ende). Hardware-Ursachen sperren Software-
// Reparaturen. „kritische“ Bausteine sind nie vorab angehakt; auf Servern nichts vorab.

import { aktion as paAktion } from '../problemAssistent/aktionen'
import { L } from './katalog'
import { PHASEN, SCHWERE_RANG, type VdBefund, type VdGeraet, type VdLoesung, type VdMassnahme, type VdUrsache } from './typen'

export const ausfuehrbar = (l: VdLoesung) => (l.art === 'aktionen' || l.art === 'problem') && !!l.schritte?.length
export function risikoVon(l: VdLoesung): 'lesen' | 'aendern' | 'kritisch' {
  let r: 'lesen' | 'aendern' | 'kritisch' = 'lesen'
  for (const s of l.schritte || []) { const a = paAktion(s.aktion); if (a?.risiko === 'kritisch') return 'kritisch'; if (a?.risiko === 'aendern') r = 'aendern' }
  return r
}

export function baueMassnahmen(befunde: VdBefund[], ursachen: VdUrsache[], geraet: VdGeraet, alt: VdMassnahme[] = []): VdMassnahme[] {
  const gesperrt = new Map<string, string>()
  for (const u of ursachen) for (const p of u.sperrt || []) if (!gesperrt.has(p)) gesperrt.set(p, `Gesperrt wegen „${u.titel}“ – erst diese Ursache beheben.`)
  const neustartZuerst = ursachen.some(u => u.zuerst)
  const je = new Map<string, VdMassnahme>()
  const sortiert = [...befunde].sort((a, b) => (a.folgeVon ? 1 : 0) - (b.folgeVon ? 1 : 0) || SCHWERE_RANG[a.schwere] - SCHWERE_RANG[b.schwere] || (b.passend ? 1 : 0) - (a.passend ? 1 : 0))
  for (const b of sortiert) {
    // je Befund: der erste ausführbare Lösungsweg ist die Empfehlung; Werkzeuge/Hinweise stehen als Handarbeit dabei
    const erste = b.loesungen.find(ausfuehrbar)
    const kandidaten = [...(erste ? [erste] : []), ...b.loesungen.filter(l => !ausfuehrbar(l))]
    for (const l of kandidaten) {
      if (l.phase === 'neustart' && l.id === L.neustart.id) continue
      const eingabe = l.frage?.vorbelegt || ''
      const key = `${l.id}|${eingabe.toLowerCase()}`
      const m = je.get(key)
      if (m) { if (!m.befunde.includes(b.id)) m.befunde.push(b.id); continue }
      const sperre = ausfuehrbar(l) ? gesperrt.get(l.phase) : undefined
      const risiko = risikoVon(l)
      const empfohlen = ausfuehrbar(l) && l === erste && !sperre && !b.folgeVon && b.schwere !== 'hinweis' && risiko !== 'kritisch' && geraet === 'pc' && !neustartZuerst
      je.set(key, { id: 'm-' + key, loesung: l, befunde: [b.id], empfohlen, gewaehlt: empfohlen, gesperrt: sperre, eingabe: eingabe || undefined, status: 'offen' })
    }
  }
  const liste = [...je.values()]
  // EIN Neustart am Ende, wenn eine Maßnahme ihn braucht oder eine Ursache ihn verlangt
  const brauchtNeustart = liste.filter(m => m.loesung.neustart)
  const neustartBefunde = befunde.filter(b => b.loesungen.some(l => l.id === L.neustart.id)).map(b => b.id)
  if (brauchtNeustart.length || neustartBefunde.length) {
    liste.push({ id: 'm-neustart', loesung: L.neustart, befunde: [...new Set([...neustartBefunde, ...brauchtNeustart.flatMap(m => m.befunde)])],
      empfohlen: geraet === 'pc' && (neustartZuerst || brauchtNeustart.some(m => m.empfohlen)), gewaehlt: geraet === 'pc' && (neustartZuerst || brauchtNeustart.some(m => m.empfohlen)), status: 'offen' })
  }
  const rang = (m: VdMassnahme) => (neustartZuerst && m.id === 'm-neustart' ? -1 : PHASEN.indexOf(m.loesung.phase))
  liste.sort((a, b) => rang(a) - rang(b) || (ausfuehrbar(b.loesung) ? 1 : 0) - (ausfuehrbar(a.loesung) ? 1 : 0))
  // bisherige Auswahl, Eingaben und Ergebnisse übernehmen (Plan wird nach Vertiefungen neu berechnet)
  const vorher = new Map(alt.map(m => [m.id, m]))
  return liste.map(m => {
    const v = vorher.get(m.id)
    return v ? { ...m, gewaehlt: v.status === 'ok' ? false : v.gewaehlt, eingabe: v.eingabe ?? m.eingabe, status: v.status, zeilen: v.zeilen, fehler: v.fehler, nachpruefung: v.nachpruefung, nachText: v.nachText } : m
  })
}

/** Fehlende Pflicht-Eingabe einer Maßnahme (z. B. Dienstname) — sonst ''. */
export function fehlendeEingabe(m: VdMassnahme): string {
  const brauchtEingabe = (m.loesung.schritte || []).some(s => (s.param || '').includes('{eingabe}'))
  if (brauchtEingabe && !(m.eingabe || '').trim()) return m.loesung.frage?.label || 'Eingabe'
  for (const s of m.loesung.schritte || []) {
    const a = paAktion(s.aktion)
    if (a?.param?.pflicht && !(s.param || '').trim() && !(m.eingabe || '').trim()) return a.param.label
  }
  return ''
}
