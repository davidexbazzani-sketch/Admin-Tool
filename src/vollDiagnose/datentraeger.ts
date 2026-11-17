// ── PC-Volldiagnose: Datenträger-Ereignisse dem Gerät zuordnen (reine Logik) ───
// Ein USB-Stick, der ohne „Auswerfen“ abgezogen wurde, hinterlässt NTFS- und disk-Fehler, die wie
// Fehler der eingebauten Platte aussehen. Ohne Zuordnung schlüge die Diagnose chkdsk auf C: oder
// einen Plattentausch vor. Grundlage: die beim Scan vorhandenen Platten/Laufwerke (Get-Disk,
// Get-Volume, fltmc volumes) und die Gerätenamen im Ereignistext.

import type { VdGeraet } from './typen'

/** Datenträger, die beim Scan vorhanden waren (Rundumscan bzw. V5). `gelernt` = aus Ereignistexten, nicht vorhanden. */
export interface DatentraegerInfo { sysDisk?: string; disks?: { nr: string; bus: string }[]; festeLw?: string[]; wechselLw?: string[]; vols?: { lw: string; dev: string; gelernt?: boolean }[] }
export type DtZiel = 'intern' | 'wechsel' | 'unklar'

const s = (v: unknown) => (v == null ? '' : String(v))
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : v == null || v === '' ? [] : [v as T])
const RE_LW = /(?:Volume-?ID|\bvolume|Laufwerk|file system on|Dateisystem auf)\s*:?\s*["„]?([A-Z]):/i
const RE_DISK = /\\Device\\Harddisk(\d+)(?:\\DR(\d+))?/i
const RE_HDVOL = /\\Device\\HarddiskVolume(\d+)\b/i
const gross = (l: string[] = []) => l.map(x => s(x).toUpperCase().replace(/:$/, ''))
const volVon = (hv: string, info?: DatentraegerInfo) => (info?.vols || []).find(x => s(x.dev).toLowerCase() === `\\device\\harddiskvolume${hv}`)

/** Quellen, deren Ereignisse einen Datenträger betreffen. */
export const DATENTRAEGER_QUELLE = /^(disk|Ntfs|Microsoft-Windows-Ntfs|volmgr|stornvme|storahci|partmgr)$/i

/** Laufwerksbuchstabe („D:“) aus einem Ereignistext — direkt oder über \Device\HarddiskVolumeN. */
export function lwAusText(t: string, info?: DatentraegerInfo): string {
  const m = RE_LW.exec(t || '')
  if (m) return m[1].toUpperCase() + ':'
  const hv = RE_HDVOL.exec(t || '')?.[1]
  const v = hv ? volVon(hv, info) : undefined
  return v ? s(v.lw).toUpperCase().replace(/:$/, '') + ':' : ''
}

/**
 * Eingebaute Platte, USB-Stick/Wechseldatenträger oder unklar?
 * - \Device\HarddiskN: Platte N vorhanden → nach Bus (USB/SD = Wechsel). Nicht mehr vorhanden und
 *   „DRx“ ≠ N (wird bei jedem Einstecken neu nummeriert) → Wechseldatenträger, sonst unklar
 *   (könnte eine ausgefallene eingebaute Platte sein).
 * - Laufwerksbuchstabe bzw. HarddiskVolumeN: fest eingebaut → intern; Wechsellaufwerk → Wechsel;
 *   gar nicht mehr vorhanden → am PC Wechsel (Sticks kommen und gehen), am Server unklar (SAN/iSCSI).
 */
export function ordneDatentraeger(t: string, info: DatentraegerInfo | undefined, geraet: VdGeraet): DtZiel {
  if (!info) return 'unklar'
  const dm = RE_DISK.exec(t || '')
  if (dm && (info.disks || []).length) {
    const d = (info.disks || []).find(x => s(x.nr) === dm[1])
    if (d) return /^(USB|SD|MMC|1394)$/i.test(s(d.bus)) ? 'wechsel' : 'intern'
    return dm[2] !== undefined && dm[2] !== dm[1] ? 'wechsel' : 'unklar'
  }
  const feste = gross(info.festeLw), wechsel = gross(info.wechselLw)
  const hv = RE_HDVOL.exec(t || '')?.[1]
  const v = hv ? volVon(hv, info) : undefined
  // Buchstabe direkt aus dem Text, sonst über den Gerätenamen (fltmc bzw. gelernt)
  const direkt = RE_LW.exec(t || '')?.[1]?.toUpperCase()
  const lw = direkt || (v ? s(v.lw).toUpperCase().replace(/:$/, '') : '')
  if (lw && (feste.length || wechsel.length)) {
    if (wechsel.includes(lw)) return 'wechsel'
    // Gelernter Buchstabe, der heute zu einer festen Platte gehört: kann ein anderes Gerät gewesen sein
    if (feste.includes(lw)) return direkt || !v?.gelernt ? 'intern' : 'unklar'
    return geraet === 'pc' ? 'wechsel' : 'unklar'
  }
  // Gerätename, den fltmc nicht (mehr) kennt → nicht mehr vorhanden
  if (hv && !v && (info.vols || []).some(x => !x.gelernt)) return geraet === 'pc' ? 'wechsel' : 'unklar'
  return 'unklar'
}

/**
 * Zuordnung \Device\HarddiskVolumeN → Laufwerk aus Ereignistexten lernen, die beides nennen
 * (z. B. NTFS 140 „Volume-ID: D:, Gerätename: \Device\HarddiskVolume7“). Hilft bei Meldungen, die nur
 * den Gerätenamen tragen (NTFS 50), wenn fltmc nicht lesbar ist bzw. das Gerät nicht mehr steckt.
 * Vorhandene Einträge (fltmc) haben Vorrang.
 */
export function lerneVolumes(texte: string[], info?: DatentraegerInfo): DatentraegerInfo | undefined {
  if (!info) return info
  const vols = [...(info.vols || [])]
  for (const t of texte) {
    const lw = RE_LW.exec(t || '')?.[1], hv = RE_HDVOL.exec(t || '')?.[1]
    if (!lw || !hv || vols.some(x => s(x.dev).toLowerCase() === `\\device\\harddiskvolume${hv}`)) continue
    vols.push({ lw: lw.toUpperCase(), dev: `\\Device\\HarddiskVolume${hv}`, gelernt: true })
  }
  return { ...info, vols }
}

export function leseGeraete(v: unknown): DatentraegerInfo | undefined {
  if (!v || typeof v !== 'object') return undefined
  const g = v as Record<string, unknown>
  return {
    sysDisk: g.sysDisk == null || g.sysDisk === '' ? undefined : s(g.sysDisk),
    disks: arr<{ nr: unknown; bus: unknown }>(g.disks).map(x => ({ nr: s(x.nr), bus: s(x.bus) })),
    festeLw: arr<unknown>(g.festeLw).map(s), wechselLw: arr<unknown>(g.wechselLw).map(s),
    vols: arr<{ lw: unknown; dev: unknown }>(g.vols).map(x => ({ lw: s(x.lw), dev: s(x.dev) })),
  }
}
