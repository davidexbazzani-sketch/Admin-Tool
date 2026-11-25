// Kleine gemeinsame Bausteine für „freie“ Übungen (eigene Oberfläche), damit alle gleich aussehen
// und sich gleich verhalten. Regeln für freie Übungen stehen in src/brain/uebungen/LIESMICH.md.
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Rückwärts laufende Uhr in Sekunden. Ruft `onEnde` genau einmal. `aktiv=false` hält an. */
export function useUhr(dauerSek: number | undefined, onEnde: () => void, aktiv = true): number {
  const [rest, setRest] = useState(dauerSek ?? 0)
  const ende = useRef(onEnde)
  ende.current = onEnde
  useEffect(() => {
    if (!dauerSek || !aktiv) return
    const bis = performance.now() + dauerSek * 1000
    let fertig = false
    const t = setInterval(() => {
      const r = Math.max(0, (bis - performance.now()) / 1000)
      setRest(Math.ceil(r))
      if (r <= 0 && !fertig) { fertig = true; clearInterval(t); ende.current() }
    }, 100)
    return () => clearInterval(t)
  }, [dauerSek, aktiv])
  return rest
}

/** Vorwärts laufende Stoppuhr (Sekunden, eine Nachkommastelle). */
export function useStoppuhr(aktiv = true): number {
  const [sek, setSek] = useState(0)
  useEffect(() => {
    if (!aktiv) return
    const von = performance.now() - sek * 1000
    const t = setInterval(() => setSek(Math.round((performance.now() - von) / 100) / 10), 100)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv])
  return sek
}

/** Tasten abfangen (ohne Wiederholung beim Gedrückthalten). `karte`: Taste → Aktion; Buchstaben klein schreiben. */
export function useTasten(karte: Record<string, () => void>, aktiv = true): void {
  const ref = useRef(karte)
  ref.current = karte
  useEffect(() => {
    if (!aktiv) return
    const taste = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const f = ref.current[k]
      if (f) { e.preventDefault(); f() }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [aktiv])
}

/** Kopfzeile einer Übung: links Fortschritt/Zeit, rechts Punkte o. Ä. */
export function KopfZeile({ links, mitte, rechts }: { links?: ReactNode; mitte?: ReactNode; rechts?: ReactNode }) {
  return (
    <div className="bt-lauf-kopf">
      {links}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>{mitte}</div>
      {rechts}
    </div>
  )
}

/** Fortschrittsbalken 0..1 */
export function Balken({ anteil, warm }: { anteil: number; warm?: boolean }) {
  return <div className="bt-balken" style={{ flex: 1, minWidth: 80 }}><i style={{ width: `${Math.max(0, Math.min(1, anteil)) * 100}%`, background: warm ? 'var(--bt-akzent2)' : undefined }} /></div>
}

/** Tastenhinweis, z. B. <Taste>F</Taste> */
export function Taste({ children }: { children: ReactNode }) {
  return <kbd className="bt-taste">{children}</kbd>
}

/** Median einer Zahlenliste (0 bei leerer Liste) */
export function median(w: number[]): number {
  if (!w.length) return 0
  const s = w.slice().sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
