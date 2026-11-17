// ── Startseite: „Gib dein Problem ein“ ───────────────────────────────────────
// Der frühere Startbildschirm (Einzelabfrage, Datei-Import, Liste, Benutzer-Suche) heißt jetzt
// „Massenabfragen“ und liegt unter Infrastruktur. Werkzeuge der PC-Diagnose (Komplett-Diagnose,
// Netzwerkdiagnose, SAP-Fehlersuche, Überwachung …) öffnen die PC-Diagnose und starten dort das
// gewünschte Werkzeug — bei der Komplett-Diagnose mit dem eingetippten Text als Richtung.
import ProblemAssistent from '../problemAssistent/ProblemAssistent'
import { useAppStore } from '../store/appStore'

/** Werkzeuge, die innerhalb der PC-Diagnose laufen. */
const IN_PC_DIAGNOSE = new Set(['netzdiagnose', 'sap-fehlersuche', 'solidworks-diagnose', 'voll-diagnose', 'ueberwachung'])

export function oeffneWerkzeug(id: string, host: string, text?: string) {
  const st = useAppStore.getState()
  if (IN_PC_DIAGNOSE.has(id)) { st.setPcDiagnoseWunsch({ werkzeug: id, host, text }); st.setScreen('pc-diagnosis'); return }
  if (id === 'remote-doc') { if (host) st.setDevices([{ id: 'pa_' + Date.now().toString(36), type: 'hostname', value: host, resolvedHostnames: [host] }]); st.setScreen('remote-doc'); return }
  if (id === 'server-zustand' || id === 'server-zertifikate') {
    void import('../store/serverEreignisStore').then(m => { if (host) m.useServerEreignisStore.getState().setOeffneHost(host, id === 'server-zertifikate' ? 'zertifikate' : 'status') })
    st.setScreen('server'); return
  }
  const ziel: Record<string, Parameters<typeof st.setScreen>[0]> = {
    treiber: 'treiber-installation', software: 'software-installations', 'vc-redist': 'software-installations', deinstallation: 'support-tools',
    drucker: 'drucker', 'drucker-uebersicht': 'drucker-uebersicht', backups: 'backups',
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
