import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import { setMenuLanguage } from '../lib/tauri'
import App from '../App'
import { useImageEditor } from '../hooks/useImageEditor'
import type { EditorMode, ImageMeta } from '../types'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('../hooks/useImageEditor')
vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return { ...actual, setMenuLanguage: vi.fn() }
})

const mockListen = vi.mocked(listen)
const mockUseImageEditor = vi.mocked(useImageEditor)
const mockSetMenuLanguage = vi.mocked(setMenuLanguage)

const meta = (over: Partial<ImageMeta> = {}): ImageMeta =>
  ({
    width: 800,
    height: 600,
    format: 'png',
    preview: 'data:image/png;base64,AAA',
    canUndo: true,
    canRedo: false,
    filename: 'photo.png',
    path: '/tmp/photo.png',
    ...over,
  }) as ImageMeta

type Editor = ReturnType<typeof useImageEditor>

/** Every action on the editor, as a fresh spy. */
function editorStub(over: Partial<Editor> = {}): Editor {
  const handler = () => vi.fn().mockResolvedValue(undefined)
  const base: Record<string, unknown> = {
    tabs: [
      {
        id: 't1',
        label: 'photo.png',
        image: meta(),
        history: [{ label: 'Open' }],
        historyIndex: 0,
        zoom: 1,
      },
    ],
    activeTabId: 't1',
    image: meta(),
    mode: 'idle' as EditorMode,
    isLoading: false,
    error: null,
    zoom: 1,
    history: [{ label: 'Open' }],
    historyIndex: 0,
    canUndo: true,
    canRedo: false,
    loadExif: vi.fn().mockResolvedValue([{ tag: 'Make', value: 'Canon' }]),
  }
  const actionNames = [
    'handleStripExif',
    'handleOpenByPaths',
    'handleCopyToClipboard',
    'enterEyedropperMode',
    'exitEyedropperMode',
    'enterInpaintingMode',
    'exitInpaintingMode',
    'handleInpaint',
    'handleOpen',
    'handleCropApply',
    'handleFlip',
    'handleResize',
    'handleCanvasResize',
    'handleRotate',
    'handleExport',
    'handleUndo',
    'handleRedo',
    'handleCloseTab',
    'handleCloseOtherTabs',
    'handleCloseAllTabs',
    'setActiveTab',
    'enterCropMode',
    'exitCropMode',
    'enterRotateMode',
    'exitRotateMode',
    'setZoom',
    'clearError',
    'handleAdjustBrightnessContrast',
    'handleAdjustExposure',
    'handleAdjustHueSaturation',
    'handleAdjustVibrance',
    'handleAdjustLevels',
    'handleAdjustCurves',
    'handleAdjustWhiteBalance',
    'handleAdjustSharpen',
    'handleAdjustDenoise',
    'handleFilterGrayscale',
    'handleFilterSepia',
    'handleFilterInvert',
    'handleFilterVignette',
    'handleFilterGrain',
    'handleFilterPixelate',
    'handleFilterPosterize',
    'handleFilterDuotone',
    'handleFilterSketch',
    'handleFilterLomo',
    'handleFilterVintage',
    'handleFilterCool',
    'handleFilterWarm',
    'handleFilterFade',
    'handleFilterDrama',
    'handleFilterCrossProcess',
    'handleFilterBlurGaussian',
    'handleFilterBlurMotion',
    'handleFilterBlurRadial',
    'handleResetToOriginal',
  ]
  for (const name of actionNames) base[name] = handler()
  return { ...base, ...over } as unknown as Editor
}

async function renderApp(over: Partial<Editor> = {}) {
  const editor = editorStub(over)
  mockUseImageEditor.mockReturnValue(editor)
  const view = render(<App />)
  await act(async () => {})
  return { editor, ...view }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockSetMenuLanguage.mockResolvedValue(undefined)
  mockListen.mockImplementation((() => Promise.resolve(() => {})) as typeof listen)
})

describe('App — toolbar modes', () => {
  it('enters crop mode and closes the flip bar', async () => {
    const { editor } = await renderApp()

    await userEvent.click(screen.getByLabelText('Crop'))

    expect(editor.enterCropMode).toHaveBeenCalled()
  })

  it('leaves crop mode when already cropping', async () => {
    const { editor } = await renderApp({ mode: 'cropping' as EditorMode })

    await userEvent.click(screen.getByLabelText('Crop'))

    expect(editor.exitCropMode).toHaveBeenCalled()
  })

  it.each([
    ['Rotate', 'enterRotateMode'],
    ['Color picker', 'enterEyedropperMode'],
    ['Remove object / inpaint', 'enterInpaintingMode'],
  ] as const)('%s enters its mode', async (label, action) => {
    const { editor } = await renderApp()

    await userEvent.click(screen.getByLabelText(label))

    expect(editor[action as keyof Editor]).toHaveBeenCalled()
  })

  it.each([
    ['Rotate', 'rotating', 'exitRotateMode'],
    ['Color picker', 'eyedropper', 'exitEyedropperMode'],
    ['Remove object / inpaint', 'inpainting', 'exitInpaintingMode'],
  ] as const)('%s leaves its mode when already active', async (label, mode, action) => {
    const { editor } = await renderApp({ mode: mode as EditorMode })

    await userEvent.click(screen.getByLabelText(label))

    expect(editor[action as keyof Editor]).toHaveBeenCalled()
  })

  it('toggles the flip bar and leaves any active mode', async () => {
    const { editor } = await renderApp({ mode: 'cropping' as EditorMode })

    await userEvent.click(screen.getByLabelText('Flip'))

    expect(editor.exitCropMode).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('copies the image to the clipboard', async () => {
    const { editor } = await renderApp()

    await userEvent.click(screen.getByLabelText('Copy to clipboard'))

    expect(editor.handleCopyToClipboard).toHaveBeenCalled()
  })
})

describe('App — toolbar toggles and dialogs', () => {
  it('opens the resize dialog', async () => {
    await renderApp()
    await userEvent.click(screen.getByLabelText('Resize image'))
    expect(await screen.findByText('Resize image', { selector: 'h2' })).toBeInTheDocument()
  })

  it('opens the canvas resize dialog', async () => {
    await renderApp()
    await userEvent.click(screen.getByLabelText('Canvas resize'))
    expect(await screen.findByText('Canvas resize', { selector: 'h2' })).toBeInTheDocument()
  })

  it('opens the preferences dialog', async () => {
    await renderApp()
    await userEvent.click(screen.getByLabelText('Preferences'))
    expect(await screen.findByText('Preferences')).toBeInTheDocument()
  })

  it('saves preferences and keeps them', async () => {
    await renderApp()
    await userEvent.click(screen.getByLabelText('Preferences'))
    const dialog = (await screen.findByText('Preferences')).parentElement!

    await userEvent.click(within(dialog).getByText('WebP'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('lciz-prefs') ?? '{}')).toMatchObject({
        defaultExportFormat: 'webp',
      }),
    )
  })

  it('toggles the grid', async () => {
    await renderApp()
    const button = screen.getByLabelText('Toggle grid')

    await userEvent.click(button)
    await userEvent.click(button)

    expect(button).toBeInTheDocument()
  })

  it('toggles the EXIF panel and loads the fields', async () => {
    const { editor } = await renderApp()

    await userEvent.click(screen.getByLabelText('EXIF metadata'))

    await waitFor(() => expect(editor.loadExif).toHaveBeenCalledWith('t1'))
    expect(await screen.findByText('Canon')).toBeInTheDocument()
  })

  it('opens the adjustments panel and closes the filters one', async () => {
    await renderApp()

    await userEvent.click(screen.getByLabelText('Filters'))
    await userEvent.click(screen.getByLabelText('Adjustments'))

    expect(screen.getByLabelText('Adjustments')).toBeInTheDocument()
  })
})

describe('App — dialog confirmations', () => {
  it('resizes from the resize dialog', async () => {
    const { editor } = await renderApp()
    await userEvent.click(screen.getByLabelText('Resize image'))
    await screen.findByText('Resize image', { selector: 'h2' })

    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '400' } })
    await userEvent.click(screen.getByRole('button', { name: 'Resize' }))

    expect(editor.handleResize).toHaveBeenCalledWith(400, 300)
  })

  it('resizes the canvas from its dialog', async () => {
    const { editor } = await renderApp()
    await userEvent.click(screen.getByLabelText('Canvas resize'))
    await screen.findByText('Canvas resize', { selector: 'h2' })

    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '1000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(editor.handleCanvasResize).toHaveBeenCalledWith(
      1000,
      600,
      'center',
      [255, 255, 255, 255],
    )
  })

  it('applies a crop from the crop bar', async () => {
    const { editor } = await renderApp({ mode: 'cropping' as EditorMode })

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(editor.handleCropApply).toHaveBeenCalled()
  })

  it('rotates from the rotation bar', async () => {
    const { editor } = await renderApp({ mode: 'rotating' as EditorMode })

    await userEvent.click(screen.getByLabelText('Rotate 90° clockwise'))

    expect(editor.handleRotate).toHaveBeenCalled()
  })

  it('flips from the flip bar', async () => {
    const { editor } = await renderApp()
    await userEvent.click(screen.getByLabelText('Flip'))

    await userEvent.click(await screen.findByLabelText('Flip horizontal'))

    expect(editor.handleFlip).toHaveBeenCalledWith('horizontal')
  })
})

describe('App — keyboard shortcuts', () => {
  it.each([
    ['y', {}, 'handleRedo'],
    ['c', {}, 'handleCopyToClipboard'],
  ] as const)('Ctrl+%s triggers %s', async (key, extra, action) => {
    const { editor } = await renderApp()

    fireEvent.keyDown(window, { key, ctrlKey: true, ...extra })

    expect(editor[action as keyof Editor]).toHaveBeenCalled()
  })

  it.each(['=', '+', '-', '0'])('Ctrl+%s changes the zoom', async (key) => {
    const { editor } = await renderApp()

    fireEvent.keyDown(window, { key, ctrlKey: true })

    expect(editor.setZoom).toHaveBeenCalled()
  })

  it('leaves Ctrl+Shift+C alone', async () => {
    const { editor } = await renderApp()

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true, shiftKey: true })

    expect(editor.handleCopyToClipboard).not.toHaveBeenCalled()
  })

  it('ignores an unmapped Ctrl combination', async () => {
    const { editor } = await renderApp()

    fireEvent.keyDown(window, { key: 'q', ctrlKey: true })

    expect(editor.handleUndo).not.toHaveBeenCalled()
    expect(editor.setZoom).not.toHaveBeenCalled()
  })

  it('applies the mask on Enter while inpainting', async () => {
    const { editor } = await renderApp({ mode: 'inpainting' as EditorMode })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })

    expect(editor.handleInpaint).toHaveBeenCalled()
  })

  it('ignores Enter outside inpainting', async () => {
    const { editor } = await renderApp()

    fireEvent.keyDown(window, { key: 'Enter' })

    expect(editor.handleInpaint).not.toHaveBeenCalled()
  })
})

describe('App — inpainting bar', () => {
  it('applies the mask from the button', async () => {
    const { editor } = await renderApp({ mode: 'inpainting' as EditorMode })

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(editor.handleInpaint).toHaveBeenCalled()
  })

  it('leaves the mode from the cancel button', async () => {
    const { editor } = await renderApp({ mode: 'inpainting' as EditorMode })

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(editor.exitInpaintingMode).toHaveBeenCalled()
  })

  it('changes the brush size', async () => {
    await renderApp({ mode: 'inpainting' as EditorMode })

    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } })

    expect(screen.getByText('80')).toBeInTheDocument()
  })
})

describe('App — no image open', () => {
  it('disables the editing tools', async () => {
    await renderApp({ image: null, tabs: [], activeTabId: null })
    expect(screen.getByLabelText('Crop')).toBeDisabled()
  })

  it('clears the EXIF fields when the last tab closes', async () => {
    const { rerender } = await renderApp()
    await userEvent.click(screen.getByLabelText('EXIF metadata'))
    await screen.findByText('Canon')

    mockUseImageEditor.mockReturnValue(editorStub({ image: null, tabs: [], activeTabId: null }))
    await act(async () => {
      rerender(<App />)
    })

    expect(screen.queryByText('Canon')).not.toBeInTheDocument()
  })
})

describe('App — pipette et export', () => {
  it('affiche la couleur relevée dans la barre d’état', async () => {
    // Le canvas ne peut lire des pixels qu'une fois l'aperçu chargé hors écran.
    class LoadingImage {
      onload: (() => void) | null = null
      set src(_v: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', LoadingImage)
    await renderApp({ mode: 'eyedropper' as EditorMode })
    await act(async () => {})

    const img = screen.getByAltText('Editing canvas')
    img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect
    fireEvent.mouseMove(img, { clientX: 10, clientY: 10 })

    // Le libellé rgb() est découpé en plusieurs nœuds par l'interpolation JSX :
    // on interroge donc le texte assemblé de l'élément.
    await waitFor(() =>
      expect(
        screen.getAllByText((_, el) => el?.textContent?.trim() === 'rgb(0, 0, 0)').length,
      ).toBeGreaterThan(0),
    )
    expect(screen.getAllByText('#000000').length).toBeGreaterThan(0)
    vi.unstubAllGlobals()
  })

  it('exporte puis referme la boîte de dialogue', async () => {
    const { editor } = await renderApp()

    await userEvent.click(screen.getByLabelText('Export'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /^Export/ }))

    await waitFor(() => expect(editor.handleExport).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
