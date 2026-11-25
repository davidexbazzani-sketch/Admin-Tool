// Terra Incognita — Begegnung mit einem Gegner (gestellt, Hinterhalt, eigener Angriff, Belagerung einer Festung) und
// das Ergebnis eines Gefechts.
import { useEffect, useState } from 'react'
import { gegnerSchiffe, GESTALT_NAME, nestName, piratName, type Gegner } from '../kampf/gegner'
import { neuerKampf } from '../kampf/kampf'
import { staerke, type Kampf } from '../kampf/regeln'
import { belagerungStart, festungSchiffe } from '../kern/festung'
import { kampfStart, type KampfFolge, type Stellung } from '../kern/gefecht'
import { WAREN, wareNr } from '../kern/waren'
import { pruefeZiel, type ZielPruefung, type Zustellung } from '../netz/festungen'
import { useGemeinsam } from '../netz/gemeinsam'
import { umwelt, useTerra } from '../speicher'
import { Blatt, Folgen, zahl } from './teile'

export const gegnerBild = (g: Gegner): string => (g.art === 'pirat' ? 'kampf' : g.art === 'nest' ? 'festung' : g.art === 'festung' ? 'bollwerk' : g.art === 'gross' ? ({ krake: 'krake', schlange: 'schlange', geist: 'geist', admiral: 'kampf' } as const)[g.gestalt ?? 'krake'] : g.art)

/** Wer ist das? (Überschrift und Name) */
export function gegnerKopf(g: Gegner): { ueber: string; titel: string } {
  if (g.art === 'pirat') { const n = piratName(g.saat); return { ueber: 'Piraten', titel: `Kpt. ${n.kapitaen} auf der „${n.schiff}“` } }
  if (g.art === 'nest') return { ueber: 'Piratennest', titel: nestName(g.saat) }
  if (g.art === 'gross') return { ueber: 'Der große Gegner der Woche', titel: GESTALT_NAME[g.gestalt ?? 'krake'] }
  if (g.art === 'festung') return { ueber: 'Festung', titel: `„${g.n || 'ohne Namen'}“` }
  return { ueber: 'Seeungeheuer', titel: g.art === 'krake' ? 'Eine Riesenkrake' : g.art === 'schlange' ? 'Eine Seeschlange' : 'Ein Geisterschiff' }
}

/** Stärkeverhältnis in Worten */
function vergleich(k: Kampf): { text: string; art: 'gut' | 'gold' | 'rot' } {
  const v = staerke(k, 0) / Math.max(1, staerke(k, 1))
  if (v >= 1.6) return { text: 'Du bist klar überlegen.', art: 'gut' }
  if (v >= 1.1) return { text: 'Ein leichter Vorteil für dich.', art: 'gut' }
  if (v >= 0.8) return { text: 'Ein Kampf auf Augenhöhe.', art: 'gold' }
  if (v >= 0.5) return { text: 'Die Verteidiger sind dir überlegen.', art: 'rot' }
  return { text: 'Die Verteidiger sind dir weit überlegen – das geht kaum gut.', art: 'rot' }
}

/** Vor einer Belagerung: frisch nachsehen (Schutz, andere Belagerer, Beute) und dann angreifen oder abdrehen */
export function BelagerungBlatt({ owner, onAngriff, onZu }: { owner: string; onAngriff: (p: ZielPruefung, sofort: boolean) => void; onZu: () => void }) {
  const [p, setP] = useState<ZielPruefung | null>(null)
  const k = useGemeinsam(s => s.kapitaene.find(x => x.u === owner))
  useEffect(() => { let lebt = true; void pruefeZiel(owner).then(x => { if (lebt) setP(x) }); return () => { lebt = false } }, [owner])
  const bild = p?.bild ?? k?.fe
  const sp = useTerra.getState().spiel
  // die Festung gibt es nicht mehr (aufgegeben, während das Schiff unterwegs war): ein Blatt mit Grund — nie ein
  // unsichtbares, das alle weiteren Blätter verdeckt
  if (!bild || !sp) {
    return (
      <Blatt kennung="belagerung" bild="bollwerk" ueber="Festung" titel={p ? 'Hier steht keine Festung mehr' : 'Kundschafter sehen nach …'} onZu={onZu}
        fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={onZu} data-ti-abdrehen>Abdrehen</button>}>
        <p className="ti-prosa" data-ti-gesperrt>{p ? (p.grund ?? 'Die Festung gibt es nicht mehr.') : 'Gleich ist klar, wie es um die Festung steht.'}</p>
      </Blatt>
    )
  }
  const verteidiger = festungSchiffe(bild)
  const e = p?.ok ? vergleich(neuerKampf(belagerungStart(sp, bild, umwelt()))) : null
  const ware = WAREN[wareNr(bild.w)]?.name ?? bild.w
  return (
    <Blatt kennung="belagerung" bild="bollwerk" ueber={`Festung von Kpt. ${k?.n || owner}`} titel={`„${bild.n}“`} breit onZu={onZu}
      fuss={<>
        <button type="button" className="ti-knopf ti-knopf-leise" onClick={onZu} data-ti-abdrehen>Abdrehen</button>
        <button type="button" className="ti-knopf" disabled={!p?.ok} onClick={() => p && onAngriff(p, true)} title="Die Mannschaft kämpft selbst – das Ergebnis steht sofort fest" data-ti-sofort>Sofort auskämpfen</button>
        <button type="button" className="ti-knopf ti-knopf-gold" disabled={!p?.ok} onClick={() => p && onAngriff(p, false)} data-ti-kaempfen>Belagern</button>
      </>}>
      <p className="ti-prosa">Wälle aus Stein, Geschütze hinter Brustwehren{verteidiger.length > 1 ? ', davor die Wachschiffe' : ''}. Wer die Festung nimmt, holt die Hälfte dessen, was im Lager und nicht in der Schatzkammer liegt – und Ruhm. Wer scheitert, kommt so davon wie gegen Piraten: geschleppt, halbe Ladung, ein Zehntel des Golds.</p>
      <div className="ti-gitter" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {verteidiger.map(f => (
          <div key={f.id} className="ti-kasten" style={{ padding: '8px 10px' }}>
            <b>{f.art === 'fort' ? 'Die Festung' : `„${f.name}“`}</b>
            <p className="ti-stumm">Rumpf {f.rumpf}{f.rumpf < f.rumpfMax ? `/${f.rumpfMax} (beschädigt)` : ''} · {f.kanonen} Kanonen{f.art === 'segler' ? ` je Seite · ${f.crewMax} Mann` : ' in alle Richtungen, bis 3 Felder'}</p>
          </div>
        ))}
      </div>
      {!p && <p className="ti-stumm" style={{ marginTop: 10 }} data-ti-kundschaft>Kundschafter sehen nach, wie es um die Festung steht …</p>}
      {p && !p.ok && <p className="ti-fehler" style={{ marginTop: 10 }} data-ti-gesperrt>{p.grund}</p>}
      {p?.ok && p.ziel && (
        <ul className="ti-folgen" style={{ marginTop: 10 }} data-ti-belagerung-aussicht>
          <li>Beute bei einem Sieg: {p.ziel.beute ? `${p.ziel.beute} ${ware}` : 'nichts – das Lager ist leer oder dein Laderaum voll'}</li>
          {p.ziel.kg > 0 && <li>Kopfgeld der Admiralität: {zahl(p.ziel.kg)} Gold</li>}
          {p.ziel.vg && <li>Vergeltung: Die Admiralität belohnt sie obendrauf</li>}
        </ul>
      )}
      {e && <p style={{ marginTop: 8 }}><span className={`ti-marke ti-marke-${e.art}`} data-ti-einschaetzung>{e.text}</span></p>}
      {p?.ok && p.belagert.length > 0 && <p className="ti-fehler" style={{ marginTop: 8 }} data-ti-belagert>Gerade {p.belagert.length > 1 ? 'belagern' : 'belagert'} schon Kpt. {p.belagert.join(' und Kpt. ')} diese Festung. Wer zuerst fertig ist, zählt – das Gefecht des anderen gilt als Übung.</p>}
    </Blatt>
  )
}

function lage(st: Stellung): string {
  const g = st.gegner
  if (st.art === 'hinterhalt') {
    const n = piratName(g.saat)
    return st.gewarnt
      ? `Der Ausguck hat sie rechtzeitig gesehen: Hinter der Landzunge lauert die „${n.schiff}“. Noch hat sie euch nicht in der Falle.`
      : `Aus dem Schatten einer Insel schießt die „${n.schiff}“ hervor – schon liegt ihre Breitseite auf euch.`
  }
  if (st.art === 'gestellt') {
    if (g.art === 'pirat') { const n = piratName(g.saat); return `Die „${n.schiff}“ dreht bei und setzt die schwarze Flagge. Kanonen schieben sich aus den Pforten, und ein Ruf schallt herüber: Zoll – oder Blei!` }
    if (g.art === 'krake') return 'Das Wasser vor dem Bug beginnt zu brodeln. Ein Arm, dick wie ein Mast, tastet nach der Reling …'
    if (g.art === 'schlange') return 'Etwas Langes gleitet unter dem Kiel hindurch. Dann hebt sich ein Kopf aus dem Wasser, größer als die Jolle im Hamburger Hafen.'
    return 'Aus dem Nebel schält sich ein Schiff ohne Licht und ohne Mannschaft an Deck – und es segelt gegen den Wind.'
  }
  if (g.art === 'nest') return 'In der Bucht liegt das Nest: eine Batterie auf dem Felsen, zwei Schiffe davor. Wer es aushebt, findet, was die Piraten über Jahre zusammengeraubt haben.'
  if (g.art === 'gross') return 'Alle Kapitäne kämpfen gegen denselben Gegner. Jeder Treffer zählt, auch deiner – und wenn er fällt, wird die Beute nach Anteil am Schaden geteilt. Ein Angriff je Tag, höchstens sechs Runden.'
  if (g.art === 'pirat') { const n = piratName(g.saat); return `Vor dir liegt die „${n.schiff}“ von Kpt. ${n.kapitaen}. Wer sie aufbringt, bekommt die Beute – und im nächsten Hafen ein Kopfgeld.` }
  return 'Noch hat es dich nicht bemerkt.'
}

/** grobe Einschätzung aus der Aufstellung: Stärke der eigenen Seite gegen die der anderen */
function einschaetzung(st: Stellung, grossRest?: number): { text: string; art: 'gut' | 'gold' | 'rot' } {
  const sp = useTerra.getState().spiel
  if (!sp) return { text: '', art: 'gold' }
  if (st.gegner.art === 'gross') return { text: 'Kein Kampf auf Sieg: Wie viel Schaden richtest du an, bevor er sich zurückzieht?', art: 'gold' }
  const k = neuerKampf(kampfStart(sp, st, umwelt(), false, grossRest ? { rest: grossRest, max: grossRest } : undefined))
  const v = staerke(k, 0) / Math.max(1, staerke(k, 1))
  if (v >= 1.6) return { text: 'Du bist klar überlegen.', art: 'gut' }
  if (v >= 1.1) return { text: 'Ein leichter Vorteil für dich.', art: 'gut' }
  if (v >= 0.8) return { text: 'Ein Kampf auf Augenhöhe.', art: 'gold' }
  if (v >= 0.5) return { text: 'Der Gegner ist dir überlegen.', art: 'rot' }
  return { text: 'Der Gegner ist dir weit überlegen – das geht kaum gut.', art: 'rot' }
}

export interface StellungProps {
  stellung: Stellung
  onKampf: () => void
  onSofort: () => void
  onZoll?: () => void
  onFlucht?: () => void
  onAbdrehen?: () => void
  /** warum (gerade) nicht gekämpft werden kann — z. B. großer Gegner schon bezwungen */
  gesperrt?: string
  /** großer Gegner: übriger und voller Lebensbalken */
  gross?: { rest: number; max: number; teilnehmer: number }
}

export function StellungBlatt({ stellung: st, onKampf, onSofort, onZoll, onFlucht, onAbdrehen, gesperrt, gross }: StellungProps) {
  const gold = useTerra(s => s.spiel?.stand.gold ?? 0)
  const klasse = useTerra(s => s.spiel?.stand.klasse ?? 0)
  const kopf = gegnerKopf(st.gegner)
  const e = einschaetzung(st)
  const feinde = gegnerSchiffe(st.gegner, klasse, gross?.rest ?? 1, gross?.max ?? 1)
  const ueber = st.art === 'hinterhalt' ? (st.gewarnt ? 'Hinterhalt – rechtzeitig gesehen' : 'Hinterhalt!') : kopf.ueber
  return (
    <Blatt kennung="stellung" bild={gegnerBild(st.gegner)} ueber={ueber} titel={kopf.titel} breit
      fuss={<>
        {onAbdrehen && <button type="button" className="ti-knopf ti-knopf-leise" onClick={onAbdrehen} data-ti-abdrehen>Abdrehen</button>}
        {onFlucht && st.flucht > 0 && <button type="button" className="ti-knopf" onClick={onFlucht} data-ti-flucht>Flucht versuchen ({st.flucht} %)</button>}
        {onZoll && st.zoll > 0 && <button type="button" className="ti-knopf" disabled={gold < st.zoll} onClick={onZoll} title={gold < st.zoll ? 'So viel Gold ist nicht in der Kasse.' : undefined} data-ti-zoll>Zoll zahlen ({zahl(st.zoll)} Gold)</button>}
        <button type="button" className="ti-knopf" disabled={!!gesperrt} onClick={onSofort} title="Die Mannschaft kämpft selbst – das Ergebnis steht sofort fest" data-ti-sofort>Sofort auskämpfen</button>
        <button type="button" className="ti-knopf ti-knopf-gold" disabled={!!gesperrt} onClick={onKampf} data-ti-kaempfen>{st.art === 'gestellt' || st.art === 'hinterhalt' ? 'Kämpfen' : 'Angreifen'}</button>
      </>}>
      <p className="ti-prosa">{lage(st)}</p>
      {gross && (
        <div style={{ marginTop: 10 }} data-ti-gross-balken>
          <div className="ti-balken" style={{ width: '100%', height: 12 }}><i style={{ width: `${Math.max(0, Math.min(100, Math.round((gross.rest * 100) / Math.max(1, gross.max))))}%`, background: 'var(--ti-gefahr)' }} /></div>
          <p className="ti-stumm" style={{ marginTop: 4 }}>Noch {zahl(Math.max(0, gross.rest))} von {zahl(gross.max)} · {gross.teilnehmer} {gross.teilnehmer === 1 ? 'Kapitän kämpft' : 'Kapitäne kämpfen'} mit</p>
        </div>
      )}
      <div className="ti-gitter" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {feinde.map(f => (
          <div key={f.id} className="ti-kasten" style={{ padding: '8px 10px' }}>
            <b>{f.boss ? f.name : f.art === 'fort' ? 'Batterie auf dem Felsen' : f.art === 'segler' ? `„${f.name}“` : f.name}</b>
            <p className="ti-stumm">{f.boss ? 'zählt nur den Schaden' : `Rumpf ${f.rumpfMax}`}{f.kanonen ? ` · ${f.kanonen} Kanonen${f.art === 'segler' || f.art === 'geist' ? ' je Seite' : ''}` : ''}{f.art === 'segler' ? ` · ${f.crewMax} Mann` : ''}{f.art === 'krake' ? ' · packt zu und hält fest' : f.art === 'schlange' ? ' · taucht jede zweite Runde ab' : f.art === 'geist' ? ' · nur Kugeln wirken' : ''}</p>
          </div>
        ))}
      </div>
      {e.text && <p style={{ marginTop: 10 }}><span className={`ti-marke ti-marke-${e.art}`} data-ti-einschaetzung>{e.text}</span></p>}
      {gesperrt && <p className="ti-fehler" style={{ marginTop: 8 }} data-ti-gesperrt>{gesperrt}</p>}
      {!gesperrt && (st.art === 'gestellt' || st.art === 'hinterhalt') && <p className="ti-stumm" style={{ marginTop: 8 }}>Wer verliert, wird mit schwer beschädigtem Rumpf in den letzten Hafen geschleppt – die halbe Ladung und ein Zehntel des Golds sind dann weg.</p>}
    </Blatt>
  )
}

const AUSGANG_UEBER: Record<string, string> = { sieg: 'Sieg', niederlage: 'Niederlage', flucht: 'Entkommen', remis: 'Ohne Entscheidung' }
/** zustellung (nur nach der Belagerung einer Festung): 'laeuft' = der Bericht ist unterwegs, null = gerade nicht
 *  zustellbar (wird nachgeholt), sonst das Ergebnis */
export function KampfEndeBlatt({ folge, gegner, onZu, onWiederholung, zustellung }: { folge: KampfFolge; gegner: Gegner; onZu: () => void; onWiederholung?: () => void; zustellung?: Zustellung | 'laeuft' | null }) {
  return (
    <Blatt kennung="kampf-ende" bild={gegnerBild(gegner)} ueber={AUSGANG_UEBER[folge.ausgang]} titel={folge.titel}
      fuss={<>
        {onWiederholung && <button type="button" className="ti-knopf ti-knopf-leise" onClick={onWiederholung} data-ti-wiederholung-zeigen>Wiederholung ansehen</button>}
        <button type="button" className="ti-knopf ti-knopf-gold" onClick={onZu} data-ti-weiter autoFocus>Weiter</button>
      </>}>
      <p className="ti-prosa" data-ti-ausgang={folge.ausgang}>{folge.text}</p>
      <Folgen zeilen={folge.zeilen} />
      {zustellung === 'laeuft' && <p className="ti-stumm" style={{ marginTop: 8 }} data-ti-zustellung="laeuft">Der Bericht geht an die Admiralität …</p>}
      {zustellung === null && <p className="ti-stumm" style={{ marginTop: 8 }} data-ti-zustellung="spaeter">Das Netzlaufwerk antwortet gerade nicht. Der Bericht wird zugestellt, sobald es wieder da ist – bis dahin bleibt die Beute offen.</p>}
      {zustellung && zustellung !== 'laeuft' && zustellung.titel && (
        <div style={{ marginTop: 10 }} data-ti-zustellung={zustellung.zaehlt ? 'beute' : 'uebung'}>
          <p><b>{zustellung.titel}</b></p>
          <Folgen zeilen={zustellung.zeilen} />
        </div>
      )}
    </Blatt>
  )
}
