// „Lager einsehen“ — welche Lagergeräte sind schon jemandem zugedacht? (offene Checklisten, neue Mitarbeiter)
// Reine Funktionen.

import type { Vorgesehen } from './typen'

/** Seriennummer vergleichbar machen; Hostname (DE…/DEHAM… + Seriennummer) → Seriennummer. */
export function serialKey(s: string | undefined | null): string {
  const n = (s || '').trim().toUpperCase().replace(/\s+/g, '')
  const m = n.match(/^(DEHAM|DESCH|DE)([A-Z0-9]{8,})$/)
  return m ? m[2] : n
}

export interface ChecklisteRoh { name?: string; newDeviceSerial?: string; completed?: boolean; taskNumber?: string }
export interface MitarbeiterRoh { vorname?: string; name?: string; hardwareSerial?: string; deviceHandedOver?: boolean; startDate?: string }

function datumDe(iso?: string): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

const nameKey = (s: string) => s.toLowerCase().replace(/[^a-zäöüß]+/g, ' ').split(' ').filter(Boolean).sort().join(' ')

/** Serial → wem zugedacht (mehrere Quellen möglich). Erledigte Checklisten / übergebene Geräte zählen nicht. */
export function baueReservierungen(checklisten: ChecklisteRoh[], mitarbeiter: MitarbeiterRoh[]): Map<string, Vorgesehen[]> {
  const out = new Map<string, Vorgesehen[]>()
  const add = (serial: string | undefined, v: Vorgesehen) => {
    const k = serialKey(serial)
    if (!k || k.length < 6 || !v.name.trim()) return
    const liste = out.get(k) || []
    const gleich = liste.find(x => nameKey(x.name) === nameKey(v.name))
    if (gleich) { if (!gleich.quelle.includes(v.quelle)) gleich.quelle += ` · ${v.quelle}` }
    else liste.push(v)
    out.set(k, liste)
  }
  for (const c of checklisten) {
    if (c.completed) continue
    add(c.newDeviceSerial, { name: (c.name || '').trim(), quelle: c.taskNumber ? `Checkliste ${c.taskNumber}` : 'Checkliste' })
  }
  for (const e of mitarbeiter) {
    if (e.deviceHandedOver) continue
    const name = `${e.vorname || ''} ${e.name || ''}`.trim()
    const start = datumDe(e.startDate)
    add(e.hardwareSerial, { name, quelle: start ? `Neuer Mitarbeiter · Start ${start}` : 'Neuer Mitarbeiter' })
  }
  return out
}
