// Der Coach — Einstellungen: Ton, Dauer, Tage, Bereiche und Schwerpunkte, Staffel, Erinnerung, laut üben, ohne Zeitdruck,
// Mikrofon, Diskret-Modus, Daten (Export, Import, Löschen). Alles jederzeit änderbar; abgewählte Bereiche behalten ihren Stand.
import { useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import type { BereichId, SchwerpunktId, Ton } from '../kern/inhaltTypen'
import type { InhaltsIndex } from '../kern/index'
import type { Profil } from '../kern/typen'
import { useCoach } from '../kern/speicher'
import { pflegeStaffel } from '../kern/kurs'
import { heute, tagNummer, WT_KURZ } from '../kern/zeit'
import { host } from '../host/aktiv'
import { BereichWahl } from './BereichWahl'

export function Einstellungen({ index }: { index: InhaltsIndex }) {
  const p = useCoach(s => s.daten.profil)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [loeschen, setLoeschen] = useState(false)
  const setze = <K extends keyof Profil>(k: K, v: Profil[K]) => useCoach.getState().aendere(d => {
    const n = { ...d, profil: { ...d.profil, [k]: v } }
    return k === 'bereiche' || k === 'schwerpunkte' || k === 'staffel' || k === 'dauer' ? { ...n, kurse: pflegeStaffel(n, index, tagNummer(heute())) } : n
  })
  const schalter = (k: 'lautUeben' | 'ohneZeitdruck' | 'mikrofon' | 'aufnahmenBehalten' | 'klang' | 'diskret' | 'bewegung' | 'mutproben', titel: string, text: string) => (
    <label className="dc-schalter" style={{ alignItems: 'flex-start' }}><input type="checkbox" checked={p[k]} onChange={e => setze(k, e.target.checked)} data-dc-schalter={k} /><span><b>{titel}</b><span className="dc-klein dc-leise" style={{ display: 'block' }}>{text}</span></span></label>
  )
  const exportiere = async () => { const ok = await host().speichereDatei(`der-coach-${heute()}.json`, useCoach.getState().exportiere()); setMeldung(ok ? 'Export gespeichert.' : null) }
  const importiere = async () => { const t = await host().ladeDatei(); if (!t) return; const f = await useCoach.getState().importiere(t); setMeldung(f ?? 'Import übernommen. Der bisherige Stand liegt beiseite.') }
  return (
    <div className="dc-breit dc-spalte" data-dc-einstellungen>
      <h1 className="dc-h1">Einstellungen</h1>
      <div className="dc-karte dc-spalte">
        <h2 className="dc-h2">Bruno und du</h2>
        <div className="dc-reihe">{(['ruhig', 'klar', 'trocken'] as Ton[]).map(t => <button key={t} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: p.ton === t ? 'var(--dc-rot)' : undefined, color: p.ton === t ? 'var(--dc-ink)' : undefined }} aria-pressed={p.ton === t} onClick={() => setze('ton', t)}>{t === 'ruhig' ? 'Ruhig' : t === 'klar' ? 'Klar' : 'Trocken'}</button>)}</div>
        <label className="dc-spalte" style={{ gap: 4 }}><b>Anrede</b><input className="dc-eingabe" value={p.name} onChange={e => setze('name', e.target.value.slice(0, 40))} placeholder="Vorname oder leer" /></label>
      </div>
      <div className="dc-karte dc-spalte">
        <h2 className="dc-h2">Zeit</h2>
        <div className="dc-reihe">{([10, 15, 30] as const).map(m => <button key={m} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: p.dauer === m ? 'var(--dc-rot)' : undefined }} aria-pressed={p.dauer === m} onClick={() => setze('dauer', m)}>{m} Minuten</button>)}</div>
        <div className="dc-reihe" style={{ gap: 4 }}>{[1, 2, 3, 4, 5, 6, 7].map(t => <button key={t} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: p.tage.includes(t) ? 'var(--dc-gelb)' : undefined }} aria-pressed={p.tage.includes(t)} onClick={() => setze('tage', p.tage.includes(t) ? p.tage.filter(x => x !== t) : [...p.tage, t].sort())}>{WT_KURZ[t]}</button>)}</div>
        <label className="dc-reihe"><b>Bereiche gleichzeitig im Training</b>
          <select className="dc-eingabe" style={{ width: 'auto' }} value={p.staffel} onChange={e => setze('staffel', Number(e.target.value))} data-dc-staffel>
            <option value={0}>nach Tagesdauer (3 / 4 / 6)</option>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}<option value={99}>alle gleichzeitig</option>
          </select></label>
        <span className="dc-klein dc-stumm">Bei vielen Bereichen gleichzeitig kommt jeder seltener dran – Lektion und Übung liegen dann weiter auseinander.</span>
      </div>
      <div className="dc-karte dc-spalte">
        <h2 className="dc-h2">Bereiche</h2>
        <BereichWahl index={index} gewaehlt={p.bereiche} setGewaehlt={(b: BereichId[]) => setze('bereiche', b)} schwerpunkte={p.schwerpunkte} setSchwerpunkte={(s: SchwerpunktId[]) => { setze('schwerpunkte', s); if (s.includes('stottern')) setze('ohneZeitdruck', true) }} />
      </div>
      <div className="dc-karte dc-spalte">
        <h2 className="dc-h2">Üben</h2>
        {schalter('lautUeben', 'Ich kann gerade laut sprechen', 'Aus: Bruno plant stille Übungen; laute kommen auf die Liste „Später laut“.')}
        {schalter('ohneZeitdruck', 'Sprech-Übungen ohne Zeitdruck', 'Keine Stoppuhren, keine Tempo-Urteile. Zeitdruck-Runden laufen ohne Uhr.')}
        {schalter('mikrofon', 'Mikrofon anbieten', 'Aufnehmen ist immer freiwillig. Aufnahmen bleiben im Arbeitsspeicher und werden verworfen.')}
        {schalter('aufnahmenBehalten', 'Vergleichsaufnahmen behalten', 'Höchstens acht Aufnahmen von je 30 Sekunden, nur auf diesem PC und verschlüsselt – für den Vergleich „Tag 1“ gegen „Woche 8“.')}
        {schalter('mutproben', 'Mutproben anbieten', 'Freiwillige Aufgaben, bei denen du bewusst ein Nein riskierst – nur im Privatleben, legal und höflich.')}
        {schalter('bewegung', 'Bewegung', 'Kleine Animationen. Aus, wenn sie stören.')}
      </div>
      <div className="dc-karte dc-spalte">
        <h2 className="dc-h2">Erinnerung</h2>
        <label className="dc-schalter"><input type="checkbox" checked={p.erinnerung.an} onChange={e => setze('erinnerung', { ...p.erinnerung, an: e.target.checked })} />Ans Training erinnern ab <input type="time" className="dc-eingabe" style={{ width: 110, padding: '4px 8px' }} value={p.erinnerung.um} onChange={e => setze('erinnerung', { ...p.erinnerung, um: e.target.value })} /></label>
        <label className="dc-schalter"><input type="checkbox" checked={p.erinnerung.windows} onChange={e => setze('erinnerung', { ...p.erinnerung, windows: e.target.checked })} />Zusätzlich als Windows-Hinweis, wenn das Tool im Hintergrund ist (Text immer neutral)</label>
        {schalter('diskret', 'Diskret-Modus', 'Kachel und Erinnerung zeigen nur „Bruno hat etwas für dich“. Der Inhalt erscheint erst auf Klick.')}
      </div>
      <div className="dc-karte dc-spalte">
        <h2 className="dc-h2">Deine Daten</h2>
        <span className="dc-klein dc-leise">Alles liegt nur auf diesem PC, verschlüsselt mit deinem Windows-Konto. Für einen PC-Wechsel: exportieren und dort importieren.</span>
        <div className="dc-reihe">
          <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => void exportiere()}><Download size={15} />Exportieren</button>
          <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => void importiere()}><Upload size={15} />Importieren</button>
          {!loeschen ? <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => setLoeschen(true)}><Trash2 size={15} />Alles löschen</button>
            : <span className="dc-reihe"><span className="dc-klein">Wirklich alles löschen – Stand, Buch und Aufnahmen? Das lässt sich nicht rückgängig machen.</span><button type="button" className="dc-knopf" onClick={() => { void useCoach.getState().loescheAlles(); setLoeschen(false); setMeldung('Alles gelöscht.') }} data-dc-loeschen>Ja, löschen</button><button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => setLoeschen(false)}>Abbrechen</button></span>}
        </div>
        {meldung && <div className="dc-rueck">{meldung}</div>}
      </div>
    </div>
  )
}
