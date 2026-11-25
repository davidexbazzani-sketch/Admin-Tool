// Terra Incognita — Einstellungen: Ton, Tempo, Name und Flagge, Sicherung, alles löschen.
import { useEffect, useState } from 'react'
import { saeubereName } from '../kern/namen'
import { neuereSicherung, sichereInsNetz, spieleHierWeiter, useGemeinsam, veroeffentliche, type SicherungInfo } from '../netz/gemeinsam'
import { geraeteKennung, useTerra } from '../speicher'
import { setzeTon } from '../ton/klang'
import { tagText } from '../zeit'
import { Flagge, FLAGGEN_FARBEN, FLAGGEN_MUSTER, FLAGGEN_ZEICHEN } from './Skizze'
import { Raum, toast } from './teile'

export function FlaggenWahl({ fl, onChange }: { fl: [number, number, number, number]; onChange: (f: [number, number, number, number]) => void }) {
  const dreh = (i: number, n: number): void => { const neu = fl.slice() as [number, number, number, number]; neu[i] = (neu[i] + 1) % n; onChange(neu) }
  return (
    <span className="ti-reihe" data-ti-flaggenwahl>
      <Flagge fl={fl} breite={66} />
      <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => dreh(0, FLAGGEN_MUSTER)}>Muster</button>
      <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => dreh(1, FLAGGEN_FARBEN)}>Farbe 1</button>
      <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => dreh(2, FLAGGEN_FARBEN)}>Farbe 2</button>
      <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => dreh(3, FLAGGEN_ZEICHEN)}>Zeichen</button>
    </span>
  )
}

export default function Einstellungen({ onZu }: { onZu: () => void }) {
  const stand = useTerra(s => s.spiel?.stand)
  useTerra(s => s.rev)
  const tue = useTerra(s => s.tue)
  const uebernimm = useTerra(s => s.uebernimm)
  const loescheAlles = useTerra(s => s.loescheAlles)
  const verschluesselung = useTerra(s => s.verschluesselung)
  const speicherFehler = useTerra(s => s.speicherFehler)
  const verbunden = useGemeinsam(s => s.verbunden)
  const fremderStand = useGemeinsam(s => s.fremderStand)
  const [wirklichHier, setWirklichHier] = useState(false)
  const [sicherung, setSicherung] = useState<SicherungInfo | null | undefined>(undefined)
  const [wirklich, setWirklich] = useState(false)
  const [kapitaen, setKapitaen] = useState(stand?.kapitaen ?? '')
  const [schiff, setSchiff] = useState(stand?.schiffName ?? '')
  useEffect(() => {
    if (!stand || !verbunden) return
    let lebt = true
    void neuereSicherung(stand.benutzer, stand.zug).then(s => { if (lebt) setSicherung(s) })
    return () => { lebt = false }
  }, [verbunden]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!stand) return null
  const e = stand.einstellungen
  const setze = (f: (x: typeof e) => void): void => { tue(sp => { f(sp.stand.einstellungen) }); setzeTon(useTerra.getState().spiel?.stand.einstellungen ?? e) }
  return (
    <Raum kennung="einstellungen" titel="Einstellungen" unter="Gelten nur für dich" onZu={onZu}>
      <div className="ti-gitter">
        <div className="ti-kasten" data-ti-ton>
          <h3>Ton</h3>
          <p>Meer, Wind und leise Musik erzeugt das Tool selbst. Der Ton pausiert, sobald das Fenster nicht im Vordergrund ist.</p>
          <div className="ti-reihe" style={{ marginTop: 8 }}>
            <button type="button" className={`ti-knopf ti-knopf-klein${e.ton ? ' ti-knopf-gold' : ''}`} onClick={() => setze(x => { x.ton = !x.ton })} data-ti-ton-schalter aria-pressed={e.ton}>{e.ton ? 'Ton ist an' : 'Ton ist aus'}</button>
            <button type="button" className={`ti-knopf ti-knopf-klein${e.musik ? ' ti-knopf-gold' : ''}`} disabled={!e.ton} onClick={() => setze(x => { x.musik = !x.musik })} aria-pressed={e.musik}>{e.musik ? 'Musik an' : 'Musik aus'}</button>
          </div>
          <label className="ti-reihe" style={{ marginTop: 8 }}><span className="ti-stumm">Lautstärke</span><input type="range" min={5} max={100} step={5} value={e.laut} disabled={!e.ton} onChange={ev => setze(x => { x.laut = Number(ev.target.value) })} style={{ flex: 1 }} /><span className="ti-stumm">{e.laut} %</span></label>
        </div>
        <div className="ti-kasten">
          <h3>Segeln</h3>
          <p>Wie schnell das Schiff über die Karte zieht. Am Spiel ändert das nichts.</p>
          <div className="ti-reihe" style={{ marginTop: 8 }}>
            <button type="button" className={`ti-knopf ti-knopf-klein${!e.schnell ? ' ti-knopf-gold' : ''}`} onClick={() => setze(x => { x.schnell = false })}>Gemächlich</button>
            <button type="button" className={`ti-knopf ti-knopf-klein${e.schnell ? ' ti-knopf-gold' : ''}`} onClick={() => setze(x => { x.schnell = true })}>Zügig</button>
          </div>
        </div>
        <div className="ti-kasten" data-ti-namen>
          <h3>Kapitän und Schiff</h3>
          <label className="ti-stumm">Dein Kapitänsname (so sehen dich die Kollegen)<input className="ti-eingabe" maxLength={28} value={kapitaen} onChange={ev => setKapitaen(ev.target.value)} /></label>
          <label className="ti-stumm" style={{ display: 'block', marginTop: 6 }}>Name des Schiffs<input className="ti-eingabe" maxLength={28} value={schiff} onChange={ev => setSchiff(ev.target.value)} /></label>
          <div style={{ marginTop: 8 }}><FlaggenWahl fl={stand.flagge} onChange={f => tue(sp => { sp.stand.flagge = f })} /></div>
          <div className="ti-fuss"><button type="button" className="ti-knopf ti-knopf-klein" disabled={!saeubereName(kapitaen) || !saeubereName(schiff) || (kapitaen === stand.kapitaen && schiff === stand.schiffName)} onClick={() => { tue(sp => { sp.stand.kapitaen = saeubereName(kapitaen); sp.stand.schiffName = saeubereName(schiff) }); void veroeffentliche(true); toast('Geändert.') }}>Übernehmen</button></div>
        </div>
        {/* liegt ein neuerer Stand vor oder ist ein anderer PC weiter, steht dieser Kasten ganz vorn — dann ist etwas zu entscheiden */}
        <div className="ti-kasten" style={sicherung || fremderStand ? { order: -1 } : undefined} data-ti-sicherung>
          <h3>Spielstand</h3>
          <p>{verschluesselung ? 'Dein Spielstand liegt verschlüsselt auf diesem PC.' : 'Auf diesem PC lässt sich nicht verschlüsselt speichern – der Spielstand gilt nur für diese Sitzung.'} Eine verschlüsselte Sicherung geht beim Einlaufen in einen Hafen aufs Netzlaufwerk, damit er einen PC-Tausch übersteht.</p>
          {speicherFehler && <p className="ti-fehler">{speicherFehler}</p>}
          {sicherung && <p style={{ marginTop: 6 }}><b>Auf dem Netzlaufwerk liegt ein neuerer Stand</b> (vom {tagText(sicherung.tag)}, von einem {sicherung.geraet === geraeteKennung() ? 'früheren Lauf dieses PCs' : 'anderen PC'}). Übernimmst du ihn, wird der Stand dieses PCs nicht gelöscht, sondern aufgehoben.</p>}
          {fremderStand && <p style={{ marginTop: 6 }} data-ti-fremd><b>Auf einem anderen PC hast du schon weitergespielt.</b> Solange das so ist, veröffentlicht dieser PC nichts in die gemeinsame Welt. {sicherung ? 'Am einfachsten übernimmst du den neueren Stand.' : 'Eine neuere Sicherung liegt nicht auf dem Netzlaufwerk – wähle am anderen PC einmal „Jetzt sichern“, oder spiele mit dem Stand dieses PCs weiter.'}</p>}
          <div className="ti-fuss" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="ti-knopf ti-knopf-klein" disabled={!verbunden} onClick={() => void sichereInsNetz(true).then(ok => toast(ok ? 'Gesichert.' : 'Nichts zu sichern oder keine Verbindung.'))} data-ti-sichern>Jetzt sichern</button>
            {sicherung && <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-gold" onClick={() => void sicherung.hole().then(d => (d ? uebernimm(d.stand, d.karte) : false)).then(ok => { if (ok) { spieleHierWeiter(); toast('Spielstand übernommen.'); onZu() } else toast('Die Sicherung ließ sich nicht lesen.') })} data-ti-uebernehmen>Neueren Stand übernehmen</button>}
            {fremderStand && (wirklichHier
              ? <><button type="button" className="ti-knopf ti-knopf-klein" onClick={() => { spieleHierWeiter(); setWirklichHier(false); toast('Ab jetzt gilt der Stand dieses PCs.') }} data-ti-hier-ja>Ja, hier weiterspielen</button><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => setWirklichHier(false)}>Lieber nicht</button></>
              : <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => setWirklichHier(true)} title="Was du am anderen PC seit dessen letzter Sicherung erspielt hast, zählt dann nicht mehr." data-ti-hier>Mit dem Stand dieses PCs weiterspielen …</button>)}
          </div>
        </div>
        <div className="ti-kasten">
          <h3>Was sehen die anderen?</h3>
          <p>Deinen Kapitänsnamen, deinen Namen im Tool, Schiff, Rang, Flagge, deine Zahlen in den Ranglisten, deine Taufnamen und Flaschenpost – jeweils nur mit dem Tag, nie mit der Uhrzeit. Gold, Ladung, Karte und Kurs bleiben bei dir.</p>
        </div>
        <div className="ti-kasten" data-ti-loeschen>
          <h3>Von vorn beginnen</h3>
          <p>Löscht deinen Spielstand auf diesem PC. Deine Taufnamen bleiben auf den Karten der Kollegen stehen.</p>
          <div className="ti-fuss" style={{ justifyContent: 'flex-start' }}>
            {wirklich
              ? <><button type="button" className="ti-knopf ti-knopf-klein" style={{ borderColor: 'var(--ti-gefahr)', color: 'var(--ti-gefahr)' }} onClick={() => void loescheAlles()} data-ti-loeschen-ja>Ja, alles löschen</button><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => setWirklich(false)}>Lieber nicht</button></>
              : <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => setWirklich(true)}>Spielstand löschen …</button>}
          </div>
        </div>
      </div>
    </Raum>
  )
}
