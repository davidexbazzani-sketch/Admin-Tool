import { useEffect, useState } from 'react'
import { Save, FolderOpen, Info, Mail, Send, Loader, CheckCircle, XCircle, Database, Eye, EyeOff } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore, useIsMasterAdmin } from '../store/authStore'
import { api } from '../electronAPI'
import type { AppSettings } from '../types'
import type { UserEmailConfig, AppConfig } from '../types/auth'
import Card from '../components/Card'
import { setKBPath, getKBPath } from '../utils/guruKnowledgeBase'

const EMAIL_CONFIG_PATH = (username: string) => `email_config/${username}.json`

const DEFAULT_EMAIL_CONFIG: UserEmailConfig = {
  email: '',
  smtp: 'smtp.office365.com',
  port: 587,
  useTls: true,
  notifyEmail: '',
  emailMethod: 'outlook',  // Default: Outlook COM (kein Passwort nötig, wie SKF Protokoll Generator)
}

function KBFileStatus({ basePath, kbPath }: { basePath: string; kbPath: string }) {
  const [files, setFiles] = useState<Array<{ name: string; found: boolean; important: boolean; description: string }>>([])
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [catFiles, setCatFiles] = useState<string[]>([])

  useEffect(() => {
    const required: Array<{ name: string; description: string; important: boolean }> = [
      { name: 'guru_brain.json', description: 'IT Guru Problemdatenbank', important: true },
      { name: 'guru_brain_starter.json', description: 'IT Guru Problemdatenbank (Starter)', important: false },
      { name: 'guru_requests.json', description: 'IT Guru Anforderungen', important: true },
      { name: 'guru_requests_starter.json', description: 'IT Guru Anforderungen (Starter)', important: false },
      { name: 'skill_descriptions.json', description: 'Remote Doc Skill-Beschreibungen', important: true },
      { name: 'wissensdatenbank_generated.json', description: 'Wissensdatenbank Artikel (generiert)', important: false },
      { name: 'event_explanations.json', description: 'Event-ID Erklärungen', important: true },
      { name: 'synonyms.json', description: 'Synonym-Wörterbuch', important: false },
      { name: 'typo_map.json', description: 'Tippfehler-Korrektur', important: false },
      { name: 'diagnostic_chains.json', description: 'Diagnose-Ketten', important: false },
      { name: 'playbooks.json', description: 'Automatische Reparatur-Playbooks', important: false },
      { name: 'correlations.json', description: 'Symptom-Korrelationen', important: false },
      { name: 'index.json', description: 'Kategorien-Index (IT Guru)', important: false },
    ]
    // Try multiple path combinations to find files
    const paths = [
      kbPath ? `${kbPath}` : null,
      'knowledge_base',
      '',
      kbPath ? `${kbPath}/knowledge_base` : null,
    ].filter(Boolean) as string[]

    Promise.all(required.map(async (r) => {
      for (const p of paths) {
        const fullPath = p ? `${p}/${r.name}` : r.name
        if (await api().netExists(fullPath)) return { ...r, found: true }
      }
      return { ...r, found: false }
    })).then(setFiles)

    // List actual files — try multiple dirs
    ;(async () => {
      for (const p of paths) {
        const files = await api().netListDir(p)
        const jsonFiles = files.filter(f => f.endsWith('.json'))
        if (jsonFiles.length > 0) { setAllFiles(jsonFiles); break }
      }
      // List categories subfolder
      for (const p of paths) {
        const catPath = p ? `${p}/categories` : 'categories'
        const cf = await api().netListDir(catPath)
        const jsonCats = cf.filter(f => f.endsWith('.json'))
        if (jsonCats.length > 0) { setCatFiles(jsonCats); break }
      }
    })()
  }, [basePath, kbPath])

  const importantOk = files.filter(f => f.important).every(f => f.found)
  const foundCount = files.filter(f => f.found).length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] mb-1">
        <span className={`w-2.5 h-2.5 rounded-full ${importantOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <span className={importantOk ? 'text-emerald-400' : 'text-amber-400'}>{foundCount}/{files.length} Dateien gefunden</span>
      </div>
      {files.filter(f => f.important).map(f => (
        <div key={f.name} className="flex items-center gap-2 text-[10px]">
          <span className={`w-2 h-2 rounded-full shrink-0 ${f.found ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="font-mono text-foreground">{f.name}</span>
          <span className="text-muted-foreground flex-1">— {f.description}</span>
          <span className={`text-[9px] font-medium ${f.found ? 'text-emerald-400' : 'text-red-400'}`}>{f.found ? '✓' : '✗ Fehlt!'}</span>
        </div>
      ))}
      <details className="text-[9px]">
        <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Weitere Dateien anzeigen ({files.filter(f => !f.important).length} optional)</summary>
        <div className="mt-1 space-y-0.5 pl-2">
          {files.filter(f => !f.important).map(f => (
            <div key={f.name} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.found ? 'bg-emerald-400/60' : 'bg-muted-foreground/30'}`} />
              <span className="font-mono text-muted-foreground">{f.name}</span>
              <span className="text-muted-foreground/50">— {f.description}</span>
            </div>
          ))}
        </div>
      </details>
      {allFiles.length > 0 && (
        <details className="text-[9px]">
          <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Dateien im Ordner anzeigen ({allFiles.length} Dateien)</summary>
          <div className="mt-1 pl-2 font-mono text-muted-foreground/70 space-y-0">
            {allFiles.map(f => <div key={f}>{f}</div>)}
          </div>
        </details>
      )}
      {/* Categories subfolder */}
      <div className="flex items-center gap-2 text-[10px] mt-1">
        <span className={`w-2 h-2 rounded-full shrink-0 ${catFiles.length > 0 ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />
        <span className="font-mono text-foreground">categories/</span>
        <span className="text-muted-foreground">— {catFiles.length > 0 ? `${catFiles.length} Kategorie-Dateien (IT Guru Probleme)` : 'Nicht gefunden'}</span>
      </div>
      {catFiles.length > 0 && (
        <details className="text-[9px]">
          <summary className="text-muted-foreground cursor-pointer hover:text-foreground pl-4">Kategorie-Dateien anzeigen ({catFiles.length})</summary>
          <div className="mt-1 pl-6 font-mono text-muted-foreground/70 space-y-0">
            {catFiles.map(f => <div key={f}>{f}</div>)}
          </div>
        </details>
      )}
      {/* Wissensdatenbank info */}
      <div className="mt-1 rounded-md bg-blue-500/5 border border-blue-500/20 p-2">
        <p className="text-[9px] text-muted-foreground leading-relaxed">
          <strong>Wissensdatenbank:</strong> Wird beim ersten Start automatisch generiert (~47 Artikel mit Schritt-für-Schritt-Anleitungen).
          Die generierten Daten werden in <span className="font-mono">wissensdatenbank_generated.json</span> gespeichert.
          <br/><strong>categories/</strong> Dateien werden vom IT Guru genutzt (730+ Problemlösungen).
        </p>
      </div>
    </div>
  )
}

// ── Menu visibility management (Master Admin) ─────────────────────────────────
const MENU_VISIBILITY_PATH = 'settings/menu_visibility.json'
const CONFIGURABLE_MENUS: { id: string; label: string; group: string }[] = [
  { id: 'location-overview', label: 'Standort-Übersicht', group: 'Start' },
  { id: 'query-menu', label: 'Abfrage-Menü', group: 'Werkzeuge' },
  { id: 'remote-doc', label: 'Remote Doc', group: 'Werkzeuge' },
  { id: 'it-guru', label: 'IT Guru', group: 'Werkzeuge' },
  { id: 'pc-diagnosis', label: 'PC-Diagnose', group: 'Werkzeuge' },
  { id: 'scheduled-tasks', label: 'Geplante Aufgaben', group: 'Automation' },
  { id: 'dashboards', label: 'Dashboards', group: 'Automation' },
  { id: 'network-radar', label: 'Netzwerk-Radar', group: 'Automation' },
  { id: 'pc-migration', label: 'PC-Migration', group: 'Automation' },
  { id: 'software-inventory', label: 'Software-Inventar', group: 'Automation' },
  { id: 'user-info', label: 'Benutzer Info', group: 'Info & Hilfe' },
  { id: 'xelion', label: 'Diensthandy & Xelion', group: 'Info & Hilfe' },
  { id: 'trickbox', label: 'Trickbox', group: 'Info & Hilfe' },
  { id: 'knowledge-base', label: 'Wissensdatenbank', group: 'Wissen' },
  { id: 'results', label: 'Ergebnisse', group: 'Wissen' },
]

type MenuState = 'visible' | 'hidden' | 'master-only'

function MenuVisibilityCard() {
  const hiddenMenuIds = useAppStore(s => s.hiddenMenuIds)
  const setHiddenMenuIds = useAppStore(s => s.setHiddenMenuIds)
  const masterOnlyIds = useAppStore(s => s.masterOnlyIds)
  const setMasterOnlyIds = useAppStore(s => s.setMasterOnlyIds)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const getState = (id: string): MenuState => {
    if (!hiddenMenuIds.has(id)) return 'visible'
    if (masterOnlyIds.has(id)) return 'master-only'
    return 'hidden'
  }

  const cycle = (id: string) => {
    const current = getState(id)
    const nextHidden = new Set(hiddenMenuIds)
    const nextMaster = new Set(masterOnlyIds)
    if (current === 'visible') {
      // visible → master-only
      nextHidden.add(id)
      nextMaster.add(id)
    } else if (current === 'master-only') {
      // master-only → hidden
      nextMaster.delete(id)
    } else {
      // hidden → visible
      nextHidden.delete(id)
      nextMaster.delete(id)
    }
    setHiddenMenuIds(nextHidden)
    setMasterOnlyIds(nextMaster)
  }

  const save = async () => {
    setSaving(true)
    try {
      await api().netWriteJson(MENU_VISIBILITY_PATH, { hidden: [...hiddenMenuIds], masterOnly: [...masterOnlyIds] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* offline */ }
    setSaving(false)
  }

  const groups = [...new Set(CONFIGURABLE_MENUS.map(m => m.group))]
  const countVisible = CONFIGURABLE_MENUS.filter(m => getState(m.id) === 'visible').length
  const countMasterOnly = CONFIGURABLE_MENUS.filter(m => getState(m.id) === 'master-only').length
  const countHidden = CONFIGURABLE_MENUS.filter(m => getState(m.id) === 'hidden').length

  return (
    <Card title="Menüpunkte ein-/ausblenden (Master Admin)" icon={<Eye size={15} />} subtitle="Klicken Sie auf einen Eintrag um den Status zu wechseln. Startbildschirm und Einstellungen sind immer sichtbar.">
      <div className="space-y-4">
        {/* Legend */}
        <div className="flex gap-4 text-[9px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Für alle sichtbar</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Nur für mich sichtbar</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Für alle ausgeblendet</span>
        </div>

        {groups.map(group => (
          <div key={group}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group}</p>
            <div className="space-y-1">
              {CONFIGURABLE_MENUS.filter(m => m.group === group).map(item => {
                const state = getState(item.id)
                const bg = state === 'visible' ? 'hover:bg-accent/30' : state === 'master-only' ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'bg-red-500/5 hover:bg-red-500/10'
                const dotColor = state === 'visible' ? 'bg-emerald-400' : state === 'master-only' ? 'bg-amber-400' : 'bg-red-400'
                const textColor = state === 'visible' ? 'text-foreground' : state === 'master-only' ? 'text-amber-300' : 'text-muted-foreground line-through'
                const badgeText = state === 'visible' ? 'Alle' : state === 'master-only' ? 'Nur ich' : 'Aus'
                const badgeColor = state === 'visible' ? 'text-emerald-400' : state === 'master-only' ? 'text-amber-400' : 'text-red-400'
                return (
                  <button key={item.id} onClick={() => cycle(item.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors text-left ${bg}`}>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
                    <span className={`text-xs flex-1 ${textColor}`}>{item.label}</span>
                    <span className={`text-[9px] font-medium w-12 text-right ${badgeColor}`}>{badgeText}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
            Speichern
          </button>
          {saved && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> Gespeichert</span>}
          <p className="text-[9px] text-muted-foreground ml-auto">
            <span className="text-emerald-400">{countVisible} alle</span>
            {' · '}<span className="text-amber-400">{countMasterOnly} nur ich</span>
            {' · '}<span className="text-red-400">{countHidden} aus</span>
          </p>
        </div>
      </div>
    </Card>
  )
}

export default function Settings() {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const session = useAuthStore(s => s.session)
  const username = session?.user.username ?? ''
  const isMaster = useIsMasterAdmin()

  const [local, setLocal] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)
  const [version, setVersion] = useState('')

  // Master Admin: configurable paths
  const [kbPath, setKbPathLocal] = useState(getKBPath())
  const [netBasePath, setNetBasePath] = useState('')
  const [pathsSaved, setPathsSaved] = useState(false)

  // Local mode toggle
  const [localModeOn, setLocalModeOn] = useState(() => {
    try { return require('../utils/remoteCommands').getLocalMode() } catch { return false }
  })

  // Per-user email config (stored on network)
  const [emailCfg, setEmailCfg] = useState<UserEmailConfig>(DEFAULT_EMAIL_CONFIG)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  useEffect(() => {
    api().getAppVersion().then(setVersion).catch(() => setVersion('—'))
    api().getSettings().then((s) => {
      const merged = { ...settings, ...s } as AppSettings
      setSettings(merged)
      setLocal(merged)
    }).catch(() => {})

    // Load network base path + KB path
    api().netGetBasePath().then(p => setNetBasePath(p)).catch(() => {})
    api().getAppConfig().then((cfg: AppConfig) => {
      if (cfg?.knowledgeBasePath) { setKbPathLocal(cfg.knowledgeBasePath); setKBPath(cfg.knowledgeBasePath) }
    }).catch(() => {})

    // Load per-user email config from network
    if (username) {
      api().netReadJson<UserEmailConfig>(EMAIL_CONFIG_PATH(username))
        .then(cfg => { if (cfg) setEmailCfg({ ...DEFAULT_EMAIL_CONFIG, ...cfg }) })
        .catch(() => {})
    }
  }, [username])

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setLocal((l) => ({ ...l, [key]: value }))
  }

  function updateEmail<K extends keyof UserEmailConfig>(key: K, value: UserEmailConfig[K]) {
    setEmailCfg(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    for (const [key, value] of Object.entries(local)) {
      await api().setSetting(key, value)
    }
    setSettings(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveEmailConfig() {
    if (!username) return
    setEmailSaving(true)
    try {
      await api().netWriteJson(EMAIL_CONFIG_PATH(username), emailCfg)
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 2000)
    } finally {
      setEmailSaving(false)
    }
  }

  async function sendTestEmail() {
    if (!emailCfg.email || !emailCfg.smtp) {
      setTestError('Bitte E-Mail-Adresse und SMTP-Server ausfüllen.')
      setTestState('error')
      return
    }
    setTestState('sending')
    setTestError('')
    try {
      const res = await api().sendEmailRaw({
        to: emailCfg.email,
        subject: 'IT Admin Tool – Test-E-Mail',
        body: `Diese Test-E-Mail wurde vom IT Admin Tool gesendet.\n\nKonfiguration:\nSMTP: ${emailCfg.smtp}:${emailCfg.port}\nAbsender: ${emailCfg.email}\nMethode: ${emailCfg.emailMethod ?? 'nodemailer'}`,
        smtp: emailCfg.smtp,
        port: emailCfg.port,
        useTls: emailCfg.useTls,
        from: emailCfg.email,
        user: emailCfg.smtpUser || emailCfg.email,
        pass: emailCfg.smtpPass || '',
        method: emailCfg.emailMethod,
      })
      if (res.success) {
        setTestState('ok')
        setTimeout(() => setTestState('idle'), 3000)
      } else {
        setTestError(res.error ?? 'Unbekannter Fehler')
        setTestState('error')
      }
    } catch (e) {
      setTestError(String(e))
      setTestState('error')
    }
  }

  async function pickExportPath() {
    const dir = await api().selectDirectory()
    if (dir) update('exportPath', dir)
  }

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">⚙️ Einstellungen</h1>
          <p className="text-sm text-muted-foreground mt-1">App-Konfiguration und Verbindungseinstellungen</p>
        </div>
        <button
          onClick={save}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Save size={14} />
          {saved ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Per-user Email Config */}
        <Card title="E-Mail Konfiguration" icon={<Mail size={15} />} subtitle="Persönlich · gespeichert auf Netzlaufwerk">
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded-md px-3 py-2">
              Authentifizierung ohne Passwort – der SMTP-Server muss als internes Relay konfiguriert sein (Standard bei Office 365 / Exchange Online mit IP-Whitelist).
            </p>
            {[
              { label: 'Absender-E-Mail-Adresse', key: 'email' as const, placeholder: 'name@firma.de', type: 'email' },
              { label: 'SMTP-Server', key: 'smtp' as const, placeholder: 'smtp.office365.com', type: 'text' },
              { label: 'SMTP-Port', key: 'port' as const, placeholder: '587', type: 'number' },
              { label: 'Benachrichtigungs-E-Mail (Absturz, Reboot)', key: 'notifyEmail' as const, placeholder: 'benachrichtigung@firma.de', type: 'email' },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                <input
                  type={type}
                  value={String(emailCfg[key])}
                  placeholder={placeholder}
                  onChange={(e) => updateEmail(key, (type === 'number' ? Number(e.target.value) : e.target.value) as UserEmailConfig[typeof key])}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => updateEmail('useTls', !emailCfg.useTls)}
                className={`relative w-9 h-5 rounded-full transition-colors ${emailCfg.useTls ? 'bg-primary' : 'bg-border'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${emailCfg.useTls ? 'translate-x-4' : ''}`} />
              </button>
              <span className="text-xs text-muted-foreground">STARTTLS (empfohlen für Port 587)</span>
            </div>
            {/* SMTP Auth (required for Office 365) */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">SMTP Benutzer (Office 365: E-Mail)</label>
                <input
                  value={emailCfg.smtpUser ?? ''}
                  placeholder={emailCfg.email || 'user@firma.de'}
                  onChange={e => updateEmail('smtpUser', e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">SMTP Passwort / App-Passwort</label>
                <input
                  type="password"
                  value={emailCfg.smtpPass ?? ''}
                  placeholder="••••••••"
                  onChange={e => updateEmail('smtpPass', e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground">Office 365 erfordert Authentifizierung. Nutzen Sie ein App-Passwort wenn MFA aktiv ist.</p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Versandmethode</label>
              <select
                value={emailCfg.emailMethod ?? 'outlook'}
                onChange={e => updateEmail('emailMethod', e.target.value as 'outlook' | 'nodemailer' | 'powershell')}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary"
              >
                <option value="outlook">Outlook (empfohlen) — kein Passwort nötig</option>
                <option value="powershell">PowerShell SMTP (Windows-Auth)</option>
                <option value="nodemailer">SMTP mit Anmeldedaten (manuell)</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {(emailCfg.emailMethod ?? 'outlook') === 'outlook'
                  ? '✅ Nutzt Ihr eingeloggtes Outlook. Kein Passwort erforderlich. Funktioniert wie im SKF Protokoll Generator.'
                  : (emailCfg.emailMethod) === 'powershell'
                  ? 'Nutzt Windows-Anmeldedaten (Kerberos/NTLM). Kein Passwort erforderlich.'
                  : 'Erfordert SMTP-Server und ggf. Anmeldedaten.'}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={saveEmailConfig}
                disabled={emailSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {emailSaving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
                {emailSaved ? 'Gespeichert ✓' : 'Speichern'}
              </button>
              <button
                onClick={sendTestEmail}
                disabled={testState === 'sending'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50"
              >
                {testState === 'sending'
                  ? <Loader size={11} className="animate-spin" />
                  : testState === 'ok'
                  ? <CheckCircle size={11} className="text-emerald-400" />
                  : testState === 'error'
                  ? <XCircle size={11} className="text-red-400" />
                  : <Send size={11} />}
                Test-Mail senden
              </button>
              {testState === 'ok' && <span className="text-xs text-emerald-400">Mail gesendet!</span>}
              {testState === 'error' && <span className="text-xs text-red-400 truncate max-w-[200px]" title={testError}>{testError}</span>}
            </div>
          </div>
        </Card>

        {/* AD / LDAP */}
        <Card title="Active Directory / LDAP" subtitle="Domain-Verbindungseinstellungen">
          <div className="space-y-3">
            {[
              { label: 'AD-Domain', key: 'adDomain', placeholder: 'firma.local' },
              { label: 'Domain Controller / LDAP-Server', key: 'adServer', placeholder: 'dc01.firma.local' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                <input
                  type="text"
                  value={String(local[key as keyof AppSettings])}
                  placeholder={placeholder}
                  onChange={(e) => update(key as keyof AppSettings, e.target.value as AppSettings[keyof AppSettings])}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Export */}
        <Card title="Export-Einstellungen" subtitle="Standard-Speicherpfad für Berichte">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Standard-Exportpfad</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={local.exportPath}
                onChange={(e) => update('exportPath', e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                placeholder="C:\\Users\\..."
              />
              <button
                onClick={pickExportPath}
                className="w-10 h-10 flex items-center justify-center rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <FolderOpen size={15} />
              </button>
            </div>
          </div>
        </Card>

        {/* Theme */}
        <Card title="Darstellung">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Theme</label>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => update('theme', t)}
                  className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                    local.theme === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {t === 'dark' ? '🌙 Dunkel' : '☀️ Hell'}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Pfade (Master Admin / Admin) ── */}
      {(isMaster || true) && (
        <Card title="Pfad-Konfiguration" icon={<Database size={15} />} subtitle="Hier werden die Ordner eingestellt in denen das Tool seine Daten speichert und liest">
          <div className="space-y-4">

            {/* ── 1. Netzwerk-Basispfad ── */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <label className="block text-xs font-medium text-foreground">Netzwerk-Basispfad (Hauptordner)</label>
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                Der Hauptordner auf dem Netzlaufwerk in dem ALLE Daten des IT Admin Tools liegen:
                Benutzerverwaltung, Einstellungen, Inventar, Favoriten, Bug-Meldungen, Dashboards etc.
              </p>
              <div className="flex gap-2">
                <input value={netBasePath} onChange={e => setNetBasePath(e.target.value)}
                  placeholder="\\\\server\\freigabe\\Tool IT"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:border-primary" />
                <button onClick={async () => {
                  const path = await api().selectDirectory()
                  if (path) setNetBasePath(path)
                }} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground flex items-center gap-1" title="Ordner im Explorer auswählen">
                  <FolderOpen size={12} /> Durchsuchen
                </button>
              </div>
            </div>

            {/* ── 2. Knowledge Base Pfad ── */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <label className="block text-xs font-medium text-foreground">Knowledge Base Pfad</label>
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                Unterordner (relativ zum Basispfad) in dem die Wissensdatenbanken liegen. Hier müssen folgende Dateien abgelegt sein:
              </p>
              <div className="rounded-md bg-muted/10 p-2 text-[9px] font-mono text-muted-foreground space-y-0.5">
                <div><strong className="text-foreground">guru_brain.json</strong> — Problemdatenbank für den IT Guru (800+ IT-Probleme)</div>
                <div><strong className="text-foreground">guru_requests.json</strong> — Anforderungsdatenbank für den IT Guru (760+ Anforderungen)</div>
                <div><strong className="text-foreground">skill_descriptions.json</strong> — Beschreibungen für alle Remote Doc Skills (311 Skills)</div>
                <div><strong className="text-foreground">wissensdatenbank.json</strong> — Artikel/Anleitungen für die Wissensdatenbank-Seite</div>
                <div><strong className="text-foreground">event_explanations.json</strong> — Erklärungen für Windows Event-IDs</div>
                <div className="text-muted-foreground/50 pt-1">Weitere: synonyms.json, typo_map.json, correlations.json, diagnostic_chains.json, playbooks.json</div>
              </div>
              <div className="flex gap-2">
                <input value={kbPath} onChange={e => setKbPathLocal(e.target.value)}
                  placeholder="knowledge_base"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:border-primary" />
                <button onClick={async () => {
                  const path = await api().selectDirectory()
                  if (path) {
                    // Try to make it relative to basePath
                    if (path.toLowerCase().startsWith(netBasePath.toLowerCase())) {
                      setKbPathLocal(path.slice(netBasePath.length).replace(/^[\\/]+/, ''))
                    } else {
                      setKbPathLocal(path)
                    }
                  }
                }} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground flex items-center gap-1" title="Ordner im Explorer auswählen">
                  <FolderOpen size={12} /> Durchsuchen
                </button>
              </div>
            </div>

            {/* Speichern-Button */}
            <div className="flex items-center gap-2">
              <button onClick={async () => {
                await api().netSetBasePath(netBasePath)
                setKBPath(kbPath)
                await api().saveAppConfig({ knowledgeBasePath: kbPath } as Record<string, unknown>)
                setPathsSaved(true); setTimeout(() => setPathsSaved(false), 2000)
              }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                <Save size={12} /> Pfade speichern
              </button>
              {pathsSaved && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> Gespeichert</span>}
            </div>

            {/* KB-Dateien Status */}
            <div className="pt-3 border-t border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Status der Knowledge Base Dateien</p>
              <KBFileStatus basePath={netBasePath} kbPath={kbPath} />
            </div>
          </div>
        </Card>
      )}

      {/* ── Remote-Verbindung Einstellungen ── */}
      <Card title="Remote-Verbindung" icon={<Info size={15} />} subtitle="WinRM, Lokaler Modus und Fallback">
        <div className="space-y-3">
          {/* Lokaler Modus Toggle */}
          <div className={`rounded-lg border p-3 space-y-2 ${localModeOn ? 'border-amber-500/50 bg-amber-500/10' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const newVal = !localModeOn
                  setLocalModeOn(newVal)
                  try { require('../utils/remoteCommands').setLocalMode(newVal) } catch { /* ignore */ }
                }}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${localModeOn ? 'bg-amber-500' : 'bg-border'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${localModeOn ? 'translate-x-5' : ''}`} />
              </button>
              <div>
                <label className="text-xs font-medium text-foreground">Lokaler Modus (Testmodus)</label>
                <p className="text-[9px] text-muted-foreground">Alle Befehle werden auf DEINEM PC ausgeführt statt remote. Perfekt zum Testen außerhalb des Firmennetzwerks.</p>
              </div>
            </div>
            {localModeOn && (
              <div className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                LOKALER MODUS AKTIV — Befehle laufen auf diesem PC
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" defaultChecked className="w-3.5 h-3.5 accent-primary" id="auto-winrm" />
            <label htmlFor="auto-winrm" className="text-xs text-foreground">WinRM automatisch aktivieren wenn nicht verfügbar</label>
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <label className="block text-xs font-medium text-foreground">PsExec-Ordner (PsExec64.exe wird bevorzugt)</label>
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              PsExec ist ein Microsoft Sysinternals Tool für die Remote-Verwaltung.
              Es wird bei der WinRM-Aktivierung und als Fallback-Methode verwendet.
              Das Tool sucht automatisch nach PsExec64.exe (bevorzugt) oder PsExec.exe.
            </p>
            <div className="flex gap-2">
              <input
                value={'\\\\w3172\\skf marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT\\tools'}
                readOnly
                className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-border bg-muted/20 text-foreground font-mono focus:outline-none"
              />
              <button
                onClick={async () => {
                  try {
                    const res = await api().runPowerShell([
                      `$toolsPath = '${netBasePath || '\\\\w3172\\skf marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT'}\\tools'`,
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
                    if (res.stdout?.includes('OK')) {
                      alert('PsExec.exe erfolgreich heruntergeladen und abgelegt!')
                    } else {
                      alert('Fehler: ' + (res.stderr || res.stdout || 'Unbekannt'))
                    }
                  } catch (err) {
                    alert('Download fehlgeschlagen: ' + String(err))
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground whitespace-nowrap"
              >
                ⬇ PsExec herunterladen
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              PsExec64.exe wird bevorzugt (64-bit). Falls nicht vorhanden, wird PsExec.exe (32-bit) als Fallback genutzt.
              Klicken Sie auf &quot;PsExec herunterladen&quot; um beide Versionen automatisch abzulegen.
            </p>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Verbindungs-Timeout</label>
            <select defaultValue="30" className="px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary">
              <option value="15">15 Sekunden</option>
              <option value="30">30 Sekunden</option>
              <option value="45">45 Sekunden</option>
              <option value="60">60 Sekunden</option>
            </select>
          </div>
        </div>
      </Card>

      {/* ── Benutzer-Suche (Master Admin) ── */}
      {isMaster && (
        <Card title="Benutzer-Suche (Master Admin)" icon={<Info size={15} />} subtitle="AD-Suchbereich für Benutzer Info einschränken">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input type="checkbox" defaultChecked className="w-3.5 h-3.5 accent-primary" />
                Hamburg (Büro: "Hamburg - Hermann Blohm Strasse")
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 accent-primary" />
                Alle Standorte
              </label>
            </div>
            <p className="text-[9px] text-muted-foreground">
              Eingeschränkte Suche beschleunigt die AD-Abfrage erheblich. Bei "Beide": Hamburg wird zuerst durchsucht, bei keinem Ergebnis dann alle Standorte.
            </p>
          </div>
        </Card>
      )}

      {/* ── Menu Visibility (Master Admin only) ── */}
      {isMaster && <MenuVisibilityCard />}

      <Card title="Über das Programm" icon={<Info size={15} />}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {[
            ['Version', version || '1.0.0'],
            ['Produkt', 'IT Admin Tool'],
            ['Framework', 'Electron + React + TypeScript'],
            ['Styling', 'Tailwind CSS'],
            ['Plattform', 'Windows'],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">{label}:</span>
              <span className="text-foreground font-medium">{value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
