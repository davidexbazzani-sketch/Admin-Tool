// ── Onboarding-Screen ─────────────────────────────────────────────────────────
// Erzeugt das personalisierte Onboarding-Dashboard (selbstenthaltende HTML) und
// verteilt es auf den Public Desktop der Ziel-PCs. Vier Bereiche:
//   Übersicht          – wer startet demnächst + liegt die HTML schon drauf?
//   Verteilen          – Person wählen (neu/bestehend), Rechner, Begrüßung
//   Karten-Editor      – Regionen/Etagen/Pins/Routen für die interaktive Map
//   Einstellungen      – Links, Räume, Kontakte
// Arbeitet eng mit der Mitarbeiterverwaltung zusammen (Button auf der Karte
// springt hierher mit Vorauswahl).

import { useState } from 'react'
import { Rocket, Map, Settings2, LayoutList } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import OnboardingOverview from '../components/onboarding/OnboardingOverview'
import DeployPanel from '../components/onboarding/DeployPanel'
import MarkerEditor from '../components/onboarding/MarkerEditor'
import OnboardingSettingsPanel from '../components/onboarding/OnboardingSettings'

type Tab = 'overview' | 'deploy' | 'map' | 'settings'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Übersicht', icon: <LayoutList size={14} /> },
  { id: 'deploy', label: 'Verteilen', icon: <Rocket size={14} /> },
  { id: 'map', label: 'Karten-Editor', icon: <Map size={14} /> },
  { id: 'settings', label: 'Einstellungen', icon: <Settings2 size={14} /> },
]

export default function Onboarding() {
  const setOnboardingPreselectId = useAppStore(s => s.setOnboardingPreselectId)
  // Kommt man aus der Mitarbeiterverwaltung (Vorauswahl gesetzt), direkt in
  // den Verteilen-Tab springen — sonst mit der Übersicht starten.
  const [tab, setTab] = useState<Tab>(() => useAppStore.getState().onboardingPreselectId ? 'deploy' : 'overview')
  const [deploySource, setDeploySource] = useState<'employee' | 'ad'>('employee')

  function deployFor(employeeId: string) {
    setOnboardingPreselectId(employeeId)
    setDeploySource('employee')
    setTab('deploy')
  }

  // Aus der Übersicht: Verteilen-Tab direkt im Modus "Bestehender Mitarbeiter (AD-Suche)"
  function deployExisting() {
    setOnboardingPreselectId(null)
    setDeploySource('ad')
    setTab('deploy')
  }

  return (
    <div className="h-full flex flex-col p-6">
      <div className="shrink-0 mb-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Rocket size={22} className="text-primary" />Onboarding
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Personalisiertes Willkommens-Dashboard generieren und auf den Desktop der Ziel-PCs verteilen.
        </p>
      </div>

      <div className="shrink-0 flex items-center gap-1 border-b border-border mb-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'overview' && <OnboardingOverview onDeploy={deployFor} onDeployExisting={deployExisting} />}
        {tab === 'deploy' && <DeployPanel initialSource={deploySource} />}
        {tab === 'map' && <MarkerEditor />}
        {tab === 'settings' && <OnboardingSettingsPanel />}
      </div>
    </div>
  )
}
