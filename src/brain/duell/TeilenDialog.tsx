// Dialog „Ergebnis teilen“: Chat an ausgewählte Kollegen und/oder Bestenliste. Beides freiwillig.
import { useEffect, useMemo, useState } from 'react'
import { Check, Send, Trophy, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { ladeNutzer, sicher, type ChatNutzer } from '../../services/chat'
import type { IqEintrag } from '../kern/typen'
import { bereichText, iqText } from '../iq/irt'
import { iqTextFuerChat, teileImChat, veroeffentliche } from './teilen'

export default function TeilenDialog({ eintrag, onZu }: { eintrag: IqEintrag; onZu: () => void }) {
  const benutzer = useAuthStore(s => s.session?.user)
  const ich = useMemo(() => ({ username: benutzer?.username ?? '', displayName: benutzer?.displayName ?? benutzer?.username ?? '' }), [benutzer])
  const [nutzer, setNutzer] = useState<ChatNutzer[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set())
  const [chatStand, setChatStand] = useState<'' | 'sendet' | string>('')
  const [listeStand, setListeStand] = useState<'' | 'schreibt' | 'drin' | 'fehler'>('')

  useEffect(() => {
    let weg = false
    ladeNutzer().then(n => { if (!weg) setNutzer(n.filter(x => sicher(x.username) !== sicher(ich.username))) }).catch(() => { if (!weg) setNutzer([]) })
    return () => { weg = true }
  }, [ich.username])

  const schalte = (u: string) => setGewaehlt(alt => { const n = new Set(alt); if (n.has(u)) n.delete(u); else n.add(u); return n })
  const sendeChat = async () => {
    if (!nutzer || !gewaehlt.size) return
    setChatStand('sendet')
    const an = nutzer.filter(n => gewaehlt.has(n.username)).map(n => ({ username: n.username, displayName: n.displayName }))
    const ok = await teileImChat(ich, an, eintrag)
    setChatStand(ok === an.length ? `An ${ok} ${ok === 1 ? 'Person' : 'Personen'} gesendet.` : `${ok} von ${an.length} gesendet — beim Rest hat es nicht geklappt (Netzlaufwerk?).`)
    if (ok === an.length) setGewaehlt(new Set())
  }
  const inListe = async () => {
    setListeStand('schreibt')
    setListeStand((await veroeffentliche(ich, eintrag)) ? 'drin' : 'fehler')
  }

  return (
    <div className="bt-schleier" role="dialog" aria-modal="true" aria-labelledby="bt-teilen-titel" data-bt-teilen>
      <div className="bt-karte bt-dialog bt-ein" style={{ maxWidth: 640, maxHeight: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h2 className="bt-h2" id="bt-teilen-titel" style={{ flex: 1 }}>Ergebnis teilen</h2>
          <button type="button" className="bt-knopf bt-knopf-nackt" onClick={onZu} aria-label="Schließen" data-bt-teilen-zu><X size={16} /></button>
        </div>
        <p className="bt-klein bt-leise" style={{ margin: '0 0 14px' }}>
          Geteilt wird nur: Schätzwert <b style={{ color: 'var(--bt-ink)' }}>{iqText(eintrag.iq)}</b>, Bereich {bereichText(eintrag.von, eintrag.bis)}, {eintrag.fragen} Fragen und das Datum. Deine einzelnen Antworten und dein Trainingsverlauf bleiben bei dir.
        </p>

        <section style={{ padding: 14, borderRadius: 13, border: '1px solid var(--bt-rand)', background: 'var(--bt-bg2)', marginBottom: 12 }}>
          <div className="bt-h3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Send size={15} />Im Chat an Kollegen senden</div>
          <div className="bt-klein bt-leise" style={{ margin: '2px 0 10px' }}>Nur die ausgewählten Personen sehen die Nachricht.</div>
          {nutzer === null ? <div className="bt-klein bt-stumm">Lädt …</div>
            : nutzer.length === 0 ? <div className="bt-klein bt-stumm">Es sind keine Kollegen im Chat bekannt.</div> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 132, overflowY: 'auto' }}>
                {nutzer.map(n => (
                  <button key={n.username} type="button" className={`bt-chip ${gewaehlt.has(n.username) ? 'bt-chip-akzent' : ''}`} style={{ cursor: 'pointer', padding: '5px 11px' }}
                    aria-pressed={gewaehlt.has(n.username)} onClick={() => schalte(n.username)} data-bt-teilen-nutzer={n.username}>
                    {gewaehlt.has(n.username) && <Check size={12} />}{n.displayName}{n.online ? '' : ' (nicht da)'}
                  </button>
                ))}
              </div>
            )}
          <details style={{ marginTop: 10 }}>
            <summary className="bt-klein bt-stumm" style={{ cursor: 'pointer' }}>So sieht die Nachricht aus</summary>
            <div className="bt-klein" style={{ marginTop: 6 }}>{iqTextFuerChat(eintrag)}</div>
          </details>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button type="button" className="bt-knopf" disabled={!gewaehlt.size || chatStand === 'sendet'} onClick={() => void sendeChat()} data-bt-teilen-senden>
              <Send size={14} />{chatStand === 'sendet' ? 'Sendet …' : gewaehlt.size ? `An ${gewaehlt.size} senden` : 'Senden'}
            </button>
            {chatStand && chatStand !== 'sendet' && <span className="bt-klein" data-bt-teilen-chatstand>{chatStand}</span>}
          </div>
        </section>

        <section style={{ padding: 14, borderRadius: 13, border: '1px solid var(--bt-rand)', background: 'var(--bt-bg2)' }}>
          <div className="bt-h3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Trophy size={15} />In die Bestenliste eintragen</div>
          <div className="bt-klein bt-leise" style={{ margin: '2px 0 10px' }}>Die Liste sehen alle, die das Tool nutzen (Brain Trainer → Duelle). Dein Eintrag ersetzt einen früheren und lässt sich dort jederzeit wieder entfernen.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="bt-knopf bt-knopf-leise" disabled={listeStand === 'schreibt' || listeStand === 'drin'} onClick={() => void inListe()} data-bt-teilen-liste>
              {listeStand === 'drin' ? <><Check size={14} />Eingetragen</> : <><Trophy size={14} />Eintragen</>}
            </button>
            {listeStand === 'fehler' && <span className="bt-klein" style={{ color: 'var(--bt-schlecht)' }}>Hat nicht geklappt (Netzlaufwerk nicht erreichbar?).</span>}
          </div>
        </section>
      </div>
    </div>
  )
}
