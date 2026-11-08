// ── PC-Überwachung: Auswertung (rein, ohne Netz/PowerShell — testbar) ────────
// Rohereignis → Treffer, Messwerte/Dienste → Treffer, Meldungstexte und die
// Abschluss-Analyse („was war die Ursache?“).

import { GRUND_TEXT, grundKategorie } from '../netCheck/ursachen'
import { auswahlText, kontrolle } from './kontrollen'
import type { MonAbschluss, MonAuftrag, MonRohEreignis, MonSammlerAntwort, MonTreffer, MonZustand } from './types'

export const MAX_GESEHEN = 4000
export const MAX_TREFFER = 1500
export const MAX_CHAT = 1900

// ── Wissen: Bluescreen-Codes, Module, Ausnahmecodes ──────────────────────────

const BUGCHECK: Record<string, [string, string]> = {
  '0x0000000A': ['IRQL_NOT_LESS_OR_EQUAL', 'meist ein fehlerhafter Treiber (oft Netzwerk/WLAN, Speicher, Dock)'],
  '0x00000019': ['BAD_POOL_HEADER', 'Treiber oder Arbeitsspeicher beschädigt Speicherbereiche'],
  '0x0000001A': ['MEMORY_MANAGEMENT', 'Arbeitsspeicher (RAM-Test) oder Treiber'],
  '0x0000001E': ['KMODE_EXCEPTION_NOT_HANDLED', 'Treiberfehler — Treiber/BIOS aktualisieren'],
  '0x0000003B': ['SYSTEM_SERVICE_EXCEPTION', 'Treiber oder Sicherheitssoftware (Virenscanner, VPN-Client)'],
  '0x00000050': ['PAGE_FAULT_IN_NONPAGED_AREA', 'Arbeitsspeicher oder Treiber (oft Grafik/Virenscanner)'],
  '0x00000077': ['KERNEL_STACK_INPAGE_ERROR', 'Datenträger/SSD oder Auslagerungsdatei'],
  '0x0000007A': ['KERNEL_DATA_INPAGE_ERROR', 'Datenträger/SSD (SMART prüfen) oder Kabel/Controller'],
  '0x0000007E': ['SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', 'Treiberfehler — Speicherabbild nennt den Treiber'],
  '0x0000007F': ['UNEXPECTED_KERNEL_MODE_TRAP', 'Hardware (RAM/CPU) oder Treiber'],
  '0x0000009F': ['DRIVER_POWER_STATE_FAILURE', 'Treiber hängt beim Standby/Aufwachen — Treiber/BIOS/Dock-Firmware aktualisieren'],
  '0x000000C2': ['BAD_POOL_CALLER', 'fehlerhafter Treiber'],
  '0x000000D1': ['DRIVER_IRQL_NOT_LESS_OR_EQUAL', 'fehlerhafter Treiber (oft Netzwerk/WLAN, USB, Virenscanner)'],
  '0x000000EF': ['CRITICAL_PROCESS_DIED', 'Systemprozess beendet — Systemdateien (SFC/DISM), Datenträger, Sicherheitssoftware'],
  '0x000000F4': ['CRITICAL_OBJECT_TERMINATION', 'Datenträger/SSD oder Systemdateien'],
  '0x00000101': ['CLOCK_WATCHDOG_TIMEOUT', 'Prozessor/Hardware oder BIOS'],
  '0x00000116': ['VIDEO_TDR_FAILURE', 'Grafiktreiber/Grafikkarte — Treiber aktualisieren, Temperatur prüfen'],
  '0x00000117': ['VIDEO_TDR_TIMEOUT_DETECTED', 'Grafiktreiber reagiert nicht — Treiber aktualisieren'],
  '0x00000124': ['WHEA_UNCORRECTABLE_ERROR', 'Hardwarefehler (CPU, RAM, Mainboard, Überhitzung)'],
  '0x0000012B': ['FAULTY_HARDWARE_CORRUPTED_PAGE', 'Arbeitsspeicher defekt'],
  '0x00000133': ['DPC_WATCHDOG_VIOLATION', 'Treiber blockiert das System (oft SSD-/Speicher-/Netzwerktreiber)'],
  '0x00000139': ['KERNEL_SECURITY_CHECK_FAILURE', 'Treiber oder beschädigte Systemdateien'],
  '0x0000013A': ['KERNEL_MODE_HEAP_CORRUPTION', 'fehlerhafter Treiber (oft Grafik)'],
  '0x00000154': ['UNEXPECTED_STORE_EXCEPTION', 'Datenträger/SSD oder Speicherkomprimierung'],
  '0x000001CA': ['SYNTHETIC_WATCHDOG_TIMEOUT', 'System hing (Treiber/Hardware)'],
}

export function bugcheckCode(text: string): string | null {
  const m = /0x([0-9a-f]{1,8})/i.exec(text || '')
  if (!m) return null
  return '0x' + m[1].toUpperCase().padStart(8, '0')
}
export function bugcheckInfo(code: string | null): { name: string; hinweis: string } {
  const b = code ? BUGCHECK[code] : undefined
  return b ? { name: b[0], hinweis: b[1] } : { name: code || 'unbekannter Code', hinweis: 'Speicherabbild (Minidump) auswerten' }
}

const MODUL_HINWEIS: [RegExp, string][] = [
  [/^nv(oglv|wgf2um|d3dum|ldumd|api|cuda|opencl)/i, 'NVIDIA-Grafiktreiber — Grafiktreiber aktualisieren (bei CAD: zertifizierten Treiber nehmen)'],
  [/^(atio6axx|atiumd|amdxx|aticfx|amdvlk)/i, 'AMD-Grafiktreiber — Grafiktreiber aktualisieren'],
  [/^(ig\w*icd|igd\w*umd|igxel|igc64|igdgmm)/i, 'Intel-Grafiktreiber — Grafiktreiber aktualisieren (HP-Treiberpaket)'],
  [/^(ntdll|kernelbase)\.dll$/i, 'unspezifisch (Programmfehler, Add-in oder beschädigte Installation) — Programm reparieren, Add-ins prüfen'],
  [/^(clr|coreclr|mscorwks|clrjit)\.dll$/i, '.NET-Laufzeit — meist ein Add-in oder eine .NET-Komponente'],
  [/^(ucrtbase|msvcr\d*|msvcp\d*|vcruntime\d*)\.dll$/i, 'C-Laufzeitbibliothek — Visual-C++-Redistributable reparieren bzw. Programm neu installieren'],
  [/^(mso\d*(win32client)?|mso\d*\w*)\.dll$/i, 'Office-Kern — Office-Schnellreparatur, Add-ins prüfen'],
  [/^(zsahook|zsa)/i, 'Zscaler — Zscaler-Client prüfen/aktualisieren'],
  [/^(csagent|sophos|sav|mfe|cyvera|cyoptics|sentinel)/i, 'Sicherheitssoftware greift in das Programm ein'],
  [/^(unknown|stackhash)/i, 'kein Modul bekannt — Programm reparieren/aktualisieren'],
]
export function modulHinweis(modul: string): string | null {
  const m = (modul || '').trim()
  for (const [re, h] of MODUL_HINWEIS) if (re.test(m)) return h
  return null
}

const AUSNAHME: Record<string, string> = {
  'c0000005': 'Zugriffsverletzung',
  'c0000409': 'Stapelschutz/Schnellabbruch',
  'c0000374': 'Heap beschädigt',
  'c00000fd': 'Stapelüberlauf',
  'e0434352': '.NET-Ausnahme',
  'e06d7363': 'C++-Ausnahme',
  '80000003': 'Haltepunkt',
  'c0000142': 'DLL-Initialisierung fehlgeschlagen',
  'c000041d': 'Ausnahme im Rückruf',
  'c0000602': 'Schnellabbruch',
}
export function ausnahmeText(code: string): string {
  const c = (code || '').toLowerCase().replace(/^0x/, '')
  return AUSNAHME[c] ? `${AUSNAHME[c]} (0x${c})` : (c ? `Code 0x${c}` : '')
}

// ── Rohereignis → Treffer ────────────────────────────────────────────────────

const erste = (t: string, n = 160) => { const s = (t || '').replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim(); const p = s.split(/(?<=[.!?])\s/)[0] || s; return p.length > n ? p.slice(0, n - 1) + '…' : p }
const p = (r: MonRohEreignis, i: number) => (r.props[i] || '').trim()

export function trefferAus(r: MonRohEreignis): MonTreffer | null {
  const k = kontrolle(r.k)
  if (!k) return null
  const basis = { key: `${r.log}#${r.rid}`, kontrolle: r.k, zeit: r.zeit, schwere: k.schwere }
  const prov = r.prov.toLowerCase()
  const d = r.daten
  const T = (titel: string, detail: string, merkmale?: Record<string, string>): MonTreffer => ({ ...basis, titel, detail, ...(merkmale ? { merkmale } : {}) })

  if (prov.includes('wlan-autoconfig')) {
    if (r.id === 8003) {
      const grund = d.Reason || r.msg
      const kat = grundKategorie(grund)
      if (kat === 'neueVerbindung') return null            // Benutzer wollte ein anderes Netz — kein Fehler
      return T('WLAN getrennt', [GRUND_TEXT[kat], d.ProfileName || d.SSID].filter(Boolean).join(' · '), { grund: kat, profil: d.ProfileName || d.SSID || '' })
    }
    if (r.id === 8002) return T('WLAN-Verbindung fehlgeschlagen', [erste(d.FailureReason || d.Reason || r.msg, 140), d.ProfileName || d.SSID].filter(Boolean).join(' · '), { profil: d.ProfileName || '' })
    return T('WLAN-Anmeldung fehlgeschlagen', [erste(d.ReasonText || d.Reason || r.msg, 140), d.ProfileName || d.SSID].filter(Boolean).join(' · '))
  }
  if (prov.includes('networkprofile')) return T('Netzwerk getrennt', d.Name || erste(r.msg, 120))
  if (r.k === 'lan-link') return T('LAN-Link getrennt', `${r.prov}: ${erste(r.msg, 120)}`)
  if (prov === 'tcpip' && r.id === 4199) return T('IP-Adresskonflikt', erste(r.msg, 160))
  if (prov.includes('dns-client')) return T('DNS-Auflösung fehlgeschlagen', d.QueryName || p(r, 0) || erste(r.msg, 120), { name: d.QueryName || p(r, 0) })
  if (prov.includes('wer-systemerrorreporting') || (r.id === 1001 && r.k === 'bluescreen')) {
    const code = bugcheckCode(p(r, 0) || r.msg)
    const b = bugcheckInfo(code)
    return T(`Bluescreen ${b.name}`, `${code || ''} — ${b.hinweis}`.trim(), { code: code || '' })
  }
  if (prov.includes('kernel-power') && r.id === 41) {
    const bc = Number(d.BugcheckCode || 0)
    const taste = d.PowerButtonTimestamp && d.PowerButtonTimestamp !== '0'
    if (bc) { const code = '0x' + bc.toString(16).toUpperCase().padStart(8, '0'); return T('Neustart nach Bluescreen', `${code} ${bugcheckInfo(code).name}`, { code }) }
    return T('PC unerwartet ausgeschaltet', taste ? 'Ein-/Ausschalter wurde gedrückt gehalten (PC hing vermutlich)' : 'Strom weg, Akku leer oder PC hing und wurde hart ausgeschaltet', { art: taste ? 'taste' : 'strom' })
  }
  if (prov === 'eventlog' && r.id === 6008) return T('Unerwartet heruntergefahren', erste(r.msg, 160))
  if (prov === 'user32' && r.id === 1074) {
    const proc = (p(r, 0).split('\\').pop() || p(r, 0)).replace(/\s*\(.*\)$/, '')
    return T(`${p(r, 4) || 'Neustart'} durch ${proc || 'unbekannt'}`, [p(r, 2), p(r, 6)].filter(Boolean).join(' · '), { prozess: proc, benutzer: p(r, 6) })
  }
  if (prov === 'application error' && r.id === 1000) {
    const app = p(r, 0) || 'Programm', modul = p(r, 3), code = p(r, 6)
    return T(`${app} abgestürzt`, [modul ? `Modul ${modul}` : '', ausnahmeText(code)].filter(Boolean).join(' · '), { app: app.toLowerCase(), modul: modul.toLowerCase(), code: code.toLowerCase() })
  }
  if (prov === 'application hang' && r.id === 1002) { const app = p(r, 0) || 'Programm'; return T(`${app} reagiert nicht (beendet)`, '', { app: app.toLowerCase() }) }
  if (prov === '.net runtime') { const m = /(?:Anwendung|Application):\s*(\S+)/i.exec(r.msg); return T(`.NET-Fehler${m ? ' in ' + m[1] : ''}`, erste(r.msg.replace(/^.*?(Beschreibung|Description):\s*/i, ''), 140), { app: (m?.[1] || '').toLowerCase() }) }
  if (prov === 'service control manager') {
    const dienst = p(r, 0) || 'Dienst'
    if (r.id === 7031 || r.id === 7034) return T(`Dienst „${dienst}“ abgestürzt`, erste(r.msg, 140), { dienst })
    return T(`Dienst „${dienst}“ startet nicht`, erste(r.msg, 140), { dienst })
  }
  if (prov === 'disk') return T('Festplattenfehler', erste(r.msg, 160))
  if (prov === 'stornvme' || prov === 'storahci') return T('Speicher-Controller zurückgesetzt', erste(r.msg, 140))
  if (prov === 'ntfs') return T('Dateisystem beschädigt', erste(r.msg, 160))
  if (prov.includes('whea')) return T('Hardware-Fehler (WHEA)', erste(r.msg, 160))
  if (prov === 'display') return T('Grafiktreiber zurückgesetzt', p(r, 0) ? `Treiber ${p(r, 0)}` : erste(r.msg, 120), { treiber: p(r, 0) })
  if (prov.includes('kernel-pnp')) return T('Treiber nicht geladen', p(r, 0) || erste(r.msg, 140))
  if (prov.includes('kernel-processor-power')) return T('Prozessor gedrosselt', erste(r.msg, 140))
  if (prov === 'netlogon') return T(r.id === 3210 ? 'Anmeldung an der Domäne fehlgeschlagen' : 'Domäne nicht erreichbar', erste(r.msg, 160))
  if (prov.includes('grouppolicy')) return T('Gruppenrichtlinie fehlgeschlagen', erste(r.msg, 160))
  if (prov.includes('time-service')) return T('Zeitsynchronisierung fehlgeschlagen', erste(r.msg, 140))
  if (r.log === 'Security' && r.id === 4625) { const u = d.TargetUserName || p(r, 5); return T('Anmeldung fehlgeschlagen', [u, d.IpAddress && d.IpAddress !== '-' ? `von ${d.IpAddress}` : ''].filter(Boolean).join(' '), { benutzer: u || '' }) }
  if (prov.includes('windows defender')) {
    if (r.id === 1116 || r.id === 1117) return T(r.id === 1117 ? 'Schadsoftware entfernt' : 'Schadsoftware gefunden', d['Threat Name'] || erste(r.msg, 140), { bedrohung: d['Threat Name'] || '' })
    return T('Echtzeitschutz abgeschaltet', erste(r.msg, 140))
  }
  if (prov.includes('windowsupdateclient')) return T(r.id === 20 ? 'Update fehlgeschlagen' : 'Update installiert', d.updateTitle || p(r, 0) || erste(r.msg, 140), { update: d.updateTitle || p(r, 0) })
  if (prov.includes('resource-exhaustion')) return T('Speicher knapp', erste(r.msg, 180))
  if (prov.includes('user profiles service')) return T(r.id === 1511 ? 'Temporäres Profil' : 'Profil nicht geladen', erste(r.msg, 160))
  if (prov.includes('kerberos')) return T('Kerberos-Fehler', erste(r.msg, 160))
  return T(k.titel, erste(r.msg, 160))
}

/** Neue Rohereignisse in den Zustand übernehmen. Liefert die neuen Treffer (älteste zuerst). */
export function uebernimmEreignisse(z: MonZustand, ant: MonSammlerAntwort, auftrag: Pick<MonAuftrag, 'von'>, ende: string): MonTreffer[] {
  const gesehen = new Set(z.gesehen)
  const neu: MonTreffer[] = []
  const v = Date.parse(auftrag.von), e = Date.parse(ende)
  for (const r of [...ant.ereignisse].sort((a, b) => a.zeit.localeCompare(b.zeit))) {
    const key = `${r.log}#${r.rid}`
    if (gesehen.has(key)) continue
    gesehen.add(key); z.gesehen.push(key)
    const t = Date.parse(r.zeit)
    if (!isNaN(t) && (t < v - 60_000 || t > e + 60_000)) continue
    const tr = trefferAus(r)
    if (tr) { z.treffer.push(tr); neu.push(tr) }
  }
  if (z.gesehen.length > MAX_GESEHEN) z.gesehen = z.gesehen.slice(-MAX_GESEHEN)
  if (z.treffer.length > MAX_TREFFER) z.treffer = z.treffer.slice(-MAX_TREFFER)
  return neu
}

/** Messwerte (zweimal hintereinander über der Grenze; C: einmal) und Dienste prüfen. */
export function pruefeZustaende(z: MonZustand, ant: MonSammlerAntwort, auftrag: Pick<MonAuftrag, 'kontrollen'>): MonTreffer[] {
  const neu: MonTreffer[] = []
  const jetzt = ant.jetzt
  for (const aw of auftrag.kontrollen) {
    const k = kontrolle(aw.id)
    if (!k) continue
    if (k.art === 'messwert' && k.messwert && typeof k.grenze === 'number') {
      const w = ant.messwerte[k.messwert]
      if (typeof w !== 'number' || !isFinite(w)) continue
      const st = z.messwerte[aw.id] || { wert: w, at: jetzt, ueber: 0, gemeldet: false }
      const schlecht = k.messwert === 'disk-c' ? w <= k.grenze : w >= k.grenze
      st.wert = w; st.at = jetzt
      if (schlecht) st.ueber++; else { st.ueber = 0; st.gemeldet = false }
      const noetig = k.messwert === 'disk-c' ? 1 : 2
      if (schlecht && st.ueber >= noetig && !st.gemeldet) {
        st.gemeldet = true
        const titel = k.messwert === 'cpu' ? `Prozessor dauerhaft bei ${w} %` : k.messwert === 'ram' ? `Arbeitsspeicher zu ${w} % belegt` : `Laufwerk C: nur noch ${w} % frei`
        const tr: MonTreffer = { key: `${aw.id}@${jetzt}`, kontrolle: aw.id, zeit: jetzt, titel, detail: '', schwere: k.schwere, merkmale: { wert: String(w) } }
        z.treffer.push(tr); neu.push(tr)
      }
      z.messwerte[aw.id] = st
    } else if (k.art === 'dienst') {
      const name = (k.dienst || aw.param || '').trim()
      if (!name) continue
      const status = ant.dienste[name]
      if (!status) continue
      const st = z.dienste[name] || { status, at: jetzt, gemeldet: false }
      st.at = jetzt
      if (status === 'fehlt') {
        const h = `Dienst „${name}“ ist auf dem PC nicht vorhanden.`
        z.hinweise = Array.from(new Set([...(z.hinweise || []), h]))
      } else if (status !== 'Running') {
        if (!st.gemeldet) {
          st.gemeldet = true
          const tr: MonTreffer = { key: `${aw.id}:${name}@${jetzt}`, kontrolle: aw.id, zeit: jetzt, titel: `Dienst „${name}“ läuft nicht`, detail: `Status: ${status}`, schwere: k.schwere, merkmale: { dienst: name } }
          z.treffer.push(tr); neu.push(tr)
        }
      } else st.gemeldet = false
      st.status = status
      z.dienste[name] = st
    }
  }
  return neu
}

/** Was ist in einer Lücke (nicht erreichbar) passiert? */
export function lueckeGrund(ereignisse: { zeit: string; id: number; prov: string }[] | undefined): string {
  const l = ereignisse || []
  const hat = (f: (e: { id: number; prov: string }) => boolean) => l.some(f)
  if (hat(e => e.prov.toLowerCase().includes('kernel-power') && e.id === 41) || hat(e => e.id === 6008)) return 'PC ist unerwartet ausgegangen (Absturz/Strom)'
  if (hat(e => e.id === 1074 || e.id === 6006 || e.id === 13)) return 'PC wurde heruntergefahren bzw. neu gestartet'
  if (hat(e => e.id === 42 || e.id === 506 || e.id === 107 || e.id === 507 || (e.id === 1 && e.prov.toLowerCase().includes('power-troubleshooter')))) return 'PC war im Standby/Energiesparmodus'
  return 'PC lief, war aber nicht erreichbar (Netzwerk weg)'
}

// ── Texte ─────────────────────────────────────────────────────────────────────

const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export function zeitText(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${WT[d.getDay()]} ${dd}.${mm}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function dauerText(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  if (h < 48) return m ? `${h} Std. ${m} min` : `${h} Std.`
  const t = Math.floor(h / 24), rh = h % 24
  return rh ? `${t} Tage ${rh} Std.` : `${t} Tage`
}
const kuerze = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function trefferMeldung(auftrag: MonAuftrag, treffer: MonTreffer[], zusatz: string[] = []): { titel: string; text: string } {
  const n = treffer.length
  const titel = n === 1 ? `${auftrag.host}: ${treffer[0].titel}` : n ? `${auftrag.host}: ${n} neue Meldungen` : `${auftrag.host}: Hinweis der Überwachung`
  const zeilen: string[] = [titel, '']
  for (const t of treffer.slice(0, 8)) zeilen.push(`• ${zeitText(t.zeit)} ${t.titel}${t.detail ? ' — ' + kuerze(t.detail, 160) : ''}`)
  if (n > 8) zeilen.push(`• … und ${n - 8} weitere`)
  if (zusatz.length) { if (n) zeilen.push(''); zeilen.push(...zusatz) }
  zeilen.push('', `Überwachung läuft bis ${zeitText(auftrag.bis)}.${auftrag.anlass ? ' Anlass: ' + kuerze(auftrag.anlass, 140) : ''}`)
  zeilen.push('Details: PC-Diagnose → Überwachung')
  return { titel, text: kuerze(zeilen.join('\n'), MAX_CHAT) }
}

/** Häufung zur gleichen Uhrzeit (30-min-Fenster, ≥ 3 Ereignisse, ≥ 60 %). */
export function zeitHaeufung(zeiten: string[]): { uhr: string; anzahl: number; gesamt: number } | null {
  const mins = zeiten.map(z => { const d = new Date(z); return d.getHours() * 60 + d.getMinutes() }).filter(m => isFinite(m)).sort((a, b) => a - b)
  if (mins.length < 3) return null
  let best = { start: 0, n: 0 }
  for (const m of mins) { const n = mins.filter(x => x >= m && x < m + 30).length; if (n > best.n) best = { start: m, n } }
  if (best.n < 3 || best.n / mins.length < 0.6) return null
  const im = mins.filter(x => x >= best.start && x < best.start + 30)
  const med = im[Math.floor(im.length / 2)]
  return { uhr: `${String(Math.floor(med / 60)).padStart(2, '0')}:${String(med % 60).padStart(2, '0')}`, anzahl: best.n, gesamt: mins.length }
}

function zaehle<T>(liste: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const x of liste) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1) }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export interface NetDiagnoseKurz { titel: string; punkte: string[]; schritte: string[] }

/** Abschluss-Analyse nach Ende der Laufzeit. */
export function abschlussAnalyse(auftrag: MonAuftrag, z: MonZustand, opt: { ende: string; vollstaendig: boolean; jetzt?: string; netDiagnose?: NetDiagnoseKurz | null; netLaufPfad?: string }): MonAbschluss {
  const v = Date.parse(auftrag.von), e = Date.parse(opt.ende)
  const imZeitraum = z.treffer.filter(t => { const x = Date.parse(t.zeit); return isNaN(x) || (x >= v - 60_000 && x <= e + 60_000) })
  const ausfaelle = z.erreichbar.ausfaelle.filter(a => !/heruntergefahren|Standby/i.test(a.grund || '') && Date.parse(a.von) <= e)
  const probleme = imZeitraum.filter(t => t.schwere !== 'info')
  const info = imZeitraum.filter(t => t.schwere === 'info')
  const anzahlProbleme = probleme.length + ausfaelle.length
  const zeitraum = `${zeitText(auftrag.von)} bis ${zeitText(opt.ende)}`
  const geprueft = auftrag.kontrollen.map(auswahlText).join(', ')
  const ursachen: string[] = []

  // je Kontrolle zusammenfassen
  const proKontrolle = new Map<string, MonTreffer[]>()
  for (const t of probleme) { const l = proKontrolle.get(t.kontrolle) || []; l.push(t); proKontrolle.set(t.kontrolle, l) }
  const zusammenfassung: string[] = []
  for (const [kid, l] of [...proKontrolle.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const k = kontrolle(kid)
    const tage = new Set(l.map(t => t.zeit.slice(0, 10))).size
    const h = zeitHaeufung(l.map(t => t.zeit))
    zusammenfassung.push(`• ${k?.titel || kid}: ${l.length}× an ${tage} Tag${tage === 1 ? '' : 'en'}${h ? `, meist gegen ${h.uhr} Uhr` : ''} (zuletzt ${zeitText(l[l.length - 1].zeit)})`)
    if (h && h.anzahl >= 3) ursachen.push(`${k?.titel || kid} jeden Tag gegen ${h.uhr} Uhr — das ist kein Zufall, sondern ein zeitgesteuerter Auslöser (geplante Aufgabe, Richtlinie, Softwareverteilung, Aufwachen aus dem Standby).`)
  }
  if (ausfaelle.length) {
    const dauer = ausfaelle.reduce((s, a) => s + Math.max(0, (Date.parse(a.bis || opt.ende) - Date.parse(a.von))), 0)
    zusammenfassung.push(`• Nicht erreichbar: ${ausfaelle.length}× (zusammen ${dauerText(dauer)}) — ${zaehle(ausfaelle, a => a.grund || 'unbekannt').map(([g, n]) => `${n}× ${g}`).join(', ')}`)
  }

  // Ursachen-Hinweise je Art
  const abst = probleme.filter(t => t.merkmale?.app && /abgestürzt/.test(t.titel))
  if (abst.length) {
    const top = zaehle(abst, t => `${t.merkmale!.app}|${t.merkmale!.modul || ''}`)[0]
    const [app, modul] = top[0].split('|')
    const h = modulHinweis(modul)
    ursachen.push(`${top[1]}× ${app} abgestürzt${modul ? ` im Modul ${modul}` : ''}${h ? ' → ' + h : ''}.`)
  }
  const haenger = probleme.filter(t => /reagiert nicht/.test(t.titel))
  if (haenger.length) { const top = zaehle(haenger, t => t.merkmale?.app || '')[0]; if (top) ursachen.push(`${top[1]}× ${top[0]} hing — häufig Netzlaufwerk/Server langsam, Add-in, zu wenig Arbeitsspeicher oder Grafiktreiber.`) }
  const bs = probleme.filter(t => t.merkmale?.code && /Bluescreen/.test(t.titel))
  if (bs.length) { const top = zaehle(bs, t => t.merkmale!.code)[0]; const b = bugcheckInfo(top[0]); ursachen.push(`${top[1]}× Bluescreen ${b.name} (${top[0]}) → ${b.hinweis}.`) }
  const aus = probleme.filter(t => t.titel === 'PC unerwartet ausgeschaltet')
  if (aus.length) ursachen.push(`${aus.length}× hart ausgeschaltet ohne Bluescreen → ${aus.some(t => t.merkmale?.art === 'taste') ? 'PC hing und wurde per Taste ausgeschaltet (Treiber/Überhitzung prüfen)' : 'Stromversorgung, Netzteil/Dock oder Akku prüfen'}.`)
  const dienste = probleme.filter(t => t.merkmale?.dienst)
  if (dienste.length) { const top = zaehle(dienste, t => t.merkmale!.dienst)[0]; ursachen.push(`Dienst „${top[0]}“ ${top[1]}× betroffen → zugehörige Software reparieren/aktualisieren${/spool|druck/i.test(top[0]) ? ' (meist ein fehlerhafter Druckertreiber)' : ''}.`) }
  if (probleme.some(t => t.kontrolle === 'disk-fehler' || t.kontrolle === 'ntfs-fehler')) ursachen.push('Datenträgerfehler → SSD-Zustand prüfen, Daten sichern, Tausch über Leasing einplanen.')
  if (probleme.some(t => t.kontrolle === 'speicher-reset')) ursachen.push('Speicher-Controller wurde zurückgesetzt → SSD-Firmware/Treiber (HP-Treiberpaket) und SSD-Zustand prüfen.')
  if (probleme.some(t => t.kontrolle === 'whea')) ursachen.push('Hardwarefehler (WHEA) → Hardwaretest, Temperatur, BIOS aktualisieren; bei Wiederholung Gerätetausch.')
  if (probleme.some(t => t.kontrolle === 'grafik-reset')) ursachen.push('Grafiktreiber wurde zurückgesetzt → Grafiktreiber aktualisieren, Dock/Monitorkabel prüfen.')
  const wlan = probleme.filter(t => t.kontrolle === 'wlan-trennung')
  if (opt.netDiagnose) { ursachen.unshift(opt.netDiagnose.titel); for (const pz of opt.netDiagnose.punkte.slice(0, 4)) ursachen.push(pz) }
  else if (wlan.length) { const top = zaehle(wlan, t => t.merkmale?.grund || '')[0]; if (top) ursachen.push(`WLAN-Trennungen meist „${GRUND_TEXT[top[0] as keyof typeof GRUND_TEXT] || top[0]}“.`) }
  if (probleme.some(t => t.kontrolle === 'dc-nicht-erreichbar')) ursachen.push('Domänencontroller zeitweise nicht erreichbar → Netzwerk/VPN/Zscaler zur Zeit der Meldung prüfen.')

  // Texte
  const kopf: string[] = []
  if (auftrag.anlass) kopf.push(anzahlProbleme ? 'Trotz der Behebung ist der Fehler wieder aufgetreten.' : 'Seit der Behebung ist der Fehler nicht wieder aufgetreten.')
  const titel = anzahlProbleme
    ? `${auftrag.host}: Überwachung beendet — ${anzahlProbleme} Problem${anzahlProbleme === 1 ? '' : 'e'} gefunden`
    : `${auftrag.host}: Überwachung beendet — keine Probleme gefunden`
  const vollText = opt.vollstaendig ? '' : `Achtung: Die Ereignisprotokolle konnten nur bis ${zeitText(z.gelesenBis || auftrag.von)} gelesen werden (PC danach nicht erreichbar) — für den Rest gilt das Ergebnis nicht.`
  const z1: string[] = [titel, `Zeitraum: ${zeitraum}`, ...kopf]
  if (anzahlProbleme) {
    z1.push('', 'Gefunden:', ...zusammenfassung)
    if (ursachen.length) z1.push('', 'Wahrscheinliche Ursache:', ...ursachen.slice(0, 6).map(u => '• ' + u))
    if (opt.netDiagnose?.schritte.length) z1.push('', 'Nächste Schritte:', ...opt.netDiagnose.schritte.slice(0, 3).map((s, i) => `${i + 1}. ${s}`))
  } else {
    z1.push('', `Geprüft: ${geprueft}.`, `${z.erfolgreich} Prüfungen${z.erreichbar.ok + z.erreichbar.fehl ? `, ${Math.round(100 * z.erreichbar.ok / Math.max(1, z.erreichbar.ok + z.erreichbar.fehl))} % davon erreichbar` : ''}.`)
  }
  if (info.length) z1.push('', `Zur Einordnung: ${zaehle(info, t => t.titel).slice(0, 4).map(([t, n]) => `${n}× ${t}`).join(', ')}.`)
  if (vollText) z1.push('', vollText)
  z1.push('', 'Details: PC-Diagnose → Überwachung')
  const text = kuerze(z1.join('\n'), MAX_CHAT)

  const lang = [...z1.slice(0, -1)]
  if (imZeitraum.length) {
    lang.push('', 'Alle Ereignisse:')
    for (const t of imZeitraum.slice(-120)) lang.push(`${zeitText(t.zeit)}  ${t.titel}${t.detail ? ' — ' + t.detail : ''}`)
  }
  if (z.erreichbar.ausfaelle.length) { lang.push('', 'Nicht erreichbar:'); for (const a of z.erreichbar.ausfaelle) lang.push(`${zeitText(a.von)} bis ${a.bis ? zeitText(a.bis) : 'Ende'} — ${a.grund || 'unbekannt'}`) }
  if (z.hinweise?.length) lang.push('', 'Hinweise:', ...z.hinweise)

  return { at: opt.jetzt || new Date().toISOString(), ende: opt.ende, vollstaendig: opt.vollstaendig, titel, text, langtext: lang.join('\n'), ursachen, ...(opt.netLaufPfad ? { netLaufPfad: opt.netLaufPfad } : {}) }
}

export function leererZustand(id: string): MonZustand {
  return { version: 1, id, aktualisiertAm: new Date().toISOString(), aktualisiertVon: '', pruefungen: 0, erfolgreich: 0, gesehen: [], treffer: [], meldungen: [], erreichbar: { ok: 0, fehl: 0, fehlFolge: 0, ausfaelle: [] }, messwerte: {}, dienste: {} }
}

/** Zustand aus dem Netz bereinigen (fremde Datei — Typen prüfen). */
export function normalisiereZustand(id: string, j: unknown): MonZustand {
  const z = leererZustand(id)
  if (!j || typeof j !== 'object') return z
  const o = j as Partial<MonZustand>
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : [])
  return {
    ...z, ...o, id,
    gesehen: arr<string>(o.gesehen).filter(x => typeof x === 'string'),
    treffer: arr<MonTreffer>(o.treffer).filter(t => t && typeof t.zeit === 'string' && typeof t.titel === 'string'),
    meldungen: arr(o.meldungen),
    erreichbar: { ...z.erreichbar, ...(o.erreichbar || {}), ausfaelle: arr((o.erreichbar as MonZustand['erreichbar'] | undefined)?.ausfaelle) },
    messwerte: o.messwerte && typeof o.messwerte === 'object' ? o.messwerte : {},
    dienste: o.dienste && typeof o.dienste === 'object' ? o.dienste : {},
  }
}
