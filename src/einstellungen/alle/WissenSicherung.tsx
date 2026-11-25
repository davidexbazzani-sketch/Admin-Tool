// ── Wissen & Sicherung (Einstellungen „Für alle“) ────────────────────────────
// Früher je mit eigener PIN 101818 — seit 19.11.2026 schützt das Passwort des Bereichs
// „Für alle“ (Nutzerentscheidung: Passwort ersetzt die PINs in diesem Bereich).
import { useState } from 'react'
import { Loader, Download, Upload, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { api } from '../../electronAPI'
import { useAuthStore } from '../../store/authStore'
import { buildKnowledgeSnapshot } from '../../services/knowledgeSnapshot'
import { pickAndReadMaster, analyzeMaster, runImport, type ImportAnalysis, type ImportProgress } from '../../services/masterImport'
import { protokolliere } from '../../services/aktivitaet'
import { Abschnitt, Hinweis, knopf, knopfLeise } from '../teile'

function Backup() {
  const [pseudo, setPseudo] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [ergebnis, setErgebnis] = useState<{ ok: boolean; path?: string; error?: string; count?: number } | null>(null)

  async function erzeugen() {
    setLaeuft(true); setErgebnis(null)
    try {
      const { md, stats } = await buildKnowledgeSnapshot({ pseudonymize: pseudo })
      const name = `Wissens-Snapshot_${new Date().toISOString().slice(0, 10)}${pseudo ? '_pseudonym' : ''}.md`
      const path = await api().saveFileDialog(name, [{ name: 'Markdown', extensions: ['md'] }])
      if (!path) return
      const bytes = new TextEncoder().encode(md)
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const r = await api().writeFile(path, btoa(bin))
      const count = stats.reduce((a, s) => a + (Number.isFinite(s.count) ? s.count : 0), 0)
      setErgebnis(r.success ? { ok: true, path, count } : { ok: false, error: r.error || 'Schreiben fehlgeschlagen.' })
      if (r.success) protokolliere({ art: 'manuell', quelle: 'Einstellungen', aktion: `Wissens-Snapshot exportiert${pseudo ? ' (pseudonymisiert)' : ''}`, ergebnis: `~${count} Datensätze` })
    } catch (e) {
      setErgebnis({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally { setLaeuft(false) }
  }

  return (
    <Abschnitt titel="Backup – Wissens-Snapshot" untertitel="Alle vom Tool gesammelten Informationen als eine Markdown-Datei: Mitarbeiter und AD, Geräte und Endgeräte, Telefonie, Drucker, Software, Netzwerk, Lizenzen, Dossiers.">
      <Hinweis ton="warn">Der Snapshot enthält <strong>echte personenbezogene Daten</strong>. Passwörter und Zugangsdaten werden nicht exportiert. Nicht unkontrolliert weitergeben.</Hinweis>
      <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer">
        <input type="checkbox" checked={pseudo} onChange={e => setPseudo(e.target.checked)} className="accent-primary" />
        Pseudonymisiert (Namen, IDs, Mails und Telefonnummern maskiert)
      </label>
      <div><button onClick={() => void erzeugen()} disabled={laeuft} className={knopf}>{laeuft ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}Snapshot erstellen und speichern</button></div>
      {ergebnis && (ergebnis.ok
        ? <Hinweis ton="ok">Gespeichert{typeof ergebnis.count === 'number' ? ` (~${ergebnis.count} Datensätze)` : ''}: <span className="font-mono break-all">{ergebnis.path}</span></Hinweis>
        : <Hinweis ton="fehler">{ergebnis.error}</Hinweis>)}
    </Abschnitt>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-lg font-bold tabular-nums text-foreground">{value.toLocaleString('de-DE')}</div>
      <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground/70 leading-tight mt-0.5">{sub}</div>}
    </div>
  )
}

function Import() {
  const by = useAuthStore(s => s.session?.user.displayName || s.session?.user.username) || 'unbekannt'
  const [busy, setBusy] = useState(false)
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [err, setErr] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<{ persons: number; devices: number; failed: number } | null>(null)
  const [showPeople, setShowPeople] = useState(false)
  const [showHosts, setShowHosts] = useState(false)

  async function waehlen() {
    setBusy(true); setErr(''); setAnalysis(null); setResult(null); setProgress(null)
    try {
      const picked = await pickAndReadMaster()
      if (!picked) return
      setAnalysis(await analyzeMaster(picked.md, picked.path.split(/[\\/]/).pop() || 'Master.md'))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function importieren() {
    if (!analysis) return
    const total = analysis.persons.length + analysis.devices.length
    if (!window.confirm(`${total} Notiz-Blöcke werden geschrieben (${analysis.persons.length} Nutzer, ${analysis.devices.length} Geräte).\n\nBestehende Import-Blöcke werden dabei aktualisiert. Fortfahren?`)) return
    setImporting(true); setResult(null); setProgress({ done: 0, total, phase: 'persons' })
    try {
      const r = await runImport(analysis, by, p => setProgress(p))
      setResult(r)
      protokolliere({ art: 'manuell', quelle: 'Einstellungen', aktion: 'Wissensdatenbank-Import', ergebnis: `${r.persons} Nutzer-, ${r.devices} Geräte-Notizen${r.failed ? `, ${r.failed} fehlgeschlagen` : ''}` })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setImporting(false); setProgress(null) }
  }

  return (
    <Abschnitt titel="Wissensdatenbank-Import" untertitel="Tickets und Rollen-Infos aus SKF_MARINE_MASTER.md als Notizen bei Personen und Geräten hinterlegen.">
      <Hinweis ton="warn">Schreibt eine gebündelte Notiz in die <strong>echten</strong> Personen- und Geräte-Dossiers. Nur sichere Namens- und Hostname-Treffer, nichts wird neu angelegt. Ein erneuter Import aktualisiert den Block. Mails werden nicht importiert.</Hinweis>
      <div><button onClick={() => void waehlen()} disabled={busy || importing} className={knopfLeise}>{busy ? <Loader size={13} className="animate-spin" /> : <FileText size={13} />}Datei wählen und analysieren</button></div>
      {err && <Hinweis ton="fehler">{err}</Hinweis>}
      {analysis && (
        <div className="space-y-2.5 rounded-lg border border-border bg-background/50 p-3">
          <div className="text-xs text-muted-foreground">Datei: <span className="font-mono text-foreground">{analysis.fileName}</span> · Stand {analysis.builtAt}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Tickets gesamt" value={analysis.totalTickets} sub={`${analysis.serviceNowCount} SNOW · ${analysis.fieldServiceCount} FS`} />
            <Stat label="Nutzer zugeordnet" value={analysis.persons.length} sub={`${analysis.unmatchedReporters.length} offen`} />
            <Stat label="Geräte zugeordnet" value={analysis.devices.length} sub={`${analysis.unresolvedHosts.length} Hostnamen offen`} />
            <Stat label="Rollen erkannt" value={analysis.rolesFound} sub="Mails: nicht importiert" />
          </div>
          {analysis.unmatchedReporters.length > 0 && (
            <div className="rounded-md border border-border">
              <button onClick={() => setShowPeople(v => !v)} className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                {showPeople ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Nicht zugeordnete Melder ({analysis.unmatchedReporters.length}) – bekommen keine Notiz
              </button>
              {showPeople && <div className="max-h-48 overflow-y-auto px-3 pb-2 text-[11px] font-mono text-muted-foreground grid grid-cols-1 sm:grid-cols-2 gap-x-4">{analysis.unmatchedReporters.map(u => <div key={u.name} className="truncate">{u.name} · {u.count}</div>)}</div>}
            </div>
          )}
          {analysis.unresolvedHosts.length > 0 && (
            <div className="rounded-md border border-border">
              <button onClick={() => setShowHosts(v => !v)} className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                {showHosts ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Nicht zugeordnete Hostnamen ({analysis.unresolvedHosts.length})
              </button>
              {showHosts && <div className="max-h-40 overflow-y-auto px-3 pb-2 text-[11px] font-mono text-muted-foreground grid grid-cols-2 sm:grid-cols-3 gap-x-4">{analysis.unresolvedHosts.map(u => <div key={u.host} className="truncate">{u.host} · {u.count}</div>)}</div>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => void importieren()} disabled={importing || (analysis.persons.length === 0 && analysis.devices.length === 0)} className={knopf}>
              {importing ? <Loader size={13} className="animate-spin" /> : <Upload size={13} />}Importieren – Notizen schreiben
            </button>
            {importing && progress && <span className="text-xs text-muted-foreground tabular-nums">{progress.done}/{progress.total} ({progress.phase === 'persons' ? 'Nutzer' : 'Geräte'}) …</span>}
          </div>
          {result && <Hinweis ton="ok">Fertig: {result.persons} Nutzer-Notizen · {result.devices} Geräte-Notizen{result.failed ? ` · ${result.failed} fehlgeschlagen` : ''}.</Hinweis>}
        </div>
      )}
    </Abschnitt>
  )
}

export default function WissenSicherung() {
  return <div className="space-y-4"><Import /><Backup /></div>
}
