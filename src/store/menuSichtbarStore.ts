// Welche Unterpunkte (Kacheln eines Obermenüpunkts wie „Client Geräte“) der aktuelle
// Benutzer sehen darf — berechnet in der Sidebar mit derselben Logik wie die Menüpunkte.
import { create } from 'zustand'

interface S { sichtbar: Record<string, boolean> | null; setze: (s: Record<string, boolean>) => void }

export const useMenuSichtbar = create<S>(set => ({ sichtbar: null, setze: s => set({ sichtbar: s }) }))
