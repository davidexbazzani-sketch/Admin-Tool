// IQ-Test: lädt die Aufgaben-Generatoren je Gebiet (erst beim Start des Tests).
import type { FragenGenerator, IqGebiet } from '../kern/typen'

export type IqGeneratoren = Record<IqGebiet, FragenGenerator[]>

export async function ladeIqAufgaben(): Promise<IqGeneratoren> {
  const [matrizen, figurenfolgen, zahlenreihen, rotation, wuerfel, falten, schluss, textaufgaben, merkfolge, analogien, oberbegriff] = await Promise.all([
    import('../aufgaben/matrizen'), import('../aufgaben/figurenfolgen'), import('../aufgaben/zahlenreihen'),
    import('../aufgaben/rotation'), import('../aufgaben/wuerfel'), import('../aufgaben/falten'),
    import('../aufgaben/schluss'), import('../aufgaben/textaufgaben'), import('../aufgaben/merkfolge'),
    import('../aufgaben/analogien'), import('../aufgaben/oberbegriff'),
  ])
  return {
    // Matrizen sind die Kern-Aufgabe der Figuren-Logik und kommen doppelt so oft wie Figurenfolgen
    figural: [matrizen.erzeuge, matrizen.erzeuge, figurenfolgen.erzeuge],
    numerisch: [zahlenreihen.erzeuge],
    // sprachlich: Wort-Analogien und Gemeinsamkeiten (Oberbegriff / Was passt nicht?) im Wechsel
    verbal: [analogien.erzeuge, oberbegriff.erzeuge],
    raeumlich: [rotation.erzeuge, wuerfel.erzeuge, falten.erzeuge],
    schluss: [schluss.erzeuge],
    rechnen: [textaufgaben.erzeuge],
    merken: [merkfolge.erzeuge],
  }
}
