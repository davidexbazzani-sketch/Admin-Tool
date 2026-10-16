// ── Erklärungen zu den Kacheln der Geräte-Einrichtung („i") ──────────────────
// Eine Quelle für beide Stellen: die Kacheln im Migrations-Cockpit und die Kacheln
// auf den Karten der Übersicht. Klick auf das „i" zeigt, was die Kachel genau macht.
// Neue Kachel = Eintrag hier + <TileInfoButton id="…" /> daneben.

import { useEffect, useState, type ReactNode } from 'react'
import { Info, X } from 'lucide-react'

export interface TileInfoEntry { label: string; info: string[] }

export const TILE_INFO: Record<string, TileInfoEntry> = {
  drivers: {
    label: 'Treiber-Installation',
    info: [
      'Fragt am Admin-PC über HP CMSL die passende Softpaq-Liste zum Modell ab und vergleicht sie mit den installierten Treiberversionen.',
      'Ausgewählte Treiber werden über die Admin-Freigabe c$ auf den PC kopiert und dort still installiert.',
      'BIOS-Updates sind grundsätzlich ausgeschlossen. Ein nötiger Neustart wird nur gemeldet, nie erzwungen.',
    ],
  },
  setupscript: {
    label: 'Basic',
    info: [
      'Grundeinrichtung eines frisch aufgesetzten PCs. Die passende Variante ergibt sich aus dem Modell-Typ des NEUEN Geräts: EliteBook (Laptop Standard/light), Mini-PC (Desktop Mini) oder Workstation (Laptop-/Desktop Workstation).',
      'Ein Klick führt ALLES aus der Ferne aus — es wird nichts auf dem Gerät abgelegt und nichts von Hand gestartet. Der Lauf läuft im Hintergrund weiter, auch wenn das Fenster zu ist.',
      'Bei allen drei Varianten: Netzlaufwerk I: (sofort + Autostart bei jeder Anmeldung), Sprache, Energieoptionen ohne Standby/Ruhezustand, Windows-Updates.',
      'Sprache: stellt den PC vollständig auf Deutsch — Sprachpaket, System-Gebietsschema, Default-Profil (jeder Benutzer, der sich zum ERSTEN Mal anmeldet), Anmeldebildschirm, alle bereits vorhandenen Profile sowie die Office-Anzeigesprache. Danach ist eine Neuanmeldung nötig, fürs System-Gebietsschema ein Neustart.',
      'Zusätzlich beim Mini-PC: Office-Sprache, kein Sperrbildschirm, BDE-/Instandsetzungs-Verknüpfungen auf den öffentlichen Desktop, COSCOM-Paket nach C:\\ inklusive Autostart-Mapping.',
      'Zusätzlich bei der Workstation: lokale Admin-Gruppen (SolidWorks PortaX), Intranetzone w3143, UAC auf „nie benachrichtigen", C:\\TEMP und der SolidWorks-Robocopy im Hintergrund.',
      'Jeder Schritt nimmt den Weg, der aus der Ferne wirklich funktioniert: Maschinen-Einstellungen per WinRM, Dateien von den Netzfreigaben über den Admin-PC, benutzerbezogene Einstellungen in der Registry-Hive des Zielbenutzers.',
      'Ein fehlgeschlagener Schritt bricht den Lauf nicht ab — das Ergebnis steht je Schritt in der Kachel, zusammen mit Datum und Uhrzeit des Laufs.',
      'Nach Sprache und Umgebungsvariablen muss sich der Benutzer neu anmelden.',
    ],
  },
  printers: {
    label: 'Drucker einrichten',
    info: [
      'Nimmt die Drucker des Altgeräts aus dem Verbindungs-Scan; ist dort nichts hinterlegt, werden sie live vom Altgerät gelesen.',
      'Auf dem neuen PC werden sie über den SEAL Add Printer Wizard (sealapw) im Kontext des angemeldeten Benutzers verbunden.',
      'Der Standarddrucker des Altgeräts wird mitgesetzt. Alternativ als .cmd auf den öffentlichen Desktop.',
    ],
  },
  quickaccess: {
    label: 'Explorer-Schnellzugriffe',
    info: [
      'Die Schnellzugriffe (AutomaticDestinations / CustomDestinations) wurden bereits automatisch vom Altprofil auf das Netzlaufwerk gesichert.',
      'Hier werden sie in das Profil des Benutzers auf dem neuen PC kopiert; der Explorer startet dabei kurz neu.',
      'Nach erfolgreicher Übertragung löscht das Tool die Zwischenkopie auf dem Netzlaufwerk.',
    ],
  },
  europar: {
    label: 'EuroPAR',
    info: [
      'Erscheint nur, wenn der tägliche EuroPAR-Scan (12:00) die Ordner auf dem Altgerät gefunden hat.',
      'Sichern und Übertragen laufen von selbst im Hintergrund: Sobald das Altgerät erreichbar ist, landen die Ordner im Zwischenspeicher; sobald der neue PC erreichbar ist, werden sie dorthin übertragen. Die Kachel sagt jeweils, worauf gerade gewartet wird.',
      'Teil 1 — Ordner: C:\\EuroPAR, C:\\Local und C:\\SCHNITTDATEN wurden vom Altgerät in den Netz-Zwischenspeicher gesichert und werden hier nach C:\\ auf den neuen PC kopiert (robocopy /E, additiv — auf dem Ziel wird nichts gelöscht).',
      'Danach wird jede Datei einzeln geprüft; erst bei Vollständigkeit löscht das Tool den Unterordner im Zwischenspeicher.',
      'Teil 2 — Umgebungsvariablen: Benutzer EURO_EURN=Q:, EURO_WRKN=C:\\local und Path + Q:\\Eurnc\\cmdnc0, System EURO_EURN=Q:.',
      'Path wird nur ergänzt, nie überschrieben; bereits passende Werte bleiben unangetastet. Damit die Variablen greifen, muss sich der Benutzer neu anmelden.',
    ],
  },
  winupdate: {
    label: 'Windows-Updates',
    info: [
      'Läuft von selbst: Solange das Gerät in der Geräte-Einrichtung steht, sucht das Tool alle 8 Stunden nach Updates und installiert sie — vorausgesetzt, der PC ist gerade online.',
      'Sobald die Checkliste als erledigt markiert ist, verschwindet das Gerät aus der Übersicht und damit auch aus der Automatik.',
      'War der PC beim fälligen Lauf offline, zählt das als Versuch; der nächste Anlauf folgt nach dem üblichen Abstand.',
      'Hier in der Kachel lässt sich der Stand einsehen und ein Lauf jederzeit von Hand anstoßen.',
      'Die Installation läuft über PSWindowsUpdate; klappt das nicht, wird ersatzweise UsoClient angestoßen.',
      'Es wird nie automatisch neu gestartet — den Neustart löst der Techniker über die Kachel „Neustart + Report" aus.',
    ],
  },
  solidworks: {
    label: 'SolidWorks',
    info: [
      'Erscheint nur, wenn auf dem Altgerät SolidWorks installiert war.',
      'Führt in die SolidWorks-Installation (robocopy vom Admin-PC + geplante Aufgabe auf dem Ziel-PC).',
    ],
  },
  drives: {
    label: 'Netzlaufwerke / WLAN',
    info: [
      'Läuft von selbst: Sobald das Altgerät erreichbar ist, liest das Tool dessen dauerhaft verbundene Netzlaufwerke aus; sobald der neue PC erreichbar ist und jemand angemeldet ist, werden sie dort verbunden (net use /persistent:yes).',
      'Gelesen werden die Mappings aller Benutzerprofile des Altgeräts aus der Registry — nicht die der Fernsitzung. Derselbe Stand steht auch im Geräte-„i" unter „Verbundene Netzlaufwerke".',
      'Ist am neuen PC niemand angemeldet, kann nicht verbunden werden — das ist der Normalfall direkt nach dem Aufsetzen und kein Fehler. Der Hintergrundlauf versucht es später erneut.',
      'Als Rückfallebene legt die Kachel ein Skript auf den öffentlichen Desktop, das der Anwender nach seiner Anmeldung selbst startet; es zeigt sein Ergebnis an und meldet dem Tool zurück, dass es gelaufen ist.',
      'WLAN-Profile werden nur bei Laptops übernommen (Laptop Standard, Laptop light, Laptop Workstation) — Desktops haben keinen WLAN-Adapter. Die Profile werden für ALLE Benutzer des neuen PCs eingetragen.',
      'Die WLAN-Schlüssel müssen dafür kurzzeitig im Klartext übertragen werden; die Dateien liegen nur während der Übertragung in C:\\Temp beider Rechner und werden sofort gelöscht.',
    ],
  },
  reboot: {
    label: 'Neustart + Report',
    info: [
      'Zeigt einen Report über alles, was in diesem Cockpit bereits gelaufen ist.',
      'Startet den neuen PC auf Wunsch neu — nötig, damit Sprache, Umgebungsvariablen und Treiber greifen.',
    ],
  },
}

/**
 * Das „i" an einer Kachel. Öffnet ein kleines Fenster mit der Erklärung.
 * `icon`/`label` überschreiben die Angaben aus TILE_INFO (z. B. für die Karten-Kacheln),
 * `hinweis` zeigt zusätzlich, warum die Kachel gerade nicht ausführbar ist.
 */
export function TileInfoButton({ id, icon, label, hinweis, className }: {
  id: string; icon?: ReactNode; label?: string; hinweis?: string; className?: string
}) {
  const [offen, setOffen] = useState(false)
  const eintrag = TILE_INFO[id]

  useEffect(() => {
    if (!offen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOffen(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [offen])

  if (!eintrag) return null
  const titel = label || eintrag.label

  return (
    <>
      <button type="button" title="Was macht diese Kachel?"
        onClick={e => { e.stopPropagation(); e.preventDefault(); setOffen(true) }}
        className={className || 'p-0.5 rounded-full text-muted-foreground hover:text-primary hover:bg-accent/30'}>
        <Info size={14} />
      </button>
      {offen && (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4"
          onClick={e => { e.stopPropagation(); setOffen(false) }}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/10">
              {icon && <span className="text-primary shrink-0">{icon}</span>}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground truncate">{titel}</div>
                <div className="text-[11px] text-muted-foreground truncate">Was diese Kachel genau macht</div>
              </div>
              <button onClick={() => setOffen(false)} className="p-1.5 rounded-md hover:bg-accent/30 text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ul className="space-y-2">
                {eintrag.info.map((z, i) => (
                  <li key={i} className="flex gap-2 text-xs text-foreground leading-relaxed">
                    <span className="text-primary shrink-0 mt-0.5">•</span><span>{z}</span>
                  </li>
                ))}
              </ul>
              {hinweis && <p className="mt-3 text-[11px] text-amber-400">Aktuell nicht ausführbar: {hinweis}.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
