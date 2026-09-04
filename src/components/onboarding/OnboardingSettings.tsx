// ── Onboarding-Einstellungen ──────────────────────────────────────────────────
// Pflege aller Inhalte der generierten HTML — geordnet nach den 6 Haupt-Kacheln
// des Dashboards: IT, Konferenzräume, Allgemeines, Orientierung, Zeiterfassung,
// Ansprechpartner. Ein Bereich pro Kachel.

import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, Trash2, Link2, DoorOpen, Headset, Users, Upload, ImagePlus, X, FolderOpen, Wrench, ChevronUp, ChevronDown, Map as MapIcon, Clock, Mail, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../electronAPI'
import {
  loadOnboardingSettings, saveOnboardingSettings, storeRoomPhotoFromFile, normalizeRoomKey,
  type OnboardingSettings as Settings,
  type SelfHelpCategory, type SelfHelpType,
} from '../../services/onboarding'
import { readCentralAdUsers } from '../../services/adUserDirectory'

const IMG_FILTERS = [{ name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]

// Kategorien der IT-Selbsthilfe-Kacheln (Reihenfolge = Anzeige im Dashboard)
const SELFHELP_CATS: { key: SelfHelpCategory; label: string; hint: string }[] = [
  { key: 'bestellung', label: 'Bestellen & Melden  (oben)', hint: 'Hardware/Software bestellen, Ticket, IT Informieren' },
  { key: 'konto',      label: 'Konto & Sicherheit',         hint: 'Passwort, Authenticator …' },
  { key: 'geraete',    label: 'Geräte & Reparieren',        hint: 'Drucker, Teams, Outlook …' },
  { key: 'ordner',     label: 'Ordner & Laufwerke',         hint: 'Laufwerk I, Zugriffe' },
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
  const [departments, setDepartments] = useState<string[]>([])   // Vorschläge fürs Abteilungsfeld

  // Bekannte Abteilungen aus dem zentralen AD-Verzeichnis (nur Cache lesen).
  useEffect(() => {
    let cancelled = false
    readCentralAdUsers().then(dir => {
      if (cancelled || !dir) return
      const set = new Set<string>()
      for (const u of dir.users) { const d = (u.department || '').trim(); if (d) set.add(d) }
      setDepartments([...set].sort((a, b) => a.localeCompare(b, 'de')))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

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

  // „Ausblenden"-Schalter (Auge) hinter einem Feld: ausgeblendete Inhalte werden bei
  // ALLEN künftigen Verteilungen NICHT mehr mitgegeben (der Wert bleibt gespeichert).
  const hideBtn = (k: string) => {
    const off = !!cfg.hidden?.[k]
    return (
      <button type="button" onClick={() => update(s => { s.hidden = { ...(s.hidden ?? {}), [k]: !s.hidden?.[k] }; return s })}
        title={off ? 'Ausgeblendet — wird beim Verteilen NICHT mitgegeben. Klick = wieder einblenden.' : 'Sichtbar — wird verteilt. Klick = ausblenden (Wert bleibt gespeichert).'}
        className={`shrink-0 inline-flex items-center justify-center p-1.5 rounded-md border ${off ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-border text-muted-foreground hover:text-foreground'}`}>
        {off ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    )
  }

  return (
    <div className="max-w-4xl space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {dirty ? 'Einstellungen speichern' : 'Gespeichert'}
        </button>
        {msg && <span className={`text-xs ${msg.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>}
        <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">Leere Felder werden ausgeblendet · <Eye size={11} className="inline" />/<EyeOff size={11} className="inline text-amber-400" /> = Feld verteilen / nicht verteilen (Wert bleibt gespeichert).</span>
      </div>

      {/* ══════════ 1. IT ══════════ */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Wrench size={15} className="text-emerald-400" />1 · IT</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Die Kacheln der IT-Kachel, gruppiert wie im Dashboard. Typ je Kachel:{' '}
          <strong>Skript</strong> (.ps1) · <strong>Programm</strong> (.exe/.lnk/.bat – startet wie ein Doppelklick) · <strong>Link</strong> (URL) · <strong>IT-Kontakt</strong> (Telefon &amp; E-Mail aus Bereich 6). Sortieren mit <ChevronUp size={10} className="inline" />/<ChevronDown size={10} className="inline" />.
        </p>
        {SELFHELP_CATS.map(cat => {
          const rows = cfg.selfHelpTiles
            .map((t, i) => ({ t, i }))
            .filter(x => x.t.category === cat.key)
            .sort((a, b) => (a.t.order || 0) - (b.t.order || 0))
          return (
            <div key={cat.key} className="space-y-1.5 pt-1.5 border-t border-border/50 first:border-t-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-foreground">{cat.label}</span>
                <span className="text-[10px] text-muted-foreground">{cat.hint}</span>
              </div>
              {rows.map(({ t, i }, pos) => (
                <div key={t.id} className="rounded border border-border/60 bg-background/40 p-1.5 space-y-1">
                  <div className="grid grid-cols-[1.3fr_140px_1.7fr_auto] gap-1.5 items-center">
                    <input value={t.label} onChange={e => update(s => { s.selfHelpTiles[i].label = e.target.value; return s })} placeholder="Beschriftung" className={inputCls} />
                    <select value={t.type} onChange={e => update(s => { s.selfHelpTiles[i].type = e.target.value as SelfHelpType; return s })} className={inputCls}>
                      <option value="skript">Skript (.ps1)</option>
                      <option value="programm">Programm (.exe/.lnk/.bat)</option>
                      <option value="link">Link (URL)</option>
                      <option value="kontakt">IT-Kontakt</option>
                    </select>
                    {t.type === 'kontakt'
                      ? <span className="text-[10px] text-muted-foreground px-1 self-center">Telefon &amp; E-Mail aus Bereich 6</span>
                      : <input value={t.path} onChange={e => update(s => { s.selfHelpTiles[i].path = e.target.value; return s })} placeholder={t.type === 'link' ? 'https://…' : t.type === 'programm' ? '\\\\W3172\\…\\name.bat  (oder .exe/.lnk)' : '\\\\W3172\\…\\name.ps1'} className={`${inputCls} font-mono`} />}
                    <div className="flex items-center gap-0.5">
                      <button title="nach oben" disabled={pos === 0}
                        onClick={() => update(s => {
                          const ct = s.selfHelpTiles.filter(x => x.category === cat.key).sort((a, b) => (a.order || 0) - (b.order || 0))
                          if (pos <= 0) return s
                          const tmp = ct[pos].order; ct[pos].order = ct[pos - 1].order; ct[pos - 1].order = tmp; return s })}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp size={13} /></button>
                      <button title="nach unten" disabled={pos === rows.length - 1}
                        onClick={() => update(s => {
                          const ct = s.selfHelpTiles.filter(x => x.category === cat.key).sort((a, b) => (a.order || 0) - (b.order || 0))
                          if (pos >= ct.length - 1) return s
                          const tmp = ct[pos].order; ct[pos].order = ct[pos + 1].order; ct[pos + 1].order = tmp; return s })}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown size={13} /></button>
                      <button title="entfernen"
                        onClick={() => update(s => { s.selfHelpTiles = s.selfHelpTiles.filter(x => x.id !== t.id); return s })}
                        className="p-0.5 rounded text-muted-foreground hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {(t.type === 'skript' || t.type === 'programm') && (
                    <input value={t.info ?? ''} onChange={e => update(s => { s.selfHelpTiles[i].info = e.target.value; return s })} placeholder="Hinweis (optional) – kleines i-Symbol auf der Kachel" className={`${inputCls} w-full`} />
                  )}
                </div>
              ))}
              <button onClick={() => update(s => {
                  const maxO = s.selfHelpTiles.filter(x => x.category === cat.key).reduce((m, x) => Math.max(m, x.order || 0), 0)
                  s.selfHelpTiles.push({ id: 'sht_' + Date.now().toString(36), label: '', category: cat.key, type: 'skript', path: '', order: maxO + 10 })
                  return s })}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={11} />Kachel hinzufügen</button>
            </div>
          )
        })}

        {/* Ordner-Verknüpfungen (Explorer) — gehören zur IT-Kachel */}
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5"><FolderOpen size={13} className="text-blue-400" />Ordner-Verknüpfungen (Explorer)</span>
          <p className="text-[10px] text-muted-foreground">Öffnen sich aus dem Dashboard direkt im Windows-Explorer (Handler wird beim Verteilen eingerichtet). „Bereich" = in welcher Kachel der Link erscheint.</p>
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
        </div>
      </section>

      {/* ══════════ 2. Konferenzräume ══════════ */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><DoorOpen size={15} className="text-blue-400" />2 · Konferenzräume</h3>
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

      {/* ══════════ 3. Allgemeines ══════════ */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Link2 size={15} className="text-blue-400" />3 · Allgemeines</h3>
        <p className="text-[11px] text-muted-foreground">Inhalte der großen „Allgemeines"-Kachel auf der Startseite.</p>
        <div className="grid grid-cols-[240px_1fr] gap-3 items-center">
          <div><p className="text-xs font-semibold text-foreground">SKF Marine Intranet</p><p className="text-[10px] text-muted-foreground">SharePoint – News, Dokumente</p></div>
          <div className="flex items-center gap-1.5"><input value={cfg.links.sharepoint} onChange={e => update(s => { s.links.sharepoint = e.target.value; return s })} placeholder="https://…" className={inputCls} />{hideBtn('sharepoint')}</div>
        </div>
        <div className="grid grid-cols-[240px_1fr] gap-3 items-center">
          <div><p className="text-xs font-semibold text-foreground">Kantinenplan</p><p className="text-[10px] text-muted-foreground">Essenswochenplan</p></div>
          <div className="flex items-center gap-1.5"><input value={cfg.links.canteenMenu} onChange={e => update(s => { s.links.canteenMenu = e.target.value; return s })} placeholder="https://…" className={inputCls} />{hideBtn('canteen')}</div>
        </div>
        <div className="grid grid-cols-[240px_1fr] gap-3 items-center">
          <div><p className="text-xs font-semibold text-foreground">Film (MP4 – empfohlen – oder HTML)</p><p className="text-[10px] text-muted-foreground">Pfad auf dem Netzlaufwerk – wird beim Verteilen mitkopiert und ist in „Allgemeines" abspielbar. <strong>MP4</strong> spielt am saubersten (nativer Player, Klick = Pause/Weiter); HTML nur als Rückfall. Leer = kein Film. Mit dem Auge rechts ausblendbar (Pfad bleibt, wird aber nicht verteilt).</p></div>
          <div className="flex items-center gap-1.5"><input value={cfg.filmPath} onChange={e => update(s => { s.filmPath = e.target.value; return s })} placeholder="\\W3172\SKF Marine\...\skf-marine-film.mp4" className={`${inputCls} font-mono`} />{hideBtn('film')}</div>
        </div>
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5"><Mail size={13} className="text-blue-400" />Mail-Shortcuts</span>
            <span className="text-[10px] text-muted-foreground">Klick öffnet Outlook mit vorbelegtem Empfänger</span>
          </div>
          <div className="grid grid-cols-[1fr_1.4fr_28px] gap-1.5 text-[10px] font-semibold text-muted-foreground px-1">
            <span>Beschriftung</span><span>E-Mail-Empfänger</span><span></span>
          </div>
          {cfg.generalMails.map((m, i) => (
            <div key={m.id} className="grid grid-cols-[1fr_1.4fr_28px] gap-1.5 items-center">
              <input value={m.label} onChange={e => update(s => { s.generalMails[i].label = e.target.value; return s })} placeholder="z. B. Kontaktiere HR" className={inputCls} />
              <input value={m.email} onChange={e => update(s => { s.generalMails[i].email = e.target.value; return s })} placeholder="name@skf.com" className={`${inputCls} font-mono`} />
              <button onClick={() => update(s => { s.generalMails = s.generalMails.filter((_, j) => j !== i); return s })}
                className="p-1 rounded text-muted-foreground hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
          <button onClick={() => update(s => { s.generalMails.push({ id: 'gm_' + Date.now().toString(36), label: '', email: '' }); return s })}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={11} />Mail-Shortcut hinzufügen</button>
        </div>
      </section>

      {/* ══════════ 4. Orientierung ══════════ */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><MapIcon size={15} className="text-blue-400" />4 · Orientierung</h3>
        <p className="text-[11px] text-muted-foreground">
          Der Lageplan (Gebäude, Etagen, Wege, „Dein Büro") wird im eigenen Tab <strong>„Karten-Editor"</strong> gepflegt.
        </p>
      </section>

      {/* ══════════ 5. Zeiterfassung ══════════ */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Clock size={15} className="text-blue-400" />5 · Zeiterfassung</h3>
        <div className="grid grid-cols-[240px_1fr] gap-3 items-center">
          <div><p className="text-xs font-semibold text-foreground">Zeiterfassungs-Portal</p><p className="text-[10px] text-muted-foreground">Öffnet über die Kachel „Zeiterfassung"</p></div>
          <div className="flex items-center gap-1.5"><input value={cfg.links.timeTracking} onChange={e => update(s => { s.links.timeTracking = e.target.value; return s })} placeholder="https://…" className={inputCls} />{hideBtn('timeTracking')}</div>
        </div>
      </section>

      {/* ══════════ 6. Ansprechpartner ══════════ */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Users size={15} className="text-blue-400" />6 · Ansprechpartner</h3>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Headset size={12} className="text-blue-400" /><strong>IT-Kontakt</strong> — Fallback für „Ihr Ansprechpartner", Footer und die Kachel „IT Informieren".</p>
        <div className="grid grid-cols-3 gap-2">
          <input value={cfg.itContact.name} onChange={e => update(s => { s.itContact.name = e.target.value; return s })} placeholder="Name (z. B. Deine IT)" className={inputCls} />
          <input value={cfg.itContact.email} onChange={e => update(s => { s.itContact.email = e.target.value; return s })} placeholder="E-Mail" className={inputCls} />
          <input value={cfg.itContact.phone} onChange={e => update(s => { s.itContact.phone = e.target.value; return s })} placeholder="Telefon / Durchwahl" className={inputCls} />
        </div>
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            Weitere Ansprechpartner (Kachel <strong>„Ihr(e) Ansprechpartner"</strong>). Mit gesetzter <strong>Abteilung</strong> nur für Mitarbeiter dieser Abteilung sichtbar; ohne Abteilung für alle.
          </p>
          <div className="grid grid-cols-[1fr_1fr_1.2fr_1fr_1fr_28px] gap-1.5 text-[10px] font-semibold text-muted-foreground px-1">
            <span>Rolle</span><span>Name</span><span>E-Mail</span><span>Telefon</span><span>Abteilung (leer = alle)</span><span></span>
          </div>
          {cfg.generalInfo.contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.2fr_1fr_1fr_28px] gap-1.5 items-center">
              <input value={c.role} onChange={e => update(s => { s.generalInfo.contacts[i].role = e.target.value; return s })} placeholder="Rolle (z. B. Pate)" className={inputCls} />
              <input value={c.name} onChange={e => update(s => { s.generalInfo.contacts[i].name = e.target.value; return s })} placeholder="Name" className={inputCls} />
              <input value={c.email} onChange={e => update(s => { s.generalInfo.contacts[i].email = e.target.value; return s })} placeholder="E-Mail" className={inputCls} />
              <input value={c.phone} onChange={e => update(s => { s.generalInfo.contacts[i].phone = e.target.value; return s })} placeholder="Telefon" className={inputCls} />
              <input value={c.department ?? ''} onChange={e => update(s => { s.generalInfo.contacts[i].department = e.target.value; return s })} placeholder="Abteilung" className={inputCls} list="onb-departments" />
              <button onClick={() => update(s => { s.generalInfo.contacts = s.generalInfo.contacts.filter((_, j) => j !== i); return s })}
                className="p-1 rounded text-muted-foreground hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
          {departments.length > 0 && (
            <datalist id="onb-departments">{departments.map(d => <option key={d} value={d} />)}</datalist>
          )}
          <button onClick={() => update(s => { s.generalInfo.contacts.push({ role: '', name: '', email: '', phone: '', department: '' }); return s })}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={11} />Ansprechpartner hinzufügen</button>
        </div>
      </section>
    </div>
  )
}
