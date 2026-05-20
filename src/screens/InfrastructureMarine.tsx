import { useState } from 'react'
import { Shield, AlertTriangle, KeyRound, Printer, UserPlus, Activity } from 'lucide-react'
import IncidentResponse from '../components/infra/IncidentResponse'
import PermissionsOverview from '../components/infra/PermissionsOverview'
import TonerOrder from '../components/infra/TonerOrder'
import VisitorRegistration from '../components/infra/VisitorRegistration'
import ServerPerformanceCheck from '../components/infra/ServerPerformanceCheck'

type Section = 'incident-response' | 'permissions' | 'toner' | 'visitor' | 'server-perf'

const SECTIONS: Array<{ id: Section; label: string; icon: typeof AlertTriangle }> = [
  { id: 'incident-response', label: 'Incident Response', icon: AlertTriangle },
  { id: 'permissions', label: 'Berechtigungen beantragen', icon: KeyRound },
  { id: 'toner', label: 'Tonerbestellung', icon: Printer },
  { id: 'visitor', label: 'Externe Besucher', icon: UserPlus },
  { id: 'server-perf', label: 'Server Performance', icon: Activity },
]

export default function InfrastructureMarine() {
  const [activeSection, setActiveSection] = useState<Section>('incident-response')

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6">
      <div className="flex items-center gap-3 mb-4">
        <Shield size={28} className="text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Infrastruktur Marine</h1>
          <p className="text-sm text-muted-foreground">Internal infrastructure reference for SKF Marine Hamburg</p>
        </div>
      </div>

      <div className="flex gap-1 bg-muted/30 rounded-lg p-1 mb-5 shrink-0 overflow-x-auto">
        {SECTIONS.map(s => {
          const isActive = activeSection === s.id
          const Icon = s.icon
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-card text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon size={14} />
              {s.label}
            </button>
          )
        })}
      </div>

      {activeSection === 'incident-response' && <IncidentResponse />}
      {activeSection === 'permissions' && <PermissionsOverview />}
      {activeSection === 'toner' && <TonerOrder />}
      {activeSection === 'visitor' && <VisitorRegistration />}
      {activeSection === 'server-perf' && <ServerPerformanceCheck />}
    </div>
  )
}
