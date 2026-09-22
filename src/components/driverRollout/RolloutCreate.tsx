// ── Rollout anlegen: PCs auswählen (4 Modi) → Treiber-Vorschau → Zeitplan ────
import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Search, Loader2, X, UserSearch, Laptop, Building2, Users, Server, Plus,
  CalendarClock, Check,
} from 'lucide-react'
import { ladeBenutzerPCs, type UserPc } from '../../netCheck/userPcs'
import UserPicker from '../UserPicker'
import {
  loadDirectory, departmentsOf, usersInDepartment, buildReportsIndex, collectReports,
  loadDeviceIndex, type UserDevice,
} from '../../services/rolloutSelect'
import { resolveSamByName, fetchAdPersonInfo } from '../../services/personMasterData'
import { fetchOrgChart } from '../../services/adOrgChart'
import { ensureCmsl, scanHosts, type HpHostReport } from '../../services/hpDrivers'
import { istRolloutTreiber, createRollout, type Rollout } from '../../services/driverRollout'
import { WEEKDAY_LABELS } from '../../services/scanSchedules'
import { modelTypeDisplay } from '../../services/endpointDevices'
import type { AdUserListItem } from '../../services/adUsersList'
import { DeviceInfoButton } from '../device/DeviceDossier'

type Mode = 'hostname' | 'user' | 'dept' | 'manager'
interface PickedHost { hostname: string; user?: string; model?: string; serial?: string }
const canon = (h: string) => (h || '').trim().toLowerCase().split('.')[0]
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function RolloutCreate({ by, onCreated, onCancel }: {
  by: string; onCreated: (r: Rollout) => void; onCancel: () => void
}) {
  const [phase, setPhase] = useState<'select' | 'plan'>('select')
  const [mode, setMode] = useState<Mode>('hostname')
  const [picked, setPicked] = useState<Record<string, PickedHost>>({})
  const pickedList = useMemo(() => Object.values(picked).sort((a, b) => a.hostname.localeCompare(b.hostname)), [picked])

  const isPicked = (h: string) => !!picked[canon(h)]
  const addHost = (p: PickedHost) => setPicked(prev => ({ ...prev, [canon(p.hostname)]: { ...p, hostname: p.hostname.toUpperCase() } }))
  const removeHost = (h: string) => setPicked(prev => { const n = { ...prev }; delete n[canon(h)]; return n })
  const toggleHost = (p: PickedHost) => { isPicked(p.hostname) ? removeHost(p.hostname) : addHost(p) }

  // ── Modus: Hostname ──
  const [hostInput, setHostInput] = useState('')
  const addHostnames = () => {
    const hs = [...new Set(hostInput.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean))]
    for (const h of hs) addHost({ hostname: h })
    setHostInput('')
  }

  // ── Modus: Benutzer (Sofortsuche über UserPicker) ──
  const [userChosen, setUserChosen] = useState<AdUserListItem | null>(null)
  const [userPcs, setUserPcs] = useState<UserPc[]>([])
  const [userBusy, setUserBusy] = useState(false)
  async function pickUser(u: AdUserListItem) {
    setUserChosen(u); setUserBusy(true); setUserPcs([])
    const list = await ladeBenutzerPCs(u.sam, u.displayName)
    setUserPcs(list); setUserBusy(false)
  }

  // ── Modi: Abteilung / Vorgesetzter (offline-Verzeichnis, einmal geladen) ──
  const dirRef = useRef<AdUserListItem[] | null>(null)
  const devIdxRef = useRef<((sam: string, name: string) => UserDevice[]) | null>(null)
  const [orgBusy, setOrgBusy] = useState(false)
  async function ensureOrg(): Promise<{ dir: AdUserListItem[]; devIdx: (sam: string, name: string) => UserDevice[] }> {
    if (!dirRef.current) dirRef.current = await loadDirectory()
    if (!devIdxRef.current) devIdxRef.current = await loadDeviceIndex()
    return { dir: dirRef.current, devIdx: devIdxRef.current }
  }
  interface UserGroup { sam: string; name: string; dept?: string; devices: UserDevice[] }

  // Abteilung
  const [deptList, setDeptList] = useState<string[]>([])
  const [deptSel, setDeptSel] = useState('')
  const [deptGroups, setDeptGroups] = useState<UserGroup[]>([])
  async function loadDeptList() {
    setOrgBusy(true)
    const { dir } = await ensureOrg()
    setDeptList(departmentsOf(dir)); setOrgBusy(false)
  }
  async function chooseDept(dept: string) {
    setDeptSel(dept); if (!dept) { setDeptGroups([]); return }
    setOrgBusy(true)
    const { dir, devIdx } = await ensureOrg()
    const groups = usersInDepartment(dir, dept).map(u => ({ sam: u.sam, name: u.displayName, dept: u.department, devices: devIdx(u.sam, u.displayName) }))
    setDeptGroups(groups); setOrgBusy(false)
    // Standard: alle Rechner der Abteilung vorwählen
    for (const g of groups) for (const d of g.devices) addHost({ hostname: d.hostname, user: g.name, model: d.model, serial: d.serial })
  }

  // Vorgesetzter
  const [mgrTerm, setMgrTerm] = useState('')
  const [mgrGroups, setMgrGroups] = useState<UserGroup[]>([])
  const [mgrMsg, setMgrMsg] = useState('')
  async function mgrSearch() {
    const t = mgrTerm.trim(); if (!t) return
    setOrgBusy(true); setMgrMsg(''); setMgrGroups([])
    const { dir, devIdx } = await ensureOrg()
    // Autoritative CorpID/SamAccountName LIVE aus AD (dieselbe Quelle wie das Personen-„i");
    // der Tages-Cache liefert teils keine oder für Get-ADUser ungültige CorpID → Cache nur als Fallback.
    let sam: string | undefined
    try { const info = await fetchAdPersonInfo(t); if (info.found) sam = info.sam } catch { /* Cache-Fallback unten */ }
    if (!sam) sam = await resolveSamByName(t)
    if (!sam) { setMgrMsg(`Vorgesetzter „${t}" nicht in AD gefunden.`); setOrgBusy(false); return }
    // 1) Offline (schnell): über den zwischengespeicherten managerSam-Index.
    let reportUsers = collectReports(buildReportsIndex(dir), sam).map(u => ({ sam: u.sam, name: u.displayName, dept: u.department as string | undefined }))
    // 2) Fallback LIVE aus AD (DirectReports, rekursiv) — falls der Cache keine
    //    managerSam-Verknüpfung hat (dann liefert (1) fälschlich „keine").
    if (reportUsers.length === 0) {
      setMgrMsg('Suche unterstellte Mitarbeiter live im AD…')
      const org = await fetchOrgChart(sam)
      if (!org.ok) { setMgrMsg('AD-Orgstruktur nicht abrufbar: ' + (org.error || 'Fehler')); setOrgBusy(false); return }
      reportUsers = org.nodes
        .filter(n => n.sam.toLowerCase() !== sam.toLowerCase())
        .map(n => ({ sam: n.sam, name: n.displayName, dept: n.department }))
    }
    if (reportUsers.length === 0) { setMgrMsg(`Keine unterstellten Benutzer für „${t}".`); setOrgBusy(false); return }
    const groups = reportUsers.map(u => ({ sam: u.sam, name: u.name, dept: u.dept, devices: devIdx(u.sam, u.name) }))
    setMgrGroups(groups); setOrgBusy(false); setMgrMsg('')
    for (const g of groups) for (const d of g.devices) addHost({ hostname: d.hostname, user: g.name, model: d.model, serial: d.serial })
  }

  // ── Vorschau-Scan ──
  const [reports, setReports] = useState<HpHostReport[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanProg, setScanProg] = useState({ done: 0, total: 0 })
  async function goPlan() {
    setPhase('plan'); setReports(null)
    setScanning(true); setScanProg({ done: 0, total: pickedList.length })
    try {
      await ensureCmsl(true)
      const reps = await scanHosts(pickedList.map(p => p.hostname), (done, total) => setScanProg({ done, total }))
      setReports(reps)
    } catch { setReports([]) } finally { setScanning(false) }
  }

  // ── Zeitplan / Optionen ──
  const [name, setName] = useState('')
  const [days, setDays] = useState<Set<number>>(new Set([3]))   // Standard: Mi
  const [time, setTime] = useState('12:00')
  const [rebootMode, setRebootMode] = useState<'notify' | 'reboot'>('notify')
  const [notifyUser, setNotifyUser] = useState(false)
  const [creating, setCreating] = useState(false)
  const toggleDay = (d: number) => setDays(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n })

  async function doCreate() {
    if (creating || days.size === 0 || pickedList.length === 0) return
    setCreating(true)
    const r = await createRollout({
      name, by, hosts: pickedList.map(p => p.hostname),
      schedule: { enabled: true, days: [...days].sort((a, b) => a - b), time },
      rebootMode, notifyUser,
    })
    setCreating(false)
    onCreated(r)
  }

  const previewCount = (host: string) => {
    const rep = reports?.find(r => r.hostname.toLowerCase() === host.toLowerCase())
    if (!rep) return null
    if (!rep.online || rep.error) return -1   // offline
    return rep.items.filter(istRolloutTreiber).length
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <button onClick={phase === 'plan' ? () => setPhase('select') : onCancel} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"><ArrowLeft size={12} />Zurück</button>
        <CalendarClock size={18} className="text-primary" />
        <h2 className="text-base font-bold text-foreground">Neuer Rollout</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">{pickedList.length} PC(s) gewählt</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {phase === 'select' && (
          <>
            {/* Modus-Tabs */}
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              {([['hostname', 'Hostname', Server], ['user', 'Benutzer', UserSearch], ['dept', 'Abteilung', Building2], ['manager', 'Vorgesetzter', Users]] as const).map(([m, lbl, Icon]) => (
                <button key={m} onClick={() => { setMode(m); if (m === 'dept' && !deptList.length) void loadDeptList() }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${mode === m ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'} border-l border-border first:border-l-0`}>
                  <Icon size={13} />{lbl}
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-card p-4 max-w-3xl">
              {mode === 'hostname' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Hostnamen eingeben (mehrere durch Leerzeichen/Komma/Zeilen).</p>
                  <textarea value={hostInput} onChange={e => setHostInput(e.target.value)} rows={3} spellCheck={false}
                    placeholder="z. B. DE5CG… DEHAM…" className="w-full px-2 py-1.5 text-xs font-mono rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                  <button onClick={addHostnames} disabled={!hostInput.trim()} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50"><Plus size={13} />Hinzufügen</button>
                </div>
              )}

              {mode === 'user' && (
                <div className="space-y-2">
                  {!userChosen && <UserPicker onPick={pickUser} />}
                  {userChosen && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-foreground"><b>{userChosen.displayName}</b> <span className="font-mono text-muted-foreground">({userChosen.sam})</span></span>
                        <button onClick={() => { setUserChosen(null); setUserPcs([]) }} className="text-[11px] text-muted-foreground hover:text-foreground">andere Auswahl</button>
                      </div>
                      {userBusy
                        ? <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />PCs werden ermittelt…</p>
                        : userPcs.length === 0
                          ? <p className="text-[11px] text-muted-foreground italic">Keine zugewiesenen PCs gefunden.</p>
                          : userPcs.map(pc => <DeviceRow key={pc.hostname} hostname={pc.hostname} model={pc.model} serial={pc.serial} user={userChosen.displayName} checked={isPicked(pc.hostname)} onToggle={() => toggleHost({ hostname: pc.hostname, user: userChosen.displayName, model: pc.model, serial: pc.serial })} />)}
                    </div>
                  )}
                </div>
              )}

              {mode === 'dept' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <select value={deptSel} onChange={e => void chooseDept(e.target.value)} className="flex-1 px-2.5 py-1.5 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary">
                      <option value="">Abteilung wählen…</option>
                      {deptList.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    {orgBusy && <Loader2 size={15} className="animate-spin text-muted-foreground" />}
                  </div>
                  {deptGroups.map(g => <UserGroupBlock key={g.sam} g={g} isPicked={isPicked} toggleHost={toggleHost} />)}
                </div>
              )}

              {mode === 'manager' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={mgrTerm} onChange={e => setMgrTerm(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void mgrSearch() }}
                      placeholder="Vorgesetzten-Name…" className="flex-1 px-2.5 py-1.5 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                    <button onClick={() => void mgrSearch()} disabled={orgBusy || !mgrTerm.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50">{orgBusy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}Suchen</button>
                  </div>
                  {mgrMsg && <p className="text-[11px] text-muted-foreground">{mgrMsg}</p>}
                  {mgrGroups.length > 0 && <p className="text-[11px] text-muted-foreground">{mgrGroups.length} unterstellte Benutzer</p>}
                  {mgrGroups.map(g => <UserGroupBlock key={g.sam} g={g} isPicked={isPicked} toggleHost={toggleHost} />)}
                </div>
              )}
            </div>

            {/* Auswahl-Zusammenfassung */}
            {pickedList.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 max-w-3xl">
                <div className="text-xs font-semibold text-foreground mb-1.5">Auswahl ({pickedList.length} PC(s))</div>
                <div className="flex flex-wrap gap-1.5">
                  {pickedList.map(p => (
                    <span key={p.hostname} className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-foreground">
                      {p.hostname}<button onClick={() => removeHost(p.hostname)} className="text-muted-foreground hover:text-red-400"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button onClick={goPlan} disabled={pickedList.length === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              Weiter: Treiber anzeigen ({pickedList.length})
            </button>
          </>
        )}

        {phase === 'plan' && (
          <>
            {/* Treiber-Vorschau */}
            <div className="rounded-lg border border-border bg-card p-4 max-w-3xl">
              <div className="flex items-center gap-2 mb-2"><Laptop size={15} className="text-primary" /><h3 className="text-sm font-bold text-foreground">Verfügbare Treiber (ohne BIOS/Firmware)</h3>{scanning && <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 size={12} className="animate-spin" />Scanne {scanProg.done}/{scanProg.total}…</span>}</div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
                {pickedList.map(p => {
                  const n = previewCount(p.hostname)
                  return (
                    <div key={p.hostname} className="flex items-center gap-2 py-1.5 text-xs">
                      <span className="inline-flex items-center gap-1"><span className="font-mono text-foreground">{p.hostname}</span><DeviceInfoButton hostname={p.hostname} serial={p.serial} /></span>
                      {p.model && <span className="text-[11px] text-muted-foreground truncate">{p.model}{modelTypeDisplay(p.model) !== '—' ? ' · ' + modelTypeDisplay(p.model) : ''}</span>}
                      <span className="ml-auto">{n == null ? <span className="text-muted-foreground">…</span> : n === -1 ? <span className="text-red-400">offline</span> : n === 0 ? <span className="text-emerald-400">aktuell</span> : <span className="text-amber-300 font-semibold">{n} Update(s)</span>}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Beim Rollout wird jeder PC frisch gescannt; nur veraltete Gerätetreiber werden installiert. BIOS und Firmware/Dock werden nie eingespielt.</p>
            </div>

            {/* Zeitplan + Optionen */}
            <div className="rounded-lg border border-border bg-card p-4 max-w-3xl space-y-3">
              <div className="flex items-center gap-2"><CalendarClock size={15} className="text-primary" /><h3 className="text-sm font-bold text-foreground">Zeitplan &amp; Optionen</h3></div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Name des Rollouts</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Treiber-Update Konstruktion" className="w-full px-2.5 py-1.5 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Wochentage</label>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAY_ORDER.map(d => (
                    <button key={d} onClick={() => toggleDay(d)} className={`px-2.5 py-1 text-xs rounded border ${days.has(d) ? 'bg-primary text-primary-foreground border-primary font-semibold' : 'border-border text-muted-foreground hover:text-foreground'}`}>{WEEKDAY_LABELS[d]}</button>
                  ))}
                  <input type="time" value={time} onChange={e => setTime(e.target.value)} className="ml-2 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap text-[11px] text-muted-foreground">
                <label className="flex items-center gap-1"><input type="radio" checked={rebootMode === 'notify'} onChange={() => setRebootMode('notify')} className="accent-primary" />Nur Hinweis</label>
                <label className="flex items-center gap-1"><input type="radio" checked={rebootMode === 'reboot'} onChange={() => setRebootMode('reboot')} className="accent-primary" />Neustart (2 Min.)</label>
                <label className="flex items-center gap-1 border-l border-border pl-3"><input type="checkbox" checked={notifyUser} onChange={e => setNotifyUser(e.target.checked)} className="accent-primary" />Benutzer benachrichtigen</label>
              </div>
              <button onClick={() => void doCreate()} disabled={creating || days.size === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Rollout anlegen ({pickedList.length} PC(s))
              </button>
              <p className="text-[10px] text-muted-foreground">Läuft automatisch zu den gewählten Zeiten. Bereits aktualisierte PCs werden nie erneut angefasst; nicht erreichte PCs werden am nächsten Termin erneut versucht.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DeviceRow({ hostname, model, serial, checked, onToggle }: { hostname: string; model?: string; serial?: string; user?: string; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-primary" />
      <Laptop size={13} className="text-muted-foreground shrink-0" />
      <span className="inline-flex items-center gap-1"><span className="font-mono font-semibold text-foreground">{hostname}</span><DeviceInfoButton hostname={hostname} serial={serial} /></span>
      {model && <span className="text-[11px] text-muted-foreground truncate">{model}{modelTypeDisplay(model) !== '—' ? ' · ' + modelTypeDisplay(model) : ''}</span>}
    </label>
  )
}

function UserGroupBlock({ g, isPicked, toggleHost }: {
  g: { sam: string; name: string; dept?: string; devices: UserDevice[] }
  isPicked: (h: string) => boolean
  toggleHost: (p: { hostname: string; user?: string; model?: string; serial?: string }) => void
}) {
  return (
    <div className="rounded border border-border/60 p-2">
      <div className="flex items-center gap-2 mb-0.5"><Users size={12} className="text-primary shrink-0" /><span className="text-sm font-semibold text-foreground">{g.name}</span><span className="text-[11px] font-mono text-muted-foreground">{g.sam}</span></div>
      {g.devices.length === 0
        ? <p className="text-[11px] text-muted-foreground italic pl-5">keine zugewiesenen Rechner im Inventar</p>
        : g.devices.map(d => <DeviceRow key={d.hostname} hostname={d.hostname} model={d.model} serial={d.serial} user={g.name} checked={isPicked(d.hostname)} onToggle={() => toggleHost({ hostname: d.hostname, user: g.name, model: d.model, serial: d.serial })} />)}
    </div>
  )
}
