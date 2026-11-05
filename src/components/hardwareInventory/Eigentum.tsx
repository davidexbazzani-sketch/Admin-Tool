import { Archive, BadgeCheck, Wallet } from 'lucide-react'
import { EIGENTUM_LABEL, eigentumKlasse, eigentumText, fachText, importKommentarAbweichend, type EigentumKlasse } from '../../services/inventurEigentum'

type FachDaten = {
  comment?: string; epComment?: string; owner?: string | null
  fachNachgetragen?: string; fachBestaetigtAm?: string; fachBestaetigtVon?: string
}

function datum(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * „Fach: …" = Kommentar am Asset (Asset-Datenbank/Endgeräte; nur ohne Eintrag dort: Inventur-Import).
 * `warnen`: bei erfassten Geräten „Fach fehlt" zeigen, wenn nichts eingetragen/bestätigt ist.
 */
export function FachZeile({ d, warnen }: { d: FachDaten; warnen?: boolean }) {
  const fach = fachText(d)
  const bestaetigt = d.fachBestaetigtAm ? `In ServiceNow eingetragen — bestätigt von ${d.fachBestaetigtVon || '?'} am ${datum(d.fachBestaetigtAm)}` : ''
  if (!fach) {
    if (bestaetigt) return (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0" title={bestaetigt}>
        <Archive size={10} className="shrink-0" /><span className="truncate">Fach in ServiceNow nachgetragen (noch nicht in den Endgeräten)</span>
      </div>
    )
    // „Fach fehlt" nur, wenn der Abgleich mit der Asset-Datenbank gelaufen ist
    if (warnen && d.owner !== undefined) return (
      <div className="flex items-center gap-1 text-[10px] min-w-0">
        <span className="inline-flex items-center gap-1 px-1.5 rounded bg-amber-400 text-black font-medium"><Archive size={10} />Fach fehlt</span>
      </div>
    )
    return null
  }
  const nachgetragen = !(d.epComment || '').trim() && !!(d.fachNachgetragen || '').trim()
  const quelle = nachgetragen ? `Beim Scannen angegeben — ${bestaetigt}`
    : d.epComment !== undefined ? 'Kommentar aus der Asset-Datenbank (Endgeräte-Übersicht)' : 'Gerät nicht in der Asset-Datenbank — Kommentar aus dem Inventur-Import'
  const imp = importKommentarAbweichend(d)
  return (
    <div className="flex items-center gap-1 text-[10px] text-foreground/80 min-w-0" title={`${quelle}: ${fach}${imp ? `\nKommentar im Inventur-Import: ${imp}` : ''}`}>
      <Archive size={10} className="shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground shrink-0">Fach:</span>
      <span className="truncate">{fach}</span>
    </div>
  )
}

export type EigentumFilterWert = 'alle' | EigentumKlasse

/** Label „SKF Eigentum" — nur für Geräte, bei denen in der Endgeräte-Übersicht SKF bezahlt. */
export function EigentumBadge({ owner }: { owner: string | null | undefined }) {
  if (eigentumKlasse(owner) !== 'skf') return null
  return (
    <span title={`Wer bezahlt? (Endgeräte-Übersicht): ${owner}`}
      className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500 text-black">
      <BadgeCheck size={10} />SKF Eigentum
    </span>
  )
}

/** Filterleiste Eigentum; Klassen ohne Treffer werden ausgeblendet. */
export function EigentumFilter({ wert, onChange, zahlen }: {
  wert: EigentumFilterWert
  onChange: (w: EigentumFilterWert) => void
  zahlen: Record<EigentumKlasse, number>
}) {
  const klassen = (['skf', 'hcl', 'sonst', 'unbekannt'] as EigentumKlasse[]).filter(k => zahlen[k] > 0 || wert === k)
  const gesamt = zahlen.skf + zahlen.hcl + zahlen.sonst + zahlen.unbekannt
  const titel: Record<EigentumKlasse, string> = {
    skf: 'Wer bezahlt? = SKF (Endgeräte-Übersicht)',
    hcl: 'Wer bezahlt? = HCL (Endgeräte-Übersicht)',
    sonst: 'Andere oder keine Angabe bei „Wer bezahlt?"',
    unbekannt: 'Seriennummer nicht in der Endgeräte-Übersicht',
  }
  return (
    <div className="flex items-center gap-1.5">
      <Wallet size={12} className="text-muted-foreground" />
      <div className="flex rounded-md border border-border overflow-hidden">
        <button onClick={() => onChange('alle')}
          className={`px-2.5 py-1 text-[11px] ${wert === 'alle' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}>
          Eigentum: alle ({gesamt})
        </button>
        {klassen.map(k => (
          <button key={k} onClick={() => onChange(wert === k ? 'alle' : k)} title={titel[k]}
            className={`px-2.5 py-1 text-[11px] border-l border-border ${wert === k
              ? (k === 'skf' ? 'bg-emerald-500 text-black font-medium' : 'bg-primary text-primary-foreground')
              : 'text-muted-foreground hover:bg-accent/40'}`}>
            {EIGENTUM_LABEL[k]} ({zahlen[k]})
          </button>
        ))}
      </div>
    </div>
  )
}

export function passtEigentum(wert: EigentumFilterWert, owner: string | null | undefined): boolean {
  return wert === 'alle' || eigentumKlasse(owner) === wert
}

/** Kurzer Text (HCL, Leasing …) für Nicht-SKF-Geräte in der Unterzeile. */
export function eigentumKurz(owner: string | null | undefined): string {
  const k = eigentumKlasse(owner)
  return k === 'skf' || k === 'unbekannt' ? '' : eigentumText(owner)
}
