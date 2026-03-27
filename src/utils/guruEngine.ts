/**
 * IT Guru Analysis Engine — 10-Step Pipeline
 * 1. Normalize  2. Colloquial  3. Keywords  4. Typo fix
 * 5. Synonyms  6. Context  7. Correlations  8. Score  9. Top results  10. Diag chain
 *
 * Performance: Uses inverted index for O(1) keyword lookups.
 * Levenshtein only for candidates from index (max ~100), not all 2000+ entries.
 */
import type {
  KnowledgeBaseData, KBProblem, AnalysisResult,
  SessionMemory, Correlation, ChatMessage, AnswerTemplates,
} from '../types/guru'
import { getIndex } from './guruKnowledgeBase'

// ── Levenshtein with cache ────────────────────────────────────────────────────
const levCache = new Map<string, number>()

function levenshtein(a: string, b: string): number {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`
  if (levCache.has(key)) return levCache.get(key)!
  const m = a.length, n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
    }
  }
  const result = d[m][n]
  levCache.set(key, result)
  return result
}

// ── Step 1: Normalize ─────────────────────────────────────────────────────────
function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\wäöüß\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Step 2: Translate colloquial ──────────────────────────────────────────────
function translateColloquial(input: string, map: Record<string, string>): { text: string; matched: string[] } {
  let text = input
  const matched: string[] = []
  // Sort by length desc to match longer phrases first
  const sorted = Object.entries(map).sort((a, b) => b[0].length - a[0].length)
  for (const [colloquial, technical] of sorted) {
    if (text.includes(colloquial)) {
      text = text.replace(colloquial, technical)
      matched.push(`"${colloquial}" → "${technical}"`)
    }
  }
  return { text, matched }
}

// ── Step 3: Extract keywords (1/2/3-word phrases) ─────────────────────────────
function extractKeywords(text: string): string[] {
  const words = text.split(/\s+/).filter(w => w.length >= 2)
  const keywords: string[] = [...words]
  // 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    keywords.push(`${words[i]} ${words[i + 1]}`)
  }
  // 3-word phrases
  for (let i = 0; i < words.length - 2; i++) {
    keywords.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  }
  return keywords
}

// ── Step 4: Fix typos ─────────────────────────────────────────────────────────
function fixTypos(
  words: string[],
  typoMap: Record<string, string>,
  index: Map<string, Set<string>>
): { corrected: string[]; fixes: string[] } {
  const corrected: string[] = []
  const fixes: string[] = []

  for (const word of words) {
    // Direct map lookup
    if (typoMap[word]) {
      corrected.push(typoMap[word])
      fixes.push(`"${word}" → "${typoMap[word]}"`)
      continue
    }
    // Check if word exists in index
    if (index.has(word)) {
      corrected.push(word)
      continue
    }
    // Fuzzy match: only check index keys with same 2-char prefix
    const prefix = word.substring(0, 2)
    let bestMatch = word
    let bestDist = 3 // max tolerated distance
    for (const [key] of index) {
      if (key.length < 3) continue
      if (!key.startsWith(prefix) && levenshtein(word.substring(0, 2), key.substring(0, 2)) > 1) continue
      const dist = levenshtein(word, key)
      if (dist < bestDist) {
        bestDist = dist
        bestMatch = key
      }
    }
    if (bestMatch !== word) {
      fixes.push(`"${word}" → "${bestMatch}"`)
    }
    corrected.push(bestMatch)
  }
  return { corrected, fixes }
}

// ── Step 5: Resolve synonyms ──────────────────────────────────────────────────
function resolveSynonyms(words: string[], synonyms: Record<string, string[]>): string[] {
  const expanded = new Set(words)
  for (const word of words) {
    for (const [canonical, syns] of Object.entries(synonyms)) {
      if (word === canonical || syns.includes(word)) {
        expanded.add(canonical)
        for (const s of syns) expanded.add(s)
      }
    }
  }
  return Array.from(expanded)
}

// ── Step 6: Context detection ─────────────────────────────────────────────────
const CONTEXT_HINTS: Record<string, string[]> = {
  drucker: ['drucker', 'printer', 'druck', 'spooler', 'warteschlange', 'toner', 'papier'],
  outlook: ['outlook', 'mail', 'email', 'ost', 'pst', 'postfach', 'kalender'],
  teams: ['teams', 'videocall', 'besprechung', 'chat', 'kamera', 'mikrofon'],
  netzwerk: ['wlan', 'wifi', 'lan', 'vpn', 'internet', 'dns', 'proxy', 'netzlaufwerk'],
  performance: ['langsam', 'hängt', 'einfriert', 'cpu', 'ram', 'speicher', 'disk'],
  windows: ['bluescreen', 'bsod', 'boot', 'update', 'taskleiste', 'explorer'],
  passwort: ['passwort', 'kennwort', 'gesperrt', 'anmeldung', 'login', 'mfa', 'pin'],
  office: ['word', 'excel', 'powerpoint', 'office', 'lizenz', 'aktivierung'],
  zscaler: ['zscaler', 'zsa', 'tunnel', 'proxy'],
  enaio: ['enaio', 'dms', 'archiv', 'add-in'],
  sap: ['sap', 'gui', 'transaktion', 'spool'],
}

function detectContext(words: string[]): string[] {
  const contexts: string[] = []
  for (const [ctx, hints] of Object.entries(CONTEXT_HINTS)) {
    if (words.some(w => hints.includes(w))) {
      contexts.push(ctx)
    }
  }
  return contexts
}

// ── Step 7: Check correlations ────────────────────────────────────────────────
function checkCorrelations(words: string[], correlations: Correlation[]): Correlation | null {
  for (const corr of correlations) {
    const matched = corr.symptoms.filter(s => words.some(w => w.includes(s) || s.includes(w)))
    if (matched.length >= corr.min) return corr
  }
  return null
}

// ── Step 8: Score problems ────────────────────────────────────────────────────
function scoreProblems(
  keywords: string[],
  allWords: string[],
  contexts: string[],
  index: Map<string, Set<string>>,
  problems: KBProblem[],
  kb: KnowledgeBaseData,
): AnalysisResult[] {
  // Collect candidate problem IDs from index
  const candidates = new Set<string>()
  for (const kw of allWords) {
    const ids = index.get(kw)
    if (ids) ids.forEach(id => candidates.add(id))
    // Fuzzy: prefix match
    const prefix = kw.substring(0, 3)
    for (const [key, ids2] of index) {
      if (key.startsWith(prefix) && levenshtein(kw, key) <= 2) {
        ids2.forEach(id => candidates.add(id))
      }
    }
  }

  const problemMap = new Map(problems.map(p => [p.id, p]))
  const results: AnalysisResult[] = []

  for (const pid of candidates) {
    const problem = problemMap.get(pid)
    if (!problem) continue

    let score = 0
    const matchDetails: string[] = []

    for (const kw of keywords) {
      // Exact keyword match
      if (problem.keywords.some(k => k.toLowerCase() === kw)) {
        score += 10
        matchDetails.push(`Keyword: ${kw} (+10)`)
      }
      // Extended keyword
      else if (problem.extendedKeywords.some(ek => ek.toLowerCase().includes(kw) || kw.includes(ek.toLowerCase()))) {
        score += 8
        matchDetails.push(`Extended: ${kw} (+8)`)
      }
    }

    // Context bonus
    if (contexts.includes(problem.category.toLowerCase().split(/[_\s]/)[0])) {
      score += 5
      matchDetails.push(`Kontext: ${problem.category} (+5)`)
    }

    // Hidden triggers
    if (problem.hiddenTriggers) {
      for (const ht of problem.hiddenTriggers) {
        const condWords = ht.condition.toLowerCase().split(/\s+/)
        if (condWords.filter(cw => allWords.includes(cw)).length >= 2) {
          score += 12
          matchDetails.push(`Hidden Trigger (+12)`)
        }
      }
    }

    if (score > 0) {
      results.push({ problemId: pid, problem, score, matchDetails })
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, 5) // Top 5
}

// ── Main Analysis Pipeline ────────────────────────────────────────────────────
export function analyze(
  input: string,
  kb: KnowledgeBaseData,
  session: SessionMemory[],
): {
  results: AnalysisResult[]
  typoFixes: string[]
  colloquialMatches: string[]
  correlation: Correlation | null
  contexts: string[]
} {
  const index = getIndex()
  if (!index) return { results: [], typoFixes: [], colloquialMatches: [], correlation: null, contexts: [] }

  // 1. Normalize
  const normalized = normalize(input)

  // 2. Translate colloquial
  const { text: colloquialFixed, matched: colloquialMatches } = translateColloquial(normalized, kb.colloquialMap)

  // 3. Extract keywords
  const rawKeywords = extractKeywords(colloquialFixed)
  const rawWords = colloquialFixed.split(/\s+/).filter(w => w.length >= 2)

  // 4. Fix typos
  const { corrected, fixes: typoFixes } = fixTypos(rawWords, kb.typoMap, index)

  // 5. Resolve synonyms
  const expanded = resolveSynonyms(corrected, kb.synonyms)

  // 6. Detect context
  const contexts = detectContext(expanded)

  // 7. Check correlations
  const correlation = checkCorrelations(expanded, kb.correlations)

  // 8+9. Score and rank
  const results = scoreProblems(rawKeywords, expanded, contexts, index, kb.problems, kb)

  // Filter out already-tried problems from session
  const triedIds = new Set(session.filter(s => s.result === 'unresolved').map(s => s.problem))
  const filtered = results.filter(r => !triedIds.has(r.problemId))

  return {
    results: filtered.length > 0 ? filtered : results,
    typoFixes,
    colloquialMatches,
    correlation,
    contexts,
  }
}

// ── Template helpers ──────────────────────────────────────────────────────────
const usedTemplates = new Map<string, number>()

export function pickTemplate(templates: string[], vars: Record<string, string> = {}): string {
  // Pick least-recently-used template
  let best = templates[0]
  let bestUsage = Infinity
  for (const t of templates) {
    const usage = usedTemplates.get(t) ?? 0
    if (usage < bestUsage) {
      bestUsage = usage
      best = t
    }
  }
  usedTemplates.set(best, (usedTemplates.get(best) ?? 0) + 1)

  // Replace placeholders
  let result = best
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val)
  }

  // {tageszeit}
  const hour = new Date().getHours()
  const tageszeit = hour < 12 ? 'Morgen' : hour < 18 ? 'Nachmittag' : 'Abend'
  result = result.replace(/\{tageszeit\}/g, tageszeit)

  return result
}

// ── Find diagnosis chain for input ────────────────────────────────────────────
export function findDiagChain(input: string, kb: KnowledgeBaseData): string | null {
  const normalized = normalize(input)
  const words = normalized.split(/\s+/)

  for (const chain of kb.diagnosticChains) {
    const matchCount = chain.trigger.filter(t =>
      words.some(w => w.includes(t) || t.includes(w)) || normalized.includes(t)
    ).length
    if (matchCount >= 1) return chain.id
  }
  return null
}
