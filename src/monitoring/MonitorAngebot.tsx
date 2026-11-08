// Angebot nach einer Behebung: „Jetzt überwachen, ob der Fehler wiederkommt“.
import { Activity } from 'lucide-react'
import { useMonitorDialog } from '../store/monitorDialogStore'

export default function MonitorAngebot({ host, serial, person, vorschlag, anlass, klein }: {
  host: string; serial?: string; person?: string; vorschlag: string[]; anlass?: string; klein?: boolean
}) {
  const oeffne = useMonitorDialog(s => s.oeffne)
  if (!host) return null
  const los = () => oeffne({ host, serial, person, kontrollen: vorschlag, anlass })
  if (klein) return (
    <button onClick={los} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10" data-monitor-angebot>
      <Activity size={13} />Überwachen, ob es wiederkommt
    </button>
  )
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5" data-monitor-angebot>
      <Activity size={18} className="text-primary shrink-0" />
      <div className="min-w-0 text-xs">
        <p className="font-semibold text-foreground">Jetzt überwachen, ob der Fehler wiederkommt?</p>
        <p className="text-muted-foreground">Meldet dir per Chat (optional Mail), sobald er wieder auftritt — und am Ende eine Zusammenfassung mit Ursache.</p>
      </div>
      <button onClick={los} className="ml-auto shrink-0 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">Überwachung einrichten</button>
    </div>
  )
}
