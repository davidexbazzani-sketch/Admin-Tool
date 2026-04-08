import { useState } from 'react'
import { X, Copy, Check, ChevronDown, ChevronRight, HelpCircle, Terminal, Shield, Wifi, CheckCircle } from 'lucide-react'

function CopyBlock({ code, large }: { code: string; large?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <pre className={`p-3 rounded-md bg-muted/30 border border-border font-mono text-foreground overflow-x-auto whitespace-pre-wrap ${large ? 'text-[11px] leading-relaxed' : 'text-[10px] leading-relaxed'}`}>
        {code}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
        className={`mt-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
          large
            ? copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20'
            : copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
        }`}>
        {copied ? <><Check size={10} /> Kopiert!</> : <><Copy size={10} /> {large ? 'Befehl kopieren' : 'Kopieren'}</>}
      </button>
    </div>
  )
}

function Accordion({ title, icon, defaultOpen, highlight, children }: {
  title: string; icon?: React.ReactNode; defaultOpen?: boolean; highlight?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div className={`rounded-lg border overflow-hidden ${highlight ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border'}`}>
      <button onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-accent/10 transition-colors ${highlight ? 'bg-emerald-500/5' : ''}`}>
        {open ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
        {icon}
        <span className={`text-xs font-semibold ${highlight ? 'text-emerald-400' : 'text-foreground'}`}>{title}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

const FULL_CMD = `Set-ExecutionPolicy RemoteSigned -Force; Enable-PSRemoting -Force -SkipNetworkProfileCheck; Set-Service WinRM -StartupType Automatic; Start-Service WinRM; Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value "*" -Force; Set-Item WSMan:\\localhost\\Shell\\MaxMemoryPerShellMB -Value 1024; winrm set winrm/config/service '@{AllowUnencrypted="true"}'; winrm set winrm/config/service/auth '@{Basic="true"}'; netsh advfirewall firewall add rule name="WinRM-HTTP-In" dir=in action=allow protocol=TCP localport=5985; $networkProfile = Get-NetConnectionProfile | Where-Object {$_.NetworkCategory -eq 'Public'}; if ($networkProfile) { Set-NetConnectionProfile -InterfaceIndex $networkProfile.InterfaceIndex -NetworkCategory Private }; Restart-Service WinRM; Write-Host 'WinRM ist jetzt komplett konfiguriert und aus dem Netzwerk erreichbar.' -ForegroundColor Green`

export default function WinRMHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-[650px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-5 py-4 border-b border-border">
          <HelpCircle size={18} className="text-primary" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-foreground">WinRM vor Ort aktivieren — Anleitung</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Wenn sich WinRM remote nicht aktivieren lässt, müssen folgende Schritte direkt am betroffenen PC ausgeführt werden.
              PowerShell als Administrator öffnen und die Befehle ausführen.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground"><X size={16} /></button>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">

          {/* ── Section 1: One command does it all ── */}
          <Accordion title='Ein Befehl — macht ALLES' icon={<Terminal size={14} className="text-emerald-400" />} defaultOpen highlight>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Dieser eine Befehl konfiguriert den PC komplett für WinRM-Fernzugriff. Danach ist der PC über das Netzwerk erreichbar.
              <strong className="text-foreground"> PowerShell als Administrator öffnen, einfügen, Enter drücken, fertig.</strong>
            </p>
            <CopyBlock code={FULL_CMD} large />

            <Accordion title="Was macht dieser Befehl?" icon={<HelpCircle size={12} className="text-muted-foreground" />}>
              <ul className="space-y-1.5 text-[10px] text-muted-foreground">
                <li><strong className="text-foreground">ExecutionPolicy</strong> auf RemoteSigned setzen (Scripts erlauben)</li>
                <li><strong className="text-foreground">Enable-PSRemoting</strong> — WinRM aktivieren und konfigurieren</li>
                <li><strong className="text-foreground">WinRM-Dienst</strong> auf Automatisch starten setzen</li>
                <li><strong className="text-foreground">TrustedHosts</strong> auf alle setzen (erlaubt Verbindungen)</li>
                <li><strong className="text-foreground">MaxMemory</strong> pro Shell erhöhen (verhindert Abbrüche bei großen Abfragen)</li>
                <li><strong className="text-foreground">Unverschlüsselte Verbindungen</strong> erlauben (nötig im Intranet ohne HTTPS)</li>
                <li><strong className="text-foreground">Basic Auth</strong> aktivieren (Fallback-Authentifizierung)</li>
                <li><strong className="text-foreground">Firewall-Regel</strong> für Port 5985 erstellen</li>
                <li><strong className="text-foreground">Netzwerkprofil</strong> von "Öffentlich" auf "Privat" ändern (falls nötig)</li>
                <li><strong className="text-foreground">WinRM-Dienst</strong> neu starten</li>
              </ul>
            </Accordion>
          </Accordion>

          {/* ── Section 2: Individual steps ── */}
          <Accordion title="Einzelne Schritte (falls der Komplett-Befehl nicht reicht)" icon={<Terminal size={14} className="text-blue-400" />}>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-foreground mb-1">Schnellfix</p>
                <p className="text-[10px] text-muted-foreground mb-1.5">Macht das meiste automatisch. In 90% der Fälle reicht das.</p>
                <CopyBlock code="Enable-PSRemoting -Force -SkipNetworkProfileCheck" />
              </div>

              <div>
                <p className="text-[10px] font-semibold text-foreground mb-1">Netzwerkprofil prüfen</p>
                <p className="text-[10px] text-muted-foreground mb-1.5">WinRM funktioniert nicht wenn das Netzwerkprofil auf "Öffentlich" steht.</p>
                <p className="text-[9px] text-muted-foreground mb-1">Prüfen:</p>
                <CopyBlock code="Get-NetConnectionProfile" />
                <p className="text-[9px] text-muted-foreground mt-2 mb-1">Ändern (InterfaceAlias aus dem Ergebnis oben einsetzen):</p>
                <CopyBlock code='Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory DomainAuthenticated' />
              </div>

              <div>
                <p className="text-[10px] font-semibold text-foreground mb-1">Firewall-Regel manuell erstellen</p>
                <CopyBlock code='netsh advfirewall firewall add rule name="WinRM-HTTP-In" dir=in action=allow protocol=TCP localport=5985' />
              </div>

              <div>
                <p className="text-[10px] font-semibold text-foreground mb-1">WinRM-Dienst manuell starten</p>
                <CopyBlock code="Set-Service WinRM -StartupType Automatic -Status Running" />
              </div>

              <div>
                <p className="text-[10px] font-semibold text-foreground mb-1">TrustedHosts setzen</p>
                <CopyBlock code={'Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value "*" -Force\nRestart-Service WinRM'} />
              </div>
            </div>
          </Accordion>

          {/* ── Section 3: GPO ── */}
          <Accordion title="Gruppenrichtlinie prüfen (GPO)" icon={<Shield size={14} className="text-amber-400" />}>
            <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
              Falls eine Firmen-GPO WinRM blockiert, helfen lokale Änderungen nur bis zum nächsten <code className="bg-muted/30 px-1 rounded text-[9px]">gpupdate</code>.
              In dem Fall muss die GPO vom AD-Administrator angepasst werden.
            </p>
            <p className="text-[9px] text-muted-foreground mb-1">GPO-Report erstellen und prüfen:</p>
            <CopyBlock code={'gpresult /h C:\\Temp\\gpo_report.html\nStart-Process C:\\Temp\\gpo_report.html'} />
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              In der HTML-Datei nach <strong>"Windows Remote Management"</strong> oder <strong>"WinRM"</strong> suchen.
              Falls dort eine GPO WinRM deaktiviert, muss diese GPO zentral geändert werden.
            </p>
          </Accordion>

          {/* ── Section 4: Verify ── */}
          <Accordion title="Verifizieren ob WinRM funktioniert" icon={<Wifi size={14} className="text-emerald-400" />}>
            <p className="text-[10px] text-muted-foreground mb-2">Nach der Konfiguration testen ob WinRM funktioniert:</p>

            <div className="space-y-3">
              <div>
                <p className="text-[9px] text-muted-foreground mb-1">Lokal auf dem PC:</p>
                <CopyBlock code="winrm enumerate winrm/config/listener" />
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground mb-1">Von einem anderen PC aus:</p>
                <CopyBlock code="Test-WSMan -ComputerName HOSTNAME" />
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground mb-1">Verbindungstest:</p>
                <CopyBlock code="Invoke-Command -ComputerName HOSTNAME -ScriptBlock { hostname }" />
              </div>
            </div>

            <div className="mt-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2">
              <p className="text-[9px] text-emerald-400 flex items-center gap-1"><CheckCircle size={10} /> Wenn alle drei Befehle funktionieren, ist WinRM korrekt konfiguriert.</p>
            </div>
          </Accordion>

        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-border bg-muted/10">
          <p className="text-[9px] text-muted-foreground leading-relaxed">
            Nach der Aktivierung vor Ort: Starten Sie den Scan erneut. Die PCs sollten jetzt erreichbar sein.
            Alternativ: Nutzen Sie den <strong>"Erneut scannen"</strong> Button über der Liste.
          </p>
        </div>
      </div>
    </div>
  )
}
