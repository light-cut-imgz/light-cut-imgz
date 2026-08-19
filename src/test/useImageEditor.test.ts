import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as tauri from '../lib/tauri'
import { useImageEditor } from '../hooks/useImageEditor'
import type { ImageMeta } from '../types'

vi.mock('../lib/tauri')

const meta = (over: Partial<ImageMeta> = {}): ImageMeta =>
  ({
    width: 800,
    height: 600,
    format: 'png',
    preview: 'data:image/png;base64,AAA',
    canUndo: false,
    canRedo: false,
    filename: 'photo.png',
    ...over,
  }) as ImageMeta

const opened = (id = 't1', filename = 'photo.png') => [{ tabId: id, meta: meta({ filename }) }]

/** Mounts the hook with one image already open. */
async function withOpenImage(id = 't1') {
  vi.mocked(tauri.openImages).mockResolvedValue(opened(id))
  const view = renderHook(() => useImageEditor())
  await act(async () => {
    await view.result.current.handleOpen()
  })
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const fn of Object.values(tauri)) {
    if (typeof fn === 'function') {
      vi.mocked(fn as (...args: unknown[]) => Promise<unknown>).mockResolvedValue(meta())
    }
  }
  vi.mocked(tauri.openImages).mockResolvedValue([])
  vi.mocked(tauri.openImagesByPaths).mockResolvedValue([])
  vi.mocked(tauri.getExif).mockResolvedValue([])
})

describe('useImageEditor — initial state', () => {
  it('starts with no tab and nothing to undo', () => {
    const { result } = renderHook(() => useImageEditor())

    expect(result.current.tabs).toEqual([])
    expect(result.current.activeTabId).toBeNull()
    expect(result.current.image).toBeNull()
    expect(result.current.mode).toBe('idle')
    expect(result.current.zoom).toBe(1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

describe('useImageEditor — opening images', () => {
  it('creates a tab and makes it active', async () => {
    const { result } = await withOpenImage()

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeTabId).toBe('t1')
    expect(result.current.tabs[0].label).toBe('photo.png')
    expect(result.current.history).toEqual([{ label: 'Open' }])
    expect(result.current.historyIndex).toBe(0)
  })

  it('falls back to a generic label when the file name is unknown', async () => {
    vi.mocked(tauri.openImages).mockResolvedValue([
      { tabId: 't1', meta: meta({ filename: undefined }) },
    ])
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleOpen()
    })

    expect(result.current.tabs[0].label).toBe('Image')
  })

  it('does nothing when the picker is dismissed', async () => {
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleOpen()
    })

    expect(result.current.tabs).toEqual([])
  })

  it('opens several files at once and activates the last', async () => {
    vi.mocked(tauri.openImages).mockResolvedValue([
      { tabId: 'a', meta: meta({ filename: 'a.png' }) },
      { tabId: 'b', meta: meta({ filename: 'b.png' }) },
    ])
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleOpen()
    })

    expect(result.current.tabs).toHaveLength(2)
    expect(result.current.activeTabId).toBe('b')
  })

  it('opens files handed over by path', async () => {
    vi.mocked(tauri.openImagesByPaths).mockResolvedValue(opened('dropped'))
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleOpenByPaths(['/tmp/a.png'])
    })

    expect(tauri.openImagesByPaths).toHaveBeenCalledWith(['/tmp/a.png'])
    expect(result.current.activeTabId).toBe('dropped')
  })

  it('records the reason when opening fails', async () => {
    vi.mocked(tauri.openImages).mockRejectedValue(new Error('unreadable file'))
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleOpen()
    })

    expect(result.current.error).toContain('unreadable file')
    expect(result.current.isLoading).toBe(false)
  })

  it('clears the error on demand', async () => {
    vi.mocked(tauri.openImages).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useImageEditor())
    await act(async () => {
      await result.current.handleOpen()
    })

    act(() => result.current.clearError())

    expect(result.current.error).toBeNull()
  })
})

describe('useImageEditor — edits and history', () => {
  it('crops, records the step and leaves crop mode', async () => {
    const { result } = await withOpenImage()
    act(() => result.current.enterCropMode())

    await act(async () => {
      await result.current.handleCropApply({ x: 0, y: 0, width: 100, height: 50 })
    })

    expect(tauri.cropImage).toHaveBeenCalledWith('t1', { x: 0, y: 0, width: 100, height: 50 })
    expect(result.current.history.map((h) => h.label)).toEqual(['Open', 'Crop 100×50'])
    expect(result.current.mode).toBe('idle')
    expect(result.current.canUndo).toBe(true)
  })

  it.each([
    ['horizontal', 'Flip horizontal'],
    ['vertical', 'Flip vertical'],
  ] as const)('flips %s', async (direction, label) => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleFlip(direction)
    })

    expect(tauri.flipImage).toHaveBeenCalledWith('t1', direction)
    expect(result.current.history[result.current.history.length - 1]?.label).toBe(label)
  })

  it('resizes', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleResize(400, 300)
    })

    expect(tauri.resizeImage).toHaveBeenCalledWith('t1', 400, 300)
    expect(result.current.history[result.current.history.length - 1]?.label).toContain('400')
  })

  it('resizes the canvas with an anchor and a fill', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleCanvasResize(1000, 800, 'top-left', [1, 2, 3, 255])
    })

    expect(tauri.canvasResizeImage).toHaveBeenCalledWith(
      't1',
      1000,
      800,
      'top-left',
      [1, 2, 3, 255],
    )
  })

  it('rotates', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleRotate(90)
    })

    expect(tauri.rotateImage).toHaveBeenCalledWith('t1', 90)
    expect(result.current.history[result.current.history.length - 1]?.label).toContain('90')
  })

  it('exports without touching the history', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleExport('jpeg', 85)
    })

    expect(tauri.exportImage).toHaveBeenCalledWith('t1', 'jpeg', 85)
    expect(result.current.history).toHaveLength(1)
  })

  it('ignores every edit while no tab is open', async () => {
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleCropApply({ x: 0, y: 0, width: 1, height: 1 })
      await result.current.handleFlip('horizontal')
      await result.current.handleResize(10, 10)
      await result.current.handleRotate(90)
      await result.current.handleExport('png', 100)
      await result.current.handleCanvasResize(10, 10, 'center', [0, 0, 0, 0])
    })

    expect(tauri.cropImage).not.toHaveBeenCalled()
    expect(tauri.flipImage).not.toHaveBeenCalled()
    expect(tauri.exportImage).not.toHaveBeenCalled()
  })

  it('drops the redo branch when editing after an undo', async () => {
    const { result } = await withOpenImage()
    await act(async () => {
      await result.current.handleRotate(90)
    })
    await act(async () => {
      await result.current.handleUndo()
    })

    await act(async () => {
      await result.current.handleFlip('horizontal')
    })

    expect(result.current.history.map((h) => h.label)).toEqual(['Open', 'Flip horizontal'])
    expect(result.current.canRedo).toBe(false)
  })
})

describe('useImageEditor — undo, redo and reset', () => {
  it('undoes and redoes around a step', async () => {
    const { result } = await withOpenImage()
    await act(async () => {
      await result.current.handleRotate(90)
    })
    expect(result.current.historyIndex).toBe(1)

    await act(async () => {
      await result.current.handleUndo()
    })
    expect(tauri.undoImage).toHaveBeenCalledWith('t1')
    expect(result.current.historyIndex).toBe(0)

    await act(async () => {
      await result.current.handleRedo()
    })
    expect(tauri.redoImage).toHaveBeenCalledWith('t1')
    expect(result.current.historyIndex).toBe(1)
  })

  it('refuses to undo past the first step', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleUndo()
    })

    expect(tauri.undoImage).not.toHaveBeenCalled()
  })

  it('refuses to redo past the last step', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleRedo()
    })

    expect(tauri.redoImage).not.toHaveBeenCalled()
  })

  it('resets to the original', async () => {
    const { result } = await withOpenImage()
    await act(async () => {
      await result.current.handleRotate(90)
    })

    await act(async () => {
      await result.current.handleResetToOriginal()
    })

    expect(tauri.resetToOriginal).toHaveBeenCalledWith('t1')
    expect(result.current.historyIndex).toBe(0)
  })

  it('does not reset when already at the original', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleResetToOriginal()
    })

    expect(tauri.resetToOriginal).not.toHaveBeenCalled()
  })
})

describe('useImageEditor — tabs', () => {
  async function withTwoTabs() {
    vi.mocked(tauri.openImages).mockResolvedValue([
      { tabId: 'a', meta: meta({ filename: 'a.png' }) },
      { tabId: 'b', meta: meta({ filename: 'b.png' }) },
    ])
    const view = renderHook(() => useImageEditor())
    await act(async () => {
      await view.result.current.handleOpen()
    })
    return view
  }

  it('switches the active tab and leaves any mode', async () => {
    const { result } = await withTwoTabs()
    act(() => result.current.enterCropMode())

    act(() => result.current.setActiveTab('a'))

    expect(result.current.activeTabId).toBe('a')
    expect(result.current.mode).toBe('idle')
  })

  it('closes a tab and falls back to its neighbour', async () => {
    const { result } = await withTwoTabs()

    await act(async () => {
      await result.current.handleCloseTab('b')
    })

    expect(tauri.closeTab).toHaveBeenCalledWith('b')
    expect(result.current.tabs.map((t) => t.id)).toEqual(['a'])
    await waitFor(() => expect(result.current.activeTabId).toBe('a'))
  })

  it('keeps the active tab when a background one is closed', async () => {
    const { result } = await withTwoTabs()

    await act(async () => {
      await result.current.handleCloseTab('a')
    })

    expect(result.current.tabs.map((t) => t.id)).toEqual(['b'])
    expect(result.current.activeTabId).toBe('b')
  })

  it('clears the active tab when the last one closes', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleCloseTab('t1')
    })

    await waitFor(() => expect(result.current.activeTabId).toBeNull())
    expect(result.current.tabs).toEqual([])
  })

  it('closes the other tabs', async () => {
    const { result } = await withTwoTabs()

    await act(async () => {
      await result.current.handleCloseOtherTabs()
    })

    expect(tauri.closeOtherTabs).toHaveBeenCalledWith('b')
    expect(result.current.tabs.map((t) => t.id)).toEqual(['b'])
  })

  it('does nothing when asked to close others with no tab open', async () => {
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleCloseOtherTabs()
    })

    expect(tauri.closeOtherTabs).not.toHaveBeenCalled()
  })

  it('closes every tab', async () => {
    const { result } = await withTwoTabs()

    await act(async () => {
      await result.current.handleCloseAllTabs()
    })

    expect(tauri.closeAllTabs).toHaveBeenCalled()
    expect(result.current.tabs).toEqual([])
    expect(result.current.activeTabId).toBeNull()
  })
})

describe('useImageEditor — zoom', () => {
  it('sets an absolute zoom', async () => {
    const { result } = await withOpenImage()

    act(() => result.current.setZoom(2))

    expect(result.current.zoom).toBe(2)
  })

  it('accepts an updater function', async () => {
    const { result } = await withOpenImage()

    act(() => result.current.setZoom((z) => z * 2))

    expect(result.current.zoom).toBe(2)
  })

  it('clamps to the allowed range', async () => {
    const { result } = await withOpenImage()

    act(() => result.current.setZoom(100))
    expect(result.current.zoom).toBe(8)

    act(() => result.current.setZoom(0))
    expect(result.current.zoom).toBe(0.05)
  })

  it('ignores zoom with no tab open', () => {
    const { result } = renderHook(() => useImageEditor())

    act(() => result.current.setZoom(3))

    expect(result.current.zoom).toBe(1)
  })
})

describe('useImageEditor — modes', () => {
  it.each([
    ['enterCropMode', 'cropping'],
    ['enterRotateMode', 'rotating'],
    ['enterEyedropperMode', 'eyedropper'],
    ['enterInpaintingMode', 'inpainting'],
  ] as const)('%s switches to %s', async (enter, expected) => {
    const { result } = await withOpenImage()

    act(() => (result.current[enter] as () => void)())

    expect(result.current.mode).toBe(expected)
  })

  it.each(['exitCropMode', 'exitRotateMode', 'exitEyedropperMode', 'exitInpaintingMode'] as const)(
    '%s goes back to idle',
    async (exit) => {
      const { result } = await withOpenImage()
      act(() => result.current.enterCropMode())

      act(() => (result.current[exit] as () => void)())

      expect(result.current.mode).toBe('idle')
    },
  )
})

describe('useImageEditor — EXIF', () => {
  it('reads the fields of a tab', async () => {
    const fields = [{ tag: 'Make', value: 'Canon' }]
    vi.mocked(tauri.getExif).mockResolvedValue(fields as never)
    const { result } = await withOpenImage()

    let got
    await act(async () => {
      got = await result.current.loadExif('t1')
    })

    expect(got).toEqual(fields)
  })

  it('returns an empty list when reading fails', async () => {
    vi.mocked(tauri.getExif).mockRejectedValue(new Error('no exif'))
    const { result } = await withOpenImage()

    let got
    await act(async () => {
      got = await result.current.loadExif('t1')
    })

    expect(got).toEqual([])
  })

  it('strips the metadata', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleStripExif('t1')
    })

    expect(tauri.stripExif).toHaveBeenCalledWith('t1')
  })
})

describe('useImageEditor — inpainting', () => {
  it('sends the mask and records the step', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleInpaint('bWFzaw==', 100, 50)
    })

    expect(tauri.inpaintImage).toHaveBeenCalledWith('t1', 'bWFzaw==', 100, 50)
    expect(result.current.history).toHaveLength(2)
  })

  it('does nothing with no tab open', async () => {
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleInpaint('x', 1, 1)
    })

    expect(tauri.inpaintImage).not.toHaveBeenCalled()
  })
})

describe('useImageEditor — adjustments', () => {
  it('applies brightness and contrast', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleAdjustBrightnessContrast(10, -5)
    })

    expect(tauri.adjustBrightnessContrast).toHaveBeenCalledWith('t1', 10, -5)
    expect(result.current.history[result.current.history.length - 1]?.label).toBe(
      'Brightness/Contrast',
    )
  })

  it.each([
    ['handleAdjustExposure', 'adjustExposure', [1.5], 'Exposure'],
    ['handleAdjustVibrance', 'adjustVibrance', [20], 'Vibrance'],
    ['handleAdjustDenoise', 'adjustDenoise', [3], 'Denoise'],
  ] as const)('%s calls %s', async (handler, command, args, label) => {
    const { result } = await withOpenImage()

    await act(async () => {
      await (result.current[handler] as (...a: number[]) => Promise<void>)(...args)
    })

    expect(vi.mocked(tauri[command])).toHaveBeenCalledWith('t1', ...args)
    expect(result.current.history[result.current.history.length - 1]?.label).toBe(label)
  })

  it('applies hue, saturation and lightness together', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleAdjustHueSaturation(10, 20, 30)
    })

    expect(tauri.adjustHueSaturation).toHaveBeenCalledWith('t1', 10, 20, 30)
  })

  it('applies levels', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleAdjustLevels(0, 255, 1, 0, 255)
    })

    expect(tauri.adjustLevels).toHaveBeenCalledWith('t1', 0, 255, 1, 0, 255)
  })

  it('applies curves', async () => {
    const { result } = await withOpenImage()
    const points: [number, number][] = [
      [0, 0],
      [255, 255],
    ]

    await act(async () => {
      await result.current.handleAdjustCurves(points)
    })

    expect(tauri.adjustCurves).toHaveBeenCalledWith('t1', points)
  })

  it('applies white balance and sharpening', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleAdjustWhiteBalance(10, -10)
      await result.current.handleAdjustSharpen(1, 2, 3)
    })

    expect(tauri.adjustWhiteBalance).toHaveBeenCalledWith('t1', 10, -10)
    expect(tauri.adjustSharpen).toHaveBeenCalledWith('t1', 1, 2, 3)
  })

  it('reports a failing adjustment', async () => {
    vi.mocked(tauri.adjustExposure).mockRejectedValue(new Error('out of range'))
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleAdjustExposure(99)
    })

    expect(result.current.error).toContain('out of range')
  })

  it('ignores adjustments with no tab open', async () => {
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleAdjustExposure(1)
    })

    expect(tauri.adjustExposure).not.toHaveBeenCalled()
  })
})

describe('useImageEditor — filters', () => {
  it('applies grayscale with its channel weights', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleFilterGrayscale(0.3, 0.6, 0.1)
    })

    expect(tauri.filterGrayscale).toHaveBeenCalledWith('t1', 0.3, 0.6, 0.1)
    expect(result.current.history[result.current.history.length - 1]?.label).toBe('Grayscale')
  })

  it.each([
    ['handleFilterSepia', 'filterSepia', [0.5]],
    ['handleFilterPixelate', 'filterPixelate', [8]],
    ['handleFilterPosterize', 'filterPosterize', [4]],
    ['handleFilterBlurGaussian', 'filterBlurGaussian', [3]],
  ] as const)('%s calls %s', async (handler, command, args) => {
    const { result } = await withOpenImage()

    await act(async () => {
      await (result.current[handler] as (...a: number[]) => Promise<void>)(...args)
    })

    expect(vi.mocked(tauri[command])).toHaveBeenCalledWith('t1', ...args)
  })

  it('applies the argument-free filters', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleFilterInvert()
    })

    expect(tauri.filterInvert).toHaveBeenCalledWith('t1')
    expect(result.current.history[result.current.history.length - 1]?.label).toBe('Négatif')
  })

  it('applies duotone with both colours', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleFilterDuotone(1, 2, 3, 4, 5, 6)
    })

    expect(tauri.filterDuotone).toHaveBeenCalledWith('t1', 1, 2, 3, 4, 5, 6)
  })

  it('applies vignette and grain', async () => {
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleFilterVignette(0.5, 0.2)
      await result.current.handleFilterGrain(0.3, true)
    })

    expect(tauri.filterVignette).toHaveBeenCalledWith('t1', 0.5, 0.2)
    expect(tauri.filterGrain).toHaveBeenCalledWith('t1', 0.3, true)
  })

  it('reports a failing filter without flipping the global loading flag', async () => {
    vi.mocked(tauri.filterSepia).mockRejectedValue(new Error('filter unavailable'))
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleFilterSepia(0.5)
    })

    expect(result.current.error).toContain('filter unavailable')
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores filters with no tab open', async () => {
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleFilterInvert()
    })

    expect(tauri.filterInvert).not.toHaveBeenCalled()
  })
})

describe('useImageEditor — clipboard', () => {
  it('copies the preview as a PNG blob', async () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(blob) }))
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public data: unknown) {}
      },
    )
    const { result } = await withOpenImage()

    await act(async () => {
      await result.current.handleCopyToClipboard()
    })

    expect(write).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does nothing with no tab open', async () => {
    const write = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    const { result } = renderHook(() => useImageEditor())

    await act(async () => {
      await result.current.handleCopyToClipboard()
    })

    expect(write).not.toHaveBeenCalled()
  })
})
