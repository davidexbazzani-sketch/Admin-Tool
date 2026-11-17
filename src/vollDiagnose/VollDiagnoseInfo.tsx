// ── „i“ zur Komplett-Diagnose: wofür, wie, wie lange (Startseite + PC-Diagnose) ──
import { useEffect, useRef, useState } from 'react'
import { Info, X } from 'lucide-react'

export const VOLLDIAGNOSE_DAUER = 'ca. 3–6 min, Tiefenprüfung optional 10–35 min'

export function VollDiagnoseInfo({ klein }: { klein?: boolean }) {
  const [offen, setOffen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!offen) return
    const zu = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOffen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false) }
    document.addEventListener('mousedown', zu); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', zu); document.removeEventListener('keydown', esc) }
  }, [offen])
  return (
    <div className="relative inline-flex" ref={ref}>
      <button type="button" onClick={e => { e.stopPropagation(); setOffen(o => !o) }} data-volldiagnose-info title="Was macht die Komplett-Diagnose?"
        className={`inline-flex items-center justify-center rounded-full border border-sky-500/50 text-sky-600 hover:bg-sky-500/10 ${klein ? 'w-4 h-4' : 'w-5 h-5'}`}>
        <Info size={klein ? 10 : 12} />
      </button>
      {offen && (
        <div className="absolute z-50 right-0 top-6 w-[26rem] max-w-[90vw] rounded-lg border border-border bg-card shadow-xl p-3.5 text-xs text-foreground space-y-2 text-left" data-volldiagnose-info-text onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2"><p className="text-sm font-semibold">Komplett-Diagnose (Volldiagnose)</p>
            <button onClick={() => setOffen(false)} className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground"><X size={13} /></button></div>
          <p><b>Wofür:</b> Wenn unklar ist, was mit einem PC los ist – nach Abstürzen und Bluescreens, wenn er „insgesamt spinnt“ oder langsam ist, oder um einen Server darauf zu prüfen, ob er sauber läuft.</p>
          <div>
            <p className="font-semibold">Ablauf</p>
            <ol className="list-decimal ml-4 space-y-0.5 text-muted-foreground">
              <li><span className="text-foreground">Richtung</span> (optional): eintippen oder Kategorie wählen – dann sucht die Diagnose gezielter.</li>
              <li><span className="text-foreground">Rundumscan</span>: alle Ereignisprotokolle, Abstürze, Bluescreens, Windows-Integrität (DISM CheckHealth, CBS), Updates, Datenträger, Dienste, Treiber, Netzwerk, Sicherheit und rund 60 Prüfungen der geführten Diagnose (am Server rund 20).</li>
              <li><span className="text-foreground">Vertiefung</span>: ist eine Ursache noch offen, laufen gezielte Scans im Bereich (Bluescreen-, Absturz-, Update-, Datenträger-Analyse) – bis die Ursache klar ist. Die Tiefenprüfung (DISM ScanHealth + SFC) startest du per Klick.</li>
              <li><span className="text-foreground">Ursachenbild</span>: was hängt womit zusammen, was ist nur Folgefehler.</li>
              <li><span className="text-foreground">Maßnahmenplan</span>: für jeden Befund ein Lösungsweg. <b>Eingegriffen wird erst, wenn du bestätigst</b> – danach prüft das Tool nach, ob es behoben ist.</li>
            </ol>
          </div>
          <p><b>Ändert nichts</b> beim Prüfen – Schritte 1–4 lesen nur. Netzwerk-, SAP- und SolidWorks-Themen übergibt sie per Klick an die passende Fachdiagnose.</p>
          <p><b>Dauer:</b> Rundumscan meist 3–6 Minuten, jede Vertiefung 20–60 Sekunden, Tiefenprüfung 10–35 Minuten (PC wird dabei spürbar langsamer). Du kannst das Menü wechseln – die Diagnose läuft weiter.</p>
        </div>
      )}
    </div>
  )
}
