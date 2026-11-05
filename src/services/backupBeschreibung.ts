// ── Klartext-Beschreibung eines Back-Ups ──────────────────────────────────────
// Für die Infobox auf jeder Karte: WAS wird kopiert, WANN und WIE OFT, WIE (ergänzend
// oder spiegelnd) und WO es läuft. Rein rechnend — die Texte entstehen nur aus dem Job,
// damit sie immer zum gespeicherten Stand passen (keine zweite Quelle, die veralten kann).

import { CATCHUP_CAP_DAYS as CATCHUP_TAGE, type BackupJob, type BackupSchedule } from './backups'
import { zielOrdner, destTargetOf, localToUnc, nativeTaskName, pcBasisLokal } from './backupEngine'
import { quellPfad, zielPfad, ROOT_PROD, type ChironKonfig } from './chironBackup'

export interface InfoZeile { titel: string; text: string; warn?: boolean }
export interface InfoOrdner { quelle: string; ziel: string; name?: string; aus?: boolean }
export interface BackupBeschreibung {
  zeilen: InfoZeile[]                    // immer sichtbar: Was / Wann / Wie / Wo
  ordnerTitel: string
  ordner: InfoOrdner[]                   // Details: Quelle → Ziel
  hinweise: { text: string; warn?: boolean }[]
  meta?: string                          // angelegt von … / Zeitplan gilt seit …
}

const TAG_NAME = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const WOCHE = [1, 2, 3, 4, 5, 6, 0]     // Anzeige-Reihenfolge Mo … So

function liste(teile: string[]): string {
  if (teile.length <= 1) return teile[0] ?? ''
  return `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}`
}
function blatt(p: string): string {
  const t = (p ?? '').replace(/[\\/]+$/, '').split(/[\\/]/)
  return t[t.length - 1] || p
}
function datum(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}
const uhr = (t: string) => `${t || '?'} Uhr`

/** „jeden Tag um 20:00 Uhr – 1× täglich" usw. (ohne Pausen-/Vergangenheitslogik). */
export function zeitplanText(s: BackupSchedule, jetzt = new Date()): { text: string; vorbei?: boolean } {
  if (s.type === 'once') {
    const [y, mo, d] = (s.date || '').split('-').map(n => parseInt(n, 10))
    const [h, mi] = (s.time || '0:0').split(':').map(n => parseInt(n, 10))
    const termin = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0)
    const tag = isNaN(termin.getTime()) || !s.date ? '?' : termin.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
    const vorbei = !isNaN(termin.getTime()) && termin.getTime() < jetzt.getTime()
    return vorbei
      ? { text: `Einmalig am ${tag} um ${uhr(s.time)} — der Termin ist vorbei, es läuft nicht wieder von selbst.`, vorbei }
      : { text: `Einmalig am ${tag} um ${uhr(s.time)}, danach nicht wieder.` }
  }
  if (s.repeat === 'weekly') {
    const tage = WOCHE.filter(d => (s.days && s.days.length ? s.days : [1]).includes(d))
    if (tage.length === 7) return { text: `Jeden Tag um ${uhr(s.time)} — 7× pro Woche.` }
    if (tage.length === 5 && tage.every(d => d >= 1 && d <= 5)) return { text: `Montags bis freitags um ${uhr(s.time)} — 5× pro Woche.` }
    return { text: `Jeden ${liste(tage.map(d => TAG_NAME[d]))} um ${uhr(s.time)} — ${tage.length}× pro Woche.` }
  }
  return { text: `Jeden Tag um ${uhr(s.time)} — 1× täglich.` }
}

/** Beschreibung eines normalen Back-Ups (PC-Aufgabe oder Tool-Job). */
export function beschreibeJob(job: BackupJob, jetzt = new Date()): BackupBeschreibung {
  const quelle = job.source.target || '?'
  const zielPc = destTargetOf(job) || '?'
  const paare = zielOrdner(job)
  const namen = paare.map(p => `„${blatt(p.quelle)}"`)
  const was = paare.length === 0 ? 'keine Ordner'
    : paare.length === 1 ? `den Ordner ${namen[0]}`
    : paare.length <= 3 ? `${paare.length} Ordner (${liste(namen)})`
    : `${paare.length} Ordner (${namen.slice(0, 3).join(', ')} und ${paare.length - 3} weitere)`
  const wohin = job.dest.kind === 'network' ? `nach ${zielPc} in ${job.dest.path}` : `auf demselben PC nach ${job.dest.path}`

  const geplant = job.scheduled && !!job.schedule
  const pausiert = job.status === 'paused'
  const plan = geplant ? zeitplanText(job.schedule!, jetzt) : null
  const wann: InfoZeile = !geplant
    ? { titel: 'Wann', text: 'Kein Zeitplan — läuft nur, wenn jemand auf „Jetzt ausführen" klickt.' }
    : pausiert
      ? { titel: 'Wann', text: `Pausiert — läuft erst nach „Fortsetzen" wieder von selbst. Geplant ist: ${plan!.text}`, warn: true }
      : { titel: 'Wann', text: plan!.text, warn: plan!.vorbei }

  const wie: InfoZeile = job.mirror
    ? { titel: 'Wie', text: 'Spiegeln: Das Ziel wird genau an die Quelle angeglichen — was auf dem PC gelöscht wurde, wird beim nächsten Lauf auch in der Sicherung gelöscht.', warn: true }
    : { titel: 'Wie', text: 'Kopiert neue und geänderte Dateien, unveränderte werden übersprungen. Im Ziel wird nichts gelöscht.' }

  const pcAufgabe = job.mechanism === 'native' && geplant
  const wo: InfoZeile = pcAufgabe
    ? { titel: 'Wo', text: `Als geplante Windows-Aufgabe direkt auf ${quelle} — läuft auch, wenn das IT-Tool nirgends geöffnet ist.` }
    : geplant
      ? { titel: 'Wo', text: 'Über das IT-Tool: Ein Admin-PC mit geöffnetem Tool startet den Lauf zur geplanten Zeit und kopiert übers Netzwerk.' }
      : { titel: 'Wo', text: 'Der Admin-PC, auf dem geklickt wird, kopiert übers Netzwerk.' }

  const hinweise: BackupBeschreibung['hinweise'] = []
  hinweise.push({ text: 'Die Quelle wird nur gelesen und nie verändert.' })
  hinweise.push(job.mirror
    ? { text: 'Es gibt keine älteren Stände: Gelöschte oder überschriebene Dateien sind nach dem nächsten Lauf auch in der Sicherung weg.', warn: true }
    : { text: 'Auf dem PC gelöschte Dateien bleiben in der Sicherung erhalten. Geänderte Dateien werden überschrieben — ältere Versionen werden nicht aufbewahrt.' })
  hinweise.push({ text: 'Versteckte Dateien und Ordner-Verknüpfungen (Junctions) werden ausgelassen.' })
  hinweise.push({ text: 'Ist eine Datei gerade geöffnet oder gesperrt, wird sie 2× im Abstand von 5 Sekunden erneut versucht, danach übersprungen und im Bericht mit Grund genannt.' })
  if (pcAufgabe) {
    hinweise.push({ text: `War ${quelle} zur geplanten Zeit aus, startet Windows die Aufgabe, sobald der PC wieder läuft.` })
    hinweise.push({ text: 'Das Ergebnis holt das IT-Tool stündlich vom PC ab. „Jetzt ausführen" startet die Aufgabe sofort auf dem PC.' })
    hinweise.push({ text: `Aufgabe „${nativeTaskName(job)}" (als SYSTEM), Skript und Protokolle unter ${pcBasisLokal(job)}.` })
  } else if (geplant) {
    hinweise.push({ text: 'Ein Admin-PC mit geöffnetem IT-Tool prüft alle 5 Minuten, ob ein Termin fällig ist.' })
    hinweise.push({ text: `Ist zur geplanten Zeit kein IT-Tool offen, wird beim nächsten Öffnen nachgeholt (bis ${CATCHUP_TAGE} Tage zurück; mehrere verpasste Termine ergeben einen Lauf).` })
    hinweise.push({ text: 'Ist der Quell- oder Ziel-PC aus, wartet das Backup und versucht es alle 5 Minuten erneut — das zählt nicht als Fehler.' })
  }
  if (!pcAufgabe && paare[0]) {
    const q = localToUnc(quelle, paare[0].quelle).replace(/(\\\\[^\\]+\\[A-Z]\$).*/i, '$1')
    const z = localToUnc(zielPc, paare[0].ziel).replace(/(\\\\[^\\]+\\[A-Z]\$).*/i, '$1')
    if (q && z) hinweise.push({ text: `Kopiert wird über die Admin-Freigaben (${q} → ${z}).` })
  }

  const meta = [
    job.createdBy || job.createdAt ? `Angelegt${job.createdBy ? ` von ${job.createdBy}` : ''}${datum(job.createdAt) ? ` am ${datum(job.createdAt)}` : ''}` : '',
    geplant && job.planSeit && datum(job.planSeit) ? `Zeitplan gilt seit ${datum(job.planSeit)}` : '',
    job.updatedAt && datum(job.updatedAt) ? `zuletzt geändert ${datum(job.updatedAt)}` : '',
  ].filter(Boolean).join(' · ')

  return {
    zeilen: [{ titel: 'Was', text: `Kopiert ${was} von ${quelle} ${wohin}.` }, wann, wie, wo],
    ordnerTitel: paare.length === 1 ? 'Ordner' : `${paare.length} Ordner`,
    ordner: paare.map(p => ({ quelle: p.quelle, ziel: job.dest.kind === 'network' ? `${zielPc}: ${p.ziel}` : p.ziel })),
    hinweise,
    meta: meta || undefined,
  }
}

/** Nächster Chiron-Termin (Slots „HH:MM", täglich) strikt nach `nach`. */
export function naechsterChironSlot(slots: string[], nach = new Date()): Date | null {
  let best: Date | null = null
  for (const s of slots) {
    const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim())
    if (!m) continue
    const d = new Date(nach.getFullYear(), nach.getMonth(), nach.getDate(), +m[1], +m[2], 0, 0)
    if (d.getTime() <= nach.getTime()) d.setDate(d.getDate() + 1)
    if (!best || d.getTime() < best.getTime()) best = d
  }
  return best
}

/** Beschreibung der Kachel „Chiron Backup" (Sync als Aufgabe auf dem Server). */
export function beschreibeChiron(k: ChironKonfig, x: { server: string; pausiert: boolean; targetRoot?: string }): BackupBeschreibung {
  const root = x.targetRoot || k.targetRoot
  const prod = root === ROOT_PROD
  const aktiv = k.anlagen.filter(a => a.aktiv)
  const aus = k.anlagen.filter(a => !a.aktiv)
  const ordner = [...new Set(aktiv.map(a => a.quellordner))]
  const zusatz = [...new Set(aktiv.flatMap(a => a.zusatzordner.filter(z => z.aktiv).map(z => blatt(z.quellordner))))]
  const basis = `${k.basePath.replace(/\\+$/, '')}\\${root}`
  const slots = [...k.slots].sort()

  const was = aktiv.length === 0
    ? `Keine Anlage aktiv — es wird nichts kopiert${aus.length ? ` (${liste(aus.map(a => a.name || a.id))} deaktiviert)` : ''}.`
    : `Kopiert ${ordner.length === 1 ? `den Ordner „${ordner[0]}"` : `die Ordner ${liste(ordner.map(o => `„${o}"`))}`}${zusatz.length ? ` (dazu ${liste(zusatz)})` : ''} von ${aktiv.length === 1 ? 'der Anlage' : `${aktiv.length} Anlagen`} ${liste(aktiv.map(a => a.name || a.id))} auf ${x.server} nach ${basis}${prod ? '' : ' — Testmodus'}.${aus.length ? ` ${liste(aus.map(a => a.name || a.id))} ${aus.length === 1 ? 'ist' : 'sind'} deaktiviert.` : ''}`
  const plan = slots.length === 0 ? 'Keine Uhrzeiten eingetragen.'
    : `Jeden Tag um ${liste(slots)} Uhr — ${slots.length}× täglich. Verpasste Termine holt der Server stündlich und nach einem Neustart nach.`

  const hinweise: BackupBeschreibung['hinweise'] = [
    { text: 'Die Anlagen werden nur gelesen, dort wird nichts verändert.' },
    { text: 'Auf dem Server wird nie gelöscht. Was auf der Anlage gelöscht wird, bleibt auf dem Server erhalten.' },
    { text: 'Ist eine Anlage aus oder nicht erreichbar, wird sie übersprungen und eine Stunde später erneut versucht — bis es klappt.' },
    { text: `Sind auf ${x.server} weniger als ${k.minFreeGB} GB frei, wird nicht kopiert und die Kachel meldet es. Vor dem ersten Lauf in ein Ziel prüft der Server zusätzlich, ob der Platz für alles reicht.` },
    { text: `Gesperrte Dateien: ${k.robocopy.retries}× erneut versuchen im Abstand von ${k.robocopy.wait} Sekunden, danach Fehler mit Grund in der Kachel.` },
    { text: `Seit über ${k.warnStunden} Stunden kein Erfolg bei einer Anlage → Warnung in der Kachel.` },
    prod
      ? { text: `PRODUKTIV: schreibt in ${basis}. Zurück geht es mit „Zurück auf TEST".` }
      : { text: `Testmodus: Der echte Ordner ${k.basePath.replace(/\\+$/, '')}\\${ROOT_PROD} wird weder gelesen noch beschrieben. Umschalten mit „Produktiv schalten".`, warn: true },
    { text: `Protokolle bleiben ${k.logTage} Tage auf ${x.server} (C:\\ProgramData\\AMCubeSync\\logs).` },
  ]

  return {
    zeilen: [
      { titel: 'Was', text: was, warn: aktiv.length === 0 },
      x.pausiert
        ? { titel: 'Wann', text: `Pausiert — die Aufgabe auf ${x.server} ist abgeschaltet und läuft erst nach „Fortsetzen" wieder. Geplant ist: ${plan}`, warn: true }
        : { titel: 'Wann', text: plan, warn: slots.length === 0 },
      { titel: 'Wie', text: 'Kopiert neue und geänderte Dateien. Auf dem Server wird nichts gelöscht, und Dateien, die dort neuer sind, werden nicht überschrieben.' },
      { titel: 'Wo', text: `Als geplante Aufgabe \\SKF\\AMCubeSync direkt auf ${x.server} (als SYSTEM) — läuft unabhängig vom IT-Tool. Anmeldung an jeder Anlage mit deren lokalem Konto ${k.benutzer}${aktiv[0]?.hostname ? ` (z. B. ${aktiv[0].hostname}\\${k.benutzer})` : ''}.` },
    ],
    ordnerTitel: `${k.anlagen.length} Anlage${k.anlagen.length === 1 ? '' : 'n'}`,
    ordner: k.anlagen.flatMap(a => [
      { name: a.name || a.id, quelle: a.aktiv ? quellPfad(a) : (a.ip ? quellPfad(a) : 'noch nicht angebunden'), ziel: zielPfad(k, a, root), aus: !a.aktiv },
      ...(a.aktiv ? a.zusatzordner.filter(z => z.aktiv).map(z => ({
        name: `${a.name || a.id} · ${blatt(z.quellordner)}`,
        quelle: `\\\\${a.ip || '?'}\\${a.freigabe}\\${z.quellordner}`,
        ziel: `${zielPfad(k, a, root)}\\${blatt(z.quellordner)}`,
      })) : []),
    ]),
    hinweise,
  }
}
