import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// ── Easter Egg: Belohnung nach abgeschlossener Zubehoer-Inventur ──────────────
// ECHTE 3D-Drift-Kolonne aus Nissan Skylines (R30–R35), gerendert mit Three.js
// (prozedurale Mesh-Modelle, echte Beleuchtung + Environment-Reflexionen).
// KEIN Konfetti, KEINE Modell-Beschriftungen an den Autos. Hinter den Reifen
// entsteht dreidimensionaler, partikelbasierter Reifenrauch (Sprite-Partikel),
// der plastisch aufpoppt, sich im Raum ausdehnt, verblasst und sich aufloest.
//
// Diese Komponente wird ausschliesslich vom Modul "Zubehoer Inventur" genutzt.

interface Props {
  onDone: () => void
}

const STAGGER_MS = 720       // Versatz zwischen den Autos
const DRIVE_MS = 5400        // Fahrzeit eines Autos quer ueber die Szene
const FADE_MS = 850          // Ausblenden des Overlays am Ende
const START_X = -18          // Start-/Ziel-X in Weltkoordinaten (off-screen)
const END_X = 18

const CARBON = 0x26292c

interface CarSpec {
  body: number
  lower?: number       // zweifarbiger unterer Bereich (R30)
  glass: number
  rim: number
  metallic: boolean
  wing: 'duck' | 'low' | 'high'
  wingCarbon?: boolean
  hoodCarbon?: boolean
}

// Exakte Farb-Spezifikationen lt. Vorgabe – ohne jede Textbeschriftung.
const CARS: CarSpec[] = [
  { body: 0xc8102e, lower: 0x141414, glass: 0x0d1626, rim: 0xe3e6ea, metallic: false, wing: 'duck' },                                 // R30 rot/schwarz
  { body: 0x1d3563, glass: 0x0f1d36, rim: 0xc8cdd5, metallic: true, wing: 'low' },                                                    // R31 dunkelblau metallic
  { body: 0x3a1369, glass: 0x160a2c, rim: 0xd0d4db, metallic: true, wing: 'low' },                                                    // R32 midnight purple
  { body: 0xeef0f3, glass: 0x22314a, rim: 0x9aa0aa, metallic: false, wing: 'low' },                                                   // R33 werks-weiss
  { body: 0x1f6fe0, glass: 0x10213c, rim: 0xe1e5ec, metallic: true, wing: 'high' },                                                   // R34 bayside blue
  { body: 0xc9ccd1, glass: 0x19222f, rim: 0x3c3f44, metallic: true, wing: 'high', wingCarbon: true, hoodCarbon: true },               // R35 silber, carbon
]

export default function InventoryCelebration({ onDone }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [fading, setFading] = useState(false)

  // Ablauf-Steuerung: warten bis alle Autos durch sind, dann ausblenden
  useEffect(() => {
    const lastCarEnd = (CARS.length - 1) * STAGGER_MS + DRIVE_MS
    const fadeTimer = setTimeout(() => setFading(true), lastCarEnd)
    const doneTimer = setTimeout(() => onDone(), lastCarEnd + FADE_MS)
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer) }
  }, [onDone])

  // Three.js-Szene
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.1, 200)
    camera.position.set(3.4, 2.7, 12)
    camera.lookAt(0, 0.7, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    // Environment fuer realistische Metallic-Reflexionen
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envRT.texture

    // Beleuchtung
    scene.add(new THREE.HemisphereLight(0xaecbff, 0x14161f, 0.9))
    scene.add(new THREE.AmbientLight(0x3a3f4a, 0.5))
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(6, 10, 8); scene.add(key)
    const fill = new THREE.DirectionalLight(0x88aaff, 0.8); fill.position.set(-8, 4, -5); scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffe6c0, 0.7); rim.position.set(-4, 3, 9); scene.add(rim)

    // ── Material-Helfer ───────────────────────────────────────────────────────
    const disposables: { dispose: () => void }[] = []
    const track = <T extends THREE.Material | THREE.BufferGeometry>(x: T): T => { disposables.push(x); return x }

    const paint = (color: number, metallic: boolean) =>
      track(new THREE.MeshStandardMaterial({ color, metalness: metallic ? 0.95 : 0.4, roughness: metallic ? 0.26 : 0.5 }))
    const carbonMat = () => track(new THREE.MeshStandardMaterial({ color: CARBON, metalness: 0.55, roughness: 0.42 }))
    const glassMat = (c: number) => track(new THREE.MeshStandardMaterial({ color: c, metalness: 0.7, roughness: 0.06, transparent: true, opacity: 0.86 }))
    const tireMat = track(new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.15, roughness: 0.85 }))
    const lightWhite = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfe3ff, emissiveIntensity: 1.3, metalness: 0.3, roughness: 0.3 }))
    const lightRed = track(new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff1414, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.4 }))

    const box = (w: number, h: number, d: number) => track(new THREE.BoxGeometry(w, h, d))

    function makeWheel(rimColor: number): THREE.Group {
      const g = new THREE.Group()
      const rimMat = paint(rimColor, true)
      const tire = new THREE.Mesh(track(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 26)), tireMat)
      tire.rotation.x = Math.PI / 2
      g.add(tire)
      const disc = new THREE.Mesh(track(new THREE.CylinderGeometry(0.3, 0.3, 0.34, 24)), rimMat)
      disc.rotation.x = Math.PI / 2
      g.add(disc)
      // 6 Speichen in der Radebene
      const spokeGeo = box(0.06, 0.56, 0.33)
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(spokeGeo, rimMat)
        s.rotation.z = (i / 6) * Math.PI * 2
        g.add(s)
      }
      const hub = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 12)), track(new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0.8, roughness: 0.4 })))
      hub.rotation.x = Math.PI / 2
      g.add(hub)
      return g
    }

    function buildCar(spec: CarSpec): THREE.Group {
      const car = new THREE.Group()
      const bodyMat = paint(spec.body, spec.metallic)

      // Hauptkarosserie
      const main = new THREE.Mesh(box(4.0, 0.66, 1.92), bodyMat); main.position.set(0, 0.66, 0); car.add(main)
      // Untere Schuerze / zweifarbiger Bereich (R30) bzw. dezenter Schweller
      const lowerMat = spec.lower !== undefined ? paint(spec.lower, false) : track(new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.3, roughness: 0.7 }))
      const rocker = new THREE.Mesh(box(4.04, 0.3, 1.96), lowerMat); rocker.position.set(0, 0.32, 0); car.add(rocker)
      // Front-Nase
      const nose = new THREE.Mesh(box(0.5, 0.5, 1.86), bodyMat); nose.position.set(2.0, 0.6, 0); car.add(nose)
      // Motorhaube (Carbon bei R35)
      const hood = new THREE.Mesh(box(1.5, 0.12, 1.74), spec.hoodCarbon ? carbonMat() : bodyMat); hood.position.set(1.2, 0.96, 0); car.add(hood)
      // Greenhouse / Scheiben
      const cabin = new THREE.Mesh(box(2.0, 0.52, 1.74), glassMat(spec.glass)); cabin.position.set(-0.25, 1.05, 0); car.add(cabin)
      // Dach
      const roof = new THREE.Mesh(box(1.65, 0.16, 1.7), bodyMat); roof.position.set(-0.32, 1.34, 0); car.add(roof)
      // Saeulen (B-Saeule) zur Gliederung des Greenhouse
      const pillar = new THREE.Mesh(box(0.1, 0.5, 1.76), bodyMat); pillar.position.set(-0.3, 1.05, 0); car.add(pillar)

      // Raeder
      const wheelPos: [number, number][] = [[1.42, 0.96], [1.42, -0.96], [-1.42, 0.96], [-1.42, -0.96]]
      for (const [x, z] of wheelPos) {
        const w = makeWheel(spec.rim)
        w.position.set(x, 0.46, z)
        car.add(w)
      }

      // Scheinwerfer
      for (const z of [0.62, -0.62]) {
        const hl = new THREE.Mesh(box(0.1, 0.26, 0.34), lightWhite); hl.position.set(2.04, 0.74, z); car.add(hl)
      }
      // Signatur-Ruecklichter: vier runde Lampen (GT-R-Markenzeichen)
      const lampGeo = track(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 18))
      for (const z of [0.52, 0.26, -0.26, -0.52]) {
        const tl = new THREE.Mesh(lampGeo, lightRed)
        tl.rotation.z = Math.PI / 2
        tl.position.set(-2.0, 0.74, z)
        car.add(tl)
      }

      // Heckspoiler
      const wingMat = spec.wingCarbon ? carbonMat() : bodyMat
      if (spec.wing === 'high') {
        const blade = new THREE.Mesh(box(0.5, 0.07, 1.74), wingMat); blade.position.set(-2.05, 1.42, 0); car.add(blade)
        for (const z of [0.62, -0.62]) {
          const up = new THREE.Mesh(box(0.08, 0.5, 0.1), wingMat); up.position.set(-2.05, 1.12, z); car.add(up)
        }
      } else if (spec.wing === 'low') {
        const blade = new THREE.Mesh(box(0.5, 0.07, 1.7), wingMat); blade.position.set(-1.96, 1.04, 0); car.add(blade)
      } else {
        const duck = new THREE.Mesh(box(0.42, 0.06, 1.7), wingMat); duck.position.set(-1.96, 0.99, 0); car.add(duck)
      }

      return car
    }

    // Autos anlegen
    const cars = CARS.map((spec, i) => {
      const g = buildCar(spec)
      g.visible = false
      scene.add(g)
      return { group: g, delay: i * STAGGER_MS }
    })

    // ── Reifenrauch (3D-Sprite-Partikel) ───────────────────────────────────────
    const smokeTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64
      const g = c.getContext('2d')!
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      grd.addColorStop(0, 'rgba(255,255,255,0.95)')
      grd.addColorStop(0.45, 'rgba(214,217,223,0.55)')
      grd.addColorStop(1, 'rgba(190,194,200,0)')
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
      const t = new THREE.CanvasTexture(c)
      disposables.push(t)
      return t
    })()

    interface Puff { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; max: number; vx: number; vy: number; vz: number; grow: number; base: number }
    const POOL = 320
    const puffs: Puff[] = []
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.SpriteMaterial({ map: smokeTex, color: 0xdfe2e8, transparent: true, opacity: 0, depthWrite: false })
      disposables.push(mat)
      const sprite = new THREE.Sprite(mat)
      sprite.visible = false
      scene.add(sprite)
      puffs.push({ sprite, mat, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0, base: 0.3 })
    }
    let puffCursor = 0
    function emit(x: number, y: number, z: number) {
      const p = puffs[puffCursor]
      puffCursor = (puffCursor + 1) % POOL
      p.life = 0
      p.max = 0.95 + Math.random() * 0.7
      p.base = 0.28 + Math.random() * 0.22
      p.vx = -0.7 - Math.random() * 0.9            // trailt hinter dem fahrenden Auto
      p.vy = 0.45 + Math.random() * 0.7
      p.vz = (Math.random() - 0.5) * 0.7
      p.grow = 1.6 + Math.random() * 1.2
      p.sprite.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3)
      p.sprite.scale.setScalar(p.base)
      p.sprite.visible = true
      p.mat.opacity = 0.0
    }

    // ── Animationsschleife ──────────────────────────────────────────────────────
    const clock = new THREE.Clock()
    let raf = 0
    let running = true

    function resize() {
      if (!mount) return
      const w = mount.clientWidth, h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', resize)

    function frame() {
      if (!running) return
      const dt = Math.min(clock.getDelta(), 0.05)
      const elapsedMs = clock.elapsedTime * 1000

      for (const c of cars) {
        const p = (elapsedMs - c.delay) / DRIVE_MS
        if (p < 0 || p > 1) { c.group.visible = false; continue }
        c.group.visible = true
        const x = START_X + (END_X - START_X) * p
        c.group.position.x = x
        // Drift: Ausbrechen (Yaw) + Neigung (Lean) + Wackeln (Bob)
        const t = clock.elapsedTime * 6 + c.delay
        c.group.rotation.y = -0.18 + Math.sin(t) * 0.13
        c.group.rotation.z = Math.sin(t * 1.3) * 0.06
        c.group.position.y = Math.abs(Math.sin(t * 2)) * 0.04

        // Rauch hinter den Hinterraedern emittieren
        if (p > 0.04 && p < 0.97) {
          const yaw = c.group.rotation.y
          const rearX = x - 1.42 * Math.cos(yaw)
          for (const sz of [0.95, -0.95]) {
            emit(rearX, 0.32, sz - 1.42 * Math.sin(yaw))
            if (Math.random() < 0.5) emit(rearX, 0.3, sz - 1.42 * Math.sin(yaw))
          }
        }
      }

      // Partikel aktualisieren
      for (const p of puffs) {
        if (!p.sprite.visible) continue
        p.life += dt
        const f = p.life / p.max
        if (f >= 1) { p.sprite.visible = false; p.mat.opacity = 0; continue }
        p.sprite.position.x += p.vx * dt
        p.sprite.position.y += p.vy * dt
        p.sprite.position.z += p.vz * dt
        p.vy *= 0.985
        const s = p.base + p.grow * f
        p.sprite.scale.setScalar(s)
        // schnell aufpoppen, dann verblassen
        p.mat.opacity = (f < 0.16 ? f / 0.16 : 1 - (f - 0.16) / 0.84) * 0.6
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      for (const d of disposables) d.dispose()
      envRT.dispose()
      pmrem.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[80] overflow-hidden"
      style={{
        background: 'radial-gradient(circle at 50% 28%, rgba(15,23,42,0.92), rgba(2,6,23,0.98))',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
        pointerEvents: 'none',
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* 3D-Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Glueckwunsch-Text – klar oben, NICHT an den Fahrzeugen */}
      <div className="absolute inset-x-0 top-[18%] flex flex-col items-center text-center px-6" style={{ animation: 'acc-pop 600ms ease-out both' }}>
        <p className="text-4xl md:text-5xl font-extrabold text-white drop-shadow-lg">Inventur abgeschlossen!</p>
        <p className="mt-2 text-sm md:text-base text-white/70">Gut gemacht – die Bestellliste wird gleich angezeigt.</p>
      </div>
    </div>
  )
}

const KEYFRAMES = `
@keyframes acc-pop {
  0%   { transform: scale(0.85); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
`
