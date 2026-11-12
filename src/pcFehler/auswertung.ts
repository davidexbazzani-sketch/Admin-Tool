// ── PC-Fehler: Fehlergruppen eines PCs → Befunde mit Lösungsweg (reine Logik) ──

import { REGELN, RAUSCHEN, type FehlerGruppe, type Regel, type Schwere } from './katalog'

export interface Befund {
  /** Regel + ggf. Programm — eindeutig je PC. */
  key: string
  regel: string
  titel: string
  schwere: Schwere
  bedeutung: string
  /** Suchtext für „Gib dein Problem ein" (Lösungsweg). */
  suche: string
  anzahl: number
  zuerst: string
  zuletzt: string
  /** Beispieltext aus dem Protokoll. */
  beispiel: string
  quelle: string
  /** Nur „Laufwerk I: fehlt": die betroffenen Benutzer. */
  benutzer?: string[]
}

export interface Auswertung {
  befunde: Befund[]
  /** Fehler, zu denen (noch) nichts hinterlegt ist — einsehbar, zählen aber nicht als Befund. */
  unbekannt: FehlerGruppe[]
  /** Anzahl ausgeblendeter Gruppen: bekanntes Rauschen bzw. unter der Schwelle. */
  rauschen: number
  unterSchwelle: number
}

/** Zeilen des PCs („Protokoll⇥Quelle⇥Kennung⇥Stufe⇥Anzahl⇥zuerst⇥zuletzt⇥Programm⇥Text"). null = nicht lesbar. */
export function leseGruppen(fe: unknown): FehlerGruppe[] | null {
  if (!Array.isArray(fe)) return null
  const aus: FehlerGruppe[] = []
  for (const z of fe) {
    if (typeof z !== 'string') continue
    const s = z.split('\t')
    if (s.length < 9 || !s[1]) continue
    const anzahl = parseInt(s[4], 10)
    if (!(anzahl > 0)) continue
    aus.push({ log: s[0], quelle: s[1], id: parseInt(s[2], 10) || 0, stufe: parseInt(s[3], 10) || 0, anzahl, zuerst: s[5], zuletzt: s[6], app: s[7] || '', text: s.slice(8).join(' ') })
  }
  return aus
}

function trifft(r: Regel, g: FehlerGruppe): boolean {
  const w = r.wenn
  if (w.quelle && !w.quelle.test(g.quelle)) return false
  if (w.log && !w.log.test(g.log)) return false
  if (w.ids && !w.ids.includes(g.id)) return false
  if (w.app && !w.app.test(g.app.split('|')[0] || '')) return false
  if (w.text && !w.text.test(g.text)) return false
  if (w.nichtText && w.nichtText.test(g.text)) return false
  return true
}

const HOEHER: Record<Schwere, Schwere> = { niedrig: 'mittel', mittel: 'hoch', hoch: 'hoch' }
const RANG: Record<Schwere, number> = { hoch: 0, mittel: 1, niedrig: 2 }
const wert = <T,>(v: T | ((g: FehlerGruppe) => T), g: FehlerGruppe): T => (typeof v === 'function' ? (v as (g: FehlerGruppe) => T)(g) : v)

export function werteAus(gruppen: FehlerGruppe[]): Auswertung {
  const sammel = new Map<string, { r: Regel; g: FehlerGruppe; anzahl: number; zuerst: string; zuletzt: string }>()
  const unbekannt: FehlerGruppe[] = []
  let rauschen = 0
  for (const g of gruppen) {
    const r = REGELN.find(x => trifft(x, g))
    if (!r) {
      if (RAUSCHEN.test(g.quelle) || RAUSCHEN.test(g.log)) rauschen++
      else unbekannt.push(g)
      continue
    }
    const key = r.jeProgramm ? `${r.id}|${(g.app.split('|')[0] || '').toLowerCase()}` : r.id
    const s = sammel.get(key)
    if (!s) sammel.set(key, { r, g, anzahl: g.anzahl, zuerst: g.zuerst, zuletzt: g.zuletzt })
    else {
      s.anzahl += g.anzahl
      if (g.zuerst < s.zuerst) s.zuerst = g.zuerst
      if (g.zuletzt > s.zuletzt) { s.zuletzt = g.zuletzt; s.g = g }
    }
  }
  const befunde: Befund[] = []
  let unterSchwelle = 0
  for (const [key, s] of sammel) {
    if (s.anzahl < (s.r.ab ?? 1)) { unterSchwelle++; continue }
    const schwere = s.r.schwererAb && s.anzahl >= s.r.schwererAb ? HOEHER[s.r.schwere] : s.r.schwere
    befunde.push({
      key, regel: s.r.id, titel: wert(s.r.titel, s.g), schwere, bedeutung: s.r.bedeutung, suche: wert(s.r.suche, s.g),
      anzahl: s.anzahl, zuerst: s.zuerst, zuletzt: s.zuletzt, beispiel: s.g.text.slice(0, 240), quelle: `${s.g.quelle} ${s.g.id}`,
    })
  }
  befunde.sort((a, b) => RANG[a.schwere] - RANG[b.schwere] || b.anzahl - a.anzahl)
  unbekannt.sort((a, b) => b.anzahl - a.anzahl)
  return { befunde, unbekannt, rauschen, unterSchwelle }
}

/**
 * Standard: Jeder Mitarbeiter hat das Firmenlaufwerk I: verbunden. Fehlt die dauerhafte
 * Verbindung bei einem angemeldeten Domänen-Benutzer, ist das eine Auffälligkeit.
 * (Ist niemand angemeldet, lässt sich nichts sagen → kein Befund.)
 */
export function laufwerkBefund(lw: unknown, am: string): Befund | null {
  if (!Array.isArray(lw)) return null
  const ohne = lw.filter((z): z is string => typeof z === 'string').map(z => z.split('	')).filter(s => s[0] && !(s[1] || '').trim()).map(s => s[0])
  if (!ohne.length) return null
  return {
    key: 'laufwerk-i', regel: 'laufwerk-i', titel: 'Laufwerk I: ist nicht verbunden', schwere: 'mittel',
    bedeutung: `Bei ${ohne.join(', ')} fehlt die dauerhafte Verbindung zum Firmenlaufwerk I: – das soll jeder Mitarbeiter haben.`,
    suche: 'laufwerk i fehlt netzlaufwerk verbinden', anzahl: ohne.length, zuerst: am, zuletzt: am,
    beispiel: `Angemeldet ohne Laufwerk I: ${ohne.join(', ')}`, quelle: 'Registry des Benutzers', benutzer: ohne,
  }
}

export const schwerste = (b: Befund[]): Schwere | null => (b.length ? b.reduce<Schwere>((m, x) => (RANG[x.schwere] < RANG[m] ? x.schwere : m), 'niedrig') : null)
export const SCHWERE_RANG = RANG
