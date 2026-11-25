// Terra Incognita — die Rätselbretter (Ruinen und Tagesfahrt): Riff-Lotse, Taue spleißen, Runenschloss, Sternbild.
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Delete } from 'lucide-react'
import { loeseRuine, type LandErgebnis } from '../kern/land'
import { dreheTeil, gleite, RAETSEL_NAME, RAETSEL_TEXT, riffRaetsel, RUNEN, runenPruefe, runenRaetsel, sternFertig, sternRaetsel, tauFertig, tauRaetsel, type RiffRaetsel, type RunenRaetsel, type SternRaetsel, type TauRaetsel } from '../kern/raetsel'
import { ortVon } from '../kern/spiel'
import { umwelt, useTerra } from '../speicher'
import { klang } from '../ton/klang'
import { Blatt } from './teile'

/** kleines Boot im Tuschestrich (für die Rätselbretter) */
export function Boot({ g }: { g: number }) {
  return (
    <svg width={g} height={g} viewBox="0 0 24 24" aria-hidden>
      <path d="M3 16 h18 l-3 5 h-12z" fill="var(--ti-gold)" stroke="var(--ti-ink)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M12 16 V3 M12 4 q8 5 0 11" fill="var(--ti-papier)" stroke="var(--ti-ink)" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

// ── Riff-Lotse ──
export function RiffBrett({ r, onFertig }: { r: RiffRaetsel; onFertig: (zuege: number) => void }) {
  const [pos, setPos] = useState(r.start)
  const [zuege, setZuege] = useState(0)
  const [fertig, setFertig] = useState(false)
  const zieh = (k: number): void => {
    if (fertig) return
    const neu = gleite(r, pos, k)
    if (neu === pos) return
    klang('klick')
    setPos(neu); setZuege(zuege + 1)
    if (neu === r.ziel) { setFertig(true); window.setTimeout(() => onFertig(zuege + 1), 450) }
  }
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => { const k = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].indexOf(e.key); if (k >= 0) { e.preventDefault(); zieh(k) } }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  })
  const g = Math.min(44, Math.floor(380 / r.n))
  return (
    <div data-ti-brett="riff">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${r.n}, ${g}px)`, gap: 2, justifyContent: 'center', margin: '12px 0' }}>
        {r.riff.map((riff, i) => (
          <div key={i} style={{ width: g, height: g, borderRadius: 5, background: riff ? 'var(--ti-rand-stark)' : 'var(--ti-flaeche)', border: '1px solid var(--ti-rand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: g * 0.55, lineHeight: 1 }}>
            {i === pos ? <span data-ti-boot title="Dein Boot" style={{ display: 'flex' }}><Boot g={g * 0.74} /></span> : i === r.ziel ? <span title="Leuchtfeuer" style={{ color: 'var(--ti-gold)' }}>✦</span> : riff ? <span style={{ fontSize: g * 0.34, opacity: 0.7 }}>✕</span> : null}
          </div>
        ))}
      </div>
      <div className="ti-reihe" style={{ justifyContent: 'center' }}>
        {/* Pfeile als gezeichnete Zeichen, nicht als Schriftzeichen: Die sehen auf jedem PC gleich aus */}
        {([[ArrowLeft, 2, 'nach links'], [ArrowUp, 3, 'nach oben'], [ArrowDown, 1, 'nach unten'], [ArrowRight, 0, 'nach rechts']] as const).map(([Pfeil, k, name]) => <button key={k} type="button" className="ti-knopf" style={{ width: 44, padding: '7px 0' }} onClick={() => zieh(k)} title={name} aria-label={name} data-ti-zug={k}><Pfeil size={18} /></button>)}
        <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" onClick={() => { setPos(r.start); setZuege(0) }}>Von vorn</button>
        <span className="ti-stumm" data-ti-zuege>{zuege} {zuege === 1 ? 'Zug' : 'Züge'} · bestmöglich {r.par}</span>
      </div>
    </div>
  )
}

// ── Taue spleißen ──
function TauTeil({ maske, g }: { maske: number; g: number }) {
  const m = g / 2
  return (
    <svg width={g} height={g} aria-hidden>
      {[[m, 0], [g, m], [m, g], [0, m]].map(([x, y], k) => (maske & (1 << k) ? <line key={k} x1={m} y1={m} x2={x} y2={y} stroke="var(--ti-gold)" strokeWidth={g * 0.16} strokeLinecap="round" /> : null))}
      <circle cx={m} cy={m} r={g * 0.11} fill="var(--ti-gold)" />
    </svg>
  )
}
export function TauBrett({ r, onFertig }: { r: TauRaetsel; onFertig: (drehungen: number) => void }) {
  const [teile, setTeile] = useState(r.teile)
  const [drehungen, setDrehungen] = useState(0)
  const [fertig, setFertig] = useState(false)
  const g = Math.min(64, Math.floor(380 / Math.max(r.b, r.h)))
  const dreh = (i: number): void => {
    if (fertig) return
    const neu = teile.slice()
    neu[i] = dreheTeil(neu[i])
    klang('klick')
    setTeile(neu); setDrehungen(drehungen + 1)
    if (tauFertig(r.b, r.h, neu)) { setFertig(true); window.setTimeout(() => onFertig(drehungen + 1), 450) }
  }
  return (
    <div data-ti-brett="taue">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${r.b}, ${g}px)`, gap: 3, justifyContent: 'center', margin: '12px 0' }}>
        {teile.map((m, i) => <button key={i} type="button" onClick={() => dreh(i)} style={{ width: g, height: g, borderRadius: 6, background: 'var(--ti-flaeche)', border: `1px solid ${fertig ? 'var(--ti-gut)' : 'var(--ti-rand)'}`, padding: 0 }} aria-label="Stück drehen" data-ti-teil={i}><TauTeil maske={m} g={g - 2} /></button>)}
      </div>
      <div className="ti-reihe" style={{ justifyContent: 'center' }}>
        <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" onClick={() => { setTeile(r.teile); setDrehungen(0) }}>Von vorn</button>
        <span className="ti-stumm">{drehungen} {drehungen === 1 ? 'Drehung' : 'Drehungen'} · bestmöglich {r.par}</span>
      </div>
    </div>
  )
}

// ── Runenschloss ──
export function RunenBrett({ r, onFertig, onGescheitert }: { r: RunenRaetsel; onFertig: (versuche: number) => void; onGescheitert: () => void }) {
  const [tipp, setTipp] = useState<number[]>([])
  const [reihen, setReihen] = useState<{ tipp: number[]; genau: number; fast: number }[]>([])
  const [ende, setEnde] = useState<'' | 'auf' | 'zu'>('')
  const pruefe = (): void => {
    if (tipp.length !== r.laenge || ende) return
    const [genau, fast] = runenPruefe(r.code, tipp)
    const neu = [...reihen, { tipp, genau, fast }]
    setReihen(neu); setTipp([])
    if (genau === r.laenge) { setEnde('auf'); klang('fund'); window.setTimeout(() => onFertig(neu.length), 500) }
    else if (neu.length >= r.versuche) { setEnde('zu'); klang('donner') }
    else klang('klick')
  }
  const rune = (z: number, klein = false) => <span style={{ display: 'inline-flex', width: klein ? 30 : 40, height: klein ? 30 : 40, alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--ti-rand-stark)', background: 'var(--ti-flaeche2)', fontSize: klein ? 18 : 24, fontWeight: 700 }}>{RUNEN[z]}</span>
  return (
    <div data-ti-brett="runen">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '12px 0', minHeight: 60 }}>
        {reihen.map((z, i) => (
          <div key={i} className="ti-reihe" data-ti-versuch={i}>
            {z.tipp.map((t, j) => <span key={j}>{rune(t, true)}</span>)}
            <span style={{ marginLeft: 8 }}><b>{z.genau}</b> genau · <b>{z.fast}</b> am falschen Platz</span>
          </div>
        ))}
        {!reihen.length && <p className="ti-stumm">Noch kein Versuch. Du hast {r.versuche}.</p>}
      </div>
      {ende === 'zu' ? (
        <div>
          <p className="ti-fehler">Das Schloss verriegelt sich. Die Runen ordnen sich neu.</p>
          <div className="ti-fuss"><button type="button" className="ti-knopf ti-knopf-gold" onClick={onGescheitert} data-ti-nochmal>Noch einmal versuchen</button></div>
        </div>
      ) : !ende && (
        <>
          <div className="ti-reihe" style={{ marginBottom: 8 }}>
            {Array.from({ length: r.laenge }, (_, i) => <span key={i}>{tipp[i] === undefined ? <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 6, border: '1px dashed var(--ti-rand-stark)', opacity: 0.6 }} /> : rune(tipp[i])}</span>)}
            <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" onClick={() => setTipp(tipp.slice(0, -1))} disabled={!tipp.length} title="Letzte Rune zurücknehmen" aria-label="Letzte Rune zurücknehmen"><Delete size={15} /></button>
            <button type="button" className="ti-knopf ti-knopf-gold" onClick={pruefe} disabled={tipp.length !== r.laenge} data-ti-pruefen>Prüfen</button>
          </div>
          <div className="ti-reihe">
            {Array.from({ length: r.zeichen }, (_, z) => <button key={z} type="button" onClick={() => { if (tipp.length < r.laenge) setTipp([...tipp, z]) }} data-ti-rune={z}>{rune(z)}</button>)}
            <span className="ti-stumm">Versuch {reihen.length + 1} von {r.versuche}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Sternbild ──
export function SternBrett({ r, onFertig }: { r: SternRaetsel; onFertig: (fehlgriffe: number) => void }) {
  const [feld, setFeld] = useState<number[]>(() => new Array<number>(r.n * r.n).fill(0))        // 0 offen, 1 gefüllt, 2 als leer markiert
  const [fehlgriffe, setFehlgriffe] = useState(0)
  const [falsch, setFalsch] = useState(-1)
  const [fertig, setFertig] = useState(false)
  const g = Math.min(36, Math.floor(300 / r.n))
  const setze = (i: number, leer: boolean): void => {
    if (fertig) return
    const neu = feld.slice()
    if (leer) neu[i] = neu[i] === 2 ? 0 : 2
    else if (neu[i] === 1) neu[i] = 0
    else if (!r.bild[i]) {
      // Fehlgriff: Das Feld gehört nicht zum Sternbild — es wird als leer markiert und zählt
      neu[i] = 2
      setFehlgriffe(fehlgriffe + 1); setFalsch(i); window.setTimeout(() => setFalsch(-1), 500)
      klang('donner')
    } else { neu[i] = 1; klang('klick') }
    setFeld(neu)
    if (sternFertig(r, neu.map(v => v === 1))) { setFertig(true); window.setTimeout(() => onFertig(fehlgriffe + (!leer && !r.bild[i] ? 1 : 0)), 450) }
  }
  const breite = Math.max(...r.zeilen.map(h => h.length)) * 15 + 6, hoch = Math.max(...r.spalten.map(h => h.length)) * 15 + 4
  return (
    <div data-ti-brett="stern">
      <div style={{ display: 'grid', gridTemplateColumns: `${breite}px repeat(${r.n}, ${g}px)`, gap: 2, justifyContent: 'center', margin: '12px 0', userSelect: 'none' }}>
        <div />
        {r.spalten.map((h, x) => <div key={x} style={{ height: hoch, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', fontSize: 12, fontWeight: 700, lineHeight: '15px' }}>{h.map((z, i) => <span key={i}>{z}</span>)}</div>)}
        {Array.from({ length: r.n }, (_, y) => [
          <div key={`h${y}`} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5, paddingRight: 5, fontSize: 12, fontWeight: 700 }}>{r.zeilen[y].map((z, i) => <span key={i}>{z}</span>)}</div>,
          ...Array.from({ length: r.n }, (_, x) => {
            const i = y * r.n + x, v = feld[i]
            return <button key={i} type="button" onClick={() => setze(i, false)} onContextMenu={e => { e.preventDefault(); setze(i, true) }}
              style={{ width: g, height: g, borderRadius: 4, padding: 0, border: `1px solid ${falsch === i ? 'var(--ti-gefahr)' : 'var(--ti-rand-stark)'}`, background: v === 1 ? 'var(--ti-gold)' : falsch === i ? 'var(--ti-gefahr-weich)' : 'var(--ti-flaeche2)', color: 'var(--ti-stumm)', fontSize: g * 0.5, lineHeight: 1 }} aria-label={`Feld ${x + 1}, ${y + 1}`} data-ti-feld={i} data-ti-voll={r.bild[i] ? 1 : 0}>{v === 1 ? <span style={{ color: 'var(--ti-gold-ink)' }}>✦</span> : v === 2 ? '·' : ''}</button>
          }),
        ])}
      </div>
      <p className="ti-stumm" style={{ textAlign: 'center' }}>Klick füllt ein Feld, Rechtsklick markiert es als leer. Fehlgriffe: {fehlgriffe}</p>
    </div>
  )
}

/** Rätsel einer Ruine: Wird es gelöst, gibt es den Lohn. */
export default function RaetselBlatt({ ortKey, art, onZu }: { ortKey: string; art: number; onZu: (ergebnis: LandErgebnis | null) => void }) {
  const tue = useTerra(s => s.tue)
  const versuche = useTerra(s => s.spiel?.stand.raetsel[ortKey]?.versuche ?? 0)
  const ort = useMemo(() => ortVon(ortKey), [ortKey])
  const [nr, setNr] = useState(versuche)
  if (!ort) return null
  const saat = (ort.saat ^ Math.imul(nr + 1, 0x9E3779B1)) >>> 0
  const geloest = (): void => {
    klang('fanfare')
    onZu(tue(sp => loeseRuine(sp, ortKey, umwelt())))
  }
  const neuerVersuch = (): void => { tue(sp => { const r = sp.stand.raetsel[ortKey] ?? {}; sp.stand.raetsel[ortKey] = { ...r, versuche: (r.versuche ?? 0) + 1 } }); setNr(nr + 1) }
  return (
    <Blatt kennung="raetsel" bild="ruine" ueber="In der Ruine" titel={RAETSEL_NAME[art]} fuss={<button type="button" className="ti-knopf ti-knopf-leise" onClick={() => onZu(null)} data-ti-spaeter>Später wiederkommen</button>}>
      <p className="ti-prosa">{RAETSEL_TEXT[art]}</p>
      {art === 0 && <RiffBrett key={nr} r={riffRaetsel(saat, ort.stufe)} onFertig={geloest} />}
      {art === 1 && <TauBrett key={nr} r={tauRaetsel(saat, ort.stufe)} onFertig={geloest} />}
      {art === 2 && <RunenBrett key={nr} r={runenRaetsel(saat, ort.stufe)} onFertig={geloest} onGescheitert={neuerVersuch} />}
      {art === 3 && <SternBrett key={nr} r={sternRaetsel(saat, ort.stufe)} onFertig={geloest} />}
    </Blatt>
  )
}
