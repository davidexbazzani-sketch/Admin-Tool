// Parla Italiano — kleine Bausteine, die mehrere Abläufe und Bereiche brauchen.
import { useState, type ReactNode } from 'react'
import { Lock, Star } from 'lucide-react'
import type { Aufgabe, Ergebnis } from '../kern/typen'
import type { Wuensche } from '../kern/aufgaben'
import { hatTon, ladeTon, zeilenSicher } from '../kern/ton'
import { useItaliano } from '../kern/speicher'
import { bildVon, station, AM_ZIEL } from '../kern/lehrplan'

export const Laedt = ({ text = 'Lädt …' }: { text?: string }) => <div className="pi-leise" style={{ padding: 40, textAlign: 'center' }}>{text}</div>

/** Wünsche für den Aufgabenbau: Ton nur, wenn er an ist UND es für den Lerntag eine Tondatei gibt */
export async function holeWuensche(): Promise<Wuensche> {
  await ladeTon()
  const e = useItaliano.getState().daten.einstellungen
  return { ton: tag => e.ton && hatTon(tag), zeilen: tag => e.ton && hatTon(tag) && zeilenSicher(tag), tippen: e.tippen }
}

/** kleine Feier: bunte Schnipsel fallen einmal durch die umgebende Fläche (die braucht position: relative) */
export function Konfetti() {
  const farben = ['var(--pi-akzent)', 'var(--pi-gruen)', 'var(--pi-blau)', 'var(--pi-gold)', '#F5F0E6', '#D1432F', '#2E8B57']
  return (
    <span className="pi-konfetti" aria-hidden>
      {Array.from({ length: 34 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37 + 5) % 100}%`, background: farben[i % farben.length], animationDelay: `${(i % 9) * 0.11}s`, animationDuration: `${2.1 + (i % 5) * 0.28}s`, width: 6 + (i % 3) * 2 }} />
      ))}
    </span>
  )
}

export function Sterne({ n, gross }: { n: number; gross?: boolean }) {
  return (
    <span className="pi-sterne" aria-label={`${n} von 3 Sternen`} data-pi-sterne={n}>
      {[1, 2, 3].map(i => <Star key={i} size={gross ? 34 : 15} data-an={i <= n ? '1' : undefined} fill={i <= n ? 'currentColor' : 'none'} />)}
    </span>
  )
}

/** Postkarte einer Station. Fehlt das Bild (noch nicht erzeugt), bleibt eine ruhige Fläche mit dem Ortsnamen. */
export function Stationsbild({ level, zu, kinder, klein }: { level: number; zu?: boolean; kinder?: ReactNode; klein?: boolean }) {
  const [fehlt, setFehlt] = useState(false)
  const s = station(Math.min(level, AM_ZIEL - 1))
  return (
    <div className={`pi-bild ${zu ? 'pi-bild-zu' : ''}`} data-pi-bild={level}>
      {!fehlt && <img src={bildVon(level)} alt={zu ? '' : `Postkarte aus ${s.ort}`} loading="lazy" decoding="async" onError={() => setFehlt(true)} />}
      <div className="pi-bild-schild" style={klein ? { fontSize: 12 } : undefined}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{zu && <Lock size={klein ? 11 : 13} />}{s.ort}</span>
        {kinder}
      </div>
    </div>
  )
}

export interface Fehlgriff { frage: string; loesung: string; it: boolean }
/** Was im Test falsch war — mit der richtigen Lösung zum Nachlesen */
export function fehlgriffe(aufgaben: readonly Aufgabe[], ergebnisse: readonly Ergebnis[]): Fehlgriff[] {
  const falsch = new Set(ergebnisse.filter(e => !e.richtig).map(e => e.id))
  const aus: Fehlgriff[] = []
  for (const a of aufgaben) {
    if (!falsch.has(a.id)) continue
    if (a.typ === 'auswahl') aus.push({ frage: a.frage ?? a.kopf, loesung: a.optionen[a.richtig], it: !!a.optIt })
    else if (a.typ === 'tippen') aus.push({ frage: a.frage ?? a.zusatz ?? `${a.vor ?? ''}…${a.nachText ?? ''}`, loesung: a.loesung, it: true })
    else if (a.typ === 'satzbau') aus.push({ frage: a.de, loesung: a.loesung, it: true })
  }
  return aus
}

export function FehlgriffListe({ liste }: { liste: Fehlgriff[] }) {
  if (!liste.length) return null
  return (
    <div className="pi-karte pi-spalte" style={{ gap: 8 }} data-pi-fehlgriffe>
      <h3 className="pi-h3">Das schauen wir uns noch einmal an</h3>
      {liste.slice(0, 8).map((f, i) => (
        <div key={i} className="pi-karte-flach">
          <div className="pi-leise pi-klein">{f.frage}</div>
          <div className={f.it ? 'pi-it' : undefined} lang={f.it ? 'it' : undefined} style={{ fontWeight: 700 }}>{f.loesung}</div>
        </div>
      ))}
    </div>
  )
}
