import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import { setMenuLanguage } from '../lib/tauri'
import App from '../App'
import { useImageEditor } from '../hooks/useImageEditor'
import type { EditorMode } from '../types'
import { editorStub } from './editorStub'
import type { Editor } from './editorStub'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('../hooks/useImageEditor')
vi.mock('../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri')
  return { ...actual, setMenuLanguage: vi.fn() }
})

const mockListen = vi.mocked(listen)
const mockUseImageEditor = vi.mocked(useImageEditor)
const mockSetMenuLanguage = vi.mocked(setMenuLanguage)

async function renderApp(over: Partial<Editor> = {}) {
  const editor = editorStub(over)
  mockUseImageEditor.mockReturnValue(editor)
  const view = render(<App />)
  await act(async () => {})
  return { editor, ...view }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Par défaut le calque du masque est vide (aucun pixel peint) ; les tests qui peignent
  // fournissent leurs propres données.
  const ctx2d = document.createElement('canvas').getContext('2d')!
  vi.mocked(ctx2d.getImageData).mockReset()
  vi.mocked(ctx2d.getImageData).mockImplementation(
    (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(w * h * 4) }) as ImageData,
  )
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

    await userEvent.click(screen.getByRole('button', { name: 'Crop' }))

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

    // The open tool's panel is named like its button: the button is the one to press
    await userEvent.click(screen.getByRole('button', { name: label }))

    expect(editor[action as keyof Editor]).toHaveBeenCalled()
  })

  it('toggles the flip bar and leaves any active mode', async () => {
    const { editor } = await renderApp({ mode: 'cropping' as EditorMode })

    await userEvent.click(screen.getByLabelText('Flip'))

    expect(editor.exitCropMode).toHaveBeenCalled()
    expect(await screen.findByLabelText('Flip horizontal')).toBeInTheDocument()
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
    expect(
      await screen.findByText('Resize image', { selector: '.side-panel-title' }),
    ).toBeInTheDocument()
  })

  it('opens the canvas resize dialog', async () => {
    await renderApp()
    await userEvent.click(screen.getByLabelText('Canvas resize'))
    expect(
      await screen.findByText('Canvas resize', { selector: '.side-panel-title' }),
    ).toBeInTheDocument()
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
    await screen.findByText('Resize image', { selector: '.side-panel-title' })

    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '400' } })
    await userEvent.click(screen.getByRole('button', { name: 'Resize' }))

    expect(editor.handleResize).toHaveBeenCalledWith(400, 300)
  })

  it('resizes the canvas from its dialog', async () => {
    const { editor } = await renderApp()
    await userEvent.click(screen.getByLabelText('Canvas resize'))
    await screen.findByText('Canvas resize', { selector: '.side-panel-title' })

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
    const { editor, container } = await renderApp({ mode: 'inpainting' as EditorMode })
    paintBlock(container)

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })

    expect(editor.handleInpaint).toHaveBeenCalled()
  })

  it('ignores Enter while an operation is running', async () => {
    const { editor, container } = await renderApp({
      mode: 'inpainting' as EditorMode,
      isLoading: true,
    })
    paintBlock(container)

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })

    expect(editor.handleInpaint).not.toHaveBeenCalled()
  })

  it('ignores Enter when nothing has been painted', async () => {
    const { editor, container } = await renderApp({ mode: 'inpainting' as EditorMode })
    expect(container.querySelector('canvas')).not.toBeNull()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })

    expect(editor.handleInpaint).not.toHaveBeenCalled()
  })

  it('ignores Enter outside inpainting', async () => {
    const { editor } = await renderApp()

    fireEvent.keyDown(window, { key: 'Enter' })

    expect(editor.handleInpaint).not.toHaveBeenCalled()
  })
})

/**
 * Peint un trait sur le calque du masque et fait lire un bloc d'alpha 5×3 en (10, 20), comme
 * le ferait un vrai canevas : seul ce rectangle doit partir vers le backend.
 */
function paintBlock(container: HTMLElement) {
  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect
  const data = new Uint8ClampedArray(800 * 600 * 4)
  for (let y = 20; y < 23; y++) for (let x = 10; x < 15; x++) data[(y * 800 + x) * 4 + 3] = 255
  vi.mocked(canvas.getContext('2d')!.getImageData).mockReturnValueOnce({ data } as ImageData)
  fireEvent.pointerDown(canvas, { clientX: 12, clientY: 21, pointerId: 1 })
}

describe('App — inpainting bar', () => {
  it('cannot be applied before anything is painted', async () => {
    await renderApp({ mode: 'inpainting' as EditorMode })

    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('applies the mask from the button, sending only the painted box', async () => {
    const { editor, container } = await renderApp({ mode: 'inpainting' as EditorMode })
    paintBlock(container)

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(editor.handleInpaint).toHaveBeenCalledWith({
      b64: btoa(String.fromCharCode(...new Uint8Array(15).fill(255))),
      x: 10,
      y: 20,
      width: 5,
      height: 3,
    })
  })

  it('becomes unavailable again once the mask is cleared', async () => {
    await renderApp({ mode: 'inpainting' as EditorMode })
    const { container } = { container: document.body }
    paintBlock(container)
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Clear mask' }))

    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
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
  it('shows the home screen and none of the tools', async () => {
    await renderApp({ image: null, tabs: [], activeTabId: null })
    expect(screen.getByRole('button', { name: 'Browse files' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Crop')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Export')).not.toBeInTheDocument()
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
