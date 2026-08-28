// ── Onboarding-HTML-Generator ─────────────────────────────────────────────────
// Baut die SELBSTENTHALTENDE, personalisierte Onboarding-HTML fuer den Public
// Desktop des neuen Mitarbeiters. Design nach DESIGN-SPEC.md (Apple-nahe
// Pastell-Kacheln, SKF-Blau #1d2bd8, Glass-Topbar, 3×2-Raster). Kein Framework,
// alles inline (CSS/JS/Bilder als Data-URIs) — die Datei wird per file:// in
// Edge/Chrome geoeffnet und darf von nichts abhaengen ausser dem Browser.
//
// Personalisierung: Begruessung nutzt Vorname + Startdatum; ab Startdatum + 10
// Tage zeigt die Seite automatisch eine allgemeine Begruessung.

import type { OnboardingSettings, OnboardingMarkers, PlanId, FolderLink, SelfHelpTile, SelfHelpCategory } from './onboarding'
import { MULTI_FLOOR_PLANS, PLAN_LABELS, floorFromRoomNumber, filmAssetName, isFilmVideo } from './onboarding'
import { FOLDER_PROTOCOL } from './onboardingDeploy'

export interface OnboardingEmployeeData {
  vorname: string
  nachname: string
  startDate: string     // YYYY-MM-DD
  roomNumber: string
  department?: string   // Abteilung des Mitarbeiters (für abteilungsspezifische Ansprechpartner)
}

export interface OnboardingContactData {
  name: string
  role: string
  email: string
  phone: string
}

/** Begruessungsvariante: 'new' = Willkommen an Bord (bis Start+10 Tage),
 *  'existing' = immer allgemeine Begruessung (fuer bestehende Mitarbeiter). */
export type GreetingMode = 'new' | 'existing'

export interface OnboardingHtmlInput {
  employee: OnboardingEmployeeData
  contact: OnboardingContactData          // Ansprechpartner (Default: Manager) — Fallback, wenn `contacts` fehlt
  /** Fertig zusammengestellte, sortierte Ansprechpartner-Liste (Vorgesetzter →
   *  weitere Ansprechpartner → IT). Wenn gesetzt, ersetzt sie die interne
   *  Zusammenstellung (der Verteilen-Dialog stellt sie interaktiv zusammen). */
  contacts?: OnboardingContactData[]
  settings: OnboardingSettings
  markers: OnboardingMarkers
  logoDataUri: string
  planImages: Record<string, string>      // "planId:page" -> JPEG-Data-URI (Fallback/Sofortbild)
  roomPhotos: Record<string, string>      // roomId -> Data-URI ('' wenn keins)
  mode: GreetingMode
  /** pdf.js-Quelltexte (Base64) fuer das Live-Rendering in der HTML — scharf
   *  bei jedem Zoom, wie im Karten-Editor. Null = nur statische Bilder. */
  pdfJs?: { lib: string; worker: string } | null
  /** Rohe Plan-PDFs (Base64), planId -> Base64. Fuer das Live-Rendering. */
  planPdfs?: Record<string, string>
  /** Automatisch in der Plan-Textebene gefundene Position der Raumnummer
   *  (findRoomOnPlans) — wird als "Dein Büro"-Pin eingebettet, falls kein
   *  manuell gepflegter Raum-Pin matcht. */
  autoRoomPin?: { planId: PlanId; page: number; x: number; y: number } | null
}

/** Welche Plan-Seiten muessen fuer diese Marker-Konfiguration gerendert werden? */
export function collectNeededPages(
  markers: OnboardingMarkers,
  extra?: { planId: PlanId; page: number }[],
): { planId: PlanId; page: number }[] {
  const set = new Map<string, { planId: PlanId; page: number }>()
  const add = (planId: PlanId, page: number) => set.set(`${planId}:${page}`, { planId, page })
  // Erste Seite jedes Plans immer einbetten (die Gebaeude-PDFs sind einseitig)
  add('komplett', 1)
  add('halle', 1)
  add('verwaltung', 1)
  add('kopfbauwerk', 1)
  for (const r of markers.regions) add(r.planId, r.page)
  for (const [planId, floors] of Object.entries(markers.floors)) {
    for (const f of floors ?? []) add(planId as PlanId, f.page)
  }
  for (const p of markers.pins) add(p.planId, p.page)
  for (const e of extra ?? []) add(e.planId, e.page)
  return [...set.values()]
}

// ── Helfer ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** UNC-Pfad → file://-URL (\\server\share\a b → file://server/share/a%20b). */
function uncToFileUrl(unc: string): string {
  const clean = (unc || '').replace(/^[\\/]+/, '').replace(/\\/g, '/')
  if (!clean) return ''
  return 'file://' + clean.split('/').map(seg => encodeURIComponent(seg)).join('/')
}

/**
 * Ordner-Verknuepfung: Protokoll-Link (oeffnet den Explorer via skf-ordner:<i>)
 * plus file://-Fallback (Browser-Ordnerliste, falls der Handler nicht
 * registriert ist — z. B. beim Lokal-Export). `globalIndex` MUSS mit der
 * Position in settings.folderLinks (= Reihenfolge in der VBS) uebereinstimmen.
 */
function folderRow(f: FolderLink, globalIndex: number): string {
  const fallback = uncToFileUrl(f.path)
  return `<div class="lrow lrow--folder">
    <span class="lrow-ic lrow-ic--folder">${icon('folder')}</span>
    <span class="lrow-txt"><strong>${esc(f.label || 'Ordner')}</strong><small>${esc(f.path)}</small></span>
    <a class="mini" href="${FOLDER_PROTOCOL}:${globalIndex}" title="Im Windows-Explorer öffnen">Im Explorer öffnen</a>
    ${fallback ? `<a class="mini mini--ghost" href="${esc(fallback)}" title="Ordnerinhalt im Browser anzeigen">im Browser</a>` : ''}
  </div>`
}

/** Outlook-Web-Deeplink: neuer Termin mit Raum als Teilnehmer + Ort. */
function outlookComposeUrl(roomName: string, mailbox: string): string {
  const base = 'https://outlook.office.com/calendar/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent'
  const loc = '&location=' + encodeURIComponent(roomName)
  const to = mailbox ? '&to=' + encodeURIComponent(mailbox) : ''
  return base + loc + to
}

// Inline-SVG-Icons (Stroke 1.75, 24px-Raster) — geometrisch, Farbe via currentColor
const ICONS: Record<string, string> = {
  it: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  rooms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 4v5"/><path d="M7 13h4v4H7z"/></svg>',
  general: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
  time: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  contact: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5h5v5M19 5l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
}

function icon(name: keyof typeof ICONS): string { return ICONS[name] || '' }

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

export function buildOnboardingHtml(input: OnboardingHtmlInput): string {
  const { employee, contact, settings, markers, logoDataUri, planImages, roomPhotos, mode, autoRoomPin, pdfJs, planPdfs } = input
  const links = settings.links
  const isNew = mode === 'new'

  // Raum-Pin des Mitarbeiters: manuell gepflegter Pin hat Vorrang, sonst die
  // automatisch in der Plan-Textebene gefundene Position ("Dein Büro").
  const roomNorm = employee.roomNumber.trim().toLowerCase()
  let pins = markers.pins
  let employeePin = roomNorm
    ? markers.pins.find(p => p.kind === 'room' && (p.roomNumber || '').trim().toLowerCase() === roomNorm) ?? null
    : null
  if (!employeePin && roomNorm && autoRoomPin) {
    const auto = {
      id: '__auto_room', kind: 'room' as const,
      planId: autoRoomPin.planId, page: autoRoomPin.page,
      x: autoRoomPin.x, y: autoRoomPin.y,
      label: `Raum ${employee.roomNumber.trim()}`, roomNumber: employee.roomNumber.trim(),
    }
    pins = [...pins, auto]
    employeePin = auto
  }

  // Payload fuer das eingebettete JS (JSON, </-sicher escaped)
  const payload = {
    mode,
    employee: {
      vorname: employee.vorname,
      startDate: employee.startDate,
      roomNumber: employee.roomNumber,
      floor: floorFromRoomNumber(employee.roomNumber),
    },
    map: {
      images: planImages,
      regions: markers.regions,
      floors: markers.floors,
      pins,
      routes: markers.routes,
      planLabels: PLAN_LABELS,
      multiFloor: MULTI_FLOOR_PLANS,
      employeePinId: employeePin?.id ?? null,
    },
  }
  const dataJson = JSON.stringify(payload).replace(/</g, '\\u003c')

  // pdf.js + rohe Plan-PDFs separat einbetten (grosse Base64-Blobs). Base64
  // enthaelt kein '<', daher </script>-sicher ohne teures Escaping.
  const pdfPayload = pdfJs && planPdfs && Object.keys(planPdfs).length > 0
    ? { lib: pdfJs.lib, worker: pdfJs.worker, plans: planPdfs }
    : null
  const pdfJson = JSON.stringify(pdfPayload)

  // Ordner-Links (Index = Position in settings.folderLinks; Reihenfolge muss
  // exakt zur Handler-VBS passen). Aufgeteilt nach Kachel (IT / Allgemeines).
  const folderLinks = settings.folderLinks ?? []
  const generalFolderRows = folderLinks.map((f, i) => ({ f, i })).filter(x => x.f.section === 'general').map(x => folderRow(x.f, x.i))

  // ── IT-Selbsthilfe (1a-Design): Aktions-Kacheln ─────────────────────────────
  // Skript-Aktionen laufen über den Protokoll-Handler skf-fix:<id> (siehe
  // resources/selfservice). Link-Kacheln öffnen Web-/Protokoll-Ziele. Kacheln
  // ohne Ziel werden ausgeblendet.
  const ssAction = (id: string, title: string, o?: { status?: string; info?: string }) =>
    `<a class="sstile" href="skf-fix:${id}"${o?.info ? ` title="${esc(o.info)}"` : ''}>${o?.info ? '<span class="sstile-i" aria-hidden="true">i</span>' : ''}<span class="sstile-t">${esc(title)}</span><span class="sstile-s">${o?.status ?? ''}</span></a>`
  const ssLink = (url: string, title: string) => url
    ? `<a class="sstile" href="${esc(url)}" target="_blank" rel="noopener"><span class="sstile-t">${esc(title)}</span><span class="sstile-s"></span></a>` : ''
  const ssCat = (cls: string, title: string, sub: string, tiles: string[]) => {
    const inner = tiles.filter(Boolean).join('\n')
    return inner ? `<div class="sscat ${cls}"><div class="sscat-h"><h3>${title}</h3><small>${sub}</small></div><div class="ssgrid">${inner}</div></div>` : ''
  }

  const folderTiles = (settings.folderLinks ?? [])
    .map((f, i) => ({ f, i }))
    .filter(x => x.f.section === 'it')
    .map(x => `<a class="sstile" href="${FOLDER_PROTOCOL}:${x.i}"><span class="sstile-t">${esc(x.f.label || 'Ordner')}</span><span class="sstile-s"></span></a>`)

  // Kacheln datengetrieben aus den Einstellungen (Typ/Kategorie/Reihenfolge/Pfad).
  const ssTile = (t: SelfHelpTile): string => {
    if (t.type === 'link') return ssLink(t.path, t.label)
    if (t.type === 'kontakt') {
      // IT-Kontakt-Kachel: Telefon + E-Mail aus den Einstellungen; Klick = mailto.
      const email = (settings.itContact?.email || '').trim()
      const phone = (settings.itContact?.phone || '').trim()
      const lines = [phone ? `Tel.: ${esc(phone)}` : '', email ? esc(email) : ''].filter(Boolean).join('<br>')
      const inner = `<span class="sstile-t">${esc(t.label)}</span><span class="sstile-s">${lines || 'Kontakt folgt'}</span>`
      return email
        ? `<a class="sstile" href="mailto:${esc(email)}">${inner}</a>`
        : `<div class="sstile sstile--static">${inner}</div>`
    }
    // skript ODER programm → klickbare Kachel skf-fix:<id> (die VBS entscheidet dann,
    // ob eine .ps1 via PowerShell oder ein Programm via ShellExecute startet).
    return ssAction(t.id, t.label, { info: t.info })
  }

  const SS_CATS: { key: SelfHelpCategory; cls: string; title: string; sub: string }[] = [
    { key: 'bestellung', cls: 'sscat--prt', title: 'Bestellen &amp; Melden', sub: 'öffnet im Browser' },
    { key: 'konto',      cls: 'sscat--acc', title: 'Konto &amp; Sicherheit', sub: 'Passwörter &amp; Konto' },
    { key: 'geraete',    cls: 'sscat--fix', title: 'Geräte &amp; Reparieren', sub: 'läuft auf deinem PC' },
    { key: 'ordner',     cls: 'sscat--drv', title: 'Ordner &amp; Laufwerke', sub: 'wird verbunden' },
  ]
  const sortedTiles = (settings.selfHelpTiles ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const selfServiceHtml = SS_CATS.map(cat => {
    let catTiles = sortedTiles.filter(t => t.category === cat.key).map(ssTile)
    // In "Ordner & Laufwerke" die Ordner-Verknüpfungen (Explorer, z. B. "Laufwerk I
    // verbinden") VOR die Link-/Skript-Kacheln (z. B. "Abteilungsordner Zugriff
    // beantragen") stellen.
    if (cat.key === 'ordner') catTiles = [...folderTiles, ...catTiles]
    return ssCat(cat.cls, cat.title, cat.sub, catTiles)
  }).filter(Boolean).join('\n')

  // ── Konferenzraum-Karten ────────────────────────────────────────────────────
  const roomCards = settings.rooms.map(r => {
    const photo = roomPhotos[r.id] || ''
    const media = photo
      ? `<div class="room-img" style="background-image:url('${photo}')"></div>`
      : `<div class="room-img room-img--ph"><span>${esc(r.name.slice(0, 2).toUpperCase())}</span></div>`
    const inner = `${media}<div class="room-body"><strong>${esc(r.name)}</strong><small>${r.capacity} Plätze · ${esc(r.location)}</small>${r.mailbox ? '<span class="room-cta">Im Outlook buchen →</span>' : '<span class="room-cta room-cta--mut">Buchung: siehe Anleitung unten</span>'}</div>`
    return r.mailbox
      ? `<a class="room" href="${esc(outlookComposeUrl(r.name, r.mailbox))}" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="room">${inner}</div>`
  }).join('\n')

  // ── Allgemeines ─────────────────────────────────────────────────────────────
  const generalRows: string[] = []
  if (links.sharepoint) {
    generalRows.push(`<a class="lrow" href="${esc(links.sharepoint)}" target="_blank" rel="noopener">
      <span class="lrow-txt"><strong>SKF Marine Intranet</strong><small>SharePoint – News, Dokumente, Abteilungen</small></span>
      <span class="lrow-ic">${icon('link')}</span></a>`)
  }
  if (links.canteenMenu) {
    generalRows.push(`<a class="lrow" href="${esc(links.canteenMenu)}" target="_blank" rel="noopener">
      <span class="lrow-txt"><strong>Kantinenplan</strong><small>Essenswochenplan – was gibt es diese Woche?</small></span>
      <span class="lrow-ic">${icon('link')}</span></a>`)
  }
  // Mail-Shortcuts (Klick öffnet Outlook mit vorbelegtem Empfänger)
  for (const m of (settings.generalMails ?? [])) {
    if (!m.email) continue
    generalRows.push(`<a class="lrow" href="mailto:${esc(m.email)}">
      <span class="lrow-txt"><strong>${esc(m.label || 'Kontakt')}</strong><small>${esc(m.email)}</small></span>
      <span class="lrow-ic">${icon('contact')}</span></a>`)
  }
  // Film-Karte für die Allgemeines-Kachel. Der Film liegt als separate Datei
  // NEBEN der HTML — nur Verweis, nichts inline (Dashboard bleibt klein). Karte
  // nur, wenn ein Film-Pfad konfiguriert ist.
  //
  // Zwei Wege je nach Endung von settings.filmPath (siehe filmAssetName):
  //  • MP4/WebM/OGG → nativer <video>-Player (empfohlen): sofort sauberes
  //    Abspielen, echter Zeitstrahl, Vollbild. preload="metadata" zeigt das
  //    erste Bild als Poster, KEIN Autoplay. Zusätzlich: Klick aufs Video =
  //    Pause/Weiter (wie YouTube, per JS unten). Native controls liefern
  //    Zeitstrahl/Lautstärke/Vollbild.
  //  • sonst (HTML) → Legacy-TTS-Film im <iframe> (Fallback, spielt unsauber).
  const hasFilm = !!(settings.filmPath || '').trim()
  const filmAsset = filmAssetName(settings.filmPath)
  const filmIsVid = isFilmVideo(settings.filmPath)
  const filmInner = filmIsVid
    ? `<video class="film-vid" src="${filmAsset}" controls preload="auto" playsinline title="SKF Marine Film"></video>`
    : `<iframe src="${filmAsset}" allowfullscreen title="SKF Marine Film"></iframe>`
  const filmCard = hasFilm ? `<div class="card">
      <h3>Lerne uns besser kennen</h3>
      <div class="film${filmIsVid ? ' film--vid' : ''}">${filmInner}</div>
    </div>` : ''

  // Ansprechpartner NICHT mehr unter "Allgemeines" — sie stehen jetzt in der
  // eigenen Kachel "Ihr(e) Ansprechpartner" (siehe unten).

  // ── Ansprechpartner (eigene Kachel) ─────────────────────────────────────────
  // Zusammengesetzt aus: (1) dem beim Verteilen gewählten Kontakt (Default
  // Manager) und (2) den in den Einstellungen gepflegten Ansprechpartnern —
  // abteilungsgefiltert: ohne Abteilung = für alle; mit Abteilung nur, wenn sie
  // der Abteilung des Mitarbeiters entspricht.
  interface ContactCard { name: string; role: string; email: string; phone: string }
  const empDept = (employee.department || '').trim().toLowerCase()
  let contactList: ContactCard[] = []
  if (Array.isArray(input.contacts) && input.contacts.length > 0) {
    // Vom Verteilen-Dialog fertig zusammengestellt & sortiert — direkt übernehmen.
    contactList = input.contacts
      .map(c => ({ name: (c.name || '').trim(), role: (c.role || '').trim(), email: (c.email || '').trim(), phone: (c.phone || '').trim() }))
      .filter(c => c.name || c.email || c.phone)
  } else {
    // Fallback: (1) Vorgesetzter, (2) abteilungsgefilterte Ansprechpartner aus den
    // Einstellungen, (3) IT IMMER ganz am Ende.
    const primary: ContactCard = { name: contact.name.trim(), role: contact.role.trim(), email: contact.email.trim(), phone: contact.phone.trim() }
    if (primary.name || primary.email || primary.phone) contactList.push(primary)
    for (const c of settings.generalInfo.contacts) {
      if (!c.name && !c.email && !c.phone && !c.role) continue
      const d = (c.department || '').trim().toLowerCase()
      if (d && d !== empDept) continue          // abteilungsspezifisch, passt nicht → überspringen
      const key = `${(c.name || '').toLowerCase()}|${(c.email || '').toLowerCase()}`
      if (contactList.some(x => `${x.name.toLowerCase()}|${x.email.toLowerCase()}` === key)) continue
      contactList.push({ name: c.name, role: c.role, email: c.email, phone: c.phone })
    }
    const it = settings.itContact
    if (it.name || it.email || it.phone) {
      const itKey = `${(it.name || '').toLowerCase()}|${(it.email || '').toLowerCase()}`
      if (!contactList.some(x => `${x.name.toLowerCase()}|${x.email.toLowerCase()}` === itKey)) {
        contactList.push({ name: it.name || 'Deine IT', role: 'IT-Support', email: it.email, phone: it.phone })
      }
    }
  }
  const contactTitle = contactList.length > 1 ? 'Deine Ansprechpartner' : 'Dein Ansprechpartner'
  const contactCards = contactList.map(c => `
      <div class="card">
        <h3>${esc(c.name || 'Ansprechpartner')}</h3>
        ${c.role ? `<p>${esc(c.role)}</p>` : ''}
        ${c.email ? `<a class="lrow" href="mailto:${esc(c.email)}"><span class="lrow-txt"><strong>E-Mail schreiben</strong><small>${esc(c.email)}</small></span><span class="lrow-ic">${icon('link')}</span></a>` : ''}
        ${c.phone ? `<div class="lrow lrow--static"><span class="lrow-txt"><strong>Telefon</strong><small>${esc(c.phone)}</small></span></div>` : ''}
        ${!c.email && !c.phone ? '<p class="mut">Kontaktdaten folgen.</p>' : ''}
      </div>`).join('\n')

  // ── Schnellzugriff-Pills (nur mit Ziel) ─────────────────────────────────────
  const pills: string[] = []
  if (links.createTicket) pills.push(`<a class="pill" href="${esc(links.createTicket)}" target="_blank" rel="noopener">IT-Störung melden</a>`)
  pills.push('<a class="pill" href="#rooms">Raum buchen</a>')
  pills.push('<a class="pill" href="#map">Lageplan</a>')
  if (links.passwordReset) pills.push(`<a class="pill" href="${esc(links.passwordReset)}" target="_blank" rel="noopener">Passwort zurücksetzen</a>`)
  if (links.sharepoint) pills.push(`<a class="pill" href="${esc(links.sharepoint)}" target="_blank" rel="noopener">Intranet</a>`)
  if (links.canteenMenu) pills.push(`<a class="pill" href="${esc(links.canteenMenu)}" target="_blank" rel="noopener">Kantinenplan</a>`)

  const fullName = `${employee.vorname} ${employee.nachname}`.trim()

  // ── Dokument ────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Willkommen bei SKF Marine</title>
<style>
:root{
  --skf-blue:#1d2bd8; --ink:#1b1d23; --muted:#6a6f7d; --muted-2:#8a8f9c;
  --page-bg:#eceef2;
  --glass:rgba(255,255,255,.78);
  --hairline:rgba(27,29,35,.08);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{
  font-family:'Manrope','Segoe UI',-apple-system,system-ui,sans-serif;
  background:var(--page-bg); color:var(--ink);
  -webkit-font-smoothing:antialiased; min-height:100vh;
}
.screen{
  max-width:1440px; margin:24px auto; border-radius:28px; overflow:hidden;
  background:linear-gradient(180deg,#f6f4f1 0%,#eef1f6 46%,#e9edf5 100%);
  box-shadow:0 40px 90px rgba(20,24,40,.16),0 2px 8px rgba(20,24,40,.06);
}
.topbar{
  display:flex;align-items:center;gap:14px; height:74px; padding:0 48px;
  background:var(--glass); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  border-bottom:1px solid var(--hairline); position:sticky; top:0; z-index:20;
}
.topbar img{height:30px;display:block}
.topbar .sep{width:1px;height:26px;background:var(--hairline)}
.topbar .tb-title{font-weight:700;font-size:15px;letter-spacing:-.01em}
.topbar .spacer{flex:1}
.userpill{
  display:inline-flex;align-items:center;gap:8px; padding:7px 14px; border-radius:999px;
  background:rgba(255,255,255,.9); border:1px solid var(--hairline); font-size:13px; font-weight:600;
}
.userpill .dot{width:8px;height:8px;border-radius:50%;background:#37b26c}
.backbtn{
  display:none; align-items:center; gap:6px; border:1px solid var(--hairline);
  background:rgba(255,255,255,.9); border-radius:999px; padding:7px 14px;
  font:inherit; font-size:13px; font-weight:700; color:var(--skf-blue); cursor:pointer;
}
body.subview .backbtn{display:inline-flex}
.hero{text-align:center; padding:76px 48px 44px}
.badge{
  display:inline-block; padding:7px 16px; border-radius:999px; font-size:12px; font-weight:700;
  letter-spacing:.12em; text-transform:uppercase; color:var(--skf-blue);
  background:rgba(29,43,216,.08); border:1px solid rgba(29,43,216,.14); margin-bottom:22px;
}
h1{font-size:68px; line-height:1.04; font-weight:800; letter-spacing:-.035em; text-wrap:balance}
.sub{max-width:620px; margin:18px auto 0; font-size:18px; line-height:1.5; color:var(--muted); text-wrap:pretty}
.wrap{padding:0 48px 40px}
.grid{display:grid; grid-template-columns:repeat(3,1fr); gap:20px}
.tile{
  min-height:252px; padding:30px; border-radius:26px; display:flex; flex-direction:column;
  justify-content:space-between; text-decoration:none; color:inherit;
  box-shadow:0 1px 2px rgba(20,24,40,.06);
  transition:transform 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms cubic-bezier(.22,1,.36,1);
}
.tile:hover{transform:translateY(-4px); box-shadow:0 18px 40px rgba(20,24,40,.14)}
.tile:focus-visible{outline:2px solid var(--skf-blue); outline-offset:3px}
.tile .ic{
  width:52px;height:52px;border-radius:15px;background:rgba(255,255,255,.8);
  display:flex;align-items:center;justify-content:center;
}
.tile .ic svg{width:24px;height:24px}
.tile h2{font-size:30px;font-weight:800;letter-spacing:-.028em;margin-top:18px}
.tile p{font-size:15px;line-height:1.5;margin-top:8px;min-height:3em}
.tile .cta{font-size:14px;font-weight:700;margin-top:16px}
.tile--it{background:linear-gradient(155deg,#dbe4ff,#cdd8fb)} .tile--it .ic,.tile--it .cta{color:#1d2bd8} .tile--it p{color:#3c4470}
.tile--rooms{background:linear-gradient(155deg,#e3f0e6,#d5e8dd)} .tile--rooms .ic,.tile--rooms .cta{color:#2f6b4f} .tile--rooms p{color:#3f5c4e}
.tile--general{background:linear-gradient(155deg,#f6ece0,#f0e2d2)} .tile--general .ic,.tile--general .cta{color:#8a5a2b} .tile--general p{color:#6e5638}
.tile--orient{background:linear-gradient(155deg,#eee4f6,#e4d8f2)} .tile--orient .ic,.tile--orient .cta{color:#6a4a9c} .tile--orient p{color:#5a4c73}
.tile--time{background:linear-gradient(155deg,#dceef3,#cde4ee)} .tile--time .ic,.tile--time .cta{color:#2b6478} .tile--time p{color:#40606e}
.tile--contact{background:var(--glass); backdrop-filter:blur(20px); border:1px solid var(--hairline)} .tile--contact .ic,.tile--contact .cta{color:#1d2bd8} .tile--contact p{color:var(--muted)}
.quick{margin-top:34px}
.quick .qlabel{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-2);margin-bottom:12px}
.quick .pills{display:flex;flex-wrap:wrap;gap:10px}
.pill{
  padding:9px 18px;border-radius:999px;background:rgba(255,255,255,.9);
  border:1px solid var(--hairline);font-size:14px;font-weight:600;color:var(--ink);
  text-decoration:none;transition:transform 220ms cubic-bezier(.22,1,.36,1);
}
.pill:hover{transform:translateY(-2px)}
.pill:focus-visible{outline:2px solid var(--skf-blue);outline-offset:3px}
/* ── IT-Selbsthilfe (1a-Design: Pastell-Kategorien, ein Klick = Aktion) ── */
.ssbanner{display:flex;flex-direction:column;gap:10px;margin-bottom:6px}
.ssbanner:empty{display:none}
.ssnote{display:flex;gap:10px;align-items:flex-start;padding:13px 16px;border-radius:14px;border:1px solid;font-size:14px;line-height:1.45}
.ssnote--info{background:#eef3ff;border-color:#d5deff;color:#28407a}
.ssnote--warn{background:#fff6e6;border-color:#f3e0b8;color:#7a5a12}
.ssnote--crit{background:#fdecec;border-color:#f6c9c9;color:#8a2020}
.ssnote b{font-weight:800}
.sscat{margin-top:26px}
.sscat-h{display:flex;align-items:baseline;gap:12px;margin-bottom:14px}
.sscat-h h3{font-size:19px;font-weight:800;letter-spacing:-.01em}
.sscat-h small{font-size:14px;color:var(--muted-2)}
.ssgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.sstile{
  position:relative;appearance:none;cursor:pointer;text-align:center;text-decoration:none;color:inherit;
  border:1px solid var(--hairline);border-radius:16px;padding:22px 16px;min-height:104px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;
  transition:transform .16s ease, box-shadow .16s ease;
}
.sstile:hover{transform:translateY(-3px);box-shadow:0 14px 28px rgba(20,24,40,.14)}
.sstile:focus-visible{outline:2px solid var(--skf-blue);outline-offset:3px}
.sstile--static{cursor:default}
.sstile--static:hover{transform:none;box-shadow:0 1px 2px rgba(20,24,40,.06)}
.sstile-t{font-size:16px;font-weight:800;line-height:1.25;letter-spacing:-.01em;color:var(--ink);text-wrap:pretty}
.sstile-s{font-size:12px;font-weight:700;letter-spacing:.02em;min-height:14px}
.sstile-i{position:absolute;top:8px;right:9px;width:18px;height:18px;border-radius:50%;border:1px solid currentColor;font-size:11px;font-weight:800;line-height:16px;text-align:center;opacity:.55}
.sscat--acc .sstile{background:#f8eee3;border-color:#e7dccf}.sscat--acc .sstile-s,.sscat--acc .sstile-i{color:#8a5a1e}
.sscat--fix .sstile{background:#e7f2ea;border-color:#d3e3d8}.sscat--fix .sstile-s,.sscat--fix .sstile-i{color:#1f6e42}
.sscat--drv .sstile{background:#e9eefc;border-color:#dce3f7}.sscat--drv .sstile-s,.sscat--drv .sstile-i{color:#1b4bd8}
.sscat--prt .sstile{background:#f2ecf8;border-color:#e4dcec}.sscat--prt .sstile-s,.sscat--prt .sstile-i{color:#5e3d8a}
.ssdot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.ssdot--ok{background:#2fa36b}.ssdot--bad{background:#d0342c}.ssdot--off{background:#9aa1ae}
.sstoast{
  position:fixed;right:24px;bottom:24px;z-index:60;display:none;align-items:center;gap:10px;
  background:var(--ink);color:#fff;border-radius:12px;padding:13px 18px;box-shadow:0 16px 34px rgba(20,24,40,.28);
  font-size:14px;font-weight:600;
}
.sstoast.show{display:flex;animation:ssToastIn .2s ease}
.sstoast .sspulse{width:8px;height:8px;border-radius:50%;background:#4ade80}
@keyframes ssToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:1199px){.ssgrid{grid-template-columns:repeat(3,1fr)}}
@media (max-width:767px){.ssgrid{grid-template-columns:repeat(2,1fr)}}
footer{
  display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;
  padding:22px 48px;border-top:1px solid var(--hairline);
  font-size:13px;color:var(--muted-2);
}
footer a{color:var(--skf-blue);text-decoration:none}
/* ── Unterseiten ── */
.view{display:none;padding:44px 48px 56px}
.view.active{display:block}
#home.active{display:block;padding:0}
.view h2.vtitle{font-size:30px;font-weight:800;letter-spacing:-.025em;margin-bottom:6px}
.view .vsub{font-size:16px;color:var(--muted);margin-bottom:26px;max-width:720px}
.card{
  background:rgba(255,255,255,.86);border:1px solid var(--hairline);border-radius:26px;
  padding:26px 28px;margin-bottom:18px;box-shadow:0 1px 2px rgba(20,24,40,.06);
}
.card h3{font-size:19px;font-weight:800;letter-spacing:-.02em;margin-bottom:8px}
.card p{font-size:15px;line-height:1.55;color:var(--ink)}
.card p.mut{color:var(--muted);margin-top:12px}
.lrow{
  display:flex;align-items:center;gap:14px;padding:14px 16px;margin-top:10px;
  border:1px solid var(--hairline);border-radius:16px;background:rgba(255,255,255,.9);
  text-decoration:none;color:inherit;
  transition:transform 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms cubic-bezier(.22,1,.36,1);
}
a.lrow:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(20,24,40,.10)}
.lrow:focus-visible{outline:2px solid var(--skf-blue);outline-offset:3px}
.lrow-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lrow-txt strong{font-size:15px;font-weight:700}
.lrow-txt small{font-size:13px;color:var(--muted)}
.lrow-ic{color:var(--skf-blue)}.lrow-ic svg{width:18px;height:18px}
.lrow--static{cursor:default}
.mini{font-size:13px;font-weight:700;color:var(--skf-blue);text-decoration:none;padding:6px 12px;border-radius:999px;border:1px solid rgba(29,43,216,.25);white-space:nowrap}
.mini--ghost{color:var(--muted);border-color:var(--hairline)}
.lrow--folder{gap:12px}
.lrow-ic--folder{color:#8a5a2b}
.lrow-ic--folder svg{width:20px;height:20px}
.cmd{display:flex;align-items:center;gap:10px;margin-top:10px;padding:12px 14px;border-radius:14px;background:#1b1d23}
.cmd code{flex:1;color:#e8eaf2;font-family:Consolas,monospace;font-size:13.5px;overflow-x:auto;white-space:nowrap}
.cmd button{
  font:inherit;font-size:13px;font-weight:700;color:#fff;background:var(--skf-blue);
  border:0;border-radius:999px;padding:7px 16px;cursor:pointer;
}
kbd{background:#fff;border:1px solid var(--hairline);border-radius:6px;padding:1px 7px;font-size:12.5px;font-family:inherit}
/* Film-Player (Allgemeines) */
.film{position:relative;width:100%;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#000;border:1px solid var(--hairline);margin-top:6px}
.film iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
/* Video: natürliche Höhe (kein doppeltes Letterboxing) — Klick=Pause/Weiter ist
   in Chromium bei <video controls> nativ. */
.film--vid{aspect-ratio:auto}
.film--vid video{display:block;width:100%;height:auto;background:#000;cursor:pointer}
/* Konferenzraeume */
.rooms-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-bottom:22px}
.room{
  display:flex;flex-direction:column;border-radius:22px;overflow:hidden;text-decoration:none;color:inherit;
  background:rgba(255,255,255,.9);border:1px solid var(--hairline);box-shadow:0 1px 2px rgba(20,24,40,.06);
  transition:transform 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms cubic-bezier(.22,1,.36,1);
}
a.room:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(20,24,40,.14)}
.room:focus-visible{outline:2px solid var(--skf-blue);outline-offset:3px}
.room-img{aspect-ratio:16/10;min-height:130px;background-size:cover;background-position:center}
.room-img--ph{display:flex;align-items:center;justify-content:center;background:linear-gradient(155deg,#dbe4ff,#d5e8dd)}
.room-img--ph span{font-size:34px;font-weight:800;color:rgba(27,29,35,.35);letter-spacing:.04em}
.room-body{display:flex;flex-direction:column;gap:3px;padding:16px 18px}
.room-body strong{font-size:17px;font-weight:800}
.room-body small{font-size:13px;color:var(--muted)}
.room-cta{font-size:13px;font-weight:700;color:var(--skf-blue);margin-top:8px}
.room-cta--mut{color:var(--muted-2)}
ol.howto{margin:10px 0 0 20px;font-size:15px;line-height:1.7}
/* Map */
.map-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.map-crumb{font-size:14px;font-weight:700;color:var(--muted)}
.map-crumb b{color:var(--ink)}
.floorpills,.map-tools{display:flex;gap:8px;flex-wrap:wrap}
.fpill{
  font:inherit;font-size:13.5px;font-weight:700;padding:8px 16px;border-radius:999px;cursor:pointer;
  border:1px solid var(--hairline);background:rgba(255,255,255,.9);color:var(--ink);
}
.fpill.on{background:var(--skf-blue);border-color:var(--skf-blue);color:#fff}
.fpill:focus-visible{outline:2px solid var(--skf-blue);outline-offset:3px}
.map-stage{
  position:relative;border-radius:22px;overflow:hidden;border:1px solid var(--hairline);background:#fff;
  height:min(64vh,720px);min-height:380px;cursor:grab;
}
.map-stage:active{cursor:grabbing}
.map-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.map-world img.map-fallback{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-drag:none;pointer-events:none}
.map-world canvas.map-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;transition:opacity 120ms}
.map-zoom{
  position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:6px;z-index:5;
}
.map-zoom button{
  width:34px;height:34px;border-radius:10px;border:1px solid var(--hairline);
  background:rgba(255,255,255,.92);color:var(--ink);font-size:17px;font-weight:700;cursor:pointer;
  display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(20,24,40,.10);
}
.map-zoom button:hover{background:#fff}
.map-zoom button:focus-visible{outline:2px solid var(--skf-blue);outline-offset:2px}
.map-region{
  position:absolute;border:2px solid rgba(29,43,216,.65);border-radius:10px;cursor:pointer;
  background:rgba(29,43,216,.10);transition:background 180ms;
}
.map-region:hover{background:rgba(29,43,216,.22)}
.map-region span{
  position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap;
  background:rgba(255,255,255,.94);border:1px solid var(--hairline);border-radius:999px;
  padding:4px 12px;font-size:12.5px;font-weight:800;color:var(--skf-blue);pointer-events:none;
}
.map-pin{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:none}
.map-pin svg{width:30px;height:30px;color:#d0342c;filter:drop-shadow(0 2px 3px rgba(20,24,40,.35))}
.map-pin.pin--you svg{color:var(--skf-blue)}
.map-pin small{
  background:rgba(255,255,255,.94);border:1px solid var(--hairline);border-radius:999px;
  padding:2px 10px;font-size:11.5px;font-weight:800;margin-top:2px;white-space:nowrap;
}
.map-pin.pin--ent svg{color:#0a8754}
.map-pin.pulse svg{animation:pulse 1.1s ease-in-out infinite}
/* Zielpin: deutlich sichtbar – grün aufblinken + etwas größer */
.map-pin.pulse--dest svg{animation:pulseDest 1s ease-in-out infinite}
.map-pin.pulse--dest small{animation:pulseDestLabel 1s ease-in-out infinite}
.map-connect{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
@keyframes pulseDest{0%,100%{transform:scale(1);color:#d0342c}50%{transform:scale(1.55);color:#10a04e;filter:drop-shadow(0 2px 6px rgba(16,160,78,.55))}}
@keyframes pulseDestLabel{0%,100%{border-color:var(--hairline);box-shadow:none}50%{border-color:#10a04e;box-shadow:0 0 0 3px rgba(16,160,78,.18)}}
/* Hinweis-Blinken am „Standpunkt anzeigen“-Button, sobald ein Ziel gewählt ist */
.fpill.hint{animation:btnHint 1.15s ease-in-out infinite}
@keyframes btnHint{0%,100%{background:rgba(255,255,255,.9);border-color:var(--hairline);color:var(--ink)}50%{background:rgba(16,160,78,.14);border-color:#10a04e;color:#0a7a3d}}
/* Button „Zurück zur Gesamtübersicht“ – unten mittig auf der Karte */
.map-home{
  position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:6;
  font:inherit;font-size:14px;font-weight:800;padding:10px 20px;border-radius:999px;cursor:pointer;
  border:1px solid var(--skf-blue);background:var(--skf-blue);color:#fff;
  box-shadow:0 6px 18px rgba(29,43,216,.32);transition:transform 160ms,box-shadow 160ms,background 160ms;
}
.map-home:hover{background:#1626c0;box-shadow:0 10px 26px rgba(29,43,216,.42);transform:translateX(-50%) translateY(-2px)}
.map-home:focus-visible{outline:2px solid #fff;outline-offset:2px}
.map-note{font-size:14px;color:var(--muted);margin-top:12px}
.route-box{margin-top:16px}
select.dest{
  font:inherit;font-size:14.5px;font-weight:600;padding:10px 14px;border-radius:14px;
  border:1px solid var(--hairline);background:rgba(255,255,255,.95);color:var(--ink);
}
.route-steps{margin:14px 0 0 20px;font-size:15px;line-height:1.75}
@media (prefers-reduced-motion:reduce){
  .tile:hover,.pill:hover,a.lrow:hover,a.room:hover{transform:none}
  .map-pin.pulse svg,.map-pin.pulse--dest svg,.map-pin.pulse--dest small,.fpill.hint{animation:none}
  .map-pin.pulse--dest svg{color:#10a04e;transform:scale(1.35)}
  html{scroll-behavior:auto}
}
@media (max-width:1199px){.grid,.rooms-grid{grid-template-columns:repeat(2,1fr)}}
@media (max-width:767px){
  .grid,.rooms-grid{grid-template-columns:1fr}
  h1{font-size:40px}
  .hero{padding:44px 24px 30px}
  .wrap,.view{padding-left:24px;padding-right:24px}
  .topbar{padding:0 24px}
  footer{padding:22px 24px}
}
</style>
</head>
<body>
<div class="screen">
  <div class="topbar">
    ${logoDataUri ? `<img src="${logoDataUri}" alt="SKF Marine">` : '<strong style="color:var(--skf-blue)">SKF Marine</strong>'}
    <div class="sep"></div>
    <span class="tb-title">Onboarding</span>
    <button type="button" class="backbtn" onclick="location.hash=''">← Zur Übersicht</button>
    <div class="spacer"></div>
    <span class="userpill"><span class="dot"></span>${esc(fullName || 'Neuer Mitarbeiter')}</span>
  </div>

  <!-- ── Startseite ── -->
  <section class="view active" id="home">
    <div class="hero">
      <span class="badge" id="heroBadge">${isNew ? 'Willkommen bei SKF' : 'SKF Marine · Dein Dashboard'}</span>
      <h1 id="heroTitle">${isNew
        ? `Herzlich willkommen an Bord${employee.vorname ? ', ' + esc(employee.vorname) : ''}!`
        : `Schön, dass du da bist${employee.vorname ? ', ' + esc(employee.vorname) : ''}!`}</h1>
      <p class="sub" id="heroSub">${isNew
        ? 'Dein persönliches Dashboard für den Start bei SKF Marine – alle wichtigen Links, Räume und Wege an einem Ort.'
        : 'Dein persönliches Dashboard – alle wichtigen Links, Räume und Wege bei SKF Marine an einem Ort.'}</p>
    </div>
    <div class="wrap">
      <div class="grid">
        <a class="tile tile--it" href="#it"><span class="ic">${icon('it')}</span><span><h2>IT</h2><p>Software &amp; Hardware bestellen, Tickets, Laufwerk I, Passwörter und IT-Tipps.</p><span class="cta">Öffnen →</span></span></a>
        <a class="tile tile--rooms" href="#rooms"><span class="ic">${icon('rooms')}</span><span><h2>Konferenzräume</h2><p>Alle sechs Besprechungsräume im Überblick – direkt aus Outlook buchen.</p><span class="cta">Öffnen →</span></span></a>
        <a class="tile tile--general" href="#general"><span class="ic">${icon('general')}</span><span><h2>Allgemeines</h2><p>Intranet, Ansprechpartner und Wissenswertes rund um deinen Arbeitsalltag.</p><span class="cta">Öffnen →</span></span></a>
        <a class="tile tile--orient" href="#map"><span class="ic">${icon('map')}</span><span><h2>Orientierung</h2><p>Interaktiver Lageplan: Gebäude, Etagen und der Weg zu Kantine, Personalbüro &amp; Co.</p><span class="cta">Öffnen →</span></span></a>
        <a class="tile tile--time" ${links.timeTracking ? `href="${esc(links.timeTracking)}" target="_blank" rel="noopener"` : 'href="#time"'}><span class="ic">${icon('time')}</span><span><h2>Zeiterfassung</h2><p>Kommen &amp; Gehen, Urlaub und Gleitzeit.</p><span class="cta">${links.timeTracking ? 'Öffnen ↗' : 'Öffnen →'}</span></span></a>
        <a class="tile tile--contact" href="#contact"><span class="ic">${icon('contact')}</span><span><h2>${contactTitle}</h2><p>Deine erste Anlaufstelle für alle Fragen in den ersten Wochen.</p><span class="cta">Kontakt →</span></span></a>
      </div>
      <div class="quick">
        <div class="qlabel">Schnellzugriff</div>
        <div class="pills">${pills.join('\n')}</div>
      </div>
    </div>
    <footer>
      <span>Erstellt von deiner IT · SKF Marine GmbH</span>
      ${settings.itContact.email ? `<a href="mailto:${esc(settings.itContact.email)}">${esc(settings.itContact.email)}</a>` : '<span></span>'}
    </footer>
  </section>

  <!-- ── IT-Selbsthilfe (1a-Design) ── -->
  <section class="view" id="it">
    <h2 class="vtitle">IT-Selbsthilfe</h2>
    <p class="vsub">Eine Kachel, ein Klick – die Aktion startet direkt auf deinem Rechner. Für alles andere findest du die Anlaufstellen unter „Portale &amp; Anträge“.</p>
    <div class="ssbanner" id="ssBanner"></div>
    ${selfServiceHtml}
  </section>

  <!-- ── Konferenzräume ── -->
  <section class="view" id="rooms">
    <h2 class="vtitle">Konferenzräume</h2>
    <p class="vsub">Sechs Besprechungsräume stehen dir zur Verfügung. Klick auf einen Raum öffnet direkt einen neuen Termin in Outlook (Web) – dort siehst du auch, ob der Raum frei ist.</p>
    <div class="rooms-grid">
${roomCards}
    </div>
    <div class="card">
      <h3>So buchst du einen Raum in Outlook</h3>
      <ol class="howto">
        <li>In Outlook auf <strong>Neuer Termin</strong> (Kalender) klicken.</li>
        <li>Unter <strong>Ort</strong> bzw. über den <strong>Raumfinder</strong> den gewünschten Raum auswählen (z.&nbsp;B. „Elbe“).</li>
        <li>Im <strong>Terminplanungs-Assistenten</strong> prüfen, ob der Raum zur gewünschten Zeit frei ist.</li>
        <li>Teilnehmer hinzufügen und <strong>Senden</strong> – der Raum bestätigt automatisch per E-Mail.</li>
      </ol>
    </div>
  </section>

  <!-- ── Allgemeines ── -->
  <section class="view" id="general">
    <h2 class="vtitle">Allgemeines</h2>
    <p class="vsub">Intranet und Ansprechpartner rund um deinen Arbeitsalltag.</p>
    ${filmCard}
    ${generalRows.length > 0 ? `<div class="card">${generalRows.join('\n')}</div>` : (generalFolderRows.length === 0 ? '<div class="card"><p class="mut">Inhalte folgen in Kürze – schau bald wieder rein.</p></div>' : '')}
    ${generalFolderRows.length > 0 ? `<div class="card"><h3>Ordner &amp; Laufwerke</h3>${generalFolderRows.join('\n')}</div>` : ''}
  </section>

  <!-- ── Orientierung / Map ── -->
  <section class="view" id="map">
    <h2 class="vtitle">Orientierung</h2>
    <p class="vsub">Klick dich vom Gesamtplan in die Gebäude. ${employeePin ? 'Dein Arbeitsplatz ist markiert.' : (employee.roomNumber ? `Dein Platz: Raum ${esc(employee.roomNumber)}.` : '')}</p>
    <div class="map-head">
      <span class="map-crumb" id="mapCrumb"></span>
      <div class="floorpills" id="floorPills"></div>
      <div class="spacer" style="flex:1"></div>
      <div class="map-tools">
        <select class="dest" id="destSelect"></select>
        <button type="button" class="fpill" id="routeBtn">Standpunkt anzeigen</button>
      </div>
    </div>
    <div class="map-stage" id="mapStage">
      <div class="map-world" id="mapWorld"></div>
      <button type="button" class="map-home" id="mapHomeBtn" onclick="__mapHome()" style="display:none">↩ Zurück zur Gesamtübersicht</button>
      <div class="map-zoom">
        <button type="button" id="zoomIn" title="Vergrößern" aria-label="Vergrößern">+</button>
        <button type="button" id="zoomOut" title="Verkleinern" aria-label="Verkleinern">−</button>
        <button type="button" id="zoomFit" title="Einpassen" aria-label="Einpassen">⛶</button>
      </div>
    </div>
    <p class="map-note" id="mapNote"></p>
    <div class="card route-box" id="routeBox" style="display:none">
      <h3 id="routeTitle"></h3>
      <ol class="route-steps" id="routeSteps"></ol>
      <div id="routeActions" style="margin-top:12px"></div>
    </div>
  </section>

  <!-- ── Zeiterfassung ── -->
  <section class="view" id="time">
    <h2 class="vtitle">Zeiterfassung</h2>
    <p class="vsub">Kommen &amp; Gehen, Urlaub und Gleitzeit.</p>
    ${links.timeTracking
      ? `<div class="card">
          <h3>Zeiterfassungs-Portal</h3>
          <p>Hier erfasst du deine Arbeitszeit und verwaltest Urlaub &amp; Gleitzeit.</p>
          <a class="lrow" href="${esc(links.timeTracking)}" target="_blank" rel="noopener"><span class="lrow-txt"><strong>Zeiterfassung öffnen</strong><small>${esc(links.timeTracking)}</small></span><span class="lrow-ic">${icon('link')}</span></a>
        </div>`
      : '<div class="card"><p class="mut">Die Informationen zur Zeiterfassung folgen in Kürze – deine IT ergänzt diesen Bereich gerade.</p></div>'}
  </section>

  <!-- ── Ansprechpartner ── -->
  <section class="view" id="contact">
    <h2 class="vtitle">${contactTitle}</h2>
    <p class="vsub">Deine erste Anlaufstelle, wenn du Fragen hast oder etwas nicht weiterweißt.</p>
    ${contactList.length > 0 ? contactCards : '<div class="card"><p class="mut">Kontaktdaten folgen.</p></div>'}
  </section>
</div>

<script>window.__PDF__ = ${pdfJson};</script>
<script>
window.__DATA__ = ${dataJson};
(function(){
  var D = window.__DATA__;
  // Map-Basisdaten GANZ oben — der Hash-Router ruft show() (und damit evtl.
  // initMap) bereits weiter unten auf; M/P/state muessen dann schon stehen.
  var M = D.map;
  var P = window.__PDF__ || null;
  var state = { planId: 'komplett', page: 1, floor: '', highlight: [], connect: null };
  var mapInited = false;

  // ── Begruessung: Neue Mitarbeiter sehen das "Willkommen an Bord" nur bis
  //    Startdatum + 10 Tage, danach automatisch die allgemeine Begruessung.
  //    Bestehende Mitarbeiter (mode='existing') sehen immer die allgemeine.
  try {
    if (D.mode === 'new') {
      var sd = D.employee.startDate ? new Date(D.employee.startDate + 'T00:00:00') : null;
      if (sd && !isNaN(sd.getTime())) {
        var limit = new Date(sd.getTime() + 10 * 86400000);
        if (new Date() > limit) {
          document.getElementById('heroTitle').textContent = 'Schön, dass du da bist' + (D.employee.vorname ? ', ' + D.employee.vorname : '') + '!';
          document.getElementById('heroBadge').textContent = 'SKF Marine · Dein Dashboard';
          document.getElementById('heroSub').textContent = 'Dein persönliches Dashboard – alle wichtigen Links, Räume und Wege bei SKF Marine an einem Ort.';
        }
      }
    }
  } catch(e){}

  // ── Hash-Router ─────────────────────────────────────────────────────────────
  var VIEWS = ['home','it','rooms','general','map','time','contact'];
  function show(id){
    if (VIEWS.indexOf(id) < 0) id = 'home';
    // Beim Verlassen einer Kachel (z. B. "Zur Übersicht") laufende Videos anhalten,
    // sonst spielt der Film-Ton im Hintergrund weiter. Pausiert auch beim Wechsel
    // zu einer anderen Kachel. Beim erneuten Öffnen startet der Film nicht von
    // selbst (kein Autoplay) — der Nutzer drückt wieder Play.
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) { try { vids[i].pause(); } catch (e) {} }
    VIEWS.forEach(function(v){
      var el = document.getElementById(v);
      if (el) el.classList.toggle('active', v === id);
    });
    document.body.classList.toggle('subview', id !== 'home');
    if (id === 'map') initMap();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function(){ show(location.hash.replace('#','')); });
  // Der INITIALE show()-Aufruf steht am ENDE der IIFE (nach allen Deklarationen),
  // damit ein direkter Aufruf mit #map nicht auf noch nicht zugewiesene
  // Map-Variablen (pdfDocs, V, …) trifft.

  // ── Kopier-Button (Clipboard-API kann unter file:// fehlen) ─────────────────
  window.copyCmd = function(){
    var txt = document.getElementById('mapCmd').textContent;
    var done = function(){ var b=document.getElementById('copyBtn'); b.textContent='Kopiert ✓'; setTimeout(function(){ b.textContent='Kopieren'; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function(){ fallbackCopy(txt); done(); });
    } else { fallbackCopy(txt); done(); }
  };
  function fallbackCopy(txt){
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch(e){}
    document.body.removeChild(ta);
  }

  // ── Interaktive Map (M/P/state stehen bereits ganz oben) ────────────────────
  // ── Ansicht (Modell wie der Karten-Editor: Welt in CSS-px je Zoom-Faktor,
  //    Verschieben per translate). baseW/baseH = Groesse bei Zoom 1. ──────────
  var V = { scale: 1, tx: 0, ty: 0, baseW: 0, baseH: 0 };
  var panDrag = null, dragMoved = false;
  var renderGen = 0;                 // erhoeht sich bei jedem render() (gegen veraltete Async)
  function stageEl(){ return document.getElementById('mapStage'); }
  function worldEl(){ return document.getElementById('mapWorld'); }

  // pdf.js-Live-Rendering (scharf bei jedem Zoom). Faellt auf das statische Bild
  // zurueck, wenn pdf.js/PDF nicht verfuegbar ist.
  var pdfLib = null, pdfReady = false, pdfDocs = {}, curPage = null;
  var renderTask = null, rerenderTimer = null, renderToken = 0;

  function b64ToBytes(b64){ var bin = atob(b64); var a = new Uint8Array(bin.length); for (var i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a; }

  function ensurePdfLib(){
    if (pdfLib) return Promise.resolve(pdfLib);
    if (!P || !P.lib) return Promise.resolve(null);
    try {
      // Blob-URL-Modul-Import (zuverlaessiger als data:-URL unter file://).
      var libUrl = URL.createObjectURL(new Blob([b64ToBytes(P.lib)], { type: 'text/javascript' }));
      return import(libUrl).then(function(lib){
        try {
          // Ein echter (Blob-)Worker kommuniziert unter file:// nicht zuverlaessig
          // (getDocument haengt). Wir zwingen pdf.js daher auf den Main-Thread:
          // window.Worker deaktivieren -> pdf.js nutzt den "Fake Worker", der das
          // Worker-Modul per Blob-Import in den Haupt-Thread laedt.
          try { window.Worker = undefined; } catch(e){}
          if (P.worker) {
            var wb = new Blob([b64ToBytes(P.worker)], { type: 'text/javascript' });
            lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(wb);
          }
          pdfLib = lib; pdfReady = true;
          return lib;
        } catch(e){ return null; }
      }).catch(function(){ return null; });
    } catch(e){ if (window.__MAPDBG) console.log('MAPDBG blob-fehler ' + e); return Promise.resolve(null); }
  }
  function getPdfDoc(planId){
    if (pdfDocs[planId]) return pdfDocs[planId];
    var pr = ensurePdfLib().then(function(lib){
      if (!lib || !P.plans || !P.plans[planId]) return null;
      return lib.getDocument({ data: b64ToBytes(P.plans[planId]) }).promise;
    }).catch(function(){ return null; });
    pdfDocs[planId] = pr; return pr;
  }

  function applyView(){
    var w = worldEl();
    w.style.width = (V.baseW * V.scale) + 'px';
    w.style.height = (V.baseH * V.scale) + 'px';
    w.style.transform = 'translate(' + V.tx + 'px,' + V.ty + 'px)';
  }
  function fitView(){
    var st = stageEl();
    if (!V.baseW || !V.baseH) { V.scale = 1; V.tx = 0; V.ty = 0; applyView(); return; }
    var s = Math.min(st.clientWidth / V.baseW, st.clientHeight / V.baseH);
    s = Math.max(0.05, Math.min(8, s));
    V.scale = s;
    V.tx = (st.clientWidth - V.baseW * s) / 2;
    V.ty = Math.max(0, (st.clientHeight - V.baseH * s) / 2);
    applyView(); scheduleRerender();
  }
  function zoomAt(cx, cy, factor){
    if (!V.baseW) return;
    var ns = Math.min(8, Math.max(0.05, V.scale * factor));
    if (ns === V.scale) return;
    var ratio = ns / V.scale;
    V.tx = cx - (cx - V.tx) * ratio;
    V.ty = cy - (cy - V.ty) * ratio;
    V.scale = ns;
    applyView(); scheduleRerender();
  }
  function scheduleRerender(){
    if (!pdfReady || !curPage) return;
    if (rerenderTimer) clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(renderCanvasCrisp, 130);
  }
  // Canvas in physischen Pixeln der aktuellen Zoomstufe neu rendern -> Vektor-
  // schaerfe wie im Editor (dort: canvas.width = viewport(scale*dpr)).
  function renderCanvasCrisp(){
    if (!pdfReady || !curPage) return;
    var cv = document.getElementById('mapCanvas'); if (!cv) return;
    var dpr = window.devicePixelRatio || 1;
    var maxSide = 8192;   // Canvas-Grenze schonen; darueber CSS-Streckung
    var rscale = Math.min(V.scale * dpr, maxSide / V.baseW, maxSide / V.baseH);
    if (!(rscale > 0)) return;
    var vp = curPage.getViewport({ scale: rscale });
    var token = ++renderToken;
    if (renderTask) { try { renderTask.cancel(); } catch(e){} renderTask = null; }
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    var ctx = cv.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    var task = curPage.render({ canvasContext: ctx, viewport: vp });
    renderTask = task;
    task.promise.then(function(){
      if (token !== renderToken) return;
      cv.style.opacity = '1';
      var fb = document.getElementById('mapFallback'); if (fb) fb.style.opacity = '0';
    }, function(){});
  }

  // Statisches Bild durch den PDF-Canvas ersetzen (scharf). Async; bricht ab,
  // wenn der Nutzer inzwischen den Plan gewechselt hat.
  function upgradeToCanvas(planId, page, gen){
    if (!P) return;
    getPdfDoc(planId).then(function(doc){
      if (!doc || gen !== renderGen) return;
      return doc.getPage(page).then(function(pg){
        if (gen !== renderGen) return;
        curPage = pg;
        var vp1 = pg.getViewport({ scale: 1 });
        V.baseW = vp1.width; V.baseH = vp1.height;
        fitView();   // fittet auf PDF-Basisgroesse + rendert crisp
      });
    }).catch(function(){});
  }

  function setupZoom(){
    var st = stageEl();
    st.addEventListener('wheel', function(e){
      e.preventDefault();
      var r = st.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    st.addEventListener('mousedown', function(e){
      if (e.button !== 0) return;
      panDrag = { sx: e.clientX, sy: e.clientY, tx: V.tx, ty: V.ty };
      dragMoved = false;
      e.preventDefault();
    });
    window.addEventListener('mousemove', function(e){
      if (!panDrag) return;
      var dx = e.clientX - panDrag.sx, dy = e.clientY - panDrag.sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
      V.tx = panDrag.tx + dx; V.ty = panDrag.ty + dy;
      applyView();   // nur verschieben -> kein Neu-Rendern noetig
    });
    window.addEventListener('mouseup', function(){
      panDrag = null;
      setTimeout(function(){ dragMoved = false; }, 0);
    });
    document.getElementById('zoomIn').onclick = function(){ var r = st.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.35); };
    document.getElementById('zoomOut').onclick = function(){ var r = st.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.35); };
    document.getElementById('zoomFit').onclick = fitView;
  }

  function floorsOf(planId){ return (M.floors && M.floors[planId]) || []; }
  function isMulti(planId){ return M.multiFloor.indexOf(planId) >= 0; }
  function imgFor(planId, page){ return M.images[planId + ':' + page] || ''; }

  function goPlan(planId){
    state.planId = planId;
    state.highlight = state.highlight || [];
    if (planId !== 'komplett') state.connect = null;
    if (isMulti(planId)) {
      var fl = floorsOf(planId);
      if (fl.length === 0) { state.page = 1; state.floor = ''; render(); return; }
      // Etage des Mitarbeiters vorauswaehlen, sonst erste
      var pre = fl[0];
      if (D.employee.floor) {
        for (var i=0;i<fl.length;i++) if (fl[i].floor === D.employee.floor) { pre = fl[i]; break; }
      }
      state.floor = pre.floor; state.page = pre.page;
    } else {
      state.floor = ''; state.page = 1;
    }
    render();
  }

  function render(){
    var world = worldEl();
    var crumb = document.getElementById('mapCrumb');
    var pillsEl = document.getElementById('floorPills');
    var note = document.getElementById('mapNote');
    world.innerHTML = ''; pillsEl.innerHTML = '';
    var gen = ++renderGen;
    curPage = null;                 // vorherige PDF-Seite verwerfen
    if (renderTask) { try { renderTask.cancel(); } catch(e){} renderTask = null; }

    var label = M.planLabels[state.planId] || state.planId;
    crumb.innerHTML = state.planId === 'komplett'
      ? '<b>Gesamtübersicht</b>'
      : '<a href="javascript:void(0)" onclick="__mapHome()" style="color:var(--skf-blue);text-decoration:none;font-weight:700">Gesamtübersicht</a> › <b>' + label + (state.floor ? ' · ' + (state.floor === 'EG' ? 'Erdgeschoss' : state.floor + '. Stock') : '') + '</b>';

    // „Zurück zur Gesamtübersicht“-Button nur zeigen, wenn man in einem Gebäude ist
    var homeBtn = document.getElementById('mapHomeBtn');
    if (homeBtn) homeBtn.style.display = state.planId === 'komplett' ? 'none' : '';

    if (state.planId === 'komplett') {
      // Gebaeude-Buttons: oeffnen die Detailplaene IMMER (auch ohne gepflegte
      // Klickflaechen auf der Karte)
      ['verwaltung', 'halle', 'kopfbauwerk'].forEach(function(pid){
        if (!M.planLabels[pid]) return;
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'fpill';
        b.textContent = M.planLabels[pid];
        b.onclick = function(){ state.highlight = []; goPlan(pid); };
        pillsEl.appendChild(b);
      });
    } else if (isMulti(state.planId)) {
      // Etagen-Pills
      floorsOf(state.planId).forEach(function(f){
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'fpill' + (f.floor === state.floor ? ' on' : '');
        b.textContent = f.floor === 'EG' ? 'Erdgeschoss' : f.floor + '. Stock';
        b.onclick = function(){ state.floor = f.floor; state.page = f.page; render(); };
        pillsEl.appendChild(b);
      });
    }

    var uri = imgFor(state.planId, state.page);
    var hasPdf = !!(P && P.plans && P.plans[state.planId]);
    if (!uri && !hasPdf) {
      world.innerHTML = '<p style="padding:40px;text-align:center;color:var(--muted)">Für diesen Plan liegt noch kein Bild vor – deine IT ergänzt das gerade.</p>';
      note.textContent = '';
      V.baseW = 0; V.baseH = 0; V.scale = 1; V.tx = 0; V.ty = 0; applyView();
      return;
    }

    // Basis-Layer: statisches Bild (Sofortansicht + Fallback)
    if (uri) {
      var img = document.createElement('img');
      img.className = 'map-fallback'; img.id = 'mapFallback';
      img.src = uri; img.alt = label; img.draggable = false;
      img.onload = function(){
        // Solange der PDF-Canvas noch nicht die Basisgroesse gesetzt hat,
        // die Ansicht anhand des Bildes einpassen.
        if (gen === renderGen && !curPage && img.naturalWidth) {
          V.baseW = img.naturalWidth; V.baseH = img.naturalHeight; fitView();
        }
      };
      world.appendChild(img);
    }
    // Schaerfe-Layer: pdf.js-Canvas (wird sichtbar, sobald gerendert)
    if (hasPdf) {
      var cv = document.createElement('canvas');
      cv.className = 'map-canvas'; cv.id = 'mapCanvas';
      cv.style.opacity = uri ? '0' : '1';
      world.appendChild(cv);
      upgradeToCanvas(state.planId, state.page, gen);
    }

    // Gebaeude-Regionen (Klickflaechen auf der Uebersicht)
    M.regions.forEach(function(r){
      if (r.planId !== state.planId || r.page !== state.page) return;
      var d = document.createElement('div');
      d.className = 'map-region';
      d.style.left = (r.rect.x*100) + '%'; d.style.top = (r.rect.y*100) + '%';
      d.style.width = (r.rect.w*100) + '%'; d.style.height = (r.rect.h*100) + '%';
      d.setAttribute('role','button'); d.setAttribute('tabindex','0');
      d.innerHTML = '<span>' + r.label + '</span>';
      var open = function(){ state.highlight = []; goPlan(r.targetPlanId); };
      d.onclick = function(){ if (dragMoved) return; open(); };
      d.onkeydown = function(ev){ if (ev.key==='Enter'||ev.key===' ') { ev.preventDefault(); open(); } };
      world.appendChild(d);
    });

    // Pins der aktuellen Seite
    var pinSvg = '${ICONS.pin.replace(/'/g, "\\'")}';
    M.pins.forEach(function(p){
      if (p.planId !== state.planId || p.page !== state.page) return;
      var el = document.createElement('div');
      var isYou = (p.id === M.employeePinId);
      var isEnt = (p.kind === 'entrance') || /^eingang/i.test(p.label || '');
      var isHi = state.highlight.indexOf(p.id) >= 0;
      // Zielpin (nicht der eigene „Dein Büro“-Pin) blinkt auffällig grün.
      el.className = 'map-pin' + (isYou ? ' pin--you' : (isEnt ? ' pin--ent' : '')) + (isHi ? (isYou ? ' pulse' : ' pulse--dest') : '');
      el.style.left = (p.x*100) + '%'; el.style.top = (p.y*100) + '%';
      var txt = isYou ? ('Dein Büro' + (p.roomNumber ? ' (' + p.roomNumber + ')' : '')) : p.label;
      el.innerHTML = pinSvg + '<small>' + txt + '</small>';
      world.appendChild(el);
    });

    // Gebaeude-Verbindungslinie (Weg von Eingang zu Eingang auf der Uebersicht)
    if (state.connect && state.connect.length === 2) {
      var pa = null, pb = null;
      M.pins.forEach(function(p){
        if (p.id === state.connect[0]) pa = p;
        if (p.id === state.connect[1]) pb = p;
      });
      if (pa && pb && pa.planId === state.planId && pa.page === state.page && pb.planId === state.planId && pb.page === state.page) {
        var svgNS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'map-connect');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        var line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(pa.x * 100)); line.setAttribute('y1', String(pa.y * 100));
        line.setAttribute('x2', String(pb.x * 100)); line.setAttribute('y2', String(pb.y * 100));
        line.setAttribute('stroke', '#1d2bd8'); line.setAttribute('stroke-width', '3.5');
        line.setAttribute('stroke-dasharray', '9 7'); line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(line);
        world.appendChild(svg);
      }
    }

    // Falls das Bild schon im Cache ist (onload feuert dann evtl. nicht),
    // sofort einpassen. Der PDF-Canvas ueberschreibt die Basisgroesse danach.
    var fb0 = document.getElementById('mapFallback');
    if (fb0 && fb0.complete && fb0.naturalWidth && !curPage) {
      V.baseW = fb0.naturalWidth; V.baseH = fb0.naturalHeight; fitView();
    } else if (!fb0) {
      // Nur-PDF-Fall: bis der Canvas rendert, neutral halten
      applyView();
    }

    note.textContent = state.planId === 'komplett'
      ? 'Klicke auf ein Gebäude' + (M.regions.length > 0 ? ' (Button oder Fläche auf der Karte)' : ' (Buttons oben)') + ', um den Detailplan zu öffnen. Zoomen: Mausrad oder +/− · Verschieben: Ziehen.'
      : 'Zoomen: Mausrad oder +/− · Verschieben: Ziehen · Einpassen: ⛶';
  }

  window.__mapHome = function(){ state.highlight = []; state.connect = null; goPlan('komplett'); };

  // Eingangs-Pin eines Gebaeudes auf der Uebersicht finden:
  // 1) explizite Eingangs-Pins (kind='entrance' + buildingId)
  // 2) Label-Heuristik: "Eingang …" enthaelt den Gebaeudenamen —
  //    deckt auch den geteilten "Eingang Kopfbauwerk/Halle" ab.
  function entranceFor(building){
    var found = null;
    M.pins.forEach(function(p){
      if (found || p.planId !== 'komplett') return;
      if (p.kind === 'entrance' && p.buildingId === building) found = p;
    });
    if (!found) {
      var key = (M.planLabels[building] || building).toLowerCase().slice(0, 5);
      M.pins.forEach(function(p){
        if (found || p.planId !== 'komplett') return;
        var l = (p.label || '').toLowerCase();
        if (/^eingang/.test(l) && l.indexOf(key) >= 0) found = p;
      });
    }
    return found;
  }

  function initMap(){
    if (mapInited) { render(); return; }
    mapInited = true;
    setupZoom();

    // Ziel-Auswahl fuellen (Eingangs-Pins sind Wegpunkte, keine Ziele)
    var sel = document.getElementById('destSelect');
    var dests = M.pins.filter(function(p){ return p.kind === 'destination' && !/^eingang/i.test(p.label || ''); });
    if (dests.length === 0) {
      sel.style.display = 'none';
      document.getElementById('routeBtn').style.display = 'none';
    } else {
      var o0 = document.createElement('option');
      o0.value = ''; o0.textContent = 'Ziel wählen …';
      sel.appendChild(o0);
      dests.forEach(function(p){
        var o = document.createElement('option');
        o.value = p.id; o.textContent = p.label;
        sel.appendChild(o);
      });
      var rbtn = document.getElementById('routeBtn');
      rbtn.onclick = showRoute;
      // Sobald ein Ziel gewählt ist, blinkt der Button dezent grün als Hinweis,
      // ihn jetzt anzuklicken. Auswahl zurückgesetzt → Hinweis aus.
      sel.onchange = function(){ if (sel.value) rbtn.classList.add('hint'); else rbtn.classList.remove('hint'); };
    }

    // Start: Uebersicht; wenn Mitarbeiter-Pin existiert, direkt dessen Plan/Etage
    if (M.employeePinId) {
      var mine = null;
      M.pins.forEach(function(p){ if (p.id === M.employeePinId) mine = p; });
      if (mine) {
        state.planId = mine.planId; state.page = mine.page;
        var fl = floorsOf(mine.planId);
        for (var i=0;i<fl.length;i++) if (fl[i].page === mine.page) state.floor = fl[i].floor;
        render();
        return;
      }
    }
    goPlan('komplett');
  }

  function gotoDest(dest){
    state.connect = null;
    state.planId = dest.planId; state.page = dest.page;
    var fl = floorsOf(dest.planId);
    state.floor = '';
    for (var i=0;i<fl.length;i++) if (fl[i].page === dest.page) state.floor = fl[i].floor;
    state.highlight = [dest.id];
    var mine = null;
    M.pins.forEach(function(p){ if (p.id === M.employeePinId) mine = p; });
    if (mine && mine.planId === dest.planId && mine.page === dest.page) state.highlight.push(mine.id);
    render();
  }

  function showRoute(){
    var sel = document.getElementById('destSelect');
    var destId = sel.value;
    var rbtn = document.getElementById('routeBtn');
    if (rbtn) rbtn.classList.remove('hint');   // Hinweis-Blinken beenden
    if (!destId) return;
    var dest = null, mine = null;
    M.pins.forEach(function(p){
      if (p.id === destId) dest = p;
      if (p.id === M.employeePinId) mine = p;
    });
    if (!dest) return;

    // Passende Route: bevorzugt exakt vom Mitarbeiter-Pin, sonst allgemein ('')
    var route = null;
    M.routes.forEach(function(r){
      if (r.toPinId !== destId) return;
      if (M.employeePinId && r.fromPinId === M.employeePinId) route = r;
    });
    if (!route) M.routes.forEach(function(r){ if (r.toPinId === destId && !r.fromPinId && !route) route = r; });

    var box = document.getElementById('routeBox');
    var title = document.getElementById('routeTitle');
    var steps = document.getElementById('routeSteps');
    var actions = document.getElementById('routeActions');
    steps.innerHTML = ''; actions.innerHTML = '';
    title.textContent = 'Weg zu: ' + dest.label;
    function addStep(t){ var li = document.createElement('li'); li.textContent = t; steps.appendChild(li); }

    // GEBAEUDEUEBERGREIFEND: Dein Büro und das Ziel liegen in verschiedenen
    // Gebaeuden -> erst die Gesamtuebersicht mit dem Weg Eingang → Eingang.
    var entA = mine && dest.planId !== mine.planId ? entranceFor(mine.planId) : null;
    var entB = mine && dest.planId !== mine.planId ? entranceFor(dest.planId) : null;
    if (mine && dest.planId !== mine.planId && entA && entB) {
      state.planId = 'komplett'; state.page = 1; state.floor = '';
      state.highlight = entA.id === entB.id ? [entA.id] : [entA.id, entB.id];
      state.connect = entA.id === entB.id ? null : [entA.id, entB.id];
      render();

      addStep('Verlasse das ' + (M.planLabels[mine.planId] || 'Gebäude') + ' am markierten Eingang („' + entA.label + '“).');
      if (entA.id === entB.id) {
        addStep((M.planLabels[dest.planId] || 'Das Zielgebäude') + ' nutzt denselben Eingang – siehe Markierung auf dem Plan.');
      } else {
        addStep('Folge der blauen Linie zum Eingang „' + entB.label + '“.');
      }
      var floorHint = '';
      var fl2 = floorsOf(dest.planId);
      for (var j=0;j<fl2.length;j++) if (fl2[j].page === dest.page) floorHint = fl2[j].floor === 'EG' ? ' (Erdgeschoss)' : ' (' + fl2[j].floor + '. Stock)';
      addStep('Im ' + (M.planLabels[dest.planId] || 'Zielgebäude') + floorHint + ': ' + dest.label + '.');
      if (route && route.steps) route.steps.forEach(addStep);

      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'fpill on';
      btn.textContent = 'Zielplan öffnen: ' + (M.planLabels[dest.planId] || dest.label) + ' →';
      btn.onclick = function(){ gotoDest(dest); };
      actions.appendChild(btn);
    } else {
      // Gleiches Gebaeude (oder kein Buero-Pin): direkt zum Zielplan
      gotoDest(dest);
      if (route && route.steps && route.steps.length > 0) {
        route.steps.forEach(addStep);
      } else {
        addStep(dest.label + ' ist auf dem Plan markiert' + (D.employee.roomNumber ? ' – dein Büro (Raum ' + D.employee.roomNumber + ') ' + (mine && mine.planId === dest.planId ? 'ebenfalls' : '') : '') + '.');
      }
    }

    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Initiale Ansicht — ganz am Ende, wenn alle Funktionen/Variablen stehen.
  show(location.hash.replace('#',''));
})();
</script>
<!-- IT-Selbsthilfe: Status-Feeds (best-effort; fehlen sie, bleibt alles leer) -->
<script src="pw-status.js"></script>
<script src="zscaler-status.js"></script>
<script src="known-issues.js"></script>
<div class="sstoast" id="ssToast"><span class="sspulse"></span><span class="sslabel"></span></div>
<script>
(function(){
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Passwort-Ablauf-Countdown (aus pw-status.js). Ab <=7 Tagen warnen, <=3 kritisch.
  var pw = window.__PW_STATUS__, pwEl = document.getElementById('ssPwStatus');
  if (pwEl && pw && !pw.error && !pw.neverExpires && typeof pw.daysLeft === 'number') {
    pwEl.textContent = 'Passwort läuft in ' + pw.daysLeft + (pw.daysLeft === 1 ? ' Tag ab' : ' Tagen ab');
    if (pw.daysLeft <= 3) pwEl.style.color = '#c02626';
    else if (pw.daysLeft <= 7) pwEl.style.color = '#b26a00';
  }

  // Zscaler-Ampel (aus zscaler-status.js).
  var zs = window.__ZSCALER_STATUS__, zEl = document.getElementById('ssZscaler');
  if (zEl && zs && zs.state) {
    var cls = zs.state === 'verbunden' ? 'ok' : (zs.state === 'nicht-installiert' ? 'off' : 'bad');
    var lbl = zs.state === 'verbunden' ? 'verbunden' : (zs.state === 'nicht-installiert' ? 'nicht installiert' : 'getrennt');
    zEl.innerHTML = '<span class="ssdot ssdot--' + cls + '"></span>' + lbl;
  }

  // Bekannte Störungen als Banner (aus known-issues.js).
  var ki = window.__KNOWN_ISSUES__, ban = document.getElementById('ssBanner');
  if (ban && ki && ki.issues && ki.issues.length) {
    var html = '';
    for (var i = 0; i < ki.issues.length && i < 4; i++) {
      var it = ki.issues[i] || {};
      var sev = String(it.schweregrad || it.severity || 'info').toLowerCase();
      var cl = (sev === 'crit' || sev === 'kritisch' || sev === 'hoch') ? 'crit' : ((sev === 'warn' || sev === 'mittel') ? 'warn' : 'info');
      html += '<div class="ssnote ssnote--' + cl + '"><span><b>' + esc(it.titel || it.title || 'Störung') + '</b>' +
              (it.text ? ' — ' + esc(it.text) : '') + (it.seit ? ' (seit ' + esc(it.seit) + ')' : '') + '</span></div>';
    }
    ban.innerHTML = html;
  }

  // Toast beim Klick auf eine Aktion (der eigentliche Erfolg kommt als Popup vom Skript).
  var toast = document.getElementById('ssToast');
  document.addEventListener('click', function(e){
    var a = (e.target && e.target.closest) ? e.target.closest('a.sstile[href^="skf-fix:"]') : null;
    if (!a || !toast) return;
    var t = a.querySelector('.sstile-t');
    toast.querySelector('.sslabel').textContent = (t ? t.textContent : 'Aktion') + ' wird gestartet …';
    toast.classList.add('show');
    clearTimeout(window.__ssTid);
    window.__ssTid = setTimeout(function(){ toast.classList.remove('show'); }, 3200);
  });
})();
</script>
</body>
</html>
`
}
