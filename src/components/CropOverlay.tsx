import { useEffect, useRef } from 'react'
import { useCrop } from '../hooks/useCrop'
import type { CropRect } from '../types'

interface CropOverlayProps {
  imageWidth: number
  imageHeight: number
  onApply: (rect: CropRect) => void
  onCancel: () => void
  onCropRectChange?: (rect: CropRect) => void
}

const HANDLE_SIZE = 8

export function CropOverlay({
  imageWidth,
  imageHeight,
  onApply,
  onCancel,
  onCropRectChange,
}: CropOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { cropRect, onPointerDown, onPointerMove, onPointerUp } = useCrop(imageWidth, imageHeight)

  // Keep a ref so the keyboard handler always reads the latest cropRect
  const cropRectRef = useRef(cropRect)
  useEffect(() => {
    cropRectRef.current = cropRect
    onCropRectChange?.(cropRect)
  }, [cropRect, onCropRectChange])

  // Enter = apply, Escape = cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onApply(cropRectRef.current)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onApply, onCancel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scaleX = canvas.offsetWidth / imageWidth
    const scaleY = canvas.offsetHeight / imageHeight

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Dimmed overlay
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Clear the crop region
    const cx = cropRect.x * scaleX
    const cy = cropRect.y * scaleY
    const cw = cropRect.width * scaleX
    const ch = cropRect.height * scaleY

    ctx.clearRect(cx, cy, cw, ch)

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(cx, cy, cw, ch)

    // Rule-of-thirds grid
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 0.5
    for (let i = 1; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(cx + (cw / 3) * i, cy)
      ctx.lineTo(cx + (cw / 3) * i, cy + ch)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy + (ch / 3) * i)
      ctx.lineTo(cx + cw, cy + (ch / 3) * i)
      ctx.stroke()
    }

    // Handles
    const handles = [
      [cx, cy],
      [cx + cw / 2, cy],
      [cx + cw, cy],
      [cx, cy + ch / 2],
      [cx + cw, cy + ch / 2],
      [cx, cy + ch],
      [cx + cw / 2, cy + ch],
      [cx + cw, cy + ch],
    ]

    ctx.fillStyle = '#fff'
    for (const [hx, hy] of handles) {
      ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    }
  }, [cropRect, imageWidth, imageHeight])

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Crop selection"
      />
    </div>
  )
}
