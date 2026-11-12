// ── „Gib dein Problem ein“ → optional: Liegt es an fehlenden Berechtigungen? ──
// Bei Problemen, die durch fehlende Rechte entstehen können (Zugriff verweigert, Lizenz, Homeoffice,
// Postfach, Adminrechte, Programm fehlt …), wird ein Abgleich aller AD-Gruppen mit den Kollegen
// angeboten (Baustein „rechte-alle-vergleich“, läuft am Admin-PC – auch wenn der PC nicht erreichbar ist).
// Nur lesend; zeigt je fehlender Gruppe Fehlerbild und ServiceNow-Antrag.
import { useState } from 'react'
import { ShieldQuestion, Loader2, ChevronDown, ChevronRight, XCircle } from 'lucide-react'
import { aktion } from './aktionen'
import { fuehreAus, type PaVerbindung } from './motor'
import type { PaProblem } from './types'
import { W3172_ANTRAG, W3172_STAND, w3172AuskunftText } from './w3172Ordner'

const MUSTER = /berechtig|zugriff verweigert|access denied|keine rechte|rechte fehl|nicht lizenz|lizenz|licen|homeoffice|zuhause|zu hause|zpa|admin(istrator)?rechte|adminrechte|gruppenpostfach|postfach fehlt|im auftrag|senden als|freigabe|ordner|laufwerk|nicht sichtbar|fehlt im startmen|unternehmensportal|neuer mitarbeiter|neue mitarbeiterin|kollege|onboarding|copilot|power ?bi|citrix|keine apps|sap|enaio|babtec|anmeldung abgelehnt|not authorized|unauthorized|forbidden|403/i

/** Ordner auf I: / \\W3172\SKF Marine nachschlagen: welche Gruppe gibt ihn frei? (aus dem Berechtigungs-Abzug, sofort, ohne AD) */
function OrdnerAuskunft() {
  const [pfad, setPfad] = useState('')
  const zeilen = pfad.trim() ? w3172AuskunftText(pfad) : []
  const mitAntrag = zeilen.some(z => z.startsWith('Antrag:'))
  return (
    <div className="space-y-1.5 pt-1 border-t border-border/60" data-ordner-auskunft>
      <label className="block text-[11px] text-muted-foreground">
        Ordner nachschlagen (I: bzw. \\W3172\SKF Marine – Stand Berechtigungs-Abzug {W3172_STAND}):
        <input value={pfad} onChange={e => setPfad(e.target.value)} placeholder="z. B. I:\0200 Products\220 Stabilizer"
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground font-mono" />
      </label>
      {zeilen.length > 0 && (
        <div className="text-[11px] leading-relaxed space-y-0.5 text-foreground">
          {zeilen.map((z, i) => <p key={i} className={z.startsWith('⚠') ? 'text-amber-700 dark:text-amber-300' : ''}>{z}</p>)}
          {mitAntrag && (
            <button onClick={() => { void import('../serviceNowWelt/oeffnen').then(m => m.oeffneSnEintrag(W3172_ANTRAG)) }}
              className="mt-1 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10">
              Antrag „{W3172_ANTRAG}“ öffnen
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Soll der Berechtigungs-Abgleich angeboten werden? */
export function rechteRelevant(p: PaProblem): boolean {
  if (p.schritte.some(s => s.aktion === 'rechte-alle-vergleich')) return false
  return MUSTER.test([p.titel, p.stichworte.join(' '), p.ursache].join(' '))
}

export default function RechteCheck({ host, verb, ersatz }: { host: string; verb: PaVerbindung | null; ersatz?: { sam: string; name: string } | null }) {
  const [offen, setOffen] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [zeilen, setZeilen] = useState<string[] | null>(null)
  const [fehler, setFehler] = useState('')
  const sam = verb?.benutzer || (ersatz ? ersatz.sam : '')
  const wer = verb?.benutzer || (ersatz ? `${ersatz.name} (zugewiesen)` : '')

  async function pruefe() {
    const a = aktion('rechte-alle-vergleich')
    if (!a) { setFehler('Baustein fehlt.'); return }
    setLaeuft(true); setFehler(''); setZeilen(null)
    const r = await fuehreAus(host || 'lokal', a, '', { sam })
    setZeilen(r.zeilen)
    if (!r.ok) setFehler(r.fehler || 'Prüfung fehlgeschlagen')
    setLaeuft(false)
  }

  return (
    <div className="rounded-md border border-dashed border-amber-500/50 px-3 py-2 space-y-2" data-rechte-check>
      <button onClick={() => setOffen(!offen)} className="w-full flex items-center gap-2 text-left">
        <ShieldQuestion size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-foreground">Optional: Liegt es an fehlenden Berechtigungen? (Vergleich mit den Kollegen, ca. 1 Minute)</span>
          <span className="block text-[11px] text-muted-foreground">Vergleicht alle AD-Gruppen des Benutzers mit seinen Abteilungskollegen und zeigt fehlende – mit Fehlerbild und passendem ServiceNow-Antrag. Liest nur, geht auch, wenn der PC nicht erreichbar ist.</span>
        </span>
        {offen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {offen && (
        <div className="space-y-2 pl-6">
          {!laeuft && (
            <button onClick={() => { void pruefe() }} disabled={!sam} data-rechte-pruefen className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-500/50 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-500/10 disabled:opacity-50">
              <ShieldQuestion size={13} />{zeilen ? 'Erneut prüfen' : `Berechtigungen von ${wer || '…'} prüfen`}
            </button>
          )}
          {!sam && <p className="text-[11px] text-muted-foreground">Kein Benutzer bekannt: Niemand ist angemeldet und dem PC ist keine eindeutige Person zugeordnet.</p>}
          {laeuft && <p className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Gruppen des Benutzers und der Kollegen werden im AD verglichen …</p>}
          {fehler && <p className="text-xs text-red-600 dark:text-red-400 inline-flex items-center gap-1.5"><XCircle size={13} />{fehler}</p>}
          {zeilen && (
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono bg-muted/40 rounded p-2 text-foreground">{zeilen.join('\n')}</pre>
          )}
          <OrdnerAuskunft />
        </div>
      )}
    </div>
  )
}
