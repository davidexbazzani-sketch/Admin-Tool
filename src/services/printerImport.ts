// ── Drucker-Import aus der ERP-Liste ────────────────────────────────────────
//
// Die Datei aus dem Drucker-Register hat diese Spalten:
//   Ist verwaltet | Hersteller | Modell | Seriennummer | ERP-ID | IP-Adresse | MAC-Adresse
//
// Einen Warteschlangen-/Druckernamen gibt es darin NICHT. Die Zuordnung zu den bereits
// erfassten Druckern läuft deshalb über eine Kaskade von Gerätemerkmalen:
//
//     IP-Adresse  →  MAC  →  Seriennummer  →  ERP-ID gegen den Druckernamen
//
// IP und MAC stehen bei den meisten Druckern schon im Dossier (täglicher IP-Scan bzw.
// frühere Geräte-Scans). Der Weg, über den eine Zeile getroffen hat, wird mitgeführt und
// vor dem Schreiben angezeigt — bei einem Import, der auch neue Drucker anlegt, soll
// nachvollziehbar sein, warum welche Zeile wohin gehört.
//
// Diese Datei rechnet nur und greift NICHT auf das Netzlaufwerk zu, damit die Zuordnung
// ohne Oberfläche geprüft werden kann.

import type { InventoryItem } from '../types/auth'

/** Die Rollen, die im Spalten-Dialog vergeben werden. */
export type DruckerRolle =
  | 'verwaltet' | 'hersteller' | 'modell' | 'serial' | 'erpId' | 'ip' | 'mac' | 'ignore'

/** Spaltenname je Rolle (aus dem Dialog). Mehrere Spalten je Rolle sind erlaubt. */
export type Zuordnung = Partial<Record<DruckerRolle, string[]>>

/** Eine gelesene Zeile, bereits auf die Rollen abgebildet. */
export interface DruckerZeile {
  verwaltet: boolean | null
  hersteller: string
  modell: string
  serial: string
  erpId: string
  ip: string
  mac: string
  /** Zeilennummer in der Datei (1-basiert, ohne Kopfzeile) — für Meldungen. */
  zeile: number
}

export type TrefferWeg = 'ip' | 'mac' | 'serial' | 'erpId'

export interface Treffer {
  zeile: DruckerZeile
  /** Name des getroffenen Druckers (= Inventar-Eintrag). */
  drucker: string
  weg: TrefferWeg
}

export interface ImportPlan {
  treffer: Treffer[]
  /** Zeilen ohne Zuordnung — daraus werden neue Drucker. */
  neu: DruckerZeile[]
  /** Zeilen, die zu gar nichts taugen (kein einziges Merkmal gefüllt). */
  unbrauchbar: number
  /** Wie oft welcher Weg gegriffen hat (für die Übersicht vor dem Schreiben). */
  wege: Record<TrefferWeg, number>
}

/** Stammdaten je vorhandenem Drucker, so weit sie für die Zuordnung gebraucht werden. */
export interface DruckerMerkmale {
  name: string
  ip?: string
  mac?: string
  serial?: string
  /** Beim letzten Import hinterlegte ERP-ID (Dossier: master.assetTag). */
  erpId?: string
}

// ── Normalisierung ──────────────────────────────────────────────────────────

/** MAC vergleichbar machen: nur Hex, Großbuchstaben („00-C0-EE…" = „00:c0:ee…"). */
export function normMac(s: string): string {
  const h = String(s ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  return h.length === 12 ? h : ''
}

/** IPv4 vergleichbar machen (führende Nullen, Leerzeichen). */
export function normIp(s: string): string {
  const t = String(s ?? '').trim()
  const m = t.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return ''
  const teile = m.slice(1).map(x => Number(x))
  if (teile.some(x => x > 255)) return ''
  return teile.join('.')
}

/** Seriennummer/ERP-ID vergleichbar machen. */
export function normSchluessel(s: string): string {
  return String(s ?? '').trim().toUpperCase()
}

/**
 * „Ist verwaltet" aus der Datei. Excel liefert je nach Export `true`, `WAHR`, `1`, `ja` …
 * Unbekanntes gibt `null` — dann wird das Feld nicht geschrieben, statt `false` zu raten.
 */
export function leseVerwaltet(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  const t = String(v ?? '').trim().toLowerCase()
  if (!t) return null
  if (['true', 'wahr', 'ja', 'yes', 'y', 'j', '1', 'x'].includes(t)) return true
  if (['false', 'falsch', 'nein', 'no', 'n', '0'].includes(t)) return false
  return null
}

/** Hersteller + Modell zu einem Modelltext — doppelte Nennung wird vermieden. */
export function modellText(hersteller: string, modell: string): string {
  const h = (hersteller || '').trim()
  const m = (modell || '').trim()
  if (!h) return m
  if (!m) return h
  // „KYOCERA" + „KYOCERA ECOSYS…" soll nicht „KYOCERA KYOCERA ECOSYS…" werden.
  if (m.toUpperCase().startsWith(h.toUpperCase())) return m
  return `${h} ${m}`
}

// ── Zeilen aus der Datei lesen ──────────────────────────────────────────────

/** Ersten gefüllten Wert aus den Spalten einer Rolle. */
function wert(row: Record<string, unknown>, spalten: string[] | undefined): string {
  for (const s of spalten ?? []) {
    const v = String(row[s] ?? '').trim()
    if (v) return v
  }
  return ''
}

export function leseZeilen(rows: Record<string, unknown>[], z: Zuordnung): DruckerZeile[] {
  return rows.map((row, i) => ({
    verwaltet: leseVerwaltet((z.verwaltet ?? []).map(s => row[s]).find(v => v !== undefined && v !== '')),
    hersteller: wert(row, z.hersteller),
    modell: wert(row, z.modell),
    serial: wert(row, z.serial),
    erpId: wert(row, z.erpId),
    ip: wert(row, z.ip),
    mac: wert(row, z.mac),
    zeile: i + 1,
  }))
}

// ── Zuordnung ───────────────────────────────────────────────────────────────

/**
 * Welche Zeile gehört zu welchem vorhandenen Drucker?
 *
 * Ein vorhandener Drucker wird höchstens EINMAL getroffen: ist er schon vergeben, geht die
 * Zeile weiter in der Kaskade und landet sonst bei „neu". Sonst würden zwei Zeilen denselben
 * Drucker überschreiben und eine davon ginge still verloren.
 */
export function planPrinterImport(zeilen: DruckerZeile[], vorhanden: DruckerMerkmale[]): ImportPlan {
  const nachIp = new Map<string, DruckerMerkmale>()
  const nachMac = new Map<string, DruckerMerkmale>()
  const nachSerial = new Map<string, DruckerMerkmale>()
  const nachErpId = new Map<string, DruckerMerkmale>()
  const nachName = new Map<string, DruckerMerkmale>()
  for (const d of vorhanden) {
    const ip = normIp(d.ip ?? ''); if (ip && !nachIp.has(ip)) nachIp.set(ip, d)
    const mac = normMac(d.mac ?? ''); if (mac && !nachMac.has(mac)) nachMac.set(mac, d)
    const sn = normSchluessel(d.serial ?? ''); if (sn && !nachSerial.has(sn)) nachSerial.set(sn, d)
    const erp = normSchluessel(d.erpId ?? ''); if (erp && !nachErpId.has(erp)) nachErpId.set(erp, d)
    const nm = normSchluessel(d.name); if (nm && !nachName.has(nm)) nachName.set(nm, d)
  }

  const vergeben = new Set<string>()
  const treffer: Treffer[] = []
  const neu: DruckerZeile[] = []
  let unbrauchbar = 0
  const wege: Record<TrefferWeg, number> = { ip: 0, mac: 0, serial: 0, erpId: 0 }

  for (const z of zeilen) {
    const ip = normIp(z.ip), mac = normMac(z.mac)
    const sn = normSchluessel(z.serial), erp = normSchluessel(z.erpId)
    if (!ip && !mac && !sn && !erp) { unbrauchbar++; continue }

    const versuche: [TrefferWeg, DruckerMerkmale | undefined][] = [
      ['ip', ip ? nachIp.get(ip) : undefined],
      ['mac', mac ? nachMac.get(mac) : undefined],
      ['serial', sn ? nachSerial.get(sn) : undefined],
      // Die ERP-ID zuletzt: erst gegen die beim Import hinterlegte (findet ein unter
      // derselben ERP-ID getauschtes Gerät wieder), dann gegen den Druckernamen
      // (trifft die Fälle, in denen die ERP-ID der Druckername ist, z. B. PMD519).
      ['erpId', erp ? (nachErpId.get(erp) ?? nachName.get(erp)) : undefined],
    ]
    const hit = versuche.find(([, d]) => d && !vergeben.has(d.name))
    if (hit && hit[1]) {
      vergeben.add(hit[1].name)
      wege[hit[0]]++
      treffer.push({ zeile: z, drucker: hit[1].name, weg: hit[0] })
    } else {
      neu.push(z)
    }
  }

  return { treffer, neu, unbrauchbar, wege }
}

/** Name für einen neu anzulegenden Drucker: ERP-ID, sonst Seriennummer, sonst IP. */
export function neuerName(z: DruckerZeile): string {
  return (z.erpId || z.serial || z.ip || '').trim()
}

/** Kurzfassung für die Bestätigung vor dem Schreiben. */
export function planText(plan: ImportPlan, zeilenGesamt: number): string {
  const teile = [`${zeilenGesamt} Zeilen gelesen`]
  if (plan.treffer.length) {
    const w = (['ip', 'mac', 'serial', 'erpId'] as TrefferWeg[])
      .filter(k => plan.wege[k] > 0)
      .map(k => `${plan.wege[k]} über ${({ ip: 'IP', mac: 'MAC', serial: 'Seriennummer', erpId: 'ERP-ID' } as const)[k]}`)
    teile.push(`${plan.treffer.length} Druckern zugeordnet (${w.join(', ')})`)
  }
  if (plan.neu.length) teile.push(`${plan.neu.length} werden neu angelegt`)
  if (plan.unbrauchbar) teile.push(`${plan.unbrauchbar} Zeilen ohne verwertbares Merkmal übersprungen`)
  return teile.join(' · ')
}

// ── Kopfzeilen-Erkennung für die Vorauswahl im Dialog ───────────────────────

const MUSTER: [DruckerRolle, RegExp[]][] = [
  ['verwaltet', [/ist\s*verwaltet/i, /^verwaltet$/i, /managed/i]],
  ['hersteller', [/hersteller/i, /manufacturer/i, /marke/i]],
  ['modell', [/^modell$/i, /^model$/i, /modell|model/i]],
  ['serial', [/serien\s*nummer/i, /serien\s*nr/i, /^seriennr/i, /serial/i]],
  ['erpId', [/erp[-\s_]?id/i, /^erp$/i, /asset[-\s_]?(id|tag)/i]],
  ['ip', [/ip[-\s_]?adresse/i, /^ip$/i, /ip[-\s_]?address/i]],
  ['mac', [/mac[-\s_]?adresse/i, /^mac$/i, /mac[-\s_]?address/i]],
]

/**
 * Spaltenname → vorausgewählte Rolle. Reihenfolge der Muster ist Absicht: „Seriennummer"
 * wird vor „Modell" geprüft, damit eine Spalte nicht an der falschen Rolle hängen bleibt.
 * Jede Rolle wird höchstens einmal vergeben — die erste passende Spalte gewinnt.
 */
export function erkenneSpalten(spalten: string[]): Record<string, DruckerRolle> {
  const out: Record<string, DruckerRolle> = {}
  const vergeben = new Set<DruckerRolle>()
  for (const [rolle, muster] of MUSTER) {
    const treffer = spalten.find(s => !out[s] && muster.some(re => re.test(s.trim())))
    if (treffer) { out[treffer] = rolle; vergeben.add(rolle) }
  }
  for (const s of spalten) if (!out[s]) out[s] = 'ignore'
  return out
}
