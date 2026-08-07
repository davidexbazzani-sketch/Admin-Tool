import { useEffect, useMemo, useState } from 'react'
import {
  MonitorPlay, Plus, Trash2, GripVertical, Play, Eye, Loader,
  Globe, Clock, Maximize2, AlertTriangle, ExternalLink, Cloud, HardDrive,
  CheckCircle, XCircle, RotateCcw, Users as UsersIcon, RefreshCw, ArrowLeft,
  Wifi, WifiOff, Image as ImageIcon, FileText, Folder, ListVideo, Copy, Edit3, Check, Repeat,
  Send, Tv, Square, Code2, Share2, Save, Star, StickyNote, FolderOpen, ChevronLeft, Info,
} from 'lucide-react'
import Card from '../components/Card'
import { api } from '../electronAPI'
import {
  loadConfig, saveLocal, clearLocal,
  loadUserOverride, saveUserOverride, clearUserOverride, listUserOverrides,
  loadPlaylistsContainer, createPlaylist, createPlaylistFromConfig, renamePlaylist, deletePlaylist, setActivePlaylist,
  playlistToConfig, savePlaylist, savePreviewSession, PREVIEW_SESSION_SENTINEL,
  makeNewSlide, makeEmptyConfig, detectSlideMediaType, slideSrcUrl,
  isLocalDrivePath, uploadMediaToShare, withPdfViewParams,
  makeNewVariant, activeRotationIndex, nextRotationSwitch,
  type PresentationConfig, type Slide, type StorageMode, type SlideRotation, type SlideVariant,
} from '../services/presentationConfig'
import {
  listClients, formatLastSeen,
  type ListedClient,
} from '../services/presentationClients'
import {
  pushToClient, stopClientPush, readClientPush,
  type RemotePush,
} from '../services/presentationRemote'
import {
  loadKioskMeta, setKioskMeta as saveKioskMeta, kioskDisplayName, loadMyKiosks, toggleMyKiosk,
  type KioskMeta,
} from '../services/presentationKiosk'
import { useAuthStore, useIsMasterAdmin } from '../store/authStore'

type Section = 'home' | 'browse' | 'editor' | 'kiosks' | 'edge'

interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
  scaleFactor: number
}

type Toast = { kind: 'success' | 'error'; text: string }

export default function PresentationMode() {
  const user = useAuthStore(s => s.session?.user)
  const isMaster = useIsMasterAdmin()
  const currentUser = user?.displayName || user?.username || ''
  // Navigation: Startseite mit 3 Bereichen
  const [section, setSection] = useState<Section>('home')
  const [kioskMeta, setKioskMetaState] = useState<Record<string, KioskMeta>>({})
  const [myKiosks, setMyKiosks] = useState<Set<string>>(new Set())
  const [config, setConfig] = useState<PresentationConfig>(makeEmptyConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<StorageMode | null>(null)
  const [dirty, setDirty] = useState(false)
  const [source, setSource] = useState<StorageMode | 'empty'>('empty')
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [selectedDisplay, setSelectedDisplay] = useState<number | null>(null)
  const [preview, setPreview] = useState<Slide | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [confirmClearLocal, setConfirmClearLocal] = useState(false)

  // Central multi-playlist state — only relevant when editingFor === null.
  // The user picks one playlist; saves go into that playlist within the container.
  const [playlists, setPlaylists] = useState<{ id: string; name: string }[]>([])
  const [activePlaylistId, setActivePlaylistIdState] = useState<string>('')
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string>('')  // which one is in the editor right now
  // true = der Editor bearbeitet gerade eine BRANDNEUE Praesentation (ueber
  // "Neue Praesentation erstellen"), noch an keine bestehende Playlist gebunden.
  // Dann wird die Playlist-Verwaltungs-Karte ausgeblendet (sie verwirrt dort).
  const [isNewPresentation, setIsNewPresentation] = useState(false)
  const [renamingPlaylistId, setRenamingPlaylistId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState<string>('')
  // Inline create dialog state — Electron blocks window.prompt(), so we use
  // an in-page input instead.
  const [creating, setCreating] = useState<{ name: string; copyFrom?: string } | null>(null)

  // Master-admin: per-user editing
  // editingFor === null    → editing own config (local/central)
  // editingFor === 'user1' → editing the override for that Windows user
  const [editingFor, setEditingFor] = useState<string | null>(null)
  const [clients, setClients] = useState<ListedClient[]>([])
  const [overrides, setOverrides] = useState<{ username: string; lastModified: string; modifiedBy: string; slideCount: number }[]>([])
  const [showOfflineDropdown, setShowOfflineDropdown] = useState(false)
  const [clientsLoading, setClientsLoading] = useState(false)

  // Live-Push: ad-hoc Inhalt (HTML/Seite/Bild/PDF) aus der Ferne auf einem
  // laufenden Kiosk-Player einblenden. activePushes = aktuell laufende Pushes.
  const [activePushes, setActivePushes] = useState<Record<string, RemotePush | null>>({})
  const [pushTarget, setPushTarget] = useState<ListedClient | null>(null)
  const [pushUrl, setPushUrl] = useState('')
  const [pushTitle, setPushTitle] = useState('')
  const [pushDurationMin, setPushDurationMin] = useState(5)   // 0 = bis manuell beendet
  const [pushZoom, setPushZoom] = useState(1)
  const [pushing, setPushing] = useState(false)
  const [pushUploading, setPushUploading] = useState(false)
  const [pushError, setPushError] = useState('')

  // "Laufende (Kiosk-)Praesentation als geteilte Playlist speichern"
  const [saveAsShared, setSaveAsShared] = useState<{ name: string } | null>(null)
  const [savingShared, setSavingShared] = useState(false)

  // Neue Praesentation: Name (wird beim Erstellen abgefragt) + Dialoge
  const [draftName, setDraftName] = useState('')                       // Name der noch nicht gespeicherten Praesentation
  const [nameDialog, setNameDialog] = useState<string | null>(null)    // Name-Eingabe (null = zu)
  const [startSaveOpen, setStartSaveOpen] = useState(false)            // "Vor dem Start speichern?"-Dialog
  const [startPrompted, setStartPrompted] = useState(false)            // Erststart-Dialog schon beantwortet?

  // Edge-Anzeige (SSO): echte msedge.exe-Fenster im App-Modus (lokal, electron-store)
  const [edgeUrl, setEdgeUrl] = useState('')
  const [edgeDisplayId, setEdgeDisplayId] = useState<number | null>(null)
  const [edgeFullscreen, setEdgeFullscreen] = useState(true)
  const [edgeOwnProfile, setEdgeOwnProfile] = useState(true)
  const [edgeRunning, setEdgeRunning] = useState(false)
  const [edgeReady, setEdgeReady] = useState(false)
  const [edgeMsg, setEdgeMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)

  function showToast(t: Toast) {
    setToast(t)
    setTimeout(() => setToast(curr => (curr === t ? null : curr)), 4000)
  }

  // Load config + displays + playlists container
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [res, ds, container] = await Promise.all([
        loadConfig(),
        api().presentationListDisplays(),
        loadPlaylistsContainer(),
      ])
      if (!alive) return
      setConfig(res.config)
      setSource(res.source)
      setDisplays(ds)
      const ext = ds.find(d => !d.primary)
      setSelectedDisplay((ext ?? ds[0])?.id ?? null)
      if (container) {
        setPlaylists(container.playlists.map(p => ({ id: p.id, name: p.name })))
        setActivePlaylistIdState(container.activePlaylistId)
        setCurrentPlaylistId(container.activePlaylistId)
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  async function refreshPlaylistsList() {
    const container = await loadPlaylistsContainer()
    if (container) {
      setPlaylists(container.playlists.map(p => ({ id: p.id, name: p.name })))
      setActivePlaylistIdState(container.activePlaylistId)
    }
  }

  async function switchPlaylist(id: string) {
    if (dirty) {
      const proceed = confirm('Ungespeicherte Änderungen gehen verloren. Trotzdem Playlist wechseln?')
      if (!proceed) return
    }
    const container = await loadPlaylistsContainer()
    if (!container) return
    const p = container.playlists.find(pl => pl.id === id)
    if (!p) return
    setConfig(playlistToConfig(p))
    setSource('central')
    setCurrentPlaylistId(id)
    setIsNewPresentation(false)
    setDirty(false)
    setRenamingPlaylistId(null)
    setSection('editor')
  }

  function startCreatePlaylist(copyFrom?: string) {
    if (copyFrom) {
      const src = playlists.find(p => p.id === copyFrom)
      setCreating({ name: src ? `${src.name} (Kopie)` : 'Kopie', copyFrom })
    } else {
      setCreating({ name: 'Neue Playlist' })
    }
    setRenamingPlaylistId(null)
  }

  async function confirmCreatePlaylist() {
    if (!creating) return
    const name = creating.name.trim()
    if (!name) return
    const res = await createPlaylist(name, user?.displayName || user?.username || 'unbekannt', creating.copyFrom)
    setCreating(null)
    if (!res.ok || !res.playlist) {
      showToast({ kind: 'error', text: res.error || 'Playlist konnte nicht erstellt werden' })
      return
    }
    await refreshPlaylistsList()
    await switchPlaylist(res.playlist.id)
    showToast({ kind: 'success', text: `Playlist "${res.playlist.name}" erstellt` })
  }

  async function handleRenamePlaylist(id: string) {
    if (!renameValue.trim()) { setRenamingPlaylistId(null); return }
    const res = await renamePlaylist(id, renameValue.trim(), user?.displayName || user?.username || 'unbekannt')
    setRenamingPlaylistId(null)
    if (res.ok) {
      await refreshPlaylistsList()
      showToast({ kind: 'success', text: 'Playlist umbenannt' })
    } else {
      showToast({ kind: 'error', text: res.error || 'Umbenennen fehlgeschlagen' })
    }
  }

  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  function startDeletePlaylist(id: string) {
    const p = playlists.find(p => p.id === id)
    if (!p) return
    setPendingDelete({ id, name: p.name })
  }
  async function confirmDeletePlaylist() {
    if (!pendingDelete) return
    const { id, name } = pendingDelete
    setPendingDelete(null)
    const res = await deletePlaylist(id)
    if (!res.ok) {
      showToast({ kind: 'error', text: res.error || 'Löschen fehlgeschlagen' })
      return
    }
    await refreshPlaylistsList()
    if (currentPlaylistId === id) {
      const container = await loadPlaylistsContainer()
      if (container) await switchPlaylist(container.activePlaylistId)
    }
    showToast({ kind: 'success', text: `Playlist "${name}" gelöscht` })
  }

  // ESC closes the inline dialogs
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setCreating(null)
        setPendingDelete(null)
        setRenamingPlaylistId(null)
        setPushTarget(null)
        setSaveAsShared(null)
        setNameDialog(null)
        setStartSaveOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSetActive(id: string) {
    const res = await setActivePlaylist(id)
    if (res.ok) {
      setActivePlaylistIdState(id)
      const p = playlists.find(pl => pl.id === id)
      showToast({ kind: 'success', text: `"${p?.name}" wird jetzt von Playern abgespielt` })
    } else {
      showToast({ kind: 'error', text: res.error || 'Aktiv-Setzen fehlgeschlagen' })
    }
  }

  // Master-admin: poll client heartbeats every 30s
  async function refreshClients() {
    if (!isMaster) return
    setClientsLoading(true)
    try {
      const [c, o, meta] = await Promise.all([listClients(), listUserOverrides(), loadKioskMeta()])
      setClients(c)
      setOverrides(o)
      setKioskMetaState(meta)
      // Laufende Pushes der bekannten Kioske einlesen (fuer Status + Stop-Button)
      const pushEntries = await Promise.all(
        c.map(async cl => [cl.username, await readClientPush(cl.username).catch(() => null)] as const),
      )
      const map: Record<string, RemotePush | null> = {}
      for (const [u, p] of pushEntries) map[u] = p && p.active ? p : null
      setActivePushes(map)
    } finally {
      setClientsLoading(false)
    }
  }

  useEffect(() => {
    if (!isMaster) return
    void refreshClients()
    const t = setInterval(refreshClients, 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaster])

  // "Meine Kioske" (persoenliche Auswahl) laden
  useEffect(() => {
    if (!isMaster || !currentUser) return
    void loadMyKiosks(currentUser).then(setMyKiosks).catch(() => {})
  }, [isMaster, currentUser])

  // Kiosk-Meta (Name/Notiz) speichern + neu laden
  async function updateKioskMeta(username: string, patch: Partial<KioskMeta>) {
    await saveKioskMeta(username, patch, currentUser)
    setKioskMetaState(await loadKioskMeta())
  }
  async function toggleMine(username: string) {
    setMyKiosks(await toggleMyKiosk(currentUser, username))
  }

  // Navigation-Helfer
  // Schritt 1: Name der neuen Praesentation abfragen (Dialog oeffnen)
  function openNewPresentation() {
    if (dirty && !confirm('Ungespeicherte Änderungen gehen verloren. Neue Präsentation starten?')) return
    setNameDialog('')
  }
  // Schritt 2: Name bestaetigt → leeren Editor mit diesem Namen oeffnen
  function confirmNewPresentationName() {
    const name = (nameDialog ?? '').trim()
    if (!name) return
    setEditingFor(null)
    setConfig(makeEmptyConfig())
    setSource('empty')
    setCurrentPlaylistId('')       // an keine bestehende Playlist gebunden
    setIsNewPresentation(true)     // → Playlist-Verwaltung ausblenden
    setStartPrompted(false)        // beim ersten Start nach dem Speichern fragen
    setDraftName(name)
    setDirty(false)
    setNameDialog(null)
    setSection('editor')
  }
  async function openLocal() {
    if (dirty && !confirm('Ungespeicherte Änderungen gehen verloren. Trotzdem öffnen?')) return
    const r = await loadConfig()
    setConfig(r.config)
    setSource(r.source)
    setEditingFor(null)
    setCurrentPlaylistId('')
    setIsNewPresentation(false)
    setDirty(false)
    setSection('editor')
  }

  // Switch into per-user editing mode (master admin only)
  async function editForUser(username: string) {
    if (dirty) {
      const proceed = confirm('Ungespeicherte Änderungen gehen verloren. Trotzdem wechseln?')
      if (!proceed) return
    }
    const override = await loadUserOverride(username)
    if (override) {
      setConfig(override)
    } else {
      // No override yet — start from current central as a template
      const central = await loadConfig()
      setConfig(central.config)
    }
    setEditingFor(username)
    setDirty(false)
    setShowOfflineDropdown(false)
    setSection('editor')
    showToast({ kind: 'success', text: `Bearbeite Konfiguration fuer ${username}` })
  }

  // Switch back from per-user editing mode to own config
  async function backToOwn() {
    if (dirty) {
      const proceed = confirm('Ungespeicherte Änderungen gehen verloren. Zurück zur eigenen Konfig?')
      if (!proceed) return
    }
    const own = await loadConfig()
    setConfig(own.config)
    setSource(own.source)
    setEditingFor(null)
    setDirty(false)
  }

  async function handleClearUserOverride(username: string) {
    if (!confirm(`Override für ${username} wirklich löschen? Der Player nimmt dann wieder die zentrale Konfig.`)) return
    const res = await clearUserOverride(username)
    if (res.ok) {
      showToast({ kind: 'success', text: `Override für ${username} entfernt` })
      void refreshClients()
      if (editingFor === username) await backToOwn()
    } else {
      showToast({ kind: 'error', text: res.error || 'Override konnte nicht entfernt werden' })
    }
  }

  // ── Live-Push (Fernanzeige auf laufendem Kiosk) ──────────────────────────────
  function openPushDialog(client: ListedClient) {
    const existing = activePushes[client.username]
    setPushTarget(client)
    setPushUrl(existing?.url ?? '')
    setPushTitle(existing?.title ?? '')
    setPushDurationMin(existing && existing.durationSec > 0 ? Math.round(existing.durationSec / 60) : 5)
    setPushZoom(existing?.zoom ?? 1)
    setPushError('')
  }

  async function pickPushFile() {
    let path: string | null = null
    try {
      path = await api().openFileDialog(MEDIA_FILE_FILTERS)
    } catch { /* abgebrochen */ }
    if (!path) return
    setPushError('')
    if (!isLocalDrivePath(path)) {
      setPushUrl(withPdfViewParams(path))
      return
    }
    setPushUploading(true)
    try {
      const res = await uploadMediaToShare(path)
      if (res.ok) {
        setPushUrl(withPdfViewParams(res.uncPath))
      } else {
        setPushError(`Upload aufs Netzlaufwerk fehlgeschlagen (${res.error}). Der Kiosk-PC kann eine lokale Datei dieses PCs nicht anzeigen.`)
      }
    } finally {
      setPushUploading(false)
    }
  }

  async function doPush() {
    if (!pushTarget) return
    if (!pushUrl.trim()) { setPushError('Bitte eine HTML-Datei/URL wählen oder eintragen.'); return }
    setPushing(true)
    try {
      const res = await pushToClient(pushTarget.username, {
        url: pushUrl,
        title: pushTitle,
        durationSec: Math.max(0, pushDurationMin) * 60,
        zoom: pushZoom,
        pushedBy: user?.displayName || user?.username || 'unbekannt',
      })
      if (!res.ok) {
        setPushError(res.error || 'Anzeigen fehlgeschlagen.')
        return
      }
      const target = pushTarget
      setPushTarget(null)
      showToast({
        kind: 'success',
        text: pushDurationMin > 0
          ? `Wird auf ${target.displayUsername} angezeigt (für ${pushDurationMin} Min, in max. 4 s).`
          : `Wird auf ${target.displayUsername} angezeigt (bis du es beendest, in max. 4 s).`,
      })
      void refreshClients()
    } finally {
      setPushing(false)
    }
  }

  async function doStopPush(username: string, displayName: string) {
    const res = await stopClientPush(username, user?.displayName || user?.username || 'unbekannt')
    if (res.ok) {
      setActivePushes(prev => ({ ...prev, [username]: null }))
      showToast({ kind: 'success', text: `Live-Anzeige auf ${displayName} beendet — normale Präsentation läuft wieder.` })
      void refreshClients()
    } else {
      showToast({ kind: 'error', text: res.error || 'Beenden fehlgeschlagen.' })
    }
  }

  // ── Laufende Konfiguration als geteilte Playlist speichern ────────────────
  function startSaveAsShared() {
    setSaveAsShared({ name: editingFor ? `${editingFor} – Präsentation` : 'Neue Playlist' })
  }
  async function confirmSaveAsShared() {
    if (!saveAsShared) return
    const name = saveAsShared.name.trim()
    if (!name) return
    setSavingShared(true)
    try {
      const res = await createPlaylistFromConfig(name, config, user?.displayName || user?.username || 'unbekannt')
      if (!res.ok || !res.playlist) {
        showToast({ kind: 'error', text: res.error || 'Playlist konnte nicht gespeichert werden.' })
        return
      }
      await refreshPlaylistsList()
      setSaveAsShared(null)
      showToast({ kind: 'success', text: `Als Playlist „${res.playlist.name}" für alle App-Nutzer gespeichert.` })
    } finally {
      setSavingShared(false)
    }
  }

  function patchSlide(id: string, patch: Partial<Slide>) {
    setConfig(c => ({ ...c, slides: c.slides.map(s => s.id === id ? { ...s, ...patch } : s) }))
    setDirty(true)
  }
  function addSlide() {
    setConfig(c => ({ ...c, slides: [...c.slides, makeNewSlide()] }))
    setDirty(true)
  }
  function deleteSlide(id: string) {
    setConfig(c => ({ ...c, slides: c.slides.filter(s => s.id !== id) }))
    setDirty(true)
  }
  function reorderTo(targetId: string) {
    if (!dragId || dragId === targetId) return
    setConfig(c => {
      const arr = [...c.slides]
      const from = arr.findIndex(s => s.id === dragId)
      const to = arr.findIndex(s => s.id === targetId)
      if (from < 0 || to < 0) return c
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return { ...c, slides: arr }
    })
    setDirty(true)
  }

  async function handleSave(target: StorageMode): Promise<boolean> {
    console.log(`[PresentationMode] handleSave(${target}) start, slides:`, config.slides.length, 'editingFor:', editingFor)
    setSaving(target)
    try {
      const modBy = user?.displayName || user?.username || 'unbekannt'
      let res
      let createdNewCentral: string | null = null   // Name, falls eine neue zentrale Playlist angelegt wurde
      if (target === 'user') {
        if (!editingFor) {
          showToast({ kind: 'error', text: 'Kein Benutzer ausgewaehlt' })
          return false
        }
        res = await saveUserOverride(editingFor, config, modBy)
      } else if (target === 'central') {
        if (!currentPlaylistId) {
          // Neue Praesentation (an keine Playlist gebunden) → als NEUE zentrale
          // Playlist anlegen, damit NICHT die aktuell aktive ueberschrieben wird.
          // Name = der beim Erstellen eingegebene Name (sonst Datum als Fallback).
          const name = draftName.trim() || `Neue Präsentation ${new Date().toLocaleDateString('de-DE')}`
          const created = await createPlaylistFromConfig(name, config, modBy)
          if (created.ok && created.playlist) {
            await refreshPlaylistsList()
            setCurrentPlaylistId(created.playlist.id)
            setIsNewPresentation(false)
            createdNewCentral = created.playlist.name
            res = { ok: true }
          } else {
            res = { ok: false, error: created.error }
          }
        } else {
          // Bekannte Playlist im Editor: GENAU diese speichern (keine Races mit
          // einem zwischenzeitlichen Wechsel der aktiven Playlist).
          res = await savePlaylist(currentPlaylistId, config, modBy)
        }
      } else {
        res = await saveLocal(config, modBy)
      }
      console.log(`[PresentationMode] saveResult(${target}):`, res)
      if (res.ok) {
        setDirty(false)
        setSource(target)
        setConfig(c => ({ ...c, lastModified: new Date().toISOString(), modifiedBy: modBy }))
        const successText =
          target === 'user' ? `Für ${editingFor} gespeichert — Player übernimmt die Änderung in max. 30 s.` :
          target === 'central' ? (createdNewCentral
            ? `Als neue zentrale Playlist "${createdNewCentral}" gespeichert. Über die Playlist-Verwaltung kannst du sie für die Player aktivieren.`
            : 'Zentral gespeichert — alle Nutzer sehen die neue Konfiguration.') :
          'Lokal gespeichert — nur auf diesem Rechner sichtbar.'
        showToast({ kind: 'success', text: successText })
        // Refresh master overview (override list might have grown)
        if (target === 'user') void refreshClients()
        return true
      } else {
        showToast({ kind: 'error', text: res.error || 'Speichern fehlgeschlagen.' })
        return false
      }
    } catch (e) {
      console.error('[PresentationMode] handleSave exception:', e)
      const msg = e instanceof Error ? e.message : String(e)
      showToast({ kind: 'error', text: `Unerwarteter Fehler: ${msg}` })
      return false
    } finally {
      setSaving(null)
    }
  }

  async function handleClearLocal() {
    setConfirmClearLocal(false)
    const res = await clearLocal()
    if (!res.ok) {
      showToast({ kind: 'error', text: res.error || 'Lokale Kopie konnte nicht geloescht werden.' })
      return
    }
    // Reload from central
    const reloaded = await loadConfig()
    setConfig(reloaded.config)
    setSource(reloaded.source)
    setDirty(false)
    showToast({ kind: 'success', text: 'Lokale Kopie geloescht — zentrale Version wird verwendet.' })
  }

  // Player mit dem EXAKTEN aktuellen Editor-Inhalt starten (Vorschau-Session).
  // So laeuft IMMER genau das, was gerade im Editor steht — unabhaengig davon,
  // ob/wo gespeichert wurde.
  async function actuallyStart() {
    await savePreviewSession(config)
    await api().presentationOpen({
      ...(selectedDisplay != null ? { displayId: selectedDisplay } : {}),
      previewPlaylistId: PREVIEW_SESSION_SENTINEL,
    })
  }

  async function startPresentation() {
    // Neue, noch nicht gespeicherte Praesentation → vor dem ERSTEN Start fragen,
    // ob (lokal/zentral) gespeichert werden soll.
    if (isNewPresentation && !startPrompted) {
      setStartSaveOpen(true)
      return
    }
    await actuallyStart()
  }

  // Antwort aus dem "Vor dem Start speichern?"-Dialog.
  async function startWithSave(target: StorageMode | null) {
    setStartSaveOpen(false)
    setStartPrompted(true)
    if (target) {
      const ok = await handleSave(target)
      if (!ok) return   // Speichern fehlgeschlagen → nicht starten (Toast zeigt den Fehler)
    }
    await actuallyStart()
  }

  // ── Edge-Anzeige (SSO) ───────────────────────────────────────────────────────
  // Einstellungen lokal laden (gleicher Mechanismus wie die lokale Praesentations-Konfig).
  useEffect(() => {
    void (async () => {
      try {
        const all = await api().getSettings()
        const c = (all as Record<string, unknown>)['presentationEdgeConfig'] as
          { url?: string; displayId?: number; fullscreen?: boolean; ownProfile?: boolean } | undefined
        if (c) {
          if (typeof c.url === 'string') setEdgeUrl(c.url)
          if (typeof c.displayId === 'number') setEdgeDisplayId(c.displayId)
          if (typeof c.fullscreen === 'boolean') setEdgeFullscreen(c.fullscreen)
          if (typeof c.ownProfile === 'boolean') setEdgeOwnProfile(c.ownProfile)
        }
      } catch { /* nicht kritisch */ }
      setEdgeReady(true)
    })()
  }, [])
  // Standard-Monitor setzen, sobald Displays geladen sind (externer Monitor bevorzugt).
  useEffect(() => {
    if (edgeDisplayId == null && displays.length) {
      const ext = displays.find(d => !d.primary)
      setEdgeDisplayId((ext ?? displays[0]).id)
    }
  }, [displays, edgeDisplayId])
  // Einstellungen persistieren.
  useEffect(() => {
    if (!edgeReady) return
    const t = setTimeout(() => {
      void api().setSetting('presentationEdgeConfig', { url: edgeUrl, displayId: edgeDisplayId, fullscreen: edgeFullscreen, ownProfile: edgeOwnProfile })
    }, 400)
    return () => clearTimeout(t)
  }, [edgeReady, edgeUrl, edgeDisplayId, edgeFullscreen, edgeOwnProfile])
  // Status (laeuft?) pollen, solange die Edge-Kachel offen ist.
  useEffect(() => {
    if (section !== 'edge') return
    let alive = true
    const check = async () => { try { const r = await api().edgeStatus(edgeDisplayId ?? undefined); if (alive) setEdgeRunning(!!r.running) } catch { /* ignore */ } }
    void check()
    const t = setInterval(check, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [section, edgeDisplayId])

  async function startEdge() {
    setEdgeMsg(null)
    if (!/^https?:\/\//i.test(edgeUrl.trim())) { setEdgeMsg({ kind: 'error', text: 'Bitte eine gültige URL eingeben (http:// oder https://).' }); return }
    const r = await api().edgeLaunch({ url: edgeUrl.trim(), displayId: edgeDisplayId ?? undefined, fullscreen: edgeFullscreen, ownProfile: edgeOwnProfile })
    if (r.success) {
      setEdgeRunning(true)
      setEdgeMsg(edgeOwnProfile
        ? { kind: 'success', text: 'Edge-Fenster gestartet.' }
        : { kind: 'info', text: 'Edge-Fenster gestartet — bei normalem Profil muss das Fenster ggf. manuell geschlossen werden.' })
    } else {
      setEdgeMsg({ kind: 'error', text: r.error || 'Start fehlgeschlagen.' })
    }
  }
  async function stopEdge() {
    setEdgeMsg(null)
    const r = await api().edgeClose(edgeDisplayId ?? undefined)
    if (r.success) { setEdgeRunning(false); setEdgeMsg({ kind: 'success', text: 'Edge-Fenster geschlossen.' }) }
    else setEdgeMsg({ kind: 'error', text: r.error || 'Schließen fehlgeschlagen.' })
  }

  const activeCount = useMemo(() => config.slides.filter(s => s.active && s.url.trim()).length, [config.slides])
  const totalDuration = useMemo(() =>
    config.slides.filter(s => s.active && s.url.trim()).reduce((a, s) => a + s.durationSec, 0),
    [config.slides],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader size={16} className="animate-spin" /> Lade Slides...
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        {/* Top-Navigation: zurueck zur Startseite */}
        {section !== 'home' && (
          <div className="flex items-center gap-2">
            <button onClick={() => setSection('home')} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40">
              <ChevronLeft size={14} />Übersicht
            </button>
            <span className="text-xs text-muted-foreground">
              {section === 'browse' ? 'Vorhandene Präsentationen' : section === 'kiosks' ? 'Kiosk-Clients' : section === 'edge' ? 'Edge-Anzeige (SSO)' : (editingFor ? `Bearbeiten für ${editingFor}` : 'Präsentation bearbeiten')}
            </span>
          </div>
        )}

        {/* ── Startseite ─────────────────────────────────────────────── */}
        {section === 'home' && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MonitorPlay size={22} className="text-blue-400" />
              <h2 className="text-lg font-bold text-foreground">Präsentationsmodus</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">Präsentationen (z. B. Info-Displays in der Halle) verwalten und auf Kiosk-Playern anzeigen.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button onClick={() => setSection('browse')} className="text-left rounded-xl border border-border bg-card hover:border-blue-500/40 hover:bg-blue-500/5 p-5 transition-colors">
                <ListVideo size={26} className="text-blue-400 mb-3" />
                <h3 className="text-sm font-semibold text-foreground mb-1">Vorhandene Präsentationen</h3>
                <p className="text-xs text-muted-foreground">Zentrale und lokal gespeicherte Präsentationen ansehen, öffnen und abspielen.</p>
              </button>
              <button onClick={openNewPresentation} className="text-left rounded-xl border border-border bg-card hover:border-emerald-500/40 hover:bg-emerald-500/5 p-5 transition-colors">
                <Plus size={26} className="text-emerald-400 mb-3" />
                <h3 className="text-sm font-semibold text-foreground mb-1">Neue Präsentation erstellen</h3>
                <p className="text-xs text-muted-foreground">Von Grund auf neu — direkt abspielen oder lokal bzw. zentral speichern.</p>
              </button>
              {isMaster && (
                <button onClick={() => setSection('kiosks')} className="text-left rounded-xl border border-border bg-card hover:border-purple-500/40 hover:bg-purple-500/5 p-5 transition-colors">
                  <Tv size={26} className="text-purple-400 mb-3" />
                  <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                    Kiosk-Clients
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black">{clients.filter(c => c.online).length} online</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">Alle Präsentations-Kioske sehen (online/offline), verwalten, bearbeiten, benennen und Notizen hinterlegen.</p>
                </button>
              )}
              <button onClick={() => setSection('edge')} className="text-left rounded-xl border border-border bg-card hover:border-cyan-500/40 hover:bg-cyan-500/5 p-5 transition-colors">
                <ExternalLink size={26} className="text-cyan-400 mb-3" />
                <h3 className="text-sm font-semibold text-foreground mb-1">Edge-Anzeige (SSO)</h3>
                <p className="text-xs text-muted-foreground">Externes Edge-Fenster – volle Anmeldung. Für SSO-Seiten (z. B. eMaint/Microsoft), die der interne Browser nicht anmelden kann.</p>
              </button>
            </div>
          </div>
        )}

        {/* ── Vorhandene Präsentationen ──────────────────────────────── */}
        {section === 'browse' && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Cloud size={15} className="text-blue-400" />Zentrale Präsentationen</h3>
              {playlists.length === 0 ? (
                <p className="text-xs text-muted-foreground">Noch keine zentralen Präsentationen.</p>
              ) : (
                <div className="space-y-1.5">
                  {playlists.map(p => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
                      <ListVideo size={15} className="text-blue-400 shrink-0" />
                      <span className="text-sm text-foreground flex-1 truncate">{p.name}</span>
                      {activePlaylistId === p.id && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black">aktiv</span>}
                      <button onClick={() => switchPlaylist(p.id)} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90"><FolderOpen size={12} />Öffnen</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><HardDrive size={15} className="text-amber-400" />Lokal gespeichert</h3>
              <p className="text-[11px] text-muted-foreground mb-2">Nur auf diesem Rechner sichtbar (zum Testen).</p>
              <button onClick={openLocal} className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border bg-card hover:bg-accent/40 text-foreground"><FolderOpen size={13} />Lokale Präsentation öffnen/bearbeiten</button>
            </div>
            <div className="pt-1">
              <button onClick={openNewPresentation} className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-500"><Plus size={14} />Neue Präsentation erstellen</button>
            </div>
          </div>
        )}

        {/* ── Kiosk-Clients ─────────────────────────────────────────── */}
        {section === 'kiosks' && isMaster && (
          <KioskClients
            clients={clients}
            overrides={overrides}
            editingFor={editingFor}
            loading={clientsLoading}
            showOfflineDropdown={showOfflineDropdown}
            setShowOfflineDropdown={setShowOfflineDropdown}
            onRefresh={refreshClients}
            onEdit={editForUser}
            onClearOverride={handleClearUserOverride}
            activePushes={activePushes}
            onPush={openPushDialog}
            onStopPush={doStopPush}
            meta={kioskMeta}
            myKiosks={myKiosks}
            onSetMeta={updateKioskMeta}
            onToggleMine={toggleMine}
          />
        )}

        {/* ── Edge-Anzeige (SSO) ─────────────────────────────────────── */}
        {section === 'edge' && (
          <div className="flex flex-col gap-4 max-w-2xl">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ExternalLink size={20} className="text-cyan-400" />
                <h2 className="text-lg font-bold text-foreground">Edge-Anzeige (SSO)</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Öffnet eine URL in einem echten <strong className="text-foreground">Microsoft-Edge-Fenster</strong> (App-Modus, ohne Adressleiste) auf dem gewählten Monitor.
                So greift die normale Windows-/Microsoft-Anmeldung (SSO) — anders als im internen Browser (z. B. eMaint/Auth0/Microsoft-SAML).
              </p>
            </div>

            <Card title="Einstellungen" icon={<ExternalLink size={14} />}>
              <div className="space-y-3">
                {/* URL */}
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">URL *</label>
                  <input value={edgeUrl} onChange={e => setEdgeUrl(e.target.value)} placeholder="https://…"
                    className={`w-full px-2.5 py-1.5 text-sm rounded-md bg-background border text-foreground focus:outline-none ${edgeUrl && !/^https?:\/\//i.test(edgeUrl.trim()) ? 'border-red-500/50' : 'border-border focus:border-primary'}`} />
                  {edgeUrl && !/^https?:\/\//i.test(edgeUrl.trim()) && <p className="text-[10px] text-red-400 mt-1">Nur http:// oder https://</p>}
                </div>

                {/* Monitor */}
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Monitor</label>
                  <select value={edgeDisplayId ?? ''} onChange={e => setEdgeDisplayId(Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-md text-sm text-foreground px-2 py-1.5">
                    {displays.map((d, i) => (
                      <option key={d.id} value={d.id}>
                        Monitor {i + 1}{d.primary ? ' (Primär)' : ''} – {d.bounds.width}×{d.bounds.height}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optionen */}
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={edgeFullscreen} onChange={e => setEdgeFullscreen(e.target.checked)} className="accent-primary" />
                  Vollbild
                </label>
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={edgeOwnProfile} onChange={e => setEdgeOwnProfile(e.target.checked)} className="mt-0.5 accent-primary shrink-0" />
                  <span>
                    Eigenes Profil (zuverlässiges Schließen)
                    <span className="block text-[10px] text-muted-foreground mt-0.5">
                      Empfohlen. Eigener Profilordner → das Fenster lässt sich zuverlässig schließen und die Anmeldung bleibt über Neustarts erhalten (einmalige Anmeldung nötig).
                      Aus = normales Edge-Profil (sofortige SSO-Übernahme), aber das Fenster muss ggf. manuell geschlossen werden.
                    </span>
                  </span>
                </label>

                {/* Aktionen + Status */}
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={startEdge} disabled={!/^https?:\/\//i.test(edgeUrl.trim())}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                    <Play size={14} />Starten
                  </button>
                  <button onClick={stopEdge} disabled={!edgeRunning}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">
                    <Square size={14} />Schließen
                  </button>
                  <span className={`ml-auto inline-flex items-center gap-1.5 text-xs ${edgeRunning ? 'text-emerald-300' : 'text-muted-foreground'}`}>
                    <span className={`w-2 h-2 rounded-full ${edgeRunning ? 'bg-emerald-400' : 'bg-muted-foreground/50'}`} />
                    {edgeRunning ? 'läuft' : 'gestoppt'}
                  </span>
                </div>

                {edgeMsg && (
                  <div className={`flex items-start gap-2 text-xs ${edgeMsg.kind === 'success' ? 'text-emerald-300' : edgeMsg.kind === 'error' ? 'text-red-300' : 'text-blue-300'}`}>
                    {edgeMsg.kind === 'success' ? <CheckCircle size={13} className="mt-0.5 shrink-0" /> : edgeMsg.kind === 'error' ? <XCircle size={13} className="mt-0.5 shrink-0" /> : <Info size={13} className="mt-0.5 shrink-0" />}
                    <span>{edgeMsg.text}</span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── Editor (neue erstellen / vorhandene bearbeiten) ────────── */}
        {section === 'editor' && (
        <>
        {/* Per-user editing banner (master admin only) */}
        {editingFor && (
          <div className="bg-purple-500/10 border border-purple-500/40 rounded-lg px-4 py-3 flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <UsersIcon size={16} className="text-purple-300" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Bearbeite Konfiguration für <span className="text-purple-300">{editingFor}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Speichern überschreibt nur diesen Kiosk — andere Player nutzen weiterhin die zentrale Konfig.
                  Änderungen werden in maximal 30 Sekunden vom Player übernommen.
                </p>
              </div>
              <button
                onClick={startSaveAsShared}
                title="Die aktuell bearbeitete Präsentation als Playlist für alle App-Nutzer speichern"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500 text-black hover:bg-emerald-500/20"
              >
                <Share2 size={12} />Als Playlist für alle speichern
              </button>
              <button
                onClick={backToOwn}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={12} />Zurück zur eigenen Konfig
              </button>
            </div>

            {/* Inline-Dialog: Name fuer die geteilte Playlist */}
            {saveAsShared && (
              <div className="flex items-center gap-2 p-2 rounded-md border border-emerald-500/40 bg-emerald-500/5">
                <Save size={13} className="text-emerald-300 shrink-0" />
                <span className="text-xs text-emerald-300 shrink-0">Playlist-Name:</span>
                <input
                  autoFocus
                  value={saveAsShared.name}
                  onChange={e => setSaveAsShared(s => s ? { ...s, name: e.target.value } : s)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmSaveAsShared(); if (e.key === 'Escape') setSaveAsShared(null) }}
                  placeholder="z.B. Halle Flur – Infoscreen"
                  className="flex-1 min-w-[180px] px-2 py-1 text-xs rounded-md border border-primary bg-background text-foreground focus:outline-none"
                />
                <button
                  onClick={confirmSaveAsShared}
                  disabled={!saveAsShared.name.trim() || savingShared}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingShared ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}Speichern
                </button>
                <button onClick={() => setSaveAsShared(null)} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Abbrechen"><XCircle size={14} /></button>
              </div>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MonitorPlay size={22} className="text-blue-400" />
              <h2 className="text-lg font-bold text-foreground">Präsentationsmodus</h2>
              {isNewPresentation && draftName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                  <ListVideo size={12} />{draftName}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Webseiten in Endlosschleife im Vollbild anzeigen — z.B. für ein Display in der Halle.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <SourceBadge source={editingFor ? 'user' : source} username={editingFor ?? undefined} />
              {config.lastModified && (
                <p className="text-[11px] text-muted-foreground">
                  Letzte Änderung: {new Date(config.lastModified).toLocaleString('de-DE')} · {config.modifiedBy || 'unbekannt'}
                </p>
              )}
              {dirty && (
                <span className="text-[11px] text-amber-400 font-medium">● Ungespeicherte Änderungen</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {editingFor ? (
              <button
                onClick={() => handleSave('user')}
                disabled={saving !== null}
                title={`Konfig für ${editingFor} auf das Netzlaufwerk schreiben`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  saving === null
                    ? 'bg-purple-600/90 text-white border-purple-500 hover:bg-purple-500'
                    : 'bg-muted/10 text-muted-foreground border-border cursor-not-allowed'
                }`}
              >
                {saving === 'user' ? <Loader size={14} className="animate-spin" /> : <UsersIcon size={14} />}
                Für {editingFor} speichern
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleSave('local')}
                  disabled={saving !== null}
                  title="Lokal speichern (nur auf diesem Rechner sichtbar — gut zum Testen)"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    saving === null
                      ? 'bg-muted/30 text-foreground border-border hover:bg-muted/50'
                      : 'bg-muted/10 text-muted-foreground border-border cursor-not-allowed'
                  }`}
                >
                  {saving === 'local' ? <Loader size={14} className="animate-spin" /> : <HardDrive size={14} />}
                  Lokal speichern
                </button>
                <button
                  onClick={() => handleSave('central')}
                  disabled={saving !== null}
                  title="Zentral speichern (alle Tool-Nutzer sehen die Aenderung)"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    saving === null
                      ? 'bg-blue-600/90 text-white border-blue-500 hover:bg-blue-500'
                      : 'bg-muted/10 text-muted-foreground border-border cursor-not-allowed'
                  }`}
                >
                  {saving === 'central' ? <Loader size={14} className="animate-spin" /> : <Cloud size={14} />}
                  Zentral speichern
                </button>
              </>
            )}
            <button
              onClick={startPresentation}
              disabled={activeCount === 0 || saving !== null || editingFor !== null}
              title={editingFor != null ? 'Im Bearbeitungsmodus für andere User: Vorschau über deren Player verfügbar' : (activeCount === 0 ? 'Mindestens eine aktive Slide mit URL erforderlich' : 'Vollbild-Praesentation starten')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
                activeCount > 0 && saving === null && editingFor === null
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              <Play size={14} />Präsentation starten
            </button>
          </div>
        </div>

        {/* Source explanation banner */}
        {source === 'local' && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
            <HardDrive size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 text-xs text-amber-200">
              Du arbeitest mit einer <strong>lokalen Kopie</strong>. Andere Nutzer sehen weiterhin die zentrale Version.
              Klick auf "Zentral speichern" um die Änderungen für alle freizugeben.
            </div>
            <button
              onClick={() => setConfirmClearLocal(true)}
              className="flex items-center gap-1 text-xs text-amber-200 hover:text-amber-100 px-2 py-1 rounded border border-amber-500/30 hover:bg-amber-500/10"
            >
              <RotateCcw size={12} />Lokale Kopie verwerfen
            </button>
          </div>
        )}

        {/* Quick info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card title="Aktive Slides" icon={<Globe size={14} />}>
            <p className="text-2xl font-semibold text-foreground">{activeCount}</p>
            <p className="text-[11px] text-muted-foreground">von {config.slides.length} insgesamt</p>
          </Card>
          <Card title="Schleifendauer" icon={<Clock size={14} />}>
            <p className="text-2xl font-semibold text-foreground">
              {Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, '0')}
            </p>
            <p className="text-[11px] text-muted-foreground">min:sek pro Durchlauf</p>
          </Card>
          <Card title="Anzeige" icon={<Maximize2 size={14} />}>
            <select
              value={selectedDisplay ?? ''}
              onChange={e => setSelectedDisplay(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-md text-sm text-foreground px-2 py-1.5"
            >
              {displays.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label} {d.primary ? '(Primär)' : ''} · {d.bounds.width}×{d.bounds.height}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Monitor für Vollbild-Anzeige</p>
          </Card>
        </div>

        {/* Hinweis */}
        <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
          <AlertTriangle size={14} className="text-blue-400 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-300 space-y-0.5">
            <p>Im Player: <strong>Leertaste</strong> = Pause/Play · <strong>← →</strong> = Vor/Zurück · <strong>ESC</strong> = Beenden</p>
            <p>Seiten mit Login (z.B. ServiceNow) verlangen ggf. einmaliges Anmelden im Präsentations-Fenster.</p>
          </div>
        </div>

        {/* Playlist-Verwaltung: nur beim Bearbeiten einer BESTEHENDEN zentralen
            Playlist. Bei "Neue Präsentation" und im lokalen/User-Modus wird sie
            ausgeblendet — dort verwirrt der Playlist-Wechsler nur. */}
        {!editingFor && !isNewPresentation && currentPlaylistId && (
          <Card title="Playlists" icon={<ListVideo size={14} />} subtitle="Mehrere Präsentationen anlegen und zwischen ihnen wechseln">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground font-medium">Aktuell im Editor:</span>
                <select
                  value={currentPlaylistId}
                  onChange={e => switchPlaylist(e.target.value)}
                  className="flex-1 min-w-[180px] max-w-md bg-background border border-border rounded-md text-sm text-foreground px-2 py-1.5"
                >
                  {playlists.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.id === activePlaylistId ? '  •  Aktiv' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => startCreatePlaylist()}
                  title="Neue leere Playlist anlegen"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500 text-black hover:bg-emerald-500/20"
                >
                  <Plus size={12} />Neu
                </button>
                <button
                  onClick={() => startCreatePlaylist(currentPlaylistId)}
                  title="Aktuelle Playlist duplizieren"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
                >
                  <Copy size={12} />Duplizieren
                </button>
                {renamingPlaylistId === currentPlaylistId ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenamePlaylist(currentPlaylistId)
                        if (e.key === 'Escape') setRenamingPlaylistId(null)
                      }}
                      className="px-2 py-1 text-xs rounded-md border border-primary bg-background text-foreground w-40"
                    />
                    <button onClick={() => handleRenamePlaylist(currentPlaylistId)} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setRenamingPlaylistId(null)} className="p-1 text-muted-foreground hover:bg-accent rounded">
                      <XCircle size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const p = playlists.find(p => p.id === currentPlaylistId)
                      setRenameValue(p?.name ?? '')
                      setRenamingPlaylistId(currentPlaylistId)
                    }}
                    title="Aktuelle Playlist umbenennen"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
                  >
                    <Edit3 size={12} />Umbenennen
                  </button>
                )}
                <button
                  onClick={() => startDeletePlaylist(currentPlaylistId)}
                  disabled={playlists.length <= 1}
                  title={playlists.length <= 1 ? 'Letzte Playlist kann nicht geloescht werden' : 'Diese Playlist loeschen'}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={12} />Löschen
                </button>
              </div>

              {/* Inline create dialog (Electron blocks window.prompt) */}
              {creating && (
                <div className="flex items-center gap-2 p-2 rounded-md border border-emerald-500/40 bg-emerald-500/5">
                  <Plus size={13} className="text-emerald-300 shrink-0" />
                  <span className="text-xs text-emerald-300">
                    {creating.copyFrom ? 'Neue Playlist (Kopie) — Name:' : 'Neue Playlist — Name:'}
                  </span>
                  <input
                    autoFocus
                    value={creating.name}
                    onChange={e => setCreating(c => c ? { ...c, name: e.target.value } : c)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmCreatePlaylist()
                      if (e.key === 'Escape') setCreating(null)
                    }}
                    placeholder="Name der neuen Playlist"
                    className="flex-1 min-w-[180px] px-2 py-1 text-xs rounded-md border border-primary bg-background text-foreground focus:outline-none"
                  />
                  <button
                    onClick={confirmCreatePlaylist}
                    disabled={!creating.name.trim()}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Check size={12} />Anlegen
                  </button>
                  <button
                    onClick={() => setCreating(null)}
                    className="p-1 rounded hover:bg-accent text-muted-foreground"
                    title="Abbrechen"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              )}

              {/* Inline delete confirm */}
              {pendingDelete && (
                <div className="flex items-center gap-2 p-2 rounded-md border border-red-500/40 bg-red-500/5">
                  <AlertTriangle size={13} className="text-red-300 shrink-0" />
                  <span className="text-xs text-red-200 flex-1">
                    Playlist <strong className="text-foreground">"{pendingDelete.name}"</strong> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                  </span>
                  <button
                    onClick={confirmDeletePlaylist}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-red-600 hover:bg-red-500 text-white"
                  >
                    <Trash2 size={12} />Löschen
                  </button>
                  <button
                    onClick={() => setPendingDelete(null)}
                    className="p-1 rounded hover:bg-accent text-muted-foreground"
                    title="Abbrechen"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 text-[11px]">
                {currentPlaylistId === activePlaylistId ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 border border-emerald-600 text-black">
                    <CheckCircle size={11} />Diese Playlist wird aktuell von Playern abgespielt
                  </span>
                ) : (
                  <>
                    <span className="text-muted-foreground">
                      Im Editor: <strong className="text-foreground">{playlists.find(p => p.id === currentPlaylistId)?.name}</strong>
                      {' '}· Aktiv für Player: <strong className="text-foreground">{playlists.find(p => p.id === activePlaylistId)?.name}</strong>
                    </span>
                    <button
                      onClick={() => handleSetActive(currentPlaylistId)}
                      className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                    >
                      <Play size={11} />Diese Playlist für Player aktivieren
                    </button>
                  </>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Übergang + Statusleiste */}
        <Card title="Anzeige-Optionen" icon={<MonitorPlay size={14} />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground font-medium block mb-1">Übergang zwischen Slides</label>
              <select
                value={config.transitionType ?? 'fade'}
                onChange={e => { setConfig(c => ({ ...c, transitionType: e.target.value as PresentationConfig['transitionType'] })); setDirty(true) }}
                className="w-full bg-background border border-border rounded-md text-sm text-foreground px-2 py-1.5"
              >
                <option value="fade">Fade (Standard)</option>
                <option value="cinematic">Cinematic — alte zoomt weg, neue schiebt rein</option>
                <option value="cube">Cube — 3D-Würfel-Rotation</option>
                <option value="flip">Flip — Karte umklappen</option>
                <option value="circle">Circle Reveal — Kreis wächst aus Mitte</option>
                <option value="blur">Blur Crossfade — Unschärfe-Übergang</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Effekt zwischen zwei Slides</p>
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground font-medium block mb-1">Übergangsdauer</label>
              <div className="flex items-center gap-1">
                <input
                  type="number" min={100} max={3000} step={100}
                  value={config.transitionMs}
                  onChange={e => { setConfig(c => ({ ...c, transitionMs: Math.max(100, Math.min(3000, Number(e.target.value) || 600)) })); setDirty(true) }}
                  className="flex-1 bg-background border border-border rounded-md text-sm text-foreground px-2 py-1.5"
                />
                <span className="text-[11px] text-muted-foreground">ms</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">100–3000 ms</p>
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground font-medium block mb-1">Statusleiste (Uhr + Datum)</label>
              <select
                value={config.statusBar ?? 'none'}
                onChange={e => { setConfig(c => ({ ...c, statusBar: e.target.value as PresentationConfig['statusBar'] })); setDirty(true) }}
                className="w-full bg-background border border-border rounded-md text-sm text-foreground px-2 py-1.5"
              >
                <option value="none">Aus</option>
                <option value="top">Oben anzeigen</option>
                <option value="bottom">Unten anzeigen</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Dezent eingeblendet, zieht Blicke</p>
            </div>
          </div>

          {/* ServiceNow Auto-Login */}
          <div className="mt-3 pt-3 border-t border-border">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.serviceNowAutoLogin === true}
                onChange={e => { setConfig(c => ({ ...c, serviceNowAutoLogin: e.target.checked })); setDirty(true) }}
                className="mt-0.5 w-4 h-4 accent-blue-500 shrink-0"
              />
              <span>
                <span className="text-sm text-foreground font-medium">ServiceNow Login automatisch bestätigen</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  Für Präsentationen mit ServiceNow-Dashboards: Nach einigen Stunden erscheint der Dialog
                  „Your session has expired". Bei aktivierter Option klickt das Tool den „Log In"-Button alle
                  paar Sekunden automatisch weg — aber <strong>nur</strong> wenn dieser Dialog wirklich sichtbar ist.
                  Andere Folien werden dadurch nicht beeinflusst.
                </span>
              </span>
            </label>
          </div>
        </Card>

        {/* Slides */}
        <Card
          title="Slides"
          icon={<MonitorPlay size={15} />}
          subtitle={`${config.slides.length} Eintrag${config.slides.length === 1 ? '' : 'e'} · drag zum Sortieren`}
        >
          <div className="space-y-2">
            {config.slides.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Noch keine Slides angelegt. Klick auf "Slide hinzufügen" um zu starten.
              </div>
            )}
            {config.slides.map((slide, idx) => (
              <SlideRow
                key={slide.id}
                slide={slide}
                index={idx}
                onPatch={patch => patchSlide(slide.id, patch)}
                onDelete={() => deleteSlide(slide.id)}
                onPreview={() => setPreview(slide)}
                onDragStart={() => setDragId(slide.id)}
                onDragEnd={() => setDragId(null)}
                onDrop={() => reorderTo(slide.id)}
                isDragSource={dragId === slide.id}
              />
            ))}

            <button onClick={addSlide}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors">
              <Plus size={14} />Slide hinzufügen
            </button>
          </div>
        </Card>
        </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm">
          <div
            className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-2xl border ${
              toast.kind === 'success'
                ? 'bg-green-500 border-green-600 text-black'
                : 'bg-red-500/15 border-red-500/40 text-red-200'
            }`}
          >
            {toast.kind === 'success' ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <p className="text-sm">{toast.text}</p>
          </div>
        </div>
      )}

      {/* Confirm clear local */}
      {confirmClearLocal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setConfirmClearLocal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <RotateCcw size={18} className="text-amber-400" />
              <h3 className="text-base font-semibold text-foreground">Lokale Kopie verwerfen?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Die lokal gespeicherten Änderungen gehen verloren. Anschließend wird die zentrale Version geladen.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmClearLocal(false)} className="px-3 py-1.5 rounded-md text-sm text-muted-foreground border border-border hover:bg-muted/30">Abbrechen</button>
              <button onClick={handleClearLocal} className="px-3 py-1.5 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-500">Verwerfen</button>
            </div>
          </div>
        </div>
      )}

      {/* Neue Präsentation: Name abfragen (Schritt 1) */}
      {nameDialog !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setNameDialog(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <MonitorPlay size={18} className="text-emerald-400" />
              <h3 className="text-base font-semibold text-foreground">Neue Präsentation</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Wie möchtest du die Präsentation nennen?</p>
            <input
              autoFocus
              value={nameDialog}
              onChange={e => setNameDialog(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmNewPresentationName(); if (e.key === 'Escape') setNameDialog(null) }}
              placeholder="z.B. Infoscreen Halle Nord"
              className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setNameDialog(null)} className="px-3 py-1.5 rounded-md text-sm text-muted-foreground border border-border hover:bg-muted/30">Abbrechen</button>
              <button onClick={confirmNewPresentationName} disabled={!nameDialog.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed">
                <Check size={14} />Weiter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vor dem ersten Start: speichern? (Schritt 2) */}
      {startSaveOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setStartSaveOpen(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Save size={18} className="text-blue-400" />
              <h3 className="text-base font-semibold text-foreground">Präsentation speichern?</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Möchtest du „<strong className="text-foreground">{draftName || 'Neue Präsentation'}</strong>" vor dem Start speichern? Ohne Speichern wird sie nur einmalig abgespielt.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => startWithSave('local')} disabled={saving !== null}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm border border-border bg-muted/20 hover:bg-muted/40 text-foreground disabled:opacity-50">
                <span className="flex items-center gap-2"><HardDrive size={15} className="text-amber-400" />Lokal speichern &amp; starten</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="Nur auf diesem Rechner gespeichert — nur für dich verfügbar."><Info size={12} />verfügbar nur für dich</span>
              </button>
              <button onClick={() => startWithSave('central')} disabled={saving !== null}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-foreground disabled:opacity-50">
                <span className="flex items-center gap-2"><Cloud size={15} className="text-blue-400" />Zentral speichern &amp; starten</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="Auf dem Netzlaufwerk gespeichert — für alle Tool-Nutzer verfügbar."><Info size={12} />verfügbar für alle</span>
              </button>
              <button onClick={() => startWithSave(null)} disabled={saving !== null}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-50">
                <Play size={14} />Nur starten (ohne speichern)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live-Push dialog: Inhalt auf einem laufenden Kiosk anzeigen */}
      {pushTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !pushing && setPushTarget(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Tv size={18} className="text-blue-400" />
              <h3 className="text-base font-semibold text-foreground">Live auf Kiosk anzeigen</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Blendet sofort auf <strong className="text-foreground">{pushTarget.displayUsername}</strong>
              <span className="font-mono text-muted-foreground"> @ {pushTarget.hostname}</span> einen Inhalt im Vollbild ein.
              Die laufende Präsentation wird überlagert und läuft danach automatisch weiter.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">HTML-Datei / Seite / Bild / PDF</label>
                <div className="flex gap-1.5">
                  <input
                    value={pushUrl}
                    onChange={e => setPushUrl(e.target.value)}
                    placeholder="https://... oder \\server\...\\info.html"
                    className="flex-1 min-w-0 px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={pickPushFile}
                    disabled={pushUploading}
                    title="HTML-Datei, Bild oder PDF wählen — wird automatisch aufs Netzlaufwerk hochgeladen"
                    className="px-2.5 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-50"
                  >
                    {pushUploading ? <Loader size={14} className="animate-spin" /> : <Folder size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Code2 size={10} className="shrink-0" />
                  HTML am besten als eigenständige Datei (Bilder/CSS eingebettet) — lokal gewählte Dateien werden aufs Netzlaufwerk kopiert, damit der Kiosk sie erreicht.
                </p>
                {pushUploading && (
                  <p className="text-[10px] text-blue-400 flex items-center gap-1 mt-1">
                    <Loader size={10} className="animate-spin shrink-0" /> Datei wird aufs Netzlaufwerk hochgeladen…
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium block mb-1">Titel (optional)</label>
                  <input
                    value={pushTitle}
                    onChange={e => setPushTitle(e.target.value)}
                    placeholder="z.B. Wartungshinweis"
                    className="w-full px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium block mb-1">Zoom</label>
                  <select
                    value={pushZoom}
                    onChange={e => setPushZoom(Number(e.target.value))}
                    className="w-full px-2 py-2 rounded-md bg-background border border-border text-sm text-foreground"
                  >
                    {[0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0].map(z => (
                      <option key={z} value={z}>{Math.round(z * 100)}%</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground font-medium block mb-1">Anzeigedauer</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0}
                    value={pushDurationMin}
                    onChange={e => setPushDurationMin(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 px-2.5 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <span className="text-xs text-muted-foreground">Minuten</span>
                  <span className="text-[10px] text-muted-foreground ml-1">0 = bis du es manuell beendest</span>
                </div>
              </div>

              {pushError && (
                <p className="text-[11px] text-red-400 flex items-center gap-1">
                  <AlertTriangle size={11} className="shrink-0" /> {pushError}
                </p>
              )}
            </div>

            <div className="flex justify-between items-center gap-2 mt-5">
              {activePushes[pushTarget.username] ? (
                <button
                  onClick={() => doStopPush(pushTarget.username, pushTarget.displayUsername)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                >
                  <Square size={13} />Laufende Anzeige beenden
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setPushTarget(null)} disabled={pushing}
                  className="px-3 py-2 rounded-md text-sm text-muted-foreground border border-border hover:bg-muted/30 disabled:opacity-50">
                  Abbrechen
                </button>
                <button onClick={doPush} disabled={pushing || pushUploading || !pushUrl.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                  {pushing ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}Jetzt anzeigen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <Eye size={14} className="text-blue-400 shrink-0" />
                <p className="text-sm font-medium text-foreground truncate">{preview.title || preview.url}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-xs text-muted-foreground hover:text-foreground">Schließen</button>
            </div>
            <iframe src={slideSrcUrl(preview.url)} className="flex-1 w-full bg-background" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source, username }: { source: StorageMode | 'empty'; username?: string }) {
  if (source === 'user') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300">
        <UsersIcon size={11} />Per-User Konfig{username ? ` (${username})` : ''}
      </span>
    )
  }
  if (source === 'central') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300">
        <Cloud size={11} />Zentral (alle Nutzer)
      </span>
    )
  }
  if (source === 'local') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-200">
        <HardDrive size={11} />Lokal (nur dieser Rechner)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted/30 border border-border text-muted-foreground">
      Keine Konfiguration
    </span>
  )
}

// ── Master-admin: kiosk clients overview ─────────────────────────────────────

interface KioskClientsProps {
  clients: ListedClient[]
  overrides: { username: string; lastModified: string; modifiedBy: string; slideCount: number }[]
  editingFor: string | null
  loading: boolean
  showOfflineDropdown: boolean
  setShowOfflineDropdown: (v: boolean) => void
  onRefresh: () => void
  onEdit: (username: string) => void
  onClearOverride: (username: string) => void
  activePushes: Record<string, RemotePush | null>
  onPush: (client: ListedClient) => void
  onStopPush: (username: string, displayName: string) => void
  meta: Record<string, KioskMeta>
  myKiosks: Set<string>
  onSetMeta: (username: string, patch: Partial<KioskMeta>) => Promise<void>
  onToggleMine: (username: string) => void
}

function KioskClients({
  clients, overrides, editingFor, loading, showOfflineDropdown,
  setShowOfflineDropdown, onRefresh, onEdit, onClearOverride,
  activePushes, onPush, onStopPush,
  meta, myKiosks, onSetMeta, onToggleMine,
}: KioskClientsProps) {
  const [onlyMine, setOnlyMine] = useState(false)
  const [metaEdit, setMetaEdit] = useState<string | null>(null)
  const [nameVal, setNameVal] = useState('')
  const [noteVal, setNoteVal] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)

  function openMetaEditor(username: string) {
    const m = meta[username.toLowerCase()]
    setNameVal(m?.friendlyName || '')
    setNoteVal(m?.note || '')
    setMetaEdit(username)
  }
  async function saveMetaEditor(username: string) {
    setSavingMeta(true)
    try { await onSetMeta(username, { friendlyName: nameVal.trim(), note: noteVal.trim() }); setMetaEdit(null) }
    finally { setSavingMeta(false) }
  }

  const online = clients.filter(c => c.online && (!onlyMine || myKiosks.has(c.username)))
  // "Offline-Dropdown" = all overrides whose user is not currently online
  const onlineUsers = new Set(online.map(c => c.username))
  const offlineOverrides = overrides.filter(o => !onlineUsers.has(o.username.toLowerCase()))
  // Also offline-heartbeat entries (player crashed / restarted machine)
  const offlineHeartbeats = clients.filter(c => !c.online)

  return (
    <Card title="Kiosk-Clients" icon={<UsersIcon size={15} />} subtitle="Live-Status aller laufenden Player + Override-Verwaltung">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex-1">
            Online ({online.length})
          </p>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer" title="Nur meine zugewiesenen Kioske zeigen">
            <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} className="accent-primary" />
            <Star size={11} className="text-amber-400" />Nur meine
          </label>
          <button onClick={onRefresh} disabled={loading}
            className="p-1 rounded border border-border hover:bg-accent text-muted-foreground" title="Aktualisieren">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {online.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Aktuell keine Player online.</p>
        ) : (
          <div className="space-y-1">
            {online.map(c => {
              const hasOverride = overrides.some(o => o.username.toLowerCase() === c.username)
              const isActive = editingFor?.toLowerCase() === c.username
              const livePush = activePushes[c.username]
              const m = meta[c.username]
              const dispName = kioskDisplayName(c.username, meta, c.displayUsername)
              const mine = myKiosks.has(c.username)
              return (
                <div key={c.username} className={`rounded-md border ${isActive ? 'border-purple-500/50 bg-purple-500/5' : livePush ? 'border-blue-500/50 bg-blue-500/5' : 'border-border bg-muted/10'}`}>
                  <div className="flex items-center gap-2 p-2">
                    <button onClick={() => onToggleMine(c.username)} title={mine ? 'Aus „Meine Kioske" entfernen' : 'Zu „Meine Kioske" hinzufügen'} className="shrink-0 p-0.5 rounded hover:bg-accent/30">
                      <Star size={13} className={mine ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'} />
                    </button>
                    <Wifi size={12} className="text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {dispName} <span className="text-muted-foreground font-mono">@ {c.hostname}</span>
                        {m?.friendlyName && m.friendlyName.trim() && <span className="text-[10px] text-muted-foreground font-normal"> · {c.displayUsername}</span>}
                      </p>
                      {m?.note && m.note.trim() && (
                        <p className="text-[10px] text-amber-300/90 truncate flex items-center gap-1" title={m.note}><StickyNote size={10} className="shrink-0" />{m.note}</p>
                      )}
                      {c.playlistName && (
                        <p className="text-[10px] text-blue-300 truncate flex items-center gap-1">
                          <ListVideo size={10} className="shrink-0" />Playlist: {c.playlistName}
                        </p>
                      )}
                      {livePush ? (
                        <p className="text-[10px] text-blue-300 truncate flex items-center gap-1">
                          <Tv size={10} className="shrink-0" />Live: {livePush.title || livePush.url}
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {c.slideTitle || c.slideUrl || 'kein Slide'} · Slide {((c.currentSlideIndex ?? 0) + 1)}/{c.totalSlides ?? 0} · {formatLastSeen(c.lastSeen)}
                        </p>
                      )}
                    </div>
                    {hasOverride && (
                      <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">Override</span>
                    )}
                    {livePush && (
                      <button onClick={() => onStopPush(c.username, c.displayUsername)}
                        title="Live-Anzeige beenden — normale Präsentation läuft wieder"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20">
                        <Square size={10} />Stop
                      </button>
                    )}
                    <button onClick={() => onPush(c)}
                      title="HTML/Seite/Bild sofort auf diesem Kiosk anzeigen"
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20">
                      <Tv size={11} />Anzeigen
                    </button>
                    <button onClick={() => onEdit(c.username)}
                      className="px-2 py-1 text-[11px] rounded border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20">
                      Bearbeiten
                    </button>
                    <button onClick={() => (metaEdit === c.username ? setMetaEdit(null) : openMetaEditor(c.username))}
                      title="Übergeordneten Namen / Notiz bearbeiten"
                      className="p-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                      <StickyNote size={12} />
                    </button>
                    {hasOverride && (
                      <button onClick={() => onClearOverride(c.username)}
                        title="Override für diesen Kiosk löschen"
                        className="p-1 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/40">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                  {metaEdit === c.username && (
                    <div className="px-2 pb-2 pt-1 border-t border-border/60 space-y-1.5">
                      <input value={nameVal} onChange={e => setNameVal(e.target.value)} placeholder="Übergeordneter Name (z. B. Halle Flur – Infoscreen)"
                        className="w-full px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                      <input value={noteVal} onChange={e => setNoteVal(e.target.value)} placeholder="Notiz zu diesem Kiosk…"
                        className="w-full px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setMetaEdit(null)} className="px-2 py-1 text-[11px] rounded text-muted-foreground hover:bg-accent/40">Abbrechen</button>
                        <button onClick={() => saveMetaEditor(c.username)} disabled={savingMeta}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                          {savingMeta ? <Loader size={11} className="animate-spin" /> : <Check size={11} />}Speichern
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="pt-2 border-t border-border">
          <button onClick={() => setShowOfflineDropdown(!showOfflineDropdown)}
            className="w-full flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-accent/20">
            <span className="flex items-center gap-1.5">
              <WifiOff size={12} />Offline-Kioske / weitere Overrides ({offlineHeartbeats.length + offlineOverrides.length})
            </span>
            <span className="text-[10px]">{showOfflineDropdown ? '▲' : '▼'}</span>
          </button>
          {showOfflineDropdown && (
            <div className="mt-2 space-y-1">
              {offlineHeartbeats.length === 0 && offlineOverrides.length === 0 && (
                <p className="text-xs text-muted-foreground italic text-center py-2">Keine bekannten Kioske.</p>
              )}
              {offlineHeartbeats.map(c => {
                const hasOverride = overrides.some(o => o.username.toLowerCase() === c.username)
                return (
                  <div key={`hb-${c.username}`} className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/5">
                    <WifiOff size={12} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {c.displayUsername} <span className="text-muted-foreground font-mono">@ {c.hostname}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">Zuletzt online: {formatLastSeen(c.lastSeen)}</p>
                    </div>
                    {hasOverride && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">Override</span>}
                    <button onClick={() => onEdit(c.username)}
                      className="px-2 py-1 text-[11px] rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground">
                      Bearbeiten
                    </button>
                  </div>
                )
              })}
              {offlineOverrides.map(o => (
                <div key={`ov-${o.username}`} className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/5">
                  <UsersIcon size={12} className="text-purple-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{o.username}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Override · {o.slideCount} Slide{o.slideCount === 1 ? '' : 's'} · {o.lastModified ? new Date(o.lastModified).toLocaleString('de-DE') : 'unbekannt'}
                    </p>
                  </div>
                  <button onClick={() => onEdit(o.username)}
                    className="px-2 py-1 text-[11px] rounded border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20">
                    Bearbeiten
                  </button>
                  <button onClick={() => onClearOverride(o.username)}
                    title="Override löschen"
                    className="p-1 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/40">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Datetime helpers (für Rotation: <input type="datetime-local"> ↔ ISO) ─────

function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  if (!iso || isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function localInputToIso(v: string): string {
  const d = new Date(v)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function formatIntervalHours(h: number): string {
  return h % 24 === 0 ? `${h / 24} Tag${h / 24 === 1 ? '' : 'e'}` : `${h} Std.`
}

const MEDIA_FILE_FILTERS = [
  { name: 'HTML, Bilder & PDFs', extensions: ['html', 'htm', 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'] },
  { name: 'HTML',           extensions: ['html', 'htm'] },
  { name: 'Bilder',         extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'] },
  { name: 'PDF',            extensions: ['pdf'] },
  { name: 'Alle Dateien',   extensions: ['*'] },
]

// ── Single slide row ─────────────────────────────────────────────────────────

interface SlideRowProps {
  slide: Slide
  index: number
  onPatch: (patch: Partial<Slide>) => void
  onDelete: () => void
  onPreview: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: () => void
  isDragSource: boolean
}

function SlideRow({ slide, index, onPatch, onDelete, onPreview, onDragStart, onDragEnd, onDrop, isDragSource }: SlideRowProps) {
  const [durationUnit, setDurationUnit] = useState<'s' | 'm'>(
    slide.durationSec >= 60 && slide.durationSec % 60 === 0 ? 'm' : 's'
  )
  const displayedDuration = durationUnit === 'm' ? slide.durationSec / 60 : slide.durationSec

  function updateDuration(val: number, unit: 's' | 'm') {
    const sec = unit === 'm' ? val * 60 : val
    onPatch({ durationSec: Math.max(1, Math.round(sec)) })
  }

  const mediaType = detectSlideMediaType(slide.url)
  const isValidUrl = mediaType !== 'unknown' || slide.url.trim() === ''

  // Upload state: picked local files get copied onto the network share so
  // every PC (and every kiosk player) can load them — a local C:\ path would
  // only render on the machine it was picked on (black screen everywhere else).
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  async function pickFile() {
    let path: string | null = null
    try {
      path = await api().openFileDialog(MEDIA_FILE_FILTERS)
    } catch { /* user cancelled */ }
    if (!path) return

    setUploadError('')
    // Already on a network share → directly usable by all PCs
    if (!isLocalDrivePath(path)) {
      onPatch({ url: withPdfViewParams(path) })
      return
    }
    setUploading(true)
    try {
      const res = await uploadMediaToShare(path)
      if (res.ok) {
        onPatch({ url: withPdfViewParams(res.uncPath) })
      } else {
        onPatch({ url: path })
        setUploadError(`Upload aufs Netzlaufwerk fehlgeschlagen (${res.error}). Die Folie zeigt die Datei nur auf diesem PC an.`)
      }
    } finally {
      setUploading(false)
    }
  }

  // ── Rotation (Wechsel-Inhalte) ──
  const rotation = slide.rotation
  const [showRotation, setShowRotation] = useState(false)
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null)
  const [rotUnit, setRotUnit] = useState<'h' | 'd'>(
    rotation && rotation.intervalHours % 24 === 0 ? 'd' : 'h'
  )
  const displayedInterval = rotation
    ? (rotUnit === 'd' ? rotation.intervalHours / 24 : rotation.intervalHours)
    : 2
  const rotNow = new Date()
  const activeIdx = activeRotationIndex(slide, rotNow)
  const nextSwitch = nextRotationSwitch(slide, rotNow)

  function defaultRotation(): SlideRotation {
    return { intervalHours: 48, anchorIso: new Date().toISOString(), variants: [] }
  }

  function patchRotation(patch: Partial<SlideRotation>) {
    onPatch({ rotation: { ...(rotation ?? defaultRotation()), ...patch } })
  }

  function addVariant() {
    const rot = rotation ?? defaultRotation()
    onPatch({ rotation: { ...rot, variants: [...rot.variants, makeNewVariant()] } })
    setShowRotation(true)
  }

  function patchVariant(id: string, patch: Partial<SlideVariant>) {
    if (!rotation) return
    onPatch({ rotation: { ...rotation, variants: rotation.variants.map(v => v.id === id ? { ...v, ...patch } : v) } })
  }

  function deleteVariant(id: string) {
    if (!rotation) return
    const rest = rotation.variants.filter(v => v.id !== id)
    onPatch({ rotation: rest.length > 0 ? { ...rotation, variants: rest } : undefined })
  }

  function updateRotInterval(val: number, unit: 'h' | 'd') {
    patchRotation({ intervalHours: Math.max(1, Math.round(unit === 'd' ? val * 24 : val)) })
  }

  async function pickVariantFile(id: string) {
    let path: string | null = null
    try {
      path = await api().openFileDialog(MEDIA_FILE_FILTERS)
    } catch { /* user cancelled */ }
    if (!path) return
    setUploadError('')
    if (!isLocalDrivePath(path)) {
      patchVariant(id, { url: withPdfViewParams(path) })
      return
    }
    setUploadingVariantId(id)
    try {
      const res = await uploadMediaToShare(path)
      if (res.ok) {
        patchVariant(id, { url: withPdfViewParams(res.uncPath) })
      } else {
        patchVariant(id, { url: path })
        setUploadError(`Upload aufs Netzlaufwerk fehlgeschlagen (${res.error}). Der Wechsel-Inhalt ist nur auf diesem PC sichtbar.`)
      }
    } finally {
      setUploadingVariantId(null)
    }
  }

  const TypeIcon = mediaType === 'image' ? ImageIcon : mediaType === 'pdf' ? FileText : Globe

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      className={`group flex items-start gap-3 p-3 rounded-lg border ${
        isDragSource ? 'border-blue-500/40 bg-blue-500/5 opacity-50' : 'border-border bg-card hover:border-border/70'
      }`}
    >
      <div className="flex flex-col items-center gap-1 pt-1 cursor-grab text-muted-foreground group-hover:text-foreground">
        <GripVertical size={16} />
        <span className="text-[10px] font-semibold">{index + 1}</span>
      </div>

      <div className="flex-1 min-w-0 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-2">
        {/* Title + URL */}
        <div className="space-y-1.5">
          <input
            value={slide.title}
            onChange={e => onPatch({ title: e.target.value })}
            placeholder="Titel (optional)"
            className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <div className="flex gap-1">
            <div className="relative flex-1">
              <input
                value={slide.url}
                onChange={e => onPatch({ url: e.target.value })}
                placeholder="https://... oder \\server\... oder C:\..."
                className={`w-full pl-7 pr-14 py-1.5 rounded-md bg-background border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 ${
                  slide.url && !isValidUrl ? 'border-red-500/40 focus:ring-red-500/40' : 'border-border focus:ring-primary/50'
                }`}
              />
              <TypeIcon size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 ${
                mediaType === 'image' ? 'text-purple-400' :
                mediaType === 'pdf' ? 'text-red-400' :
                mediaType === 'url' ? 'text-blue-400' :
                'text-muted-foreground'
              }`} />
              {mediaType !== 'unknown' && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase px-1 rounded ${
                  mediaType === 'image' ? 'bg-purple-500/15 text-purple-300' :
                  mediaType === 'pdf' ? 'bg-red-500/15 text-red-300' :
                  'bg-blue-500/15 text-blue-300'
                }`}>
                  {mediaType === 'url' ? 'WEB' : mediaType.toUpperCase()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={pickFile}
              disabled={uploading}
              title="HTML-Datei, Bild oder PDF auswählen — wird automatisch aufs Netzlaufwerk hochgeladen, damit alle PCs es anzeigen können"
              className="px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-50"
            >
              {uploading ? <Loader size={13} className="animate-spin" /> : <Folder size={13} />}
            </button>
          </div>
          {uploading && (
            <p className="text-[10px] text-blue-400 flex items-center gap-1">
              <Loader size={10} className="animate-spin shrink-0" /> Datei wird aufs Netzlaufwerk hochgeladen…
            </p>
          )}
          {uploadError && (
            <p className="text-[10px] text-red-400 flex items-center gap-1">
              <AlertTriangle size={10} className="shrink-0" /> {uploadError}
            </p>
          )}
          {!uploading && !uploadError && isLocalDrivePath(slide.url) && (
            <p className="text-[10px] text-amber-400 flex items-center gap-1">
              <AlertTriangle size={10} className="shrink-0" /> Lokaler Pfad — andere PCs zeigen hier ein Schwarzbild. Datei über den Ordner-Button wählen, dann wird sie automatisch aufs Netzlaufwerk kopiert.
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {/* Duration */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Dauer</label>
            <div className="flex gap-1">
              <input
                type="number" min={1}
                value={displayedDuration}
                onChange={e => updateDuration(Number(e.target.value) || 1, durationUnit)}
                className="w-16 px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <select
                value={durationUnit}
                onChange={e => {
                  const u = e.target.value as 's' | 'm'
                  setDurationUnit(u)
                  updateDuration(displayedDuration, u)
                }}
                className="px-1.5 py-1 rounded-md bg-background border border-border text-xs text-foreground"
              >
                <option value="s">sek</option>
                <option value="m">min</option>
              </select>
            </div>
          </div>

          {/* Zoom */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Zoom</label>
            <select
              value={slide.zoom}
              onChange={e => onPatch({ zoom: Number(e.target.value) })}
              className="w-full px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground"
            >
              {[0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0].map(z => (
                <option key={z} value={z}>{Math.round(z * 100)}%</option>
              ))}
            </select>
          </div>

          {/* Auto-Refresh */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Auto-Refresh</label>
            <div className="flex gap-1">
              <input
                type="number" min={0}
                value={slide.refreshIntervalSec}
                onChange={e => onPatch({ refreshIntervalSec: Math.max(0, Number(e.target.value) || 0) })}
                className="w-16 px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                title="0 = kein Auto-Refresh"
              />
              <span className="text-[10px] text-muted-foreground self-center">sek</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Wechsel-Inhalte (zeitgesteuerte Rotation) ── */}
      <div className="rounded-md border border-border/70 bg-background/40">
        <button
          type="button"
          onClick={() => setShowRotation(v => !v)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Repeat size={11} className={rotation ? 'text-emerald-400 shrink-0' : 'shrink-0'} />
          <span className="font-medium shrink-0">Wechsel-Inhalte</span>
          {rotation ? (
            <span className="text-[10px] text-emerald-400 truncate">
              {rotation.variants.length + 1} Inhalte · wechselt alle {formatIntervalHours(rotation.intervalHours)} · aktiv: {activeIdx === 0 ? 'Haupt-Inhalt' : `Variante ${activeIdx}`}
            </span>
          ) : (
            <span className="text-[10px] truncate">aus — Folie zeigt immer dieselbe URL</span>
          )}
          <span className="ml-auto shrink-0">{showRotation ? '▴' : '▾'}</span>
        </button>

        {showRotation && (
          <div className="px-2.5 pb-2.5 space-y-2 border-t border-border/50 pt-2">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Hinterlege weitere Websites/PDFs hinter dieser Folie. Der angezeigte Inhalt wechselt automatisch im
              eingestellten Rhythmus: Haupt-Inhalt → Variante 1 → Variante 2 → … → wieder Haupt-Inhalt.
              Der Wechsel wird auf dem Anzeige-PC selbst berechnet — er funktioniert also auch, wenn dieser PC hier aus ist.
            </p>

            {rotation && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Wechselt alle</label>
                  <div className="flex gap-1">
                    <input
                      type="number" min={1}
                      value={displayedInterval}
                      onChange={e => updateRotInterval(Number(e.target.value) || 1, rotUnit)}
                      className="w-16 px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <select
                      value={rotUnit}
                      onChange={e => {
                        const u = e.target.value as 'h' | 'd'
                        setRotUnit(u)
                        updateRotInterval(displayedInterval, u)
                      }}
                      className="px-1.5 py-1 rounded-md bg-background border border-border text-xs text-foreground"
                    >
                      <option value="h">Stunden</option>
                      <option value="d">Tage</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Start (Datum + Uhrzeit)</label>
                  <input
                    type="datetime-local"
                    value={isoToLocalInput(rotation.anchorIso)}
                    onChange={e => patchRotation({ anchorIso: localInputToIso(e.target.value) })}
                    className="px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                {nextSwitch && (
                  <p className="text-[10px] text-muted-foreground pb-1.5">
                    Nächster Wechsel:{' '}
                    <span className="text-foreground font-medium">
                      {nextSwitch.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr
                    </span>
                  </p>
                )}
              </div>
            )}

            {rotation && (
              <div className="space-y-1.5">
                {/* Haupt-Inhalt (= URL der Folie oben) */}
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-[11px] ${activeIdx === 0 ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border/60'}`}>
                  <span className="text-[10px] font-semibold text-muted-foreground w-12 shrink-0">Haupt</span>
                  <span className="truncate text-muted-foreground flex-1">{slide.url || '— URL oben bei der Folie eintragen —'}</span>
                  {activeIdx === 0 && (
                    <span className="text-[9px] font-semibold uppercase px-1 rounded bg-emerald-500 text-black shrink-0">Aktiv</span>
                  )}
                </div>
                {rotation.variants.map((v, vi) => (
                  <div key={v.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${activeIdx === vi + 1 ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border/60'}`}>
                    <span className="text-[10px] font-semibold text-muted-foreground w-12 shrink-0">Var. {vi + 1}</span>
                    <input
                      value={v.title}
                      onChange={e => patchVariant(v.id, { title: e.target.value })}
                      placeholder="Titel (optional)"
                      className="w-28 px-2 py-1 rounded-md bg-background border border-border text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 shrink-0"
                    />
                    <input
                      value={v.url}
                      onChange={e => patchVariant(v.id, { url: e.target.value })}
                      placeholder="https://... oder PDF/Bild über den Ordner-Button wählen"
                      className="flex-1 min-w-0 px-2 py-1 rounded-md bg-background border border-border text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => pickVariantFile(v.id)}
                      disabled={uploadingVariantId === v.id}
                      title="Bild oder PDF auswählen — wird automatisch aufs Netzlaufwerk hochgeladen"
                      className="p-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-50 shrink-0"
                    >
                      {uploadingVariantId === v.id ? <Loader size={11} className="animate-spin" /> : <Folder size={11} />}
                    </button>
                    {activeIdx === vi + 1 && (
                      <span className="text-[9px] font-semibold uppercase px-1 rounded bg-emerald-500 text-black shrink-0">Aktiv</span>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteVariant(v.id)}
                      title="Wechsel-Inhalt entfernen"
                      className="p-1 rounded-md border border-border text-muted-foreground hover:text-red-400 hover:bg-red-500/10 shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addVariant}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Plus size={11} /> Wechsel-Inhalt hinzufügen
            </button>
          </div>
        )}
      </div>
      </div>

      {/* Right column: actions */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={slide.active} onChange={e => onPatch({ active: e.target.checked })}
            className="rounded accent-primary" />
          Aktiv
        </label>
        <div className="flex gap-1 mt-1">
          <button onClick={onPreview} disabled={!isValidUrl}
            title="Vorschau"
            className={`p-1.5 rounded-md border ${isValidUrl ? 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/30' : 'border-border text-muted-foreground/40 cursor-not-allowed'}`}>
            <Eye size={13} />
          </button>
          <button onClick={() => window.electronAPI?.openExternal(slide.url)} disabled={!isValidUrl}
            title="Im Browser öffnen"
            className={`p-1.5 rounded-md border ${isValidUrl ? 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/30' : 'border-border text-muted-foreground/40 cursor-not-allowed'}`}>
            <ExternalLink size={13} />
          </button>
          <button onClick={onDelete} title="Löschen"
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
