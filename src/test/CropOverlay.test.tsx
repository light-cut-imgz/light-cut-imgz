import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CropOverlay } from '../components/CropOverlay'
import { useCrop } from '../hooks/useCrop'

// jsdom canvas stub
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

describe('CropOverlay', () => {
  it('renders a canvas element', () => {
    render(<CropOverlay imageWidth={800} imageHeight={600} onApply={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/crop selection/i)).toBeInTheDocument()
  })

  it('notifies parent of initial crop rect via onCropRectChange', () => {
    const onCropRectChange = vi.fn()
    render(
      <CropOverlay
        imageWidth={800}
        imageHeight={600}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        onCropRectChange={onCropRectChange}
      />,
    )
    expect(onCropRectChange).toHaveBeenCalledWith(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    )
  })

  it('Enter key calls onApply with the current crop rect', async () => {
    const onApply = vi.fn()
    render(<CropOverlay imageWidth={800} imageHeight={600} onApply={onApply} onCancel={vi.fn()} />)
    await userEvent.keyboard('{Enter}')
    expect(onApply).toHaveBeenCalledOnce()
    const rect = onApply.mock.calls[0][0]
    expect(rect).toHaveProperty('x')
    expect(rect).toHaveProperty('y')
    expect(rect).toHaveProperty('width')
    expect(rect).toHaveProperty('height')
  })

  it('Escape key calls onCancel', async () => {
    const onCancel = vi.fn()
    render(<CropOverlay imageWidth={800} imageHeight={600} onApply={vi.fn()} onCancel={onCancel} />)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('useCrop hook', () => {
  it('initializes with a default crop rect covering 80% of the image', () => {
    const { result } = renderHook(() => useCrop(800, 600))
    expect(result.current.cropRect.x).toBeGreaterThan(0)
    expect(result.current.cropRect.y).toBeGreaterThan(0)
    expect(result.current.cropRect.width).toBeLessThanOrEqual(800)
    expect(result.current.cropRect.height).toBeLessThanOrEqual(600)
  })

  it('setCropRect updates the crop rect', () => {
    const { result } = renderHook(() => useCrop(800, 600))
    const newRect = { x: 10, y: 20, width: 100, height: 80 }
    act(() => {
      result.current.setCropRect(newRect)
    })
    expect(result.current.cropRect).toEqual(newRect)
  })
})
