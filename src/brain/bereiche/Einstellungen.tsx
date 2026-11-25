// Einstellungen: Speichern an/aus, Wochenziel, alle eigenen Daten löschen — und die ehrlichen Hinweise
// (wer sieht was, was kann der IQ-Test, was bringt Training).
import { useState } from 'react'
import { Info, Lock, Minus, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useBrain } from '../kern/speicher'

export default function Einstellungen(_p: Record<string, never>) {
  const zustimmung = useBrain(s => s.zustimmung)
  const verschluesselung = useBrain(s => s.verschluesselung)
  const fehler = useBrain(s => s.speicherFehler)
  const daten = useBrain(s => s.daten)
  const setzeZustimmung = useBrain(s => s.setzeZustimmung)
  const setze = useBrain(s => s.setzeEinstellung)
  const loescheAlles = useBrain(s => s.loescheAlles)
  const [frage, setFrage] = useState<null | 'aus' | 'loeschen'>(null)
  const [erledigt, setErledigt] = useState('')

  const ziel = daten.einstellungen.wochenziel
  const hatDaten = daten.laeufe.length > 0 || daten.iq.length > 0 || daten.duelle.length > 0

  return (
    <div className="bt-breite" style={{ maxWidth: 820 }} data-bt-bereich="einstellungen">
      <h1 className="bt-h1" style={{ marginBottom: 18 }}>Einstellungen</h1>

      <section className="bt-karte" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span className="bt-symbol"><Lock size={18} /></span>
          <h2 className="bt-h2">Deine Daten</h2>
        </div>

        <div className="bt-zeile">
          <div style={{ flex: 1 }}>
            <div className="bt-h3">Fortschritt speichern</div>
            <div className="bt-klein bt-leise">
              {verschluesselung
                ? 'Nur auf diesem PC, verschlüsselt mit deinem Windows-Konto. Niemand außer dir sieht deine Ergebnisse — nichts davon liegt auf dem Netzlaufwerk.'
                : 'Auf diesem PC steht die Verschlüsselung von Windows nicht zur Verfügung. Deshalb wird nichts gespeichert.'}
            </div>
          </div>
          <button type="button" role="switch" aria-checked={zustimmung === true} aria-label="Fortschritt speichern" className="bt-schalter" disabled={!verschluesselung}
            onClick={() => { if (zustimmung === true) setFrage('aus'); else void setzeZustimmung(true) }} data-bt-speichern-schalter />
        </div>
        {frage === 'aus' && (
          <div className="bt-hinweis" style={{ marginBottom: 12, flexDirection: 'column', background: 'var(--bt-schlecht-weich)' }} data-bt-frage-aus>
            <span><b>Speichern ausschalten?</b> Die gespeicherte Datei wird gelöscht. Dein heutiger Stand bleibt nur noch bis zum Schließen des Tools erhalten.</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="bt-knopf bt-knopf-gefahr" onClick={() => { void setzeZustimmung(false); setFrage(null) }} data-bt-aus-ja>Ja, ausschalten und Datei löschen</button>
              <button type="button" className="bt-knopf bt-knopf-leise" onClick={() => setFrage(null)}>Abbrechen</button>
            </span>
          </div>
        )}
        {fehler && <div className="bt-klein" style={{ color: 'var(--bt-schlecht)', marginBottom: 10 }}>Speichern hat nicht geklappt: {fehler}</div>}

        <div className="bt-zeile">
          <div style={{ flex: 1 }}>
            <div className="bt-h3">Alle meine Daten löschen</div>
            <div className="bt-klein bt-leise">
              {hatDaten ? `${daten.laeufe.length} Durchgänge, ${daten.iq.length} IQ-Tests, ${daten.duelle.length} Duelle, Serie und Abzeichen — alles weg, nicht rückholbar.` : 'Es gibt noch nichts zu löschen.'}
            </div>
          </div>
          <button type="button" className="bt-knopf bt-knopf-gefahr" disabled={!hatDaten} onClick={() => setFrage('loeschen')} data-bt-loeschen><Trash2 size={15} />Löschen</button>
        </div>
        {frage === 'loeschen' && (
          <div className="bt-hinweis" style={{ flexDirection: 'column', background: 'var(--bt-schlecht-weich)' }} data-bt-frage-loeschen>
            <span><b>Wirklich alles löschen?</b> Das lässt sich nicht rückgängig machen. Ein selbst veröffentlichter Eintrag in der Bestenliste bleibt davon unberührt — den entfernst du unter „Duelle“.</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="bt-knopf bt-knopf-gefahr" onClick={() => { void loescheAlles().then(() => setErledigt('Alle Daten gelöscht.')); setFrage(null) }} data-bt-loeschen-ja>Ja, alles löschen</button>
              <button type="button" className="bt-knopf bt-knopf-leise" onClick={() => setFrage(null)}>Abbrechen</button>
            </span>
          </div>
        )}
        {erledigt && <div className="bt-klein" style={{ color: 'var(--bt-gut)' }} data-bt-erledigt>{erledigt}</div>}
      </section>

      <section className="bt-karte" style={{ marginBottom: 16 }}>
        <div className="bt-zeile">
          <div style={{ flex: 1 }}>
            <div className="bt-h3">Wochenziel</div>
            <div className="bt-klein bt-leise">An wie vielen Tagen pro Woche möchtest du üben? Lieber kurz und regelmäßig als selten und lang.</div>
          </div>
          <button type="button" className="bt-knopf bt-knopf-leise" onClick={() => setze('wochenziel', Math.max(1, ziel - 1))} disabled={ziel <= 1} aria-label="Ein Tag weniger"><Minus size={15} /></button>
          <span className="bt-zahl" style={{ fontSize: 22, minWidth: 74, textAlign: 'center' }} data-bt-wochenziel>{ziel} {ziel === 1 ? 'Tag' : 'Tage'}</span>
          <button type="button" className="bt-knopf bt-knopf-leise" onClick={() => setze('wochenziel', Math.min(7, ziel + 1))} disabled={ziel >= 7} aria-label="Ein Tag mehr"><Plus size={15} /></button>
        </div>
      </section>

      <section className="bt-karte">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span className="bt-symbol"><Info size={18} /></span>
          <h2 className="bt-h2">Gut zu wissen</h2>
        </div>
        <ul className="bt-liste">
          <li><b>Was Training bringt:</b> Die Übungen stammen aus der Kognitionsforschung (z. B. N-Back, Stroop, mentale Rotation, Matrizen). Sicher ist: Was man übt, darin wird man besser — schneller, genauer, auf höheren Stufen. Wie stark sich das auf andere Aufgaben und den Alltag überträgt, ist in der Forschung umstritten. Am meisten hilft Abwechslung und Regelmäßigkeit.</li>
          <li><b>Was der IQ-Test kann:</b> Er nutzt die Aufgabenarten gängiger Tests, die übliche Skala (Mittel 100, Streuung 15) und ein adaptives Auswertungsverfahren. Er ist aber nicht an tausenden Personen geeicht wie ein offizieller Test. Das Ergebnis ist eine Orientierung mit ausgewiesenem Bereich und ersetzt keinen Test bei einer Fachperson.</li>
          <li><b>Was andere sehen:</b> Nichts — außer du teilst selbst etwas (ein IQ-Ergebnis im Chat oder in der Bestenliste) oder spielst ein Duell. Im Duell sieht dein Gegner deinen Punktestand in diesem Duell.</li>
          <li><b>Brain-Punkte:</b> Jede Stufe ist 100 Punkte wert, die Güte deines Durchgangs füllt die Stufe. Stufe 10 fehlerfrei und zügig ergibt 1000.</li>
        </ul>
        <div className="bt-klein bt-stumm" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={13} />Karten: Natural Earth (gemeinfrei) · Schrift: Space Grotesk (SIL Open Font License)</div>
      </section>
    </div>
  )
}
