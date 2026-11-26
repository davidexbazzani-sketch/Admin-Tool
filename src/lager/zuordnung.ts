// „Lager einsehen“ — wo liegt ein Gerät? Erkennung aus dem Asset-Kommentar (= Fach) und dem Status.
//
// Reihenfolge:
//   1. Leihrechner (Kommentar beginnt mit „Leihrechner“ bzw. Verwendung „Reserved Loaner“)
//      Schema in ServiceNow:  Leihrechner: / Aktueller Benutzer: … / Übergabe-Datum: … / [Ort: …]
//      Name → im Umlauf · E10 → bei Timo · E11 → bei Tim · sonst Fach-Buchstabe oder „Ohne Fach“
//   2. Raum: E10 → Timo, E11 → Tim (anderer Raum → Ohne Fach mit Hinweis)
//   3. ausdrücklicher Fach-Buchstabe („Fach C“, „Regal C“, Abschnitt nur „C“)
//   4. Schild des linken Regals (unscharf: Tippfehler, Wortreihenfolge, ohne Bindestrich)
//   5. schwacher Buchstabe („S abholbereit“, „Akku defekt C“)
//   6. Status (Pending disposal, Retired, nicht in der Asset-Datenbank, angemeldete Abholung)
//   7. Ohne Fach

import { BUCHSTABEN_ALLE, ZUSATZ, R5_FAECHER } from './aufbau'
import type { LagerTyp, LeihInfo, OrtId, R5Id, Zuordnung } from './typen'
import { hat, normalisiere, passt, woerter } from './unscharf'

export interface ZuordnungEingabe {
  kommentar?: string
  state?: string
  substate?: string
  /** false = Gerät steht nicht in der Asset-Datenbank (nur aus einer Inventur bekannt) */
  inAmdb?: boolean
  /** Gerät steht in einer angemeldeten (künftigen) Abholung */
  abholungAngemeldet?: boolean
}

const RAUM_RE = /(?<![a-z0-9])e\s?[-.]?\s?(\d{2})(?!\d)/gi
const LEIH_RE = /^\s*leih[\s-]?(rechner|ger(ae|ä)t|laptop|notebook|pc)/i
const STARK_RE = /(?:^|[^a-z0-9])(?:fach|regal|lagerfach|lager|platz|box)[\s:.#=-]+([a-z])(?![a-z0-9])/g
const BEWEGUNG_RE = /\b(nach|jetzt|neu|umgelagert|verschoben|verlegt)\b|→|->/

const kurzText = (s: string, n = 48) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

/** Raum aus Text („E10“, „E 10“, „E-10“, „e.11“) → „E10“; sonst ''. */
export function raumIn(text: string): string {
  RAUM_RE.lastIndex = 0
  const m = RAUM_RE.exec(normalisiere(text))
  return m ? `E${m[1]}` : ''
}

function ohneRaeume(text: string): string {
  return normalisiere(text).replace(RAUM_RE, ' ')
}

/** Abschnitte eines Kommentars (Zeilen, „ · “ aus dem Import, Komma, Semikolon, „ - “). */
function abschnitte(kommentar: string): string[] {
  return (kommentar || '').split(/\r?\n|·|;|\||,|\s[-–]\s/).map(s => s.trim()).filter(Boolean)
}

interface Buchstaben { stark: { b: string; pos: number; text: string }[]; schwach: { b: string; text: string }[]; ungueltig: string[] }

export function findeBuchstaben(kommentar: string): Buchstaben {
  const out: Buchstaben = { stark: [], schwach: [], ungueltig: [] }
  let pos = 0
  for (const roh of abschnitte(kommentar)) {
    const n = ohneRaeume(roh)
    STARK_RE.lastIndex = 0
    let m: RegExpExecArray | null
    let starkHier = false
    while ((m = STARK_RE.exec(n))) {
      const b = m[1].toUpperCase()
      starkHier = true
      if (BUCHSTABEN_ALLE.includes(b)) out.stark.push({ b, pos: pos + m.index, text: roh })
      else out.ungueltig.push(b)
    }
    const nur = n.trim().match(/^([a-z])[.)]?$/)
    if (nur) {
      const b = nur[1].toUpperCase()
      if (BUCHSTABEN_ALLE.includes(b)) out.stark.push({ b, pos, text: roh })
      else out.ungueltig.push(b)
      starkHier = true
    }
    if (!starkHier) {
      // schwach: einzelner Großbuchstabe am Anfang oder Ende eines kurzen Abschnitts
      const t = roh.replace(RAUM_RE, ' ').split(/\s+/).filter(Boolean)
      if (t.length >= 2 && t.length <= 4) {
        const erster = t[0], letzter = t[t.length - 1]
        if (/^[A-Z]$/.test(erster) && !(erster === 'A' && /^[a-zäöü]/.test(t[1]))) {
          if (BUCHSTABEN_ALLE.includes(erster)) out.schwach.push({ b: erster, text: roh })
        } else if (/^[A-Z]$/.test(letzter)) {
          if (BUCHSTABEN_ALLE.includes(letzter)) out.schwach.push({ b: letzter, text: roh })
        }
      }
    }
    pos += roh.length + 1
  }
  return out
}

/** Schild des linken Regals aus Freitext (unscharf). */
export function erkenneSchild(text: string): R5Id | null {
  const ws = woerter(text)
  if (!ws.length) return null
  const biosWort = hat(ws, 'bios', 'passwort', 'kennwort', 'pw', 'pwd')
  // „muss gelöscht werden“, „noch löschen“, „nicht gelöscht“ → noch nicht abholbereit
  const iGel = ws.findIndex(w => passt(w, 'geloescht'))
  const vorGel = iGel >= 0 ? ws.slice(Math.max(0, iGel - 3), iGel) : []
  const verneint = hat(ws, 'muss', 'loeschen', 'fehlt') || vorGel.some(w => passt(w, 'nicht') || w === 'noch' || passt(w, 'kein*'))
  if ((hat(ws, 'pending') && hat(ws, 'disposal')) || hat(ws, 'disposal') || (hat(ws, 'pending') && biosWort)
    || (biosWort && verneint)) return 'pending'
  if (hat(ws, 'abhol*') && hat(ws, 'angemeld*', 'anmeld*', 'gemeldet', 'beauftragt')) return 'angemeldet'
  if (hat(ws, 'abholbereit') || (hat(ws, 'abhol*') && hat(ws, 'bereit'))
    || (biosWort && hat(ws, 'geloescht', 'entfernt', 'cleared', 'zurueckgesetzt', 'resettet'))) return 'abholbereit'
  if ((hat(ws, 'skf') && hat(ws, 'eigentum')) || hat(ws, 'amdb')) return 'skf'
  if (hat(ws, 'retire*', 'retiered', 'ausgemustert')) return 'retired'
  return null
}

const r5Name = (id: R5Id) => R5_FAECHER.find(f => f.id === id)?.kurz ?? id

/** Feld aus dem Leihrechner-Schema („Aktueller Benutzer: …“). */
function feld(kommentar: string, re: RegExp): string | undefined {
  const m = kommentar.match(re)
  return m ? m[1].trim() : undefined
}

function istName(v: string): boolean {
  if (!v || raumIn(v)) return false
  if (/^(-+|—|n\/?a|keiner|niemand|leer|frei|lager|offen|\?+)$/i.test(v.trim())) return false
  return /[a-zäöüß]{2,}/i.test(v)
}

function leihrechner(kommentar: string): Zuordnung {
  // Ende am nächsten Feld — falls der Kommentar ohne Zeilenumbrüche ankommt
  const benutzer = (feld(kommentar, /aktueller\s+benutzer\s*:[ \t]*([^\r\n]*)/i) ?? '')
    .split(/\s*(?:(?:ü|ue)bergabe[\s-]*datum|\bdatum\s*:|\bort\s*:)/i)[0].trim()
  const datumRoh = feld(kommentar, /(?:übergabe|uebergabe)?[\s-]*datum\s*:[ \t]*([^\r\n]*)/i) ?? ''
  const datum = datumRoh.match(/\d{1,2}\.\d{1,2}\.\d{2,4}/)?.[0]
  const ortFeld = feld(kommentar, /\bort\s*:[ \t]*([^\r\n]*)/i) ?? ''
  const leih: LeihInfo = {}
  if (datum) leih.datum = datum

  if (istName(benutzer)) {
    leih.benutzer = benutzer.replace(/\s+/g, ' ').trim()
    return { ort: 'zone:leih-umlauf', grund: `Leihrechner · Aktueller Benutzer: ${kurzText(leih.benutzer, 40)}`, hinweise: [], leih }
  }
  const raum = raumIn(benutzer) || raumIn(ortFeld) || raumIn(kommentar)
  if (raum) leih.raum = raum
  if (raum === 'E10') return { ort: 'zone:leih-timo', grund: `Leihrechner · ${raumIn(benutzer) ? 'Aktueller Benutzer' : 'Ort'}: E10`, hinweise: [], leih }
  if (raum === 'E11') return { ort: 'zone:leih-tim', grund: `Leihrechner · ${raumIn(benutzer) ? 'Aktueller Benutzer' : 'Ort'}: E11`, hinweise: [], leih }
  const bs = findeBuchstaben(kommentar)
  const b = eindeutig(bs.stark, kommentar)
  if (b.b) return { ort: `fach:${b.b}`, grund: `Leihrechner · Kommentar: „${kurzText(b.text)}“`, hinweise: [], leih }
  return {
    ort: 'zone:ohne',
    grund: raum ? `Leihrechner · Ort: ${raum}` : 'Leihrechner ohne Ort',
    hinweise: [raum ? `Leihrechner liegt laut Kommentar in ${raum} – dafür gibt es keinen Bereich` : 'Leihrechner: weder Benutzer noch Ort eingetragen'],
    leih,
  }
}

function eindeutig(stark: Buchstaben['stark'], kommentar: string): { b?: string; text: string; mehrdeutig?: string[] } {
  if (!stark.length) return { text: '' }
  const verschieden = [...new Set(stark.map(s => s.b))]
  if (verschieden.length === 1) return { b: verschieden[0], text: stark[0].text }
  if (BEWEGUNG_RE.test(normalisiere(kommentar))) {
    const letzter = [...stark].sort((a, b) => a.pos - b.pos)[stark.length - 1]
    return { b: letzter.b, text: letzter.text }
  }
  return { text: '', mehrdeutig: verschieden }
}

/** Ort eines Geräts bestimmen. Reine Funktion. */
export function erkenneOrt(e: ZuordnungEingabe): Zuordnung {
  const kommentar = (e.kommentar || '').trim()
  const state = (e.state || '').trim()
  const substate = (e.substate || '').trim()
  const hinweise: string[] = []

  // 1. Leihrechner
  if (LEIH_RE.test(kommentar) || /loaner/i.test(substate)) return leihrechner(kommentar)

  const bs = findeBuchstaben(kommentar)
  const st = eindeutig(bs.stark, kommentar)

  // 2. Raum
  const raum = raumIn(kommentar)
  if (raum) {
    if (st.b) hinweise.push(`Kommentar nennt auch Fach ${st.b}`)
    if (raum === 'E10') return { ort: 'zone:timo', grund: `Kommentar nennt Raum E10`, hinweise }
    if (raum === 'E11') return { ort: 'zone:tim', grund: `Kommentar nennt Raum E11`, hinweise }
    return { ort: 'zone:ohne', grund: `Kommentar nennt Raum ${raum}`, hinweise: [...hinweise, `Raum ${raum} – dafür gibt es keinen Bereich`] }
  }

  for (const u of bs.ungueltig) hinweise.push(`Fach ${u} gibt es nicht (Fächer A–T)`)
  const schild = erkenneSchild(kommentar)

  // 3. ausdrücklicher Buchstabe
  if (st.b) {
    const zus = ZUSATZ[st.b]
    if (schild && zus?.r5 !== schild) hinweise.push(`Kommentar nennt auch „${r5Name(schild)}“`)
    return { ort: `fach:${st.b}`, grund: `Kommentar: „${kurzText(st.text)}“`, hinweise }
  }
  if (st.mehrdeutig) {
    return { ort: 'zone:ohne', grund: `Kommentar nennt mehrere Fächer`, hinweise: [...hinweise, `Mehrdeutig: Fach ${st.mehrdeutig.join(' oder ')}`] }
  }

  // 4. Schild des linken Regals (schwacher Buchstabe mit passendem Zusatzschild gewinnt)
  const schwach = bs.schwach[0]
  if (schild) {
    if (schwach && ZUSATZ[schwach.b]?.r5 === schild) return { ort: `fach:${schwach.b}`, grund: `Kommentar: „${kurzText(schwach.text)}“`, hinweise }
    return { ort: `r5:${schild}`, grund: `Kommentar: „${kurzText(kommentar)}“ → ${r5Name(schild)}`, hinweise }
  }

  // 5. schwacher Buchstabe
  if (schwach) return { ort: `fach:${schwach.b}`, grund: `Kommentar: „${kurzText(schwach.text)}“`, hinweise }

  // 6. Status
  if (e.abholungAngemeldet) return { ort: 'r5:angemeldet', grund: 'Abholung angemeldet (Pick-Ups)', hinweise }
  if (/pending\s*dispos/i.test(substate) || /pending\s*dispos/i.test(state)) return { ort: 'r5:pending', grund: `Status: ${substate || state}`, hinweise }
  if (/retire/i.test(state)) return { ort: 'r5:retired', grund: `Status: ${state}`, hinweise }
  if (e.inAmdb === false) return { ort: 'r5:skf', grund: 'Nicht in der Asset-Datenbank (nur aus der Inventur bekannt)', hinweise }

  // 7. ohne Fach
  return { ort: 'zone:ohne', grund: kommentar ? `Kein Fach im Kommentar („${kurzText(kommentar)}“)` : 'Kommentar leer', hinweise }
}

/** Gerätetyp aus Modellname bzw. Gerätetyp-Text der Inventur. */
export function lagerTyp(modell?: string, typText?: string): LagerTyp {
  const m = normalisiere(`${modell || ''} ${typText || ''}`).replace(/\s+/g, ' ')
  if (!m.trim()) return 'sonstiges'
  if (/zbook|z-book|z book/.test(m)) return 'zbook'
  if (/\bz\s?[2468](\s?g\d+)?\b|\bz\d{3}\b|tower|\btwr\b|workstation|\bmt\b|microtower/.test(m) && !/\bsff\b|small form/.test(m)) return 'tower'
  if (/\bsff\b|small form/.test(m)) return 'sonstiges'
  if (/mini|elitedesk|\bdm\b|prodesk.*\bdm\b/.test(m)) return 'minipc'
  if (/elitebook|probook|laptop|notebook|x360|elite ?x2|dragonfly|\b8g1i\b|book/.test(m)) return 'elitebook'
  return 'sonstiges'
}

/** Alle Fach-Orte, die ein Kommentar bewusst nennen kann (für Prüfwerkzeuge). */
export function istFachOrt(ort: OrtId): boolean {
  return ort.startsWith('fach:')
}
