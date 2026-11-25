// Parla Italiano — Einstellungen: Ton, Schreiben, eigene Daten.
import { useState } from 'react'
import { BellRing, Headphones, Keyboard, Lock, ShieldCheck, Snail, Trash2 } from 'lucide-react'
import { useItaliano } from '../kern/speicher'
import { entferneEintrag } from '../kern/gruppe'

function Schalter({ feld, titel, text, Symbol }: { feld: 'ton' | 'langsam' | 'tippen' | 'erinnerung'; titel: string; text: string; Symbol: typeof Lock }) {
  const wert = useItaliano(s => s.daten.einstellungen[feld])
  const setze = useItaliano(s => s.setzeEinstellung)
  return (
    <label className="pi-zeile" style={{ cursor: 'pointer' }}>
      <span className="pi-symbol pi-symbol-blau"><Symbol size={18} /></span>
      <span style={{ flex: 1 }}><b>{titel}</b><span className="pi-leise pi-klein" style={{ display: 'block' }}>{text}</span></span>
      <input type="checkbox" checked={!!wert} onChange={e => setze(feld, e.target.checked)} data-pi-schalter={feld} style={{ width: 18, height: 18 }} />
    </label>
  )
}

/** ab wann die Erinnerung frühestens kommt */
function ErinnerungsZeit() {
  const an = useItaliano(s => s.daten.einstellungen.erinnerung !== false)
  const um = useItaliano(s => s.daten.einstellungen.erinnerungUm || '11:30')
  const setze = useItaliano(s => s.setzeEinstellung)
  return (
    <label className="pi-zeile" style={{ opacity: an ? 1 : 0.5 }}>
      <span style={{ width: 38 }} />
      <span style={{ flex: 1 }}><b>Frühestens um</b><span className="pi-leise pi-klein" style={{ display: 'block' }}>Zum Beispiel kurz vor der Mittagspause.</span></span>
      <input type="time" className="pi-eingabe" style={{ width: 120, fontSize: 15, padding: '6px 10px', fontFamily: 'var(--pi-schrift)' }} value={um} disabled={!an} onChange={e => { if (/^dd:dd$/.test(e.target.value)) setze('erinnerungUm', e.target.value) }} data-pi-erinnerung-um />
    </label>
  )
}

export default function Einstellungen() {
  const benutzer = useItaliano(s => s.benutzer)
  const verschluesselung = useItaliano(s => s.verschluesselung)
  const speicherFehler = useItaliano(s => s.speicherFehler)
  const loescheAlles = useItaliano(s => s.loescheAlles)
  const [fragt, setFragt] = useState(false)
  const [geloescht, setGeloescht] = useState(false)

  const loesche = async () => {
    await loescheAlles()
    await entferneEintrag(benutzer)
    setFragt(false); setGeloescht(true)
  }

  return (
    <div className="pi-schmal pi-spalte" data-pi-einstellungen>
      <h1 className="pi-h1">Einstellungen</h1>

      <div className="pi-karte" style={{ padding: 8 }}>
        <Schalter feld="ton" titel="Ton" text="Wörter und Dialoge anhören, dazu Hör-Aufgaben. Aus fürs Großraumbüro – dann gibt es stattdessen Lese-Aufgaben." Symbol={Headphones} />
        <Schalter feld="langsam" titel="Langsamer sprechen" text="Spielt alles etwas langsamer ab." Symbol={Snail} />
        <Schalter feld="tippen" titel="Schreib-Aufgaben" text="Wörter und Sätze selbst tippen. Aus: nur auswählen und zuordnen." Symbol={Keyboard} />
      </div>

      <div className="pi-karte" style={{ padding: 8 }}>
        <Schalter feld="erinnerung" titel="Tägliche Erinnerung" text="Ein kleiner Hinweis im Tool, wenn die Lektion von heute noch offen ist – höchstens einmal am Tag." Symbol={BellRing} />
        <ErinnerungsZeit />
      </div>

      <div className="pi-karte pi-spalte">
        <div className="pi-reihe"><span className="pi-symbol pi-symbol-gruen"><ShieldCheck size={18} /></span><h2 className="pi-h2">Wer sieht was?</h2></div>
        <ul className="pi-liste">
          <li><b>Für alle sichtbar:</b> dein Name, dein Level und seit wann du es hast (Reisegruppe).</li>
          <li><b>Nur für dich:</b> Lernstand, Testergebnisse, Fehler, Serie und Lernzeiten. {verschluesselung
            ? 'Sie liegen ausschließlich auf diesem PC und sind mit deinem Windows-Konto verschlüsselt – kein Kollege und kein Administrator kann sie lesen.'
            : 'Auf diesem PC ist keine Verschlüsselung verfügbar; deshalb wird nichts gespeichert und der Lernstand gilt nur für diese Sitzung.'}</li>
          <li>An einem anderen PC fehlt der Lernstand. Dort kannst du bei deinem Level weitermachen.</li>
        </ul>
        {speicherFehler && <p className="pi-karte-flach" style={{ color: 'var(--pi-schlecht)' }} role="alert">Speichern hat nicht geklappt: {speicherFehler}</p>}
      </div>

      <div className="pi-karte pi-spalte">
        <div className="pi-reihe"><span className="pi-symbol" style={{ background: 'var(--pi-schlecht-weich)', color: 'var(--pi-schlecht)' }}><Trash2 size={18} /></span><h2 className="pi-h2">Alle meine Daten löschen</h2></div>
        <p className="pi-leise">Entfernt deinen Lernstand von diesem PC und deinen Eintrag aus der Reisegruppe. Das lässt sich nicht rückgängig machen – du beginnst wieder bei Level 1.</p>
        {geloescht ? <p className="pi-karte-flach" data-pi-geloescht>Erledigt. Dein Lernstand und dein Eintrag in der Reisegruppe sind gelöscht.</p>
          : fragt ? (
            <div className="pi-reihe">
              <button type="button" className="pi-knopf pi-knopf-leise" onClick={() => setFragt(false)}>Abbrechen</button>
              <button type="button" className="pi-knopf" style={{ background: 'var(--pi-schlecht)', color: '#fff' }} onClick={() => void loesche()} data-pi-loeschen-ja>Ja, alles löschen</button>
            </div>
          ) : <div><button type="button" className="pi-knopf pi-knopf-leise" onClick={() => setFragt(true)} data-pi-loeschen>Daten löschen …</button></div>}
      </div>

      <div className="pi-karte pi-spalte" style={{ gap: 8 }}>
        <h2 className="pi-h2">Gut zu wissen</h2>
        <ul className="pi-liste pi-leise">
          <li>Der Kurs führt bis zum Einstieg in B1: kleine Gespräche führen, vieles im Alltag verstehen. Ein offizielles Zertifikat ersetzt er nicht.</li>
          <li>Sprechen übst du durch lautes Nachsprechen – das Tool hört nicht zu und bewertet deine Aussprache nicht.</li>
          <li>Die Stimmen sind computererzeugt. Texte und Übungen wurden sorgfältig geschrieben und gegengelesen, aber nicht von einem Muttersprachler geprüft.</li>
        </ul>
      </div>
    </div>
  )
}
