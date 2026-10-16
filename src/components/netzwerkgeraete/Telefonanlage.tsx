// ── Netzwerkgeräte → Telefonanlage (Grandstream GXW4224, Notruftelefone) ────────
// Zwei Gateways im Keller, über die ausschließlich die analogen Notruftelefone im
// ganzen Gelände laufen. Passwörter liegen NICHT im Quelltext, sondern in
// resources/Netzwerkgeraete/telefonanlage.json (per .gitignore aus dem Repo
// ausgeschlossen, beim Build eingebunden). Anzeigen/Kopieren/Auto-Login nur nach PIN.

import { useEffect, useState, type ReactNode } from 'react'
import {
  Phone, MapPin, LogIn, AlertTriangle, Loader2,
  RefreshCw, Siren, Power, ListChecks, Info, ShieldAlert, ExternalLink, Wrench,
} from 'lucide-react'
import { api } from '../../electronAPI'
import { zugangFuer, usePinSperre, PasswortZeile, oeffneMitLogin, oeffneImBrowser } from './zugang'

interface Gateway { name: string; ip: string }
const GATEWAYS: Gateway[] = [
  { name: 'Gateway 1', ip: '10.170.32.25' },
  { name: 'Gateway 2', ip: '10.170.32.92' },
]

function passwortFuer(ip: string): string {
  return zugangFuer('telefonanlage', ip)?.passwort ?? ''
}
const ZUGANG_DA = !!zugangFuer('telefonanlage', GATEWAYS[0].ip)
const BENUTZER = zugangFuer('telefonanlage', GATEWAYS[0].ip)?.benutzer || 'admin'

type Erreichbar = 'pruefe' | 'online' | 'offline'

/** Ping + Port 80 (Weboberfläche) für alle Gateways — eine PowerShell-Runde. */
async function pruefeErreichbarkeit(): Promise<Record<string, boolean>> {
  const ips = GATEWAYS.map(g => `'${g.ip}'`).join(',')
  const ps = [
    "$ErrorActionPreference='SilentlyContinue'",
    `foreach ($ip in @(${ips})) {`,
    '  $ok=$false',
    '  try { if ((New-Object System.Net.NetworkInformation.Ping).Send($ip,1500).Status -eq "Success") { $ok=$true } } catch {}',
    '  if (-not $ok) { try { $t=New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync($ip,80).Wait(2000)) { $ok=$true }; $t.Close() } catch {} }',
    '  Write-Output ("$ip=" + $(if ($ok) {"1"} else {"0"}))',
    '}',
  ].join('\n')
  const out: Record<string, boolean> = {}
  try {
    const r = await api().runPowerShell(ps, 20000)
    for (const line of (r.stdout || '').split(/\r?\n/)) {
      const m = line.trim().match(/^([\d.]+)=([01])$/)
      if (m) out[m[1]] = m[2] === '1'
    }
  } catch { /* alles offline anzeigen */ }
  return out
}

export default function Telefonanlage() {
  const { entsperrt, mitPin, pinDialog } = usePinSperre()
  const [status, setStatus] = useState<Record<string, Erreichbar>>({})
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)

  async function aktualisieren() {
    setStatus(Object.fromEntries(GATEWAYS.map(g => [g.ip, 'pruefe' as Erreichbar])))
    const r = await pruefeErreichbarkeit()
    setStatus(Object.fromEntries(GATEWAYS.map(g => [g.ip, (r[g.ip] ? 'online' : 'offline') as Erreichbar])))
  }
  useEffect(() => { void aktualisieren() }, [])

  const titel = (g: Gateway) => `Telefonanlage ${g.name} (${g.ip})`
  async function oeffnen(g: Gateway) {
    setMeldung(await oeffneMitLogin({ url: `http://${g.ip}/`, title: titel(g), benutzer: BENUTZER, passwort: passwortFuer(g.ip) }))
  }
  async function imBrowser(g: Gateway) {
    setMeldung(await oeffneImBrowser({ url: `http://${g.ip}/`, title: titel(g), passwort: passwortFuer(g.ip) }))
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Kopf */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
          <Siren size={24} className="text-red-400" />
        </div>
        <div className="flex-1 min-w-[260px]">
          <h2 className="text-base font-semibold text-foreground">Telefonanlage für die Notruftelefone</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Grandstream GXW4224 · analoges Telefon-Gateway mit 24 Anschlüssen (FXS 1–24)</p>
          <div className="flex flex-wrap gap-3 mt-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-foreground"><MapPin size={13} className="text-blue-400" />Standort: <b>Keller</b></span>
            <span className="inline-flex items-center gap-1.5 text-foreground"><Phone size={13} className="text-blue-400" />Benutzer: <code className="font-mono">{BENUTZER}</code></span>
          </div>
        </div>
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 max-w-sm">
          <b>Wichtig:</b> Über diese Anlage laufen <b>ausschließlich die Notruftelefone</b> — verteilt über das ganze Gelände und alle Gebäude. Ist sie gestört oder startet neu, funktioniert <b>kein</b> Notruftelefon.
        </div>
      </div>

      {!ZUGANG_DA && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle size={14} />Die Zugangsdaten-Datei fehlt in diesem Build (resources/Netzwerkgeraete/telefonanlage.json) — Anmelden geht nur von Hand.
        </div>
      )}

      {/* Gateways */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {GATEWAYS.map(g => {
          const st = status[g.ip]
          const pw = passwortFuer(g.ip)
          return (
            <div key={g.ip} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${st === 'online' ? 'bg-emerald-400' : st === 'offline' ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
                <span className="text-sm font-semibold text-foreground">{g.name}</span>
                <code className="text-xs font-mono text-muted-foreground">{g.ip}</code>
                <span className={`ml-auto text-[11px] ${st === 'online' ? 'text-emerald-300' : st === 'offline' ? 'text-red-300' : 'text-muted-foreground'}`}>
                  {st === 'online' ? 'erreichbar' : st === 'offline' ? 'nicht erreichbar' : <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" />prüfe…</span>}
                </span>
              </div>

              <PasswortZeile passwort={pw} entsperrt={entsperrt} mitPin={mitPin} />

              <div className="flex flex-wrap gap-2">
                <button onClick={() => mitPin(() => void oeffnen(g))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                  <LogIn size={13} />Öffnen &amp; anmelden
                </button>
                <button onClick={() => mitPin(() => void imBrowser(g))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">
                  <ExternalLink size={13} />Im Browser (Passwort in Zwischenablage)
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => void aktualisieren()} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">
          <RefreshCw size={12} />Erreichbarkeit neu prüfen
        </button>
        {meldung && <span className={`text-xs ${meldung.ok ? 'text-emerald-300' : 'text-red-300'}`}>{meldung.text}</span>}
      </div>

      {/* Anleitung */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><ListChecks size={16} className="text-blue-400" />Anleitung — auch wenn du die Anlage noch nie gesehen hast</h3>

        <Abschnitt icon={<Info size={14} />} titel="1. Was ist das überhaupt?">
          <p>Die Notruftelefone im Gelände sind <b>klassische analoge Telefone</b>. Die Telefonanlage im <b>Keller</b> ist ein „Gateway": Sie hat 24 Anschlüsse (<b>FXS 1–24</b>), an jedem hängt eine Telefonleitung. Das Gateway meldet jede Leitung über das Netzwerk an unserer Telefonie an — dadurch hat jedes Notruftelefon seine Durchwahl.</p>
          <p>Es gibt <b>zwei</b> solche Gateways (oben: Gateway 1 und Gateway 2), jedes mit eigener IP-Adresse und eigenem Passwort.</p>
        </Abschnitt>

        <Abschnitt icon={<LogIn size={14} />} titel="2. Anmelden">
          <ol className="list-decimal pl-5 space-y-1">
            <li>Beim richtigen Gateway auf <b>„Öffnen &amp; anmelden"</b> klicken und die PIN eingeben.</li>
            <li>Es öffnet sich ein Fenster mit der Weboberfläche — Benutzer und Passwort werden <b>automatisch eingetragen</b>.</li>
            <li>Falls doch die Anmeldeseite stehen bleibt: Das Passwort liegt bereits in der Zwischenablage → ins Passwortfeld klicken, <kbd className="px-1 border border-border rounded">Strg</kbd>+<kbd className="px-1 border border-border rounded">V</kbd>, „Login".</li>
            <li>Erkennungszeichen, dass du drin bist: oben rechts steht <b>„Admin Logout"</b> und <b>„Reboot"</b>.</li>
          </ol>
        </Abschnitt>

        <Abschnitt icon={<Siren size={14} />} titel="3. Ein Notruftelefon geht nicht — Schritt für Schritt" hervorheben>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li><b>Eingrenzen:</b> Geht <i>ein</i> Telefon nicht oder <i>alle</i>? Durchwahl und Standort des betroffenen Telefons notieren.</li>
            <li><b>Erreichbar?</b> Oben in den Karten: Steht ein Gateway auf <span className="text-red-300">„nicht erreichbar"</span>, ist es aus, hat kein Netzwerk oder hängt → weiter mit Schritt 6 (Keller).</li>
            <li>Anmelden und <b>Status → Port Status</b> öffnen. Dort steht jede Leitung FXS 1–24 mit zwei Werten:
              <div className="mt-1.5 overflow-hidden rounded-md border border-border">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left px-2 py-1">Anzeige</th><th className="text-left px-2 py-1">Bedeutung</th><th className="text-left px-2 py-1">Was tun?</th></tr></thead>
                  <tbody>
                    <tr className="border-t border-border"><td className="px-2 py-1"><b>On Hook</b></td><td className="px-2 py-1">Hörer liegt auf — normal</td><td className="px-2 py-1">—</td></tr>
                    <tr className="border-t border-border"><td className="px-2 py-1"><b>Off Hook</b></td><td className="px-2 py-1">Hörer ist abgenommen</td><td className="px-2 py-1">Dauerhaft, obwohl niemand telefoniert? → Hörer nicht richtig aufgelegt, Telefon oder Kabel defekt — vor Ort prüfen.</td></tr>
                    <tr className="border-t border-border"><td className="px-2 py-1"><b>Registered</b></td><td className="px-2 py-1">Leitung ist an der Telefonie angemeldet — OK</td><td className="px-2 py-1">—</td></tr>
                    <tr className="border-t border-border"><td className="px-2 py-1 text-red-300"><b>Not Registered</b></td><td className="px-2 py-1">Leitung ist <b>nicht</b> angemeldet — Telefon kann nicht telefonieren</td><td className="px-2 py-1">Nur eine Leitung: Port-Einstellungen prüfen (Schritt 4). Viele/alle: Neustart (Schritt 5).</td></tr>
                  </tbody>
                </table>
              </div>
            </li>
            <li><b>Welche Leitung ist welches Telefon?</b> Unter <b>FXS Ports → Port Settings → FXS 1-16 / FXS 17-24</b> steht pro Anschluss die Durchwahl (Spalte „Name") und die Anmeldung (SIP User ID). Hier nur <b>nachsehen</b> — nichts ändern ohne Rücksprache.</li>
            <li><b>Neustart</b> — siehe Abschnitt 4. Danach erneut <b>Port Status</b> prüfen: Alle Leitungen sollten wieder „Registered" sein.</li>
            <li><b>Immer noch gestört / nicht erreichbar:</b> In den <b>Keller</b> gehen und am Gerät prüfen: Strom da (LEDs an)? Netzwerkkabel gesteckt und blinkt? Notfalls Strom kurz trennen und wieder einstecken.</li>
            <li>Danach ein betroffenes Notruftelefon <b>testen</b> (Anruf) und das Ergebnis im Ticket festhalten.</li>
          </ol>
        </Abschnitt>

        <Abschnitt icon={<Power size={14} />} titel="4. Neustart (Reboot)">
          <ul className="list-disc pl-5 space-y-1">
            <li>Oben rechts in der Weboberfläche auf <b>„Reboot"</b> klicken und bestätigen.</li>
            <li>Dauert etwa <b>1–2 Minuten</b>. In dieser Zeit funktioniert <b>kein Notruftelefon</b> an diesem Gateway → vorher kurz Bescheid geben (z. B. Werkschutz/Empfang).</li>
            <li>Danach neu anmelden und unter <b>Status → Port Status</b> prüfen, ob alles wieder „Registered" ist.</li>
            <li>Gut zu wissen: Die Anlage startet zusätzlich <b>automatisch einmal pro Woche</b> neu (eingestellt unter Advanced Settings → System Features: wöchentlich, Tag 6, 5 Uhr — Tag 6 ist bei Grandstream üblicherweise Samstag).</li>
          </ul>
        </Abschnitt>

        <Abschnitt icon={<Wrench size={14} />} titel="5. Die wichtigsten Menüs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Menue name="Status → Port Status" text="Zustand jeder Leitung (On/Off Hook, Registered). Erste Anlaufstelle bei Störungen." />
            <Menue name="Status → Network Status" text="IP-Adresse und Netzwerkverbindung des Gateways." />
            <Menue name="Status → System Info" text="Modell, Firmware-Version, Laufzeit seit dem letzten Neustart." />
            <Menue name="FXS Ports → Port Settings" text="Welche Durchwahl hängt an welchem Anschluss (nur ansehen)." />
            <Menue name="Advanced Settings → System Features" text="Automatischer Neustart und Grundeinstellungen." />
            <Menue name="Maintenance" text="Firmware, Sicherung, Werkseinstellungen — nur mit Rücksprache!" />
          </div>
        </Abschnitt>

        <Abschnitt icon={<ShieldAlert size={14} />} titel="6. Vorsicht">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>„Save and Apply"</b> übernimmt Änderungen sofort — eine falsche Einstellung kann Notruftelefone lahmlegen.</li>
            <li>Unter <b>Maintenance</b> niemals „Factory Reset" / Werkseinstellungen auslösen.</li>
            <li>Nach der Arbeit oben rechts <b>„Admin Logout"</b>.</li>
          </ul>
        </Abschnitt>
      </div>

      {pinDialog}
    </div>
  )
}

function Abschnitt({ icon, titel, children, hervorheben }: { icon: ReactNode; titel: string; children: ReactNode; hervorheben?: boolean }) {
  return (
    <section className={`rounded-lg border p-3 ${hervorheben ? 'border-red-500/30 bg-red-500/5' : 'border-border bg-background/40'}`}>
      <h4 className="text-xs font-semibold text-foreground flex items-center gap-2 mb-1.5"><span className={hervorheben ? 'text-red-400' : 'text-blue-400'}>{icon}</span>{titel}</h4>
      <div className="text-xs text-foreground/90 leading-relaxed space-y-1.5">{children}</div>
    </section>
  )
}

function Menue({ name, text }: { name: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-2.5 py-1.5">
      <p className="text-[11px] font-semibold text-foreground">{name}</p>
      <p className="text-[11px] text-muted-foreground">{text}</p>
    </div>
  )
}
