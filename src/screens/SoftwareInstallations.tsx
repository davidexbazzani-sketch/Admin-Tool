import { useState } from 'react'
import { PackagePlus, Wrench } from 'lucide-react'
import SolidWorksInstallation from '../components/softwareInstallations/SolidWorksInstallation'

type Section = 'overview' | 'solidworks'

export default function SoftwareInstallations() {
  const [section, setSection] = useState<Section>('overview')

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
              <h3 className="font-semibold text-foreground">SolidWorks 2024 SP5</h3>
              <p className="text-xs text-muted-foreground mt-1">Automatisierte Installation (Schritte 1-9). Robocopy + Setup + Konfiguration in einem Durchlauf.</p>
            </div>
            <span className="text-xs text-primary font-medium">Installation starten &rarr;</span>
          </button>
        </div>
      )}

      {section === 'solidworks' && (
        <>
          <button onClick={() => setSection('overview')} className="text-xs text-muted-foreground hover:text-foreground mb-3 self-start">&larr; Zurueck zur Uebersicht</button>
          <SolidWorksInstallation />
        </>
      )}
    </div>
  )
}
