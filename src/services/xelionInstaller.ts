// ── Xelion-Installer-Verwaltung ──────────────────────────────────────────────
// Die Xelion-App wird ueber eine .appinstaller-Datei (MSIX) verteilt. Diese
// Datei wird zentral auf dem Netzlaufwerk hinterlegt, damit alle Admin-PCs
// dieselbe (aktuelle) Version verwenden. Der Master-Admin kann sie jederzeit
// austauschen, wenn Xelion eine neue Version veroeffentlicht.
//
// Speicherort (zentral): config/software/xelion/installer.json
//   enthaelt die .appinstaller als Text + Metadaten (Version, wer, wann).
// Faellt die zentrale Datei weg, wird die mitgelieferte Standard-Datei aus
// public/xelion/ genutzt.

import { api } from '../electronAPI'

const STORE_PATH = 'config/software/xelion/installer.json'

export interface XelionInstaller {
  version: string          // z.B. "9.7.0.0"
  fileName: string         // Originaldateiname
  content: string          // kompletter .appinstaller-XML-Inhalt
  uploadedBy: string
  uploadedAt: string       // ISO
  source: 'central' | 'default'
}

// Version aus dem .appinstaller-XML lesen (MainBundle bevorzugt, sonst AppInstaller).
export function parseAppInstallerVersion(xml: string): string {
  const main = xml.match(/<MainBundle\b[^>]*\bVersion="([^"]+)"/i)
  if (main) return main[1]
  const root = xml.match(/<AppInstaller\b[^>]*\bVersion="([^"]+)"/i)
  return root ? root[1] : 'unbekannt'
}

function base64ToText(b64: string): string {
  try { return decodeURIComponent(escape(atob(b64))) } catch { return atob(b64) }
}

// Zentrale (Netzlaufwerk) oder — als Fallback — die mitgelieferte Standard-Datei.
export async function loadXelionInstaller(): Promise<XelionInstaller | null> {
  try {
    const data = await api().netReadJson<XelionInstaller>(STORE_PATH)
    if (data && typeof data.content === 'string' && data.content.includes('<AppInstaller')) {
      return { ...data, source: 'central' }
    }
  } catch { /* faellt auf Default zurueck */ }
  return loadBundledDefault()
}

export async function loadBundledDefault(): Promise<XelionInstaller | null> {
  try {
    const url = new URL('xelion/Xelion-Package.appinstaller', document.baseURI).href
    const res = await fetch(url)
    if (!res.ok) return null
    const content = await res.text()
    return {
      version: parseAppInstallerVersion(content),
      fileName: 'Xelion-Package.appinstaller',
      content,
      uploadedBy: 'mitgeliefert',
      uploadedAt: '',
      source: 'default',
    }
  } catch {
    return null
  }
}

// Neue .appinstaller-Datei zentral einpflegen (austauschen).
export async function replaceXelionInstaller(localPath: string, by: string): Promise<{ ok: boolean; installer?: XelionInstaller; error?: string }> {
  try {
    const read = await api().readFile(localPath)
    if (!read.success || !read.data) return { ok: false, error: read.error || 'Datei konnte nicht gelesen werden.' }
    const content = base64ToText(read.data)
    if (!content.includes('<AppInstaller')) {
      return { ok: false, error: 'Das ist keine gueltige .appinstaller-Datei (kein <AppInstaller>-Element gefunden).' }
    }
    const fileName = localPath.split(/[\\/]/).pop() ?? 'Xelion-Package.appinstaller'
    const installer: XelionInstaller = {
      version: parseAppInstallerVersion(content),
      fileName,
      content,
      uploadedBy: by || 'unbekannt',
      uploadedAt: new Date().toISOString(),
      source: 'central',
    }
    const ok = await api().netWriteJson(STORE_PATH, installer)
    if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
    return { ok: true, installer }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
