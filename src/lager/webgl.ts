// Kann dieser PC 3D? Geprüft OHNE three — erst danach wird die 3D-Ansicht nachgeladen.
// Auf PCs mit Grafiktreiber-Problemen startet so gleich die Regalansicht (2D).

let ergebnis: boolean | null = null

export function kann3D(): boolean {
  if (ergebnis !== null) return ergebnis
  try {
    const w = window as unknown as { __LAGER_KEIN_3D__?: boolean }
    if (w.__LAGER_KEIN_3D__) return (ergebnis = false)
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null
    if (!gl) return (ergebnis = false)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return (ergebnis = true)
  } catch { return (ergebnis = false) }
}
