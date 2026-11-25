// ── Netzwerk & Pfade (Einstellungen „Für alle“) ──────────────────────────────
// Zusammengeführt aus den früheren zwei Karten „Pfad-Konfiguration“ und dem PsExec-Teil von
// „Remote-Verbindung“ (die übrigen Schalter dort waren ohne Wirkung und sind entfallen).
import { useEffect, useState } from 'react'
import { FolderOpen, Save, CheckCircle, Loader, Download, XCircle } from 'lucide-react'
import { api } from '../../electronAPI'
import { useAuthStore } from '../../store/authStore'
import { pathService } from '../../services/pathService'
import { setKBPath, getKBPath } from '../../utils/guruKnowledgeBase'
import type { AppConfig } from '../../types/auth'
import { Abschnitt, Hinweis, eingabe, knopf, knopfLeise } from '../teile'

function KBFileStatus({ basePath, kbPath }: { basePath: string; kbPath: string }) {
  const [files, setFiles] = useState<Array<{ name: string; found: boolean; important: boolean; description: string }>>([])
  const [catFiles, setCatFiles] = useState<string[]>([])

  useEffect(() => {
    const required: Array<{ name: string; description: string; important: boolean }> = [
      { name: 'guru_brain.json', description: 'IT Guru Problemdatenbank', important: true },
      { name: 'guru_requests.json', description: 'IT Guru Anforderungen', important: true },
      { name: 'skill_descriptions.json', description: 'Remote Doc Skill-Beschreibungen', important: true },
      { name: 'event_explanations.json', description: 'Event-ID-Erklärungen', important: true },
      { name: 'guru_brain_starter.json', description: 'IT Guru Problemdatenbank (Starter)', important: false },
      { name: 'guru_requests_starter.json', description: 'IT Guru Anforderungen (Starter)', important: false },
      { name: 'wissensdatenbank_generated.json', description: 'Wissensdatenbank-Artikel (generiert)', important: false },
      { name: 'synonyms.json', description: 'Synonym-Wörterbuch', important: false },
      { name: 'typo_map.json', description: 'Tippfehler-Korrektur', important: false },
      { name: 'diagnostic_chains.json', description: 'Diagnose-Ketten', important: false },
      { name: 'playbooks.json', description: 'Reparatur-Playbooks', important: false },
      { name: 'correlations.json', description: 'Symptom-Korrelationen', important: false },
      { name: 'index.json', description: 'Kategorien-Index (IT Guru)', important: false },
    ]
    const paths = [kbPath || null, 'knowledge_base', '', kbPath ? `${kbPath}/knowledge_base` : null].filter((p): p is string => p !== null)
    let weg = false
    void Promise.all(required.map(async r => {
      for (const p of paths) if (await api().netExists(p ? `${p}/${r.name}` : r.name)) return { ...r, found: true }
      return { ...r, found: false }
    })).then(f => { if (!weg) setFiles(f) })
    void (async () => {
      for (const p of paths) {
        const cf = (await api().netListDir(p ? `${p}/categories` : 'categories').catch(() => [])).filter(f => f.endsWith('.json'))
        if (cf.length) { if (!weg) setCatFiles(cf); break }
      }
    })()
    return () => { weg = true }
  }, [basePath, kbPath])

  const wichtigOk = files.filter(f => f.important).every(f => f.found)
  return (
    <div className="space-y-1.5 text-xs">
      <p className={wichtigOk ? 'es-ok' : 'es-warn'}>{files.filter(f => f.found).length}/{files.length} Dateien gefunden{files.length ? (wichtigOk ? ' – alle wichtigen sind da' : ' – es fehlen wichtige Dateien') : ''}</p>
      {files.filter(f => f.important).map(f => (
        <div key={f.name} className="flex items-center gap-2">
          {f.found ? <CheckCircle size={12} className="es-ok shrink-0" /> : <XCircle size={12} className="es-fehler shrink-0" />}
          <span className="font-mono text-foreground">{f.name}</span><span className="text-muted-foreground">– {f.description}</span>
        </div>
      ))}
      <details>
        <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Optionale Dateien ({files.filter(f => !f.important).length})</summary>
        <div className="mt-1 pl-2 space-y-0.5">{files.filter(f => !f.important).map(f => (
          <div key={f.name} className="text-muted-foreground"><span className="font-mono">{f.found ? '✓' : '–'} {f.name}</span> · {f.description}</div>))}</div>
      </details>
      <p className="text-muted-foreground"><span className="font-mono">categories/</span> – {catFiles.length ? `${catFiles.length} Kategorie-Dateien (IT Guru)` : 'nicht gefunden'}</p>
    </div>
  )
}

function ZentralePfade() {
  const [cfg, setCfg] = useState(pathService.getConfig())
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState<Record<string, 'ok' | 'fail' | 'loading'>>({})

  useEffect(() => {
    void api().loadPathsConfig().then(res => {
      if (res.success && res.data) { const d = res.data as typeof cfg; setCfg(d); pathService.updateConfig(d) }
    }).catch(() => {})
  }, [])

  async function handleSave() {
    setError('')
    try {
      const toSave = { ...cfg, lastModified: new Date().toISOString(), modifiedBy: useAuthStore.getState().session?.user.username || 'unknown' }
      const res = await api().savePathsConfig(toSave)
      if (res.success) { pathService.updateConfig(toSave); setCfg(toSave); setSaved(true); setTimeout(() => setSaved(false), 3000) }
      else setError(res.error || 'Speichern fehlgeschlagen')
    } catch (e) { setError(String(e)) }
  }
  async function testPath(label: string, path: string) {
    setTesting(t => ({ ...t, [label]: 'loading' }))
    try {
      const res = await api().runPowerShell(`if (Test-Path '${path.replace(/'/g, "''")}') { Write-Output 'OK' } else { Write-Output 'FAIL' }`, 5000)
      setTesting(t => ({ ...t, [label]: res.stdout.trim() === 'OK' ? 'ok' : 'fail' }))
    } catch { setTesting(t => ({ ...t, [label]: 'fail' })) }
  }
  const zeile = 'px-2 py-1 rounded bg-background border border-border text-xs font-mono text-foreground'

  return (
    <div className="space-y-3 text-xs">
      <label className="flex items-center gap-3">
        <span className="text-muted-foreground">Bevorzugter Zugriff:</span>
        <select value={cfg.preferredAccessMode} onChange={e => setCfg(c => ({ ...c, preferredAccessMode: e.target.value as 'unc' | 'drive' }))} className={zeile}>
          <option value="unc">UNC-Pfade (\\server\…)</option>
          <option value="drive">Laufwerksbuchstaben (I:\, G:\)</option>
        </select>
      </label>
      <details open>
        <summary className="text-sm font-semibold text-foreground cursor-pointer">Basis-Pfade</summary>
        <div className="mt-2 space-y-2 pl-2">
          {(['toolRoot', 'publicRoot', 'marineRoot'] as const).map(key => (
            <div key={key} className="grid grid-cols-[110px_1fr_1fr_56px] gap-2 items-center">
              <span className="text-muted-foreground font-medium">{key}</span>
              <input value={cfg.base[`${key}_unc`]} onChange={e => setCfg(c => ({ ...c, base: { ...c.base, [`${key}_unc`]: e.target.value } }))} placeholder="UNC" className={zeile} />
              <input value={cfg.base[`${key}_drive`]} onChange={e => setCfg(c => ({ ...c, base: { ...c.base, [`${key}_drive`]: e.target.value } }))} placeholder="Laufwerk" className={zeile} />
              <button onClick={() => void testPath(key, cfg.base[`${key}_unc`])} className="px-2 py-1 rounded border border-border text-[11px] text-muted-foreground hover:text-foreground">
                {testing[key] === 'loading' ? '…' : testing[key] === 'ok' ? <span className="es-ok">OK</span> : testing[key] === 'fail' ? <span className="es-fehler">Fehlt</span> : 'Test'}
              </button>
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary className="text-sm font-semibold text-foreground cursor-pointer">Tool-Unterordner</summary>
        <div className="mt-2 space-y-1 pl-2">
          {Object.entries(cfg.toolSubfolders).map(([key, val]) => (
            <div key={key} className="grid grid-cols-[140px_1fr] gap-2 items-center">
              <span className="text-muted-foreground font-medium">{key}</span>
              <input value={val} onChange={e => setCfg(c => ({ ...c, toolSubfolders: { ...c.toolSubfolders, [key]: e.target.value } }))} className={zeile} />
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary className="text-sm font-semibold text-foreground cursor-pointer">Software-Pfade (SolidWorks)</summary>
        <div className="mt-2 space-y-1 pl-2">
          {Object.entries(cfg.softwareInstall.solidworks).map(([key, val]) => (
            <div key={key} className="grid grid-cols-[200px_1fr] gap-2 items-center">
              <span className="text-muted-foreground font-medium text-[11px]">{key}</span>
              <input value={val} onChange={e => setCfg(c => ({ ...c, softwareInstall: { ...c.softwareInstall, solidworks: { ...c.softwareInstall.solidworks, [key]: e.target.value } } }))} className={zeile} />
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary className="text-sm font-semibold text-foreground cursor-pointer">Domains und Hostnamen</summary>
        <div className="mt-2 space-y-1 pl-2">
          {Object.entries(cfg.domains).map(([key, val]) => (
            <div key={key} className="grid grid-cols-[160px_1fr] gap-2 items-center">
              <span className="text-muted-foreground font-medium">{key}</span>
              <input value={val} onChange={e => setCfg(c => ({ ...c, domains: { ...c.domains, [key]: e.target.value } }))} className={zeile} />
            </div>
          ))}
        </div>
      </details>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button onClick={() => void handleSave()} className={knopf}>{saved ? <CheckCircle size={13} /> : <Save size={13} />}{saved ? 'Gespeichert' : 'Speichern'}</button>
        <button onClick={() => { pathService.resetToDefaults(); setCfg(pathService.getConfig()) }} className={knopfLeise}>Standardwerte</button>
        {error && <span className="es-fehler">{error}</span>}
        <span className="ml-auto text-[11px] text-muted-foreground">Zuletzt geändert: {cfg.lastModified ? new Date(cfg.lastModified).toLocaleString('de-DE') : 'nie'} von {cfg.modifiedBy || '–'}</span>
      </div>
    </div>
  )
}

export default function NetzwerkPfade() {
  const [basis, setBasis] = useState('')
  const [kb, setKb] = useState(getKBPath())
  const [gespeichert, setGespeichert] = useState(false)
  const [psexec, setPsexec] = useState<{ zustand: 'idle' | 'laeuft' | 'ok' | 'fehler'; text?: string }>({ zustand: 'idle' })

  useEffect(() => {
    void api().netGetBasePath().then(setBasis).catch(() => {})
    void api().getAppConfig().then((c: AppConfig) => { if (c?.knowledgeBasePath) { setKb(c.knowledgeBasePath); setKBPath(c.knowledgeBasePath) } }).catch(() => {})
  }, [])

  async function speichern() {
    await api().netSetBasePath(basis)
    setKBPath(kb)
    await api().saveAppConfig({ knowledgeBasePath: kb } as Record<string, unknown>)
    setGespeichert(true); setTimeout(() => setGespeichert(false), 2000)
  }

  async function psexecLaden() {
    setPsexec({ zustand: 'laeuft' })
    try {
      const res = await api().runPowerShell([
        `$toolsPath = '${(basis || pathService.getToolRoot()).replace(/'/g, "''")}\\tools'`,
        `if (-not (Test-Path $toolsPath)) { New-Item -Path $toolsPath -ItemType Directory -Force | Out-Null }`,
        `$zipPath = "$env:TEMP\\PSTools.zip"`,
        `$extractPath = "$env:TEMP\\PSTools"`,
        `Invoke-WebRequest -Uri 'https://download.sysinternals.com/files/PSTools.zip' -OutFile $zipPath -UseBasicParsing`,
        `Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force`,
        `Copy-Item "$extractPath\\PsExec.exe" "$toolsPath\\PsExec.exe" -Force`,
        `Copy-Item "$extractPath\\PsExec64.exe" "$toolsPath\\PsExec64.exe" -Force`,
        `Remove-Item $zipPath -Force -EA SilentlyContinue`,
        `Remove-Item $extractPath -Recurse -Force -EA SilentlyContinue`,
        `Write-Output "OK"`,
      ].join('; '), 60000)
      setPsexec(res.stdout?.includes('OK') ? { zustand: 'ok', text: 'PsExec liegt jetzt im Tools-Ordner.' } : { zustand: 'fehler', text: (res.stderr || res.stdout || 'Unbekannter Fehler').slice(0, 300) })
    } catch (e) { setPsexec({ zustand: 'fehler', text: String(e).slice(0, 300) }) }
  }

  return (
    <div className="space-y-4">
      <Abschnitt titel="Hauptordner auf dem Netzlaufwerk" untertitel="Hier liegen alle gemeinsamen Daten des Tools (Benutzer, Einstellungen, Inventar, Protokolle …). Diese Angabe gilt nur für DIESEN PC — jeder PC hat seinen eigenen Eintrag.">
        <div className="flex gap-2 max-w-3xl">
          <input value={basis} onChange={e => setBasis(e.target.value)} placeholder="\\server\freigabe\Tool IT" className={`${eingabe} font-mono text-xs`} data-basispfad />
          <button onClick={async () => { const p = await api().selectDirectory(); if (p) setBasis(p) }} className={knopfLeise}><FolderOpen size={13} />Durchsuchen</button>
        </div>
        <label className="block space-y-1 max-w-3xl">
          <span className="text-xs text-muted-foreground">Unterordner der Wissensdatenbank (relativ zum Hauptordner)</span>
          <div className="flex gap-2">
            <input value={kb} onChange={e => setKb(e.target.value)} placeholder="knowledge_base" className={`${eingabe} font-mono text-xs`} />
            <button onClick={async () => { const p = await api().selectDirectory(); if (p) setKb(p.toLowerCase().startsWith(basis.toLowerCase()) ? p.slice(basis.length).replace(/^[\\/]+/, '') : p) }} className={knopfLeise}><FolderOpen size={13} />Durchsuchen</button>
          </div>
        </label>
        <div className="flex items-center gap-2">
          <button onClick={() => void speichern()} className={knopf}>{gespeichert ? <CheckCircle size={13} /> : <Save size={13} />}{gespeichert ? 'Gespeichert' : 'Pfade speichern'}</button>
        </div>
        <div className="pt-3 border-t border-border">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Dateien der Wissensdatenbank</p>
          <KBFileStatus basePath={basis} kbPath={kb} />
        </div>
      </Abschnitt>

      <Abschnitt titel="Zentrale Pfade" untertitel="UNC- und Laufwerkspfade, Unterordner, Software-Pfade, Domains. Gilt für alle.">
        <Hinweis ton="warn">Änderungen wirken im ganzen Tool und bei allen Admins.</Hinweis>
        <ZentralePfade />
      </Abschnitt>

      <Abschnitt titel="PsExec" untertitel="Microsoft-Sysinternals-Werkzeug für die Fernverwaltung; das Tool nutzt es beim Einschalten von WinRM und als Ausweichweg. PsExec64.exe wird bevorzugt.">
        <div className="flex gap-2 max-w-3xl">
          <input readOnly value={pathService.getToolsDir()} className={`${eingabe} font-mono text-xs bg-muted/20`} />
          <button onClick={() => void psexecLaden()} disabled={psexec.zustand === 'laeuft'} className={knopfLeise}>{psexec.zustand === 'laeuft' ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}PsExec herunterladen</button>
        </div>
        {psexec.zustand === 'ok' && <Hinweis ton="ok">{psexec.text}</Hinweis>}
        {psexec.zustand === 'fehler' && <Hinweis ton="fehler">{psexec.text}</Hinweis>}
      </Abschnitt>
    </div>
  )
}
