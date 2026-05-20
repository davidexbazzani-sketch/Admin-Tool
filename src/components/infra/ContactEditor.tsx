import { useState, useEffect } from 'react'
import {
  Save, RotateCcw, Plus, Trash2, Edit3, AlertTriangle, CheckCircle,
  XCircle, ChevronDown, Search, X, Info,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { createLogger } from '../../utils/activityLogger'
import Card from '../Card'
import {
  loadContacts, saveContacts, addHistoryEntry,
  type ContactsConfig, type ContactCategory, type EditableContact,
} from '../../services/editableContacts'

const log = createLogger('infra-marine')

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function ContactEditor({ onClose, onSaved }: Props) {
  const user = useAuthStore(s => s.session?.user.username ?? '')
  const [config, setConfig] = useState<ContactsConfig | null>(null)
  const [activeCat, setActiveCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)
  const [editingContact, setEditingContact] = useState<EditableContact | null>(null)
  const [editCatId, setEditCatId] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadContacts().then(c => {
      setConfig(c)
      if (c.categories.length > 0) setActiveCat(c.categories[0].id)
    })
  }, [])

  if (!config) return <div className="text-center py-8 text-muted-foreground text-sm">Lade Kontakte...</div>

  const category = config.categories.find(c => c.id === activeCat)

  function updateCategory(catId: string, updater: (cat: ContactCategory) => ContactCategory) {
    setConfig(prev => {
      if (!prev) return prev
      return { ...prev, categories: prev.categories.map(c => c.id === catId ? updater(c) : c) }
    })
  }

  function addContact() {
    if (!category) return
    const newContact: EditableContact = {
      id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: '', email: null, phone: null, active: true,
    }
    setEditingContact(newContact)
    setEditCatId(activeCat)
  }

  function saveEditingContact(contact: EditableContact) {
    const catId = editCatId || activeCat
    updateCategory(catId, cat => {
      const exists = cat.contacts.find(c => c.id === contact.id)
      if (exists) {
        return { ...cat, contacts: cat.contacts.map(c => c.id === contact.id ? contact : c) }
      }
      return { ...cat, contacts: [...cat.contacts, contact] }
    })
    setEditingContact(null)
  }

  function deleteContact(catId: string, contactId: string) {
    updateCategory(catId, cat => ({
      ...cat, contacts: cat.contacts.map(c => c.id === contactId ? { ...c, active: false } : c)
    }))
  }

  function permanentDelete(catId: string, contactId: string) {
    updateCategory(catId, cat => ({
      ...cat, contacts: cat.contacts.filter(c => c.id !== contactId)
    }))
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    setToast(null)
    const res = await saveContacts(config, user)
    if (res.success) {
      setToast({ type: 'ok', msg: 'Kontakte gespeichert' })
      log('Kontakte aktualisiert', `${config.categories.reduce((s, c) => s + c.contacts.length, 0)} Kontakte in ${config.categories.length} Kategorien`)
      await addHistoryEntry({ timestamp: new Date().toISOString(), user, action: 'save', detail: `${config.categories.length} Kategorien gespeichert` })
      onSaved()
    } else {
      setToast({ type: 'error', msg: res.error || 'Fehler' })
    }
    setSaving(false)
  }

  const searchLower = search.toLowerCase()
  const filteredContacts = category?.contacts.filter(c =>
    !search || c.name.toLowerCase().includes(searchLower) ||
    (c.email?.toLowerCase().includes(searchLower) ?? false) ||
    (c.phone?.toLowerCase().includes(searchLower) ?? false)
  ) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">Kontakte verwalten - Incident Response</h3>
          <p className="text-[11px] text-muted-foreground">Letzte Aenderung: {config.lastModified ? new Date(config.lastModified).toLocaleString('de-DE') : '-'} von {config.modifiedBy || '-'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Save size={12} />{saving ? 'Speichere...' : 'Speichern'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border hover:text-foreground">Schliessen</button>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
        <AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-yellow-300">Aenderungen sind sofort fuer alle Tool-Nutzer sichtbar. Aenderungen werden protokolliert.</p>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${toast.type === 'ok' ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
          {toast.type === 'ok' ? <CheckCircle size={12} /> : <XCircle size={12} />}{toast.msg}
        </div>
      )}

      <div className="grid grid-cols-[220px_1fr] gap-4">
        {/* Category list */}
        <div className="space-y-1">
          {config.categories.sort((a, b) => a.order - b.order).map(cat => (
            <button key={cat.id} onClick={() => setActiveCat(cat.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${activeCat === cat.id ? 'bg-primary/10 text-foreground border border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'}`}>
              <div className="font-medium">{cat.title}</div>
              <div className="text-[10px] text-muted-foreground">{cat.contacts.filter(c => c.active).length} aktive Kontakte</div>
            </button>
          ))}
        </div>

        {/* Category detail */}
        {category && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{category.title}</h4>
                {category.description && <p className="text-[10px] text-muted-foreground">{category.description}</p>}
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..."
                    className="pl-7 pr-2 py-1 rounded bg-background border border-border text-[11px] text-foreground w-36" />
                </div>
                <button onClick={addContact} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-primary border border-primary/30 hover:bg-primary/10">
                  <Plus size={12} />Hinzufuegen
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/30 text-muted-foreground">
                  <th className="w-10 px-2 py-1.5 font-medium">Aktiv</th>
                  <th className="text-left px-2 py-1.5 font-medium">Name</th>
                  {category.columns.includes('function') && <th className="text-left px-2 py-1.5 font-medium">Funktion</th>}
                  <th className="text-left px-2 py-1.5 font-medium">E-Mail</th>
                  <th className="text-left px-2 py-1.5 font-medium">Telefon</th>
                  <th className="w-20 px-2 py-1.5 font-medium">Aktion</th>
                </tr></thead>
                <tbody>
                  {filteredContacts.map((c, i) => (
                    <tr key={c.id} className={`${!c.active ? 'opacity-40' : ''} ${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={c.active} onChange={e => updateCategory(activeCat, cat => ({
                          ...cat, contacts: cat.contacts.map(x => x.id === c.id ? { ...x, active: e.target.checked } : x)
                        }))} className="rounded accent-primary" />
                      </td>
                      <td className="px-2 py-1.5 font-medium text-foreground">{c.name || '-'}</td>
                      {category.columns.includes('function') && <td className="px-2 py-1.5 text-muted-foreground">{c.function || '-'}</td>}
                      <td className="px-2 py-1.5 text-muted-foreground">{c.email || '-'}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{c.phone || '-'}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingContact({ ...c }); setEditCatId(activeCat) }} className="text-blue-400 hover:text-blue-300"><Edit3 size={12} /></button>
                          {c.active
                            ? <button onClick={() => deleteContact(activeCat, c.id)} className="text-red-400 hover:text-red-300" title="Deaktivieren"><Trash2 size={12} /></button>
                            : <button onClick={() => permanentDelete(activeCat, c.id)} className="text-red-500 hover:text-red-400" title="Endgueltig loeschen"><XCircle size={12} /></button>
                          }
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredContacts.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">Keine Kontakte</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Contact Dialog */}
      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditingContact(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-md w-full mx-4 space-y-3" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-foreground">{editingContact.name ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</h4>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">Name *</label>
                <input value={editingContact.name} onChange={e => setEditingContact({ ...editingContact, name: e.target.value })}
                  className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">Funktion / Rolle</label>
                <input value={editingContact.function || ''} onChange={e => setEditingContact({ ...editingContact, function: e.target.value })}
                  className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">E-Mail</label>
                <input value={editingContact.email || ''} onChange={e => setEditingContact({ ...editingContact, email: e.target.value || null })}
                  className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">Telefon</label>
                <input value={editingContact.phone || ''} onChange={e => setEditingContact({ ...editingContact, phone: e.target.value || null })}
                  className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">Notiz (intern)</label>
                <input value={editingContact.note || ''} onChange={e => setEditingContact({ ...editingContact, note: e.target.value })}
                  className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={editingContact.active} onChange={e => setEditingContact({ ...editingContact, active: e.target.checked })} className="rounded accent-primary" />
                Aktiv
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setEditingContact(null)} className="px-3 py-1.5 rounded text-xs text-muted-foreground border border-border hover:text-foreground">Abbrechen</button>
              <button onClick={() => editingContact.name.trim() && saveEditingContact(editingContact)} disabled={!editingContact.name.trim()}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Uebernehmen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
