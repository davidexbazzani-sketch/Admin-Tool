import { useEffect, useState } from 'react'
import { Save, FolderOpen, Info, Mail, Send, Loader, CheckCircle, XCircle } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../electronAPI'
import type { AppSettings } from '../types'
import type { UserEmailConfig } from '../types/auth'
import Card from '../components/Card'

const EMAIL_CONFIG_PATH = (username: string) => `email_config/${username}.json`

const DEFAULT_EMAIL_CONFIG: UserEmailConfig = {
  email: '',
  smtp: 'smtp.office365.com',
  port: 587,
  useTls: true,
  notifyEmail: '',
}

export default function Settings() {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const session = useAuthStore(s => s.session)
  const username = session?.user.username ?? ''

  const [local, setLocal] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)
  const [version, setVersion] = useState('')

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
      await api().sendEmailRaw({
        to: emailCfg.email,
        subject: 'IT Admin Tool – Test-E-Mail',
        body: `Diese Test-E-Mail wurde vom IT Admin Tool gesendet.\n\nKonfiguration:\nSMTP: ${emailCfg.smtp}:${emailCfg.port}\nAbsender: ${emailCfg.email}\nTLS: ${emailCfg.useTls ? 'STARTTLS (aktiv)' : 'Deaktiviert'}`,
        smtp: emailCfg.smtp,
        port: emailCfg.port,
        useTls: emailCfg.useTls,
        from: emailCfg.email,
      })
      setTestState('ok')
      setTimeout(() => setTestState('idle'), 3000)
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

      {/* About */}
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
