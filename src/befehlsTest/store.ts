// ── Befehls-Test: Hintergrund-Ablauf (läuft weiter, auch wenn die Seite gewechselt wird) ──
// Ein Befehl nach dem anderen (WinRM schonend), Stand wird laufend aufs Netzlaufwerk
// geschrieben: befehls-test/laeufe/<id>.json — nach einem Neustart des Tools fortsetzbar.
// Schranken: nie Server (Server-Liste + ProductType ≠ 1), nie der eigene PC.

import { create } from 'zustand'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import type { PaAktion } from '../problemAssistent/motor'
import type { CmdDef, Category } from '../utils/remoteCommands'
import { baueKatalog, platzhalterIn, PLATZHALTER_TEXT, rdSchluessel, setzeEin, TEST_KONTO, type BtPlatzhalter } from './katalog'
import { fernJson, fuehreEintragAus, lokalJson, pcInfo, schlaf, testPasswort, warteAufPc, warteBisWeg, type PcInfo } from './lauf'
import { BT_TAG, PS_AUFRAEUMEN, PS_AUFRAEUMEN_LOKAL, PS_TESTDATEI_LOKAL, PS_VORBEREITUNG, PS_WERTE, psSyntax } from './skripte'
import type { BtEinstellung, BtEintrag, BtErgebnis, BtLauf, BtStand, BtStatus } from './types'

const ORDNER = 'befehls-test'
const STAND = `${ORDNER}/stand.json`
const sicher = (s: string) => (s || 'unbekannt').replace(/[^A-Za-z0-9._-]/g, '_')
const ich = () => useAuthStore.getState().session?.user?.username || 'unbekannt'

export const BT_STANDARD: BtEinstellung = { pc: '', optionen: { remoteDoc: true, herunterfahren: true, drucker: '' }, eigeneWerte: {} }

interface Kontext {
  katalog: BtEintrag[]
  map: Map<string, BtEintrag>
  aktionen: Map<string, PaAktion>
  rd: Map<string, CmdDef>
  baueRd: (def: CmdDef, host: string, p: string | undefined) => string
  baueSkript: (host: string, a: PaAktion, param: string, sam?: string) => string
  innenBenutzer: (a: PaAktion, param: string, rf: string) => string
}

let kontextCache: { schluessel: string; k: Kontext } | null = null
async function ladeKontext(remoteDoc: boolean, eigene: Record<string, string>): Promise<Kontext> {
  const schluessel = (remoteDoc ? 'rd' : '') + JSON.stringify(eigene)
  if (kontextCache?.schluessel === schluessel) return kontextCache.k
  const [{ AKTIONEN }, rc, motor] = await Promise.all([
    import('../problemAssistent/aktionen'),
    import('../utils/remoteCommands'),
    import('../problemAssistent/motor'),
  ])
  const kategorien: Category[] = remoteDoc ? rc.CATEGORIES : []
  const katalog = baueKatalog(AKTIONEN, remoteDoc ? kategorien : null, eigene)
  const rd = new Map<string, CmdDef>(rdSchluessel(kategorien).map(x => [x.key, x.c as CmdDef]))
  // Remote-Doc-Befehle immer per WinRM bauen, ohne die Einstellung von Remote Doc dauerhaft zu ändern
  const baueRd = (def: CmdDef, host: string, p: string | undefined) => {
    const m = rc.getExecMethod(); const l = rc.getLocalMode()
    rc.setExecMethod('winrm'); rc.setLocalMode(false)
    try { return def.buildCmd(host, p) } finally { rc.setExecMethod(m); rc.setLocalMode(l) }
  }
  const k: Kontext = {
    katalog, map: new Map(katalog.map(e => [e.key, e])), aktionen: new Map(AKTIONEN.map(a => [a.id, a])), rd, baueRd,
    baueSkript: motor.baueSkript, innenBenutzer: motor.innenBenutzer,
  }
  kontextCache = { schluessel, k }
  return k
}

interface BtState {
  geladen: boolean
  einstellung: BtEinstellung
  katalog: BtEintrag[]
  katalogLaedt: boolean
  lauf: BtLauf | null
  aktuell: { key: string; seit: number } | null
  status: string
  arbeitet: boolean
  fehler: string
  pc: PcInfo | null
  pcPrueft: boolean
  laden: () => Promise<void>
  setzeEinstellung: (p: Partial<BtEinstellung>) => void
  setzeWert: (key: string, wert: string) => void
  katalogNeu: () => Promise<void>
  pruefePc: (host: string) => Promise<string>
  starte: () => Promise<string>
  pause: () => void
  fortsetzen: () => void
  abbrechen: () => void
  aufraeumen: () => Promise<void>
  wiederhole: (keys: string[]) => void
  verwerfen: () => void
}

let L: BtLauf | null = null          // laufender Lauf (veränderlich, wird per set() gespiegelt)
let stopWunsch: null | 'pause' | 'abbruch' = null
let testkonto = ''                   // „ITAdminTest|<Passwort>“ — nur im Speicher
let letztesSpeichern = 0
let einstellungTimer: ReturnType<typeof setTimeout> | null = null


export const useBefehlsTest = create<BtState>((set, get) => {
  const spiegeln = () => { if (L) set({ lauf: { ...L, ergebnisse: { ...L.ergebnisse } } }) }
  const melde = (status: string) => set({ status })

  async function speichere(sofort = false) {
    if (!L) return
    if (!sofort && Date.now() - letztesSpeichern < 20_000) return
    letztesSpeichern = Date.now()
    try { await api().netWriteJsonAsync(`${ORDNER}/laeufe/${sicher(L.id)}.json`, L) } catch { /* Netzlaufwerk weg — nächster Versuch */ }
  }
  async function speichereEinstellung() {
    const e = get().einstellung
    try { await api().netWriteJsonAsync(`${ORDNER}/einstellungen/${sicher(ich())}.json`, { ...e, letzterLauf: L?.id || get().lauf?.id || undefined }) } catch { /* egal */ }
  }
  async function standAktualisieren() {
    if (!L) return
    try {
      const alt = (await api().netReadJsonAsync<BtStand>(STAND).catch(() => null)) || {}
      const zaehlt: BtStatus[] = ['ok', 'meldung', 'na', 'fehler', 'zeit', 'weg']
      for (const [k, r] of Object.entries(L.ergebnisse)) if (zaehlt.includes(r.status)) alt[k] = { s: r.status, am: r.am, pc: L.pc, t: r.status === 'ok' ? undefined : r.text.slice(0, 160) }
      await api().netWriteJsonAsync(STAND, alt)
    } catch { /* egal */ }
  }
  function setErg(key: string, r: Partial<BtErgebnis> & { status: BtStatus }) {
    if (!L) return
    const alt = L.ergebnisse[key]
    L.ergebnisse[key] = { text: '', dauerMs: 0, am: new Date().toISOString(), ...r, syntax: r.syntax ?? alt?.syntax }
  }

  async function laufWerte(e: BtEintrag, host: string): Promise<{ werte: Partial<Record<BtPlatzhalter, string>> }> {
    const brauche = platzhalterIn(e.wert)
    const werte: Partial<Record<BtPlatzhalter, string>> = {}
    if (!brauche.length) return { werte }
    werte.drucker = L?.optionen.drucker.trim() || undefined
    if (brauche.includes('testkonto')) { if (!testkonto) testkonto = TEST_KONTO + '|' + testPasswort(); werte.testkonto = testkonto }
    if (brauche.includes('testdatei')) { const t = await lokalJson<{ pfad?: string }>(PS_TESTDATEI_LOKAL).catch(() => null); werte.testdatei = t?.pfad || undefined }
    if (brauche.some(b => ['jetzt', 'zeitzone', 'sitzung', 'pidNotepad', 'adapter', 'gruppeBenutzer'].includes(b))) {
      const w = await fernJson<Record<string, string>>(host, PS_WERTE, undefined, 60_000).catch(() => null)
      if (w) for (const k of ['jetzt', 'zeitzone', 'sitzung', 'pidNotepad', 'adapter', 'gruppeBenutzer'] as const) if (w[k]) werte[k] = String(w[k])
    }
    return { werte }
  }

  async function syntaxPruefung(k: Kontext, host: string) {
    if (!L) return
    const muster: Partial<Record<BtPlatzhalter, string>> = {
      drucker: 'PMD000', testdatei: 'C:\\Temp\\x.txt', jetzt: '2026-01-01 00:00:00', zeitzone: 'W. Europe Standard Time', sitzung: '1',
      pidNotepad: '1', adapter: 'Ethernet', gruppeBenutzer: 'Benutzer', testkonto: TEST_KONTO + '|Xx1!xxxxxxxxxx',
    }
    const tmp = ((await lokalJson<{ p?: string }>(`'${BT_TAG}' + (@{ p = [IO.Path]::GetTempPath() } | ConvertTo-Json -Compress)`).catch(() => null))?.p || '').trim()
    if (!tmp) { melde('Syntaxprüfung übersprungen (kein Temp-Ordner)'); return }
    const keys = L.reihenfolge
    for (let i = 0; i < keys.length; i += 80) {
      if (stopWunsch) return
      melde(`Syntaxprüfung … ${Math.min(i + 80, keys.length)} / ${keys.length}`)
      const paket: { k: string; s: string[] }[] = []
      const laenge: Record<string, string> = {}
      for (const key of keys.slice(i, i + 80)) {
        const e = k.map.get(key)
        if (!e) continue
        const ein = setzeEin(e.wert ?? '', muster)
        const p = 'text' in ein ? ein.text : 'x'
        try {
          const skripte: string[] = []
          if (e.quelle === 'baustein') {
            const a = k.aktionen.get(e.id)
            if (!a) continue
            skripte.push(k.baueSkript(host, a, p, 'sam'))
            if (a.modus === 'benutzer') skripte.push(k.innenBenutzer(a, p, 'C:\\Temp\\x.json'))
          } else {
            const d = k.rd.get(key)
            if (!d) continue
            skripte.push(k.baueRd(d, host, p || undefined))
          }
          // Windows-Grenze der Befehlszeile (powershell -Command …): 32 767 Zeichen
          if (skripte[0].length + 200 > 32_767) laenge[key] = `Befehl zu lang für die Befehlszeile (${skripte[0].length} Zeichen, Grenze 32 767)`
          paket.push({ k: key, s: skripte })
        } catch (x) { laenge[key] = 'Befehl ließ sich nicht zusammenbauen: ' + (x instanceof Error ? x.message : String(x)) }
        if (paket.length % 20 === 0) await new Promise(r => setTimeout(r, 0))   // Oberfläche atmen lassen
      }
      const datei = `${tmp.replace(/\\$/, '')}\\ITAdminTool_bt_syntax_${Date.now()}.json`
      const json = JSON.stringify(paket)
      const w = await api().writeFile(datei, btoa(unescape(encodeURIComponent(json))))
      let befund: Record<string, string> | null = null
      if (w.success) befund = await lokalJson<Record<string, string>>(psSyntax(datei), 120_000).catch(() => null)
      for (const { k: key } of paket) {
        const b = laenge[key] || befund?.[key] || ''
        const alt = L.ergebnisse[key]
        L.ergebnisse[key] = { ...(alt || { status: 'offen', text: '', dauerMs: 0, am: '' }), syntax: befund ? b : (laenge[key] || '') }
      }
      for (const [key, b] of Object.entries(laenge)) if (!paket.some(p => p.k === key)) { const alt = L.ergebnisse[key]; L.ergebnisse[key] = { ...(alt || { status: 'offen', text: '', dauerMs: 0, am: '' }), syntax: b } }
      spiegeln()
    }
  }

  async function aufraeumenIntern(): Promise<void> {
    if (!L) return
    melde('Aufräumen: Testobjekte entfernen, Einstellungen zurückstellen …')
    const r = await fernJson<{ ok?: boolean; zeilen?: string[]; fehler?: string }>(L.pc, PS_AUFRAEUMEN, { s: L.sicherung || {} }, 300_000).catch(() => null)
    await lokalJson(PS_AUFRAEUMEN_LOKAL).catch(() => null)
    if (r && r.ok !== false) { L.aufgeraeumt = true; L.aufraeumZeilen = (r.zeilen || []).map(String) }
    else L.aufraeumZeilen = ['Aufräumen fehlgeschlagen: ' + (r?.fehler || 'keine Antwort vom Test-PC') + ' — später „Aufräumen“ erneut drücken.']
    spiegeln()
    await speichere(true)
  }

  /** Wartet, bis der Test-PC wieder antwortet (max. 60 min). false = weiterhin weg. */
  async function warteAufRueckkehr(grund: string): Promise<boolean> {
    if (!L) return false
    L.zustand = 'wartet'; L.hinweis = grund; spiegeln(); await speichere(true)
    const da = await warteAufPc(L.pc, { maxMs: 60 * 60_000, abbrechen: () => !!stopWunsch, melde })
    if (!L) return false
    if (da) { L.zustand = 'laeuft'; L.hinweis = undefined; spiegeln(); return true }
    return false
  }

  async function arbeite() {
    if (get().arbeitet || !L) return
    stopWunsch = null
    set({ arbeitet: true, fehler: '' })
    try {
      const k = await ladeKontext(L.optionen.remoteDoc, L.eigeneWerte || {})
      const host = L.pc
      const verb = await pcInfo(host)
      if (!verb.ok) {
        const ok = await warteAufRueckkehr(`Test-PC antwortet nicht (${verb.fehler || 'keine Antwort'}) — warte bis zu 60 min.`)
        if (!ok) { if (L) { L.zustand = 'pausiert'; L.hinweis = 'Test-PC war 60 min nicht erreichbar — Lauf angehalten.' }; return }
      }
      const sam = (verb.benutzer || '').split('\\').pop() || undefined
      if (!L.vorbereitet) {
        L.zustand = 'vorbereitung'; spiegeln()
        await syntaxPruefung(k, host)
        if (stopWunsch) return
        melde('Vorbereitung auf dem Test-PC: Testobjekte anlegen, Einstellungen sichern …')
        const v = await fernJson<{ ok?: boolean; zeilen?: string[]; sicherung?: unknown; fehler?: string }>(host, PS_VORBEREITUNG, undefined, 180_000).catch(() => null)
        if (!v || v.ok === false) { L.zustand = 'pausiert'; L.hinweis = 'Vorbereitung fehlgeschlagen: ' + (v?.fehler || 'keine Antwort vom Test-PC'); return }
        L.sicherung = v.sicherung
        L.vorbereitet = true
        L.aufgeraeumt = false
        L.aufraeumZeilen = (v.zeilen || []).map(String)
        await speichere(true)
      }
      L.zustand = 'laeuft'; L.hinweis = undefined; spiegeln()
      let wegInFolge = 0

      for (const key of L.reihenfolge) {
        if (stopWunsch || !L) break
        const erg = L.ergebnisse[key]
        if (erg && erg.status !== 'offen' && erg.status !== 'laeuft') continue
        const e = k.map.get(key)
        if (!e) { setErg(key, { status: 'skip', text: 'Nicht mehr im Katalog (Tool-Version geändert)' }); continue }

        // Vor Abmelden/Neustart/Herunterfahren: Testobjekte weg, Einstellungen zurück
        if ((e.phase === 'abmelden' || e.phase === 'neustart' || e.phase === 'aus') && !L.aufgeraeumt) { await aufraeumenIntern(); if (stopWunsch) break }

        if (e.sperre) { setErg(key, { status: 'gesperrt', text: e.sperre }); continue }
        if (e.phase === 'aus' && !L.optionen.herunterfahren) { setErg(key, { status: 'skip', text: 'Abgewählt: „Am Ende herunterfahren“ ist aus.' }); continue }
        if (e.fehlt) { setErg(key, { status: 'skip', text: 'Testwert fehlt: ' + e.fehlt + ' (unter „Testwerte“ eintragen)' }); continue }
        if (erg?.syntax) { setErg(key, { status: 'fehler', text: 'Nicht ausgeführt – ' + erg.syntax }); continue }

        let param: string | undefined = e.wert
        if (param !== undefined && platzhalterIn(param).length) {
          melde(`Werte ermitteln für „${e.titel}“ …`)
          const { werte } = await laufWerte(e, host)
          const ein = setzeEin(param, werte)
          if ('fehlt' in ein) { setErg(key, { status: 'skip', text: 'Testwert fehlt: ' + PLATZHALTER_TEXT[ein.fehlt] }); continue }
          param = ein.text
        }

        let bootVorher: string | undefined
        if (e.nachher === 'neustart' || e.nachher === 'kein-neustart') bootVorher = (await pcInfo(host)).boot

        set({ aktuell: { key, seit: Date.now() }, status: '' })
        setErg(key, { status: 'laeuft', text: '' }); spiegeln()
        let r = await fuehreEintragAus(e, { host, sam, aktion: k.aktionen.get(e.id), befehl: k.rd.get(key), baueRd: k.baueRd }, param)

        // ── Nachher prüfen ──
        if (e.nachher === 'trennt') {
          melde('Verbindung war kurz weg — warte, bis der PC wieder antwortet …')
          const da = await warteAufPc(host, { maxMs: 10 * 60_000, abbrechen: () => stopWunsch === 'abbruch', melde })
          if (!da) r = { ...r, status: 'weg', text: 'PC antwortet nach dem Befehl nicht mehr (10 min gewartet). ' + r.text }
          else if (r.status === 'weg' || r.status === 'zeit') r = { ...r, status: 'ok', text: 'Verbindung kurz getrennt, PC wieder da. ' + r.text }
        } else if (e.nachher === 'neustart') {
          const t0 = Date.now()
          const da = await warteAufPc(host, { maxMs: 60 * 60_000, bootVorher, abbrechen: () => stopWunsch === 'abbruch', melde })
          if (da) r = { ...r, status: 'ok', text: `Neu gestartet — nach ${Math.round((Date.now() - t0) / 1000)} s wieder erreichbar` }
          else {
            const jetzt = await pcInfo(host)
            r = jetzt.ok ? { ...r, status: 'fehler', text: 'Kein Neustart erfolgt (Startzeit unverändert). ' + r.text } : { ...r, status: 'weg', text: 'PC nach dem Neustart 60 min nicht erreichbar' }
          }
        } else if (e.nachher === 'kein-neustart') {
          for (let s = 150; s > 0; s -= 10) { if (stopWunsch === 'abbruch') break; melde(`Prüfe, ob der angekündigte Neustart wirklich abgebrochen ist … ${s} s`); await schlaf(10_000) }
          const jetzt = await pcInfo(host)
          if (jetzt.ok && jetzt.boot === bootVorher) { if (r.status === 'ok') r = { ...r, text: 'Angekündigter Neustart wurde abgebrochen. ' + r.text } }
          else {
            r = { ...r, status: 'fehler', text: 'Angekündigter Neustart wurde NICHT abgebrochen — PC ist neu gestartet.' }
            await warteAufPc(host, { maxMs: 60 * 60_000, abbrechen: () => stopWunsch === 'abbruch', melde })
          }
        } else if (e.nachher === 'aus') {
          const weg = await warteBisWeg(host, 5 * 60_000, melde)
          r = weg ? { ...r, status: 'ok', text: 'PC hat sich ausgeschaltet.' } : { ...r, status: 'fehler', text: 'PC läuft nach 5 min noch. ' + r.text }
        }
        setErg(key, r)
        set({ aktuell: null, status: '' })
        spiegeln()
        void speichere()

        // Unerwartet weg? → warten statt den Rest als Fehler durchzuschieben
        wegInFolge = (r.status === 'weg' || r.status === 'zeit') ? wegInFolge + 1 : 0
        if (e.phase !== 'aus' && (r.status === 'weg' || wegInFolge >= 3)) {
          const ok = (await pcInfo(host)).ok || await warteAufRueckkehr(`Test-PC antwortet nicht mehr (nach „${e.titel}“) — warte bis zu 60 min.`)
          if (!ok) { if (L) { L.zustand = 'pausiert'; L.hinweis = `Test-PC antwortet seit „${e.titel}“ nicht mehr — Lauf angehalten. Nach dem Einschalten „Fortsetzen“.` }; return }
          wegInFolge = 0
        }
      }

      if (!L) return
      if (stopWunsch === 'abbruch') {
        if (L.vorbereitet && !L.aufgeraeumt) await aufraeumenIntern()
        L.zustand = 'abgebrochen'; L.ende = new Date().toISOString(); L.hinweis = undefined
      } else if (stopWunsch === 'pause') {
        L.zustand = 'pausiert'; L.hinweis = 'Angehalten — Testobjekte bleiben bis zum Fortsetzen oder „Aufräumen“ auf dem Test-PC.'
      } else {
        const herunter = L.ergebnisse[L.reihenfolge.find(x => k.map.get(x)?.phase === 'aus') || '']?.status === 'ok'
        if (!L.aufgeraeumt && !herunter) await aufraeumenIntern()
        L.zustand = 'fertig'; L.ende = new Date().toISOString(); L.hinweis = undefined
      }
    } catch (x) {
      if (L) { L.zustand = 'pausiert'; L.hinweis = 'Unerwarteter Fehler: ' + (x instanceof Error ? x.message : String(x)) }
    } finally {
      for (const [key, r] of Object.entries(L?.ergebnisse || {})) if (r.status === 'laeuft') L!.ergebnisse[key] = { ...r, status: 'offen' }
      spiegeln()
      await speichere(true)
      await standAktualisieren()
      stopWunsch = null
      set({ arbeitet: false, aktuell: null, status: '' })
    }
  }

  return {
    geladen: false,
    einstellung: BT_STANDARD,
    katalog: [],
    katalogLaedt: false,
    lauf: null,
    aktuell: null,
    status: '',
    arbeitet: false,
    fehler: '',
    pc: null,
    pcPrueft: false,

    laden: async () => {
      if (get().geladen) return
      set({ geladen: true })
      let e: (BtEinstellung & { letzterLauf?: string }) | null = null
      try { e = await api().netReadJsonAsync<BtEinstellung & { letzterLauf?: string }>(`${ORDNER}/einstellungen/${sicher(ich())}.json`) } catch { e = null }
      if (e) set({ einstellung: { pc: e.pc || '', optionen: { ...BT_STANDARD.optionen, ...(e.optionen || {}) }, eigeneWerte: e.eigeneWerte || {} } })
      if (e?.letzterLauf && !L) {
        try {
          const l = await api().netReadJsonAsync<BtLauf>(`${ORDNER}/laeufe/${sicher(e.letzterLauf)}.json`)
          if (l && l.id && l.reihenfolge) {
            if (l.zustand === 'laeuft' || l.zustand === 'wartet' || l.zustand === 'vorbereitung') { l.zustand = 'pausiert'; l.hinweis = 'Unterbrochen — das Tool wurde während des Laufs geschlossen. „Fortsetzen“ macht beim nächsten offenen Befehl weiter.' }
            for (const [k, r] of Object.entries(l.ergebnisse || {})) if (r.status === 'laeuft') l.ergebnisse[k] = { ...r, status: 'offen' }
            L = l
            spiegeln()
          }
        } catch { /* kein Lauf */ }
      }
      void get().katalogNeu()
    },

    setzeEinstellung: (p) => {
      set(s => ({ einstellung: { ...s.einstellung, ...p, optionen: { ...s.einstellung.optionen, ...(p.optionen || {}) } } }))
      if (p.optionen?.remoteDoc !== undefined || p.eigeneWerte) void get().katalogNeu()
      if (einstellungTimer) clearTimeout(einstellungTimer)
      einstellungTimer = setTimeout(() => { void speichereEinstellung() }, 800)
    },

    setzeWert: (key, wert) => {
      const ew = { ...get().einstellung.eigeneWerte }
      if (wert.trim()) ew[key] = wert; else delete ew[key]
      get().setzeEinstellung({ eigeneWerte: ew })
    },

    katalogNeu: async () => {
      set({ katalogLaedt: true })
      try {
        const e = get().einstellung
        const k = await ladeKontext(e.optionen.remoteDoc, e.eigeneWerte)
        set({ katalog: k.katalog })
      } finally { set({ katalogLaedt: false }) }
    },

    pruefePc: async (host) => {
      const h = host.trim()
      set({ pcPrueft: true, pc: null })
      try {
        const { zielSperre } = await import('../services/itAdminToolInstall')
        const sperre = await zielSperre(h)
        if (sperre) { set({ pc: { ok: false, fehler: sperre } }); return sperre }
        const { verbinde } = await import('../services/enaioInstall')
        const f = await verbinde(h)
        if (f) { set({ pc: { ok: false, fehler: f } }); return f }
        const i = await pcInfo(h)
        if (i.ok && i.produktTyp !== 1) { const t = `${h} ist kein Arbeitsplatz-PC (${i.system || 'Server'}) — der Befehls-Test läuft nur auf Arbeitsplatz-PCs.`; set({ pc: { ...i, ok: false, fehler: t } }); return t }
        set({ pc: i })
        return i.ok ? '' : (i.fehler || 'keine Antwort')
      } finally { set({ pcPrueft: false }) }
    },

    starte: async () => {
      if (get().arbeitet) return 'Es läuft bereits ein Testlauf.'
      const e = get().einstellung
      const host = e.pc.trim()
      const f = await get().pruefePc(host)
      if (f) return f
      const k = await ladeKontext(e.optionen.remoteDoc, e.eigeneWerte)
      const id = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15) + '_' + host.toUpperCase()
      testkonto = ''
      L = {
        id, pc: host.toUpperCase(), von: ich(), start: new Date().toISOString(), optionen: { ...e.optionen }, zustand: 'vorbereitung',
        reihenfolge: k.katalog.map(x => x.key), ergebnisse: {}, eigeneWerte: { ...e.eigeneWerte },
      }
      for (const x of k.katalog) L.ergebnisse[x.key] = { status: 'offen', text: '', dauerMs: 0, am: '' }
      spiegeln()
      void import('../services/aktivitaet').then(m => m.protokolliere({ art: 'manuell', quelle: 'Befehls-Test (Einstellungen)', aktion: `Befehls-Test gestartet: ${k.katalog.length} Befehle werden echt ausgeführt`, ziel: host.toUpperCase(), details: [`Remote Doc: ${e.optionen.remoteDoc ? 'ja' : 'nein'}`] }))
      await speichere(true)
      await speichereEinstellung()
      void arbeite()
      return ''
    },

    pause: () => { if (get().arbeitet) { stopWunsch = 'pause'; melde('Hält nach dem aktuellen Befehl an …') } },
    abbrechen: () => {
      if (get().arbeitet) { stopWunsch = 'abbruch'; melde('Bricht nach dem aktuellen Befehl ab und räumt auf …'); return }
      if (L && L.zustand !== 'fertig' && L.zustand !== 'abgebrochen') {
        void (async () => {
          if (L!.vorbereitet && !L!.aufgeraeumt) { set({ arbeitet: true }); try { await aufraeumenIntern() } finally { set({ arbeitet: false, status: '' }) } }
          L!.zustand = 'abgebrochen'; L!.ende = new Date().toISOString(); L!.hinweis = undefined; spiegeln(); await speichere(true); await standAktualisieren()
        })()
      }
    },
    fortsetzen: () => { if (L && !get().arbeitet) void arbeite() },
    aufraeumen: async () => {
      if (!L || get().arbeitet) return
      set({ arbeitet: true })
      try { await aufraeumenIntern() } finally { set({ arbeitet: false, status: '' }) }
    },
    wiederhole: (keys) => {
      if (!L || get().arbeitet) return
      // Testobjekte schon entfernt? → Vorbereitung erneut (sichert dabei den jetzigen Stand)
      if (L.aufgeraeumt) { L.vorbereitet = false; L.aufgeraeumt = false }
      for (const k of keys) { const r = L.ergebnisse[k]; L.ergebnisse[k] = { status: 'offen', text: '', dauerMs: 0, am: '', syntax: r?.syntax } }
      L.zustand = 'pausiert'; L.ende = undefined
      spiegeln()
      void arbeite()
    },
    verwerfen: () => { if (get().arbeitet) return; L = null; set({ lauf: null }); void speichereEinstellung() },
  }
})
