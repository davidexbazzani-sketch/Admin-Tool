// ── Proaktives Radar – Screen ─────────────────────────────────────────────────
// Zwei Tabs (Geräte-Leasing / AD-Hygiene) mit maximaler Filter-Freiheit:
// frei einstellbarer Schwellenwert (Tage/Wochen/Monate), Kategorie- und Feld-
// Filter, Volltextsuche, sortierbare Spalten, CSV-Export und Drill-in in die
// Dossiers. Reiner Ansichts-Screen — kein Popup, keine E-Mail (nur per Klick).

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Radar, RefreshCw, Loader2, Download, Search, Settings2, ChevronUp, ChevronDown,
  AlertTriangle, ShieldAlert, CalendarClock, X, Mail, Send, Eye,
} from 'lucide-react'
import { api } from '../electronAPI'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import { PersonInfoButton } from '../components/person/PersonDossier'
import {
  computeLeasingItems, computeHygieneItems, loadHygieneUsers, refreshAdHygiene,
  loadRadarSettings, saveRadarSettings, urgencyFuture, urgencyPast,
  CATEGORY_LABEL, DEFAULT_RADAR_SETTINGS,
  type RadarItem, type RadarCategory, type RadarSettings,
} from '../services/proactiveRadar'
import {
  loadReminderConfig, saveReminderConfig, recipientsToday, sendReminders, sendTestReminder, targetsFromItems, buildPreviews, sentStatusToday,
  type PwdReminderConfig, type ReminderPreview,
} from '../services/pwdReminder'

type Tab = 'leasing' | 'hygiene'
type Unit = 'days' | 'weeks' | 'months'
type Timeframe = 'all' | 'within' | 'overdue'

interface Col { key: string; label: string; get: (it: RadarItem) => string; num?: (it: RadarItem) => number }

const HYG_CATS: RadarCategory[] = ['staleLogin', 'pwdExpiring', 'departedActive', 'acctExpiring']

function unitToDays(v: number, u: Unit): number {
  return Math.round(v * (u === 'months' ? 30 : u === 'weeks' ? 7 : 1))
}

/** CSV bauen und per Speichern-Dialog ablegen (UTF-8 mit BOM für Excel). */
async function exportCsv(filename: string, header: string[], rows: string[][]) {
  const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`
  const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
  const path = await api().saveFileDialog(filename, [{ name: 'CSV', extensions: ['csv'] }])
  if (!path) return
  const bytes = new TextEncoder().encode(csv)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  await api().writeFile(path, btoa(bin))
}

export default function ProactiveRadar() {
  const [tab, setTab] = useState<Tab>('leasing')
  const [settings, setSettings] = useState<RadarSettings>(DEFAULT_RADAR_SETTINGS)

  const [leasing, setLeasing] = useState<RadarItem[]>([])
  const [hygiene, setHygiene] = useState<RadarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hygLoadedAt, setHygLoadedAt] = useState<string | undefined>()
  const [hygHasPwd, setHygHasPwd] = useState(false)
  const [refreshingAd, setRefreshingAd] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const s = await loadRadarSettings()
      setSettings(s)
      const [lease, hyg] = await Promise.all([computeLeasingItems(), loadHygieneUsers()])
      setLeasing(lease)
      setHygLoadedAt(hyg.loadedAt); setHygHasPwd(hyg.hasPwd)
      setHygiene(await computeHygieneItems(hyg.users, s))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { reload() }, [reload])

  async function doRefreshAd() {
    setRefreshingAd(true); setMsg(null)
    try {
      const r = await refreshAdHygiene()
      if (!r.ok) { setMsg({ ok: false, text: 'AD-Aktualisierung fehlgeschlagen: ' + (r.error || '') }); return }
      const hyg = await loadHygieneUsers()
      setHygLoadedAt(hyg.loadedAt); setHygHasPwd(hyg.hasPwd)
      setHygiene(await computeHygieneItems(hyg.users, settings))
      setMsg({ ok: true, text: `AD-Hygiene aktualisiert (${r.count} Benutzer, inkl. Passwort-Ablauf).` })
    } finally { setRefreshingAd(false) }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <Radar className="text-blue-400" size={20} />
          <h1 className="text-lg font-bold text-foreground">Proaktives Radar</h1>
          <span className="text-xs text-muted-foreground">Leasing-Ablauf & AD-Hygiene — frühzeitig handeln statt hinterher suchen.</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowSettings(v => !v)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">
              <Settings2 size={13} />Schwellen
            </button>
            <button onClick={reload} disabled={loading} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Neu laden
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-1.5 mt-3">
          <TabBtn active={tab === 'leasing'} onClick={() => setTab('leasing')} icon={<CalendarClock size={14} />} label={`Geräte-Leasing (${leasing.length})`} />
          <TabBtn active={tab === 'hygiene'} onClick={() => setTab('hygiene')} icon={<ShieldAlert size={14} />} label={`AD-Hygiene (${hygiene.length})`} />
        </div>
      </div>

      {msg && (
        <div className={`mx-6 mt-3 rounded-md border px-3 py-2 text-xs ${msg.ok ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      {showSettings && <SettingsPanel settings={settings} onClose={() => setShowSettings(false)} onSaved={(s) => { setSettings(s); reload() }} />}

      <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade Radar-Daten…</div>
        ) : tab === 'leasing' ? (
          <LeasingTab items={leasing} />
        ) : (
          <HygieneTab items={hygiene} loadedAt={hygLoadedAt} hasPwd={hygHasPwd} refreshing={refreshingAd} onRefresh={doRefreshAd} />
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground'}`}>
      {icon}{label}
    </button>
  )
}

// ── gemeinsame Tabelle mit sortierbaren Spalten + Ampel ────────────────────────

function RadarTable({ items, cols, kind, drill }: {
  items: RadarItem[]; cols: Col[]; kind: 'future' | 'past' | 'mixed'
  drill: (it: RadarItem) => React.ReactNode
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: cols.find(c => c.num)?.key || cols[0].key, dir: 1 })
  const sorted = useMemo(() => {
    const col = cols.find(c => c.key === sort.key)
    if (!col) return items
    const arr = [...items]
    arr.sort((a, b) => {
      if (col.num) { const na = col.num(a), nb = col.num(b); const va = isNaN(na) ? Infinity : na, vb = isNaN(nb) ? Infinity : nb; return (va - vb) * sort.dir }
      return col.get(a).localeCompare(col.get(b), 'de') * sort.dir
    })
    return arr
  }, [items, cols, sort])

  function toggleSort(key: string) {
    setSort(s => s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) } : { key, dir: 1 })
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground italic py-6">Keine Einträge für die aktuellen Filter.</p>

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/20 text-muted-foreground">
            <th className="w-1" />
            {cols.map(c => (
              <th key={c.key} onClick={() => toggleSort(c.key)}
                className="text-left font-semibold px-2.5 py-2 cursor-pointer select-none whitespace-nowrap hover:text-foreground">
                <span className="inline-flex items-center gap-1">{c.label}{sort.key === c.key && (sort.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}</span>
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(it => {
            const k = kind === 'mixed' ? it.kind : kind
            const u = k === 'past' ? urgencyPast(it.days) : urgencyFuture(it.days)
            const pillLabel = isNaN(it.days) ? '—' : k === 'past' ? `${it.days} T.` : it.days < 0 ? `${Math.abs(it.days)} T. über` : `${it.days} T.`
            return (
              <tr key={it.id} className={`border-t border-border border-l-4 ${u.row} hover:bg-accent/10`}>
                <td className="w-1" />
                {cols.map((c, i) => (
                  <td key={c.key} className="px-2.5 py-1.5 align-top">
                    {i === 0
                      ? <span className={`inline-flex items-center gap-1 font-medium text-foreground ${c.num ? '' : ''}`}>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${u.pill} mr-1`}>{pillLabel}</span>
                          {c.get(it)}
                        </span>
                      : <span className="text-foreground/90 whitespace-nowrap">{c.get(it)}</span>}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">{drill(it)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Leasing-Tab ────────────────────────────────────────────────────────────────

function LeasingTab({ items }: { items: RadarItem[] }) {
  const [q, setQ] = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>('all')
  const [val, setVal] = useState(1)
  const [unit, setUnit] = useState<Unit>('months')
  const [fStatus, setFStatus] = useState('')
  const [fSub, setFSub] = useState('')
  const [fType, setFType] = useState('')
  const [fComp, setFComp] = useState('')
  const [fPayer, setFPayer] = useState('')

  const distinct = (field: string) => [...new Set(items.map(i => i.fields[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'))
  const maxDays = unitToDays(val, unit)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter(it => {
      if (timeframe === 'within' && !(!isNaN(it.days) && it.days <= maxDays)) return false
      if (timeframe === 'overdue' && !(!isNaN(it.days) && it.days < 0)) return false
      if (fStatus && it.fields.Status !== fStatus) return false
      if (fSub && it.fields.Verwendung !== fSub) return false
      if (fType && it.fields['Modell-Typ'] !== fType) return false
      if (fComp && it.fields.Unternehmen !== fComp) return false
      if (fPayer && it.fields['Wer bezahlt?'] !== fPayer) return false
      if (term && !Object.values(it.fields).some(v => v.toLowerCase().includes(term)) && !it.title.toLowerCase().includes(term)) return false
      return true
    })
  }, [items, q, timeframe, maxDays, fStatus, fSub, fType, fComp, fPayer])

  const cols: Col[] = [
    { key: 'host', label: 'Hostname', get: it => it.fields.Hostname || it.title, num: it => it.days },
    { key: 'serial', label: 'Seriennr.', get: it => it.fields.Seriennummer },
    { key: 'user', label: 'Zugewiesen an', get: it => it.fields['Zugewiesen an'] },
    { key: 'type', label: 'Modell-Typ', get: it => it.fields['Modell-Typ'] },
    { key: 'status', label: 'Status', get: it => it.fields.Status },
    { key: 'sub', label: 'Verwendung', get: it => it.fields.Verwendung },
    { key: 'comp', label: 'Unternehmen', get: it => it.fields.Unternehmen },
    { key: 'payer', label: 'Wer bezahlt?', get: it => it.fields['Wer bezahlt?'] },
    { key: 'end', label: 'Leasingende', get: it => it.fields.Leasingende, num: it => it.days },
    { key: 'cost', label: 'Kosten/Mon.', get: it => it.fields['Kosten/Monat'] },
  ]

  function doExport() {
    exportCsv('Leasing-Radar.csv', cols.map(c => c.label).concat('Resttage'),
      filtered.map(it => cols.map(c => c.get(it)).concat(isNaN(it.days) ? '' : String(it.days))))
  }

  const selCls = 'px-2 py-1.5 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary'

  return (
    <div className="space-y-3">
      {/* Filter-Leiste */}
      <div className="flex items-end gap-2 flex-wrap rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Zeitfenster</label>
          <div className="flex items-center gap-1">
            <select value={timeframe} onChange={e => setTimeframe(e.target.value as Timeframe)} className={selCls}>
              <option value="all">Alle</option>
              <option value="within">Endet innerhalb…</option>
              <option value="overdue">Nur überfällig</option>
            </select>
            {timeframe === 'within' && (
              <>
                <input type="number" min={0} value={val} onChange={e => setVal(Math.max(0, Number(e.target.value)))} className={`${selCls} w-16`} />
                <select value={unit} onChange={e => setUnit(e.target.value as Unit)} className={selCls}>
                  <option value="days">Tagen</option>
                  <option value="weeks">Wochen</option>
                  <option value="months">Monaten</option>
                </select>
              </>
            )}
          </div>
        </div>
        {/* Schnellwahl */}
        <div className="flex items-center gap-1">
          {[['1 Monat', 1, 'months'], ['3 Monate', 3, 'months'], ['6 Monate', 6, 'months']].map(([lbl, v, u]) => (
            <button key={lbl as string} onClick={() => { setTimeframe('within'); setVal(v as number); setUnit(u as Unit) }}
              className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground">{lbl as string}</button>
          ))}
        </div>
        <FilterSelect label="Status" value={fStatus} onChange={setFStatus} options={distinct('Status')} />
        <FilterSelect label="Verwendung" value={fSub} onChange={setFSub} options={distinct('Verwendung')} />
        <FilterSelect label="Modell-Typ" value={fType} onChange={setFType} options={distinct('Modell-Typ')} />
        <FilterSelect label="Unternehmen" value={fComp} onChange={setFComp} options={distinct('Unternehmen')} />
        <FilterSelect label="Wer bezahlt?" value={fPayer} onChange={setFPayer} options={distinct('Wer bezahlt?')} />
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Suche</label>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Hostname, Seriennr., Person…" className={`${selCls} w-full pl-7`} />
          </div>
        </div>
        <button onClick={doExport} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">
          <Download size={13} />CSV
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">{filtered.length} von {items.length} Geräten mit Leasingende.</p>
      <RadarTable items={filtered} cols={cols} kind="future"
        drill={it => it.device ? <DeviceInfoButton hostname={it.device.hostname} serial={it.device.serial} /> : null} />
    </div>
  )
}

// ── AD-Hygiene-Tab ─────────────────────────────────────────────────────────────

function HygieneTab({ items, loadedAt, hasPwd, refreshing, onRefresh }: {
  items: RadarItem[]; loadedAt?: string; hasPwd: boolean; refreshing: boolean; onRefresh: () => void
}) {
  const [q, setQ] = useState('')
  const [cats, setCats] = useState<Set<RadarCategory>>(new Set())
  const [fDept, setFDept] = useState('')
  const [thrActive, setThrActive] = useState(false)
  const [thr, setThr] = useState(90)

  const distinctDept = [...new Set(items.map(i => i.fields.Abteilung).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'))

  function toggleCat(c: RadarCategory) {
    setCats(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter(it => {
      if (cats.size > 0 && !cats.has(it.category)) return false
      if (fDept && it.fields.Abteilung !== fDept) return false
      if (thrActive) {
        if (isNaN(it.days)) return false
        // future (pwd/acct): „läuft in ≤ N ab"; past (stale/departed): „seit ≥ N Tagen"
        if (it.kind === 'future' && !(it.days <= thr)) return false
        if (it.kind === 'past' && !(it.days >= thr)) return false
      }
      if (term && !Object.values(it.fields).some(v => v.toLowerCase().includes(term)) && !it.title.toLowerCase().includes(term)) return false
      return true
    })
  }, [items, q, cats, fDept, thrActive, thr])

  const infoFor = (it: RadarItem): string =>
    it.category === 'staleLogin' ? `${it.fields['Tage inaktiv']} Tage inaktiv (${it.fields['Letzter Login']})`
    : it.category === 'pwdExpiring' ? `Passwort in ${it.fields['Passwort in']}`
    : it.category === 'departedActive' ? `Austritt ${it.fields.Austritt} · Gerät zurück: ${it.fields['Gerät zurück?']}`
    : it.category === 'acctExpiring' ? `Konto-Ablauf ${it.fields['Konto-Ablauf']}`
    : ''

  const cols: Col[] = [
    { key: 'cat', label: 'Kategorie', get: it => CATEGORY_LABEL[it.category], num: it => it.days },
    { key: 'user', label: 'Benutzer', get: it => it.fields.Benutzer || it.title },
    { key: 'corp', label: 'Corp-ID', get: it => it.fields['Corp-ID'] },
    { key: 'dept', label: 'Abteilung', get: it => it.fields.Abteilung },
    { key: 'info', label: 'Details', get: it => infoFor(it) },
  ]

  function doExport() {
    exportCsv('AD-Hygiene-Radar.csv', ['Kategorie', 'Benutzer', 'Corp-ID', 'Abteilung', 'Details', 'Kennzahl'],
      filtered.map(it => [CATEGORY_LABEL[it.category], it.fields.Benutzer || it.title, it.fields['Corp-ID'] || '', it.fields.Abteilung || '', infoFor(it), isNaN(it.days) ? '' : String(it.days)]))
  }

  const selCls = 'px-2 py-1.5 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary'

  return (
    <div className="space-y-3">
      <PwdReminderPanel items={items} />
      {!hasPwd && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          <span className="flex-1">Passwort-Ablauf noch nicht geladen — es werden vorerst nur inaktive Konten & ausgetretene Mitarbeiter aus dem AD-Tagescache angezeigt. „AD aktualisieren" holt Passwort-Ablauf & Konto-Ablauf frisch aus AD.</span>
        </div>
      )}
      {/* Filter-Leiste */}
      <div className="flex items-end gap-2 flex-wrap rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Kategorien</label>
          <div className="flex items-center gap-1 flex-wrap">
            {HYG_CATS.map(c => (
              <button key={c} onClick={() => toggleCat(c)}
                className={`px-2 py-1 text-[11px] rounded-full border ${cats.has(c) ? 'bg-primary/20 text-primary border-primary/40' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Schwelle</label>
          <div className="flex items-center gap-1">
            <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={thrActive} onChange={e => setThrActive(e.target.checked)} className="accent-primary" />
              aktiv
            </label>
            <input type="number" min={0} value={thr} disabled={!thrActive} onChange={e => setThr(Math.max(0, Number(e.target.value)))} className={`${selCls} w-16 disabled:opacity-40`} />
            <span className="text-[11px] text-muted-foreground">Tage (Ablauf ≤ / inaktiv ≥)</span>
          </div>
        </div>
        <FilterSelect label="Abteilung" value={fDept} onChange={setFDept} options={distinctDept} />
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Suche</label>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, Corp-ID, Abteilung…" className={`${selCls} w-full pl-7`} />
          </div>
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}AD aktualisieren
        </button>
        <button onClick={doExport} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">
          <Download size={13} />CSV
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {filtered.length} von {items.length} Meldungen{loadedAt ? ` · AD-Stand: ${new Date(loadedAt).toLocaleString('de-DE')}` : ''}.
      </p>
      <RadarTable items={filtered} cols={cols} kind="mixed"
        drill={it => it.person ? <PersonInfoButton name={it.person.name} sam={it.person.sam || undefined} /> : null} />
    </div>
  )
}

// ── Passwort-Erinnerungen (Panel im AD-Hygiene-Tab) ─────────────────────────────
function PwdReminderPanel({ items }: { items: RadarItem[] }) {
  const [cfg, setCfg] = useState<PwdReminderConfig>({ enabled: false, testRecipient: '' })
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState<ReminderPreview[] | null>(null)

  useEffect(() => {
    loadReminderConfig().then(c => { setCfg(c); setTestTo(c.testRecipient || '') }).catch(() => {})
  }, [])

  // Ziele direkt aus den (immer aktuellen) „Passwort läuft ab"-Items ableiten.
  const targets = useMemo(() => targetsFromItems(items), [items])
  const count = useMemo(() => recipientsToday(targets, new Date()).length, [targets])

  async function toggleEnabled(v: boolean) {
    const next = { ...cfg, enabled: v }
    setCfg(next); await saveReminderConfig(next)
    setMsg(v ? 'Automatischer Versand aktiviert (werktags 07:00).' : 'Automatischer Versand deaktiviert.')
  }
  async function jetztSenden() {
    if (count === 0) { setMsg('Heute gibt es niemanden zu benachrichtigen.'); return }
    const now = new Date()
    // Prüfen, ob heute schon jemand benachrichtigt wurde → dann Extra-Bestätigung + erneuter Versand (force).
    let force = false
    try {
      const st = await sentStatusToday(targets, now)
      if (st.alreadySent > 0) {
        if (!window.confirm(`Die Erinnerung wurde heute bereits an ${st.alreadySent} von ${count} Mitarbeiter(n) verschickt. Wollen Sie sie wirklich noch einmal verschicken? Die betroffenen Mitarbeiter erhalten die Mail dann erneut.`)) return
        force = true
      } else {
        if (!window.confirm(`${count} Mitarbeiter erhalten jetzt eine Erinnerungs-E-Mail an ihre eigene Adresse. Fortfahren?`)) return
      }
    } catch {
      // Status nicht lesbar → wie bisher normal bestätigen (ohne force).
      if (!window.confirm(`${count} Mitarbeiter erhalten jetzt eine Erinnerungs-E-Mail an ihre eigene Adresse. Fortfahren?`)) return
    }
    setBusy(true); setMsg('')
    try {
      const r = await sendReminders(targets, now, { force })
      setMsg(`${r.sent} gesendet` + (r.skipped ? `, ${r.skipped} heute bereits benachrichtigt` : '') + (r.failed ? `, ${r.failed} fehlgeschlagen` : '') + (r.ohneMail ? `, ${r.ohneMail} ohne E-Mail` : '') + '.')
    } finally { setBusy(false) }
  }
  async function testSenden() {
    const to = testTo.trim()
    if (!to) { setMsg('Bitte eine Test-Empfängeradresse eintragen.'); return }
    setBusy(true); setMsg('')
    await saveReminderConfig({ ...cfg, testRecipient: to })
    try {
      const r = await sendTestReminder(to, targets, new Date())
      setMsg(r.success ? `Test-Mail an ${to} verschickt.` : `Test-Mail fehlgeschlagen: ${r.error || 'unbekannt'}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Mail size={15} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">Passwort-Erinnerungen</span>
        <span className="text-[11px] text-muted-foreground">— Mitarbeiter, deren Passwort am nächsten Werktag abläuft, per E-Mail erinnern (Wochenende → freitags).</span>
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" checked={cfg.enabled} onChange={e => toggleEnabled(e.target.checked)} className="accent-primary" />
          Automatisch werktags 07:00 senden
        </label>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Heute würden <b className="text-foreground">{count}</b> Mitarbeiter benachrichtigt.</span>
        <button onClick={() => setPreview(buildPreviews(targets, new Date()))} disabled={count === 0}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
          <Eye size={13} />Vorschau ({count})
        </button>
        <button onClick={jetztSenden} disabled={busy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Erinnerungs-Mails jetzt senden
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="test@firma.de"
          className="px-2 py-1.5 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary w-48" />
        <button onClick={testSenden} disabled={busy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
          <Mail size={13} />Test-Mail verschicken
        </button>
      </div>
      {msg && <div className="text-[11px] text-foreground bg-muted/30 border border-border rounded px-2 py-1">{msg}</div>}
      {preview && <PwdPreviewModal previews={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

// Vorschau der Mails, die heute automatisch verschickt würden (Empfänger prüfen).
function PwdPreviewModal({ previews, onClose }: { previews: ReminderPreview[]; onClose: () => void }) {
  const fmt = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
          <Eye size={18} className="text-primary" />
          <div className="text-sm font-semibold text-foreground">Vorschau — {previews.length} Empfänger</div>
          <span className="text-[11px] text-muted-foreground">So prüfst du, wer die Mail bekäme.</span>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-md hover:bg-accent text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {previews.length === 0 && <div className="text-sm text-muted-foreground">Heute niemand.</div>}
          {previews.map((p, i) => (
            <div key={i} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-muted/20 text-xs">
                <span className="font-semibold text-foreground">{i + 1}. {p.name || '—'}</span>
                <span className="font-mono text-muted-foreground">{p.email}</span>
                <span className="ml-auto text-amber-300">Passwort läuft ab: {fmt(p.expiry)}</span>
              </div>
              <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border/60">Betreff: <span className="text-foreground">{p.subject}</span></div>
              <div className="bg-white p-3 max-h-64 overflow-auto" dangerouslySetInnerHTML={{ __html: p.body }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── kleine Bausteine ───────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="px-2 py-1.5 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary max-w-[160px]">
        <option value="">Alle</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ── Einstellungen (Schwellen + Mail) ──────────────────────────────────────────

function SettingsPanel({ settings, onClose, onSaved }: { settings: RadarSettings; onClose: () => void; onSaved: (s: RadarSettings) => void }) {
  const [draft, setDraft] = useState<RadarSettings>(settings)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try { await saveRadarSettings(draft); onSaved(draft); onClose() } finally { setSaving(false) }
  }
  const numCls = 'px-2 py-1 text-xs rounded-md bg-background border border-border text-foreground w-20 focus:outline-none focus:border-primary'

  return (
    <div className="mx-6 mt-3 rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 size={15} className="text-blue-400" />
        <h3 className="text-sm font-bold text-foreground">Schwellen (AD-Hygiene)</h3>
        <button onClick={onClose} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground"><X size={15} /></button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">Kein Login seit ≥ (Tage)
          <input type="number" min={1} value={draft.hygiene.staleLoginDays} onChange={e => setDraft(s => ({ ...s, hygiene: { ...s.hygiene, staleLoginDays: Math.max(1, Number(e.target.value)) } }))} className={numCls} /></label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">Passwort ≤ (Tage)
          <input type="number" min={0} value={draft.hygiene.pwdExpiringDays} onChange={e => setDraft(s => ({ ...s, hygiene: { ...s.hygiene, pwdExpiringDays: Math.max(0, Number(e.target.value)) } }))} className={numCls} /></label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">Konto-Ablauf ≤ (Tage)
          <input type="number" min={0} value={draft.hygiene.acctExpiringDays} onChange={e => setDraft(s => ({ ...s, hygiene: { ...s.hygiene, acctExpiringDays: Math.max(0, Number(e.target.value)) } }))} className={numCls} /></label>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving && <Loader2 size={13} className="animate-spin" />}Speichern
        </button>
        <span className="text-[10px] text-muted-foreground">Legt fest, ab wann AD-Hygiene-Meldungen erscheinen. Gilt zentral für alle App-Nutzer.</span>
      </div>
    </div>
  )
}
