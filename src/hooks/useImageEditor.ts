import { useCallback, useState } from 'react'
import {
  adjustBrightnessContrast,
  adjustCurves,
  adjustDenoise,
  adjustExposure,
  adjustHueSaturation,
  adjustLevels,
  adjustSharpen,
  adjustVibrance,
  adjustWhiteBalance,
  filterGrayscale,
  filterSepia,
  filterInvert,
  filterVignette,
  filterGrain,
  filterPixelate,
  filterPosterize,
  filterDuotone,
  filterSketch,
  filterLomo,
  filterVintage,
  filterCool,
  filterWarm,
  filterFade,
  filterDrama,
  filterCrossProcess,
  filterBlurGaussian,
  filterBlurMotion,
  filterBlurRadial,
  inpaintImage,
  canvasResizeImage,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  cropImage,
  exportImage,
  flipImage,
  getExif,
  openImages,
  openImagesByPaths,
  redoImage,
  resizeImage,
  rotateImage,
  resetToOriginal,
  stripExif,
  undoImage,
} from '../lib/tauri'
import type { Anchor, ExifField } from '../lib/tauri'
import type { CropRect, EditorMode, ExportFormat, HistoryEntry, ImageMeta, Tab } from '../types'

const ZOOM_MIN = 0.05
const ZOOM_MAX = 8.0

function clampZoom(z: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
}

function pushHistory(
  entries: HistoryEntry[],
  index: number,
  label: string,
): [HistoryEntry[], number] {
  const next = [...entries.slice(0, index + 1), { label }]
  return [next, next.length - 1]
}

interface ImageEditorState {
  tabs: Tab[]
  activeTabId: string | null
  image: ImageMeta | null
  mode: EditorMode
  zoom: number
  history: HistoryEntry[]
  historyIndex: number
  canUndo: boolean
  canRedo: boolean
  isLoading: boolean
  error: string | null
}

interface ImageEditorActions {
  loadExif: (tabId: string) => Promise<ExifField[]>
  handleStripExif: (tabId: string) => Promise<void>
  handleOpen: () => Promise<void>
  handleOpenByPaths: (paths: string[]) => Promise<void>
  handleCopyToClipboard: () => Promise<void>
  enterEyedropperMode: () => void
  exitEyedropperMode: () => void
  handleCropApply: (rect: CropRect) => Promise<void>
  handleFlip: (direction: 'horizontal' | 'vertical') => Promise<void>
  handleResize: (width: number, height: number) => Promise<void>
  handleCanvasResize: (
    width: number,
    height: number,
    anchor: Anchor,
    fill: [number, number, number, number],
  ) => Promise<void>
  handleRotate: (degrees: number) => Promise<void>
  handleExport: (format: ExportFormat, quality?: number) => Promise<void>
  handleUndo: () => Promise<void>
  handleRedo: () => Promise<void>
  handleResetToOriginal: () => Promise<void>
  handleCloseTab: (id: string) => Promise<void>
  handleCloseOtherTabs: () => Promise<void>
  handleCloseAllTabs: () => Promise<void>
  setActiveTab: (id: string) => void
  enterCropMode: () => void
  exitCropMode: () => void
  enterRotateMode: () => void
  exitRotateMode: () => void
  setZoom: (z: number | ((prev: number) => number)) => void
  clearError: () => void
  handleAdjustBrightnessContrast: (brightness: number, contrast: number) => Promise<void>
  handleAdjustExposure: (exposure: number) => Promise<void>
  handleAdjustHueSaturation: (hue: number, saturation: number, lightness: number) => Promise<void>
  handleAdjustVibrance: (vibrance: number) => Promise<void>
  handleAdjustLevels: (
    inBlack: number,
    inWhite: number,
    gamma: number,
    outBlack: number,
    outWhite: number,
  ) => Promise<void>
  handleAdjustCurves: (points: [number, number][]) => Promise<void>
  handleAdjustWhiteBalance: (temperature: number, tint: number) => Promise<void>
  handleAdjustSharpen: (amount: number, radius: number, threshold: number) => Promise<void>
  handleAdjustDenoise: (strength: number) => Promise<void>
  handleFilterGrayscale: (rWeight: number, gWeight: number, bWeight: number) => Promise<void>
  handleFilterSepia: (intensity: number) => Promise<void>
  handleFilterInvert: () => Promise<void>
  handleFilterVignette: (strength: number, feather: number) => Promise<void>
  handleFilterGrain: (amount: number, monochrome: boolean) => Promise<void>
  handleFilterPixelate: (size: number) => Promise<void>
  handleFilterPosterize: (levels: number) => Promise<void>
  handleFilterDuotone: (
    shadowR: number,
    shadowG: number,
    shadowB: number,
    highlightR: number,
    highlightG: number,
    highlightB: number,
  ) => Promise<void>
  handleFilterSketch: () => Promise<void>
  handleFilterLomo: (intensity: number) => Promise<void>
  handleFilterVintage: (intensity: number) => Promise<void>
  handleFilterCool: (intensity: number) => Promise<void>
  handleFilterWarm: (intensity: number) => Promise<void>
  handleFilterFade: (intensity: number) => Promise<void>
  handleFilterDrama: (intensity: number) => Promise<void>
  handleFilterCrossProcess: (intensity: number) => Promise<void>
  handleFilterBlurGaussian: (radius: number) => Promise<void>
  handleFilterBlurMotion: (angle: number, distance: number) => Promise<void>
  handleFilterBlurRadial: (strength: number, samples: number) => Promise<void>
  enterInpaintingMode: () => void
  exitInpaintingMode: () => void
  handleInpaint: (maskB64: string, maskWidth: number, maskHeight: number) => Promise<void>
}

export function useImageEditor(): ImageEditorState & ImageEditorActions {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const image = activeTab?.image ?? null
  const zoom = activeTab?.zoom ?? 1
  const history = activeTab?.history ?? []
  const historyIndex = activeTab?.historyIndex ?? -1
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const updateTab = useCallback((id: string, updater: (tab: Tab) => Tab) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? updater(t) : t)))
  }, [])

  const withLoading = useCallback(async (fn: () => Promise<void>) => {
    setIsLoading(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createTabsFromOpened = useCallback((opened: { tabId: string; meta: ImageMeta }[]) => {
    if (opened.length === 0) return
    const newTabs: Tab[] = opened.map(({ tabId, meta }) => ({
      id: tabId,
      label: meta.filename ?? 'Image',
      image: meta,
      history: [{ label: 'Open' }],
      historyIndex: 0,
      zoom: 1,
    }))
    setTabs((prev) => [...prev, ...newTabs])
    setActiveTabId(newTabs[newTabs.length - 1].id)
    setMode('idle')
  }, [])

  const handleOpen = useCallback(async () => {
    await withLoading(async () => {
      const opened = await openImages()
      createTabsFromOpened(opened)
    })
  }, [withLoading, createTabsFromOpened])

  const handleOpenByPaths = useCallback(
    async (paths: string[]) => {
      await withLoading(async () => {
        const opened = await openImagesByPaths(paths)
        createTabsFromOpened(opened)
      })
    },
    [withLoading, createTabsFromOpened],
  )

  const handleCopyToClipboard = useCallback(async () => {
    if (!activeTabId) return
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab?.image?.preview) return
    await withLoading(async () => {
      const response = await fetch(tab.image.preview)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    })
  }, [activeTabId, tabs, withLoading])

  const handleCropApply = useCallback(
    async (rect: CropRect) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await cropImage(id, rect)
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(
            tab.history,
            tab.historyIndex,
            `Crop ${rect.width}×${rect.height}`,
          )
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
        setMode('idle')
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleFlip = useCallback(
    async (direction: 'horizontal' | 'vertical') => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await flipImage(id, direction)
        const label = direction === 'horizontal' ? 'Flip horizontal' : 'Flip vertical'
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(tab.history, tab.historyIndex, label)
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleResize = useCallback(
    async (width: number, height: number) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await resizeImage(id, width, height)
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(
            tab.history,
            tab.historyIndex,
            `Resize ${width}×${height}`,
          )
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleCanvasResize = useCallback(
    async (
      width: number,
      height: number,
      anchor: Anchor,
      fill: [number, number, number, number],
    ) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await canvasResizeImage(id, width, height, anchor, fill)
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(
            tab.history,
            tab.historyIndex,
            `Canvas ${width}×${height}`,
          )
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleRotate = useCallback(
    async (degrees: number) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await rotateImage(id, degrees)
        const label =
          degrees === 90 ? 'Rotate +90°' : degrees === -90 ? 'Rotate −90°' : `Rotate ${degrees}°`
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(tab.history, tab.historyIndex, label)
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleExport = useCallback(
    async (format: ExportFormat, quality?: number) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        await exportImage(id, format, quality)
      })
    },
    [withLoading, activeTabId],
  )

  const handleUndo = useCallback(async () => {
    if (!activeTabId || historyIndex <= 0) return
    const id = activeTabId
    await withLoading(async () => {
      const result = await undoImage(id)
      updateTab(id, (tab) => ({ ...tab, image: result, historyIndex: tab.historyIndex - 1 }))
      setMode('idle')
    })
  }, [withLoading, activeTabId, historyIndex, updateTab])

  const handleRedo = useCallback(async () => {
    if (!activeTabId || historyIndex >= history.length - 1) return
    const id = activeTabId
    await withLoading(async () => {
      const result = await redoImage(id)
      updateTab(id, (tab) => ({ ...tab, image: result, historyIndex: tab.historyIndex + 1 }))
      setMode('idle')
    })
  }, [withLoading, activeTabId, historyIndex, history.length, updateTab])

  const handleResetToOriginal = useCallback(async () => {
    if (!activeTabId || historyIndex === 0) return
    const id = activeTabId
    await withLoading(async () => {
      const result = await resetToOriginal(id)
      updateTab(id, (tab) => ({ ...tab, image: result, historyIndex: 0 }))
      setMode('idle')
    })
  }, [withLoading, activeTabId, historyIndex, updateTab])

  const handleCloseTab = useCallback(
    async (id: string) => {
      await closeTab(id)
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== id)
        if (activeTabId === id) {
          const idx = prev.findIndex((t) => t.id === id)
          const next = remaining[Math.max(0, idx - 1)]?.id ?? remaining[0]?.id ?? null
          setActiveTabId(next)
          setMode('idle')
        }
        return remaining
      })
    },
    [activeTabId],
  )

  const handleCloseOtherTabs = useCallback(async () => {
    if (!activeTabId) return
    await closeOtherTabs(activeTabId)
    setTabs((prev) => prev.filter((t) => t.id === activeTabId))
  }, [activeTabId])

  const handleCloseAllTabs = useCallback(async () => {
    await closeAllTabs()
    setTabs([])
    setActiveTabId(null)
    setMode('idle')
  }, [])

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id)
    setMode('idle')
  }, [])

  const setZoom = useCallback(
    (z: number | ((prev: number) => number)) => {
      if (!activeTabId) return
      const id = activeTabId
      updateTab(id, (tab) => {
        const next = typeof z === 'function' ? z(tab.zoom) : z
        return { ...tab, zoom: clampZoom(next) }
      })
    },
    [activeTabId, updateTab],
  )

  const loadExif = useCallback(async (tabId: string): Promise<ExifField[]> => {
    try {
      return await getExif(tabId)
    } catch {
      return []
    }
  }, [])

  const handleStripExif = useCallback(
    async (tabId: string) => {
      await withLoading(async () => {
        await stripExif(tabId)
      })
    },
    [withLoading],
  )

  const applyAdjustment = useCallback(
    async (label: string, fn: (id: string) => ReturnType<typeof adjustBrightnessContrast>) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await fn(id)
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(tab.history, tab.historyIndex, label)
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  // Same as applyAdjustment but without the global isLoading flag — the FiltersPanel
  // manages its own blocking overlay, so we avoid disabling the entire toolbar.
  const applyFilter = useCallback(
    async (label: string, fn: (id: string) => Promise<ImageMeta>) => {
      if (!activeTabId) return
      const id = activeTabId
      try {
        const result = await fn(id)
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(tab.history, tab.historyIndex, label)
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      } catch (err) {
        setError(String(err))
      }
    },
    [activeTabId, updateTab],
  )

  const handleAdjustBrightnessContrast = useCallback(
    (brightness: number, contrast: number) =>
      applyAdjustment('Brightness/Contrast', (id) =>
        adjustBrightnessContrast(id, brightness, contrast),
      ),
    [applyAdjustment],
  )
  const handleAdjustExposure = useCallback(
    (exposure: number) => applyAdjustment('Exposure', (id) => adjustExposure(id, exposure)),
    [applyAdjustment],
  )
  const handleAdjustHueSaturation = useCallback(
    (hue: number, saturation: number, lightness: number) =>
      applyAdjustment('Hue/Saturation', (id) =>
        adjustHueSaturation(id, hue, saturation, lightness),
      ),
    [applyAdjustment],
  )
  const handleAdjustVibrance = useCallback(
    (vibrance: number) => applyAdjustment('Vibrance', (id) => adjustVibrance(id, vibrance)),
    [applyAdjustment],
  )
  const handleAdjustLevels = useCallback(
    (inBlack: number, inWhite: number, gamma: number, outBlack: number, outWhite: number) =>
      applyAdjustment('Levels', (id) =>
        adjustLevels(id, inBlack, inWhite, gamma, outBlack, outWhite),
      ),
    [applyAdjustment],
  )
  const handleAdjustCurves = useCallback(
    (points: [number, number][]) => applyAdjustment('Curves', (id) => adjustCurves(id, points)),
    [applyAdjustment],
  )
  const handleAdjustWhiteBalance = useCallback(
    (temperature: number, tint: number) =>
      applyAdjustment('White Balance', (id) => adjustWhiteBalance(id, temperature, tint)),
    [applyAdjustment],
  )
  const handleAdjustSharpen = useCallback(
    (amount: number, radius: number, threshold: number) =>
      applyAdjustment('Sharpen', (id) => adjustSharpen(id, amount, radius, threshold)),
    [applyAdjustment],
  )
  const handleAdjustDenoise = useCallback(
    (strength: number) => applyAdjustment('Denoise', (id) => adjustDenoise(id, strength)),
    [applyAdjustment],
  )

  const handleFilterGrayscale = useCallback(
    (rWeight: number, gWeight: number, bWeight: number) =>
      applyFilter('Grayscale', (id) => filterGrayscale(id, rWeight, gWeight, bWeight)),
    [applyFilter],
  )
  const handleFilterSepia = useCallback(
    (intensity: number) => applyFilter('Sépia', (id) => filterSepia(id, intensity)),
    [applyFilter],
  )
  const handleFilterInvert = useCallback(
    () => applyFilter('Négatif', (id) => filterInvert(id)),
    [applyFilter],
  )
  const handleFilterVignette = useCallback(
    (strength: number, feather: number) =>
      applyFilter('Vignette', (id) => filterVignette(id, strength, feather)),
    [applyFilter],
  )
  const handleFilterGrain = useCallback(
    (amount: number, monochrome: boolean) =>
      applyFilter('Grain', (id) => filterGrain(id, amount, monochrome)),
    [applyFilter],
  )
  const handleFilterPixelate = useCallback(
    (size: number) => applyFilter('Pixelise', (id) => filterPixelate(id, size)),
    [applyFilter],
  )
  const handleFilterPosterize = useCallback(
    (levels: number) => applyFilter('Postérisé', (id) => filterPosterize(id, levels)),
    [applyFilter],
  )
  const handleFilterDuotone = useCallback(
    (
      shadowR: number,
      shadowG: number,
      shadowB: number,
      highlightR: number,
      highlightG: number,
      highlightB: number,
    ) =>
      applyFilter('Duotone', (id) =>
        filterDuotone(id, shadowR, shadowG, shadowB, highlightR, highlightG, highlightB),
      ),
    [applyFilter],
  )
  const handleFilterSketch = useCallback(
    () => applyFilter('Sketch', (id) => filterSketch(id)),
    [applyFilter],
  )
  const handleFilterLomo = useCallback(
    (intensity: number) => applyFilter('Lomo', (id) => filterLomo(id, intensity)),
    [applyFilter],
  )
  const handleFilterVintage = useCallback(
    (intensity: number) => applyFilter('Vintage', (id) => filterVintage(id, intensity)),
    [applyFilter],
  )
  const handleFilterCool = useCallback(
    (intensity: number) => applyFilter('Cool', (id) => filterCool(id, intensity)),
    [applyFilter],
  )
  const handleFilterWarm = useCallback(
    (intensity: number) => applyFilter('Warm', (id) => filterWarm(id, intensity)),
    [applyFilter],
  )
  const handleFilterFade = useCallback(
    (intensity: number) => applyFilter('Fade', (id) => filterFade(id, intensity)),
    [applyFilter],
  )
  const handleFilterDrama = useCallback(
    (intensity: number) => applyFilter('Drama', (id) => filterDrama(id, intensity)),
    [applyFilter],
  )
  const handleFilterCrossProcess = useCallback(
    (intensity: number) => applyFilter('Cross-process', (id) => filterCrossProcess(id, intensity)),
    [applyFilter],
  )
  const handleFilterBlurGaussian = useCallback(
    (radius: number) => applyFilter('Flou gaussien', (id) => filterBlurGaussian(id, radius)),
    [applyFilter],
  )
  const handleFilterBlurMotion = useCallback(
    (angle: number, distance: number) =>
      applyFilter('Flou de mouvement', (id) => filterBlurMotion(id, angle, distance)),
    [applyFilter],
  )
  const handleFilterBlurRadial = useCallback(
    (strength: number, samples: number) =>
      applyFilter('Flou radial', (id) => filterBlurRadial(id, strength, samples)),
    [applyFilter],
  )

  const handleInpaint = useCallback(
    async (maskB64: string, maskWidth: number, maskHeight: number) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await inpaintImage(id, maskB64, maskWidth, maskHeight)
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(
            tab.history,
            tab.historyIndex,
            'Remove object',
          )
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const enterCropMode = useCallback(() => setMode('cropping'), [])
  const exitCropMode = useCallback(() => setMode('idle'), [])
  const enterRotateMode = useCallback(() => setMode('rotating'), [])
  const exitRotateMode = useCallback(() => setMode('idle'), [])
  const enterEyedropperMode = useCallback(() => setMode('eyedropper'), [])
  const exitEyedropperMode = useCallback(() => setMode('idle'), [])
  const enterInpaintingMode = useCallback(() => setMode('inpainting'), [])
  const exitInpaintingMode = useCallback(() => setMode('idle'), [])
  const clearError = useCallback(() => setError(null), [])

  return {
    loadExif,
    handleStripExif,
    handleOpenByPaths,
    handleCopyToClipboard,
    enterEyedropperMode,
    exitEyedropperMode,
    tabs,
    activeTabId,
    image,
    mode,
    zoom,
    history,
    historyIndex,
    canUndo,
    canRedo,
    isLoading,
    error,
    handleOpen,
    handleCropApply,
    handleFlip,
    handleResize,
    handleCanvasResize,
    handleRotate,
    handleExport,
    handleUndo,
    handleRedo,
    handleResetToOriginal,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    setActiveTab,
    enterCropMode,
    exitCropMode,
    enterRotateMode,
    exitRotateMode,
    enterInpaintingMode,
    exitInpaintingMode,
    handleInpaint,
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
  }
}
