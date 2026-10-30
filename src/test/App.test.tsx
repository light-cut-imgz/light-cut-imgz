import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  setMenuGridSize,
  setMenuHasImage,
  setMenuLanguage,
  setMenuRecentFiles,
  setMenuTheme,
  setMenuUndoRedo,
} from '../lib/tauri'
import App from '../App'
import { APP_VERSION, LAST_SEEN_KEY } from '../lib/version'
import { useImageEditor } from '../hooks/useImageEditor'
import type { EditorMode } from '../types'
import { editorStub, meta } from './editorStub'
import type { Editor } from './editorStub'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))
const mockClose = vi.fn()
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({ close: mockClose, onCloseRequested: vi.fn() })),
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn().mockResolvedValue(true) }))
vi.mock('../hooks/useImageEditor')
vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return {
    ...actual,
    setMenuLanguage: vi.fn(),
    setMenuTheme: vi.fn(),
    setMenuRecentFiles: vi.fn(),
    setMenuUndoRedo: vi.fn(),
    setMenuHasImage: vi.fn(),
    setMenuGridSize: vi.fn(),
  }
})

const mockListen = vi.mocked(listen)
const mockUseImageEditor = vi.mocked(useImageEditor)
const mockSetMenuLanguage = vi.mocked(setMenuLanguage)
const mockCheck = vi.mocked(check)
const mockRelaunch = vi.mocked(relaunch)

/** Menu-event handlers the app registered, keyed by event name. */
let menuHandlers: Record<string, (e: { payload: unknown }) => void>

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
  vi.mocked(setMenuTheme).mockResolvedValue(undefined)
  vi.mocked(setMenuRecentFiles).mockResolvedValue(undefined)
  vi.mocked(setMenuUndoRedo).mockResolvedValue(undefined)
  vi.mocked(setMenuHasImage).mockResolvedValue(undefined)
  vi.mocked(setMenuGridSize).mockResolvedValue(undefined)
  mockCheck.mockResolvedValue(null)
  delete document.documentElement.dataset.theme
  vi.mocked(getCurrentWindow).mockClear()
  mockListen.mockImplementation(((event: string, handler: unknown) => {
    menuHandlers[event] = handler as (e: { payload: unknown }) => void
    return Promise.resolve(() => {})
  }) as typeof listen)
})

describe('App — chrome', () => {
  it('renders the toolbar, tab bar and canvas for an open image', async () => {
    await renderApp()

    // The tab and the top bar both name the file
    expect(screen.getAllByText('photo.png')).toHaveLength(2)
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

describe('App — top bar', () => {
  it('names the file with its size and format, as in the other apps', async () => {
    await renderApp()

    const bar = document.querySelector('.top-bar') as HTMLElement
    expect(bar.querySelector('.file-badge-name')).toHaveTextContent('photo.png')
    expect(bar.querySelector('.file-badge-meta')).toHaveTextContent('800 × 600 px · PNG')
  })

  it('is not there on the home screen', async () => {
    await renderApp({ image: null, tabs: [], activeTabId: null })

    expect(document.querySelector('.top-bar')).toBeNull()
  })

  it('exports, opens, undoes and redoes from its buttons', async () => {
    const { editor } = await renderApp({ canUndo: true, canRedo: true })

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open image' }))
    expect(editor.handleUndo).toHaveBeenCalledTimes(1)
    expect(editor.handleRedo).toHaveBeenCalledTimes(1)
    expect(editor.handleOpen).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(screen.getByText('Export Image')).toBeInTheDocument()
  })

  it('greys Undo and Redo out when there is nothing to undo or redo', async () => {
    await renderApp({ canUndo: false, canRedo: false })

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('labels its buttons in French when the interface is French', async () => {
    await renderApp()
    await act(async () => {
      menuHandlers['menu-set-language']?.({ payload: 'fr' })
    })

    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ouvrir une image' })).toHaveTextContent(
      'Ouvrir une image',
    )
    expect(screen.getByRole('button', { name: 'Exporter' })).toHaveTextContent('Exporter')
  })

  it('sits on top of the tool sidebar, which has no logo and no Export', async () => {
    await renderApp()

    expect(document.querySelector('aside')?.textContent).not.toContain('Export')
    expect(document.querySelector('aside')?.textContent).not.toMatch(/\bZ\b/)
  })
})

describe('App — side panels', () => {
  it('open to the right of the tool sidebar, not to its left', async () => {
    await renderApp()

    await userEvent.click(screen.getByLabelText('Adjustments'))

    const sidebar = document.querySelector('aside') as HTMLElement
    const panel = screen.getByText('Brightness / Contrast')
    // The panel comes after the sidebar in the document: it is drawn on its right.
    expect(sidebar.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('close the previous one when another opens: only one at a time', async () => {
    await renderApp()

    await userEvent.click(screen.getByLabelText('Adjustments'))
    expect(screen.getByText('Brightness / Contrast')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('EXIF metadata'))
    expect(screen.queryByText('Brightness / Contrast')).not.toBeInTheDocument()
    expect(screen.getByLabelText('EXIF metadata')).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByLabelText('Adjustments'))
    expect(screen.getByText('Brightness / Contrast')).toBeInTheDocument()
    expect(screen.getByLabelText('EXIF metadata')).toHaveAttribute('aria-pressed', 'false')
  })

  it('close the open one when its button is pressed again', async () => {
    await renderApp()

    await userEvent.click(screen.getByLabelText('Adjustments'))
    await userEvent.click(screen.getByLabelText('Adjustments'))

    expect(screen.queryByText('Brightness / Contrast')).not.toBeInTheDocument()
  })

  it('the filters replace the adjustments, and the other way round', async () => {
    await renderApp()

    await userEvent.click(screen.getByLabelText('Adjustments'))
    await userEvent.click(screen.getByLabelText('Filters'))
    expect(screen.queryByText('Brightness / Contrast')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Adjustments'))
    expect(screen.getByText('Brightness / Contrast')).toBeInTheDocument()
  })

  it('the history from the Edit menu replaces the panel that is open', async () => {
    await renderApp()
    await userEvent.click(screen.getByLabelText('Adjustments'))

    await act(async () => {
      menuHandlers['menu-toggle-history']?.({ payload: null })
    })

    expect(screen.queryByText('Brightness / Contrast')).not.toBeInTheDocument()
  })
})

describe('App — tool sidebar as in LightCutVidz', () => {
  it('has a block per tool: a title, then a button saying the action', async () => {
    await renderApp()

    const sections = [...document.querySelectorAll('.tool-sidebar .tool-section')]
    expect(sections.length).toBeGreaterThanOrEqual(10)
    expect(sections[0].querySelector('.tool-label')).toHaveTextContent('Crop')
    expect(sections[0].querySelector('.tool-toggle-btn-label')).toHaveTextContent('Crop')
    const canvas = sections.find((x) => x.querySelector('.tool-label')?.textContent === 'Canvas')
    expect(canvas?.querySelector('.tool-toggle-btn-label')).toHaveTextContent('Extend canvas')
  })

  it('names the blocks and their actions in French when the interface is French', async () => {
    await renderApp()
    await act(async () => {
      menuHandlers['menu-set-language']?.({ payload: 'fr' })
    })

    const first = document.querySelector('.tool-sidebar .tool-section') as HTMLElement
    expect(first.querySelector('.tool-label')).toHaveTextContent('Recadrage')
    expect(first.querySelector('.tool-toggle-btn-label')).toHaveTextContent('Recadrer')
  })

  it('opens every tool in a panel to the right of the sidebar, never above the image', async () => {
    await renderApp({ mode: 'cropping' as EditorMode })

    const panel = screen.getByRole('region', { name: 'Crop' })
    const sidebar = document.querySelector('.tool-sidebar') as HTMLElement
    expect(sidebar.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel).toHaveClass('side-panel')
    expect(panel.querySelector('.side-panel-title')).toHaveTextContent('Crop')
  })

  it('opens the resize and canvas dialogs as panels too, and marks their buttons', async () => {
    await renderApp()

    const canvasButton = () => screen.getByRole('button', { name: 'Canvas resize' })
    const resizeButton = () => screen.getByRole('button', { name: 'Resize image' })

    await userEvent.click(canvasButton())
    expect(screen.getByRole('region', { name: 'Canvas resize' })).toBeInTheDocument()
    expect(canvasButton()).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(resizeButton())
    expect(screen.queryByRole('region', { name: 'Canvas resize' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Resize image' })).toBeInTheDocument()
    expect(resizeButton()).toHaveAttribute('aria-pressed', 'true')
  })

  it('closes the other panel whenever a tool opens, and the tool when a panel opens', async () => {
    const { editor } = await renderApp({ mode: 'cropping' as EditorMode })

    await userEvent.click(screen.getByLabelText('Adjustments'))

    // The crop tool is left, the adjustments are shown
    expect(editor.exitCropMode).toHaveBeenCalled()
    expect(screen.getByText('Brightness / Contrast')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Flip'))
    expect(screen.queryByText('Brightness / Contrast')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Flip' })).toBeInTheDocument()
  })

  it('enters a tool mode after closing the panel that was open', async () => {
    const { editor } = await renderApp()
    await userEvent.click(screen.getByLabelText('Adjustments'))

    await userEvent.click(screen.getByRole('button', { name: 'Rotate' }))

    expect(editor.enterRotateMode).toHaveBeenCalled()
    expect(screen.queryByText('Brightness / Contrast')).not.toBeInTheDocument()
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

    await waitFor(() => expect(screen.getByLabelText('Niveau de zoom')).toBeInTheDocument())
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
      history: [{ key: 'hist.open' }, { key: 'hist.crop', params: { w: '10', h: '10' } }],
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
          history: [{ key: 'hist.open' }],
          historyIndex: 0,
          savedIndex: 0,
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

    expect(
      await screen.findByText(`You are already on the latest version (${APP_VERSION}).`),
    ).toBeInTheDocument()
  })

  const NOTES = [
    '<!-- en -->',
    '### Added',
    '- A new tool.',
    '',
    '<!-- fr -->',
    '### Ajouté',
    '- Un nouvel outil.',
    '',
    '---',
    '## Install',
  ].join('\n')

  async function foundUpdate(downloadAndInstall = vi.fn().mockResolvedValue(undefined)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCheck.mockResolvedValue({ version: '0.7.0', body: NOTES, downloadAndInstall } as any)
    await renderApp()
    await act(async () => {
      menuHandlers['menu-check-updates']?.({ payload: null })
    })
    return downloadAndInstall
  }

  it("annonce la version trouvée au lieu de l'installer d'emblée", async () => {
    const downloadAndInstall = await foundUpdate()

    expect(await screen.findByText('Version 0.7.0 is available.')).toBeInTheDocument()
    expect(downloadAndInstall).not.toHaveBeenCalled()
    expect(mockRelaunch).not.toHaveBeenCalled()
  })

  it('installe puis relance quand on le demande', async () => {
    const downloadAndInstall = await foundUpdate()

    await userEvent.click(await screen.findByRole('button', { name: 'Download & install' }))

    await waitFor(() => expect(mockRelaunch).toHaveBeenCalled())
    expect(downloadAndInstall).toHaveBeenCalled()
  })

  it('peut être remise à plus tard', async () => {
    const downloadAndInstall = await foundUpdate()

    await userEvent.click(await screen.findByRole('button', { name: 'Later' }))

    expect(screen.queryByText('Version 0.7.0 is available.')).not.toBeInTheDocument()
    expect(downloadAndInstall).not.toHaveBeenCalled()
  })

  it("montre les notes de la version dans la langue de l'interface", async () => {
    await foundUpdate()

    await userEvent.click(await screen.findByRole('button', { name: 'What’s new' }))
    expect(screen.getByText('A new tool.')).toBeInTheDocument()
    expect(screen.queryByText('Un nouvel outil.')).not.toBeInTheDocument()
    expect(screen.queryByText('Install')).not.toBeInTheDocument() // ce qui suit « --- » est écarté

    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByText('A new tool.')).not.toBeInTheDocument()
  })

  it('montre les notes en français quand l’interface est en français', async () => {
    await foundUpdate()
    await act(async () => {
      menuHandlers['menu-set-language']?.({ payload: 'fr' })
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Nouveautés' }))

    expect(screen.getByText('Un nouvel outil.')).toBeInTheDocument()
    expect(screen.getByText('La version 0.7.0 est disponible.')).toBeInTheDocument()
  })

  it("n'offre pas de notes quand la version n'en a pas", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCheck.mockResolvedValue({ version: '0.7.0', downloadAndInstall: vi.fn() } as any)
    await renderApp()
    await act(async () => {
      menuHandlers['menu-check-updates']?.({ payload: null })
    })

    expect(await screen.findByText('Version 0.7.0 is available.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'What’s new' })).not.toBeInTheDocument()
  })

  it("signale l'échec de l'installation", async () => {
    await foundUpdate(vi.fn().mockRejectedValue(new Error('disk full')))

    await userEvent.click(await screen.findByRole('button', { name: 'Download & install' }))

    expect(await screen.findByText(/Update check failed: Error: disk full/)).toBeInTheDocument()
    expect(mockRelaunch).not.toHaveBeenCalled()
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

    expect(
      await screen.findByText(`Vous êtes déjà sur la dernière version (${APP_VERSION}).`),
    ).toBeInTheDocument()
  })

  it('se referme tout seul, comme dans les autres applications', async () => {
    mockCheck.mockResolvedValue(null)
    await renderApp()
    vi.useFakeTimers()
    try {
      await act(async () => {
        menuHandlers['menu-check-updates']?.({ payload: null })
      })
      const notice = screen.getByText(`You are already on the latest version (${APP_VERSION}).`)
      expect(notice).toHaveClass('toast', 'toast-success')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000)
      })

      expect(notice).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('montre un échec en rouge, et plus longtemps', async () => {
    mockCheck.mockRejectedValue(new Error('no network'))
    await renderApp()
    vi.useFakeTimers()
    try {
      await act(async () => {
        menuHandlers['menu-check-updates']?.({ payload: null })
      })
      const notice = screen.getByText(/Update check failed/)
      expect(notice).toHaveClass('toast-error')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000)
      })
      expect(notice).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(notice).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('App — mise à jour au démarrage', () => {
  it("cherche une mise à jour sans rien dire quand il n'y en a pas", async () => {
    mockCheck.mockResolvedValue(null)

    await renderApp()

    expect(mockCheck).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/up to date/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Checking/)).not.toBeInTheDocument()
  })

  it("annonce une mise à jour trouvée au démarrage, sans l'installer", async () => {
    const downloadAndInstall = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCheck.mockResolvedValue({ version: '0.8.0', downloadAndInstall } as any)

    await renderApp()

    expect(await screen.findByText('Version 0.8.0 is available.')).toBeInTheDocument()
    expect(downloadAndInstall).not.toHaveBeenCalled()
  })

  it('ne dit rien quand la recherche échoue (pas de réseau)', async () => {
    mockCheck.mockRejectedValue(new Error('offline'))

    await renderApp()

    expect(screen.queryByText(/Update check failed/)).not.toBeInTheDocument()
  })
})

describe('App — menu natif', () => {
  it('ouvre les nouveautés depuis Aide', async () => {
    await renderApp()

    await act(async () => {
      menuHandlers['menu-changelog']?.({ payload: null })
    })

    expect(screen.getByRole('dialog', { name: 'What’s new' })).toBeInTheDocument()
  })

  it('ouvre un fichier récent choisi dans le menu', async () => {
    const { editor } = await renderApp()

    await act(async () => {
      menuHandlers['menu-open-recent']?.({ payload: '/home/me/tron.jpg' })
    })

    expect(editor.handleOpenByPaths).toHaveBeenCalledWith(['/home/me/tron.jpg'])
  })

  it('efface la liste des récents quand le menu le demande, accueil compris', async () => {
    localStorage.setItem('lciz-recent', JSON.stringify(['/tmp/a.png']))
    await renderApp({ image: null, tabs: [], activeTabId: null })
    expect(screen.getByText('a.png')).toBeInTheDocument()

    await act(async () => {
      menuHandlers['menu-clear-recent']?.({ payload: null })
    })

    expect(screen.queryByText('a.png')).not.toBeInTheDocument()
    expect(localStorage.getItem('lciz-recent')).toBeNull()
  })

  it('choisit la taille de la grille depuis Affichage, et la retient', async () => {
    await renderApp()

    await act(async () => {
      menuHandlers['menu-set-grid']?.({ payload: 100 })
    })

    expect(JSON.parse(localStorage.getItem('lciz-prefs') ?? '{}').gridSize).toBe(100)
    expect(setMenuGridSize).toHaveBeenLastCalledWith(100)
  })

  it('ignore une taille de grille que le menu ne propose pas', async () => {
    await renderApp()
    vi.mocked(setMenuGridSize).mockClear()

    await act(async () => {
      menuHandlers['menu-set-grid']?.({ payload: 7 })
    })

    expect(setMenuGridSize).not.toHaveBeenCalled()
    expect(localStorage.getItem('lciz-prefs')).toBeNull()
  })

  it('coche dans le menu la taille de grille enregistrée', async () => {
    localStorage.setItem('lciz-prefs', JSON.stringify({ gridSize: 25 }))

    await renderApp()

    expect(setMenuGridSize).toHaveBeenCalledWith(25)
  })

  it("n'a plus d'entrée Préférences dans le menu", async () => {
    await renderApp()

    expect(menuHandlers['menu-prefs']).toBeUndefined()
  })

  it('ferme la fenêtre pour quitter, ce qui passe par la garde des modifications', async () => {
    await renderApp()

    await act(async () => {
      menuHandlers['menu-quit']?.({ payload: null })
    })

    expect(mockClose).toHaveBeenCalled()
  })

  it('donne au menu la liste des récents et l’état de l’historique', async () => {
    localStorage.setItem('lciz-recent', JSON.stringify(['/tmp/a.png', '/tmp/b.png']))

    await renderApp({ canUndo: true, canRedo: false })

    expect(setMenuRecentFiles).toHaveBeenCalledWith(['/tmp/a.png', '/tmp/b.png'])
    expect(setMenuUndoRedo).toHaveBeenCalledWith(true, false)
  })
})

describe('App — nouveautés après une mise à jour', () => {
  it('ne les montre pas à la première installation, mais retient la version', async () => {
    await renderApp()

    expect(screen.queryByRole('dialog', { name: 'What’s new' })).not.toBeInTheDocument()
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe(APP_VERSION)
  })

  it("ne les remontre pas tant que la version n'a pas changé", async () => {
    localStorage.setItem(LAST_SEEN_KEY, APP_VERSION)

    await renderApp()

    expect(screen.queryByRole('dialog', { name: 'What’s new' })).not.toBeInTheDocument()
  })

  it('les montre une fois quand la version a changé, puis retient la nouvelle', async () => {
    localStorage.setItem(LAST_SEEN_KEY, '0.0.1')

    await renderApp()

    expect(screen.getByRole('dialog', { name: 'What’s new' })).toBeInTheDocument()
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe(APP_VERSION)
  })
})

describe('App — menu et image ouverte', () => {
  it("dit au menu qu'une image est ouverte, pour que l'historique ne soit plus grisé", async () => {
    await renderApp()

    expect(setMenuHasImage).toHaveBeenCalledWith(true)
  })

  it("dit au menu qu'il n'y en a pas sur l'écran d'accueil", async () => {
    await renderApp({ image: null, tabs: [], activeTabId: null })

    expect(setMenuHasImage).toHaveBeenLastCalledWith(false)
  })
})

describe('App — thème', () => {
  it("suit le système tant que rien n'est choisi", async () => {
    await renderApp()

    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(setMenuTheme).toHaveBeenCalledWith('system')
  })

  it('applique le thème choisi dans Affichage, et le retient', async () => {
    await renderApp()

    await act(async () => {
      menuHandlers['menu-set-theme']?.({ payload: 'light' })
    })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(setMenuTheme).toHaveBeenLastCalledWith('light')
    expect(JSON.parse(localStorage.getItem('lciz-prefs') ?? '{}').theme).toBe('light')

    await act(async () => {
      menuHandlers['menu-set-theme']?.({ payload: 'dark' })
    })
    expect(document.documentElement.dataset.theme).toBe('dark')

    await act(async () => {
      menuHandlers['menu-set-theme']?.({ payload: 'system' })
    })
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('retombe sur le système pour un thème inconnu', async () => {
    await renderApp()

    await act(async () => {
      menuHandlers['menu-set-theme']?.({ payload: 'neon' })
    })

    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('applique le thème enregistré dès l’ouverture', async () => {
    localStorage.setItem('lciz-prefs', JSON.stringify({ theme: 'dark' }))

    await renderApp()

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('offers a reset on a tool panel, enabled once that tool was used', async () => {
    await renderApp({ image: meta({ tools: ['flip'], historyIndex: 1 }), historyIndex: 1 })
    await userEvent.click(screen.getByLabelText('Flip'))

    const reset = within(screen.getByRole('region', { name: 'Flip' })).getByRole('button', {
      name: 'Reset',
    })
    expect(reset).toBeEnabled()
  })

  it('disables the reset of a tool that was not used, even on an edited image', async () => {
    await renderApp({ image: meta({ tools: ['crop'], historyIndex: 1 }), historyIndex: 1 })
    await userEvent.click(screen.getByLabelText('Flip'))

    expect(
      within(screen.getByRole('region', { name: 'Flip' })).getByRole('button', { name: 'Reset' }),
    ).toBeDisabled()
  })

  it('removes the close listener even when it registers after the app unmounted', async () => {
    const unlisten = vi.fn()
    let register: (fn: () => void) => void = () => {}
    const onCloseRequested = vi.fn(() => new Promise<() => void>((resolve) => (register = resolve)))
    vi.mocked(getCurrentWindow).mockReturnValue({
      close: mockClose,
      onCloseRequested,
    } as unknown as ReturnType<typeof getCurrentWindow>)

    const { unmount } = await renderApp()
    unmount()
    await act(async () => register(unlisten))

    expect(unlisten).toHaveBeenCalledTimes(1)
  })
})
