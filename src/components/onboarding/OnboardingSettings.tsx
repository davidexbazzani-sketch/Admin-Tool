// ── Onboarding-Einstellungen ──────────────────────────────────────────────────
// Pflege aller Inhalte der generierten HTML: Links (ServiceNow etc. — werden
// nachgereicht, bis dahin Platzhalter), Laufwerk-I-Mapping, Konferenzraeume
// (inkl. Raum-Postfach fuer den Outlook-Deeplink), IT-Kontakt, Ansprechpartner.

import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, Trash2, Link2, HardDrive, DoorOpen, Headset, Users, Upload, ImagePlus, X, FolderOpen } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../electronAPI'
import {
  loadOnboardingSettings, saveOnboardingSettings, storeRoomPhotoFromFile, normalizeRoomKey,
  type OnboardingSettings as Settings, type OnboardingLinks,
} from '../../services/onboarding'

const IMG_FILTERS = [{ name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]

const LINK_FIELDS: { key: keyof OnboardingLinks; label: string; hint: string }[] = [
  { key: 'orderHardwareSoftware', label: 'Software & Hardware bestellen', hint: 'ServiceNow Portal – Service Portal' },
  { key: 'createTicket',          label: 'Ticket erstellen',              hint: 'Submit a Support Case (Incident)' },
  { key: 'fileshareAccess',       label: 'Laufwerk I: Zugriff beantragen', hint: 'Fileshare Access Request' },
  { key: 'passwordReset',         label: 'Kennwort-Zurücksetzung',        hint: 'Microsoft Online-Kennwortzurücksetzung' },
  { key: 'mySignIns',             label: 'My Sign-Ins / Authenticator',   hint: 'Security Info | Microsoft' },
  { key: 'itWiki',                label: 'IT-Tipps / FAQ',                hint: 'unser IT-Wiki' },
  { key: 'sharepoint',            label: 'SharePoint / Intranet',         hint: 'SKF Marine Intranet – Home' },
  { key: 'canteenMenu',           label: 'Kantinenplan',                  hint: 'Essenswochenplan — erscheint unter „Allgemeines"' },
  { key: 'timeTracking',          label: 'Zeiterfassung',                 hint: 'Portal — öffnet sich über die Kachel „Zeiterfassung"' },
]

export default function OnboardingSettingsPanel() {
  const authUser = useAuthStore(s => s.session?.user)
  const currentUser = authUser?.displayName || authUser?.username || 'unbekannt'

  const [cfg, setCfg] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')
  const [photoBusy, setPhotoBusy] = useState('')   // roomId oder 'bulk'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await loadOnboardingSettings()
      if (!cancelled) { setCfg(s); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  function update(mut: (s: Settings) => Settings) {
    setCfg(prev => (prev ? mut(structuredClone(prev)) : prev))
    setDirty(true); setMsg('')
  }

  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      const ok = await saveOnboardingSettings(cfg, currentUser)
      setMsg(ok ? 'Gespeichert ✓' : 'Speichern fehlgeschlagen (Netzlaufwerk?)')
      if (ok) setDirty(false)
    } finally { setSaving(false) }
  }

  /** Aktualisiert cfg UND speichert sofort (Fotos liegen dann schon zentral). */
  async function updateAndSave(mut: (s: Settings) => Settings): Promise<void> {
    if (!cfg) return
    const next = mut(structuredClone(cfg))
    setCfg(next)
    const ok = await saveOnboardingSettings(next, currentUser)
    if (ok) setDirty(false)
    else { setDirty(true); setMsg('Foto gespeichert, aber Einstellungen konnten nicht geschrieben werden — bitte manuell speichern.') }
  }

  // Einzelnes Raumfoto hochladen (landet zentral unter onboarding/room-photos/)
  async function uploadRoomPhoto(roomId: string) {
    if (photoBusy) return
    const file = await api().openFileDialog(IMG_FILTERS)
    if (!file) return
    setPhotoBusy(roomId); setMsg('')
    try {
      const rel = await storeRoomPhotoFromFile(roomId, file)
      if (!rel) { setMsg('Foto konnte nicht hochgeladen werden (Format? Netzlaufwerk?).'); return }
      await updateAndSave(s => { const r = s.rooms.find(x => x.id === roomId); if (r) r.photo = rel; return s })
      setMsg('Foto hochgeladen ✓ — erscheint in allen ab jetzt generierten Dashboards.')
    } finally { setPhotoBusy('') }
  }

  // Mehrere Fotos auf einmal: Dateiname = Raumname (z. B. "Port24.jpg" -> PORT 24)
  async function bulkImportPhotos() {
    if (!cfg || photoBusy) return
    const files = await api().openFilesDialog(IMG_FILTERS)
    if (!files || files.length === 0) return
    setPhotoBusy('bulk'); setMsg('')
    try {
      const matched: string[] = []
      const skipped: string[] = []
      const updates = new Map<string, string>()   // roomId -> rel
      for (const f of files) {
        const base = (f.split(/[\\/]/).pop() || '').replace(/\.[^.]+$/, '')
        const key = normalizeRoomKey(base)
        const room = cfg.rooms.find(r => normalizeRoomKey(r.name) === key || normalizeRoomKey(r.id) === key)
        if (!room) { skipped.push(base); continue }
        const rel = await storeRoomPhotoFromFile(room.id, f)
        if (rel) { updates.set(room.id, rel); matched.push(`${base} → ${room.name}`) }
        else skipped.push(base)
      }
      if (updates.size > 0) {
        await updateAndSave(s => { for (const r of s.rooms) { const rel = updates.get(r.id); if (rel) r.photo = rel } return s })
      }
      setMsg(`${matched.length} Foto(s) zugeordnet${skipped.length ? ` · nicht zugeordnet: ${skipped.join(', ')}` : ''}`)
    } finally { setPhotoBusy('') }
  }

  if (loading || !cfg) {
    return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade Einstellungen…</div>
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary'

  return (
    <div className="max-w-4xl space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {dirty ? 'Einstellungen speichern' : 'Gespeichert'}
        </button>
        {msg && <span className={`text-xs ${msg.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>}
        <span className="text-[11px] text-muted-foreground ml-auto">Leere Felder werden in der HTML automatisch ausgeblendet.</span>
      </div>

      {/* Links */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Link2 size={14} className="text-blue-400" />Links (IT & Allgemeines)</h3>
        {LINK_FIELDS.map(f => (
          <div key={f.key} className="grid grid-cols-[240px_1fr] gap-3 items-center">
            <div>
              <p className="text-xs font-semibold text-foreground">{f.label}</p>
              <p className="text-[10px] text-muted-foreground">{f.hint}</p>
            </div>
            <input value={cfg.links[f.key]} onChange={e => update(s => { s.links[f.key] = e.target.value; return s })}
              placeholder="https://… (wird nachgereicht)" className={inputCls} />
          </div>
        ))}
      </section>

      {/* Laufwerk I */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><HardDrive size={14} className="text-blue-400" />Laufwerk I selbst mappen</h3>
        <div className="grid grid-cols-[240px_1fr] gap-3 items-center">
          <p className="text-xs font-semibold text-foreground">Pfad zur Bat-Datei (Public-Share)</p>
          <input value={cfg.driveMapping.batPath} onChange={e => update(s => { s.driveMapping.batPath = e.target.value; return s })} className={inputCls} />
        </div>
        <div className="grid grid-cols-[240px_1fr] gap-3 items-center">
          <p className="text-xs font-semibold text-foreground">Manueller Befehl (Fallback)</p>
          <input value={cfg.driveMapping.manualCommand} onChange={e => update(s => { s.driveMapping.manualCommand = e.target.value; return s })} className={inputCls} />
        </div>
      </section>

      {/* Konferenzraeume */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><DoorOpen size={14} className="text-blue-400" />Konferenzräume</h3>
          <button onClick={bulkImportPhotos} disabled={!!photoBusy}
            title="Mehrere Bilder auswählen — Zuordnung über den Dateinamen (z. B. Port24.jpg → PORT 24, Hafen.jpg → Hafen)"
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
            {photoBusy === 'bulk' ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}Fotos importieren (Dateiname = Raumname)
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Mit gepflegter <strong>Raum-Postfach-Adresse</strong> öffnet der Klick in der HTML direkt einen neuen Outlook-Termin mit dem Raum.
          Hochgeladene Fotos landen zentral auf dem Netzlaufwerk und erscheinen in allen ab dann generierten Dashboards.
        </p>
        <div className="grid grid-cols-[1fr_70px_1fr_1.4fr_1fr_28px] gap-1.5 text-[10px] font-semibold text-muted-foreground px-1">
          <span>Name</span><span>Plätze</span><span>Ort</span><span>Raum-Postfach (SMTP)</span><span>Foto</span><span></span>
        </div>
        {cfg.rooms.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[1fr_70px_1fr_1.4fr_1fr_28px] gap-1.5 items-center">
            <input value={r.name} onChange={e => update(s => { s.rooms[i].name = e.target.value; return s })} className={inputCls} />
            <input type="number" value={r.capacity} onChange={e => update(s => { s.rooms[i].capacity = Number(e.target.value) || 0; return s })} className={inputCls} />
            <input value={r.location} onChange={e => update(s => { s.rooms[i].location = e.target.value; return s })} className={inputCls} />
            <input value={r.mailbox} onChange={e => update(s => { s.rooms[i].mailbox = e.target.value; return s })} placeholder="raum@skf.com" className={inputCls} />
            <div className="flex items-center gap-1 min-w-0">
              {r.photo ? (
                <>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 truncate" title={r.photo}>✓ Foto</span>
                  <button onClick={() => uploadRoomPhoto(r.id)} disabled={!!photoBusy} title="Foto ersetzen"
                    className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-40">
                    {photoBusy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  </button>
                  <button onClick={() => void updateAndSave(s => { const x = s.rooms.find(q => q.id === r.id); if (x) x.photo = undefined; return s })}
                    disabled={!!photoBusy} title="Foto-Zuordnung entfernen"
                    className="p-1 rounded text-muted-foreground hover:text-red-400 disabled:opacity-40"><X size={12} /></button>
                </>
              ) : (
                <button onClick={() => uploadRoomPhoto(r.id)} disabled={!!photoBusy}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                  {photoBusy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}Hochladen
                </button>
              )}
            </div>
            <button onClick={() => update(s => { s.rooms = s.rooms.filter((_, j) => j !== i); return s })}
              className="p-1 rounded text-muted-foreground hover:text-red-400"><Trash2 size={13} /></button>
          </div>
        ))}
        <button onClick={() => update(s => { s.rooms.push({ id: 'room_' + Date.now().toString(36), name: '', capacity: 0, location: '', mailbox: '' }); return s })}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={11} />Raum hinzufügen</button>
      </section>

      {/* IT-Kontakt */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Headset size={14} className="text-blue-400" />IT-Kontakt (Fallback für „Ihr Ansprechpartner" + Footer)</h3>
        <div className="grid grid-cols-3 gap-2">
          <input value={cfg.itContact.name} onChange={e => update(s => { s.itContact.name = e.target.value; return s })} placeholder="Name (z. B. Deine IT)" className={inputCls} />
          <input value={cfg.itContact.email} onChange={e => update(s => { s.itContact.email = e.target.value; return s })} placeholder="E-Mail" className={inputCls} />
          <input value={cfg.itContact.phone} onChange={e => update(s => { s.itContact.phone = e.target.value; return s })} placeholder="Telefon / Durchwahl" className={inputCls} />
        </div>
      </section>

      {/* Allgemeine Ansprechpartner */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Users size={14} className="text-blue-400" />Ansprechpartner für „Allgemeines"</h3>
        {cfg.generalInfo.contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1.2fr_1fr_28px] gap-1.5 items-center">
            <input value={c.role} onChange={e => update(s => { s.generalInfo.contacts[i].role = e.target.value; return s })} placeholder="Rolle (z. B. Empfang)" className={inputCls} />
            <input value={c.name} onChange={e => update(s => { s.generalInfo.contacts[i].name = e.target.value; return s })} placeholder="Name" className={inputCls} />
            <input value={c.email} onChange={e => update(s => { s.generalInfo.contacts[i].email = e.target.value; return s })} placeholder="E-Mail" className={inputCls} />
            <input value={c.phone} onChange={e => update(s => { s.generalInfo.contacts[i].phone = e.target.value; return s })} placeholder="Telefon" className={inputCls} />
            <button onClick={() => update(s => { s.generalInfo.contacts = s.generalInfo.contacts.filter((_, j) => j !== i); return s })}
              className="p-1 rounded text-muted-foreground hover:text-red-400"><Trash2 size={13} /></button>
          </div>
        ))}
        <button onClick={() => update(s => { s.generalInfo.contacts.push({ role: '', name: '', email: '', phone: '' }); return s })}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={11} />Ansprechpartner hinzufügen</button>
      </section>

      {/* Ordner-Verknuepfungen (Explorer) */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><FolderOpen size={14} className="text-blue-400" />Ordner-Verknüpfungen (Explorer)</h3>
        <p className="text-[11px] text-muted-foreground">
          Diese Ordner lassen sich aus dem Dashboard heraus direkt im <strong>Windows-Explorer</strong> öffnen. Beim Verteilen wird dafür ein kleiner Handler auf dem Ziel-PC eingerichtet; der Mitarbeiter bestätigt beim ersten Klick einmalig „Immer zulassen". Ohne Handler (z. B. bei „Nur lokal exportieren") zeigt der Link den Ordnerinhalt im Browser.
        </p>
        <div className="grid grid-cols-[1fr_1.6fr_140px_28px] gap-1.5 text-[10px] font-semibold text-muted-foreground px-1">
          <span>Beschriftung</span><span>Pfad (UNC oder lokal)</span><span>Bereich</span><span></span>
        </div>
        {cfg.folderLinks.map((f, i) => (
          <div key={f.id} className="grid grid-cols-[1fr_1.6fr_140px_28px] gap-1.5 items-center">
            <input value={f.label} onChange={e => update(s => { s.folderLinks[i].label = e.target.value; return s })} placeholder="z. B. Abteilungsordner" className={inputCls} />
            <input value={f.path} onChange={e => update(s => { s.folderLinks[i].path = e.target.value; return s })} placeholder="\\W3172\SKF Marine\..." className={`${inputCls} font-mono`} />
            <select value={f.section} onChange={e => update(s => { s.folderLinks[i].section = e.target.value as 'it' | 'general'; return s })} className={inputCls}>
              <option value="it">Kachel „IT"</option>
              <option value="general">Kachel „Allgemeines"</option>
            </select>
            <button onClick={() => update(s => { s.folderLinks = s.folderLinks.filter((_, j) => j !== i); return s })}
              className="p-1 rounded text-muted-foreground hover:text-red-400"><Trash2 size={13} /></button>
          </div>
        ))}
        <button onClick={() => update(s => { s.folderLinks.push({ id: 'fl_' + Date.now().toString(36), label: '', path: '', section: 'it' }); return s })}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={11} />Ordner hinzufügen</button>
      </section>
    </div>
  )
}
