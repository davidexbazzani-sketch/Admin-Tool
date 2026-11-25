// Der Coach — Einstufung und Formcheck eines Kurses: Szenario-Aufgaben (gestuft bewertet), Selbsteinschätzung,
// Verhaltensfragen. Gleicher Aufbau, damit Fortschritt vergleichbar wird. Keine klinischen Fragebögen.
import { useEffect, useMemo, useState } from 'react'
import type { BereichTests, KursId, TestAufgabe } from '../kern/inhaltTypen'
import { ladeTests } from '../kern/inhalt'
import { useCoach } from '../kern/speicher'
import { bucheAntwort } from '../kern/buchung'
import { heute, tagNummer } from '../kern/zeit'
import { rng } from '../kern/zufall'
import { p as wahrsch } from '../kern/gehirn/schaetzung'
import { Laedt, useZeile } from '../ansicht/hilfen'
import { Auswahl } from '../uebungen/Wahl'
import { Weiter } from '../uebungen/Lesen'

const STUFEN = ['nie', 'selten', 'manchmal', 'oft', 'sehr oft']
const ZUSTIMMUNG = ['trifft nicht zu', 'eher nicht', 'teils', 'eher ja', 'trifft zu']

export function TestAblauf({ kurs, art, onFertig }: { kurs: KursId; art: 'einstufung' | 'formcheck'; onFertig: () => void }) {
  const [t, setT] = useState<BereichTests | null>(null)
  const [i, setI] = useState(0)
  const [werte, setWerte] = useState<number[]>([])
  const [selbst, setSelbst] = useState<Record<string, number>>({})
  const zeile = useZeile('formcheck', kurs)
  useEffect(() => { void ladeTests(kurs).then(setT) }, [kurs])
  const anzahl = art === 'einstufung' ? 6 : 8
  // Aufgaben: über Fähigkeiten und Stufen verteilt; je Formcheck eine andere Fassung (Startwert = Kurs + Tag)
  const aufgaben = useMemo<TestAufgabe[]>(() => {
    if (!t) return []
    const r = rng(`${kurs}|${art}|${heute()}`)
    const nachF = new Map<string, TestAufgabe[]>()
    for (const a of r.misch(t.szenarien)) nachF.set(a.faehigkeit, [...(nachF.get(a.faehigkeit) ?? []), a])
    const aus: TestAufgabe[] = []
    while (aus.length < anzahl && [...nachF.values()].some(l => l.length)) for (const l of nachF.values()) { const a = l.shift(); if (a && aus.length < anzahl) aus.push(a) }
    return aus.sort((a, b) => a.stufe - b.stufe)
  }, [t, kurs, art, anzahl])
  if (!t) return <Laedt />
  const imSzenario = i < aufgaben.length
  const fertig = () => {
    const tag = heute()
    const wert = werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : 0
    const selbstWert = Object.values(selbst).length ? Object.values(selbst).reduce((a, b) => a + b, 0) / (Object.values(selbst).length * 4) : 0
    useCoach.getState().aendere(d => {
      let n = d
      aufgaben.forEach((a, k) => { if (werte[k] !== undefined) n = bucheAntwort(n, { id: a.id, faehigkeit: a.faehigkeit, stufe: a.stufe, kanal: 'wissen', test: true }, werte[k], tag) })
      // Verhaltensfragen zählen als Tun (Selbstauskunft, halbes Gewicht)
      for (const v of t.verhalten) if (selbst[v.id] !== undefined) n = bucheAntwort(n, { id: v.id, faehigkeit: v.faehigkeit, stufe: 5, kanal: 'koennen', test: true }, selbst[v.id] / 4, tag, { halb: true })
      if (art === 'einstufung') return { ...n, einstufung: { ...n.einstufung, [kurs]: tagNummer(tag) } }
      const eintrag = { tag: tagNummer(tag), wert: Math.round(wahrsch((wert - 0.5) * 4) * 100) / 100, se: 0, selbst: Math.round(selbstWert * 100) / 100 }
      return { ...n, formcheck: { ...n.formcheck, [kurs]: [...(n.formcheck[kurs] ?? []), eintrag].slice(-30) } }
    })
    onFertig()
  }
  return (
    <div className="dc-lauf" data-dc-test={art}>
      <div className="dc-fortschritt" aria-hidden><i style={{ width: `${(i / (aufgaben.length + 1)) * 100}%` }} /></div>
      {i === 0 && werte.length === 0 && <div className="dc-rueck">{art === 'einstufung' ? 'Kurze Einstufung: ein paar Lagen, damit Bruno weiß, wo er anfangen soll. Kein Test zum Bestehen.' : zeile}</div>}
      {imSzenario ? (
        <div className="dc-karte" key={i}>
          <Auswahl s={{ art: 'auswahl', kopf: { id: aufgaben[i].id, faehigkeit: aufgaben[i].faehigkeit, stufe: aufgaben[i].stufe, kanal: 'wissen', test: true }, frage: aufgaben[i].frage, antworten: aufgaben[i].antworten.map(a => ({ ...a, warum: a.warum || (a.wert === 2 ? 'Die stärkste Antwort.' : a.wert === 1 ? 'Brauchbar.' : 'Eher schwach.') })) }}
            ohneUhr onFertig={r => { setWerte(w => [...w, r.wert ?? 0]); setI(x => x + 1) }} />
        </div>
      ) : (
        <div className="dc-karte dc-spalte dc-ein">
          <span className="dc-ober">Wie schätzt du dich ein?</span>
          {(art === 'formcheck' ? [...t.selbstbild, ...t.verhalten] : t.selbstbild).map(a => {
            const verhalten = t.verhalten.some(v => v.id === a.id)
            return (
              <div key={a.id} className="dc-spalte" style={{ gap: 6 }}>
                <span>{a.text}</span>
                <div className="dc-reihe" style={{ gap: 4 }}>{(verhalten ? STUFEN : ZUSTIMMUNG).map((x, k) => <button key={k} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: selbst[a.id] === k ? 'var(--dc-gelb)' : undefined, color: selbst[a.id] === k ? 'var(--dc-ink)' : undefined }} aria-pressed={selbst[a.id] === k} onClick={() => setSelbst(s => ({ ...s, [a.id]: k }))}>{x}</button>)}</div>
              </div>
            )
          })}
          <div className="dc-klein dc-leise">{werte.filter(w => w >= 1).length} von {werte.length} Lagen stark gelöst.</div>
          <Weiter text="Fertig" onClick={fertig} />
        </div>
      )}
    </div>
  )
}
