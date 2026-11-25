// Was der angemeldete Benutzer sehen darf — berechnet in der Sidebar (utils/sichtbarkeit.ts):
//   · sichtbar: jeder Menüpunkt des Katalogs (auch Unterpunkte wie die Pausenraum-Räume)
//   · bereiche: je Menüpunkt die ausgeblendeten Unterbereiche (Kacheln/Reiter, siehe BEREICHE)
// Solange noch nichts berechnet ist (null bzw. leer), ist alles sichtbar — wie bisher.
import { useCallback, useMemo, useState } from 'react'
import { create } from 'zustand'
import { BEREICHE } from '../utils/menuCatalog'
import type { Screen } from '../types'

interface S {
  sichtbar: Record<string, boolean> | null
  bereiche: Record<string, string[]>
  setze: (s: Record<string, boolean>, bereiche?: Record<string, string[]>) => void
  /** wird nach dem Speichern in „Benutzer & Rechte“ erhöht → die Sidebar lädt sofort neu */
  stand: number
  neuLaden: () => void
}

const LEER: string[] = []

export const useMenuSichtbar = create<S>(set => ({
  sichtbar: null,
  bereiche: {},
  setze: (s, bereiche) => set(alt => ({ sichtbar: s, bereiche: bereiche ?? alt.bereiche })),
  stand: 0,
  neuLaden: () => set(alt => ({ stand: alt.stand + 1 })),
}))

/** Ist dieser Menüpunkt/Bildschirm für den Benutzer ausgeblendet? (false, solange nichts berechnet ist) */
export function istAusgeblendet(id: string): boolean {
  const s = useMenuSichtbar.getState().sichtbar
  return !!s && s[id] === false
}

/** Unterbereiche eines Menüpunkts: `sichtbar(key)` und der erste sichtbare Bereich. */
export function useBereiche(menuId: Screen) {
  const versteckt = useMenuSichtbar(s => s.bereiche[menuId] || LEER)
  return useMemo(() => {
    const sichtbar = (key: string) => !versteckt.includes(key)
    const erster = (BEREICHE[menuId] || []).find(b => sichtbar(b.key))?.key
    return { sichtbar, erster, versteckt }
  }, [versteckt, menuId])
}

/**
 * Wie useState für den aktiven Reiter/Bereich — zeigt aber nie einen ausgeblendeten:
 * Startwert, Werte aus localStorage und Sprünge im Code landen dann beim ersten sichtbaren.
 * Werte, die nicht im Katalog stehen (z. B. 'overview', 'hub'), bleiben unverändert.
 */
export function useBereichZustand<T extends string>(menuId: Screen, start: T | (() => T)): [T, (v: T | ((alt: T) => T)) => void] {
  const [roh, setRoh] = useState<T>(start)
  const { sichtbar, erster } = useBereiche(menuId)
  const bekannt = (BEREICHE[menuId] || []).some(b => b.key === roh)
  const wert = (bekannt && !sichtbar(roh) && erster ? erster : roh) as T
  const setze = useCallback((v: T | ((alt: T) => T)) => setRoh(v), [])
  return [wert, setze]
}
