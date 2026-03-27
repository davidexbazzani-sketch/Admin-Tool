import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Lightbulb, Send, Loader, RefreshCw, CheckCircle, XCircle,
  AlertTriangle, Play, X, Download, ChevronDown,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../electronAPI'
import { CATEGORIES } from '../utils/remoteCommands'
import { loadKnowledgeBase, getCachedKB } from '../utils/guruKnowledgeBase'
import { analyze, pickTemplate, findDiagChain } from '../utils/guruEngine'
import { createPlaybookRunner } from '../utils/guruPlaybook'
import type {
  ChatMessage, GuruLoadingState, KnowledgeBaseData,
  SessionMemory, AnalysisResult, PlaybookProgress, DiagSeverity,
} from '../types/guru'

// ── Loading Screen ────────────────────────────────────────────────────────────
function LoadingScreen({ state }: { state: GuruLoadingState }) {
  const facts = [
    'Der IT Guru kennt über 2000 verschiedene IT-Probleme und Anforderungen.',
    'Tipp: Beschreibe dein Problem so, wie du es einem Kollegen erzählen würdest.',
    'Wenn du den Hostnamen angibst, kann der Guru den PC direkt untersuchen.',
    'Der IT Guru versteht auch Tippfehler und Umgangssprache.',
    'Playbooks können komplexe Reparaturen automatisch durchführen.',
    'Der Such-Index wird beim ersten Start aufgebaut — danach ist die Suche blitzschnell.',
  ]
  const [fact] = useState(() => facts[Math.floor(Math.random() * facts.length)])

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-[400px] text-center space-y-6">
        <div className="text-5xl animate-pulse">🧠</div>
        <h2 className="text-lg font-semibold text-foreground">IT Guru wird geladen...</h2>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${state.percent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{state.phase}</p>
        <p className="text-[11px] text-muted-foreground/60 italic px-8">💡 {fact}</p>
      </div>
    </div>
  )
}

// ── Diag Card ─────────────────────────────────────────────────────────────────
function DiagCard({ results }: { results: { label: string; status: DiagSeverity; detail: string }[] }) {
  const colors: Record<DiagSeverity, string> = {
    ok: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
    warning: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    critical: 'border-red-500/30 bg-red-500/5 text-red-400',
  }
  const icons: Record<DiagSeverity, React.ReactNode> = {
    ok: <CheckCircle size={13} />,
    warning: <AlertTriangle size={13} />,
    critical: <XCircle size={13} />,
  }

  return (
    <div className="space-y-1 mt-1">
      {results.map((r, i) => (
        <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${colors[r.status]}`}>
          {icons[r.status]}
          <span className="font-medium">{r.label}</span>
          <span className="ml-auto text-[10px] opacity-80">{r.detail}</span>
        </div>
      ))}
    </div>
  )
}

// ── Playbook Progress Display ─────────────────────────────────────────────────
function PlaybookProgressView({ progress }: { progress: PlaybookProgress[] }) {
  const statusIcons: Record<string, React.ReactNode> = {
    pending: <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />,
    running: <Loader size={12} className="animate-spin text-blue-400" />,
    success: <CheckCircle size={12} className="text-emerald-400" />,
    warning: <AlertTriangle size={12} className="text-amber-400" />,
    error: <XCircle size={12} className="text-red-400" />,
    skipped: <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />,
  }

  return (
    <div className="space-y-1 mt-1">
      {progress.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {statusIcons[p.status] ?? statusIcons.pending}
          <span className={`flex-1 ${p.status === 'running' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            Schritt {i + 1}
          </span>
          {p.output && <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{p.output}</span>}
        </div>
      ))}
    </div>
  )
}

// ── Chat Bubble ───────────────────────────────────────────────────────────────
function ChatBubble({
  msg,
  onButtonClick,
  onPlaybookStart,
}: {
  msg: ChatMessage
  onButtonClick?: (value: string) => void
  onPlaybookStart?: (playbookId: string) => void
}) {
  const isUser = msg.sender === 'user'

  if (msg.type === 'typingIndicator') {
    return (
      <div className="flex justify-start mb-3">
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted/30 border border-border">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] ${isUser ? '' : 'flex gap-2'}`}>
        {/* Guru avatar */}
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Lightbulb size={14} className="text-primary" />
          </div>
        )}

        <div>
          <div className={`px-4 py-2.5 rounded-2xl text-sm ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted/30 border border-border text-foreground rounded-bl-md'
          }`}>
            {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

            {/* Buttons */}
            {msg.type === 'buttons' && msg.buttons && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {msg.buttons.map((b, i) => (
                  <button key={i} onClick={() => onButtonClick?.(b.value)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-background border border-border hover:bg-accent text-foreground transition-colors">
                    {b.label}
                  </button>
                ))}
              </div>
            )}

            {/* Action button */}
            {msg.type === 'actionButton' && msg.actionLabel && (
              <button onClick={() => onButtonClick?.(msg.actionSkillId ?? '')}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20">
                <Play size={11} /> {msg.actionLabel}
              </button>
            )}

            {/* Diag card */}
            {msg.type === 'diagCard' && msg.diagResults && (
              <DiagCard results={msg.diagResults} />
            )}

            {/* Playbook card */}
            {msg.type === 'playbookCard' && msg.playbookId && (
              <div className="mt-2">
                <button onClick={() => onPlaybookStart?.(msg.playbookId!)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20">
                  <Play size={11} /> {msg.playbookName ?? 'Playbook starten'}
                </button>
              </div>
            )}

            {/* Playbook progress */}
            {msg.type === 'playbookProgress' && msg.playbookProgress && (
              <PlaybookProgressView progress={msg.playbookProgress} />
            )}

            {/* Playbook report */}
            {msg.type === 'playbookReport' && msg.playbookReport && (
              <div className="mt-1 space-y-1">
                {msg.playbookReport.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {r.status === 'success' ? <CheckCircle size={11} className="text-emerald-400" />
                      : r.status === 'error' ? <XCircle size={11} className="text-red-400" />
                      : <AlertTriangle size={11} className="text-amber-400" />}
                    <span>{r.stepLabel}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{r.output?.slice(0, 60)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Follow-up */}
            {msg.type === 'followUp' && msg.followUpOptions && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {msg.followUpOptions.map((opt, i) => (
                  <button key={i} onClick={() => onButtonClick?.(opt)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-background border border-border hover:bg-accent text-foreground transition-colors">
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className={`text-[9px] text-muted-foreground/50 mt-0.5 ${isUser ? 'text-right' : 'text-left'}`}>
            {msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main IT Guru Component ────────────────────────────────────────────────────
export default function ITGuru() {
  const user = useAuthStore(s => s.session?.user)
  const displayName = user?.displayName?.split(' ')[0] ?? user?.username ?? 'User'

  // Loading state
  const [loadingState, setLoadingState] = useState<GuruLoadingState | null>(
    getCachedKB() ? null : { phase: 'Initialisiere...', percent: 0 }
  )
  const [kb, setKb] = useState<KnowledgeBaseData | null>(getCachedKB())

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [hostname, setHostname] = useState('')
  const [session, setSession] = useState<SessionMemory[]>([])
  const [thinking, setThinking] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  // ── Load KB on first render ─────────────────────────────────────────────────
  useEffect(() => {
    if (kb) return
    let cancelled = false
    loadKnowledgeBase((state) => {
      if (!cancelled) setLoadingState(state)
    }).then((loaded) => {
      if (!cancelled) {
        setKb(loaded)
        setLoadingState(null)
      }
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line

  // ── Send greeting when KB loaded ────────────────────────────────────────────
  useEffect(() => {
    if (kb && messages.length === 0) {
      const greeting = pickTemplate(kb.answerTemplates.greeting, { name: displayName })
      addGuruMessage(greeting)
    }
  }, [kb]) // eslint-disable-line

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function addGuruMessage(text: string, extra: Partial<ChatMessage> = {}) {
    const msg: ChatMessage = {
      id: `guru-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      sender: 'guru',
      type: 'text',
      text,
      timestamp: new Date(),
      ...extra,
    }
    setMessages(prev => [...prev, msg])
    return msg
  }

  function addUserMessage(text: string) {
    const msg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      type: 'text',
      text,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, msg])
    return msg
  }

  // ── Handle user input ───────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || !kb) return

    setInput('')
    addUserMessage(text)
    setThinking(true)

    // Small delay for natural feel
    await new Promise(r => setTimeout(r, 400 + Math.random() * 400))

    // Run analysis
    const inputWords = text.toLowerCase().split(/\s+/).filter(w => w.length >= 2)
    const { results, typoFixes, colloquialMatches, correlation, contexts } = analyze(text, kb, session)

    // Show typo corrections
    if (typoFixes.length > 0) {
      addGuruMessage(`🔤 Korrektur: ${typoFixes.join(', ')}`)
      await new Promise(r => setTimeout(r, 300))
    }

    // Show correlation
    if (correlation) {
      addGuruMessage(`💡 ${correlation.message}`)
      await new Promise(r => setTimeout(r, 300))
    }

    if (results.length > 0) {
      const top = results[0]

      // ── INTELLIGENT RESPONSE: If multiple results with different categories, ask first ──
      const uniqueCategories = [...new Set(results.slice(0, 5).map(r => r.problem.category))]
      const isVagueQuery = inputWords.length <= 2 && results.length >= 3 && uniqueCategories.length >= 2

      if (isVagueQuery) {
        // Vague query → ask clarifying question with category buttons
        addGuruMessage('Was genau ist das Problem? Bitte grenze es ein:')
        const catButtons = uniqueCategories.slice(0, 6).map(cat => ({
          label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' '),
          value: `cat::${cat}`,
        }))
        catButtons.push({ label: 'Sonstiges', value: text })
        addGuruMessage('', { type: 'buttons', buttons: catButtons })
      } else {
        // Specific enough → show structured solution
        const foundText = pickTemplate(kb.answerTemplates.problemFound, {
          kategorie: top.problem.category,
          detail: top.problem.title,
        })
        addGuruMessage(foundText)
        await new Promise(r => setTimeout(r, 300))

        // Show solutions STRUCTURED (not in one line!)
        if (top.problem.solutions.length > 0) {
          const formatted = top.problem.solutions.map((s, i) => {
            // If solution is already multi-line or has structure, keep as is
            if (s.includes('\n') || s.length > 100) return `**Schritt ${i + 1}:**\n${s}`
            return `**Schritt ${i + 1}:** ${s}`
          }).join('\n\n')
          addGuruMessage(formatted)
        }

        // Offer skills
        if (top.problem.skillMapping && top.problem.skillMapping.length > 0 && hostname) {
          const skillButtons = top.problem.skillMapping.slice(0, 3).map(sm => ({
            label: `▶ ${sm.label}`,
            value: `skill::${sm.skillId}`,
          }))
          addGuruMessage('Soll ich einen dieser Schritte auf dem PC ausführen?', {
            type: 'buttons',
            buttons: skillButtons,
          })
        }

        // Offer playbook
        if (top.problem.playbook && hostname) {
          const pb = kb.playbooks.find(p => p.id === top.problem.playbook)
          if (pb) {
            addGuruMessage(pickTemplate(kb.answerTemplates.playbookOffer, { steps: String(pb.steps.length) }), {
              type: 'playbookCard', playbookId: pb.id, playbookName: pb.name,
            })
          }
        }

        // Follow-up: If the problem has specific follow-up questions, show them
        if (top.problem.followUpQuestions && top.problem.followUpQuestions.length > 0) {
          const fq = top.problem.followUpQuestions[0]
          addGuruMessage(fq.question, { type: 'followUp', followUpQuestion: fq.question, followUpOptions: fq.options })
        } else {
          addGuruMessage('', {
            type: 'followUp',
            followUpQuestion: 'Hat dir das weitergeholfen?',
            followUpOptions: ['Ja, danke!', 'Nein, anderes Problem', 'Hab ich schon probiert'],
          })
        }
      }

      setSession(prev => [...prev, { problem: top.problemId, triedSkills: [], result: 'in_progress' }])

    } else if (results.length === 0) {
      // No results
      const noResultText = pickTemplate(kb.answerTemplates.noResult, { name: displayName })
      addGuruMessage(noResultText)
      addGuruMessage('', {
        type: 'followUp',
        followUpQuestion: 'Kannst du das Problem genauer beschreiben?',
        followUpOptions: ['Neuer Versuch', 'Ticket erstellen'],
      })
    }

    setThinking(false)
  }, [input, kb, hostname, session, displayName])

  // ── Handle button clicks ────────────────────────────────────────────────────
  async function handleButtonClick(value: string) {
    if (!kb) return

    // Category narrowing — user picked a category from clarification buttons
    if (value.startsWith('cat::')) {
      const cat = value.replace('cat::', '')
      addUserMessage(cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' '))
      // Re-search within this category
      const { results } = analyze(cat, kb, session)
      if (results.length > 0) {
        // Show the specific problems in this category as buttons
        const problemButtons = results.slice(0, 5).map(r => ({
          label: r.problem.title,
          value: `problem::${r.problemId}`,
        }))
        addGuruMessage(`Was genau bei ${cat.replace(/_/g, ' ')}?`, { type: 'buttons', buttons: problemButtons })
      }
      return
    }

    // Specific problem selected
    if (value.startsWith('problem::')) {
      const pid = value.replace('problem::', '')
      const problem = kb.problems.find(p => p.id === pid)
      if (problem) {
        addUserMessage(problem.title)
        addGuruMessage(pickTemplate(kb.answerTemplates.solutionFound, { detail: problem.title }))
        if (problem.solutions.length > 0) {
          const formatted = problem.solutions.map((s, i) =>
            `**Schritt ${i + 1}:** ${s}`
          ).join('\n\n')
          addGuruMessage(formatted)
        }
        if (problem.skillMapping && problem.skillMapping.length > 0 && hostname) {
          const skillButtons = problem.skillMapping.slice(0, 3).map(sm => ({
            label: `▶ ${sm.label}`, value: `skill::${sm.skillId}`,
          }))
          addGuruMessage('Soll ich das auf dem PC ausführen?', { type: 'buttons', buttons: skillButtons })
        }
        addGuruMessage('', { type: 'followUp', followUpQuestion: 'Hat das geholfen?', followUpOptions: ['Ja, danke!', 'Nein, anderes Problem'] })
      }
      return
    }

    if (value.startsWith('skill::')) {
      const skillId = value.replace('skill::', '')
      if (!hostname) {
        addGuruMessage('Bitte gib oben rechts einen Hostnamen ein, damit ich den Befehl ausführen kann.')
        return
      }
      addUserMessage(`Führe "${skillId}" auf ${hostname} aus`)
      addGuruMessage(pickTemplate(kb.answerTemplates.diagRunning, { hostname }))

      // Find the skill command in CATEGORIES (rd_{catId}_{cmdId})
      const parts = skillId.replace(/^rd_/, '').split('_')
      let foundCmd: { buildCmd: (h: string, i?: string) => string; func: string; local?: boolean } | null = null
      // Try matching catId_cmdId with increasing catId length
      for (let splitAt = 1; splitAt < parts.length; splitAt++) {
        const catId = parts.slice(0, splitAt).join('_')
        const cmdId = parts.slice(splitAt).join('_')
        const cat = CATEGORIES.find(c => c.id === catId)
        if (cat) {
          const cmd = cat.commands.find(c => c.id === cmdId)
          if (cmd) { foundCmd = cmd; break }
        }
      }

      if (foundCmd) {
        try {
          const psCmd = foundCmd.buildCmd(hostname)
          const res = await api().runPowerShell(psCmd, 30000)
          const output = res.stdout?.trim() || res.stderr?.trim() || 'Kein Output'
          if (output.startsWith('ERR:') || res.stderr) {
            addGuruMessage(`❌ Fehler bei "${foundCmd.func}":\n\`\`\`\n${output}\n\`\`\``)
          } else {
            addGuruMessage(`✅ "${foundCmd.func}" auf ${hostname} ausgeführt:\n\`\`\`\n${output.slice(0, 1000)}\n\`\`\``)
          }
        } catch (err) {
          addGuruMessage(`❌ Fehler: ${String(err)}`)
        }
      } else {
        addGuruMessage(`Der Skill "${skillId}" ist nicht als Remote-Doc-Befehl verfügbar. Bitte führe ihn manuell im Remote Doc aus.`)
      }

      addGuruMessage('', {
        type: 'followUp',
        followUpQuestion: 'Hat das geholfen?',
        followUpOptions: ['Ja, danke!', 'Nächster Schritt', 'Nein, anderes Problem'],
      })
      return
    }

    if (value === 'Ja, danke!' || value === 'Ja') {
      const solvedText = pickTemplate(kb.answerTemplates.solved, { name: displayName })
      addGuruMessage(solvedText)
      return
    }

    if (value === 'Hab ich schon probiert' || value === 'Nein, anderes Problem') {
      addGuruMessage('Okay, beschreib mal genauer was das Problem ist — oder versuch es mit anderen Worten.')
      return
    }

    if (value === 'Ticket erstellen') {
      addGuruMessage('Erstell am besten ein Ticket. Tipp: Davide hilft dir gerne weiter! 😄')
      return
    }

    // Generic — treat as user input
    addUserMessage(value)
    setInput(value)
    // Re-trigger analysis
    setTimeout(() => {
      setInput('')
      handleSend()
    }, 100)
  }

  // ── Handle playbook start ───────────────────────────────────────────────────
  async function handlePlaybookStart(playbookId: string) {
    if (!kb || !hostname) {
      addGuruMessage('Bitte gib einen Hostnamen ein, bevor du ein Playbook startest.')
      return
    }

    const playbook = kb.playbooks.find(p => p.id === playbookId)
    if (!playbook) {
      addGuruMessage('Playbook nicht gefunden.')
      return
    }

    addUserMessage(`Starte Playbook: ${playbook.name}`)
    addGuruMessage(`▶ Playbook "${playbook.name}" wird ausgeführt (${playbook.steps.length} Schritte)...`)

    // Create progress message
    const progressMsg: ChatMessage = {
      id: `pb-progress-${Date.now()}`,
      sender: 'guru',
      type: 'playbookProgress',
      timestamp: new Date(),
      playbookProgress: playbook.steps.map(s => ({ stepId: s.id, status: 'pending' as const })),
    }
    setMessages(prev => [...prev, progressMsg])

    const runner = createPlaybookRunner(playbook, hostname, (progress) => {
      setMessages(prev =>
        prev.map(m => m.id === progressMsg.id ? { ...m, playbookProgress: progress } : m)
      )
    })

    const finalProgress = await runner.start()

    // Add report
    const report = finalProgress.map((p, i) => ({
      stepLabel: playbook.steps[i]?.label ?? `Schritt ${i + 1}`,
      status: p.status,
      output: p.output ?? '',
    }))
    addGuruMessage('Playbook abgeschlossen!', {
      type: 'playbookReport',
      playbookReport: report,
      reportExportable: true,
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loadingState) {
    return (
      <div className="flex flex-col h-full">
        <LoadingScreen state={loadingState} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <Lightbulb size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">IT Guru</h1>

        {/* Hostname field */}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground">Hostname (optional):</label>
          <input
            value={hostname}
            onChange={e => setHostname(e.target.value.toUpperCase())}
            placeholder="z.B. DEHAM12345"
            className="w-40 px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono"
          />
          <button onClick={() => { setMessages([]); setSession([]) }}
            title="Neues Gespräch" className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.map(msg => (
          <ChatBubble
            key={msg.id}
            msg={msg}
            onButtonClick={handleButtonClick}
            onPlaybookStart={handlePlaybookStart}
          />
        ))}

        {/* Typing indicator */}
        {thinking && (
          <ChatBubble
            msg={{
              id: 'typing',
              sender: 'guru',
              type: 'typingIndicator',
              timestamp: new Date(),
            }}
          />
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-6 py-3 border-t border-border">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Beschreibe dein Problem..."
            className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:border-primary"
            disabled={!kb}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !kb || thinking}
            className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {thinking ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[9px] text-muted-foreground/50 mt-1 text-center">
          Enter zum Senden • Hostname eintragen für Remote-Diagnose
        </p>
      </div>
    </div>
  )
}
