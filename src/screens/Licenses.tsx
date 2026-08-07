import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock, Plus, Pencil, Trash2, Mail, Bell, BellOff, RefreshCw,
  AlertTriangle, Loader2, X, Check, Search, ChevronDown, Info,
  Paperclip, Clipboard, Image as ImageIcon, Download, FileText,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../electronAPI'
import {
  listLicenses, createLicense, updateLicense, deleteLicense, daysUntil,
  formatGermanDate, NOTIFY_DAY_OPTIONS, generateLicenseId,
  uploadAttachmentFile, uploadAttachmentBase64, downloadLicenseAttachment,
  readLicenseAttachmentBase64, deleteAttachmentFile, isImageAttachment, formatBytes,
  type License, type LicenseAttachment,
} from '../services/licenses'

const POLL_MS = 30000

function urgencyClass(days: number): { row: string; pill: string; label: string } {
  if (isNaN(days)) return { row: 'border-border', pill: 'bg-muted-foreground/15 text-muted-foreground', label: '—' }
  if (days < 0) return { row: 'border-red-600/60', pill: 'bg-red-600/30 text-red-100', label: `${Math.abs(days)} Tage überfällig` }
  if (days <= 10) return { row: 'border-red-500/60', pill: 'bg-red-500/25 text-red-100', label: `${days} Tage` }
  if (days <= 30) return { row: 'border-amber-500/50', pill: 'bg-amber-500/25 text-amber-100', label: `${days} Tage` }
  if (days <= 60) return { row: 'border-yellow-500/40', pill: 'bg-yellow-500/20 text-yellow-100', label: `${days} Tage` }
  return { row: 'border-emerald-500/30', pill: 'bg-emerald-500 text-black', label: `${days} Tage` }
}

interface EditFormState {
  /** Stabile ID — bei "Neu" vorab generiert, damit Anhänge unter dem richtigen
   *  Pfad hochgeladen werden können, bevor die Lizenz im Store existiert. */
  id: string
  isNew: boolean
  name: string
  expiryDate: string
  comment1: string
  comment2: string
  notifyEmail: string
  notifyDays: number[]
  autoEmail30Days: boolean
  attachments: LicenseAttachment[]
}

function makeNewForm(): EditFormState {
  return {
    id: generateLicenseId(), isNew: true,
    name: '', expiryDate: '', comment1: '', comment2: '',
    notifyEmail: '', notifyDays: [], autoEmail30Days: true,
    attachments: [],
  }
}

export default function Licenses() {
  const user = useAuthStore(s => s.session?.user)
  const currentUserName = user?.displayName || user?.username || ''

  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const [editing, setEditing] = useState<EditFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const reload = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const list = await listLicenses()
      setLicenses(list)
      setError('')
    } catch {
      setError('Lizenzen konnten nicht geladen werden. Netzlaufwerk erreichbar?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload(true) }, [reload])

  useEffect(() => {
    const t = setInterval(() => reload(false), POLL_MS)
    const onFocus = () => reload(false)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [reload])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return licenses.filter(l => {
      const days = daysUntil(l.expiryDate)
      const archived = !isNaN(days) && days < -60
      if (archived !== showArchived) return false
      if (!q) return true
      return l.name.toLowerCase().includes(q)
        || l.comment1.toLowerCase().includes(q)
        || l.comment2.toLowerCase().includes(q)
        || l.notifyEmail.toLowerCase().includes(q)
    })
  }, [licenses, search, showArchived])

  const stats = useMemo(() => {
    let critical = 0, warn = 0, ok = 0, expired = 0
    for (const l of licenses) {
      const d = daysUntil(l.expiryDate)
      if (isNaN(d)) continue
      if (d < 0) expired++
      else if (d <= 10) critical++
      else if (d <= 30) warn++
      else ok++
    }
    return { critical, warn, ok, expired }
  }, [licenses])

  function startCreate() {
    setEditing(makeNewForm())
  }
  function startEdit(l: License) {
    setEditing({
      id: l.id, isNew: false,
      name: l.name, expiryDate: l.expiryDate,
      comment1: l.comment1, comment2: l.comment2,
      notifyEmail: l.notifyEmail, notifyDays: [...l.notifyDays],
      autoEmail30Days: l.autoEmail30Days,
      attachments: [...(l.attachments || [])],
    })
  }

  async function handleSave() {
    if (!editing) return
    if (!editing.name.trim()) { setError('Bitte einen Namen angeben.'); return }
    if (!editing.expiryDate) { setError('Bitte ein Ablaufdatum angeben.'); return }
    setSaving(true); setError('')
    try {
      const sorted = [...editing.notifyDays].sort((a, b) => b - a)
      if (!editing.isNew) {
        const r = await updateLicense(editing.id, {
          name: editing.name.trim(), expiryDate: editing.expiryDate,
          comment1: editing.comment1.trim(), comment2: editing.comment2.trim(),
          notifyEmail: editing.notifyEmail.trim(), notifyDays: sorted,
          autoEmail30Days: editing.autoEmail30Days,
          attachments: editing.attachments,
        })
        if (!r.ok) { setError(r.error || 'Speichern fehlgeschlagen.'); setSaving(false); return }
      } else {
        const r = await createLicense({
          id: editing.id,
          name: editing.name.trim(), expiryDate: editing.expiryDate,
          comment1: editing.comment1.trim(), comment2: editing.comment2.trim(),
          notifyEmail: editing.notifyEmail.trim(), notifyDays: sorted,
          autoEmail30Days: editing.autoEmail30Days,
          attachments: editing.attachments,
          createdBy: currentUserName,
        })
        if (!r.ok) { setError(r.error || 'Speichern fehlgeschlagen.'); setSaving(false); return }
      }
      setEditing(null)
      await reload(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const r = await deleteLicense(id)
    if (!r.ok) setError(r.error || 'Löschen fehlgeschlagen.')
    setConfirmDeleteId(null)
    await reload(false)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <CalendarClock className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Lizenzen-Kalender</h1>
          <p className="text-[11px] text-muted-foreground">
            {licenses.length} Einträge
            {stats.expired > 0 && <span className="ml-2 text-red-300">· {stats.expired} abgelaufen</span>}
            {stats.critical > 0 && <span className="ml-2 text-red-300">· {stats.critical} kritisch (≤10T)</span>}
            {stats.warn > 0 && <span className="ml-2 text-amber-300">· {stats.warn} Warnung (≤30T)</span>}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Suche…"
              className="w-56 pl-7 pr-3 py-1.5 rounded-md bg-card border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={() => setShowArchived(s => !s)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs border ${showArchived ? 'bg-accent/40 text-foreground border-border' : 'text-muted-foreground border-border hover:bg-accent/40'}`}
            title="Lizenzen, die schon mehr als 60 Tage abgelaufen sind"
          >Archiv</button>
          <button
            onClick={() => reload(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border"
            title="Aktualisieren"
          ><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"
          ><Plus size={14} />Neue Lizenz</button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
          <AlertTriangle size={14} />{error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <CalendarClock size={48} className="opacity-30" />
            <p className="text-sm">{showArchived ? 'Keine archivierten Lizenzen.' : (search ? 'Keine Treffer.' : 'Noch keine Lizenzen eingetragen.')}</p>
            {!showArchived && !search && (
              <button onClick={startCreate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90"><Plus size={14} />Erste Lizenz anlegen</button>
            )}
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(l => {
            const d = daysUntil(l.expiryDate)
            const u = urgencyClass(d)
            return (
              <div key={l.id} className={`rounded-lg border-l-4 ${u.row} border-y border-r border-border bg-card`}>
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold ${u.pill}`}>{u.label}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground truncate">{l.name}</h3>
                      <span className="text-[11px] text-muted-foreground">läuft ab am <span className="text-foreground font-medium">{formatGermanDate(l.expiryDate)}</span></span>
                      {l.autoEmail30Days
                        ? <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300" title="30-Tage-Auto-Mail aktiv"><Bell size={10} />30T-Auto</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="30-Tage-Auto-Mail deaktiviert"><BellOff size={10} />30T aus</span>}
                      {l.notifyDays.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-blue-300" title={`Zusätzliche Erinnerungen: ${l.notifyDays.join(', ')} Tage vorher`}>
                          <Bell size={10} />{l.notifyDays.join('/')}T
                        </span>
                      )}
                      {l.notifyEmail && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground truncate max-w-[260px]" title={l.notifyEmail}>
                          <Mail size={10} />{l.notifyEmail}
                        </span>
                      )}
                      {l.attachments && l.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-purple-300" title={`${l.attachments.length} Anhang(e)`}>
                          <Paperclip size={10} />{l.attachments.length}
                        </span>
                      )}
                    </div>
                    {(l.comment1 || l.comment2) && (
                      <div className="mt-1.5 space-y-0.5">
                        {l.comment1 && <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{l.comment1}</p>}
                        {l.comment2 && <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{l.comment2}</p>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(l)} className="p-1.5 rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground" title="Bearbeiten"><Pencil size={13} /></button>
                    {confirmDeleteId === l.id ? (
                      <span className="inline-flex items-center gap-1 text-[11px]">
                        <button onClick={() => handleDelete(l.id)} className="px-2 py-1 rounded bg-red-500/20 text-red-300">Löschen</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 rounded text-muted-foreground hover:bg-accent/40">Abbruch</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(l.id)} className="p-1.5 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/10" title="Löschen"><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {editing && (
        <EditDialog
          form={editing}
          saving={saving}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          currentUser={currentUserName}
        />
      )}
    </div>
  )
}

function EditDialog({ form, saving, onChange, onCancel, onSave, currentUser }: {
  form: EditFormState
  saving: boolean
  onChange: (f: EditFormState) => void
  onCancel: () => void
  onSave: () => void
  currentUser: string
}) {
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState('')
  const [pasteHint, setPasteHint] = useState('')
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  function toggleDay(day: number) {
    onChange({
      ...form,
      notifyDays: form.notifyDays.includes(day)
        ? form.notifyDays.filter(d => d !== day)
        : [...form.notifyDays, day],
    })
  }

  const remainingPreview = form.expiryDate ? daysUntil(form.expiryDate) : NaN

  // Thumbnails von Bild-Anhängen lazy laden
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const a of form.attachments) {
        if (!isImageAttachment(a) || thumbs[a.id]) continue
        const b64 = await readLicenseAttachmentBase64(a)
        if (cancelled) return
        if (b64) setThumbs(prev => ({ ...prev, [a.id]: `data:${a.mime || 'image/png'};base64,${b64}` }))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.attachments])

  // Strg+V Paste → Screenshot aus Zwischenablage als Anhang
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      const items = Array.from(e.clipboardData.items)
      const img = items.find(i => i.type.startsWith('image/'))
      if (!img) return        // normaler Text-Paste → unverändert lassen
      e.preventDefault()
      const blob = img.getAsFile()
      if (!blob) return
      const buf = await blob.arrayBuffer()
      const u8 = new Uint8Array(buf)
      let bin = ''
      const chunk = 8192
      for (let i = 0; i < u8.byteLength; i += chunk) bin += String.fromCharCode(...u8.subarray(i, i + chunk))
      const b64 = btoa(bin)
      setUploading(true); setAttachError('')
      const r = await uploadAttachmentBase64(form.id, b64, `paste_${Date.now()}.png`, currentUser)
      setUploading(false)
      if (!r.ok || !r.attachment) { setAttachError(r.error || 'Screenshot konnte nicht gespeichert werden.'); return }
      onChange({ ...form, attachments: [...form.attachments, r.attachment] })
      setPasteHint('Screenshot eingefügt'); setTimeout(() => setPasteHint(''), 2000)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [form, currentUser, onChange])

  async function pickFiles() {
    const paths = await api().openFilesDialog([
      { name: 'Häufige Formate', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'txt', 'csv', 'lic', 'key', 'json', 'xml', 'zip', 'msg', 'eml'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ])
    if (!paths || paths.length === 0) return
    setUploading(true); setAttachError('')
    const added: LicenseAttachment[] = []
    for (const p of paths) {
      const r = await uploadAttachmentFile(form.id, p, currentUser)
      if (!r.ok || !r.attachment) { setAttachError(r.error || `Upload fehlgeschlagen: ${p}`); break }
      added.push(r.attachment)
    }
    setUploading(false)
    if (added.length) onChange({ ...form, attachments: [...form.attachments, ...added] })
  }

  async function removeAttachment(att: LicenseAttachment) {
    // best-effort vom Netzlaufwerk entfernen; Eintrag aus Form werfen
    deleteAttachmentFile(att).catch(() => {})
    setThumbs(prev => { const n = { ...prev }; delete n[att.id]; return n })
    onChange({ ...form, attachments: form.attachments.filter(a => a.id !== att.id) })
  }

  async function openImage(att: LicenseAttachment) {
    const data = thumbs[att.id]
    if (data) { setLightbox({ src: data, name: att.filename }); return }
    const b64 = await readLicenseAttachmentBase64(att)
    if (b64) setLightbox({ src: `data:${att.mime || 'image/png'};base64,${b64}`, name: att.filename })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && onCancel()}>
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <CalendarClock size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground flex-1">{form.id ? 'Lizenz bearbeiten' : 'Neue Lizenz'}</h2>
          <button onClick={onCancel} className="p-1 rounded hover:bg-accent/40 text-muted-foreground"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Anwendung / Dienstleistung <span className="text-red-300">*</span></label>
            <input
              autoFocus
              value={form.name}
              onChange={e => onChange({ ...form, name: e.target.value })}
              placeholder="z. B. Microsoft 365 E3, GitHub Enterprise"
              className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Ablaufdatum <span className="text-red-300">*</span></label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={form.expiryDate}
                onChange={e => onChange({ ...form, expiryDate: e.target.value })}
                className="px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {!isNaN(remainingPreview) && (
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${urgencyClass(remainingPreview).pill}`}>
                  {remainingPreview < 0 ? `vor ${Math.abs(remainingPreview)} Tagen abgelaufen` : `noch ${remainingPreview} Tage`}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Bemerkung 1 (Hinweis zur Verlängerung)</label>
              <textarea
                value={form.comment1}
                onChange={e => onChange({ ...form, comment1: e.target.value })}
                rows={3}
                placeholder="z. B. Bestellung über SAP S-Nr. 12345"
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Bemerkung 2 (optional)</label>
              <textarea
                value={form.comment2}
                onChange={e => onChange({ ...form, comment2: e.target.value })}
                rows={3}
                placeholder="z. B. Ansprechpartner Hersteller"
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground">E-Mail-Benachrichtigung</h3>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">An folgende Adresse(n) – Komma getrennt</label>
              <input
                type="text"
                value={form.notifyEmail}
                onChange={e => onChange({ ...form, notifyEmail: e.target.value })}
                placeholder="z. B. it@skf.com, einkauf@skf.com"
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Erinnerungs-Tage vor Ablauf</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifyOpen(o => !o)}
                  className="w-full inline-flex items-center gap-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground hover:bg-accent/20"
                >
                  <span className="flex-1 text-left">
                    {form.notifyDays.length === 0 ? <span className="text-muted-foreground">— keine zusätzliche Erinnerung —</span> : form.notifyDays.sort((a, b) => b - a).map(d => `${d} Tage`).join(', ')}
                  </span>
                  <ChevronDown size={13} />
                </button>
                {notifyOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setNotifyOpen(false)} />
                    <div className="absolute left-0 right-0 mt-1 z-20 rounded-md border border-border bg-popover shadow-xl p-2 max-h-60 overflow-y-auto">
                      <div className="grid grid-cols-2 gap-1">
                        {NOTIFY_DAY_OPTIONS.map(d => (
                          <label key={d} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/40 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.notifyDays.includes(d)}
                              onChange={() => toggleDay(d)}
                              className="accent-primary"
                            />
                            <span className="text-xs text-foreground">{d} Tage vorher</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground inline-flex items-center gap-1"><Info size={10} />Eine E-Mail wird bei JEDEM gewählten Schwellwert genau einmal verschickt.</p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer select-none mt-2">
              <input
                type="checkbox"
                checked={form.autoEmail30Days}
                onChange={e => onChange({ ...form, autoEmail30Days: e.target.checked })}
                className="accent-primary mt-0.5"
              />
              <span className="text-[11px] text-foreground">
                <span className="font-medium">Automatische E-Mail 30 Tage vor Ablauf senden</span>
                <span className="block text-muted-foreground">Deaktivieren, falls für diese Lizenz keine 30-Tage-Erinnerung gewünscht ist.</span>
              </span>
            </label>
          </div>

          {/* Anhänge */}
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Paperclip size={14} className="text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground">Anhänge & Screenshots</h3>
              <span className="text-[10px] text-muted-foreground">({form.attachments.length})</span>
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={pickFiles}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                  Datei anhängen
                </button>
              </div>
            </div>
            <div className="px-3 py-2 rounded-md bg-amber-300/10 border border-dashed border-amber-300/40 text-[11px] text-foreground inline-flex items-center gap-1.5">
              <Clipboard size={12} className="text-amber-400" />
              Tipp: mit <kbd className="px-1 py-0.5 bg-card border border-border rounded text-[10px]">Strg + V</kbd> kannst du einen Screenshot direkt aus der Zwischenablage einfügen.
            </div>
            {pasteHint && (
              <div className="px-2 py-1 rounded text-[11px] bg-emerald-500 border border-emerald-600 text-black inline-block">
                {pasteHint}
              </div>
            )}
            {attachError && (
              <div className="px-2 py-1 rounded text-[11px] bg-red-500/10 border border-red-500/30 text-red-300 inline-flex items-center gap-1">
                <AlertTriangle size={11} />{attachError}
              </div>
            )}
            {form.attachments.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                {form.attachments.map(att => (
                  <div key={att.id} className="relative group rounded-md border border-border bg-background/40 p-2">
                    {isImageAttachment(att) ? (
                      <button
                        type="button"
                        onClick={() => openImage(att)}
                        className="block w-full h-20 rounded overflow-hidden bg-white border border-border"
                        title="Vorschau"
                      >
                        {thumbs[att.id]
                          ? <img src={thumbs[att.id]} alt={att.filename} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>}
                      </button>
                    ) : (
                      <div className="block w-full h-20 rounded bg-accent/20 border border-border flex items-center justify-center">
                        <FileText size={28} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-1">
                      {isImageAttachment(att)
                        ? <ImageIcon size={10} className="text-purple-400 shrink-0" />
                        : <Paperclip size={10} className="text-muted-foreground shrink-0" />}
                      <span className="text-[10px] text-foreground truncate flex-1" title={att.filename}>{att.filename}</span>
                    </div>
                    <div className="text-[9px] text-muted-foreground/70">{formatBytes(att.size)}</div>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => downloadLicenseAttachment(att)}
                        title="Herunterladen / öffnen"
                        className="p-1 rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                      ><Download size={11} /></button>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att)}
                        title="Entfernen"
                        className="p-1 rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-300"
                      ><X size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
          <button onClick={onCancel} disabled={saving} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
          <button
            onClick={onSave}
            disabled={saving || !form.name.trim() || !form.expiryDate}
            className="ml-auto inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Speichern
          </button>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <div className="flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.name} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
            <span className="text-white/80 text-xs">{lightbox.name}</span>
            <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"><X size={20} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
