// „Lager einsehen“ — die 3D-Szene (three.js). NUR dieser Ordner importiert three.
// Gezeichnet wird nur auf Anforderung (Bewegung, Hover, neue Daten) — keine Dauerschleife.
// Beschriftungen, die sich ändern (Stückzahlen, Namen, Soll/Ist), liegen als HTML darüber.

import {
  AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, Color, DirectionalLight, DynamicDrawUsage, Float32BufferAttribute,
  HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry,
  Quaternion, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, Euler,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  BODEN_DICKE, FAECHER, FACH_BY_ORT, RAUM, REGALE, REGAL_HOEHE, REGAL_TIEFE, ZONEN, ZONE_BY_ORT, fachDrehung, fachPunkt,
  ortKurz, type Fach, type Regal, type Zone,
} from '../aufbau'
import { stapele, type Kasten, type Platzierung, type StapelGeraet, type StapelGruppe } from '../stapel'
import { TYP_LABEL, type LagerTyp, type OrtId } from '../typen'
import { AUSWAHL, DUNKEL, HELL, INVENTUR_FARBE, MARKIERT, TREFFER, TYP_FARBE, ZONE_FARBE, type Palette } from './farben'

export interface SzeneGruppe { ort: OrtId; geraete: StapelGeraet[] }
export interface Markierung { ort: OrtId; zustand: 'stimmt' | 'abweichung' | 'offen'; text?: string }
export interface Auswahl { ort: OrtId; typ?: LagerTyp }
export type Ansicht = 'alles' | 'rueckwand' | 'links' | 'bereiche'

export interface SzeneOptionen {
  behaelter: HTMLElement
  overlay: HTMLElement
  hell: boolean
  /** Hintergrundfarbe aus dem Tool-Design (CSS) */
  hintergrund?: string
  onAuswahl: (a: Auswahl | null) => void
  onKontextVerloren: () => void
}

export interface SzeneHandle {
  setzeDaten(gruppen: SzeneGruppe[], namen: Map<string, string>): void
  setzeMarkierungen(m: Markierung[] | null): void
  setzeAuswahl(a: Auswahl | null, fahren?: boolean): void
  setzeTreffer(serials: Set<string> | null): void
  ansicht(a: Ansicht): void
  setzeThema(hell: boolean, hintergrund?: string): void
  bildpunkt(ort: OrtId, typ?: LagerTyp): { x: number; y: number } | null
  info(): { geometrien: number; texturen: number; aufrufe: number; bilder: number }
  entsorge(): void
}

// ── kleine Helfer ─────────────────────────────────────────────────────────────

const Q = new Quaternion(), E = new Euler(), P = new Vector3(), S = new Vector3()
function matrix(pos: [number, number, number], drehY: number, groesse: [number, number, number], drehZ = 0): Matrix4 {
  E.set(0, drehY, drehZ, 'YZX')
  Q.setFromEuler(E)
  return new Matrix4().compose(P.set(...pos), Q, S.set(...groesse))
}

/** Punkt im Regal (lokal: lx entlang der Breite ab Mitte, lz nach vorne ab Mitte) → Welt. */
function regalPunkt(r: Regal, lx: number, y: number, lz: number): [number, number, number] {
  const c = Math.cos(r.drehung), s = Math.sin(r.drehung)
  return [r.x + lx * c + lz * s, y, r.z - lx * s + lz * c]
}

interface Teil { m: Matrix4; farbe: string }

function regalTeile(pal: Palette): Teil[] {
  const teile: Teil[] = []
  const D = REGAL_TIEFE
  for (const r of REGALE) {
    const W = r.breite, H = REGAL_HOEHE
    const add = (lx: number, y: number, lz: number, g: [number, number, number], farbe: string, drehZ = 0) =>
      teile.push({ m: matrix(regalPunkt(r, lx, y, lz), r.drehung, g, drehZ), farbe })
    // Seitenwände
    add(-W / 2 + 0.01, H / 2, 0, [0.02, H, D], pal.regal)
    add(W / 2 - 0.01, H / 2, 0, [0.02, H, D], pal.regal)
    // Rückwand (linkes Regal: offen mit Kreuzstreben)
    if (!r.kreuzstreben) add(0, H / 2, -D / 2 + 0.005, [W - 0.02, H, 0.01], pal.regalRueckwand)
    // Böden mit Vorderkante
    for (const y of [...r.boeden, r.deck]) {
      add(0, y - BODEN_DICKE / 2, 0, [W - 0.04, BODEN_DICKE, D - 0.004], pal.regal)
      add(0, y - 0.0225, D / 2 - 0.006, [W - 0.04, 0.045, 0.012], pal.kante)
    }
    if (r.kreuzstreben) {
      const ys = [...r.boeden, r.deck]
      for (let i = 0; i < ys.length - 1; i++) {
        const y0 = ys[i] + 0.02, y1 = ys[i + 1] - 0.05
        if (y1 - y0 < 0.1) continue
        const dx = W - 0.12, dy = y1 - y0
        const len = Math.hypot(dx, dy), w = Math.atan2(dy, dx)
        add(0, (y0 + y1) / 2, -D / 2 + 0.02, [len, 0.022, 0.006], pal.regalRueckwand, w)
        add(0, (y0 + y1) / 2, -D / 2 + 0.02, [len, 0.022, 0.006], pal.regalRueckwand, -w)
      }
    }
    // Kulisse: Monitore oben auf den Regalen an der Rückwand
    if (r.nr <= 4) {
      const stellen = r.breite < 0.9 ? [-0.1] : [-0.27, 0.22]
      stellen.forEach((lx, i) => {
        const d = (i % 2 ? 0.12 : -0.08)
        teile.push({ m: matrix(regalPunkt(r, lx, r.deck + 0.008, -0.04), r.drehung + d, [0.22, 0.015, 0.16]), farbe: pal.monitor })
        teile.push({ m: matrix(regalPunkt(r, lx, r.deck + 0.12, -0.06), r.drehung + d, [0.05, 0.22, 0.03]), farbe: pal.monitor })
        teile.push({ m: matrix(regalPunkt(r, lx, r.deck + 0.36, -0.035), r.drehung + d, [0.54, 0.32, 0.035]), farbe: pal.monitor })
      })
    }
  }
  return teile
}

// ── Aufkleber (ein Textur-Atlas, ein Netz) ────────────────────────────────────

interface Aufkleber { fach: Fach; text: string; links: boolean; breite: number; hoehe: number; gross: boolean }

function alleAufkleber(): Aufkleber[] {
  const out: Aufkleber[] = []
  for (const f of FAECHER) {
    if (f.ort.startsWith('fach:')) {
      out.push({ fach: f, text: f.aufkleber, links: false, breite: 0.07, hoehe: 0.034, gross: true })
      if (f.zusatz) out.push({ fach: f, text: f.zusatz, links: true, breite: 0.2, hoehe: 0.026, gross: false })
    } else if (f.ort === 'r5:pending') {
      // wie im Foto: beide Schilder auf demselben Boden — „↓“ meint das Bodenfach darunter
      out.push({ fach: FACH_BY_ORT.get('r5:abholbereit')!, text: `${f.aufkleber} ↓`, links: true, breite: 0.4, hoehe: 0.026, gross: false })
    } else if (f.ort === 'r5:abholbereit') {
      out.push({ fach: f, text: `↑ ${f.aufkleber}`, links: false, breite: 0.34, hoehe: 0.026, gross: false })
    } else {
      out.push({ fach: f, text: f.aufkleber, links: !!f.aufkleberLinks, breite: f.aufkleber.length > 24 ? 0.34 : 0.22, hoehe: 0.028, gross: false })
    }
  }
  return out
}

function baueAufkleberNetz(): { netz: Mesh; textur: CanvasTexture } {
  const liste = alleAufkleber()
  const A = 1024, ZH = 64
  const canvas = document.createElement('canvas')
  canvas.width = A; canvas.height = A
  const ctx = canvas.getContext('2d')!
  let x = 0, y = 0
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (const a of liste) {
    const w = Math.min(A, Math.round((a.breite / a.hoehe) * ZH))
    if (x + w > A) { x = 0; y += ZH }
    // Aufkleber zeichnen: weiß, feiner Rand, schwarzer Text
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x + 1, y + 1, w - 2, ZH - 2)
    ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 2
    ctx.strokeRect(x + 2, y + 2, w - 4, ZH - 4)
    ctx.fillStyle = '#111111'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    let groesse = a.gross ? 46 : 30
    const schrift = (g: number) => `${a.gross ? '600' : '500'} ${g}px "Segoe UI", Arial, sans-serif`
    ctx.font = schrift(groesse)
    while (groesse > 12 && ctx.measureText(a.text).width > w - 14) { groesse -= 1; ctx.font = schrift(groesse) }
    ctx.fillText(a.text, x + w / 2, y + ZH / 2 + 1)
    // Rechteck auf der Vorderkante des Bodens
    const f = a.fach
    const hw = a.breite / 2, hh = a.hoehe / 2
    const u = a.links ? 0.04 + hw : f.breite - 0.04 - hw
    const v = -0.022, wv = -0.0108
    const ecken = [fachPunkt(f, u - hw, v - hh, wv), fachPunkt(f, u + hw, v - hh, wv), fachPunkt(f, u + hw, v + hh, wv), fachPunkt(f, u - hw, v + hh, wv)]
    const basis = pos.length / 3
    for (const e of ecken) pos.push(...e)
    const u0 = x / A, u1 = (x + w) / A, vo = 1 - y / A, vu = 1 - (y + ZH) / A
    uv.push(u0, vu, u1, vu, u1, vo, u0, vo)
    idx.push(basis, basis + 1, basis + 2, basis, basis + 2, basis + 3)
    x += w
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  const textur = new CanvasTexture(canvas)
  textur.colorSpace = SRGBColorSpace
  textur.anisotropy = 8
  const netz = new Mesh(geo, new MeshBasicMaterial({ map: textur, polygonOffset: true, polygonOffsetFactor: -1 }))
  return { netz, textur }
}

// ── Boden mit Bereichen (gemalte Textur) ──────────────────────────────────────

function baueBoden(pal: Palette): { netz: Mesh; textur: CanvasTexture } {
  const W = 1024, H = Math.round(W * RAUM.tiefe / RAUM.breite)
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = pal.teppich
  ctx.fillRect(0, 0, W, H)
  // feine Teppich-Struktur (fest, kein Zufall)
  let s = 7
  const zufall = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = zufall() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
    ctx.fillRect(zufall() * W, zufall() * H, 2, 2)
  }
  const sx = W / RAUM.breite, sz = H / RAUM.tiefe
  for (const z of ZONEN) {
    const farbe = ZONE_FARBE[z.farbe]
    ctx.beginPath()
    ctx.arc(z.x * sx, z.z * sz, z.radius * sx, 0, Math.PI * 2)
    ctx.fillStyle = farbe + '33'
    ctx.fill()
    ctx.lineWidth = 7
    ctx.strokeStyle = farbe
    ctx.setLineDash(z.gestrichelt ? [22, 14] : [])
    ctx.stroke()
  }
  ctx.setLineDash([])
  const textur = new CanvasTexture(canvas)
  textur.colorSpace = SRGBColorSpace
  textur.anisotropy = 8
  const geo = new PlaneGeometry(RAUM.breite, RAUM.tiefe)
  const netz = new Mesh(geo, new MeshLambertMaterial({ map: textur }))
  netz.rotation.x = -Math.PI / 2
  netz.position.set(RAUM.breite / 2, 0, RAUM.tiefe / 2)
  return { netz, textur }
}

// ── Kästen der Orte (für Stapel und Anklicken) ────────────────────────────────

function kastenVon(ort: OrtId): { kasten: Kasten; welt: (u: number, v: number, w: number) => [number, number, number]; dreh: number } | null {
  const f = FACH_BY_ORT.get(ort)
  if (f) return { kasten: f, welt: (u, v, w) => fachPunkt(f, u, v, w), dreh: fachDrehung(f) }
  const z = ZONE_BY_ORT.get(ort)
  if (z) {
    const k = z.radius * 1.3
    return { kasten: { breite: k, tiefe: k, hoehe: 0.7 }, welt: (u, v, w) => [z.x - k / 2 + u, 0.004 + v, z.z + k / 2 - w], dreh: 0 }
  }
  return null
}

function mitteVon(ort: OrtId): Vector3 {
  const f = FACH_BY_ORT.get(ort)
  if (f) return new Vector3(...fachPunkt(f, f.breite / 2, f.hoehe / 2, f.tiefe / 2))
  const z = ZONE_BY_ORT.get(ort) as Zone
  return new Vector3(z.x, 0.15, z.z)
}

function normaleVon(ort: OrtId): Vector3 {
  const f = FACH_BY_ORT.get(ort)
  if (!f) return new Vector3(0, 1, 0)
  const d = fachDrehung(f)
  return new Vector3(Math.sin(d), 0, Math.cos(d))
}

// ── HTML-Beschriftungen ───────────────────────────────────────────────────────

interface Etikett { el: HTMLElement; welt: Vector3; normale?: Vector3; maxAbstand: number }

function helligkeit(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967295
}

const nextPot = (n: number) => { let p = 64; while (p < n) p *= 2; return p }

export function erzeugeSzene(o: SzeneOptionen): SzeneHandle {
  let pal = o.hell ? HELL : DUNKEL
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'default', failIfMajorPerformanceCaveat: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = SRGBColorSpace
  const canvas = renderer.domElement
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.touchAction = 'none'
  canvas.setAttribute('data-lager-canvas', '')
  o.behaelter.appendChild(canvas)

  const scene = new Scene()
  scene.background = new Color(o.hintergrund || pal.hintergrund)
  const camera = new PerspectiveCamera(40, 1, 0.05, 40)
  const himmel = new HemisphereLight(0xffffff, 0x8a8a8a, pal.lichtHimmel)
  const sonne = new DirectionalLight(0xffffff, pal.lichtSonne)
  sonne.position.set(3, 5, 4.5)
  const grund = new AmbientLight(0xffffff, 0.25)
  scene.add(himmel, sonne, grund)

  // Raum
  const einheit = new BoxGeometry(1, 1, 1)
  const wandMat = new MeshLambertMaterial({ color: pal.wand })
  const wandGeo = new PlaneGeometry(1, 1)
  const waende: Mesh[] = []
  const wand = (b: number, h: number, pos: [number, number, number], drehY: number) => {
    const m = new Mesh(wandGeo, wandMat)
    m.scale.set(b, h, 1); m.position.set(...pos); m.rotation.y = drehY
    scene.add(m); waende.push(m)
  }
  wand(RAUM.breite, RAUM.hoehe, [RAUM.breite / 2, RAUM.hoehe / 2, 0], 0)
  wand(RAUM.tiefe, RAUM.hoehe, [0, RAUM.hoehe / 2, RAUM.tiefe / 2], Math.PI / 2)
  wand(RAUM.tiefe, RAUM.hoehe, [RAUM.breite, RAUM.hoehe / 2, RAUM.tiefe / 2], -Math.PI / 2)
  const boden = baueBoden(pal)
  scene.add(boden.netz)

  // Regale (ein Netz für alle Teile)
  const teile = regalTeile(pal)
  const regalMat = new MeshLambertMaterial({ color: 0xffffff })
  const regalNetz = new InstancedMesh(einheit, regalMat, teile.length)
  const c = new Color()
  teile.forEach((t, i) => { regalNetz.setMatrixAt(i, t.m); regalNetz.setColorAt(i, c.set(t.farbe)) })
  regalNetz.instanceMatrix.needsUpdate = true
  if (regalNetz.instanceColor) regalNetz.instanceColor.needsUpdate = true
  regalNetz.computeBoundingSphere()
  scene.add(regalNetz)

  const aufkleber = baueAufkleberNetz()
  scene.add(aufkleber.netz)

  // Fach-Flächen (Auswahl, Inventur)
  const flaechenMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false })
  const flaechen = new InstancedMesh(einheit, flaechenMat, FAECHER.length)
  flaechen.count = 0
  flaechen.renderOrder = 2
  scene.add(flaechen)

  // Trefferkästen (nicht sichtbar, nur zum Anklicken)
  const kastenOrte: OrtId[] = [...FAECHER.map(f => f.ort), ...ZONEN.map(z => z.ort)]
  const kaesten = new InstancedMesh(einheit, new MeshBasicMaterial(), kastenOrte.length)
  kastenOrte.forEach((ort, i) => {
    const f = FACH_BY_ORT.get(ort)
    if (f) kaesten.setMatrixAt(i, matrix(fachPunkt(f, f.breite / 2, f.hoehe / 2, f.tiefe / 2), fachDrehung(f), [f.breite, f.hoehe, f.tiefe]))
    else { const z = ZONE_BY_ORT.get(ort)!; kaesten.setMatrixAt(i, matrix([z.x, 0.25, z.z], 0, [z.radius * 2, 0.5, z.radius * 2])) }
  })
  kaesten.updateMatrixWorld(true)
  kaesten.computeBoundingSphere()

  // Geräte
  const geraeteMat = new MeshLambertMaterial({ color: 0xffffff })
  let geraete = new InstancedMesh(einheit, geraeteMat, 64)
  geraete.instanceMatrix.setUsage(DynamicDrawUsage)
  geraete.count = 0
  scene.add(geraete)
  let platz: (Platzierung & { ort: OrtId })[] = []
  const gruppen = new Map<string, { ort: OrtId; g: StapelGruppe; welt: (u: number, v: number, w: number) => [number, number, number] }>()

  // Zustand
  let auswahl: Auswahl | null = null
  let hover: Auswahl | null = null
  let treffer: Set<string> | null = null
  let markierungen: Markierung[] | null = null
  let namen = new Map<string, string>()
  let bilder = 0

  // ── Kamera + Steuerung ─────────────────────────────────────────────────────
  const steuerung = new OrbitControls(camera, canvas)
  steuerung.enableDamping = true
  steuerung.dampingFactor = 0.12
  steuerung.zoomToCursor = true
  steuerung.minDistance = 0.5
  steuerung.maxDistance = 7.5
  steuerung.maxPolarAngle = Math.PI / 2 - 0.04
  steuerung.screenSpacePanning = true
  const ANSICHTEN: Record<Ansicht, { pos: [number, number, number]; ziel: [number, number, number] }> = {
    alles: { pos: [3.3, 2.5, 6.1], ziel: [1.85, 0.85, 1.25] },
    rueckwand: { pos: [2.0, 1.1, 4.45], ziel: [2.0, 1.02, 0.2] },
    links: { pos: [3.35, 1.1, 2.05], ziel: [0.2, 1.02, 2.05] },
    bereiche: { pos: [2.55, 3.6, 4.9], ziel: [2.55, 0, 1.95] },
  }
  camera.position.set(...ANSICHTEN.alles.pos)
  steuerung.target.set(...ANSICHTEN.alles.ziel)
  steuerung.update()

  let fahrt: { von: Vector3; nach: Vector3; zielVon: Vector3; zielNach: Vector3; start: number; dauer: number } | null = null
  const sanft = matchMedia('(prefers-reduced-motion: reduce)').matches
  function fahreZu(pos: Vector3, ziel: Vector3) {
    if (sanft) { camera.position.copy(pos); steuerung.target.copy(ziel); steuerung.update(); anfordern(); return }
    fahrt = { von: camera.position.clone(), nach: pos, zielVon: steuerung.target.clone(), zielNach: ziel, start: performance.now(), dauer: 480 }
    steuerung.enabled = false
    anfordern()
  }

  // ── Zeichnen auf Anforderung ───────────────────────────────────────────────
  let geplant = 0
  let weg = false
  function anfordern() { if (!geplant && !weg) geplant = requestAnimationFrame(bild) }
  function bild() {
    geplant = 0
    if (weg) return
    let weiter = false
    if (fahrt) {
      const k = Math.min(1, (performance.now() - fahrt.start) / fahrt.dauer)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      camera.position.lerpVectors(fahrt.von, fahrt.nach, e)
      steuerung.target.lerpVectors(fahrt.zielVon, fahrt.zielNach, e)
      if (k >= 1) { fahrt = null; steuerung.enabled = true } else weiter = true
    }
    if (steuerung.update()) weiter = true
    // Blickziel im Raum halten
    const t = steuerung.target
    t.x = Math.min(RAUM.breite, Math.max(0, t.x)); t.y = Math.min(RAUM.hoehe, Math.max(0, t.y)); t.z = Math.min(RAUM.tiefe + 1, Math.max(0, t.z))
    renderer.render(scene, camera)
    bilder++
    etikettenSetzen()
    if (weiter) anfordern()
  }
  steuerung.addEventListener('change', anfordern)

  // ── Größe ──────────────────────────────────────────────────────────────────
  function groesse() {
    const w = Math.max(1, o.behaelter.clientWidth), h = Math.max(1, o.behaelter.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    anfordern()
  }
  const ro = new ResizeObserver(groesse)
  ro.observe(o.behaelter)
  groesse()

  // ── Kontextverlust (Grafiktreiber) ─────────────────────────────────────────
  const verloren = (e: Event) => { e.preventDefault(); o.onKontextVerloren() }
  canvas.addEventListener('webglcontextlost', verloren)

  // ── Farben ─────────────────────────────────────────────────────────────────
  const gleich = (a: Auswahl | null, ort: OrtId, typ: LagerTyp) => !!a && a.ort === ort && (!a.typ || a.typ === typ)
  const cBasis = new Color(), cZiel = new Color()
  function faerben() {
    platz.forEach((p, i) => {
      cBasis.set(p.markiert ? MARKIERT : TYP_FARBE[p.typ])
      // jedes Gerät minimal anders hell — nebeneinander stehende Tower verschmelzen sonst zu einem Block
      if (!p.markiert) cBasis.offsetHSL(0, 0, (helligkeit(p.serial) - 0.5) * (p.typ === 'elitebook' ? 0.05 : 0.07))
      if (treffer?.has(p.serial)) cBasis.set(TREFFER)
      else if (gleich(auswahl, p.ort, p.typ)) cBasis.lerp(cZiel.set(AUSWAHL), 0.55)
      else if (gleich(hover, p.ort, p.typ)) cBasis.lerp(cZiel.set(AUSWAHL), 0.3)
      geraete.setColorAt(i, cBasis)
    })
    if (geraete.instanceColor) geraete.instanceColor.needsUpdate = true
    // Flächen: Inventur-Zustand, sonst Auswahl
    let n = 0
    const flaeche = (ort: OrtId, farbe: string) => {
      const f = FACH_BY_ORT.get(ort)
      if (!f || n >= FAECHER.length) return
      flaechen.setMatrixAt(n, matrix(fachPunkt(f, f.breite / 2, 0.003, f.tiefe / 2), fachDrehung(f), [f.breite - 0.01, 0.004, f.tiefe - 0.01]))
      flaechen.setColorAt(n, cBasis.set(farbe))
      n++
    }
    const markiert = new Set<OrtId>()
    for (const m of markierungen || []) { flaeche(m.ort, INVENTUR_FARBE[m.zustand]); markiert.add(m.ort) }
    if (auswahl && !markiert.has(auswahl.ort)) flaeche(auswahl.ort, AUSWAHL)
    flaechen.count = n
    flaechen.instanceMatrix.needsUpdate = true
    if (flaechen.instanceColor) flaechen.instanceColor.needsUpdate = true
    anfordern()
  }

  // ── Daten ──────────────────────────────────────────────────────────────────
  function setzeDaten(liste: SzeneGruppe[], n: Map<string, string>) {
    namen = n
    platz = []
    gruppen.clear()
    for (const gr of liste) {
      const k = kastenVon(gr.ort)
      if (!k || !gr.geraete.length) continue
      const erg = stapele(k.kasten, gr.geraete)
      for (const p of erg.platz) platz.push({ ...p, ort: gr.ort })
      for (const g of erg.gruppen) gruppen.set(`${gr.ort}|${g.typ}`, { ort: gr.ort, g, welt: k.welt })
    }
    if (platz.length > geraete.instanceMatrix.count) {
      scene.remove(geraete)
      geraete.dispose()
      geraete = new InstancedMesh(einheit, geraeteMat, nextPot(platz.length))
      geraete.instanceMatrix.setUsage(DynamicDrawUsage)
      scene.add(geraete)
    }
    platz.forEach((p, i) => {
      const k = kastenVon(p.ort)!
      geraete.setMatrixAt(i, matrix(k.welt(p.u, p.v + p.h / 2, p.w), k.dreh + p.dreh, [p.b, p.h, p.t]))
    })
    geraete.count = platz.length
    geraete.instanceMatrix.needsUpdate = true
    geraete.computeBoundingSphere()
    geraete.computeBoundingBox()
    etikettenBauen()
    faerben()
  }

  // ── Anklicken / Hover ──────────────────────────────────────────────────────
  const ray = new Raycaster()
  const zeiger = new Vector2()
  function treffe(clientX: number, clientY: number): Auswahl | null {
    const r = canvas.getBoundingClientRect()
    zeiger.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(zeiger, camera)
    const g = ray.intersectObject(geraete, false)[0]
    if (g && g.instanceId !== undefined && platz[g.instanceId]) return { ort: platz[g.instanceId].ort, typ: platz[g.instanceId].typ }
    const k = ray.intersectObject(kaesten, false)[0]
    if (k && k.instanceId !== undefined) return { ort: kastenOrte[k.instanceId] }
    return null
  }
  let unten: { x: number; y: number } | null = null
  const runter = (e: PointerEvent) => { unten = { x: e.clientX, y: e.clientY } }
  const hoch = (e: PointerEvent) => {
    if (!unten) return
    const bewegt = Math.hypot(e.clientX - unten.x, e.clientY - unten.y)
    unten = null
    if (bewegt > 4 || e.button !== 0) return
    o.onAuswahl(treffe(e.clientX, e.clientY))
  }
  let hoverGeplant = 0
  let letzteBewegung: PointerEvent | null = null
  const bewegung = (e: PointerEvent) => {
    letzteBewegung = e
    if (hoverGeplant || e.buttons) return
    hoverGeplant = requestAnimationFrame(() => {
      hoverGeplant = 0
      if (!letzteBewegung || weg) return
      const h = treffe(letzteBewegung.clientX, letzteBewegung.clientY)
      canvas.style.cursor = h ? 'pointer' : 'grab'
      if ((h?.ort ?? '') + (h?.typ ?? '') !== (hover?.ort ?? '') + (hover?.typ ?? '')) { hover = h; faerben() }
    })
  }
  const raus = () => { if (hover) { hover = null; faerben() } }
  canvas.addEventListener('pointerdown', runter)
  canvas.addEventListener('pointerup', hoch)
  canvas.addEventListener('pointermove', bewegung)
  canvas.addEventListener('pointerleave', raus)

  // ── Beschriftungen ─────────────────────────────────────────────────────────
  let etiketten: Etikett[] = []
  function etikett(text: string, klasse: string, welt: Vector3, maxAbstand: number, daten: Record<string, string>, normale?: Vector3, klick?: () => void): void {
    const el = document.createElement(klick ? 'button' : 'div')
    el.className = `lager-etikett ${klasse}`
    el.textContent = text
    for (const [k, v] of Object.entries(daten)) el.dataset[k] = v
    if (klick) el.addEventListener('click', ev => { ev.stopPropagation(); klick() })
    el.style.display = 'none'
    o.overlay.appendChild(el)
    etiketten.push({ el, welt, normale, maxAbstand })
  }
  function etikettenBauen() {
    for (const e of etiketten) e.el.remove()
    etiketten = []
    const markProOrt = new Map((markierungen || []).map(m => [m.ort, m]))
    // Stückzahl je Gruppe
    for (const [, { ort, g, welt }] of gruppen) {
      const mitte = (g.u0 + g.u1) / 2
      const p = new Vector3(...welt(mitte, g.oben + 0.012, 0.02))
      const extra = g.anzahl > g.gezeichnet ? ` (+${g.anzahl - g.gezeichnet})` : ''
      etikett(`${g.anzahl}${extra}`, 'lager-zahl', p, 5.2, { ort, klasse: g.typ, titel: `${TYP_LABEL[g.typ]} · ${g.anzahl}` }, normaleVon(ort), () => o.onAuswahl({ ort, typ: g.typ }))
      etiketten[etiketten.length - 1].el.title = `${TYP_LABEL[g.typ]}: ${g.anzahl} Gerät(e)${extra ? ` — ${g.anzahl - g.gezeichnet} davon nicht gezeichnet` : ''}`
    }
    // Namensschilder „vorgesehen für“
    platz.forEach(p => {
      const name = namen.get(p.serial)
      if (!name || !p.markiert) return
      const k = kastenVon(p.ort)!
      etikett(`→ ${name}`, 'lager-name', new Vector3(...k.welt(p.u, p.v + p.h + 0.075, p.w)), 6.5, { ort: p.ort, serial: p.serial }, normaleVon(p.ort), () => o.onAuswahl({ ort: p.ort, typ: p.typ }))
    })
    // Bereiche
    for (const z of ZONEN) {
      const n = [...gruppen.values()].filter(x => x.ort === z.ort).reduce((s, x) => s + x.g.anzahl, 0)
      etikett(`${z.label} · ${n}`, `lager-zone lager-zone-${z.farbe}`, new Vector3(z.x, 0.02, z.z + z.radius + 0.06), 99, { ort: z.ort }, undefined, () => o.onAuswahl({ ort: z.ort }))
    }
    // Mini-Inventur
    for (const [ort, m] of markProOrt) {
      const f = FACH_BY_ORT.get(ort)
      // an der eigenen Bodenkante (neben dem Buchstaben), nicht an der Decke — sonst wirkt es wie das Fach darüber
      const p = f ? new Vector3(...fachPunkt(f, f.breite * 0.62, 0.01, -0.02)) : new Vector3(ZONE_BY_ORT.get(ort)!.x, 0.03, ZONE_BY_ORT.get(ort)!.z - ZONE_BY_ORT.get(ort)!.radius * 0.6)
      const text = m.zustand === 'stimmt' ? `✓ ${ortKurz(ort)}` : m.zustand === 'abweichung' ? `${ortKurz(ort)}: ${m.text || 'Abweichung'}` : `${ortKurz(ort)} offen`
      etikett(text, `lager-inventur lager-inventur-${m.zustand}`, p, 6, { ort, zustand: m.zustand }, f ? normaleVon(ort) : undefined, () => o.onAuswahl({ ort }))
    }
    anfordern()
  }
  const V = new Vector3(), Z = new Vector3()
  function etikettenSetzen() {
    const w = o.behaelter.clientWidth, h = o.behaelter.clientHeight
    for (const e of etiketten) {
      const abstand = camera.position.distanceTo(e.welt)
      let zeigen = abstand <= e.maxAbstand
      if (zeigen && e.normale) zeigen = Z.copy(camera.position).sub(e.welt).dot(e.normale) > 0
      if (zeigen) {
        V.copy(e.welt).project(camera)
        zeigen = V.z < 1 && V.z > -1 && Math.abs(V.x) <= 1.05 && Math.abs(V.y) <= 1.05
      }
      if (!zeigen) { if (e.el.style.display !== 'none') e.el.style.display = 'none'; continue }
      const x = (V.x + 1) / 2 * w, y = (1 - V.y) / 2 * h
      e.el.style.display = ''
      e.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
      e.el.style.zIndex = String(1000 - Math.round(abstand * 100))
    }
  }

  // ── nach außen ─────────────────────────────────────────────────────────────
  function blickAuf(a: Auswahl) {
    const mitte = mitteVon(a.ort)
    const gr = a.typ ? gruppen.get(`${a.ort}|${a.typ}`) : undefined
    if (gr) mitte.set(...gr.welt((gr.g.u0 + gr.g.u1) / 2, Math.min(0.15, gr.g.oben), 0.15))
    if (a.ort.startsWith('zone:')) fahreZu(new Vector3(mitte.x + 0.4, 1.7, mitte.z + 1.6), mitte)
    else fahreZu(mitte.clone().add(normaleVon(a.ort).multiplyScalar(1.15)).add(new Vector3(0, 0.18, 0)), mitte)
  }

  const handle: SzeneHandle = {
    setzeDaten,
    setzeMarkierungen(m) { markierungen = m && m.length ? m : null; etikettenBauen(); faerben() },
    setzeAuswahl(a, fahren = true) { auswahl = a; faerben(); if (a && fahren) blickAuf(a) },
    setzeTreffer(s) { treffer = s && s.size ? s : null; faerben() },
    ansicht(a) { const v = ANSICHTEN[a]; fahreZu(new Vector3(...v.pos), new Vector3(...v.ziel)) },
    setzeThema(hell, hintergrund) {
      pal = hell ? HELL : DUNKEL
      ;(scene.background as Color).set(hintergrund || pal.hintergrund)
      himmel.intensity = pal.lichtHimmel; sonne.intensity = pal.lichtSonne
      anfordern()
    },
    bildpunkt(ort, typ) {
      let p: Vector3 | null = null
      const kandidaten = platz.filter(x => x.ort === ort && (!typ || x.typ === typ))
      if (kandidaten.length) {
        const oben = kandidaten.reduce((a, b) => (b.v > a.v ? b : a))
        const k = kastenVon(ort)!
        p = new Vector3(...k.welt(oben.u, oben.v + oben.h * 0.5, oben.w))
      } else p = mitteVon(ort)
      camera.updateMatrixWorld()
      V.copy(p).project(camera)
      if (V.z >= 1 || Math.abs(V.x) > 1 || Math.abs(V.y) > 1) return null
      const r = canvas.getBoundingClientRect()
      return { x: r.left + (V.x + 1) / 2 * r.width, y: r.top + (1 - V.y) / 2 * r.height }
    },
    info() { return { geometrien: renderer.info.memory.geometries, texturen: renderer.info.memory.textures, aufrufe: renderer.info.render.calls, bilder } },
    entsorge() {
      weg = true
      if (geplant) cancelAnimationFrame(geplant)
      if (hoverGeplant) cancelAnimationFrame(hoverGeplant)
      ro.disconnect()
      steuerung.removeEventListener('change', anfordern)
      steuerung.dispose()
      canvas.removeEventListener('webglcontextlost', verloren)
      canvas.removeEventListener('pointerdown', runter)
      canvas.removeEventListener('pointerup', hoch)
      canvas.removeEventListener('pointermove', bewegung)
      canvas.removeEventListener('pointerleave', raus)
      for (const e of etiketten) e.el.remove()
      etiketten = []
      einheit.dispose(); wandGeo.dispose(); wandMat.dispose()
      boden.netz.geometry.dispose(); (boden.netz.material as MeshLambertMaterial).dispose(); boden.textur.dispose()
      aufkleber.netz.geometry.dispose(); (aufkleber.netz.material as MeshBasicMaterial).dispose(); aufkleber.textur.dispose()
      regalNetz.dispose(); regalMat.dispose()
      flaechen.dispose(); flaechenMat.dispose()
      kaesten.dispose(); (kaesten.material as MeshBasicMaterial).dispose()
      geraete.dispose(); geraeteMat.dispose()
      for (const w of waende) scene.remove(w)
      scene.clear()
      renderer.renderLists.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
  return handle
}
