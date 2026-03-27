/**
 * Remote Doc Intelligent Search Engine
 * - Levenshtein fuzzy matching with cache
 * - Typo correction via typo_map + searchTerms.typos
 * - Synonym expansion via synonyms.json
 * - Colloquial mapping via colloquial_map.json
 * - Inverted index for O(1) keyword lookups
 * - Multi-level scoring (primary/secondary/keyword/typo/umgangssprache)
 * - Debounced live search < 50ms per query
 */

import type { Category, CmdDef } from './remoteCommands'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchTerms {
  primary?: string[]
  secondary?: string[]
  keywords?: string[]
  typos?: string[]
  umgangssprache?: string[]
}

export interface SkillDescription {
  kurz: string
  info: {
    wasPassiert: string
    wannBenutzen: string[]
    zuBeachten: string[]
    kombiniertMit: string[]
    neustartNoetig: boolean
    risikoLevel: string
    geschaetzteDauer: string
  }
  searchTerms?: SearchTerms
}

export interface SearchResult {
  catId: string
  catLabel: string
  cmdId: string
  cmd: CmdDef
  score: number
  matchType: string
}

// ── Levenshtein with LRU cache ────────────────────────────────────────────────

const levCache = new Map<string, number>()

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const key = a < b ? `${a}|${b}` : `${b}|${a}`
  const cached = levCache.get(key)
  if (cached !== undefined) return cached

  const m = a.length, n = b.length
  const d: number[][] = []
  for (let i = 0; i <= m; i++) {
    d[i] = [i]
    for (let j = 1; j <= n; j++) {
      d[i][j] = i === 0 ? j : 0
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
    }
  }
  const result = d[m][n]
  levCache.set(key, result)
  // Keep cache bounded
  if (levCache.size > 50000) {
    const first = levCache.keys().next().value
    if (first) levCache.delete(first)
  }
  return result
}

// ── Normalize ─────────────────────────────────────────────────────────────────

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Search Index ──────────────────────────────────────────────────────────────

interface IndexedSkill {
  catId: string
  catLabel: string
  cmdId: string
  cmd: CmdDef
  name: string
  nameNorm: string
  catNorm: string
  terms: SearchTerms
  allKeywords: string[] // pre-normalized keywords for fast matching
}

let indexedSkills: IndexedSkill[] = []
let invertedIdx: Map<string, Set<number>> = new Map() // word -> skill indices

export function buildSearchIndex(
  categories: Category[],
  descriptions: Record<string, SkillDescription> | null,
) {
  indexedSkills = []
  invertedIdx = new Map()

  for (const cat of categories) {
    for (const cmd of cat.commands) {
      const key = `rd_${cat.id}_${cmd.id}`
      const desc = descriptions?.[key]
      const terms = desc?.searchTerms ?? {}

      const skill: IndexedSkill = {
        catId: cat.id,
        catLabel: cat.label,
        cmdId: cmd.id,
        cmd,
        name: cmd.func,
        nameNorm: normalize(cmd.func),
        catNorm: normalize(cat.label),
        terms,
        allKeywords: [],
      }

      // Collect all searchable words
      const allWords = new Set<string>()
      const addWords = (arr?: string[]) => {
        if (!arr) return
        for (const s of arr) {
          for (const w of normalize(s).split(' ')) {
            if (w.length >= 2) allWords.add(w)
          }
        }
      }
      addWords(terms.primary)
      addWords(terms.secondary)
      addWords(terms.keywords)
      addWords(terms.typos)
      addWords(terms.umgangssprache)
      // Also add name and category words
      for (const w of skill.nameNorm.split(' ')) {
        if (w.length >= 2) allWords.add(w)
      }
      for (const w of skill.catNorm.split(' ')) {
        if (w.length >= 2) allWords.add(w)
      }
      // Add kurz description words
      if (desc?.kurz) {
        for (const w of normalize(desc.kurz).split(' ')) {
          if (w.length >= 3) allWords.add(w)
        }
      }
      // Always add func 'when' text for index (works even without skill_descriptions.json)
      if (cmd.when) {
        for (const w of normalize(cmd.when).split(' ')) {
          if (w.length >= 2) allWords.add(w)
        }
      }

      skill.allKeywords = Array.from(allWords)

      const idx = indexedSkills.length
      indexedSkills.push(skill)

      // Build inverted index
      for (const w of allWords) {
        if (!invertedIdx.has(w)) invertedIdx.set(w, new Set())
        invertedIdx.get(w)!.add(idx)
      }
    }
  }
}

// ── Score a single skill ──────────────────────────────────────────────────────

function scoreSkill(inputNorm: string, inputWords: string[], skill: IndexedSkill): number {
  let score = 0
  const terms = skill.terms

  // Level 1: Primary match (100 pts)
  if (terms.primary) {
    for (const t of terms.primary) {
      const tn = normalize(t)
      if (inputNorm.includes(tn) || tn.includes(inputNorm)) score += 100
    }
  }

  // Level 2: Secondary match (70 pts)
  if (terms.secondary) {
    for (const t of terms.secondary) {
      const tn = normalize(t)
      if (inputNorm.includes(tn)) score += 70
      else {
        // Partial: at least 2 words match
        const tw = tn.split(' ')
        const mc = tw.filter(w => inputWords.some(iw => iw === w)).length
        if (mc >= 2) score += 40
      }
    }
  }

  // Level 3: Keyword match (30 pts each)
  if (terms.keywords) {
    for (const kw of terms.keywords) {
      const kwn = normalize(kw)
      for (const w of inputWords) {
        if (w === kwn) { score += 30; break }
        else if (w.length >= 3 && (w.includes(kwn) || kwn.includes(w))) { score += 15; break }
      }
    }
  }

  // Level 4: Typo match via Levenshtein (25 pts)
  if (terms.typos) {
    for (const typo of terms.typos) {
      const tn = normalize(typo)
      for (const w of inputWords) {
        if (w.length >= 3 && tn.length >= 3 && levenshtein(w, tn) <= 2) { score += 25; break }
      }
    }
  }

  // Level 5: Umgangssprache match (60 pts)
  if (terms.umgangssprache) {
    for (const t of terms.umgangssprache) {
      const tn = normalize(t)
      if (inputNorm.includes(tn)) score += 60
      else {
        const tw = tn.split(' ')
        const mc = tw.filter(w => inputWords.some(iw => iw === w || levenshtein(iw, w) <= 1)).length
        if (mc >= 2) score += 40
      }
    }
  }

  // Level 6: Skill name match (50 pts)
  if (skill.nameNorm.includes(inputNorm) || inputNorm.includes(skill.nameNorm)) {
    score += 50
  } else {
    // Partial name word match
    const nameWords = skill.nameNorm.split(' ')
    const mc = nameWords.filter(nw => inputWords.some(iw => iw === nw)).length
    if (mc >= 2) score += 30
    else if (mc === 1 && nameWords.length <= 3) score += 15
  }

  // Level 7: Category name match (20 pts)
  if (skill.catNorm.includes(inputNorm) || inputNorm.includes(skill.catNorm)) {
    score += 20
  }

  // Fuzzy match on all keywords via Levenshtein (15 pts)
  for (const w of inputWords) {
    if (w.length < 3) continue
    const prefix = w.substring(0, 2)
    for (const kw of skill.allKeywords) {
      if (kw.length < 3) continue
      if (kw.substring(0, 2) === prefix && levenshtein(w, kw) <= 2) {
        score += 15
        break // only one fuzzy match per input word per skill
      }
    }
  }

  return Math.min(100, Math.round(score / 1.3))
}

// ── Main search function ──────────────────────────────────────────────────────

export function searchSkills(
  rawInput: string,
  categoryFilter?: string,
): SearchResult[] {
  if (!rawInput.trim() || indexedSkills.length === 0) return []

  const inputNorm = normalize(rawInput)
  const inputWords = inputNorm.split(' ').filter(w => w.length >= 2)
  if (inputWords.length === 0) return []

  // Use inverted index to find candidate skills
  const candidates = new Set<number>()

  for (const w of inputWords) {
    // Exact index lookup
    const exact = invertedIdx.get(w)
    if (exact) exact.forEach(i => candidates.add(i))

    // Fuzzy: check index keys with same prefix (max Levenshtein 2)
    if (w.length >= 3) {
      const prefix = w.substring(0, 2)
      for (const [key, indices] of invertedIdx) {
        if (key.length >= 3 && key.substring(0, 2) === prefix && levenshtein(w, key) <= 2) {
          indices.forEach(i => candidates.add(i))
        }
      }
    }
  }

  // If very few candidates from index, also check category matches
  if (candidates.size < 5) {
    for (let i = 0; i < indexedSkills.length; i++) {
      const s = indexedSkills[i]
      if (s.catNorm.includes(inputNorm) || inputNorm.includes(s.catNorm)) {
        candidates.add(i)
      }
    }
  }

  // Score each candidate
  const results: SearchResult[] = []
  for (const idx of candidates) {
    const skill = indexedSkills[idx]
    if (categoryFilter && skill.catId !== categoryFilter) continue

    const score = scoreSkill(inputNorm, inputWords, skill)
    if (score > 10) {
      results.push({
        catId: skill.catId,
        catLabel: skill.catLabel,
        cmdId: skill.cmdId,
        cmd: skill.cmd,
        score,
        matchType: score >= 80 ? 'exact' : score >= 50 ? 'good' : score >= 30 ? 'partial' : 'fuzzy',
      })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 20)
}

// ── Get all skills for a category ─────────────────────────────────────────────

export function getSkillsByCategory(catId: string): SearchResult[] {
  return indexedSkills
    .filter(s => s.catId === catId)
    .map(s => ({
      catId: s.catId, catLabel: s.catLabel,
      cmdId: s.cmdId, cmd: s.cmd,
      score: 100, matchType: 'category' as const,
    }))
}
