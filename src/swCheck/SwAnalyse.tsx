// ── SolidWorks-Diagnose: Analyse & Fehlerbeseitigung (UI) ─────────────────────
// Öffnet sich je PC aus dem Diagnose-Ergebnis. Listet alle Befunde übersichtlich,
// jeder mit „i" (was ist das Problem, was bringt die Änderung) + Checkbox
// „Fehler beseitigen" (nur für lokal setzbare). Anwenden schreibt die Sollwerte auf
// den Ziel-PC (mit Backup der Altwerte → jederzeit wiederherstellbar). Defender-Themen
// werden als englischer Ticket-Text (copy-paste) ausgegeben statt automatisch geändert.

import { useEffect, useMemo, useState } from 'react'
import {
  X, Info, ShieldAlert, Wrench, FileText, RotateCcw, Loader2, CheckCircle2, XCircle,
  Ticket, Copy, Check, AlertTriangle, BookOpen, ChevronDown, Wifi,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { logDeviceAction } from '../services/deviceDossier'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import type { SwLauf } from './swCheck.types'
import { analysiere, defenderTicketText, cadNetzPfade, type Befund, type FixKategorie, type RegFix } from './analyse'
import {
  applyFixes, restoreFixes, applyPowerplan, applySmbConfig, restoreSmbConfig, ermittleSwPfade,
  ermittleAutoRecoverZiel, messeFreigabe,
  saveFixBackup, loadFixBackup, backupFromApply, mergeBackupEntries, mergeSmbBackup,
  type ApplyResult, type FixBackup, type SmbBackupEntry, type FreigabeMessung,
} from './applyFix'
import { buildAenderungsPdf, savePdf, type AenderungsBericht, type AenderungsBerichtEintrag } from './pdf'

const GEWICHT_BADGE: Record<string, string> = {
  HOCH: 'bg-red-500/15 text-red-300 border-red-500/40',
  MITTEL: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  GERING: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  INFO: 'bg-muted/40 text-muted-foreground border-border',
}
const KAT_LABEL: Record<FixKategorie, string> = {
  'registry-hkcu': 'lokal setzbar (Anwenderprofil)',
  'registry-hklm': 'lokal setzbar (Maschine)',
  'smb': 'per WinRM setzbar (SMB-Client)',
  'powercfg': 'Energieplan',
  'ticket-defender': 'zentral → Ticket',
  'sicherheit': 'Sicherheitsentscheidung',
  'gpo': 'zentral / GPO',
  'komplex': 'Sonderfall',
  'info': 'nur Information',
}

export default function SwAnalyse({ lauf, onClose }: { lauf: SwLauf; onClose: () => void }) {
  const by = useAuthStore(s => s.session?.user.displayName || s.session?.user.username || 'unbekannt')
  const befunde = useMemo(() => analysiere(lauf), [lauf])
  const fixbar = befunde.filter(b => b.fixbar)
  const defenderBefunde = befunde.filter(b => b.kategorie === 'ticket-defender')

  const [selected, setSelected] = useState<Set<string>>(() => new Set(fixbar.filter(b => !b.standardAus).map(b => b.id)))  // Default: alle setzbaren an, außer Sicherheits-Herabstufungen
  const [infoOpen, setInfoOpen] = useState<Set<string>>(new Set())
  const [ausfOpen, setAusfOpen] = useState<Set<string>>(new Set())   // „Ausführliche Erklärung" je Befund
  const [messungen, setMessungen] = useState<Map<string, FreigabeMessung | 'busy'>>(new Map())   // Freigabe-Messergebnisse
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmApply, setConfirmApply] = useState(false)
  const [ticket, setTicket] = useState<string>('')
  const [ticketBusy, setTicketBusy] = useState(false)
  const [report, setReport] = useState<AenderungsBericht | null>(null)   // Änderungsbericht nach dem Anwenden
  const [pdfBusy, setPdfBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [backup, setBackup] = useState<FixBackup | null>(null)

  useEffect(() => { void loadFixBackup(lauf.pc).then(setBackup) }, [lauf.pc])

  const hatBackup = !!backup && (backup.entries.length > 0 || !!backup.powerplanOld || (backup.smb?.length ?? 0) > 0)

  const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleInfo = (id: string) => setInfoOpen(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAusf = (id: string) => setAusfOpen(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selCount = befunde.filter(b => b.fixbar && selected.has(b.id)).length

  async function apply() {
    setConfirmApply(false)
    const gewaehlt = befunde.filter(b => b.fixbar && selected.has(b.id))
    const regBefunde = gewaehlt.filter(b => b.reg && !b.regBerechnet)
    const arBefunde = gewaehlt.filter(b => b.reg && b.regBerechnet)   // AutoRecover/Backup: Zielwert erst am PC berechnen
    const powerBefunde = gewaehlt.filter(b => b.kategorie === 'powercfg' && b.powerplan)
    const smbBefunde = gewaehlt.filter(b => b.kategorie === 'smb' && b.smb)
    if (!regBefunde.length && !arBefunde.length && !powerBefunde.length && !smbBefunde.length) return
    const gewaehltGesamt = regBefunde.length + arBefunde.length + powerBefunde.length + smbBefunde.length
    const sidHint = befunde.map(b => b.reg?.hkuSid).find(Boolean) || undefined
    setBusy(true); setMsg(null); setResult(null); setReport(null)
    const eintraege: AenderungsBerichtEintrag[] = []   // für den Änderungsbericht (PDF)
    try {
      // 0) AutoRecover/Backup: gültigen lokalen Zielordner am PC berechnen + anlegen → sollValue setzen.
      const arFixes: RegFix[] = []
      let arError = ''
      if (arBefunde.length) {
        const z = await ermittleAutoRecoverZiel(lauf.pc, sidHint)
        arError = z.error || ''
        for (const b of arBefunde) {
          const val = b.regBerechnet === 'backup' ? z.backup : z.autorecover
          if (val) arFixes.push({ ...b.reg!, sollValue: val })
        }
      }
      // 1) Registry-Fixes (mit Backup der Altwerte) — inkl. AutoRecover/Backup.
      const alleRegFixes = [...regBefunde.map(b => b.reg!), ...arFixes]
      let res: ApplyResult = { ok: true, swOffen: false, applied: [] }
      if (alleRegFixes.length) res = await applyFixes(lauf.pc, alleRegFixes)
      if (res.swOffen) { setResult(res); setMsg({ ok: false, text: 'SOLIDWORKS läuft am Ziel-PC — bitte schließen und erneut versuchen.' }); return }
      setResult(res)
      const regOk = res.applied.filter(a => a.ok).length
      const regFehler = res.applied.filter(a => !a.ok)
      for (const a of res.applied) {
        const bef = gewaehlt.find(g => g.reg && g.reg.name === a.name && g.reg.relKey === a.relKey)
        eintraege.push({ titel: bef?.titel || a.name, kategorie: bef ? KAT_LABEL[bef.kategorie] : `Registry (${a.scope})`, fundort: bef?.fundort, alt: a.oldValue ?? '', neu: a.newValue, ok: a.ok, fehler: a.error || undefined })
      }
      // AutoRecover/Backup-Befunde, deren Zielordner nicht ermittelt werden konnte → als Fehlschlag erfassen.
      for (const b of arBefunde) {
        if (!arFixes.some(f => f.name === b.reg!.name && f.relKey === b.reg!.relKey)) {
          eintraege.push({ titel: b.titel, kategorie: KAT_LABEL[b.kategorie], fundort: b.fundort, alt: b.ist, neu: '(nicht gesetzt)', ok: false, fehler: arError || 'Anwenderprofil/SID nicht ermittelbar' })
        }
      }
      // 2) Energieplan (best effort)
      let powerplanOld: string | undefined; let powerOk = 0
      for (const pb of powerBefunde) {
        const pr = await applyPowerplan(lauf.pc, pb.powerplan!)
        if (pr.ok) { powerOk++; if (pr.oldGuid) powerplanOld = pr.oldGuid }
        eintraege.push({ titel: pb.titel, kategorie: 'Energieplan', alt: 'vorheriger Energieplan', neu: 'Höchstleistung', ok: pr.ok, fehler: pr.error })
      }
      // 3) SMB-Client-Konfiguration (mit Backup der Altwerte)
      let smbBackupFresh: SmbBackupEntry[] = []; let smbOk = 0; let smbErr = ''
      if (smbBefunde.length) {
        const sr = await applySmbConfig(lauf.pc, smbBefunde.map(b => ({ prop: b.smb!.prop, ziel: b.smb!.ziel })))
        smbOk = sr.applied.filter(a => a.ok).length
        smbErr = sr.error || sr.applied.find(a => !a.ok)?.error || ''
        smbBackupFresh = sr.applied.filter(a => a.ok && a.old !== null).map(a => ({ prop: a.prop, old: a.old as boolean, titel: smbBefunde.find(b => b.smb!.prop === a.prop)?.titel }))
        for (const a of sr.applied) {
          const bef = smbBefunde.find(b => b.smb!.prop === a.prop)
          eintraege.push({ titel: bef?.titel || a.prop, kategorie: 'SMB-Client-Konfiguration', fundort: `Set-SmbClientConfiguration -${a.prop}`, alt: a.old === null ? '—' : (a.old ? 'True' : 'False'), neu: a.ziel ? 'True' : 'False', ok: a.ok, fehler: a.error || undefined })
        }
      }
      // 4) Backup persistieren (mit vorhandenem mergen → je Punkt der URSPRÜNGLICHE Wert bleibt erhalten)
      const frischeEntries = backupFromApply(res.applied).map(e => ({ ...e, titel: gewaehlt.find(g => g.reg && g.reg.name === e.name && g.reg.relKey === e.relKey)?.titel }))
      const mergedEntries = mergeBackupEntries(backup?.entries ?? [], frischeEntries)
      const mergedSmb = mergeSmbBackup(backup?.smb ?? [], smbBackupFresh)
      const b: FixBackup = { host: lauf.pc, changedAt: new Date().toISOString(), changedBy: by, entries: mergedEntries, powerplanOld: backup?.powerplanOld ?? powerplanOld, smb: mergedSmb }
      await saveFixBackup(b); setBackup(b)
      // 5) EHRLICHE Meldung: gesetzt vs. gewählt; bei Fehlern die Ursache nennen.
      const okN = regOk + powerOk + smbOk
      setReport({ host: lauf.pc, benutzer: lauf.kennwerte?.benutzer, swVersion: lauf.kennwerte?.swVersion, at: new Date().toISOString(), by, gesamt: gewaehltGesamt, ok: okN, gesichert: okN > 0, eintraege })
      if (okN === 0) {
        const grund = res.error || regFehler[0]?.error || smbErr || arError || 'unbekannt — Details je Zeile.'
        setMsg({ ok: false, text: `0 von ${gewaehltGesamt} gesetzt. Grund: ${grund}` })
      } else if (okN < gewaehltGesamt) {
        setMsg({ ok: false, text: `${okN} von ${gewaehltGesamt} gesetzt — ${gewaehltGesamt - okN} fehlgeschlagen (${res.error || regFehler[0]?.error || smbErr || arError || 'Details je Zeile'}). Altwerte gesichert.` })
      } else {
        setMsg({ ok: true, text: `${okN} Einstellung(en) auf ${lauf.pc} gesetzt. Altwerte gesichert (wiederherstellbar).` })
      }
      if (okN > 0) void logDeviceAction(lauf.pc, undefined,
        `SolidWorks-Analyse: ${okN}/${gewaehltGesamt} Einstellung(en) korrigiert (${gewaehlt.map(g => g.titel).join('; ')}). Altwerte gesichert.`, by, 'SolidWorks-Analyse')
    } catch (e) {
      setMsg({ ok: false, text: 'Fehler: ' + (e instanceof Error ? e.message : String(e)) })
    } finally { setBusy(false) }
  }

  async function restore() {
    if (!backup || busy) return
    setBusy(true); setMsg(null)
    try {
      let ok = true
      if (backup.entries.length) { const r = await restoreFixes(lauf.pc, backup.entries); ok = r.ok && !r.swOffen; if (r.swOffen) { setMsg({ ok: false, text: 'SOLIDWORKS läuft — bitte schließen, dann wiederherstellen.' }); return } }
      if (backup.powerplanOld) await applyPowerplan(lauf.pc, backup.powerplanOld)
      if (backup.smb?.length) { const sr = await restoreSmbConfig(lauf.pc, backup.smb.map(s => ({ prop: s.prop, old: s.old }))); if (!sr.ok) ok = false }
      setMsg({ ok, text: ok ? `Ursprünglicher Stand auf ${lauf.pc} wiederhergestellt.` : 'Wiederherstellung teilweise fehlgeschlagen — siehe Details.' })
      void logDeviceAction(lauf.pc, undefined, `SolidWorks-Analyse: Ursprünglicher Stand wiederhergestellt (${backup.entries.length} Registry-Werte${backup.smb?.length ? ' + ' + backup.smb.length + ' SMB' : ''}).`, by, 'SolidWorks-Analyse')
    } catch (e) { setMsg({ ok: false, text: 'Fehler: ' + (e instanceof Error ? e.message : String(e)) }) }
    finally { setBusy(false) }
  }

  async function zeigTicket() {
    if (ticketBusy) return
    setTicketBusy(true)
    try {
      // Am Ziel LIVE ermitteln: gemappte Laufwerke (→ echte UNC-CAD-Pfade), echter SolidWorks-
      // Installationsordner und welche lokalen Kandidatenpfade EXISTIEREN — damit NUR reale Pfade
      // ins Ticket kommen (nichts Geratenes). SID-Hinweis aus den Befunden.
      const sidHint = befunde.map(b => b.reg?.hkuSid).find(Boolean) || undefined
      // Lokale Kandidaten, die am Ziel per Test-Path geprüft werden (nur vorhandene landen im Ticket).
      const pxBef = befunde.find(b => b.kategorie === 'ticket-defender' && /portax/i.test(`${b.titel} ${b.fundort} ${b.ist}`))
      const pxLokal = (pxBef?.ist || '').replace(/\s*(nicht ausgenommen|not excluded)\s*$/i, '').trim()
      const kandidaten = [
        'C:\\Program Files\\SOLIDWORKS Corp', 'C:\\Program Files\\SolidWorks', 'C:\\Program Files\\SolidWorks Corp',
        'C:\\ProgramData\\SolidWorks', 'C:\\ProgramData\\SOLIDWORKS',
        ...(/^[A-Za-z]:\\/.test(pxLokal) ? [pxLokal] : []),
      ]
      let map: Record<string, string> = {}
      let lokal: string[] = []
      let swPaths: string[] = []
      try {
        const r = await ermittleSwPfade(lauf.pc, sidHint, kandidaten)
        map = r.map || {}
        swPaths = r.swPaths || []
        // Installationsordner + vorhandene Kandidaten, case-insensitiv dedupliziert.
        const seen = new Set<string>(); lokal = []
        for (const p of [r.installDir, ...(r.lokal || [])]) { if (!p) continue; const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); lokal.push(p) } }
      } catch { /* offline → ohne Live-Auflösung, Ticket nutzt Platzhalter */ }
      setTicket(defenderTicketText(lauf, befunde, cadNetzPfade(lauf, map, swPaths), lokal))
    } finally { setTicketBusy(false) }
  }
  function copyTicket() { navigator.clipboard.writeText(ticket).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }

  // Freigabemessung nachholen: CAD-Freigabe ermitteln und am PC messen (Durchsatz/Latenz/Auflistung).
  async function messeFreigabeFuer(b: Befund) {
    setMessungen(m => new Map(m).set(b.id, 'busy'))
    try {
      const sidHint = befunde.map(x => x.reg?.hkuSid).find(Boolean) || undefined
      const r = await ermittleSwPfade(lauf.pc, sidHint, [])
      const cad = cadNetzPfade(lauf, r.map || {}, r.swPaths || [])
      const unc = cad.find(p => /^\\\\w3143/i.test(p)) || cad[0]
      if (!unc) { setMessungen(m => new Map(m).set(b.id, { ok: false, unc: '', fehler: 'Keine CAD-Netzfreigabe ermittelbar (kein gemapptes Laufwerk?).' })); return }
      const mess = await messeFreigabe(lauf.pc, unc)
      setMessungen(m => new Map(m).set(b.id, mess))
    } catch (e) { setMessungen(m => new Map(m).set(b.id, { ok: false, unc: '', fehler: e instanceof Error ? e.message : String(e) })) }
  }

  // Änderungsbericht des letzten Anwendens als PDF exportieren.
  async function berichtPdf() {
    if (!report || pdfBusy) return
    setPdfBusy(true)
    try {
      const stamm = `SWAnalyse-Aenderungen_${lauf.pc}_${new Date().toISOString().slice(0, 10)}`
      await savePdf(buildAenderungsPdf(report), `${stamm}.pdf`)
    } finally { setPdfBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-4xl my-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Kopf */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border sticky top-0 bg-card rounded-t-lg z-10">
          <Wrench size={16} className="text-primary" />
          <div>
            <h2 className="text-sm font-bold text-foreground">SolidWorks-Analyse & Fehlerbeseitigung</h2>
            <p className="text-[11px] text-muted-foreground font-mono"><span className="inline-flex items-center gap-1">{lauf.pc}{lauf.pc && <DeviceInfoButton hostname={lauf.pc} />}</span> · {lauf.kennwerte?.benutzer || '—'} · {befunde.length} Befunde · {fixbar.length} setzbar</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={16} /></button>
        </div>

        {/* Aktionsleiste */}
        <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-border bg-background/40">
          <button onClick={() => setConfirmApply(true)} disabled={busy || selCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}Ausgewählte beseitigen ({selCount})
          </button>
          {defenderBefunde.length > 0 && (
            <button onClick={() => void zeigTicket()} disabled={ticketBusy} title="Ermittelt live die echten CAD-Netzwerkpfade (gemappte Laufwerke → UNC) und füllt sie ins Ticket ein." className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
              {ticketBusy ? <Loader2 size={12} className="animate-spin" /> : <Ticket size={12} />}{ticketBusy ? 'ermittle CAD-Pfade …' : `Defender-Ticket erzeugen (${defenderBefunde.length})`}
            </button>
          )}
          {report && report.eintraege.length > 0 && (
            <button onClick={() => void berichtPdf()} disabled={pdfBusy}
              title="Bericht über die vorgenommenen Änderungen (alt → neu) als PDF speichern"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40">
              {pdfBusy ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}Änderungsbericht als PDF
            </button>
          )}
          {hatBackup && (
            <button onClick={restore} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40">
              <RotateCcw size={12} />Ursprünglichen Stand wiederherstellen
            </button>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1"><AlertTriangle size={11} className="text-amber-400" />Schreibt auf den Ziel-PC · SOLIDWORKS muss geschlossen sein</span>
        </div>

        {msg && <div className={`mx-4 mt-3 px-3 py-2 rounded-md text-xs flex items-center gap-1.5 ${msg.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}`}>{msg.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{msg.text}</div>}

        {hatBackup && backup && (
          <div className="mx-4 mt-2 px-3 py-1.5 rounded-md text-[11px] text-muted-foreground bg-muted/30 border border-border">
            Gesicherter Stand vom {new Date(backup.changedAt).toLocaleString('de-DE')} durch {backup.changedBy} — {backup.entries.length} Wert(e){backup.powerplanOld ? ' + Energieplan' : ''} wiederherstellbar.
          </div>
        )}

        {/* Ticket-Text */}
        {ticket && (
          <div className="mx-4 mt-3 rounded-md border border-blue-500/30 bg-blue-500/5 p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-blue-300 flex items-center gap-1"><FileText size={12} />Ticket-Felder (ServiceNow „Defender platform support – Path Exclusion/Whitelisting")</span>
              <button onClick={copyTicket} className="ml-auto flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-blue-500/40 text-blue-300 hover:bg-blue-500/10">{copied ? <Check size={11} /> : <Copy size={11} />}kopieren</button>
              <button onClick={() => setTicket('')} className="p-0.5 rounded text-muted-foreground hover:text-foreground"><X size={12} /></button>
            </div>
            <textarea readOnly value={ticket} className="w-full h-72 text-[11px] font-mono bg-background border border-border rounded p-2 text-foreground" />
          </div>
        )}

        {/* Befundliste */}
        <div className="p-4 space-y-1.5">
          {befunde.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Keine auswertbaren Befunde (kein Bewertungs-Lauf im Diagnose-Ergebnis?).</p>}
          {befunde.map(b => {
            const applied = result?.applied.find(a => b.reg && a.name === b.reg.name && a.relKey === b.reg.relKey)
            return (
              <div key={b.id} className={`rounded-md border p-2 ${b.fixbar ? 'border-border bg-background/40' : 'border-border/50 bg-muted/10 opacity-90'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {b.fixbar
                    ? <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="accent-primary shrink-0" />
                    : <span className="w-3.5 shrink-0" />}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${GEWICHT_BADGE[b.gewicht] || GEWICHT_BADGE.INFO}`}>{b.gewicht}</span>
                  <span className="text-xs font-medium text-foreground">{b.titel}</span>
                  {b.standardAus && <span title="Sicherheits-Herabstufung — nicht vorausgewählt" className="text-[9px] px-1 py-0.5 rounded border border-red-500/40 text-red-300 flex items-center gap-0.5"><ShieldAlert size={9} />Sicherheit</span>}
                  {(b.ist || b.soll) && <span className="text-[11px] text-muted-foreground font-mono">{b.ist || '—'} → <span className="text-emerald-400">{b.soll || '—'}</span></span>}
                  <button onClick={() => toggleInfo(b.id)} title="Was ist das Problem?" className="p-0.5 rounded text-blue-400 hover:bg-blue-500/10"><Info size={13} /></button>
                  <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{KAT_LABEL[b.kategorie]}</span>
                  {applied && <span className={`text-[10px] ${applied.ok ? 'text-emerald-400' : 'text-red-400'}`}>{applied.ok ? '✓ gesetzt' : '✗ ' + (applied.error || '')}</span>}
                </div>
                {infoOpen.has(b.id) && (
                  <div className="mt-1.5 ml-6 text-[11px] text-muted-foreground space-y-1 border-l-2 border-blue-500/30 pl-2">
                    {(b.erklaerung?.wirkung || b.wirkung) && <p><span className="text-foreground font-medium">Problem/Wirkung:</span> {b.erklaerung?.wirkung || b.wirkung}</p>}
                    {b.erklaerung && (
                      <div>
                        <button onClick={() => toggleAusf(b.id)} className="flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200 font-medium">
                          <BookOpen size={11} />Ausführliche Erklärung<ChevronDown size={11} className={`transition-transform ${ausfOpen.has(b.id) ? 'rotate-180' : ''}`} />
                        </button>
                        {ausfOpen.has(b.id) && (
                          <div className="mt-1 space-y-1 rounded-md bg-muted/30 border border-border p-2 text-[11px] leading-relaxed">
                            <p><span className="text-foreground font-medium">Was sich ändert:</span> {b.erklaerung.aenderung}</p>
                            <p><span className="text-emerald-400 font-medium">Vorteil:</span> {b.erklaerung.vorteil}</p>
                            <p><span className="text-amber-300 font-medium">Nachteil:</span> {b.erklaerung.nachteil}</p>
                            <p><span className="text-red-300 font-medium">Wann NICHT ändern:</span> {b.erklaerung.wannNicht}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {b.weg && <p><span className="text-foreground font-medium">Weg:</span> {b.weg}</p>}
                    {b.eigentuemer && <p><span className="text-foreground font-medium">Verwaltet von:</span> {b.eigentuemer}</p>}
                    {b.fundort && <p className="font-mono text-[10px]"><span className="not-italic">Fundort:</span> {b.fundort}</p>}
                    {b.hinweis && <p className="text-amber-300">⚠ {b.hinweis}</p>}
                    {b.kategorie === 'smb' && <p className="text-blue-300">→ Wird per WinRM mit <span className="font-mono">Set-SmbClientConfiguration</span> gesetzt (Altwert gesichert, wiederherstellbar).</p>}
                    {b.kategorie === 'ticket-defender' && <p className="text-blue-300">→ Nicht lokal setzbar. „Defender-Ticket erzeugen" oben liefert den fertigen englischen Text.</p>}
                    {b.kategorie === 'sicherheit' && <p className="text-amber-300">→ Sicherheitsentscheidung (nicht automatisch ändern) — mit der IT-Sicherheit klären.</p>}
                    {b.messbar === 'freigabe' && (() => {
                      const mm = messungen.get(b.id)
                      return (
                        <div className="mt-1 space-y-1">
                          <button onClick={() => void messeFreigabeFuer(b)} disabled={mm === 'busy'} className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
                            {mm === 'busy' ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} />}{mm === 'busy' ? 'messe Freigabe …' : 'Freigabe jetzt messen'}
                          </button>
                          {mm && mm !== 'busy' && (mm.ok
                            ? <div className="rounded bg-muted/30 border border-border p-2 text-[11px] text-foreground font-mono">
                                {mm.unc}<br />
                                Server-Latenz: {mm.latenzMs ?? '—'} ms  ·  Auflistung: {mm.listeMs ?? '—'} ms ({mm.eintraege ?? '—'} Einträge){mm.durchsatzMBs != null ? `  ·  Durchsatz: ${mm.durchsatzMBs} MB/s` : ''}
                                <div className="mt-1 text-[10px] text-muted-foreground font-sans">Richtwerte: Auflistung &lt; 300 ms, Durchsatz &gt; 30 MB/s (Gigabit).</div>
                              </div>
                            : <p className="text-amber-300">Messung aus der Systemsitzung nicht möglich{mm.fehler ? `: ${mm.fehler}` : ''}. Bei Doppelhop im Anwenderkontext (am PC angemeldet) messen.</p>)}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Bestätigung vor dem Schreiben */}
      {confirmApply && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmApply(false)}>
          <div className="bg-card border border-amber-500/40 rounded-lg p-5 max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-amber-300 flex items-center gap-2"><ShieldAlert size={16} />Einstellungen auf {lauf.pc} setzen?</p>
            <p className="text-xs text-foreground leading-relaxed">
              {selCount} Einstellung(en) werden auf dem Ziel-PC geändert. Die Altwerte werden vorher gesichert und
              lassen sich jederzeit wiederherstellen. <span className="font-semibold">SOLIDWORKS muss am Ziel geschlossen sein</span> —
              sonst überschreibt es die Änderungen beim Beenden (der Vorgang bricht dann sicher ab).
            </p>
            <div className="flex items-center gap-2 justify-end pt-1">
              <button onClick={() => setConfirmApply(false)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">Abbrechen</button>
              <button onClick={apply} className="px-3 py-1.5 text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">Jetzt setzen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
