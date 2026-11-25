// Parla Italiano — Bausteine zum Zeigen: Lautsprecher, Wortkarte, Einstieg, Grammatik, Dialog, Wissen.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, Check, Languages, Lightbulb, MapPin, Mic, Pause, Play, Target, Volume2 } from 'lucide-react'
import type { Dialog, DialogZeile, Grammatik, Sprecher } from '../kern/inhaltTypen'
import type { ADialog, AEinstieg, AGrammatik, AKarte, ANachsprechen, AWissen, TonStelle } from '../kern/typen'
import { hatStelle, ladeTon, spiele, stoppeTon } from '../kern/ton'

/** **fett** und Zeilenumbrüche aus den Inhalten darstellen */
export function reich(text: string): ReactNode {
  return text.split('\n').filter(z => z.trim()).map((zeile, i) => (
    <p key={i}>{zeile.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((s, k) =>
      s.startsWith('**') && s.endsWith('**') ? <b key={k}>{s.slice(2, -2)}</b>
        : s.startsWith('*') && s.endsWith('*') && s.length > 2 ? <i key={k}>{s.slice(1, -1)}</i> : s)}</p>
  ))
}

/** Erst wenn die Zeitmarken da sind, weiß man, ob es zu einer Stelle Ton gibt. */
export function useTonDa(stelle: TonStelle | undefined, an: boolean): boolean {
  const [da, setDa] = useState(() => an && hatStelle(stelle))
  useEffect(() => {
    if (!an || !stelle) { setDa(false); return }
    let lebt = true
    void ladeTon().then(() => { if (lebt) setDa(hatStelle(stelle)) })
    return () => { lebt = false }
  }, [an, stelle?.tag, stelle?.art, stelle?.nr])   // eslint-disable-line react-hooks/exhaustive-deps
  return da
}

/** Lautsprecher-Knopf. `auto` spielt beim Erscheinen einmal ab. */
export function Laut({ stelle, an, langsam, gross, auto, titel }: { stelle: TonStelle | undefined; an: boolean; langsam?: boolean; gross?: boolean; auto?: boolean; titel?: string }) {
  const da = useTonDa(stelle, an)
  const [laeuft, setLaeuft] = useState(false)
  const lebt = useRef(true)
  useEffect(() => { lebt.current = true; return () => { lebt.current = false } }, [])
  const ab = useCallback(() => {
    if (!stelle) return
    setLaeuft(true)
    void spiele(stelle, !!langsam).finally(() => { if (lebt.current) setLaeuft(false) })
  }, [stelle?.tag, stelle?.art, stelle?.nr, langsam])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (auto && da) ab() }, [auto, da, ab])
  useEffect(() => () => stoppeTon(), [])
  if (!da) return null
  return (
    <button type="button" className={`pi-laut ${gross ? 'pi-laut-gross' : ''}`} data-an={laeuft ? '1' : undefined} onClick={ab} aria-label={titel ?? 'Anhören'} title={titel ?? 'Anhören'} data-pi-laut>
      <Volume2 size={gross ? 36 : 20} />
    </button>
  )
}

// ── Figuren ──
const FIGUR: Record<Sprecher, { name: string; farbe: string }> = {
  ben: { name: 'Ben', farbe: '#3B82B8' },
  giulia: { name: 'Giulia', farbe: '#D2603A' },
  nonna: { name: 'Nonna Rosa', farbe: '#B8892B' },
  marco: { name: 'Marco', farbe: '#5C8A3C' },
  sofia: { name: 'Sofia', farbe: '#A0527A' },
  luca: { name: 'Luca', farbe: '#6B6E86' },
  uomo: { name: 'Mann', farbe: '#7A6A58' },
  donna: { name: 'Frau', farbe: '#8A6A7A' },
}
export const sprecherName = (z: DialogZeile): string => z.als || FIGUR[z.wer]?.name || z.wer

// ── Einstieg in den Lerntag ──
export function Einstieg({ a }: { a: AEinstieg }) {
  return (
    <div className="pi-karte pi-ein pi-spalte" data-pi-einstieg>
      <div className="pi-reihe"><span className="pi-chip pi-chip-akzent"><MapPin size={12} />{a.ort} · Level {a.level}</span><span className="pi-chip">Lerntag {a.tag}</span></div>
      <h2 className="pi-h1">{a.titel}</h2>
      <div className="pi-reihe" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <span className="pi-symbol pi-symbol-gruen"><Target size={18} /></span>
        <p style={{ fontSize: 16 }}>{a.ziel}</p>
      </div>
      {a.rueckblick && (
        <div className="pi-karte-flach">
          <div className="pi-ober" style={{ marginBottom: 4 }}>Was bisher geschah</div>
          <p className="pi-leise">{a.rueckblick}</p>
        </div>
      )}
      <p className="pi-klein pi-stumm">Rund 10 Minuten: neue Wörter, ein Stück Grammatik und die nächste Folge der Geschichte. Danach wartet der Tagestest.</p>
    </div>
  )
}

// ── Wortkarte ──
export function Wortkarte({ a, ton, langsam }: { a: AKarte; ton: boolean; langsam: boolean }) {
  return (
    <div className="pi-karte pi-wortkarte pi-ein" data-pi-karte={a.wort}>
      <span className="pi-ober">Neues Wort</span>
      {a.w.emoji && <span className="pi-emoji" aria-hidden>{a.w.emoji}</span>}
      <div className="pi-reihe" style={{ justifyContent: 'center' }}>
        <span className="pi-wort" lang="it">{a.w.it}</span>
        <Laut stelle={a.ton} an={ton} langsam={langsam} auto />
      </div>
      <span className="pi-aus" title="Aussprache: die großgeschriebene Silbe wird betont">{a.w.aus}</span>
      <span className="pi-de">{a.w.de}</span>
      <div className="pi-beispiel">
        <div className="pi-it" lang="it">{a.w.bsp.it}</div>
        <div className="pi-leise pi-klein">{a.w.bsp.de}</div>
      </div>
      {a.w.hinweis && <p className="pi-klein pi-leise" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', textAlign: 'left' }}><Lightbulb size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--pi-gold)' }} />{a.w.hinweis}</p>}
    </div>
  )
}

// ── Grammatik ──
export function GrammatikInhalt({ g }: { g: Grammatik }) {
  return (
    <>
      <div className="pi-text">{reich(g.erklaerung)}</div>
      {g.tabelle && (
        <div className="pi-karte-flach" style={{ padding: 4 }}>
          <table className="pi-tabelle">
            <thead><tr>{g.tabelle.kopf.map((k, i) => <th key={i}>{k}</th>)}</tr></thead>
            <tbody>{g.tabelle.zeilen.map((z, i) => <tr key={i}>{z.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="pi-spalte" style={{ gap: 8 }}>
        {g.beispiele.map((b, i) => (
          <div key={i} className="pi-beispiel" style={{ marginTop: 0 }}>
            <div className="pi-it" lang="it">{b.it}</div>
            <div className="pi-leise pi-klein">{b.de}</div>
          </div>
        ))}
      </div>
    </>
  )
}
export function GrammatikKarte({ a }: { a: AGrammatik }) {
  return (
    <div className="pi-karte pi-ein pi-spalte" data-pi-grammatik>
      <div className="pi-reihe"><span className="pi-symbol"><BookOpen size={18} /></span><div><div className="pi-ober">Grammatik in zwei Minuten</div><h2 className="pi-h2">{a.g.titel}</h2></div></div>
      <GrammatikInhalt g={a.g} />
    </div>
  )
}

// ── Lo sapevi? ──
export function WissenKarte({ a }: { a: AWissen }) {
  return (
    <div className="pi-karte pi-ein pi-spalte" data-pi-wissen>
      <div className="pi-reihe"><span className="pi-symbol pi-symbol-gold"><Lightbulb size={18} /></span><div><div className="pi-ober" lang="it">Lo sapevi?</div><h2 className="pi-h2">{a.titel}</h2></div></div>
      <p style={{ fontSize: 15 }}>{a.text}</p>
    </div>
  )
}

// ── Nachsprechen ──
/** Sprechen üben: Satz anhören, laut nachsprechen, abhaken. Das Tool hört nicht zu — es geht ums Tun. */
export function Nachsprechen({ a, ton, langsam }: { a: ANachsprechen; ton: boolean; langsam: boolean }) {
  const [gesagt, setGesagt] = useState<Record<number, boolean>>({})
  return (
    <div className="pi-karte pi-ein pi-spalte" data-pi-nachsprechen>
      <div className="pi-reihe"><span className="pi-symbol pi-symbol-blau"><Mic size={18} /></span><div><div className="pi-ober" lang="it">Ripeti!</div><h2 className="pi-h2">Sprich laut nach</h2></div></div>
      <p className="pi-leise">Hör den Satz an und sag ihn laut – ruhig zwei-, dreimal. So gewöhnt sich der Mund an die Sprache. Niemand hört zu, auch das Tool nicht.</p>
      {a.saetze.map((s, i) => (
        <div key={i} className="pi-karte-flach pi-reihe" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
          <Laut stelle={s.ton} an={ton} langsam={langsam} auto={i === 0} />
          <div style={{ flex: 1 }}><div className="pi-it" lang="it" style={{ fontSize: 19, fontWeight: 700 }}>{s.it}</div><div className="pi-leise pi-klein">{s.de}</div></div>
          <button type="button" className={`pi-knopf ${gesagt[i] ? 'pi-knopf-gruen' : 'pi-knopf-leise'}`} onClick={() => setGesagt(g => ({ ...g, [i]: true }))} aria-pressed={!!gesagt[i]} data-pi-gesagt={i}>{gesagt[i] ? <><Check size={15} />Gesagt</> : 'Gesagt!'}</button>
        </div>
      ))}
    </div>
  )
}

// ── Dialog ──
export function DialogInhalt({ d, tag, ton, langsam }: { d: Dialog; tag: number; ton: boolean; langsam: boolean }) {
  const [deutsch, setDeutsch] = useState(false)
  const [offen, setOffen] = useState<Record<number, boolean>>({})
  const [an, setAn] = useState<number | null>(null)
  const lauf = useRef(0)
  const tonDa = useTonDa({ tag, art: 'd', nr: 0 }, ton)

  const stopp = useCallback(() => { lauf.current++; stoppeTon(); setAn(null) }, [])
  const alles = useCallback(async (ab = 0) => {
    const meins = ++lauf.current
    for (let i = ab; i < d.zeilen.length; i++) {
      if (lauf.current !== meins) return
      setAn(i)
      await spiele({ tag, art: 'd', nr: i }, langsam)
      if (lauf.current !== meins) return
      await new Promise(r => setTimeout(r, 280))
    }
    if (lauf.current === meins) setAn(null)
  }, [d, tag, langsam])
  useEffect(() => () => { lauf.current++; stoppeTon() }, [])

  return (
    <div className="pi-spalte" style={{ gap: 10 }}>
      <div className="pi-reihe">
        {tonDa && (an === null
          ? <button type="button" className="pi-knopf pi-knopf-leise" onClick={() => void alles(0)} data-pi-dialog-hoeren><Play size={15} />Anhören</button>
          : <button type="button" className="pi-knopf pi-knopf-leise" onClick={stopp}><Pause size={15} />Anhalten</button>)}
        <button type="button" className="pi-knopf pi-knopf-nackt" onClick={() => setDeutsch(x => !x)} aria-pressed={deutsch} data-pi-dialog-deutsch><Languages size={15} />{deutsch ? 'Übersetzung ausblenden' : 'Übersetzung zeigen'}</button>
      </div>
      {d.zeilen.map((z, i) => {
        const f = FIGUR[z.wer] ?? FIGUR.uomo
        const name = sprecherName(z)
        const zeig = deutsch || offen[i]
        return (
          <div key={i} className="pi-sprech" data-seite={z.wer === 'ben' ? 'r' : 'l'} data-an={an === i ? '1' : undefined}>
            <span className="pi-kopfbild" style={{ background: f.farbe }} title={name} aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
            <div className="pi-sprech-blase">
              <div className="pi-klein pi-stumm" style={{ fontWeight: 700 }}>{name}</div>
              <button type="button" onClick={() => { setOffen(o => ({ ...o, [i]: !o[i] })); if (tonDa && an === null) void spiele({ tag, art: 'd', nr: i }, langsam) }} style={{ textAlign: 'left' }} title="Antippen: Übersetzung zeigen" data-pi-zeile={i}>
                <span className="pi-it" lang="it" style={{ fontSize: 17 }}>{z.it}</span>
              </button>
              {zeig && <div className="pi-leise pi-klein pi-ein">{z.de}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
export function DialogKarte({ a, ton, langsam }: { a: ADialog; ton: boolean; langsam: boolean }) {
  return (
    <div className="pi-karte pi-ein pi-spalte" data-pi-dialog>
      <div>
        <div className="pi-ober">Die Geschichte geht weiter</div>
        <h2 className="pi-h2 pi-it" lang="it">{a.d.titel}</h2>
        <p className="pi-leise pi-klein">{a.d.ort}</p>
      </div>
      <DialogInhalt d={a.d} tag={a.tag} ton={ton} langsam={langsam} />
      <p className="pi-klein pi-stumm">Tipp: Lies oder höre erst alles auf Italienisch. Tippe auf einen Satz, wenn du die Übersetzung brauchst.</p>
    </div>
  )
}
