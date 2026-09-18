// Screenshot-OCR (offline) über die in Windows eingebaute Texterkennung.
import { api } from '../../electronAPI'

/** PNG (Base64, ohne data:-Präfix nötig) → erkannter Text. Wirft bei Fehler mit Klartext. */
export async function ocrScreenshot(base64Png: string): Promise<string> {
  const r = await api().ocrImage(base64Png)
  if (!r.ok) throw new Error(r.error || 'OCR fehlgeschlagen')
  return r.text || ''
}

/** Blob (aus der Zwischenablage) → Base64 ohne data:-Präfix. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:image\/\w+;base64,/, ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
