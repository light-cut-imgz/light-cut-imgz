import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Canvas } from '../components/Canvas'
import type { ImageMeta } from '../types'

const mockImage: ImageMeta = {
  width: 800,
  height: 600,
  format: 'png',
  preview: 'data:image/png;base64,abc123',
  canUndo: false,
  canRedo: false,
}

function renderCanvas(props: Partial<Parameters<typeof Canvas>[0]> = {}) {
  const defaults = {
    image: null as ImageMeta | null,
    mode: 'idle' as const,
    zoom: 1,
    onCropApply: vi.fn(),
    onCropCancel: vi.fn(),
    onZoomChange: vi.fn(),
    onOpen: vi.fn(),
  }
  return render(<Canvas {...defaults} {...props} />)
}

describe('Canvas', () => {
  it('shows empty state when no image is loaded', () => {
    renderCanvas()
    expect(screen.getByText(/open an image/i)).toBeInTheDocument()
    expect(screen.queryByTestId('canvas-image')).not.toBeInTheDocument()
  })

  it('renders the image preview when an image is loaded', () => {
    renderCanvas({ image: mockImage })
    const img = screen.getByTestId('canvas-image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', mockImage.preview)
  })

  it('applies zoom to the image dimensions', () => {
    renderCanvas({ image: mockImage, zoom: 2 })
    const img = screen.getByTestId('canvas-image')
    expect(img).toHaveAttribute('width', '1600')
    expect(img).toHaveAttribute('height', '1200')
  })

  it('does not show CropOverlay when mode is idle', () => {
    renderCanvas({ image: mockImage })
    expect(screen.queryByLabelText(/crop selection/i)).not.toBeInTheDocument()
  })

  it('shows CropOverlay when mode is cropping', () => {
    renderCanvas({ image: mockImage, mode: 'cropping' })
    expect(screen.getByLabelText(/crop selection/i)).toBeInTheDocument()
  })

  it('shows recent files in empty state', () => {
    renderCanvas({ recentFiles: ['/home/user/photo.jpg', '/home/user/other.png'] })
    expect(screen.getByText('photo.jpg')).toBeInTheDocument()
    expect(screen.getByText('other.png')).toBeInTheDocument()
  })

  it('clicking a recent file calls onOpenByPaths and shows spinner', () => {
    const onOpenByPaths = vi.fn()
    renderCanvas({ recentFiles: ['/home/user/photo.jpg'], onOpenByPaths, isLoading: false })
    const btn = screen.getByTitle('/home/user/photo.jpg')
    fireEvent.click(btn)
    expect(onOpenByPaths).toHaveBeenCalledWith(['/home/user/photo.jpg'])
    expect(btn.querySelector('.animate-spin')).toBeTruthy()
  })

  it('recent file buttons are disabled while isLoading', () => {
    renderCanvas({ recentFiles: ['/home/user/photo.jpg'], isLoading: true })
    expect(screen.getByTitle('/home/user/photo.jpg')).toBeDisabled()
  })
})
