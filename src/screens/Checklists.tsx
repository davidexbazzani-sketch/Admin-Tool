import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardList, Plus, Trash2, Download, Eye, RefreshCw, Search, Loader,
  FileText, Edit3, X, Save, CheckCircle, XCircle, AlertTriangle, ArrowLeft, Printer,
  PackageCheck, RotateCcw,
} from 'lucide-react'
import {
  listChecklists, createChecklist, updateChecklist, deleteChecklist,
  type Checklist, type DeviceType,
} from '../services/checklists'
import { downloadChecklistPdf, printChecklist } from '../services/checklistPdf'
import { batchAdLookup } from '../services/adUserLookup'
import { listEmployees, formatGermanDate, type Employee } from '../services/employees'
import { ensureSkfLogo } from '../services/skfLogo'
import SignaturePad from '../components/SignaturePad'
import { useAuthStore } from '../store/authStore'
import { PersonInfoButton } from '../components/person/PersonDossier'

type View = 'list' | 'edit' | 'preview'

function emptyDraft(currentUser: string): Omit<Checklist, 'id' | 'createdAt'> {
  return {
    taskNumber: '',
    name: '',
    corpId: '',
    technician: currentUser,
    deviceType: 'new',
    newDeviceSerial: '',
    oldDeviceId: '',
    comment: '',
    signatureDataUrl: undefined,
    signatureDate: undefined,
    createdBy: currentUser,
  }
}

type Toast = { kind: 'success' | 'error'; text: string }

// Kanonischer Name fuer den Abgleich: klein, Leerzeichen normiert; "Nachname,
// Vorname" wird zu "Vorname Nachname" umgestellt.
function canonName(s: string): string {
  let n = (s || '').trim().replace(/\s+/g, ' ')
  if (n.includes(',')) { const p = n.split(','); if (p.length === 2 && p[0].trim() && p[1].trim()) n = `${p[1].trim()} ${p[0].trim()}` }
  return n.toLowerCase()
}

export default function Checklists() {
  const user = useAuthStore(s => s.session?.user)
  const currentUserName = user?.displayName || user?.username || ''

  const [view, setView] = useState<View>('list')
  const [items, setItems] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Omit<Checklist, 'id' | 'createdAt'>>(emptyDraft(currentUserName))
  const [toast, setToast] = useState<Toast | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Checklist | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  // Uebersichts-Tab: offene vs. erledigte (uebergebene) Checklisten
  const [listTab, setListTab] = useState<'open' | 'done'>('open')
  // Neue Mitarbeiter (aus der Mitarbeiterverwaltung) fuer die Markierung
  const [employees, setEmployees] = useState<Employee[]>([])
  // Checkliste, deren Geraeteuebergabe gerade bestaetigt werden soll
  const [pendingComplete, setPendingComplete] = useState<Checklist | null>(null)

  // AD lookup for Corp-ID: auto-fires (debounced) when the name field changes
  // — only fills the Corp-ID field if it's currently empty, so manual edits
  // are never overwritten. Manual refresh button next to the Corp-ID field
  // forces a re-lookup and overrides.
  const [corpLookup, setCorpLookup] = useState<'idle' | 'loading' | 'found' | 'notFound' | 'error'>('idle')
  const lastLookupNameRef = useRef<string>('')

  function showToast(t: Toast) {
    setToast(t)
    setTimeout(() => setToast(curr => (curr === t ? null : curr)), 4000)
  }

  async function reload() {
    setLoading(true)
    try { setItems(await listChecklists()) }
    finally { setLoading(false) }
  }

  useEffect(() => { reload() }, [])

  // Resolve one identity (name) against AD and return the SAM if found
  async function lookupCorpId(name: string, opts: { overwrite: boolean }): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) { setCorpLookup('idle'); return }
    setCorpLookup('loading')
    try {
      const result = await batchAdLookup([trimmed])
      const res = result.get(trimmed)
      if (res?.found && res.sam) {
        setCorpLookup('found')
        setDraft(d => {
          if (!opts.overwrite && d.corpId.trim()) return d  // keep existing manual value
          return { ...d, corpId: res.sam! }
        })
      } else {
        setCorpLookup('notFound')
      }
    } catch {
      setCorpLookup('error')
    }
  }

  // Debounced auto-lookup when name changes (only in edit view).
  useEffect(() => {
    if (view !== 'edit') return
    const name = draft.name.trim()
    if (name.length < 3) { setCorpLookup('idle'); return }
    if (name === lastLookupNameRef.current) return
    const handle = setTimeout(() => {
      lastLookupNameRef.current = name
      void lookupCorpId(name, { overwrite: false })
    }, 700)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.name, view])

  // Neue Mitarbeiter laden -> Index nach kanonischem Namen
  useEffect(() => { listEmployees().then(setEmployees).catch(() => {}) }, [])
  const empByName = useMemo(() => {
    const m = new Map<string, Employee>()
    for (const e of employees) {
      for (const v of [`${e.vorname} ${e.name}`, `${e.name} ${e.vorname}`]) {
        const k = canonName(v)
        if (k.trim()) m.set(k, e)
      }
    }
    return m
  }, [employees])

  // Aufteilung nach Tab (offen / erledigt), Suche wirkt in beiden Ansichten
  const tabItems = useMemo(
    () => items.filter(c => (listTab === 'done') === !!c.completed),
    [items, listTab],
  )
  const openCount = useMemo(() => items.filter(c => !c.completed).length, [items])
  const doneCount = items.length - openCount

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tabItems
    return tabItems.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.corpId.toLowerCase().includes(q) ||
      c.taskNumber.toLowerCase().includes(q) ||
      c.newDeviceSerial.toLowerCase().includes(q) ||
      (c.oldDeviceId ?? '').toLowerCase().includes(q) ||
      c.technician.toLowerCase().includes(q),
    )
  }, [tabItems, search])

  function startNew() {
    setDraft(emptyDraft(currentUserName))
    setEditingId(null)
    setCorpLookup('idle')
    lastLookupNameRef.current = ''
    setView('edit')
  }

  function startEdit(c: Checklist) {
    setDraft({
      taskNumber: c.taskNumber,
      name: c.name,
      corpId: c.corpId,
      technician: c.technician || currentUserName,
      deviceType: c.deviceType,
      newDeviceSerial: c.newDeviceSerial,
      oldDeviceId: c.oldDeviceId,
      comment: c.comment,
      signatureDataUrl: c.signatureDataUrl,
      signatureDate: c.signatureDate,
      createdBy: c.createdBy,
      updatedAt: c.updatedAt,
    })
    setEditingId(c.id)
    // For an existing entry assume the Corp-ID is correct — no auto-overwrite
    setCorpLookup('idle')
    lastLookupNameRef.current = c.name.trim()
    setView('edit')
  }

  function backToList() {
    setView('list')
    setEditingId(null)
  }

  // Validation: required core fields
  const validation = useMemo(() => {
    const errors: string[] = []
    if (!draft.name.trim()) errors.push('Name')
    if (!draft.taskNumber.trim()) errors.push('TASK-Nr')
    if (!draft.newDeviceSerial.trim()) errors.push('Neu-Gerät SN')
    if (draft.deviceType === 'refresh' && !(draft.oldDeviceId ?? '').trim()) errors.push('Alt-Gerät')
    return errors
  }, [draft])

  async function handleSaveDraft(thenView: View): Promise<Checklist | null> {
    if (validation.length > 0) {
      showToast({ kind: 'error', text: `Pflichtfelder fehlen: ${validation.join(', ')}` })
      return null
    }
    if (editingId) {
      const res = await updateChecklist(editingId, draft)
      if (!res.ok || !res.checklist) {
        showToast({ kind: 'error', text: res.error || 'Speichern fehlgeschlagen' })
        return null
      }
      await reload()
      showToast({ kind: 'success', text: 'Checkliste aktualisiert' })
      setView(thenView)
      return res.checklist
    } else {
      const res = await createChecklist(draft)
      if (!res.ok || !res.checklist) {
        showToast({ kind: 'error', text: res.error || 'Anlegen fehlgeschlagen' })
        return null
      }
      await reload()
      setEditingId(res.checklist.id)
      showToast({ kind: 'success', text: 'Checkliste angelegt' })
      setView(thenView)
      return res.checklist
    }
  }

  async function handleExport(c: Checklist) {
    // Persist any latest changes from the preview (signature, date) before export
    let toExport = c
    if (editingId === c.id) {
      const res = await updateChecklist(c.id, draft)
      if (res.ok && res.checklist) toExport = res.checklist
    }
    try {
      await downloadChecklistPdf(toExport)
      showToast({ kind: 'success', text: 'PDF erstellt — bitte speichern' })
    } catch (e) {
      showToast({ kind: 'error', text: `PDF-Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  async function handleExportFromPreview() {
    const saved = await handleSaveDraft('preview')
    if (saved) await handleExport(saved)
  }

  // Direktdruck auf dem Standarddrucker — ohne Dialog und ohne Rueckfrage
  async function handlePrint(c: Checklist) {
    // Wie beim Export: offene Aenderungen aus der Vorschau vorher speichern
    let toPrint = c
    if (editingId === c.id) {
      const res = await updateChecklist(c.id, draft)
      if (res.ok && res.checklist) toPrint = res.checklist
    }
    setPrintingId(c.id)
    try {
      const r = await printChecklist(toPrint)
      if (r.success) showToast({ kind: 'success', text: 'Checkliste wird gedruckt' })
      else showToast({ kind: 'error', text: `Drucken fehlgeschlagen: ${r.error || 'unbekannt'}` })
    } finally {
      setPrintingId(null)
    }
  }

  // Geraeteuebergabe bestaetigt -> Checkliste wandert in "Alle erledigten Checklisten"
  async function confirmComplete() {
    if (!pendingComplete) return
    const c = pendingComplete
    setPendingComplete(null)
    const res = await updateChecklist(c.id, {
      completed: true,
      completedAt: new Date().toISOString(),
      completedBy: currentUserName,
    })
    if (res.ok) {
      showToast({ kind: 'success', text: `Checkliste für "${c.name}" als erledigt verschoben` })
      await reload()
    } else {
      showToast({ kind: 'error', text: res.error || 'Speichern fehlgeschlagen.' })
    }
  }

  // Versehentlich abgeschlossen? Zurueck in die offene Uebersicht holen.
  async function reopenChecklist(c: Checklist) {
    const res = await updateChecklist(c.id, { completed: false, completedAt: undefined, completedBy: undefined })
    if (res.ok) {
      showToast({ kind: 'success', text: `Checkliste für "${c.name}" wieder geöffnet` })
      await reload()
    } else {
      showToast({ kind: 'error', text: res.error || 'Speichern fehlgeschlagen.' })
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const { id, name } = pendingDelete
    setPendingDelete(null)
    const res = await deleteChecklist(id)
    if (!res.ok) {
      showToast({ kind: 'error', text: res.error || 'Löschen fehlgeschlagen' })
      return
    }
    await reload()
    showToast({ kind: 'success', text: `Checkliste "${name}" gelöscht` })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <ClipboardList size={22} className="text-blue-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground">Checklisten</h2>
          <p className="text-xs text-muted-foreground">
            Geräteübergabe-Dokumente erstellen, unterschreiben und als PDF exportieren.
          </p>
        </div>
        {view === 'list' ? (
          <button onClick={startNew}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500 text-black hover:bg-emerald-500/20">
            <Plus size={12} />Neue Checkliste
          </button>
        ) : (
          <button onClick={backToList}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
            <ArrowLeft size={12} />Zur Liste
          </button>
        )}
        {view === 'list' && (
          <button onClick={reload} disabled={loading}
            className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground" title="Aktualisieren">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* LIST VIEW */}
      {view === 'list' && (
        <>
          <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
            {/* Tabs: offene vs. erledigte Checklisten */}
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <button onClick={() => setListTab('open')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${listTab === 'open' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground'}`}>
                Offen ({openCount})
              </button>
              <button onClick={() => setListTab('done')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${listTab === 'done' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground'}`}>
                <PackageCheck size={12} />Erledigt ({doneCount})
              </button>
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Name, TASK, SN, Hostname…"
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            </div>
            <span className="text-xs text-muted-foreground">{filteredItems.length} von {tabItems.length}</span>
          </div>

          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader size={14} className="animate-spin" />Lade Checklisten…
            </div>
          ) : tabItems.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-center px-6">
              <div>
                {listTab === 'open' ? (
                  <>
                    <ClipboardList size={36} className="text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-foreground">Keine offenen Checklisten</p>
                    <p className="text-xs text-muted-foreground mt-1">Klick "Neue Checkliste" oben rechts um eine anzulegen.</p>
                  </>
                ) : (
                  <>
                    <PackageCheck size={36} className="text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-foreground">Noch keine erledigten Checklisten</p>
                    <p className="text-xs text-muted-foreground mt-1">Bestätige in der offenen Übersicht die Geräteübergabe — die Checkliste wandert dann hierher.</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background border-b border-border z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 w-32">TASK</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 w-24">Corp-ID</th>
                    <th className="px-3 py-2 w-20">Typ</th>
                    <th className="px-3 py-2">Neu (SN)</th>
                    <th className="px-3 py-2">Alt</th>
                    <th className="px-3 py-2 w-28">Erstellt</th>
                    <th className="px-3 py-2 w-20 text-center">Signiert</th>
                    {listTab === 'done' && <th className="px-3 py-2 w-32">Übergeben</th>}
                    <th className="px-3 py-2 w-48 text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(c => {
                    const emp = empByName.get(canonName(c.name))
                    return (
                    <tr key={c.id} className="border-b border-border/40 hover:bg-accent/10">
                      <td className="px-3 py-2 font-mono text-foreground">{c.taskNumber || '—'}</td>
                      <td className="px-3 py-2 text-foreground">
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1">{c.name}{c.name && <PersonInfoButton name={c.name} sam={c.corpId} />}</span>
                          {emp && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-300 text-black border border-sky-400 font-medium">
                              Neuer Mitarbeiter{emp.startDate ? ` · ${formatGermanDate(emp.startDate)}` : ''}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-foreground">{c.corpId || '—'}</td>
                      <td className="px-3 py-2">
                        {c.deviceType === 'new' ? (
                          <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-500 text-black border border-emerald-600">Neu</span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">Refresh</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-foreground">{c.newDeviceSerial}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{c.oldDeviceId || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.createdAt ? new Date(c.createdAt).toLocaleDateString('de-DE') : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {c.signatureDataUrl
                          ? <CheckCircle size={13} className="text-emerald-400 inline" />
                          : <XCircle size={13} className="text-muted-foreground/40 inline" />}
                      </td>
                      {listTab === 'done' && (
                        <td className="px-3 py-2 text-muted-foreground" title={c.completedBy ? `Bestätigt von ${c.completedBy}` : undefined}>
                          {c.completedAt ? new Date(c.completedAt).toLocaleDateString('de-DE') : '—'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => { setEditingId(c.id); startEdit(c); setView('preview') }}
                            title="Vorschau"
                            className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                            <Eye size={12} />
                          </button>
                          {listTab === 'open' && (
                            <button onClick={() => startEdit(c)} title="Bearbeiten"
                              className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                              <Edit3 size={12} />
                            </button>
                          )}
                          <button onClick={() => handleExport(c)} title="Als PDF exportieren"
                            className="p-1.5 rounded border border-blue-500/40 text-blue-300 hover:bg-blue-500/10">
                            <Download size={12} />
                          </button>
                          <button onClick={() => handlePrint(c)} disabled={printingId !== null}
                            title="Drucken (direkt auf dem Standarddrucker)"
                            className="p-1.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40">
                            {printingId === c.id ? <Loader size={12} className="animate-spin" /> : <Printer size={12} />}
                          </button>
                          {listTab === 'open' ? (
                            <button onClick={() => setPendingComplete(c)}
                              title="Gerät übergeben — Checkliste als erledigt verschieben"
                              className="p-1.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
                              <PackageCheck size={12} />
                            </button>
                          ) : (
                            <button onClick={() => reopenChecklist(c)}
                              title="Zurück zu den offenen Checklisten"
                              className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                              <RotateCcw size={12} />
                            </button>
                          )}
                          <button onClick={() => setPendingDelete(c)} title="Löschen"
                            className="p-1.5 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* EDIT VIEW */}
      {view === 'edit' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <FileText size={15} className="text-blue-400" />
              {editingId ? 'Checkliste bearbeiten' : 'Neue Checkliste anlegen'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="TASK-Nummer *">
                <input value={draft.taskNumber} onChange={e => setDraft(d => ({ ...d, taskNumber: e.target.value }))}
                  placeholder="z.B. TASK1087336"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono" />
              </Field>
              <Field label="Name (Empfänger) *">
                <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="Vorname Nachname"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </Field>
              <Field label="Corp-ID (automatisch aus AD)">
                <div className="flex gap-1">
                  <div className="relative flex-1">
                    <input value={draft.corpId}
                      onChange={e => setDraft(d => ({ ...d, corpId: e.target.value }))}
                      placeholder="wird ermittelt…"
                      className="w-full pr-7 px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      {corpLookup === 'loading' && <Loader size={12} className="animate-spin text-blue-400" />}
                      {corpLookup === 'found' && <CheckCircle size={12} className="text-emerald-400" />}
                      {corpLookup === 'notFound' && <XCircle size={12} className="text-amber-400" />}
                      {corpLookup === 'error' && <AlertTriangle size={12} className="text-red-400" />}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => lookupCorpId(draft.name, { overwrite: true })}
                    disabled={!draft.name.trim() || corpLookup === 'loading'}
                    title="Aus AD neu auslesen (überschreibt manuell eingetragene Corp-ID)"
                    className="px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={12} className={corpLookup === 'loading' ? 'animate-spin' : ''} />
                  </button>
                </div>
                {corpLookup === 'notFound' && (
                  <p className="text-[10px] text-amber-400 mt-0.5">
                    Kein eindeutiger AD-Treffer für "{draft.name}" — Corp-ID bitte manuell eintragen.
                  </p>
                )}
                {corpLookup === 'error' && (
                  <p className="text-[10px] text-red-400 mt-0.5">AD-Abfrage fehlgeschlagen — bitte manuell eintragen.</p>
                )}
              </Field>
              <Field label="Techniker">
                <input value={draft.technician} onChange={e => setDraft(d => ({ ...d, technician: e.target.value }))}
                  placeholder="z.B. dein Name"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </Field>
            </div>

            <Field label="Geräte-Typ *">
              <div className="flex gap-2">
                {(['new', 'refresh'] as DeviceType[]).map(t => (
                  <button key={t} type="button"
                    onClick={() => setDraft(d => ({ ...d, deviceType: t }))}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      draft.deviceType === t
                        ? (t === 'new' ? 'border-emerald-500/40 bg-emerald-500 text-black' : 'border-amber-500/40 bg-amber-500/10 text-amber-300')
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}>
                    {t === 'new' ? 'Neu-Gerät' : 'Refresh (Tausch alle 4 Jahre)'}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Neu-Gerät (Seriennummer) *">
                <input value={draft.newDeviceSerial} onChange={e => setDraft(d => ({ ...d, newDeviceSerial: e.target.value }))}
                  placeholder="z.B. 5CG54551F8"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono" />
              </Field>
              {draft.deviceType === 'refresh' && (
                <Field label="Alt-Gerät (Seriennummer oder Hostname) *">
                  <input value={draft.oldDeviceId ?? ''} onChange={e => setDraft(d => ({ ...d, oldDeviceId: e.target.value }))}
                    placeholder="z.B. DEHAM12345 oder SN"
                    className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono" />
                </Field>
              )}
            </div>

            <Field label="Bemerkung (optional)">
              <textarea value={draft.comment ?? ''} onChange={e => setDraft(d => ({ ...d, comment: e.target.value }))}
                rows={3} placeholder="Notizen, Zubehör, Besonderheiten…"
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary resize-y" />
            </Field>

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              {validation.length > 0 && (
                <span className="text-[11px] text-amber-300 inline-flex items-center gap-1">
                  <AlertTriangle size={11} />Fehlt noch: {validation.join(', ')}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => handleSaveDraft('list')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                  <Save size={12} />Speichern
                </button>
                <button onClick={() => handleSaveDraft('preview')}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-blue-600 hover:bg-blue-500 text-white">
                  <Eye size={12} />Vorschau + Unterschreiben
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW VIEW */}
      {view === 'preview' && (
        <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
          <div className="max-w-3xl mx-auto bg-white text-black rounded-lg shadow-xl px-10 pt-6 pb-10 relative">
            {/* SKF Marine logo (canvas-rendered, matches PDF exactly) */}
            <SkfLogo />

            <h2 className="text-2xl font-bold mb-4">Geräteübergabe-Dokument</h2>

            <div className="space-y-1.5 text-sm">
              <p><strong>Auftragsnummer:</strong> {draft.taskNumber || '—'}</p>
              <p><strong>Typ:</strong> {draft.deviceType === 'new' ? 'Neu-Gerät' : 'Refresh (Geräte-Tausch)'}</p>
              <p><strong>Name:</strong> {draft.name || '—'}</p>
              <p><strong>Corp-ID:</strong> {draft.corpId || '—'}</p>
              <p><strong>Techniker:</strong> {draft.technician || '—'}</p>
            </div>

            <div className="mt-5 space-y-2 text-sm">
              {draft.deviceType === 'refresh' && (
                <p>
                  <strong>Hardware alt:</strong> {draft.oldDeviceId || '—'}
                  <span className="italic text-slate-500 text-xs ml-2">(Seriennummer oder Hostname)</span>
                </p>
              )}
              <p>
                <strong>Hardware neu:</strong> {draft.newDeviceSerial || '—'}
                <span className="italic text-slate-500 text-xs ml-2">(Seriennummer)</span>
              </p>
            </div>

            <div className="mt-5">
              <p className="italic text-sm">Kommentare:</p>
              <p className="text-sm whitespace-pre-wrap min-h-[40px]">{draft.comment || ''}</p>
            </div>

            <hr className="my-6 border-slate-400" />

            <p className="text-xs leading-relaxed">
              Mit meiner Unterschrift bestätige ich, das oben aufgeführte Gerät nebst Zubehör in einwandfreiem Zustand erhalten zu haben.
              Ich bin ab diesem Zeitpunkt für den sachgemäßen Umgang, die Sicherheit und den <strong>Verbleib</strong> des Rechners sowie aller Unternehmensdaten darauf verantwortlich.
            </p>

            <div className="mt-8 flex items-end gap-8 flex-wrap">
              <div>
                <p className="text-sm font-semibold mb-1">Datum</p>
                <p className="text-sm font-mono border-b border-slate-800 pb-1 min-w-[140px]">
                  {draft.signatureDate
                    ? new Date(draft.signatureDate).toLocaleDateString('de-DE')
                    : <span className="text-slate-400 italic">noch nicht unterschrieben</span>}
                </p>
              </div>
              <div className="flex-1 min-w-[280px]">
                <p className="text-sm font-semibold mb-1">Unterschrift</p>
                {/*
                  `key` here forces a remount when switching between checklists
                  (different editingId) so the correct stored signature loads.
                  Within ONE editing session the SignaturePad keeps its canvas
                  intact across re-renders → user can lift the mouse and keep
                  drawing without losing previous strokes.
                */}
                <SignaturePad
                  key={editingId ?? 'new'}
                  initialValue={draft.signatureDataUrl}
                  onChange={(dataUrl) => {
                    setDraft(d => ({
                      ...d,
                      signatureDataUrl: dataUrl ?? undefined,
                      signatureDate: dataUrl ? new Date().toISOString() : (d.signatureDate),
                    }))
                  }}
                />
              </div>
            </div>
          </div>

          {/* Preview action bar */}
          <div className="max-w-3xl mx-auto flex items-center justify-end gap-2 mt-4">
            <button onClick={() => setView('edit')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
              <Edit3 size={12} />Felder bearbeiten
            </button>
            <button onClick={() => handleSaveDraft('preview')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
              <Save size={12} />Speichern
            </button>
            <button onClick={handleExportFromPreview}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-blue-600 hover:bg-blue-500 text-white">
              <Download size={12} />Als PDF exportieren
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm">
          <div className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-2xl border ${
            toast.kind === 'success'
              ? 'bg-green-500 border-green-600 text-black'
              : 'bg-red-500/15 border-red-500/40 text-red-200'
          }`}>
            {toast.kind === 'success' ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <p className="text-sm">{toast.text}</p>
          </div>
        </div>
      )}

      {/* Geraeteuebergabe bestaetigen */}
      {pendingComplete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setPendingComplete(null)}>
          <div className="bg-card border border-amber-500/40 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <PackageCheck size={16} className="text-amber-400" />
              <h3 className="text-base font-semibold text-foreground">Geräteübergabe bestätigen</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Im Kontext <strong className="text-foreground">{pendingComplete.taskNumber || '—'}</strong>:
              wurde das Gerät an <strong className="text-foreground">{pendingComplete.name || '—'}</strong> übergeben
              und ist die Checkliste unterschrieben?
            </p>
            {!pendingComplete.signatureDataUrl && (
              <p className="flex items-center gap-1.5 text-xs text-amber-300 mb-2">
                <AlertTriangle size={12} className="shrink-0" />
                Hinweis: Diese Checkliste hat noch keine digitale Unterschrift.
              </p>
            )}
            <p className="text-xs text-muted-foreground mb-4">
              Nach der Bestätigung wird die Checkliste in die Übersicht „Erledigt" verschoben.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingComplete(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent/30">
                Abbrechen
              </button>
              <button onClick={confirmComplete}
                className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                Ja, Gerät wurde übergeben
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setPendingDelete(null)}>
          <div className="bg-card border border-red-500/40 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Trash2 size={16} className="text-red-400" />
              <h3 className="text-base font-semibold text-foreground">Checkliste löschen?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Checkliste <strong className="text-foreground">{pendingDelete.taskNumber || '—'}</strong> für <strong className="text-foreground">{pendingDelete.name}</strong> wirklich löschen?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDelete(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent/30">
                Abbrechen
              </button>
              <button onClick={confirmDelete}
                className="px-3 py-1.5 text-sm rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold">
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground font-medium block mb-1">{label}</label>
      {children}
    </div>
  )
}

// Renders the SKF Marine logo. Prefers the user-supplied file
// public/skf-marine-logo.png; falls back to a canvas-rendered version, and
// finally to a pure text logo if even the canvas fails.
function SkfLogo() {
  const [dataUrl, setDataUrl] = useState<string>('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    ensureSkfLogo().then(({ url }) => {
      if (!cancelled && url) setDataUrl(url)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  if (failed || !dataUrl) {
    return (
      <div className="absolute right-10 top-3 text-right leading-none">
        <div style={{ color: '#0066b3', fontFamily: 'Arial Black, Arial, sans-serif', fontWeight: 900, fontSize: 36, letterSpacing: -1 }}>
          SKF
        </div>
        <div style={{ color: '#0066b3', fontFamily: 'Arial, sans-serif', fontWeight: 500, fontSize: 14, marginTop: 4 }}>
          SKF Marine
        </div>
      </div>
    )
  }
  return (
    <img
      src={dataUrl}
      alt="SKF Marine"
      className="absolute right-10 top-3"
      style={{ height: 56, width: 'auto' }}
      onError={() => setFailed(true)}
    />
  )
}
