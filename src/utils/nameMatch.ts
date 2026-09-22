// ── Fuzzy-Namensabgleich (Personen) ──────────────────────────────────────────
// Robuster Vergleich zweier Personennamen, tolerant gegen:
//   • Reihenfolge (Vorname/Nachname vertauscht) — reihenfolge-unabhängig über Tokens
//   • Umlaute/Diakritika: „Müller" ↔ „Mueller" ↔ „Muller", „ö"↔„oe", „é"↔„e"
//   • Komma-Form „Nachname, Vorname"
//   • Tippfehler: „Mathias" ↔ „Matthias", „Schmidt" ↔ „Schmitt" (Levenshtein je Token)
// Gegen Fehlalarme: bei Namen mit ≥2 Tokens müssen ≥2 Tokens zueinander passen und
// mindestens EINER davon exakt sein (ein reiner Doppel-Tippfehler zählt nicht).
//
// Ergänzt `samePerson` (services/personMasterData.ts), das nur Reihenfolge/Komma/
// Groß-Klein kann, aber KEINE Tippfehler/Umlaut-Faltung. Hier bewusst als eigene,
// strengere Funktion, um bestehende Abgleiche (Onboarding/Dossier) nicht zu ändern.

// Unicode-Bereich der kombinierenden Diakritika (U+0300–U+036F) — als String
// gebaut, damit keine literalen Kombinationszeichen im Quelltext stehen.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

/** Name normalisieren: klein, Umlaute → ae/oe/ue/ss, restliche Diakritika entfernen. */
export function foldName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(COMBINING_MARKS, '') // é→e, ñ→n, …
}

/** Signifikante Namens-Tokens (Länge ≥ 2 → Initialen/Einzelbuchstaben fallen raus). */
export function nameTokens(s: string): string[] {
  return foldName(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2)
}

/** Levenshtein-Distanz (iterativ, eine Zeile Speicher). */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[n]
}

/** Wie nah stehen zwei Tokens: exakt, per Tippfehler (Levenshtein) oder gar nicht. */
function tokenCloseness(x: string, y: string): 'exact' | 'fuzzy' | null {
  if (x === y) return 'exact'
  const min = Math.min(x.length, y.length)
  const max = Math.max(x.length, y.length)
  if (max - min > 2) return null                  // zu großer Längenunterschied
  const allowed = min >= 8 ? 2 : min >= 4 ? 1 : 0 // kurze Tokens: nur exakt
  if (allowed === 0) return null
  return levenshtein(x, y) <= allowed ? 'fuzzy' : null
}

/**
 * Passen zwei Personennamen (reihenfolge-unabhängig, tippfehler-/umlaut-tolerant)?
 * z. B. „Matthias Welle" ↔ „Welle Matthias" ↔ „Welle Mathias" ↔ „Welle, Mathias".
 */
export function fuzzyNameMatch(a: string, b: string): boolean {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.length === 0 || tb.length === 0) return false
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const used = new Set<number>()
  let matched = 0
  let exact = 0
  for (const t of short) {
    let bestI = -1
    let bestKind: 'exact' | 'fuzzy' | null = null
    for (let i = 0; i < long.length; i++) {
      if (used.has(i)) continue
      const k = tokenCloseness(t, long[i])
      if (k === 'exact') { bestI = i; bestKind = 'exact'; break }
      if (k === 'fuzzy' && bestKind === null) { bestI = i; bestKind = 'fuzzy' }
    }
    if (bestI >= 0) { used.add(bestI); matched++; if (bestKind === 'exact') exact++ }
  }
  // ≥2-Token-Namen: mind. 2 Treffer, davon mind. 1 exakt (gegen Doppel-Tippfehler-Fehlalarm).
  if (short.length >= 2 && long.length >= 2) return matched >= 2 && exact >= 1
  // Einzel-Token-Name (selten): nur ein exakter Treffer zählt.
  return exact >= 1
}
