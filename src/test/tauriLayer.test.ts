import { describe, expect, it, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import * as api from '../lib/tauri'
import { loadPrefs, savePrefs } from '../lib/prefs'
import { getRecentFiles, addRecentFile, clearRecentFiles } from '../lib/recentFiles'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const mockInvoke = vi.mocked(invoke)

/** What the Rust side actually sends back, in snake_case. */
const rawMeta = {
  width: 800,
  height: 600,
  format: 'png',
  preview: 'data:image/png;base64,AAA',
  can_undo: true,
  can_redo: false,
  filename: 'photo.png',
  path: '/tmp/photo.png',
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockInvoke.mockResolvedValue(rawMeta)
})

describe('tauri layer — meta mapping', () => {
  it('renames the snake_case undo flags', async () => {
    const meta = await api.rotateImage('t1', 90)
    expect(meta).toEqual({
      width: 800,
      height: 600,
      format: 'png',
      preview: 'data:image/png;base64,AAA',
      canUndo: true,
      canRedo: false,
      filename: 'photo.png',
      path: '/tmp/photo.png',
    })
  })

  it('defaults the undo flags to false when the backend omits them', async () => {
    mockInvoke.mockResolvedValue({ width: 1, height: 1, format: 'png', preview: '' })
    const meta = await api.rotateImage('t1', 90)
    expect(meta.canUndo).toBe(false)
    expect(meta.canRedo).toBe(false)
  })
})

describe('tauri layer — opening', () => {
  it('maps the opened images and their tab ids', async () => {
    mockInvoke.mockResolvedValue([{ tab_id: 'a', meta: rawMeta }])

    await expect(api.openImages()).resolves.toEqual([
      { tabId: 'a', meta: expect.objectContaining({ canUndo: true }) },
    ])
    expect(mockInvoke).toHaveBeenCalledWith('open_images')
  })

  it('forwards the paths when opening by path', async () => {
    mockInvoke.mockResolvedValue([{ tab_id: 'a', meta: rawMeta }])

    await api.openImagesByPaths(['/tmp/a.png'])

    expect(mockInvoke).toHaveBeenCalledWith('open_images_by_paths', { paths: ['/tmp/a.png'] })
  })
})

describe('tauri layer — geometry commands', () => {
  it('flattens the crop rectangle into the payload', async () => {
    await api.cropImage('t1', { x: 1, y: 2, width: 3, height: 4 })
    expect(mockInvoke).toHaveBeenCalledWith(
      'crop_image',
      expect.objectContaining({ tabId: 't1', x: 1, y: 2, width: 3, height: 4 }),
    )
  })

  it('sends a resize', async () => {
    await api.resizeImage('t1', 100, 50)
    expect(mockInvoke).toHaveBeenCalledWith(
      'resize_image',
      expect.objectContaining({ tabId: 't1', width: 100, height: 50 }),
    )
  })

  it('sends a canvas resize with its anchor and fill', async () => {
    await api.canvasResizeImage('t1', 100, 50, 'top-left', [1, 2, 3, 4])
    expect(mockInvoke).toHaveBeenCalledWith(
      'canvas_resize_image',
      expect.objectContaining({
        tabId: 't1',
        width: 100,
        height: 50,
      }),
    )
  })

  it.each(['horizontal', 'vertical'] as const)('sends a %s flip', async (direction) => {
    await api.flipImage('t1', direction)
    expect(mockInvoke).toHaveBeenCalledWith('flip_image', expect.objectContaining({ tabId: 't1' }))
  })

  it('sends a rotation', async () => {
    await api.rotateImage('t1', 270)
    expect(mockInvoke).toHaveBeenCalledWith(
      'rotate_image',
      expect.objectContaining({ tabId: 't1', degrees: 270 }),
    )
  })
})

describe('tauri layer — history and tabs', () => {
  it.each([
    ['undoImage', 'undo_image'],
    ['redoImage', 'redo_image'],
    ['resetToOriginal', 'reset_to_original'],
  ] as const)('%s calls %s', async (fn, command) => {
    await (api[fn] as (id: string) => Promise<unknown>)('t1')
    expect(mockInvoke).toHaveBeenCalledWith(command, expect.objectContaining({ tabId: 't1' }))
  })

  it('closes a single tab', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await api.closeTab('t1')
    expect(mockInvoke).toHaveBeenCalledWith('close_tab', { tabId: 't1' })
  })

  it('closes every tab', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await api.closeAllTabs()
    expect(mockInvoke).toHaveBeenCalledWith('close_all_tabs')
  })

  it('closes the other tabs', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await api.closeOtherTabs('t1')
    expect(mockInvoke).toHaveBeenCalledWith('close_other_tabs', { tabId: 't1' })
  })

  it('exports with a format and quality', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await api.exportImage('t1', 'jpeg', 80)
    expect(mockInvoke).toHaveBeenCalledWith(
      'export_image',
      expect.objectContaining({ tabId: 't1', format: 'jpeg', quality: 80 }),
    )
  })

  it('tells the backend which language is active', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await api.setMenuLanguage('fr')
    expect(mockInvoke).toHaveBeenCalledWith('set_menu_language', { lang: 'fr' })
  })
})

describe('tauri layer — EXIF', () => {
  it('reads the fields', async () => {
    const fields = [{ tag: 'Make', value: 'Canon' }]
    mockInvoke.mockResolvedValue(fields)
    await expect(api.getExif('t1')).resolves.toEqual(fields)
    expect(mockInvoke).toHaveBeenCalledWith('get_exif', { tabId: 't1' })
  })

  it('strips them', async () => {
    mockInvoke.mockResolvedValue(true)
    await expect(api.stripExif('t1')).resolves.toBe(true)
    expect(mockInvoke).toHaveBeenCalledWith('strip_exif', { tabId: 't1' })
  })
})

describe('tauri layer — adjustments', () => {
  it.each([
    ['adjustBrightnessContrast', 'adjust_brightness_contrast', [10, -5]],
    ['adjustExposure', 'adjust_exposure', [1.5]],
    ['adjustHueSaturation', 'adjust_hue_saturation', [10, 20, 30]],
    ['adjustVibrance', 'adjust_vibrance', [15]],
    ['adjustLevels', 'adjust_levels', [0, 255, 1, 0, 255]],
    ['adjustWhiteBalance', 'adjust_white_balance', [10, -10]],
    ['adjustSharpen', 'adjust_sharpen', [1, 2, 3]],
    ['adjustDenoise', 'adjust_denoise', [4]],
  ] as const)('%s calls %s and maps the result', async (fn, command, args) => {
    const meta = await (api[fn] as (id: string, ...a: number[]) => Promise<{ canUndo: boolean }>)(
      't1',
      ...args,
    )

    expect(mockInvoke).toHaveBeenCalledWith(command, expect.objectContaining({ tabId: 't1' }))
    expect(meta.canUndo).toBe(true)
  })

  it('sends the curve points as-is', async () => {
    const points: [number, number][] = [
      [0, 0],
      [128, 200],
    ]
    await api.adjustCurves('t1', points)
    expect(mockInvoke).toHaveBeenCalledWith(
      'adjust_curves',
      expect.objectContaining({ tabId: 't1', points }),
    )
  })
})

describe('tauri layer — filters', () => {
  it.each([
    ['filterGrayscale', 'filter_grayscale', [0.3, 0.6, 0.1]],
    ['filterSepia', 'filter_sepia', [0.5]],
    ['filterVignette', 'filter_vignette', [0.5, 0.2]],
    ['filterPixelate', 'filter_pixelate', [8]],
    ['filterPosterize', 'filter_posterize', [4]],
    ['filterDuotone', 'filter_duotone', [1, 2, 3, 4, 5, 6]],
    ['filterLomo', 'filter_lomo', [0.5]],
    ['filterVintage', 'filter_vintage', [0.5]],
    ['filterCool', 'filter_cool', [0.5]],
    ['filterWarm', 'filter_warm', [0.5]],
    ['filterFade', 'filter_fade', [0.5]],
    ['filterDrama', 'filter_drama', [0.5]],
    ['filterCrossProcess', 'filter_cross_process', [0.5]],
    ['filterBlurGaussian', 'filter_blur_gaussian', [3]],
    ['filterBlurMotion', 'filter_blur_motion', [5, 45]],
    ['filterBlurRadial', 'filter_blur_radial', [5, 0.5, 0.5]],
  ] as const)('%s calls %s', async (fn, command, args) => {
    await (api[fn] as (id: string, ...a: number[]) => Promise<unknown>)('t1', ...args)
    expect(mockInvoke).toHaveBeenCalledWith(command, expect.objectContaining({ tabId: 't1' }))
  })

  it.each([
    ['filterInvert', 'filter_invert'],
    ['filterSketch', 'filter_sketch'],
  ] as const)('%s takes only the tab id', async (fn, command) => {
    await (api[fn] as (id: string) => Promise<unknown>)('t1')
    expect(mockInvoke).toHaveBeenCalledWith(command, expect.objectContaining({ tabId: 't1' }))
  })

  it('sends grain with its monochrome flag', async () => {
    await api.filterGrain('t1', 0.3, true)
    expect(mockInvoke).toHaveBeenCalledWith(
      'filter_grain',
      expect.objectContaining({ tabId: 't1', monochrome: true }),
    )
  })

  it('sends the inpainting mask', async () => {
    await api.inpaintImage('t1', 'bWFzaw==', 100, 50)
    expect(mockInvoke).toHaveBeenCalledWith(
      'inpaint_image',
      expect.objectContaining({ tabId: 't1' }),
    )
  })
})

describe('tauri layer — failures', () => {
  it('propagates a backend rejection', async () => {
    mockInvoke.mockRejectedValue(new Error('backend exploded'))
    await expect(api.rotateImage('t1', 90)).rejects.toThrow('backend exploded')
  })
})

describe('prefs', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadPrefs()).toEqual({
      defaultExportFormat: 'png',
      defaultJpegQuality: 90,
      gridSize: 50,
      language: 'en',
    })
  })

  it('merges what is stored over the defaults', () => {
    localStorage.setItem('lciz-prefs', JSON.stringify({ gridSize: 25 }))
    expect(loadPrefs()).toMatchObject({ gridSize: 25, defaultJpegQuality: 90 })
  })

  it('falls back to the defaults on corrupted JSON', () => {
    localStorage.setItem('lciz-prefs', '{ not json')
    expect(loadPrefs().gridSize).toBe(50)
  })

  it('round-trips through save', () => {
    savePrefs({ defaultExportFormat: 'webp', defaultJpegQuality: 70, gridSize: 10 })
    expect(loadPrefs()).toMatchObject({ defaultExportFormat: 'webp', gridSize: 10 })
  })
})

describe('recent files', () => {
  it('starts empty', () => {
    expect(getRecentFiles()).toEqual([])
  })

  it('recovers from corrupted storage', () => {
    localStorage.setItem('lciz-recent', 'not json')
    expect(getRecentFiles()).toEqual([])
  })

  it('puts the newest path first', () => {
    addRecentFile('/a.png')
    addRecentFile('/b.png')
    expect(getRecentFiles()).toEqual(['/b.png', '/a.png'])
  })

  it('moves an existing path back to the front instead of duplicating it', () => {
    addRecentFile('/a.png')
    addRecentFile('/b.png')
    addRecentFile('/a.png')
    expect(getRecentFiles()).toEqual(['/a.png', '/b.png'])
  })

  it('keeps at most ten entries', () => {
    for (let i = 0; i < 12; i += 1) addRecentFile(`/f${i}.png`)
    const list = getRecentFiles()
    expect(list).toHaveLength(10)
    expect(list[0]).toBe('/f11.png')
  })

  it('clears the list', () => {
    addRecentFile('/a.png')
    clearRecentFiles()
    expect(getRecentFiles()).toEqual([])
  })
})
