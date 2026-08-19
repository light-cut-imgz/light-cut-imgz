import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Canvas } from '../components/Canvas'
import type { ImageMeta } from '../types'

const image: ImageMeta = {
  width: 800,
  height: 600,
  format: 'png',
  preview: 'data:image/png;base64,abc123',
  canUndo: false,
  canRedo: false,
}

/** The <img> is laid out at its natural size so client and image pixels match. */
function sizeImage(el: HTMLElement) {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect
}

function renderCanvas(props: Partial<Parameters<typeof Canvas>[0]> = {}) {
  const handlers = {
    onCropApply: vi.fn(),
    onCropCancel: vi.fn(),
    onZoomChange: vi.fn(),
    onOpen: vi.fn(),
    onColorPick: vi.fn(),
    onColorPickConfirm: vi.fn(),
    onMaskCanvasRef: vi.fn(),
  }
  const view = render(<Canvas image={image} mode="idle" zoom={1} {...handlers} {...props} />)
  return { ...handlers, ...view }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Canvas — zooming with the wheel', () => {
  it('zooms in when scrolling up', () => {
    const { onZoomChange, container } = renderCanvas()

    fireEvent.wheel(container.firstChild as Element, { deltaY: -100 })

    expect(onZoomChange).toHaveBeenCalledWith(expect.any(Function))
    const updater = vi.mocked(onZoomChange).mock.calls[0][0] as (p: number) => number
    expect(updater(1)).toBeGreaterThan(1)
  })

  it('zooms out when scrolling down', () => {
    const { onZoomChange, container } = renderCanvas()

    fireEvent.wheel(container.firstChild as Element, { deltaY: 100 })

    const updater = vi.mocked(onZoomChange).mock.calls[0][0] as (p: number) => number
    expect(updater(1)).toBeLessThan(1)
  })

  it('ignores the wheel when no image is open', () => {
    const { onZoomChange, container } = renderCanvas({ image: null })

    fireEvent.wheel(container.firstChild as Element, { deltaY: -100 })

    expect(onZoomChange).not.toHaveBeenCalled()
  })
})

describe('Canvas — eyedropper', () => {
  /** An <img> that reports load immediately, so the offscreen copy is ready. */
  class LoadingImage {
    onload: (() => void) | null = null
    set src(_v: string) {
      queueMicrotask(() => this.onload?.())
    }
  }

  /** Renders with the offscreen pixel source already populated. */
  async function renderWithPixels(props: Partial<Parameters<typeof Canvas>[0]> = {}) {
    vi.stubGlobal('Image', LoadingImage)
    const view = renderCanvas({ mode: 'eyedropper', ...props })
    await act(async () => {})
    const img = screen.getByAltText('Editing canvas')
    sizeImage(img)
    return { ...view, img }
  }

  it('reports the colour under the pointer', async () => {
    const { onColorPick, img } = await renderWithPixels()

    fireEvent.mouseMove(img, { clientX: 100, clientY: 100 })

    expect(onColorPick).toHaveBeenCalledWith({ r: 0, g: 0, b: 0, a: 255 })
    vi.unstubAllGlobals()
  })

  it('reports nothing once the pointer leaves the image', () => {
    const { onColorPick } = renderCanvas({ mode: 'eyedropper' })
    const img = screen.getByAltText('Editing canvas')
    sizeImage(img)

    fireEvent.mouseMove(img, { clientX: 900, clientY: 100 })

    expect(onColorPick).toHaveBeenCalledWith(null)
  })

  it('clears the picked colour on mouse leave', () => {
    const { onColorPick } = renderCanvas({ mode: 'eyedropper' })
    const img = screen.getByAltText('Editing canvas')
    sizeImage(img)

    fireEvent.mouseLeave(img)

    expect(onColorPick).toHaveBeenCalledWith(null)
  })

  it('does nothing on mouse move outside eyedropper mode', () => {
    const { onColorPick } = renderCanvas({ mode: 'idle' })
    const img = screen.getByAltText('Editing canvas')
    sizeImage(img)

    fireEvent.mouseMove(img, { clientX: 100, clientY: 100 })

    expect(onColorPick).not.toHaveBeenCalled()
  })

  it('confirms a colour on click', async () => {
    const { onColorPickConfirm, img } = await renderWithPixels()

    fireEvent.click(img, { clientX: 100, clientY: 100 })

    expect(onColorPickConfirm).toHaveBeenCalledWith({ r: 0, g: 0, b: 0, a: 255 })
    vi.unstubAllGlobals()
  })

  it('reports no colour while the preview has not loaded yet', () => {
    const { onColorPick } = renderCanvas({ mode: 'eyedropper' })
    const img = screen.getByAltText('Editing canvas')
    sizeImage(img)

    fireEvent.mouseMove(img, { clientX: 100, clientY: 100 })

    expect(onColorPick).toHaveBeenCalledWith(null)
  })

  it('confirms nothing when clicking outside the image bounds', () => {
    const { onColorPickConfirm } = renderCanvas({ mode: 'eyedropper' })
    const img = screen.getByAltText('Editing canvas')
    sizeImage(img)

    fireEvent.click(img, { clientX: 5000, clientY: 5000 })

    expect(onColorPickConfirm).not.toHaveBeenCalled()
  })

  it('reports no colour when the browser hands back no 2D context', async () => {
    const original = HTMLCanvasElement.prototype.getContext
    const { onColorPick, img } = await renderWithPixels()
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never

    fireEvent.mouseMove(img, { clientX: 100, clientY: 100 })

    expect(onColorPick).toHaveBeenCalledWith(null)
    HTMLCanvasElement.prototype.getContext = original
    vi.unstubAllGlobals()
  })

  it('confirms the last colour seen when the pixels are no longer readable', async () => {
    // Le survol a mémorisé une couleur ; si le contexte disparaît avant le clic,
    // on confirme cette dernière lecture plutôt que de ne rien renvoyer.
    const original = HTMLCanvasElement.prototype.getContext
    const { onColorPickConfirm, img } = await renderWithPixels()
    fireEvent.mouseMove(img, { clientX: 100, clientY: 100 })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never

    fireEvent.click(img, { clientX: 100, clientY: 100 })

    expect(onColorPickConfirm).toHaveBeenCalledWith({ r: 0, g: 0, b: 0, a: 255 })
    HTMLCanvasElement.prototype.getContext = original
    vi.unstubAllGlobals()
  })

  it('confirms nothing on click outside eyedropper mode', () => {
    const { onColorPickConfirm } = renderCanvas({ mode: 'idle' })
    const img = screen.getByAltText('Editing canvas')
    sizeImage(img)

    fireEvent.click(img, { clientX: 100, clientY: 100 })

    expect(onColorPickConfirm).not.toHaveBeenCalled()
  })
})

describe('Canvas — inpainting mask', () => {
  function maskCanvas(container: HTMLElement) {
    const canvases = container.querySelectorAll('canvas')
    return canvases[0] as HTMLCanvasElement
  }

  it('hands the mask canvas back to the parent', () => {
    const { onMaskCanvasRef } = renderCanvas({ mode: 'inpainting' })
    expect(onMaskCanvasRef).toHaveBeenCalled()
  })

  it('paints while the button is held and stops on release', () => {
    const { container } = renderCanvas({ mode: 'inpainting', brushSize: 20 })
    const canvas = maskCanvas(container)
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect
    const ctx = canvas.getContext('2d')!

    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 120 })
    fireEvent.mouseUp(canvas)
    const painted = vi.mocked(ctx.arc).mock.calls.length
    fireEvent.mouseMove(canvas, { clientX: 200, clientY: 200 })

    expect(painted).toBeGreaterThan(0)
    expect(vi.mocked(ctx.arc).mock.calls.length).toBe(painted)
  })

  it('stops painting when the pointer leaves the canvas', () => {
    const { container } = renderCanvas({ mode: 'inpainting' })
    const canvas = maskCanvas(container)
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect
    const ctx = canvas.getContext('2d')!

    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 })
    fireEvent.mouseLeave(canvas)
    const painted = vi.mocked(ctx.arc).mock.calls.length
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 50 })

    expect(vi.mocked(ctx.arc).mock.calls.length).toBe(painted)
  })

  it('wipes the mask when asked', () => {
    const { rerender, container } = renderCanvas({ mode: 'inpainting', maskClearSignal: 0 })
    const ctx = maskCanvas(container).getContext('2d')!
    vi.mocked(ctx.clearRect).mockClear()

    rerender(
      <Canvas
        image={image}
        mode="inpainting"
        zoom={1}
        maskClearSignal={1}
        onCropApply={vi.fn()}
        onCropCancel={vi.fn()}
        onZoomChange={vi.fn()}
        onOpen={vi.fn()}
      />,
    )

    expect(ctx.clearRect).toHaveBeenCalled()
  })
})

describe('Canvas — offscreen preview', () => {
  it('draws the preview into an offscreen canvas once the image loads', async () => {
    const drawn: HTMLImageElement[] = []
    class FakeImage {
      onload: (() => void) | null = null
      set src(_v: string) {
        drawn.push(this as unknown as HTMLImageElement)
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', FakeImage)

    renderCanvas()
    await act(async () => {})

    expect(drawn).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  it('drops the offscreen canvas when the image goes away', () => {
    const { rerender } = renderCanvas()

    rerender(
      <Canvas
        image={null}
        mode="idle"
        zoom={1}
        onCropApply={vi.fn()}
        onCropCancel={vi.fn()}
        onZoomChange={vi.fn()}
        onOpen={vi.fn()}
      />,
    )

    expect(screen.queryByAltText('Editing canvas')).not.toBeInTheDocument()
  })
})

describe('Canvas — empty state', () => {
  it('offers to open a file', () => {
    const { onOpen } = renderCanvas({ image: null })

    fireEvent.click(screen.getByText(/Click here or use File/i))

    expect(onOpen).toHaveBeenCalled()
  })
})
