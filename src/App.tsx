import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ask } from '@tauri-apps/plugin-dialog'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LangProvider } from './lib/locale'
import type { Lang } from './lib/i18n'
import { getT } from './lib/i18n'
import { AboutDialog } from './components/AboutDialog'
import { ChangelogDialog } from './components/ChangelogDialog'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { SidePanel } from './components/ui/SidePanel'
import type { ToastNotice } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import type { PendingUpdate } from './components/UpdateBanner'
import { AdjustmentsPanel } from './components/AdjustmentsPanel'
import { FiltersPanel } from './components/FiltersPanel'
import { Canvas } from './components/Canvas'
import { CanvasResizeDialog } from './components/CanvasResizeDialog'
import { CropBar } from './components/CropBar'
import type { CropStore } from './components/CropBar'
import { EyedropperControls } from './components/EyedropperControls'
import { InpaintingControls } from './components/InpaintingControls'
import { ExifPanel } from './components/ExifPanel'
import { ExportDialog } from './components/ExportDialog'
import { FlipControls } from './components/FlipControls'
import { HistoryPanel } from './components/HistoryPanel'
import { ResizeDialog } from './components/ResizeDialog'
import { RotationControls } from './components/RotationControls'
import { TabBar } from './components/TabBar'
import { Toolbar } from './components/Toolbar'
import { ZoomSelect } from './components/ZoomSelect'
import type { CropApi } from './hooks/useCrop'
import { useImageEditor } from './hooks/useImageEditor'
import { usePreview } from './hooks/usePreview'
import { isModalOpen, isTypingTarget } from './lib/dom'
import { APP_VERSION, LAST_SEEN_KEY } from './lib/version'
import { translateError } from './lib/errors'
import { MOD } from './lib/platform'
import type { ExifField, ResetTool } from './lib/tauri'
import {
  setMenuGridSize,
  setMenuHasImage,
  setMenuLanguage,
  setMenuRecentFiles,
  setMenuTheme,
  setMenuUndoRedo,
} from './lib/tauri'
import { GRID_SIZES, loadPrefs, savePrefs, THEMES, type Prefs, type Theme } from './lib/prefs'
import {
  addRecentFile,
  clearRecentFiles,
  getRecentFiles,
  removeRecentFile,
} from './lib/recentFiles'
import type { CropRect, MaskBox, PickedColor } from './types'

const ZOOM_STEP = 1.25
const ZOOM_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
const MASK_THRESHOLD = 10

/** Les panneaux latéraux : un seul est ouvert à la fois. */
type PanelName = 'adjustments' | 'filters' | 'history' | 'exif'

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

/** Base64 d'un tableau d'octets, par tranches pour ne pas dépasser la pile d'appels. */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

/**
 * Masque peint → boîte englobante des pixels peints et leurs valeurs d'alpha. Seule cette
 * boîte est transmise au backend, pas une image entière de zéros. `null` si rien n'est peint.
 */
function maskToBox(canvas: HTMLCanvasElement): MaskBox | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > MASK_THRESHOLD) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const alpha = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) alpha[y * w + x] = data[((y0 + y) * width + x0 + x) * 4 + 3]
  }
  return { b64: toBase64(alpha), x: x0, y: y0, width: w, height: h }
}

export default function App() {
  const editor = useImageEditor()
  const {
    loadExif,
    handleStripExif,
    handleOpenByPaths,
    handleCopyToClipboard,
    enterEyedropperMode,
    exitEyedropperMode,
    enterInpaintingMode,
    exitInpaintingMode,
    handleInpaint,
    tabs,
    activeTabId,
    image,
    mode,
    isLoading,
    error,
    openFailures,
    zoom,
    history,
    historyIndex,
    canUndo,
    canRedo,
    handleOpen,
    handleCropApply,
    handleFlip,
    handleResize,
    handleCanvasResize,
    handleRotate,
    handleExport,
    handleUndo,
    handleRedo,
    handleGotoHistory,
    setActiveTab,
    enterCropMode,
    exitCropMode,
    enterRotateMode,
    exitRotateMode,
    setZoom,
    clearError,
    clearOpenFailures,
    handleCommand,
    handleResetToOriginal,
    handleResetTool,
  } = editor

  const [exportOpen, setExportOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [canvasResizeOpen, setCanvasResizeOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutVersion, setAboutVersion] = useState('')
  const [updateNotice, setUpdateNotice] = useState<ToastNotice | null>(null)
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [exifFields, setExifFields] = useState<ExifField[]>([])
  const [exifLoading, setExifLoading] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [showFlipBar, setShowFlipBar] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs())
  const [recentFiles, setRecentFiles] = useState<string[]>(() => getRecentFiles())
  const [pickedColor, setPickedColor] = useState<PickedColor | null>(null)
  const [pickedColorResult, setPickedColorResult] = useState<PickedColor | null>(null)
  // One side panel at a time, opened to the right of the tool sidebar, as in LightCutVidz
  const [sidePanel, setSidePanel] = useState<PanelName | null>(null)
  const [rotatePreview, setRotatePreview] = useState<{ degrees: number; src: string } | null>(null)
  const showAdjustments = sidePanel === 'adjustments'
  const showFilters = sidePanel === 'filters'
  const showHistory = sidePanel === 'history'
  const showExif = sidePanel === 'exif'
  const [brushSize, setBrushSize] = useState(30)
  const [maskClearSignal, setMaskClearSignal] = useState(0)
  const [maskDirty, setMaskDirty] = useState(false)
  const [fitSignal, setFitSignal] = useState(0)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const cropStore = useRef<CropStore>({ rect: { x: 0, y: 0, width: 0, height: 0 }, listener: null })
  const cropApiRef = useRef<CropApi | null>(null)
  const seenTabs = useRef(new Set<string>())
  const clearUpdateNotice = useCallback(() => setUpdateNotice(null), [])
  const updateRef = useRef<Awaited<ReturnType<typeof check>>>(null)

  const lang: Lang = prefs.language ?? 'en'
  const t = getT(lang)
  const { previewSrc, requestPreview } = usePreview(activeTabId)

  /** Ferme l'outil ouvert, quel qu'il soit : un seul panneau est ouvert à la fois. */
  const closeTools = () => {
    if (mode === 'cropping') exitCropMode()
    else if (mode === 'rotating') exitRotateMode()
    else if (mode === 'eyedropper') exitEyedropperMode()
    else if (mode === 'inpainting') exitInpaintingMode()
    setPickedColorResult(null)
    setShowFlipBar(false)
    setResizeOpen(false)
    setCanvasResizeOpen(false)
    setSidePanel(null)
  }

  const toggleSidePanel = (panel: PanelName) => {
    const wasOpen = sidePanel === panel
    closeTools()
    setSidePanel(wasOpen ? null : panel)
  }

  // Les écouteurs globaux (clavier, menu natif) ne sont enregistrés qu'une fois : ils lisent
  // toujours la dernière version des gestionnaires par cette référence.
  const latest = useRef({ ...editor, prefs, t, tabs, mode, toggleSidePanel })
  useEffect(() => {
    latest.current = { ...editor, prefs, t, tabs, mode, toggleSidePanel }
  })

  // La barre de menu naît en anglais : la redessiner dans la langue retenue
  useEffect(() => {
    setMenuLanguage(prefs.language ?? 'en').catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Le thème choisi s'applique à la page ; « système » laisse la main à `prefers-color-scheme`
  const theme: Theme = prefs.theme ?? 'system'
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    setMenuTheme(theme).catch(() => {})
  }, [theme])

  // Le menu natif suit les récents et l'historique
  useEffect(() => {
    setMenuRecentFiles(recentFiles).catch(() => {})
  }, [recentFiles])
  useEffect(() => {
    setMenuUndoRedo(canUndo, canRedo).catch(() => {})
  }, [canUndo, canRedo])
  useEffect(() => {
    setMenuGridSize(prefs.gridSize).catch(() => {})
  }, [prefs.gridSize])
  const hasImage = !!image
  useEffect(() => {
    setMenuHasImage(hasImage).catch(() => {})
  }, [hasImage])

  /**
   * Cherche une mise à jour. Lancée depuis le menu, elle répond toujours (à jour, échec) ;
   * au démarrage elle reste muette tant qu'il n'y a rien à installer. Une mise à jour
   * trouvée est annoncée avec ses notes, et n'est installée qu'à la demande.
   */
  const runUpdateCheck = useCallback(async (fromMenu = true) => {
    const tr = latest.current.t
    if (fromMenu) setUpdateNotice({ message: tr('update.checking'), type: 'info' })
    try {
      const update = await check()
      if (!update) {
        if (fromMenu)
          setUpdateNotice({ message: tr('update.upToDate', { v: APP_VERSION }), type: 'success' })
        return
      }
      updateRef.current = update
      setUpdateNotice(null)
      setPendingUpdate({ version: update.version, notes: update.body })
    } catch (err) {
      if (fromMenu)
        setUpdateNotice({ message: tr('update.failed', { error: String(err) }), type: 'error' })
    }
  }, [])

  /** Télécharge et installe la mise à jour annoncée, puis relance. */
  const installUpdate = useCallback(async () => {
    const tr = latest.current.t
    const update = updateRef.current
    if (!update) return
    setPendingUpdate(null)
    setUpdateNotice({ message: tr('update.downloading', { v: update.version }), type: 'info' })
    try {
      await update.downloadAndInstall()
      setUpdateNotice({ message: tr('update.installing'), type: 'info' })
      await relaunch()
    } catch (err) {
      setUpdateNotice({ message: tr('update.failed', { error: String(err) }), type: 'error' })
    }
  }, [])

  // Après une mise à jour (et non à la première installation), dire ce qui a changé
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_SEEN_KEY)
      if (last && last !== APP_VERSION) setChangelogOpen(true)
      localStorage.setItem(LAST_SEEN_KEY, APP_VERSION)
    } catch {
      // Stockage indisponible : les nouveautés restent dans Aide ▸ Nouveautés.
    }
  }, [])

  // Au démarrage : une recherche muette
  useEffect(() => {
    void runUpdateCheck(false)
  }, [runUpdateCheck])

  const isDirty = (tab: { historyIndex: number; savedIndex: number }) =>
    tab.historyIndex !== tab.savedIndex

  const confirmDiscard = useCallback(async (message: string) => {
    try {
      return await ask(message, { title: latest.current.t('close.title'), kind: 'warning' })
    } catch {
      return true
    }
  }, [])

  const closeTabChecked = useCallback(
    async (id: string) => {
      const tab = latest.current.tabs.find((x) => x.id === id)
      if (
        tab &&
        isDirty(tab) &&
        !(await confirmDiscard(latest.current.t('close.confirm-tab', { name: tab.label })))
      )
        return
      await latest.current.handleCloseTab(id)
    },
    [confirmDiscard],
  )

  const closeOthersChecked = useCallback(async () => {
    const { tabs: all, activeTabId: keep } = latest.current
    const others = all.filter((x) => x.id !== keep)
    if (others.some(isDirty) && !(await confirmDiscard(latest.current.t('close.confirm-many'))))
      return
    await latest.current.handleCloseOtherTabs()
  }, [confirmDiscard])

  const closeAllChecked = useCallback(async () => {
    if (
      latest.current.tabs.some(isDirty) &&
      !(await confirmDiscard(latest.current.t('close.confirm-many')))
    )
      return
    await latest.current.handleCloseAllTabs()
  }, [confirmDiscard])

  // Fermeture de la fenêtre avec des modifications non exportées
  useEffect(() => {
    let off: (() => void) | undefined
    // L'enregistrement de l'écouteur est asynchrone : si l'effet est déjà nettoyé quand il
    // aboutit (double montage en dev), on le retire aussitôt, sinon la confirmation s'affiche
    // une fois par écouteur resté actif.
    let cancelled = false
    try {
      void getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (latest.current.tabs.some(isDirty)) {
            const ok = await confirmDiscard(latest.current.t('close.confirm-app'))
            if (!ok) event.preventDefault()
          }
        })
        .then((fn) => {
          if (cancelled) fn()
          else off = fn
        })
        .catch(() => {})
    } catch {
      // Hors de Tauri (tests, navigateur) : pas de fenêtre native à surveiller.
    }
    return () => {
      cancelled = true
      off?.()
    }
  }, [confirmDiscard])

  // Menu natif et glisser-déposer
  useEffect(() => {
    const L = latest
    const un = [
      listen<string>('show-about', (event) => {
        setAboutVersion(event.payload)
        setAboutOpen(true)
      }),
      listen('menu-open', () => L.current.handleOpen()),
      listen('menu-close-tab', () => {
        const id = L.current.activeTabId
        if (id) void closeTabChecked(id)
      }),
      listen('menu-close-others', () => closeOthersChecked()),
      listen('menu-close-all', () => closeAllChecked()),
      listen('menu-undo', () => L.current.handleUndo()),
      listen('menu-redo', () => L.current.handleRedo()),
      listen('menu-toggle-history', () => L.current.toggleSidePanel('history')),
      listen('menu-check-updates', () => runUpdateCheck(true)),
      listen('menu-changelog', () => setChangelogOpen(true)),
      listen<string>('menu-open-recent', (event) => L.current.handleOpenByPaths([event.payload])),
      listen('menu-clear-recent', () => {
        clearRecentFiles()
        setRecentFiles([])
      }),
      listen<number>('menu-set-grid', (event) => {
        if (!GRID_SIZES.includes(event.payload)) return
        const updated = { ...L.current.prefs, gridSize: event.payload }
        savePrefs(updated)
        setPrefs(updated)
      }),
      // Quitter passe par la fermeture de la fenêtre, qui prévient des modifications non exportées.
      listen('menu-quit', () => {
        void getCurrentWindow().close()
      }),
      listen<string>('menu-set-theme', (event) => {
        const next = THEMES.includes(event.payload as Theme) ? (event.payload as Theme) : 'system'
        const updated = { ...L.current.prefs, theme: next }
        savePrefs(updated)
        setPrefs(updated)
      }),
      listen('menu-set-language', (event) => {
        const next = event.payload as Lang
        const updated = { ...L.current.prefs, language: next }
        savePrefs(updated)
        setPrefs(updated)
        setMenuLanguage(next).catch(() => {})
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      listen('tauri://drag-drop', (event: any) => {
        const paths: string[] = event.payload?.paths ?? event.payload ?? []
        if (Array.isArray(paths) && paths.length > 0) L.current.handleOpenByPaths(paths)
      }),
    ]
    return () => {
      un.forEach((p) => p.then((fn) => fn()))
    }
  }, [closeTabChecked, closeOthersChecked, closeAllChecked, runUpdateCheck])

  // Fichiers récents : ajoutés à l'ouverture seulement (et non à chaque zoom)
  useEffect(() => {
    let added = false
    for (const tab of tabs) {
      if (seenTabs.current.has(tab.id)) continue
      seenTabs.current.add(tab.id)
      if (tab.image.path) {
        addRecentFile(tab.image.path)
        added = true
      }
    }
    if (added) setRecentFiles(getRecentFiles())
  }, [tabs])

  // Un fichier introuvable ne doit pas rester dans les récents
  useEffect(() => {
    if (openFailures.length === 0) return
    openFailures.forEach((f) => removeRecentFile(f.path))
    setRecentFiles(getRecentFiles())
  }, [openFailures])

  // Raccourcis clavier
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const L = latest.current
      // Dans un champ de saisie ou une boîte de dialogue, les touches appartiennent au champ.
      if (isTypingTarget(e.target) || isModalOpen()) return
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) L.handleRedo()
            else L.handleUndo()
            break
          case 'y':
            e.preventDefault()
            L.handleRedo()
            break
          case '=':
          case '+':
            e.preventDefault()
            L.setZoom((z) => z * ZOOM_STEP)
            break
          case '-':
            e.preventDefault()
            L.setZoom((z) => z / ZOOM_STEP)
            break
          case '0':
            e.preventDefault()
            L.setZoom(1)
            break
          case 'c':
            // Une sélection de texte (valeur EXIF…) garde son Ctrl+C habituel.
            if (!e.shiftKey && !window.getSelection()?.toString()) {
              e.preventDefault()
              L.handleCopyToClipboard()
            }
            break
        }
      } else if (e.key === 'Escape') {
        if (L.mode === 'eyedropper') L.exitEyedropperMode()
        else if (L.mode === 'inpainting') L.exitInpaintingMode()
        else if (L.mode === 'rotating') {
          L.exitRotateMode()
          requestPreview(null)
        }
      } else if (e.key === 'Enter' && L.mode === 'inpainting' && !L.isLoading) {
        e.preventDefault()
        void applyInpaintRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestPreview])

  // Load EXIF when panel opens or tab changes
  useEffect(() => {
    if (!showExif || !activeTabId) {
      if (!activeTabId) setExifFields([])
      return
    }
    // Une réponse arrivée après un changement d'onglet ne doit pas écraser la nouvelle.
    let current = true
    setExifLoading(true)
    loadExif(activeTabId).then((fields) => {
      if (!current) return
      setExifFields(fields)
      setExifLoading(false)
    })
    return () => {
      current = false
    }
  }, [showExif, activeTabId, loadExif])

  useEffect(() => {
    if (mode !== 'eyedropper') setPickedColor(null)
  }, [mode])

  // Les aperçus d'un mode ne survivent pas à sa fermeture
  useEffect(() => {
    if (mode !== 'rotating') requestPreview(null)
  }, [mode, requestPreview])

  const handleColorPickConfirm = (color: PickedColor) => {
    setPickedColorResult(color)
    exitEyedropperMode()
  }

  const onCropMode = () => {
    if (mode === 'cropping') return exitCropMode()
    closeTools()
    enterCropMode()
  }
  const onRotateMode = () => {
    if (mode === 'rotating') return exitRotateMode()
    closeTools()
    enterRotateMode()
  }
  const onEyedropperMode = () => {
    if (mode === 'eyedropper') return exitEyedropperMode()
    const resultOpen = pickedColorResult !== null
    closeTools()
    if (!resultOpen) enterEyedropperMode()
  }
  const onInpaintMode = () => {
    if (mode === 'inpainting') return exitInpaintingMode()
    closeTools()
    setMaskDirty(false)
    enterInpaintingMode()
  }
  const onFlipOpen = () => {
    const wasOpen = showFlipBar
    closeTools()
    setShowFlipBar(!wasOpen)
  }
  const onResizeToggle = () => {
    const wasOpen = resizeOpen
    closeTools()
    setResizeOpen(!wasOpen)
  }
  const onCanvasResizeToggle = () => {
    const wasOpen = canvasResizeOpen
    closeTools()
    setCanvasResizeOpen(!wasOpen)
  }

  const handleInpaintApply = async () => {
    if (!maskCanvasRef.current || !image) return
    const box = maskToBox(maskCanvasRef.current)
    if (!box) return
    await handleInpaint(box)
  }
  const applyInpaintRef = useRef(handleInpaintApply)
  useEffect(() => {
    applyInpaintRef.current = handleInpaintApply
  })

  const handleResetChecked = async () => {
    const ok = await confirmDiscard(t('adj.reset-confirm'))
    if (ok) await handleResetToOriginal()
  }
  /** Réinitialise un seul outil ; il reste annulable, donc pas de confirmation. */
  const resetFor = (tool: ResetTool) => ({
    onReset: async () => {
      const dropped = await handleResetTool(tool)
      if (dropped > 0)
        setUpdateNotice({ message: t('reset.dropped', { n: String(dropped) }), type: 'error' })
    },
    canReset: !!image?.tools?.includes(tool) && !isLoading,
  })

  const pickedHex = pickedColor
    ? `#${[pickedColor.r, pickedColor.g, pickedColor.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    : null

  const failureText =
    openFailures.length > 0
      ? t('open.failed', {
          n: String(openFailures.length),
          list: openFailures.map((f) => `${baseName(f.path)} (${f.error})`).join('; '),
        })
      : null

  return (
    <LangProvider lang={lang}>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Top bar, as in the other apps: the file, Undo, Redo, Open and Export */}
        {image && (
          <TopBar
            name={tabs.find((x) => x.id === activeTabId)?.label ?? ''}
            meta={`${image.width} × ${image.height} px · ${image.format.toUpperCase()}`}
            canUndo={canUndo}
            canRedo={canRedo}
            isLoading={isLoading}
            undoTitle={`${t('a11y.undo')} (${MOD}+Z)`}
            redoTitle={`${t('a11y.redo')} (${MOD}+Shift+Z)`}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onOpen={handleOpen}
            onExport={() => setExportOpen(true)}
          />
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Center column */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelect={setActiveTab}
              onClose={closeTabChecked}
            />

            {pendingUpdate && (
              <UpdateBanner
                update={pendingUpdate}
                lang={lang}
                onInstall={installUpdate}
                onLater={() => setPendingUpdate(null)}
              />
            )}

            {failureText && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-900/40 border-b border-amber-700 text-amber-100 text-sm">
                <span className="flex-1">{failureText}</span>
                <button
                  onClick={clearOpenFailures}
                  className="text-amber-200 hover:text-white transition-colors"
                  aria-label={t('update.dismiss')}
                >
                  ✕
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-900/50 border-b border-red-700 text-red-200 text-sm">
                <span className="flex-1">{translateError(error, t)}</span>
                <button
                  onClick={clearError}
                  className="text-red-300 hover:text-white transition-colors"
                  aria-label={t('a11y.dismiss-error')}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Main content row */}
            <div className="flex flex-1 overflow-hidden">
              <Canvas
                image={image}
                mode={mode}
                zoom={zoom}
                tabId={activeTabId}
                fitSignal={fitSignal}
                previewSrc={previewSrc}
                rotatePreview={rotatePreview}
                showGrid={showGrid}
                gridSize={prefs.gridSize}
                recentFiles={recentFiles}
                onRecentRemove={(path) => {
                  removeRecentFile(path)
                  setRecentFiles(getRecentFiles())
                }}
                onRecentClear={() => {
                  clearRecentFiles()
                  setRecentFiles([])
                }}
                isLoading={isLoading}
                showBusy={sidePanel !== 'adjustments' && sidePanel !== 'filters'}
                onCropApply={handleCropApply}
                onCropCancel={exitCropMode}
                onCropRectChange={(rect: CropRect) => {
                  cropStore.current.rect = rect
                  cropStore.current.listener?.(rect)
                }}
                cropApiRef={cropApiRef}
                onZoomChange={setZoom}
                onOpen={handleOpen}
                onOpenByPaths={handleOpenByPaths}
                onColorPick={setPickedColor}
                onColorPickConfirm={handleColorPickConfirm}
                brushSize={brushSize}
                maskClearSignal={maskClearSignal}
                onMaskCanvasRef={(el) => {
                  maskCanvasRef.current = el
                }}
                onMaskDirtyChange={setMaskDirty}
              />
            </div>

            {/* Status bar */}
            {image && (
              <div className="px-4 py-1 bg-slate-900 border-t border-slate-700 text-xs text-slate-500 flex items-center gap-4 shrink-0">
                <span>
                  {image.width} × {image.height} px
                </span>
                <span>{image.format.toUpperCase()}</span>

                {mode === 'eyedropper' && pickedColor && pickedHex && (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-3.5 h-3.5 rounded-sm border border-slate-600"
                      style={{ background: pickedHex }}
                    />
                    <span className="text-slate-300 font-mono">{pickedHex.toUpperCase()}</span>
                    <span className="text-slate-600">
                      rgb({pickedColor.r}, {pickedColor.g}, {pickedColor.b})
                    </span>
                  </div>
                )}

                <div className="flex-1" />

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setZoom((z) => z / ZOOM_STEP)}
                    className="toolbar-btn px-1.5 py-0.5 text-xs"
                    title={t('zoom.title-out', { mod: MOD })}
                    aria-label={t('a11y.zoom-out')}
                  >
                    −
                  </button>
                  <ZoomSelect zoom={zoom} presets={ZOOM_PRESETS} onChange={setZoom} />
                  <button
                    onClick={() => setZoom((z) => z * ZOOM_STEP)}
                    className="toolbar-btn px-1.5 py-0.5 text-xs"
                    title={t('zoom.title-in', { mod: MOD })}
                    aria-label={t('a11y.zoom-in')}
                  >
                    +
                  </button>
                  <button
                    onClick={() => setFitSignal((s) => s + 1)}
                    className="toolbar-btn px-1.5 py-0.5 text-xs text-slate-500"
                    title={t('a11y.zoom-fit')}
                    aria-label={t('a11y.zoom-fit')}
                  >
                    {t('zoom.fit')}
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="toolbar-btn px-1.5 py-0.5 text-xs text-slate-500"
                    title={t('zoom.title-reset', { mod: MOD })}
                    aria-label={t('a11y.zoom-reset')}
                  >
                    1:1
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar on the right, as in the other apps: only once there is an image, they show
            nothing but their home screen until a file is open. */}
          {image && (
            <Toolbar
              hasImage={!!image}
              mode={mode}
              isLoading={isLoading}
              showFlipBar={showFlipBar}
              onCropMode={onCropMode}
              onRotateMode={onRotateMode}
              onFlipOpen={onFlipOpen}
              resizeOpen={resizeOpen}
              onResizeOpen={onResizeToggle}
              canvasResizeOpen={canvasResizeOpen}
              onCanvasResizeOpen={onCanvasResizeToggle}
              showExif={showExif}
              onToggleExif={() => toggleSidePanel('exif')}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid((g) => !g)}
              showAdjustments={showAdjustments}
              onAdjustmentsOpen={() => toggleSidePanel('adjustments')}
              showFilters={showFilters}
              onFiltersOpen={() => toggleSidePanel('filters')}
              onCopy={handleCopyToClipboard}
              onEyedropperMode={onEyedropperMode}
              onInpaintMode={onInpaintMode}
            />
          )}

          {/* What the tool buttons open: panels to the right of the sidebar, one at a time */}
          {mode === 'cropping' && (
            <SidePanel title={t('toolbar.crop')} {...resetFor('crop')}>
              <CropBar
                store={cropStore}
                apiRef={cropApiRef}
                isLoading={isLoading}
                onApply={handleCropApply}
                onCancel={exitCropMode}
              />
            </SidePanel>
          )}
          {mode === 'rotating' && (
            <SidePanel title={t('toolbar.rotate')} {...resetFor('rotate')}>
              <RotationControls
                onRotate={handleRotate}
                onApplyAngle={(degrees, replace) =>
                  handleCommand({ type: 'rotate', degrees }, { replace })
                }
                onPreviewAngle={(delta) =>
                  setRotatePreview(
                    delta === 0 || !image ? null : { degrees: delta, src: image.preview },
                  )
                }
                historyIndex={historyIndex}
                isLoading={isLoading}
              />
            </SidePanel>
          )}
          {mode === 'inpainting' && (
            <SidePanel title={t('toolbar.inpaint')}>
              <InpaintingControls
                brushSize={brushSize}
                isLoading={isLoading}
                canApply={maskDirty}
                onBrushSizeChange={setBrushSize}
                onClear={() => setMaskClearSignal((s) => s + 1)}
                onCancel={exitInpaintingMode}
                onApply={handleInpaintApply}
              />
            </SidePanel>
          )}
          {(mode === 'eyedropper' || pickedColorResult) && (
            <SidePanel title={t('toolbar.picker')}>
              <EyedropperControls color={mode === 'eyedropper' ? pickedColor : pickedColorResult} />
            </SidePanel>
          )}
          {showFlipBar && (
            <SidePanel title={t('toolbar.flip')} {...resetFor('flip')}>
              <FlipControls
                isLoading={isLoading}
                onFlipH={() => handleFlip('horizontal')}
                onFlipV={() => handleFlip('vertical')}
              />
            </SidePanel>
          )}
          <ResizeDialog
            open={resizeOpen}
            originalWidth={image?.width ?? 0}
            originalHeight={image?.height ?? 0}
            isLoading={isLoading}
            {...resetFor('resize')}
            onResize={async (w, h) => {
              await handleResize(w, h)
              setResizeOpen(false)
            }}
            onClose={() => setResizeOpen(false)}
          />
          <CanvasResizeDialog
            open={canvasResizeOpen}
            originalWidth={image?.width ?? 0}
            originalHeight={image?.height ?? 0}
            isLoading={isLoading}
            {...resetFor('canvas')}
            onResize={async (w, h, anchor, fill) => {
              await handleCanvasResize(w, h, anchor, fill)
              setCanvasResizeOpen(false)
            }}
            onClose={() => setCanvasResizeOpen(false)}
          />

          {/* The panels open to the right of the sidebar */}
          {showAdjustments && (
            <AdjustmentsPanel
              tabId={activeTabId}
              isLoading={isLoading}
              historyIndex={historyIndex}
              onApply={handleCommand}
              onPreview={requestPreview}
              onReset={handleResetChecked}
              canReset={historyIndex > 0}
            />
          )}

          {showFilters && (
            <FiltersPanel
              tabId={activeTabId}
              image={image}
              isLoading={isLoading}
              historyIndex={historyIndex}
              onApply={handleCommand}
              onPreview={requestPreview}
              onReset={handleResetChecked}
              canReset={historyIndex > 0}
            />
          )}

          {showHistory && (
            <HistoryPanel
              history={history}
              currentIndex={historyIndex}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onJump={handleGotoHistory}
              isLoading={isLoading}
            />
          )}

          {showExif && image && (
            <ExifPanel
              tabId={activeTabId}
              fields={exifFields}
              isLoading={exifLoading}
              onStrip={() => (activeTabId ? handleStripExif(activeTabId) : Promise.resolve())}
            />
          )}
        </div>

        {/* Dialogs */}
        <ExportDialog
          open={exportOpen}
          isLoading={isLoading}
          defaultFormat={prefs.defaultExportFormat}
          defaultQuality={prefs.defaultJpegQuality}
          onExport={async (format, quality) => {
            await handleExport(format, quality)
            setExportOpen(false)
          }}
          onClose={() => setExportOpen(false)}
        />
        {updateNotice && <Toast notice={updateNotice} onDone={clearUpdateNotice} />}
        <ChangelogDialog open={changelogOpen} lang={lang} onClose={() => setChangelogOpen(false)} />
        <AboutDialog open={aboutOpen} version={aboutVersion} onClose={() => setAboutOpen(false)} />
      </div>
    </LangProvider>
  )
}
