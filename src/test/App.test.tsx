import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { setMenuLanguage } from '../lib/tauri'
import App from '../App'
import { useImageEditor } from '../hooks/useImageEditor'
import type { EditorMode, ImageMeta } from '../types'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))
vi.mock('../hooks/useImageEditor')
vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return { ...actual, setMenuLanguage: vi.fn() }
})

const mockListen = vi.mocked(listen)
const mockUseImageEditor = vi.mocked(useImageEditor)
const mockSetMenuLanguage = vi.mocked(setMenuLanguage)
const mockCheck = vi.mocked(check)
const mockRelaunch = vi.mocked(relaunch)

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

/** Menu-event handlers the app registered, keyed by event name. */
let menuHandlers: Record<string, (e: { payload: unknown }) => void>

type Editor = ReturnType<typeof useImageEditor>

function editorStub(over: Partial<Editor> = {}): Editor {
  const noop = vi.fn()
  const asyncNoop = vi.fn().mockResolvedValue(undefined)
  return {
    loadExif: vi.fn().mockResolvedValue([]),
    handleStripExif: asyncNoop,
    handleOpenByPaths: asyncNoop,
    handleCopyToClipboard: asyncNoop,
    enterEyedropperMode: noop,
    exitEyedropperMode: noop,
    enterInpaintingMode: noop,
    exitInpaintingMode: noop,
    handleInpaint: asyncNoop,
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
    handleOpen: asyncNoop,
    handleCropApply: asyncNoop,
    handleFlip: asyncNoop,
    handleResize: asyncNoop,
    handleCanvasResize: asyncNoop,
    handleRotate: asyncNoop,
    handleExport: asyncNoop,
    handleUndo: asyncNoop,
    handleRedo: asyncNoop,
    handleCloseTab: asyncNoop,
    handleCloseOtherTabs: asyncNoop,
    handleCloseAllTabs: asyncNoop,
    setActiveTab: noop,
    enterCropMode: noop,
    exitCropMode: noop,
    enterRotateMode: noop,
    exitRotateMode: noop,
    setZoom: noop,
    clearError: noop,
    handleAdjustBrightnessContrast: asyncNoop,
    handleAdjustExposure: asyncNoop,
    handleAdjustHueSaturation: asyncNoop,
    handleAdjustVibrance: asyncNoop,
    handleAdjustLevels: asyncNoop,
    handleAdjustCurves: asyncNoop,
    handleAdjustWhiteBalance: asyncNoop,
    handleAdjustSharpen: asyncNoop,
    handleAdjustDenoise: asyncNoop,
    handleFilterGrayscale: asyncNoop,
    handleFilterSepia: asyncNoop,
    handleFilterInvert: asyncNoop,
    handleFilterVignette: asyncNoop,
    handleFilterGrain: asyncNoop,
    handleFilterPixelate: asyncNoop,
    handleFilterPosterize: asyncNoop,
    handleFilterDuotone: asyncNoop,
    handleFilterSketch: asyncNoop,
    handleFilterLomo: asyncNoop,
    handleFilterVintage: asyncNoop,
    handleFilterCool: asyncNoop,
    handleFilterWarm: asyncNoop,
    handleFilterFade: asyncNoop,
    handleFilterDrama: asyncNoop,
    handleFilterCrossProcess: asyncNoop,
    handleFilterBlurGaussian: asyncNoop,
    handleFilterBlurMotion: asyncNoop,
    handleFilterBlurRadial: asyncNoop,
    handleResetToOriginal: asyncNoop,
    ...over,
  } as unknown as Editor
}

/** Renders the app with a stubbed editor and settles the mount effects. */
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
  menuHandlers = {}
  // Re-arm after clearAllMocks: App calls `.catch()` on the result, and an
  // undefined return there throws inside the effect, which would stop every
  // later effect — including the menu listeners — from registering.
  mockSetMenuLanguage.mockResolvedValue(undefined)
  mockListen.mockImplementation(((event: string, handler: unknown) => {
    menuHandlers[event] = handler as (e: { payload: unknown }) => void
    return Promise.resolve(() => {})
  }) as typeof listen)
})

describe('App — chrome', () => {
  it('renders the toolbar, tab bar and canvas for an open image', async () => {
    await renderApp()

    expect(screen.getByText('photo.png')).toBeInTheDocument()
    expect(screen.getByLabelText('Zoom level')).toBeInTheDocument()
  })

  it('shows an error banner and lets it be dismissed', async () => {
    const { editor } = await renderApp({ error: 'something broke' })

    expect(screen.getByText(/something broke/)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Dismiss error'))

    expect(editor.clearError).toHaveBeenCalled()
  })

  it('hides the zoom controls when no image is open', async () => {
    await renderApp({ image: null, tabs: [], activeTabId: null })
    expect(screen.queryByLabelText('Zoom level')).not.toBeInTheDocument()
  })
})

describe('App — zoom controls', () => {
  it('zooms out, in and resets', async () => {
    const { editor } = await renderApp()

    await userEvent.click(screen.getByLabelText('Zoom out'))
    await userEvent.click(screen.getByLabelText('Zoom in'))
    await userEvent.click(screen.getByLabelText('Reset zoom'))

    expect(editor.setZoom).toHaveBeenCalledTimes(3)
    expect(vi.mocked(editor.setZoom)).toHaveBeenLastCalledWith(1)
  })

  it('picks a zoom preset', async () => {
    const { editor } = await renderApp()

    await userEvent.click(screen.getByLabelText('Zoom level'))
    await userEvent.click(screen.getByRole('option', { name: '200%' }))

    expect(editor.setZoom).toHaveBeenCalledWith(2)
  })
})

describe('App — mode bars', () => {
  it('shows the crop bar in cropping mode', async () => {
    await renderApp({ mode: 'cropping' as EditorMode })
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
  })

  it('shows the rotation bar in rotating mode', async () => {
    await renderApp({ mode: 'rotating' as EditorMode })
    expect(screen.getByRole('button', { name: /counter-clockwise/i })).toBeInTheDocument()
  })

  it('shows the inpainting bar in inpainting mode', async () => {
    await renderApp({ mode: 'inpainting' as EditorMode })
    expect(screen.getByRole('button', { name: 'Clear mask' })).toBeInTheDocument()
  })

  it('shows the eyedropper bar in eyedropper mode', async () => {
    await renderApp({ mode: 'eyedropper' as EditorMode })
    expect(screen.getByText('Color Picker')).toBeInTheDocument()
  })

  it('shows no mode bar while idle', async () => {
    await renderApp()
    expect(screen.queryByText('Color Picker')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear mask' })).not.toBeInTheDocument()
  })
})

describe('App — menu events', () => {
  it('opens an image from the menu', async () => {
    const { editor } = await renderApp()

    await act(async () => {
      menuHandlers['menu-open']?.({ payload: null })
    })

    expect(editor.handleOpen).toHaveBeenCalled()
  })

  it('closes the active tab from the menu', async () => {
    const { editor } = await renderApp()

    await act(async () => {
      menuHandlers['menu-close-tab']?.({ payload: null })
    })

    expect(editor.handleCloseTab).toHaveBeenCalledWith('t1')
  })

  it('does not close a tab when none is active', async () => {
    const { editor } = await renderApp({ activeTabId: null, tabs: [], image: null })

    await act(async () => {
      menuHandlers['menu-close-tab']?.({ payload: null })
    })

    expect(editor.handleCloseTab).not.toHaveBeenCalled()
  })

  it('closes the other tabs and every tab', async () => {
    const { editor } = await renderApp()

    await act(async () => {
      menuHandlers['menu-close-others']?.({ payload: null })
    })
    await act(async () => {
      menuHandlers['menu-close-all']?.({ payload: null })
    })

    expect(editor.handleCloseOtherTabs).toHaveBeenCalled()
    expect(editor.handleCloseAllTabs).toHaveBeenCalled()
  })

  it('undoes and redoes from the menu', async () => {
    const { editor } = await renderApp()

    await act(async () => {
      menuHandlers['menu-undo']?.({ payload: null })
    })
    await act(async () => {
      menuHandlers['menu-redo']?.({ payload: null })
    })

    expect(editor.handleUndo).toHaveBeenCalled()
    expect(editor.handleRedo).toHaveBeenCalled()
  })

  it('toggles the history panel from the menu', async () => {
    await renderApp()
    expect(screen.queryByText('History')).not.toBeInTheDocument()

    await act(async () => {
      menuHandlers['menu-toggle-history']?.({ payload: null })
    })

    expect(await screen.findByText('History')).toBeInTheDocument()
  })

  it('opens dropped files', async () => {
    const { editor } = await renderApp()

    await act(async () => {
      menuHandlers['tauri://drag-drop']?.({ payload: { paths: ['/tmp/a.png', '/tmp/b.png'] } })
    })

    expect(editor.handleOpenByPaths).toHaveBeenCalledWith(['/tmp/a.png', '/tmp/b.png'])
  })

  it('ignores a drop with no paths', async () => {
    const { editor } = await renderApp()

    await act(async () => {
      menuHandlers['tauri://drag-drop']?.({ payload: { paths: [] } })
    })

    expect(editor.handleOpenByPaths).not.toHaveBeenCalled()
  })

  it('switches language from the menu', async () => {
    await renderApp()

    await act(async () => {
      menuHandlers['menu-set-language']?.({ payload: 'fr' })
    })

    await waitFor(() => expect(screen.getByLabelText('Zoom level')).toBeInTheDocument())
  })
})

describe('App — keyboard shortcuts', () => {
  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z', async () => {
    const { editor } = await renderApp()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })

    expect(editor.handleUndo).toHaveBeenCalled()
    expect(editor.handleRedo).toHaveBeenCalled()
  })

  it('leaves eyedropper mode on Escape', async () => {
    const { editor } = await renderApp({ mode: 'eyedropper' as EditorMode })

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(editor.exitEyedropperMode).toHaveBeenCalled()
  })

  it('leaves inpainting mode on Escape', async () => {
    const { editor } = await renderApp({ mode: 'inpainting' as EditorMode })

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(editor.exitInpaintingMode).toHaveBeenCalled()
  })

  it('ignores Escape while idle', async () => {
    const { editor } = await renderApp()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(editor.exitEyedropperMode).not.toHaveBeenCalled()
    expect(editor.exitInpaintingMode).not.toHaveBeenCalled()
  })
})

describe('App — side panels', () => {
  it('shows the history panel with its entries once toggled', async () => {
    await renderApp({
      history: [{ label: 'Open' }, { label: 'Crop 10×10' }],
      historyIndex: 1,
    })

    await act(async () => {
      menuHandlers['menu-toggle-history']?.({ payload: null })
    })

    expect(await screen.findByText('Crop 10×10')).toBeInTheDocument()
  })
})

describe('App — recent files', () => {
  it('remembers the path of an opened image', async () => {
    await renderApp()
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('lciz-recent') ?? '[]')).toContain('/tmp/photo.png'),
    )
  })

  it('remembers nothing when the image has no path', async () => {
    await renderApp({
      tabs: [
        {
          id: 't1',
          label: 'photo.png',
          image: meta({ path: undefined }),
          history: [{ label: 'Open' }],
          historyIndex: 0,
          zoom: 1,
        },
      ],
    } as Partial<Editor>)

    expect(localStorage.getItem('lciz-recent')).toBeNull()
  })
})

describe('App — mise à jour depuis le menu', () => {
  it("dit que tout est à jour quand il n'y a rien à installer", async () => {
    mockCheck.mockResolvedValue(null)
    await renderApp()

    await act(async () => {
      menuHandlers['menu-check-updates']?.({ payload: null })
    })

    expect(await screen.findByText('light-cut-imgz is up to date.')).toBeInTheDocument()
  })

  it('installe puis relance quand une version est disponible', async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCheck.mockResolvedValue({ version: '0.7.0', downloadAndInstall } as any)
    await renderApp()

    await act(async () => {
      menuHandlers['menu-check-updates']?.({ payload: null })
    })

    await waitFor(() => expect(mockRelaunch).toHaveBeenCalled())
    expect(downloadAndInstall).toHaveBeenCalled()
  })

  it("n'ouvre plus la page des versions, il installe sur place", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCheck.mockResolvedValue({ version: '0.7.0', downloadAndInstall } as any)
    await renderApp()

    await act(async () => {
      menuHandlers['menu-check-updates']?.({ payload: null })
    })

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalled())
  })

  it("signale l'échec sans casser l'application", async () => {
    mockCheck.mockRejectedValue(new Error('no network'))
    await renderApp()

    await act(async () => {
      menuHandlers['menu-check-updates']?.({ payload: null })
    })

    expect(await screen.findByText(/Update check failed/)).toBeInTheDocument()
    expect(screen.getByLabelText('Zoom level')).toBeInTheDocument()
  })

  it('parle la langue choisie', async () => {
    mockCheck.mockResolvedValue(null)
    await renderApp()
    await act(async () => {
      menuHandlers['menu-set-language']?.({ payload: 'fr' })
    })

    await act(async () => {
      menuHandlers['menu-check-updates']?.({ payload: null })
    })

    expect(await screen.findByText('light-cut-imgz est à jour.')).toBeInTheDocument()
  })

  it('se referme quand on le rejette', async () => {
    mockCheck.mockResolvedValue(null)
    await renderApp()
    await act(async () => {
      menuHandlers['menu-check-updates']?.({ payload: null })
    })
    const notice = await screen.findByText('light-cut-imgz is up to date.')

    fireEvent.click(screen.getByLabelText('Dismiss'))

    expect(notice).not.toBeInTheDocument()
  })
})
