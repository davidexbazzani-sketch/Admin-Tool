// ── SolidWorks-Diagnose: Analyse & Fehlerbeseitigung (Auswertungs-Logik) ──────
// Die Diagnose (Modul 4 „Bewertung") liefert im Objekt bereits alles Maschinenlesbare:
//   daten.Leistungsoptionen: { Name, Klartext, Ist, Soll, Bewertung, Typ, Schluessel }
//   daten.Massnahmen:        { Gewicht, Titel, Ist, Soll, Wirkung, Weg, Fundort, Fix }
//   daten.Herkunftstabelle:  { Einstellung, Ist, Eigentuemer, Weg, Fundort }  (Modul 5)
// Diese Datei wandelt das in eine strukturierte, aktionsfähige Befundliste (Befund[]),
// bestimmt je Befund den FIX-WEG (lokal HKCU/HKLM/powercfg, zentral→Ticket, Sicherheit,
// nur Info) und erzeugt bei Defender-Themen einen englischen Ticket-Text (copy-paste).
// REIN LESEND/rechnend — hier wird nichts am Zielrechner geändert.

import type { SwLauf, SwSkriptResult } from './swCheck.types'
import { findeErklaerung, type Erklaerung } from './erklaerungen'

// ── Roh-Formen aus den PS-Daten (Laufzeit, im TS-Modell nur `unknown`) ────────
interface RawMassnahme { Gewicht?: string; Titel?: string; Ist?: string; Soll?: string; Wirkung?: string; Weg?: string; Fundort?: string; Fix?: string }
interface RawLeistungsopt { Name?: string; Klartext?: string; Ist?: unknown; Soll?: unknown; Bewertung?: string; Typ?: string; Schluessel?: string }
interface RawHerkunft { Einstellung?: string; Ist?: string; Eigentuemer?: string; Weg?: string; Fundort?: string }

export type Gewicht = 'HOCH' | 'MITTEL' | 'GERING' | 'INFO'

// Wie ein Befund behoben werden kann.
export type FixKategorie =
  | 'registry-hkcu'   // SolidWorks-Anwenderoption → in die Hive des angemeldeten Users schreiben
  | 'registry-hklm'   // Maschinenwert (Admin) → HKLM (z. B. RDP-Hardwaregrafik)
  | 'smb'             // SMB-Client-Konfiguration per Cmdlet (Drosselung/MTU/Signierung)
  | 'powercfg'        // Energieplan → Höchstleistung
  | 'ticket-defender' // Defender-Ausnahme → zentral, englischer Ticket-Text
  | 'sicherheit'      // Sicherheitsentscheidung ohne bekannten 1-Klick-Weg
  | 'gpo'             // GPO/Umgebung → zentral
  | 'komplex'         // z. B. tote Suchpfade — Sonderbehandlung, (noch) nicht 1-Klick
  | 'info'            // reine Information, keine Aktion

// Maschinenlesbare Korrektur eines Registry-Werts (für das Fix-Skript + Backup).
export interface RegFix {
  scope: 'HKCU' | 'HKLM'      // HKCU = in die User-Hive (HKU\<SID>) des angemeldeten Anwenders
  relKey: string             // relativer Unterschlüssel OHNE Wurzel, z. B. "Software\\SolidWorks\\SOLIDWORKS 2024\\Performance"
  name: string               // Wertname, z. B. "Verify On Rebuild"
  type: 'REG_DWORD' | 'REG_SZ' | 'REG_QWORD' | 'REG_EXPAND_SZ'
  sollValue: string          // Zielwert (String; DWORD als Dezimalzahl)
  hkuSid?: string            // Quell-SID aus der Diagnose (HKCU) → bevorzugte Ziel-Hive beim Schreiben
}

// SMB-Client-Konfiguration per Set-SmbClientConfiguration (boolesche Eigenschaft).
export interface SmbFix {
  prop: 'EnableBandwidthThrottling' | 'EnableLargeMtu' | 'RequireSecuritySignature'
  ziel: boolean              // Zielwert ($true/$false)
}

export interface Befund {
  id: string                 // stabil (aus Titel abgeleitet)
  titel: string
  gewicht: Gewicht
  ist: string
  soll: string
  wirkung: string            // Erklärung fürs „i": was ist das Problem + was bringt die Änderung
  fundort: string            // exakter Ort (Registry/Cmdlet/Datei)
  weg: string                // wie man es sonst ändert (UI-Weg/Registry)
  kategorie: FixKategorie
  eigentuemer?: string       // aus der Herkunftstabelle (falls gematcht)
  fixbar: boolean            // per Checkbox 1-Klick behebbar (registry-hkcu/hklm/smb/powercfg)
  reg?: RegFix               // maschinenlesbare Korrektur (nur bei registry-*)
  smb?: SmbFix               // SMB-Client-Konfig-Korrektur (nur bei kategorie 'smb')
  powerplan?: string         // bei powercfg: Ziel-Schema-GUID (Höchstleistung)
  standardAus?: boolean      // true = nicht per Default vorausgewählt (z. B. Sicherheits-Herabstufung)
  hinweis?: string           // Zusatzwarnung (z. B. „GPO überschreibt", „Dienst-Neustart nötig")
  erklaerung?: Erklaerung    // ausführliche Erklärung (Problem/Wirkung lang + Änderung/Vorteil/Nachteil/Wann-nicht)
  regBerechnet?: 'autorecover' | 'backup'  // HKCU-Fix, dessen Zielwert (gültiger lokaler Ordner) erst am PC berechnet wird
  messbar?: 'freigabe'       // Befund, den man per Remote-Messung (statt Fix) klären kann
}

// Höchstleistung-Energieplan-GUID (Windows-Standard).
export const HOECHSTLEISTUNG_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'

function num(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}
function slug(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'befund'
}

// HKU\<SID>\... bzw. HKCU:\... → relativer Unterschlüssel (ohne Wurzel/SID) + ggf. Quell-SID.
function relFromKey(key: string): { scope: 'HKCU' | 'HKLM'; rel: string; sid?: string } | null {
  const k = (key || '').replace(/^Registry::/i, '').trim()
  let m = k.match(/^HKEY_USERS\\([^\\]+)\\(.+)$/i) || k.match(/^HKU:?\\([^\\]+)\\(.+)$/i)
  if (m) return { scope: 'HKCU', rel: m[2], sid: m[1] }   // SID merken → Ziel-Hive beim Schreiben
  m = k.match(/^HKEY_CURRENT_USER\\(.+)$/i) || k.match(/^HKCU:?\\(.+)$/i)
  if (m) return { scope: 'HKCU', rel: m[1] }
  m = k.match(/^HKEY_LOCAL_MACHINE\\(.+)$/i) || k.match(/^HKLM:?\\(.+)$/i)
  if (m) return { scope: 'HKLM', rel: m[1] }
  return null
}
// Registry-Typ robust erkennen — sowohl .NET-RegistryValueKind (DWord/String/QWord/
// ExpandString, so liefert es GetValueKind()) als auch die REG_*-Schreibweise.
function regType(t?: string): RegFix['type'] {
  const x = (t || '').toUpperCase().replace(/^REG_/, '')
  if (x === 'SZ' || x === 'STRING') return 'REG_SZ'
  if (x === 'EXPAND_SZ' || x === 'EXPANDSZ' || x === 'EXPANDSTRING') return 'REG_EXPAND_SZ'
  if (x === 'QWORD') return 'REG_QWORD'
  return 'REG_DWORD'   // DWord + alles Unerwartete (Binary/MultiString werden unten nicht fixbar)
}

/** Den Bewertungs-Lauf (Modul 4) aus einem SwLauf holen. */
export function findBewertung(lauf: SwLauf): SwSkriptResult | undefined {
  return lauf.skripte.find(s => s.id === 'bewertung' && s.ok && s.daten)
}
function findHerkunft(lauf: SwLauf): SwSkriptResult | undefined {
  return lauf.skripte.find(s => s.id === 'herkunft' && s.ok && s.daten)
}

// Titel/Fundort → Fix-Kategorie für Nicht-SW-Options-Maßnahmen.
function kategorisiere(m: RawMassnahme): FixKategorie {
  const t = (m.Titel || '').toLowerCase()
  const f = (m.Fundort || '').toLowerCase()
  if (/virenschutz|defender|ausnahme|exclusion|netzwerkdateien/.test(t) || /mppreference/.test(f)) return 'ticket-defender'
  if (/smb-signierung|signierung erzwungen|requiresecuritysignature/.test(t + f)) return 'sicherheit'
  if (/rdp|hardwaregrafik|terminal services|benumeratehwbeforesw/.test(t + f)) return 'gpo'
  if (/energieplan|hoechstleistung|höchstleistung/.test(t)) return 'powercfg'
  if (/smb-cache|bandbreitendrosselung|cachelifetime|bandwidththrottling|smb-drossel/.test(t + f)) return 'registry-hklm'
  if (/tote suchpfade|dateipositionen/.test(t)) return 'komplex'
  if (/grafikzuordnung|usergpupreferences/.test(t + f)) return 'registry-hkcu'
  if (/doppelhop|freigabemessung|profil in der registry sehr gross|nicht geprueft|zugewachsen/.test(t)) return 'info'
  return 'info'
}

// AutoRecover-/Backup-Pfad-Befund → HKCU-RegFix (Wert 'AutoRecover Directory'/'Backup directory' in
// …\SOLIDWORKS <ver>\General). relKey/Name/SID werden aus dem Fundort geparst; der Zielwert (gültiger
// lokaler Ordner im Anwenderprofil) wird erst beim Anwenden am PC berechnet → sollValue bleibt hier leer.
function autoRecoverFix(m: RawMassnahme): { reg: RegFix; kind: 'autorecover' | 'backup' } | null {
  const t = (m.Titel || '').toLowerCase()
  if (!/(autorecover|backup)-pfad ist falsch/.test(t)) return null
  const kind: 'autorecover' | 'backup' = /autorecover/.test(t) ? 'autorecover' : 'backup'
  const fundort = m.Fundort || ''
  const name = fundort.match(/Wert '([^']+)'/)?.[1] || (kind === 'backup' ? 'Backup directory' : 'AutoRecover Directory')
  // reg-Form aus dem Fundort ziehen (HKEY_USERS\<SID>\…\General), sonst den ganzen Fundort versuchen.
  const regForm = fundort.match(/reg-Form:\s*(.+?)\s*$/i)?.[1] || fundort
  const rk = relFromKey(regForm)
  if (!rk || rk.scope !== 'HKCU') return null
  return { reg: { scope: 'HKCU', relKey: rk.rel, name, type: 'REG_SZ', sollValue: '', hkuSid: rk.sid }, kind }
}

// Kuratierter Fix-Katalog für Maßnahmen mit BEKANNTEM, exaktem Eingriff. Schlüssel/Werte/Cmdlets
// stammen 1:1 aus der Diagnose (Fundort/Fix/Weg in SOLIDWORKS_Bewertung.ps1) — hier wird nichts geraten.
interface KatFix { kategorie: FixKategorie; reg?: RegFix; smb?: SmbFix; standardAus?: boolean; hinweis?: string }
function katalogFix(m: RawMassnahme): KatFix | null {
  const s = ((m.Titel || '') + ' ' + (m.Fundort || '') + ' ' + (m.Weg || '')).toLowerCase()
  // RDP-Hardwaregrafik → HKLM-Policy-Wert (reg add … bEnumerateHWBeforeSW /d 1)
  if (/benumeratehwbeforesw|hardwaregrafik|rdp-sitzung ohne/.test(s)) return {
    kategorie: 'registry-hklm',
    reg: { scope: 'HKLM', relKey: 'SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services', name: 'bEnumerateHWBeforeSW', type: 'REG_DWORD', sollValue: '1' },
    hinweis: 'Richtlinien-Schlüssel — eine GPO kann den Wert erneut überschreiben.',
  }
  // SMB-Bandbreitendrosselung ausschalten
  if (/bandbreitendrosselung|enablebandwidththrottling/.test(s)) return {
    kategorie: 'smb', smb: { prop: 'EnableBandwidthThrottling', ziel: false },
    hinweis: 'Wirkt auf neue SMB-Verbindungen (ggf. Ab-/Anmelden oder Neustart, bis alle Sitzungen neu sind).',
  }
  // Large MTU im SMB-Client einschalten
  if (/large mtu|enablelargemtu/.test(s)) return {
    kategorie: 'smb', smb: { prop: 'EnableLargeMtu', ziel: true },
    hinweis: 'Wirkt auf neue SMB-Verbindungen.',
  }
  // SMB-Signierung erzwungen → abschalten (SICHERHEITS-Herabstufung, NICHT vorausgewählt)
  if (/smb-signierung|requiresecuritysignature|signierung erzwungen/.test(s)) return {
    kategorie: 'smb', smb: { prop: 'RequireSecuritySignature', ziel: false }, standardAus: true,
    hinweis: 'SICHERHEITS-Herabstufung: hebt die erzwungene SMB-Signierung auf. Nur nach Abstimmung mit der IT-Sicherheit; oft per GPO erzwungen (wird dann erneut gesetzt).',
  }
  return null
}

/**
 * Aus einem SwLauf die strukturierte, aktionsfähige Befundliste ableiten.
 * Primärquelle für 1-Klick-Fixes: daten.Leistungsoptionen (exakter Key/Name/Typ/Soll).
 * Zusätzliche Befunde (Defender/SMB/Energieplan/…): daten.Massnahmen.
 */
export function analysiere(lauf: SwLauf): Befund[] {
  const bew = findBewertung(lauf)
  if (!bew?.daten) return []
  const d = bew.daten as Record<string, unknown>
  const massnahmen = (Array.isArray(d.Massnahmen) ? d.Massnahmen : []) as RawMassnahme[]
  const leistung = (Array.isArray(d.Leistungsoptionen) ? d.Leistungsoptionen : []) as RawLeistungsopt[]
  const herkunft = (() => {
    const h = findHerkunft(lauf)?.daten as Record<string, unknown> | undefined
    return (h && Array.isArray(h.Herkunftstabelle) ? h.Herkunftstabelle : []) as RawHerkunft[]
  })()

  const eigentuemerFor = (titel: string): string | undefined => {
    const t = titel.toLowerCase()
    const hit = herkunft.find(r => (r.Einstellung || '').toLowerCase().split(/[^a-zä-ü0-9]+/).some(w => w.length > 3 && t.includes(w)))
    return hit?.Eigentuemer
  }

  // 1) SolidWorks-Anwenderoptionen (ABWEICHUNG) → registry-hkcu, exakt setzbar.
  const ausOptionen: Befund[] = []
  const optKlartextSet = new Set<string>()
  for (const o of leistung) {
    if (o.Bewertung !== 'ABWEICHUNG') continue
    const klar = o.Klartext || o.Name || '(Option)'
    optKlartextSet.add((klar).toLowerCase())
    const rk = o.Schluessel ? relFromKey(o.Schluessel) : null
    const typ = regType(o.Typ)
    const sollStr = num(o.Soll)
    // Behebbar, wenn der Sollwert zum Typ passt: Zahlwerte für D/QWORD, nicht-leerer
    // Text für SZ/EXPAND_SZ. Binary/MultiString bleiben bewusst nicht 1-Klick-behebbar.
    const istZahl = /^-?\d+$/.test(sollStr)
    const fixbar = !!rk && sollStr !== '' && (
      ((typ === 'REG_DWORD' || typ === 'REG_QWORD') && istZahl) ||
      (typ === 'REG_SZ' || typ === 'REG_EXPAND_SZ')
    )
    ausOptionen.push({
      id: 'opt-' + slug(o.Name || klar),
      titel: klar, gewicht: 'MITTEL', ist: num(o.Ist), soll: sollStr,
      wirkung: '', // wird unten aus der Massnahme angereichert
      fundort: `${o.Schluessel || ''}  Wert '${o.Name || ''}' (${o.Typ || ''})`,
      weg: '', kategorie: rk ? (rk.scope === 'HKCU' ? 'registry-hkcu' : 'registry-hklm') : 'komplex',
      eigentuemer: eigentuemerFor(klar), fixbar,
      reg: rk && fixbar ? { scope: rk.scope, relKey: rk.rel, name: o.Name || '', type: typ, sollValue: sollStr, hkuSid: rk.sid } : undefined,
      erklaerung: findeErklaerung({ name: o.Name || '', titel: klar }),
    })
  }

  // 2) Übrige Maßnahmen (Defender/SMB/Energieplan/tote Pfade/…) — die SW-Options-
  //    Maßnahmen sind schon über (1) abgedeckt (per Klartext dedupliziert).
  const ausMassnahmen: Befund[] = []
  for (const m of massnahmen) {
    const titel = m.Titel || ''
    if (optKlartextSet.has(titel.toLowerCase())) {
      // Wirkung/Weg aus der Maßnahme in den Options-Befund übernehmen.
      const b = ausOptionen.find(x => x.titel.toLowerCase() === titel.toLowerCase())
      if (b) { b.wirkung = m.Wirkung || b.wirkung; b.weg = m.Weg || b.weg; b.gewicht = (m.Gewicht as Gewicht) || b.gewicht }
      continue
    }
    // AutoRecover-/Backup-Pfad falsch gesetzt → HKCU-Fix (Zielwert wird beim Anwenden berechnet).
    const ar = autoRecoverFix(m)
    if (ar) {
      ausMassnahmen.push({
        id: 'm-' + slug(titel),
        titel, gewicht: (m.Gewicht as Gewicht) || 'HOCH', ist: m.Ist || '', soll: m.Soll || '',
        wirkung: m.Wirkung || '', fundort: m.Fundort || '', weg: m.Weg || '',
        kategorie: 'registry-hkcu', eigentuemer: eigentuemerFor(titel), fixbar: true,
        reg: ar.reg, regBerechnet: ar.kind,
        hinweis: 'Der Zielordner wird als gültiger lokaler Ordner im Anwenderprofil gesetzt (und angelegt).',
        erklaerung: findeErklaerung({ titel, fundort: m.Fundort }),
      })
      continue
    }
    // Bekannter, exakter Eingriff aus dem Katalog? (RDP-HKLM / SMB-Cmdlets) — sonst nur kategorisieren.
    const kf = katalogFix(m)
    const kat = kf ? kf.kategorie : kategorisiere(m)
    const fixbar = !!kf?.reg || !!kf?.smb || kat === 'powercfg'
    const istFreigabe = /freigabemessung/i.test(titel)
    ausMassnahmen.push({
      id: 'm-' + slug(titel),
      titel, gewicht: (m.Gewicht as Gewicht) || 'MITTEL', ist: m.Ist || '', soll: m.Soll || '',
      wirkung: m.Wirkung || '', fundort: m.Fundort || '', weg: m.Weg || '',
      kategorie: kat, eigentuemer: eigentuemerFor(titel), fixbar,
      reg: kf?.reg, smb: kf?.smb,
      powerplan: kat === 'powercfg' ? HOECHSTLEISTUNG_GUID : undefined,
      standardAus: kf?.standardAus, hinweis: kf?.hinweis,
      erklaerung: findeErklaerung({ titel, fundort: m.Fundort }),
      messbar: istFreigabe ? 'freigabe' : undefined,
    })
  }

  const alle = [...ausOptionen, ...ausMassnahmen]
  // Sortierung: HOCH zuerst, dann MITTEL/GERING/INFO; fixbare vor nicht-fixbaren.
  const rankG = (g: Gewicht) => g === 'HOCH' ? 0 : g === 'MITTEL' ? 1 : g === 'GERING' ? 2 : 3
  return alle.sort((a, b) => rankG(a.gewicht) - rankG(b.gewicht) || (Number(b.fixbar) - Number(a.fixbar)) || a.titel.localeCompare(b.titel))
}

// Der SolidWorks/PDM-Dateiserver der Umgebung (für die Defender-Pfadausnahmen).
export const CAD_SERVER = 'w3143'

// Rohform eines Dateipositionen-Eintrags aus daten.Dateipositionen (SOLIDWORKS_Bewertung.ps1).
interface RawDateiPos { Einstellung?: string; Pfad?: string; Art?: string; Existiert?: boolean }

// UNC-Share-Root (\\server\share) aus einem UNC-Pfad.
function shareRoot(unc: string): string {
  const m = (unc || '').match(/^\\\\([^\\]+)\\([^\\]+)/)
  return m ? `\\\\${m[1]}\\${m[2]}` : ''
}
// Pfad → UNC: schon-UNC bleibt; „G:\rest" wird über die Laufwerkstabelle zu „\\server\share\rest"; lokal → ''.
function driveToUnc(pfad: string, map: Record<string, string>): string {
  const p = (pfad || '').trim()
  if (/^\\\\/.test(p)) return p
  const m = p.match(/^([A-Za-z]):(.*)$/)
  if (m) { const unc = map[m[1].toUpperCase() + ':']; if (unc) return unc.replace(/[\\/]+$/, '') + m[2] }
  return ''
}

function normPfad(u: string): string { return (u || '').replace(/[\\/]+$/, '') }

// Persönliche/temporäre Pfade — als Defender-Ausnahme sinnlos (keine geteilte CAD-Ressource).
// Diese landen manchmal als ExtReferences-Dateiposition in der Registry (z. B. ein Fehlermelde-Temp-Ordner).
function istJunkPfad(p: string): boolean {
  return /\\(temp|tmp)\\|\\\d?_?mitarbeiter\b|\\users\\|\\appdata\\|\\desktop\\|\\downloads?\\/i.test(p || '')
}

// Duplikate + Unterpfade entfernen: ein Pfad fällt raus, wenn ein anderer (case-insensitiv) sein
// übergeordneter Ordner ist. So verschwindet z. B. „…\SolidWorks\SOLIDWORKS" neben „…\SolidWorks".
function entferneUnterpfade(pfade: string[]): string[] {
  const uniq: string[] = []; const seen = new Set<string>()
  for (const raw of pfade) { const p = normPfad(raw); if (!p) continue; const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(p) } }
  return uniq.filter(p => !uniq.some(q => q !== p && (p.toLowerCase() + '\\').startsWith(q.toLowerCase() + '\\')))
}

// Server aus einem UNC-Pfad (\\server\...). Liegt er auf dem dedizierten CAD-Server?
function istCadServer(unc: string): boolean {
  const server = ((unc || '').match(/^\\\\([^\\]+)/)?.[1] || '').toLowerCase()
  return server === CAD_SERVER || server.startsWith(CAD_SERVER + '.')
}

/**
 * Reale CAD-Netzwerkpfade für die Defender-Pfadausnahmen ermitteln.
 *  Kandidaten: `swPaths` (LIVE aus der Ziel-Registry gelesen — Toolbox `General\Toolbox Data Location`,
 *  Struktur-Profile, Hole-Wizard-DB, alle ExtReferences-Dateipositionen). Fallback offline: `daten.Dateipositionen`.
 *  Auflösung: gemappte Laufwerke → UNC. Regel je Pfad: liegt er auf dem DEDIZIERTEN CAD-Server (w3143), wird der
 *  ganze Share ausgenommen (\\w3143…\SWX, \\w3143…\PortaX — alles CAD-Daten); bei anderen (allgemeinen) Servern
 *  nur der SPEZIFISCHE Ordner (nicht die ganze Firmenfreigabe). Plus w3143-Laufwerke als Share-Root.
 *  Zum Schluss werden Pfade entfernt, die schon durch einen übergeordneten Eintrag abgedeckt sind.
 */
export function cadNetzPfade(lauf: SwLauf, netzMap: Record<string, string>, swPaths?: string[]): string[] {
  const out = new Set<string>()
  const addUnc = (unc: string) => {
    if (!unc) return
    const r = istCadServer(unc) ? (shareRoot(unc) || normPfad(unc)) : normPfad(unc)
    if (r) out.add(r)
  }

  // Kandidaten: live gelesene SW-Pfade (bevorzugt), sonst die Netz-Dateipositionen aus dem Scan.
  let kandidaten = (swPaths || []).filter(Boolean)
  if (!kandidaten.length) {
    const bew = findBewertung(lauf)
    const dp = (bew?.daten && Array.isArray((bew.daten as Record<string, unknown>).Dateipositionen)
      ? (bew.daten as Record<string, unknown>).Dateipositionen : []) as RawDateiPos[]
    kandidaten = dp.filter(e => e.Art === 'UNC' || e.Art === 'Netzlaufwerk').map(e => e.Pfad || '')
    if (lauf.kennwerte?.toolboxPfad) kandidaten.push(lauf.kennwerte.toolboxPfad)
  }
  for (const p of kandidaten) { if (istJunkPfad(p)) continue; addUnc(driveToUnc(p, netzMap)) }

  // Gemappte Laufwerke auf dem CAD-Server (w3143) → ganzer Share (auch ohne SW-Referenz).
  for (const unc of Object.values(netzMap || {})) if (istCadServer(unc)) { const r = shareRoot(unc); if (r) out.add(r) }

  return entferneUnterpfade([...out]).sort()
}

// Kanonische SOLIDWORKS-Prozesse (identisch zur Diagnose) + Toolbox-Updater.
const SW_PROZESSE = ['sldworks.exe', 'sldworks_fs.exe', 'swShellFileLauncher.exe', 'swBoEngine.exe', 'swbgproc.exe', 'SLDIM.exe', 'sldToolboxUpdater.exe']

/**
 * Englischer, FELDWEISE beschrifteter Text zum Ausfüllen des SKF-ServiceNow-Katalog-Items
 * „Defender platform support – Path Exclusion/Whitelisting". Jeder Block ist einem Formularfeld
 * zugeordnet (copy-paste). Enthält echte Geräte-/Pfad-Werte + Business-Justification + Evidenz
 * (der Formular-Disclaimer verlangt Evidenz, sonst wird der Request abgelehnt). Keine Tool-Erwähnung.
 */
export function defenderTicketText(lauf: SwLauf, befunde: Befund[], cadPfade?: string[], lokalePfade?: string[]): string {
  const defender = befunde.filter(b => b.kategorie === 'ticket-defender')
  if (!defender.length) return ''
  const host = lauf.pc
  const user = lauf.kennwerte?.benutzer || 'the assigned user'
  const swVer = lauf.kennwerte?.swVersion || ''

  // Nur REAL vorhandene Pfade verwenden — nichts raten. `lokalePfade` sind die am Ziel per Test-Path
  // verifizierten lokalen SW-Ordner (Installationsordner etc.), `cadPfade` die aufgelösten CAD-Netzpfade.
  const cad = (cadPfade || []).filter(Boolean)
  const lokal = entferneUnterpfade((lokalePfade || []).filter(Boolean))   // z. B. „…\SolidWorks\SOLIDWORKS" neben „…\SolidWorks" raus
  const lokalOut = lokal.length ? lokal : ['C:\\Program Files\\<SOLIDWORKS install folder>   (verify the exact folder on this device)']
  const netz = cad.length ? cad : [`\\\\${CAD_SERVER}\\<share>   (confirm exact UNC — the SOLIDWORKS/PDM data share)`]
  // Kombinierte Liste nochmal entdoppeln (lokal + netz), dann in beiden Feldern (Block + Beschreibung) gleich verwenden.
  const folderPfade = entferneUnterpfade([...lokalOut, ...netz])
  const reqPfade = folderPfade

  // Evidenz-Zeilen auf Englisch (die Befund-Titel sind deutsch → für die drei bekannten
  // Defender-Themen sauber übersetzen, deutsche Ist-Reste ebenfalls eindeutschen→englisch).
  const en = (s: string): string => (s || '')
    .replace(/(\d+)\s*von\s*(\d+)\s*fehlen/i, '$1 of $2 missing')
    .replace(/nicht ausgenommen/gi, 'not excluded')
    .replace(/kein Eintrag/gi, 'no entry')

  // Blöcke exakt in der Reihenfolge der ServiceNow-Maske „Defender platform support – Path
  // Exclusion/Whitelisting". Jeder Block → in das gleichnamige Feld kopieren. „→ SELECT:" markiert
  // die Dropdown-Auswahl.
  const L: string[] = []
  L.push('Copy each block below into the matching field of the ServiceNow form "Defender platform support – Path Exclusion/Whitelisting". Lines marked "→ SELECT" tell you which dropdown value to pick.')
  L.push('')
  L.push('── Requested for ──')
  L.push(`${user}   (the person who uses this device)`)
  L.push('')
  L.push('── Incident number ──')
  L.push('(leave empty — no incident)')
  L.push('')
  L.push('── Issue Description with Application use and its detailed information ──')
  L.push(`Application: SOLIDWORKS${swVer ? ' ' + swVer : ''} (3D CAD/PDM), used daily for design work by ${user} on ${host}.`)
  L.push('Business justification / impact: This is a productive CAD engineering workstation. The engineers who')
  L.push('construct parts and assemblies in SOLIDWORKS on this device suffer SEVERELY degraded performance because')
  L.push('Microsoft Defender scans every SOLIDWORKS process and every CAD file access in real time. Every access to')
  L.push('every part file is scanned individually, so opening and rebuilding assemblies — especially large ones with')
  L.push('thousands of parts, many stored on the network/PDM share — is slowed from seconds to MINUTES. For the design')
  L.push('team this is a constant, measurable productivity loss that seriously impairs their daily work, throughput and')
  L.push('deadlines. The exclusions below are the standard SOLIDWORKS/Dassault recommendation and are required for')
  L.push('acceptable CAD performance on this workstation.')
  L.push('')
  L.push('Evidence that Microsoft Defender for Endpoint causes the issue on this device:')
  for (const b of defender) {
    const t = b.titel.toLowerCase()
    if (/prozess|process/.test(t)) L.push(`  - SOLIDWORKS core processes are not excluded from Defender real-time scanning (${en(b.ist) || 'no process exclusions present'}).`)
    else if (/netzwerkdatei|network/.test(t)) L.push('  - Real-time scanning of network files is enabled (DisableScanningNetworkFiles = False), so every CAD file accessed on the network share is scanned on every read.')
    else if (/portax/.test(t)) L.push('  - The PortaX/PDM working directory is not excluded from real-time scanning (many small files per check-in/out).')
    else L.push(`  - ${b.titel}: ${en(b.ist) || 'no exclusion present'}.`)
  }
  L.push('')
  L.push('Requested exclusions (please apply all for this device):')
  L.push('  - Processes (ExclusionProcess): ' + SW_PROZESSE.join(', '))
  L.push('  - Folder paths (ExclusionPath): ' + reqPfade.join('; '))
  L.push('  - Network files: if handled via a global policy rather than a path exclusion, set DisableScanningNetworkFiles = true for this device.')
  L.push('')
  L.push('── Exclusion path with application exe name ──')
  L.push(SW_PROZESSE.join('; '))
  L.push('')
  L.push('── Issue type (exclusion) ──   → SELECT in the dropdown: Folder path')
  L.push('(The SOLIDWORKS folders and the CAD/PDM network share go in "Folder/exclusion path" below; the SOLIDWORKS')
  L.push(' executables are already in "Exclusion path with application exe name" above. If the Defender team wants the')
  L.push(' executables as their own request, raise a second one with Issue type = "Application path" and the .exe list.)')
  L.push('')
  L.push('── Folder/exclusion path ──')
  for (const p of folderPfade) L.push(p)
  L.push('')
  L.push('── Hostname (Effected Device name) ──')
  L.push(host)
  return L.join('\n')
}
