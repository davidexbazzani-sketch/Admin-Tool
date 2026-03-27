// ── Knowledge Base Types ──────────────────────────────────────────────────────

export interface KBProblem {
  id: string
  category: string
  title: string
  keywords: string[]
  extendedKeywords: string[]
  typos?: string[]
  symptoms: string[]
  quickCheck?: string
  decisionTree?: string
  playbook?: string
  skillMapping?: SkillMapping[]
  hiddenTriggers?: HiddenTrigger[]
  followUpQuestions?: FollowUpQuestion[]
  solutions: string[]
  relatedProblems?: string[]
}

export interface SkillMapping {
  skillId: string
  label: string
  priority: number
  effectiveness: number
}

export interface HiddenTrigger {
  condition: string
  message: string
  suggestProblem: string
}

export interface FollowUpQuestion {
  question: string
  options: string[]
  narrows: string
}

// ── Diagnosis Chain Types ─────────────────────────────────────────────────────

export interface DiagChain {
  id: string
  trigger: string[]
  requiresHostname: boolean
  checks: DiagCheck[]
  autoSuggest: Record<string, string>
}

export interface DiagCheck {
  order: number
  label: string
  skill?: string
  command?: string
  evaluate: string
}

// ── Playbook Types ────────────────────────────────────────────────────────────

export interface Playbook {
  id: string
  name: string
  category: string
  estimatedDuration: string
  requiresHostname: boolean
  requiresAdmin: boolean
  steps: PlaybookStep[]
}

export type PlaybookStepType = 'scan' | 'notify' | 'wait' | 'execute' | 'verify' | 'conditional'

export interface PlaybookStep {
  id: string
  type: PlaybookStepType
  label: string
  skill?: string
  command?: string
  successCondition?: string
  retryOnFail?: boolean
  abortOnFail?: boolean
  waitSeconds?: number
  message?: string
  condition?: string
  thenSteps?: string[]
  elseSteps?: string[]
}

export type PlaybookStepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped'

export interface PlaybookProgress {
  stepId: string
  status: PlaybookStepStatus
  output?: string
}

// ── Decision Tree Types ───────────────────────────────────────────────────────

export type TreeNodeType = 'question' | 'solution' | 'auto_detect'

export interface TreeNode {
  id: string
  type: TreeNodeType
  text: string
  options?: TreeOption[]
  solutions?: string[]
  playbook?: string
  skill?: string
  evaluate?: string
  thenNode?: string
  elseNode?: string
}

export interface TreeOption {
  label: string
  nextNode: string
}

export interface DecisionTree {
  id: string
  title: string
  startNode: string
  nodes: TreeNode[]
}

// ── Chat Message Types ────────────────────────────────────────────────────────

export type MessageType =
  | 'text'
  | 'buttons'
  | 'actionButton'
  | 'diagCard'
  | 'playbookCard'
  | 'playbookProgress'
  | 'playbookReport'
  | 'followUp'
  | 'typingIndicator'

export type DiagSeverity = 'ok' | 'warning' | 'critical'

export interface ChatMessage {
  id: string
  sender: 'user' | 'guru'
  type: MessageType
  text?: string
  timestamp: Date

  // buttons type
  buttons?: { label: string; value: string; icon?: string }[]

  // actionButton type
  actionLabel?: string
  actionSkillId?: string
  actionHostname?: string

  // diagCard type
  diagResults?: { label: string; status: DiagSeverity; detail: string }[]

  // playbookCard type
  playbookId?: string
  playbookName?: string

  // playbookProgress type
  playbookProgress?: PlaybookProgress[]

  // playbookReport type
  playbookReport?: { stepLabel: string; status: PlaybookStepStatus; output: string }[]
  reportExportable?: boolean

  // followUp type
  followUpQuestion?: string
  followUpOptions?: string[]
}

// ── Analysis Engine Types ─────────────────────────────────────────────────────

export interface AnalysisResult {
  problemId: string
  problem: KBProblem
  score: number
  matchDetails: string[]
}

export interface SessionMemory {
  problem: string
  triedSkills: string[]
  result: 'resolved' | 'unresolved' | 'in_progress'
}

// ── Knowledge Base Data ───────────────────────────────────────────────────────

export interface KnowledgeBaseData {
  version: string
  problems: KBProblem[]
  synonyms: Record<string, string[]>
  typoMap: Record<string, string>
  colloquialMap: Record<string, string>
  correlations: Correlation[]
  diagnosticChains: DiagChain[]
  decisionTrees: DecisionTree[]
  playbooks: Playbook[]
  answerTemplates: AnswerTemplates
  skillProblemMap: Record<string, { problems: string[]; use: string }>
}

export interface Correlation {
  symptoms: string[]
  min: number
  cause: string
  message: string
}

export interface AnswerTemplates {
  greeting: string[]
  problemFound: string[]
  diagRunning: string[]
  solutionFound: string[]
  playbookOffer: string[]
  solved: string[]
  followUp: string[]
  noResult: string[]
  noLust: string[]
}

// ── Loading State ─────────────────────────────────────────────────────────────

export interface GuruLoadingState {
  phase: string
  percent: number
  detail?: string
}
