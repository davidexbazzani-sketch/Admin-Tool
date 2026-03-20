import { useState, useEffect, useCallback } from 'react'
import { Bug, Loader, RefreshCw, Send, X, ChevronRight } from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import type { BugReport } from '../types/auth'

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Fehler', improvement: 'Verbesserung', question: 'Frage', other: 'Sonstiges',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-orange-400', critical: 'text-red-400',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch',
}

const STATUS_OPTS = [
  { id: 'new',         label: 'Neu',           color: 'bg-blue-500/10 text-blue-400' },
  { id: 'in_progress', label: 'In Bearbeitung', color: 'bg-amber-500/10 text-amber-400' },
  { id: 'resolved',    label: 'Erledigt',       color: 'bg-emerald-500/10 text-emerald-400' },
]

export default function BugMailbox() {
  const session = useAuthStore(s => s.session)
  const user    = session?.user

  const [reports,  setReports]  = useState<BugReport[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<BugReport | null>(null)
  const [reply,    setReply]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api().netReadJson<BugReport[]>('bugs/reports.json')
      const all  = (data ?? []).sort((a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      )
      setReports(all)
      // Update selected if open
      if (selected) {
        setSelected(all.find(r => r.id === selected.id) ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadReports() }, [loadReports])

  async function saveReports(updated: BugReport[]) {
    await api().netWriteJson('bugs/reports.json', updated)
    setReports(updated)
  }

  async function openReport(r: BugReport) {
    setSelected(r)
    setReply('')
    if (!r.readByAdmin) {
      const updated = reports.map(x => x.id === r.id ? { ...x, readByAdmin: true } : x)
      await saveReports(updated)
      setSelected({ ...r, readByAdmin: true })
    }
  }

  async function changeStatus(status: BugReport['status']) {
    if (!selected) return
    const updated = reports.map(r => r.id === selected.id ? { ...r, status } : r)
    await saveReports(updated)
    setSelected({ ...selected, status })
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return
    setSending(true)
    try {
      const msg = {
        id: `msg-${Date.now()}`,
        authorId: user?.id ?? 'admin',
        authorDisplay: user?.displayName ?? 'Admin',
        text: reply.trim(),
        timestamp: new Date().toISOString(),
      }
      const updReport = { ...selected, conversation: [...selected.conversation, msg] }
      const updated   = reports.map(r => r.id === selected.id ? updReport : r)
      await saveReports(updated)
      setSelected(updReport)
      setReply('')
    } finally {
      setSending(false)
    }
  }

  const unreadCount = reports.filter(r => !r.readByAdmin && r.status !== 'resolved').length
  const filtered = filterStatus ? reports.filter(r => r.status === filterStatus) : reports

  return (
    <div className="flex h-full">
      {/* ── Inbox list ── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-border">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-border flex items-center gap-2 shrink-0">
          <Bug size={16} className="text-primary" />
          <span className="font-bold text-sm text-foreground">Bug-Meldungen</span>
          {unreadCount > 0 && (
            <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {unreadCount}
            </span>
          )}
          <button onClick={loadReports} title="Aktualisieren"
            className="p-1 rounded hover:bg-accent text-muted-foreground ml-1">
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Filter */}
        <div className="px-3 py-2 border-b border-border shrink-0 flex gap-1 flex-wrap">
          {[{ id: '', label: 'Alle' }, ...STATUS_OPTS].map(s => (
            <button key={s.id} onClick={() => setFilterStatus(s.id)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${filterStatus === s.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-8">
              <Loader size={12} className="animate-spin" /> Wird geladen…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">Keine Meldungen</div>
          ) : (
            filtered.map(r => {
              const statusMeta = STATUS_OPTS.find(s => s.id === r.status)
              return (
                <button key={r.id} onClick={() => openReport(r)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-accent/50 transition-colors ${selected?.id === r.id ? 'bg-accent' : ''}`}>
                  <div className="flex items-start gap-2">
                    {!r.readByAdmin && r.status !== 'resolved' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className={`text-[9px] font-medium ${PRIORITY_COLORS[r.priority]}`}>
                          {PRIORITY_LABELS[r.priority]}
                        </span>
                        <span className="text-[9px] text-muted-foreground">· {CATEGORY_LABELS[r.category]}</span>
                      </div>
                      <p className={`text-xs truncate ${!r.readByAdmin ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        {r.subject}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] text-muted-foreground truncate">{r.submittedByDisplay}</span>
                        <span className="text-[9px] text-muted-foreground/50 ml-auto shrink-0">
                          {new Date(r.submittedAt).toLocaleDateString('de-DE')}
                        </span>
                      </div>
                    </div>
                  </div>
                  {statusMeta && (
                    <span className={`inline-flex mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${statusMeta.color}`}>
                      {statusMeta.label}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Detail view ── */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Detail header */}
          <div className="shrink-0 px-5 py-3.5 border-b border-border flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm text-foreground truncate">{selected.subject}</h2>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                <span>von {selected.submittedByDisplay}</span>
                <span>·</span>
                <span>{new Date(selected.submittedAt).toLocaleString('de-DE')}</span>
                <span>·</span>
                <span>{selected.sourceHost}</span>
                <span>·</span>
                <span>{selected.currentScreen}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Status changer */}
              {STATUS_OPTS.map(s => (
                <button key={s.id} onClick={() => changeStatus(s.id as BugReport['status'])}
                  className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${selected.status === s.id ? `${s.color} border-current` : 'border-border text-muted-foreground hover:bg-accent'}`}>
                  {s.label}
                </button>
              ))}
              <button onClick={() => setSelected(null)} className="ml-1 p-1 rounded hover:bg-accent text-muted-foreground">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Meta badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_COLORS[selected.priority]} bg-current/10`}>
                {PRIORITY_LABELS[selected.priority]}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                {CATEGORY_LABELS[selected.category]}
              </span>
            </div>

            {/* Description */}
            <div className="p-4 rounded-lg bg-muted/20 border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Beschreibung</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{selected.description}</p>
            </div>

            {/* Screenshots */}
            {selected.screenshots.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-2">Screenshots ({selected.screenshots.length})</p>
                <div className="flex gap-2 flex-wrap">
                  {selected.screenshots.map((s, i) => (
                    <img key={i} src={`data:image/png;base64,${s}`} alt={`Screenshot ${i + 1}`}
                      className="h-28 rounded-md border border-border object-cover cursor-pointer hover:opacity-80"
                      onClick={() => window.open(`data:image/png;base64,${s}`, '_blank')} />
                  ))}
                </div>
              </div>
            )}

            {/* Conversation thread */}
            {selected.conversation.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-2">Konversation</p>
                <div className="space-y-2">
                  {selected.conversation.map(msg => (
                    <div key={msg.id} className="flex gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-[10px] font-bold text-muted-foreground">
                        {msg.authorDisplay[0]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[11px] font-medium text-foreground">{msg.authorDisplay}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(msg.timestamp).toLocaleString('de-DE')}</span>
                        </div>
                        <p className="text-xs text-foreground/90 mt-0.5 whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Reply box */}
          <div className="shrink-0 px-5 py-3 border-t border-border">
            <div className="flex gap-2">
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) sendReply() }}
                placeholder="Antwort schreiben… (Strg+Enter zum Senden)"
                rows={2}
                className="flex-1 px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary resize-none"
              />
              <button onClick={sendReply} disabled={!reply.trim() || sending}
                className="flex items-center gap-1 px-3 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed self-end">
                {sending ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="flex flex-col items-center gap-2 opacity-50">
            <ChevronRight size={24} />
            <p className="text-sm">Meldung auswählen</p>
          </div>
        </div>
      )}
    </div>
  )
}
