import { vi } from 'vitest'
import type { ImageMeta } from '../../types'

export const mockImageMeta: ImageMeta = {
  width: 800,
  height: 600,
  format: 'png',
  preview:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  canUndo: false,
  canRedo: false,
}

export const mockOpenImage = vi.fn().mockResolvedValue(mockImageMeta)
export const mockCropImage = vi.fn().mockResolvedValue({ ...mockImageMeta, canUndo: true })
export const mockRotateImage = vi.fn().mockResolvedValue({ ...mockImageMeta, canUndo: true })
export const mockExportImage = vi.fn().mockResolvedValue(undefined)
export const mockUndoImage = vi.fn().mockResolvedValue(mockImageMeta)
export const mockRedoImage = vi.fn().mockResolvedValue(mockImageMeta)

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((command: string) => {
    switch (command) {
      case 'open_image':
        return mockOpenImage()
      case 'crop_image':
        return mockCropImage()
      case 'rotate_image':
        return mockRotateImage()
      case 'export_image':
        return mockExportImage()
      case 'undo_image':
        return mockUndoImage()
      case 'redo_image':
        return mockRedoImage()
      default:
        return Promise.reject(new Error(`Unknown command: ${command}`))
    }
  }),
}))
