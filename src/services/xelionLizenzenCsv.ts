// ── Xelion-Lizenzliste des Dienstleisters einlesen ──────────────────────────
//
// Reine Funktionen ohne `api()` — damit lässt sich der Import an der echten Datei in
// Node prüfen. Die Liste kommt als CSV aus dem Xelion-Export (Spalte „Lizenz" = Ja/Nein
// hat der Dienstleister von Hand angefügt).
//
// FALLEN IN DER DATEI (alle an der echten Liste vom Oktober 2026 gesehen):
//   · Spalte „externalNumber" hat Excel zerstört („4,9403E+11"). Die echte Nummer steht
//     in der Spalte OHNE Überschrift direkt dahinter: „+ 494030112786", „+ 0" = keine.
//   · Eine Person hat oft mehrere Zeilen: ihre eigene Leitung (die zählt), dazu Zeilen
//     „Phone-Line Chat …" und Zeilen je Sammelruf („S27 - Gruppe"), in denen userName
//     das MITGLIED ist. Lizenz und Nummer stehen nur auf der eigenen Leitung — deshalb
//     bekommt jede Zeile zuerst ihre Art, bevor nach Person gruppiert wird.
//   · Funktionskonten haben keinen „@" im userName („Werkschutz.1612").
//   · Ansagen, virtuelle Leitungen usw. haben gar keinen userName.
//   · Auch „redirection" ist teils von Excel zerstört („4,91732E+11").

export type ZeilenArt = 'haupt' | 'chat' | 'gruppe'

export interface CsvZeile {
  /** Zeilennummer in der Datei (Kopf = 1). */
  zeile: number
  userName: string
  phoneLine: string
  anzeige: string
  /** Rohwert der Nummernspalte, z. B. „+ 494030112786". */
  nummerRoh: string
  defaultFallback: string
  userStatus: string
  umleitungAktiv: boolean
  umleitung: string
  nichtStoeren: boolean
  lizenz: 'Ja' | 'Nein' | ''
  art: ZeilenArt
}

export type LizenzTyp = 'person' | 'funktion' | 'gruppe' | 'ohne-user'
export type LizenzWert = 'ja' | 'nein' | 'leer'

/** Ein Eintrag der Auswertung — eine Person, ein Funktionskonto, eine Leitung oder ein Sammelruf. */
export interface LizenzBasis {
  key: string
  typ: LizenzTyp
  name: string
  userName: string
  /** E-Mail in Kleinbuchstaben (nur Personen). */
  email: string
  /** Corp ID aus „XX1234@skfgroup.onmicrosoft.com" — direkt im AD auflösbar. */
  samAusMail: string
  lizenz: LizenzWert
  /** Reine Ziffern, z. B. „494030112786". */
  nummern: string[]
  /** Vierstellige Durchwahl — nur aus dem Hamburger Nummernkreis 49403011. */
  durchwahlen: string[]
  userStatus: string
  umleitungAktiv: boolean
  umleitung: string
  umleitungDefekt: boolean
  nichtStoeren: boolean
  /** Rückfallziel der Leitung (oft ein Sammelruf). */
  rueckfall: string
  chatLinien: number
  /** Sammelrufe, in denen die Person / das Konto Mitglied ist. */
  sammelrufe: string[]
  /** Nur bei Sammelrufen: die Mitglieder (userName). */
  mitglieder: string[]
  csvZeilen: number[]
  /** Hinweise, die schon aus der Liste allein folgen (doppelte Nummer, fremder Nummernkreis …). */
  listenHinweise: string[]
}

export interface ParseErgebnis {
  zeilen: CsvZeile[]
  warnungen: string[]
}

/** Hamburger Nummernkreis — nur hier sind die letzten vier Stellen eine Durchwahl. */
export const NUMMERNKREIS = '49403011'

// ── Datei → Text ─────────────────────────────────────────────────────────────

/** UTF-8, sonst Windows-1252 (falls jemand die Liste in Excel neu speichert). BOM weg. */
export function dekodiere(bytes: Uint8Array): string {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { text = new TextDecoder('windows-1252').decode(bytes) }
  return text.replace(/^﻿/, '')
}

/** Zerlegt eine CSV-Zeile; Anführungszeichen mit "" als Escape werden beachtet. */
export function zerlegeZeile(zeile: string, trenner: string): string[] {
  const out: string[] = []
  let feld = ''
  let inQ = false
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i]
    if (inQ) {
      if (c === '"') {
        if (zeile[i + 1] === '"') { feld += '"'; i++ } else inQ = false
      } else feld += c
    } else if (c === '"' && feld === '') inQ = true
    else if (c === trenner) { out.push(feld); feld = '' }
    else feld += c
  }
  out.push(feld)
  return out.map(f => f.trim())
}

function erkenneTrenner(kopf: string): string {
  const zahl = (z: string) => kopf.split(z).length - 1
  return [';', '\t', ','].sort((a, b) => zahl(b) - zahl(a))[0]
}

/** Nur die Ziffern einer Rufnummer; „+ 0" und Kurzes gelten als „keine Nummer". */
export function nummerAus(roh: string): string {
  const z = (roh || '').replace(/\D+/g, '')
  return z.length >= 6 ? z : ''
}

export function durchwahlAus(nummer: string): string {
  return nummer.startsWith(NUMMERNKREIS) && nummer.length === NUMMERNKREIS.length + 4 ? nummer.slice(-4) : ''
}

/** „4,91732E+11" — Excel hat die Zahl in Exponentialschreibweise umgewandelt, Ziffern sind verloren. */
export function vonExcelZerstoert(wert: string): boolean {
  return /\d[,.]\d+E\+\d+/i.test(wert || '')
}

function jaNein(v: string): boolean { return /^(ja|yes|true|1)$/i.test((v || '').trim()) }

// ── Text → Zeilen ────────────────────────────────────────────────────────────

export function parseLizenzCsv(bytes: Uint8Array | string): ParseErgebnis {
  const text = typeof bytes === 'string' ? bytes.replace(/^﻿/, '') : dekodiere(bytes)
  const roh = text.split(/\r\n|\n|\r/)
  while (roh.length && !roh[roh.length - 1].trim()) roh.pop()
  if (roh.length < 2) throw new Error('Die Datei enthält keine Datenzeilen.')

  const trenner = erkenneTrenner(roh[0])
  const kopf = zerlegeZeile(roh[0], trenner).map(h => h.toLowerCase())
  const spalte = (name: string) => kopf.indexOf(name.toLowerCase())

  const iUser = spalte('userName')
  const iLine = spalte('PhoneLine')
  const iAnz = spalte('associatedAddressable')
  const iExt = spalte('externalNumber')
  const iFall = spalte('defaultFallback')
  const iStatus = spalte('userStatus')
  const iUmlAktiv = spalte('redirectionActive')
  const iUml = spalte('redirection')
  const iDnd = spalte('doNotDisturb')
  const iLiz = spalte('Lizenz')

  const fehlt = [['userName', iUser], ['PhoneLine', iLine], ['Lizenz', iLiz]]
    .filter(([, i]) => (i as number) < 0).map(([n]) => n)
  if (fehlt.length) {
    throw new Error(`Die Datei sieht nicht wie die Xelion-Lizenzliste aus — es fehlt die Spalte ${fehlt.join(', ')}. Erwartet wird der Export mit der Zusatzspalte „Lizenz".`)
  }

  const felder = roh.slice(1).map(z => zerlegeZeile(z, trenner))
  const warnungen: string[] = []

  // Die echte Nummer steht in der Spalte nach „externalNumber". Nur übernehmen, wenn sie
  // auch wirklich wie eine Nummernspalte aussieht — sonst lieber gar keine Nummern als
  // falsche (dann wäre jede Lizenz „ohne Rufnummer" und damit scheinbar kündbar).
  let iNum = -1
  if (iExt >= 0) {
    const kandidat = iExt + 1
    const gefuellt = felder.map(f => f[kandidat] ?? '').filter(Boolean)
    const passend = gefuellt.filter(v => /^\+?\s*\d+$/.test(v)).length
    if (gefuellt.length && passend / gefuellt.length >= 0.5) iNum = kandidat
  }
  if (iNum < 0) {
    throw new Error('Die Rufnummern-Spalte (direkt hinter „externalNumber", Werte wie „+ 494030112786") wurde nicht gefunden. Ohne Rufnummern ist keine Auswertung möglich.')
  }

  const zeilen: CsvZeile[] = []
  felder.forEach((f, i) => {
    if (f.every(x => !x)) return
    const wert = (j: number) => (j >= 0 ? f[j] ?? '' : '')
    const phoneLine = wert(iLine)
    const lizRoh = wert(iLiz).toLowerCase()
    const art: ZeilenArt = /^phone-line chat\b/i.test(phoneLine) ? 'chat'
      : /\bgruppe\b/i.test(phoneLine) ? 'gruppe' : 'haupt'
    zeilen.push({
      zeile: i + 2,
      userName: wert(iUser),
      phoneLine,
      anzeige: wert(iAnz),
      nummerRoh: wert(iNum),
      defaultFallback: wert(iFall),
      userStatus: wert(iStatus),
      umleitungAktiv: jaNein(wert(iUmlAktiv)),
      umleitung: wert(iUml),
      nichtStoeren: jaNein(wert(iDnd)),
      lizenz: lizRoh === 'ja' ? 'Ja' : lizRoh === 'nein' ? 'Nein' : '',
      art,
    })
  })

  const unbekannt = felder.filter(f => {
    const l = (f[iLiz] ?? '').trim()
    return l && !/^(ja|nein)$/i.test(l)
  }).length
  if (unbekannt) warnungen.push(`${unbekannt} Zeile(n) mit unbekanntem Wert in der Spalte „Lizenz" — als „leer" gewertet.`)

  return { zeilen, warnungen }
}

// ── Zeilen → Einträge ────────────────────────────────────────────────────────

function typVon(userName: string): LizenzTyp {
  if (!userName) return 'ohne-user'
  return userName.includes('@') ? 'person' : 'funktion'
}

function lizenzWert(l: CsvZeile['lizenz']): LizenzWert {
  return l === 'Ja' ? 'ja' : l === 'Nein' ? 'nein' : 'leer'
}

function leererEintrag(key: string, typ: LizenzTyp): LizenzBasis {
  return {
    key, typ, name: '', userName: '', email: '', samAusMail: '', lizenz: 'leer',
    nummern: [], durchwahlen: [], userStatus: '', umleitungAktiv: false, umleitung: '',
    umleitungDefekt: false, nichtStoeren: false, rueckfall: '', chatLinien: 0,
    sammelrufe: [], mitglieder: [], csvZeilen: [], listenHinweise: [],
  }
}

function uebernimmLeitung(e: LizenzBasis, z: CsvZeile): void {
  e.lizenz = lizenzWert(z.lizenz)
  const n = nummerAus(z.nummerRoh)
  if (n && !e.nummern.includes(n)) e.nummern.push(n)
  e.userStatus = z.userStatus
  e.umleitungAktiv = z.umleitungAktiv
  e.umleitung = z.umleitung
  e.umleitungDefekt = vonExcelZerstoert(z.umleitung)
  e.nichtStoeren = z.nichtStoeren
  e.rueckfall = z.defaultFallback
}

/**
 * Gruppiert die Zeilen zu Einträgen: je Person (E-Mail) / Funktionskonto eine eigene
 * Leitung, dazu je Sammelruf ein Eintrag mit seinen Mitgliedern und je Leitung ohne
 * Benutzer (Ansage, virtuelle Leitung) ein Eintrag.
 */
export function baueEintraege(zeilen: CsvZeile[]): LizenzBasis[] {
  const nachKey = new Map<string, LizenzBasis>()
  const hole = (key: string, typ: LizenzTyp) => {
    let e = nachKey.get(key)
    if (!e) { e = leererEintrag(key, typ); nachKey.set(key, e) }
    return e
  }
  const kontoKey = (userName: string) => {
    const typ = typVon(userName)
    return { typ, key: (typ === 'person' ? 'p:' : 'f:') + userName.toLowerCase() }
  }

  // Erst die eigenen Leitungen — sie legen Name, Lizenz und Nummer fest.
  for (const z of zeilen) {
    if (z.art !== 'haupt') continue
    if (!z.userName) {
      const e = hole('o:' + z.phoneLine.toLowerCase() + ':' + z.zeile, 'ohne-user')
      e.name = z.phoneLine || z.anzeige || `Zeile ${z.zeile}`
      e.csvZeilen.push(z.zeile)
      uebernimmLeitung(e, z)
      continue
    }
    const { typ, key } = kontoKey(z.userName)
    const e = hole(key, typ)
    if (e.csvZeilen.length) {
      // Zwei eigene Leitungen für dasselbe Konto: Lizenz zählt, sobald EINE Ja hat.
      const vorher = e.lizenz
      uebernimmLeitung(e, z)
      if (vorher === 'ja') e.lizenz = 'ja'
      e.listenHinweise.push(`Mehrere eigene Leitungen in der Liste (${z.phoneLine}).`)
    } else uebernimmLeitung(e, z)
    e.name = e.name || z.anzeige || z.phoneLine || z.userName
    e.userName = z.userName
    e.csvZeilen.push(z.zeile)
  }

  // Dann Chat-Leitungen und Sammelruf-Mitgliedschaften.
  for (const z of zeilen) {
    if (z.art === 'haupt') continue
    if (z.art === 'gruppe') {
      const g = hole('g:' + z.phoneLine.toLowerCase(), 'gruppe')
      g.name = z.phoneLine
      g.userName = ''
      g.csvZeilen.push(z.zeile)
      if (z.userName && !g.mitglieder.includes(z.userName)) g.mitglieder.push(z.userName)
      const n = nummerAus(z.nummerRoh)
      if (n && !g.nummern.includes(n)) g.nummern.push(n)
      if (z.userName) {
        const { typ, key } = kontoKey(z.userName)
        const e = hole(key, typ)
        if (!e.name) { e.name = z.anzeige || z.userName; e.userName = z.userName }
        if (!e.sammelrufe.includes(z.phoneLine)) e.sammelrufe.push(z.phoneLine)
        e.csvZeilen.push(z.zeile)
      }
      continue
    }
    // Chat
    if (!z.userName) continue
    const { typ, key } = kontoKey(z.userName)
    const e = hole(key, typ)
    if (!e.name) { e.name = z.userName; e.userName = z.userName }
    e.chatLinien++
    e.csvZeilen.push(z.zeile)
  }

  const liste = [...nachKey.values()]
  for (const e of liste) {
    if (e.typ === 'person') {
      e.email = e.userName.toLowerCase()
      const m = e.email.match(/^([a-z]{1,3}\d{3,6})@[^@]*onmicrosoft\.com$/i)
      if (m) e.samAusMail = m[1].toUpperCase()
    }
    e.durchwahlen = [...new Set(e.nummern.map(durchwahlAus).filter(Boolean))]
    const fremd = e.nummern.filter(n => !durchwahlAus(n))
    if (fremd.length) e.listenHinweise.push(`Nummer außerhalb des Hamburger Nummernkreises: +${fremd.join(', +')}.`)
    // Eine eigene Leitung fehlt (nur über Sammelruf/Chat bekannt) — kann bei Personen vorkommen.
    if ((e.typ === 'person' || e.typ === 'funktion') && e.lizenz === 'leer' && e.nummern.length === 0
        && !zeilen.some(z => z.art === 'haupt' && z.userName.toLowerCase() === e.userName.toLowerCase())) {
      e.listenHinweise.push('Keine eigene Leitung in der Liste — nur über Sammelruf oder Chat bekannt.')
    }
  }

  // Doppelt vergebene Nummern (nur eigene Leitungen, keine Sammelrufe).
  const traeger = new Map<string, LizenzBasis[]>()
  for (const e of liste) {
    if (e.typ === 'gruppe') continue
    for (const n of e.nummern) traeger.set(n, [...(traeger.get(n) ?? []), e])
  }
  for (const [n, es] of traeger) {
    if (es.length < 2) continue
    for (const e of es) {
      const andere = es.filter(x => x !== e).map(x => x.name).join(', ')
      e.listenHinweise.push(`Nummer +${n} steht in der Liste auch bei ${andere}.`)
    }
  }

  const rang: Record<LizenzTyp, number> = { person: 0, funktion: 1, 'ohne-user': 2, gruppe: 3 }
  return liste.sort((a, b) => rang[a.typ] - rang[b.typ] || a.name.localeCompare(b.name, 'de'))
}

/** Kennzahlen für die Import-Vorschau. */
export interface ImportStatistik {
  zeilen: number
  personen: number
  funktion: number
  ohneUser: number
  gruppen: number
  gruppenZeilen: number
  chatZeilen: number
  personJaMitNummer: number
  personJaOhneNummer: number
  personNeinMitNummer: number
  personNeinOhneNummer: number
  lizenzJaGesamt: number
}

export function statistik(zeilen: CsvZeile[], eintraege: LizenzBasis[]): ImportStatistik {
  const p = eintraege.filter(e => e.typ === 'person')
  return {
    zeilen: zeilen.length,
    personen: p.length,
    funktion: eintraege.filter(e => e.typ === 'funktion').length,
    ohneUser: eintraege.filter(e => e.typ === 'ohne-user').length,
    gruppen: eintraege.filter(e => e.typ === 'gruppe').length,
    gruppenZeilen: zeilen.filter(z => z.art === 'gruppe').length,
    chatZeilen: zeilen.filter(z => z.art === 'chat').length,
    personJaMitNummer: p.filter(e => e.lizenz === 'ja' && e.nummern.length).length,
    personJaOhneNummer: p.filter(e => e.lizenz === 'ja' && !e.nummern.length).length,
    personNeinMitNummer: p.filter(e => e.lizenz !== 'ja' && e.nummern.length).length,
    personNeinOhneNummer: p.filter(e => e.lizenz !== 'ja' && !e.nummern.length).length,
    lizenzJaGesamt: eintraege.filter(e => e.lizenz === 'ja').length,
  }
}
