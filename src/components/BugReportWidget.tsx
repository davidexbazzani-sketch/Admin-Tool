import { useState, useRef } from 'react'
import { Bug, X, Send, Loader, ChevronDown, Paperclip, Trash2 } from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import type { Screen } from '../types'
import type { BugReport } from '../types/auth'

interface Props {
  currentScreen: Screen
}

const CATEGORIES = [
  { id: 'bug',         label: 'Fehler/Bug' },
  { id: 'improvement', label: 'Verbesserungsvorschlag' },
  { id: 'question',    label: 'Frage' },
  { id: 'other',       label: 'Sonstiges' },
]

const PRIORITIES = [
  { id: 'low',      label: 'Niedrig',   color: 'text-emerald-400' },
  { id: 'medium',   label: 'Mittel',    color: 'text-amber-400' },
  { id: 'high',     label: 'Hoch',      color: 'text-orange-400' },
  { id: 'critical', label: 'Kritisch',  color: 'text-red-400' },
]

export default function BugReportWidget({ currentScreen }: Props) {
  const session = useAuthStore(s => s.session)
  const user    = session?.user

  const [open,       setOpen]       = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success,    setSuccess]    = useState(false)

  const [subject,     setSubject]     = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState<BugReport['category']>('bug')
  const [priority,    setPriority]    = useState<BugReport['priority']>('medium')
  const [screenshots, setScreenshots] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  function resetForm() {
    setSubject(''); setDescription(''); setCategory('bug'); setPriority('medium'); setScreenshots([])
    setSuccess(false)
  }

  function handleClose() {
    setOpen(false)
    setTimeout(resetForm, 300)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const results: string[] = []
    for (const file of Array.from(files)) {
      const reader = new FileReader()
      const b64: string = await new Promise(res => {
        reader.onload = ev => res((ev.target?.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
      results.push(b64)
    }
    setScreenshots(prev => [...prev, ...results])
    e.target.value = ''
  }

  async function handleSubmit() {
    if (!subject.trim() || !description.trim()) return
    setSubmitting(true)
    try {
      const hostname = await api().getHostname().catch(() => 'unknown')
      const existing = await api().netReadJson<BugReport[]>('bugs/reports.json') ?? []
      const report: BugReport = {
        id: `bug-${Date.now()}`,
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        status: 'new',
        submittedBy: user?.username ?? 'unknown',
        submittedByDisplay: user?.displayName ?? user?.username ?? 'unknown',
        submittedAt: new Date().toISOString(),
        sourceHost: hostname,
        currentScreen,
        screenshots,
        conversation: [],
        readByAdmin: false,
      }
      await api().netWriteJson('bugs/reports.json', [...existing, report])
      setSuccess(true)
    } finally {
      setSubmitting(false)
    }
  }

  const formValid = subject.trim() && description.trim()

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen(true); setSuccess(false) }}
        title="Fehler/Feedback melden"
        className="fixed bottom-5 right-5 z-40 w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 flex items-center justify-center transition-all hover:scale-105"
      >
        <Bug size={18} />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-5 pointer-events-none">
          <div className="pointer-events-auto w-[380px] bg-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[calc(100vh-40px)] animate-in slide-in-from-bottom-4 duration-200">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
              <Bug size={15} className="text-primary" />
              <span className="font-semibold text-sm text-foreground">Meldung senden</span>
              <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{currentScreen}</span>
              <button onClick={handleClose} className="ml-1 p-1 rounded hover:bg-accent text-muted-foreground">
                <X size={14} />
              </button>
            </div>

            {success ? (
              /* Success state */
              <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
                <p className="font-semibold text-foreground">Danke für deine Meldung!</p>
                <p className="text-xs text-muted-foreground">Dein Feedback wurde erfolgreich übermittelt und wird vom Administrator geprüft.</p>
                <button onClick={handleClose}
                  className="mt-2 px-4 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                  Schließen
                </button>
              </div>
            ) : (
              /* Form */
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Category + Priority */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-muted-foreground mb-1">Kategorie</label>
                    <div className="relative">
                      <select value={category} onChange={e => setCategory(e.target.value as BugReport['category'])}
                        className="w-full pl-2 pr-6 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary appearance-none">
                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-muted-foreground mb-1">Priorität</label>
                    <div className="relative">
                      <select value={priority} onChange={e => setPriority(e.target.value as BugReport['priority'])}
                        className="w-full pl-2 pr-6 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary appearance-none">
                        {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                      <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Betreff *</label>
                  <input value={subject} onChange={e => setSubject(e.target.value)}
                    placeholder="Kurze Beschreibung des Problems"
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Beschreibung *</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Beschreibe das Problem so detailliert wie möglich. Was hast du gemacht? Was ist passiert? Was hättest du erwartet?"
                    rows={5}
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary resize-none" />
                </div>

                {/* Screenshots */}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Screenshots (optional)</label>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md border border-dashed border-border hover:bg-accent text-muted-foreground w-full justify-center">
                    <Paperclip size={11} /> Screenshot hinzufügen
                  </button>
                  {screenshots.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {screenshots.map((s, i) => (
                        <div key={i} className="relative">
                          <img src={`data:image/png;base64,${s}`} alt="" className="w-16 h-16 object-cover rounded-md border border-border" />
                          <button onClick={() => setScreenshots(prev => prev.filter((_, j) => j !== i))}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center">
                            <Trash2 size={8} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Meta info */}
                <div className="p-2 rounded-md bg-muted/30 text-[10px] text-muted-foreground space-y-0.5">
                  <div>Benutzer: {user?.displayName ?? user?.username}</div>
                  <div>Bildschirm: {currentScreen}</div>
                </div>
              </div>
            )}

            {/* Footer */}
            {!success && (
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
                <button onClick={handleClose} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                  Abbrechen
                </button>
                <button onClick={handleSubmit} disabled={!formValid || submitting}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitting ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
                  Meldung senden
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
