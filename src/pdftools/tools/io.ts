// ── PDF-Werkzeuge: Datei-Ein/Ausgabe ─────────────────────────────────────────
// Kapselt das Oeffnen/Speichern ueber die bestehende Electron-Bruecke (api()).
import { api } from '../../electronAPI'

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface OpenedFile { name: string; data: Uint8Array; path: string }

// Datei-Dialog -> Bytes lesen. Liefert null bei Abbruch.
export async function openPdfViaDialog(): Promise<OpenedFile | null> {
  const path = await api().openFileDialog([{ name: 'PDF', extensions: ['pdf'] }])
  if (!path) return null
  return readFileAsBytes(path)
}

export async function openFilesViaDialog(extensions: string[]): Promise<OpenedFile | null> {
  const path = await api().openFileDialog([{ name: 'Datei', extensions }])
  if (!path) return null
  return readFileAsBytes(path)
}

export async function readFileAsBytes(path: string): Promise<OpenedFile | null> {
  const r = await api().readFile(path)
  if (!r.success || !r.data) return null
  const name = path.split(/[\\/]/).pop() ?? 'dokument.pdf'
  return { name, data: base64ToBytes(r.data), path }
}

// Bytes ueber den Speichern-Dialog ablegen und (optional) oeffnen.
export async function saveBytes(
  bytes: Uint8Array,
  suggestedName: string,
  filters: { name: string; extensions: string[] }[],
): Promise<{ ok: boolean; cancelled?: boolean; path?: string; error?: string }> {
  const path = await api().saveFileDialog(suggestedName, filters)
  if (!path) return { ok: true, cancelled: true }
  const res = await api().writeFile(path, bytesToBase64(bytes))
  if (!res.success) return { ok: false, error: res.error || 'Speichern fehlgeschlagen.' }
  api().openPath(path).catch(() => {})
  return { ok: true, path }
}

export function savePdf(bytes: Uint8Array, suggestedName = 'dokument.pdf') {
  return saveBytes(bytes, suggestedName, [{ name: 'PDF', extensions: ['pdf'] }])
}

export async function saveText(text: string, suggestedName = 'text.txt') {
  const enc = new TextEncoder()
  return saveBytes(enc.encode(text), suggestedName, [{ name: 'Text', extensions: ['txt'] }])
}

export function sanitizeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_')
}

export function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}
