// ── Netzwerk-Diagnose: Analyse-Modal (Befunde, Anwenden, Rückgängig, PDF) ────

import { useEffect, useMemo, useState } from 'react'
import { X, Wifi, AlertTriangle, ChevronDown, Info, FileDown, RotateCcw, Loader2, Check, ShieldAlert } from 'lucide-react'
import { analysiere } from './analyse'
import { applyNetFixes, restoreNetFixes, fixToWire, saveFixBackup, loadFixBackup, type NetFixBackup } from './applyFix'
import { buildLaufPdf, buildAenderungsPdf, savePdf, sanitizeName, type AenderungsBericht, type AenderungsBerichtEintrag } from './pdf'
import { useAuthStore } from '../store/authStore'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import type { NetLauf, NetBefund } from './types'

const GEWICHT_BADGE: Record<string, string> = {
  HOCH: 'bg-red-500 text-white border-red-600',
  MITTEL: 'bg-amber-400 text-black border-amber-500',
  GERING: 'bg-yellow-300 text-black border-yellow-400',
  INFO: 'bg-slate-300 text-black border-slate-400',
}
const KAT_LABEL: Record<string, string> = {
  'powercfg-wifi': 'Energieplan (WLAN)', 'netpower': 'Geräte-Energieverwaltung', 'netadv': 'Adapter-Einstellung',
  'treiber': 'Treiber', 'netzwerk': 'Netzwerk / Access Point', 'info': 'Information',
}

export default function NetAnalyse({ lauf, onClose }: { lauf: NetLauf; onClose: () => void }) {
  const authUser = useAuthStore(s => s.session?.user)
  const by = authUser?.displayName || authUser?.username || 'unbekannt'
  const befunde = useMemo(() => analysiere(lauf), [lauf])
  const fixbar = befunde.filter(b => b.fixbar && b.fix)

  const [selected, setSelected] = useState<Set<string>>(() => new Set(fixbar.filter(b => !b.standardAus).map(b => b.id)))
  const [infoOpen, setInfoOpen] = useState<Set<string>>(new Set())
  const [ausfOpen, setAusfOpen] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [applying, setApplying] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [report, setReport] = useState<AenderungsBericht | null>(null)
  const [backup, setBackup] = useState<NetFixBackup | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadFixBackup(lauf.pc).then(setBackup) }, [lauf.pc])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n)
  }

  async function doApply() {
    setShowConfirm(false)
    const gewaehlt = fixbar.filter(b => selected.has(b.id))
    if (!gewaehlt.length) { setMsg('Nichts ausgewählt.'); return }
    setApplying(true); setMsg('')
    const wires = gewaehlt.map(b => fixToWire(b.id, b.titel, b.fix!))
    const res = await applyNetFixes(lauf.pc, wires)
    setApplying(false)
    if (!res.ok && res.error) { setMsg('Fehler: ' + res.error); return }
    const byId = new Map(res.results.map(r => [r.id, r]))
    const eintraege: AenderungsBerichtEintrag[] = gewaehlt.map(b => {
      const r = byId.get(b.id)
      return { titel: b.titel, kategorie: KAT_LABEL[b.kategorie] || b.kategorie, fundort: b.fundort,
        alt: r?.alt || '—', neu: r?.neu || '—', ok: !!r?.ok, fehler: r?.fehler || undefined }
    })
    const okN = eintraege.filter(e => e.ok).length
    const rep: AenderungsBericht = { host: lauf.pc, at: new Date().toISOString(), by, gesamt: gewaehlt.length, ok: okN, gesichert: true, neustartNoetig: res.neustartNoetig, eintraege }
    setReport(rep)
    const bk: NetFixBackup = { host: lauf.pc, changedAt: rep.at, changedBy: by, entries: res.results.filter(r => r.ok), neustartNoetig: res.neustartNoetig }
    await saveFixBackup(bk); setBackup(bk)
    setMsg(`${okN} von ${gewaehlt.length} Einstellung(en) geändert.` + (res.neustartNoetig ? ' Adapter-Einstellungen werden nach WLAN-Neuverbindung/Neustart wirksam.' : ''))
  }

  async function doRestore() {
    if (!backup || !backup.entries.length) return
    setRestoring(true); setMsg('')
    const res = await restoreNetFixes(lauf.pc, backup.entries)
    setRestoring(false)
    if (!res.ok && res.error) { setMsg('Fehler beim Zurücksetzen: ' + res.error); return }
    setMsg(`${res.results.filter(r => r.ok).length} von ${backup.entries.length} Einstellung(en) zurückgesetzt.`)
    setReport(null)
  }

  const d = lauf.daten
  const invasivGewaehlt = fixbar.some(b => b.standardAus && selected.has(b.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Kopf */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
          <Wifi size={18} className="text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground font-mono"><span className="inline-flex items-center gap-1">{lauf.pc}{lauf.pc && <DeviceInfoButton hostname={lauf.pc} />}</span></div>
            <div className="text-[11px] text-muted-foreground truncate">
              {lauf.rolle === 'problem' ? 'Problem-PC' : 'Referenz-PC (OK)'} · {d.adapter?.ifDesc || 'kein Adapter'} · Treiber {d.adapter?.driverVersion || '—'}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => savePdf(buildLaufPdf(lauf, befunde), `NetzDiagnose_${sanitizeName(lauf.pc)}.pdf`)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
              <FileDown size={13} />PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"><X size={16} /></button>
          </div>
        </div>

        {/* Kennwerte-Kopf */}
        <div className="px-5 py-2 border-b border-border shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
          <Kv label="Modell" value={d.system?.modell} />
          <Kv label="Energieplan" value={d.powercfg?.schema} />
          <Kv label="WLAN-Sparen (Netz/Akku)" value={`${d.powercfg?.wlanAc ?? '—'} / ${d.powercfg?.wlanDc ?? '—'}`} />
          <Kv label="Aussetzer (14 T.)" value={d.ereignisse ? String(d.ereignisse.disconnects) : '—'} />
          <Kv label="Aktueller AP" value={d.verbindung?.bssid} />
          <Kv label="Signal / Funktyp" value={`${d.verbindung?.signal || '—'} / ${d.verbindung?.radio || '—'}`} />
          <Kv label="Modern Standby" value={d.powercfg?.modernStandby == null ? '—' : (d.powercfg.modernStandby ? 'ja' : 'nein')} />
          <Kv label="Adapter abschaltbar" value={d.powerMgmt?.allowTurnOff == null ? '—' : (d.powerMgmt.allowTurnOff ? 'ja' : 'nein')} />
        </div>

        {/* Befunde */}
        <div className="flex-1 overflow-auto px-5 py-3 space-y-2">
          {befunde.map(b => (
            <BefundKarte key={b.id} b={b} checked={selected.has(b.id)} onCheck={() => toggle(selected, setSelected, b.id)}
              infoOn={infoOpen.has(b.id)} onInfo={() => toggle(infoOpen, setInfoOpen, b.id)}
              ausfOn={ausfOpen.has(b.id)} onAusf={() => toggle(ausfOpen, setAusfOpen, b.id)} />
          ))}
          {report && (
            <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
              <div className="text-sm font-semibold text-emerald-300 mb-1">Änderungsbericht</div>
              <div className="text-xs text-foreground mb-2">{report.ok} von {report.gesamt} geändert{report.neustartNoetig ? ' · Neuverbindung/Neustart nötig, damit Adapter-Einstellungen greifen' : ''}.</div>
              {report.eintraege.map((e, i) => (
                <div key={i} className="text-[11px] py-0.5 border-b border-border/40 last:border-0">
                  <span className={e.ok ? 'text-emerald-400' : 'text-red-400'}>{e.ok ? '✓' : '✕'}</span>{' '}
                  <span className="text-foreground">{e.titel}</span>{' '}
                  <span className="font-mono text-muted-foreground">{e.alt} → {e.neu}</span>
                  {e.fehler && <span className="text-red-400"> ({e.fehler})</span>}
                </div>
              ))}
              <button onClick={() => savePdf(buildAenderungsPdf(report), `NetzChange_${sanitizeName(lauf.pc)}.pdf`)}
                className="mt-2 inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10">
                <FileDown size={13} />Änderungsbericht als PDF
              </button>
            </div>
          )}
        </div>

        {/* Fuß / Aktionen */}
        <div className="px-5 py-3 border-t border-border shrink-0 space-y-2">
          {msg && <div className="text-xs text-foreground bg-muted/30 border border-border rounded px-2 py-1.5">{msg}</div>}
          {showConfirm && (
            <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 text-amber-200 space-y-2">
              <div className="flex items-start gap-1.5"><ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <span>{[...selected].length} Einstellung(en) auf <b>{lauf.pc}</b> ändern?{invasivGewaehlt ? ' Achtung: eine invasive Einstellung (z. B. 802.11ax-Zwang) ist gewählt.' : ''} Adapter-Einstellungen werden erst nach WLAN-Neuverbindung/Neustart wirksam; die Altwerte werden gesichert.</span>
              </div>
              <div className="flex gap-2">
                <button onClick={doApply} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">Ja, ändern</button>
                <button onClick={() => setShowConfirm(false)} className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">Abbrechen</button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{[...selected].length} von {fixbar.length} behebbaren gewählt</span>
            <div className="ml-auto flex items-center gap-2">
              {backup && backup.entries.length > 0 && (
                <button onClick={doRestore} disabled={restoring}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
                  {restoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}Änderungen rückgängig
                </button>
              )}
              <button onClick={() => setShowConfirm(true)} disabled={applying || [...selected].length === 0}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50">
                {applying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Ausgewählte anwenden
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Kv({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0"><span className="text-muted-foreground">{label}: </span><span className="text-foreground font-mono break-words">{value || '—'}</span></div>
}

function BefundKarte({ b, checked, onCheck, infoOn, onInfo, ausfOn, onAusf }: {
  b: NetBefund; checked: boolean; onCheck: () => void; infoOn: boolean; onInfo: () => void; ausfOn: boolean; onAusf: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        {b.fixbar && b.fix
          ? <input type="checkbox" checked={checked} onChange={onCheck} className="accent-primary mt-1 shrink-0" />
          : <span className="w-3.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${GEWICHT_BADGE[b.gewicht]}`}>{b.gewicht}</span>
            <span className="text-sm font-semibold text-foreground">{b.titel}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border">{KAT_LABEL[b.kategorie] || b.kategorie}</span>
            {b.fixbar && b.fix && <span className="text-[10px] text-emerald-400">im Tool behebbar</span>}
          </div>
          <div className="text-xs font-mono text-muted-foreground mt-1">Ist: {b.ist} → Soll: {b.soll}</div>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={onInfo} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Info size={12} />Problem & Wirkung</button>
            {b.erklaerung && <button onClick={onAusf} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><ChevronDown size={12} className={ausfOn ? 'rotate-180 transition-transform' : 'transition-transform'} />Ausführliche Erklärung</button>}
          </div>
          {infoOn && <div className="mt-1.5 text-xs text-foreground/90 bg-muted/20 rounded p-2">{b.wirkung}{b.hinweis ? ` — ${b.hinweis}` : ''}</div>}
          {ausfOn && b.erklaerung && (
            <div className="mt-1.5 text-xs bg-muted/20 rounded p-2 space-y-1">
              <p><b>Was sich ändert:</b> {b.erklaerung.aenderung}</p>
              <p className="text-emerald-300"><b>Vorteil:</b> {b.erklaerung.vorteil}</p>
              <p className="text-amber-300"><b>Nachteil:</b> {b.erklaerung.nachteil}</p>
              <p className="text-muted-foreground"><b>Wann nicht ändern:</b> {b.erklaerung.wannNicht}</p>
              <p className="text-muted-foreground/80"><AlertTriangle size={11} className="inline mr-1" />Fundort: {b.fundort}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
