// ── Persönliche Einstellungen: gelten nur für den angemeldeten Benutzer ──────
import { useEffect, useMemo, useState } from 'react'
import { Save, FolderOpen, Loader, CheckCircle, XCircle, Send, Moon, Sun, RotateCcw, Bell, BellOff, EyeOff } from 'lucide-react'
import { api } from '../electronAPI'
import { useAppStore } from '../store/appStore'
import { useAuthStore, useIsAdmin } from '../store/authStore'
import { useMenuSichtbar } from '../store/menuSichtbarStore'
import { useServerStumm, setzeServerStumm } from '../services/serverStumm'
import { clearUserMenuOrder } from '../services/userMenuOrder'
import { MENU_CATALOG } from '../utils/menuCatalog'
import { rolleReicht, type Rolle } from '../utils/sichtbarkeit'
import type { UserEmailConfig } from '../types/auth'
import { Abschnitt, Hinweis, Schalter, eingabe, knopf, knopfLeise } from './teile'

// ── Darstellung ──────────────────────────────────────────────────────────────
export function Darstellung() {
  const settings = useAppStore(s => s.settings)
  const setSettings = useAppStore(s => s.setSettings)
  const waehle = (theme: 'dark' | 'light') => {
    setSettings({ ...settings, theme })                // wirkt sofort (App.tsx setzt die Klasse)
    void api().setSetting('theme', theme).catch(() => {})
  }
  return (
    <Abschnitt titel="Farbschema" untertitel="Gilt nur für dich auf diesem PC und wirkt sofort.">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        {([['dark', 'Dunkel', <Moon key="m" size={18} />], ['light', 'Hell', <Sun key="s" size={18} />]] as const).map(([t, name, icon]) => (
          <button key={t} onClick={() => waehle(t)} data-thema={t} aria-pressed={settings.theme === t}
            className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${settings.theme === t ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}`}>
            <span className={settings.theme === t ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
            <span className="text-sm font-medium text-foreground">{name}</span>
            {settings.theme === t && <CheckCircle size={15} className="ml-auto text-primary" />}
          </button>
        ))}
      </div>
    </Abschnitt>
  )
}

// ── Export ───────────────────────────────────────────────────────────────────
export function Export() {
  const settings = useAppStore(s => s.settings)
  const setSettings = useAppStore(s => s.setSettings)
  const [pfad, setPfad] = useState(settings.exportPath || '')
  const [gespeichert, setGespeichert] = useState(false)
  const speichere = async (p: string) => {
    setSettings({ ...settings, exportPath: p })
    await api().setSetting('exportPath', p).catch(() => {})
    setGespeichert(true); setTimeout(() => setGespeichert(false), 2000)
  }
  return (
    <Abschnitt titel="Standard-Exportordner" untertitel="Hier schlägt das Tool beim Speichern von Berichten (Excel, PDF) zuerst vor. Gilt nur für dich auf diesem PC.">
      <div className="flex gap-2 max-w-2xl">
        <input value={pfad} onChange={e => setPfad(e.target.value)} placeholder="C:\Users\…\Documents" className={eingabe} data-export-pfad />
        <button title="Ordner auswählen" onClick={async () => { const d = await api().selectDirectory(); if (d) { setPfad(d); await speichere(d) } }}
          className="px-3 rounded-md border border-border hover:bg-accent text-muted-foreground"><FolderOpen size={15} /></button>
        <button onClick={() => void speichere(pfad.trim())} className={knopf}>{gespeichert ? <CheckCircle size={13} /> : <Save size={13} />}{gespeichert ? 'Gespeichert' : 'Speichern'}</button>
      </div>
    </Abschnitt>
  )
}

// ── E-Mail ───────────────────────────────────────────────────────────────────
const EMAIL_PFAD = (u: string) => `email_config/${u}.json`
const EMAIL_STANDARD: UserEmailConfig = { email: '', smtp: 'smtp.office365.com', port: 587, useTls: true, notifyEmail: '', emailMethod: 'outlook' }

export async function ladeEmail(username: string): Promise<UserEmailConfig> {
  if (!username) return EMAIL_STANDARD
  const c = await api().netReadJsonAsync<UserEmailConfig>(EMAIL_PFAD(username)).catch(() => null)
  return c ? { ...EMAIL_STANDARD, ...c } : EMAIL_STANDARD
}

export function EMail() {
  const username = useAuthStore(s => s.session?.user.username) || ''
  const [cfg, setCfg] = useState<UserEmailConfig>(EMAIL_STANDARD)
  const [speichert, setSpeichert] = useState(false)
  const [gespeichert, setGespeichert] = useState(false)
  const [test, setTest] = useState<{ zustand: 'idle' | 'sending' | 'ok' | 'error'; text?: string }>({ zustand: 'idle' })
  useEffect(() => { void ladeEmail(username).then(setCfg) }, [username])
  const setze = <K extends keyof UserEmailConfig>(k: K, v: UserEmailConfig[K]) => setCfg(c => ({ ...c, [k]: v }))
  const methode = cfg.emailMethod ?? 'outlook'

  async function speichern() {
    if (!username) return
    setSpeichert(true)
    try { if (await api().netWriteJsonAsync(EMAIL_PFAD(username), cfg)) { setGespeichert(true); setTimeout(() => setGespeichert(false), 2000) } } finally { setSpeichert(false) }
  }
  async function testMail() {
    if (!cfg.email || (methode !== 'outlook' && !cfg.smtp)) { setTest({ zustand: 'error', text: methode === 'outlook' ? 'Bitte die eigene E-Mail-Adresse eintragen (sie bekommt die Test-Mail).' : 'Bitte E-Mail-Adresse und SMTP-Server ausfüllen.' }); return }
    setTest({ zustand: 'sending' })
    try {
      const r = await api().sendEmailRaw({
        to: cfg.email, subject: 'IT Admin Tool – Test-E-Mail',
        body: `Diese Test-E-Mail wurde vom IT Admin Tool gesendet.\n\nVersandart: ${methode}\nAbsender: ${cfg.email}`,
        smtp: cfg.smtp || 'smtp.office365.com', port: cfg.port || 587, useTls: cfg.useTls, from: cfg.email,
        user: cfg.smtpUser || cfg.email, pass: cfg.smtpPass || '', method: methode,
      })
      setTest(r.success ? { zustand: 'ok', text: `Gesendet (${r.method || methode}).` } : { zustand: 'error', text: r.error || 'Unbekannter Fehler' })
    } catch (e) { setTest({ zustand: 'error', text: String(e) }) }
  }

  return (
    <Abschnitt titel="E-Mail-Versand" untertitel="Absender und Versandart für Mails, die du aus dem Tool verschickst. Gilt nur für dich.">
      <div className="grid sm:grid-cols-2 gap-3 max-w-3xl">
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Deine E-Mail-Adresse (Absender)</span>
          <input type="email" value={cfg.email} onChange={e => setze('email', e.target.value)} placeholder="name@firma.de" className={eingabe} /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Benachrichtigung bei Absturz an</span>
          <input type="email" value={cfg.notifyEmail} onChange={e => setze('notifyEmail', e.target.value)} placeholder="name@firma.de" className={eingabe} /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs text-muted-foreground">Versandart</span>
          <select value={methode} onChange={e => setze('emailMethod', e.target.value as UserEmailConfig['emailMethod'])} className={eingabe}>
            <option value="outlook">Outlook (empfohlen) – nutzt dein angemeldetes Outlook, kein Passwort</option>
            <option value="powershell">PowerShell SMTP – Windows-Anmeldung, kein Passwort</option>
            <option value="nodemailer">SMTP mit Anmeldedaten</option>
          </select></label>
        {methode !== 'outlook' && (<>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">SMTP-Server</span>
            <input value={cfg.smtp} onChange={e => setze('smtp', e.target.value)} className={eingabe} /></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Port</span>
            <input type="number" value={cfg.port} onChange={e => setze('port', Number(e.target.value))} className={eingabe} /></label>
          <label className="flex items-center gap-2 sm:col-span-2 text-xs text-foreground">
            <Schalter an={!!cfg.useTls} onChange={v => setze('useTls', v)} label="STARTTLS" />STARTTLS (empfohlen für Port 587)</label>
        </>)}
        {methode === 'nodemailer' && (<>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">SMTP-Benutzer</span>
            <input value={cfg.smtpUser ?? ''} onChange={e => setze('smtpUser', e.target.value)} placeholder={cfg.email} className={eingabe} /></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">SMTP-Passwort</span>
            <input type="password" value={cfg.smtpPass ?? ''} onChange={e => setze('smtpPass', e.target.value)} className={eingabe} /></label>
          <Hinweis ton="warn" className="sm:col-span-2">Das SMTP-Passwort liegt in deiner persönlichen Datei auf dem Netzlaufwerk. Wenn möglich „Outlook“ verwenden.</Hinweis>
        </>)}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => void speichern()} disabled={speichert} className={knopf}>{speichert ? <Loader size={13} className="animate-spin" /> : gespeichert ? <CheckCircle size={13} /> : <Save size={13} />}{gespeichert ? 'Gespeichert' : 'Speichern'}</button>
        <button onClick={() => void testMail()} disabled={test.zustand === 'sending'} className={knopfLeise}>{test.zustand === 'sending' ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}Test-Mail an mich</button>
        {test.zustand === 'ok' && <span className="text-xs es-ok inline-flex items-center gap-1"><CheckCircle size={12} />{test.text}</span>}
        {test.zustand === 'error' && <span className="text-xs es-fehler inline-flex items-center gap-1"><XCircle size={12} />{test.text}</span>}
      </div>
    </Abschnitt>
  )
}

// ── Menü & Hinweise ──────────────────────────────────────────────────────────
export function MenueHinweise() {
  const user = useAuthStore(s => s.session?.user)
  const isAdmin = useIsAdmin()
  const sichtbar = useMenuSichtbar(s => s.sichtbar)
  const neuLaden = useMenuSichtbar(s => s.neuLaden)
  const stumm = useServerStumm(s => s.stumm)
  const [zurueck, setZurueck] = useState(false)
  const rolle: Rolle = user?.role === 'master_admin' ? 'master_admin' : user?.role === 'admin' ? 'admin' : 'user'
  // Ausgeblendet = die Rolle würde es erlauben, aber die IT hat es (global oder für dich) ausgeblendet
  const ausgeblendet = useMemo(() => sichtbar ? MENU_CATALOG.filter(m => rolleReicht(m, rolle) && sichtbar[m.id] === false) : [], [sichtbar, rolle])

  return (
    <div className="space-y-4">
      <Abschnitt titel="Reihenfolge der Seitenleiste" untertitel="Oben in der Seitenleiste „Menü anordnen“ anklicken und die Punkte mit der Maus verschieben. Gilt nur für dich, auf jedem PC.">
        <button disabled={!user?.id} onClick={async () => { if (!user?.id) return; await clearUserMenuOrder(user.id); neuLaden(); setZurueck(true); setTimeout(() => setZurueck(false), 2500) }} className={knopfLeise}>
          {zurueck ? <CheckCircle size={13} className="es-ok" /> : <RotateCcw size={13} />}{zurueck ? 'Zurückgesetzt' : 'Standard-Reihenfolge wiederherstellen'}
        </button>
      </Abschnitt>
      {isAdmin && (
        <Abschnitt titel="Server-Mitteilungen" untertitel="Popups, Windows-Hinweise und Blinken bei Server-Ausfällen, Neustarts und Zertifikaten. Ausschalten gilt nur für dich – die Prüfungen laufen weiter. Dasselbe wie die Glocke neben „Server“ in der Seitenleiste.">
          <label className="flex items-center gap-3 text-sm text-foreground">
            <Schalter an={!stumm} onChange={v => void setzeServerStumm(user?.username || '', !v)} label="Server-Mitteilungen" data="server-mitteilungen" />
            {stumm ? <><BellOff size={15} className="es-fehler" />Aus – du bekommst keine Server-Mitteilungen</> : <><Bell size={15} className="es-ok" />An</>}
          </label>
        </Abschnitt>
      )}
      <Abschnitt titel="Von der IT ausgeblendet" untertitel="Diese Menüpunkte würde deine Rolle erlauben, sie sind aber in „Benutzer & Rechte“ ausgeblendet. Brauchst du einen davon, melde dich bei der IT.">
        {ausgeblendet.length === 0
          ? <p className="text-xs text-muted-foreground">Keine – du siehst alles, was deine Rolle erlaubt.</p>
          : <div className="flex flex-wrap gap-1.5">{ausgeblendet.map(m => <span key={m.id} className="es-chip"><EyeOff size={11} className="text-muted-foreground" />{m.elternteil ? `${MENU_CATALOG.find(x => x.id === m.elternteil)?.label} › ` : ''}{m.label}</span>)}</div>}
      </Abschnitt>
    </div>
  )
}

// ── Über das Programm ────────────────────────────────────────────────────────
export function Ueber({ version }: { version: string }) {
  return (
    <Abschnitt titel="IT Admin Tool">
      <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
        {[['Version', version || '1.0.0'], ['Plattform', 'Windows'], ['Technik', 'Electron · React · TypeScript']].map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="text-foreground font-medium">{v}</dd></div>
        ))}
      </dl>
    </Abschnitt>
  )
}
