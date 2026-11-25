// Der Coach — kleine Bausteine der Oberfläche: Name einsetzen, Beleg-Stufe, Bruno mit Sprechblase, Laden.
import { useEffect, useMemo, useState } from 'react'
import type { Anlass, Beleg, Gemeinsam, Quelle } from '../kern/inhaltTypen'
import { ladeGemeinsam, ladeQuellen } from '../kern/inhalt'
import { useCoach } from '../kern/speicher'
import { hash32 } from '../kern/zufall'
import { heute } from '../kern/zeit'
import { host } from '../host/aktiv'

/** {name} einsetzen. Ohne Namen fällt nur die ANREDE weg („{name}, …“ am Satzanfang, „…, {name}.“ am Satzende);
 *  steht der Name mitten im Satz („Ich bin {name} und …“), kommt „[dein Name]“ hinein – sonst entstünden kaputte Sätze. */
export function mitName(text: string, name: string): string {
  if (name) return text.replace(/\{name\}/g, name)
  return text
    .replace(/(^|[.!?…]\s+|[„"]\s*)\{name\},\s*(\p{L})/gu, (_m, vor: string, z: string) => vor + z.toUpperCase())
    .replace(/,\s*\{name\}(?=\s*[.!?…“"]|\s*$)/g, '')
    .replace(/\b(Hallo|Hi|Hey|Moin|Servus)\s+\{name\}/g, '$1')
    .replace(/\{name\}/g, '[dein Name]')
}
export function useName(): string { return useCoach(s => s.daten.profil.name) }
export function T({ t }: { t: string }) { const n = useName(); return <>{mitName(t, n)}</> }

export const BELEG_TEXT: Record<Beleg, string> = {
  A: 'Belegt – mehrere Studien oder Übersichtsarbeiten',
  B: 'Gestützt – einzelne gute Studien',
  P: 'Praxiswissen – bewährt, aber kaum untersucht',
  D: 'Denkmodell – hilft beim Verstehen, ist kein Befund',
  U: 'Umstritten oder widerlegt',
}
export function BelegChip({ b, hinweis }: { b: Beleg; hinweis?: string }) {
  return <span className="dc-beleg" title={`${BELEG_TEXT[b]}${hinweis ? ` – ${hinweis}` : ''}`} aria-label={`Beleg-Stufe ${b}: ${BELEG_TEXT[b]}`}>{b}</span>
}

let gemeinsam: Gemeinsam | null = null
export function useGemeinsam(): Gemeinsam | null {
  const [g, setG] = useState<Gemeinsam | null>(gemeinsam)
  useEffect(() => { if (!g) void ladeGemeinsam().then(x => { gemeinsam = x; setG(x) }) }, [g])
  return g
}
let quellenCache: Map<string, Quelle> | null = null
export function useQuellen(): Map<string, Quelle> {
  const [q, setQ] = useState<Map<string, Quelle>>(quellenCache ?? new Map())
  useEffect(() => { if (!quellenCache) void ladeQuellen().then(x => { quellenCache = x; setQ(x) }) }, [])
  return q
}

/** eine Coach-Zeile im gewählten Ton; `salz` sorgt für Abwechslung, bleibt aber je Anlass und Tag stabil */
export function useZeile(anlass: Anlass, salz: string | number = ''): string {
  const g = useGemeinsam()
  const ton = useCoach(s => s.daten.profil.ton)
  const name = useName()
  return useMemo(() => {
    const liste = g?.zeilen[anlass]?.[ton] ?? []
    if (!liste.length) return ''
    return mitName(liste[hash32(`${anlass}|${heute()}|${salz}`) % liste.length], name)
  }, [g, anlass, ton, salz, name])
}

/** Brunos Haltungen (public/coach/bilder/bruno-<haltung>.webp, 640 × 800) */
export type Haltung = 'gruss' | 'anerkennend' | 'nachdenklich' | 'erklaerend' | 'anfeuernd' | 'ruhig' | 'zuhoerend' | 'lachend' | 'ernst' | 'feiernd'

/** einmal je Sitzung und Datei: Ist das Bild da? (spart wiederholte Fehlversuche) */
const bildZustand = new Map<string, 'da' | 'fehlt'>()
function useBild(datei: string): ['laedt' | 'da' | 'fehlt', () => void, () => void] {
  const [z, setZ] = useState<'laedt' | 'da' | 'fehlt'>(bildZustand.get(datei) ?? 'laedt')
  useEffect(() => { setZ(bildZustand.get(datei) ?? 'laedt') }, [datei])
  return [z, () => { bildZustand.set(datei, 'da'); setZ('da') }, () => { bildZustand.set(datei, 'fehlt'); setZ('fehlt') }]
}

/** Bruno: Kopf im Kreis oder – mit `haltung` und `gross` – die ganze Haltung; daneben die Sprechblase.
 *  Fehlt ein Bild, steht die gezeichnete Figur da. */
export function Bruno({ text, gross, haltung }: { text: string; gross?: boolean; haltung?: Haltung }) {
  const datei = gross && haltung ? `bruno-${haltung}.webp` : 'bruno.webp'
  const [bild, da, fehlt] = useBild(datei)
  const figur = gross && haltung
  const masse = figur ? { width: 92, height: 115 } : { width: gross ? 84 : 64, height: gross ? 84 : 64 }
  return (
    <div className="dc-bruno" data-dc-bruno={haltung ?? 'kopf'}>
      <span className={figur ? 'dc-bruno-bild dc-bruno-figur' : 'dc-bruno-bild'} style={masse} aria-hidden>
        {bild !== 'da' && <BrunoZeichen />}
        {bild !== 'fehlt' && <img key={datei} src={host().bildPfad(datei)} alt="" decoding="async" style={bild === 'da' ? undefined : { display: 'none' }} onLoad={da} onError={fehlt} />}
      </span>
      {text && <div className="dc-blase dc-ein" key={text}>{text}</div>}
    </div>
  )
}

/** Raumbild als Band (Halle, Einstieg, Ecke, Notfallkoffer, Abschluss); fehlt es, bleibt die Stelle leer */
export function Raumbild({ name, hoehe = 180, position = 'center 35%' }: { name: 'halle' | 'einstieg' | 'ecke' | 'notfall' | 'abschluss'; hoehe?: number; position?: string }) {
  const [bild, da, fehlt] = useBild(`${name}.webp`)
  if (bild === 'fehlt') return null
  return (
    <div className="dc-raumbild" style={{ height: hoehe, display: bild === 'da' ? undefined : 'none' }} data-dc-raumbild={name} aria-hidden>
      <img src={host().bildPfad(`${name}.webp`)} alt="" decoding="async" style={{ objectPosition: position }} onLoad={da} onError={fehlt} />
    </div>
  )
}
/** gezeichneter Platzhalter: Kopf mit grauem Bart, Handtuch über der Schulter */
export function BrunoZeichen() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden>
      <rect width="64" height="64" fill="var(--dc-flaeche2)" />
      <path d="M10 64c2-14 12-20 22-20s20 6 22 20z" fill="var(--dc-ink)" opacity="0.85" />
      <path d="M40 46c6 2 10 8 11 18h-6c-1-8-3-12-7-14z" fill="var(--dc-rot)" />
      <circle cx="32" cy="27" r="13" fill="var(--dc-sand)" />
      <path d="M20 29c2 9 7 12 12 12s10-3 12-12c-3 4-7 5-12 5s-9-1-12-5z" fill="var(--dc-stumm)" />
      <path d="M19 24c0-8 6-12 13-12s13 4 13 12c-3-4-8-5-13-5s-10 1-13 5z" fill="var(--dc-stumm)" />
      <circle cx="27" cy="27" r="1.6" fill="var(--dc-bg)" /><circle cx="37" cy="27" r="1.6" fill="var(--dc-bg)" />
    </svg>
  )
}

export function Laedt({ text = 'Bruno holt die Unterlagen …' }: { text?: string }) {
  return <div className="dc-leise dc-reihe" style={{ padding: 30, justifyContent: 'center' }} data-dc-laedt>{text}</div>
}

/** Quellenliste zu einem Inhalt */
export function Quellen({ ids }: { ids: string[] }) {
  const q = useQuellen()
  if (!ids.length) return null
  return (
    <ul className="dc-klein dc-stumm" style={{ margin: 0, paddingLeft: 18 }}>
      {ids.map(id => { const x = q.get(id); return <li key={id}>{x ? x.text : id}{x?.link && <> · <span style={{ wordBreak: 'break-all' }}>{x.link}</span></>}{x && !x.geprueft && ' (nicht nachgeschlagen)'}</li> })}
    </ul>
  )
}
