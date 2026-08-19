import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LangProvider } from './lib/locale'
import type { Lang } from './lib/i18n'
import { AboutDialog } from './components/AboutDialog'
import { AdjustmentsPanel } from './components/AdjustmentsPanel'
import type { AdjustmentCommand } from './components/AdjustmentsPanel'
import { FiltersPanel } from './components/FiltersPanel'
import type { FilterCommand } from './components/FiltersPanel'
import { Canvas } from './components/Canvas'
import { CanvasResizeDialog } from './components/CanvasResizeDialog'
import { CropControls } from './components/CropControls'
import { EyedropperControls } from './components/EyedropperControls'
import { InpaintingControls } from './components/InpaintingControls'
import { ExifPanel } from './components/ExifPanel'
import { ExportDialog } from './components/ExportDialog'
import { FlipControls } from './components/FlipControls'
import { HistoryPanel } from './components/HistoryPanel'
import { PrefsDialog } from './components/PrefsDialog'
import { ResizeDialog } from './components/ResizeDialog'
import { RotationControls } from './components/RotationControls'
import { TabBar } from './components/TabBar'
import { Toolbar } from './components/Toolbar'
import { ZoomSelect } from './components/ZoomSelect'
import type { CropRect } from './types'
import { useImageEditor } from './hooks/useImageEditor'
import type { ExifField } from './lib/tauri'
import { setMenuLanguage } from './lib/tauri'
import { loadPrefs, savePrefs, type Prefs } from './lib/prefs'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getT } from './lib/i18n'
import { addRecentFile, getRecentFiles } from './lib/recentFiles'

const ZOOM_STEP = 1.25
const ZOOM_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

export default function App() {
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
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    setActiveTab,
    enterCropMode,
    exitCropMode,
    enterRotateMode,
    exitRotateMode,
    setZoom,
    clearError,
    handleAdjustBrightnessContrast,
    handleAdjustExposure,
    handleAdjustHueSaturation,
    handleAdjustVibrance,
    handleAdjustLevels,
    handleAdjustCurves,
    handleAdjustWhiteBalance,
    handleAdjustSharpen,
    handleAdjustDenoise,
    handleFilterGrayscale,
    handleFilterSepia,
    handleFilterInvert,
    handleFilterVignette,
    handleFilterGrain,
    handleFilterPixelate,
    handleFilterPosterize,
    handleFilterDuotone,
    handleFilterSketch,
    handleFilterLomo,
    handleFilterVintage,
    handleFilterCool,
    handleFilterWarm,
    handleFilterFade,
    handleFilterDrama,
    handleFilterCrossProcess,
    handleFilterBlurGaussian,
    handleFilterBlurMotion,
    handleFilterBlurRadial,
    handleResetToOriginal,
  } = useImageEditor()

  const [exportOpen, setExportOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [canvasResizeOpen, setCanvasResizeOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutVersion, setAboutVersion] = useState('')
  const [updateNotice, setUpdateNotice] = useState<string | null>(null)
  const [showExif, setShowExif] = useState(false)
  const [exifFields, setExifFields] = useState<ExifField[]>([])
  const [exifLoading, setExifLoading] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showFlipBar, setShowFlipBar] = useState(false)
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 })
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs())
  const [recentFiles, setRecentFiles] = useState<string[]>(() => getRecentFiles())
  const [pickedColor, setPickedColor] = useState<{
    r: number
    g: number
    b: number
    a: number
  } | null>(null)
  const [pickedColorResult, setPickedColorResult] = useState<{
    r: number
    g: number
    b: number
    a: number
  } | null>(null)
  const [showAdjustments, setShowAdjustments] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const previewImgRef = useRef<HTMLImageElement | null>(null)
  const handlePreviewFilterChange = useCallback((filter: string | null) => {
    if (previewImgRef.current) previewImgRef.current.style.filter = filter ?? ''
  }, [])
  const [brushSize, setBrushSize] = useState(30)
  const [maskClearSignal, setMaskClearSignal] = useState(0)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleInpaintApplyRef = useRef<() => Promise<void>>(async () => {})

  const activeTabIdRef = useRef(activeTabId)
  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  // La barre de menu naît en anglais : la redessiner dans la langue retenue
  useEffect(() => {
    setMenuLanguage(prefs.language ?? 'en').catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Télécharge et installe la mise à jour, puis relance. Déclenchée depuis
   * Aide ▸ Rechercher les mises à jour ; avant, cette entrée se contentait
   * d'ouvrir la page des versions. */
  const runUpdateCheck = useCallback(async () => {
    const t = getT(prefs.language ?? 'en')
    setUpdateNotice(t('update.checking'))
    try {
      const update = await check()
      if (!update) {
        setUpdateNotice(t('update.upToDate'))
        return
      }
      setUpdateNotice(t('update.downloading', { v: update.version }))
      await update.downloadAndInstall()
      setUpdateNotice(t('update.installing'))
      await relaunch()
    } catch (err) {
      setUpdateNotice(t('update.failed', { error: String(err) }))
    }
  }, [prefs.language])

  // Tauri menu / native events + drag-drop
  useEffect(() => {
    const unlistenAbout = listen<string>('show-about', (event) => {
      setAboutVersion(event.payload)
      setAboutOpen(true)
    })
    const unlistenOpen = listen('menu-open', () => handleOpen())
    const unlistenCloseTab = listen('menu-close-tab', () => {
      const id = activeTabIdRef.current
      if (id) handleCloseTab(id)
    })
    const unlistenCloseOthers = listen('menu-close-others', () => handleCloseOtherTabs())
    const unlistenCloseAll = listen('menu-close-all', () => handleCloseAllTabs())
    const unlistenUndo = listen('menu-undo', () => handleUndo())
    const unlistenRedo = listen('menu-redo', () => handleRedo())
    const unlistenToggleHistory = listen('menu-toggle-history', () => setShowHistory((s) => !s))
    const unlistenCheckUpdates = listen('menu-check-updates', () => runUpdateCheck())
    const unlistenSetLanguage = listen('menu-set-language', (event) => {
      const lang = event.payload as Lang
      setPrefs((p) => {
        const updated = { ...p, language: lang }
        savePrefs(updated)
        return updated
      })
      setMenuLanguage(lang).catch(() => {})
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unlistenDrop = listen('tauri://drag-drop', (event: any) => {
      const paths: string[] = event.payload?.paths ?? event.payload ?? []
      if (Array.isArray(paths) && paths.length > 0) handleOpenByPaths(paths)
    })

    return () => {
      unlistenAbout.then((fn) => fn())
      unlistenOpen.then((fn) => fn())
      unlistenCloseTab.then((fn) => fn())
      unlistenCloseOthers.then((fn) => fn())
      unlistenCloseAll.then((fn) => fn())
      unlistenUndo.then((fn) => fn())
      unlistenRedo.then((fn) => fn())
      unlistenToggleHistory.then((fn) => fn())
      unlistenCheckUpdates.then((fn) => fn())
      unlistenSetLanguage.then((fn) => fn())
      unlistenDrop.then((fn) => fn())
    }
  }, [
    handleOpen,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    handleUndo,
    handleRedo,
    handleOpenByPaths,
    runUpdateCheck,
  ])

  // Track recent files from newly opened tabs
  useEffect(() => {
    tabs.forEach((t) => {
      if (t.image.path) addRecentFile(t.image.path)
    })
    setRecentFiles(getRecentFiles())
  }, [tabs])

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) handleRedo()
            else handleUndo()
            break
          case 'y':
            e.preventDefault()
            handleRedo()
            break
          case '=':
          case '+':
            e.preventDefault()
            setZoom((z) => z * ZOOM_STEP)
            break
          case '-':
            e.preventDefault()
            setZoom((z) => z / ZOOM_STEP)
            break
          case '0':
            e.preventDefault()
            setZoom(1)
            break
          case 'c':
            if (!e.shiftKey) {
              e.preventDefault()
              handleCopyToClipboard()
            }
            break
        }
      } else if (e.key === 'Escape') {
        if (mode === 'eyedropper') exitEyedropperMode()
        else if (mode === 'inpainting') exitInpaintingMode()
      } else if (e.key === 'Enter' && mode === 'inpainting') {
        e.preventDefault()
        handleInpaintApplyRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleUndo,
    handleRedo,
    setZoom,
    handleCopyToClipboard,
    mode,
    exitEyedropperMode,
    exitInpaintingMode,
  ])

  // Load EXIF when panel opens or tab changes
  useEffect(() => {
    if (!showExif || !activeTabId) {
      if (!activeTabId) setExifFields([])
      return
    }
    setExifLoading(true)
    loadExif(activeTabId).then((fields) => {
      setExifFields(fields)
      setExifLoading(false)
    })
  }, [showExif, activeTabId, loadExif])

  useEffect(() => {
    if (mode !== 'eyedropper') setPickedColor(null)
  }, [mode])

  const handleColorPickConfirm = (color: { r: number; g: number; b: number; a: number }) => {
    setPickedColorResult(color)
    exitEyedropperMode()
  }

  const onCropMode = () => {
    if (mode === 'cropping') {
      exitCropMode()
    } else {
      setShowFlipBar(false)
      enterCropMode()
    }
  }
  const onRotateMode = () => {
    if (mode === 'rotating') {
      exitRotateMode()
    } else {
      setShowFlipBar(false)
      enterRotateMode()
    }
  }
  const onEyedropperMode = () => {
    if (mode === 'eyedropper') {
      exitEyedropperMode()
    } else {
      setShowFlipBar(false)
      setPickedColorResult(null)
      enterEyedropperMode()
    }
  }
  const handleFilterCommand = async (cmd: FilterCommand) => {
    switch (cmd.type) {
      case 'grayscale':
        await handleFilterGrayscale(cmd.rWeight, cmd.gWeight, cmd.bWeight)
        break
      case 'sepia':
        await handleFilterSepia(cmd.intensity)
        break
      case 'invert':
        await handleFilterInvert()
        break
      case 'vignette':
        await handleFilterVignette(cmd.strength, cmd.feather)
        break
      case 'grain':
        await handleFilterGrain(cmd.amount, cmd.monochrome)
        break
      case 'pixelate':
        await handleFilterPixelate(cmd.size)
        break
      case 'posterize':
        await handleFilterPosterize(cmd.levels)
        break
      case 'duotone':
        await handleFilterDuotone(
          cmd.shadowR,
          cmd.shadowG,
          cmd.shadowB,
          cmd.highlightR,
          cmd.highlightG,
          cmd.highlightB,
        )
        break
      case 'sketch':
        await handleFilterSketch()
        break
      case 'lomo':
        await handleFilterLomo(cmd.intensity)
        break
      case 'vintage':
        await handleFilterVintage(cmd.intensity)
        break
      case 'cool':
        await handleFilterCool(cmd.intensity)
        break
      case 'warm':
        await handleFilterWarm(cmd.intensity)
        break
      case 'fade':
        await handleFilterFade(cmd.intensity)
        break
      case 'drama':
        await handleFilterDrama(cmd.intensity)
        break
      case 'cross-process':
        await handleFilterCrossProcess(cmd.intensity)
        break
      case 'blur-gaussian':
        await handleFilterBlurGaussian(cmd.radius)
        break
      case 'blur-motion':
        await handleFilterBlurMotion(cmd.angle, cmd.distance)
        break
      case 'blur-radial':
        await handleFilterBlurRadial(cmd.strength, cmd.samples)
        break
    }
  }

  const handleAdjustmentCommand = async (cmd: AdjustmentCommand) => {
    switch (cmd.type) {
      case 'brightness-contrast':
        await handleAdjustBrightnessContrast(cmd.brightness, cmd.contrast)
        break
      case 'exposure':
        await handleAdjustExposure(cmd.exposure)
        break
      case 'hue-saturation':
        await handleAdjustHueSaturation(cmd.hue, cmd.saturation, cmd.lightness)
        break
      case 'vibrance':
        await handleAdjustVibrance(cmd.vibrance)
        break
      case 'levels':
        await handleAdjustLevels(cmd.inBlack, cmd.inWhite, cmd.gamma, cmd.outBlack, cmd.outWhite)
        break
      case 'curves':
        await handleAdjustCurves(cmd.points)
        break
      case 'white-balance':
        await handleAdjustWhiteBalance(cmd.temperature, cmd.tint)
        break
      case 'sharpen':
        await handleAdjustSharpen(cmd.amount, cmd.radius, cmd.threshold)
        break
      case 'denoise':
        await handleAdjustDenoise(cmd.strength)
        break
    }
  }

  const onFlipOpen = () => {
    if (mode === 'cropping') exitCropMode()
    else if (mode === 'rotating') exitRotateMode()
    else if (mode === 'eyedropper') exitEyedropperMode()
    else if (mode === 'inpainting') exitInpaintingMode()
    setShowFlipBar((b) => !b)
  }

  const onInpaintMode = () => {
    if (mode === 'inpainting') {
      exitInpaintingMode()
    } else {
      setShowFlipBar(false)
      enterInpaintingMode()
    }
  }

  function maskToBase64(canvas: HTMLCanvasElement): string {
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    const { width, height } = canvas
    const data = ctx.getImageData(0, 0, width, height).data
    const alpha = new Uint8Array(width * height)
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
    let binary = ''
    const chunk = 8192
    for (let i = 0; i < alpha.length; i += chunk) {
      binary += String.fromCharCode(...alpha.subarray(i, Math.min(i + chunk, alpha.length)))
    }
    return btoa(binary)
  }

  const handleInpaintApply = async () => {
    if (!maskCanvasRef.current || !image) return
    const b64 = maskToBase64(maskCanvasRef.current)
    if (!b64) return
    await handleInpaint(b64, image.width, image.height)
  }
  handleInpaintApplyRef.current = handleInpaintApply

  const pickedHex = pickedColor
    ? `#${[pickedColor.r, pickedColor.g, pickedColor.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    : null

  return (
    <LangProvider lang={prefs.language ?? 'en'}>
      <div className="flex h-screen overflow-hidden">
        {/* Left sidebar */}
        <Toolbar
          hasImage={!!image}
          mode={mode}
          isLoading={isLoading}
          showFlipBar={showFlipBar}
          onCropMode={onCropMode}
          onRotateMode={onRotateMode}
          onFlipOpen={onFlipOpen}
          onResizeOpen={() => setResizeOpen(true)}
          onCanvasResizeOpen={() => setCanvasResizeOpen(true)}
          onExportOpen={() => setExportOpen(true)}
          showExif={showExif}
          onToggleExif={() => setShowExif((p) => !p)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((g) => !g)}
          showAdjustments={showAdjustments}
          onAdjustmentsOpen={() => {
            setShowAdjustments((p) => !p)
            setShowFilters(false)
          }}
          showFilters={showFilters}
          onFiltersOpen={() => {
            setShowFilters((p) => !p)
            setShowAdjustments(false)
          }}
          onCopy={handleCopyToClipboard}
          onEyedropperMode={onEyedropperMode}
          onInpaintMode={onInpaintMode}
          onPrefsOpen={() => setPrefsOpen(true)}
        />

        {/* Center + right column */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={setActiveTab}
            onClose={handleCloseTab}
          />

          {updateNotice && (
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-700/60 border-b border-slate-600 text-slate-200 text-sm">
              <span className="flex-1">{updateNotice}</span>
              <button
                onClick={() => setUpdateNotice(null)}
                className="text-slate-300 hover:text-white transition-colors"
                aria-label={getT(prefs.language ?? 'en')('update.dismiss')}
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-900/50 border-b border-red-700 text-red-200 text-sm">
              <span className="flex-1">{error}</span>
              <button
                onClick={clearError}
                className="text-red-300 hover:text-white transition-colors"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* Contextual bars */}
          {mode === 'cropping' && (
            <CropControls
              cropRect={cropRect}
              isLoading={isLoading}
              onApply={() => handleCropApply(cropRect)}
              onCancel={exitCropMode}
            />
          )}
          {mode === 'rotating' && (
            <RotationControls
              onRotate={handleRotate}
              onCancel={exitRotateMode}
              isLoading={isLoading}
            />
          )}
          {mode === 'inpainting' && (
            <InpaintingControls
              brushSize={brushSize}
              isLoading={isLoading}
              onBrushSizeChange={setBrushSize}
              onClear={() => setMaskClearSignal((s) => s + 1)}
              onCancel={exitInpaintingMode}
              onApply={handleInpaintApply}
            />
          )}
          {(mode === 'eyedropper' || pickedColorResult) && (
            <EyedropperControls
              color={mode === 'eyedropper' ? pickedColor : pickedColorResult}
              onClose={() => {
                exitEyedropperMode()
                setPickedColorResult(null)
              }}
            />
          )}
          {showFlipBar && (
            <FlipControls
              isLoading={isLoading}
              onFlipH={() => handleFlip('horizontal')}
              onFlipV={() => handleFlip('vertical')}
              onClose={() => setShowFlipBar(false)}
            />
          )}

          {/* Main content row */}
          <div className="flex flex-1 overflow-hidden">
            <Canvas
              image={image}
              mode={mode}
              zoom={zoom}
              showGrid={showGrid}
              gridSize={prefs.gridSize}
              recentFiles={recentFiles}
              isLoading={isLoading}
              onCropApply={handleCropApply}
              onCropCancel={exitCropMode}
              onCropRectChange={setCropRect}
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
              onImageRef={(el) => {
                previewImgRef.current = el
              }}
            />

            {showAdjustments && (
              <AdjustmentsPanel
                tabId={activeTabId}
                isLoading={isLoading}
                onApply={handleAdjustmentCommand}
                onPreviewFilterChange={handlePreviewFilterChange}
                onReset={handleResetToOriginal}
                canReset={historyIndex > 0}
              />
            )}

            {showFilters && (
              <FiltersPanel
                tabId={activeTabId}
                image={image}
                isLoading={isLoading}
                onApply={handleFilterCommand}
                onPreviewFilterChange={handlePreviewFilterChange}
                onReset={handleResetToOriginal}
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
                  title="Zoom out (Ctrl+-)"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <ZoomSelect zoom={zoom} presets={ZOOM_PRESETS} onChange={setZoom} />
                <button
                  onClick={() => setZoom((z) => z * ZOOM_STEP)}
                  className="toolbar-btn px-1.5 py-0.5 text-xs"
                  title="Zoom in (Ctrl+=)"
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="toolbar-btn px-1.5 py-0.5 text-xs text-slate-500"
                  title="Reset zoom (Ctrl+0)"
                  aria-label="Reset zoom"
                >
                  1:1
                </button>
              </div>
            </div>
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
        <CanvasResizeDialog
          open={canvasResizeOpen}
          originalWidth={image?.width ?? 0}
          originalHeight={image?.height ?? 0}
          isLoading={isLoading}
          onResize={async (w, h, anchor, fill) => {
            await handleCanvasResize(w, h, anchor, fill)
            setCanvasResizeOpen(false)
          }}
          onClose={() => setCanvasResizeOpen(false)}
        />
        <ResizeDialog
          open={resizeOpen}
          originalWidth={image?.width ?? 0}
          originalHeight={image?.height ?? 0}
          isLoading={isLoading}
          onResize={async (w, h) => {
            await handleResize(w, h)
            setResizeOpen(false)
          }}
          onClose={() => setResizeOpen(false)}
        />
        <AboutDialog open={aboutOpen} version={aboutVersion} onClose={() => setAboutOpen(false)} />
        <PrefsDialog
          open={prefsOpen}
          prefs={prefs}
          onSave={(p) => {
            savePrefs(p)
            setPrefs(p)
            setPrefsOpen(false)
          }}
          onClose={() => setPrefsOpen(false)}
        />
      </div>
    </LangProvider>
  )
}
