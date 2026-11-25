// ── Standard: gilt für alle ohne eigene Einstellung (auch beim allerersten Öffnen des Tools) ──
import { useEffect, useState } from 'react'
import { Save, Loader, RotateCcw, Globe } from 'lucide-react'
import { useMenuSichtbar } from '../../../store/menuSichtbarStore'
import { useAppStore } from '../../../store/appStore'
import { protokolliere } from '../../../services/aktivitaet'
import { speichereGlobal, speichereStandardBereiche } from '../../../services/benutzerRechte'
import type { MenuVisibility } from '../../../utils/menuVisibility'
import type { RechteDatei } from '../../../utils/sichtbarkeit'
import { Abschnitt, Hinweis, knopf, knopfLeise } from '../../teile'
import { StandardMenueListe } from './MenueListe'

const gleich = (a: MenuVisibility, b: MenuVisibility) =>
  JSON.stringify([...a.hidden].sort()) === JSON.stringify([...b.hidden].sort()) && JSON.stringify(Object.entries(a.minRole).sort()) === JSON.stringify(Object.entries(b.minRole).sort())

export default function StandardDetail({ datei, global, ohneEigene, onGespeichert }: {
  datei: RechteDatei; global: MenuVisibility; ohneEigene: number; onGespeichert: (datei?: RechteDatei) => Promise<void> | void
}) {
  const neuLaden = useMenuSichtbar(s => s.neuLaden)
  const setHidden = useAppStore(s => s.setHiddenMenuIds)
  const setMinRole = useAppStore(s => s.setMenuMinRole)
  const [g, setG] = useState<MenuVisibility>(global)
  const [b, setB] = useState<Record<string, string[]>>(datei.standard.bereiche)
  const [speichert, setSpeichert] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { setG(global); setB(datei.standard.bereiche) }, [global, datei])

  const geaendert = !gleich(g, global) || JSON.stringify(b) !== JSON.stringify(datei.standard.bereiche)

  async function speichern() {
    setSpeichert(true); setMeldung(null)
    try {
      if (!gleich(g, global)) {
        if (!(await speichereGlobal(g))) throw new Error('Regeln für alle konnten nicht gespeichert werden.')
        setHidden(g.hidden); setMinRole(g.minRole)
        protokolliere({ art: 'manuell', quelle: 'Benutzer & Rechte', aktion: 'Standard-Menüpunkte geändert', ergebnis: `${g.hidden.size} aus, ${Object.keys(g.minRole).length} mit Mindest-Rolle` })
      }
      let neu: RechteDatei | undefined
      if (JSON.stringify(b) !== JSON.stringify(datei.standard.bereiche)) {
        const r = await speichereStandardBereiche(b)
        if (!r.ok) throw new Error(r.error || 'Unterbereiche konnten nicht gespeichert werden.')
        neu = r.datei
        protokolliere({ art: 'manuell', quelle: 'Benutzer & Rechte', aktion: 'Standard-Unterbereiche geändert', ergebnis: Object.entries(b).map(([m, k]) => `${m}: ${k.join(', ')}`).join(' · ') || 'alle sichtbar' })
      }
      neuLaden()
      setMeldung({ ok: true, text: 'Gespeichert. Gilt bei allen ohne eigene Einstellung spätestens nach 5 Minuten.' })
      await onGespeichert(neu)
    } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : String(e) }) } finally { setSpeichert(false) }
  }

  return (
    <div className="space-y-4" data-standard-detail>
      <div className="flex items-start gap-3">
        <span className="es-symbol es-symbol-alle"><Globe size={18} /></span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Standard</h2>
          <p className="text-xs text-muted-foreground">Gilt für alle ohne eigene Einstellung ({ohneEigene} {ohneEigene === 1 ? 'Konto' : 'Konten'}) – und für jeden, der das Tool zum ersten Mal öffnet. Wer neu ist, startet als „Benutzer“.</p>
        </div>
      </div>
      <Hinweis>Je Menüpunkt: <strong>Für alle</strong>, <strong>Ab Admin</strong>, <strong>Nur Master</strong> oder <strong>Aus</strong>. Punkte mit „ab Admin (fest)“ sind im Tool fest für Admins – daran hängen Hintergrund-Abläufe. Unterbereiche klappen mit der Zahl rechts auf.</Hinweis>
      <Abschnitt titel="Menüpunkte und Bereiche">
        <StandardMenueListe global={g} onGlobal={setG} bereiche={b} onBereiche={setB} />
      </Abschnitt>
      <div className="sticky bottom-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur border-t border-border flex items-center gap-2 flex-wrap">
        <button onClick={() => void speichern()} disabled={!geaendert || speichert} className={knopf} data-standard-speichern>{speichert ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}Speichern</button>
        <button onClick={() => { setG(global); setB(datei.standard.bereiche) }} disabled={!geaendert || speichert} className={knopfLeise}><RotateCcw size={13} />Verwerfen</button>
        {geaendert && !speichert && <span className="text-xs es-warn">Nicht gespeichert</span>}
        {meldung && <span className={`text-xs ${meldung.ok ? 'es-ok' : 'es-fehler'}`}>{meldung.text}</span>}
      </div>
    </div>
  )
}
