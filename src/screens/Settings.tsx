import { useEffect, useState } from 'react'
import { Save, FolderOpen, Info, Mail, Send, Loader, CheckCircle, XCircle, Database } from 'lucide-react'
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
  const [files, setFiles] = useState<Array<{ name: string; found: boolean; size?: string }>>([])
  useEffect(() => {
    const fileNames = ['wissensdatenbank.json', 'guru_brain_starter.json', 'guru_brain.json', 'guru_requests_starter.json', 'guru_requests.json', 'skill_descriptions.json']
    Promise.all(fileNames.map(async (name) => {
      const path1 = `${kbPath}/${name}`
      const path2 = `knowledge_base/${name}`
      const path3 = name
      const e1 = await api().netExists(path1)
      const e2 = !e1 ? await api().netExists(path2) : false
      const e3 = !e1 && !e2 ? await api().netExists(path3) : false
      return { name, found: e1 || e2 || e3 }
    })).then(setFiles)
  }, [basePath, kbPath])

  return (
    <div className="space-y-1">
      {files.map(f => (
        <div key={f.name} className="flex items-center gap-2 text-[10px]">
          <span className={`w-2 h-2 rounded-full shrink-0 ${f.found ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="font-mono text-muted-foreground flex-1">{f.name}</span>
          <span className={`text-[9px] ${f.found ? 'text-emerald-400' : 'text-red-400'}`}>{f.found ? 'Gefunden' : 'Fehlt'}</span>
        </div>
      ))}
    </div>
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
        <Card title="Pfad-Konfiguration (Master Admin)" icon={<Database size={15} />} subtitle="Netzlaufwerk und Wissensdatenbank-Pfade">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Netzwerk-Basispfad</label>
              <input value={netBasePath} onChange={e => setNetBasePath(e.target.value)}
                placeholder="\\w3172\skf Marine\..."
                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Wissensdatenbank-Pfad (relativ zum Basispfad)</label>
              <input value={kbPath} onChange={e => setKbPathLocal(e.target.value)}
                placeholder="knowledge_base"
                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:border-primary" />
              <p className="text-[9px] text-muted-foreground mt-0.5">Pfad zu guru_brain.json, skill_descriptions.json, wissensdatenbank.json etc.</p>
            </div>
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
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Knowledge Base Dateien</p>
              <KBFileStatus basePath={netBasePath} kbPath={kbPath} />
            </div>
          </div>
        </Card>
      )}

      {/* ── Remote-Verbindung Einstellungen ── */}
      <Card title="Remote-Verbindung" icon={<Info size={15} />} subtitle="WinRM-Aktivierung und Fallback-Verhalten">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input type="checkbox" defaultChecked className="w-3.5 h-3.5 accent-primary" id="auto-winrm" />
            <label htmlFor="auto-winrm" className="text-xs text-foreground">WinRM automatisch aktivieren wenn nicht verfügbar</label>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Pfad zu PsExec.exe</label>
            <div className="flex gap-2">
              <input
                value={'\\\\w3172\\skf marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT\\tools\\PsExec.exe'}
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
              PsExec ist ein Microsoft Sysinternals Tool für Remote-Verwaltung. Falls die Datei nicht vorhanden ist, klicken Sie auf "PsExec herunterladen". Ohne PsExec wird Methode 3 bei der WinRM-Aktivierung übersprungen.
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
