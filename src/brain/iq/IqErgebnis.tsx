// IQ-Test — Ergebnis: Schätzwert mit Bereich, Glockenkurve, Profil je Gebiet, „Hier liegt Potenzial“,
// alle Aufgaben mit Lösung. Gespeichert oder geteilt wird nur, wenn der Benutzer es ausdrücklich wählt.
import { useState } from 'react'
import { ArrowRight, Check, ChevronDown, Info, Lock, Save, Share2, X } from 'lucide-react'
import type { KatalogEintrag } from '../kern/typen'
import { uebung } from '../kern/katalog'
import { Zeige } from '../figuren/Zeige'
import { Glocke, TendenzBalken } from '../fortschritt/diagramme'
import { bereichText, einstufung, iqText, rangSatz } from './irt'
import { IQ_GEBIETE, iqGebietName, potenzial, type IqAuswertung, type TestLaenge } from './test'
import type { IqAufgabe } from './IqLauf'

interface Props {
  a: IqAuswertung
  laenge: TestLaenge
  dauerSek: number
  aufgaben: IqAufgabe[]
  /** kann überhaupt lokal gespeichert werden (Zustimmung + Verschlüsselung)? */
  speicherbar: boolean
  gespeichert: boolean
  onSpeichern: () => void
  onTeilen: () => void
  onUebung: (u: KatalogEintrag) => void
  onNeu: () => void
}

const tendenzText = (t: number): string =>
  t >= 0.5 ? 'deutlich stärker als dein Gesamtniveau' : t >= 0.15 ? 'etwas stärker als dein Gesamtniveau'
    : t <= -0.5 ? 'deutlich schwächer als dein Gesamtniveau' : t <= -0.15 ? 'etwas schwächer als dein Gesamtniveau' : 'etwa auf deinem Gesamtniveau'

export default function IqErgebnis({ a, laenge, dauerSek, aufgaben, speicherbar, gespeichert, onSpeichern, onTeilen, onUebung, onNeu }: Props) {
  const [offen, setOffen] = useState(false)
  const pot = potenzial(a.profil)
  const zeilen = IQ_GEBIETE.filter(g => a.profil.some(p => p.gebiet === g.id)).map(g => {
    const p = a.profil.find(x => x.gebiet === g.id)!
    return { id: g.id, name: g.name, unter: `${p.richtig} von ${p.gesamt} richtig`, tendenz: p.tendenz, tipp: `${p.richtig} von ${p.gesamt} richtig — ${tendenzText(p.tendenz)}` }
  })
  const min = Math.floor(dauerSek / 60), sek = Math.round(dauerSek % 60)

  return (
    <div className="bt-breite" style={{ maxWidth: 940 }} data-bt-iq-ergebnis>
      <div className="bt-raster" style={{ gridTemplateColumns: 'minmax(0, 300px) minmax(0, 1fr)', alignItems: 'stretch', marginBottom: 16 }}>
        <section className="bt-karte" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
          <div className="bt-label">Dein Schätzwert</div>
          <div className="bt-held" style={{ fontSize: 76, color: 'var(--bt-akzent-stark)', margin: '8px 0 6px' }} data-bt-iq-wert>{iqText(a.iq)}</div>
          <div className="bt-h3" data-bt-iq-bereich>wahrscheinlicher Bereich {bereichText(a.von, a.bis)}</div>
          <div className="bt-leise" style={{ marginTop: 10, fontSize: 13 }}>
            {einstufung(a.iq)} · {rangSatz(a.iq, a.prozentrang)}
          </div>
          <div className="bt-klein bt-stumm" style={{ marginTop: 12 }}>{a.richtig} von {a.gesamt} richtig · {laenge} Fragen · {min}:{String(sek).padStart(2, '0')} min</div>
        </section>
        <section className="bt-karte">
          <h2 className="bt-h3" style={{ marginBottom: 2 }}>Wo du in der Bevölkerung liegst</h2>
          <div className="bt-klein bt-leise" style={{ marginBottom: 6 }}>Die Kurve zeigt, wie häufig IQ-Werte vorkommen. Markiert ist dein Schätzwert, eingefärbt der Bereich, in dem dein wahrer Wert mit 90 % Wahrscheinlichkeit liegt.</div>
          <Glocke iq={a.iq} von={a.von} bis={a.bis} />
        </section>
      </div>

      <div className="bt-hinweis" style={{ marginBottom: 16 }}>
        <Info size={16} style={{ flex: 'none', marginTop: 2 }} />
        <span><b>Bitte richtig einordnen:</b> Das ist eine Orientierung, kein offizielles Testergebnis. Aufgabenarten, Skala und Auswertung entsprechen gängigen Tests — geeicht an vielen Personen ist dieser Test aber nicht. {laenge === 10 ? 'Mit 10 Fragen ist der Bereich breit; 30 Fragen messen deutlich genauer.' : laenge === 20 ? 'Mit 30 Fragen wird der Bereich noch etwas enger.' : ''} Wiederholungen heben den Wert durch Übung.</span>
      </div>

      <section className="bt-karte" style={{ marginBottom: 16 }}>
        <h2 className="bt-h2" style={{ marginBottom: 2 }}>Dein Profil</h2>
        <div className="bt-klein bt-leise" style={{ marginBottom: 12 }}>Jedes Gebiet im Vergleich zu deinem eigenen Gesamtniveau: nach rechts stärker, nach links schwächer.</div>
        <TendenzBalken zeilen={zeilen} hinweis={laenge === 10 ? 'Bei 10 Fragen kommen je Gebiet nur ein bis zwei Aufgaben — das Profil ist dann nur eine Tendenz.' : undefined} />
      </section>

      <section className="bt-karte" style={{ marginBottom: 16 }} data-bt-iq-potenzial>
        <h2 className="bt-h2" style={{ marginBottom: 2 }}>Hier liegt Potenzial</h2>
        <div className="bt-klein bt-leise" style={{ marginBottom: 12 }}>Die Gebiete, in denen du im Vergleich zu deinem Niveau am meisten zulegen kannst — mit passenden Übungen.</div>
        <div className="bt-raster" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {pot.map(p => {
            const info = IQ_GEBIETE.find(g => g.id === p.gebiet)!
            const liste = info.uebungen.map(uebung).filter((u): u is KatalogEintrag => !!u).slice(0, 3)
            return (
              <div key={p.gebiet} style={{ padding: 14, borderRadius: 13, border: '1px solid var(--bt-rand)', background: 'var(--bt-bg2)' }}>
                <div className="bt-h3">{info.name}</div>
                <div className="bt-klein bt-leise" style={{ marginBottom: 10 }}>{info.kurz} · {p.richtig} von {p.gesamt} richtig</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {liste.map(u => <button key={u.id} type="button" className="bt-knopf bt-knopf-leise" style={{ padding: '6px 11px', fontSize: 13 }} onClick={() => onUebung(u)} data-bt-iq-uebung={u.id}>{u.name}<ArrowRight size={13} /></button>)}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="bt-karte" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 className="bt-h3">Was soll mit dem Ergebnis passieren?</h2>
            <div className="bt-klein bt-leise" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={12} />Ohne deine Auswahl wird nichts gespeichert. Gespeicherte Ergebnisse siehst nur du.
            </div>
          </div>
          <button type="button" className="bt-knopf" onClick={onSpeichern} disabled={gespeichert || !speicherbar} data-bt-iq-speichern
            title={speicherbar ? 'Nur für dich sichtbar, verschlüsselt auf diesem PC' : 'Speichern ist ausgeschaltet (Einstellungen)'}>
            {gespeichert ? <><Check size={15} />Gespeichert</> : <><Save size={15} />Für mich speichern</>}
          </button>
          <button type="button" className="bt-knopf bt-knopf-leise" onClick={onTeilen} data-bt-iq-teilen><Share2 size={15} />Teilen …</button>
          <button type="button" className="bt-knopf bt-knopf-nackt" onClick={onNeu} data-bt-iq-fertig>Fertig</button>
        </div>
        {!speicherbar && <div className="bt-klein bt-stumm" style={{ marginTop: 8 }}>Speichern ist ausgeschaltet — einschalten kannst du es unter „Einstellungen“.</div>}
      </section>

      <section className="bt-karte">
        <button type="button" className="bt-knopf bt-knopf-nackt" style={{ marginLeft: -10 }} onClick={() => setOffen(!offen)} aria-expanded={offen} data-bt-iq-aufgaben>
          <ChevronDown size={16} style={{ transform: offen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />Alle {aufgaben.length} Aufgaben mit Lösung ansehen
        </button>
        {offen && (
          <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
            {aufgaben.map((x, i) => (
              <div key={i} style={{ padding: 14, borderRadius: 13, border: '1px solid var(--bt-rand)', background: 'var(--bt-bg2)' }} data-bt-iq-aufgabe={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className={`bt-chip ${x.richtig ? 'bt-chip-gut' : 'bt-chip-warm'}`}>{x.richtig ? <Check size={12} /> : <X size={12} />}{i + 1}</span>
                  <span className="bt-h3">{iqGebietName(x.gebiet)}</span>
                  <span className="bt-klein bt-stumm">Stufe {x.stufe} · {Math.round(x.ms / 1000)} s{x.gewaehlt === null ? ' · nicht beantwortet' : ''}</span>
                </div>
                <div className="bt-klein" style={{ marginBottom: 8 }}>{x.frage.aufgabe}</div>
                {x.frage.vorab && <div className="bt-iq-klein" style={{ marginBottom: 8 }}><Zeige d={x.frage.vorab.zeige} rolle="auswahl" /></div>}
                {x.frage.zeige && <div className="bt-iq-klein" style={{ marginBottom: 8 }}><Zeige d={x.frage.zeige} rolle="auswahl" /></div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {x.frage.optionen.map((o, k) => (
                    <span key={k} className="bt-option bt-iq-option" data-zustand={k === x.frage.richtig ? 'richtig' : k === x.gewaehlt ? 'falsch' : 'matt'} style={{ cursor: 'default' }}>
                      <Zeige d={o} rolle="auswahl" />
                    </span>
                  ))}
                </div>
                {x.frage.erklaerung && <div className="bt-klein bt-leise" style={{ marginTop: 8 }}>{x.frage.erklaerung}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
