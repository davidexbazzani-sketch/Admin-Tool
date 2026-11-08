// ── Startseite: „Gib dein Problem ein“ ───────────────────────────────────────
// Der frühere Startbildschirm (Einzelabfrage, Datei-Import, Liste, Benutzer-Suche) heißt jetzt
// „Massenabfragen“ und liegt unter Infrastruktur. Werkzeuge der PC-Diagnose (Netzwerkdiagnose,
// SAP-Fehlersuche, Überwachung …) öffnen die PC-Diagnose und starten dort das gewünschte Werkzeug.
import ProblemAssistent from '../problemAssistent/ProblemAssistent'
import { useAppStore } from '../store/appStore'

/** Werkzeuge, die innerhalb der PC-Diagnose laufen. */
const IN_PC_DIAGNOSE = new Set(['netzdiagnose', 'sap-fehlersuche', 'solidworks-diagnose', 'voll-diagnose', 'ueberwachung'])

export function oeffneWerkzeug(id: string, host: string) {
  const st = useAppStore.getState()
  if (IN_PC_DIAGNOSE.has(id)) { st.setPcDiagnoseWunsch({ werkzeug: id, host }); st.setScreen('pc-diagnosis'); return }
  if (id === 'remote-doc') { if (host) st.setDevices([{ id: 'pa_' + Date.now().toString(36), type: 'hostname', value: host, resolvedHostnames: [host] }]); st.setScreen('remote-doc'); return }
  const ziel: Record<string, Parameters<typeof st.setScreen>[0]> = {
    treiber: 'treiber-installation', software: 'software-installations', deinstallation: 'support-tools', drucker: 'drucker', 'drucker-uebersicht': 'drucker-uebersicht',
  }
  if (ziel[id]) st.setScreen(ziel[id])
}

export default function Startseite() {
  return (
    <div className="h-full overflow-y-auto p-6" data-startseite>
      <div className="max-w-4xl mx-auto">
        <ProblemAssistent onWerkzeug={oeffneWerkzeug} />
      </div>
    </div>
  )
}
