// Parla Italiano — die wenigen festen Regeln, die mehrere Stellen brauchen (bewusst ohne weitere Abhängigkeiten,
// damit Kachel und Erinnerung den großen Aufgabenbau nicht mitladen müssen).

/** Prüfungen gelten ab diesem Anteil richtiger Antworten als bestanden */
export const BESTEHEN_AB = 0.7

/** Sterne für den Tagestest: ab 60 % einer, ab 80 % zwei, ab 95 % drei */
export const sterneFuer = (richtig: number, gesamt: number): number => {
  const q = gesamt ? richtig / gesamt : 0
  return q >= 0.95 ? 3 : q >= 0.8 ? 2 : q >= 0.6 ? 1 : 0
}
