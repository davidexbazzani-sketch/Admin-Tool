/**
 * Knowledge Base Loader — Lazy loading with RAM cache
 * Per Performance-Regeln: Erst laden wenn IT Guru geöffnet wird.
 * Zweites Öffnen = sofort aus Cache.
 */
import { api } from '../electronAPI'
import type {
  KnowledgeBaseData, KBProblem, AnswerTemplates,
  Correlation, DiagChain, DecisionTree, Playbook,
  GuruLoadingState,
} from '../types/guru'

let KB_SERVER_PATH = 'knowledge_base'

// Allow Settings to override the KB path
export function setKBPath(path: string) { KB_SERVER_PATH = path || 'knowledge_base' }
export function getKBPath(): string { return KB_SERVER_PATH }

// ── RAM Cache ─────────────────────────────────────────────────────────────────
let cachedKB: KnowledgeBaseData | null = null
let invertedIndex: Map<string, Set<string>> | null = null

export function getCachedKB(): KnowledgeBaseData | null { return cachedKB }
export function getIndex(): Map<string, Set<string>> | null { return invertedIndex }

// ── Load single JSON from network — tries multiple paths ──────────────────────
async function loadJson<T>(filename: string): Promise<T | null> {
  // Path 1: KB_SERVER_PATH/filename (e.g. knowledge_base/guru_brain.json)
  let data = await api().netReadJson<T>(`${KB_SERVER_PATH}/${filename}`)
  if (data) { console.log(`[GuruKB] Loaded: ${KB_SERVER_PATH}/${filename}`); return data }
  // Path 2: filename directly (if basePath already includes knowledge_base)
  data = await api().netReadJson<T>(filename)
  if (data) { console.log(`[GuruKB] Loaded: ${filename} (direct)`); return data }
  // Path 3: categories subfolder might be under KB path directly
  if (filename.startsWith('categories/')) {
    data = await api().netReadJson<T>(`${KB_SERVER_PATH}/${filename}`)
    if (data) return data
  }
  console.log(`[GuruKB] NOT FOUND: ${filename}`)
  return null
}

// ── Build inverted search index ───────────────────────────────────────────────
function buildIndex(problems: KBProblem[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>()

  function addToIndex(word: string, problemId: string) {
    const w = word.toLowerCase().trim()
    if (w.length < 2) return
    if (!idx.has(w)) idx.set(w, new Set())
    idx.get(w)!.add(problemId)
  }

  for (const p of problems) {
    for (const kw of p.keywords) {
      addToIndex(kw, p.id)
      // Also add individual words for multi-word keywords
      for (const w of kw.split(/\s+/)) addToIndex(w, p.id)
    }
    for (const ek of p.extendedKeywords) {
      for (const w of ek.split(/\s+/)) addToIndex(w, p.id)
    }
    if (p.typos) {
      for (const t of p.typos) addToIndex(t, p.id)
    }
    for (const s of p.symptoms) {
      for (const w of s.split(/\s+/)) addToIndex(w, p.id)
    }
    addToIndex(p.category, p.id)
    for (const w of p.title.split(/\s+/)) addToIndex(w, p.id)
  }

  return idx
}

// ── Main loader with progress callback ────────────────────────────────────────
export async function loadKnowledgeBase(
  onProgress: (state: GuruLoadingState) => void
): Promise<KnowledgeBaseData> {
  // Already cached? Return instantly
  if (cachedKB) return cachedKB

  onProgress({ phase: 'Wissensdatenbank laden...', percent: 0 })

  // Load all files in parallel
  const [
    indexData,
    synonymsRaw,
    typoMapRaw,
    colloquialMapRaw,
    correlationsRaw,
    chainsRaw,
    treesRaw,
    playbooksRaw,
    templatesRaw,
    skillMapRaw,
    versionRaw,
  ] = await Promise.all([
    loadJson<{ categories: string[]; totalProblems: number }>('index.json'),
    loadJson<Record<string, string[]>>('synonyms.json'),
    loadJson<Record<string, string>>('typo_map.json'),
    loadJson<Record<string, string>>('colloquial_map.json'),
    loadJson<Correlation[]>('correlations.json'),
    loadJson<DiagChain[]>('diagnostic_chains.json'),
    loadJson<DecisionTree[]>('decision_trees.json'),
    loadJson<Playbook[]>('playbooks.json'),
    loadJson<AnswerTemplates>('answer_templates.json'),
    loadJson<Record<string, { problems: string[]; use: string }>>('skill_problem_map.json'),
    loadJson<{ version: string }>('version.json'),
  ])

  onProgress({ phase: 'Kategorien laden...', percent: 30 })

  // Load category files
  const categories = indexData?.categories ?? ['windows_allgemein']
  const allProblems: KBProblem[] = []

  for (let i = 0; i < categories.length; i++) {
    const catName = categories[i]
    onProgress({
      phase: `Kategorie laden: ${catName}...`,
      percent: 30 + Math.round((i / categories.length) * 20),
    })
    const catProblems = await loadJson<KBProblem[]>(`categories/${catName}.json`)
    if (catProblems) allProblems.push(...catProblems)
  }

  // Also load guru_brain.json (try both names: guru_brain.json and guru_brain_starter.json)
  onProgress({ phase: 'Guru-Gehirn laden...', percent: 55 })
  type BrainEntry = { id: string; category: string; title: string; userSays: string[]; tags: string[]; erklaerung: string; skillChain: Array<{ skill: string; action: string }>; nachfragen: string[] }
  let brainRaw = await loadJson<{ problems: BrainEntry[] }>('guru_brain.json')
  if (!brainRaw?.problems) brainRaw = await loadJson<{ problems: BrainEntry[] }>('guru_brain_starter.json')
  if (brainRaw?.problems) {
    const existingIds = new Set(allProblems.map(p => p.id))
    for (const bp of brainRaw.problems) {
      if (existingIds.has(bp.id)) continue
      allProblems.push({
        id: bp.id,
        category: bp.category,
        title: bp.title,
        keywords: bp.tags ?? [],
        extendedKeywords: bp.userSays ?? [],
        symptoms: bp.nachfragen ?? [],
        solutions: [bp.erklaerung ?? ''],
        skillMapping: (bp.skillChain ?? []).map((sc, i) => ({
          skillId: sc.skill, label: sc.action, priority: i + 1, effectiveness: 80,
        })),
      })
    }
  }

  // Also load guru_requests.json (try both names)
  type ReqEntry = { id: string; category: string; title: string; userSays: string[]; tags: string[]; erklaerung: string; skillChain: Array<{ skill: string; action: string }>; nachfragen: string[] }
  let reqsRaw = await loadJson<{ requests: ReqEntry[] }>('guru_requests.json')
  if (!reqsRaw?.requests) reqsRaw = await loadJson<{ requests: ReqEntry[] }>('guru_requests_starter.json')
  if (reqsRaw?.requests) {
    const existingIds = new Set(allProblems.map(p => p.id))
    for (const rq of reqsRaw.requests) {
      if (existingIds.has(rq.id)) continue
      allProblems.push({
        id: rq.id,
        category: rq.category,
        title: rq.title,
        keywords: rq.tags ?? [],
        extendedKeywords: rq.userSays ?? [],
        symptoms: rq.nachfragen ?? [],
        solutions: [rq.erklaerung ?? ''],
        skillMapping: (rq.skillChain ?? []).map((sc, i) => ({
          skillId: sc.skill, label: sc.action, priority: i + 1, effectiveness: 80,
        })),
      })
    }
  }

  onProgress({ phase: 'Tippfehler-Engine...', percent: 65 })

  onProgress({ phase: 'Such-Index aufbauen...', percent: 75 })

  // Build inverted index
  invertedIndex = buildIndex(allProblems)

  onProgress({ phase: 'Diagnose-Ketten...', percent: 85 })

  const defaultTemplates: AnswerTemplates = {
    greeting: ['Hallo! Was kann ich für dich tun?'],
    problemFound: ['Da hab ich direkt eine Idee...'],
    diagRunning: ['Moment, ich schau mir das an...'],
    solutionFound: ['Hab was gefunden!'],
    playbookOffer: ['Soll ich das automatisch reparieren?'],
    solved: ['Super, das sollte es gewesen sein!'],
    followUp: ['Hilft dir das weiter?'],
    noResult: ['Da bin ich leider überfragt.'],
    noLust: ['Verstehe. Erstell am besten ein Ticket.'],
  }

  const kb: KnowledgeBaseData = {
    version: versionRaw?.version ?? '1.0.0',
    problems: allProblems,
    synonyms: synonymsRaw ?? {},
    typoMap: typoMapRaw ?? {},
    colloquialMap: colloquialMapRaw ?? {},
    correlations: correlationsRaw ?? [],
    diagnosticChains: chainsRaw ?? [],
    decisionTrees: treesRaw ?? [],
    playbooks: playbooksRaw ?? [],
    answerTemplates: templatesRaw ?? defaultTemplates,
    skillProblemMap: skillMapRaw ?? {},
  }

  cachedKB = kb

  onProgress({ phase: 'Bereit!', percent: 100 })

  return kb
}

// ── Evict cache (for memory pressure) ─────────────────────────────────────────
export function evictCache() {
  cachedKB = null
  invertedIndex = null
}
