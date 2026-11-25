// Terra Incognita — Flaschenpost: eine finden, eine aussetzen.
import { useState } from 'react'
import { wirfFlasche, type FremdFlasche } from '../netz/gemeinsam'
import { useTerra } from '../speicher'
import { klang } from '../ton/klang'
import { tagText } from '../zeit'
import { Blatt, toast } from './teile'

export function FlascheGefunden({ flasche, onZu }: { flasche: FremdFlasche; onZu: () => void }) {
  const tue = useTerra(s => s.tue)
  const nimm = (): void => {
    tue(sp => { if (!sp.stand.atlas.flaschen.includes(flasche.id)) { sp.stand.atlas.flaschen.push(flasche.id); if (sp.stand.atlas.flaschen.length > 400) sp.stand.atlas.flaschen.shift(); sp.stand.ruhm += 5; sp.stand.zug++ } })
    klang('fund')
    onZu()
  }
  return (
    <Blatt kennung="flasche" bild="see" ueber="Im Kielwasser blinkt etwas" titel="Flaschenpost" fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={nimm} data-ti-weiter autoFocus>Aufbewahren (+5 Ruhm)</button>}>
      <p className="ti-prosa" style={{ padding: '12px 14px', background: 'var(--ti-flaeche)', borderRadius: 6, fontStyle: 'italic' }} data-ti-flaschentext>„{flasche.text}“</p>
      <p className="ti-stumm" style={{ marginTop: 8 }}>Ausgesetzt von Kpt. {flasche.von} am {tagText(flasche.tag)}.</p>
    </Blatt>
  )
}

export function FlascheSchreiben({ onZu }: { onZu: () => void }) {
  const [text, setText] = useState('')
  return (
    <Blatt kennung="flasche-schreiben" ueber="Eine leere Flasche, ein Blatt, ein Korken" titel="Flaschenpost aussetzen" onZu={onZu}
      fuss={<><button type="button" className="ti-knopf ti-knopf-leise" onClick={onZu}>Doch nicht</button><button type="button" className="ti-knopf ti-knopf-gold" disabled={!text.trim()} onClick={() => { if (wirfFlasche(text)) { toast('Die Flasche treibt davon.'); onZu() } else toast('Das ging nicht.') }} data-ti-flasche-ok>Über Bord werfen</button></>}>
      <p className="ti-prosa">Die Flasche bleibt genau hier im Wasser. Wer von deinen Kollegen in Sichtweite vorbeisegelt, fischt sie auf und liest, was du geschrieben hast.</p>
      <textarea className="ti-eingabe" style={{ marginTop: 10, minHeight: 84, resize: 'vertical' }} maxLength={140} value={text} onChange={e => setText(e.target.value)} placeholder="Deine Nachricht (höchstens 140 Zeichen)" autoFocus data-ti-flasche-text />
      <p className="ti-stumm" style={{ marginTop: 4 }}>{text.length}/140 · Jeder Fund trägt deinen Kapitänsnamen. Höchstens 20 Flaschen sind gleichzeitig unterwegs; die älteste verschwindet.</p>
    </Blatt>
  )
}
