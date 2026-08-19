export interface ImageMeta {
  width: number
  height: number
  format: string
  preview: string
  canUndo: boolean
  canRedo: boolean
  filename?: string
  path?: string
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type EditorMode = 'idle' | 'cropping' | 'rotating' | 'eyedropper' | 'inpainting'

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'bmp' | 'tiff'

export interface HistoryEntry {
  label: string
}

export interface Tab {
  id: string
  label: string
  image: ImageMeta
  history: HistoryEntry[]
  historyIndex: number
  zoom: number
}
