import { useState } from 'react'
import { PackagePlus, Wrench, Phone, Headphones, FileText, Box, MonitorUp, Lock, Cpu } from 'lucide-react'
import SolidWorksInstallation from '../components/softwareInstallations/SolidWorksInstallation'
import SolidWorksHelp from '../components/solidworks/SolidWorksHelp'
import XelionInstallation from '../components/softwareInstallations/XelionInstallation'
import JabraInstallation from '../components/softwareInstallations/JabraInstallation'
import EnaioInstallation from '../components/softwareInstallations/EnaioInstallation'
import FreeCadInstallation from '../components/softwareInstallations/FreeCadInstallation'
import InstallLogbuch from '../components/softwareInstallations/InstallLogbuch'
import ItAdminToolInstallation from '../components/softwareInstallations/ItAdminToolInstallation'
import VcRedistInstallation from '../components/softwareInstallations/VcRedistInstallation'
import { usePinSperre } from '../components/netzwerkgeraete/zugang'

// „E-Drawings" wurde am 04.11.2026 durch „3D-Viewer (FreeCAD)" ersetzt (Ferninstallation lief nicht)
type Section = 'overview' | 'solidworks' | 'xelion' | 'jabra' | 'enaio' | 'freecad' | 'itadmintool' | 'vcredist'

export default function SoftwareInstallations() {
  const [section, setSection] = useState<Section>('overview')
  // „IT Admin Tool" verteilt das Tool selbst auf andere PCs → nur mit Passwort (einmal pro Besuch)
  const { mitPin, pinDialog } = usePinSperre('Die Kachel „IT Admin Tool" installiert das Tool auf anderen PCs neu — nur mit Passwort.')

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6">
      <div className="flex items-center gap-3 mb-4">
        <PackagePlus size={28} className="text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Software Installationen</h1>
          <p className="text-sm text-muted-foreground">Software-Pakete remote auf einem Zielrechner installieren</p>
        </div>
      </div>

      {section === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button onClick={() => setSection('solidworks')}
            className="flex flex-col items-start gap-3 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-card/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Wrench size={20} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground"><SolidWorksHelp>SolidWorks</SolidWorksHelp> 2024 SP5</h3>
              <p className="text-xs text-muted-foreground mt-1">Automatisierte Installation (Schritte 1-9). Robocopy + Setup + Konfiguration in einem Durchlauf.</p>
            </div>
            <span className="text-xs text-primary font-medium">Installation starten &rarr;</span>
          </button>

          <button onClick={() => setSection('xelion')}
            className="flex flex-col items-start gap-3 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-card/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
              <Phone size={20} className="text-teal-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Xelion Desktop</h3>
              <p className="text-xs text-muted-foreground mt-1">Silent-Remote-Installation der Xelion-App (MSIX). Installer austauschbar bei neuer Version.</p>
            </div>
            <span className="text-xs text-primary font-medium">Installation starten &rarr;</span>
          </button>

          <button onClick={() => setSection('jabra')}
            className="flex flex-col items-start gap-3 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-card/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Headphones size={20} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Jabra Software</h3>
              <p className="text-xs text-muted-foreground mt-1">Jabra Direct still im Hintergrund installieren. Prüft vorher, ob ein Jabra-Gerät angeschlossen ist.</p>
            </div>
            <span className="text-xs text-primary font-medium">Installation starten &rarr;</span>
          </button>

          <button onClick={() => setSection('enaio')}
            className="flex flex-col items-start gap-3 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-card/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <FileText size={20} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Enaio</h3>
              <p className="text-xs text-muted-foreground mt-1">enaio Client + Outlook-Add-Ins übers Netzwerk installieren. Optional vorher alles von enaio vollständig entfernen (inkl. Registry-Reste).</p>
            </div>
            <span className="text-xs text-primary font-medium">Installation starten &rarr;</span>
          </button>

          <button onClick={() => setSection('freecad')}
            className="flex flex-col items-start gap-3 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-card/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Box size={20} className="text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">3D-Viewer (FreeCAD)</h3>
              <p className="text-xs text-muted-foreground mt-1">3D-Modelle (STEP/IGES) ansehen ohne SOLIDWORKS/eDrawings — kostenlos, still installiert, STEP-Dateien öffnen per Doppelklick.</p>
            </div>
            <span className="text-xs text-primary font-medium">Installation starten &rarr;</span>
          </button>

          <button onClick={() => setSection('vcredist')} data-kachel="vcredist"
            className="flex flex-col items-start gap-3 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-card/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Cpu size={20} className="text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Visual C++ Laufzeit</h3>
              <p className="text-xs text-muted-foreground mt-1">Alle Visual-C++-Redistributables (2005 bis 2015–2026) einzeln oder alle auf einmal still installieren — direkt von Microsoft, Signatur geprüft.</p>
            </div>
            <span className="text-xs text-primary font-medium">Installation starten &rarr;</span>
          </button>

          <button onClick={() => mitPin(() => setSection('itadmintool'))} data-kachel="itadmintool"
            className="flex flex-col items-start gap-3 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-card/80 transition-all text-left">
            <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
              <MonitorUp size={20} className="text-sky-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-1.5">IT Admin Tool <Lock size={12} className="text-muted-foreground" /></h3>
              <p className="text-xs text-muted-foreground mt-1">Neue Version des Tools auf andere PCs verteilen: Desktop-Nachricht, Tool beenden, still installieren, Fertig-Nachricht. Nur mit Passwort.</p>
            </div>
            <span className="text-xs text-primary font-medium">Installation starten &rarr;</span>
          </button>
        </div>
      )}
      {pinDialog}

      {section === 'itadmintool' && (
        <>
          <button onClick={() => setSection('overview')} className="text-xs text-muted-foreground hover:text-foreground mb-3 self-start">&larr; Zurueck zur Uebersicht</button>
          <ItAdminToolInstallation />
        </>
      )}

      {section === 'overview' && (
        <div className="mt-6">
          <InstallLogbuch titel="Logbuch aller Installationen" />
        </div>
      )}

      {section === 'enaio' && (
        <>
          <button onClick={() => setSection('overview')} className="text-xs text-muted-foreground hover:text-foreground mb-3 self-start">&larr; Zurueck zur Uebersicht</button>
          <EnaioInstallation />
        </>
      )}

      {section === 'vcredist' && (
        <>
          <button onClick={() => setSection('overview')} className="text-xs text-muted-foreground hover:text-foreground mb-3 self-start">&larr; Zurueck zur Uebersicht</button>
          <VcRedistInstallation />
        </>
      )}

      {section === 'freecad' && (
        <>
          <button onClick={() => setSection('overview')} className="text-xs text-muted-foreground hover:text-foreground mb-3 self-start">&larr; Zurueck zur Uebersicht</button>
          <FreeCadInstallation />
        </>
      )}

      {section === 'solidworks' && (
        <>
          <button onClick={() => setSection('overview')} className="text-xs text-muted-foreground hover:text-foreground mb-3 self-start">&larr; Zurueck zur Uebersicht</button>
          <SolidWorksInstallation />
        </>
      )}

      {section === 'xelion' && (
        <>
          <button onClick={() => setSection('overview')} className="text-xs text-muted-foreground hover:text-foreground mb-3 self-start">&larr; Zurueck zur Uebersicht</button>
          <XelionInstallation />
        </>
      )}

      {section === 'jabra' && (
        <>
          <button onClick={() => setSection('overview')} className="text-xs text-muted-foreground hover:text-foreground mb-3 self-start">&larr; Zurueck zur Uebersicht</button>
          <JabraInstallation />
        </>
      )}
    </div>
  )
}
