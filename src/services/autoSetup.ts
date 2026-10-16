// ── Automatische Komplett-Einrichtung eines neuen PCs ───────────────────────
// Sobald der neue PC erreichbar ist, spielt das Tool die Kacheln in fester Reihenfolge
// durch. Der stündliche Ping dazu läuft im AutoSetupController.
//
// Regeln, die hier nicht verhandelbar sind:
//  • Ein fehlgeschlagener Schritt bricht NICHTS ab — es geht immer weiter zum nächsten.
//  • Es läuft immer nur EIN Schritt; der nächste startet erst, wenn der vorige fertig
//    oder gescheitert ist (sequenziell, kein Parallelbetrieb auf demselben PC).
//  • Nichts wird doppelt gemacht: Jeder Schritt prüft über den gespeicherten Zustand,
//    ob er schon erledigt ist, und meldet sich sonst als „übersprungen".
//  • Der Zwischenstand wird live in einen modulweiten Store geschrieben, damit das
//    Migrations-Cockpit ihn anzeigen kann, ohne dass der Lauf am Fenster hängt.
//
// Nach einem vollständigen Durchlauf (automatisch ODER manuell) wird die Automatik für
// dieses Gerät abgeschaltet — der stündliche Ping hört auf. [[auto_setup_feature]]

import type { Checklist } from './checklists'
import { type ChecklistDeviceInfo, hostFromSerial } from './deviceMasterData'
import { classifyModel } from './endpointDevices'
import { loadDeviceSetupState, updateDeviceSetupItem, type DeviceSetupItem } from './deviceSetup'
import { sendDesktopMessage } from './desktopMessage'
import { basicScriptForCategory, runBasicSetup } from './basicSetup'
import { applyPrintersLive, deployQuickAccessScript, readOldPrinters, readOldPrintersLive } from './refreshMigration'
import { scanOneHost } from './hpDrivers'
import { useHpDeployStore } from '../store/hpDeployStore'
import { mapMissingNetworkDrives, deployDrivesScript } from './migrationOps'
import { refreshNetworkDrivesLive } from './deviceNetworkDrives'
import { applyEuroparFolders, europarDirName } from './europar'
import { applyEuroparEnvVars, deployEuroparEnvScript, europarEnvKomplett } from './europarEnv'
import { installWindowsUpdates } from './migrationOps'

export type AutoStepStatus = 'offen' | 'laeuft' | 'ok' | 'uebersprungen' | 'fehler'

export interface AutoStepResult {
  id: string
  label: string
  status: AutoStepStatus
  text?: string
}
export interface AutoSetupResult {
  ok: boolean
  steps: AutoStepResult[]
  finishedAt: string
}

/** Meldung beim Start — der Anwender soll den PC währenddessen anlassen. */
const START_MELDUNG = 'Bitte den PC nicht ausschalten, der PC wird jetzt automatisch eingerichtet.'
/** Schlussmeldung; bei Mini-PCs kommt der COSCOM-Hinweis dazu. */
const ENDE_MELDUNG = 'PC ist fertig eingerichtet. Bitte pruefen, ob der Rechner noch Software benoetigt.'
const ENDE_MELDUNG_MINI = ENDE_MELDUNG + ' Zusaetzlich pruefen, ob COSCOM installiert werden muss, und die Installation ausfuehren.'

interface Ctx {
  id: string
  newHost: string
  oldHost: string
  corpId: string
  modelKategorie: string
  isRefresh: boolean
  by: string
  /** true = nur Fehlendes nachziehen (Wiederholung) */
  nurFehlende: boolean
}

interface StepDef {
  id: string
  label: string
  /** Für dieses Gerät überhaupt sinnvoll? (z. B. Drucker nur bei Refresh) */
  gilt: (c: Ctx, st: DeviceSetupItem) => boolean
  /** Schon erledigt? Dann wird übersprungen, statt doppelt zu laufen. */
  erledigt: (st: DeviceSetupItem) => boolean
  run: (c: Ctx, st: DeviceSetupItem) => Promise<{ ok: boolean; text?: string }>
}

// ── Die sieben Schritte, in genau dieser Reihenfolge ─────────────────────────

const SCHRITTE: StepDef[] = [
  {
    id: 'basic',
    label: 'Basic — Grundeinrichtung',
    gilt: c => !!basicScriptForCategory(c.modelKategorie),
    erledigt: st => !!st.basicRunOk,
    async run(c) {
      const sc = basicScriptForCategory(c.modelKategorie)
      if (!sc) return { ok: false, text: 'Keine Variante für diesen Modell-Typ' }
      const r = await runBasicSetup(c.newHost, c.corpId, sc.id)
      await updateDeviceSetupItem(c.id, { basicRunAt: r.finishedAt, basicRunOk: r.ok, basicScriptId: r.scriptId, basicSteps: r.steps })
      const fehler = r.steps.filter(s => s.status === 'fehler').length
      return { ok: r.ok, text: fehler ? `${fehler} von ${r.steps.length} Schritten fehlgeschlagen` : `${r.steps.length} Schritte ausgeführt` }
    },
  },
  {
    id: 'printers',
    label: 'Drucker einrichten (inkl. Standarddrucker)',
    gilt: c => c.isRefresh,
    erledigt: st => !!st.printersApplied,
    async run(c, st) {
      // Drucker möglichst aus dem gespeicherten Stand, sonst frisch vom Altgerät.
      let drucker = st.printers || []
      if (!drucker.length && c.oldHost) {
        drucker = await readOldPrinters(c.oldHost)
        if (!drucker.length) drucker = await readOldPrintersLive(c.oldHost)
      }
      if (!drucker.length) return { ok: false, text: 'Keine Drucker vom Altgerät bekannt' }
      const r = await applyPrintersLive(c.newHost, drucker)
      if (r.ok) await updateDeviceSetupItem(c.id, { printers: drucker, printersApplied: true, printersAppliedAt: new Date().toISOString() })
      const std = drucker.find(d => d.isDefault)
      return { ok: r.ok, text: r.ok ? `${drucker.length} Drucker${std ? `, Standard: ${std.name}` : ''}` : (r.text || 'fehlgeschlagen') }
    },
  },
  {
    id: 'drivers',
    label: 'Treiber-Installation',
    gilt: () => true,
    erledigt: st => !!st.driversRunAt,
    async run(c) {
      const rep = await scanOneHost(c.newHost).catch(() => null)
      if (!rep) return { ok: false, text: 'Treiber-Scan fehlgeschlagen' }
      // BIOS ist grundsätzlich ausgeschlossen (wie in der Kachel).
      const items = rep.items.filter(i => i.klasse !== 'bios' && i.anwendbar && !i.ohneHardwareBezug && (i.status === 'veraltet' || i.status === 'verfuegbar'))
      if (!items.length) {
        await updateDeviceSetupItem(c.id, { driversRunAt: new Date().toISOString(), driversText: 'keine Treiber offen' })
        return { ok: true, text: 'keine Treiber offen' }
      }
      await useHpDeployStore.getState().run([{ host: c.newHost, items }], { rebootMode: 'notify', by: c.by })
      const erg = useHpDeployStore.getState().results[c.newHost.toLowerCase()]
      const ok = !erg || erg.status !== 'fehler'
      await updateDeviceSetupItem(c.id, { driversRunAt: new Date().toISOString(), driversText: erg?.message || `${items.length} Treiber angestoßen` })
      return { ok, text: erg?.message || `${items.length} Treiber installiert` }
    },
  },
  {
    id: 'quickaccess',
    label: 'Explorer-Schnellzugriffe ablegen',
    gilt: c => c.isRefresh,
    erledigt: st => !!st.quickAccessApplied || !!st.quickAccessDeployedAt,
    async run(c, st) {
      if (!st.quickAccessStaged) return { ok: false, text: 'Noch nichts vom Altgerät gesichert' }
      // Bewusst die .cmd-Ablage statt der Live-Übertragung: die braucht einen
      // angemeldeten Benutzer, den es beim automatischen Lauf meist noch nicht gibt.
      const r = await deployQuickAccessScript(c.newHost, c.id)
      if (r.ok) await updateDeviceSetupItem(c.id, { quickAccessDeployedAt: new Date().toISOString() })
      return { ok: r.ok, text: r.text }
    },
  },
  {
    id: 'drives',
    label: 'Netzlaufwerke einrichten',
    gilt: c => c.isRefresh,
    erledigt: st => !!st.networkDrivesApplied && !!st.networkDrivesDeployedAt,
    async run(c, st) {
      let drives = st.networkDrives || []
      if (!drives.length && c.oldHost) {
        const gelesen = await refreshNetworkDrivesLive(c.oldHost, c.by).catch(() => null)
        drives = gelesen?.drives || []
        if (drives.length) await updateDeviceSetupItem(c.id, { networkDrives: drives, networkDrivesAt: new Date().toISOString() })
      }
      if (!drives.length) return { ok: false, text: 'Keine Netzlaufwerke vom Altgerät bekannt' }

      const teile: string[] = []
      // 1) Nur fehlende verbinden — vorhandene bleiben unangetastet.
      const m = await mapMissingNetworkDrives(c.newHost, drives)
      teile.push(m.text || (m.ok ? 'verbunden' : 'Verbinden fehlgeschlagen'))
      // 2) Zusätzlich die .bat ablegen: gemappt wird bei uns benutzerbezogen, der
      //    Anwender muss sie also nach SEINER Anmeldung selbst ausführen können.
      const b = await deployDrivesScript(c.newHost, drives, c.id)
      teile.push(b.ok ? '.bat auf dem Desktop abgelegt' : `.bat: ${b.text || 'fehlgeschlagen'}`)
      await updateDeviceSetupItem(c.id, {
        networkDrivesApplied: m.ok,
        networkDrivesAppliedAt: m.ok ? new Date().toISOString() : undefined,
        networkDrivesApplyText: m.text,
        networkDrivesDeployedAt: b.ok ? new Date().toISOString() : undefined,
      })
      return { ok: m.ok || b.ok, text: teile.join(' · ') }
    },
  },
  {
    id: 'europar',
    label: 'EuroPAR — Ordner + Umgebungsvariablen',
    gilt: (_c, st) => !!(st.europarMarked || st.europarStaged || st.europarApplied),
    erledigt: st => !!st.europarApplied && !!st.europarEnvApplied && !!st.europarEnvDeployedAt,
    async run(c, st) {
      const teile: string[] = []
      let ok = true
      // 1) Ordner (nur wenn im Zwischenspeicher etwas liegt und noch nicht übertragen)
      if (st.europarStaged && !st.europarApplied) {
        const dir = st.europarDir || europarDirName(c.newHost, c.id)
        const r = await applyEuroparFolders(c.newHost, dir)
        if (!r.ok) ok = false
        if (r.ok) {
          await updateDeviceSetupItem(c.id, { europarFolders: r.folders, europarStaged: false, europarApplied: true, europarAppliedAt: new Date().toISOString() })
        }
        teile.push(`Ordner: ${r.text || (r.ok ? 'übertragen' : 'fehlgeschlagen')}`)
      } else {
        teile.push(st.europarApplied ? 'Ordner: bereits übertragen' : 'Ordner: nichts im Zwischenspeicher')
      }
      // 2) Umgebungsvariablen setzen
      if (!st.europarEnvApplied) {
        const e = await applyEuroparEnvVars(c.newHost, c.corpId)
        if (!e.ok) ok = false
        if (e.vars.length) await updateDeviceSetupItem(c.id, { europarEnvVars: e.vars, europarEnvApplied: europarEnvKomplett(e.vars), europarEnvAt: new Date().toISOString() })
        teile.push(`Variablen: ${e.text || (e.ok ? 'gesetzt' : 'fehlgeschlagen')}`)
      } else {
        teile.push('Variablen: bereits gesetzt')
      }
      // 3) Variablen zusätzlich als .cmd für den Anwender (ohne Adminrechte)
      if (!st.europarEnvDeployedAt) {
        const d = await deployEuroparEnvScript(c.newHost)
        if (d.ok) await updateDeviceSetupItem(c.id, { europarEnvDeployedAt: new Date().toISOString() })
        teile.push(d.ok ? 'Variablen-.cmd abgelegt' : `Variablen-.cmd: ${d.text || 'fehlgeschlagen'}`)
      }
      return { ok, text: teile.join(' · ') }
    },
  },
  {
    id: 'winupdate',
    label: 'Windows-Updates',
    gilt: () => true,
    erledigt: st => !!st.winUpdateOk,
    async run(c) {
      const r = await installWindowsUpdates(c.newHost)
      await updateDeviceSetupItem(c.id, {
        winUpdateTriedAt: new Date().toISOString(),
        winUpdateAt: r.ok ? new Date().toISOString() : undefined,
        winUpdateOk: r.ok, winUpdateText: r.text,
      })
      return { ok: r.ok, text: r.text }
    },
  },
]

/** Schrittliste zur Anzeige, bevor etwas läuft. */
export function autoStepList(): AutoStepResult[] {
  return SCHRITTE.map(s => ({ id: s.id, label: s.label, status: 'offen' as const }))
}

// ── Live-Zwischenstand (modulweit, damit das Fenster nichts abbricht) ────────

type Listener = () => void
const fortschritt = new Map<string, AutoStepResult[]>()
const laeuftFuer = new Set<string>()
const listeners = new Set<Listener>()
function key(id: string) { return id }
function melden() { for (const l of listeners) l() }

export function subscribeAutoSetup(l: Listener): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
export function autoSetupProgress(checklistId: string): AutoStepResult[] | undefined {
  return fortschritt.get(key(checklistId))
}
export function autoSetupLaeuft(checklistId: string): boolean {
  return laeuftFuer.has(key(checklistId))
}
/** Kurzer Satz für die Übersicht: „Basic wird eingespielt" o. Ä. */
export function autoSetupKurzstand(checklistId: string): string {
  const st = fortschritt.get(key(checklistId))
  if (!st) return ''
  const aktiv = st.find(s => s.status === 'laeuft')
  if (aktiv) return `${aktiv.label} läuft…`
  const offen = st.filter(s => s.status === 'offen').length
  if (offen === 0) return 'alle Schritte durch'
  const fertig = st.filter(s => s.status !== 'offen').length
  return `${fertig} von ${st.length} Schritten`
}

// ── Lauf ─────────────────────────────────────────────────────────────────────

/** Wurde für dieses Gerät schon einmal komplett durchgelaufen? */
export function autoSetupErledigt(st?: DeviceSetupItem): boolean {
  return !!st?.autoSetupDoneAt
}

/**
 * Spielt alle Schritte der Reihe nach ein. Läuft NIE zweimal gleichzeitig für dasselbe
 * Gerät. `nurFehlende` (Standard) überspringt erledigte Schritte — beim erneuten Lauf
 * wird also nichts doppelt gemacht, sondern nur Fehlendes nachgezogen.
 */
export async function runAutoSetup(
  checklist: Checklist,
  info: ChecklistDeviceInfo | undefined,
  by: string,
  opts?: { nurFehlende?: boolean; ohneMeldungen?: boolean },
): Promise<AutoSetupResult> {
  const id = checklist.id
  const newHost = (info?.newHostname || hostFromSerial((checklist.newDeviceSerial || '').trim()) || '').trim()
  const isRefresh = checklist.deviceType === 'refresh' && !!(checklist.oldDeviceId || '').trim()
  const ctx: Ctx = {
    id, newHost,
    oldHost: isRefresh ? (info?.oldHostname || hostFromSerial((checklist.oldDeviceId || '').trim()) || '').trim() : '',
    corpId: (checklist.corpId || '').trim(),
    modelKategorie: classifyModel(info?.newModel || ''),
    isRefresh, by,
    nurFehlende: opts?.nurFehlende !== false,
  }

  const stand: AutoStepResult[] = SCHRITTE.map(s => ({ id: s.id, label: s.label, status: 'offen' }))
  if (!newHost) {
    return { ok: false, steps: stand, finishedAt: new Date().toISOString() }
  }
  if (laeuftFuer.has(key(id))) {
    return { ok: false, steps: fortschritt.get(key(id)) || stand, finishedAt: new Date().toISOString() }
  }

  laeuftFuer.add(key(id))
  fortschritt.set(key(id), stand)
  melden()

  try {
    if (!opts?.ohneMeldungen) await sendDesktopMessage(newHost, START_MELDUNG, 600)

    for (let i = 0; i < SCHRITTE.length; i++) {
      const def = SCHRITTE[i]
      // Zustand vor JEDEM Schritt frisch lesen — die vorigen Schritte haben ihn geändert.
      const alle = await loadDeviceSetupState().catch(() => ({} as Record<string, DeviceSetupItem>))
      const st = alle[id] || ({} as DeviceSetupItem)

      if (!def.gilt(ctx, st)) {
        stand[i] = { ...stand[i], status: 'uebersprungen', text: 'für dieses Gerät nicht vorgesehen' }
        fortschritt.set(key(id), [...stand]); melden(); continue
      }
      if (ctx.nurFehlende && def.erledigt(st)) {
        stand[i] = { ...stand[i], status: 'uebersprungen', text: 'war bereits erledigt' }
        fortschritt.set(key(id), [...stand]); melden(); continue
      }

      stand[i] = { ...stand[i], status: 'laeuft' }
      fortschritt.set(key(id), [...stand]); melden()

      let out: { ok: boolean; text?: string }
      try { out = await def.run(ctx, st) }
      catch (e) { out = { ok: false, text: e instanceof Error ? e.message : String(e) } }

      // Ein Fehler hält den Ablauf NICHT auf — es geht zum nächsten Schritt.
      stand[i] = { ...stand[i], status: out.ok ? 'ok' : 'fehler', text: out.text }
      fortschritt.set(key(id), [...stand]); melden()
    }

    const fertigAm = new Date().toISOString()
    const ok = stand.every(s => s.status !== 'fehler')
    await updateDeviceSetupItem(id, {
      autoSetupDoneAt: fertigAm,
      autoSetupOk: ok,
      autoSetupSteps: stand,
      // Ein vollständiger Durchlauf schaltet die stündliche Automatik für dieses Gerät ab.
      autoSetupAutomatikAus: true,
    }).catch(() => {})

    if (!opts?.ohneMeldungen) {
      const mini = ctx.modelKategorie === 'Desktop Mini'
      await sendDesktopMessage(newHost, mini ? ENDE_MELDUNG_MINI : ENDE_MELDUNG, 900)
    }
    return { ok, steps: stand, finishedAt: fertigAm }
  } finally {
    laeuftFuer.delete(key(id))
    melden()
  }
}
