// Parla Italiano — Tests: Vokabel-, Hör- und Grammatiktest, Einstufung und die Abschnittsprüfungen mit Urkunde.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Award, BookOpen, ClipboardCheck, Ear, Lock, Route, ScrollText, Shuffle } from 'lucide-react'
import type { LevelInhalt, TagInhalt } from '../kern/inhaltTypen'
import { LEVEL_ANZAHL, levelVonTag } from '../kern/inhaltTypen'
import type { Aufgabe, Ergebnis, TestArt } from '../kern/typen'
import { ladeLevelBis, vorhandeneLevel, woerterVon, type WortMitOrt } from '../kern/inhalt'
import { baueAbschnittspruefung, baueEinstufung, baueGrammatik, baueHoeren, baueVokabeln, BESTEHEN_AB, einstufungsLevel, TEIL_NAME, type EinstufAufgabe, type PruefAufgabe, type Wuensche } from '../kern/aufgaben'
import { useItaliano } from '../kern/speicher'
import { useAuthStore } from '../../store/authStore'
import { datumText, heute } from '../kern/zeit'
import { station } from '../kern/lehrplan'
import { neuerStart } from '../../brain/kern/zufall'
import Lauf, { type LaufEnde } from '../ablauf/Lauf'
import { fehlgriffe, FehlgriffListe, holeWuensche, Laedt } from '../ablauf/gemeinsam'

type Art = 'vokabel' | 'hoeren' | 'grammatik' | 'einstufung' | 'A1' | 'A2' | 'B1'
const ABSCHNITT: Record<'A1' | 'A2' | 'B1', { von: number; bis: number; name: string }> = {
  A1: { von: 1, bis: 8, name: 'Anfänger' },
  A2: { von: 9, bis: 16, name: 'Grundkenntnisse' },
  B1: { von: 17, bis: 24, name: 'Fortgeschrittene Sprachverwendung' },
}
const istAbschnitt = (a: Art): a is 'A1' | 'A2' | 'B1' => a === 'A1' || a === 'A2' || a === 'B1'

interface Runde { art: Art; titel: string; aufgaben: Aufgabe[]; sekunden?: number; pruef?: PruefAufgabe[]; einstuf?: EinstufAufgabe[] }
interface Ende { art: Art; titel: string; richtig: number; gesamt: number; aufgaben: Aufgabe[]; ergebnisse: Ergebnis[]; teile?: Record<string, [number, number]>; startLevel?: number }

export default function Tests({ onSperre, gleichEinstufung, onEinstufungAuf }: { onSperre: (an: boolean) => void; gleichEinstufung: boolean; onEinstufungAuf: () => void }) {
  const daten = useItaliano(s => s.daten)
  const name = useAuthStore(s => s.session?.user.displayName || s.session?.user.username || '')
  const [stoff, setStoff] = useState<{ level: LevelInhalt[]; tage: TagInhalt[]; woerter: WortMitOrt[] } | null>(null)
  const [wuensche, setWuensche] = useState<Wuensche | null>(null)
  const [runde, setRunde] = useState<Runde | null>(null)
  const [ende, setEnde] = useState<Ende | null>(null)
  const [meldung, setMeldung] = useState('')
  const [urkunde, setUrkunde] = useState<'A1' | 'A2' | 'B1' | null>(null)
  const [laedt, setLaedt] = useState(false)
  const gelernt = daten.lektionen

  useEffect(() => {
    let lebt = true
    void (async () => {
      const [level, w] = await Promise.all([ladeLevelBis(gelernt ? levelVonTag(gelernt) : 0), holeWuensche()])
      if (!lebt) return
      const tage = level.flatMap(l => l.tage).filter(t => t.tag <= gelernt)
      setStoff({ level, tage, woerter: tage.flatMap(woerterVon) }); setWuensche(w)
    })()
    return () => { lebt = false }
  }, [gelernt, daten.einstellungen.ton, daten.einstellungen.tippen])
  useEffect(() => { onSperre(!!runde); return () => onSperre(false) }, [runde, onSperre])

  const starte = useCallback(async (art: Art) => {
    if (!stoff || !wuensche) return
    setMeldung('')
    const start = neuerStart()
    if (art === 'einstufung') {
      setLaedt(true)
      const alle = await ladeLevelBis(Math.max(0, ...vorhandeneLevel()))
      setLaedt(false)
      const einstuf = baueEinstufung(alle, start)
      if (einstuf.length < 12) { setMeldung('Für die Einstufung sind noch zu wenige Stationen vorbereitet.'); return }
      setRunde({ art, titel: 'Einstufung', aufgaben: einstuf.map(e => e.a), einstuf }); return
    }
    if (istAbschnitt(art)) {
      setLaedt(true)
      const bereich = (await ladeLevelBis(ABSCHNITT[art].bis)).filter(l => l.level >= ABSCHNITT[art].von)
      setLaedt(false)
      if (bereich.length < 8) { setMeldung('Für diese Prüfung fehlen noch Inhalte.'); return }
      const pruef = baueAbschnittspruefung(bereich, wuensche, daten.tests.filter(t => t.art === 'abschnitt' && t.titel === art).length)
      setRunde({ art, titel: `Abschnittsprüfung ${art}`, aufgaben: pruef.map(p => p.a), pruef, sekunden: 20 * 60 }); return
    }
    const aufgaben = art === 'vokabel' ? baueVokabeln(stoff.woerter, stoff.woerter, wuensche, start, 30).filter(a => a.typ !== 'paare')
      : art === 'hoeren' ? baueHoeren(stoff.woerter, stoff.tage, stoff.woerter, wuensche, start, 20)
      : baueGrammatik(stoff.tage, start, 20)
    if (aufgaben.length < 8) { setMeldung(art === 'hoeren' ? 'Dafür ist noch kein Ton vorhanden oder der Ton ist ausgeschaltet.' : 'Dafür hast du noch zu wenig gelernt – nach ein paar Lektionen geht es los.'); return }
    setRunde({ art, titel: art === 'vokabel' ? 'Vokabeltest' : art === 'hoeren' ? 'Hörtest' : 'Grammatiktest', aufgaben, sekunden: art === 'vokabel' ? 6 * 60 : art === 'hoeren' ? 6 * 60 : 5 * 60 })
  }, [stoff, wuensche, daten.tests])

  // aus der Begrüßung: gleich mit der Einstufung beginnen
  useEffect(() => { if (gleichEinstufung && stoff && wuensche && !runde && !ende) { onEinstufungAuf(); void starte('einstufung') } }, [gleichEinstufung, stoff, wuensche, runde, ende, starte, onEinstufungAuf])

  const fertig = useCallback((e: LaufEnde) => {
    if (!runde) return
    const z = useItaliano.getState()
    const nach = new Map(e.ergebnisse.map(x => [x.id, x.richtig]))
    const richtig = e.ergebnisse.filter(x => x.richtig).length
    const gesamt = runde.aufgaben.length
    const basis: Ende = { art: runde.art, titel: runde.titel, richtig, gesamt, aufgaben: runde.aufgaben, ergebnisse: e.ergebnisse }
    if (runde.einstuf) {
      // die Einstufung verändert den Karteikasten nicht — sie soll nur einschätzen
      const jeBlock: number[] = []
      for (const x of runde.einstuf) jeBlock[x.block] = (jeBlock[x.block] ?? 0) + (nach.get(x.a.id) ? 1 : 0)
      z.bucheTest({ art: 'einstufung', r: richtig, n: gesamt, titel: 'Einstufung' })
      setEnde({ ...basis, startLevel: einstufungsLevel(jeBlock) })
    } else {
      z.bucheErgebnisse(e.ergebnisse, e.sekunden)
      const artName: TestArt = istAbschnitt(runde.art) ? 'abschnitt' : runde.art === 'vokabel' ? 'vokabel' : runde.art === 'hoeren' ? 'hoeren' : 'grammatik'
      z.bucheTest({ art: artName, r: richtig, n: gesamt, titel: istAbschnitt(runde.art) ? runde.art : runde.titel })
      let teile: Record<string, [number, number]> | undefined
      if (runde.pruef) {
        teile = {}
        for (const p of runde.pruef) { const t = teile[p.teil] ?? [0, 0]; teile[p.teil] = [t[0] + (nach.get(p.a.id) ? 1 : 0), t[1] + 1] }
        if (istAbschnitt(runde.art) && richtig / gesamt >= BESTEHEN_AB) z.bucheUrkunde(runde.art)
      }
      setEnde({ ...basis, teile })
    }
    void z.sichere()
    setRunde(null)
  }, [runde])

  const verlauf = useMemo(() => [...daten.tests].filter(t => t.art !== 'training' && t.art !== 'tempo').reverse().slice(0, 10), [daten.tests])

  if (!stoff || !wuensche || laedt) return <Laedt text={laedt ? 'Der Test wird vorbereitet …' : undefined} />
  if (runde) return <Lauf key={runde.aufgaben[0]?.id} aufgaben={runde.aufgaben} modus="test" titel={runde.titel} sekunden={runde.sekunden} abschnitt={runde.pruef ? i => (runde.pruef![i] ? TEIL_NAME[runde.pruef![i].teil] : undefined) : undefined} onFertig={fertig} onAbbruch={() => setRunde(null)} />
  if (urkunde) return <Urkunde niveau={urkunde} name={name} am={daten.urkunden[urkunde] ?? heute()} onZurueck={() => setUrkunde(null)} />

  if (ende) {
    const quote = ende.gesamt ? ende.richtig / ende.gesamt : 0
    const bestanden = quote >= BESTEHEN_AB
    return (
      <div className="pi-schmal pi-spalte pi-ein" data-pi-test-ende={ende.art}>
        <div className="pi-karte pi-spalte" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
          <div className="pi-ober">{ende.titel}</div>
          <h2 className="pi-h1 pi-zahl">{ende.richtig} von {ende.gesamt} richtig</h2>
          {ende.art === 'einstufung' ? (
            <>
              <p style={{ fontSize: 16 }}>{ende.startLevel! > daten.level ? <>Du kannst bei <b>Level {ende.startLevel} · {station(ende.startLevel!).ort}</b> einsteigen.</> : ende.startLevel === 1 ? 'Am besten beginnst du bei Level 1 in Turin – dort fängt alles ganz von vorn an.' : `Du bist mit Level ${daten.level} schon mindestens so weit, wie der Test dich einstuft.`}</p>
              <p className="pi-leise pi-klein">Der Test schätzt nur ein. Die Lektionen davor kannst du unter „Reise“ nicht nachholen, das Training wiederholt aber nur, was du hier gelernt hast.</p>
              <div className="pi-reihe" style={{ justifyContent: 'center' }}>
                <button type="button" className="pi-knopf pi-knopf-leise" onClick={() => setEnde(null)} data-pi-fertig>{ende.startLevel! > daten.level ? 'Lieber von vorn' : 'Zurück'}</button>
                {ende.startLevel! > daten.level && <button type="button" className="pi-knopf pi-knopf-gross" onClick={() => { useItaliano.getState().beginneBei(ende.startLevel!); setEnde(null) }} autoFocus data-pi-einsteigen>Bei Level {ende.startLevel} einsteigen</button>}
              </div>
            </>
          ) : (
            <>
              <span className={`pi-chip ${bestanden ? 'pi-chip-gruen' : ''}`}>{Math.round(quote * 100)} %{istAbschnitt(ende.art) ? (bestanden ? ' · bestanden' : ` · bestanden ab ${Math.round(BESTEHEN_AB * 100)} %`) : ''}</span>
              {ende.teile && (
                <div className="pi-spalte" style={{ gap: 8, alignSelf: 'stretch', textAlign: 'left' }}>
                  {Object.entries(ende.teile).map(([t, [r, n]]) => (
                    <div key={t} className="pi-reihe" style={{ flexWrap: 'nowrap' }}>
                      <span style={{ width: 96, fontWeight: 700 }}>{TEIL_NAME[t as keyof typeof TEIL_NAME]}</span>
                      <div className={`pi-balken ${r / n >= BESTEHEN_AB ? 'pi-balken-gruen' : ''}`} style={{ flex: 1 }}><i style={{ width: `${Math.round((r / n) * 100)}%` }} /></div>
                      <span className="pi-zahl pi-leise" style={{ width: 52, textAlign: 'right' }}>{r}/{n}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="pi-reihe" style={{ justifyContent: 'center' }}>
                <button type="button" className="pi-knopf pi-knopf-leise" onClick={() => setEnde(null)} data-pi-fertig><ArrowLeft size={16} />Zu den Tests</button>
                {istAbschnitt(ende.art) && bestanden && <button type="button" className="pi-knopf pi-knopf-gross" onClick={() => { const a = ende.art as 'A1' | 'A2' | 'B1'; setEnde(null); setUrkunde(a) }} autoFocus data-pi-urkunde-zeigen><Award size={18} />Urkunde ansehen</button>}
              </div>
            </>
          )}
        </div>
        {ende.art !== 'einstufung' && <FehlgriffListe liste={fehlgriffe(ende.aufgaben, ende.ergebnisse)} />}
      </div>
    )
  }

  const kachel = (art: Art, titel: string, text: string, Symbol: typeof Award, farbe: string, aus?: string, extra?: React.ReactNode) => (
    <div key={art} className="pi-karte pi-spalte" style={{ gap: 10, opacity: aus ? 0.6 : 1 }}>
      <div className="pi-reihe" style={{ flexWrap: 'nowrap' }}><span className={`pi-symbol ${farbe}`}><Symbol size={18} /></span><h3 className="pi-h3" style={{ flex: 1 }}>{titel}</h3>{extra}</div>
      <p className="pi-leise pi-klein" style={{ flex: 1 }}>{aus ?? text}</p>
      <button type="button" className="pi-knopf pi-knopf-leise" disabled={!!aus} onClick={() => void starte(art)} data-pi-test-start={art}>{aus ? <><Lock size={14} />Gesperrt</> : 'Starten'}</button>
    </div>
  )
  const tonDa = stoff.tage.some(t => wuensche.ton(t.tag))

  return (
    <div className="pi-breite pi-spalte" data-pi-tests>
      <div><h1 className="pi-h1">Tests</h1><p className="pi-leise">Der Tagestest und die Prüfung jeder Station gehören zum Lernprogramm unter „Heute“. Hier kannst du dich zusätzlich prüfen.</p></div>
      {meldung && <div className="pi-karte-flach pi-ein" role="status" data-pi-tests-meldung>{meldung}</div>}

      <div className="pi-raster pi-raster-3">
        {kachel('vokabel', 'Vokabeltest', '30 Wörter aus allem, was du gelernt hast. 6 Minuten.', Shuffle, '', gelernt ? undefined : 'Nach der ersten Lektion geht es los.')}
        {kachel('hoeren', 'Hörtest', '20 Wörter und Sätze nur über das Ohr. 6 Minuten.', Ear, 'pi-symbol-blau', !gelernt ? 'Nach der ersten Lektion geht es los.' : tonDa ? undefined : daten.einstellungen.ton ? 'Für deine Lerntage ist noch kein Ton vorhanden.' : 'Der Ton ist ausgeschaltet (Einstellungen).')}
        {kachel('grammatik', 'Grammatiktest', '20 Lücken quer durch alle Themen. 5 Minuten.', BookOpen, 'pi-symbol-gruen', gelernt ? undefined : 'Nach der ersten Lektion geht es los.')}
      </div>

      <div className="pi-raster pi-raster-2">
        <div className="pi-karte pi-spalte" style={{ gap: 10 }}>
          <div className="pi-reihe" style={{ flexWrap: 'nowrap' }}><span className="pi-symbol pi-symbol-gold"><Route size={18} /></span><h3 className="pi-h3">Einstufungstest</h3></div>
          <p className="pi-leise pi-klein">Du kannst schon etwas Italienisch? Rund 30 Aufgaben vom Leichten zum Schweren zeigen, bei welcher Station du einsteigen kannst (Level 1, 5, 9, 13, 17 oder 21). Etwa 6 Minuten, ohne Zeitdruck.</p>
          <div><button type="button" className="pi-knopf pi-knopf-leise" onClick={() => void starte('einstufung')} data-pi-test-start="einstufung">Einstufung starten</button></div>
        </div>
        <div className="pi-karte pi-spalte" style={{ gap: 10 }}>
          <div className="pi-reihe" style={{ flexWrap: 'nowrap' }}><span className="pi-symbol pi-symbol-gold"><ScrollText size={18} /></span><h3 className="pi-h3">Abschnittsprüfungen mit Urkunde</h3></div>
          <p className="pi-leise pi-klein">Nach je acht Stationen kannst du den ganzen Abschnitt prüfen: 40 Aufgaben, 20 Minuten, bestanden ab {Math.round(BESTEHEN_AB * 100)} %.</p>
          {(['A1', 'A2', 'B1'] as const).map(n => {
            const frei = daten.level > ABSCHNITT[n].bis
            const hat = daten.urkunden[n]
            return (
              <div key={n} className="pi-zeile" style={{ padding: '8px 0' }} data-pi-abschnitt={n}>
                <span className={`pi-chip ${hat ? 'pi-chip-gold' : ''}`} style={{ width: 44, justifyContent: 'center' }}>{n}</span>
                <span style={{ flex: 1 }}><b style={{ display: 'block' }}>{ABSCHNITT[n].name}</b><span className="pi-leise pi-klein">{hat ? `bestanden am ${datumText(hat)}` : frei ? `Level ${ABSCHNITT[n].von}–${ABSCHNITT[n].bis}` : `öffnet nach Level ${ABSCHNITT[n].bis} (${station(ABSCHNITT[n].bis).ort})`}</span></span>
                {hat && <button type="button" className="pi-knopf pi-knopf-nackt" onClick={() => setUrkunde(n)} data-pi-urkunde={n}><Award size={15} />Urkunde</button>}
                <button type="button" className="pi-knopf pi-knopf-leise" disabled={!frei} onClick={() => void starte(n)} data-pi-test-start={n}>{frei ? (hat ? 'Noch einmal' : 'Starten') : <Lock size={14} />}</button>
              </div>
            )
          })}
        </div>
      </div>

      {verlauf.length > 0 && (
        <div className="pi-karte pi-spalte" style={{ gap: 0 }} data-pi-testverlauf>
          <h3 className="pi-h3" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardCheck size={15} />Deine letzten Tests</h3>
          {verlauf.map((t, i) => (
            <div key={i} className="pi-zeile" style={{ padding: '8px 4px' }}>
              <span style={{ flex: 1 }}>{t.art === 'tag' ? `Tagestest · Lerntag ${t.tag}` : t.art === 'abschnitt' ? `Abschnittsprüfung ${t.titel}` : t.titel ?? t.art}</span>
              <span className="pi-leise pi-klein">{datumText(t.am.slice(0, 10))}</span>
              <span className="pi-zahl" style={{ width: 64, textAlign: 'right', fontWeight: 700 }}>{t.r} / {t.n}</span>
            </div>
          ))}
        </div>
      )}
      <p className="pi-klein pi-stumm">Noch {LEVEL_ANZAHL - Math.min(LEVEL_ANZAHL, daten.level - 1)} Stationsprüfungen bis zum Ziel.</p>
    </div>
  )
}

/** Urkunde für einen bestandenen Abschnitt — zum Ansehen (und Abfotografieren). Kein offizielles Zertifikat. */
function Urkunde({ niveau, name, am, onZurueck }: { niveau: 'A1' | 'A2' | 'B1'; name: string; am: string; onZurueck: () => void }) {
  const a = ABSCHNITT[niveau]
  return (
    <div className="pi-schmal pi-spalte pi-ein" data-pi-urkunde-ansicht={niveau}>
      <div className="pi-karte" style={{ padding: 10, borderColor: 'var(--pi-gold)' }}>
        <div style={{ border: '2px solid var(--pi-gold)', borderRadius: 12, padding: '34px 26px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <span className="pi-flagge" style={{ width: 44, height: 30 }} aria-hidden><i /><i /><i /></span>
          <div className="pi-ober" lang="it" style={{ letterSpacing: 3 }}>Certificato</div>
          <div className="pi-leise">Parla Italiano bescheinigt</div>
          <div className="pi-h1" style={{ fontSize: 32 }}>{name}</div>
          <div className="pi-leise">den erfolgreichen Abschluss des Abschnitts</div>
          <div className="pi-h1" style={{ color: 'var(--pi-gold)', fontSize: 44 }}>{niveau}</div>
          <div style={{ fontWeight: 700 }}>{a.name} · Level {a.von}–{a.bis} · von {station(a.von).ort} bis {station(a.bis).ort}</div>
          <div className="pi-leise pi-klein">{datumText(am)}</div>
          <div className="pi-it" lang="it" style={{ marginTop: 6, fontStyle: 'italic' }}>Complimenti – continua così!</div>
        </div>
      </div>
      <p className="pi-klein pi-stumm">Die Urkunde zeigt deinen Stand in diesem Kurs. Sie ist kein offizielles Sprachzertifikat.</p>
      <div><button type="button" className="pi-knopf pi-knopf-leise" onClick={onZurueck} autoFocus data-pi-fertig><ArrowLeft size={16} />Zurück</button></div>
    </div>
  )
}
