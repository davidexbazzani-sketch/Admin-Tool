// ── Personen-Stammdaten: "Stammbaum"-Ansicht im Dossier ──────────────────────
// Zeigt ALLE im Tool bekannten Infos zu einer Person als aufklappbaren Baum:
// Organisation, Kontakt & Arbeitsplatz, Hardware, Postfaecher & Gruppen.
// Jede Datenquelle laedt unabhaengig — die UI blockiert nie.

import { useEffect, useState, type ReactNode } from 'react'
import {
  ChevronDown, ChevronRight, Loader2, Building2, Phone, Laptop, Mail,
  Info as InfoIcon, UserCircle2, AlertTriangle, Pencil, Check, X, Plus, Circle,
} from 'lucide-react'
import {
  fetchAdPersonInfo, findEmployeeRecords, findAssignedHardware, findPhoneEntries,
  resolveSamByName, extractExtension, checkPersonOnline,
  type AdPersonInfo, type EmployeeRecords, type AssignedHardware, type PersonOnline,
} from '../../services/personMasterData'
import { formatGermanDate } from '../../services/employees'
import { modelTypeDisplay } from '../../services/endpointDevices'
import type { PhoneEntry } from '../../services/phoneAssignment'

/** Relative Zeit + Datum, z. B. "vor 2 Tagen (12.08.2026)". */
function fmtLastSeen(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const abs = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  let rel: string
  if (mins < 2) rel = 'gerade eben'
  else if (mins < 60) rel = `vor ${mins} Min.`
  else if (mins < 60 * 24) rel = `vor ${Math.floor(mins / 60)} Std.`
  else {
    const days = Math.floor(mins / (60 * 24))
    rel = days === 1 ? 'gestern' : `vor ${days} Tagen`
  }
  return `${rel} (${abs})`
}

// ── kleine Bausteine ─────────────────────────────────────────────────────────

/** Eine Zeile im Baum: Beschriftung, Wert, Quelle. */
function Row({ label, value, source, children }: { label: string; value?: ReactNode; source?: string; children?: ReactNode }) {
  if (value === undefined && !children) return null
  return (
    <div className="flex items-start gap-2 py-1 pl-1">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-px">{label}</span>
      <span className="text-sm text-foreground min-w-0 flex-1 break-words">{value ?? children}</span>
      {source && <span className="text-[10px] text-muted-foreground/60 shrink-0 pt-0.5" title={`Quelle: ${source}`}>{source}</span>}
    </div>
  )
}

/** Aufklappbarer Ast des Stammbaums. */
function TreeSection({ icon, title, badge, loading, defaultOpen = true, children }: {
  icon: ReactNode; title: string; badge?: string; loading?: boolean; defaultOpen?: boolean; children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="relative pl-5">
      {/* Stammlinie */}
      <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
      <div className="absolute left-1.5 top-4 w-3 h-px bg-border" />
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-accent/20 text-left"
        >
          {open ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
          <span className="text-blue-400 shrink-0">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/25">{badge}</span>}
          {loading && <Loader2 size={12} className="animate-spin text-muted-foreground ml-auto" />}
        </button>
        {open && <div className="px-3 py-2 border-t border-border">{children}</div>}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground italic py-1">{text}</p>
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export function PersonMasterData({ name, sam, onOpenPerson, manualRoom, onSaveRoom }: {
  name: string
  sam?: string
  onOpenPerson?: (name: string, sam?: string) => void
  /** Manuell im Dossier gepflegte Raum-/Arbeitsplatznummer. */
  manualRoom?: string
  /** Speichert die manuell eingetragene Raumnummer ins Dossier (leer = löschen). */
  onSaveRoom?: (room: string) => Promise<void> | void
}) {
  const [resolvedSam, setResolvedSam] = useState<string | undefined>(sam)
  const [ad, setAd] = useState<AdPersonInfo | null>(null)
  const [adLoading, setAdLoading] = useState(true)
  const [records, setRecords] = useState<EmployeeRecords | null>(null)
  const [recLoading, setRecLoading] = useState(true)
  const [hw, setHw] = useState<AssignedHardware | null>(null)
  const [hwLoading, setHwLoading] = useState(true)
  const [phones, setPhones] = useState<PhoneEntry[] | null>(null)
  const [phLoading, setPhLoading] = useState(true)
  const [groupsOpen, setGroupsOpen] = useState(false)
  // Online-Status (live-Check auf den zugewiesenen Rechnern)
  const [online, setOnline] = useState<PersonOnline | null>(null)
  const [onlineLoading, setOnlineLoading] = useState(false)
  // Raum/Arbeitsplatz manuell bearbeiten
  const [roomEditing, setRoomEditing] = useState(false)
  const [roomDraft, setRoomDraft] = useState('')
  const [roomSaving, setRoomSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Corp-ID ggf. aus dem zentralen AD-Cache aufloesen (billig), dann alle
    // Quellen UNABHAENGIG laden — jeder Block erscheint, sobald er fertig ist.
    ;(async () => {
      let effSam = sam
      if (!effSam) {
        effSam = await resolveSamByName(name)
        if (!cancelled && effSam) setResolvedSam(effSam)
      }

      fetchAdPersonInfo(name, effSam).then(r => {
        if (cancelled) return
        setAd(r); setAdLoading(false)
        if (!effSam && r.sam) setResolvedSam(r.sam)
      })
      findEmployeeRecords(name, effSam).then(r => { if (!cancelled) { setRecords(r); setRecLoading(false) } })
      findAssignedHardware(name, effSam).then(r => {
        if (cancelled) return
        setHw(r); setHwLoading(false)
        // Online-Status live auf den zugewiesenen Rechnern pruefen (best effort,
        // kurze Timeouts). Nur wenn Corp-ID + mindestens ein Rechner bekannt.
        const hosts = [...r.inventory.map(i => i.name), ...r.endpoint.map(d => d.hostname || d.serial)].filter(Boolean)
        if (effSam && hosts.length > 0) {
          setOnlineLoading(true)
          checkPersonOnline(effSam, hosts).then(o => { if (!cancelled) { setOnline(o); setOnlineLoading(false) } })
        }
      })
      findPhoneEntries(name).then(r => { if (!cancelled) { setPhones(r); setPhLoading(false) } })
    })()

    return () => { cancelled = true }
  }, [name, sam])

  const emp = records?.employee
  const dep = records?.departure

  // Durchwahl: bevorzugt Durchwahlliste, sonst letzte 4 Stellen der AD-FESTNETZ-
  // Nummer (telephoneNumber/ipPhone) — Handynummern werden bewusst ignoriert.
  const phoneEntry = phones && phones.length > 0 ? phones[0] : null
  const adExt = extractExtension(ad?.telephone) || extractExtension(ad?.ipPhone)
  const durchwahl = phoneEntry?.nummer != null ? String(phoneEntry.nummer) : (adExt || (emp?.phoneExtension || ''))
  const durchwahlSource = phoneEntry ? 'Durchwahlliste' : (adExt ? 'AD' : (emp?.phoneExtension ? 'Mitarbeiterverwaltung' : ''))

  const hwCount = (hw?.inventory.length ?? 0) + (hw?.endpoint.length ?? 0)

  // Raum/Arbeitsplatz: manuell gepflegter Wert (Dossier) hat Vorrang vor der
  // Mitarbeiterverwaltung; fehlt beides, kann man ihn hier direkt eintragen.
  const effectiveRoom = (manualRoom || '').trim() || (emp?.roomNumber || '').trim()
  const roomSource = (manualRoom || '').trim() ? 'manuell' : (emp?.roomNumber ? 'Mitarbeiterverwaltung' : '')

  async function saveRoom() {
    if (!onSaveRoom || roomSaving) return
    setRoomSaving(true)
    try {
      await onSaveRoom(roomDraft)
      setRoomEditing(false)
    } finally {
      setRoomSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Wurzelknoten */}
      <div className="flex items-center gap-2 pl-1">
        <UserCircle2 size={16} className="text-blue-400" />
        <span className="text-sm font-semibold text-foreground">Stammdaten</span>
        {resolvedSam && <span className="text-xs font-mono text-muted-foreground">· {resolvedSam}</span>}
        {ad && !ad.found && !adLoading && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle size={9} />{ad.error || 'In AD nicht gefunden'}
          </span>
        )}
        {ad?.found && ad.enabled === false && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">AD-Konto deaktiviert</span>
        )}
      </div>

      {/* Online-Status */}
      <div className="flex items-center gap-2 pl-1 flex-wrap">
        {online?.online ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-green-500/15 text-green-300 border border-green-500/30">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span></span>
            Jetzt online{online.host ? <> · <span className="font-mono">{online.host}</span></> : null}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-muted/30 text-muted-foreground border border-border">
            <Circle size={8} className="fill-muted-foreground/40 text-muted-foreground/40" />
            {onlineLoading ? 'Prüfe Online-Status…' : 'Nicht angemeldet'}
          </span>
        )}
        {onlineLoading && !online?.online && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        {ad?.lastLogon && (
          <span className="text-xs text-muted-foreground">
            Zuletzt angemeldet: <span className="text-foreground">{fmtLastSeen(ad.lastLogon)}</span>
          </span>
        )}
        {!adLoading && !ad?.lastLogon && ad?.found && (
          <span className="text-xs text-muted-foreground">Letzte Anmeldung unbekannt</span>
        )}
      </div>

      {/* Organisation */}
      <TreeSection icon={<Building2 size={14} />} title="Organisation" loading={adLoading || recLoading}>
        {(() => {
          const dept = ad?.department || emp?.department
          const title = ad?.title || emp?.jobTitle
          const mgr = ad?.managerName || emp?.manager
          const rows: ReactNode[] = []
          if (dept) rows.push(<Row key="d" label="Abteilung" value={dept} source={ad?.department ? 'AD' : 'Mitarbeiterverwaltung'} />)
          if (title) rows.push(<Row key="t" label="Stellenbezeichnung" value={title} source={ad?.title ? 'AD' : 'Mitarbeiterverwaltung'} />)
          if (emp?.costCenter) rows.push(<Row key="k" label="Kostenstelle" value={emp.costCenter} source="Mitarbeiterverwaltung" />)
          if (mgr) rows.push(
            <Row key="m" label="Direkter Vorgesetzter" source={ad?.managerName ? 'AD' : 'Mitarbeiterverwaltung'}>
              <span className="inline-flex items-center gap-1">
                {mgr}
                {onOpenPerson && (
                  <button
                    type="button"
                    onClick={() => onOpenPerson(mgr, ad?.managerSam)}
                    title={`Dossier von ${mgr} öffnen`}
                    className="p-0.5 rounded text-muted-foreground/70 hover:text-blue-400 hover:bg-blue-500/10"
                  ><InfoIcon size={11} /></button>
                )}
              </span>
            </Row>)
          if (emp?.startDate) rows.push(<Row key="e" label="Eintritt" value={formatGermanDate(emp.startDate)} source="Mitarbeiterverwaltung" />)
          else if (ad?.whenCreated) {
            const d = new Date(ad.whenCreated)
            if (!isNaN(d.getTime())) rows.push(<Row key="e2" label="Im AD angelegt" value={d.toLocaleDateString('de-DE')} source="AD" />)
          }
          if (dep?.exitDate) rows.push(<Row key="x" label="Austritt" value={<span className="text-red-300">{formatGermanDate(dep.exitDate)}</span>} source="Mitarbeiterverwaltung" />)
          if (ad?.employeeId) rows.push(<Row key="id" label="Global ID" value={<span className="font-mono">{ad.employeeId}</span>} source="AD" />)
          return rows.length > 0 ? rows : <Empty text={adLoading || recLoading ? 'Wird geladen…' : 'Keine Organisations-Daten vorhanden.'} />
        })()}
      </TreeSection>

      {/* Kontakt & Arbeitsplatz */}
      <TreeSection icon={<Phone size={14} />} title="Kontakt & Arbeitsplatz" loading={adLoading || phLoading || recLoading}>
        {(() => {
          const rows: ReactNode[] = []
          if (ad?.email) rows.push(<Row key="mail" label="E-Mail" value={ad.email} source="AD" />)
          if (durchwahl) rows.push(
            <Row key="dw" label="Durchwahl" source={durchwahlSource}>
              <span className="font-mono font-semibold">{durchwahl}</span>
              {/^\d{4}$/.test(durchwahl) && <span className="text-xs text-muted-foreground ml-2">+49 40 3011 {durchwahl}</span>}
            </Row>)
          if (ad?.telephone) rows.push(<Row key="tel" label="Festnetz (AD)" value={<span className="font-mono">{ad.telephone}</span>} source="AD" />)
          const geb = phoneEntry?.gebaeude, raum = phoneEntry?.raum
          if (geb || raum) rows.push(<Row key="gr" label="Gebäude / Raum" value={[geb, raum].filter(Boolean).join(' / ')} source="Durchwahlliste" />)
          if (effectiveRoom || onSaveRoom) rows.push(
            <Row key="ap" label="Raum / Arbeitsplatz" source={roomEditing ? undefined : (roomSource || undefined)}>
              {roomEditing ? (
                <span className="inline-flex items-center gap-1.5">
                  <input
                    autoFocus value={roomDraft} onChange={e => setRoomDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void saveRoom(); if (e.key === 'Escape') setRoomEditing(false) }}
                    placeholder="z. B. 210 oder E10"
                    className="w-36 px-2 py-1 text-xs rounded bg-background border border-border text-foreground focus:outline-none focus:border-primary"
                  />
                  <button onClick={() => void saveRoom()} disabled={roomSaving} title="Speichern"
                    className="p-1 rounded text-green-400 hover:bg-green-500/10 disabled:opacity-40">
                    {roomSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
                  </button>
                  <button onClick={() => setRoomEditing(false)} disabled={roomSaving} title="Abbrechen"
                    className="p-1 rounded text-muted-foreground hover:text-red-400 disabled:opacity-40"><X size={13} /></button>
                </span>
              ) : effectiveRoom ? (
                <span className="inline-flex items-center gap-1.5">
                  {effectiveRoom}
                  {onSaveRoom && (
                    <button onClick={() => { setRoomDraft(manualRoom?.trim() || effectiveRoom); setRoomEditing(true) }} title="Raumnummer bearbeiten"
                      className="p-0.5 rounded text-muted-foreground/70 hover:text-blue-400 hover:bg-blue-500/10"><Pencil size={11} /></button>
                  )}
                </span>
              ) : (
                <button onClick={() => { setRoomDraft(''); setRoomEditing(true) }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-400 border border-dashed border-border rounded-md px-2 py-0.5">
                  <Plus size={11} />Raumnummer eintragen
                </button>
              )}
            </Row>)
          if (ad?.office) rows.push(<Row key="of" label="Office (AD)" value={ad.office} source="AD" />)
          return rows.length > 0 ? rows : <Empty text={adLoading || phLoading ? 'Wird geladen…' : 'Keine Kontaktdaten vorhanden.'} />
        })()}
      </TreeSection>

      {/* Hardware */}
      <TreeSection icon={<Laptop size={14} />} title="Zugewiesene Hardware" loading={hwLoading} badge={hwCount > 0 ? String(hwCount) : undefined}>
        {(() => {
          if (hwLoading && !hw) return <Empty text="Wird geladen…" />
          const rows: ReactNode[] = []
          for (const it of hw?.inventory ?? []) {
            rows.push(
              <div key={`inv_${it.id}`} className="flex items-center gap-2 py-1 pl-1">
                <Laptop size={12} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-mono text-foreground">{it.name}</span>
                {it.category && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border">{it.category}</span>}
                {it.description && <span className="text-xs text-muted-foreground truncate" title={it.description}>{it.description}</span>}
                <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">Inventar</span>
              </div>)
          }
          for (const d of hw?.endpoint ?? []) {
            rows.push(
              <div key={`ep_${d.id}`} className="flex items-center gap-2 py-1 pl-1">
                <Laptop size={12} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-mono text-foreground">{d.hostname || d.serial}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border">{modelTypeDisplay(d.model)}</span>
                {d.serial && d.hostname && <span className="text-xs text-muted-foreground font-mono">SN {d.serial}</span>}
                {d.retiredDate && <span className="text-xs text-muted-foreground">Leasing bis {d.retiredDate}</span>}
                <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">Endgeräte</span>
              </div>)
          }
          if (dep?.deviceName) {
            rows.push(<Row key="depdev" label="Gerät (Austritt)" value={<span className="font-mono">{dep.deviceName}{dep.deviceReturned ? ' · abgegeben' : ' · noch nicht abgegeben'}</span>} source="Mitarbeiterverwaltung" />)
          }
          return rows.length > 0 ? rows : <Empty text="Keine zugewiesene Hardware gefunden." />
        })()}
      </TreeSection>

      {/* Postfaecher & Gruppen */}
      <TreeSection icon={<Mail size={14} />} title="Postfächer & Gruppen" loading={adLoading || recLoading}
        badge={ad && ad.groups.length > 0 ? `${ad.groups.length} Gruppen` : undefined}>
        {(() => {
          const rows: ReactNode[] = []
          if (emp?.groupMailbox) rows.push(<Row key="gm" label="Gruppenpostfach" value={emp.groupMailbox} source="Mitarbeiterverwaltung" />)
          if (ad && ad.groups.length > 0) {
            rows.push(
              <div key="grp" className="py-1 pl-1">
                <button
                  type="button"
                  onClick={() => setGroupsOpen(o => !o)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {groupsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  AD-Gruppenmitgliedschaften ({ad.groups.length})
                </button>
                {groupsOpen && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ad.groups.map(g => (
                      <span key={g} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/20 text-muted-foreground border border-border font-mono">{g}</span>
                    ))}
                  </div>
                )}
              </div>)
          }
          return rows.length > 0 ? rows : <Empty text={adLoading ? 'Wird geladen…' : 'Keine Postfach-/Gruppendaten vorhanden.'} />
        })()}
      </TreeSection>
    </div>
  )
}
