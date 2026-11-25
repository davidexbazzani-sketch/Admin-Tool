// Der Coach — Ergebnis eines Bausteins in den Lernstand und ins Buch schreiben.
import type { Kopf } from '../kern/inhaltTypen'
import { useCoach } from '../kern/speicher'
import { bucheAntwort, bucheTendenz, starteZaehler } from '../kern/buchung'
import { heute, tagNummer } from '../kern/zeit'
import type { Ergebnis } from '../uebungen/typen'

export function verbucheErgebnis(kopf: Kopf | undefined, e: Ergebnis): void {
  const st = useCoach.getState()
  const tag = heute()
  st.aendere(d => {
    let n = d
    if (kopf && e.wert !== undefined) n = bucheAntwort(n, kopf, e.wert, tag, { halb: e.selbst, sicherheit: e.sicherheit })
    if (e.tendenzen?.length) n = bucheTendenz(n, e.tendenzen, e.gewaehlt, tag)
    if (e.wirkung) n = { ...n, wirkung: { ...n.wirkung, [e.wirkung.werkzeug]: [...(n.wirkung[e.wirkung.werkzeug] ?? []), e.wirkung.vorher - e.wirkung.nachher].slice(-8) } }
    if (e.zaehler) n = starteZaehler(n, e.zaehler.name, e.zaehler.tage, tag)
    if (e.ernstfall) n = { ...n, ernstfaelle: [...n.ernstfaelle.filter(x => x.id !== e.ernstfall!.id), e.ernstfall].slice(-20) }
    if (e.leiter) n = { ...n, eigeneLeitern: [...n.eigeneLeitern, e.leiter].slice(-10) }
    if (e.werte) n = { ...n, kompass: { ...n.kompass, werte: e.werte } }
    if (e.lebensrad) { const nr = tagNummer(tag); const lr = { ...n.kompass.lebensrad }; for (const [k, v] of Object.entries(e.lebensrad)) lr[k] = [...(lr[k] ?? []).filter(x => x[0] !== nr), [nr, v] as [number, number]].slice(-4); n = { ...n, kompass: { ...n.kompass, lebensrad: lr } } }
    if (e.spaeterLaut && !n.spaeterLaut.includes(e.spaeterLaut)) n = { ...n, spaeterLaut: [...n.spaeterLaut, e.spaeterLaut].slice(-10) }
    return n
  })
  if (e.buch) st.schreibeIns({ art: e.buch.art, text: e.buch.text, bezug: kopf?.id })
}
