import { useEffect, useState } from 'react'
import { Save, FolderOpen, Info } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { api } from '../electronAPI'
import type { AppSettings } from '../types'
import Card from '../components/Card'

export default function Settings() {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)

  const [local, setLocal] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    api().getAppVersion().then(setVersion).catch(() => setVersion('—'))
    api().getSettings().then((s) => {
      const merged = { ...settings, ...s } as AppSettings
      setSettings(merged)
      setLocal(merged)
    }).catch(() => {})
  }, [])

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setLocal((l) => ({ ...l, [key]: value }))
  }

  async function save() {
    for (const [key, value] of Object.entries(local)) {
      await api().setSetting(key, value)
    }
    setSettings(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
        {/* SMTP */}
        <Card title="E-Mail / SMTP" subtitle="Für den E-Mail-Versand von Berichten">
          <div className="space-y-3">
            {[
              { label: 'SMTP-Server', key: 'smtpHost', placeholder: 'smtp.firma.de', type: 'text' },
              { label: 'Port', key: 'smtpPort', placeholder: '587', type: 'number' },
              { label: 'Benutzername', key: 'smtpUser', placeholder: 'user@firma.de', type: 'text' },
              { label: 'Passwort', key: 'smtpPass', placeholder: '••••••••', type: 'password' },
              { label: 'Absender', key: 'smtpFrom', placeholder: 'it-admin@firma.de', type: 'text' },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                <input
                  type={type}
                  value={String(local[key as keyof AppSettings])}
                  placeholder={placeholder}
                  onChange={(e) => update(key as keyof AppSettings, type === 'number' ? Number(e.target.value) : e.target.value as AppSettings[keyof AppSettings])}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            ))}
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
