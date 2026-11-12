// ── MP4-Datei schreiben (ISO BMFF) — ohne Zusatzprogramm ──────────────────────
// Electron 29 kann über WebCodecs H.264 (Bild) und AAC (Ton) kodieren, aber MediaRecorder
// liefert nur WebM. Dieses Modul setzt die kodierten Stücke zu einer normalen .mp4 zusammen,
// die jeder Player öffnet (Windows Medienwiedergabe, VLC, Teams, Outlook-Vorschau).
//
// Aufbau:  ftyp · mdat (64-Bit-Größe, Daten verzahnt in ½-Sekunden-Blöcken) · moov (am Ende)
// Die Stücke liegen während der Aufnahme in Zwischendateien je Spur (fortlaufend geschrieben);
// beim Zusammensetzen werden sie blockweise in die Zieldatei kopiert — nie alles im Speicher.
// Keine B-Frames (Kodierer im Modus „realtime“) → Zeitstempel = Dekodier-Reihenfolge, kein ctts.

export interface Probe {
  /** Byte-Position in der Zwischendatei der Spur */
  offset: number
  groesse: number
  /** Zeitstempel in µs (ab Aufnahmebeginn, Pausen herausgerechnet) */
  ts: number
  /** Dauer in µs (Ton: vom Kodierer; Bild: aus dem Abstand zum nächsten Bild) */
  dauer?: number
  key: boolean
}

export interface VideoSpur {
  art: 'video'
  datei: string
  breite: number
  hoehe: number
  /** avcC (AVCDecoderConfigurationRecord) aus dem Kodierer */
  avcC: Uint8Array
  codec: string
  proben: Probe[]
}
export interface AudioSpur {
  art: 'audio'
  datei: string
  abtastrate: number
  kanaele: number
  /** AudioSpecificConfig aus dem Kodierer */
  asc: Uint8Array
  bitrate: number
  proben: Probe[]
}
export type Spur = VideoSpur | AudioSpur

/** Datei-Ein-/Ausgabe — im Tool über den Hauptprozess, im Test direkt. */
export interface Mp4Ziel {
  schreibe(bytes: Uint8Array): Promise<void>
  schreibeBei(position: number, bytes: Uint8Array): Promise<void>
  /** `laenge` Bytes ab `offset` aus `datei` an die Zieldatei anhängen */
  kopiere(datei: string, offset: number, laenge: number): Promise<void>
}

// ── Bytes bauen ────────────────────────────────────────────────────────────────
class Puffer {
  private teile: Uint8Array[] = []
  laenge = 0
  u8(v: number) { return this.roh(new Uint8Array([v & 0xff])) }
  u16(v: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); return this.roh(b) }
  u24(v: number) { return this.roh(new Uint8Array([(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff])) }
  u32(v: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return this.roh(b) }
  i32(v: number) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v); return this.roh(b) }
  u64(v: number) { const b = new Uint8Array(8); const d = new DataView(b.buffer); d.setUint32(0, Math.floor(v / 2 ** 32)); d.setUint32(4, v >>> 0); return this.roh(b) }
  text(s: string) { return this.roh(new Uint8Array([...s].map(c => c.charCodeAt(0) & 0xff))) }
  nullen(n: number) { return this.roh(new Uint8Array(n)) }
  roh(b: Uint8Array) { this.teile.push(b); this.laenge += b.length; return this }
  fertig(): Uint8Array { const o = new Uint8Array(this.laenge); let p = 0; for (const t of this.teile) { o.set(t, p); p += t.length } return o }
}

/** Box = 4 Byte Größe + 4 Zeichen Typ + Inhalt. */
export function box(typ: string, ...inhalt: (Uint8Array | ((p: Puffer) => void))[]): Uint8Array {
  const p = new Puffer()
  for (const i of inhalt) { if (typeof i === 'function') i(p); else p.roh(i) }
  const k = p.fertig()
  return new Puffer().u32(8 + k.length).text(typ).roh(k).fertig()
}
const vollbox = (typ: string, version: number, flags: number, ...inhalt: (Uint8Array | ((p: Puffer) => void))[]) =>
  box(typ, p => { p.u8(version).u24(flags) }, ...inhalt)

const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]
/** Sekunden seit 1904-01-01 (MP4-Zeitbasis) */
const mp4Zeit = (d: Date) => Math.floor(d.getTime() / 1000) + 2082844800

// ── Zeittabellen ───────────────────────────────────────────────────────────────
interface Zeiten { deltas: number[]; dauer: number; start: number }

/** Bild: Abstände aus den Zeitstempeln (kumulativ gerundet → keine Drift). */
export function videoZeiten(proben: Probe[], zeitbasis: number): Zeiten {
  if (!proben.length) return { deltas: [], dauer: 0, start: 0 }
  const t0 = proben[0].ts
  const dts = proben.map(p => Math.round((p.ts - t0) * zeitbasis / 1e6))
  const deltas: number[] = []
  for (let i = 0; i < dts.length - 1; i++) deltas.push(Math.max(1, dts[i + 1] - dts[i]))
  // letztes Bild: eigene Dauer, sonst der übliche Abstand
  const letzte = proben[proben.length - 1].dauer
  const ueblich = deltas.length ? [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : Math.round(zeitbasis / 30)
  deltas.push(letzte ? Math.max(1, Math.round(letzte * zeitbasis / 1e6)) : ueblich)
  return { deltas, dauer: deltas.reduce((s, d) => s + d, 0), start: t0 }
}

/** Ton: Dauer je Stück (AAC = 1024 Abtastwerte), Zeitbasis = Abtastrate. */
export function audioZeiten(proben: Probe[], abtastrate: number): Zeiten {
  if (!proben.length) return { deltas: [], dauer: 0, start: 0 }
  const deltas = proben.map(p => (p.dauer ? Math.max(1, Math.round(p.dauer * abtastrate / 1e6)) : 1024))
  return { deltas, dauer: deltas.reduce((s, d) => s + d, 0), start: proben[0].ts }
}

/** Lauflängen-Kodierung für stts: [[anzahl, delta], …] */
export function lauflaengen(werte: number[]): [number, number][] {
  const aus: [number, number][] = []
  for (const w of werte) { const l = aus[aus.length - 1]; if (l && l[1] === w) l[0]++; else aus.push([1, w]) }
  return aus
}

// ── Stücke der Datei planen (verzahnt) ────────────────────────────────────────
export interface Block { spur: number; von: number; bis: number /* exklusiv */ }

/** Bild und Ton in ½-Sekunden-Blöcken abwechselnd — Player müssen nicht springen. */
export function planeBloecke(spuren: Spur[], fensterUs = 500_000): Block[] {
  const pos = spuren.map(() => 0)
  const bloecke: Block[] = []
  const ende = Math.max(...spuren.map(s => (s.proben.length ? s.proben[s.proben.length - 1].ts : 0)))
  for (let grenze = fensterUs; ; grenze += fensterUs) {
    let alleFertig = true
    for (let s = 0; s < spuren.length; s++) {
      const pr = spuren[s].proben
      let j = pos[s]
      while (j < pr.length && pr[j].ts < grenze) j++
      if (j > pos[s]) { bloecke.push({ spur: s, von: pos[s], bis: j }); pos[s] = j }
      if (pos[s] < pr.length) alleFertig = false
    }
    if (alleFertig || grenze > ende + fensterUs * 2) break
  }
  // Sicherheitsnetz: alles, was übrig blieb (z. B. Zeitstempel weit hinter dem Ende)
  for (let s = 0; s < spuren.length; s++) if (pos[s] < spuren[s].proben.length) bloecke.push({ spur: s, von: pos[s], bis: spuren[s].proben.length })
  return bloecke
}

// ── Kopfdaten (moov) ───────────────────────────────────────────────────────────
function esds(a: AudioSpur): Uint8Array {
  // Deskriptoren mit 4-Byte-Längenfeld (0x80 0x80 0x80 n)
  const desk = (tag: number, inhalt: Uint8Array) => new Puffer().u8(tag).u8(0x80).u8(0x80).u8(0x80).u8(inhalt.length).roh(inhalt).fertig()
  const dsi = desk(0x05, a.asc)
  const dcd = desk(0x04, new Puffer().u8(0x40).u8(0x15).u24(0).u32(a.bitrate).u32(a.bitrate).roh(dsi).fertig())
  const sl = desk(0x06, new Uint8Array([0x02]))
  const es = desk(0x03, new Puffer().u16(0).u8(0).roh(dcd).roh(sl).fertig())
  return vollbox('esds', 0, 0, es)
}

function probenEintrag(s: Spur): Uint8Array {
  if (s.art === 'video') {
    return box('avc1', p => {
      p.nullen(6).u16(1)                 // reserviert, data_reference_index
      p.nullen(16)                       // pre_defined/reserviert
      p.u16(s.breite).u16(s.hoehe)
      p.u32(0x00480000).u32(0x00480000)  // 72 dpi
      p.u32(0).u16(1)                    // reserviert, frame_count
      const name = 'IT Admin Tool'
      p.u8(name.length).text(name).nullen(31 - name.length)
      p.u16(0x0018).u16(0xffff)          // Farbtiefe, pre_defined = -1
    }, box('avcC', s.avcC), box('pasp', p => { p.u32(1).u32(1) }))
  }
  return box('mp4a', p => {
    p.nullen(6).u16(1)
    p.nullen(8)                          // Version 0, reserviert
    p.u16(s.kanaele).u16(16)             // Kanäle, Bit je Abtastwert
    p.u16(0).u16(0)
    p.u32(s.abtastrate << 16 >>> 0)
  }, esds(s))
}

interface SpurPlan { spur: Spur; zeiten: Zeiten; zeitbasis: number; bloecke: { offset: number; anzahl: number }[] }

function trak(id: number, pl: SpurPlan, filmZeitbasis: number, jetzt: number, filmStartUs: number): Uint8Array {
  const s = pl.spur
  const istVideo = s.art === 'video'
  const mediaDauer = pl.zeiten.dauer
  const filmDauer = Math.round(mediaDauer * filmZeitbasis / pl.zeitbasis)
  const versatz = Math.max(0, Math.round((pl.zeiten.start - filmStartUs) * filmZeitbasis / 1e6))
  const tkhd = vollbox('tkhd', 0, 3, p => {
    p.u32(jetzt).u32(jetzt).u32(id).u32(0).u32(filmDauer + versatz)
    p.nullen(8).u16(0).u16(0).u16(istVideo ? 0 : 0x0100).u16(0)
    for (const m of MATRIX) p.u32(m)
    p.u32(istVideo ? (s as VideoSpur).breite << 16 >>> 0 : 0).u32(istVideo ? (s as VideoSpur).hoehe << 16 >>> 0 : 0)
  })
  // Beginnt die Spur später als der Film (Ton setzt einen Moment nach dem Bild ein) → leere Strecke davor
  const edts = versatz > 0 ? box('edts', vollbox('elst', 0, 0, p => {
    p.u32(2)
    p.u32(versatz).i32(-1).u16(1).u16(0)
    p.u32(filmDauer).i32(0).u16(1).u16(0)
  })) : new Uint8Array(0)
  const mdhd = vollbox('mdhd', 0, 0, p => { p.u32(jetzt).u32(jetzt).u32(pl.zeitbasis).u32(mediaDauer).u16(0x55c4).u16(0) })
  const hdlr = vollbox('hdlr', 0, 0, p => { p.u32(0).text(istVideo ? 'vide' : 'soun').nullen(12).text(istVideo ? 'VideoHandler' : 'SoundHandler').u8(0) })
  const xmhd = istVideo ? vollbox('vmhd', 0, 1, p => { p.u16(0).u16(0).u16(0).u16(0) }) : vollbox('smhd', 0, 0, p => { p.u16(0).u16(0) })
  const dinf = box('dinf', vollbox('dref', 0, 0, p => { p.u32(1) }, vollbox('url ', 0, 1)))
  const stsd = vollbox('stsd', 0, 0, p => { p.u32(1) }, probenEintrag(s))
  const lauf = lauflaengen(pl.zeiten.deltas)
  const stts = vollbox('stts', 0, 0, p => { p.u32(lauf.length); for (const [n, d] of lauf) p.u32(n).u32(d) })
  const keys = s.proben.map((x, i) => (x.key ? i + 1 : 0)).filter(Boolean)
  const stss = istVideo && keys.length < s.proben.length ? vollbox('stss', 0, 0, p => { p.u32(keys.length); for (const k of keys) p.u32(k) }) : new Uint8Array(0)
  // stsc: Proben je Block, lauflängenkodiert (first_chunk, samples_per_chunk, desc_index)
  const stscEintraege: [number, number][] = []
  pl.bloecke.forEach((b, i) => { const l = stscEintraege[stscEintraege.length - 1]; if (!l || l[1] !== b.anzahl) stscEintraege.push([i + 1, b.anzahl]) })
  const stsc = vollbox('stsc', 0, 0, p => { p.u32(stscEintraege.length); for (const [f, n] of stscEintraege) p.u32(f).u32(n).u32(1) })
  const stsz = vollbox('stsz', 0, 0, p => { p.u32(0).u32(s.proben.length); for (const x of s.proben) p.u32(x.groesse) })
  const co64 = vollbox('co64', 0, 0, p => { p.u32(pl.bloecke.length); for (const b of pl.bloecke) p.u64(b.offset) })
  const stbl = box('stbl', stsd, stts, stss, stsc, stsz, co64)
  return box('trak', tkhd, edts, box('mdia', mdhd, hdlr, box('minf', xmhd, dinf, stbl)))
}

export interface Mp4Ergebnis { bytes: number; dauerMs: number }

/**
 * Spuren zu einer MP4 zusammensetzen. `ziel` ist leer geöffnet; Rückgabe: Dateigröße und Länge.
 * `fortschritt(0..1)` nach jedem kopierten Block.
 */
export async function schreibeMp4(spurenEin: Spur[], ziel: Mp4Ziel, fortschritt?: (anteil: number) => void): Promise<Mp4Ergebnis> {
  const spuren = spurenEin.filter(s => s.proben.length > 0)
  if (!spuren.length) throw new Error('Keine Aufnahmedaten.')
  const ftyp = box('ftyp', p => { p.text('isom').u32(0x200).text('isom').text('iso2').text('avc1').text('mp41') })
  await ziel.schreibe(ftyp)
  // mdat mit 64-Bit-Größe (Aufnahmen können über 4 GB werden); Größe wird am Ende eingetragen
  const mdatPos = ftyp.length
  await ziel.schreibe(new Puffer().u32(1).text('mdat').u64(0).fertig())
  let pos = mdatPos + 16
  const plaene: SpurPlan[] = spuren.map(s => {
    const zeitbasis = s.art === 'video' ? 90000 : s.abtastrate
    return { spur: s, zeitbasis, zeiten: s.art === 'video' ? videoZeiten(s.proben, zeitbasis) : audioZeiten(s.proben, zeitbasis), bloecke: [] }
  })
  const bloecke = planeBloecke(spuren)
  const gesamt = bloecke.reduce((n, b) => n + spuren[b.spur].proben.slice(b.von, b.bis).reduce((m, x) => m + x.groesse, 0), 0)
  let kopiert = 0
  for (const b of bloecke) {
    const s = spuren[b.spur]
    const erste = s.proben[b.von], letzte = s.proben[b.bis - 1]
    const laenge = letzte.offset + letzte.groesse - erste.offset
    // Proben einer Spur liegen in der Zwischendatei lückenlos hintereinander
    let summe = 0
    for (let i = b.von; i < b.bis; i++) summe += s.proben[i].groesse
    if (summe !== laenge) throw new Error('Zwischendatei unvollständig (Lücke zwischen den Proben).')
    plaene[b.spur].bloecke.push({ offset: pos, anzahl: b.bis - b.von })
    await ziel.kopiere(s.datei, erste.offset, laenge)
    pos += laenge
    kopiert += laenge
    fortschritt?.(gesamt ? kopiert / gesamt : 1)
  }
  await ziel.schreibeBei(mdatPos + 8, new Puffer().u64(pos - mdatPos).fertig())
  // Film-Kopf
  const jetzt = mp4Zeit(new Date())
  const filmZeitbasis = 1000
  const filmStart = Math.min(...plaene.map(p => p.zeiten.start))
  const dauerMs = Math.max(...plaene.map(p => Math.round((p.zeiten.start - filmStart) / 1000 + p.zeiten.dauer * 1000 / p.zeitbasis)))
  const mvhd = vollbox('mvhd', 0, 0, p => {
    p.u32(jetzt).u32(jetzt).u32(filmZeitbasis).u32(dauerMs)
    p.u32(0x00010000).u16(0x0100).nullen(10)
    for (const m of MATRIX) p.u32(m)
    p.nullen(24).u32(plaene.length + 1)
  })
  const moov = box('moov', mvhd, ...plaene.map((pl, i) => trak(i + 1, pl, filmZeitbasis, jetzt, filmStart)))
  await ziel.schreibe(moov)
  return { bytes: pos + moov.length, dauerMs }
}
