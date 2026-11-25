// Parla Italiano — Ton-Verarbeitung, Teil im Browserfenster (wird von italiano-ton.cjs geladen).
// Dekodieren, Pausen finden, Stücke schneiden, Lautstärke angleichen, als Ogg/Opus kodieren.
// Alles mit Bordmitteln von Chromium (WebAudio, WebCodecs) — kein ffmpeg nötig.
/* eslint-disable no-undef */
(() => {
  const RATE = 24000

  const ausB64 = b64 => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u }
  const alsB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s) }

  /** Datei → Mono-Abtastwerte mit 24 kHz */
  async function dekodiere(b64) {
    const ctx = new OfflineAudioContext(1, 1, RATE)
    const buf = await ctx.decodeAudioData(ausB64(b64).buffer)
    const aus = new Float32Array(buf.length)
    for (let k = 0; k < buf.numberOfChannels; k++) { const d = buf.getChannelData(k); for (let i = 0; i < d.length; i++) aus[i] += d[i] / buf.numberOfChannels }
    return aus
  }

  /** Lautstärke je 10 ms */
  function huellkurve(pcm) {
    const n = Math.floor(RATE / 100), aus = new Float32Array(Math.floor(pcm.length / n))
    for (let f = 0; f < aus.length; f++) { let s = 0; for (let i = f * n; i < (f + 1) * n; i++) s += pcm[i] * pcm[i]; aus[f] = Math.sqrt(s / n) }
    return aus
  }

  /** Anfang und Ende der Sprache sowie alle Pausen dazwischen (in Sekunden) */
  function pausen(pcm) {
    const h = huellkurve(pcm)
    const sortiert = Array.from(h).sort((a, b) => a - b)
    const laut = sortiert[Math.floor(sortiert.length * 0.95)] || 0
    const schwelle = Math.max(0.0035, laut * 0.045)
    let a = 0, b = h.length - 1
    while (a < h.length && h[a] < schwelle) a++
    while (b > a && h[b] < schwelle) b--
    const liste = []
    let von = -1
    for (let f = a; f <= b; f++) {
      if (h[f] < schwelle) { if (von < 0) von = f }
      else if (von >= 0) { if (f - von >= 6) liste.push({ von: von / 100, bis: f / 100, dauer: (f - von) / 100 }); von = -1 }
    }
    return { anfang: a / 100, ende: (b + 1) / 100, liste, schwelle }
  }

  /**
   * Eine Aufnahme in `gewichte.length` Stücke teilen. Die Grenzen liegen in Pausen. Gesucht wird die
   * Aufteilung, bei der jedes Stück so lang ist, wie es seiner Textlänge nach sein sollte (gleiches
   * Sprechtempo für alle) — längere Pausen werden als Grenze leicht bevorzugt.
   * `zusatz`: fester Anteil je Stück (einzelne Wörter dauern länger, als ihre Buchstabenzahl vermuten lässt).
   */
  function teile(pcm, gewichte, zusatz) {
    const n = gewichte.length
    const p = pausen(pcm)
    if (n === 1) return { stuecke: [[p.anfang, p.ende]], guete: 0, sicher: 9, grund: '' }
    const g = p.liste
    if (g.length < n - 1) return { stuecke: null, guete: 9, sicher: 0, grund: `nur ${g.length} Pausen für ${n} Stücke` }
    const w = gewichte.map(x => x + zusatz)
    const summe = w.reduce((s, x) => s + x, 0)
    // Sprechzeit ohne die Trennpausen: Gesamtzeit minus (n-1) typische Pausen
    const typisch = g.map(x => x.dauer).sort((x, y) => y - x).slice(0, n - 1).reduce((s, x) => s + x, 0)
    const zeit = Math.max(0.2, p.ende - p.anfang - typisch)
    const soll = w.map(x => zeit * x / summe)
    const fehl = (dauer, k) => Math.pow((dauer - soll[k]) / soll[k], 2)
    const bonus = j => 0.06 * Math.log(g[j].dauer / 0.06)
    const G = g.length
    const kosten = Array.from({ length: n - 1 }, () => new Float64Array(G).fill(1e9))
    const vor = Array.from({ length: n - 1 }, () => new Int32Array(G).fill(-1))
    for (let j = 0; j < G; j++) kosten[0][j] = fehl(g[j].von - p.anfang, 0) - bonus(j)
    for (let k = 1; k < n - 1; k++) for (let j = k; j < G; j++) {
      for (let i = k - 1; i < j; i++) {
        const c = kosten[k - 1][i] + fehl(g[j].von - g[i].bis, k) - bonus(j)
        if (c < kosten[k][j]) { kosten[k][j] = c; vor[k][j] = i }
      }
    }
    let j = -1, best = 1e9
    for (let i = n - 2; i < G; i++) { const c = kosten[n - 2][i] + fehl(p.ende - g[i].bis, n - 1); if (c < best) { best = c; j = i } }
    if (j < 0) return { stuecke: null, guete: 9, sicher: 0, grund: 'keine Aufteilung gefunden' }
    const wahl = []
    for (let k = n - 2; k >= 0; k--) { wahl.unshift(j); j = vor[k][j] }
    const stuecke = []
    let start = p.anfang
    for (const x of wahl) { stuecke.push([start, g[x].von]); start = g[x].bis }
    stuecke.push([start, p.ende])
    // Güte: größte Abweichung eines Stücks von seiner erwarteten Länge (0 = perfekt)
    const guete = Math.max(...stuecke.map(([a, b], k) => Math.abs((b - a) - soll[k]) / soll[k]))
    // Sicherheit: kürzeste gewählte Pause im Verhältnis zur längsten nicht gewählten
    const gewaehlt = new Set(wahl)
    const kurz = Math.min(...wahl.map(x => g[x].dauer))
    const rest = Math.max(0.03, ...g.filter((_, i) => !gewaehlt.has(i)).map(x => x.dauer))
    // Vorsprung: wie viel schlechter wäre die beste Aufteilung, bei der EINE Grenze in der Nachbarpause läge?
    // Großer Vorsprung = die gewählte Aufteilung ist eindeutig, auch wenn kurze Zeilen vom Durchschnittstempo abweichen.
    const gesamtKosten = w2 => {
      let c = fehl(g[w2[0]].von - p.anfang, 0) - bonus(w2[0])
      for (let k = 1; k < w2.length; k++) c += fehl(g[w2[k]].von - g[w2[k - 1]].bis, k) - bonus(w2[k])
      return c + fehl(p.ende - g[w2[w2.length - 1]].bis, n - 1)
    }
    const bestKosten = gesamtKosten(wahl)
    let vorsprung = 9
    for (let k = 0; k < wahl.length; k++) for (const d of [-1, 1]) {
      const j2 = wahl[k] + d
      if (j2 < 0 || j2 >= G || gewaehlt.has(j2)) continue
      const w2 = wahl.slice(); w2[k] = j2
      if ((k > 0 && w2[k] <= w2[k - 1]) || (k < w2.length - 1 && w2[k] >= w2[k + 1])) continue
      vorsprung = Math.min(vorsprung, gesamtKosten(w2) - bestKosten)
    }
    return { stuecke, guete: Math.round(guete * 100) / 100, vorsprung: Math.round(vorsprung * 100) / 100, sicher: Math.round((kurz / rest) * 100) / 100, grund: '' }
  }

  /** Stücke hintereinander setzen: gleich laut, mit weichem Anfang und Ende, 0,22 s Pause dazwischen */
  function setze(pcm, stuecke) {
    const pause = Math.round(RATE * 0.22), rand = Math.round(RATE * 0.05), blende = Math.round(RATE * 0.008)
    const teileListe = stuecke.map(([a, b]) => {
      const von = Math.max(0, Math.round(a * RATE) - rand), bis = Math.min(pcm.length, Math.round(b * RATE) + rand)
      const s = pcm.slice(von, bis)
      let spitze = 0
      for (let i = 0; i < s.length; i++) spitze = Math.max(spitze, Math.abs(s[i]))
      const faktor = spitze > 0 ? Math.min(4, 0.7 / spitze) : 1
      for (let i = 0; i < s.length; i++) s[i] *= faktor
      for (let i = 0; i < blende && i < s.length; i++) { const f = i / blende; s[i] *= f; s[s.length - 1 - i] *= f }
      return s
    })
    const laenge = teileListe.reduce((s, t) => s + t.length + pause, Math.round(RATE * 0.1))
    const aus = new Float32Array(laenge)
    const zeiten = []
    let ort = Math.round(RATE * 0.1)
    for (const t of teileListe) { aus.set(t, ort); zeiten.push([Math.round((ort / RATE) * 100) / 100, Math.round(((ort + t.length) / RATE) * 100) / 100]); ort += t.length + pause }
    return { pcm: aus, zeiten }
  }

  // ── Ogg/Opus ──
  const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let k = 0; k < 8; k++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04C11DB7) : (r << 1); t[i] = r >>> 0 } return t })()
  function pruefsumme(u) { let c = 0; for (let i = 0; i < u.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ u[i]) & 255]) >>> 0; return c }
  function seite(pakete, koerner, nr, art, serie) {
    const laengen = []
    for (const p of pakete) { let l = p.length; while (l >= 255) { laengen.push(255); l -= 255 } laengen.push(l) }
    const kopf = new Uint8Array(27 + laengen.length)
    const v = new DataView(kopf.buffer)
    kopf.set([0x4f, 0x67, 0x67, 0x53], 0); kopf[4] = 0; kopf[5] = art
    v.setUint32(6, koerner >>> 0, true); v.setUint32(10, Math.floor(koerner / 4294967296), true)
    v.setUint32(14, serie, true); v.setUint32(18, nr, true); v.setUint32(22, 0, true)
    kopf[26] = laengen.length; kopf.set(laengen, 27)
    const koerper = new Uint8Array(pakete.reduce((s, p) => s + p.length, 0))
    let o = 0; for (const p of pakete) { koerper.set(p, o); o += p.length }
    const ganz = new Uint8Array(kopf.length + koerper.length); ganz.set(kopf, 0); ganz.set(koerper, kopf.length)
    new DataView(ganz.buffer).setUint32(22, pruefsumme(ganz), true)
    return ganz
  }

  /** Abtastwerte (24 kHz, mono) → Ogg/Opus mit der gewünschten Bitrate */
  async function kodiere(pcm, bitrate) {
    if (typeof AudioEncoder === 'undefined') throw new Error('AudioEncoder fehlt in dieser Electron-Version')
    const pakete = []
    let kopfVomKodierer = null
    const enc = new AudioEncoder({
      output: (chunk, meta) => { const u = new Uint8Array(chunk.byteLength); chunk.copyTo(u); pakete.push(u); if (!kopfVomKodierer && meta && meta.decoderConfig && meta.decoderConfig.description) kopfVomKodierer = new Uint8Array(meta.decoderConfig.description) },
      error: e => { throw e },
    })
    enc.configure({ codec: 'opus', sampleRate: RATE, numberOfChannels: 1, bitrate })
    const block = RATE / 50 * 25   // 0,5 s
    for (let i = 0; i < pcm.length; i += block) {
      const s = pcm.subarray(i, Math.min(pcm.length, i + block))
      enc.encode(new AudioData({ format: 'f32', sampleRate: RATE, numberOfFrames: s.length, numberOfChannels: 1, timestamp: Math.round(i / RATE * 1e6), data: s }))
    }
    await enc.flush(); enc.close()
    let vorlauf = 312
    let kopf = new Uint8Array(19)
    if (kopfVomKodierer && kopfVomKodierer.length >= 19) { kopf = kopfVomKodierer.slice(0, 19); vorlauf = new DataView(kopf.buffer).getUint16(10, true) }
    else { kopf.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, 1], 0); const v = new DataView(kopf.buffer); v.setUint16(10, vorlauf, true); v.setUint32(12, RATE, true); v.setInt16(16, 0, true); kopf[18] = 0 }
    const marke = new TextEncoder().encode('ParlaItaliano')
    const tags = new Uint8Array(8 + 4 + marke.length + 4)
    tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); new DataView(tags.buffer).setUint32(8, marke.length, true); tags.set(marke, 12)
    const serie = 0x50495441
    const seiten = [seite([kopf], 0, 0, 2, serie), seite([tags], 0, 1, 0, serie)]
    const jeSeite = 25, schritt = 960   // 20 ms bei 48 kHz
    const endKorn = Math.round(pcm.length * 2) + vorlauf
    for (let i = 0, nr = 2; i < pakete.length; i += jeSeite, nr++) {
      const gruppe = pakete.slice(i, i + jeSeite)
      const letzte = i + jeSeite >= pakete.length
      const korn = letzte ? Math.min((i + gruppe.length) * schritt, endKorn) : (i + gruppe.length) * schritt
      seiten.push(seite(gruppe, korn, nr, letzte ? 4 : 0, serie))
    }
    const aus = new Uint8Array(seiten.reduce((s, x) => s + x.length, 0))
    let o = 0; for (const x of seiten) { aus.set(x, o); o += x.length }
    return aus
  }

  /** Ist an den angegebenen Stellen wirklich Sprache und dazwischen Ruhe? (Gegenprobe an der fertigen Datei) */
  function gegenprobe(pcm, zeiten) {
    const h = huellkurve(pcm)
    const rms = (a, b) => { let s = 0, n = 0; for (let f = Math.floor(a * 100); f < Math.min(h.length, Math.ceil(b * 100)); f++) { s += h[f]; n++ } return n ? s / n : 0 }
    let fehler = 0
    for (let i = 0; i < zeiten.length; i++) {
      const [a, b] = zeiten[i]
      if (rms(a, b) < 0.01) fehler++
      if (i + 1 < zeiten.length && rms(b + 0.08, zeiten[i + 1][0] - 0.08) > 0.006) fehler++
    }
    return fehler
  }

  // ── Güte-Vergleich verschiedener Bitraten (ohne Gehör): wie stark weicht das Klangbild vom Original ab? ──
  function fft(re, im) {
    const n = re.length
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t } }
    for (let len = 2; len <= n; len <<= 1) {
      const w = -2 * Math.PI / len
      for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(w * k), d = Math.sin(w * k), a = i + k, b = a + len / 2
        const xr = re[b] * c - im[b] * d, xi = re[b] * d + im[b] * c
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi
      }
    }
  }
  /** Spektren je 20 ms (Fenster 512): Betrag je Frequenzband */
  function spektren(pcm) {
    const N = 512, schritt = 480, aus = []
    for (let o = 0; o + N <= pcm.length; o += schritt) {
      const re = new Float64Array(N), im = new Float64Array(N)
      for (let i = 0; i < N; i++) re[i] = pcm[o + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)))
      fft(re, im)
      const m = new Float64Array(N / 2)
      for (let i = 0; i < N / 2; i++) m[i] = re[i] * re[i] + im[i] * im[i]
      aus.push(m)
    }
    return aus
  }
  /** mittlere Abweichung der Spektren in dB (nur Abschnitte mit Sprache) und obere Grenzfrequenz des Ergebnisses */
  function abweichung(original, kopie) {
    const a = spektren(original), b = spektren(kopie)
    const n = Math.min(a.length, b.length)
    let summe = 0, zahl = 0
    const band = new Float64Array(256)
    for (let f = 0; f < n; f++) {
      let energie = 0
      for (let i = 0; i < 256; i++) energie += a[f][i]
      if (energie < 1e-3) continue
      let q = 0
      for (let i = 2; i < 170; i++) { const d = 10 * Math.log10((a[f][i] + 1e-9) / (b[f][i] + 1e-9)); q += d * d }   // bis 8 kHz
      summe += Math.sqrt(q / 168); zahl++
      for (let i = 0; i < 256; i++) band[i] += b[f][i]
    }
    const ganz = band.reduce((x, y) => x + y, 0)
    let lauf = 0, grenze = 255
    for (let i = 0; i < 256; i++) { lauf += band[i]; if (lauf >= ganz * 0.995) { grenze = i; break } }
    return { db: Math.round((summe / Math.max(1, zahl)) * 10) / 10, grenzeHz: Math.round(grenze * RATE / 512) }
  }

  window.ton = {
    /** dieselbe Aufnahme mit mehreren Bitraten kodieren und mit dem Original vergleichen */
    async vergleich(b64, bitraten) {
      const pcm = await dekodiere(b64)
      const aus = []
      for (const br of bitraten) {
        const ogg = await kodiere(pcm, br)
        const zurueck = await dekodiere(alsB64(ogg))
        aus.push({ bitrate: br, kb: Math.round(ogg.length / 102.4) / 10, kbit: Math.round(ogg.length * 8 / (pcm.length / RATE) / 100) / 10, ...abweichung(pcm, zurueck) })
      }
      return { sekunden: Math.round(pcm.length / RATE * 10) / 10, aus }
    },
    /** nur ansehen: Pausen einer Aufnahme */
    async analyse(b64) { const pcm = await dekodiere(b64); const p = pausen(pcm); return { dauer: pcm.length / RATE, anfang: p.anfang, ende: p.ende, pausen: p.liste.map(x => [x.von, x.dauer]) } },
    /**
     * Einen Lerntag bauen. quellen: [{ b64, gewichte }] (erst die Wortliste, dann der Dialog).
     * Ergebnis: Ogg-Datei, Zeitmarken je Quelle, Kennzahlen zur Sicherheit.
     */
    async baue(quellen, bitrate) {
      const alle = [], bericht = []
      for (const q of quellen) {
        const pcm = await dekodiere(q.b64)
        // Schnittstellen vorgegeben (geprüft mit scripts/italiano-ton-pruefe.py: ein Spracherkenner hört mit, wo ein
        // Stück wirklich endet) — sonst wie bisher nach Pausen und Textlänge schätzen
        const t = Array.isArray(q.stuecke) && q.stuecke.length === q.gewichte.length
          ? { stuecke: q.stuecke, guete: 0, vorsprung: 9, sicher: 9, grund: 'vorgegeben' }
          : teile(pcm, q.gewichte, q.zusatz ?? 3)
        bericht.push({ guete: t.guete, vorsprung: t.vorsprung ?? 9, sicher: t.sicher, grund: t.grund, dauer: Math.round(pcm.length / RATE * 10) / 10, schnitte: t.stuecke ? t.stuecke.map(x => Math.round(x[0] * 100) / 100) : [] })
        if (!t.stuecke) return { ok: false, bericht }
        // einzeln neu vertonte Stücke (q.ersatz = { Nummer: { b64, stueck: [von, bis] } }) treten an die Stelle des Stücks aus dieser Aufnahme
        const ersatz = {}
        for (const [nr, e] of Object.entries(q.ersatz || {})) ersatz[nr] = { pcm: await dekodiere(e.b64), s: e.stueck }
        t.stuecke.forEach((s, nr) => alle.push(ersatz[nr] ?? { pcm, s }))
      }
      // alle Stücke aller Quellen in EINE Datei
      const stuecke = []
      let ganz = new Float32Array(0)
      const versatz = []
      for (const q of new Set(alle.map(a => a.pcm))) { versatz.push([q, ganz.length / RATE]); const neu = new Float32Array(ganz.length + q.length); neu.set(ganz, 0); neu.set(q, ganz.length); ganz = neu }
      for (const a of alle) { const o = versatz.find(v => v[0] === a.pcm)[1]; stuecke.push([a.s[0] + o, a.s[1] + o]) }
      const fertig = setze(ganz, stuecke)
      const ogg = await kodiere(fertig.pcm, bitrate)
      // Gegenprobe: die fertige Datei wieder dekodieren
      const zurueck = await dekodiere(alsB64(ogg))
      const laengeOk = Math.abs(zurueck.length - fertig.pcm.length) / RATE < 0.12
      const fehler = gegenprobe(zurueck, fertig.zeiten)
      const zeiten = []
      let i = 0
      for (const q of quellen) { zeiten.push(fertig.zeiten.slice(i, i + q.gewichte.length)); i += q.gewichte.length }
      return { ok: laengeOk && fehler === 0, ogg: alsB64(ogg), zeiten, bericht, sekunden: Math.round(fertig.pcm.length / RATE * 10) / 10, laengeOk, fehler }
    },
  }
})()
