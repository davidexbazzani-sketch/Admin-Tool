// Parla Italiano — die Reisegruppe: Level aller Benutzer (Vorgabe: für alle sichtbar).
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Trophy, Users } from 'lucide-react'
import { useItaliano } from '../kern/speicher'
import { ladeGruppe } from '../kern/gruppe'
import type { GruppenEintrag } from '../kern/typen'
import { LEVEL_ANZAHL } from '../kern/inhaltTypen'
import { abschnittVon, station, AM_ZIEL, STATIONEN } from '../kern/lehrplan'
import { datumText } from '../kern/zeit'
import { Laedt } from '../ablauf/gemeinsam'

const ortVon = (level: number): string => (level >= AM_ZIEL ? 'am Ziel' : station(level).ort)

export default function Reisegruppe() {
  const benutzer = useItaliano(s => s.benutzer)
  const meinLevel = useItaliano(s => s.daten.level)
  const [gruppe, setGruppe] = useState<GruppenEintrag[] | null>(null)
  const [laedt, setLaedt] = useState(false)

  const hole = () => { setLaedt(true); void ladeGruppe().then(g => { setGruppe(g); setLaedt(false) }) }
  useEffect(hole, [])

  // der eigene Eintrag ist immer dabei — auch wenn das Netzlaufwerk gerade nicht erreichbar ist
  const liste = useMemo(() => {
    const ich = benutzer.toLowerCase()
    const andere = (gruppe ?? []).filter(e => e.username.toLowerCase() !== ich)
    const mein = (gruppe ?? []).find(e => e.username.toLowerCase() === ich)
    const alle = [...andere, { username: ich, displayName: mein?.displayName ?? benutzer, level: meinLevel, seit: mein?.seit ?? '' }]
    return alle.sort((a, b) => b.level - a.level || a.seit.localeCompare(b.seit) || a.displayName.localeCompare(b.displayName, 'de'))
  }, [gruppe, benutzer, meinLevel])

  // wie viele stehen an welcher Station?
  const jeStation = useMemo(() => {
    const m = new Map<number, number>()
    for (const e of liste) m.set(Math.min(e.level, AM_ZIEL), (m.get(Math.min(e.level, AM_ZIEL)) ?? 0) + 1)
    return m
  }, [liste])
  const meist = Math.max(1, ...jeStation.values())

  if (!gruppe) return <Laedt text="Die Reisegruppe wird geladen …" />
  return (
    <div className="pi-breite pi-spalte" data-pi-gruppe>
      <div className="pi-reihe" style={{ justifyContent: 'space-between' }}>
        <div><h1 className="pi-h1">Reisegruppe</h1><p className="pi-leise">Wer ist wie weit? Zu sehen sind nur Name und Level – Ergebnisse bleiben privat.</p></div>
        <button type="button" className="pi-knopf pi-knopf-leise" onClick={hole} disabled={laedt}><RefreshCw size={15} />Aktualisieren</button>
      </div>

      <div className="pi-raster pi-raster-2">
        <div className="pi-karte" style={{ padding: 8 }} data-pi-gruppe-liste>
          {liste.map((e, i) => {
            const ich = e.username.toLowerCase() === benutzer.toLowerCase()
            return (
              <div key={e.username} className="pi-zeile" data-ich={ich ? '1' : undefined} data-pi-mitreisender={e.username}>
                <span className="pi-zahl pi-stumm" style={{ width: 22, textAlign: 'right', fontWeight: 700 }}>{i + 1}</span>
                <span className="pi-kopfbild" style={{ background: ich ? 'var(--pi-akzent)' : 'var(--pi-viz-grau)' }} aria-hidden>{e.displayName.slice(0, 1).toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.displayName}{ich ? ' (du)' : ''}</b>
                  <span className="pi-leise pi-klein">{ortVon(e.level)}{e.level < AM_ZIEL ? ` · ${abschnittVon(e.level).cefr}` : ' · B1'}{e.seit ? ` · seit ${datumText(e.seit)}` : ''}</span>
                </span>
                <span className={`pi-chip ${e.level >= AM_ZIEL ? 'pi-chip-gold' : 'pi-chip-akzent'}`}>{e.level >= AM_ZIEL ? <><Trophy size={12} />Ziel</> : `Level ${e.level}`}</span>
              </div>
            )
          })}
          {liste.length === 1 && <p className="pi-leise pi-klein" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 6 }}><Users size={13} style={{ flexShrink: 0 }} />Noch reist du allein. Sobald Kollegen anfangen, tauchen sie hier auf.</p>}
        </div>

        <div className="pi-karte pi-spalte" style={{ gap: 6 }}>
          <h3 className="pi-h3">Wo die Gruppe gerade ist</h3>
          {[...STATIONEN.map(s => s.level), AM_ZIEL].filter(l => jeStation.has(l) || l === meinLevel).map(l => (
            <div key={l} className="pi-reihe" style={{ flexWrap: 'nowrap' }}>
              <span className="pi-klein" style={{ width: 132, fontWeight: l === Math.min(meinLevel, AM_ZIEL) ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l >= AM_ZIEL ? 'Am Ziel' : `${l} · ${station(l).ort}`}</span>
              <div className="pi-balken" style={{ flex: 1 }}><i style={{ width: `${((jeStation.get(l) ?? 0) / meist) * 100}%`, background: 'var(--pi-viz-1)' }} /></div>
              <span className="pi-zahl pi-klein pi-leise" style={{ width: 20, textAlign: 'right' }}>{jeStation.get(l) ?? 0}</span>
            </div>
          ))}
          <p className="pi-klein pi-stumm" style={{ marginTop: 6 }}>{liste.length} {liste.length === 1 ? 'Person' : 'Personen'} unterwegs · {LEVEL_ANZAHL} Stationen bis Cagliari</p>
        </div>
      </div>
    </div>
  )
}
