import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Cable, Plus, Search, Trash2, Edit3, ExternalLink, Play, Check, X,
  ChevronRight, ChevronLeft, ChevronDown, Loader2, AlertTriangle, ShoppingCart, Link2,
  RefreshCw, PackageCheck, ClipboardList, Mail, FileDown, History, Send, CheckCircle2, Paperclip,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import {
  loadItems, saveItems, createItem, computeOrderList, sortItems, formatOrderText,
  loadHistory, addHistoryEntry, setHistorySentToSascha, setHistoryLineArrived, deleteHistoryEntry,
  type AccessoryItem, type OrderLine, type AccessoryHistoryEntry,
} from '../services/accessoryInventory'
import { exportOrderList, prepareOrderAttachment, type AccessoryExportFormat } from '../services/accessoryInventoryExport'
import InventoryCelebration from '../components/accessoryInventory/InventoryCelebration'

type Mode = 'table' | 'wizard' | 'result'

interface EditorState {
  id: string | null            // null = neuer Eintrag
  name: string
  current: string
  target: string
  amazonLink: string
}

function openLink(url: string) {
  const u = url.trim()
  if (!u) return
  const href = /^https?:\/\//i.test(u) ? u : `https://${u}`
  try { api().openExternal(href) } catch { /* ignore */ }
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AccessoryInventory() {
  const user = useAuthStore(s => s.session?.user)
  const currentUserName = user?.displayName || user?.username || 'unbekannt'

  const [mode, setMode] = useState<Mode>('table')
  const [items, setItems] = useState<AccessoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [linkDraft, setLinkDraft] = useState('')

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Akkordeon-Sektionen
  const [openFulfilled, setOpenFulfilled] = useState(true)
  const [openReorder, setOpenReorder] = useState(true)

  // Historie
  const [history, setHistory] = useState<AccessoryHistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(true)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  // Wizard-State
  const [wizardIndex, setWizardIndex] = useState(0)
  const [wizardValues, setWizardValues] = useState<Record<string, string>>({})
  const wizardInputRef = useRef<HTMLInputElement>(null)
  const [orderLines, setOrderLines] = useState<OrderLine[]>([])

  // Ergebnisseite: E-Mail + Export + Sascha
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState<string[]>([])
  const [emailSubject, setEmailSubject] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailStatus, setEmailStatus] = useState('')
  const [attachFormats, setAttachFormats] = useState<Set<AccessoryExportFormat>>(new Set())
  const [exporting, setExporting] = useState<AccessoryExportFormat | null>(null)
  const [celebrating, setCelebrating] = useState(false)  // Easter Egg nach Abschluss

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [list, hist] = await Promise.all([loadItems(), loadHistory()])
      setItems(list)
      setHistory(hist)
      setError('')
    } catch {
      setError('Liste konnte nicht geladen werden. Netzlaufwerk erreichbar?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  async function persist(next: AccessoryItem[]) {
    const sorted = sortItems(next)
    setItems(sorted)
    setSaving(true)
    try {
      const ok = await saveItems(sorted)
      if (!ok) setError('Speichern fehlgeschlagen. Netzlaufwerk erreichbar?')
      else setError('')
    } finally {
      setSaving(false)
    }
  }

  // ── Tabelle: Filtern + Aufteilen ──────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(it => it.name.toLowerCase().includes(q))
  }, [items, search])

  const fulfilledItems = useMemo(() => filtered.filter(it => it.current >= it.target), [filtered])
  const reorderItems = useMemo(() => filtered.filter(it => it.current < it.target), [filtered])

  // ── Hinzufuegen / Bearbeiten ──────────────────────────────────────────────
  function openAdd() {
    setEditor({ id: null, name: '', current: '0', target: '0', amazonLink: '' })
  }
  function openEdit(it: AccessoryItem) {
    setEditor({ id: it.id, name: it.name, current: String(it.current), target: String(it.target), amazonLink: it.amazonLink })
  }
  async function saveEditor() {
    if (!editor) return
    const name = editor.name.trim()
    if (!name) return
    const current = Math.max(0, Math.round(Number(editor.current) || 0))
    const target = Math.max(0, Math.round(Number(editor.target) || 0))
    const link = editor.amazonLink.trim()
    if (editor.id) {
      await persist(items.map(it => it.id === editor.id ? { ...it, name, current, target, amazonLink: link } : it))
    } else {
      const maxOrder = items.reduce((m, it) => Math.max(m, it.order), 0)
      await persist([...items, createItem(name, current, target, link, maxOrder + 1)])
    }
    setEditor(null)
  }

  async function doDelete(id: string) {
    setConfirmDeleteId(null)
    if (expandedId === id) setExpandedId(null)
    await persist(items.filter(it => it.id !== id))
  }

  // ── Amazon-Link bearbeiten ────────────────────────────────────────────────
  function startEditLink(it: AccessoryItem) {
    setEditingLinkId(it.id)
    setLinkDraft(it.amazonLink)
  }
  async function saveLink(id: string) {
    await persist(items.map(it => it.id === id ? { ...it, amazonLink: linkDraft.trim() } : it))
    setEditingLinkId(null)
  }

  // ── Inventur-Wizard ───────────────────────────────────────────────────────
  function startInventory() {
    if (items.length === 0) return
    const init: Record<string, string> = {}
    for (const it of items) init[it.id] = String(it.current)
    setWizardValues(init)
    setWizardIndex(0)
    setMode('wizard')
  }

  const orderedItems = useMemo(() => sortItems(items), [items])

  useEffect(() => {
    if (mode === 'wizard') {
      const t = setTimeout(() => { wizardInputRef.current?.focus(); wizardInputRef.current?.select() }, 50)
      return () => clearTimeout(t)
    }
  }, [mode, wizardIndex])

  function wizardSetValue(id: string, v: string) {
    setWizardValues(prev => ({ ...prev, [id]: v.replace(/[^\d]/g, '') }))
  }

  async function finishInventory(values: Record<string, string>) {
    const next = items.map(it => ({
      ...it,
      current: Math.max(0, Math.round(Number(values[it.id]) || 0)),
    }))
    await persist(next)
    const lines = computeOrderList(next)
    setOrderLines(lines)
    // E-Mail-Felder vorbereiten
    setEmailSubject(`Zubehör-Bestellung IT (${new Date().toLocaleDateString('de-DE')})`)
    setEmailStatus('')
    // Historien-Eintrag anlegen (der "An Sascha geschickt"-Haken sitzt jetzt
    // im jeweiligen Historien-Eintrag, nicht mehr auf der Ergebnisseite)
    try {
      const entry = await addHistoryEntry(lines, currentUserName)
      setHistory(prev => [entry, ...prev])
    } catch { /* Historie optional */ }
    setCelebrating(true)   // Skyline-Drift starten, dann Liste einblenden
    setMode('result')
  }

  function wizardNext() {
    if (wizardIndex < orderedItems.length - 1) setWizardIndex(i => i + 1)
    else void finishInventory(wizardValues)
  }
  function wizardBack() {
    if (wizardIndex > 0) setWizardIndex(i => i - 1)
  }

  // ── Ergebnisseite: E-Mail ─────────────────────────────────────────────────
  function buildEmailBody(): string {
    const dateStr = new Date().toLocaleDateString('de-DE')
    return [
      'Hallo,',
      '',
      `anbei die Bestellliste aus der Zubehör-Inventur vom ${dateStr}:`,
      '',
      formatOrderText(orderLines),
      '',
      'Viele Grüße',
      currentUserName,
    ].join('\n')
  }

  function toggleAttachFormat(f: AccessoryExportFormat) {
    setAttachFormats(prev => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f); else next.add(f)
      return next
    })
  }

  async function sendOrderEmail() {
    if (!emailTo.trim()) { setEmailStatus('Bitte einen Empfänger (An:) eintragen.'); return }
    setEmailSending(true)
    setEmailStatus('')
    try {
      const cc = emailCc.map(c => c.trim()).filter(Boolean).join(';')

      // Gewaehlte Formate im Hintergrund erstellen und als echten Dateianhang
      // anhaengen (mehrere -> komprimiertes ZIP).
      let attachmentPath: string | undefined
      const formats = [...attachFormats]
      if (formats.length > 0) {
        setEmailStatus('Anhang wird erstellt…')
        const settings = await api().getSettings()
        const dir = (settings.exportPath as string) || ''
        const prep = await prepareOrderAttachment(orderLines, formats, dir)
        if (prep.ok && prep.path) attachmentPath = prep.path
        else { setEmailStatus(`Anhang konnte nicht erstellt werden: ${prep.error || 'unbekannt'}`); setEmailSending(false); return }
      }

      const res = await api().composeEmail({ to: emailTo.trim(), cc, subject: emailSubject, body: buildEmailBody(), attachmentPath })
      if (res.success) setEmailStatus(attachmentPath ? 'E-Mail mit Anhang wurde geöffnet/versendet.' : 'E-Mail wurde geöffnet/versendet.')
      else if (res.fallback && attachmentPath) setEmailStatus('E-Mail über Standard-Programm geöffnet (ohne Anhang – Anhang liegt im Dokumente-Ordner).')
      else setEmailStatus('E-Mail konnte nicht erstellt werden.')
    } catch (e) {
      setEmailStatus(e instanceof Error ? e.message : 'E-Mail-Fehler.')
    } finally {
      setEmailSending(false)
    }
  }

  function addCcField() { setEmailCc(prev => [...prev, '']) }
  function setCcField(i: number, v: string) { setEmailCc(prev => prev.map((c, idx) => idx === i ? v : c)) }
  function removeCcField(i: number) { setEmailCc(prev => prev.filter((_, idx) => idx !== i)) }

  // ── Ergebnisseite: Export ─────────────────────────────────────────────────
  async function doExport(format: AccessoryExportFormat) {
    setExporting(format)
    try {
      const res = await exportOrderList(orderLines, format)
      if (!res.ok) setEmailStatus(res.error || 'Export fehlgeschlagen.')
    } finally {
      setExporting(null)
    }
  }

  // ── Historie: "An Sascha geschickt"-Haken (mit Zeitstempel) ───────────────
  async function toggleHistorySascha(id: string, value: boolean) {
    const at = value ? new Date().toISOString() : undefined
    // optimistisch
    setHistory(prev => prev.map(e => e.id === id ? { ...e, sentToSascha: value, sentToSaschaAt: at } : e))
    const res = await setHistorySentToSascha(id, value).catch(() => null)
    if (res && res.ok) {
      setHistory(prev => prev.map(e => e.id === id ? { ...e, sentToSascha: value, sentToSaschaAt: res.sentToSaschaAt } : e))
    }
  }

  // ── Historie: "Angekommen"-Haken eines bestellten Artikels ────────────────
  async function toggleHistoryLineArrived(id: string, lineIndex: number, value: boolean) {
    setHistory(prev => prev.map(e => e.id === id
      ? { ...e, lines: e.lines.map((l, i) => i === lineIndex ? { ...l, arrived: value } : l) }
      : e))
    await setHistoryLineArrived(id, lineIndex, value).catch(() => {})
  }

  // ── Historie: Eintrag loeschen ────────────────────────────────────────────
  async function removeHistoryEntry(id: string) {
    await deleteHistoryEntry(id).catch(() => {})
    setHistory(prev => prev.filter(e => e.id !== id))
  }

  // ── Eine Tabellenzeile (in beiden Sektionen wiederverwendet) ──────────────
  function renderRow(it: AccessoryItem) {
    const expanded = expandedId === it.id
    const below = it.current < it.target
    const noLink = !it.amazonLink.trim()
    return (
      <div key={it.id} className="border-b border-border last:border-b-0">
        <div className={`grid grid-cols-[1fr_80px_80px_120px] items-center gap-2 px-3 py-2 hover:bg-accent/20 ${expanded ? 'bg-accent/10' : ''}`}>
          <button
            onClick={() => setExpandedId(expanded ? null : it.id)}
            className="flex items-center gap-2 text-left min-w-0 group"
            title="Amazon-Link anzeigen"
          >
            <ChevronRight size={14} className={`text-muted-foreground transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`} />
            <span className="text-sm text-foreground truncate group-hover:text-primary">{it.name}</span>
            {noLink
              ? <span title="Kein Amazon-Link hinterlegt" className="shrink-0 inline-flex"><AlertTriangle size={13} className="text-amber-400" /></span>
              : <Link2 size={12} className="text-emerald-400 shrink-0" />}
          </button>
          <span className={`text-center text-sm font-semibold ${below ? 'text-amber-300' : 'text-emerald-300'}`}>{it.current}</span>
          <span className="text-center text-sm text-muted-foreground">{it.target}</span>
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => setExpandedId(expanded ? null : it.id)} title="Amazon-Link" className="p-1.5 rounded text-muted-foreground hover:text-amber-300 hover:bg-amber-500/10"><Link2 size={13} /></button>
            <button onClick={() => openEdit(it)} title="Bearbeiten" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40"><Edit3 size={13} /></button>
            {confirmDeleteId === it.id ? (
              <span className="inline-flex items-center gap-1">
                <button onClick={() => doDelete(it.id)} className="px-2 py-1 rounded bg-red-500/20 text-red-300 text-[11px]">Löschen</button>
                <button onClick={() => setConfirmDeleteId(null)} className="px-1.5 py-1 rounded text-muted-foreground hover:bg-accent/40 text-[11px]">Abbruch</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDeleteId(it.id)} title="Löschen" className="p-1.5 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/10"><Trash2 size={13} /></button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="px-3 pb-3 pt-1">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart size={13} className="text-amber-400" />
                <span className="text-xs font-semibold text-foreground">Amazon-Bestelllink</span>
              </div>
              {editingLinkId === it.id ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={linkDraft}
                    onChange={e => setLinkDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveLink(it.id); if (e.key === 'Escape') setEditingLinkId(null) }}
                    placeholder="https://www.amazon.de/..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <button onClick={() => saveLink(it.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 text-xs"><Check size={13} />Speichern</button>
                  <button onClick={() => setEditingLinkId(null)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent/40"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {it.amazonLink.trim() ? (
                    <button
                      onClick={() => openLink(it.amazonLink)}
                      className="flex-1 min-w-0 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-background border border-border text-sm text-blue-300 hover:text-blue-200 hover:border-blue-500/40 truncate"
                      title={it.amazonLink}
                    >
                      <ExternalLink size={14} className="shrink-0" />
                      <span className="truncate">{it.amazonLink}</span>
                    </button>
                  ) : (
                    <span className="flex-1 text-sm text-amber-300/90 italic inline-flex items-center gap-1.5">
                      <AlertTriangle size={13} className="shrink-0" />Noch kein Link hinterlegt.
                    </span>
                  )}
                  <button
                    onClick={() => startEditLink(it)}
                    title="Link bearbeiten"
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 text-xs shrink-0"
                  ><Edit3 size={13} />Bearbeiten</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render: Wizard ────────────────────────────────────────────────────────
  if (mode === 'wizard') {
    const total = orderedItems.length
    const cur = orderedItems[wizardIndex]
    if (!cur) { setMode('table'); return null }
    const isLast = wizardIndex === total - 1
    const progress = Math.round(((wizardIndex + 1) / total) * 100)
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
          <ClipboardList className="text-primary" size={22} />
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground leading-tight">Inventur läuft</h1>
            <p className="text-[11px] text-muted-foreground">Teil {wizardIndex + 1} von {total}</p>
          </div>
          <button
            onClick={() => setMode('table')}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border"
          ><X size={13} />Abbrechen</button>
        </div>

        <div className="h-1 bg-border shrink-0">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-xl p-8">
            <p className="text-xs uppercase tracking-wider text-muted-foreground text-center mb-2">Aktueller IST-Zustand erfassen</p>
            <h2 className="text-3xl font-bold text-foreground text-center mb-1 break-words">{cur.name}</h2>
            <p className="text-center text-sm text-muted-foreground mb-6">
              SOLL-Zustand: <span className="font-semibold text-foreground">{cur.target}</span>
              <span className="mx-2 opacity-40">·</span>
              bisher erfasst: <span className="font-semibold text-foreground">{cur.current}</span>
            </p>

            <label className="block text-center text-sm text-muted-foreground mb-2">Wie viele sind aktuell vorhanden?</label>
            <input
              ref={wizardInputRef}
              value={wizardValues[cur.id] ?? ''}
              onChange={e => wizardSetValue(cur.id, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); wizardNext() } }}
              inputMode="numeric"
              placeholder="0"
              className="w-full text-center text-4xl font-bold tracking-wider px-4 py-5 rounded-xl bg-background border-2 border-primary/40 text-foreground focus:outline-none focus:border-primary"
            />

            <div className="flex items-center justify-between gap-2 mt-8">
              <button
                onClick={wizardBack}
                disabled={wizardIndex === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-40 disabled:cursor-not-allowed"
              ><ChevronLeft size={15} />Zurück</button>
              <button
                onClick={wizardNext}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90"
              >
                {isLast ? (<><PackageCheck size={15} />Inventur abschließen</>) : (<>Weiter<ChevronRight size={15} /></>)}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Ergebnis / Bestellliste ───────────────────────────────────────
  if (mode === 'result') {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
          <ShoppingCart className="text-primary" size={22} />
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground leading-tight">Bestellliste</h1>
            <p className="text-[11px] text-muted-foreground">
              {orderLines.length === 0 ? 'Alles vollständig — nichts zu bestellen' : `${orderLines.length} Position${orderLines.length === 1 ? '' : 'en'} zu bestellen`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={startInventory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border"
            ><RefreshCw size={13} />Erneut zählen</button>
            <button
              onClick={() => setMode('table')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"
            ><Check size={14} />Fertig</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-2xl mx-auto space-y-4">
            {orderLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-muted-foreground gap-3 py-10">
                <PackageCheck size={48} className="opacity-30 text-emerald-400" />
                <p className="text-sm">Alle Kleinteile sind ausreichend vorhanden.</p>
                <p className="text-xs opacity-70">Es muss nichts nachbestellt werden.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
                  <AlertTriangle size={14} className="shrink-0" />
                  Diese Teile liegen unter dem SOLL-Bestand. Menge = SOLL − IST.
                </div>
                {orderLines.map(({ item, quantity }) => (
                  <div key={item.id} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-base font-bold text-foreground mb-2">
                      {item.name} <span className="text-primary">({quantity})</span>
                    </p>
                    {item.amazonLink.trim() ? (
                      <button
                        onClick={() => openLink(item.amazonLink)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 hover:bg-amber-500/25 text-sm font-medium"
                      >
                        <ExternalLink size={14} />Bei Amazon bestellen
                      </button>
                    ) : (
                      <p className="text-xs text-amber-300/90 italic inline-flex items-center gap-1.5">
                        <AlertTriangle size={13} />Kein Amazon-Link hinterlegt
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Export-Buttons */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Bestellliste exportieren</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => doExport('pdf')} disabled={exporting !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-accent/40 disabled:opacity-50">
                  {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} className="text-red-400" />}Als PDF
                </button>
                <button onClick={() => doExport('word')} disabled={exporting !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-accent/40 disabled:opacity-50">
                  {exporting === 'word' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} className="text-blue-400" />}Als Word
                </button>
                <button onClick={() => doExport('excel')} disabled={exporting !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-accent/40 disabled:opacity-50">
                  {exporting === 'excel' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} className="text-emerald-400" />}Als Excel
                </button>
              </div>
            </div>

            {/* E-Mail-Panel */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5 inline-flex items-center gap-1.5">
                <Mail size={13} />Bestellliste per E-Mail senden
              </p>
              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">An:</label>
                  <input
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    placeholder="empfaenger@firma.de"
                    className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-muted-foreground">CC:</label>
                    <button onClick={addCcField} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"><Plus size={11} />CC hinzufügen</button>
                  </div>
                  {emailCc.length === 0 && <p className="text-[11px] text-muted-foreground/70 italic">Keine CC-Empfänger. Über „CC hinzufügen" weitere Kollegen ergänzen.</p>}
                  <div className="space-y-1.5">
                    {emailCc.map((cc, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={cc}
                          onChange={e => setCcField(i, e.target.value)}
                          placeholder="kollege@firma.de"
                          className="flex-1 px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <button onClick={() => removeCcField(i)} title="Entfernen" className="p-2 rounded-md text-muted-foreground hover:text-red-300 hover:bg-red-500/10"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Betreff:</label>
                  <input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5 mb-1.5">
                    <Paperclip size={11} />Bestellliste als Anhang beifügen:
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {([
                      { f: 'pdf' as const, label: 'PDF', dot: 'text-red-400' },
                      { f: 'word' as const, label: 'Word', dot: 'text-blue-400' },
                      { f: 'excel' as const, label: 'Excel', dot: 'text-emerald-400' },
                    ]).map(({ f, label, dot }) => {
                      const on = attachFormats.has(f)
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => toggleAttachFormat(f)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${on ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                        >
                          <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${on ? 'bg-primary border-primary' : 'border-muted-foreground/50'}`}>
                            {on && <Check size={10} className="text-white" />}
                          </span>
                          <FileDown size={12} className={dot} />{label}
                        </button>
                      )
                    })}
                  </div>
                  {attachFormats.size > 1 && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1">Mehrere Formate werden als ZIP-Archiv angehängt.</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={sendOrderEmail}
                    disabled={emailSending || !emailTo.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}E-Mail senden
                  </button>
                  {emailStatus && <span className="text-xs text-muted-foreground">{emailStatus}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Easter Egg: Konfetti + Skyline-Drift, danach faded die Liste ein */}
        {celebrating && <InventoryCelebration onDone={() => setCelebrating(false)} />}
      </div>
    )
  }

  // ── Render: Tabelle ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <Cable className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Zubehör Inventur</h1>
          <p className="text-[11px] text-muted-foreground">
            {items.length} Kleinteile
            {saving && <span className="ml-2 inline-flex items-center gap-1 opacity-70"><Loader2 size={10} className="animate-spin" />speichern…</span>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={reload} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border" title="Aktualisieren">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={startInventory}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
          ><Play size={14} />Inventur starten</button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
          <AlertTriangle size={14} />{error}
        </div>
      )}

      {/* Suchleiste + Hinzufuegen */}
      <div className="flex items-center gap-2 px-5 py-3 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Kleinteil suchen…"
            className="w-full pl-8 pr-2 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <button
          onClick={openAdd}
          title="Hinzufügen"
          className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary text-primary-foreground hover:opacity-90 shrink-0"
        ><Plus size={18} /></button>
      </div>

      {/* Inhalt */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Cable size={48} className="opacity-30" />
            <p className="text-sm">Noch keine Kleinteile angelegt.</p>
            <button onClick={openAdd} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90"><Plus size={14} />Erstes Kleinteil hinzufügen</button>
          </div>
        )}

        {items.length > 0 && (
          <>
            {/* Sektion: Nachbestellung erforderlich */}
            <AccordionSection
              title="Nachbestellung erforderlich"
              count={reorderItems.length}
              open={openReorder}
              onToggle={() => setOpenReorder(o => !o)}
              accent="amber"
            >
              {reorderItems.length === 0
                ? <div className="px-3 py-6 text-center text-xs text-muted-foreground">Aktuell nichts nachzubestellen.</div>
                : reorderItems.map(renderRow)}
            </AccordionSection>

            {/* Sektion: Soll-Zustand erfüllt */}
            <AccordionSection
              title="Soll-Zustand erfüllt"
              count={fulfilledItems.length}
              open={openFulfilled}
              onToggle={() => setOpenFulfilled(o => !o)}
              accent="emerald"
            >
              {fulfilledItems.length === 0
                ? <div className="px-3 py-6 text-center text-xs text-muted-foreground">Kein Kleinteil erfüllt aktuell den SOLL-Bestand.</div>
                : fulfilledItems.map(renderRow)}
            </AccordionSection>

            {/* Inventur-Historie */}
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setShowHistory(o => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-card/80 hover:bg-accent/20"
              >
                <History size={15} className="text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Inventur-Historie</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground">{history.length}</span>
                <ChevronDown size={15} className={`ml-auto text-muted-foreground transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </button>
              {showHistory && (
                <div className="border-t border-border">
                  {history.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">Noch keine abgeschlossene Inventur.</div>
                  ) : (
                    history.map(h => {
                      const open = expandedHistoryId === h.id
                      const arrivedCount = h.lines.filter(l => l.arrived).length
                      return (
                        <div key={h.id} className="border-b border-border last:border-b-0">
                          {/* Kopfzeile – klappt den Eintrag auf/zu */}
                          <div className={`flex items-center gap-3 px-3 py-2.5 hover:bg-accent/10 ${open ? 'bg-accent/10' : ''}`}>
                            <button
                              onClick={() => setExpandedHistoryId(open ? null : h.id)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <ChevronRight size={14} className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                              <ClipboardList size={14} className="text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground">
                                  {fmtDateTime(h.timestamp)}
                                  <span className="text-muted-foreground"> · {h.by}</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {h.reorderCount} Position{h.reorderCount === 1 ? '' : 'en'} nachbestellt · {h.totalUnits} Stück gesamt
                                  {h.reorderCount > 0 && <span> · {arrivedCount}/{h.reorderCount} angekommen</span>}
                                </p>
                              </div>
                            </button>
                            {h.sentToSascha && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600 shrink-0">
                                <CheckCircle2 size={10} />An Sascha
                              </span>
                            )}
                            <button onClick={() => removeHistoryEntry(h.id)} title="Eintrag löschen" className="p-1.5 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/10 shrink-0"><Trash2 size={12} /></button>
                          </div>

                          {/* Aufgeklappter Bereich */}
                          {open && (
                            <div className="px-3 pb-3 pt-1 bg-background/40 space-y-3">
                              {/* An Sascha geschickt + Zeitstempel */}
                              <label className="flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-border bg-card cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={h.sentToSascha}
                                  onChange={e => toggleHistorySascha(h.id, e.target.checked)}
                                  className="w-4 h-4 rounded accent-emerald-500"
                                />
                                <span className="text-sm text-foreground">An Sascha geschickt</span>
                                {h.sentToSascha && h.sentToSaschaAt && (
                                  <span className="text-[11px] text-emerald-300/90 ml-auto">
                                    (Haken gesetzt am: {fmtDateTime(h.sentToSaschaAt)} Uhr)
                                  </span>
                                )}
                              </label>

                              {/* Bestellte Artikel mit "Angekommen"-Status */}
                              {h.lines.length === 0 ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-2">
                                  <PackageCheck size={14} className="text-emerald-400" />
                                  Bei dieser Inventur musste nichts nachbestellt werden.
                                </div>
                              ) : (
                                <div className="rounded-md border border-border overflow-hidden">
                                  <div className="px-2.5 py-1.5 bg-card/70 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Nachbestellte Artikel
                                  </div>
                                  {h.lines.map((l, idx) => (
                                    <label
                                      key={idx}
                                      className="flex items-center gap-2.5 px-2.5 py-2 border-t border-border cursor-pointer select-none hover:bg-accent/10"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={l.arrived}
                                        onChange={e => toggleHistoryLineArrived(h.id, idx, e.target.checked)}
                                        className="w-4 h-4 rounded accent-emerald-500 shrink-0"
                                      />
                                      <span className={`flex-1 min-w-0 text-sm ${l.arrived ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                        {l.name} <span className="text-primary font-medium">({l.quantity})</span>
                                      </span>
                                      {l.amazonLink.trim() && (
                                        <button
                                          type="button"
                                          onClick={e => { e.preventDefault(); openLink(l.amazonLink) }}
                                          title="Bei Amazon öffnen"
                                          className="p-1 rounded text-muted-foreground hover:text-amber-300 hover:bg-amber-500/10 shrink-0"
                                        ><ExternalLink size={13} /></button>
                                      )}
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${l.arrived ? 'bg-emerald-500 text-black border border-emerald-600' : 'bg-muted/40 text-muted-foreground border border-border'}`}>
                                        {l.arrived ? 'Angekommen' : 'Offen'}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Hinzufuegen/Bearbeiten-Dialog */}
      {editor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setEditor(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              {editor.id ? <Edit3 size={18} className="text-primary" /> : <Plus size={18} className="text-primary" />}
              <h3 className="text-base font-semibold text-foreground">{editor.id ? 'Kleinteil bearbeiten' : 'Neues Kleinteil'}</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">Name</label>
                <input
                  autoFocus
                  value={editor.name}
                  onChange={e => setEditor(s => s ? { ...s, name: e.target.value } : s)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEditor() }}
                  placeholder="z.B. Headset"
                  className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium block mb-1">IST-Zustand</label>
                  <input
                    type="number" min={0}
                    value={editor.current}
                    onChange={e => setEditor(s => s ? { ...s, current: e.target.value } : s)}
                    className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium block mb-1">SOLL-Zustand</label>
                  <input
                    type="number" min={0}
                    value={editor.target}
                    onChange={e => setEditor(s => s ? { ...s, target: e.target.value } : s)}
                    className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">Amazon-Link (optional)</label>
                <input
                  value={editor.amazonLink}
                  onChange={e => setEditor(s => s ? { ...s, amazonLink: e.target.value } : s)}
                  placeholder="https://www.amazon.de/..."
                  className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Der IST-Zustand wird nicht durch den SOLL-Zustand begrenzt.</p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditor(null)} className="px-3 py-2 rounded-md text-sm text-muted-foreground border border-border hover:bg-muted/30">Abbrechen</button>
              <button onClick={saveEditor} disabled={!editor.name.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
                <Check size={14} />Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2"><Loader2 size={16} className="animate-spin" />Lade Liste…</div>
      )}
    </div>
  )
}

// ── Akkordeon-Sektion ─────────────────────────────────────────────────────────
function AccordionSection({ title, count, open, onToggle, accent, children }: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  accent: 'amber' | 'emerald'
  children: React.ReactNode
}) {
  const badge = accent === 'amber'
    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    : 'bg-emerald-500 text-black border-emerald-500/30'
  const dot = accent === 'amber' ? 'bg-amber-400' : 'bg-emerald-400'
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 bg-card/80 hover:bg-accent/20">
        <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${badge}`}>{count}</span>
        <ChevronDown size={15} className={`ml-auto text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border">
          {/* Kopfzeile */}
          <div className="grid grid-cols-[1fr_80px_80px_120px] items-center gap-2 px-3 py-2 bg-card/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Kleinteil</span>
            <span className="text-center">IST</span>
            <span className="text-center">SOLL</span>
            <span className="text-right">Aktionen</span>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}
