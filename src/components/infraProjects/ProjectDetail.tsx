import { useEffect, useRef, useState } from 'react'
import {
  X, Plus, Paperclip, Download, Trash2, Pencil, Check, FileDown,
  CalendarClock, User as UserIcon, ChevronDown, AlertTriangle, RotateCcw,
  FileText, FileSpreadsheet, Image as ImageIcon, Loader2,
} from 'lucide-react'
import { api } from '../../electronAPI'
import {
  updateProject, setStatus, addEntry, deleteEntry, updateEntry, deleteProject,
  pickAndUploadAttachments, downloadAttachment, readAttachmentBase64,
  isImageAttachment, formatBytes,
  STATUS_LABEL, STATUS_COLORS, STATUS_ORDER,
  type InfraProject, type ProjectStatus, type Attachment, type ProjectEntry,
} from '../../services/infraProjects'
import { exportProject, type ExportFormat } from '../../services/infraProjectsExport'

interface Props {
  project: InfraProject
  currentUserName: string
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
}

function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function newFormId(): string {
  return `ent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export default function ProjectDetail({ project, currentUserName, onClose, onChanged, onDeleted }: Props) {
  // Editierbare Kopf-Felder (lokal; nur bei Projektwechsel neu seeden)
  const [title, setTitle] = useState(project.title)
  const [desc, setDesc] = useState(project.description ?? '')
  const [editHeader, setEditHeader] = useState(false)
  const [headerDirty, setHeaderDirty] = useState(false)

  const [statusOpen, setStatusOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Neuer Eintrag
  const [entryTitle, setEntryTitle] = useState('')
  const [entryBody, setEntryBody] = useState('')
  const [entryAuthor, setEntryAuthor] = useState(currentUserName)
  const [pending, setPending] = useState<Attachment[]>([])
  const formEntryId = useRef(newFormId())
  const [uploading, setUploading] = useState(false)

  // Bearbeiter-Vorschläge (App-Benutzer)
  const [userNames, setUserNames] = useState<string[]>([])

  // Bild-Lightbox
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null)
  const [lightboxLoading, setLightboxLoading] = useState(false)

  // Eintrag bearbeiten
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editEntryTitle, setEditEntryTitle] = useState('')
  const [editEntryBody, setEditEntryBody] = useState('')
  const [editEntryAuthor, setEditEntryAuthor] = useState('')

  const entriesEndRef = useRef<HTMLDivElement>(null)

  // Bei Projektwechsel Kopf-Felder neu seeden (nicht bei jedem Poll)
  useEffect(() => {
    setTitle(project.title)
    setDesc(project.description ?? '')
    setHeaderDirty(false)
    setEditHeader(false)
    setEntryAuthor(currentUserName)
    formEntryId.current = newFormId()
    setPending([])
    setEditingEntryId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  useEffect(() => {
    api().authGetUsers()
      .then(us => setUserNames(us.map(u => u.displayName || u.username).filter(Boolean)))
      .catch(() => {})
  }, [])

  // ESC schließt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null)
        else if (!busy) onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, lightbox, onClose])

  const c = STATUS_COLORS[project.status]
  const entries: ProjectEntry[] = [...project.entries].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))

  async function saveHeader() {
    if (!title.trim()) { setError('Der Projektname darf nicht leer sein.'); return }
    setBusy(true)
    const res = await updateProject(project.id, { title: title.trim(), description: desc.trim() })
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Speichern fehlgeschlagen.'); return }
    setHeaderDirty(false); setEditHeader(false); setError('')
    onChanged()
  }

  async function changeStatus(s: ProjectStatus) {
    setStatusOpen(false)
    if (s === project.status) return
    setBusy(true)
    const res = await setStatus(project.id, s)
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Status konnte nicht geändert werden.'); return }
    onChanged()
  }

  async function attachFiles() {
    setUploading(true)
    setError('')
    const author = (entryAuthor || currentUserName).trim()
    const res = await pickAndUploadAttachments(project.id, formEntryId.current, author)
    setUploading(false)
    if (!res.ok) { setError(res.error || 'Anhang fehlgeschlagen.'); }
    if (res.attachments.length) setPending(prev => [...prev, ...res.attachments])
  }

  async function submitEntry() {
    if (!entryTitle.trim() && !entryBody.trim()) { setError('Bitte Titel oder Text eingeben.'); return }
    setBusy(true)
    const res = await addEntry(project.id, {
      title: entryTitle.trim() || '(ohne Titel)',
      body: entryBody.trim(),
      author: (entryAuthor || currentUserName).trim(),
      attachments: pending,
    })
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Eintrag konnte nicht gespeichert werden.'); return }
    setEntryTitle(''); setEntryBody(''); setPending([]); formEntryId.current = newFormId(); setError('')
    onChanged()
    setTimeout(() => entriesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 200)
  }

  async function removePending(attId: string) {
    const att = pending.find(a => a.id === attId)
    setPending(prev => prev.filter(a => a.id !== attId))
    if (att) api().netDeleteFile(att.storedPath).catch(() => {})
  }

  async function onDeleteEntry(entryId: string) {
    setBusy(true)
    const res = await deleteEntry(project.id, entryId)
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Löschen fehlgeschlagen.'); return }
    onChanged()
  }

  function startEditEntry(e: ProjectEntry) {
    setEditingEntryId(e.id)
    setEditEntryTitle(e.title)
    setEditEntryBody(e.body)
    setEditEntryAuthor(e.author)
  }

  async function saveEditEntry() {
    if (!editingEntryId) return
    setBusy(true)
    const res = await updateEntry(project.id, editingEntryId, {
      title: editEntryTitle.trim() || '(ohne Titel)',
      body: editEntryBody.trim(),
      author: editEntryAuthor.trim(),
    })
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Speichern fehlgeschlagen.'); return }
    setEditingEntryId(null)
    onChanged()
  }

  async function openImage(att: Attachment) {
    setLightboxLoading(true)
    const b64 = await readAttachmentBase64(att)
    setLightboxLoading(false)
    if (b64) setLightbox({ src: `data:${att.mime || 'image/png'};base64,${b64}`, name: att.filename })
    else setError('Bild konnte nicht geladen werden.')
  }

  async function doExport(format: ExportFormat) {
    setExportOpen(false)
    setBusy(true)
    const res = await exportProject(project, format)
    setBusy(false)
    if (!res.ok && !res.cancelled) setError(res.error || 'Export fehlgeschlagen.')
  }

  async function onDeleteProject() {
    setBusy(true)
    const res = await deleteProject(project.id)
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Löschen fehlgeschlagen.'); return }
    onDeleted()
  }

  const isArchived = project.status === 'done'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => !busy && onClose()}>
      <div
        className="w-full max-w-2xl h-full bg-card border-l border-border shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Kopf */}
        <div className="shrink-0 border-b border-border" style={{ borderTopWidth: 3, borderTopColor: c.ring }}>
          <div className="flex items-start gap-2 px-5 pt-4">
            <div className="flex-1 min-w-0">
              {editHeader ? (
                <input
                  value={title}
                  autoFocus
                  onChange={e => { setTitle(e.target.value); setHeaderDirty(true) }}
                  className="w-full text-lg font-semibold bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <h2 className="text-lg font-semibold text-foreground leading-tight break-words">{project.title}</h2>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Erstellt {fmtDateTime(project.createdAt)} von {project.createdBy || '—'}
                {project.updatedAt && <> · zuletzt {fmtDateTime(project.updatedAt)}</>}
              </p>
            </div>

            {/* Status-Dropdown */}
            <div className="relative shrink-0">
              <button
                onClick={() => setStatusOpen(o => !o)}
                disabled={busy}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border ${c.badgeBg} ${c.badgeText} ${c.border}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {STATUS_LABEL[project.status]}
                <ChevronDown size={13} />
              </button>
              {statusOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-52 rounded-md border border-border bg-popover shadow-xl py-1">
                    {STATUS_ORDER.map(s => (
                      <button
                        key={s}
                        onClick={() => changeStatus(s)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/40 ${s === project.status ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s].dot}`} />
                        {STATUS_LABEL[s]}
                        {s === project.status && <Check size={13} className="ml-auto" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button onClick={onClose} className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-accent/40 hover:text-foreground" title="Schließen">
              <X size={18} />
            </button>
          </div>

          {/* Beschreibung + Aktionen */}
          <div className="px-5 pb-3 pt-2">
            {editHeader ? (
              <textarea
                value={desc}
                onChange={e => { setDesc(e.target.value); setHeaderDirty(true) }}
                rows={2}
                placeholder="Kurzbeschreibung…"
                className="w-full text-sm bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            ) : (
              project.description
                ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.description}</p>
                : <p className="text-xs text-muted-foreground/60 italic">Keine Beschreibung</p>
            )}

            <div className="flex items-center gap-2 mt-3">
              {editHeader ? (
                <>
                  <button onClick={saveHeader} disabled={busy || !headerDirty} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    <Check size={13} />Speichern
                  </button>
                  <button onClick={() => { setEditHeader(false); setTitle(project.title); setDesc(project.description ?? ''); setHeaderDirty(false) }} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
                </>
              ) : (
                <button onClick={() => setEditHeader(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border">
                  <Pencil size={12} />Projekt bearbeiten
                </button>
              )}

              {/* Export */}
              <div className="relative">
                <button onClick={() => setExportOpen(o => !o)} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border">
                  <FileDown size={13} />Exportieren<ChevronDown size={12} />
                </button>
                {exportOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                    <div className="absolute left-0 mt-1 z-20 w-40 rounded-md border border-border bg-popover shadow-xl py-1">
                      <button onClick={() => doExport('pdf')} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><FileText size={13} className="text-red-400" />Als PDF</button>
                      <button onClick={() => doExport('word')} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><FileText size={13} className="text-blue-400" />Als Word</button>
                      <button onClick={() => doExport('excel')} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><FileSpreadsheet size={13} className="text-emerald-400" />Als Excel</button>
                    </div>
                  </>
                )}
              </div>

              {isArchived && (
                <button onClick={() => changeStatus('in-progress')} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-amber-300 hover:bg-amber-500/10 border border-amber-500/40">
                  <RotateCcw size={12} />Reaktivieren
                </button>
              )}

              <div className="ml-auto">
                {confirmDelete ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[11px] text-red-300">Projekt löschen?</span>
                    <button onClick={onDeleteProject} disabled={busy} className="px-2 py-1 rounded-md text-[11px] bg-red-500/20 text-red-300 hover:bg-red-500/30">Ja, löschen</button>
                    <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-accent/40">Abbrechen</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-300 border border-border">
                    <Trash2 size={12} />Löschen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
            <AlertTriangle size={14} />{error}
          </div>
        )}

        {/* Einträge (chronologisch) */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verlauf · {entries.length} Einträge</h3>
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground/70 italic py-4 text-center">Noch keine Einträge. Erstelle unten den ersten Eintrag.</p>
          )}
          {entries.map((e, i) => (
            <div key={e.id} className="relative pl-5">
              {/* Timeline-Linie */}
              <div className="absolute left-1.5 top-1 bottom-0 w-px bg-border" style={{ display: i === entries.length - 1 ? 'none' : 'block' }} />
              <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-primary/70 border-2 border-card" />
              <div className="rounded-lg border border-border bg-background/40 p-3">
                {editingEntryId === e.id ? (
                  <div className="space-y-2">
                    <input value={editEntryTitle} onChange={ev => setEditEntryTitle(ev.target.value)} placeholder="Überschrift" className="w-full text-sm font-medium bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                    <textarea value={editEntryBody} onChange={ev => setEditEntryBody(ev.target.value)} rows={4} placeholder="Text" className="w-full text-sm bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y" />
                    <input value={editEntryAuthor} onChange={ev => setEditEntryAuthor(ev.target.value)} list="infra-users" placeholder="Bearbeiter" className="w-full text-xs bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                    <div className="flex items-center gap-2">
                      <button onClick={saveEditEntry} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"><Check size={12} />Speichern</button>
                      <button onClick={() => setEditingEntryId(null)} className="px-3 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <h4 className="flex-1 text-sm font-semibold text-foreground break-words">{e.title}</h4>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEditEntry(e)} className="p-1 rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground" title="Bearbeiten"><Pencil size={12} /></button>
                        <button onClick={() => onDeleteEntry(e.id)} className="p-1 rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-300" title="Eintrag löschen"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><CalendarClock size={11} />{fmtDateTime(e.createdAt)}</span>
                      <span className="inline-flex items-center gap-1"><UserIcon size={11} />{e.author || '—'}</span>
                    </div>
                    {e.body && <p className="text-sm text-foreground/90 whitespace-pre-wrap mt-2">{e.body}</p>}
                    {e.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {e.attachments.map(att => (
                          <div key={att.id} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-accent/30 border border-border text-[11px]">
                            {isImageAttachment(att) ? <ImageIcon size={12} className="text-purple-400 shrink-0" /> : <Paperclip size={12} className="text-muted-foreground shrink-0" />}
                            <button
                              onClick={() => isImageAttachment(att) ? openImage(att) : downloadAttachment(att)}
                              className="max-w-[160px] truncate text-foreground hover:underline"
                              title={att.filename}
                            >
                              {att.filename}
                            </button>
                            <span className="text-muted-foreground/60">{formatBytes(att.size)}</span>
                            <button onClick={() => downloadAttachment(att)} className="p-1 rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground" title="Herunterladen"><Download size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={entriesEndRef} />
        </div>

        {/* Neuer Eintrag */}
        <div className="shrink-0 border-t border-border bg-background/60 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Plus size={14} className="text-primary" />Neuer Eintrag
          </div>
          <input
            value={entryTitle}
            onChange={e => setEntryTitle(e.target.value)}
            placeholder="Überschrift"
            className="w-full text-sm bg-card border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <textarea
            value={entryBody}
            onChange={e => setEntryBody(e.target.value)}
            rows={3}
            placeholder="Was wurde gemacht / ist zu tun?"
            className="w-full text-sm bg-card border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <UserIcon size={14} className="text-muted-foreground shrink-0" />
              <input
                value={entryAuthor}
                onChange={e => setEntryAuthor(e.target.value)}
                list="infra-users"
                placeholder="Bearbeiter"
                className="flex-1 text-xs bg-card border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              onClick={attachFiles}
              disabled={uploading}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
              Datei anhängen
            </button>
            <button
              onClick={submitEntry}
              disabled={busy || uploading || (!entryTitle.trim() && !entryBody.trim())}
              className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus size={14} />Hinzufügen
            </button>
          </div>
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {pending.map(att => (
                <div key={att.id} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-primary/10 border border-primary/30 text-[11px]">
                  <Paperclip size={11} className="text-primary shrink-0" />
                  <span className="max-w-[160px] truncate text-foreground">{att.filename}</span>
                  <span className="text-muted-foreground/60">{formatBytes(att.size)}</span>
                  <button onClick={() => removePending(att.id)} className="p-0.5 rounded text-muted-foreground hover:text-red-300" title="Entfernen"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <datalist id="infra-users">
          {userNames.map(n => <option key={n} value={n} />)}
        </datalist>
      </div>

      {/* Bild-Lightbox */}
      {(lightbox || lightboxLoading) && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          {lightboxLoading ? (
            <Loader2 size={32} className="text-white animate-spin" />
          ) : lightbox ? (
            <div className="flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
              <img src={lightbox.src} alt={lightbox.name} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
              <span className="text-white/80 text-xs">{lightbox.name}</span>
              <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"><X size={20} /></button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
