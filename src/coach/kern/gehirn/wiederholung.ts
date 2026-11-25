// Der Coach — Karteikasten mit fünf Fächern (Abstände 1, 3, 7, 16, 35 Tage). Richtig → ein Fach weiter;
// falsch → zurück in Fach 1. Merkkarten kommen aus Einheiten (m:<kennung>) und aus dem Buch (b:<kennung>).

export type KastenEintrag = [fach: number, faellig: number, richtig: number, falsch: number]
export const FAECHER = 5
export const ABSTAND = [0, 1, 3, 7, 16, 35]

export const neuerEintrag = (heute: number): KastenEintrag => [1, heute + ABSTAND[1], 0, 0]

export function bewerte(e: KastenEintrag | undefined, richtig: boolean, heute: number): KastenEintrag {
  const [fach, faellig, r, f] = e ?? [1, heute, 0, 0]
  if (!richtig) return [1, heute + ABSTAND[1], r, f + 1]
  if (faellig > heute) return [fach, faellig, r + 1, f]           // noch nicht fällig: Fach bleibt
  const neu = Math.min(FAECHER, fach + 1)
  return [neu, heute + ABSTAND[neu], r + 1, f]
}

/** fällige Karten, die dringendsten zuerst (niedriges Fach, lange überfällig) */
export function faellige(kasten: Record<string, KastenEintrag>, heute: number, erlaubt?: (ref: string) => boolean): string[] {
  return Object.entries(kasten)
    .filter(([k, e]) => e[1] <= heute && (!erlaubt || erlaubt(k)))
    .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || (a[0] < b[0] ? -1 : 1))
    .map(([k]) => k)
}

export function kastenStand(kasten: Record<string, KastenEintrag>, heute: number): { karten: number; sicher: number; faellig: number } {
  let sicher = 0, faellig = 0
  const alle = Object.values(kasten)
  for (const e of alle) { if (e[0] >= 4) sicher++; if (e[1] <= heute) faellig++ }
  return { karten: alle.length, sicher, faellig }
}
